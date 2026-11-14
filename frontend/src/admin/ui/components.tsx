/*
 * Komponen antarmuka admin. Struktur & class CSS sama dengan versi sebelumnya (admin.css dipakai apa adanya).
 */
import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type KeyboardEvent } from 'react';
import { DAY, SL, TONE } from '../../lib/domain';
import { fmtDate, fmtNum, fmtRel } from '../../lib/format';
import type { Change } from '../../lib/types';
import { deniedMsg, guard, navigate, useCan } from '../workspace';
import type { ViewId } from '../../lib/domain';
import { Ic } from './Icon';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

/* ---------- Badge ---------- */
export function Badge({ s, label }: { s: string; label?: string }) {
  return <span className="bs-badge" data-tone={TONE[s] || 'neutral'}><i aria-hidden="true" />{label ?? SL(s)}</span>;
}

/* ---------- Tombol ---------- */
type BtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & {
  label?: ReactNode; icon?: string; variant?: string; title?: string; perm?: string;
};
/** Tombol baku. `perm`: tombol tampil nonaktif (dengan alasan) bila pengguna tidak punya izin. */
export function Btn({ label, icon, variant = '', title, perm, onClick, className, type = 'button', ...rest }: BtnProps) {
  const allowed = useCan(perm);
  const denied = !!perm && !allowed;
  return (
    <button
      type={type}
      className={cx('bs-btn', variant, denied && 'is-denied', className)}
      title={denied ? deniedMsg(perm!) : title}
      aria-label={title}
      aria-disabled={denied || undefined}
      onClick={e => { if (denied) { e.preventDefault(); guard(perm); return; } onClick?.(e); }}
      {...rest}
    >
      {icon && <Ic name={icon} />}{label != null && label !== '' && <span>{label}</span>}
    </button>
  );
}
/** Tombol menuju halaman lain. */
export function Go({ label, view, variant = 'sm ghost' }: { label: ReactNode; view: ViewId; variant?: string }) {
  return <button type="button" className={cx('bs-btn', variant)} onClick={() => navigate(view)}><span>{label}</span><Ic name="chev" /></button>;
}
export function InlineLink({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return <button type="button" className="bs-inline-link" onClick={onClick} title={title}>{children}</button>;
}

/* ---------- Kartu, kepala halaman, kosong ---------- */
export function Card({ title, sub, actions, cls = '', flush = false, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; cls?: string; flush?: boolean; children: ReactNode }) {
  return (
    <section className={cx('bs-card', cls)}>
      <header className="bs-card-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{actions && <div className="bs-card-actions">{actions}</div>}</header>
      <div className={cx('bs-card-body', flush && 'flush')}>{children}</div>
    </section>
  );
}
export function PageHead({ title, desc, actions }: { title: ReactNode; desc: ReactNode; actions?: ReactNode }) {
  return <div className="bs-page-head"><div><h1 id="bsTitle" tabIndex={-1}>{title}</h1><p>{desc}</p></div>{actions && <div className="bs-page-actions">{actions}</div>}</div>;
}
export function EmptyState({ title, text, cta, icon = 'check' }: { title: ReactNode; text: ReactNode; cta?: ReactNode; icon?: string }) {
  return <div className="bs-empty-state"><Ic name={icon} /><strong>{title}</strong><p>{text}</p>{cta}</div>;
}
export function Callout({ tone, icon = 'info', children }: { tone?: string; icon?: string; children: ReactNode }) {
  return <div className="bs-callout" data-tone={tone}><Ic name={icon} /><p>{children}</p></div>;
}

/* ---------- Tab (roving tabindex, ←/→/Home/End) ---------- */
const slug = (s: string) => s.replace(/\W+/g, '-');
export function Tabs({ bind, items, cur, onChange, label }: { bind: string; items: [string, ReactNode, number?][]; cur: string; onChange: (v: string) => void; label?: string }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || e.altKey || e.metaKey || e.ctrlKey) return;
    const i = items.findIndex(x => x[0] === cur);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    e.preventDefault();
    onChange(items[j][0]);
    requestAnimationFrame(() => document.getElementById(`bs-tab-${slug(bind)}-${slug(items[j][0] || 'all')}`)?.focus());
  };
  return (
    <div className="bs-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map(([v, l, n]) => (
        <button key={v} type="button" role="tab" id={`bs-tab-${slug(bind)}-${slug(v || 'all')}`} aria-selected={v === cur} aria-controls={`bs-panel-${slug(bind)}`} tabIndex={v === cur ? 0 : -1} onClick={() => onChange(v)}>
          {l}{n != null && <span className="bs-tab-count">{fmtNum(n)}</span>}
        </button>
      ))}
    </div>
  );
}
export function TabPanel({ bind, cur, cls = '', children }: { bind: string; cur: string; cls?: string; children: ReactNode }) {
  return <div role="tabpanel" className={cx('bs-tabpanel', cls)} id={`bs-panel-${slug(bind)}`} aria-labelledby={`bs-tab-${slug(bind)}-${slug(cur || 'all')}`}>{children}</div>;
}

