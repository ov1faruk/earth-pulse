// Tests for the story page: climate parsers, the hazard-signal index, the
// curated event data and the offline snapshots. (Written with AI assistance.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseGistemp, parseCo2, parseSeaLevel, parseSeaIce } from '../server/providers/vitals.js';
import { scoreSignals, windowVsClimatology, haversineKm, riskLevel, METHOD } from '../src/core/risk.js';
import { SOURCES, EVENTS, NEPAL, RIPPLE, SCENARIOS, SIGNAL_CASES, SIGNAL_NOTES, YEAR_CONTEXT, HAZARD_GUIDE, COMPILED_ON } from '../src/story/data.js';

// ---------- parsers ----------
test('GISTEMP: parses annual and monthly anomalies, skips missing months', () => {
  const head = 'Land-Ocean: Global Means\nYear,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D,D-N,DJF,MAM,JJA,SON\n';
  const rows = [];
  for (let y = 1880; y <= 1899; y++) rows.push(`${y},${Array(12).fill('-.20').join(',')},-.20,***,***,-.20,-.20,-.20`);
  rows.push(`2025,${Array(12).fill('1.20').join(',')},1.20,1.20,1.20,1.20,1.20,1.20`);
  rows.push('2026,1.00,1.10,1.50,***,***,***,***,***,***,***,***,***,***,***,1.10,***,***,***');
  const t = parseGistemp(head + rows.join('\n'));
  assert.equal(t.annual.length, 21);
  assert.deepEqual(t.annual.at(-1), [2025, 1.2]);
  assert.deepEqual(t.latestMonth, { year: 2026, month: 3, anomaly: 1.5 });
  assert.equal(t.baselineShift, 0.2);
  assert.equal(t.last12MonthMean, 1.2); // nine months at 1.20 + 1.00 + 1.10 + 1.50 = 14.4 / 12
});

test('CO2: latest month, year-on-year change, complete years only', () => {
  const lines = ['# comment', 'year,month,decimal date,average,deseasonalized,ndays,sdev,unc'];
  for (let m = 1; m <= 12; m++) lines.push(`2024,${m},2024.${m},${420 + m * 0.1},421,30,0.5,0.2`);
  for (let m = 1; m <= 3; m++) lines.push(`2025,${m},2025.${m},${423 + m * 0.1},424,30,0.5,0.2`);
  const c = parseCo2(lines.join('\n'));
  assert.equal(c.monthly.length, 15);
  assert.deepEqual(c.latestMonth, { year: 2025, month: 3, ppm: 423.3, trendPpm: 424 });
  assert.equal(c.yearOverYear, 3);
  assert.deepEqual(c.annual.map((a) => a[0]), [2024]);
});

test('sea level: empty columns are not read as zero', () => {
  const csv = '#trend = 3.11 mm/year\nyear,TOPEX/Poseidon,Jason-1,Jason-2,Jason-3,Sentinel-6MF\n1993.0100,-20.0,,,,\n1993.5000,-18.0,,,,\n2024.5000,,,,,80.0\n2025.0000,,,,82.0,84.0\n';
  const s = parseSeaLevel(csv);
  assert.equal(s.trendMmPerYear, 3.11);
  assert.deepEqual(s.latest, { decimalYear: 2025, mm: 83 });
  assert.equal(s.riseSinceStartMm, 100.5); // mean(80, 83) − mean(−20, −18)
});

test('sea ice: same-day climatology and September trend', () => {
  const lines = ['Year, Month, Day, Extent, Missing, Source Data', 'YYYY, MM, DD, 10^6 sq km, 10^6 sq km, files'];
  for (let y = 1979; y <= 2026; y++) {
    for (let d = 1; d <= 30; d++) lines.push(`${y}, 09, ${String(d).padStart(2, '0')}, ${(7 - (y - 1979) * 0.08).toFixed(3)}, 0.000, x`);
    lines.push(`${y}, 11, 11, ${(10.5 - (y - 1979) * 0.04).toFixed(3)}, 0.000, x`);
  }
  const i = parseSeaIce(lines.join('\n'));
  assert.equal(i.latest.date, '2026-11-11');
  assert.equal(i.september.length, 48);
  assert.equal(i.septemberTrend.perDecadeMkm2, -0.8);
  assert.ok(i.anomalyPct < 0);
  assert.ok(Math.abs(i.sameDayMean1981_2010 - 9.84) < 0.01);
});

