// Chapters 4–5: the ripple effect and the Nepal case study.
// The NISAR change map is computed in the browser from two real browse images
// with the same change engine the globe uses (src/core/changeEngine.js).
// (Written with AI assistance — see README → AI disclosure.)
import { $, esc, srcLine, how, pill, fmtDay, fmtInt } from './lib.js';
import { NEPAL, RIPPLE } from './data.js';
import { countUp } from './charts.js';
import { computeChange, changeToRGBA } from '../core/changeEngine.js';
import { loadBrowse } from '../globe/browse.js';

// ---------- 04 ripple ----------
export function initRipple() {
  const host = $('#ripple');
  let idx = 0, timer = null, auto = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  host.innerHTML = `<div class="ripple-steps" role="tablist">${RIPPLE.map((r, k) => `<button class="ripple-step" role="tab" data-k="${k}" style="--c:${r.color}"><i></i><span>${esc(r.label)}</span></button>`).join('')}</div>
    <div><div class="ripple-stage" id="ripple-stage" role="tabpanel"></div>
    ${srcLine(['wiki_nepal', 'un_nepal'], { freshness: 'RESEARCH', date: 'compiled 13 Nov 2026' })}
    ${how('<p>Each figure is quoted from the public record of the flood, which compiles reports from Nepal\'s NDRRMA and ministries, UNDP, UNICEF, the Asian Development Bank, the World Bank and the ILO. Rupee amounts are shown with the US-dollar conversions given in those reports. Figures were still being revised in November 2026. Nothing here is modelled.</p>', 'Where these figures come from')}</div>`;
  const stage = $('#ripple-stage');
  const show = (k) => {
    idx = (k + RIPPLE.length) % RIPPLE.length;
    const r = RIPPLE[idx];
    host.querySelectorAll('.ripple-step').forEach((b, j) => { b.classList.toggle('on', j === idx); b.classList.toggle('done', j < idx); b.setAttribute('aria-selected', j === idx); });
    stage.style.setProperty('--c', r.color);
    stage.innerHTML = `<div class="tag-line">${String(idx + 1).padStart(2, '0')} / ${String(RIPPLE.length).padStart(2, '0')} · ${esc(r.label)}</div><h3>${esc(r.lead)}</h3>
      <div class="facts">${r.facts.map((f) => `<div class="fact"><b>${esc(f[0])}</b><span>${esc(f[1])}</span></div>`).join('')}</div>
      <div class="ripple-ctl"><button class="btn small" data-a="prev">← Back</button><button class="btn small" data-a="next">${idx === RIPPLE.length - 1 ? 'Start again' : `Next: ${esc(RIPPLE[idx + 1].label)}`} →</button><button class="btn small" data-a="auto" aria-pressed="${auto}">${auto ? 'Pause' : 'Auto-play'}</button></div>`;
  };
  const tick = () => { clearInterval(timer); if (auto) timer = setInterval(() => show(idx + 1), 6500); };
  host.addEventListener('click', (e) => {
    const s = e.target.closest('.ripple-step'), a = e.target.closest('[data-a]')?.dataset.a;
    if (s) { show(Number(s.dataset.k)); auto = false; }
    if (a === 'prev') { show(idx - 1); auto = false; }
    if (a === 'next') { show(idx + 1); auto = false; }
    if (a === 'auto') auto = !auto;
    if (s || a) { show(idx); tick(); }
  });
  show(0);
  // Only auto-advance while the chapter is on screen.
  new IntersectionObserver(([e]) => { if (e.isIntersecting) tick(); else clearInterval(timer); }, { threshold: 0.25 }).observe(host);
}

