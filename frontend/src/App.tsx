// Akar aplikasi: halaman depan + dialog Masuk, atau workspace admin setelah masuk.
import { lazy, Suspense, useEffect, useState } from 'react';
import * as api from './lib/api';
import { enterAdmin, registerLoginOpener } from './admin/workspace';
import { Landing } from './landing/Landing';
import { LoginDialog } from './landing/LoginDialog';
import { getApp, useApp } from './store';

/*
 * Workspace admin dimuat terpisah (code splitting): halaman depan tidak perlu mengunduh kode admin.
 * Unduhan dimulai lebih awal saat dialog Masuk dibuka. Bila file lama sudah tidak ada di server
 * (ada deploy baru sejak halaman dibuka), halaman dimuat ulang sekali untuk mengambil versi baru.
 */
const RELOAD_KEY = 'bs_chunk_reload';
let adminChunk: Promise<typeof import('./admin/AdminApp')> | null = null;
function loadAdmin() {
  adminChunk ??= import('./admin/AdminApp')
    .then(m => { try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* abaikan */ } return m; })
    .catch((e: unknown) => {
      adminChunk = null;
      let reloaded = false;
      try { reloaded = sessionStorage.getItem(RELOAD_KEY) === '1'; if (!reloaded) sessionStorage.setItem(RELOAD_KEY, '1'); } catch { reloaded = true; }
      if (!reloaded) { location.reload(); return new Promise<never>(() => {}); }
      throw e;
    });
  return adminChunk;
}
const AdminApp = lazy(() => loadAdmin().then(m => ({ default: m.AdminApp })));

function AdminLoading() {
  const en = useApp(s => s.lang) === 'en';
  return <div className="bs-live-loading" aria-busy="true"><p className="bs-live-loading-msg" role="status"><span className="bs-spinner sm" aria-hidden="true" />{en ? 'Loading workspace…' : 'Memuat workspace…'}</p></div>;
}

/*
 * Kembali dari server setelah OAuth Google:
 *   #bs_token=…  → login Google berhasil   ·   #bs_error=… → login gagal
 *   #bs_gbp=connected | #bs_gbp=<pesan>    → hasil menghubungkan akun Google Business Profile
 */
function handleOAuthReturn(openLogin: (m?: string) => void): boolean {
  const h = new URLSearchParams(location.hash.slice(1));
  const token = h.get('bs_token'), err = h.get('bs_error'), gbp = h.get('bs_gbp');
  if (!token && !err && !gbp) return false;
  const en = getApp().lang === 'en', text = (id: string, e: string) => (en ? e : id);
  history.replaceState(null, '', location.pathname + location.search);
  if (gbp) {
    if (!api.hasSession()) { openLogin(text('Sesi berakhir. Silakan masuk lagi.', 'Session expired. Please sign in again.')); return true; }
    enterAdmin({ view: 'integrations', notice: gbp === 'connected' ? text('Akun Google berhasil dihubungkan.', 'Google account connected.') : text('Gagal menghubungkan akun Google: ', 'Failed to connect Google account: ') + gbp });
    return true;
  }
  if (err) { openLogin(text('Login Google gagal: ', 'Google sign-in failed: ') + err); return true; }
  api.setSession(token!, null);
  api.request<api.SessionUser>('GET', '/me')
    .then(user => { api.setSession(token!, user); enterAdmin(); })
    .catch(e => { api.clearSession(); openLogin((e as Error).message); });
  return true;
}

export function App() {
  const screen = useApp(s => s.screen);
  const [login, setLogin] = useState<{ open: boolean; message: string }>({ open: false, message: '' });
  const openLogin = (message = '') => {
    void loadAdmin().catch(() => {});
    // Sesi yang masih tersimpan di tab ini → langsung masuk (server memeriksa ulang sesinya).
    if (!message && api.hasSession() && api.getBaseUrl()) { enterAdmin(); return; }
    setLogin({ open: true, message });
  };
  useEffect(() => {
    registerLoginOpener(openLogin);
    if (handleOAuthReturn(openLogin)) return;
    // Tautan dalam aplikasi (#/halaman…) dengan sesi aktif → buka workspace langsung.
    if (location.hash.startsWith('#/')) { if (api.hasSession() && api.getBaseUrl()) enterAdmin(); else setLogin({ open: true, message: '' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>
    {screen === 'admin' ? <Suspense fallback={<AdminLoading />}><AdminApp /></Suspense> : <Landing onLogin={() => openLogin()} />}
    <LoginDialog open={login.open && screen !== 'admin'} message={login.message} onClose={() => setLogin({ open: false, message: '' })} />
  </>;
}
