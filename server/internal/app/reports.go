package app

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"branchsync/server/internal/mail"
	"branchsync/server/internal/pdf"
)

type reportFilters struct {
	Region  string `json:"region"`
	Account string `json:"account"`
	Type    string `json:"type"`
}

func (s *Server) createSchedule(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Name       string        `json:"name"`
		Frequency  string        `json:"frequency"`
		Day        string        `json:"day"`
		Period     string        `json:"period"`
		Format     string        `json:"format"`
		Recipients []string      `json:"recipients"`
		Filters    reportFilters `json:"filters"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	switch {
	case in.Name == "" || len(in.Name) > 80:
		return fail(422, "Nama jadwal wajib diisi (maks. 80 karakter).")
	case in.Frequency != "weekly" && in.Frequency != "monthly":
		return fail(422, "Frekuensi harus mingguan atau bulanan.")
	case in.Frequency == "weekly" && !slices.Contains([]string{"1", "2", "3", "4", "5", "6", "7"}, in.Day):
		return fail(422, "Hari kirim mingguan tidak valid.")
	case !slices.Contains([]string{"7", "30", "90"}, in.Period):
		return fail(422, "Periode data harus 7, 30, atau 90 hari.")
	case !slices.Contains([]string{"PDF", "CSV", "PDF + CSV"}, in.Format):
		return fail(422, "Format harus PDF, CSV, atau PDF + CSV.")
	case len(in.Recipients) == 0 || len(in.Recipients) > 20:
		return fail(422, "Isi 1–20 email penerima.")
	}
	for _, e := range in.Recipients {
		if !emailRe.MatchString(e) {
			return fail(422, "Email tidak valid: %s", e)
		}
	}
	if in.Frequency == "monthly" {
		in.Day = "1"
	}
	var id string
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var err error
		if id, err = nextID(r.Context(), tx, "schedule_seq", "RS-%03d"); err != nil {
			return err
		}
		f, _ := json.Marshal(in.Filters)
		if _, err := tx.Exec(r.Context(), `INSERT INTO report_schedules (id, name, frequency, day, period, format, recipients, filters, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			id, in.Name, in.Frequency, in.Day, in.Period, in.Format, in.Recipients, f, u.Name); err != nil {
			return err
		}
		freq := map[string]string{"weekly": "Mingguan", "monthly": "Bulanan"}[in.Frequency]
		return audit(r.Context(), tx, u.Name, "Internal", "Laporan & Analitik", "Menjadwalkan laporan", "", fmt.Sprintf("%s · %s · %d penerima", in.Name, freq, len(in.Recipients)), nil)
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"id": id})
	return nil
}

func (s *Server) deleteSchedule(w http.ResponseWriter, r *http.Request, u *User) error {
	id := r.PathValue("id")
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var name string
		if err := tx.QueryRow(r.Context(), `DELETE FROM report_schedules WHERE id = $1 RETURNING name`, id).Scan(&name); err != nil {
			if err == pgx.ErrNoRows {
				return errNotFound("Jadwal " + id)
			}
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Laporan & Analitik", "Menghapus jadwal laporan", "", name, nil)
	})
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
	}
	return err
}

// ---- Pembuatan & pengiriman laporan ----

type schedule struct {
	ID, Name, Frequency, Day, Period, Format string
	Recipients                               []string
	Filters                                  reportFilters
	LastSent                                 *time.Time
}

// dueSchedules: jadwal yang jatuh tempo hari ini (zona waktu pengaturan), dikirim mulai pukul 07.00.
func (s *Server) dueSchedules(ctx context.Context, now time.Time) ([]schedule, error) {
	rows, err := s.db.Query(ctx, `SELECT id, name, frequency, day, period, format, recipients, filters, last_sent FROM report_schedules`)
	if err != nil {
		return nil, err
	}
	all, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (schedule, error) {
		var sc schedule
		var f []byte
		err := row.Scan(&sc.ID, &sc.Name, &sc.Frequency, &sc.Day, &sc.Period, &sc.Format, &sc.Recipients, &f, &sc.LastSent)
		_ = json.Unmarshal(f, &sc.Filters)
		return sc, err
	})
	if err != nil {
		return nil, err
	}
	if now.Hour() < 7 {
		return nil, nil
	}
	today := now.Format("2006-01-02")
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	var due []schedule
	for _, sc := range all {
		if sc.LastSent != nil && sc.LastSent.Format("2006-01-02") == today {
			continue
		}
		if (sc.Frequency == "weekly" && sc.Day == fmt.Sprint(weekday)) || (sc.Frequency == "monthly" && now.Day() == 1) {
			due = append(due, sc)
		}
	}
	return due, nil
}

