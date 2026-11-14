'use strict';
/*
 * BranchSync — halaman utama (sebelum login). Data simulasi, tanpa backend.
 * Variabel global `locations`, `language`, `dialog`, dan `loginTrigger`
 * juga dipakai oleh admin.js.
 */

/* ---------------------------------------------------------------- *
 * Bahasa
 * ---------------------------------------------------------------- */
let language = 'id';
try { language = localStorage.getItem('branchSyncLanguage') === 'en' ? 'en' : 'id'; } catch (_) {}
const text = (id, en) => (language === 'en' ? en : id);
const locale = () => (language === 'en' ? 'en-GB' : 'id-ID');
const fmt = n => new Intl.NumberFormat(locale()).format(n);
const pctFmt = v => new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 1 }).format(v);
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const I18N = {
  skip: ['Lewati ke konten utama', 'Skip to main content'],
  brandTag: ['Platform Sinkronisasi Lokasi', 'Location Sync Platform'],
  navLabel: ['Navigasi halaman', 'Page navigation'],
  navMap: ['Peta jaringan', 'Network map'], navSummary: ['Ringkasan', 'Summary'], navFeatures: ['Fitur', 'Features'],
  langLabel: ['Bahasa', 'Language'],
  login: ['Masuk', 'Sign in'],
  heroEyebrow: ['Platform Monitoring Lokasi Kantor BRI', 'BRI Office Location Monitoring Platform'],
  heroTitle1: ['Satu peta untuk', 'One map for'],
  heroTitle2: ['seluruh jaringan BRI.', 'the entire BRI network.'],
  heroLead: ['Pantau kantor cabang, unit, dan ATM di seluruh Indonesia, lalu pastikan datanya selalu sama dengan Google Maps — lengkap dengan jejak audit.', 'Monitor branches, units and ATMs across Indonesia, and keep their data in line with Google Maps — with a full audit trail.'],
  ctaLogin: ['Masuk ke Dashboard', 'Go to Dashboard'],
  ctaMap: ['Lihat peta jaringan', 'View network map'],
  clockLabel: ['Waktu Jakarta', 'Jakarta time'],
  heroPanel: ['Ringkasan jaringan', 'Network summary'],
  healthTitle: ['Kesehatan jaringan', 'Network health'],
  demoData: ['Data simulasi', 'Simulated data'],
  healthNote: ['lokasi online', 'of locations online'],
  statsLabel: ['Statistik utama', 'Key statistics'],
  mapTitle: ['Peta jaringan kantor', 'Office network map'],
  mapLead: ['Cari lokasi atau pilih status untuk menyaring titik di peta. Klik nama lokasi untuk memperbesar.', 'Search or pick a status to filter the map. Click a location name to zoom in.'],
  searchPh: ['Cari kota, provinsi, atau kode…', 'Search city, province, or code…'],
  searchLabel: ['Cari lokasi', 'Search locations'],
  clearSearch: ['Hapus pencarian', 'Clear search'],
  statusFilter: ['Filter status', 'Status filter'],
  layer: ['Layer', 'Layer'], layerStreet: ['Peta jalan', 'Street map'], layerTopo: ['Topografi', 'Topographic'],
  mapLabel: ['Peta lokasi kantor', 'Office location map'],
  resetFilters: ['Reset filter', 'Reset filters'],
  summaryTitle: ['Ringkasan jaringan', 'Network summary'],
  summaryLead: ['Gambaran singkat sebaran lokasi dan hasil sinkronisasi hari ini.', 'A quick look at location coverage and today\'s sync results.'],
  regionTitle: ['Sebaran per region', 'Locations by region'], regionHint: ['Klik untuk menyaring peta', 'Click to filter the map'],
  syncTitle: ['Sinkronisasi hari ini', 'Today\'s sync'],
  activityTitle: ['Aktivitas terbaru', 'Recent activity'], viewAll: ['Lihat semua', 'View all'],
  featureTitle: ['Semua yang dibutuhkan pengelola lokasi', 'Everything location managers need'],
  featureLead: ['Dari pendataan unit kerja sampai bukti audit, dalam satu tempat.', 'From managing locations to audit evidence, all in one place.'],
  step1: ['Kelola data unit kerja', 'Manage location data'], step1d: ['Impor atau perbarui data kantor, unit, dan ATM secara massal.', 'Import or update branches, units and ATMs in bulk.'],
  step2: ['Sinkronkan ke Google', 'Sync to Google'], step2d: ['Kirim data ke Google Business Profile dan pantau setiap job.', 'Push data to Google Business Profile and track every job.'],
  step3: ['Awasi & tindak lanjuti', 'Monitor & follow up'], step3d: ['Temukan data yang berbeda, duplikat, dan edit dari pihak lain.', 'Spot mismatches, duplicates and edits by third parties.'],
  f1: ['GIS interaktif', 'Interactive GIS'], f1d: ['Peta seluruh lokasi kantor beserta status dan selisih titik dengan Google Maps.', 'Every office on a map, with status and pin differences against Google Maps.'],
  f2: ['Monitoring sinkronisasi', 'Sync monitoring'], f2d: ['Pantau setiap job hingga tingkat lokasi, lengkap dengan penyebab kegagalan.', 'Track every job down to each location, including failure reasons.'],
  f3: ['SLA terukur', 'Measurable SLA'], f3d: ['Waktu proses internal dipisahkan dari waktu verifikasi Google.', 'Internal processing time is measured separately from Google verification.'],
  f4: ['Akses berjenjang & audit', 'Role-based access & audit'], f4d: ['Hak akses per peran dan jejak sebelum–sesudah untuk setiap perubahan.', 'Role-based permissions and a before/after trail for every change.'],
  bandTitle: ['Siap mengelola jaringan Anda?', 'Ready to manage your network?'],
  bandText: ['Masuk ke workspace admin untuk mulai bekerja. Mode demo — gunakan akun apa saja.', 'Sign in to the admin workspace to get started. Demo mode — any account works.'],
  footer: ['© 2026 PT Bank Rakyat Indonesia (Persero) Tbk. Seluruh hak dilindungi.', '© 2026 PT Bank Rakyat Indonesia (Persero) Tbk. All rights reserved.'],
  footerNote: ['Prototipe dengan data simulasi — tidak terhubung ke sistem produksi.', 'Prototype with simulated data — not connected to production systems.'],
  adminWorkspace: ['Admin Workspace', 'Admin Workspace'], close: ['Tutup', 'Close'],
  loginTitle: ['Selamat datang kembali', 'Welcome back'],
  loginIntro: ['Masuk untuk mengelola jaringan kantor Anda.', 'Sign in to manage your office network.'],
  loginHint: ['Mode Demo: isi nama pengguna dan kata sandi apa saja. Setelah masuk, Anda bisa beralih ke Live dari menu di header.', 'Demo mode: enter any username and password. After signing in, switch to Live from the header menu.'],
  loginUsername: ['Nama pengguna', 'Username'], loginPassword: ['Kata sandi', 'Password'], loginSubmit: ['Masuk', 'Sign in'],
  loginOr: ['atau', 'or'], loginGoogle: ['Masuk dengan Google', 'Sign in with Google'], loginOtp: ['Masuk dengan kode OTP email', 'Sign in with an email OTP code'],
  googleTitle: ['Masuk dengan Google (demo)', 'Sign in with Google (demo)'],
  googleNotice: ['Pada versi produksi, Anda akan diarahkan ke halaman login Google. Di demo ini tidak ada akun yang dihubungkan.', 'In production you would be redirected to Google sign-in. No account is connected in this demo.'],
  googleContinue: ['Lanjutkan sebagai akun demo', 'Continue with demo account'],
  otpEmail: ['Alamat email', 'Email address'], otpOpen: ['Kirim kode', 'Send code'],
  otpCode: ['Kode OTP (6 digit)', 'OTP code (6 digits)'], otpHint: ['Kode demo:', 'Demo code:'], otpVerify: ['Verifikasi & masuk', 'Verify & sign in'],
  backToPassword: ['Kembali ke kata sandi', 'Back to password'],
  required: ['', '']
};

