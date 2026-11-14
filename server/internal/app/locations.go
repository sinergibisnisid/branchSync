package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"branchsync/server/internal/gbp"
	"branchsync/server/internal/hours"
)

var (
	Types    = []string{"Kantor Cabang", "KCP", "Unit", "ATM"}
	Statuses = []string{"Online", "Offline", "Belum Sync", "Tidak Aktif"}
	GBPState = []string{"Terverifikasi", "Menunggu Verifikasi", "Belum Diklaim", "Suspend", "Duplikat"}
)

// FieldLabel sama dengan FIELD_LABEL di frontend (dipakai di riwayat).
var FieldLabel = map[string]string{"name": "Nama listing", "phone": "Telepon", "hours": "Jam operasional", "address": "Alamat", "coords": "Titik koordinat",
	"type": "Tipe", "status": "Status", "gbp": "Status GBP", "city": "Kota", "province": "Provinsi", "lat": "Latitude", "lng": "Longitude", "accountId": "Akun GBP"}

// Kolom yang dikirim ke Google saat sinkronisasi.
var googleFields = []string{"name", "phone", "hours", "address"}

var regionRules = []struct {
	re     *regexp.Regexp
	region string
}{
	{regexp.MustCompile(`Jakarta|Jawa|Banten|Yogyakarta`), "Jawa"},
	{regexp.MustCompile(`Sumatera|Aceh|Riau|Jambi|Bengkulu|Lampung|Bangka`), "Sumatera"},
	{regexp.MustCompile(`Kalimantan`), "Kalimantan"},
	{regexp.MustCompile(`Sulawesi|Gorontalo`), "Sulawesi"},
	{regexp.MustCompile(`Bali|Nusa`), "Bali & Nusa Tenggara"},
	{regexp.MustCompile(`Maluku`), "Maluku"},
}

// regionOf sama dengan regionOf di frontend.
func regionOf(p string) string {
	for _, r := range regionRules {
		if r.re.MatchString(p) {
			return r.region
		}
	}
	return "Papua"
}

func inIndonesia(lat, lng float64) bool {
	return lat >= -11.5 && lat <= 6.5 && lng >= 94 && lng <= 141.5
}

// Location: bentuk unit di API.
type Location struct {
	Code      string          `json:"code"`
	Name      string          `json:"name"`
	Type      string          `json:"type"`
	City      string          `json:"city"`
	Province  string          `json:"province"`
	Region    string          `json:"region"`
	Address   string          `json:"address"`
	Phone     string          `json:"phone"`
	Hours     string          `json:"hours"`
	HoursSpec hours.Spec      `json:"hoursSpec,omitempty"`
	Lat       float64         `json:"lat"`
	Lng       float64         `json:"lng"`
	Status    string          `json:"status"`
	AccountID *string         `json:"accountId"`
	GBP       string          `json:"gbp"`
	Google    json.RawMessage `json:"google"`
	UpdatedAt time.Time       `json:"updatedAt"`
	UpdatedBy string          `json:"updatedBy"`
	LastSync  *time.Time      `json:"lastSync"`

	gbpName *string
	pending []string
}

const locCols = `code, name, type, city, province, region, address, phone, hours, hours_spec, lat, lng, status, account_id, gbp, google, updated_at, updated_by, last_sync, gbp_name, pending`

func scanLocation(row pgx.Row) (*Location, error) {
	l := &Location{}
	var spec, google []byte
	err := row.Scan(&l.Code, &l.Name, &l.Type, &l.City, &l.Province, &l.Region, &l.Address, &l.Phone, &l.Hours, &spec, &l.Lat, &l.Lng,
		&l.Status, &l.AccountID, &l.GBP, &google, &l.UpdatedAt, &l.UpdatedBy, &l.LastSync, &l.gbpName, &l.pending)
	if err != nil {
		return nil, err
	}
	if len(spec) > 0 && string(spec) != "null" {
		_ = json.Unmarshal(spec, &l.HoursSpec)
	}
	if len(google) > 0 {
		l.Google = google
	} else {
		l.Google = json.RawMessage("null")
	}
	return l, nil
}

func getLocation(ctx context.Context, q dbtx, code string, lock bool) (*Location, error) {
	sql := `SELECT ` + locCols + ` FROM locations WHERE code = $1`
	if lock {
		sql += ` FOR UPDATE`
	}
	l, err := scanLocation(q.QueryRow(ctx, sql, code))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound("Unit " + code)
	}
	return l, err
}

func (l *Location) snapshot() *gbp.Snapshot {
	if len(l.Google) == 0 || string(l.Google) == "null" {
		return nil
	}
	var s gbp.Snapshot
	if json.Unmarshal(l.Google, &s) != nil {
		return nil
	}
	return &s
}

