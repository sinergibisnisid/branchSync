/*
 * Konten Panduan Pengguna & Scenario Test (dua bahasa: [Indonesia, English]).
 * Scenario Test mengikuti dokumen "Skenario Test Piloting Dashboard BranchSync".
 * Langkah dapat memiliki tombol pintas: go = buka halaman, act = jalankan aksi.
 */
export type Pair = [string, string];
export interface GuideSection { id: string; icon: string; title: Pair; summary: Pair; steps: Pair[]; tips: Pair[]; links: [string, Pair][] }
export interface ScenarioStep { t: Pair; go?: string; act?: string }
export interface Scenario { no: number; group: string; title: Pair; expected: Pair; note: Pair; start: { view: string; act?: string }; steps: ScenarioStep[]; evidence: Pair[] }
export interface Content { guide: GuideSection[]; scenarioGroups: { id: string; title: Pair }[]; scenarios: Scenario[] }

export const CONTENT: Content = {
  guide: [
    {
      id: 'start', icon: 'zap', title: ['Memulai', 'Getting started'],
      summary: ['Masuk, memilih mode, dan mengenal tata letak workspace.', 'Sign in, choose a mode, and learn the workspace layout.'],
      steps: [
        ['Klik “Masuk” di halaman utama, lalu masuk dengan akun BranchSync: kata sandi, kode OTP email, atau Google. Akun dibuat oleh administrator di Pengguna & Akses. Alamat server sudah diatur oleh tim TI.', 'Click “Sign in” on the home page and sign in with your BranchSync account: password, email OTP code, or Google. Accounts are created by an administrator in Users & Access. The server address is configured by your IT team.'],
        ['Semua data dibaca dan disimpan di server BranchSync (database PostgreSQL). Server yang terhubung tampil di header.', 'All data is read from and saved to the BranchSync server (PostgreSQL database). The connected server is shown in the header.'],
        ['Gunakan menu di sisi kiri untuk berpindah halaman. Angka oranye menandakan pekerjaan yang perlu ditindaklanjuti.', 'Use the left menu to move between pages. Orange numbers show work that needs follow-up.'],
        ['Tekan ⌘ K / Ctrl K untuk mencari unit kerja, menu, atau aksi dengan cepat.', 'Press ⌘ K / Ctrl K to quickly search locations, menus, or actions.'],
        ['Ganti bahasa (ID/EN) dan tema terang/gelap dari tombol di header.', 'Switch language (ID/EN) and light/dark theme from the header buttons.']
      ],
      tips: [['Tekan “?” untuk melihat semua pintasan keyboard.', 'Press “?” to see all keyboard shortcuts.']],
      links: [['dashboard', ['Buka Dashboard', 'Open Dashboard']]]
    },
    {
      id: 'links', icon: 'link', title: ['Tautan, penyimpanan & hak akses', 'Links, storage & permissions'],
      summary: ['Membagikan halaman beserta filternya, dan memahami apa yang boleh dilakukan peran Anda.', 'Share a page with its filters, and understand what your role may do.'],
      steps: [
        ['Setiap halaman, filter, urutan, dan unit yang dibuka tersimpan di alamat (URL). Tombol Kembali/Maju browser berfungsi seperti biasa.', 'Every page, filter, sort order, and opened location is kept in the address (URL). The browser Back/Forward buttons work as usual.'],
        ['Klik ikon tautan di header (atau di panel detail unit) untuk menyalin tautan, lalu bagikan ke rekan. Penerima perlu masuk untuk membukanya.', 'Click the link icon in the header (or in a location panel) to copy the link and share it. Recipients need to sign in to open it.'],
        ['Tombol yang tidak diizinkan untuk peran Anda tampak pudar; arahkan kursor untuk melihat izin yang dibutuhkan. Menu tanpa izin baca disembunyikan.', 'Buttons your role may not use look faded; hover to see the required permission. Menus without read permission are hidden.'],
        ['Menu dan tombol yang tampil mengikuti izin peran Anda. Izin juga diperiksa oleh server.', 'The menus and buttons you see follow your role permissions. Permissions are also enforced by the server.']
      ],
      tips: [['Izin tetap ditegakkan oleh server pada mode Live; tampilan di browser hanya membantu.', 'Permissions are still enforced by the server in Live mode; the browser view only helps.']],
      links: [['act:copy-link', ['Salin tautan halaman ini', 'Copy link to this page']], ['access', ['Buka Pengguna & Akses', 'Open Users & Access']]]
    },
    {
      id: 'patterns', icon: 'check', title: ['Filter, tanggal, konfirmasi & keyboard', 'Filters, dates, confirmations & keyboard'],
      summary: ['Pola yang sama di semua halaman: cara melepas filter, membaca tanggal, menghapus dengan aman, dan bekerja dengan keyboard.', 'The same patterns on every page: clearing filters, reading dates, deleting safely, and working with the keyboard.'],
      steps: [
        ['Filter yang aktif tampil sebagai chip di bawah bilah filter (Unit Kerja, Peta, Ketidaksesuaian, Ulasan, Riwayat, Laporan, Pengguna). Klik × pada chip untuk melepas satu filter, atau “Reset filter” untuk melepas semuanya.', 'Active filters appear as chips below the filter bar (Locations, Map, Mismatches, Reviews, History, Reports, Users). Click × on a chip to remove one filter, or “Reset filters” to remove them all.'],
        ['Di daftar dan tabel, waktu ditulis relatif (mis. “2 jam lalu”); arahkan kursor ke waktu itu untuk melihat tanggal lengkap. Kolom “Waktu” juga menampilkan tanggal singkat di bawahnya.', 'In lists and tables, times are relative (e.g. “2 h ago”); hover over them to see the full date. “Time” columns also show the short date below.'],
        ['Panel detail unit menampilkan tanggal lengkap. File ekspor (CSV/Excel) memakai format YYYY-MM-DD HH:mm sesuai zona waktu di Pengaturan, sehingga mudah diurutkan di Excel.', 'The location panel shows full dates. Export files (CSV/Excel) use YYYY-MM-DD HH:mm in the time zone from Settings, so they sort easily in Excel.'],
        ['Aksi berbahaya — hapus unit, hapus massal, tandai duplikat, nonaktifkan pengguna, putuskan Google, hapus balasan, jadwal, tampilan, atau bukti — selalu meminta konfirmasi yang menyebut nama objeknya. Tombol “Batal” terfokus lebih dulu, jadi menekan Enter tidak langsung menghapus.', 'Destructive actions — deleting a location, bulk delete, marking a duplicate, deactivating a user, disconnecting Google, deleting a reply, schedule, view, or evidence — always ask for confirmation naming the object. “Cancel” is focused first, so pressing Enter never deletes right away.'],
        ['Kalimat di bawah konfirmasi menjelaskan apakah tindakan bisa diurungkan. Jika bisa, notifikasi menampilkan tombol “Urungkan” selama beberapa detik. Di mode Live, perubahan yang sudah terkirim ke server tidak bisa diurungkan dari browser.', 'The sentence below each confirmation says whether the action can be undone. If it can, the notification shows an “Undo” button for a few seconds. In Live mode, changes already sent to the server cannot be undone from the browser.'],
        ['Keyboard: tekan Tab sampai ke deretan tab, lalu ←/→ untuk berpindah tab dan Home/End untuk tab pertama/terakhir. Di menu Ekspor, tekan ↓/↑ untuk memilih format.', 'Keyboard: press Tab to reach a row of tabs, then ←/→ to switch tabs and Home/End for the first/last tab. In the Export menu, press ↓/↑ to choose a format.'],
        ['Pembaca layar mengumumkan jumlah hasil setelah pencarian atau filter berubah, serta progres sinkronisasi setiap 25%.', 'Screen readers announce the number of results after a search or filter changes, and sync progress every 25%.']
      ],
      tips: [['Label status ditulis seragam (mis. “Belum sinkron”, “Tidak aktif”). Nilai di file impor/ekspor tetap “Belum Sync”/“Tidak Aktif” agar cocok dengan sistem lain; impor menerima kedua bentuk.', 'Status labels are written consistently (e.g. “Not synced”, “Inactive”). Values in import/export files stay “Belum Sync”/“Tidak Aktif” to match other systems; import accepts both forms.']],
      links: [['locations', ['Buka Unit Kerja', 'Open Locations']], ['act:shortcuts', ['Lihat pintasan keyboard', 'View keyboard shortcuts']]]
    },
    {
      id: 'dashboard', icon: 'grid', title: ['Dashboard', 'Dashboard'],
      summary: ['Ringkasan kondisi jaringan dan daftar pekerjaan yang paling mendesak.', 'Network overview and the most urgent work.'],
      steps: [
        ['Baca empat KPI di atas: total unit, persentase terverifikasi di Google, keberhasilan sync 7 hari, dan kepatuhan SLA.', 'Read the four KPIs: total locations, Google-verified share, 7-day sync success, and SLA compliance.'],
        ['Kerjakan daftar “Perlu tindakan” dari atas ke bawah; klik tombol di setiap baris untuk langsung menuju halamannya.', 'Work through “Needs action” from top to bottom; click each row’s button to go straight to its page.'],
        ['Klik status atau region untuk membuka daftar unit yang sudah tersaring.', 'Click a status or region to open a pre-filtered location list.']
      ],
      tips: [],
      links: [['dashboard', ['Buka Dashboard', 'Open Dashboard']]]
    },
    {
      id: 'locations', icon: 'building', title: ['Mengelola unit kerja', 'Managing locations'],
      summary: ['Mencari, menambah, mengubah, dan menghapus data kantor, unit, dan ATM.', 'Search, add, edit, and delete branch, unit, and ATM data.'],
      steps: [
        ['Buka Unit Kerja. Ketik di kolom pencarian (tekan “/”) atau gunakan tampilan cepat dan tombol Filter.', 'Open Locations. Type in the search box (press “/”) or use quick views and the Filter button.'],
        ['Klik “Tambah unit”. Isi informasi dasar, lalu klik peta atau geser penanda untuk menandai titik lokasi.', 'Click “Add location”. Fill in the basics, then click the map or drag the pin to mark the point.'],
        ['Atur jam operasional per hari seperti di Google: aktifkan hari buka, isi jam buka–tutup, tambah rentang jam, atau pilih 24 jam. Gunakan “Salin Senin ke hari lain” untuk mempercepat.', 'Set opening hours per day like on Google: turn days on, enter open–close times, add ranges, or choose 24 hours. Use “Copy Monday to other days” to speed up.'],
        ['Klik nama unit untuk membuka panel detail: ringkasan, perbandingan dengan Google, ulasan, riwayat, dan sinkronisasi.', 'Click a location name to open the detail panel: overview, Google comparison, reviews, history, and sync.'],
        ['Centang beberapa unit untuk aksi massal: ubah status, sinkronkan, ekspor, atau hapus.', 'Tick several locations for bulk actions: change status, sync, export, or delete.'],
        ['Simpan filter yang sering dipakai lewat “Tampilan” → “Simpan tampilan saat ini” (mis. “KCP Jawa bermasalah”). Tampilan yang disematkan muncul di deretan tampilan cepat; tampilan bisa diganti nama atau dihapus.', 'Save frequently used filters via “Views” → “Save current view” (e.g. “Problem sub-branches in Java”). Pinned views appear in the quick views row; views can be renamed or deleted.'],
        ['Klik “Atur kolom” untuk menampilkan/menyembunyikan kolom (Region, Telepon, Jam operasional, Alamat, Sinkron terakhir, dll.) dan memilih kepadatan baris Longgar atau Padat. Pengaturan disimpan untuk akun Anda.', 'Click “Columns” to show/hide columns (Region, Phone, Opening hours, Address, Last sync, etc.) and pick Comfortable or Compact rows. Settings are saved for your account.'],
        ['Di ponsel, tabel tampil sebagai kartu; gunakan pilihan “Urutkan” dan “Pilih semua di halaman ini”. Bilah aksi massal tetap menempel di bawah layar.', 'On phones, tables appear as cards; use “Sort” and “Select all on this page”. The bulk action bar stays at the bottom of the screen.']
      ],
      tips: [['Sistem memperingatkan bila titik baru berdekatan dengan unit lain (kemungkinan duplikat).', 'The system warns when a new point is close to another location (possible duplicate).'], ['Judul kolom tetap terlihat saat tabel digulir.', 'Column headers stay visible while scrolling the table.']],
      links: [['locations', ['Buka Unit Kerja', 'Open Locations']], ['act:add-loc', ['Tambah unit', 'Add location']]]
    },
    {
      id: 'import', icon: 'upload', title: ['Impor & ekspor data (Excel/CSV)', 'Import & export data (Excel/CSV)'],
      summary: ['Memasukkan banyak unit sekaligus dari Excel atau CSV, memetakan kolom, dan memvalidasi setiap baris.', 'Add many locations at once from Excel or CSV, map the columns, and validate every row.'],
      steps: [
        ['Di Unit Kerja, klik “Impor data”. Unduh “Template Excel” (berisi sheet Petunjuk) atau “Template CSV” bila perlu contoh format.', 'In Locations, click “Import data”. Download the “Excel template” (with a Guide sheet) or the “CSV template” if you need a format example.'],
        ['Pilih file .xlsx atau .csv (maks. 20.000 baris, 10 MB), atau tempel data CSV lalu klik “Lanjut: petakan kolom”.', 'Choose an .xlsx or .csv file (max. 20,000 rows, 10 MB), or paste CSV data and click “Next: map columns”.'],
        ['Di langkah “Petakan kolom”, cocokkan setiap data BranchSync dengan kolom di file. Kolom yang dikenali (mis. storeCode, locationType, latitude) dipilih otomatis; kolom bertanda “Wajib” harus terisi.', 'In “Map columns”, match each BranchSync field to a file column. Recognised columns (e.g. storeCode, locationType, latitude) are pre-selected; fields marked “Required” must be mapped.'],
        ['Klik “Periksa data”. Baris bermasalah tampil paling atas beserta alasannya; klik “Unduh baris bermasalah” untuk memperbaikinya di Excel.', 'Click “Check data”. Problem rows are listed first with the reason; click “Download problem rows” to fix them in Excel.'],
        ['Klik “Impor … baris valid”. Unit baru berstatus “Belum Sync” sampai disinkronkan; kode di file dipakai sebagai kode unit baru.', 'Click “Import … valid rows”. New locations are “Not synced” until synced; codes in the file become the new location codes.'],
        ['Untuk ekspor, klik “Ekspor” di kepala halaman (hasil filter) atau di bilah aksi massal (unit terpilih), lalu pilih Excel (.xlsx) atau CSV.', 'To export, click “Export” in the page header (filtered results) or in the bulk action bar (selected locations), then choose Excel (.xlsx) or CSV.']
      ],
      tips: [
        ['Gunakan “Isi contoh 25 unit baru” untuk mencoba alur impor.', 'Use “Fill sample of 25 new locations” to try the import flow.'],
        ['Tipe dari sistem lain dikenali otomatis: KC/BRANCH/HQ → Kantor Cabang, SUB_BRANCH → KCP. Desimal koma (-6,2) juga diterima.', 'Types from other systems are recognised: KC/BRANCH/HQ → Branch Office, SUB_BRANCH → KCP. Decimal commas (-6,2) are accepted too.'],
        ['Teks yang diawali =, +, - atau @ diberi apostrof saat diekspor agar tidak dijalankan sebagai rumus di Excel.', 'Text starting with =, +, - or @ gets an apostrophe on export so Excel does not run it as a formula.'],
        ['Pustaka Excel dimuat dari internet saat pertama dipakai. Bila offline, gunakan CSV.', 'The Excel library loads from the internet the first time it is used. When offline, use CSV.']
      ],
      links: [['act:import', ['Buka impor', 'Open import']]]
    },
    {
      id: 'map', icon: 'map', title: ['Peta unit kerja', 'Location map'],
      summary: ['Melihat sebaran unit dan selisih titik dengan Google Maps.', 'See location coverage and pin differences with Google Maps.'],
      steps: [
        ['Saring berdasarkan status, region, atau status GBP; cari nama atau kode unit.', 'Filter by status, region, or GBP status; search by name or code.'],
        ['Klik nama di daftar kanan untuk memperbesar ke titik tersebut.', 'Click a name in the right list to zoom to that point.'],
        ['Aktifkan “Tampilkan selisih titik Google” untuk melihat garis antara titik Dashboard dan titik Google.', 'Turn on “Show Google pin differences” to see lines between Dashboard and Google pins.'],
        ['Titik yang berdekatan digabung menjadi lingkaran berangka (klaster). Klik klaster untuk memperbesar; di zoom terdekat, titik yang bertumpuk dibuka melingkar.', 'Nearby points are grouped into numbered circles (clusters). Click a cluster to zoom in; at the closest zoom, stacked points fan out.'],
        ['Daftar kanan menampilkan 300 unit pertama; klik “Tampilkan 300 lagi” untuk melihat berikutnya. Semua unit hasil filter tetap tampil di peta.', 'The right list shows the first 300 locations; click “Show 300 more” for the next ones. All filtered locations stay on the map.']
      ],
      tips: [['Peta membutuhkan koneksi internet. Bila pustaka klaster gagal dimuat, peta tetap tampil tanpa klaster.', 'The map requires an internet connection. If the cluster library fails to load, the map still works without clusters.']],
      links: [['map', ['Buka Peta', 'Open Map']]]
    },
    {
      id: 'sync', icon: 'refresh', title: ['Sinkronisasi ke Google', 'Syncing to Google'],
      summary: ['Mengirim data unit ke Google Business Profile dan menangani kegagalan.', 'Send location data to Google Business Profile and handle failures.'],
      steps: [
        ['Klik “Sinkronkan semua” di Dashboard atau Sync Monitor, atau sinkronkan satu unit dari panel detail.', 'Click “Sync all” on the Dashboard or Sync Monitor, or sync one location from its detail panel.'],
        ['Buka tab “Kegagalan” untuk melihat unit yang gagal beserta penyebabnya.', 'Open the “Failures” tab to see failed locations and the cause.'],
        ['Klik “Coba lagi”, atau “Tindak lanjut” untuk mencatat penanganan bila masalah perlu diselesaikan di luar sistem.', 'Click “Retry”, or “Follow up” to record the handling when the issue must be fixed outside the system.'],
        ['Pantau sisa kuota API; sinkronisasi ditolak bila kuota tidak cukup.', 'Watch the remaining API quota; syncs are refused when quota is insufficient.']
      ],
      tips: [['Unit dengan data berbeda dari Google akan gagal sampai ketidaksesuaiannya diputuskan.', 'Locations whose data differs from Google fail until the mismatch is resolved.']],
      links: [['sync', ['Buka Sync Monitor', 'Open Sync Monitor']]]
    },
    {
      id: 'mismatch', icon: 'alert', title: ['Ketidaksesuaian data', 'Data mismatches'],
      summary: ['Membandingkan data Dashboard dengan listing Google Maps dan memilih sumber yang benar.', 'Compare Dashboard data with the Google Maps listing and choose the correct source.'],
      steps: [
        ['Buka Ketidaksesuaian. Setiap baris menampilkan kolom yang berbeda, nilai di Dashboard, dan nilai di Google.', 'Open Mismatches. Each row shows the differing field, the Dashboard value, and the Google value.'],
        ['Klik “Pakai Dashboard” untuk mengirim data BRI ke Google, atau “Pakai Google” untuk memperbarui Dashboard.', 'Click “Use Dashboard” to send BRI data to Google, or “Use Google” to update the Dashboard.'],
        ['Gunakan ikon catatan untuk mendokumentasikan temuan, lalu “Unduh laporan” sebagai bukti.', 'Use the note icon to document findings, then “Download report” as evidence.']
      ],
      tips: [],
      links: [['discrepancies', ['Buka Ketidaksesuaian', 'Open Mismatches']]]
    },
    {
      id: 'duplicates', icon: 'copy', title: ['Duplikat titik lokasi', 'Duplicate points'],
      summary: ['Menangani listing ganda yang terdeteksi otomatis.', 'Handle automatically detected duplicate listings.'],
      steps: [
        ['Buka Duplikat. Setiap pasangan menampilkan skor kemiripan, alasan, dan jarak.', 'Open Duplicate. Each pair shows a similarity score, reason, and distance.'],
        ['Klik “Pertahankan ini” pada unit yang benar; unit lain dinonaktifkan dan ditandai Duplikat.', 'Click “Keep this” on the correct location; the other is deactivated and marked Duplicate.'],
        ['Pilih “Bukan duplikat” bila keduanya memang berbeda, atau “Laporkan ke Google”.', 'Choose “Not a duplicate” when both are genuinely different, or “Report to Google”.'],
        ['Pasangan tampil 30 per halaman, urut dari yang paling mirip; klik “Tampilkan 30 lagi” untuk berikutnya.', 'Pairs are shown 30 at a time, most similar first; click “Show 30 more” for the next ones.'],
        ['Bila muncul peringatan “titik yang sangat berdekatan”, kemungkinan ada koordinat yang salah impor. Untuk tiap unit di area itu hanya 5 pasangan terdekat yang ditampilkan — perbaiki koordinatnya di Unit Kerja.', 'If you see the “points very close together” warning, coordinates were probably imported wrongly. For each location in that area only the 5 nearest pairs are shown — fix the coordinates in Locations.']
      ],
      tips: [['Radius deteksi dapat diubah di Pengaturan.', 'The detection radius can be changed in Settings.']],
      links: [['duplicates', ['Buka Duplikat', 'Open Duplicate']]]
    },
    {
      id: 'claims', icon: 'shield', title: ['Klaim & titik baru', 'Claims & new points'],
      summary: ['Get Verified, banding suspend, laporan duplikat, dan pengajuan titik baru.', 'Get Verified, suspension appeals, duplicate reports, and new point requests.'],
      steps: [
        ['Klik “Ajukan klaim”, pilih jenis (Klaim kepemilikan, Banding suspend, atau Laporan duplikat) dan unitnya.', 'Click “Submit claim”, choose the type (Ownership claim, Suspension appeal, or Duplicate report) and the location.'],
        ['Untuk lokasi baru, klik “Usulkan titik baru”, tandai titik di peta, dan atur jam operasional.', 'For a new location, click “Propose new point”, mark it on the map, and set opening hours.'],
        ['Pindahkan permintaan melalui tahap: Diajukan → Diproses internal → Menunggu verifikasi Google → Selesai.', 'Move the request through: Submitted → Internal processing → Awaiting Google verification → Done.'],
        ['Waktu proses internal dan waktu verifikasi Google dicatat terpisah untuk SLA.', 'Internal processing time and Google verification time are recorded separately for SLA.']
      ],
      tips: [],
      links: [['claims', ['Buka Klaim', 'Open Claims']]]
    },
    {
      id: 'approvals', icon: 'inbox', title: ['Persetujuan edit eksternal', 'External edit approvals'],
      summary: ['Perubahan dari email GBP lain tidak berlaku sebelum disetujui BRI.', 'Changes from other GBP emails do not apply until BRI approves.'],
      steps: [
        ['Buka Persetujuan Edit untuk melihat usulan beserta nilai sebelum dan sesudah.', 'Open Edit Approvals to see proposals with before and after values.'],
        ['Klik “Setujui” untuk menerapkan perubahan atau “Tolak” agar data tetap seperti semula.', 'Click “Approve” to apply the change or “Reject” to keep the data as it was.'],
        ['Semua keputusan tercatat di tab “Riwayat keputusan” dan Riwayat Perubahan.', 'Every decision is recorded in “Decision history” and Change History.']
      ],
      tips: [['Notifikasi edit eksternal diatur di Integrasi Google.', 'External edit notifications are set in Google Integration.']],
      links: [['approvals', ['Buka Persetujuan', 'Open Approvals']]]
    },
    {
      id: 'reviews', icon: 'star', title: ['Ulasan Google', 'Google reviews'],
      summary: ['Membaca dan membalas ulasan nasabah dari setiap akun dan lokasi Maps.', 'Read and reply to customer reviews from every Maps account and location.'],
      steps: [
        ['Pilih akun Google Business Profile, lalu lokasi Maps yang ingin dilihat.', 'Choose a Google Business Profile account, then the Maps location.'],
        ['Gunakan ringkasan rating untuk menyaring bintang tertentu; urutkan “Belum dibalas dulu”.', 'Use the rating summary to filter by stars; sort by “Awaiting reply first”.'],
        ['Klik “Balas”, pilih template bila perlu, sesuaikan isinya, lalu “Kirim balasan”. Balasan dapat diubah atau dihapus.', 'Click “Reply”, pick a template if needed, adjust it, then “Send reply”. Replies can be edited or deleted.']
      ],
      tips: [['Balasan tampil publik di Google Maps; gunakan bahasa yang sopan.', 'Replies are public on Google Maps; keep them polite.']],
      links: [['reviews', ['Buka Ulasan', 'Open Reviews']]]
    },
    {
      id: 'reports', icon: 'chart', title: ['Laporan, analitik & SLA', 'Reports, analytics & SLA'],
      summary: ['Mengukur kinerja per periode dan membagikannya ke pimpinan.', 'Measure performance per period and share it with management.'],
      steps: [
        ['Buka Laporan & Analitik, pilih periode dan cakupan (region, akun, tipe).', 'Open Reports & Analytics and choose the period and scope (region, account, type).'],
        ['Baca KPI dan perubahan dibanding periode sebelumnya, lalu tren dan kinerja per region.', 'Read the KPIs and change vs the previous period, then trends and regional performance.'],
        ['Klik “Cetak / PDF”, “Ekspor CSV”, atau “Jadwalkan” untuk mengirim laporan berkala melalui email.', 'Click “Print / PDF”, “Export CSV”, or “Schedule” to send periodic reports by email.'],
        ['Buka SLA & Kinerja untuk melihat waktu proses internal yang dipisahkan dari waktu verifikasi Google.', 'Open SLA & Performance to see internal processing time separated from Google verification time.']
      ],
      tips: [],
      links: [['reports', ['Buka Laporan', 'Open Reports']], ['sla', ['Buka SLA', 'Open SLA']]]
    },
    {
      id: 'audit', icon: 'history', title: ['Riwayat perubahan', 'Change history'],
      summary: ['Jejak audit sebelum–sesudah untuk setiap perubahan.', 'Before/after audit trail for every change.'],
      steps: [
        ['Saring berdasarkan pengguna (Internal/Eksternal), modul, dan periode.', 'Filter by user (Internal/External), module, and period.'],
        ['Klik “… perubahan” untuk melihat nilai sebelum dan sesudah.', 'Click “… changes” to see before and after values.'],
        ['Klik “Ekspor CSV” untuk menyimpan bukti audit.', 'Click “Export CSV” to save audit evidence.']
      ],
      tips: [],
      links: [['audit', ['Buka Riwayat', 'Open History']]]
    },
    {
      id: 'access', icon: 'users', title: ['Pengguna & akses', 'Users & access'],
      summary: ['Mengelola pengguna, peran, dan izin.', 'Manage users, roles, and permissions.'],
      steps: [
        ['Tambah atau ubah pengguna dan perannya di tab Pengguna.', 'Add or edit users and their roles on the Users tab.'],
        ['Atur izin per peran di tab Peran & izin dengan mencentang matriks.', 'Set permissions per role on the Roles & permissions tab by ticking the matrix.']
      ],
      tips: [['Administrator selalu memiliki semua izin agar workspace tidak terkunci.', 'Administrators always have every permission so the workspace never locks.']],
      links: [['access', ['Buka Pengguna & Akses', 'Open Users & Access']]]
    },
    {
      id: 'google', icon: 'plug', title: ['Integrasi Google', 'Google integration'],
      summary: ['Mengatur kredensial Google API dan menghubungkan akun GBP.', 'Configure Google API credentials and connect GBP accounts.'],
      steps: [
        ['Isi Project ID, OAuth Client ID & Secret, dan (opsional) API key dari Google Cloud Console.', 'Fill in the Project ID, OAuth Client ID & Secret, and (optional) API key from Google Cloud Console.'],
        ['Salin Redirect URI dan daftarkan di Google Cloud Console.', 'Copy the Redirect URI and register it in Google Cloud Console.'],
        ['Pilih scope, interval sinkronisasi, batas kuota, dan topik Pub/Sub, lalu “Simpan konfigurasi”.', 'Choose scopes, sync interval, quota limit, and Pub/Sub topic, then “Save configuration”.'],
        ['Klik “Hubungkan akun Google” untuk memberi izin akses akun Business Profile.', 'Click “Connect Google account” to grant access to the Business Profile account.']
      ],
      tips: [['Client secret dan API key tidak pernah disimpan di browser.', 'Client secrets and API keys are never stored in the browser.']],
      links: [['integrations', ['Buka Integrasi', 'Open Integration']]]
    },
    {
      id: 'live', icon: 'sliders', title: ['Pengaturan & mode Live', 'Settings & Live mode'],
      summary: ['Menghubungkan ke server BranchSync dan mengatur target SLA serta aturan deteksi.', 'Connect to the BranchSync server and set SLA targets and detection rules.'],
      steps: [
        ['Di Pengaturan, isi URL server API lalu klik “Uji koneksi”.', 'In Settings, enter the API server URL and click “Test connection”.'],
        ['Pilih “Live” di menu mode header dan masuk dengan akun BranchSync.', 'Choose “Live” in the header mode menu and sign in with your BranchSync account.'],
        ['Atur target SLA internal, acuan verifikasi Google, radius duplikat, dan toleransi koordinat.', 'Set the internal SLA target, Google verification benchmark, duplicate radius, and coordinate tolerance.']
      ],
      tips: [
        ['Saat data Live dimuat, halaman menampilkan kerangka abu-abu sesuai bentuk halaman. Indikator di header menunjukkan “Menyimpan…”, “Tersimpan”, atau “Gagal menyimpan”.', 'While Live data loads, the page shows a grey skeleton matching its layout. The header indicator shows “Saving…”, “Saved”, or “Failed to save”.'],
        ['Bila koneksi terputus atau server gagal merespons, banner di atas halaman menjelaskan kondisinya dan data terakhir tetap tampil. Klik “Coba lagi”; saat internet kembali, data dimuat ulang otomatis.', 'If the connection drops or the server fails, a banner at the top explains the situation and the last data stays visible. Click “Try again”; when the internet is back, data reloads automatically.']
      ],
      links: [['settings', ['Buka Pengaturan', 'Open Settings']]]
    },
    {
      id: 'checklist', icon: 'check', title: ['Checklist uji manual per halaman', 'Manual test checklist per page'],
      summary: ['Daftar periksa singkat untuk tiap halaman, dipetakan ke Scenario Test 1–13. Catat hasil dan bukti di halaman Scenario Test.', 'A short checklist for each page, mapped to Scenario Test 1–13. Record results and evidence on the Scenario Test page.'],
      steps: [
        ['Unit Kerja › Impor data (Skenario 1): impor 20–30 unit dari Excel/CSV; pemetaan kolom terisi otomatis, baris bermasalah tampil paling atas, dan jumlah unit di footer bertambah.', 'Locations › Import data (Scenario 1): import 20–30 locations from Excel/CSV; columns map automatically, problem rows appear first, and the footer count increases.'],
        ['Unit Kerja (Skenario 2): cari nama/kode/kota, pakai filter status/region/tipe dan tampilan cepat; chip filter muncul, “Reset filter” mengosongkan semuanya, dan tautan halaman menyimpan filter.', 'Locations (Scenario 2): search by name/code/city, use the status/region/type filters and quick views; filter chips appear, “Reset filters” clears them, and the page link keeps the filters.'],
        ['Ketidaksesuaian (Skenario 3): klik “Simulasikan perubahan Google”, lalu selesaikan satu perbedaan dengan data Dashboard dan satu dengan data Google; catat temuan dan ekspor laporan.', 'Mismatches (Scenario 3): click “Simulate Google change”, then resolve one difference with Dashboard data and one with Google data; record a note and export the report.'],
        ['Data besar (Skenario 4): impor file Excel berisi seluruh unit kerja (hingga ±10.000 unit); Unit Kerja, Peta, Duplikat, dan Laporan tetap terbuka dalam waktu singkat (lihat angka render di footer) tanpa error.', 'Large data (Scenario 4): import an Excel file with all locations (up to ±10,000); Locations, Map, Duplicates, and Reports still open quickly (see the render time in the footer) without errors.'],
        ['Edit unit + Sinkronkan (Skenario 5): ubah telepon/jam satu unit, sinkronkan, lalu pastikan tab “Bandingkan Google” di panel unit tidak menunjukkan perbedaan.', 'Edit location + Sync (Scenario 5): change one location’s phone/hours, sync it, then check that the “Compare Google” tab in the location panel shows no differences.'],
        ['Klaim & Titik Baru (Skenario 6–7): ajukan klaim untuk unit “Belum diklaim” dan satu titik baru; pindahkan keduanya hingga “Selesai” dan periksa waktu proses internal vs verifikasi Google.', 'Claims & New Points (Scenarios 6–7): submit a claim for an “Not claimed” location and one new point; move both to “Done” and check internal vs Google verification time.'],
        ['Duplikat (Skenario 8): tinjau pasangan, “Pertahankan ini” pada satu unit (konfirmasi menyebut kedua nama), lalu coba “Urungkan”.', 'Duplicates (Scenario 8): review the pairs, “Keep this” on one location (the confirmation names both), then try “Undo”.'],
        ['Persetujuan Edit (Skenario 9): ajukan edit dari email GBP lain; data unit tidak berubah sebelum disetujui, dan berubah setelah disetujui.', 'Edit Approvals (Scenario 9): propose an edit from another GBP email; location data does not change before approval, and changes after approval.'],
        ['Riwayat Perubahan (Skenario 10): setiap perubahan di atas tercatat dengan nilai sebelum/sesudah dan penggunanya; ekspor CSV memakai waktu YYYY-MM-DD HH:mm.', 'Change History (Scenario 10): every change above is logged with before/after values and the user; the CSV export uses YYYY-MM-DD HH:mm times.'],
        ['SLA & Kinerja (Skenario 11): waktu proses internal dan waktu verifikasi Google tampil terpisah; ekspor laporan SLA.', 'SLA & Performance (Scenario 11): internal processing time and Google verification time are shown separately; export the SLA report.'],
        ['Sync Monitor (Skenario 12): jalankan sinkronisasi; kegagalan tampil dengan penyebab, “Coba lagi” berfungsi, dan tindak lanjut bisa dicatat.', 'Sync Monitor (Scenario 12): run a sync; failures show their cause, “Retry” works, and follow-ups can be recorded.'],
        ['Laporan & Analitik + Dashboard (Skenario 13): KPI, tren, dan tabel region tampil untuk 7/30/90 hari; cetak/PDF dan ekspor CSV berhasil.', 'Reports & Analytics + Dashboard (Scenario 13): KPIs, trends, and the region table appear for 7/30/90 days; print/PDF and CSV export work.'],
        ['Semua halaman: ganti ke EN dan tema gelap, buka di lebar 360 px (tidak ada gulir ke samping), dan coba navigasi keyboard (Tab, ←/→ di tab, Esc menutup dialog).', 'All pages: switch to EN and dark theme, open at 360 px width (no sideways scrolling), and try keyboard navigation (Tab, ←/→ on tabs, Esc closes dialogs).'],
        ['Mode Live (bila server tersedia): hubungkan, ulangi Skenario 1, 2, 5, dan 12; matikan koneksi untuk melihat banner offline dan pemuatan ulang otomatis.', 'Live mode (if a server is available): connect, repeat Scenarios 1, 2, 5, and 12; turn off the connection to see the offline banner and automatic reload.']
      ],
      tips: [['Gunakan tombol “Bukti otomatis” di setiap skenario untuk mengambil angka dari aplikasi sebagai evidence.', 'Use the “Auto evidence” button in each scenario to capture numbers from the app as evidence.']],
      links: [['scenarios', ['Buka Scenario Test', 'Open Scenario Test']], ['settings', ['Buka Pengaturan', 'Open Settings']]]
    },
    {
      id: 'faq', icon: 'info', title: ['Pertanyaan umum & pemecahan masalah', 'FAQ & troubleshooting'],
      summary: ['Solusi untuk kendala yang sering terjadi.', 'Fixes for common issues.'],
      steps: [
        ['Tidak bisa terhubung ke Live? Periksa URL server, koneksi internet, dan pastikan server mengizinkan CORS.', 'Cannot connect to Live? Check the server URL, internet connection, and that the server allows CORS.'],
        ['Sesi berakhir? Aplikasi kembali ke halaman depan dan meminta Anda masuk lagi. Data tetap aman di server.', 'Session expired? The app returns to the home page and asks you to sign in again. Your data stays safe on the server.'],
        ['Muncul banner “Anda sedang offline”? Periksa internet. Perubahan tidak dapat dikirim sampai koneksi pulih; data dimuat ulang otomatis setelahnya.', 'Seeing the “You are offline” banner? Check your internet. Changes cannot be sent until the connection is back; data reloads automatically afterwards.'],
        ['File Excel tidak terbaca? Pastikan format .xlsx (bukan .xls), ukuran maks. 10 MB, dan baris pertama berisi judul kolom.', 'Excel file not readable? Make sure it is .xlsx (not .xls), at most 10 MB, with column names in the first row.'],
        ['Peta tidak muncul? Peta membutuhkan internet untuk memuat ubin OpenStreetMap.', 'Map not showing? The map needs internet to load OpenStreetMap tiles.']
      ],
      tips: [],
      links: [['scenarios', ['Buka Scenario Test', 'Open Scenario Test']]]
    }
  ],

  scenarioGroups: [
    { id: 'A', title: ['Pengujian Data dan Kapasitas Dashboard', 'Dashboard Data & Capacity Testing'] },
    { id: 'B', title: ['Pengujian Pemutakhiran Informasi Unit Kerja', 'Location Information Update Testing'] },
    { id: 'C', title: ['Pengujian Klaim dan Pengelolaan Titik Lokasi', 'Claim & Location Point Management Testing'] },
    { id: 'D', title: ['Monitoring dan Operasional', 'Monitoring & Operations'] }
  ],
  scenarios: [
    {
      no: 1, group: 'A', start: { view: 'locations', act: 'import-sample' },
      title: ['Input seluruh data Unit Kerja ke Dashboard', 'Input all location data into the Dashboard'],
      expected: ['Seluruh data Unit Kerja tersedia dalam dashboard dan google maps', 'All location data is available in the dashboard and on Google Maps'],
      note: ['Check data 20 - 30 data lokasi kerja yang baru untuk dicoba', 'Check 20–30 new work-location records for the trial'],
      steps: [
        { t: ['Buka Unit Kerja dan catat jumlah unit saat ini (tampilan “Semua”).', 'Open Locations and note the current count (“All” view).'], go: 'locations' },
        { t: ['Klik “Impor data”, lalu unggah file Excel/CSV berisi 20–30 unit baru, atau klik “Isi contoh 25 unit baru”.', 'Click “Import data”, then upload an Excel/CSV file with 20–30 new locations, or click “Fill sample of 25 new locations”.'], act: 'import-sample' },
        { t: ['Klik “Lanjut: petakan kolom”, periksa pemetaan (kolom wajib harus terisi), lalu klik “Periksa data” dan pastikan baris yang salah ditandai beserta alasannya.', 'Click “Next: map columns”, review the mapping (required fields must be mapped), then click “Check data” and make sure wrong rows are flagged with a reason.'] },
        { t: ['Klik “Impor … baris valid”. Pastikan jumlah unit bertambah sesuai jumlah baris valid.', 'Click “Import … valid rows”. Confirm the count grows by the number of valid rows.'] },
        { t: ['Jalankan “Sinkronkan semua” di Sync Monitor agar unit baru dikirim ke Google.', 'Run “Sync all” in Sync Monitor so new locations are sent to Google.'], go: 'sync' },
        { t: ['Pastikan kolom “Data Google” unit baru menjadi “Sesuai” dan titiknya tampil di Peta Unit Kerja.', 'Confirm the new locations show “Match” under “Google data” and appear on the Location Map.'], go: 'map' }
      ],
      evidence: [['Jumlah unit sebelum dan sesudah impor', 'Location count before and after import'], ['Ringkasan validasi impor (baris valid/error)', 'Import validation summary (valid/error rows)'], ['Hasil sinkronisasi unit baru', 'Sync result for the new locations'], ['Tangkapan layar peta berisi titik baru', 'Screenshot of the map with the new points']]
    },
    {
      no: 2, group: 'A', start: { view: 'locations' },
      title: ['Pencarian dan filter data berdasarkan nama, lokasi, atau status Unit Kerja', 'Search and filter locations by name, location, or status'],
      expected: ['Data yang dibutuhkan dapat ditemukan dan diidentifikasi dengan mudah', 'The required data can be found and identified easily'],
      note: ['Standar', 'Standard'],
      steps: [
        { t: ['Di Unit Kerja, ketik nama atau kode unit pada kolom pencarian (tekan “/”).', 'In Locations, type a location name or code in the search box (press “/”).'], go: 'locations' },
        { t: ['Gunakan Filter: status operasional, status GBP, tipe, dan region. Periksa chip filter aktif dan jumlah hasil.', 'Use Filter: operational status, GBP status, type, and region. Check the active filter chips and result count.'] },
        { t: ['Coba tampilan cepat (Perlu sinkron, Beda dengan Google, Belum terverifikasi) dan urutkan kolom.', 'Try quick views (Needs sync, Differs from Google, Not verified) and sort columns.'] },
        { t: ['Tekan ⌘ K / Ctrl K dan cari unit dari mana saja.', 'Press ⌘ K / Ctrl K and search for a location from anywhere.'] },
        { t: ['Di Peta Unit Kerja, saring berdasarkan status/region dan cari kota.', 'On the Location Map, filter by status/region and search for a city.'], go: 'map' }
      ],
      evidence: [['Hasil pencarian berdasarkan nama/kode', 'Search results by name/code'], ['Hasil filter berdasarkan status dan region', 'Filter results by status and region'], ['Hasil pencarian cepat ⌘ K', 'Quick search (⌘ K) result']]
    },
    {
      no: 3, group: 'A', start: { view: 'discrepancies' },
      title: ['Identifikasi ketidaksesuaian data Dashboard BranchSync dengan Google Maps', 'Identify mismatches between BranchSync dashboard data and Google Maps'],
      expected: ['Ketidaksesuaian informasi dapat diketahui dan didokumentasikan', 'Information mismatches can be detected and documented'],
      note: ['Bisa diambil (inject) apabila menggunakan akun gmail biasa. Nanti akan dicoba dengan akun Gbp', 'Can be injected using a regular Gmail account; to be retried with a GBP account'],
      steps: [
        { t: ['Buka Ketidaksesuaian dan lihat jumlah perbedaan per kolom (nama, telepon, jam, alamat, koordinat).', 'Open Mismatches and see the number of differences per field (name, phone, hours, address, coordinates).'], go: 'discrepancies' },
        { t: ['Ubah data listing di Google Maps dengan akun Gmail/GBP lain, lalu klik “Muat ulang” agar perubahannya tertarik ke Dashboard.', 'Edit the listing on Google Maps with another Gmail/GBP account, then click “Reload” to pull the change into the Dashboard.'] },
        { t: ['Bandingkan nilai di Dashboard dan di Google Maps. Buka “Bandingkan Google” di panel detail unit untuk melihat semua kolom.', 'Compare the Dashboard and Google Maps values. Open “Compare Google” in the location panel to see every field.'] },
        { t: ['Klik ikon catatan untuk mendokumentasikan temuan, lalu “Unduh laporan”.', 'Click the note icon to document the finding, then “Download report”.'] },
        { t: ['Selesaikan dengan “Pakai Dashboard” atau “Pakai Google”, lalu cek jejaknya di Riwayat Perubahan.', 'Resolve with “Use Dashboard” or “Use Google”, then check the trail in Change History.'], go: 'audit' }
      ],
      evidence: [['Daftar ketidaksesuaian yang terdeteksi', 'List of detected mismatches'], ['Catatan temuan', 'Finding notes'], ['Laporan CSV ketidaksesuaian', 'Mismatch CSV report'], ['Riwayat keputusan penyelesaian', 'Resolution decision history']]
    },
    {
      no: 4, group: 'A', start: { view: 'locations' },
      title: ['Pengujian performa dashboard saat mengelola seluruh data Unit Kerja', 'Dashboard performance test with all location data'],
      expected: ['Dashboard dapat diakses dengan baik tanpa adanya bug', 'The dashboard works well without bugs'],
      note: ['Diberikan akses kepada BRI untuk diuji', 'Access is given to BRI for testing'],
      steps: [
        { t: ['Impor seluruh data unit kerja BRI (file Excel/CSV) lewat Unit Kerja › Impor data, atau gunakan data yang sudah ada di server.', 'Import all BRI location data (Excel/CSV file) via Locations › Import data, or use the data already on the server.'], go: 'locations' },
        { t: ['Catat waktu proses dari notifikasi dan nilai “render … ms” di bagian bawah halaman.', 'Note the processing time from the notification and the “render … ms” value at the bottom of the page.'] },
        { t: ['Di Unit Kerja: cari, filter, urutkan, pindah halaman, dan ubah jumlah baris. Pastikan responsif.', 'In Locations: search, filter, sort, change pages, and change rows per page. Confirm it stays responsive.'], go: 'locations' },
        { t: ['Buka Peta, Laporan & Analitik, dan Dashboard. Pastikan tidak ada error atau tampilan rusak.', 'Open the Map, Reports & Analytics, and Dashboard. Confirm there are no errors or broken layouts.'], go: 'reports' },
        { t: ['Ulangi di browser/perangkat lain (desktop dan ponsel).', 'Repeat on another browser/device (desktop and phone).'] }
      ],
      evidence: [['Jumlah unit saat pengujian', 'Location count during the test'], ['Waktu render halaman', 'Page render time'], ['Daftar halaman yang diuji tanpa error', 'Pages tested without errors']]
    },
    {
      no: 5, group: 'B', start: { view: 'locations' },
      title: ['Perubahan Data', 'Data changes'],
      expected: ['Data Unit Kerja pada Dashboard dan Google Maps sesuai', 'Location data on the Dashboard and Google Maps match'],
      note: ['Dilakukan Checking', 'Checking performed'],
      steps: [
        { t: ['Di Unit Kerja, klik ikon edit pada satu unit. Ubah telepon, jam operasional (editor per hari), atau geser titik di peta.', 'In Locations, click edit on a location. Change the phone, opening hours (per-day editor), or drag the map pin.'], go: 'locations' },
        { t: ['Simpan. Kolom “Data Google” menunjukkan perbedaan karena Google belum diperbarui.', 'Save. The “Google data” column shows a difference because Google is not updated yet.'] },
        { t: ['Buka panel detail → “Sinkronkan”, lalu pastikan semua kolom di “Bandingkan Google” menjadi “Sesuai”.', 'Open the detail panel → “Sync”, then confirm every field in “Compare Google” shows “Match”.'] },
        { t: ['Cek tab Riwayat di panel unit untuk nilai sebelum–sesudah dan nama pengubah.', 'Check the History tab in the location panel for before/after values and the editor’s name.'] }
      ],
      evidence: [['Nilai sebelum dan sesudah perubahan', 'Values before and after the change'], ['Status “Sesuai” setelah sinkronisasi', '“Match” status after sync'], ['Entri riwayat perubahan', 'Change history entry']]
    },
    {
      no: 6, group: 'C', start: { view: 'claims', act: 'claim-new' },
      title: ['Klaim titik lokasi yang kepemilikannya belum terverifikasi', 'Claim location points whose ownership is not verified'],
      expected: ['Pengajuan klaim titik lokasi dapat dilakukan dengan baik dan terdata dalam dashboard', 'Location claims can be submitted properly and are recorded in the dashboard'],
      note: ['Dapat dijelaskan di RFI mekanisme klaim pada data unit kerja (Suspend, Duplicate, dan Get Verified)', 'The claim mechanism (Suspend, Duplicate, Get Verified) can be explained in the RFI'],
      steps: [
        { t: ['Di Unit Kerja, pilih tampilan cepat “Belum terverifikasi” untuk melihat unit yang perlu diklaim.', 'In Locations, choose the “Not verified” quick view to see locations that need claiming.'], go: 'locations' },
        { t: ['Buka Klaim & Titik Baru → “Ajukan klaim”. Pilih Klaim kepemilikan (Get Verified) atau Banding suspend, lalu unitnya.', 'Open Claims & New Points → “Submit claim”. Choose Ownership claim (Get Verified) or Suspension appeal, then the location.'], act: 'claim-new' },
        { t: ['Pindahkan permintaan ke tahap berikutnya hingga “Selesai”.', 'Move the request to the next stages until “Done”.'], go: 'claims' },
        { t: ['Pastikan status GBP unit menjadi “Terverifikasi” dan permintaan tercatat di tab Selesai.', 'Confirm the location’s GBP status becomes “Verified” and the request appears under Done.'] }
      ],
      evidence: [['ID permintaan klaim', 'Claim request ID'], ['Tahapan yang dilalui', 'Stages completed'], ['Status GBP sebelum/sesudah', 'GBP status before/after']]
    },
    {
      no: 7, group: 'C', start: { view: 'claims', act: 'point-new' },
      title: ['Pembuatan titik lokasi baru pada Google Maps', 'Create a new location point on Google Maps'],
      expected: ['Tersedia mekanisme pengajuan dan pemrosesan titik lokasi baru', 'A mechanism exists to submit and process new location points'],
      note: ['Standar', 'Standard'],
      steps: [
        { t: ['Buka Klaim & Titik Baru → “Usulkan titik baru”.', 'Open Claims & New Points → “Propose new point”.'], act: 'point-new' },
        { t: ['Isi data unit, klik peta atau geser penanda untuk menandai titik, dan atur jam operasional per hari.', 'Fill in the location data, click the map or drag the pin to mark the point, and set per-day opening hours.'] },
        { t: ['Bila sistem memperingatkan ada unit berdekatan, periksa kemungkinan duplikat sebelum melanjutkan.', 'If the system warns about a nearby location, check for a possible duplicate before continuing.'] },
        { t: ['Proses permintaan hingga “Selesai”; unit baru otomatis muncul di Unit Kerja dan Peta.', 'Process the request until “Done”; the new location appears automatically in Locations and on the Map.'], go: 'claims' }
      ],
      evidence: [['ID pengajuan titik baru', 'New point request ID'], ['Koordinat & jam operasional yang diajukan', 'Submitted coordinates & opening hours'], ['Unit baru di daftar dan peta', 'New location in the list and on the map']]
    },
    {
      no: 8, group: 'C', start: { view: 'duplicates' },
      title: ['Identifikasi titik lokasi ganda (duplicate listing)', 'Identify duplicate location points (duplicate listings)'],
      expected: ['Duplikasi titik lokasi dapat diidentifikasi', 'Duplicate location points can be identified'],
      note: ['Suspend, Duplicate, Get Verified', 'Suspend, Duplicate, Get Verified'],
      steps: [
        { t: ['Buka Duplikat dan periksa pasangan yang terdeteksi: skor kemiripan, alasan, dan jarak.', 'Open Duplicate and review detected pairs: similarity score, reason, and distance.'], go: 'duplicates' },
        { t: ['Pilih “Pertahankan ini” pada unit yang benar, atau “Laporkan ke Google” untuk mengajukan laporan duplikat.', 'Choose “Keep this” on the correct location, or “Report to Google” to file a duplicate report.'] },
        { t: ['Ubah radius deteksi di Pengaturan bila perlu, lalu periksa ulang.', 'Adjust the detection radius in Settings if needed, then check again.'], go: 'settings' }
      ],
      evidence: [['Daftar pasangan duplikat', 'List of duplicate pairs'], ['Keputusan yang diambil', 'Decisions taken'], ['Laporan duplikat (bila ada)', 'Duplicate report (if any)']]
    },
    {
      no: 9, group: 'C', start: { view: 'approvals' },
      title: ['Notifikasi pengeditan Data Unit Kerja BranchSync oleh Email GBP yang tidak diketahui/lainnya', 'Notification of BranchSync location edits by unknown/other GBP emails'],
      expected: ['Akan muncul di email GBP yang terintegrasi dengan BranchSync, yang dimana terdapat di Inbox email yang menunjukan approval perubahan data oleh email lain (kalau dari sisi BRI tidak approve maka data Unit Kerja tidak akan berubah (aman).', 'It appears in the GBP email integrated with BranchSync, in an inbox showing approval requests for changes by other emails (if BRI does not approve, the location data does not change — safe).'],
      note: ['Standar dan dijelaskan di RFI', 'Standard and explained in the RFI'],
      steps: [
        { t: ['Di Integrasi Google, pastikan “Notifikasi edit dari email GBP lain” aktif.', 'In Google Integration, make sure “Notifications for edits from other GBP emails” is on.'], go: 'integrations' },
        { t: ['Ajukan edit pada listing dari email GBP lain. Usulan masuk ke Persetujuan Edit lewat notifikasi Google (Pub/Sub).', 'Propose an edit to the listing from another GBP email. The proposal arrives in Edit Approvals via Google notifications (Pub/Sub).'] },
        { t: ['Periksa ikon notifikasi (lonceng) dan kartu permintaan yang menunjukkan nilai sebelum–sesudah.', 'Check the notification bell and the request card showing before/after values.'], go: 'approvals' },
        { t: ['Klik “Tolak” dan pastikan data unit tidak berubah. Ulangi dengan “Setujui” dan pastikan data berubah.', 'Click “Reject” and confirm the location data is unchanged. Repeat with “Approve” and confirm the data changes.'] },
        { t: ['Cek Riwayat Perubahan dengan filter Pengguna “Eksternal”.', 'Check Change History filtered by “External” users.'], go: 'audit' }
      ],
      evidence: [['Notifikasi edit eksternal', 'External edit notification'], ['Bukti data tidak berubah saat ditolak', 'Proof data is unchanged when rejected'], ['Entri riwayat eksternal', 'External history entry']]
    },
    {
      no: 10, group: 'D', start: { view: 'audit' },
      title: ['Monitoring histori perubahan pada titik lokasi unit kerja BRI', 'Monitor change history of BRI location points'],
      expected: ['Terdapat histori perubahan informasi (sebelum dan sesudah) serta user yang melakukan perubahan', 'A history of changes (before and after) and the user who made them is available'],
      note: ['Yang punya aksesnya dapat terlihat historical penggunaan Dashboard. Baik Eksternal maupun yang memiliki user Internal', 'Users with access can see the dashboard usage history, both external and internal users'],
      steps: [
        { t: ['Buka Riwayat Perubahan. Saring berdasarkan Pengguna (Internal/Eksternal), Modul, dan Periode.', 'Open Change History. Filter by User (Internal/External), Module, and Period.'], go: 'audit' },
        { t: ['Klik “… perubahan” untuk melihat nilai sebelum dan sesudah serta nama penggunanya.', 'Click “… changes” to see before and after values and the user name.'] },
        { t: ['Buka panel detail sebuah unit → tab Riwayat untuk histori per titik lokasi.', 'Open a location’s detail panel → History tab for per-point history.'], go: 'locations' },
        { t: ['Klik “Ekspor CSV” sebagai bukti audit.', 'Click “Export CSV” as audit evidence.'], go: 'audit' }
      ],
      evidence: [['Daftar riwayat dengan pengguna internal & eksternal', 'History list with internal & external users'], ['Contoh detail sebelum–sesudah', 'Example before/after detail'], ['File CSV riwayat', 'History CSV file']]
    },
    {
      no: 11, group: 'D', start: { view: 'sla' },
      title: ['Pengukuran waktu penyelesaian permintaan perubahan (SLA)', 'Measure change-request resolution time (SLA)'],
      expected: ['Waktu proses dapat diukur dan dipisahkan dari waktu verifikasi Google', 'Processing time can be measured and separated from Google verification time'],
      note: ['Waktu inject unit kerja di Google Maps pada Dashboard', 'Time to inject locations into Google Maps from the Dashboard'],
      steps: [
        { t: ['Buka SLA & Kinerja. Bagian biru = proses internal BRI, bagian oranye = verifikasi Google.', 'Open SLA & Performance. Blue = BRI internal processing, orange = Google verification.'], go: 'sla' },
        { t: ['Atur target SLA internal di Pengaturan bila perlu.', 'Set the internal SLA target in Settings if needed.'], go: 'settings' },
        { t: ['Ajukan atau proses klaim/titik baru di Klaim & Titik Baru, lalu lihat perubahan waktunya.', 'Submit or process a claim/new point in Claims & New Points, then watch the times update.'], go: 'claims' },
        { t: ['Klik “Ekspor CSV” di SLA & Kinerja sebagai bukti.', 'Click “Export CSV” in SLA & Performance as evidence.'], go: 'sla' }
      ],
      evidence: [['Rata-rata waktu proses internal', 'Average internal processing time'], ['Rata-rata waktu verifikasi Google', 'Average Google verification time'], ['Laporan SLA CSV', 'SLA CSV report']]
    },
    {
      no: 12, group: 'D', start: { view: 'sync' },
      title: ['Pengujian penanganan data tidak valid atau gagal diperbarui', 'Test handling of invalid data or failed updates'],
      expected: ['Kegagalan dapat diidentifikasi, diberi keterangan, dan ditindaklanjuti', 'Failures can be identified, annotated, and followed up'],
      note: ['Apakah ada system error atau tidak', 'Whether there is a system error or not'],
      steps: [
        { t: ['Impor data berisi baris yang salah (contoh 25 unit berisi 2 baris error) dan pastikan baris ditandai beserta alasannya. Klik “Unduh baris bermasalah” untuk bukti.', 'Import data with wrong rows (the 25-location sample contains 2 error rows) and confirm the rows are flagged with a reason. Click “Download problem rows” as evidence.'], act: 'import-sample' },
        { t: ['Jalankan sinkronisasi, lalu buka Sync Monitor → tab Kegagalan untuk melihat penyebabnya.', 'Run a sync, then open Sync Monitor → Failures tab to see the causes.'], go: 'sync' },
        { t: ['Klik “Coba lagi” untuk kegagalan sementara, atau “Tindak lanjut” untuk mencatat keterangan penanganan.', 'Click “Retry” for transient failures, or “Follow up” to record handling notes.'] },
        { t: ['Pastikan tidak ada pesan error sistem; cek tab Riwayat job.', 'Make sure there are no system error messages; check the Job history tab.'] }
      ],
      evidence: [['Baris impor yang ditolak beserta alasannya', 'Rejected import rows with reasons'], ['Daftar kegagalan sinkronisasi', 'Sync failure list'], ['Catatan tindak lanjut', 'Follow-up notes']]
    },
    {
      no: 13, group: 'D', start: { view: 'reports' },
      title: ['Penilaian Efektivitas Pengelolaan', 'Management effectiveness assessment'],
      expected: ['Tersedia dashboard monitoring & SLA sebagai parameter evaluasi pengelolaan', 'A monitoring & SLA dashboard is available as a management evaluation parameter'],
      note: ['SLA dari aktivitas Scenario Test', 'SLA from the Scenario Test activities'],
      steps: [
        { t: ['Buka Laporan & Analitik, pilih periode pengujian dan cakupan yang dinilai.', 'Open Reports & Analytics and choose the test period and scope.'], go: 'reports' },
        { t: ['Tinjau KPI, tren, kinerja per region, dan penyebab kegagalan.', 'Review KPIs, trends, regional performance, and failure causes.'] },
        { t: ['Klik “Cetak / PDF” untuk laporan evaluasi dan “Jadwalkan” untuk laporan berkala.', 'Click “Print / PDF” for the evaluation report and “Schedule” for periodic reports.'] },
        { t: ['Kembali ke Scenario Test dan unduh laporan hasil seluruh skenario.', 'Return to Scenario Test and download the results report for all scenarios.'], go: 'scenarios' }
      ],
      evidence: [['Laporan analitik periode pengujian', 'Analytics report for the test period'], ['Ringkasan SLA', 'SLA summary'], ['Laporan hasil Scenario Test', 'Scenario Test results report']]
    }
  ]
};
