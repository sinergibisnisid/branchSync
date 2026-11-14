// Halaman Unit Kerja: cari, filter, tampilan tersimpan, kolom, aksi massal, ekspor, dan halaman.
import type { ReactNode } from 'react';
import { issueMap, type Issue } from '../../lib/data';
import { labelled, navItem, SL, STATUSES } from '../../lib/domain';
import { fmtNum } from '../../lib/format';
import type { Location } from '../../lib/types';
import { closeModal, getApp, openModal, setApp, setUi, toast, useApp } from '../../store';
import { announce } from '../announce';
import { bulkDelete, bulkStatus, exportLocations } from '../actions';
import { importModal } from '../forms/ImportWizard';
import { locationForm } from '../forms/LocationForm';
import { Badge, Btn, ChipRow, cx, menuKeys, Options, PageHead, Pop, Rows, SearchF, When, type Head, type RowSpec } from '../ui/components';
import { Ic } from '../ui/Icon';
import { confirmModal, Field, FormGrid, FormModal } from '../ui/Modal';
import { deniedMsg, openDrawer, runSync, useCan, useWs } from '../workspace';
import { FILTERS, filterSummary, locFiltered, optCount, QUICK, quickCount, sameFilters, up, updateUp, useUserPrefs, viewCount, viewFilters, type FilterKey, type SavedView } from './locationsModel';
import { LOC_SORTS } from '../route';

interface Col { key: string; label: string; sort?: string; required?: boolean; wrap?: boolean; cell: (l: Location, iss?: Issue[]) => ReactNode }
const LOC_COLS: Col[] = [
  { key: 'unit', label: 'Unit kerja', sort: 'name', required: true, cell: l => <button type="button" className="bs-cell-link" onClick={() => openDrawer(l.code)}><strong>{l.name}</strong><small>{l.code} · {l.type}</small></button> },
  { key: 'location', label: 'Lokasi', sort: 'city', cell: l => <>{l.city}<small>{l.province}</small></> },
  { key: 'region', label: 'Region', sort: 'region', cell: l => l.region },
  { key: 'type', label: 'Tipe', sort: 'type', cell: l => l.type },
  { key: 'status', label: 'Status', sort: 'status', cell: l => <Badge s={l.status} /> },
  { key: 'gbp', label: 'Status GBP', sort: 'gbp', cell: l => <Badge s={l.gbp} /> },
  { key: 'google', label: 'Data Google', sort: 'issues', cell: (l, iss) => (iss ? <button type="button" className="bs-issue" onClick={() => openDrawer(l.code, 'compare')}><Ic name="alert" />{iss.length} beda</button> : l.google ? <span className="bs-ok"><Ic name="check" />Sesuai</span> : <span className="bs-muted">Belum ada listing</span>) },
  { key: 'phone', label: 'Telepon', cell: l => l.phone || '—' },
  { key: 'hours', label: 'Jam operasional', wrap: true, cell: l => l.hours || '—' },
  { key: 'address', label: 'Alamat', wrap: true, cell: l => l.address || '—' },
  { key: 'lastSync', label: 'Sinkron terakhir', sort: 'lastSync', cell: l => (l.lastSync ? <When t={l.lastSync} /> : <span className="bs-muted">Belum pernah</span>) },
  { key: 'updated', label: 'Diperbarui', sort: 'updatedAt', cell: l => <><When t={l.updatedAt} /><small>{l.updatedBy}</small></> }
];
const LOC_COLS_DEFAULT = ['unit', 'location', 'status', 'gbp', 'google', 'updated'];
const visibleCols = () => { const c = up().cols; const set = new Set(Array.isArray(c) && c.length ? c : LOC_COLS_DEFAULT); return LOC_COLS.filter(x => x.required || set.has(x.key)); };

const setPop = (name: string) => setUi(ui => { ui.pop = name; });

