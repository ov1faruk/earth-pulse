// CHANGE ANYWHERE — click any place NISAR has imaged; compare two real passes
// of the same orbit track and see what changed, computed in the browser.
import * as Cesium from 'cesium';
import { $, esc, tag, fmtDate, fmtCoord, toast } from './ui/dom.js';
import { DATA_CLASS } from './core/dataClass.js';
import { computeChange, changeToRGBA } from './core/changeEngine.js';
import { loadBrowse } from './globe/browse.js';

const MEANING = {
  darker: ['new open water or flooding', 'harvested or cleared fields', 'forest loss', 'drying of wet soil'],
  brighter: ['growing crops', 'flooded vegetation (double bounce)', 'wetter soil after rain', 'new structures'],
};

// NASA Blue Marble-derived land mask (public/data/landmask.png, 2048×1024 equirectangular).
let landMaskP = null;
function landMask() {
  landMaskP ||= (async () => {
    const bmp = await createImageBitmap(await (await fetch('/data/landmask.png')).blob());
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const cx = c.getContext('2d'); cx.drawImage(bmp, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    const w = c.width, h = c.height;
    return (lon, lat) => {
      const x = Math.min(w - 1, Math.max(0, Math.floor(((((lon + 180) % 360) + 360) % 360) / 360 * w)));
      const y = Math.min(h - 1, Math.max(0, Math.floor((90 - lat) / 180 * h)));
      return d[(y * w + x) * 4] > 127;
    };
  })().catch(() => null);
  return landMaskP;
}

export function createChangeAnywhere(app) {
  const { viewer } = app;
  const card = $('#change-card');
  const fab = $('#change-fab');
  let run = null; // { lat, lon, stacks, si, from, to, images:Map, result, layers:{before,after,change}, view }
  let token = 0;

  // ---------- entry: floating "WHAT CHANGED HERE?" at a clicked point ----------
  function offerAt(windowPos) {
    const cart = viewer.camera.pickEllipsoid(windowPos, viewer.scene.globe.ellipsoid);
    if (!cart) { fab.hidden = true; return; }
    const c = Cesium.Cartographic.fromCartesian(cart);
    const lat = Cesium.Math.toDegrees(c.latitude), lon = Cesium.Math.toDegrees(c.longitude);
    fab.innerHTML = `<button class="btn primary">WHAT CHANGED HERE?</button><span>${fmtCoord(lat, lon, 2)} · compare real NISAR passes</span>`;
    fab.style.left = `${windowPos.x}px`;
    fab.style.top = `${windowPos.y}px`;
    fab.hidden = false;
    fab.querySelector('button').onclick = () => { fab.hidden = true; start(lat, lon); };
    clearTimeout(offerAt.t);
    offerAt.t = setTimeout(() => { fab.hidden = true; }, 6000);
  }

  // ---------- layers ----------
  function addLayer(url, r, alpha) {
    const layer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.SingleTileImageryProvider.fromUrl(url, { rectangle: Cesium.Rectangle.fromDegrees(r.west, r.south, r.east, r.north), credit: 'NISAR: NASA/JPL-Caltech & ISRO via ASF DAAC' }),
      { alpha },
    );
    viewer.imageryLayers.add(layer);
    return layer;
  }
  function clearLayers() {
    if (!run?.layers) return;
    for (const l of Object.values(run.layers)) if (l) viewer.imageryLayers.remove(l, true);
    run.layers = null;
  }
  function setView(v) {
    if (!run?.layers) return;
    run.view = v;
    const L = run.layers;
    L.before.alpha = v === 'before' ? 1 : 0;
    L.after.alpha = v === 'after' ? 1 : v === 'change' ? 0.55 : 0;
    L.change.alpha = v === 'change' ? 1 : 0;
    render();
  }
  let flick = null;
  function flicker(on) {
    clearInterval(flick);
    flick = null;
    if (!on) return setView('change');
    let b = false;
    flick = setInterval(() => setView((b = !b) ? 'before' : 'after'), 750);
  }

  // ---------- engine ----------
  async function start(lat, lon) {
    const my = ++token;
    close({ keepFab: true });
    app.cam.idleSpin(false);
    for (const id of ['#sat-card', '#live-card', '#feed']) $(id).hidden = true;
    $('#legend')?.classList.add('min');
    run = { lat, lon, stacks: null, si: 0, from: null, to: null, images: new Map(), result: null, layers: null, view: 'change', status: 'Finding NISAR passes over this place…' };
    card.hidden = false;
    render();
    app.cam.flyToLocation({ lon, lat, height: 900000, pitch: -70, duration: 2.6 });
    try {
      const r = await (await fetch(`/api/change/stacks?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(40000) })).json();
      if (my !== token) return;
      if (r.error) throw new Error(r.error);
      run.stacks = r.stacks || [];
      run.freshness = r.freshness;
      if (!run.stacks.length) { run.status = 'NISAR has no repeat passes with public images here yet (last 90 days). Try land nearby.'; render(); return; }
      const d = run.stacks[0].dates;
      run.from = d.length - 2;
      run.to = d.length - 1;
      await compute(my);
    } catch (e) {
      if (my !== token) return;
      run.status = `DATA TEMPORARILY UNAVAILABLE (${e.message})`;
      render();
    }
  }

  /** Start from a known pair (a Change Radar hotspot), then load the full stack for more dates. */
  async function startPair(h) {
    const my = ++token;
    close({ keepFab: true });
    app.cam.idleSpin(false);
    for (const id of ['#sat-card', '#live-card', '#feed']) $(id).hidden = true;
    $('#legend')?.classList.add('min');
    const [tr, di, fr, mo] = h.key.split('_');
    run = {
      lat: h.lat, lon: h.lon, si: 0, from: 0, to: 1, images: new Map(), result: null, layers: null, view: 'change',
      stacks: [{ key: h.key, track: Number(tr), direction: di, frame: Number(fr), mode: mo, dates: [h.from, h.to] }],
      status: 'Loading the hotspot pair…', freshness: 'SCANNED',
    };
    card.hidden = false;
    render();
    app.cam.flyToLocation({ lon: h.lon, lat: h.lat, height: 700000, pitch: -68, duration: 2.6 });
    try {
      await compute(my);
      // Upgrade to the full stack (more dates) without losing the current pair.
      const r = await (await fetch(`/api/change/stacks?lat=${h.lat}&lon=${h.lon}`, { signal: AbortSignal.timeout(40000) })).json();
      if (my !== token || !run) return;
      const full = (r.stacks || []).find((x) => x.key === h.key);
      if (full) {
        const fi = full.dates.findIndex((x) => x.id === h.from.id), ti = full.dates.findIndex((x) => x.id === h.to.id);
        if (fi >= 0 && ti > fi) {
          run.stacks = [full, ...r.stacks.filter((x) => x.key !== h.key)];
          run.si = 0; run.from = fi; run.to = ti; run.freshness = r.freshness;
          render();
        }
      }
    } catch (e) {
      if (my !== token || !run) return;
      if (!run.result) { run.status = `DATA TEMPORARILY UNAVAILABLE (${e.message})`; render(); }
    }
  }

  async function image(g) {
    if (!run.images.has(g.id)) run.images.set(g.id, loadBrowse(g));
    return run.images.get(g.id);
  }

  async function compute(my = token) {
    const stack = run.stacks[run.si];
    const A = stack.dates[run.from], B = stack.dates[run.to];
    run.status = `Loading two real NISAR images: ${fmtDate(A.t)} and ${fmtDate(B.t)}…`;
    run.result = null;
    render();
    const [ia, ib] = await Promise.all([image(A), image(B)]);
    if (my !== token) return;
    run.status = 'Computing change…';
    render();
    await new Promise((r) => setTimeout(r, 30));
    const res = computeChange(ia, ib, { land: await landMask() });
    if (my !== token) return;
    const { W, H, west, east, north, south } = res.grid;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').putImageData(new ImageData(changeToRGBA(res), W, H), 0, 0);
    clearLayers();
    run.layers = {
      before: addLayer(ia.canvas.toDataURL('image/png'), ia.rect, 0),
      after: addLayer(ib.canvas.toDataURL('image/png'), ib.rect, 0.55),
      change: addLayer(cv.toDataURL('image/png'), { west, east, north, south }, 1),
    };
    run.result = res;
    run.georef = [ia.residualKm, ib.residualKm];
    run.status = null;
    setView('change');
    app.onChangeComputed?.(run);
  }

  // ---------- card ----------
  function render() {
    if (!run) return;
    const st = run.stacks?.[run.si];
    const res = run.result;
    const s = res?.stats;
    const dateBtn = (i, which) => `<button class="chip ${i === run[which] ? 'on' : ''}" data-act="${which}" data-i="${i}" ${which === 'from' && i >= run.to ? 'disabled' : ''} ${which === 'to' && i <= run.from ? 'disabled' : ''}>${esc(st.dates[i].t.slice(5, 10).replace('-', '/'))}</button>`;
    const days = st && run.from != null ? Math.round((Date.parse(st.dates[run.to].t) - Date.parse(st.dates[run.from].t)) / 864e5) : 0;
    card.innerHTML = `<button class="close-x" data-act="close" aria-label="Close">✕</button>
      <div class="eyebrow">CHANGE ENGINE · ${tag(DATA_CLASS.REAL_NISAR, 'NISAR DATA')} ${res ? tag(DATA_CLASS.DERIVED, 'CHANGE MAP') : ''}</div>
      <h2>WHAT CHANGED HERE?</h2>
      <div class="mono" style="font-size:11px;color:var(--ink-3)">${fmtCoord(run.lat, run.lon, 3)}</div>
      ${run.status ? `<p style="margin:14px 0">${res ? '' : '<span class="lg-spin"></span> '}${esc(run.status)}</p>` : ''}
      ${st ? `
        <div class="ce-block"><h3>ORBIT TRACK ${run.stacks.length > 1 ? `<span>${run.stacks.map((x, i) => `<button class="chip ${i === run.si ? 'on' : ''}" data-act="stack" data-i="${i}">${x.track}${x.direction}</button>`).join('')}</span>` : ''}</h3>
          <p class="fine" style="margin:0">Track ${st.track} · ${st.direction === 'A' ? 'ascending' : 'descending'} · frame ${st.frame} · ${st.dates.length} passes, every 12 days. Comparing passes from the same track keeps the viewing geometry identical.</p></div>
        <div class="ce-block"><h3>FROM</h3><div class="chips-row">${st.dates.map((_, i) => dateBtn(i, 'from')).join('')}</div>
          <h3 style="margin-top:8px">TO</h3><div class="chips-row">${st.dates.map((_, i) => dateBtn(i, 'to')).join('')}</div></div>` : ''}
      ${res ? `
        <div class="ce-views" role="group">
          ${['before', 'after', 'change'].map((v) => `<button class="btn ${run.view === v && !flick ? 'primary' : ''}" data-act="view" data-v="${v}">${v === 'before' ? fmtDate(st.dates[run.from].t) : v === 'after' ? fmtDate(st.dates[run.to].t) : 'CHANGE'}</button>`).join('')}
          <button class="btn ${flick ? 'primary' : ''}" data-act="flicker">FLICKER</button>
        </div>
        <div class="ce-stats">
          <div><b style="color:#48d6ff">${s.darkerKm2.toLocaleString('en-US')} km²</b><span>BECAME DARKER</span></div>
          <div><b style="color:#ffa033">${s.brighterKm2.toLocaleString('en-US')} km²</b><span>BECAME BRIGHTER</span></div>
          <div><b>${days} days</b><span>BETWEEN PASSES</span></div>
        </div>
        <div class="ce-block"><h3>WHAT IT MAY MEAN</h3>
          <p style="margin:0 0 6px"><span style="color:#48d6ff">■ Darker</span>: less radar energy came back. This may indicate ${MEANING.darker.join(', ')}.</p>
          <p style="margin:0"><span style="color:#ffa033">■ Brighter</span>: more energy came back. This may indicate ${MEANING.brighter.join(', ')}.</p>
          <p class="fine" style="margin-top:6px">A radar change alone can't tell which one. Local knowledge, other satellites, or more dates are needed.</p></div>
        ${res.hotspots.length ? `<div class="ce-block"><h3>BIGGEST CHANGES</h3>${res.hotspots.slice(0, 3).map((h, i) => `<button class="btn" data-act="hot" data-i="${i}">${h.darker > h.brighter ? 'DARKER' : 'BRIGHTER'} · ${fmtCoord(h.lat, h.lon, 2)}</button>`).join(' ')}</div>` : ''}
        <details class="ce-block"><summary>HOW THIS WAS COMPUTED · PROVENANCE</summary>
          <p class="fine">Two NISAR L2 GCOV browse images (8-bit quick-looks, not calibrated) from the same track and frame were placed on a common grid (georeferencing ±${run.georef.join(' / ±')} km). Each was normalised by its median brightness to cancel the per-image contrast stretch, then compared as a log-ratio, smoothed 5×5 against speckle, and thresholded at ±${s.threshold} (a factor of ≈${Math.exp(s.threshold).toFixed(2)}). This is a relative change indicator, not a calibrated dB difference. Area evaluated: ${s.validKm2.toLocaleString('en-US')} km²${s.waterMaskedKm2 ? ` (≈${s.waterMaskedKm2.toLocaleString('en-US')} km² of open water masked out: over water, radar brightness follows the wind)` : ''}. Pixels are only classified where both passes fully cover the smoothing window.</p>
          <div class="granule">${esc(st.dates[run.from].id)}</div><div class="granule" style="margin-top:4px">${esc(st.dates[run.to].id)}</div>
          <p class="fine">Source: ASF DAAC search (${esc(run.freshness || '')}) · NISAR data courtesy NASA/JPL-Caltech & ISRO. Provisional products.</p>
        </details>
        <div class="btn-row"><button class="btn accent" data-act="sonify">♪ LISTEN TO THE CHANGE</button><button class="btn" data-act="series">PLAY ALL ${st.dates.length} PASSES</button></div>` : ''}`;
    card.onclick = onClick;
  }

  async function onClick(e) {
    const a = e.target.closest('[data-act]');
    if (!a || a.disabled) return;
    const d = a.dataset;
    if (d.act === 'close') return close();
    if (d.act === 'view') { flicker(false); return setView(d.v); }
    if (d.act === 'flicker') { flicker(!flick); return render(); }
    if (d.act === 'from' || d.act === 'to') { run[d.act] = Number(d.i); flicker(false); return compute(++token); }
    if (d.act === 'stack') { run.si = Number(d.i); const n = run.stacks[run.si].dates.length; run.from = n - 2; run.to = n - 1; flicker(false); return compute(++token); }
    if (d.act === 'hot') { const h = run.result.hotspots[Number(d.i)]; return app.cam.flyToLocation({ lon: h.lon, lat: h.lat, height: 120000, pitch: -60, duration: 2.4 }); }
    if (d.act === 'sonify') return app.sonify?.(run);
    if (d.act === 'series') return playSeries();
  }

  /** Step the change map through every consecutive pair of the stack. */
  async function playSeries() {
    const n = run.stacks[run.si].dates.length;
    for (let i = 0; i + 1 < n; i++) {
      run.from = i; run.to = i + 1;
      const my = ++token;
      await compute(my);
      if (my !== token || !run) return;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  function close({ keepFab = false } = {}) {
    token++;
    flicker(false);
    clearLayers();
    run = null;
    card.hidden = true;
    if (!keepFab) fab.hidden = true;
  }

  return { offerAt, start, startPair, close, get active() { return !!run; }, get run() { return run; } };
}
