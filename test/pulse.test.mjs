// Tests for the Pulse home card logic: personas, thresholds, plain-language alerts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, derive, atAltitude, DEFAULT_THRESHOLDS, LEVELS } from '../src/pulse/logic.js';

const days = (rain, tmax = 28, tmin = 18) => Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${String(13 + i).padStart(2, '0')}`, rainMm: Array.isArray(rain) ? rain[i] : rain, tmax: Array.isArray(tmax) ? tmax[i] : tmax, tmin: Array.isArray(tmin) ? tmin[i] : tmin }));
const place = (o = {}) => ({
  name: 'Testville', lat: 10, lon: 10,
  observed: { asOf: '20261111', elevationM: 100, rain7: { mm: 10, normalMm: 10 }, rain30: { mm: 60, normalMm: 60 }, tempAnomaly7C: 0.2, hottest7C: 30, coldest7C: 18, soilWetness: 0.5, soilNormal: 0.5, snowDepthCm: 0, snowDepth7AgoCm: 0, series: Array.from({ length: 30 }, (_, i) => ({ d: `202610${i}`, rain: 2 })), ...o.observed },
  forecast: { days: o.days || days(2) },
  fires: { within50km: 0, within150km: 0, nearest: null, ...o.fires },
  events: o.events || [], landslides: { count: 0, fatalities: 0, period: '1988–2017', ...o.landslides }, nisar: { passes: 0, last: null },
});

test('pulse: a normal week is calm with a plain sentence', () => {
  const a = assess(place(), 'everyone');
  assert.equal(a.level, 'calm');
  assert.match(a.headline, /Nothing unusual is building around Testville/);
});

test('pulse: saturated ground + heavy rain is the flood danger', () => {
  const a = assess(place({ observed: { soilWetness: 0.82 }, days: days([5, 10, 40, 20, 5, 0, 0]) }), 'everyone');
  assert.equal(a.level, 'danger');
  assert.match(a.headline, /Saturated ground and 80 mm/);
  assert.match(a.detail, /Sun/); // wettest day (15 Nov 2026) is named
});

test('pulse: farmer thresholds are the user\'s own', () => {
  const p = place({ days: days(9) }); // 63 mm in 7 days
  assert.match(assess(p, 'farmer').headline, /heavy-rain line is crossed/);
  assert.notEqual(assess(p, 'farmer', { heavyRain7: 200 }).headline.match(/line is crossed/), true);
  const frost = assess(place({ days: days(0, 12, [3, 1, -2, 2, 3, 4, 5]) }), 'farmer');
  assert.ok([frost.headline, ...frost.alerts.map((x) => x.title)].some((t) => /Frost risk: -2 °C/.test(t)));
});

test('pulse: dry spell counts NASA-observed dry days plus dry forecast days', () => {
  const series = Array.from({ length: 30 }, (_, i) => ({ d: String(i), rain: i < 20 ? 3 : 0 })); // last 10 days dry
  const p = place({ observed: { series }, days: days([0, 0, 0, 0, 0, 5, 0]) });
  const d = derive(p);
  assert.equal(d.dryRun, 10);
  assert.equal(d.dryAhead, 5);
  assert.match(assess(p, 'farmer').headline, /15 days without real rain/);
});

test('pulse: climber gets melt warnings and altitude temperatures', () => {
  const p = place({ observed: { elevationM: 1300, tempAnomaly7C: 4.5 }, days: days(0, 20, 10) });
  const a = assess(p, 'climber', { altitude: 5000 });
  assert.equal(a.level, 'warning');
  assert.match(a.headline, /4.5 °C warmer than normal/);
  assert.equal(derive(p).freezingLevelM, 1300 + Math.round((20 / 6.5) * 1000));
  assert.equal(atAltitude(20, 1300, 5000), 20 - 3.7 * 6.5);
});

test('pulse: one alert per kind, most severe first, every level known', () => {
  const a = assess(place({ fires: { within50km: 12, nearest: { km: 4, sat: 'NOAA 20' } }, days: days(0, [36, 41, 30, 30, 30, 30, 30]) }), 'everyone');
  const all = [a, ...a.alerts];
  assert.ok(all.every((x) => LEVELS[x.level]));
  assert.equal(a.level, 'danger'); // 41 °C
  assert.equal(new Set(a.alerts.map((x) => x.kind)).size, a.alerts.length);
  assert.ok(DEFAULT_THRESHOLDS.heavyRain7 > 0);
});
