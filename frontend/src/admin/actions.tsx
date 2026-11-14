/*
 * Aksi domain. Setiap aksi memeriksa izin, mengirim perubahan ke server (remote), lalu data dimuat ulang
 * otomatis. Server mencatat setiap perubahan di Riwayat (audit) beserta nilai sebelum/sesudah.
 */
import { byCode, duplicatePairs, openFailures } from '../lib/data';
import { FIELD_LABEL } from '../lib/domain';
import { downloadCSV, downloadXlsx } from '../lib/files';
import { fmtNum } from '../lib/format';
import type { Location } from '../lib/types';
import { getApp, setUi, toast } from '../store';
import { announce } from './announce';
import { confirmModal, noteModal } from './ui/Modal';
import { closeDrawer, guard, navigate, remote, ws } from './workspace';
import { claimForm } from './forms/ClaimForms';

const enc = encodeURIComponent;

/* ---------- Unit kerja ---------- */
export function deleteLocation(code: string) {
  if (!guard('locations.write')) return;
  const l = byCode(ws()).get(code); if (!l) return;
  confirmModal(`Hapus “${l.name}”?`, `Unit ${l.code} · ${l.type} · ${l.city} akan dihapus dari Dashboard dan server.`, 'Hapus unit', async () => {
    const ok = await remote('DELETE', `/locations/${enc(code)}`);
    if (!ok) return;
    setUi(ui => { ui.loc.selected.delete(code); });
    if (getApp().ui.drawer?.code === code) closeDrawer();
    toast(`${l.name} dihapus.`);
  });
}
export function bulkDelete() {
  if (!guard('locations.write')) return;
  const sel = getApp().ui.loc.selected, n = sel.size;
  const names = ws().locations.filter(x => sel.has(x.code)).slice(0, 5);
  confirmModal(`Hapus ${fmtNum(n)} unit terpilih?`, <>
    <p>Unit kerja berikut akan dihapus dari Dashboard dan server:</p>
    <ul className="bs-confirm-list">{names.map(x => <li key={x.code}>{x.name} <small>{x.code}</small></li>)}{n > 5 && <li className="bs-muted">dan {fmtNum(n - 5)} unit lainnya</li>}</ul>
  </>, `Hapus ${fmtNum(n)} unit`, async () => {
    const codes = [...sel];
    const ok = await remote('POST', '/locations/bulk-delete', { codes });
    if (!ok) return;
    setUi(ui => { ui.loc.selected.clear(); });
    toast(`${fmtNum(n)} unit dihapus.`);
  });
}
export async function bulkStatus(status: string) {
  if (!guard('locations.write') || !status) return;
  const codes = [...getApp().ui.loc.selected];
  const ok = await remote('POST', '/locations/bulk-update', { codes, patch: { status } });
  if (ok) toast(`Status ${codes.length} unit diubah menjadi ${status}.`, { tone: 'good' });
}
export async function exportLocations(xs: Location[], base = 'branchsync-unit-kerja', fmt: 'csv' | 'xlsx' = 'csv') {
  const keys = ['code', 'name', 'type', 'status', 'gbp', 'city', 'province', 'region', 'address', 'phone', 'hours', 'lat', 'lng'] as const;
  const rows: unknown[][] = [[...keys], ...xs.map(l => keys.map(k => l[k]))];
  if (fmt === 'xlsx') {
    try { await downloadXlsx(`${base}.xlsx`, [{ name: 'Unit Kerja', rows, widths: [12, 36, 14, 12, 16, 20, 22, 12, 40, 18, 24, 12, 12] }]); }
    catch (e) { toast((e as Error).message || 'Pustaka Excel gagal dimuat.', { tone: 'bad' }); return; }
  } else downloadCSV(`${base}.csv`, rows);
  toast(`${fmtNum(xs.length)} unit diekspor ke ${fmt === 'xlsx' ? 'Excel' : 'CSV'}.`, { tone: 'good' });
}

