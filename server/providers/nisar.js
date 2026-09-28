// NISARDataProvider — real NISAR metadata from the ASF DAAC Search API.
//
// Upstream: https://api.daac.asf.alaska.edu/services/search/param (public, no
// credentials). Browse quick-looks under
// https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/ are public; full HDF5
// products require a NASA Earthdata login and are only ever LINKED, never
// downloaded by this server.
//
// Nothing here fabricates an acquisition: every observation returned is a
// normalized ASF record, and every field that ASF does not provide is null.
import { createCache, fetchText } from '../cache.js';
import { DATA_CLASS } from '../../src/core/dataClass.js';

const ASF_SEARCH = 'https://api.daac.asf.alaska.edu/services/search/param';
const BROWSE_HOST = 'nisar.asf.earthdatacloud.nasa.gov';
const PRODUCT_TYPES = ['RSLC', 'GSLC', 'GCOV', 'RIFG', 'RUNW', 'GUNW', 'ROFF', 'GOFF'];

// ASF asks clients to be gentle; searches change at most every few hours.
const searchCache = createCache('asf-search', { ttlMs: 3 * 3600_000 });
const browseCache = createCache('asf-browse', { ttlMs: 30 * 24 * 3600_000, binary: true });

/** Human-oriented descriptions of NISAR product types (from the NISAR product specs). */
export const PRODUCT_INFO = {
  RSLC: { level: 'L1', name: 'Range-Doppler Single Look Complex', plain: 'Raw-geometry radar image with phase, the starting point for most processing.' },
  GSLC: { level: 'L2', name: 'Geocoded Single Look Complex', plain: 'Radar image with phase, placed on a map grid.' },
  GCOV: { level: 'L2', name: 'Geocoded Polarimetric Covariance', plain: 'How strongly the surface reflects radar, per polarization, on a map grid. Good for water, crops, forests.' },
  RIFG: { level: 'L1', name: 'Range-Doppler Wrapped Interferogram', plain: 'Phase difference between two passes in radar geometry.' },
  RUNW: { level: 'L1', name: 'Range-Doppler Unwrapped Interferogram', plain: 'Continuous ground-motion signal in radar geometry.' },
  GUNW: { level: 'L2', name: 'Geocoded Unwrapped Interferogram', plain: 'How far the ground moved toward or away from the satellite between two passes, on a map grid.' },
  ROFF: { level: 'L1', name: 'Range-Doppler Pixel Offsets', plain: 'How far image features shifted between passes (large motions like glaciers).' },
  GOFF: { level: 'L2', name: 'Geocoded Pixel Offsets', plain: 'Large surface motions such as flowing ice, on a map grid.' },
};

function parseGranuleName(name) {
  const p = String(name).split('_');
  const out = { productType: p[3] ?? null, urgency: p[2] ?? null };
  const n = (x) => (x == null || Number.isNaN(Number(x)) ? null : Number(x));
  if (['GUNW', 'GOFF', 'RIFG', 'RUNW', 'ROFF'].includes(p[3])) {
    Object.assign(out, {
      referenceCycle: n(p[4]), track: n(p[5]), direction: p[6] ?? null, frame: n(p[7]),
      secondaryCycle: n(p[8]), mode: p[9] ?? null, polarization: p[10] ?? null,
      referenceStart: toIso(p[11]), secondaryStart: toIso(p[13]),
    });
  } else {
    Object.assign(out, {
      cycle: n(p[4]), track: n(p[5]), direction: p[6] ?? null, frame: n(p[7]),
      mode: p[8] ?? null, polarization: p[9] ?? null,
    });
  }
  return out;
}

