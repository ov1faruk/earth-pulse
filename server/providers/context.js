// Real context data: USGS earthquakes and place search.
import { createCache, fetchText } from '../cache.js';
import { normalizeUsgsEvent } from '../../src/core/storyModel.js';

const usgsCache = createCache('usgs', { ttlMs: 24 * 3600_000 });
const geoCache = createCache('geocode', { ttlMs: 7 * 24 * 3600_000 });

export async function getUsgsEvent(eventId) {
  if (!/^[a-z0-9]{4,20}$/i.test(eventId)) throw new Error('invalid event id');
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${eventId}&format=geojson`;
  const hit = await usgsCache.get(url, async () => ({ body: JSON.parse(await fetchText(url)) }));
  return { event: normalizeUsgsEvent(hit.body), freshness: hit.state };
}

// Photon (komoot) — keyless OSM geocoder, the same keyless path God's Eye View
// uses. Data © OpenStreetMap contributors (ODbL). Requests are cached and
// spaced to respect the public instance's fair-use policy.
let lastCall = 0;
export async function geocode(q) {
  const query = String(q || '').trim().slice(0, 120);
  if (query.length < 2) return { results: [], freshness: 'CACHED' };
  const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q: query, limit: '6', lang: 'en' })}`;
  const hit = await geoCache.get(url.toLowerCase(), async () => {
    const wait = Math.max(0, lastCall + 600 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return { body: JSON.parse(await fetchText(url, { timeoutMs: 10000 })) };
  });
  const results = (hit.body.features || []).map((f) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    const ext = p.extent; // [minLon, maxLat, maxLon, minLat]
    return {
      name: p.name || p.city || p.state || p.country,
      detail: [p.city !== p.name ? p.city : null, p.state !== p.name ? p.state : null, p.country !== p.name ? p.country : null].filter(Boolean).join(', '),
      kind: p.osm_value || p.type,
      lat,
      lon,
      bbox: ext ? [ext[0], ext[3], ext[2], ext[1]] : null,
    };
  });
  return { results, freshness: hit.state, attribution: '© OpenStreetMap contributors · Photon by komoot' };
}
