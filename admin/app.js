'use strict';
/*
 * BranchSync — Admin Workspace: pemuat modul.
 * Fitur dipetakan ke "Skenario Test Piloting Dashboard BranchSync":
 *  1 Impor massal unit kerja        → Unit Kerja › Impor                    (views/locations.js, forms.js)
 *  2 Cari & filter                   → Unit Kerja                            (views/locations.js)
 *  3 Ketidaksesuaian vs Google Maps  → Ketidaksesuaian                       (views/operations.js)
 *  4 Performa data besar             → Pengaturan › Buat 1.000 unit uji      (views/settings.js, actions.js)
 *  5 Perubahan data                  → Edit unit + sinkronisasi              (forms.js, core.js)
 *  6–8 Klaim, titik baru, duplikat   → Klaim & Titik Baru, Duplikat          (views/operations.js, actions.js)
 *  9 Edit dari email GBP lain        → Persetujuan Edit                      (views/operations.js)
 * 10 Histori sebelum/sesudah         → Riwayat Perubahan                     (views/operations.js)
 * 11/13 SLA                          → SLA & Kinerja, Laporan & Analitik     (views/operations.js, views/reports.js)
 * 12 Data gagal diperbarui          → Sync Monitor › Kegagalan              (views/operations.js)
 *
 * Cara modul terhubung — tanpa build step, semuanya <script> biasa (juga jalan dari file://):
 *  - File ini dimuat pertama. Setiap file admin/*.js memanggil
 *      BranchSyncAdmin.part('nama', function* (app) { ... })
 *    dan main.js (file terakhir) memanggil BranchSyncAdmin.start().
 *  - Tahap 1, kode sebelum `yield`: modul mendaftarkan impornya (app.imports) dan mengekspor
 *    fungsi yang dipakai modul lain (app.export). Deklarasi function di-hoist, jadi semua fungsi
 *    lintas modul sudah tersedia sebelum kode modul mana pun berjalan.
 *  - Tahap 2, kode setelah `yield`: dijalankan berurutan mengikuti urutan <script> di index.html.
 *    Konstanta diekspor tepat setelah dideklarasikan; setiap ekspor mengisi ulang impor semua modul.
 *  - Nilai bersama yang diganti dari lebih dari satu modul disimpan sebagai properti app
 *    (app.state, app.ME, app.cache, app.importDraft, …) supaya semua modul membaca nilai terbaru.
 *
 * Menambah fungsi yang dipakai modul lain: tambahkan namanya di app.export({...}) modul asal dan di
 * daftar impor (let … + app.imports) modul pemakai. Nama ekspor harus unik di seluruh admin.
 */
(() => {
  const parts = [], importers = [];
  const RESERVED = new Set(['export', 'imports', 'link']);
  const app = {
    // Ekspor nilai/fungsi ke modul lain, lalu isi ulang impor semua modul.
    export(values) {
      for (const k of Object.keys(values)) {
        if (RESERVED.has(k)) throw new Error(`BranchSyncAdmin: nama "${k}" dipakai API app`);
        app[k] = values[k];
      }
      app.link();
    },
    // Daftarkan fungsi pengisi impor milik satu modul.
    imports(fill) { importers.push(fill); fill(); },
    link() { importers.forEach(fill => fill()); }
  };
  let started = false;
  window.BranchSyncAdmin = {
    part(name, body) {
      if (started) throw new Error(`BranchSyncAdmin: modul "${name}" dimuat setelah start()`);
      parts.push({ name, body });
    },
    start() {
      if (started) return;
      started = true;
      if (!document.getElementById('adminPanel')) return; // halaman tanpa admin: tidak ada yang dijalankan
      const runs = parts.map(p => ({ name: p.name, it: p.body(app) }));
      runs.forEach(r => r.it.next());           // tahap 1: impor & ekspor fungsi semua modul
      app.link();
      runs.forEach(r => {                       // tahap 2: kode modul, berurutan
        const res = r.it.next();
        if (!res.done) throw new Error(`BranchSyncAdmin: modul "${r.name}" memakai yield lebih dari sekali`);
        app.link();
      });
    }
  };
})();
