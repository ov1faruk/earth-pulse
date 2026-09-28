// Real satellites on the globe, propagated from CelesTrak TLEs with SGP4.
// Rendering approach (one PointPrimitiveCollection, periodic re-propagation,
// entity + CallbackProperty for the tracked object) follows God's Eye View's
// satellites layer (MIT © 2026 Bilawal Sidhu), rewritten without its app shell.
import * as Cesium from 'cesium';
import { satrecFromTle, geodeticAt, swathSamples, orbitalPeriodMin, NISAR_SWATH } from '../core/orbit.js';
import { missionFor } from '../core/missions.js';
import { satelliteGroup, satelliteTle } from '../data/api.js';

export const NISAR_NORAD = 65053;
const GROUPS = ['resource', 'weather', 'science', 'stations'];
const UPDATE_MS = 500;

const SENSOR_COLOR = {
  radar: Cesium.Color.fromCssColorString('#9fe9ff').withAlpha(0.95),
  optical: Cesium.Color.fromCssColorString('#f4f7fb').withAlpha(0.85),
  radiometer: Cesium.Color.fromCssColorString('#c8a6ff').withAlpha(0.9),
  lidar: Cesium.Color.fromCssColorString('#b9ffcf').withAlpha(0.9),
  other: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.55),
  none: Cesium.Color.fromCssColorString('#b8c6d6').withAlpha(0.42),
};

const nowOf = (viewer) => Cesium.JulianDate.toDate(viewer.clock.currentTime);
const toCart = (g) => Cesium.Cartesian3.fromDegrees(g.lon, g.lat, g.altKm * 1000);

