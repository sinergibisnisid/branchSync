'use strict';
/*
 * BranchSync Admin — Halaman Laporan & Analitik.
 * Modul views/reports.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('views/reports', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let acctOf, bar, btn, card, claimTimes, DAY, emptyState, esc, filterChips, fmtDate, fmtDur, fmtNum, formGrid, GBP, go, guard, head, ic, isLive,
    issueMap, LOC, locName, log, navItem, openModal, pct, REGIONS, remote, selectF, SL, stars, STATUSES, sum, table, toast, TONE, TYPES, ui,
    withLabels;
  app.imports(() => ({ acctOf, bar, btn, card, claimTimes, DAY, emptyState, esc, filterChips, fmtDate, fmtDur, fmtNum, formGrid, GBP, go, guard,
    head, ic, isLive, issueMap, LOC, locName, log, navItem, openModal, pct, REGIONS, remote, selectF, SL, stars, STATUSES, sum, table, toast, TONE,
    TYPES, ui, withLabels } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ reportScope, reportBuckets, reportMetrics, viewReports, reportScheduleModal });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * View: Laporan & Analitik
   * ------------------------------------------------------------------ */
  const PERIODS = [['7', '7 hari terakhir'], ['30', '30 hari terakhir'], ['90', '90 hari terakhir']];
  const FREQ = { weekly: 'Mingguan', monthly: 'Bulanan' };
  const WEEKDAYS = [['1', 'Senin'], ['2', 'Selasa'], ['3', 'Rabu'], ['4', 'Kamis'], ['5', 'Jumat']];
  function reportScope() {
    const f = ui.report;
    const locs = app.state.locations.filter(l => (!f.region || l.region === f.region) && (!f.account || acctOf(l) === f.account) && (!f.type || l.type === f.type));
    return { locs, codes: new Set(locs.map(l => l.code)), filtered: !!(f.region || f.account || f.type) };
  }
  function reportBuckets(period) {
    const days = Number(period) || 30, size = days > 30 ? 7 : 1, n = Math.ceil(days / size);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = today.getTime() + DAY, list = [];
    for (let i = n - 1; i >= 0; i--) { const to = end - i * size * DAY; list.push({ from: to - size * DAY, to }); }
    return { list, size, from: list[0].from, to: end };
  }
  function reportMetrics(from, to, sc) {
    const inR = t => t != null && t >= from && t < to;
    const runs = app.state.runs.filter(r => inR(r.time)), active = sc.locs.filter(l => l.status !== 'Tidak Aktif').length;
    let ok = 0, fail = 0;
    runs.forEach(r => {
      if (!sc.filtered) { ok += r.ok; fail += r.fail; return; }
      const f2 = r.items.filter(i => i.status === 'Gagal' && sc.codes.has(i.code)).length;
      fail += f2; ok += Math.max(0, active - f2);
    });
    const rvs = app.state.reviews.filter(rv => inR(rv.time) && sc.codes.has(rv.code)), replied = rvs.filter(rv => rv.reply);
    const resp = replied.map(rv => rv.reply.time - rv.time).filter(x => x >= 0);
    const claims = app.state.claims.filter(c => inR(c.submittedAt) && c.status !== 'Ditolak' && (!sc.filtered || (c.code && sc.codes.has(c.code))));
    const audit = app.state.audit.filter(a => inR(a.time));
    const resolved = audit.filter(a => a.module === 'Ketidaksesuaian' && /^(Mengirim|Menerapkan)/.test(a.action) && (!sc.filtered || sc.codes.has(a.target))).length;
    return {
      runs, ok, fail, rate: ok + fail ? (ok / (ok + fail)) * 100 : null, rvs,
      avgRating: rvs.length ? sum(rvs.map(r => r.rating)) / rvs.length : null,
      replyRate: rvs.length ? (replied.length / rvs.length) * 100 : null,
      avgResp: resp.length ? sum(resp) / resp.length : null,
      claims, sla: claims.length ? (claims.filter(c => claimTimes(c).sla !== 'Lewat SLA').length / claims.length) * 100 : null,
      resolved, audit
    };
  }
  function kpiTile(label, cur, prev, { fmt, delta, better = 'up', icon = '' }) {
    const d = cur != null && prev != null ? cur - prev : null;
    const tone = d == null || Math.abs(d) < 1e-9 ? 'flat' : (d > 0) === (better === 'up') ? 'good' : 'bad';
    const arrow = d == null ? '' : d > 0 ? '▲' : d < 0 ? '▼' : '■';
    return `<article class="bs-metric bs-kpi"><div class="bs-metric-head"><span>${label}</span>${icon ? ic(icon) : ''}</div><div class="bs-metric-body"><div><strong>${cur == null ? '—' : fmt(cur)}</strong><small>${d == null ? 'Belum ada data pembanding' : `<span class="bs-delta" data-tone="${tone}">${arrow} ${delta(Math.abs(d))}</span> vs periode sebelumnya`}</small></div></div></article>`;
  }
  function columnChart(rows, { series, labelEvery = 1 }) {
    const max = Math.max(1, ...rows.map(r => sum(series.map(sr => r.values[sr.key] || 0))));
    const step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
    const cols = rows.map((r, i) => {
      const tot = sum(series.map(sr => r.values[sr.key] || 0)), edge = i < 2 ? ' edge-l' : i > rows.length - 3 ? ' edge-r' : '';
      return `<div class="bs-col${edge}" tabindex="0" aria-label="${esc(r.full)}: ${series.map(sr => `${sr.label} ${fmtNum(r.values[sr.key] || 0)}`).join(', ')}">
        <div class="bs-col-stack" style="height:${(tot / top) * 100}%">${[...series].reverse().map(sr => (r.values[sr.key] ? `<span class="${sr.cls}" style="flex:${r.values[sr.key]}"></span>` : '')).join('')}</div>
        <div class="bs-tip" role="tooltip"><strong>${esc(r.full)}</strong>${series.map(sr => `<span><i class="${sr.dot}"></i>${sr.label} <b>${fmtNum(r.values[sr.key] || 0)}</b></span>`).join('')}</div>
        <small>${i % labelEvery === 0 ? esc(r.label) : ''}</small></div>`;
    }).join('');
    return (series.length > 1 ? `<div class="bs-legend">${series.map(sr => `<span><i class="${sr.dot}"></i>${sr.label}</span>`).join('')}</div>` : '') +
      `<div class="bs-chart"><div class="bs-axis">${[top, top / 2, 0].map(t => `<span>${fmtNum(t)}</span>`).join('')}</div><div class="bs-plot bs-plot-dense">${cols}</div></div>` +
      `<details class="bs-table-toggle"><summary>Lihat sebagai tabel</summary>${table(['Periode', ...series.map(sr => sr.label)], rows.map(r => `<tr><td>${esc(r.full)}</td>${series.map(sr => `<td>${fmtNum(r.values[sr.key] || 0)}</td>`).join('')}</tr>`))}</details>`;
  }
  function lineChart(rows, { min = 1, max = 5, fmt = v => v.toFixed(1), labelEvery = 1, label = 'Nilai' }) {
    const n = rows.length, pts = rows.map((r, i) => (r.value == null ? null : [((i + 0.5) / n) * 100, 100 - ((r.value - min) / (max - min)) * 100]));
    const segs = []; let cur = [];
    pts.forEach(pt => { if (pt) cur.push(pt); else if (cur.length) { segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    const ticks = []; for (let v = max; v >= min; v--) ticks.push(v);
    return `<div class="bs-chart bs-line"><div class="bs-axis">${ticks.map(t => `<span>${t}</span>`).join('')}</div><div class="bs-plot bs-plot-dense">
      <svg class="bs-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${segs.map(sg => `<polyline points="${sg.map(pt => pt.map(x => x.toFixed(2)).join(',')).join(' ')}"/>`).join('')}</svg>
      ${rows.map((r, i) => `<div class="bs-col${i < 2 ? ' edge-l' : i > n - 3 ? ' edge-r' : ''}" tabindex="0" aria-label="${esc(r.full)}: ${r.value == null ? 'tidak ada data' : fmt(r.value)}">${r.value == null ? '' : `<i class="bs-pt" style="bottom:${((r.value - min) / (max - min)) * 100}%"></i>`}
        <div class="bs-tip" role="tooltip"><strong>${esc(r.full)}</strong><span><i class="s1"></i>${label} <b>${r.value == null ? '—' : fmt(r.value)}</b></span>${r.note ? `<span>${esc(r.note)}</span>` : ''}</div><small>${i % labelEvery === 0 ? esc(r.label) : ''}</small></div>`).join('')}
    </div></div><details class="bs-table-toggle"><summary>Lihat sebagai tabel</summary>${table(['Periode', label], rows.map(r => `<tr><td>${esc(r.full)}</td><td>${r.value == null ? '—' : fmt(r.value)}</td></tr>`))}</details>`;
  }
  const pctTxt = v => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)}%`;
  const ratingTxt = v => new Intl.NumberFormat(LOC(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  function composition(title, keys, counts) {
    const total = sum(keys.map(k => counts[k] || 0));
    return `<div class="bs-comp"><div class="bs-comp-head"><strong>${title}</strong><small>${fmtNum(total)} unit</small></div>
      <div class="bs-comp-bar" role="img" aria-label="${esc(title)}: ${esc(keys.map(k => `${SL(k)} ${counts[k] || 0}`).join(', '))}">${keys.map(k => (counts[k] ? `<span data-tone="${TONE[k] || 'neutral'}" style="flex:${counts[k]}" title="${esc(SL(k))}: ${counts[k]}"></span>` : '')).join('')}</div>
      <ul class="bs-comp-legend">${keys.map(k => `<li><i data-tone="${TONE[k] || 'neutral'}"></i><span>${esc(SL(k))}</span><b>${fmtNum(counts[k] || 0)}</b><small>${pct(counts[k] || 0, total)}%</small></li>`).join('')}</ul></div>`;
  }
  function rankList(rows, emptyMsg, fixedMax) {
    if (!rows.length) return `<p class="bs-muted">${emptyMsg}</p>`;
    const max = fixedMax || Math.max(1, ...rows.map(r => r.n));
    return `<ol class="bs-rank${fixedMax ? ' is-rating' : ''}">${rows.map(r => `<li><div class="bs-rank-top"><span class="bs-rank-label">${r.label}</span><b>${r.value ?? fmtNum(r.n)}</b></div>${bar(r.n, max, `${r.plain || ''}: ${r.n}`)}${r.sub ? `<small>${r.sub}</small>` : ''}</li>`).join('')}</ol>`;
  }
  function viewReports() {
    const f = ui.report, sc = reportScope(), bk = reportBuckets(f.period), span = bk.to - bk.from;
    const cur = reportMetrics(bk.from, bk.to, sc), prev = reportMetrics(bk.from - span, bk.from, sc);
    const accounts = app.state.accounts || [];
    const dLabel = t => new Intl.DateTimeFormat(LOC(), { day: 'numeric', month: 'short' }).format(new Date(t));
    const fullLabel = b => (bk.size === 1 ? new Intl.DateTimeFormat(LOC(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(b.from)) : `${dLabel(b.from)} – ${dLabel(b.to - DAY)}`);
    const labelEvery = bk.list.length > 14 ? 5 : 1;
    // Tren sinkronisasi
    const syncRows = bk.list.map(b => { const m = reportMetrics(b.from, b.to, sc); return { label: dLabel(b.from), full: fullLabel(b), values: { ok: m.ok, fail: m.fail } }; });
    // Ulasan per minggu (selalu mingguan agar rata-rata stabil)
    const wk = []; for (let t = bk.to; t > bk.from; t -= 7 * DAY) wk.unshift({ from: Math.max(bk.from, t - 7 * DAY), to: t });
    const wkRows = wk.map(b => { const xs = app.state.reviews.filter(rv => rv.time >= b.from && rv.time < b.to && sc.codes.has(rv.code)); return { b, xs }; });
    const wkFull = b => `${dLabel(b.from)} – ${dLabel(b.to - 1)}`;
    const volRows = wkRows.map(({ b, xs }) => ({ label: dLabel(b.from), full: wkFull(b), values: { n: xs.length } }));
    const ratRows = wkRows.map(({ b, xs }) => ({ label: dLabel(b.from), full: wkFull(b), value: xs.length ? sum(xs.map(x => x.rating)) / xs.length : null, note: `${xs.length} ulasan` }));
    // Kinerja per region
    const im = issueMap();
    const regionRows = REGIONS.map(r => {
      const ls = sc.locs.filter(l => l.region === r); if (!ls.length) return '';
      const codes = new Set(ls.map(l => l.code)), rv = cur.rvs.filter(x => codes.has(x.code));
      const on = pct(ls.filter(l => l.status === 'Online').length, ls.length), ver = pct(ls.filter(l => l.gbp === 'Terverifikasi').length, ls.length);
      const iss = ls.filter(l => im.has(l.code)).length, avg = rv.length ? sum(rv.map(x => x.rating)) / rv.length : null, rep = rv.length ? pct(rv.filter(x => x.reply).length, rv.length) : null;
      const cell = (v, warnBelow) => (v == null ? '<span class="bs-muted">—</span>' : `<span class="bs-cell-bar${v < warnBelow ? ' is-low' : ''}"><span style="width:${v}%"></span></span><b>${v}%</b>`);
      return `<tr><th scope="row"><button type="button" class="bs-inline-link" data-action="report-region" data-id="${esc(r)}">${esc(r)}</button></th><td>${fmtNum(ls.length)}</td><td class="bs-td-bar">${cell(on, 80)}</td><td class="bs-td-bar">${cell(ver, 75)}</td><td>${iss ? `<span class="bs-issue sm">${ic('alert')}${iss}</span>` : '0'}</td><td>${avg == null ? '—' : `${stars(Math.round(avg))} ${ratingTxt(avg)}`}</td><td class="bs-td-bar">${cell(rep, 50)}</td></tr>`;
    }).filter(Boolean);
    // Komposisi
    const cnt = key => sc.locs.reduce((m, l) => { m[l[key]] = (m[l[key]] || 0) + 1; return m; }, {});
    // Daftar peringkat
    const perLoc = new Map();
    cur.rvs.forEach(rv => { const e = perLoc.get(rv.code) || { n: 0, s: 0, un: 0 }; e.n++; e.s += rv.rating; if (!rv.reply) e.un++; perLoc.set(rv.code, e); });
    const lowest = [...perLoc.entries()].map(([code, e]) => ({ code, avg: e.s / e.n, ...e })).sort((a, b) => a.avg - b.avg || b.n - a.n).slice(0, 5)
      .map(x => ({ label: `<button type="button" class="bs-inline-link" data-action="open-loc" data-id="${esc(x.code)}" data-tab="reviews">${esc(locName(x.code))}</button>`, plain: locName(x.code), n: x.avg, value: `${ratingTxt(x.avg)} ★`, sub: `${x.n} ulasan · ${x.un} belum dibalas` }));
    const reasons = new Map();
    cur.runs.forEach(r => r.items.forEach(i => { if (i.status === 'Gagal' && sc.codes.has(i.code)) reasons.set(i.reason, (reasons.get(i.reason) || 0) + 1); }));
    const reasonRows = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ label: esc(k), plain: k, n }));
    const team = new Map();
    cur.audit.filter(a => a.actor === 'Internal').forEach(a => team.set(a.user, (team.get(a.user) || 0) + 1));
    const teamRows = [...team.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => ({ label: esc(k), plain: k, n, value: `${fmtNum(n)} aksi` }));
    const scopeTxt = [f.region, (accounts.find(a => a.id === f.account) || {}).name, f.type].filter(Boolean).join(' · ') || 'Seluruh jaringan';
    const periodTxt = `${new Intl.DateTimeFormat(LOC(), { dateStyle: 'medium' }).format(new Date(bk.from))} – ${new Intl.DateTimeFormat(LOC(), { dateStyle: 'medium' }).format(new Date(bk.to - DAY))}`;
    const sched = (app.state.reportSchedules || []).map(x => `<tr><td><strong>${esc(x.name)}</strong><small>${esc((PERIODS.find(p2 => p2[0] === x.period) || PERIODS[0])[1])} · ${esc(x.format)}</small></td><td>${esc(FREQ[x.frequency] || x.frequency)}${x.frequency === 'weekly' ? `<small>${esc((WEEKDAYS.find(w => w[0] === x.day) || WEEKDAYS[0])[1])}, 08.00</small>` : '<small>Tanggal 1, 08.00</small>'}</td><td class="bs-td-wrap">${x.recipients.map(esc).join(', ')}</td><td class="bs-td-actions">${btn('', 'report-unschedule', { id: x.id, icon: 'trash', variant: 'icon sm ghost', title: `Hapus jadwal ${x.name}` })}</td></tr>`);
    return `<div class="bs-print-head"><strong>BranchSync — Laporan & Analitik</strong><span>Periode: ${esc(periodTxt)} · Cakupan: ${esc(scopeTxt)} · Dicetak: ${fmtDate(Date.now())}</span></div>` +
      head('Laporan & Analitik', navItem('reports').desc, btn('Jadwalkan', 'report-schedule', { icon: 'calendar' }) + btn('Ekspor CSV', 'report-export', { icon: 'download' }) + btn('Cetak / PDF', 'report-print', { icon: 'printer', variant: 'primary' })) +
      `<section class="bs-card bs-report-filters"><div class="bs-card-body flush"><div class="bs-toolbar">
        ${selectF('report.period', 'Periode', PERIODS, f.period, '')}
        ${selectF('report.region', 'Region', REGIONS, f.region, 'Semua region')}
        ${selectF('report.account', 'Akun Google Business Profile', accounts.map(a => [a.id, a.name]), f.account, 'Semua akun')}
        ${selectF('report.type', 'Tipe unit', TYPES, f.type, 'Semua tipe')}
      </div>${filterChips('report')}<p class="bs-report-scope">${ic('info')}<span><b>${esc(periodTxt)}</b> · ${esc(scopeTxt)} · ${fmtNum(sc.locs.length)} unit. Perubahan dibandingkan dengan ${f.period} hari sebelumnya.</span></p></div></section>` +
      `<div class="bs-metrics bs-metrics-6">${[
        kpiTile('Keberhasilan sync', cur.rate, prev.rate, { fmt: pctTxt, delta: v => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)} poin`, icon: 'refresh' }),
        kpiTile('Rata-rata rating', cur.avgRating, prev.avgRating, { fmt: v => `${ratingTxt(v)} ★`, delta: ratingTxt, icon: 'star' }),
        kpiTile('Tingkat balasan ulasan', cur.replyRate, prev.replyRate, { fmt: pctTxt, delta: v => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)} poin`, icon: 'chat' }),
        kpiTile('Waktu balas rata-rata', cur.avgResp, prev.avgResp, { fmt: fmtDur, delta: fmtDur, better: 'down', icon: 'gauge' }),
        kpiTile('Kepatuhan SLA internal', cur.sla, prev.sla, { fmt: pctTxt, delta: v => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)} poin`, icon: 'shield' }),
        kpiTile('Ketidaksesuaian diselesaikan', cur.resolved, prev.resolved, { fmt: fmtNum, delta: fmtNum, icon: 'alert' })
      ].join('')}</div>` +
      card(`Tren sinkronisasi ${bk.size === 1 ? 'harian' : 'mingguan'}`, columnChart(syncRows, { series: [{ key: 'ok', label: 'Berhasil', cls: 'bs-seg-good', dot: 'good' }, { key: 'fail', label: 'Gagal', cls: 'bs-seg-bad', dot: 'bad' }], labelEvery }), { sub: `${fmtNum(cur.ok + cur.fail)} pembaruan · ${fmtNum(cur.fail)} gagal` }) +
      `<div class="bs-grid bs-grid-2">${card('Volume ulasan per minggu', columnChart(volRows, { series: [{ key: 'n', label: 'Ulasan', cls: 'bs-seg-accent', dot: 's1' }], labelEvery: volRows.length > 8 ? 2 : 1 }), { sub: `${fmtNum(cur.rvs.length)} ulasan dalam periode` })}${card('Rata-rata rating per minggu', lineChart(ratRows, { label: 'Rata-rata rating', fmt: v => `${ratingTxt(v)} ★`, labelEvery: ratRows.length > 8 ? 2 : 1 }), { sub: 'Skala 1–5 bintang' })}</div>` +
      card('Kinerja per region', regionRows.length ? `<div class="bs-table-wrap" tabindex="0" role="region" aria-label="Kinerja per region"><table class="bs-table bs-report-table bs-cards"><thead><tr><th scope="col">Region</th><th scope="col">Unit</th><th scope="col">Online</th><th scope="col">Terverifikasi GBP</th><th scope="col">Beda data</th><th scope="col">Rating (periode)</th><th scope="col">Ulasan dibalas</th></tr></thead><tbody>${withLabels(['Unit', 'Online', 'Terverifikasi GBP', 'Beda data', 'Rating (periode)', 'Ulasan dibalas'], regionRows).join('')}</tbody></table></div>` : emptyState('Tidak ada data', 'Tidak ada unit dalam cakupan ini.', '', 'info'), { sub: 'Klik region untuk menyaring laporan · bar oranye = di bawah target', flush: !!regionRows.length }) +
      `<div class="bs-grid bs-grid-2">${card('Komposisi status unit', composition('Status operasional', STATUSES, cnt('status')) + composition('Status Google Business Profile', GBP, cnt('gbp')))}${card('Lokasi dengan rating terendah', rankList(lowest, 'Belum ada ulasan dalam periode ini.', 5), { sub: 'Berdasarkan ulasan dalam periode', actions: go('Ulasan', 'reviews') })}</div>` +
      `<div class="bs-grid bs-grid-2">${card('Penyebab gagal sinkron teratas', rankList(reasonRows, 'Tidak ada kegagalan tercatat dalam periode ini.'), { actions: go('Sync Monitor', 'sync') })}${card('Aktivitas tim', rankList(teamRows, 'Belum ada aktivitas dalam periode ini.'), { sub: 'Jumlah perubahan per pengguna internal', actions: go('Riwayat', 'audit') })}</div>` +
      card('Laporan terjadwal', sched.length ? table(['Laporan', 'Jadwal', 'Penerima', '<span class="bs-sr">Aksi</span>'], sched) : emptyState('Belum ada jadwal', 'Kirim laporan otomatis ke email pimpinan secara berkala.', btn('Jadwalkan laporan', 'report-schedule', { icon: 'calendar', variant: 'sm' }), 'calendar'), { sub: isLive() ? 'Dikirim otomatis oleh server BranchSync.' : 'Mode Demo — jadwal disimpan, email tidak benar-benar dikirim.', flush: !!sched.length });
  }
  function reportScheduleModal() {
    if (!guard('settings.write')) return;
    openModal('Jadwalkan laporan', formGrid([
      { name: 'name', label: 'Nama laporan', value: 'Laporan kinerja jaringan', full: true, attrs: 'required maxlength="80"' },
      { name: 'frequency', label: 'Frekuensi', type: 'select', options: [['weekly', 'Mingguan'], ['monthly', 'Bulanan (tanggal 1)']], value: 'weekly' },
      { name: 'day', label: 'Hari kirim (mingguan)', type: 'select', options: WEEKDAYS, value: '1' },
      { name: 'period', label: 'Periode data', type: 'select', options: PERIODS, value: ui.report.period },
      { name: 'format', label: 'Format', type: 'select', options: [['PDF', 'PDF'], ['CSV', 'CSV'], ['PDF + CSV', 'PDF + CSV']], value: 'PDF' },
      { name: 'recipients', label: 'Penerima (pisahkan dengan koma)', type: 'textarea', full: true, hint: 'Contoh: kepala.divisi@bri.co.id, manajer.wilayah@bri.co.id', attrs: 'required' }
    ]), {
      desc: 'Laporan berisi ringkasan KPI, tren, dan kinerja per region sesuai filter yang sedang dipakai.', submit: 'Simpan jadwal',
      onSubmit: p => {
        const name = String(p.name || '').trim(), recipients = String(p.recipients || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
        const e = {};
        if (!name) e.name = 'Wajib diisi.';
        if (!recipients.length) e.recipients = 'Isi minimal satu email.';
        else if (recipients.some(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) e.recipients = `Email tidak valid: ${recipients.filter(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).join(', ')}`;
        if (recipients.length > 20) e.recipients = 'Maksimal 20 penerima.';
        if (Object.keys(e).length) return e;
        const sch = { id: `RS-${String(++app.state.seq.schedule).padStart(3, '0')}`, name, frequency: p.frequency, day: p.day, period: p.period, format: p.format, recipients, filters: { ...ui.report }, createdAt: Date.now() };
        app.state.reportSchedules.push(sch);
        log('Laporan & Analitik', 'Menjadwalkan laporan', { detail: `${name} · ${FREQ[sch.frequency]} · ${recipients.length} penerima` });
        remote('POST', '/reports/schedules', sch);
        toast(`Jadwal “${name}” disimpan.`, { tone: 'good' });
      }
    });
  }
});
