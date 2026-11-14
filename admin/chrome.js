'use strict';
/*
 * BranchSync Admin — Palet perintah, status Mode Live, menu mode, pintasan, toast.
 * Modul chrome.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('chrome', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let $, btn, can, canView, copyLink, esc, fmtRel, formGrid, ic, importModal, isLive, loadLive, locationForm, MOD, modal, MODE, NAV_ITEMS, navigate,
    openDrawer, openModal, palette, pointForm, render, renderDrawer, runSync, sessionExpired, setSave, shell, toggleNotif, toggleTheme, touch, ui,
    userFromSession;
  app.imports(() => ({ $, btn, can, canView, copyLink, esc, fmtRel, formGrid, ic, importModal, isLive, loadLive, locationForm, MOD, modal, MODE,
    NAV_ITEMS, navigate, openDrawer, openModal, palette, pointForm, render, renderDrawer, runSync, sessionExpired, setSave, shell, toggleNotif,
    toggleTheme, touch, ui, userFromSession } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ openPalette, viewLiveState, renderBanner, toggleModeMenu, activateLive, liveConnectModal, checkHealth, saveApiUrl, shortcutsModal,
    toast, dismissToast });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * Command palette
   * ------------------------------------------------------------------ */
  let palItems = [], palIndex = 0;
  const PAL_ACTIONS = [
    ['Tambah unit kerja', 'plus', () => locationForm(), 'locations.write'], ['Impor data CSV', 'upload', () => { app.importDraft = null; importModal(); }, 'locations.import'],
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
    const locs = q ? app.state.locations.filter(l => `${l.name} ${l.code} ${l.city}`.toLowerCase().includes(q)).slice(0, 8).map(l => ({ group: 'Unit kerja', icon: 'building', label: l.name, sub: `${l.code} · ${l.city}`, run: () => openDrawer(l.code) })) : [];
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

  // Kerangka (skeleton) mengikuti bentuk halaman yang sedang dimuat agar tata letak tidak melompat.
  function skeleton(view) {
    const bar = cls => `<span class="bs-skel ${cls}"></span>`;
    const tiles = n => `<div class="bs-skel-tiles">${Array.from({ length: n }, () => `<div class="bs-skel-card">${bar('w40')}${bar('h28 w60')}${bar('w80')}</div>`).join('')}</div>`;
    const rows = n => `<div class="bs-skel-card bs-skel-table">${bar('h32 w100')}${Array.from({ length: n }, (_, i) => `<div class="bs-skel-row">${bar('w30')}${bar(i % 2 ? 'w20' : 'w25')}${bar('w15')}${bar('w20')}</div>`).join('')}</div>`;
    const kind = ['dashboard', 'reports', 'sla'].includes(view) ? 'tiles' : view === 'map' ? 'map' : ['guide', 'scenarios', 'settings', 'integrations'].includes(view) ? 'doc' : 'table';
    return `<div class="bs-skel-page" data-kind="${kind}">${bar('h28 w30')}${bar('w50')}
      ${kind === 'tiles' ? tiles(4) + `<div class="bs-skel-split"><div class="bs-skel-card">${bar('h160 w100')}</div><div class="bs-skel-card">${bar('h160 w100')}</div></div>`
      : kind === 'map' ? `<div class="bs-skel-card">${bar('h32 w100')}</div><div class="bs-skel-card">${bar('h360 w100')}</div>`
      : kind === 'doc' ? `<div class="bs-skel-card">${bar('w60')}${bar('w90')}${bar('w80')}${bar('w70')}</div><div class="bs-skel-card">${bar('w50')}${bar('w90')}${bar('w60')}</div>`
      : `<div class="bs-skel-card">${bar('h32 w100')}</div>${rows(8)}`}</div>`;
  }
  function viewLiveState() {
    const e = ui.live.error, url = MODE.getBaseUrl();
    if (!e) return `<div class="bs-live-loading" aria-busy="true"><h1 id="bsTitle" class="bs-sr" tabindex="-1">Memuat data dari server…</h1><p class="bs-live-loading-msg" role="status"><span class="bs-spinner sm" aria-hidden="true"></span>Memuat data dari ${esc(MODE.host() || 'server')}…</p>${skeleton(ui.view)}</div>`;
    const off = !navigator.onLine;
    return `<div class="bs-live-state is-error">${ic(off ? 'wifiOff' : 'alert')}<h1 id="bsTitle" tabindex="-1">${off ? 'Anda sedang offline' : 'Data Live tidak dapat dimuat'}</h1><p>${off ? 'Perangkat tidak terhubung ke internet. Data akan dimuat otomatis saat koneksi pulih.' : esc(e.message)}</p><p class="bs-muted">Server: ${esc(url || 'belum diatur')}</p>
      <div class="bs-btn-row">${btn('Coba lagi', 'live-retry', { icon: 'refresh', variant: 'primary' })}${btn('Ubah server / masuk ulang', 'live-relogin', { icon: 'plug' })}${btn('Beralih ke Mode Demo', 'mode-demo', { icon: 'zap', variant: 'ghost' })}</div></div>`;
  }
  // Banner status di atas halaman: offline, gagal memuat ulang (data terakhir tetap tampil), atau sesi Live berakhir.
  let bannerHtml = null;
  function renderBanner() {
    const live = isLive(), loaded = ui.live.syncedAt ? ` (dimuat ${fmtRel(ui.live.syncedAt)})` : '';
    let b = null;
    if (live && ui.live.ready && !navigator.onLine) b = { tone: 'warn', icon: 'wifiOff', title: 'Anda sedang offline.', text: `Menampilkan data terakhir${loaded}. Perubahan belum dapat dikirim; data dimuat ulang otomatis saat koneksi pulih.`, actions: btn('Coba lagi', 'live-retry', { icon: 'refresh', variant: 'sm' }) };
    else if (live && ui.live.ready && ui.live.error) b = { tone: 'bad', icon: 'alert', title: 'Gagal memuat data terbaru dari server.', text: `${ui.live.error.message} Menampilkan data terakhir${loaded}.`, actions: btn('Coba lagi', 'live-retry', { icon: 'refresh', variant: 'sm' }) };
    else if (!live && ui.sessionNotice) b = { tone: 'warn', icon: 'plug', title: 'Sesi Live berakhir — Anda kini di Mode Demo.', text: 'Data Live tidak ditampilkan sampai Anda masuk lagi. Data Demo di browser ini tidak berubah.', actions: btn('Masuk lagi', 'live-relogin', { icon: 'plug', variant: 'sm primary' }) + btn('', 'banner-dismiss', { icon: 'x', variant: 'icon sm ghost', title: 'Tutup pemberitahuan' }) };
    const html = b ? `<div class="bs-banner" data-tone="${b.tone}" role="${b.tone === 'bad' ? 'alert' : 'status'}">${ic(b.icon)}<p><strong>${b.title}</strong> <span>${esc(b.text)}</span></p><div class="bs-banner-actions">${b.actions}</div></div>` : '';
    if (html === bannerHtml) return;
    bannerHtml = html; $('bsBanner').innerHTML = html;
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
      ${live ? '' : `<div class="bs-menu-sep" role="separator"></div><div class="bs-menu-head">Lihat sebagai (Demo)</div>${(app.state.roles || []).map(r => `<button type="button" class="bs-menu-item sm" role="menuitemradio" aria-checked="${app.ME.role === r.name}" data-action="demo-role" data-id="${esc(r.name)}">${ic('users')}<span>${esc(r.name)}</span>${app.ME.role === r.name ? ic('check', 'bs-menu-check') : ''}</button>`).join('')}`}
      <div class="bs-menu-sep" role="separator"></div>
      ${live ? `<button type="button" class="bs-menu-item sm" role="menuitem" data-action="live-retry">${ic('refresh')}<span>Muat ulang data</span></button>` : ''}
      <button type="button" class="bs-menu-item sm" role="menuitem" data-view="settings">${ic('sliders')}<span>Pengaturan koneksi</span></button>`;
    (pop.querySelector('[aria-checked="true"]') || pop.querySelector('[role^="menuitem"]')).focus();
  }
  const resetReviewUi = () => { ui.reviews = { account: '', location: '', rating: '', status: '', sort: 'newest', q: '', limit: 20, editing: null, drafts: {} }; };
  function activateLive() {
    resetReviewUi(); setSave('');
    MODE.setMode('live');
    app.ME = userFromSession();
    ui.live = { ready: false, loading: true, error: null, syncedAt: 0, pending: 0 };
    ui.sessionNotice = false;
    ui.loc.selected.clear(); ui.reviews.editing = null; app.renderedView = null;
    navigate(ui.view);
    loadLive().then(ok => ok && toast(`Terhubung ke ${MODE.host()}. Selamat datang, ${app.ME.name}!`, { tone: 'good' }));
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
    openModal('Pintasan keyboard', `<dl class="bs-shortcuts">${[[`${MOD} K`, 'Cari unit kerja, menu, atau aksi'], ['/', 'Fokus ke kolom pencarian di halaman'], ['N', 'Tambah unit kerja baru'], ['← →', 'Pindah tab (saat tab terfokus)'], ['?', 'Tampilkan pintasan ini'], ['Esc', 'Tutup dialog atau panel']].map(([k, d]) => `<div><dt>${k.split(' ').map(x => `<kbd>${x}</kbd>`).join('')}</dt><dd>${d}</dd></div>`).join('')}</dl>`, { footer: btn('Tutup', 'modal-close', { variant: 'primary' }) });
  }

  /* ------------------------------------------------------------------ *
   * Toast
   * ------------------------------------------------------------------ */
  const toastActions = new Map();
  app.export({ toastActions });
  let toastSeq = 0;
  function toast(msg, { tone = 'info', action = null, undo = null } = {}) {
    const id = ++toastSeq;
    if (undo && isLive()) undo = null; // perubahan Live sudah tersimpan di server
    if (undo) action = { label: 'Urungkan', run: () => { app.state = JSON.parse(undo); ui.loc.selected.clear(); touch(); render(); renderDrawer(); toast('Perubahan dibatalkan.'); } };
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
});
