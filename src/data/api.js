// Browser data access with an explicit fallback hierarchy:
//   LIVE (upstream via our API) → CACHED (server cache) → ARCHIVED
//   (pre-processed real data shipped with the app) → DEMO / UNAVAILABLE.
// Every result carries `freshness` so the UI can say which tier is active.
import { STORIES, storyById } from '../core/stories.js';
import { resolveStory } from '../core/storyModel.js';
import { parseTle } from '../core/tle.js';
import { FRESHNESS } from '../core/dataClass.js';

const TIMEOUT_MS = 12000;

async function getJson(url, { timeout = TIMEOUT_MS } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error; } catch { /* ignore */ }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

const mapFreshness = (s) => (s === 'LIVE' ? FRESHNESS.LIVE : s === 'STALE' ? FRESHNESS.STALE : FRESHNESS.CACHED);

export async function listStories() {
  try {
    return { ...(await getJson('/api/earth-changes')), freshness: FRESHNESS.CACHED };
  } catch {
    // Static fallback: the bundled index written by the pipeline.
    let index = { stories: [] };
    try { index = await getJson('/data/stories/index.json'); } catch { /* none */ }
    const avail = new Map(index.stories.map((s) => [s.id, s]));
    return {
      freshness: FRESHNESS.ARCHIVED,
      stories: STORIES.map((s) => ({
        id: s.id, humanTitle: s.humanTitle, scientificTerm: s.scientificTerm, phenomenon: s.phenomenon,
        location: s.location, tagline: s.tagline, featured: !!s.featured,
        available: !!avail.get(s.id)?.available, dataClass: avail.get(s.id)?.available ? 'REAL_NISAR' : 'DEMO',
      })),
    };
  }
}

const storyCache = new Map();
export async function getStory(id) {
  if (storyCache.has(id)) return storyCache.get(id);
  let story;
  try {
    story = await getJson(`/api/story/${id}`);
  } catch {
    const def = storyById(id);
    if (!def) throw new Error('unknown story');
    let manifest = null;
    try { manifest = await getJson(`/data/stories/${id}/manifest.json`); } catch { /* none */ }
    story = resolveStory(def, manifest, { freshness: FRESHNESS.ARCHIVED });
    if (def.contextEvent) story.contextError = 'Context source unreachable (offline)';
  }
  storyCache.set(id, story);
  return story;
}

export async function searchPlaces(q) {
  const r = await getJson(`/api/locations/search?q=${encodeURIComponent(q)}`, { timeout: 8000 });
  return r.results || [];
}

export async function nisarAt(lat, lon, { product } = {}) {
  const qs = new URLSearchParams({ lat, lon, max: '40' });
  if (product) qs.set('product', product);
  const r = await getJson(`/api/nisar/search?${qs}`, { timeout: 30000 });
  return { ...r, freshness: mapFreshness(r.freshness) };
}

export async function nisarPasses(lat, lon) {
  const r = await getJson(`/api/nisar/observations?lat=${lat}&lon=${lon}`, { timeout: 30000 });
  return { ...r, freshness: mapFreshness(r.freshness) };
}

async function snapshotAt() {
  try { return (await (await fetch('/data/tle/FETCHED_AT')).text()).trim(); } catch { return null; }
}

export async function satelliteGroup(group) {
  try {
    const r = await getJson(`/api/satellites?group=${group}`);
    return { satellites: r.satellites, freshness: mapFreshness(r.freshness), fetchedAt: r.fetchedAt };
  } catch {
    const text = await (await fetch(`/data/tle/${group}.tle`)).text();
    return { satellites: parseTle(text), freshness: FRESHNESS.ARCHIVED, fetchedAt: await snapshotAt() };
  }
}

export async function satelliteTle(norad) {
  try {
    const r = await getJson(`/api/satellites/${norad}`);
    return { satellite: r.satellite, freshness: mapFreshness(r.freshness), fetchedAt: r.fetchedAt };
  } catch {
    const text = await (await fetch(`/data/tle/${norad}.tle`)).text();
    const [s] = parseTle(text);
    if (!s) throw new Error('no TLE');
    return { satellite: s, freshness: FRESHNESS.ARCHIVED, fetchedAt: await snapshotAt() };
  }
}

/** Proxied NISAR browse URL (server caches it; avoids signed-URL CORS issues). */
export function browseProxy(url) {
  return url ? `/api/nisar/browse?url=${encodeURIComponent(url)}` : null;
}
