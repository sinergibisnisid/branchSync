// Halaman Panduan Pengguna & Scenario Test (konten dua bahasa; teks tidak melewati penerjemah otomatis).
import { create } from 'zustand';
import * as api from '../../lib/api';
import { CONTENT, type Pair, type Scenario } from '../../lib/content';
import { claimActive, duplicatePairs, issueMap, openFailures, reportBuckets, reportMetrics, slaStats } from '../../lib/data';
import { DAY, FIELD_LABEL, STATUSES, navItem, type ViewId } from '../../lib/domain';
import { downloadCSV } from '../../lib/files';
import { fmtDate, fmtDur, fmtStamp, L2, sum } from '../../lib/format';
import { idbGet, idbSet } from '../../lib/idb';
import AdminI18n from '../../i18n/adminDict';
import { getApp, setUi, toast, useApp } from '../../store';
import { copyLink, navigate, useWs } from '../workspace';
import { importModal, sampleCSV } from '../forms/ImportWizard';
import { locationForm } from '../forms/LocationForm';
import { claimForm, pointForm } from '../forms/ClaimForms';
import { shortcutsModal } from '../AdminApp';
import { Btn, Callout, Card, EmptyState, Go, PageHead, TabPanel, Tabs } from '../ui/components';
import { Ic } from '../ui/Icon';
import { confirmModal, infoModal } from '../ui/Modal';
import { FILTERS, locFiltered } from './locationsModel';
import { useRenderStat } from '../AdminApp';

/** Pintasan aksi dari konten panduan/skenario. */
function runContentAction(a: string) {
  if (a === 'import') importModal();
  else if (a === 'import-sample') importModal(sampleCSV(25));
  else if (a === 'add-loc') locationForm();
  else if (a === 'claim-new') claimForm();
  else if (a === 'point-new') pointForm();
  else if (a === 'copy-link') void copyLink();
  else if (a === 'shortcuts') shortcutsModal();
}

export function Guide() {
  const q = useApp(s => s.ui.guide.q);
  useApp(s => s.lang);
  const k = q.trim().toLowerCase();
  const text = (g: typeof CONTENT.guide[number]) => [g.title, g.summary, ...g.steps, ...g.tips].map(pp => `${pp[0]} ${pp[1]}`).join(' ').toLowerCase();
  const secs = CONTENT.guide.filter(g => !k || text(g).includes(k));
  const link = ([v, lab]: [string, Pair]) => (v.startsWith('act:')
    ? <Btn key={v} label={L2(lab)} icon="arrowR" variant="sm" onClick={() => runContentAction(v.slice(4))} />
    : <Go key={v} label={L2(lab)} view={v as ViewId} variant="sm" />);
  return (
    <div className="bs-stack-20" data-no-i18n="">
      <PageHead title={L2(['Panduan Pengguna', 'User Guide'])} desc={L2(['Cara memakai setiap fitur BranchSync, langkah demi langkah. Klik tombol di setiap bagian untuk langsung membuka halamannya.', 'How to use every BranchSync feature, step by step. Click the buttons in each section to open the page directly.'])}
        actions={<><button type="button" className="bs-btn" onClick={() => navigate('scenarios')}><Ic name="clipboard" /><span>Scenario Test</span></button><Btn label={L2(['Cetak panduan', 'Print guide'])} icon="printer" onClick={() => window.print()} /></>} />
      <div className="bs-guide">
        <nav className="bs-guide-toc" aria-label={L2(['Daftar isi', 'Contents'])}>
          <label className="bs-field"><span>{L2(['Cari di panduan', 'Search the guide'])}</span><span className="bs-input-ic"><Ic name="search" /><input type="search" id="bsGuideQ" data-search value={q} placeholder={L2(['Mis. impor, ulasan, SLA…', 'E.g. import, reviews, SLA…'])} autoComplete="off" onChange={e => { const v = e.target.value; setUi(ui => { ui.guide.q = v; }); }} /></span></label>
          <ol>{CONTENT.guide.map(g => <li key={g.id}><button type="button" disabled={!secs.includes(g)} onClick={() => { const sec = document.getElementById(`guide-${g.id}`); if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); (sec.querySelector('h2') as HTMLElement | null)?.focus({ preventScroll: true }); } }}><Ic name={g.icon} /><span>{L2(g.title)}</span></button></li>)}</ol>
        </nav>
        <div className="bs-guide-body">{secs.length ? secs.map((g, i) => (
          <section key={g.id} className="bs-card bs-guide-sec" id={`guide-${g.id}`}>
            <header className="bs-card-head"><div className="bs-guide-title"><span className="bs-guide-ic"><Ic name={g.icon} /></span><div><h2 tabIndex={-1}>{i + 1}. {L2(g.title)}</h2><p>{L2(g.summary)}</p></div></div></header>
            <div className="bs-card-body">
              <ol className="bs-guide-steps">{g.steps.map((st, j) => <li key={j}>{L2(st)}</li>)}</ol>
              {g.tips.length > 0 && <div className="bs-callout"><Ic name="info" /><p>{g.tips.map((t, j) => <span key={j}>{j > 0 && <br />}{L2(t)}</span>)}</p></div>}
              {g.links.length > 0 && <div className="bs-btn-row">{g.links.map(link)}</div>}
            </div>
          </section>
        )) : <Card title={L2(['Tidak ditemukan', 'Not found'])}><EmptyState title={L2(['Tidak ada bagian yang cocok', 'No matching section'])} text={L2(['Coba kata kunci lain.', 'Try another keyword.'])} icon="search" /></Card>}</div>
      </div>
    </div>
  );
}