/* ---------- Ketidaksesuaian ---------- */
export async function resolveDisc(code: string, field: string, useDashboard: boolean) {
  if (!guard('locations.write')) return;
  const ok = await remote('POST', '/discrepancies/resolve', { code, field, source: useDashboard ? 'dashboard' : 'google' });
  if (ok) toast(useDashboard ? 'Data Dashboard dikirim ke Google.' : 'Data Google diterapkan ke Dashboard.', { tone: 'good' });
}
export function resolveDiscBulk(rows: { code: string; field: string }[]) {
  if (!guard('locations.write')) return;
  confirmModal('Pakai data Dashboard untuk semua?', `${rows.length} perbedaan yang tampil akan diselesaikan dengan mengirim data Dashboard ke Google.`, `Kirim ${rows.length} perubahan`, async () => {
    const ok = await remote('POST', '/discrepancies/resolve-bulk', { source: 'dashboard', items: rows });
    if (ok) toast(`${rows.length} perbedaan diselesaikan.`, { tone: 'good' });
  }, { danger: false });
}
export function discNote(code: string, field: string) {
  if (!guard('locations.write')) return;
  noteModal('Catat temuan ketidaksesuaian', 'Catatan / dokumentasi', async t => {
    const ok = await remote('PUT', '/discrepancies/notes', { code, field, text: t });
    if (ok) toast('Catatan disimpan.', { tone: 'good' });
  }, ws().discNotes[`${code}|${field}`]?.text || '');
}

/* ---------- Duplikat ---------- */
export function dupKeep(pairKey: string, side: 'a' | 'b') {
  if (!guard('locations.write')) return;
  const p = duplicatePairs(ws()).pairs.find(x => x.key === pairKey); if (!p) return;
  const keep = side === 'a' ? p.a : p.b, drop = side === 'a' ? p.b : p.a;
  confirmModal(`Tandai “${drop.name}” sebagai duplikat?`, <p><b>{keep.name}</b> ({keep.code}) dipertahankan. <b>{drop.name}</b> ({drop.code}) dinonaktifkan dan ditandai Duplikat di Google Business Profile.</p>, 'Tandai duplikat', async () => {
    const ok = await remote('POST', '/duplicates/merge', { keep: keep.code, drop: drop.code });
    if (ok) toast(`${drop.name} ditandai duplikat dari ${keep.name}.`, { tone: 'good' });
  });
}
export async function dupIgnore(pairKey: string) {
  if (!guard('locations.write')) return;
  const [a, b] = pairKey.split('|');
  const ok = await remote('POST', '/duplicates/ignore', { a, b });
  if (ok) toast('Pasangan ditandai bukan duplikat.');
}
export function dupReport(pairKey: string) {
  if (!guard('claims.manage')) return;
  const [a, b] = pairKey.split('|');
  claimForm(byCode(ws()).get(b)?.gbp === 'Terverifikasi' ? a : b, 'Laporan duplikat');
}

/* ---------- Persetujuan & klaim ---------- */
export async function decide(id: string, approve: boolean) {
  if (!guard('approvals.decide')) return;
  const a = ws().approvals.find(x => x.id === id);
  if (!a || a.status !== 'Menunggu') return;
  const ok = await remote('POST', `/approvals/${enc(id)}/${approve ? 'approve' : 'reject'}`);
  if (ok) toast(approve ? `${a.id} disetujui — data diperbarui.` : `${a.id} ditolak — data unit kerja tidak berubah.`, { tone: approve ? 'good' : 'info' });
}
export async function advanceClaim(id: string, next: string) {
  if (!guard('claims.manage')) return;
  const ok = await remote('POST', `/claims/${enc(id)}/advance`, { to: next });
  if (ok) toast(`${id} → ${next}.`, { tone: next === 'Selesai' ? 'good' : 'info' });
}
export function rejectClaim(id: string) {
  if (!guard('claims.manage')) return;
  noteModal('Tolak permintaan', 'Alasan penolakan', async t => {
    const ok = await remote('POST', `/claims/${enc(id)}/reject`, { note: t });
    if (ok) toast(`${id} ditolak.`);
  });
}

/* ---------- Sinkronisasi ---------- */
export function resolveFailure(code: string) {
  if (!guard('sync.run')) return;
  const w = ws(), f = openFailures(w).find(x => x.code === code); if (!f) return;
  noteModal('Catat tindak lanjut', `Tindak lanjut untuk ${byCode(w).get(code)?.name || code} — ${f.reason}`, async t => {
    const ok = await remote('POST', '/sync/failures/resolve', { code, run: f.run, note: t });
    if (ok) toast('Kegagalan ditandai sudah ditangani.', { tone: 'good' });
  });
}