function nisarGlyph() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(127,230,255,0.55)');
  g.addColorStop(1, 'rgba(127,230,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 2;
  x.beginPath(); x.arc(32, 32, 9, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(32, 32, 3.2, 0, Math.PI * 2); x.fill();
  // reflector boom hint (NISAR's 12 m mesh reflector)
  x.strokeStyle = 'rgba(127,230,255,0.9)';
  x.beginPath(); x.moveTo(41, 32); x.lineTo(52, 32); x.stroke();
  return c;
}

export function createSatelliteLayer(viewer, { onFreshness } = {}) {
  const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT }));
  const sats = new Map(); // norad -> { tle, satrec, mission, point }
  let nisar = null;
  let lastUpdate = 0;
  let tracked = null; // { norad, entity }
  const decor = { orbit: null, ground: null, swath: null, swathLabel: null, norad: null };
  let swathCache = { key: '', hierarchy: null };
  const state = { freshness: null, fetchedAt: null, visible: true, swathVisible: false };

  async function load() {
    const results = await Promise.allSettled(GROUPS.map((g) => satelliteGroup(g)));
    let fresh = null;
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      fresh = fresh || r.value;
      for (const tle of r.value.satellites) {
        if (sats.has(tle.norad)) continue;
        let satrec;
        try { satrec = satrecFromTle(tle); } catch { continue; }
        const mission = missionFor(tle.name);
        const isNisar = tle.norad === NISAR_NORAD;
        const point = isNisar ? null : points.add({
          pixelSize: mission ? 5.5 : 3.4,
          color: SENSOR_COLOR[mission?.sensor || 'none'],
          outlineWidth: 0,
          scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.6, 4e7, 0.7),
          id: { kind: 'satellite', norad: tle.norad },
        });
        sats.set(tle.norad, { tle, satrec, mission, point });
      }
    }
    if (!sats.has(NISAR_NORAD)) {
      try {
        const r = await satelliteTle(NISAR_NORAD);
        sats.set(NISAR_NORAD, { tle: r.satellite, satrec: satrecFromTle(r.satellite), mission: missionFor('NISAR'), point: null });
        fresh = fresh || r;
      } catch { /* NISAR unavailable → no NISAR marker, never a fake one */ }
    }
    state.freshness = fresh?.freshness || 'UNAVAILABLE';
    state.fetchedAt = fresh?.fetchedAt || null;
    onFreshness?.(state);
    if (sats.has(NISAR_NORAD)) addNisar();
    update(true);
  }

  function addNisar() {
    const s = sats.get(NISAR_NORAD);
    let frame = -1, cached = null;
    const position = new Cesium.CallbackProperty((time) => {
      const f = viewer.scene.frameState.frameNumber;
      if (f !== frame) {
        const g = geodeticAt(s.satrec, Cesium.JulianDate.toDate(time));
        cached = g ? toCart(g) : cached;
        frame = f;
      }
      return cached;
    }, false);
    nisar = viewer.entities.add({
      id: 'nisar',
      name: 'NISAR',
      position,
      billboard: {
        image: nisarGlyph(),
        scale: 0.62,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.25, 3e7, 0.55),
        disableDepthTestDistance: 0,
      },
      label: {
        text: 'NISAR',
        font: '500 12px "Inter Tight", sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(16, -2),
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        showBackground: false,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.1, 4e7, 0.7),
        translucencyByDistance: new Cesium.NearFarScalar(3e7, 1, 6e7, 0.35),
      },
    });
    nisar.pulseKind = 'nisar';
    s.entity = nisar;
  }

  function update(force = false) {
    const now = performance.now();
    if (!force && now - lastUpdate < UPDATE_MS) return;
    lastUpdate = now;
    const d = nowOf(viewer);
    for (const s of sats.values()) {
      if (!s.point) continue;
      const g = geodeticAt(s.satrec, d);
      if (!g) { s.point.show = false; continue; }
      s.point.show = state.visible;
      s.point.position = toCart(g);
    }
  }
  viewer.scene.preUpdate.addEventListener(() => update());

  // ---------- identification (click/hover handled centrally in app.js) ----------
  function identify(picked) {
    const id = picked?.id;
    if (id?.kind === 'satellite') return { kind: 'satellite', norad: id.norad, name: sats.get(id.norad)?.tle.name };
    if (id === nisar || id?.id === 'nisar') return { kind: 'satellite', norad: NISAR_NORAD, name: 'NISAR' };
    if (id?.pulseStory) return { kind: 'story', id: id.pulseStory };
    return null;
  }

  /** Find satellites by name ("landsat 9", "noaa 20", "sentinel"). */
  function search(q) {
    const t = String(q || '').trim().toUpperCase();
    if (t.length < 3) return [];
    return [...sats.values()]
      .filter((s) => s.tle.name.toUpperCase().includes(t) || String(s.tle.norad) === t)
      .slice(0, 6)
      .map((s) => ({ norad: s.tle.norad, name: s.tle.name, mission: s.mission }));
  }

  // ---------- orbit / ground track / swath ----------
  function clearDecor() {
    for (const k of ['orbit', 'ground', 'swath', 'swathLabel']) {
      if (decor[k]) viewer.entities.remove(decor[k]);
      decor[k] = null;
    }
    decor.norad = null;
  }

  function showOrbit(norad, { swath = norad === NISAR_NORAD } = {}) {
    clearDecor();
    const s = sats.get(norad);
    if (!s) return;
    decor.norad = norad;
    const periodMs = orbitalPeriodMin(s.satrec) * 60000;
    let orbitCache = { t: 0, pts: [] };
    const orbitPts = (time) => {
      const d = Cesium.JulianDate.toDate(time);
      if (Math.abs(d - orbitCache.t) > 20000) {
        const pts = [];
        for (let t = -periodMs * 0.5; t <= periodMs * 0.5; t += periodMs / 160) {
          const g = geodeticAt(s.satrec, new Date(d.getTime() + t));
          if (g) pts.push(toCart(g));
        }
        orbitCache = { t: d, pts, ground: pts.map((p) => { const c = Cesium.Cartographic.fromCartesian(p); return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 2000); }) };
      }
      return orbitCache;
    };
    decor.orbit = viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty((t) => orbitPts(t).pts, false),
        width: 1.4,
        material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.18, color: Cesium.Color.fromCssColorString('#7fe6ff').withAlpha(0.75) }),
        arcType: Cesium.ArcType.NONE,
      },
    });
    decor.ground = viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty((t) => orbitPts(t).ground, false),
        width: 1,
        material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.WHITE.withAlpha(0.35), dashLength: 12 }),
        arcType: Cesium.ArcType.NONE,
      },
    });
    if (swath) {
      state.swathVisible = true;
      decor.swath = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.CallbackProperty((t) => swathHierarchy(s, t), false),
          material: Cesium.Color.fromCssColorString('#7fe6ff').withAlpha(0.16),
          outline: false,
          height: 0,
          arcType: Cesium.ArcType.GEODESIC,
        },
      });
    }
  }

  function swathHierarchy(s, time) {
    const d = Cesium.JulianDate.toDate(time);
    const key = Math.floor(d.getTime() / 2000);
    if (swathCache.key === key && swathCache.hierarchy) return swathCache.hierarchy;
    const samples = swathSamples(s.satrec, new Date(d.getTime() - 240000), d, 10, NISAR_SWATH);
    if (samples.length < 2) return swathCache.hierarchy;
    const ring = [...samples.map((p) => p.near), ...samples.reverse().map((p) => p.far)];
    swathCache = { key, hierarchy: new Cesium.PolygonHierarchy(ring.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat))) };
    return swathCache.hierarchy;
  }

  // ---------- tracking ----------
  function entityFor(norad) {
    const s = sats.get(norad);
    if (!s) return null;
    if (s.entity) return s.entity;
    let frame = -1, cached = null;
    s.entity = viewer.entities.add({
      position: new Cesium.CallbackProperty((time) => {
        const f = viewer.scene.frameState.frameNumber;
        if (f !== frame) {
          const g = geodeticAt(s.satrec, Cesium.JulianDate.toDate(time));
          cached = g ? toCart(g) : cached;
          frame = f;
        }
        return cached;
      }, false),
      point: { pixelSize: 9, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.fromCssColorString('#7fe6ff'), outlineWidth: 2 },
      label: { text: s.tle.name, font: '500 12px "Inter Tight", sans-serif', pixelOffset: new Cesium.Cartesian2(14, 0), horizontalOrigin: Cesium.HorizontalOrigin.LEFT, fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK.withAlpha(0.6), outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
    });
    return s.entity;
  }

  function follow(norad, { range = 1.4e6 } = {}) {
    const e = entityFor(norad);
    if (!e) return false;
    e.viewFrom = new Cesium.Cartesian3(-range * 0.55, -range * 0.55, range * 0.45);
    viewer.trackedEntity = e;
    tracked = { norad, entity: e };
    return true;
  }

  function unfollow() {
    if (viewer.trackedEntity) viewer.trackedEntity = undefined;
    if (tracked && tracked.norad !== NISAR_NORAD) {
      const s = sats.get(tracked.norad);
      if (s?.entity) { viewer.entities.remove(s.entity); s.entity = null; }
    }
    tracked = null;
  }

  function info(norad) {
    const s = sats.get(norad);
    if (!s) return null;
    const g = geodeticAt(s.satrec, nowOf(viewer));
    return {
      norad,
      name: s.tle.name,
      mission: s.mission,
      tle: s.tle,
      position: g,
      periodMin: orbitalPeriodMin(s.satrec),
      inclinationDeg: (s.satrec.inclo * 180) / Math.PI,
      satrec: s.satrec,
    };
  }

  function setVisible(v) {
    state.visible = v;
    for (const s of sats.values()) if (s.point) s.point.show = v;
    if (nisar) nisar.show = true;
    update(true);
  }

  return {
    load,
    identify,
    search,
    state,
    sats,
    info,
    follow,
    unfollow,
    showOrbit,
    clearDecor,
    setVisible,
    get tracked() { return tracked; },
    get nisar() { return nisar; },
    get decorNorad() { return decor.norad; },
    earthObservers: () => [...sats.values()].filter((s) => s.mission && s.mission.capable?.length),
  };
}
