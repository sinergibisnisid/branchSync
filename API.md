# BranchSync — Kontrak REST API (Mode Live)

Dokumen ini menjelaskan endpoint yang dipanggil frontend saat **mode Live** aktif.
Pada **Mode Demo**, tidak ada panggilan jaringan; semua data disimulasikan di browser.

- Mode dipilih **setelah login** lewat dropdown mode di header admin. Memilih **Live** membuka dialog
  *Sambungkan ke Live* (URL server + akun, atau Google). Base URL juga bisa diubah di
  **Pengaturan › Mode & koneksi server** (contoh `https://api.branchsync.co.id/v1`).
  Semua path di bawah relatif terhadap base URL.
- Semua body request dan response memakai JSON (`Content-Type: application/json`).
- Waktu boleh dikirim sebagai **epoch milidetik** atau **string ISO 8601**.
- Frontend dimuat dari origin lain (atau `file://`), jadi server **wajib mengaktifkan CORS**:
  izinkan origin aplikasi, method `GET, POST, PATCH, PUT, DELETE, OPTIONS`, dan header
  `Authorization, Content-Type`. Frontend tidak mengirim cookie (`credentials: omit`).

## Autentikasi

Endpoint yang ditandai 🔒 wajib menyertakan header `Authorization: Bearer <token>`.
Token disimpan frontend di `sessionStorage` (hilang saat tab ditutup). Kata sandi tidak pernah disimpan.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | — | `{ "status": "ok", "version": "1.4.0" }` (dipakai tombol *Uji koneksi*) |
| POST | `/auth/login` | `{ username, password }` | `{ token, user }` |
| POST | `/auth/otp/request` | `{ email }` | `204` atau `{ ok: true }` |
| POST | `/auth/otp/verify` | `{ email, code }` | `{ token, user }` |
| GET | `/auth/google/start?redirect_uri=<url>` | — | Login pengguna via Google. Setelah selesai, server mengarahkan kembali ke `redirect_uri#bs_token=<token>` atau `redirect_uri#bs_error=<pesan>`. Callback Google: `{base}/auth/google/callback` (daftarkan di Google Cloud). `redirect_uri` harus ber-origin yang diizinkan server |
| GET 🔒 | `/me` | — | `user` |
| POST 🔒 | `/auth/logout` | — | `204` |

`user` = `{ "name": "Rina Wijaya", "email": "rina@bri.co.id", "role": "Operator" }`

Opsional: `user.permissions` (array kode izin, mis. `["locations.read","reviews.reply"]`). Bila dikirim, frontend memakainya
untuk menampilkan/menonaktifkan tombol; bila tidak, izin diambil dari `roles[]` di `/bootstrap` berdasarkan `user.role`.
Server tetap wajib menegakkan izin di setiap endpoint (respons `403` dengan `message`).

Respons `401` pada endpoint 🔒 membuat frontend menghapus sesi dan meminta login ulang.

## Format error

Status HTTP non-2xx dengan body:

```json
{ "message": "Nama unit sudah dipakai unit lain." }
```

`message` ditampilkan langsung ke pengguna, jadi tulis dalam Bahasa Indonesia yang jelas.

## Memuat data

### GET 🔒 `/bootstrap`

Mengembalikan seluruh data workspace yang boleh dilihat pengguna. Frontend memanggilnya saat masuk,
setelah setiap perubahan, dan setiap 60 detik (agar edit eksternal & hasil sync terbaru muncul).

