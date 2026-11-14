'use strict';
/*
 * BranchSync Admin — Event handler: aksi tombol (act), input, submit, keyboard.
 * Modul events.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('events', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let $, acctOf, ACTION_PERM, advanceClaim, analyzeRows, announce, applyLayout, applySavedView, auditFiltered, AUTHORS, autoEvidence, btn, buildSeed,
    byCode, canView, checkHealth, CHIP_DEFS, claimForm, claimName, closeModal, closeNav, commitImport, compressImage, confirmModal, CONTENT,
    copyLink, DAY, DAYS, decide, demoUser, destroyPicker, diff, discRows, dismissToast, download, downloadCSV, duplicatePairs, esc, exportLocations,
    FIELD_LABEL, fillTemplate, FILTERS, fmtNum, fmtStamp, generateUnits, guard, HOUR, importErrorsCSV, importModal, isLive, issueMap, L2,
    liveConnectModal, loadLive, LOC_SORTS, locationForm, locFiltered, locName, log, logout, mapFiltered, mobile, modal, MODE, navigate, noteModal,
    openDrawer, openFailures, openModal, openPalette, palette, parseCSV, pct, PERMS, pick, placePin, pointForm, prefs, presetHours, readImportFile,
    redirectUri, refreshHours, REGIONS, remote, render, renderDrawer, REPLY_MAX, REPLY_TEMPLATES, reportBuckets, reportMetrics, reportScheduleModal,
    reportScope, resetFilters, resolveDisc, restoreFocus, REVIEW_TEXTS, reviewFiltered, rng, roleForm, runSync, sampleCSV, saveApiUrl, savePrefs,
    saveScn, saveUP, saveViewModal, SCN_RESULTS, scnItem, scnPeek, scnStart, setLanguage, setPickInputs, sheet, shell, shortcutsModal, showErrors,
    simulateEdit, simulateGoogleChange, slaStats, snapshot, startMapping, sum, switchToDemo, switchToLive, syncPickerFromInputs, syncUrl, toast,
    toastActions, toggleModeMenu, toggleNotif, toggleTheme, touch, ui, up, updateChrome, updateHoursSummary, updateMap, userForm, visibleCols,
    xlsxTemplate;
  app.imports(() => ({ $, acctOf, ACTION_PERM, advanceClaim, analyzeRows, announce, applyLayout, applySavedView, auditFiltered, AUTHORS,
    autoEvidence, btn, buildSeed, byCode, canView, checkHealth, CHIP_DEFS, claimForm, claimName, closeModal, closeNav, commitImport, compressImage,
    confirmModal, CONTENT, copyLink, DAY, DAYS, decide, demoUser, destroyPicker, diff, discRows, dismissToast, download, downloadCSV, duplicatePairs,
    esc, exportLocations, FIELD_LABEL, fillTemplate, FILTERS, fmtNum, fmtStamp, generateUnits, guard, HOUR, importErrorsCSV, importModal, isLive,
    issueMap, L2, liveConnectModal, loadLive, LOC_SORTS, locationForm, locFiltered, locName, log, logout, mapFiltered, mobile, modal, MODE, navigate,
    noteModal, openDrawer, openFailures, openModal, openPalette, palette, parseCSV, pct, PERMS, pick, placePin, pointForm, prefs, presetHours,
    readImportFile, redirectUri, refreshHours, REGIONS, remote, render, renderDrawer, REPLY_MAX, REPLY_TEMPLATES, reportBuckets, reportMetrics,
    reportScheduleModal, reportScope, resetFilters, resolveDisc, restoreFocus, REVIEW_TEXTS, reviewFiltered, rng, roleForm, runSync, sampleCSV,
    saveApiUrl, savePrefs, saveScn, saveUP, saveViewModal, SCN_RESULTS, scnItem, scnPeek, scnStart, setLanguage, setPickInputs, sheet, shell,
    shortcutsModal, showErrors, simulateEdit, simulateGoogleChange, slaStats, snapshot, startMapping, sum, switchToDemo, switchToLive,
    syncPickerFromInputs, syncUrl, toast, toastActions, toggleModeMenu, toggleNotif, toggleTheme, touch, ui, up, updateChrome, updateHoursSummary,
    updateMap, userForm, visibleCols, xlsxTemplate } = app));
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * Event handler
   * ------------------------------------------------------------------ */
  // Umumkan jumlah hasil setelah pencarian/filter berubah (dipanggil setelah render).
  function announceResults() {
    const n = { locations: () => [locFiltered().length, 'unit cocok'], map: () => [mapFiltered().length, 'unit di peta'], discrepancies: () => [discRows().length, 'perbedaan'],
      audit: () => [auditFiltered().length, 'aktivitas'], reviews: () => [reviewFiltered().length, 'ulasan'] }[ui.view];
    if (n) { const [c, l] = n(); announce(`${fmtNum(c)} ${l}.`); }
  }
  function setBind(path, value) {
    const [a, b] = path.split('.');
    if (a === 'prefs') { prefs[b] = Number(value) || value; savePrefs(); ui.loc.page = 1; return; }
    if (a === 'api') { app.state.api[b] = value; log('Integrasi Google', `${value ? 'Mengaktifkan' : 'Menonaktifkan'} notifikasi edit eksternal`); touch(); toast(value ? 'Notifikasi edit eksternal aktif.' : 'Notifikasi edit eksternal nonaktif.'); remote('PATCH', '/integrations/google', { [b]: value }); return; }
    ui[a][b] = value;
    if (a === 'loc') ui.loc.page = 1;
    if (a === 'map') ui.map.limit = 300;
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
        prefs.demoRole = id; savePrefs(); app.ME = demoUser(); app.cache = {};
        app.renderedView = null;
        if (!canView(ui.view)) navigate('dashboard'); else render();
        toast(`Sekarang melihat sebagai ${id}.`, { tone: 'info' });
        break;
      }
      case 'copy-link': copyLink(); break;
      case 'view-save': saveViewModal(); break;
      case 'view-apply': applySavedView(id); break;
      case 'view-rename': saveViewModal(id); break;
      case 'view-pin': { const v = up().views.find(x => x.id === id); if (v) { v.pinned = !v.pinned; saveUP(); render(); toast(v.pinned ? `“${v.name}” disematkan di tampilan cepat.` : `Sematan “${v.name}” dilepas.`); } break; }
      case 'view-delete': { const v = up().views.find(x => x.id === id); if (!v) break; confirmModal(`Hapus tampilan “${v.name}”?`, 'Hanya tampilan tersimpan yang dihapus; data unit kerja tidak berubah.', 'Hapus tampilan', () => {
        const U = up(), at = U.views.indexOf(v); U.views = U.views.filter(x => x !== v); saveUP();
        toast(`Tampilan “${v.name}” dihapus.`, { action: { label: 'Urungkan', run: () => { const W = up(); if (!W.views.some(x => x.id === v.id)) W.views.splice(Math.min(at, W.views.length), 0, v); saveUP(); render(); toast(`Tampilan “${v.name}” dikembalikan.`); } } });
      }, { undo: 'any' }); break; }
      case 'cols-reset': { const U = up(); U.cols = null; U.density = 'comfortable'; saveUP(); render(); break; }
      case 'mode-demo': toggleModeMenu(false); closeModal(); switchToDemo(); break;
      case 'mode-live': toggleModeMenu(false); closeModal(); switchToLive(); break;
      case 'live-retry': {
        toggleModeMenu(false); closeModal();
        if (!ui.live.ready) { loadLive(); break; }
        loadLive({ silent: true }).then(ok => toast(ok ? 'Data Live diperbarui.' : `Masih gagal memuat data: ${ui.live.error ? ui.live.error.message : 'sesi berakhir'}`, { tone: ok ? 'good' : 'bad' }));
        break;
      }
      case 'live-relogin': liveConnectModal(); break;
      case 'banner-dismiss': ui.sessionNotice = false; updateChrome(); $('bsMain').focus(); break;
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
      case 'review-edit': { const rv = app.state.reviews.find(x => x.id === id); if (!rv) break; ui.reviews.editing = id; ui.reviews.drafts[id] = rv.reply ? rv.reply.text : ''; render(); $(`rv-text-${id}`)?.focus(); break; }
      case 'review-cancel': ui.reviews.editing = null; delete ui.reviews.drafts[id]; render(); break;
      case 'review-send': {
        const rv = app.state.reviews.find(x => x.id === id); if (!rv) break;
        const text = String(ui.reviews.drafts[id] ?? $(`rv-text-${id}`)?.value ?? '').trim();
        if (!text) { toast('Balasan tidak boleh kosong.', { tone: 'warn' }); $(`rv-text-${id}`)?.focus(); break; }
        if (text.length > REPLY_MAX) { toast(`Balasan maksimal ${fmtNum(REPLY_MAX)} karakter.`, { tone: 'warn' }); break; }
        const before = rv.reply ? rv.reply.text : '';
        rv.reply = { text, by: app.ME.name, time: Date.now() };
        ui.reviews.editing = null; delete ui.reviews.drafts[id];
        log('Ulasan', before ? 'Mengubah balasan ulasan' : 'Membalas ulasan', { target: rv.code, detail: `${rv.author} · ${rv.rating}★`, changes: [{ field: 'Balasan', before, after: text }] });
        touch(); render();
        if (isLive()) remote('PUT', `/reviews/${encodeURIComponent(id)}/reply`, { text }).then(ok => ok && toast('Balasan terkirim ke Google.', { tone: 'good' }));
        else toast('Balasan disimpan (simulasi — tidak dikirim ke Google).', { tone: 'good' });
        break;
      }
      case 'review-delete': {
        const rv = app.state.reviews.find(x => x.id === id); if (!rv || !rv.reply) break;
        confirmModal(`Hapus balasan untuk ulasan ${rv.author}?`, `Balasan pemilik pada ulasan ${esc(rv.author)} (${rv.rating}★) akan dihapus dari Google Maps.`, 'Hapus balasan', () => {
          const snap = snapshot(), before = rv.reply.text; rv.reply = null;
          log('Ulasan', 'Menghapus balasan ulasan', { target: rv.code, detail: `${rv.author} · ${rv.rating}★`, changes: [{ field: 'Balasan', before, after: '' }] });
          remote('DELETE', `/reviews/${encodeURIComponent(id)}/reply`);
          toast('Balasan dihapus.', { undo: snap });
        }, { undo: true });
        break;
      }
      case 'review-rating': ui.reviews.rating = String(ui.reviews.rating) === String(id) ? '' : String(id); ui.reviews.limit = 20; render(); break;
      case 'review-more': ui.reviews.limit += 20; render(); break;
      // Laporan
      case 'report-print': window.print(); break;
      // Jam operasional & peta pemilih
      case 'hours-preset': app.hoursDraft = presetHours(id); refreshHours(`[data-action="hours-preset"][data-id="${id}"]`); break;
      case 'hours-add': { const d = app.hoursDraft[id]; const last = d.ranges[d.ranges.length - 1]; d.ranges.push(last ? { from: last.to, to: last.to < '20:00' ? `${String(Math.min(23, Number(last.to.slice(0, 2)) + 3)).padStart(2, '0')}:00` : '23:00' } : { from: '08:00', to: '15:00' }); refreshHours(`[data-hours-from="${id}:${d.ranges.length - 1}"]`); break; }
      case 'hours-del': { const [k, i] = id.split(':'); app.hoursDraft[k].ranges.splice(Number(i), 1); refreshHours(`[data-hours-from="${k}:0"]`); break; }
      case 'hours-copy': { const m = app.hoursDraft.mon; if (!m.open) { toast('Aktifkan hari Senin terlebih dahulu.', { tone: 'warn' }); break; } DAYS.slice(1).forEach(([k]) => { if (app.hoursDraft[k].open) app.hoursDraft[k] = JSON.parse(JSON.stringify(m)); }); refreshHours('[data-action="hours-copy"]'); toast('Jam Senin diterapkan ke semua hari buka.'); break; }
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
      case 'scn-ev-del': {
        const [no, i] = id.split(':'), it = scnItem(Number(no)), ev = it.evidence[Number(i)]; if (!ev) break;
        confirmModal(L2([`Hapus bukti ${Number(i) + 1} skenario ${no}?`, `Delete evidence ${Number(i) + 1} of scenario ${no}?`]), esc(L2([ev.type === 'image' ? 'Foto bukti ini akan dihapus dari browser ini.' : 'Bukti otomatis ini akan dihapus dari browser ini.', ev.type === 'image' ? 'This evidence photo will be deleted from this browser.' : 'This auto evidence will be deleted from this browser.'])), L2(['Hapus bukti', 'Delete evidence']), () => {
          const at = it.evidence.indexOf(ev); if (at < 0) return; it.evidence.splice(at, 1); it.updatedAt = Date.now(); saveScn();
          toast(L2(['Bukti dihapus.', 'Evidence deleted.']), { action: { label: L2(['Urungkan', 'Undo']), run: () => { it.evidence.splice(Math.min(at, it.evidence.length), 0, ev); it.updatedAt = Date.now(); saveScn(); render(); } } });
        }, { undo: 'any' });
        break;
      }
      case 'scn-ev-view': { const [no, i] = id.split(':'); const ev = scnPeek(Number(no)).evidence[Number(i)]; if (ev) openModal(`${L2(['Bukti skenario', 'Scenario evidence'])} ${no}`, `<img class="bs-scn-full" src="${ev.data}" alt="${esc(L2(['Foto bukti', 'Evidence photo']))}">`, { wide: true, footer: btn(L2(['Tutup', 'Close']), 'modal-close', { variant: 'primary' }) }); break; }
      case 'scn-export': {
        const rows = [['No', 'Kelompok', 'Skenario', 'Hasil yang diharapkan', 'Prioritas', 'Catatan dokumen', 'Hasil pengujian', 'Catatan penguji', 'Bukti dicentang', 'Bukti otomatis', 'Jumlah foto', 'Diperbarui', 'Penguji', 'Instansi', 'Mode']];
        CONTENT.scenarios.forEach(x => { const it = scnPeek(x.no), res = SCN_RESULTS.find(y => y[0] === it.result); rows.push([x.no, (CONTENT.scenarioGroups.find(g => g.id === x.group) || {}).title?.[0] || x.group, x.title[0], x.expected[0], 'Mandatory', x.note[0], res ? res[1][0] : 'Belum diuji', it.notes || '', `${x.evidence.filter((_, i) => it.checks[i]).length}/${x.evidence.length}`, it.evidence.filter(e => e.type === 'auto').map(e => e.text).join('\n---\n'), it.evidence.filter(e => e.type === 'image').length, fmtStamp(it.updatedAt), app.scn.tester, app.scn.org, isLive() ? 'Live' : 'Demo']); });
        downloadCSV(`hasil-scenario-test-${new Date().toISOString().slice(0, 10)}.csv`, rows);
        toast(L2(['Laporan hasil Scenario Test diunduh.', 'Scenario Test results downloaded.']), { tone: 'good' });
        break;
      }
      case 'scn-print': { const prev = new Set(ui.scn.open), prevGroup = ui.scn.group; ui.scn.group = ''; CONTENT.scenarios.forEach(x => ui.scn.open.add(x.no)); render(); setTimeout(() => { window.print(); ui.scn.open = prev; ui.scn.group = prevGroup; render(); }, 60); break; }
      case 'scn-reset': confirmModal(L2(['Reset semua hasil Scenario Test?', 'Reset all Scenario Test results?']), L2(['Semua hasil, catatan, dan bukti pengujian di browser ini akan dihapus.', 'All results, notes, and evidence in this browser will be deleted.']), L2(['Reset hasil', 'Reset results']), () => { app.scn = { tester: app.scn.tester, org: app.scn.org, items: {} }; saveScn(); toast(L2(['Hasil Scenario Test direset.', 'Scenario Test results reset.'])); }); break;
      case 'report-reset': resetFilters('report'); render(); break;
      case 'reset-filters': { if (id !== 'loc' && !CHIP_DEFS[id]) break; resetFilters(id); render(); announceResults(); shell.querySelector('#bsPage [data-search]')?.focus(); break; }
      case 'unset-filter': {
        const [a, b] = id.split('.'), def = (CHIP_DEFS[a] || []).find(d => d[0] === b);
        if (a === 'loc' && b === 'q') { ui.loc.q = ''; ui.loc.page = 1; } else if (def) { ui[a][b] = def[3] ?? ''; if (a === 'reviews') ui.reviews.limit = 20; } else break;
        render(); (shell.querySelector('#bsPage .bs-chips .bs-chip') || shell.querySelector('#bsPage [data-search]'))?.focus(); break;
      }
      case 'report-region': ui.report.region = ui.report.region === id ? '' : id; render(); $('bsMain').scrollTop = 0; break;
      case 'report-schedule': reportScheduleModal(); break;
      case 'report-unschedule': { const x = app.state.reportSchedules.find(y => y.id === id); if (!x) break; confirmModal(`Hapus jadwal “${x.name}”?`, 'Laporan ini tidak akan dikirim lagi ke penerima.', 'Hapus jadwal', () => { const snap = snapshot(); app.state.reportSchedules = app.state.reportSchedules.filter(y => y !== x); log('Laporan & Analitik', 'Menghapus jadwal laporan', { detail: x.name }); remote('DELETE', `/reports/schedules/${encodeURIComponent(id)}`); toast('Jadwal dihapus.', { undo: snap }); }, { undo: true }); break; }
      case 'report-export': {
        const sc = reportScope(), bk = reportBuckets(ui.report.period), cur = reportMetrics(bk.from, bk.to, sc), im = issueMap();
        const rows = [['Laporan BranchSync'], ['Periode', fmtStamp(bk.from, true), fmtStamp(bk.to - DAY, true)], ['Cakupan', [ui.report.region, ui.report.account, ui.report.type].filter(Boolean).join(' · ') || 'Seluruh jaringan'], [],
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
      case 'export-reviews': { const xs = reviewFiltered(); downloadCSV('ulasan-google.csv', [['ID', 'Akun', 'Kode', 'Lokasi', 'Penulis', 'Rating', 'Ulasan', 'Waktu', 'Balasan', 'Dibalas oleh', 'Waktu balasan'], ...xs.map(rv => { const lo = byCode().get(rv.code); return [rv.id, (app.state.accounts.find(a => a.id === acctOf(lo)) || {}).name || '', rv.code, lo ? lo.name : '', rv.author, rv.rating, rv.text, fmtStamp(rv.time), rv.reply ? rv.reply.text : '', rv.reply ? rv.reply.by : '', rv.reply ? fmtStamp(rv.reply.time) : '']; })]); toast(`${fmtNum(xs.length)} ulasan diekspor.`, { tone: 'good' }); break; }
      case 'simulate-review': {
        const rr = rng(Date.now() % 1e6), lo = pick(rr, app.state.locations.filter(x => x.status !== 'Tidak Aktif')), x = rr(), rating = x < 0.35 ? 5 : x < 0.55 ? 4 : x < 0.7 ? 3 : x < 0.85 ? 2 : 1;
        const rv = { id: `RV-${String(++app.state.seq.review).padStart(4, '0')}`, code: lo.code, author: pick(rr, AUTHORS), rating, text: pick(rr, REVIEW_TEXTS[rating]), time: Date.now(), reply: null };
        app.state.reviews.unshift(rv);
        log('Ulasan', 'Ulasan baru masuk dari Google Maps', { target: lo.code, user: rv.author, actor: 'Eksternal', detail: `${rating}★` });
        touch(); render();
        toast(`Ulasan baru ${rating}★ untuk ${lo.name}.`, { tone: rating <= 2 ? 'warn' : 'info', action: { label: 'Balas', run: () => { ui.reviews.account = acctOf(lo); ui.reviews.location = lo.code; ui.reviews.editing = rv.id; ui.reviews.drafts[rv.id] = ''; navigate('reviews'); } } });
        break;
      }
      // Integrasi Google
      case 'gbp-oauth':
        if (isLive()) { location.assign(`${MODE.getBaseUrl()}/integrations/google/oauth/start?redirect_uri=${encodeURIComponent(location.href.split('#')[0])}`); break; }
        if (!app.state.api.clientId || !app.state.api.hasClientSecret) { toast('Isi OAuth Client ID dan Client Secret lalu simpan konfigurasi terlebih dahulu.', { tone: 'warn' }); $('g-clientId')?.focus(); break; }
        app.state.api.connected = true; app.state.api.lastTest = Date.now(); log('Integrasi Google', 'Menghubungkan akun Google (simulasi)', { detail: app.state.api.account }); touch(); render(); toast('Akun Google terhubung (simulasi).', { tone: 'good' });
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
        const doDelete = () => { const snap = snapshot(); app.state.locations = app.state.locations.filter(x => x !== l); ui.loc.selected.delete(id); log('Unit Kerja', 'Menghapus unit', { target: id, detail: l.name }); touch(); if (sheet.open) sheet.close(); render(); toast(`${l.name} dihapus.`, { undo: snap }); remote('DELETE', `/locations/${encodeURIComponent(id)}`); };
        confirmModal(`Hapus “${l.name}”?`, `Unit ${esc(l.code)} · ${esc(l.type)} · ${esc(l.city)} akan dihapus dari Dashboard${isLive() ? ' dan server' : ''}.`, 'Hapus unit', doDelete, { undo: true });
      } break;
      case 'sort': ui.loc.dir = ui.loc.sort === id ? -ui.loc.dir : 1; ui.loc.sort = id; render(); break;
      case 'quick': ui.loc.quick = id; ui.loc.page = 1; render(); announceResults(); break;
      case 'page': ui.loc.page = Number(id); render(); $('bsMain').querySelector('.bs-table-wrap')?.scrollIntoView({ block: 'nearest' }); break;
      case 'unfilter': { const [k, v] = id.split(/:(.*)/s); ui.loc[k] = ui.loc[k].filter(x => x !== v); ui.loc.page = 1; render(); break; }
      case 'clear-filters': FILTERS.forEach(([k]) => { ui.loc[k] = []; }); ui.loc.page = 1; render(); break;
      case 'clear-all': FILTERS.forEach(([k]) => { ui.loc[k] = []; }); ui.loc.q = ''; ui.loc.quick = 'all'; ui.loc.page = 1; render(); break;
      case 'close-filter': case 'close-pop': ui.pop = ''; render(); break;
      case 'goto-filter': { const [k, v] = id.split(/:(.*)/s); FILTERS.forEach(([f]) => { ui.loc[f] = []; }); ui.loc.q = ''; ui.loc.quick = 'all'; ui.loc[k] = [v]; navigate('locations'); break; }
      case 'select': ui.loc.selected[el.checked ? 'add' : 'delete'](id); render(); break;
      case 'select-page': { const size = Number(prefs.pageSize) || 10, rows = locFiltered().slice((ui.loc.page - 1) * size, ui.loc.page * size); rows.forEach(r => ui.loc.selected[el.checked ? 'add' : 'delete'](r.code)); render(); break; }
      case 'select-all': locFiltered().forEach(r => ui.loc.selected.add(r.code)); render(); announce(`${fmtNum(ui.loc.selected.size)} unit dipilih.`); break;
      case 'clear-selection': ui.loc.selected.clear(); render(); announce('Pilihan dibatalkan.'); shell.querySelector('#bsPage [data-search]')?.focus(); break;
      case 'bulk-sync': runSync([...ui.loc.selected], { label: `${ui.loc.selected.size} unit terpilih` }); break;
      case 'bulk-export': exportLocations(app.state.locations.filter(x => ui.loc.selected.has(x.code)), 'branchsync-unit-terpilih'); break;
      case 'export-csv': case 'export-xlsx': {
        const sel = id === 'sel', fmt = action === 'export-xlsx' ? 'xlsx' : 'csv';
        ui.pop = ''; shell.querySelector('[data-pop^="export-"][open]')?.removeAttribute('open');
        exportLocations(sel ? app.state.locations.filter(x => ui.loc.selected.has(x.code)) : locFiltered(), sel ? 'branchsync-unit-terpilih' : 'branchsync-unit-kerja', fmt);
        break;
      }
      case 'bulk-delete': { const n = ui.loc.selected.size; const names = app.state.locations.filter(x => ui.loc.selected.has(x.code)).slice(0, 5).map(x => `<li>${esc(x.name)} <small>${esc(x.code)}</small></li>`).join('');
        confirmModal(`Hapus ${fmtNum(n)} unit terpilih?`, `<p>Unit kerja berikut akan dihapus dari Dashboard${isLive() ? ' dan server' : ''}:</p><ul class="bs-confirm-list">${names}${n > 5 ? `<li class="bs-muted">dan ${fmtNum(n - 5)} unit lainnya</li>` : ''}</ul>`, `Hapus ${fmtNum(n)} unit`, () => { const snap = snapshot(), codes = [...ui.loc.selected]; remote('POST', '/locations/bulk-delete', { codes }); app.state.locations = app.state.locations.filter(x => !ui.loc.selected.has(x.code)); log('Unit Kerja', 'Menghapus unit massal', { detail: `${n} unit` }); ui.loc.selected.clear(); touch(); toast(`${fmtNum(n)} unit dihapus.`, { undo: snap }); }, { undo: true }); break; }
      case 'export-locs': exportLocations(locFiltered()); break;
      case 'import': app.importDraft = null; importModal(); break;
      case 'import-template': download('template-impor-unit-kerja.csv', '\ufeff' + sampleCSV(3), 'text/csv;charset=utf-8'); break;
      case 'import-template-xlsx': xlsxTemplate().catch(e => toast(e.message, { tone: 'bad' })); break;
      case 'import-sample': app.importDraft = { stage: 'input', text: sampleCSV(25) }; importModal(); break;
      case 'import-parse': {
        const text = $('bsImportText').value;
        if (!text.trim()) { app.importDraft = { stage: 'input', text, error: 'Tempel data CSV atau pilih file Excel/CSV terlebih dahulu.' }; importModal(); $('bsImportText')?.focus(); break; }
        startMapping(parseCSV(text), { name: 'Data yang ditempel', kind: 'paste' }, text);
        modal.querySelector('select[data-import-map], .bs-form-error')?.focus();
        break;
      }
      case 'import-check': app.importDraft.items = analyzeRows(app.importDraft); app.importDraft.stage = 'review'; importModal(); modal.querySelector('.bs-import-summary')?.scrollIntoView({ block: 'nearest' }); break;
      case 'import-back': app.importDraft.stage = app.importDraft.stage === 'review' ? 'map' : 'input'; importModal(); break;
      case 'import-errors': importErrorsCSV(); break;
      case 'import-commit': commitImport(); break;
      // Peta
      case 'map-focus': {
        const mk = app.mapMarkers.get(id);
        if (l && app.mapObj && mk && app.mapLayer.zoomToShowLayer) app.mapLayer.zoomToShowLayer(mk, () => mk.openPopup());
        else if (l && app.mapObj) { app.mapObj.flyTo([l.lat, l.lng], 15, { duration: 0.6 }); mk?.openPopup(); } else if (l) openDrawer(id);
        break;
      }
      case 'map-more': ui.map.limit = (ui.map.limit || 300) + 300; updateMap(false); $('bsMapList')?.querySelectorAll('li')[ui.map.limit - 300]?.querySelector('button')?.focus(); break;
      case 'dup-more': ui.dups.limit += 30; render(); break;
      // Sinkronisasi
      case 'sync-all': runSync(null); break;
      case 'sync-one': if (l) runSync([id], { label: l.name, retry: true }); break;
      case 'retry': runSync([id], { retry: true, label: `Coba ulang ${id}` }); break;
      case 'retry-all': runSync(openFailures().map(f => f.code), { retry: true, label: 'Coba ulang kegagalan' }); break;
      case 'resolve': { const f = openFailures().find(x => x.code === id); if (f) noteModal('Catat tindak lanjut', `Tindak lanjut untuk ${locName(id)} — ${f.reason}`, t => { f.ref.resolved = true; f.ref.note = `${t} — ${app.ME.name}`; log('Sync Monitor', 'Mencatat tindak lanjut kegagalan', { target: id, detail: t }); remote('POST', '/sync/failures/resolve', { code: id, run: f.run, note: t }); toast('Kegagalan ditandai sudah ditangani.', { tone: 'good' }); }); break; }
      // Ketidaksesuaian
      case 'disc-push': case 'disc-pull': { const snap = snapshot(); resolveDisc(id, action === 'disc-push'); touch(); render(); toast(action === 'disc-push' ? 'Data Dashboard dikirim ke Google (simulasi).' : 'Data Google diterapkan ke Dashboard.', { tone: 'good', undo: snap }); break; }
      case 'disc-push-all': { const rows = discRows(); confirmModal('Pakai data Dashboard untuk semua?', `${rows.length} perbedaan yang tampil akan diselesaikan dengan mengirim data Dashboard ke Google.`, `Kirim ${rows.length} perubahan`, () => { const snap = snapshot(); remote('POST', '/discrepancies/resolve-bulk', { source: 'dashboard', items: rows.map(r => ({ code: r.l.code, field: r.field })) }); rows.forEach(r => resolveDisc(`${r.l.code}|${r.field}`, true, false)); toast(`${rows.length} perbedaan diselesaikan.`, { tone: 'good', undo: snap }); }, { danger: false }); break; }
      case 'disc-note': noteModal('Catat temuan ketidaksesuaian', 'Catatan / dokumentasi', t => { app.state.discNotes[id] = { text: t, by: app.ME.name, time: Date.now() }; remote('PUT', '/discrepancies/notes', { code: id.split('|')[0], field: id.split('|')[1], text: t }); log('Ketidaksesuaian', 'Mendokumentasikan temuan', { target: id.split('|')[0], detail: `${FIELD_LABEL[id.split('|')[1]]}: ${t}` }); toast('Catatan disimpan.', { tone: 'good' }); }, app.state.discNotes[id]?.text || ''); break;
      case 'export-disc': { const rows = discRows(); downloadCSV('laporan-ketidaksesuaian.csv', [['Kode', 'Unit', 'Kota', 'Kolom', 'Dashboard', 'Google Maps', 'Selisih (m)', 'Catatan'], ...rows.map(r => [r.l.code, r.l.name, r.l.city, FIELD_LABEL[r.field], r.dash, r.google, r.dist ? Math.round(r.dist) : '', app.state.discNotes[`${r.l.code}|${r.field}`]?.text || ''])]); toast(`Laporan ${rows.length} perbedaan diunduh.`, { tone: 'good' }); break; }
      case 'simulate-google': simulateGoogleChange(); break;
      // Duplikat
      case 'dup-keep': {
        const parts = id.split('|'), side = parts.pop(), p = duplicatePairs().find(x => x.key === parts.join('|'));
        if (!p) break;
        const keep = side === 'a' ? p.a : p.b, drop = side === 'a' ? p.b : p.a;
        confirmModal(`Tandai “${drop.name}” sebagai duplikat?`, `<b>${esc(keep.name)}</b> (${esc(keep.code)}) dipertahankan. <b>${esc(drop.name)}</b> (${esc(drop.code)}) dinonaktifkan dan ditandai Duplikat${isLive() ? ' di Google Business Profile' : ''}.`, 'Tandai duplikat', () => {
        const snap = snapshot();
        log('Duplikat', 'Menggabungkan titik ganda', { target: drop.code, detail: `Dipertahankan: ${keep.name}`, changes: diff(drop, { ...drop, status: 'Tidak Aktif', gbp: 'Duplikat' }, ['status', 'gbp']) });
        Object.assign(drop, { status: 'Tidak Aktif', gbp: 'Duplikat', updatedAt: Date.now(), updatedBy: app.ME.name });
        remote('POST', '/duplicates/merge', { keep: keep.code, drop: drop.code });
        touch(); render(); toast(`${drop.name} ditandai duplikat dari ${keep.name}.`, { tone: 'good', undo: snap });
        }, { undo: true });
        break;
      }
      case 'dup-ignore': app.state.dupIgnored.push(id); remote('POST', '/duplicates/ignore', { a: id.split('|')[0], b: id.split('|')[1] }); log('Duplikat', 'Menandai bukan duplikat', { detail: id.replace('|', ' & ') }); touch(); render(); toast('Pasangan ditandai bukan duplikat.'); break;
      case 'dup-report': { const [a, b] = id.split('|'); claimForm(byCode().get(b)?.gbp === 'Terverifikasi' ? a : b); setTimeout(() => { const s = modal.querySelector('[name=kind]'); if (s) s.value = 'Laporan duplikat'; }, 0); break; }
      // Klaim
      case 'claim-new': claimForm(); break;
      case 'point-new': pointForm(); break;
      case 'claim-next': advanceClaim(id); break;
      case 'claim-reject': noteModal('Tolak permintaan', 'Alasan penolakan', t => { const c = app.state.claims.find(x => x.id === id); c.status = 'Ditolak'; c.note = t; c.doneAt = Date.now(); log('Klaim & Titik Baru', `Menolak ${c.id}`, { target: c.code || c.id, detail: t }); remote('POST', `/claims/${encodeURIComponent(id)}/reject`, { note: t }); toast(`${c.id} ditolak.`); }); break;
      // Persetujuan
      case 'cr-approve': decide(id, true); break;
      case 'cr-reject': decide(id, false); break;
      case 'simulate-edit': simulateEdit(); break;
      // Riwayat & SLA
      case 'export-audit': { const xs = auditFiltered(); downloadCSV('riwayat-perubahan.csv', [['Waktu', 'Pengguna', 'Jenis', 'Modul', 'Aksi', 'Target', 'Detail', 'Kolom', 'Sebelum', 'Sesudah'], ...xs.flatMap(x => (x.changes.length ? x.changes : [{ field: '', before: '', after: '' }]).map(c => [fmtStamp(x.time), x.user, x.actor, x.module, x.action, x.target, x.detail, c.field, c.before, c.after]))]); toast(`${xs.length} aktivitas diekspor.`, { tone: 'good' }); break; }
      case 'export-sla': downloadCSV('laporan-sla.csv', [['ID', 'Jenis', 'Unit', 'Diajukan', 'Proses internal (jam)', 'Verifikasi Google (jam)', 'SLA', 'Status'], ...slaStats().rows.map(({ c, t }) => [c.id, c.kind, claimName(c), fmtStamp(c.submittedAt), (t.internal / HOUR).toFixed(1), t.google == null ? '' : (t.google / HOUR).toFixed(1), t.sla, c.status])]); toast('Laporan SLA diunduh.', { tone: 'good' }); break;
      // Akses
      case 'add-user': userForm(); break;
      case 'edit-user': userForm(id); break;
      case 'toggle-user': { const u = app.state.users.find(x => x.id === Number(id)); if (!u || u.id === 1) break;
        const apply = () => { const snap = snapshot(); u.status = u.status === 'Aktif' ? 'Nonaktif' : 'Aktif'; remote('PATCH', `/users/${encodeURIComponent(u.id)}`, { status: u.status }); log('Pengguna & Akses', `${u.status === 'Aktif' ? 'Mengaktifkan' : 'Menonaktifkan'} pengguna`, { detail: u.name }); touch(); render(); toast(`${u.name} ${u.status.toLowerCase()}.`, { undo: snap }); };
        if (u.status === 'Aktif') confirmModal(`Nonaktifkan ${u.name}?`, `${esc(u.name)} (${esc(u.email)}) tidak bisa masuk ke BranchSync sampai diaktifkan kembali.`, 'Nonaktifkan', apply, { undo: true }); else apply();
        break; }
      case 'add-role': roleForm(); break;
      case 'edit-role': roleForm(id); break;
      // Integrasi
      case 'api-toggle': if (app.state.api.connected && el && !el.dataset.confirmed) { confirmModal('Putuskan Google Business Profile?', `Sinkronisasi dan balasan ulasan ke akun <b>${esc(app.state.api.account || 'Google')}</b> berhenti sampai akun dihubungkan lagi.`, 'Putuskan', () => act('api-toggle', '', { dataset: { confirmed: '1' } }), { undo: 'Anda bisa menghubungkannya lagi kapan saja dari halaman ini.' }); break; }
        app.state.api.connected = !app.state.api.connected; remote('PATCH', '/integrations/google', { connected: app.state.api.connected }); log('Integrasi Google', app.state.api.connected ? 'Menghubungkan GBP' : 'Memutuskan GBP'); touch(); render(); toast(isLive() ? (app.state.api.connected ? 'Permintaan menghubungkan dikirim ke server.' : 'Permintaan memutus dikirim ke server.') : (app.state.api.connected ? 'Terhubung (simulasi).' : 'Koneksi diputus (simulasi).')); break;
      case 'api-test': if (isLive()) { remote('POST', '/integrations/google/test').then(res => { if (res) toast(res.ok === false ? `Uji gagal: ${res.message || 'tidak diketahui'}` : `Uji koneksi Google berhasil${res.latencyMs ? ` — ${res.latencyMs} ms` : ''}.`, { tone: res.ok === false ? 'bad' : 'good' }); }); break; }
        app.state.api.lastTest = Date.now(); log('Integrasi Google', 'Menguji koneksi', { detail: app.state.api.connected ? 'Berhasil' : 'Gagal: belum terhubung' }); touch(); render(); toast(app.state.api.connected ? 'Uji koneksi berhasil — 120 ms (simulasi).' : 'Uji gagal: hubungkan akun terlebih dahulu.', { tone: app.state.api.connected ? 'good' : 'bad' }); break;
      case 'api-reset': app.state.api.quotaUsed = 0; log('Integrasi Google', 'Mereset kuota harian'); touch(); render(); toast('Kuota direset.'); break;
      // Pengaturan
      case 'generate': confirmModal('Buat 1.000 unit uji?', 'Seribu unit kerja sintetis akan ditambahkan untuk menguji performa. Anda bisa menghapusnya lewat “Reset data demo”.', 'Buat 1.000 unit', () => setTimeout(() => generateUnits(1000), 0), { danger: false }); break;
      case 'backup': download(`branchsync-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(app.state, null, 2), 'application/json'); toast('Cadangan diunduh.', { tone: 'good' }); break;
      case 'reset-data': confirmModal('Reset data demo?', 'Semua perubahan, impor, dan riwayat akan dikembalikan ke kondisi awal.', 'Reset data', () => { app.state = buildSeed(); ui.loc.selected.clear(); touch(); toast('Data demo dikembalikan ke kondisi awal.'); }); break;
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
    if (t.dataset.scnMeta) { app.scn[t.dataset.scnMeta] = t.value.slice(0, 80); clearTimeout(scnTimer); scnTimer = setTimeout(saveScn, 400); return; }
    if (t.closest('#bsModal') && (t.name === 'lat' || t.name === 'lng')) { syncPickerFromInputs(); return; }
    if (t.dataset.draft) { ui.reviews.drafts[t.dataset.draft] = t.value; const c = $(`rv-count-${t.dataset.draft}`); if (c) c.textContent = `${t.value.length}/${fmtNum(REPLY_MAX)}`; return; }
    if (!bind || t.type === 'checkbox' || t.tagName === 'SELECT') return;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => { setBind(bind, t.value); if (bind.startsWith('map.')) updateMap(true); else render(); if (t.hasAttribute('data-search')) announceResults(); }, 140);
  });
  shell.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'bsImportFile' && t.files[0]) { readImportFile(t.files[0]); return; }
    if (t.dataset.importMap && app.importDraft) {
      const k = t.dataset.importMap;
      if (t.value === '') delete app.importDraft.map[k]; else app.importDraft.map[k] = Number(t.value);
      importModal(); $(`bsMap-${k}`)?.focus();
      return;
    }
    if (t.dataset.hoursOpen) { const d = app.hoursDraft[t.dataset.hoursOpen]; d.open = t.checked; if (d.open && !d.h24 && !d.ranges.length) d.ranges = [{ from: '08:00', to: '15:00' }]; refreshHours(`[data-hours-open="${t.dataset.hoursOpen}"]`); return; }
    if (t.dataset.hoursAllday) { const d = app.hoursDraft[t.dataset.hoursAllday]; d.h24 = t.checked; if (!d.h24 && !d.ranges.length) d.ranges = [{ from: '08:00', to: '15:00' }]; refreshHours(`[data-hours-allday="${t.dataset.hoursAllday}"]`); return; }
    if (t.dataset.hoursFrom || t.dataset.hoursTo) { const [k, i] = (t.dataset.hoursFrom || t.dataset.hoursTo).split(':'); app.hoursDraft[k].ranges[Number(i)][t.dataset.hoursFrom ? 'from' : 'to'] = t.value; updateHoursSummary(); return; }
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
      const tpl = REPLY_TEMPLATES[Number(t.value)], rv = app.state.reviews.find(x => x.id === t.dataset.id);
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
      app.state.locations.forEach(l => { if (ui.loc.selected.has(l.code) && l.status !== status) { log('Unit Kerja', 'Mengubah status (massal)', { target: l.code, changes: [{ field: 'Status', before: l.status, after: status }] }); l.status = status; l.updatedAt = Date.now(); l.updatedBy = app.ME.name; } });
      remote('POST', '/locations/bulk-update', { codes: [...ui.loc.selected], patch: { status } });
      touch(); render(); toast(`Status ${n} unit diubah menjadi ${status}.`, { tone: 'good', undo: snap });
      return;
    }
    if (t.dataset.filter) {
      const k = t.dataset.filter;
      ui.loc[k] = t.checked ? [...new Set([...ui.loc[k], t.value])] : ui.loc[k].filter(x => x !== t.value);
      ui.loc.page = 1; ui.pop = 'filter'; render(); announceResults();
      return;
    }
    if (t.dataset.perm) {
      if (!guard('users.manage')) { t.checked = !t.checked; return; }
      const r = app.state.roles[Number(t.dataset.role)], p = t.dataset.perm;
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
    if (t.tagName === 'SELECT' && /^(map|disc|audit|reviews)\.(status|region|gbp|field|module|actor|range|account|location)$/.test(bind)) announceResults();
  });
  shell.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    if (form.id === 'bsModalForm') {
      if (!app.modalSubmit) { closeModal(); return; }
      const fd = new FormData(form), p = Object.fromEntries(fd);
      form.querySelectorAll('input[type=checkbox][name]').forEach(c => { if (c.name !== 'perm') p[c.name] = c.checked; });
      const finish = r => { if (r && (typeof r === 'string' || Object.keys(r).length)) { showErrors(r); return; } app.modalSubmit = null; closeModal(); touch(); render(); };
      const res = app.modalSubmit(p, fd);
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
      const changes = diff({ ...app.state.api, scopes: app.state.api.scopes.join(', ') }, { ...next, scopes: next.scopes.join(', ') }, ['project', 'account', 'clientId', 'scopes', 'syncInterval', 'quotaLimit', 'pubsubTopic', 'webhook']);
      if (secret) changes.push({ field: 'Client secret', before: app.state.api.hasClientSecret ? '••••' : '', after: '•••• (baru)' });
      if (apiKey) changes.push({ field: 'API key', before: app.state.api.hasApiKey ? '••••' : '', after: '•••• (baru)' });
      if (!changes.length) { toast('Tidak ada perubahan.'); return; }
      Object.assign(app.state.api, next);
      if (secret) app.state.api.hasClientSecret = true;
      if (apiKey) app.state.api.hasApiKey = true;
      log('Integrasi Google', 'Memperbarui konfigurasi Google API', { changes });
      remote('PATCH', '/integrations/google', { ...next, ...(secret ? { clientSecret: secret } : {}), ...(apiKey ? { apiKey } : {}) });
      touch(); render();
      toast(isLive() ? 'Konfigurasi dikirim ke server.' : `Konfigurasi disimpan${secret || apiKey ? ' (rahasia tidak disimpan di Mode Demo)' : ''}.`, { tone: 'good' });
      return;
    }
    if (form.id === 'bsSettingsForm') {
      if (!guard('settings.write')) return;
      const p = Object.fromEntries(new FormData(form)), s = app.state.settings, errs = [];
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
    app.modalSubmit = null;
    const t = app.modalTrigger; app.modalTrigger = null;
    if (t && (!t.scope || $(t.scope)?.open)) restoreFocus(t);
    if (!shell.contains(document.activeElement) || document.activeElement === document.body) (sheet.open ? sheet.querySelector('.bs-sheet-head button') : $('bsTitle'))?.focus({ preventScroll: true });
  });
  sheet.addEventListener('close', () => {
    ui.drawer = null;
    syncUrl();
    const t = app.sheetTrigger; app.sheetTrigger = null;
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
    // Tab & segmen: ←/→/Home/End memindahkan fokus sekaligus mengaktifkan tab (pola WAI-ARIA, aktivasi otomatis).
    const tabEl = e.target.closest?.('[role="tab"]');
    if (tabEl && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && !e.altKey && !e.metaKey && !e.ctrlKey) {
      const list = [...tabEl.closest('[role="tablist"]').querySelectorAll('[role="tab"]:not([disabled])')], i = list.indexOf(tabEl);
      const next = list[e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
      e.preventDefault();
      if (!next || next === tabEl) return;
      const { action, id } = next.dataset, root = next.closest('dialog') || shell;
      next.focus(); next.click();
      [...root.querySelectorAll(`[role="tab"][data-action="${action}"]`)].find(n => (n.dataset.id || '') === (id || ''))?.focus();
      return;
    }
    // Menu di popover (mis. Ekspor): ↑/↓/Home/End; ↓ dari tombol pembuka masuk ke item pertama.
    const pop = e.target.closest?.('details[data-pop]');
    const menuEl = pop && pop.open ? pop.querySelector('[role="menu"]') : null;
    if (menuEl && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const items = [...menuEl.querySelectorAll('[role="menuitem"]:not([disabled])')], i = items.indexOf(document.activeElement);
      if (items.length) {
        e.preventDefault();
        const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : i < 0 ? (e.key === 'ArrowUp' ? items.length - 1 : 0) : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[j].focus();
        return;
      }
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
});