/* ---------- Pengguna & akses ---------- */
export function toggleUser(id: number) {
  if (!guard('users.manage')) return;
  const u = ws().users.find(x => x.id === id); if (!u) return;
  const next = u.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
  const apply = async () => { const ok = await remote('PATCH', `/users/${enc(String(u.id))}`, { status: next }); if (ok) toast(`${u.name} ${next.toLowerCase()}.`); };
  if (u.status === 'Aktif') confirmModal(`Nonaktifkan ${u.name}?`, `${u.name} (${u.email}) tidak bisa masuk ke BranchSync sampai diaktifkan kembali.`, 'Nonaktifkan', apply);
  else void apply();
}
export async function togglePerm(roleName: string, perm: string, on: boolean, label: string) {
  if (!guard('users.manage')) return;
  const r = ws().roles.find(x => x.name === roleName); if (!r) return;
  const permissions = on ? [...new Set([...r.permissions, perm])] : r.permissions.filter(x => x !== perm);
  const ok = await remote('PATCH', `/roles/${enc(roleName)}`, { permissions });
  if (ok) toast(`${roleName}: izin “${label}” ${on ? 'diberikan' : 'dicabut'}.`);
}

/* ---------- Ulasan ---------- */
export async function sendReply(id: string, text: string) {
  if (!guard('reviews.reply')) return false;
  const ok = await remote('PUT', `/reviews/${enc(id)}/reply`, { text });
  if (ok) toast('Balasan terkirim ke Google.', { tone: 'good' });
  return !!ok;
}
export function deleteReply(id: string) {
  if (!guard('reviews.reply')) return;
  const rv = ws().reviews.find(x => x.id === id); if (!rv || !rv.reply) return;
  confirmModal(`Hapus balasan untuk ulasan ${rv.author}?`, `Balasan pemilik pada ulasan ${rv.author} (${rv.rating}★) akan dihapus dari Google Maps.`, 'Hapus balasan', async () => {
    const ok = await remote('DELETE', `/reviews/${enc(id)}/reply`);
    if (ok) toast('Balasan dihapus.');
  });
}

/* ---------- Integrasi Google ---------- */
export function apiDisconnect() {
  if (!guard('settings.write')) return;
  confirmModal('Putuskan Google Business Profile?', <p>Sinkronisasi dan balasan ulasan ke akun <b>{ws().api.account || 'Google'}</b> berhenti sampai akun dihubungkan lagi.</p>, 'Putuskan', async () => {
    const ok = await remote('PATCH', '/integrations/google', { connected: false });
    if (ok) toast('Permintaan memutus dikirim ke server.');
  }, { undo: 'Anda bisa menghubungkannya lagi kapan saja dari halaman ini.' });
}
export async function apiTest() {
  if (!guard('settings.write')) return;
  const res = await remote<{ ok?: boolean; latencyMs?: number; message?: string }>('POST', '/integrations/google/test');
  if (res && typeof res === 'object') toast(res.ok === false ? `Uji gagal: ${res.message || 'tidak diketahui'}` : `Uji koneksi Google berhasil${res.latencyMs ? ` — ${res.latencyMs} ms` : ''}.`, { tone: res.ok === false ? 'bad' : 'good' });
}
/** Server membuat URL persetujuan Google yang terikat ke sesi pengguna ini (bukan tautan publik). */
export async function gbpOAuth() {
  if (!guard('settings.write')) return;
  if (location.protocol === 'file:') { toast('Menghubungkan akun Google hanya bisa dari alamat web (http/https).', { tone: 'warn' }); return; }
  const res = await remote<{ url?: string }>('POST', '/integrations/google/oauth/url', { redirect_uri: location.href.split('#')[0] });
  if (res && typeof res === 'object' && res.url) location.assign(res.url);
}
export async function setWebhook(on: boolean) {
  if (!guard('settings.write')) return;
  const ok = await remote('PATCH', '/integrations/google', { webhook: on });
  if (ok) toast(on ? 'Notifikasi edit eksternal aktif.' : 'Notifikasi edit eksternal nonaktif.');
}

/* ---------- Laporan ---------- */
export function deleteSchedule(id: string) {
  if (!guard('settings.write')) return;
  const x = ws().reportSchedules.find(y => y.id === id); if (!x) return;
  confirmModal(`Hapus jadwal “${x.name}”?`, 'Laporan ini tidak akan dikirim lagi ke penerima.', 'Hapus jadwal', async () => {
    const ok = await remote('DELETE', `/reports/schedules/${enc(id)}`);
    if (ok) toast('Jadwal dihapus.');
  });
}

export const fieldLabel = (f: string) => FIELD_LABEL[f] || f;
export { announce, navigate };
