'use strict';
/*
 * BranchSync Admin — Halaman Pengaturan.
 * Modul views/settings.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('views/settings', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let btn, can, card, esc, head, ic, isLive, MODE, navItem, opts;
  app.imports(() => ({ btn, can, card, esc, head, ic, isLive, MODE, navItem, opts } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ viewSettings });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * View: Pengaturan
   * ------------------------------------------------------------------ */
  function viewSettings() {
    const s = app.state.settings;
    const f = (name, label, value, type = 'number', hint = '', extra = '') => `<label class="bs-field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" required ${extra}>${hint ? `<small>${hint}</small>` : ''}</label>`;
    return head('Pengaturan', navItem('settings').desc) +
      card('Mode & koneksi server', `<div class="bs-mode-row"><span class="bs-mode-badge" data-state="${isLive() ? 'online' : 'demo'}">${ic(isLive() ? 'plug' : 'zap')}</span><div><strong>${isLive() ? 'Live' : 'Mode Demo'}</strong><small>${isLive() ? `Masuk sebagai ${esc(app.ME.name)} · ${esc(MODE.host())}` : 'Data simulasi di browser ini. Tidak ada yang dikirim ke server.'}</small></div><div class="bs-seg-btns" role="group" aria-label="Pilih mode">${btn('Demo', 'mode-demo', { icon: 'zap', variant: `sm${isLive() ? '' : ' is-current'}`, attrs: `aria-pressed="${!isLive()}"` })}${btn('Live', 'mode-live', { icon: 'plug', variant: `sm${isLive() ? ' is-current' : ''}`, attrs: `aria-pressed="${isLive()}"` })}</div></div>
        <div class="bs-form-grid bs-gap"><label class="bs-field full"><span>URL server API</span><input id="bsApiUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false" value="${esc(MODE.getBaseUrl())}" placeholder="https://api.branchsync.co.id/v1"><small>Dipakai pada mode Live. Daftar endpoint ada di API.md.</small></label></div>
        <div class="bs-btn-row">${btn('Uji koneksi', 'api-health', { icon: 'zap' })}${btn('Simpan URL', 'api-url-save', { icon: 'check' })}<span id="bsHealth" class="bs-health-msg" role="status" aria-live="polite"></span></div>`) +
      (can('settings.write') ? '' : `<div class="bs-callout" data-tone="warn">${ic('info')}<p>Anda hanya dapat melihat pengaturan workspace. Hubungi Administrator untuk mengubahnya.</p></div>`) +
      `<form id="bsSettingsForm" class="bs-stack" novalidate><fieldset class="bs-fieldset-plain" ${can('settings.write') ? '' : 'disabled'}>` +
      card('Workspace', `<div class="bs-form-grid">${f('workspace', 'Nama workspace', s.workspace, 'text', '', 'maxlength="80"')}<label class="bs-field"><span>Zona waktu</span><select name="timezone">${opts([['Asia/Jakarta', 'WIB — Asia/Jakarta'], ['Asia/Makassar', 'WITA — Asia/Makassar'], ['Asia/Jayapura', 'WIT — Asia/Jayapura']], s.timezone)}</select></label></div>`) +
      card('Target SLA', `<div class="bs-form-grid">${f('slaInternal', 'Proses internal (jam)', s.slaInternal, 'number', 'Waktu tim BRI memproses permintaan.', 'min="1" max="720"')}${f('slaGoogle', 'Acuan verifikasi Google (jam)', s.slaGoogle, 'number', 'Dipantau terpisah, di luar kendali BRI.', 'min="1" max="2000"')}</div>`) +
      card('Aturan deteksi', `<div class="bs-form-grid">${f('dupRadius', 'Radius duplikat (meter)', s.dupRadius, 'number', 'Unit bertipe sama dalam radius ini dianggap kemungkinan duplikat.', 'min="10" max="2000"')}${f('coordTol', 'Toleransi selisih koordinat (meter)', s.coordTol, 'number', 'Selisih titik di atas nilai ini dianggap tidak sesuai.', 'min="5" max="2000"')}</div>`) +
      `<div class="bs-form-actions"><button type="submit" class="bs-btn primary">${ic('check')}<span>Simpan pengaturan</span></button></div></fieldset></form>` +
      card(isLive() ? 'Data' : 'Data demo & uji performa', `<div class="bs-danger-list">
        ${isLive() ? '' : `<div><span><strong>Buat 1.000 unit uji</strong><small>Uji performa dashboard dengan data besar (skenario 4). Waktu proses ditampilkan.</small></span>${btn('Buat 1.000 unit', 'generate', { icon: 'zap' })}</div>`}
        <div><span><strong>Penyimpanan browser</strong><small>${app.storageMode === 'idb' ? 'IndexedDB — kapasitas besar, cocok untuk ribuan unit.' : app.storageMode === 'local' ? 'localStorage — terbatas ±5 MB; unduh cadangan secara berkala.' : 'Memuat…'}${isLive() ? ' Data Live tidak disimpan di browser.' : ''}</small></span><span class="bs-badge" data-tone="${app.storageMode === 'idb' ? 'good' : 'warn'}"><i></i>${app.storageMode === 'idb' ? 'IndexedDB' : 'localStorage'}</span></div>
        <div><span><strong>Cadangkan data</strong><small>Unduh seluruh data workspace sebagai JSON.</small></span>${btn('Unduh JSON', 'backup', { icon: 'download' })}</div>
        ${isLive() ? '' : `<div><span><strong>Reset data demo</strong><small>Kembalikan semua data ke kondisi awal. Tidak bisa dibatalkan.</small></span>${btn('Reset data', 'reset-data', { icon: 'trash', variant: 'danger' })}</div>`}</div>`);
  }
});
