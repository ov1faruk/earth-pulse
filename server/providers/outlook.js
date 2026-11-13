// 7-day outlook for a place: a real forecast, compared with NASA's climatology
// and recent NASA-observed rain. The forecast is the ONE non-NASA input in the
// app (NASA has no public point forecast API): it comes from Open-Meteo
// (NOAA GFS / ECMWF models), keyless, and the UI labels it as such.
// (Written with AI assistance — see README → AI disclosure.)
import { createCache, fetchText } from '../cache.js';
import { getPowerDaily, getPowerClimatology } from './risk.js';

const cache = createCache('outlook', { ttlMs: 3 * 3600_000 });
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const r1 = (v) => Math.round(v * 10) / 10;

export const OUTLOOK_SOURCES = {
  weather: { name: 'Open-Meteo Forecast API (NOAA GFS, ECMWF IFS and national models)', url: 'https://open-meteo.com/en/docs' },
  normal: { name: 'NASA POWER climatology 2001–2025 and recent daily rain (MERRA-2 / IMERG)', url: 'https://power.larc.nasa.gov/' },
};

export async function getOutlook(lat, lon) {
  lat = Math.round(lat * 100) / 100; lon = Math.round(lon * 100) / 100;
  const hit = await cache.get(`${lat},${lon}`, async () => {
    const fc = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max&forecast_days=7&timezone=UTC`;
    const [w, clim, recent] = await Promise.all([
      fetchText(fc, { timeoutMs: 20000 }).then(JSON.parse),
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
    return { body: { days, basis } };
  });
  return { lat, lon, ...hit.body, freshness: hit.state, fetchedAt: new Date(hit.at).toISOString(), sources: OUTLOOK_SOURCES };
}
