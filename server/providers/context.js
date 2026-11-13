// Real context data: NASA EPIC imagery and place search.
import { createCache, fetchText } from '../cache.js';

const geoCache = createCache('geocode', { ttlMs: 7 * 24 * 3600_000 });

// NASA EPIC (DSCOVR): the day's full-disc photographs of the sunlit Earth. Keyless.
const epicCache = createCache('epic', { ttlMs: 3 * 3600_000 });
export async function getEpic() {
  const hit = await epicCache.get('natural', async () => {
    const list = JSON.parse(await fetchText('https://epic.gsfc.nasa.gov/api/natural', { timeoutMs: 30000 }));
    if (!list.length) throw new Error('EPIC returned no images');
    const day = list[0].date.slice(0, 10);
    const [y, m, d] = day.split('-');
    return { body: { date: day, images: list.map((x) => ({ url: `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${d}/jpg/${x.image}.jpg`, time: x.date.slice(11, 16), lat: x.centroid_coordinates.lat, lon: x.centroid_coordinates.lon })) } };
  });
  return { ...hit.body, freshness: hit.state, source: { name: 'NASA EPIC / DSCOVR (NASA GSFC, NOAA)', url: 'https://epic.gsfc.nasa.gov/' } };
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
