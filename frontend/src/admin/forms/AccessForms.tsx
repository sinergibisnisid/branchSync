// Formulir pengguna, peran, dan jadwal laporan.
import { diff } from '../../lib/data';
import { PERMS } from '../../lib/domain';
import { getApp, openModal, setUi, toast } from '../../store';
import { Field, FormGrid, FormModal } from '../ui/Modal';
import { guard, remote } from '../workspace';
import { PERIODS, WEEKDAYS } from '../views/Reports';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function userForm(id?: number) {
  if (!guard('users.manage')) return;
  const s = getApp(), ws = s.ws!;
  const u = id != null ? ws.users.find(x => x.id === id) : undefined;
  const locked = !!u && u.email === s.me.email; // akun sendiri tidak bisa dinonaktifkan
  openModal(
    <FormModal title={u ? `Edit ${u.name}` : 'Tambah pengguna'} submit={u ? 'Simpan' : 'Tambah pengguna'} onSubmit={async fd => {
      const p = { name: String(fd.get('name') || '').trim(), email: String(fd.get('email') || '').trim().toLowerCase(), role: String(fd.get('role') || ''), status: locked ? u!.status : String(fd.get('status') || 'Aktif') };
      const e: Record<string, string> = {};
      if (!p.name) e.name = 'Wajib diisi.';
      if (!EMAIL.test(p.email)) e.email = 'Email tidak valid.';
      else if (ws.users.some(x => x !== u && x.email === p.email)) e.email = 'Email sudah terdaftar.';
      if (Object.keys(e).length) return e;
      if (u && !diff(u, p as never, ['name', 'email', 'role', 'status']).length) return 'Tidak ada perubahan untuk disimpan.';
      const ok = u ? await remote('PATCH', `/users/${encodeURIComponent(String(u.id))}`, p) : await remote('POST', '/users', p);
      if (!ok) return 'Pengguna belum tersimpan. Periksa pesan di pojok layar.';
      toast('Pengguna disimpan.', { tone: 'good' });
    }}>
      <FormGrid>
        <Field name="name" label="Nama lengkap" value={u?.name} full />
        <Field name="email" label="Email" type="email" value={u?.email} full hint="Dipakai untuk masuk dengan kode OTP atau Google." />
        <Field name="role" label="Peran" type="select" options={ws.roles.map(r => r.name)} value={u?.role || 'Viewer'} />
        <Field name="status" label="Status" type="select" options={['Aktif', 'Nonaktif']} value={u?.status || 'Aktif'} disabled={locked} />
      </FormGrid>
    </FormModal>
  );
}

export function roleForm(name?: string) {
  if (!guard('users.manage')) return;
  const ws = getApp().ws!;
  const r = name ? ws.roles.find(x => x.name === name) : undefined;
  openModal(
    <FormModal title={r ? `Ubah peran ${r.name}` : 'Tambah peran'} onSubmit={async fd => {
      const n = String(fd.get('name') || '').trim();
      if (!n) return { name: 'Wajib diisi.' };
      if (ws.roles.some(x => x !== r && x.name.toLowerCase() === n.toLowerCase())) return { name: 'Nama peran sudah ada.' };
      const ok = r ? await remote('PATCH', `/roles/${encodeURIComponent(r.name)}`, { name: n }) : await remote('POST', '/roles', { name: n, permissions: fd.getAll('perm').map(String) });
      if (!ok) return 'Peran belum tersimpan. Periksa pesan di pojok layar.';
      setUi(ui => { ui.access.tab = 'roles'; });
      toast('Peran disimpan.', { tone: 'good' });
    }}>
      <FormGrid><Field name="name" label="Nama peran" value={r?.name} full /></FormGrid>
      {!r && <fieldset className="bs-fieldset"><legend>Izin awal</legend>{PERMS.map(([p, l]) => <label key={p} className="bs-checkline"><input type="checkbox" name="perm" value={p} defaultChecked={p.endsWith('.read')} /><span>{l}</span></label>)}</fieldset>}
    </FormModal>
  );
}

export function reportScheduleModal() {
  if (!guard('settings.write')) return;
  const report = getApp().ui.report;
  openModal(
    <FormModal title="Jadwalkan laporan" submit="Simpan jadwal" desc="Laporan berisi ringkasan KPI, tren, dan kinerja per region sesuai filter yang sedang dipakai." onSubmit={async fd => {
      const name = String(fd.get('name') || '').trim(), recipients = String(fd.get('recipients') || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
      const e: Record<string, string> = {};
      if (!name) e.name = 'Wajib diisi.';
      if (!recipients.length) e.recipients = 'Isi minimal satu email.';
      else if (recipients.some(x => !EMAIL.test(x))) e.recipients = `Email tidak valid: ${recipients.filter(x => !EMAIL.test(x)).join(', ')}`;
      if (recipients.length > 20) e.recipients = 'Maksimal 20 penerima.';
      if (Object.keys(e).length) return e;
      const sch = { name, frequency: String(fd.get('frequency')), day: String(fd.get('day')), period: String(fd.get('period')), format: String(fd.get('format')), recipients, filters: { ...report } };
      const ok = await remote('POST', '/reports/schedules', sch);
      if (!ok) return 'Jadwal belum tersimpan. Periksa pesan di pojok layar.';
      toast(`Jadwal “${name}” disimpan.`, { tone: 'good' });
    }}>
      <FormGrid>
        <Field name="name" label="Nama laporan" value="Laporan kinerja jaringan" full maxLength={80} />
        <Field name="frequency" label="Frekuensi" type="select" options={[['weekly', 'Mingguan'], ['monthly', 'Bulanan (tanggal 1)']]} value="weekly" />
        <Field name="day" label="Hari kirim (mingguan)" type="select" options={WEEKDAYS} value="1" />
        <Field name="period" label="Periode data" type="select" options={PERIODS} value={report.period} />
        <Field name="format" label="Format" type="select" options={[['PDF', 'PDF'], ['CSV', 'CSV'], ['PDF + CSV', 'PDF + CSV']]} value="PDF" />
        <Field name="recipients" label="Penerima (pisahkan dengan koma)" type="textarea" full hint="Contoh: kepala.divisi@bri.co.id, manajer.wilayah@bri.co.id" />
      </FormGrid>
    </FormModal>
  );
}
