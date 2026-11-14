// Impor unit kerja dari Excel (.xlsx) atau CSV dengan pemetaan kolom. Data dikirim ke POST /locations/import.
import { useState } from 'react';
import { byCode } from '../../lib/data';
import { HOURS, regionOf, SL, STATUSES, TYPES } from '../../lib/domain';
import { download, downloadCSV, downloadXlsx, parseCSV, readXlsx } from '../../lib/files';
import { fmtNum, L2, offset, pick, rng } from '../../lib/format';
import type { Location, Workspace } from '../../lib/types';
import { closeModal, getApp, openModal, setUi, toast } from '../../store';
import { Badge, Btn, cx } from '../ui/components';
import { Ic } from '../ui/Icon';
import { FormModal } from '../ui/Modal';
import { guard, navigate, remote } from '../workspace';
import { validateLoc, type LocInput } from './FormParts';

const COLS: Record<string, string> = {
  kode: 'code', code: 'code', 'kode unit': 'code', 'kode toko': 'code', storecode: 'code', 'store code': 'code',
  nama: 'name', name: 'name', 'nama unit': 'name', 'nama lokasi': 'name', 'nama kantor': 'name', 'business name': 'name',
  tipe: 'type', type: 'type', jenis: 'type', 'tipe unit': 'type', 'jenis unit': 'type', locationtype: 'type', 'location type': 'type',
  kota: 'city', city: 'city', 'kab/kota': 'city', 'kabupaten/kota': 'city', kabupaten: 'city', locality: 'city',
  provinsi: 'province', province: 'province', 'administrative area': 'province',
  alamat: 'address', address: 'address', 'alamat lengkap': 'address', 'address line 1': 'address',
  telepon: 'phone', phone: 'phone', telp: 'phone', 'no telepon': 'phone', 'no. telepon': 'phone', 'nomor telepon': 'phone', 'primary phone': 'phone',
  jam: 'hours', 'jam operasional': 'hours', 'jam buka': 'hours', hours: 'hours', 'opening hours': 'hours',
  lat: 'lat', latitude: 'lat', lintang: 'lat', lng: 'lng', lon: 'lng', long: 'lng', longitude: 'lng', bujur: 'lng',
  status: 'status', 'status unit': 'status'
};
const normHead = (h: unknown) => String(h ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[*]/g, ' ').replace(/[_\s]+/g, ' ').trim();
const TYPE_ALIAS: Record<string, string> = { kc: 'Kantor Cabang', cabang: 'Kantor Cabang', branch: 'Kantor Cabang', hq: 'Kantor Cabang', 'head office': 'Kantor Cabang', kcp: 'KCP', 'kantor cabang pembantu': 'KCP', 'sub branch': 'KCP', subbranch: 'KCP', 'bri unit': 'Unit', teras: 'Unit', crm: 'ATM' };
const IMPORT_FIELDS: [string, string, boolean][] = [
  ['code', 'Kode unit', false], ['name', 'Nama unit', true], ['type', 'Tipe', true], ['city', 'Kota/Kabupaten', true], ['province', 'Provinsi', true],
  ['address', 'Alamat', true], ['phone', 'Telepon', false], ['hours', 'Jam operasional', false], ['lat', 'Latitude', true], ['lng', 'Longitude', true], ['status', 'Status', false]
];
const TEMPLATE_HEAD = ['kode', 'nama', 'tipe', 'kota', 'provinsi', 'alamat', 'telepon', 'jam', 'lat', 'lng', 'status'];
const IMPORT_MAX_ROWS = 20000, IMPORT_MAX_BYTES = 10 * 1024 * 1024, IMPORT_PREVIEW = 200;
const STREETS = ['Sudirman', 'Ahmad Yani', 'Diponegoro', 'Gatot Subroto', 'Merdeka', 'Veteran', 'Pahlawan', 'Pemuda', 'Imam Bonjol', 'Gajah Mada'];

