# Deploy BranchSync ke server sendiri (VPS)

Satu server Linux menjalankan tiga container lewat Docker Compose:

| Container | Fungsi |
|---|---|
| `caddy` | HTTPS otomatis (Let's Encrypt), menyajikan frontend di `WEB_DOMAIN`, meneruskan API di `API_DOMAIN` ke `api` |
| `api` | Server Go (Mode Live). Migrasi skema database berjalan otomatis setiap start |
| `db` | PostgreSQL 16, data di volume Docker `pgdata` |

Hanya port 80 dan 443 yang dibuka ke internet. Database dan server API tidak bisa diakses langsung dari luar.

## 1. Yang perlu disiapkan

- Server Linux 64-bit (Ubuntu 22.04/24.04 atau sejenis), minimal 2 vCPU, 4 GB RAM, 20 GB disk.
- [Docker Engine](https://docs.docker.com/engine/install/) dengan plugin Compose (`docker compose version` berjalan).
- Dua nama domain yang record DNS **A** (dan **AAAA** bila ada IPv6) mengarah ke IP server, mis.
  `branchsync.bri.co.id` (frontend) dan `api.branchsync.bri.co.id` (API).
- Firewall mengizinkan port **80** dan **443** (TCP, serta UDP 443 untuk HTTP/3). Port 80 dibutuhkan
  Let's Encrypt untuk menerbitkan sertifikat.
- Akun SMTP untuk mengirim kode OTP dan laporan terjadwal (disarankan).

## 2. Pasang

```bash
sudo mkdir -p /opt/branchsync && sudo chown "$USER" /opt/branchsync
git clone https://github.com/sinergibisnisid/branchSync.git /opt/branchsync
cd /opt/branchsync/deploy
cp .env.example .env
chmod 600 .env
```

Isi `.env`:

- `WEB_DOMAIN`, `API_DOMAIN`, `ACME_EMAIL`: ganti contoh `example.co.id` dengan domain asli.
- `POSTGRES_PASSWORD`: hasil `openssl rand -hex 24`.
- `BS_SECRET_KEY`: hasil `openssl rand -base64 32`.
- `BS_SMTP_*`: data akun SMTP.

> **Simpan salinan `.env` di tempat aman** (mis. password manager tim). `BS_SECRET_KEY` mengenkripsi
> rahasia Google di database. Bila hilang atau diganti, akun Google harus dihubungkan ulang.

Jalankan:

```bash
docker compose up -d --build
docker compose ps                 # ketiganya harus "running", db "healthy"
docker compose logs -f caddy      # tunggu sampai sertifikat terbit ("certificate obtained successfully")
```

## 3. Buat akun administrator pertama

```bash
docker compose run --rm api create-admin -email admin@bri.co.id -name "Admin BranchSync" -username admin
```

Perintah meminta kata sandi (minimal 10 karakter). Setelah itu buka `https://WEB_DOMAIN` → **Masuk**.
URL server API sudah terisi otomatis (dari `.env`), jadi pengguna cukup memasukkan nama pengguna dan
kata sandi. Pengguna lain dibuat dari **Pengaturan › Pengguna & Akses** di aplikasi.

## 4. Hubungkan Google Business Profile

Ikuti bagian *Menyiapkan Google Cloud & Google Business Profile* di [`../server/README.md`](../server/README.md).
Redirect URI yang didaftarkan di Google Cloud Console:

- `https://API_DOMAIN/v1/integrations/google/oauth/callback`
- `https://API_DOMAIN/v1/auth/google/callback` (bila memakai login Google)

## 5. Cadangan database

```bash
./backup.sh                        # membuat backups/branchsync-<tanggal>.dump, menghapus yang > 14 hari
crontab -e                         # tambahkan baris berikut untuk cadangan harian 02.00
0 2 * * * cd /opt/branchsync/deploy && ./backup.sh >> backups/backup.log 2>&1
```

Salin folder `backups/` ke lokasi lain secara berkala (server lain / object storage). Cadangan yang hanya
ada di server yang sama tidak melindungi dari kerusakan disk.

Memulihkan dari cadangan (menimpa isi database):

```bash
docker compose exec -T db pg_restore -U branchsync -d branchsync --clean --if-exists < backups/<file>.dump
docker compose restart api
```

## 6. Memperbarui ke versi baru

```bash
cd /opt/branchsync && git pull
cd deploy && ./backup.sh && docker compose up -d --build
```

Migrasi database berjalan otomatis saat `api` start. Frontend React di-build ulang di dalam image; nama file aset berisi hash, jadi browser
pengguna langsung memuat versi baru.

## 7. Pemeriksaan & masalah umum

```bash
curl https://API_DOMAIN/v1/health     # {"status":"ok",...}
docker compose logs --tail 100 api
```

| Gejala | Penyebab umum |
|---|---|
| Sertifikat tidak terbit | DNS belum mengarah ke server, atau port 80 tertutup firewall |
| "Tidak dapat terhubung ke server BranchSync" di dialog Masuk | `API_DOMAIN` salah atau container `api` berhenti (`docker compose ps`) |
| Kode OTP tidak sampai | `BS_SMTP_*` belum diisi. Tanpa SMTP, kode hanya tercatat di `docker compose logs api` |
| Login Google: "redirect_uri tidak diizinkan" | Frontend tidak dibuka dari `https://WEB_DOMAIN` |
| `Pool overlaps with other one on this address space` | Subnet `APP_SUBNET` bentrok, ganti `APP_SUBNET` dan `CADDY_IP` di `.env` |

## Catatan keamanan

- `api` hanya mempercayai header `X-Forwarded-For` dari `caddy` (`BS_TRUSTED_PROXIES` = `CADDY_IP`), sehingga
  pembatasan percobaan login tetap per pengguna dan tidak bisa dipalsukan klien.
- CORS hanya mengizinkan `https://WEB_DOMAIN`.
- Image frontend hanya berisi hasil build React (HTML/CSS/JS). Kode sumber, server, dokumen, dan `.env` tidak ikut tersaji.
