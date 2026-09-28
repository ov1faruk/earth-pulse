import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STORIES, matchTopic } from '../src/core/stories.js';
import { resolveStory } from '../src/core/storyModel.js';
import { OVERCLAIM_WORDS, DATA_CLASS } from '../src/core/dataClass.js';

const manifest = (id) => JSON.parse(fs.readFileSync(`public/data/stories/${id}/manifest.json`, 'utf8'));
const usgs = { id: 'us6000tgb9', mag: 6.8, place: 'The 2026 Kumamoto Region, Japan Earthquake', time: '2026-07-28T07:27:14.640Z', lon: 130.6269, lat: 32.6043, depthKm: 8 };

for (const s of STORIES) {
  test(`${s.id}: resolves from real manifest with provenance`, () => {
    const m = manifest(s.id);
    const r = resolveStory(s, m, { contextEvent: s.contextEvent ? usgs : null });
    assert.equal(r.available, true);
    assert.equal(r.dataClass, DATA_CLASS.REAL_NISAR);
    assert.ok(r.timeline.length >= 4, 'at least 4 real observations');
    for (const t of r.timeline) {
      assert.match(t.granule, /^NISAR_L2_PR_(GCOV|GUNW)_/);
      assert.ok(t.observation.georeferencing.residualKm < 2, 'georeferencing within 2 km');
      assert.ok(fs.existsSync(`public${t.image}`), `image exists ${t.image}`);
    }
    for (const field of [r.summary, r.interpretation.whatWeSaw, r.interpretation.mayMean]) {
      assert.doesNotMatch(field, /\{\w+\}|—/, `unfilled placeholder in: ${field}`);
    }
  });

  test(`${s.id}: scientific language avoids overclaiming`, () => {
    const text = JSON.stringify(s).toLowerCase();
    for (const w of OVERCLAIM_WORDS) assert.ok(!text.includes(w), `"${w}" used in ${s.id}`);
    assert.ok(s.alternatives.length >= 2, 'lists alternative explanations');
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(s.confidence.level));
  });
}

test('kumamoto: exactly one interferogram spans the USGS event', () => {
  const s = STORIES.find((x) => x.id === 'kumamoto-ground');
  const r = resolveStory(s, manifest(s.id), { contextEvent: usgs });
  const spans = r.timeline.filter((t) => t.spansEvent);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].index, r.afterIndex, 'AFTER frame is the coseismic pair');
});

test('bangladesh: derived water series is labelled DERIVED with caveats', () => {
  const d = manifest('bangladesh-water').derived;
  assert.equal(d.dataClass, 'DERIVED');
  assert.ok(d.caveats.length >= 3);
  assert.equal(d.series.length, 8);
});

test('missing manifest → unavailable, never simulated as real', () => {
  const r = resolveStory(STORIES[0], null);
  assert.equal(r.available, false);
  assert.notEqual(r.dataClass, DATA_CLASS.REAL_NISAR);
});

test('natural-language routing', () => {
  assert.equal(matchTopic('A flood in Bangladesh').id, 'bangladesh-water');
  assert.equal(matchTopic('an earthquake').id, 'kumamoto-ground');
  assert.equal(matchTopic('a changing glacier').id, 'greenland-ice');
  assert.equal(matchTopic('a forest that changed').id, 'rondonia-forest');
  assert.equal(matchTopic('agriculture').id, 'punjab-crops');
});
