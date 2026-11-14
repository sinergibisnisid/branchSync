/*
 * Halaman depan (sebelum masuk): ringkasan jaringan dan peta dengan data contoh, lalu tombol Masuk.
 * Data asli hanya tersedia di workspace setelah masuk ke server BranchSync.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { setApp, useApp } from '../store';
import { LANDING_I18N } from './i18n';

export const useLandingText = () => { const lang = useApp(s => s.lang); return (k: string) => (LANDING_I18N[k] || [k, k])[lang === 'en' ? 1 : 0]; };

/* ---------- Data contoh ---------- */
type St = 'Online' | 'Offline' | 'Belum Sync' | 'Tidak Aktif';
const STATUS: Record<St, { color: string; label: [string, string] }> = {
  Online: { color: '#1f8a5b', label: ['Online', 'Online'] },
  Offline: { color: '#e0660f', label: ['Offline', 'Offline'] },
  'Belum Sync': { color: '#1a6fc4', label: ['Belum sync', 'Not synced'] },
  'Tidak Aktif': { color: '#8a94a3', label: ['Tidak aktif', 'Inactive'] }
};
const KEYS = Object.keys(STATUS) as St[];
const regionOf = (p: string) => /Jakarta|Jawa/.test(p) ? 'Jawa' : /Sumatera/.test(p) ? 'Sumatera' : /Kalimantan/.test(p) ? 'Kalimantan' : /Sulawesi/.test(p) ? 'Sulawesi' : /Bali|Nusa/.test(p) ? 'Bali & Nusa Tenggara' : /Maluku/.test(p) ? 'Maluku' : 'Papua';
const LOCS = ([
  ['Jakarta', 'DKI Jakarta', -6.2088, 106.8456, 'Online'], ['Bandung', 'Jawa Barat', -6.9175, 107.6191, 'Online'], ['Semarang', 'Jawa Tengah', -6.9667, 110.4167, 'Online'],
  ['Surabaya', 'Jawa Timur', -7.2575, 112.7521, 'Online'], ['Denpasar', 'Bali', -8.65, 115.2167, 'Online'], ['Medan', 'Sumatera Utara', 3.5952, 98.6722, 'Online'],
  ['Palembang', 'Sumatera Selatan', -2.9761, 104.7754, 'Offline'], ['Padang', 'Sumatera Barat', -0.9471, 100.4172, 'Online'], ['Balikpapan', 'Kalimantan Timur', -1.2379, 116.8529, 'Online'],
  ['Pontianak', 'Kalimantan Barat', -0.0263, 109.3425, 'Belum Sync'], ['Makassar', 'Sulawesi Selatan', -5.1477, 119.4327, 'Online'], ['Manado', 'Sulawesi Utara', 1.4748, 124.8421, 'Online'],
  ['Ambon', 'Maluku', -3.6954, 128.1814, 'Offline'], ['Jayapura', 'Papua', -2.5337, 140.7181, 'Tidak Aktif'], ['Mataram', 'Nusa Tenggara Barat', -8.5833, 116.1167, 'Online']
] as [string, string, number, number, St][]).map(([city, province, lat, lng, status], i) => ({ city, province, lat, lng, status, region: regionOf(province), code: `DM-${String(i + 1).padStart(3, '0')}` }));
const SYNC = { ok: 13, fail: 1, skip: 1 };
const ACTIVITY = [{ code: 'DM-001', ok: true, time: '09.41' }, { code: 'DM-007', ok: false, time: '09.38' }, { code: 'DM-004', ok: true, time: '09.35' }, { code: 'DM-011', ok: true, time: '09.31' }];
const count = (s: St) => LOCS.filter(l => l.status === s).length;