/* ---------- Scenario Test: hasil disimpan di browser ini ---------- */
interface Evidence { type: 'auto' | 'image'; text?: string; data?: string; time: number }
interface ScnItem { result: string; notes: string; checks: boolean[]; evidence: Evidence[]; updatedAt: number | null }
interface ScnState { tester: string; org: string; items: Record<number, ScnItem> }
const SCN_KEY = 'branchSync.scenarioTests.v1';
export const useScn = create<ScnState>(() => ({ tester: '', org: '', items: {} }));
// Muat dari IndexedDB (atau localStorage versi lama) saat modul dimuat.
void (async () => {
  try {
    let sc = await idbGet<ScnState>('scenarioTests');
    if (!sc) { const raw = localStorage.getItem(SCN_KEY); if (raw) { sc = JSON.parse(raw); await idbSet('scenarioTests', sc); localStorage.removeItem(SCN_KEY); } }
    if (sc && typeof sc === 'object') useScn.setState({ ...{ tester: '', org: '', items: {} }, ...sc });
  } catch { /* IndexedDB tidak tersedia */ }
})();
let saveTimer = 0;
const saveScn = (delay = 0) => { clearTimeout(saveTimer); saveTimer = window.setTimeout(() => { idbSet('scenarioTests', useScn.getState()).catch(() => toast(L2(['Penyimpanan browser penuh — hapus beberapa foto bukti.', 'Browser storage is full — remove some evidence photos.']), { tone: 'bad' })); }, delay); };
// Satu objek kosong bersama: selector Zustand harus mengembalikan referensi yang stabil.
const EMPTY_ITEM: ScnItem = Object.freeze({ result: '', notes: '', checks: [], evidence: [], updatedAt: null }) as ScnItem;
const peek = (s: ScnState, no: number): ScnItem => s.items[no] || EMPTY_ITEM;
function updateItem(no: number, fn: (it: ScnItem) => void, delay = 0) {
  useScn.setState(s => { const it: ScnItem = JSON.parse(JSON.stringify(peek(s, no))); fn(it); it.updatedAt = Date.now(); return { items: { ...s.items, [no]: it } }; });
  saveScn(delay);
}
const SCN_RESULTS: [string, Pair, string][] = [['standard', ['Standar', 'Standard'], 'good'], ['partial', ['Kurang standar', 'Partially standard'], 'warn'], ['failed', ['Tidak dapat dijalankan', 'Cannot be run'], 'bad']];
const ScnBadge = ({ r }: { r: string }) => { const x = SCN_RESULTS.find(y => y[0] === r); return <span className="bs-badge" data-tone={x ? x[2] : 'neutral'}><i />{x ? L2(x[1]) : L2(['Belum diuji', 'Not tested'])}</span>; };

