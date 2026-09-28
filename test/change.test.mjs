import test from 'node:test';
import assert from 'node:assert/strict';
import { computeChange, changeToRGBA } from '../src/core/changeEngine.js';

// Synthetic images: tests the ALGORITHM only (no data is presented from this).
function img(W, H, fn, rect = { west: 90, east: 91, north: 25, south: 24 }, gain = 1) {
  const lum = new Float32Array(W * H), valid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; valid[i] = 1; lum[i] = Math.min(255, fn(x, y) * gain); }
  return { W, H, rect, lum, valid };
}
const base = (x, y) => 120 + ((x * 7 + y * 13) % 11); // mild texture

test('no change, even with a different contrast stretch → almost nothing flagged', () => {
  const r = computeChange(img(200, 200, base), img(200, 200, base, undefined, 1.3));
  assert.ok(r.stats.brighterFrac + r.stats.darkerFrac < 0.01, JSON.stringify(r.stats));
});

test('a region that becomes water (dark) is flagged darker, located correctly', () => {
  const after = (x, y) => (x > 50 && x < 100 && y > 50 && y < 100 ? 15 : base(x, y));
  const r = computeChange(img(200, 200, base), img(200, 200, after));
  assert.ok(r.stats.darkerFrac > 0.04 && r.stats.darkerFrac < 0.09, `darker ${r.stats.darkerFrac}`);
  assert.ok(r.stats.brighterFrac < 0.01);
  const h = r.hotspots[0];
  assert.ok(h.darker > 0.3);
  assert.ok(h.lon > 90.2 && h.lon < 90.55 && h.lat > 24.45 && h.lat < 24.8, `hotspot ${h.lon},${h.lat}`);
});

test('brightening (e.g. crop growth) is flagged brighter and coloured orange', () => {
  const after = (x, y) => (y < 50 ? 250 : base(x, y));
  const r = computeChange(img(120, 120, base), img(120, 120, after));
  assert.ok(r.stats.brighterFrac > 0.25);
  const rgba = changeToRGBA(r);
  const i = (10 * r.grid.W + 10) * 4;
  assert.deepEqual([rgba[i], rgba[i + 1], rgba[i + 2]], [255, 160, 51]);
});

test('non-overlapping images are rejected', () => {
  assert.throws(() => computeChange(img(50, 50, base), img(50, 50, base, { west: 10, east: 11, north: 5, south: 4 })));
});

test('land mask: water pixels are excluded from change and stats', () => {
  const after = (x, y) => (x < 100 ? 15 : base(x, y)); // big darkening on the west half
  const land = (lon) => lon >= 90.5; // pretend west half is sea
  const r = computeChange(img(200, 200, base), img(200, 200, after), { land });
  assert.ok(r.stats.darkerFrac < 0.02, `darker ${r.stats.darkerFrac}`);
  assert.ok(r.stats.waterMaskedKm2 > 0);
});

test('edge guard: nothing is flagged along the boundary of the overlap', () => {
  const r = computeChange(img(100, 100, base), img(100, 100, (x, y) => base(x, y) * (x > 97 ? 3 : 1)));
  assert.ok(r.stats.brighterFrac < 0.005, `brighter ${r.stats.brighterFrac}`);
});
