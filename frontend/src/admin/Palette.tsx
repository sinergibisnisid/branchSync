// Palet perintah (⌘/Ctrl K): cari unit kerja, menu, atau aksi.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NAV_ITEMS, navItem } from '../lib/domain';
import { getApp, setApp, useApp, useOverlay } from '../store';
import { Ic } from './ui/Icon';
import { can, canView, copyLink, navigate, openDrawer, runSync } from './workspace';
import { locationForm } from './forms/LocationForm';
import { importModal } from './forms/ImportWizard';
import { pointForm } from './forms/ClaimForms';
import { shortcutsModal } from './AdminApp';

export const openPalette = () => useOverlay.setState({ palette: true });
const closePalette = () => useOverlay.setState({ palette: false });

interface Item { group: string; icon: string; label: string; sub: string; run: () => void }

export function Palette() {
  const open = useOverlay(s => s.palette);
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="bs-palette" id="bsPalette" aria-label="Pencarian cepat" onClose={() => { if (useOverlay.getState().palette) closePalette(); }} onClick={e => { if (e.target === e.currentTarget) closePalette(); }}>
      {open && <PaletteBody />}
    </dialog>
  );
}

function PaletteBody() {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const ws = useApp(s => s.ws);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const items = useMemo<Item[]>(() => {
    const k = q.trim().toLowerCase();
    const actions: [string, string, () => void, string?][] = [
      ['Tambah unit kerja', 'plus', () => locationForm(), 'locations.write'],
      ['Impor data Excel / CSV', 'upload', () => importModal(), 'locations.import'],
      ['Sinkronkan semua unit', 'refresh', () => { void runSync(null); }, 'sync.run'],
      ['Usulkan titik baru', 'pin', () => pointForm(), 'claims.manage'],
      ['Salin tautan halaman ini', 'link', () => { void copyLink(); }],
      ['Ganti tema terang/gelap', 'moon', () => setApp(s => { const cur = s.prefs.theme || (document.getElementById('adminPanel')?.dataset.theme ?? 'light'); s.prefs.theme = cur === 'dark' ? 'light' : 'dark'; })],
      ['Pintasan keyboard', 'keyboard', () => shortcutsModal()]
    ];
    const locs = k && ws ? ws.locations.filter(l => `${l.name} ${l.code} ${l.city}`.toLowerCase().includes(k)).slice(0, 8).map(l => ({ group: 'Unit kerja', icon: 'building', label: l.name, sub: `${l.code} · ${l.city}`, run: () => openDrawer(l.code) })) : [];
    const nav = NAV_ITEMS.filter(n => canView(n.id) && (!k || n.label.toLowerCase().includes(k))).map(n => ({ group: 'Menu', icon: n.icon, label: n.label, sub: n.parent ? navItem(n.parent).label : '', run: () => navigate(n.id) }));
    const acts = actions.filter(a => can(a[3]) && (!k || a[0].toLowerCase().includes(k))).map(([label, icon, run]) => ({ group: 'Aksi', icon, label, sub: '', run }));
    return [...locs, ...nav, ...acts];
  }, [q, ws]);
  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => { document.getElementById(`pal-${idx}`)?.scrollIntoView({ block: 'nearest' }); }, [idx]);
  const run = (i: number) => { const it = items[i]; if (!it) return; closePalette(); it.run(); };
  let lastGroup = '';
  void getApp;
  return (
    <>
      <div className="bs-pal-search"><Ic name="search" />
        <input ref={input} id="bsPalInput" type="text" role="combobox" aria-expanded="true" aria-controls="bsPalList" aria-autocomplete="list" aria-activedescendant={items.length ? `pal-${idx}` : ''} placeholder="Cari unit kerja, menu, atau aksi…" autoComplete="off"
          value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) setIdx((idx + 1) % items.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) setIdx((idx - 1 + items.length) % items.length); }
            else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
          }} /><kbd>Esc</kbd>
      </div>
      <div id="bsPalList" className="bs-pal-list" role="listbox">
        {items.length ? items.map((it, i) => {
          const g = it.group !== lastGroup ? <div className="bs-pal-group" role="presentation">{it.group}</div> : null;
          lastGroup = it.group;
          return <div key={`${it.group}:${it.label}:${i}`} style={{ display: 'contents' }}>{g}<div className="bs-pal-item" role="option" id={`pal-${i}`} aria-selected={i === idx} onClick={() => run(i)}><Ic name={it.icon} /><span>{it.label}{it.sub && <small>{it.sub}</small>}</span></div></div>;
        }) : <p className="bs-pal-empty">Tidak ada hasil untuk “{q.trim()}”.</p>}
      </div>
      <footer className="bs-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> pilih</span><span><kbd>Enter</kbd> buka</span></footer>
    </>
  );
}
