// LIVING EARTH — hundreds of thousands of real, recent observations on the globe.
//   fires   NASA FIRMS detections (24 h) — each tagged with the satellite that saw it
//   quakes  USGS M2.5+ (30 d)
//   events  NASA EONET + GDACS open events
//   nisar   NISAR GCOV/GUNW footprints (recent days) — click to drape the real image
import * as Cesium from 'cesium';
import { reducedMotion } from './camera.js';
import { loadBrowse } from './browse.js';

const C = (hex, a = 1) => Cesium.Color.fromCssColorString(hex).withAlpha(a);
export const LIVE_COLORS = {
  radar: '#ffffff', fires: '#ff7a2f', quakes: '#ff5fa2', events: '#ffd166', nisarGCOV: '#48d6ff', nisarGUNW: '#b388ff',
};
export const EVENT_COLORS = {
  wildfires: '#ff8a3d', severeStorms: '#9ad0ff', volcanoes: '#ff4d4d', seaLakeIce: '#e6f4ff', floods: '#48d6ff',
  drought: '#e0b35a', earthquakes: '#ff5fa2', landslides: '#c79a6b', dustHaze: '#d8c49a', snow: '#ffffff',
  tempExtremes: '#ff6b6b', waterColor: '#4dd4ac', manmade: '#cccccc', other: '#ffd166',
};

function fireColor(frp) {
  if (frp >= 100) return C('#fff1c1', 0.95);
  if (frp >= 30) return C('#ff4a2a', 0.9);
  if (frp >= 8) return C('#ff7a2f', 0.8);
  return C('#ffb347', 0.6);
}

function haloCanvas(hex, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.18, hex);
  g.addColorStop(0.45, hex + '66');
  g.addColorStop(1, hex + '00');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

