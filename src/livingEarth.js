// LIVING EARTH controller: live layers, picking, tooltips, satellite ↔ data links.
import * as Cesium from 'cesium';
import { $, esc, toast, fmtDate, tag } from './ui/dom.js';
import { createLiveLayers } from './globe/live.js';
import { renderLegend, renderLiveCard, renderFeed, renderLapseProgress, tooltipText } from './ui/live.js';
import { DATA_CLASS } from './core/dataClass.js';
import { NISAR_NORAD } from './globe/satellites.js';
import { reducedMotion } from './globe/camera.js';

// Daily true-colour mosaics in NASA GIBS, per satellite (real imagery they produced).
const GIBS_LAYERS = {
  25994: { layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', label: 'TERRA · MODIS' },
  27424: { layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor', label: 'AQUA · MODIS' },
  37849: { layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', label: 'SUOMI NPP · VIIRS' },
  43013: { layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', label: 'NOAA-20 · VIIRS' },
  54234: { layer: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor', label: 'NOAA-21 · VIIRS' },
};

export function createLivingEarth(app) {
  const { viewer, sats } = app;
  const live = createLiveLayers(viewer);
  const legend = $('#legend');
  const card = $('#live-card');
  const feed = $('#feed');
  const tip = $('#tooltip');
  const lapseEl = $('#lapse');
  let lapsing = false;
  let gibs = null; // { layer, norad }
  let feedItems = [];
  let lastPick = null;

  const drawLegend = () => {
    renderLegend(legend, live, { lapse: lapsing });
    legend.onclick = (e) => {
      const row = e.target.closest('[data-layer]');
      if (row) return live.setVisible(row.dataset.layer, !live.visible[row.dataset.layer]);
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'min') legend.classList.toggle('min');
      if (a === 'lapse') lapsing ? stopLapse() : playLapse();
      if (a === 'feed') openFeed();
      if (a === 'allfires') live.setFireFilter(null);
    };
  };
  live.onChange(drawLegend);
  drawLegend();

  // ---------- time-lapse ("play the planet") ----------
  async function playLapse({ seconds = 16 } = {}) {
    if (reducedMotion()) { toast('Time-lapse is off because reduced motion is enabled.'); return; }
    lapsing = true;
    drawLegend();
    lapseEl.hidden = false;
    await live.playTimelapse({ seconds, onProgress: (k, t) => renderLapseProgress(lapseEl, k, t) });
    lapsing = false;
    lapseEl.hidden = true;
    drawLegend();
  }
  function stopLapse() {
    live.stopTimelapse();
    lapsing = false;
    lapseEl.hidden = true;
    drawLegend();
  }

  // ---------- picking ----------
  function identify(windowPos) {
    const picks = viewer.scene.drillPick(windowPos, 6, 14, 14);
    for (const p of picks) { const s = sats.identify(p); if (s) return s; }
    return live.pickAt(windowPos);
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((ev) => {
    if (app.state.demoRunning) return;
    const p = identify(ev.position);
    if (!p) return app.offerChange?.(ev.position);
    if (p.kind === 'satellite') { closeCard(); return app.selectSatellite(p.norad); }
    if (p.kind === 'story') { closeCard(); return app.openStory(p.id); }
    if (p.kind === 'radar') { closeCard(); return app.startChangePair?.(p.record); }
    openCard(p);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  let hoverT = 0;
  handler.setInputAction((ev) => {
    const now = performance.now();
    if (now - hoverT < 90) return;
    hoverT = now;
    const picked = viewer.scene.pick(ev.endPosition, 10, 10);
    let p = picked ? sats.identify(picked) : null;
    if (!p && picked) {
      const d = live.data;
      const col = live.collections;
      if (typeof picked.id === 'number') {
        if (picked.collection === col.radar) p = { kind: 'radar', record: d.radar.hotspots[picked.id] };
        else if (picked.collection === col.fires) p = { kind: 'fire', record: d.fires.fires[picked.id] };
        else if (picked.collection === col.quakes) p = { kind: 'quake', record: d.quakes.quakes[picked.id] };
        else if (picked.collection === col.events) p = { kind: 'event', record: d.events.events[picked.id] };
      } else if (picked.id?.live === 'nisar') p = { kind: 'nisar', record: d.nisar.granules[picked.id.i] };
    }
    viewer.scene.canvas.style.cursor = p ? 'pointer' : '';
    if (!p) { tip.hidden = true; return; }
    tip.textContent = tooltipText(p, live);
    tip.style.left = `${ev.endPosition.x}px`;
    tip.style.top = `${ev.endPosition.y}px`;
    tip.hidden = false;
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // ---------- live card ----------
  function openCard(p, extra = {}) {
    lastPick = p;
    $('#sat-card').hidden = true;
    legend.classList.add('min');
    renderLiveCard(card, p, live, extra);
    card.hidden = false;
    card.onclick = (e) => cardAction(e);
  }
  function closeCard() { card.hidden = true; lastPick = null; }

  async function cardAction(e) {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const d = a.dataset;
    if (d.act === 'close-live') return closeCard();
    if (d.act === 'follow-sat') { closeCard(); app.selectSatellite(Number(d.norad)); return app.cam.flyToSatellite(Number(d.norad)); }
    if (d.act === 'sat-fires') { live.setFireFilter(Number(d.sat)); live.setVisible('fires', true); return; }
    if (d.act === 'drape') {
      const g = live.data.nisar.granules[Number(d.i)];
      a.textContent = 'LOADING THE REAL IMAGE…';
      a.disabled = true;
      try {
        const info = await live.drapeNisar(g);
        openCard(lastPick, { draped: info });
        const c = g.ring.reduce((acc, p) => [acc[0] + p[0] / g.ring.length, acc[1] + p[1] / g.ring.length], [0, 0]);
        app.cam.flyToLocation({ lon: c[0], lat: c[1], height: 650000, pitch: -65, duration: 2.6 });
      } catch {
        a.textContent = 'IMAGE NOT AVAILABLE';
        toast('This NISAR browse image is not publicly available (yet).');
      }
      return;
    }
    if (d.act === 'nisar-here') return nisarHere(Number(d.lat), Number(d.lon), d.after ? Number(d.after) : null, a);
  }

  /** Did NISAR see it? Query the real archive at a point (after an event time if given). */
  async function nisarHere(lat, lon, afterMs, btn) {
    btn.textContent = 'CHECKING THE NISAR ARCHIVE…';
    btn.disabled = true;
    const qs = new URLSearchParams({ lat, lon, max: '60' });
    if (afterMs) qs.set('start', new Date(afterMs).toISOString().slice(0, 10));
    try {
      const r = await (await fetch(`/api/nisar/search?${qs}`, { signal: AbortSignal.timeout(40000) })).json();
      const obs = (r.observations || []).filter((o) => o.productType === 'GCOV' || o.productType === 'GUNW');
      if (!obs.length) { btn.textContent = afterMs ? 'NO NISAR IMAGE SINCE THEN (YET)' : 'NO NISAR IMAGE HERE (YET)'; return; }
      const best = obs.find((o) => o.availability === 'PROVISIONAL' && o.browseUrl) || obs[0];
      btn.textContent = `YES · ${obs.length} IMAGES · SHOWING ${best.acquisitionDate.slice(0, 10)}`;
      const g = { id: best.id, t: best.acquisitionDate, type: best.productType, dir: best.orbit.direction?.[0], track: best.orbit.track, frame: best.orbit.frame, ring: best.geometry.coordinates[0], coll: best.collection };
      const info = await live.drapeNisar(g);
      openCard({ kind: 'nisar', i: -1, record: g }, { draped: info });
      app.cam.flyToLocation({ lon, lat, height: 700000, pitch: -65, duration: 2.6 });
      toast(`Real NISAR ${g.type} image from ${fmtDate(g.t)} draped on the globe.`, 5000);
    } catch {
      btn.textContent = 'DATA TEMPORARILY UNAVAILABLE';
    }
  }

  // ---------- feed ----------
  function openFeed() {
    feedItems = renderFeed(feed, live);
    feed.hidden = false;
    feed.onclick = (e) => {
      if (e.target.closest('[data-act=close-feed]')) { feed.hidden = true; return; }
      const b = e.target.closest('[data-feed]');
      if (!b) return;
      const it = feedItems[Number(b.dataset.feed)];
      const rec = it.kind === 'fire' ? live.data.fires.fires[it.i] : it.kind === 'quake' ? live.data.quakes.quakes[it.i] : it.kind === 'event' ? live.data.events.events[it.i] : live.data.nisar.granules[it.i];
      app.cam.idleSpin(false);
      app.cam.flyToLocation({ lon: it.lon, lat: it.lat, height: it.kind === 'fire' ? 250000 : 900000, pitch: -60, duration: 3 });
      openCard({ kind: it.kind, i: it.i, record: rec });
    };
  }

  // ---------- satellite ↔ data ----------
  function satDataHtml(norad) {
    const f = live.data.fires;
    const idx = f ? f.satelliteNorad.indexOf(norad) : -1;
    const g = GIBS_LAYERS[norad];
    let html = '';
    if (norad === NISAR_NORAD && live.data.nisar) {
      const gs = live.data.nisar.granules;
      const gcov = gs.filter((x) => x.type === 'GCOV').length;
      html += `<div class="big" style="color:var(--cyan)">${gs.length.toLocaleString('en-US')}</div>
        <p style="margin:2px 0 8px">real images in the last ${live.data.nisar.days} days (${gcov.toLocaleString('en-US')} radar images, ${(gs.length - gcov).toLocaleString('en-US')} interferograms). Each glowing footprint on the globe is one; click it to see the image.</p>
        <button class="btn accent" data-act="nisar-highlight" aria-pressed="${live.nisarHighlight}">HIGHLIGHT ITS IMAGES</button>`;
    } else if (idx >= 0) {
      const count = f.fires.reduce((acc, r) => acc + (r[4] === idx ? 1 : 0), 0);
      html += `<div class="big">${count.toLocaleString('en-US')}</div>
        <p style="margin:2px 0 8px">fire detections by this satellite in the last 24 h (NASA FIRMS).</p>
        <button class="btn accent" data-act="sat-fires" data-sat="${idx}" aria-pressed="${live.fireFilter === idx}">SHOW ONLY ITS FIRES</button>`;
    }
    if (g) {
      html += ` <button class="btn" data-act="gibs" aria-pressed="${gibs?.norad === norad}">${gibs?.norad === norad ? 'HIDE' : 'SEE'} ITS IMAGE OF EARTH (YESTERDAY)</button>`;
    }
    if (!html) {
      html = `<p class="fine" style="margin:0">EARTH//PULSE shows this satellite from its real orbit only: no live data feed from it is connected yet.</p>`;
    }
    return `<div class="sat-data"><h3>DATA FROM THIS SATELLITE ${html.includes('fine') ? '' : tag(norad === NISAR_NORAD ? DATA_CLASS.REAL_NISAR : DATA_CLASS.REAL_OTHER_SATELLITE)}</h3>${html}</div>`;
  }

  function satAction(act, norad, btn) {
    if (act === 'sat-fires') {
      const idx = Number(btn.dataset.sat);
      live.setFireFilter(live.fireFilter === idx ? null : idx);
      live.setVisible('fires', true);
      return true;
    }
    if (act === 'nisar-highlight') { live.highlightNisar(!live.nisarHighlight); live.setVisible('nisar', true); return true; }
    if (act === 'gibs') { toggleGibs(norad); return true; }
    return false;
  }

  function toggleGibs(norad) {
    if (gibs) {
      viewer.imageryLayers.remove(gibs.layer, true);
      const was = gibs.norad;
      gibs = null;
      $('#gibs-chip').hidden = true;
      if (app.state.view === 'home') viewer.pulseSetLighting(true);
      if (was === norad) return;
    }
    const g = GIBS_LAYERS[norad];
    const day = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const provider = new Cesium.WebMapTileServiceImageryProvider({
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${g.layer}/default/${day}/250m/{TileMatrix}/{TileRow}/{TileCol}.jpg`,
      layer: g.layer, style: 'default', format: 'image/jpeg', tileMatrixSetID: '250m',
      tilingScheme: new Cesium.GeographicTilingScheme({ numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1 }),
      tileWidth: 512, tileHeight: 512, maximumLevel: 8,
      credit: new Cesium.Credit(`${g.label} true colour ${day} · NASA GIBS / LANCE`),
    });
    const layer = new Cesium.ImageryLayer(provider, { alpha: 0.96 });
    viewer.imageryLayers.add(layer, 2); // above base + night lights, below NISAR layers
    viewer.pulseSetLighting(false);
    gibs = { layer, norad };
    const chip = $('#gibs-chip');
    chip.innerHTML = `${tag(DATA_CLASS.REAL_OTHER_SATELLITE, 'SATELLITE IMAGE')} <span>${esc(g.label)} · TRUE COLOUR · ${day}</span><button data-act="gibs-off">HIDE</button>`;
    chip.hidden = false;
    chip.onclick = (e) => { if (e.target.closest('[data-act=gibs-off]')) toggleGibs(norad); };
  }

  return {
    live,
    load: async () => {
      await live.load();
      drawLegend();
    },
    playLapse, stopLapse, satDataHtml, satAction, openFeed, closeCard,
    onStoryOpen() { stopLapse(); closeCard(); feed.hidden = true; legend.hidden = true; live.setAll(false); live.clearDraped(); },
    onHome() { legend.hidden = false; legend.classList.remove('min'); live.setAll(true); },
    get lapsing() { return lapsing; },
  };
}
