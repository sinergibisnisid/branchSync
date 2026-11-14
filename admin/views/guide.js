'use strict';
/*
 * BranchSync Admin — Halaman Panduan Pengguna & Scenario Test.
 * Modul views/guide.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('views/guide', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let btn, card, claimActive, claimForm, DAY, duplicatePairs, emptyState, esc, FIELD_LABEL, FILTERS, fmtDate, fmtDur, go, head, I18N, ic,
    importModal, isEn, isLive, issueMap, locFiltered, MODE, navigate, navItem, openFailures, pointForm, reportBuckets, reportMetrics, sampleCSV,
    simulateEdit, simulateGoogleChange, slaStats, STATUSES, STORE, sum, tabPanel, tabs, toast, ui;
  app.imports(() => ({ btn, card, claimActive, claimForm, DAY, duplicatePairs, emptyState, esc, FIELD_LABEL, FILTERS, fmtDate, fmtDur, go, head,
    I18N, ic, importModal, isEn, isLive, issueMap, locFiltered, MODE, navigate, navItem, openFailures, pointForm, reportBuckets, reportMetrics,
    sampleCSV, simulateEdit, simulateGoogleChange, slaStats, STATUSES, STORE, sum, tabPanel, tabs, toast, ui } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ viewGuide, autoEvidence, compressImage, viewScenarios, scnStart });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * View: Panduan Pengguna & Scenario Test (konten dua bahasa)
   * ------------------------------------------------------------------ */
  const CONTENT = window.BranchAdminContent || { guide: [], scenarios: [], scenarioGroups: [] };
  app.export({ CONTENT });
  const L2 = pair => (Array.isArray(pair) ? (isEn() ? pair[1] : pair[0]) : pair);
  app.export({ L2 });
  function viewGuide() {
    const q = ui.guide.q.trim().toLowerCase();
    const text = g => [g.title, g.summary, ...g.steps, ...g.tips].map(pp => `${pp[0]} ${pp[1]}`).join(' ').toLowerCase();
    const secs = CONTENT.guide.filter(g => !q || text(g).includes(q));
    const link = ([v, lab]) => (v.startsWith('act:') ? btn(esc(L2(lab)), v.slice(4), { icon: 'arrowR', variant: 'sm' }) : go(esc(L2(lab)), v, 'sm'));
    return `<div class="bs-stack-20" data-no-i18n>` +
      head(L2(['Panduan Pengguna', 'User Guide']), L2(['Cara memakai setiap fitur BranchSync, langkah demi langkah. Klik tombol di setiap bagian untuk langsung membuka halamannya.', 'How to use every BranchSync feature, step by step. Click the buttons in each section to open the page directly.']),
        `<button type="button" class="bs-btn" data-view="scenarios">${ic('clipboard')}<span>${L2(['Scenario Test', 'Scenario Test'])}</span></button>` + btn(L2(['Cetak panduan', 'Print guide']), 'guide-print', { icon: 'printer' })) +
      `<div class="bs-guide">
        <nav class="bs-guide-toc" aria-label="${esc(L2(['Daftar isi', 'Contents']))}">
          <label class="bs-field"><span>${L2(['Cari di panduan', 'Search the guide'])}</span><span class="bs-input-ic">${ic('search')}<input type="search" id="bsGuideQ" data-bind="guide.q" data-search value="${esc(ui.guide.q)}" placeholder="${esc(L2(['Mis. impor, ulasan, SLA…', 'E.g. import, reviews, SLA…']))}" autocomplete="off"></span></label>
          <ol>${CONTENT.guide.map(g => `<li><button type="button" data-action="guide-jump" data-id="${g.id}" ${secs.includes(g) ? '' : 'disabled'}>${ic(g.icon)}<span>${esc(L2(g.title))}</span></button></li>`).join('')}</ol>
        </nav>
        <div class="bs-guide-body">${secs.length ? secs.map((g, i) => `<section class="bs-card bs-guide-sec" id="guide-${g.id}">
          <header class="bs-card-head"><div class="bs-guide-title"><span class="bs-guide-ic">${ic(g.icon)}</span><div><h2 tabindex="-1">${i + 1}. ${esc(L2(g.title))}</h2><p>${esc(L2(g.summary))}</p></div></div></header>
          <div class="bs-card-body"><ol class="bs-guide-steps">${g.steps.map(st => `<li>${esc(L2(st))}</li>`).join('')}</ol>
            ${g.tips.length ? `<div class="bs-callout">${ic('info')}<p>${g.tips.map(t => esc(L2(t))).join('<br>')}</p></div>` : ''}
            ${g.links.length ? `<div class="bs-btn-row">${g.links.map(link).join('')}</div>` : ''}</div></section>`).join('')
          : card(L2(['Tidak ditemukan', 'Not found']), emptyState(L2(['Tidak ada bagian yang cocok', 'No matching section']), L2(['Coba kata kunci lain.', 'Try another keyword.']), '', 'search'))}</div>
      </div></div>`;
  }

  /* Scenario Test — hasil disimpan di browser ini (terpisah dari data Demo/Live) */
  const SCN_KEY = 'branchSync.scenarioTests.v1';
  app.export({ SCN_KEY });
  app.scn = { tester: '', org: '', items: {} };
  try { Object.assign(app.scn, JSON.parse(localStorage.getItem(SCN_KEY) || '{}')); } catch (_) {}
  const scnFull = () => toast(L2(['Penyimpanan browser penuh — hapus beberapa foto bukti.', 'Browser storage is full — remove some evidence photos.']), { tone: 'bad' });
  const saveScn = () => {
    if (app.storageMode === 'idb') { STORE.set('scenarioTests', app.scn).catch(scnFull); return true; }
    try { localStorage.setItem(SCN_KEY, JSON.stringify(app.scn)); return true; } catch (_) { scnFull(); return false; }
  };
  app.export({ saveScn });
  const scnItem = no => (app.scn.items[no] ||= { result: '', notes: '', checks: [], evidence: [], updatedAt: null });
  app.export({ scnItem });
  const scnPeek = no => app.scn.items[no] || { result: '', notes: '', checks: [], evidence: [] };
  app.export({ scnPeek });
  const SCN_RESULTS = [['standard', ['Standar', 'Standard'], 'good'], ['partial', ['Kurang standar', 'Partially standard'], 'warn'], ['failed', ['Tidak dapat dijalankan', 'Cannot be run'], 'bad']];
  app.export({ SCN_RESULTS });
  const scnBadge = r => { const x = SCN_RESULTS.find(y => y[0] === r); return `<span class="bs-badge" data-tone="${x ? x[2] : 'neutral'}"><i></i>${esc(x ? L2(x[1]) : L2(['Belum diuji', 'Not tested']))}</span>`; };
  function autoEvidence(no) {
    const Ls = app.state.locations, im = issueMap(), lr = app.state.runs[0], fields = ['name', 'phone', 'hours', 'address', 'coords'];
    const cnt = (xs, f) => xs.filter(f).length, claimsOf = k => app.state.claims.filter(c => (k === 'Titik baru') === (c.kind === 'Titik baru'));
    const sla = slaStats(), bk = reportBuckets('30'), m30 = reportMetrics(bk.from, bk.to, { locs: Ls, codes: new Set(Ls.map(l => l.code)), filtered: false });
    const run = lr ? `Sinkronisasi terakhir ${lr.id}: ${lr.ok} berhasil, ${lr.fail} gagal, ${lr.skip} dilewati (${fmtDate(lr.time)})` : 'Belum ada sinkronisasi';
    const lines = {
      1: [`Total unit: ${Ls.length}`, `Unit tanpa listing Google: ${cnt(Ls, l => !l.google)}`, `Unit ditambah/diubah 24 jam terakhir: ${cnt(Ls, l => Date.now() - l.updatedAt < DAY)}`, `Impor tercatat di riwayat: ${cnt(app.state.audit, a => a.action === 'Mengimpor data massal')}`, run],
      2: [`Total unit: ${Ls.length}`, ...STATUSES.map(st => `${st}: ${cnt(Ls, l => l.status === st)}`), `Pencarian aktif: "${ui.loc.q || '-'}"`, `Filter aktif: ${FILTERS.flatMap(([k]) => ui.loc[k].map(v => `${k}=${v}`)).join(', ') || '-'}`, `Hasil daftar saat ini: ${locFiltered().length} unit`],
      3: [`Unit dengan ketidaksesuaian: ${im.size}`, ...fields.map(f => `${FIELD_LABEL[f]}: ${sum([...im.values()].map(x => x.filter(i => i.field === f).length))}`), `Catatan temuan: ${Object.keys(app.state.discNotes).length}`, `Keputusan tercatat di riwayat: ${cnt(app.state.audit, a => a.module === 'Ketidaksesuaian')}`],
      4: [`Total unit: ${Ls.length}`, `Waktu render halaman terakhir: ${ui.renderMs} ms`, `Ukuran layar: ${innerWidth}×${innerHeight}`, `Peramban: ${navigator.userAgent}`],
      5: [`Perubahan unit tercatat 24 jam terakhir: ${cnt(app.state.audit, a => a.module === 'Unit Kerja' && Date.now() - a.time < DAY)}`, `Unit masih berbeda dengan Google: ${im.size}`, run],
      6: [`Klaim (Get Verified/Suspend/Duplicate): ${claimsOf('x').length}`, `Selesai: ${cnt(claimsOf('x'), c => c.status === 'Selesai')}`, `Berjalan: ${cnt(claimsOf('x'), claimActive)}`, `Unit terverifikasi: ${cnt(Ls, l => l.gbp === 'Terverifikasi')}/${Ls.length}`, `Belum diklaim: ${cnt(Ls, l => l.gbp === 'Belum Diklaim')} · Suspend: ${cnt(Ls, l => l.gbp === 'Suspend')}`],
      7: [`Pengajuan titik baru: ${claimsOf('Titik baru').length}`, `Selesai: ${cnt(claimsOf('Titik baru'), c => c.status === 'Selesai')}`, `Berjalan: ${cnt(claimsOf('Titik baru'), claimActive)}`, `Ditolak: ${cnt(claimsOf('Titik baru'), c => c.status === 'Ditolak')}`],
      8: [`Pasangan duplikat terdeteksi: ${duplicatePairs().length}`, `Ditandai bukan duplikat: ${app.state.dupIgnored.length}`, `Unit berstatus Duplikat: ${cnt(Ls, l => l.gbp === 'Duplikat')}`, `Radius deteksi: ${app.state.settings.dupRadius} m`],
      9: [`Notifikasi edit eksternal: ${app.state.api.webhook ? 'aktif' : 'nonaktif'}`, `Menunggu: ${cnt(app.state.approvals, a => a.status === 'Menunggu')}`, `Disetujui: ${cnt(app.state.approvals, a => a.status === 'Disetujui')}`, `Ditolak: ${cnt(app.state.approvals, a => a.status === 'Ditolak')}`, `Entri riwayat eksternal: ${cnt(app.state.audit, a => a.actor === 'Eksternal')}`],
      10: [`Entri riwayat: ${app.state.audit.length}`, `Internal: ${cnt(app.state.audit, a => a.actor === 'Internal')}`, `Eksternal: ${cnt(app.state.audit, a => a.actor === 'Eksternal')}`, `Entri dengan detail sebelum–sesudah: ${cnt(app.state.audit, a => a.changes.length)}`, `Pengguna tercatat: ${new Set(app.state.audit.map(a => a.user)).size}`],
      11: [`Rata-rata proses internal: ${fmtDur(sla.avgInternal)}`, `Rata-rata verifikasi Google: ${fmtDur(sla.avgGoogle)}`, `Kepatuhan SLA internal: ${sla.compliance}%`, `Target internal: ${app.state.settings.slaInternal} jam · acuan Google: ${app.state.settings.slaGoogle} jam`, `Permintaan berisiko/lewat SLA: ${sla.atRisk}`],
      12: [`Kegagalan belum ditangani: ${openFailures().length}`, ...[...openFailures().reduce((mp, f) => mp.set(f.reason, (mp.get(f.reason) || 0) + 1), new Map())].map(([k, n]) => `· ${k}: ${n}`), `Kegagalan sudah diberi tindak lanjut: ${sum(app.state.runs.map(r => r.items.filter(i => i.status === 'Gagal' && i.resolved && i.note && !/^Berhasil/.test(i.note)).length))}`, run],
      13: [`Keberhasilan sync 30 hari: ${m30.rate == null ? '-' : m30.rate.toFixed(1) + '%'}`, `Rata-rata rating 30 hari: ${m30.avgRating == null ? '-' : m30.avgRating.toFixed(2)}`, `Tingkat balasan ulasan: ${m30.replyRate == null ? '-' : m30.replyRate.toFixed(1) + '%'}`, `Kepatuhan SLA internal: ${sla.compliance}%`, `Skenario teruji: ${CONTENT.scenarios.filter(x => scnPeek(x.no).result).length}/${CONTENT.scenarios.length}`]
    }[no] || [];
    return [`Bukti otomatis · ${isLive() ? `Live (${MODE.host()})` : 'Mode Demo'} · ${fmtDate(Date.now())}`, ...lines].join('\n');
  }
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) { reject(new Error(L2(['Berkas bukan gambar.', 'File is not an image.']))); return; }
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(L2(['Gambar tidak dapat dibaca.', 'The image could not be read.']))); };
      img.src = url;
    });
  }
  function viewScenarios() {
    const all = CONTENT.scenarios, groups = CONTENT.scenarioGroups, list = all.filter(x => !ui.scn.group || x.group === ui.scn.group);
    const counts = SCN_RESULTS.map(([k]) => all.filter(x => scnPeek(x.no).result === k).length), tested = sum(counts);
    const gName = id => L2((groups.find(g => g.id === id) || { title: [id, id] }).title);
    const navName = v => L2([navItem(v).label, (I18N.translate && I18N.translate(navItem(v).label)) || navItem(v).label]);
    const stepBtn = (x, st) => (st.go ? `<button type="button" class="bs-btn sm ghost" data-action="scn-go" data-id="${st.go}">${ic('arrowR')}<span>${esc(L2(['Buka', 'Open']))} ${esc(navName(st.go))}</span></button>` : st.act ? btn(esc(L2(['Jalankan', 'Run'])), 'scn-act', { id: `${x.no}|${st.act}`, icon: 'zap', variant: 'sm ghost' }) : '');
    const cardOf = x => {
      const it = scnPeek(x.no), open = ui.scn.open.has(x.no), checked = x.evidence.filter((_, i) => it.checks[i]).length;
      return `<details class="bs-scn" data-scn-no="${x.no}" ${open ? 'open' : ''}>
        <summary><span class="bs-scn-no">${x.no}</span><span class="bs-scn-title"><strong>${esc(L2(x.title))}</strong><small>${esc(gName(x.group))} · Mandatory · ${checked}/${x.evidence.length} ${esc(L2(['bukti', 'evidence']))}</small></span>${scnBadge(it.result)}${ic('chevD', 'bs-scn-caret')}</summary>
        <div class="bs-scn-body">
          <div class="bs-scn-meta"><div><h4>${L2(['Hasil yang diharapkan', 'Expected result'])}</h4><p>${esc(L2(x.expected))}</p></div><div><h4>${L2(['Catatan dokumen', 'Document note'])}</h4><p>${esc(L2(x.note))}</p></div></div>
          <h4>${L2(['Langkah pengujian di BranchSync', 'Test steps in BranchSync'])}</h4>
          <ol class="bs-scn-steps">${x.steps.map(st => `<li><span>${esc(L2(st.t))}</span>${stepBtn(x, st)}</li>`).join('')}</ol>
          <h4>${L2(['Bukti yang perlu dikumpulkan', 'Evidence to collect'])}</h4>
          <ul class="bs-scn-checks">${x.evidence.map((e, i) => `<li><label class="bs-checkline"><input type="checkbox" data-scn-check="${x.no}:${i}" ${it.checks[i] ? 'checked' : ''}><span>${esc(L2(e))}</span></label></li>`).join('')}</ul>
          ${it.evidence.length ? `<div class="bs-scn-evidence">${it.evidence.map((ev, i) => ev.type === 'image'
            ? `<figure class="bs-scn-photo"><button type="button" class="bs-scn-thumb" data-action="scn-ev-view" data-id="${x.no}:${i}" aria-label="${esc(L2(['Lihat foto bukti', 'View evidence photo']))} ${i + 1}"><img src="${ev.data}" alt=""></button><figcaption>${fmtDate(ev.time, { dateStyle: 'short', timeStyle: 'short' })}${btn('', 'scn-ev-del', { id: `${x.no}:${i}`, icon: 'trash', variant: 'icon sm ghost', title: L2(['Hapus bukti', 'Delete evidence']) })}</figcaption></figure>`
            : `<div class="bs-scn-auto"><pre>${esc(ev.text)}</pre>${btn('', 'scn-ev-del', { id: `${x.no}:${i}`, icon: 'trash', variant: 'icon sm ghost', title: L2(['Hapus bukti', 'Delete evidence']) })}</div>`).join('')}</div>` : ''}
          <div class="bs-btn-row bs-scn-actions">${btn(esc(L2(['Mulai skenario', 'Start scenario'])), 'scn-start', { id: x.no, icon: 'arrowR', variant: 'primary sm' })}${btn(esc(L2(['Ambil bukti otomatis', 'Capture auto evidence'])), 'scn-auto', { id: x.no, icon: 'zap', variant: 'sm' })}<label class="bs-btn sm bs-file">${ic('camera')}<span>${L2(['Unggah foto bukti', 'Upload evidence photo'])}</span><input type="file" accept="image/*" multiple class="bs-sr" data-scn-upload="${x.no}"></label></div>
          <fieldset class="bs-scn-result"><legend>${L2(['Hasil pengujian', 'Test result'])}</legend>${SCN_RESULTS.map(([k, lab, tone]) => `<label class="bs-scn-radio" data-tone="${tone}"><input type="radio" name="scn-res-${x.no}" value="${k}" data-scn-result="${x.no}" ${it.result === k ? 'checked' : ''}><span>${esc(L2(lab))}</span></label>`).join('')}</fieldset>
          <label class="bs-field"><span>${L2(['Catatan / temuan penguji', 'Tester notes / findings'])}</span><textarea rows="3" data-scn-notes="${x.no}" placeholder="${esc(L2(['Tulis hasil pengamatan, kendala, atau rekomendasi…', 'Write observations, issues, or recommendations…']))}">${esc(it.notes)}</textarea></label>
          ${it.updatedAt ? `<p class="bs-muted">${L2(['Terakhir diperbarui', 'Last updated'])} ${fmtDate(it.updatedAt)}</p>` : ''}
        </div></details>`;
    };
    const segs = SCN_RESULTS.map(([k, , tone], i) => (counts[i] ? `<span data-tone="${tone}" style="flex:${counts[i]}"></span>` : '')).join('') + (all.length - tested ? `<span data-tone="neutral" style="flex:${all.length - tested}"></span>` : '');
    return `<div class="bs-stack-20" data-no-i18n><div class="bs-print-head"><strong>${L2(['Laporan Hasil Scenario Test — BranchSync', 'Scenario Test Results Report — BranchSync'])}</strong><span>${L2(['Penguji', 'Tester'])}: ${esc(app.scn.tester || '-')} · ${esc(app.scn.org || '')} · ${L2(['Mode', 'Mode'])}: ${isLive() ? 'Live' : 'Demo'} · ${L2(['Dicetak', 'Printed'])}: ${fmtDate(Date.now())}</span></div>` +
      head('Scenario Test', L2(['Tutorial menjalankan 13 skenario uji piloting Dashboard BranchSync sesuai dokumen “Skenario Test Piloting”, lengkap dengan pencatatan hasil dan bukti.', 'A tutorial for running the 13 BranchSync dashboard piloting test scenarios from the “Piloting Test Scenario” document, with result and evidence recording.']),
        btn(esc(L2(['Ekspor CSV', 'Export CSV'])), 'scn-export', { icon: 'download' }) + btn(esc(L2(['Cetak / PDF', 'Print / PDF'])), 'scn-print', { icon: 'printer', variant: 'primary' })) +
      `<div class="bs-grid bs-grid-main">${card(L2(['Kemajuan pengujian', 'Test progress']), `<div class="bs-scn-progress"><strong>${tested}<small>/${all.length}</small></strong><span>${L2(['skenario sudah diuji', 'scenarios tested'])}</span></div><div class="bs-comp-bar bs-scn-bar" role="img" aria-label="${esc(SCN_RESULTS.map(([, lab], i) => `${L2(lab)} ${counts[i]}`).join(', '))}">${segs}</div>
        <ul class="bs-comp-legend">${SCN_RESULTS.map(([, lab, tone], i) => `<li><i data-tone="${tone}"></i><span>${esc(L2(lab))}</span><b>${counts[i]}</b></li>`).join('')}<li><i data-tone="neutral"></i><span>${esc(L2(['Belum diuji', 'Not tested']))}</span><b>${all.length - tested}</b></li></ul>`)}
        ${card(L2(['Informasi penguji', 'Tester information']), `<div class="bs-form-grid"><label class="bs-field"><span>${L2(['Nama penguji', 'Tester name'])}</span><input data-scn-meta="tester" value="${esc(app.scn.tester)}" maxlength="80" autocomplete="name"></label><label class="bs-field"><span>${L2(['Instansi / divisi', 'Organization / division'])}</span><input data-scn-meta="org" value="${esc(app.scn.org)}" maxlength="80"></label></div>
          <p class="bs-muted bs-gap">${L2(['Hasil disimpan di browser ini dan dapat diekspor sebagai bukti. Gunakan Mode Demo untuk latihan dan Live untuk pengujian resmi.', 'Results are saved in this browser and can be exported as evidence. Use Demo mode for practice and Live for official testing.'])}</p>${btn(esc(L2(['Reset hasil', 'Reset results'])), 'scn-reset', { icon: 'trash', variant: 'sm danger ghost' })}`)}</div>` +
      `<div class="bs-callout">${ic('info')}<p>${L2(['Cara memakai: buka skenario → klik <b>Mulai skenario</b> atau tombol di setiap langkah → lakukan pengujian → centang bukti, ambil bukti otomatis atau unggah foto → pilih hasil <b>Standar / Kurang standar / Tidak dapat dijalankan</b> dan tulis catatan.', 'How to use: open a scenario → click <b>Start scenario</b> or the button on each step → run the test → tick evidence, capture auto evidence or upload photos → choose <b>Standard / Partially standard / Cannot be run</b> and write notes.'])}</p></div>` +
      tabs('scn.group', [['', L2(['Semua', 'All']), all.length], ...groups.map(g => [g.id, L2(g.title), all.filter(x => x.group === g.id).length])], ui.scn.group, L2(['Kelompok skenario', 'Scenario groups'])) +
      tabPanel('scn.group', ui.scn.group, groups.filter(g => list.some(x => x.group === g.id)).map(g => `<section class="bs-scn-group"><h2 class="bs-scn-group-title">${esc(L2(g.title))}</h2>${list.filter(x => x.group === g.id).map(cardOf).join('')}</section>`).join('')) +
      `</div>`;
  }
  function scnStart(x, act) {
    navigate(x.start.view);
    const a = act || x.start.act;
    if (!a) return;
    setTimeout(() => {
      if (a === 'import-sample') { app.importDraft = null; importModal(sampleCSV(25)); }
      else if (a === 'claim-new') claimForm();
      else if (a === 'point-new') pointForm();
      else if (a === 'simulate-google') simulateGoogleChange();
      else if (a === 'simulate-edit') simulateEdit();
    }, 30);
  }
});