async function getJson(url, timeout = 90000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Try live API, then the bundled snapshot (ARCHIVED tier). */
async function loadFeed(name, live) {
  try {
    return { ...(await getJson(live)), tier: null };
  } catch {
    const snap = await getJson(`/data/live/${name}.json`, 30000);
    return { ...snap, freshness: 'ARCHIVED', tier: 'snapshot' };
  }
}

export function createLiveLayers(viewer) {
  const scene = viewer.scene;
  const data = { radar: null, fires: null, quakes: null, events: null, nisar: null };
  const status = { radar: 'loading', fires: 'loading', quakes: 'loading', events: 'loading', nisar: 'loading' };
  const visible = { radar: true, fires: true, quakes: true, events: true, nisar: true };
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f());

  const firePts = scene.primitives.add(new Cesium.PointPrimitiveCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT }));
  const quakePts = scene.primitives.add(new Cesium.PointPrimitiveCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT }));
  const eventBoards = scene.primitives.add(new Cesium.BillboardCollection({ scene }));
  const eventTracks = scene.primitives.add(new Cesium.PolylineCollection());
  const radarPts = scene.primitives.add(new Cesium.PointPrimitiveCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT }));
  let nisarPrim = null;
  let nisarIds = []; // Cesium matches instance ids by reference, so keep them
  let fireFilter = null; // satIndex or null
  let nisarHighlight = false;
  const draped = new Map(); // granule id -> imagery layer

  // ---------- fires ----------
  function buildFires() {
    firePts.removeAll();
    const f = data.fires.fires;
    const nearFar = new Cesium.NearFarScalar(2e5, 2.2, 1.6e7, 0.55);
    const fade = new Cesium.NearFarScalar(1e6, 1.0, 3.5e7, 0.55);
    for (let i = 0; i < f.length; i++) {
      const r = f[i];
      firePts.add({
        position: Cesium.Cartesian3.fromDegrees(r[0], r[1], 0),
        pixelSize: 1.6 + Math.min(4.2, Math.log10(1 + r[2]) * 1.9),
        color: fireColor(r[2]),
        scaleByDistance: nearFar,
        translucencyByDistance: fade,
        id: i,
      });
    }
    applyFireFilter();
  }

  function applyFireFilter() {
    if (!data.fires) return;
    const f = data.fires.fires;
    const n = firePts.length;
    for (let i = 0; i < n; i++) firePts.get(i).show = visible.fires && (fireFilter == null || f[i][4] === fireFilter);
  }

  // ---------- NISAR change radar (hotspots from tools/scan_changes.py) ----------
  function buildRadar() {
    radarPts.removeAll();
    const hs = data.radar.hotspots;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      const dom = h.darker > h.brighter * 1.5 ? '#48d6ff' : h.brighter > h.darker * 1.5 ? '#ffa033' : '#ffffff';
      const k = Math.min(1, h.hotDensity * 1.6);
      radarPts.add({
        position: Cesium.Cartesian3.fromDegrees(h.lon, h.lat, 0),
        pixelSize: 5 + 11 * k,
        color: C(dom, 0.35 + 0.45 * k),
        outlineColor: C('#ffffff', 0.35 + 0.5 * k),
        outlineWidth: 1.5,
        scaleByDistance: new Cesium.NearFarScalar(4e5, 1.6, 2.5e7, 0.75),
        id: i,
      });
    }
    radarPts.show = visible.radar;
  }

  // ---------- quakes ----------
  function buildQuakes() {
    quakePts.removeAll();
    const now = Date.now();
    for (let i = 0; i < data.quakes.quakes.length; i++) {
      const q = data.quakes.quakes[i];
      const ageD = (now - q[4]) / 864e5;
      const recent = Math.max(0.25, 1 - ageD / 30);
      quakePts.add({
        position: Cesium.Cartesian3.fromDegrees(q[0], q[1], 0),
        pixelSize: 3 + Math.max(0, q[3] - 2.5) * 3.2,
        color: C('#ff5fa2', 0.2 + 0.45 * recent),
        outlineColor: C(ageD < 1 ? '#ffffff' : '#ff9cc8', 0.5 + 0.4 * recent),
        outlineWidth: ageD < 1 ? 1.6 : 1,
        scaleByDistance: new Cesium.NearFarScalar(3e5, 1.8, 2e7, 0.7),
        id: i,
      });
    }
  }

  // ---------- events ----------
  function buildEvents() {
    eventBoards.removeAll();
    eventTracks.removeAll();
    const cache = {};
    for (let i = 0; i < data.events.events.length; i++) {
      const e = data.events.events[i];
      const hex = EVENT_COLORS[e.category] || EVENT_COLORS.other;
      cache[hex] ||= haloCanvas(hex);
      const big = e.source === 'GDACS' || e.category !== 'wildfires';
      eventBoards.add({
        position: Cesium.Cartesian3.fromDegrees(e.lon, e.lat, 0),
        image: cache[hex],
        scale: big ? 0.62 : 0.34,
        scaleByDistance: new Cesium.NearFarScalar(4e5, 1.5, 2.5e7, 0.6),
        id: i,
      });
      if (e.track && e.track.length > 1) {
        eventTracks.add({
          positions: Cesium.Cartesian3.fromDegreesArray(e.track.flat()),
          width: 1.5,
          material: Cesium.Material.fromType('Color', { color: C(hex, 0.6) }),
        });
      }
    }
  }

  // ---------- NISAR footprints ----------
  function buildNisar() {
    if (nisarPrim) { scene.primitives.remove(nisarPrim); nisarPrim = null; }
    const g = data.nisar.granules;
    const latest = g.length ? Date.parse(g.at(-1).t) : Date.now();
    const instances = [];
    nisarIds = [];
    for (let i = 0; i < g.length; i++) {
      const r = g[i];
      if (r.ring.length < 3) continue;
      // Unwrap footprints that cross the antimeridian (lon jumps ±180).
      const lons = r.ring.map((p) => p[0]);
      const ring = Math.max(...lons) - Math.min(...lons) > 180 ? r.ring.map(([lo, la]) => [lo < 0 ? lo + 360 : lo, la]) : r.ring;
      nisarIds[i] = { live: 'nisar', i };
      const age = (latest - Date.parse(r.t)) / (data.nisar.days * 864e5);
      const base = r.type === 'GUNW' ? LIVE_COLORS.nisarGUNW : LIVE_COLORS.nisarGCOV;
      instances.push(new Cesium.GeometryInstance({
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(ring.flat())),
          height: 0,
          vertexFormat: Cesium.PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          granularity: Cesium.Math.toRadians(1),
        }),
        id: nisarIds[i],
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(C(base, 0.1 + 0.2 * (1 - Math.min(1, age)))),
          show: new Cesium.ShowGeometryInstanceAttribute(true),
        },
      }));
    }
    nisarPrim = scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true, renderState: { depthTest: { enabled: true }, depthMask: false } }),
      asynchronous: true,
      releaseGeometryInstances: false,
    }));
    nisarPrim.show = visible.nisar;
  }

  function nisarAttr(i) {
    return nisarPrim?.ready && nisarIds[i] ? nisarPrim.getGeometryInstanceAttributes(nisarIds[i]) : null;
  }

  // ---------- loading ----------
  async function load() {
    const jobs = [
      ['radar', '/data/change/radar.json', buildRadar],
      ['quakes', '/api/live/quakes', buildQuakes],
      ['events', '/api/live/events', buildEvents],
      ['nisar', '/api/live/nisar?days=3', buildNisar],
      ['fires', '/api/live/fires', buildFires],
    ];
    await Promise.all(jobs.map(async ([k, url, build]) => {
      try {
        data[k] = k === 'radar' ? await getJson(url, 30000) : await loadFeed(k, url);
        build();
        status[k] = k === 'radar' ? 'SCANNED' : data[k].freshness || 'LIVE';
      } catch (e) {
        status[k] = 'UNAVAILABLE';
      }
      emit();
    }));
  }

  // ---------- picking ----------
  function pickAt(windowPos) {
    const picks = scene.drillPick(windowPos, 5, 12, 12);
    for (const p of picks) {
      if (p.collection === radarPts && data.radar) return { kind: 'radar', i: p.id, record: data.radar.hotspots[p.id] };
      if (p.collection === firePts && data.fires) return { kind: 'fire', i: p.id, record: data.fires.fires[p.id] };
      if (p.collection === quakePts && data.quakes) return { kind: 'quake', i: p.id, record: data.quakes.quakes[p.id] };
      if (p.collection === eventBoards && data.events) return { kind: 'event', i: p.id, record: data.events.events[p.id] };
    }
    for (const p of picks) if (p.id?.live === 'nisar') return { kind: 'nisar', i: p.id.i, record: data.nisar.granules[p.id.i] };
    return null;
  }

  // ---------- time-lapse ----------
  let lapse = null;
  /** Replays each layer across its own window (fires 24 h, quakes 30 d, NISAR N d) in `seconds`. */
  function playTimelapse({ seconds = 16, onProgress } = {}) {
    stopTimelapse();
    if (reducedMotion()) return Promise.resolve();
    const order = (arr, tOf) => arr.map((r, i) => [tOf(r), i]).sort((a, b) => a[0] - b[0]);
    const fo = data.fires ? order(data.fires.fires, (r) => r[3]) : [];
    const qo = data.quakes ? order(data.quakes.quakes, (r) => r[4]) : [];
    const no = data.nisar ? order(data.nisar.granules, (r) => Date.parse(r.t)) : [];
    const hideAll = () => {
      for (let i = 0; i < firePts.length; i++) firePts.get(i).show = false;
      for (let i = 0; i < quakePts.length; i++) quakePts.get(i).show = false;
      if (nisarPrim?.ready) no.forEach(([, i]) => { const a = nisarAttr(i); if (a) a.show = Cesium.ShowGeometryInstanceAttribute.toValue(false, a.show); });
    };
    hideAll();
    const ptr = { f: 0, q: 0, n: 0 };
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        const upTo = (ord, key, show) => { const lim = Math.floor(ord.length * k); while (ptr[key] < lim) show(ord[ptr[key]++][1]); };
        upTo(fo, 'f', (i) => { if (visible.fires && (fireFilter == null || data.fires.fires[i][4] === fireFilter)) firePts.get(i).show = true; });
        upTo(qo, 'q', (i) => { if (visible.quakes) quakePts.get(i).show = true; });
        upTo(no, 'n', (i) => { const a = nisarAttr(i); if (a) a.show = Cesium.ShowGeometryInstanceAttribute.toValue(true, a.show); });
        onProgress?.(k, {
          fires: data.fires && fo.length ? new Date(fo[Math.max(0, ptr.f - 1)][0] * 60000) : null,
          quakes: qo.length ? new Date(qo[Math.max(0, ptr.q - 1)][0]) : null,
          nisar: no.length ? new Date(no[Math.max(0, ptr.n - 1)][0]) : null,
        });
        if (k < 1) lapse = requestAnimationFrame(step);
        else { lapse = null; restoreVisibility(); resolve(); }
      };
      lapse = requestAnimationFrame(step);
    });
  }
  function stopTimelapse() {
    if (lapse) cancelAnimationFrame(lapse);
    lapse = null;
    restoreVisibility();
  }
  function restoreVisibility() {
    applyFireFilter();
    for (let i = 0; i < quakePts.length; i++) quakePts.get(i).show = visible.quakes;
    if (nisarPrim?.ready && data.nisar) data.nisar.granules.forEach((_, i) => { const a = nisarAttr(i); if (a) a.show = Cesium.ShowGeometryInstanceAttribute.toValue(true, a.show); });
  }

  // ---------- controls ----------
  function setVisible(k, v) {
    visible[k] = v;
    if (k === 'fires') applyFireFilter();
    if (k === 'quakes') quakePts.show = v;
    if (k === 'radar') radarPts.show = v;
    if (k === 'events') { eventBoards.show = v; eventTracks.show = v; }
    if (k === 'nisar' && nisarPrim) nisarPrim.show = v;
    emit();
  }
  function setAll(v) { for (const k of Object.keys(visible)) setVisible(k, v); }
  function setFireFilter(satIndex) { fireFilter = satIndex; applyFireFilter(); emit(); }

  function highlightNisar(on) {
    nisarHighlight = on;
    if (!nisarPrim?.ready || !data.nisar) return;
    data.nisar.granules.forEach((r, i) => {
      const a = nisarAttr(i);
      if (!a) return;
      const base = r.type === 'GUNW' ? LIVE_COLORS.nisarGUNW : LIVE_COLORS.nisarGCOV;
      a.color = Cesium.ColorGeometryInstanceAttribute.toValue(C(base, on ? 0.42 : 0.2), a.color);
    });
  }

  // ---------- drape a real NISAR browse image for a footprint ----------
  async function drapeNisar(g) {
    if (draped.has(g.id)) return draped.get(g.id).info;
    const b = await loadBrowse(g);
    const layer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.SingleTileImageryProvider.fromUrl(b.canvas.toDataURL('image/png'), {
        rectangle: Cesium.Rectangle.fromDegrees(b.rect.west, b.rect.south, b.rect.east, b.rect.north),
        credit: 'NISAR: NASA/JPL-Caltech & ISRO via ASF DAAC',
      }),
    );
    viewer.imageryLayers.add(layer);
    const info = { rect: b.rect, residualKm: b.residualKm, browseUrl: b.browseUrl };
    draped.set(g.id, { layer, info });
    return info;
  }
  function clearDraped() {
    for (const { layer } of draped.values()) viewer.imageryLayers.remove(layer, true);
    draped.clear();
  }

  return {
    load, pickAt, playTimelapse, stopTimelapse, setVisible, setAll, setFireFilter, highlightNisar, drapeNisar, clearDraped,
    onChange: (f) => listeners.add(f),
    data, status, visible,
    collections: { radar: radarPts, fires: firePts, quakes: quakePts, events: eventBoards },
    get fireFilter() { return fireFilter; },
    get nisarHighlight() { return nisarHighlight; },
  };
}
