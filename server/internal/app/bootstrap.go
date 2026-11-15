package app

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// HashPassword: bcrypt cost 12.
func HashPassword(p string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(p), 12)
	return string(b), err
}

// collect menjalankan query dan memetakan tiap baris dengan fn.
func collect[T any](ctx context.Context, q dbtx, sql string, fn func(pgx.CollectableRow) (T, error), args ...any) ([]T, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, fn)
	if out == nil {
		out = []T{}
	}
	return out, err
}

// bootstrap: seluruh data workspace yang boleh dilihat pengguna (API.md › Memuat data).
func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request, u *User) error {
	ctx := r.Context()
	out := map[string]any{}
	var err error

	if out["locations"], err = collect(ctx, s.db, `SELECT `+locCols+` FROM locations ORDER BY code`, func(row pgx.CollectableRow) (*Location, error) {
		return scanLocation(row)
	}); err != nil {
		return err
	}
	type approval struct {
		ID        string     `json:"id"`
		Code      string     `json:"code"`
		Field     string     `json:"field"`
		Before    string     `json:"before"`
		After     string     `json:"after"`
		By        string     `json:"by"`
		Time      time.Time  `json:"time"`
		Status    string     `json:"status"`
		DecidedAt *time.Time `json:"decidedAt"`
		DecidedBy *string    `json:"decidedBy"`
	}
	if out["approvals"], err = collect(ctx, s.db, `SELECT id, code, field, before, after, by, time, status, decided_at, decided_by FROM approvals
		WHERE status = 'Menunggu' OR decided_at > now() - interval '180 days' ORDER BY time DESC`, pgx.RowToStructByPos[approval]); err != nil {
		return err
	}
	type claim struct {
		ID          string          `json:"id"`
		Kind        string          `json:"kind"`
		Code        *string         `json:"code"`
		Proposal    json.RawMessage `json:"proposal"`
		Status      string          `json:"status"`
		SubmittedAt time.Time       `json:"submittedAt"`
		ProcessedAt *time.Time      `json:"processedAt"`
		DoneAt      *time.Time      `json:"doneAt"`
		Note        string          `json:"note"`
	}
	if out["claims"], err = collect(ctx, s.db, `SELECT id, kind, code, coalesce(proposal, 'null'::jsonb), status, submitted_at, processed_at, done_at, note FROM claims
		WHERE status NOT IN ('Selesai','Ditolak') OR done_at > now() - interval '365 days' ORDER BY submitted_at DESC`, pgx.RowToStructByPos[claim]); err != nil {
		return err
	}
	type run struct {
		ID         string          `json:"id"`
		Time       time.Time       `json:"time"`
		Scope      string          `json:"scope"`
		By         string          `json:"by"`
		Total      int             `json:"total"`
		OK         int             `json:"ok"`
		Fail       int             `json:"fail"`
		Skip       int             `json:"skip"`
		DurationMs int             `json:"durationMs"`
		Items      json.RawMessage `json:"items"`
	}
	if out["runs"], err = collect(ctx, s.db, `SELECT id, time, scope, by, total, ok, fail, skip, duration_ms, items FROM runs ORDER BY time DESC LIMIT 600`, pgx.RowToStructByPos[run]); err != nil {
		return err
	}
	type auditRow struct {
		ID      int64           `json:"id"`
		Time    time.Time       `json:"time"`
		User    string          `json:"user"`
		Actor   string          `json:"actor"`
		Module  string          `json:"module"`
		Action  string          `json:"action"`
		Target  string          `json:"target"`
		Detail  string          `json:"detail"`
		Changes json.RawMessage `json:"changes"`
	}
	out["audit"] = []auditRow{}
	if u.Can("audit.read") {
		if out["audit"], err = collect(ctx, s.db, `SELECT id, time, "user", actor, module, action, target, detail, changes FROM audit ORDER BY id DESC LIMIT 3000`, pgx.RowToStructByPos[auditRow]); err != nil {
			return err
		}
	}
	type userRow struct {
		ID         int64      `json:"id"`
		Name       string     `json:"name"`
		Email      string     `json:"email"`
		Role       string     `json:"role"`
		Status     string     `json:"status"`
		LastActive *time.Time `json:"lastActive"`
		Avatar     *string    `json:"avatar"`
	}
	userSQL := `SELECT id, name, email, role, status, last_active, avatar_key FROM users WHERE id = $1 OR $2 ORDER BY id`
	if out["users"], err = collect(ctx, s.db, userSQL, pgx.RowToStructByPos[userRow], u.ID, u.Can("users.manage")); err != nil {
		return err
	}
	type role struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
	if out["roles"], err = collect(ctx, s.db, `SELECT name, permissions FROM roles ORDER BY name = 'Administrator' DESC, name`, pgx.RowToStructByPos[role]); err != nil {
		return err
	}
	g, err := s.loadGoogle(ctx)
	if err != nil {
		return err
	}
	out["api"] = g.apiJSON(s.cfg.GoogleClientSecret != "")
	if out["settings"], err = s.loadSettings(ctx, s.db); err != nil {
		return err
	}
	type account struct {
		ID        string  `json:"id"`
		Name      string  `json:"name"`
		Email     string  `json:"email"`
		AccountID *string `json:"accountId"`
	}
	if out["accounts"], err = collect(ctx, s.db, `SELECT id, name, email, account_id FROM accounts ORDER BY name`, pgx.RowToStructByPos[account]); err != nil {
		return err
	}
	type reply struct {
		Text string     `json:"text"`
		By   string     `json:"by"`
		Time *time.Time `json:"time"`
	}
	type review struct {
		ID     string    `json:"id"`
		Code   string    `json:"code"`
		Author string    `json:"author"`
		Rating int       `json:"rating"`
		Text   string    `json:"text"`
		Time   time.Time `json:"time"`
		Reply  *reply    `json:"reply"`
	}
	if out["reviews"], err = collect(ctx, s.db, `SELECT id, code, author, rating, text, time, reply_text, reply_by, reply_time FROM reviews ORDER BY time DESC LIMIT 20000`,
		func(row pgx.CollectableRow) (review, error) {
			var rv review
			var rt, rb *string
			var rtime *time.Time
			err := row.Scan(&rv.ID, &rv.Code, &rv.Author, &rv.Rating, &rv.Text, &rv.Time, &rt, &rb, &rtime)
			if rt != nil {
				rv.Reply = &reply{Text: *rt, By: deref(rb), Time: rtime}
			}
			return rv, err
		}); err != nil {
		return err
	}
	type schedule struct {
		ID         string          `json:"id"`
		Name       string          `json:"name"`
		Frequency  string          `json:"frequency"`
		Day        string          `json:"day"`
		Period     string          `json:"period"`
		Format     string          `json:"format"`
		Recipients []string        `json:"recipients"`
		Filters    json.RawMessage `json:"filters"`
		CreatedAt  time.Time       `json:"createdAt"`
	}
	if out["reportSchedules"], err = collect(ctx, s.db, `SELECT id, name, frequency, day, period, format, recipients, filters, created_at FROM report_schedules ORDER BY created_at`, pgx.RowToStructByPos[schedule]); err != nil {
		return err
	}
	type note struct {
		Text string    `json:"text"`
		By   string    `json:"by"`
		Time time.Time `json:"time"`
	}
	notes := map[string]note{}
	rows, err := s.db.Query(ctx, `SELECT code, field, text, by, time FROM disc_notes`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var code, field string
		var n note
		if err := rows.Scan(&code, &field, &n.Text, &n.By, &n.Time); err != nil {
			return err
		}
		notes[code+"|"+field] = n
	}
	if err := rows.Err(); err != nil {
		return err
	}
	out["discNotes"] = notes
	if out["dupIgnored"], err = collect(ctx, s.db, `SELECT a || '|' || b FROM dup_ignored`, pgx.RowTo[string]); err != nil {
		return err
	}
	writeJSON(w, 200, out)
	return nil
}