// ---------- 05 before / after ----------
function beforeAfter() {
  const host = $('#ba');
  let view = NEPAL.views[0], zoom = 1;
  $('#ba-views').innerHTML = NEPAL.views.map((v, k) => `<button data-v="${k}" aria-pressed="${k === 0}">${esc(v.label)}</button>`).join('') + '<button data-v="cloud" aria-pressed="false">24 Aug: what optical saw</button>';
  const render = (cloud = false) => {
    const b = cloud ? '/data/story/nepal/overview_2026-08-24.jpg' : `/data/story/nepal/${view.id}_${view.before}.jpg`;
    const a = `/data/story/nepal/${cloud ? 'overview' : view.id}_${view.after}.jpg`;
    host.innerHTML = `<div class="ba-inner"><img src="${b}" alt="Satellite image before the flood" /><img class="after" src="${a}" alt="Satellite image after the flood" /></div>
      <div class="ba-divider"></div><span class="ba-tag l">${cloud ? '24 AUG 2026 · 2 DAYS BEFORE' : `BEFORE · ${fmtDay(view.before).toUpperCase()}`}</span><span class="ba-tag r">AFTER · ${fmtDay(view.after).toUpperCase()}</span>
      <div class="ba-zoom"><button data-z="-1" aria-label="Zoom out">−</button><button data-z="1" aria-label="Zoom in">+</button></div>`;
    host.style.setProperty('--split', '50%');
    zoom = 1;
    $('#ba-note').innerHTML = srcLine(['hls', 'gibs'], { freshness: 'ARCHIVED', date: 'images saved 13 Nov 2026' })
      + how(`<p>Harmonized Landsat Sentinel-2 true-colour images (30 m) from NASA GIBS, for ${esc(view.box)}. ${cloud ? 'On 24 August, two days before the collapse, monsoon cloud hid most of the valley — the reason radar matters here.' : 'The "before" image is from the same season a year earlier, because the monsoon months before the event were cloudy. Drag the divider: the pale band is the river channel scoured and widened by the debris flow.'} The images are unprocessed apart from GIBS's standard rendering.</p>`, 'About these images');
  };
  const setSplit = (clientX) => { const r = host.getBoundingClientRect(); host.style.setProperty('--split', `${Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))}%`); };
  let dragging = false;
  host.addEventListener('pointerdown', (e) => { if (e.target.closest('.ba-zoom')) return; dragging = true; host.setPointerCapture(e.pointerId); setSplit(e.clientX); });
  host.addEventListener('pointermove', (e) => { if (dragging) setSplit(e.clientX); });
  host.addEventListener('pointerup', () => { dragging = false; });
  host.addEventListener('click', (e) => {
    const z = e.target.closest('[data-z]');
    if (!z) return;
    zoom = Math.max(1, Math.min(4, zoom + Number(z.dataset.z)));
    const inner = host.querySelector('.ba-inner');
    inner.style.setProperty('--ox', host.style.getPropertyValue('--split') || '50%');
    inner.style.transform = `scale(${zoom})`;
  });
  $('#ba-views').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    $('#ba-views').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    if (b.dataset.v === 'cloud') render(true); else { view = NEPAL.views[Number(b.dataset.v)]; render(); }
  });
  render();
}

// ---------- 05 NISAR change ----------
const COLL = 'NISAR_L2_GCOV_PROVISIONAL_V1';
const GRANULES = {
  before: { coll: COLL, id: 'NISAR_L2_PR_GCOV_028_098_A_016_4005_DHDH_A_20260819T233918_20260819T233953_X05026_N_F_J_001', ring: [[86.60648, 27.97942], [85.94647, 30.10547], [83.37345, 29.46177], [84.11993, 27.36049]] },
  after: { coll: COLL, id: 'NISAR_L2_PR_GCOV_029_098_A_016_4005_DHDH_A_20260831T233918_20260831T233952_X05026_N_F_J_001', ring: [[86.60121, 27.99165], [85.95595, 30.05776], [83.38562, 29.41472], [84.11588, 27.37303]] },
};

