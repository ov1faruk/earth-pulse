// LIVING EARTH — real, continuously updated global feeds (all keyless).
//
//   NASA FIRMS   active-fire detections, last 24 h, per satellite
//                (NOAA-20, NOAA-21, Suomi NPP VIIRS; Terra/Aqua MODIS)
//   USGS         earthquakes M2.5+, last 30 days
//   NASA EONET   open natural events (wildfires, storms, volcanoes, ice…)
//   GDACS        current disaster alerts (floods, cyclones, drought…)
//   NASA CMR     NISAR GCOV + GUNW granules (footprints) acquired recently
//
// Responses are compacted to arrays so hundreds of thousands of points can be
// shipped to the browser; each record keeps its source and satellite.
import { createCache, fetchText } from '../cache.js';

const FIRMS = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire';
export const FIRE_SOURCES = [
  { key: 'N20', file: 'noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv', satellite: 'NOAA 20', norad: 43013, instrument: 'VIIRS' },
  { key: 'N21', file: 'noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv', satellite: 'NOAA 21', norad: 54234, instrument: 'VIIRS' },
  { key: 'NPP', file: 'suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv', satellite: 'SUOMI NPP', norad: 37849, instrument: 'VIIRS' },
  { key: 'MODIS', file: 'modis-c6.1/csv/MODIS_C6_1_Global_24h.csv', satellite: 'TERRA / AQUA', norad: null, instrument: 'MODIS' },
];
// FIRMS "satellite" column → our satellite index in the compact array.
const SAT_CODE = { N20: 0, N: 2, N21: 1, 'NOAA-20': 0, T: 3, A: 4, Terra: 3, Aqua: 4 };
export const FIRE_SATS = ['NOAA 20', 'NOAA 21', 'SUOMI NPP', 'TERRA', 'AQUA'];
// NORAD IDs verified against the CelesTrak catalog (NOAA 20 (JPSS-1), NOAA 21 (JPSS-2), SUOMI NPP, TERRA, AQUA).
export const FIRE_SAT_NORAD = [43013, 54234, 37849, 25994, 27424];

const fireCache = createCache('firms', { ttlMs: 60 * 60_000 });
const quakeCache = createCache('usgs-feed', { ttlMs: 10 * 60_000 });
const eventCache = createCache('events', { ttlMs: 30 * 60_000 });
const nisarCache = createCache('nisar-recent', { ttlMs: 3 * 3600_000 });

function parseFirms(csv) {
  const lines = csv.split('\n');
  const head = lines[0].split(',');
  const ix = (n) => head.indexOf(n);
  const iLat = ix('latitude'), iLon = ix('longitude'), iFrp = ix('frp'), iDate = ix('acq_date'), iTime = ix('acq_time');
  const iSat = ix('satellite'), iConf = ix('confidence'), iDN = ix('daynight');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < head.length) continue;
    const t = c[iTime].padStart(4, '0');
    const ms = Date.parse(`${c[iDate]}T${t.slice(0, 2)}:${t.slice(2)}:00Z`);
    const conf = c[iConf];
    // VIIRS: l/n/h; MODIS: 0–100 → map to 0/1/2
    const confN = conf === 'h' ? 2 : conf === 'n' ? 1 : conf === 'l' ? 0 : Number(conf) >= 80 ? 2 : Number(conf) >= 30 ? 1 : 0;
    out.push([
      Math.round(Number(c[iLon]) * 1e4) / 1e4,
      Math.round(Number(c[iLat]) * 1e4) / 1e4,
      Math.round(Number(c[iFrp]) * 10) / 10,
      Math.round(ms / 60000), // epoch minutes
      SAT_CODE[c[iSat]] ?? 0,
      confN,
      c[iDN] === 'N' ? 1 : 0,
    ]);
  }
  return out;
}

