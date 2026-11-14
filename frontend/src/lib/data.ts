/*
 * Data workspace: normalisasi respons GET /bootstrap dan data turunan (ketidaksesuaian, duplikat, SLA, …).
 * Snapshot tidak pernah diubah di tempat — setiap perubahan dikirim ke server lalu snapshot dimuat ulang —
 * sehingga hasil turunan aman di-memo per objek snapshot (WeakMap).
 */
import { ApiError } from './api';
import { DAY, FIELD_LABEL, HOUR, regionOf } from './domain';
import { distM, normName, pct, sum } from './format';
import type { Change, Claim, Location, Workspace } from './types';

const toMs = (v: unknown): number | null => (v == null || v === '' ? null : typeof v === 'number' ? v : (Date.parse(String(v)) || null));

export function blankWorkspace(): Workspace {
  return {
    locations: [], approvals: [], claims: [], runs: [], audit: [], users: [], roles: [],
    api: { connected: false, account: '', project: '', quotaLimit: 0, quotaUsed: 0, lastTest: null, webhook: false, clientId: '', hasClientSecret: false, hasApiKey: false, scopes: ['business.manage'], syncInterval: '60', pubsubTopic: '' },
    accounts: [], reviews: [], reportSchedules: [],
    settings: { workspace: 'BranchSync', timezone: 'Asia/Jakarta', slaInternal: 24, slaGoogle: 120, dupRadius: 150, coordTol: 50 },
    discNotes: {}, dupIgnored: []
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeSnapshot(d: any): Workspace {
  if (!d || !Array.isArray(d.locations)) throw new ApiError('Respons /bootstrap tidak valid: daftar "locations" tidak ditemukan.', 0, 'bad-data');
  const base = blankWorkspace();
  return {
    ...base,
    settings: { ...base.settings, ...(d.settings || {}) },
    api: { ...base.api, ...(d.api || {}), lastTest: toMs(d.api?.lastTest) },
    locations: d.locations.map((l: any) => ({ ...l, region: l.region || regionOf(l.province || ''), lat: Number(l.lat), lng: Number(l.lng), updatedAt: toMs(l.updatedAt) || Date.now(), updatedBy: l.updatedBy || '—', lastSync: toMs(l.lastSync), google: l.google ? { ...l.google, lat: Number(l.google.lat), lng: Number(l.google.lng) } : null })),
    approvals: (d.approvals || []).map((a: any) => ({ ...a, time: toMs(a.time), decidedAt: toMs(a.decidedAt) })),
    claims: (d.claims || []).map((c: any) => ({ ...c, submittedAt: toMs(c.submittedAt), processedAt: toMs(c.processedAt), doneAt: toMs(c.doneAt) })),
    runs: (d.runs || []).map((r: any) => ({ ...r, time: toMs(r.time), items: r.items || [] })),
    audit: (d.audit || []).map((a: any) => ({ ...a, time: toMs(a.time), changes: a.changes || [] })),
    users: (d.users || []).map((u: any) => ({ ...u, lastActive: toMs(u.lastActive) })),
    roles: (d.roles || []).map((r: any) => ({ name: r.name, permissions: r.permissions || [] })),
    discNotes: d.discNotes || {},
    dupIgnored: d.dupIgnored || [],
    reportSchedules: (d.reportSchedules || []).map((x: any) => ({ ...x, createdAt: toMs(x.createdAt) })),
    accounts: (d.accounts || []).map((a: any) => ({ ...a })),
    reviews: (d.reviews || []).map((rv: any) => ({ ...rv, rating: Number(rv.rating) || 0, time: toMs(rv.time), reply: rv.reply && rv.reply.text ? { ...rv.reply, time: toMs(rv.reply.time) } : null }))
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- Memo per snapshot
const caches = new WeakMap<Workspace, Map<string, unknown>>();
export function memo<T>(ws: Workspace, key: string, fn: () => T): T {
  let m = caches.get(ws);
  if (!m) { m = new Map(); caches.set(ws, m); }
  if (!m.has(key)) m.set(key, fn());
  return m.get(key) as T;
}

export const byCode = (ws: Workspace) => memo(ws, 'byCode', () => new Map(ws.locations.map(l => [l.code, l])));
export const byName = (ws: Workspace) => memo(ws, 'byName', () => {
  const m = new Map<string, Location[]>();
  ws.locations.forEach(l => { const k = String(l.name).toLowerCase(); (m.get(k) || m.set(k, []).get(k)!).push(l); });
  return m;
});
export const locName = (ws: Workspace, code: string) => byCode(ws).get(code)?.name || code;
export const acctOf = (l: Location | undefined | null) => (l && l.accountId) || '';

export interface Issue { field: string; dash: string; google: string; dist?: number }
export function issuesOf(ws: Workspace, l: Location): Issue[] {
  const g = l.google;
  if (!g) return [];
  const out: Issue[] = [];
  for (const f of ['name', 'phone', 'hours', 'address'] as const) {
    if (String(l[f] || '').trim() !== String(g[f] || '').trim()) out.push({ field: f, dash: l[f], google: g[f] });
  }
  const d = distM(l, g);
  if (d > ws.settings.coordTol) out.push({ field: 'coords', dash: `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`, google: `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`, dist: d });
  return out;
}
export const issueMap = (ws: Workspace) => memo(ws, 'issues', () => {
  const m = new Map<string, Issue[]>();
  ws.locations.forEach(l => { const x = issuesOf(ws, l); if (x.length) m.set(l.code, x); });
  return m;
});

/* Deteksi duplikat: dua lintasan grid — nama sama (dinormalisasi) dalam 2 km, tipe sama dalam radius pengaturan.
 * Tiap unit menyimpan maks. DUP_PER_UNIT pasangan terdekat dan memeriksa maks. DUP_SCAN kandidat. */
export const DUP_PER_UNIT = 5;
const DUP_SCAN = 200;
export interface DupPair { key: string; a: Location; b: Location; d: number; reason: string; score: number }
function nearPairs(list: Location[], radius: number, emit: (a: Location, b: Location, d: number) => void) {
  const cell = radius / 111320 / 0.97, grid = new Map<string, number[]>();
  const keyOf = (y: number, x: number) => `${y}:${x}`;
  list.forEach((l, i) => { const k = keyOf(Math.floor(l.lat / cell), Math.floor(l.lng / cell)); (grid.get(k) || grid.set(k, []).get(k)!).push(i); });
  let capped = 0;
  list.forEach((a, i) => {
    const gy = Math.floor(a.lat / cell), gx = Math.floor(a.lng / cell), best: [number, number][] = [];
    let scanned = 0;
    for (let dy = -1; dy <= 1 && scanned < DUP_SCAN; dy++) for (let dx = -1; dx <= 1 && scanned < DUP_SCAN; dx++) {
      const ids = grid.get(keyOf(gy + dy, gx + dx)); if (!ids) continue;
      for (let n = 0; n < ids.length; n++) {
        const j = ids[n]; if (j === i) continue;
        if (++scanned > DUP_SCAN) { capped++; break; }
        const d = distM(a, list[j]); if (d > radius) continue;
        if (best.length < DUP_PER_UNIT) best.push([d, j]); else if (d < best[best.length - 1][0]) best[best.length - 1] = [d, j]; else continue;
        best.sort((x, y) => x[0] - y[0]);
      }
    }
    best.forEach(([d, j]) => emit(a, list[j], d));
  });
  return capped;
}
export const duplicatePairs = (ws: Workspace) => memo(ws, 'dups', () => {
  const ignored = new Set(ws.dupIgnored), R = ws.settings.dupRadius, out: DupPair[] = [], seen = new Set<string>();
  const active = ws.locations.filter(l => l.gbp !== 'Duplikat');
  const add = (same: boolean) => (a: Location, b: Location, d: number) => {
    const [x, y] = a.code < b.code ? [a, b] : [b, a], key = `${x.code}|${y.code}`;
    if (seen.has(key) || ignored.has(key)) return;
    seen.add(key);
    out.push({ key, a: x, b: y, d, reason: same ? 'Nama sama dan berdekatan' : `Tipe sama dalam radius ${R} m`, score: same ? (d < 300 ? 95 : 80) : 70 });
  };
  const group = (keyFn: (l: Location) => string) => { const m = new Map<string, Location[]>(); active.forEach(l => { const k = keyFn(l); if (k) (m.get(k) || m.set(k, []).get(k)!).push(l); }); return m; };
  let capped = 0;
  group(l => normName(l.name)).forEach(g => { if (g.length > 1) capped += nearPairs(g, 2000, add(true)); });
  group(l => l.type).forEach(g => { if (g.length > 1) capped += nearPairs(g, R, add(false)); });
  out.sort((x, y) => y.score - x.score || x.d - y.d);
  return { pairs: out, dense: capped > 0 };
});

export interface OpenFailure { code: string; reason: string; run: string; time: number }
export const openFailures = (ws: Workspace) => memo(ws, 'fails', () => {
  const out: OpenFailure[] = [], seen = new Set<string>();
  ws.runs.forEach(r => r.items.forEach(i => {
    if (i.status !== 'Gagal' || i.resolved || seen.has(i.code)) return;
    seen.add(i.code);
    out.push({ code: i.code, reason: i.reason, run: r.id, time: r.time });
  }));
  return out;
});

export const claimActive = (c: Claim) => !['Selesai', 'Ditolak'].includes(c.status);
export const claimName = (ws: Workspace, c: Claim) => (c.code ? locName(ws, c.code) : c.proposal?.name || '—');
export interface ClaimTimes { internal: number; google: number | null; internalRunning: boolean; googleRunning: boolean; sla: 'Dalam SLA' | 'Lewat SLA' | 'Mendekati batas' }
export function claimTimes(ws: Workspace, c: Claim): ClaimTimes {
  const now = Date.now();
  const internal = (c.processedAt || (claimActive(c) ? now : c.doneAt || now)) - c.submittedAt;
  const gEnd = c.doneAt || (claimActive(c) ? now : null);
  const google = c.processedAt && gEnd ? gEnd - c.processedAt : null;
  const limit = ws.settings.slaInternal * HOUR;
  const sla = internal > limit ? 'Lewat SLA' : !c.processedAt && claimActive(c) && internal > limit * 0.75 ? 'Mendekati batas' : 'Dalam SLA';
  return { internal, google: google == null || isNaN(google) ? null : google, internalRunning: !c.processedAt && claimActive(c), googleRunning: !!c.processedAt && !c.doneAt && claimActive(c), sla };
}
export const slaStats = (ws: Workspace) => memo(ws, 'sla', () => {
  const rows = ws.claims.filter(c => c.status !== 'Ditolak').map(c => ({ c, t: claimTimes(ws, c) }));
  const doneInt = rows.filter(x => !x.t.internalRunning), doneG = rows.filter(x => x.c.doneAt);
  return {
    rows,
    avgInternal: doneInt.length ? sum(doneInt.map(x => x.t.internal)) / doneInt.length : null,
    avgGoogle: doneG.length ? sum(doneG.map(x => x.t.google || 0)) / doneG.length : null,
    compliance: pct(rows.filter(x => x.t.sla !== 'Lewat SLA').length, rows.length),
    atRisk: rows.filter(x => x.t.sla !== 'Dalam SLA' && claimActive(x.c)).length
  };
});

export function dailySync(ws: Workspace, days: number) {
  const out: { start: number; ok: number; fail: number }[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) out.push({ start: today.getTime() - i * DAY, ok: 0, fail: 0 });
  ws.runs.forEach(r => { const d = out.find(x => r.time >= x.start && r.time < x.start + DAY); if (d) { d.ok += r.ok; d.fail += r.fail; } });
  return out;
}

export interface Notice { icon: string; tone: string; title: string; text: string; view: string }
export function notifications(ws: Workspace): Notice[] {
  const neg = ws.reviews.filter(rv => !rv.reply && rv.rating <= 2).length;
  const pend = ws.approvals.filter(a => a.status === 'Menunggu').length, f = openFailures(ws).length, im = issueMap(ws).size, dp = duplicatePairs(ws).pairs.length, risk = slaStats(ws).atRisk;
  return ([
    pend && { icon: 'inbox', tone: 'warn', title: `${pend} edit dari email GBP lain menunggu persetujuan`, text: 'Data unit kerja tidak berubah sampai disetujui.', view: 'approvals' },
    f && { icon: 'refresh', tone: 'bad', title: `${f} unit gagal disinkronkan`, text: 'Coba ulang atau beri catatan tindak lanjut.', view: 'sync' },
    risk && { icon: 'gauge', tone: 'warn', title: `${risk} permintaan mendekati/lewat SLA`, text: `Target proses internal ${ws.settings.slaInternal} jam.`, view: 'sla' },
    im && { icon: 'alert', tone: 'warn', title: `${im} unit berbeda dengan Google Maps`, text: 'Tentukan sumber data yang benar.', view: 'discrepancies' },
    dp && { icon: 'copy', tone: 'info', title: `${dp} kemungkinan titik ganda`, text: 'Periksa dan gabungkan bila perlu.', view: 'duplicates' },
    neg && { icon: 'star', tone: 'warn', title: `${neg} ulasan negatif belum dibalas`, text: 'Balas cepat agar nasabah merasa didengar.', view: 'reviews' }
  ].filter(Boolean)) as Notice[];
}

export const navCounts = (ws: Workspace) => memo(ws, 'navCounts', () => ({
  issues: issueMap(ws).size,
  dups: duplicatePairs(ws).pairs.length,
  claims: ws.claims.filter(claimActive).length,
  approvals: ws.approvals.filter(a => a.status === 'Menunggu').length,
  reviews: ws.reviews.filter(rv => !rv.reply).length,
  fails: openFailures(ws).length
}));

export const diff = <T extends object>(before: T, after: Partial<T>, keys: (keyof T & string)[]): Change[] =>
  keys.filter(k => String(before[k] ?? '') !== String(after[k] ?? '')).map(k => ({ field: FIELD_LABEL[k] || k, before: String(before[k] ?? ''), after: String(after[k] ?? '') }));

// ---- Laporan
export interface ReportScope { locs: Location[]; codes: Set<string>; filtered: boolean }
export function reportBuckets(period: string) {
  const days = Number(period) || 30, size = days > 30 ? 7 : 1, n = Math.ceil(days / size);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = today.getTime() + DAY, list: { from: number; to: number }[] = [];
  for (let i = n - 1; i >= 0; i--) { const to = end - i * size * DAY; list.push({ from: to - size * DAY, to }); }
  return { list, size, from: list[0].from, to: end };
}
export function reportMetrics(ws: Workspace, from: number, to: number, sc: ReportScope) {
  const inR = (t: number | null | undefined) => t != null && t >= from && t < to;
  const runs = ws.runs.filter(r => inR(r.time)), active = sc.locs.filter(l => l.status !== 'Tidak Aktif').length;
  let ok = 0, fail = 0;
  runs.forEach(r => {
    if (!sc.filtered) { ok += r.ok; fail += r.fail; return; }
    const f2 = r.items.filter(i => i.status === 'Gagal' && sc.codes.has(i.code)).length;
    fail += f2; ok += Math.max(0, active - f2);
  });
  const rvs = ws.reviews.filter(rv => inR(rv.time) && sc.codes.has(rv.code)), replied = rvs.filter(rv => rv.reply);
  const resp = replied.map(rv => rv.reply!.time - rv.time).filter(x => x >= 0);
  const claims = ws.claims.filter(c => inR(c.submittedAt) && c.status !== 'Ditolak' && (!sc.filtered || (c.code && sc.codes.has(c.code))));
  const audit = ws.audit.filter(a => inR(a.time));
  const resolved = audit.filter(a => a.module === 'Ketidaksesuaian' && /^(Mengirim|Menerapkan)/.test(a.action) && (!sc.filtered || sc.codes.has(a.target))).length;
  return {
    runs, ok, fail, rate: ok + fail ? (ok / (ok + fail)) * 100 : null, rvs,
    avgRating: rvs.length ? sum(rvs.map(r => r.rating)) / rvs.length : null,
    replyRate: rvs.length ? (replied.length / rvs.length) * 100 : null,
    avgResp: resp.length ? sum(resp) / resp.length : null,
    claims, sla: claims.length ? (claims.filter(c => claimTimes(ws, c).sla !== 'Lewat SLA').length / claims.length) * 100 : null,
    resolved, audit
  };
}