// ---------- hazard-signal index ----------
test('risk: rain must be far above normal in both ratio and millimetres', () => {
  const dry = scoreSignals({ rain: { observed: 47, normal: 19 } }); // 2.5× normal but only +28 mm
  assert.equal(dry.scores.wet, 28);
  const wet = scoreSignals({ rain: { observed: 400, normal: 150 } });
  assert.equal(wet.scores.wet, 100);
  const normal = scoreSignals({ rain: { observed: 150, normal: 150 } });
  assert.equal(normal.scores.wet, 0);
  assert.equal(normal.scores.dry, 0);
});

test('risk: deserts and dry seasons are not flagged as drought', () => {
  assert.equal(scoreSignals({ rain: { observed: 0, normal: 5 } }).scores.dry, 0);
  assert.equal(scoreSignals({ rain: { observed: 10, normal: 100 } }).scores.dry, 100);
});

test('risk: seismic, fire and heat scores follow the published formulas', () => {
  const s = scoreSignals({ maxMag: 7.5, fires: 999, heat: { observed: 22.5, normal: 20 }, events: 1 });
  assert.equal(s.scores.seismic, 100);
  assert.equal(s.scores.fire, 100);
  assert.equal(s.scores.heat, 50);
  assert.equal(s.scores.events, 33);
  assert.equal(scoreSignals({ maxMag: 4 }).scores.seismic, 0);
  assert.equal(scoreSignals({}).overall, 0);
});

test('risk: overall = 0.6 × max + 0.4 × mean, and levels are ordered', () => {
  const s = scoreSignals({ maxMag: 7.5 }); // seismic 100, fire 0, events 0
  assert.equal(s.overall, Math.round(0.6 * 100 + 0.4 * (100 / 3)));
  assert.equal(s.top, 'seismic');
  assert.deepEqual([0, 30, 60, 90].map((v) => riskLevel(v).id), ['low', 'moderate', 'high', 'severe']);
  for (const k of Object.keys(s.scores)) assert.ok(METHOD.signals[k], `method text for ${k}`);
});

test('risk: 30-day window ignores POWER fill values and weights the monthly normal by day', () => {
  const daily = {};
  for (let d = 1; d <= 31; d++) daily[`202610${String(d).padStart(2, '0')}`] = 2;
  for (let d = 1; d <= 9; d++) daily[`202611${String(d).padStart(2, '0')}`] = 4;
  daily['20261110'] = -999;
  const clim = { JAN: 0, FEB: 0, MAR: 0, APR: 0, MAY: 0, JUN: 0, JUL: 0, AUG: 0, SEP: 0, OCT: 1, NOV: 3, DEC: 0 };
  const w = windowVsClimatology(daily, clim, { sum: true });
  assert.equal(w.days, 30);
  assert.equal(w.to, '20261109');
  assert.equal(w.observed, 21 * 2 + 9 * 4);
  assert.equal(w.normal, 21 * 1 + 9 * 3);
  assert.equal(windowVsClimatology({ 20261101: 1 }, clim), null);
});

test('risk: haversine distance', () => {
  assert.ok(Math.abs(haversineKm(27.72, 85.32, 28.21, 83.99) - 141) < 3); // Kathmandu → Pokhara
  assert.equal(haversineKm(10, 20, 10, 20), 0);
});

