// Halaman Peta Unit Kerja: Leaflet + klaster marker; garis putus-putus menunjukkan selisih titik dengan Google.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { issueMap, memo } from '../../lib/data';
import { GBP, labelled, MARKER, navItem, REGIONS, SL, STATUSES } from '../../lib/domain';
import { fmtDist, fmtNum } from '../../lib/format';
import type { Location, Workspace } from '../../lib/types';
import { setUi, useApp, type UiState } from '../../store';
import { Btn, ChipRow, PageHead, SearchF, SelectF } from '../ui/components';
import { Ic } from '../ui/Icon';
import { navigate, openDrawer, useWs } from '../workspace';

export function mapFiltered(ws: Workspace, m: UiState['map']) {
  const q = m.q.trim().toLowerCase();
  return memo(ws, `mf:${JSON.stringify([q, m.status, m.region, m.gbp])}`, () => ws.locations.filter(l => (!q || `${l.name} ${l.code} ${l.city} ${l.province}`.toLowerCase().includes(q)) && (!m.status || l.status === m.status) && (!m.region || l.region === m.region) && (!m.gbp || l.gbp === m.gbp)));
}
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const clusterIcon = (c: L.MarkerCluster) => { const n = c.getChildCount(); return L.divIcon({ html: `<span>${n >= 1000 ? `${Math.round(n / 100) / 10}k` : n}</span>`, className: `bs-cluster ${n >= 500 ? 'is-lg' : n >= 50 ? 'is-md' : ''}`, iconSize: L.point(40, 40) }); };
export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; OpenStreetMap contributors';

