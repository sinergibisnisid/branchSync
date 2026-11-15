// Halaman operasional & administrasi: Sync Monitor, Riwayat Perubahan, SLA & Kinerja, serta Pengaturan
// (tab Umum, Pengguna & Akses, Integrasi Google).
import { useState, type FormEvent, type ReactNode } from 'react';
import * as api from '../../lib/api';
import { acctOf, claimName, dailySync, diff, locName, openFailures, slaStats } from '../../lib/data';
import { DAY, GOOGLE_SCOPES, HOUR, MIN, navItem, navTabs, PERMS, SYNC_INTERVALS, type ViewId } from '../../lib/domain';
import { downloadCSV } from '../../lib/files';
import { fmtDur, fmtNum, fmtStamp, initials, pct, sum } from '../../lib/format';
import type { AuditEntry, Workspace } from '../../lib/types';
import { getApp, setUi, toast, useApp, type UiState } from '../../store';
import { apiDisconnect, apiTest, gbpOAuth, resolveFailure, toggleUser, togglePerm } from '../actions';
import { roleForm, userForm } from '../forms/AccessForms';
import { ActionsHead, Badge, Bar, Btn, Callout, Card, ChipRow, cx, DiffList, EmptyState, KV, Metric, Options, PageHead, SearchF, SelectF, Table, TabPanel, Tabs, When, WhenCell, WhenFull } from '../ui/components';
import { Ic } from '../ui/Icon';
import { canView, guard, navigate, openDrawer, remote, runSync, sessionExpired, useCan, useWs } from '../workspace';
import { openTarget } from './Dashboard';

/* ---------- Sync Monitor ---------- */
export function SyncView() {
  const ws = useWs();
  const tab = useApp(s => s.ui.sync.tab);
  const running = useApp(s => s.running);
  const fails = openFailures(ws), daily = dailySync(ws, 7), runs = ws.runs;
  const ok = sum(daily.map(d => d.ok)), fl = sum(daily.map(d => d.fail));
  const avgDur = runs.length ? sum(runs.slice(0, 20).map(r => r.durationMs)) / Math.min(20, runs.length) : 0;
  const setTab = (v: string) => setUi(ui => { ui.sync.tab = v; });
  return <>
    <PageHead title="Sync Monitor" desc={navItem('sync').desc} actions={<Btn label={running ? 'Menyinkronkan…' : 'Sinkronkan semua'} icon="refresh" variant="primary" perm="sync.run" disabled={!!running} onClick={() => runSync(null)} />} />
    {running && <><div className="bs-progress is-indeterminate" role="progressbar" aria-label="Server sedang menyinkronkan"><span /></div><p className="bs-muted">Server sedang menyinkronkan {fmtNum(running.total)} unit…</p></>}
    <div className="bs-metrics">
      <Metric label="Tingkat keberhasilan · 7 hari" value={pct(ok, ok + fl) + '%'} note={`${fmtNum(ok)} berhasil · ${fmtNum(fl)} gagal`} spark={daily.map(d => pct(d.ok, d.ok + d.fail))} tone={pct(ok, ok + fl) < 95 ? 'warn' : 'good'} />
      <Metric label="Belum ditangani" value={fmtNum(fails.length)} note="unit gagal diperbarui" tone={fails.length ? 'bad' : 'good'} icon="alert" />
      <Metric label="Rata-rata durasi job" value={fmtDur(Math.max(MIN, avgDur))} note="20 job terakhir" icon="gauge" />
      <Metric label="Sisa kuota API" value={fmtNum(ws.api.quotaLimit - ws.api.quotaUsed)} note={`dari ${fmtNum(ws.api.quotaLimit)} per hari`} icon="plug" view="integrations" />
    </div>
    <Card title="Detail sinkronisasi">
      <Tabs bind="sync.tab" label="Detail sinkronisasi" cur={tab} onChange={setTab} items={[['failures', 'Kegagalan', fails.length], ['runs', 'Riwayat job', runs.length]]} />
      <TabPanel bind="sync.tab" cur={tab}>
        {tab === 'failures'
          ? (fails.length ? <>
            <div className="bs-table-actions"><Btn label={`Coba lagi semua (${fails.length})`} icon="refresh" variant="sm" perm="sync.run" disabled={!!running} onClick={() => runSync(fails.map(f => f.code), { retry: true, label: 'Coba ulang kegagalan' })} /></div>
            <Table heads={['Unit kerja', 'Penyebab', 'Job', ActionsHead]} rows={fails.map(f => ({ key: f.code, cells: [
              <button type="button" className="bs-cell-link" onClick={() => openDrawer(f.code, 'sync')}><strong>{locName(ws, f.code)}</strong><small>{f.code}</small></button>,
              { c: f.reason, cls: 'bs-td-wrap' },
              <>{f.run}<small><When t={f.time} /></small></>,
              { c: <><Btn label="Coba lagi" icon="refresh" variant="sm" perm="sync.run" disabled={!!running} onClick={() => runSync([f.code], { retry: true, label: `Coba ulang ${f.code}` })} /><Btn label="Tindak lanjut" icon="note" variant="sm ghost" perm="sync.run" onClick={() => resolveFailure(f.code)} /></>, cls: 'bs-td-actions' }
            ] }))} />
          </> : <EmptyState title="Tidak ada kegagalan" text="Semua unit berhasil diperbarui pada job terakhir." />)
          : <Table heads={['Job', 'Waktu', 'Total', 'Berhasil', 'Gagal', 'Dilewati', 'Durasi']} rows={runs.slice(0, 50).map(r => ({ key: r.id, cells: [
            <><strong>{r.id}</strong><small>{r.scope}</small></>, <><WhenCell t={r.time} /><small>{r.by}</small></>, fmtNum(r.total), <Badge s="Berhasil" label={fmtNum(r.ok)} />,
            r.fail ? <Badge s="Gagal" label={fmtNum(r.fail)} /> : '0', fmtNum(r.skip), fmtDur(r.durationMs < MIN ? MIN : r.durationMs)
          ] }))} />}
      </TabPanel>
    </Card>
  </>;
}