function toIso(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(s || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

export function parseWktPolygon(wkt) {
  const m = /\(\((.*)\)\)/.exec(wkt || '');
  if (!m) return null;
  const pts = m[1].split(',').map((p) => p.trim().split(/\s+/).slice(0, 2).map(Number));
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  return pts;
}

/** Normalize one ASF jsonlite record into an EARTH//PULSE NISAR observation. */
export function normalizeAsfRecord(r) {
  const meta = parseGranuleName(r.granuleName);
  const nisar = r.nisar || {};
  const type = r.productType || meta.productType;
  const info = PRODUCT_INFO[type] || {};
  const browse = (r.browse || []).find((b) => b.endsWith('_LATLON.png')) || null;
  const thumb = (r.browse || []).find((b) => b.endsWith('_LATLON_thumbnail.png')) || null;
  return {
    id: r.granuleName,
    source: 'NISAR',
    mission: 'NASA × ISRO',
    dataClass: DATA_CLASS.REAL_NISAR,
    productType: type,
    productName: info.name || null,
    productPlain: info.plain || null,
    processingLevel: info.level || null,
    band: 'L', // ASF currently distributes the NASA L-band (L-SAR) products.
    instrument: r.instrument || 'L-SAR',
    acquisitionDate: r.startTime,
    acquisitionStop: r.stopTime || null,
    referenceDate: meta.referenceStart || null,
    secondaryDate: meta.secondaryStart || null,
    processingDate: null, // not exposed by ASF jsonlite; see the product's .iso.xml
    geometry: { type: 'Polygon', coordinates: [parseWktPolygon(r.wkt)] },
    orbit: {
      absoluteOrbit: r.orbit?.[0] ? Number(r.orbit[0]) : null,
      track: meta.track,
      frame: r.frame ?? meta.frame,
      direction: r.flightDirection || null,
      orbitType: nisar.orbitType || null,
      cycle: meta.cycle ?? meta.referenceCycle ?? null,
    },
    polarization: nisar.mainBandPolarization || null,
    sideBandPolarization: nisar.sideBandPolarization || null,
    rangeBandwidthMHz: nisar.rangeBandwidth || null,
    spatialResolution: null, // product-dependent; stated in the HDF5 metadata
    frameCoverage: nisar.frameCoverage || null,
    jointObservation: nisar.jointObservation ?? null,
    availability: /PROVISIONAL/.test(r.collectionName) ? 'PROVISIONAL' : /BETA/.test(r.collectionName) ? 'BETA' : 'RELEASED',
    collection: r.collectionName,
    conceptId: r.conceptID || null,
    pgeVersion: r.pgeVersion || null,
    crid: nisar.crid || null,
    downloadUrl: r.downloadUrl || null,
    downloadRequiresLogin: true,
    browseUrl: browse,
    thumbnailUrl: thumb,
    qaReportUrl: (nisar.additionalUrls || []).find((u) => u.endsWith('_QA_REPORT.pdf')) || null,
    sizeBytes: nisar.sizeMB?.[r.fileName]?.bytes ?? null,
    qualityFlags: {
      collection: /PROVISIONAL/.test(r.collectionName) ? 'provisional — not yet fully validated' : null,
      frameCoverage: nisar.frameCoverage || null,
    },
    uncertainty: null, // per-pixel uncertainty lives inside the HDF5 product
    provenance: {
      provider: 'ASF DAAC (Alaska Satellite Facility Distributed Active Archive Center)',
      endpoint: ASF_SEARCH,
      granule: r.granuleName,
      asfVertex: `https://search.asf.alaska.edu/#/?dataset=NISAR&searchType=List%20Search&searchList=${encodeURIComponent(r.granuleName)}`,
      citation: 'NISAR data courtesy of NASA/JPL-Caltech and ISRO, distributed by ASF DAAC.',
    },
  };
}

function buildQuery({ point, bbox, start, end, product, maxResults = 60 }) {
  const q = new URLSearchParams({ platform: 'NISAR', output: 'jsonlite', maxResults: String(maxResults) });
  if (point) q.set('intersectsWith', `POINT(${point.lon} ${point.lat})`);
  else if (bbox) {
    const [w, s, e, n] = bbox;
    q.set('intersectsWith', `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`);
  }
  if (start) q.set('start', start);
  if (end) q.set('end', end);
  if (product) q.set('processingLevel', product);
  return `${ASF_SEARCH}?${q}`;
}

async function search(params) {
  const url = buildQuery(params);
  const hit = await searchCache.get(url, async () => {
    const text = await fetchText(url, { timeoutMs: 25000 });
    const json = JSON.parse(text);
    if (!Array.isArray(json.results)) throw new Error('unexpected ASF response');
    return { body: json.results };
  });
  const observations = hit.body.map(normalizeAsfRecord).sort((a, b) => (a.acquisitionDate < b.acquisitionDate ? 1 : -1));
  return { observations, freshness: hit.state, fetchedAt: new Date(hit.at).toISOString(), query: url };
}

export const NISARDataProvider = {
  productTypes: PRODUCT_TYPES,
  searchByLocation: (lat, lon, opts = {}) => search({ point: { lat, lon }, ...opts }),
  searchByBoundingBox: (bbox, opts = {}) => search({ bbox, ...opts }),
  searchByDateRange: (start, end, opts = {}) => search({ start, end, ...opts }),

  /** Acquisition timeline at a location: unique pass dates, newest first. */
  async getAcquisitions(lat, lon, opts = {}) {
    const res = await search({ point: { lat, lon }, maxResults: 250, ...opts });
    const passes = new Map();
    for (const o of res.observations) {
      const key = `${o.acquisitionDate.slice(0, 16)}|${o.orbit.track}|${o.orbit.direction}`;
      if (!passes.has(key)) passes.set(key, { date: o.acquisitionDate, track: o.orbit.track, frame: o.orbit.frame, direction: o.orbit.direction, products: [] });
      passes.get(key).products.push(o.productType);
    }
    return { ...res, passes: [...passes.values()] };
  },

  async getProductMetadata(id) {
    if (!/^NISAR_[A-Z0-9_]+$/.test(id)) throw new Error('invalid granule id');
    const url = `${ASF_SEARCH}?${new URLSearchParams({ granule_list: id, output: 'jsonlite' })}`;
    const hit = await searchCache.get(url, async () => ({ body: JSON.parse(await fetchText(url)).results }));
    const rec = hit.body[0];
    if (!rec) return null;
    return { observation: normalizeAsfRecord(rec), freshness: hit.state };
  },

  /** Proxy + cache a public browse image (restricted to the NISAR browse host). */
  async getProductPreview(browseUrl) {
    const u = new URL(browseUrl);
    if (u.hostname !== BROWSE_HOST || !u.pathname.startsWith('/BROWSE/') || !/\.png$/.test(u.pathname))
      throw new Error('only NISAR browse PNGs can be proxied');
    return browseCache.get(u.toString(), async () => {
      const res = await fetch(u, { signal: AbortSignal.timeout(60000), redirect: 'follow' });
      if (!res.ok) throw new Error(`browse HTTP ${res.status}`);
      return { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'image/png' };
    });
  },

  /** Footprints of recent acquisitions near a point (for coverage display). */
  async getCoverage(lat, lon, opts = {}) {
    const res = await search({ point: { lat, lon }, product: 'GCOV', maxResults: 40, ...opts });
    return {
      ...res,
      footprints: res.observations.map((o) => ({ id: o.id, date: o.acquisitionDate, direction: o.orbit.direction, track: o.orbit.track, geometry: o.geometry })),
    };
  },

  /**
   * Repeat-pass stacks at a point: GCOV granules grouped by track/direction/frame/mode,
   * keeping only products whose browse image is public (PROVISIONAL collections).
   * The Change Engine compares two dates of ONE stack, so geometry matches.
   */
  async getStacks(lat, lon, { days = 90 } = {}) {
    const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const res = await search({ point: { lat, lon }, product: 'GCOV', start, maxResults: 250 });
    const groups = new Map();
    for (const o of res.observations) {
      if (o.availability !== 'PROVISIONAL' || !o.browseUrl) continue;
      const p = o.id.split('_');
      const key = `${p[5]}_${p[6]}_${p[7]}_${p[8]}`;
      if (!groups.has(key)) groups.set(key, { key, track: Number(p[5]), direction: p[6], frame: Number(p[7]), mode: p[8], dates: new Map() });
      const day = o.acquisitionDate.slice(0, 10);
      const g = groups.get(key);
      const prev = g.dates.get(day);
      if (!prev || o.id > prev.id) {
        g.dates.set(day, {
          id: o.id, t: o.acquisitionDate, coll: o.collection, browseUrl: o.browseUrl, ring: o.geometry.coordinates[0],
          polarization: o.polarization, frameCoverage: o.frameCoverage, orbit: o.orbit.absoluteOrbit,
        });
      }
    }
    const stacks = [...groups.values()]
      .map((g) => ({ ...g, dates: [...g.dates.values()].sort((a, b) => (a.t < b.t ? -1 : 1)) }))
      .filter((g) => g.dates.length >= 2)
      .sort((a, b) => b.dates.length - a.dates.length || (a.dates.at(-1).t < b.dates.at(-1).t ? 1 : -1));
    return { stacks, freshness: res.freshness, fetchedAt: res.fetchedAt };
  },

  /** Observation geometry facts that follow from the orbit + footprint. */
  getObservationGeometry(observation) {
    return {
      lookSide: 'left',
      lookSideBasis: 'Derived: ASF footprint centroids lie ~530–570 km LEFT of the CelesTrak-propagated ground track for ascending and descending passes (see SCIENCE_MODEL.md).',
      swathWidthKm: 242,
      swathWidthBasis: 'NASA NISAR mission specification (≈240 km swath).',
      direction: observation?.orbit?.direction ?? null,
    };
  },
};
