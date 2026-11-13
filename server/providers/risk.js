// NASA POWER point data + the hazard-signal index for a place.
// POWER (power.larc.nasa.gov) is keyless; it serves MERRA-2 meteorology and
// IMERG-corrected precipitation. (Written with AI assistance.)
import { createCache, fetchText } from '../cache.js';
import { getFires, getQuakes, getEvents } from './live.js';
import { windowVsClimatology, scoreSignals, haversineKm, METHOD } from '../../src/core/risk.js';

const dailyCache = createCache('power-daily', { ttlMs: 12 * 3600_000 });
const climCache = createCache('power-clim', { ttlMs: 90 * 24 * 3600_000 });
const archiveCache = createCache('power-archive', { ttlMs: 365 * 24 * 3600_000 });
const riskCache = createCache('risk-v2', { ttlMs: 6 * 3600_000 });
const econCache = createCache('worldbank', { ttlMs: 7 * 24 * 3600_000 });

const POWER = 'https://power.larc.nasa.gov/api/temporal';
const PARAMS = 'PRECTOTCORR,T2M,T2M_MAX';
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const round = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p;
const grid = (v) => round(v, 2);

export const POWER_SOURCE = {
  name: 'NASA POWER (Prediction Of Worldwide Energy Resources), NASA Langley Research Center',
  url: 'https://power.larc.nasa.gov/',
  cite: 'Precipitation: PRECTOTCORR (IMERG-corrected MERRA-2). Temperature: T2M (MERRA-2). Climatology: January 2001 – December 2025.',
};

/** Daily rain and temperature at a point. Past windows are cached for a year. */
export async function getPowerDaily(lat, lon, start, end) {
  lat = grid(lat); lon = grid(lon);
  const url = `${POWER}/daily/point?parameters=${PARAMS}&community=AG&longitude=${lon}&latitude=${lat}&start=${start}&end=${end}&format=JSON`;
  const past = end < ymd(new Date(Date.now() - 20 * 864e5));
  const hit = await (past ? archiveCache : dailyCache).get(url, async () => {
    const j = JSON.parse(await fetchText(url, { timeoutMs: 45000 }));
    return { body: j.properties.parameter };
  });
  return { lat, lon, start, end, daily: hit.body, freshness: hit.state, fetchedAt: new Date(hit.at).toISOString(), source: POWER_SOURCE };
}

