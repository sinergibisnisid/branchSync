'use strict';
/*
 * BranchSync Admin — Kerangka halaman admin & komponen HTML.
 * Modul shell.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('shell', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let ACTION_PERM, can, deniedMsg, esc, FIELD_LABEL, FILTERS, fmtNum, ic, MOD, shell, SL, ui;
  app.imports(() => ({ ACTION_PERM, can, deniedMsg, esc, FIELD_LABEL, FILTERS, fmtNum, ic, MOD, shell, SL, ui } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ announce, filterChips, resetFilters });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

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
        <span class="bs-account-text"><strong id="bsAccName">${esc(app.ME.name)}</strong><small id="bsAccRole">Administrator</small></span>
        <button type="button" class="bs-icon-btn" data-action="logout" aria-label="Keluar ke halaman utama" title="Keluar">${ic('logout')}</button>
      </div>
    </aside>
    <div class="bs-scrim" data-action="nav-close" hidden></div>
    <div class="bs-body">
      <header class="bs-topbar">
        <button type="button" class="bs-icon-btn bs-menu" data-action="nav-open" aria-label="Buka navigasi" aria-controls="bsSidebar" aria-expanded="false">${ic('menu')}</button>
        <nav class="bs-crumbs" aria-label="Lokasi halaman"><span>Workspace</span>${ic('chev')}<strong id="bsCrumb"></strong></nav>
        <div class="bs-top-end">
          <span class="bs-save" id="bsSave" role="status" aria-live="polite"></span>
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
        <div class="bs-banner-slot" id="bsBanner"></div>
        <div class="bs-page" id="bsPage"></div>
      </main>
      <footer class="bs-footer" aria-label="Status workspace"><span id="bsFooterInfo"></span><span id="bsFooterMode"></span></footer>
    </div>
    <dialog class="bs-modal" id="bsModal" aria-labelledby="bsModalTitle"></dialog>
    <dialog class="bs-sheet" id="bsDrawer" aria-labelledby="bsDrawerTitle"></dialog>
    <dialog class="bs-palette" id="bsPalette" aria-label="Pencarian cepat"></dialog>
    <div class="bs-toasts" id="bsToasts" role="region" aria-label="Notifikasi singkat" aria-live="polite"></div>
    <div class="bs-sr" id="bsAnnounce" role="status" aria-live="polite" aria-atomic="true"></div>`;
  document.getElementById('adminEditDialog')?.remove();
  document.getElementById('legacyAdminTemplate')?.remove();
  const $ = id => document.getElementById(id);
  app.export({ $ });
  const modal = $('bsModal'), sheet = $('bsDrawer'), palette = $('bsPalette');
  app.export({ modal, sheet, palette });
  // Pengumuman pembaca layar (progres sync, jumlah hasil filter, aksi massal). Dikosongkan dulu
  // supaya pesan yang sama tetap dibacakan ulang.
  let announceTimer = 0;
  function announce(msg) {
    const el = $('bsAnnounce'); if (!el) return;
    clearTimeout(announceTimer); el.textContent = '';
    announceTimer = setTimeout(() => { el.textContent = msg; }, 60);
  }
  const mobile = window.matchMedia('(max-width: 900px)');
  app.export({ mobile });

  /* ------------------------------------------------------------------ *
   * Komponen HTML
   * ------------------------------------------------------------------ */
  const btn = (label, action, { id = '', icon = '', variant = '', title = '', attrs = '' } = {}) => {
    const perm = ACTION_PERM[action], denied = !!perm && !can(perm);
    return `<button type="button" class="bs-btn ${variant}${denied ? ' is-denied' : ''}" data-action="${action}"${id !== '' ? ` data-id="${esc(id)}"` : ''}${denied ? ` title="${esc(deniedMsg(perm))}" aria-disabled="true"` : title ? ` title="${esc(title)}"` : ''}${title ? ` aria-label="${esc(title)}"` : ''} ${attrs}>${icon ? ic(icon) : ''}${label ? `<span>${label}</span>` : ''}</button>`;
  };
  app.export({ btn });
  const go = (label, view, variant = 'sm ghost') => `<button type="button" class="bs-btn ${variant}" data-view="${view}"><span>${label}</span>${ic('chev')}</button>`;
  app.export({ go });
  const card = (title, body, { actions = '', sub = '', cls = '', flush = false } = {}) =>
    `<section class="bs-card ${cls}"><header class="bs-card-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="bs-card-actions">${actions}</div>` : ''}</header><div class="bs-card-body${flush ? ' flush' : ''}">${body}</div></section>`;
  app.export({ card });
  const emptyState = (title, text, cta = '', icon = 'check') => `<div class="bs-empty-state">${ic(icon)}<strong>${title}</strong><p>${text}</p>${cta}</div>`;
  app.export({ emptyState });
  const head = (title, desc, actions = '') => `<div class="bs-page-head"><div><h1 id="bsTitle" tabindex="-1">${title}</h1><p>${desc}</p></div>${actions ? `<div class="bs-page-actions">${actions}</div>` : ''}</div>`;
  app.export({ head });
  // Tab: hanya tab aktif yang masuk urutan Tab (roving tabindex); ←/→/Home/End berpindah tab (lihat keydown).
  const tabSlug = bind => bind.replace(/\W+/g, '-');
  const tabs = (bind, items, cur, label = '') => `<div class="bs-tabs" role="tablist"${label ? ` aria-label="${esc(label)}"` : ''}>${items.map(([v, l, n]) => `<button type="button" role="tab" id="bs-tab-${tabSlug(bind)}-${tabSlug(v || 'all')}" aria-selected="${v === cur}" aria-controls="bs-panel-${tabSlug(bind)}" tabindex="${v === cur ? 0 : -1}" data-action="tab" data-id="${bind}:${v}">${l}${n != null ? `<span class="bs-tab-count">${fmtNum(n)}</span>` : ''}</button>`).join('')}</div>`;
  app.export({ tabs });
  const tabPanel = (bind, cur, html, cls = '') => `<div role="tabpanel" class="bs-tabpanel ${cls}" id="bs-panel-${tabSlug(bind)}" aria-labelledby="bs-tab-${tabSlug(bind)}-${tabSlug(cur || 'all')}">${html}</div>`;
  app.export({ tabPanel });
  /* Bilah filter seragam: filter aktif tampil sebagai chip + tombol “Reset filter”.
   * [kunci, label, format nilai, nilai default] per halaman. */
  const CHIP_DEFS = {
    map: [['q', 'Kata kunci'], ['status', 'Status', SL], ['region', 'Region'], ['gbp', 'Status GBP', SL]],
    disc: [['q', 'Kata kunci'], ['field', 'Kolom', v => FIELD_LABEL[v] || v]],
    audit: [['q', 'Kata kunci'], ['module', 'Modul'], ['actor', 'Pengguna', v => (v === 'Internal' ? 'Internal BRI' : 'Eksternal (email lain)')], ['range', 'Periode', v => ({ 1: '24 jam', 7: '7 hari', 30: '30 hari' }[v] || 'Semua waktu'), '30']],
    reviews: [['q', 'Kata kunci'], ['status', 'Status', v => (v === 'replied' ? 'Sudah dibalas' : 'Belum dibalas')], ['rating', 'Rating', v => `${v}★`]],
    report: [['region', 'Region'], ['account', 'Akun', v => (app.state.accounts.find(a => a.id === v) || {}).name || v], ['type', 'Tipe unit']],
    access: [['q', 'Kata kunci']]
  };
  app.export({ CHIP_DEFS });
  const chipBtn = (action, id, label, value) => `<button type="button" class="bs-chip" data-action="${action}" data-id="${esc(id)}" aria-label="Hapus filter ${esc(label)}: ${esc(value)}"><span>${esc(label)}: <b>${esc(value)}</b></span>${ic('x')}</button>`;
  app.export({ chipBtn });
  const chipRow = (chips, scope) => (chips.length ? `<div class="bs-chips" role="group" aria-label="Filter aktif">${chips.join('')}${btn('Reset filter', 'reset-filters', { id: scope, icon: 'x', variant: 'sm ghost' })}</div>` : '');
  app.export({ chipRow });
  function filterChips(scope) {
    const f = ui[scope];
    return chipRow(CHIP_DEFS[scope].filter(([k, , , def = '']) => String(f[k] ?? '').trim() !== '' && String(f[k]) !== String(def))
      .map(([k, l, fmt]) => chipBtn('unset-filter', `${scope}.${k}`, l, fmt ? fmt(String(f[k]).trim()) : String(f[k]).trim())), scope);
  }
  function resetFilters(scope) {
    if (scope === 'loc') { FILTERS.forEach(([k]) => { ui.loc[k] = []; }); ui.loc.q = ''; ui.loc.page = 1; return; }
    CHIP_DEFS[scope].forEach(([k, , , def = '']) => { ui[scope][k] = def; });
    if (scope === 'reviews') ui.reviews.limit = 20;
  }
  const opts = (xs, v, all) => (all ? `<option value="">${all}</option>` : '') + xs.map(x => { const [val, lab] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`; }).join('');
  app.export({ opts });
  const selectF = (bind, label, xs, v, all = 'Semua') => `<label class="bs-field"><span>${label}</span><select data-bind="${bind}">${opts(xs, v, all)}</select></label>`;
  app.export({ selectF });
  const searchF = (bind, label, v, ph, id) => `<label class="bs-field bs-grow"><span>${label}</span><span class="bs-input-ic">${ic('search')}<input type="search" id="${id}" data-bind="${bind}" data-search value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off"></span></label>`;
  app.export({ searchF });
  // Setiap <td> diberi data-label dari judul kolomnya → di layar kecil tabel tampil sebagai kartu.
  const withLabels = (heads, rows) => {
    const labels = heads.map(h => String(h).replace(/<[^>]+>/g, '').replace(/[↑↓↕]/g, '').trim());
    return rows.map(r => { let i = 0; return r.replace(/<td\b/g, () => `<td data-label="${esc(labels[i++] || '')}"`); });
  };
  app.export({ withLabels });
  const table = (heads, rows, emptyMsg = 'Tidak ada data.', { cls = '' } = {}) =>
    `<div class="bs-table-wrap ${cls}" tabindex="0" role="region" aria-label="Tabel data"><table class="bs-table bs-cards"><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? withLabels(heads, rows).join('') : `<tr><td class="bs-td-empty" colspan="${heads.length}">${emptyMsg}</td></tr>`}</tbody></table></div>`;
  app.export({ table });
  const kv = pairs => `<dl class="bs-kv">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  app.export({ kv });
  const diffList = changes => `<ul class="bs-diff">${changes.map(c => `<li><span class="bs-diff-field">${esc(c.field)}</span><del>${esc(c.before) || '<em>kosong</em>'}</del>${ic('arrowR')}<ins>${esc(c.after) || '<em>kosong</em>'}</ins></li>`).join('')}</ul>`;
  app.export({ diffList });
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
  app.export({ metric });
  const bar = (n, max, label) => `<span class="bs-bar-track" role="img" aria-label="${esc(label)}"><span style="width:${max ? Math.max(2, (n / max) * 100) : 0}%"></span></span>`;
  app.export({ bar });
});