/* ---------------------------------------------------------------- *
 * Data simulasi
 * ---------------------------------------------------------------- */
const locations = [
  ['Jakarta', 'DKI Jakarta', -6.2088, 106.8456, 'Online'],
  ['Bandung', 'Jawa Barat', -6.9175, 107.6191, 'Online'],
  ['Semarang', 'Jawa Tengah', -6.9667, 110.4167, 'Online'],
  ['Surabaya', 'Jawa Timur', -7.2575, 112.7521, 'Online'],
  ['Denpasar', 'Bali', -8.65, 115.2167, 'Online'],
  ['Medan', 'Sumatera Utara', 3.5952, 98.6722, 'Online'],
  ['Palembang', 'Sumatera Selatan', -2.9761, 104.7754, 'Offline'],
  ['Padang', 'Sumatera Barat', -0.9471, 100.4172, 'Online'],
  ['Balikpapan', 'Kalimantan Timur', -1.2379, 116.8529, 'Online'],
  ['Pontianak', 'Kalimantan Barat', -0.0263, 109.3425, 'Belum Sync'],
  ['Makassar', 'Sulawesi Selatan', -5.1477, 119.4327, 'Online'],
  ['Manado', 'Sulawesi Utara', 1.4748, 124.8421, 'Online'],
  ['Ambon', 'Maluku', -3.6954, 128.1814, 'Offline'],
  ['Jayapura', 'Papua', -2.5337, 140.7181, 'Tidak Aktif'],
  ['Mataram', 'Nusa Tenggara Barat', -8.5833, 116.1167, 'Online']
].map(([city, province, lat, lng, status], i) => ({ city, province, lat, lng, status, code: `DM-${String(i + 1).padStart(3, '0')}` }));

