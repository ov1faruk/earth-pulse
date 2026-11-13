// Hazard-signal index — pure functions shared by the server, the browser and
// the tests. It scores what real instruments are measuring *now* around a
// place. It is NOT a forecast and NOT a probability: it says "these warning
// signals are elevated here", nothing more. Every threshold is stated in
// METHOD so the UI can print exactly how each number was produced.
// (Written with AI assistance — see README → AI disclosure.)

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export const RISK_LEVELS = [
  { max: 25, id: 'low', label: 'LOW', color: '#7fe6ff' },
  { max: 50, id: 'moderate', label: 'MODERATE', color: '#ffd166' },
  { max: 75, id: 'high', label: 'HIGH', color: '#ff9447' },
  { max: 101, id: 'severe', label: 'SEVERE', color: '#ff4d6d' },
];
export const riskLevel = (score) => RISK_LEVELS.find((l) => score < l.max) || RISK_LEVELS.at(-1);

export const METHOD = {
  window: 'Rain and heat use the latest 30 days with data from NASA POWER (MERRA-2 / IMERG-corrected), compared with the 2001–2025 monthly climatology at the same point.',
  signals: {
    wet: { label: 'Rain surplus', hazard: 'Flood · landslide', formula: 'Two tests, and the lower one counts: relative — (30-day rain ÷ normal − 1) ÷ 1.5 — and absolute — (30-day rain − normal) ÷ 100 mm. Both capped 0–100. Rain must be far above normal in proportion and in millimetres, so a few showers in a dry season do not raise the signal.' },
    dry: { label: 'Rain deficit', hazard: 'Drought', formula: 'Score = (1 − ratio) ÷ 0.75, capped 0–100. Only scored where normal rain in the window is at least 30 mm, so deserts and dry seasons are not flagged.' },
    heat: { label: 'Heat anomaly', hazard: 'Heatwave · fire weather', formula: 'anomaly = mean 2 m air temperature of the last 30 days − climatological mean. Score = anomaly ÷ 5 °C, capped 0–100.' },
    seismic: { label: 'Seismic activity', hazard: 'Earthquake', formula: 'Largest USGS earthquake within 300 km in the last 30 days. Score = (M − 4) ÷ 3.5, capped 0–100. This measures recent activity; earthquakes cannot be predicted.' },
    fire: { label: 'Active fire density', hazard: 'Wildfire', formula: 'NASA FIRMS thermal detections within 100 km in the last ~24 h. Score = log10(1 + count) ÷ 3, capped 0–100 (1,000 detections scores 100).' },
    events: { label: 'Open events nearby', hazard: 'Declared events', formula: 'Open NASA EONET / GDACS events within 500 km, not counting wildfires (the fire signal already covers them). Score = count ÷ 3, capped 0–100.' },
  },
  overall: 'Overall = 0.6 × the highest signal + 0.4 × the mean of all signals. One strong signal dominates, as it does in reality.',
  caveat: 'This is a transparent index of current, measured signals — a risk estimate, not a prediction. It ignores exposure and vulnerability (buildings, defences, preparedness), which decide whether a hazard becomes a disaster.',
};

/** Great-circle distance in km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * Compare the last `days` valid daily values with the monthly climatology.
 * @param daily  { 'YYYYMMDD': value } (POWER fill value −999 = missing)
 * @param clim   { JAN: v, …, DEC: v } climatological daily mean per month
 */
export function windowVsClimatology(daily, clim, { days = 30, sum = false } = {}) {
  const valid = Object.entries(daily || {}).filter(([, v]) => Number.isFinite(v) && v > -900).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-days);
  if (valid.length < Math.min(10, days)) return null;
  let obs = 0, norm = 0;
  for (const [d, v] of valid) { obs += v; norm += clim[MONTHS[Number(d.slice(4, 6)) - 1]]; }
  if (!sum) { obs /= valid.length; norm /= valid.length; }
  return { observed: obs, normal: norm, days: valid.length, from: valid[0][0], to: valid.at(-1)[0] };
}

/** Turn raw measurements into 0–100 signal scores plus the overall index. */
export function scoreSignals({ rain, heat, maxMag, quakeCount = 0, fires = 0, events = 0 }) {
  const s = {};
  if (rain) {
    const ratio = rain.normal > 0 ? rain.observed / rain.normal : null;
    const absolute = clamp01((rain.observed - rain.normal) / 100);
    s.wet = rain.normal >= 10 ? Math.min(clamp01((ratio - 1) / 1.5), absolute) : absolute;
    s.dry = rain.normal >= 30 ? clamp01((1 - ratio) / 0.75) : 0;
  }
  if (heat) s.heat = clamp01((heat.observed - heat.normal) / 5);
  s.seismic = maxMag ? clamp01((maxMag - 4) / 3.5) : 0;
  s.fire = clamp01(Math.log10(1 + fires) / 3);
  s.events = clamp01(events / 3);
  const scores = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v * 100)]));
  const vals = Object.values(scores);
  const overall = vals.length ? Math.round(0.6 * Math.max(...vals) + 0.4 * (vals.reduce((a, b) => a + b, 0) / vals.length)) : 0;
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { scores, overall, level: riskLevel(overall).id, top: top ? top[0] : null, quakeCount };
}
