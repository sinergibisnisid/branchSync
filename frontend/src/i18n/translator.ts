/*
 * Terjemahan antarmuka admin ID → EN saat runtime. Teks admin ditulis dalam Bahasa Indonesia; saat EN aktif,
 * teks dan atribut (placeholder, aria-label, title, data-label) di dalam workspace diterjemahkan memakai
 * kamus adminDict (cocok persis, lalu pola regex). Konten pengguna (nama unit, isi ulasan, input) tidak diterjemahkan.
 * React aman dengan cara ini: React hanya menulis ulang teks yang berubah, dan observer menerjemahkannya lagi.
 */
import { useEffect, type RefObject } from 'react';
import AdminI18n from './adminDict';
import { extraTranslate } from './extraDict';

const ATTRS = ['placeholder', 'aria-label', 'title', 'data-label'];
const SKIP = 'textarea, script, style, code, [data-no-i18n], .bs-review-text:not(.bs-muted), .bs-reply p, .bs-diff del, .bs-diff ins, .bs-val, .bs-note';

// Debug: window.BS_I18N_DEBUG = true lalu window.BranchAdminMissing() → teks yang belum ada di kamus.
const missing = new Set<string>();
(window as unknown as { BranchAdminMissing: () => string[] }).BranchAdminMissing = () => [...missing].sort();
export function trString(str: string): string {
  const core = str.trim();
  if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return str;
  const out = extraTranslate(core) ?? AdminI18n.translate(core);
  if (out == null && (window as unknown as { BS_I18N_DEBUG?: boolean }).BS_I18N_DEBUG) missing.add(core);
  return out == null ? str : str.replace(core, out);
}
/** Terjemahkan satu teks (untuk teks di luar DOM workspace, mis. judul dokumen). */
export const tr = (s: string, en: boolean) => (en ? trString(s) : s);

function translateNode(root: Node) {
  if (root.nodeType === 3) {
    const p = root.parentElement;
    if (p && p.closest(SKIP)) return;
    const v = trString(root.nodeValue || '');
    if (v !== root.nodeValue) root.nodeValue = v;
    return;
  }
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (el.closest(SKIP)) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Node[] = []; let n: Node | null;
  while ((n = walker.nextNode())) texts.push(n);
  texts.forEach(translateNode);
  [el, ...el.querySelectorAll('[placeholder],[aria-label],[title],[data-label]')].forEach(x => ATTRS.forEach(a => {
    const v = x.getAttribute(a); if (!v || x.closest(SKIP)) return;
    const t = trString(v); if (t !== v) x.setAttribute(a, t);
  }));
}

/** Pasang penerjemah pada elemen akar selama bahasa EN aktif. Saat kembali ke ID, komponen dirender ulang (key = bahasa). */
export function useDomTranslation(ref: RefObject<HTMLElement | null>, en: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!en || !root) return;
    let busy = false;
    const observer = new MutationObserver(muts => {
      if (busy) return;
      busy = true; observer.disconnect();
      muts.forEach(m => {
        if (m.type === 'childList') m.addedNodes.forEach(translateNode);
        else translateNode(m.target);
      });
      watch(); busy = false;
    });
    const watch = () => observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    translateNode(root);
    watch();
    return () => observer.disconnect();
  }, [ref, en]);
}
