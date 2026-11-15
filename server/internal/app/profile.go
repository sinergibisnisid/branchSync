package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	_ "image/jpeg" // format foto profil yang diterima: JPEG dan PNG
	_ "image/png"
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

// ---- Foto profil ----

const (
	avatarMaxBytes = 512 << 10 // setelah diperkecil di browser biasanya < 50 KB
	avatarMaxSide  = 1024
	avatarMinSide  = 32
)

// uploadAvatar menyimpan foto profil sendiri. Body: { image: "<base64>" } atau data URL
// ("data:image/jpeg;base64,…"). Hanya JPEG/PNG yang benar-benar bisa dibaca sebagai gambar yang diterima
// (bukan SVG/HTML), sehingga aman disajikan dari domain API.
func (s *Server) uploadAvatar(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Image string `json:"image"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	data := in.Image
	if i := strings.Index(data, ","); strings.HasPrefix(data, "data:") && i > 0 {
		data = data[i+1:]
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil || len(raw) == 0 {
		return failField(422, "avatar", "File foto tidak valid.")
	}
	if len(raw) > avatarMaxBytes {
		return failField(422, "avatar", "Ukuran foto maksimal 512 KB.")
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || (format != "jpeg" && format != "png") {
		return failField(422, "avatar", "Format foto tidak didukung. Gunakan JPG atau PNG.")
	}
	if cfg.Width < avatarMinSide || cfg.Height < avatarMinSide || cfg.Width > avatarMaxSide || cfg.Height > avatarMaxSide {
		return failField(422, "avatar", "Ukuran foto harus 32–1024 piksel per sisi.")
	}
	key := secret.Token()
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE users SET avatar = $2, avatar_type = $3, avatar_key = $4 WHERE id = $1`, u.ID, raw, "image/"+format, key); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Profil", "Mengubah foto profil", "", u.Name, nil)
	})
	if err != nil {
		return err
	}
	u.Avatar = key
	return s.me(w, r, u)
}

func (s *Server) deleteAvatar(w http.ResponseWriter, r *http.Request, u *User) error {
	if u.Avatar != "" {
		err := s.tx(r.Context(), func(tx pgx.Tx) error {
			if _, err := tx.Exec(r.Context(), `UPDATE users SET avatar = NULL, avatar_type = NULL, avatar_key = NULL WHERE id = $1`, u.ID); err != nil {
				return err
			}
			return audit(r.Context(), tx, u.Name, "Internal", "Profil", "Menghapus foto profil", "", u.Name, nil)
		})
		if err != nil {
			return err
		}
		u.Avatar = ""
	}
	return s.me(w, r, u)
}

// serveAvatar menyajikan foto tanpa login (tag <img> tidak bisa mengirim token). Kuncinya 256 bit acak
// dan berganti setiap unggahan, jadi URL tidak bisa ditebak dan boleh di-cache selamanya.
func (s *Server) serveAvatar(w http.ResponseWriter, r *http.Request) error {
	var raw []byte
	var typ string
	err := s.db.QueryRow(r.Context(), `SELECT avatar, avatar_type FROM users WHERE avatar_key = $1 AND avatar IS NOT NULL`, r.PathValue("key")).Scan(&raw, &typ)
	if errors.Is(err, pgx.ErrNoRows) {
		return errNotFound("Foto")
	}
	if err != nil {
		return err
	}
	h := w.Header()
	h.Set("Content-Type", typ)
	h.Set("Cache-Control", "public, max-age=31536000, immutable")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'")
	h.Set("Cross-Origin-Resource-Policy", "cross-origin")
	_, _ = w.Write(raw)
	return nil
}
