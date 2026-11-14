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
  const fmtNum = n => new Intl.NumberFormat('id-ID').format(n);
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
  const fmtDist = m => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
  function fmtDur(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    const m = Math.max(0, Math.round(ms / MIN));
    if (m < 60) return `${m} mnt`;
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 48) return mm ? `${h} j ${mm} m` : `${h} jam`;
    const d = Math.floor(h / 24), hh = h % 24;
    return hh ? `${d} hr ${hh} j` : `${d} hari`;
  }
  const fmtDate = (t, opts = { dateStyle: 'medium', timeStyle: 'short' }) => new Intl.DateTimeFormat('id-ID', { timeZone: state.settings.timezone, ...opts }).format(new Date(t));
  function fmtRel(t) {
    const d = Date.now() - t;
    if (d < MIN) return 'baru saja';
    if (d < HOUR) return `${Math.floor(d / MIN)} mnt lalu`;
    if (d < DAY) return `${Math.floor(d / HOUR)} jam lalu`;
    if (d < 7 * DAY) return `${Math.floor(d / DAY)} hari lalu`;
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
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'
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
    ['audit.read', 'Lihat riwayat'], ['users.manage', 'Kelola pengguna'], ['settings.write', 'Ubah pengaturan']
  ];
  const ME = { name: 'Admin Demo', email: 'admin@example.test' };
  const STORE_KEY = 'branchSync.admin.v2', PREF_KEY = 'branchSync.admin.prefs';
  const STREETS = ['Sudirman', 'Ahmad Yani', 'Diponegoro', 'Gatot Subroto', 'Merdeka', 'Veteran', 'Pahlawan', 'Pemuda', 'Imam Bonjol', 'Gajah Mada'];
  const HOURS = ['Sen–Jum 08.00–15.00', 'Sen–Jum 08.00–16.00', 'Sen–Sab 08.00–14.00', 'Setiap hari 24 jam'];
  const EXT_EMAILS = ['pengguna.lain@gmail.com', 'local.guide.88@gmail.com', 'agency.seo@outlook.com', 'tidak.dikenal@yahoo.com'];

  const NAV = [
    { group: 'Monitoring', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'grid', desc: 'Ringkasan kondisi jaringan dan pekerjaan yang perlu ditindaklanjuti.' },
      { id: 'map', label: 'Peta Unit Kerja', icon: 'map', desc: 'Sebaran unit kerja beserta selisih titik dengan Google Maps.' },
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
      { id: 'sync', label: 'Sync Monitor', icon: 'refresh', count: () => openFailures().length, desc: 'Pantau job sinkronisasi dan tindak lanjuti data yang gagal diperbarui.' },
      { id: 'audit', label: 'Riwayat Perubahan', icon: 'history', desc: 'Jejak sebelum–sesudah setiap perubahan beserta pengguna internal maupun eksternal.' }
    ] },
    { group: 'Administrasi', items: [
      { id: 'access', label: 'Pengguna & Akses', icon: 'users', desc: 'Kelola pengguna, peran, dan izin akses.' },
      { id: 'integrations', label: 'Integrasi Google', icon: 'plug', desc: 'Koneksi Google Business Profile, kuota API, dan notifikasi.' },
      { id: 'settings', label: 'Pengaturan', icon: 'sliders', desc: 'Preferensi workspace, target SLA, aturan deteksi, dan data demo.' }
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

    return {
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
    };
  }

  /* ------------------------------------------------------------------ *
   * State & persistensi
   * ------------------------------------------------------------------ */
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s && s.v === 2 && Array.isArray(s.locations)) return s;
    } catch (_) { /* penyimpanan tidak tersedia */ }
    return buildSeed();
  }
  let state = loadState();
  let prefs = { theme: '', collapsed: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (_) {}
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {} };
  let saveTimer = 0;
  const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {} }, 250); };
  let cache = {};
  const touch = () => { cache = {}; persist(); };
  const memo = (k, fn) => (k in cache ? cache[k] : (cache[k] = fn()));
  const snapshot = () => JSON.stringify(state);

  const ui = {
    view: 'dashboard', navOpen: false, running: null, filterOpen: false, renderMs: 0,
    loc: { q: '', quick: 'all', status: [], region: [], type: [], gbp: [], sort: 'name', dir: 1, page: 1, selected: new Set() },
    map: { q: '', status: '', region: '', gbp: '', showGoogle: true },
    disc: { q: '', field: '' }, claims: { tab: 'active' }, approvals: { tab: 'pending' },
    sync: { tab: 'failures' }, audit: { q: '', module: '', actor: '', range: '30' }, access: { tab: 'users', q: '' },
    drawer: null
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
    const pend = state.approvals.filter(a => a.status === 'Menunggu').length, f = openFailures().length, im = issueMap().size, dp = duplicatePairs().length, risk = slaStats().atRisk;
    return [
      pend && { icon: 'inbox', tone: 'warn', title: `${pend} edit dari email GBP lain menunggu persetujuan`, text: 'Data unit kerja tidak berubah sampai disetujui.', view: 'approvals' },
      f && { icon: 'refresh', tone: 'bad', title: `${f} unit gagal disinkronkan`, text: 'Coba ulang atau beri catatan tindak lanjut.', view: 'sync' },
      risk && { icon: 'gauge', tone: 'warn', title: `${risk} permintaan mendekati/lewat SLA`, text: `Target proses internal ${state.settings.slaInternal} jam.`, view: 'sla' },
      im && { icon: 'alert', tone: 'warn', title: `${im} unit berbeda dengan Google Maps`, text: 'Tentukan sumber data yang benar.', view: 'discrepancies' },
      dp && { icon: 'copy', tone: 'info', title: `${dp} kemungkinan titik ganda`, text: 'Periksa dan gabungkan bila perlu.', view: 'duplicates' }
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
    if (ui.running) { toast('Sinkronisasi lain sedang berjalan.', { tone: 'warn' }); return; }
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
    if (state.runs.length > 400) state.runs.length = 400;
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
        <span class="bs-avatar" aria-hidden="true">AD</span>
        <span class="bs-account-text"><strong>${esc(ME.name)}</strong><small>Administrator</small></span>
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
          <span class="bs-env" title="Data simulasi, tidak dikirim ke Google">Demo lokal</span>
          <div class="bs-pop-wrap">
            <button type="button" class="bs-icon-btn" id="bsNotifBtn" data-action="notif" aria-haspopup="true" aria-expanded="false" aria-controls="bsNotif" aria-label="Notifikasi">${ic('bell')}<span class="bs-count-dot" id="bsNotifCount"></span></button>
            <div class="bs-popover bs-notif" id="bsNotif" hidden></div>
          </div>
          <button type="button" class="bs-icon-btn" id="bsThemeBtn" data-action="theme" aria-label="Ganti tema">${ic('moon')}</button>
          <button type="button" class="bs-icon-btn bs-hide-sm" data-action="shortcuts" aria-label="Pintasan keyboard" title="Pintasan keyboard (?)">${ic('keyboard')}</button>
        </div>
      </header>
      <main class="bs-main" id="bsMain" tabindex="-1">
        <div class="bs-page" id="bsPage"></div>
        <footer class="bs-footer"><span id="bsFooterInfo"></span><span>Demo lokal — perubahan disimpan di browser ini dan tidak dikirim ke Google atau server.</span></footer>
      </main>
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
  const btn = (label, action, { id = '', icon = '', variant = '', title = '', attrs = '' } = {}) =>
    `<button type="button" class="bs-btn ${variant}" data-action="${action}"${id !== '' ? ` data-id="${esc(id)}"` : ''}${title ? ` title="${esc(title)}" aria-label="${esc(title)}"` : ''} ${attrs}>${icon ? ic(icon) : ''}${label ? `<span>${label}</span>` : ''}</button>`;
  const go = (label, view, variant = 'sm ghost') => `<button type="button" class="bs-btn ${variant}" data-view="${view}"><span>${label}</span>${ic('chev')}</button>`;
  const card = (title, body, { actions = '', sub = '', cls = '', flush = false } = {}) =>
    `<section class="bs-card ${cls}"><header class="bs-card-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="bs-card-actions">${actions}</div>` : ''}</header><div class="bs-card-body${flush ? ' flush' : ''}">${body}</div></section>`;
  const emptyState = (title, text, cta = '', icon = 'check') => `<div class="bs-empty-state">${ic(icon)}<strong>${title}</strong><p>${text}</p>${cta}</div>`;
  const head = (title, desc, actions = '') => `<div class="bs-page-head"><div><h1 id="bsTitle" tabindex="-1">${title}</h1><p>${desc}</p></div>${actions ? `<div class="bs-page-actions">${actions}</div>` : ''}</div>`;
  const tabs = (bind, items, cur) => `<div class="bs-tabs" role="tablist">${items.map(([v, l, n]) => `<button type="button" role="tab" aria-selected="${v === cur}" data-action="tab" data-id="${bind}:${v}">${l}${n != null ? `<span class="bs-tab-count">${fmtNum(n)}</span>` : ''}</button>`).join('')}</div>`;
  const opts = (xs, v, all) => (all ? `<option value="">${all}</option>` : '') + xs.map(x => { const [val, lab] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`; }).join('');
  const selectF = (bind, label, xs, v, all = 'Semua') => `<label class="bs-field"><span>${label}</span><select data-bind="${bind}">${opts(xs, v, all)}</select></label>`;
  const searchF = (bind, label, v, ph, id) => `<label class="bs-field bs-grow"><span>${label}</span><span class="bs-input-ic">${ic('search')}<input type="search" id="${id}" data-bind="${bind}" data-search value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off"></span></label>`;
  const table = (heads, rows, emptyMsg = 'Tidak ada data.') =>
    `<div class="bs-table-wrap" tabindex="0" role="region" aria-label="Tabel data"><table class="bs-table"><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td class="bs-td-empty" colspan="${heads.length}">${emptyMsg}</td></tr>`}</tbody></table></div>`;
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
    const dayLabel = t => new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(new Date(t));
    const fullLabel = t => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(t));
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
      { n: claimsN, icon: 'shield', tone: 'info', title: 'Klaim & titik baru berjalan', text: `${sla.atRisk} mendekati atau lewat SLA.`, view: 'claims', cta: 'Pantau' }
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
  function locFiltered() {
    const f = ui.loc, q = f.q.trim().toLowerCase(), im = issueMap(), quick = (QUICK.find(x => x[0] === f.quick) || QUICK[0])[2];
    const xs = state.locations.filter(l =>
      (!q || `${l.name} ${l.code} ${l.city} ${l.province} ${l.address}`.toLowerCase().includes(q)) &&
      FILTERS.every(([k]) => !f[k].length || f[k].includes(l[k])) && quick(l));
    const k = f.sort, dir = f.dir;
    const val = l => (k === 'issues' ? im.get(l.code)?.length || 0 : l[k]);
    return xs.sort((a, b) => { const va = val(a), vb = val(b); return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'id', { numeric: true })) * dir; });
  }
  function viewLocations() {
    const f = ui.loc, all = locFiltered(), size = Number(state.settings.pageSize) || 10;
    const pages = Math.max(1, Math.ceil(all.length / size));
    f.page = Math.min(Math.max(1, f.page), pages);
    const rows = all.slice((f.page - 1) * size, f.page * size), im = issueMap();
    const activeFilters = FILTERS.flatMap(([k, l]) => f[k].map(v => [k, l, v]));
    const th = (label, key) => { const s = f.sort === key; return `<button type="button" class="bs-sort" data-action="sort" data-id="${key}" aria-label="Urutkan menurut ${label}">${label}<span aria-hidden="true">${s ? (f.dir > 0 ? '↑' : '↓') : '↕'}</span></button>`; };
    const pageAllSel = rows.length && rows.every(l => f.selected.has(l.code));
    const headCells = [
      `<input type="checkbox" class="bs-check" data-action="select-page" aria-label="Pilih semua di halaman ini" ${pageAllSel ? 'checked' : ''}>`,
      th('Unit kerja', 'name'), th('Lokasi', 'city'), th('Status', 'status'), th('Status GBP', 'gbp'), th('Data Google', 'issues'), th('Diperbarui', 'updatedAt'), '<span class="bs-sr">Aksi</span>'
    ];
    const body = rows.map(l => {
      const iss = im.get(l.code), sel = f.selected.has(l.code);
      return `<tr class="${sel ? 'is-selected' : ''}">
        <td class="bs-td-check"><input type="checkbox" class="bs-check" data-action="select" data-id="${esc(l.code)}" aria-label="Pilih ${esc(l.name)}" ${sel ? 'checked' : ''}></td>
        <td><button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(l.code)}"><strong>${esc(l.name)}</strong><small>${esc(l.code)} · ${esc(l.type)}</small></button></td>
        <td>${esc(l.city)}<small>${esc(l.province)}</small></td>
        <td>${badge(l.status)}</td><td>${badge(l.gbp)}</td>
        <td>${iss ? `<button type="button" class="bs-issue" data-action="open-loc" data-id="${esc(l.code)}" data-tab="compare">${ic('alert')}${iss.length} beda</button>` : l.google ? `<span class="bs-ok">${ic('check')}Sesuai</span>` : '<span class="bs-muted">Belum ada listing</span>'}</td>
        <td><span title="${fmtDate(l.updatedAt)}">${fmtRel(l.updatedAt)}</span><small>${esc(l.updatedBy)}</small></td>
        <td class="bs-td-actions">${btn('', 'edit-loc', { id: l.code, icon: 'edit', variant: 'icon ghost', title: `Edit ${l.name}` })}</td></tr>`;
    });
    const quickCounts = QUICK.map(([v, l, fn]) => [v, l, state.locations.filter(fn).length]);
    const filterPanel = `<details class="bs-filter" data-filter-pop ${ui.filterOpen ? 'open' : ''}><summary class="bs-btn">${ic('filter')}<span>Filter${activeFilters.length ? ` (${activeFilters.length})` : ''}</span></summary>
      <div class="bs-popover bs-filter-panel">${FILTERS.map(([k, l, xs]) => `<fieldset><legend>${l}</legend>${xs.map(v => `<label class="bs-checkline"><input type="checkbox" data-filter="${k}" value="${esc(v)}" ${f[k].includes(v) ? 'checked' : ''}><span>${esc(v)}</span><small>${fmtNum(state.locations.filter(x => x[k] === v).length)}</small></label>`).join('')}</fieldset>`).join('')}
      <div class="bs-filter-foot">${btn('Hapus filter', 'clear-filters', { variant: 'sm ghost' })}${btn('Selesai', 'close-filter', { variant: 'sm primary' })}</div></div></details>`;
    const bulk = f.selected.size ? `<div class="bs-bulkbar" role="region" aria-label="Aksi massal">
      <strong>${fmtNum(f.selected.size)} dipilih</strong>
      ${f.selected.size < all.length ? btn(`Pilih semua ${fmtNum(all.length)} hasil`, 'select-all', { variant: 'sm ghost' }) : ''}
      <span class="bs-spacer"></span>
      <label class="bs-inline-select"><span class="bs-sr">Ubah status</span><select data-action-change="bulk-status"><option value="">Ubah status…</option>${opts(STATUSES)}</select></label>
      ${btn('Sinkronkan', 'bulk-sync', { icon: 'refresh', variant: 'sm' })}${btn('Ekspor', 'bulk-export', { icon: 'download', variant: 'sm' })}${btn('Hapus', 'bulk-delete', { icon: 'trash', variant: 'sm danger' })}
      ${btn('', 'clear-selection', { icon: 'x', variant: 'sm icon ghost', title: 'Batalkan pilihan' })}</div>` : '';
    const pageBtns = [];
    for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - f.page) <= 1) pageBtns.push(p); else if (pageBtns[pageBtns.length - 1] !== '…') pageBtns.push('…');
    return head('Unit Kerja', navItem('locations').desc,
      btn('Impor CSV', 'import', { icon: 'upload' }) + btn('Ekspor', 'export-locs', { icon: 'download' }) + btn('Tambah unit', 'add-loc', { icon: 'plus', variant: 'primary' })) +
      `<section class="bs-card"><div class="bs-card-body flush">
        <div class="bs-segment" role="tablist" aria-label="Tampilan cepat">${quickCounts.map(([v, l, n]) => `<button type="button" role="tab" aria-selected="${f.quick === v}" data-action="quick" data-id="${v}">${l}<span>${fmtNum(n)}</span></button>`).join('')}</div>
        <div class="bs-toolbar">${searchF('loc.q', 'Cari unit kerja', f.q, 'Nama, kode, kota, provinsi, atau alamat…  ( / )', 'bsLocQ')}${filterPanel}</div>
        ${activeFilters.length ? `<div class="bs-chips">${activeFilters.map(([k, l, v]) => `<button type="button" class="bs-chip" data-action="unfilter" data-id="${k}:${esc(v)}" aria-label="Hapus filter ${esc(l)}: ${esc(v)}"><span>${esc(l)}: <b>${esc(v)}</b></span>${ic('x')}</button>`).join('')}${btn('Hapus semua', 'clear-filters', { variant: 'sm ghost' })}</div>` : ''}
        ${bulk}
        ${table(headCells, body, `<div class="bs-empty-inline">${ic('search')}<strong>Tidak ada unit yang cocok</strong><span>Ubah kata kunci atau ${f.q || activeFilters.length || f.quick !== 'all' ? '<button type="button" class="bs-inline-link" data-action="clear-all">hapus semua filter</button>' : 'tambahkan unit baru'}.</span></div>`)}
        <div class="bs-pagination">
          <span>Menampilkan <b>${all.length ? (f.page - 1) * size + 1 : 0}–${Math.min(f.page * size, all.length)}</b> dari <b>${fmtNum(all.length)}</b> unit</span>
          <label class="bs-inline-select"><span>Baris</span><select data-bind="settings.pageSize">${opts([10, 25, 50, 100], size)}</select></label>
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
      btn('Simulasikan perubahan di Google', 'simulate-google', { icon: 'zap' }) + btn('Unduh laporan', 'export-disc', { icon: 'download' }) + btn('Pakai Dashboard untuk semua', 'disc-push-all', { icon: 'upload', variant: 'primary', attrs: rows.length ? '' : 'disabled' })) +
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
    return head('Persetujuan Edit', navItem('approvals').desc, btn('Simulasikan edit masuk', 'simulate-edit', { icon: 'zap' })) +
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
    const prog = ui.running ? `<div class="bs-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${ui.running.total}" aria-valuenow="${ui.running.done}" aria-label="Kemajuan sinkronisasi"><span style="width:${pct(ui.running.done, ui.running.total)}%"></span></div><p class="bs-muted">Memproses ${fmtNum(ui.running.done)} dari ${fmtNum(ui.running.total)} unit…</p>` : '';
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
        table(['Waktu', 'Pengguna', 'Modul', 'Aksi', 'Sebelum → sesudah'], rows, 'Tidak ada aktivitas untuk filter ini.') + (xs.length > 200 ? `<p class="bs-muted bs-pad">Menampilkan 200 terbaru. Ekspor CSV untuk melihat semuanya.</p>` : ''));
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
    const matrix = `<div class="bs-table-wrap" tabindex="0" role="region" aria-label="Matriks izin"><table class="bs-table bs-matrix"><thead><tr><th scope="col">Izin</th>${state.roles.map((r, i) => `<th scope="col">${esc(r.name)}<small>${state.users.filter(u => u.role === r.name).length} pengguna</small>${i ? btn('', 'edit-role', { id: r.name, icon: 'edit', variant: 'icon ghost sm', title: `Ubah nama ${r.name}` }) : ''}</th>`).join('')}</tr></thead><tbody>${PERMS.map(([p, l]) => `<tr><th scope="row">${l}<small>${p}</small></th>${state.roles.map((r, i) => `<td><input type="checkbox" class="bs-check" data-role="${i}" data-perm="${p}" aria-label="${esc(r.name)}: ${l}" ${r.permissions.includes(p) ? 'checked' : ''} ${i === 0 ? 'disabled' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="bs-muted bs-pad">Administrator selalu memiliki semua izin agar workspace tidak terkunci. Pratinjau RBAC — tidak ada penegakan akses di backend.</p>`;
    return head('Pengguna & Akses', navItem('access').desc, t === 'users' ? btn('Tambah pengguna', 'add-user', { icon: 'plus', variant: 'primary' }) : btn('Tambah peran', 'add-role', { icon: 'plus', variant: 'primary' })) +
      tabs('access.tab', [['users', 'Pengguna', state.users.length], ['roles', 'Peran & izin', state.roles.length]], t) +
      (t === 'users' ? card('Pengguna', `<div class="bs-toolbar">${searchF('access.q', 'Cari pengguna', ui.access.q, 'Nama, email, atau peran…', 'bsUserQ')}</div>` + table(['Pengguna', 'Peran', 'Status', 'Aktif terakhir', '<span class="bs-sr">Aksi</span>'], userRows)) : card('Matriks izin', matrix, { sub: 'Centang untuk memberi izin. Perubahan langsung tersimpan dan tercatat di Riwayat.' }));
  }

  /* ------------------------------------------------------------------ *
   * View: Integrasi Google
   * ------------------------------------------------------------------ */
  function viewIntegrations() {
    const a = state.api, used = pct(a.quotaUsed, a.quotaLimit);
    return head('Integrasi Google', navItem('integrations').desc) +
      `<div class="bs-grid bs-grid-main">` +
      card('Google Business Profile', `<div class="bs-integration"><span class="bs-g-mark" aria-hidden="true">G</span><div><strong>${a.connected ? 'Terhubung' : 'Belum terhubung'}</strong><small>Mode simulasi — tidak ada kredensial atau koneksi jaringan yang dipakai.</small></div>${badge(a.connected ? 'Aktif' : 'Nonaktif', a.connected ? 'Terhubung' : 'Terputus')}</div>` +
        kv([['Akun GBP', esc(a.account)], ['Project', esc(a.project)], ['Uji terakhir', a.lastTest ? fmtRel(a.lastTest) : '—'], ['Lokasi terkelola', fmtNum(state.locations.filter(l => l.google).length)]]) +
        `<div class="bs-btn-row">${btn(a.connected ? 'Putuskan' : 'Hubungkan', 'api-toggle', { icon: 'plug', variant: a.connected ? '' : 'primary' })}${btn('Uji koneksi', 'api-test', { icon: 'zap' })}</div>`) +
      card('Kuota API harian', `<div class="bs-quota"><strong>${fmtNum(a.quotaUsed)}</strong><span>dari ${fmtNum(a.quotaLimit)} permintaan (${used}%)</span></div>${bar(a.quotaUsed, a.quotaLimit, `Kuota terpakai ${used}%`)}<p class="bs-muted bs-gap">Setiap pembaruan unit memakai 1 permintaan. Sinkronisasi ditolak jika kuota tidak cukup.</p>${btn('Reset kuota harian', 'api-reset', { variant: 'sm ghost' })}`) +
      `</div>` +
      card('Notifikasi & keamanan', `<label class="bs-switch-row"><span><strong>Notifikasi edit dari email GBP lain</strong><small>Masukkan usulan perubahan ke Persetujuan Edit dan beri notifikasi.</small></span><span class="bs-switch"><input type="checkbox" data-bind="api.webhook" ${a.webhook ? 'checked' : ''}><span></span></span></label>`);
  }

  /* ------------------------------------------------------------------ *
   * View: Pengaturan
   * ------------------------------------------------------------------ */
  function viewSettings() {
    const s = state.settings;
    const f = (name, label, value, type = 'number', hint = '', extra = '') => `<label class="bs-field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" required ${extra}>${hint ? `<small>${hint}</small>` : ''}</label>`;
    return head('Pengaturan', navItem('settings').desc) +
      `<form id="bsSettingsForm" class="bs-stack" novalidate>` +
      card('Workspace', `<div class="bs-form-grid">${f('workspace', 'Nama workspace', s.workspace, 'text', '', 'maxlength="80"')}<label class="bs-field"><span>Zona waktu</span><select name="timezone">${opts([['Asia/Jakarta', 'WIB — Asia/Jakarta'], ['Asia/Makassar', 'WITA — Asia/Makassar'], ['Asia/Jayapura', 'WIT — Asia/Jayapura']], s.timezone)}</select></label></div>`) +
      card('Target SLA', `<div class="bs-form-grid">${f('slaInternal', 'Proses internal (jam)', s.slaInternal, 'number', 'Waktu tim BRI memproses permintaan.', 'min="1" max="720"')}${f('slaGoogle', 'Acuan verifikasi Google (jam)', s.slaGoogle, 'number', 'Dipantau terpisah, di luar kendali BRI.', 'min="1" max="2000"')}</div>`) +
      card('Aturan deteksi', `<div class="bs-form-grid">${f('dupRadius', 'Radius duplikat (meter)', s.dupRadius, 'number', 'Unit bertipe sama dalam radius ini dianggap kemungkinan duplikat.', 'min="10" max="2000"')}${f('coordTol', 'Toleransi selisih koordinat (meter)', s.coordTol, 'number', 'Selisih titik di atas nilai ini dianggap tidak sesuai.', 'min="5" max="2000"')}</div>`) +
      `<div class="bs-form-actions"><button type="submit" class="bs-btn primary">${ic('check')}<span>Simpan pengaturan</span></button></div></form>` +
      card('Data demo & uji performa', `<div class="bs-danger-list">
        <div><span><strong>Buat 1.000 unit uji</strong><small>Uji performa dashboard dengan data besar (skenario 4). Waktu proses ditampilkan.</small></span>${btn('Buat 1.000 unit', 'generate', { icon: 'zap' })}</div>
        <div><span><strong>Cadangkan data</strong><small>Unduh seluruh data workspace sebagai JSON.</small></span>${btn('Unduh JSON', 'backup', { icon: 'download' })}</div>
        <div><span><strong>Reset data demo</strong><small>Kembalikan semua data ke kondisi awal. Tidak bisa dibatalkan.</small></span>${btn('Reset data', 'reset-data', { icon: 'trash', variant: 'danger' })}</div></div>`);
  }

  /* ------------------------------------------------------------------ *
   * Drawer detail unit
   * ------------------------------------------------------------------ */
  function openDrawer(code, tab = 'overview') {
    if (!byCode().has(code)) { toast('Unit tidak ditemukan atau sudah dihapus.', { tone: 'warn' }); return; }
    ui.drawer = { code, tab };
    renderDrawer();
    if (!sheet.open) { sheetTrigger = document.activeElement; sheet.showModal(); }
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
    } else if (t === 'history') {
      body = hist.length ? `<ol class="bs-timeline">${hist.map(a => `<li><span class="bs-avatar sm" data-actor="${a.actor}" aria-hidden="true">${a.actor === 'Eksternal' ? '@' : initials(a.user)}</span><div><p><strong>${esc(a.user)}</strong> ${esc(a.action.toLowerCase())}</p><small>${fmtDate(a.time)} · ${esc(a.module)}</small>${a.changes.length ? diffList(a.changes) : ''}${a.detail ? `<small>${esc(a.detail)}</small>` : ''}</div></li>`).join('')}</ol>` : emptyState('Belum ada riwayat', 'Perubahan pada unit ini akan tercatat di sini.', '', 'history');
    } else {
      body = syncItems.length ? table(['Job', 'Hasil', 'Penyebab'], syncItems.map(i => `<tr><td>${esc(i.run)}<small>${fmtRel(i.time)}</small></td><td>${badge(i.status)}${i.resolved && i.status === 'Gagal' ? `<small>${badge('Ditangani')}</small>` : ''}</td><td class="bs-td-wrap">${esc(i.reason)}${i.note ? `<small>${esc(i.note)}</small>` : ''}</td></tr>`)) : emptyState('Tidak ada masalah sinkronisasi', l.lastSync ? `Sinkron terakhir ${fmtRel(l.lastSync)} berhasil.` : 'Unit belum pernah disinkronkan.');
    }
    sheet.innerHTML = `<div class="bs-sheet-inner">
      <header class="bs-sheet-head"><div><p class="bs-eyebrow">${esc(l.code)} · ${esc(l.type)}</p><h2 id="bsDrawerTitle">${esc(l.name)}</h2><div class="bs-badges">${badge(l.status)}${badge(l.gbp)}${iss.length ? `<span class="bs-badge" data-tone="warn"><i></i>${iss.length} beda dengan Google</span>` : ''}</div></div>${btn('', 'sheet-close', { icon: 'x', variant: 'icon ghost', title: 'Tutup' })}</header>
      ${tabs('drawer.tab', [['overview', 'Ringkasan'], ['compare', 'Bandingkan Google', iss.length || null], ['history', 'Riwayat', hist.length], ['sync', 'Sinkronisasi']], t)}
      <div class="bs-sheet-body">${body}</div>
      <footer class="bs-sheet-foot">${btn('Hapus', 'delete-loc', { id: l.code, icon: 'trash', variant: 'danger ghost' })}<span class="bs-spacer"></span>${btn('Sinkronkan', 'sync-one', { id: l.code, icon: 'refresh', attrs: ui.running ? 'disabled' : '' })}${btn('Edit', 'edit-loc', { id: l.code, icon: 'edit', variant: 'primary' })}</footer></div>`;
  }

  /* ------------------------------------------------------------------ *
   * Modal & formulir
   * ------------------------------------------------------------------ */
  let modalSubmit = null, modalTrigger = null;
  function openModal(title, bodyHtml, { submit = 'Simpan', onSubmit = null, wide = false, desc = '', danger = false, footer = null } = {}) {
    if (!modal.open) modalTrigger = captureFocus();
    modalSubmit = onSubmit;
    modal.classList.toggle('is-wide', wide);
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
  function locationForm(code) {
    const l = code ? byCode().get(code) : null;
    openModal(l ? `Edit ${l.name}` : 'Tambah unit kerja', formGrid([
      { name: 'name', label: 'Nama unit', value: l?.name, full: true, hint: 'Contoh: KCP Bandung Dago' },
      { name: 'type', label: 'Tipe', type: 'select', options: TYPES, value: l?.type || 'KCP' },
      { name: 'status', label: 'Status operasional', type: 'select', options: STATUSES, value: l?.status || 'Belum Sync' },
      { name: 'city', label: 'Kota', value: l?.city }, { name: 'province', label: 'Provinsi', value: l?.province },
      { name: 'address', label: 'Alamat', value: l?.address, full: true },
      { name: 'phone', label: 'Telepon', value: l?.phone, attrs: '' }, { name: 'hours', label: 'Jam operasional', value: l?.hours || HOURS[0], attrs: '' },
      { name: 'lat', label: 'Latitude', type: 'number', value: l?.lat, hint: 'Contoh: -6.9175' }, { name: 'lng', label: 'Longitude', type: 'number', value: l?.lng, hint: 'Contoh: 107.6191' }
    ]), {
      wide: true, desc: l ? 'Perubahan dicatat di Riwayat beserta nilai sebelum dan sesudahnya.' : 'Unit baru berstatus “Belum Sync” sampai disinkronkan ke Google.',
      submit: l ? 'Simpan perubahan' : 'Tambah unit',
      onSubmit: p => {
        const e = validateLoc(p, l);
        if (Object.keys(e).length) return e;
        p.region = regionOf(p.province);
        if (l) {
          const changes = diff(l, p, ['name', 'type', 'status', 'city', 'province', 'address', 'phone', 'hours', 'lat', 'lng']);
          if (!changes.length) return 'Tidak ada perubahan untuk disimpan.';
          Object.assign(l, p, { updatedAt: Date.now(), updatedBy: ME.name });
          log('Unit Kerja', 'Memperbarui unit', { target: l.code, changes });
          toast(`${l.name} diperbarui (${changes.length} kolom).`, { tone: 'good', action: issuesOf(l).length ? { label: 'Sinkronkan', run: () => runSync([l.code], { label: l.name }) } : null });
        } else {
          const code2 = `DM-${String(++state.seq.loc).padStart(3, '0')}`;
          state.locations.unshift({ ...p, code: code2, status: p.status || 'Belum Sync', gbp: 'Belum Diklaim', google: null, updatedAt: Date.now(), updatedBy: ME.name, lastSync: null });
          log('Unit Kerja', 'Menambahkan unit', { target: code2, detail: p.name });
          toast(`${p.name} ditambahkan.`, { tone: 'good', action: { label: 'Lihat', run: () => openDrawer(code2) } });
        }
      }
    });
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
    ok.forEach(({ p, existing }) => {
      p.region = regionOf(p.province);
      const clean = { name: p.name, type: p.type, city: p.city, province: p.province, region: p.region, address: p.address, phone: p.phone, hours: p.hours || HOURS[0], lat: p.lat, lng: p.lng, status: p.status };
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
    ['Tambah unit kerja', 'plus', () => locationForm()], ['Impor data CSV', 'upload', () => { importDraft = null; importModal(); }],
    ['Sinkronkan semua unit', 'refresh', () => runSync(null)], ['Usulkan titik baru', 'pin', () => pointForm()],
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
    const nav = NAV_ITEMS.filter(n => !q || n.label.toLowerCase().includes(q)).map(n => ({ group: 'Menu', icon: n.icon, label: n.label, sub: '', run: () => navigate(n.id) }));
    const acts = PAL_ACTIONS.filter(a => !q || a[0].toLowerCase().includes(q)).map(([label, icon, run]) => ({ group: 'Aksi', icon, label, sub: '', run }));
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
   * Render
   * ------------------------------------------------------------------ */
  let renderedView = null;
  const VIEWS = { dashboard: viewDashboard, map: viewMap, locations: viewLocations, discrepancies: viewDiscrepancies, duplicates: viewDuplicates, claims: viewClaims, approvals: viewApprovals, sync: viewSync, audit: viewAudit, sla: viewSla, access: viewAccess, integrations: viewIntegrations, settings: viewSettings };
  function renderNav() {
    $('bsNav').innerHTML = NAV.map(g => `<p class="bs-nav-label">${g.group}</p>${g.items.map(n => { const c = n.count ? n.count() : 0; return `<button type="button" data-view="${n.id}" ${ui.view === n.id ? 'aria-current="page"' : ''} title="${esc(n.label)}">${ic(n.icon)}<span class="bs-nav-text">${n.label}</span>${c ? `<span class="bs-nav-count" aria-label="${c} perlu perhatian">${c > 99 ? '99+' : c}</span>` : ''}</button>`; }).join('')}`).join('');
  }
  function updateChrome() {
    const last = state.runs[0];
    $('bsSyncPill').innerHTML = ui.running
      ? `<span class="bs-pulse"></span>Menyinkronkan ${pct(ui.running.done, ui.running.total)}%`
      : `<span class="bs-dot" data-tone="${openFailures().length ? 'warn' : 'good'}"></span>Sinkron terakhir ${last ? fmtRel(last.time) : '—'}`;
    const n = notifications().length;
    $('bsNotifCount').textContent = n || '';
    $('bsNotifBtn').setAttribute('aria-label', n ? `Notifikasi, ${n} baru` : 'Notifikasi');
    $('bsThemeBtn').innerHTML = ic(shell.dataset.theme === 'dark' ? 'sun' : 'moon');
    $('bsThemeBtn').title = shell.dataset.theme === 'dark' ? 'Mode terang' : 'Mode gelap';
    $('bsFooterInfo').textContent = `${fmtNum(state.locations.length)} unit · render ${ui.renderMs} ms`;
    const prog = shell.querySelector('.bs-progress');
    if (prog && ui.running) { prog.firstElementChild.style.width = pct(ui.running.done, ui.running.total) + '%'; prog.setAttribute('aria-valuenow', ui.running.done); }
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
    if (ui.view === 'map' && renderedView === 'map' && $('bsMap')) {
      updateMap(false);
    } else {
      if (mapObj && ui.view !== 'map') { mapObj.remove(); mapObj = null; }
      $('bsPage').innerHTML = VIEWS[ui.view]();
      renderedView = ui.view;
      if (ui.view === 'map') mountMap();
    }
    if (sheet.open) renderDrawer();
    restoreFocus(f);
    ui.renderMs = Math.max(1, Math.round(performance.now() - t0));
    updateChrome();
  }
  function navigate(view, { focus = true } = {}) {
    if (!VIEWS[view]) return;
    if (view !== ui.view) renderedView = null;
    ui.view = view; ui.filterOpen = false;
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
  function resolveDisc(key, useDashboard) {
    const [code, f] = key.split('|'), l = byCode().get(code);
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
    touch(); render();
    toast(`${c.id} → ${next}.`, { tone: next === 'Selesai' ? 'good' : 'info' });
  }
  function claimForm(code = '') {
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
        ui.claims.tab = 'active';
        toast(`${id} diajukan.`, { tone: 'good', action: ui.view !== 'claims' ? { label: 'Lihat', run: () => navigate('claims') } : null });
      }
    });
  }
  function pointForm() {
    openModal('Usulkan titik lokasi baru', formGrid([
      { name: 'name', label: 'Nama unit', full: true }, { name: 'type', label: 'Tipe', type: 'select', options: TYPES, value: 'KCP' },
      { name: 'phone', label: 'Telepon', attrs: '' }, { name: 'city', label: 'Kota' }, { name: 'province', label: 'Provinsi' },
      { name: 'address', label: 'Alamat', full: true }, { name: 'hours', label: 'Jam operasional', value: HOURS[0], attrs: '', full: true },
      { name: 'lat', label: 'Latitude', type: 'number' }, { name: 'lng', label: 'Longitude', type: 'number' },
      { name: 'force', label: 'Tetap ajukan meskipun ada unit berdekatan', type: 'checkbox', full: true }
    ]), {
      wide: true, submit: 'Ajukan titik baru', desc: 'Sistem memeriksa kemungkinan duplikat sebelum pengajuan dikirim ke Google.',
      onSubmit: p => {
        const e = validateLoc(p, null);
        if (Object.keys(e).length) return e;
        const near = state.locations.map(l => [l, distM(l, p)]).filter(([, d]) => d <= Math.max(state.settings.dupRadius, 200)).sort((a, b) => a[1] - b[1])[0];
        if (near && !p.force) return { lat: `Ada ${near[0].name} berjarak ${fmtDist(near[1])} — kemungkinan duplikat. Centang “Tetap ajukan” bila yakin.` };
        const id = `KL-${String(++state.seq.claim).padStart(3, '0')}`;
        const proposal = { name: p.name, type: p.type, city: p.city, province: p.province, address: p.address, phone: p.phone, hours: p.hours || HOURS[0], lat: p.lat, lng: p.lng };
        state.claims.unshift({ id, kind: 'Titik baru', proposal, submittedAt: Date.now(), processedAt: null, doneAt: null, status: 'Diajukan', note: near ? `Dekat ${near[0].name} (${fmtDist(near[1])})` : '' });
        log('Klaim & Titik Baru', 'Mengajukan titik baru', { target: id, detail: p.name });
        ui.claims.tab = 'active';
        toast(`${id} diajukan untuk ${p.name}.`, { tone: 'good', action: ui.view !== 'claims' ? { label: 'Lihat', run: () => navigate('claims') } : null });
      }
    });
  }
  function userForm(id) {
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
        if (u) { const ch = diff(u, p, ['name', 'email', 'role', 'status']); Object.assign(u, p); log('Pengguna & Akses', 'Memperbarui pengguna', { detail: p.name, changes: ch }); }
        else { state.users.push({ ...p, id: ++state.seq.user, lastActive: Date.now() }); log('Pengguna & Akses', 'Menambahkan pengguna', { detail: `${p.name} (${p.role})` }); }
        toast('Pengguna disimpan.', { tone: 'good' });
      }
    });
  }
  function roleForm(name) {
    const r = state.roles.find(x => x.name === name);
    openModal(r ? `Ubah peran ${r.name}` : 'Tambah peran', formGrid([{ name: 'name', label: 'Nama peran', value: r?.name, full: true }]) + (r ? '' : `<fieldset class="bs-fieldset"><legend>Izin awal</legend>${PERMS.map(([p, l]) => `<label class="bs-checkline"><input type="checkbox" name="perm" value="${p}" ${p.endsWith('.read') ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>`), {
      submit: 'Simpan',
      onSubmit: (p, fd) => {
        const n = String(p.name || '').trim();
        if (!n) return { name: 'Wajib diisi.' };
        if (state.roles.some(x => x !== r && x.name.toLowerCase() === n.toLowerCase())) return { name: 'Nama peran sudah ada.' };
        if (r) { state.users.filter(u => u.role === r.name).forEach(u => { u.role = n; }); log('Pengguna & Akses', 'Mengubah nama peran', { changes: [{ field: 'Peran', before: r.name, after: n }] }); r.name = n; }
        else { state.roles.push({ name: n, permissions: fd.getAll('perm') }); log('Pengguna & Akses', 'Menambahkan peran', { detail: n }); }
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
    if (a === 'settings') { state.settings[b] = Number(value) || value; ui.loc.page = 1; touch(); return; }
    if (a === 'api') { state.api[b] = value; log('Integrasi Google', `${value ? 'Mengaktifkan' : 'Menonaktifkan'} notifikasi edit eksternal`); touch(); toast(value ? 'Notifikasi edit eksternal aktif.' : 'Notifikasi edit eksternal nonaktif.'); return; }
    ui[a][b] = value;
    if (a === 'loc') ui.loc.page = 1;
  }
  function act(action, id, el) {
    const l = id ? byCode().get(id) : null;
    switch (action) {
      case 'nav': navigate(id); break;
      case 'collapse': prefs.collapsed = !prefs.collapsed; savePrefs(); applyLayout(); break;
      case 'nav-open': if (mobile.matches) { ui.navOpen = true; applyLayout(); $('bsNav').querySelector('button')?.focus(); } else { prefs.collapsed = !prefs.collapsed; savePrefs(); applyLayout(); } break;
      case 'nav-close': closeNav(); shell.querySelector('.bs-menu').focus(); break;
      case 'palette': openPalette(); break;
      case 'theme': toggleTheme(); break;
      case 'shortcuts': shortcutsModal(); break;
      case 'notif': toggleNotif(); break;
      case 'logout': logout(); break;
      case 'tab': { const [path, v] = id.split(':'); const [a, b] = path.split('.'); ui[a][b] = v; if (a === 'drawer') renderDrawer(); else render(); break; }
      case 'modal-close': closeModal(); break;
      case 'sheet-close': sheet.close(); break;
      case 'toast-act': { const run = toastActions.get(Number(id)); dismissToast(id); run && run(); break; }
      case 'toast-close': dismissToast(id); break;
      // Unit kerja
      case 'open-loc': openDrawer(id, el.dataset.tab || 'overview'); break;
      case 'open-target': if (byCode().has(id)) openDrawer(id); else if (id.startsWith('KL-')) navigate('claims'); else if (id.startsWith('JOB-')) { ui.sync.tab = 'runs'; navigate('sync'); } break;
      case 'add-loc': locationForm(); break;
      case 'edit-loc': locationForm(id); break;
      case 'delete-loc': if (l) { const snap = snapshot(); state.locations = state.locations.filter(x => x !== l); ui.loc.selected.delete(id); log('Unit Kerja', 'Menghapus unit', { target: id, detail: l.name }); touch(); sheet.open && sheet.close(); render(); toast(`${l.name} dihapus.`, { undo: snap }); } break;
      case 'sort': ui.loc.dir = ui.loc.sort === id ? -ui.loc.dir : 1; ui.loc.sort = id; render(); break;
      case 'quick': ui.loc.quick = id; ui.loc.page = 1; render(); break;
      case 'page': ui.loc.page = Number(id); render(); $('bsMain').querySelector('.bs-table-wrap')?.scrollIntoView({ block: 'nearest' }); break;
      case 'unfilter': { const [k, v] = id.split(/:(.*)/s); ui.loc[k] = ui.loc[k].filter(x => x !== v); ui.loc.page = 1; render(); break; }
      case 'clear-filters': FILTERS.forEach(([k]) => { ui.loc[k] = []; }); ui.loc.page = 1; render(); break;
      case 'clear-all': FILTERS.forEach(([k]) => { ui.loc[k] = []; }); ui.loc.q = ''; ui.loc.quick = 'all'; ui.loc.page = 1; render(); break;
      case 'close-filter': ui.filterOpen = false; render(); break;
      case 'goto-filter': { const [k, v] = id.split(/:(.*)/s); FILTERS.forEach(([f]) => { ui.loc[f] = []; }); ui.loc.q = ''; ui.loc.quick = 'all'; ui.loc[k] = [v]; navigate('locations'); break; }
      case 'select': ui.loc.selected[el.checked ? 'add' : 'delete'](id); render(); break;
      case 'select-page': { const size = Number(state.settings.pageSize) || 10, rows = locFiltered().slice((ui.loc.page - 1) * size, ui.loc.page * size); rows.forEach(r => ui.loc.selected[el.checked ? 'add' : 'delete'](r.code)); render(); break; }
      case 'select-all': locFiltered().forEach(r => ui.loc.selected.add(r.code)); render(); break;
      case 'clear-selection': ui.loc.selected.clear(); render(); break;
      case 'bulk-sync': runSync([...ui.loc.selected], { label: `${ui.loc.selected.size} unit terpilih` }); break;
      case 'bulk-export': exportLocations(state.locations.filter(x => ui.loc.selected.has(x.code)), 'branchsync-unit-terpilih.csv'); break;
      case 'bulk-delete': { const n = ui.loc.selected.size; confirmModal(`Hapus ${n} unit?`, `${n} unit kerja terpilih akan dihapus dari Dashboard. Anda bisa mengurungkannya dari notifikasi.`, `Hapus ${n} unit`, () => { const snap = snapshot(); state.locations = state.locations.filter(x => !ui.loc.selected.has(x.code)); log('Unit Kerja', 'Menghapus unit massal', { detail: `${n} unit` }); ui.loc.selected.clear(); touch(); toast(`${n} unit dihapus.`, { undo: snap }); }); break; }
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
      case 'resolve': { const f = openFailures().find(x => x.code === id); if (f) noteModal('Catat tindak lanjut', `Tindak lanjut untuk ${locName(id)} — ${f.reason}`, t => { f.ref.resolved = true; f.ref.note = `${t} — ${ME.name}`; log('Sync Monitor', 'Mencatat tindak lanjut kegagalan', { target: id, detail: t }); toast('Kegagalan ditandai sudah ditangani.', { tone: 'good' }); }); break; }
      // Ketidaksesuaian
      case 'disc-push': case 'disc-pull': { const snap = snapshot(); resolveDisc(id, action === 'disc-push'); touch(); render(); toast(action === 'disc-push' ? 'Data Dashboard dikirim ke Google (simulasi).' : 'Data Google diterapkan ke Dashboard.', { tone: 'good', undo: snap }); break; }
      case 'disc-push-all': { const rows = discRows(); confirmModal('Pakai data Dashboard untuk semua?', `${rows.length} perbedaan yang tampil akan diselesaikan dengan mengirim data Dashboard ke Google.`, `Kirim ${rows.length} perubahan`, () => { const snap = snapshot(); rows.forEach(r => resolveDisc(`${r.l.code}|${r.field}`, true)); toast(`${rows.length} perbedaan diselesaikan.`, { tone: 'good', undo: snap }); }, false); break; }
      case 'disc-note': noteModal('Catat temuan ketidaksesuaian', 'Catatan / dokumentasi', t => { state.discNotes[id] = { text: t, by: ME.name, time: Date.now() }; log('Ketidaksesuaian', 'Mendokumentasikan temuan', { target: id.split('|')[0], detail: `${FIELD_LABEL[id.split('|')[1]]}: ${t}` }); toast('Catatan disimpan.', { tone: 'good' }); }, state.discNotes[id]?.text || ''); break;
      case 'export-disc': { const rows = discRows(); downloadCSV('laporan-ketidaksesuaian.csv', [['Kode', 'Unit', 'Kota', 'Kolom', 'Dashboard', 'Google Maps', 'Selisih (m)', 'Catatan'], ...rows.map(r => [r.l.code, r.l.name, r.l.city, FIELD_LABEL[r.field], r.dash, r.google, r.dist ? Math.round(r.dist) : '', state.discNotes[`${r.l.code}|${r.field}`]?.text || ''])]); toast(`Laporan ${rows.length} perbedaan diunduh.`, { tone: 'good' }); break; }
      case 'simulate-google': simulateGoogleChange(); break;
      // Duplikat
      case 'dup-keep': {
        const parts = id.split('|'), side = parts.pop(), p = duplicatePairs().find(x => x.key === parts.join('|'));
        if (!p) break;
        const keep = side === 'a' ? p.a : p.b, drop = side === 'a' ? p.b : p.a, snap = snapshot();
        log('Duplikat', 'Menggabungkan titik ganda', { target: drop.code, detail: `Dipertahankan: ${keep.name}`, changes: diff(drop, { ...drop, status: 'Tidak Aktif', gbp: 'Duplikat' }, ['status', 'gbp']) });
        Object.assign(drop, { status: 'Tidak Aktif', gbp: 'Duplikat', updatedAt: Date.now(), updatedBy: ME.name });
        touch(); render(); toast(`${drop.name} ditandai duplikat dari ${keep.name}.`, { tone: 'good', undo: snap }); break;
      }
      case 'dup-ignore': state.dupIgnored.push(id); log('Duplikat', 'Menandai bukan duplikat', { detail: id.replace('|', ' & ') }); touch(); render(); toast('Pasangan ditandai bukan duplikat.'); break;
      case 'dup-report': { const [a, b] = id.split('|'); claimForm(byCode().get(b)?.gbp === 'Terverifikasi' ? a : b); setTimeout(() => { const s = modal.querySelector('[name=kind]'); if (s) s.value = 'Laporan duplikat'; }, 0); break; }
      // Klaim
      case 'claim-new': claimForm(); break;
      case 'point-new': pointForm(); break;
      case 'claim-next': advanceClaim(id); break;
      case 'claim-reject': noteModal('Tolak permintaan', 'Alasan penolakan', t => { const c = state.claims.find(x => x.id === id); c.status = 'Ditolak'; c.note = t; c.doneAt = Date.now(); log('Klaim & Titik Baru', `Menolak ${c.id}`, { target: c.code || c.id, detail: t }); toast(`${c.id} ditolak.`); }); break;
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
      case 'toggle-user': { const u = state.users.find(x => x.id === Number(id)); if (!u || u.id === 1) break; u.status = u.status === 'Aktif' ? 'Nonaktif' : 'Aktif'; log('Pengguna & Akses', `${u.status === 'Aktif' ? 'Mengaktifkan' : 'Menonaktifkan'} pengguna`, { detail: u.name }); touch(); render(); toast(`${u.name} ${u.status.toLowerCase()}.`); break; }
      case 'add-role': roleForm(); break;
      case 'edit-role': roleForm(id); break;
      // Integrasi
      case 'api-toggle': state.api.connected = !state.api.connected; log('Integrasi Google', state.api.connected ? 'Menghubungkan GBP' : 'Memutuskan GBP'); touch(); render(); toast(state.api.connected ? 'Terhubung (simulasi).' : 'Koneksi diputus (simulasi).'); break;
      case 'api-test': state.api.lastTest = Date.now(); log('Integrasi Google', 'Menguji koneksi', { detail: state.api.connected ? 'Berhasil' : 'Gagal: belum terhubung' }); touch(); render(); toast(state.api.connected ? 'Uji koneksi berhasil — 120 ms (simulasi).' : 'Uji gagal: hubungkan akun terlebih dahulu.', { tone: state.api.connected ? 'good' : 'bad' }); break;
      case 'api-reset': state.api.quotaUsed = 0; log('Integrasi Google', 'Mereset kuota harian'); touch(); render(); toast('Kuota direset.'); break;
      // Pengaturan
      case 'generate': confirmModal('Buat 1.000 unit uji?', 'Seribu unit kerja sintetis akan ditambahkan untuk menguji performa. Anda bisa menghapusnya lewat “Reset data demo”.', 'Buat 1.000 unit', () => setTimeout(() => generateUnits(1000), 0), false); break;
      case 'backup': download(`branchsync-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Cadangan diunduh.', { tone: 'good' }); break;
      case 'reset-data': confirmModal('Reset data demo?', 'Semua perubahan, impor, dan riwayat akan dikembalikan ke kondisi awal. Tindakan ini tidak bisa dibatalkan.', 'Reset data', () => { state = buildSeed(); ui.loc.selected.clear(); touch(); toast('Data demo dikembalikan ke kondisi awal.'); }); break;
    }
  }

  shell.addEventListener('click', e => {
    const t = e.target;
    if (t === modal) { closeModal(); return; }
    if (t === sheet) { sheet.close(); return; }
    // Tutup popover saat klik di luar
    if (!$('bsNotif').hidden && !t.closest('.bs-pop-wrap')) toggleNotif(false);
    if (ui.filterOpen && !t.closest('[data-filter-pop]')) { ui.filterOpen = false; shell.querySelector('[data-filter-pop]')?.removeAttribute('open'); }
    const v = t.closest('[data-view]');
    if (v && !v.disabled) { if (!$('bsNotif').hidden) toggleNotif(false); if (sheet.open) sheet.close(); closeModal(); navigate(v.dataset.view); return; }
    const a = t.closest('[data-action]');
    if (!a || a.disabled) return;
    if (a.tagName === 'INPUT' && !['select', 'select-page'].includes(a.dataset.action)) return;
    act(a.dataset.action, a.dataset.id || '', a);
  });
  shell.addEventListener('toggle', e => { if (e.target.matches?.('[data-filter-pop]')) ui.filterOpen = e.target.open; }, true);
  let inputTimer = 0;
  shell.addEventListener('input', e => {
    const t = e.target, bind = t.dataset.bind;
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
    if (t.dataset.actionChange === 'bulk-status' && t.value) {
      const status = t.value, n = ui.loc.selected.size, snap = snapshot();
      state.locations.forEach(l => { if (ui.loc.selected.has(l.code) && l.status !== status) { log('Unit Kerja', 'Mengubah status (massal)', { target: l.code, changes: [{ field: 'Status', before: l.status, after: status }] }); l.status = status; l.updatedAt = Date.now(); l.updatedBy = ME.name; } });
      touch(); render(); toast(`Status ${n} unit diubah menjadi ${status}.`, { tone: 'good', undo: snap });
      return;
    }
    if (t.dataset.filter) {
      const k = t.dataset.filter;
      ui.loc[k] = t.checked ? [...new Set([...ui.loc[k], t.value])] : ui.loc[k].filter(x => x !== t.value);
      ui.loc.page = 1; ui.filterOpen = true; render();
      return;
    }
    if (t.dataset.perm) {
      const r = state.roles[Number(t.dataset.role)], p = t.dataset.perm;
      r.permissions = t.checked ? [...new Set([...r.permissions, p])] : r.permissions.filter(x => x !== p);
      log('Pengguna & Akses', `${t.checked ? 'Memberi' : 'Mencabut'} izin`, { detail: `${r.name}: ${p}` });
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
      const res = modalSubmit(p, fd);
      if (res && (typeof res === 'string' || Object.keys(res).length)) { showErrors(res); return; }
      modalSubmit = null; closeModal(); touch(); render();
      return;
    }
    if (form.id === 'bsSettingsForm') {
      const p = Object.fromEntries(new FormData(form)), s = state.settings, errs = [];
      const num = (k, min, max, label) => { const v = Number(p[k]); if (!Number.isFinite(v) || v < min || v > max) errs.push(`${label} harus ${min}–${max}.`); return v; };
      const next = { workspace: String(p.workspace || '').trim(), timezone: p.timezone, slaInternal: num('slaInternal', 1, 720, 'SLA internal'), slaGoogle: num('slaGoogle', 1, 2000, 'Acuan Google'), dupRadius: num('dupRadius', 10, 2000, 'Radius duplikat'), coordTol: num('coordTol', 5, 2000, 'Toleransi koordinat') };
      if (!next.workspace) errs.push('Nama workspace wajib diisi.');
      if (errs.length) { toast(errs.join(' '), { tone: 'bad' }); return; }
      const changes = diff(s, next, Object.keys(next));
      Object.assign(s, next);
      if (changes.length) log('Pengaturan', 'Mengubah pengaturan', { changes });
      touch(); render(); toast(changes.length ? `Pengaturan disimpan (${changes.length} perubahan).` : 'Tidak ada perubahan.', { tone: 'good' });
    }
  });
  modal.addEventListener('close', () => {
    modalSubmit = null;
    const t = modalTrigger; modalTrigger = null;
    if (t && (!t.scope || $(t.scope)?.open)) restoreFocus(t);
    if (!shell.contains(document.activeElement) || document.activeElement === document.body) (sheet.open ? sheet.querySelector('.bs-sheet-head button') : $('bsTitle'))?.focus({ preventScroll: true });
  });
  sheet.addEventListener('close', () => {
    ui.drawer = null;
    const t = sheetTrigger; sheetTrigger = null;
    if (t && t.isConnected) t.focus({ preventScroll: true }); else $('bsTitle')?.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', e => {
    if (shell.hidden) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (palette.open) palette.close(); else if (!modal.open) openPalette(); return; }
    if (e.key === 'Escape') {
      if (!$('bsNotif').hidden) { toggleNotif(false); $('bsNotifBtn').focus(); return; }
      if (ui.filterOpen) { ui.filterOpen = false; render(); return; }
      if (ui.navOpen) { closeNav(); shell.querySelector('.bs-menu').focus(); return; }
    }
    if (typing || modal.open || palette.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { const s = shell.querySelector('#bsPage [data-search]'); if (s) { e.preventDefault(); s.focus(); s.select(); } }
    else if (e.key === '?') { e.preventDefault(); shortcutsModal(); }
    else if (e.key.toLowerCase() === 'n' && !sheet.open) { e.preventDefault(); locationForm(); }
  });
  setInterval(() => { if (!shell.hidden && !ui.running) updateChrome(); }, 30000);

  /* ------------------------------------------------------------------ *
   * Masuk / keluar
   * ------------------------------------------------------------------ */
  function logout() {
    if (sheet.open) sheet.close();
    closeModal();
    if (mapObj) { mapObj.remove(); mapObj = null; renderedView = null; }
    shell.hidden = true;
    document.querySelector('.page-container').hidden = false;
    document.body.classList.remove('admin-active');
    document.documentElement.lang = typeof language !== 'undefined' ? language : 'id';
    document.querySelector('.header-actions [data-login]')?.focus();
    window.dispatchEvent(new Event('resize'));
  }
  window.BranchAdmin = {
    enter() {
      try { loginTrigger = null; } catch (_) {}
      try { dialog.close(); } catch (_) {}
      document.querySelector('.page-container').hidden = true;
      shell.hidden = false;
      document.body.classList.add('admin-active');
      document.documentElement.lang = 'id';
      shell.dataset.theme = prefs.theme || (document.body.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      log('Dashboard', 'Masuk ke workspace', { detail: 'Sesi demo' });
      touch();
      applyLayout();
      navigate('dashboard');
      toast(`Selamat datang! Tekan ${MOD} K untuk mencari apa saja.`);
    }
  };
})();