/* ---------- Riwayat Perubahan ---------- */
export function auditFiltered(ws: Workspace, a: UiState['audit']) {
  const q = a.q.trim().toLowerCase(), since = a.range ? Date.now() - Number(a.range) * DAY : 0;
  return ws.audit.filter(x => x.time >= since && (!a.module || x.module === a.module) && (!a.actor || x.actor === a.actor) &&
    (!q || `${x.user} ${x.action} ${x.target} ${locName(ws, x.target)} ${x.detail} ${x.changes.map(c => `${c.before} ${c.after}`).join(' ')}`.toLowerCase().includes(q)));
}
export function Audit() {
  const ws = useWs();
  const a = useApp(s => s.ui.audit);
  const xs = auditFiltered(ws, a), modules = [...new Set(ws.audit.map(x => x.module))].sort();
  const setA = (fn: (x: UiState['audit']) => void) => setUi(ui => { fn(ui.audit); });
  const exportCsv = () => {
    if (!guard('audit.read')) return;
    downloadCSV('riwayat-perubahan.csv', [['Waktu', 'Pengguna', 'Jenis', 'Modul', 'Aksi', 'Target', 'Detail', 'Kolom', 'Sebelum', 'Sesudah'], ...xs.flatMap((x: AuditEntry) => (x.changes.length ? x.changes : [{ field: '', before: '', after: '' }]).map(c => [fmtStamp(x.time), x.user, x.actor, x.module, x.action, x.target, x.detail, c.field, c.before, c.after]))]);
    toast(`${xs.length} aktivitas diekspor.`, { tone: 'good' });
  };
  const chips = [
    a.q.trim() && { key: 'q', label: 'Kata kunci', value: a.q.trim(), onRemove: () => setA(x => { x.q = ''; }) },
    a.module && { key: 'module', label: 'Modul', value: a.module, onRemove: () => setA(x => { x.module = ''; }) },
    a.actor && { key: 'actor', label: 'Pengguna', value: a.actor === 'Internal' ? 'Internal BRI' : 'Eksternal (email lain)', onRemove: () => setA(x => { x.actor = ''; }) },
    a.range !== '30' && { key: 'range', label: 'Periode', value: ({ 1: '24 jam', 7: '7 hari', 30: '30 hari' } as Record<string, string>)[a.range] || 'Semua waktu', onRemove: () => setA(x => { x.range = '30'; }) }
  ].filter(Boolean) as { key: string; label: string; value: string; onRemove: () => void }[];
  return <>
    <PageHead title="Riwayat Perubahan" desc={navItem('audit').desc} actions={<Btn label="Ekspor CSV" icon="download" perm="audit.read" onClick={exportCsv} />} />
    <Card title={`${fmtNum(xs.length)} aktivitas`}>
      <div className="bs-toolbar">
        <SearchF label="Cari" value={a.q} ph="Pengguna, unit, nilai sebelum/sesudah…" id="bsAuditQ" onChange={v => setA(x => { x.q = v; })} />
        <SelectF label="Modul" xs={modules} value={a.module} onChange={v => setA(x => { x.module = v; })} />
        <SelectF label="Pengguna" xs={[['Internal', 'Internal BRI'], ['Eksternal', 'Eksternal (email lain)']]} value={a.actor} onChange={v => setA(x => { x.actor = v; })} />
        <SelectF label="Periode" xs={[['1', '24 jam'], ['7', '7 hari'], ['30', '30 hari']]} value={a.range} all="Semua waktu" onChange={v => setA(x => { x.range = v; })} />
      </div>
      <ChipRow chips={chips} onReset={() => setA(x => { x.q = ''; x.module = ''; x.actor = ''; x.range = '30'; })} />
      <Table cls="bs-table-scroll" empty="Tidak ada aktivitas untuk filter ini." heads={['Waktu', 'Pengguna', 'Modul', 'Aksi', 'Sebelum → sesudah']} rows={xs.slice(0, 200).map(x => ({ key: x.id, cells: [
        <WhenCell t={x.time} />,
        <span className="bs-user"><span className="bs-avatar sm" data-actor={x.actor} aria-hidden="true">{x.actor === 'Eksternal' ? '@' : initials(x.user)}</span><span>{x.user}<small><Badge s={x.actor} /></small></span></span>,
        x.module,
        <><strong>{x.action}</strong>{x.target && <small><button type="button" className="bs-inline-link" onClick={() => openTarget(x.target, ws.locations.some(l => l.code === x.target))}>{locName(ws, x.target)}</button></small>}{x.detail && <small>{x.detail}</small>}</>,
        { c: x.changes.length ? <details className="bs-changes"><summary>{`${x.changes.length} perubahan`}</summary><DiffList changes={x.changes} /></details> : <span className="bs-muted">—</span>, cls: 'bs-td-wrap' }
      ] }))} />
      {xs.length > 200 && <p className="bs-muted bs-pad">Menampilkan 200 terbaru. Ekspor CSV untuk melihat semuanya.</p>}
    </Card>
  </>;
}

