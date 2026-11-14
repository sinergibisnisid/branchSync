'use strict';
/*
 * BranchSync Admin — Halaman Peta Unit Kerja (Leaflet + klaster).
 * Modul views/map.js; cara modul saling terhubung dijelaskan di admin/app.js.
 */
BranchSyncAdmin.part('views/map', function* (app) {
  // Impor dari modul lain (diisi app.link() begitu modul asalnya siap).
  let $, btn, esc, filterChips, fmtDist, fmtNum, GBP, head, ic, issueMap, labelled, MARKER, memo, navItem, openDrawer, REGIONS, searchF, selectF,
    shell, SL, STATUSES, ui;
  app.imports(() => ({ $, btn, esc, filterChips, fmtDist, fmtNum, GBP, head, ic, issueMap, labelled, MARKER, memo, navItem, openDrawer, REGIONS,
    searchF, selectF, shell, SL, STATUSES, ui } = app));
  // Fungsi yang dipakai modul lain — tersedia sebelum kode modul mana pun dijalankan.
  app.export({ mapFiltered, viewMap, mountMap, updateMap });
  yield; // ↑ tahap 1: daftar impor/ekspor · ↓ tahap 2: kode modul, dijalankan berurutan

  /* ------------------------------------------------------------------ *
   * View: Peta
   * ------------------------------------------------------------------ */
  let mapExtra = null; app.mapObj = null; app.mapLayer = null; app.mapMarkers = new Map();
  /* Marker clustering (Leaflet.markercluster, versi dikunci + SRI, dimuat saat peta pertama dibuka).
   * Bila gagal dimuat, peta tetap berjalan tanpa clustering. */
  const CLUSTER = {
    js: { url: 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js', sri: 'sha384-eXVCORTRlv4FUUgS/xmOyr66XBVraen8ATNLMESp92FKXLAMiKkerixTiBvXriZr' },
    css: [{ url: 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css', sri: 'sha384-pmjIAcz2bAn0xukfxADbZIb3t8oRT9Sv0rvO+BR5Csr6Dhqq+nZs59P0pPKQJkEV' },
      { url: 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css', sri: 'sha384-wgw+aLYNQ7dlhK47ZPK7FRACiq7ROZwgFNg0m04avm4CaXS+Z9Y7nMu8yNjBKYC+' }]
  };
  let clusterJob = null;
  function loadCluster() {
    if (typeof L !== 'undefined' && L.markerClusterGroup) return Promise.resolve(true);
    return clusterJob || (clusterJob = new Promise(resolve => {
      CLUSTER.css.forEach(c => { const k = document.createElement('link'); k.rel = 'stylesheet'; k.href = c.url; k.integrity = c.sri; k.crossOrigin = 'anonymous'; k.referrerPolicy = 'no-referrer'; document.head.append(k); });
      const sc = document.createElement('script');
      sc.src = CLUSTER.js.url; sc.integrity = CLUSTER.js.sri; sc.crossOrigin = 'anonymous'; sc.referrerPolicy = 'no-referrer'; sc.async = true;
      sc.onload = () => resolve(!!L.markerClusterGroup);
      sc.onerror = () => { clusterJob = null; sc.remove(); resolve(false); };
      document.head.append(sc);
      setTimeout(() => resolve(!!L.markerClusterGroup), 8000); // jangan tahan peta terlalu lama
    }));
  }
  const clusterIcon = c => { const n = c.getChildCount(); return L.divIcon({ html: `<span>${n >= 1000 ? `${Math.round(n / 100) / 10}k` : n}</span>`, className: `bs-cluster ${n >= 500 ? 'is-lg' : n >= 50 ? 'is-md' : ''}`, iconSize: L.point(40, 40) }); };
  function mapFiltered() {
    const m = ui.map, q = m.q.trim().toLowerCase();
    return memo(`mf:${JSON.stringify([q, m.status, m.region, m.gbp])}`, () => app.state.locations.filter(l => (!q || `${l.name} ${l.code} ${l.city} ${l.province}`.toLowerCase().includes(q)) && (!m.status || l.status === m.status) && (!m.region || l.region === m.region) && (!m.gbp || l.gbp === m.gbp)));
  }
  function viewMap() {
    const m = ui.map;
    return head('Peta Unit Kerja', navItem('map').desc, btn('Buka daftar', 'nav', { id: 'locations', icon: 'building' })) +
      `<div class="bs-map-layout"><section class="bs-card bs-map-card"><div class="bs-card-body flush">
        <div class="bs-toolbar">${searchF('map.q', 'Cari di peta', m.q, 'Nama, kode, atau kota…', 'bsMapQ')}${selectF('map.status', 'Status', labelled(STATUSES), m.status)}${selectF('map.region', 'Region', REGIONS, m.region)}${selectF('map.gbp', 'Status GBP', labelled(GBP), m.gbp)}
          <label class="bs-switch"><input type="checkbox" data-bind="map.showGoogle" ${m.showGoogle ? 'checked' : ''}><span></span>Tampilkan selisih titik Google</label></div><div id="bsMapChips">${filterChips('map')}</div>
        <div id="bsMap" class="bs-map" role="application" aria-label="Peta unit kerja"></div>
        <div class="bs-map-legend">${STATUSES.map(s => `<span><i style="background:${MARKER[s]}"></i>${SL(s)}</span>`).join('')}<span><i class="hollow"></i>Titik di Google (beda)</span></div>
      </div></section>
      <section class="bs-card bs-map-list"><header class="bs-card-head"><div><h2 id="bsMapCount"></h2><p>Klik untuk menuju lokasi</p></div></header><div class="bs-card-body flush"><ol id="bsMapList" class="bs-list"></ol></div></section></div>`;
  }
  function mountMap() {
    if (app.mapObj) { app.mapObj.remove(); app.mapObj = null; }
    const el = $('bsMap');
    if (!el) return;
    if (typeof L === 'undefined') { el.innerHTML = `<div class="bs-map-fallback">${ic('map')}<p>Peta tidak dapat dimuat. Periksa koneksi internet Anda.</p></div>`; updateMap(false); return; }
    app.mapObj = L.map(el, { preferCanvas: true, zoomControl: true }).setView([-2.5, 118], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(app.mapObj);
    app.mapLayer = L.layerGroup().addTo(app.mapObj);
    mapExtra = L.layerGroup().addTo(app.mapObj);
    loadCluster().then(ok => {
      if (!ok || !app.mapObj || !L.markerClusterGroup) return;
      app.mapObj.removeLayer(app.mapLayer);
      app.mapLayer = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true, iconCreateFunction: clusterIcon }).addTo(app.mapObj);
      updateMap(false);
    });
    app.mapObj.on('popupopen', e => {
      const node = e.popup.getElement();
      node?.addEventListener('click', ev => { const b = ev.target.closest('[data-action="open-loc"]'); if (b) openDrawer(b.dataset.id); });
    });
    updateMap(true);
    setTimeout(() => app.mapObj && app.mapObj.invalidateSize(), 60);
  }
  function updateMap(fit) {
    const xs = mapFiltered(), im = issueMap();
    // Peta tidak dirender ulang penuh: selaraskan kontrol filter & chip dengan ui.map.
    const chips = $('bsMapChips');
    if (chips) {
      chips.innerHTML = filterChips('map');
      shell.querySelectorAll('#bsPage [data-bind^="map."]').forEach(c => { const k = c.dataset.bind.slice(4); if (c.type === 'checkbox') c.checked = !!ui.map[k]; else if (c !== document.activeElement && c.value !== String(ui.map[k] ?? '')) c.value = ui.map[k] ?? ''; });
    }
    if ($('bsMapCount')) $('bsMapCount').textContent = `${fmtNum(xs.length)} unit ditampilkan`;
    if ($('bsMapList')) {
      const lim = ui.map.limit || 300;
      $('bsMapList').innerHTML = xs.slice(0, lim).map(l => `<li><button type="button" data-action="map-focus" data-id="${esc(l.code)}"><i style="background:${MARKER[l.status]}" aria-hidden="true"></i><span><strong>${esc(l.name)}</strong><small>${esc(l.code)} · ${esc(l.city)}</small></span>${im.has(l.code) ? `<span class="bs-issue sm" title="Beda dengan Google">${ic('alert')}</span>` : ''}</button></li>`).join('') +
        (xs.length > lim ? `<li class="bs-list-more">${btn(`Tampilkan ${fmtNum(Math.min(300, xs.length - lim))} lagi`, 'map-more', { variant: 'sm ghost' })}<small>${fmtNum(xs.length - lim)} unit belum tampil di daftar — semua tetap ada di peta</small></li>` : '') ||
        `<li class="bs-list-more">Tidak ada unit yang cocok.</li>`;
    }
    if (!app.mapObj) return;
    app.mapLayer.clearLayers(); mapExtra.clearLayers(); app.mapMarkers = new Map();
    const markers = [];
    xs.forEach(l => {
      // Isi popup dibuat saat diklik (bukan 10.000 string sekaligus).
      const mk = L.circleMarker([l.lat, l.lng], { radius: 7, color: '#fff', weight: 2, fillColor: MARKER[l.status], fillOpacity: 1 })
        .bindPopup(() => `<div class="bs-popup"><strong>${esc(l.name)}</strong><span>${esc(l.code)} · ${esc(l.type)}</span><span>${esc(l.address)}</span><span>Status: ${esc(SL(l.status))} · GBP: ${esc(SL(l.gbp))}</span><button type="button" data-action="open-loc" data-id="${esc(l.code)}">Lihat detail →</button></div>`);
      markers.push(mk); app.mapMarkers.set(l.code, mk);
      const coord = (im.get(l.code) || []).find(i => i.field === 'coords');
      if (ui.map.showGoogle && coord) {
        L.polyline([[l.lat, l.lng], [l.google.lat, l.google.lng]], { color: '#e0660f', weight: 2, dashArray: '4 4' }).addTo(mapExtra);
        L.circleMarker([l.google.lat, l.google.lng], { radius: 6, color: '#e0660f', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`Titik Google · selisih ${fmtDist(coord.dist)}`).addTo(mapExtra);
      }
    });
    if (app.mapLayer.addLayers) app.mapLayer.addLayers(markers); else markers.forEach(m => m.addTo(app.mapLayer));
    if (fit && xs.length) app.mapObj.fitBounds(L.latLngBounds(xs.map(l => [l.lat, l.lng])), { padding: [30, 30], maxZoom: 13 });
  }
});
