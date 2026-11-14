# BranchSync API Server (Go + PostgreSQL)

Server API BranchSync. Kontrak endpoint ada di [`../API.md`](../API.md); frontend React
([`../frontend`](../frontend)) memakai server ini untuk login dan seluruh data workspace.

- Go 1.24+ (pustaka standar `net/http`), PostgreSQL 14+ (diuji dengan 15)
- Dependensi: `pgx` (driver PostgreSQL), `golang.org/x/oauth2`, `golang.org/x/crypto/bcrypt`
- Integrasi **Google Business Profile** sungguhan: OAuth, Account Management, Business Information,
  Verifications, Notifications (Pub/Sub), dan ulasan (My Business v4)

## Menjalankan secara lokal

```bash
cd server
createdb branchsync                                   # atau buat database lewat cara lain
cp .env.example .env && $EDITOR .env                  # isi BS_DATABASE_URL & BS_SECRET_KEY
set -a; . ./.env; set +a

go run ./cmd/branchsync create-admin -email admin@bri.co.id -name "Admin BranchSync" -username admin
go run ./cmd/branchsync serve                         # migrasi skema berjalan otomatis
```

Jalankan frontend (lihat [`../frontend/README.md`](../frontend/README.md)): `cd ../frontend && npm install && npm run dev`,
lalu buka `http://localhost:5173` → **Masuk** dengan akun administrator. Frontend memakai URL server dari
`frontend/public/config.js` (default `http://localhost:8080/v1`, sesuai `BS_ADDR`/`BS_PUBLIC_URL` default); ubah
file itu bila server berjalan di alamat lain. Tambahkan `http://localhost:5173` ke `BS_ALLOWED_ORIGINS`.

Saat deploy dengan [`../deploy`](../deploy/README.md), URL server diisi otomatis lewat `/config.js`. Dialog Masuk
tidak menampilkan kolom URL server.

Perintah lain: `branchsync migrate` (migrasi saja), `branchsync version`.

## Variabel lingkungan

| Variabel | Wajib | Keterangan |
|---|---|---|
| `BS_DATABASE_URL` | ya | `postgres://user:pass@host:5432/branchsync?sslmode=require` |
| `BS_SECRET_KEY` | ya | 32 byte base64 (`openssl rand -base64 32`). Mengenkripsi client secret, API key, dan refresh token Google. **Jangan diganti** setelah dipakai (data terenkripsi tidak bisa dibuka lagi). |
| `BS_PUBLIC_URL` | ya | URL publik server **termasuk prefiks path**, mis. `https://api.branchsync.co.id/v1`. Prefiks (`/v1`) dibuang sebelum routing; dipakai untuk redirect URI OAuth. |
| `BS_ALLOWED_ORIGINS` | ya | Origin frontend yang diizinkan (CORS dan tujuan kembali OAuth), dipisah koma, mis. `https://branchsync.bri.co.id`. Untuk pengembangan: `http://localhost:5173` (Vite dev server). |
| `BS_ADDR` | | Alamat listen, default `:8080`. |
| `BS_SESSION_TTL` | | Masa berlaku sesi, default `12h`. |
| `BS_SMTP_HOST`, `BS_SMTP_PORT`, `BS_SMTP_USER`, `BS_SMTP_PASS`, `BS_SMTP_FROM` | | Untuk kode OTP dan laporan terjadwal. Tanpa `BS_SMTP_HOST`, email hanya dicatat di log. Port 465 = TLS langsung, lainnya STARTTLS. |
| `BS_GOOGLE_CLIENT_ID`, `BS_GOOGLE_CLIENT_SECRET` | | Opsional — bila kosong, diambil dari halaman **Integrasi Google** di aplikasi. |
| `BS_PUBSUB_TOKEN` | | Token rahasia pada URL push Pub/Sub (lihat di bawah). |
| `BS_SCHEDULER` | | `false` untuk mematikan job berkala (sinkronisasi otomatis, ulasan, laporan). |
| `BS_TRUSTED_PROXIES` | di belakang proxy | IP/CIDR reverse proxy tepercaya, dipisah koma, mis. `172.30.10.10`. Permintaan dari alamat ini memakai IP klien dari `X-Forwarded-For`. Tanpa ini, semua pengguna di belakang proxy berbagi satu batas percobaan login. Jangan isi rentang yang bisa dijangkau klien langsung. |
| `BS_DEV` | | `true` = kode OTP dicetak ke log. Jangan dipakai di produksi. |

