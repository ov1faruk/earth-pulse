// Real orbital elements from CelesTrak (https://celestrak.org, free, attribution
// requested). CelesTrak asks clients not to refetch GP data more often than
// every ~2 h, so TLEs are cached for 6 h and served stale on upstream failure.
// Pattern adapted from God's Eye View's celestrakProxy (MIT © 2026 Bilawal Sidhu).
import { createCache, fetchText } from '../cache.js';
import { parseTle } from '../../src/core/tle.js';

export { parseTle };

const GP = 'https://celestrak.org/NORAD/elements/gp.php';
const tleCache = createCache('celestrak', { ttlMs: 6 * 3600_000 });

// Groups shown on the globe. "resource" = Earth-resources satellites.
export const ALLOWED_GROUPS = ['resource', 'weather', 'science', 'stations', 'sarsat', 'gnss', 'geo'];

async function load(key, url) {
  return tleCache.get(key, async () => {
    const body = await fetchText(url, { timeoutMs: 20000 });
    if (!/^1 /m.test(body)) throw new Error('no TLE lines in response');
    return { body };
  });
}

export async function getGroup(group) {
  if (!ALLOWED_GROUPS.includes(group)) throw new Error('group not allowed');
  const hit = await load(`group:${group}`, `${GP}?GROUP=${group}&FORMAT=tle`);
  return { satellites: parseTle(hit.body), freshness: hit.state, fetchedAt: new Date(hit.at).toISOString() };
}

export async function getByNorad(norad) {
  const id = Number(norad);
  if (!Number.isInteger(id) || id <= 0 || id > 999999) throw new Error('invalid NORAD id');
  const hit = await load(`catnr:${id}`, `${GP}?CATNR=${id}&FORMAT=tle`);
  const [sat] = parseTle(hit.body);
  if (!sat) throw new Error('not found');
  return { satellite: sat, freshness: hit.state, fetchedAt: new Date(hit.at).toISOString() };
}