// ---------- curated data integrity ----------
test('every figure points at a real, https source', () => {
  const keys = new Set(Object.keys(SOURCES));
  for (const s of Object.values(SOURCES)) { assert.match(s.url, /^https:\/\//); assert.ok(s.label.length > 8 && s.group); }
  const used = [
    ...EVENTS.flatMap((e) => [e.src, ...e.research]), ...NEPAL.toll.map((t) => t.src), ...NEPAL.cause.src,
    ...YEAR_CONTEXT.map((c) => c.src), ...SIGNAL_NOTES.map((n) => n.src),
  ];
  for (const k of used) assert.ok(keys.has(k), `unknown source key "${k}"`);
});

test('events fall inside the 12 months before the compile date, in order, inside their image box', () => {
  const end = Date.parse(COMPILED_ON), start = end - 365 * 864e5;
  let prev = 0;
  for (const e of EVENTS) {
    const t = Date.parse(e.date);
    assert.ok(t >= start && t <= end, `${e.id} date ${e.date}`);
    assert.ok(t >= prev, `${e.id} out of order`); prev = t;
    const [s, w, n, ea] = e.box;
    assert.ok(e.lat > s && e.lat < n && e.lon > w && e.lon < ea, `${e.id} marker outside box`);
    assert.ok(e.imgFrom <= e.date && e.date <= e.imgTo, `${e.id} image window`);
    assert.match(e.iso3, /^[A-Z]{3}$/);
    assert.ok(e.natural.length && e.human.length && e.figures.length >= 3);
    if (e.deaths != null) assert.ok(e.deathsNote, `${e.id} needs a note on its death toll`);
    if (e.damageUsd != null) assert.ok(e.damageNote, `${e.id} needs a note on its damage figure`);
  }
});

test('Nepal case study: totals are consistent with the per-country figures', () => {
  const nepal = EVENTS.find((e) => e.id === 'nepal');
  assert.equal(nepal.deaths, NEPAL.toll[0].v + 43);
  assert.equal(NEPAL.date, nepal.date);
  assert.ok(NEPAL.nisar.before < NEPAL.date && NEPAL.date < NEPAL.nisar.after);
  assert.equal(RIPPLE.length, 7);
  for (const r of RIPPLE) assert.equal(r.facts.length, 4);
  const b = NEPAL.regionBox;
  for (const p of NEPAL.places) assert.ok(p.lat > b.south && p.lat < b.north && p.lon > b.west && p.lon < b.east, p.name);
});

test('IPCC scenarios: ranges bracket the central value and rise with emissions', () => {
  for (const s of SCENARIOS) for (const p of [...s.temp, ...s.sea]) assert.ok(p[2] <= p[1] && p[1] <= p[3], `${s.id} ${p}`);
  const end = SCENARIOS.map((s) => s.temp[2][1]);
  assert.deepEqual(end, [...end].sort((a, b) => a - b));
  assert.deepEqual(SCENARIOS.map((s) => s.sea[1][1]), [0.38, 0.44, 0.56, 0.68, 0.77]);
});

test('signal cases and hazard guide are complete', () => {
  for (const c of SIGNAL_CASES) { assert.ok(c.start < c.event && c.event < c.end); assert.ok(['PRECTOTCORR', 'T2M_MAX'].includes(c.param)); }
  for (const k of Object.keys(METHOD.signals)) { const g = HAZARD_GUIDE[k]; assert.ok(g && g.natural.length && g.human.length && g.act.length, k); }
});

// ---------- offline snapshots ----------
test('story snapshots: real, dated vital signs and risk map', () => {
  const v = JSON.parse(fs.readFileSync('public/data/story/vitals.json', 'utf8'));
  for (const k of ['temperature', 'co2', 'seaLevel', 'seaIce']) { assert.ok(v[k] && !v[k].unavailable, k); assert.match(v[k].source.url, /^https:/); assert.ok(v[k].snapshotAt || v[k].fetchedAt); }
  assert.ok(v.temperature.annual.length > 140 && v.temperature.annual[0][0] === 1880);
  assert.ok(v.co2.latestMonth.ppm > 400 && v.co2.monthly[0][0] === 1958);
  assert.ok(v.seaLevel.riseSinceStartMm > 80 && v.seaLevel.riseSinceStartMm < 150);
  assert.ok(v.seaIce.september.length >= 47);
  const r = JSON.parse(fs.readFileSync('public/data/story/risk.json', 'utf8'));
  assert.ok(r.places.length >= 20 && r.snapshotAt);
  for (const p of r.places.filter((x) => !x.unavailable)) assert.ok(p.overall >= 0 && p.overall <= 100 && p.measured);
  for (const f of ['earth_latest.jpg', 'world.jpg', 'nepal/overview_2025-11-10.jpg', 'nepal/overview_2026-10-23.jpg', 'nepal/border_2025-11-10.jpg', 'nepal/border_2026-10-23.jpg', 'nepal/overview_2026-08-24.jpg', 'nepal/region.jpg']) {
    assert.ok(fs.statSync(`public/data/story/${f}`).size > 50_000, f);
  }
});
