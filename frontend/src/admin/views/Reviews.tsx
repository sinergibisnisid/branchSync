// Halaman Ulasan Google: pilih akun & lokasi, ringkasan rating, saring, dan balas ulasan.
import { useRef } from 'react';
import { acctOf, byCode, locName } from '../../lib/data';
import { fillTemplate, navItem, REPLY_MAX, REPLY_TEMPLATES } from '../../lib/domain';
import { downloadCSV } from '../../lib/files';
import { fmtNum, fmtStamp, initials, pct, sum } from '../../lib/format';
import type { Review, Workspace } from '../../lib/types';
import { getApp, setUi, toast, useApp, type ReviewsUi } from '../../store';
import { deleteReply, sendReply } from '../actions';
import { Badge, Btn, Card, ChipRow, cx, EmptyState, PageHead, SearchF, SelectF, Stars, When } from '../ui/components';
import { Ic } from '../ui/Icon';
import { closeDrawer, loadLive, navigate, openDrawer, useWs } from '../workspace';

const setRv = (fn: (r: ReviewsUi) => void) => setUi(ui => { fn(ui.reviews); });

function reviewScope(ws: Workspace, f: ReviewsUi) {
  return ws.reviews.filter(rv => { const l = byCode(ws).get(rv.code); return l && (!f.account || acctOf(l) === f.account) && (!f.location || rv.code === f.location); });
}
export function reviewFiltered(ws: Workspace, f: ReviewsUi) {
  const q = f.q.trim().toLowerCase();
  const xs = reviewScope(ws, f).filter(rv => (!f.rating || rv.rating === Number(f.rating)) && (!f.status || (f.status === 'replied' ? !!rv.reply : !rv.reply)) &&
    (!q || `${rv.author} ${rv.text} ${rv.reply ? rv.reply.text : ''} ${locName(ws, rv.code)}`.toLowerCase().includes(q)));
  const sorters: Record<string, (a: Review, b: Review) => number> = { newest: (a, b) => b.time - a.time, unreplied: (a, b) => (Number(!!a.reply) - Number(!!b.reply)) || b.time - a.time, lowest: (a, b) => a.rating - b.rating || b.time - a.time, highest: (a, b) => b.rating - a.rating || b.time - a.time };
  return xs.sort(sorters[f.sort] || sorters.newest);
}
/** Buka halaman Ulasan untuk satu lokasi. */
export function openReviewsFor(code: string) {
  const l = byCode(getApp().ws!).get(code); if (!l) return;
  setRv(r => { r.account = acctOf(l); r.location = code; r.limit = 20; });
  closeDrawer();
  navigate('reviews');
}

