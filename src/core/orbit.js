// Orbital math on real TLEs (SGP4 via satellite.js). Pure functions.
// Propagation helpers follow God's Eye View's satellites/orbits.js approach.
import * as sat from 'satellite.js';

const R_EARTH_KM = 6371.0088;
const DEG = Math.PI / 180;

export function satrecFromTle(tle) {
  return sat.twoline2satrec(tle.line1, tle.line2);
}

/** Epoch of a TLE as a Date. */
export function tleEpoch(satrec) {
  const jd = satrec.jdsatepoch + (satrec.jdsatepochF || 0);
  return new Date((jd - 2440587.5) * 86400000);
}

/** @returns {{lon:number, lat:number, altKm:number, speedKms:number}|null} */
export function geodeticAt(satrec, date) {
  const pv = sat.propagate(satrec, date);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const g = sat.eciToGeodetic(pv.position, sat.gstime(date));
  const v = pv.velocity;
  return {
    lon: sat.degreesLong(g.longitude),
    lat: sat.degreesLat(g.latitude),
    altKm: g.height,
    speedKms: v ? Math.hypot(v.x, v.y, v.z) : null,
  };
}

export function orbitalPeriodMin(satrec) {
  return (2 * Math.PI) / satrec.no; // satrec.no is rad/min
}

/** Initial great-circle bearing from a to b, degrees. */
export function bearing(a, b) {
  const φ1 = a.lat * DEG, φ2 = b.lat * DEG, Δλ = (b.lon - a.lon) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Destination point along a bearing (degrees) at distance km. */
export function destination(p, bearingDeg, km) {
  const δ = km / R_EARTH_KM, θ = bearingDeg * DEG, φ1 = p.lat * DEG, λ1 = p.lon * DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / DEG, lon: (((λ2 / DEG) + 540) % 360) - 180 };
}

export function distanceKm(a, b) {
  const φ1 = a.lat * DEG, φ2 = b.lat * DEG;
  const h = Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(((b.lon - a.lon) * DEG) / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(h));
}

/**
 * NISAR's modeled imaging swath. DERIVED, not an acquisition plan:
 * the look side and offset were fitted to real ASF footprints against the
 * CelesTrak-propagated ground track (footprint centroids ~530–570 km LEFT of
 * track); swath width ≈ 242 km per the NASA mission specification.
 */
export const NISAR_SWATH = Object.freeze({ side: 'left', nearKm: 430, farKm: 672 });

/** Ground-track samples with the swath edges, for [t0, t1]. */
export function swathSamples(satrec, t0, t1, stepSec = 10, swath = NISAR_SWATH) {
  const out = [];
  for (let t = t0.getTime(); t <= t1.getTime(); t += stepSec * 1000) {
    const d = new Date(t);
    const a = geodeticAt(satrec, d);
    const b = geodeticAt(satrec, new Date(t + 1000));
    if (!a || !b) continue;
    const hdg = bearing(a, b);
    const side = swath.side === 'left' ? hdg - 90 : hdg + 90;
    out.push({ t: d, nadir: a, near: destination(a, side, swath.nearKm), far: destination(a, side, swath.farKm), heading: hdg });
  }
  return out;
}

/**
 * Next time a satellite rises above minElevation for a ground point, by
 * coarse-then-fine search. Geometric prediction from the TLE only.
 */
export function nextPass(satrec, point, from = new Date(), { hours = 24, minElevation = 10 } = {}) {
  const obs = { longitude: point.lon * DEG, latitude: point.lat * DEG, height: 0 };
  const elevAt = (d) => {
    const pv = sat.propagate(satrec, d);
    if (!pv?.position || typeof pv.position === 'boolean') return -90;
    const ecf = sat.eciToEcf(pv.position, sat.gstime(d));
    return sat.ecfToLookAngles(obs, ecf).elevation / DEG;
  };
  const end = from.getTime() + hours * 3600000;
  let prev = elevAt(from);
  if (prev >= minElevation) return { start: from, inProgress: true, maxElevation: prev };
  for (let t = from.getTime() + 30000; t < end; t += 30000) {
    const e = elevAt(new Date(t));
    if (e >= minElevation) {
      let lo = t - 30000, hi = t;
      while (hi - lo > 1000) {
        const mid = (lo + hi) / 2;
        if (elevAt(new Date(mid)) >= minElevation) hi = mid; else lo = mid;
      }
      let maxE = e;
      for (let u = hi; u < hi + 20 * 60000; u += 20000) {
        const ee = elevAt(new Date(u));
        if (ee < minElevation) break;
        maxE = Math.max(maxE, ee);
      }
      return { start: new Date(hi), inProgress: false, maxElevation: maxE };
    }
    prev = e;
  }
  return null;
}

/**
 * Next time NISAR's modeled swath covers a point (within `hours`).
 * Returns the time and whether it is ascending/descending.
 */
export function nextSwathCover(satrec, point, from = new Date(), { hours = 72, swath = NISAR_SWATH } = {}) {
  const end = from.getTime() + hours * 3600000;
  const mid = (swath.nearKm + swath.farKm) / 2;
  const half = (swath.farKm - swath.nearKm) / 2;
  for (let t = from.getTime(); t < end; t += 8000) {
    const d = new Date(t);
    const a = geodeticAt(satrec, d);
    if (!a) continue;
    const dist = distanceKm(a, point);
    if (dist > swath.farKm + 300) {
      t += Math.min(600000, ((dist - swath.farKm) / 7) * 1000 * 0.8); // ~7 km/s ground speed
      continue;
    }
    const b = geodeticAt(satrec, new Date(t + 1000));
    const hdg = bearing(a, b);
    const c = destination(a, swath.side === 'left' ? hdg - 90 : hdg + 90, mid);
    if (distanceKm(c, point) < half) return { time: d, ascending: b.lat > a.lat };
  }
  return null;
}
