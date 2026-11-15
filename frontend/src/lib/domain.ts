// Konstanta domain BranchSync (status, tipe, izin, navigasi, template). Nilai data/API memakai bentuk aslinya.
import type { GbpStatus, LocType, Status } from './types';

export const MIN = 6e4, HOUR = 36e5, DAY = 864e5;

export const STATUSES: Status[] = ['Online', 'Offline', 'Belum Sync', 'Tidak Aktif'];
export const TYPES: LocType[] = ['Kantor Cabang', 'KCP', 'Unit', 'ATM'];
export const GBP: GbpStatus[] = ['Terverifikasi', 'Menunggu Verifikasi', 'Belum Diklaim', 'Suspend', 'Duplikat'];
export const REGIONS = ['Jawa', 'Sumatera', 'Kalimantan', 'Sulawesi', 'Bali & Nusa Tenggara', 'Maluku', 'Papua'];

export const regionOf = (p: string) => /Jakarta|Jawa|Banten|Yogyakarta/.test(p) ? 'Jawa' : /Sumatera|Aceh|Riau|Jambi|Bengkulu|Lampung|Bangka/.test(p) ? 'Sumatera' : /Kalimantan/.test(p) ? 'Kalimantan' : /Sulawesi|Gorontalo/.test(p) ? 'Sulawesi' : /Bali|Nusa/.test(p) ? 'Bali & Nusa Tenggara' : /Maluku/.test(p) ? 'Maluku' : 'Papua';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';
export const TONE: Record<string, Tone> = {
  Online: 'good', Offline: 'warn', 'Belum Sync': 'info', 'Tidak Aktif': 'neutral',
  Terverifikasi: 'good', 'Menunggu Verifikasi': 'info', 'Belum Diklaim': 'neutral', Suspend: 'bad', Duplikat: 'warn',
  Berhasil: 'good', Gagal: 'bad', Dilewati: 'neutral', Aktif: 'good', Nonaktif: 'neutral',
  Menunggu: 'warn', Disetujui: 'good', Ditolak: 'bad', Selesai: 'good',
  Diajukan: 'info', 'Diproses internal': 'info', 'Menunggu verifikasi Google': 'warn',
  'Dalam SLA': 'good', 'Lewat SLA': 'bad', 'Mendekati batas': 'warn', Internal: 'neutral', Eksternal: 'warn', Ditangani: 'good'
};
// Label tampilan seragam (huruf kapital hanya di awal).
const STATUS_LABEL: Record<string, string> = { 'Belum Sync': 'Belum sinkron', 'Tidak Aktif': 'Tidak aktif', 'Belum Diklaim': 'Belum diklaim', 'Menunggu Verifikasi': 'Menunggu verifikasi' };
export const SL = (s: string) => STATUS_LABEL[s] || s;
export const labelled = (xs: readonly string[]): [string, string][] => xs.map(x => [x, SL(x)]);

export const FIELD_LABEL: Record<string, string> = { name: 'Nama listing', phone: 'Telepon', hours: 'Jam operasional', address: 'Alamat', coords: 'Titik koordinat', type: 'Tipe', status: 'Status', gbp: 'Status GBP', city: 'Kota', province: 'Provinsi', lat: 'Latitude', lng: 'Longitude' };
export const DISC_FIELDS = ['name', 'phone', 'hours', 'address', 'coords'] as const;
export const MARKER: Record<string, string> = { Online: '#1f8a5b', Offline: '#e0660f', 'Belum Sync': '#1a6fc4', 'Tidak Aktif': '#8a97a8' };
export const STEPS = ['Diajukan', 'Diproses internal', 'Menunggu verifikasi Google', 'Selesai'];
export const CLAIM_KINDS = ['Klaim kepemilikan', 'Banding suspend', 'Laporan duplikat'];
export const HOURS = ['Sen–Jum 08.00–15.00', 'Sen–Jum 08.00–16.00', 'Sen–Sab 08.00–14.00', 'Setiap hari 24 jam'];