function applySavedView(v: SavedView) {
  setUi(ui => {
    Object.assign(ui.loc, { q: v.filters.q || '', quick: v.filters.quick || 'all', status: [...(v.filters.status || [])], region: [...(v.filters.region || [])], type: [...(v.filters.type || [])], gbp: [...(v.filters.gbp || [])], sort: LOC_SORTS.includes(v.filters.sort) ? v.filters.sort : 'name', dir: v.filters.dir === -1 ? -1 : 1, page: 1 });
    ui.loc.selected.clear(); ui.pop = '';
  });
}
function saveViewModal(ex?: SavedView) {
  const cur = viewFilters(getApp().ui.loc);
  openModal(
    <FormModal title={ex ? 'Ganti nama tampilan' : 'Simpan tampilan'} submit={ex ? 'Simpan nama' : 'Simpan tampilan'} onSubmit={fd => {
      const name = String(fd.get('name') || '').trim();
      if (!name) return { name: 'Wajib diisi.' };
      if (up().views.some(x => x !== ex && x.name.toLowerCase() === name.toLowerCase())) return { name: 'Nama tampilan sudah dipakai.' };
      if (!ex && up().views.length >= 20) return 'Maksimal 20 tampilan tersimpan.';
      updateUp(u => {
        if (ex) { const v = u.views.find(x => x.id === ex.id); if (v) v.name = name; }
        else u.views.push({ id: `v${Date.now().toString(36)}`, name, pinned: fd.has('pin'), filters: cur, createdAt: Date.now() });
      });
      toast(ex ? 'Nama tampilan diperbarui.' : `Tampilan “${name}” disimpan.`, { tone: 'good' });
    }}>
      <FormGrid>
        <Field name="name" label="Nama tampilan" value={ex ? ex.name : ''} full hint="Contoh: KCP Jawa bermasalah" maxLength={60} />
        {!ex && <Field name="pin" label="Sematkan di tampilan cepat" type="checkbox" value full />}
      </FormGrid>
      {!ex && <p className="bs-form-help">Filter yang disimpan: <b>{filterSummary(cur)}</b></p>}
    </FormModal>
  );
}
function deleteView(v: SavedView) {
  confirmModal(`Hapus tampilan “${v.name}”?`, 'Hanya tampilan tersimpan yang dihapus; data unit kerja tidak berubah.', 'Hapus tampilan', () => {
    const at = up().views.findIndex(x => x.id === v.id);
    updateUp(u => { u.views = u.views.filter(x => x.id !== v.id); });
    toast(`Tampilan “${v.name}” dihapus.`, { action: { label: 'Urungkan', run: () => { updateUp(u => { if (!u.views.some(x => x.id === v.id)) u.views.splice(Math.min(at, u.views.length), 0, v); }); toast(`Tampilan “${v.name}” dikembalikan.`); } } });
  }, { undo: 'any' });
}

function ExportMenu({ scope }: { scope: 'all' | 'sel' }) {
  const pop = useApp(s => s.ui.pop);
  const nSel = useApp(s => s.ui.loc.selected.size);
  const name = `export-${scope}`;
  const go = (fmt: 'csv' | 'xlsx') => {
    setPop('');
    const s = getApp(), w = s.ws!;
    void exportLocations(scope === 'sel' ? w.locations.filter(x => s.ui.loc.selected.has(x.code)) : locFiltered(w, s.ui.loc), scope === 'sel' ? 'branchsync-unit-terpilih' : 'branchsync-unit-kerja', fmt);
  };
  return (
    <Pop name={name} open={pop === name} setOpen={setPop} cls="bs-filter bs-export" summaryCls={cx('bs-btn', scope === 'sel' && 'sm')} summary={<><Ic name="download" /><span>Ekspor</span><Ic name="chevD" /></>}>
      <div className="bs-popover bs-export-panel" role="menu" aria-label="Format ekspor" onKeyDown={menuKeys}>
        <div className="bs-pop-head" role="presentation"><strong>{scope === 'sel' ? `Ekspor ${fmtNum(nSel)} unit terpilih` : 'Ekspor hasil filter'}</strong></div>
        <button type="button" className="bs-menu-item sm" role="menuitem" onClick={() => go('xlsx')}><Ic name="file" /><span><strong>Excel (.xlsx)</strong><small>Kolom rapi, koordinat tersimpan sebagai angka</small></span></button>
        <button type="button" className="bs-menu-item sm" role="menuitem" onClick={() => go('csv')}><Ic name="file" /><span><strong>CSV</strong><small>Untuk Google Sheets dan sistem lain</small></span></button>
      </div>
    </Pop>
  );
}

