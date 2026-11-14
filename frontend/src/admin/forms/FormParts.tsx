// Bagian formulir bersama: editor jam operasional (seperti Google Business Profile) dan peta pemilih titik.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { byName } from '../../lib/data';
import { STATUSES, TYPES } from '../../lib/domain';
import { distM, fmtDist, L2 } from '../../lib/format';
import { cloneHours, DAYS, formatHours, presetHours, type DayKey } from '../../lib/hours';
import type { HoursSpec, Location, Workspace } from '../../lib/types';
import { toast } from '../../store';
import { Btn, cx } from '../ui/components';
import { Ic } from '../ui/Icon';
import { Field } from '../ui/Modal';
import { TILE_ATTR, TILE_URL } from '../views/MapView';

/* ---------- Validasi unit ---------- */
const inIndonesia = (lat: number, lng: number) => lat >= -11.5 && lat <= 6.5 && lng >= 94 && lng <= 141.5;
export interface LocInput { name: string; type: string; status?: string; city: string; province: string; address: string; phone: string; hours: string; lat: string | number; lng: string | number; [k: string]: unknown }
export function validateLoc(ws: Workspace, p: LocInput, self: Location | null) {
  const e: Record<string, string> = {};
  (['name', 'city', 'province', 'address'] as const).forEach(k => { p[k] = String(p[k] ?? '').trim(); if (!p[k]) e[k] = 'Wajib diisi.'; });
  p.phone = String(p.phone ?? '').trim(); p.hours = String(p.hours ?? '').trim();
  if (!(TYPES as string[]).includes(p.type)) e.type = 'Pilih tipe yang valid.';
  if (p.status && !(STATUSES as string[]).includes(p.status)) e.status = 'Status tidak valid.';
  const lat = Number(p.lat), lng = Number(p.lng);
  if (String(p.lat).trim() === '' || !isFinite(lat)) e.lat = 'Isi angka latitude.';
  if (String(p.lng).trim() === '' || !isFinite(lng)) e.lng = 'Isi angka longitude.';
  if (!e.lat && !e.lng && !inIndonesia(lat, lng)) e.lat = 'Titik berada di luar wilayah Indonesia.';
  if (!e.name && (byName(ws).get(p.name.toLowerCase()) || []).some(x => x !== self && x.code !== self?.code)) e.name = 'Nama ini sudah dipakai unit lain.';
  p.lat = String(p.lat).trim() !== '' && isFinite(lat) ? +lat.toFixed(6) : NaN;
  p.lng = String(p.lng).trim() !== '' && isFinite(lng) ? +lng.toFixed(6) : NaN;
  return e;
}

