'use strict';
/*
 * BranchSync Admin — Halaman Ulasan Google.
 * Modul views/reviews.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('views/reviews', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let acctOf, badge, btn, byCode, card, emptyState, esc, filterChips, fmtNum, head, ic, initials, isLive, locName, navItem, pct, REPLY_MAX,
    REPLY_TEMPLATES, searchF, selectF, sum, ui, when;
  app.imports(() => ({ acctOf, badge, btn, byCode, card, emptyState, esc, filterChips, fmtNum, head, ic, initials, isLive, locName, navItem, pct,
    REPLY_MAX, REPLY_TEMPLATES, searchF, selectF, sum, ui, when } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ reviewFiltered, reviewCard, ratingSummary, viewReviews });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * View: Ulasan Google
   * ------------------------------------------------------------------ */
  const stars = n => `<span class="bs-stars" role="img" aria-label="${n} dari 5 bintang">${'★'.repeat(n)}<span aria-hidden="true">${'★'.repeat(Math.max(0, 5 - n))}</span></span>`;
  app.export({ stars });
  function reviewScope() {
    const f = ui.reviews;
    return app.state.reviews.filter(rv => { const l = byCode().get(rv.code); return l && (!f.account || acctOf(l) === f.account) && (!f.location || rv.code === f.location); });
  }
  function reviewFiltered() {
    const f = ui.reviews, q = f.q.trim().toLowerCase();
    const xs = reviewScope().filter(rv => (!f.rating || rv.rating === Number(f.rating)) && (!f.status || (f.status === 'replied' ? !!rv.reply : !rv.reply)) &&
      (!q || `${rv.author} ${rv.text} ${rv.reply ? rv.reply.text : ''} ${locName(rv.code)}`.toLowerCase().includes(q)));
    const sorters = { newest: (a, b) => b.time - a.time, unreplied: (a, b) => (!!a.reply - !!b.reply) || b.time - a.time, lowest: (a, b) => a.rating - b.rating || b.time - a.time, highest: (a, b) => b.rating - a.rating || b.time - a.time };
    return xs.sort(sorters[f.sort] || sorters.newest);
  }
  function reviewCard(rv, { showLoc = true } = {}) {
    const l = byCode().get(rv.code), editing = ui.reviews.editing === rv.id;
    const draft = ui.reviews.drafts[rv.id] ?? (rv.reply ? rv.reply.text : '');
    const editor = `<div class="bs-reply-editor">
        <label class="bs-sr" for="rv-text-${esc(rv.id)}">Balasan untuk ${esc(rv.author)}</label>
        <textarea id="rv-text-${esc(rv.id)}" data-draft="${esc(rv.id)}" rows="3" maxlength="${REPLY_MAX}" placeholder="Tulis balasan yang sopan dan membantu…">${esc(draft)}</textarea>
        <div class="bs-reply-tools">
          <label class="bs-inline-select"><span class="bs-sr">Template balasan</span><select data-action-change="review-template" data-id="${esc(rv.id)}"><option value="">Pakai template…</option>${REPLY_TEMPLATES.map((t, i) => `<option value="${i}">${esc(t.label)}</option>`).join('')}</select></label>
          <small class="bs-char" id="rv-count-${esc(rv.id)}">${draft.length}/${fmtNum(REPLY_MAX)}</small><span class="bs-spacer"></span>
          ${btn('Batal', 'review-cancel', { id: rv.id, variant: 'sm ghost' })}${btn(rv.reply ? 'Simpan balasan' : 'Kirim balasan', 'review-send', { id: rv.id, icon: 'send', variant: 'sm primary' })}
        </div>
        <p class="bs-reply-hint">Balasan tampil publik di Google Maps sebagai pemilik “${esc(l ? l.name : 'unit')}”.</p></div>`;
    const reply = rv.reply && !editing ? `<div class="bs-reply"><div class="bs-reply-head"><strong>Balasan pemilik</strong><small>${esc(rv.reply.by || '')} · ${when(rv.reply.time)}</small><span class="bs-spacer"></span>${btn('', 'review-edit', { id: rv.id, icon: 'edit', variant: 'icon sm ghost', title: 'Ubah balasan' })}${btn('', 'review-delete', { id: rv.id, icon: 'trash', variant: 'icon sm ghost', title: 'Hapus balasan' })}</div><p>${esc(rv.reply.text)}</p></div>` : '';
    return `<article class="bs-review" data-low="${rv.rating <= 2}" aria-label="Ulasan ${esc(rv.author)}, ${rv.rating} bintang">
      <header><span class="bs-avatar sm" aria-hidden="true">${initials(rv.author)}</span><div class="bs-review-who"><strong>${esc(rv.author)}</strong><small>${stars(rv.rating)}<span>·</span>${when(rv.time)}</small></div>
        ${showLoc && l ? `<button type="button" class="bs-review-loc" data-action="open-loc" data-id="${esc(l.code)}" data-tab="reviews">${ic('pin')}<span>${esc(l.name)}</span></button>` : ''}${rv.reply ? badge('Berhasil', 'Dibalas') : badge('Menunggu', 'Belum dibalas')}</header>
      <p class="bs-review-text${rv.text ? '' : ' bs-muted'}">${rv.text ? esc(rv.text) : '(Hanya memberi rating, tanpa komentar)'}</p>
      ${reply}${editing ? editor : rv.reply ? '' : `<div class="bs-review-actions">${btn('Balas', 'review-reply', { id: rv.id, icon: 'chat', variant: 'sm' })}</div>`}
    </article>`;
  }
  function ratingSummary(scope, clickable = true) {
    const avg = scope.length ? sum(scope.map(r => r.rating)) / scope.length : 0, replied = scope.filter(r => r.reply).length;
    const dist = [5, 4, 3, 2, 1].map(n => [n, scope.filter(r => r.rating === n).length]), maxD = Math.max(1, ...dist.map(d => d[1]));
    const neg = scope.filter(r => r.rating <= 2 && !r.reply).length;
    return `<div class="bs-rating-summary"><div class="bs-rating-big"><strong>${avg ? avg.toFixed(1).replace('.', ',') : '—'}</strong>${stars(Math.round(avg))}<small>${fmtNum(scope.length)} ulasan</small></div>
      <div class="bs-rating-dist">${dist.map(([n, c]) => { const on = String(ui.reviews.rating) === String(n); return clickable ? `<button type="button" class="bs-rating-row${on ? ' is-active' : ''}" data-action="review-rating" data-id="${n}" aria-pressed="${on}" aria-label="Saring ${n} bintang: ${c} ulasan"><span>${n}★</span><span class="bs-bar-track"><span style="width:${(c / maxD) * 100}%"></span></span><small>${fmtNum(c)}</small></button>` : `<div class="bs-rating-row"><span>${n}★</span><span class="bs-bar-track"><span style="width:${(c / maxD) * 100}%"></span></span><small>${fmtNum(c)}</small></div>`; }).join('')}</div>
      <div class="bs-rating-kpis"><div><strong>${fmtNum(scope.length - replied)}</strong><small>Belum dibalas</small></div><div><strong>${pct(replied, scope.length)}%</strong><small>Tingkat balasan</small></div><div data-tone="${neg ? 'warn' : ''}"><strong>${fmtNum(neg)}</strong><small>Negatif belum dibalas</small></div></div></div>`;
  }
  function viewReviews() {
    // Bersihkan filter yang merujuk akun/lokasi yang tidak ada (mis. setelah ganti mode).
    if (ui.reviews.account && !(app.state.accounts || []).some(a => a.id === ui.reviews.account)) ui.reviews.account = '';
    if (ui.reviews.location && !byCode().has(ui.reviews.location)) ui.reviews.location = '';
    const f = ui.reviews, accounts = app.state.accounts || [], scope = reviewScope(), list = reviewFiltered(), shown = list.slice(0, f.limit);
    const perCode = new Map();
    app.state.reviews.forEach(rv => perCode.set(rv.code, (perCode.get(rv.code) || 0) + 1));
    const acctCount = id => app.state.reviews.filter(rv => acctOf(byCode().get(rv.code)) === id).length;
    const locOpts = app.state.locations.filter(l => perCode.has(l.code) && (!f.account || acctOf(l) === f.account)).sort((a, b) => a.name.localeCompare(b.name, 'id')).map(l => [l.code, `${l.name} (${perCode.get(l.code)})`]);
    const loc = f.location && byCode().get(f.location);
    const ctx = loc ? `<div class="bs-review-context">${ic('pin')}<div><strong>${esc(loc.name)}</strong><small>${esc(loc.address)} · ${esc((accounts.find(a => a.id === acctOf(loc)) || {}).name || '')}</small></div>${btn('Detail lokasi', 'open-loc', { id: loc.code, variant: 'sm' })}${btn('', 'review-clear-loc', { icon: 'x', variant: 'icon sm ghost', title: 'Tampilkan semua lokasi' })}</div>` : '';
    return head('Ulasan Google', navItem('reviews').desc, (isLive() ? btn('Muat ulang', 'live-retry', { icon: 'refresh' }) : btn('Simulasikan ulasan baru', 'simulate-review', { icon: 'zap' })) + btn('Ekspor CSV', 'export-reviews', { icon: 'download' })) +
      `<section class="bs-card"><div class="bs-card-body flush"><div class="bs-toolbar bs-review-pickers">
        ${selectF('reviews.account', 'Akun Google Business Profile', accounts.map(a => [a.id, `${a.name} (${acctCount(a.id)})`]), f.account, 'Semua akun')}
        ${selectF('reviews.location', 'Lokasi Maps', locOpts, f.location, 'Semua lokasi')}
      </div></div></section>` + ctx +
      card('Ringkasan rating', ratingSummary(scope), { sub: loc ? `Untuk ${esc(loc.name)}` : f.account ? `Untuk ${esc((accounts.find(a => a.id === f.account) || {}).name || '')}` : 'Semua akun dan lokasi · klik baris bintang untuk menyaring' }) +
      `<section class="bs-card"><div class="bs-card-body flush"><div class="bs-toolbar">
        ${searchF('reviews.q', 'Cari ulasan', f.q, 'Nama, isi ulasan, atau balasan…', 'bsReviewQ')}
        ${selectF('reviews.status', 'Status', [['unreplied', 'Belum dibalas'], ['replied', 'Sudah dibalas']], f.status)}
        ${selectF('reviews.sort', 'Urutkan', [['newest', 'Terbaru'], ['unreplied', 'Belum dibalas dulu'], ['lowest', 'Rating terendah'], ['highest', 'Rating tertinggi']], f.sort, '')}
      </div>
      ${filterChips('reviews')}
      <div class="bs-review-list">${shown.length ? shown.map(rv => reviewCard(rv)).join('') : emptyState('Tidak ada ulasan', 'Tidak ada ulasan yang cocok dengan pilihan akun, lokasi, atau filter ini.', '', 'star')}</div>
      ${list.length > shown.length ? `<div class="bs-more">${btn(`Tampilkan ${Math.min(20, list.length - shown.length)} lagi · ${fmtNum(list.length - shown.length)} tersisa`, 'review-more', { variant: 'sm' })}</div>` : ''}
      </div></section>`;
  }
});
