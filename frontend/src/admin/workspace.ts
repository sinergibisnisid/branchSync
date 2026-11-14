/*
 * Pengendali workspace: memuat data dari server (GET /bootstrap), mengirim perubahan, izin,
 * navigasi + URL, sinkronisasi, dan keluar. Semua data berasal dari backend Go + PostgreSQL.
 */
import * as api from '../lib/api';
import { normalizeSnapshot } from '../lib/data';
import { NAV_ITEMS, PERMS, permLabel, type ViewId } from '../lib/domain';
import { fmtNum } from '../lib/format';
import type { Me, Workspace } from '../lib/types';
import { closeModal, getApp, setApp, setUi, toast, useApp, useOverlay } from '../store';
import { announce } from './announce';
import { applyRoute, currentHash, parseRoute } from './route';

/* ---------- Pengguna & izin ---------- */
export function meFromSession(): Me {
  const u = api.getUser() || {};
  return { name: u.name || u.username || u.email || 'Pengguna', email: u.email || '', role: u.role || 'Pengguna', permissions: Array.isArray(u.permissions) ? u.permissions : null };
}
export function permsOf(me: Me, ws: Workspace | null): Set<string> {
  if (Array.isArray(me.permissions)) return new Set(me.permissions);
  if (me.role === 'Administrator') return new Set(PERMS.map(x => x[0]));
  const r = (ws?.roles || []).find(x => x.name === me.role);
  return new Set(r ? r.permissions : ['locations.read']);
}
export const can = (perm?: string) => { if (!perm) return true; const s = getApp(); return permsOf(s.me, s.ws).has(perm); };
/** Hook: true bila pengguna aktif memiliki izin. */
export const useCan = (perm?: string) => useApp(s => !perm || permsOf(s.me, s.ws).has(perm));
export const deniedMsg = (perm: string) => `Tidak diizinkan untuk peran ${getApp().me.role} — butuh izin “${permLabel(perm)}”.`;
export function guard(perm?: string) { if (can(perm)) return true; toast(deniedMsg(perm!), { tone: 'warn' }); return false; }
export const canView = (v: ViewId) => can(NAV_ITEMS.find(n => n.id === v)?.perm);

/** Workspace yang sudah dimuat (halaman admin hanya dirender setelah data siap). */
export const useWs = () => useApp(s => s.ws!) as Workspace;
export const ws = () => getApp().ws!;

/* ---------- Data Live ---------- */
let loadSeq = 0;
export async function loadLive({ silent = false } = {}): Promise<boolean> {
  const seq = ++loadSeq;
  setApp(s => { s.live.loading = true; if (!silent) s.live.error = null; });
  try {
    const data = await api.request('GET', '/bootstrap');
    if (seq !== loadSeq || getApp().screen !== 'admin') return false;
    const next = normalizeSnapshot(data);
    setApp(s => { s.ws = next; s.live = { ...s.live, ready: true, loading: false, error: null, syncedAt: Date.now() }; });
    return true;
  } catch (e) {
    const err = e as api.ApiError;
    if (seq !== loadSeq) return false;
    setApp(s => { s.live.loading = false; s.live.error = { message: err.message }; if (!silent && !s.ws) s.live.ready = false; });
    if (err.code === 'unauthorized') sessionExpired();
    return false;
  }
}

let refreshTimer = 0;
/**
 * Kirim perubahan ke server, lalu muat ulang data agar tampilan sama dengan server.
 * Mengembalikan respons server (atau true bila kosong), atau false bila gagal (pesan sudah ditampilkan).
 */
