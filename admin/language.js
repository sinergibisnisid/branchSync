'use strict';
/*
 * BranchSync Admin — Bahasa: terjemahan antarmuka ID → EN saat runtime.
 * Modul language.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('language', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let closeModal, isEn, palette, render, shell, toast, toggleModeMenu, toggleNotif;
  app.imports(() => ({ closeModal, isEn, palette, render, shell, toast, toggleModeMenu, toggleNotif } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ translateAll, setLanguage });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * Bahasa — teks antarmuka ditulis dalam Bahasa Indonesia, lalu
   * diterjemahkan ke Inggris lewat kamus admin-i18n.js (MutationObserver).
   * Konten pengguna (nama unit, isi ulasan, input) tidak diterjemahkan.
   * ------------------------------------------------------------------ */
  const I18N = window.BranchAdminI18n || { dict: {}, patterns: [] };
  app.export({ I18N });
  const ATTRS = ['placeholder', 'aria-label', 'title', 'data-label'];
  const SKIP = 'textarea, script, style, code, [data-no-i18n], .bs-review-text:not(.bs-muted), .bs-reply p, .bs-diff del, .bs-diff ins, .bs-val, .bs-note';
  const origText = new WeakMap(), origAttr = new WeakMap();
  const missing = new Set();
  function trCore(core) {
    if (typeof I18N.translate === 'function') return I18N.translate(core);
    if (Object.prototype.hasOwnProperty.call(I18N.dict, core)) return I18N.dict[core];
    for (const [re, rep] of I18N.patterns) { re.lastIndex = 0; if (re.test(core)) { re.lastIndex = 0; return core.replace(re, rep); } }
    return null;
  }
  function trString(str) {
    const core = str.trim();
    if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return str;
    const out = trCore(core);
    if (out == null) { if (window.BS_I18N_DEBUG) missing.add(core); return str; }
    return str.replace(core, out);
  }
  function translateNode(root) {
    if (!isEn() || !root) return;
    if (root.nodeType === 3) {
      if (root.parentElement && root.parentElement.closest(SKIP)) return;
      const v = trString(root.nodeValue); if (v !== root.nodeValue) { if (!origText.has(root)) origText.set(root, root.nodeValue); root.nodeValue = v; }
      return;
    }
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = []; let n;
    while ((n = walker.nextNode())) texts.push(n);
    texts.forEach(translateNode);
    [root, ...root.querySelectorAll('[placeholder],[aria-label],[title],[data-label]')].forEach(el => ATTRS.forEach(a => {
      const v = el.getAttribute(a); if (!v || el.closest(SKIP)) return;
      const t = trString(v); if (t === v) return;
      const m = origAttr.get(el) || {}; if (!(a in m)) m[a] = v; origAttr.set(el, m);
      el.setAttribute(a, t);
    }));
  }
  function restoreNode(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) if (origText.has(n)) { n.nodeValue = origText.get(n); origText.delete(n); }
    [root, ...root.querySelectorAll('[placeholder],[aria-label],[title],[data-label]')].forEach(el => { const m = origAttr.get(el); if (m) { Object.entries(m).forEach(([a, v]) => el.setAttribute(a, v)); origAttr.delete(el); } });
  }
  const observer = new MutationObserver(muts => {
    if (!isEn()) return;
    observer.disconnect();
    muts.forEach(m => {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode);
      else if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
    });
    watch();
  });
  const watch = () => observer.observe(shell, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  function translateAll() { observer.disconnect(); if (isEn()) translateNode(shell); else restoreNode(shell); watch(); }
  window.BranchAdminMissing = () => [...missing].sort();
  function setLanguage(lang) {
    lang = lang === 'en' ? 'en' : 'id';
    if (typeof language !== 'undefined') language = lang; // eslint-disable-line no-global-assign
    try { localStorage.setItem('branchSyncLanguage', lang); } catch (_) {}
    toggleModeMenu(false); toggleNotif(false); closeModal(); if (palette.open) palette.close();
    observer.disconnect();
    restoreNode(shell);
    document.documentElement.lang = shell.lang = lang;
    app.renderedView = null;
    render();
    translateAll();
    if (typeof applyLanguage === 'function') { try { applyLanguage(); } catch (_) {} } // sinkronkan halaman utama
    document.documentElement.lang = lang;
    shell.querySelector(`#bsLang [data-id="${lang}"]`)?.focus();
    toast(lang === 'en' ? 'Language changed to English.' : 'Bahasa diganti ke Bahasa Indonesia.');
  }
});
