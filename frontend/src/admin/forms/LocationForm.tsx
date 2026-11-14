// Formulir tambah / edit unit kerja (data dasar, titik di peta, jam operasional).
import { useRef, useState } from 'react';
import { byCode, diff, issuesOf } from '../../lib/data';
import { HOURS, labelled, regionOf, STATUSES, TYPES } from '../../lib/domain';
import { cloneHours, formatHours, hoursError, parseHours } from '../../lib/hours';
import type { HoursSpec, Location } from '../../lib/types';
import { getApp, openModal, toast } from '../../store';
import { Field, FormGrid, FormModal } from '../ui/Modal';
import { guard, remote, runSync } from '../workspace';
import { HoursEditor, MapPicker, validateLoc, type LocInput } from './FormParts';

export function locationForm(code?: string) {
  if (!guard('locations.write')) return;
  const l = code ? byCode(getApp().ws!).get(code) || null : null;
  openModal(<LocationForm l={l} />);
}

function LocationForm({ l }: { l: Location | null }) {
  const ws = getApp().ws!;
  const [hours, setHours] = useState<HoursSpec>(() => (l?.hoursSpec ? cloneHours(l.hoursSpec) : parseHours(l?.hours || HOURS[0])));
  const hoursRef = useRef(hours); hoursRef.current = hours;
  const submit = async (fd: FormData) => {
    const herr = hoursError(hoursRef.current);
    if (herr) return herr;
    const p = Object.fromEntries(fd) as unknown as LocInput;
    p.hours = formatHours(hoursRef.current);
    const e = validateLoc(ws, p, l);
    if (Object.keys(e).length) return e;
    const body = { name: p.name, type: p.type, status: p.status, city: p.city, province: p.province, address: p.address, phone: p.phone, hours: p.hours, lat: p.lat, lng: p.lng, region: regionOf(p.province), hoursSpec: cloneHours(hoursRef.current) };
    if (l) {
      const changes = diff(l, body as unknown as Partial<Location>, ['name', 'type', 'status', 'city', 'province', 'address', 'phone', 'hours', 'lat', 'lng']);
      if (!changes.length && JSON.stringify(l.hoursSpec || null) === JSON.stringify(body.hoursSpec)) return 'Tidak ada perubahan untuk disimpan.';
      const ok = await remote('PATCH', `/locations/${encodeURIComponent(l.code)}`, body);
      if (!ok) return 'Perubahan belum tersimpan. Periksa pesan di pojok layar.';
      const willDiffer = !!l.google && issuesOf(ws, { ...l, ...body } as Location).length > 0;
      toast(`${p.name} tersimpan di server (${changes.length || 1} kolom).`, { tone: 'good', action: willDiffer ? { label: 'Sinkronkan', run: () => { void runSync([l.code], { label: p.name }); } } : null });
    } else {
      const ok = await remote('POST', '/locations', body);
      if (!ok) return 'Unit belum tersimpan. Periksa pesan di pojok layar.';
      toast(`${p.name} ditambahkan ke server.`, { tone: 'good' });
    }
  };
  return (
    <FormModal title={l ? `Edit ${l.name}` : 'Tambah unit kerja'} wide="xl" submit={l ? 'Simpan perubahan' : 'Tambah unit'}
      desc={l ? 'Perubahan dicatat di Riwayat beserta nilai sebelum dan sesudahnya.' : 'Unit baru berstatus “Belum sinkron” sampai disinkronkan ke Google.'} onSubmit={submit}>
      <h3 className="bs-form-section">Informasi dasar</h3>
      <FormGrid>
        <Field name="name" label="Nama unit" value={l?.name} full hint="Contoh: KCP Bandung Dago" />
        <Field name="type" label="Tipe" type="select" options={TYPES} value={l?.type || 'KCP'} />
        <Field name="status" label="Status operasional" type="select" options={labelled(STATUSES)} value={l?.status || 'Belum Sync'} />
        <Field name="city" label="Kota" value={l?.city} />
        <Field name="province" label="Provinsi" value={l?.province} />
        <Field name="address" label="Alamat" value={l?.address} full />
        <Field name="phone" label="Telepon" value={l?.phone} required={false} />
      </FormGrid>
      <h3 className="bs-form-section">Titik lokasi</h3>
      <p className="bs-form-help">Klik peta atau geser penanda untuk menandai titik. Koordinat juga dapat diketik.</p>
      <MapPicker ws={ws} lat={l?.lat} lng={l?.lng} self={l} />
      <h3 className="bs-form-section">Jam operasional</h3>
      <p className="bs-form-help">Atur jam buka setiap hari seperti di Google Business Profile.</p>
      <HoursEditor value={hours} onChange={setHours} />
    </FormModal>
  );
}
