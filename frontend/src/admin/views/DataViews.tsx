// Halaman kualitas data: Ketidaksesuaian, Duplikat, Klaim & Titik Baru, Persetujuan Edit.
import { byCode, claimActive, claimName, claimTimes, DUP_PER_UNIT, duplicatePairs, issueMap, locName } from '../../lib/data';
import { DISC_FIELDS, FIELD_LABEL, navItem, STEPS } from '../../lib/domain';
import { downloadCSV } from '../../lib/files';
import { fmtDate, fmtDist, fmtDur, fmtNum, fmtRel, sum } from '../../lib/format';
import type { Claim, Location } from '../../lib/types';
import { setUi, toast, useApp } from '../../store';
import { advanceClaim, decide, discNote, dupIgnore, dupKeep, dupReport, rejectClaim, resolveDisc, resolveDiscBulk } from '../actions';
import { claimForm, pointForm } from '../forms/ClaimForms';
import { ActionsHead, Badge, Btn, Callout, Card, ChipRow, DiffList, EmptyState, KV, Metric, PageHead, SearchF, SelectF, Table, TabPanel, Tabs, When } from '../ui/components';
import { Ic } from '../ui/Icon';
import { loadLive, navigate, openDrawer, useWs } from '../workspace';

/* ---------- Ketidaksesuaian ---------- */
export function discRows(ws: ReturnType<typeof useWs>, q0: string, field: string) {
  const q = q0.trim().toLowerCase(), out: { l: Location; field: string; dash: string; google: string; dist?: number }[] = [];
  issueMap(ws).forEach((iss, code) => {
    const l = byCode(ws).get(code)!;
    if (q && !`${l.name} ${l.code} ${l.city}`.toLowerCase().includes(q)) return;
    iss.forEach(i => { if (!field || i.field === field) out.push({ l, ...i }); });
  });
  return out;
}
export function Discrepancies() {
  const ws = useWs();
  const d = useApp(s => s.ui.disc);
  const rows = discRows(ws, d.q, d.field), im = issueMap(ws), total = sum([...im.values()].map(x => x.length));
  const byField = DISC_FIELDS.map(f => [f, sum([...im.values()].map(x => x.filter(i => i.field === f).length))] as const);
  const setD = (fn: (x: typeof d) => void) => setUi(ui => { fn(ui.disc); });
  const exportCsv = () => { downloadCSV('laporan-ketidaksesuaian.csv', [['Kode', 'Unit', 'Kota', 'Kolom', 'Dashboard', 'Google Maps', 'Selisih (m)', 'Catatan'], ...rows.map(r => [r.l.code, r.l.name, r.l.city, FIELD_LABEL[r.field], r.dash, r.google, r.dist ? Math.round(r.dist) : '', ws.discNotes[`${r.l.code}|${r.field}`]?.text || ''])]); toast(`Laporan ${rows.length} perbedaan diunduh.`, { tone: 'good' }); };
  const chips = [
    d.q.trim() && { key: 'q', label: 'Kata kunci', value: d.q.trim(), onRemove: () => setD(x => { x.q = ''; }) },
    d.field && { key: 'field', label: 'Kolom', value: FIELD_LABEL[d.field] || d.field, onRemove: () => setD(x => { x.field = ''; }) }
  ].filter(Boolean) as { key: string; label: string; value: string; onRemove: () => void }[];
  return <>
    <PageHead title="Ketidaksesuaian Data" desc={navItem('discrepancies').desc} actions={<>
      <Btn label="Muat ulang" icon="refresh" onClick={() => { void loadLive({ silent: true }).then(ok => ok && toast('Data diperbarui dari server.', { tone: 'good' })); }} />
      <Btn label="Unduh laporan" icon="download" onClick={exportCsv} />
      <Btn label="Pakai Dashboard untuk semua" icon="upload" variant="primary" perm="locations.write" disabled={!rows.length} onClick={() => resolveDiscBulk(rows.map(r => ({ code: r.l.code, field: r.field })))} />
    </>} />
    <div className="bs-metrics bs-metrics-5">{byField.map(([f, n]) => <Metric key={f} label={FIELD_LABEL[f]} value={fmtNum(n)} note={n ? 'perbedaan' : 'sesuai'} tone={n ? 'warn' : 'good'} />)}</div>
    <Card title={`${fmtNum(total)} perbedaan pada ${fmtNum(im.size)} unit`} sub="“Pakai Dashboard” mengirim data BRI ke Google. “Pakai Google” memperbarui Dashboard. Setiap keputusan tercatat di Riwayat.">
      <div className="bs-toolbar">
        <SearchF label="Cari unit" value={d.q} ph="Nama, kode, atau kota…" id="bsDiscQ" onChange={v => setD(x => { x.q = v; })} />
        <SelectF label="Kolom" xs={DISC_FIELDS.map(f => [f, FIELD_LABEL[f]] as [string, string])} value={d.field} onChange={v => setD(x => { x.field = v; })} />
      </div>
      <ChipRow chips={chips} onReset={() => setD(x => { x.q = ''; x.field = ''; })} />
      {rows.length ? <Table heads={['Unit kerja', 'Kolom', 'Di Dashboard', 'Di Google Maps', 'Catatan', ActionsHead]} rows={rows.map(r => {
        const note = ws.discNotes[`${r.l.code}|${r.field}`];
        return {
          key: `${r.l.code}|${r.field}`, cells: [
            <button type="button" className="bs-cell-link" onClick={() => openDrawer(r.l.code, 'compare')}><strong>{r.l.name}</strong><small>{r.l.code} · {r.l.city}</small></button>,
            <>{FIELD_LABEL[r.field]}{r.dist ? <small>{`selisih ${fmtDist(r.dist)}`}</small> : null}</>,
            { c: <span className="bs-val dash">{r.dash}</span>, cls: 'bs-td-wrap' },
            { c: <span className="bs-val google">{r.google}</span>, cls: 'bs-td-wrap' },
            { c: note ? <span className="bs-note" title={`${note.by} · ${fmtDate(note.time)}`}><Ic name="note" />{note.text}</span> : <span className="bs-muted">—</span>, cls: 'bs-td-wrap' },
            { c: <><Btn label="Pakai Dashboard" variant="sm" title="Kirim data Dashboard ke Google" perm="locations.write" onClick={() => resolveDisc(r.l.code, r.field, true)} /><Btn label="Pakai Google" variant="sm ghost" title="Salin data Google ke Dashboard" perm="locations.write" onClick={() => resolveDisc(r.l.code, r.field, false)} /><Btn icon="note" variant="sm icon ghost" title="Catat temuan" perm="locations.write" onClick={() => discNote(r.l.code, r.field)} /></>, cls: 'bs-td-actions' }
          ]
        };
      })} /> : <EmptyState title="Data sudah sesuai" text="Tidak ada perbedaan antara Dashboard dan Google Maps untuk filter ini." />}
    </Card>
  </>;
}