export function ReviewCard({ rv, showLoc = true }: { rv: Review; showLoc?: boolean }) {
  const ws = useWs();
  const editing = useApp(s => s.ui.reviews.editing === rv.id);
  const draft = useApp(s => s.ui.reviews.drafts[rv.id]) ?? (rv.reply ? rv.reply.text : '');
  const ta = useRef<HTMLTextAreaElement>(null);
  const l = byCode(ws).get(rv.code);
  const startEdit = (text: string) => { setRv(r => { r.editing = rv.id; r.drafts[rv.id] = text; }); requestAnimationFrame(() => ta.current?.focus()); };
  const send = async () => {
    const text = String(getApp().ui.reviews.drafts[rv.id] ?? '').trim();
    if (!text) { toast('Balasan tidak boleh kosong.', { tone: 'warn' }); ta.current?.focus(); return; }
    if (text.length > REPLY_MAX) { toast(`Balasan maksimal ${fmtNum(REPLY_MAX)} karakter.`, { tone: 'warn' }); return; }
    if (await sendReply(rv.id, text)) setRv(r => { r.editing = null; delete r.drafts[rv.id]; });
  };
  return (
    <article className="bs-review" data-low={rv.rating <= 2} aria-label={`Ulasan ${rv.author}, ${rv.rating} bintang`}>
      <header>
        <span className="bs-avatar sm" aria-hidden="true">{initials(rv.author)}</span>
        <div className="bs-review-who"><strong>{rv.author}</strong><small><Stars n={rv.rating} /><span>·</span><When t={rv.time} /></small></div>
        {showLoc && l && <button type="button" className="bs-review-loc" onClick={() => openDrawer(l.code, 'reviews')}><Ic name="pin" /><span>{l.name}</span></button>}
        {rv.reply ? <Badge s="Berhasil" label="Dibalas" /> : <Badge s="Menunggu" label="Belum dibalas" />}
      </header>
      <p className={cx('bs-review-text', !rv.text && 'bs-muted')}>{rv.text || '(Hanya memberi rating, tanpa komentar)'}</p>
      {rv.reply && !editing && (
        <div className="bs-reply">
          <div className="bs-reply-head"><strong>Balasan pemilik</strong><small>{rv.reply.by || ''} · <When t={rv.reply.time} /></small><span className="bs-spacer" />
            <Btn icon="edit" variant="icon sm ghost" title="Ubah balasan" perm="reviews.reply" onClick={() => startEdit(rv.reply!.text)} />
            <Btn icon="trash" variant="icon sm ghost" title="Hapus balasan" perm="reviews.reply" onClick={() => deleteReply(rv.id)} /></div>
          <p>{rv.reply.text}</p>
        </div>
      )}
      {editing ? (
        <div className="bs-reply-editor">
          <label className="bs-sr" htmlFor={`rv-text-${rv.id}`}>Balasan untuk {rv.author}</label>
          <textarea ref={ta} id={`rv-text-${rv.id}`} rows={3} maxLength={REPLY_MAX} placeholder="Tulis balasan yang sopan dan membantu…" value={draft} onChange={e => { const v = e.target.value; setRv(r => { r.drafts[rv.id] = v; }); }} />
          <div className="bs-reply-tools">
            <label className="bs-inline-select"><span className="bs-sr">Template balasan</span>
              <select value="" onChange={e => { const tpl = REPLY_TEMPLATES[Number(e.target.value)]; if (!tpl) return; const text = fillTemplate(tpl.text, rv.author, locName(ws, rv.code)); setRv(r => { r.drafts[rv.id] = text; }); ta.current?.focus(); }}>
                <option value="">Pakai template…</option>{REPLY_TEMPLATES.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
              </select></label>
            <small className="bs-char" id={`rv-count-${rv.id}`}>{draft.length}/{fmtNum(REPLY_MAX)}</small><span className="bs-spacer" />
            <Btn label="Batal" variant="sm ghost" onClick={() => setRv(r => { r.editing = null; delete r.drafts[rv.id]; })} />
            <Btn label={rv.reply ? 'Simpan balasan' : 'Kirim balasan'} icon="send" variant="sm primary" perm="reviews.reply" onClick={() => { void send(); }} />
          </div>
          <p className="bs-reply-hint">Balasan tampil publik di Google Maps sebagai pemilik “{l ? l.name : 'unit'}”.</p>
        </div>
      ) : !rv.reply && <div className="bs-review-actions"><Btn label="Balas" icon="chat" variant="sm" perm="reviews.reply" onClick={() => startEdit('')} /></div>}
    </article>
  );
}

export function RatingSummary({ scope, clickable = true }: { scope: Review[]; clickable?: boolean }) {
  const rating = useApp(s => s.ui.reviews.rating);
  const avg = scope.length ? sum(scope.map(r => r.rating)) / scope.length : 0, replied = scope.filter(r => r.reply).length;
  const dist = [5, 4, 3, 2, 1].map(n => [n, scope.filter(r => r.rating === n).length] as const), maxD = Math.max(1, ...dist.map(d => d[1]));
  const neg = scope.filter(r => r.rating <= 2 && !r.reply).length;
  return (
    <div className="bs-rating-summary">
      <div className="bs-rating-big"><strong>{avg ? avg.toFixed(1).replace('.', ',') : '—'}</strong><Stars n={Math.round(avg)} /><small>{`${fmtNum(scope.length)} ulasan`}</small></div>
      <div className="bs-rating-dist">{dist.map(([n, c]) => {
        const on = String(rating) === String(n);
        const inner = <><span>{n}★</span><span className="bs-bar-track"><span style={{ width: `${(c / maxD) * 100}%` }} /></span><small>{fmtNum(c)}</small></>;
        return clickable
          ? <button key={n} type="button" className={cx('bs-rating-row', on && 'is-active')} aria-pressed={on} aria-label={`Saring ${n} bintang: ${c} ulasan`} onClick={() => setRv(r => { r.rating = on ? '' : String(n); r.limit = 20; })}>{inner}</button>
          : <div key={n} className="bs-rating-row">{inner}</div>;
      })}</div>
      <div className="bs-rating-kpis"><div><strong>{fmtNum(scope.length - replied)}</strong><small>Belum dibalas</small></div><div><strong>{pct(replied, scope.length)}%</strong><small>Tingkat balasan</small></div><div data-tone={neg ? 'warn' : undefined}><strong>{fmtNum(neg)}</strong><small>Negatif belum dibalas</small></div></div>
    </div>
  );
}

export function Reviews() {
  const ws = useWs();
  const f = useApp(s => s.ui.reviews);
  const accounts = ws.accounts || [];
  // Abaikan filter yang merujuk akun/lokasi yang sudah tidak ada.
  const account = f.account && accounts.some(a => a.id === f.account) ? f.account : '';
  const location = f.location && byCode(ws).has(f.location) ? f.location : '';
  const ff = { ...f, account, location };
  const scope = reviewScope(ws, ff), list = reviewFiltered(ws, ff), shown = list.slice(0, f.limit);
  const perCode = new Map<string, number>();
  ws.reviews.forEach(rv => perCode.set(rv.code, (perCode.get(rv.code) || 0) + 1));
  const acctCount = (id: string) => ws.reviews.filter(rv => acctOf(byCode(ws).get(rv.code)) === id).length;
  const locOpts = ws.locations.filter(l => perCode.has(l.code) && (!account || acctOf(l) === account)).sort((a, b) => a.name.localeCompare(b.name, 'id')).map(l => [l.code, `${l.name} (${perCode.get(l.code)})`] as [string, string]);
  const loc = location ? byCode(ws).get(location) : null;
  const acctName = (id: string) => accounts.find(a => a.id === id)?.name || '';
  const exportCsv = () => {
    downloadCSV('ulasan-google.csv', [['ID', 'Akun', 'Kode', 'Lokasi', 'Penulis', 'Rating', 'Ulasan', 'Waktu', 'Balasan', 'Dibalas oleh', 'Waktu balasan'], ...list.map(rv => { const lo = byCode(ws).get(rv.code); return [rv.id, acctName(acctOf(lo)), rv.code, lo ? lo.name : '', rv.author, rv.rating, rv.text, fmtStamp(rv.time), rv.reply ? rv.reply.text : '', rv.reply ? rv.reply.by : '', rv.reply ? fmtStamp(rv.reply.time) : '']; })]);
    toast(`${fmtNum(list.length)} ulasan diekspor.`, { tone: 'good' });
  };
  const chips = [
    f.q.trim() && { key: 'q', label: 'Kata kunci', value: f.q.trim(), onRemove: () => setRv(r => { r.q = ''; r.limit = 20; }) },
    f.status && { key: 'status', label: 'Status', value: f.status === 'replied' ? 'Sudah dibalas' : 'Belum dibalas', onRemove: () => setRv(r => { r.status = ''; r.limit = 20; }) },
    f.rating && { key: 'rating', label: 'Rating', value: `${f.rating}★`, onRemove: () => setRv(r => { r.rating = ''; r.limit = 20; }) }
  ].filter(Boolean) as { key: string; label: string; value: string; onRemove: () => void }[];

  return <>
    <PageHead title="Ulasan Google" desc={navItem('reviews').desc} actions={<><Btn label="Muat ulang" icon="refresh" onClick={() => { void loadLive({ silent: true }).then(ok => ok && toast('Ulasan diperbarui dari server.', { tone: 'good' })); }} /><Btn label="Ekspor CSV" icon="download" onClick={exportCsv} /></>} />
    <section className="bs-card"><div className="bs-card-body flush"><div className="bs-toolbar bs-review-pickers">
      <SelectF label="Akun Google Business Profile" xs={accounts.map(a => [a.id, `${a.name} (${acctCount(a.id)})`] as [string, string])} value={account} all="Semua akun" onChange={v => setRv(r => { r.account = v; r.location = ''; r.limit = 20; })} />
      <SelectF label="Lokasi Maps" xs={locOpts} value={location} all="Semua lokasi" onChange={v => setRv(r => { r.location = v; r.limit = 20; })} />
    </div></div></section>
    {loc && (
      <div className="bs-review-context"><Ic name="pin" /><div><strong>{loc.name}</strong><small>{loc.address} · {acctName(acctOf(loc))}</small></div>
        <Btn label="Detail lokasi" variant="sm" onClick={() => openDrawer(loc.code)} />
        <Btn icon="x" variant="icon sm ghost" title="Tampilkan semua lokasi" onClick={() => setRv(r => { r.location = ''; })} /></div>
    )}
    <Card title="Ringkasan rating" sub={loc ? `Untuk ${loc.name}` : account ? `Untuk ${acctName(account)}` : 'Semua akun dan lokasi · klik baris bintang untuk menyaring'}><RatingSummary scope={scope} /></Card>
    <section className="bs-card"><div className="bs-card-body flush">
      <div className="bs-toolbar">
        <SearchF label="Cari ulasan" value={f.q} ph="Nama, isi ulasan, atau balasan…" id="bsReviewQ" onChange={v => setRv(r => { r.q = v; r.limit = 20; })} />
        <SelectF label="Status" xs={[['unreplied', 'Belum dibalas'], ['replied', 'Sudah dibalas']]} value={f.status} onChange={v => setRv(r => { r.status = v; r.limit = 20; })} />
        <SelectF label="Urutkan" xs={[['newest', 'Terbaru'], ['unreplied', 'Belum dibalas dulu'], ['lowest', 'Rating terendah'], ['highest', 'Rating tertinggi']]} value={f.sort} all={null} onChange={v => setRv(r => { r.sort = v; r.limit = 20; })} />
      </div>
      <ChipRow chips={chips} onReset={() => setRv(r => { r.q = ''; r.status = ''; r.rating = ''; r.limit = 20; })} />
      <div className="bs-review-list">{shown.length ? shown.map(rv => <ReviewCard key={rv.id} rv={rv} />) : <EmptyState title="Tidak ada ulasan" text="Tidak ada ulasan yang cocok dengan pilihan akun, lokasi, atau filter ini." icon="star" />}</div>
      {list.length > shown.length && <div className="bs-more"><Btn label={`Tampilkan ${Math.min(20, list.length - shown.length)} lagi · ${fmtNum(list.length - shown.length)} tersisa`} variant="sm" onClick={() => setRv(r => { r.limit += 20; })} /></div>}
    </div></section>
  </>;
}