```jsonc
{
  "locations": [{
    "code": "DM-001", "name": "KC Jakarta", "type": "Kantor Cabang",      // Kantor Cabang | KCP | Unit | ATM
    "city": "Jakarta", "province": "DKI Jakarta", "region": "Jawa",       // region opsional (diturunkan dari provinsi)
    "address": "Jl. Sudirman No. 1", "phone": "(021) 1234567", "hours": "Sen–Jum 08.00–15.00",   // ringkasan teks
    "hoursSpec": {                       // opsional; jam operasional terstruktur per hari (format editor, setara regularHours GBP)
      "mon": { "open": true, "h24": false, "ranges": [{ "from": "08:00", "to": "15:00" }] },
      "sat": { "open": false, "h24": false, "ranges": [] }, "sun": { "open": true, "h24": true, "ranges": [] }   // dst. tue..fri
    },
    "lat": -6.2088, "lng": 106.8456,
    "status": "Online",                 // Online | Offline | Belum Sync | Tidak Aktif
    "accountId": "gbp-jawa",            // akun Google Business Profile pengelola lokasi (merujuk accounts[].id)
    "gbp": "Terverifikasi",             // Terverifikasi | Menunggu Verifikasi | Belum Diklaim | Suspend | Duplikat
    "updatedAt": "2026-11-14T02:10:00Z", "updatedBy": "Operator Jawa", "lastSync": 1763085000000,
    "google": { "name": "...", "phone": "...", "hours": "...", "address": "...", "lat": -6.2, "lng": 106.8 }  // snapshot listing Google; null jika belum ada
  }],
  "approvals": [{ "id": "CR-001", "code": "DM-005", "field": "phone", "before": "...", "after": "...",
                  "by": "pengguna.lain@gmail.com", "time": "...", "status": "Menunggu",   // Menunggu | Disetujui | Ditolak
                  "decidedAt": null, "decidedBy": null }],
  "claims": [{ "id": "KL-001", "kind": "Klaim kepemilikan",   // Klaim kepemilikan | Banding suspend | Laporan duplikat | Titik baru
               "code": "DM-010", "proposal": null,            // proposal = data unit usulan (untuk Titik baru)
               "status": "Diajukan",                          // Diajukan | Diproses internal | Menunggu verifikasi Google | Selesai | Ditolak
               "submittedAt": "...", "processedAt": null, "doneAt": null, "note": "" }],
  "runs": [{ "id": "JOB-0042", "time": "...", "scope": "Semua unit", "by": "Penjadwal otomatis",
             "total": 1200, "ok": 1180, "fail": 12, "skip": 8, "durationMs": 61000,
             "items": [{ "code": "DM-007", "status": "Gagal", "reason": "Timeout API", "resolved": false, "note": "" }] }],
             // items cukup berisi yang Gagal/Dilewati
  "audit": [{ "id": 1, "time": "...", "user": "Rina Wijaya", "actor": "Internal",   // Internal | Eksternal
              "module": "Unit Kerja", "action": "Memperbarui unit", "target": "DM-001", "detail": "",
              "changes": [{ "field": "Telepon", "before": "...", "after": "..." }] }],
  "users": [{ "id": 1, "name": "...", "email": "...", "role": "Administrator", "status": "Aktif", "lastActive": "..." }],
  "roles": [{ "name": "Administrator", "permissions": ["locations.read", "locations.write", "..."] }],
  "api": { "connected": true, "account": "gbp@bri.co.id", "project": "bri-branchsync-prod", "quotaLimit": 10000, "quotaUsed": 1820, "lastTest": "...",
           "webhook": true, "clientId": "123-abc.apps.googleusercontent.com", "hasClientSecret": true, "hasApiKey": false,
           "scopes": ["business.manage"], "syncInterval": "60", "pubsubTopic": "projects/bri-branchsync-prod/topics/gbp" },
           // JANGAN pernah mengirim clientSecret/apiKey kembali — cukup flag hasClientSecret/hasApiKey
  "settings": { "workspace": "BranchSync · Jaringan BRI", "timezone": "Asia/Jakarta", "slaInternal": 24, "slaGoogle": 120, "dupRadius": 150, "coordTol": 50 },
  "accounts": [{ "id": "gbp-jawa", "name": "BRI Regional Jawa & Bali", "email": "gbp.jawa@bri.co.id", "accountId": "accounts/1043920001" }],
  "reviews": [{ "id": "RV-0001", "code": "DM-001",            // code = unit/lokasi; akun ditentukan dari location.accountId
                "author": "Budi Santoso", "rating": 4, "text": "Pelayanan baik…", "time": "...",
                "reply": { "text": "Terima kasih…", "by": "Rina Wijaya", "time": "..." } }],   // reply null jika belum dibalas
  "reportSchedules": [{ "id": "RS-001", "name": "Laporan mingguan jaringan", "frequency": "weekly",   // weekly | monthly
                        "day": "1", "period": "7", "format": "PDF", "recipients": ["kepala.divisi@bri.co.id"],
                        "filters": { "region": "", "account": "", "type": "" }, "createdAt": "..." }],
  "discNotes": { "DM-004|phone": { "text": "Sudah dikonfirmasi ke cabang", "by": "Rina", "time": "..." } },
  "dupIgnored": ["DM-002|DM-046"]
}
```