/* ---------- SLA & Kinerja ---------- */
export function Sla() {
  const ws = useWs();
  const s = slaStats(ws), rows = [...s.rows].sort((a, b) => b.c.submittedAt - a.c.submittedAt);
  const maxT = Math.max(HOUR, ...rows.map(x => x.t.internal + (x.t.google || 0)));
  const limitPct = Math.min(100, ((ws.settings.slaInternal * HOUR) / maxT) * 100);
  const exportCsv = () => { downloadCSV('laporan-sla.csv', [['ID', 'Jenis', 'Unit', 'Diajukan', 'Proses internal (jam)', 'Verifikasi Google (jam)', 'SLA', 'Status'], ...s.rows.map(({ c, t }) => [c.id, c.kind, claimName(ws, c), fmtStamp(c.submittedAt), (t.internal / HOUR).toFixed(1), t.google == null ? '' : (t.google / HOUR).toFixed(1), t.sla, c.status])]); toast('Laporan SLA diunduh.', { tone: 'good' }); };
  return <>
    <PageHead title="SLA & Kinerja" desc={navItem('sla').desc} actions={<><Btn label="Atur target SLA" icon="sliders" onClick={() => navigate('settings')} /><Btn label="Ekspor CSV" icon="download" onClick={exportCsv} /></>} />
    <div className="bs-metrics">
      <Metric label="Rata-rata proses internal" value={fmtDur(s.avgInternal)} note={`Target ≤ ${ws.settings.slaInternal} jam`} icon="gauge" tone={(s.avgInternal || 0) > ws.settings.slaInternal * HOUR ? 'warn' : 'good'} />
      <Metric label="Rata-rata verifikasi Google" value={fmtDur(s.avgGoogle)} note={`Acuan ${ws.settings.slaGoogle} jam · di luar kendali BRI`} icon="shield" />
      <Metric label="Kepatuhan SLA internal" value={s.compliance + '%'} note={`${s.rows.length} permintaan dievaluasi`} tone={s.compliance < 80 ? 'warn' : 'good'} icon="check" />
      <Metric label="Berisiko / lewat SLA" value={fmtNum(s.atRisk)} note="permintaan aktif" tone={s.atRisk ? 'bad' : 'good'} icon="alert" view="claims" />
    </div>
    <Card title="Waktu penyelesaian per permintaan" sub="Bagian biru = waktu tim BRI memproses. Bagian oranye = waktu menunggu Google.">
      <div className="bs-legend"><span><i className="s1" />Proses internal BRI</span><span><i className="s2" />Verifikasi Google</span><span><i className="limit" />{`Target internal (${ws.settings.slaInternal} jam)`}</span></div>
      <div className="bs-hbars">{rows.map(({ c, t }) => (
        <div key={c.id} className="bs-hbar" tabIndex={0} aria-label={`${c.id}: internal ${fmtDur(t.internal)}, Google ${fmtDur(t.google)}`}>
          <span className="bs-hbar-label"><strong>{c.id}</strong><small>{claimName(ws, c)}</small></span>
          <span className="bs-hbar-track"><span className="s1" style={{ width: `${(t.internal / maxT) * 100}%` }} />{!!t.google && <span className="s2" style={{ width: `${(t.google / maxT) * 100}%` }} />}<i className="bs-limit" style={{ left: `${limitPct}%` }} /></span>
          <span className="bs-hbar-val">{fmtDur(t.internal + (t.google || 0))}</span>
          <span className="bs-tip" role="tooltip"><strong>{c.id} · {c.kind}</strong><span><i className="s1" />Internal <b>{`${fmtDur(t.internal)}${t.internalRunning ? ' (berjalan)' : ''}`}</b></span><span><i className="s2" />Google <b>{`${fmtDur(t.google)}${t.googleRunning ? ' (berjalan)' : ''}`}</b></span></span>
        </div>
      ))}</div>
      <details className="bs-table-toggle"><summary>Lihat sebagai tabel</summary>
        <Table heads={['ID', 'Unit', 'Diajukan', 'Internal', 'Google', 'SLA', 'Status']} rows={rows.map(({ c, t }) => ({ key: c.id, cells: [
          <><strong>{c.id}</strong><small>{c.kind}</small></>, claimName(ws, c), <WhenCell t={c.submittedAt} />,
          <>{fmtDur(t.internal)}{t.internalRunning && <small>berjalan</small>}</>, <>{fmtDur(t.google)}{t.googleRunning && <small>berjalan</small>}</>, <Badge s={t.sla} />, <Badge s={c.status} />
        ] }))} />
      </details>
    </Card>
  </>;
}

