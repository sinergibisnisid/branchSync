/*
 * Dialog Masuk: akun diperiksa oleh server BranchSync (kata sandi, kode OTP email, atau Google).
 * Kata sandi tidak pernah disimpan; token sesi disimpan di sessionStorage.
 */
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store';
import { enterAdmin } from '../admin/workspace';
import { useLandingText } from './Landing';

type Panel = 'password' | 'email' | 'code';
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

export function LoginDialog({ open, message, onClose }: { open: boolean; message: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const lang = useApp(s => s.lang);
  const T = useLandingText();
  const text = (id: string, en: string) => (lang === 'en' ? en : id);
  const [panel, setPanel] = useState<Panel>('password');
  const [showUrl, setShowUrl] = useState(!api.getBaseUrl());
  const [url, setUrl] = useState(api.getBaseUrl());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [otpAddress, setOtpAddress] = useState('');
  const [otpInfo, setOtpInfo] = useState('');
  const urlRef = useRef<HTMLInputElement>(null), userRef = useRef<HTMLInputElement>(null), pwRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null), codeRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setPanel('password'); setErrs({}); setFormError(message); setShowPw(false); setBusy('');
      const base = api.getBaseUrl(); setUrl(base); setShowUrl(!base);
      requestAnimationFrame(() => (base ? userRef.current : urlRef.current)?.focus());
    }
    if (!open && d.open) d.close();
  }, [open, message]);

  const clear = () => { setErrs({}); setFormError(''); };
  const go = (p: Panel) => {
    clear(); setPanel(p);
    requestAnimationFrame(() => ({ password: userRef, email: emailRef, code: codeRef })[p].current?.focus({ preventScroll: true }));
  };
  // URL server yang dipakai untuk masuk; menampilkan galat di kolom URL bila tidak valid.
  const target = (): string | null => {
    const raw = showUrl ? url : api.getBaseUrl();
    let u = '';
    try { u = api.normalizeUrl(raw); } catch (e) { setShowUrl(true); setErrs({ url: (e as Error).message }); urlRef.current?.focus(); return null; }
    if (!u) { setShowUrl(true); setErrs({ url: text('Isi URL server BranchSync dari tim TI Anda.', 'Enter the BranchSync server URL from your IT team.') }); requestAnimationFrame(() => urlRef.current?.focus()); return null; }
    return u;
  };
  const networkMsg = (e: unknown) => { const err = e as api.ApiError; return err && err.status ? err.message : text('Tidak dapat terhubung ke server BranchSync. Periksa URL server dan koneksi internet.', 'Cannot reach the BranchSync server. Check the server URL and your internet connection.'); };
  const startLive = (u: string, res: { token?: string; user?: api.SessionUser }) => {
    api.setBaseUrl(u);
    api.setSession(res?.token, res?.user);
    onClose();
    enterAdmin();
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault(); clear();
    const username = userRef.current!.value.trim(), password = pwRef.current!.value, er: Record<string, string> = {};
    if (!username) er.username = text('Isi nama pengguna.', 'Enter a username.');
    if (!password) er.password = text('Isi kata sandi.', 'Enter a password.');
    if (Object.keys(er).length) { setErrs(er); (er.username ? userRef : pwRef).current?.focus(); return; }
    const u = target(); if (!u) return;
    setBusy('password');
    try {
      const res = await api.request<{ token?: string; user?: api.SessionUser }>('POST', '/auth/login', { username, password }, { auth: false, baseUrl: u });
      startLive(u, res);
    } catch (err) {
      if ((err as api.ApiError).status === 401) { setErrs({ password: text('Nama pengguna atau kata sandi salah.', 'Incorrect username or password.') }); pwRef.current?.select(); pwRef.current?.focus(); }
      else setFormError(networkMsg(err));
    } finally { setBusy(''); }
  };
  const requestOtp = async (address: string, which: string) => {
    const u = target(); if (!u) return false;
    setBusy(which);
    try { await api.request('POST', '/auth/otp/request', { email: address }, { auth: false, baseUrl: u }); return true; }
    catch (err) { setFormError((err as api.ApiError).status === 400 ? (err as Error).message : networkMsg(err)); return false; }
    finally { setBusy(''); }
  };
  const submitEmail = async (e: FormEvent) => {
    e.preventDefault(); clear();
    const el = emailRef.current!;
    if (!el.value.trim() || !el.checkValidity()) { setErrs({ email: text('Masukkan alamat email yang valid.', 'Enter a valid email address.') }); el.focus(); return; }
    const address = el.value.trim().toLowerCase();
    setOtpAddress(address);
    if (await requestOtp(address, 'otp')) { setOtpInfo(''); go('code'); }
  };
  const submitCode = async (e: FormEvent) => {
    e.preventDefault(); clear();
    const code = codeRef.current!.value;
    if (!/^\d{6}$/.test(code)) { setErrs({ code: text('Masukkan 6 digit kode dari email.', 'Enter the 6-digit code from the email.') }); codeRef.current?.focus(); return; }
    const u = target(); if (!u) return;
    setBusy('verify');
    try {
      const res = await api.request<{ token?: string; user?: api.SessionUser }>('POST', '/auth/otp/verify', { email: otpAddress, code }, { auth: false, baseUrl: u });
      startLive(u, res);
    } catch (err) {
      if ((err as api.ApiError).status === 401) { setErrs({ code: (err as Error).message || text('Kode tidak sesuai.', 'Incorrect code.') }); codeRef.current?.select(); codeRef.current?.focus(); }
      else setFormError(networkMsg(err));
    } finally { setBusy(''); }
  };
  const google = () => {
    clear();
    if (location.protocol === 'file:') { setFormError(text('Login Google hanya bisa dipakai bila BranchSync dibuka lewat alamat web (http/https), bukan dari file lokal. Gunakan kata sandi atau kode OTP.', 'Google sign-in only works when BranchSync is opened from a web address (http/https), not a local file. Use a password or OTP code.')); return; }
    const u = target(); if (!u) return;
    api.setBaseUrl(u);
    location.assign(`${u}/auth/google/start?redirect_uri=${encodeURIComponent(location.href.split('#')[0])}`);
  };
  const base = api.getBaseUrl();
  const errAttrs = (k: string, id: string) => ({ 'aria-invalid': errs[k] ? true : undefined, 'aria-describedby': id });
  useEffect(() => { if (!showUrl) setErrs(e => { const { url: _u, ...rest } = e; void _u; return rest; }); }, [showUrl]);

  return (
    <dialog ref={ref} id="loginDialog" className="login-dialog" aria-labelledby="loginTitle" aria-describedby="loginIntro"
      onClose={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="login-band">
        <span className="brand-logo" aria-hidden="true">BRI</span>
        <span className="brand-text"><strong>BranchSync</strong><small>{T('adminWorkspace')}</small></span>
        <button type="button" className="login-close" aria-label={T('close')} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="login-content">
        <h2 id="loginTitle">{T('loginTitle')}</h2>
        <p id="loginIntro" className="login-intro">{T('loginIntro')}</p>
        <div className="login-server" id="loginServer" data-state={base ? 'set' : 'none'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>
          <span id="loginServerText">{base ? <>{text('Server', 'Server')}: <strong>{hostOf(base)}</strong></> : text('Server BranchSync belum diatur. Isi URL dari tim TI Anda.', 'BranchSync server not set. Enter the URL from your IT team.')}</span>
          {!showUrl && <button type="button" className="link-btn" id="loginServerEdit" aria-controls="loginServerField" aria-expanded={showUrl} onClick={() => { setShowUrl(true); requestAnimationFrame(() => urlRef.current?.focus()); }}>{T('loginServerEdit')}</button>}
        </div>
        {showUrl && (
          <div className="field" id="loginServerField">
            <label htmlFor="loginServerUrl">{T('loginServerLabel')}</label>
            <input ref={urlRef} id="loginServerUrl" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="https://api.branchsync.co.id/v1" value={url} onChange={e => setUrl(e.target.value)} {...errAttrs('url', 'loginServerError')} />
            <small className="field-error" id="loginServerError">{errs.url}</small>
          </div>
        )}
        <p className="login-error" id="loginError" role="alert">{formError}</p>

        {panel === 'password' && <>
          <form id="loginForm" noValidate onSubmit={e => { void submitPassword(e); }}>
            <div className="field">
              <label htmlFor="loginUsername">{T('loginUsername')}</label>
              <input ref={userRef} id="loginUsername" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required {...errAttrs('username', 'usernameError')} />
              <small className="field-error" id="usernameError">{errs.username}</small>
            </div>
            <div className="field">
              <label htmlFor="loginPassword">{T('loginPassword')}</label>
              <div className="password-control">
                <input ref={pwRef} id="loginPassword" type={showPw ? 'text' : 'password'} autoComplete="current-password" required {...errAttrs('password', 'passwordError')} />
                <button id="passwordToggle" type="button" aria-controls="loginPassword" aria-pressed={showPw} aria-label={showPw ? text('Sembunyikan kata sandi', 'Hide password') : text('Tampilkan kata sandi', 'Show password')} onClick={() => { setShowPw(!showPw); pwRef.current?.focus(); }}>{showPw ? text('Sembunyikan', 'Hide') : text('Tampilkan', 'Show')}</button>
              </div>
              <small className="field-error" id="passwordError">{errs.password}</small>
            </div>
            <button type="submit" id="loginSubmit" className="btn btn-primary btn-block btn-lg" disabled={busy === 'password'} aria-busy={busy === 'password' || undefined}>{busy === 'password' ? text('Memeriksa…', 'Checking…') : T('loginSubmit')}</button>
          </form>
          <div id="loginAlternatives" className="login-alternatives">
            <div className="login-divider"><span>{T('loginOr')}</span></div>
            <button type="button" id="googlePreview" className="btn btn-outline btn-block" onClick={google}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
                <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
                <path fill="#FBBC05" d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.31.31-1.92V7.49H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.51l3.34-2.59Z" />
                <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z" />
              </svg>
              <span>{T('loginGoogle')}</span>
            </button>
            <button type="button" id="otpPreview" className="btn btn-outline btn-block" onClick={() => go('email')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
              <span>{T('loginOtp')}</span>
            </button>
          </div>
        </>}

        {panel === 'email' && (
          <form id="otpEmailForm" noValidate onSubmit={e => { void submitEmail(e); }}>
            <div className="field">
              <label htmlFor="otpEmail">{T('otpEmail')}</label>
              <input ref={emailRef} id="otpEmail" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required placeholder="nama@bri.co.id" defaultValue={otpAddress} {...errAttrs('email', 'otpEmailError')} />
              <small className="field-error" id="otpEmailError">{errs.email}</small>
            </div>
            <button type="submit" id="otpSend" className="btn btn-primary btn-block btn-lg" disabled={busy === 'otp'} aria-busy={busy === 'otp' || undefined}>{busy === 'otp' ? text('Mengirim…', 'Sending…') : T('otpOpen')}</button>
          </form>
        )}

        {panel === 'code' && (
          <form id="otpCodeForm" noValidate onSubmit={e => { void submitCode(e); }}>
            <div className="field">
              <label htmlFor="otpCode">{T('otpCode')}</label>
              <p id="otpHint" className="otp-hint">{text(`Jika ${otpAddress} terdaftar, kode 6 digit telah dikirim ke email tersebut. Kode berlaku 10 menit.`, `If ${otpAddress} is registered, a 6-digit code has been sent to it. The code is valid for 10 minutes.`)}</p>
              <input ref={codeRef} id="otpCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required aria-describedby="otpHint otpStatus" aria-invalid={errs.code ? true : undefined}
                onChange={e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); if (errs.code || otpInfo) { setErrs({}); setOtpInfo(''); } }} />
              <small id="otpStatus" className="field-error" role="status" aria-live="polite">{errs.code || otpInfo}</small>
            </div>
            <button type="submit" id="otpVerifyBtn" className="btn btn-primary btn-block btn-lg" disabled={busy === 'verify'} aria-busy={busy === 'verify' || undefined}>{busy === 'verify' ? text('Memeriksa…', 'Checking…') : T('otpVerify')}</button>
            <button type="button" id="otpResend" className="link-btn otp-resend" disabled={busy === 'resend'} onClick={() => { clear(); void requestOtp(otpAddress, 'resend').then(ok => ok && setOtpInfo(text('Kode baru telah dikirim.', 'A new code has been sent.'))); }}>{busy === 'resend' ? text('Mengirim…', 'Sending…') : T('otpResend')}</button>
          </form>
        )}

        {panel !== 'password' && (
          <button type="button" id="backToPassword" className="link-btn login-back" onClick={() => go('password')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            <span>{T('backToPassword')}</span>
          </button>
        )}
      </div>
    </dialog>
  );
}