func (l *Location) unit() gbp.Unit {
	return gbp.Unit{Code: l.Code, Name: l.Name, Type: l.Type, City: l.City, Province: l.Province, Address: l.Address, Phone: l.Phone,
		HoursText: l.Hours, HoursSpec: l.HoursSpec, Lat: l.Lat, Lng: l.Lng}
}

// locInput: kolom yang boleh dikirim klien (semua opsional untuk PATCH).
type locInput struct {
	Name      *string         `json:"name"`
	Type      *string         `json:"type"`
	City      *string         `json:"city"`
	Province  *string         `json:"province"`
	Address   *string         `json:"address"`
	Phone     *string         `json:"phone"`
	Hours     *string         `json:"hours"`
	HoursSpec json.RawMessage `json:"hoursSpec"`
	Lat       json.RawMessage `json:"lat"`
	Lng       json.RawMessage `json:"lng"`
	Status    *string         `json:"status"`
	AccountID *string         `json:"accountId"`
}

func num(raw json.RawMessage) (float64, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return 0, false
	}
	var f float64
	if json.Unmarshal(raw, &f) == nil {
		return f, true
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		if f, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
			return f, true
		}
	}
	return math.NaN(), true
}

// apply menerapkan input ke l dan memvalidasi; mengembalikan pesan galat pertama (Bahasa Indonesia).
func (in *locInput) apply(l *Location) error {
	set := func(dst *string, v *string) {
		if v != nil {
			*dst = strings.TrimSpace(*v)
		}
	}
	set(&l.Name, in.Name)
	set(&l.Type, in.Type)
	set(&l.City, in.City)
	set(&l.Province, in.Province)
	set(&l.Address, in.Address)
	set(&l.Phone, in.Phone)
	if in.Status != nil && strings.TrimSpace(*in.Status) != "" { // kosong = tetap / bawaan "Belum Sync"
		l.Status = strings.TrimSpace(*in.Status)
	}
	if in.AccountID != nil {
		v := strings.TrimSpace(*in.AccountID)
		if v == "" {
			l.AccountID = nil
		} else {
			l.AccountID = &v
		}
	}
	if len(in.HoursSpec) > 0 && string(in.HoursSpec) != "null" {
		var spec hours.Spec
		if err := json.Unmarshal(in.HoursSpec, &spec); err != nil {
			return fail(422, "Jam operasional tidak valid.")
		}
		spec = spec.Normalize()
		if err := spec.Validate(); err != nil {
			return fail(422, "%s", err.Error())
		}
		l.HoursSpec, l.Hours = spec, hours.Format(spec)
	} else if in.Hours != nil {
		l.Hours = strings.TrimSpace(*in.Hours)
		if spec, ok := hours.Parse(l.Hours); ok {
			l.HoursSpec = spec
		} else {
			l.HoursSpec = nil
		}
	}
	if v, ok := num(in.Lat); ok {
		l.Lat = math.Round(v*1e6) / 1e6
	}
	if v, ok := num(in.Lng); ok {
		l.Lng = math.Round(v*1e6) / 1e6
	}
	switch {
	case l.Name == "":
		return fail(422, "Nama unit wajib diisi.")
	case len([]rune(l.Name)) > 120:
		return fail(422, "Nama unit maksimal 120 karakter.")
	case !slices.Contains(Types, l.Type):
		return fail(422, "Tipe unit tidak valid. Pilih: %s.", strings.Join(Types, ", "))
	case l.City == "" || l.Province == "" || l.Address == "":
		return fail(422, "Kota, provinsi, dan alamat wajib diisi.")
	case !slices.Contains(Statuses, l.Status):
		return fail(422, "Status tidak valid. Pilih: %s.", strings.Join(Statuses, ", "))
	case math.IsNaN(l.Lat) || math.IsNaN(l.Lng):
		return fail(422, "Latitude dan longitude harus berupa angka.")
	case !inIndonesia(l.Lat, l.Lng):
		return fail(422, "Titik berada di luar wilayah Indonesia.")
	case len(l.Address) > 300 || len(l.Phone) > 40 || len(l.Hours) > 300:
		return fail(422, "Alamat, telepon, atau jam operasional terlalu panjang.")
	}
	l.Region = regionOf(l.Province)
	return nil
}

func specJSON(s hours.Spec) []byte {
	if s == nil {
		return nil
	}
	b, _ := json.Marshal(s)
	return b
}

func (s *Server) checkAccount(ctx context.Context, q dbtx, id *string) error {
	if id == nil {
		return nil
	}
	var ok bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM accounts WHERE id = $1)`, *id).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return fail(422, "Akun Google Business Profile %s tidak dikenal.", *id)
	}
	return nil
}

func insertLocation(ctx context.Context, q dbtx, l *Location, by string) error {
	_, err := q.Exec(ctx, `INSERT INTO locations (code, name, type, city, province, region, address, phone, hours, hours_spec, lat, lng, status, account_id, gbp, pending, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		l.Code, l.Name, l.Type, l.City, l.Province, l.Region, l.Address, l.Phone, l.Hours, specJSON(l.HoursSpec), l.Lat, l.Lng, l.Status, l.AccountID, l.GBP, googleFields, by)
	return err
}

