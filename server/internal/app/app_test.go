package app

// Tes integrasi: PostgreSQL sungguhan (BS_TEST_DATABASE_URL, skema dikosongkan tiap tes) + server Google tiruan.
//   BS_TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/branchsync_test?sslmode=disable go test ./...

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"branchsync/server/internal/config"
	"branchsync/server/internal/db"
	"branchsync/server/internal/mail"
)

type capMail struct {
	mu   sync.Mutex
	sent []struct {
		To      []string
		Subject string
		Body    string
		Files   []mail.Attachment
	}
}

func (c *capMail) Send(_ context.Context, to []string, subject, body string, files ...mail.Attachment) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sent = append(c.sent, struct {
		To      []string
		Subject string
		Body    string
		Files   []mail.Attachment
	}{to, subject, body, files})
	return nil
}

type env struct {
	t      *testing.T
	srv    *Server
	api    *httptest.Server
	google *fakeGoogle
	mail   *capMail
	token  string
}

func setup(t *testing.T) *env {
	t.Helper()
	dsn := os.Getenv("BS_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("BS_TEST_DATABASE_URL belum diatur — tes integrasi dilewati")
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	g := newFakeGoogle()
	cfg := &config.Config{PublicURL: "http://api.test/v1", BasePath: "/v1", Origins: []string{"http://app.test", "null"},
		SecretKey: bytes.Repeat([]byte{7}, 32), SessionTTL: time.Hour, PubSubToken: "pubsub-secret", Google: g.endpoints()}
	m := &capMail{}
	s, err := New(cfg, pool, m, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	api := httptest.NewServer(s.Handler())
	t.Cleanup(func() { api.Close(); s.Close(); g.srv.Close(); pool.Close() })
	hash, _ := HashPassword("rahasia-admin-123")
	if _, err := pool.Exec(ctx, `INSERT INTO users (name, email, username, role, password_hash) VALUES ('Rina Admin','admin@bri.test','rina','Administrator',$1)`, hash); err != nil {
		t.Fatal(err)
	}
	return &env{t: t, srv: s, api: api, google: g, mail: m}
}

// call mengirim permintaan ke API (path tanpa /v1) dan mengembalikan status + body JSON.
func (e *env) call(method, path string, body any, token ...string) (int, map[string]any) {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, e.api.URL+"/v1"+path, rd)
	req.Header.Set("Content-Type", "application/json")
	tok := e.token
	if len(token) > 0 {
		tok = token[0]
	}
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	out := map[string]any{}
	if len(raw) > 0 && raw[0] == '{' {
		_ = json.Unmarshal(raw, &out)
	}
	return res.StatusCode, out
}

func (e *env) must(status int, want int, out map[string]any, what string) {
	e.t.Helper()
	if status != want {
		e.t.Fatalf("%s: status %d, ingin %d — %v", what, status, want, out)
	}
}

func (e *env) bootstrap() map[string]any {
	e.t.Helper()
	st, out := e.call("GET", "/bootstrap", nil)
	e.must(st, 200, out, "bootstrap")
	return out
}

func list(m map[string]any, k string) []map[string]any {
	var out []map[string]any
	for _, x := range m[k].([]any) {
		out = append(out, x.(map[string]any))
	}
	return out
}

func find(xs []map[string]any, k, v string) map[string]any {
	for _, x := range xs {
		if fmt.Sprint(x[k]) == v {
			return x
		}
	}
	return nil
}

func (e *env) login() {
	st, out := e.call("POST", "/auth/login", map[string]string{"username": "rina", "password": "rahasia-admin-123"})
	e.must(st, 200, out, "login")
	e.token = out["token"].(string)
}

// connectGoogle menjalankan alur OAuth GBP: atur client → URL persetujuan → callback dengan kode dari "Google".
func (e *env) connectGoogle() {
	e.t.Helper()
	st, out := e.call("PATCH", "/integrations/google", map[string]any{"clientId": "123-abc.apps.googleusercontent.com", "clientSecret": "s3cret", "quotaLimit": 5000})
	e.must(st, 204, out, "atur google")
	st, out = e.call("POST", "/integrations/google/oauth/url", map[string]string{"redirect_uri": "http://app.test/index.html"})
	e.must(st, 200, out, "oauth url")
	u, _ := url.Parse(out["url"].(string))
	if !strings.HasPrefix(out["url"].(string), e.google.srv.URL+"/auth") || u.Query().Get("access_type") != "offline" || !strings.Contains(u.Query().Get("scope"), "business.manage") {
		e.t.Fatalf("URL persetujuan salah: %s", out["url"])
	}
	cb := e.api.URL + "/v1/integrations/google/oauth/callback?state=" + url.QueryEscape(u.Query().Get("state")) + "&code=good-code"
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := client.Get(cb)
	if err != nil {
		e.t.Fatal(err)
	}
	res.Body.Close()
	if loc := res.Header.Get("Location"); res.StatusCode != 302 || loc != "http://app.test/index.html#bs_gbp=connected" {
		e.t.Fatalf("callback: %d %s", res.StatusCode, loc)
	}
	// penemuan berjalan di latar belakang
	for i := 0; i < 100; i++ {
		if b := e.bootstrap(); len(list(b, "locations")) > 0 {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	e.t.Fatal("penemuan lokasi tidak selesai")
}

func TestAuthAndPermissions(t *testing.T) {
	e := setup(t)
	st, out := e.call("GET", "/health", nil)
	e.must(st, 200, out, "health")
	st, _ = e.call("GET", "/bootstrap", nil)
	e.must(st, 401, nil, "tanpa token")
	st, out = e.call("POST", "/auth/login", map[string]string{"username": "rina", "password": "salah"})
	e.must(st, 401, out, "sandi salah")
	if out["message"] != "Nama pengguna atau kata sandi salah." {
		t.Fatalf("pesan: %v", out)
	}
	for i := 0; i < 10; i++ { // login berhasil berulang tidak boleh mengunci akun
		e.login()
	}
	for i := 0; i < 8; i++ {
		e.call("POST", "/auth/login", map[string]string{"username": "korban", "password": "salah"})
	}
	st, out = e.call("POST", "/auth/login", map[string]string{"username": "korban", "password": "salah"})
	e.must(st, 429, out, "terkunci setelah 8 kegagalan")
	st, me := e.call("GET", "/me", nil)
	e.must(st, 200, me, "me")
	if me["role"] != "Administrator" || len(me["permissions"].([]any)) != len(Perms) {
		t.Fatalf("me: %v", me)
	}
	b := e.bootstrap()
	if len(list(b, "roles")) != 3 || b["settings"].(map[string]any)["dupRadius"].(float64) != 150 {
		t.Fatalf("bootstrap awal: %v", b["roles"])
	}
	// Viewer tidak boleh mengubah unit; audit & daftar pengguna lain disembunyikan.
	st, out = e.call("POST", "/users", map[string]any{"name": "Vina Viewer", "email": "vina@bri.test", "role": "Viewer", "status": "Aktif", "password": "viewer-pass-123"})
	e.must(st, 201, out, "buat viewer")
	st, vout := e.call("POST", "/auth/login", map[string]string{"username": "vina@bri.test", "password": "viewer-pass-123"})
	e.must(st, 200, vout, "login viewer")
	vt := vout["token"].(string)
	st, out = e.call("POST", "/locations", map[string]any{"name": "X"}, vt)
	e.must(st, 403, out, "viewer tambah unit")
	if !strings.Contains(out["message"].(string), "locations.write") {
		t.Fatalf("pesan 403: %v", out)
	}
	_, vb := e.call("GET", "/bootstrap", nil, vt)
	if len(list(vb, "users")) != 1 || len(list(vb, "audit")) == 0 { // Viewer punya audit.read
		t.Fatalf("bootstrap viewer: users=%d", len(list(vb, "users")))
	}
	// Tidak boleh menonaktifkan diri sendiri; menonaktifkan pengguna lain memutus sesinya.
	adminID := fmt.Sprint(find(list(b, "users"), "email", "admin@bri.test")["id"])
	st, out = e.call("PATCH", "/users/"+adminID, map[string]any{"status": "Nonaktif"})
	e.must(st, 409, out, "nonaktifkan diri")
	vid := fmt.Sprint(find(list(e.bootstrap(), "users"), "email", "vina@bri.test")["id"])
	st, out = e.call("PATCH", "/users/"+vid, map[string]any{"status": "Nonaktif"})
	e.must(st, 204, out, "nonaktifkan viewer")
	st, _ = e.call("GET", "/me", nil, vt)
	e.must(st, 401, nil, "sesi viewer diputus")
	// Peran: izin tak dikenal ditolak; Administrator tidak boleh kehilangan users.manage terakhir.
	st, out = e.call("PATCH", "/roles/Administrator", map[string]any{"permissions": []string{"locations.read"}})
	e.must(st, 409, out, "kunci admin")
	st, out = e.call("POST", "/roles", map[string]any{"name": "Auditor", "permissions": []string{"audit.read", "hack"}})
	e.must(st, 422, out, "izin tak dikenal")
	// CORS
	req, _ := http.NewRequest("OPTIONS", e.api.URL+"/v1/bootstrap", nil)
	req.Header.Set("Origin", "http://app.test")
	res, _ := http.DefaultClient.Do(req)
	if res.StatusCode != 204 || res.Header.Get("Access-Control-Allow-Origin") != "http://app.test" {
		t.Fatalf("CORS: %d %v", res.StatusCode, res.Header)
	}
	req.Header.Set("Origin", "http://jahat.test")
	res, _ = http.DefaultClient.Do(req)
	if res.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("origin asing tidak boleh diizinkan")
	}
	// Logout
	st, _ = e.call("POST", "/auth/logout", nil)
	e.must(st, 204, nil, "logout")
	st, _ = e.call("GET", "/me", nil)
	e.must(st, 401, nil, "setelah logout")
}

func TestOTP(t *testing.T) {
	e := setup(t)
	st, _ := e.call("POST", "/auth/otp/request", map[string]string{"email": "tidak.ada@bri.test"})
	e.must(st, 204, nil, "email tak terdaftar (respons sama)")
	if len(e.mail.sent) != 0 {
		t.Fatal("email tak terdaftar tidak boleh dikirimi kode")
	}
	st, _ = e.call("POST", "/auth/otp/request", map[string]string{"email": "Admin@BRI.test"})
	e.must(st, 204, nil, "minta OTP")
	code := regexp.MustCompile(`\d{6}`).FindString(e.mail.sent[0].Subject)
	st, out := e.call("POST", "/auth/otp/verify", map[string]string{"email": "admin@bri.test", "code": "000000"})
	if code == "000000" {
		st = 401
	}
	e.must(st, 401, out, "kode salah")
	st, out = e.call("POST", "/auth/otp/verify", map[string]string{"email": "admin@bri.test", "code": code})
	e.must(st, 200, out, "kode benar")
	st, _ = e.call("POST", "/auth/otp/verify", map[string]string{"email": "admin@bri.test", "code": code})
	e.must(st, 401, nil, "kode sekali pakai")
}

func TestLocationsLifecycle(t *testing.T) {
	e := setup(t)
	e.login()
	spec := map[string]any{"mon": map[string]any{"open": true, "h24": false, "ranges": []map[string]string{{"from": "08:00", "to": "15:00"}}}}
	unit := map[string]any{"name": "KCP Uji Dago", "type": "KCP", "city": "Bandung", "province": "Jawa Barat", "address": "Jl. Dago 1", "phone": "(022) 1",
		"hoursSpec": spec, "lat": -6.89, "lng": 107.61, "status": "Belum Sync"}
	st, out := e.call("POST", "/locations", unit)
	e.must(st, 201, out, "tambah unit")
	code := out["code"].(string)
	if out["hours"] != "Sen 08.00–15.00" || out["region"] != "Jawa" {
		t.Fatalf("unit: %v", out)
	}
	st, out = e.call("POST", "/locations", unit)
	e.must(st, 409, out, "nama ganda")
	bad := map[string]any{}
	for k, v := range unit {
		bad[k] = v
	}
	bad["name"], bad["lat"] = "Di Luar", 40.0
	st, out = e.call("POST", "/locations", bad)
	e.must(st, 422, out, "di luar Indonesia")
	st, out = e.call("PATCH", "/locations/"+code, map[string]any{"phone": "(022) 999"})
	e.must(st, 200, out, "ubah telepon")
	b := e.bootstrap()
	a := find(list(b, "audit"), "action", "Memperbarui unit")
	if a == nil || a["changes"].([]any)[0].(map[string]any)["after"] != "(022) 999" {
		t.Fatalf("audit ubah: %v", a)
	}
	// impor: perbarui yang ada, buat baru dengan kode dari file, buat baru dengan kode server
	st, out = e.call("POST", "/locations/import", map[string]any{"items": []map[string]any{
		{"code": code, "exists": true, "name": "KCP Uji Dago", "type": "KCP", "city": "Bandung", "province": "Jawa Barat", "address": "Jl. Dago 2", "phone": "(022) 999", "hours": "Sen–Jum 08.00–15.00", "lat": -6.89, "lng": 107.61, "status": "Online"},
		{"code": "POI-PWK-01", "exists": false, "name": "Unit Purwakarta", "type": "Unit", "city": "Purwakarta", "province": "Jawa Barat", "address": "Jl. A", "phone": "", "hours": "Setiap hari 24 jam", "lat": -6.55, "lng": 107.44, "status": ""},
		{"code": nil, "exists": false, "name": "ATM Cimahi", "type": "ATM", "city": "Cimahi", "province": "Jawa Barat", "address": "Jl. B", "phone": "", "hours": "", "lat": -6.87, "lng": 107.54},
	}})
	e.must(st, 200, out, "impor")
	if out["added"].(float64) != 2 || out["updated"].(float64) != 1 {
		t.Fatalf("impor: %v", out)
	}
	locs := list(e.bootstrap(), "locations")
	if len(locs) != 3 || find(locs, "code", "POI-PWK-01")["status"] != "Belum Sync" {
		t.Fatalf("hasil impor: %v", locs)
	}
	st, out = e.call("POST", "/locations/bulk-update", map[string]any{"codes": []string{code, "POI-PWK-01"}, "patch": map[string]string{"status": "Offline"}})
	e.must(st, 204, out, "status massal")
	st, out = e.call("POST", "/locations/bulk-update", map[string]any{"codes": []string{code}, "patch": map[string]string{"name": "x"}})
	e.must(st, 422, out, "massal selain status")
	st, out = e.call("POST", "/locations/bulk-delete", map[string]any{"codes": []string{"POI-PWK-01"}})
	e.must(st, 204, out, "hapus massal")
	st, out = e.call("DELETE", "/locations/"+code, nil)
	e.must(st, 204, out, "hapus")
	st, out = e.call("DELETE", "/locations/"+code, nil)
	e.must(st, 404, out, "hapus lagi")
	// duplikat & catatan
	locs = list(e.bootstrap(), "locations")
	st, _ = e.call("POST", "/duplicates/ignore", map[string]string{"a": "Z-2", "b": "A-1"})
	e.must(st, 204, nil, "bukan duplikat")
	if b := e.bootstrap(); b["dupIgnored"].([]any)[0] != "A-1|Z-2" {
		t.Fatalf("dupIgnored: %v", b["dupIgnored"])
	}
	st, out = e.call("PATCH", "/settings", map[string]any{"workspace": "BRI", "timezone": "Asia/Jakarta", "slaInternal": 24, "slaGoogle": 120, "dupRadius": 5, "coordTol": 50})
	e.must(st, 422, out, "radius tidak valid")
	st, out = e.call("PATCH", "/settings", map[string]any{"workspace": "BRI Uji", "timezone": "Asia/Makassar", "slaInternal": 12, "slaGoogle": 120, "dupRadius": 100, "coordTol": 50})
	e.must(st, 204, out, "pengaturan")
	if s := e.bootstrap()["settings"].(map[string]any); s["timezone"] != "Asia/Makassar" || s["slaInternal"].(float64) != 12 {
		t.Fatalf("settings: %v", s)
	}
	_ = locs
}

func TestGoogleFlow(t *testing.T) {
	e := setup(t)
	e.login()
	st, out := e.call("POST", "/sync", map[string]any{"codes": nil, "label": "Semua unit"})
	e.must(st, 409, out, "sync sebelum terhubung")

	e.connectGoogle()
	b := e.bootstrap()
	api := b["api"].(map[string]any)
	if api["connected"] != true || api["hasClientSecret"] != true || api["account"] != "admin@bri.test" {
		t.Fatalf("api: %v", api)
	}
	if raw, _ := json.Marshal(b); strings.Contains(string(raw), "s3cret") || strings.Contains(string(raw), "refresh-xyz") {
		t.Fatal("rahasia bocor di /bootstrap")
	}
	locs := list(b, "locations")
	g1 := find(locs, "code", "G-001")
	if g1 == nil || len(locs) != 1 || g1["hours"] != "Sen 08.00–15.00" || g1["gbp"] != "Terverifikasi" || g1["accountId"] != "gbp-1" {
		t.Fatalf("lokasi hasil penemuan: %v", locs)
	}
	if len(list(b, "accounts")) != 1 {
		t.Fatal("akun GBP tidak tersimpan")
	}

	// Unit baru → sinkronisasi membuat listing di Google (satu-satunya akun).
	st, out = e.call("POST", "/locations", map[string]any{"name": "KCP Baru", "type": "KCP", "city": "Bogor", "province": "Jawa Barat", "address": "Jl. Baru 1",
		"phone": "(0251) 1", "hours": "Sen–Jum 08.00–15.00", "lat": -6.6, "lng": 106.8})
	e.must(st, 201, out, "unit baru")
	newCode := out["code"].(string)
	st, run := e.call("POST", "/sync", map[string]any{"codes": []string{newCode}, "label": "KCP Baru"})
	e.must(st, 200, run, "sync unit baru")
	if run["ok"].(float64) != 1 || e.google.count("POST /bi/accounts/1/locations") != 1 {
		t.Fatalf("run: %v calls=%v", run, e.google.calls)
	}
	created := e.google.lastBody("POST /bi/accounts/1/locations")
	if !strings.Contains(created, `"storeCode":"`+newCode+`"`) || !strings.Contains(created, `"openDay":"FRIDAY"`) || !strings.Contains(created, "gcid:bank") {
		t.Fatalf("body create: %s", created)
	}

	// Ubah telepon di Dashboard → sync mengirim PATCH dengan updateMask phoneNumbers saja.
	st, out = e.call("PATCH", "/locations/G-001", map[string]any{"phone": "(021) 777"})
	e.must(st, 200, out, "ubah telepon")
	st, run = e.call("POST", "/sync", map[string]any{"codes": []string{"G-001"}, "label": "G-001"})
	e.must(st, 200, run, "sync telepon")
	patched := false
	for _, c := range e.google.calls {
		if strings.HasPrefix(c, "PATCH /bi/locations/1?updateMask=phoneNumbers") {
			patched = true
		}
	}
	if !patched || run["ok"].(float64) != 1 {
		t.Fatalf("PATCH tidak terkirim: %v %v", run, e.google.calls)
	}
	g1 = find(list(e.bootstrap(), "locations"), "code", "G-001")
	if g1["google"].(map[string]any)["phone"] != "(021) 777" || g1["status"] != "Online" {
		t.Fatalf("snapshot setelah sync: %v", g1)
	}

	// Perubahan dari Google (diffMask title) → Persetujuan Edit; disetujui → Dashboard ikut.
	e.google.mu.Lock()
	upd := map[string]any{}
	for k, v := range e.google.locations["locations/1"] {
		upd[k] = v
	}
	upd["title"] = "KC Google Satu (baru)"
	e.google.updated["locations/1"] = map[string]any{"location": upd, "diffMask": "title"}
	e.google.mu.Unlock()
	st, run = e.call("POST", "/sync", map[string]any{"codes": []string{"G-001"}, "label": "G-001"})
	e.must(st, 200, run, "sync perubahan Google")
	ap := find(list(e.bootstrap(), "approvals"), "code", "G-001")
	if ap == nil || ap["after"] != "KC Google Satu (baru)" || ap["status"] != "Menunggu" {
		t.Fatalf("approval: %v", ap)
	}
	st, out = e.call("POST", "/approvals/"+ap["id"].(string)+"/approve", nil)
	e.must(st, 204, out, "setujui")
	if find(list(e.bootstrap(), "locations"), "code", "G-001")["name"] != "KC Google Satu (baru)" {
		t.Fatal("nama tidak ikut disetujui")
	}
	st, _ = e.call("POST", "/approvals/"+ap["id"].(string)+"/approve", nil)
	e.must(st, 409, nil, "setujui dua kali")
	e.google.mu.Lock()
	delete(e.google.updated, "locations/1")
	e.google.mu.Unlock()

	// Ketidaksesuaian: kirim data Dashboard ke Google; koordinat ditolak dengan pesan jelas.
	st, out = e.call("PATCH", "/locations/G-001", map[string]any{"address": "Jl. Dashboard 9"})
	e.must(st, 200, out, "ubah alamat")
	st, out = e.call("POST", "/discrepancies/resolve", map[string]string{"code": "G-001", "field": "address", "source": "dashboard"})
	e.must(st, 204, out, "kirim alamat")
	if !strings.Contains(e.google.lastBody("PATCH /bi/locations/1"), "Jl. Dashboard 9") {
		t.Fatal("alamat tidak dikirim ke Google")
	}
	st, out = e.call("POST", "/discrepancies/resolve", map[string]string{"code": "G-001", "field": "coords", "source": "dashboard"})
	e.must(st, 422, out, "koordinat ke Google")
	st, out = e.call("POST", "/discrepancies/resolve", map[string]string{"code": "G-001", "field": "coords", "source": "google"})
	e.must(st, 204, out, "koordinat dari Google")
	st, out = e.call("PUT", "/discrepancies/notes", map[string]string{"code": "G-001", "field": "phone", "text": "Sudah dicek ke cabang"})
	e.must(st, 204, out, "catatan")

	// Ulasan via notifikasi Pub/Sub → balas → hapus balasan.
	msg := base64.StdEncoding.EncodeToString([]byte(`{"type":"NEW_REVIEW","location":"accounts/1/locations/1"}`))
	st, _ = e.call("POST", "/integrations/google/pubsub?token=salah", map[string]any{"message": map[string]any{"data": msg}}, "-")
	e.must(st, 403, nil, "token pubsub salah")
	st, _ = e.call("POST", "/integrations/google/pubsub?token=pubsub-secret", map[string]any{"message": map[string]any{"data": msg}}, "-")
	e.must(st, 204, nil, "pubsub")
	var rv map[string]any
	for i := 0; i < 100 && rv == nil; i++ {
		time.Sleep(30 * time.Millisecond)
		if rs := list(e.bootstrap(), "reviews"); len(rs) > 0 {
			rv = rs[0]
		}
	}
	if rv == nil || rv["author"] != "Budi" || rv["rating"].(float64) != 4 {
		t.Fatalf("ulasan: %v", rv)
	}
	st, out = e.call("PUT", "/reviews/"+rv["id"].(string)+"/reply", map[string]string{"text": "Terima kasih, Budi!"})
	e.must(st, 204, out, "balas")
	if e.google.count("PUT /v4/accounts/1/locations/1/reviews/r1/reply") != 1 || !strings.Contains(e.google.lastBody("PUT /v4/"), "Terima kasih") {
		t.Fatalf("balasan tidak dikirim: %v", e.google.calls)
	}
	st, out = e.call("PUT", "/reviews/"+rv["id"].(string)+"/reply", map[string]string{"text": strings.Repeat("a", 4097)})
	e.must(st, 422, out, "balasan terlalu panjang")
	st, out = e.call("DELETE", "/reviews/"+rv["id"].(string)+"/reply", nil)
	e.must(st, 204, out, "hapus balasan")
	if find(list(e.bootstrap(), "reviews"), "id", rv["id"].(string))["reply"] != nil {
		t.Fatal("balasan masih ada")
	}

	// Titik baru: listing dibuat di Google saat masuk tahap verifikasi; unit dibuat saat selesai.
	st, out = e.call("POST", "/claims", map[string]any{"kind": "Titik baru", "note": "usulan", "proposal": map[string]any{"name": "Unit Lembang", "type": "Unit",
		"city": "Bandung Barat", "province": "Jawa Barat", "address": "Jl. Lembang 1", "phone": "", "hours": "Sen–Sab 08.00–14.00", "lat": -6.81, "lng": 107.62}})
	e.must(st, 201, out, "ajukan titik baru")
	kl := out["id"].(string)
	st, out = e.call("POST", "/claims/"+kl+"/advance", map[string]string{"to": "Selesai"})
	e.must(st, 409, out, "lompat tahap")
	for _, to := range []string{"Diproses internal", "Menunggu verifikasi Google", "Selesai"} {
		st, out = e.call("POST", "/claims/"+kl+"/advance", map[string]string{"to": to})
		e.must(st, 204, out, "tahap "+to)
	}
	b = e.bootstrap()
	c := find(list(b, "claims"), "id", kl)
	nl := find(list(b, "locations"), "name", "Unit Lembang")
	if c["status"] != "Selesai" || nl == nil || c["code"] != nl["code"] || e.google.count("POST /bi/accounts/1/locations") != 2 {
		t.Fatalf("klaim titik baru: %v %v", c, nl)
	}

	// Uji koneksi + putuskan
	st, out = e.call("POST", "/integrations/google/test", nil)
	e.must(st, 200, out, "uji koneksi")
	if out["ok"] != true {
		t.Fatalf("uji koneksi: %v", out)
	}
	st, out = e.call("PATCH", "/integrations/google", map[string]any{"connected": false})
	e.must(st, 204, out, "putuskan")
	if e.bootstrap()["api"].(map[string]any)["connected"] != false {
		t.Fatal("masih terhubung")
	}
	// Riwayat mencatat aksi Google dengan teks yang dikenal frontend.
	actions := map[string]bool{}
	for _, a := range list(e.bootstrap(), "audit") {
		actions[a["action"].(string)] = true
	}
	for _, want := range []string{"Menghubungkan GBP", "Menjalankan sinkronisasi", "Menyetujui edit eksternal", "Mengirim data Dashboard ke Google", "Membalas ulasan", "Menghapus balasan ulasan", "Memutuskan GBP", "Ulasan baru masuk dari Google Maps"} {
		if !actions[want] {
			t.Errorf("audit tanpa %q", want)
		}
	}
}

func TestReportsAndOAuthGuards(t *testing.T) {
	e := setup(t)
	e.login()
	st, out := e.call("POST", "/reports/schedules", map[string]any{"name": "Mingguan", "frequency": "weekly", "day": "8", "period": "7", "format": "PDF", "recipients": []string{"a@bri.test"}})
	e.must(st, 422, out, "hari tidak valid")
	st, out = e.call("POST", "/reports/schedules", map[string]any{"name": "Bulanan jaringan", "frequency": "monthly", "day": "1", "period": "30", "format": "PDF + CSV",
		"recipients": []string{"kepala@bri.test"}, "filters": map[string]string{"region": "", "account": "", "type": ""}})
	e.must(st, 201, out, "jadwal")
	id := out["id"].(string)
	due, err := e.srv.dueSchedules(context.Background(), time.Date(2026, 12, 1, 8, 0, 0, 0, time.UTC))
	if err != nil || len(due) != 1 {
		t.Fatalf("jatuh tempo: %v %v", due, err)
	}
	d, err := e.srv.buildReport(context.Background(), due[0], time.Now())
	if err != nil {
		t.Fatal(err)
	}
	files := e.srv.renderReport(due[0], d, "BRI")
	if len(files) != 2 || !bytes.HasPrefix(files[0].Data, []byte("%PDF-1.4")) || !bytes.Contains(files[1].Data, []byte("Rata-rata rating")) {
		t.Fatalf("lampiran laporan salah: %d", len(files))
	}
	st, out = e.call("DELETE", "/reports/schedules/"+id, nil)
	e.must(st, 204, out, "hapus jadwal")
	// OAuth: redirect_uri asing ditolak; start lama tanpa sesi ditolak.
	st, out = e.call("POST", "/integrations/google/oauth/url", map[string]string{"redirect_uri": "https://jahat.test/"})
	e.must(st, 400, out, "redirect asing")
	st, out = e.call("GET", "/integrations/google/oauth/start?redirect_uri=http://app.test/", nil, "-")
	e.must(st, 400, out, "start lama")
	st, out = e.call("GET", "/auth/google/start?redirect_uri=https://jahat.test/", nil, "-")
	e.must(st, 400, out, "login google redirect asing")
	st, out = e.call("GET", "/tidak-ada", nil)
	e.must(st, 404, out, "endpoint tak dikenal")
}

func TestProfile(t *testing.T) {
	e := setup(t)
	e.login()
	st, me := e.call("GET", "/me", nil)
	e.must(st, 200, me, "me")
	if me["username"] != "rina" || me["hasPassword"] != true || me["name"] != "Rina Admin" {
		t.Fatalf("profil: %v", me)
	}
	// Nama: wajib diisi, maks. 80 karakter; perubahan tercatat di audit.
	st, out := e.call("PATCH", "/me", map[string]any{"name": "  "})
	e.must(st, 422, out, "nama kosong")
	if out["field"] != "name" {
		t.Fatalf("field: %v", out)
	}
	st, out = e.call("PATCH", "/me", map[string]any{"name": " Rina Wijaya "})
	e.must(st, 200, out, "ubah nama")
	if out["name"] != "Rina Wijaya" || out["role"] != "Administrator" {
		t.Fatalf("profil baru: %v", out)
	}
	if a := find(list(e.bootstrap(), "audit"), "action", "Memperbarui profil"); a == nil || a["user"] != "Rina Wijaya" {
		t.Fatalf("audit profil: %v", a)
	}
	// Viewer (tanpa users.manage) juga boleh mengubah profilnya sendiri.
	st, out = e.call("POST", "/users", map[string]any{"name": "Vina Viewer", "email": "vina@bri.test", "role": "Viewer", "password": "viewer-pass-123"})
	e.must(st, 201, out, "buat viewer")
	_, vout := e.call("POST", "/auth/login", map[string]string{"username": "vina@bri.test", "password": "viewer-pass-123"})
	vt := vout["token"].(string)
	st, out = e.call("PATCH", "/me", map[string]any{"name": "Vina V."}, vt)
	e.must(st, 200, out, "viewer ubah nama")
	// Kata sandi: sandi lama wajib benar (422, bukan 401, agar sesi tidak dianggap berakhir).
	st, other := e.call("POST", "/auth/login", map[string]string{"username": "rina", "password": "rahasia-admin-123"})
	e.must(st, 200, other, "sesi kedua")
	st, out = e.call("POST", "/me/password", map[string]string{"currentPassword": "salah", "newPassword": "sandi-baru-12345"})
	e.must(st, 422, out, "sandi lama salah")
	if out["field"] != "currentPassword" {
		t.Fatalf("field: %v", out)
	}
	st, out = e.call("POST", "/me/password", map[string]string{"currentPassword": "rahasia-admin-123", "newPassword": "pendek"})
	e.must(st, 422, out, "sandi baru pendek")
	if out["field"] != "newPassword" {
		t.Fatalf("field: %v", out)
	}
	st, out = e.call("POST", "/me/password", map[string]string{"currentPassword": "rahasia-admin-123", "newPassword": "rahasia-admin-123"})
	e.must(st, 422, out, "sandi baru sama")
	st, out = e.call("POST", "/me/password", map[string]string{"currentPassword": "rahasia-admin-123", "newPassword": "sandi-baru-12345"})
	e.must(st, 204, out, "ganti sandi")
	st, _ = e.call("GET", "/me", nil)
	e.must(st, 200, nil, "sesi sekarang tetap aktif")
	st, _ = e.call("GET", "/me", nil, other["token"].(string))
	e.must(st, 401, nil, "sesi lain diputus")
	st, _ = e.call("POST", "/auth/login", map[string]string{"username": "rina", "password": "rahasia-admin-123"})
	e.must(st, 401, nil, "sandi lama tidak berlaku")
	st, _ = e.call("POST", "/auth/login", map[string]string{"username": "rina", "password": "sandi-baru-12345"})
	e.must(st, 200, nil, "sandi baru berlaku")
	// 5 kegagalan → dikunci sementara.
	for i := 0; i < 4; i++ {
		e.call("POST", "/me/password", map[string]string{"currentPassword": "salah", "newPassword": "sandi-lain-12345"})
	}
	st, out = e.call("POST", "/me/password", map[string]string{"currentPassword": "sandi-baru-12345", "newPassword": "sandi-lain-12345"})
	e.must(st, 429, out, "terkunci setelah 5 kegagalan")
	// Akun tanpa kata sandi (OTP/Google) tidak bisa memakai endpoint ini.
	st, out = e.call("POST", "/users", map[string]any{"name": "Oki OTP", "email": "oki@bri.test", "role": "Viewer"})
	e.must(st, 201, out, "buat pengguna OTP")
	e.call("POST", "/auth/otp/request", map[string]string{"email": "oki@bri.test"})
	e.mail.mu.Lock()
	code := regexp.MustCompile(`\d{6}`).FindString(e.mail.sent[len(e.mail.sent)-1].Subject)
	e.mail.mu.Unlock()
	_, oout := e.call("POST", "/auth/otp/verify", map[string]string{"email": "oki@bri.test", "code": code})
	ot := oout["token"].(string)
	_, ome := e.call("GET", "/me", nil, ot)
	if ome["hasPassword"] != false {
		t.Fatalf("hasPassword OTP: %v", ome)
	}
	st, out = e.call("POST", "/me/password", map[string]string{"currentPassword": "x", "newPassword": "sandi-baru-12345"}, ot)
	e.must(st, 409, out, "tanpa kata sandi")
}