export async function getFires() {
  const parts = await Promise.allSettled(
    FIRE_SOURCES.map((s) =>
      fireCache.get(s.key, async () => ({ body: parseFirms(await fetchText(`${FIRMS}/${s.file}`, { timeoutMs: 60000 })) })),
    ),
  );
  const fires = [];
  const perSource = {};
  let freshness = 'LIVE';
  parts.forEach((p, i) => {
    const s = FIRE_SOURCES[i];
    if (p.status === 'fulfilled') {
      fires.push(...p.value.body);
      perSource[s.key] = { count: p.value.body.length, freshness: p.value.state, fetchedAt: new Date(p.value.at).toISOString() };
      if (p.value.state !== 'LIVE') freshness = p.value.state;
    } else {
      perSource[s.key] = { count: 0, error: 'DATA TEMPORARILY UNAVAILABLE' };
    }
  });
  if (!fires.length) throw new Error('no fire feeds available');
  return {
    fields: ['lon', 'lat', 'frpMW', 'epochMinute', 'satIndex', 'confidence(0=low,1=nominal,2=high)', 'night'],
    satellites: FIRE_SATS,
    satelliteNorad: FIRE_SAT_NORAD,
    sources: FIRE_SOURCES.map(({ key, satellite, instrument, norad }) => ({ key, satellite, instrument, norad, ...perSource[key] })),
    fires,
    freshness,
    attribution: 'NASA FIRMS (LANCE/EOSDIS) — MODIS C6.1 & VIIRS C2 NRT active fire products',
  };
}

export async function getQuakes() {
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson';
  const hit = await quakeCache.get(url, async () => {
    const g = JSON.parse(await fetchText(url, { timeoutMs: 30000 }));
    return {
      body: g.features.map((f) => {
        const [lon, lat, depth] = f.geometry.coordinates;
        const p = f.properties;
        return [Math.round(lon * 1e3) / 1e3, Math.round(lat * 1e3) / 1e3, Math.round(depth), p.mag, p.time, f.id, p.place, p.tsunami ? 1 : 0, p.alert || null];
      }),
    };
  });
  return {
    fields: ['lon', 'lat', 'depthKm', 'mag', 'timeMs', 'id', 'place', 'tsunami', 'pagerAlert'],
    quakes: hit.body,
    freshness: hit.state,
    fetchedAt: new Date(hit.at).toISOString(),
    attribution: 'USGS Earthquake Hazards Program',
  };
}

function centroidOf(geom) {
  const pts = [];
  const walk = (c) => (typeof c[0] === 'number' ? pts.push(c) : c.forEach(walk));
  walk(geom.coordinates);
  const lon = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return [lon, lat];
}

