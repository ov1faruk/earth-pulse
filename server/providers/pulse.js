// PULSE — everything the home card needs for one place, in one call.
// NASA first: POWER (rain, temperature, soil wetness, snow), FIRMS (fires),
// EONET (open events), the Global Landslide Catalog and NISAR (ASF) passes.
// The 7-day forecast is the only non-NASA input and is labelled as such.
// (Written with AI assistance — see README → AI disclosure.)
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { createCache } from '../cache.js';
import { getPowerDaily, getPowerClimatology, getRiskAt, POWER_SOURCE } from './risk.js';
import { getOutlook } from './outlook.js';
import { getFires, getEvents } from './live.js';
import { NISARDataProvider } from './nisar.js';
import { haversineKm, windowVsClimatology, recentMean } from '../../src/core/risk.js';

const cache = createCache('pulse-v1', { ttlMs: 3 * 3600_000 });
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

let landslides = null;
async function loadLandslides() {
  if (!landslides) landslides = JSON.parse(await fsp.readFile(path.join(process.cwd(), 'public', 'data', 'context', 'landslides.json'), 'utf8'));
  return landslides;
}

function slidesNear(L, lat, lon, km) {
  const near = L.events.filter((r) => Math.abs(r[1] - lat) < km / 100 && haversineKm(lat, lon, r[1], r[0]) <= km);
  const trig = {};
  for (const r of near) { const t = L.triggers[r[4]]; trig[t] = (trig[t] || 0) + 1; }
  const worst = near.slice().sort((a, b) => (b[3] || 0) - (a[3] || 0))[0];
  return {
    radiusKm: km, count: near.length, fatalities: near.reduce((a, r) => a + (+r[3] || 0), 0),
    topTrigger: Object.entries(trig).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    worst: worst && worst[3] ? { date: worst[2], fatalities: worst[3], title: worst[6], country: worst[7] } : null,
    period: `${L.firstDate?.slice(0, 4) || 1988}–${L.lastDate?.slice(0, 4) || 2017}`,
  };
}

function firesNear(F, lat, lon) {
  const dLat = 150 / 111, dLon = 150 / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  let n50 = 0, n150 = 0, nearest = null, strongest = null;
  for (const f of F.fires) {
    if (Math.abs(f[1] - lat) > dLat || Math.abs(f[0] - lon) > dLon) continue;
    const d = haversineKm(lat, lon, f[1], f[0]);
    if (d > 150) continue;
    n150++;
    if (d <= 50) n50++;
    if (!nearest || d < nearest.km) nearest = { km: Math.round(d), sat: F.satellites[f[4]] };
    if (!strongest || f[2] > strongest.frpMW) strongest = { frpMW: r1(f[2]), km: Math.round(d), sat: F.satellites[f[4]] };
  }
  return { within50km: n50, within150km: n150, nearest, strongest, freshness: F.freshness };
}

