package app

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Scheduler menjalankan job berkala sampai Close dipanggil:
//   - sinkronisasi otomatis tiap syncInterval menit: kirim unit yang berubah di Dashboard, tarik perubahan Google
//     dan ulasan baru (bergiliran, dibatasi kuota),
//   - laporan terjadwal (dicek tiap 10 menit),
//   - pembersihan sesi/OTP/state OAuth kedaluwarsa (tiap jam).
func (s *Server) Scheduler() {
	s.background("scheduler", func(ctx context.Context) {
		tick := time.NewTicker(time.Minute)
		defer tick.Stop()
		var lastAuto, lastReports, lastCleanup time.Time
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-tick.C:
				if now.Sub(lastCleanup) >= time.Hour {
					lastCleanup = now
					s.cleanup(ctx)
				}
				if now.Sub(lastReports) >= 10*time.Minute {
					lastReports = now
					s.sendDueReports(ctx)
				}
				g, err := s.loadGoogle(ctx)
				if err != nil || !g.Connected || g.refreshEnc == nil {
					continue
				}
				every, _ := strconv.Atoi(g.Data.SyncInterval)
				if every < 5 {
					every = 60
				}
				if now.Sub(lastAuto) >= time.Duration(every)*time.Minute {
					lastAuto = now
					s.autoSync(ctx, g.Data.Webhook && g.Data.PubsubTopic != "")
				}
			}
		}
	})
}

func (s *Server) cleanup(ctx context.Context) {
	for _, q := range []string{
		`DELETE FROM sessions WHERE expires_at < now()`,
		`DELETE FROM otp_codes WHERE expires_at < now()`,
		`DELETE FROM oauth_states WHERE expires_at < now()`,
	} {
		if _, err := s.db.Exec(ctx, q); err != nil {
			s.log.Warn("pembersihan gagal", "err", err)
		}
	}
}

// autoPullBatch: maksimal lokasi yang ditarik per putaran (tiap lokasi ±3–4 panggilan API).
const autoPullBatch = 300

func (s *Server) autoSync(ctx context.Context, webhook bool) {
	// 1) Kirim unit dengan perubahan yang belum terkirim.
	rows, err := s.db.Query(ctx, `SELECT code FROM locations WHERE cardinality(pending) > 0 AND gbp <> 'Duplikat' AND status <> 'Tidak Aktif' ORDER BY updated_at LIMIT 2000`)
	if err != nil {
		return
	}
	codes, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err == nil && len(codes) > 0 && s.syncMu.TryLock() {
		if _, err := s.syncCodes(ctx, codes, false, "Perubahan Dashboard (otomatis)", "Penjadwal otomatis"); err != nil {
			s.log.Warn("sinkronisasi otomatis gagal", "err", err)
		}
		s.syncMu.Unlock()
	}
	// 2) Tarik perubahan Google & ulasan secara bergiliran. Bila notifikasi Pub/Sub aktif, perubahan sudah
	//    datang lewat notifikasi; tarikan berkala hanya pengaman dengan porsi lebih kecil.
	batch := autoPullBatch
	if webhook {
		batch = autoPullBatch / 5
	}
	rows, err = s.db.Query(ctx, `SELECT code FROM locations WHERE gbp_name IS NOT NULL AND status <> 'Tidak Aktif' ORDER BY last_sync NULLS FIRST LIMIT $1`, batch)
	if err != nil {
		return
	}
	pull, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil || len(pull) == 0 {
		return
	}
	c, err := s.gbpClient(ctx)
	if err != nil {
		return
	}
	newReviews := 0
	for _, code := range pull {
		if ctx.Err() != nil {
			return
		}
		if err := s.pullLocation(ctx, c, code, "Penjadwal otomatis"); err != nil {
			s.log.Warn("tarik lokasi gagal", "code", code, "err", err)
			if isQuota(err) {
				return
			}
			continue
		}
		n, err := s.pullReviews(ctx, c, code)
		if err != nil && isQuota(err) {
			return
		}
		newReviews += n
	}
	s.log.Info("tarikan berkala selesai", "lokasi", len(pull), "ulasan_baru", newReviews)
}

func isQuota(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "Kuota harian") || strings.Contains(err.Error(), "Kuota Google"))
}
