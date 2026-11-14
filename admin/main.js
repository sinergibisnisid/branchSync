'use strict';
/*
 * BranchSync Admin — Masuk/keluar, inisialisasi penyimpanan, API window.BranchAdmin.
 * Modul main.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('main', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let applyLayout, applyRoute, blankState, closeModal, demoUser, ensureExtras, isEn, isLive, legacyLoad, loadLive, loadState, log, MODE, navigate,
    openRouteUnit, parseRoute, prefs, SCN_KEY, sheet, shell, STORE, STORE_KEY, toast, touch, translateAll, ui, userFromSession, VIEWS;
  app.imports(() => ({ applyLayout, applyRoute, blankState, closeModal, demoUser, ensureExtras, isEn, isLive, legacyLoad, loadLive, loadState, log,
    MODE, navigate, openRouteUnit, parseRoute, prefs, SCN_KEY, sheet, shell, STORE, STORE_KEY, toast, touch, translateAll, ui, userFromSession, VIEWS } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ logout });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * Masuk / keluar
   * ------------------------------------------------------------------ */
  function logout() {
    if (isLive() && MODE.hasSession()) { MODE.request('POST', '/auth/logout').catch(() => {}); MODE.clearSession(); }
    ui.live = { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 };
    ui.sessionNotice = false;
    if (sheet.open) sheet.close();
    closeModal();
    if (app.mapObj) { app.mapObj.remove(); app.mapObj = null; app.renderedView = null; }
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
      app.storageMode = 'idb';
      if (s0 && s0.v === 2 && Array.isArray(s0.locations)) app.demoState = ensureExtras(s0);
      if (sc && typeof sc === 'object') app.scn = { tester: '', org: '', items: {}, ...sc };
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (_) {
      app.storageMode = 'local';
    }
    if (!app.demoState) app.demoState = legacyLoad();
    if (!isLive()) app.state = app.demoState;
    app.cache = {};
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
      app.ME = live ? userFromSession() : demoUser();
      app.cache = {};
      ui.loc.selected.clear();
      if (live) { app.state = blankState(); ui.live = { ready: false, loading: true, error: null, syncedAt: 0, pending: 0 }; }
      else { app.state = loadState(); log('Dashboard', 'Masuk ke workspace', { detail: 'Sesi demo' }); }
      touch();
      applyLayout();
      const route = parseRoute(location.hash);
      let routed = null;
      if (route) { app.routing = true; routed = applyRoute(route); app.routing = false; }
      navigate(routed ? routed.view : opts.view && VIEWS[opts.view] ? opts.view : 'dashboard', { push: false });
      if (routed && !live) openRouteUnit(routed);
      if (live) loadLive().then(ok => { if (!ok) return; openRouteUnit(routed); toast(notice || `Terhubung ke ${MODE.host()}. Selamat datang, ${app.ME.name}!`, { tone: 'good' }); });
      else toast(notice || `Mode Demo — data simulasi. Ganti ke Live lewat menu mode di header.`, { tone: notice ? 'warn' : 'info' });
    }
  };
});

// Modul terakhir: jalankan semua modul admin (lihat admin/app.js).
BranchSyncAdmin.start();