/* ---------- Duplikat ---------- */
export function Duplicates() {
  const ws = useWs();
  const limit = useApp(s => s.ui.dups.limit);
  const { pairs, dense } = duplicatePairs(ws);
  const shown = pairs.slice(0, limit);
  const side = (l: Location, key: string, s: 'a' | 'b') => (
    <div className="bs-dup-side">
      <button type="button" className="bs-cell-link" onClick={() => openDrawer(l.code)}><strong>{l.name}</strong><small>{l.code} · {l.type}</small></button>
      <KV pairs={[['Alamat', l.address], ['Telepon', l.phone], ['Status', <Badge s={l.status} />], ['GBP', <Badge s={l.gbp} />], ['Diperbarui', <When t={l.updatedAt} />]]} />
      <Btn label="Pertahankan ini" icon="merge" variant="sm" perm="locations.write" onClick={() => dupKeep(key, s)} />
    </div>
  );
  return <>
    <PageHead title="Duplikat Titik Lokasi" desc={navItem('duplicates').desc} actions={<Btn label="Atur radius deteksi" icon="sliders" onClick={() => navigate('settings')} />} />
    <Callout>Deteksi otomatis memakai <b>kemiripan nama</b> (dalam 2 km) dan <b>{`tipe sama dalam radius ${ws.settings.dupRadius} m`}</b>. “Pertahankan ini” akan menonaktifkan unit lainnya dan menandainya <i>Duplikat</i>.</Callout>
    {dense && <Callout tone="warn" icon="alert">Ada area dengan titik yang sangat berdekatan (kemungkinan salah impor koordinat). Untuk tiap unit di area itu hanya {DUP_PER_UNIT} pasangan terdekat yang ditampilkan.</Callout>}
    {pairs.length ? <>
      <p className="bs-muted bs-gap">{`Menampilkan ${fmtNum(shown.length)} dari ${fmtNum(pairs.length)} pasangan, urut dari yang paling mirip.`}</p>
      <div className="bs-stack">{shown.map(p => (
        <article key={p.key} className="bs-dup">
          <header><span className="bs-score" data-high={p.score >= 90}>{p.score}% mirip</span><span>{p.reason} · jarak {fmtDist(p.d)}</span><span className="bs-spacer" />
            <Btn label="Bukan duplikat" variant="sm ghost" perm="locations.write" onClick={() => { void dupIgnore(p.key); }} />
            <Btn label="Laporkan ke Google" variant="sm ghost" perm="claims.manage" onClick={() => dupReport(p.key)} /></header>
          <div className="bs-dup-grid">{side(p.a, p.key, 'a')}<div className="bs-dup-vs" aria-hidden="true">vs</div>{side(p.b, p.key, 'b')}</div>
        </article>
      ))}</div>
      {pairs.length > shown.length && <div className="bs-more"><Btn label={`Tampilkan ${fmtNum(Math.min(30, pairs.length - shown.length))} lagi`} variant="sm" onClick={() => setUi(ui => { ui.dups.limit += 30; })} /></div>}
    </> : <Card title="Tidak ada duplikat"><EmptyState title="Tidak ada titik ganda" text="Semua unit kerja memiliki titik yang unik." /></Card>}
  </>;
}