Ketidaksesuaian, kandidat duplikat, dan seluruh angka **Laporan & Analitik** **dihitung di frontend** dari `locations` (membandingkan
data unit dengan `google`, serta jarak & kemiripan nama), memakai `settings.coordTol` dan `settings.dupRadius`.

Izin yang dikenal: `locations.read`, `locations.write`, `locations.import`, `sync.run`, `claims.manage`,
`approvals.decide`, `reviews.reply`, `audit.read`, `users.manage`, `settings.write`. Server wajib menegakkan izin;
frontend hanya menampilkan.

## Mengubah data

Semua endpoint di bawah 🔒. Response cukup `2xx` (body opsional), karena frontend memuat ulang `/bootstrap`
setelahnya. **Server wajib mencatat setiap perubahan ke `audit`** (dengan nilai sebelum/sesudah).

| Fitur | Method & path | Body |
|---|---|---|
| Tambah unit | `POST /locations` | field unit termasuk `hoursSpec` (tanpa `code`; server membuat kode). Server memetakan `hoursSpec` ke `regularHours.periods` Google |
| Ubah unit | `PATCH /locations/{code}` | field yang diubah |
| Hapus unit | `DELETE /locations/{code}` | — |
| Hapus massal | `POST /locations/bulk-delete` | `{ codes: [] }` |
| Ubah status massal | `POST /locations/bulk-update` | `{ codes: [], patch: { status } }` |
| Impor CSV / Excel | `POST /locations/import` | `{ items: [ { code\|null, exists, name, type, city, province, region, address, phone, hours, lat, lng, status } ] }` — `exists: true` = perbarui unit dengan `code` tersebut; `exists: false` + `code` terisi = buat unit baru memakai kode dari file (mis. store code GBP); `code: null` = server membuat kode. File Excel dibaca di browser — server selalu menerima JSON yang sama. |
| Jalankan sinkronisasi | `POST /sync` | `{ codes: [] \| null, retry: bool, label }` → **kembalikan objek `run`** (lihat `runs`) agar ringkasan hasil bisa ditampilkan. Untuk banyak unit (server referensi: > 15) server menjalankannya di latar belakang dan membalas `202 { status: "running", total }`; hasilnya muncul di `runs` pada `/bootstrap` berikutnya |
| Tindak lanjut kegagalan | `POST /sync/failures/resolve` | `{ code, run, note }` |
| Selesaikan ketidaksesuaian | `POST /discrepancies/resolve` | `{ code, field, source: "dashboard" \| "google" }` — `field`: name, phone, hours, address, coords |
| Selesaikan massal | `POST /discrepancies/resolve-bulk` | `{ source: "dashboard", items: [ { code, field } ] }` |
| Catatan temuan | `PUT /discrepancies/notes` | `{ code, field, text }` |
| Gabungkan duplikat | `POST /duplicates/merge` | `{ keep, drop }` (kode unit) |
| Bukan duplikat | `POST /duplicates/ignore` | `{ a, b }` |
| Ajukan klaim / titik baru | `POST /claims` | `{ kind, code, note }` atau `{ kind: "Titik baru", proposal, note }` |
| Lanjutkan tahap klaim | `POST /claims/{id}/advance` | `{ to }` (tahap tujuan) |
| Tolak klaim | `POST /claims/{id}/reject` | `{ note }` |
| Setujui / tolak edit eksternal | `POST /approvals/{id}/approve` · `POST /approvals/{id}/reject` | — |
| Tambah / ubah pengguna | `POST /users` · `PATCH /users/{id}` | `{ name, email, role, status }` |
| Tambah / ubah peran | `POST /roles` · `PATCH /roles/{name}` | `{ name?, permissions? }` |
| Pengaturan | `PATCH /settings` | `{ workspace, timezone, slaInternal, slaGoogle, dupRadius, coordTol }` |
| Balas / ubah balasan ulasan | `PUT /reviews/{id}/reply` | `{ text }` (maks. 4.096 karakter). Server meneruskan ke Google: `PUT accounts/{a}/locations/{l}/reviews/{r}/reply` |
| Hapus balasan ulasan | `DELETE /reviews/{id}/reply` | — (Google: `DELETE …/reviews/{r}/reply`) |
| Konfigurasi Google API | `PATCH /integrations/google` | `{ project, account, clientId, clientSecret?, apiKey?, scopes[], syncInterval, quotaLimit, pubsubTopic, webhook, connected? }` — `clientSecret`/`apiKey` hanya dikirim saat diisi; simpan terenkripsi |
| Hubungkan akun GBP (OAuth) | `POST /integrations/google/oauth/url` | `{ redirect_uri }` → `{ url }`. Frontend lalu membuka `url` (consent Google, akses offline, scope dari konfigurasi). Callback di `{base}/integrations/google/oauth/callback`, lalu kembali ke `redirect_uri#bs_gbp=connected` atau `#bs_gbp=<pesan error>`. URL terikat ke sesi pengguna ber-izin `settings.write`, sehingga orang lain tidak bisa menghubungkan akun Google-nya ke workspace. *(Menggantikan `GET /integrations/google/oauth/start` yang tidak memakai sesi.)* |
| Tarik akun & lokasi GBP | `POST /integrations/google/discover` | → `{ accounts, linked, imported, skipped }`. Lokasi Google dengan `storeCode` = kode unit dihubungkan; lokasi lain diimpor sebagai unit baru. Otomatis dijalankan setelah akun dihubungkan |
| Uji koneksi Google | `POST /integrations/google/test` | → `{ ok: bool, latencyMs?, message? }` |
| Jadwalkan laporan | `POST /reports/schedules` | `{ name, frequency, day, period, format, recipients[], filters }` — server membuat & mengirim laporan (PDF/CSV) ke email penerima sesuai jadwal |
| Hapus jadwal laporan | `DELETE /reports/schedules/{id}` | — |