export async function remote<T = unknown>(method: string, path: string, body?: unknown): Promise<T | true | false> {
  setApp(s => { s.live.pending++; s.save = 'saving'; });
  try {
    const res = await api.request<T>(method, path, body);
    setApp(s => { if (s.live.pending <= 1) s.save = 'saved'; });
    return (res ?? true) as T | true;
  } catch (e) {
    const err = e as api.ApiError;
    setApp(s => { s.save = 'error'; });
    if (err.code === 'unauthorized') { sessionExpired(); return false; }
    toast(`Gagal menyimpan ke server: ${err.message}`, { tone: 'bad', action: { label: 'Muat ulang', run: () => { void loadLive(); } } });
    return false;
  } finally {
    setApp(s => { s.live.pending = Math.max(0, s.live.pending - 1); });
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => { void loadLive({ silent: true }); }, 150);
  }
}

/* ---------- Masuk / keluar ---------- */
type LoginOpener = (message?: string) => void;
let openLogin: LoginOpener = () => {};
export const registerLoginOpener = (fn: LoginOpener) => { openLogin = fn; };

/** Masuk ke workspace dengan sesi yang tersimpan; menerapkan rute dari URL bila ada. */
export function enterAdmin(opts: { view?: ViewId; notice?: string } = {}) {
  if (!api.hasSession() || !api.getBaseUrl()) { openLogin(); return; }
  const route = parseRoute(location.hash);
  let unit = '', panel = 'overview';
  const me = meFromSession();
  setApp(s => {
    s.screen = 'admin'; s.me = me; s.ws = null; s.running = null; s.save = '';
    s.live = { ready: false, loading: true, error: null, syncedAt: 0, pending: 0 };
    s.ui.loc.selected.clear(); s.ui.drawer = null; s.ui.navOpen = false; s.ui.pop = '';
    // Izin dari sesi (server mengirim daftar izin); peran tanpa daftar izin dicek ulang setelah data dimuat.
    const allowed = (v: ViewId) => { const p = NAV_ITEMS.find(n => n.id === v)?.perm; return !p || permsOf(me, null).has(p) || !Array.isArray(me.permissions); };
    if (route) { const r = applyRoute(s.ui, route, allowed); unit = r.unit; panel = r.panel; }
    else if (opts.view) s.ui.view = opts.view;
  });
  void loadLive().then(ok => {
    if (!ok) return;
    if (!canView(getApp().ui.view)) setUi(ui => { ui.view = 'dashboard'; });
    if (unit) openDrawer(unit, panel);
    toast(opts.notice || `Terhubung ke ${api.host()}. Selamat datang, ${getApp().me.name}!`, { tone: 'good' });
  });
}

export function logout() {
  if (api.hasSession()) { api.request('POST', '/auth/logout').catch(() => {}); api.clearSession(); }
  loadSeq++;
  closeModal();
  useOverlay.setState({ palette: false });
  setApp(s => { s.screen = 'landing'; s.ws = null; s.live = { ready: false, loading: false, error: null, syncedAt: 0, pending: 0 }; s.ui.drawer = null; });
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* abaikan */ }
}

/** Sesi tidak valid → kembali ke halaman depan dan minta masuk lagi. */
export function sessionExpired(message = 'Sesi berakhir atau tidak valid. Silakan masuk kembali.') {
  if (getApp().screen !== 'admin') return;
  api.clearSession();
  loadSeq++;
  closeModal();
  setApp(s => { s.screen = 'landing'; s.ws = null; s.live.ready = false; s.ui.drawer = null; });
  setTimeout(() => openLogin(message), 0);
}
api.onUnauthorized(() => sessionExpired());

