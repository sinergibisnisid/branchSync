'use strict';
/*
 * BranchSync Admin — Render, routing URL (hash), navigasi, tema, notifikasi.
 * Modul router.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('router', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let $, btn, byCode, canView, closeModal, deniedMsg, esc, FILTERS, fmtNum, fmtRel, GBP, ic, initials, isEn, isLive, loadLive, mobile, MODE,
    mountMap, NAV, NAV_ITEMS, navItem, notifications, openDrawer, openFailures, openModal, pct, prefs, QUICK, REGIONS, renderBanner, renderDrawer,
    savePrefs, sheet, shell, STATUSES, toast, toggleModeMenu, TYPES, ui, updateMap, viewAccess, viewApprovals, viewAudit, viewClaims, viewDashboard,
    viewDiscrepancies, viewDuplicates, viewGuide, viewIntegrations, viewLiveState, viewLocations, viewMap, viewReports, viewReviews, viewScenarios,
    viewSettings, viewSla, viewSync;
  app.imports(() => ({ $, btn, byCode, canView, closeModal, deniedMsg, esc, FILTERS, fmtNum, fmtRel, GBP, ic, initials, isEn, isLive, loadLive,
    mobile, MODE, mountMap, NAV, NAV_ITEMS, navItem, notifications, openDrawer, openFailures, openModal, pct, prefs, QUICK, REGIONS, renderBanner,
    renderDrawer, savePrefs, sheet, shell, STATUSES, toast, toggleModeMenu, TYPES, ui, updateMap, viewAccess, viewApprovals, viewAudit, viewClaims,
    viewDashboard, viewDiscrepancies, viewDuplicates, viewGuide, viewIntegrations, viewLiveState, viewLocations, viewMap, viewReports, viewReviews,
    viewScenarios, viewSettings, viewSla, viewSync } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ updateChrome, captureFocus, restoreFocus, render, syncUrl, parseRoute, applyRoute, openRouteUnit, copyLink, navigate, applyLayout,
    closeNav, toggleTheme, toggleNotif });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */
  app.renderedView = null;
  const VIEWS = { dashboard: viewDashboard, map: viewMap, locations: viewLocations, discrepancies: viewDiscrepancies, duplicates: viewDuplicates, claims: viewClaims, approvals: viewApprovals, sync: viewSync, audit: viewAudit, sla: viewSla, access: viewAccess, integrations: viewIntegrations, settings: viewSettings, reviews: viewReviews, reports: viewReports, guide: viewGuide, scenarios: viewScenarios };
  app.export({ VIEWS });
  function renderNav() {
    $('bsNav').innerHTML = NAV.map(g => ({ ...g, items: g.items.filter(n => canView(n.id)) })).filter(g => g.items.length).map(g => `<p class="bs-nav-label">${g.group}</p>${g.items.map(n => { const c = n.count ? n.count() : 0; return `<button type="button" data-view="${n.id}" ${ui.view === n.id ? 'aria-current="page"' : ''} title="${esc(n.label)}">${ic(n.icon)}<span class="bs-nav-text">${n.label}</span>${c ? `<span class="bs-nav-count" aria-label="${c} perlu perhatian">${c > 99 ? '99+' : c}</span>` : ''}</button>`; }).join('')}`).join('');
  }
  function updateChrome() {
    const last = app.state.runs[0];
    const live = isLive(), host = MODE ? MODE.host() : '';
    const mstate = !live ? 'demo' : (ui.live.error || !navigator.onLine) ? 'offline' : (ui.live.pending || ui.live.loading) ? 'busy' : ui.live.ready ? 'online' : 'busy';
    const mb = $('bsModeBtn');
    mb.dataset.state = mstate;
    mb.innerHTML = (live ? `<span class="bs-dot"></span><span>Live</span>${host ? `<small>${esc(host)}</small>` : ''}` : `${ic('zap')}<span>Mode Demo</span>`) + ic('chevD', 'bs-caret');
    const mlabel = live ? `Mode Live — ${{ online: 'terhubung', offline: 'terputus', busy: 'menghubungkan' }[mstate]}${host ? ' ke ' + host : ''}` : 'Mode Demo — data simulasi';
    mb.title = mlabel; mb.setAttribute('aria-label', `${mlabel}. Pilih mode`);
    $('bsFooterMode').textContent = live
      ? (mstate === 'offline' ? (navigator.onLine ? `Live — tidak dapat terhubung ke ${host || 'server'}.` : 'Live — perangkat sedang offline.') : mstate === 'busy' && !ui.live.ready ? `Live — menghubungkan ke ${host || 'server'}…` : `Live — terhubung ke ${host || 'server'}. Perubahan dikirim ke server${ui.live.syncedAt ? ` · data dimuat ${fmtRel(ui.live.syncedAt)}` : ''}.`)
      : 'Mode Demo — perubahan disimpan di browser ini dan tidak dikirim ke Google atau server.';
    const rc = $('bsRoleChip'); rc.hidden = app.ME.role === 'Administrator'; rc.textContent = `Peran: ${app.ME.role}`; rc.title = isLive() ? 'Peran dari akun server' : 'Lihat sebagai (Demo) — klik untuk mengganti';
    $('bsAccName').textContent = app.ME.name; $('bsAccRole').textContent = app.ME.role || 'Pengguna'; $('bsAccAvatar').textContent = initials(app.ME.name);
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
    $('bsFooterInfo').textContent = live && !ui.live.ready ? '— unit' : `${fmtNum(app.state.locations.length)} unit · render ${ui.renderMs} ms`;
    renderBanner();
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
    if (!gate && ui.view === 'map' && app.renderedView === 'map' && $('bsMap')) {
      updateMap(false);
    } else {
      if (app.mapObj && (gate || ui.view !== 'map')) { app.mapObj.remove(); app.mapObj = null; }
      $('bsPage').innerHTML = gate ? viewLiveState() : VIEWS[ui.view]();
      app.renderedView = gate ? null : ui.view;
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
  app.export({ LOC_SORTS });
  const DRAWER_TABS = ['overview', 'compare', 'reviews', 'history', 'sync'];
  let pushNext = false; app.routing = false;
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
    if (shell.hidden || app.routing) { pushNext = false; return; }
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
  // Status jaringan: tampilkan banner offline dan muat ulang data Live otomatis saat koneksi pulih.
  window.addEventListener('offline', () => { if (!shell.hidden) updateChrome(); });
  window.addEventListener('online', () => {
    if (shell.hidden) return;
    updateChrome();
    if (!isLive()) return;
    if (!ui.live.ready) { loadLive(); return; }
    loadLive({ silent: true }).then(ok => ok && toast('Koneksi pulih — data Live diperbarui.', { tone: 'good' }));
  });
  window.addEventListener('popstate', () => {
    if (shell.hidden) return;
    const r = parseRoute(location.hash);
    if (!r) return;
    app.routing = true;
    const res = applyRoute(r);
    if (sheet.open && !res.unit) sheet.close();
    closeModal(); toggleModeMenu(false);
    ui.view = res.view; ui.pop = ''; app.renderedView = null;
    closeNav();
    render();
    if (!isLive() || ui.live.ready) openRouteUnit(res);
    app.routing = false;
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
    if (view !== ui.view) app.renderedView = null;
    ui.view = view; ui.pop = '';
    if (view === 'map') app.renderedView = null;
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
    if (app.mapObj) setTimeout(() => app.mapObj && app.mapObj.invalidateSize(), 250);
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
});
