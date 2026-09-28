import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const snap = (n) => JSON.parse(fs.readFileSync(`public/data/live/${n}.json`, 'utf8'));

test('fires snapshot: real FIRMS detections, each tagged with a satellite', () => {
  const f = snap('fires');
  assert.ok(f.fires.length > 10000, `${f.fires.length} detections`);
  assert.deepEqual(f.satellites, ['NOAA 20', 'NOAA 21', 'SUOMI NPP', 'TERRA', 'AQUA']);
  assert.deepEqual(f.satelliteNorad, [43013, 54234, 37849, 25994, 27424]);
  for (const r of f.fires.slice(0, 2000)) {
    assert.ok(Math.abs(r[0]) <= 180 && Math.abs(r[1]) <= 90);
    assert.ok(r[4] >= 0 && r[4] <= 4, 'satellite index');
    assert.ok(r[2] >= 0, 'FRP');
  }
  const ts = f.fires.map((r) => r[3]);
  const span = (ts.reduce((a, b) => Math.max(a, b)) - ts.reduce((a, b) => Math.min(a, b))) / 60;
  assert.ok(span <= 36, `24 h product spans ${span} h`);
});

test('quakes snapshot: USGS M2.5+', () => {
  const q = snap('quakes');
  assert.ok(q.quakes.length > 500);
  assert.ok(q.quakes.every((r) => r[3] >= 2.45 && // USGS feed threshold is on the rounded magnitude
     typeof r[5] === 'string'));
});

test('events snapshot: EONET + GDACS with sources', () => {
  const e = snap('events');
  assert.ok(e.events.length > 50);
  assert.ok(e.events.every((x) => ['NASA EONET', 'GDACS'].includes(x.source) && x.url));
});

test('nisar snapshot: real granule names with footprints', () => {
  const n = snap('nisar');
  assert.ok(n.granules.length > 500);
  for (const g of n.granules.slice(0, 500)) {
    assert.match(g.id, /^NISAR_L2_PR_(GCOV|GUNW)_/);
    assert.ok(g.ring.length >= 3);
    assert.ok(['GCOV', 'GUNW'].includes(g.type));
  }
});