export async function getPulse(lat, lon, name = null) {
  lat = Math.round(lat * 100) / 100; lon = Math.round(lon * 100) / 100;
  const hit = await cache.get(`${lat},${lon}`, async () => {
    const end = new Date(), start = new Date(Date.now() - 45 * 864e5);
    const [daily, clim, outlook, fires, events, L, risk, nisar] = await Promise.all([
      getPowerDaily(lat, lon, ymd(start), ymd(end)).catch(() => null),
      getPowerClimatology(lat, lon).catch(() => null),
      getOutlook(lat, lon).catch(() => null),
      getFires().catch(() => null),
      getEvents().catch(() => null),
      loadLandslides().catch(() => null),
      getRiskAt(lat, lon, name).catch(() => null),
      NISARDataProvider.getAcquisitions(lat, lon, { maxResults: 60 }).catch(() => null),
    ]);

    let observed = null;
    if (daily) {
      const d = daily.daily;
      const valid = (k) => Object.entries(d[k] || {}).filter(([, v]) => v > -900).sort(([a], [b]) => (a < b ? -1 : 1));
      const rain = valid('PRECTOTCORR'), tmax = valid('T2M_MAX'), tmin = valid('T2M_MIN'), soil = valid('GWETTOP'), snow = valid('SNODP');
      const sum = (a, n) => a.slice(-n).reduce((s, [, v]) => s + v, 0);
      const normalSum = (a, n) => (clim ? a.slice(-n).reduce((s, [k]) => s + clim.PRECTOTCORR[MON[Number(k.slice(4, 6)) - 1]], 0) : null);
      const heat = clim ? windowVsClimatology(d.T2M, clim.T2M, { days: 7 }) : null;
      const soilNow = recentMean(d.GWETTOP, 3);
      const soilNormal = clim?.GWETTOP && soilNow ? clim.GWETTOP[MON[Number(soilNow.to.slice(4, 6)) - 1]] : null;
      observed = {
        asOf: rain.at(-1)?.[0] || null,
        elevationM: r1(daily.elevationM),
        rain7: { mm: r1(sum(rain, 7)), normalMm: r1(normalSum(rain, 7)) },
        rain30: { mm: r1(sum(rain, 30)), normalMm: r1(normalSum(rain, 30)) },
        tempAnomaly7C: heat ? r1(heat.observed - heat.normal) : null,
        hottest7C: r1(Math.max(...tmax.slice(-7).map(([, v]) => v))),
        coldest7C: r1(Math.min(...tmin.slice(-7).map(([, v]) => v))),
        hotDays30: tmax.slice(-30).filter(([, v]) => v >= 35).length,
        frostNights30: tmin.slice(-30).filter(([, v]) => v <= 0).length,
        soilWetness: r2(soilNow?.mean), soilNormal: r2(soilNormal),
        snowDepthCm: snow.length ? r1(snow.at(-1)[1] * 100) : null,
        snowDepth7AgoCm: snow.length > 7 ? r1(snow.at(-8)[1] * 100) : null,
        series: rain.slice(-30).map(([k, v], i) => ({ d: k, rain: r1(v), tmax: r1(tmax.find(([x]) => x === k)?.[1]), tmin: r1(tmin.find(([x]) => x === k)?.[1]), soil: r2(soil.find(([x]) => x === k)?.[1]) })),
      };
    }

    const ev = (events?.events || [])
      .filter((e) => Number.isFinite(e.lat))
      .map((e) => ({ ...e, km: Math.round(haversineKm(lat, lon, e.lat, e.lon)) }))
      .filter((e) => e.km <= (e.category === 'wildfires' ? 150 : 1000))
      .sort((a, b) => a.km - b.km)
      .slice(0, 6)
      .map(({ title, category, categoryTitle, km, date, url, magnitude }) => ({ title, category, categoryTitle, km, date, url, magnitude }));

    const passes = (nisar?.passes || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    return {
      body: {
        observed,
        forecast: outlook ? { days: outlook.days, source: outlook.sources.weather } : null,
        fires: fires ? firesNear(fires, lat, lon) : null,
        events: ev,
        landslides: L ? slidesNear(L, lat, lon, 50) : null,
        nisar: { passes: passes.length, last: passes[0] ? { ...passes[0], products: [...new Set(passes[0].products)] } : null, first: passes.at(-1)?.date || null },
        index: risk ? { overall: risk.overall, level: risk.level, top: risk.top, scores: risk.scores } : null,
        missing: [!daily && 'NASA POWER', !fires && 'NASA FIRMS', !events && 'NASA EONET', !nisar && 'NISAR (ASF)', !outlook && 'forecast'].filter(Boolean),
      },
    };
  });
  return {
    lat, lon, name, ...hit.body, freshness: hit.state, computedAt: new Date(hit.at).toISOString(),
    sources: {
      power: POWER_SOURCE,
      firms: { name: 'NASA FIRMS active fire (VIIRS + MODIS, last ~24 h)', url: 'https://firms.modaps.eosdis.nasa.gov/' },
      eonet: { name: 'NASA EONET v3 open natural events', url: 'https://eonet.gsfc.nasa.gov/' },
      landslides: { name: 'NASA Global Landslide Catalog (1988–2017)', url: 'https://data.nasa.gov/dataset/global-landslide-catalog-export' },
      nisar: { name: 'NISAR L2 (NASA/JPL × ISRO) via ASF DAAC', url: 'https://search.asf.alaska.edu/' },
      forecast: { name: 'Open-Meteo forecast (NOAA GFS / ECMWF) — not a NASA product', url: 'https://open-meteo.com/' },
    },
  };
}