function autoEvidence(no: number) {
  const s = getApp(), ws = s.ws!, Ls = ws.locations, im = issueMap(ws), lr = ws.runs[0], fields = ['name', 'phone', 'hours', 'address', 'coords'];
  const cnt = <T,>(xs: T[], f: (x: T) => unknown) => xs.filter(f).length, claimsOf = (k: string) => ws.claims.filter(c => (k === 'Titik baru') === (c.kind === 'Titik baru'));
  const sla = slaStats(ws), bk = reportBuckets('30'), m30 = reportMetrics(ws, bk.from, bk.to, { locs: Ls, codes: new Set(Ls.map(l => l.code)), filtered: false });
  const run = lr ? `Sinkronisasi terakhir ${lr.id}: ${lr.ok} berhasil, ${lr.fail} gagal, ${lr.skip} dilewati (${fmtDate(lr.time)})` : 'Belum ada sinkronisasi';
  const fails = openFailures(ws), scn = useScn.getState();
  const lines: Record<number, string[]> = {
    1: [`Total unit: ${Ls.length}`, `Unit tanpa listing Google: ${cnt(Ls, l => !l.google)}`, `Unit ditambah/diubah 24 jam terakhir: ${cnt(Ls, l => Date.now() - l.updatedAt < DAY)}`, `Impor tercatat di riwayat: ${cnt(ws.audit, a => a.action === 'Mengimpor data massal')}`, run],
    2: [`Total unit: ${Ls.length}`, ...STATUSES.map(st => `${st}: ${cnt(Ls, l => l.status === st)}`), `Pencarian aktif: "${s.ui.loc.q || '-'}"`, `Filter aktif: ${FILTERS.flatMap(([k]) => s.ui.loc[k].map(v => `${k}=${v}`)).join(', ') || '-'}`, `Hasil daftar saat ini: ${locFiltered(ws, s.ui.loc).length} unit`],
    3: [`Unit dengan ketidaksesuaian: ${im.size}`, ...fields.map(f => `${FIELD_LABEL[f]}: ${sum([...im.values()].map(x => x.filter(i => i.field === f).length))}`), `Catatan temuan: ${Object.keys(ws.discNotes).length}`, `Keputusan tercatat di riwayat: ${cnt(ws.audit, a => a.module === 'Ketidaksesuaian')}`],
    4: [`Total unit: ${Ls.length}`, `Waktu render halaman terakhir: ${useRenderStat.getState().ms} ms`, `Ukuran layar: ${innerWidth}×${innerHeight}`, `Peramban: ${navigator.userAgent}`],
    5: [`Perubahan unit tercatat 24 jam terakhir: ${cnt(ws.audit, a => a.module === 'Unit Kerja' && Date.now() - a.time < DAY)}`, `Unit masih berbeda dengan Google: ${im.size}`, run],
    6: [`Klaim (Get Verified/Suspend/Duplicate): ${claimsOf('x').length}`, `Selesai: ${cnt(claimsOf('x'), c => c.status === 'Selesai')}`, `Berjalan: ${cnt(claimsOf('x'), claimActive)}`, `Unit terverifikasi: ${cnt(Ls, l => l.gbp === 'Terverifikasi')}/${Ls.length}`, `Belum diklaim: ${cnt(Ls, l => l.gbp === 'Belum Diklaim')} · Suspend: ${cnt(Ls, l => l.gbp === 'Suspend')}`],
    7: [`Pengajuan titik baru: ${claimsOf('Titik baru').length}`, `Selesai: ${cnt(claimsOf('Titik baru'), c => c.status === 'Selesai')}`, `Berjalan: ${cnt(claimsOf('Titik baru'), claimActive)}`, `Ditolak: ${cnt(claimsOf('Titik baru'), c => c.status === 'Ditolak')}`],
    8: [`Pasangan duplikat terdeteksi: ${duplicatePairs(ws).pairs.length}`, `Ditandai bukan duplikat: ${ws.dupIgnored.length}`, `Unit berstatus Duplikat: ${cnt(Ls, l => l.gbp === 'Duplikat')}`, `Radius deteksi: ${ws.settings.dupRadius} m`],
    9: [`Notifikasi edit eksternal: ${ws.api.webhook ? 'aktif' : 'nonaktif'}`, `Menunggu: ${cnt(ws.approvals, a => a.status === 'Menunggu')}`, `Disetujui: ${cnt(ws.approvals, a => a.status === 'Disetujui')}`, `Ditolak: ${cnt(ws.approvals, a => a.status === 'Ditolak')}`, `Entri riwayat eksternal: ${cnt(ws.audit, a => a.actor === 'Eksternal')}`],
    10: [`Entri riwayat: ${ws.audit.length}`, `Internal: ${cnt(ws.audit, a => a.actor === 'Internal')}`, `Eksternal: ${cnt(ws.audit, a => a.actor === 'Eksternal')}`, `Entri dengan detail sebelum–sesudah: ${cnt(ws.audit, a => a.changes.length)}`, `Pengguna tercatat: ${new Set(ws.audit.map(a => a.user)).size}`],
    11: [`Rata-rata proses internal: ${fmtDur(sla.avgInternal)}`, `Rata-rata verifikasi Google: ${fmtDur(sla.avgGoogle)}`, `Kepatuhan SLA internal: ${sla.compliance}%`, `Target internal: ${ws.settings.slaInternal} jam · acuan Google: ${ws.settings.slaGoogle} jam`, `Permintaan berisiko/lewat SLA: ${sla.atRisk}`],
    12: [`Kegagalan belum ditangani: ${fails.length}`, ...[...fails.reduce((mp, f) => mp.set(f.reason, (mp.get(f.reason) || 0) + 1), new Map<string, number>())].map(([k, n]) => `· ${k}: ${n}`), `Kegagalan sudah diberi tindak lanjut: ${sum(ws.runs.map(r => r.items.filter(i => i.status === 'Gagal' && i.resolved && i.note && !/^Berhasil/.test(i.note)).length))}`, run],
    13: [`Keberhasilan sync 30 hari: ${m30.rate == null ? '-' : m30.rate.toFixed(1) + '%'}`, `Rata-rata rating 30 hari: ${m30.avgRating == null ? '-' : m30.avgRating.toFixed(2)}`, `Tingkat balasan ulasan: ${m30.replyRate == null ? '-' : m30.replyRate.toFixed(1) + '%'}`, `Kepatuhan SLA internal: ${sla.compliance}%`, `Skenario teruji: ${CONTENT.scenarios.filter(x => peek(scn, x.no).result).length}/${CONTENT.scenarios.length}`]
  };
  return [`Bukti otomatis · Live (${api.host()}) · ${fmtDate(Date.now())}`, ...(lines[no] || [])].join('\n');
}
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error(L2(['Berkas bukan gambar.', 'File is not an image.']))); return; }
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(L2(['Gambar tidak dapat dibaca.', 'The image could not be read.']))); };
    img.src = url;
  });
}
function scnStart(x: Scenario, act?: string) {
  navigate(x.start.view as ViewId);
  const a = act || x.start.act;
  if (a) setTimeout(() => runContentAction(a), 30);
}

