package app

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"branchsync/server/internal/gbp"
)

// ---- Pengguna ----

type userInput struct {
	Name     *string `json:"name"`
	Email    *string `json:"email"`
	Username *string `json:"username"`
	Role     *string `json:"role"`
	Status   *string `json:"status"`
	Password *string `json:"password"`
}

func (s *Server) roleExists(ctx context.Context, q dbtx, name string) error {
	var ok bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM roles WHERE name = $1)`, name).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return fail(422, "Peran %q tidak dikenal.", name)
	}
	return nil
}

func validPassword(p string) error {
	if utf8.RuneCountInString(p) < 10 {
		return fail(422, "Kata sandi minimal 10 karakter.")
	}
	return nil
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request, u *User) error {
	var in userInput
	if err := decode(r, &in); err != nil {
		return err
	}
	name, email, role, status := strings.TrimSpace(deref(in.Name)), strings.ToLower(strings.TrimSpace(deref(in.Email))), deref(in.Role), deref(in.Status)
	if status == "" {
		status = "Aktif"
	}
	if name == "" || !emailRe.MatchString(email) {
		return fail(422, "Nama dan email yang valid wajib diisi.")
	}
	if status != "Aktif" && status != "Nonaktif" {
		return fail(422, "Status pengguna tidak valid.")
	}
	var hash *string
	if in.Password != nil && *in.Password != "" {
		if err := validPassword(*in.Password); err != nil {
			return err
		}
		h, err := HashPassword(*in.Password)
		if err != nil {
			return err
		}
		hash = &h
	}
	var username *string
	if v := strings.TrimSpace(deref(in.Username)); v != "" {
		username = &v
	}
	var id int64
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		if err := s.roleExists(r.Context(), tx, role); err != nil {
			return err
		}
		var taken bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = $1)`, email).Scan(&taken); err != nil {
			return err
		}
		if taken {
			return fail(409, "Email %s sudah terdaftar.", email)
		}
		if err := tx.QueryRow(r.Context(), `INSERT INTO users (name, email, username, role, status, password_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			name, email, username, role, status, hash).Scan(&id); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Pengguna & Akses", "Menambahkan pengguna", "", name+" ("+role+")", nil)
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]int64{"id": id})
	return nil
}

func (s *Server) updateUser(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		return errNotFound("Pengguna")
	}
	var in userInput
	if err := decode(r, &in); err != nil {
		return err
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		var name, email, role, status string
		var username *string
		err := tx.QueryRow(r.Context(), `SELECT name, email, username, role, status FROM users WHERE id = $1 FOR UPDATE`, id).Scan(&name, &email, &username, &role, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound("Pengguna")
		}
		if err != nil {
			return err
		}
		var changes []Change
		set := func(field string, cur *string, v *string, norm func(string) string) {
			if v == nil {
				return
			}
			nv := norm(*v)
			if nv != *cur {
				changes = append(changes, Change{field, *cur, nv})
				*cur = nv
			}
		}
		set("name", &name, in.Name, strings.TrimSpace)
		set("email", &email, in.Email, func(x string) string { return strings.ToLower(strings.TrimSpace(x)) })
		set("role", &role, in.Role, strings.TrimSpace)
		set("status", &status, in.Status, strings.TrimSpace)
		if in.Username != nil {
			v := strings.TrimSpace(*in.Username)
			if v != deref(username) {
				changes = append(changes, Change{"username", deref(username), v})
				if v == "" {
					username = nil
				} else {
					username = &v
				}
			}
		}
		if name == "" || !emailRe.MatchString(email) || (status != "Aktif" && status != "Nonaktif") {
			return fail(422, "Nama, email, atau status tidak valid.")
		}
		if err := s.roleExists(r.Context(), tx, role); err != nil {
			return err
		}
		if id == u.ID && (status != "Aktif" || !slices.Contains(s.rolePerms(r.Context(), tx, role), "users.manage")) {
			return fail(409, "Anda tidak dapat menonaktifkan atau menurunkan hak akses akun Anda sendiri.")
		}
		var hash *string
		if in.Password != nil && *in.Password != "" {
			if err := validPassword(*in.Password); err != nil {
				return err
			}
			h, err := HashPassword(*in.Password)
			if err != nil {
				return err
			}
			hash = &h
			changes = append(changes, Change{"Kata sandi", "••••", "•••• (baru)"})
		}
		if len(changes) == 0 {
			return nil
		}
		if _, err := tx.Exec(r.Context(), `UPDATE users SET name=$2, email=$3, username=$4, role=$5, status=$6, password_hash = coalesce($7, password_hash) WHERE id=$1`,
			id, name, email, username, role, status, hash); err != nil {
			return err
		}
		if status != "Aktif" || hash != nil {
			if _, err := tx.Exec(r.Context(), `DELETE FROM sessions WHERE user_id = $1`, id); err != nil { // paksa keluar
				return err
			}
		}
		if err := s.ensureAdmin(r.Context(), tx); err != nil {
			return err
		}
		action := "Memperbarui pengguna"
		if len(changes) == 1 && changes[0].Field == "status" {
			action = map[string]string{"Aktif": "Mengaktifkan pengguna", "Nonaktif": "Menonaktifkan pengguna"}[status]
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Pengguna & Akses", action, "", name, changes)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

func (s *Server) rolePerms(ctx context.Context, q dbtx, role string) []string {
	var p []string
	_ = q.QueryRow(ctx, `SELECT permissions FROM roles WHERE name = $1`, role).Scan(&p)
	return p
}

// ensureAdmin mencegah workspace terkunci: harus ada minimal satu pengguna aktif yang bisa mengelola pengguna.
func (s *Server) ensureAdmin(ctx context.Context, q dbtx) error {
	var n int
	if err := q.QueryRow(ctx, `SELECT count(*) FROM users u JOIN roles r ON r.name = u.role WHERE u.status = 'Aktif' AND 'users.manage' = ANY(r.permissions)`).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return fail(409, "Perubahan ditolak: harus ada minimal satu pengguna aktif dengan izin mengelola pengguna.")
	}
	return nil
}

// ---- Peran ----

func validPerms(ps []string) error {
	for _, p := range ps {
		if !slices.Contains(Perms, p) {
			return fail(422, "Izin %q tidak dikenal.", p)
		}
	}
	return nil
}

func (s *Server) createRole(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 40 {
		return fail(422, "Nama peran wajib diisi (maks. 40 karakter).")
	}
	if in.Permissions == nil {
		in.Permissions = []string{}
	}
	if err := validPerms(in.Permissions); err != nil {
		return err
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `INSERT INTO roles (name, permissions) VALUES ($1,$2)`, in.Name, in.Permissions); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Pengguna & Akses", "Menambahkan peran", "", in.Name, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusCreated)
	}
	return err
}

func (s *Server) updateRole(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Name        *string   `json:"name"`
		Permissions *[]string `json:"permissions"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	name := r.PathValue("name")
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		cur := s.rolePerms(r.Context(), tx, name)
		if cur == nil {
			var ok bool
			_ = tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM roles WHERE name = $1)`, name).Scan(&ok)
			if !ok {
				return errNotFound("Peran " + name)
			}
		}
		if in.Permissions != nil {
			if err := validPerms(*in.Permissions); err != nil {
				return err
			}
			if _, err := tx.Exec(r.Context(), `UPDATE roles SET permissions = $2 WHERE name = $1`, name, *in.Permissions); err != nil {
				return err
			}
			for _, p := range Perms {
				had, has := slices.Contains(cur, p), slices.Contains(*in.Permissions, p)
				if had != has {
					action := "Memberi izin"
					if had {
						action = "Mencabut izin"
					}
					if err := audit(r.Context(), tx, u.Name, "Internal", "Pengguna & Akses", action, "", name+": "+p, nil); err != nil {
						return err
					}
				}
			}
		}
		if in.Name != nil && strings.TrimSpace(*in.Name) != name {
			nn := strings.TrimSpace(*in.Name)
			if nn == "" || len(nn) > 40 {
				return fail(422, "Nama peran wajib diisi (maks. 40 karakter).")
			}
			if _, err := tx.Exec(r.Context(), `UPDATE roles SET name = $2 WHERE name = $1`, name, nn); err != nil { // users.role ikut (ON UPDATE CASCADE)
				return err
			}
			if err := audit(r.Context(), tx, u.Name, "Internal", "Pengguna & Akses", "Mengubah nama peran", "", name+" → "+nn, nil); err != nil {
				return err
			}
		}
		return s.ensureAdmin(r.Context(), tx)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// ---- Pengaturan ----

type settingsData struct {
	Workspace   string  `json:"workspace"`
	Timezone    string  `json:"timezone"`
	SLAInternal float64 `json:"slaInternal"`
	SLAGoogle   float64 `json:"slaGoogle"`
	DupRadius   float64 `json:"dupRadius"`
	CoordTol    float64 `json:"coordTol"`
}

func (s *Server) loadSettings(ctx context.Context, q dbtx) (settingsData, error) {
	var st settingsData
	err := q.QueryRow(ctx, `SELECT data FROM settings WHERE id = 1`).Scan(&st)
	return st, err
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request, u *User) error {
	var in settingsData
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Workspace = strings.TrimSpace(in.Workspace)
	switch {
	case in.Workspace == "" || len(in.Workspace) > 80:
		return fail(422, "Nama workspace wajib diisi (maks. 80 karakter).")
	case in.SLAInternal < 1 || in.SLAInternal > 720:
		return fail(422, "SLA internal harus 1–720 jam.")
	case in.SLAGoogle < 1 || in.SLAGoogle > 2000:
		return fail(422, "Acuan Google harus 1–2000 jam.")
	case in.DupRadius < 10 || in.DupRadius > 2000:
		return fail(422, "Radius duplikat harus 10–2000 m.")
	case in.CoordTol < 5 || in.CoordTol > 2000:
		return fail(422, "Toleransi koordinat harus 5–2000 m.")
	}
	if _, err := time.LoadLocation(in.Timezone); err != nil || in.Timezone == "" {
		return fail(422, "Zona waktu tidak dikenal.")
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		cur, err := s.loadSettings(r.Context(), tx)
		if err != nil {
			return err
		}
		var changes []Change
		add := func(f, a, b string) {
			if a != b {
				changes = append(changes, Change{f, a, b})
			}
		}
		n := func(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
		add("workspace", cur.Workspace, in.Workspace)
		add("timezone", cur.Timezone, in.Timezone)
		add("slaInternal", n(cur.SLAInternal), n(in.SLAInternal))
		add("slaGoogle", n(cur.SLAGoogle), n(in.SLAGoogle))
		add("dupRadius", n(cur.DupRadius), n(in.DupRadius))
		add("coordTol", n(cur.CoordTol), n(in.CoordTol))
		if len(changes) == 0 {
			return nil
		}
		if _, err := tx.Exec(r.Context(), `UPDATE settings SET data = $1 WHERE id = 1`, in); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Pengaturan", "Mengubah pengaturan", "", "", changes)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// ---- Ulasan ----

const replyMax = 4096

type reviewRow struct {
	ID, Code   string
	GoogleName *string
	Author     string
	Rating     int
	ReplyText  *string
}

func (s *Server) loadReview(ctx context.Context, id string) (*reviewRow, error) {
	rv := &reviewRow{}
	err := s.db.QueryRow(ctx, `SELECT id, code, google_name, author, rating, reply_text FROM reviews WHERE id = $1`, id).
		Scan(&rv.ID, &rv.Code, &rv.GoogleName, &rv.Author, &rv.Rating, &rv.ReplyText)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound("Ulasan " + id)
	}
	return rv, err
}

func (s *Server) replyReview(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct{ Text string }
	if err := decode(r, &in); err != nil {
		return err
	}
	text := strings.TrimSpace(in.Text)
	if text == "" {
		return fail(422, "Balasan tidak boleh kosong.")
	}
	if utf8.RuneCountInString(text) > replyMax {
		return fail(422, "Balasan maksimal 4.096 karakter.")
	}
	rv, err := s.loadReview(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	if rv.GoogleName == nil {
		return fail(409, "Ulasan ini tidak terhubung ke Google.")
	}
	c, err := s.gbpClient(r.Context())
	if err != nil {
		return err
	}
	if err := c.UpdateReply(r.Context(), *rv.GoogleName, text); err != nil {
		return fail(502, "Balasan gagal dikirim ke Google: %s", errMsg(err))
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE reviews SET reply_text = $2, reply_by = $3, reply_time = now() WHERE id = $1`, rv.ID, text, u.Name); err != nil {
			return err
		}
		action := "Membalas ulasan"
		if rv.ReplyText != nil {
			action = "Mengubah balasan ulasan"
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Ulasan", action, rv.Code, rv.Author+" · "+strconv.Itoa(rv.Rating)+"★",
			[]Change{{"Balasan", deref(rv.ReplyText), text}})
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