const STATUS = {
  Online: { color: '#1f8a5b', label: ['Online', 'Online'] },
  Offline: { color: '#e0660f', label: ['Offline', 'Offline'] },
  'Belum Sync': { color: '#1a6fc4', label: ['Belum sync', 'Not synced'] },
  'Tidak Aktif': { color: '#8a94a3', label: ['Tidak aktif', 'Inactive'] }
};
const statusText = s => text(...STATUS[s].label);
const regionOf = p => /Jakarta|Jawa/.test(p) ? 'Jawa' : /Sumatera/.test(p) ? 'Sumatera' : /Kalimantan/.test(p) ? 'Kalimantan' : /Sulawesi/.test(p) ? 'Sulawesi' : /Bali|Nusa/.test(p) ? 'Bali & Nusa Tenggara' : /Maluku/.test(p) ? 'Maluku' : 'Papua';
locations.forEach(l => { l.region = regionOf(l.province); });
const SYNC = { ok: 13, fail: 1, skip: 1 };
const ACTIVITY = [
  { code: 'DM-001', ok: true, time: '09.41' },
  { code: 'DM-007', ok: false, time: '09.38' },
  { code: 'DM-004', ok: true, time: '09.35' },
  { code: 'DM-011', ok: true, time: '09.31' }
];
const count = s => locations.filter(l => l.status === s).length;

/* ---------------------------------------------------------------- *
 * Render bagian statis
 * ---------------------------------------------------------------- */
const $ = id => document.getElementById(id);
const ICON = {
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>'
};
const svg = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