## Menyiapkan Google Cloud & Google Business Profile

1. **Akses API Business Profile.** API ini tidak terbuka otomatis. Ajukan akses lewat formulir
   *GBP API contact form* di Google, memakai project Google Cloud BRI. Sebelum disetujui, kuota API = 0
   dan semua panggilan ditolak (403/429).
2. Di project yang sama, **aktifkan API** berikut: *My Business Account Management API*, *My Business
   Business Information API*, *My Business Verifications API*, *My Business Notifications API*, dan
   *Google My Business API* (untuk ulasan v4).
3. **OAuth consent screen**: tipe *Internal* (akun Google Workspace BRI) atau *External* + verifikasi.
4. **OAuth client** tipe *Web application*, dengan **Authorized redirect URIs**:
   - `{BS_PUBLIC_URL}/integrations/google/oauth/callback` — menghubungkan akun GBP
   - `{BS_PUBLIC_URL}/auth/google/callback` — login pengguna dengan Google (opsional)
5. Di aplikasi: **Integrasi Google** → isi Project ID, Client ID, Client Secret → **Simpan** →
   **Hubungkan** → masuk dengan akun Google yang mengelola lokasi BRI. Setelah terhubung, server
   langsung menarik akun dan lokasi:
   - lokasi Google yang `storeCode`-nya sama dengan **kode unit** di Dashboard otomatis dihubungkan;
   - lokasi Google lain diimpor sebagai unit baru (yang tidak punya koordinat dilewati).
   Penarikan ulang: `POST /integrations/google/discover`.
6. **Notifikasi real-time (opsional, disarankan):**
   - Buat topik Pub/Sub, mis. `projects/<project>/topics/gbp-notifications`.
   - Beri `mybusiness-api-pubsub@system.gserviceaccount.com` peran **Pub/Sub Publisher** pada topik itu.
   - Buat langganan **push** ke `{BS_PUBLIC_URL}/integrations/google/pubsub?token=<BS_PUBSUB_TOKEN>`.
   - Di aplikasi isi *Topik Pub/Sub* dan aktifkan *Notifikasi edit dari email GBP lain*. Server lalu
     mengatur `notificationSetting` setiap akun (GOOGLE_UPDATE, NEW_REVIEW, UPDATED_REVIEW,
     VOICE_OF_MERCHANT_UPDATED, DUPLICATE_LOCATION).

## Cara kerja sinkronisasi

- Setiap perubahan unit di Dashboard (nama, telepon, jam, alamat) ditandai **belum terkirim**.
  **Sinkronkan** (atau job otomatis tiap `syncInterval` menit) mengirim hanya kolom itu ke Google
  (`PATCH locations/{id}?updateMask=…`), lalu menarik ulang listing dan status verifikasi.
- Jam operasional dipetakan ke `regularHours.periods`. Teks ringkasan jam dibuat dengan format yang
  sama persis dengan frontend, supaya halaman Ketidaksesuaian tidak menampilkan perbedaan palsu.
- Perubahan yang datang dari Google/pengguna lain (`getGoogleUpdated`) menjadi **Persetujuan Edit**.
  *Setujui* = nilai Google dipakai di Dashboard. *Tolak* = nilai Dashboard dikirim ulang ke Google.
- Unit tanpa listing Google dibuat di Google saat disinkronkan, bila hanya ada satu akun GBP (atau unit
  punya `accountId`). Klaim **Titik baru** membuat listing saat masuk tahap *Menunggu verifikasi Google*.
- Status GBP (Terverifikasi / Menunggu Verifikasi / Belum Diklaim / Suspend / Duplikat) diambil dari
  *Voice of Merchant* dan metadata lokasi.
