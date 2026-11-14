'use strict';
/*
 * BranchSync Admin — Inti: utilitas, ikon, konstanta, data awal, penyimpanan, data turunan, audit, Mode Live.
 * Modul core.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('core', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let activateLive, announce, liveConnectModal, navigate, render, toast, updateChrome;
  app.imports(() => ({ activateLive, announce, liveConnectModal, navigate, render, toast, updateChrome } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ rng, distM, offset, fmtDur, fmtRel, fmtStamp, download, downloadCSV, parseCSV, userFromSession, ensureExtras, buildSeed, legacyLoad,
    loadState, setSave, guard, issuesOf, claimTimes, dailySync, notifications, log, blankState, loadLive, remote, sessionExpired, switchToDemo,
    switchToLive, runSync });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

const shell = document.getElementById('adminPanel');
  app.export({ shell });
  // (Penjaga #adminPanel dipindah ke admin/app.js: modul tidak dijalankan bila elemen tidak ada.)

  /* ------------------------------------------------------------------ *
   * Utilitas
   * ------------------------------------------------------------------ */
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  app.export({ MIN, HOUR, DAY });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  app.export({ esc });
  // Bahasa dibagi dengan halaman utama (variabel global `language` di script.js).
  const isEn = () => typeof language !== 'undefined' && language === 'en';
  app.export({ isEn });
  const LOC = () => (isEn() ? 'en-GB' : 'id-ID');
  app.export({ LOC });
  const fmtNum = n => new Intl.NumberFormat(LOC()).format(n);
  app.export({ fmtNum });
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  app.export({ pct });
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  app.export({ sum });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
  app.export({ MOD });
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
  app.export({ pick });
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
  app.export({ fmtDist });
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
  const fmtDate = (t, opts = { dateStyle: 'medium', timeStyle: 'short' }) => new Intl.DateTimeFormat(LOC(), { timeZone: app.state.settings.timezone, ...opts }).format(new Date(t));
  app.export({ fmtDate });
  function fmtRel(t) {
    const d = Date.now() - t;
    const en = isEn();
    if (d < MIN) return en ? 'just now' : 'baru saja';
    if (d < HOUR) return en ? `${Math.floor(d / MIN)} min ago` : `${Math.floor(d / MIN)} mnt lalu`;
    if (d < DAY) return en ? `${Math.floor(d / HOUR)} h ago` : `${Math.floor(d / HOUR)} jam lalu`;
    if (d < 7 * DAY) { const n = Math.floor(d / DAY); return en ? `${n} day${n === 1 ? '' : 's'} ago` : `${n} hari lalu`; }
    return fmtDate(t, { dateStyle: 'medium' });
  }
  /* Pola tanggal baku (Tahap 4):
   *  - daftar/tabel  → relatif + tooltip absolut: when(t)
   *  - kolom “Waktu” → relatif + baris kecil absolut: whenCell(t)
   *  - detail        → absolut (+ relatif bila < 7 hari): whenFull(t)
   *  - ekspor        → absolut “YYYY-MM-DD HH:mm” zona waktu pengaturan: fmtStamp(t) */
  const isoOf = t => new Date(t).toISOString();
  const when = t => (t ? `<time datetime="${isoOf(t)}" title="${esc(fmtDate(t))}">${esc(fmtRel(t))}</time>` : '—');
  app.export({ when });
  const whenCell = t => (t ? `${when(t)}<small>${esc(fmtDate(t, { dateStyle: 'short', timeStyle: 'short' }))}</small>` : '—');
  app.export({ whenCell });
  const whenFull = t => (t ? `<time datetime="${isoOf(t)}">${esc(fmtDate(t))}</time>${Date.now() - t < 7 * DAY ? ` <span class="bs-rel">(${esc(fmtRel(t))})</span>` : ''}` : '—');
  app.export({ whenFull });
  function fmtStamp(t, dateOnly = false) {
    if (!t) return '';
    const P = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: app.state.settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return `${P.year}-${P.month}-${P.day}${dateOnly ? '' : ` ${P.hour}:${P.minute}`}`;
  }
  const normName = s => String(s || '').toLowerCase()
    .replace(/\b(bank|bri|rakyat|indonesia|kantor|cabang|pembantu|unit|kc|kcp|atm)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const initials = s => String(s).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  app.export({ initials });
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
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
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
    arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    wifiOff: '<path d="m2 2 20 20M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.7M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.8M16.9 10.6a10 10 0 0 1 2.1 2.3M12 20h.01"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>'
  };
  const ic = (n, cls = '') => `<svg class="bs-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n] || ''}</svg>`;
  app.export({ ic });

  /* ------------------------------------------------------------------ *
   * Konstanta domain
   * ------------------------------------------------------------------ */
  const STATUSES = ['Online', 'Offline', 'Belum Sync', 'Tidak Aktif'];
  app.export({ STATUSES });
  const TYPES = ['Kantor Cabang', 'KCP', 'Unit', 'ATM'];
  app.export({ TYPES });
  const GBP = ['Terverifikasi', 'Menunggu Verifikasi', 'Belum Diklaim', 'Suspend', 'Duplikat'];
  app.export({ GBP });
  const REGIONS = ['Jawa', 'Sumatera', 'Kalimantan', 'Sulawesi', 'Bali & Nusa Tenggara', 'Maluku', 'Papua'];
  app.export({ REGIONS });
  const regionOf = p => /Jakarta|Jawa|Banten|Yogyakarta/.test(p) ? 'Jawa' : /Sumatera|Aceh|Riau|Jambi|Bengkulu|Lampung|Bangka/.test(p) ? 'Sumatera' : /Kalimantan/.test(p) ? 'Kalimantan' : /Sulawesi|Gorontalo/.test(p) ? 'Sulawesi' : /Bali|Nusa/.test(p) ? 'Bali & Nusa Tenggara' : /Maluku/.test(p) ? 'Maluku' : 'Papua';
  app.export({ regionOf });
  const TONE = {
    Online: 'good', Offline: 'warn', 'Belum Sync': 'info', 'Tidak Aktif': 'neutral',
    Terverifikasi: 'good', 'Menunggu Verifikasi': 'info', 'Belum Diklaim': 'neutral', Suspend: 'bad', Duplikat: 'warn',
    Berhasil: 'good', Gagal: 'bad', Dilewati: 'neutral', Aktif: 'good', Nonaktif: 'neutral',
    Menunggu: 'warn', Disetujui: 'good', Ditolak: 'bad', Selesai: 'good',
    Diajukan: 'info', 'Diproses internal': 'info', 'Menunggu verifikasi Google': 'warn',
    'Dalam SLA': 'good', 'Lewat SLA': 'bad', 'Mendekati batas': 'warn', Internal: 'neutral', Eksternal: 'warn', Ditangani: 'good'
  };
  app.export({ TONE });
  // Label tampilan seragam (huruf kapital hanya di awal). Nilai data/API tetap memakai bentuk aslinya.
  const STATUS_LABEL = { 'Belum Sync': 'Belum sinkron', 'Tidak Aktif': 'Tidak aktif', 'Belum Diklaim': 'Belum diklaim', 'Menunggu Verifikasi': 'Menunggu verifikasi' };
  const SL = s => STATUS_LABEL[s] || s;
  app.export({ SL });
  const labelled = xs => xs.map(x => [x, SL(x)]);
  app.export({ labelled });
  const badge = (s, label = SL(s)) => `<span class="bs-badge" data-tone="${TONE[s] || 'neutral'}"><i aria-hidden="true"></i>${esc(label)}</span>`;
  app.export({ badge });
  const FIELD_LABEL = { name: 'Nama listing', phone: 'Telepon', hours: 'Jam operasional', address: 'Alamat', coords: 'Titik koordinat', type: 'Tipe', status: 'Status', gbp: 'Status GBP', city: 'Kota', province: 'Provinsi', lat: 'Latitude', lng: 'Longitude' };
  app.export({ FIELD_LABEL });
  const MARKER = { Online: '#1f8a5b', Offline: '#e0660f', 'Belum Sync': '#1a6fc4', 'Tidak Aktif': '#8a97a8' };
  app.export({ MARKER });
  const STEPS = ['Diajukan', 'Diproses internal', 'Menunggu verifikasi Google', 'Selesai'];
  app.export({ STEPS });
  const CLAIM_KINDS = ['Klaim kepemilikan', 'Banding suspend', 'Laporan duplikat'];
  app.export({ CLAIM_KINDS });
  const PERMS = [
    ['locations.read', 'Lihat unit kerja'], ['locations.write', 'Ubah unit kerja'], ['locations.import', 'Impor data massal'],
    ['sync.run', 'Jalankan sinkronisasi'], ['claims.manage', 'Kelola klaim & titik baru'], ['approvals.decide', 'Putuskan edit eksternal'],
    ['reviews.reply', 'Balas ulasan'], ['audit.read', 'Lihat riwayat'], ['users.manage', 'Kelola pengguna'], ['settings.write', 'Ubah pengaturan']
  ];
  app.export({ PERMS });
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
  app.export({ ACTION_PERM });
  const DEMO_USER = { name: 'Admin Demo', email: 'admin@example.test', role: 'Administrator' };
  app.ME = DEMO_USER;
  const demoUser = () => ({ ...DEMO_USER, role: (typeof prefs !== 'undefined' && prefs.demoRole) || 'Administrator' });
  app.export({ demoUser });
  const MODE = window.BranchMode;
  app.export({ MODE });
  const isLive = () => !!(MODE && MODE.isLive());
  app.export({ isLive });
  function userFromSession() {
    const u = (MODE && MODE.getUser()) || {};
    return { name: u.name || u.username || u.email || 'Pengguna', email: u.email || '', role: u.role || 'Pengguna', permissions: Array.isArray(u.permissions) ? u.permissions : null };
  }
  const STORE_KEY = 'branchSync.admin.v2', PREF_KEY = 'branchSync.admin.prefs';
  app.export({ STORE_KEY });
  const STREETS = ['Sudirman', 'Ahmad Yani', 'Diponegoro', 'Gatot Subroto', 'Merdeka', 'Veteran', 'Pahlawan', 'Pemuda', 'Imam Bonjol', 'Gajah Mada'];
  app.export({ STREETS });
  const HOURS = ['Sen–Jum 08.00–15.00', 'Sen–Jum 08.00–16.00', 'Sen–Sab 08.00–14.00', 'Setiap hari 24 jam'];
  app.export({ HOURS });
  const EXT_EMAILS = ['pengguna.lain@gmail.com', 'local.guide.88@gmail.com', 'agency.seo@outlook.com', 'tidak.dikenal@yahoo.com'];
  app.export({ EXT_EMAILS });
  // Akun Google Business Profile (satu akun dapat mengelola banyak lokasi)
  const ACCOUNT_LIST = [
    { id: 'gbp-jawa', name: 'BRI Regional Jawa & Bali', email: 'gbp.jawa@example.test', accountId: 'accounts/1043920001' },
    { id: 'gbp-sumatera', name: 'BRI Regional Sumatera', email: 'gbp.sumatera@example.test', accountId: 'accounts/1043920002' },
    { id: 'gbp-timur', name: 'BRI Regional Kalimantan & Timur', email: 'gbp.timur@example.test', accountId: 'accounts/1043920003' }
  ];
  const accountOf = region => (region === 'Jawa' || region === 'Bali & Nusa Tenggara' ? 'gbp-jawa' : region === 'Sumatera' ? 'gbp-sumatera' : 'gbp-timur');
  const acctOf = l => (l && (l.accountId || accountOf(l.region))) || '';
  app.export({ acctOf });
  const REVIEW_TEXTS = {
    5: ['Pelayanan cepat dan ramah, antrean tertib.', 'Teller sangat membantu menjelaskan produk tabungan.', 'Tempat bersih, nyaman, dan parkir luas.', 'Satpam sigap membantu nasabah lansia. Terima kasih!'],
    4: ['Pelayanan baik, hanya antrean agak panjang di jam makan siang.', 'Staf ramah, tapi AC kurang dingin.', 'Proses buka rekening cepat, sekitar 20 menit.'],
    3: ['Cukup baik, tapi jam buka di Google tidak sesuai.', 'Pelayanan standar, kursi tunggu kurang.', 'ATM sering antre panjang di sore hari.'],
    2: ['Antrean lama, hanya dua teller yang buka.', 'ATM sering offline di akhir pekan.', 'Nomor telepon di Maps tidak bisa dihubungi.'],
    1: ['Menunggu lebih dari satu jam tanpa kejelasan.', 'ATM menelan kartu dan belum ada tindak lanjut.', 'Lokasi di peta salah, saya sampai tersasar.']
  };
  app.export({ REVIEW_TEXTS });
  const AUTHORS = ['Budi Santoso', 'Siti Rahmawati', 'Andi Pratama', 'Dewi Lestari', 'Rudi Hartono', 'Maya Sari', 'Agus Setiawan', 'Fitri Handayani', 'Joko Susilo', 'Nur Aini', 'Hendra Wijaya', 'Ratna Dewi', 'Yusuf Maulana', 'Indah Permata', 'Bayu Saputra'];
  app.export({ AUTHORS });
  const REPLY_TEMPLATES = [
    { label: 'Terima kasih (ulasan positif)', text: 'Halo {nama}, terima kasih atas ulasan dan kepercayaan Anda kepada {unit}. Kami senang dapat melayani Anda dan menantikan kunjungan berikutnya. Salam hangat, BRI.' },
    { label: 'Permohonan maaf (ulasan negatif)', text: 'Halo {nama}, mohon maaf atas ketidaknyamanan yang Anda alami di {unit}. Masukan Anda sudah kami teruskan ke tim terkait untuk perbaikan. Silakan hubungi kanal resmi BRI agar kami dapat membantu lebih lanjut.' },
    { label: 'Antrean / waktu tunggu', text: 'Halo {nama}, terima kasih atas masukannya. Kami sedang menambah petugas di jam sibuk agar waktu tunggu di {unit} lebih singkat. Mohon maaf atas ketidaknyamanannya.' },
    { label: 'Informasi lokasi / jam salah', text: 'Halo {nama}, terima kasih telah memberi tahu kami. Informasi lokasi dan jam operasional {unit} sudah kami periksa dan perbarui di Google Maps.' },
    { label: 'Masalah ATM', text: 'Halo {nama}, mohon maaf atas kendala ATM di {unit}. Tim kami sudah melakukan pengecekan. Untuk kartu tertelan atau transaksi gagal, silakan hubungi kanal pengaduan resmi BRI dengan menyiapkan data transaksi Anda.' }
  ];
  app.export({ REPLY_TEMPLATES });
  const REPLY_MAX = 4096;
  app.export({ REPLY_MAX }); // batas panjang balasan Google Business Profile
  const fillTemplate = (t, author, unit) => t.replace(/\{nama\}/g, String(author || '').split(' ')[0] || 'Bapak/Ibu').replace(/\{unit\}/g, unit || 'unit kami');
  app.export({ fillTemplate });
  const GOOGLE_SCOPES = [
    ['business.manage', 'Kelola profil bisnis, lokasi & ulasan', 'wajib'],
    ['pubsub', 'Notifikasi real-time (Pub/Sub) untuk ulasan & edit baru', 'opsional'],
    ['userinfo.email', 'Identitas akun Google yang menghubungkan', 'opsional']
  ];
  app.export({ GOOGLE_SCOPES });
  const SYNC_INTERVALS = [['0', 'Manual saja'], ['15', 'Setiap 15 menit'], ['60', 'Setiap jam'], ['360', 'Setiap 6 jam'], ['1440', 'Setiap hari']];
  app.export({ SYNC_INTERVALS });
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
      { id: 'claims', label: 'Klaim & Titik Baru', icon: 'shield', count: () => app.state.claims.filter(claimActive).length, desc: 'Klaim kepemilikan, banding suspend, laporan duplikat, dan pengajuan titik baru.' }
    ] },
    { group: 'Operasional', items: [
      { id: 'approvals', label: 'Persetujuan Edit', icon: 'inbox', count: () => app.state.approvals.filter(a => a.status === 'Menunggu').length, desc: 'Perubahan dari email GBP lain. Data tidak berubah sebelum BRI menyetujui.' },
      { id: 'reviews', label: 'Ulasan', icon: 'star', count: () => app.state.reviews.filter(rv => !rv.reply).length, desc: 'Ulasan nasabah dari setiap akun dan lokasi Google Maps. Balas langsung dari sini.' },
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
  app.export({ NAV });
  const NAV_ITEMS = NAV.flatMap(g => g.items);
  app.export({ NAV_ITEMS });
  const navItem = id => NAV_ITEMS.find(n => n.id === id) || NAV_ITEMS[0];
  app.export({ navItem });

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
  app.export({ STORE });
  app.demoState = null; app.storageMode = 'pending'; // pending | idb | local
  function legacyLoad() {
    try {
      const s0 = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s0 && s0.v === 2 && Array.isArray(s0.locations)) return ensureExtras(s0);
    } catch (_) { /* penyimpanan tidak tersedia */ }
    return buildSeed();
  }
  function loadState() { if (!app.demoState) app.demoState = legacyLoad(); return app.demoState; }
  app.state = loadState();
  let prefs = { theme: '', collapsed: false, pageSize: 10 };
  app.export({ prefs });
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (_) {}
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {} };
  app.export({ savePrefs });
  let saveTimer = 0;
  // Data Live tidak pernah ditulis ke penyimpanan demo. Gagal simpan → peringatan (sekali).
  let saveWarned = false;
  const saveFailed = () => { if (saveWarned) return; saveWarned = true; toast('Data Demo gagal disimpan di browser ini. Unduh cadangan JSON agar perubahan tidak hilang.', { tone: 'bad', action: { label: 'Buka Pengaturan', run: () => navigate('settings') } }); };
  const persist = () => {
    if (isLive() || app.storageMode === 'pending') return;
    app.demoState = app.state;
    clearTimeout(saveTimer);
    setSave('saving');
    saveTimer = setTimeout(() => {
      if (isLive()) { setSave(''); return; }
      const ok = () => { saveWarned = false; setSave('saved'); }, bad = () => { setSave('error'); saveFailed(); };
      if (app.storageMode === 'idb') STORE.set('demoState', app.demoState).then(ok, bad);
      else { try { localStorage.setItem(STORE_KEY, JSON.stringify(app.demoState)); ok(); } catch (_) { bad(); } }
    }, 400);
  };
  app.cache = {};
  const touch = () => { app.cache = {}; persist(); };
  app.export({ touch });
  // Indikator simpan di topbar (Menyimpan… / Tersimpan / Gagal), diumumkan pembaca layar lewat role="status".
  let saveState = '', saveIdle = 0;
  function setSave(st) {
    const el = document.getElementById('bsSave');
    if (!el || st === saveState) return;
    saveState = st; clearTimeout(saveIdle);
    const live = isLive();
    const label = { saving: 'Menyimpan…', saved: live ? 'Tersimpan ke server' : 'Tersimpan di browser', error: 'Gagal menyimpan' }[st] || '';
    el.dataset.state = st;
    el.innerHTML = st ? `${st === 'saving' ? '<span class="bs-spinner sm" aria-hidden="true"></span>' : ic(st === 'saved' ? 'check' : 'alert')}<span class="bs-save-text">${label}</span>` : '';
    el.title = label;
    if (st === 'saved') saveIdle = setTimeout(() => setSave(''), 4000);
  }
  const memo = (k, fn) => (k in app.cache ? app.cache[k] : (app.cache[k] = fn()));
  app.export({ memo });
  // Izin pengguna aktif: dari server (Live, bila dikirim) atau dari matriks peran.
  const myPerms = () => memo('perms', () => {
    if (Array.isArray(app.ME.permissions)) return new Set(app.ME.permissions);
    if (app.ME.role === 'Administrator') return new Set(PERMS.map(x => x[0]));
    const r = (app.state.roles || []).find(x => x.name === app.ME.role);
    return new Set(r ? r.permissions : ['locations.read']);
  });
  const can = perm => !perm || myPerms().has(perm);
  app.export({ can });
  const permLabel = perm => (PERMS.find(x => x[0] === perm) || [perm, perm])[1];
  const deniedMsg = perm => `Tidak diizinkan untuk peran ${app.ME.role} — butuh izin “${permLabel(perm)}”.`;
  app.export({ deniedMsg });
  const canView = v => can((NAV_ITEMS.find(n => n.id === v) || {}).perm);
  app.export({ canView });
  function guard(perm) { if (can(perm)) return true; toast(deniedMsg(perm), { tone: 'warn' }); return false; }
  const snapshot = () => JSON.stringify(app.state);
  app.export({ snapshot });

  const ui = {
    view: 'dashboard', navOpen: false, running: null, pop: '', renderMs: 0,
    loc: { q: '', quick: 'all', status: [], region: [], type: [], gbp: [], sort: 'name', dir: 1, page: 1, selected: new Set() },
    map: { q: '', status: '', region: '', gbp: '', showGoogle: true, limit: 300 },
    dups: { limit: 30 },
    disc: { q: '', field: '' }, claims: { tab: 'active' }, approvals: { tab: 'pending' },
    sync: { tab: 'failures' }, audit: { q: '', module: '', actor: '', range: '30' }, access: { tab: 'users', q: '' },
    drawer: null,
    live: { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 },
    sessionNotice: false,
    reviews: { account: '', location: '', rating: '', status: '', sort: 'newest', q: '', limit: 20, editing: null, drafts: {} },
    report: { period: '30', region: '', account: '', type: '' },
    guide: { q: '' },
    scn: { group: '', open: new Set([1]) }
  };
  app.export({ ui });

  /* ------------------------------------------------------------------ *
   * Data turunan
   * ------------------------------------------------------------------ */
  const byCode = () => memo('byCode', () => new Map(app.state.locations.map(l => [l.code, l])));
  app.export({ byCode });
  const byName = () => memo('byName', () => { const m = new Map(); app.state.locations.forEach(l => { const k = String(l.name).toLowerCase(); (m.get(k) || m.set(k, []).get(k)).push(l); }); return m; });
  app.export({ byName });
  const locName = code => byCode().get(code)?.name || code;
  app.export({ locName });
  function issuesOf(l) {
    const g = l.google;
    if (!g) return [];
    const out = [];
    for (const f of ['name', 'phone', 'hours', 'address']) {
      if (String(l[f] || '').trim() !== String(g[f] || '').trim()) out.push({ field: f, dash: l[f], google: g[f] });
    }
    const d = distM(l, g);
    if (d > app.state.settings.coordTol) out.push({ field: 'coords', dash: `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`, google: `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`, dist: d });
    return out;
  }
  const issueMap = () => memo('issues', () => {
    const m = new Map();
    app.state.locations.forEach(l => { const x = issuesOf(l); if (x.length) m.set(l.code, x); });
    return m;
  });
  app.export({ issueMap });
  /* Deteksi duplikat (Tahap 5): dua lintasan grid —
   *  1) nama sama (dinormalisasi) dalam 2 km, 2) tipe sama dalam radius pengaturan.
   * Tiap unit menyimpan maks. DUP_PER_UNIT pasangan terdekat dan memeriksa maks. DUP_SCAN kandidat,
   * supaya ribuan titik yang bertumpuk (mis. salah impor koordinat) tidak membuat halaman macet. */
  const DUP_PER_UNIT = 5, DUP_SCAN = 200;
  app.export({ DUP_PER_UNIT });
  function nearPairs(list, radius, emit) {
    const cell = radius / 111320 / 0.97, grid = new Map(); // 0,97 ≈ cos 14° (batas lintang Indonesia)
    const keyOf = (y, x) => `${y}:${x}`;
    list.forEach((l, i) => { const k = keyOf(Math.floor(l.lat / cell), Math.floor(l.lng / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
    let capped = 0;
    list.forEach((a, i) => {
      const gy = Math.floor(a.lat / cell), gx = Math.floor(a.lng / cell), best = [];
      let scanned = 0;
      for (let dy = -1; dy <= 1 && scanned < DUP_SCAN; dy++) for (let dx = -1; dx <= 1 && scanned < DUP_SCAN; dx++) {
        const ids = grid.get(keyOf(gy + dy, gx + dx)); if (!ids) continue;
        for (let n = 0; n < ids.length; n++) {
          const j = ids[n]; if (j === i) continue;
          if (++scanned > DUP_SCAN) { capped++; break; }
          const d = distM(a, list[j]); if (d > radius) continue;
          if (best.length < DUP_PER_UNIT) best.push([d, j]); else if (d < best[best.length - 1][0]) best[best.length - 1] = [d, j]; else continue;
          best.sort((x, y) => x[0] - y[0]);
        }
      }
      best.forEach(([d, j]) => emit(a, list[j], d));
    });
    return capped;
  }
  const duplicatePairs = () => memo('dups', () => {
    const ignored = new Set(app.state.dupIgnored), R = app.state.settings.dupRadius, out = [], seen = new Set();
    const active = app.state.locations.filter(l => l.gbp !== 'Duplikat');
    const add = same => (a, b, d) => {
      const [x, y] = a.code < b.code ? [a, b] : [b, a], key = `${x.code}|${y.code}`;
      if (seen.has(key) || ignored.has(key)) return;
      seen.add(key);
      out.push({ key, a: x, b: y, d, reason: same ? 'Nama sama dan berdekatan' : `Tipe sama dalam radius ${R} m`, score: same ? (d < 300 ? 95 : 80) : 70 });
    };
    const group = keyFn => { const m = new Map(); active.forEach(l => { const k = keyFn(l); if (k) (m.get(k) || m.set(k, []).get(k)).push(l); }); return m; };
    let capped = 0;
    group(l => normName(l.name)).forEach(g => { if (g.length > 1) capped += nearPairs(g, 2000, add(true)); });
    group(l => l.type).forEach(g => { if (g.length > 1) capped += nearPairs(g, R, add(false)); });
    out.sort((x, y) => y.score - x.score || x.d - y.d);
    out.dense = capped; // > 0 → ada area sangat padat; hanya pasangan terdekat yang dicatat
    return out;
  });
  app.export({ duplicatePairs });
  const openFailures = () => memo('fails', () => {
    const out = [], seen = new Set();
    app.state.runs.forEach(r => r.items.forEach(i => {
      if (i.status !== 'Gagal' || i.resolved || seen.has(i.code)) return;
      seen.add(i.code);
      out.push({ ...i, run: r.id, time: r.time, ref: i });
    }));
    return out;
  });
  app.export({ openFailures });
  const claimActive = c => !['Selesai', 'Ditolak'].includes(c.status);
  app.export({ claimActive });
  const claimName = c => (c.code ? locName(c.code) : c.proposal?.name || '—');
  app.export({ claimName });
  function claimTimes(c) {
    const now = Date.now();
    const internal = (c.processedAt || (claimActive(c) ? now : c.doneAt || now)) - c.submittedAt;
    const gEnd = c.doneAt || (claimActive(c) ? now : null);
    const google = c.processedAt && gEnd ? gEnd - c.processedAt : null;
    const limit = app.state.settings.slaInternal * HOUR;
    const sla = internal > limit ? 'Lewat SLA' : !c.processedAt && claimActive(c) && internal > limit * 0.75 ? 'Mendekati batas' : 'Dalam SLA';
    return { internal, google: google == null || isNaN(google) ? null : google, internalRunning: !c.processedAt && claimActive(c), googleRunning: !!c.processedAt && !c.doneAt && claimActive(c), sla };
  }
  const slaStats = () => memo('sla', () => {
    const rows = app.state.claims.filter(c => c.status !== 'Ditolak').map(c => ({ c, t: claimTimes(c) }));
    const doneInt = rows.filter(x => !x.t.internalRunning), doneG = rows.filter(x => x.c.doneAt);
    return {
      rows,
      avgInternal: doneInt.length ? sum(doneInt.map(x => x.t.internal)) / doneInt.length : null,
      avgGoogle: doneG.length ? sum(doneG.map(x => x.t.google)) / doneG.length : null,
      compliance: pct(rows.filter(x => x.t.sla !== 'Lewat SLA').length, rows.length),
      atRisk: rows.filter(x => x.t.sla !== 'Dalam SLA' && claimActive(x.c)).length
    };
  });
  app.export({ slaStats });
  function dailySync(days) {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) out.push({ start: today.getTime() - i * DAY, ok: 0, fail: 0 });
    app.state.runs.forEach(r => { const d = out.find(x => r.time >= x.start && r.time < x.start + DAY); if (d) { d.ok += r.ok; d.fail += r.fail; } });
    return out;
  }
  function notifications() {
    const neg = app.state.reviews.filter(rv => !rv.reply && rv.rating <= 2).length;
    const pend = app.state.approvals.filter(a => a.status === 'Menunggu').length, f = openFailures().length, im = issueMap().size, dp = duplicatePairs().length, risk = slaStats().atRisk;
    return [
      pend && { icon: 'inbox', tone: 'warn', title: `${pend} edit dari email GBP lain menunggu persetujuan`, text: 'Data unit kerja tidak berubah sampai disetujui.', view: 'approvals' },
      f && { icon: 'refresh', tone: 'bad', title: `${f} unit gagal disinkronkan`, text: 'Coba ulang atau beri catatan tindak lanjut.', view: 'sync' },
      risk && { icon: 'gauge', tone: 'warn', title: `${risk} permintaan mendekati/lewat SLA`, text: `Target proses internal ${app.state.settings.slaInternal} jam.`, view: 'sla' },
      im && { icon: 'alert', tone: 'warn', title: `${im} unit berbeda dengan Google Maps`, text: 'Tentukan sumber data yang benar.', view: 'discrepancies' },
      dp && { icon: 'copy', tone: 'info', title: `${dp} kemungkinan titik ganda`, text: 'Periksa dan gabungkan bila perlu.', view: 'duplicates' },
      neg && { icon: 'star', tone: 'warn', title: `${neg} ulasan negatif belum dibalas`, text: 'Balas cepat agar nasabah merasa didengar.', view: 'reviews' }
    ].filter(Boolean);
  }

  /* ------------------------------------------------------------------ *
   * Mutasi + audit
   * ------------------------------------------------------------------ */
  function log(module, action, { target = '', changes = [], user = app.ME.name, actor = 'Internal', detail = '' } = {}) {
    app.state.audit.unshift({ id: ++app.state.seq.audit, time: Date.now(), user, actor, module, action, target, changes, detail });
    if (app.state.audit.length > 3000) app.state.audit.length = 3000;
  }
  const diff = (before, after, keys) => keys.filter(k => String(before[k] ?? '') !== String(after[k] ?? '')).map(k => ({ field: FIELD_LABEL[k] || k, before: before[k] ?? '', after: after[k] ?? '' }));
  app.export({ diff });

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
    if (!silent) { ui.live.loading = true; ui.live.error = null; render(); } else { ui.live.loading = true; updateChrome(); }
    try {
      const data = await MODE.request('GET', '/bootstrap');
      if (!isLive()) return false;
      app.state = normalizeSnapshot(data);
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
    ui.live.pending++; setSave('saving'); updateChrome();
    try { const res = await MODE.request(method, path, body); ui.live.error = null; if (ui.live.pending <= 1) setSave('saved'); return res ?? true; }
    catch (e) {
      setSave('error');
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
      ui.sessionNotice = true;
      MODE.setMode('demo'); app.ME = demoUser(); app.state = loadState();
      ui.live = { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 };
      app.renderedView = null; touch();
      if (!shell.hidden) render();
    }
    if (!shell.hidden) liveConnectModal(message);
  }
  function switchToDemo() {
    if (!isLive()) { toast('Anda sudah berada di Mode Demo.'); return; }
    MODE.setMode('demo'); setSave('');
    app.ME = demoUser();
    app.state = loadState();
    ui.live = { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 };
    ui.loc.selected.clear(); app.renderedView = null;
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
      ui.running = { done: 0, total: codes ? codes.length : app.state.locations.length, indeterminate: true };
      render();
      announce(`Server sedang menyinkronkan ${fmtNum(ui.running.total)} unit.`);
      const run = await remote('POST', '/sync', { codes: codes || null, retry, label });
      ui.running = null;
      render();
      if (run && typeof run === 'object' && 'ok' in run) {
        toast(`Sinkronisasi selesai — ${fmtNum(run.ok)} berhasil, ${fmtNum(run.fail || 0)} gagal, ${fmtNum(run.skip || 0)} dilewati.`, { tone: run.fail ? 'warn' : 'good', action: run.fail ? { label: 'Lihat kegagalan', run: () => { ui.sync.tab = 'failures'; navigate('sync'); } } : null });
      } else if (run) toast('Permintaan sinkronisasi diterima server.', { tone: 'good' });
      return;
    }
    if (!app.state.api.connected) { toast('Google API belum terhubung.', { tone: 'bad', action: { label: 'Buka Integrasi', run: () => navigate('integrations') } }); return; }
    const targets = codes ? codes.map(c => byCode().get(c)).filter(Boolean) : [...app.state.locations];
    if (!targets.length) return;
    const remaining = app.state.api.quotaLimit - app.state.api.quotaUsed;
    if (remaining < targets.length) { toast(`Kuota API tidak cukup (sisa ${fmtNum(remaining)}).`, { tone: 'bad' }); return; }
    const started = performance.now();
    ui.running = { done: 0, total: targets.length };
    render();
    announce(`Sinkronisasi dimulai: ${fmtNum(targets.length)} unit.`);
    let lastQuarter = 0;
    const items = []; let ok = 0;
    const chunk = Math.max(5, Math.ceil(targets.length / 12));
    for (let i = 0; i < targets.length; i += chunk) {
      targets.slice(i, i + chunk).forEach(l => {
        const res = syncOne(l, retry);
        if (res.status === 'Berhasil') ok++;
        else items.push({ code: l.code, status: res.status, reason: res.reason, resolved: res.status !== 'Gagal', note: '' });
      });
      ui.running.done = Math.min(targets.length, i + chunk);
      const q = Math.floor((ui.running.done / targets.length) * 4);
      if (q > lastQuarter && q < 4) { lastQuarter = q; announce(`Sinkronisasi ${q * 25}% — ${fmtNum(ui.running.done)} dari ${fmtNum(targets.length)} unit.`); }
      updateChrome();
      await sleep(Math.max(40, 900 / Math.ceil(targets.length / chunk)));
    }
    const fail = items.filter(i => i.status === 'Gagal').length, skip = items.length - fail;
    const run = { id: `JOB-${String(++app.state.seq.job).padStart(4, '0')}`, time: Date.now(), scope: label, by: app.ME.name, total: targets.length, ok, fail, skip, durationMs: Math.round(performance.now() - started), items };
    app.state.runs.unshift(run);
    if (app.state.runs.length > 600) app.state.runs.length = 600;
    // Kegagalan lama yang sekarang berhasil → otomatis ditandai selesai
    const okCodes = new Set(targets.filter(l => !items.some(i => i.code === l.code)).map(l => l.code));
    app.state.runs.slice(1).forEach(r => r.items.forEach(i => { if (i.status === 'Gagal' && !i.resolved && okCodes.has(i.code)) { i.resolved = true; i.note = `Berhasil pada ${run.id}`; } }));
    app.state.api.quotaUsed += ok;
    log('Sync Monitor', retry ? 'Mencoba ulang sinkronisasi' : 'Menjalankan sinkronisasi', { target: run.id, detail: `${label}: ${ok} berhasil, ${fail} gagal, ${skip} dilewati` });
    ui.running = null;
    touch(); render();
    toast(`Sinkronisasi selesai — ${fmtNum(ok)} berhasil, ${fmtNum(fail)} gagal, ${fmtNum(skip)} dilewati.`, {
      tone: fail ? 'warn' : 'good',
      action: fail ? { label: 'Lihat kegagalan', run: () => { ui.sync.tab = 'failures'; navigate('sync'); } } : null
    });
  }
});
