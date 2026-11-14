package app

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"

	"branchsync/server/internal/secret"
)

// ---- Pembatas percobaan (login, OTP) ----

type limiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

func newLimiter() *limiter { return &limiter{hits: map[string][]time.Time{}} }

// recent: jumlah catatan key dalam jendela waktu (catatan lama dibuang).
func (l *limiter) recent(key string, window time.Duration) int {
	now := time.Now()
	keep := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < window {
			keep = append(keep, t)
		}
	}
	l.hits[key] = keep
	return len(keep)
}

func (l *limiter) record(key string) {
	if len(l.hits) > 50000 { // cegah pertumbuhan tanpa batas
		l.hits = map[string][]time.Time{}
	}
	l.hits[key] = append(l.hits[key], time.Now())
}

// allow: maksimal n permintaan per jendela waktu untuk key (setiap panggilan dihitung).
func (l *limiter) allow(key string, n int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.recent(key, window) >= n {
		return false
	}
	l.record(key)
	return true
}

// blocked/failed: hanya percobaan gagal yang dihitung (login yang berhasil tidak mengunci akun).
func (l *limiter) blocked(key string, n int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.recent(key, window) >= n
}

func (l *limiter) failed(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.record(key)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// ---- Sesi ----

const userCols = `u.id, u.name, u.email, u.role, u.status, coalesce(ro.permissions, '{}')`

func scanUser(row pgx.Row) (*User, error) {
	u := &User{}
	if err := row.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Status, &u.Perms); err != nil {
		return nil, err
	}
	u.perm = map[string]bool{}
	for _, p := range u.Perms {
		u.perm[p] = true
	}
	return u, nil
}

func (s *Server) authenticate(r *http.Request) (*User, error) {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return nil, fail(401, "Sesi tidak ditemukan. Silakan masuk.")
	}
	token := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	u, err := scanUser(s.db.QueryRow(r.Context(), `SELECT `+userCols+` FROM sessions se JOIN users u ON u.id = se.user_id LEFT JOIN roles ro ON ro.name = u.role
		WHERE se.token_hash = $1 AND se.expires_at > now() AND u.status = 'Aktif'`, secret.Hash(token)))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fail(401, "Sesi berakhir atau tidak valid. Silakan masuk kembali.")
	}
	if err != nil {
		return nil, err
	}
	// last_active diperbarui paling sering tiap 5 menit
	_, _ = s.db.Exec(r.Context(), `UPDATE users SET last_active = now() WHERE id = $1 AND (last_active IS NULL OR last_active < now() - interval '5 minutes')`, u.ID)
	return u, nil
}