export function MapView() {
  const ws = useWs();
  const m = useApp(s => s.ui.map);
  const xs = mapFiltered(ws, m), im = issueMap(ws);
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ map: L.Map; layer: L.MarkerClusterGroup; extra: L.LayerGroup; markers: Map<string, L.CircleMarker>; lastKey: string } | null>(null);
  const setMap = (fn: (x: UiState['map']) => void) => setUi(ui => { fn(ui.map); ui.map.limit = 300; });

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { preferCanvas: true, zoomControl: true }).setView([-2.5, 118], 5);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
    const layer = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true, iconCreateFunction: clusterIcon }).addTo(map);
    const extra = L.layerGroup().addTo(map);
    map.on('popupopen', e => {
      e.popup.getElement()?.addEventListener('click', ev => { const b = (ev.target as Element).closest('[data-open-loc]') as HTMLElement | null; if (b) openDrawer(b.dataset.openLoc!); });
    });
    mapRef.current = { map, layer, extra, markers: new Map(), lastKey: '' };
    const t = setTimeout(() => map.invalidateSize(), 60);
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el.current);
    return () => { clearTimeout(t); ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const r = mapRef.current; if (!r) return;
    const key = JSON.stringify([m.q.trim().toLowerCase(), m.status, m.region, m.gbp]);
    const fit = key !== r.lastKey; r.lastKey = key;
    r.layer.clearLayers(); r.extra.clearLayers(); r.markers = new Map();
    const markers: L.CircleMarker[] = [];
    xs.forEach((l: Location) => {
      // Isi popup dibuat saat diklik (bukan ribuan string sekaligus).
      const mk = L.circleMarker([l.lat, l.lng], { radius: 7, color: '#fff', weight: 2, fillColor: MARKER[l.status], fillOpacity: 1 })
        .bindPopup(() => `<div class="bs-popup"><strong>${esc(l.name)}</strong><span>${esc(l.code)} · ${esc(l.type)}</span><span>${esc(l.address)}</span><span>Status: ${esc(SL(l.status))} · GBP: ${esc(SL(l.gbp))}</span><button type="button" data-open-loc="${esc(l.code)}">Lihat detail →</button></div>`);
      markers.push(mk); r.markers.set(l.code, mk);
      const coord = (im.get(l.code) || []).find(i => i.field === 'coords');
      if (m.showGoogle && coord && l.google) {
        L.polyline([[l.lat, l.lng], [l.google.lat, l.google.lng]], { color: '#e0660f', weight: 2, dashArray: '4 4' }).addTo(r.extra);
        L.circleMarker([l.google.lat, l.google.lng], { radius: 6, color: '#e0660f', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`Titik Google · selisih ${fmtDist(coord.dist || 0)}`).addTo(r.extra);
      }
    });
    r.layer.addLayers(markers);
    if (fit && xs.length) r.map.fitBounds(L.latLngBounds(xs.map(l => [l.lat, l.lng] as [number, number])), { padding: [30, 30], maxZoom: 13 });
  }, [xs, im, m.showGoogle, m.q, m.status, m.region, m.gbp]);

  const focus = (code: string) => {
    const r = mapRef.current, mk = r?.markers.get(code);
    if (r && mk) r.layer.zoomToShowLayer(mk, () => mk.openPopup()); else openDrawer(code);
  };
  const lim = m.limit || 300;
  const chips = [
    m.q.trim() && { key: 'q', label: 'Kata kunci', value: m.q.trim(), onRemove: () => setMap(x => { x.q = ''; }) },
    m.status && { key: 'status', label: 'Status', value: SL(m.status), onRemove: () => setMap(x => { x.status = ''; }) },
    m.region && { key: 'region', label: 'Region', value: m.region, onRemove: () => setMap(x => { x.region = ''; }) },
    m.gbp && { key: 'gbp', label: 'Status GBP', value: SL(m.gbp), onRemove: () => setMap(x => { x.gbp = ''; }) }
  ].filter(Boolean) as { key: string; label: string; value: string; onRemove: () => void }[];

  return <>
    <PageHead title="Peta Unit Kerja" desc={navItem('map').desc} actions={<Btn label="Buka daftar" icon="building" onClick={() => navigate('locations')} />} />
    <div className="bs-map-layout">
      <section className="bs-card bs-map-card"><div className="bs-card-body flush">
        <div className="bs-toolbar">
          <SearchF label="Cari di peta" value={m.q} ph="Nama, kode, atau kota…" id="bsMapQ" onChange={v => setMap(x => { x.q = v; })} />
          <SelectF label="Status" xs={labelled(STATUSES)} value={m.status} onChange={v => setMap(x => { x.status = v; })} />
          <SelectF label="Region" xs={REGIONS} value={m.region} onChange={v => setMap(x => { x.region = v; })} />
          <SelectF label="Status GBP" xs={labelled(GBP)} value={m.gbp} onChange={v => setMap(x => { x.gbp = v; })} />
          <label className="bs-switch"><input type="checkbox" checked={m.showGoogle} onChange={e => setUi(ui => { ui.map.showGoogle = e.target.checked; })} /><span />Tampilkan selisih titik Google</label>
        </div>
        <div id="bsMapChips"><ChipRow chips={chips} onReset={() => setMap(x => { x.q = ''; x.status = ''; x.region = ''; x.gbp = ''; })} /></div>
        <div id="bsMap" ref={el} className="bs-map" role="application" aria-label="Peta unit kerja" />
        <div className="bs-map-legend">{STATUSES.map(s => <span key={s}><i style={{ background: MARKER[s] }} />{SL(s)}</span>)}<span><i className="hollow" />Titik di Google (beda)</span></div>
      </div></section>
      <section className="bs-card bs-map-list">
        <header className="bs-card-head"><div><h2 id="bsMapCount">{`${fmtNum(xs.length)} unit ditampilkan`}</h2><p>Klik untuk menuju lokasi</p></div></header>
        <div className="bs-card-body flush"><ol id="bsMapList" className="bs-list">
          {xs.slice(0, lim).map(l => (
            <li key={l.code}><button type="button" onClick={() => focus(l.code)}><i style={{ background: MARKER[l.status] }} aria-hidden="true" /><span><strong>{l.name}</strong><small>{l.code} · {l.city}</small></span>{im.has(l.code) && <span className="bs-issue sm" title="Beda dengan Google"><Ic name="alert" /></span>}</button></li>
          ))}
          {xs.length > lim && <li className="bs-list-more"><Btn label={`Tampilkan ${fmtNum(Math.min(300, xs.length - lim))} lagi`} variant="sm ghost" onClick={() => setUi(ui => { ui.map.limit = lim + 300; })} /><small>{fmtNum(xs.length - lim)} unit belum tampil di daftar — semua tetap ada di peta</small></li>}
          {!xs.length && <li className="bs-list-more">Tidak ada unit yang cocok.</li>}
        </ol></div>
      </section>
    </div>
  </>;
}