func (s *Server) deleteReply(w http.ResponseWriter, r *http.Request, u *User) error {
	rv, err := s.loadReview(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	if rv.ReplyText == nil {
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	if rv.GoogleName != nil {
		c, err := s.gbpClient(r.Context())
		if err != nil {
			return err
		}
		if err := c.DeleteReply(r.Context(), *rv.GoogleName); err != nil {
			var ae *gbp.APIError
			if !errors.As(err, &ae) || ae.Status != 404 {
				return fail(502, "Balasan gagal dihapus di Google: %s", errMsg(err))
			}
		}
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE reviews SET reply_text = NULL, reply_by = NULL, reply_time = NULL WHERE id = $1`, rv.ID); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Ulasan", "Menghapus balasan ulasan", rv.Code, rv.Author+" · "+strconv.Itoa(rv.Rating)+"★",
			[]Change{{"Balasan", *rv.ReplyText, ""}})
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// pullReviews menyalin ulasan Google sebuah unit ke database; mengembalikan jumlah ulasan baru.
func (s *Server) pullReviews(ctx context.Context, c *gbp.Client, code string) (int, error) {
	var gbpName, account *string
	err := s.db.QueryRow(ctx, `SELECT l.gbp_name, a.account_id FROM locations l LEFT JOIN accounts a ON a.id = l.account_id WHERE l.code = $1`, code).Scan(&gbpName, &account)
	if err != nil || gbpName == nil || account == nil {
		return 0, err
	}
	list, err := c.ListReviews(ctx, *account, *gbpName)
	if err != nil {
		return 0, err
	}
	added := 0
	for _, g := range list {
		author := g.Reviewer.DisplayName
		if g.Reviewer.IsAnonymous || author == "" {
			author = "Pengguna Google"
		}
		var replyText *string
		var replyTime *time.Time
		if g.ReviewReply != nil {
			replyText, replyTime = &g.ReviewReply.Comment, &g.ReviewReply.UpdateTime
		}
		var inserted bool
		err := s.tx(ctx, func(tx pgx.Tx) error {
			id, err := nextID(ctx, tx, "review_seq", "RV-%06d")
			if err != nil {
				return err
			}
			err = tx.QueryRow(ctx, `INSERT INTO reviews (id, code, google_name, author, rating, text, time, reply_text, reply_by, reply_time)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8::text IS NULL THEN NULL ELSE 'Pemilik (Google)' END,$9)
				ON CONFLICT (google_name) DO UPDATE SET author = EXCLUDED.author, rating = EXCLUDED.rating, text = EXCLUDED.text,
					reply_text = EXCLUDED.reply_text, reply_time = EXCLUDED.reply_time,
					reply_by = CASE WHEN EXCLUDED.reply_text IS NULL THEN NULL WHEN reviews.reply_text IS NOT DISTINCT FROM EXCLUDED.reply_text THEN reviews.reply_by ELSE 'Pemilik (Google)' END
				RETURNING (xmax = 0)`, id, code, g.Name, author, gbp.Rating(g.StarRating), g.Comment, g.CreateTime, replyText, replyTime).Scan(&inserted)
			if err != nil || !inserted {
				return err
			}
			return audit(ctx, tx, author, "Eksternal", "Ulasan", "Ulasan baru masuk dari Google Maps", code, strconv.Itoa(gbp.Rating(g.StarRating))+"★", nil)
		})
		if err != nil {
			return added, err
		}
		if inserted {
			added++
		}
	}
	return added, nil
}
