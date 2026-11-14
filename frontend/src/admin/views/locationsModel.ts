/*
 * Model halaman Unit Kerja: tampilan cepat, filter, urutan, tampilan tersimpan, kolom, dan kepadatan.
 * Tampilan tersimpan & kolom adalah preferensi pribadi per pengguna (disimpan di browser ini).
 */
import { create } from 'zustand';
import * as api from '../../lib/api';
import { issueMap, memo, type Issue } from '../../lib/data';
import { GBP, REGIONS, STATUSES, TYPES } from '../../lib/domain';
import type { Location, Workspace } from '../../lib/types';
import { getApp, toast, type LocUi } from '../../store';

export const QUICK: [string, string, (l: Location, im: Map<string, Issue[]>) => boolean][] = [
  ['all', 'Semua', () => true],
  ['sync', 'Perlu sinkron', l => l.status === 'Belum Sync' || l.status === 'Offline'],
  ['issues', 'Beda dengan Google', (l, im) => im.has(l.code)],
  ['unverified', 'Belum terverifikasi', l => l.gbp !== 'Terverifikasi'],
  ['inactive', 'Tidak aktif', l => l.status === 'Tidak Aktif']
];
export type FilterKey = 'status' | 'gbp' | 'type' | 'region';
export const FILTERS: [FilterKey, string, readonly string[]][] = [['status', 'Status operasional', STATUSES], ['gbp', 'Status GBP', GBP], ['type', 'Tipe', TYPES], ['region', 'Region', REGIONS]];

export interface ViewFilters { q: string; quick: string; status: string[]; region: string[]; type: string[]; gbp: string[]; sort: string; dir: 1 | -1 }
export interface SavedView { id: string; name: string; pinned: boolean; filters: ViewFilters; createdAt: number }
export interface UserPrefs { views: SavedView[]; cols: string[] | null; density: 'comfortable' | 'compact' }

/* ---------- Preferensi per pengguna ---------- */
const UPREF_KEY = 'branchSync.admin.userPrefs';
let all: Record<string, UserPrefs> = {};
try { all = JSON.parse(localStorage.getItem(UPREF_KEY) || '{}') || {}; } catch { all = {}; }
const userKey = () => `live:${api.host()}:${getApp().me.email || getApp().me.name}`;
export const useUserPrefs = create<{ rev: number }>(() => ({ rev: 0 }));
export const up = (): UserPrefs => (all[userKey()] ||= { views: [], cols: null, density: 'comfortable' });
/** Ubah preferensi pengguna aktif lalu simpan. */
export function updateUp(fn: (u: UserPrefs) => void) {
  fn(up());
  try { localStorage.setItem(UPREF_KEY, JSON.stringify(all)); } catch { toast('Preferensi tidak dapat disimpan di browser ini.', { tone: 'warn' }); }
  useUserPrefs.setState(s => ({ rev: s.rev + 1 }));
}

export const viewFilters = (f: LocUi): ViewFilters => ({ q: f.q.trim(), quick: f.quick, status: [...f.status].sort(), region: [...f.region].sort(), type: [...f.type].sort(), gbp: [...f.gbp].sort(), sort: f.sort, dir: f.dir });
export const sameFilters = (a: ViewFilters, b: ViewFilters) => JSON.stringify(a) === JSON.stringify(b);
export function filterSummary(v: ViewFilters) {
  const parts: string[] = [];
  if (v.q) parts.push(`“${v.q}”`);
  if (v.quick && v.quick !== 'all') parts.push((QUICK.find(x => x[0] === v.quick) || ['', v.quick])[1] as string);
  FILTERS.forEach(([k]) => { if (v[k] && v[k].length) parts.push(v[k].join(', ')); });
  return parts.join(' · ') || 'Semua unit';
}

/* ---------- Filter & urut (di-memo per snapshot + kombinasi filter) ---------- */
const hay = (ws: Workspace) => memo(ws, 'hay', () => new Map(ws.locations.map(l => [l, `${l.name} ${l.code} ${l.city} ${l.province} ${l.address}`.toLowerCase()])));
const COLLATOR = new Intl.Collator('id', { numeric: true });
function locMatcher(ws: Workspace, v: Pick<ViewFilters, 'q' | 'quick' | FilterKey>) {
  const q = (v.q || '').trim().toLowerCase(), im = issueMap(ws), quick = (QUICK.find(x => x[0] === v.quick) || QUICK[0])[2], H = hay(ws);
  const fs = FILTERS.filter(([k]) => v[k] && v[k].length).map(([k]) => [k, new Set(v[k])] as const);
  return (l: Location) => (!q || H.get(l)!.includes(q)) && fs.every(([k, set]) => set.has(l[k])) && quick(l, im);
}
export const viewCount = (ws: Workspace, v: ViewFilters) => memo(ws, `vc:${JSON.stringify(v)}`, () => ws.locations.filter(locMatcher(ws, v)).length);
export function locFiltered(ws: Workspace, f: LocUi): Location[] {
  const key = `lf:${JSON.stringify([f.q.trim().toLowerCase(), f.quick, FILTERS.map(([k]) => f[k]), f.sort, f.dir])}`;
  return memo(ws, key, () => {
    const xs = ws.locations.filter(locMatcher(ws, f)), im = issueMap(ws), k = f.sort, dir = f.dir;
    const val = (l: Location): string | number => (k === 'issues' ? im.get(l.code)?.length || 0 : k === 'lastSync' ? l.lastSync || 0 : k === 'updatedAt' ? l.updatedAt || 0 : String((l as unknown as Record<string, unknown>)[k] ?? ''));
    const keyed = xs.map(l => [val(l), l] as const);
    keyed.sort((a, b) => (typeof a[0] === 'number' ? a[0] - (b[0] as number) : COLLATOR.compare(a[0] as string, b[0] as string)) * dir);
    return keyed.map(x => x[1]);
  });
}
export const quickCount = (ws: Workspace, id: string) => memo(ws, `quick:${id}`, () => { const im = issueMap(ws), fn = (QUICK.find(x => x[0] === id) || QUICK[0])[2]; return ws.locations.filter(l => fn(l, im)).length; });
export const optCount = (ws: Workspace, k: FilterKey, v: string) => memo(ws, 'optcounts', () => {
  const m: Record<string, number> = {};
  ws.locations.forEach(x => FILTERS.forEach(([kk]) => { const key = `${kk}:${x[kk]}`; m[key] = (m[key] || 0) + 1; }));
  return m;
})[`${k}:${v}`] || 0;