/** Contoh CSV untuk latihan impor (kota acuan dari Kantor Cabang yang ada, atau kota cadangan bila server masih kosong). */
export function sampleCSV(n = 25) {
  const own = (getApp().ws?.locations || []).filter(l => l.type === 'Kantor Cabang');
  const r = rng(Date.now() % 100000), base = own.length ? own : [
    { city: 'Jakarta', province: 'DKI Jakarta', lat: -6.2088, lng: 106.8456 }, { city: 'Bandung', province: 'Jawa Barat', lat: -6.9175, lng: 107.6191 },
    { city: 'Surabaya', province: 'Jawa Timur', lat: -7.2575, lng: 112.7521 }, { city: 'Medan', province: 'Sumatera Utara', lat: 3.5952, lng: 98.6722 },
    { city: 'Makassar', province: 'Sulawesi Selatan', lat: -5.1477, lng: 119.4327 }];
  const lines = [TEMPLATE_HEAD.join(',')];
  for (let i = 0; i < n; i++) {
    const b = base[i % base.length], p = offset(b.lat, b.lng, 1500 + r() * 6000, r() * 6.28), type = pick(r, ['KCP', 'Unit', 'ATM']);
    const name = `${type === 'ATM' ? 'ATM BRI' : type === 'Unit' ? 'BRI Unit' : 'KCP'} ${b.city} ${pick(r, ['Raya', 'Baru', 'Timur', 'Barat', 'Utara', 'Selatan', 'Indah', 'Jaya'])} ${i + 1}`;
    const bad = i === 7 ? 'lat' : i === 15 ? 'status' : '';
    lines.push(['', name, type, b.city, b.province, `Jl. ${pick(r, STREETS)} No. ${10 + i}`, `(0${21 + i}) 77${1000 + i}`, type === 'ATM' ? HOURS[3] : HOURS[0], bad === 'lat' ? '' : p.lat.toFixed(5), p.lng.toFixed(5), bad === 'status' ? 'Aktif?' : 'Belum Sync'].map(v => /[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(','));
  }
  return lines.join('\n');
}

interface Row { line: number; cells: string[] }
interface Item { line: number; p: LocInput & { code: string }; existing: Location | null; errors: string[] }
type Draft =
  | { stage: 'input'; text: string; error?: string; busy?: string }
  | { stage: 'map' | 'review'; text: string; source: { name: string; kind: string; sheet?: string }; header: string[]; rows: Row[]; map: Record<string, number>; items?: Item[] };

const cellText = (v: unknown) => (v == null ? '' : v instanceof Date ? (isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)) : String(v).trim());
const decimalText = (v: unknown) => String(v ?? '').trim().replace(/^(-?\d+),(\d+)$/, '$1.$2');
function autoMap(header: unknown[]) { const map: Record<string, number> = {}; header.forEach((h, j) => { const f = COLS[normHead(h)]; if (f && map[f] == null) map[f] = j; }); return map; }
function toMapping(rows: unknown[][], source: { name: string; kind: string; sheet?: string }, text = ''): Draft {
  const body: Row[] = [];
  rows.forEach((r, i) => { const cells = (r || []).map(cellText); if (cells.some(c => c !== '')) body.push({ line: i + 1, cells }); });
  if (body.length < 2) return { stage: 'input', text, error: 'Data kosong. Sertakan baris judul kolom dan minimal satu baris data.' };
  if (body.length - 1 > IMPORT_MAX_ROWS) return { stage: 'input', text, error: `File berisi ${fmtNum(body.length - 1)} baris — maksimal ${fmtNum(IMPORT_MAX_ROWS)} baris per impor. Bagi file menjadi beberapa bagian.` };
  const headRow = body.shift()!, width = Math.max(headRow.cells.length, ...body.slice(0, 50).map(r => r.cells.length));
  const header = Array.from({ length: width }, (_, j) => headRow.cells[j] || `Kolom ${j + 1}`);
  return { stage: 'map', text, source, header, rows: body, map: autoMap(headRow.cells) };
}
function mapIssues(d: Extract<Draft, { stage: 'map' | 'review' }>) {
  const missing = IMPORT_FIELDS.filter(([k, , req]) => req && d.map[k] == null).map(([, l]) => l);
  const byCol: Record<number, string[]> = {};
  IMPORT_FIELDS.forEach(([k, l]) => { const j = d.map[k]; if (j != null) (byCol[j] = byCol[j] || []).push(l); });
  const dupes = Object.entries(byCol).filter(([, ls]) => ls.length > 1).map(([j, ls]) => ({ col: d.header[Number(j)], fields: ls }));
  const used = new Set(Object.values(d.map));
  return { missing, dupes, unused: d.header.filter((_, j) => !used.has(j)) };
}
function analyzeRows(ws: Workspace, d: Extract<Draft, { stage: 'map' | 'review' }>): Item[] {
  const seenNames = new Set<string>(), seenCodes = new Set<string>();
  const items = d.rows.map(({ line, cells }) => {
    const p: Record<string, string> = {};
    IMPORT_FIELDS.forEach(([k]) => { const j = d.map[k]; p[k] = j == null ? '' : String(cells[j] ?? '').trim(); });
    p.lat = decimalText(p.lat); p.lng = decimalText(p.lng);
    const tv = p.type.toLowerCase().replace(/[_-]+/g, ' ').trim();
    p.type = TYPES.find(t => t.toLowerCase() === tv) || TYPE_ALIAS[tv] || p.type;
    p.status = STATUSES.find(t => t.toLowerCase() === p.status.toLowerCase() || SL(t).toLowerCase() === p.status.toLowerCase()) || p.status || 'Belum Sync';
    const existing = p.code ? byCode(ws).get(p.code) || null : null;
    const inp = p as unknown as LocInput & { code: string };
    const e = validateLoc(ws, inp, existing);
    if (p.code && !existing && !/^[A-Za-z0-9._-]{1,40}$/.test(p.code)) e.code = 'Kode hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung (maks. 40 karakter).';
    if (p.code && seenCodes.has(p.code)) e.code = 'Kode ganda di dalam file.';
    if (p.code) seenCodes.add(p.code);
    const key = String(inp.name).toLowerCase();
    if (!e.name && seenNames.has(key)) e.name = 'Nama ganda di dalam file.';
    seenNames.add(key);
    return { line, p: inp, existing, errors: Object.values(e) };
  });
  items.sort((a, b) => (b.errors.length ? 1 : 0) - (a.errors.length ? 1 : 0) || a.line - b.line); // baris bermasalah di atas
  return items;
}
async function xlsxTemplate() {
  const rows = parseCSV(sampleCSV(3)).map((r, i) => (i ? r.map((v, j) => (['lat', 'lng'].includes(TEMPLATE_HEAD[j]) && v !== '' ? Number(v) : v)) : r));
  const guide = ([
    ['Petunjuk impor BranchSync', 'BranchSync import guide'],
    ['Isi sheet “Data” mulai baris 2. Judul kolom boleh berbeda — Anda dapat memetakannya saat impor.', 'Fill in the “Data” sheet from row 2. Column names may differ — you can map them during import.'],
    ['Kolom wajib: nama, tipe, kota, provinsi, alamat, lat, lng.', 'Required columns: nama (name), tipe (type), kota (city), provinsi (province), alamat (address), lat, lng.'],
    [`Tipe: ${TYPES.join(', ')} (juga dikenali: KC, BRANCH, HQ, SUB_BRANCH).`, `Type: ${TYPES.join(', ')} (also recognised: KC, BRANCH, HQ, SUB_BRANCH).`],
    [`Status (opsional): ${STATUSES.join(', ')}. Kosong = Belum Sync.`, `Status (optional): ${STATUSES.join(', ')}. Empty = Belum Sync (not synced).`],
    ['Kode (opsional): isi kode unit yang ada untuk memperbarui datanya, atau kode toko baru untuk unit baru.', 'Code (optional): an existing location code updates that location; a new store code is used for the new location.'],
    ['Koordinat memakai titik desimal, contoh: -6.2146 dan 106.8451.', 'Coordinates use a decimal point, e.g. -6.2146 and 106.8451.']
  ] as [string, string][]).map(x => [L2(x)]);
  await downloadXlsx('template-impor-unit-kerja.xlsx', [
    { name: 'Data', rows, widths: [12, 34, 14, 18, 20, 36, 18, 24, 12, 12, 14] },
    { name: L2(['Petunjuk', 'Guide']), rows: guide, widths: [100], head: true }
  ]);
}

/** Buka wizard impor. `text`: isi awal kolom CSV (mis. contoh 25 unit). */
export function importModal(text = '') {
  if (!guard('locations.import')) return;
  openModal(<ImportWizard initial={text} />);
}

function ImportWizard({ initial }: { initial: string }) {
  const [d, setD] = useState<Draft>({ stage: 'input', text: initial });
  const [busy, setBusy] = useState(false);
  const ws = getApp().ws!;
  const order = ['input', 'map', 'review'], at = order.indexOf(d.stage);
  const steps = ['Unggah atau tempel data', 'Petakan kolom', 'Periksa hasil', 'Impor'];
  const readFile = async (file: File) => {
    if (/\.xls$/i.test(file.name)) { setD({ stage: 'input', text: '', error: 'Format .xls (Excel 97–2003) tidak didukung. Simpan ulang sebagai .xlsx atau CSV.' }); return; }
    if (file.size > IMPORT_MAX_BYTES) { setD({ stage: 'input', text: '', error: `Ukuran file ${(file.size / 1048576).toFixed(1)} MB — maksimal 10 MB.` }); return; }
    const xlsx = /\.xlsx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    setD({ stage: 'input', text: '', busy: `Membaca ${file.name}…` });
    try {
      let rows: unknown[][], text = '', sheet = '';
      if (xlsx) {
        const sheets = (await readXlsx(file)).filter(s => s.data.length);
        const pickS = sheets.find(s => Object.keys(autoMap(s.data[0] || [])).length >= 2) || sheets[0];
        rows = pickS ? pickS.data : []; sheet = pickS ? pickS.sheet : '';
      } else { text = await file.text(); rows = parseCSV(text); }
      setD(toMapping(rows, { name: file.name, kind: xlsx ? 'xlsx' : 'csv', sheet }, text.length <= 200000 ? text : ''));
    } catch (e) { setD({ stage: 'input', text: '', error: `File tidak dapat dibaca: ${(e as Error).message}` }); }
  };
  const commit = async (items: Item[]) => {
    const ok = items.filter(x => !x.errors.length), t0 = performance.now();
    const payload = ok.map(({ p, existing }) => {
      const clean = { name: p.name, type: p.type, city: p.city, province: p.province, region: regionOf(p.province), address: p.address, phone: p.phone, hours: p.hours || HOURS[0], lat: p.lat, lng: p.lng, status: p.status };
      const own = !existing && p.code && !byCode(ws).has(p.code) ? p.code : null; // kode toko dari file dipakai untuk unit baru
      return { ...clean, code: existing ? existing.code : own, exists: !!existing };
    });
    setBusy(true);
    const res = await remote<{ added?: number; updated?: number }>('POST', '/locations/import', { items: payload });
    setBusy(false);
    if (!res) return;
    const added = typeof res === 'object' && res.added != null ? res.added : payload.filter(x => !x.exists).length;
    const updated = typeof res === 'object' && res.updated != null ? res.updated : payload.filter(x => x.exists).length;
    closeModal();
    setUi(ui => { ui.loc.quick = 'all'; ui.loc.sort = 'updatedAt'; ui.loc.dir = -1; ui.loc.page = 1; });
    navigate('locations');
    toast(`Impor selesai dalam ${Math.round(performance.now() - t0)} ms — ${added} unit baru, ${updated} diperbarui.`, { tone: 'good' });
  };
  const src = d.stage !== 'input' && (
    <p className="bs-import-source"><Ic name={d.source.kind === 'xlsx' ? 'file' : 'clipboard'} /><span><strong>{d.source.name}</strong>{d.source.sheet && <> · sheet “{d.source.sheet}”</>} · {fmtNum(d.rows.length)} baris data</span></p>
  );
  let body, footer;
  if (d.stage === 'input') {
    body = (
      <div className="bs-import-input">
        <div className="bs-btn-row">
          <Btn label="Template Excel" icon="download" variant="sm" onClick={() => { xlsxTemplate().catch(e => toast((e as Error).message, { tone: 'bad' })); }} />
          <Btn label="Template CSV" icon="download" variant="sm ghost" onClick={() => download('template-impor-unit-kerja.csv', '﻿' + sampleCSV(3), 'text/csv;charset=utf-8')} />
          <Btn label="Isi contoh 25 unit baru" icon="zap" variant="sm ghost" onClick={() => setD({ stage: 'input', text: sampleCSV(25) })} />
          <label className="bs-btn sm primary bs-file"><Ic name="upload" /><span>Pilih file Excel / CSV</span><input type="file" id="bsImportFile" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="bs-sr" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f); }} /></label>
        </div>
        <div className="bs-field full"><label htmlFor="bsImportText">Atau tempel data CSV</label>
          <textarea id="bsImportText" name="csv" rows={8} spellCheck={false} placeholder={TEMPLATE_HEAD.join(',')} value={d.text} onChange={e => setD({ stage: 'input', text: e.target.value })} />
          <small className="bs-field-hint">{`Excel (.xlsx, sheet pertama yang berisi judul kolom) atau CSV dengan pemisah koma/titik koma. Maks. ${fmtNum(IMPORT_MAX_ROWS)} baris, 10 MB. Judul kolom boleh berbeda — Anda memetakannya di langkah berikutnya.`}</small></div>
        <p className="bs-import-busy" role="status" aria-live="polite">{d.busy && <><span className="bs-spinner sm" aria-hidden="true" />{d.busy}</>}</p>
        {d.error && <p className="bs-form-error" role="alert">{d.error}</p>}
      </div>
    );
    footer = <><Btn label="Batal" variant="ghost" onClick={closeModal} /><Btn label="Lanjut: petakan kolom" icon="arrowR" variant="primary" disabled={!!d.busy} onClick={() => {
      if (!d.text.trim()) { setD({ ...d, error: 'Tempel data CSV atau pilih file Excel/CSV terlebih dahulu.' }); document.getElementById('bsImportText')?.focus(); return; }
      setD(toMapping(parseCSV(d.text), { name: 'Data yang ditempel', kind: 'paste' }, d.text));
    }} /></>;
  } else if (d.stage === 'map') {
    const iss = mapIssues(d);
    const sample = (j: number | undefined) => {
      if (j == null) return <span className="bs-muted">—</span>;
      const v = d.rows.slice(0, 20).map(r => r.cells[j]).filter(Boolean).slice(0, 2);
      return v.length ? <span className="bs-samples">{v.map((x, i) => <code key={i} title={String(x).slice(0, 200)}>{String(x).slice(0, 60)}</code>)}</span> : <span className="bs-muted">kosong</span>;
    };
    body = <>
      {src}
      <p className="bs-muted bs-gap-b">Pilih kolom file untuk setiap data BranchSync. Kolom yang namanya dikenali sudah dipilihkan otomatis — periksa kembali sebelum lanjut.</p>
      <div className="bs-table-wrap bs-import-map" role="region" aria-label="Pemetaan kolom" tabIndex={0}><table className="bs-table bs-cards">
        <thead><tr><th scope="col">Data BranchSync</th><th scope="col">Kolom di file</th><th scope="col">Contoh nilai</th></tr></thead>
        <tbody>{IMPORT_FIELDS.map(([k, l, req]) => {
          const j = d.map[k];
          return (
            <tr key={k} className={req && j == null ? 'is-error' : ''}>
              <th scope="row" data-label="Data BranchSync"><label htmlFor={`bsMap-${k}`}>{l}</label>{req && <> <span className="bs-req-badge">Wajib</span></>}{k === 'type' ? <small className="bs-field-hint">KC, BRANCH, HQ → Kantor Cabang · SUB_BRANCH → KCP</small> : k === 'code' ? <small className="bs-field-hint">Kode yang ada = perbarui unit</small> : null}</th>
              <td data-label="Kolom di file"><select id={`bsMap-${k}`} aria-required={req || undefined} value={j == null ? '' : String(j)} onChange={e => { const v = e.target.value; const map = { ...d.map }; if (v === '') delete map[k]; else map[k] = Number(v); setD({ ...d, map }); }}><option value="">— Tidak dipakai —</option>{d.header.map((h, i) => <option key={i} value={i}>{h}</option>)}</select></td>
              <td data-label="Contoh nilai" className="bs-td-wrap">{sample(j)}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <div aria-live="polite">
        {iss.missing.length > 0 && <p className="bs-form-error"><Ic name="alert" />Kolom wajib belum dipetakan: {iss.missing.join(', ')}.</p>}
        {iss.dupes.map(x => <p key={x.col} className="bs-form-error"><Ic name="alert" />Kolom “{x.col}” dipakai untuk lebih dari satu data: {x.fields.join(', ')}.</p>)}
      </div>
      {iss.unused.length > 0 && <p className="bs-muted bs-import-unused">Kolom file yang tidak diimpor: {iss.unused.join(', ')}</p>}
    </>;
    footer = <><Btn label="Kembali" icon="arrowL" variant="ghost" onClick={() => setD({ stage: 'input', text: d.text })} /><Btn label="Batal" variant="ghost" onClick={closeModal} />
      <Btn label="Periksa data" icon="check" variant="primary" disabled={!!(iss.missing.length || iss.dupes.length)} onClick={() => setD({ ...d, stage: 'review', items: analyzeRows(ws, d) })} /></>;
  } else {
    const items = d.items || [], ok = items.filter(x => !x.errors.length), bad = items.length - ok.length, upd = ok.filter(x => x.existing).length, shown = items.slice(0, IMPORT_PREVIEW);
    body = <>
      {src}
      <div className="bs-import-summary" role="status"><span><Badge s="Berhasil" label={`${fmtNum(ok.length)} valid`} /></span><span>{bad > 0 && <Badge s="Gagal" label={`${fmtNum(bad)} perlu diperbaiki`} />}</span><span>{upd > 0 && <Badge s="Belum Sync" label={`${fmtNum(upd)} memperbarui unit yang ada`} />}</span></div>
      <div className="bs-table-wrap bs-import-table" tabIndex={0} role="region" aria-label="Pratinjau impor"><table className="bs-table bs-cards">
        <thead><tr><th scope="col">Baris</th><th scope="col">Nama</th><th scope="col">Tipe</th><th scope="col">Kota</th><th scope="col">Koordinat</th><th scope="col">Hasil</th></tr></thead>
        <tbody>{shown.map(x => (
          <tr key={x.line} className={x.errors.length ? 'is-error' : ''}>
            <td data-label="Baris">{x.line}</td><td data-label="Nama">{x.p.name}</td><td data-label="Tipe">{x.p.type}</td><td data-label="Kota">{x.p.city}</td>
            <td data-label="Koordinat">{isFinite(Number(x.p.lat)) ? `${x.p.lat}, ${x.p.lng}` : '—'}</td>
            <td data-label="Hasil" className="bs-td-wrap">{x.errors.length ? <span className="bs-err"><Ic name="alert" />{x.errors.join(' ')}</span> : <span className="bs-ok"><Ic name="check" />{x.existing ? 'Perbarui' : 'Baru'}</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {items.length > shown.length && <p className="bs-muted bs-gap-t">Menampilkan {fmtNum(shown.length)} dari {fmtNum(items.length)} baris (baris bermasalah ditampilkan lebih dulu).</p>}
    </>;
    footer = <>
      <Btn label="Kembali ke pemetaan" icon="arrowL" variant="ghost" onClick={() => setD({ ...d, stage: 'map' })} />
      {bad > 0 && <Btn label="Unduh baris bermasalah" icon="download" onClick={() => downloadCSV('baris-bermasalah-impor.csv', [['baris', ...TEMPLATE_HEAD, 'kesalahan'], ...items.filter(x => x.errors.length).map(x => [x.line, ...IMPORT_FIELDS.map(([k]) => { const v = (x.p as Record<string, unknown>)[k]; return (k === 'lat' || k === 'lng') && Number.isNaN(v) ? '' : v; }), x.errors.join(' ')])])} />}
      <Btn label={busy ? 'Mengimpor…' : `Impor ${fmtNum(ok.length)} baris valid`} icon="upload" variant="primary" disabled={!ok.length || busy} aria-busy={busy || undefined} onClick={() => { void commit(items); }} />
    </>;
  }
  return (
    <FormModal title="Impor unit kerja" wide footer={footer}>
      <ol className="bs-import-steps">{steps.map((s, i) => <li key={s} className={cx(i < at && 'is-done', i === at && 'is-current')} aria-current={i === at ? 'step' : undefined}>{s}</li>)}</ol>
      {body}
    </FormModal>
  );
}
