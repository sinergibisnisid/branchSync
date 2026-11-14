package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"

	"branchsync/server/internal/gbp"
	"branchsync/server/internal/hours"
)

type googleData struct {
	Account      string   `json:"account"`
	Project      string   `json:"project"`
	ClientID     string   `json:"clientId"`
	Scopes       []string `json:"scopes"`
	SyncInterval string   `json:"syncInterval"`
	QuotaLimit   int      `json:"quotaLimit"`
	PubsubTopic  string   `json:"pubsubTopic"`
	Webhook      bool     `json:"webhook"`
}

type googleConfig struct {
	Data                             googleData
	secretEnc, apiKeyEnc, refreshEnc []byte
	Connected                        bool
	LastTest                         *time.Time
	QuotaDay                         *time.Time
	QuotaUsed                        int
}

func (s *Server) loadGoogle(ctx context.Context) (*googleConfig, error) {
	g := &googleConfig{}
	var raw []byte
	err := s.db.QueryRow(ctx, `SELECT data, client_secret_enc, api_key_enc, refresh_token_enc, connected, last_test, quota_day, quota_used FROM google_config WHERE id = 1`).
		Scan(&raw, &g.secretEnc, &g.apiKeyEnc, &g.refreshEnc, &g.Connected, &g.LastTest, &g.QuotaDay, &g.QuotaUsed)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &g.Data); err != nil {
		return nil, err
	}
	if g.QuotaDay == nil || g.QuotaDay.Format("2006-01-02") != time.Now().Format("2006-01-02") {
		g.QuotaUsed = 0
	}
	return g, nil
}

// apiJSON adalah objek "api" pada /bootstrap. Rahasia tidak pernah dikirim — hanya flag.
// envSecret: client secret diatur lewat BS_GOOGLE_CLIENT_SECRET.
func (g *googleConfig) apiJSON(envSecret bool) map[string]any {
	scopes := g.Data.Scopes
	if scopes == nil {
		scopes = []string{}
	}
	return map[string]any{
		"connected": g.Connected && g.refreshEnc != nil, "account": g.Data.Account, "project": g.Data.Project,
		"quotaLimit": g.Data.QuotaLimit, "quotaUsed": g.QuotaUsed, "lastTest": g.LastTest, "webhook": g.Data.Webhook,
		"clientId": g.Data.ClientID, "hasClientSecret": g.secretEnc != nil || envSecret, "hasApiKey": g.apiKeyEnc != nil,
		"scopes": scopes, "syncInterval": g.Data.SyncInterval, "pubsubTopic": g.Data.PubsubTopic,
	}
}

var errNotConnected = fail(409, "Google Business Profile belum terhubung. Hubungkan akun di Integrasi Google terlebih dahulu.")

// gbpClient membuat klien GBP terotorisasi dari refresh token tersimpan; setiap panggilan dihitung ke kuota harian.
func (s *Server) gbpClient(ctx context.Context) (*gbp.Client, error) {
	g, err := s.loadGoogle(ctx)
	if err != nil {
		return nil, err
	}
	if !g.Connected || g.refreshEnc == nil {
		return nil, errNotConnected
	}
	refresh, err := s.box.Open(g.refreshEnc)
	if err != nil {
		return nil, err
	}
	oc, err := s.oauthConfig(ctx, "/integrations/google/oauth/callback", nil)
	if err != nil {
		return nil, err
	}
	base := context.WithValue(s.shutdown, oauth2.HTTPClient, s.http)
	client := oc.Client(base, &oauth2.Token{RefreshToken: refresh})
	client.Timeout = 30 * time.Second
	return &gbp.Client{HTTP: client, EP: s.cfg.Google, BeforeCall: s.countQuota}, nil
}