/* ---------- Navigasi & URL ---------- */
let pushNext = false;
export function navigate(view: ViewId, { push = true } = {}) {
  if (!canView(view)) { toast(deniedMsg(NAV_ITEMS.find(n => n.id === view)!.perm!), { tone: 'warn' }); view = 'dashboard'; }
  const cur = getApp().ui.view;
  pushNext = push && view !== cur;
  closeModal();
  useOverlay.setState({ palette: false });
  setUi(ui => { ui.view = view; ui.pop = ''; ui.navOpen = false; ui.drawer = null; });
  requestAnimationFrame(() => {
    document.getElementById('bsMain')?.scrollTo({ top: 0 });
    document.getElementById('bsTitle')?.focus({ preventScroll: true });
  });
}
/** Selaraskan hash URL dengan state UI (dipanggil setiap state UI berubah). */
export function syncUrl() {
  const s = getApp();
  if (s.screen !== 'admin') return;
  const h = currentHash(s.ui);
  if (location.hash !== h) {
    const url = location.pathname + location.search + h;
    try { if (pushNext) history.pushState({ bs: 1 }, '', url); else history.replaceState({ bs: 1 }, '', url); } catch { /* abaikan */ }
  }
  pushNext = false;
}
window.addEventListener('popstate', () => {
  if (getApp().screen !== 'admin') return;
  const r = parseRoute(location.hash);
  if (!r) return;
  let res = { unit: '', panel: 'overview' };
  closeModal();
  setUi(ui => { res = applyRoute(ui, r, canView); ui.pop = ''; ui.navOpen = false; ui.drawer = null; });
  if (res.unit) openDrawer(res.unit, res.panel);
});

export function copyLink() {
  syncUrl();
  const url = location.href;
  return (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject(new Error('clipboard')))
    .then(() => { toast('Tautan disalin. Penerima perlu masuk untuk membukanya.', { tone: 'good' }); return true; }, () => false);
}

/* ---------- Drawer unit ---------- */
export function openDrawer(code: string, tab = 'overview') {
  const w = getApp().ws;
  if (!w || !w.locations.some(l => l.code === code)) { toast('Unit tidak ditemukan atau sudah dihapus.', { tone: 'warn' }); return; }
  setUi(ui => { ui.drawer = { code, tab }; });
}
export const closeDrawer = () => setUi(ui => { ui.drawer = null; });

/* ---------- Sinkronisasi ---------- */
export async function runSync(codes: string[] | null, { retry = false, label = 'Semua unit' } = {}) {
  if (!guard('sync.run')) return;
  const s = getApp();
  if (s.running) { toast('Sinkronisasi lain sedang berjalan.', { tone: 'warn' }); return; }
  const total = codes ? codes.length : s.ws?.locations.length || 0;
  setApp(st => { st.running = { total }; });
  announce(`Server sedang menyinkronkan ${fmtNum(total)} unit.`);
  const run = await remote<{ ok?: number; fail?: number; skip?: number; status?: string }>('POST', '/sync', { codes: codes || null, retry, label });
  setApp(st => { st.running = null; });
  if (run && typeof run === 'object' && 'ok' in run) {
    toast(`Sinkronisasi selesai — ${fmtNum(run.ok || 0)} berhasil, ${fmtNum(run.fail || 0)} gagal, ${fmtNum(run.skip || 0)} dilewati.`, {
      tone: run.fail ? 'warn' : 'good',
      action: run.fail ? { label: 'Lihat kegagalan', run: () => { setUi(ui => { ui.sync.tab = 'failures'; }); navigate('sync'); } } : null
    });
  } else if (run) toast('Permintaan sinkronisasi diterima server.', { tone: 'good' });
}

/* ---------- Status jaringan & muat ulang berkala ---------- */
window.addEventListener('online', () => {
  if (getApp().screen !== 'admin') return;
  void loadLive({ silent: getApp().live.ready }).then(ok => ok && toast('Koneksi pulih — data diperbarui.', { tone: 'good' }));
});
const refreshOk = () => { const s = getApp(); return s.screen === 'admin' && s.live.ready && !s.running && !useOverlay.getState().modal && document.visibilityState === 'visible'; };
setInterval(() => { if (refreshOk()) void loadLive({ silent: true }); }, 60000);
document.addEventListener('visibilitychange', () => { if (refreshOk() && Date.now() - getApp().live.syncedAt > 30000) void loadLive({ silent: true }); });
