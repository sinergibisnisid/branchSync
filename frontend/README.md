# BranchSync — Frontend (React)

Antarmuka BranchSync: halaman depan, dialog Masuk, dan workspace admin. Semua data berasal dari
server API ([`../server`](../server), Go + PostgreSQL) sesuai kontrak [`../API.md`](../API.md).

- React 19 + TypeScript + Vite 6
- State: Zustand (+ Immer) — `src/store.ts`
- Peta: Leaflet + Leaflet.markercluster · Excel: read-excel-file / write-excel-file (dimuat saat dibutuhkan)
- Tampilan: CSS asli BranchSync (`src/styles/landing.css`, `src/styles/admin.css`) — tanpa library UI

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173 (server API harus mengizinkan origin ini: BS_ALLOWED_ORIGINS)
npm run build      # typecheck + build produksi ke dist/
npm run preview    # sajikan dist/ di http://localhost:4173
```

URL server API diisi di dialog Masuk, atau lewat `public/config.js` (`apiBaseUrl`). Saat deploy dengan
[`../deploy`](../deploy/README.md), `/config.js` dibuat otomatis dari `.env`.

## Struktur

```
src/
  main.tsx, App.tsx        titik masuk; halaman depan ↔ workspace; kembali dari OAuth Google
  store.ts                 state aplikasi (bahasa, sesi, data workspace, state UI tiap halaman), modal & toast
  lib/
    api.ts                 klien REST (token di sessionStorage, galat 401 → masuk ulang)
    data.ts                normalisasi /bootstrap + data turunan (ketidaksesuaian, duplikat, SLA, laporan)
    domain.ts types.ts     konstanta domain & tipe data
    format.ts hours.ts     format angka/tanggal/durasi, jam operasional
    files.ts content.ts    CSV/Excel, konten Panduan & Scenario Test (ID/EN)
  i18n/                    terjemahan antarmuka admin ID → EN (adminDict + extraDict, diterapkan ke DOM)
  landing/                 halaman depan & dialog Masuk
  admin/
    AdminApp.tsx           kerangka workspace (navigasi, header, footer, toast, pintasan keyboard)
    workspace.ts           muat data, kirim perubahan (remote), izin, navigasi & URL, sinkronisasi
    route.ts               tautan dalam aplikasi (#/halaman?filter…)
    actions.tsx            aksi domain (hapus, setujui, klaim, balas ulasan, …)
    views/                 halaman (Dashboard, Unit Kerja, Peta, Laporan, …)
    forms/                 formulir (unit, klaim/titik baru, pengguna/peran/jadwal, impor)
    ui/                    komponen bersama, ikon, modal
```

## Catatan

- Setiap perubahan dikirim ke server lalu data dimuat ulang (`remote()` di `admin/workspace.ts`), sehingga tampilan
  selalu sama dengan database. Izin ditegakkan server; tombol yang tidak diizinkan tampil nonaktif dengan alasannya.
- Teks antarmuka admin ditulis dalam Bahasa Indonesia. Saat EN aktif, teks diterjemahkan memakai kamus
  `src/i18n/`. Teks yang memuat angka/nama sebaiknya ditulis sebagai satu template string agar cocok dengan pola kamus.
  Cek teks yang belum diterjemahkan: di konsol browser `window.BS_I18N_DEBUG = true`, buka halaman, lalu `window.BranchAdminMissing()`.
- Preferensi pribadi (bahasa, tema, tampilan tersimpan, hasil Scenario Test) disimpan di browser.
