// Provenance drawer, satellite card, status bar.
import { esc, tag, fmtDate, fmtCoord, freshnessPill } from './dom.js';
import { DATA_CLASS, DATA_CLASS_LABEL } from '../core/dataClass.js';
import { NISAR_NORAD } from '../globe/satellites.js';
import { tleEpoch } from '../core/orbit.js';

export function renderProvenance(el, story, frameIndex) {
  const t = story.timeline[frameIndex ?? story.afterIndex];
  const o = t.observation;
  const d = story.evidence?.derived;
  el.innerHTML = `<button class="close-x" data-act="close" aria-label="Close provenance">✕</button>
    <h2>DATA PROVENANCE</h2>
    <dl class="kv">
      <dt>DATA CLASS</dt><dd>${tag(story.dataClass)} ${esc(DATA_CLASS_LABEL[story.dataClass].long)}</dd>
      <dt>DATA SOURCE</dt><dd>NISAR</dd>
      <dt>MISSION</dt><dd>NASA × ISRO</dd>
      <dt>PRODUCT</dt><dd>${esc(o.processingLevel)} ${esc(o.productType)}${o.productType === 'GCOV' ? ' · geocoded covariance' : o.productType === 'GUNW' ? ' · geocoded unwrapped interferogram' : ''}</dd>
      <dt>ACQUISITION</dt><dd>${o.referenceDate ? `${fmtDate(o.referenceDate, { time: true })} →<br>${fmtDate(o.secondaryDate, { time: true })}` : fmtDate(o.acquisitionStart, { time: true })}</dd>
      <dt>LOCATION</dt><dd>${fmtCoord(story.location.lat, story.location.lon)}</dd>
      <dt>ORBIT</dt><dd>track ${esc(o.track)} · frame ${esc(o.frame)} · ${esc(o.flightDirection?.toLowerCase())} · orbit ${esc(o.orbit ?? '—')}</dd>
      <dt>PROCESSING</dt><dd>ASF browse quick-look → corner-fit georeferencing (±${esc(o.georeferencing?.residualKm)} km)${d ? ' → derived water mask' : ''}</dd>
      <dt>STATUS</dt><dd>${esc(o.collection?.includes('PROVISIONAL') ? 'PROVISIONAL product' : o.collection)}</dd>
      <dt>CONFIDENCE</dt><dd>${esc(story.confidence.level)}</dd>
      <dt>DATASET</dt><dd>${freshnessPill(story.freshness || 'ARCHIVED')} built ${esc(fmtDate(story.provenance?.generatedAt, { time: true }))}</dd>
      <dt>GRANULE</dt><dd style="word-break:break-all;font-size:10px">${esc(o.id)}</dd>
    </dl>
    <div class="btn-row">
      <a class="btn" href="${esc(o.asfSearchUrl)}" target="_blank" rel="noopener">OPEN THE SOURCE ↗</a>
      <a class="btn" href="${esc(o.downloadUrl)}" target="_blank" rel="noopener">PRODUCT FILE ↗</a>
    </div>
    <p style="font-size:11px;color:var(--ink-3);margin-top:12px">${story.sources.map((s) => `${esc(s.name)}${s.detail ? ' — ' + esc(s.detail) : ''}`).join('<br>')}</p>
    <p style="font-size:11px;color:var(--ink-3)">NISAR data courtesy of NASA/JPL-Caltech and ISRO, distributed by ASF DAAC.</p>`;
}

export function renderSatCard(el, info, { tracking, replay, hasObservation, dataHtml = '' }) {
  const m = info.mission;
  const isNisar = info.norad === NISAR_NORAD;
  const p = info.position;
  const epoch = tleEpoch(info.satrec);
  el.innerHTML = `<button class="close-x" data-act="close-sat" aria-label="Close">✕</button>
    <div class="eyebrow">${isNisar ? 'EARTH OBSERVATION' : m ? 'EARTH OBSERVATION SATELLITE' : 'SATELLITE'} · ${tag(DATA_CLASS.REAL_OTHER_SATELLITE, 'REAL ORBIT')}</div>
    <h2>${esc(isNisar ? 'NISAR' : info.name)}</h2>
    ${m ? `<div class="op">${esc(m.operator)}</div><div class="instr">${esc(isNisar ? 'L-BAND + S-BAND SAR' : m.instrument.toUpperCase())}</div>` : ''}
    ${m?.blurb ? `<p>${esc(m.blurb)}</p>` : ''}
    <dl class="kv">
      <dt>NORAD</dt><dd>${info.norad}</dd>
      <dt>ALTITUDE</dt><dd>${p ? p.altKm.toFixed(0) + ' km' : '—'}</dd>
      <dt>VELOCITY</dt><dd>${p?.speedKms ? p.speedKms.toFixed(2) + ' km/s' : '—'}</dd>
      <dt>POSITION</dt><dd>${p ? fmtCoord(p.lat, p.lon, 1) : '—'}</dd>
      <dt>ORBIT</dt><dd>${info.inclinationDeg.toFixed(1)}° incl · ${info.periodMin.toFixed(1)} min</dd>
      <dt>ELEMENTS</dt><dd>CelesTrak TLE · epoch ${epoch.toISOString().slice(0, 16).replace('T', ' ')}</dd>
      ${isNisar ? `<dt>SWATH</dt><dd>≈242 km, left-looking ${tag(DATA_CLASS.DERIVED, 'MODELED')}</dd>` : ''}
    </dl>
    ${dataHtml}
    ${isNisar ? `<p style="font-size:11.5px;color:var(--ink-3);margin:0">The translucent band is NISAR's modeled imaging swath, fitted to real ASF footprints. It shows where the radar can look, not whether it was switched on.</p>` : ''}
    <div class="btn-row">
      <button class="btn ${tracking ? '' : 'primary'}" data-act="track" aria-pressed="${!!tracking}">${tracking ? 'TRACKING' : 'TRACK'}</button>
      <button class="btn" data-act="follow">FOLLOW</button>
      ${isNisar ? `<button class="btn accent" data-act="explore-nisar">EXPLORE</button>` : ''}
      ${isNisar && hasObservation ? `<button class="btn" data-act="see-observation">SEE OBSERVATION</button>` : ''}
      ${isNisar ? `<button class="btn" data-act="replay" aria-pressed="${!!replay}">TIME TRAVEL</button>` : ''}
      ${m?.link ? `<a class="btn" href="${esc(m.link)}" target="_blank" rel="noopener">MISSION ↗</a>` : ''}
    </div>`;
}

export function renderStatus(el, { sats, story, clock }) {
  const parts = [];
  if (clock) parts.push(`<span class="pill clock ${clock.replay ? 'replay' : ''}">${clock.replay ? '⟲ REPLAY · ' : '● '}${esc(clock.text)}</span>`);
  if (story) parts.push(freshnessPill(story.freshness || 'ARCHIVED', story.available ? 'NISAR DATA' : ''));
  if (sats?.freshness) parts.push(freshnessPill(sats.freshness, `ORBITS${sats.fetchedAt ? ' · ' + fmtDate(sats.fetchedAt) : ''}`));
  el.innerHTML = parts.join('');
}
