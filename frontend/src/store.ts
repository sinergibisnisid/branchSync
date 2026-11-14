/*
 * Store aplikasi (Zustand + Immer).
 * - useApp: bahasa, layar aktif, sesi, data workspace dari server, status Live, dan state UI tiap halaman.
 * - useOverlay: modal, toast, dan palet perintah (berisi elemen React/fungsi — sengaja tanpa Immer).
 */
import type { ReactNode } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet, setAutoFreeze } from 'immer';
import type { ViewId } from './lib/domain';
import { setFormatContext } from './lib/format';
import type { Me, Workspace } from './lib/types';

enableMapSet();
setAutoFreeze(false); // snapshot workspace bisa berisi puluhan ribu objek; tidak perlu dibekukan

export type Lang = 'id' | 'en';
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* diblokir */ } };

export interface LocUi { q: string; quick: string; status: string[]; region: string[]; type: string[]; gbp: string[]; sort: string; dir: 1 | -1; page: number; selected: Set<string> }
export interface ReviewsUi { account: string; location: string; rating: string; status: string; sort: string; q: string; limit: number; editing: string | null; drafts: Record<string, string> }
export interface UiState {
  view: ViewId; navOpen: boolean; pop: string; renderMs: number;
  loc: LocUi;
  map: { q: string; status: string; region: string; gbp: string; showGoogle: boolean; limit: number };
  dups: { limit: number };
  disc: { q: string; field: string };
  claims: { tab: string }; approvals: { tab: string }; sync: { tab: string };
  audit: { q: string; module: string; actor: string; range: string };
  access: { tab: string; q: string };
  drawer: { code: string; tab: string } | null;
  reviews: ReviewsUi;
  report: { period: string; region: string; account: string; type: string };
  guide: { q: string };
  scn: { group: string; open: Set<number> };
}
export const initialUi = (): UiState => ({
  view: 'dashboard', navOpen: false, pop: '', renderMs: 0,
  loc: { q: '', quick: 'all', status: [], region: [], type: [], gbp: [], sort: 'name', dir: 1, page: 1, selected: new Set() },
  map: { q: '', status: '', region: '', gbp: '', showGoogle: true, limit: 300 },
  dups: { limit: 30 },
  disc: { q: '', field: '' }, claims: { tab: 'active' }, approvals: { tab: 'pending' }, sync: { tab: 'failures' },
  audit: { q: '', module: '', actor: '', range: '30' }, access: { tab: 'users', q: '' },
  drawer: null,
  reviews: { account: '', location: '', rating: '', status: '', sort: 'newest', q: '', limit: 20, editing: null, drafts: {} },
  report: { period: '30', region: '', account: '', type: '' },
  guide: { q: '' },
  scn: { group: '', open: new Set([1]) }
});

export interface LiveState { ready: boolean; loading: boolean; error: { message: string } | null; syncedAt: number; pending: number }
export interface Prefs { collapsed: boolean; pageSize: number; theme: '' | 'light' | 'dark' }
const PREF_KEY = 'branchSync.admin.prefs';
const loadPrefs = (): Prefs => { try { return { collapsed: false, pageSize: 10, theme: '', ...JSON.parse(readLS(PREF_KEY) || '{}') }; } catch { return { collapsed: false, pageSize: 10, theme: '' }; } };

export interface AppState {
  lang: Lang;
  dark: boolean;               // tema halaman depan
  screen: 'landing' | 'admin';
  me: Me;
  ws: Workspace | null;
  live: LiveState;
  running: { total: number } | null;
  save: '' | 'saving' | 'saved' | 'error';
  prefs: Prefs;
  ui: UiState;
  set: (fn: (s: AppState) => void) => void;
}

const initialLang: Lang = readLS('branchSyncLanguage') === 'en' ? 'en' : 'id';
setFormatContext({ lang: initialLang });
const themePref = readLS('branchSyncTheme');

export const useApp = create<AppState>()(immer(set => ({
  lang: initialLang,
  dark: themePref ? themePref === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches,
  screen: 'landing',
  me: { name: 'Pengguna', email: '', role: 'Pengguna', permissions: null },
  ws: null,
  live: { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 },
  running: null,
  save: '',
  prefs: loadPrefs(),
  ui: initialUi(),
  set: fn => set(fn)
})));

export const setApp = (fn: (s: AppState) => void) => useApp.getState().set(fn);
export const getApp = () => useApp.getState();
export const setUi = (fn: (ui: UiState) => void) => setApp(s => { fn(s.ui); });

// Simpan preferensi & sinkronkan konteks format saat bahasa / zona waktu berubah.
useApp.subscribe((s, prev) => {
  if (s.prefs !== prev.prefs) writeLS(PREF_KEY, JSON.stringify(s.prefs));
  if (s.lang !== prev.lang) { writeLS('branchSyncLanguage', s.lang); setFormatContext({ lang: s.lang }); document.documentElement.lang = s.lang; }
  if (s.dark !== prev.dark) writeLS('branchSyncTheme', s.dark ? 'dark' : 'light');
  if (s.ws && s.ws.settings.timezone !== prev.ws?.settings.timezone) setFormatContext({ timeZone: s.ws.settings.timezone });
});

/* ---------- Overlay: modal, toast, palet ---------- */
export type ToastTone = 'info' | 'good' | 'warn' | 'bad';
export interface ToastAction { label: string; run: () => void }
export interface Toast { id: number; msg: string; tone: ToastTone; action: ToastAction | null }
interface OverlayState {
  modal: ReactNode | null;
  modalKey: number;
  toasts: Toast[];
  palette: boolean;
}
export const useOverlay = create<OverlayState>(() => ({ modal: null, modalKey: 0, toasts: [], palette: false }));

let toastSeq = 0;
export function toast(msg: string, { tone = 'info', action = null }: { tone?: ToastTone; action?: ToastAction | null } = {}) {
  const id = ++toastSeq;
  useOverlay.setState(s => ({ toasts: [...s.toasts, { id, msg, tone, action }] }));
  return id;
}
export const dismissToast = (id: number) => useOverlay.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
let modalSeq = 0;
export const openModal = (node: ReactNode) => useOverlay.setState({ modal: node, modalKey: ++modalSeq });
export const closeModal = () => useOverlay.setState({ modal: null });
