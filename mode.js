'use strict';
/*
 * BranchMode — mode aplikasi (Demo / Live) dan klien REST API.
 * - Demo: semua data simulasi di browser (localStorage), tanpa jaringan.
 * - Live: data dari backend BranchSync. Kontrak endpoint: lihat API.md.
 * Token sesi disimpan di sessionStorage (hilang saat tab ditutup);
 * kata sandi tidak pernah disimpan.
 */
window.BranchMode = (() => {
  const K = { mode: 'branchSync.mode', url: 'branchSync.apiBaseUrl', token: 'branchSync.token', user: 'branchSync.user' };
  const store = area => ({
    get(k) { try { return window[area].getItem(k); } catch (_) { return null; } },
    set(k, v) { try { if (v == null || v === '') window[area].removeItem(k); else window[area].setItem(k, v); } catch (_) {} }
  });
  const local = store('localStorage'), session = store('sessionStorage');
  let mode = local.get(K.mode) === 'live' ? 'live' : 'demo';
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(mode); } catch (_) {} });

  class ApiError extends Error {
    constructor(message, status = 0, code = 'error') { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
  }
  function normalizeUrl(u) {
    u = String(u || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    let parsed;
    try { parsed = new URL(u); } catch (_) { throw new ApiError('Format URL tidak valid. Contoh: https://api.contoh.co.id/v1', 0, 'bad-url'); }
    if (!/^https?:$/.test(parsed.protocol)) throw new ApiError('URL harus diawali http:// atau https://', 0, 'bad-url');
    return u;
  }
  const getBaseUrl = () => local.get(K.url) || '';
  const getToken = () => session.get(K.token) || '';
  function getUser() { try { return JSON.parse(session.get(K.user) || 'null'); } catch (_) { return null; } }
  function setSession(token, user) {
    if (!token) throw new ApiError('Server tidak mengembalikan token sesi.', 0, 'no-token');
    session.set(K.token, token);
    session.set(K.user, user ? JSON.stringify(user) : '');
  }
  function clearSession() { session.set(K.token, ''); session.set(K.user, ''); }

  async function request(method, path, body, { timeout = 15000, auth = true, baseUrl = '' } = {}) {
    const base = baseUrl || getBaseUrl();
    if (!base) throw new ApiError('URL server API belum diatur.', 0, 'no-url');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
    } catch (e) {
      throw new ApiError(e.name === 'AbortError' ? 'Server tidak merespons (timeout).' : 'Tidak dapat terhubung ke server. Periksa URL API, jaringan, atau pengaturan CORS server.', 0, e.name === 'AbortError' ? 'timeout' : 'network');
    } finally { clearTimeout(timer); }
    const raw = await res.text();
    let data = null;
    if (raw) { try { data = JSON.parse(raw); } catch (_) { data = { message: raw.slice(0, 200) }; } }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `Permintaan gagal (HTTP ${res.status}).`;
      if (res.status === 401 && auth) clearSession();
      throw new ApiError(msg, res.status, res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'http');
    }
    return data;
  }

  return {
    ApiError,
    get mode() { return mode; },
    isLive: () => mode === 'live',
    setMode(m) { const next = m === 'live' ? 'live' : 'demo'; if (next === mode) return; mode = next; local.set(K.mode, mode); emit(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getBaseUrl,
    setBaseUrl(u) { const n = normalizeUrl(u); local.set(K.url, n); return n; },
    normalizeUrl,
    host() { try { return new URL(getBaseUrl()).host; } catch (_) { return ''; } },
    getToken, getUser, setSession, clearSession,
    hasSession: () => !!getToken(),
    request
  };
})();