/** Cut a georeferenced image down to a lat/lon box, keeping native resolution. */
function crop(img, box) {
  const sx = img.W / (img.rect.east - img.rect.west), sy = img.H / (img.rect.north - img.rect.south);
  const x0 = Math.max(0, Math.floor((box.west - img.rect.west) * sx)), x1 = Math.min(img.W, Math.ceil((box.east - img.rect.west) * sx));
  const y0 = Math.max(0, Math.floor((img.rect.north - box.north) * sy)), y1 = Math.min(img.H, Math.ceil((img.rect.north - box.south) * sy));
  const W = x1 - x0, H = y1 - y0;
  if (W < 20 || H < 20) throw new Error('crop outside image');
  const lum = new Float32Array(W * H), valid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y + y0) * img.W + x + x0; lum[y * W + x] = img.lum[s]; valid[y * W + x] = img.valid[s]; }
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  canvas.getContext('2d').drawImage(img.canvas, x0, y0, W, H, 0, 0, W, H);
  return { W, H, lum, valid, canvas, rect: { west: img.rect.west + x0 / sx, east: img.rect.west + x1 / sx, north: img.rect.north - y0 / sy, south: img.rect.north - y1 / sy } };
}

function nisarPanel() {
  const host = $('#nisar');
  const n = NEPAL.nisar;
  host.innerHTML = `<div class="seg" id="nisar-modes" hidden><button data-m="change" aria-pressed="true">Change</button><button data-m="before" aria-pressed="false">19 Aug radar</button><button data-m="after" aria-pressed="false">31 Aug radar</button><button data-m="flicker" aria-pressed="false">Flicker</button></div>
    <div class="seg" id="nisar-sens" hidden style="margin-left:8px"><button data-s="std" aria-pressed="true" title="Threshold 0.45, 5×5 smoothing — the globe's default">Standard</button><button data-s="high" aria-pressed="false" title="Threshold 0.30, 3×3 smoothing — shows narrow features, and more noise">High sensitivity</button></div>
    <div class="nisar-canvas" style="margin-top:12px"><canvas id="nisar-base"></canvas><canvas id="nisar-over"></canvas>
      <div class="nisar-status" id="nisar-status"><p>Two real NISAR L-band radar images of this valley — one week before the collapse and five days after — are compared in your browser.</p><button class="btn primary" id="nisar-run">COMPUTE THE CHANGE MAP</button><span class="mono" style="font-size:10px;color:var(--ink-3)">downloads ~10 MB from NASA's ASF archive</span></div></div>
    <div id="nisar-out"></div>`;
  let flick = null;
  const run = async () => {
    const status = $('#nisar-status');
    status.innerHTML = '<span class="loading-ring" style="position:static;margin:0"></span><p>Fetching both NISAR passes from ASF DAAC…</p>';
    try {
      const [A0, B0] = await Promise.all([loadBrowse(GRANULES.before, { maxWidth: 2100 }), loadBrowse(GRANULES.after, { maxWidth: 2100 })]);
      status.querySelector('p').textContent = 'Computing change…';
      await new Promise((r) => setTimeout(r, 30));
      const A = crop(A0, n.crop), B = crop(B0, n.crop);
      const SENS = { std: { threshold: 0.45, box: 2, label: 'threshold ±0.45, 5×5 smoothing (the globe\'s default)' }, high: { threshold: 0.3, box: 1, label: 'threshold ±0.30, 3×3 smoothing' } };
      let sens = 'std';
      let res = computeChange(A, B, { maxSize: 1400, ...SENS[sens] });
      const { W, H } = res.grid;
      const base = $('#nisar-base'), over = $('#nisar-over');
      for (const c of [base, over]) { c.width = W; c.height = H; }
      over.getContext('2d').putImageData(new ImageData(changeToRGBA(res), W, H), 0, 0);
      const drawBase = (img) => { const cx = base.getContext('2d'); cx.fillStyle = '#05070c'; cx.fillRect(0, 0, W, H); cx.drawImage(img.canvas, 0, 0, W, H); };
      drawBase(B);
      status.remove();
      $('#nisar-modes').hidden = false;
      const setMode = (m) => {
        clearInterval(flick);
        $('#nisar-modes').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
        over.style.display = m === 'change' ? '' : 'none';
        if (m === 'before') drawBase(A);
        else if (m === 'flicker') { let k = 0; flick = setInterval(() => drawBase(k++ % 2 ? A : B), 700); }
        else drawBase(B);
      };
      $('#nisar-modes').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); });
      $('#nisar-sens').hidden = false;
      const report = () => {
      const st = res.stats;
      $('#nisar-out').innerHTML = `<div class="swatches"><span><i style="background:#48d6ff"></i>Radar return got darker: ${fmtInt(st.darkerKm2)} km²</span><span><i style="background:#ffa033"></i>Got brighter: ${fmtInt(st.brighterKm2)} km²</span><span>of ${fmtInt(st.validKm2)} km² compared</span></div>
        ${srcLine(['cmr', 'nisar'], { freshness: 'DERIVED', date: 'computed in your browser just now' })}
        ${how(`<p>Inputs: NISAR L2 GCOV browse images, track 98, frame 16, ascending, HH+HV, acquired ${fmtDay(n.before)} and ${fmtDay(n.after)} (the collapse was on 26 August). Both are provisional products.</p>
          <ul><li>Each image is georeferenced from its footprint, then cropped to ${n.crop.south}–${n.crop.north}° N, ${n.crop.west}–${n.crop.east}° E.</li><li>Each is normalised by its own median brightness; we take the log-ratio after ÷ before and smooth it with a 5×5 window to suppress speckle.</li><li>Pixels whose ratio exceeds the threshold are coloured. Current setting: ${SENS[sens].label}.</li></ul>
          <p><b>What it shows.</b> Each quick-look pixel is about ${Math.round(A0.kmPerPx * 1000)} m across, and the scoured river channel is only a few hundred metres wide — so at the standard setting it barely registers. High sensitivity brings out narrower features along the valley, together with more noise. Full-resolution, calibrated GCOV data (which needs a NASA Earthdata login) would map the channel properly.</p>
          <p><b>Read with care.</b> This is a relative brightness change from 8-bit quick-look images, not calibrated backscatter. In steep terrain, snowfall, snowmelt and wet ground between two dates also change the radar return, so not every coloured pixel is flood damage. Georeferencing error is about ${Math.max(A0.residualKm, B0.residualKm)} km.</p>`)}
        <p style="margin-top:12px"><a class="btn small" href="/?change=${n.lat},${n.lon}">Explore every NISAR pass of this valley on the globe →</a></p>`;
      };
      report();
      $('#nisar-sens').addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]'); if (!b || b.dataset.s === sens) return;
        sens = b.dataset.s;
        $('#nisar-sens').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
        res = computeChange(A, B, { maxSize: 1400, ...SENS[sens] });
        over.getContext('2d').putImageData(new ImageData(changeToRGBA(res), W, H), 0, 0);
        setMode('change');
        report();
      });
    } catch (e) {
      console.error(e);
      status.innerHTML = `<div class="error"><strong>The NISAR images could not be loaded.</strong> They are fetched live from NASA's ASF archive through this app's server, which is not reachable right now. Nothing is substituted. <a href="https://search.asf.alaska.edu/#/?dataset=NISAR&zoom=8&center=85.37,28.27" target="_blank" rel="noopener">Open the archive on ASF Vertex</a>.</div>`;
    }
  };
  $('#nisar-run').addEventListener('click', run);
}

