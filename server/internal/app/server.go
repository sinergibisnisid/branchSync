// Package app berisi HTTP API BranchSync (kontrak: ../../../API.md).
package app

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"branchsync/server/internal/config"
	"branchsync/server/internal/mail"
	"branchsync/server/internal/secret"
)

// Perms adalah daftar izin yang dikenal (sama dengan frontend).
var Perms = []string{"locations.read", "locations.write", "locations.import", "sync.run", "claims.manage", "approvals.decide", "reviews.reply", "audit.read", "users.manage", "settings.write"}

type Server struct {
	cfg     *config.Config
	db      *pgxpool.Pool
	box     *secret.Box
	mail    mail.Sender
	log     *slog.Logger
	limiter *limiter
	http    *http.Client // panggilan ke Google (token, userinfo)

	syncMu   sync.Mutex // hanya satu sinkronisasi berjalan
	jobs     sync.WaitGroup
	shutdown context.Context
	stop     context.CancelFunc
}

func New(cfg *config.Config, pool *pgxpool.Pool, sender mail.Sender, log *slog.Logger) (*Server, error) {
	box, err := secret.New(cfg.SecretKey)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Server{cfg: cfg, db: pool, box: box, mail: sender, log: log, limiter: newLimiter(),
		http: &http.Client{Timeout: 30 * time.Second}, shutdown: ctx, stop: cancel}, nil
}

// Close menghentikan job latar belakang dan menunggu hingga selesai.
func (s *Server) Close() { s.stop(); s.jobs.Wait() }

// background menjalankan fn di goroutine yang ikut berhenti saat Close.
func (s *Server) background(name string, fn func(ctx context.Context)) {
	s.jobs.Add(1)
	go func() {
		defer s.jobs.Done()
		defer func() {
			if r := recover(); r != nil {
				s.log.Error("job panik", "job", name, "err", r, "stack", string(debug.Stack()))
			}
		}()
		fn(s.shutdown)
	}()
}

// ---- Galat & JSON ----

type httpError struct {
	Status  int
	Message string
	Field   string // opsional: kolom formulir yang salah, agar frontend bisa menandainya
}

func (e *httpError) Error() string { return e.Message }

func fail(status int, format string, a ...any) error {
	return &httpError{Status: status, Message: fmt.Sprintf(format, a...)}
}

// failField: seperti fail, ditambah nama kolom formulir yang salah (dikirim sebagai "field").
func failField(status int, field, format string, a ...any) error {
	return &httpError{Status: status, Message: fmt.Sprintf(format, a...), Field: field}
}

var (
	errNotFound = func(what string) error { return fail(404, "%s tidak ditemukan.", what) }
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return fail(413, "Data yang dikirim terlalu besar.")
		}
		return fail(400, "Format data tidak valid: %s", err.Error())
	}
	return nil
}

// ---- Pengguna dalam konteks ----

type User struct {
	ID     int64           `json:"-"`
	Name   string          `json:"name"`
	Email  string          `json:"email"`
	Role   string          `json:"role"`
	Status string          `json:"-"`
	Perms  []string        `json:"permissions"`
	Avatar string          `json:"avatar,omitempty"` // kunci foto profil: GET /avatars/{avatar}
	perm   map[string]bool `json:"-"`
}

func (u *User) Can(p string) bool { return u != nil && u.perm[p] }

type handler func(w http.ResponseWriter, r *http.Request, u *User) error

type ctxKey int

const userKey ctxKey = 1

// ---- Routing ----

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	pub := func(pattern string, h func(w http.ResponseWriter, r *http.Request) error) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) { s.finish(w, r, h(w, r)) })
	}
	auth := func(pattern, perm string, h handler) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			u, err := s.authenticate(r)
			if err == nil && perm != "" && !u.Can(perm) {
				err = fail(403, "Peran %s tidak memiliki izin %s.", u.Role, perm)
			}
			if err == nil {
				err = h(w, r, u)
			}
			s.finish(w, r, err)
		})
	}

	pub("GET /health", s.health)
	pub("POST /auth/login", s.login)
	pub("POST /auth/otp/request", s.otpRequest)
	pub("POST /auth/otp/verify", s.otpVerify)
	pub("GET /auth/google/start", s.googleLoginStart)
	pub("GET /auth/google/callback", s.googleLoginCallback)
	pub("GET /integrations/google/oauth/start", s.gbpOAuthStartLegacy)
	pub("GET /integrations/google/oauth/callback", s.gbpOAuthCallback)
	pub("POST /integrations/google/pubsub", s.pubsubPush)

	auth("GET /me", "", s.me)
	auth("PATCH /me", "", s.updateProfile)
	auth("POST /me/password", "", s.changePassword)
	auth("PUT /me/avatar", "", s.uploadAvatar)
	auth("DELETE /me/avatar", "", s.deleteAvatar)
	pub("GET /avatars/{key}", s.serveAvatar)
	auth("POST /auth/logout", "", s.logout)
	auth("GET /bootstrap", "locations.read", s.bootstrap)

	auth("POST /locations", "locations.write", s.createLocation)
	auth("PATCH /locations/{code}", "locations.write", s.updateLocation)
	auth("DELETE /locations/{code}", "locations.write", s.deleteLocation)
	auth("POST /locations/bulk-delete", "locations.write", s.bulkDelete)
	auth("POST /locations/bulk-update", "locations.write", s.bulkUpdate)
	auth("POST /locations/import", "locations.import", s.importLocations)

	auth("POST /sync", "sync.run", s.runSync)
	auth("POST /sync/failures/resolve", "sync.run", s.resolveFailure)

	auth("POST /discrepancies/resolve", "locations.write", s.resolveDiscrepancy)
	auth("POST /discrepancies/resolve-bulk", "locations.write", s.resolveDiscrepancyBulk)
	auth("PUT /discrepancies/notes", "locations.write", s.discNote)
	auth("POST /duplicates/merge", "locations.write", s.mergeDuplicate)
	auth("POST /duplicates/ignore", "locations.write", s.ignoreDuplicate)

	auth("POST /claims", "claims.manage", s.createClaim)
	auth("POST /claims/{id}/advance", "claims.manage", s.advanceClaim)
	auth("POST /claims/{id}/reject", "claims.manage", s.rejectClaim)
	auth("POST /approvals/{id}/approve", "approvals.decide", s.approve)
	auth("POST /approvals/{id}/reject", "approvals.decide", s.rejectApproval)

	auth("POST /users", "users.manage", s.createUser)
	auth("PATCH /users/{id}", "users.manage", s.updateUser)
	auth("POST /roles", "users.manage", s.createRole)
	auth("PATCH /roles/{name}", "users.manage", s.updateRole)

	auth("PATCH /settings", "settings.write", s.updateSettings)
	auth("PUT /reviews/{id}/reply", "reviews.reply", s.replyReview)
	auth("DELETE /reviews/{id}/reply", "reviews.reply", s.deleteReply)

	auth("PATCH /integrations/google", "settings.write", s.updateGoogle)
	auth("POST /integrations/google/oauth/url", "settings.write", s.gbpOAuthURL)
	auth("POST /integrations/google/test", "settings.write", s.testGoogle)
	auth("POST /integrations/google/discover", "settings.write", s.discoverNow)

	auth("POST /reports/schedules", "settings.write", s.createSchedule)
	auth("DELETE /reports/schedules/{id}", "settings.write", s.deleteSchedule)

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		s.finish(w, r, fail(404, "Endpoint %s %s tidak dikenal.", r.Method, r.URL.Path))
	})
	return s.middleware(mux)
}