function ScenarioCard({ x }: { x: Scenario }) {
  const it = useScn(s => peek(s, x.no));
  const open = useApp(s => s.ui.scn.open.has(x.no));
  const gName = (id: string) => L2((CONTENT.scenarioGroups.find(g => g.id === id) || { title: [id, id] as Pair }).title);
  const navName = (v: string) => { const lab = navItem(v).label; return L2([lab, AdminI18n.translate(lab) || lab]); };
  const checked = x.evidence.filter((_, i) => it.checks[i]).length;
  return (
    <details className="bs-scn" data-scn-no={x.no} open={open} onToggle={e => { const o = (e.target as HTMLDetailsElement).open; if (o !== open) setUi(ui => { if (o) ui.scn.open.add(x.no); else ui.scn.open.delete(x.no); }); }}>
      <summary><span className="bs-scn-no">{x.no}</span><span className="bs-scn-title"><strong>{L2(x.title)}</strong><small>{gName(x.group)} · Mandatory · {checked}/{x.evidence.length} {L2(['bukti', 'evidence'])}</small></span><ScnBadge r={it.result} /><Ic name="chevD" cls="bs-scn-caret" /></summary>
      <div className="bs-scn-body">
        <div className="bs-scn-meta"><div><h4>{L2(['Hasil yang diharapkan', 'Expected result'])}</h4><p>{L2(x.expected)}</p></div><div><h4>{L2(['Catatan dokumen', 'Document note'])}</h4><p>{L2(x.note)}</p></div></div>
        <h4>{L2(['Langkah pengujian di BranchSync', 'Test steps in BranchSync'])}</h4>
        <ol className="bs-scn-steps">{x.steps.map((st, i) => (
          <li key={i}><span>{L2(st.t)}</span>
            {st.go ? <button type="button" className="bs-btn sm ghost" onClick={() => navigate(st.go as ViewId)}><Ic name="arrowR" /><span>{L2(['Buka', 'Open'])} {navName(st.go)}</span></button>
              : st.act ? <Btn label={L2(['Jalankan', 'Run'])} icon="zap" variant="sm ghost" onClick={() => scnStart({ ...x, start: { view: { 'import-sample': 'locations', 'claim-new': 'claims', 'point-new': 'claims' }[st.act!] || x.start.view } }, st.act)} /> : null}</li>
        ))}</ol>
        <h4>{L2(['Bukti yang perlu dikumpulkan', 'Evidence to collect'])}</h4>
        <ul className="bs-scn-checks">{x.evidence.map((e, i) => <li key={i}><label className="bs-checkline"><input type="checkbox" checked={!!it.checks[i]} onChange={ev => { const on = ev.target.checked; updateItem(x.no, t => { t.checks[i] = on; }); }} /><span>{L2(e)}</span></label></li>)}</ul>
        {it.evidence.length > 0 && <div className="bs-scn-evidence">{it.evidence.map((ev, i) => {
          const del = <Btn icon="trash" variant="icon sm ghost" title={L2(['Hapus bukti', 'Delete evidence'])} onClick={() => confirmModal(L2([`Hapus bukti ${i + 1} skenario ${x.no}?`, `Delete evidence ${i + 1} of scenario ${x.no}?`]), L2([ev.type === 'image' ? 'Foto bukti ini akan dihapus dari browser ini.' : 'Bukti otomatis ini akan dihapus dari browser ini.', ev.type === 'image' ? 'This evidence photo will be deleted from this browser.' : 'This auto evidence will be deleted from this browser.']), L2(['Hapus bukti', 'Delete evidence']), () => {
            updateItem(x.no, t => { t.evidence.splice(i, 1); });
            toast(L2(['Bukti dihapus.', 'Evidence deleted.']), { action: { label: L2(['Urungkan', 'Undo']), run: () => updateItem(x.no, t => { t.evidence.splice(Math.min(i, t.evidence.length), 0, ev); }) } });
          }, { undo: 'any' })} />;
          return ev.type === 'image'
            ? <figure key={i} className="bs-scn-photo"><button type="button" className="bs-scn-thumb" aria-label={`${L2(['Lihat foto bukti', 'View evidence photo'])} ${i + 1}`} onClick={() => infoModal(`${L2(['Bukti skenario', 'Scenario evidence'])} ${x.no}`, <img className="bs-scn-full" src={ev.data} alt={L2(['Foto bukti', 'Evidence photo'])} />, true)}><img src={ev.data} alt="" /></button><figcaption>{fmtDate(ev.time, { dateStyle: 'short', timeStyle: 'short' })}{del}</figcaption></figure>
            : <div key={i} className="bs-scn-auto"><pre>{ev.text}</pre>{del}</div>;
        })}</div>}
        <div className="bs-btn-row bs-scn-actions">
          <Btn label={L2(['Mulai skenario', 'Start scenario'])} icon="arrowR" variant="primary sm" onClick={() => scnStart(x)} />
          <Btn label={L2(['Ambil bukti otomatis', 'Capture auto evidence'])} icon="zap" variant="sm" onClick={() => { updateItem(x.no, t => { t.evidence.push({ type: 'auto', text: autoEvidence(x.no), time: Date.now() }); }); toast(L2(['Bukti otomatis ditambahkan.', 'Auto evidence added.']), { tone: 'good' }); }} />
          <label className="bs-btn sm bs-file"><Ic name="camera" /><span>{L2(['Unggah foto bukti', 'Upload evidence photo'])}</span>
            <input type="file" accept="image/*" multiple className="bs-sr" onChange={e => {
              const input = e.currentTarget, have = it.evidence.filter(ev => ev.type === 'image').length;
              const files = [...(input.files || [])].slice(0, Math.max(0, 4 - have)); input.value = '';
              if (!files.length) { toast(L2(['Maksimal 4 foto per skenario.', 'Maximum 4 photos per scenario.']), { tone: 'warn' }); return; }
              Promise.all(files.map(compressImage)).then(datas => {
                updateItem(x.no, t => { datas.forEach(d => t.evidence.push({ type: 'image', data: d, time: Date.now() })); });
                toast(L2([`${datas.length} foto bukti ditambahkan.`, `${datas.length} evidence photo(s) added.`]), { tone: 'good' });
              }).catch(err => toast((err as Error).message, { tone: 'bad' }));
            }} /></label>
        </div>
        <fieldset className="bs-scn-result"><legend>{L2(['Hasil pengujian', 'Test result'])}</legend>{SCN_RESULTS.map(([k, lab, tone]) => (
          <label key={k} className="bs-scn-radio" data-tone={tone}><input type="radio" name={`scn-res-${x.no}`} value={k} checked={it.result === k} onChange={() => { updateItem(x.no, t => { t.result = k; }); toast(L2(['Hasil pengujian disimpan.', 'Test result saved.']), { tone: 'good' }); }} /><span>{L2(lab)}</span></label>
        ))}</fieldset>
        <label className="bs-field"><span>{L2(['Catatan / temuan penguji', 'Tester notes / findings'])}</span><textarea rows={3} value={it.notes} placeholder={L2(['Tulis hasil pengamatan, kendala, atau rekomendasi…', 'Write observations, issues, or recommendations…'])} onChange={e => { const v = e.target.value; updateItem(x.no, t => { t.notes = v; }, 400); }} /></label>
        {it.updatedAt && <p className="bs-muted">{L2(['Terakhir diperbarui', 'Last updated'])} {fmtDate(it.updatedAt)}</p>}
      </div>
    </details>
  );
}

