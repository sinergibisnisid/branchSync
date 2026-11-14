/*
 * Kerangka workspace admin: navigasi, header, status Live, halaman aktif, drawer, palet, modal, toast.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import * as api from '../lib/api';
import { navCounts, notifications, openFailures } from '../lib/data';
import { NAV, navItem, type ViewId } from '../lib/domain';
import { fmtNum, fmtRel, initials, MOD } from '../lib/format';
import { useDomTranslation } from '../i18n/translator';
import { dismissToast, getApp, setApp, setUi, toast, useApp, useOverlay, type Toast } from '../store';
import { Drawer } from './Drawer';
import { openPalette, Palette } from './Palette';
import { Btn } from './ui/components';
import { Ic } from './ui/Icon';
import { infoModal, ModalHost } from './ui/Modal';
import { canView, copyLink, guard, loadLive, logout, navigate, syncUrl, useCan } from './workspace';
import { locationForm } from './forms/LocationForm';
import { VIEWS } from './views';

/* ---------- Waktu render halaman (ditampilkan di footer) ---------- */
export const useRenderStat = create<{ ms: number }>(() => ({ ms: 0 }));

const useMedia = (q: string) => {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, [q]);
  return m;
};
const useOnline = () => {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => { const u = () => setOn(navigator.onLine); window.addEventListener('online', u); window.addEventListener('offline', u); return () => { window.removeEventListener('online', u); window.removeEventListener('offline', u); }; }, []);
  return on;
};
// Perbarui teks relatif ("5 mnt lalu") tiap 30 detik.
const useTick = (ms = 30000) => { const [, set] = useState(0); useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t); }, [ms]); };

export function AdminApp() {
  const lang = useApp(s => s.lang);
  // Ganti bahasa → render ulang penuh agar teks asli (ID) dipakai lagi sebelum diterjemahkan.
  return <Shell key={lang} />;
}

function Shell() {
  const root = useRef<HTMLElement>(null);
  const lang = useApp(s => s.lang);
  const prefs = useApp(s => s.prefs);
  const navOpen = useApp(s => s.ui.navOpen);
  const mobile = useMedia('(max-width: 900px)');
  // Default terang; gelap hanya bila dipilih di admin atau di halaman depan (tidak mengikuti tema OS).
  const theme = prefs.theme || (document.body.classList.contains('dark') ? 'dark' : 'light');
  useDomTranslation(root, lang === 'en');

  useEffect(() => { document.body.classList.add('admin-active'); return () => document.body.classList.remove('admin-active'); }, []);
  useEffect(() => { if (!mobile) setUi(ui => { ui.navOpen = false; }); }, [mobile]);
  // Hash URL mengikuti state UI.
  useEffect(() => { syncUrl(); return useApp.subscribe((s, p) => { if (s.ui !== p.ui) syncUrl(); }); }, []);
  useShortcuts();

  return (
    <section id="adminPanel" ref={root} aria-label="Panel admin" lang={lang} data-theme={theme}
      className={['bs-shell', !mobile && prefs.collapsed && 'is-collapsed', mobile && navOpen && 'is-nav-open'].filter(Boolean).join(' ')}>
      <a className="bs-skip" href="#bsMain" onClick={e => { e.preventDefault(); document.getElementById('bsMain')?.focus(); }}>Lewati ke konten utama</a>
      <Sidebar mobile={mobile} />
      <div className="bs-scrim" hidden={!(mobile && navOpen)} onClick={() => { setUi(ui => { ui.navOpen = false; }); (document.querySelector('.bs-menu') as HTMLElement | null)?.focus(); }} />
      <div className="bs-body">
        <Topbar mobile={mobile} theme={theme} />
        <main className="bs-main" id="bsMain" tabIndex={-1}>
          <div className="bs-banner-slot" id="bsBanner"><Banner /></div>
          <div className="bs-page" id="bsPage"><Page /></div>
        </main>
        <Footer />
      </div>
      <ModalHost />
      <Drawer />
      <Palette />
      <Toasts />
      <div className="bs-sr" id="bsAnnounce" role="status" aria-live="polite" aria-atomic="true" />
    </section>
  );
}

