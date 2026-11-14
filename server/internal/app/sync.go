package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"branchsync/server/internal/gbp"
	"branchsync/server/internal/hours"
)

// Run: bentuk job sinkronisasi di API (lihat runs[] pada /bootstrap).
type Run struct {
	ID         string    `json:"id"`
	Time       time.Time `json:"time"`
	Scope      string    `json:"scope"`
	By         string    `json:"by"`
	Total      int       `json:"total"`
	OK         int       `json:"ok"`
	Fail       int       `json:"fail"`
	Skip       int       `json:"skip"`
	DurationMs int       `json:"durationMs"`
	Items      []RunItem `json:"items"`
}

type RunItem struct {
	Code     string `json:"code"`
	Status   string `json:"status"` // Gagal | Dilewati
	Reason   string `json:"reason"`
	Resolved bool   `json:"resolved"`
	Note     string `json:"note"`
}

// Sinkronisasi dengan unit lebih banyak dari ini berjalan di latar belakang (frontend menunggu maks. 15 detik).
const syncInlineMax = 15

func (s *Server) runSync(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Codes []string `json:"codes"`
		Retry bool     `json:"retry"`
		Label string   `json:"label"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if _, err := s.gbpClient(r.Context()); err != nil {
		return err
	}
	codes, err := s.syncTargets(r.Context(), in.Codes)
	if err != nil {
		return err
	}
	if len(codes) == 0 {
		return fail(422, "Tidak ada unit untuk disinkronkan.")
	}
	label := strings.TrimSpace(in.Label)
	if label == "" {
		label = "Semua unit"
	}
	if !s.syncMu.TryLock() {
		return fail(409, "Sinkronisasi lain sedang berjalan. Tunggu hingga selesai.")
	}
	if len(codes) <= syncInlineMax {
		defer s.syncMu.Unlock()
		run, err := s.syncCodes(r.Context(), codes, in.Retry, label, u.Name)
		if err != nil {
			return err
		}
		writeJSON(w, 200, run)
		return nil
	}
	s.background("sync", func(ctx context.Context) {
		defer s.syncMu.Unlock()
		if _, err := s.syncCodes(ctx, codes, in.Retry, label, u.Name); err != nil {
			s.log.Error("sinkronisasi latar belakang gagal", "err", err)
		}
	})
	// Tanpa field "ok": frontend menampilkan "Permintaan sinkronisasi diterima server."
	writeJSON(w, 202, map[string]any{"status": "running", "total": len(codes)})
	return nil
}

func (s *Server) syncTargets(ctx context.Context, codes []string) ([]string, error) {
	var rows pgx.Rows
	var err error
	if codes == nil {
		rows, err = s.db.Query(ctx, `SELECT code FROM locations ORDER BY code`)
	} else {
		rows, err = s.db.Query(ctx, `SELECT code FROM locations WHERE code = ANY($1) ORDER BY code`, codes)
	}
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// syncCodes menjalankan sinkronisasi dan menyimpan objek run.
func (s *Server) syncCodes(ctx context.Context, codes []string, retry bool, label, by string) (*Run, error) {
	c, err := s.gbpClient(ctx)
	if err != nil {
		return nil, err
	}
	start := time.Now()
	run := &Run{Time: start, Scope: label, By: by, Total: len(codes), Items: []RunItem{}}
	for _, code := range codes {
		if ctx.Err() != nil {
			break
		}
		status, reason := s.syncOne(ctx, c, code)
		switch status {
		case "Berhasil":
			run.OK++
		case "Gagal":
			run.Fail++
			run.Items = append(run.Items, RunItem{Code: code, Status: status, Reason: reason})
		default:
			run.Skip++
			run.Items = append(run.Items, RunItem{Code: code, Status: "Dilewati", Reason: reason, Resolved: true})
		}
	}
	run.DurationMs = int(time.Since(start).Milliseconds())
	err = s.tx(context.WithoutCancel(ctx), func(tx pgx.Tx) error {
		id, err := nextID(ctx, tx, "run_seq", "JOB-%04d")
		if err != nil {
			return err
		}
		run.ID = id
		items, _ := json.Marshal(run.Items)
		if _, err := tx.Exec(ctx, `INSERT INTO runs (id, time, scope, by, total, ok, fail, skip, duration_ms, items) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			run.ID, run.Time, run.Scope, run.By, run.Total, run.OK, run.Fail, run.Skip, run.DurationMs, items); err != nil {
			return err
		}
		// Kegagalan lama yang sekarang berhasil ditandai selesai.
		failed := map[string]bool{}
		for _, it := range run.Items {
			failed[it.Code] = true
		}
		var okCodes []string
		for _, c := range codes {
			if !failed[c] {
				okCodes = append(okCodes, c)
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE runs SET items = (SELECT jsonb_agg(CASE WHEN i->>'status' = 'Gagal' AND NOT (i->>'resolved')::bool AND i->>'code' = ANY($1)
				THEN i || jsonb_build_object('resolved', true, 'note', 'Berhasil pada ' || $2::text) ELSE i END) FROM jsonb_array_elements(items) i)
			WHERE id <> $2 AND jsonb_array_length(items) > 0`, okCodes, run.ID); err != nil {
			return err
		}
		action := "Menjalankan sinkronisasi"
		if retry {
			action = "Mencoba ulang sinkronisasi"
		}
		return audit(ctx, tx, by, "Internal", "Sync Monitor", action, run.ID, fmt.Sprintf("%s: %d berhasil, %d gagal, %d dilewati", label, run.OK, run.Fail, run.Skip), nil)
	})
	return run, err
}

// syncOne: kirim kolom yang berubah ke Google, lalu tarik kondisi terbaru. Mengembalikan Berhasil | Gagal | Dilewati.
func (s *Server) syncOne(ctx context.Context, c *gbp.Client, code string) (string, string) {
	l, err := getLocation(ctx, s.db, code, false)
	if err != nil {
		return "Gagal", "Unit tidak ditemukan"
	}
	if l.Status == "Tidak Aktif" {
		return "Dilewati", "Unit tidak aktif"
	}
	if l.GBP == "Duplikat" {
		return "Dilewati", "Ditandai sebagai duplikat"
	}
	if l.gbpName == nil {
		created, reason := s.createOnGoogle(ctx, c, l)
		if !created {
			return "Dilewati", reason
		}
		return "Berhasil", ""
	}
	// Perubahan dari Google/pengguna lain yang bertabrakan dengan perubahan Dashboard.
	upd, err := c.GetGoogleUpdated(ctx, *l.gbpName)
	if err != nil {
		return "Gagal", errMsg(err)
	}
	external := gbp.DiffFields(upd.DiffMask)
	if err := s.recordGoogleUpdates(ctx, l, &upd.Location, external, l.pending); err != nil {
		return "Gagal", errMsg(err)
	}
	var push, conflict []string
	for _, f := range l.pending {
		if slices.Contains(external, f) {
			conflict = append(conflict, FieldLabel[f])
		} else {
			push = append(push, f)
		}
	}
	if len(push) > 0 {
		loc, mask := gbp.ToGoogle(l.unit(), push)
		if _, err := c.PatchLocation(ctx, *l.gbpName, loc, mask); err != nil {
			return "Gagal", errMsg(err)
		}
	}
	if err := s.refreshFromGoogle(ctx, c, l, push); err != nil {
		return "Gagal", errMsg(err)
	}
	if len(conflict) > 0 {
		return "Gagal", "Konflik: " + strings.Join(conflict, ", ") + " juga diubah di Google — tinjau Persetujuan Edit"
	}
	if l.GBP == "Suspend" {
		return "Gagal", "Listing di-suspend Google — ajukan banding"
	}
	return "Berhasil", ""
}

func errMsg(err error) string {
	var ae *gbp.APIError
	if errors.As(err, &ae) {
		return ae.Message
	}
	var he *httpError
	if errors.As(err, &he) {
		return he.Message
	}
	return "Galat server: " + err.Error()
}

// createOnGoogle membuat listing baru di akun GBP unit (atau satu-satunya akun yang terhubung).
func (s *Server) createOnGoogle(ctx context.Context, c *gbp.Client, l *Location) (bool, string) {
	accountID := l.AccountID
	if accountID == nil {
		var only string
		var n int
		_ = s.db.QueryRow(ctx, `SELECT count(*), coalesce(min(id), '') FROM accounts WHERE account_id IS NOT NULL`).Scan(&n, &only)
		if n != 1 {
			return false, "Belum terhubung ke listing Google: isi kode unit sama dengan store code GBP, atau tentukan akun GBP unit ini"
		}
		accountID = &only
	}
	var account string
	if err := s.db.QueryRow(ctx, `SELECT account_id FROM accounts WHERE id = $1`, *accountID).Scan(&account); err != nil {
		return false, "Akun GBP unit tidak ditemukan"
	}
	loc, _ := gbp.ToGoogle(l.unit(), nil)
	created, err := c.CreateLocation(ctx, account, loc, "bs-"+l.Code)
	if err != nil {
		return false, errMsg(err)
	}
	snap, _ := json.Marshal(gbp.ToSnapshot(created, l.Lat, l.Lng))
	_, err = s.db.Exec(ctx, `UPDATE locations SET gbp_name = $2, account_id = $3, google = $4, gbp = 'Menunggu Verifikasi', status = 'Online', pending = '{}', last_sync = now() WHERE code = $1`,
		l.Code, created.Name, *accountID, snap)
	if err != nil {
		return false, err.Error()
	}
	return true, ""
}

// refreshFromGoogle memperbarui snapshot Google, status GBP, dan menandai kolom pushed sebagai terkirim.
func (s *Server) refreshFromGoogle(ctx context.Context, c *gbp.Client, l *Location, pushed []string) error {
	loc, err := c.GetLocation(ctx, *l.gbpName)
	if err != nil {
		return err
	}
	vom, err := c.VoiceOfMerchant(ctx, *l.gbpName)
	if err != nil {
		var ae *gbp.APIError
		if !errors.As(err, &ae) || ae.Status != 404 {
			return err
		}
		vom = nil
	}
	state := gbp.Status(vom, loc.Metadata)
	if state == "" {
		state = l.GBP
	}
	snap, _ := json.Marshal(gbp.ToSnapshot(loc, l.Lat, l.Lng))
	remaining := []string{}
	for _, f := range l.pending {
		if !slices.Contains(pushed, f) {
			remaining = append(remaining, f)
		}
	}
	status := l.Status
	if status == "Belum Sync" || status == "Offline" {
		status = "Online"
	}
	if loc.OpenInfo != nil && strings.HasPrefix(loc.OpenInfo.Status, "CLOSED") && status == "Online" {
		status = "Offline"
	}
	l.GBP, l.Status, l.pending = state, status, remaining
	_, err = s.db.Exec(ctx, `UPDATE locations SET google = $2, gbp = $3, status = $4, pending = $5, last_sync = now() WHERE code = $1`, l.Code, snap, state, status, remaining)
	return err
}

// recordGoogleUpdates membuat Persetujuan Edit untuk kolom yang diubah Google/pengguna lain.
func (s *Server) recordGoogleUpdates(ctx context.Context, l *Location, g *gbp.Location, fields, skip []string) error {
	snap := gbp.ToSnapshot(g, l.Lat, l.Lng)
	for _, f := range fields {
		if f == "coords" {
			continue // koordinat dibandingkan lewat halaman Ketidaksesuaian
		}
		before, after := map[string]string{"name": l.Name, "phone": l.Phone, "hours": l.Hours, "address": l.Address}[f],
			map[string]string{"name": snap.Name, "phone": snap.Phone, "hours": snap.Hours, "address": snap.Address}[f]
		if before == after {
			continue
		}
		var raw []byte
		if f == "hours" && g.RegularHours != nil {
			raw, _ = json.Marshal(hours.FromGoogle(g.RegularHours.Periods))
		}
		var exists bool
		if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM approvals WHERE code = $1 AND field = $2 AND status = 'Menunggu' AND after = $3)`, l.Code, f, after).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		err := s.tx(ctx, func(tx pgx.Tx) error {
			id, err := nextID(ctx, tx, "approval_seq", "CR-%04d")
			if err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `INSERT INTO approvals (id, code, field, before, after, by, google_value) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
				id, l.Code, f, before, after, "Google Maps (pembaruan Google/pengguna lain)", raw); err != nil {
				return err
			}
			return audit(ctx, tx, "Google Maps", "Eksternal", "Persetujuan Edit", "Mengusulkan perubahan "+strings.ToLower(FieldLabel[f]), l.Code, id,
				[]Change{{FieldLabel[f], before, after}})
		})
		if err != nil {
			return err
		}
	}
	_ = skip
	return nil
}

// pullLocation: tarik perubahan Google tanpa mengirim apa pun (dipakai notifikasi & job berkala).
func (s *Server) pullLocation(ctx context.Context, c *gbp.Client, code, _ string) error {
	l, err := getLocation(ctx, s.db, code, false)
	if err != nil || l.gbpName == nil {
		return err
	}
	upd, err := c.GetGoogleUpdated(ctx, *l.gbpName)
	if err != nil {
		return err
	}
	if err := s.recordGoogleUpdates(ctx, l, &upd.Location, gbp.DiffFields(upd.DiffMask), nil); err != nil {
		return err
	}
	return s.refreshFromGoogle(ctx, c, l, nil)
}

func (s *Server) resolveFailure(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct{ Code, Run, Note string }
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Note = strings.TrimSpace(in.Note)
	if in.Note == "" || len(in.Note) > 500 {
		return fail(422, "Catatan tindak lanjut wajib diisi (maks. 500 karakter).")
	}
	note := in.Note + " — " + u.Name
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		tag, err := tx.Exec(r.Context(), `UPDATE runs SET items = (SELECT jsonb_agg(CASE WHEN i->>'code' = $2 AND i->>'status' = 'Gagal'
				THEN i || jsonb_build_object('resolved', true, 'note', $3::text) ELSE i END) FROM jsonb_array_elements(items) i)
			WHERE id = $1 AND items @> jsonb_build_array(jsonb_build_object('code', $2::text))`, in.Run, in.Code, note)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return errNotFound("Kegagalan " + in.Code + " pada " + in.Run)
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Sync Monitor", "Mencatat tindak lanjut kegagalan", in.Code, in.Note, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}
