// Puts a story's real NISAR frames on the globe and animates between them.
// Each frame is a georeferenced browse image (see tools/build_stories.py).
import * as Cesium from 'cesium';
import { reducedMotion } from './camera.js';

const rect = (r) => Cesium.Rectangle.fromDegrees(r.west, r.south, r.east, r.north);

export function createStoryLayers(viewer) {
  const layers = viewer.imageryLayers;
  let story = null;
  let frames = []; // { layer, ready: Promise }
  let water = [];
  let change = null;
  let entities = [];
  let current = 0;
  let compare = { mode: 'single', before: 0, after: 0 };
  let flickerTimer = null;
  let fadeAnim = null;
  let radarOpacity = 1;
  let overlay = null; // 'water' | 'change' | null

  function makeLayer(url, rectangle, { alpha = 0 } = {}) {
    const layer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.SingleTileImageryProvider.fromUrl(url, { rectangle: rect(rectangle), credit: 'NISAR: NASA/JPL-Caltech & ISRO via ASF DAAC' }),
      { alpha, show: true },
    );
    layers.add(layer);
    const ready = new Promise((res) => {
      layer.readyEvent.addEventListener(() => res(true));
      layer.errorEvent.addEventListener(() => res(false));
    });
    return { layer, ready };
  }

  async function load(s) {
    clear();
    story = s;
    if (!s?.available) return false;
    frames = s.timeline.map((t) => makeLayer(t.image, t.rectangle));
    const grid = s.evidence?.derived?.grid;
    if (grid) {
      water = s.timeline.map((t) => (t.waterMask ? makeLayer(t.waterMask, grid) : null));
      const ch = s.evidence.derived.change;
      if (ch) change = makeLayer(`/data/stories/${s.id}/${ch.file}`, grid);
    }
    // Real footprint outline of the evidence frame.
    const fp = s.timeline[0]?.footprint;
    if (fp) {
      entities.push(viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([...fp, fp[0]].flat()),
          width: 1.5,
          material: Cesium.Color.fromCssColorString('#7fe6ff').withAlpha(0.8),
          clampToGround: true,
        },
      }));
    }
    const ev = s.evidence?.contextEvent;
    if (ev) {
      entities.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat),
        point: { pixelSize: 9, color: Cesium.Color.fromCssColorString('#ff5fa2'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: {
          text: `USGS EPICENTER · M${ev.mag}`,
          font: '500 11px "Inter Tight", sans-serif',
          pixelOffset: new Cesium.Cartesian2(12, -12),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }));
    }
    await frames[s.beforeIndex ?? 0]?.ready;
    show(s.beforeIndex ?? 0, { instant: true });
    return true;
  }

  function stopAnimations() {
    if (flickerTimer) clearInterval(flickerTimer);
    flickerTimer = null;
    if (fadeAnim) cancelAnimationFrame(fadeAnim);
    fadeAnim = null;
  }

  function resetSplit() {
    for (const f of frames) f.layer.splitDirection = Cesium.SplitDirection.NONE;
    for (const w of water) if (w) w.layer.splitDirection = Cesium.SplitDirection.NONE;
  }

  function applyAlphas(map) {
    frames.forEach((f, i) => { f.layer.alpha = (map[i] || 0) * radarOpacity; });
    water.forEach((w, i) => { if (w) w.layer.alpha = overlay === 'water' ? (map[i] || 0) : 0; });
    if (change) change.layer.alpha = overlay === 'change' ? 1 : 0;
  }

  /** Crossfade to frame i (the time machine). */
  function show(i, { instant = false } = {}) {
    stopAnimations();
    resetSplit();
    compare.mode = 'single';
    const from = current;
    current = Math.max(0, Math.min(frames.length - 1, i));
    if (instant || reducedMotion() || from === current) return applyAlphas({ [current]: 1 });
    const t0 = performance.now();
    const D = 700;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / D);
      const e = k * k * (3 - 2 * k);
      applyAlphas({ [from]: 1 - e, [current]: e });
      if (k < 1) fadeAnim = requestAnimationFrame(step);
    };
    fadeAnim = requestAnimationFrame(step);
  }

  function setCompare(mode, before, after) {
    stopAnimations();
    resetSplit();
    compare = { mode, before, after };
    if (mode === 'split') {
      // Left of the divider = BEFORE, right = AFTER.
      frames[before].layer.splitDirection = Cesium.SplitDirection.LEFT;
      frames[after].layer.splitDirection = Cesium.SplitDirection.RIGHT;
      if (water[before]) water[before].layer.splitDirection = Cesium.SplitDirection.LEFT;
      if (water[after]) water[after].layer.splitDirection = Cesium.SplitDirection.RIGHT;
      applyAlphas({ [before]: 1, [after]: 1 });
    } else if (mode === 'flicker') {
      let on = false;
      applyAlphas({ [before]: 1 });
      flickerTimer = setInterval(() => { on = !on; current = on ? after : before; applyAlphas({ [current]: 1 }); }, reducedMotion() ? 1600 : 800);
    } else if (mode === 'fade') {
      setFade(0.5);
    } else {
      show(after, { instant: true });
    }
  }

  function setFade(t) {
    const { before, after } = compare;
    applyAlphas({ [before]: 1, [after]: t });
    // draw 'after' above 'before' so the fade reads as a blend
    if (layers.indexOf(frames[after].layer) < layers.indexOf(frames[before].layer)) layers.raiseToTop(frames[after].layer);
  }

  function setSplitPosition(x) {
    viewer.scene.splitPosition = x;
  }

  function setOverlay(kind) {
    overlay = kind;
    if (compare.mode === 'split') return setCompare('split', compare.before, compare.after);
    applyAlphas({ [current]: 1 });
  }

  function setRadarOpacity(v) {
    radarOpacity = v;
    if (compare.mode === 'split') applyAlphas({ [compare.before]: 1, [compare.after]: 1 });
    else applyAlphas({ [current]: 1 });
  }

  function clear() {
    stopAnimations();
    for (const f of frames) layers.remove(f.layer, true);
    for (const w of water) if (w) layers.remove(w.layer, true);
    if (change) layers.remove(change.layer, true);
    for (const e of entities) viewer.entities.remove(e);
    frames = []; water = []; change = null; entities = []; story = null; current = 0; overlay = null;
    compare = { mode: 'single', before: 0, after: 0 };
  }

  const preload = () => Promise.all(frames.map((f) => f.ready));

  return {
    load, show, setCompare, setFade, setSplitPosition, setOverlay, setRadarOpacity, clear, preload,
    get current() { return current; },
    get story() { return story; },
    get compareMode() { return compare.mode; },
    get overlay() { return overlay; },
  };
}