// countQuota menaikkan pemakaian kuota hari ini dan menolak bila melebihi batas.
func (s *Server) countQuota(ctx context.Context) error {
	var used, limit int
	err := s.db.QueryRow(ctx, `UPDATE google_config SET
		quota_used = CASE WHEN quota_day = current_date THEN quota_used + 1 ELSE 1 END, quota_day = current_date
		WHERE id = 1 RETURNING quota_used, coalesce((data->>'quotaLimit')::int, 0)`).Scan(&used, &limit)
	if err != nil {
		return err
	}
	if limit > 0 && used > limit {
		return &gbp.APIError{Status: 429, Code: "quota", Message: fmt.Sprintf("Kuota harian Google API (%d permintaan) habis. Naikkan batas di Integrasi Google atau tunggu besok.", limit)}
	}
	return nil
}

// ---- Konfigurasi ----

var (
	projectRe  = regexp.MustCompile(`^[a-z][a-z0-9-]{4,28}[a-z0-9]$`)
	clientIDRe = regexp.MustCompile(`^[\w-]+\.apps\.googleusercontent\.com$`)
	apiKeyRe   = regexp.MustCompile(`^AIza[0-9A-Za-z_-]{35}$`)
	topicRe    = regexp.MustCompile(`^projects/[^/]+/topics/[^/]+$`)
	emailRe    = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
)

