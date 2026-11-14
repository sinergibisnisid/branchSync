'use strict';
/*
 * BranchSync Admin — Aksi domain (klaim, persetujuan, form klaim/titik/pengguna/peran, ekspor).
 * Modul actions.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('actions', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let byCode, CLAIM_KINDS, claimActive, DAY, diff, distM, downloadCSV, downloadXlsx, EXT_EMAILS, FIELD_LABEL, fmtDist, fmtNum, formatHours, formGrid,
    guard, HOURS, hoursEditor, hoursError, isLive, issueMap, log, mountPicker, navigate, offset, openDrawer, openModal, PERMS, pick, pickerBlock,
    presetHours, regionOf, remote, render, rng, SL, snapshot, STEPS, STREETS, toast, touch, TYPES, ui, validateLoc;
    app.imports(() => ({ byCode, CLAIM_KINDS, claimActive, DAY, diff, distM, downloadCSV, downloadXlsx, EXT_EMAILS, FIELD_LABEL, fmtDist, fmtNum,
    formatHours, formGrid, guard, HOURS, hoursEditor, hoursError, isLive, issueMap, log, mountPicker, navigate, offset, openDrawer, openModal, PERMS,
    pick, pickerBlock, presetHours, regionOf, remote, render, rng, SL, snapshot, STEPS, STREETS, toast, touch, TYPES, ui, validateLoc } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ resolveDisc, simulateGoogleChange, simulateEdit, decide, advanceClaim, claimForm, pointForm, userForm, roleForm, exportLocations,
    generateUnits });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * Aksi domain
   * ------------------------------------------------------------------ */
  function resolveDisc(key, useDashboard, send = true) {
    const [code, f] = key.split('|'), l = byCode().get(code);
    if (send) remote('POST', '/discrepancies/resolve', { code, field: f, source: useDashboard ? 'dashboard' : 'google' });
    if (!l || !l.google) return;
    const before = f === 'coords' ? (useDashboard ? `${l.google.lat}, ${l.google.lng}` : `${l.lat}, ${l.lng}`) : useDashboard ? l.google[f] : l[f];
    if (f === 'coords') { if (useDashboard) Object.assign(l.google, { lat: l.lat, lng: l.lng }); else Object.assign(l, { lat: l.google.lat, lng: l.google.lng }); }
    else if (useDashboard) l.google[f] = l[f]; else l[f] = l.google[f];
    const after = f === 'coords' ? `${l.lat}, ${l.lng}` : l[f];
    delete app.state.discNotes[key];
    if (!useDashboard) { l.updatedAt = Date.now(); l.updatedBy = app.ME.name; }
    log('Ketidaksesuaian', useDashboard ? 'Mengirim data Dashboard ke Google' : 'Menerapkan data Google ke Dashboard', { target: code, changes: [{ field: `${FIELD_LABEL[f]} (${useDashboard ? 'Google' : 'Dashboard'})`, before, after }] });
  }
  function simulateGoogleChange() {
    const r = rng(Date.now() % 1e6), cands = app.state.locations.filter(l => l.google && !issueMap().has(l.code));
    if (!cands.length) return;
    const l = pick(r, cands), f = pick(r, ['phone', 'hours', 'name', 'coords']);
    if (f === 'coords') Object.assign(l.google, offset(l.lat, l.lng, 200 + r() * 600, r() * 6.28));
    else if (f === 'name') l.google.name = `${l.name} - Bank BRI`;
    else if (f === 'hours') l.google.hours = 'Setiap hari 09.00–17.00';
    else l.google.phone = `(0${21 + Math.floor(r() * 700)}) ${1000000 + Math.floor(r() * 8999999)}`;
    log('Ketidaksesuaian', 'Perubahan terdeteksi di Google Maps', { target: l.code, user: 'Google Maps', actor: 'Eksternal', detail: FIELD_LABEL[f] });
    touch(); render();
    toast(`Perubahan ${FIELD_LABEL[f].toLowerCase()} terdeteksi pada ${l.name}.`, { tone: 'warn', action: { label: 'Bandingkan', run: () => openDrawer(l.code, 'compare') } });
  }
  function simulateEdit() {
    if (!app.state.api.webhook) { toast('Notifikasi edit eksternal dimatikan di Integrasi Google.', { tone: 'warn', action: { label: 'Buka', run: () => navigate('integrations') } }); return; }
    const r = rng(Date.now() % 1e6), l = pick(r, app.state.locations.filter(x => x.status !== 'Tidak Aktif')), f = pick(r, ['phone', 'hours', 'name', 'address']);
    const after = { phone: `(0${21 + Math.floor(r() * 700)}) ${1000000 + Math.floor(r() * 8999999)}`, hours: 'Setiap hari 10.00–22.00', name: `${l.name} (Pindah Lokasi)`, address: `Jl. Tidak Dikenal No. ${Math.floor(r() * 99)}, ${l.city}` }[f];
    const by = pick(r, EXT_EMAILS);
    const a = { id: `CR-${String(++app.state.seq.cr).padStart(3, '0')}`, code: l.code, field: f, before: l[f], after, by, time: Date.now(), status: 'Menunggu' };
    app.state.approvals.unshift(a);
    log('Persetujuan Edit', `Mengusulkan perubahan ${FIELD_LABEL[f].toLowerCase()}`, { target: l.code, user: by, actor: 'Eksternal', changes: [{ field: FIELD_LABEL[f], before: a.before, after }] });
    touch(); ui.approvals.tab = 'pending'; render();
    toast(`Edit baru dari ${by} menunggu persetujuan.`, { tone: 'warn', action: ui.view !== 'approvals' ? { label: 'Tinjau', run: () => navigate('approvals') } : null });
  }
  function decide(id, approve) {
    const a = app.state.approvals.find(x => x.id === id), l = a && byCode().get(a.code);
    if (!a || a.status !== 'Menunggu') return;
    const snap = snapshot();
    a.status = approve ? 'Disetujui' : 'Ditolak'; a.decidedAt = Date.now(); a.decidedBy = app.ME.name;
    if (approve && l) {
      l[a.field] = a.after; if (l.google) l.google[a.field] = a.after;
      l.updatedAt = Date.now(); l.updatedBy = `${a.by} (disetujui ${app.ME.name})`;
    }
    remote('POST', `/approvals/${encodeURIComponent(id)}/${approve ? 'approve' : 'reject'}`);
    log('Persetujuan Edit', approve ? 'Menyetujui edit eksternal' : 'Menolak edit eksternal', { target: a.code, detail: `${a.id} dari ${a.by}`, changes: approve ? [{ field: FIELD_LABEL[a.field], before: a.before, after: a.after }] : [] });
    touch(); render();
    toast(approve ? `${a.id} disetujui — data diperbarui.` : `${a.id} ditolak — data unit kerja tidak berubah.`, { tone: approve ? 'good' : 'info', undo: snap });
  }
  function advanceClaim(id) {
    const c = app.state.claims.find(x => x.id === id);
    if (!c || !claimActive(c)) return;
    const next = STEPS[STEPS.indexOf(c.status) + 1], now = Date.now();
    if (next === 'Menunggu verifikasi Google') c.processedAt = now;
    if (next === 'Selesai') {
      c.doneAt = now; c.processedAt ||= now;
      const l = c.code && byCode().get(c.code);
      if (c.kind === 'Titik baru' && c.proposal) {
        const code = `DM-${String(++app.state.seq.loc).padStart(3, '0')}`, p = c.proposal;
        app.state.locations.unshift({ ...p, code, region: regionOf(p.province), status: 'Online', gbp: 'Terverifikasi', google: { name: p.name, phone: p.phone, hours: p.hours, address: p.address, lat: p.lat, lng: p.lng }, updatedAt: now, updatedBy: app.ME.name, lastSync: now });
        c.code = code;
      } else if (l && c.kind === 'Laporan duplikat') { l.status = 'Tidak Aktif'; l.gbp = 'Duplikat'; }
      else if (l) { l.gbp = 'Terverifikasi'; }
    }
    c.status = next;
    log('Klaim & Titik Baru', `Memindahkan ${c.id} ke “${next}”`, { target: c.code || c.id, detail: c.kind });
    remote('POST', `/claims/${encodeURIComponent(id)}/advance`, { to: next });
    touch(); render();
    toast(`${c.id} → ${next}.`, { tone: next === 'Selesai' ? 'good' : 'info' });
  }
  function claimForm(code = '') {
    if (!guard('claims.manage')) return;
    const cands = app.state.locations.filter(l => l.gbp !== 'Terverifikasi' || l.code === code);
    openModal('Ajukan klaim', formGrid([
      { name: 'kind', label: 'Jenis permintaan', type: 'select', options: CLAIM_KINDS, value: byCode().get(code)?.gbp === 'Suspend' ? 'Banding suspend' : 'Klaim kepemilikan', full: true },
      { name: 'code', label: 'Unit kerja', type: 'select', options: cands.map(l => [l.code, `${l.name} · ${SL(l.gbp)}`]), value: code, full: true, hint: 'Hanya unit yang belum terverifikasi ditampilkan.' },
      { name: 'note', label: 'Catatan / dokumen pendukung', type: 'textarea', full: true, attrs: 'maxlength="500"' }
    ]), {
      submit: 'Ajukan', desc: 'Permintaan masuk ke tahap “Diajukan”. Waktu proses internal mulai dihitung.',
      onSubmit: p => {
        if (!byCode().has(p.code)) return { code: 'Pilih unit kerja.' };
        if (app.state.claims.some(c => c.code === p.code && claimActive(c))) return { code: 'Unit ini sudah memiliki permintaan yang berjalan.' };
        const id = `KL-${String(++app.state.seq.claim).padStart(3, '0')}`;
        app.state.claims.unshift({ id, kind: p.kind, code: p.code, submittedAt: Date.now(), processedAt: null, doneAt: null, status: 'Diajukan', note: String(p.note || '').trim() });
        log('Klaim & Titik Baru', `Mengajukan ${p.kind.toLowerCase()}`, { target: p.code, detail: id });
        remote('POST', '/claims', { kind: p.kind, code: p.code, note: String(p.note || '').trim() });
        ui.claims.tab = 'active';
        toast(`${id} diajukan.`, { tone: 'good', action: ui.view !== 'claims' ? { label: 'Lihat', run: () => navigate('claims') } : null });
      }
    });
  }
  function pointForm() {
    if (!guard('claims.manage')) return;
    app.hoursDraft = presetHours('weekday');
    openModal('Usulkan titik lokasi baru',
      `<h3 class="bs-form-section">Informasi dasar</h3>` + formGrid([
        { name: 'name', label: 'Nama unit', full: true }, { name: 'type', label: 'Tipe', type: 'select', options: TYPES, value: 'KCP' },
        { name: 'phone', label: 'Telepon', attrs: '' }, { name: 'city', label: 'Kota' }, { name: 'province', label: 'Provinsi' },
        { name: 'address', label: 'Alamat', full: true }
      ]) +
      `<h3 class="bs-form-section">Titik lokasi</h3><p class="bs-form-help">Klik peta atau geser penanda untuk menandai titik. Koordinat juga dapat diketik.</p>` + pickerBlock('', '') +
      `<h3 class="bs-form-section">Jam operasional</h3>` + hoursEditor() +
      formGrid([{ name: 'force', label: 'Tetap ajukan meskipun ada unit berdekatan', type: 'checkbox', full: true }]), {
      wide: 'xl', submit: 'Ajukan titik baru', desc: 'Sistem memeriksa kemungkinan duplikat sebelum pengajuan dikirim ke Google.',
      onSubmit: p => {
        const herr = hoursError(app.hoursDraft);
        if (herr) return herr;
        p.hours = formatHours(app.hoursDraft);
        const e = validateLoc(p, null);
        if (Object.keys(e).length) return e;
        const near = app.state.locations.map(l => [l, distM(l, p)]).filter(([, d]) => d <= Math.max(app.state.settings.dupRadius, 200)).sort((a, b) => a[1] - b[1])[0];
        if (near && !p.force) return { lat: `Ada ${near[0].name} berjarak ${fmtDist(near[1])} — kemungkinan duplikat. Centang “Tetap ajukan” bila yakin.` };
        const id = `KL-${String(++app.state.seq.claim).padStart(3, '0')}`;
        const proposal = { name: p.name, type: p.type, city: p.city, province: p.province, address: p.address, phone: p.phone, hours: p.hours, hoursSpec: JSON.parse(JSON.stringify(app.hoursDraft)), lat: p.lat, lng: p.lng };
        app.state.claims.unshift({ id, kind: 'Titik baru', proposal, submittedAt: Date.now(), processedAt: null, doneAt: null, status: 'Diajukan', note: near ? `Dekat ${near[0].name} (${fmtDist(near[1])})` : '' });
        log('Klaim & Titik Baru', 'Mengajukan titik baru', { target: id, detail: p.name });
        remote('POST', '/claims', { kind: 'Titik baru', proposal, note: near ? `Dekat ${near[0].name} (${fmtDist(near[1])})` : '' });
        ui.claims.tab = 'active';
        toast(`${id} diajukan untuk ${p.name}.`, { tone: 'good', action: ui.view !== 'claims' ? { label: 'Lihat', run: () => navigate('claims') } : null });
      }
    });
    mountPicker('', '', null);
  }
  function userForm(id) {
    if (!guard('users.manage')) return;
    const u = app.state.users.find(x => x.id === Number(id)), live = isLive();
    // Demo: akun utama (id 1) dan domain @example.test. Live: email apa pun; akun sendiri tidak bisa dinonaktifkan.
    const locked = live ? !!u && u.email === app.ME.email : u?.id === 1;
    openModal(u ? `Edit ${u.name}` : 'Tambah pengguna', formGrid([
      { name: 'name', label: 'Nama lengkap', value: u?.name, full: true }, { name: 'email', label: 'Email', type: 'email', value: u?.email, full: true, hint: live ? '' : 'Gunakan domain @example.test untuk demo.' },
      { name: 'role', label: 'Peran', type: 'select', options: app.state.roles.map(r => r.name), value: u?.role || 'Viewer' },
      { name: 'status', label: 'Status', type: 'select', options: ['Aktif', 'Nonaktif'], value: u?.status || 'Aktif', attrs: locked ? 'disabled' : '' }
    ]), {
      submit: u ? 'Simpan' : 'Tambah pengguna',
      onSubmit: p => {
        const e = {};
        p.name = String(p.name || '').trim(); p.email = String(p.email || '').trim().toLowerCase();
        if (!p.name) e.name = 'Wajib diisi.';
        if (live ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) : !/^[^\s@]+@example\.test$/.test(p.email)) e.email = live ? 'Email tidak valid.' : 'Email harus berdomain @example.test.';
        else if (app.state.users.some(x => x !== u && x.email === p.email)) e.email = 'Email sudah terdaftar.';
        if (Object.keys(e).length) return e;
        if (locked) p.status = u.status;
        if (u) { const ch = diff(u, p, ['name', 'email', 'role', 'status']); Object.assign(u, p); log('Pengguna & Akses', 'Memperbarui pengguna', { detail: p.name, changes: ch }); remote('PATCH', `/users/${encodeURIComponent(u.id)}`, p); }
        else { app.state.users.push({ ...p, id: ++app.state.seq.user, lastActive: Date.now() }); log('Pengguna & Akses', 'Menambahkan pengguna', { detail: `${p.name} (${p.role})` }); remote('POST', '/users', p); }
        toast('Pengguna disimpan.', { tone: 'good' });
      }
    });
  }
  function roleForm(name) {
    if (!guard('users.manage')) return;
    const r = app.state.roles.find(x => x.name === name);
    openModal(r ? `Ubah peran ${r.name}` : 'Tambah peran', formGrid([{ name: 'name', label: 'Nama peran', value: r?.name, full: true }]) + (r ? '' : `<fieldset class="bs-fieldset"><legend>Izin awal</legend>${PERMS.map(([p, l]) => `<label class="bs-checkline"><input type="checkbox" name="perm" value="${p}" ${p.endsWith('.read') ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>`), {
      submit: 'Simpan',
      onSubmit: (p, fd) => {
        const n = String(p.name || '').trim();
        if (!n) return { name: 'Wajib diisi.' };
        if (app.state.roles.some(x => x !== r && x.name.toLowerCase() === n.toLowerCase())) return { name: 'Nama peran sudah ada.' };
        if (r) { remote('PATCH', `/roles/${encodeURIComponent(r.name)}`, { name: n }); app.state.users.filter(u => u.role === r.name).forEach(u => { u.role = n; }); log('Pengguna & Akses', 'Mengubah nama peran', { changes: [{ field: 'Peran', before: r.name, after: n }] }); r.name = n; }
        else { app.state.roles.push({ name: n, permissions: fd.getAll('perm') }); remote('POST', '/roles', { name: n, permissions: fd.getAll('perm') }); log('Pengguna & Akses', 'Menambahkan peran', { detail: n }); }
        ui.access.tab = 'roles';
        toast('Peran disimpan.', { tone: 'good' });
      }
    });
  }
  async function exportLocations(xs, base = 'branchsync-unit-kerja', fmt = 'csv') {
    const keys = ['code', 'name', 'type', 'status', 'gbp', 'city', 'province', 'region', 'address', 'phone', 'hours', 'lat', 'lng'];
    const rows = [keys, ...xs.map(l => keys.map(k => l[k]))];
    if (fmt === 'xlsx') {
      try { await downloadXlsx(`${base}.xlsx`, [{ name: 'Unit Kerja', rows, widths: [12, 36, 14, 12, 16, 20, 22, 12, 40, 18, 24, 12, 12] }]); }
      catch (e) { toast(e.message, { tone: 'bad' }); return; }
    } else downloadCSV(`${base}.csv`, rows);
    log('Unit Kerja', fmt === 'xlsx' ? 'Mengekspor Excel' : 'Mengekspor CSV', { detail: `${xs.length} unit` });
    toast(`${fmtNum(xs.length)} unit diekspor ke ${fmt === 'xlsx' ? 'Excel' : 'CSV'}.`, { tone: 'good' });
  }
  function generateUnits(n) {
    const t0 = performance.now(), r = rng(Date.now() % 1e6), base = app.state.locations.filter(l => l.type === 'Kantor Cabang');
    for (let i = 0; i < n; i++) {
      const b = pick(r, base), p = offset(b.lat, b.lng, 2000 + r() * 40000, r() * 6.28), type = pick(r, ['KCP', 'Unit', 'Unit', 'ATM', 'ATM']);
      const code = `DM-${String(++app.state.seq.loc).padStart(3, '0')}`, x = r();
      const l = { code, name: `${type === 'ATM' ? 'ATM BRI' : type === 'Unit' ? 'BRI Unit' : 'KCP'} ${b.city} ${code.slice(3)}`, type, city: b.city, province: b.province, region: b.region, address: `Jl. ${pick(r, STREETS)} No. ${1 + Math.floor(r() * 300)}, ${b.city}`, phone: `(0${21 + Math.floor(r() * 700)}) ${1000000 + Math.floor(r() * 8999999)}`, hours: type === 'ATM' ? HOURS[3] : pick(r, HOURS.slice(0, 3)), lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), status: x < 0.8 ? 'Online' : x < 0.88 ? 'Offline' : x < 0.96 ? 'Belum Sync' : 'Tidak Aktif', gbp: r() < 0.85 ? 'Terverifikasi' : 'Belum Diklaim', updatedAt: Date.now() - Math.floor(r() * 30 * DAY), updatedBy: 'Generator uji', lastSync: Date.now() - Math.floor(r() * 2 * DAY) };
      l.google = { name: l.name, phone: l.phone, hours: l.hours, address: l.address, lat: l.lat, lng: l.lng };
      app.state.locations.push(l);
    }
    log('Pengaturan', 'Membuat data uji performa', { detail: `${n} unit` });
    touch();
    const gen = Math.round(performance.now() - t0);
    navigate('locations');
    toast(`${fmtNum(n)} unit uji dibuat (${gen} ms) dan halaman dirender dalam ${ui.renderMs} ms. Total ${fmtNum(app.state.locations.length)} unit.`, { tone: 'good' });
  }
});
