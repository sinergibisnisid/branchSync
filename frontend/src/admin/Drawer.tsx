// Panel detail unit (drawer): ringkasan, perbandingan Google, ulasan, riwayat, sinkronisasi.
import { useLayoutEffect, useRef } from 'react';
import { byCode, issuesOf } from '../lib/data';
import { FIELD_LABEL } from '../lib/domain';
import { fmtDist, fmtRel, initials } from '../lib/format';
import { setUi, useApp } from '../store';
import { Badge, Btn, DiffList, EmptyState, KV, Table, TabPanel, Tabs, When, WhenFull } from './ui/components';
import { Ic } from './ui/Icon';
import { closeDrawer, copyLink, runSync } from './workspace';
import { deleteLocation, resolveDisc } from './actions';
import { locationForm } from './forms/LocationForm';
import { RatingSummary, ReviewCard, openReviewsFor } from './views/Reviews';

let trigger: HTMLElement | null = null;

export function Drawer() {
  const drawer = useApp(s => s.ui.drawer);
  const ws = useApp(s => s.ws);
  const ref = useRef<HTMLDialogElement>(null);
  const l = drawer && ws ? byCode(ws).get(drawer.code) : null;
  useLayoutEffect(() => {
    const d = ref.current; if (!d) return;
    if (l && !d.open) { trigger = document.activeElement as HTMLElement | null; d.showModal(); }
    if (!l && d.open) d.close();
    if (drawer && ws && !l) closeDrawer(); // unit sudah dihapus
  }, [l, drawer, ws]);
  return (
    <dialog ref={ref} className="bs-sheet" id="bsDrawer" aria-labelledby="bsDrawerTitle"
      onClose={() => {
        closeDrawer();
        const t = trigger; trigger = null;
        requestAnimationFrame(() => { if (t && t.isConnected) t.focus({ preventScroll: true }); else document.getElementById('bsTitle')?.focus({ preventScroll: true }); });
      }}
      onClick={e => { if (e.target === e.currentTarget) closeDrawer(); }}>
      {l && ws && drawer && <DrawerBody code={l.code} tab={drawer.tab} />}
    </dialog>
  );
}