/* ---------- Klaim & Titik Baru ---------- */
function Stepper({ c }: { c: Claim }) {
  const idx = c.status === 'Ditolak' ? -1 : STEPS.indexOf(c.status);
  return <div className="bs-steps" aria-label={`Tahap: ${c.status}`}>{STEPS.map((s, i) => <span key={s} className={c.status === 'Ditolak' ? 'is-rejected' : i < idx || c.status === 'Selesai' ? 'is-done' : i === idx ? 'is-current' : ''} title={s} />)}<small>{c.status}</small></div>;
}
export function Claims() {
  const ws = useWs();
  const t = useApp(s => s.ui.claims.tab);
  const all = ws.claims;
  const filt = ({ active: claimActive, done: (c: Claim) => c.status === 'Selesai', rejected: (c: Claim) => c.status === 'Ditolak', all: () => true } as Record<string, (c: Claim) => boolean>)[t] || claimActive;
  const count = (fn: (c: Claim) => boolean) => all.filter(fn).length;
  const rows = all.filter(filt).sort((a, b) => b.submittedAt - a.submittedAt).map(c => {
    const tm = claimTimes(ws, c), next = STEPS[STEPS.indexOf(c.status) + 1];
    return {
      key: c.id, cells: [
        <><strong>{c.id}</strong><small>{c.kind}</small></>,
        c.code ? <button type="button" className="bs-cell-link" onClick={() => openDrawer(c.code!)}><strong>{claimName(ws, c)}</strong><small>{c.code}</small></button> : <><strong>{c.proposal?.name}</strong><small>Usulan · {c.proposal?.city}</small></>,
        <><Stepper c={c} />{c.note && <small className="bs-note-line">{c.note}</small>}</>,
        <>{fmtDur(tm.internal)}{tm.internalRunning && <> <small>berjalan</small></>}<small><Badge s={tm.sla} /></small></>,
        tm.google == null ? <span className="bs-muted">—</span> : <>{fmtDur(tm.google)}{tm.googleRunning && <> <small>menunggu Google</small></>}</>,
        <span title={fmtDate(c.submittedAt)}>{fmtRel(c.submittedAt)}</span>,
        { c: claimActive(c) ? <><Btn label={next === 'Selesai' ? 'Tandai selesai' : 'Lanjutkan'} icon="arrowR" variant="sm" title={`Pindahkan ke tahap “${next}”`} perm="claims.manage" onClick={() => { void advanceClaim(c.id, next); }} /><Btn label="Tolak" variant="sm ghost" perm="claims.manage" onClick={() => rejectClaim(c.id)} /></> : null, cls: 'bs-td-actions' }
      ]
    };
  });
  const setTab = (v: string) => setUi(ui => { ui.claims.tab = v; });
  return <>
    <PageHead title="Klaim & Titik Baru" desc={navItem('claims').desc} actions={<><Btn label="Ajukan klaim" icon="shield" perm="claims.manage" onClick={() => claimForm()} /><Btn label="Usulkan titik baru" icon="pin" variant="primary" perm="claims.manage" onClick={() => pointForm()} /></>} />
    <div className="bs-explain">{([
      ['Get Verified', 'shield', 'Klaim kepemilikan listing yang belum terverifikasi, lalu verifikasi oleh Google.'],
      ['Suspend', 'alert', 'Ajukan banding beserta dokumen agar listing yang di-suspend dipulihkan.'],
      ['Duplicate', 'copy', 'Laporkan listing ganda ke Google agar digabung atau dihapus.'],
      ['Titik baru', 'pin', 'Usulkan lokasi baru. Sistem memeriksa duplikat sebelum diajukan.']
    ] as const).map(([t2, i, d]) => <div key={t2}><Ic name={i} /><strong>{t2}</strong><p>{d}</p></div>)}</div>
    <Card title="Daftar permintaan" sub={`Target proses internal ≤ ${ws.settings.slaInternal} jam. Waktu verifikasi Google dihitung terpisah.`}>
      <Tabs bind="claims.tab" cur={t} onChange={setTab} items={[['active', 'Berjalan', count(claimActive)], ['done', 'Selesai', count(c => c.status === 'Selesai')], ['rejected', 'Ditolak', count(c => c.status === 'Ditolak')], ['all', 'Semua', all.length]]} />
      <TabPanel bind="claims.tab" cur={t}><Table heads={['ID / jenis', 'Unit kerja', 'Tahap', 'Proses internal', 'Verifikasi Google', 'Diajukan', ActionsHead]} rows={rows} empty="Tidak ada permintaan di tab ini." /></TabPanel>
    </Card>
  </>;
}