/* ---------- Tabel (di layar kecil tampil sebagai kartu: setiap sel diberi data-label) ---------- */
export type Head = string | [label: string, node: ReactNode];
export type CellSpec = ReactNode | { c: ReactNode; cls?: string; th?: boolean };
export interface RowSpec { key: string | number; cls?: string; cells: CellSpec[] }
const isCellObj = (x: CellSpec): x is { c: ReactNode; cls?: string; th?: boolean } => !!x && typeof x === 'object' && 'c' in (x as object);
export function Rows({ heads, rows }: { heads: Head[]; rows: RowSpec[] }) {
  const labels = heads.map(h => (Array.isArray(h) ? h[0] : h));
  return <>{rows.map(r => (
    <tr key={r.key} className={r.cls}>
      {r.cells.map((c, i) => {
        const o = isCellObj(c) ? c : { c, cls: undefined, th: false };
        return o.th ? <th key={i} scope="row" className={o.cls} data-label={labels[i] || ''}>{o.c}</th> : <td key={i} className={o.cls} data-label={labels[i] || ''}>{o.c}</td>;
      })}
    </tr>
  ))}</>;
}
export function Table({ heads, rows, empty = 'Tidak ada data.', cls = '', label = 'Tabel data' }: { heads: Head[]; rows: RowSpec[]; empty?: ReactNode; cls?: string; label?: string }) {
  return (
    <div className={cx('bs-table-wrap', cls)} tabIndex={0} role="region" aria-label={label}>
      <table className="bs-table bs-cards">
        <thead><tr>{heads.map((h, i) => <th key={i} scope="col">{Array.isArray(h) ? h[1] : h}</th>)}</tr></thead>
        <tbody>{rows.length ? <Rows heads={heads} rows={rows} /> : <tr><td className="bs-td-empty" colSpan={heads.length}>{empty}</td></tr>}</tbody>
      </table>
    </div>
  );
}
export const SrOnly = ({ children }: { children: ReactNode }) => <span className="bs-sr">{children}</span>;
export const ActionsHead: Head = ['Aksi', <SrOnly key="a">Aksi</SrOnly>];

export function KV({ pairs }: { pairs: [ReactNode, ReactNode][] }) {
  return <dl className="bs-kv">{pairs.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
export function DiffList({ changes }: { changes: Change[] }) {
  return (
    <ul className="bs-diff">{changes.map((c, i) => (
      <li key={i}><span className="bs-diff-field">{c.field}</span><del>{String(c.before ?? '') || <em>kosong</em>}</del><Ic name="arrowR" /><ins>{String(c.after ?? '') || <em>kosong</em>}</ins></li>
    ))}</ul>
  );
}

/* ---------- Tanggal (pola baku) ---------- */
const iso = (t: number) => new Date(t).toISOString();
/** Daftar/tabel: relatif + tooltip absolut. */
export const When = ({ t }: { t: number | null | undefined }) => (t ? <time dateTime={iso(t)} title={fmtDate(t)}>{fmtRel(t)}</time> : <>—</>);
/** Kolom “Waktu”: relatif + baris kecil absolut. */
export const WhenCell = ({ t }: { t: number | null | undefined }) => (t ? <><When t={t} /><small>{fmtDate(t, { dateStyle: 'short', timeStyle: 'short' })}</small></> : <>—</>);
/** Detail: absolut (+ relatif bila < 7 hari). */
export const WhenFull = ({ t }: { t: number | null | undefined }) => (t ? <><time dateTime={iso(t)}>{fmtDate(t)}</time>{Date.now() - t < 7 * DAY && <> <span className="bs-rel">({fmtRel(t)})</span></>}</> : <>—</>);

/* ---------- Metrik & grafik kecil ---------- */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96, h = 36, max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
  const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const last = pts[pts.length - 1];
  return <svg className="bs-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><polygon points={`0,${h} ${line} ${w},${h}`} /><polyline points={line} /><circle cx={last[0]} cy={last[1]} r="2.5" /></svg>;
}
export function Metric({ label, value, note = '', tone = '', spark, view, icon }: { label: string; value: ReactNode; note?: ReactNode; tone?: string; spark?: number[]; view?: ViewId; icon?: string }) {
  return (
    <article className="bs-metric" data-tone={tone || undefined}>
      <div className="bs-metric-head"><span>{label}</span>{icon && <Ic name={icon} />}</div>
      <div className="bs-metric-body"><div><strong>{value}</strong><small>{note}</small></div>{spark && <Sparkline values={spark} />}</div>
      {view && <button type="button" className="bs-stretch" onClick={() => navigate(view)} aria-label={`Buka ${label}`} />}
    </article>
  );
}
export const Bar = ({ n, max, label }: { n: number; max: number; label: string }) => (
  <span className="bs-bar-track" role="img" aria-label={label}><span style={{ width: `${max ? Math.max(2, (n / max) * 100) : 0}%` }} /></span>
);
export const Stars = ({ n }: { n: number }) => (
  <span className="bs-stars" role="img" aria-label={`${n} dari 5 bintang`}>{'★'.repeat(n)}<span aria-hidden="true">{'★'.repeat(Math.max(0, 5 - n))}</span></span>
);

/* ---------- Kontrol filter ---------- */
export type Opt = string | number | [string | number, string];
export const Options = ({ xs, all }: { xs: readonly Opt[]; all?: string }) => <>
  {all != null && <option value="">{all}</option>}
  {xs.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return <option key={String(v)} value={String(v)}>{String(l)}</option>; })}
