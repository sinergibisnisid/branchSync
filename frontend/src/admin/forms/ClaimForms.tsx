// Formulir klaim listing (Get Verified / banding suspend / laporan duplikat) dan usulan titik lokasi baru.
import { useRef, useState } from 'react';
import { byCode, claimActive } from '../../lib/data';
import { CLAIM_KINDS, SL, TYPES } from '../../lib/domain';
import { distM, fmtDist } from '../../lib/format';
import { cloneHours, formatHours, hoursError, presetHours } from '../../lib/hours';
import type { HoursSpec } from '../../lib/types';
import { getApp, openModal, setUi, toast } from '../../store';
import { Field, FormGrid, FormModal } from '../ui/Modal';
import { guard, navigate, remote } from '../workspace';
import { HoursEditor, MapPicker, validateLoc, type LocInput } from './FormParts';

const seeClaims = () => (getApp().ui.view !== 'claims' ? { label: 'Lihat', run: () => navigate('claims') } : null);

export function claimForm(code = '', kind?: string) {
  if (!guard('claims.manage')) return;
  const ws = getApp().ws!;
  const cands = ws.locations.filter(l => l.gbp !== 'Terverifikasi' || l.code === code);
  const defKind = kind || (byCode(ws).get(code)?.gbp === 'Suspend' ? 'Banding suspend' : 'Klaim kepemilikan');
  openModal(
    <FormModal title="Ajukan klaim" submit="Ajukan" desc="Permintaan masuk ke tahap “Diajukan”. Waktu proses internal mulai dihitung." onSubmit={async fd => {
      const p = { kind: String(fd.get('kind')), code: String(fd.get('code') || ''), note: String(fd.get('note') || '').trim() };
      if (!byCode(ws).has(p.code)) return { code: 'Pilih unit kerja.' };
      if (ws.claims.some(c => c.code === p.code && claimActive(c))) return { code: 'Unit ini sudah memiliki permintaan yang berjalan.' };
      const res = await remote<{ id?: string }>('POST', '/claims', p);
      if (!res) return 'Permintaan belum terkirim. Periksa pesan di pojok layar.';
      setUi(ui => { ui.claims.tab = 'active'; });
      toast(`${(typeof res === 'object' && res.id) || 'Permintaan'} diajukan.`, { tone: 'good', action: seeClaims() });
    }}>
      <FormGrid>
        <Field name="kind" label="Jenis permintaan" type="select" options={CLAIM_KINDS} value={defKind} full />
        <Field name="code" label="Unit kerja" type="select" options={cands.map(l => [l.code, `${l.name} · ${SL(l.gbp)}`] as [string, string])} value={code} full hint="Hanya unit yang belum terverifikasi ditampilkan." />
        <Field name="note" label="Catatan / dokumen pendukung" type="textarea" full required={false} maxLength={500} />
      </FormGrid>
    </FormModal>
  );
}

export function pointForm() {
  if (!guard('claims.manage')) return;
  openModal(<PointForm />);
}
function PointForm() {
  const ws = getApp().ws!;
  const [hours, setHours] = useState<HoursSpec>(() => presetHours('weekday'));
  const hoursRef = useRef(hours); hoursRef.current = hours;
  return (
    <FormModal title="Usulkan titik lokasi baru" wide="xl" submit="Ajukan titik baru" desc="Sistem memeriksa kemungkinan duplikat sebelum pengajuan dikirim ke Google." onSubmit={async fd => {
      const herr = hoursError(hoursRef.current);
      if (herr) return herr;
      const p = Object.fromEntries(fd) as unknown as LocInput;
      p.hours = formatHours(hoursRef.current);
      const e = validateLoc(ws, p, null);
      if (Object.keys(e).length) return e;
      const pt = { lat: Number(p.lat), lng: Number(p.lng) };
      const near = ws.locations.map(l => [l, distM(l, pt)] as const).filter(([, d]) => d <= Math.max(ws.settings.dupRadius, 200)).sort((a, b) => a[1] - b[1])[0];
      if (near && !fd.has('force')) return { lat: `Ada ${near[0].name} berjarak ${fmtDist(near[1])} — kemungkinan duplikat. Centang “Tetap ajukan” bila yakin.` };
      const proposal = { name: p.name, type: p.type, city: p.city, province: p.province, address: p.address, phone: p.phone, hours: p.hours, hoursSpec: cloneHours(hoursRef.current), lat: pt.lat, lng: pt.lng };
      const res = await remote<{ id?: string }>('POST', '/claims', { kind: 'Titik baru', proposal, note: near ? `Dekat ${near[0].name} (${fmtDist(near[1])})` : '' });
      if (!res) return 'Pengajuan belum terkirim. Periksa pesan di pojok layar.';
      setUi(ui => { ui.claims.tab = 'active'; });
      toast(`${(typeof res === 'object' && res.id) || 'Pengajuan'} diajukan untuk ${p.name}.`, { tone: 'good', action: seeClaims() });
    }}>
      <h3 className="bs-form-section">Informasi dasar</h3>
      <FormGrid>
        <Field name="name" label="Nama unit" full />
        <Field name="type" label="Tipe" type="select" options={TYPES} value="KCP" />
        <Field name="phone" label="Telepon" required={false} />
        <Field name="city" label="Kota" />
        <Field name="province" label="Provinsi" />
        <Field name="address" label="Alamat" full />
      </FormGrid>
      <h3 className="bs-form-section">Titik lokasi</h3>
      <p className="bs-form-help">Klik peta atau geser penanda untuk menandai titik. Koordinat juga dapat diketik.</p>
      <MapPicker ws={ws} lat="" lng="" self={null} />
      <h3 className="bs-form-section">Jam operasional</h3>
      <HoursEditor value={hours} onChange={setHours} />
      <FormGrid><Field name="force" label="Tetap ajukan meskipun ada unit berdekatan" type="checkbox" full /></FormGrid>
    </FormModal>
  );
}
