// The Earth Story panel: human story first, evidence on demand.
import { $, esc, tag, freshnessPill, fmtDate } from './dom.js';
import { DATA_CLASS } from '../core/dataClass.js';
import { PHENOMENA } from '../core/stories.js';

function sparkline(series, { peakIndex } = {}) {
  if (!series?.length) return '';
  const W = 360, H = 64, pad = 6;
  const vals = series.map((s) => s.waterAreaKm2);
  const min = Math.min(...vals) * 0.9, max = Math.max(...vals) * 1.05;
  const x = (i) => pad + (i / Math.max(1, series.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(vals.length - 1)},${H} L${x(0)},${H} Z`;
  const dots = vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === peakIndex ? 3.6 : 2.2}" fill="${i === peakIndex ? '#48d6ff' : '#cfe8ff'}"><title>${fmtDate(series[i].date)}: ≈${v.toLocaleString('en-US')} km²</title></circle>`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Estimated open-water area per NISAR pass">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#48d6ff" stop-opacity=".35"/><stop offset="1" stop-color="#48d6ff" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#sg)"/><path d="${d}" fill="none" stroke="#48d6ff" stroke-width="1.6"/>${dots}</svg>
    <div class="spark-caption"><span>${fmtDate(series[0].date)}</span><span>≈ km² dark-water-like area</span><span>${fmtDate(series.at(-1).date)}</span></div>`;
}

function confidence(c) {
  return `<span class="conf" data-level="${esc(c.level)}"><i></i><i></i><i></i><b>${esc(c.level)}</b></span>`;
}

export function renderStory(el, story, { onAction, watching }) {
  const color = PHENOMENA[story.phenomenon]?.color || '#fff';
  if (!story.available) {
    el.innerHTML = `<div class="story-scroll"><div class="glass story-empty">
      <div class="loc">${esc(story.location?.name?.toUpperCase())} ${freshnessPill('UNAVAILABLE')}</div>
      <h2 class="title">${esc(story.humanTitle)}</h2>
      <p class="lede">The NISAR data for this story could not be loaded, so nothing is shown in its place.</p>
      <p class="lede">${tag(DATA_CLASS.DEMO, 'NO DATA — NOTHING SIMULATED')}</p>
      <div class="cta-row"><button class="btn" data-act="home">RETURN TO EARTH</button></div></div></div>`;
    el.onclick = (e) => { const a = e.target.closest('[data-act]'); if (a) onAction(a.dataset.act, a.dataset); };
    return;
  }
  const d = story.evidence?.derived;
  const ev = story.evidence?.contextEvent;
  el.innerHTML = `
  <div class="story-scroll" tabindex="-1">
    <div class="loc"><span style="color:${color}">●</span> ${esc(story.location.name.toUpperCase())}
      <span style="opacity:.6">${esc(story.location.region)}</span></div>
    <h2 class="title" id="story-title">${esc(story.humanTitle)}</h2>
    <div class="sci">${esc(story.scientificTerm)}</div>
    <p class="lede">${esc(story.summary)}</p>
    <div class="cta-row">
      <button class="btn primary" data-act="compare">SHOW ME</button>
      <button class="btn accent" data-act="know">HOW DID NISAR KNOW?</button>
      <button class="btn" data-act="science">SCIENCE MODE</button>
    </div>

    <div class="glass block">
      <h3>WHAT WE SAW ${tag(DATA_CLASS.REAL_NISAR, 'NISAR OBSERVATION')}</h3>
      <p>${esc(story.interpretation.whatWeSaw)}</p>
      ${d?.series ? `${sparkline(d.series, d)}<div style="margin-top:8px">${tag(DATA_CLASS.DERIVED, 'DERIVED ESTIMATE')}</div>` : ''}
    </div>

    <div class="glass block">
      <h3>WHAT IT MAY MEAN</h3>
      <p>${esc(story.interpretation.mayMean)}</p>
    </div>

    <div class="glass block">
      <h3>HOW CONFIDENT WE ARE ${confidence(story.confidence)}</h3>
      <p>${esc(story.confidence.why)}</p>
    </div>

    <div class="glass block">
      <h3>HOW WE KNOW</h3>
      <p>${esc(story.howWeKnow)}</p>
    </div>

    <div class="glass block">
      <h3>WHAT ELSE COULD EXPLAIN IT</h3>
      <ul>${story.alternativeExplanations.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>

    ${ev ? `<div class="glass block"><h3>CONTEXT ${tag(DATA_CLASS.REAL_CONTEXT, 'USGS')}</h3>
      <p class="event">M${esc(ev.mag)} · ${esc(ev.place)}<br>${fmtDate(ev.time, { time: true })} · depth ${esc(ev.depthKm?.toFixed?.(0))} km</p>
      <p style="margin-top:8px">${esc(story.context)}</p></div>`
      : story.contextError ? `<div class="glass block"><h3>CONTEXT</h3><p>${esc(story.contextError)}</p></div>`
      : `<div class="glass block"><h3>CONTEXT</h3><p>${esc(story.context)}</p></div>`}

    <div class="glass block">
      <h3>WHAT DOES THAT MEAN?</h3>
      <p>Potentially relevant to:</p>
      <ul>${story.impact.relevantTo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="impact-note">${esc(story.impact.note)}</div>
    </div>

    <div class="glass block" id="watching">
      <h3>WHO IS WATCHING THIS PLACE?</h3>
      ${watching || '<p style="color:var(--ink-3)">Calculating from real orbits…</p>'}
    </div>

    <div class="glass block">
      <h3>SOURCE</h3>
      <p>${story.sources.map((s) => `${tag(s.dataClass)} ${esc(s.name)}`).join('<br>')}</p>
      <div class="cta-row" style="margin:10px 0 0"><button class="btn" data-act="provenance">INSPECT PROVENANCE</button></div>
    </div>

    <div class="cta-row"><button class="btn primary" data-act="next">SHOW ME ANOTHER ONE →</button>
      <button class="btn" data-act="home">RETURN TO EARTH</button></div>
  </div>`;
  el.onclick = (e) => {
    const a = e.target.closest('[data-act]');
    if (a) onAction(a.dataset.act, a.dataset);
  };
}

export function updateWatching(el, html) {
  const w = $('#watching', el);
  if (w) w.innerHTML = `<h3>WHO IS WATCHING THIS PLACE?</h3>${html}`;
}