function renderHealth() {
  const total = locations.length, online = count('Online');
  $('healthPct').textContent = pctFmt(online / total);
  $('healthBar').innerHTML = Object.keys(STATUS).map(s => count(s) ? `<span style="flex:${count(s)};background:${STATUS[s].color}" title="${statusText(s)}: ${count(s)}"></span>` : '').join('');
  $('healthBar').setAttribute('aria-label', Object.keys(STATUS).map(s => `${statusText(s)} ${count(s)}`).join(', '));
  $('healthLegend').innerHTML = Object.keys(STATUS).map(s => `<li><i style="background:${STATUS[s].color}"></i><span>${statusText(s)}</span><strong>${fmt(count(s))}</strong></li>`).join('');
}
function renderStats() {
  const total = locations.length, attention = total - count('Online'), syncTotal = SYNC.ok + SYNC.fail + SYNC.skip;
  const regions = new Set(locations.map(l => l.region)).size;
  const cards = [
    { icon: 'pin', tone: 'blue', label: text('Total lokasi', 'Total locations'), value: fmt(total), note: text(`Tersebar di ${regions} region`, `Across ${regions} regions`) },
    { icon: 'check', tone: 'green', label: text('Lokasi online', 'Online locations'), value: fmt(count('Online')), note: text(`${pctFmt(count('Online') / total)} dari total`, `${pctFmt(count('Online') / total)} of total`) },
    { icon: 'alert', tone: 'orange', label: text('Perlu perhatian', 'Need attention'), value: fmt(attention), note: text('Offline, belum sync, atau tidak aktif', 'Offline, not synced, or inactive') },
    { icon: 'refresh', tone: 'blue', label: text('Keberhasilan sync', 'Sync success rate'), value: pctFmt(SYNC.ok / syncTotal), note: text(`${SYNC.ok} dari ${syncTotal} proses · terakhir 09.41 WIB`, `${SYNC.ok} of ${syncTotal} runs · last 09.41 WIB`) }
  ];
  $('statsGrid').innerHTML = cards.map(c => `<article class="stat-card" data-tone="${c.tone}"><span class="stat-icon">${svg(c.icon)}</span><div><p class="stat-label">${c.label}</p><p class="stat-value">${c.value}</p><p class="stat-note">${c.note}</p></div></article>`).join('');
}
function renderRegions() {
  const rows = [...new Set(locations.map(l => l.region))].map(r => [r, locations.filter(l => l.region === r)]).sort((a, b) => b[1].length - a[1].length);
  const max = Math.max(...rows.map(r => r[1].length));
  $('regionList').innerHTML = `<ul class="region-list">${rows.map(([r, xs]) => {
    const on = xs.filter(l => l.status === 'Online').length;
    return `<li><button type="button" class="region-row${mapState.region === r ? ' is-active' : ''}" data-region="${escapeHtml(r)}" aria-pressed="${mapState.region === r}">
      <span class="region-name">${escapeHtml(r)}</span><span class="region-count">${fmt(xs.length)}</span>
      <span class="region-bar" aria-hidden="true"><span style="width:${(xs.length / max) * 100}%"></span></span>
      <small>${text(`${on} online`, `${on} online`)}</small></button></li>`;
  }).join('')}</ul>`;
}
function renderSync() {
  const total = SYNC.ok + SYNC.fail + SYNC.skip;
  const parts = [['ok', SYNC.ok, '#1f8a5b', text('Berhasil', 'Successful')], ['fail', SYNC.fail, '#d23f3f', text('Gagal', 'Failed')], ['skip', SYNC.skip, '#8a94a3', text('Dilewati', 'Skipped')]];
  let offset = 0;
  const gap = 1.2;
  const rings = parts.map(([, v, c]) => {
    const len = (v / total) * 100;
    const seg = `<circle cx="60" cy="60" r="46" fill="none" stroke="${c}" stroke-width="12" pathLength="100" stroke-dasharray="${Math.max(0, len - gap)} ${100 - Math.max(0, len - gap)}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
    offset += len;
    return seg;
  }).join('');
  $('syncSummary').innerHTML = `<div class="donut"><svg viewBox="0 0 120 120" role="img" aria-label="${text(`${total} proses: ${SYNC.ok} berhasil, ${SYNC.fail} gagal, ${SYNC.skip} dilewati`, `${total} runs: ${SYNC.ok} successful, ${SYNC.fail} failed, ${SYNC.skip} skipped`)}"><circle cx="60" cy="60" r="46" fill="none" stroke="var(--track)" stroke-width="12"/>${rings}</svg><div class="donut-center"><strong>${fmt(total)}</strong><span>${text('proses', 'runs')}</span></div></div>
    <ul class="sync-legend">${parts.map(([, v, c, l]) => `<li><i style="background:${c}"></i><span>${l}</span><strong>${fmt(v)}</strong><small>${pctFmt(v / total)}</small></li>`).join('')}</ul>`;
}
function renderActivity() {
  const byCode = c => locations.find(l => l.code === c);
  $('activityList').innerHTML = ACTIVITY.map(a => {
    const l = byCode(a.code);
    return `<li><span class="act-icon ${a.ok ? 'ok' : 'fail'}">${svg(a.ok ? 'check' : 'x')}</span><div><strong>KC ${escapeHtml(l.city)}</strong><small>${a.code} · ${a.ok ? text('Sinkronisasi berhasil', 'Sync successful') : text('Koneksi gagal — dijadwalkan ulang', 'Connection failed — rescheduled')}</small></div><time>${a.time}</time></li>`;
  }).join('');
}

/* ---------------------------------------------------------------- *
 * Peta
 * ---------------------------------------------------------------- */
const mapState = { q: '', statuses: new Set(Object.keys(STATUS)), region: '' };
let map = null, markerLayer = null, markers = new Map(), userMovedMap = false;
const search = $('mapSearch');
function filtered() {
  const q = mapState.q.trim().toLocaleLowerCase('id');
  return locations.filter(l => mapState.statuses.has(l.status) && (!mapState.region || l.region === mapState.region) &&
    (!q || `${l.city} ${l.province} ${l.code} ${l.region} ${statusText(l.status)}`.toLocaleLowerCase('id').includes(q)));
}
const isFiltered = () => mapState.q || mapState.region || mapState.statuses.size < Object.keys(STATUS).length;
function renderChips() {
  $('statusChips').innerHTML = Object.keys(STATUS).map(s => `<button type="button" class="chip" data-status="${s}" aria-pressed="${mapState.statuses.has(s)}"><i style="background:${STATUS[s].color}"></i>${statusText(s)}<span>${fmt(count(s))}</span></button>`).join('');
}
function popupHtml(l) {
  return `<div class="map-popup"><strong>KC ${escapeHtml(l.city)}</strong><span>${l.code} · ${escapeHtml(l.province)}</span><span class="popup-status"><i style="background:${STATUS[l.status].color}"></i>${statusText(l.status)}</span></div>`;
}
function renderMap(fit = true) {
  const xs = filtered();
  $('resultCount').textContent = xs.length ? text(`${fmt(xs.length)} lokasi ditampilkan`, `${fmt(xs.length)} locations shown`) : text('Tidak ada lokasi yang cocok', 'No matching locations');
  $('resetFilters').hidden = !isFiltered();
  $('searchClear').hidden = !mapState.q;
  $('locationList').innerHTML = xs.length ? xs.map(l => `<li><button type="button" data-code="${l.code}"><i style="background:${STATUS[l.status].color}" aria-hidden="true"></i><span><strong>KC ${escapeHtml(l.city)}</strong><small>${l.code} · ${escapeHtml(l.province)}</small></span><em>${statusText(l.status)}</em></button></li>`).join('')
    : `<li class="list-empty">${text('Coba kata kunci lain atau reset filter.', 'Try another keyword or reset filters.')}</li>`;
  if (!map) return;
  markerLayer.clearLayers(); markers = new Map();
  xs.forEach(l => {
    const m = L.circleMarker([l.lat, l.lng], { radius: 8, color: '#fff', weight: 2, fillColor: STATUS[l.status].color, fillOpacity: 1 }).bindPopup(popupHtml(l));
    m.addTo(markerLayer); markers.set(l.code, m);
  });
  if (fit) {
    if (isFiltered() && xs.length) { userMovedMap = true; map.fitBounds(L.latLngBounds(xs.map(l => [l.lat, l.lng])), { padding: [40, 40], maxZoom: 9, animate: true }); }
    else if (!isFiltered()) { userMovedMap = false; fitIndonesia(); }
  }
}
function fitIndonesia() { if (map && !userMovedMap) map.fitBounds([[-11, 95], [6, 141]], { padding: [10, 10], animate: false }); }
if (typeof L !== 'undefined') {
  map = L.map('map', { scrollWheelZoom: false, zoomControl: true });
  const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 });
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors, SRTM | OpenTopoMap (CC-BY-SA)', maxZoom: 17 });
  streets.addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  map.on('dragstart zoomstart', e => { if (e.originalEvent) userMovedMap = true; });
  map.once('focus', () => map.scrollWheelZoom.enable());
  $('layerSelect').addEventListener('change', e => { map.removeLayer(streets); map.removeLayer(topo); (e.target.value === 'topo' ? topo : streets).addTo(map); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { map.invalidateSize({ pan: false }); fitIndonesia(); }).observe($('map'));
  fitIndonesia();
} else {
  $('map').innerHTML = '<p class="map-fallback"></p>';
  $('layerSelect').disabled = true;
}
let searchTimer = 0;
search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { mapState.q = search.value; renderMap(); }, 150); });
$('searchClear').addEventListener('click', () => { search.value = ''; mapState.q = ''; renderMap(); search.focus(); });
$('statusChips').addEventListener('click', e => {
  const b = e.target.closest('[data-status]'); if (!b) return;
  const s = b.dataset.status;
  if (mapState.statuses.has(s) && mapState.statuses.size === 1) mapState.statuses = new Set(Object.keys(STATUS)); // jangan sampai kosong
  else if (mapState.statuses.size === Object.keys(STATUS).length) mapState.statuses = new Set([s]); // klik pertama = fokus pada satu status
  else mapState.statuses.has(s) ? mapState.statuses.delete(s) : mapState.statuses.add(s);
  renderChips(); renderMap();
  $('statusChips').querySelector(`[data-status="${s}"]`).focus();
});
$('resetFilters').addEventListener('click', () => { mapState.q = ''; search.value = ''; mapState.region = ''; mapState.statuses = new Set(Object.keys(STATUS)); renderChips(); renderRegions(); renderMap(); search.focus(); });
$('locationList').addEventListener('click', e => {
  const b = e.target.closest('[data-code]'); if (!b || !map) return;
  const l = locations.find(x => x.code === b.dataset.code);
  userMovedMap = true;
  map.flyTo([l.lat, l.lng], 11, { duration: 0.7 });
  setTimeout(() => markers.get(l.code)?.openPopup(), 720);
  if (window.matchMedia('(max-width: 860px)').matches) $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('regionList').addEventListener('click', e => {
  const b = e.target.closest('[data-region]'); if (!b) return;
  mapState.region = mapState.region === b.dataset.region ? '' : b.dataset.region;
  renderRegions(); renderMap();
  if (mapState.region) $('peta').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------------------------------------------------------------- *
 * Jam & tema
 * ---------------------------------------------------------------- */
function updateClock() {
  $('serverTime').textContent = new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()) + ' WIB';
}
setInterval(updateClock, 15000);
const toggle = $('themeToggle');
let darkPref = null;
try { darkPref = localStorage.getItem('branchSyncTheme'); } catch (_) {}
if (darkPref ? darkPref === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches) document.body.classList.add('dark');
function updateThemeButton() {
  const dark = document.body.classList.contains('dark');
  const label = dark ? text('Ganti ke mode terang', 'Switch to light mode') : text('Ganti ke mode gelap', 'Switch to dark mode');
  toggle.title = label; toggle.setAttribute('aria-label', label); toggle.setAttribute('aria-pressed', String(dark));
}
toggle.addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  try { localStorage.setItem('branchSyncTheme', dark ? 'dark' : 'light'); } catch (_) {}
  updateThemeButton();
});

/* Navigasi aktif saat menggulir */
const navLinks = [...document.querySelectorAll('.site-nav a')];
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) navLinks.forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === `#${en.target.id}`));
  }), { rootMargin: '-45% 0px -50% 0px' });
  ['peta', 'ringkasan', 'fitur'].forEach(id => io.observe($(id)));
}
const header = document.querySelector('.site-header');
window.addEventListener('scroll', () => header.classList.toggle('is-scrolled', window.scrollY > 8), { passive: true });