/* ---------- Pengaturan: kerangka halaman + tab (Umum · Pengguna & Akses · Integrasi Google) ----------
 * Setiap tab tetap halaman sendiri (#/pengaturan, #/pengguna-akses, #/integrasi) sehingga tautan lama
 * tetap berlaku; di sidebar hanya "Pengaturan" yang tampil. Tab tanpa izin disembunyikan. */
function SettingsPage({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const view = useApp(s => s.ui.view);
  useApp(s => s.ws?.roles); // izin peran ikut data server
  const tabs = navTabs('settings').filter(n => canView(n.id));
  const go = (v: string) => {
    navigate(v as ViewId);
    requestAnimationFrame(() => document.getElementById(`bs-tab-settings-section-${v}`)?.focus({ preventScroll: true }));
  };
  return <>
    <PageHead title="Pengaturan" desc={navItem(view).desc} actions={actions} />
    {tabs.length > 1
      ? <><Tabs bind="settings.section" label="Bagian pengaturan" cur={view} onChange={go} items={tabs.map(n => [n.id, n.tab || n.label])} />
        <TabPanel bind="settings.section" cur={view} cls="bs-stack-20">{children}</TabPanel></>
      : children}
  </>;
}

/* ---------- Pengguna & Akses ---------- */
export function Access() {
  const ws = useWs();
  const acc = useApp(s => s.ui.access);
  const me = useApp(s => s.me);
  const canManage = useCan('users.manage');
  const q = acc.q.trim().toLowerCase();
  const users = ws.users.filter(u => !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q));
  const setTab = (v: string) => setUi(ui => { ui.access.tab = v; });
  return <SettingsPage actions={acc.tab === 'users' ? <Btn label="Tambah pengguna" icon="plus" variant="primary" perm="users.manage" onClick={() => userForm()} /> : <Btn label="Tambah peran" icon="plus" variant="primary" perm="users.manage" onClick={() => roleForm()} />}>
    <Tabs bind="access.tab" label="Pengguna & Akses" cur={acc.tab} onChange={setTab} items={[['users', 'Pengguna', ws.users.length], ['roles', 'Peran & izin', ws.roles.length]]} />
    <TabPanel bind="access.tab" cur={acc.tab}>
      {acc.tab === 'users'
        ? <Card title="Pengguna">
          <div className="bs-toolbar"><SearchF label="Cari pengguna" value={acc.q} ph="Nama, email, atau peran…" id="bsUserQ" onChange={v => setUi(ui => { ui.access.q = v; })} /></div>
          <ChipRow chips={acc.q.trim() ? [{ key: 'q', label: 'Kata kunci', value: acc.q.trim(), onRemove: () => setUi(ui => { ui.access.q = ''; }) }] : []} onReset={() => setUi(ui => { ui.access.q = ''; })} />
          <Table heads={['Pengguna', 'Peran', 'Status', 'Aktif terakhir', ActionsHead]} rows={users.map(u => {
            const self = u.email === me.email;
            return { key: u.id, cells: [
              <span className="bs-user"><span className="bs-avatar sm" aria-hidden="true">{initials(u.name)}</span><span><strong>{u.name}</strong><small>{u.email}</small></span></span>,
              u.role, <Badge s={u.status} />, <When t={u.lastActive} />,
              { c: <><Btn icon="edit" variant="icon ghost sm" title={`Edit ${u.name}`} perm="users.manage" onClick={() => userForm(u.id)} /><Btn label={u.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'} variant="sm ghost" perm="users.manage" disabled={self} title={self ? 'Akun Anda sendiri' : undefined} onClick={() => toggleUser(u.id)} /></>, cls: 'bs-td-actions' }
            ] };
          })} />
        </Card>
        : <Card title="Matriks izin" sub="Centang untuk memberi izin. Perubahan langsung tersimpan dan tercatat di Riwayat.">
          <div className="bs-table-wrap" tabIndex={0} role="region" aria-label="Matriks izin"><table className="bs-table bs-matrix">
            <thead><tr><th scope="col">Izin</th>{ws.roles.map((r, i) => <th key={r.name} scope="col">{r.name}<small>{`${ws.users.filter(u => u.role === r.name).length} pengguna`}</small>{i > 0 && <Btn icon="edit" variant="icon ghost sm" title={`Ubah nama ${r.name}`} perm="users.manage" onClick={() => roleForm(r.name)} />}</th>)}</tr></thead>
            <tbody>{PERMS.map(([p, l]) => (
              <tr key={p}><th scope="row">{l}<small>{p}</small></th>{ws.roles.map((r, i) => (
                <td key={r.name}><input type="checkbox" className="bs-check" aria-label={`${r.name}: ${l}`} checked={r.permissions.includes(p)} disabled={i === 0 || !canManage} onChange={e => { void togglePerm(r.name, p, e.target.checked, l); }} /></td>
              ))}</tr>
            ))}</tbody>
          </table></div>
          <p className="bs-muted bs-pad">Administrator selalu memiliki semua izin agar workspace tidak terkunci. Izin juga diperiksa oleh server di setiap permintaan.</p>
        </Card>}
    </TabPanel>
  </SettingsPage>;
}

/* ---------- Integrasi Google ---------- */
const redirectUri = () => `${api.getBaseUrl() || 'https://<server-branchsync>'}/integrations/google/oauth/callback`;
function GField({ name, label, value = '', type = 'text', hint = '', full = false, placeholder = '', err, ...rest }: { name: string; label: string; value?: string | number; type?: string; hint?: string; full?: boolean; placeholder?: string; err?: string; autoComplete?: string; spellCheck?: boolean; min?: number; max?: number; step?: number }) {
  return (
    <div className={cx('bs-field', full && 'full')}>
      <label htmlFor={`g-${name}`}>{label}</label>
      <input id={`g-${name}`} name={name} type={type} defaultValue={String(value ?? '')} placeholder={placeholder} aria-describedby={`gh-${name}`} aria-invalid={err ? true : undefined} {...rest} />
      <small className={cx('bs-field-hint', err && 'is-error')} id={`gh-${name}`}>{err || hint}</small>
    </div>
  );
}
export function Integrations() {
  const ws = useWs();
  const canWrite = useCan('settings.write');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const a = ws.api, used = pct(a.quotaUsed, a.quotaLimit), accounts = ws.accounts || [];
  const ready = !!(a.clientId && a.hasClientSecret && a.project);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!guard('settings.write')) return;
    const form = e.currentTarget, fd = new FormData(form), g = (k: string) => String(fd.get(k) || '');
    const next = { project: g('project').trim(), account: g('account').trim(), clientId: g('clientId').trim(), scopes: fd.getAll('scopes').map(String), syncInterval: g('syncInterval') || '60', quotaLimit: Number(g('quotaLimit')), pubsubTopic: g('pubsubTopic').trim(), webhook: fd.has('webhook') };
    const secret = g('clientSecret'), apiKey = g('apiKey').trim(), er: Record<string, string> = {};
    if (next.project && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(next.project)) er.project = 'Format: 6–30 karakter huruf kecil, angka, atau tanda hubung.';
    if (next.account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.account)) er.account = 'Email tidak valid.';
    if (next.clientId && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(next.clientId)) er.clientId = 'Client ID harus berakhiran .apps.googleusercontent.com';
    if (apiKey && !/^AIza[0-9A-Za-z_-]{35}$/.test(apiKey)) er.apiKey = 'API key Google diawali "AIza" dan terdiri dari 39 karakter.';
    if (!next.scopes.includes('business.manage')) er.scopes = 'Scope business.manage wajib untuk mengelola lokasi dan ulasan.';
    if (!Number.isFinite(next.quotaLimit) || next.quotaLimit < 100 || next.quotaLimit > 1000000) er.quotaLimit = 'Isi angka 100–1.000.000.';
    if (next.pubsubTopic && !/^projects\/[^/]+\/topics\/[^/]+$/.test(next.pubsubTopic)) er.pubsubTopic = 'Format: projects/<project>/topics/<nama-topik>';
    setErrs(er);
    if (Object.keys(er).length) { requestAnimationFrame(() => ((form.querySelector('[aria-invalid="true"]') || form.querySelector('[name="scopes"]')) as HTMLElement | null)?.focus()); return; }
    const changes = diff({ ...a, scopes: a.scopes.join(', ') } as Record<string, unknown>, { ...next, scopes: next.scopes.join(', ') }, ['project', 'account', 'clientId', 'scopes', 'syncInterval', 'quotaLimit', 'pubsubTopic', 'webhook']);
    if (!changes.length && !secret && !apiKey) { toast('Tidak ada perubahan.'); return; }
    const ok = await remote('PATCH', '/integrations/google', { ...next, ...(secret ? { clientSecret: secret } : {}), ...(apiKey ? { apiKey } : {}) });
    if (ok) { toast('Konfigurasi dikirim ke server.', { tone: 'good' }); (form.elements.namedItem('clientSecret') as HTMLInputElement).value = ''; (form.elements.namedItem('apiKey') as HTMLInputElement).value = ''; }
  };
  const secretPh = (has: boolean) => (has ? '•••••••• tersimpan — isi untuk mengganti' : 'Belum diisi');
  return <SettingsPage>
    <div className="bs-grid bs-grid-main">
      <Card title="Koneksi Google Business Profile">
        <div className="bs-integration"><span className="bs-g-mark" aria-hidden="true">G</span><div><strong>{a.connected ? 'Terhubung' : 'Belum terhubung'}</strong><small>{`Token OAuth disimpan di server BranchSync (${api.host()}).`}</small></div><Badge s={a.connected ? 'Aktif' : 'Nonaktif'} label={a.connected ? 'Terhubung' : 'Terputus'} /></div>
        <KV pairs={[['Akun utama', a.account || '—'], ['Project Google Cloud', a.project || '—'], ['Kredensial OAuth', ready ? <Badge s="Berhasil" label="Lengkap" /> : <Badge s="Menunggu" label="Belum lengkap" />], ['Uji terakhir', <WhenFull t={a.lastTest} />]]} />
        <div className="bs-btn-row">{a.connected ? <Btn label="Putuskan" icon="plug" perm="settings.write" onClick={apiDisconnect} /> : <Btn label="Hubungkan akun Google" icon="external" variant="primary" perm="settings.write" onClick={() => { void gbpOAuth(); }} />}<Btn label="Uji koneksi" icon="zap" perm="settings.write" onClick={() => { void apiTest(); }} /></div>
      </Card>
      <Card title="Kuota API harian">
        <div className="bs-quota"><strong>{fmtNum(a.quotaUsed)}</strong><span>{`dari ${fmtNum(a.quotaLimit)} permintaan (${used}%)`}</span></div>
        <Bar n={a.quotaUsed} max={a.quotaLimit} label={`Kuota terpakai ${used}%`} />
        <p className="bs-muted bs-gap">Setiap pembaruan unit atau balasan ulasan memakai 1 permintaan. Batas kuota diatur di bawah.</p>
      </Card>
    </div>
    <Card title="Kredensial & konfigurasi Google API" sub="Diperlukan agar BranchSync dapat mengelola lokasi dan membalas ulasan atas nama BRI.">
      <form id="bsGoogleForm" noValidate onSubmit={e => { void submit(e); }} key={JSON.stringify(a)}><fieldset className="bs-fieldset-plain" disabled={!canWrite}>
        <div className="bs-form-grid">
          <GField name="project" label="Project ID Google Cloud" value={a.project} hint="Mis. bri-branchsync-prod" autoComplete="off" spellCheck={false} err={errs.project} />
          <GField name="account" label="Email akun utama GBP" value={a.account} type="email" hint="Akun yang memiliki/mengelola lokasi" autoComplete="off" err={errs.account} />
          <GField name="clientId" label="OAuth Client ID" value={a.clientId} full placeholder="1234567890-abc123.apps.googleusercontent.com" hint="Dari Google Cloud Console › APIs & Services › Credentials" autoComplete="off" spellCheck={false} err={errs.clientId} />
          <GField name="clientSecret" label="OAuth Client Secret" type="password" placeholder={secretPh(a.hasClientSecret)} hint="Dikirim ke server dan tidak pernah ditampilkan kembali." autoComplete="new-password" />
          <GField name="apiKey" label="API key (opsional)" type="password" placeholder={secretPh(a.hasApiKey)} hint='Untuk Places/Maps API. Diawali "AIza".' autoComplete="new-password" err={errs.apiKey} />
          <div className="bs-field full"><span className="bs-field-label">Redirect URI (daftarkan di Google Cloud Console)</span><div className="bs-copy-row"><code id="bsRedirectUri">{redirectUri()}</code><Btn label="Salin" icon="copy" variant="sm" onClick={() => { (navigator.clipboard ? navigator.clipboard.writeText(redirectUri()) : Promise.reject()).then(() => toast('Redirect URI disalin.', { tone: 'good' }), () => toast('Tidak dapat menyalin — salin manual dari kolom.', { tone: 'warn' })); }} /></div></div>
          <fieldset className="bs-fieldset full" aria-describedby="gh-scopes"><legend>Scope OAuth</legend>
            {GOOGLE_SCOPES.map(([id, label, tag]) => <label key={id} className="bs-checkline"><input type="checkbox" name="scopes" value={id} defaultChecked={a.scopes.includes(id)} /><span>{label} <code>{id}</code></span><small>{tag}</small></label>)}
            <small className={cx('bs-field-hint', errs.scopes && 'is-error')} id="gh-scopes">{errs.scopes || ''}</small>
          </fieldset>
          <div className="bs-field"><label htmlFor="g-syncInterval">Sinkronisasi otomatis</label><select id="g-syncInterval" name="syncInterval" defaultValue={a.syncInterval}><Options xs={SYNC_INTERVALS} /></select><small className="bs-field-hint">Termasuk menarik ulasan & perubahan dari Google.</small></div>
          <GField name="quotaLimit" label="Batas kuota harian" value={a.quotaLimit} type="number" hint="Jumlah permintaan API per hari" min={100} max={1000000} step={1} err={errs.quotaLimit} />
          <GField name="pubsubTopic" label="Topik Pub/Sub notifikasi (opsional)" value={a.pubsubTopic} full placeholder="projects/bri-branchsync-prod/topics/gbp-notifications" hint="Agar ulasan baru & edit dari pihak lain langsung masuk." spellCheck={false} err={errs.pubsubTopic} />
          <label className="bs-switch-row full"><span><strong>Notifikasi edit dari email GBP lain</strong><small>Masukkan usulan perubahan ke Persetujuan Edit dan beri notifikasi.</small></span><span className="bs-switch"><input type="checkbox" name="webhook" defaultChecked={a.webhook} /><span /></span></label>
        </div>
        <p className="bs-form-error" id="bsGoogleError" role="alert">{Object.keys(errs).length ? 'Periksa kembali isian yang ditandai.' : ''}</p>
        <div className="bs-form-actions"><Btn label="Uji koneksi" icon="zap" onClick={() => { void apiTest(); }} /><button type="submit" className="bs-btn primary"><Ic name="check" /><span>Simpan konfigurasi</span></button></div>
      </fieldset></form>
    </Card>
    <Card title={`Akun Google Business Profile (${fmtNum(accounts.length)})`} flush={!!accounts.length}>
      {accounts.length ? <Table heads={['Akun', 'Account ID', 'Lokasi', 'Ulasan', ActionsHead]} rows={accounts.map(ac => {
        const locs = ws.locations.filter(l => acctOf(l) === ac.id), codes = new Set(locs.map(l => l.code));
        const rvs = ws.reviews.filter(rv => codes.has(rv.code)), un = rvs.filter(rv => !rv.reply).length;
        return { key: ac.id, cells: [
          <><strong>{ac.name}</strong><small>{ac.email || ''}</small></>, <code>{ac.accountId || ac.id}</code>, fmtNum(locs.length),
          <>{fmtNum(rvs.length)}{!!un && <small><Badge s="Menunggu" label={`${un} belum dibalas`} /></small>}</>,
          { c: <Btn label="Lihat ulasan" icon="star" variant="sm" onClick={() => { setUi(ui => { ui.reviews.account = ac.id; ui.reviews.location = ''; ui.reviews.limit = 20; }); navigate('reviews'); }} />, cls: 'bs-td-actions' }
        ] };
      })} /> : <EmptyState title="Belum ada akun" text="Hubungkan akun Google untuk menampilkan akun dan lokasinya." icon="info" />}
    </Card>
  </SettingsPage>;
}

