// Jam operasional per hari (seperti Google Business Profile) ⇄ teks ringkas "Sen–Jum 08.00–15.00".
import type { HoursSpec } from './types';

export type DayKey = keyof HoursSpec;
export const DAYS: [DayKey, string, string][] = [['mon', 'Senin', 'Sen'], ['tue', 'Selasa', 'Sel'], ['wed', 'Rabu', 'Rab'], ['thu', 'Kamis', 'Kam'], ['fri', 'Jumat', 'Jum'], ['sat', 'Sabtu', 'Sab'], ['sun', 'Minggu', 'Min']];

const blankDays = (): HoursSpec => Object.fromEntries(DAYS.map(([k]) => [k, { open: false, h24: false, ranges: [] }])) as unknown as HoursSpec;
export const cloneHours = (sp: HoursSpec): HoursSpec => JSON.parse(JSON.stringify(sp));

export function presetHours(id: string): HoursSpec {
  const sp = blankDays();
  DAYS.forEach(([k], i) => {
    if (id === '24') Object.assign(sp[k], { open: true, h24: true });
    else if (id === 'mon-sat' && i < 6) Object.assign(sp[k], { open: true, ranges: [{ from: '08:00', to: '14:00' }] });
    else if (id === 'weekday' && i < 5) Object.assign(sp[k], { open: true, ranges: [{ from: '08:00', to: '15:00' }] });
  });
  return sp;
}

export function parseHours(str: string | undefined | null): HoursSpec {
  const s0 = String(str || '').trim(), sp = blankDays(), short = DAYS.map(d => d[2]);
  if (!s0) return presetHours('weekday');
  let ok = false;
  s0.split(/;\s*/).forEach(seg => {
    let m = seg.match(/^Setiap hari\s+(.+)$/i), days: DayKey[], rest: string;
    if (m) { days = DAYS.map(d => d[0]); rest = m[1]; }
    else {
      m = seg.match(/^(Sen|Sel|Rab|Kam|Jum|Sab|Min)(?:\s*[–-]\s*(Sen|Sel|Rab|Kam|Jum|Sab|Min))?\s+(.+)$/);
      if (!m) return;
      const a = short.indexOf(m[1]), b = m[2] ? short.indexOf(m[2]) : a;
      days = [];
      for (let i = a; ; i = (i + 1) % 7) { days.push(DAYS[i][0]); if (i === b) break; }
      rest = m[3];
    }
    if (/^24 jam$/i.test(rest)) { days.forEach(k => Object.assign(sp[k], { open: true, h24: true, ranges: [] })); ok = true; return; }
    if (/^tutup$/i.test(rest)) { ok = true; return; }
    const ranges = [...rest.matchAll(/(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})/g)].map(r => ({ from: `${r[1].padStart(2, '0')}:${r[2]}`, to: `${r[3].padStart(2, '0')}:${r[4]}` }));
    if (!ranges.length) return;
    days.forEach(k => Object.assign(sp[k], { open: true, h24: false, ranges: ranges.map(r => ({ ...r })) }));
    ok = true;
  });
  return ok ? sp : presetHours('weekday');
}

export function formatHours(sp: HoursSpec) {
  const sig = (k: DayKey) => (!sp[k].open ? 'X' : sp[k].h24 ? '24' : sp[k].ranges.map(r => `${r.from}-${r.to}`).join(','));
  const txt = (k: DayKey) => (sp[k].h24 ? '24 jam' : sp[k].ranges.map(r => `${r.from.replace(':', '.')}–${r.to.replace(':', '.')}`).join(', '));
  if (sp.mon.open && DAYS.every(([k]) => sig(k) === sig('mon'))) return `Setiap hari ${txt('mon')}`;
  const groups: { sig: string; start: string; end: string; k: DayKey }[] = [];
  DAYS.forEach(([k, , sh]) => { const g = groups[groups.length - 1], sg = sig(k); if (g && g.sig === sg) g.end = sh; else groups.push({ sig: sg, start: sh, end: sh, k }); });
  const parts = groups.filter(g => g.sig !== 'X').map(g => `${g.start}${g.end !== g.start ? '–' + g.end : ''} ${txt(g.k)}`);
  return parts.length ? parts.join('; ') : 'Tutup';
}

export function hoursError(sp: HoursSpec) {
  if (!DAYS.some(([k]) => sp[k].open)) return 'Jam operasional: aktifkan minimal satu hari buka.';
  for (const [k, name] of DAYS) {
    const d = sp[k];
    if (!d.open || d.h24) continue;
    if (!d.ranges.length) return `Jam operasional ${name}: isi jam buka atau pilih 24 jam.`;
    const rs = [...d.ranges].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 0; i < rs.length; i++) {
      if (!rs[i].from || !rs[i].to) return `Jam operasional ${name}: lengkapi jam buka dan tutup.`;
      if (rs[i].to <= rs[i].from) return `Jam operasional ${name}: jam tutup harus setelah jam buka.`;
      if (i && rs[i].from < rs[i - 1].to) return `Jam operasional ${name}: rentang jam saling tumpang tindih.`;
    }
  }
  return '';
}
