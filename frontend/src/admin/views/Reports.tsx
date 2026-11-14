// Halaman Laporan & Analitik: KPI per periode (dibanding periode sebelumnya), tren, kinerja region, peringkat, jadwal laporan.
import type { ReactNode } from 'react';
import { acctOf, claimTimes, issueMap, locName, reportBuckets, reportMetrics, type ReportScope } from '../../lib/data';
import { DAY, GBP, HOUR, navItem, REGIONS, SL, STATUSES, TONE, TYPES } from '../../lib/domain';
import { downloadCSV } from '../../lib/files';
import { fmtDate, fmtDur, fmtNum, fmtStamp, LOC, pct, sum } from '../../lib/format';
import type { Workspace } from '../../lib/types';
import { setUi, toast, useApp, type UiState } from '../../store';
import { deleteSchedule } from '../actions';
import { reportScheduleModal } from '../forms/AccessForms';
import { ActionsHead, Bar, Btn, Card, ChipRow, EmptyState, Go, PageHead, Rows, SelectF, Stars, Table, type Head } from '../ui/components';
import { Ic } from '../ui/Icon';
import { openDrawer, useWs } from '../workspace';

export const PERIODS: [string, string][] = [['7', '7 hari terakhir'], ['30', '30 hari terakhir'], ['90', '90 hari terakhir']];
export const FREQ: Record<string, string> = { weekly: 'Mingguan', monthly: 'Bulanan' };
export const WEEKDAYS: [string, string][] = [['1', 'Senin'], ['2', 'Selasa'], ['3', 'Rabu'], ['4', 'Kamis'], ['5', 'Jumat']];

export function reportScope(ws: Workspace, f: UiState['report']): ReportScope {
  const locs = ws.locations.filter(l => (!f.region || l.region === f.region) && (!f.account || acctOf(l) === f.account) && (!f.type || l.type === f.type));
  return { locs, codes: new Set(locs.map(l => l.code)), filtered: !!(f.region || f.account || f.type) };
}

