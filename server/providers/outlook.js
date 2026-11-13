// 7-day outlook for a place: real forecast data, compared with NASA's
// climatology, and projected through the same hazard-signal formulas as today's
// index. Forecasts are NOT NASA products: weather comes from Open-Meteo
// (NOAA GFS / ECMWF models) and river discharge from Copernicus GloFAS via
// Open-Meteo's flood API. Both are keyless. The UI names them.
// (Written with AI assistance — see README → AI disclosure.)
import { createCache, fetchText } from '../cache.js';
import { getPowerDaily, getPowerClimatology } from './risk.js';

const cache = createCache('outlook', { ttlMs: 3 * 3600_000 });
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const r1 = (v) => Math.round(v * 10) / 10;

export const OUTLOOK_SOURCES = {
  weather: { name: 'Open-Meteo Forecast API (NOAA GFS, ECMWF IFS and national models)', url: 'https://open-meteo.com/en/docs' },
  river: { name: 'Copernicus GloFAS river discharge forecast, via Open-Meteo Flood API', url: 'https://open-meteo.com/en/docs/flood-api' },
  normal: { name: 'NASA POWER climatology 2001–2025 and recent daily rain (MERRA-2 / IMERG)', url: 'https://power.larc.nasa.gov/' },
};

export async function getOutlook(lat, lon) {
  lat = Math.round(lat * 100) / 100; lon = Math.round(lon * 100) / 100;
  const hit = await cache.get(`${lat},${lon}`, async () => {
    const fc = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max&forecast_days=7&timezone=UTC`;
    const fl = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge,river_discharge_max&forecast_days=7`;
    const [w, river, clim, recent] = await Promise.all([
      fetchText(fc, { timeoutMs: 20000 }).then(JSON.parse),
      fetchText(fl, { timeoutMs: 20000, retries: 0 }).then(JSON.parse).catch(() => null),
      getPowerClimatology(lat, lon).catch(() => null),
      getPowerDaily(lat, lon, ymd(new Date(Date.now() - 45 * 864e5)), ymd(new Date())).catch(() => null),
    ]);
    const d = w.daily;
    const days = d.time.map((t, i) => {
      const m = MON[Number(t.slice(5, 7)) - 1];
      return { date: t, rainMm: d.precipitation_sum[i] ?? 0, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], gustKmh: d.wind_gusts_10m_max[i], normalRainMm: clim ? r1(clim.PRECTOTCORR[m]) : null, normalTempC: clim ? r1(clim.T2M[m]) : null };
    });
    // The last 23 observed days (NASA POWER) + the 7 forecast days make the projected 30-day window.
    let basis = null;
    if (clim && recent) {
      const valid = Object.entries(recent.daily.PRECTOTCORR).filter(([, v]) => v > -900).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-23);
      if (valid.length >= 15) basis = { days: valid.length, observedMm: r1(valid.reduce((a, [, v]) => a + v, 0)), normalMm: r1(valid.reduce((a, [k]) => a + clim.PRECTOTCORR[MON[Number(k.slice(4, 6)) - 1]], 0)), to: valid.at(-1)[0] };
    }
    let rv = null;
    const q = river?.daily?.river_discharge;
    if (q && q.some((v) => v != null)) {
      const vals = q.map((v) => v ?? 0), peak = Math.max(...vals), k = vals.indexOf(peak);
      rv = { today: r1(vals[0]), peak: r1(peak), peakDate: river.daily.time[k], series: vals.map(r1), ensembleMax: r1(Math.max(...(river.daily.river_discharge_max || vals).map((v) => v ?? 0))), changePct: vals[0] > 0 ? Math.round((peak / vals[0] - 1) * 100) : null };
    }
    return { body: { days, basis, river: rv } };
  });
  return { lat, lon, ...hit.body, freshness: hit.state, fetchedAt: new Date(hit.at).toISOString(), sources: OUTLOOK_SOURCES };
}