func (s *Server) createLocation(w http.ResponseWriter, r *http.Request, u *User) error {
	var in locInput
	if err := decode(r, &in); err != nil {
		return err
	}
	l := &Location{Status: "Belum Sync", GBP: "Belum Diklaim"}
	if err := in.apply(l); err != nil {
		return err
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		if err := s.checkAccount(r.Context(), tx, l.AccountID); err != nil {
			return err
		}
		if err := uniqueName(r.Context(), tx, l.Name, ""); err != nil {
			return err
		}
		code, err := nextID(r.Context(), tx, "location_code_seq", "BS-%05d")
		if err != nil {
			return err
		}
		l.Code = code
		if err := insertLocation(r.Context(), tx, l, u.Name); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Unit Kerja", "Menambahkan unit", l.Code, l.Name, nil)
	})
	if err != nil {
		return err
	}
	out, err := getLocation(r.Context(), s.db, l.Code, false)
	if err != nil {
		return err
	}
	writeJSON(w, 201, out)
	return nil
}

func uniqueName(ctx context.Context, q dbtx, name, except string) error {
	var taken bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM locations WHERE lower(name) = lower($1) AND code <> $2)`, name, except).Scan(&taken); err != nil {
		return err
	}
	if taken {
		return fail(409, "Nama %q sudah dipakai unit lain.", name)
	}
	return nil
}

// locChanges membandingkan kolom yang tampil di riwayat.
func locChanges(a, b *Location) (changes []Change, googleChanged []string) {
	add := func(field, x, y string) {
		if x != y {
			changes = append(changes, Change{FieldLabel[field], x, y})
			if slices.Contains(googleFields, field) {
				googleChanged = append(googleChanged, field)
			}
		}
	}
	f := func(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
	add("name", a.Name, b.Name)
	add("type", a.Type, b.Type)
	add("status", a.Status, b.Status)
	add("city", a.City, b.City)
	add("province", a.Province, b.Province)
	add("address", a.Address, b.Address)
	add("phone", a.Phone, b.Phone)
	add("hours", a.Hours, b.Hours)
	add("lat", f(a.Lat), f(b.Lat))
	add("lng", f(a.Lng), f(b.Lng))
	add("accountId", deref(a.AccountID), deref(b.AccountID))
	return
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func mergePending(cur, add []string) []string {
	out := append([]string{}, cur...)
	for _, f := range add {
		if !slices.Contains(out, f) {
			out = append(out, f)
		}
	}
	return out
}

func saveLocation(ctx context.Context, q dbtx, l *Location, by string) error {
	_, err := q.Exec(ctx, `UPDATE locations SET name=$2, type=$3, city=$4, province=$5, region=$6, address=$7, phone=$8, hours=$9, hours_spec=$10,
		lat=$11, lng=$12, status=$13, account_id=$14, gbp=$15, pending=$16, updated_at=now(), updated_by=$17 WHERE code=$1`,
		l.Code, l.Name, l.Type, l.City, l.Province, l.Region, l.Address, l.Phone, l.Hours, specJSON(l.HoursSpec), l.Lat, l.Lng, l.Status, l.AccountID, l.GBP, l.pending, by)
	return err
}

func (s *Server) updateLocation(w http.ResponseWriter, r *http.Request, u *User) error {
	var in locInput
	if err := decode(r, &in); err != nil {
		return err
	}
	code := r.PathValue("code")
	var out *Location
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		cur, err := getLocation(r.Context(), tx, code, true)
		if err != nil {
			return err
		}
		next := *cur
		if err := in.apply(&next); err != nil {
			return err
		}
		if err := s.checkAccount(r.Context(), tx, next.AccountID); err != nil {
			return err
		}
		if next.Name != cur.Name {
			if err := uniqueName(r.Context(), tx, next.Name, code); err != nil {
				return err
			}
		}
		changes, gch := locChanges(cur, &next)
		if len(changes) == 0 {
			out = cur
			return nil
		}
		next.pending = mergePending(cur.pending, gch)
		if err := saveLocation(r.Context(), tx, &next, u.Name); err != nil {
			return err
		}
		out = &next
		return audit(r.Context(), tx, u.Name, "Internal", "Unit Kerja", "Memperbarui unit", code, "", changes)
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, out)
	return nil
}

func (s *Server) deleteLocation(w http.ResponseWriter, r *http.Request, u *User) error {
	code := r.PathValue("code")
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var name string
		if err := tx.QueryRow(r.Context(), `DELETE FROM locations WHERE code = $1 RETURNING name`, code).Scan(&name); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return errNotFound("Unit " + code)
			}
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Unit Kerja", "Menghapus unit", code, name, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

func codesInput(r *http.Request) ([]string, map[string]any, error) {
	var in struct {
		Codes []string       `json:"codes"`
		Patch map[string]any `json:"patch"`
	}
	if err := decode(r, &in); err != nil {
		return nil, nil, err
	}
	if len(in.Codes) == 0 {
		return nil, nil, fail(400, "Pilih minimal satu unit.")
	}
	if len(in.Codes) > 20000 {
		return nil, nil, fail(413, "Maksimal 20.000 unit per permintaan.")
	}
	return in.Codes, in.Patch, nil
}

func (s *Server) bulkDelete(w http.ResponseWriter, r *http.Request, u *User) error {
	codes, _, err := codesInput(r)
	if err != nil {
		return err
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		tag, err := tx.Exec(r.Context(), `DELETE FROM locations WHERE code = ANY($1)`, codes)
		if err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Unit Kerja", "Menghapus unit massal", "", fmt.Sprintf("%d unit", tag.RowsAffected()), nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

func (s *Server) bulkUpdate(w http.ResponseWriter, r *http.Request, u *User) error {
	codes, patch, err := codesInput(r)
	if err != nil {
		return err
	}
	status, _ := patch["status"].(string)
	if len(patch) != 1 || !slices.Contains(Statuses, status) {
		return fail(422, "Pembaruan massal hanya mendukung status: %s.", strings.Join(Statuses, ", "))
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `UPDATE locations l SET status = $2, updated_at = now(), updated_by = $3
			FROM (SELECT code, status AS old FROM locations WHERE code = ANY($1) AND status <> $2 FOR UPDATE) o
			WHERE l.code = o.code RETURNING l.code, o.old`, codes, status, u.Name)
		if err != nil {
			return err
		}
		type ch struct{ code, old string }
		list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (ch, error) {
			var c ch
			return c, row.Scan(&c.code, &c.old)
		})
		if err != nil {
			return err
		}
		for _, c := range list {
			if err := audit(r.Context(), tx, u.Name, "Internal", "Unit Kerja", "Mengubah status (massal)", c.code, "", []Change{{"Status", c.old, status}}); err != nil {
				return err
			}
		}
		return nil
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// importLocations: lihat API.md (exists=true → perbarui; exists=false + code → kode dari file; code null → kode baru).
func (s *Server) importLocations(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Items []struct {
			locInput
			Code   *string `json:"code"`
			Exists bool    `json:"exists"`
		} `json:"items"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if len(in.Items) == 0 {
		return fail(400, "Tidak ada baris untuk diimpor.")
	}
	if len(in.Items) > 20000 {
		return fail(413, "Maksimal 20.000 baris per impor.")
	}
	added, updated := 0, 0
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		for i, it := range in.Items {
			row := i + 1
			code := strings.TrimSpace(deref(it.Code))
			if it.Exists {
				cur, err := getLocation(r.Context(), tx, code, true)
				if err != nil {
					return fail(422, "Baris %d: unit %s tidak ditemukan.", row, code)
				}
				next := *cur
				if err := it.apply(&next); err != nil {
					return fail(422, "Baris %d: %s", row, err.Error())
				}
				changes, gch := locChanges(cur, &next)
				if len(changes) == 0 {
					continue
				}
				next.pending = mergePending(cur.pending, gch)
				if err := saveLocation(r.Context(), tx, &next, u.Name); err != nil {
					return err
				}
				if err := audit(r.Context(), tx, u.Name, "Internal", "Unit Kerja", "Memperbarui unit via impor", code, "", changes); err != nil {
					return err
				}
				updated++
				continue
			}
			l := &Location{Status: "Belum Sync", GBP: "Belum Diklaim"}
			if err := it.apply(l); err != nil {
				return fail(422, "Baris %d: %s", row, err.Error())
			}
			if code != "" {
				if !storeCodeRe.MatchString(code) {
					return fail(422, "Baris %d: kode %q tidak valid (huruf, angka, titik, garis bawah, atau tanda hubung).", row, code)
				}
				l.Code = code
			} else {
				c, err := nextID(r.Context(), tx, "location_code_seq", "BS-%05d")
				if err != nil {
					return err
				}
				l.Code = c
			}
			if err := insertLocation(r.Context(), tx, l, u.Name); err != nil {
				return fmt.Errorf("baris %d: %w", row, err)
			}
			added++
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Unit Kerja", "Mengimpor data massal", "", fmt.Sprintf("%d unit baru, %d diperbarui", added, updated), nil)
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]int{"added": added, "updated": updated})
	return nil
}
