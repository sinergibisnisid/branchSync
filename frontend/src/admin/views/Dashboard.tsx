// Halaman Dashboard: KPI, pekerjaan yang perlu ditindaklanjuti, status operasional, grafik sync, aktivitas, region.
import { claimActive, dailySync, duplicatePairs, issueMap, locName, openFailures, slaStats } from '../../lib/data';
import { REGIONS, STATUSES, TYPES, type ViewId } from '../../lib/domain';
import { fmtDate, fmtNum, initials, LOC, pct, sum } from '../../lib/format';
import type { AuditEntry } from '../../lib/types';
import { setUi, useApp } from '../../store';
import { importModal } from '../forms/ImportWizard';
import { Badge, Btn, Card, EmptyState, Go, Metric, PageHead, Table, When } from '../ui/components';
import { Ic } from '../ui/Icon';
import { FILTERS, type FilterKey } from './locationsModel';
import { navigate, openDrawer, runSync, useWs } from '../workspace';

/** Buka Unit Kerja dengan satu filter (dari kartu status/region). */
export function gotoFilter(k: FilterKey, v: string) {
  setUi(ui => { FILTERS.forEach(([f]) => { ui.loc[f] = []; }); ui.loc.q = ''; ui.loc.quick = 'all'; ui.loc[k] = [v]; ui.loc.page = 1; });
  navigate('locations');
}
export function openTarget(id: string, has: boolean) {
  if (has) openDrawer(id);
  else if (id.startsWith('KL-')) navigate('claims');
  else if (id.startsWith('JOB-')) { setUi(ui => { ui.sync.tab = 'runs'; }); navigate('sync'); }
}