/* ---------------------------------------------------------------- *
 * Login — masuk ke workspace. Mode Demo/Live dipilih setelah masuk
 * lewat menu di header admin. Kata sandi tidak pernah disimpan.
 * ---------------------------------------------------------------- */
const dialog = $('loginDialog');
const loginForm = $('loginForm'), username = $('loginUsername'), password = $('loginPassword'), passwordToggle = $('passwordToggle');
const otpEmailForm = $('otpEmailForm'), otpCodeForm = $('otpCodeForm'), otpEmail = $('otpEmail'), otpCode = $('otpCode');
const googlePanel = $('googlePanel'), alternatives = $('loginAlternatives'), backToPassword = $('backToPassword'), loginError = $('loginError');
let loginTrigger = null;

const errorEl = input => $((input.getAttribute('aria-describedby') || '').split(' ').find(id => /(Error|Status)$/.test(id)) || '');
function setError(input, msg) {
  const el = errorEl(input);
  if (msg) { input.setAttribute('aria-invalid', 'true'); if (el) el.textContent = msg; }
  else { input.removeAttribute('aria-invalid'); if (el) el.textContent = ''; }
}
const showLoginError = msg => { loginError.textContent = msg || ''; };
function clearErrors() { [username, password, otpEmail, otpCode].forEach(i => setError(i, '')); showLoginError(''); }
function setLoginPanel(panel, moveFocus = true) {
  [loginForm, otpEmailForm, otpCodeForm].forEach(f => f.reset());
  password.type = 'password';
  clearErrors();
  loginForm.hidden = panel !== 'password';
  alternatives.hidden = panel !== 'password';
  googlePanel.hidden = panel !== 'google';
  otpEmailForm.hidden = panel !== 'email';
  otpCodeForm.hidden = panel !== 'code';
  backToPassword.hidden = panel === 'password';
  updateLoginCopy();
  if (moveFocus) ({ password: username, google: $('googleTitle'), email: otpEmail, code: otpCode })[panel].focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
function updateLoginCopy() {
  const visible = password.type === 'text';
  passwordToggle.textContent = visible ? text('Sembunyikan', 'Hide') : text('Tampilkan', 'Show');
  passwordToggle.setAttribute('aria-label', visible ? text('Sembunyikan kata sandi', 'Hide password') : text('Tampilkan kata sandi', 'Show password'));
  passwordToggle.setAttribute('aria-pressed', String(visible));
}
function openLogin(trigger, message) {
  loginTrigger = trigger || document.querySelector('.header-actions [data-login]');
  setLoginPanel('password', false);
  if (!dialog.open) dialog.showModal();
  if (message) showLoginError(message);
  username.focus();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-login]');
  if (!t) return;
  e.preventDefault();
  openLogin(t);
});
dialog.querySelector('.login-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => {
  setLoginPanel('password', false);
  if (loginTrigger && loginTrigger.isConnected && !document.body.classList.contains('admin-active')) loginTrigger.focus();
});
passwordToggle.addEventListener('click', () => { password.type = password.type === 'password' ? 'text' : 'password'; updateLoginCopy(); password.focus(); });
$('googlePreview').addEventListener('click', () => setLoginPanel('google'));
$('otpPreview').addEventListener('click', () => setLoginPanel('email'));
backToPassword.addEventListener('click', () => setLoginPanel('password'));
$('googleContinue').addEventListener('click', () => enterAdmin());
loginForm.addEventListener('submit', e => {
  e.preventDefault();
  clearErrors();
  let first = null;
  if (!username.value.trim()) { setError(username, text('Isi nama pengguna.', 'Enter a username.')); first = username; }
  if (!password.value) { setError(password, text('Isi kata sandi.', 'Enter a password.')); first ||= password; }
  if (first) { first.focus(); return; }
  loginForm.reset();
  enterAdmin();
});
otpEmailForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!otpEmail.value.trim() || !otpEmail.checkValidity()) { setError(otpEmail, text('Masukkan alamat email yang valid.', 'Enter a valid email address.')); otpEmail.focus(); return; }
  setLoginPanel('code');
});
otpCode.addEventListener('input', () => { otpCode.value = otpCode.value.replace(/\D/g, '').slice(0, 6); setError(otpCode, ''); });
otpCodeForm.addEventListener('submit', e => {
  e.preventDefault();
  if (otpCode.value !== '123456') { setError(otpCode, text('Kode tidak sesuai. Gunakan kode demo 123456.', 'Incorrect code. Use demo code 123456.')); otpCode.focus(); return; }
  otpCode.value = '';
  enterAdmin();
});
window.BranchLogin = { open: message => openLogin(null, message) };