export const PERMS: [string, string][] = [
  ['locations.read', 'Lihat unit kerja'], ['locations.write', 'Ubah unit kerja'], ['locations.import', 'Impor data massal'],
  ['sync.run', 'Jalankan sinkronisasi'], ['claims.manage', 'Kelola klaim & titik baru'], ['approvals.decide', 'Putuskan edit eksternal'],
  ['reviews.reply', 'Balas ulasan'], ['audit.read', 'Lihat riwayat'], ['users.manage', 'Kelola pengguna'], ['settings.write', 'Ubah pengaturan']
];
export const permLabel = (perm: string) => (PERMS.find(x => x[0] === perm) || [perm, perm])[1];

export const REPLY_TEMPLATES = [
  { label: 'Terima kasih (ulasan positif)', text: 'Halo {nama}, terima kasih atas ulasan dan kepercayaan Anda kepada {unit}. Kami senang dapat melayani Anda dan menantikan kunjungan berikutnya. Salam hangat, BRI.' },
  { label: 'Permohonan maaf (ulasan negatif)', text: 'Halo {nama}, mohon maaf atas ketidaknyamanan yang Anda alami di {unit}. Masukan Anda sudah kami teruskan ke tim terkait untuk perbaikan. Silakan hubungi kanal resmi BRI agar kami dapat membantu lebih lanjut.' },
  { label: 'Antrean / waktu tunggu', text: 'Halo {nama}, terima kasih atas masukannya. Kami sedang menambah petugas di jam sibuk agar waktu tunggu di {unit} lebih singkat. Mohon maaf atas ketidaknyamanannya.' },
  { label: 'Informasi lokasi / jam salah', text: 'Halo {nama}, terima kasih telah memberi tahu kami. Informasi lokasi dan jam operasional {unit} sudah kami periksa dan perbarui di Google Maps.' },
  { label: 'Masalah ATM', text: 'Halo {nama}, mohon maaf atas kendala ATM di {unit}. Tim kami sudah melakukan pengecekan. Untuk kartu tertelan atau transaksi gagal, silakan hubungi kanal pengaduan resmi BRI dengan menyiapkan data transaksi Anda.' }
];
export const REPLY_MAX = 4096; // batas panjang balasan Google Business Profile
export const fillTemplate = (t: string, author: string, unit: string) => t.replace(/\{nama\}/g, String(author || '').split(' ')[0] || 'Bapak/Ibu').replace(/\{unit\}/g, unit || 'unit kami');

export const GOOGLE_SCOPES: [string, string, string][] = [
  ['business.manage', 'Kelola profil bisnis, lokasi & ulasan', 'wajib'],
  ['pubsub', 'Notifikasi real-time (Pub/Sub) untuk ulasan & edit baru', 'opsional'],
  ['userinfo.email', 'Identitas akun Google yang menghubungkan', 'opsional']
];
export const SYNC_INTERVALS: [string, string][] = [['0', 'Manual saja'], ['15', 'Setiap 15 menit'], ['60', 'Setiap jam'], ['360', 'Setiap 6 jam'], ['1440', 'Setiap hari']];

