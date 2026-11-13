// Small dependency-free SVG charts for the story page.
// (Written with AI assistance — see README → AI disclosure.)
import { esc } from '../ui/dom.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

function niceTicks(min, max, n = 5) {
  const span = max - min || 1;
  const step0 = 10 ** Math.floor(Math.log10(span / n));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * step0).find((s) => span / s <= n) || step0 * 10;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/**
 * Line chart with hover read-out.
 * series: [{ label, color, points: [[x, y], …], dashed?, area?, width?, dots? }]
 * bands:  [{ color, points: [[x, lo, hi], …] }]  (uncertainty ranges)
 * marks:  [{ x, label, color? }]                 (vertical event markers)
 */
export function lineChart(host, { series, bands = [], marks = [], height = 300, xFmt = (v) => String(Math.round(v)), yFmt = (v) => String(v), yLabel = '', zero = false, xDomain, yDomain, xTicks }) {
  host.innerHTML = '';
  host.classList.add('chart');
  const W = Math.max(320, host.clientWidth || 720), H = height;
  const m = { l: 46, r: 16, t: 14, b: 28 };
  const all = series.flatMap((s) => s.points).concat(bands.flatMap((b) => b.points.flatMap((p) => [[p[0], p[1]], [p[0], p[2]]])));
  if (!all.length) { host.innerHTML = '<p class="chart-empty">No data</p>'; return; }
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const [x0, x1] = xDomain || [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = yDomain || [Math.min(...ys), Math.max(...ys)];
  if (!yDomain) { const pad = (y1 - y0) * 0.08 || 1; y0 -= pad; y1 += pad; if (zero) y0 = Math.min(0, y0); }
  const X = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const Y = (v) => H - m.b - ((v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' }, host);

  for (const t of niceTicks(y0, y1)) {
    el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? 'grid zero' : 'grid' }, svg);
    el('text', { x: m.l - 8, y: Y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, svg).textContent = yFmt(t);
  }
  for (const t of xTicks || niceTicks(x0, x1, W < 520 ? 4 : 7)) {
    if (t < x0 || t > x1) continue;
    el('text', { x: X(t), y: H - 8, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = xFmt(t);
  }
  if (yLabel) el('text', { x: m.l, y: 10, class: 'tick ylabel' }, svg).textContent = yLabel;

  for (const b of bands) {
    const up = b.points.map((p) => `${X(p[0])},${Y(p[2])}`), dn = b.points.slice().reverse().map((p) => `${X(p[0])},${Y(p[1])}`);
    el('polygon', { points: up.concat(dn).join(' '), fill: b.color, opacity: 0.16 }, svg);
  }
  for (const mk of marks) {
    el('line', { x1: X(mk.x), x2: X(mk.x), y1: m.t, y2: H - m.b, class: 'mark', stroke: mk.color || '#ff5fa2' }, svg);
    el('text', { x: X(mk.x) + 5, y: m.t + 10, class: 'mark-label', fill: mk.color || '#ff5fa2' }, svg).textContent = mk.label;
  }
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    if (s.area) el('path', { d: `${d}L${X(s.points.at(-1)[0])},${Y(Math.max(y0, 0))}L${X(s.points[0][0])},${Y(Math.max(y0, 0))}Z`, fill: s.color, opacity: 0.14 }, svg);
    if (s.bars) {
      const bw = Math.max(1.5, ((W - m.l - m.r) / s.points.length) * 0.7);
      for (const p of s.points) el('rect', { class: 'grow', x: X(p[0]) - bw / 2, y: Y(p[1]), width: bw, height: Math.max(0, Y(Math.max(y0, 0)) - Y(p[1])), fill: s.color, opacity: 0.85, rx: 1 }, svg);
    } else {
      const path = el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      if (s.dashed) path.setAttribute('stroke-dasharray', '5 5');
      else { path.setAttribute('pathLength', '1'); path.setAttribute('class', 'draw'); }
      if (s.dots) for (const p of s.points) el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3.2, fill: s.color }, svg);
    }
  }

  // Hover read-out: nearest x across all series.
  const cross = el('line', { y1: m.t, y2: H - m.b, class: 'cross', visibility: 'hidden' }, svg);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.appendChild(tip);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.touches?.[0]?.clientX ?? ev.clientX) - r.left) * (W / r.width);
    const xv = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
    const rows = [];
    let snap = null;
    for (const s of series) {
      if (s.noTip) continue;
      const p = s.points.reduce((a, b) => (Math.abs(b[0] - xv) < Math.abs(a[0] - xv) ? b : a));
      if (Math.abs(p[0] - xv) > (x1 - x0) * 0.06) continue;
      snap ??= p[0];
      rows.push(`<span><i style="background:${s.color}"></i>${esc(s.label)}</span><b>${esc(yFmt(p[1]))}</b>`);
    }
    if (!rows.length) { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); return; }
    cross.setAttribute('x1', X(snap)); cross.setAttribute('x2', X(snap)); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<em>${esc(xFmt(snap))}</em>${rows.join('')}`;
    tip.hidden = false;
    const left = (X(snap) / W) * r.width;
    tip.style.left = `${Math.min(r.width - 170, Math.max(0, left + 12))}px`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}

/** Legend row under a chart. */
export function legend(items) {
  return `<div class="chart-legend">${items.map((i) => `<span><i style="background:${i.color};${i.dashed ? 'opacity:.6' : ''}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}

/** "Warming stripes": one bar per year, coloured by anomaly (blue → red). */
export function stripes(host, annual, { onHover } = {}) {
  host.innerHTML = '';
  const max = Math.max(...annual.map((a) => Math.abs(a[1])));
  const color = (v) => {
    const t = Math.max(-1, Math.min(1, v / max));
    const c = t < 0 ? [8 + 60 * (1 + t), 48 + 120 * (1 + t), 107 + 120 * (1 + t)] : [190 + 65 * t - 120 * Math.max(0, t - 0.6), 190 - 175 * t, 190 - 170 * t];
    return `rgb(${c.map((x) => Math.round(Math.max(0, Math.min(255, x)))).join(',')})`;
  };
  for (const [y, v] of annual) {
    const b = document.createElement('i');
    b.style.background = color(v);
    b.title = `${y}: ${v > 0 ? '+' : ''}${v.toFixed(2)} °C`;
    b.addEventListener('pointerenter', () => onHover?.(y, v));
    host.appendChild(b);
  }
}

/** Horizontal 0–100 bar used for risk signals. */
export function scoreBar(score, color) {
  return `<span class="bar"><span style="width:${Math.max(2, score)}%;background:${color}"></span></span>`;
}

/** Animate a number counting up when it first becomes visible. */
export function countUp(node, to, { decimals = 0, prefix = '', suffix = '', ms = 1400 } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (v) => prefix + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  if (reduce) { node.textContent = fmt(to); return; }
  const t0 = performance.now();
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    node.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
