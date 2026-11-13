// EARTH//PULSE API — Vite middleware plugin (dev + preview servers).
// All upstream access happens here; no provider credentials reach the browser.
import path from 'node:path';
import zlib from 'node:zlib';
import { promises as fsp } from 'node:fs';
import { NISARDataProvider } from './providers/nisar.js';
import { getGroup, getByNorad, ALLOWED_GROUPS } from './providers/space.js';
import { geocode, getEpic } from './providers/context.js';
import { getFires, getEvents, getNisarRecent } from './providers/live.js';
import { getVitals } from './providers/vitals.js';
import { getOutlook } from './providers/outlook.js';
import { getRiskAt, getRiskMap, getSignalSeries, getFireDensity } from './providers/risk.js';
import { getPulse } from './providers/pulse.js';
import { STORIES, storyById } from '../src/core/stories.js';
import { resolveStory } from '../src/core/storyModel.js';

const STORY_DIR = path.join(process.cwd(), 'public', 'data', 'stories');

function send(res, status, body, extra = {}) {
  if (res.headersSent) return;
  const isBuf = Buffer.isBuffer(body);
  let payload = isBuf ? body : Buffer.from(JSON.stringify(body));
  const headers = {
    'Content-Type': isBuf ? extra.type || 'application/octet-stream' : 'application/json; charset=utf-8',
    'Cache-Control': extra.cache || 'no-store',
    ...(extra.headers || {}),
  };
  if (!isBuf && payload.length > 8192 && /gzip/.test(res.req?.headers['accept-encoding'] || '')) {
    payload = zlib.gzipSync(payload, { level: 6 });
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  res.writeHead(status, headers);
  res.end(payload);
}

const num = (v) => (v == null || v === '' ? NaN : Number(v));
const validLatLon = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
const validDate = (d) => !d || /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(d);

async function readManifest(id) {
  try {
    return JSON.parse(await fsp.readFile(path.join(STORY_DIR, id, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function buildStory(id) {
  const story = storyById(id);
  if (!story) return null;
  const manifest = await readManifest(id);
  // Event context (e.g. the Kumamoto earthquake time) is stored with the story, not fetched.
  return resolveStory(story, manifest, { contextEvent: story.contextEvent?.event || null, freshness: 'ARCHIVED' });
}

// Tiny router: [method, pattern, handler(params, query)]
const routes = [
  ['GET', /^\/api\/status$/, async () => ({ ok: true, time: new Date().toISOString(), stories: STORIES.length })],

  ['GET', /^\/api\/locations\/search$/, async (_, q) => geocode(q.get('q'))],

  ['GET', /^\/api\/earth-changes$/, async () => {
    const list = await Promise.all(
      STORIES.map(async (s) => {
        const m = await readManifest(s.id);
        return {
          id: s.id, humanTitle: s.humanTitle, scientificTerm: s.scientificTerm, phenomenon: s.phenomenon,
          location: s.location, tagline: s.tagline, featured: !!s.featured,
          available: !!m?.frames?.length, frames: m?.frames?.length || 0,
          dataClass: m?.frames?.length ? 'REAL_NISAR' : 'DEMO',
          firstDate: m?.frames?.[0]?.acquisitionStart || null, lastDate: m?.frames?.at(-1)?.acquisitionStart || null,
        };
      }),
    );
    return { stories: list };
  }],

  ['GET', /^\/api\/(?:earth-changes|story)\/([a-z0-9-]+)$/, async ([id]) => {
    const s = await buildStory(id);
    if (!s) throw Object.assign(new Error('story not found'), { status: 404 });
    return s;
  }],

  ['GET', /^\/api\/provenance\/([a-z0-9-]+)$/, async ([id]) => {
    const s = await buildStory(id);
    if (!s) throw Object.assign(new Error('story not found'), { status: 404 });
    return { id, dataClass: s.dataClass, sources: s.sources, provenance: s.provenance, observations: s.observations, derived: s.evidence?.derived || null };
  }],

  ['GET', /^\/api\/nisar\/search$/, async (_, q) => {
    const lat = num(q.get('lat')), lon = num(q.get('lon'));
    const start = q.get('start') || undefined, end = q.get('end') || undefined;
    const product = q.get('product') || undefined;
    if (!validDate(start) || !validDate(end)) throw Object.assign(new Error('bad date'), { status: 400 });
    if (product && !NISARDataProvider.productTypes.includes(product)) throw Object.assign(new Error('bad product'), { status: 400 });
    if (q.get('bbox')) {
      const bbox = q.get('bbox').split(',').map(Number);
      if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) throw Object.assign(new Error('bad bbox'), { status: 400 });
      return NISARDataProvider.searchByBoundingBox(bbox, { start, end, product, maxResults: Math.min(250, Number(q.get('max')) || 60) });
    }
    if (!validLatLon(lat, lon)) throw Object.assign(new Error('lat/lon required'), { status: 400 });
    return NISARDataProvider.searchByLocation(lat, lon, { start, end, product, maxResults: Math.min(250, Number(q.get('max')) || 60) });
  }],

  ['GET', /^\/api\/nisar\/observations$/, async (_, q) => {
    const lat = num(q.get('lat')), lon = num(q.get('lon'));
    if (!validLatLon(lat, lon)) throw Object.assign(new Error('lat/lon required'), { status: 400 });
    return NISARDataProvider.getAcquisitions(lat, lon);
  }],

  ['GET', /^\/api\/nisar\/products\/(NISAR_[A-Z0-9_]+)$/, async ([id]) => {
    const r = await NISARDataProvider.getProductMetadata(id);
    if (!r) throw Object.assign(new Error('product not found'), { status: 404 });
    return { ...r, geometry: NISARDataProvider.getObservationGeometry(r.observation) };
  }],

  ['GET', /^\/api\/nisar\/browse$/, async (_, q, res) => {
    let hit;
    try { new URL(q.get('url') || ''); } catch { throw Object.assign(new Error('bad url'), { status: 400 }); }
    if (!/^https:\/\/nisar\.asf\.earthdatacloud\.nasa\.gov\/BROWSE\/.+\.png$/.test(q.get('url'))) throw Object.assign(new Error('only NISAR browse PNGs can be proxied'), { status: 400 });
    hit = await NISARDataProvider.getProductPreview(q.get('url'));
    send(res, 200, hit.body, { type: 'image/png', cache: 'public, max-age=86400', headers: { 'x-pulse-freshness': hit.state } });
    return undefined;
  }],

  ['GET', /^\/api\/change\/stacks$/, async (_, q) => {
    const lat = num(q.get('lat')), lon = num(q.get('lon'));
    if (!validLatLon(lat, lon)) throw Object.assign(new Error('lat/lon required'), { status: 400 });
    return NISARDataProvider.getStacks(lat, lon, { days: Math.min(365, Number(q.get('days')) || 90) });
  }],

  ['GET', /^\/api\/coverage$/, async (_, q) => {
    const lat = num(q.get('lat')), lon = num(q.get('lon'));
    if (!validLatLon(lat, lon)) throw Object.assign(new Error('lat/lon required'), { status: 400 });
    return NISARDataProvider.getCoverage(lat, lon);
  }],

  ['GET', /^\/api\/satellites$/, async (_, q) => {
    const group = q.get('group') || 'resource';
    if (!ALLOWED_GROUPS.includes(group)) throw Object.assign(new Error('group not allowed'), { status: 400 });
    return getGroup(group);
  }],
  ['GET', /^\/api\/satellites\/(\d{1,6})$/, async ([id]) => getByNorad(id)],
  // Passes are computed in the browser from the TLE (satellite.js); the route
  // returns the TLE and states that explicitly rather than inventing a schedule.
  ['GET', /^\/api\/satellites\/(\d{1,6})\/passes$/, async ([id]) => ({ ...(await getByNorad(id)), note: 'Pass times are propagated client-side from this TLE with SGP4 (satellite.js). They are predictions of geometry, not acquisition plans.' })],

  // ---------- LIVING EARTH ----------
  ['GET', /^\/api\/live\/fires$/, async () => getFires()],
  ['GET', /^\/api\/live\/events$/, async () => getEvents()],
  ['GET', /^\/api\/live\/fires\/density$/, async () => getFireDensity()],
  ['GET', /^\/api\/live\/nisar$/, async (_, q) => getNisarRecent(Number(q.get('days')) || 3)],

  // ---------- THE STORY (vital signs, signals, risk index, impact calculator) ----------
  ['GET', /^\/api\/vitals$/, async () => getVitals()],
  ['GET', /^\/api\/epic$/, async () => getEpic()],
  ['GET', /^\/api\/outlook$/, async (_, q) => {
    const lat = num(q.get('lat')), lon = num(q.get('lon'));
    if (!validLatLon(lat, lon)) throw Object.assign(new Error('lat/lon required'), { status: 400 });
    return getOutlook(lat, lon);
  }],
  ['GET', /^\/api\/signals$/, async (_, q) => {
    const lat = num(q.get('lat')), lon = num(q.get('lon'));
    const start = q.get('start') || '', end = q.get('end') || '';
    if (!validLatLon(lat, lon)) throw Object.assign(new Error('lat/lon required'), { status: 400 });
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end) || end < start || Number(end.slice(0, 4)) - Number(start.slice(0, 4)) > 1) throw Object.assign(new Error('start/end must be YYYYMMDD, at most a year apart'), { status: 400 });
    return getSignalSeries(lat, lon, start, end);
  }],
  ['GET', /^\/api\/risk$/, async (_, q) => {
    const lat = num(q.get('lat')), lon = num(q.get('lon'));
    if (!validLatLon(lat, lon)) throw Object.assign(new Error('lat/lon required'), { status: 400 });
    return getRiskAt(lat, lon, (q.get('name') || '').slice(0, 80) || null);
  }],
  ['GET', /^\/api\/risk\/map$/, async () => getRiskMap()],
  ['GET', /^\/api\/pulse$/, async (_, q) => {
    const lat = num(q.get('lat')), lon = num(q.get('lon'));
    if (!validLatLon(lat, lon)) throw Object.assign(new Error('lat/lon required'), { status: 400 });
    return getPulse(lat, lon, (q.get('name') || '').slice(0, 80) || null);
  }],
];

/** Connect-style handler for every /api/* route (used by Vite and by server/prod.js). */
export async function handleApi(req, res, next) {
  if (!req.url?.startsWith('/api/')) return next();
  const url = new URL(req.url, 'http://local');
  const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
  if (!route) return send(res, 404, { error: 'not found' });
  try {
    const params = route[1].exec(url.pathname).slice(1);
    const out = await route[2](params, url.searchParams, res);
    if (out !== undefined) send(res, 200, out);
  } catch (e) {
    const status = e.status || 502;
    send(res, status, { error: status === 502 ? 'DATA TEMPORARILY UNAVAILABLE' : e.message, detail: e.message });
  }
}

/** Warm the live caches so the first visitor sees a living planet quickly. */
export function warmCaches() {
  setTimeout(() => {
    for (const f of [getEvents, () => getNisarRecent(3), getFires, getVitals]) f().catch(() => {});
  }, 500);
}

export function earthPulseApi() {
  const install = (server) => {
    warmCaches();
    server.middlewares.use(handleApi);
  };
  return { name: 'earth-pulse-api', configureServer: install, configurePreviewServer: install };
}
