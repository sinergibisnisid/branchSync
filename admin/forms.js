'use strict';
/*
 * BranchSync Admin — Modal & formulir: unit, jam operasional, pemilih peta, impor/ekspor.
 * Modul forms.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('forms', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let $, badge, btn, byCode, byName, captureFocus, diff, distM, download, downloadCSV, esc, fmtDist, fmtNum, guard, HOURS, ic, isLive, issuesOf, L2,
    labelled, log, modal, navigate, offset, openDrawer, opts, parseCSV, pick, regionOf, remote, rng, runSync, SL, snapshot, STATUSES, STREETS, toast,
    touch, TYPES, ui;
  app.imports(() => ({ $, badge, btn, byCode, byName, captureFocus, diff, distM, download, downloadCSV, esc, fmtDist, fmtNum, guard, HOURS, ic,
    isLive, issuesOf, L2, labelled, log, modal, navigate, offset, openDrawer, opts, parseCSV, pick, regionOf, remote, rng, runSync, SL, snapshot,
    STATUSES, STREETS, toast, touch, TYPES, ui } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ openModal, showErrors, confirmModal, validateLoc, presetHours, formatHours, hoursError, hoursEditor, refreshHours, destroyPicker,
    pickerBlock, setPickInputs, placePin, mountPicker, syncPickerFromInputs, locationForm, noteModal, sampleCSV, startMapping, analyzeRows,
    downloadXlsx, xlsxTemplate, readImportFile, importModal, importErrorsCSV, commitImport });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * Modal & formulir
   * ------------------------------------------------------------------ */
  app.modalSubmit = null; app.modalTrigger = null;
  function openModal(title, bodyHtml, { submit = 'Simpan', onSubmit = null, wide = false, desc = '', danger = false, footer = null } = {}) {
    if (!modal.open) app.modalTrigger = captureFocus();
    app.modalSubmit = onSubmit;
    destroyPicker();
    modal.classList.toggle('is-wide', !!wide);
    modal.classList.toggle('is-xl', wide === 'xl');
    modal.innerHTML = `<form id="bsModalForm" novalidate><header class="bs-modal-head"><div><h2 id="bsModalTitle">${esc(title)}</h2>${desc ? `<p>${desc}</p>` : ''}</div>${btn('', 'modal-close', { icon: 'x', variant: 'icon ghost', title: 'Tutup' })}</header>
      <div class="bs-modal-body">${bodyHtml}<p class="bs-form-error" id="bsFormError" role="alert"></p></div>
      <footer class="bs-modal-foot">${footer ?? (btn('Batal', 'modal-close', { variant: 'ghost' }) + (onSubmit ? `<button type="submit" class="bs-btn ${danger ? 'danger' : 'primary'}">${submit}</button>` : ''))}</footer></form>`;
    if (!modal.open) modal.showModal();
    modal.querySelector('.bs-modal-body :is(input:not([type=hidden]):not([type=file]):not([disabled]), select:not([disabled]), textarea)')?.focus();
  }
  const closeModal = () => { if (modal.open) modal.close(); };
  app.export({ closeModal });
  const field = ({ name, label, type = 'text', value = '', options = null, hint = '', full = false, attrs = 'required' }) => {
    const control = type === 'select' ? `<select name="${name}" id="f-${name}" ${attrs}>${opts(options, value)}</select>`
      : type === 'textarea' ? `<textarea name="${name}" id="f-${name}" rows="3" ${attrs}>${esc(value)}</textarea>`
      : type === 'checkbox' ? '' : `<input name="${name}" id="f-${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'step="any"' : ''} ${attrs}>`;
    if (type === 'checkbox') return `<label class="bs-checkline ${full ? 'full' : ''}"><input type="checkbox" name="${name}" id="f-${name}" ${value ? 'checked' : ''}><span>${label}</span></label>`;
    return `<div class="bs-field${full ? ' full' : ''}"><label for="f-${name}">${label}</label>${control}<small class="bs-field-hint" id="h-${name}">${hint}</small></div>`;
  };
  const formGrid = fields => `<div class="bs-form-grid">${fields.map(field).join('')}</div>`;
  app.export({ formGrid });
  function showErrors(errors) {
    modal.querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
    modal.querySelectorAll('.bs-field-hint.is-error').forEach(n => { n.classList.remove('is-error'); n.textContent = n.dataset.hint || ''; });
    if (typeof errors === 'string') { $('bsFormError').textContent = errors; return; }
    $('bsFormError').textContent = 'Periksa kembali isian yang ditandai.';
    let first = null;
    Object.entries(errors).forEach(([k, msg]) => {
      const input = modal.querySelector(`[name="${k}"]`), hint = $(`h-${k}`);
      if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', `h-${k}`); first ||= input; }
      if (hint) { hint.dataset.hint ??= hint.textContent; hint.textContent = msg; hint.classList.add('is-error'); }
    });
    first?.focus();
  }
  /* Pola baku aksi berbahaya: judul menyebut objeknya (teks biasa, di-escape openModal),
   * isi menjelaskan dampaknya (HTML — escape nama di pemanggil), lalu satu kalimat penutup
   * apakah tindakan bisa diurungkan. Fokus awal di “Batal” supaya Enter tidak langsung menghapus.
   *   undo: false   → “Tindakan ini tidak bisa dibatalkan.”
   *         true    → bisa diurungkan lewat notifikasi (Mode Demo); di Live = tidak bisa
   *         'any'   → bisa diurungkan di kedua mode (data lokal, mis. tampilan tersimpan)
   *         string  → kalimat penutup khusus */
  function confirmModal(title, text, confirm, run, { danger = true, undo = false } = {}) {
    const canUndo = undo === 'any' || (undo === true && !isLive());
    const note = typeof undo === 'string' && undo !== 'any' ? undo : canUndo ? 'Anda bisa mengurungkannya lewat tombol “Urungkan” di notifikasi.' : 'Tindakan ini tidak bisa dibatalkan.';
    openModal(title, `${/^\s*</.test(text) ? text : `<p>${text}</p>`}${danger ? `<p class="bs-confirm-note" data-tone="${canUndo || typeof undo === 'string' ? 'info' : 'bad'}">${ic(canUndo ? 'undo' : 'alert')}<span>${note}</span></p>` : ''}`, { submit: confirm, danger, onSubmit: () => { run(); } });
    if (danger) modal.querySelector('.bs-modal-foot [data-action="modal-close"]')?.focus();
  }
  const inIndonesia = (lat, lng) => lat >= -11.5 && lat <= 6.5 && lng >= 94 && lng <= 141.5;
  function validateLoc(p, self) {
    const e = {};
    ['name', 'city', 'province', 'address'].forEach(k => { p[k] = String(p[k] ?? '').trim(); if (!p[k]) e[k] = 'Wajib diisi.'; });
    p.phone = String(p.phone ?? '').trim(); p.hours = String(p.hours ?? '').trim();
    if (!TYPES.includes(p.type)) e.type = 'Pilih tipe yang valid.';
    if (p.status && !STATUSES.includes(p.status)) e.status = 'Status tidak valid.';
    const lat = Number(p.lat), lng = Number(p.lng);
    if (String(p.lat).trim() === '' || !isFinite(lat)) e.lat = 'Isi angka latitude.';
    if (String(p.lng).trim() === '' || !isFinite(lng)) e.lng = 'Isi angka longitude.';
    if (!e.lat && !e.lng && !inIndonesia(lat, lng)) e.lat = 'Titik berada di luar wilayah Indonesia.';
    if (!e.name && (byName().get(p.name.toLowerCase()) || []).some(x => x !== self)) e.name = 'Nama ini sudah dipakai unit lain.';
    p.lat = String(p.lat).trim() !== '' && isFinite(lat) ? +lat.toFixed(6) : NaN;
    p.lng = String(p.lng).trim() !== '' && isFinite(lng) ? +lng.toFixed(6) : NaN;
    return e;
  }
  /* ---------- Jam operasional (seperti Google Business Profile) ---------- */
  const DAYS = [['mon', 'Senin', 'Sen'], ['tue', 'Selasa', 'Sel'], ['wed', 'Rabu', 'Rab'], ['thu', 'Kamis', 'Kam'], ['fri', 'Jumat', 'Jum'], ['sat', 'Sabtu', 'Sab'], ['sun', 'Minggu', 'Min']];
  app.export({ DAYS });
  const blankDays = () => Object.fromEntries(DAYS.map(([k]) => [k, { open: false, h24: false, ranges: [] }]));
  function presetHours(id) {
    const sp = blankDays();
    DAYS.forEach(([k], i) => {
      if (id === '24') Object.assign(sp[k], { open: true, h24: true });
      else if (id === 'mon-sat' && i < 6) Object.assign(sp[k], { open: true, ranges: [{ from: '08:00', to: '14:00' }] });
      else if (id === 'weekday' && i < 5) Object.assign(sp[k], { open: true, ranges: [{ from: '08:00', to: '15:00' }] });
    });
    return sp;
  }
  function parseHours(str) {
    const s0 = String(str || '').trim(), sp = blankDays(), short = DAYS.map(d => d[2]);
    if (!s0) return presetHours('weekday');
    let ok = false;
    s0.split(/;\s*/).forEach(seg => {
      let m = seg.match(/^Setiap hari\s+(.+)$/i), days, rest;
      if (m) { days = DAYS.map(d => d[0]); rest = m[1]; }
      else {
        m = seg.match(/^(Sen|Sel|Rab|Kam|Jum|Sab|Min)(?:\s*[–-]\s*(Sen|Sel|Rab|Kam|Jum|Sab|Min))?\s+(.+)$/);
        if (!m) return;
        const a = short.indexOf(m[1]), b = m[2] ? short.indexOf(m[2]) : a;
        days = [];
        for (let i = a; ; i = (i + 1) % 7) { days.push(DAYS[i][0]); if (i === b) break; }
        rest = m[3];
      }
      if (/^24 jam$/i.test(rest)) { days.forEach(k => Object.assign(sp[k], { open: true, h24: true, ranges: [] })); ok = true; return; }
      if (/^tutup$/i.test(rest)) { ok = true; return; }
      const ranges = [...rest.matchAll(/(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})/g)].map(r => ({ from: `${r[1].padStart(2, '0')}:${r[2]}`, to: `${r[3].padStart(2, '0')}:${r[4]}` }));
      if (!ranges.length) return;
      days.forEach(k => Object.assign(sp[k], { open: true, h24: false, ranges: ranges.map(r => ({ ...r })) }));
      ok = true;
    });
    return ok ? sp : presetHours('weekday');
  }
  function formatHours(sp) {
    const sig = k => (!sp[k].open ? 'X' : sp[k].h24 ? '24' : sp[k].ranges.map(r => `${r.from}-${r.to}`).join(','));
    const txt = k => (sp[k].h24 ? '24 jam' : sp[k].ranges.map(r => `${r.from.replace(':', '.')}–${r.to.replace(':', '.')}`).join(', '));
    if (sp.mon.open && DAYS.every(([k]) => sig(k) === sig('mon'))) return `Setiap hari ${txt('mon')}`;
    const groups = [];
    DAYS.forEach(([k, , sh]) => { const g = groups[groups.length - 1], sg = sig(k); if (g && g.sig === sg) g.end = sh; else groups.push({ sig: sg, start: sh, end: sh, k }); });
    const parts = groups.filter(g => g.sig !== 'X').map(g => `${g.start}${g.end !== g.start ? '–' + g.end : ''} ${txt(g.k)}`);
    return parts.length ? parts.join('; ') : 'Tutup';
  }
  function hoursError(sp) {
    if (!DAYS.some(([k]) => sp[k].open)) return 'Jam operasional: aktifkan minimal satu hari buka.';
    for (const [k, name] of DAYS) {
      const d = sp[k];
      if (!d.open || d.h24) continue;
      if (!d.ranges.length) return `Jam operasional ${name}: isi jam buka atau pilih 24 jam.`;
      const rs = [...d.ranges].sort((a, b) => a.from.localeCompare(b.from));
      for (let i = 0; i < rs.length; i++) {
        if (!rs[i].from || !rs[i].to) return `Jam operasional ${name}: lengkapi jam buka dan tutup.`;
        if (rs[i].to <= rs[i].from) return `Jam operasional ${name}: jam tutup harus setelah jam buka.`;
        if (i && rs[i].from < rs[i - 1].to) return `Jam operasional ${name}: rentang jam saling tumpang tindih.`;
      }
    }
    return '';
  }
  app.hoursDraft = null;
  function hoursEditor() {
    const sp = app.hoursDraft;
    return `<div class="bs-hours" id="bsHours" role="group" aria-label="Jam operasional">
      <div class="bs-hours-presets"><span>Preset:</span>${btn('Hari kerja 08.00–15.00', 'hours-preset', { id: 'weekday', variant: 'sm ghost' })}${btn('Sen–Sab 08.00–14.00', 'hours-preset', { id: 'mon-sat', variant: 'sm ghost' })}${btn('24 jam setiap hari', 'hours-preset', { id: '24', variant: 'sm ghost' })}</div>
      ${DAYS.map(([k, name]) => {
        const d = sp[k];
        const ranges = !d.open ? '' : d.h24 ? `<span class="bs-hours-24">${ic('clock')}Buka 24 jam</span>` : d.ranges.map((r, i) => `<div class="bs-hours-range"><input type="time" value="${r.from}" step="300" data-hours-from="${k}:${i}" aria-label="${name} buka pukul"><span aria-hidden="true">–</span><input type="time" value="${r.to}" step="300" data-hours-to="${k}:${i}" aria-label="${name} tutup pukul">${d.ranges.length > 1 ? btn('', 'hours-del', { id: `${k}:${i}`, icon: 'x', variant: 'icon sm ghost', title: `Hapus rentang ${name}` }) : ''}</div>`).join('');
        return `<div class="bs-hours-row${d.open ? '' : ' is-closed'}" data-day="${k}">
          <span class="bs-hours-day">${name}</span>
          <label class="bs-switch"><input type="checkbox" data-hours-open="${k}" ${d.open ? 'checked' : ''} aria-label="${name} buka"><span></span><em data-no-i18n>${d.open ? L2(['Buka', 'Open']) : L2(['Tutup', 'Closed'])}</em></label>
          <div class="bs-hours-ranges">${ranges}${d.open ? `<div class="bs-hours-opts">${!d.h24 && d.ranges.length < 3 ? btn('Tambah jam', 'hours-add', { id: k, icon: 'plus', variant: 'sm ghost' }) : ''}<label class="bs-checkline"><input type="checkbox" data-hours-allday="${k}" ${d.h24 ? 'checked' : ''}><span>24 jam</span></label></div>` : ''}</div>
        </div>`;
      }).join('')}
      <div class="bs-hours-foot">${btn('Terapkan Senin ke semua hari buka', 'hours-copy', { icon: 'copy', variant: 'sm' })}<span class="bs-hours-summary" data-no-i18n>${ic('clock')}<b id="bsHoursSummary">${esc(formatHours(sp))}</b></span></div>
    </div>`;
  }
  function refreshHours(focusSel) {
    const el = $('bsHours'); if (!el) return;
    el.outerHTML = hoursEditor();
    if (focusSel) modal.querySelector(focusSel)?.focus();
  }
  const updateHoursSummary = () => { const el = $('bsHoursSummary'); if (el) el.textContent = formatHours(app.hoursDraft); };
  app.export({ updateHoursSummary });

  /* ---------- Peta pemilih titik lokasi ---------- */
  let pickMap = null, pickMarker = null, pickSelf = null;
  function destroyPicker() { if (pickMap) { pickMap.remove(); pickMap = null; pickMarker = null; } }
  function pickerBlock(lat, lng) {
    return `<div class="bs-picker">
      <div class="bs-pick-map" id="bsPickMap" role="application" aria-label="Peta pemilihan titik lokasi"></div>
      <div class="bs-picker-side">
        ${field({ name: 'lat', label: 'Latitude', type: 'number', value: lat ?? '', hint: 'Contoh: -6.9175' })}
        ${field({ name: 'lng', label: 'Longitude', type: 'number', value: lng ?? '', hint: 'Contoh: 107.6191' })}
        <div class="bs-btn-row">${btn('Gunakan lokasi saya', 'pick-geo', { icon: 'locate', variant: 'sm' })}${btn('Pusatkan ke titik', 'pick-center', { icon: 'pin', variant: 'sm ghost' })}</div>
        <p class="bs-pick-near" id="bsPickNear" role="status" aria-live="polite"></p>
      </div></div>`;
  }
  function pickNearest(lat, lng) {
    const out = $('bsPickNear'); if (!out) return;
    if (!isFinite(lat) || !isFinite(lng)) { out.textContent = 'Klik peta untuk menandai titik lokasi.'; out.dataset.tone = ''; return; }
    let best = null;
    app.state.locations.forEach(l => { if (l === pickSelf) return; const d = distM(l, { lat, lng }); if (!best || d < best.d) best = { l, d }; });
    if (!best) { out.textContent = ''; return; }
    out.dataset.tone = best.d <= app.state.settings.dupRadius ? 'warn' : '';
    out.textContent = `Unit terdekat: ${best.l.name} — ${fmtDist(best.d)}${best.d <= app.state.settings.dupRadius ? ' (kemungkinan duplikat)' : ''}`;
  }
  function setPickInputs(ll) {
    const la = modal.querySelector('[name="lat"]'), ln = modal.querySelector('[name="lng"]');
    if (la) la.value = ll.lat.toFixed(6);
    if (ln) ln.value = ll.lng.toFixed(6);
    pickNearest(ll.lat, ll.lng);
  }
  function placePin(ll, pan) {
    if (!pickMap) return;
    if (!pickMarker) {
      pickMarker = L.marker(ll, { draggable: true, keyboard: true, title: 'Titik lokasi — geser untuk memindahkan', icon: L.divIcon({ className: 'bs-pin', html: '<span></span>', iconSize: [28, 38], iconAnchor: [14, 36] }) }).addTo(pickMap);
      pickMarker.on('dragend', () => setPickInputs(pickMarker.getLatLng()));
    } else pickMarker.setLatLng(ll);
    if (pan) pickMap.setView(ll, Math.max(pickMap.getZoom(), 15));
  }
  function mountPicker(lat, lng, self) {
    destroyPicker();
    pickSelf = self || null;
    const el = $('bsPickMap'); if (!el) return;
    const has = isFinite(Number(lat)) && isFinite(Number(lng)) && lat !== '' && lat != null;
    if (typeof L === 'undefined') { el.innerHTML = `<div class="bs-map-fallback">${ic('map')}<p>Peta tidak dapat dimuat. Isi koordinat secara manual.</p></div>`; pickNearest(Number(lat), Number(lng)); return; }
    pickMap = L.map(el, { zoomControl: true }).setView(has ? [Number(lat), Number(lng)] : [-2.5, 118], has ? 16 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(pickMap);
    app.state.locations.filter(l => l !== pickSelf).slice(0, 2000).forEach(l => L.circleMarker([l.lat, l.lng], { radius: 4, color: '#fff', weight: 1, fillColor: '#8a97a8', fillOpacity: 0.9 }).bindTooltip(l.name).addTo(pickMap));
    if (has) placePin([Number(lat), Number(lng)]);
    pickMap.on('click', e => { placePin(e.latlng); setPickInputs(e.latlng); });
    pickNearest(Number(lat), Number(lng));
    setTimeout(() => pickMap && pickMap.invalidateSize(), 120);
  }
  function syncPickerFromInputs() {
    const lat = Number(modal.querySelector('[name="lat"]')?.value), lng = Number(modal.querySelector('[name="lng"]')?.value);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    placePin([lat, lng], true);
    pickNearest(lat, lng);
  }

  function locationForm(code) {
    if (!guard('locations.write')) return;
    const l = code ? byCode().get(code) : null;
    app.hoursDraft = l?.hoursSpec ? JSON.parse(JSON.stringify(l.hoursSpec)) : parseHours(l?.hours || HOURS[0]);
    openModal(l ? `Edit ${l.name}` : 'Tambah unit kerja',
      `<h3 class="bs-form-section">Informasi dasar</h3>` + formGrid([
        { name: 'name', label: 'Nama unit', value: l?.name, full: true, hint: 'Contoh: KCP Bandung Dago' },
        { name: 'type', label: 'Tipe', type: 'select', options: TYPES, value: l?.type || 'KCP' },
        { name: 'status', label: 'Status operasional', type: 'select', options: labelled(STATUSES), value: l?.status || 'Belum Sync' },
        { name: 'city', label: 'Kota', value: l?.city }, { name: 'province', label: 'Provinsi', value: l?.province },
        { name: 'address', label: 'Alamat', value: l?.address, full: true },
        { name: 'phone', label: 'Telepon', value: l?.phone, attrs: '' }
      ]) +
      `<h3 class="bs-form-section">Titik lokasi</h3><p class="bs-form-help">Klik peta atau geser penanda untuk menandai titik. Koordinat juga dapat diketik.</p>` + pickerBlock(l?.lat, l?.lng) +
      `<h3 class="bs-form-section">Jam operasional</h3><p class="bs-form-help">Atur jam buka setiap hari seperti di Google Business Profile.</p>` + hoursEditor(), {
      wide: 'xl', desc: l ? 'Perubahan dicatat di Riwayat beserta nilai sebelum dan sesudahnya.' : 'Unit baru berstatus “Belum sinkron” sampai disinkronkan ke Google.',
      submit: l ? 'Simpan perubahan' : 'Tambah unit',
      onSubmit: p => {
        const herr = hoursError(app.hoursDraft);
        if (herr) return herr;
        p.hours = formatHours(app.hoursDraft);
        const e = validateLoc(p, l);
        if (Object.keys(e).length) return e;
        p.region = regionOf(p.province);
        p.hoursSpec = JSON.parse(JSON.stringify(app.hoursDraft));
        if (l) {
          const changes = diff(l, p, ['name', 'type', 'status', 'city', 'province', 'address', 'phone', 'hours', 'lat', 'lng']);
          if (!changes.length) return 'Tidak ada perubahan untuk disimpan.';
          Object.assign(l, p, { updatedAt: Date.now(), updatedBy: app.ME.name });
          log('Unit Kerja', 'Memperbarui unit', { target: l.code, changes });
          const done = () => toast(`${l.name} diperbarui (${changes.length} kolom).`, { tone: 'good', action: issuesOf(l).length ? { label: 'Sinkronkan', run: () => runSync([l.code], { label: l.name }) } : null });
          if (isLive()) remote('PATCH', `/locations/${encodeURIComponent(l.code)}`, p).then(ok => ok && toast(`${p.name} tersimpan di server.`, { tone: 'good' })); else done();
        } else {
          const code2 = `DM-${String(++app.state.seq.loc).padStart(3, '0')}`;
          app.state.locations.unshift({ ...p, code: code2, status: p.status || 'Belum Sync', gbp: 'Belum Diklaim', google: null, updatedAt: Date.now(), updatedBy: app.ME.name, lastSync: null });
          log('Unit Kerja', 'Menambahkan unit', { target: code2, detail: p.name });
          if (isLive()) remote('POST', '/locations', p).then(ok => ok && toast(`${p.name} ditambahkan ke server.`, { tone: 'good' }));
          else toast(`${p.name} ditambahkan.`, { tone: 'good', action: { label: 'Lihat', run: () => openDrawer(code2) } });
        }
      }
    });
    mountPicker(l?.lat, l?.lng, l);
  }
  function noteModal(title, label, onSave, value = '') {
    openModal(title, formGrid([{ name: 'text', label, type: 'textarea', value, full: true, attrs: 'required maxlength="500"' }]), {
      submit: 'Simpan catatan', onSubmit: p => { const t = String(p.text || '').trim(); if (!t) return { text: 'Catatan wajib diisi.' }; onSave(t); }
    });
  }

  /* Impor CSV / Excel (.xlsx) dengan pemetaan kolom */
  const COLS = {
    kode: 'code', code: 'code', 'kode unit': 'code', 'kode toko': 'code', storecode: 'code', 'store code': 'code',
    nama: 'name', name: 'name', 'nama unit': 'name', 'nama lokasi': 'name', 'nama kantor': 'name', 'business name': 'name',
    tipe: 'type', type: 'type', jenis: 'type', 'tipe unit': 'type', 'jenis unit': 'type', locationtype: 'type', 'location type': 'type',
    kota: 'city', city: 'city', 'kab/kota': 'city', 'kabupaten/kota': 'city', kabupaten: 'city', locality: 'city',
    provinsi: 'province', province: 'province', 'administrative area': 'province',
    alamat: 'address', address: 'address', 'alamat lengkap': 'address', 'address line 1': 'address',
    telepon: 'phone', phone: 'phone', telp: 'phone', 'no telepon': 'phone', 'no. telepon': 'phone', 'nomor telepon': 'phone', 'primary phone': 'phone',
    jam: 'hours', 'jam operasional': 'hours', 'jam buka': 'hours', hours: 'hours', 'opening hours': 'hours',
    lat: 'lat', latitude: 'lat', lintang: 'lat', lng: 'lng', lon: 'lng', long: 'lng', longitude: 'lng', bujur: 'lng',
    status: 'status', 'status unit': 'status'
  };
  const normHead = h => String(h ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[*]/g, ' ').replace(/[_\s]+/g, ' ').trim();
  // Nilai tipe dari sistem lain (mis. ekspor Google Business Profile) → tipe BranchSync.
  const TYPE_ALIAS = { kc: 'Kantor Cabang', cabang: 'Kantor Cabang', branch: 'Kantor Cabang', hq: 'Kantor Cabang', 'head office': 'Kantor Cabang', kcp: 'KCP', 'kantor cabang pembantu': 'KCP', 'sub branch': 'KCP', subbranch: 'KCP', 'bri unit': 'Unit', teras: 'Unit', crm: 'ATM' };
  const IMPORT_FIELDS = [
    ['code', 'Kode unit', false], ['name', 'Nama unit', true], ['type', 'Tipe', true], ['city', 'Kota/Kabupaten', true], ['province', 'Provinsi', true],
    ['address', 'Alamat', true], ['phone', 'Telepon', false], ['hours', 'Jam operasional', false], ['lat', 'Latitude', true], ['lng', 'Longitude', true], ['status', 'Status', false]
  ];
  const TEMPLATE_HEAD = ['kode', 'nama', 'tipe', 'kota', 'provinsi', 'alamat', 'telepon', 'jam', 'lat', 'lng', 'status'];
  const IMPORT_MAX_ROWS = 20000, IMPORT_MAX_BYTES = 10 * 1024 * 1024, IMPORT_PREVIEW = 200;
  // importDraft: { stage: 'input' | 'map' | 'review', text, source: { name, kind }, header, rows: [{ line, cells }], map: { field: index }, items, error, busy }
  app.importDraft = null;
  function sampleCSV(n = 25) {
    const r = rng(Date.now() % 100000), base = app.state.locations.filter(l => l.type === 'Kantor Cabang');
    const lines = [TEMPLATE_HEAD.join(',')];
    for (let i = 0; i < n; i++) {
      const b = base[i % base.length], p = offset(b.lat, b.lng, 1500 + r() * 6000, r() * 6.28), type = pick(r, ['KCP', 'Unit', 'ATM']);
      const name = `${type === 'ATM' ? 'ATM BRI' : type === 'Unit' ? 'BRI Unit' : 'KCP'} ${b.city} ${pick(r, ['Raya', 'Baru', 'Timur', 'Barat', 'Utara', 'Selatan', 'Indah', 'Jaya'])} ${i + 1}`;
      const bad = i === 7 ? 'lat' : i === 15 ? 'status' : '';
      lines.push(['', name, type, b.city, b.province, `Jl. ${pick(r, STREETS)} No. ${10 + i}`, `(0${21 + i}) 77${1000 + i}`, type === 'ATM' ? HOURS[3] : HOURS[0], bad === 'lat' ? '' : p.lat.toFixed(5), p.lng.toFixed(5), bad === 'status' ? 'Aktif?' : 'Belum Sync'].map(v => /[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(','));
    }
    return lines.join('\n');
  }
  const cellText = v => v == null ? '' : v instanceof Date ? (isNaN(v) ? '' : v.toISOString().slice(0, 10)) : String(v).trim();
  const decimalText = v => String(v ?? '').trim().replace(/^(-?\d+),(\d+)$/, '$1.$2'); // "−6,2" (desimal koma) → "-6.2"
  function autoMap(header) {
    const map = {};
    header.forEach((h, j) => { const f = COLS[normHead(h)]; if (f && map[f] == null) map[f] = j; });
    return map;
  }
  function startMapping(rows, source, text = '') {
    const body = [];
    rows.forEach((r, i) => { const cells = (r || []).map(cellText); if (cells.some(c => c !== '')) body.push({ line: i + 1, cells }); });
    const fail = error => { app.importDraft = { stage: 'input', text, source, error }; importModal(); };
    if (body.length < 2) return fail('Data kosong. Sertakan baris judul kolom dan minimal satu baris data.');
    if (body.length - 1 > IMPORT_MAX_ROWS) return fail(`File berisi ${fmtNum(body.length - 1)} baris — maksimal ${fmtNum(IMPORT_MAX_ROWS)} baris per impor. Bagi file menjadi beberapa bagian.`);
    const headRow = body.shift(), width = Math.max(headRow.cells.length, ...body.slice(0, 50).map(r => r.cells.length));
    const header = Array.from({ length: width }, (_, j) => headRow.cells[j] || `Kolom ${j + 1}`);
    app.importDraft = { stage: 'map', text, source, header, rows: body, map: autoMap(headRow.cells) };
    importModal();
  }
  function mapIssues(d) {
    const missing = IMPORT_FIELDS.filter(([k, , req]) => req && d.map[k] == null).map(([, l]) => l);
    const byCol = {};
    IMPORT_FIELDS.forEach(([k, l]) => { const j = d.map[k]; if (j != null) (byCol[j] = byCol[j] || []).push(l); });
    const dupes = Object.entries(byCol).filter(([, ls]) => ls.length > 1).map(([j, ls]) => ({ col: d.header[j], fields: ls }));
    const used = new Set(Object.values(d.map).filter(j => j != null).map(Number));
    return { missing, dupes, unused: d.header.filter((_, j) => !used.has(j)) };
  }
  function analyzeRows(d) {
    const seenNames = new Set(), seenCodes = new Set();
    const items = d.rows.map(({ line, cells }) => {
      const p = {};
      IMPORT_FIELDS.forEach(([k]) => { const j = d.map[k]; p[k] = j == null ? '' : String(cells[j] ?? '').trim(); });
      p.lat = decimalText(p.lat); p.lng = decimalText(p.lng);
      const tv = p.type.toLowerCase().replace(/[_-]+/g, ' ').trim();
      p.type = TYPES.find(t => t.toLowerCase() === tv) || TYPE_ALIAS[tv] || p.type;
      p.status = STATUSES.find(t => t.toLowerCase() === p.status.toLowerCase() || SL(t).toLowerCase() === p.status.toLowerCase()) || p.status || 'Belum Sync';
      const existing = p.code ? byCode().get(p.code) : null;
      const e = validateLoc(p, existing);
      if (p.code && !existing && !/^[A-Za-z0-9._-]{1,40}$/.test(p.code)) e.code = 'Kode hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung (maks. 40 karakter).';
      if (p.code && seenCodes.has(p.code)) e.code = 'Kode ganda di dalam file.';
      if (p.code) seenCodes.add(p.code);
      const key = String(p.name).toLowerCase();
      if (!e.name && seenNames.has(key)) e.name = 'Nama ganda di dalam file.';
      seenNames.add(key);
      return { line, p, existing, errors: Object.values(e) };
    });
    items.sort((a, b) => (b.errors.length ? 1 : 0) - (a.errors.length ? 1 : 0) || a.line - b.line); // baris bermasalah di atas
    return items;
  }
  // Pustaka Excel dimuat hanya saat dibutuhkan, dengan versi terkunci + Subresource Integrity.
  const LIBS = {
    readXlsx: { url: 'https://cdn.jsdelivr.net/npm/read-excel-file@9.3.12/bundle/read-excel-file.min.js', sri: 'sha384-yfXfzfpiOwy96Yoz4xMnb3z0AXgn4IPyMQGQzh+rI0zcS+3Td3wbGbWEi06HHoY/', global: 'readXlsxFile' },
    writeXlsx: { url: 'https://cdn.jsdelivr.net/npm/write-excel-file@4.1.1/bundle/write-excel-file.min.js', sri: 'sha384-PqyMI+TlxmsEGcLLga739J/rsLoCKr/R2q8RkIuchh3vRaDL7hvRkWpMG6YZbChH', global: 'writeXlsxFile' }
  };
  const libJobs = {};
  function loadLib(key) {
    const L = LIBS[key], fn = () => { const g = window[L.global]; return typeof g === 'function' ? g : g && g.default; };
    if (fn()) return Promise.resolve(fn());
    return libJobs[key] || (libJobs[key] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = L.url; s.integrity = L.sri; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.async = true;
      s.onload = () => fn() ? resolve(fn()) : reject(new Error('Pustaka Excel tidak lengkap.'));
      s.onerror = () => { delete libJobs[key]; s.remove(); reject(new Error('Pustaka Excel gagal dimuat. Periksa koneksi internet, atau gunakan format CSV.')); };
      document.head.append(s);
    }));
  }
  // Teks yang diawali = + - @ diberi apostrof agar tidak dijalankan sebagai rumus (sama dengan CSV).
  const safeCell = v => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s; };
  async function downloadXlsx(name, sheets) {
    const write = await loadLib('writeXlsx');
    const data = sheets.map(sh => ({
      sheet: sh.name, columns: sh.widths ? sh.widths.map(width => ({ width })) : undefined,
      data: sh.rows.map((r, i) => r.map(v => i === 0 && sh.head !== false ? { value: String(v), type: String, fontWeight: 'bold', backgroundColor: '#00529C', color: '#FFFFFF' }
        : typeof v === 'number' && isFinite(v) ? { value: v, type: Number } : v == null || v === '' ? null : { value: safeCell(v), type: String }))
    }));
    const blob = await write(data.length === 1 ? data[0].data : data, data.length === 1 ? { sheet: data[0].sheet, columns: data[0].columns } : undefined).toBlob();
    download(name, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  async function xlsxTemplate() {
    const rows = parseCSV(sampleCSV(3)).map((r, i) => i ? r.map((v, j) => ['lat', 'lng'].includes(TEMPLATE_HEAD[j]) && v !== '' ? Number(v) : v) : r);
    const guide = [
      ['Petunjuk impor BranchSync', 'BranchSync import guide'],
      ['Isi sheet “Data” mulai baris 2. Judul kolom boleh berbeda — Anda dapat memetakannya saat impor.', 'Fill in the “Data” sheet from row 2. Column names may differ — you can map them during import.'],
      ['Kolom wajib: nama, tipe, kota, provinsi, alamat, lat, lng.', 'Required columns: nama (name), tipe (type), kota (city), provinsi (province), alamat (address), lat, lng.'],
      [`Tipe: ${TYPES.join(', ')} (juga dikenali: KC, BRANCH, HQ, SUB_BRANCH).`, `Type: ${TYPES.join(', ')} (also recognised: KC, BRANCH, HQ, SUB_BRANCH).`],
      [`Status (opsional): ${STATUSES.join(', ')}. Kosong = Belum Sync.`, `Status (optional): ${STATUSES.join(', ')}. Empty = Belum Sync (not synced).`],
      ['Kode (opsional): isi kode unit yang ada untuk memperbarui datanya, atau kode toko baru untuk unit baru.', 'Code (optional): an existing location code updates that location; a new store code is used for the new location.'],
      ['Koordinat memakai titik desimal, contoh: -6.2146 dan 106.8451.', 'Coordinates use a decimal point, e.g. -6.2146 and 106.8451.']
    ].map(x => [L2(x)]);
    await downloadXlsx('template-impor-unit-kerja.xlsx', [
      { name: 'Data', rows, widths: [12, 34, 14, 18, 20, 36, 18, 24, 12, 12, 14] },
      { name: L2(['Petunjuk', 'Guide']), rows: guide, widths: [100], head: true }
    ]);
  }
  async function readImportFile(file) {
    const fail = error => { app.importDraft = { stage: 'input', text: '', error }; importModal(); };
    if (/\.xls$/i.test(file.name)) return fail('Format .xls (Excel 97–2003) tidak didukung. Simpan ulang sebagai .xlsx atau CSV.');
    if (file.size > IMPORT_MAX_BYTES) return fail(`Ukuran file ${(file.size / 1048576).toFixed(1)} MB — maksimal 10 MB.`);
    const xlsx = /\.xlsx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    app.importDraft = { stage: 'input', text: '', busy: `Membaca ${file.name}…` }; importModal();
    try {
      let rows, text = '', sheet = '';
      if (xlsx) {
        const read = await loadLib('readXlsx'), out = await read(file);
        if (Array.isArray(out) && out.length && Array.isArray(out[0])) rows = out; // format lama: langsung baris
        else {
          const sheets = (out || []).filter(s => s && Array.isArray(s.data) && s.data.length);
          const pickS = sheets.find(s => Object.keys(autoMap(s.data[0] || [])).length >= 2) || sheets[0];
          rows = pickS ? pickS.data : []; sheet = pickS ? pickS.sheet : '';
        }
      } else { text = await file.text(); rows = parseCSV(text); }
      if (!modal.open || !app.importDraft || !app.importDraft.busy) return; // dialog sudah ditutup
      startMapping(rows, { name: file.name, kind: xlsx ? 'xlsx' : 'csv', sheet }, text.length <= 200000 ? text : '');
    } catch (e) { if (modal.open) fail(`File tidak dapat dibaca: ${e.message}`); }
  }
  function importModal() {
    if (!guard('locations.import')) return;
    const d = app.importDraft || (app.importDraft = { stage: 'input', text: '' });
    const order = ['input', 'map', 'review'], at = order.indexOf(d.stage);
    const steps = ['Unggah atau tempel data', 'Petakan kolom', 'Periksa hasil', 'Impor'].map((s, i) => `<li class="${i < at ? 'is-done' : i === at ? 'is-current' : ''}"${i === at ? ' aria-current="step"' : ''}>${s}</li>`).join('');
    const src = d.source ? `<p class="bs-import-source">${ic(d.source.kind === 'xlsx' ? 'file' : 'clipboard')}<span><strong>${esc(d.source.name)}</strong>${d.source.sheet ? ` · sheet “${esc(d.source.sheet)}”` : ''} · ${fmtNum(d.rows ? d.rows.length : 0)} baris data</span></p>` : '';
    let body = '', footer = '';
    if (d.stage === 'input') {
      body = `<div class="bs-import-input">
        <div class="bs-btn-row">${btn('Template Excel', 'import-template-xlsx', { icon: 'download', variant: 'sm' })}${btn('Template CSV', 'import-template', { icon: 'download', variant: 'sm ghost' })}${btn('Isi contoh 25 unit baru', 'import-sample', { icon: 'zap', variant: 'sm ghost' })}
          <label class="bs-btn sm primary bs-file">${ic('upload')}<span>Pilih file Excel / CSV</span><input type="file" id="bsImportFile" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="bs-sr"></label></div>
        <div class="bs-field full"><label for="bsImportText">Atau tempel data CSV</label><textarea id="bsImportText" name="csv" rows="8" spellcheck="false" placeholder="${TEMPLATE_HEAD.join(',')}">${esc(d.text || '')}</textarea><small class="bs-field-hint">Excel (.xlsx, sheet pertama yang berisi judul kolom) atau CSV dengan pemisah koma/titik koma. Maks. ${fmtNum(IMPORT_MAX_ROWS)} baris, 10 MB. Judul kolom boleh berbeda — Anda memetakannya di langkah berikutnya.</small></div>
        <p class="bs-import-busy" role="status" aria-live="polite">${d.busy ? `<span class="bs-spinner sm" aria-hidden="true"></span>${esc(d.busy)}` : ''}</p>
        ${d.error ? `<p class="bs-form-error" role="alert">${esc(d.error)}</p>` : ''}
      </div>`;
      footer = btn('Batal', 'modal-close', { variant: 'ghost' }) + btn('Lanjut: petakan kolom', 'import-parse', { icon: 'arrowR', variant: 'primary', attrs: d.busy ? 'disabled' : '' });
    } else if (d.stage === 'map') {
      const iss = mapIssues(d);
      const sample = j => { if (j == null) return '<span class="bs-muted">—</span>'; const v = d.rows.slice(0, 20).map(r => r.cells[j]).filter(Boolean).slice(0, 2); return v.length ? `<span class="bs-samples">${v.map(x => `<code title="${esc(String(x).slice(0, 200))}">${esc(String(x).slice(0, 60))}</code>`).join('')}</span>` : '<span class="bs-muted">kosong</span>'; };
      body = `${src}<p class="bs-muted bs-gap-b">Pilih kolom file untuk setiap data BranchSync. Kolom yang namanya dikenali sudah dipilihkan otomatis — periksa kembali sebelum lanjut.</p>
        <div class="bs-table-wrap bs-import-map" role="region" aria-label="Pemetaan kolom" tabindex="0"><table class="bs-table bs-cards"><thead><tr><th scope="col">Data BranchSync</th><th scope="col">Kolom di file</th><th scope="col">Contoh nilai</th></tr></thead><tbody>
        ${IMPORT_FIELDS.map(([k, l, req]) => { const j = d.map[k]; return `<tr class="${req && j == null ? 'is-error' : ''}"><th scope="row" data-label="Data BranchSync"><label for="bsMap-${k}">${l}</label>${req ? ' <span class="bs-req-badge">Wajib</span>' : ''}${k === 'type' ? '<small class="bs-field-hint">KC, BRANCH, HQ → Kantor Cabang · SUB_BRANCH → KCP</small>' : k === 'code' ? '<small class="bs-field-hint">Kode yang ada = perbarui unit</small>' : ''}</th>
          <td data-label="Kolom di file"><select id="bsMap-${k}" data-import-map="${k}"${req ? ' aria-required="true"' : ''}><option value="">— Tidak dipakai —</option>${d.header.map((h, i) => `<option value="${i}"${i === j ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select></td>
          <td data-label="Contoh nilai" class="bs-td-wrap">${sample(j)}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div aria-live="polite">${iss.missing.length ? `<p class="bs-form-error">${ic('alert')}Kolom wajib belum dipetakan: ${esc(iss.missing.join(', '))}.</p>` : ''}
        ${iss.dupes.map(x => `<p class="bs-form-error">${ic('alert')}Kolom “${esc(x.col)}” dipakai untuk lebih dari satu data: ${esc(x.fields.join(', '))}.</p>`).join('')}</div>
        ${iss.unused.length ? `<p class="bs-muted bs-import-unused">Kolom file yang tidak diimpor: ${esc(iss.unused.join(', '))}</p>` : ''}`;
      const blocked = iss.missing.length || iss.dupes.length;
      footer = btn('Kembali', 'import-back', { icon: 'arrowL', variant: 'ghost' }) + btn('Batal', 'modal-close', { variant: 'ghost' }) + btn('Periksa data', 'import-check', { icon: 'check', variant: 'primary', attrs: blocked ? 'disabled' : '' });
    } else {
      const ok = d.items.filter(x => !x.errors.length), bad = d.items.length - ok.length, upd = ok.filter(x => x.existing).length, shown = d.items.slice(0, IMPORT_PREVIEW);
      body = `${src}<div class="bs-import-summary" role="status"><span>${badge('Berhasil', `${fmtNum(ok.length)} valid`)}</span><span>${bad ? badge('Gagal', `${fmtNum(bad)} perlu diperbaiki`) : ''}</span><span>${upd ? badge('Belum Sync', `${fmtNum(upd)} memperbarui unit yang ada`) : ''}</span></div>
        <div class="bs-table-wrap bs-import-table" tabindex="0" role="region" aria-label="Pratinjau impor"><table class="bs-table bs-cards"><thead><tr><th scope="col">Baris</th><th scope="col">Nama</th><th scope="col">Tipe</th><th scope="col">Kota</th><th scope="col">Koordinat</th><th scope="col">Hasil</th></tr></thead><tbody>${shown.map(x => `<tr class="${x.errors.length ? 'is-error' : ''}"><td data-label="Baris">${x.line}</td><td data-label="Nama">${esc(x.p.name)}</td><td data-label="Tipe">${esc(x.p.type)}</td><td data-label="Kota">${esc(x.p.city)}</td><td data-label="Koordinat">${isFinite(x.p.lat) ? `${x.p.lat}, ${x.p.lng}` : '—'}</td><td data-label="Hasil" class="bs-td-wrap">${x.errors.length ? `<span class="bs-err">${ic('alert')}${esc(x.errors.join(' '))}</span>` : `<span class="bs-ok">${ic('check')}${x.existing ? 'Perbarui' : 'Baru'}</span>`}</td></tr>`).join('')}</tbody></table></div>
        ${d.items.length > shown.length ? `<p class="bs-muted bs-gap-t">Menampilkan ${fmtNum(shown.length)} dari ${fmtNum(d.items.length)} baris (baris bermasalah ditampilkan lebih dulu).</p>` : ''}`;
      footer = btn('Kembali ke pemetaan', 'import-back', { icon: 'arrowL', variant: 'ghost' }) + (bad ? btn('Unduh baris bermasalah', 'import-errors', { icon: 'download' }) : '') +
        btn(`Impor ${fmtNum(ok.length)} baris valid`, 'import-commit', { icon: 'upload', variant: 'primary', attrs: ok.length ? '' : 'disabled' });
    }
    openModal('Impor unit kerja', `<ol class="bs-import-steps">${steps}</ol>${body}`, { wide: true, footer });
  }
  function importErrorsCSV() {
    const bad = app.importDraft.items.filter(x => x.errors.length);
    downloadCSV('baris-bermasalah-impor.csv', [['baris', ...TEMPLATE_HEAD, 'kesalahan'], ...bad.map(x => [x.line, ...IMPORT_FIELDS.map(([k]) => isNaN(x.p[k]) && (k === 'lat' || k === 'lng') ? '' : x.p[k]), x.errors.join(' ')])]);
  }
  function commitImport() {
    const ok = app.importDraft.items.filter(x => !x.errors.length);
    const snap = snapshot(), t0 = performance.now();
    let added = 0, updated = 0;
    const payload = [];
    ok.forEach(({ p, existing }) => {
      p.region = regionOf(p.province);
      const clean = { name: p.name, type: p.type, city: p.city, province: p.province, region: p.region, address: p.address, phone: p.phone, hours: p.hours || HOURS[0], lat: p.lat, lng: p.lng, status: p.status };
      const own = !existing && p.code && !byCode().has(p.code) ? p.code : null; // kode toko dari file dipakai untuk unit baru
      payload.push({ ...clean, code: existing ? existing.code : own, exists: !!existing });
      if (existing) {
        const changes = diff(existing, clean, Object.keys(clean));
        if (changes.length) { Object.assign(existing, clean, { updatedAt: Date.now(), updatedBy: app.ME.name }); log('Unit Kerja', 'Memperbarui unit via impor', { target: existing.code, changes }); updated++; }
      } else {
        const code = own || `DM-${String(++app.state.seq.loc).padStart(3, '0')}`;
        app.state.locations.unshift({ ...clean, code, gbp: 'Belum Diklaim', google: null, updatedAt: Date.now(), updatedBy: app.ME.name, lastSync: null });
        added++;
      }
    });
    log('Unit Kerja', 'Mengimpor data massal', { detail: `${added} unit baru, ${updated} diperbarui` });
    remote('POST', '/locations/import', { items: payload });
    app.importDraft = null; closeModal(); touch();
    ui.loc.quick = 'all'; ui.loc.sort = 'updatedAt'; ui.loc.dir = -1; ui.loc.page = 1;
    navigate('locations');
    toast(`Impor selesai dalam ${Math.round(performance.now() - t0)} ms — ${added} unit baru, ${updated} diperbarui.`, { tone: 'good', undo: snap });
  }
});