func (s *Server) updateGoogle(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		Project      *string   `json:"project"`
		Account      *string   `json:"account"`
		ClientID     *string   `json:"clientId"`
		ClientSecret *string   `json:"clientSecret"`
		APIKey       *string   `json:"apiKey"`
		Scopes       *[]string `json:"scopes"`
		SyncInterval *string   `json:"syncInterval"`
		QuotaLimit   *int      `json:"quotaLimit"`
		PubsubTopic  *string   `json:"pubsubTopic"`
		Webhook      *bool     `json:"webhook"`
		Connected    *bool     `json:"connected"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	g, err := s.loadGoogle(r.Context())
	if err != nil {
		return err
	}
	before := g.Data
	d := &g.Data
	if in.Project != nil {
		if v := strings.TrimSpace(*in.Project); v != "" && !projectRe.MatchString(v) {
			return fail(422, "Project ID: 6–30 karakter huruf kecil, angka, atau tanda hubung.")
		}
		d.Project = strings.TrimSpace(*in.Project)
	}
	if in.Account != nil {
		if v := strings.TrimSpace(*in.Account); v != "" && !emailRe.MatchString(v) {
			return fail(422, "Email akun utama tidak valid.")
		}
		d.Account = strings.TrimSpace(*in.Account)
	}
	if in.ClientID != nil {
		if v := strings.TrimSpace(*in.ClientID); v != "" && !clientIDRe.MatchString(v) {
			return fail(422, "Client ID harus berakhiran .apps.googleusercontent.com")
		}
		d.ClientID = strings.TrimSpace(*in.ClientID)
	}
	if in.Scopes != nil {
		if !slices.Contains(*in.Scopes, "business.manage") {
			return fail(422, "Scope business.manage wajib untuk mengelola lokasi dan ulasan.")
		}
		d.Scopes = *in.Scopes
	}
	if in.SyncInterval != nil {
		if n, err := strconv.Atoi(*in.SyncInterval); err != nil || n < 5 || n > 1440 {
			return fail(422, "Interval sinkronisasi harus 5–1440 menit.")
		}
		d.SyncInterval = *in.SyncInterval
	}
	if in.QuotaLimit != nil {
		if *in.QuotaLimit < 100 || *in.QuotaLimit > 1000000 {
			return fail(422, "Batas kuota harus 100–1.000.000.")
		}
		d.QuotaLimit = *in.QuotaLimit
	}
	if in.PubsubTopic != nil {
		if v := strings.TrimSpace(*in.PubsubTopic); v != "" && !topicRe.MatchString(v) {
			return fail(422, "Format topik: projects/<project>/topics/<nama-topik>")
		}
		d.PubsubTopic = strings.TrimSpace(*in.PubsubTopic)
	}
	if in.Webhook != nil {
		d.Webhook = *in.Webhook
	}
	changes := diffGoogle(before, *d)
	var secretEnc, apiKeyEnc []byte
	if in.ClientSecret != nil && *in.ClientSecret != "" {
		if secretEnc, err = s.box.Seal(*in.ClientSecret); err != nil {
			return err
		}
		changes = append(changes, Change{"Client secret", mask(g.secretEnc != nil), "•••• (baru)"})
	}
	if in.APIKey != nil && strings.TrimSpace(*in.APIKey) != "" {
		if !apiKeyRe.MatchString(strings.TrimSpace(*in.APIKey)) {
			return fail(422, `API key Google diawali "AIza" dan terdiri dari 39 karakter.`)
		}
		if apiKeyEnc, err = s.box.Seal(strings.TrimSpace(*in.APIKey)); err != nil {
			return err
		}
		changes = append(changes, Change{"API key", mask(g.apiKeyEnc != nil), "•••• (baru)"})
	}
	disconnect := in.Connected != nil && !*in.Connected && g.Connected
	raw, _ := json.Marshal(d)
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE google_config SET data = $1,
			client_secret_enc = coalesce($2, client_secret_enc), api_key_enc = coalesce($3, api_key_enc) WHERE id = 1`, raw, secretEnc, apiKeyEnc); err != nil {
			return err
		}
		if disconnect {
			if _, err := tx.Exec(r.Context(), `UPDATE google_config SET connected = false, refresh_token_enc = NULL WHERE id = 1`); err != nil {
				return err
			}
			return audit(r.Context(), tx, u.Name, "Internal", "Integrasi Google", "Memutuskan GBP", "", d.Account, nil)
		}
		if len(changes) > 0 {
			return audit(r.Context(), tx, u.Name, "Internal", "Integrasi Google", "Memperbarui konfigurasi Google API", "", "", changes)
		}
		return nil
	})
	if err != nil {
		return err
	}
	// Notifikasi Pub/Sub ikut diperbarui bila topik/webhook berubah.
	if !disconnect && g.Connected && (before.PubsubTopic != d.PubsubTopic || before.Webhook != d.Webhook) {
		if err := s.applyNotifications(r.Context()); err != nil {
			return fail(502, "Konfigurasi tersimpan, tetapi notifikasi Google gagal diperbarui: %s", err.Error())
		}
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func mask(had bool) string {
	if had {
		return "••••"
	}
	return ""
}

func diffGoogle(a, b googleData) []Change {
	var out []Change
	add := func(f, x, y string) {
		if x != y {
			out = append(out, Change{f, x, y})
		}
	}
	add("project", a.Project, b.Project)
	add("account", a.Account, b.Account)
	add("clientId", a.ClientID, b.ClientID)
	add("scopes", strings.Join(a.Scopes, ", "), strings.Join(b.Scopes, ", "))
	add("syncInterval", a.SyncInterval, b.SyncInterval)
	add("quotaLimit", strconv.Itoa(a.QuotaLimit), strconv.Itoa(b.QuotaLimit))
	add("pubsubTopic", a.PubsubTopic, b.PubsubTopic)
	add("webhook", strconv.FormatBool(a.Webhook), strconv.FormatBool(b.Webhook))
	return out
}

// ---- OAuth: menghubungkan akun GBP ----

// gbpOAuthStartLegacy: endpoint lama tanpa autentikasi tidak lagi dipakai karena siapa pun bisa
// menghubungkan akun Google-nya sendiri ke workspace. Frontend kini memakai POST /integrations/google/oauth/url.
func (s *Server) gbpOAuthStartLegacy(w http.ResponseWriter, r *http.Request) error {
	return fail(400, "Gunakan tombol Hubungkan di halaman Integrasi Google (POST /integrations/google/oauth/url).")
}

// gbpOAuthURL membuat URL persetujuan Google yang terikat ke pengguna yang sedang masuk.
func (s *Server) gbpOAuthURL(w http.ResponseWriter, r *http.Request, u *User) error {
	var in struct {
		RedirectURI string `json:"redirect_uri"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if !s.cfg.RedirectAllowed(in.RedirectURI) {
		return fail(400, "redirect_uri tidak diizinkan. Tambahkan origin aplikasi ke BS_ALLOWED_ORIGINS.")
	}
	g, err := s.loadGoogle(r.Context())
	if err != nil {
		return err
	}
	scopes := []string{"https://www.googleapis.com/auth/business.manage", "openid", "email"}
	for _, sc := range g.Data.Scopes {
		if sc != "business.manage" && sc != "" {
			if !strings.HasPrefix(sc, "https://") {
				sc = "https://www.googleapis.com/auth/" + sc
			}
			scopes = append(scopes, sc)
		}
	}
	oc, err := s.oauthConfig(r.Context(), "/integrations/google/oauth/callback", scopes)
	if err != nil {
		return err
	}
	id := u.ID
	state, err := s.newOAuthState(r.Context(), "gbp", in.RedirectURI, &id)
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]string{"url": oc.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"))})
	return nil
}

func (s *Server) gbpOAuthCallback(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	redirect, userID, err := s.takeOAuthState(r.Context(), q.Get("state"), "gbp")
	if err != nil || userID == nil {
		return fail(400, "Sesi menghubungkan Google kedaluwarsa. Ulangi dari halaman Integrasi Google.")
	}
	u, err := s.userByID(r.Context(), *userID)
	if err != nil || !u.Can("settings.write") || u.Status != "Aktif" {
		redirectWith(w, r, redirect, "bs_gbp", "Pengguna tidak berhak menghubungkan akun Google.")
		return nil
	}
	if e := q.Get("error"); e != "" {
		redirectWith(w, r, redirect, "bs_gbp", "Persetujuan Google dibatalkan ("+e+").")
		return nil
	}
	oc, err := s.oauthConfig(r.Context(), "/integrations/google/oauth/callback", nil)
	if err != nil {
		redirectWith(w, r, redirect, "bs_gbp", err.Error())
		return nil
	}
	ctx := context.WithValue(r.Context(), oauth2.HTTPClient, s.http)
	tok, err := oc.Exchange(ctx, q.Get("code"))
	if err != nil || tok.RefreshToken == "" {
		redirectWith(w, r, redirect, "bs_gbp", "Google tidak memberikan izin akses offline. Cabut akses BranchSync di akun Google lalu hubungkan ulang.")
		return nil
	}
	email, _, _ := s.googleEmail(ctx, oc, tok)
	enc, err := s.box.Seal(tok.RefreshToken)
	if err != nil {
		return err
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE google_config SET refresh_token_enc = $1, connected = true,
			data = CASE WHEN $2 <> '' THEN jsonb_set(data, '{account}', to_jsonb($2::text)) ELSE data END WHERE id = 1`, enc, email); err != nil {
			return err
		}
		return audit(r.Context(), tx, u.Name, "Internal", "Integrasi Google", "Menghubungkan GBP", "", email, nil)
	})
	if err != nil {
		return err
	}
	// Tarik akun & lokasi di latar belakang supaya pengguna tidak menunggu.
	s.background("discover", func(ctx context.Context) {
		if res, err := s.discover(ctx, u.Name); err != nil {
			s.log.Error("penemuan GBP gagal", "err", err)
		} else {
			s.log.Info("penemuan GBP selesai", "result", res)
		}
	})
	redirectWith(w, r, redirect, "bs_gbp", "connected")
	return nil
}