export async function getEvents() {
  const eonetUrl = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=1000';
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const gdacsUrl = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF&fromDate=${from}&toDate=${to}`;
  const [eo, gd] = await Promise.allSettled([
    eventCache.get(eonetUrl, async () => ({ body: JSON.parse(await fetchText(eonetUrl, { timeoutMs: 30000 })) })),
    eventCache.get(gdacsUrl, async () => ({ body: JSON.parse(await fetchText(gdacsUrl, { timeoutMs: 30000 })) })),
  ]);
  const events = [];
  if (eo.status === 'fulfilled') {
    for (const e of eo.value.body.events || []) {
      const last = e.geometry?.at(-1);
      if (!last?.coordinates) continue;
      const [lon, lat] = last.type === 'Point' ? last.coordinates : centroidOf(last);
      events.push({
        id: `eonet:${e.id}`, source: 'NASA EONET', title: e.title, category: e.categories?.[0]?.id || 'other',
        categoryTitle: e.categories?.[0]?.title || 'Event', lon, lat, date: last.date,
        magnitude: last.magnitudeValue != null ? `${last.magnitudeValue} ${last.magnitudeUnit || ''}`.trim() : null,
        track: e.geometry.length > 1 && e.geometry.every((g) => g.type === 'Point') ? e.geometry.map((g) => g.coordinates) : null,
        url: e.sources?.[0]?.url || e.link, sources: (e.sources || []).map((s) => s.id),
      });
    }
  }
  const GD_CAT = { EQ: 'earthquakes', TC: 'severeStorms', FL: 'floods', VO: 'volcanoes', DR: 'drought', WF: 'wildfires' };
  if (gd.status === 'fulfilled') {
    for (const f of gd.value.body.features || []) {
      const p = f.properties;
      if (p.eventtype === 'WF' || p.eventtype === 'EQ') continue; // covered by FIRMS/EONET and USGS
      if (!f.geometry?.coordinates) continue;
      const [lon, lat] = f.geometry?.type === 'Point' ? f.geometry.coordinates : centroidOf(f.geometry);
      events.push({
        id: `gdacs:${p.eventtype}${p.eventid}`, source: 'GDACS', title: p.name || p.htmldescription, category: GD_CAT[p.eventtype] || 'other',
        categoryTitle: { TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought' }[p.eventtype] || p.eventtype,
        lon, lat, date: p.todate || p.fromdate, alert: p.alertlevel, country: p.country,
        magnitude: p.severitydata?.severitytext || null, url: p.url?.report || p.url?.details || 'https://www.gdacs.org',
      });
    }
  }
  if (!events.length) throw new Error('no event feeds available');
  return {
    events,
    freshness: eo.status === 'fulfilled' ? eo.value.state : 'STALE',
    sources: { eonet: eo.status === 'fulfilled' ? 'ok' : 'unavailable', gdacs: gd.status === 'fulfilled' ? 'ok' : 'unavailable' },
    attribution: 'NASA EONET · GDACS (EC JRC / UN OCHA)',
  };
}

// ---------- NISAR recent acquisitions via NASA CMR ----------
const NISAR_COLLECTIONS = [
  { type: 'GCOV', id: 'C2854338529-ASF', short: 'NISAR_L2_GCOV_PROVISIONAL_V1' },
  { type: 'GUNW', id: 'C2854335566-ASF', short: 'NISAR_L2_GUNW_PROVISIONAL_V1' },
];
const MAX_PAGES = 4; // ≤ 8,000 granules per collection per refresh

function compactGranule(e, coll) {
  const poly = (e.polygons?.[0]?.[0] || '').trim().split(/\s+/).map(Number);
  const ring = [];
  for (let i = 0; i + 1 < poly.length; i += 2) ring.push([Math.round(poly[i + 1] * 1e3) / 1e3, Math.round(poly[i] * 1e3) / 1e3]); // CMR is lat lon
  const name = e.producer_granule_id || e.title;
  const p = name.split('_');
  return {
    id: name,
    t: e.time_start,
    type: coll.type,
    dir: p[6] || null,
    track: Number(p[5]) || null,
    frame: Number(p[7]) || null,
    ring,
    coll: coll.short,
  };
}

async function cmrPages(coll, sinceIso) {
  const items = [];
  let searchAfter = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id=${coll.id}&temporal=${sinceIso},&page_size=2000&sort_key=-start_date`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(90000),
      headers: { 'User-Agent': 'earth-pulse/0.1', ...(searchAfter ? { 'CMR-Search-After': searchAfter } : {}) },
    });
    if (!res.ok) throw new Error(`CMR HTTP ${res.status}`);
    const json = await res.json();
    const entries = json.feed?.entry || [];
    for (const e of entries) items.push(compactGranule(e, coll));
    searchAfter = res.headers.get('cmr-search-after');
    if (!searchAfter || entries.length < 2000) break;
  }
  return items;
}

export async function getNisarRecent(days = 3) {
  const d = Math.max(1, Math.min(12, Math.round(days)));
  const since = new Date(Date.now() - d * 864e5);
  since.setUTCMinutes(0, 0, 0);
  const key = `recent-${d}-${since.toISOString().slice(0, 13)}`;
  const hit = await nisarCache.get(key, async () => {
    const parts = await Promise.all(NISAR_COLLECTIONS.map((c) => cmrPages(c, since.toISOString())));
    return { body: parts.flat().filter((g) => g.ring.length >= 3).sort((a, b) => (a.t < b.t ? -1 : 1)) };
  });
  return {
    days: d,
    since: since.toISOString(),
    granules: hit.body,
    freshness: hit.state,
    fetchedAt: new Date(hit.at).toISOString(),
    browseBase: 'https://nisar.asf.earthdatacloud.nasa.gov/BROWSE',
    attribution: 'NISAR (NASA/JPL-Caltech × ISRO) via NASA CMR / ASF DAAC — provisional products',
  };
}
