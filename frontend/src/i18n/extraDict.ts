// Tambahan kamus (ID → EN) untuk teks baru di versi React (hanya mode Live). Dicek sebelum adminDict.
const DICT: Record<string, string> = {
  'Koneksi server': 'Server connection',
  'Umum': 'General',
  'Bagian pengaturan': 'Settings sections',
  'Penyimpanan data': 'Data storage',
  'Semua data workspace tersimpan di server BranchSync (database PostgreSQL), bukan di browser.': 'All workspace data is stored on the BranchSync server (PostgreSQL database), not in the browser.',
  'Server BranchSync (Go + PostgreSQL). Daftar endpoint ada di API.md.': 'BranchSync server (Go + PostgreSQL). The endpoint list is in API.md.',
  'Unduh seluruh data workspace yang sedang dimuat sebagai JSON.': 'Download all currently loaded workspace data as JSON.',
  'Preferensi workspace, target SLA, aturan deteksi, dan koneksi server.': 'Workspace preferences, SLA targets, detection rules, and server connection.',
  'Data diperbarui dari server.': 'Data refreshed from the server.',
  'Ulasan diperbarui dari server.': 'Reviews refreshed from the server.',
  'Koneksi pulih — data diperbarui.': 'Connection restored — data refreshed.',
  'Sesi berakhir atau tidak valid. Silakan masuk kembali.': 'Your session expired or is invalid. Please sign in again.',
  'Perubahan belum tersimpan. Periksa pesan di pojok layar.': 'Changes were not saved. Check the message in the corner of the screen.',
  'Unit belum tersimpan. Periksa pesan di pojok layar.': 'The location was not saved. Check the message in the corner of the screen.',
  'Permintaan belum terkirim. Periksa pesan di pojok layar.': 'The request was not sent. Check the message in the corner of the screen.',
  'Pengajuan belum terkirim. Periksa pesan di pojok layar.': 'The proposal was not sent. Check the message in the corner of the screen.',
  'Pengguna belum tersimpan. Periksa pesan di pojok layar.': 'The user was not saved. Check the message in the corner of the screen.',
  'Peran belum tersimpan. Periksa pesan di pojok layar.': 'The role was not saved. Check the message in the corner of the screen.',
  'Jadwal belum tersimpan. Periksa pesan di pojok layar.': 'The schedule was not saved. Check the message in the corner of the screen.',
  'Dipakai untuk masuk dengan kode OTP atau Google.': 'Used to sign in with an OTP code or Google.',
  'Administrator selalu memiliki semua izin agar workspace tidak terkunci. Izin juga diperiksa oleh server di setiap permintaan.': 'Administrators always have every permission so the workspace never gets locked. Permissions are also checked by the server on every request.',
  'Menu koneksi': 'Connection menu',
  'Mengimpor…': 'Importing…',
  'Menyimpan…': 'Saving…',
  'Data Dashboard dikirim ke Google.': 'Dashboard data sent to Google.',
  'Gagal disinkronkan': 'Failed to sync',
  'Klaim & titik baru berjalan': 'Claims & new points in progress',
  'Menghubungkan akun Google hanya bisa dari alamat web (http/https).': 'Connecting a Google account only works from a web address (http/https).',
  'Pustaka Excel gagal dimuat.': 'The Excel library failed to load.',
  'Status workspace': 'Workspace status',
  'sesuai': 'match', 'perbedaan': 'differences'
};
const PATTERNS: [RegExp, string | ((...m: string[]) => string)][] = [
  [/^Live — (terhubung|terputus|menghubungkan) ke (.+?)(\. Menu koneksi)?$/, (_m, st, h, menu) => `Live — ${{ terhubung: 'connected', terputus: 'disconnected', menghubungkan: 'connecting' }[st]} to ${h}${menu ? '. Connection menu' : ''}`],
  [/^(.+) tersimpan di server \((\d+) kolom\)\.$/, '$1 saved to the server ($2 fields).'],
  [/^Jadwal “(.+)” disimpan \((.+)\)\.$/, 'Schedule “$1” saved.'],
  [/^(\d[\d.,]*) Gagal disinkronkan$/, '$1 Failed to sync'],
  [/^(\d[\d.,]*) Klaim & titik baru berjalan$/, '$1 Claims & new points in progress'],
  [/^(\d[\d.,]*) unit ditampilkan$/, '$1 locations shown'],
  [/^(.+) \(berjalan\)$/, '$1 (running)']
];
export function extraTranslate(core: string): string | null {
  if (Object.prototype.hasOwnProperty.call(DICT, core)) return DICT[core];
  for (const [re, rep] of PATTERNS) { if (re.test(core)) return core.replace(re, rep as string); }
  return null;
}
