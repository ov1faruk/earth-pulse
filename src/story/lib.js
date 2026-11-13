// Shared helpers for the story page: data access with the same fallback
// hierarchy as the globe (LIVE → CACHED → STALE → ARCHIVED → UNAVAILABLE),
// provenance lines, and "how we calculated this" blocks.
// (Written with AI assistance — see README → AI disclosure.)
import { esc } from '../ui/dom.js';
import { SOURCES } from './data.js';

export { esc };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export async function getJson(url, { timeout = 25000 } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Try the live API first; if it is unreachable, use the dated snapshot shipped with the app. */
export async function liveOrArchived(apiUrl, staticUrl, opts) {
  try {
    return await getJson(apiUrl, opts);
  } catch (e) {
    if (!staticUrl) throw e;
    const data = await getJson(staticUrl, { timeout: 15000 });
    return { ...data, freshness: 'ARCHIVED' };
  }
}

const PILL = {
  LIVE: ['live', 'LIVE'], CACHED: ['live', 'LIVE'], STALE: ['stale', 'STALE COPY'], ARCHIVED: ['archived', 'ARCHIVED SNAPSHOT'],
  DERIVED: ['derived', 'DERIVED'], UNAVAILABLE: ['unavailable', 'UNAVAILABLE'], RESEARCH: ['archived', 'PUBLISHED FIGURES'], SIMULATED: ['derived', 'SCENARIO'],
};
export function pill(freshness, extra = '') {
  const [cls, label] = PILL[freshness] || PILL.ARCHIVED;
  return `<span class="pill ${cls}"><span class="dot"></span>${label}${extra ? ` · ${esc(extra)}` : ''}</span>`;
}

export const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
export const fmtYmd = (s) => fmtDay(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
export const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
export function fmtUsd(v) {
  if (v >= 1e9) return `US$${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)} billion`;
  if (v >= 1e6) return `US$${(v / 1e6).toFixed(0)} million`;
  return `US$${fmtInt(v)}`;
}
export function ago(ms) {
  const m = Math.max(0, (Date.now() - ms) / 60000);
  if (m < 60) return `${Math.round(m)} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

/** Source line: freshness pill + linked sources. `keys` are SOURCES ids or {label,url}. */
export function srcLine(keys, { freshness, date, extra } = {}) {
  const links = [].concat(keys).filter(Boolean).map((k) => {
    const s = typeof k === 'string' ? SOURCES[k] : k;
    return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc((s.short || s.label || s.name).split(' — ')[0])}</a>` : '';
  }).join(' · ');
  return `<div class="src">${freshness ? pill(freshness, date) : ''}<span>Source: ${links}</span>${extra ? `<span>${extra}</span>` : ''}</div>`;
}

/** Collapsible "How we calculated this". */
export function how(html, label = 'How we calculated this') {
  return `<details class="how"><summary>${esc(label)}</summary>${html}</details>`;
}

export function errorBox(what, detail = '') {
  return `<div class="error" role="status"><strong>${esc(what)} is unavailable right now.</strong> Nothing is substituted in its place.${detail ? ` <span>${esc(detail)}</span>` : ''}</div>`;
}

/** Run `fn` once, the first time `node` approaches the viewport. */
export function whenNear(node, fn, margin = '700px') {
  if (!node) return;
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); Promise.resolve().then(fn).catch((e) => console.error(e)); }
  }, { rootMargin: margin });
  io.observe(node);
}

/** NASA Worldview Snapshots: a real image for a date, layer set and box [south, west, north, east]. */
export function snapshotUrl({ box, date, layers, width = 900, height = 675 }) {
  const qs = new URLSearchParams({ REQUEST: 'GetSnapshot', CRS: 'EPSG:4326', FORMAT: 'image/jpeg', WIDTH: width, HEIGHT: height, BBOX: box.join(','), TIME: date, LAYERS: layers });
  return `https://wvs.earthdata.nasa.gov/api/v1/snapshot?${qs}`;
}
export function worldviewUrl({ box, date, layers }) {
  const [s, w, n, e] = box;
  return `https://worldview.earthdata.nasa.gov/?v=${w},${s},${e},${n}&l=${layers.split(',').reverse().join(',')}&t=${date}`;
}
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
