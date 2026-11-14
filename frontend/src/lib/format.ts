// Format angka, durasi, dan tanggal. Bahasa & zona waktu aktif diatur oleh store (setFormatContext).
import { DAY, HOUR, MIN } from './domain';

let lang: 'id' | 'en' = 'id';
let timeZone = 'Asia/Jakarta';
export function setFormatContext(next: { lang?: 'id' | 'en'; timeZone?: string }) {
  if (next.lang) lang = next.lang;
  if (next.timeZone) timeZone = next.timeZone;
}
export const isEn = () => lang === 'en';
export const LOC = () => (isEn() ? 'en-GB' : 'id-ID');
/** Pilih teks sesuai bahasa: L2(['Indonesia', 'English']). */
export const L2 = (pair: readonly [string, string] | string) => (Array.isArray(pair) ? (isEn() ? pair[1] : pair[0]) : (pair as string));

export const fmtNum = (n: number) => new Intl.NumberFormat(LOC()).format(n);
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const initials = (s: string) => String(s).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
export const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

export function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3, k = Math.PI / 180;
  const dLat = (b.lat - a.lat) * k, dLng = (b.lng - a.lng) * k;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function offset(lat: number, lng: number, meters: number, angle: number) {
  return { lat: lat + (meters * Math.cos(angle)) / 111320, lng: lng + (meters * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180)) };
}
export const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${new Intl.NumberFormat(LOC(), { maximumFractionDigits: 1 }).format(m / 1000)} km`);

export function fmtDur(ms: number | null | undefined) {
  if (ms == null || !isFinite(ms)) return '—';
  const m = Math.max(0, Math.round(ms / MIN));
  const en = isEn();
  if (m < 60) return en ? `${m} min` : `${m} mnt`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 48) return mm ? (en ? `${h}h ${mm}m` : `${h} j ${mm} m`) : (en ? `${h} h` : `${h} jam`);
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? (en ? `${d}d ${hh}h` : `${d} hr ${hh} j`) : (en ? `${d} day${d === 1 ? '' : 's'}` : `${d} hari`);
}
export const fmtDate = (t: number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) =>
  new Intl.DateTimeFormat(LOC(), { timeZone, ...opts }).format(new Date(t));
export function fmtRel(t: number) {
  const d = Date.now() - t, en = isEn();
  if (d < MIN) return en ? 'just now' : 'baru saja';
  if (d < HOUR) return en ? `${Math.floor(d / MIN)} min ago` : `${Math.floor(d / MIN)} mnt lalu`;
  if (d < DAY) return en ? `${Math.floor(d / HOUR)} h ago` : `${Math.floor(d / HOUR)} jam lalu`;
  if (d < 7 * DAY) { const n = Math.floor(d / DAY); return en ? `${n} day${n === 1 ? '' : 's'} ago` : `${n} hari lalu`; }
  return fmtDate(t, { dateStyle: 'medium' });
}
/** Ekspor: “YYYY-MM-DD HH:mm” pada zona waktu pengaturan. */
export function fmtStamp(t: number | null | undefined, dateOnly = false) {
  if (!t) return '';
  const P = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${P.year}-${P.month}-${P.day}${dateOnly ? '' : ` ${P.hour}:${P.minute}`}`;
}
export const normName = (s: string) => String(s || '').toLowerCase()
  .replace(/\b(bank|bri|rakyat|indonesia|kantor|cabang|pembantu|unit|kc|kcp|atm)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
