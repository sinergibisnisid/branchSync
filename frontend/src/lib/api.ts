/*
 * Klien REST API BranchSync (backend Go + PostgreSQL). Kontrak endpoint: ../../API.md.
 * - URL server: terakhir dipakai di browser ini → apiBaseUrl dari /config.js (deploy) → isian dialog Masuk.
 * - Token sesi disimpan di sessionStorage (hilang saat tab ditutup). Kata sandi tidak pernah disimpan.
 */

declare global {
  interface Window { BRANCHSYNC_CONFIG?: { apiBaseUrl?: string } }
}

const K = { url: 'branchSync.apiBaseUrl', token: 'branchSync.token', user: 'branchSync.user' };

const store = (area: 'localStorage' | 'sessionStorage') => ({
  get(k: string): string | null { try { return window[area].getItem(k); } catch { return null; } },
  set(k: string, v: string | null | undefined) {
    try { if (v == null || v === '') window[area].removeItem(k); else window[area].setItem(k, v); } catch { /* penyimpanan diblokir */ }
  }
});
const local = store('localStorage'), session = store('sessionStorage');

export type ApiErrorCode = 'error' | 'bad-url' | 'no-url' | 'no-token' | 'timeout' | 'network' | 'unauthorized' | 'forbidden' | 'http' | 'bad-data';

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  constructor(message: string, status = 0, code: ApiErrorCode = 'error') {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code;
  }
}

export interface SessionUser {
  id?: number; name?: string; username?: string; email?: string; role?: string; permissions?: string[];
}

export function normalizeUrl(u: unknown): string {
  const s = String(u ?? '').trim().replace(/\/+$/, '');
  if (!s) return '';
  let parsed: URL;
  try { parsed = new URL(s); } catch { throw new ApiError('Format URL tidak valid. Contoh: https://api.contoh.co.id/v1', 0, 'bad-url'); }
  if (!/^https?:$/.test(parsed.protocol)) throw new ApiError('URL harus diawali http:// atau https://', 0, 'bad-url');
  return s;
}

const configUrl = () => { try { return normalizeUrl(window.BRANCHSYNC_CONFIG?.apiBaseUrl || ''); } catch { return ''; } };
export const getBaseUrl = (): string => local.get(K.url) || configUrl();
export const setBaseUrl = (u: string): string => { const n = normalizeUrl(u); local.set(K.url, n); return n; };
export const host = (): string => { try { return new URL(getBaseUrl()).host; } catch { return ''; } };

export const getToken = (): string => session.get(K.token) || '';
export const hasSession = (): boolean => !!getToken();
export function getUser(): SessionUser | null { try { return JSON.parse(session.get(K.user) || 'null'); } catch { return null; } }
export function setSession(token: string | undefined, user: SessionUser | null | undefined) {
  if (!token) throw new ApiError('Server tidak mengembalikan token sesi.', 0, 'no-token');
  session.set(K.token, token);
  session.set(K.user, user ? JSON.stringify(user) : '');
}
export function clearSession() { session.set(K.token, ''); session.set(K.user, ''); }

// Dipanggil saat server menjawab 401 (sesi kedaluwarsa) — workspace kembali ke halaman depan.
type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => { unauthorizedListeners.add(fn); return () => { unauthorizedListeners.delete(fn); }; };

export interface RequestOptions { timeout?: number; auth?: boolean; baseUrl?: string }

export async function request<T = unknown>(method: string, path: string, body?: unknown, { timeout = 15000, auth = true, baseUrl = '' }: RequestOptions = {}): Promise<T> {
  const base = baseUrl || getBaseUrl();
  if (!base) throw new ApiError('URL server API belum diatur.', 0, 'no-url');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    throw new ApiError(aborted ? 'Server tidak merespons (timeout).' : 'Tidak dapat terhubung ke server. Periksa URL API, jaringan, atau pengaturan CORS server.', 0, aborted ? 'timeout' : 'network');
  } finally { clearTimeout(timer); }
  const raw = await res.text();
  let data: unknown = null;
  if (raw) { try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 200) }; } }
  if (!res.ok) {
    const d = data as { message?: string; error?: string } | null;
    const msg = (d && (d.message || d.error)) || `Permintaan gagal (HTTP ${res.status}).`;
    if (res.status === 401 && auth) { clearSession(); unauthorizedListeners.forEach(fn => fn()); }
    throw new ApiError(msg, res.status, res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'http');
  }
  return data as T;
}