/* ---------- Editor jam operasional ---------- */
export function HoursEditor({ value, onChange }: { value: HoursSpec; onChange: (sp: HoursSpec) => void }) {
  const edit = (fn: (sp: HoursSpec) => void) => { const sp = cloneHours(value); fn(sp); onChange(sp); };
  return (
    <div className="bs-hours" id="bsHours" role="group" aria-label="Jam operasional">
      <div className="bs-hours-presets"><span>Preset:</span>
        <Btn label="Hari kerja 08.00–15.00" variant="sm ghost" onClick={() => onChange(presetHours('weekday'))} />
        <Btn label="Sen–Sab 08.00–14.00" variant="sm ghost" onClick={() => onChange(presetHours('mon-sat'))} />
        <Btn label="24 jam setiap hari" variant="sm ghost" onClick={() => onChange(presetHours('24'))} />
      </div>
      {DAYS.map(([k, name]) => {
        const d = value[k];
        return (
          <div key={k} className={cx('bs-hours-row', !d.open && 'is-closed')} data-day={k}>
            <span className="bs-hours-day">{name}</span>
            <label className="bs-switch"><input type="checkbox" checked={d.open} aria-label={`${name} buka`} onChange={e => { const on = e.target.checked; edit(sp => { sp[k].open = on; if (on && !sp[k].h24 && !sp[k].ranges.length) sp[k].ranges = [{ from: '08:00', to: '15:00' }]; }); }} /><span /><em data-no-i18n="">{d.open ? L2(['Buka', 'Open']) : L2(['Tutup', 'Closed'])}</em></label>
            <div className="bs-hours-ranges">
              {d.open && (d.h24 ? <span className="bs-hours-24"><Ic name="clock" />Buka 24 jam</span> : d.ranges.map((r, i) => (
                <div key={i} className="bs-hours-range">
                  <input type="time" value={r.from} step={300} aria-label={`${name} buka pukul`} onChange={e => { const v = e.target.value; edit(sp => { sp[k].ranges[i].from = v; }); }} />
                  <span aria-hidden="true">–</span>
                  <input type="time" value={r.to} step={300} aria-label={`${name} tutup pukul`} onChange={e => { const v = e.target.value; edit(sp => { sp[k].ranges[i].to = v; }); }} />
                  {d.ranges.length > 1 && <Btn icon="x" variant="icon sm ghost" title={`Hapus rentang ${name}`} onClick={() => edit(sp => { sp[k].ranges.splice(i, 1); })} />}
                </div>
              )))}
              {d.open && (
                <div className="bs-hours-opts">
                  {!d.h24 && d.ranges.length < 3 && <Btn label="Tambah jam" icon="plus" variant="sm ghost" onClick={() => edit(sp => { const rs = sp[k].ranges, last = rs[rs.length - 1]; rs.push(last ? { from: last.to, to: last.to < '20:00' ? `${String(Math.min(23, Number(last.to.slice(0, 2)) + 3)).padStart(2, '0')}:00` : '23:00' } : { from: '08:00', to: '15:00' }); })} />}
                  <label className="bs-checkline"><input type="checkbox" checked={d.h24} onChange={e => { const on = e.target.checked; edit(sp => { sp[k].h24 = on; if (!on && !sp[k].ranges.length) sp[k].ranges = [{ from: '08:00', to: '15:00' }]; }); }} /><span>24 jam</span></label>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="bs-hours-foot">
        <Btn label="Terapkan Senin ke semua hari buka" icon="copy" variant="sm" onClick={() => {
          if (!value.mon.open) { toast('Aktifkan hari Senin terlebih dahulu.', { tone: 'warn' }); return; }
          edit(sp => { DAYS.slice(1).forEach(([k]) => { if (sp[k as DayKey].open) sp[k as DayKey] = JSON.parse(JSON.stringify(sp.mon)); }); });
          toast('Jam Senin diterapkan ke semua hari buka.');
        }} />
        <span className="bs-hours-summary" data-no-i18n=""><Ic name="clock" /><b id="bsHoursSummary">{formatHours(value)}</b></span>
      </div>
    </div>
  );
}

/* ---------- Peta pemilih titik ---------- */
export function MapPicker({ ws, lat, lng, self }: { ws: Workspace; lat?: number | ''; lng?: number | ''; self: Location | null }) {
  const el = useRef<HTMLDivElement>(null), side = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null), pin = useRef<L.Marker | null>(null);
  const [near, setNear] = useState<{ text: string; warn: boolean }>({ text: '', warn: false });
  const inputs = () => ({ la: side.current?.querySelector<HTMLInputElement>('[name="lat"]'), ln: side.current?.querySelector<HTMLInputElement>('[name="lng"]') });
  const nearest = (la: number, ln: number) => {
    if (!isFinite(la) || !isFinite(ln)) { setNear({ text: 'Klik peta untuk menandai titik lokasi.', warn: false }); return; }
    let best: { l: Location; d: number } | null = null;
    ws.locations.forEach(l => { if (self && l.code === self.code) return; const d = distM(l, { lat: la, lng: ln }); if (!best || d < best.d) best = { l, d }; });
    if (!best) { setNear({ text: '', warn: false }); return; }
    const b = best as { l: Location; d: number }, warn = b.d <= ws.settings.dupRadius;
    setNear({ text: `Unit terdekat: ${b.l.name} — ${fmtDist(b.d)}${warn ? ' (kemungkinan duplikat)' : ''}`, warn });
  };
  const setInputs = (ll: L.LatLng) => { const { la, ln } = inputs(); if (la) la.value = ll.lat.toFixed(6); if (ln) ln.value = ll.lng.toFixed(6); nearest(ll.lat, ll.lng); };
  const place = (ll: L.LatLngExpression, pan = false) => {
    const m = map.current; if (!m) return;
    if (!pin.current) {
      pin.current = L.marker(ll, { draggable: true, keyboard: true, title: 'Titik lokasi — geser untuk memindahkan', icon: L.divIcon({ className: 'bs-pin', html: '<span></span>', iconSize: [28, 38], iconAnchor: [14, 36] }) }).addTo(m);
      pin.current.on('dragend', () => setInputs(pin.current!.getLatLng()));
    } else pin.current.setLatLng(ll);
    if (pan) m.setView(ll, Math.max(m.getZoom(), 15));
  };
  const fromInputs = () => {
    const { la, ln } = inputs(), a = Number(la?.value), b = Number(ln?.value);
    if (!isFinite(a) || !isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180 || la?.value === '' || ln?.value === '') return;
    place([a, b], true); nearest(a, b);
  };
  useEffect(() => {
    if (!el.current) return;
    const has = lat !== '' && lat != null && isFinite(Number(lat)) && isFinite(Number(lng));
    const m = L.map(el.current, { zoomControl: true }).setView(has ? [Number(lat), Number(lng)] : [-2.5, 118], has ? 16 : 5);
    map.current = m;
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(m);
    ws.locations.filter(l => !self || l.code !== self.code).slice(0, 2000).forEach(l => L.circleMarker([l.lat, l.lng], { radius: 4, color: '#fff', weight: 1, fillColor: '#8a97a8', fillOpacity: 0.9 }).bindTooltip(l.name).addTo(m));
    if (has) place([Number(lat), Number(lng)]);
    m.on('click', e => { place(e.latlng); setInputs(e.latlng); });
    nearest(Number(lat), Number(lng));
    const t = setTimeout(() => m.invalidateSize(), 120);
    return () => { clearTimeout(t); m.remove(); map.current = null; pin.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="bs-picker">
      <div className="bs-pick-map" id="bsPickMap" ref={el} role="application" aria-label="Peta pemilihan titik lokasi" />
      <div className="bs-picker-side" ref={side}>
        <Field name="lat" label="Latitude" type="number" value={lat ?? ''} hint="Contoh: -6.9175" onInput={fromInputs} />
        <Field name="lng" label="Longitude" type="number" value={lng ?? ''} hint="Contoh: 107.6191" onInput={fromInputs} />
        <div className="bs-btn-row">
          <Btn label="Gunakan lokasi saya" icon="locate" variant="sm" onClick={() => {
            if (!navigator.geolocation) { toast('Peramban tidak mendukung lokasi.', { tone: 'warn' }); return; }
            navigator.geolocation.getCurrentPosition(pos => { const ll = L.latLng(pos.coords.latitude, pos.coords.longitude); place(ll, true); setInputs(ll); toast('Lokasi Anda ditandai.', { tone: 'good' }); },
              () => toast('Lokasi tidak dapat diambil. Izinkan akses lokasi atau tandai titik di peta.', { tone: 'warn' }), { enableHighAccuracy: true, timeout: 10000 });
          }} />
          <Btn label="Pusatkan ke titik" icon="pin" variant="sm ghost" onClick={fromInputs} />
        </div>
        <p className="bs-pick-near" id="bsPickNear" role="status" aria-live="polite" data-tone={near.warn ? 'warn' : undefined}>{near.text}</p>
      </div>
    </div>
  );
}
