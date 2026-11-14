// Tautan dalam aplikasi: #/halaman?filter=…&unit=KODE (sama dengan versi sebelumnya — lihat API.md).
import { GBP, REGIONS, STATUSES, TYPES, type ViewId } from '../lib/domain';
import type { UiState } from '../store';
import { FILTERS, QUICK } from './views/locationsModel';

const VIEW_SLUG: Record<ViewId, string> = { dashboard: 'dashboard', map: 'peta', reports: 'laporan', sla: 'sla', locations: 'unit-kerja', discrepancies: 'ketidaksesuaian', duplicates: 'duplikat', claims: 'klaim', approvals: 'persetujuan', reviews: 'ulasan', sync: 'sync', audit: 'riwayat', access: 'akses', integrations: 'integrasi', settings: 'pengaturan', guide: 'panduan', scenarios: 'scenario-test' };
const SLUG_VIEW = Object.fromEntries(Object.entries(VIEW_SLUG).map(([v, sl]) => [sl, v])) as Record<string, ViewId>;
export const LOC_SORTS = ['name', 'city', 'region', 'type', 'status', 'gbp', 'issues', 'lastSync', 'updatedAt'];
export const DRAWER_TABS = ['overview', 'compare', 'reviews', 'history', 'sync'];

function routeParams(ui: UiState) {
  const P = new URLSearchParams(), put = (k: string, v: unknown, def: unknown = '') => { if (v != null && String(v) !== '' && String(v) !== String(def)) P.set(k, String(v)); };
  switch (ui.view) {
    case 'locations': { const f = ui.loc; put('q', f.q.trim()); put('tampilan', f.quick, 'all'); FILTERS.forEach(([k]) => put(k, f[k].join(','))); put('urut', f.sort, 'name'); put('arah', f.dir === -1 ? 'desc' : ''); put('hal', f.page, 1); break; }
    case 'map': put('q', ui.map.q.trim()); put('status', ui.map.status); put('region', ui.map.region); put('gbp', ui.map.gbp); break;
    case 'discrepancies': put('q', ui.disc.q.trim()); put('kolom', ui.disc.field); break;
    case 'claims': put('tab', ui.claims.tab, 'active'); break;
    case 'approvals': put('tab', ui.approvals.tab, 'pending'); break;
    case 'sync': put('tab', ui.sync.tab, 'failures'); break;
    case 'access': put('tab', ui.access.tab, 'users'); put('q', ui.access.q.trim()); break;
    case 'audit': put('q', ui.audit.q.trim()); put('modul', ui.audit.module); put('pengguna', ui.audit.actor); put('periode', ui.audit.range === '' ? 'semua' : ui.audit.range, '30'); break;
    case 'reviews': { const f = ui.reviews; put('akun', f.account); put('lokasi', f.location); put('rating', f.rating); put('status', f.status); put('urut', f.sort, 'newest'); put('q', f.q.trim()); break; }
    case 'reports': put('periode', ui.report.period, '30'); put('region', ui.report.region); put('akun', ui.report.account); put('tipe', ui.report.type); break;
    case 'guide': put('q', ui.guide.q.trim()); break;
    case 'scenarios': put('kelompok', ui.scn.group); break;
  }
  if (ui.drawer) { put('unit', ui.drawer.code); put('panel', ui.drawer.tab, 'overview'); }
  return P;
}
export const currentHash = (ui: UiState) => { const qs = routeParams(ui).toString(); return `#/${VIEW_SLUG[ui.view] || 'dashboard'}${qs ? `?${qs}` : ''}`; };

export function parseRoute(hash: string) {
  if (!hash || !hash.startsWith('#/')) return null;
  const [path, qs] = hash.slice(2).split('?');
  let slug = '';
  try { slug = decodeURIComponent(path); } catch { return null; }
  return { view: SLUG_VIEW[slug] || ('' as ViewId | ''), P: new URLSearchParams(qs || '') };
}

/** Terapkan rute ke state UI (draft Immer). Semua nilai divalidasi terhadap daftar yang diizinkan. */
export function applyRoute(ui: UiState, r: { view: ViewId | ''; P: URLSearchParams }, canView: (v: ViewId) => boolean) {
  let view: ViewId = r.view && VIEW_SLUG[r.view] ? r.view : 'dashboard';
  if (!canView(view)) view = 'dashboard';
  const P = r.P, g = (k: string) => (P.get(k) || '').slice(0, 120);
  const one = (k: string, allowed: readonly string[], def = '') => (allowed.includes(g(k)) ? g(k) : def);
  const list = (k: string, allowed: readonly string[]) => g(k).split(',').filter(x => allowed.includes(x));
  switch (view) {
    case 'locations': Object.assign(ui.loc, { q: g('q'), quick: one('tampilan', QUICK.map(x => x[0]), 'all'), status: list('status', STATUSES), region: list('region', REGIONS), type: list('type', TYPES), gbp: list('gbp', GBP), sort: one('urut', LOC_SORTS, 'name'), dir: g('arah') === 'desc' ? -1 : 1, page: Math.max(1, parseInt(g('hal'), 10) || 1) }); ui.loc.selected.clear(); break;
    case 'map': Object.assign(ui.map, { q: g('q'), status: one('status', STATUSES), region: one('region', REGIONS), gbp: one('gbp', GBP) }); break;
    case 'discrepancies': Object.assign(ui.disc, { q: g('q'), field: one('kolom', ['name', 'phone', 'hours', 'address', 'coords']) }); break;
    case 'claims': ui.claims.tab = one('tab', ['active', 'done', 'rejected', 'all'], 'active'); break;
    case 'approvals': ui.approvals.tab = one('tab', ['pending', 'history'], 'pending'); break;
    case 'sync': ui.sync.tab = one('tab', ['failures', 'runs'], 'failures'); break;
    case 'access': Object.assign(ui.access, { tab: one('tab', ['users', 'roles'], 'users'), q: g('q') }); break;
    case 'audit': Object.assign(ui.audit, { q: g('q'), module: g('modul').slice(0, 60), actor: one('pengguna', ['Internal', 'Eksternal']), range: g('periode') === 'semua' ? '' : one('periode', ['1', '7', '30'], '30') }); break;
    case 'reviews': Object.assign(ui.reviews, { account: g('akun').slice(0, 60), location: g('lokasi').slice(0, 40), rating: one('rating', ['1', '2', '3', '4', '5']), status: one('status', ['replied', 'unreplied']), sort: one('urut', ['newest', 'unreplied', 'lowest', 'highest'], 'newest'), q: g('q'), limit: 20, editing: null }); break;
    case 'reports': Object.assign(ui.report, { period: one('periode', ['7', '30', '90'], '30'), region: one('region', REGIONS), account: g('akun').slice(0, 60), type: one('tipe', TYPES) }); break;
    case 'guide': ui.guide.q = g('q'); break;
    case 'scenarios': ui.scn.group = one('kelompok', ['A', 'B', 'C', 'D']); break;
  }
  ui.view = view;
  return { unit: g('unit').slice(0, 40), panel: one('panel', DRAWER_TABS, 'overview') };
}