Ulasan baru dari Google sebaiknya ditarik server secara berkala (sesuai `syncInterval`) atau lewat
notifikasi Pub/Sub (`pubsubTopic`), lalu muncul di `/bootstrap`.

Server referensi (`server/`, Go + PostgreSQL) menerima notifikasi Pub/Sub lewat langganan *push* ke
`POST {base}/integrations/google/pubsub?token=<BS_PUBSUB_TOKEN>` (tanpa header Authorization). Respons
`POST /locations/import` di server referensi: `{ added, updated }`. Kode unit baru berformat `BS-00001`.

## Fitur yang hanya ada di Mode Demo

*Simulasikan perubahan di Google*, *Simulasikan edit masuk*, *Simulasikan ulasan baru*, *Buat 1.000 unit uji*, *Reset data demo*,
*Reset kuota harian*, dan tombol **Urungkan** pada notifikasi. Di mode Live, edit eksternal dan perubahan
Google datang dari server (webhook/polling di sisi backend).


## Tautan dalam aplikasi (frontend)

Halaman admin memakai routing hash, misalnya `index.html#/unit-kerja?status=Offline&region=Jawa&unit=DM-007`.
Rute ini murni di browser (tidak memanggil server) dan bisa dibagikan; penerima perlu masuk lebih dulu.
