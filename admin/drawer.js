'use strict';
/*
 * BranchSync Admin — Panel detail unit (drawer).
 * Modul drawer.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('drawer', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let badge, btn, byCode, diffList, emptyState, esc, FIELD_LABEL, fmtDist, fmtRel, ic, initials, issuesOf, kv, ratingSummary, reviewCard, sheet,
    syncUrl, table, tabPanel, tabs, toast, ui, when, whenFull;
  app.imports(() => ({ badge, btn, byCode, diffList, emptyState, esc, FIELD_LABEL, fmtDist, fmtRel, ic, initials, issuesOf, kv, ratingSummary,
    reviewCard, sheet, syncUrl, table, tabPanel, tabs, toast, ui, when, whenFull } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ openDrawer, renderDrawer });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * Drawer detail unit
   * ------------------------------------------------------------------ */
  function openDrawer(code, tab = 'overview') {
    if (!byCode().has(code)) { toast('Unit tidak ditemukan atau sudah dihapus.', { tone: 'warn' }); return; }
    ui.drawer = { code, tab };
    renderDrawer();
    if (!sheet.open) { app.sheetTrigger = document.activeElement; sheet.showModal(); }
    syncUrl();
  }
  app.sheetTrigger = null;
  function renderDrawer() {
    if (!ui.drawer) return;
    const l = byCode().get(ui.drawer.code);
    if (!l) { if (sheet.open) sheet.close(); ui.drawer = null; return; }
    const iss = issuesOf(l), t = ui.drawer.tab;
    const hist = app.state.audit.filter(a => a.target === l.code);
    const syncItems = app.state.runs.flatMap(r => r.items.filter(i => i.code === l.code).map(i => ({ ...i, run: r.id, time: r.time }))).slice(0, 20);
    let body = '';
    if (t === 'overview') {
      body = kv([['Kode', esc(l.code)], ['Tipe', esc(l.type)], ['Alamat', esc(l.address)], ['Kota / provinsi', `${esc(l.city)}, ${esc(l.province)}`], ['Region', esc(l.region)], ['Telepon', esc(l.phone)], ['Jam operasional', esc(l.hours)],
        ['Koordinat', `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)} <a class="bs-inline-link" href="https://www.google.com/maps?q=${l.lat},${l.lng}" target="_blank" rel="noopener noreferrer">Buka di Google Maps ${ic('external')}</a>`],
        ['Sinkron terakhir', l.lastSync ? whenFull(l.lastSync) : 'Belum pernah'], ['Diperbarui', `${whenFull(l.updatedAt)}<small>oleh ${esc(l.updatedBy)}</small>`]]);
    } else if (t === 'compare') {
      const g = l.google;
      body = !g ? emptyState('Belum ada listing Google', 'Sinkronkan unit atau ajukan titik baru untuk membuat listing.', btn('Sinkronkan sekarang', 'sync-one', { id: l.code, icon: 'refresh', variant: 'sm' }), 'info') :
        `<table class="bs-table bs-compare"><thead><tr><th scope="col">Kolom</th><th scope="col">Dashboard</th><th scope="col">Google Maps</th></tr></thead><tbody>${['name', 'phone', 'hours', 'address', 'coords'].map(f => {
          const i = iss.find(x => x.field === f), dv = f === 'coords' ? `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}` : l[f], gv = f === 'coords' ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` : g[f];
          return `<tr class="${i ? 'is-diff' : ''}"><th scope="row">${FIELD_LABEL[f]}${i ? `<small class="bs-diff-flag">${ic('alert')}Beda${i.dist ? ' ' + fmtDist(i.dist) : ''}</small>` : `<small class="bs-ok">${ic('check')}Sesuai</small>`}</th><td>${esc(dv)}</td><td>${esc(gv)}${i ? `<div class="bs-btn-row">${btn('Pakai Dashboard', 'disc-push', { id: `${l.code}|${f}`, variant: 'sm' })}${btn('Pakai Google', 'disc-pull', { id: `${l.code}|${f}`, variant: 'sm ghost' })}</div>` : ''}</td></tr>`;
        }).join('')}</tbody></table>`;
    } else if (t === 'reviews') {
      const rvs = app.state.reviews.filter(rv => rv.code === l.code).sort((a, b) => b.time - a.time);
      body = rvs.length ? ratingSummary(rvs, false) + `<div class="bs-btn-row">${btn('Buka di halaman Ulasan', 'review-open-loc', { id: l.code, icon: 'star', variant: 'sm' })}</div><div class="bs-review-list in-drawer">${rvs.map(rv => reviewCard(rv, { showLoc: false })).join('')}</div>` : emptyState('Belum ada ulasan', 'Lokasi ini belum memiliki ulasan di Google Maps.', '', 'star');
    } else if (t === 'history') {
      body = hist.length ? `<ol class="bs-timeline">${hist.map(a => `<li><span class="bs-avatar sm" data-actor="${a.actor}" aria-hidden="true">${a.actor === 'Eksternal' ? '@' : initials(a.user)}</span><div><p><strong>${esc(a.user)}</strong> ${esc(a.action.toLowerCase())}</p><small>${whenFull(a.time)} · ${esc(a.module)}</small>${a.changes.length ? diffList(a.changes) : ''}${a.detail ? `<small>${esc(a.detail)}</small>` : ''}</div></li>`).join('')}</ol>` : emptyState('Belum ada riwayat', 'Perubahan pada unit ini akan tercatat di sini.', '', 'history');
    } else {
      body = syncItems.length ? table(['Job', 'Hasil', 'Penyebab'], syncItems.map(i => `<tr><td>${esc(i.run)}<small>${when(i.time)}</small></td><td>${badge(i.status)}${i.resolved && i.status === 'Gagal' ? `<small>${badge('Ditangani')}</small>` : ''}</td><td class="bs-td-wrap">${esc(i.reason)}${i.note ? `<small>${esc(i.note)}</small>` : ''}</td></tr>`)) : emptyState('Tidak ada masalah sinkronisasi', l.lastSync ? `Sinkron terakhir ${fmtRel(l.lastSync)} berhasil.` : 'Unit belum pernah disinkronkan.');
    }
    sheet.innerHTML = `<div class="bs-sheet-inner">
      <header class="bs-sheet-head"><div><p class="bs-eyebrow">${esc(l.code)} · ${esc(l.type)}</p><h2 id="bsDrawerTitle">${esc(l.name)}</h2><div class="bs-badges">${badge(l.status)}${badge(l.gbp)}${iss.length ? `<span class="bs-badge" data-tone="warn"><i></i>${iss.length} beda dengan Google</span>` : ''}</div></div>${btn('', 'sheet-close', { icon: 'x', variant: 'icon ghost', title: 'Tutup' })}</header>
      ${tabs('drawer.tab', [['overview', 'Ringkasan'], ['compare', 'Bandingkan Google', iss.length || null], ['reviews', 'Ulasan', app.state.reviews.filter(rv => rv.code === l.code).length], ['history', 'Riwayat', hist.length], ['sync', 'Sinkronisasi']], t, 'Detail unit')}
      ${tabPanel('drawer.tab', t, body, 'bs-sheet-body')}
      <footer class="bs-sheet-foot">${btn('Hapus', 'delete-loc', { id: l.code, icon: 'trash', variant: 'danger ghost' })}${btn('', 'copy-link', { icon: 'link', variant: 'icon ghost', title: 'Salin tautan unit ini' })}<span class="bs-spacer"></span>${btn('Sinkronkan', 'sync-one', { id: l.code, icon: 'refresh', attrs: ui.running ? 'disabled' : '' })}${btn('Edit', 'edit-loc', { id: l.code, icon: 'edit', variant: 'primary' })}</footer></div>`;
  }
});