function KpiTile({ label, cur, prev, fmt, delta, better = 'up', icon }: { label: string; cur: number | null; prev: number | null; fmt: (v: number) => string; delta: (v: number) => string; better?: 'up' | 'down'; icon: string }) {
  const d = cur != null && prev != null ? cur - prev : null;
  const tone = d == null || Math.abs(d) < 1e-9 ? 'flat' : (d > 0) === (better === 'up') ? 'good' : 'bad';
  const arrow = d == null ? '' : d > 0 ? '▲' : d < 0 ? '▼' : '■';
  return (
    <article className="bs-metric bs-kpi"><div className="bs-metric-head"><span>{label}</span><Ic name={icon} /></div>
      <div className="bs-metric-body"><div><strong>{cur == null ? '—' : fmt(cur)}</strong>
        <small>{d == null ? 'Belum ada data pembanding' : <><span className="bs-delta" data-tone={tone}>{arrow} {delta(Math.abs(d))}</span> vs periode sebelumnya</>}</small></div></div></article>
  );
}
interface Series { key: string; label: string; cls: string; dot: string }
interface ColRow { label: string; full: string; values: Record<string, number> }
function ColumnChart({ rows, series, labelEvery = 1 }: { rows: ColRow[]; series: Series[]; labelEvery?: number }) {
  const max = Math.max(1, ...rows.map(r => sum(series.map(sr => r.values[sr.key] || 0))));
  const step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
  return <>
    {series.length > 1 && <div className="bs-legend">{series.map(sr => <span key={sr.key}><i className={sr.dot} />{sr.label}</span>)}</div>}
    <div className="bs-chart"><div className="bs-axis">{[top, top / 2, 0].map(t => <span key={t}>{fmtNum(t)}</span>)}</div><div className="bs-plot bs-plot-dense">
      {rows.map((r, i) => {
        const tot = sum(series.map(sr => r.values[sr.key] || 0)), edge = i < 2 ? ' edge-l' : i > rows.length - 3 ? ' edge-r' : '';
        return (
          <div key={i} className={`bs-col${edge}`} tabIndex={0} aria-label={`${r.full}: ${series.map(sr => `${sr.label} ${fmtNum(r.values[sr.key] || 0)}`).join(', ')}`}>
            <div className="bs-col-stack" style={{ height: `${(tot / top) * 100}%` }}>{[...series].reverse().map(sr => (r.values[sr.key] ? <span key={sr.key} className={sr.cls} style={{ flex: r.values[sr.key] }} /> : null))}</div>
            <div className="bs-tip" role="tooltip"><strong>{r.full}</strong>{series.map(sr => <span key={sr.key}><i className={sr.dot} />{sr.label} <b>{fmtNum(r.values[sr.key] || 0)}</b></span>)}</div>
            <small>{i % labelEvery === 0 ? r.label : ''}</small>
          </div>
        );
      })}
    </div></div>
    <details className="bs-table-toggle"><summary>Lihat sebagai tabel</summary><Table heads={['Periode', ...series.map(sr => sr.label)]} rows={rows.map((r, i) => ({ key: i, cells: [r.full, ...series.map(sr => fmtNum(r.values[sr.key] || 0))] }))} /></details>
  </>;
}
function LineChart({ rows, min = 1, max = 5, fmt, labelEvery = 1, label }: { rows: { label: string; full: string; value: number | null; note?: string }[]; min?: number; max?: number; fmt: (v: number) => string; labelEvery?: number; label: string }) {
  const n = rows.length, pts = rows.map((r, i) => (r.value == null ? null : [((i + 0.5) / n) * 100, 100 - ((r.value - min) / (max - min)) * 100]));
  const segs: number[][][] = []; let cur: number[][] = [];
  pts.forEach(pt => { if (pt) cur.push(pt); else if (cur.length) { segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  const ticks: number[] = []; for (let v = max; v >= min; v--) ticks.push(v);
  return <>
    <div className="bs-chart bs-line"><div className="bs-axis">{ticks.map(t => <span key={t}>{t}</span>)}</div><div className="bs-plot bs-plot-dense">
      <svg className="bs-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{segs.map((sg, i) => <polyline key={i} points={sg.map(pt => pt.map(x => x.toFixed(2)).join(',')).join(' ')} />)}</svg>
      {rows.map((r, i) => (
        <div key={i} className={`bs-col${i < 2 ? ' edge-l' : i > n - 3 ? ' edge-r' : ''}`} tabIndex={0} aria-label={`${r.full}: ${r.value == null ? 'tidak ada data' : fmt(r.value)}`}>
          {r.value != null && <i className="bs-pt" style={{ bottom: `${((r.value - min) / (max - min)) * 100}%` }} />}
          <div className="bs-tip" role="tooltip"><strong>{r.full}</strong><span><i className="s1" />{label} <b>{r.value == null ? '—' : fmt(r.value)}</b></span>{r.note && <span>{r.note}</span>}</div>
          <small>{i % labelEvery === 0 ? r.label : ''}</small>
        </div>
      ))}
    </div></div>
    <details className="bs-table-toggle"><summary>Lihat sebagai tabel</summary><Table heads={['Periode', label]} rows={rows.map((r, i) => ({ key: i, cells: [r.full, r.value == null ? '—' : fmt(r.value)] }))} /></details>
  </>;
}
const pctTxt = (v: number) => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)}%`;
const ratingTxt = (v: number) => new Intl.NumberFormat(LOC(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
const pointTxt = (v: number) => `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(v)} poin`;
function Composition({ title, keys, counts }: { title: string; keys: readonly string[]; counts: Record<string, number> }) {
  const total = sum(keys.map(k => counts[k] || 0));
  return (
    <div className="bs-comp"><div className="bs-comp-head"><strong>{title}</strong><small>{fmtNum(total)} unit</small></div>
      <div className="bs-comp-bar" role="img" aria-label={`${title}: ${keys.map(k => `${SL(k)} ${counts[k] || 0}`).join(', ')}`}>{keys.map(k => (counts[k] ? <span key={k} data-tone={TONE[k] || 'neutral'} style={{ flex: counts[k] }} title={`${SL(k)}: ${counts[k]}`} /> : null))}</div>
      <ul className="bs-comp-legend">{keys.map(k => <li key={k}><i data-tone={TONE[k] || 'neutral'} /><span>{SL(k)}</span><b>{fmtNum(counts[k] || 0)}</b><small>{pct(counts[k] || 0, total)}%</small></li>)}</ul></div>
  );
}
interface RankRow { key: string; label: ReactNode; plain: string; n: number; value?: string; sub?: string }
function RankList({ rows, empty, fixedMax }: { rows: RankRow[]; empty: string; fixedMax?: number }) {
  if (!rows.length) return <p className="bs-muted">{empty}</p>;
  const max = fixedMax || Math.max(1, ...rows.map(r => r.n));
  return <ol className={`bs-rank${fixedMax ? ' is-rating' : ''}`}>{rows.map(r => <li key={r.key}><div className="bs-rank-top"><span className="bs-rank-label">{r.label}</span><b>{r.value ?? fmtNum(r.n)}</b></div><Bar n={r.n} max={max} label={`${r.plain}: ${r.n}`} />{r.sub && <small>{r.sub}</small>}</li>)}</ol>;
}

export function Reports() {
  const ws = useWs();
  const f = useApp(s => s.ui.report);
  const setR = (fn: (x: UiState['report']) => void) => setUi(ui => { fn(ui.report); });
  const sc = reportScope(ws, f), bk = reportBuckets(f.period), span = bk.to - bk.from;
  const cur = reportMetrics(ws, bk.from, bk.to, sc), prev = reportMetrics(ws, bk.from - span, bk.from, sc);
  const accounts = ws.accounts || [];
  const dLabel = (t: number) => new Intl.DateTimeFormat(LOC(), { day: 'numeric', month: 'short' }).format(new Date(t));
  const fullLabel = (b: { from: number; to: number }) => (bk.size === 1 ? new Intl.DateTimeFormat(LOC(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(b.from)) : `${dLabel(b.from)} – ${dLabel(b.to - DAY)}`);
  const labelEvery = bk.list.length > 14 ? 5 : 1;
  const syncRows = bk.list.map(b => { const m = reportMetrics(ws, b.from, b.to, sc); return { label: dLabel(b.from), full: fullLabel(b), values: { ok: m.ok, fail: m.fail } }; });
  const wk: { from: number; to: number }[] = []; for (let t = bk.to; t > bk.from; t -= 7 * DAY) wk.unshift({ from: Math.max(bk.from, t - 7 * DAY), to: t });
  const wkRows = wk.map(b => ({ b, xs: ws.reviews.filter(rv => rv.time >= b.from && rv.time < b.to && sc.codes.has(rv.code)) }));
  const wkFull = (b: { from: number; to: number }) => `${dLabel(b.from)} – ${dLabel(b.to - 1)}`;
  const volRows = wkRows.map(({ b, xs }) => ({ label: dLabel(b.from), full: wkFull(b), values: { n: xs.length } }));
  const ratRows = wkRows.map(({ b, xs }) => ({ label: dLabel(b.from), full: wkFull(b), value: xs.length ? sum(xs.map(x => x.rating)) / xs.length : null, note: `${xs.length} ulasan` }));
  const im = issueMap(ws);
  const regionHeads: Head[] = ['Region', 'Unit', 'Online', 'Terverifikasi GBP', 'Beda data', 'Rating (periode)', 'Ulasan dibalas'];
  const cell = (v: number | null, warnBelow: number) => (v == null ? <span className="bs-muted">—</span> : <><span className={`bs-cell-bar${v < warnBelow ? ' is-low' : ''}`}><span style={{ width: `${v}%` }} /></span><b>{v}%</b></>);
  const regionRows = REGIONS.flatMap(r => {
    const ls = sc.locs.filter(l => l.region === r); if (!ls.length) return [];
    const codes = new Set(ls.map(l => l.code)), rv = cur.rvs.filter(x => codes.has(x.code));
    const on = pct(ls.filter(l => l.status === 'Online').length, ls.length), ver = pct(ls.filter(l => l.gbp === 'Terverifikasi').length, ls.length);
    const iss = ls.filter(l => im.has(l.code)).length, avg = rv.length ? sum(rv.map(x => x.rating)) / rv.length : null, rep = rv.length ? pct(rv.filter(x => x.reply).length, rv.length) : null;
    return [{ key: r, cells: [
      { c: <button type="button" className="bs-inline-link" onClick={() => { setR(x => { x.region = x.region === r ? '' : r; }); document.getElementById('bsMain')?.scrollTo({ top: 0 }); }}>{r}</button>, th: true },
      fmtNum(ls.length), { c: cell(on, 80), cls: 'bs-td-bar' }, { c: cell(ver, 75), cls: 'bs-td-bar' },
      iss ? <span className="bs-issue sm"><Ic name="alert" />{iss}</span> : '0',
      avg == null ? '—' : <><Stars n={Math.round(avg)} /> {ratingTxt(avg)}</>, { c: cell(rep, 50), cls: 'bs-td-bar' }
    ] }];
  });
  const cnt = (key: 'status' | 'gbp') => sc.locs.reduce((m, l) => { m[l[key]] = (m[l[key]] || 0) + 1; return m; }, {} as Record<string, number>);
  const perLoc = new Map<string, { n: number; s: number; un: number }>();
  cur.rvs.forEach(rv => { const e = perLoc.get(rv.code) || { n: 0, s: 0, un: 0 }; e.n++; e.s += rv.rating; if (!rv.reply) e.un++; perLoc.set(rv.code, e); });
  const lowest: RankRow[] = [...perLoc.entries()].map(([code, e]) => ({ code, avg: e.s / e.n, ...e })).sort((a, b) => a.avg - b.avg || b.n - a.n).slice(0, 5)
    .map(x => ({ key: x.code, label: <button type="button" className="bs-inline-link" onClick={() => openDrawer(x.code, 'reviews')}>{locName(ws, x.code)}</button>, plain: locName(ws, x.code), n: x.avg, value: `${ratingTxt(x.avg)} ★`, sub: `${x.n} ulasan · ${x.un} belum dibalas` }));
  const reasons = new Map<string, number>();
  cur.runs.forEach(r => r.items.forEach(i => { if (i.status === 'Gagal' && sc.codes.has(i.code)) reasons.set(i.reason, (reasons.get(i.reason) || 0) + 1); }));
  const reasonRows: RankRow[] = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ key: k, label: k, plain: k, n }));
  const team = new Map<string, number>();
  cur.audit.filter(a => a.actor === 'Internal').forEach(a => team.set(a.user, (team.get(a.user) || 0) + 1));
  const teamRows: RankRow[] = [...team.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => ({ key: k, label: k, plain: k, n, value: `${fmtNum(n)} aksi` }));
  const acctName = (id: string) => accounts.find(a => a.id === id)?.name || id;
  const scopeTxt = [f.region, f.account && acctName(f.account), f.type].filter(Boolean).join(' · ') || 'Seluruh jaringan';
  const periodTxt = `${new Intl.DateTimeFormat(LOC(), { dateStyle: 'medium' }).format(new Date(bk.from))} – ${new Intl.DateTimeFormat(LOC(), { dateStyle: 'medium' }).format(new Date(bk.to - DAY))}`;
  const exportCsv = () => {
    const rows: unknown[][] = [['Laporan BranchSync'], ['Periode', fmtStamp(bk.from, true), fmtStamp(bk.to - DAY, true)], ['Cakupan', [f.region, f.account, f.type].filter(Boolean).join(' · ') || 'Seluruh jaringan'], [],
      ['KPI', 'Nilai'], ['Keberhasilan sync (%)', cur.rate == null ? '' : cur.rate.toFixed(1)], ['Pembaruan berhasil', cur.ok], ['Pembaruan gagal', cur.fail], ['Rata-rata rating', cur.avgRating == null ? '' : cur.avgRating.toFixed(2)], ['Jumlah ulasan', cur.rvs.length], ['Tingkat balasan (%)', cur.replyRate == null ? '' : cur.replyRate.toFixed(1)], ['Waktu balas rata-rata (jam)', cur.avgResp == null ? '' : (cur.avgResp / HOUR).toFixed(1)], ['Kepatuhan SLA internal (%)', cur.sla == null ? '' : cur.sla.toFixed(1)], ['Ketidaksesuaian diselesaikan', cur.resolved], [],
      ['Region', 'Unit', 'Online (%)', 'Terverifikasi (%)', 'Beda data', 'Rata-rata rating', 'Ulasan dibalas (%)']];
    REGIONS.forEach(r => { const ls = sc.locs.filter(l => l.region === r); if (!ls.length) return; const codes = new Set(ls.map(l => l.code)), rv = cur.rvs.filter(x => codes.has(x.code)); rows.push([r, ls.length, pct(ls.filter(l => l.status === 'Online').length, ls.length), pct(ls.filter(l => l.gbp === 'Terverifikasi').length, ls.length), ls.filter(l => im.has(l.code)).length, rv.length ? (sum(rv.map(x => x.rating)) / rv.length).toFixed(2) : '', rv.length ? pct(rv.filter(x => x.reply).length, rv.length) : '']); });
    downloadCSV(`laporan-branchsync-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast('Laporan CSV diunduh.', { tone: 'good' });
  };
  const chips = [
    f.region && { key: 'region', label: 'Region', value: f.region, onRemove: () => setR(x => { x.region = ''; }) },
    f.account && { key: 'account', label: 'Akun', value: acctName(f.account), onRemove: () => setR(x => { x.account = ''; }) },
    f.type && { key: 'type', label: 'Tipe unit', value: f.type, onRemove: () => setR(x => { x.type = ''; }) }
  ].filter(Boolean) as { key: string; label: string; value: string; onRemove: () => void }[];
  const sched = ws.reportSchedules || [];
  void claimTimes;

  return <>
    <div className="bs-print-head"><strong>BranchSync — Laporan & Analitik</strong><span>{`Periode: ${periodTxt} · Cakupan: ${scopeTxt} · Dicetak: ${fmtDate(Date.now())}`}</span></div>
    <PageHead title="Laporan & Analitik" desc={navItem('reports').desc} actions={<>
      <Btn label="Jadwalkan" icon="calendar" perm="settings.write" onClick={reportScheduleModal} />
      <Btn label="Ekspor CSV" icon="download" onClick={exportCsv} />
      <Btn label="Cetak / PDF" icon="printer" variant="primary" onClick={() => window.print()} />
    </>} />
    <section className="bs-card bs-report-filters"><div className="bs-card-body flush">
      <div className="bs-toolbar">
        <SelectF label="Periode" xs={PERIODS} value={f.period} all={null} onChange={v => setR(x => { x.period = v; })} />
        <SelectF label="Region" xs={REGIONS} value={f.region} all="Semua region" onChange={v => setR(x => { x.region = v; })} />
        <SelectF label="Akun Google Business Profile" xs={accounts.map(a => [a.id, a.name] as [string, string])} value={f.account} all="Semua akun" onChange={v => setR(x => { x.account = v; if (v) x.region = ''; })} />
        <SelectF label="Tipe unit" xs={TYPES} value={f.type} all="Semua tipe" onChange={v => setR(x => { x.type = v; })} />
      </div>
      <ChipRow chips={chips} onReset={() => setR(x => { x.region = ''; x.account = ''; x.type = ''; })} />
      <p className="bs-report-scope"><Ic name="info" /><span><b>{periodTxt}</b>{` · ${scopeTxt} · ${fmtNum(sc.locs.length)} unit. Perubahan dibandingkan dengan ${f.period} hari sebelumnya.`}</span></p>
    </div></section>
    <div className="bs-metrics bs-metrics-6">
      <KpiTile label="Keberhasilan sync" cur={cur.rate} prev={prev.rate} fmt={pctTxt} delta={pointTxt} icon="refresh" />
      <KpiTile label="Rata-rata rating" cur={cur.avgRating} prev={prev.avgRating} fmt={v => `${ratingTxt(v)} ★`} delta={ratingTxt} icon="star" />
      <KpiTile label="Tingkat balasan ulasan" cur={cur.replyRate} prev={prev.replyRate} fmt={pctTxt} delta={pointTxt} icon="chat" />
      <KpiTile label="Waktu balas rata-rata" cur={cur.avgResp} prev={prev.avgResp} fmt={fmtDur} delta={fmtDur} better="down" icon="gauge" />
      <KpiTile label="Kepatuhan SLA internal" cur={cur.sla} prev={prev.sla} fmt={pctTxt} delta={pointTxt} icon="shield" />
      <KpiTile label="Ketidaksesuaian diselesaikan" cur={cur.resolved} prev={prev.resolved} fmt={fmtNum} delta={fmtNum} icon="alert" />
    </div>
    <Card title={`Tren sinkronisasi ${bk.size === 1 ? 'harian' : 'mingguan'}`} sub={`${fmtNum(cur.ok + cur.fail)} pembaruan · ${fmtNum(cur.fail)} gagal`}>
      <ColumnChart rows={syncRows} labelEvery={labelEvery} series={[{ key: 'ok', label: 'Berhasil', cls: 'bs-seg-good', dot: 'good' }, { key: 'fail', label: 'Gagal', cls: 'bs-seg-bad', dot: 'bad' }]} />
    </Card>
    <div className="bs-grid bs-grid-2">
      <Card title="Volume ulasan per minggu" sub={`${fmtNum(cur.rvs.length)} ulasan dalam periode`}><ColumnChart rows={volRows} labelEvery={volRows.length > 8 ? 2 : 1} series={[{ key: 'n', label: 'Ulasan', cls: 'bs-seg-accent', dot: 's1' }]} /></Card>
      <Card title="Rata-rata rating per minggu" sub="Skala 1–5 bintang"><LineChart rows={ratRows} label="Rata-rata rating" fmt={v => `${ratingTxt(v)} ★`} labelEvery={ratRows.length > 8 ? 2 : 1} /></Card>
    </div>
    <Card title="Kinerja per region" sub="Klik region untuk menyaring laporan · bar oranye = di bawah target" flush={!!regionRows.length}>
      {regionRows.length
        ? <div className="bs-table-wrap" tabIndex={0} role="region" aria-label="Kinerja per region"><table className="bs-table bs-report-table bs-cards"><thead><tr>{regionHeads.map((h, i) => <th key={i} scope="col">{h as string}</th>)}</tr></thead><tbody><Rows heads={regionHeads} rows={regionRows} /></tbody></table></div>
        : <EmptyState title="Tidak ada data" text="Tidak ada unit dalam cakupan ini." icon="info" />}
    </Card>
    <div className="bs-grid bs-grid-2">
      <Card title="Komposisi status unit"><Composition title="Status operasional" keys={STATUSES} counts={cnt('status')} /><Composition title="Status Google Business Profile" keys={GBP} counts={cnt('gbp')} /></Card>
      <Card title="Lokasi dengan rating terendah" sub="Berdasarkan ulasan dalam periode" actions={<Go label="Ulasan" view="reviews" />}><RankList rows={lowest} empty="Belum ada ulasan dalam periode ini." fixedMax={5} /></Card>
    </div>
    <div className="bs-grid bs-grid-2">
      <Card title="Penyebab gagal sinkron teratas" actions={<Go label="Sync Monitor" view="sync" />}><RankList rows={reasonRows} empty="Tidak ada kegagalan tercatat dalam periode ini." /></Card>
      <Card title="Aktivitas tim" sub="Jumlah perubahan per pengguna internal" actions={<Go label="Riwayat" view="audit" />}><RankList rows={teamRows} empty="Belum ada aktivitas dalam periode ini." /></Card>
    </div>
    <Card title="Laporan terjadwal" sub="Dikirim otomatis oleh server BranchSync." flush={!!sched.length}>
      {sched.length ? <Table heads={['Laporan', 'Jadwal', 'Penerima', ActionsHead]} rows={sched.map(x => ({ key: x.id, cells: [
        <><strong>{x.name}</strong><small>{(PERIODS.find(p2 => p2[0] === x.period) || PERIODS[0])[1]} · {x.format}</small></>,
        <>{FREQ[x.frequency] || x.frequency}<small>{x.frequency === 'weekly' ? `${(WEEKDAYS.find(w => w[0] === x.day) || WEEKDAYS[0])[1]}, 08.00` : 'Tanggal 1, 08.00'}</small></>,
        { c: x.recipients.join(', '), cls: 'bs-td-wrap' },
        { c: <Btn icon="trash" variant="icon sm ghost" title={`Hapus jadwal ${x.name}`} perm="settings.write" onClick={() => deleteSchedule(x.id)} />, cls: 'bs-td-actions' }
      ] }))} /> : <EmptyState title="Belum ada jadwal" text="Kirim laporan otomatis ke email pimpinan secara berkala." icon="calendar" cta={<Btn label="Jadwalkan laporan" icon="calendar" variant="sm" perm="settings.write" onClick={reportScheduleModal} />} />}
    </Card>
  </>;
}
