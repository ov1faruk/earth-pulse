// SCIENCE MODE — the verification layer. Actual products, dates, geometry,
// processing, uncertainty and the live archive. Nothing is hidden here.
import { $$, esc, tag, fmtDate, fmtCoord, freshnessPill } from './dom.js';
import { DATA_CLASS } from '../core/dataClass.js';
import { nisarAt, browseProxy } from '../data/api.js';

const PRODUCT_LEGEND = {
  GCOV: `<p>Browse colour composite of the GCOV covariance product: <b style="color:#ff5fa2">red = HH</b>, <b style="color:#9be15d">green = HV</b>, <b style="color:#7fb0ff">blue = HH</b> (red and blue channels are identical in these files). So <span style="color:#ff5fa2">magenta</span> = HH-dominant, <span style="color:#9be15d">green</span> = HV-dominant (volume scattering, e.g. vegetation), dark = low return (e.g. calm water). Single-pol (HH-only) frames render grey.</p>
    <div class="legend-bar" style="background:linear-gradient(90deg,#000,#ff5fa2 40%,#fff 60%,#9be15d)"></div>`,
  GUNW: `<p>Browse rendering of the unwrapped interferogram: a cyclic colour scale in which each full colour cycle is a contour of equal line-of-sight displacement. The displacement per cycle for the browse rendering is not stated in the public metadata; use the HDF5 <span class="mono">unwrappedPhase</span> layer (radians; λ ≈ 0.24 m, so 2π ≈ 12 cm of line-of-sight change) for measurements.</p>
    <div class="legend-bar" style="background:linear-gradient(90deg,#5b2a86,#f5f0ff,#c4622d,#5b2a86)"></div>`,
};