type reportData struct {
	From, To         time.Time
	Units            int
	Online, Verified int
	SyncOK, SyncFail int
	Reviews, Replied int
	RatingSum        int
	Regions          [][]string // region, unit, online%, terverifikasi%, ulasan, rating
}

func (s *Server) buildReport(ctx context.Context, sc schedule, now time.Time) (*reportData, error) {
	days := map[string]int{"7": 7, "30": 30, "90": 90}[sc.Period]
	d := &reportData{From: now.AddDate(0, 0, -days), To: now}
	where := `WHERE ($1 = '' OR l.region = $1) AND ($2 = '' OR l.account_id = $2) AND ($3 = '' OR l.type = $3)`
	f := sc.Filters
	rows, err := s.db.Query(ctx, `SELECT l.region, count(*), count(*) FILTER (WHERE status = 'Online'), count(*) FILTER (WHERE gbp = 'Terverifikasi'),
			coalesce((SELECT count(*) FROM reviews rv WHERE rv.code = ANY(array_agg(l.code)) AND rv.time >= $4), 0),
			coalesce((SELECT count(*) FROM reviews rv WHERE rv.code = ANY(array_agg(l.code)) AND rv.time >= $4 AND rv.reply_text IS NOT NULL), 0),
			coalesce((SELECT sum(rating) FROM reviews rv WHERE rv.code = ANY(array_agg(l.code)) AND rv.time >= $4), 0)
		FROM locations l `+where+` GROUP BY l.region ORDER BY l.region`, f.Region, f.Account, f.Type, d.From)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var region string
		var n, online, verified, rv, replied, ratingSum int
		if err := rows.Scan(&region, &n, &online, &verified, &rv, &replied, &ratingSum); err != nil {
			return nil, err
		}
		d.Units += n
		d.Online += online
		d.Verified += verified
		d.Reviews += rv
		d.Replied += replied
		d.RatingSum += ratingSum
		avg := "—"
		if rv > 0 {
			avg = fmt.Sprintf("%.2f", float64(ratingSum)/float64(rv))
		}
		d.Regions = append(d.Regions, []string{region, fmt.Sprint(n), pctS(online, n), pctS(verified, n), fmt.Sprint(rv), avg})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	err = s.db.QueryRow(ctx, `SELECT coalesce(sum(ok), 0), coalesce(sum(fail), 0) FROM runs WHERE time >= $1`, d.From).Scan(&d.SyncOK, &d.SyncFail)
	return d, err
}

func pctS(a, b int) string {
	if b == 0 {
		return "—"
	}
	return fmt.Sprintf("%.0f%%", float64(a)*100/float64(b))
}

func (d *reportData) kpis() [][]string {
	rate, avg, reply := "—", "—", "—"
	if t := d.SyncOK + d.SyncFail; t > 0 {
		rate = fmt.Sprintf("%.1f%%", float64(d.SyncOK)*100/float64(t))
	}
	if d.Reviews > 0 {
		avg = fmt.Sprintf("%.2f", float64(d.RatingSum)/float64(d.Reviews))
		reply = pctS(d.Replied, d.Reviews)
	}
	return [][]string{{"Jumlah unit", fmt.Sprint(d.Units)}, {"Unit online", pctS(d.Online, d.Units)}, {"Terverifikasi di Google", pctS(d.Verified, d.Units)},
		{"Keberhasilan sync", rate}, {"Pembaruan berhasil", fmt.Sprint(d.SyncOK)}, {"Pembaruan gagal", fmt.Sprint(d.SyncFail)},
		{"Jumlah ulasan", fmt.Sprint(d.Reviews)}, {"Rata-rata rating", avg}, {"Tingkat balasan", reply}}
}

