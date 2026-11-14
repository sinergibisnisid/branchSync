'use strict';
/*
 * BranchSync Admin — Halaman Unit Kerja (tabel, filter, tampilan tersimpan, kolom).
 * Modul views/locations.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('views/locations', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let badge, btn, can, chipBtn, chipRow, deniedMsg, esc, fmtNum, formGrid, GBP, head, ic, isLive, issueMap, labelled, LOC_SORTS, memo, MODE, navItem,
    openModal, opts, prefs, REGIONS, render, searchF, SL, STATUSES, table, toast, TYPES, ui, when;
  app.imports(() => ({ badge, btn, can, chipBtn, chipRow, deniedMsg, esc, fmtNum, formGrid, GBP, head, ic, isLive, issueMap, labelled, LOC_SORTS,
    memo, MODE, navItem, openModal, opts, prefs, REGIONS, render, searchF, SL, STATUSES, table, toast, TYPES, ui, when } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ applySavedView, saveViewModal, locFiltered, viewLocations });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

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
  app.export({ QUICK });
  const FILTERS = [['status', 'Status operasional', STATUSES], ['gbp', 'Status GBP', GBP], ['type', 'Tipe', TYPES], ['region', 'Region', REGIONS]];
  app.export({ FILTERS });
  /* ---------- Preferensi per pengguna (saved views, kolom, kepadatan) ---------- */
  const UPREF_KEY = 'branchSync.admin.userPrefs';
  let uprefsAll = {};
  try { uprefsAll = JSON.parse(localStorage.getItem(UPREF_KEY) || '{}') || {}; } catch (_) { uprefsAll = {}; }
  const userKey = () => `${isLive() ? `live:${MODE.host()}` : 'demo'}:${app.ME.email || app.ME.name}`;
  const up = () => (uprefsAll[userKey()] ||= { views: [], cols: null, density: 'comfortable' });
  app.export({ up });
  const saveUP = () => { try { localStorage.setItem(UPREF_KEY, JSON.stringify(uprefsAll)); } catch (_) { toast('Preferensi tidak dapat disimpan di browser ini.', { tone: 'warn' }); } };
  app.export({ saveUP });
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
    { key: 'lastSync', label: 'Sinkron terakhir', sort: 'lastSync', cell: l => (l.lastSync ? `${when(l.lastSync)}` : '<span class="bs-muted">Belum pernah</span>') },
    { key: 'updated', label: 'Diperbarui', sort: 'updatedAt', cell: l => `${when(l.updatedAt)}<small>${esc(l.updatedBy)}</small>` }
  ];
  const LOC_COLS_DEFAULT = ['unit', 'location', 'status', 'gbp', 'google', 'updated'];
  const visibleCols = () => { const c = up().cols; const set = new Set(Array.isArray(c) && c.length ? c : LOC_COLS_DEFAULT); return LOC_COLS.filter(x => x.required || set.has(x.key)); };
  app.export({ visibleCols });
  const viewFilters = () => { const f = ui.loc; return { q: f.q.trim(), quick: f.quick, status: [...f.status].sort(), region: [...f.region].sort(), type: [...f.type].sort(), gbp: [...f.gbp].sort(), sort: f.sort, dir: f.dir }; };
  const sameFilters = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function filterSummary(v) {
    const parts = [];
    if (v.q) parts.push(`“${v.q}”`);
    if (v.quick && v.quick !== 'all') parts.push((QUICK.find(x => x[0] === v.quick) || ['', v.quick])[1]);
    FILTERS.forEach(([k]) => { if (v[k] && v[k].length) parts.push(v[k].join(', ')); });
    return parts.join(' · ') || 'Semua unit';
  }
  // Performa (Tahap 5): teks pencarian per unit disiapkan sekali per perubahan data (cache dikosongkan touch()).
  const hay = () => memo('hay', () => new Map(app.state.locations.map(l => [l, `${l.name} ${l.code} ${l.city} ${l.province} ${l.address}`.toLowerCase()])));
  const COLLATOR = new Intl.Collator('id', { numeric: true });
  function locMatcher(v) {
    const q = (v.q || '').trim().toLowerCase(), im = issueMap(), quick = (QUICK.find(x => x[0] === v.quick) || QUICK[0])[2], H = hay();
    const fs = FILTERS.filter(([k]) => v[k] && v[k].length).map(([k]) => [k, new Set(v[k])]);
    return l => (!q || H.get(l).includes(q)) && fs.every(([k, set]) => set.has(l[k])) && quick(l, im);
  }
  const viewCount = v => memo(`vc:${JSON.stringify(v)}`, () => app.state.locations.filter(locMatcher(v)).length);
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

  // Hasil filter + urut di-memo per kombinasi filter; dipakai ulang oleh render, pilih semua, ekspor, dan pengumuman.
  function locFiltered() {
    const f = ui.loc, key = `lf:${JSON.stringify([f.q.trim().toLowerCase(), f.quick, FILTERS.map(([k]) => f[k]), f.sort, f.dir])}`;
    return memo(key, () => {
      const xs = app.state.locations.filter(locMatcher(f)), im = issueMap(), k = f.sort, dir = f.dir;
      const val = l => (k === 'issues' ? im.get(l.code)?.length || 0 : k === 'lastSync' ? l.lastSync || 0 : k === 'updatedAt' ? l.updatedAt || 0 : String(l[k] ?? ''));
      const keyed = xs.map(l => [val(l), l]);
      keyed.sort((a, b) => (typeof a[0] === 'number' ? a[0] - b[0] : COLLATOR.compare(a[0], b[0])) * dir);
      return keyed.map(x => x[1]);
    });
  }
  // Menu ekspor CSV / Excel — dipakai di kepala halaman Unit Kerja ('all') dan bilah aksi massal ('sel').
  const exportMenu = scope => `<details class="bs-filter bs-export" data-pop="export-${scope}" ${ui.pop === `export-${scope}` ? 'open' : ''}><summary class="bs-btn${scope === 'sel' ? ' sm' : ''}">${ic('download')}<span>Ekspor</span>${ic('chevD')}</summary>
    <div class="bs-popover bs-export-panel" role="menu" aria-label="Format ekspor"><div class="bs-pop-head" role="presentation"><strong>${scope === 'sel' ? `Ekspor ${fmtNum(ui.loc.selected.size)} unit terpilih` : 'Ekspor hasil filter'}</strong></div>
      <button type="button" class="bs-menu-item sm" role="menuitem" data-action="export-xlsx" data-id="${scope}">${ic('file')}<span><strong>Excel (.xlsx)</strong><small>Kolom rapi, koordinat tersimpan sebagai angka</small></span></button>
      <button type="button" class="bs-menu-item sm" role="menuitem" data-action="export-csv" data-id="${scope}">${ic('file')}<span><strong>CSV</strong><small>Untuk Google Sheets dan sistem lain</small></span></button></div></details>`;
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
    const quickCounts = QUICK.map(([v, l, fn]) => [v, l, memo(`quick:${v}`, () => app.state.locations.filter(x => fn(x, im)).length)]);
    const optCount = (k, v) => memo('optcounts', () => { const m = {}; app.state.locations.forEach(x => FILTERS.forEach(([kk]) => { const key = `${kk}:${x[kk]}`; m[key] = (m[key] || 0) + 1; })); return m; })[`${k}:${v}`] || 0;
    const filterPanel = `<details class="bs-filter" data-pop="filter" ${ui.pop === 'filter' ? 'open' : ''}><summary class="bs-btn">${ic('filter')}<span>Filter${activeFilters.length ? ` (${activeFilters.length})` : ''}</span></summary>
      <div class="bs-popover bs-filter-panel">${FILTERS.map(([k, l, xs]) => `<fieldset><legend>${l}</legend>${xs.map(v => `<label class="bs-checkline"><input type="checkbox" data-filter="${k}" value="${esc(v)}" ${f[k].includes(v) ? 'checked' : ''}><span>${esc(SL(v))}</span><small>${fmtNum(optCount(k, v))}</small></label>`).join('')}</fieldset>`).join('')}
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
      <label class="bs-inline-select"><span class="bs-sr">Ubah status</span><select data-action-change="bulk-status" ${can('locations.write') ? '' : `disabled title="${esc(deniedMsg('locations.write'))}"`}><option value="">Ubah status…</option>${opts(labelled(STATUSES))}</select></label>
      ${btn('Sinkronkan', 'bulk-sync', { icon: 'refresh', variant: 'sm' })}${exportMenu('sel')}${btn('Hapus', 'bulk-delete', { icon: 'trash', variant: 'sm danger' })}
      ${btn('', 'clear-selection', { icon: 'x', variant: 'sm icon ghost', title: 'Batalkan pilihan' })}</div>` : '';
    const pageBtns = [];
    for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - f.page) <= 1) pageBtns.push(p); else if (pageBtns[pageBtns.length - 1] !== '…') pageBtns.push('…');
    return head('Unit Kerja', navItem('locations').desc,
      btn('Impor data', 'import', { icon: 'upload', title: 'Impor dari Excel (.xlsx) atau CSV' }) + exportMenu('all') + btn('Tambah unit', 'add-loc', { icon: 'plus', variant: 'primary' })) +
      `<section class="bs-card bs-loc-card${f.selected.size ? ' has-bulk' : ''}"><div class="bs-card-body flush">
        <div class="bs-segment" role="tablist" aria-label="Tampilan cepat">${quickCounts.map(([v, l, n], i) => `<button type="button" role="tab" aria-selected="${f.quick === v && !activeView}" tabindex="${(activeView ? i === 0 && !pinned.includes(activeView) : f.quick === v) ? 0 : -1}" data-action="quick" data-id="${v}">${l}<span>${fmtNum(n)}</span></button>`).join('')}${pinned.map(v => `<button type="button" role="tab" class="bs-seg-pinned" aria-selected="${activeView === v}" tabindex="${activeView === v ? 0 : -1}" data-action="view-apply" data-id="${esc(v.id)}">${ic('pin')}${esc(v.name)}<span>${fmtNum(viewCount(v.filters))}</span></button>`).join('')}</div>
        <div class="bs-toolbar bs-loc-toolbar">${searchF('loc.q', 'Cari unit kerja', f.q, 'Nama, kode, kota, provinsi, atau alamat…  ( / )', 'bsLocQ')}${filterPanel}${viewsPanel}${colsPanel}
</div>
        <div class="bs-loc-mobilebar bs-mobile-only"><label class="bs-field"><span>Urutkan</span><select data-action-change="loc-sort">${opts(sortOpts, `${f.sort}:${f.dir}`)}</select></label>
          <label class="bs-checkline bs-select-page"><input type="checkbox" class="bs-check" data-action="select-page" ${pageAllSel ? 'checked' : ''}><span>Pilih semua di halaman ini</span></label></div>
        ${chipRow([...(f.q.trim() ? [chipBtn('unset-filter', 'loc.q', 'Kata kunci', f.q.trim())] : []), ...activeFilters.map(([k, l, v]) => chipBtn('unfilter', `${k}:${v}`, l, SL(v)))], 'loc')}
        ${bulk}
        ${table(headCells, body, `<div class="bs-empty-inline">${ic('search')}<strong>Tidak ada unit yang cocok</strong><span>Ubah kata kunci atau ${f.q || activeFilters.length || f.quick !== 'all' ? '<button type="button" class="bs-inline-link" data-action="clear-all">hapus semua filter</button>' : 'tambahkan unit baru'}.</span></div>`, { cls: `bs-table-scroll${dense ? ' is-dense' : ''}` })}
        <div class="bs-pagination">
          <span>Menampilkan <b>${all.length ? (f.page - 1) * size + 1 : 0}–${Math.min(f.page * size, all.length)}</b> dari <b>${fmtNum(all.length)}</b> unit</span>
          <label class="bs-inline-select"><span>Baris</span><select data-bind="prefs.pageSize">${opts([10, 25, 50, 100], size)}</select></label>
          <div class="bs-pager">${btn('', 'page', { id: f.page - 1, icon: 'chevL', variant: 'icon sm', title: 'Halaman sebelumnya', attrs: f.page <= 1 ? 'disabled' : '' })}${pageBtns.map(p => p === '…' ? '<span class="bs-ellipsis">…</span>' : `<button type="button" class="bs-btn sm${p === f.page ? ' is-current' : ''}" data-action="page" data-id="${p}" ${p === f.page ? 'aria-current="page"' : ''}>${p}</button>`).join('')}${btn('', 'page', { id: f.page + 1, icon: 'chev', variant: 'icon sm', title: 'Halaman berikutnya', attrs: f.page >= pages ? 'disabled' : '' })}</div>
        </div></div></section>`;
  }
});