export async function getPowerClimatology(lat, lon) {
  lat = grid(lat); lon = grid(lon);
  const url = `${POWER}/climatology/point?parameters=${PARAMS}&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
  const hit = await climCache.get(url, async () => ({ body: JSON.parse(await fetchText(url, { timeoutMs: 45000 })).properties.parameter }));
  return hit.body;
}

/** Rain/heat series around a date, with the climatological normal per day — for the "signals" charts. */
export async function getSignalSeries(lat, lon, start, end) {
  const [d, clim] = await Promise.all([getPowerDaily(lat, lon, start, end), getPowerClimatology(lat, lon)]);
  return { ...d, climatology: clim, climatologyPeriod: '2001–2025' };
}

export async function getRiskAt(lat, lon, name = null) {
  lat = grid(lat); lon = grid(lon);
  const hit = await riskCache.get(`${lat},${lon}`, async () => {
    const end = new Date(), start = new Date(Date.now() - 45 * 864e5);
    const [daily, clim, quakes, fires, events] = await Promise.all([
      getPowerDaily(lat, lon, ymd(start), ymd(end)).catch(() => null),
      getPowerClimatology(lat, lon).catch(() => null),
      getQuakes().catch(() => null),
      getFires().catch(() => null),
      getEvents().catch(() => null),
    ]);
    const rain = daily && clim ? windowVsClimatology(daily.daily.PRECTOTCORR, clim.PRECTOTCORR, { sum: true }) : null;
    const heat = daily && clim ? windowVsClimatology(daily.daily.T2M, clim.T2M) : null;
    const since = Date.now() - 30 * 864e5;
    const near = (quakes?.quakes || []).filter((q) => q[4] >= since && haversineKm(lat, lon, q[1], q[0]) <= 300);
    const top = near.sort((a, b) => b[3] - a[3])[0];
    // Cheap bounding-box prefilter before the exact distance (216k fire points).
    const dLat = 100 / 111, dLon = 100 / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    const fireN = (fires?.fires || []).filter((f) => Math.abs(f[1] - lat) <= dLat && Math.abs(f[0] - lon) <= dLon && haversineKm(lat, lon, f[1], f[0]) <= 100).length;
    const evs = (events?.events || []).filter((e) => e.category !== 'wildfires' && Number.isFinite(e.lat) && haversineKm(lat, lon, e.lat, e.lon) <= 500);
    const scored = scoreSignals({ rain, heat, maxMag: top?.[3] || null, quakeCount: near.length, fires: fireN, events: evs.length });
    return {
      body: {
        ...scored,
        measured: {
          rain: rain && { observedMm: round(rain.observed, 1), normalMm: round(rain.normal, 1), ratio: rain.normal > 0 ? round(rain.observed / rain.normal) : null, days: rain.days, from: rain.from, to: rain.to },
          heat: heat && { observedC: round(heat.observed, 1), normalC: round(heat.normal, 1), anomalyC: round(heat.observed - heat.normal, 1), days: heat.days, from: heat.from, to: heat.to },
          seismic: { count: near.length, maxMag: top?.[3] || null, place: top?.[6] || null, radiusKm: 300, days: 30 },
          fire: { detections: fireN, radiusKm: 100, available: !!fires },
          events: { count: evs.length, radiusKm: 500, titles: evs.slice(0, 5).map((e) => ({ title: e.title, url: e.url, source: e.source })) },
        },
        missing: [!rain && 'NASA POWER', !quakes && 'USGS', !fires && 'NASA FIRMS', !events && 'EONET/GDACS'].filter(Boolean),
      },
    };
  });
  return { lat, lon, name, ...hit.body, freshness: hit.state, computedAt: new Date(hit.at).toISOString() };
}

// Places for the world risk map: large cities and regions on different hazard belts.
export const RISK_PLACES = [
  ['Kathmandu', 27.72, 85.32], ['Dhaka', 23.81, 90.41], ['Delhi', 28.61, 77.21], ['Karachi', 24.86, 67.01],
  ['Colombo', 6.93, 79.86], ['Medan', 3.59, 98.67], ['Jakarta', -6.21, 106.85], ['Cebu', 10.32, 123.89],
  ['General Santos', 6.11, 125.17], ['Tokyo', 35.68, 139.69], ['Sydney', -33.87, 151.21], ['Istanbul', 41.01, 28.98],
  ['Cairo', 30.04, 31.24], ['Lagos', 6.52, 3.38], ['Nairobi', -1.29, 36.82], ['Rome', 41.9, 12.5],
  ['Bordeaux', 44.84, -0.58], ['Los Angeles', 34.05, -118.24], ['Miami', 25.76, -80.19], ['Mexico City', 19.43, -99.13],
  ['Caracas', 10.48, -66.9], ['Quibdó', 5.69, -76.66], ['Lima', -12.05, -77.04], ['Santiago', -33.45, -70.67],
];

export async function getRiskMap() {
  const out = [];
  // Small batches: POWER asks clients to keep concurrency low.
  for (let i = 0; i < RISK_PLACES.length; i += 4) {
    const batch = RISK_PLACES.slice(i, i + 4);
    out.push(...(await Promise.all(batch.map(([name, lat, lon]) => getRiskAt(lat, lon, name).catch(() => ({ name, lat, lon, unavailable: true }))))));
  }
  return { places: out, method: METHOD, source: POWER_SOURCE, computedAt: new Date().toISOString() };
}

/** World Bank open data: latest GDP (current US$) and population for a country. */
export async function getEconomy(iso3) {
  if (!/^[A-Z]{3}$/.test(iso3)) throw Object.assign(new Error('bad country code'), { status: 400 });
  const hit = await econCache.get(iso3, async () => {
    const get = async (ind) => {
      const j = JSON.parse(await fetchText(`https://api.worldbank.org/v2/country/${iso3}/indicator/${ind}?format=json&mrnev=1`, { timeoutMs: 20000 }));
      const r = j[1]?.[0];
      if (!r) throw new Error('no World Bank data');
      return { value: r.value, year: Number(r.date), country: r.country.value };
    };
    const [gdp, pop] = await Promise.all([get('NY.GDP.MKTP.CD'), get('SP.POP.TOTL')]);
    return { body: { iso3, country: gdp.country, gdpUsd: gdp.value, gdpYear: gdp.year, population: pop.value, populationYear: pop.year } };
  });
  return { ...hit.body, freshness: hit.state, source: { name: 'World Bank Open Data (NY.GDP.MKTP.CD, SP.POP.TOTL)', url: `https://data.worldbank.org/country/${iso3}` } };
}

// ---------- Fire density: where FIRMS is detecting the most fire right now ----------
const placeCache = createCache('revgeo', { ttlMs: 30 * 24 * 3600_000 });
const densityCache = createCache('fire-density', { ttlMs: 3600_000 });
let lastGeo = 0;
async function placeName(lat, lon) {
  try {
    const hit = await placeCache.get(`${lat},${lon}`, async () => {
      const wait = Math.max(0, lastGeo + 700 - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      lastGeo = Date.now();
      const j = JSON.parse(await fetchText(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`, { timeoutMs: 10000, retries: 0 }));
      const p = j.features?.[0]?.properties || {};
      return { body: [p.state || p.county || p.name, p.country].filter(Boolean).join(', ') || null };
    });
    return hit.body;
  } catch {
    return null;
  }
}

export async function getFireDensity() {
  const hit = await densityCache.get('top', async () => {
    const fires = await getFires();
    const CELL = 2; // degrees
    const cells = new Map();
    for (const f of fires.fires) {
      const k = `${Math.floor(f[1] / CELL)},${Math.floor(f[0] / CELL)}`;
      const c = cells.get(k) || { n: 0, frp: 0, lat: 0, lon: 0 };
      c.n++; c.frp += f[2]; c.lat += f[1]; c.lon += f[0];
      cells.set(k, c);
    }
    const top = [...cells.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((c) => ({ detections: c.n, frpMW: Math.round(c.frp), lat: round(c.lat / c.n, 2), lon: round(c.lon / c.n, 2) }));
    for (const t of top) t.place = await placeName(t.lat, t.lon);
    return { body: { total: fires.fires.length, cellDegrees: CELL, top, firesFreshness: fires.freshness } };
  });
  return { ...hit.body, freshness: hit.state, computedAt: new Date(hit.at).toISOString(), source: { name: 'NASA FIRMS (VIIRS + MODIS, last ~24 h)', url: 'https://firms.modaps.eosdis.nasa.gov/' }, placeNames: 'Photon / OpenStreetMap' };
}