func (s *Server) testGoogle(w http.ResponseWriter, r *http.Request, u *User) error {
	start := time.Now()
	res := map[string]any{"ok": true}
	c, err := s.gbpClient(r.Context())
	if err == nil {
		_, err = c.ListAccounts(r.Context())
	}
	if err != nil {
		res = map[string]any{"ok": false, "message": err.Error()}
	} else {
		res["latencyMs"] = time.Since(start).Milliseconds()
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE google_config SET last_test = now() WHERE id = 1`)
	detail := "Berhasil"
	if res["ok"] == false {
		detail = "Gagal: " + err.Error()
	}
	_ = audit(r.Context(), s.db, u.Name, "Internal", "Integrasi Google", "Menguji koneksi", "", detail, nil)
	writeJSON(w, 200, res)
	return nil
}

func (s *Server) discoverNow(w http.ResponseWriter, r *http.Request, u *User) error {
	res, err := s.discover(r.Context(), u.Name)
	if err != nil {
		return err
	}
	writeJSON(w, 200, res)
	return nil
}

func (s *Server) applyNotifications(ctx context.Context) error {
	g, err := s.loadGoogle(ctx)
	if err != nil {
		return err
	}
	c, err := s.gbpClient(ctx)
	if err != nil {
		return err
	}
	topic := ""
	if g.Data.Webhook {
		topic = g.Data.PubsubTopic
	}
	rows, err := s.db.Query(ctx, `SELECT account_id FROM accounts WHERE account_id IS NOT NULL`)
	if err != nil {
		return err
	}
	accounts, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for _, a := range accounts {
		if err := c.UpdateNotifications(ctx, a, topic); err != nil {
			return err
		}
	}
	return nil
}

// ---- Penemuan akun & lokasi ----

type discoverResult struct {
	Accounts int `json:"accounts"`
	Linked   int `json:"linked"`
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
}

var accountNumRe = regexp.MustCompile(`accounts/(\d+)`)

// discover menarik akun & lokasi GBP: lokasi dengan storeCode = kode unit dihubungkan, lokasi baru diimpor.
func (s *Server) discover(ctx context.Context, by string) (*discoverResult, error) {
	c, err := s.gbpClient(ctx)
	if err != nil {
		return nil, err
	}
	accounts, err := c.ListAccounts(ctx)
	if err != nil {
		return nil, err
	}
	res := &discoverResult{}
	for _, a := range accounts {
		if a.Type == "PERSONAL" && len(accounts) > 1 {
			continue // akun pribadi pengguna biasanya kosong; grup lokasi BRI berupa LOCATION_GROUP/ORGANIZATION
		}
		id := "gbp-" + strings.TrimPrefix(a.Name, "accounts/")
		if m := accountNumRe.FindStringSubmatch(a.Name); m != nil {
			id = "gbp-" + m[1]
		}
		if _, err := s.db.Exec(ctx, `INSERT INTO accounts (id, name, account_id) VALUES ($1,$2,$3)
			ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, account_id = EXCLUDED.account_id`, id, a.AccountName, a.Name); err != nil {
			return nil, err
		}
		res.Accounts++
		locs, err := c.ListLocations(ctx, a.Name)
		if err != nil {
			return nil, err
		}
		for i := range locs {
			ok, imported, err := s.linkOrImport(ctx, id, &locs[i])
			if err != nil {
				return nil, err
			}
			switch {
			case imported:
				res.Imported++
			case ok:
				res.Linked++
			default:
				res.Skipped++
			}
		}
	}
	_ = audit(ctx, s.db, by, "Internal", "Integrasi Google", "Menarik lokasi dari Google Business Profile", "",
		fmt.Sprintf("%d akun · %d terhubung · %d diimpor · %d dilewati", res.Accounts, res.Linked, res.Imported, res.Skipped), nil)
	if g, err := s.loadGoogle(ctx); err == nil && g.Data.Webhook && g.Data.PubsubTopic != "" {
		if err := s.applyNotifications(ctx); err != nil {
			s.log.Warn("notifikasi Pub/Sub gagal diatur", "err", err)
		}
	}
	return res, nil
}

var storeCodeRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$`)

func guessType(l *gbp.Location) string {
	if l.Categories != nil && strings.Contains(l.Categories.PrimaryCategory.Name, "atm") {
		return "ATM"
	}
	t := strings.ToUpper(l.Title)
	switch {
	case strings.Contains(t, "ATM"):
		return "ATM"
	case strings.Contains(t, "KCP") || strings.Contains(t, "KANTOR CABANG PEMBANTU"):
		return "KCP"
	case strings.Contains(t, "UNIT"):
		return "Unit"
	}
	return "Kantor Cabang"
}

func (s *Server) linkOrImport(ctx context.Context, accountID string, l *gbp.Location) (linked, imported bool, err error) {
	var code string
	var lat, lng float64
	err = s.db.QueryRow(ctx, `SELECT code, lat, lng FROM locations WHERE gbp_name = $1 OR (gbp_name IS NULL AND code = $2) LIMIT 1`, l.Name, l.StoreCode).Scan(&code, &lat, &lng)
	if err == nil {
		snap, _ := json.Marshal(gbp.ToSnapshot(l, lat, lng))
		_, err = s.db.Exec(ctx, `UPDATE locations SET gbp_name = $1, account_id = $2, google = $3 WHERE code = $4`, l.Name, accountID, snap, code)
		return err == nil, false, err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, false, err
	}
	if l.Latlng == nil || (l.Latlng.Latitude == 0 && l.Latlng.Longitude == 0) {
		return false, false, nil // tanpa koordinat tidak bisa ditampilkan di peta
	}
	snapshot := gbp.ToSnapshot(l, l.Latlng.Latitude, l.Latlng.Longitude)
	code = l.StoreCode
	var exists bool
	_ = s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM locations WHERE code = $1)`, code).Scan(&exists)
	if !storeCodeRe.MatchString(code) || exists {
		if code, err = nextID(ctx, s.db, "location_code_seq", "BS-%05d"); err != nil {
			return false, false, err
		}
	}
	var spec hours.Spec
	if l.RegularHours != nil {
		spec = hours.FromGoogle(l.RegularHours.Periods)
	}
	specJSON, _ := json.Marshal(spec)
	if spec == nil {
		specJSON = nil
	}
	city, province := "", ""
	if a := l.StorefrontAddress; a != nil {
		city, province = a.Locality, a.AdministrativeArea
	}
	gbpStatus := "Belum Diklaim"
	if l.Metadata != nil && l.Metadata.HasVoiceOfMerchant {
		gbpStatus = "Terverifikasi"
	}
	snap, _ := json.Marshal(snapshot)
	_, err = s.db.Exec(ctx, `INSERT INTO locations (code, name, type, city, province, region, address, phone, hours, hours_spec, lat, lng, status, account_id, gbp, google, gbp_name, updated_by, last_sync)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Online',$13,$14,$15,$16,'Google Business Profile', now())`,
		code, l.Title, guessType(l), city, province, regionOf(province), snapshot.Address, snapshot.Phone, snapshot.Hours, specJSON,
		snapshot.Lat, snapshot.Lng, accountID, gbpStatus, snap, l.Name)
	return err == nil, err == nil, err
}