export function createScience({ el, onPickFrame, onClose }) {
  let story = null;
  let selected = 0;
  let live = null;

  function close() { el.hidden = true; onClose?.(); }

  function render() {
    const s = story;
    const obs = s.observations;
    const f = obs[selected];
    const t = s.timeline[selected];
    const d = s.evidence?.derived;
    const ev = s.evidence?.contextEvent;
    const ptype = obs[0]?.productType;
    el.innerHTML = `
      <button class="close-x" data-act="close" aria-label="Close science mode">✕</button>
      <h2>SCIENCE MODE</h2>
      <div class="sub">${esc(s.scientificTerm)}</div>
      <p>${tag(DATA_CLASS.REAL_NISAR)} ${d ? tag(DATA_CLASS.DERIVED) : ''} ${ev ? tag(DATA_CLASS.REAL_CONTEXT) : ''} ${freshnessPill(s.freshness || 'ARCHIVED', 'DATASET')}</p>

      <section>
        <h3>OBSERVATIONS USED (${obs.length}) · click to show on the globe</h3>
        <table class="sci-table"><thead><tr><th>${obs[0]?.referenceDate ? 'REFERENCE → SECONDARY' : 'ACQUISITION (UTC)'}</th><th>PRODUCT</th><th>TRACK/FRAME</th><th>DIR</th><th>POL</th><th>GEOREF ±</th></tr></thead>
        <tbody>${obs.map((o, i) => `<tr class="pick ${i === selected ? 'sel' : ''}" data-i="${i}" tabindex="0">
          <td>${o.referenceDate ? `${o.referenceDate.slice(0, 10)} → ${o.secondaryDate.slice(0, 10)}${s.timeline[i].spansEvent ? ' ◆' : ''}` : o.acquisitionStart.replace('T', ' ').slice(0, 16)}</td>
          <td>${esc(o.processingLevel)} ${esc(o.productType)}</td><td>${esc(o.track)}/${esc(o.frame)}</td><td>${esc(o.flightDirection?.[0])}</td>
          <td>${esc((o.polarization || []).join('+'))}</td><td>${esc(o.georeferencing?.residualKm)} km</td></tr>`).join('')}</tbody></table>
        ${ev ? `<p style="margin-top:8px">◆ = pair spans the USGS event time (${esc(ev.time.replace('T', ' ').slice(0, 16))} UTC).</p>` : ''}
      </section>

      <section>
        <h3>SELECTED PRODUCT</h3>
        <div class="granule">${esc(f.id)}</div>
        <dl class="kv">
          <dt>COLLECTION</dt><dd>${esc(f.collection)} ${f.collection?.includes('PROVISIONAL') ? '(provisional, not fully validated)' : ''}</dd>
          <dt>INSTRUMENT</dt><dd>${esc(f.instrument)} · L-band</dd>
          <dt>ABS. ORBIT</dt><dd>${esc(f.orbit ?? '—')} · ${esc(f.orbitType || '')} orbit</dd>
          <dt>POLARIZATION</dt><dd>main ${esc((f.polarization || []).join(', '))}${f.sideBandPolarization ? ` · side ${esc(f.sideBandPolarization.join(', '))}` : ''}</dd>
          <dt>BANDWIDTH</dt><dd>${esc((f.rangeBandwidth || []).join(', '))} MHz</dd>
          <dt>COVERAGE</dt><dd>${esc(f.frameCoverage || '—')} frame</dd>
          <dt>PGE / CRID</dt><dd>${esc(f.pgeVersion || '—')} / ${esc(f.crid || '—')}</dd>
          <dt>EXTENT</dt><dd>${fmtCoord(f.rectangle.north, f.rectangle.west)} → ${fmtCoord(f.rectangle.south, f.rectangle.east)}</dd>
        </dl>
        <div class="btn-row">
          <a class="btn" href="${esc(f.asfSearchUrl)}" target="_blank" rel="noopener">OPEN IN ASF VERTEX ↗</a>
          <a class="btn" href="${esc(f.browseUrl)}" target="_blank" rel="noopener">BROWSE PNG (PUBLIC) ↗</a>
          <a class="btn" href="${esc(f.downloadUrl)}" target="_blank" rel="noopener" title="Requires a free NASA Earthdata login">HDF5 PRODUCT (EARTHDATA LOGIN) ↗</a>
        </div>
      </section>

      <section>
        <h3>HOW TO READ THE COLOURS</h3>
        ${PRODUCT_LEGEND[ptype] || ''}
      </section>

      <section>
        <h3>OBSERVATION GEOMETRY</h3>
        <dl class="kv">
          <dt>FLIGHT</dt><dd>${esc(f.flightDirection)} pass · track ${esc(f.track)} · frame ${esc(f.frame)}</dd>
          <dt>LOOK SIDE</dt><dd>left of ground track ${tag(DATA_CLASS.DERIVED, 'FITTED')}</dd>
          <dt>SWATH</dt><dd>≈ 242 km, centred ≈ 550 km from nadir</dd>
          <dt>REPEAT</dt><dd>12-day exact-repeat orbit</dd>
          <dt>WAVELENGTH</dt><dd>L-band ≈ 24 cm (1.257 GHz)</dd>
        </dl>
        <p>The look side and swath offset were fitted by comparing ASF footprint centroids with NISAR's CelesTrak-propagated ground track (ascending and descending passes), not taken from an acquisition plan.</p>
      </section>

      <section>
        <h3>PROCESSING</h3>
        <p>1 · Granules selected via ASF Search API (${esc(JSON.stringify(s.provenance?.query || {}))}).<br>
        2 · Public LATLON browse PNG downloaded (8-bit quick-look, not calibrated).<br>
        3 · Georeferenced by fitting the corners of the valid-data quadrilateral to the ASF footprint polygon (residual ${esc(f.georeferencing?.residualKm)} km for this frame).<br>
        4 · Background made transparent; resampled to ≤1600 px; draped on the globe in a geographic grid.</p>
        ${d ? `<p><b>Derived water estimate</b> ${tag(DATA_CLASS.DERIVED)}: ${esc(d.method)}</p>
          <table class="sci-table"><thead><tr><th>DATE</th><th>THRESHOLD (DN)</th><th>WATER FRACTION</th><th>≈ AREA km²</th></tr></thead><tbody>
          ${d.series.map((r, i) => `<tr class="${i === d.peakIndex ? 'sel' : ''}"><td>${r.date.slice(0, 10)}</td><td>${r.threshold}</td><td>${(r.waterFraction * 100).toFixed(1)}%</td><td>${r.waterAreaKm2.toLocaleString('en-US')}</td></tr>`).join('')}</tbody></table>
          <p style="margin-top:8px">Area evaluated: ≈${d.commonAreaKm2.toLocaleString('en-US')} km² where every date has data. Change ${d.change.fromDate.slice(0, 10)} → ${d.change.toDate.slice(0, 10)}: +${d.change.becameWaterKm2.toLocaleString('en-US')} km² became water-like, −${d.change.recededKm2.toLocaleString('en-US')} km² receded.</p>` : ''}
      </section>

      <section>
        <h3>UNCERTAINTY & LIMITATIONS</h3>
        <p>Confidence: <b>${esc(s.confidence.level)}</b>. ${esc(s.confidence.why)}</p>
        <ul style="font-size:12.5px;color:var(--ink-2);line-height:1.55;padding-left:18px">
          ${[...(s.alternativeExplanations || []), ...(d?.caveats || []), ...(s.evidence?.notes || [])].map((x) => `<li>${esc(x)}</li>`).join('')}
        </ul>
        ${s.evidence?.skipped?.length ? `<p>Skipped granules: ${s.evidence.skipped.map((k) => `<span class="mono" style="font-size:10px">${esc(k.granule.slice(0, 48))}…</span> (${esc(k.reason)})`).join('; ')}</p>` : ''}
        ${s.id === 'kumamoto-ground' ? '<p>Also checked: the descending-track pair 2026-07-08 → 2026-08-13 (track 003) over the same area is almost completely decorrelated in its browse image, so it is not used as evidence.</p>' : ''}
      </section>

      <section>
        <h3>THUMBNAILS · ALL DATES</h3>
        <div class="thumbs">${s.timeline.map((x, i) => `<figure><img loading="lazy" src="${x.image}" alt="NISAR ${esc(x.label)}" data-i="${i}" style="cursor:pointer"><figcaption>${esc(x.referenceDate ? x.referenceDate.slice(5, 10) + '→' + x.secondaryDate.slice(5, 10) : x.date.slice(0, 10))}</figcaption></figure>`).join('')}</div>
      </section>

      <section id="live-archive">
        <h3>LIVE NISAR ARCHIVE AT ${fmtCoord(s.location.lat, s.location.lon)}</h3>
        ${liveHtml()}
      </section>`;
    $$('tr.pick, .thumbs img', el).forEach((n) => {
      const go = () => { selected = Number(n.dataset.i); onPickFrame?.(selected); render(); };
      n.onclick = go;
      n.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
    el.querySelector('[data-act=close]').onclick = close;
  }

  function liveHtml() {
    if (!live) return '<p>Querying ASF…</p>';
    if (live.error) return `<p>${freshnessPill('UNAVAILABLE')} ${esc(live.error)}. The story above uses archived real data.</p>`;
    const rows = live.observations.slice(0, 12);
    return `<p>${freshnessPill(live.freshness, 'ASF SEARCH')} ${live.observations.length} products returned · fetched ${esc(fmtDate(live.fetchedAt, { time: true }))}</p>
      <table class="sci-table"><thead><tr><th>DATE</th><th>PRODUCT</th><th>DIR</th><th>STATUS</th><th></th></tr></thead><tbody>
      ${rows.map((o) => `<tr><td>${esc(o.acquisitionDate.slice(0, 16).replace('T', ' '))}</td><td>${esc(o.processingLevel)} ${esc(o.productType)}</td><td>${esc(o.orbit.direction?.[0])}</td><td>${esc(o.availability)}</td>
        <td>${o.thumbnailUrl && o.availability === 'PROVISIONAL' ? `<a href="${esc(browseProxy(o.browseUrl))}" target="_blank" rel="noopener">browse ↗</a>` : ''}</td></tr>`).join('')}</tbody></table>`;
  }

  async function open(s, { frame } = {}) {
    story = s;
    selected = frame ?? s.afterIndex ?? 0;
    el.hidden = false;
    live = null;
    render();
    try {
      live = await nisarAt(s.location.lat, s.location.lon);
    } catch (e) {
      live = { error: 'DATA TEMPORARILY UNAVAILABLE' };
    }
    if (story === s && !el.hidden) {
      const sec = el.querySelector('#live-archive');
      if (sec) sec.innerHTML = `<h3>LIVE NISAR ARCHIVE AT ${fmtCoord(s.location.lat, s.location.lon)}</h3>${liveHtml()}`;
    }
  }

  return { open, close, get isOpen() { return !el.hidden; }, select(i) { selected = i; if (!el.hidden) render(); } };
}
