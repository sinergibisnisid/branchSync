'use strict';
/*
 * BranchSync — Admin Workspace (demo lokal, tanpa backend).
 * Fitur dipetakan ke "Skenario Test Piloting Dashboard BranchSync":
 *  1 Impor massal unit kerja        → Unit Kerja › Impor
 *  2 Cari & filter                   → Unit Kerja (pencarian, filter, tampilan cepat, urut)
 *  3 Ketidaksesuaian vs Google Maps  → Ketidaksesuaian
 *  4 Performa data besar             → Pengaturan › Buat 1.000 unit uji (waktu render tercatat)
 *  5 Perubahan data                  → Edit unit + sinkronisasi
 *  6–8 Klaim, titik baru, duplikat   → Klaim & Titik Baru, Duplikat
 *  9 Edit dari email GBP lain        → Persetujuan Edit
 * 10 Histori sebelum/sesudah         → Riwayat Perubahan
 * 11/13 SLA                          → SLA & Kinerja
 * 12 Data gagal diperbarui          → Sync Monitor › Kegagalan
 */
(() => {
  const shell = document.getElementById('adminPanel');
  if (!shell) return;

  /* ------------------------------------------------------------------ *
   * Utilitas
   * ------------------------------------------------------------------ */
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Bahasa dibagi dengan halaman utama (variabel global `language` di script.js).
  const isEn = () => typeof language !== 'undefined' && language === 'en';
  const LOC = () => (isEn() ? 'en-GB' : 'id-ID');
  const fmtNum = n => new Intl.NumberFormat(LOC()).format(n);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
  function distM(a, b) {
    const R = 6371e3, k = Math.PI / 180;
    const dLat = (b.lat - a.lat) * k, dLng = (b.lng - a.lng) * k;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function offset(lat, lng, meters, angle) {
    return { lat: lat + (meters * Math.cos(angle)) / 111320, lng: lng + (meters * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180)) };
  }
  const fmtDist = m => (m < 1000 ? `${Math.round(m)} m` : `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(m / 1000)} km`);
  function fmtDur(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    const m = Math.max(0, Math.round(ms / MIN));
    const en = isEn();
    if (m < 60) return en ? `${m} min` : `${m} mnt`;
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 48) return mm ? (en ? `${h}h ${mm}m` : `${h} j ${mm} m`) : (en ? `${h} h` : `${h} jam`);
    const d = Math.floor(h / 24), hh = h % 24;
    return hh ? (en ? `${d}d ${hh}h` : `${d} hr ${hh} j`) : (en ? `${d} day${d === 1 ? '' : 's'}` : `${d} hari`);
  }
  const fmtDate = (t, opts = { dateStyle: 'medium', timeStyle: 'short' }) => new Intl.DateTimeFormat(LOC(), { timeZone: state.settings.timezone, ...opts }).format(new Date(t));
  function fmtRel(t) {
    const d = Date.now() - t;
    const en = isEn();
    if (d < MIN) return en ? 'just now' : 'baru saja';
    if (d < HOUR) return en ? `${Math.floor(d / MIN)} min ago` : `${Math.floor(d / MIN)} mnt lalu`;
    if (d < DAY) return en ? `${Math.floor(d / HOUR)} h ago` : `${Math.floor(d / HOUR)} jam lalu`;
    if (d < 7 * DAY) { const n = Math.floor(d / DAY); return en ? `${n} day${n === 1 ? '' : 's'} ago` : `${n} hari lalu`; }
    return fmtDate(t, { dateStyle: 'medium' });
  }
  const normName = s => String(s || '').toLowerCase()
    .replace(/\b(bank|bri|rakyat|indonesia|kantor|cabang|pembantu|unit|kc|kcp|atm)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const initials = s => String(s).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadCSV(name, rows) {
    const cell = v => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // cegah formula injection
      return '"' + s.replace(/"/g, '""') + '"';
    };
    download(name, '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = first.split(';').length > first.split(',').length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }

  /* ------------------------------------------------------------------ *
   * Ikon (inline SVG)
   * ------------------------------------------------------------------ */
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    gauge: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    plug: '<path d="M12 22v-5M9 8V2M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8z"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    merge: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="12" r="3"/><path d="M6 9v6M9 6c5 0 6 6 6 6"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx=".5"/><rect x="12" y="7" width="3" height="10" rx=".5"/><rect x="17" y="13" width="3" height="4" rx=".5"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>'
  };
  const ic = (n, cls = '') => `<svg class="bs-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n] || ''}</svg>`;

  /* ------------------------------------------------------------------ *
   * Konstanta domain
   * ------------------------------------------------------------------ */
  const STATUSES = ['Online', 'Offline', 'Belum Sync', 'Tidak Aktif'];
  const TYPES = ['Kantor Cabang', 'KCP', 'Unit', 'ATM'];
  const GBP = ['Terverifikasi', 'Menunggu Verifikasi', 'Belum Diklaim', 'Suspend', 'Duplikat'];
  const REGIONS = ['Jawa', 'Sumatera', 'Kalimantan', 'Sulawesi', 'Bali & Nusa Tenggara', 'Maluku', 'Papua'];
  const regionOf = p => /Jakarta|Jawa|Banten|Yogyakarta/.test(p) ? 'Jawa' : /Sumatera|Aceh|Riau|Jambi|Bengkulu|Lampung|Bangka/.test(p) ? 'Sumatera' : /Kalimantan/.test(p) ? 'Kalimantan' : /Sulawesi|Gorontalo/.test(p) ? 'Sulawesi' : /Bali|Nusa/.test(p) ? 'Bali & Nusa Tenggara' : /Maluku/.test(p) ? 'Maluku' : 'Papua';
  const TONE = {
    Online: 'good', Offline: 'warn', 'Belum Sync': 'info', 'Tidak Aktif': 'neutral',
    Terverifikasi: 'good', 'Menunggu Verifikasi': 'info', 'Belum Diklaim': 'neutral', Suspend: 'bad', Duplikat: 'warn',
    Berhasil: 'good', Gagal: 'bad', Dilewati: 'neutral', Aktif: 'good', Nonaktif: 'neutral',
    Menunggu: 'warn', Disetujui: 'good', Ditolak: 'bad', Selesai: 'good',
    Diajukan: 'info', 'Diproses internal': 'info', 'Menunggu verifikasi Google': 'warn',
    'Dalam SLA': 'good', 'Lewat SLA': 'bad', 'Mendekati batas': 'warn', Internal: 'neutral', Eksternal: 'warn', Ditangani: 'good'
  };
  const badge = (s, label = s) => `<span class="bs-badge" data-tone="${TONE[s] || 'neutral'}"><i aria-hidden="true"></i>${esc(label)}</span>`;
  const FIELD_LABEL = { name: 'Nama listing', phone: 'Telepon', hours: 'Jam operasional', address: 'Alamat', coords: 'Titik koordinat', type: 'Tipe', status: 'Status', gbp: 'Status GBP', city: 'Kota', province: 'Provinsi', lat: 'Latitude', lng: 'Longitude' };
  const MARKER = { Online: '#1f8a5b', Offline: '#e0660f', 'Belum Sync': '#1a6fc4', 'Tidak Aktif': '#8a97a8' };
  const STEPS = ['Diajukan', 'Diproses internal', 'Menunggu verifikasi Google', 'Selesai'];
  const CLAIM_KINDS = ['Klaim kepemilikan', 'Banding suspend', 'Laporan duplikat'];
  const PERMS = [
    ['locations.read', 'Lihat unit kerja'], ['locations.write', 'Ubah unit kerja'], ['locations.import', 'Impor data massal'],
    ['sync.run', 'Jalankan sinkronisasi'], ['claims.manage', 'Kelola klaim & titik baru'], ['approvals.decide', 'Putuskan edit eksternal'],
    ['reviews.reply', 'Balas ulasan'], ['audit.read', 'Lihat riwayat'], ['users.manage', 'Kelola pengguna'], ['settings.write', 'Ubah pengaturan']
  ];
  // Aksi → izin yang dibutuhkan. Dipakai btn() (menonaktifkan + tooltip) dan act() (penegakan).
  const ACTION_PERM = {
    'add-loc': 'locations.write', 'edit-loc': 'locations.write', 'delete-loc': 'locations.write', 'bulk-delete': 'locations.write',
    'disc-push': 'locations.write', 'disc-pull': 'locations.write', 'disc-push-all': 'locations.write', 'disc-note': 'locations.write',
    'dup-keep': 'locations.write', 'dup-ignore': 'locations.write',
    'import': 'locations.import', 'import-commit': 'locations.import', 'import-sample': 'locations.import', 'import-parse': 'locations.import',
    'sync-all': 'sync.run', 'sync-one': 'sync.run', 'bulk-sync': 'sync.run', 'retry': 'sync.run', 'retry-all': 'sync.run', 'resolve': 'sync.run',
    'claim-new': 'claims.manage', 'point-new': 'claims.manage', 'claim-next': 'claims.manage', 'claim-reject': 'claims.manage', 'dup-report': 'claims.manage',
    'cr-approve': 'approvals.decide', 'cr-reject': 'approvals.decide',
    'review-reply': 'reviews.reply', 'review-edit': 'reviews.reply', 'review-delete': 'reviews.reply', 'review-send': 'reviews.reply',
    'add-user': 'users.manage', 'edit-user': 'users.manage', 'toggle-user': 'users.manage', 'add-role': 'users.manage', 'edit-role': 'users.manage',
    'api-toggle': 'settings.write', 'api-test': 'settings.write', 'api-reset': 'settings.write', 'gbp-oauth': 'settings.write',
    'generate': 'settings.write', 'reset-data': 'settings.write', 'report-schedule': 'settings.write', 'report-unschedule': 'settings.write',
    'export-audit': 'audit.read'
  };
  const DEMO_USER = { name: 'Admin Demo', email: 'admin@example.test', role: 'Administrator' };
  let ME = DEMO_USER;
  const demoUser = () => ({ ...DEMO_USER, role: (typeof prefs !== 'undefined' && prefs.demoRole) || 'Administrator' });
  const MODE = window.BranchMode;
  const isLive = () => !!(MODE && MODE.isLive());
  function userFromSession() {
    const u = (MODE && MODE.getUser()) || {};
    return { name: u.name || u.username || u.email || 'Pengguna', email: u.email || '', role: u.role || 'Pengguna', permissions: Array.isArray(u.permissions) ? u.permissions : null };
  }
  const STORE_KEY = 'branchSync.admin.v2', PREF_KEY = 'branchSync.admin.prefs';
  const STREETS = ['Sudirman', 'Ahmad Yani', 'Diponegoro', 'Gatot Subroto', 'Merdeka', 'Veteran', 'Pahlawan', 'Pemuda', 'Imam Bonjol', 'Gajah Mada'];
  const HOURS = ['Sen–Jum 08.00–15.00', 'Sen–Jum 08.00–16.00', 'Sen–Sab 08.00–14.00', 'Setiap hari 24 jam'];
  const EXT_EMAILS = ['pengguna.lain@gmail.com', 'local.guide.88@gmail.com', 'agency.seo@outlook.com', 'tidak.dikenal@yahoo.com'];
  // Akun Google Business Profile (satu akun dapat mengelola banyak lokasi)
  const ACCOUNT_LIST = [
    { id: 'gbp-jawa', name: 'BRI Regional Jawa & Bali', email: 'gbp.jawa@example.test', accountId: 'accounts/1043920001' },
    { id: 'gbp-sumatera', name: 'BRI Regional Sumatera', email: 'gbp.sumatera@example.test', accountId: 'accounts/1043920002' },
    { id: 'gbp-timur', name: 'BRI Regional Kalimantan & Timur', email: 'gbp.timur@example.test', accountId: 'accounts/1043920003' }
  ];
  const accountOf = region => (region === 'Jawa' || region === 'Bali & Nusa Tenggara' ? 'gbp-jawa' : region === 'Sumatera' ? 'gbp-sumatera' : 'gbp-timur');
  const acctOf = l => (l && (l.accountId || accountOf(l.region))) || '';
  const REVIEW_TEXTS = {
    5: ['Pelayanan cepat dan ramah, antrean tertib.', 'Teller sangat membantu menjelaskan produk tabungan.', 'Tempat bersih, nyaman, dan parkir luas.', 'Satpam sigap membantu nasabah lansia. Terima kasih!'],
    4: ['Pelayanan baik, hanya antrean agak panjang di jam makan siang.', 'Staf ramah, tapi AC kurang dingin.', 'Proses buka rekening cepat, sekitar 20 menit.'],
    3: ['Cukup baik, tapi jam buka di Google tidak sesuai.', 'Pelayanan standar, kursi tunggu kurang.', 'ATM sering antre panjang di sore hari.'],
    2: ['Antrean lama, hanya dua teller yang buka.', 'ATM sering offline di akhir pekan.', 'Nomor telepon di Maps tidak bisa dihubungi.'],
    1: ['Menunggu lebih dari satu jam tanpa kejelasan.', 'ATM menelan kartu dan belum ada tindak lanjut.', 'Lokasi di peta salah, saya sampai tersasar.']
  };
  const AUTHORS = ['Budi Santoso', 'Siti Rahmawati', 'Andi Pratama', 'Dewi Lestari', 'Rudi Hartono', 'Maya Sari', 'Agus Setiawan', 'Fitri Handayani', 'Joko Susilo', 'Nur Aini', 'Hendra Wijaya', 'Ratna Dewi', 'Yusuf Maulana', 'Indah Permata', 'Bayu Saputra'];
  const REPLY_TEMPLATES = [
    { label: 'Terima kasih (ulasan positif)', text: 'Halo {nama}, terima kasih atas ulasan dan kepercayaan Anda kepada {unit}. Kami senang dapat melayani Anda dan menantikan kunjungan berikutnya. Salam hangat, BRI.' },
    { label: 'Permohonan maaf (ulasan negatif)', text: 'Halo {nama}, mohon maaf atas ketidaknyamanan yang Anda alami di {unit}. Masukan Anda sudah kami teruskan ke tim terkait untuk perbaikan. Silakan hubungi kanal resmi BRI agar kami dapat membantu lebih lanjut.' },
    { label: 'Antrean / waktu tunggu', text: 'Halo {nama}, terima kasih atas masukannya. Kami sedang menambah petugas di jam sibuk agar waktu tunggu di {unit} lebih singkat. Mohon maaf atas ketidaknyamanannya.' },
    { label: 'Informasi lokasi / jam salah', text: 'Halo {nama}, terima kasih telah memberi tahu kami. Informasi lokasi dan jam operasional {unit} sudah kami periksa dan perbarui di Google Maps.' },
    { label: 'Masalah ATM', text: 'Halo {nama}, mohon maaf atas kendala ATM di {unit}. Tim kami sudah melakukan pengecekan. Untuk kartu tertelan atau transaksi gagal, silakan hubungi kanal pengaduan resmi BRI dengan menyiapkan data transaksi Anda.' }
  ];
  const REPLY_MAX = 4096; // batas panjang balasan Google Business Profile
  const fillTemplate = (t, author, unit) => t.replace(/\{nama\}/g, String(author || '').split(' ')[0] || 'Bapak/Ibu').replace(/\{unit\}/g, unit || 'unit kami');
  const GOOGLE_SCOPES = [
    ['business.manage', 'Kelola profil bisnis, lokasi & ulasan', 'wajib'],
    ['pubsub', 'Notifikasi real-time (Pub/Sub) untuk ulasan & edit baru', 'opsional'],
    ['userinfo.email', 'Identitas akun Google yang menghubungkan', 'opsional']
  ];
  const SYNC_INTERVALS = [['0', 'Manual saja'], ['15', 'Setiap 15 menit'], ['60', 'Setiap jam'], ['360', 'Setiap 6 jam'], ['1440', 'Setiap hari']];
  function buildReviews(locs) {
    const r = rng(777), t0 = Date.now(), out = [];
    let n = 0;
    locs.slice(0, 200).forEach(l => {
      const k = l.status === 'Tidak Aktif' ? Math.floor(r() * 2) : Math.floor(r() * 6);
      for (let i = 0; i < k; i++) {
        const x = r(), rating = x < 0.4 ? 5 : x < 0.68 ? 4 : x < 0.82 ? 3 : x < 0.92 ? 2 : 1;
        const time = t0 - Math.floor(r() * 60 * DAY);
        const author = pick(r, AUTHORS), replied = r() < (rating >= 4 ? 0.55 : 0.35);
        out.push({ id: `RV-${String(++n).padStart(4, '0')}`, code: l.code, author, rating, text: r() < 0.1 ? '' : pick(r, REVIEW_TEXTS[rating]), time,
          reply: replied ? { text: fillTemplate(REPLY_TEMPLATES[rating >= 4 ? 0 : 1].text, author, l.name), by: pick(r, ['Admin Demo', 'Operator Jawa', 'Operator Sumatera']), time: Math.min(t0, time + Math.floor((2 + r() * 46) * HOUR)) } : null });
      }
    });
    return out;
  }
  function ensureExtras(s0) {
    if (!Array.isArray(s0.accounts)) s0.accounts = ACCOUNT_LIST.map(a => ({ ...a }));
    if (!Array.isArray(s0.reviews)) s0.reviews = buildReviews(s0.locations || []);
    s0.api = { clientId: '', hasClientSecret: false, hasApiKey: false, scopes: ['business.manage'], syncInterval: '60', pubsubTopic: '', ...(s0.api || {}) };
    s0.seq = { review: s0.reviews.length, schedule: 1, ...(s0.seq || {}) };
    if (!s0.permsV2 && Array.isArray(s0.roles)) { s0.roles.forEach(r => { if (['Administrator', 'Operator'].includes(r.name) && !r.permissions.includes('reviews.reply')) r.permissions.push('reviews.reply'); }); s0.permsV2 = true; }
    if (!Array.isArray(s0.reportSchedules)) s0.reportSchedules = [{ id: 'RS-001', name: 'Laporan mingguan jaringan', frequency: 'weekly', day: '1', recipients: ['kepala.divisi@example.test'], format: 'PDF', period: '7', createdAt: Date.now() - 20 * DAY }];
    if (!s0.histBackfilled && Array.isArray(s0.runs)) {
      // Lengkapi riwayat sinkronisasi harian hingga 90 hari agar analitik tren terisi.
      const r = rng(4242), oldest = s0.runs.reduce((m, x) => Math.min(m, x.time), Date.now());
      const inactive = (s0.locations || []).filter(l => l.status === 'Tidak Aktif').length, total = (s0.locations || []).length;
      for (let d = Math.ceil((Date.now() - oldest) / DAY) + 1; d <= 90; d++) {
        const fail = Math.floor(r() * 5);
        s0.runs.push({ id: `JOB-H${String(d).padStart(3, '0')}`, time: Date.now() - d * DAY - 9 * HOUR, scope: 'Semua unit', by: 'Penjadwal otomatis', total, ok: Math.max(0, total - fail - inactive), fail, skip: inactive, durationMs: 38000 + Math.floor(r() * 50000), items: [] });
      }
      s0.runs.sort((a, b) => b.time - a.time);
      s0.histBackfilled = true;
    }
    return s0;
  }

  const NAV = [
    { group: 'Monitoring', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'grid', desc: 'Ringkasan kondisi jaringan dan pekerjaan yang perlu ditindaklanjuti.' },
      { id: 'map', label: 'Peta Unit Kerja', icon: 'map', desc: 'Sebaran unit kerja beserta selisih titik dengan Google Maps.' },
      { id: 'reports', label: 'Laporan & Analitik', icon: 'chart', desc: 'Analitik kinerja jaringan, sinkronisasi, ulasan, dan SLA per periode — siap dicetak atau diekspor.' },
      { id: 'sla', label: 'SLA & Kinerja', icon: 'gauge', desc: 'Waktu proses internal dipisahkan dari waktu verifikasi Google.' }
    ] },
    { group: 'Data Unit Kerja', items: [
      { id: 'locations', label: 'Unit Kerja', icon: 'building', desc: 'Cari, filter, impor, dan perbarui seluruh data unit kerja.' },
      { id: 'discrepancies', label: 'Ketidaksesuaian', icon: 'alert', count: () => issueMap().size, desc: 'Data Dashboard yang berbeda dengan listing Google Maps.' },
      { id: 'duplicates', label: 'Duplikat', icon: 'copy', count: () => duplicatePairs().length, desc: 'Titik lokasi ganda yang terdeteksi otomatis dari jarak dan kemiripan nama.' },
      { id: 'claims', label: 'Klaim & Titik Baru', icon: 'shield', count: () => state.claims.filter(claimActive).length, desc: 'Klaim kepemilikan, banding suspend, laporan duplikat, dan pengajuan titik baru.' }
    ] },
    { group: 'Operasional', items: [
      { id: 'approvals', label: 'Persetujuan Edit', icon: 'inbox', count: () => state.approvals.filter(a => a.status === 'Menunggu').length, desc: 'Perubahan dari email GBP lain. Data tidak berubah sebelum BRI menyetujui.' },
      { id: 'reviews', label: 'Ulasan', icon: 'star', count: () => state.reviews.filter(rv => !rv.reply).length, desc: 'Ulasan nasabah dari setiap akun dan lokasi Google Maps. Balas langsung dari sini.' },
      { id: 'sync', label: 'Sync Monitor', icon: 'refresh', count: () => openFailures().length, desc: 'Pantau job sinkronisasi dan tindak lanjuti data yang gagal diperbarui.' },
      { id: 'audit', label: 'Riwayat Perubahan', icon: 'history', perm: 'audit.read', desc: 'Jejak sebelum–sesudah setiap perubahan beserta pengguna internal maupun eksternal.' }
    ] },
    { group: 'Administrasi', items: [
      { id: 'access', label: 'Pengguna & Akses', icon: 'users', perm: 'users.manage', desc: 'Kelola pengguna, peran, dan izin akses.' },
      { id: 'integrations', label: 'Integrasi Google', icon: 'plug', perm: 'settings.write', desc: 'Koneksi Google Business Profile, kuota API, dan notifikasi.' },
      { id: 'settings', label: 'Pengaturan', icon: 'sliders', desc: 'Preferensi workspace, target SLA, aturan deteksi, dan data demo.' }
    ] },
    { group: 'Bantuan', items: [
      { id: 'guide', label: 'Panduan Pengguna', icon: 'book', desc: 'Cara memakai setiap fitur BranchSync, langkah demi langkah.' },
      { id: 'scenarios', label: 'Scenario Test', icon: 'clipboard', desc: 'Tutorial dan pencatatan hasil 13 skenario uji piloting Dashboard BranchSync.' }
    ] }
  ];
  const NAV_ITEMS = NAV.flatMap(g => g.items);
  const navItem = id => NAV_ITEMS.find(n => n.id === id) || NAV_ITEMS[0];

  /* ------------------------------------------------------------------ *
   * Data awal (deterministik)
   * ------------------------------------------------------------------ */
  function buildSeed() {
    const r = rng(20261114), t0 = Date.now();
    const base = typeof locations !== 'undefined' && Array.isArray(locations) && locations.length ? locations : [
      { city: 'Jakarta', province: 'DKI Jakarta', lat: -6.2088, lng: 106.8456, status: 'Online', code: 'DM-001' }
    ];
    const phone = () => `(0${21 + Math.floor(r() * 700)}) ${String(1000000 + Math.floor(r() * 8999999))}`;
    const list = [];
    const mk = o => {
      const l = {
        code: o.code, name: o.name, type: o.type, city: o.city, province: o.province, region: regionOf(o.province),
        address: o.address || `Jl. ${pick(r, STREETS)} No. ${1 + Math.floor(r() * 200)}, ${o.city}`,
        phone: o.phone || phone(), hours: o.hours || (o.type === 'ATM' ? HOURS[3] : pick(r, HOURS.slice(0, 3))),
        lat: +o.lat.toFixed(6), lng: +o.lng.toFixed(6), status: o.status, gbp: o.gbp || 'Terverifikasi',
        updatedAt: t0 - Math.floor(r() * 20 * DAY), updatedBy: pick(r, ['Admin Demo', 'Operator Jawa', 'Operator Sumatera']),
        lastSync: t0 - Math.floor(r() * 3 * DAY)
      };
      l.google = { name: l.name, phone: l.phone, hours: l.hours, address: l.address, lat: l.lat, lng: l.lng };
      return l;
    };
    base.forEach(b => list.push(mk({ code: b.code, name: `KC ${b.city}`, type: 'Kantor Cabang', city: b.city, province: b.province, lat: b.lat, lng: b.lng, status: b.status })));
    let seq = base.length;
    const nextCode = () => `DM-${String(++seq).padStart(3, '0')}`;
    const prefix = { KCP: 'KCP', Unit: 'BRI Unit', ATM: 'ATM BRI' };
    for (let i = 0; i < base.length * 2; i++) {
      const b = base[i % base.length], type = ['KCP', 'Unit', 'ATM'][i % 3];
      const p = offset(b.lat, b.lng, 900 + r() * 3100, r() * Math.PI * 2);
      const x = r();
      const status = x < 0.7 ? 'Online' : x < 0.8 ? 'Offline' : x < 0.92 ? 'Belum Sync' : 'Tidak Aktif';
      const y = r();
      const gbp = y < 0.75 ? 'Terverifikasi' : y < 0.83 ? 'Menunggu Verifikasi' : y < 0.93 ? 'Belum Diklaim' : 'Suspend';
      list.push(mk({ code: nextCode(), name: `${prefix[type]} ${b.city} ${STREETS[(i * 3) % STREETS.length]}`, type, city: b.city, province: b.province, lat: p.lat, lng: p.lng, status, gbp }));
    }
    // Duplikat yang disengaja
    const d1 = offset(list[1].lat, list[1].lng, 60, 1.2);
    list.push(mk({ code: nextCode(), name: `BRI ${list[1].city}`, type: 'Kantor Cabang', city: list[1].city, province: list[1].province, lat: d1.lat, lng: d1.lng, status: 'Belum Sync', gbp: 'Belum Diklaim' }));
    const src = list[18], d2 = offset(src.lat, src.lng, 110, 2.4);
    list.push(mk({ code: nextCode(), name: src.name, type: src.type, city: src.city, province: src.province, lat: d2.lat, lng: d2.lng, status: 'Online', gbp: 'Menunggu Verifikasi', phone: src.phone }));
    // Ketidaksesuaian yang disengaja
    const g = i => list[i % list.length].google;
    g(3).phone = phone();
    g(6).hours = 'Sen–Jum 08.00–17.00';
    g(10).name = `Bank BRI ${list[10].city}`;
    Object.assign(g(20), offset(list[20].lat, list[20].lng, 450, 0.8));
    g(27).address = `Jl. Lama No. 5, ${list[27].city}`;
    g(33).hours = 'Sen–Sab 07.30–15.00'; g(33).phone = phone();
    const P = list.findIndex(l => l.gbp === 'Suspend');
    const U = list.filter(l => l.gbp === 'Belum Diklaim');
    const at = i => list[i % list.length];

    const approvals = [
      { id: 'CR-001', code: at(4).code, field: 'phone', before: at(4).phone, after: '(0361) 555 0199', by: EXT_EMAILS[0], time: t0 - 3 * HOUR, status: 'Menunggu' },
      { id: 'CR-002', code: at(12).code, field: 'hours', before: at(12).hours, after: 'Setiap hari 07.00–20.00', by: EXT_EMAILS[1], time: t0 - 26 * HOUR, status: 'Menunggu' },
      { id: 'CR-003', code: at(22).code, field: 'name', before: at(22).name, after: `${at(22).name} (Tutup Permanen)`, by: EXT_EMAILS[2], time: t0 - 50 * HOUR, status: 'Menunggu' },
      { id: 'CR-004', code: at(8).code, field: 'address', before: at(8).address, after: `Ruko Baru Blok C, ${at(8).city}`, by: EXT_EMAILS[3], time: t0 - 5 * DAY, status: 'Ditolak', decidedAt: t0 - 5 * DAY + 2 * HOUR, decidedBy: 'Admin Demo' },
      { id: 'CR-005', code: at(15).code, field: 'hours', before: 'Sen–Jum 08.00–15.00', after: at(15).hours, by: EXT_EMAILS[1], time: t0 - 8 * DAY, status: 'Disetujui', decidedAt: t0 - 8 * DAY + 4 * HOUR, decidedBy: 'Operator Jawa' }
    ];
    const claims = [
      { id: 'KL-001', kind: 'Klaim kepemilikan', code: (U[0] || at(5)).code, submittedAt: t0 - 6 * DAY, processedAt: t0 - 6 * DAY + 9 * HOUR, doneAt: t0 - 2 * DAY, status: 'Selesai', note: '' },
      { id: 'KL-002', kind: 'Banding suspend', code: at(P >= 0 ? P : 7).code, submittedAt: t0 - 4 * DAY, processedAt: t0 - 4 * DAY + 30 * HOUR, doneAt: null, status: 'Menunggu verifikasi Google', note: 'Dokumen izin usaha dilampirkan' },
      { id: 'KL-003', kind: 'Titik baru', proposal: { name: 'KCP Makassar Panakkukang', type: 'KCP', city: 'Makassar', province: 'Sulawesi Selatan', lat: -5.1555, lng: 119.4467, address: 'Jl. Boulevard No. 12, Makassar', phone: '(0411) 445566', hours: HOURS[0] }, submittedAt: t0 - 20 * HOUR, processedAt: null, doneAt: null, status: 'Diajukan', note: '' },
      { id: 'KL-004', kind: 'Klaim kepemilikan', code: (U[1] || at(9)).code, submittedAt: t0 - 2 * DAY, processedAt: t0 - 2 * DAY + 5 * HOUR, doneAt: null, status: 'Menunggu verifikasi Google', note: 'Verifikasi via kartu pos' },
      { id: 'KL-005', kind: 'Laporan duplikat', code: at(30).code, submittedAt: t0 - 9 * DAY, processedAt: t0 - 9 * DAY + 3 * HOUR, doneAt: t0 - 6 * DAY, status: 'Selesai', note: '' },
      { id: 'KL-006', kind: 'Titik baru', proposal: { name: 'BRI Unit Balikpapan Pelabuhan', type: 'Unit', city: 'Balikpapan', province: 'Kalimantan Timur', lat: -1.2701, lng: 116.8098, address: 'Jl. Pelabuhan No. 2, Balikpapan', phone: '(0542) 771122', hours: HOURS[2] }, submittedAt: t0 - 12 * DAY, processedAt: t0 - 11 * DAY, doneAt: null, status: 'Ditolak', note: 'Koordinat berada di area perairan' },
      { id: 'KL-007', kind: 'Klaim kepemilikan', code: (U[2] || at(11)).code, submittedAt: t0 - 30 * HOUR, processedAt: null, doneAt: null, status: 'Diproses internal', note: '' }
    ];
    const reasons = ['Timeout API saat memperbarui jam operasional', 'Listing di-suspend Google — ajukan banding', 'Konflik: data Google berbeda — tinjau Ketidaksesuaian', 'Alamat ditolak validasi Google'];
    const runs = [];
    let job = 0;
    for (let d = 6; d >= 0; d--) {
      for (const h of d % 2 === 0 ? [11, 5] : [9]) {
        const time = t0 - d * DAY - h * HOUR;
        if (time > t0) continue;
        const skip = list.filter(l => l.status === 'Tidak Aktif').length;
        const failN = 1 + Math.floor(r() * 4);
        const items = [];
        for (let k = 0; k < failN; k++) {
          const l = pick(r, list);
          if (items.some(i => i.code === l.code)) continue;
          items.push({ code: l.code, status: 'Gagal', reason: pick(r, reasons), resolved: d > 1, note: d > 1 ? 'Berhasil pada job berikutnya' : '' });
        }
        list.filter(l => l.status === 'Tidak Aktif').forEach(l => items.push({ code: l.code, status: 'Dilewati', reason: 'Unit tidak aktif', resolved: true, note: '' }));
        const fail = items.filter(i => i.status === 'Gagal').length;
        runs.unshift({ id: `JOB-${String(++job).padStart(4, '0')}`, time, scope: 'Semua unit', by: h === 5 ? 'Admin Demo' : 'Penjadwal otomatis', total: list.length, ok: list.length - fail - skip, fail, skip, durationMs: 38000 + Math.floor(r() * 50000), items });
      }
    }
    const audit = [];
    let aid = 0;
    const A = (time, user, actor, module, action, target, changes = [], detail = '') => audit.push({ id: ++aid, time, user, actor, module, action, target, changes, detail });
    A(t0 - 50 * HOUR, EXT_EMAILS[2], 'Eksternal', 'Persetujuan Edit', 'Mengusulkan perubahan nama', at(22).code, [{ field: 'Nama listing', before: at(22).name, after: `${at(22).name} (Tutup Permanen)` }]);
    A(t0 - 26 * HOUR, EXT_EMAILS[1], 'Eksternal', 'Persetujuan Edit', 'Mengusulkan perubahan jam', at(12).code, [{ field: 'Jam operasional', before: at(12).hours, after: 'Setiap hari 07.00–20.00' }]);
    A(t0 - 20 * HOUR, 'Operator Sumatera', 'Internal', 'Klaim & Titik Baru', 'Mengajukan titik baru', 'KL-003', [], 'KCP Makassar Panakkukang');
    A(t0 - 9 * HOUR, 'Operator Jawa', 'Internal', 'Unit Kerja', 'Memperbarui unit', at(2).code, [{ field: 'Telepon', before: '(024) 3550000', after: at(2).phone }, { field: 'Jam operasional', before: HOURS[0], after: at(2).hours }]);
    A(t0 - 5 * HOUR, 'Admin Demo', 'Internal', 'Unit Kerja', 'Mengubah status', at(6).code, [{ field: 'Status', before: 'Online', after: at(6).status }]);
    A(t0 - 3 * HOUR, EXT_EMAILS[0], 'Eksternal', 'Persetujuan Edit', 'Mengusulkan perubahan telepon', at(4).code, [{ field: 'Telepon', before: at(4).phone, after: '(0361) 555 0199' }]);
    A(t0 - 2 * HOUR, 'Penjadwal otomatis', 'Internal', 'Sync Monitor', 'Menjalankan sinkronisasi', runs[0]?.id || '', [], `${runs[0]?.ok} berhasil, ${runs[0]?.fail} gagal`);
    audit.sort((a, b) => b.time - a.time);

    return ensureExtras({
      v: 2, locations: list, approvals, claims, runs, audit,
      users: [
        { id: 1, name: 'Admin Demo', email: 'admin@example.test', role: 'Administrator', status: 'Aktif', lastActive: t0 },
        { id: 2, name: 'Operator Jawa', email: 'operator.jawa@example.test', role: 'Operator', status: 'Aktif', lastActive: t0 - 2 * HOUR },
        { id: 3, name: 'Operator Sumatera', email: 'operator.sumatera@example.test', role: 'Operator', status: 'Aktif', lastActive: t0 - 20 * HOUR },
        { id: 4, name: 'Auditor Internal', email: 'auditor@example.test', role: 'Viewer', status: 'Aktif', lastActive: t0 - 3 * DAY },
        { id: 5, name: 'Mitra Agensi', email: 'agensi@example.test', role: 'Viewer', status: 'Nonaktif', lastActive: t0 - 40 * DAY }
      ],
      roles: [
        { name: 'Administrator', permissions: PERMS.map(p => p[0]) },
        { name: 'Operator', permissions: ['locations.read', 'locations.write', 'locations.import', 'sync.run', 'claims.manage', 'audit.read'] },
        { name: 'Viewer', permissions: ['locations.read', 'audit.read'] }
      ],
      api: { connected: true, account: 'gbp-bri@example.test', project: 'branchsync-sandbox', quotaLimit: 10000, quotaUsed: 1820, lastTest: t0 - HOUR, webhook: true },
      settings: { workspace: 'BranchSync · Jaringan BRI', timezone: 'Asia/Jakarta', pageSize: 10, slaInternal: 24, slaGoogle: 120, dupRadius: 150, coordTol: 50 },
      discNotes: {}, dupIgnored: [],
      seq: { loc: seq, claim: claims.length, cr: approvals.length, job, audit: aid, user: 5 }
    });
  }

  /* ------------------------------------------------------------------ *
   * State & persistensi
   * ------------------------------------------------------------------ */
  /* Data Demo disimpan di IndexedDB (kapasitas besar). localStorage hanya cadangan
     bila IndexedDB tidak tersedia, dan data lama dari localStorage dimigrasikan otomatis. */
  const STORE = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB tidak tersedia')); return; }
      const rq = indexedDB.open('branchSync', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
      rq.onblocked = () => rej(new Error('IndexedDB terblokir'));
    }));
    const tx = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('kv', mode), rq = fn(t.objectStore('kv'));
      t.oncomplete = () => res(rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaksi dibatalkan'));
    }));
    return { get: k => tx('readonly', st => st.get(k)), set: (k, v) => tx('readwrite', st => st.put(v, k)) };
  })();
  let demoState = null, storageMode = 'pending'; // pending | idb | local
  function legacyLoad() {
    try {
      const s0 = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s0 && s0.v === 2 && Array.isArray(s0.locations)) return ensureExtras(s0);
    } catch (_) { /* penyimpanan tidak tersedia */ }
    return buildSeed();
  }
  function loadState() { if (!demoState) demoState = legacyLoad(); return demoState; }
  let state = loadState();
  let prefs = { theme: '', collapsed: false, pageSize: 10 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (_) {}
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {} };
  let saveTimer = 0;
  // Data Live tidak pernah ditulis ke penyimpanan demo. Gagal simpan → peringatan (sekali).
  let saveWarned = false;
  const saveFailed = () => { if (saveWarned) return; saveWarned = true; toast('Data Demo gagal disimpan di browser ini. Unduh cadangan JSON agar perubahan tidak hilang.', { tone: 'bad', action: { label: 'Buka Pengaturan', run: () => navigate('settings') } }); };
  const persist = () => {
    if (isLive() || storageMode === 'pending') return;
    demoState = state;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (isLive()) return;
      if (storageMode === 'idb') STORE.set('demoState', demoState).then(() => { saveWarned = false; }, saveFailed);
      else { try { localStorage.setItem(STORE_KEY, JSON.stringify(demoState)); saveWarned = false; } catch (_) { saveFailed(); } }
    }, 400);
  };
  let cache = {};
  const touch = () => { cache = {}; persist(); };
  const memo = (k, fn) => (k in cache ? cache[k] : (cache[k] = fn()));
  // Izin pengguna aktif: dari server (Live, bila dikirim) atau dari matriks peran.
  const myPerms = () => memo('perms', () => {
    if (Array.isArray(ME.permissions)) return new Set(ME.permissions);
    if (ME.role === 'Administrator') return new Set(PERMS.map(x => x[0]));
    const r = (state.roles || []).find(x => x.name === ME.role);
    return new Set(r ? r.permissions : ['locations.read']);
  });
  const can = perm => !perm || myPerms().has(perm);
  const permLabel = perm => (PERMS.find(x => x[0] === perm) || [perm, perm])[1];
  const deniedMsg = perm => `Tidak diizinkan untuk peran ${ME.role} — butuh izin “${permLabel(perm)}”.`;
  const canView = v => can((NAV_ITEMS.find(n => n.id === v) || {}).perm);
  function guard(perm) { if (can(perm)) return true; toast(deniedMsg(perm), { tone: 'warn' }); return false; }
  const snapshot = () => JSON.stringify(state);

  const ui = {
    view: 'dashboard', navOpen: false, running: null, pop: '', renderMs: 0,
    loc: { q: '', quick: 'all', status: [], region: [], type: [], gbp: [], sort: 'name', dir: 1, page: 1, selected: new Set() },
    map: { q: '', status: '', region: '', gbp: '', showGoogle: true },
    disc: { q: '', field: '' }, claims: { tab: 'active' }, approvals: { tab: 'pending' },
    sync: { tab: 'failures' }, audit: { q: '', module: '', actor: '', range: '30' }, access: { tab: 'users', q: '' },
    drawer: null,
    live: { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 },
    reviews: { account: '', location: '', rating: '', status: '', sort: 'newest', q: '', limit: 20, editing: null, drafts: {} },
    report: { period: '30', region: '', account: '', type: '' },
    guide: { q: '' },
    scn: { group: '', open: new Set([1]) }
  };

  /* ------------------------------------------------------------------ *
   * Data turunan
   * ------------------------------------------------------------------ */
  const byCode = () => memo('byCode', () => new Map(state.locations.map(l => [l.code, l])));
  const locName = code => byCode().get(code)?.name || code;
  function issuesOf(l) {
    const g = l.google;
    if (!g) return [];
    const out = [];
    for (const f of ['name', 'phone', 'hours', 'address']) {
      if (String(l[f] || '').trim() !== String(g[f] || '').trim()) out.push({ field: f, dash: l[f], google: g[f] });
    }
    const d = distM(l, g);
    if (d > state.settings.coordTol) out.push({ field: 'coords', dash: `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`, google: `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`, dist: d });
    return out;
  }
  const issueMap = () => memo('issues', () => {
    const m = new Map();
    state.locations.forEach(l => { const x = issuesOf(l); if (x.length) m.set(l.code, x); });
    return m;
  });
  const duplicatePairs = () => memo('dups', () => {
    const ignored = new Set(state.dupIgnored), cell = 0.02, grid = new Map(), out = [], seen = new Set();
    const active = state.locations.filter(l => l.gbp !== 'Duplikat');
    active.forEach(l => {
      const k = `${Math.floor(l.lat / cell)}:${Math.floor(l.lng / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(l);
    });
    active.forEach(a => {
      const gy = Math.floor(a.lat / cell), gx = Math.floor(a.lng / cell), na = normName(a.name);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        (grid.get(`${gy + dy}:${gx + dx}`) || []).forEach(b => {
          if (b.code <= a.code) return;
          const key = `${a.code}|${b.code}`;
          if (seen.has(key) || ignored.has(key)) return;
          const d = distM(a, b), same = na && na === normName(b.name);
          let reason = '';
          if (same && d < 2000) reason = 'Nama sama dan berdekatan';
          else if (d <= state.settings.dupRadius && a.type === b.type) reason = `Tipe sama dalam radius ${state.settings.dupRadius} m`;
          if (!reason) return;
          seen.add(key);
          out.push({ key, a, b, d, reason, score: same ? (d < 300 ? 95 : 80) : 70 });
        });
      }
    });
    return out.sort((x, y) => y.score - x.score || x.d - y.d);
  });
  const openFailures = () => memo('fails', () => {
    const out = [], seen = new Set();
    state.runs.forEach(r => r.items.forEach(i => {
      if (i.status !== 'Gagal' || i.resolved || seen.has(i.code)) return;
      seen.add(i.code);
      out.push({ ...i, run: r.id, time: r.time, ref: i });
    }));
    return out;
  });
  const claimActive = c => !['Selesai', 'Ditolak'].includes(c.status);
  const claimName = c => (c.code ? locName(c.code) : c.proposal?.name || '—');
  function claimTimes(c) {
    const now = Date.now();
    const internal = (c.processedAt || (claimActive(c) ? now : c.doneAt || now)) - c.submittedAt;
    const gEnd = c.doneAt || (claimActive(c) ? now : null);
    const google = c.processedAt && gEnd ? gEnd - c.processedAt : null;
    const limit = state.settings.slaInternal * HOUR;
    const sla = internal > limit ? 'Lewat SLA' : !c.processedAt && claimActive(c) && internal > limit * 0.75 ? 'Mendekati batas' : 'Dalam SLA';
    return { internal, google: google == null || isNaN(google) ? null : google, internalRunning: !c.processedAt && claimActive(c), googleRunning: !!c.processedAt && !c.doneAt && claimActive(c), sla };
  }
  const slaStats = () => memo('sla', () => {
    const rows = state.claims.filter(c => c.status !== 'Ditolak').map(c => ({ c, t: claimTimes(c) }));
    const doneInt = rows.filter(x => !x.t.internalRunning), doneG = rows.filter(x => x.c.doneAt);
    return {
      rows,
      avgInternal: doneInt.length ? sum(doneInt.map(x => x.t.internal)) / doneInt.length : null,
      avgGoogle: doneG.length ? sum(doneG.map(x => x.t.google)) / doneG.length : null,
      compliance: pct(rows.filter(x => x.t.sla !== 'Lewat SLA').length, rows.length),
      atRisk: rows.filter(x => x.t.sla !== 'Dalam SLA' && claimActive(x.c)).length
    };
  });
  function dailySync(days) {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) out.push({ start: today.getTime() - i * DAY, ok: 0, fail: 0 });
    state.runs.forEach(r => { const d = out.find(x => r.time >= x.start && r.time < x.start + DAY); if (d) { d.ok += r.ok; d.fail += r.fail; } });
    return out;
  }
  function notifications() {
    const neg = state.reviews.filter(rv => !rv.reply && rv.rating <= 2).length;
    const pend = state.approvals.filter(a => a.status === 'Menunggu').length, f = openFailures().length, im = issueMap().size, dp = duplicatePairs().length, risk = slaStats().atRisk;
    return [
      pend && { icon: 'inbox', tone: 'warn', title: `${pend} edit dari email GBP lain menunggu persetujuan`, text: 'Data unit kerja tidak berubah sampai disetujui.', view: 'approvals' },
      f && { icon: 'refresh', tone: 'bad', title: `${f} unit gagal disinkronkan`, text: 'Coba ulang atau beri catatan tindak lanjut.', view: 'sync' },
      risk && { icon: 'gauge', tone: 'warn', title: `${risk} permintaan mendekati/lewat SLA`, text: `Target proses internal ${state.settings.slaInternal} jam.`, view: 'sla' },
      im && { icon: 'alert', tone: 'warn', title: `${im} unit berbeda dengan Google Maps`, text: 'Tentukan sumber data yang benar.', view: 'discrepancies' },
      dp && { icon: 'copy', tone: 'info', title: `${dp} kemungkinan titik ganda`, text: 'Periksa dan gabungkan bila perlu.', view: 'duplicates' },
      neg && { icon: 'star', tone: 'warn', title: `${neg} ulasan negatif belum dibalas`, text: 'Balas cepat agar nasabah merasa didengar.', view: 'reviews' }
    ].filter(Boolean);
  }

  /* ------------------------------------------------------------------ *
   * Mutasi + audit
   * ------------------------------------------------------------------ */
  function log(module, action, { target = '', changes = [], user = ME.name, actor = 'Internal', detail = '' } = {}) {
    state.audit.unshift({ id: ++state.seq.audit, time: Date.now(), user, actor, module, action, target, changes, detail });
    if (state.audit.length > 3000) state.audit.length = 3000;
  }
  const diff = (before, after, keys) => keys.filter(k => String(before[k] ?? '') !== String(after[k] ?? '')).map(k => ({ field: FIELD_LABEL[k] || k, before: before[k] ?? '', after: after[k] ?? '' }));

  /* ------------------------------------------------------------------ *
   * Mode Live — data dari REST API (kontrak: API.md)
   * ------------------------------------------------------------------ */
  const toMs = v => (v == null || v === '' ? null : typeof v === 'number' ? v : (Date.parse(v) || null));
  function blankState() {
    return { v: 2, locations: [], approvals: [], claims: [], runs: [], audit: [], users: [], roles: [],
      api: { connected: false, account: '', project: '', quotaLimit: 0, quotaUsed: 0, lastTest: null, webhook: false, clientId: '', hasClientSecret: false, hasApiKey: false, scopes: ['business.manage'], syncInterval: '60', pubsubTopic: '' },
      accounts: [], reviews: [], reportSchedules: [],
      settings: { workspace: 'BranchSync', timezone: 'Asia/Jakarta', slaInternal: 24, slaGoogle: 120, dupRadius: 150, coordTol: 50 },
      discNotes: {}, dupIgnored: [], seq: { loc: 0, claim: 0, cr: 0, job: 0, audit: 0, user: 0 } };
  }
  function normalizeSnapshot(d) {
    if (!d || !Array.isArray(d.locations)) throw new MODE.ApiError('Respons /bootstrap tidak valid: daftar "locations" tidak ditemukan.', 0, 'bad-data');
    const base = blankState(), s2 = { ...base, ...d, v: 2 };
    s2.settings = { ...base.settings, ...(d.settings || {}) };
    s2.api = { ...base.api, ...(d.api || {}) };
    s2.api.lastTest = toMs(s2.api.lastTest);
    s2.locations = d.locations.map(l => ({ ...l, region: l.region || regionOf(l.province || ''), lat: Number(l.lat), lng: Number(l.lng), updatedAt: toMs(l.updatedAt) || Date.now(), updatedBy: l.updatedBy || '—', lastSync: toMs(l.lastSync), google: l.google ? { ...l.google, lat: Number(l.google.lat), lng: Number(l.google.lng) } : null }));
    s2.approvals = (d.approvals || []).map(a => ({ ...a, time: toMs(a.time), decidedAt: toMs(a.decidedAt) }));
    s2.claims = (d.claims || []).map(c => ({ ...c, submittedAt: toMs(c.submittedAt), processedAt: toMs(c.processedAt), doneAt: toMs(c.doneAt) }));
    s2.runs = (d.runs || []).map(r => ({ ...r, time: toMs(r.time), items: r.items || [] }));
    s2.audit = (d.audit || []).map(a => ({ ...a, time: toMs(a.time), changes: a.changes || [] }));
    s2.users = (d.users || []).map(u => ({ ...u, lastActive: toMs(u.lastActive) }));
    s2.roles = (d.roles || []).map(r => ({ name: r.name, permissions: r.permissions || [] }));
    s2.discNotes = d.discNotes || {};
    s2.dupIgnored = d.dupIgnored || [];
    s2.reportSchedules = (d.reportSchedules || []).map(x => ({ ...x, createdAt: toMs(x.createdAt) }));
    s2.accounts = (d.accounts || []).map(a => ({ ...a }));
    s2.reviews = (d.reviews || []).map(rv => ({ ...rv, rating: Number(rv.rating) || 0, time: toMs(rv.time), reply: rv.reply && rv.reply.text ? { ...rv.reply, time: toMs(rv.reply.time) } : null }));
    // ID sementara untuk pembaruan optimistis; diganti data server saat dimuat ulang.
    s2.seq = { loc: 90000, claim: 90000, cr: 90000, job: 90000, audit: 900000, user: 90000, review: 90000 };
    return s2;
  }
  async function loadLive({ silent = false } = {}) {
    if (!isLive()) return false;
    if (!silent) { ui.live.loading = true; ui.live.error = null; render(); }
    try {
      const data = await MODE.request('GET', '/bootstrap');
      if (!isLive()) return false;
      state = normalizeSnapshot(data);
      ui.live = { ...ui.live, ready: true, loading: false, error: null, syncedAt: Date.now() };
      touch(); render();
      return true;
    } catch (e) {
      ui.live.loading = false;
      if (e.code === 'unauthorized') { sessionExpired(); return false; }
      ui.live.error = e;
      if (silent && ui.live.ready) { updateChrome(); return false; }
      ui.live.ready = false; render();
      return false;
    }
  }
  let refreshTimer = 0;
  // Kirim perubahan ke server. Tampilan sudah diperbarui secara optimistis;
  // setelah selesai (berhasil/gagal) data dimuat ulang agar sama dengan server.
  async function remote(method, path, body) {
    if (!isLive()) return true;
    ui.live.pending++; updateChrome();
    try { const res = await MODE.request(method, path, body); ui.live.error = null; return res ?? true; }
    catch (e) {
      if (e.code === 'unauthorized') { sessionExpired(); return false; }
      toast(`Gagal menyimpan ke server: ${e.message}`, { tone: 'bad', action: { label: 'Muat ulang', run: () => loadLive() } });
      return false;
    } finally {
      ui.live.pending = Math.max(0, ui.live.pending - 1);
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadLive({ silent: true }), 200);
    }
  }
  // Sesi Live tidak valid → kembali ke Mode Demo dan tawarkan masuk lagi (tetap di workspace).
  function sessionExpired(message = 'Sesi Live berakhir atau tidak valid. Silakan masuk kembali.') {
    MODE.clearSession();
    if (isLive()) {
      MODE.setMode('demo'); ME = demoUser(); state = loadState();
      ui.live = { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 };
      renderedView = null; touch();
      if (!shell.hidden) render();
    }
    if (!shell.hidden) liveConnectModal(message);
  }
  function switchToDemo() {
    if (!isLive()) { toast('Anda sudah berada di Mode Demo.'); return; }
    MODE.setMode('demo');
    ME = demoUser();
    state = loadState();
    ui.live = { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 };
    ui.loc.selected.clear(); renderedView = null;
    ui.reviews = { account: '', location: '', rating: '', status: '', sort: 'newest', q: '', limit: 20, editing: null, drafts: {} };
    touch(); navigate(ui.view);
    toast('Beralih ke Mode Demo — data simulasi di browser ini.', { tone: 'good' });
  }
  function switchToLive() {
    if (isLive()) { toast('Anda sudah berada di mode Live.'); return; }
    if (MODE.hasSession() && MODE.getBaseUrl()) {
      activateLive();
    } else liveConnectModal();
  }

  function syncOne(l, retry) {
    if (l.status === 'Tidak Aktif') return { status: 'Dilewati', reason: 'Unit tidak aktif' };
    if (l.gbp === 'Duplikat') return { status: 'Dilewati', reason: 'Ditandai sebagai duplikat' };
    if (l.gbp === 'Suspend') return { status: 'Gagal', reason: 'Listing di-suspend Google — ajukan banding' };
    if (l.google && issuesOf(l).length) return { status: 'Gagal', reason: 'Konflik: data Google berbeda — tinjau Ketidaksesuaian' };
    if (l.status === 'Offline' && !retry) return { status: 'Gagal', reason: 'Timeout API saat memperbarui jam operasional' };
    l.google = { name: l.name, phone: l.phone, hours: l.hours, address: l.address, lat: l.lat, lng: l.lng };
    if (l.gbp === 'Belum Diklaim') l.gbp = 'Menunggu Verifikasi';
    if (l.status === 'Belum Sync' || l.status === 'Offline') l.status = 'Online';
    l.lastSync = Date.now();
    return { status: 'Berhasil' };
  }
  async function runSync(codes, { retry = false, label = 'Semua unit' } = {}) {
    if (!guard('sync.run')) return;
    if (ui.running) { toast('Sinkronisasi lain sedang berjalan.', { tone: 'warn' }); return; }
    if (isLive()) {
      ui.running = { done: 0, total: codes ? codes.length : state.locations.length, indeterminate: true };
      render();
      const run = await remote('POST', '/sync', { codes: codes || null, retry, label });
      ui.running = null;
      render();
      if (run && typeof run === 'object' && 'ok' in run) {
        toast(`Sinkronisasi selesai — ${fmtNum(run.ok)} berhasil, ${fmtNum(run.fail || 0)} gagal, ${fmtNum(run.skip || 0)} dilewati.`, { tone: run.fail ? 'warn' : 'good', action: run.fail ? { label: 'Lihat kegagalan', run: () => { ui.sync.tab = 'failures'; navigate('sync'); } } : null });
      } else if (run) toast('Permintaan sinkronisasi diterima server.', { tone: 'good' });
      return;
    }
    if (!state.api.connected) { toast('Google API belum terhubung.', { tone: 'bad', action: { label: 'Buka Integrasi', run: () => navigate('integrations') } }); return; }
    const targets = codes ? codes.map(c => byCode().get(c)).filter(Boolean) : [...state.locations];
    if (!targets.length) return;
    const remaining = state.api.quotaLimit - state.api.quotaUsed;
    if (remaining < targets.length) { toast(`Kuota API tidak cukup (sisa ${fmtNum(remaining)}).`, { tone: 'bad' }); return; }
    const started = performance.now();
    ui.running = { done: 0, total: targets.length };
    render();
    const items = []; let ok = 0;
    const chunk = Math.max(5, Math.ceil(targets.length / 12));
    for (let i = 0; i < targets.length; i += chunk) {
      targets.slice(i, i + chunk).forEach(l => {
        const res = syncOne(l, retry);
        if (res.status === 'Berhasil') ok++;
        else items.push({ code: l.code, status: res.status, reason: res.reason, resolved: res.status !== 'Gagal', note: '' });
      });
      ui.running.done = Math.min(targets.length, i + chunk);
      updateChrome();
      await sleep(Math.max(40, 900 / Math.ceil(targets.length / chunk)));
    }
    const fail = items.filter(i => i.status === 'Gagal').length, skip = items.length - fail;
    const run = { id: `JOB-${String(++state.seq.job).padStart(4, '0')}`, time: Date.now(), scope: label, by: ME.name, total: targets.length, ok, fail, skip, durationMs: Math.round(performance.now() - started), items };
    state.runs.unshift(run);
    if (state.runs.length > 600) state.runs.length = 600;
    // Kegagalan lama yang sekarang berhasil → otomatis ditandai selesai
    const okCodes = new Set(targets.filter(l => !items.some(i => i.code === l.code)).map(l => l.code));
    state.runs.slice(1).forEach(r => r.items.forEach(i => { if (i.status === 'Gagal' && !i.resolved && okCodes.has(i.code)) { i.resolved = true; i.note = `Berhasil pada ${run.id}`; } }));
    state.api.quotaUsed += ok;
    log('Sync Monitor', retry ? 'Mencoba ulang sinkronisasi' : 'Menjalankan sinkronisasi', { target: run.id, detail: `${label}: ${ok} berhasil, ${fail} gagal, ${skip} dilewati` });
    ui.running = null;
    touch(); render();
    toast(`Sinkronisasi selesai — ${fmtNum(ok)} berhasil, ${fmtNum(fail)} gagal, ${fmtNum(skip)} dilewati.`, {
      tone: fail ? 'warn' : 'good',
      action: fail ? { label: 'Lihat kegagalan', run: () => { ui.sync.tab = 'failures'; navigate('sync'); } } : null
    });
  }

  /* ------------------------------------------------------------------ *
   * Kerangka (shell)
   * ------------------------------------------------------------------ */
  shell.className = 'bs-shell';
  shell.lang = 'id';
  shell.innerHTML = `
    <a class="bs-skip" href="#bsMain">Lewati ke konten utama</a>
    <aside class="bs-sidebar" id="bsSidebar" aria-label="Navigasi admin">
      <div class="bs-brand">
        <span class="bs-logo" aria-hidden="true">BRI</span>
        <span class="bs-brand-text"><strong>BranchSync</strong><small>Admin Workspace</small></span>
        <button type="button" class="bs-icon-btn bs-collapse" data-action="collapse" aria-label="Ciutkan navigasi">${ic('panel')}</button>
      </div>
      <button type="button" class="bs-search-trigger" data-action="palette">${ic('search')}<span>Cari unit atau menu…</span><kbd>${MOD} K</kbd></button>
      <nav id="bsNav" class="bs-nav"></nav>
      <div class="bs-account">
        <span class="bs-avatar" aria-hidden="true" id="bsAccAvatar">AD</span>
        <span class="bs-account-text"><strong id="bsAccName">${esc(ME.name)}</strong><small id="bsAccRole">Administrator</small></span>
        <button type="button" class="bs-icon-btn" data-action="logout" aria-label="Keluar ke halaman utama" title="Keluar">${ic('logout')}</button>
      </div>
    </aside>
    <div class="bs-scrim" data-action="nav-close" hidden></div>
    <div class="bs-body">
      <header class="bs-topbar">
        <button type="button" class="bs-icon-btn bs-menu" data-action="nav-open" aria-label="Buka navigasi" aria-controls="bsSidebar" aria-expanded="false">${ic('menu')}</button>
        <nav class="bs-crumbs" aria-label="Lokasi halaman"><span>Workspace</span>${ic('chev')}<strong id="bsCrumb"></strong></nav>
        <div class="bs-top-end">
          <button type="button" class="bs-sync-pill" id="bsSyncPill" data-view="sync"></button>
          <button type="button" class="bs-role-chip" id="bsRoleChip" data-action="mode-menu" hidden></button><button type="button" class="bs-icon-btn bs-hide-sm" data-action="copy-link" aria-label="Salin tautan halaman ini" title="Salin tautan halaman ini">${ic('link')}</button><div class="bs-pop-wrap"><button type="button" class="bs-mode-btn" id="bsModeBtn" data-action="mode-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="bsModeMenu"></button><div class="bs-popover bs-mode-menu" id="bsModeMenu" role="menu" aria-label="Mode aplikasi" hidden></div></div>
          <div class="bs-pop-wrap">
            <button type="button" class="bs-icon-btn" id="bsNotifBtn" data-action="notif" aria-haspopup="true" aria-expanded="false" aria-controls="bsNotif" aria-label="Notifikasi">${ic('bell')}<span class="bs-count-dot" id="bsNotifCount"></span></button>
            <div class="bs-popover bs-notif" id="bsNotif" hidden></div>
          </div>
          <button type="button" class="bs-icon-btn bs-hide-sm" data-view="guide" aria-label="Panduan pengguna" title="Panduan pengguna">${ic('book')}</button>
          <div class="bs-lang" role="group" aria-label="Bahasa" id="bsLang"><button type="button" data-action="lang" data-id="id" lang="id">ID</button><button type="button" data-action="lang" data-id="en" lang="en">EN</button></div>
          <button type="button" class="bs-icon-btn" id="bsThemeBtn" data-action="theme" aria-label="Ganti tema">${ic('moon')}</button>
          <button type="button" class="bs-icon-btn bs-hide-sm" data-action="shortcuts" aria-label="Pintasan keyboard" title="Pintasan keyboard (?)">${ic('keyboard')}</button>
        </div>
      </header>
      <main class="bs-main" id="bsMain" tabindex="-1">
        <div class="bs-page" id="bsPage"></div>
      </main>
      <footer class="bs-footer" aria-label="Status workspace"><span id="bsFooterInfo"></span><span id="bsFooterMode"></span></footer>
    </div>
    <dialog class="bs-modal" id="bsModal" aria-labelledby="bsModalTitle"></dialog>
    <dialog class="bs-sheet" id="bsDrawer" aria-labelledby="bsDrawerTitle"></dialog>
    <dialog class="bs-palette" id="bsPalette" aria-label="Pencarian cepat"></dialog>
    <div class="bs-toasts" id="bsToasts" role="region" aria-label="Notifikasi singkat" aria-live="polite"></div>`;
  document.getElementById('adminEditDialog')?.remove();
  document.getElementById('legacyAdminTemplate')?.remove();
  const $ = id => document.getElementById(id);
  const modal = $('bsModal'), sheet = $('bsDrawer'), palette = $('bsPalette');
  const mobile = window.matchMedia('(max-width: 900px)');

  /* ------------------------------------------------------------------ *
   * Komponen HTML
   * ------------------------------------------------------------------ */
  const btn = (label, action, { id = '', icon = '', variant = '', title = '', attrs = '' } = {}) => {
    const perm = ACTION_PERM[action], denied = !!perm && !can(perm);
    return `<button type="button" class="bs-btn ${variant}${denied ? ' is-denied' : ''}" data-action="${action}"${id !== '' ? ` data-id="${esc(id)}"` : ''}${denied ? ` title="${esc(deniedMsg(perm))}" aria-disabled="true"` : title ? ` title="${esc(title)}"` : ''}${title ? ` aria-label="${esc(title)}"` : ''} ${attrs}>${icon ? ic(icon) : ''}${label ? `<span>${label}</span>` : ''}</button>`;
  };
  const go = (label, view, variant = 'sm ghost') => `<button type="button" class="bs-btn ${variant}" data-view="${view}"><span>${label}</span>${ic('chev')}</button>`;
  const card = (title, body, { actions = '', sub = '', cls = '', flush = false } = {}) =>
    `<section class="bs-card ${cls}"><header class="bs-card-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="bs-card-actions">${actions}</div>` : ''}</header><div class="bs-card-body${flush ? ' flush' : ''}">${body}</div></section>`;
  const emptyState = (title, text, cta = '', icon = 'check') => `<div class="bs-empty-state">${ic(icon)}<strong>${title}</strong><p>${text}</p>${cta}</div>`;
  const head = (title, desc, actions = '') => `<div class="bs-page-head"><div><h1 id="bsTitle" tabindex="-1">${title}</h1><p>${desc}</p></div>${actions ? `<div class="bs-page-actions">${actions}</div>` : ''}</div>`;
  const tabs = (bind, items, cur) => `<div class="bs-tabs" role="tablist">${items.map(([v, l, n]) => `<button type="button" role="tab" aria-selected="${v === cur}" data-action="tab" data-id="${bind}:${v}">${l}${n != null ? `<span class="bs-tab-count">${fmtNum(n)}</span>` : ''}</button>`).join('')}</div>`;
  const opts = (xs, v, all) => (all ? `<option value="">${all}</option>` : '') + xs.map(x => { const [val, lab] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`; }).join('');
  const selectF = (bind, label, xs, v, all = 'Semua') => `<label class="bs-field"><span>${label}</span><select data-bind="${bind}">${opts(xs, v, all)}</select></label>`;
  const searchF = (bind, label, v, ph, id) => `<label class="bs-field bs-grow"><span>${label}</span><span class="bs-input-ic">${ic('search')}<input type="search" id="${id}" data-bind="${bind}" data-search value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off"></span></label>`;
  // Setiap <td> diberi data-label dari judul kolomnya → di layar kecil tabel tampil sebagai kartu.
  const withLabels = (heads, rows) => {
    const labels = heads.map(h => String(h).replace(/<[^>]+>/g, '').replace(/[↑↓↕]/g, '').trim());
    return rows.map(r => { let i = 0; return r.replace(/<td\b/g, () => `<td data-label="${esc(labels[i++] || '')}"`); });
  };
  const table = (heads, rows, emptyMsg = 'Tidak ada data.', { cls = '' } = {}) =>
    `<div class="bs-table-wrap ${cls}" tabindex="0" role="region" aria-label="Tabel data"><table class="bs-table bs-cards"><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? withLabels(heads, rows).join('') : `<tr><td class="bs-td-empty" colspan="${heads.length}">${emptyMsg}</td></tr>`}</tbody></table></div>`;
  const kv = pairs => `<dl class="bs-kv">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const diffList = changes => `<ul class="bs-diff">${changes.map(c => `<li><span class="bs-diff-field">${esc(c.field)}</span><del>${esc(c.before) || '<em>kosong</em>'}</del>${ic('arrowR')}<ins>${esc(c.after) || '<em>kosong</em>'}</ins></li>`).join('')}</ul>`;
  function sparkline(values) {
    if (values.length < 2) return '';
    const w = 96, h = 36, max = Math.max(...values, 1), min = Math.min(...values, 0);
    const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
    const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="bs-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polygon points="0,${h} ${line} ${w},${h}"/><polyline points="${line}"/><circle cx="${last[0]}" cy="${last[1]}" r="2.5"/></svg>`;
  }
  const metric = ({ label, value, note = '', tone = '', spark = null, view = '', icon = '' }) =>
    `<article class="bs-metric"${tone ? ` data-tone="${tone}"` : ''}><div class="bs-metric-head"><span>${label}</span>${icon ? ic(icon) : ''}</div><div class="bs-metric-body"><div><strong>${value}</strong><small>${note}</small></div>${spark ? sparkline(spark) : ''}</div>${view ? `<button type="button" class="bs-stretch" data-view="${view}" aria-label="Buka ${esc(label)}"></button>` : ''}</article>`;
  const bar = (n, max, label) => `<span class="bs-bar-track" role="img" aria-label="${esc(label)}"><span style="width:${max ? Math.max(2, (n / max) * 100) : 0}%"></span></span>`;

  /* ------------------------------------------------------------------ *
   * View: Dashboard
   * ------------------------------------------------------------------ */
  function syncChart(daily) {
    const max = Math.max(1, ...daily.map(d => d.ok + d.fail));
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / step) * step;
    const ticks = [top, top / 2, 0];
    const dayLabel = t => new Intl.DateTimeFormat(LOC(), { weekday: 'short' }).format(new Date(t));
    const fullLabel = t => new Intl.DateTimeFormat(LOC(), { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(t));
    const cols = daily.map(d => {
      const tot = d.ok + d.fail;
      return `<div class="bs-col" tabindex="0" aria-label="${fullLabel(d.start)}: ${d.ok} berhasil, ${d.fail} gagal">
        <div class="bs-col-stack" style="height:${(tot / top) * 100}%">${d.fail ? `<span class="bs-seg-bad" style="flex:${d.fail}"></span>` : ''}${d.ok ? `<span class="bs-seg-good" style="flex:${d.ok}"></span>` : ''}</div>
        <div class="bs-tip" role="tooltip"><strong>${fullLabel(d.start)}</strong><span><i class="good"></i>Berhasil <b>${fmtNum(d.ok)}</b></span><span><i class="bad"></i>Gagal <b>${fmtNum(d.fail)}</b></span></div>
        <small>${dayLabel(d.start)}</small></div>`;
    }).join('');
    return `<div class="bs-legend"><span><i class="good"></i>Berhasil</span><span><i class="bad"></i>Gagal</span></div>
      <div class="bs-chart"><div class="bs-axis">${ticks.map(t => `<span>${fmtNum(t)}</span>`).join('')}</div><div class="bs-plot">${cols}</div></div>
      <details class="bs-table-toggle"><summary>Lihat sebagai tabel</summary>${table(['Hari', 'Berhasil', 'Gagal'], daily.map(d => `<tr><td>${fullLabel(d.start)}</td><td>${fmtNum(d.ok)}</td><td>${fmtNum(d.fail)}</td></tr>`))}</details>`;
  }
  function timeline(entries) {
    if (!entries.length) return emptyState('Belum ada aktivitas', 'Aktivitas akan muncul di sini.', '', 'history');
    return `<ol class="bs-timeline">${entries.map(a => `<li><span class="bs-avatar sm" data-actor="${a.actor}" aria-hidden="true">${a.actor === 'Eksternal' ? '@' : initials(a.user)}</span><div><p><strong>${esc(a.user)}</strong> ${esc(a.action.toLowerCase())}${a.target ? ` <button type="button" class="bs-inline-link" data-action="open-target" data-id="${esc(a.target)}">${esc(locName(a.target))}</button>` : ''}</p><small>${esc(a.module)} · <time title="${fmtDate(a.time)}">${fmtRel(a.time)}</time>${a.actor === 'Eksternal' ? ' · ' + badge('Eksternal') : ''}</small></div></li>`).join('')}</ol>`;
  }
  function viewDashboard() {
    const L = state.locations, im = issueMap(), dups = duplicatePairs();
    const verified = L.filter(l => l.gbp === 'Terverifikasi').length;
    const pend = state.approvals.filter(a => a.status === 'Menunggu').length;
    const fails = openFailures().length, claimsN = state.claims.filter(claimActive).length;
    const sla = slaStats(), daily = dailySync(7);
    const okSum = sum(daily.map(d => d.ok)), failSum = sum(daily.map(d => d.fail)), rate = pct(okSum, okSum + failSum);
    const metrics = [
      metric({ label: 'Total unit kerja', value: fmtNum(L.length), note: TYPES.map(t => `${fmtNum(L.filter(l => l.type === t).length)} ${t === 'Kantor Cabang' ? 'KC' : t}`).join(' · '), icon: 'building', view: 'locations' }),
      metric({ label: 'Terverifikasi di Google', value: pct(verified, L.length) + '%', note: `${fmtNum(verified)} dari ${fmtNum(L.length)} listing`, icon: 'shield', view: 'claims' }),
      metric({ label: 'Sync berhasil · 7 hari', value: rate + '%', note: `${fmtNum(okSum + failSum)} pembaruan`, spark: daily.map(d => pct(d.ok, d.ok + d.fail)), tone: rate < 95 ? 'warn' : 'good', view: 'sync' }),
      metric({ label: 'Kepatuhan SLA internal', value: sla.compliance + '%', note: `Target ≤ ${state.settings.slaInternal} jam`, icon: 'gauge', tone: sla.compliance < 80 ? 'warn' : '', view: 'sla' })
    ].join('');
    const queue = [
      { n: pend, icon: 'inbox', tone: 'warn', title: 'Edit dari email GBP lain', text: 'Data tetap aman sampai Anda menyetujui.', view: 'approvals', cta: 'Tinjau' },
      { n: fails, icon: 'refresh', tone: 'bad', title: 'Gagal disinkronkan', text: 'Coba ulang atau catat tindak lanjut.', view: 'sync', cta: 'Tangani' },
      { n: im.size, icon: 'alert', tone: 'warn', title: 'Berbeda dengan Google Maps', text: 'Pilih sumber data yang benar.', view: 'discrepancies', cta: 'Bandingkan' },
      { n: dups.length, icon: 'copy', tone: 'info', title: 'Kemungkinan titik ganda', text: 'Gabungkan atau tandai bukan duplikat.', view: 'duplicates', cta: 'Periksa' },
      { n: claimsN, icon: 'shield', tone: 'info', title: 'Klaim & titik baru berjalan', text: `${sla.atRisk} mendekati atau lewat SLA.`, view: 'claims', cta: 'Pantau' },
      { n: state.reviews.filter(rv => !rv.reply).length, icon: 'chat', tone: 'info', title: 'Ulasan Google belum dibalas', text: `${state.reviews.filter(rv => !rv.reply && rv.rating <= 2).length} di antaranya ulasan negatif (1–2★).`, view: 'reviews', cta: 'Balas' }
    ].filter(q => q.n);
    const queueHtml = queue.length
      ? `<ul class="bs-queue">${queue.map(q => `<li data-tone="${q.tone}"><span class="bs-queue-ic">${ic(q.icon)}</span><div><strong>${fmtNum(q.n)} ${q.title}</strong><p>${q.text}</p></div>${go(q.cta, q.view, 'sm')}</li>`).join('')}</ul>`
      : emptyState('Semua beres', 'Tidak ada pekerjaan yang menunggu tindakan.');
    const statusRows = STATUSES.map(s => [s, L.filter(l => l.status === s).length]);
    const onlinePct = pct(statusRows[0][1], L.length);
    const dist = `<div class="bs-health"><div><strong>${onlinePct}%</strong><span>unit online</span></div>
        <div class="bs-health-bar" role="img" aria-label="${statusRows.map(([s, n]) => `${s} ${n}`).join(', ')}">${statusRows.map(([s, n]) => n ? `<span data-status="${esc(s)}" style="flex:${n}"></span>` : '').join('')}</div></div>
      <div class="bs-status-list">${statusRows.map(([s, n]) => `<button type="button" class="bs-status-row" data-action="goto-filter" data-id="status:${esc(s)}"><i data-status="${esc(s)}" aria-hidden="true"></i><span>${esc(s)}</span><strong>${fmtNum(n)}</strong><small>${pct(n, L.length)}%</small>${ic('chev')}</button>`).join('')}</div>`;
    const regionRows = REGIONS.map(r => { const xs = L.filter(l => l.region === r); return { r, n: xs.length, on: xs.filter(l => l.status === 'Online').length, iss: xs.filter(l => im.has(l.code)).length }; }).filter(x => x.n).sort((a, b) => b.n - a.n);
    const tiles = `<div class="bs-region-tiles">${regionRows.map(x => `<button type="button" class="bs-region-tile" data-action="goto-filter" data-id="region:${esc(x.r)}">
        <span class="bs-region-name">${esc(x.r)}</span><strong>${fmtNum(x.n)}</strong>
        <span class="bs-bar-track" role="img" aria-label="${x.on} dari ${x.n} online"><span style="width:${pct(x.on, x.n)}%"></span></span>
        <small>${pct(x.on, x.n)}% online${x.iss ? ` · <b>${x.iss} beda data</b>` : ''}</small></button>`).join('')}</div>`;
    return head(`Selamat datang, ${esc(ME.name.split(' ')[0])}`, `${fmtDate(Date.now(), { dateStyle: 'full' })} · Ringkasan ${fmtNum(L.length)} unit kerja di ${regionRows.length} region.`,
      btn('Impor data', 'import', { icon: 'upload' }) + btn(ui.running ? 'Menyinkronkan…' : 'Sinkronkan semua', 'sync-all', { icon: 'refresh', variant: 'primary', attrs: ui.running ? 'disabled' : '' })) +
      `<div class="bs-metrics">${metrics}</div>
      <div class="bs-grid bs-grid-main">${card('Perlu tindakan', queueHtml, { sub: 'Diurutkan dari yang paling mendesak' })}${card('Status operasional', dist, { sub: 'Klik status untuk melihat unitnya' })}</div>
      <div class="bs-grid bs-grid-main">${card('Pembaruan ke Google · 7 hari terakhir', syncChart(daily), { actions: go('Sync Monitor', 'sync') })}${card('Aktivitas terbaru', timeline(state.audit.slice(0, 5)), { actions: go('Semua riwayat', 'audit') })}</div>
      ${card('Sebaran per region', tiles, { sub: 'Klik region untuk melihat daftar unitnya', actions: go('Buka peta', 'map') })}`;
  }

  /* ------------------------------------------------------------------ *
   * View: Unit Kerja
   * ------------------------------------------------------------------ */
  const QUICK = [
    ['all', 'Semua', () => true],
    ['sync', 'Perlu sinkron', l => l.status === 'Belum Sync' || l.status === 'Offline'],
    ['issues', 'Beda dengan Google', l => issueMap().has(l.code)],
    ['unverified', 'Belum terverifikasi', l => l.gbp !== 'Terverifikasi'],
    ['inactive', 'Tidak aktif', l => l.status === 'Tidak Aktif']
  ];
  const FILTERS = [['status', 'Status operasional', STATUSES], ['gbp', 'Status GBP', GBP], ['type', 'Tipe', TYPES], ['region', 'Region', REGIONS]];
  /* ---------- Preferensi per pengguna (saved views, kolom, kepadatan) ---------- */
  const UPREF_KEY = 'branchSync.admin.userPrefs';
  let uprefsAll = {};
  try { uprefsAll = JSON.parse(localStorage.getItem(UPREF_KEY) || '{}') || {}; } catch (_) { uprefsAll = {}; }
  const userKey = () => `${isLive() ? `live:${MODE.host()}` : 'demo'}:${ME.email || ME.name}`;
  const up = () => (uprefsAll[userKey()] ||= { views: [], cols: null, density: 'comfortable' });
  const saveUP = () => { try { localStorage.setItem(UPREF_KEY, JSON.stringify(uprefsAll)); } catch (_) { toast('Preferensi tidak dapat disimpan di browser ini.', { tone: 'warn' }); } };
  const LOC_COLS = [
    { key: 'unit', label: 'Unit kerja', sort: 'name', required: true, cell: l => `<button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(l.code)}"><strong>${esc(l.name)}</strong><small>${esc(l.code)} · ${esc(l.type)}</small></button>` },
    { key: 'location', label: 'Lokasi', sort: 'city', cell: l => `${esc(l.city)}<small>${esc(l.province)}</small>` },
    { key: 'region', label: 'Region', sort: 'region', cell: l => esc(l.region) },
    { key: 'type', label: 'Tipe', sort: 'type', cell: l => esc(l.type) },
    { key: 'status', label: 'Status', sort: 'status', cell: l => badge(l.status) },
    { key: 'gbp', label: 'Status GBP', sort: 'gbp', cell: l => badge(l.gbp) },
    { key: 'google', label: 'Data Google', sort: 'issues', cell: (l, iss) => (iss ? `<button type="button" class="bs-issue" data-action="open-loc" data-id="${esc(l.code)}" data-tab="compare">${ic('alert')}${iss.length} beda</button>` : l.google ? `<span class="bs-ok">${ic('check')}Sesuai</span>` : '<span class="bs-muted">Belum ada listing</span>') },
    { key: 'phone', label: 'Telepon', cell: l => esc(l.phone || '—') },
    { key: 'hours', label: 'Jam operasional', wrap: true, cell: l => esc(l.hours || '—') },
    { key: 'address', label: 'Alamat', wrap: true, cell: l => esc(l.address || '—') },
    { key: 'lastSync', label: 'Sinkron terakhir', sort: 'lastSync', cell: l => (l.lastSync ? `<span title="${fmtDate(l.lastSync)}">${fmtRel(l.lastSync)}</span>` : '<span class="bs-muted">Belum pernah</span>') },
    { key: 'updated', label: 'Diperbarui', sort: 'updatedAt', cell: l => `<span title="${fmtDate(l.updatedAt)}">${fmtRel(l.updatedAt)}</span><small>${esc(l.updatedBy)}</small>` }
  ];
  const LOC_COLS_DEFAULT = ['unit', 'location', 'status', 'gbp', 'google', 'updated'];
  const visibleCols = () => { const c = up().cols; const set = new Set(Array.isArray(c) && c.length ? c : LOC_COLS_DEFAULT); return LOC_COLS.filter(x => x.required || set.has(x.key)); };
  const viewFilters = () => { const f = ui.loc; return { q: f.q.trim(), quick: f.quick, status: [...f.status].sort(), region: [...f.region].sort(), type: [...f.type].sort(), gbp: [...f.gbp].sort(), sort: f.sort, dir: f.dir }; };
  const sameFilters = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function filterSummary(v) {
    const parts = [];
    if (v.q) parts.push(`“${v.q}”`);
    if (v.quick && v.quick !== 'all') parts.push((QUICK.find(x => x[0] === v.quick) || ['', v.quick])[1]);
    FILTERS.forEach(([k]) => { if (v[k] && v[k].length) parts.push(v[k].join(', ')); });
    return parts.join(' · ') || 'Semua unit';
  }
  function locMatcher(v) {
    const q = (v.q || '').toLowerCase(), im = issueMap(), quick = (QUICK.find(x => x[0] === v.quick) || QUICK[0])[2];
    return l => (!q || `${l.name} ${l.code} ${l.city} ${l.province} ${l.address}`.toLowerCase().includes(q)) && FILTERS.every(([k]) => !(v[k] && v[k].length) || v[k].includes(l[k])) && quick(l, im);
  }
  const viewCount = v => memo(`vc:${JSON.stringify(v)}`, () => state.locations.filter(locMatcher(v)).length);
  function applySavedView(id) {
    const v = up().views.find(x => x.id === id); if (!v) return;
    Object.assign(ui.loc, { q: v.filters.q || '', quick: v.filters.quick || 'all', status: [...(v.filters.status || [])], region: [...(v.filters.region || [])], type: [...(v.filters.type || [])], gbp: [...(v.filters.gbp || [])], sort: LOC_SORTS.includes(v.filters.sort) ? v.filters.sort : 'name', dir: v.filters.dir === -1 ? -1 : 1, page: 1 });
    ui.loc.selected.clear(); ui.pop = '';
    render();
  }
  function saveViewModal(id) {
    const ex = id ? up().views.find(x => x.id === id) : null;
    openModal(ex ? 'Ganti nama tampilan' : 'Simpan tampilan', formGrid([
      { name: 'name', label: 'Nama tampilan', value: ex ? ex.name : '', full: true, hint: 'Contoh: KCP Jawa bermasalah', attrs: 'required maxlength="60"' },
      ...(ex ? [] : [{ name: 'pin', label: 'Sematkan di tampilan cepat', type: 'checkbox', value: true, full: true }])
    ]) + (ex ? '' : `<p class="bs-form-help">Filter yang disimpan: <b>${esc(filterSummary(viewFilters()))}</b></p>`), {
      submit: ex ? 'Simpan nama' : 'Simpan tampilan',
      onSubmit: p => {
        const name = String(p.name || '').trim();
        if (!name) return { name: 'Wajib diisi.' };
        if (up().views.some(x => x !== ex && x.name.toLowerCase() === name.toLowerCase())) return { name: 'Nama tampilan sudah dipakai.' };
        if (ex) ex.name = name;
        else { if (up().views.length >= 20) return 'Maksimal 20 tampilan tersimpan.'; up().views.push({ id: `v${Date.now().toString(36)}`, name, pinned: !!p.pin, filters: viewFilters(), createdAt: Date.now() }); }
        saveUP();
        toast(ex ? 'Nama tampilan diperbarui.' : `Tampilan “${name}” disimpan.`, { tone: 'good' });
      }
    });
  }

  function locFiltered() {
    const f = ui.loc, q = f.q.trim().toLowerCase(), im = issueMap(), quick = (QUICK.find(x => x[0] === f.quick) || QUICK[0])[2];
    const xs = state.locations.filter(l =>
      (!q || `${l.name} ${l.code} ${l.city} ${l.province} ${l.address}`.toLowerCase().includes(q)) &&
      FILTERS.every(([k]) => !f[k].length || f[k].includes(l[k])) && quick(l));
    const k = f.sort, dir = f.dir;
    const val = l => (k === 'issues' ? im.get(l.code)?.length || 0 : k === 'lastSync' ? l.lastSync || 0 : l[k] ?? '');
    return xs.sort((a, b) => { const va = val(a), vb = val(b); return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'id', { numeric: true })) * dir; });
  }
  function viewLocations() {
    const f = ui.loc, all = locFiltered(), size = Number(prefs.pageSize) || 10, U = up(), cols = visibleCols(), dense = U.density === 'compact';
    const pages = Math.max(1, Math.ceil(all.length / size));
    f.page = Math.min(Math.max(1, f.page), pages);
    const rows = all.slice((f.page - 1) * size, f.page * size), im = issueMap();
    const activeFilters = FILTERS.flatMap(([k, l]) => f[k].map(v => [k, l, v]));
    const th = c => { if (!c.sort) return c.label; const on = f.sort === c.sort; return `<button type="button" class="bs-sort" data-action="sort" data-id="${c.sort}" aria-label="Urutkan menurut ${c.label}">${c.label}<span aria-hidden="true">${on ? (f.dir > 0 ? '↑' : '↓') : '↕'}</span></button>`; };
    const pageAllSel = rows.length && rows.every(l => f.selected.has(l.code));
    const headCells = [`<input type="checkbox" class="bs-check" data-action="select-page" aria-label="Pilih semua di halaman ini" ${pageAllSel ? 'checked' : ''}>`, ...cols.map(th), '<span class="bs-sr">Aksi</span>'];
    const body = rows.map(l => {
      const iss = im.get(l.code), sel = f.selected.has(l.code);
      return `<tr class="${sel ? 'is-selected' : ''}"><td class="bs-td-check"><input type="checkbox" class="bs-check" data-action="select" data-id="${esc(l.code)}" aria-label="Pilih ${esc(l.name)}" ${sel ? 'checked' : ''}></td>${cols.map(c => `<td${c.wrap ? ' class="bs-td-wrap"' : c.key === 'unit' ? ' class="bs-td-title"' : ''}>${c.cell(l, iss)}</td>`).join('')}<td class="bs-td-actions">${btn('', 'edit-loc', { id: l.code, icon: 'edit', variant: 'icon ghost', title: `Edit ${l.name}` })}</td></tr>`;
    });
    const cur = viewFilters(), pinned = U.views.filter(v => v.pinned), activeView = U.views.find(v => sameFilters(v.filters, cur));
    const quickCounts = QUICK.map(([v, l, fn]) => [v, l, memo(`quick:${v}`, () => state.locations.filter(x => fn(x, im)).length)]);
    const optCount = (k, v) => memo('optcounts', () => { const m = {}; state.locations.forEach(x => FILTERS.forEach(([kk]) => { const key = `${kk}:${x[kk]}`; m[key] = (m[key] || 0) + 1; })); return m; })[`${k}:${v}`] || 0;
    const filterPanel = `<details class="bs-filter" data-pop="filter" ${ui.pop === 'filter' ? 'open' : ''}><summary class="bs-btn">${ic('filter')}<span>Filter${activeFilters.length ? ` (${activeFilters.length})` : ''}</span></summary>
      <div class="bs-popover bs-filter-panel">${FILTERS.map(([k, l, xs]) => `<fieldset><legend>${l}</legend>${xs.map(v => `<label class="bs-checkline"><input type="checkbox" data-filter="${k}" value="${esc(v)}" ${f[k].includes(v) ? 'checked' : ''}><span>${esc(v)}</span><small>${fmtNum(optCount(k, v))}</small></label>`).join('')}</fieldset>`).join('')}
      <div class="bs-filter-foot">${btn('Hapus filter', 'clear-filters', { variant: 'sm ghost' })}${btn('Selesai', 'close-filter', { variant: 'sm primary' })}</div></div></details>`;
    const viewsPanel = `<details class="bs-filter" data-pop="views" ${ui.pop === 'views' ? 'open' : ''}><summary class="bs-btn${activeView ? ' is-current' : ''}">${ic('star')}<span>${activeView ? esc(activeView.name) : 'Tampilan'}</span>${ic('chevD')}</summary>
      <div class="bs-popover bs-views-panel"><div class="bs-pop-head"><strong>Tampilan tersimpan</strong><small>Simpan kombinasi filter untuk dipakai lagi</small></div>
        ${U.views.length ? `<ul class="bs-views-list">${U.views.map(v => `<li class="${activeView === v ? 'is-active' : ''}">
          <button type="button" class="bs-view-apply" data-action="view-apply" data-id="${esc(v.id)}"><strong>${esc(v.name)}</strong><small>${esc(filterSummary(v.filters))} · ${fmtNum(viewCount(v.filters))} unit</small></button>
          ${btn('', 'view-pin', { id: v.id, icon: 'pin', variant: `icon sm ghost${v.pinned ? ' is-on' : ''}`, title: v.pinned ? `Lepas sematan ${v.name}` : `Sematkan ${v.name}`, attrs: `aria-pressed="${v.pinned}"` })}${btn('', 'view-rename', { id: v.id, icon: 'edit', variant: 'icon sm ghost', title: `Ganti nama ${v.name}` })}${btn('', 'view-delete', { id: v.id, icon: 'trash', variant: 'icon sm ghost', title: `Hapus ${v.name}` })}</li>`).join('')}</ul>`
        : `<p class="bs-muted bs-pop-empty">Belum ada tampilan tersimpan. Atur filter, lalu klik “Simpan tampilan saat ini”.</p>`}
        <div class="bs-filter-foot">${btn('Simpan tampilan saat ini', 'view-save', { icon: 'plus', variant: 'sm primary', attrs: activeView ? 'disabled title="Filter ini sudah tersimpan"' : '' })}</div></div></details>`;
    const colsPanel = `<details class="bs-filter" data-pop="cols" ${ui.pop === 'cols' ? 'open' : ''}><summary class="bs-btn">${ic('sliders')}<span>Atur kolom</span></summary>
      <div class="bs-popover bs-cols-panel"><fieldset><legend>Tampilkan kolom</legend>${LOC_COLS.map(c => `<label class="bs-checkline"><input type="checkbox" data-col="${c.key}" ${cols.includes(c) ? 'checked' : ''} ${c.required ? 'disabled' : ''}><span>${esc(c.label)}</span>${c.required ? '<small>wajib</small>' : ''}</label>`).join('')}</fieldset>
        <fieldset><legend>Kepadatan baris</legend><label class="bs-checkline"><input type="radio" name="bs-density" data-density="comfortable" ${dense ? '' : 'checked'}><span>Longgar</span></label><label class="bs-checkline"><input type="radio" name="bs-density" data-density="compact" ${dense ? 'checked' : ''}><span>Padat</span></label></fieldset>
        <div class="bs-filter-foot">${btn('Reset ke default', 'cols-reset', { variant: 'sm ghost' })}${btn('Selesai', 'close-pop', { variant: 'sm primary' })}</div></div></details>`;
    const sortOpts = LOC_COLS.filter(c => c.sort).flatMap(c => [[`${c.sort}:1`, `${c.label} (naik)`], [`${c.sort}:-1`, `${c.label} (turun)`]]);
    const bulk = f.selected.size ? `<div class="bs-bulkbar" role="region" aria-label="Aksi massal">
      <strong>${fmtNum(f.selected.size)} dipilih</strong>
      ${f.selected.size < all.length ? btn(`Pilih semua ${fmtNum(all.length)} hasil`, 'select-all', { variant: 'sm ghost' }) : ''}
      <span class="bs-spacer"></span>
      <label class="bs-inline-select"><span class="bs-sr">Ubah status</span><select data-action-change="bulk-status" ${can('locations.write') ? '' : `disabled title="${esc(deniedMsg('locations.write'))}"`}><option value="">Ubah status…</option>${opts(STATUSES)}</select></label>
      ${btn('Sinkronkan', 'bulk-sync', { icon: 'refresh', variant: 'sm' })}${btn('Ekspor', 'bulk-export', { icon: 'download', variant: 'sm' })}${btn('Hapus', 'bulk-delete', { icon: 'trash', variant: 'sm danger' })}
      ${btn('', 'clear-selection', { icon: 'x', variant: 'sm icon ghost', title: 'Batalkan pilihan' })}</div>` : '';
    const pageBtns = [];
    for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - f.page) <= 1) pageBtns.push(p); else if (pageBtns[pageBtns.length - 1] !== '…') pageBtns.push('…');
    return head('Unit Kerja', navItem('locations').desc,
      btn('Impor CSV', 'import', { icon: 'upload' }) + btn('Ekspor', 'export-locs', { icon: 'download' }) + btn('Tambah unit', 'add-loc', { icon: 'plus', variant: 'primary' })) +
      `<section class="bs-card bs-loc-card${f.selected.size ? ' has-bulk' : ''}"><div class="bs-card-body flush">
        <div class="bs-segment" role="tablist" aria-label="Tampilan cepat">${quickCounts.map(([v, l, n]) => `<button type="button" role="tab" aria-selected="${f.quick === v && !activeView}" data-action="quick" data-id="${v}">${l}<span>${fmtNum(n)}</span></button>`).join('')}${pinned.map(v => `<button type="button" role="tab" class="bs-seg-pinned" aria-selected="${activeView === v}" data-action="view-apply" data-id="${esc(v.id)}">${ic('pin')}${esc(v.name)}<span>${fmtNum(viewCount(v.filters))}</span></button>`).join('')}</div>
        <div class="bs-toolbar bs-loc-toolbar">${searchF('loc.q', 'Cari unit kerja', f.q, 'Nama, kode, kota, provinsi, atau alamat…  ( / )', 'bsLocQ')}${filterPanel}${viewsPanel}${colsPanel}
</div>
        <div class="bs-loc-mobilebar bs-mobile-only"><label class="bs-field"><span>Urutkan</span><select data-action-change="loc-sort">${opts(sortOpts, `${f.sort}:${f.dir}`)}</select></label>
          <label class="bs-checkline bs-select-page"><input type="checkbox" class="bs-check" data-action="select-page" ${pageAllSel ? 'checked' : ''}><span>Pilih semua di halaman ini</span></label></div>
        ${activeFilters.length ? `<div class="bs-chips">${activeFilters.map(([k, l, v]) => `<button type="button" class="bs-chip" data-action="unfilter" data-id="${k}:${esc(v)}" aria-label="Hapus filter ${esc(l)}: ${esc(v)}"><span>${esc(l)}: <b>${esc(v)}</b></span>${ic('x')}</button>`).join('')}${btn('Hapus semua', 'clear-filters', { variant: 'sm ghost' })}</div>` : ''}
        ${bulk}
        ${table(headCells, body, `<div class="bs-empty-inline">${ic('search')}<strong>Tidak ada unit yang cocok</strong><span>Ubah kata kunci atau ${f.q || activeFilters.length || f.quick !== 'all' ? '<button type="button" class="bs-inline-link" data-action="clear-all">hapus semua filter</button>' : 'tambahkan unit baru'}.</span></div>`, { cls: `bs-table-scroll${dense ? ' is-dense' : ''}` })}
        <div class="bs-pagination">
          <span>Menampilkan <b>${all.length ? (f.page - 1) * size + 1 : 0}–${Math.min(f.page * size, all.length)}</b> dari <b>${fmtNum(all.length)}</b> unit</span>
          <label class="bs-inline-select"><span>Baris</span><select data-bind="prefs.pageSize">${opts([10, 25, 50, 100], size)}</select></label>
          <div class="bs-pager">${btn('', 'page', { id: f.page - 1, icon: 'chevL', variant: 'icon sm', title: 'Halaman sebelumnya', attrs: f.page <= 1 ? 'disabled' : '' })}${pageBtns.map(p => p === '…' ? '<span class="bs-ellipsis">…</span>' : `<button type="button" class="bs-btn sm${p === f.page ? ' is-current' : ''}" data-action="page" data-id="${p}" ${p === f.page ? 'aria-current="page"' : ''}>${p}</button>`).join('')}${btn('', 'page', { id: f.page + 1, icon: 'chev', variant: 'icon sm', title: 'Halaman berikutnya', attrs: f.page >= pages ? 'disabled' : '' })}</div>
        </div></div></section>`;
  }


  /* ------------------------------------------------------------------ *
   * View: Peta
   * ------------------------------------------------------------------ */
  let mapObj = null, mapLayer = null, mapMarkers = new Map();
  function mapFiltered() {
    const m = ui.map, q = m.q.trim().toLowerCase();
    return state.locations.filter(l => (!q || `${l.name} ${l.code} ${l.city} ${l.province}`.toLowerCase().includes(q)) && (!m.status || l.status === m.status) && (!m.region || l.region === m.region) && (!m.gbp || l.gbp === m.gbp));
  }
  function viewMap() {
    const m = ui.map;
    return head('Peta Unit Kerja', navItem('map').desc, btn('Buka daftar', 'nav', { id: 'locations', icon: 'building' })) +
      `<div class="bs-map-layout"><section class="bs-card bs-map-card"><div class="bs-card-body flush">
        <div class="bs-toolbar">${searchF('map.q', 'Cari di peta', m.q, 'Nama, kode, atau kota…', 'bsMapQ')}${selectF('map.status', 'Status', STATUSES, m.status)}${selectF('map.region', 'Region', REGIONS, m.region)}${selectF('map.gbp', 'Status GBP', GBP, m.gbp)}
          <label class="bs-switch"><input type="checkbox" data-bind="map.showGoogle" ${m.showGoogle ? 'checked' : ''}><span></span>Tampilkan selisih titik Google</label></div>
        <div id="bsMap" class="bs-map" role="application" aria-label="Peta unit kerja"></div>
        <div class="bs-map-legend">${STATUSES.map(s => `<span><i style="background:${MARKER[s]}"></i>${s}</span>`).join('')}<span><i class="hollow"></i>Titik di Google (beda)</span></div>
      </div></section>
      <section class="bs-card bs-map-list"><header class="bs-card-head"><div><h2 id="bsMapCount"></h2><p>Klik untuk menuju lokasi</p></div></header><div class="bs-card-body flush"><ol id="bsMapList" class="bs-list"></ol></div></section></div>`;
  }
  function mountMap() {
    if (mapObj) { mapObj.remove(); mapObj = null; }
    const el = $('bsMap');
    if (!el) return;
    if (typeof L === 'undefined') { el.innerHTML = `<div class="bs-map-fallback">${ic('map')}<p>Peta tidak dapat dimuat. Periksa koneksi internet Anda.</p></div>`; updateMap(false); return; }
    mapObj = L.map(el, { preferCanvas: true, zoomControl: true }).setView([-2.5, 118], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(mapObj);
    mapLayer = L.layerGroup().addTo(mapObj);
    mapObj.on('popupopen', e => {
      const node = e.popup.getElement();
      node?.addEventListener('click', ev => { const b = ev.target.closest('[data-action="open-loc"]'); if (b) openDrawer(b.dataset.id); });
    });
    updateMap(true);
    setTimeout(() => mapObj && mapObj.invalidateSize(), 60);
  }
  function updateMap(fit) {
    const xs = mapFiltered(), im = issueMap();
    if ($('bsMapCount')) $('bsMapCount').textContent = `${fmtNum(xs.length)} unit ditampilkan`;
    if ($('bsMapList')) {
      $('bsMapList').innerHTML = xs.slice(0, 300).map(l => `<li><button type="button" data-action="map-focus" data-id="${esc(l.code)}"><i style="background:${MARKER[l.status]}" aria-hidden="true"></i><span><strong>${esc(l.name)}</strong><small>${esc(l.code)} · ${esc(l.city)}</small></span>${im.has(l.code) ? `<span class="bs-issue sm" title="Beda dengan Google">${ic('alert')}</span>` : ''}</button></li>`).join('') +
        (xs.length > 300 ? `<li class="bs-list-more">+${fmtNum(xs.length - 300)} unit lain — persempit pencarian</li>` : '') ||
        `<li class="bs-list-more">Tidak ada unit yang cocok.</li>`;
    }
    if (!mapObj) return;
    mapLayer.clearLayers(); mapMarkers = new Map();
    xs.forEach(l => {
      const mk = L.circleMarker([l.lat, l.lng], { radius: 7, color: '#fff', weight: 2, fillColor: MARKER[l.status], fillOpacity: 1 })
        .bindPopup(`<div class="bs-popup"><strong>${esc(l.name)}</strong><span>${esc(l.code)} · ${esc(l.type)}</span><span>${esc(l.address)}</span><span>Status: ${esc(l.status)} · GBP: ${esc(l.gbp)}</span><button type="button" data-action="open-loc" data-id="${esc(l.code)}">Lihat detail →</button></div>`);
      mk.addTo(mapLayer); mapMarkers.set(l.code, mk);
      const coord = (im.get(l.code) || []).find(i => i.field === 'coords');
      if (ui.map.showGoogle && coord) {
        L.polyline([[l.lat, l.lng], [l.google.lat, l.google.lng]], { color: '#e0660f', weight: 2, dashArray: '4 4' }).addTo(mapLayer);
        L.circleMarker([l.google.lat, l.google.lng], { radius: 6, color: '#e0660f', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`Titik Google · selisih ${fmtDist(coord.dist)}`).addTo(mapLayer);
      }
    });
    if (fit && xs.length) mapObj.fitBounds(L.latLngBounds(xs.map(l => [l.lat, l.lng])), { padding: [30, 30], maxZoom: 13 });
  }

  /* ------------------------------------------------------------------ *
   * View: Ketidaksesuaian
   * ------------------------------------------------------------------ */
  function discRows() {
    const q = ui.disc.q.trim().toLowerCase(), out = [];
    issueMap().forEach((iss, code) => {
      const l = byCode().get(code);
      if (q && !`${l.name} ${l.code} ${l.city}`.toLowerCase().includes(q)) return;
      iss.forEach(i => { if (!ui.disc.field || i.field === ui.disc.field) out.push({ l, ...i }); });
    });
    return out;
  }
  function viewDiscrepancies() {
    const rows = discRows(), total = sum([...issueMap().values()].map(x => x.length));
    const byField = Object.keys(FIELD_LABEL).slice(0, 5).map(f => [f, sum([...issueMap().values()].map(x => x.filter(i => i.field === f).length))]);
    const body = rows.map(r => {
      const key = `${r.l.code}|${r.field}`, note = state.discNotes[key];
      return `<tr><td><button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(r.l.code)}" data-tab="compare"><strong>${esc(r.l.name)}</strong><small>${esc(r.l.code)} · ${esc(r.l.city)}</small></button></td>
        <td>${FIELD_LABEL[r.field]}${r.dist ? `<small>selisih ${fmtDist(r.dist)}</small>` : ''}</td>
        <td class="bs-td-wrap"><span class="bs-val dash">${esc(r.dash)}</span></td>
        <td class="bs-td-wrap"><span class="bs-val google">${esc(r.google)}</span></td>
        <td class="bs-td-wrap">${note ? `<span class="bs-note" title="${esc(note.by)} · ${fmtDate(note.time)}">${ic('note')}${esc(note.text)}</span>` : '<span class="bs-muted">—</span>'}</td>
        <td class="bs-td-actions">${btn('Pakai Dashboard', 'disc-push', { id: key, variant: 'sm', title: 'Kirim data Dashboard ke Google' })}${btn('Pakai Google', 'disc-pull', { id: key, variant: 'sm ghost', title: 'Salin data Google ke Dashboard' })}${btn('', 'disc-note', { id: key, icon: 'note', variant: 'sm icon ghost', title: 'Catat temuan' })}</td></tr>`;
    });
    return head('Ketidaksesuaian Data', navItem('discrepancies').desc,
      (isLive() ? '' : btn('Simulasikan perubahan di Google', 'simulate-google', { icon: 'zap' })) + btn('Unduh laporan', 'export-disc', { icon: 'download' }) + btn('Pakai Dashboard untuk semua', 'disc-push-all', { icon: 'upload', variant: 'primary', attrs: rows.length ? '' : 'disabled' })) +
      `<div class="bs-metrics bs-metrics-5">${byField.map(([f, n]) => metric({ label: FIELD_LABEL[f], value: fmtNum(n), note: n ? 'perbedaan' : 'sesuai', tone: n ? 'warn' : 'good' })).join('')}</div>` +
      card(`${fmtNum(total)} perbedaan pada ${fmtNum(issueMap().size)} unit`, `<div class="bs-toolbar">${searchF('disc.q', 'Cari unit', ui.disc.q, 'Nama, kode, atau kota…', 'bsDiscQ')}${selectF('disc.field', 'Kolom', Object.keys(FIELD_LABEL).slice(0, 5).map(f => [f, FIELD_LABEL[f]]), ui.disc.field)}</div>` +
        (rows.length ? table(['Unit kerja', 'Kolom', 'Di Dashboard', 'Di Google Maps', 'Catatan', '<span class="bs-sr">Aksi</span>'], body) : emptyState('Data sudah sesuai', 'Tidak ada perbedaan antara Dashboard dan Google Maps untuk filter ini.')),
      { sub: '“Pakai Dashboard” mengirim data BRI ke Google. “Pakai Google” memperbarui Dashboard. Setiap keputusan tercatat di Riwayat.' });
  }

  /* ------------------------------------------------------------------ *
   * View: Duplikat
   * ------------------------------------------------------------------ */
  function viewDuplicates() {
    const pairs = duplicatePairs();
    const side = (l, keep) => `<div class="bs-dup-side"><button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(l.code)}"><strong>${esc(l.name)}</strong><small>${esc(l.code)} · ${esc(l.type)}</small></button>
      ${kv([['Alamat', esc(l.address)], ['Telepon', esc(l.phone)], ['Status', badge(l.status)], ['GBP', badge(l.gbp)], ['Diperbarui', fmtRel(l.updatedAt)]])}
      ${btn('Pertahankan ini', 'dup-keep', { id: keep, icon: 'merge', variant: 'sm' })}</div>`;
    const list = pairs.map(p => `<article class="bs-dup">
      <header><span class="bs-score" data-high="${p.score >= 90}">${p.score}% mirip</span><span>${esc(p.reason)} · jarak ${fmtDist(p.d)}</span><span class="bs-spacer"></span>${btn('Bukan duplikat', 'dup-ignore', { id: p.key, variant: 'sm ghost' })}${btn('Laporkan ke Google', 'dup-report', { id: p.key, variant: 'sm ghost' })}</header>
      <div class="bs-dup-grid">${side(p.a, `${p.key}|a`)}<div class="bs-dup-vs" aria-hidden="true">vs</div>${side(p.b, `${p.key}|b`)}</div></article>`).join('');
    return head('Duplikat Titik Lokasi', navItem('duplicates').desc, btn('Atur radius deteksi', 'nav', { id: 'settings', icon: 'sliders' })) +
      `<div class="bs-callout">${ic('info')}<p>Deteksi otomatis memakai <b>kemiripan nama</b> (dalam 2 km) dan <b>tipe sama dalam radius ${state.settings.dupRadius} m</b>. “Pertahankan ini” akan menonaktifkan unit lainnya dan menandainya <i>Duplikat</i>. Anda bisa membatalkannya.</p></div>` +
      (pairs.length ? `<div class="bs-stack">${list}</div>` : card('Tidak ada duplikat', emptyState('Tidak ada titik ganda', 'Semua unit kerja memiliki titik yang unik.')));
  }

  /* ------------------------------------------------------------------ *
   * View: Klaim & Titik Baru
   * ------------------------------------------------------------------ */
  function stepper(c) {
    const idx = c.status === 'Ditolak' ? -1 : STEPS.indexOf(c.status);
    return `<div class="bs-steps" aria-label="Tahap: ${esc(c.status)}">${STEPS.map((s, i) => `<span class="${c.status === 'Ditolak' ? 'is-rejected' : i < idx || c.status === 'Selesai' ? 'is-done' : i === idx ? 'is-current' : ''}" title="${s}"></span>`).join('')}<small>${esc(c.status)}</small></div>`;
  }
  function viewClaims() {
    const t = ui.claims.tab, all = state.claims;
    const filt = { active: claimActive, done: c => c.status === 'Selesai', rejected: c => c.status === 'Ditolak', all: () => true }[t] || claimActive;
    const rows = all.filter(filt).sort((a, b) => b.submittedAt - a.submittedAt).map(c => {
      const tm = claimTimes(c), next = STEPS[STEPS.indexOf(c.status) + 1];
      return `<tr><td><strong>${esc(c.id)}</strong><small>${esc(c.kind)}</small></td>
        <td>${c.code ? `<button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(c.code)}"><strong>${esc(claimName(c))}</strong><small>${esc(c.code)}</small></button>` : `<strong>${esc(c.proposal.name)}</strong><small>Usulan · ${esc(c.proposal.city)}</small>`}</td>
        <td>${stepper(c)}${c.note ? `<small class="bs-note-line">${esc(c.note)}</small>` : ''}</td>
        <td>${fmtDur(tm.internal)}${tm.internalRunning ? ' <small>berjalan</small>' : ''}<small>${badge(tm.sla)}</small></td>
        <td>${tm.google == null ? '<span class="bs-muted">—</span>' : fmtDur(tm.google) + (tm.googleRunning ? ' <small>menunggu Google</small>' : '')}</td>
        <td><span title="${fmtDate(c.submittedAt)}">${fmtRel(c.submittedAt)}</span></td>
        <td class="bs-td-actions">${claimActive(c) ? btn(next === 'Selesai' ? 'Tandai selesai' : 'Lanjutkan', 'claim-next', { id: c.id, icon: 'arrowR', variant: 'sm', title: `Pindahkan ke tahap “${next}”` }) + btn('Tolak', 'claim-reject', { id: c.id, variant: 'sm ghost' }) : ''}</td></tr>`;
    });
    const count = fn => all.filter(fn).length;
    return head('Klaim & Titik Baru', navItem('claims').desc, btn('Ajukan klaim', 'claim-new', { icon: 'shield' }) + btn('Usulkan titik baru', 'point-new', { icon: 'pin', variant: 'primary' })) +
      `<div class="bs-explain">${[
        ['Get Verified', 'shield', 'Klaim kepemilikan listing yang belum terverifikasi, lalu verifikasi oleh Google.'],
        ['Suspend', 'alert', 'Ajukan banding beserta dokumen agar listing yang di-suspend dipulihkan.'],
        ['Duplicate', 'copy', 'Laporkan listing ganda ke Google agar digabung atau dihapus.'],
        ['Titik baru', 'pin', 'Usulkan lokasi baru. Sistem memeriksa duplikat sebelum diajukan.']
      ].map(([t2, i, d]) => `<div>${ic(i)}<strong>${t2}</strong><p>${d}</p></div>`).join('')}</div>` +
      card('Daftar permintaan', tabs('claims.tab', [['active', 'Berjalan', count(claimActive)], ['done', 'Selesai', count(c => c.status === 'Selesai')], ['rejected', 'Ditolak', count(c => c.status === 'Ditolak')], ['all', 'Semua', all.length]], t) +
        table(['ID / jenis', 'Unit kerja', 'Tahap', 'Proses internal', 'Verifikasi Google', 'Diajukan', '<span class="bs-sr">Aksi</span>'], rows, 'Tidak ada permintaan di tab ini.'),
      { sub: `Target proses internal ≤ ${state.settings.slaInternal} jam. Waktu verifikasi Google dihitung terpisah.` });
  }

  /* ------------------------------------------------------------------ *
   * View: Persetujuan Edit
   * ------------------------------------------------------------------ */
  function viewApprovals() {
    const pending = state.approvals.filter(a => a.status === 'Menunggu'), done = state.approvals.filter(a => a.status !== 'Menunggu');
    const t = ui.approvals.tab;
    const cards = pending.map(a => `<article class="bs-approval">
      <header><span class="bs-avatar sm" data-actor="Eksternal" aria-hidden="true">@</span><div><strong>${esc(a.by)}</strong><small>Email GBP tidak dikenal · ${fmtRel(a.time)} · ${esc(a.id)}</small></div>${badge('Menunggu')}</header>
      <p>Mengusulkan perubahan <b>${FIELD_LABEL[a.field]}</b> pada <button type="button" class="bs-inline-link" data-action="open-loc" data-id="${esc(a.code)}">${esc(locName(a.code))}</button></p>
      ${diffList([{ field: FIELD_LABEL[a.field], before: a.before, after: a.after }])}
      <footer>${btn('Tolak', 'cr-reject', { id: a.id, icon: 'x' })}${btn('Setujui', 'cr-approve', { id: a.id, icon: 'check', variant: 'primary' })}</footer></article>`).join('');
    const hist = done.sort((a, b) => b.decidedAt - a.decidedAt).map(a => `<tr><td><strong>${esc(a.id)}</strong><small>${fmtDate(a.time)}</small></td><td>${esc(locName(a.code))}<small>${FIELD_LABEL[a.field]}</small></td><td class="bs-td-wrap">${diffList([{ field: '', before: a.before, after: a.after }])}</td><td>${esc(a.by)}</td><td>${badge(a.status)}<small>${esc(a.decidedBy)} · ${fmtRel(a.decidedAt)}</small></td></tr>`);
    return head('Persetujuan Edit', navItem('approvals').desc, (isLive() ? btn('Muat ulang', 'live-retry', { icon: 'refresh' }) : btn('Simulasikan edit masuk', 'simulate-edit', { icon: 'zap' }))) +
      `<div class="bs-callout" data-tone="good">${ic('shield')}<p>Perubahan dari email GBP lain <b>tidak diterapkan</b> sampai BRI menyetujuinya. Jika ditolak, data unit kerja tetap seperti semula.</p></div>` +
      tabs('approvals.tab', [['pending', 'Menunggu', pending.length], ['history', 'Riwayat keputusan', done.length]], t) +
      (t === 'pending'
        ? (pending.length ? `<div class="bs-approval-grid">${cards}</div>` : card('Tidak ada permintaan', emptyState('Kotak masuk kosong', 'Tidak ada edit eksternal yang menunggu persetujuan.', '', 'inbox')))
        : card('Riwayat keputusan', table(['ID', 'Unit / kolom', 'Perubahan', 'Diajukan oleh', 'Keputusan'], hist), { flush: false }));
  }

  /* ------------------------------------------------------------------ *
   * View: Sync Monitor
   * ------------------------------------------------------------------ */
  function viewSync() {
    const fails = openFailures(), daily = dailySync(7), runs = state.runs;
    const ok = sum(daily.map(d => d.ok)), fl = sum(daily.map(d => d.fail));
    const avgDur = runs.length ? sum(runs.slice(0, 20).map(r => r.durationMs)) / Math.min(20, runs.length) : 0;
    const prog = ui.running && ui.running.indeterminate ? `<div class="bs-progress is-indeterminate" role="progressbar" aria-label="Server sedang menyinkronkan"><span></span></div><p class="bs-muted">Server sedang menyinkronkan ${fmtNum(ui.running.total)} unit…</p>` : ui.running ? `<div class="bs-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${ui.running.total}" aria-valuenow="${ui.running.done}" aria-label="Kemajuan sinkronisasi"><span style="width:${pct(ui.running.done, ui.running.total)}%"></span></div><p class="bs-muted">Memproses ${fmtNum(ui.running.done)} dari ${fmtNum(ui.running.total)} unit…</p>` : '';
    const failRows = fails.map(f => `<tr><td><button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(f.code)}" data-tab="sync"><strong>${esc(locName(f.code))}</strong><small>${esc(f.code)}</small></button></td><td class="bs-td-wrap">${esc(f.reason)}</td><td>${esc(f.run)}<small>${fmtRel(f.time)}</small></td>
      <td class="bs-td-actions">${btn('Coba lagi', 'retry', { id: f.code, icon: 'refresh', variant: 'sm', attrs: ui.running ? 'disabled' : '' })}${btn('Tindak lanjut', 'resolve', { id: f.code, icon: 'note', variant: 'sm ghost' })}</td></tr>`);
    const runRows = runs.slice(0, 50).map(r => `<tr><td><strong>${esc(r.id)}</strong><small>${esc(r.scope)}</small></td><td>${fmtDate(r.time)}<small>${esc(r.by)}</small></td><td>${fmtNum(r.total)}</td><td>${badge('Berhasil', fmtNum(r.ok))}</td><td>${r.fail ? badge('Gagal', fmtNum(r.fail)) : '0'}</td><td>${fmtNum(r.skip)}</td><td>${fmtDur(r.durationMs < MIN ? MIN : r.durationMs)}</td></tr>`);
    return head('Sync Monitor', navItem('sync').desc, btn(ui.running ? 'Menyinkronkan…' : 'Sinkronkan semua', 'sync-all', { icon: 'refresh', variant: 'primary', attrs: ui.running ? 'disabled' : '' })) + prog +
      `<div class="bs-metrics">${[
        metric({ label: 'Tingkat keberhasilan · 7 hari', value: pct(ok, ok + fl) + '%', note: `${fmtNum(ok)} berhasil · ${fmtNum(fl)} gagal`, spark: daily.map(d => pct(d.ok, d.ok + d.fail)), tone: pct(ok, ok + fl) < 95 ? 'warn' : 'good' }),
        metric({ label: 'Belum ditangani', value: fmtNum(fails.length), note: 'unit gagal diperbarui', tone: fails.length ? 'bad' : 'good', icon: 'alert' }),
        metric({ label: 'Rata-rata durasi job', value: fmtDur(Math.max(MIN, avgDur)), note: '20 job terakhir', icon: 'gauge' }),
        metric({ label: 'Sisa kuota API', value: fmtNum(state.api.quotaLimit - state.api.quotaUsed), note: `dari ${fmtNum(state.api.quotaLimit)} per hari`, icon: 'plug', view: 'integrations' })
      ].join('')}</div>` +
      card('Detail sinkronisasi', tabs('sync.tab', [['failures', 'Kegagalan', fails.length], ['runs', 'Riwayat job', runs.length]], ui.sync.tab) +
        (ui.sync.tab === 'failures'
          ? (fails.length ? `<div class="bs-table-actions">${btn(`Coba lagi semua (${fails.length})`, 'retry-all', { icon: 'refresh', variant: 'sm', attrs: ui.running ? 'disabled' : '' })}</div>` + table(['Unit kerja', 'Penyebab', 'Job', '<span class="bs-sr">Aksi</span>'], failRows) : emptyState('Tidak ada kegagalan', 'Semua unit berhasil diperbarui pada job terakhir.'))
          : table(['Job', 'Waktu', 'Total', 'Berhasil', 'Gagal', 'Dilewati', 'Durasi'], runRows)));
  }

  /* ------------------------------------------------------------------ *
   * View: Riwayat Perubahan
   * ------------------------------------------------------------------ */
  function auditFiltered() {
    const a = ui.audit, q = a.q.trim().toLowerCase(), since = a.range ? Date.now() - Number(a.range) * DAY : 0;
    return state.audit.filter(x => x.time >= since && (!a.module || x.module === a.module) && (!a.actor || x.actor === a.actor) &&
      (!q || `${x.user} ${x.action} ${x.target} ${locName(x.target)} ${x.detail} ${x.changes.map(c => `${c.before} ${c.after}`).join(' ')}`.toLowerCase().includes(q)));
  }
  function viewAudit() {
    const xs = auditFiltered(), a = ui.audit, modules = [...new Set(state.audit.map(x => x.module))].sort();
    const rows = xs.slice(0, 200).map(x => `<tr><td><span title="${fmtDate(x.time)}">${fmtDate(x.time, { dateStyle: 'short', timeStyle: 'short' })}</span><small>${fmtRel(x.time)}</small></td>
      <td><span class="bs-user"><span class="bs-avatar sm" data-actor="${x.actor}" aria-hidden="true">${x.actor === 'Eksternal' ? '@' : initials(x.user)}</span><span>${esc(x.user)}<small>${badge(x.actor)}</small></span></span></td>
      <td>${esc(x.module)}</td><td><strong>${esc(x.action)}</strong>${x.target ? `<small><button type="button" class="bs-inline-link" data-action="open-target" data-id="${esc(x.target)}">${esc(locName(x.target))}</button></small>` : ''}${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</td>
      <td class="bs-td-wrap">${x.changes.length ? `<details class="bs-changes"><summary>${x.changes.length} perubahan</summary>${diffList(x.changes)}</details>` : '<span class="bs-muted">—</span>'}</td></tr>`);
    return head('Riwayat Perubahan', navItem('audit').desc, btn('Ekspor CSV', 'export-audit', { icon: 'download' })) +
      card(`${fmtNum(xs.length)} aktivitas`, `<div class="bs-toolbar">${searchF('audit.q', 'Cari', a.q, 'Pengguna, unit, nilai sebelum/sesudah…', 'bsAuditQ')}${selectF('audit.module', 'Modul', modules, a.module)}${selectF('audit.actor', 'Pengguna', [['Internal', 'Internal BRI'], ['Eksternal', 'Eksternal (email lain)']], a.actor)}${selectF('audit.range', 'Periode', [['1', '24 jam'], ['7', '7 hari'], ['30', '30 hari']], a.range, 'Semua waktu')}</div>` +
        table(['Waktu', 'Pengguna', 'Modul', 'Aksi', 'Sebelum → sesudah'], rows, 'Tidak ada aktivitas untuk filter ini.', { cls: 'bs-table-scroll' }) + (xs.length > 200 ? `<p class="bs-muted bs-pad">Menampilkan 200 terbaru. Ekspor CSV untuk melihat semuanya.</p>` : ''));
  }

  /* ------------------------------------------------------------------ *
   * View: SLA & Kinerja
   * ------------------------------------------------------------------ */
  function viewSla() {
    const s = slaStats(), rows = [...s.rows].sort((a, b) => b.c.submittedAt - a.c.submittedAt);
    const maxT = Math.max(HOUR, ...rows.map(x => x.t.internal + (x.t.google || 0)));
    const limitPct = Math.min(100, ((state.settings.slaInternal * HOUR) / maxT) * 100);
    const chart = `<div class="bs-legend"><span><i class="s1"></i>Proses internal BRI</span><span><i class="s2"></i>Verifikasi Google</span><span><i class="limit"></i>Target internal (${state.settings.slaInternal} jam)</span></div>
      <div class="bs-hbars">${rows.map(({ c, t }) => `<div class="bs-hbar" tabindex="0" aria-label="${esc(c.id)}: internal ${fmtDur(t.internal)}, Google ${fmtDur(t.google)}">
        <span class="bs-hbar-label"><strong>${esc(c.id)}</strong><small>${esc(claimName(c))}</small></span>
        <span class="bs-hbar-track"><span class="s1" style="width:${(t.internal / maxT) * 100}%"></span>${t.google ? `<span class="s2" style="width:${(t.google / maxT) * 100}%"></span>` : ''}<i class="bs-limit" style="left:${limitPct}%"></i></span>
        <span class="bs-hbar-val">${fmtDur(t.internal + (t.google || 0))}</span>
        <span class="bs-tip" role="tooltip"><strong>${esc(c.id)} · ${esc(c.kind)}</strong><span><i class="s1"></i>Internal <b>${fmtDur(t.internal)}${t.internalRunning ? ' (berjalan)' : ''}</b></span><span><i class="s2"></i>Google <b>${fmtDur(t.google)}${t.googleRunning ? ' (berjalan)' : ''}</b></span></span></div>`).join('')}</div>`;
    const tableRows = rows.map(({ c, t }) => `<tr><td><strong>${esc(c.id)}</strong><small>${esc(c.kind)}</small></td><td>${esc(claimName(c))}</td><td>${fmtDate(c.submittedAt, { dateStyle: 'short', timeStyle: 'short' })}</td><td>${fmtDur(t.internal)}${t.internalRunning ? '<small>berjalan</small>' : ''}</td><td>${fmtDur(t.google)}${t.googleRunning ? '<small>berjalan</small>' : ''}</td><td>${badge(t.sla)}</td><td>${badge(c.status)}</td></tr>`);
    return head('SLA & Kinerja', navItem('sla').desc, btn('Atur target SLA', 'nav', { id: 'settings', icon: 'sliders' }) + btn('Ekspor CSV', 'export-sla', { icon: 'download' })) +
      `<div class="bs-metrics">${[
        metric({ label: 'Rata-rata proses internal', value: fmtDur(s.avgInternal), note: `Target ≤ ${state.settings.slaInternal} jam`, icon: 'gauge', tone: s.avgInternal > state.settings.slaInternal * HOUR ? 'warn' : 'good' }),
        metric({ label: 'Rata-rata verifikasi Google', value: fmtDur(s.avgGoogle), note: `Acuan ${state.settings.slaGoogle} jam · di luar kendali BRI`, icon: 'shield' }),
        metric({ label: 'Kepatuhan SLA internal', value: s.compliance + '%', note: `${s.rows.length} permintaan dievaluasi`, tone: s.compliance < 80 ? 'warn' : 'good', icon: 'check' }),
        metric({ label: 'Berisiko / lewat SLA', value: fmtNum(s.atRisk), note: 'permintaan aktif', tone: s.atRisk ? 'bad' : 'good', icon: 'alert', view: 'claims' })
      ].join('')}</div>` +
      card('Waktu penyelesaian per permintaan', chart + `<details class="bs-table-toggle"><summary>Lihat sebagai tabel</summary>${table(['ID', 'Unit', 'Diajukan', 'Internal', 'Google', 'SLA', 'Status'], tableRows)}</details>`, { sub: 'Bagian biru = waktu tim BRI memproses. Bagian oranye = waktu menunggu Google.' });
  }

  /* ------------------------------------------------------------------ *
   * View: Pengguna & Akses
   * ------------------------------------------------------------------ */
  function viewAccess() {
    const t = ui.access.tab, q = ui.access.q.trim().toLowerCase();
    const users = state.users.filter(u => !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q));
    const userRows = users.map(u => `<tr><td><span class="bs-user"><span class="bs-avatar sm" aria-hidden="true">${initials(u.name)}</span><span><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></span></span></td><td>${esc(u.role)}</td><td>${badge(u.status)}</td><td>${fmtRel(u.lastActive)}</td>
      <td class="bs-td-actions">${btn('', 'edit-user', { id: u.id, icon: 'edit', variant: 'icon ghost sm', title: `Edit ${u.name}` })}${btn(u.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan', 'toggle-user', { id: u.id, variant: 'sm ghost', attrs: u.id === 1 ? 'disabled title="Akun Anda sendiri"' : '' })}</td></tr>`);
    const matrix = `<div class="bs-table-wrap" tabindex="0" role="region" aria-label="Matriks izin"><table class="bs-table bs-matrix"><thead><tr><th scope="col">Izin</th>${state.roles.map((r, i) => `<th scope="col">${esc(r.name)}<small>${state.users.filter(u => u.role === r.name).length} pengguna</small>${i ? btn('', 'edit-role', { id: r.name, icon: 'edit', variant: 'icon ghost sm', title: `Ubah nama ${r.name}` }) : ''}</th>`).join('')}</tr></thead><tbody>${PERMS.map(([p, l]) => `<tr><th scope="row">${l}<small>${p}</small></th>${state.roles.map((r, i) => `<td><input type="checkbox" class="bs-check" data-role="${i}" data-perm="${p}" aria-label="${esc(r.name)}: ${l}" ${r.permissions.includes(p) ? 'checked' : ''} ${i === 0 || !can('users.manage') ? 'disabled' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="bs-muted bs-pad">Administrator selalu memiliki semua izin agar workspace tidak terkunci. Pratinjau RBAC — tidak ada penegakan akses di backend.</p>`;
    return head('Pengguna & Akses', navItem('access').desc, t === 'users' ? btn('Tambah pengguna', 'add-user', { icon: 'plus', variant: 'primary' }) : btn('Tambah peran', 'add-role', { icon: 'plus', variant: 'primary' })) +
      tabs('access.tab', [['users', 'Pengguna', state.users.length], ['roles', 'Peran & izin', state.roles.length]], t) +
      (t === 'users' ? card('Pengguna', `<div class="bs-toolbar">${searchF('access.q', 'Cari pengguna', ui.access.q, 'Nama, email, atau peran…', 'bsUserQ')}</div>` + table(['Pengguna', 'Peran', 'Status', 'Aktif terakhir', '<span class="bs-sr">Aksi</span>'], userRows)) : card('Matriks izin', matrix, { sub: 'Centang untuk memberi izin. Perubahan langsung tersimpan dan tercatat di Riwayat.' }));
  }

  /* ------------------------------------------------------------------ *
   * View: Integrasi Google
   * ------------------------------------------------------------------ */
  const redirectUri = () => `${MODE.getBaseUrl() || 'https://<server-branchsync>'}/integrations/google/oauth/callback`;
  function gField({ name, label, value = '', type = 'text', hint = '', full = false, attrs = '', placeholder = '' }) {
    return `<div class="bs-field${full ? ' full' : ''}"><label for="g-${name}">${label}</label><input id="g-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-describedby="gh-${name}" ${attrs}><small class="bs-field-hint" id="gh-${name}" data-hint="${esc(hint)}">${hint}</small></div>`;
  }
  function viewIntegrations() {
    const a = state.api, used = pct(a.quotaUsed, a.quotaLimit), live = isLive(), accounts = state.accounts || [];
    const ready = !!(a.clientId && a.hasClientSecret && a.project);
    const acctRows = accounts.map(ac => {
      const locs = state.locations.filter(l => acctOf(l) === ac.id), codes = new Set(locs.map(l => l.code));
      const rvs = state.reviews.filter(rv => codes.has(rv.code)), un = rvs.filter(rv => !rv.reply).length;
      return `<tr><td><strong>${esc(ac.name)}</strong><small>${esc(ac.email || '')}</small></td><td><code>${esc(ac.accountId || ac.id)}</code></td><td>${fmtNum(locs.length)}</td><td>${fmtNum(rvs.length)}${un ? `<small>${badge('Menunggu', `${un} belum dibalas`)}</small>` : ''}</td><td class="bs-td-actions">${btn('Lihat ulasan', 'review-account', { id: ac.id, icon: 'star', variant: 'sm' })}</td></tr>`;
    });
    const statusCard = card('Koneksi Google Business Profile', `<div class="bs-integration"><span class="bs-g-mark" aria-hidden="true">G</span><div><strong>${a.connected ? 'Terhubung' : 'Belum terhubung'}</strong><small>${live ? `Token OAuth disimpan di server BranchSync (${esc(MODE.host())}).` : 'Mode Demo — koneksi disimulasikan, tidak ada permintaan ke Google.'}</small></div>${badge(a.connected ? 'Aktif' : 'Nonaktif', a.connected ? 'Terhubung' : 'Terputus')}</div>` +
      kv([['Akun utama', esc(a.account || '—')], ['Project Google Cloud', esc(a.project || '—')], ['Kredensial OAuth', ready ? badge('Berhasil', 'Lengkap') : badge('Menunggu', 'Belum lengkap')], ['Uji terakhir', a.lastTest ? fmtRel(a.lastTest) : '—']]) +
      `<div class="bs-btn-row">${a.connected ? btn('Putuskan', 'api-toggle', { icon: 'plug' }) : btn('Hubungkan akun Google', 'gbp-oauth', { icon: 'external', variant: 'primary' })}${btn('Uji koneksi', 'api-test', { icon: 'zap' })}</div>`);
    const quotaCard = card('Kuota API harian', `<div class="bs-quota"><strong>${fmtNum(a.quotaUsed)}</strong><span>dari ${fmtNum(a.quotaLimit)} permintaan (${used}%)</span></div>${bar(a.quotaUsed, a.quotaLimit, `Kuota terpakai ${used}%`)}<p class="bs-muted bs-gap">Setiap pembaruan unit atau balasan ulasan memakai 1 permintaan. Batas kuota diatur di bawah.</p>${live ? '' : btn('Reset kuota harian', 'api-reset', { variant: 'sm ghost' })}`);
    const secretPh = has => (has ? '•••••••• tersimpan — isi untuk mengganti' : 'Belum diisi');
    const form = `<form id="bsGoogleForm" novalidate><fieldset class="bs-fieldset-plain" ${can('settings.write') ? '' : 'disabled'}>
      <div class="bs-form-grid">
        ${gField({ name: 'project', label: 'Project ID Google Cloud', value: a.project, hint: 'Mis. bri-branchsync-prod', attrs: 'autocomplete="off" spellcheck="false"' })}
        ${gField({ name: 'account', label: 'Email akun utama GBP', value: a.account, type: 'email', hint: 'Akun yang memiliki/mengelola lokasi', attrs: 'autocomplete="off"' })}
        ${gField({ name: 'clientId', label: 'OAuth Client ID', value: a.clientId, full: true, placeholder: '1234567890-abc123.apps.googleusercontent.com', hint: 'Dari Google Cloud Console › APIs & Services › Credentials', attrs: 'autocomplete="off" spellcheck="false"' })}
        ${gField({ name: 'clientSecret', label: 'OAuth Client Secret', type: 'password', placeholder: secretPh(a.hasClientSecret), hint: live ? 'Dikirim ke server dan tidak pernah ditampilkan kembali.' : 'Mode Demo: rahasia tidak disimpan di browser.', attrs: 'autocomplete="new-password"' })}
        ${gField({ name: 'apiKey', label: 'API key (opsional)', type: 'password', placeholder: secretPh(a.hasApiKey), hint: 'Untuk Places/Maps API. Diawali "AIza".', attrs: 'autocomplete="new-password"' })}
        <div class="bs-field full"><span class="bs-field-label">Redirect URI (daftarkan di Google Cloud Console)</span><div class="bs-copy-row"><code id="bsRedirectUri">${esc(redirectUri())}</code>${btn('Salin', 'copy-redirect', { icon: 'copy', variant: 'sm' })}</div></div>
        <fieldset class="bs-fieldset full" aria-describedby="gh-scopes"><legend>Scope OAuth</legend>${GOOGLE_SCOPES.map(([id, label, tag]) => `<label class="bs-checkline"><input type="checkbox" name="scopes" value="${id}" ${a.scopes.includes(id) ? 'checked' : ''}><span>${label} <code>${id}</code></span><small>${tag}</small></label>`).join('')}<small class="bs-field-hint" id="gh-scopes" data-hint=""></small></fieldset>
        <div class="bs-field"><label for="g-syncInterval">Sinkronisasi otomatis</label><select id="g-syncInterval" name="syncInterval">${opts(SYNC_INTERVALS, a.syncInterval)}</select><small class="bs-field-hint">Termasuk menarik ulasan & perubahan dari Google.</small></div>
        ${gField({ name: 'quotaLimit', label: 'Batas kuota harian', value: a.quotaLimit, type: 'number', hint: 'Jumlah permintaan API per hari', attrs: 'min="100" max="1000000" step="1"' })}
        ${gField({ name: 'pubsubTopic', label: 'Topik Pub/Sub notifikasi (opsional)', value: a.pubsubTopic, full: true, placeholder: 'projects/bri-branchsync-prod/topics/gbp-notifications', hint: 'Agar ulasan baru & edit dari pihak lain langsung masuk.', attrs: 'spellcheck="false"' })}
        <label class="bs-switch-row full"><span><strong>Notifikasi edit dari email GBP lain</strong><small>Masukkan usulan perubahan ke Persetujuan Edit dan beri notifikasi.</small></span><span class="bs-switch"><input type="checkbox" name="webhook" ${a.webhook ? 'checked' : ''}><span></span></span></label>
      </div>
      <p class="bs-form-error" id="bsGoogleError" role="alert"></p>
      <div class="bs-form-actions">${btn('Uji koneksi', 'api-test', { icon: 'zap' })}<button type="submit" class="bs-btn primary">${ic('check')}<span>Simpan konfigurasi</span></button></div>
    </fieldset></form>`;
    return head('Integrasi Google', navItem('integrations').desc) +
      `<div class="bs-grid bs-grid-main">${statusCard}${quotaCard}</div>` +
      card('Kredensial & konfigurasi Google API', form, { sub: 'Diperlukan agar BranchSync dapat mengelola lokasi dan membalas ulasan atas nama BRI.' }) +
      card(`Akun Google Business Profile (${fmtNum(accounts.length)})`, accounts.length ? table(['Akun', 'Account ID', 'Lokasi', 'Ulasan', '<span class="bs-sr">Aksi</span>'], acctRows) : emptyState('Belum ada akun', 'Hubungkan akun Google untuk menampilkan akun dan lokasinya.', '', 'info'), { flush: !!accounts.length });
  }

  /* ------------------------------------------------------------------ *
   * View: Laporan & Analitik
   * ------------------------------------------------------------------ */
  const PERIODS = [['7', '7 hari terakhir'], ['30', '30 hari terakhir'], ['90', '90 hari terakhir']];
  const FREQ = { weekly: 'Mingguan', monthly: 'Bulanan' };
  const WEEKDAYS = [['1', 'Senin'], ['2', 'Selasa'], ['3', 'Rabu'], ['4', 'Kamis'], ['5', 'Jumat']];
  function reportScope() {
    const f = ui.report;
    const locs = state.locations.filter(l => (!f.region || l.region === f.region) && (!f.account || acctOf(l) === f.account) && (!f.type || l.type === f.type));
    return { locs, codes: new Set(locs.map(l => l.code)), filtered: !!(f.region || f.account || f.type) };
  }
  function reportBuckets(period) {
    const days = Number(period) || 30, size = days > 30 ? 7 : 1, n = Math.ceil(days / size);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = today.getTime() + DAY, list = [];
    for (let i = n - 1; i >= 0; i--) { const to = end - i * size * DAY; list.push({ from: to - size * DAY, to }); }
    return { list, size, from: list[0].from, to: end };
  }
  function reportMetrics(from, to, sc) {
    const inR = t => t != null && t >= from && t < to;
    const runs = state.runs.filter(r => inR(r.time)), active = sc.locs.filter(l => l.status !== 'Tidak Aktif').length;
    let ok = 0, fail = 0;
    runs.forEach(r => {
      if (!sc.filtered) { ok += r.ok; fail += r.fail; return; }
      const f2 = r.items.filter(i => i.status === 'Gagal' && sc.codes.has(i.code)).length;
      fail += f2; ok += Math.max(0, active - f2);
    });
    const rvs = state.reviews.filter(rv => inR(rv.time) && sc.codes.has(rv.code)), replied = rvs.filter(rv => rv.reply);
    const resp = replied.map(rv => rv.reply.time - rv.time).filter(x => x >= 0);
    const claims = state.claims.filter(c => inR(c.submittedAt) && c.status !== 'Ditolak' && (!sc.filtered || (c.code && sc.codes.has(c.code))));
    const audit = state.audit.filter(a => inR(a.time));
    const resolved = audit.filter(a => a.module === 'Ketidaksesuaian' && /^(Mengirim|Menerapkan)/.test(a.action) && (!sc.filtered || sc.codes.has(a.target))).length;
    return {
      runs, ok, fail, rate: ok + fail ? (ok / (ok + fail)) * 100 : null, rvs,
      avgRating: rvs.length ? sum(rvs.map(r => r.rating)) / rvs.length : null,
      replyRate: rvs.length ? (replied.length / rvs.length) * 100 : null,
      avgResp: resp.length ? sum(resp) / resp.length : null,
      claims, sla: claims.length ? (claims.filter(c => claimTimes(c).sla !== 'Lewat SLA').length / claims.length) * 100 : null,
      resolved, audit
    };
  }
  function kpiTile(label, cur, prev, { fmt, delta, better = 'up', icon = '' }) {
    const d = cur != null && prev != null ? cur - prev : null;
    const tone = d == null || Math.abs(d) < 1e-9 ? 'flat' : (d > 0) === (better === 'up') ? 'good' : 'bad';
    const arrow = d == null ? '' : d > 0 ? '▲' : d < 0 ? '▼' : '■';
    return `<article class="bs-metric bs-kpi"><div class="bs-metric-head"><span>${label}</span>${icon ? ic(icon) : ''}</div><div class="bs-metric-body"><div><strong>${cur == null ? '—' : fmt(cur)}</strong><small>${d == null ? 'Belum ada data pembanding' : `<span class="bs-delta" data-tone="${tone}">${arrow} ${delta(Math.abs(d))}</span> vs periode sebelumnya`}</small></div></div></article>`;
  }
  function columnChart(rows, { series, labelEvery = 1 }) {
    const max = Math.max(1, ...rows.map(r => sum(series.map(sr => r.values[sr.key] || 0))));
    const step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
    const cols = rows.map((r, i) => {
      const tot = sum(series.map(sr => r.values[sr.key] || 0)), edge = i < 2 ? ' edge-l' : i > rows.length - 3 ? ' edge-r' : '';
      return `<div class="bs-col${edge}" tabindex="0" aria-label="${esc(r.full)}: ${series.map(sr => `${sr.label} ${fmtNum(r.values[sr.key] || 0)}`).join(', ')}">
        <div class="bs-col-stack" style="height:${(tot / top) * 100}%">${[...series].reverse().map(sr => (r.values[sr.key] ? `<span class="${sr.cls}" style="flex:${r.values[sr.key]}"></span>` : '')).join('')}</div>
        <div class="bs-tip" role="tooltip"><strong>${esc(r.full)}</strong>${series.map(sr => `<span><i class="${sr.dot}"></i>${sr.label} <b>${fmtNum(r.values[sr.key] || 0)}</b></span>`).join('')}</div>
        <small>${i % labelEvery === 0 ? esc(r.label) : ''}</small></div>`;
    }).join('');
    return (series.length > 1 ? `<div class="bs-legend">${series.map(sr => `<span><i class="${sr.dot}"></i>${sr.label}</span>`).join('')}</div>` : '') +
      `<div class="bs-chart"><div class="bs-axis">${[top, top / 2, 0].map(t => `<span>${fmtNum(t)}</span>`).join('')}</div><div class="bs-plot bs-plot-dense">${cols}</div></div>` +
      `<details class="bs-table-toggle"><summary>Lihat sebagai tabel</summary>${table(['Periode', ...series.map(sr => sr.label)], rows.map(r => `<tr><td>${esc(r.full)}</td>${series.map(sr => `<td>${fmtNum(r.values[sr.key] || 0)}</td>`).join('')}</tr>`))}</details>`;
  }
  function lineChart(rows, { min = 1, max = 5, fmt = v => v.toFixed(1), labelEvery = 1, label = 'Nilai' }) {
    const n = rows.length, pts = rows.map((r, i) => (r.value == null ? null : [((i + 0.5) / n) * 100, 100 - ((r.value - min) / (max - min)) * 100]));
    const segs = []; let cur = [];
    pts.forEach(pt => { if (pt) cur.push(pt); else if (cur.length) { segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    const ticks = []; for (let v = max; v >= min; v--) ticks.push(v);
    return `<div class="bs-chart bs-line"><div class="bs-axis">${ticks.map(t => `<span>${t}</span>`).join('')}</div><div class="bs-plot bs-plot-dense">
      <svg class="bs-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${segs.map(sg => `<polyline points="${sg.map(pt => pt.map(x => x.toFixed(2)).join(',')).join(' ')}"/>`).join('')}</svg>
      ${rows.map((r, i) => `<div class="bs-col${i < 2 ? ' edge-l' : i > n - 3 ? ' edge-r' : ''}" tabindex="0" aria-label="${esc(r.full)}: ${r.value == null ? 'tidak ada data' : fmt(r.value)}">${r.value == null ? '' : `<i class="bs-pt" style="bottom:${((r.value - min) / (max - min)) * 100}%"></i>`}
        <div class="bs-tip" role="tooltip"><strong>${esc(r.full)}</strong><span><i class="s1"></i>${label} <b>${r.value == null ? '—' : fmt(r.value)}</b></span>${r.note ? `<span>${esc(r.note)}</span>` : ''}</div><small>${i % labelEvery === 0 ? esc(r.label) : ''}</small></div>`).join('')}
    </div></div><details class="bs-table-toggle"><summary>Lihat sebagai tabel</summary>${table(['Periode', label], rows.map(r => `<tr><td>${esc(r.full)}</td><td>${r.value == null ? '—' : fmt(r.value)}</td></tr>`))}</details>`;
  }
  const pctTxt = v => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)}%`;
  const ratingTxt = v => new Intl.NumberFormat(LOC(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  function composition(title, keys, counts) {
    const total = sum(keys.map(k => counts[k] || 0));
    return `<div class="bs-comp"><div class="bs-comp-head"><strong>${title}</strong><small>${fmtNum(total)} unit</small></div>
      <div class="bs-comp-bar" role="img" aria-label="${esc(title)}: ${keys.map(k => `${k} ${counts[k] || 0}`).join(', ')}">${keys.map(k => (counts[k] ? `<span data-tone="${TONE[k] || 'neutral'}" style="flex:${counts[k]}" title="${esc(k)}: ${counts[k]}"></span>` : '')).join('')}</div>
      <ul class="bs-comp-legend">${keys.map(k => `<li><i data-tone="${TONE[k] || 'neutral'}"></i><span>${esc(k)}</span><b>${fmtNum(counts[k] || 0)}</b><small>${pct(counts[k] || 0, total)}%</small></li>`).join('')}</ul></div>`;
  }
  function rankList(rows, emptyMsg, fixedMax) {
    if (!rows.length) return `<p class="bs-muted">${emptyMsg}</p>`;
    const max = fixedMax || Math.max(1, ...rows.map(r => r.n));
    return `<ol class="bs-rank${fixedMax ? ' is-rating' : ''}">${rows.map(r => `<li><div class="bs-rank-top"><span class="bs-rank-label">${r.label}</span><b>${r.value ?? fmtNum(r.n)}</b></div>${bar(r.n, max, `${r.plain || ''}: ${r.n}`)}${r.sub ? `<small>${r.sub}</small>` : ''}</li>`).join('')}</ol>`;
  }
  function viewReports() {
    const f = ui.report, sc = reportScope(), bk = reportBuckets(f.period), span = bk.to - bk.from;
    const cur = reportMetrics(bk.from, bk.to, sc), prev = reportMetrics(bk.from - span, bk.from, sc);
    const accounts = state.accounts || [];
    const dLabel = t => new Intl.DateTimeFormat(LOC(), { day: 'numeric', month: 'short' }).format(new Date(t));
    const fullLabel = b => (bk.size === 1 ? new Intl.DateTimeFormat(LOC(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(b.from)) : `${dLabel(b.from)} – ${dLabel(b.to - DAY)}`);
    const labelEvery = bk.list.length > 14 ? 5 : 1;
    // Tren sinkronisasi
    const syncRows = bk.list.map(b => { const m = reportMetrics(b.from, b.to, sc); return { label: dLabel(b.from), full: fullLabel(b), values: { ok: m.ok, fail: m.fail } }; });
    // Ulasan per minggu (selalu mingguan agar rata-rata stabil)
    const wk = []; for (let t = bk.to; t > bk.from; t -= 7 * DAY) wk.unshift({ from: Math.max(bk.from, t - 7 * DAY), to: t });
    const wkRows = wk.map(b => { const xs = state.reviews.filter(rv => rv.time >= b.from && rv.time < b.to && sc.codes.has(rv.code)); return { b, xs }; });
    const wkFull = b => `${dLabel(b.from)} – ${dLabel(b.to - 1)}`;
    const volRows = wkRows.map(({ b, xs }) => ({ label: dLabel(b.from), full: wkFull(b), values: { n: xs.length } }));
    const ratRows = wkRows.map(({ b, xs }) => ({ label: dLabel(b.from), full: wkFull(b), value: xs.length ? sum(xs.map(x => x.rating)) / xs.length : null, note: `${xs.length} ulasan` }));
    // Kinerja per region
    const im = issueMap();
    const regionRows = REGIONS.map(r => {
      const ls = sc.locs.filter(l => l.region === r); if (!ls.length) return '';
      const codes = new Set(ls.map(l => l.code)), rv = cur.rvs.filter(x => codes.has(x.code));
      const on = pct(ls.filter(l => l.status === 'Online').length, ls.length), ver = pct(ls.filter(l => l.gbp === 'Terverifikasi').length, ls.length);
      const iss = ls.filter(l => im.has(l.code)).length, avg = rv.length ? sum(rv.map(x => x.rating)) / rv.length : null, rep = rv.length ? pct(rv.filter(x => x.reply).length, rv.length) : null;
      const cell = (v, warnBelow) => (v == null ? '<span class="bs-muted">—</span>' : `<span class="bs-cell-bar${v < warnBelow ? ' is-low' : ''}"><span style="width:${v}%"></span></span><b>${v}%</b>`);
      return `<tr><th scope="row"><button type="button" class="bs-inline-link" data-action="report-region" data-id="${esc(r)}">${esc(r)}</button></th><td>${fmtNum(ls.length)}</td><td class="bs-td-bar">${cell(on, 80)}</td><td class="bs-td-bar">${cell(ver, 75)}</td><td>${iss ? `<span class="bs-issue sm">${ic('alert')}${iss}</span>` : '0'}</td><td>${avg == null ? '—' : `${stars(Math.round(avg))} ${ratingTxt(avg)}`}</td><td class="bs-td-bar">${cell(rep, 50)}</td></tr>`;
    }).filter(Boolean);
    // Komposisi
    const cnt = key => sc.locs.reduce((m, l) => { m[l[key]] = (m[l[key]] || 0) + 1; return m; }, {});
    // Daftar peringkat
    const perLoc = new Map();
    cur.rvs.forEach(rv => { const e = perLoc.get(rv.code) || { n: 0, s: 0, un: 0 }; e.n++; e.s += rv.rating; if (!rv.reply) e.un++; perLoc.set(rv.code, e); });
    const lowest = [...perLoc.entries()].map(([code, e]) => ({ code, avg: e.s / e.n, ...e })).sort((a, b) => a.avg - b.avg || b.n - a.n).slice(0, 5)
      .map(x => ({ label: `<button type="button" class="bs-inline-link" data-action="open-loc" data-id="${esc(x.code)}" data-tab="reviews">${esc(locName(x.code))}</button>`, plain: locName(x.code), n: x.avg, value: `${ratingTxt(x.avg)} ★`, sub: `${x.n} ulasan · ${x.un} belum dibalas` }));
    const reasons = new Map();
    cur.runs.forEach(r => r.items.forEach(i => { if (i.status === 'Gagal' && sc.codes.has(i.code)) reasons.set(i.reason, (reasons.get(i.reason) || 0) + 1); }));
    const reasonRows = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ label: esc(k), plain: k, n }));
    const team = new Map();
    cur.audit.filter(a => a.actor === 'Internal').forEach(a => team.set(a.user, (team.get(a.user) || 0) + 1));
    const teamRows = [...team.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => ({ label: esc(k), plain: k, n, value: `${fmtNum(n)} aksi` }));
    const scopeTxt = [f.region, (accounts.find(a => a.id === f.account) || {}).name, f.type].filter(Boolean).join(' · ') || 'Seluruh jaringan';
    const periodTxt = `${new Intl.DateTimeFormat(LOC(), { dateStyle: 'medium' }).format(new Date(bk.from))} – ${new Intl.DateTimeFormat(LOC(), { dateStyle: 'medium' }).format(new Date(bk.to - DAY))}`;
    const sched = (state.reportSchedules || []).map(x => `<tr><td><strong>${esc(x.name)}</strong><small>${esc((PERIODS.find(p2 => p2[0] === x.period) || PERIODS[0])[1])} · ${esc(x.format)}</small></td><td>${esc(FREQ[x.frequency] || x.frequency)}${x.frequency === 'weekly' ? `<small>${esc((WEEKDAYS.find(w => w[0] === x.day) || WEEKDAYS[0])[1])}, 08.00</small>` : '<small>Tanggal 1, 08.00</small>'}</td><td class="bs-td-wrap">${x.recipients.map(esc).join(', ')}</td><td class="bs-td-actions">${btn('', 'report-unschedule', { id: x.id, icon: 'trash', variant: 'icon sm ghost', title: `Hapus jadwal ${x.name}` })}</td></tr>`);
    return `<div class="bs-print-head"><strong>BranchSync — Laporan & Analitik</strong><span>Periode: ${esc(periodTxt)} · Cakupan: ${esc(scopeTxt)} · Dicetak: ${fmtDate(Date.now())}</span></div>` +
      head('Laporan & Analitik', navItem('reports').desc, btn('Jadwalkan', 'report-schedule', { icon: 'calendar' }) + btn('Ekspor CSV', 'report-export', { icon: 'download' }) + btn('Cetak / PDF', 'report-print', { icon: 'printer', variant: 'primary' })) +
      `<section class="bs-card bs-report-filters"><div class="bs-card-body flush"><div class="bs-toolbar">
        ${selectF('report.period', 'Periode', PERIODS, f.period, '')}
        ${selectF('report.region', 'Region', REGIONS, f.region, 'Semua region')}
        ${selectF('report.account', 'Akun Google Business Profile', accounts.map(a => [a.id, a.name]), f.account, 'Semua akun')}
        ${selectF('report.type', 'Tipe unit', TYPES, f.type, 'Semua tipe')}
        ${f.region || f.account || f.type ? btn('Reset', 'report-reset', { icon: 'x', variant: 'ghost' }) : ''}
      </div><p class="bs-report-scope">${ic('info')}<span><b>${esc(periodTxt)}</b> · ${esc(scopeTxt)} · ${fmtNum(sc.locs.length)} unit. Perubahan dibandingkan dengan ${f.period} hari sebelumnya.</span></p></div></section>` +
      `<div class="bs-metrics bs-metrics-6">${[
        kpiTile('Keberhasilan sync', cur.rate, prev.rate, { fmt: pctTxt, delta: v => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)} poin`, icon: 'refresh' }),
        kpiTile('Rata-rata rating', cur.avgRating, prev.avgRating, { fmt: v => `${ratingTxt(v)} ★`, delta: ratingTxt, icon: 'star' }),
        kpiTile('Tingkat balasan ulasan', cur.replyRate, prev.replyRate, { fmt: pctTxt, delta: v => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)} poin`, icon: 'chat' }),
        kpiTile('Waktu balas rata-rata', cur.avgResp, prev.avgResp, { fmt: fmtDur, delta: fmtDur, better: 'down', icon: 'gauge' }),
        kpiTile('Kepatuhan SLA internal', cur.sla, prev.sla, { fmt: pctTxt, delta: v => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)} poin`, icon: 'shield' }),
        kpiTile('Ketidaksesuaian diselesaikan', cur.resolved, prev.resolved, { fmt: fmtNum, delta: fmtNum, icon: 'alert' })
      ].join('')}</div>` +
      card(`Tren sinkronisasi ${bk.size === 1 ? 'harian' : 'mingguan'}`, columnChart(syncRows, { series: [{ key: 'ok', label: 'Berhasil', cls: 'bs-seg-good', dot: 'good' }, { key: 'fail', label: 'Gagal', cls: 'bs-seg-bad', dot: 'bad' }], labelEvery }), { sub: `${fmtNum(cur.ok + cur.fail)} pembaruan · ${fmtNum(cur.fail)} gagal` }) +
      `<div class="bs-grid bs-grid-2">${card('Volume ulasan per minggu', columnChart(volRows, { series: [{ key: 'n', label: 'Ulasan', cls: 'bs-seg-accent', dot: 's1' }], labelEvery: volRows.length > 8 ? 2 : 1 }), { sub: `${fmtNum(cur.rvs.length)} ulasan dalam periode` })}${card('Rata-rata rating per minggu', lineChart(ratRows, { label: 'Rata-rata rating', fmt: v => `${ratingTxt(v)} ★`, labelEvery: ratRows.length > 8 ? 2 : 1 }), { sub: 'Skala 1–5 bintang' })}</div>` +
      card('Kinerja per region', regionRows.length ? `<div class="bs-table-wrap" tabindex="0" role="region" aria-label="Kinerja per region"><table class="bs-table bs-report-table bs-cards"><thead><tr><th scope="col">Region</th><th scope="col">Unit</th><th scope="col">Online</th><th scope="col">Terverifikasi GBP</th><th scope="col">Beda data</th><th scope="col">Rating (periode)</th><th scope="col">Ulasan dibalas</th></tr></thead><tbody>${withLabels(['Unit', 'Online', 'Terverifikasi GBP', 'Beda data', 'Rating (periode)', 'Ulasan dibalas'], regionRows).join('')}</tbody></table></div>` : emptyState('Tidak ada data', 'Tidak ada unit dalam cakupan ini.', '', 'info'), { sub: 'Klik region untuk menyaring laporan · bar oranye = di bawah target', flush: !!regionRows.length }) +
      `<div class="bs-grid bs-grid-2">${card('Komposisi status unit', composition('Status operasional', STATUSES, cnt('status')) + composition('Status Google Business Profile', GBP, cnt('gbp')))}${card('Lokasi dengan rating terendah', rankList(lowest, 'Belum ada ulasan dalam periode ini.', 5), { sub: 'Berdasarkan ulasan dalam periode', actions: go('Ulasan', 'reviews') })}</div>` +
      `<div class="bs-grid bs-grid-2">${card('Penyebab gagal sinkron teratas', rankList(reasonRows, 'Tidak ada kegagalan tercatat dalam periode ini.'), { actions: go('Sync Monitor', 'sync') })}${card('Aktivitas tim', rankList(teamRows, 'Belum ada aktivitas dalam periode ini.'), { sub: 'Jumlah perubahan per pengguna internal', actions: go('Riwayat', 'audit') })}</div>` +
      card('Laporan terjadwal', sched.length ? table(['Laporan', 'Jadwal', 'Penerima', '<span class="bs-sr">Aksi</span>'], sched) : emptyState('Belum ada jadwal', 'Kirim laporan otomatis ke email pimpinan secara berkala.', btn('Jadwalkan laporan', 'report-schedule', { icon: 'calendar', variant: 'sm' }), 'calendar'), { sub: isLive() ? 'Dikirim otomatis oleh server BranchSync.' : 'Mode Demo — jadwal disimpan, email tidak benar-benar dikirim.', flush: !!sched.length });
  }
  function reportScheduleModal() {
    if (!guard('settings.write')) return;
    openModal('Jadwalkan laporan', formGrid([
      { name: 'name', label: 'Nama laporan', value: 'Laporan kinerja jaringan', full: true, attrs: 'required maxlength="80"' },
      { name: 'frequency', label: 'Frekuensi', type: 'select', options: [['weekly', 'Mingguan'], ['monthly', 'Bulanan (tanggal 1)']], value: 'weekly' },
      { name: 'day', label: 'Hari kirim (mingguan)', type: 'select', options: WEEKDAYS, value: '1' },
      { name: 'period', label: 'Periode data', type: 'select', options: PERIODS, value: ui.report.period },
      { name: 'format', label: 'Format', type: 'select', options: [['PDF', 'PDF'], ['CSV', 'CSV'], ['PDF + CSV', 'PDF + CSV']], value: 'PDF' },
      { name: 'recipients', label: 'Penerima (pisahkan dengan koma)', type: 'textarea', full: true, hint: 'Contoh: kepala.divisi@bri.co.id, manajer.wilayah@bri.co.id', attrs: 'required' }
    ]), {
      desc: 'Laporan berisi ringkasan KPI, tren, dan kinerja per region sesuai filter yang sedang dipakai.', submit: 'Simpan jadwal',
      onSubmit: p => {
        const name = String(p.name || '').trim(), recipients = String(p.recipients || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
        const e = {};
        if (!name) e.name = 'Wajib diisi.';
        if (!recipients.length) e.recipients = 'Isi minimal satu email.';
        else if (recipients.some(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) e.recipients = `Email tidak valid: ${recipients.filter(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).join(', ')}`;
        if (recipients.length > 20) e.recipients = 'Maksimal 20 penerima.';
        if (Object.keys(e).length) return e;
        const sch = { id: `RS-${String(++state.seq.schedule).padStart(3, '0')}`, name, frequency: p.frequency, day: p.day, period: p.period, format: p.format, recipients, filters: { ...ui.report }, createdAt: Date.now() };
        state.reportSchedules.push(sch);
        log('Laporan & Analitik', 'Menjadwalkan laporan', { detail: `${name} · ${FREQ[sch.frequency]} · ${recipients.length} penerima` });
        remote('POST', '/reports/schedules', sch);
        toast(`Jadwal “${name}” disimpan.`, { tone: 'good' });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * View: Panduan Pengguna & Scenario Test (konten dua bahasa)
   * ------------------------------------------------------------------ */
  const CONTENT = window.BranchAdminContent || { guide: [], scenarios: [], scenarioGroups: [] };
  const L2 = pair => (Array.isArray(pair) ? (isEn() ? pair[1] : pair[0]) : pair);
  function viewGuide() {
    const q = ui.guide.q.trim().toLowerCase();
    const text = g => [g.title, g.summary, ...g.steps, ...g.tips].map(pp => `${pp[0]} ${pp[1]}`).join(' ').toLowerCase();
    const secs = CONTENT.guide.filter(g => !q || text(g).includes(q));
    const link = ([v, lab]) => (v.startsWith('act:') ? btn(esc(L2(lab)), v.slice(4), { icon: 'arrowR', variant: 'sm' }) : go(esc(L2(lab)), v, 'sm'));
    return `<div class="bs-stack-20" data-no-i18n>` +
      head(L2(['Panduan Pengguna', 'User Guide']), L2(['Cara memakai setiap fitur BranchSync, langkah demi langkah. Klik tombol di setiap bagian untuk langsung membuka halamannya.', 'How to use every BranchSync feature, step by step. Click the buttons in each section to open the page directly.']),
        `<button type="button" class="bs-btn" data-view="scenarios">${ic('clipboard')}<span>${L2(['Scenario Test', 'Scenario Test'])}</span></button>` + btn(L2(['Cetak panduan', 'Print guide']), 'guide-print', { icon: 'printer' })) +
      `<div class="bs-guide">
        <nav class="bs-guide-toc" aria-label="${esc(L2(['Daftar isi', 'Contents']))}">
          <label class="bs-field"><span>${L2(['Cari di panduan', 'Search the guide'])}</span><span class="bs-input-ic">${ic('search')}<input type="search" id="bsGuideQ" data-bind="guide.q" data-search value="${esc(ui.guide.q)}" placeholder="${esc(L2(['Mis. impor, ulasan, SLA…', 'E.g. import, reviews, SLA…']))}" autocomplete="off"></span></label>
          <ol>${CONTENT.guide.map(g => `<li><button type="button" data-action="guide-jump" data-id="${g.id}" ${secs.includes(g) ? '' : 'disabled'}>${ic(g.icon)}<span>${esc(L2(g.title))}</span></button></li>`).join('')}</ol>
        </nav>
        <div class="bs-guide-body">${secs.length ? secs.map((g, i) => `<section class="bs-card bs-guide-sec" id="guide-${g.id}">
          <header class="bs-card-head"><div class="bs-guide-title"><span class="bs-guide-ic">${ic(g.icon)}</span><div><h2 tabindex="-1">${i + 1}. ${esc(L2(g.title))}</h2><p>${esc(L2(g.summary))}</p></div></div></header>
          <div class="bs-card-body"><ol class="bs-guide-steps">${g.steps.map(st => `<li>${esc(L2(st))}</li>`).join('')}</ol>
            ${g.tips.length ? `<div class="bs-callout">${ic('info')}<p>${g.tips.map(t => esc(L2(t))).join('<br>')}</p></div>` : ''}
            ${g.links.length ? `<div class="bs-btn-row">${g.links.map(link).join('')}</div>` : ''}</div></section>`).join('')
          : card(L2(['Tidak ditemukan', 'Not found']), emptyState(L2(['Tidak ada bagian yang cocok', 'No matching section']), L2(['Coba kata kunci lain.', 'Try another keyword.']), '', 'search'))}</div>
      </div></div>`;
  }

  /* Scenario Test — hasil disimpan di browser ini (terpisah dari data Demo/Live) */
  const SCN_KEY = 'branchSync.scenarioTests.v1';
  let scn = { tester: '', org: '', items: {} };
  try { Object.assign(scn, JSON.parse(localStorage.getItem(SCN_KEY) || '{}')); } catch (_) {}
  const scnFull = () => toast(L2(['Penyimpanan browser penuh — hapus beberapa foto bukti.', 'Browser storage is full — remove some evidence photos.']), { tone: 'bad' });
  const saveScn = () => {
    if (storageMode === 'idb') { STORE.set('scenarioTests', scn).catch(scnFull); return true; }
    try { localStorage.setItem(SCN_KEY, JSON.stringify(scn)); return true; } catch (_) { scnFull(); return false; }
  };
  const scnItem = no => (scn.items[no] ||= { result: '', notes: '', checks: [], evidence: [], updatedAt: null });
  const scnPeek = no => scn.items[no] || { result: '', notes: '', checks: [], evidence: [] };
  const SCN_RESULTS = [['standard', ['Standar', 'Standard'], 'good'], ['partial', ['Kurang standar', 'Partially standard'], 'warn'], ['failed', ['Tidak dapat dijalankan', 'Cannot be run'], 'bad']];
  const scnBadge = r => { const x = SCN_RESULTS.find(y => y[0] === r); return `<span class="bs-badge" data-tone="${x ? x[2] : 'neutral'}"><i></i>${esc(x ? L2(x[1]) : L2(['Belum diuji', 'Not tested']))}</span>`; };
  function autoEvidence(no) {
    const Ls = state.locations, im = issueMap(), lr = state.runs[0], fields = ['name', 'phone', 'hours', 'address', 'coords'];
    const cnt = (xs, f) => xs.filter(f).length, claimsOf = k => state.claims.filter(c => (k === 'Titik baru') === (c.kind === 'Titik baru'));
    const sla = slaStats(), bk = reportBuckets('30'), m30 = reportMetrics(bk.from, bk.to, { locs: Ls, codes: new Set(Ls.map(l => l.code)), filtered: false });
    const run = lr ? `Sinkronisasi terakhir ${lr.id}: ${lr.ok} berhasil, ${lr.fail} gagal, ${lr.skip} dilewati (${fmtDate(lr.time)})` : 'Belum ada sinkronisasi';
    const lines = {
      1: [`Total unit: ${Ls.length}`, `Unit tanpa listing Google: ${cnt(Ls, l => !l.google)}`, `Unit ditambah/diubah 24 jam terakhir: ${cnt(Ls, l => Date.now() - l.updatedAt < DAY)}`, `Impor tercatat di riwayat: ${cnt(state.audit, a => a.action === 'Mengimpor data massal')}`, run],
      2: [`Total unit: ${Ls.length}`, ...STATUSES.map(st => `${st}: ${cnt(Ls, l => l.status === st)}`), `Pencarian aktif: "${ui.loc.q || '-'}"`, `Filter aktif: ${FILTERS.flatMap(([k]) => ui.loc[k].map(v => `${k}=${v}`)).join(', ') || '-'}`, `Hasil daftar saat ini: ${locFiltered().length} unit`],
      3: [`Unit dengan ketidaksesuaian: ${im.size}`, ...fields.map(f => `${FIELD_LABEL[f]}: ${sum([...im.values()].map(x => x.filter(i => i.field === f).length))}`), `Catatan temuan: ${Object.keys(state.discNotes).length}`, `Keputusan tercatat di riwayat: ${cnt(state.audit, a => a.module === 'Ketidaksesuaian')}`],
      4: [`Total unit: ${Ls.length}`, `Waktu render halaman terakhir: ${ui.renderMs} ms`, `Ukuran layar: ${innerWidth}×${innerHeight}`, `Peramban: ${navigator.userAgent}`],
      5: [`Perubahan unit tercatat 24 jam terakhir: ${cnt(state.audit, a => a.module === 'Unit Kerja' && Date.now() - a.time < DAY)}`, `Unit masih berbeda dengan Google: ${im.size}`, run],
      6: [`Klaim (Get Verified/Suspend/Duplicate): ${claimsOf('x').length}`, `Selesai: ${cnt(claimsOf('x'), c => c.status === 'Selesai')}`, `Berjalan: ${cnt(claimsOf('x'), claimActive)}`, `Unit terverifikasi: ${cnt(Ls, l => l.gbp === 'Terverifikasi')}/${Ls.length}`, `Belum diklaim: ${cnt(Ls, l => l.gbp === 'Belum Diklaim')} · Suspend: ${cnt(Ls, l => l.gbp === 'Suspend')}`],
      7: [`Pengajuan titik baru: ${claimsOf('Titik baru').length}`, `Selesai: ${cnt(claimsOf('Titik baru'), c => c.status === 'Selesai')}`, `Berjalan: ${cnt(claimsOf('Titik baru'), claimActive)}`, `Ditolak: ${cnt(claimsOf('Titik baru'), c => c.status === 'Ditolak')}`],
      8: [`Pasangan duplikat terdeteksi: ${duplicatePairs().length}`, `Ditandai bukan duplikat: ${state.dupIgnored.length}`, `Unit berstatus Duplikat: ${cnt(Ls, l => l.gbp === 'Duplikat')}`, `Radius deteksi: ${state.settings.dupRadius} m`],
      9: [`Notifikasi edit eksternal: ${state.api.webhook ? 'aktif' : 'nonaktif'}`, `Menunggu: ${cnt(state.approvals, a => a.status === 'Menunggu')}`, `Disetujui: ${cnt(state.approvals, a => a.status === 'Disetujui')}`, `Ditolak: ${cnt(state.approvals, a => a.status === 'Ditolak')}`, `Entri riwayat eksternal: ${cnt(state.audit, a => a.actor === 'Eksternal')}`],
      10: [`Entri riwayat: ${state.audit.length}`, `Internal: ${cnt(state.audit, a => a.actor === 'Internal')}`, `Eksternal: ${cnt(state.audit, a => a.actor === 'Eksternal')}`, `Entri dengan detail sebelum–sesudah: ${cnt(state.audit, a => a.changes.length)}`, `Pengguna tercatat: ${new Set(state.audit.map(a => a.user)).size}`],
      11: [`Rata-rata proses internal: ${fmtDur(sla.avgInternal)}`, `Rata-rata verifikasi Google: ${fmtDur(sla.avgGoogle)}`, `Kepatuhan SLA internal: ${sla.compliance}%`, `Target internal: ${state.settings.slaInternal} jam · acuan Google: ${state.settings.slaGoogle} jam`, `Permintaan berisiko/lewat SLA: ${sla.atRisk}`],
      12: [`Kegagalan belum ditangani: ${openFailures().length}`, ...[...openFailures().reduce((mp, f) => mp.set(f.reason, (mp.get(f.reason) || 0) + 1), new Map())].map(([k, n]) => `· ${k}: ${n}`), `Kegagalan sudah diberi tindak lanjut: ${sum(state.runs.map(r => r.items.filter(i => i.status === 'Gagal' && i.resolved && i.note && !/^Berhasil/.test(i.note)).length))}`, run],
      13: [`Keberhasilan sync 30 hari: ${m30.rate == null ? '-' : m30.rate.toFixed(1) + '%'}`, `Rata-rata rating 30 hari: ${m30.avgRating == null ? '-' : m30.avgRating.toFixed(2)}`, `Tingkat balasan ulasan: ${m30.replyRate == null ? '-' : m30.replyRate.toFixed(1) + '%'}`, `Kepatuhan SLA internal: ${sla.compliance}%`, `Skenario teruji: ${CONTENT.scenarios.filter(x => scnPeek(x.no).result).length}/${CONTENT.scenarios.length}`]
    }[no] || [];
    return [`Bukti otomatis · ${isLive() ? `Live (${MODE.host()})` : 'Mode Demo'} · ${fmtDate(Date.now())}`, ...lines].join('\n');
  }
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) { reject(new Error(L2(['Berkas bukan gambar.', 'File is not an image.']))); return; }
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(L2(['Gambar tidak dapat dibaca.', 'The image could not be read.']))); };
      img.src = url;
    });
  }
  function viewScenarios() {
    const all = CONTENT.scenarios, groups = CONTENT.scenarioGroups, list = all.filter(x => !ui.scn.group || x.group === ui.scn.group);
    const counts = SCN_RESULTS.map(([k]) => all.filter(x => scnPeek(x.no).result === k).length), tested = sum(counts);
    const gName = id => L2((groups.find(g => g.id === id) || { title: [id, id] }).title);
    const navName = v => L2([navItem(v).label, (I18N.translate && I18N.translate(navItem(v).label)) || navItem(v).label]);
    const stepBtn = (x, st) => (st.go ? `<button type="button" class="bs-btn sm ghost" data-action="scn-go" data-id="${st.go}">${ic('arrowR')}<span>${esc(L2(['Buka', 'Open']))} ${esc(navName(st.go))}</span></button>` : st.act ? btn(esc(L2(['Jalankan', 'Run'])), 'scn-act', { id: `${x.no}|${st.act}`, icon: 'zap', variant: 'sm ghost' }) : '');
    const cardOf = x => {
      const it = scnPeek(x.no), open = ui.scn.open.has(x.no), checked = x.evidence.filter((_, i) => it.checks[i]).length;
      return `<details class="bs-scn" data-scn-no="${x.no}" ${open ? 'open' : ''}>
        <summary><span class="bs-scn-no">${x.no}</span><span class="bs-scn-title"><strong>${esc(L2(x.title))}</strong><small>${esc(gName(x.group))} · Mandatory · ${checked}/${x.evidence.length} ${esc(L2(['bukti', 'evidence']))}</small></span>${scnBadge(it.result)}${ic('chevD', 'bs-scn-caret')}</summary>
        <div class="bs-scn-body">
          <div class="bs-scn-meta"><div><h4>${L2(['Hasil yang diharapkan', 'Expected result'])}</h4><p>${esc(L2(x.expected))}</p></div><div><h4>${L2(['Catatan dokumen', 'Document note'])}</h4><p>${esc(L2(x.note))}</p></div></div>
          <h4>${L2(['Langkah pengujian di BranchSync', 'Test steps in BranchSync'])}</h4>
          <ol class="bs-scn-steps">${x.steps.map(st => `<li><span>${esc(L2(st.t))}</span>${stepBtn(x, st)}</li>`).join('')}</ol>
          <h4>${L2(['Bukti yang perlu dikumpulkan', 'Evidence to collect'])}</h4>
          <ul class="bs-scn-checks">${x.evidence.map((e, i) => `<li><label class="bs-checkline"><input type="checkbox" data-scn-check="${x.no}:${i}" ${it.checks[i] ? 'checked' : ''}><span>${esc(L2(e))}</span></label></li>`).join('')}</ul>
          ${it.evidence.length ? `<div class="bs-scn-evidence">${it.evidence.map((ev, i) => ev.type === 'image'
            ? `<figure class="bs-scn-photo"><button type="button" class="bs-scn-thumb" data-action="scn-ev-view" data-id="${x.no}:${i}" aria-label="${esc(L2(['Lihat foto bukti', 'View evidence photo']))} ${i + 1}"><img src="${ev.data}" alt=""></button><figcaption>${fmtDate(ev.time, { dateStyle: 'short', timeStyle: 'short' })}${btn('', 'scn-ev-del', { id: `${x.no}:${i}`, icon: 'trash', variant: 'icon sm ghost', title: L2(['Hapus bukti', 'Delete evidence']) })}</figcaption></figure>`
            : `<div class="bs-scn-auto"><pre>${esc(ev.text)}</pre>${btn('', 'scn-ev-del', { id: `${x.no}:${i}`, icon: 'trash', variant: 'icon sm ghost', title: L2(['Hapus bukti', 'Delete evidence']) })}</div>`).join('')}</div>` : ''}
          <div class="bs-btn-row bs-scn-actions">${btn(esc(L2(['Mulai skenario', 'Start scenario'])), 'scn-start', { id: x.no, icon: 'arrowR', variant: 'primary sm' })}${btn(esc(L2(['Ambil bukti otomatis', 'Capture auto evidence'])), 'scn-auto', { id: x.no, icon: 'zap', variant: 'sm' })}<label class="bs-btn sm bs-file">${ic('camera')}<span>${L2(['Unggah foto bukti', 'Upload evidence photo'])}</span><input type="file" accept="image/*" multiple class="bs-sr" data-scn-upload="${x.no}"></label></div>
          <fieldset class="bs-scn-result"><legend>${L2(['Hasil pengujian', 'Test result'])}</legend>${SCN_RESULTS.map(([k, lab, tone]) => `<label class="bs-scn-radio" data-tone="${tone}"><input type="radio" name="scn-res-${x.no}" value="${k}" data-scn-result="${x.no}" ${it.result === k ? 'checked' : ''}><span>${esc(L2(lab))}</span></label>`).join('')}</fieldset>
          <label class="bs-field"><span>${L2(['Catatan / temuan penguji', 'Tester notes / findings'])}</span><textarea rows="3" data-scn-notes="${x.no}" placeholder="${esc(L2(['Tulis hasil pengamatan, kendala, atau rekomendasi…', 'Write observations, issues, or recommendations…']))}">${esc(it.notes)}</textarea></label>
          ${it.updatedAt ? `<p class="bs-muted">${L2(['Terakhir diperbarui', 'Last updated'])} ${fmtDate(it.updatedAt)}</p>` : ''}
        </div></details>`;
    };
    const segs = SCN_RESULTS.map(([k, , tone], i) => (counts[i] ? `<span data-tone="${tone}" style="flex:${counts[i]}"></span>` : '')).join('') + (all.length - tested ? `<span data-tone="neutral" style="flex:${all.length - tested}"></span>` : '');
    return `<div class="bs-stack-20" data-no-i18n><div class="bs-print-head"><strong>${L2(['Laporan Hasil Scenario Test — BranchSync', 'Scenario Test Results Report — BranchSync'])}</strong><span>${L2(['Penguji', 'Tester'])}: ${esc(scn.tester || '-')} · ${esc(scn.org || '')} · ${L2(['Mode', 'Mode'])}: ${isLive() ? 'Live' : 'Demo'} · ${L2(['Dicetak', 'Printed'])}: ${fmtDate(Date.now())}</span></div>` +
      head('Scenario Test', L2(['Tutorial menjalankan 13 skenario uji piloting Dashboard BranchSync sesuai dokumen “Skenario Test Piloting”, lengkap dengan pencatatan hasil dan bukti.', 'A tutorial for running the 13 BranchSync dashboard piloting test scenarios from the “Piloting Test Scenario” document, with result and evidence recording.']),
        btn(esc(L2(['Ekspor CSV', 'Export CSV'])), 'scn-export', { icon: 'download' }) + btn(esc(L2(['Cetak / PDF', 'Print / PDF'])), 'scn-print', { icon: 'printer', variant: 'primary' })) +
      `<div class="bs-grid bs-grid-main">${card(L2(['Kemajuan pengujian', 'Test progress']), `<div class="bs-scn-progress"><strong>${tested}<small>/${all.length}</small></strong><span>${L2(['skenario sudah diuji', 'scenarios tested'])}</span></div><div class="bs-comp-bar bs-scn-bar" role="img" aria-label="${esc(SCN_RESULTS.map(([, lab], i) => `${L2(lab)} ${counts[i]}`).join(', '))}">${segs}</div>
        <ul class="bs-comp-legend">${SCN_RESULTS.map(([, lab, tone], i) => `<li><i data-tone="${tone}"></i><span>${esc(L2(lab))}</span><b>${counts[i]}</b></li>`).join('')}<li><i data-tone="neutral"></i><span>${esc(L2(['Belum diuji', 'Not tested']))}</span><b>${all.length - tested}</b></li></ul>`)}
        ${card(L2(['Informasi penguji', 'Tester information']), `<div class="bs-form-grid"><label class="bs-field"><span>${L2(['Nama penguji', 'Tester name'])}</span><input data-scn-meta="tester" value="${esc(scn.tester)}" maxlength="80" autocomplete="name"></label><label class="bs-field"><span>${L2(['Instansi / divisi', 'Organization / division'])}</span><input data-scn-meta="org" value="${esc(scn.org)}" maxlength="80"></label></div>
          <p class="bs-muted bs-gap">${L2(['Hasil disimpan di browser ini dan dapat diekspor sebagai bukti. Gunakan Mode Demo untuk latihan dan Live untuk pengujian resmi.', 'Results are saved in this browser and can be exported as evidence. Use Demo mode for practice and Live for official testing.'])}</p>${btn(esc(L2(['Reset hasil', 'Reset results'])), 'scn-reset', { icon: 'trash', variant: 'sm danger ghost' })}`)}</div>` +
      `<div class="bs-callout">${ic('info')}<p>${L2(['Cara memakai: buka skenario → klik <b>Mulai skenario</b> atau tombol di setiap langkah → lakukan pengujian → centang bukti, ambil bukti otomatis atau unggah foto → pilih hasil <b>Standar / Kurang standar / Tidak dapat dijalankan</b> dan tulis catatan.', 'How to use: open a scenario → click <b>Start scenario</b> or the button on each step → run the test → tick evidence, capture auto evidence or upload photos → choose <b>Standard / Partially standard / Cannot be run</b> and write notes.'])}</p></div>` +
      tabs('scn.group', [['', L2(['Semua', 'All']), all.length], ...groups.map(g => [g.id, L2(g.title), all.filter(x => x.group === g.id).length])], ui.scn.group) +
      groups.filter(g => list.some(x => x.group === g.id)).map(g => `<section class="bs-scn-group"><h2 class="bs-scn-group-title">${esc(L2(g.title))}</h2>${list.filter(x => x.group === g.id).map(cardOf).join('')}</section>`).join('') +
      `</div>`;
  }
  function scnStart(x, act) {
    navigate(x.start.view);
    const a = act || x.start.act;
    if (!a) return;
    setTimeout(() => {
      if (a === 'import-sample') { importDraft = null; importModal(sampleCSV(25)); }
      else if (a === 'claim-new') claimForm();
      else if (a === 'point-new') pointForm();
      else if (a === 'simulate-google') simulateGoogleChange();
      else if (a === 'simulate-edit') simulateEdit();
    }, 30);
  }

  /* ------------------------------------------------------------------ *
   * View: Ulasan Google
   * ------------------------------------------------------------------ */
  const stars = n => `<span class="bs-stars" role="img" aria-label="${n} dari 5 bintang">${'★'.repeat(n)}<span aria-hidden="true">${'★'.repeat(Math.max(0, 5 - n))}</span></span>`;
  function reviewScope() {
    const f = ui.reviews;
    return state.reviews.filter(rv => { const l = byCode().get(rv.code); return l && (!f.account || acctOf(l) === f.account) && (!f.location || rv.code === f.location); });
  }
  function reviewFiltered() {
    const f = ui.reviews, q = f.q.trim().toLowerCase();
    const xs = reviewScope().filter(rv => (!f.rating || rv.rating === Number(f.rating)) && (!f.status || (f.status === 'replied' ? !!rv.reply : !rv.reply)) &&
      (!q || `${rv.author} ${rv.text} ${rv.reply ? rv.reply.text : ''} ${locName(rv.code)}`.toLowerCase().includes(q)));
    const sorters = { newest: (a, b) => b.time - a.time, unreplied: (a, b) => (!!a.reply - !!b.reply) || b.time - a.time, lowest: (a, b) => a.rating - b.rating || b.time - a.time, highest: (a, b) => b.rating - a.rating || b.time - a.time };
    return xs.sort(sorters[f.sort] || sorters.newest);
  }
  function reviewCard(rv, { showLoc = true } = {}) {
    const l = byCode().get(rv.code), editing = ui.reviews.editing === rv.id;
    const draft = ui.reviews.drafts[rv.id] ?? (rv.reply ? rv.reply.text : '');
    const editor = `<div class="bs-reply-editor">
        <label class="bs-sr" for="rv-text-${esc(rv.id)}">Balasan untuk ${esc(rv.author)}</label>
        <textarea id="rv-text-${esc(rv.id)}" data-draft="${esc(rv.id)}" rows="3" maxlength="${REPLY_MAX}" placeholder="Tulis balasan yang sopan dan membantu…">${esc(draft)}</textarea>
        <div class="bs-reply-tools">
          <label class="bs-inline-select"><span class="bs-sr">Template balasan</span><select data-action-change="review-template" data-id="${esc(rv.id)}"><option value="">Pakai template…</option>${REPLY_TEMPLATES.map((t, i) => `<option value="${i}">${esc(t.label)}</option>`).join('')}</select></label>
          <small class="bs-char" id="rv-count-${esc(rv.id)}">${draft.length}/${fmtNum(REPLY_MAX)}</small><span class="bs-spacer"></span>
          ${btn('Batal', 'review-cancel', { id: rv.id, variant: 'sm ghost' })}${btn(rv.reply ? 'Simpan balasan' : 'Kirim balasan', 'review-send', { id: rv.id, icon: 'send', variant: 'sm primary' })}
        </div>
        <p class="bs-reply-hint">Balasan tampil publik di Google Maps sebagai pemilik “${esc(l ? l.name : 'unit')}”.</p></div>`;
    const reply = rv.reply && !editing ? `<div class="bs-reply"><div class="bs-reply-head"><strong>Balasan pemilik</strong><small>${esc(rv.reply.by || '')} · <time title="${fmtDate(rv.reply.time)}">${fmtRel(rv.reply.time)}</time></small><span class="bs-spacer"></span>${btn('', 'review-edit', { id: rv.id, icon: 'edit', variant: 'icon sm ghost', title: 'Ubah balasan' })}${btn('', 'review-delete', { id: rv.id, icon: 'trash', variant: 'icon sm ghost', title: 'Hapus balasan' })}</div><p>${esc(rv.reply.text)}</p></div>` : '';
    return `<article class="bs-review" data-low="${rv.rating <= 2}" aria-label="Ulasan ${esc(rv.author)}, ${rv.rating} bintang">
      <header><span class="bs-avatar sm" aria-hidden="true">${initials(rv.author)}</span><div class="bs-review-who"><strong>${esc(rv.author)}</strong><small>${stars(rv.rating)}<span>·</span><time title="${fmtDate(rv.time)}">${fmtRel(rv.time)}</time></small></div>
        ${showLoc && l ? `<button type="button" class="bs-review-loc" data-action="open-loc" data-id="${esc(l.code)}" data-tab="reviews">${ic('pin')}<span>${esc(l.name)}</span></button>` : ''}${rv.reply ? badge('Berhasil', 'Dibalas') : badge('Menunggu', 'Belum dibalas')}</header>
      <p class="bs-review-text${rv.text ? '' : ' bs-muted'}">${rv.text ? esc(rv.text) : '(Hanya memberi rating, tanpa komentar)'}</p>
      ${reply}${editing ? editor : rv.reply ? '' : `<div class="bs-review-actions">${btn('Balas', 'review-reply', { id: rv.id, icon: 'chat', variant: 'sm' })}</div>`}
    </article>`;
  }
  function ratingSummary(scope, clickable = true) {
    const avg = scope.length ? sum(scope.map(r => r.rating)) / scope.length : 0, replied = scope.filter(r => r.reply).length;
    const dist = [5, 4, 3, 2, 1].map(n => [n, scope.filter(r => r.rating === n).length]), maxD = Math.max(1, ...dist.map(d => d[1]));
    const neg = scope.filter(r => r.rating <= 2 && !r.reply).length;
    return `<div class="bs-rating-summary"><div class="bs-rating-big"><strong>${avg ? avg.toFixed(1).replace('.', ',') : '—'}</strong>${stars(Math.round(avg))}<small>${fmtNum(scope.length)} ulasan</small></div>
      <div class="bs-rating-dist">${dist.map(([n, c]) => { const on = String(ui.reviews.rating) === String(n); return clickable ? `<button type="button" class="bs-rating-row${on ? ' is-active' : ''}" data-action="review-rating" data-id="${n}" aria-pressed="${on}" aria-label="Saring ${n} bintang: ${c} ulasan"><span>${n}★</span><span class="bs-bar-track"><span style="width:${(c / maxD) * 100}%"></span></span><small>${fmtNum(c)}</small></button>` : `<div class="bs-rating-row"><span>${n}★</span><span class="bs-bar-track"><span style="width:${(c / maxD) * 100}%"></span></span><small>${fmtNum(c)}</small></div>`; }).join('')}</div>
      <div class="bs-rating-kpis"><div><strong>${fmtNum(scope.length - replied)}</strong><small>Belum dibalas</small></div><div><strong>${pct(replied, scope.length)}%</strong><small>Tingkat balasan</small></div><div data-tone="${neg ? 'warn' : ''}"><strong>${fmtNum(neg)}</strong><small>Negatif belum dibalas</small></div></div></div>`;
  }
  function viewReviews() {
    // Bersihkan filter yang merujuk akun/lokasi yang tidak ada (mis. setelah ganti mode).
    if (ui.reviews.account && !(state.accounts || []).some(a => a.id === ui.reviews.account)) ui.reviews.account = '';
    if (ui.reviews.location && !byCode().has(ui.reviews.location)) ui.reviews.location = '';
    const f = ui.reviews, accounts = state.accounts || [], scope = reviewScope(), list = reviewFiltered(), shown = list.slice(0, f.limit);
    const perCode = new Map();
    state.reviews.forEach(rv => perCode.set(rv.code, (perCode.get(rv.code) || 0) + 1));
    const acctCount = id => state.reviews.filter(rv => acctOf(byCode().get(rv.code)) === id).length;
    const locOpts = state.locations.filter(l => perCode.has(l.code) && (!f.account || acctOf(l) === f.account)).sort((a, b) => a.name.localeCompare(b.name, 'id')).map(l => [l.code, `${l.name} (${perCode.get(l.code)})`]);
    const loc = f.location && byCode().get(f.location);
    const ctx = loc ? `<div class="bs-review-context">${ic('pin')}<div><strong>${esc(loc.name)}</strong><small>${esc(loc.address)} · ${esc((accounts.find(a => a.id === acctOf(loc)) || {}).name || '')}</small></div>${btn('Detail lokasi', 'open-loc', { id: loc.code, variant: 'sm' })}${btn('', 'review-clear-loc', { icon: 'x', variant: 'icon sm ghost', title: 'Tampilkan semua lokasi' })}</div>` : '';
    return head('Ulasan Google', navItem('reviews').desc, (isLive() ? btn('Muat ulang', 'live-retry', { icon: 'refresh' }) : btn('Simulasikan ulasan baru', 'simulate-review', { icon: 'zap' })) + btn('Ekspor CSV', 'export-reviews', { icon: 'download' })) +
      `<section class="bs-card"><div class="bs-card-body flush"><div class="bs-toolbar bs-review-pickers">
        ${selectF('reviews.account', 'Akun Google Business Profile', accounts.map(a => [a.id, `${a.name} (${acctCount(a.id)})`]), f.account, 'Semua akun')}
        ${selectF('reviews.location', 'Lokasi Maps', locOpts, f.location, 'Semua lokasi')}
      </div></div></section>` + ctx +
      card('Ringkasan rating', ratingSummary(scope), { sub: loc ? `Untuk ${esc(loc.name)}` : f.account ? `Untuk ${esc((accounts.find(a => a.id === f.account) || {}).name || '')}` : 'Semua akun dan lokasi · klik baris bintang untuk menyaring' }) +
      `<section class="bs-card"><div class="bs-card-body flush"><div class="bs-toolbar">
        ${searchF('reviews.q', 'Cari ulasan', f.q, 'Nama, isi ulasan, atau balasan…', 'bsReviewQ')}
        ${selectF('reviews.status', 'Status', [['unreplied', 'Belum dibalas'], ['replied', 'Sudah dibalas']], f.status)}
        ${selectF('reviews.sort', 'Urutkan', [['newest', 'Terbaru'], ['unreplied', 'Belum dibalas dulu'], ['lowest', 'Rating terendah'], ['highest', 'Rating tertinggi']], f.sort, '')}
      </div>
      ${f.rating ? `<div class="bs-chips"><button type="button" class="bs-chip" data-action="review-rating" data-id="${f.rating}"><span>Rating: <b>${f.rating}★</b></span>${ic('x')}</button></div>` : ''}
      <div class="bs-review-list">${shown.length ? shown.map(rv => reviewCard(rv)).join('') : emptyState('Tidak ada ulasan', 'Tidak ada ulasan yang cocok dengan pilihan akun, lokasi, atau filter ini.', '', 'star')}</div>
      ${list.length > shown.length ? `<div class="bs-more">${btn(`Tampilkan ${Math.min(20, list.length - shown.length)} lagi · ${fmtNum(list.length - shown.length)} tersisa`, 'review-more', { variant: 'sm' })}</div>` : ''}
      </div></section>`;
  }

  /* ------------------------------------------------------------------ *
   * View: Pengaturan
   * ------------------------------------------------------------------ */
  function viewSettings() {
    const s = state.settings;
    const f = (name, label, value, type = 'number', hint = '', extra = '') => `<label class="bs-field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" required ${extra}>${hint ? `<small>${hint}</small>` : ''}</label>`;
    return head('Pengaturan', navItem('settings').desc) +
      card('Mode & koneksi server', `<div class="bs-mode-row"><span class="bs-mode-badge" data-state="${isLive() ? 'online' : 'demo'}">${ic(isLive() ? 'plug' : 'zap')}</span><div><strong>${isLive() ? 'Live' : 'Mode Demo'}</strong><small>${isLive() ? `Masuk sebagai ${esc(ME.name)} · ${esc(MODE.host())}` : 'Data simulasi di browser ini. Tidak ada yang dikirim ke server.'}</small></div><div class="bs-seg-btns" role="group" aria-label="Pilih mode">${btn('Demo', 'mode-demo', { icon: 'zap', variant: `sm${isLive() ? '' : ' is-current'}`, attrs: `aria-pressed="${!isLive()}"` })}${btn('Live', 'mode-live', { icon: 'plug', variant: `sm${isLive() ? ' is-current' : ''}`, attrs: `aria-pressed="${isLive()}"` })}</div></div>
        <div class="bs-form-grid bs-gap"><label class="bs-field full"><span>URL server API</span><input id="bsApiUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false" value="${esc(MODE.getBaseUrl())}" placeholder="https://api.branchsync.co.id/v1"><small>Dipakai pada mode Live. Daftar endpoint ada di API.md.</small></label></div>
        <div class="bs-btn-row">${btn('Uji koneksi', 'api-health', { icon: 'zap' })}${btn('Simpan URL', 'api-url-save', { icon: 'check' })}<span id="bsHealth" class="bs-health-msg" role="status" aria-live="polite"></span></div>`) +
      (can('settings.write') ? '' : `<div class="bs-callout" data-tone="warn">${ic('info')}<p>Anda hanya dapat melihat pengaturan workspace. Hubungi Administrator untuk mengubahnya.</p></div>`) +
      `<form id="bsSettingsForm" class="bs-stack" novalidate><fieldset class="bs-fieldset-plain" ${can('settings.write') ? '' : 'disabled'}>` +
      card('Workspace', `<div class="bs-form-grid">${f('workspace', 'Nama workspace', s.workspace, 'text', '', 'maxlength="80"')}<label class="bs-field"><span>Zona waktu</span><select name="timezone">${opts([['Asia/Jakarta', 'WIB — Asia/Jakarta'], ['Asia/Makassar', 'WITA — Asia/Makassar'], ['Asia/Jayapura', 'WIT — Asia/Jayapura']], s.timezone)}</select></label></div>`) +
      card('Target SLA', `<div class="bs-form-grid">${f('slaInternal', 'Proses internal (jam)', s.slaInternal, 'number', 'Waktu tim BRI memproses permintaan.', 'min="1" max="720"')}${f('slaGoogle', 'Acuan verifikasi Google (jam)', s.slaGoogle, 'number', 'Dipantau terpisah, di luar kendali BRI.', 'min="1" max="2000"')}</div>`) +
      card('Aturan deteksi', `<div class="bs-form-grid">${f('dupRadius', 'Radius duplikat (meter)', s.dupRadius, 'number', 'Unit bertipe sama dalam radius ini dianggap kemungkinan duplikat.', 'min="10" max="2000"')}${f('coordTol', 'Toleransi selisih koordinat (meter)', s.coordTol, 'number', 'Selisih titik di atas nilai ini dianggap tidak sesuai.', 'min="5" max="2000"')}</div>`) +
      `<div class="bs-form-actions"><button type="submit" class="bs-btn primary">${ic('check')}<span>Simpan pengaturan</span></button></div></fieldset></form>` +
      card(isLive() ? 'Data' : 'Data demo & uji performa', `<div class="bs-danger-list">
        ${isLive() ? '' : `<div><span><strong>Buat 1.000 unit uji</strong><small>Uji performa dashboard dengan data besar (skenario 4). Waktu proses ditampilkan.</small></span>${btn('Buat 1.000 unit', 'generate', { icon: 'zap' })}</div>`}
        <div><span><strong>Penyimpanan browser</strong><small>${storageMode === 'idb' ? 'IndexedDB — kapasitas besar, cocok untuk ribuan unit.' : storageMode === 'local' ? 'localStorage — terbatas ±5 MB; unduh cadangan secara berkala.' : 'Memuat…'}${isLive() ? ' Data Live tidak disimpan di browser.' : ''}</small></span><span class="bs-badge" data-tone="${storageMode === 'idb' ? 'good' : 'warn'}"><i></i>${storageMode === 'idb' ? 'IndexedDB' : 'localStorage'}</span></div>
        <div><span><strong>Cadangkan data</strong><small>Unduh seluruh data workspace sebagai JSON.</small></span>${btn('Unduh JSON', 'backup', { icon: 'download' })}</div>
        ${isLive() ? '' : `<div><span><strong>Reset data demo</strong><small>Kembalikan semua data ke kondisi awal. Tidak bisa dibatalkan.</small></span>${btn('Reset data', 'reset-data', { icon: 'trash', variant: 'danger' })}</div>`}</div>`);
  }

  /* ------------------------------------------------------------------ *
   * Drawer detail unit
   * ------------------------------------------------------------------ */
  function openDrawer(code, tab = 'overview') {
    if (!byCode().has(code)) { toast('Unit tidak ditemukan atau sudah dihapus.', { tone: 'warn' }); return; }
    ui.drawer = { code, tab };
    renderDrawer();
    if (!sheet.open) { sheetTrigger = document.activeElement; sheet.showModal(); }
    syncUrl();
  }
  let sheetTrigger = null;
  function renderDrawer() {
    if (!ui.drawer) return;
    const l = byCode().get(ui.drawer.code);
    if (!l) { if (sheet.open) sheet.close(); ui.drawer = null; return; }
    const iss = issuesOf(l), t = ui.drawer.tab;
    const hist = state.audit.filter(a => a.target === l.code);
    const syncItems = state.runs.flatMap(r => r.items.filter(i => i.code === l.code).map(i => ({ ...i, run: r.id, time: r.time }))).slice(0, 20);
    let body = '';
    if (t === 'overview') {
      body = kv([['Kode', esc(l.code)], ['Tipe', esc(l.type)], ['Alamat', esc(l.address)], ['Kota / provinsi', `${esc(l.city)}, ${esc(l.province)}`], ['Region', esc(l.region)], ['Telepon', esc(l.phone)], ['Jam operasional', esc(l.hours)],
        ['Koordinat', `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)} <a class="bs-inline-link" href="https://www.google.com/maps?q=${l.lat},${l.lng}" target="_blank" rel="noopener noreferrer">Buka di Google Maps ${ic('external')}</a>`],
        ['Sinkron terakhir', l.lastSync ? `${fmtRel(l.lastSync)}` : 'Belum pernah'], ['Diperbarui', `${fmtRel(l.updatedAt)} oleh ${esc(l.updatedBy)}`]]);
    } else if (t === 'compare') {
      const g = l.google;
      body = !g ? emptyState('Belum ada listing Google', 'Sinkronkan unit atau ajukan titik baru untuk membuat listing.', btn('Sinkronkan sekarang', 'sync-one', { id: l.code, icon: 'refresh', variant: 'sm' }), 'info') :
        `<table class="bs-table bs-compare"><thead><tr><th scope="col">Kolom</th><th scope="col">Dashboard</th><th scope="col">Google Maps</th></tr></thead><tbody>${['name', 'phone', 'hours', 'address', 'coords'].map(f => {
          const i = iss.find(x => x.field === f), dv = f === 'coords' ? `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}` : l[f], gv = f === 'coords' ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` : g[f];
          return `<tr class="${i ? 'is-diff' : ''}"><th scope="row">${FIELD_LABEL[f]}${i ? `<small class="bs-diff-flag">${ic('alert')}Beda${i.dist ? ' ' + fmtDist(i.dist) : ''}</small>` : `<small class="bs-ok">${ic('check')}Sesuai</small>`}</th><td>${esc(dv)}</td><td>${esc(gv)}${i ? `<div class="bs-btn-row">${btn('Pakai Dashboard', 'disc-push', { id: `${l.code}|${f}`, variant: 'sm' })}${btn('Pakai Google', 'disc-pull', { id: `${l.code}|${f}`, variant: 'sm ghost' })}</div>` : ''}</td></tr>`;
        }).join('')}</tbody></table>`;
    } else if (t === 'reviews') {
      const rvs = state.reviews.filter(rv => rv.code === l.code).sort((a, b) => b.time - a.time);
      body = rvs.length ? ratingSummary(rvs, false) + `<div class="bs-btn-row">${btn('Buka di halaman Ulasan', 'review-open-loc', { id: l.code, icon: 'star', variant: 'sm' })}</div><div class="bs-review-list in-drawer">${rvs.map(rv => reviewCard(rv, { showLoc: false })).join('')}</div>` : emptyState('Belum ada ulasan', 'Lokasi ini belum memiliki ulasan di Google Maps.', '', 'star');
    } else if (t === 'history') {
      body = hist.length ? `<ol class="bs-timeline">${hist.map(a => `<li><span class="bs-avatar sm" data-actor="${a.actor}" aria-hidden="true">${a.actor === 'Eksternal' ? '@' : initials(a.user)}</span><div><p><strong>${esc(a.user)}</strong> ${esc(a.action.toLowerCase())}</p><small>${fmtDate(a.time)} · ${esc(a.module)}</small>${a.changes.length ? diffList(a.changes) : ''}${a.detail ? `<small>${esc(a.detail)}</small>` : ''}</div></li>`).join('')}</ol>` : emptyState('Belum ada riwayat', 'Perubahan pada unit ini akan tercatat di sini.', '', 'history');
    } else {
      body = syncItems.length ? table(['Job', 'Hasil', 'Penyebab'], syncItems.map(i => `<tr><td>${esc(i.run)}<small>${fmtRel(i.time)}</small></td><td>${badge(i.status)}${i.resolved && i.status === 'Gagal' ? `<small>${badge('Ditangani')}</small>` : ''}</td><td class="bs-td-wrap">${esc(i.reason)}${i.note ? `<small>${esc(i.note)}</small>` : ''}</td></tr>`)) : emptyState('Tidak ada masalah sinkronisasi', l.lastSync ? `Sinkron terakhir ${fmtRel(l.lastSync)} berhasil.` : 'Unit belum pernah disinkronkan.');
    }
    sheet.innerHTML = `<div class="bs-sheet-inner">
      <header class="bs-sheet-head"><div><p class="bs-eyebrow">${esc(l.code)} · ${esc(l.type)}</p><h2 id="bsDrawerTitle">${esc(l.name)}</h2><div class="bs-badges">${badge(l.status)}${badge(l.gbp)}${iss.length ? `<span class="bs-badge" data-tone="warn"><i></i>${iss.length} beda dengan Google</span>` : ''}</div></div>${btn('', 'sheet-close', { icon: 'x', variant: 'icon ghost', title: 'Tutup' })}</header>
      ${tabs('drawer.tab', [['overview', 'Ringkasan'], ['compare', 'Bandingkan Google', iss.length || null], ['reviews', 'Ulasan', state.reviews.filter(rv => rv.code === l.code).length], ['history', 'Riwayat', hist.length], ['sync', 'Sinkronisasi']], t)}
      <div class="bs-sheet-body">${body}</div>
      <footer class="bs-sheet-foot">${btn('Hapus', 'delete-loc', { id: l.code, icon: 'trash', variant: 'danger ghost' })}${btn('', 'copy-link', { icon: 'link', variant: 'icon ghost', title: 'Salin tautan unit ini' })}<span class="bs-spacer"></span>${btn('Sinkronkan', 'sync-one', { id: l.code, icon: 'refresh', attrs: ui.running ? 'disabled' : '' })}${btn('Edit', 'edit-loc', { id: l.code, icon: 'edit', variant: 'primary' })}</footer></div>`;
  }

  /* ------------------------------------------------------------------ *
   * Modal & formulir
   * ------------------------------------------------------------------ */
  let modalSubmit = null, modalTrigger = null;
  function openModal(title, bodyHtml, { submit = 'Simpan', onSubmit = null, wide = false, desc = '', danger = false, footer = null } = {}) {
    if (!modal.open) modalTrigger = captureFocus();
    modalSubmit = onSubmit;
    destroyPicker();
    modal.classList.toggle('is-wide', !!wide);
    modal.classList.toggle('is-xl', wide === 'xl');
    modal.innerHTML = `<form id="bsModalForm" novalidate><header class="bs-modal-head"><div><h2 id="bsModalTitle">${esc(title)}</h2>${desc ? `<p>${desc}</p>` : ''}</div>${btn('', 'modal-close', { icon: 'x', variant: 'icon ghost', title: 'Tutup' })}</header>
      <div class="bs-modal-body">${bodyHtml}<p class="bs-form-error" id="bsFormError" role="alert"></p></div>
      <footer class="bs-modal-foot">${footer ?? (btn('Batal', 'modal-close', { variant: 'ghost' }) + (onSubmit ? `<button type="submit" class="bs-btn ${danger ? 'danger' : 'primary'}">${submit}</button>` : ''))}</footer></form>`;
    if (!modal.open) modal.showModal();
    modal.querySelector('.bs-modal-body :is(input:not([type=hidden]):not([type=file]):not([disabled]), select:not([disabled]), textarea)')?.focus();
  }
  const closeModal = () => { if (modal.open) modal.close(); };
  const field = ({ name, label, type = 'text', value = '', options = null, hint = '', full = false, attrs = 'required' }) => {
    const control = type === 'select' ? `<select name="${name}" id="f-${name}" ${attrs}>${opts(options, value)}</select>`
      : type === 'textarea' ? `<textarea name="${name}" id="f-${name}" rows="3" ${attrs}>${esc(value)}</textarea>`
      : type === 'checkbox' ? '' : `<input name="${name}" id="f-${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'step="any"' : ''} ${attrs}>`;
    if (type === 'checkbox') return `<label class="bs-checkline ${full ? 'full' : ''}"><input type="checkbox" name="${name}" id="f-${name}" ${value ? 'checked' : ''}><span>${label}</span></label>`;
    return `<div class="bs-field${full ? ' full' : ''}"><label for="f-${name}">${label}</label>${control}<small class="bs-field-hint" id="h-${name}">${hint}</small></div>`;
  };
  const formGrid = fields => `<div class="bs-form-grid">${fields.map(field).join('')}</div>`;
  function showErrors(errors) {
    modal.querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
    modal.querySelectorAll('.bs-field-hint.is-error').forEach(n => { n.classList.remove('is-error'); n.textContent = n.dataset.hint || ''; });
    if (typeof errors === 'string') { $('bsFormError').textContent = errors; return; }
    $('bsFormError').textContent = 'Periksa kembali isian yang ditandai.';
    let first = null;
    Object.entries(errors).forEach(([k, msg]) => {
      const input = modal.querySelector(`[name="${k}"]`), hint = $(`h-${k}`);
      if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', `h-${k}`); first ||= input; }
      if (hint) { hint.dataset.hint ??= hint.textContent; hint.textContent = msg; hint.classList.add('is-error'); }
    });
    first?.focus();
  }
  function confirmModal(title, text, confirm, run, danger = true) {
    openModal(title, `<p>${text}</p>`, { submit: confirm, danger, onSubmit: () => { run(); } });
  }
  const inIndonesia = (lat, lng) => lat >= -11.5 && lat <= 6.5 && lng >= 94 && lng <= 141.5;
  function validateLoc(p, self) {
    const e = {};
    ['name', 'city', 'province', 'address'].forEach(k => { p[k] = String(p[k] ?? '').trim(); if (!p[k]) e[k] = 'Wajib diisi.'; });
    p.phone = String(p.phone ?? '').trim(); p.hours = String(p.hours ?? '').trim();
    if (!TYPES.includes(p.type)) e.type = 'Pilih tipe yang valid.';
    if (p.status && !STATUSES.includes(p.status)) e.status = 'Status tidak valid.';
    const lat = Number(p.lat), lng = Number(p.lng);
    if (String(p.lat).trim() === '' || !isFinite(lat)) e.lat = 'Isi angka latitude.';
    if (String(p.lng).trim() === '' || !isFinite(lng)) e.lng = 'Isi angka longitude.';
    if (!e.lat && !e.lng && !inIndonesia(lat, lng)) e.lat = 'Titik berada di luar wilayah Indonesia.';
    if (!e.name && state.locations.some(x => x !== self && x.name.toLowerCase() === p.name.toLowerCase())) e.name = 'Nama ini sudah dipakai unit lain.';
    p.lat = String(p.lat).trim() !== '' && isFinite(lat) ? +lat.toFixed(6) : NaN;
    p.lng = String(p.lng).trim() !== '' && isFinite(lng) ? +lng.toFixed(6) : NaN;
    return e;
  }
  /* ---------- Jam operasional (seperti Google Business Profile) ---------- */
  const DAYS = [['mon', 'Senin', 'Sen'], ['tue', 'Selasa', 'Sel'], ['wed', 'Rabu', 'Rab'], ['thu', 'Kamis', 'Kam'], ['fri', 'Jumat', 'Jum'], ['sat', 'Sabtu', 'Sab'], ['sun', 'Minggu', 'Min']];
  const blankDays = () => Object.fromEntries(DAYS.map(([k]) => [k, { open: false, h24: false, ranges: [] }]));
  function presetHours(id) {
    const sp = blankDays();
    DAYS.forEach(([k], i) => {
      if (id === '24') Object.assign(sp[k], { open: true, h24: true });
      else if (id === 'mon-sat' && i < 6) Object.assign(sp[k], { open: true, ranges: [{ from: '08:00', to: '14:00' }] });
      else if (id === 'weekday' && i < 5) Object.assign(sp[k], { open: true, ranges: [{ from: '08:00', to: '15:00' }] });
    });
    return sp;
  }
  function parseHours(str) {
    const s0 = String(str || '').trim(), sp = blankDays(), short = DAYS.map(d => d[2]);
    if (!s0) return presetHours('weekday');
    let ok = false;
    s0.split(/;\s*/).forEach(seg => {
      let m = seg.match(/^Setiap hari\s+(.+)$/i), days, rest;
      if (m) { days = DAYS.map(d => d[0]); rest = m[1]; }
      else {
        m = seg.match(/^(Sen|Sel|Rab|Kam|Jum|Sab|Min)(?:\s*[–-]\s*(Sen|Sel|Rab|Kam|Jum|Sab|Min))?\s+(.+)$/);
        if (!m) return;
        const a = short.indexOf(m[1]), b = m[2] ? short.indexOf(m[2]) : a;
        days = [];
        for (let i = a; ; i = (i + 1) % 7) { days.push(DAYS[i][0]); if (i === b) break; }
        rest = m[3];
      }
      if (/^24 jam$/i.test(rest)) { days.forEach(k => Object.assign(sp[k], { open: true, h24: true, ranges: [] })); ok = true; return; }
      if (/^tutup$/i.test(rest)) { ok = true; return; }
      const ranges = [...rest.matchAll(/(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})/g)].map(r => ({ from: `${r[1].padStart(2, '0')}:${r[2]}`, to: `${r[3].padStart(2, '0')}:${r[4]}` }));
      if (!ranges.length) return;
      days.forEach(k => Object.assign(sp[k], { open: true, h24: false, ranges: ranges.map(r => ({ ...r })) }));
      ok = true;
    });
    return ok ? sp : presetHours('weekday');
  }
  function formatHours(sp) {
    const sig = k => (!sp[k].open ? 'X' : sp[k].h24 ? '24' : sp[k].ranges.map(r => `${r.from}-${r.to}`).join(','));
    const txt = k => (sp[k].h24 ? '24 jam' : sp[k].ranges.map(r => `${r.from.replace(':', '.')}–${r.to.replace(':', '.')}`).join(', '));
    if (sp.mon.open && DAYS.every(([k]) => sig(k) === sig('mon'))) return `Setiap hari ${txt('mon')}`;
    const groups = [];
    DAYS.forEach(([k, , sh]) => { const g = groups[groups.length - 1], sg = sig(k); if (g && g.sig === sg) g.end = sh; else groups.push({ sig: sg, start: sh, end: sh, k }); });
    const parts = groups.filter(g => g.sig !== 'X').map(g => `${g.start}${g.end !== g.start ? '–' + g.end : ''} ${txt(g.k)}`);
    return parts.length ? parts.join('; ') : 'Tutup';
  }
  function hoursError(sp) {
    if (!DAYS.some(([k]) => sp[k].open)) return 'Jam operasional: aktifkan minimal satu hari buka.';
    for (const [k, name] of DAYS) {
      const d = sp[k];
      if (!d.open || d.h24) continue;
      if (!d.ranges.length) return `Jam operasional ${name}: isi jam buka atau pilih 24 jam.`;
      const rs = [...d.ranges].sort((a, b) => a.from.localeCompare(b.from));
      for (let i = 0; i < rs.length; i++) {
        if (!rs[i].from || !rs[i].to) return `Jam operasional ${name}: lengkapi jam buka dan tutup.`;
        if (rs[i].to <= rs[i].from) return `Jam operasional ${name}: jam tutup harus setelah jam buka.`;
        if (i && rs[i].from < rs[i - 1].to) return `Jam operasional ${name}: rentang jam saling tumpang tindih.`;
      }
    }
    return '';
  }
  let hoursDraft = null;
  function hoursEditor() {
    const sp = hoursDraft;
    return `<div class="bs-hours" id="bsHours" role="group" aria-label="Jam operasional">
      <div class="bs-hours-presets"><span>Preset:</span>${btn('Hari kerja 08.00–15.00', 'hours-preset', { id: 'weekday', variant: 'sm ghost' })}${btn('Sen–Sab 08.00–14.00', 'hours-preset', { id: 'mon-sat', variant: 'sm ghost' })}${btn('24 jam setiap hari', 'hours-preset', { id: '24', variant: 'sm ghost' })}</div>
      ${DAYS.map(([k, name]) => {
        const d = sp[k];
        const ranges = !d.open ? '' : d.h24 ? `<span class="bs-hours-24">${ic('clock')}Buka 24 jam</span>` : d.ranges.map((r, i) => `<div class="bs-hours-range"><input type="time" value="${r.from}" step="300" data-hours-from="${k}:${i}" aria-label="${name} buka pukul"><span aria-hidden="true">–</span><input type="time" value="${r.to}" step="300" data-hours-to="${k}:${i}" aria-label="${name} tutup pukul">${d.ranges.length > 1 ? btn('', 'hours-del', { id: `${k}:${i}`, icon: 'x', variant: 'icon sm ghost', title: `Hapus rentang ${name}` }) : ''}</div>`).join('');
        return `<div class="bs-hours-row${d.open ? '' : ' is-closed'}" data-day="${k}">
          <span class="bs-hours-day">${name}</span>
          <label class="bs-switch"><input type="checkbox" data-hours-open="${k}" ${d.open ? 'checked' : ''} aria-label="${name} buka"><span></span><em data-no-i18n>${d.open ? L2(['Buka', 'Open']) : L2(['Tutup', 'Closed'])}</em></label>
          <div class="bs-hours-ranges">${ranges}${d.open ? `<div class="bs-hours-opts">${!d.h24 && d.ranges.length < 3 ? btn('Tambah jam', 'hours-add', { id: k, icon: 'plus', variant: 'sm ghost' }) : ''}<label class="bs-checkline"><input type="checkbox" data-hours-allday="${k}" ${d.h24 ? 'checked' : ''}><span>24 jam</span></label></div>` : ''}</div>
        </div>`;
      }).join('')}
      <div class="bs-hours-foot">${btn('Terapkan Senin ke semua hari buka', 'hours-copy', { icon: 'copy', variant: 'sm' })}<span class="bs-hours-summary" data-no-i18n>${ic('clock')}<b id="bsHoursSummary">${esc(formatHours(sp))}</b></span></div>
    </div>`;
  }
  function refreshHours(focusSel) {
    const el = $('bsHours'); if (!el) return;
    el.outerHTML = hoursEditor();
    if (focusSel) modal.querySelector(focusSel)?.focus();
  }
  const updateHoursSummary = () => { const el = $('bsHoursSummary'); if (el) el.textContent = formatHours(hoursDraft); };

  /* ---------- Peta pemilih titik lokasi ---------- */
  let pickMap = null, pickMarker = null, pickSelf = null;
  function destroyPicker() { if (pickMap) { pickMap.remove(); pickMap = null; pickMarker = null; } }
  function pickerBlock(lat, lng) {
    return `<div class="bs-picker">
      <div class="bs-pick-map" id="bsPickMap" role="application" aria-label="Peta pemilihan titik lokasi"></div>
      <div class="bs-picker-side">
        ${field({ name: 'lat', label: 'Latitude', type: 'number', value: lat ?? '', hint: 'Contoh: -6.9175' })}
        ${field({ name: 'lng', label: 'Longitude', type: 'number', value: lng ?? '', hint: 'Contoh: 107.6191' })}
        <div class="bs-btn-row">${btn('Gunakan lokasi saya', 'pick-geo', { icon: 'locate', variant: 'sm' })}${btn('Pusatkan ke titik', 'pick-center', { icon: 'pin', variant: 'sm ghost' })}</div>
        <p class="bs-pick-near" id="bsPickNear" role="status" aria-live="polite"></p>
      </div></div>`;
  }
  function pickNearest(lat, lng) {
    const out = $('bsPickNear'); if (!out) return;
    if (!isFinite(lat) || !isFinite(lng)) { out.textContent = 'Klik peta untuk menandai titik lokasi.'; out.dataset.tone = ''; return; }
    let best = null;
    state.locations.forEach(l => { if (l === pickSelf) return; const d = distM(l, { lat, lng }); if (!best || d < best.d) best = { l, d }; });
    if (!best) { out.textContent = ''; return; }
    out.dataset.tone = best.d <= state.settings.dupRadius ? 'warn' : '';
    out.textContent = `Unit terdekat: ${best.l.name} — ${fmtDist(best.d)}${best.d <= state.settings.dupRadius ? ' (kemungkinan duplikat)' : ''}`;
  }
  function setPickInputs(ll) {
    const la = modal.querySelector('[name="lat"]'), ln = modal.querySelector('[name="lng"]');
    if (la) la.value = ll.lat.toFixed(6);
    if (ln) ln.value = ll.lng.toFixed(6);
    pickNearest(ll.lat, ll.lng);
  }
  function placePin(ll, pan) {
    if (!pickMap) return;
    if (!pickMarker) {
      pickMarker = L.marker(ll, { draggable: true, keyboard: true, title: 'Titik lokasi — geser untuk memindahkan', icon: L.divIcon({ className: 'bs-pin', html: '<span></span>', iconSize: [28, 38], iconAnchor: [14, 36] }) }).addTo(pickMap);
      pickMarker.on('dragend', () => setPickInputs(pickMarker.getLatLng()));
    } else pickMarker.setLatLng(ll);
    if (pan) pickMap.setView(ll, Math.max(pickMap.getZoom(), 15));
  }
  function mountPicker(lat, lng, self) {
    destroyPicker();
    pickSelf = self || null;
    const el = $('bsPickMap'); if (!el) return;
    const has = isFinite(Number(lat)) && isFinite(Number(lng)) && lat !== '' && lat != null;
    if (typeof L === 'undefined') { el.innerHTML = `<div class="bs-map-fallback">${ic('map')}<p>Peta tidak dapat dimuat. Isi koordinat secara manual.</p></div>`; pickNearest(Number(lat), Number(lng)); return; }
    pickMap = L.map(el, { zoomControl: true }).setView(has ? [Number(lat), Number(lng)] : [-2.5, 118], has ? 16 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(pickMap);
    state.locations.filter(l => l !== pickSelf).slice(0, 2000).forEach(l => L.circleMarker([l.lat, l.lng], { radius: 4, color: '#fff', weight: 1, fillColor: '#8a97a8', fillOpacity: 0.9 }).bindTooltip(l.name).addTo(pickMap));
    if (has) placePin([Number(lat), Number(lng)]);
    pickMap.on('click', e => { placePin(e.latlng); setPickInputs(e.latlng); });
    pickNearest(Number(lat), Number(lng));
    setTimeout(() => pickMap && pickMap.invalidateSize(), 120);
  }
  function syncPickerFromInputs() {
    const lat = Number(modal.querySelector('[name="lat"]')?.value), lng = Number(modal.querySelector('[name="lng"]')?.value);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    placePin([lat, lng], true);
    pickNearest(lat, lng);
  }

  function locationForm(code) {
    if (!guard('locations.write')) return;
    const l = code ? byCode().get(code) : null;
    hoursDraft = l?.hoursSpec ? JSON.parse(JSON.stringify(l.hoursSpec)) : parseHours(l?.hours || HOURS[0]);
    openModal(l ? `Edit ${l.name}` : 'Tambah unit kerja',
      `<h3 class="bs-form-section">Informasi dasar</h3>` + formGrid([
        { name: 'name', label: 'Nama unit', value: l?.name, full: true, hint: 'Contoh: KCP Bandung Dago' },
        { name: 'type', label: 'Tipe', type: 'select', options: TYPES, value: l?.type || 'KCP' },
        { name: 'status', label: 'Status operasional', type: 'select', options: STATUSES, value: l?.status || 'Belum Sync' },
        { name: 'city', label: 'Kota', value: l?.city }, { name: 'province', label: 'Provinsi', value: l?.province },
        { name: 'address', label: 'Alamat', value: l?.address, full: true },
        { name: 'phone', label: 'Telepon', value: l?.phone, attrs: '' }
      ]) +
      `<h3 class="bs-form-section">Titik lokasi</h3><p class="bs-form-help">Klik peta atau geser penanda untuk menandai titik. Koordinat juga dapat diketik.</p>` + pickerBlock(l?.lat, l?.lng) +
      `<h3 class="bs-form-section">Jam operasional</h3><p class="bs-form-help">Atur jam buka setiap hari seperti di Google Business Profile.</p>` + hoursEditor(), {
      wide: 'xl', desc: l ? 'Perubahan dicatat di Riwayat beserta nilai sebelum dan sesudahnya.' : 'Unit baru berstatus “Belum Sync” sampai disinkronkan ke Google.',
      submit: l ? 'Simpan perubahan' : 'Tambah unit',
      onSubmit: p => {
        const herr = hoursError(hoursDraft);
        if (herr) return herr;
        p.hours = formatHours(hoursDraft);
        const e = validateLoc(p, l);
        if (Object.keys(e).length) return e;
        p.region = regionOf(p.province);
        p.hoursSpec = JSON.parse(JSON.stringify(hoursDraft));
        if (l) {
          const changes = diff(l, p, ['name', 'type', 'status', 'city', 'province', 'address', 'phone', 'hours', 'lat', 'lng']);
          if (!changes.length) return 'Tidak ada perubahan untuk disimpan.';
          Object.assign(l, p, { updatedAt: Date.now(), updatedBy: ME.name });
          log('Unit Kerja', 'Memperbarui unit', { target: l.code, changes });
          const done = () => toast(`${l.name} diperbarui (${changes.length} kolom).`, { tone: 'good', action: issuesOf(l).length ? { label: 'Sinkronkan', run: () => runSync([l.code], { label: l.name }) } : null });
          if (isLive()) remote('PATCH', `/locations/${encodeURIComponent(l.code)}`, p).then(ok => ok && toast(`${p.name} tersimpan di server.`, { tone: 'good' })); else done();
        } else {
          const code2 = `DM-${String(++state.seq.loc).padStart(3, '0')}`;
          state.locations.unshift({ ...p, code: code2, status: p.status || 'Belum Sync', gbp: 'Belum Diklaim', google: null, updatedAt: Date.now(), updatedBy: ME.name, lastSync: null });
          log('Unit Kerja', 'Menambahkan unit', { target: code2, detail: p.name });
          if (isLive()) remote('POST', '/locations', p).then(ok => ok && toast(`${p.name} ditambahkan ke server.`, { tone: 'good' }));
          else toast(`${p.name} ditambahkan.`, { tone: 'good', action: { label: 'Lihat', run: () => openDrawer(code2) } });
        }
      }
    });
    mountPicker(l?.lat, l?.lng, l);
  }
  function noteModal(title, label, onSave, value = '') {
    openModal(title, formGrid([{ name: 'text', label, type: 'textarea', value, full: true, attrs: 'required maxlength="500"' }]), {
      submit: 'Simpan catatan', onSubmit: p => { const t = String(p.text || '').trim(); if (!t) return { text: 'Catatan wajib diisi.' }; onSave(t); }
    });
  }

  /* Impor CSV */
  const COLS = { kode: 'code', code: 'code', nama: 'name', name: 'name', tipe: 'type', type: 'type', kota: 'city', city: 'city', provinsi: 'province', province: 'province', alamat: 'address', address: 'address', telepon: 'phone', phone: 'phone', jam: 'hours', 'jam operasional': 'hours', hours: 'hours', lat: 'lat', latitude: 'lat', lng: 'lng', lon: 'lng', longitude: 'lng', status: 'status' };
  const TEMPLATE_HEAD = ['kode', 'nama', 'tipe', 'kota', 'provinsi', 'alamat', 'telepon', 'jam', 'lat', 'lng', 'status'];
  let importDraft = null;
  function sampleCSV(n = 25) {
    const r = rng(Date.now() % 100000), base = state.locations.filter(l => l.type === 'Kantor Cabang');
    const lines = [TEMPLATE_HEAD.join(',')];
    for (let i = 0; i < n; i++) {
      const b = base[i % base.length], p = offset(b.lat, b.lng, 1500 + r() * 6000, r() * 6.28), type = pick(r, ['KCP', 'Unit', 'ATM']);
      const name = `${type === 'ATM' ? 'ATM BRI' : type === 'Unit' ? 'BRI Unit' : 'KCP'} ${b.city} ${pick(r, ['Raya', 'Baru', 'Timur', 'Barat', 'Utara', 'Selatan', 'Indah', 'Jaya'])} ${i + 1}`;
      const bad = i === 7 ? 'lat' : i === 15 ? 'status' : '';
      lines.push(['', name, type, b.city, b.province, `Jl. ${pick(r, STREETS)} No. ${10 + i}`, `(0${21 + i}) 77${1000 + i}`, type === 'ATM' ? HOURS[3] : HOURS[0], bad === 'lat' ? '' : p.lat.toFixed(5), p.lng.toFixed(5), bad === 'status' ? 'Aktif?' : 'Belum Sync'].map(v => /[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(','));
    }
    return lines.join('\n');
  }
  function analyzeImport(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { error: 'Data kosong. Sertakan baris judul kolom dan minimal satu baris data.' };
    const headRow = rows[0].map(h => COLS[h.trim().toLowerCase()] || null);
    if (!headRow.includes('name') || !headRow.includes('lat')) return { error: 'Kolom wajib “nama”, “lat”, dan “lng” tidak ditemukan. Gunakan template.' };
    const seenNames = new Set();
    const items = rows.slice(1).map((cols, i) => {
      const p = {};
      headRow.forEach((k, j) => { if (k) p[k] = String(cols[j] ?? '').trim(); });
      p.type = TYPES.find(t => t.toLowerCase() === String(p.type || '').toLowerCase()) || p.type || 'Unit';
      p.status = STATUSES.find(t => t.toLowerCase() === String(p.status || '').toLowerCase()) || (p.status ? p.status : 'Belum Sync');
      const existing = p.code ? byCode().get(p.code) : null;
      const e = validateLoc(p, existing);
      const key = String(p.name).toLowerCase();
      if (!e.name && seenNames.has(key)) e.name = 'Nama ganda di dalam file.';
      seenNames.add(key);
      return { line: i + 2, p, existing, errors: Object.values(e) };
    });
    items.sort((a, b) => (b.errors.length ? 1 : 0) - (a.errors.length ? 1 : 0) || a.line - b.line); // baris bermasalah di atas
    return { items };
  }
  function importModal(text = '') {
    if (!guard('locations.import')) return;
    const d = importDraft;
    const preview = d && d.items ? (() => {
      const ok = d.items.filter(x => !x.errors.length), upd = ok.filter(x => x.existing).length;
      return `<div class="bs-import-summary"><span>${badge('Berhasil', `${ok.length} valid`)}</span><span>${d.items.length - ok.length ? badge('Gagal', `${d.items.length - ok.length} perlu diperbaiki`) : ''}</span><span>${upd ? badge('Belum Sync', `${upd} memperbarui unit yang ada`) : ''}</span></div>
        <div class="bs-table-wrap bs-import-table" tabindex="0" role="region" aria-label="Pratinjau impor"><table class="bs-table"><thead><tr><th>Baris</th><th>Nama</th><th>Tipe</th><th>Kota</th><th>Koordinat</th><th>Hasil</th></tr></thead><tbody>${d.items.map(x => `<tr class="${x.errors.length ? 'is-error' : ''}"><td>${x.line}</td><td>${esc(x.p.name)}</td><td>${esc(x.p.type)}</td><td>${esc(x.p.city)}</td><td>${isFinite(x.p.lat) ? `${x.p.lat}, ${x.p.lng}` : '—'}</td><td class="bs-td-wrap">${x.errors.length ? `<span class="bs-err">${ic('alert')}${esc(x.errors.join(' '))}</span>` : `<span class="bs-ok">${ic('check')}${x.existing ? 'Perbarui' : 'Baru'}</span>`}</td></tr>`).join('')}</tbody></table></div>`;
    })() : '';
    openModal('Impor unit kerja', `
      <ol class="bs-import-steps"><li class="${d?.items ? 'is-done' : 'is-current'}">Tempel atau unggah CSV</li><li class="${d?.items ? 'is-current' : ''}">Periksa hasil validasi</li><li>Impor</li></ol>
      <div class="bs-import-input">
        <div class="bs-btn-row">${btn('Unduh template', 'import-template', { icon: 'download', variant: 'sm' })}${btn('Isi contoh 25 unit baru', 'import-sample', { icon: 'zap', variant: 'sm ghost' })}
          <label class="bs-btn sm ghost bs-file">${ic('upload')}<span>Pilih file CSV</span><input type="file" id="bsImportFile" accept=".csv,text/csv" class="bs-sr"></label></div>
        <div class="bs-field full"><label for="bsImportText">Data CSV</label><textarea id="bsImportText" name="csv" rows="${d?.items ? 4 : 8}" spellcheck="false" placeholder="${TEMPLATE_HEAD.join(',')}">${esc(text)}</textarea><small class="bs-field-hint">Kolom wajib: nama, tipe, kota, provinsi, alamat, lat, lng. Isi “kode” untuk memperbarui unit yang ada. Pemisah koma atau titik koma.</small></div>
        ${d?.error ? `<p class="bs-form-error">${esc(d.error)}</p>` : ''}
      </div>${preview}`, {
      wide: true,
      footer: btn('Batal', 'modal-close', { variant: 'ghost' }) + btn('Periksa data', 'import-parse', { icon: 'check', variant: d?.items ? '' : 'primary' }) +
        (d?.items ? btn(`Impor ${d.items.filter(x => !x.errors.length).length} baris valid`, 'import-commit', { icon: 'upload', variant: 'primary', attrs: d.items.some(x => !x.errors.length) ? '' : 'disabled' }) : '')
    });
  }
  function commitImport() {
    const ok = importDraft.items.filter(x => !x.errors.length);
    const snap = snapshot(), t0 = performance.now();
    let added = 0, updated = 0;
    const payload = [];
    ok.forEach(({ p, existing }) => {
      p.region = regionOf(p.province);
      const clean = { name: p.name, type: p.type, city: p.city, province: p.province, region: p.region, address: p.address, phone: p.phone, hours: p.hours || HOURS[0], lat: p.lat, lng: p.lng, status: p.status };
      payload.push({ ...clean, code: existing ? existing.code : null });
      if (existing) {
        const changes = diff(existing, clean, Object.keys(clean));
        if (changes.length) { Object.assign(existing, clean, { updatedAt: Date.now(), updatedBy: ME.name }); log('Unit Kerja', 'Memperbarui unit via impor', { target: existing.code, changes }); updated++; }
      } else {
        const code = `DM-${String(++state.seq.loc).padStart(3, '0')}`;
        state.locations.unshift({ ...clean, code, gbp: 'Belum Diklaim', google: null, updatedAt: Date.now(), updatedBy: ME.name, lastSync: null });
        added++;
      }
    });
    log('Unit Kerja', 'Mengimpor data massal', { detail: `${added} unit baru, ${updated} diperbarui` });
    remote('POST', '/locations/import', { items: payload });
    importDraft = null; closeModal(); touch();
    ui.loc.quick = 'all'; ui.loc.sort = 'updatedAt'; ui.loc.dir = -1; ui.loc.page = 1;
    navigate('locations');
    toast(`Impor selesai dalam ${Math.round(performance.now() - t0)} ms — ${added} unit baru, ${updated} diperbarui.`, { tone: 'good', undo: snap });
  }

  /* ------------------------------------------------------------------ *
   * Command palette
   * ------------------------------------------------------------------ */
  let palItems = [], palIndex = 0;
  const PAL_ACTIONS = [
    ['Tambah unit kerja', 'plus', () => locationForm(), 'locations.write'], ['Impor data CSV', 'upload', () => { importDraft = null; importModal(); }, 'locations.import'],
    ['Sinkronkan semua unit', 'refresh', () => runSync(null), 'sync.run'], ['Usulkan titik baru', 'pin', () => pointForm(), 'claims.manage'],
    ['Salin tautan halaman ini', 'link', () => copyLink()],
    ['Ganti tema terang/gelap', 'moon', () => toggleTheme()], ['Pintasan keyboard', 'keyboard', () => shortcutsModal()]
  ];
  function openPalette() {
    palette.innerHTML = `<div class="bs-pal-search">${ic('search')}<input id="bsPalInput" type="text" role="combobox" aria-expanded="true" aria-controls="bsPalList" aria-autocomplete="list" placeholder="Cari unit kerja, menu, atau aksi…" autocomplete="off"><kbd>Esc</kbd></div><div id="bsPalList" class="bs-pal-list" role="listbox"></div><footer class="bs-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> pilih</span><span><kbd>Enter</kbd> buka</span></footer>`;
    palette.showModal();
    renderPalette('');
    $('bsPalInput').focus();
  }
  function renderPalette(q) {
    q = q.trim().toLowerCase();
    const nav = NAV_ITEMS.filter(n => canView(n.id) && (!q || n.label.toLowerCase().includes(q))).map(n => ({ group: 'Menu', icon: n.icon, label: n.label, sub: '', run: () => navigate(n.id) }));
    const acts = PAL_ACTIONS.filter(a => can(a[3]) && (!q || a[0].toLowerCase().includes(q))).map(([label, icon, run]) => ({ group: 'Aksi', icon, label, sub: '', run }));
    const locs = q ? state.locations.filter(l => `${l.name} ${l.code} ${l.city}`.toLowerCase().includes(q)).slice(0, 8).map(l => ({ group: 'Unit kerja', icon: 'building', label: l.name, sub: `${l.code} · ${l.city}`, run: () => openDrawer(l.code) })) : [];
    palItems = [...locs, ...nav, ...acts];
    palIndex = 0;
    let lastGroup = '';
    $('bsPalList').innerHTML = palItems.length ? palItems.map((it, i) => {
      const g = it.group !== lastGroup ? `<div class="bs-pal-group" role="presentation">${it.group}</div>` : '';
      lastGroup = it.group;
      return `${g}<div class="bs-pal-item" role="option" id="pal-${i}" data-pal="${i}" aria-selected="${i === 0}">${ic(it.icon)}<span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></div>`;
    }).join('') : `<p class="bs-pal-empty">Tidak ada hasil untuk “${esc(q)}”.</p>`;
    $('bsPalInput')?.setAttribute('aria-activedescendant', palItems.length ? 'pal-0' : '');
  }
  function movePalette(d) {
    if (!palItems.length) return;
    palIndex = (palIndex + d + palItems.length) % palItems.length;
    palette.querySelectorAll('[data-pal]').forEach(n => n.setAttribute('aria-selected', String(Number(n.dataset.pal) === palIndex)));
    $(`pal-${palIndex}`)?.scrollIntoView({ block: 'nearest' });
    $('bsPalInput').setAttribute('aria-activedescendant', `pal-${palIndex}`);
  }
  function runPalette(i) { const it = palItems[i]; if (!it) return; palette.close(); it.run(); }
  palette.addEventListener('input', e => { if (e.target.id === 'bsPalInput') renderPalette(e.target.value); });
  palette.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(palIndex); }
  });
  palette.addEventListener('click', e => { const it = e.target.closest('[data-pal]'); if (it) runPalette(Number(it.dataset.pal)); else if (e.target === palette) palette.close(); });

  function viewLiveState() {
    const e = ui.live.error, url = MODE.getBaseUrl();
    if (!e) return `<div class="bs-live-state" aria-busy="true"><span class="bs-spinner" aria-hidden="true"></span><h1 id="bsTitle" tabindex="-1">Memuat data dari server…</h1><p>${esc(url)}</p></div>`;
    return `<div class="bs-live-state is-error">${ic('alert')}<h1 id="bsTitle" tabindex="-1">Data Live tidak dapat dimuat</h1><p>${esc(e.message)}</p><p class="bs-muted">Server: ${esc(url || 'belum diatur')}</p>
      <div class="bs-btn-row">${btn('Coba lagi', 'live-retry', { icon: 'refresh', variant: 'primary' })}${btn('Ubah server / masuk ulang', 'live-relogin', { icon: 'plug' })}${btn('Beralih ke Mode Demo', 'mode-demo', { icon: 'zap', variant: 'ghost' })}</div></div>`;
  }
  function toggleModeMenu(force) {
    const pop = $('bsModeMenu'), open = force ?? pop.hidden;
    pop.hidden = !open;
    $('bsModeBtn').setAttribute('aria-expanded', String(open));
    if (!open) return;
    if (!$('bsNotif').hidden) toggleNotif(false);
    const live = isLive(), host = MODE.host(), hasSession = MODE.hasSession() && MODE.getBaseUrl();
    const st = !live ? '' : ui.live.error ? 'Terputus' : ui.live.ready ? 'Terhubung' : 'Menghubungkan…';
    pop.innerHTML = `<div class="bs-menu-head">Mode aplikasi</div>
      <button type="button" class="bs-menu-item" role="menuitemradio" aria-checked="${!live}" data-action="mode-demo"><span class="bs-mode-badge" data-state="demo">${ic('zap')}</span><span><strong>Mode Demo</strong><small>Data simulasi di browser ini — aman untuk mencoba</small></span>${!live ? ic('check', 'bs-menu-check') : ''}</button>
      <button type="button" class="bs-menu-item" role="menuitemradio" aria-checked="${live}" data-action="mode-live"><span class="bs-mode-badge" data-state="online">${ic('plug')}</span><span><strong>Live</strong><small>${live ? `${st} · ${esc(host)}` : hasSession ? `Sesi aktif · ${esc(host)}` : 'Data asli dari server BranchSync — perlu masuk'}</small></span>${live ? ic('check', 'bs-menu-check') : ''}</button>
      ${live ? '' : `<div class="bs-menu-sep" role="separator"></div><div class="bs-menu-head">Lihat sebagai (Demo)</div>${(state.roles || []).map(r => `<button type="button" class="bs-menu-item sm" role="menuitemradio" aria-checked="${ME.role === r.name}" data-action="demo-role" data-id="${esc(r.name)}">${ic('users')}<span>${esc(r.name)}</span>${ME.role === r.name ? ic('check', 'bs-menu-check') : ''}</button>`).join('')}`}
      <div class="bs-menu-sep" role="separator"></div>
      ${live ? `<button type="button" class="bs-menu-item sm" role="menuitem" data-action="live-retry">${ic('refresh')}<span>Muat ulang data</span></button>` : ''}
      <button type="button" class="bs-menu-item sm" role="menuitem" data-view="settings">${ic('sliders')}<span>Pengaturan koneksi</span></button>`;
    (pop.querySelector('[aria-checked="true"]') || pop.querySelector('[role^="menuitem"]')).focus();
  }
  const resetReviewUi = () => { ui.reviews = { account: '', location: '', rating: '', status: '', sort: 'newest', q: '', limit: 20, editing: null, drafts: {} }; };
  function activateLive() {
    resetReviewUi();
    MODE.setMode('live');
    ME = userFromSession();
    ui.live = { ready: false, loading: true, error: null, syncedAt: 0, pending: 0 };
    ui.loc.selected.clear(); ui.reviews.editing = null; renderedView = null;
    navigate(ui.view);
    loadLive().then(ok => ok && toast(`Terhubung ke ${MODE.host()}. Selamat datang, ${ME.name}!`, { tone: 'good' }));
  }
  function liveConnectModal(message = '') {
    openModal('Sambungkan ke Live', `${message ? `<p class="bs-form-error bs-form-top">${esc(message)}</p>` : ''}
      <p class="bs-muted bs-gap-b">Masuk dengan akun BranchSync untuk memakai data asli dari server. Data Mode Demo tetap tersimpan di browser ini.</p>
      ${formGrid([
        { name: 'url', label: 'URL server API', type: 'url', value: MODE.getBaseUrl(), full: true, hint: 'Contoh: https://api.branchsync.co.id/v1', attrs: 'required autocomplete="url" spellcheck="false" autocapitalize="none"' },
        { name: 'username', label: 'Nama pengguna', full: true, attrs: 'required autocomplete="username" autocapitalize="none" spellcheck="false"' },
        { name: 'password', label: 'Kata sandi', type: 'password', full: true, attrs: 'required autocomplete="current-password"' }
      ])}
      <div class="bs-divider"><span>atau</span></div>
      ${btn('Masuk dengan Google', 'live-google', { icon: 'external', variant: 'block' })}`, {
      submit: 'Sambungkan',
      onSubmit: async p => {
        const e = {};
        let url = '';
        try { url = MODE.normalizeUrl(p.url); if (!url) e.url = 'Isi URL server API.'; } catch (err) { e.url = err.message; }
        if (!String(p.username || '').trim()) e.username = 'Isi nama pengguna.';
        if (!p.password) e.password = 'Isi kata sandi.';
        if (Object.keys(e).length) return e;
        try {
          const res = await MODE.request('POST', '/auth/login', { username: p.username.trim(), password: p.password }, { auth: false, baseUrl: url });
          MODE.setBaseUrl(url);
          MODE.setSession(res && res.token, res && res.user);
        } catch (err) { return err.status === 401 ? { password: 'Nama pengguna atau kata sandi salah.' } : err.message; }
        setTimeout(activateLive, 0);
      }
    });
    modal.querySelector(MODE.getBaseUrl() ? '[name="username"]' : '[name="url"]')?.focus();
  }
  async function checkHealth() {
    const out = $('bsHealth'), input = $('bsApiUrl');
    let url;
    try { url = MODE.normalizeUrl(input.value); } catch (e) { out.dataset.tone = 'bad'; out.textContent = e.message; return; }
    if (!url) { out.dataset.tone = 'bad'; out.textContent = 'Isi URL server terlebih dahulu.'; return; }
    out.dataset.tone = ''; out.textContent = 'Menguji…';
    const t0 = performance.now();
    try {
      const res = await MODE.request('GET', '/health', undefined, { auth: false, baseUrl: url, timeout: 8000 });
      out.dataset.tone = 'good';
      out.textContent = `Terhubung · ${Math.round(performance.now() - t0)} ms${res && res.version ? ` · versi ${res.version}` : ''}`;
    } catch (e) { out.dataset.tone = 'bad'; out.textContent = e.message; }
  }
  function saveApiUrl() {
    const input = $('bsApiUrl'), before = MODE.getBaseUrl();
    let url;
    try { url = MODE.setBaseUrl(input.value); } catch (e) { toast(e.message, { tone: 'bad' }); input.focus(); return; }
    input.value = url;
    if (isLive() && url !== before) { sessionExpired('URL server diubah. Silakan masuk ke server yang baru.'); return; }
    toast(url ? 'URL server disimpan.' : 'URL server dihapus.', { tone: 'good' });
  }
  function shortcutsModal() {
    openModal('Pintasan keyboard', `<dl class="bs-shortcuts">${[[`${MOD} K`, 'Cari unit kerja, menu, atau aksi'], ['/', 'Fokus ke kolom pencarian di halaman'], ['N', 'Tambah unit kerja baru'], ['?', 'Tampilkan pintasan ini'], ['Esc', 'Tutup dialog atau panel']].map(([k, d]) => `<div><dt>${k.split(' ').map(x => `<kbd>${x}</kbd>`).join('')}</dt><dd>${d}</dd></div>`).join('')}</dl>`, { footer: btn('Tutup', 'modal-close', { variant: 'primary' }) });
  }

  /* ------------------------------------------------------------------ *
   * Toast
   * ------------------------------------------------------------------ */
  const toastActions = new Map();
  let toastSeq = 0;
  function toast(msg, { tone = 'info', action = null, undo = null } = {}) {
    const id = ++toastSeq;
    if (undo && isLive()) undo = null; // perubahan Live sudah tersimpan di server
    if (undo) action = { label: 'Urungkan', run: () => { state = JSON.parse(undo); ui.loc.selected.clear(); touch(); render(); renderDrawer(); toast('Perubahan dibatalkan.'); } };
    if (action) toastActions.set(id, action.run);
    const el = document.createElement('div');
    el.className = 'bs-toast'; el.dataset.tone = tone; el.dataset.toast = id;
    el.innerHTML = `${ic(tone === 'good' ? 'check' : tone === 'bad' || tone === 'warn' ? 'alert' : 'info')}<p>${esc(msg)}</p>${action ? `<button type="button" class="bs-btn sm ghost" data-action="toast-act" data-id="${id}">${esc(action.label)}</button>` : ''}<button type="button" class="bs-icon-btn sm" data-action="toast-close" data-id="${id}" aria-label="Tutup notifikasi">${ic('x')}</button>`;
    $('bsToasts').append(el);
    const timer = setTimeout(() => dismissToast(id), action ? 8000 : 4500);
    el.addEventListener('mouseenter', () => clearTimeout(timer), { once: true });
    el.addEventListener('mouseleave', () => setTimeout(() => dismissToast(id), 2500), { once: true });
  }
  function dismissToast(id) { shell.querySelector(`[data-toast="${id}"]`)?.remove(); toastActions.delete(Number(id)); }

  /* ------------------------------------------------------------------ *
   * Bahasa — teks antarmuka ditulis dalam Bahasa Indonesia, lalu
   * diterjemahkan ke Inggris lewat kamus admin-i18n.js (MutationObserver).
   * Konten pengguna (nama unit, isi ulasan, input) tidak diterjemahkan.
   * ------------------------------------------------------------------ */
  const I18N = window.BranchAdminI18n || { dict: {}, patterns: [] };
  const ATTRS = ['placeholder', 'aria-label', 'title', 'data-label'];
  const SKIP = 'textarea, script, style, code, [data-no-i18n], .bs-review-text:not(.bs-muted), .bs-reply p, .bs-diff del, .bs-diff ins, .bs-val, .bs-note';
  const origText = new WeakMap(), origAttr = new WeakMap();
  const missing = new Set();
  function trCore(core) {
    if (typeof I18N.translate === 'function') return I18N.translate(core);
    if (Object.prototype.hasOwnProperty.call(I18N.dict, core)) return I18N.dict[core];
    for (const [re, rep] of I18N.patterns) { re.lastIndex = 0; if (re.test(core)) { re.lastIndex = 0; return core.replace(re, rep); } }
    return null;
  }
  function trString(str) {
    const core = str.trim();
    if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return str;
    const out = trCore(core);
    if (out == null) { if (window.BS_I18N_DEBUG) missing.add(core); return str; }
    return str.replace(core, out);
  }
  function translateNode(root) {
    if (!isEn() || !root) return;
    if (root.nodeType === 3) {
      if (root.parentElement && root.parentElement.closest(SKIP)) return;
      const v = trString(root.nodeValue); if (v !== root.nodeValue) { if (!origText.has(root)) origText.set(root, root.nodeValue); root.nodeValue = v; }
      return;
    }
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = []; let n;
    while ((n = walker.nextNode())) texts.push(n);
    texts.forEach(translateNode);
    [root, ...root.querySelectorAll('[placeholder],[aria-label],[title],[data-label]')].forEach(el => ATTRS.forEach(a => {
      const v = el.getAttribute(a); if (!v || el.closest(SKIP)) return;
      const t = trString(v); if (t === v) return;
      const m = origAttr.get(el) || {}; if (!(a in m)) m[a] = v; origAttr.set(el, m);
      el.setAttribute(a, t);
    }));
  }
  function restoreNode(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) if (origText.has(n)) { n.nodeValue = origText.get(n); origText.delete(n); }
    [root, ...root.querySelectorAll('[placeholder],[aria-label],[title],[data-label]')].forEach(el => { const m = origAttr.get(el); if (m) { Object.entries(m).forEach(([a, v]) => el.setAttribute(a, v)); origAttr.delete(el); } });
  }
  const observer = new MutationObserver(muts => {
    if (!isEn()) return;
    observer.disconnect();
    muts.forEach(m => {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode);
      else if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
    });
    watch();
  });
  const watch = () => observer.observe(shell, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  function translateAll() { observer.disconnect(); if (isEn()) translateNode(shell); else restoreNode(shell); watch(); }
  window.BranchAdminMissing = () => [...missing].sort();
  function setLanguage(lang) {
    lang = lang === 'en' ? 'en' : 'id';
    if (typeof language !== 'undefined') language = lang; // eslint-disable-line no-global-assign
    try { localStorage.setItem('branchSyncLanguage', lang); } catch (_) {}
    toggleModeMenu(false); toggleNotif(false); closeModal(); if (palette.open) palette.close();
    observer.disconnect();
    restoreNode(shell);
    document.documentElement.lang = shell.lang = lang;
    renderedView = null;
    render();
    translateAll();
    if (typeof applyLanguage === 'function') { try { applyLanguage(); } catch (_) {} } // sinkronkan halaman utama
    document.documentElement.lang = lang;
    shell.querySelector(`#bsLang [data-id="${lang}"]`)?.focus();
    toast(lang === 'en' ? 'Language changed to English.' : 'Bahasa diganti ke Bahasa Indonesia.');
  }

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */
  let renderedView = null;
  const VIEWS = { dashboard: viewDashboard, map: viewMap, locations: viewLocations, discrepancies: viewDiscrepancies, duplicates: viewDuplicates, claims: viewClaims, approvals: viewApprovals, sync: viewSync, audit: viewAudit, sla: viewSla, access: viewAccess, integrations: viewIntegrations, settings: viewSettings, reviews: viewReviews, reports: viewReports, guide: viewGuide, scenarios: viewScenarios };
  function renderNav() {
    $('bsNav').innerHTML = NAV.map(g => ({ ...g, items: g.items.filter(n => canView(n.id)) })).filter(g => g.items.length).map(g => `<p class="bs-nav-label">${g.group}</p>${g.items.map(n => { const c = n.count ? n.count() : 0; return `<button type="button" data-view="${n.id}" ${ui.view === n.id ? 'aria-current="page"' : ''} title="${esc(n.label)}">${ic(n.icon)}<span class="bs-nav-text">${n.label}</span>${c ? `<span class="bs-nav-count" aria-label="${c} perlu perhatian">${c > 99 ? '99+' : c}</span>` : ''}</button>`; }).join('')}`).join('');
  }
  function updateChrome() {
    const last = state.runs[0];
    const live = isLive(), host = MODE ? MODE.host() : '';
    const mstate = !live ? 'demo' : ui.live.error ? 'offline' : (ui.live.pending || ui.live.loading) ? 'busy' : ui.live.ready ? 'online' : 'busy';
    const mb = $('bsModeBtn');
    mb.dataset.state = mstate;
    mb.innerHTML = (live ? `<span class="bs-dot"></span><span>Live</span>${host ? `<small>${esc(host)}</small>` : ''}` : `${ic('zap')}<span>Mode Demo</span>`) + ic('chevD', 'bs-caret');
    const mlabel = live ? `Mode Live — ${{ online: 'terhubung', offline: 'terputus', busy: 'menghubungkan' }[mstate]}${host ? ' ke ' + host : ''}` : 'Mode Demo — data simulasi';
    mb.title = mlabel; mb.setAttribute('aria-label', `${mlabel}. Pilih mode`);
    $('bsFooterMode').textContent = live
      ? (mstate === 'offline' ? `Live — tidak dapat terhubung ke ${host || 'server'}.` : mstate === 'busy' && !ui.live.ready ? `Live — menghubungkan ke ${host || 'server'}…` : `Live — terhubung ke ${host || 'server'}. Perubahan dikirim ke server${ui.live.syncedAt ? ` · data dimuat ${fmtRel(ui.live.syncedAt)}` : ''}.`)
      : 'Mode Demo — perubahan disimpan di browser ini dan tidak dikirim ke Google atau server.';
    const rc = $('bsRoleChip'); rc.hidden = ME.role === 'Administrator'; rc.textContent = `Peran: ${ME.role}`; rc.title = isLive() ? 'Peran dari akun server' : 'Lihat sebagai (Demo) — klik untuk mengganti';
    $('bsAccName').textContent = ME.name; $('bsAccRole').textContent = ME.role || 'Pengguna'; $('bsAccAvatar').textContent = initials(ME.name);
    $('bsSyncPill').innerHTML = ui.running
      ? `<span class="bs-pulse"></span>${ui.running.indeterminate ? 'Menyinkronkan…' : `Menyinkronkan ${pct(ui.running.done, ui.running.total)}%`}`
      : live && !ui.live.ready ? `<span class="bs-dot" data-tone="neutral"></span>Sinkron terakhir —`
      : `<span class="bs-dot" data-tone="${openFailures().length ? 'warn' : 'good'}"></span>Sinkron terakhir ${last ? fmtRel(last.time) : '—'}`;
    const n = notifications().length;
    $('bsNotifCount').textContent = n || '';
    $('bsNotifBtn').setAttribute('aria-label', n ? `Notifikasi, ${n} baru` : 'Notifikasi');
    $('bsThemeBtn').innerHTML = ic(shell.dataset.theme === 'dark' ? 'sun' : 'moon');
    $('bsThemeBtn').title = shell.dataset.theme === 'dark' ? 'Mode terang' : 'Mode gelap';
    shell.querySelectorAll('#bsLang [data-action="lang"]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.id === 'en') === isEn())));
    $('bsFooterInfo').textContent = `${fmtNum(state.locations.length)} unit · render ${ui.renderMs} ms`;
    const prog = shell.querySelector('.bs-progress');
    if (prog && ui.running && !ui.running.indeterminate) { prog.firstElementChild.style.width = pct(ui.running.done, ui.running.total) + '%'; prog.setAttribute('aria-valuenow', ui.running.done); }
  }
  function captureFocus() {
    const a = document.activeElement;
    if (!a || !shell.contains(a) || a === document.body) return null;
    let s = null, e = null;
    try { s = a.selectionStart; e = a.selectionEnd; } catch (_) {}
    return { scope: a.closest('dialog')?.id || '', id: a.id, bind: a.dataset?.bind, action: a.dataset?.action, did: a.dataset?.id, filter: a.dataset?.filter, value: a.value, view: a.dataset?.view, s, e };
  }
  function restoreFocus(f) {
    if (!f) return;
    const root = (f.scope && $(f.scope)) || shell;
    const css = v => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/"/g, '\\"'));
    let el = (f.id && $(f.id)) || (f.bind && root.querySelector(`[data-bind="${f.bind}"]`)) ||
      (f.filter && root.querySelector(`[data-filter="${f.filter}"][value="${css(f.value)}"]`)) ||
      (f.action && [...root.querySelectorAll(`[data-action="${f.action}"]`)].find(n => (n.dataset.id || '') === (f.did || ''))) ||
      (f.view && root.querySelector(`[data-view="${f.view}"]`));
    if (!el || el === document.activeElement) return;
    el.focus({ preventScroll: true });
    if (f.s != null && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(f.s, f.e); } catch (_) {} }
  }
  function render() {
    const t0 = performance.now(), f = captureFocus();
    renderNav();
    const item = navItem(ui.view);
    $('bsCrumb').textContent = item.label;
    const gate = isLive() && !ui.live.ready;
    if (!gate && ui.view === 'map' && renderedView === 'map' && $('bsMap')) {
      updateMap(false);
    } else {
      if (mapObj && (gate || ui.view !== 'map')) { mapObj.remove(); mapObj = null; }
      $('bsPage').innerHTML = gate ? viewLiveState() : VIEWS[ui.view]();
      renderedView = gate ? null : ui.view;
      if (!gate && ui.view === 'map') mountMap();
    }
    if (sheet.open) renderDrawer();
    restoreFocus(f);
    syncUrl();
    ui.renderMs = Math.max(1, Math.round(performance.now() - t0));
    updateChrome();
  }
  /* ---------- Routing hash: #/halaman?filter=…&unit=KODE ---------- */
  const VIEW_SLUG = { dashboard: 'dashboard', map: 'peta', reports: 'laporan', sla: 'sla', locations: 'unit-kerja', discrepancies: 'ketidaksesuaian', duplicates: 'duplikat', claims: 'klaim', approvals: 'persetujuan', reviews: 'ulasan', sync: 'sync', audit: 'riwayat', access: 'akses', integrations: 'integrasi', settings: 'pengaturan', guide: 'panduan', scenarios: 'scenario-test' };
  const SLUG_VIEW = Object.fromEntries(Object.entries(VIEW_SLUG).map(([v, sl]) => [sl, v]));
  const LOC_SORTS = ['name', 'city', 'region', 'type', 'status', 'gbp', 'issues', 'lastSync', 'updatedAt'];
  const DRAWER_TABS = ['overview', 'compare', 'reviews', 'history', 'sync'];
  let routing = false, pushNext = false;
  function routeParams() {
    const P = new URLSearchParams(), put = (k, v, def = '') => { if (v != null && String(v) !== '' && String(v) !== String(def)) P.set(k, String(v)); };
    switch (ui.view) {
      case 'locations': { const f = ui.loc; put('q', f.q.trim()); put('tampilan', f.quick, 'all'); FILTERS.forEach(([k]) => put(k, f[k].join(','))); put('urut', f.sort, 'name'); put('arah', f.dir === -1 ? 'desc' : ''); put('hal', f.page, 1); break; }
      case 'map': put('q', ui.map.q.trim()); put('status', ui.map.status); put('region', ui.map.region); put('gbp', ui.map.gbp); break;
      case 'discrepancies': put('q', ui.disc.q.trim()); put('kolom', ui.disc.field); break;
      case 'claims': put('tab', ui.claims.tab, 'active'); break;
      case 'approvals': put('tab', ui.approvals.tab, 'pending'); break;
      case 'sync': put('tab', ui.sync.tab, 'failures'); break;
      case 'access': put('tab', ui.access.tab, 'users'); put('q', ui.access.q.trim()); break;
      case 'audit': put('q', ui.audit.q.trim()); put('modul', ui.audit.module); put('pengguna', ui.audit.actor); put('periode', ui.audit.range === '' ? 'semua' : ui.audit.range, '30'); break;
      case 'reviews': { const f = ui.reviews; put('akun', f.account); put('lokasi', f.location); put('rating', f.rating); put('status', f.status); put('urut', f.sort, 'newest'); put('q', f.q.trim()); break; }
      case 'reports': put('periode', ui.report.period, '30'); put('region', ui.report.region); put('akun', ui.report.account); put('tipe', ui.report.type); break;
      case 'guide': put('q', ui.guide.q.trim()); break;
      case 'scenarios': put('kelompok', ui.scn.group); break;
    }
    if (ui.drawer) { put('unit', ui.drawer.code); put('panel', ui.drawer.tab, 'overview'); }
    return P;
  }
  const currentHash = () => { const qs = routeParams().toString(); return `#/${VIEW_SLUG[ui.view] || 'dashboard'}${qs ? `?${qs}` : ''}`; };
  function syncUrl() {
    if (shell.hidden || routing) { pushNext = false; return; }
    const h = currentHash();
    if (location.hash !== h) {
      const url = location.pathname + location.search + h;
      try { if (pushNext) history.pushState({ bs: 1 }, '', url); else history.replaceState({ bs: 1 }, '', url); } catch (_) { /* file:// tertentu */ }
    }
    pushNext = false;
  }
  function parseRoute(hash) {
    if (!hash || !hash.startsWith('#/')) return null;
    const [path, qs] = hash.slice(2).split('?');
    let slug = ''; try { slug = decodeURIComponent(path); } catch (_) { return null; }
    return { view: SLUG_VIEW[slug] || '', P: new URLSearchParams(qs || '') };
  }
  // Terapkan rute ke state UI. Semua nilai divalidasi terhadap daftar yang diizinkan.
  function applyRoute(r) {
    let view = VIEWS[r.view] ? r.view : 'dashboard';
    if (!canView(view)) view = 'dashboard';
    const P = r.P, g = k => (P.get(k) || '').slice(0, 120), one = (k, allowed, def = '') => (allowed.includes(g(k)) ? g(k) : def), list = (k, allowed) => g(k).split(',').filter(x => allowed.includes(x));
    switch (view) {
      case 'locations': Object.assign(ui.loc, { q: g('q'), quick: one('tampilan', QUICK.map(x => x[0]), 'all'), status: list('status', STATUSES), region: list('region', REGIONS), type: list('type', TYPES), gbp: list('gbp', GBP), sort: one('urut', LOC_SORTS, 'name'), dir: g('arah') === 'desc' ? -1 : 1, page: Math.max(1, parseInt(g('hal'), 10) || 1) }); ui.loc.selected.clear(); break;
      case 'map': Object.assign(ui.map, { q: g('q'), status: one('status', STATUSES), region: one('region', REGIONS), gbp: one('gbp', GBP) }); break;
      case 'discrepancies': Object.assign(ui.disc, { q: g('q'), field: one('kolom', ['name', 'phone', 'hours', 'address', 'coords']) }); break;
      case 'claims': ui.claims.tab = one('tab', ['active', 'done', 'rejected', 'all'], 'active'); break;
      case 'approvals': ui.approvals.tab = one('tab', ['pending', 'history'], 'pending'); break;
      case 'sync': ui.sync.tab = one('tab', ['failures', 'runs'], 'failures'); break;
      case 'access': Object.assign(ui.access, { tab: one('tab', ['users', 'roles'], 'users'), q: g('q') }); break;
      case 'audit': Object.assign(ui.audit, { q: g('q'), module: g('modul').slice(0, 60), actor: one('pengguna', ['Internal', 'Eksternal']), range: g('periode') === 'semua' ? '' : one('periode', ['1', '7', '30'], '30') }); break;
      case 'reviews': Object.assign(ui.reviews, { account: g('akun').slice(0, 60), location: g('lokasi').slice(0, 40), rating: one('rating', ['1', '2', '3', '4', '5']), status: one('status', ['replied', 'unreplied']), sort: one('urut', ['newest', 'unreplied', 'lowest', 'highest'], 'newest'), q: g('q'), limit: 20, editing: null }); break;
      case 'reports': Object.assign(ui.report, { period: one('periode', ['7', '30', '90'], '30'), region: one('region', REGIONS), account: g('akun').slice(0, 60), type: one('tipe', TYPES) }); break;
      case 'guide': ui.guide.q = g('q'); break;
      case 'scenarios': ui.scn.group = one('kelompok', ['A', 'B', 'C', 'D']); break;
    }
    return { view, unit: g('unit').slice(0, 40), panel: one('panel', DRAWER_TABS, 'overview') };
  }
  function openRouteUnit(res) { if (res && res.unit && byCode().has(res.unit)) openDrawer(res.unit, res.panel); }
  window.addEventListener('popstate', () => {
    if (shell.hidden) return;
    const r = parseRoute(location.hash);
    if (!r) return;
    routing = true;
    const res = applyRoute(r);
    if (sheet.open && !res.unit) sheet.close();
    closeModal(); toggleModeMenu(false);
    ui.view = res.view; ui.pop = ''; renderedView = null;
    closeNav();
    render();
    if (!isLive() || ui.live.ready) openRouteUnit(res);
    routing = false;
  });
  function copyLink() {
    syncUrl();
    const url = location.href;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Tautan disalin. Penerima perlu masuk untuk membukanya.', { tone: 'good' }), () => openModal('Salin tautan', `<label class="bs-field"><span>Tautan halaman ini</span><input value="${esc(url)}" readonly onfocus="this.select()"></label>`, { footer: btn('Tutup', 'modal-close', { variant: 'primary' }) }));
  }

  function navigate(view, { focus = true, push = true } = {}) {
    if (!VIEWS[view]) return;
    if (!canView(view)) { toast(deniedMsg((NAV_ITEMS.find(n => n.id === view) || {}).perm), { tone: 'warn' }); view = 'dashboard'; }
    pushNext = push && view !== ui.view;
    if (view !== ui.view) renderedView = null;
    ui.view = view; ui.pop = '';
    if (view === 'map') renderedView = null;
    closeNav();
    render();
    $('bsMain').scrollTop = 0;
    if (focus) $('bsTitle')?.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ *
   * Navigasi responsif, tema, notifikasi
   * ------------------------------------------------------------------ */
  function applyLayout() {
    shell.classList.toggle('is-collapsed', !mobile.matches && prefs.collapsed);
    shell.classList.toggle('is-nav-open', mobile.matches && ui.navOpen);
    shell.querySelector('.bs-scrim').hidden = !(mobile.matches && ui.navOpen);
    $('bsSidebar').inert = mobile.matches && !ui.navOpen;
    shell.querySelector('.bs-menu').setAttribute('aria-expanded', String(mobile.matches ? ui.navOpen : !prefs.collapsed));
    shell.querySelector('.bs-collapse').setAttribute('aria-label', prefs.collapsed ? 'Lebarkan navigasi' : 'Ciutkan navigasi');
    if (mapObj) setTimeout(() => mapObj && mapObj.invalidateSize(), 250);
  }
  function closeNav() { if (ui.navOpen) { ui.navOpen = false; applyLayout(); } }
  mobile.addEventListener('change', () => { ui.navOpen = false; applyLayout(); });
  function toggleTheme() {
    shell.dataset.theme = shell.dataset.theme === 'dark' ? 'light' : 'dark';
    prefs.theme = shell.dataset.theme; savePrefs(); updateChrome();
  }
  function toggleNotif(force) {
    const pop = $('bsNotif'), open = force ?? pop.hidden;
    pop.hidden = !open;
    $('bsNotifBtn').setAttribute('aria-expanded', String(open));
    if (!open) return;
    const items = notifications();
    pop.innerHTML = `<header><strong>Notifikasi</strong><small>${items.length ? `${items.length} perlu perhatian` : 'Tidak ada yang baru'}</small></header>` +
      (items.length ? `<ul>${items.map(n => `<li><button type="button" data-view="${n.view}" data-tone="${n.tone}">${ic(n.icon)}<span><strong>${esc(n.title)}</strong><small>${esc(n.text)}</small></span></button></li>`).join('')}</ul>` : `<p class="bs-pal-empty">Semua beres 🎉</p>`);
  }

  /* ------------------------------------------------------------------ *
   * Aksi domain
   * ------------------------------------------------------------------ */
  function resolveDisc(key, useDashboard, send = true) {
    const [code, f] = key.split('|'), l = byCode().get(code);
    if (send) remote('POST', '/discrepancies/resolve', { code, field: f, source: useDashboard ? 'dashboard' : 'google' });
    if (!l || !l.google) return;
    const before = f === 'coords' ? (useDashboard ? `${l.google.lat}, ${l.google.lng}` : `${l.lat}, ${l.lng}`) : useDashboard ? l.google[f] : l[f];
    if (f === 'coords') { if (useDashboard) Object.assign(l.google, { lat: l.lat, lng: l.lng }); else Object.assign(l, { lat: l.google.lat, lng: l.google.lng }); }
    else if (useDashboard) l.google[f] = l[f]; else l[f] = l.google[f];
    const after = f === 'coords' ? `${l.lat}, ${l.lng}` : l[f];
    delete state.discNotes[key];
    if (!useDashboard) { l.updatedAt = Date.now(); l.updatedBy = ME.name; }
    log('Ketidaksesuaian', useDashboard ? 'Mengirim data Dashboard ke Google' : 'Menerapkan data Google ke Dashboard', { target: code, changes: [{ field: `${FIELD_LABEL[f]} (${useDashboard ? 'Google' : 'Dashboard'})`, before, after }] });
  }
  function simulateGoogleChange() {
    const r = rng(Date.now() % 1e6), cands = state.locations.filter(l => l.google && !issueMap().has(l.code));
    if (!cands.length) return;
    const l = pick(r, cands), f = pick(r, ['phone', 'hours', 'name', 'coords']);
    if (f === 'coords') Object.assign(l.google, offset(l.lat, l.lng, 200 + r() * 600, r() * 6.28));
    else if (f === 'name') l.google.name = `${l.name} - Bank BRI`;
    else if (f === 'hours') l.google.hours = 'Setiap hari 09.00–17.00';
    else l.google.phone = `(0${21 + Math.floor(r() * 700)}) ${1000000 + Math.floor(r() * 8999999)}`;
    log('Ketidaksesuaian', 'Perubahan terdeteksi di Google Maps', { target: l.code, user: 'Google Maps', actor: 'Eksternal', detail: FIELD_LABEL[f] });
    touch(); render();
    toast(`Perubahan ${FIELD_LABEL[f].toLowerCase()} terdeteksi pada ${l.name}.`, { tone: 'warn', action: { label: 'Bandingkan', run: () => openDrawer(l.code, 'compare') } });
  }
  function simulateEdit() {
    if (!state.api.webhook) { toast('Notifikasi edit eksternal dimatikan di Integrasi Google.', { tone: 'warn', action: { label: 'Buka', run: () => navigate('integrations') } }); return; }
    const r = rng(Date.now() % 1e6), l = pick(r, state.locations.filter(x => x.status !== 'Tidak Aktif')), f = pick(r, ['phone', 'hours', 'name', 'address']);
    const after = { phone: `(0${21 + Math.floor(r() * 700)}) ${1000000 + Math.floor(r() * 8999999)}`, hours: 'Setiap hari 10.00–22.00', name: `${l.name} (Pindah Lokasi)`, address: `Jl. Tidak Dikenal No. ${Math.floor(r() * 99)}, ${l.city}` }[f];
    const by = pick(r, EXT_EMAILS);
    const a = { id: `CR-${String(++state.seq.cr).padStart(3, '0')}`, code: l.code, field: f, before: l[f], after, by, time: Date.now(), status: 'Menunggu' };
    state.approvals.unshift(a);
    log('Persetujuan Edit', `Mengusulkan perubahan ${FIELD_LABEL[f].toLowerCase()}`, { target: l.code, user: by, actor: 'Eksternal', changes: [{ field: FIELD_LABEL[f], before: a.before, after }] });
    touch(); ui.approvals.tab = 'pending'; render();
    toast(`Edit baru dari ${by} menunggu persetujuan.`, { tone: 'warn', action: ui.view !== 'approvals' ? { label: 'Tinjau', run: () => navigate('approvals') } : null });
  }
  function decide(id, approve) {
    const a = state.approvals.find(x => x.id === id), l = a && byCode().get(a.code);
    if (!a || a.status !== 'Menunggu') return;
    const snap = snapshot();
    a.status = approve ? 'Disetujui' : 'Ditolak'; a.decidedAt = Date.now(); a.decidedBy = ME.name;
    if (approve && l) {
      l[a.field] = a.after; if (l.google) l.google[a.field] = a.after;
      l.updatedAt = Date.now(); l.updatedBy = `${a.by} (disetujui ${ME.name})`;
    }
    remote('POST', `/approvals/${encodeURIComponent(id)}/${approve ? 'approve' : 'reject'}`);
    log('Persetujuan Edit', approve ? 'Menyetujui edit eksternal' : 'Menolak edit eksternal', { target: a.code, detail: `${a.id} dari ${a.by}`, changes: approve ? [{ field: FIELD_LABEL[a.field], before: a.before, after: a.after }] : [] });
    touch(); render();
    toast(approve ? `${a.id} disetujui — data diperbarui.` : `${a.id} ditolak — data unit kerja tidak berubah.`, { tone: approve ? 'good' : 'info', undo: snap });
  }
  function advanceClaim(id) {
    const c = state.claims.find(x => x.id === id);
    if (!c || !claimActive(c)) return;
    const next = STEPS[STEPS.indexOf(c.status) + 1], now = Date.now();
    if (next === 'Menunggu verifikasi Google') c.processedAt = now;
    if (next === 'Selesai') {
      c.doneAt = now; c.processedAt ||= now;
      const l = c.code && byCode().get(c.code);
      if (c.kind === 'Titik baru' && c.proposal) {
        const code = `DM-${String(++state.seq.loc).padStart(3, '0')}`, p = c.proposal;
        state.locations.unshift({ ...p, code, region: regionOf(p.province), status: 'Online', gbp: 'Terverifikasi', google: { name: p.name, phone: p.phone, hours: p.hours, address: p.address, lat: p.lat, lng: p.lng }, updatedAt: now, updatedBy: ME.name, lastSync: now });
        c.code = code;
      } else if (l && c.kind === 'Laporan duplikat') { l.status = 'Tidak Aktif'; l.gbp = 'Duplikat'; }
      else if (l) { l.gbp = 'Terverifikasi'; }
    }
    c.status = next;
    log('Klaim & Titik Baru', `Memindahkan ${c.id} ke “${next}”`, { target: c.code || c.id, detail: c.kind });
    remote('POST', `/claims/${encodeURIComponent(id)}/advance`, { to: next });
    touch(); render();
    toast(`${c.id} → ${next}.`, { tone: next === 'Selesai' ? 'good' : 'info' });
  }
  function claimForm(code = '') {
    if (!guard('claims.manage')) return;
    const cands = state.locations.filter(l => l.gbp !== 'Terverifikasi' || l.code === code);
    openModal('Ajukan klaim', formGrid([
      { name: 'kind', label: 'Jenis permintaan', type: 'select', options: CLAIM_KINDS, value: byCode().get(code)?.gbp === 'Suspend' ? 'Banding suspend' : 'Klaim kepemilikan', full: true },
      { name: 'code', label: 'Unit kerja', type: 'select', options: cands.map(l => [l.code, `${l.name} · ${l.gbp}`]), value: code, full: true, hint: 'Hanya unit yang belum terverifikasi ditampilkan.' },
      { name: 'note', label: 'Catatan / dokumen pendukung', type: 'textarea', full: true, attrs: 'maxlength="500"' }
    ]), {
      submit: 'Ajukan', desc: 'Permintaan masuk ke tahap “Diajukan”. Waktu proses internal mulai dihitung.',
      onSubmit: p => {
        if (!byCode().has(p.code)) return { code: 'Pilih unit kerja.' };
        if (state.claims.some(c => c.code === p.code && claimActive(c))) return { code: 'Unit ini sudah memiliki permintaan yang berjalan.' };
        const id = `KL-${String(++state.seq.claim).padStart(3, '0')}`;
        state.claims.unshift({ id, kind: p.kind, code: p.code, submittedAt: Date.now(), processedAt: null, doneAt: null, status: 'Diajukan', note: String(p.note || '').trim() });
        log('Klaim & Titik Baru', `Mengajukan ${p.kind.toLowerCase()}`, { target: p.code, detail: id });
        remote('POST', '/claims', { kind: p.kind, code: p.code, note: String(p.note || '').trim() });
        ui.claims.tab = 'active';
        toast(`${id} diajukan.`, { tone: 'good', action: ui.view !== 'claims' ? { label: 'Lihat', run: () => navigate('claims') } : null });
      }
    });
  }
  function pointForm() {
    if (!guard('claims.manage')) return;
    hoursDraft = presetHours('weekday');
    openModal('Usulkan titik lokasi baru',
      `<h3 class="bs-form-section">Informasi dasar</h3>` + formGrid([
        { name: 'name', label: 'Nama unit', full: true }, { name: 'type', label: 'Tipe', type: 'select', options: TYPES, value: 'KCP' },
        { name: 'phone', label: 'Telepon', attrs: '' }, { name: 'city', label: 'Kota' }, { name: 'province', label: 'Provinsi' },
        { name: 'address', label: 'Alamat', full: true }
      ]) +
      `<h3 class="bs-form-section">Titik lokasi</h3><p class="bs-form-help">Klik peta atau geser penanda untuk menandai titik. Koordinat juga dapat diketik.</p>` + pickerBlock('', '') +
      `<h3 class="bs-form-section">Jam operasional</h3>` + hoursEditor() +
      formGrid([{ name: 'force', label: 'Tetap ajukan meskipun ada unit berdekatan', type: 'checkbox', full: true }]), {
      wide: 'xl', submit: 'Ajukan titik baru', desc: 'Sistem memeriksa kemungkinan duplikat sebelum pengajuan dikirim ke Google.',
      onSubmit: p => {
        const herr = hoursError(hoursDraft);
        if (herr) return herr;
        p.hours = formatHours(hoursDraft);
        const e = validateLoc(p, null);
        if (Object.keys(e).length) return e;
        const near = state.locations.map(l => [l, distM(l, p)]).filter(([, d]) => d <= Math.max(state.settings.dupRadius, 200)).sort((a, b) => a[1] - b[1])[0];
        if (near && !p.force) return { lat: `Ada ${near[0].name} berjarak ${fmtDist(near[1])} — kemungkinan duplikat. Centang “Tetap ajukan” bila yakin.` };
        const id = `KL-${String(++state.seq.claim).padStart(3, '0')}`;
        const proposal = { name: p.name, type: p.type, city: p.city, province: p.province, address: p.address, phone: p.phone, hours: p.hours, hoursSpec: JSON.parse(JSON.stringify(hoursDraft)), lat: p.lat, lng: p.lng };
        state.claims.unshift({ id, kind: 'Titik baru', proposal, submittedAt: Date.now(), processedAt: null, doneAt: null, status: 'Diajukan', note: near ? `Dekat ${near[0].name} (${fmtDist(near[1])})` : '' });
        log('Klaim & Titik Baru', 'Mengajukan titik baru', { target: id, detail: p.name });
        remote('POST', '/claims', { kind: 'Titik baru', proposal, note: near ? `Dekat ${near[0].name} (${fmtDist(near[1])})` : '' });
        ui.claims.tab = 'active';
        toast(`${id} diajukan untuk ${p.name}.`, { tone: 'good', action: ui.view !== 'claims' ? { label: 'Lihat', run: () => navigate('claims') } : null });
      }
    });
    mountPicker('', '', null);
  }
  function userForm(id) {
    if (!guard('users.manage')) return;
    const u = state.users.find(x => x.id === Number(id));
    openModal(u ? `Edit ${u.name}` : 'Tambah pengguna', formGrid([
      { name: 'name', label: 'Nama lengkap', value: u?.name, full: true }, { name: 'email', label: 'Email', type: 'email', value: u?.email, full: true, hint: 'Gunakan domain @example.test untuk demo.' },
      { name: 'role', label: 'Peran', type: 'select', options: state.roles.map(r => r.name), value: u?.role || 'Viewer' },
      { name: 'status', label: 'Status', type: 'select', options: ['Aktif', 'Nonaktif'], value: u?.status || 'Aktif', attrs: u?.id === 1 ? 'disabled' : '' }
    ]), {
      submit: u ? 'Simpan' : 'Tambah pengguna',
      onSubmit: p => {
        const e = {};
        p.name = String(p.name || '').trim(); p.email = String(p.email || '').trim().toLowerCase();
        if (!p.name) e.name = 'Wajib diisi.';
        if (!/^[^\s@]+@example\.test$/.test(p.email)) e.email = 'Email harus berdomain @example.test.';
        else if (state.users.some(x => x !== u && x.email === p.email)) e.email = 'Email sudah terdaftar.';
        if (Object.keys(e).length) return e;
        if (u?.id === 1) p.status = 'Aktif';
        if (u) { const ch = diff(u, p, ['name', 'email', 'role', 'status']); Object.assign(u, p); log('Pengguna & Akses', 'Memperbarui pengguna', { detail: p.name, changes: ch }); remote('PATCH', `/users/${encodeURIComponent(u.id)}`, p); }
        else { state.users.push({ ...p, id: ++state.seq.user, lastActive: Date.now() }); log('Pengguna & Akses', 'Menambahkan pengguna', { detail: `${p.name} (${p.role})` }); remote('POST', '/users', p); }
        toast('Pengguna disimpan.', { tone: 'good' });
      }
    });
  }
  function roleForm(name) {
    if (!guard('users.manage')) return;
    const r = state.roles.find(x => x.name === name);
    openModal(r ? `Ubah peran ${r.name}` : 'Tambah peran', formGrid([{ name: 'name', label: 'Nama peran', value: r?.name, full: true }]) + (r ? '' : `<fieldset class="bs-fieldset"><legend>Izin awal</legend>${PERMS.map(([p, l]) => `<label class="bs-checkline"><input type="checkbox" name="perm" value="${p}" ${p.endsWith('.read') ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>`), {
      submit: 'Simpan',
      onSubmit: (p, fd) => {
        const n = String(p.name || '').trim();
        if (!n) return { name: 'Wajib diisi.' };
        if (state.roles.some(x => x !== r && x.name.toLowerCase() === n.toLowerCase())) return { name: 'Nama peran sudah ada.' };
        if (r) { remote('PATCH', `/roles/${encodeURIComponent(r.name)}`, { name: n }); state.users.filter(u => u.role === r.name).forEach(u => { u.role = n; }); log('Pengguna & Akses', 'Mengubah nama peran', { changes: [{ field: 'Peran', before: r.name, after: n }] }); r.name = n; }
        else { state.roles.push({ name: n, permissions: fd.getAll('perm') }); remote('POST', '/roles', { name: n, permissions: fd.getAll('perm') }); log('Pengguna & Akses', 'Menambahkan peran', { detail: n }); }
        ui.access.tab = 'roles';
        toast('Peran disimpan.', { tone: 'good' });
      }
    });
  }
  function exportLocations(xs, name = 'branchsync-unit-kerja.csv') {
    const keys = ['code', 'name', 'type', 'status', 'gbp', 'city', 'province', 'region', 'address', 'phone', 'hours', 'lat', 'lng'];
    downloadCSV(name, [keys, ...xs.map(l => keys.map(k => l[k]))]);
    log('Unit Kerja', 'Mengekspor CSV', { detail: `${xs.length} unit` });
    toast(`${fmtNum(xs.length)} unit diekspor ke CSV.`, { tone: 'good' });
  }
  function generateUnits(n) {
    const t0 = performance.now(), r = rng(Date.now() % 1e6), base = state.locations.filter(l => l.type === 'Kantor Cabang');
    for (let i = 0; i < n; i++) {
      const b = pick(r, base), p = offset(b.lat, b.lng, 2000 + r() * 40000, r() * 6.28), type = pick(r, ['KCP', 'Unit', 'Unit', 'ATM', 'ATM']);
      const code = `DM-${String(++state.seq.loc).padStart(3, '0')}`, x = r();
      const l = { code, name: `${type === 'ATM' ? 'ATM BRI' : type === 'Unit' ? 'BRI Unit' : 'KCP'} ${b.city} ${code.slice(3)}`, type, city: b.city, province: b.province, region: b.region, address: `Jl. ${pick(r, STREETS)} No. ${1 + Math.floor(r() * 300)}, ${b.city}`, phone: `(0${21 + Math.floor(r() * 700)}) ${1000000 + Math.floor(r() * 8999999)}`, hours: type === 'ATM' ? HOURS[3] : pick(r, HOURS.slice(0, 3)), lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), status: x < 0.8 ? 'Online' : x < 0.88 ? 'Offline' : x < 0.96 ? 'Belum Sync' : 'Tidak Aktif', gbp: r() < 0.85 ? 'Terverifikasi' : 'Belum Diklaim', updatedAt: Date.now() - Math.floor(r() * 30 * DAY), updatedBy: 'Generator uji', lastSync: Date.now() - Math.floor(r() * 2 * DAY) };
      l.google = { name: l.name, phone: l.phone, hours: l.hours, address: l.address, lat: l.lat, lng: l.lng };
      state.locations.push(l);
    }
    log('Pengaturan', 'Membuat data uji performa', { detail: `${n} unit` });
    touch();
    const gen = Math.round(performance.now() - t0);
    navigate('locations');
    toast(`${fmtNum(n)} unit uji dibuat (${gen} ms) dan halaman dirender dalam ${ui.renderMs} ms. Total ${fmtNum(state.locations.length)} unit.`, { tone: 'good' });
  }

  /* ------------------------------------------------------------------ *
   * Event handler
   * ------------------------------------------------------------------ */
  function setBind(path, value) {
    const [a, b] = path.split('.');
    if (a === 'prefs') { prefs[b] = Number(value) || value; savePrefs(); ui.loc.page = 1; return; }
    if (a === 'api') { state.api[b] = value; log('Integrasi Google', `${value ? 'Mengaktifkan' : 'Menonaktifkan'} notifikasi edit eksternal`); touch(); toast(value ? 'Notifikasi edit eksternal aktif.' : 'Notifikasi edit eksternal nonaktif.'); remote('PATCH', '/integrations/google', { [b]: value }); return; }
    ui[a][b] = value;
    if (a === 'loc') ui.loc.page = 1;
    if (a === 'reviews') { ui.reviews.limit = 20; if (b === 'account') ui.reviews.location = ''; }
    if (a === 'report' && b === 'account' && value) ui.report.region = '';
  }
  function act(action, id, el) {
    const l = id ? byCode().get(id) : null;
    if (ACTION_PERM[action] && !guard(ACTION_PERM[action])) return;
    switch (action) {
      case 'nav': navigate(id); break;
      case 'collapse': prefs.collapsed = !prefs.collapsed; savePrefs(); applyLayout(); break;
      case 'nav-open': if (mobile.matches) { ui.navOpen = true; applyLayout(); $('bsNav').querySelector('button')?.focus(); } else { prefs.collapsed = !prefs.collapsed; savePrefs(); applyLayout(); } break;
      case 'nav-close': closeNav(); shell.querySelector('.bs-menu').focus(); break;
      case 'palette': openPalette(); break;
      case 'theme': toggleTheme(); break;
      case 'lang': setLanguage(id); break;
      case 'shortcuts': shortcutsModal(); break;
      case 'notif': toggleNotif(); break;
      case 'logout': logout(); break;
      case 'tab': { const [path, v] = id.split(':'); const [a, b] = path.split('.'); ui[a][b] = v; if (a === 'drawer') { renderDrawer(); syncUrl(); } else render(); break; }
      case 'modal-close': closeModal(); break;
      case 'mode-menu': toggleModeMenu(); break;
      case 'demo-role': {
        if (isLive()) break;
        toggleModeMenu(false);
        prefs.demoRole = id; savePrefs(); ME = demoUser(); cache = {};
        renderedView = null;
        if (!canView(ui.view)) navigate('dashboard'); else render();
        toast(`Sekarang melihat sebagai ${id}.`, { tone: 'info' });
        break;
      }
      case 'copy-link': copyLink(); break;
      case 'view-save': saveViewModal(); break;
      case 'view-apply': applySavedView(id); break;
      case 'view-rename': saveViewModal(id); break;
      case 'view-pin': { const v = up().views.find(x => x.id === id); if (v) { v.pinned = !v.pinned; saveUP(); render(); toast(v.pinned ? `“${v.name}” disematkan di tampilan cepat.` : `Sematan “${v.name}” dilepas.`); } break; }
      case 'view-delete': { const v = up().views.find(x => x.id === id); if (!v) break; confirmModal(`Hapus tampilan “${esc(v.name)}”?`, 'Hanya tampilan tersimpan yang dihapus; data unit kerja tidak berubah.', 'Hapus tampilan', () => { const U = up(); U.views = U.views.filter(x => x !== v); saveUP(); toast('Tampilan dihapus.'); }); break; }
      case 'cols-reset': { const U = up(); U.cols = null; U.density = 'comfortable'; saveUP(); render(); break; }
      case 'mode-demo': toggleModeMenu(false); closeModal(); switchToDemo(); break;
      case 'mode-live': toggleModeMenu(false); closeModal(); switchToLive(); break;
      case 'live-retry': toggleModeMenu(false); closeModal(); loadLive(); break;
      case 'live-relogin': liveConnectModal(); break;
      case 'live-google': {
        let url = '';
        try { url = MODE.normalizeUrl(modal.querySelector('[name="url"]')?.value || MODE.getBaseUrl()); } catch (err) { showErrors({ url: err.message }); break; }
        if (!url) { showErrors({ url: 'Isi URL server API terlebih dahulu.' }); break; }
        MODE.setBaseUrl(url);
        location.assign(`${url}/auth/google/start?redirect_uri=${encodeURIComponent(location.href.split('#')[0])}`);
        break;
      }
      // Ulasan
      case 'review-reply': ui.reviews.editing = id; ui.reviews.drafts[id] ??= ''; render(); $(`rv-text-${id}`)?.focus(); break;
      case 'review-edit': { const rv = state.reviews.find(x => x.id === id); if (!rv) break; ui.reviews.editing = id; ui.reviews.drafts[id] = rv.reply ? rv.reply.text : ''; render(); $(`rv-text-${id}`)?.focus(); break; }
      case 'review-cancel': ui.reviews.editing = null; delete ui.reviews.drafts[id]; render(); break;
      case 'review-send': {
        const rv = state.reviews.find(x => x.id === id); if (!rv) break;
        const text = String(ui.reviews.drafts[id] ?? $(`rv-text-${id}`)?.value ?? '').trim();
        if (!text) { toast('Balasan tidak boleh kosong.', { tone: 'warn' }); $(`rv-text-${id}`)?.focus(); break; }
        if (text.length > REPLY_MAX) { toast(`Balasan maksimal ${fmtNum(REPLY_MAX)} karakter.`, { tone: 'warn' }); break; }
        const before = rv.reply ? rv.reply.text : '';
        rv.reply = { text, by: ME.name, time: Date.now() };
        ui.reviews.editing = null; delete ui.reviews.drafts[id];
        log('Ulasan', before ? 'Mengubah balasan ulasan' : 'Membalas ulasan', { target: rv.code, detail: `${rv.author} · ${rv.rating}★`, changes: [{ field: 'Balasan', before, after: text }] });
        touch(); render();
        if (isLive()) remote('PUT', `/reviews/${encodeURIComponent(id)}/reply`, { text }).then(ok => ok && toast('Balasan terkirim ke Google.', { tone: 'good' }));
        else toast('Balasan disimpan (simulasi — tidak dikirim ke Google).', { tone: 'good' });
        break;
      }
      case 'review-delete': {
        const rv = state.reviews.find(x => x.id === id); if (!rv || !rv.reply) break;
        confirmModal('Hapus balasan?', `Balasan untuk ulasan ${esc(rv.author)} akan dihapus dari Google Maps.`, 'Hapus balasan', () => {
          const before = rv.reply.text; rv.reply = null;
          log('Ulasan', 'Menghapus balasan ulasan', { target: rv.code, detail: `${rv.author} · ${rv.rating}★`, changes: [{ field: 'Balasan', before, after: '' }] });
          remote('DELETE', `/reviews/${encodeURIComponent(id)}/reply`);
          toast('Balasan dihapus.');
        });
        break;
      }
      case 'review-rating': ui.reviews.rating = String(ui.reviews.rating) === String(id) ? '' : String(id); ui.reviews.limit = 20; render(); break;
      case 'review-more': ui.reviews.limit += 20; render(); break;
      // Laporan
      case 'report-print': window.print(); break;
      // Jam operasional & peta pemilih
      case 'hours-preset': hoursDraft = presetHours(id); refreshHours(`[data-action="hours-preset"][data-id="${id}"]`); break;
      case 'hours-add': { const d = hoursDraft[id]; const last = d.ranges[d.ranges.length - 1]; d.ranges.push(last ? { from: last.to, to: last.to < '20:00' ? `${String(Math.min(23, Number(last.to.slice(0, 2)) + 3)).padStart(2, '0')}:00` : '23:00' } : { from: '08:00', to: '15:00' }); refreshHours(`[data-hours-from="${id}:${d.ranges.length - 1}"]`); break; }
      case 'hours-del': { const [k, i] = id.split(':'); hoursDraft[k].ranges.splice(Number(i), 1); refreshHours(`[data-hours-from="${k}:0"]`); break; }
      case 'hours-copy': { const m = hoursDraft.mon; if (!m.open) { toast('Aktifkan hari Senin terlebih dahulu.', { tone: 'warn' }); break; } DAYS.slice(1).forEach(([k]) => { if (hoursDraft[k].open) hoursDraft[k] = JSON.parse(JSON.stringify(m)); }); refreshHours('[data-action="hours-copy"]'); toast('Jam Senin diterapkan ke semua hari buka.'); break; }
      case 'pick-center': syncPickerFromInputs(); break;
      case 'pick-geo':
        if (!navigator.geolocation) { toast('Peramban tidak mendukung lokasi.', { tone: 'warn' }); break; }
        navigator.geolocation.getCurrentPosition(pos => { const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude }; placePin([ll.lat, ll.lng], true); setPickInputs(ll); toast('Lokasi Anda ditandai.', { tone: 'good' }); },
          () => toast('Lokasi tidak dapat diambil. Izinkan akses lokasi atau tandai titik di peta.', { tone: 'warn' }), { enableHighAccuracy: true, timeout: 10000 });
        break;
      // Panduan
      case 'guide-jump': { const sec = $(`guide-${id}`); if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); sec.querySelector('h2')?.focus({ preventScroll: true }); } break; }
      case 'guide-print': window.print(); break;
      // Scenario Test
      case 'scn-start': { const x = CONTENT.scenarios.find(y => y.no === Number(id)); if (x) scnStart(x); break; }
      case 'scn-go': navigate(id); break;
      case 'scn-act': { const [no, a] = id.split('|'); const x = CONTENT.scenarios.find(y => y.no === Number(no)); if (x) scnStart({ ...x, start: { view: { 'import-sample': 'locations', 'claim-new': 'claims', 'point-new': 'claims', 'simulate-google': 'discrepancies', 'simulate-edit': 'approvals' }[a] || x.start.view } }, a); break; }
      case 'scn-auto': { const it = scnItem(Number(id)); it.evidence.push({ type: 'auto', text: autoEvidence(Number(id)), time: Date.now() }); it.updatedAt = Date.now(); saveScn(); render(); toast(L2(['Bukti otomatis ditambahkan.', 'Auto evidence added.']), { tone: 'good' }); break; }
      case 'scn-ev-del': { const [no, i] = id.split(':'); const it = scnItem(Number(no)); it.evidence.splice(Number(i), 1); it.updatedAt = Date.now(); saveScn(); render(); break; }
      case 'scn-ev-view': { const [no, i] = id.split(':'); const ev = scnPeek(Number(no)).evidence[Number(i)]; if (ev) openModal(`${L2(['Bukti skenario', 'Scenario evidence'])} ${no}`, `<img class="bs-scn-full" src="${ev.data}" alt="${esc(L2(['Foto bukti', 'Evidence photo']))}">`, { wide: true, footer: btn(L2(['Tutup', 'Close']), 'modal-close', { variant: 'primary' }) }); break; }
      case 'scn-export': {
        const rows = [['No', 'Kelompok', 'Skenario', 'Hasil yang diharapkan', 'Prioritas', 'Catatan dokumen', 'Hasil pengujian', 'Catatan penguji', 'Bukti dicentang', 'Bukti otomatis', 'Jumlah foto', 'Diperbarui', 'Penguji', 'Instansi', 'Mode']];
        CONTENT.scenarios.forEach(x => { const it = scnPeek(x.no), res = SCN_RESULTS.find(y => y[0] === it.result); rows.push([x.no, (CONTENT.scenarioGroups.find(g => g.id === x.group) || {}).title?.[0] || x.group, x.title[0], x.expected[0], 'Mandatory', x.note[0], res ? res[1][0] : 'Belum diuji', it.notes || '', `${x.evidence.filter((_, i) => it.checks[i]).length}/${x.evidence.length}`, it.evidence.filter(e => e.type === 'auto').map(e => e.text).join('\n---\n'), it.evidence.filter(e => e.type === 'image').length, it.updatedAt ? fmtDate(it.updatedAt) : '', scn.tester, scn.org, isLive() ? 'Live' : 'Demo']); });
        downloadCSV(`hasil-scenario-test-${new Date().toISOString().slice(0, 10)}.csv`, rows);
        toast(L2(['Laporan hasil Scenario Test diunduh.', 'Scenario Test results downloaded.']), { tone: 'good' });
        break;
      }
      case 'scn-print': { const prev = new Set(ui.scn.open), prevGroup = ui.scn.group; ui.scn.group = ''; CONTENT.scenarios.forEach(x => ui.scn.open.add(x.no)); render(); setTimeout(() => { window.print(); ui.scn.open = prev; ui.scn.group = prevGroup; render(); }, 60); break; }
      case 'scn-reset': confirmModal(L2(['Reset semua hasil Scenario Test?', 'Reset all Scenario Test results?']), L2(['Semua hasil, catatan, dan bukti pengujian di browser ini akan dihapus. Tindakan ini tidak bisa dibatalkan.', 'All results, notes, and evidence in this browser will be deleted. This cannot be undone.']), L2(['Reset hasil', 'Reset results']), () => { scn = { tester: scn.tester, org: scn.org, items: {} }; saveScn(); toast(L2(['Hasil Scenario Test direset.', 'Scenario Test results reset.'])); }); break;
      case 'report-reset': ui.report.region = ''; ui.report.account = ''; ui.report.type = ''; render(); break;
      case 'report-region': ui.report.region = ui.report.region === id ? '' : id; render(); $('bsMain').scrollTop = 0; break;
      case 'report-schedule': reportScheduleModal(); break;
      case 'report-unschedule': { const x = state.reportSchedules.find(y => y.id === id); if (!x) break; confirmModal(`Hapus jadwal “${esc(x.name)}”?`, 'Laporan ini tidak akan dikirim lagi ke penerima.', 'Hapus jadwal', () => { state.reportSchedules = state.reportSchedules.filter(y => y !== x); log('Laporan & Analitik', 'Menghapus jadwal laporan', { detail: x.name }); remote('DELETE', `/reports/schedules/${encodeURIComponent(id)}`); toast('Jadwal dihapus.'); }); break; }
      case 'report-export': {
        const sc = reportScope(), bk = reportBuckets(ui.report.period), cur = reportMetrics(bk.from, bk.to, sc), im = issueMap();
        const rows = [['Laporan BranchSync'], ['Periode', fmtDate(bk.from, { dateStyle: 'medium' }), fmtDate(bk.to - DAY, { dateStyle: 'medium' })], ['Cakupan', [ui.report.region, ui.report.account, ui.report.type].filter(Boolean).join(' · ') || 'Seluruh jaringan'], [],
          ['KPI', 'Nilai'], ['Keberhasilan sync (%)', cur.rate == null ? '' : cur.rate.toFixed(1)], ['Pembaruan berhasil', cur.ok], ['Pembaruan gagal', cur.fail], ['Rata-rata rating', cur.avgRating == null ? '' : cur.avgRating.toFixed(2)], ['Jumlah ulasan', cur.rvs.length], ['Tingkat balasan (%)', cur.replyRate == null ? '' : cur.replyRate.toFixed(1)], ['Waktu balas rata-rata (jam)', cur.avgResp == null ? '' : (cur.avgResp / HOUR).toFixed(1)], ['Kepatuhan SLA internal (%)', cur.sla == null ? '' : cur.sla.toFixed(1)], ['Ketidaksesuaian diselesaikan', cur.resolved], [],
          ['Region', 'Unit', 'Online (%)', 'Terverifikasi (%)', 'Beda data', 'Rata-rata rating', 'Ulasan dibalas (%)']];
        REGIONS.forEach(r => { const ls = sc.locs.filter(l => l.region === r); if (!ls.length) return; const codes = new Set(ls.map(l => l.code)), rv = cur.rvs.filter(x => codes.has(x.code)); rows.push([r, ls.length, pct(ls.filter(l => l.status === 'Online').length, ls.length), pct(ls.filter(l => l.gbp === 'Terverifikasi').length, ls.length), ls.filter(l => im.has(l.code)).length, rv.length ? (sum(rv.map(x => x.rating)) / rv.length).toFixed(2) : '', rv.length ? pct(rv.filter(x => x.reply).length, rv.length) : '']); });
        downloadCSV(`laporan-branchsync-${new Date().toISOString().slice(0, 10)}.csv`, rows);
        log('Laporan & Analitik', 'Mengekspor laporan CSV', { detail: `${ui.report.period} hari` });
        toast('Laporan CSV diunduh.', { tone: 'good' });
        break;
      }
      case 'review-account': ui.reviews.account = id; ui.reviews.location = ''; ui.reviews.limit = 20; navigate('reviews'); break;
      case 'review-open-loc': { const lo = byCode().get(id); if (!lo) break; ui.reviews.account = acctOf(lo); ui.reviews.location = id; ui.reviews.limit = 20; if (sheet.open) sheet.close(); navigate('reviews'); break; }
      case 'review-clear-loc': ui.reviews.location = ''; render(); break;
      case 'export-reviews': { const xs = reviewFiltered(); downloadCSV('ulasan-google.csv', [['ID', 'Akun', 'Kode', 'Lokasi', 'Penulis', 'Rating', 'Ulasan', 'Waktu', 'Balasan', 'Dibalas oleh', 'Waktu balasan'], ...xs.map(rv => { const lo = byCode().get(rv.code); return [rv.id, (state.accounts.find(a => a.id === acctOf(lo)) || {}).name || '', rv.code, lo ? lo.name : '', rv.author, rv.rating, rv.text, fmtDate(rv.time), rv.reply ? rv.reply.text : '', rv.reply ? rv.reply.by : '', rv.reply ? fmtDate(rv.reply.time) : '']; })]); toast(`${fmtNum(xs.length)} ulasan diekspor.`, { tone: 'good' }); break; }
      case 'simulate-review': {
        const rr = rng(Date.now() % 1e6), lo = pick(rr, state.locations.filter(x => x.status !== 'Tidak Aktif')), x = rr(), rating = x < 0.35 ? 5 : x < 0.55 ? 4 : x < 0.7 ? 3 : x < 0.85 ? 2 : 1;
        const rv = { id: `RV-${String(++state.seq.review).padStart(4, '0')}`, code: lo.code, author: pick(rr, AUTHORS), rating, text: pick(rr, REVIEW_TEXTS[rating]), time: Date.now(), reply: null };
        state.reviews.unshift(rv);
        log('Ulasan', 'Ulasan baru masuk dari Google Maps', { target: lo.code, user: rv.author, actor: 'Eksternal', detail: `${rating}★` });
        touch(); render();
        toast(`Ulasan baru ${rating}★ untuk ${lo.name}.`, { tone: rating <= 2 ? 'warn' : 'info', action: { label: 'Balas', run: () => { ui.reviews.account = acctOf(lo); ui.reviews.location = lo.code; ui.reviews.editing = rv.id; ui.reviews.drafts[rv.id] = ''; navigate('reviews'); } } });
        break;
      }
      // Integrasi Google
      case 'gbp-oauth':
        if (isLive()) { location.assign(`${MODE.getBaseUrl()}/integrations/google/oauth/start?redirect_uri=${encodeURIComponent(location.href.split('#')[0])}`); break; }
        if (!state.api.clientId || !state.api.hasClientSecret) { toast('Isi OAuth Client ID dan Client Secret lalu simpan konfigurasi terlebih dahulu.', { tone: 'warn' }); $('g-clientId')?.focus(); break; }
        state.api.connected = true; state.api.lastTest = Date.now(); log('Integrasi Google', 'Menghubungkan akun Google (simulasi)', { detail: state.api.account }); touch(); render(); toast('Akun Google terhubung (simulasi).', { tone: 'good' });
        break;
      case 'copy-redirect': (navigator.clipboard ? navigator.clipboard.writeText(redirectUri()) : Promise.reject()).then(() => toast('Redirect URI disalin.', { tone: 'good' }), () => toast('Tidak dapat menyalin — salin manual dari kolom.', { tone: 'warn' })); break;
      case 'api-health': checkHealth(); break;
      case 'api-url-save': saveApiUrl(); break;
      case 'sheet-close': sheet.close(); break;
      case 'toast-act': { const run = toastActions.get(Number(id)); dismissToast(id); run && run(); break; }
      case 'toast-close': dismissToast(id); break;
      // Unit kerja
      case 'open-loc': openDrawer(id, el.dataset.tab || 'overview'); break;
      case 'open-target': if (byCode().has(id)) openDrawer(id); else if (id.startsWith('KL-')) navigate('claims'); else if (id.startsWith('JOB-')) { ui.sync.tab = 'runs'; navigate('sync'); } break;
      case 'add-loc': locationForm(); break;
      case 'edit-loc': locationForm(id); break;
      case 'delete-loc': if (l) {
        const doDelete = () => { const snap = snapshot(); state.locations = state.locations.filter(x => x !== l); ui.loc.selected.delete(id); log('Unit Kerja', 'Menghapus unit', { target: id, detail: l.name }); touch(); if (sheet.open) sheet.close(); render(); toast(`${l.name} dihapus.`, { undo: snap }); remote('DELETE', `/locations/${encodeURIComponent(id)}`); };
        if (isLive()) confirmModal(`Hapus ${l.name}?`, 'Unit kerja akan dihapus dari server. Tindakan ini tidak bisa dibatalkan.', 'Hapus unit', doDelete); else doDelete();
      } break;
      case 'sort': ui.loc.dir = ui.loc.sort === id ? -ui.loc.dir : 1; ui.loc.sort = id; render(); break;
      case 'quick': ui.loc.quick = id; ui.loc.page = 1; render(); break;
      case 'page': ui.loc.page = Number(id); render(); $('bsMain').querySelector('.bs-table-wrap')?.scrollIntoView({ block: 'nearest' }); break;
      case 'unfilter': { const [k, v] = id.split(/:(.*)/s); ui.loc[k] = ui.loc[k].filter(x => x !== v); ui.loc.page = 1; render(); break; }
      case 'clear-filters': FILTERS.forEach(([k]) => { ui.loc[k] = []; }); ui.loc.page = 1; render(); break;
      case 'clear-all': FILTERS.forEach(([k]) => { ui.loc[k] = []; }); ui.loc.q = ''; ui.loc.quick = 'all'; ui.loc.page = 1; render(); break;
      case 'close-filter': case 'close-pop': ui.pop = ''; render(); break;
      case 'goto-filter': { const [k, v] = id.split(/:(.*)/s); FILTERS.forEach(([f]) => { ui.loc[f] = []; }); ui.loc.q = ''; ui.loc.quick = 'all'; ui.loc[k] = [v]; navigate('locations'); break; }
      case 'select': ui.loc.selected[el.checked ? 'add' : 'delete'](id); render(); break;
      case 'select-page': { const size = Number(prefs.pageSize) || 10, rows = locFiltered().slice((ui.loc.page - 1) * size, ui.loc.page * size); rows.forEach(r => ui.loc.selected[el.checked ? 'add' : 'delete'](r.code)); render(); break; }
      case 'select-all': locFiltered().forEach(r => ui.loc.selected.add(r.code)); render(); break;
      case 'clear-selection': ui.loc.selected.clear(); render(); break;
      case 'bulk-sync': runSync([...ui.loc.selected], { label: `${ui.loc.selected.size} unit terpilih` }); break;
      case 'bulk-export': exportLocations(state.locations.filter(x => ui.loc.selected.has(x.code)), 'branchsync-unit-terpilih.csv'); break;
      case 'bulk-delete': { const n = ui.loc.selected.size; confirmModal(`Hapus ${n} unit?`, `${n} unit kerja terpilih akan dihapus dari Dashboard. Anda bisa mengurungkannya dari notifikasi.`, `Hapus ${n} unit`, () => { const snap = snapshot(), codes = [...ui.loc.selected]; remote('POST', '/locations/bulk-delete', { codes }); state.locations = state.locations.filter(x => !ui.loc.selected.has(x.code)); log('Unit Kerja', 'Menghapus unit massal', { detail: `${n} unit` }); ui.loc.selected.clear(); touch(); toast(`${n} unit dihapus.`, { undo: snap }); }); break; }
      case 'export-locs': exportLocations(locFiltered()); break;
      case 'import': importDraft = null; importModal(); break;
      case 'import-template': download('template-impor-unit-kerja.csv', '﻿' + sampleCSV(3), 'text/csv;charset=utf-8'); break;
      case 'import-sample': importDraft = null; importModal(sampleCSV(25)); break;
      case 'import-parse': { const text = $('bsImportText').value; importDraft = analyzeImport(text); importModal(text); modal.querySelector('.bs-import-summary, .bs-form-error')?.scrollIntoView({ block: 'nearest' }); break; }
      case 'import-commit': commitImport(); break;
      // Peta
      case 'map-focus': if (l && mapObj) { mapObj.flyTo([l.lat, l.lng], 15, { duration: 0.6 }); mapMarkers.get(id)?.openPopup(); } else if (l) openDrawer(id); break;
      // Sinkronisasi
      case 'sync-all': runSync(null); break;
      case 'sync-one': if (l) runSync([id], { label: l.name, retry: true }); break;
      case 'retry': runSync([id], { retry: true, label: `Coba ulang ${id}` }); break;
      case 'retry-all': runSync(openFailures().map(f => f.code), { retry: true, label: 'Coba ulang kegagalan' }); break;
      case 'resolve': { const f = openFailures().find(x => x.code === id); if (f) noteModal('Catat tindak lanjut', `Tindak lanjut untuk ${locName(id)} — ${f.reason}`, t => { f.ref.resolved = true; f.ref.note = `${t} — ${ME.name}`; log('Sync Monitor', 'Mencatat tindak lanjut kegagalan', { target: id, detail: t }); remote('POST', '/sync/failures/resolve', { code: id, run: f.run, note: t }); toast('Kegagalan ditandai sudah ditangani.', { tone: 'good' }); }); break; }
      // Ketidaksesuaian
      case 'disc-push': case 'disc-pull': { const snap = snapshot(); resolveDisc(id, action === 'disc-push'); touch(); render(); toast(action === 'disc-push' ? 'Data Dashboard dikirim ke Google (simulasi).' : 'Data Google diterapkan ke Dashboard.', { tone: 'good', undo: snap }); break; }
      case 'disc-push-all': { const rows = discRows(); confirmModal('Pakai data Dashboard untuk semua?', `${rows.length} perbedaan yang tampil akan diselesaikan dengan mengirim data Dashboard ke Google.`, `Kirim ${rows.length} perubahan`, () => { const snap = snapshot(); remote('POST', '/discrepancies/resolve-bulk', { source: 'dashboard', items: rows.map(r => ({ code: r.l.code, field: r.field })) }); rows.forEach(r => resolveDisc(`${r.l.code}|${r.field}`, true, false)); toast(`${rows.length} perbedaan diselesaikan.`, { tone: 'good', undo: snap }); }, false); break; }
      case 'disc-note': noteModal('Catat temuan ketidaksesuaian', 'Catatan / dokumentasi', t => { state.discNotes[id] = { text: t, by: ME.name, time: Date.now() }; remote('PUT', '/discrepancies/notes', { code: id.split('|')[0], field: id.split('|')[1], text: t }); log('Ketidaksesuaian', 'Mendokumentasikan temuan', { target: id.split('|')[0], detail: `${FIELD_LABEL[id.split('|')[1]]}: ${t}` }); toast('Catatan disimpan.', { tone: 'good' }); }, state.discNotes[id]?.text || ''); break;
      case 'export-disc': { const rows = discRows(); downloadCSV('laporan-ketidaksesuaian.csv', [['Kode', 'Unit', 'Kota', 'Kolom', 'Dashboard', 'Google Maps', 'Selisih (m)', 'Catatan'], ...rows.map(r => [r.l.code, r.l.name, r.l.city, FIELD_LABEL[r.field], r.dash, r.google, r.dist ? Math.round(r.dist) : '', state.discNotes[`${r.l.code}|${r.field}`]?.text || ''])]); toast(`Laporan ${rows.length} perbedaan diunduh.`, { tone: 'good' }); break; }
      case 'simulate-google': simulateGoogleChange(); break;
      // Duplikat
      case 'dup-keep': {
        const parts = id.split('|'), side = parts.pop(), p = duplicatePairs().find(x => x.key === parts.join('|'));
        if (!p) break;
        const keep = side === 'a' ? p.a : p.b, drop = side === 'a' ? p.b : p.a, snap = snapshot();
        log('Duplikat', 'Menggabungkan titik ganda', { target: drop.code, detail: `Dipertahankan: ${keep.name}`, changes: diff(drop, { ...drop, status: 'Tidak Aktif', gbp: 'Duplikat' }, ['status', 'gbp']) });
        Object.assign(drop, { status: 'Tidak Aktif', gbp: 'Duplikat', updatedAt: Date.now(), updatedBy: ME.name });
        remote('POST', '/duplicates/merge', { keep: keep.code, drop: drop.code });
        touch(); render(); toast(`${drop.name} ditandai duplikat dari ${keep.name}.`, { tone: 'good', undo: snap }); break;
      }
      case 'dup-ignore': state.dupIgnored.push(id); remote('POST', '/duplicates/ignore', { a: id.split('|')[0], b: id.split('|')[1] }); log('Duplikat', 'Menandai bukan duplikat', { detail: id.replace('|', ' & ') }); touch(); render(); toast('Pasangan ditandai bukan duplikat.'); break;
      case 'dup-report': { const [a, b] = id.split('|'); claimForm(byCode().get(b)?.gbp === 'Terverifikasi' ? a : b); setTimeout(() => { const s = modal.querySelector('[name=kind]'); if (s) s.value = 'Laporan duplikat'; }, 0); break; }
      // Klaim
      case 'claim-new': claimForm(); break;
      case 'point-new': pointForm(); break;
      case 'claim-next': advanceClaim(id); break;
      case 'claim-reject': noteModal('Tolak permintaan', 'Alasan penolakan', t => { const c = state.claims.find(x => x.id === id); c.status = 'Ditolak'; c.note = t; c.doneAt = Date.now(); log('Klaim & Titik Baru', `Menolak ${c.id}`, { target: c.code || c.id, detail: t }); remote('POST', `/claims/${encodeURIComponent(id)}/reject`, { note: t }); toast(`${c.id} ditolak.`); }); break;
      // Persetujuan
      case 'cr-approve': decide(id, true); break;
      case 'cr-reject': decide(id, false); break;
      case 'simulate-edit': simulateEdit(); break;
      // Riwayat & SLA
      case 'export-audit': { const xs = auditFiltered(); downloadCSV('riwayat-perubahan.csv', [['Waktu', 'Pengguna', 'Jenis', 'Modul', 'Aksi', 'Target', 'Detail', 'Kolom', 'Sebelum', 'Sesudah'], ...xs.flatMap(x => (x.changes.length ? x.changes : [{ field: '', before: '', after: '' }]).map(c => [fmtDate(x.time), x.user, x.actor, x.module, x.action, x.target, x.detail, c.field, c.before, c.after]))]); toast(`${xs.length} aktivitas diekspor.`, { tone: 'good' }); break; }
      case 'export-sla': downloadCSV('laporan-sla.csv', [['ID', 'Jenis', 'Unit', 'Diajukan', 'Proses internal (jam)', 'Verifikasi Google (jam)', 'SLA', 'Status'], ...slaStats().rows.map(({ c, t }) => [c.id, c.kind, claimName(c), fmtDate(c.submittedAt), (t.internal / HOUR).toFixed(1), t.google == null ? '' : (t.google / HOUR).toFixed(1), t.sla, c.status])]); toast('Laporan SLA diunduh.', { tone: 'good' }); break;
      // Akses
      case 'add-user': userForm(); break;
      case 'edit-user': userForm(id); break;
      case 'toggle-user': { const u = state.users.find(x => x.id === Number(id)); if (!u || u.id === 1) break; u.status = u.status === 'Aktif' ? 'Nonaktif' : 'Aktif'; remote('PATCH', `/users/${encodeURIComponent(u.id)}`, { status: u.status }); log('Pengguna & Akses', `${u.status === 'Aktif' ? 'Mengaktifkan' : 'Menonaktifkan'} pengguna`, { detail: u.name }); touch(); render(); toast(`${u.name} ${u.status.toLowerCase()}.`); break; }
      case 'add-role': roleForm(); break;
      case 'edit-role': roleForm(id); break;
      // Integrasi
      case 'api-toggle': state.api.connected = !state.api.connected; remote('PATCH', '/integrations/google', { connected: state.api.connected }); log('Integrasi Google', state.api.connected ? 'Menghubungkan GBP' : 'Memutuskan GBP'); touch(); render(); toast(isLive() ? (state.api.connected ? 'Permintaan menghubungkan dikirim ke server.' : 'Permintaan memutus dikirim ke server.') : (state.api.connected ? 'Terhubung (simulasi).' : 'Koneksi diputus (simulasi).')); break;
      case 'api-test': if (isLive()) { remote('POST', '/integrations/google/test').then(res => { if (res) toast(res.ok === false ? `Uji gagal: ${res.message || 'tidak diketahui'}` : `Uji koneksi Google berhasil${res.latencyMs ? ` — ${res.latencyMs} ms` : ''}.`, { tone: res.ok === false ? 'bad' : 'good' }); }); break; }
        state.api.lastTest = Date.now(); log('Integrasi Google', 'Menguji koneksi', { detail: state.api.connected ? 'Berhasil' : 'Gagal: belum terhubung' }); touch(); render(); toast(state.api.connected ? 'Uji koneksi berhasil — 120 ms (simulasi).' : 'Uji gagal: hubungkan akun terlebih dahulu.', { tone: state.api.connected ? 'good' : 'bad' }); break;
      case 'api-reset': state.api.quotaUsed = 0; log('Integrasi Google', 'Mereset kuota harian'); touch(); render(); toast('Kuota direset.'); break;
      // Pengaturan
      case 'generate': confirmModal('Buat 1.000 unit uji?', 'Seribu unit kerja sintetis akan ditambahkan untuk menguji performa. Anda bisa menghapusnya lewat “Reset data demo”.', 'Buat 1.000 unit', () => setTimeout(() => generateUnits(1000), 0), false); break;
      case 'backup': download(`branchsync-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Cadangan diunduh.', { tone: 'good' }); break;
      case 'reset-data': confirmModal('Reset data demo?', 'Semua perubahan, impor, dan riwayat akan dikembalikan ke kondisi awal. Tindakan ini tidak bisa dibatalkan.', 'Reset data', () => { state = buildSeed(); ui.loc.selected.clear(); touch(); toast('Data demo dikembalikan ke kondisi awal.'); }); break;
    }
  }

  shell.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('.bs-skip')) { e.preventDefault(); $('bsMain').focus(); return; }
    if (t === modal) { closeModal(); return; }
    if (t === sheet) { sheet.close(); return; }
    // Tutup popover saat klik di luar
    if (!$('bsNotif').hidden && !t.closest('#bsNotif, #bsNotifBtn')) toggleNotif(false);
    if (!$('bsModeMenu').hidden && !t.closest('#bsModeMenu, #bsModeBtn')) toggleModeMenu(false);
    if (ui.pop && !t.closest(`[data-pop="${ui.pop}"]`)) { shell.querySelector(`[data-pop="${ui.pop}"]`)?.removeAttribute('open'); ui.pop = ''; }
    const v = t.closest('[data-view]');
    if (v && !v.disabled) { if (!$('bsNotif').hidden) toggleNotif(false); if (!$('bsModeMenu').hidden) toggleModeMenu(false); if (sheet.open) sheet.close(); closeModal(); navigate(v.dataset.view); return; }
    const a = t.closest('[data-action]');
    if (!a || a.disabled) return;
    if (a.tagName === 'INPUT' && !['select', 'select-page'].includes(a.dataset.action)) return;
    act(a.dataset.action, a.dataset.id || '', a);
  });
  shell.addEventListener('toggle', e => {
    if (e.target.matches?.('details[data-pop]')) {
      const name = e.target.dataset.pop;
      if (e.target.open) { if (ui.pop && ui.pop !== name) shell.querySelector(`[data-pop="${ui.pop}"]`)?.removeAttribute('open'); ui.pop = name; }
      else if (ui.pop === name) ui.pop = '';
    }
    if (e.target.matches?.('details.bs-scn')) { const no = Number(e.target.dataset.scnNo); if (e.target.open) ui.scn.open.add(no); else ui.scn.open.delete(no); }
  }, true);
  let scnTimer = 0;
  let inputTimer = 0;
  shell.addEventListener('input', e => {
    const t = e.target, bind = t.dataset.bind;
    if (t.dataset.scnNotes) { const it = scnItem(Number(t.dataset.scnNotes)); it.notes = t.value; it.updatedAt = Date.now(); clearTimeout(scnTimer); scnTimer = setTimeout(saveScn, 400); return; }
    if (t.dataset.scnMeta) { scn[t.dataset.scnMeta] = t.value.slice(0, 80); clearTimeout(scnTimer); scnTimer = setTimeout(saveScn, 400); return; }
    if (t.closest('#bsModal') && (t.name === 'lat' || t.name === 'lng')) { syncPickerFromInputs(); return; }
    if (t.dataset.draft) { ui.reviews.drafts[t.dataset.draft] = t.value; const c = $(`rv-count-${t.dataset.draft}`); if (c) c.textContent = `${t.value.length}/${fmtNum(REPLY_MAX)}`; return; }
    if (!bind || t.type === 'checkbox' || t.tagName === 'SELECT') return;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => { setBind(bind, t.value); if (bind.startsWith('map.')) updateMap(true); else render(); }, 140);
  });
  shell.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'bsImportFile' && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => { importDraft = analyzeImport(String(reader.result)); importModal(String(reader.result)); };
      reader.readAsText(t.files[0]);
      return;
    }
    if (t.dataset.hoursOpen) { const d = hoursDraft[t.dataset.hoursOpen]; d.open = t.checked; if (d.open && !d.h24 && !d.ranges.length) d.ranges = [{ from: '08:00', to: '15:00' }]; refreshHours(`[data-hours-open="${t.dataset.hoursOpen}"]`); return; }
    if (t.dataset.hoursAllday) { const d = hoursDraft[t.dataset.hoursAllday]; d.h24 = t.checked; if (!d.h24 && !d.ranges.length) d.ranges = [{ from: '08:00', to: '15:00' }]; refreshHours(`[data-hours-allday="${t.dataset.hoursAllday}"]`); return; }
    if (t.dataset.hoursFrom || t.dataset.hoursTo) { const [k, i] = (t.dataset.hoursFrom || t.dataset.hoursTo).split(':'); hoursDraft[k].ranges[Number(i)][t.dataset.hoursFrom ? 'from' : 'to'] = t.value; updateHoursSummary(); return; }
    if (t.dataset.scnCheck) { const [no, i] = t.dataset.scnCheck.split(':'); const it = scnItem(Number(no)); it.checks[Number(i)] = t.checked; it.updatedAt = Date.now(); saveScn(); render(); return; }
    if (t.dataset.scnResult) { const it = scnItem(Number(t.dataset.scnResult)); it.result = t.value; it.updatedAt = Date.now(); saveScn(); render(); toast(L2(['Hasil pengujian disimpan.', 'Test result saved.']), { tone: 'good' }); return; }
    if (t.dataset.scnUpload && t.files.length) {
      const no = Number(t.dataset.scnUpload), it = scnItem(no), files = [...t.files].slice(0, Math.max(0, 4 - it.evidence.filter(ev => ev.type === 'image').length));
      if (!files.length) { toast(L2(['Maksimal 4 foto per skenario.', 'Maximum 4 photos per scenario.']), { tone: 'warn' }); return; }
      Promise.all(files.map(compressImage)).then(datas => {
        datas.forEach(d => it.evidence.push({ type: 'image', data: d, time: Date.now() }));
        it.updatedAt = Date.now();
        if (!saveScn()) datas.forEach(() => it.evidence.pop());
        render();
        toast(L2([`${datas.length} foto bukti ditambahkan.`, `${datas.length} evidence photo(s) added.`]), { tone: 'good' });
      }).catch(err => toast(err.message, { tone: 'bad' }));
      return;
    }
    if (t.dataset.actionChange === 'review-template') {
      const tpl = REPLY_TEMPLATES[Number(t.value)], rv = state.reviews.find(x => x.id === t.dataset.id);
      if (tpl && rv) {
        const text = fillTemplate(tpl.text, rv.author, locName(rv.code)), ta = $(`rv-text-${rv.id}`);
        ui.reviews.drafts[rv.id] = text;
        if (ta) { ta.value = text; ta.focus(); }
        const c = $(`rv-count-${rv.id}`); if (c) c.textContent = `${text.length}/${fmtNum(REPLY_MAX)}`;
      }
      t.value = '';
      return;
    }
    if (t.dataset.col) {
      const U = up(), curCols = visibleCols().map(c => c.key);
      U.cols = t.checked ? [...new Set([...curCols, t.dataset.col])] : curCols.filter(k => k !== t.dataset.col);
      saveUP(); ui.pop = 'cols'; render(); return;
    }
    if (t.dataset.density) { up().density = t.dataset.density; saveUP(); ui.pop = 'cols'; render(); return; }
    if (t.dataset.actionChange === 'loc-sort') { const [k, d] = t.value.split(':'); if (LOC_SORTS.includes(k)) { ui.loc.sort = k; ui.loc.dir = d === '-1' ? -1 : 1; ui.loc.page = 1; render(); } return; }
    if (t.dataset.actionChange === 'bulk-status' && t.value) {
      if (!guard('locations.write')) { t.value = ''; return; }
      const status = t.value, n = ui.loc.selected.size, snap = snapshot();
      state.locations.forEach(l => { if (ui.loc.selected.has(l.code) && l.status !== status) { log('Unit Kerja', 'Mengubah status (massal)', { target: l.code, changes: [{ field: 'Status', before: l.status, after: status }] }); l.status = status; l.updatedAt = Date.now(); l.updatedBy = ME.name; } });
      remote('POST', '/locations/bulk-update', { codes: [...ui.loc.selected], patch: { status } });
      touch(); render(); toast(`Status ${n} unit diubah menjadi ${status}.`, { tone: 'good', undo: snap });
      return;
    }
    if (t.dataset.filter) {
      const k = t.dataset.filter;
      ui.loc[k] = t.checked ? [...new Set([...ui.loc[k], t.value])] : ui.loc[k].filter(x => x !== t.value);
      ui.loc.page = 1; ui.pop = 'filter'; render();
      return;
    }
    if (t.dataset.perm) {
      if (!guard('users.manage')) { t.checked = !t.checked; return; }
      const r = state.roles[Number(t.dataset.role)], p = t.dataset.perm;
      r.permissions = t.checked ? [...new Set([...r.permissions, p])] : r.permissions.filter(x => x !== p);
      log('Pengguna & Akses', `${t.checked ? 'Memberi' : 'Mencabut'} izin`, { detail: `${r.name}: ${p}` });
      remote('PATCH', `/roles/${encodeURIComponent(r.name)}`, { permissions: r.permissions });
      touch(); toast(`${r.name}: izin “${PERMS.find(x => x[0] === p)[1]}” ${t.checked ? 'diberikan' : 'dicabut'}.`);
      return;
    }
    const bind = t.dataset.bind;
    if (!bind || (t.type !== 'checkbox' && t.tagName !== 'SELECT')) return;
    setBind(bind, t.type === 'checkbox' ? t.checked : t.value);
    if (bind.startsWith('map.')) updateMap(bind !== 'map.showGoogle'); else render();
  });
  shell.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    if (form.id === 'bsModalForm') {
      if (!modalSubmit) { closeModal(); return; }
      const fd = new FormData(form), p = Object.fromEntries(fd);
      form.querySelectorAll('input[type=checkbox][name]').forEach(c => { if (c.name !== 'perm') p[c.name] = c.checked; });
      const finish = r => { if (r && (typeof r === 'string' || Object.keys(r).length)) { showErrors(r); return; } modalSubmit = null; closeModal(); touch(); render(); };
      const res = modalSubmit(p, fd);
      if (res && typeof res.then === 'function') {
        const sb = form.querySelector('[type="submit"]'), label = sb ? sb.textContent : '';
        if (sb) { sb.disabled = true; sb.setAttribute('aria-busy', 'true'); sb.textContent = 'Menghubungkan…'; }
        const done = () => { if (sb && sb.isConnected) { sb.disabled = false; sb.removeAttribute('aria-busy'); sb.textContent = label; } };
        res.then(r => { done(); finish(r); }, err => { done(); showErrors(err && err.message ? err.message : 'Terjadi kesalahan.'); });
        return;
      }
      finish(res);
      return;
    }
    if (form.id === 'bsGoogleForm') {
      if (!guard('settings.write')) return;
      const fd = new FormData(form), p = Object.fromEntries(fd), errs = {};
      const next = { project: String(p.project || '').trim(), account: String(p.account || '').trim(), clientId: String(p.clientId || '').trim(), scopes: fd.getAll('scopes'), syncInterval: String(p.syncInterval || '60'), quotaLimit: Number(p.quotaLimit), pubsubTopic: String(p.pubsubTopic || '').trim(), webhook: fd.has('webhook') };
      const secret = String(p.clientSecret || ''), apiKey = String(p.apiKey || '').trim();
      if (next.project && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(next.project)) errs.project = 'Format: 6–30 karakter huruf kecil, angka, atau tanda hubung.';
      if (next.account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.account)) errs.account = 'Email tidak valid.';
      if (next.clientId && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(next.clientId)) errs.clientId = 'Client ID harus berakhiran .apps.googleusercontent.com';
      if (apiKey && !/^AIza[0-9A-Za-z_-]{35}$/.test(apiKey)) errs.apiKey = 'API key Google diawali "AIza" dan terdiri dari 39 karakter.';
      if (!next.scopes.includes('business.manage')) errs.scopes = 'Scope business.manage wajib untuk mengelola lokasi dan ulasan.';
      if (!Number.isFinite(next.quotaLimit) || next.quotaLimit < 100 || next.quotaLimit > 1000000) errs.quotaLimit = 'Isi angka 100–1.000.000.';
      if (next.pubsubTopic && !/^projects\/[^/]+\/topics\/[^/]+$/.test(next.pubsubTopic)) errs.pubsubTopic = 'Format: projects/<project>/topics/<nama-topik>';
      form.querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
      form.querySelectorAll('.bs-field-hint').forEach(h => { h.classList.remove('is-error'); if (h.dataset.hint != null) h.textContent = h.dataset.hint; });
      if (Object.keys(errs).length) {
        Object.entries(errs).forEach(([k, msg]) => { const inp = form.querySelector(`[name="${k}"]`), h = $(`gh-${k}`); if (inp && k !== 'scopes') inp.setAttribute('aria-invalid', 'true'); if (h) { h.textContent = msg; h.classList.add('is-error'); } });
        $('bsGoogleError').textContent = 'Periksa kembali isian yang ditandai.';
        (form.querySelector('[aria-invalid="true"]') || form.querySelector('[name="scopes"]')).focus();
        return;
      }
      $('bsGoogleError').textContent = '';
      const changes = diff({ ...state.api, scopes: state.api.scopes.join(', ') }, { ...next, scopes: next.scopes.join(', ') }, ['project', 'account', 'clientId', 'scopes', 'syncInterval', 'quotaLimit', 'pubsubTopic', 'webhook']);
      if (secret) changes.push({ field: 'Client secret', before: state.api.hasClientSecret ? '••••' : '', after: '•••• (baru)' });
      if (apiKey) changes.push({ field: 'API key', before: state.api.hasApiKey ? '••••' : '', after: '•••• (baru)' });
      if (!changes.length) { toast('Tidak ada perubahan.'); return; }
      Object.assign(state.api, next);
      if (secret) state.api.hasClientSecret = true;
      if (apiKey) state.api.hasApiKey = true;
      log('Integrasi Google', 'Memperbarui konfigurasi Google API', { changes });
      remote('PATCH', '/integrations/google', { ...next, ...(secret ? { clientSecret: secret } : {}), ...(apiKey ? { apiKey } : {}) });
      touch(); render();
      toast(isLive() ? 'Konfigurasi dikirim ke server.' : `Konfigurasi disimpan${secret || apiKey ? ' (rahasia tidak disimpan di Mode Demo)' : ''}.`, { tone: 'good' });
      return;
    }
    if (form.id === 'bsSettingsForm') {
      if (!guard('settings.write')) return;
      const p = Object.fromEntries(new FormData(form)), s = state.settings, errs = [];
      const num = (k, min, max, label) => { const v = Number(p[k]); if (!Number.isFinite(v) || v < min || v > max) errs.push(`${label} harus ${min}–${max}.`); return v; };
      const next = { workspace: String(p.workspace || '').trim(), timezone: p.timezone, slaInternal: num('slaInternal', 1, 720, 'SLA internal'), slaGoogle: num('slaGoogle', 1, 2000, 'Acuan Google'), dupRadius: num('dupRadius', 10, 2000, 'Radius duplikat'), coordTol: num('coordTol', 5, 2000, 'Toleransi koordinat') };
      if (!next.workspace) errs.push('Nama workspace wajib diisi.');
      if (errs.length) { toast(errs.join(' '), { tone: 'bad' }); return; }
      const changes = diff(s, next, Object.keys(next));
      Object.assign(s, next);
      if (changes.length) { log('Pengaturan', 'Mengubah pengaturan', { changes }); remote('PATCH', '/settings', next); }
      touch(); render(); toast(changes.length ? `Pengaturan disimpan (${changes.length} perubahan).` : 'Tidak ada perubahan.', { tone: 'good' });
    }
  });
  modal.addEventListener('close', () => {
    destroyPicker();
    modalSubmit = null;
    const t = modalTrigger; modalTrigger = null;
    if (t && (!t.scope || $(t.scope)?.open)) restoreFocus(t);
    if (!shell.contains(document.activeElement) || document.activeElement === document.body) (sheet.open ? sheet.querySelector('.bs-sheet-head button') : $('bsTitle'))?.focus({ preventScroll: true });
  });
  sheet.addEventListener('close', () => {
    ui.drawer = null;
    syncUrl();
    const t = sheetTrigger; sheetTrigger = null;
    if (t && t.isConnected) t.focus({ preventScroll: true }); else $('bsTitle')?.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', e => {
    if (shell.hidden) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (palette.open) palette.close(); else if (!modal.open) openPalette(); return; }
    const menu = $('bsModeMenu');
    if (!menu.hidden) {
      const items = [...menu.querySelectorAll('[role^="menuitem"]')], i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); return; }
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); return; }
      if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); toggleModeMenu(false); if (e.key === 'Escape') $('bsModeBtn').focus(); return; }
    }
    if (e.key === 'Escape') {
      if (!$('bsNotif').hidden) { toggleNotif(false); $('bsNotifBtn').focus(); return; }
      if (ui.pop) { const name = ui.pop; ui.pop = ''; render(); shell.querySelector(`[data-pop="${name}"] summary`)?.focus(); return; }
      if (ui.navOpen) { closeNav(); shell.querySelector('.bs-menu').focus(); return; }
    }
    if (typing || modal.open || palette.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { const s = shell.querySelector('#bsPage [data-search]'); if (s) { e.preventDefault(); s.focus(); s.select(); } }
    else if (e.key === '?') { e.preventDefault(); shortcutsModal(); }
    else if (e.key.toLowerCase() === 'n' && !sheet.open) { e.preventDefault(); if (guard('locations.write')) locationForm(); }
  });
  setInterval(() => { if (!shell.hidden && !ui.running) updateChrome(); }, 30000);
  // Live: muat ulang berkala agar edit eksternal & hasil sync terbaru muncul.
  const liveRefreshOk = () => !shell.hidden && isLive() && ui.live.ready && !ui.running && !modal.open && document.visibilityState === 'visible';
  setInterval(() => { if (liveRefreshOk()) loadLive({ silent: true }); }, 60000);
  document.addEventListener('visibilitychange', () => { if (liveRefreshOk() && Date.now() - ui.live.syncedAt > 30000) loadLive({ silent: true }); });

  /* ------------------------------------------------------------------ *
   * Masuk / keluar
   * ------------------------------------------------------------------ */
  function logout() {
    if (isLive() && MODE.hasSession()) { MODE.request('POST', '/auth/logout').catch(() => {}); MODE.clearSession(); }
    ui.live = { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 };
    if (sheet.open) sheet.close();
    closeModal();
    if (mapObj) { mapObj.remove(); mapObj = null; renderedView = null; }
    shell.hidden = true;
    document.querySelector('.page-container').hidden = false;
    document.body.classList.remove('admin-active');
    document.documentElement.lang = typeof language !== 'undefined' ? language : 'id';
    document.querySelector('.header-actions [data-login]')?.focus();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    window.dispatchEvent(new Event('resize'));
  }
  const storageReady = (async () => {
    try {
      let s0 = await STORE.get('demoState'), sc = await STORE.get('scenarioTests');
      if (!s0) { const raw = localStorage.getItem(STORE_KEY); if (raw) { s0 = JSON.parse(raw); await STORE.set('demoState', s0); localStorage.removeItem(STORE_KEY); } }
      if (!sc) { const raw = localStorage.getItem(SCN_KEY); if (raw) { sc = JSON.parse(raw); await STORE.set('scenarioTests', sc); localStorage.removeItem(SCN_KEY); } }
      storageMode = 'idb';
      if (s0 && s0.v === 2 && Array.isArray(s0.locations)) demoState = ensureExtras(s0);
      if (sc && typeof sc === 'object') scn = { tester: '', org: '', items: {}, ...sc };
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (_) {
      storageMode = 'local';
    }
    if (!demoState) demoState = legacyLoad();
    if (!isLive()) state = demoState;
    cache = {};
  })();
  window.BranchAdmin = {
    async enter(opts = {}) {
      try { loginTrigger = null; } catch (_) {}
      try { dialog.close(); } catch (_) {}
      document.querySelector('.page-container').hidden = true;
      shell.hidden = false;
      document.body.classList.add('admin-active');
      document.documentElement.lang = shell.lang = isEn() ? 'en' : 'id';
      translateAll();
      shell.dataset.theme = prefs.theme || (document.body.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      let live = isLive(), notice = opts.notice || '';
      if (live && !(MODE.hasSession() && MODE.getBaseUrl())) {
        MODE.setMode('demo'); live = false;
        notice = 'Sesi Live tidak aktif — Anda masuk di Mode Demo. Pilih “Live” di header untuk menyambung.';
      }
      await storageReady;
      ME = live ? userFromSession() : demoUser();
      cache = {};
      ui.loc.selected.clear();
      if (live) { state = blankState(); ui.live = { ready: false, loading: true, error: null, syncedAt: 0, pending: 0 }; }
      else { state = loadState(); log('Dashboard', 'Masuk ke workspace', { detail: 'Sesi demo' }); }
      touch();
      applyLayout();
      const route = parseRoute(location.hash);
      let routed = null;
      if (route) { routing = true; routed = applyRoute(route); routing = false; }
      navigate(routed ? routed.view : opts.view && VIEWS[opts.view] ? opts.view : 'dashboard', { push: false });
      if (routed && !live) openRouteUnit(routed);
      if (live) loadLive().then(ok => { if (!ok) return; openRouteUnit(routed); toast(notice || `Terhubung ke ${MODE.host()}. Selamat datang, ${ME.name}!`, { tone: 'good' }); });
      else toast(notice || `Mode Demo — data simulasi. Ganti ke Live lewat menu mode di header.`, { tone: notice ? 'warn' : 'info' });
    }
  };
})();