func scope(f reportFilters) string {
	parts := []string{}
	for _, v := range []string{f.Region, f.Account, f.Type} {
		if v != "" {
			parts = append(parts, v)
		}
	}
	if len(parts) == 0 {
		return "Seluruh jaringan"
	}
	return strings.Join(parts, " · ")
}

func (s *Server) renderReport(sc schedule, d *reportData, workspace string) []mail.Attachment {
	period := d.From.Format("2006-01-02") + " – " + d.To.Format("2006-01-02")
	var files []mail.Attachment
	name := "laporan-branchsync-" + d.To.Format("2006-01-02")
	if strings.Contains(sc.Format, "PDF") {
		lines := []pdf.Line{{Text: "Laporan BranchSync — " + sc.Name, Bold: true, Size: 16}, {Text: workspace}, {Text: "Periode: " + period + " · Cakupan: " + scope(sc.Filters)}, {Text: ""},
			{Text: "Ringkasan", Bold: true, Size: 12}}
		for _, k := range d.kpis() {
			lines = append(lines, pdf.Line{Text: k[0] + ": " + k[1]})
		}
		lines = append(lines, pdf.Line{Text: ""}, pdf.Line{Text: "Kinerja per region (region · unit · online · terverifikasi · ulasan · rating)", Bold: true, Size: 12})
		for _, rg := range d.Regions {
			lines = append(lines, pdf.Line{Text: strings.Join(rg, " · ")})
		}
		files = append(files, mail.Attachment{Name: name + ".pdf", ContentType: "application/pdf", Data: pdf.Render("Laporan BranchSync", lines)})
	}
	if strings.Contains(sc.Format, "CSV") {
		var b bytes.Buffer
		b.WriteString("\uFEFF") // BOM agar Excel membaca UTF-8
		cw := csv.NewWriter(&b)
		_ = cw.Write([]string{"Laporan BranchSync", sc.Name})
		_ = cw.Write([]string{"Periode", period})
		_ = cw.Write([]string{"Cakupan", scope(sc.Filters)})
		_ = cw.Write(nil)
		_ = cw.Write([]string{"KPI", "Nilai"})
		for _, k := range d.kpis() {
			_ = cw.Write(k)
		}
		_ = cw.Write(nil)
		_ = cw.Write([]string{"Region", "Unit", "Online", "Terverifikasi", "Ulasan", "Rata-rata rating"})
		for _, rg := range d.Regions {
			_ = cw.Write(rg)
		}
		cw.Flush()
		files = append(files, mail.Attachment{Name: name + ".csv", ContentType: "text/csv; charset=utf-8", Data: b.Bytes()})
	}
	return files
}

// sendDueReports dipanggil penjadwal; mengirim laporan yang jatuh tempo.
func (s *Server) sendDueReports(ctx context.Context) {
	st, err := s.loadSettings(ctx, s.db)
	if err != nil {
		return
	}
	loc, err := time.LoadLocation(st.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	due, err := s.dueSchedules(ctx, now)
	if err != nil {
		s.log.Error("jadwal laporan", "err", err)
		return
	}
	for _, sc := range due {
		d, err := s.buildReport(ctx, sc, now)
		if err != nil {
			s.log.Error("buat laporan gagal", "id", sc.ID, "err", err)
			continue
		}
		body := fmt.Sprintf("Laporan BranchSync terlampir.\n\nJadwal: %s\nPeriode: %d hari terakhir\nCakupan: %s\n\nEmail ini dikirim otomatis oleh BranchSync.", sc.Name, map[string]int{"7": 7, "30": 30, "90": 90}[sc.Period], scope(sc.Filters))
		if err := s.mail.Send(ctx, sc.Recipients, "Laporan BranchSync — "+sc.Name, body, s.renderReport(sc, d, st.Workspace)...); err != nil {
			s.log.Error("kirim laporan gagal", "id", sc.ID, "err", err)
			continue
		}
		_, _ = s.db.Exec(ctx, `UPDATE report_schedules SET last_sent = $2 WHERE id = $1`, sc.ID, now.Format("2006-01-02"))
		_ = audit(ctx, s.db, "Penjadwal otomatis", "Internal", "Laporan & Analitik", "Mengirim laporan terjadwal", "", fmt.Sprintf("%s · %d penerima", sc.Name, len(sc.Recipients)), nil)
	}
}