// finish menulis galat sebagai {"message": "..."}; galat tak terduga dicatat dan disamarkan.
func (s *Server) finish(w http.ResponseWriter, r *http.Request, err error) {
	if err == nil {
		return
	}
	var he *httpError
	if errors.As(err, &he) {
		body := map[string]string{"message": he.Message}
		if he.Field != "" {
			body["field"] = he.Field
		}
		writeJSON(w, he.Status, body)
		return
	}
	var pe *pgconn.PgError
	if errors.As(err, &pe) && pe.Code == "23505" {
		writeJSON(w, 409, map[string]string{"message": "Data dengan nilai yang sama sudah ada."})
		return
	}
	if errors.Is(err, context.Canceled) {
		return
	}
	s.log.Error("permintaan gagal", "method", r.Method, "path", r.URL.Path, "err", err)
	writeJSON(w, 500, map[string]string{"message": "Terjadi kesalahan di server. Silakan coba lagi."})
}

func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		defer func() {
			if rec := recover(); rec != nil {
				s.log.Error("panik", "err", rec, "stack", string(debug.Stack()))
				writeJSON(w, 500, map[string]string{"message": "Terjadi kesalahan di server."})
			}
		}()
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		if origin := r.Header.Get("Origin"); origin != "" && s.cfg.OriginAllowed(origin) {
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Vary", "Origin")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if bp := s.cfg.BasePath; bp != "" {
			if !strings.HasPrefix(r.URL.Path, bp+"/") && r.URL.Path != bp {
				writeJSON(w, 404, map[string]string{"message": "Endpoint tidak dikenal."})
				return
			}
			r.URL.Path = strings.TrimPrefix(r.URL.Path, bp)
			if r.URL.Path == "" {
				r.URL.Path = "/"
			}
		}
		limit := int64(2 << 20)
		if strings.HasSuffix(r.URL.Path, "/locations/import") {
			limit = 40 << 20
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		rw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(rw, r)
		if r.URL.Path != "/health" {
			s.log.Info("http", "method", r.Method, "path", r.URL.Path, "status", rw.status, "ms", time.Since(start).Milliseconds())
		}
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) { w.status = code; w.ResponseWriter.WriteHeader(code) }

func (s *Server) health(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		writeJSON(w, 503, map[string]string{"status": "degraded", "message": "Database tidak dapat dihubungi."})
		return nil
	}
	writeJSON(w, 200, map[string]string{"status": "ok", "version": config.Version})
	return nil
}

// ---- Database helpers ----

// dbtx: *pgxpool.Pool atau pgx.Tx.
type dbtx interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func (s *Server) tx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, s.db, fn)
}

// Change adalah satu baris sebelum/sesudah pada riwayat.
type Change struct {
	Field  string `json:"field"`
	Before string `json:"before"`
	After  string `json:"after"`
}

// audit mencatat perubahan ke tabel audit (wajib menurut API.md).
func audit(ctx context.Context, q dbtx, user, actor, module, action, target, detail string, changes []Change) error {
	if changes == nil {
		changes = []Change{}
	}
	b, _ := json.Marshal(changes)
	_, err := q.Exec(ctx, `INSERT INTO audit ("user", actor, module, action, target, detail, changes) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		user, actor, module, action, target, detail, b)
	return err
}

// nextID membuat ID berformat, mis. nextID(ctx, tx, "claim_seq", "KL-%04d").
func nextID(ctx context.Context, q dbtx, seq, format string) (string, error) {
	var n int64
	if err := q.QueryRow(ctx, "SELECT nextval('"+seq+"')").Scan(&n); err != nil {
		return "", err
	}
	return fmt.Sprintf(format, n), nil
}

func constantEq(a, b string) bool { return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }
