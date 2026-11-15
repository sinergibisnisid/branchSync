// Pengaturan › Profil: akun yang sedang masuk. Nama tampilan dan kata sandi diubah sendiri;
// email, nama pengguna, dan peran diatur Administrator di Pengaturan › Pengguna & Akses.
import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from 'react';
import * as api from '../../lib/api';
import { initials } from '../../lib/format';
import { setApp, toast, useApp } from '../../store';
import { Callout, Card, KV } from '../ui/components';
import { Ic } from '../ui/Icon';
import { loadLive, meFromSession } from '../workspace';
import { SettingsPage } from './OpsViews';

type Errs = Record<string, string>;

function TextField({ id, label, hint = '', err, ...input }: { id: string; label: string; hint?: string; err?: string } & ComponentProps<'input'>) {
  return (
    <div className="bs-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} aria-invalid={err ? true : undefined} aria-describedby={`${id}-hint`} {...input} />
      <small className={err ? 'bs-field-hint is-error' : 'bs-field-hint'} id={`${id}-hint`}>{err || hint}</small>
    </div>
  );
}

// Data sesi di browser ikut diperbarui agar nama di sidebar dan sapaan langsung berubah.
function applyUser(user: api.SessionUser) {
  api.setSession(api.getToken(), user);
  setApp(s => { s.me = meFromSession(); });
}

export function Profile() {
  const me = useApp(s => s.me);
  const [prof, setProf] = useState<api.SessionUser | null>(null);
  const [loadErr, setLoadErr] = useState('');
  useEffect(() => {
    let live = true;
    api.request<api.SessionUser>('GET', '/me')
      .then(u => { if (live) { setProf(u); applyUser(u); } })
      .catch(e => { if (live) setLoadErr((e as Error).message); });
    return () => { live = false; };
  }, []);
  return (
    <SettingsPage>
      {loadErr ? <Callout tone="bad" icon="alert">{`Profil tidak dapat dimuat: ${loadErr}`}</Callout>
        : !prof ? <p className="bs-muted" role="status">Memuat profil…</p>
          : <>
            <AccountCard prof={prof} name={me.name} onSaved={setProf} />
            <PasswordCard hasPassword={!!prof.hasPassword} />
          </>}
    </SettingsPage>
  );
}

function AccountCard({ prof, name, onSaved }: { prof: api.SessionUser; name: string; onSaved: (u: api.SessionUser) => void }) {
  const [errs, setErrs] = useState<Errs>({});
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = nameRef.current!.value.trim();
    if (!next) { setErrs({ name: 'Isi nama tampilan.' }); nameRef.current?.focus(); return; }
    setErrs({});
    if (next === name) { toast('Tidak ada perubahan.', { tone: 'good' }); return; }
    setBusy(true);
    try {
      const u = await api.request<api.SessionUser>('PATCH', '/me', { name: next });
      applyUser(u); onSaved(u);
      toast('Profil disimpan.', { tone: 'good' });
      void loadLive({ silent: true }); // daftar pengguna & riwayat ikut diperbarui
    } catch (err) {
      const ae = err as api.ApiError;
      if (ae.field === 'name') { setErrs({ name: ae.message }); nameRef.current?.focus(); } else if (ae.status !== 401) toast(ae.message, { tone: 'bad' });
    } finally { setBusy(false); }
  };
  return (
    <Card title="Informasi akun">
      <div className="bs-mode-row"><span className="bs-avatar" aria-hidden="true">{initials(name)}</span><div><strong>{name}</strong><small>{prof.role || 'Pengguna'}</small></div></div>
      <form id="bsProfileForm" className="bs-stack bs-gap" noValidate onSubmit={e => { void submit(e); }}>
        <div className="bs-form-grid">
          <TextField id="pfName" label="Nama tampilan" ref={nameRef} defaultValue={name} maxLength={80} autoComplete="name" required err={errs.name} hint="Tampil di sidebar, riwayat perubahan, dan balasan ulasan." />
        </div>
        <KV pairs={[['Email', prof.email || '—'], ['Nama pengguna', prof.username || '—'], ['Peran', prof.role || '—']]} />
        <p className="bs-muted">Email, nama pengguna, dan peran diatur oleh Administrator di Pengaturan › Pengguna & Akses.</p>
        <div className="bs-form-actions"><button type="submit" className="bs-btn primary" disabled={busy} aria-busy={busy || undefined}><Ic name="check" /><span>{busy ? 'Menyimpan…' : 'Simpan profil'}</span></button></div>
      </form>
    </Card>
  );
}

function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [errs, setErrs] = useState<Errs>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  if (!hasPassword) {
    return <Card title="Kata sandi"><Callout icon="info">Akun Anda masuk dengan kode OTP email atau Google, jadi tidak memakai kata sandi. Minta Administrator bila Anda ingin bisa masuk dengan kata sandi.</Callout></Card>;
  }
  const focus = (k: string) => (formRef.current?.elements.namedItem(k) as HTMLInputElement | null)?.focus();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget), g = (k: string) => String(fd.get(k) || '');
    const cur = g('pwCurrent'), next = g('pwNew'), again = g('pwAgain'), er: Errs = {};
    if (!cur) er.pwCurrent = 'Isi kata sandi saat ini.';
    if ([...next].length < 10) er.pwNew = 'Kata sandi minimal 10 karakter.';
    else if (next === cur) er.pwNew = 'Kata sandi baru harus berbeda dari kata sandi saat ini.';
    if (!er.pwNew && again !== next) er.pwAgain = 'Kata sandi baru tidak sama.';
    setErrs(er);
    const first = ['pwCurrent', 'pwNew', 'pwAgain'].find(k => er[k]);
    if (first) { focus(first); return; }
    setBusy(true);
    try {
      await api.request('POST', '/me/password', { currentPassword: cur, newPassword: next });
      formRef.current?.reset();
      toast('Kata sandi diganti. Sesi Anda di perangkat lain telah dikeluarkan.', { tone: 'good' });
    } catch (err) {
      const ae = err as api.ApiError;
      const k = ae.field === 'currentPassword' ? 'pwCurrent' : ae.field === 'newPassword' ? 'pwNew' : '';
      if (k) { setErrs({ [k]: ae.message }); focus(k); } else if (ae.status !== 401) toast(ae.message, { tone: 'bad' });
    } finally { setBusy(false); }
  };
  return (
    <Card title="Kata sandi" sub="Minimal 10 karakter. Setelah diganti, sesi Anda di perangkat lain akan dikeluarkan.">
      <form id="bsPasswordForm" ref={formRef} className="bs-stack" noValidate onSubmit={e => { void submit(e); }}>
        {/* Nama pengguna tersembunyi membantu pengelola kata sandi browser menyimpan sandi baru ke akun yang benar. */}
        <input type="text" name="username" autoComplete="username" value={api.getUser()?.username || api.getUser()?.email || ''} readOnly hidden />
        <div className="bs-form-grid">
          <TextField id="pwCurrent" label="Kata sandi saat ini" type="password" autoComplete="current-password" required err={errs.pwCurrent} />
          <span aria-hidden="true" />
          <TextField id="pwNew" label="Kata sandi baru" type="password" autoComplete="new-password" required minLength={10} err={errs.pwNew} />
          <TextField id="pwAgain" label="Ulangi kata sandi baru" type="password" autoComplete="new-password" required err={errs.pwAgain} />
        </div>
        <div className="bs-form-actions"><button type="submit" className="bs-btn primary" disabled={busy} aria-busy={busy || undefined}><Ic name="key" /><span>{busy ? 'Menyimpan…' : 'Ganti kata sandi'}</span></button></div>
      </form>
    </Card>
  );
}