// ---- Pub/Sub push ----

// pubsubPush menerima notifikasi GBP dari Google Cloud Pub/Sub (subscription push ke
// {BS_PUBLIC_URL}/integrations/google/pubsub?token=<BS_PUBSUB_TOKEN>).
func (s *Server) pubsubPush(w http.ResponseWriter, r *http.Request) error {
	if s.cfg.PubSubToken == "" || !constantEq(r.URL.Query().Get("token"), s.cfg.PubSubToken) {
		return fail(403, "Token Pub/Sub tidak valid.")
	}
	var in struct {
		Message struct {
			Data       string            `json:"data"`
			Attributes map[string]string `json:"attributes"`
		} `json:"message"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	raw, _ := base64.StdEncoding.DecodeString(in.Message.Data)
	var n struct {
		Type     string `json:"type"`
		Location string `json:"location"` // accounts/1/locations/2 atau locations/2
	}
	_ = json.Unmarshal(raw, &n)
	if n.Type == "" {
		n.Type = in.Message.Attributes["type"]
	}
	loc := n.Location
	if i := strings.Index(loc, "locations/"); i >= 0 {
		loc = loc[i:]
	}
	if loc != "" {
		s.background("pubsub", func(ctx context.Context) {
			var code string
			if err := s.db.QueryRow(ctx, `SELECT code FROM locations WHERE gbp_name = $1`, loc).Scan(&code); err != nil {
				return
			}
			c, err := s.gbpClient(ctx)
			if err != nil {
				return
			}
			if err := s.pullLocation(ctx, c, code, "Notifikasi Google"); err != nil {
				s.log.Warn("pubsub: tarik lokasi gagal", "code", code, "err", err)
			}
			if strings.Contains(n.Type, "REVIEW") {
				if _, err := s.pullReviews(ctx, c, code); err != nil {
					s.log.Warn("pubsub: tarik ulasan gagal", "code", code, "err", err)
				}
			}
		})
	}
	w.WriteHeader(http.StatusNoContent) // Pub/Sub menganggap 2xx = pesan diterima
	return nil
}