function DrawerBody({ code, tab }: { code: string; tab: string }) {
  const ws = useApp(s => s.ws)!;
  const running = useApp(s => s.running);
  const l = byCode(ws).get(code)!;
  const iss = issuesOf(ws, l);
  const hist = ws.audit.filter(a => a.target === l.code);
  const rvs = ws.reviews.filter(rv => rv.code === l.code).sort((a, b) => b.time - a.time);
  const syncItems = ws.runs.flatMap(r => r.items.filter(i => i.code === l.code).map(i => ({ ...i, run: r.id, time: r.time }))).slice(0, 20);
  const setTab = (t: string) => setUi(ui => { if (ui.drawer) ui.drawer.tab = t; });
  let body;
  if (tab === 'overview') {
    body = <KV pairs={[
      ['Kode', l.code], ['Tipe', l.type], ['Alamat', l.address], ['Kota / provinsi', `${l.city}, ${l.province}`], ['Region', l.region], ['Telepon', l.phone], ['Jam operasional', l.hours],
      ['Koordinat', <>{l.lat.toFixed(5)}, {l.lng.toFixed(5)} <a className="bs-inline-link" href={`https://www.google.com/maps?q=${l.lat},${l.lng}`} target="_blank" rel="noopener noreferrer">Buka di Google Maps <Ic name="external" /></a></>],
      ['Sinkron terakhir', l.lastSync ? <WhenFull t={l.lastSync} /> : 'Belum pernah'], ['Diperbarui', <><WhenFull t={l.updatedAt} /><small>{`oleh ${l.updatedBy}`}</small></>]
    ]} />;
  } else if (tab === 'compare') {
    const g = l.google;
    body = !g
      ? <EmptyState title="Belum ada listing Google" text="Sinkronkan unit atau ajukan titik baru untuk membuat listing." icon="info" cta={<Btn label="Sinkronkan sekarang" icon="refresh" variant="sm" perm="sync.run" onClick={() => runSync([l.code], { label: l.name, retry: true })} />} />
      : <table className="bs-table bs-compare"><thead><tr><th scope="col">Kolom</th><th scope="col">Dashboard</th><th scope="col">Google Maps</th></tr></thead><tbody>
        {(['name', 'phone', 'hours', 'address', 'coords'] as const).map(f => {
          const i = iss.find(x => x.field === f);
          const dv = f === 'coords' ? `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}` : l[f];
          const gv = f === 'coords' ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` : g[f];
          return (
            <tr key={f} className={i ? 'is-diff' : ''}>
              <th scope="row">{FIELD_LABEL[f]}{i ? <small className="bs-diff-flag"><Ic name="alert" />Beda{i.dist ? ' ' + fmtDist(i.dist) : ''}</small> : <small className="bs-ok"><Ic name="check" />Sesuai</small>}</th>
              <td>{dv}</td>
              <td>{gv}{i && <div className="bs-btn-row"><Btn label="Pakai Dashboard" variant="sm" perm="locations.write" onClick={() => resolveDisc(l.code, f, true)} /><Btn label="Pakai Google" variant="sm ghost" perm="locations.write" onClick={() => resolveDisc(l.code, f, false)} /></div>}</td>
            </tr>
          );
        })}
      </tbody></table>;
  } else if (tab === 'reviews') {
    body = rvs.length
      ? <><RatingSummary scope={rvs} clickable={false} /><div className="bs-btn-row"><Btn label="Buka di halaman Ulasan" icon="star" variant="sm" onClick={() => openReviewsFor(l.code)} /></div><div className="bs-review-list in-drawer">{rvs.map(rv => <ReviewCard key={rv.id} rv={rv} showLoc={false} />)}</div></>
      : <EmptyState title="Belum ada ulasan" text="Lokasi ini belum memiliki ulasan di Google Maps." icon="star" />;
  } else if (tab === 'history') {
    body = hist.length
      ? <ol className="bs-timeline">{hist.map(a => <li key={a.id}><span className="bs-avatar sm" data-actor={a.actor} aria-hidden="true">{a.actor === 'Eksternal' ? '@' : initials(a.user)}</span><div><p><strong>{a.user}</strong> {a.action.toLowerCase()}</p><small><WhenFull t={a.time} /> · {a.module}</small>{!!a.changes.length && <DiffList changes={a.changes} />}{a.detail && <small>{a.detail}</small>}</div></li>)}</ol>
      : <EmptyState title="Belum ada riwayat" text="Perubahan pada unit ini akan tercatat di sini." icon="history" />;
  } else {
    body = syncItems.length
      ? <Table heads={['Job', 'Hasil', 'Penyebab']} rows={syncItems.map((i, k) => ({ key: k, cells: [<>{i.run}<small><When t={i.time} /></small></>, <><Badge s={i.status} />{i.resolved && i.status === 'Gagal' && <small><Badge s="Ditangani" /></small>}</>, { c: <>{i.reason}{i.note && <small>{i.note}</small>}</>, cls: 'bs-td-wrap' }] }))} />
      : <EmptyState title="Tidak ada masalah sinkronisasi" text={l.lastSync ? `Sinkron terakhir ${fmtRel(l.lastSync)} berhasil.` : 'Unit belum pernah disinkronkan.'} />;
  }
  return (
    <div className="bs-sheet-inner">
      <header className="bs-sheet-head">
        <div><p className="bs-eyebrow">{l.code} · {l.type}</p><h2 id="bsDrawerTitle">{l.name}</h2>
          <div className="bs-badges"><Badge s={l.status} /><Badge s={l.gbp} />{!!iss.length && <span className="bs-badge" data-tone="warn"><i />{iss.length} beda dengan Google</span>}</div></div>
        <Btn icon="x" variant="icon ghost" title="Tutup" onClick={closeDrawer} />
      </header>
      <Tabs bind="drawer.tab" label="Detail unit" cur={tab} onChange={setTab} items={[['overview', 'Ringkasan'], ['compare', 'Bandingkan Google', iss.length || undefined], ['reviews', 'Ulasan', rvs.length], ['history', 'Riwayat', hist.length], ['sync', 'Sinkronisasi']]} />
      <TabPanel bind="drawer.tab" cur={tab} cls="bs-sheet-body">{body}</TabPanel>
      <footer className="bs-sheet-foot">
        <Btn label="Hapus" icon="trash" variant="danger ghost" perm="locations.write" onClick={() => deleteLocation(l.code)} />
        <Btn icon="link" variant="icon ghost" title="Salin tautan unit ini" onClick={() => { void copyLink(); }} />
        <span className="bs-spacer" />
        <Btn label="Sinkronkan" icon="refresh" perm="sync.run" disabled={!!running} onClick={() => runSync([l.code], { label: l.name, retry: true })} />
        <Btn label="Edit" icon="edit" variant="primary" perm="locations.write" onClick={() => locationForm(l.code)} />
      </footer>
    </div>
  );
}