export function SyncChart({ daily }: { daily: { start: number; ok: number; fail: number }[] }) {
  const max = Math.max(1, ...daily.map(d => d.ok + d.fail));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const dayLabel = (t: number) => new Intl.DateTimeFormat(LOC(), { weekday: 'short' }).format(new Date(t));
  const fullLabel = (t: number) => new Intl.DateTimeFormat(LOC(), { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(t));
  return <>
    <div className="bs-legend"><span><i className="good" />Berhasil</span><span><i className="bad" />Gagal</span></div>
    <div className="bs-chart"><div className="bs-axis">{[top, top / 2, 0].map(t => <span key={t}>{fmtNum(t)}</span>)}</div><div className="bs-plot">
      {daily.map(d => {
        const tot = d.ok + d.fail;
        return (
          <div key={d.start} className="bs-col" tabIndex={0} aria-label={`${fullLabel(d.start)}: ${d.ok} berhasil, ${d.fail} gagal`}>
            <div className="bs-col-stack" style={{ height: `${(tot / top) * 100}%` }}>{!!d.fail && <span className="bs-seg-bad" style={{ flex: d.fail }} />}{!!d.ok && <span className="bs-seg-good" style={{ flex: d.ok }} />}</div>
            <div className="bs-tip" role="tooltip"><strong>{fullLabel(d.start)}</strong><span><i className="good" />Berhasil <b>{fmtNum(d.ok)}</b></span><span><i className="bad" />Gagal <b>{fmtNum(d.fail)}</b></span></div>
            <small>{dayLabel(d.start)}</small>
          </div>
        );
      })}
    </div></div>
    <details className="bs-table-toggle"><summary>Lihat sebagai tabel</summary><Table heads={['Hari', 'Berhasil', 'Gagal']} rows={daily.map(d => ({ key: d.start, cells: [fullLabel(d.start), fmtNum(d.ok), fmtNum(d.fail)] }))} /></details>
  </>;
}

function Timeline({ entries }: { entries: AuditEntry[] }) {
  const ws = useWs();
  if (!entries.length) return <EmptyState title="Belum ada aktivitas" text="Aktivitas akan muncul di sini." icon="history" />;
  return (
    <ol className="bs-timeline">{entries.map(a => (
      <li key={a.id}><span className="bs-avatar sm" data-actor={a.actor} aria-hidden="true">{a.actor === 'Eksternal' ? '@' : initials(a.user)}</span>
        <div><p><strong>{a.user}</strong> {a.action.toLowerCase()}{a.target && <> <button type="button" className="bs-inline-link" onClick={() => openTarget(a.target, ws.locations.some(l => l.code === a.target))}>{locName(ws, a.target)}</button></>}</p>
          <small>{a.module} · <When t={a.time} />{a.actor === 'Eksternal' && <> · <Badge s="Eksternal" /></>}</small></div></li>
    ))}</ol>
  );
}

export function Dashboard() {
  const ws = useWs();
  const me = useApp(s => s.me);
  const running = useApp(s => s.running);
  const L = ws.locations, im = issueMap(ws), dups = duplicatePairs(ws).pairs;
  const verified = L.filter(l => l.gbp === 'Terverifikasi').length;
  const pend = ws.approvals.filter(a => a.status === 'Menunggu').length;
  const fails = openFailures(ws).length, claimsN = ws.claims.filter(claimActive).length;
  const sla = slaStats(ws), daily = dailySync(ws, 7);
  const okSum = sum(daily.map(d => d.ok)), failSum = sum(daily.map(d => d.fail)), rate = pct(okSum, okSum + failSum);
  const queue = ([
    { n: pend, icon: 'inbox', tone: 'warn', title: 'Edit dari email GBP lain', text: 'Data tetap aman sampai Anda menyetujui.', view: 'approvals', cta: 'Tinjau' },
    { n: fails, icon: 'refresh', tone: 'bad', title: 'Gagal disinkronkan', text: 'Coba ulang atau catat tindak lanjut.', view: 'sync', cta: 'Tangani' },
    { n: im.size, icon: 'alert', tone: 'warn', title: 'Berbeda dengan Google Maps', text: 'Pilih sumber data yang benar.', view: 'discrepancies', cta: 'Bandingkan' },
    { n: dups.length, icon: 'copy', tone: 'info', title: 'Kemungkinan titik ganda', text: 'Gabungkan atau tandai bukan duplikat.', view: 'duplicates', cta: 'Periksa' },
    { n: claimsN, icon: 'shield', tone: 'info', title: 'Klaim & titik baru berjalan', text: `${sla.atRisk} mendekati atau lewat SLA.`, view: 'claims', cta: 'Pantau' },
    { n: ws.reviews.filter(rv => !rv.reply).length, icon: 'chat', tone: 'info', title: 'Ulasan Google belum dibalas', text: `${ws.reviews.filter(rv => !rv.reply && rv.rating <= 2).length} di antaranya ulasan negatif (1–2★).`, view: 'reviews', cta: 'Balas' }
  ] as { n: number; icon: string; tone: string; title: string; text: string; view: ViewId; cta: string }[]).filter(q => q.n);
  const statusRows = STATUSES.map(s => [s, L.filter(l => l.status === s).length] as const);
  const onlinePct = pct(statusRows[0][1], L.length);
  const regionRows = REGIONS.map(r => { const xs = L.filter(l => l.region === r); return { r, n: xs.length, on: xs.filter(l => l.status === 'Online').length, iss: xs.filter(l => im.has(l.code)).length }; }).filter(x => x.n).sort((a, b) => b.n - a.n);

  return <>
    <PageHead title={`Selamat datang, ${me.name.split(' ')[0]}`} desc={`${fmtDate(Date.now(), { dateStyle: 'full' })} · Ringkasan ${fmtNum(L.length)} unit kerja di ${regionRows.length} region.`}
      actions={<><Btn label="Impor data" icon="upload" perm="locations.import" onClick={() => importModal()} /><Btn label={running ? 'Menyinkronkan…' : 'Sinkronkan semua'} icon="refresh" variant="primary" perm="sync.run" disabled={!!running} onClick={() => runSync(null)} /></>} />
    <div className="bs-metrics">
      <Metric label="Total unit kerja" value={fmtNum(L.length)} note={TYPES.map(t => `${fmtNum(L.filter(l => l.type === t).length)} ${t === 'Kantor Cabang' ? 'KC' : t}`).join(' · ')} icon="building" view="locations" />
      <Metric label="Terverifikasi di Google" value={pct(verified, L.length) + '%'} note={`${fmtNum(verified)} dari ${fmtNum(L.length)} listing`} icon="shield" view="claims" />
      <Metric label="Sync berhasil · 7 hari" value={rate + '%'} note={`${fmtNum(okSum + failSum)} pembaruan`} spark={daily.map(d => pct(d.ok, d.ok + d.fail))} tone={rate < 95 ? 'warn' : 'good'} view="sync" />
      <Metric label="Kepatuhan SLA internal" value={sla.compliance + '%'} note={`Target ≤ ${ws.settings.slaInternal} jam`} icon="gauge" tone={sla.compliance < 80 ? 'warn' : ''} view="sla" />
    </div>
    <div className="bs-grid bs-grid-main">
      <Card title="Perlu tindakan" sub="Diurutkan dari yang paling mendesak">
        {queue.length
          ? <ul className="bs-queue">{queue.map(q => <li key={q.view} data-tone={q.tone}><span className="bs-queue-ic"><Ic name={q.icon} /></span><div><strong>{`${fmtNum(q.n)} ${q.title}`}</strong><p>{q.text}</p></div><Go label={q.cta} view={q.view} variant="sm" /></li>)}</ul>
          : <EmptyState title="Semua beres" text="Tidak ada pekerjaan yang menunggu tindakan." />}
      </Card>
      <Card title="Status operasional" sub="Klik status untuk melihat unitnya">
        <div className="bs-health"><div><strong>{onlinePct}%</strong><span>unit online</span></div>
          <div className="bs-health-bar" role="img" aria-label={statusRows.map(([s, n]) => `${s} ${n}`).join(', ')}>{statusRows.map(([s, n]) => (n ? <span key={s} data-status={s} style={{ flex: n }} /> : null))}</div></div>
        <div className="bs-status-list">{statusRows.map(([s, n]) => (
          <button key={s} type="button" className="bs-status-row" onClick={() => gotoFilter('status', s)}><i data-status={s} aria-hidden="true" /><span>{s}</span><strong>{fmtNum(n)}</strong><small>{pct(n, L.length)}%</small><Ic name="chev" /></button>
        ))}</div>
      </Card>
    </div>
    <div className="bs-grid bs-grid-main">
      <Card title="Pembaruan ke Google · 7 hari terakhir" actions={<Go label="Sync Monitor" view="sync" />}><SyncChart daily={daily} /></Card>
      <Card title="Aktivitas terbaru" actions={<Go label="Semua riwayat" view="audit" />}><Timeline entries={ws.audit.slice(0, 5)} /></Card>
    </div>
    <Card title="Sebaran per region" sub="Klik region untuk melihat daftar unitnya" actions={<Go label="Buka peta" view="map" />}>
      <div className="bs-region-tiles">{regionRows.map(x => (
        <button key={x.r} type="button" className="bs-region-tile" onClick={() => gotoFilter('region', x.r)}>
          <span className="bs-region-name">{x.r}</span><strong>{fmtNum(x.n)}</strong>
          <span className="bs-bar-track" role="img" aria-label={`${x.on} dari ${x.n} online`}><span style={{ width: `${pct(x.on, x.n)}%` }} /></span>
          <small>{`${pct(x.on, x.n)}% online${x.iss ? ' · ' : ''}`}{!!x.iss && <b>{`${x.iss} beda data`}</b>}</small>
        </button>
      ))}</div>
    </Card>
  </>;
}