export function Locations() {
  const ws = useWs();
  const f = useApp(s => s.ui.loc);
  const pop = useApp(s => s.ui.pop);
  const size = useApp(s => Number(s.prefs.pageSize) || 10);
  useUserPrefs(s => s.rev);
  const canWrite = useCan('locations.write');
  const U = up(), cols = visibleCols(), dense = U.density === 'compact';
  const all = locFiltered(ws, f), im = issueMap(ws);
  const pages = Math.max(1, Math.ceil(all.length / size));
  const page = Math.min(Math.max(1, f.page), pages);
  const rows = all.slice((page - 1) * size, page * size);
  const activeFilters = FILTERS.flatMap(([k, l]) => f[k].map(v => [k, l, v] as const));
  const cur = viewFilters(f), pinned = U.views.filter(v => v.pinned), activeView = U.views.find(v => sameFilters(v.filters, cur));
  const pageAllSel = rows.length > 0 && rows.every(l => f.selected.has(l.code));
  const setLoc = (fn: (l: typeof f) => void) => setUi(ui => { fn(ui.loc); });
  const selectPage = (on: boolean) => setLoc(l => rows.forEach(r => (on ? l.selected.add(r.code) : l.selected.delete(r.code))));
  const th = (c: Col): Head => {
    if (!c.sort) return c.label;
    const on = f.sort === c.sort;
    return [c.label, <button key={c.key} type="button" className="bs-sort" aria-label={`Urutkan menurut ${c.label}`} onClick={() => setLoc(l => { l.dir = l.sort === c.sort ? (l.dir === 1 ? -1 : 1) : 1; l.sort = c.sort!; })}>{c.label}<span aria-hidden="true">{on ? (f.dir > 0 ? '↑' : '↓') : '↕'}</span></button>];
  };
  const heads: Head[] = [['', <input key="all" type="checkbox" className="bs-check" aria-label="Pilih semua di halaman ini" checked={pageAllSel} onChange={e => selectPage(e.target.checked)} />], ...cols.map(th), ['Aksi', <span key="a" className="bs-sr">Aksi</span>]];
  const body: RowSpec[] = rows.map(l => {
    const iss = im.get(l.code), sel = f.selected.has(l.code);
    return {
      key: l.code, cls: sel ? 'is-selected' : undefined,
      cells: [
        { c: <input type="checkbox" className="bs-check" aria-label={`Pilih ${l.name}`} checked={sel} onChange={e => setLoc(x => (e.target.checked ? x.selected.add(l.code) : x.selected.delete(l.code)))} />, cls: 'bs-td-check' },
        ...cols.map(c => ({ c: c.cell(l, iss), cls: c.wrap ? 'bs-td-wrap' : c.key === 'unit' ? 'bs-td-title' : undefined })),
        { c: <Btn icon="edit" variant="icon ghost" title={`Edit ${l.name}`} perm="locations.write" onClick={() => locationForm(l.code)} />, cls: 'bs-td-actions' }
      ]
    };
  });
  const pageBtns: (number | '…')[] = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) pageBtns.push(p); else if (pageBtns[pageBtns.length - 1] !== '…') pageBtns.push('…');
  const sortOpts = LOC_COLS.filter(c => c.sort).flatMap(c => [[`${c.sort}:1`, `${c.label} (naik)`], [`${c.sort}:-1`, `${c.label} (turun)`]] as [string, string][]);
  const announceCount = () => requestAnimationFrame(() => announce(`${fmtNum(locFiltered(getApp().ws!, getApp().ui.loc).length)} unit cocok.`));
  const resetAll = () => { setLoc(l => { FILTERS.forEach(([k]) => { l[k] = []; }); l.q = ''; l.page = 1; }); announceCount(); };

  return <>
    <PageHead title="Unit Kerja" desc={navItem('locations').desc} actions={<>
      <Btn label="Impor data" icon="upload" title="Impor dari Excel (.xlsx) atau CSV" perm="locations.import" onClick={() => importModal()} />
      <ExportMenu scope="all" />
      <Btn label="Tambah unit" icon="plus" variant="primary" perm="locations.write" onClick={() => locationForm()} />
    </>} />
    <section className={cx('bs-card bs-loc-card', f.selected.size > 0 && 'has-bulk')}><div className="bs-card-body flush">
      <div className="bs-segment" role="tablist" aria-label="Tampilan cepat">
        {QUICK.map(([v, l], i) => (
          <button key={v} type="button" role="tab" aria-selected={f.quick === v && !activeView} tabIndex={(activeView ? i === 0 && !pinned.includes(activeView) : f.quick === v) ? 0 : -1}
            onClick={() => { setLoc(x => { x.quick = v; x.page = 1; }); announceCount(); }}>{l}<span>{fmtNum(quickCount(ws, v))}</span></button>
        ))}
        {pinned.map(v => <button key={v.id} type="button" role="tab" className="bs-seg-pinned" aria-selected={activeView === v} tabIndex={activeView === v ? 0 : -1} onClick={() => applySavedView(v)}><Ic name="pin" />{v.name}<span>{fmtNum(viewCount(ws, v.filters))}</span></button>)}
      </div>
      <div className="bs-toolbar bs-loc-toolbar">
        <SearchF label="Cari unit kerja" value={f.q} ph="Nama, kode, kota, provinsi, atau alamat…  ( / )" id="bsLocQ" onChange={v => { setLoc(l => { l.q = v; l.page = 1; }); announceCount(); }} />
        <Pop name="filter" open={pop === 'filter'} setOpen={setPop} summary={<><Ic name="filter" /><span>Filter{activeFilters.length ? ` (${activeFilters.length})` : ''}</span></>}>
          <div className="bs-popover bs-filter-panel">
            {FILTERS.map(([k, l, xs]) => (
              <fieldset key={k}><legend>{l}</legend>{xs.map(v => (
                <label key={v} className="bs-checkline"><input type="checkbox" value={v} checked={f[k].includes(v)} onChange={e => { setLoc(x => { x[k] = e.target.checked ? [...new Set([...x[k], v])] : x[k].filter(y => y !== v); x.page = 1; }); announceCount(); }} /><span>{SL(v)}</span><small>{fmtNum(optCount(ws, k, v))}</small></label>
              ))}</fieldset>
            ))}
            <div className="bs-filter-foot"><Btn label="Hapus filter" variant="sm ghost" onClick={() => setLoc(x => { FILTERS.forEach(([k]) => { x[k] = []; }); x.page = 1; })} /><Btn label="Selesai" variant="sm primary" onClick={() => setPop('')} /></div>
          </div>
        </Pop>
        <Pop name="views" open={pop === 'views'} setOpen={setPop} summaryCls={cx('bs-btn', activeView && 'is-current')} summary={<><Ic name="star" /><span>{activeView ? activeView.name : 'Tampilan'}</span><Ic name="chevD" /></>}>
          <div className="bs-popover bs-views-panel">
            <div className="bs-pop-head"><strong>Tampilan tersimpan</strong><small>Simpan kombinasi filter untuk dipakai lagi</small></div>
            {U.views.length ? <ul className="bs-views-list">{U.views.map(v => (
              <li key={v.id} className={activeView === v ? 'is-active' : ''}>
                <button type="button" className="bs-view-apply" onClick={() => applySavedView(v)}><strong>{v.name}</strong><small>{filterSummary(v.filters)} · {fmtNum(viewCount(ws, v.filters))} unit</small></button>
                <Btn icon="pin" variant={cx('icon sm ghost', v.pinned && 'is-on')} title={v.pinned ? `Lepas sematan ${v.name}` : `Sematkan ${v.name}`} aria-pressed={v.pinned} onClick={() => { updateUp(u => { const x = u.views.find(y => y.id === v.id); if (x) x.pinned = !x.pinned; }); toast(!v.pinned ? `“${v.name}” disematkan di tampilan cepat.` : `Sematan “${v.name}” dilepas.`); }} />
                <Btn icon="edit" variant="icon sm ghost" title={`Ganti nama ${v.name}`} onClick={() => saveViewModal(v)} />
                <Btn icon="trash" variant="icon sm ghost" title={`Hapus ${v.name}`} onClick={() => deleteView(v)} />
              </li>
            ))}</ul> : <p className="bs-muted bs-pop-empty">Belum ada tampilan tersimpan. Atur filter, lalu klik “Simpan tampilan saat ini”.</p>}
            <div className="bs-filter-foot"><Btn label="Simpan tampilan saat ini" icon="plus" variant="sm primary" disabled={!!activeView} title={activeView ? 'Filter ini sudah tersimpan' : undefined} onClick={() => saveViewModal()} /></div>
          </div>
        </Pop>
        <Pop name="cols" open={pop === 'cols'} setOpen={setPop} summary={<><Ic name="sliders" /><span>Atur kolom</span></>}>
          <div className="bs-popover bs-cols-panel">
            <fieldset><legend>Tampilkan kolom</legend>{LOC_COLS.map(c => (
              <label key={c.key} className="bs-checkline"><input type="checkbox" checked={cols.includes(c)} disabled={c.required} onChange={e => { const keys = visibleCols().map(x => x.key); updateUp(u => { u.cols = e.target.checked ? [...new Set([...keys, c.key])] : keys.filter(k => k !== c.key); }); }} /><span>{c.label}</span>{c.required && <small>wajib</small>}</label>
            ))}</fieldset>
            <fieldset><legend>Kepadatan baris</legend>
              <label className="bs-checkline"><input type="radio" name="bs-density" checked={!dense} onChange={() => updateUp(u => { u.density = 'comfortable'; })} /><span>Longgar</span></label>
              <label className="bs-checkline"><input type="radio" name="bs-density" checked={dense} onChange={() => updateUp(u => { u.density = 'compact'; })} /><span>Padat</span></label>
            </fieldset>
            <div className="bs-filter-foot"><Btn label="Reset ke default" variant="sm ghost" onClick={() => updateUp(u => { u.cols = null; u.density = 'comfortable'; })} /><Btn label="Selesai" variant="sm primary" onClick={() => setPop('')} /></div>
          </div>
        </Pop>
      </div>
      <div className="bs-loc-mobilebar bs-mobile-only">
        <label className="bs-field"><span>Urutkan</span><select value={`${f.sort}:${f.dir}`} onChange={e => { const [k, d] = e.target.value.split(':'); if (LOC_SORTS.includes(k)) setLoc(l => { l.sort = k; l.dir = d === '-1' ? -1 : 1; l.page = 1; }); }}><Options xs={sortOpts} /></select></label>
        <label className="bs-checkline bs-select-page"><input type="checkbox" className="bs-check" checked={pageAllSel} onChange={e => selectPage(e.target.checked)} /><span>Pilih semua di halaman ini</span></label>
      </div>
      <ChipRow onReset={resetAll} chips={[
        ...(f.q.trim() ? [{ key: 'q', label: 'Kata kunci', value: f.q.trim(), onRemove: () => setLoc(l => { l.q = ''; l.page = 1; }) }] : []),
        ...activeFilters.map(([k, l, v]) => ({ key: `${k}:${v}`, label: l, value: SL(v), onRemove: () => setLoc(x => { x[k as FilterKey] = x[k as FilterKey].filter(y => y !== v); x.page = 1; }) }))
      ]} />
      {f.selected.size > 0 && (
        <div className="bs-bulkbar" role="region" aria-label="Aksi massal">
          <strong>{fmtNum(f.selected.size)} dipilih</strong>
          {f.selected.size < all.length && <Btn label={`Pilih semua ${fmtNum(all.length)} hasil`} variant="sm ghost" onClick={() => { setLoc(l => all.forEach(r => l.selected.add(r.code))); announce(`${fmtNum(all.length)} unit dipilih.`); }} />}
          <span className="bs-spacer" />
          <label className="bs-inline-select"><span className="bs-sr">Ubah status</span>
            <select value="" disabled={!canWrite} title={canWrite ? undefined : deniedMsg('locations.write')} onChange={e => { void bulkStatus(e.target.value); }}><option value="">Ubah status…</option><Options xs={labelled(STATUSES)} /></select></label>
          <Btn label="Sinkronkan" icon="refresh" variant="sm" perm="sync.run" onClick={() => runSync([...f.selected], { label: `${f.selected.size} unit terpilih` })} />
          <ExportMenu scope="sel" />
          <Btn label="Hapus" icon="trash" variant="sm danger" perm="locations.write" onClick={bulkDelete} />
          <Btn icon="x" variant="sm icon ghost" title="Batalkan pilihan" onClick={() => { setLoc(l => l.selected.clear()); announce('Pilihan dibatalkan.'); (document.querySelector('#bsPage [data-search]') as HTMLElement | null)?.focus(); }} />
        </div>
      )}
      <div className={cx('bs-table-wrap bs-table-scroll', dense && 'is-dense')} tabIndex={0} role="region" aria-label="Tabel data">
        <table className="bs-table bs-cards">
          <thead><tr>{heads.map((h, i) => <th key={i} scope="col">{Array.isArray(h) ? h[1] : h}</th>)}</tr></thead>
          <tbody>{body.length ? <Rows heads={heads} rows={body} /> : (
            <tr><td className="bs-td-empty" colSpan={heads.length}><div className="bs-empty-inline"><Ic name="search" /><strong>Tidak ada unit yang cocok</strong>
              <span>Ubah kata kunci atau {f.q || activeFilters.length || f.quick !== 'all' ? <button type="button" className="bs-inline-link" onClick={() => setLoc(l => { FILTERS.forEach(([k]) => { l[k] = []; }); l.q = ''; l.quick = 'all'; l.page = 1; })}>hapus semua filter</button> : 'tambahkan unit baru'}.</span></div></td></tr>
          )}</tbody>
        </table>
      </div>
      <div className="bs-pagination">
        <span>Menampilkan <b>{all.length ? (page - 1) * size + 1 : 0}–{Math.min(page * size, all.length)}</b> dari <b>{fmtNum(all.length)}</b> unit</span>
        <label className="bs-inline-select"><span>Baris</span><select value={size} onChange={e => { const n = Number(e.target.value); setApp(s => { s.prefs.pageSize = n; s.ui.loc.page = 1; }); }}><Options xs={[10, 25, 50, 100]} /></select></label>
        <div className="bs-pager">
          <Btn icon="chevL" variant="icon sm" title="Halaman sebelumnya" disabled={page <= 1} onClick={() => setLoc(l => { l.page = page - 1; })} />
          {pageBtns.map((p, i) => p === '…' ? <span key={`e${i}`} className="bs-ellipsis">…</span> : <button key={p} type="button" className={cx('bs-btn sm', p === page && 'is-current')} aria-current={p === page ? 'page' : undefined} onClick={() => { setLoc(l => { l.page = p; }); document.querySelector('#bsMain .bs-table-wrap')?.scrollIntoView({ block: 'nearest' }); }}>{p}</button>)}
          <Btn icon="chev" variant="icon sm" title="Halaman berikutnya" disabled={page >= pages} onClick={() => setLoc(l => { l.page = page + 1; })} />
        </div>
      </div>
    </div></section>
  </>;
}

export { closeModal };
