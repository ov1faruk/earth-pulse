import { DATA_CLASS_LABEL, FRESHNESS_LABEL } from '../core/dataClass.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Data-class badge. Labels come only from the machine-readable class. */
export function tag(dataClass, extra = '') {
  const l = DATA_CLASS_LABEL[dataClass] || DATA_CLASS_LABEL.DEMO;
  return `<span class="tag ${l.tone}" title="${esc(l.long)}">${esc(extra || l.short)}</span>`;
}

export function freshnessPill(freshness, what = '') {
  const cls = { LIVE: 'live', CACHED: 'live', STALE: 'stale', ARCHIVED: 'archived', DEMO: 'demo', UNAVAILABLE: 'unavailable' }[freshness] || 'archived';
  const label = FRESHNESS_LABEL[freshness] || freshness;
  return `<span class="pill ${cls}"><span class="dot"></span>${esc(label)}${what ? ' ' + esc(what) : ''}</span>`;
}

export function fmtDate(iso, { time = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  const s = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
  return time ? `${s} · ${d.toISOString().slice(11, 16)} UTC` : s;
}

export function fmtCoord(lat, lon, dp = 2) {
  return `${Math.abs(lat).toFixed(dp)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(dp)}° ${lon >= 0 ? 'E' : 'W'}`;
}

let toastTimer;
export function toast(msg, ms = 3200) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function show(el, on = true) {
  el.hidden = !on;
}