func (s *Server) newSession(ctx context.Context, userID int64) (string, error) {
	token := secret.Token()
	_, err := s.db.Exec(ctx, `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, secret.Hash(token), userID, time.Now().Add(s.cfg.SessionTTL))
	if err == nil {
		_, _ = s.db.Exec(ctx, `UPDATE users SET last_active = now() WHERE id = $1`, userID)
	}
	return token, err
}

func (s *Server) userByID(ctx context.Context, id int64) (*User, error) {
	return scanUser(s.db.QueryRow(ctx, `SELECT `+userCols+` FROM users u LEFT JOIN roles ro ON ro.name = u.role WHERE u.id = $1`, id))
}

// signIn membuat sesi dan respons { token, user }.
func (s *Server) signIn(ctx context.Context, w http.ResponseWriter, u *User, how string) error {
	token, err := s.newSession(ctx, u.ID)
	if err != nil {
		return err
	}
	_ = audit(ctx, s.db, u.Name, "Internal", "Dashboard", "Masuk ke workspace", "", how, nil)
	writeJSON(w, 200, map[string]any{"token": token, "user": u})
	return nil
}

// dummyHash dipakai saat pengguna tidak ada, supaya waktu respons sama (tidak membocorkan keberadaan akun).
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("branchsync-dummy-password"), bcrypt.DefaultCost)

func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	var in struct{ Username, Password string }
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Username = strings.TrimSpace(in.Username)
	if in.Username == "" || in.Password == "" {
		return fail(400, "Isi nama pengguna dan kata sandi.")
	}
	userKey := "login:" + strings.ToLower(in.Username)
	if !s.limiter.allow("login:"+clientIP(r), 60, 15*time.Minute) || s.limiter.blocked(userKey, 8, 15*time.Minute) {
		return fail(429, "Terlalu banyak percobaan masuk yang gagal. Coba lagi dalam 15 menit.")
	}
	var hash *string
	u := &User{}
	err := s.db.QueryRow(r.Context(), `SELECT `+userCols+`, u.password_hash FROM users u LEFT JOIN roles ro ON ro.name = u.role
		WHERE lower(u.username) = lower($1) OR lower(u.email) = lower($1) LIMIT 1`, in.Username).
		Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Status, &u.Perms, &hash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if hash == nil || *hash == "" {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(in.Password))
		s.limiter.failed(userKey)
		return fail(401, "Nama pengguna atau kata sandi salah.")
	}
	if bcrypt.CompareHashAndPassword([]byte(*hash), []byte(in.Password)) != nil {
		s.limiter.failed(userKey)
		return fail(401, "Nama pengguna atau kata sandi salah.")
	}
	if u.Status != "Aktif" {
		return fail(403, "Akun Anda dinonaktifkan. Hubungi administrator.")
	}
	u, err = s.userByID(r.Context(), u.ID)
	if err != nil {
		return err
	}
	return s.signIn(r.Context(), w, u, "Kata sandi")
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, u *User) error {
	writeJSON(w, 200, u)
	return nil
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request, u *User) error {
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	_, err := s.db.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash = $1`, secret.Hash(token))
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// ---- OTP email ----

func (s *Server) otpRequest(w http.ResponseWriter, r *http.Request) error {
	var in struct{ Email string }
	if err := decode(r, &in); err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if !emailRe.MatchString(email) {
		return fail(400, "Alamat email tidak valid.")
	}
	if !s.limiter.allow("otp:"+clientIP(r), 20, time.Hour) || !s.limiter.allow("otp:"+email, 5, 15*time.Minute) {
		return fail(429, "Terlalu banyak permintaan kode. Coba lagi nanti.")
	}
	var name string
	err := s.db.QueryRow(r.Context(), `SELECT name FROM users WHERE lower(email) = $1 AND status = 'Aktif'`, email).Scan(&name)
	if err == nil {
		n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
		code := fmt.Sprintf("%06d", n.Int64())
		if _, err := s.db.Exec(r.Context(), `INSERT INTO otp_codes (email, code_hash, expires_at, attempts) VALUES ($1,$2,$3,0)
			ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
			email, secret.Hash(email+":"+code), time.Now().Add(10*time.Minute)); err != nil {
			return err
		}
		if s.cfg.Dev {
			s.log.Info("kode OTP (BS_DEV)", "email", email, "code", code)
		}
		body := fmt.Sprintf("Halo %s,\n\nKode masuk BranchSync Anda: %s\nKode berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun.\n\nJika Anda tidak meminta kode ini, abaikan email ini.", name, code)
		if err := s.mail.Send(r.Context(), []string{email}, "Kode masuk BranchSync: "+code, body); err != nil {
			s.log.Error("kirim OTP gagal", "err", err)
			return fail(502, "Kode tidak dapat dikirim karena layanan email bermasalah. Coba lagi nanti.")
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	// Respons sama untuk email terdaftar maupun tidak (tidak membocorkan daftar pengguna).
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) otpVerify(w http.ResponseWriter, r *http.Request) error {
	var in struct{ Email, Code string }
	if err := decode(r, &in); err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if !s.limiter.allow("otpv:"+clientIP(r), 30, 15*time.Minute) {
		return fail(429, "Terlalu banyak percobaan. Coba lagi nanti.")
	}
	var hash []byte
	var expires time.Time
	var attempts int
	err := s.db.QueryRow(r.Context(), `UPDATE otp_codes SET attempts = attempts + 1 WHERE email = $1 RETURNING code_hash, expires_at, attempts`, email).Scan(&hash, &expires, &attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail(401, "Kode tidak valid. Minta kode baru.")
	}
	if err != nil {
		return err
	}
	if attempts > 5 || time.Now().After(expires) {
		_, _ = s.db.Exec(r.Context(), `DELETE FROM otp_codes WHERE email = $1`, email)
		return fail(401, "Kode sudah kedaluwarsa atau terlalu banyak percobaan. Minta kode baru.")
	}
	if !constantEq(string(hash), string(secret.Hash(email+":"+strings.TrimSpace(in.Code)))) {
		return fail(401, "Kode tidak sesuai.")
	}
	_, _ = s.db.Exec(r.Context(), `DELETE FROM otp_codes WHERE email = $1`, email)
	var id int64
	if err := s.db.QueryRow(r.Context(), `SELECT id FROM users WHERE lower(email) = $1 AND status = 'Aktif'`, email).Scan(&id); err != nil {
		return fail(401, "Akun tidak aktif.")
	}
	u, err := s.userByID(r.Context(), id)
	if err != nil {
		return err
	}
	return s.signIn(r.Context(), w, u, "Kode OTP email")
}

// ---- OAuth Google ----

// oauthConfig mengembalikan konfigurasi OAuth dari env atau dari Integrasi Google.
func (s *Server) oauthConfig(ctx context.Context, redirectPath string, scopes []string) (*oauth2.Config, error) {
	id, sec := s.cfg.GoogleClientID, s.cfg.GoogleClientSecret
	if id == "" || sec == "" {
		gc, err := s.loadGoogle(ctx)
		if err != nil {
			return nil, err
		}
		id = gc.Data.ClientID
		if gc.secretEnc != nil {
			if sec, err = s.box.Open(gc.secretEnc); err != nil {
				return nil, err
			}
		}
	}
	if id == "" || sec == "" {
		return nil, fail(409, "OAuth Client ID dan Client Secret Google belum diatur di Integrasi Google.")
	}
	return &oauth2.Config{
		ClientID: id, ClientSecret: sec, Scopes: scopes,
		Endpoint:    oauth2.Endpoint{AuthURL: s.cfg.Google.AuthURL, TokenURL: s.cfg.Google.TokenURL, AuthStyle: oauth2.AuthStyleInParams},
		RedirectURL: s.cfg.PublicURL + redirectPath,
	}, nil
}

func (s *Server) newOAuthState(ctx context.Context, kind, redirectURI string, userID *int64) (string, error) {
	state := secret.Token()
	_, err := s.db.Exec(ctx, `INSERT INTO oauth_states (state, kind, redirect_uri, user_id, expires_at) VALUES ($1,$2,$3,$4,$5)`,
		state, kind, redirectURI, userID, time.Now().Add(10*time.Minute))
	return state, err
}

func (s *Server) takeOAuthState(ctx context.Context, state, kind string) (redirectURI string, userID *int64, err error) {
	err = s.db.QueryRow(ctx, `DELETE FROM oauth_states WHERE state = $1 AND kind = $2 AND expires_at > now() RETURNING redirect_uri, user_id`, state, kind).Scan(&redirectURI, &userID)
	return
}

// redirectWith mengarahkan kembali ke frontend dengan hasil di fragment (#bs_token=… dst.).
func redirectWith(w http.ResponseWriter, r *http.Request, redirectURI string, kv ...string) {
	v := url.Values{}
	for i := 0; i+1 < len(kv); i += 2 {
		v.Set(kv[i], kv[i+1])
	}
	http.Redirect(w, r, redirectURI+"#"+v.Encode(), http.StatusFound)
}

func (s *Server) googleLoginStart(w http.ResponseWriter, r *http.Request) error {
	redirect := r.URL.Query().Get("redirect_uri")
	if !s.cfg.RedirectAllowed(redirect) {
		return fail(400, "redirect_uri tidak diizinkan. Tambahkan origin aplikasi ke BS_ALLOWED_ORIGINS.")
	}
	oc, err := s.oauthConfig(r.Context(), "/auth/google/callback", []string{"openid", "email", "profile"})
	if err != nil {
		var he *httpError
		if errors.As(err, &he) {
			redirectWith(w, r, redirect, "bs_error", he.Message)
			return nil
		}
		return err
	}
	state, err := s.newOAuthState(r.Context(), "login", redirect, nil)
	if err != nil {
		return err
	}
	http.Redirect(w, r, oc.AuthCodeURL(state, oauth2.SetAuthURLParam("prompt", "select_account")), http.StatusFound)
	return nil
}

func (s *Server) googleLoginCallback(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	redirect, _, err := s.takeOAuthState(r.Context(), q.Get("state"), "login")
	if err != nil {
		return fail(400, "Sesi login Google kedaluwarsa. Ulangi dari halaman BranchSync.")
	}
	if e := q.Get("error"); e != "" {
		redirectWith(w, r, redirect, "bs_error", "Login dibatalkan ("+e+").")
		return nil
	}
	oc, err := s.oauthConfig(r.Context(), "/auth/google/callback", []string{"openid", "email", "profile"})
	if err != nil {
		redirectWith(w, r, redirect, "bs_error", err.Error())
		return nil
	}
	ctx := context.WithValue(r.Context(), oauth2.HTTPClient, s.http)
	tok, err := oc.Exchange(ctx, q.Get("code"))
	if err != nil {
		redirectWith(w, r, redirect, "bs_error", "Google menolak kode login.")
		return nil
	}
	email, verified, err := s.googleEmail(ctx, oc, tok)
	if err != nil || !verified {
		redirectWith(w, r, redirect, "bs_error", "Email Google tidak dapat diverifikasi.")
		return nil
	}
	var id int64
	err = s.db.QueryRow(r.Context(), `SELECT id FROM users WHERE lower(email) = lower($1) AND status = 'Aktif'`, email).Scan(&id)
	if err != nil {
		redirectWith(w, r, redirect, "bs_error", "Email "+email+" belum terdaftar sebagai pengguna BranchSync.")
		return nil
	}
	token, err := s.newSession(r.Context(), id)
	if err != nil {
		return err
	}
	if u, err := s.userByID(r.Context(), id); err == nil {
		_ = audit(r.Context(), s.db, u.Name, "Internal", "Dashboard", "Masuk ke workspace", "", "Google", nil)
	}
	redirectWith(w, r, redirect, "bs_token", token)
	return nil
}

func (s *Server) googleEmail(ctx context.Context, oc *oauth2.Config, tok *oauth2.Token) (string, bool, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.Google.UserInfoURL, nil)
	res, err := oc.Client(ctx, tok).Do(req)
	if err != nil {
		return "", false, err
	}
	defer res.Body.Close()
	var info struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if res.StatusCode != 200 {
		return "", false, fmt.Errorf("userinfo HTTP %d", res.StatusCode)
	}
	if err := json.NewDecoder(res.Body).Decode(&info); err != nil {
		return "", false, err
	}
	return info.Email, info.EmailVerified, nil
}