// ---------- 05 area map, timeline, causes ----------
function areaMap() {
  const b = NEPAL.regionBox;
  const pos = (lat, lon) => [((lon - b.west) / (b.east - b.west)) * 100, ((b.north - lat) / (b.north - b.south)) * 100];
  const color = { source: '#ff4d6d', hit: '#ffb347', warn: '#ffd166', far: '#c8a6ff', ref: '#7fe6ff' };
  const path = NEPAL.places.filter((p) => p.kind !== 'ref').map((p) => pos(p.lat, p.lon).join(',')).join(' ');
  $('#areamap').innerHTML = `<img src="/data/story/nepal/region.jpg" alt="Satellite view of central Nepal" loading="lazy" />
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${path}" fill="none" stroke="#ff4d6d" stroke-width="0.9" stroke-dasharray="1.6 1.2" vector-effect="non-scaling-stroke" opacity=".9"/></svg>
    ${NEPAL.places.map((p) => { const [x, y] = pos(p.lat, p.lon); return `<button class="pt ${p.kind}${['source', 'far', 'ref'].includes(p.kind) ? ' label' : ''}${x > 60 ? ' flip' : ''}" style="left:${x}%;top:${y}%;--c:${color[p.kind]}" aria-label="${esc(p.name)}"></button>`; }).join('')}`;
  $('#areamap-note').innerHTML = `<div class="swatches"><span><i style="background:#ff4d6d"></i>Collapse zone</span><span><i style="background:#ffb347"></i>Settlements hit</span><span><i style="background:#ffd166"></i>Warned</span><span><i style="background:#c8a6ff"></i>Victims recovered</span></div>`
    + srcLine(['gibs', 'wiki_nepal'], { freshness: 'ARCHIVED', date: 'base image 10 Nov 2025' })
    + how('<p>Base image: MODIS Terra true colour from NASA GIBS. Markers are placed at each named location\'s approximate coordinates, and the dashed line simply joins them in downstream order — it is a schematic of the reported flood path along the Trishuli and Narayani rivers, not a mapped inundation extent. The flood struck a 72 km stretch of the Trishuli; victims were carried up to 250 km.</p>', 'About this map');
}

