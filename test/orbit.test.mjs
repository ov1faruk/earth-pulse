import test from 'node:test';
import assert from 'node:assert/strict';
import { satrecFromTle, geodeticAt, nextSwathCover, swathSamples, distanceKm, destination, tleEpoch } from '../src/core/orbit.js';

// Real NISAR TLE (CelesTrak, epoch 2026-09-25).
const TLE = {
  line1: '1 65053U 25163A   26268.25747182  .00000055  00000+0  29804-4 0  9992',
  line2: '2 65053  98.4059  94.4715 0001236  88.3095 271.8236 14.42503760 60817',
};

test('NISAR altitude is ~747 km (sun-synchronous LEO)', () => {
  const g = geodeticAt(satrecFromTle(TLE), new Date('2026-09-25T06:00:00Z'));
  assert.ok(g.altKm > 730 && g.altKm < 770, `alt ${g.altKm}`);
  assert.ok(g.speedKms > 7.3 && g.speedKms < 7.6);
});

test('TLE epoch decodes', () => {
  assert.equal(tleEpoch(satrecFromTle(TLE)).toISOString().slice(0, 10), '2026-09-25');
});

test('modeled swath covers the real Bangladesh GCOV footprint at its acquisition time', () => {
  const rec = satrecFromTle(TLE);
  // Real granule NISAR_L2_PR_GCOV_031_069_A_014_… 2026-09-22T23:21:32–23:22:06Z,
  // footprint centroid ≈ (90.39E, 24.76N).
  const hit = nextSwathCover(rec, { lat: 24.76, lon: 90.39 }, new Date('2026-09-22T23:10:00Z'), { hours: 1 });
  assert.ok(hit, 'swath should cover the footprint');
  const dt = Math.abs(hit.time - new Date('2026-09-22T23:21:49Z')) / 1000;
  assert.ok(dt < 60, `swath timing off by ${dt}s`);
  assert.equal(hit.ascending, true);
});

test('destination/distance are inverse-consistent', () => {
  const p = { lat: 24, lon: 90 };
  const q = destination(p, 270, 550);
  assert.ok(Math.abs(distanceKm(p, q) - 550) < 0.5);
});

test('swath samples have near/far edges on the left', () => {
  const s = swathSamples(satrecFromTle(TLE), new Date('2026-09-22T23:21:00Z'), new Date('2026-09-22T23:22:00Z'));
  assert.ok(s.length >= 6);
  const d = distanceKm(s[0].nadir, s[0].far);
  assert.ok(d > 660 && d < 680);
});