</>;
export function SelectF({ label, xs, value, onChange, all = 'Semua' }: { label: string; xs: readonly Opt[]; value: string; onChange: (v: string) => void; all?: string | null }) {
  return <label className="bs-field"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}><Options xs={xs} all={all ?? undefined} /></select></label>;
}
/** Kolom cari dengan jeda 140 ms (seperti sebelumnya). Tombol "/" memfokuskan kolom ini (data-search). */
export function SearchF({ label, value, onChange, ph, id }: { label: string; value: string; onChange: (v: string) => void; ph: string; id: string }) {
  const [v, setV] = useState(value);
  const timer = useRef(0);
  useEffect(() => { setV(cur => (cur === value ? cur : value)); }, [value]);
  return (
    <label className="bs-field bs-grow"><span>{label}</span>
      <span className="bs-input-ic"><Ic name="search" />
        <input type="search" id={id} data-search value={v} placeholder={ph} autoComplete="off"
          onChange={e => { const nv = e.target.value; setV(nv); clearTimeout(timer.current); timer.current = window.setTimeout(() => onChange(nv), 140); }} />
      </span>
    </label>
  );
}
export interface Chip { key: string; label: string; value: string; onRemove: () => void }
export function ChipRow({ chips, onReset }: { chips: Chip[]; onReset: () => void }) {
  if (!chips.length) return null;
  return (
    <div className="bs-chips" role="group" aria-label="Filter aktif">
      {chips.map(c => (
        <button key={c.key} type="button" className="bs-chip" aria-label={`Hapus filter ${c.label}: ${c.value}`} onClick={() => { c.onRemove(); requestAnimationFrame(() => ((document.querySelector('#bsPage .bs-chips .bs-chip') || document.querySelector('#bsPage [data-search]')) as HTMLElement | null)?.focus()); }}>
          <span>{c.label}: <b>{c.value}</b></span><Ic name="x" />
        </button>
      ))}
      <Btn label="Reset filter" icon="x" variant="sm ghost" onClick={() => { onReset(); requestAnimationFrame(() => (document.querySelector('#bsPage [data-search]') as HTMLElement | null)?.focus()); }} />
    </div>
  );
}

/** Popover berbasis <details> (Filter, Tampilan, Kolom, Ekspor). Hanya satu terbuka; Esc/klik di luar menutup. */
export function Pop({ name, open, setOpen, summary, summaryCls = 'bs-btn', cls = 'bs-filter', children }: { name: string; open: boolean; setOpen: (name: string) => void; summary: ReactNode; summaryCls?: string; cls?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(''); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setOpen(''); ref.current?.querySelector('summary')?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, setOpen]);
  return (
    <details ref={ref} className={cls} data-pop={name} open={open} onToggle={e => { const o = (e.target as HTMLDetailsElement).open; if (o !== open) setOpen(o ? name : ''); }}>
      <summary className={summaryCls} onClick={e => { e.preventDefault(); setOpen(open ? '' : name); }}>{summary}</summary>
      {children}
    </details>
  );
}
/** Navigasi ↑/↓/Home/End untuk item role="menuitem" di dalam popover. */
export function menuKeys(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : i < 0 ? (e.key === 'ArrowUp' ? items.length - 1 : 0) : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[j].focus();
}