export type ViewId = 'dashboard' | 'map' | 'reports' | 'sla' | 'locations' | 'discrepancies' | 'duplicates' | 'claims' | 'approvals' | 'reviews' | 'sync' | 'audit' | 'access' | 'integrations' | 'settings' | 'profile' | 'guide' | 'scenarios';
export type CountKey = 'issues' | 'dups' | 'claims' | 'approvals' | 'reviews' | 'fails';
// parent: halaman ini tampil sebagai tab di halaman induk (tidak muncul sendiri di sidebar).
export interface NavItem { id: ViewId; label: string; icon: string; desc: string; perm?: string; count?: CountKey; parent?: ViewId; tab?: string }

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Monitoring', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', desc: 'Ringkasan kondisi jaringan dan pekerjaan yang perlu ditindaklanjuti.' },
    { id: 'map', label: 'Peta Unit Kerja', icon: 'map', desc: 'Sebaran unit kerja beserta selisih titik dengan Google Maps.' },
    { id: 'reports', label: 'Laporan & Analitik', icon: 'chart', desc: 'Analitik kinerja jaringan, sinkronisasi, ulasan, dan SLA per periode — siap dicetak atau diekspor.' },
    { id: 'sla', label: 'SLA & Kinerja', icon: 'gauge', desc: 'Waktu proses internal dipisahkan dari waktu verifikasi Google.' }
  ] },
  { group: 'Data Unit Kerja', items: [
    { id: 'locations', label: 'Unit Kerja', icon: 'building', desc: 'Cari, filter, impor, dan perbarui seluruh data unit kerja.' },
    { id: 'discrepancies', label: 'Ketidaksesuaian', icon: 'alert', count: 'issues', desc: 'Data Dashboard yang berbeda dengan listing Google Maps.' },
    { id: 'duplicates', label: 'Duplikat', icon: 'copy', count: 'dups', desc: 'Titik lokasi ganda yang terdeteksi otomatis dari jarak dan kemiripan nama.' },
    { id: 'claims', label: 'Klaim & Titik Baru', icon: 'shield', count: 'claims', desc: 'Klaim kepemilikan, banding suspend, laporan duplikat, dan pengajuan titik baru.' }
  ] },
  { group: 'Operasional', items: [
    { id: 'approvals', label: 'Persetujuan Edit', icon: 'inbox', count: 'approvals', desc: 'Perubahan dari email GBP lain. Data tidak berubah sebelum BRI menyetujui.' },
    { id: 'reviews', label: 'Ulasan', icon: 'star', count: 'reviews', desc: 'Ulasan nasabah dari setiap akun dan lokasi Google Maps. Balas langsung dari sini.' },
    { id: 'sync', label: 'Sync Monitor', icon: 'refresh', count: 'fails', desc: 'Pantau job sinkronisasi dan tindak lanjuti data yang gagal diperbarui.' },
    { id: 'audit', label: 'Riwayat Perubahan', icon: 'history', perm: 'audit.read', desc: 'Jejak sebelum–sesudah setiap perubahan beserta pengguna internal maupun eksternal.' }
  ] },
  { group: 'Administrasi', items: [
    { id: 'settings', label: 'Pengaturan', icon: 'sliders', tab: 'Umum', desc: 'Preferensi workspace, target SLA, aturan deteksi, dan koneksi server.' },
    { id: 'profile', label: 'Profil Saya', icon: 'user', parent: 'settings', tab: 'Profil', desc: 'Nama tampilan dan kata sandi akun Anda.' },
    { id: 'access', label: 'Pengguna & Akses', icon: 'users', perm: 'users.manage', parent: 'settings', desc: 'Kelola pengguna, peran, dan izin akses.' },
    { id: 'integrations', label: 'Integrasi Google', icon: 'plug', perm: 'settings.write', parent: 'settings', desc: 'Koneksi Google Business Profile, kuota API, dan notifikasi.' }
  ] },
  { group: 'Bantuan', items: [
    { id: 'guide', label: 'Panduan Pengguna', icon: 'book', desc: 'Cara memakai setiap fitur BranchSync, langkah demi langkah.' },
    { id: 'scenarios', label: 'Scenario Test', icon: 'clipboard', desc: 'Tutorial dan pencatatan hasil 13 skenario uji piloting Dashboard BranchSync.' }
  ] }
];
export const NAV_ITEMS = NAV.flatMap(g => g.items);
export const navItem = (id: string) => NAV_ITEMS.find(n => n.id === id) || NAV_ITEMS[0];
// Menu sidebar yang aktif untuk sebuah halaman (halaman tab → induknya).
export const navRoot = (id: string): ViewId => navItem(id).parent || navItem(id).id;
// Tab di halaman induk: induk sendiri + halaman yang parent-nya induk tersebut.
export const navTabs = (root: ViewId) => NAV_ITEMS.filter(n => n.id === root || n.parent === root);