- Lebih dari 15 unit per permintaan → sinkronisasi berjalan di latar belakang (respons `202`). Hanya
  satu sinkronisasi berjalan sekaligus. Setiap panggilan Google dihitung ke **kuota harian**
  (`quotaLimit`); bila habis, sisa unit dilewati dengan pesan yang jelas.

### Batasan yang perlu diketahui

- **Koordinat** tidak dikirim ke Google: API hanya mengizinkan klien tertentu mengubah `latlng`.
  Google menentukan titik dari alamat. Perbaiki pin langsung di Google Business Profile, atau pakai
  "data Google" di Ketidaksesuaian.
- **Gabungkan duplikat** hanya menonaktifkan unit di Dashboard. Tidak ada API untuk menggabungkan
  listing Google; laporkan duplikat ke Google lewat Klaim › Laporan duplikat.
- Laporan terjadwal berformat PDF teks sederhana dan/atau CSV, dikirim lewat SMTP.
- Semua alur Google sudah diuji dengan server Google tiruan (`internal/app/fakegoogle_test.go`), tetapi
  **belum dengan akun GBP sungguhan**. Uji coba pertama sebaiknya memakai akun/lokasi uji.

## Keamanan

- Kata sandi: bcrypt (cost 12). Token sesi acak 256-bit; yang disimpan hanya hash SHA-256-nya.
- Login dibatasi per IP dan per nama pengguna. Hanya percobaan gagal yang dihitung untuk penguncian
  akun (8 kali dalam 15 menit). Kode OTP 6 digit berlaku 10 menit, maksimal 5 percobaan, sekali pakai.
  Respons untuk email terdaftar dan tidak terdaftar sama.
- Izin ditegakkan di setiap endpoint sesuai peran. Selalu ada minimal satu administrator aktif, dan
  pengguna tidak bisa menonaktifkan atau menurunkan akunnya sendiri.
- Rahasia Google disimpan terenkripsi (AES-256-GCM) dan tidak pernah dikirim ke frontend.
- Menghubungkan GBP memakai URL OAuth yang terikat ke sesi pengguna (`POST /integrations/google/oauth/url`).
  `redirect_uri` hanya boleh ke origin yang diizinkan, sehingga tidak bisa dipakai sebagai open redirect.
- Setiap perubahan dicatat di tabel `audit` dengan nilai sebelum/sesudah.
- Jalankan di belakang HTTPS (reverse proxy / load balancer) dan isi `BS_TRUSTED_PROXIES` dengan alamat proxy-nya.
  Paket siap pakai (Docker Compose + Caddy + PostgreSQL): [`../deploy/README.md`](../deploy/README.md).

## Tes

```bash
go test ./...                                                         # unit test
BS_TEST_DATABASE_URL="postgres://user@localhost:5432/branchsync_test?sslmode=disable" go test -p 1 ./...
```

Tes integrasi **mengosongkan skema `public`** database tes setiap kali jalan. Jangan arahkan ke
database berisi data. Tes ini memakai PostgreSQL sungguhan dan server Google tiruan, dan mencakup:
login/OTP/izin/CORS, siklus unit & impor, OAuth GBP, penemuan lokasi, sinkronisasi (buat & ubah
listing), persetujuan edit, ketidaksesuaian, ulasan via Pub/Sub, balasan, klaim titik baru, dan
laporan PDF/CSV.

## Struktur

```
cmd/branchsync/       program utama (serve, migrate, create-admin)
internal/config/      konfigurasi dari variabel lingkungan
internal/db/          koneksi + migrasi (migrations/*.sql, tertanam di binary)
internal/app/         HTTP API: auth, unit, sync, operasional, pengguna, Google, laporan, job berkala
internal/gbp/         klien Google Business Profile + pemetaan data
internal/hours/       jam operasional: format teks (= frontend), hoursSpec ⇄ regularHours
internal/mail/        SMTP · internal/pdf/ PDF teks · internal/secret/ enkripsi & token
```
