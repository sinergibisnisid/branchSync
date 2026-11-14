'use strict';
/*
 * BranchSync Admin — Halaman Dashboard.
 * Modul views/dashboard.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('views/dashboard', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let badge, btn, card, claimActive, dailySync, duplicatePairs, emptyState, esc, fmtDate, fmtNum, go, head, ic, initials, issueMap, LOC, locName,
    metric, openFailures, pct, REGIONS, slaStats, STATUSES, sum, table, TYPES, ui, when;
  app.imports(() => ({ badge, btn, card, claimActive, dailySync, duplicatePairs, emptyState, esc, fmtDate, fmtNum, go, head, ic, initials, issueMap,
    LOC, locName, metric, openFailures, pct, REGIONS, slaStats, STATUSES, sum, table, TYPES, ui, when } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ viewDashboard });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

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
    return `<ol class="bs-timeline">${entries.map(a => `<li><span class="bs-avatar sm" data-actor="${a.actor}" aria-hidden="true">${a.actor === 'Eksternal' ? '@' : initials(a.user)}</span><div><p><strong>${esc(a.user)}</strong> ${esc(a.action.toLowerCase())}${a.target ? ` <button type="button" class="bs-inline-link" data-action="open-target" data-id="${esc(a.target)}">${esc(locName(a.target))}</button>` : ''}</p><small>${esc(a.module)} · ${when(a.time)}${a.actor === 'Eksternal' ? ' · ' + badge('Eksternal') : ''}</small></div></li>`).join('')}</ol>`;
  }
  function viewDashboard() {
    const L = app.state.locations, im = issueMap(), dups = duplicatePairs();
    const verified = L.filter(l => l.gbp === 'Terverifikasi').length;
    const pend = app.state.approvals.filter(a => a.status === 'Menunggu').length;
    const fails = openFailures().length, claimsN = app.state.claims.filter(claimActive).length;
    const sla = slaStats(), daily = dailySync(7);
    const okSum = sum(daily.map(d => d.ok)), failSum = sum(daily.map(d => d.fail)), rate = pct(okSum, okSum + failSum);
    const metrics = [
      metric({ label: 'Total unit kerja', value: fmtNum(L.length), note: TYPES.map(t => `${fmtNum(L.filter(l => l.type === t).length)} ${t === 'Kantor Cabang' ? 'KC' : t}`).join(' · '), icon: 'building', view: 'locations' }),
      metric({ label: 'Terverifikasi di Google', value: pct(verified, L.length) + '%', note: `${fmtNum(verified)} dari ${fmtNum(L.length)} listing`, icon: 'shield', view: 'claims' }),
      metric({ label: 'Sync berhasil · 7 hari', value: rate + '%', note: `${fmtNum(okSum + failSum)} pembaruan`, spark: daily.map(d => pct(d.ok, d.ok + d.fail)), tone: rate < 95 ? 'warn' : 'good', view: 'sync' }),
      metric({ label: 'Kepatuhan SLA internal', value: sla.compliance + '%', note: `Target ≤ ${app.state.settings.slaInternal} jam`, icon: 'gauge', tone: sla.compliance < 80 ? 'warn' : '', view: 'sla' })
    ].join('');
    const queue = [
      { n: pend, icon: 'inbox', tone: 'warn', title: 'Edit dari email GBP lain', text: 'Data tetap aman sampai Anda menyetujui.', view: 'approvals', cta: 'Tinjau' },
      { n: fails, icon: 'refresh', tone: 'bad', title: 'Gagal disinkronkan', text: 'Coba ulang atau catat tindak lanjut.', view: 'sync', cta: 'Tangani' },
      { n: im.size, icon: 'alert', tone: 'warn', title: 'Berbeda dengan Google Maps', text: 'Pilih sumber data yang benar.', view: 'discrepancies', cta: 'Bandingkan' },
      { n: dups.length, icon: 'copy', tone: 'info', title: 'Kemungkinan titik ganda', text: 'Gabungkan atau tandai bukan duplikat.', view: 'duplicates', cta: 'Periksa' },
      { n: claimsN, icon: 'shield', tone: 'info', title: 'Klaim & titik baru berjalan', text: `${sla.atRisk} mendekati atau lewat SLA.`, view: 'claims', cta: 'Pantau' },
      { n: app.state.reviews.filter(rv => !rv.reply).length, icon: 'chat', tone: 'info', title: 'Ulasan Google belum dibalas', text: `${app.state.reviews.filter(rv => !rv.reply && rv.rating <= 2).length} di antaranya ulasan negatif (1–2★).`, view: 'reviews', cta: 'Balas' }
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
    return head(`Selamat datang, ${esc(app.ME.name.split(' ')[0])}`, `${fmtDate(Date.now(), { dateStyle: 'full' })} · Ringkasan ${fmtNum(L.length)} unit kerja di ${regionRows.length} region.`,
      btn('Impor data', 'import', { icon: 'upload' }) + btn(ui.running ? 'Menyinkronkan…' : 'Sinkronkan semua', 'sync-all', { icon: 'refresh', variant: 'primary', attrs: ui.running ? 'disabled' : '' })) +
      `<div class="bs-metrics">${metrics}</div>
      <div class="bs-grid bs-grid-main">${card('Perlu tindakan', queueHtml, { sub: 'Diurutkan dari yang paling mendesak' })}${card('Status operasional', dist, { sub: 'Klik status untuk melihat unitnya' })}</div>
      <div class="bs-grid bs-grid-main">${card('Pembaruan ke Google · 7 hari terakhir', syncChart(daily), { actions: go('Sync Monitor', 'sync') })}${card('Aktivitas terbaru', timeline(app.state.audit.slice(0, 5)), { actions: go('Semua riwayat', 'audit') })}</div>
      ${card('Sebaran per region', tiles, { sub: 'Klik region untuk melihat daftar unitnya', actions: go('Buka peta', 'map') })}`;
  }
});
