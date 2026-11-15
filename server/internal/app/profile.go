package app

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"branchsync/server/internal/secret"
)

// ---- Profil: akun yang sedang masuk (tanpa izin khusus) ----

// profile = data sesi (/me) ditambah username dan apakah akun punya kata sandi.
type profile struct {
	*User
	Username    string `json:"username"`
	HasPassword bool   `json:"hasPassword"`
}

func (s *Server) loadProfile(ctx context.Context, u *User) (profile, error) {
	p := profile{User: u}
	err := s.db.QueryRow(ctx, `SELECT coalesce(username, ''), coalesce(password_hash, '') <> '' FROM users WHERE id = $1`, u.ID).
		Scan(&p.Username, &p.HasPassword)
	return p, err
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, u *User) error {
	p, err := s.loadProfile(r.Context(), u)
	if err != nil {
		return err
	}
	writeJSON(w, 200, p)
	return nil
}

// updateProfile mengubah nama tampilan sendiri. Email, username, dan peran diatur Administrator
// (email dipakai untuk masuk dengan OTP/Google, peran menentukan izin).
func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Name *string `json:"name"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" || utf8.RuneCountInString(name) > 80 {
			return failField(422, "name", "Nama wajib diisi (maks. 80 karakter).")
		}
		if name != u.Name {
			err := s.tx(r.Context(), func(tx pgx.Tx) error {
				if _, err := tx.Exec(r.Context(), `UPDATE users SET name = $2 WHERE id = $1`, u.ID, name); err != nil {
					return err
				}
				return audit(r.Context(), tx, name, "Internal", "Profil", "Memperbarui profil", "", name, []Change{{"name", u.Name, name}})
			})
			if err != nil {
				return err
			}
			u.Name = name
		}
	}
	return s.me(w, r, u)
}

// changePassword mengganti kata sandi sendiri. Kata sandi saat ini wajib benar; sesi lain milik
// pengguna ini diputus, sesi yang sedang dipakai tetap aktif.
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Current string `json:"currentPassword"`
		New     string `json:"newPassword"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	key := "password:" + strconv.FormatInt(u.ID, 10)
	if s.limiter.blocked(key, 5, 15*time.Minute) {
		return fail(429, "Terlalu banyak percobaan yang gagal. Coba lagi dalam 15 menit.")
	}
	var hash string
	if err := s.db.QueryRow(r.Context(), `SELECT coalesce(password_hash, '') FROM users WHERE id = $1`, u.ID).Scan(&hash); err != nil {
		return err
	}
	if hash == "" {
		return fail(409, "Akun Anda belum memiliki kata sandi karena masuk dengan kode OTP atau Google. Minta Administrator untuk membuatkannya.")
	}
	// 422, bukan 401: 401 berarti sesi berakhir dan membuat frontend keluar dari workspace.
	if in.Current == "" {
		return failField(422, "currentPassword", "Isi kata sandi saat ini.")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Current)) != nil {
		s.limiter.failed(key)
		return failField(422, "currentPassword", "Kata sandi saat ini salah.")
	}
	if err := validPassword(in.New); err != nil {
		return failField(422, "newPassword", "%s", err.Error())
	}
	if in.New == in.Current {
		return failField(422, "newPassword", "Kata sandi baru harus berbeda dari kata sandi saat ini.")
	}
	h, err := HashPassword(in.New)
	if err != nil {
		return err
	}
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE users SET password_hash = $2 WHERE id = $1`, u.ID, h); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, u.ID, secret.Hash(token)); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Profil", "Mengubah kata sandi", "", u.Name, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}