export function initNepal() {
  $('#nepal-summary').textContent = NEPAL.summary;
  $('#nepal-toll').innerHTML = NEPAL.toll.map((t) => `<div><b data-to="${t.v}">0</b><span>${esc(t.label)}</span>${t.note ? `<small>${esc(t.note)}</small>` : ''}</div>`).join('');
  $('#nepal-toll').insertAdjacentHTML('afterend', `<p style="color:var(--ink-2);font-size:13.5px;margin:-4px 0 6px">${esc(NEPAL.china)}</p>${srcLine(['wiki_nepal', 'un_nepal'], { freshness: 'RESEARCH', date: 'as of 5 Oct 2026' })}<div style="height:18px"></div>`);
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.disconnect(); $('#nepal-toll').querySelectorAll('[data-to]').forEach((n) => countUp(n, Number(n.dataset.to))); } }), { threshold: 0.4 });
  io.observe($('#nepal-toll'));
  beforeAfter();
  nisarPanel();
  areaMap();
  $('#timeline').innerHTML = NEPAL.timeline.map(([t, text, kind]) => `<li class="${kind}"><time>${esc(t)}</time><span>${esc(text)}</span></li>`).join('');
  $('#timeline').insertAdjacentHTML('afterend', srcLine(['wiki_nepal', 'earthsky_nepal'], { freshness: 'RESEARCH' }) + `<p style="font-size:11.5px;color:var(--ink-3);margin-top:6px">Times are Nepal time (UTC+5:45). ${pill('LIVE').replace('LIVE', 'SATELLITE')} marks satellite passes.</p>`);
  const c = NEPAL.cause;
  $('#nepal-cause').innerHTML = `<div style="--c:var(--cyan)"><h4>Natural drivers</h4><ul>${c.natural.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div style="--c:var(--amber)"><h4>Human drivers</h4><ul>${c.human.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  $('#nepal-cause').insertAdjacentHTML('afterend', srcLine(c.src, { freshness: 'RESEARCH' }) + how('<p>The cause is still under investigation by a Nepali government expert panel. Early reports suspected a glacial lake outburst; seismology and satellite imagery since point to a rock-ice avalanche. No formal attribution study had been published when this page was compiled, so the climate link is reported here as scientists\' stated judgement, not a measured fraction.</p>', 'How certain is this?'));
}