/* ---------- Navigasi samping ---------- */
function Sidebar({ mobile }: { mobile: boolean }) {
  const view = useApp(s => s.ui.view);
  const navOpen = useApp(s => s.ui.navOpen);
  const collapsed = useApp(s => s.prefs.collapsed);
  const me = useApp(s => s.me);
  const counts = useApp(s => (s.ws ? navCounts(s.ws) : null));
  useApp(s => s.ws?.roles); // izin peran ikut data server
  return (
    <aside className="bs-sidebar" id="bsSidebar" aria-label="Navigasi admin" inert={mobile && !navOpen ? true : undefined}>
      <div className="bs-brand">
        <span className="bs-logo" aria-hidden="true">BRI</span>
        <span className="bs-brand-text"><strong>BranchSync</strong><small>Admin Workspace</small></span>
        <button type="button" className="bs-icon-btn bs-collapse" aria-label={collapsed ? 'Lebarkan navigasi' : 'Ciutkan navigasi'} onClick={() => setApp(s => { s.prefs.collapsed = !s.prefs.collapsed; })}><Ic name="panel" /></button>
      </div>
      <button type="button" className="bs-search-trigger" onClick={openPalette}><Ic name="search" /><span>Cari unit atau menu…</span><kbd>{MOD} K</kbd></button>
      <nav id="bsNav" className="bs-nav">
        {NAV.map(g => ({ ...g, items: g.items.filter(n => canView(n.id)) })).filter(g => g.items.length).map(g => (
          <div key={g.group} style={{ display: 'contents' }}>
            <p className="bs-nav-label">{g.group}</p>
            {g.items.map(n => {
              const c = n.count && counts ? counts[n.count] : 0;
              return (
                <button key={n.id} type="button" aria-current={view === n.id ? 'page' : undefined} title={n.label} onClick={() => navigate(n.id)}>
                  <Ic name={n.icon} /><span className="bs-nav-text">{n.label}</span>
                  {!!c && <span className="bs-nav-count" aria-label={`${c} perlu perhatian`}>{c > 99 ? '99+' : c}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="bs-account">
        <span className="bs-avatar" aria-hidden="true" id="bsAccAvatar">{initials(me.name)}</span>
        <span className="bs-account-text"><strong id="bsAccName">{me.name}</strong><small id="bsAccRole">{me.role || 'Pengguna'}</small></span>
        <button type="button" className="bs-icon-btn" aria-label="Keluar ke halaman utama" title="Keluar" data-action="logout" onClick={logout}><Ic name="logout" /></button>
      </div>
    </aside>
  );
}

/* ---------- Header ---------- */
function Topbar({ mobile, theme }: { mobile: boolean; theme: string }) {
  useTick();
  const view = useApp(s => s.ui.view);
  const navOpen = useApp(s => s.ui.navOpen);
  const collapsed = useApp(s => s.prefs.collapsed);
  const save = useApp(s => s.save);
  const running = useApp(s => s.running);
  const live = useApp(s => s.live);
  const ws = useApp(s => s.ws);
  const me = useApp(s => s.me);
  const lang = useApp(s => s.lang);
  const online = useOnline();
  const [menu, setMenu] = useState<'' | 'conn' | 'notif'>('');
  const host = api.host();
  const last = ws?.runs[0];
  const nots = ws ? notifications(ws) : [];
  const mstate = (live.error || !online) ? 'offline' : (live.pending || live.loading) ? 'busy' : live.ready ? 'online' : 'busy';
  const mlabel = `Live — ${{ online: 'terhubung', offline: 'terputus', busy: 'menghubungkan' }[mstate]}${host ? ' ke ' + host : ''}`;
  const saveLabel = { saving: 'Menyimpan…', saved: 'Tersimpan ke server', error: 'Gagal menyimpan', '': '' }[save];
  useEffect(() => { if (save !== 'saved') return; const t = setTimeout(() => setApp(s => { if (s.save === 'saved') s.save = ''; }), 4000); return () => clearTimeout(t); }, [save]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { const t = e.target as Element; if (!t.closest('#bsModeMenu, #bsModeBtn, #bsNotif, #bsNotifBtn')) setMenu(''); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); const btn = menu === 'conn' ? 'bsModeBtn' : 'bsNotifBtn'; setMenu(''); document.getElementById(btn)?.focus(); } };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    if (menu === 'conn') requestAnimationFrame(() => (document.querySelector('#bsModeMenu [role^="menuitem"]') as HTMLElement | null)?.focus());
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [menu]);
  const setLang = (l: 'id' | 'en') => {
    if (l === lang) return;
    setMenu('');
    setApp(s => { s.lang = l; });
    setTimeout(() => { toast(l === 'en' ? 'Language changed to English.' : 'Bahasa diganti ke Bahasa Indonesia.'); (document.querySelector(`#bsLang [data-id="${l}"]`) as HTMLElement | null)?.focus(); }, 0);
  };

  return (
    <header className="bs-topbar">
      <button type="button" className="bs-icon-btn bs-menu" aria-label="Buka navigasi" aria-controls="bsSidebar" aria-expanded={mobile ? navOpen : !collapsed}
        onClick={() => { if (mobile) { setUi(ui => { ui.navOpen = true; }); requestAnimationFrame(() => (document.querySelector('#bsNav button') as HTMLElement | null)?.focus()); } else setApp(s => { s.prefs.collapsed = !s.prefs.collapsed; }); }}><Ic name="menu" /></button>
      <nav className="bs-crumbs" aria-label="Lokasi halaman"><span>Workspace</span><Ic name="chev" /><strong id="bsCrumb">{navItem(view).label}</strong></nav>
      <div className="bs-top-end">
        <span className="bs-save" id="bsSave" role="status" aria-live="polite" data-state={save || undefined} title={saveLabel}>{save && <>{save === 'saving' ? <span className="bs-spinner sm" aria-hidden="true" /> : <Ic name={save === 'saved' ? 'check' : 'alert'} />}<span className="bs-save-text">{saveLabel}</span></>}</span>
        <button type="button" className="bs-sync-pill" id="bsSyncPill" onClick={() => navigate('sync')}>
          {running ? <><span className="bs-pulse" />Menyinkronkan…</>
            : !live.ready ? <><span className="bs-dot" data-tone="neutral" />Sinkron terakhir —</>
            : <><span className="bs-dot" data-tone={ws && openFailures(ws).length ? 'warn' : 'good'} />Sinkron terakhir {last ? fmtRel(last.time) : '—'}</>}
        </button>
        {me.role !== 'Administrator' && <span className="bs-role-chip" id="bsRoleChip" title="Peran dari akun server">Peran: {me.role}</span>}
        <button type="button" className="bs-icon-btn bs-hide-sm" aria-label="Salin tautan halaman ini" title="Salin tautan halaman ini" onClick={() => { void copyLink().then(ok => { if (!ok) infoModal('Salin tautan', <label className="bs-field"><span>Tautan halaman ini</span><input defaultValue={location.href} readOnly onFocus={e => e.target.select()} /></label>); }); }}><Ic name="link" /></button>
        <div className="bs-pop-wrap">
          <button type="button" className="bs-mode-btn" id="bsModeBtn" data-state={mstate} aria-haspopup="menu" aria-expanded={menu === 'conn'} aria-controls="bsModeMenu" title={mlabel} aria-label={`${mlabel}. Menu koneksi`} onClick={() => setMenu(menu === 'conn' ? '' : 'conn')}>
            <span className="bs-dot" /><span>Live</span>{host && <small>{host}</small>}<Ic name="chevD" cls="bs-caret" />
          </button>
          <div className="bs-popover bs-mode-menu" id="bsModeMenu" role="menu" aria-label="Koneksi server" hidden={menu !== 'conn'} onKeyDown={e => {
            const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')], i = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
            else if (e.key === 'Tab') setMenu('');
          }}>
            <div className="bs-menu-head">Koneksi server</div>
            <div className="bs-menu-item" role="menuitem" tabIndex={-1} aria-disabled="true"><span className="bs-mode-badge" data-state="online"><Ic name="plug" /></span><span><strong>Live</strong><small>{`${mstate === 'offline' ? 'Terputus' : live.ready ? 'Terhubung' : 'Menghubungkan…'} · ${host}`}</small></span></div>
            <div className="bs-menu-sep" role="separator" />
            <button type="button" className="bs-menu-item sm" role="menuitem" onClick={() => { setMenu(''); void loadLive({ silent: live.ready }).then(ok => toast(ok ? 'Data diperbarui dari server.' : `Masih gagal memuat data: ${getApp().live.error?.message || 'sesi berakhir'}`, { tone: ok ? 'good' : 'bad' })); }}><Ic name="refresh" /><span>Muat ulang data</span></button>
            <button type="button" className="bs-menu-item sm" role="menuitem" onClick={() => { setMenu(''); navigate('settings'); }}><Ic name="sliders" /><span>Pengaturan koneksi</span></button>
          </div>
        </div>
        <div className="bs-pop-wrap">
          <button type="button" className="bs-icon-btn" id="bsNotifBtn" aria-haspopup="true" aria-expanded={menu === 'notif'} aria-controls="bsNotif" aria-label={nots.length ? `Notifikasi, ${nots.length} baru` : 'Notifikasi'} onClick={() => setMenu(menu === 'notif' ? '' : 'notif')}><Ic name="bell" /><span className="bs-count-dot" id="bsNotifCount">{nots.length || ''}</span></button>
          <div className="bs-popover bs-notif" id="bsNotif" hidden={menu !== 'notif'}>
            <header><strong>Notifikasi</strong><small>{nots.length ? `${nots.length} perlu perhatian` : 'Tidak ada yang baru'}</small></header>
            {nots.length ? <ul>{nots.map(n => <li key={n.view}><button type="button" data-tone={n.tone} onClick={() => { setMenu(''); navigate(n.view as ViewId); }}><Ic name={n.icon} /><span><strong>{n.title}</strong><small>{n.text}</small></span></button></li>)}</ul> : <p className="bs-pal-empty">Semua beres 🎉</p>}
          </div>
        </div>
        <button type="button" className="bs-icon-btn bs-hide-sm" aria-label="Panduan pengguna" title="Panduan pengguna" onClick={() => navigate('guide')}><Ic name="book" /></button>
        <div className="bs-lang" role="group" aria-label="Bahasa" id="bsLang">
          <button type="button" data-id="id" lang="id" aria-pressed={lang === 'id'} onClick={() => setLang('id')}>ID</button>
          <button type="button" data-id="en" lang="en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
        </div>
        <button type="button" className="bs-icon-btn" id="bsThemeBtn" aria-label="Ganti tema" title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'} onClick={() => setApp(s => { s.prefs.theme = theme === 'dark' ? 'light' : 'dark'; })}><Ic name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button type="button" className="bs-icon-btn bs-hide-sm" aria-label="Pintasan keyboard" title="Pintasan keyboard (?)" onClick={shortcutsModal}><Ic name="keyboard" /></button>
      </div>
    </header>
  );
}

/* ---------- Banner status ---------- */
function Banner() {
  useTick();
  const live = useApp(s => s.live);
  const online = useOnline();
  const loaded = live.syncedAt ? ` (dimuat ${fmtRel(live.syncedAt)})` : '';
  let b: { tone: string; icon: string; title: string; text: string } | null = null;
  if (live.ready && !online) b = { tone: 'warn', icon: 'wifiOff', title: 'Anda sedang offline.', text: `Menampilkan data terakhir${loaded}. Perubahan belum dapat dikirim; data dimuat ulang otomatis saat koneksi pulih.` };
  else if (live.ready && live.error) b = { tone: 'bad', icon: 'alert', title: 'Gagal memuat data terbaru dari server.', text: `${live.error.message} Menampilkan data terakhir${loaded}.` };
  if (!b) return null;
  return (
    <div className="bs-banner" data-tone={b.tone} role={b.tone === 'bad' ? 'alert' : 'status'}>
      <Ic name={b.icon} /><p><strong>{b.title}</strong> <span>{b.text}</span></p>
      <div className="bs-banner-actions"><Btn label="Coba lagi" icon="refresh" variant="sm" onClick={() => { void loadLive({ silent: true }); }} /></div>
    </div>
  );
}

/* ---------- Halaman aktif (atau status memuat / galat) ---------- */
function Page() {
  const view = useApp(s => s.ui.view);
  const ready = useApp(s => s.live.ready);
  const start = useRef(0);
  start.current = performance.now();
  useLayoutEffect(() => {
    const ms = Math.max(1, Math.round(performance.now() - start.current));
    if (ms !== useRenderStat.getState().ms) useRenderStat.setState({ ms });
  });
  if (!ready) return <LiveState />;
  const View = VIEWS[view];
  return <View />;
}

function skeleton(view: ViewId) {
  const bar = (cls: string, k?: number) => <span key={k} className={`bs-skel ${cls}`} />;
  const tiles = (n: number) => <div className="bs-skel-tiles">{Array.from({ length: n }, (_, i) => <div key={i} className="bs-skel-card">{bar('w40')}{bar('h28 w60')}{bar('w80')}</div>)}</div>;
  const rows = (n: number) => <div className="bs-skel-card bs-skel-table">{bar('h32 w100')}{Array.from({ length: n }, (_, i) => <div key={i} className="bs-skel-row">{bar('w30')}{bar(i % 2 ? 'w20' : 'w25')}{bar('w15')}{bar('w20')}</div>)}</div>;
  const kind = ['dashboard', 'reports', 'sla'].includes(view) ? 'tiles' : view === 'map' ? 'map' : ['guide', 'scenarios', 'settings', 'integrations'].includes(view) ? 'doc' : 'table';
  return (
    <div className="bs-skel-page" data-kind={kind}>{bar('h28 w30')}{bar('w50')}
      {kind === 'tiles' ? <>{tiles(4)}<div className="bs-skel-split"><div className="bs-skel-card">{bar('h160 w100')}</div><div className="bs-skel-card">{bar('h160 w100')}</div></div></>
        : kind === 'map' ? <><div className="bs-skel-card">{bar('h32 w100')}</div><div className="bs-skel-card">{bar('h360 w100')}</div></>
        : kind === 'doc' ? <><div className="bs-skel-card">{bar('w60')}{bar('w90')}{bar('w80')}{bar('w70')}</div><div className="bs-skel-card">{bar('w50')}{bar('w90')}{bar('w60')}</div></>
        : <><div className="bs-skel-card">{bar('h32 w100')}</div>{rows(8)}</>}
    </div>
  );
}
function LiveState() {
  const view = useApp(s => s.ui.view);
  const error = useApp(s => s.live.error);
  const online = useOnline();
  if (!error) return <div className="bs-live-loading" aria-busy="true"><h1 id="bsTitle" className="bs-sr" tabIndex={-1}>Memuat data dari server…</h1><p className="bs-live-loading-msg" role="status"><span className="bs-spinner sm" aria-hidden="true" />{`Memuat data dari ${api.host() || 'server'}…`}</p>{skeleton(view)}</div>;
  return (
    <div className="bs-live-state is-error"><Ic name={online ? 'alert' : 'wifiOff'} />
      <h1 id="bsTitle" tabIndex={-1}>{online ? 'Data Live tidak dapat dimuat' : 'Anda sedang offline'}</h1>
      <p>{online ? error.message : 'Perangkat tidak terhubung ke internet. Data akan dimuat otomatis saat koneksi pulih.'}</p>
      <p className="bs-muted">Server: {api.getBaseUrl() || 'belum diatur'}</p>
      <div className="bs-btn-row">
        <Btn label="Coba lagi" icon="refresh" variant="primary" onClick={() => { void loadLive(); }} />
        <Btn label="Masuk lagi" icon="plug" onClick={logout} />
      </div>
    </div>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  useTick();
  const n = useApp(s => s.ws?.locations.length);
  const live = useApp(s => s.live);
  const ms = useRenderStat(s => s.ms);
  const online = useOnline();
  const host = api.host() || 'server';
  const mode = (live.error || !online)
    ? (online ? `Live — tidak dapat terhubung ke ${host}.` : 'Live — perangkat sedang offline.')
    : !live.ready ? `Live — menghubungkan ke ${host}…`
    : `Live — terhubung ke ${host}. Perubahan dikirim ke server${live.syncedAt ? ` · data dimuat ${fmtRel(live.syncedAt)}` : ''}.`;
  return <footer className="bs-footer" aria-label="Status workspace"><span id="bsFooterInfo">{live.ready && n != null ? `${fmtNum(n)} unit · render ${ms} ms` : '— unit'}</span><span id="bsFooterMode">{mode}</span></footer>;
}

/* ---------- Toast ---------- */
function Toasts() {
  const toasts = useOverlay(s => s.toasts);
  return <div className="bs-toasts" id="bsToasts" role="region" aria-label="Notifikasi singkat" aria-live="polite">{toasts.map(t => <ToastItem key={t.id} t={t} />)}</div>;
}
function ToastItem({ t }: { t: Toast }) {
  const timer = useRef(0);
  useEffect(() => { timer.current = window.setTimeout(() => dismissToast(t.id), t.action ? 8000 : 4500); return () => clearTimeout(timer.current); }, [t]);
  return (
    <div className="bs-toast" data-tone={t.tone} data-toast={t.id}
      onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={() => { timer.current = window.setTimeout(() => dismissToast(t.id), 2500); }}>
      <Ic name={t.tone === 'good' ? 'check' : t.tone === 'bad' || t.tone === 'warn' ? 'alert' : 'info'} /><p>{t.msg}</p>
      {t.action && <button type="button" className="bs-btn sm ghost" onClick={() => { dismissToast(t.id); t.action!.run(); }}>{t.action.label}</button>}
      <button type="button" className="bs-icon-btn sm" aria-label="Tutup notifikasi" onClick={() => dismissToast(t.id)}><Ic name="x" /></button>
    </div>
  );
}

/* ---------- Pintasan keyboard ---------- */
export function shortcutsModal() {
  const rows: [string, string][] = [[`${MOD} K`, 'Cari unit kerja, menu, atau aksi'], ['/', 'Fokus ke kolom pencarian di halaman'], ['N', 'Tambah unit kerja baru'], ['← →', 'Pindah tab (saat tab terfokus)'], ['?', 'Tampilkan pintasan ini'], ['Esc', 'Tutup dialog atau panel']];
  infoModal('Pintasan keyboard', <dl className="bs-shortcuts">{rows.map(([k, d]) => <div key={k}><dt>{k.split(' ').map(x => <kbd key={x}>{x}</kbd>)}</dt><dd>{d}</dd></div>)}</dl>);
}
function useShortcuts() {
  const canWrite = useCan('locations.write');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      const o = useOverlay.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (o.palette) useOverlay.setState({ palette: false }); else if (!o.modal) openPalette(); return; }
      if (e.key === 'Escape' && getApp().ui.navOpen) { setUi(ui => { ui.navOpen = false; }); (document.querySelector('.bs-menu') as HTMLElement | null)?.focus(); return; }
      if (typing || o.modal || o.palette || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { const s = document.querySelector('#bsPage [data-search]') as HTMLInputElement | null; if (s) { e.preventDefault(); s.focus(); s.select(); } }
      else if (e.key === '?') { e.preventDefault(); shortcutsModal(); }
      else if (e.key.toLowerCase() === 'n' && !getApp().ui.drawer) { e.preventDefault(); if (guard('locations.write')) locationForm(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canWrite]);
}