const ICON: Record<string, string> = {
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>'
};
const Svg = ({ n }: { n: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[n] }} />;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function Landing({ onLogin }: { onLogin: () => void }) {
  const T = useLandingText();
  const lang = useApp(s => s.lang);
  const dark = useApp(s => s.dark);
  const text = (id: string, en: string) => (lang === 'en' ? en : id);
  const locale = lang === 'en' ? 'en-GB' : 'id-ID';
  const fmt = (n: number) => new Intl.NumberFormat(locale).format(n);
  const pctFmt = (v: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(v);
  const statusText = (s: St) => STATUS[s].label[lang === 'en' ? 1 : 0];
  const [q, setQ] = useState(''), [qIn, setQIn] = useState('');
  const [statuses, setStatuses] = useState<Set<St>>(new Set(KEYS));
  const [region, setRegion] = useState('');
  const [layer, setLayer] = useState('street');
  const [now, setNow] = useState(Date.now());
  const [scrolled, setScrolled] = useState(false);
  const [current, setCurrent] = useState('');
  const mapEl = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<{ map: L.Map; streets: L.TileLayer; topo: L.TileLayer; markers: L.LayerGroup; byCode: Map<string, L.CircleMarker>; moved: boolean } | null>(null);

  useEffect(() => { document.body.classList.toggle('dark', dark); }, [dark]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setTimeout(() => setQ(qIn), 150); return () => clearTimeout(t); }, [qIn]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', on, { passive: true });
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) setCurrent(en.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    ['peta', 'ringkasan', 'fitur'].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => { window.removeEventListener('scroll', on); io.disconnect(); };
  }, []);

  const filtered = useMemo(() => {
    const k = q.trim().toLocaleLowerCase('id');
    return LOCS.filter(l => statuses.has(l.status) && (!region || l.region === region) && (!k || `${l.city} ${l.province} ${l.code} ${l.region} ${statusText(l.status)}`.toLocaleLowerCase('id').includes(k)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, statuses, region, lang]);
  const isFiltered = !!q || !!region || statuses.size < KEYS.length;
  const fitIndonesia = () => { const r = mapRef.current; if (r && !r.moved) r.map.fitBounds([[-11, 95], [6, 141]], { padding: [10, 10], animate: false }); };

  useEffect(() => {
    if (!mapEl.current) return;
    const map = L.map(mapEl.current, { scrollWheelZoom: false, zoomControl: true });
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 });
    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors, SRTM | OpenTopoMap (CC-BY-SA)', maxZoom: 17 });
    streets.addTo(map);
    const markers = L.layerGroup().addTo(map);
    mapRef.current = { map, streets, topo, markers, byCode: new Map(), moved: false };
    map.on('dragstart zoomstart', (e: L.LeafletEvent) => { if ((e as L.LeafletEvent & { originalEvent?: Event }).originalEvent && mapRef.current) mapRef.current.moved = true; });
    map.once('focus', () => map.scrollWheelZoom.enable());
    const ro = new ResizeObserver(() => { map.invalidateSize({ pan: false }); fitIndonesia(); });
    ro.observe(mapEl.current);
    fitIndonesia();
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => { const r = mapRef.current; if (!r) return; r.map.removeLayer(r.streets); r.map.removeLayer(r.topo); (layer === 'topo' ? r.topo : r.streets).addTo(r.map); }, [layer]);
  useEffect(() => {
    const r = mapRef.current; if (!r) return;
    r.markers.clearLayers(); r.byCode = new Map();
    filtered.forEach(l => {
      const m = L.circleMarker([l.lat, l.lng], { radius: 8, color: '#fff', weight: 2, fillColor: STATUS[l.status].color, fillOpacity: 1 })
        .bindPopup(`<div class="map-popup"><strong>KC ${esc(l.city)}</strong><span>${l.code} · ${esc(l.province)}</span><span class="popup-status"><i style="background:${STATUS[l.status].color}"></i>${esc(statusText(l.status))}</span></div>`);
      m.addTo(r.markers); r.byCode.set(l.code, m);
    });
    if (isFiltered && filtered.length) { r.moved = true; r.map.fitBounds(L.latLngBounds(filtered.map(l => [l.lat, l.lng] as [number, number])), { padding: [40, 40], maxZoom: 9, animate: true }); }
    else if (!isFiltered) { r.moved = false; fitIndonesia(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const total = LOCS.length, online = count('Online'), attention = total - online, syncTotal = SYNC.ok + SYNC.fail + SYNC.skip;
  const regions = [...new Set(LOCS.map(l => l.region))].map(r => [r, LOCS.filter(l => l.region === r)] as const).sort((a, b) => b[1].length - a[1].length);
  const maxR = Math.max(...regions.map(r => r[1].length));
  const stats = [
    { icon: 'pin', tone: 'blue', label: text('Total lokasi', 'Total locations'), value: fmt(total), note: text(`Tersebar di ${regions.length} region`, `Across ${regions.length} regions`) },
    { icon: 'check', tone: 'green', label: text('Lokasi online', 'Online locations'), value: fmt(online), note: text(`${pctFmt(online / total)} dari total`, `${pctFmt(online / total)} of total`) },
    { icon: 'alert', tone: 'orange', label: text('Perlu perhatian', 'Need attention'), value: fmt(attention), note: text('Offline, belum sync, atau tidak aktif', 'Offline, not synced, or inactive') },
    { icon: 'refresh', tone: 'blue', label: text('Keberhasilan sync', 'Sync success rate'), value: pctFmt(SYNC.ok / syncTotal), note: text(`${SYNC.ok} dari ${syncTotal} proses · terakhir 09.41 WIB`, `${SYNC.ok} of ${syncTotal} runs · last 09.41 WIB`) }
  ];
  const parts: [number, string, string][] = [[SYNC.ok, '#1f8a5b', text('Berhasil', 'Successful')], [SYNC.fail, '#d23f3f', text('Gagal', 'Failed')], [SYNC.skip, '#8a94a3', text('Dilewati', 'Skipped')]];
  let off = 0;
  const toggleStatus = (s: St) => setStatuses(cur => {
    if (cur.has(s) && cur.size === 1) return new Set(KEYS); // jangan sampai kosong
    if (cur.size === KEYS.length) return new Set([s]);      // klik pertama = fokus pada satu status
    const n = new Set(cur); if (n.has(s)) n.delete(s); else n.add(s); return n;
  });
  const reset = () => { setQ(''); setQIn(''); setRegion(''); setStatuses(new Set(KEYS)); searchRef.current?.focus(); };
  const themeLabel = dark ? text('Ganti ke mode terang', 'Switch to light mode') : text('Ganti ke mode gelap', 'Switch to dark mode');
  const LoginBtn = ({ cls, children }: { cls: string; children: React.ReactNode }) => <button type="button" className={cls} data-login aria-haspopup="dialog" aria-controls="loginDialog" onClick={onLogin}>{children}</button>;

  return (
    <div className="page-container">
      <a className="skip-link" href="#main">{T('skip')}</a>
      <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="container header-inner">
          <a className="brand" href="#top" aria-label="BranchSync BRI — ke atas"><span className="brand-logo" aria-hidden="true">BRI</span><span className="brand-text"><strong>BranchSync</strong><small>{T('brandTag')}</small></span></a>
          <nav className="site-nav" aria-label={T('navLabel')}>
            {([['peta', 'navMap'], ['ringkasan', 'navSummary'], ['fitur', 'navFeatures']] as const).map(([id, k]) => <a key={id} href={`#${id}`} aria-current={current === id ? true : undefined}>{T(k)}</a>)}
          </nav>
          <div className="header-actions">
            <div className="lang-toggle" role="group" aria-label={T('langLabel')}>
              {(['id', 'en'] as const).map(l => <button key={l} type="button" data-language={l} aria-pressed={lang === l} lang={l} onClick={() => setApp(s => { s.lang = l; })}>{l.toUpperCase()}</button>)}
            </div>
            <button type="button" className="icon-btn" id="themeToggle" aria-pressed={dark} aria-label={themeLabel} title={themeLabel} onClick={() => setApp(s => { s.dark = !s.dark; })}>
              <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            </button>
            <LoginBtn cls="btn btn-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg><span>{T('login')}</span></LoginBtn>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="hero" id="top" aria-labelledby="heroTitle">
          <div className="container hero-inner">
            <div className="hero-copy">
              <p className="hero-eyebrow"><span className="live-dot" aria-hidden="true" /><span>{T('heroEyebrow')}</span></p>
              <h1 id="heroTitle"><span>{T('heroTitle1')}</span> <em>{T('heroTitle2')}</em></h1>
              <p className="hero-lead">{T('heroLead')}</p>
              <div className="hero-cta">
                <LoginBtn cls="btn btn-light btn-lg"><span>{T('ctaLogin')}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></LoginBtn>
                <a className="btn btn-ghost-light btn-lg" href="#peta"><span>{T('ctaMap')}</span></a>
              </div>
              <p className="hero-meta"><span>{T('clockLabel')}</span> · <time id="serverTime">{new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(now))} WIB</time></p>
            </div>
            <div className="hero-panel" aria-label={T('heroPanel')}>
              <div className="hero-panel-head"><strong>{T('healthTitle')}</strong><span className="pill-demo">{T('demoData')}</span></div>
              <div className="health-score"><strong id="healthPct">{pctFmt(online / total)}</strong><span>{T('healthNote')}</span></div>
              <div className="health-bar" id="healthBar" role="img" aria-label={KEYS.map(s => `${statusText(s)} ${count(s)}`).join(', ')}>{KEYS.map(s => (count(s) ? <span key={s} style={{ flex: count(s), background: STATUS[s].color }} title={`${statusText(s)}: ${count(s)}`} /> : null))}</div>
              <ul className="health-legend" id="healthLegend">{KEYS.map(s => <li key={s}><i style={{ background: STATUS[s].color }} /><span>{statusText(s)}</span><strong>{fmt(count(s))}</strong></li>)}</ul>
            </div>
          </div>
        </section>

        <section className="container stats" aria-label={T('statsLabel')}>
          <div className="stats-grid" id="statsGrid">{stats.map(c => <article key={c.label} className="stat-card" data-tone={c.tone}><span className="stat-icon"><Svg n={c.icon} /></span><div><p className="stat-label">{c.label}</p><p className="stat-value">{c.value}</p><p className="stat-note">{c.note}</p></div></article>)}</div>
        </section>

        <section className="container section" id="peta" aria-labelledby="mapTitle">
          <div className="section-head"><div><h2 id="mapTitle">{T('mapTitle')}</h2><p>{T('mapLead')}</p></div></div>
          <div className="card map-card">
            <div className="map-toolbar">
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input ref={searchRef} type="search" id="mapSearch" autoComplete="off" placeholder={T('searchPh')} aria-label={T('searchLabel')} value={qIn} onChange={e => setQIn(e.target.value)} />
                {qIn && <button type="button" className="search-clear" id="searchClear" aria-label={T('clearSearch')} onClick={() => { setQIn(''); setQ(''); searchRef.current?.focus(); }}>×</button>}
              </div>
              <div className="status-chips" id="statusChips" role="group" aria-label={T('statusFilter')}>
                {KEYS.map(s => <button key={s} type="button" className="chip" data-status={s} aria-pressed={statuses.has(s)} onClick={() => toggleStatus(s)}><i style={{ background: STATUS[s].color }} />{statusText(s)}<span>{fmt(count(s))}</span></button>)}
              </div>
              <label className="layer-select"><span>{T('layer')}</span><select id="layerSelect" value={layer} onChange={e => setLayer(e.target.value)}><option value="street">{T('layerStreet')}</option><option value="topo">{T('layerTopo')}</option></select></label>
            </div>
            <div className="map-body">
              <div id="map" ref={mapEl} role="region" aria-label={T('mapLabel')} />
              <aside className="map-list" aria-labelledby="resultCount">
                <div className="map-list-head"><strong id="resultCount" role="status" aria-live="polite">{filtered.length ? text(`${fmt(filtered.length)} lokasi ditampilkan`, `${fmt(filtered.length)} locations shown`) : text('Tidak ada lokasi yang cocok', 'No matching locations')}</strong>{isFiltered && <button type="button" className="link-btn" id="resetFilters" onClick={reset}>{T('resetFilters')}</button>}</div>
                <ol id="locationList">{filtered.length ? filtered.map(l => (
                  <li key={l.code}><button type="button" data-code={l.code} onClick={() => {
                    const r = mapRef.current; if (!r) return;
                    r.moved = true; r.map.flyTo([l.lat, l.lng], 11, { duration: 0.7 });
                    setTimeout(() => r.byCode.get(l.code)?.openPopup(), 720);
                    if (window.matchMedia('(max-width: 860px)').matches) mapEl.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}><i style={{ background: STATUS[l.status].color }} aria-hidden="true" /><span><strong>KC {l.city}</strong><small>{l.code} · {l.province}</small></span><em>{statusText(l.status)}</em></button></li>
                )) : <li className="list-empty">{text('Coba kata kunci lain atau reset filter.', 'Try another keyword or reset filters.')}</li>}</ol>
              </aside>
            </div>
          </div>
        </section>

        <section className="container section" id="ringkasan" aria-labelledby="summaryTitle">
          <div className="section-head"><div><h2 id="summaryTitle">{T('summaryTitle')}</h2><p>{T('summaryLead')}</p></div></div>
          <div className="summary-grid">
            <article className="card"><header className="card-head"><h3>{T('regionTitle')}</h3><small>{T('regionHint')}</small></header>
              <div className="card-body" id="regionList"><ul className="region-list">{regions.map(([r, xs]) => {
                const on = xs.filter(l => l.status === 'Online').length;
                return <li key={r}><button type="button" className={`region-row${region === r ? ' is-active' : ''}`} data-region={r} aria-pressed={region === r} onClick={() => { const next = region === r ? '' : r; setRegion(next); if (next) document.getElementById('peta')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                  <span className="region-name">{r}</span><span className="region-count">{fmt(xs.length)}</span>
                  <span className="region-bar" aria-hidden="true"><span style={{ width: `${(xs.length / maxR) * 100}%` }} /></span><small>{on} online</small></button></li>;
              })}</ul></div></article>
            <article className="card"><header className="card-head"><h3>{T('syncTitle')}</h3><small>{T('demoData')}</small></header>
              <div className="card-body sync-body" id="syncSummary">
                <div className="donut"><svg viewBox="0 0 120 120" role="img" aria-label={text(`${syncTotal} proses: ${SYNC.ok} berhasil, ${SYNC.fail} gagal, ${SYNC.skip} dilewati`, `${syncTotal} runs: ${SYNC.ok} successful, ${SYNC.fail} failed, ${SYNC.skip} skipped`)}>
                  <circle cx="60" cy="60" r="46" fill="none" stroke="var(--track)" strokeWidth="12" />
                  {parts.map(([v, c]) => { const len = (v / syncTotal) * 100, seg = Math.max(0, len - 1.2), el = <circle key={c} cx="60" cy="60" r="46" fill="none" stroke={c} strokeWidth="12" pathLength={100} strokeDasharray={`${seg} ${100 - seg}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />; off += len; return el; })}
                </svg><div className="donut-center"><strong>{fmt(syncTotal)}</strong><span>{text('proses', 'runs')}</span></div></div>
                <ul className="sync-legend">{parts.map(([v, c, l]) => <li key={c}><i style={{ background: c }} /><span>{l}</span><strong>{fmt(v)}</strong><small>{pctFmt(v / syncTotal)}</small></li>)}</ul>
              </div></article>
            <article className="card"><header className="card-head"><h3>{T('activityTitle')}</h3><LoginBtn cls="link-btn">{T('viewAll')}</LoginBtn></header>
              <div className="card-body"><ol className="activity" id="activityList">{ACTIVITY.map(a => { const l = LOCS.find(x => x.code === a.code)!; return <li key={a.code}><span className={`act-icon ${a.ok ? 'ok' : 'fail'}`}><Svg n={a.ok ? 'check' : 'x'} /></span><div><strong>KC {l.city}</strong><small>{a.code} · {a.ok ? text('Sinkronisasi berhasil', 'Sync successful') : text('Koneksi gagal — dijadwalkan ulang', 'Connection failed — rescheduled')}</small></div><time>{a.time}</time></li>; })}</ol></div></article>
          </div>
        </section>

        <section className="container section" id="fitur" aria-labelledby="featureTitle">
          <div className="section-head center"><div><h2 id="featureTitle">{T('featureTitle')}</h2><p>{T('featureLead')}</p></div></div>
          <ol className="steps">{[1, 2, 3].map(n => <li key={n}><span className="step-num">{n}</span><div><strong>{T(`step${n}`)}</strong><p>{T(`step${n}d`)}</p></div></li>)}</ol>
          <div className="feature-grid">{([
            ['f1', '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'],
            ['f2', '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>'],
            ['f3', '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'],
            ['f4', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>']
          ] as const).map(([k, path]) => (
            <article key={k} className="feature"><span className="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: path }} /></span><h3>{T(k)}</h3><p>{T(`${k}d`)}</p></article>
          ))}</div>
          <div className="cta-band"><div><strong>{T('bandTitle')}</strong><p>{T('bandText')}</p></div><LoginBtn cls="btn btn-orange btn-lg">{T('ctaLogin')}</LoginBtn></div>
        </section>
      </main>

      <footer className="site-footer"><div className="container footer-inner">
        <div className="brand small"><span className="brand-logo" aria-hidden="true">BRI</span><span className="brand-text"><strong>BranchSync</strong></span></div>
        <p>{T('footer')}</p><p className="footer-note">{T('footerNote')}</p>
      </div></footer>
    </div>
  );
}