/* ---------------------------------------------------------------- *
 * Terapkan bahasa
 * ---------------------------------------------------------------- */
function applyLanguage() {
  document.documentElement.lang = language;
  const pick = k => I18N[k]?.[language === 'en' ? 1 : 0];
  document.querySelectorAll('[data-i18n]').forEach(n => { const v = pick(n.dataset.i18n); if (v != null && v !== '') n.textContent = v; });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(n => { n.placeholder = pick(n.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-aria]').forEach(n => { n.setAttribute('aria-label', pick(n.dataset.i18nAria)); });
  document.querySelectorAll('[data-language]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.language === language)));
  if (!map) document.querySelector('.map-fallback') && (document.querySelector('.map-fallback').textContent = text('Peta gagal dimuat. Periksa koneksi internet Anda.', 'Map failed to load. Check your internet connection.'));
  renderHealth(); renderStats(); renderRegions(); renderSync(); renderActivity(); renderChips(); renderMap(false);
  updateClock(); updateThemeButton(); updateLoginCopy();
}
document.querySelectorAll('[data-language]').forEach(b => b.addEventListener('click', () => {
  language = b.dataset.language === 'en' ? 'en' : 'id';
  try { localStorage.setItem('branchSyncLanguage', language); } catch (_) {}
  applyLanguage();
}));
applyLanguage();
renderMap(false);

// Admin diisolasi di admin.js; semua alur login masuk lewat sini.
function enterAdmin() { window.BranchAdmin.enter(); }

// Kembali dari OAuth Google lewat server (mode Live):
//   #bs_token=…  → login Google berhasil   ·   #bs_error=… → login gagal
//   #bs_gbp=connected | #bs_gbp=<pesan>    → hasil menghubungkan akun Google Business Profile
(function handleOAuthReturn() {
  const h = new URLSearchParams(location.hash.slice(1));
  const token = h.get('bs_token'), err = h.get('bs_error'), gbp = h.get('bs_gbp');
  if (!token && !err && !gbp) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (gbp) {
    if (!window.BranchMode.hasSession()) { openLogin(null, text('Sesi berakhir. Silakan masuk lagi.', 'Session expired. Please sign in again.')); return; }
    window.BranchMode.setMode('live');
    window.BranchAdmin.enter({ view: 'integrations', notice: gbp === 'connected' ? text('Akun Google berhasil dihubungkan.', 'Google account connected.') : text('Gagal menghubungkan akun Google: ', 'Failed to connect Google account: ') + gbp });
    return;
  }
  if (err) { openLogin(null, text('Login Google gagal: ', 'Google sign-in failed: ') + err); return; }
  window.BranchMode.setSession(token, null);
  window.BranchMode.setMode('live');
  window.BranchMode.request('GET', '/me')
    .then(user => { window.BranchMode.setSession(token, user); enterAdmin(); })
    .catch(e => { window.BranchMode.clearSession(); window.BranchMode.setMode('demo'); openLogin(null, e.message); });
})();