/* ---------- Pengaturan ---------- */
export function SettingsView() {
  const ws = useWs();
  const me = useApp(s => s.me);
  const canWrite = useCan('settings.write');
  const [url, setUrl] = useState(api.getBaseUrl());
  const [health, setHealth] = useState<{ tone: string; text: string }>({ tone: '', text: '' });
  const s = ws.settings;
  const checkHealth = async () => {
    let u: string;
    try { u = api.normalizeUrl(url); } catch (e) { setHealth({ tone: 'bad', text: (e as Error).message }); return; }
    if (!u) { setHealth({ tone: 'bad', text: 'Isi URL server terlebih dahulu.' }); return; }
    setHealth({ tone: '', text: 'Menguji…' });
    const t0 = performance.now();
    try { const res = await api.request<{ version?: string }>('GET', '/health', undefined, { auth: false, baseUrl: u, timeout: 8000 }); setHealth({ tone: 'good', text: `Terhubung · ${Math.round(performance.now() - t0)} ms${res?.version ? ` · versi ${res.version}` : ''}` }); }
    catch (e) { setHealth({ tone: 'bad', text: (e as Error).message }); }
  };
  const saveUrl = () => {
    const before = api.getBaseUrl();
    let u: string;
    try { u = api.setBaseUrl(url); } catch (e) { toast((e as Error).message, { tone: 'bad' }); return; }
    setUrl(u);
    if (u !== before) { sessionExpired('URL server diubah. Silakan masuk ke server yang baru.'); return; }
    toast('URL server disimpan.', { tone: 'good' });
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!guard('settings.write')) return;
    const p = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>, errs: string[] = [];
    const num = (k: string, min: number, max: number, label: string) => { const v = Number(p[k]); if (!Number.isFinite(v) || v < min || v > max) errs.push(`${label} harus ${min}–${max}.`); return v; };
    const next = { workspace: String(p.workspace || '').trim(), timezone: p.timezone, slaInternal: num('slaInternal', 1, 720, 'SLA internal'), slaGoogle: num('slaGoogle', 1, 2000, 'Acuan Google'), dupRadius: num('dupRadius', 10, 2000, 'Radius duplikat'), coordTol: num('coordTol', 5, 2000, 'Toleransi koordinat') };
    if (!next.workspace) errs.push('Nama workspace wajib diisi.');
    if (errs.length) { toast(errs.join(' '), { tone: 'bad' }); return; }
    const changes = diff(s, next, Object.keys(next) as (keyof typeof next)[]);
    if (!changes.length) { toast('Tidak ada perubahan.', { tone: 'good' }); return; }
    const ok = await remote('PATCH', '/settings', next);
    if (ok) toast(`Pengaturan disimpan (${changes.length} perubahan).`, { tone: 'good' });
  };
  const f = (name: string, label: string, value: string | number, hint = '', extra: Record<string, unknown> = {}) => (
    <label className="bs-field"><span>{label}</span><input name={name} type={typeof value === 'number' ? 'number' : 'text'} defaultValue={String(value)} required {...extra} />{hint && <small>{hint}</small>}</label>
  );
  const backup = () => {
    const blob = JSON.stringify(getApp().ws, null, 2);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([blob], { type: 'application/json' })); a.download = `branchsync-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove();
    toast('Cadangan diunduh.', { tone: 'good' });
  };
  return <SettingsPage>
    <Card title="Koneksi server">
      <div className="bs-mode-row"><span className="bs-mode-badge" data-state="online"><Ic name="plug" /></span><div><strong>Live</strong><small>{`Masuk sebagai ${me.name} · ${api.host()}`}</small></div></div>
      <div className="bs-form-grid bs-gap"><label className="bs-field full"><span>URL server API</span><input id="bsApiUrl" type="url" inputMode="url" autoComplete="off" spellCheck={false} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.branchsync.co.id/v1" /><small>Server BranchSync (Go + PostgreSQL). Daftar endpoint ada di API.md.</small></label></div>
      <div className="bs-btn-row"><Btn label="Uji koneksi" icon="zap" onClick={() => { void checkHealth(); }} /><Btn label="Simpan URL" icon="check" onClick={saveUrl} /><span id="bsHealth" className="bs-health-msg" role="status" aria-live="polite" data-tone={health.tone || undefined}>{health.text}</span></div>
    </Card>
    {!canWrite && <Callout tone="warn">Anda hanya dapat melihat pengaturan workspace. Hubungi Administrator untuk mengubahnya.</Callout>}
    <form id="bsSettingsForm" className="bs-stack" noValidate onSubmit={e => { void submit(e); }} key={JSON.stringify(s)}><fieldset className="bs-fieldset-plain" disabled={!canWrite}>
      <Card title="Workspace"><div className="bs-form-grid">{f('workspace', 'Nama workspace', s.workspace, '', { maxLength: 80 })}<label className="bs-field"><span>Zona waktu</span><select name="timezone" defaultValue={s.timezone}><Options xs={[['Asia/Jakarta', 'WIB — Asia/Jakarta'], ['Asia/Makassar', 'WITA — Asia/Makassar'], ['Asia/Jayapura', 'WIT — Asia/Jayapura']]} /></select></label></div></Card>
      <Card title="Target SLA"><div className="bs-form-grid">{f('slaInternal', 'Proses internal (jam)', s.slaInternal, 'Waktu tim BRI memproses permintaan.', { min: 1, max: 720 })}{f('slaGoogle', 'Acuan verifikasi Google (jam)', s.slaGoogle, 'Dipantau terpisah, di luar kendali BRI.', { min: 1, max: 2000 })}</div></Card>
      <Card title="Aturan deteksi"><div className="bs-form-grid">{f('dupRadius', 'Radius duplikat (meter)', s.dupRadius, 'Unit bertipe sama dalam radius ini dianggap kemungkinan duplikat.', { min: 10, max: 2000 })}{f('coordTol', 'Toleransi selisih koordinat (meter)', s.coordTol, 'Selisih titik di atas nilai ini dianggap tidak sesuai.', { min: 5, max: 2000 })}</div></Card>
      <div className="bs-form-actions"><button type="submit" className="bs-btn primary"><Ic name="check" /><span>Simpan pengaturan</span></button></div>
    </fieldset></form>
    <Card title="Data"><div className="bs-danger-list">
      <div><span><strong>Penyimpanan data</strong><small>Semua data workspace tersimpan di server BranchSync (database PostgreSQL), bukan di browser.</small></span><span className="bs-badge" data-tone="good"><i />PostgreSQL</span></div>
      <div><span><strong>Cadangkan data</strong><small>Unduh seluruh data workspace yang sedang dimuat sebagai JSON.</small></span><Btn label="Unduh JSON" icon="download" onClick={backup} /></div>
    </div></Card>
  </SettingsPage>;
}

export { MIN };