export function Scenarios() {
  useWs();
  useApp(s => s.lang);
  const group = useApp(s => s.ui.scn.group);
  const scn = useScn();
  const all = CONTENT.scenarios, groups = CONTENT.scenarioGroups, list = all.filter(x => !group || x.group === group);
  const counts = SCN_RESULTS.map(([k]) => all.filter(x => peek(scn, x.no).result === k).length), tested = sum(counts);
  const exportCsv = () => {
    const rows: unknown[][] = [['No', 'Kelompok', 'Skenario', 'Hasil yang diharapkan', 'Prioritas', 'Catatan dokumen', 'Hasil pengujian', 'Catatan penguji', 'Bukti dicentang', 'Bukti otomatis', 'Jumlah foto', 'Diperbarui', 'Penguji', 'Instansi', 'Mode']];
    all.forEach(x => { const it = peek(scn, x.no), res = SCN_RESULTS.find(y => y[0] === it.result); rows.push([x.no, (groups.find(g => g.id === x.group) || { title: [x.group, x.group] }).title[0], x.title[0], x.expected[0], 'Mandatory', x.note[0], res ? res[1][0] : 'Belum diuji', it.notes || '', `${x.evidence.filter((_, i) => it.checks[i]).length}/${x.evidence.length}`, it.evidence.filter(e => e.type === 'auto').map(e => e.text).join('\n---\n'), it.evidence.filter(e => e.type === 'image').length, fmtStamp(it.updatedAt), scn.tester, scn.org, 'Live']); });
    downloadCSV(`hasil-scenario-test-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast(L2(['Laporan hasil Scenario Test diunduh.', 'Scenario Test results downloaded.']), { tone: 'good' });
  };
  const print = () => {
    const prev = new Set(getApp().ui.scn.open), prevGroup = group;
    setUi(ui => { ui.scn.group = ''; all.forEach(x => ui.scn.open.add(x.no)); });
    setTimeout(() => { window.print(); setUi(ui => { ui.scn.open = prev; ui.scn.group = prevGroup; }); }, 60);
  };
  const setMeta = (k: 'tester' | 'org', v: string) => { useScn.setState({ [k]: v.slice(0, 80) }); saveScn(400); };
  return (
    <div className="bs-stack-20" data-no-i18n="">
      <div className="bs-print-head"><strong>{L2(['Laporan Hasil Scenario Test — BranchSync', 'Scenario Test Results Report — BranchSync'])}</strong><span>{L2(['Penguji', 'Tester'])}: {scn.tester || '-'} · {scn.org} · Mode: Live · {L2(['Dicetak', 'Printed'])}: {fmtDate(Date.now())}</span></div>
      <PageHead title="Scenario Test" desc={L2(['Tutorial menjalankan 13 skenario uji piloting Dashboard BranchSync sesuai dokumen “Skenario Test Piloting”, lengkap dengan pencatatan hasil dan bukti.', 'A tutorial for running the 13 BranchSync dashboard piloting test scenarios from the “Piloting Test Scenario” document, with result and evidence recording.'])}
        actions={<><Btn label={L2(['Ekspor CSV', 'Export CSV'])} icon="download" onClick={exportCsv} /><Btn label={L2(['Cetak / PDF', 'Print / PDF'])} icon="printer" variant="primary" onClick={print} /></>} />
      <div className="bs-grid bs-grid-main">
        <Card title={L2(['Kemajuan pengujian', 'Test progress'])}>
          <div className="bs-scn-progress"><strong>{tested}<small>/{all.length}</small></strong><span>{L2(['skenario sudah diuji', 'scenarios tested'])}</span></div>
          <div className="bs-comp-bar bs-scn-bar" role="img" aria-label={SCN_RESULTS.map(([, lab], i) => `${L2(lab)} ${counts[i]}`).join(', ')}>{SCN_RESULTS.map(([k, , tone], i) => (counts[i] ? <span key={k} data-tone={tone} style={{ flex: counts[i] }} /> : null))}{all.length - tested > 0 && <span data-tone="neutral" style={{ flex: all.length - tested }} />}</div>
          <ul className="bs-comp-legend">{SCN_RESULTS.map(([k, lab, tone], i) => <li key={k}><i data-tone={tone} /><span>{L2(lab)}</span><b>{counts[i]}</b></li>)}<li><i data-tone="neutral" /><span>{L2(['Belum diuji', 'Not tested'])}</span><b>{all.length - tested}</b></li></ul>
        </Card>
        <Card title={L2(['Informasi penguji', 'Tester information'])}>
          <div className="bs-form-grid">
            <label className="bs-field"><span>{L2(['Nama penguji', 'Tester name'])}</span><input value={scn.tester} maxLength={80} autoComplete="name" onChange={e => setMeta('tester', e.target.value)} /></label>
            <label className="bs-field"><span>{L2(['Instansi / divisi', 'Organization / division'])}</span><input value={scn.org} maxLength={80} onChange={e => setMeta('org', e.target.value)} /></label>
          </div>
          <p className="bs-muted bs-gap">{L2(['Hasil disimpan di browser ini dan dapat diekspor sebagai bukti.', 'Results are saved in this browser and can be exported as evidence.'])}</p>
          <Btn label={L2(['Reset hasil', 'Reset results'])} icon="trash" variant="sm danger ghost" onClick={() => confirmModal(L2(['Reset semua hasil Scenario Test?', 'Reset all Scenario Test results?']), L2(['Semua hasil, catatan, dan bukti pengujian di browser ini akan dihapus.', 'All results, notes, and evidence in this browser will be deleted.']), L2(['Reset hasil', 'Reset results']), () => { useScn.setState({ items: {} }); saveScn(); toast(L2(['Hasil Scenario Test direset.', 'Scenario Test results reset.'])); })} />
        </Card>
      </div>
      <Callout>{L2(['Cara memakai: buka skenario → klik ', 'How to use: open a scenario → click '])}<b>{L2(['Mulai skenario', 'Start scenario'])}</b>{L2([' atau tombol di setiap langkah → lakukan pengujian → centang bukti, ambil bukti otomatis atau unggah foto → pilih hasil ', ' or the button on each step → run the test → tick evidence, capture auto evidence or upload photos → choose '])}<b>{L2(['Standar / Kurang standar / Tidak dapat dijalankan', 'Standard / Partially standard / Cannot be run'])}</b>{L2([' dan tulis catatan.', ' and write notes.'])}</Callout>
      <Tabs bind="scn.group" label={L2(['Kelompok skenario', 'Scenario groups'])} cur={group} onChange={v => setUi(ui => { ui.scn.group = v; })} items={[['', L2(['Semua', 'All']), all.length], ...groups.map(g => [g.id, L2(g.title), all.filter(x => x.group === g.id).length] as [string, string, number])]} />
      <TabPanel bind="scn.group" cur={group}>
        {groups.filter(g => list.some(x => x.group === g.id)).map(g => (
          <section key={g.id} className="bs-scn-group"><h2 className="bs-scn-group-title">{L2(g.title)}</h2>{list.filter(x => x.group === g.id).map(x => <ScenarioCard key={x.no} x={x} />)}</section>
        ))}
      </TabPanel>
    </div>
  );
}
