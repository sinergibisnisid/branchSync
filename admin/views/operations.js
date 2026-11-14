'use strict';
/*
 * BranchSync Admin — Halaman operasional & administrasi: Ketidaksesuaian, Duplikat, Klaim, Persetujuan, Sync, Riwayat, SLA, Pengguna, Integrasi Google.
 * Modul views/operations.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('views/operations', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let acctOf, badge, bar, btn, byCode, can, card, claimActive, claimName, claimTimes, dailySync, DAY, diffList, DUP_PER_UNIT, duplicatePairs,
    emptyState, esc, FIELD_LABEL, filterChips, fmtDate, fmtDist, fmtDur, fmtNum, fmtRel, GOOGLE_SCOPES, head, HOUR, ic, initials, isLive, issueMap,
    kv, locName, metric, MIN, MODE, navItem, openFailures, opts, pct, PERMS, searchF, selectF, slaStats, STEPS, sum, SYNC_INTERVALS, table, tabPanel,
    tabs, ui, when, whenCell, whenFull;
  app.imports(() => ({ acctOf, badge, bar, btn, byCode, can, card, claimActive, claimName, claimTimes, dailySync, DAY, diffList, DUP_PER_UNIT,
    duplicatePairs, emptyState, esc, FIELD_LABEL, filterChips, fmtDate, fmtDist, fmtDur, fmtNum, fmtRel, GOOGLE_SCOPES, head, HOUR, ic, initials,
    isLive, issueMap, kv, locName, metric, MIN, MODE, navItem, openFailures, opts, pct, PERMS, searchF, selectF, slaStats, STEPS, sum,
    SYNC_INTERVALS, table, tabPanel, tabs, ui, when, whenCell, whenFull } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ discRows, viewDiscrepancies, viewDuplicates, viewClaims, viewApprovals, viewSync, auditFiltered, viewAudit, viewSla, viewAccess,
    viewIntegrations });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * View: Ketidaksesuaian
   * ------------------------------------------------------------------ */
  function discRows() {
    const q = ui.disc.q.trim().toLowerCase(), out = [];
    issueMap().forEach((iss, code) => {
      const l = byCode().get(code);
      if (q && !`${l.name} ${l.code} ${l.city}`.toLowerCase().includes(q)) return;
      iss.forEach(i => { if (!ui.disc.field || i.field === ui.disc.field) out.push({ l, ...i }); });
    });
    return out;
  }
  function viewDiscrepancies() {
    const rows = discRows(), total = sum([...issueMap().values()].map(x => x.length));
    const byField = Object.keys(FIELD_LABEL).slice(0, 5).map(f => [f, sum([...issueMap().values()].map(x => x.filter(i => i.field === f).length))]);
    const body = rows.map(r => {
      const key = `${r.l.code}|${r.field}`, note = app.state.discNotes[key];
      return `<tr><td><button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(r.l.code)}" data-tab="compare"><strong>${esc(r.l.name)}</strong><small>${esc(r.l.code)} · ${esc(r.l.city)}</small></button></td>
        <td>${FIELD_LABEL[r.field]}${r.dist ? `<small>selisih ${fmtDist(r.dist)}</small>` : ''}</td>
        <td class="bs-td-wrap"><span class="bs-val dash">${esc(r.dash)}</span></td>
        <td class="bs-td-wrap"><span class="bs-val google">${esc(r.google)}</span></td>
        <td class="bs-td-wrap">${note ? `<span class="bs-note" title="${esc(note.by)} · ${fmtDate(note.time)}">${ic('note')}${esc(note.text)}</span>` : '<span class="bs-muted">—</span>'}</td>
        <td class="bs-td-actions">${btn('Pakai Dashboard', 'disc-push', { id: key, variant: 'sm', title: 'Kirim data Dashboard ke Google' })}${btn('Pakai Google', 'disc-pull', { id: key, variant: 'sm ghost', title: 'Salin data Google ke Dashboard' })}${btn('', 'disc-note', { id: key, icon: 'note', variant: 'sm icon ghost', title: 'Catat temuan' })}</td></tr>`;
    });
    return head('Ketidaksesuaian Data', navItem('discrepancies').desc,
      (isLive() ? '' : btn('Simulasikan perubahan di Google', 'simulate-google', { icon: 'zap' })) + btn('Unduh laporan', 'export-disc', { icon: 'download' }) + btn('Pakai Dashboard untuk semua', 'disc-push-all', { icon: 'upload', variant: 'primary', attrs: rows.length ? '' : 'disabled' })) +
      `<div class="bs-metrics bs-metrics-5">${byField.map(([f, n]) => metric({ label: FIELD_LABEL[f], value: fmtNum(n), note: n ? 'perbedaan' : 'sesuai', tone: n ? 'warn' : 'good' })).join('')}</div>` +
      card(`${fmtNum(total)} perbedaan pada ${fmtNum(issueMap().size)} unit`, `<div class="bs-toolbar">${searchF('disc.q', 'Cari unit', ui.disc.q, 'Nama, kode, atau kota…', 'bsDiscQ')}${selectF('disc.field', 'Kolom', Object.keys(FIELD_LABEL).slice(0, 5).map(f => [f, FIELD_LABEL[f]]), ui.disc.field)}</div>${filterChips('disc')}` +
        (rows.length ? table(['Unit kerja', 'Kolom', 'Di Dashboard', 'Di Google Maps', 'Catatan', '<span class="bs-sr">Aksi</span>'], body) : emptyState('Data sudah sesuai', 'Tidak ada perbedaan antara Dashboard dan Google Maps untuk filter ini.')),
      { sub: '“Pakai Dashboard” mengirim data BRI ke Google. “Pakai Google” memperbarui Dashboard. Setiap keputusan tercatat di Riwayat.' });
  }

  /* ------------------------------------------------------------------ *
   * View: Duplikat
   * ------------------------------------------------------------------ */
  function viewDuplicates() {
    const pairs = duplicatePairs();
    const side = (l, keep) => `<div class="bs-dup-side"><button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(l.code)}"><strong>${esc(l.name)}</strong><small>${esc(l.code)} · ${esc(l.type)}</small></button>
      ${kv([['Alamat', esc(l.address)], ['Telepon', esc(l.phone)], ['Status', badge(l.status)], ['GBP', badge(l.gbp)], ['Diperbarui', when(l.updatedAt)]])}
      ${btn('Pertahankan ini', 'dup-keep', { id: keep, icon: 'merge', variant: 'sm' })}</div>`;
    const shown = pairs.slice(0, ui.dups.limit);
    const list = shown.map(p => `<article class="bs-dup">
      <header><span class="bs-score" data-high="${p.score >= 90}">${p.score}% mirip</span><span>${esc(p.reason)} · jarak ${fmtDist(p.d)}</span><span class="bs-spacer"></span>${btn('Bukan duplikat', 'dup-ignore', { id: p.key, variant: 'sm ghost' })}${btn('Laporkan ke Google', 'dup-report', { id: p.key, variant: 'sm ghost' })}</header>
      <div class="bs-dup-grid">${side(p.a, `${p.key}|a`)}<div class="bs-dup-vs" aria-hidden="true">vs</div>${side(p.b, `${p.key}|b`)}</div></article>`).join('');
    return head('Duplikat Titik Lokasi', navItem('duplicates').desc, btn('Atur radius deteksi', 'nav', { id: 'settings', icon: 'sliders' })) +
      `<div class="bs-callout">${ic('info')}<p>Deteksi otomatis memakai <b>kemiripan nama</b> (dalam 2 km) dan <b>tipe sama dalam radius ${app.state.settings.dupRadius} m</b>. “Pertahankan ini” akan menonaktifkan unit lainnya dan menandainya <i>Duplikat</i>. Anda bisa membatalkannya.</p></div>` +
      (pairs.dense ? `<div class="bs-callout" data-tone="warn">${ic('alert')}<p>Ada area dengan titik yang sangat berdekatan (kemungkinan salah impor koordinat). Untuk tiap unit di area itu hanya ${DUP_PER_UNIT} pasangan terdekat yang ditampilkan.</p></div>` : '') +
      (pairs.length ? `<p class="bs-muted bs-gap">Menampilkan ${fmtNum(shown.length)} dari ${fmtNum(pairs.length)} pasangan, urut dari yang paling mirip.</p><div class="bs-stack">${list}</div>${pairs.length > shown.length ? `<div class="bs-more">${btn(`Tampilkan ${fmtNum(Math.min(30, pairs.length - shown.length))} lagi`, 'dup-more', { variant: 'sm' })}</div>` : ''}` : card('Tidak ada duplikat', emptyState('Tidak ada titik ganda', 'Semua unit kerja memiliki titik yang unik.')));
  }

  /* ------------------------------------------------------------------ *
   * View: Klaim & Titik Baru
   * ------------------------------------------------------------------ */
  function stepper(c) {
    const idx = c.status === 'Ditolak' ? -1 : STEPS.indexOf(c.status);
    return `<div class="bs-steps" aria-label="Tahap: ${esc(c.status)}">${STEPS.map((s, i) => `<span class="${c.status === 'Ditolak' ? 'is-rejected' : i < idx || c.status === 'Selesai' ? 'is-done' : i === idx ? 'is-current' : ''}" title="${s}"></span>`).join('')}<small>${esc(c.status)}</small></div>`;
  }
  function viewClaims() {
    const t = ui.claims.tab, all = app.state.claims;
    const filt = { active: claimActive, done: c => c.status === 'Selesai', rejected: c => c.status === 'Ditolak', all: () => true }[t] || claimActive;
    const rows = all.filter(filt).sort((a, b) => b.submittedAt - a.submittedAt).map(c => {
      const tm = claimTimes(c), next = STEPS[STEPS.indexOf(c.status) + 1];
      return `<tr><td><strong>${esc(c.id)}</strong><small>${esc(c.kind)}</small></td>
        <td>${c.code ? `<button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(c.code)}"><strong>${esc(claimName(c))}</strong><small>${esc(c.code)}</small></button>` : `<strong>${esc(c.proposal.name)}</strong><small>Usulan · ${esc(c.proposal.city)}</small>`}</td>
        <td>${stepper(c)}${c.note ? `<small class="bs-note-line">${esc(c.note)}</small>` : ''}</td>
        <td>${fmtDur(tm.internal)}${tm.internalRunning ? ' <small>berjalan</small>' : ''}<small>${badge(tm.sla)}</small></td>
        <td>${tm.google == null ? '<span class="bs-muted">—</span>' : fmtDur(tm.google) + (tm.googleRunning ? ' <small>menunggu Google</small>' : '')}</td>
        <td><span title="${fmtDate(c.submittedAt)}">${fmtRel(c.submittedAt)}</span></td>
        <td class="bs-td-actions">${claimActive(c) ? btn(next === 'Selesai' ? 'Tandai selesai' : 'Lanjutkan', 'claim-next', { id: c.id, icon: 'arrowR', variant: 'sm', title: `Pindahkan ke tahap “${next}”` }) + btn('Tolak', 'claim-reject', { id: c.id, variant: 'sm ghost' }) : ''}</td></tr>`;
    });
    const count = fn => all.filter(fn).length;
    return head('Klaim & Titik Baru', navItem('claims').desc, btn('Ajukan klaim', 'claim-new', { icon: 'shield' }) + btn('Usulkan titik baru', 'point-new', { icon: 'pin', variant: 'primary' })) +
      `<div class="bs-explain">${[
        ['Get Verified', 'shield', 'Klaim kepemilikan listing yang belum terverifikasi, lalu verifikasi oleh Google.'],
        ['Suspend', 'alert', 'Ajukan banding beserta dokumen agar listing yang di-suspend dipulihkan.'],
        ['Duplicate', 'copy', 'Laporkan listing ganda ke Google agar digabung atau dihapus.'],
        ['Titik baru', 'pin', 'Usulkan lokasi baru. Sistem memeriksa duplikat sebelum diajukan.']
      ].map(([t2, i, d]) => `<div>${ic(i)}<strong>${t2}</strong><p>${d}</p></div>`).join('')}</div>` +
      card('Daftar permintaan', tabs('claims.tab', [['active', 'Berjalan', count(claimActive)], ['done', 'Selesai', count(c => c.status === 'Selesai')], ['rejected', 'Ditolak', count(c => c.status === 'Ditolak')], ['all', 'Semua', all.length]], t) +
        tabPanel('claims.tab', t, table(['ID / jenis', 'Unit kerja', 'Tahap', 'Proses internal', 'Verifikasi Google', 'Diajukan', '<span class="bs-sr">Aksi</span>'], rows, 'Tidak ada permintaan di tab ini.')),
      { sub: `Target proses internal ≤ ${app.state.settings.slaInternal} jam. Waktu verifikasi Google dihitung terpisah.` });
  }

  /* ------------------------------------------------------------------ *
   * View: Persetujuan Edit
   * ------------------------------------------------------------------ */
  function viewApprovals() {
    const pending = app.state.approvals.filter(a => a.status === 'Menunggu'), done = app.state.approvals.filter(a => a.status !== 'Menunggu');
    const t = ui.approvals.tab;
    const cards = pending.map(a => `<article class="bs-approval">
      <header><span class="bs-avatar sm" data-actor="Eksternal" aria-hidden="true">@</span><div><strong>${esc(a.by)}</strong><small>Email GBP tidak dikenal · ${when(a.time)} · ${esc(a.id)}</small></div>${badge('Menunggu')}</header>
      <p>Mengusulkan perubahan <b>${FIELD_LABEL[a.field]}</b> pada <button type="button" class="bs-inline-link" data-action="open-loc" data-id="${esc(a.code)}">${esc(locName(a.code))}</button></p>
      ${diffList([{ field: FIELD_LABEL[a.field], before: a.before, after: a.after }])}
      <footer>${btn('Tolak', 'cr-reject', { id: a.id, icon: 'x' })}${btn('Setujui', 'cr-approve', { id: a.id, icon: 'check', variant: 'primary' })}</footer></article>`).join('');
    const hist = done.sort((a, b) => b.decidedAt - a.decidedAt).map(a => `<tr><td><strong>${esc(a.id)}</strong><small>Diterima ${when(a.time)}</small></td><td>${esc(locName(a.code))}<small>${FIELD_LABEL[a.field]}</small></td><td class="bs-td-wrap">${diffList([{ field: '', before: a.before, after: a.after }])}</td><td>${esc(a.by)}</td><td>${badge(a.status)}<small>${esc(a.decidedBy)} · ${when(a.decidedAt)}</small></td></tr>`);
    return head('Persetujuan Edit', navItem('approvals').desc, (isLive() ? btn('Muat ulang', 'live-retry', { icon: 'refresh' }) : btn('Simulasikan edit masuk', 'simulate-edit', { icon: 'zap' }))) +
      `<div class="bs-callout" data-tone="good">${ic('shield')}<p>Perubahan dari email GBP lain <b>tidak diterapkan</b> sampai BRI menyetujuinya. Jika ditolak, data unit kerja tetap seperti semula.</p></div>` +
      tabs('approvals.tab', [['pending', 'Menunggu', pending.length], ['history', 'Riwayat keputusan', done.length]], t, 'Persetujuan Edit') +
      tabPanel('approvals.tab', t, t === 'pending'
        ? (pending.length ? `<div class="bs-approval-grid">${cards}</div>` : card('Tidak ada permintaan', emptyState('Kotak masuk kosong', 'Tidak ada edit eksternal yang menunggu persetujuan.', '', 'inbox')))
        : card('Riwayat keputusan', table(['ID', 'Unit / kolom', 'Perubahan', 'Diajukan oleh', 'Keputusan'], hist), { flush: false }));
  }

  /* ------------------------------------------------------------------ *
   * View: Sync Monitor
   * ------------------------------------------------------------------ */
  function viewSync() {
    const fails = openFailures(), daily = dailySync(7), runs = app.state.runs;
    const ok = sum(daily.map(d => d.ok)), fl = sum(daily.map(d => d.fail));
    const avgDur = runs.length ? sum(runs.slice(0, 20).map(r => r.durationMs)) / Math.min(20, runs.length) : 0;
    const prog = ui.running && ui.running.indeterminate ? `<div class="bs-progress is-indeterminate" role="progressbar" aria-label="Server sedang menyinkronkan"><span></span></div><p class="bs-muted">Server sedang menyinkronkan ${fmtNum(ui.running.total)} unit…</p>` : ui.running ? `<div class="bs-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${ui.running.total}" aria-valuenow="${ui.running.done}" aria-label="Kemajuan sinkronisasi"><span style="width:${pct(ui.running.done, ui.running.total)}%"></span></div><p class="bs-muted">Memproses ${fmtNum(ui.running.done)} dari ${fmtNum(ui.running.total)} unit…</p>` : '';
    const failRows = fails.map(f => `<tr><td><button type="button" class="bs-cell-link" data-action="open-loc" data-id="${esc(f.code)}" data-tab="sync"><strong>${esc(locName(f.code))}</strong><small>${esc(f.code)}</small></button></td><td class="bs-td-wrap">${esc(f.reason)}</td><td>${esc(f.run)}<small>${when(f.time)}</small></td>
      <td class="bs-td-actions">${btn('Coba lagi', 'retry', { id: f.code, icon: 'refresh', variant: 'sm', attrs: ui.running ? 'disabled' : '' })}${btn('Tindak lanjut', 'resolve', { id: f.code, icon: 'note', variant: 'sm ghost' })}</td></tr>`);
    const runRows = runs.slice(0, 50).map(r => `<tr><td><strong>${esc(r.id)}</strong><small>${esc(r.scope)}</small></td><td>${whenCell(r.time)}<small>${esc(r.by)}</small></td><td>${fmtNum(r.total)}</td><td>${badge('Berhasil', fmtNum(r.ok))}</td><td>${r.fail ? badge('Gagal', fmtNum(r.fail)) : '0'}</td><td>${fmtNum(r.skip)}</td><td>${fmtDur(r.durationMs < MIN ? MIN : r.durationMs)}</td></tr>`);
    return head('Sync Monitor', navItem('sync').desc, btn(ui.running ? 'Menyinkronkan…' : 'Sinkronkan semua', 'sync-all', { icon: 'refresh', variant: 'primary', attrs: ui.running ? 'disabled' : '' })) + prog +
      `<div class="bs-metrics">${[
        metric({ label: 'Tingkat keberhasilan · 7 hari', value: pct(ok, ok + fl) + '%', note: `${fmtNum(ok)} berhasil · ${fmtNum(fl)} gagal`, spark: daily.map(d => pct(d.ok, d.ok + d.fail)), tone: pct(ok, ok + fl) < 95 ? 'warn' : 'good' }),
        metric({ label: 'Belum ditangani', value: fmtNum(fails.length), note: 'unit gagal diperbarui', tone: fails.length ? 'bad' : 'good', icon: 'alert' }),
        metric({ label: 'Rata-rata durasi job', value: fmtDur(Math.max(MIN, avgDur)), note: '20 job terakhir', icon: 'gauge' }),
        metric({ label: 'Sisa kuota API', value: fmtNum(app.state.api.quotaLimit - app.state.api.quotaUsed), note: `dari ${fmtNum(app.state.api.quotaLimit)} per hari`, icon: 'plug', view: 'integrations' })
      ].join('')}</div>` +
      card('Detail sinkronisasi', tabs('sync.tab', [['failures', 'Kegagalan', fails.length], ['runs', 'Riwayat job', runs.length]], ui.sync.tab, 'Detail sinkronisasi') +
        tabPanel('sync.tab', ui.sync.tab, ui.sync.tab === 'failures'
          ? (fails.length ? `<div class="bs-table-actions">${btn(`Coba lagi semua (${fails.length})`, 'retry-all', { icon: 'refresh', variant: 'sm', attrs: ui.running ? 'disabled' : '' })}</div>` + table(['Unit kerja', 'Penyebab', 'Job', '<span class="bs-sr">Aksi</span>'], failRows) : emptyState('Tidak ada kegagalan', 'Semua unit berhasil diperbarui pada job terakhir.'))
          : table(['Job', 'Waktu', 'Total', 'Berhasil', 'Gagal', 'Dilewati', 'Durasi'], runRows)));
  }

  /* ------------------------------------------------------------------ *
   * View: Riwayat Perubahan
   * ------------------------------------------------------------------ */
  function auditFiltered() {
    const a = ui.audit, q = a.q.trim().toLowerCase(), since = a.range ? Date.now() - Number(a.range) * DAY : 0;
    return app.state.audit.filter(x => x.time >= since && (!a.module || x.module === a.module) && (!a.actor || x.actor === a.actor) &&
      (!q || `${x.user} ${x.action} ${x.target} ${locName(x.target)} ${x.detail} ${x.changes.map(c => `${c.before} ${c.after}`).join(' ')}`.toLowerCase().includes(q)));
  }
  function viewAudit() {
    const xs = auditFiltered(), a = ui.audit, modules = [...new Set(app.state.audit.map(x => x.module))].sort();
    const rows = xs.slice(0, 200).map(x => `<tr><td>${whenCell(x.time)}</td>
      <td><span class="bs-user"><span class="bs-avatar sm" data-actor="${x.actor}" aria-hidden="true">${x.actor === 'Eksternal' ? '@' : initials(x.user)}</span><span>${esc(x.user)}<small>${badge(x.actor)}</small></span></span></td>
      <td>${esc(x.module)}</td><td><strong>${esc(x.action)}</strong>${x.target ? `<small><button type="button" class="bs-inline-link" data-action="open-target" data-id="${esc(x.target)}">${esc(locName(x.target))}</button></small>` : ''}${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</td>
      <td class="bs-td-wrap">${x.changes.length ? `<details class="bs-changes"><summary>${x.changes.length} perubahan</summary>${diffList(x.changes)}</details>` : '<span class="bs-muted">—</span>'}</td></tr>`);
    return head('Riwayat Perubahan', navItem('audit').desc, btn('Ekspor CSV', 'export-audit', { icon: 'download' })) +
      card(`${fmtNum(xs.length)} aktivitas`, `<div class="bs-toolbar">${searchF('audit.q', 'Cari', a.q, 'Pengguna, unit, nilai sebelum/sesudah…', 'bsAuditQ')}${selectF('audit.module', 'Modul', modules, a.module)}${selectF('audit.actor', 'Pengguna', [['Internal', 'Internal BRI'], ['Eksternal', 'Eksternal (email lain)']], a.actor)}${selectF('audit.range', 'Periode', [['1', '24 jam'], ['7', '7 hari'], ['30', '30 hari']], a.range, 'Semua waktu')}</div>${filterChips('audit')}` +
        table(['Waktu', 'Pengguna', 'Modul', 'Aksi', 'Sebelum → sesudah'], rows, 'Tidak ada aktivitas untuk filter ini.', { cls: 'bs-table-scroll' }) + (xs.length > 200 ? `<p class="bs-muted bs-pad">Menampilkan 200 terbaru. Ekspor CSV untuk melihat semuanya.</p>` : ''));
  }

  /* ------------------------------------------------------------------ *
   * View: SLA & Kinerja
   * ------------------------------------------------------------------ */
  function viewSla() {
    const s = slaStats(), rows = [...s.rows].sort((a, b) => b.c.submittedAt - a.c.submittedAt);
    const maxT = Math.max(HOUR, ...rows.map(x => x.t.internal + (x.t.google || 0)));
    const limitPct = Math.min(100, ((app.state.settings.slaInternal * HOUR) / maxT) * 100);
    const chart = `<div class="bs-legend"><span><i class="s1"></i>Proses internal BRI</span><span><i class="s2"></i>Verifikasi Google</span><span><i class="limit"></i>Target internal (${app.state.settings.slaInternal} jam)</span></div>
      <div class="bs-hbars">${rows.map(({ c, t }) => `<div class="bs-hbar" tabindex="0" aria-label="${esc(c.id)}: internal ${fmtDur(t.internal)}, Google ${fmtDur(t.google)}">
        <span class="bs-hbar-label"><strong>${esc(c.id)}</strong><small>${esc(claimName(c))}</small></span>
        <span class="bs-hbar-track"><span class="s1" style="width:${(t.internal / maxT) * 100}%"></span>${t.google ? `<span class="s2" style="width:${(t.google / maxT) * 100}%"></span>` : ''}<i class="bs-limit" style="left:${limitPct}%"></i></span>
        <span class="bs-hbar-val">${fmtDur(t.internal + (t.google || 0))}</span>
        <span class="bs-tip" role="tooltip"><strong>${esc(c.id)} · ${esc(c.kind)}</strong><span><i class="s1"></i>Internal <b>${fmtDur(t.internal)}${t.internalRunning ? ' (berjalan)' : ''}</b></span><span><i class="s2"></i>Google <b>${fmtDur(t.google)}${t.googleRunning ? ' (berjalan)' : ''}</b></span></span></div>`).join('')}</div>`;
    const tableRows = rows.map(({ c, t }) => `<tr><td><strong>${esc(c.id)}</strong><small>${esc(c.kind)}</small></td><td>${esc(claimName(c))}</td><td>${whenCell(c.submittedAt)}</td><td>${fmtDur(t.internal)}${t.internalRunning ? '<small>berjalan</small>' : ''}</td><td>${fmtDur(t.google)}${t.googleRunning ? '<small>berjalan</small>' : ''}</td><td>${badge(t.sla)}</td><td>${badge(c.status)}</td></tr>`);
    return head('SLA & Kinerja', navItem('sla').desc, btn('Atur target SLA', 'nav', { id: 'settings', icon: 'sliders' }) + btn('Ekspor CSV', 'export-sla', { icon: 'download' })) +
      `<div class="bs-metrics">${[
        metric({ label: 'Rata-rata proses internal', value: fmtDur(s.avgInternal), note: `Target ≤ ${app.state.settings.slaInternal} jam`, icon: 'gauge', tone: s.avgInternal > app.state.settings.slaInternal * HOUR ? 'warn' : 'good' }),
        metric({ label: 'Rata-rata verifikasi Google', value: fmtDur(s.avgGoogle), note: `Acuan ${app.state.settings.slaGoogle} jam · di luar kendali BRI`, icon: 'shield' }),
        metric({ label: 'Kepatuhan SLA internal', value: s.compliance + '%', note: `${s.rows.length} permintaan dievaluasi`, tone: s.compliance < 80 ? 'warn' : 'good', icon: 'check' }),
        metric({ label: 'Berisiko / lewat SLA', value: fmtNum(s.atRisk), note: 'permintaan aktif', tone: s.atRisk ? 'bad' : 'good', icon: 'alert', view: 'claims' })
      ].join('')}</div>` +
      card('Waktu penyelesaian per permintaan', chart + `<details class="bs-table-toggle"><summary>Lihat sebagai tabel</summary>${table(['ID', 'Unit', 'Diajukan', 'Internal', 'Google', 'SLA', 'Status'], tableRows)}</details>`, { sub: 'Bagian biru = waktu tim BRI memproses. Bagian oranye = waktu menunggu Google.' });
  }

  /* ------------------------------------------------------------------ *
   * View: Pengguna & Akses
   * ------------------------------------------------------------------ */
  function viewAccess() {
    const t = ui.access.tab, q = ui.access.q.trim().toLowerCase();
    const users = app.state.users.filter(u => !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q));
    const userRows = users.map(u => `<tr><td><span class="bs-user"><span class="bs-avatar sm" aria-hidden="true">${initials(u.name)}</span><span><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></span></span></td><td>${esc(u.role)}</td><td>${badge(u.status)}</td><td>${when(u.lastActive)}</td>
      <td class="bs-td-actions">${btn('', 'edit-user', { id: u.id, icon: 'edit', variant: 'icon ghost sm', title: `Edit ${u.name}` })}${btn(u.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan', 'toggle-user', { id: u.id, variant: 'sm ghost', attrs: u.id === 1 ? 'disabled title="Akun Anda sendiri"' : '' })}</td></tr>`);
    const matrix = `<div class="bs-table-wrap" tabindex="0" role="region" aria-label="Matriks izin"><table class="bs-table bs-matrix"><thead><tr><th scope="col">Izin</th>${app.state.roles.map((r, i) => `<th scope="col">${esc(r.name)}<small>${app.state.users.filter(u => u.role === r.name).length} pengguna</small>${i ? btn('', 'edit-role', { id: r.name, icon: 'edit', variant: 'icon ghost sm', title: `Ubah nama ${r.name}` }) : ''}</th>`).join('')}</tr></thead><tbody>${PERMS.map(([p, l]) => `<tr><th scope="row">${l}<small>${p}</small></th>${app.state.roles.map((r, i) => `<td><input type="checkbox" class="bs-check" data-role="${i}" data-perm="${p}" aria-label="${esc(r.name)}: ${l}" ${r.permissions.includes(p) ? 'checked' : ''} ${i === 0 || !can('users.manage') ? 'disabled' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="bs-muted bs-pad">Administrator selalu memiliki semua izin agar workspace tidak terkunci. Pratinjau RBAC — tidak ada penegakan akses di backend.</p>`;
    return head('Pengguna & Akses', navItem('access').desc, t === 'users' ? btn('Tambah pengguna', 'add-user', { icon: 'plus', variant: 'primary' }) : btn('Tambah peran', 'add-role', { icon: 'plus', variant: 'primary' })) +
      tabs('access.tab', [['users', 'Pengguna', app.state.users.length], ['roles', 'Peran & izin', app.state.roles.length]], t, 'Pengguna & Akses') +
      tabPanel('access.tab', t, t === 'users' ? card('Pengguna', `<div class="bs-toolbar">${searchF('access.q', 'Cari pengguna', ui.access.q, 'Nama, email, atau peran…', 'bsUserQ')}</div>${filterChips('access')}` + table(['Pengguna', 'Peran', 'Status', 'Aktif terakhir', '<span class="bs-sr">Aksi</span>'], userRows)) : card('Matriks izin', matrix, { sub: 'Centang untuk memberi izin. Perubahan langsung tersimpan dan tercatat di Riwayat.' }));
  }

  /* ------------------------------------------------------------------ *
   * View: Integrasi Google
   * ------------------------------------------------------------------ */
  const redirectUri = () => `${MODE.getBaseUrl() || 'https://<server-branchsync>'}/integrations/google/oauth/callback`;
  app.export({ redirectUri });
  function gField({ name, label, value = '', type = 'text', hint = '', full = false, attrs = '', placeholder = '' }) {
    return `<div class="bs-field${full ? ' full' : ''}"><label for="g-${name}">${label}</label><input id="g-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-describedby="gh-${name}" ${attrs}><small class="bs-field-hint" id="gh-${name}" data-hint="${esc(hint)}">${hint}</small></div>`;
  }
  function viewIntegrations() {
    const a = app.state.api, used = pct(a.quotaUsed, a.quotaLimit), live = isLive(), accounts = app.state.accounts || [];
    const ready = !!(a.clientId && a.hasClientSecret && a.project);
    const acctRows = accounts.map(ac => {
      const locs = app.state.locations.filter(l => acctOf(l) === ac.id), codes = new Set(locs.map(l => l.code));
      const rvs = app.state.reviews.filter(rv => codes.has(rv.code)), un = rvs.filter(rv => !rv.reply).length;
      return `<tr><td><strong>${esc(ac.name)}</strong><small>${esc(ac.email || '')}</small></td><td><code>${esc(ac.accountId || ac.id)}</code></td><td>${fmtNum(locs.length)}</td><td>${fmtNum(rvs.length)}${un ? `<small>${badge('Menunggu', `${un} belum dibalas`)}</small>` : ''}</td><td class="bs-td-actions">${btn('Lihat ulasan', 'review-account', { id: ac.id, icon: 'star', variant: 'sm' })}</td></tr>`;
    });
    const statusCard = card('Koneksi Google Business Profile', `<div class="bs-integration"><span class="bs-g-mark" aria-hidden="true">G</span><div><strong>${a.connected ? 'Terhubung' : 'Belum terhubung'}</strong><small>${live ? `Token OAuth disimpan di server BranchSync (${esc(MODE.host())}).` : 'Mode Demo — koneksi disimulasikan, tidak ada permintaan ke Google.'}</small></div>${badge(a.connected ? 'Aktif' : 'Nonaktif', a.connected ? 'Terhubung' : 'Terputus')}</div>` +
      kv([['Akun utama', esc(a.account || '—')], ['Project Google Cloud', esc(a.project || '—')], ['Kredensial OAuth', ready ? badge('Berhasil', 'Lengkap') : badge('Menunggu', 'Belum lengkap')], ['Uji terakhir', whenFull(a.lastTest)]]) +
      `<div class="bs-btn-row">${a.connected ? btn('Putuskan', 'api-toggle', { icon: 'plug' }) : btn('Hubungkan akun Google', 'gbp-oauth', { icon: 'external', variant: 'primary' })}${btn('Uji koneksi', 'api-test', { icon: 'zap' })}</div>`);
    const quotaCard = card('Kuota API harian', `<div class="bs-quota"><strong>${fmtNum(a.quotaUsed)}</strong><span>dari ${fmtNum(a.quotaLimit)} permintaan (${used}%)</span></div>${bar(a.quotaUsed, a.quotaLimit, `Kuota terpakai ${used}%`)}<p class="bs-muted bs-gap">Setiap pembaruan unit atau balasan ulasan memakai 1 permintaan. Batas kuota diatur di bawah.</p>${live ? '' : btn('Reset kuota harian', 'api-reset', { variant: 'sm ghost' })}`);
    const secretPh = has => (has ? '•••••••• tersimpan — isi untuk mengganti' : 'Belum diisi');
    const form = `<form id="bsGoogleForm" novalidate><fieldset class="bs-fieldset-plain" ${can('settings.write') ? '' : 'disabled'}>
      <div class="bs-form-grid">
        ${gField({ name: 'project', label: 'Project ID Google Cloud', value: a.project, hint: 'Mis. bri-branchsync-prod', attrs: 'autocomplete="off" spellcheck="false"' })}
        ${gField({ name: 'account', label: 'Email akun utama GBP', value: a.account, type: 'email', hint: 'Akun yang memiliki/mengelola lokasi', attrs: 'autocomplete="off"' })}
        ${gField({ name: 'clientId', label: 'OAuth Client ID', value: a.clientId, full: true, placeholder: '1234567890-abc123.apps.googleusercontent.com', hint: 'Dari Google Cloud Console › APIs & Services › Credentials', attrs: 'autocomplete="off" spellcheck="false"' })}
        ${gField({ name: 'clientSecret', label: 'OAuth Client Secret', type: 'password', placeholder: secretPh(a.hasClientSecret), hint: live ? 'Dikirim ke server dan tidak pernah ditampilkan kembali.' : 'Mode Demo: rahasia tidak disimpan di browser.', attrs: 'autocomplete="new-password"' })}
        ${gField({ name: 'apiKey', label: 'API key (opsional)', type: 'password', placeholder: secretPh(a.hasApiKey), hint: 'Untuk Places/Maps API. Diawali "AIza".', attrs: 'autocomplete="new-password"' })}
        <div class="bs-field full"><span class="bs-field-label">Redirect URI (daftarkan di Google Cloud Console)</span><div class="bs-copy-row"><code id="bsRedirectUri">${esc(redirectUri())}</code>${btn('Salin', 'copy-redirect', { icon: 'copy', variant: 'sm' })}</div></div>
        <fieldset class="bs-fieldset full" aria-describedby="gh-scopes"><legend>Scope OAuth</legend>${GOOGLE_SCOPES.map(([id, label, tag]) => `<label class="bs-checkline"><input type="checkbox" name="scopes" value="${id}" ${a.scopes.includes(id) ? 'checked' : ''}><span>${label} <code>${id}</code></span><small>${tag}</small></label>`).join('')}<small class="bs-field-hint" id="gh-scopes" data-hint=""></small></fieldset>
        <div class="bs-field"><label for="g-syncInterval">Sinkronisasi otomatis</label><select id="g-syncInterval" name="syncInterval">${opts(SYNC_INTERVALS, a.syncInterval)}</select><small class="bs-field-hint">Termasuk menarik ulasan & perubahan dari Google.</small></div>
        ${gField({ name: 'quotaLimit', label: 'Batas kuota harian', value: a.quotaLimit, type: 'number', hint: 'Jumlah permintaan API per hari', attrs: 'min="100" max="1000000" step="1"' })}
        ${gField({ name: 'pubsubTopic', label: 'Topik Pub/Sub notifikasi (opsional)', value: a.pubsubTopic, full: true, placeholder: 'projects/bri-branchsync-prod/topics/gbp-notifications', hint: 'Agar ulasan baru & edit dari pihak lain langsung masuk.', attrs: 'spellcheck="false"' })}
        <label class="bs-switch-row full"><span><strong>Notifikasi edit dari email GBP lain</strong><small>Masukkan usulan perubahan ke Persetujuan Edit dan beri notifikasi.</small></span><span class="bs-switch"><input type="checkbox" name="webhook" ${a.webhook ? 'checked' : ''}><span></span></span></label>
      </div>
      <p class="bs-form-error" id="bsGoogleError" role="alert"></p>
      <div class="bs-form-actions">${btn('Uji koneksi', 'api-test', { icon: 'zap' })}<button type="submit" class="bs-btn primary">${ic('check')}<span>Simpan konfigurasi</span></button></div>
    </fieldset></form>`;
    return head('Integrasi Google', navItem('integrations').desc) +
      `<div class="bs-grid bs-grid-main">${statusCard}${quotaCard}</div>` +
      card('Kredensial & konfigurasi Google API', form, { sub: 'Diperlukan agar BranchSync dapat mengelola lokasi dan membalas ulasan atas nama BRI.' }) +
      card(`Akun Google Business Profile (${fmtNum(accounts.length)})`, accounts.length ? table(['Akun', 'Account ID', 'Lokasi', 'Ulasan', '<span class="bs-sr">Aksi</span>'], acctRows) : emptyState('Belum ada akun', 'Hubungkan akun Google untuk menampilkan akun dan lokasinya.', '', 'info'), { flush: !!accounts.length });
  }
});