/* ---------- Persetujuan Edit ---------- */
export function Approvals() {
  const ws = useWs();
  const t = useApp(s => s.ui.approvals.tab);
  const pending = ws.approvals.filter(a => a.status === 'Menunggu'), done = ws.approvals.filter(a => a.status !== 'Menunggu').sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0));
  const setTab = (v: string) => setUi(ui => { ui.approvals.tab = v; });
  return <>
    <PageHead title="Persetujuan Edit" desc={navItem('approvals').desc} actions={<Btn label="Muat ulang" icon="refresh" onClick={() => { void loadLive({ silent: true }).then(ok => ok && toast('Data diperbarui dari server.', { tone: 'good' })); }} />} />
    <Callout tone="good" icon="shield">Perubahan dari email GBP lain <b>tidak diterapkan</b> sampai BRI menyetujuinya. Jika ditolak, data unit kerja tetap seperti semula.</Callout>
    <Tabs bind="approvals.tab" label="Persetujuan Edit" cur={t} onChange={setTab} items={[['pending', 'Menunggu', pending.length], ['history', 'Riwayat keputusan', done.length]]} />
    <TabPanel bind="approvals.tab" cur={t}>
      {t === 'pending'
        ? (pending.length ? <div className="bs-approval-grid">{pending.map(a => (
          <article key={a.id} className="bs-approval">
            <header><span className="bs-avatar sm" data-actor="Eksternal" aria-hidden="true">@</span><div><strong>{a.by}</strong><small>Email GBP tidak dikenal · <When t={a.time} /> · {a.id}</small></div><Badge s="Menunggu" /></header>
            <p>Mengusulkan perubahan <b>{FIELD_LABEL[a.field]}</b> pada <button type="button" className="bs-inline-link" onClick={() => openDrawer(a.code)}>{locName(ws, a.code)}</button></p>
            <DiffList changes={[{ field: FIELD_LABEL[a.field], before: a.before, after: a.after }]} />
            <footer><Btn label="Tolak" icon="x" perm="approvals.decide" onClick={() => { void decide(a.id, false); }} /><Btn label="Setujui" icon="check" variant="primary" perm="approvals.decide" onClick={() => { void decide(a.id, true); }} /></footer>
          </article>
        ))}</div> : <Card title="Tidak ada permintaan"><EmptyState title="Kotak masuk kosong" text="Tidak ada edit eksternal yang menunggu persetujuan." icon="inbox" /></Card>)
        : <Card title="Riwayat keputusan"><Table heads={['ID', 'Unit / kolom', 'Perubahan', 'Diajukan oleh', 'Keputusan']} rows={done.map(a => ({ key: a.id, cells: [
          <><strong>{a.id}</strong><small>Diterima <When t={a.time} /></small></>,
          <>{locName(ws, a.code)}<small>{FIELD_LABEL[a.field]}</small></>,
          { c: <DiffList changes={[{ field: '', before: a.before, after: a.after }]} />, cls: 'bs-td-wrap' },
          a.by,
          <><Badge s={a.status} /><small>{a.decidedBy} · <When t={a.decidedAt} /></small></>
        ] }))} /></Card>}
    </TabPanel>
  </>;
}
