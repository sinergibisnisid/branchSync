package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"

	"branchsync/server/internal/gbp"
	"branchsync/server/internal/hours"
)

// ---- Ketidaksesuaian ----

var discFields = []string{"name", "phone", "hours", "address", "coords"}

type discItem struct {
	Code   string `json:"code"`
	Field  string `json:"field"`
	Source string `json:"source"`
}

func (s *Server) resolveDiscrepancy(w http.ResponseWriter, r *http.Request, u *User) error {
	var in discItem
	if err := decode(r, &in); err != nil {
		return err
	}
	if err := s.resolveOne(r.Context(), u, in); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) resolveDiscrepancyBulk(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Source string     `json:"source"`
		Items  []discItem `json:"items"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if len(in.Items) > 5000 {
		return fail(413, "Maksimal 5.000 perbedaan per permintaan.")
	}
	var failed []string
	for _, it := range in.Items {
		it.Source = in.Source
		if err := s.resolveOne(r.Context(), u, it); err != nil {
			failed = append(failed, fmt.Sprintf("%s (%s): %s", it.Code, FieldLabel[it.Field], errMsg(err)))
		}
	}
	if len(failed) > 0 {
		more := ""
		if len(failed) > 3 {
			more = fmt.Sprintf(" dan %d lainnya", len(failed)-3)
			failed = failed[:3]
		}
		return fail(502, "%d dari %d perbedaan gagal diselesaikan: %s%s", len(failed), len(in.Items), strings.Join(failed, "; "), more)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// resolveOne: source "google" = terapkan data Google ke Dashboard; "dashboard" = kirim data Dashboard ke Google.
func (s *Server) resolveOne(ctx context.Context, u *User, in discItem) error {
	if !slices.Contains(discFields, in.Field) || (in.Source != "google" && in.Source != "dashboard") {
		return fail(422, "Kolom atau sumber data tidak valid.")
	}
	l, err := getLocation(ctx, s.db, in.Code, false)
	if err != nil {
		return err
	}
	snap := l.snapshot()
	if snap == nil {
		return fail(409, "Unit %s belum punya data Google untuk dibandingkan.", l.Code)
	}
	if in.Source == "google" {
		return s.tx(ctx, func(tx pgx.Tx) error {
			cur, err := getLocation(ctx, tx, in.Code, true)
			if err != nil {
				return err
			}
			next := *cur
			switch in.Field {
			case "name":
				next.Name = snap.Name
			case "phone":
				next.Phone = snap.Phone
			case "address":
				next.Address = snap.Address
			case "hours":
				next.Hours = snap.Hours
				next.HoursSpec, _ = hours.Parse(snap.Hours)
			case "coords":
				next.Lat, next.Lng = snap.Lat, snap.Lng
			}
			changes, _ := locChanges(cur, &next)
			next.pending = slices.DeleteFunc(slices.Clone(cur.pending), func(f string) bool { return f == in.Field })
			if err := saveLocation(ctx, tx, &next, u.Name); err != nil {
				return err
			}
			return audit(ctx, tx, u.Name, "Internal", "Ketidaksesuaian", "Menerapkan data Google ke Dashboard", l.Code, FieldLabel[in.Field], changes)
		})
	}
	if in.Field == "coords" {
		return fail(422, "Titik koordinat tidak dapat dikirim ke Google lewat API. Perbaiki pin langsung di Google Business Profile, atau pakai data Google.")
	}
	if l.gbpName == nil {
		return fail(409, "Unit %s belum terhubung ke listing Google. Jalankan sinkronisasi terlebih dahulu.", l.Code)
	}
	c, err := s.gbpClient(ctx)
	if err != nil {
		return err
	}
	loc, mask := gbp.ToGoogle(l.unit(), []string{in.Field})
	if _, err := c.PatchLocation(ctx, *l.gbpName, loc, mask); err != nil {
		return err
	}
	before := map[string]string{"name": snap.Name, "phone": snap.Phone, "hours": snap.Hours, "address": snap.Address}[in.Field]
	after := map[string]string{"name": l.Name, "phone": l.Phone, "hours": l.Hours, "address": l.Address}[in.Field]
	if err := s.refreshFromGoogle(ctx, c, l, []string{in.Field}); err != nil {
		return err
	}
	return audit(ctx, s.db, u.Name, "Internal", "Ketidaksesuaian", "Mengirim data Dashboard ke Google", l.Code, FieldLabel[in.Field],
		[]Change{{FieldLabel[in.Field] + " (Google)", before, after}})
}

func (s *Server) discNote(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct{ Code, Field, Text string }
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Text = strings.TrimSpace(in.Text)
	if in.Text == "" || len(in.Text) > 500 || !slices.Contains(discFields, in.Field) {
		return fail(422, "Catatan wajib diisi (maks. 500 karakter) untuk kolom yang valid.")
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `INSERT INTO disc_notes (code, field, text, by) VALUES ($1,$2,$3,$4)
			ON CONFLICT (code, field) DO UPDATE SET text = EXCLUDED.text, by = EXCLUDED.by, time = now()`, in.Code, in.Field, in.Text, u.Name); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Ketidaksesuaian", "Mendokumentasikan temuan", in.Code, in.Text, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// ---- Duplikat ----

// mergeDuplicate menonaktifkan unit "drop" dan menandainya Duplikat di Dashboard. Listing Google tidak ditutup
// otomatis (tidak ada API penggabungan); laporkan ke Google lewat Klaim › Laporan duplikat.
func (s *Server) mergeDuplicate(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct{ Keep, Drop string }
	if err := decode(r, &in); err != nil {
		return err
	}
	if in.Keep == in.Drop {
		return fail(422, "Unit yang dipertahankan dan yang ditandai harus berbeda.")
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		keep, err := getLocation(r.Context(), tx, in.Keep, false)
		if err != nil {
			return err
		}
		drop, err := getLocation(r.Context(), tx, in.Drop, true)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `UPDATE locations SET status = 'Tidak Aktif', gbp = 'Duplikat', updated_at = now(), updated_by = $2 WHERE code = $1`, drop.Code, u.Name); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Duplikat", "Menggabungkan titik ganda", drop.Code, "Dipertahankan: "+keep.Name,
			[]Change{{"Status", drop.Status, "Tidak Aktif"}, {"Status GBP", drop.GBP, "Duplikat"}})
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

func (s *Server) ignoreDuplicate(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct{ A, B string }
	if err := decode(r, &in); err != nil {
		return err
	}
	if in.A == "" || in.B == "" || in.A == in.B {
		return fail(422, "Pasangan unit tidak valid.")
	}
	a, b := in.A, in.B
	if b < a {
		a, b = b, a
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `INSERT INTO dup_ignored (a, b) VALUES ($1,$2) ON CONFLICT DO NOTHING`, a, b); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Duplikat", "Menandai bukan duplikat", "", a+" & "+b, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// ---- Klaim & titik baru ----

var (
	claimKinds = []string{"Klaim kepemilikan", "Banding suspend", "Laporan duplikat", "Titik baru"}
	claimSteps = []string{"Diajukan", "Diproses internal", "Menunggu verifikasi Google", "Selesai"}
)

func (s *Server) createClaim(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Kind     string    `json:"kind"`
		Code     *string   `json:"code"`
		Proposal *locInput `json:"proposal"`
		Note     string    `json:"note"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if !slices.Contains(claimKinds, in.Kind) {
		return fail(422, "Jenis permintaan tidak valid.")
	}
	var proposal []byte
	var code *string
	if in.Kind == "Titik baru" {
		if in.Proposal == nil {
			return fail(422, "Data usulan titik baru wajib diisi.")
		}
		p := &Location{Status: "Belum Sync", GBP: "Belum Diklaim"}
		if err := in.Proposal.apply(p); err != nil {
			return err
		}
		proposal, _ = json.Marshal(p)
	} else {
		if in.Code == nil {
			return fail(422, "Pilih unit kerja untuk permintaan ini.")
		}
		if _, err := getLocation(r.Context(), s.db, *in.Code, false); err != nil {
			return err
		}
		code = in.Code
	}
	if len(in.Note) > 500 {
		return fail(422, "Catatan maksimal 500 karakter.")
	}
	var id string
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var err error
		if id, err = nextID(r.Context(), tx, "claim_seq", "KL-%04d"); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `INSERT INTO claims (id, kind, code, proposal, note, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
			id, in.Kind, code, proposal, strings.TrimSpace(in.Note), u.Name); err != nil {
			return err
		}
		target := id
		if code != nil {
			target = *code
		}
		action := "Mengajukan " + strings.ToLower(in.Kind)
		return audit(r.Context(), tx, u.Name, "Internal", "Klaim & Titik Baru", action, target, id, nil)
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"id": id})
	return nil
}

type claimRow struct {
	ID, Kind, Status string
	Code             *string
	Proposal         []byte
}

func (s *Server) advanceClaim(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct{ To string }
	if err := decode(r, &in); err != nil {
		return err
	}
	id := r.PathValue("id")
	var c claimRow
	err := s.db.QueryRow(r.Context(), `SELECT id, kind, status, code, proposal FROM claims WHERE id = $1`, id).Scan(&c.ID, &c.Kind, &c.Status, &c.Code, &c.Proposal)
	if errors.Is(err, pgx.ErrNoRows) {
		return errNotFound("Permintaan " + id)
	}
	if err != nil {
		return err
	}
	i := slices.Index(claimSteps, c.Status)
	if i < 0 || i == len(claimSteps)-1 {
		return fail(409, "Permintaan %s sudah %s.", id, strings.ToLower(c.Status))
	}
	if in.To != claimSteps[i+1] {
		return fail(409, "Tahap berikutnya untuk %s adalah “%s”.", id, claimSteps[i+1])
	}
	// Titik baru: listing dibuat di Google saat masuk tahap verifikasi Google (bila GBP terhubung).
	var gbpName *string
	if c.Kind == "Titik baru" && in.To == "Menunggu verifikasi Google" {
		if gc, err := s.gbpClient(r.Context()); err == nil {
			var p Location
			_ = json.Unmarshal(c.Proposal, &p)
			var account string
			if err := s.db.QueryRow(r.Context(), `SELECT account_id FROM accounts WHERE account_id IS NOT NULL ORDER BY (id = $1) DESC, id LIMIT 1`, deref(p.AccountID)).Scan(&account); err != nil {
				return fail(409, "Belum ada akun Google Business Profile yang terhubung untuk membuat listing.")
			}
			loc, _ := gbp.ToGoogle(p.unit(), nil)
			loc.StoreCode = ""
			created, err := gc.CreateLocation(r.Context(), account, loc, "bs-"+id)
			if err != nil {
				return fail(502, "Listing gagal dibuat di Google: %s", errMsg(err))
			}
			gbpName = &created.Name
		}
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		set := `status = $2`
		switch in.To {
		case "Menunggu verifikasi Google":
			set += `, processed_at = now()`
		case "Selesai":
			set += `, done_at = now(), processed_at = coalesce(processed_at, now())`
		}
		args := []any{id, in.To}
		if gbpName != nil {
			set += `, proposal = jsonb_set(proposal, '{gbpName}', to_jsonb($3::text))`
			args = append(args, *gbpName)
		}
		if _, err := tx.Exec(r.Context(), `UPDATE claims SET `+set+` WHERE id = $1`, args...); err != nil {
			return err
		}
		target := id
		if in.To == "Selesai" {
			t, err := s.finishClaim(r.Context(), tx, &c, u)
			if err != nil {
				return err
			}
			target = t
		} else if c.Code != nil {
			target = *c.Code
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Klaim & Titik Baru", fmt.Sprintf("Memindahkan %s ke “%s”", id, in.To), target, c.Kind, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// finishClaim menerapkan hasil permintaan yang selesai ke data unit.
func (s *Server) finishClaim(ctx context.Context, tx pgx.Tx, c *claimRow, u *User) (string, error) {
	switch c.Kind {
	case "Titik baru":
		var p struct {
			Location
			GBPName string `json:"gbpName"`
		}
		var raw []byte
		if err := tx.QueryRow(ctx, `SELECT proposal FROM claims WHERE id = $1`, c.ID).Scan(&raw); err != nil {
			return "", err
		}
		if err := json.Unmarshal(raw, &p); err != nil {
			return "", err
		}
		l := p.Location
		code, err := nextID(ctx, tx, "location_code_seq", "BS-%05d")
		if err != nil {
			return "", err
		}
		l.Code, l.Status, l.GBP = code, "Belum Sync", "Menunggu Verifikasi"
		if err := insertLocation(ctx, tx, &l, u.Name); err != nil {
			return "", err
		}
		if p.GBPName != "" {
			if _, err := tx.Exec(ctx, `UPDATE locations SET gbp_name = $2, pending = '{}' WHERE code = $1`, code, p.GBPName); err != nil {
				return "", err
			}
		}
		_, err = tx.Exec(ctx, `UPDATE claims SET code = $2 WHERE id = $1`, c.ID, code)
		return code, err
	case "Laporan duplikat":
		if c.Code != nil {
			_, err := tx.Exec(ctx, `UPDATE locations SET status = 'Tidak Aktif', gbp = 'Duplikat', updated_at = now(), updated_by = $2 WHERE code = $1`, *c.Code, u.Name)
			return *c.Code, err
		}
	default: // Klaim kepemilikan, Banding suspend → status diperiksa ulang ke Google bila terhubung
		if c.Code != nil {
			state := "Terverifikasi"
			var name *string
			_ = tx.QueryRow(ctx, `SELECT gbp_name FROM locations WHERE code = $1`, *c.Code).Scan(&name)
			if gc, err := s.gbpClient(ctx); err == nil && name != nil {
				if v, err := gc.VoiceOfMerchant(ctx, *name); err == nil {
					if st := gbp.Status(v, nil); st != "" {
						state = st
					}
				}
			}
			_, err := tx.Exec(ctx, `UPDATE locations SET gbp = $2, updated_at = now(), updated_by = $3 WHERE code = $1`, *c.Code, state, u.Name)
			return *c.Code, err
		}
	}
	return c.ID, nil
}

func (s *Server) rejectClaim(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct{ Note string }
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Note = strings.TrimSpace(in.Note)
	if in.Note == "" || len(in.Note) > 500 {
		return fail(422, "Alasan penolakan wajib diisi (maks. 500 karakter).")
	}
	id := r.PathValue("id")
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var code *string
		err := tx.QueryRow(r.Context(), `UPDATE claims SET status = 'Ditolak', note = $2, done_at = now() WHERE id = $1 AND status NOT IN ('Selesai','Ditolak') RETURNING code`, id, in.Note).Scan(&code)
		if errors.Is(err, pgx.ErrNoRows) {
			return fail(409, "Permintaan %s tidak ditemukan atau sudah selesai.", id)
		}
		if err != nil {
			return err
		}
		target := id
		if code != nil {
			target = *code
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Klaim & Titik Baru", "Menolak "+id, target, in.Note, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// ---- Persetujuan edit eksternal ----

type approvalRow struct {
	ID, Code, Field, Before, After, By, Status string
	GoogleValue                                []byte
}

func (s *Server) loadApproval(ctx context.Context, id string) (*approvalRow, error) {
	a := &approvalRow{}
	err := s.db.QueryRow(ctx, `SELECT id, code, field, before, after, by, status, google_value FROM approvals WHERE id = $1`, id).
		Scan(&a.ID, &a.Code, &a.Field, &a.Before, &a.After, &a.By, &a.Status, &a.GoogleValue)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound("Permintaan " + id)
	}
	if err == nil && a.Status != "Menunggu" {
		return nil, fail(409, "%s sudah %s.", id, strings.ToLower(a.Status))
	}
	return a, err
}

// approve: nilai dari Google diterapkan ke Dashboard (Google sudah menampilkan nilai itu).
func (s *Server) approve(w http.ResponseWriter, r *http.Request, u *User) error {
	a, err := s.loadApproval(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		cur, err := getLocation(r.Context(), tx, a.Code, true)
		if err != nil {
			return err
		}
		next := *cur
		switch a.Field {
		case "name":
			next.Name = a.After
		case "phone":
			next.Phone = a.After
		case "address":
			next.Address = a.After
		case "hours":
			next.Hours = a.After
			var spec hours.Spec
			if len(a.GoogleValue) > 0 && json.Unmarshal(a.GoogleValue, &spec) == nil {
				next.HoursSpec = spec.Normalize()
			} else {
				next.HoursSpec, _ = hours.Parse(a.After)
			}
		default:
			return fail(422, "Kolom %s tidak dapat disetujui.", a.Field)
		}
		next.pending = slices.DeleteFunc(slices.Clone(cur.pending), func(f string) bool { return f == a.Field })
		if err := saveLocation(r.Context(), tx, &next, a.By+" (disetujui "+u.Name+")"); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `UPDATE approvals SET status = 'Disetujui', decided_at = now(), decided_by = $2 WHERE id = $1`, a.ID, u.Name); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Persetujuan Edit", "Menyetujui edit eksternal", a.Code, a.ID+" dari "+a.By,
			[]Change{{FieldLabel[a.Field], a.Before, a.After}})
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// rejectApproval: data Dashboard dikirim ulang ke Google sehingga perubahan eksternal dibatalkan.
func (s *Server) rejectApproval(w http.ResponseWriter, r *http.Request, u *User) error {
	a, err := s.loadApproval(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	l, err := getLocation(r.Context(), s.db, a.Code, false)
	if err != nil {
		return err
	}
	if l.gbpName != nil && a.Field != "coords" {
		c, err := s.gbpClient(r.Context())
		if err != nil {
			return err
		}
		loc, mask := gbp.ToGoogle(l.unit(), []string{a.Field})
		if _, err := c.PatchLocation(r.Context(), *l.gbpName, loc, mask); err != nil {
			return fail(502, "Data Dashboard gagal dikirim ulang ke Google: %s", errMsg(err))
		}
		_ = s.refreshFromGoogle(r.Context(), c, l, []string{a.Field})
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE approvals SET status = 'Ditolak', decided_at = now(), decided_by = $2 WHERE id = $1`, a.ID, u.Name); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Persetujuan Edit", "Menolak edit eksternal", a.Code, a.ID+" dari "+a.By, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}
