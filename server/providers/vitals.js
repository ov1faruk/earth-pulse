// Earth's vital signs — real climate records, parsed from the agencies' own
// public files (no keys). Each sign is fetched independently so one failing
// upstream never hides the others. Code in this file was written with AI
// assistance (see README → AI disclosure).
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { createCache, fetchText } from '../cache.js';

const cache = createCache('vitals', { ttlMs: 12 * 3600_000 });

export const VITAL_SOURCES = {
  temperature: {
    name: 'NASA GISS Surface Temperature Analysis (GISTEMP v4)',
    url: 'https://data.giss.nasa.gov/gistemp/',
    file: 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv',
    cite: 'GISTEMP Team, NASA Goddard Institute for Space Studies. Lenssen et al. (2024).',
  },
  seaIce: {
    name: 'NSIDC Sea Ice Index v4 (NASA NSIDC DAAC / NOAA@NSIDC, G02135)',
    url: 'https://nsidc.org/data/g02135',
    file: 'https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/N_seaice_extent_daily_v4.0.csv',
    cite: 'Fetterer, F. et al., Sea Ice Index, Version 4. NSIDC.',
  },
};

const r2 = (v) => Math.round(v * 100) / 100;
const num = (s) => { const t = String(s ?? '').trim(); if (!t) return null; const v = Number(t); return Number.isFinite(v) ? v : null; };

// ---------- parsers (exported for tests) ----------
export function parseGistemp(csv) {
  const rows = csv.split('\n').filter((l) => /^\d{4},/.test(l)).map((l) => l.split(','));
  const annual = [];
  const monthly = [];
  for (const r of rows) {
    const y = Number(r[0]);
    for (let m = 1; m <= 12; m++) { const v = num(r[m]); if (v != null) monthly.push([y, m, v]); }
    const a = num(r[13]);
    if (a != null) annual.push([y, a]);
  }
  // Pre-industrial proxy: the earliest 20 years of the record (1880–1899).
  const early = annual.filter(([y]) => y >= 1880 && y <= 1899).map(([, v]) => v);
  const baselineShift = -early.reduce((a, b) => a + b, 0) / early.length;
  const last = monthly.at(-1);
  const last12 = monthly.slice(-12).map((m) => m[2]);
  return {
    unit: '°C', baseline: '1951–1980 (NASA GISS standard)', annual, latestMonth: { year: last[0], month: last[1], anomaly: last[2] },
    last12MonthMean: r2(last12.reduce((a, b) => a + b, 0) / last12.length),
    baselineShift: r2(baselineShift),
    baselineShiftNote: 'Add this to convert an anomaly vs 1951–1980 into an anomaly vs 1880–1899 (the earliest 20 years of the instrumental record, used here as a pre-industrial proxy).',
  };
}

export function parseSeaIce(csv) {
  const days = [];
  for (const l of csv.split('\n')) {
    const p = l.split(',');
    const y = num(p[0]), m = num(p[1]), d = num(p[2]), e = num(p[3]);
    if (y > 1970 && m && d && e > 0) days.push([y, m, d, e]);
  }
  const last = days.at(-1);
  // 1981–2010 mean for the same calendar day (NSIDC's standard climatology period).
  const same = days.filter((r) => r[1] === last[1] && r[2] === last[2] && r[0] >= 1981 && r[0] <= 2010).map((r) => r[3]);
  const clim = same.length ? same.reduce((a, b) => a + b, 0) / same.length : null;
  // September monthly mean per year (the annual minimum month).
  const sep = new Map();
  for (const [y, m, , e] of days) if (m === 9) { const a = sep.get(y) || [0, 0]; a[0] += e; a[1]++; sep.set(y, a); }
  const september = [...sep].filter(([, a]) => a[1] >= 12).map(([y, a]) => [y, r2(a[0] / a[1])]);
  // Least-squares trend of September extent since 1979.
  const n = september.length, sx = september.reduce((s, r) => s + r[0], 0), sy = september.reduce((s, r) => s + r[1], 0);
  const sxy = september.reduce((s, r) => s + r[0] * r[1], 0), sxx = september.reduce((s, r) => s + r[0] * r[0], 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const base = september.filter(([y]) => y >= 1981 && y <= 2010).map(([, v]) => v);
  const baseMean = base.reduce((a, b) => a + b, 0) / base.length;
  return {
    unit: 'million km²', region: 'Arctic',
    latest: { date: `${last[0]}-${String(last[1]).padStart(2, '0')}-${String(last[2]).padStart(2, '0')}`, extent: last[3] },
    sameDayMean1981_2010: clim ? r2(clim) : null,
    anomalyPct: clim ? r2(((last[3] - clim) / clim) * 100) : null,
    september,
    septemberTrend: { perDecadeMkm2: r2(slope * 10), perDecadePct: r2(((slope * 10) / baseMean) * 100), intercept: sy / n - slope * (sx / n), slope, baseline: '1981–2010 September mean' },
  };
}

const PARSERS = { temperature: parseGistemp, seaIce: parseSeaIce };

// Last resort: the dated snapshot shipped in public/data/story (real data, labelled ARCHIVED).
const SNAPSHOT = path.join(process.cwd(), 'public', 'data', 'story', 'vitals.json');
async function archived(key) {
  try {
    const snap = JSON.parse(await fsp.readFile(SNAPSHOT, 'utf8'));
    return snap[key] && !snap[key].unavailable ? { ...snap[key], freshness: 'ARCHIVED' } : null;
  } catch {
    return null;
  }
}

async function one(key) {
  const src = VITAL_SOURCES[key];
  try {
    const hit = await cache.get(key, async () => ({ body: PARSERS[key](await fetchText(src.file, { timeoutMs: 45000, retries: 1 })) }));
    return { ...hit.body, freshness: hit.state, fetchedAt: new Date(hit.at).toISOString(), source: src };
  } catch (e) {
    return (await archived(key)) || { unavailable: true, error: 'SOURCE TEMPORARILY UNAVAILABLE', source: src };
  }
}

export async function getVitals() {
  const keys = Object.keys(VITAL_SOURCES);
  const vals = await Promise.all(keys.map(one));
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
}
