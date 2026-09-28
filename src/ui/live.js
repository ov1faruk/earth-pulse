// LIVING EARTH UI — legend with live counts, event cards, feed, tooltip.
import { esc, tag, fmtDate, fmtCoord, freshnessPill } from './dom.js';
import { DATA_CLASS } from '../core/dataClass.js';
import { LIVE_COLORS, EVENT_COLORS } from '../globe/live.js';

const n = (x) => (x ?? 0).toLocaleString('en-US');
const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

export function renderLegend(el, live, { lapse } = {}) {
  const d = live.data;
  let fireSpan = '24';
  if (d.fires?.fires?.length) {
    let lo = Infinity, hi = -Infinity;
    for (const r of d.fires.fires) { if (r[3] < lo) lo = r[3]; if (r[3] > hi) hi = r[3]; }
    fireSpan = String(Math.round((hi - lo) / 60));
  }
  const rows = [
    ['radar', '#ffffff', 'NISAR CHANGE HOTSPOTS', d.radar?.hotspots?.length, d.radar ? `scanned ${d.radar.pairsCompared} frame pairs · ${d.radar.generatedAt.slice(0, 10)}` : 'NISAR repeat pairs', ''],
    ['fires', LIVE_COLORS.fires, 'FIRE DETECTIONS', d.fires?.fires?.length, `last ${fireSpan} h · NASA FIRMS`, live.fireFilter != null ? `only ${d.fires.satellites[live.fireFilter]}` : ''],
    ['quakes', LIVE_COLORS.quakes, 'EARTHQUAKES', d.quakes?.quakes?.length, 'M2.5+ · 30 days · USGS', ''],
    ['events', LIVE_COLORS.events, 'NATURAL EVENTS', d.events?.events?.length, 'open · NASA EONET + GDACS', ''],
    ['nisar', LIVE_COLORS.nisarGCOV, 'NISAR IMAGES', d.nisar?.granules?.length, `last ${d.nisar?.days || 3} days · ASF/CMR`, ''],
  ];
  el.innerHTML = `
    <div class="lg-head"><span>LIVING EARTH</span><button class="lg-min" data-act="min" aria-label="Collapse">–</button></div>
    <div class="lg-rows">
    ${rows.map(([k, c, label, count, sub, extra]) => `<button class="lg-row" data-layer="${k}" aria-pressed="${live.visible[k]}">
      <i style="background:${c};box-shadow:0 0 10px ${c}"></i>
      <span class="lg-count">${live.status[k] === 'loading' ? '<span class="lg-spin"></span>' : live.status[k] === 'UNAVAILABLE' ? '—' : n(count)}</span>
      <span class="lg-label">${label}<small>${esc(sub)}${extra ? ` · <b>${esc(extra)}</b>` : ''}${live.status[k] === 'UNAVAILABLE' ? ' · UNAVAILABLE' : live.status[k] === 'ARCHIVED' ? ' · ARCHIVED SNAPSHOT' : ''}</small></span>
    </button>`).join('')}
    </div>
    <div class="lg-actions">
      <button class="btn primary" data-act="lapse">${lapse ? '■ STOP' : '▶ PLAY THE PLANET'}</button>
      <button class="btn" data-act="feed">WHAT'S HAPPENING</button>
      ${live.fireFilter != null ? '<button class="btn" data-act="allfires">ALL FIRES</button>' : ''}
    </div>`;
}

export function renderLapseProgress(el, k, times) {
  const f = (d) => (d ? `${d.toISOString().slice(5, 10).replace('-', '/')} ${d.toISOString().slice(11, 16)}` : '—');
  el.innerHTML = `<div class="lapse-bar"><div style="width:${(k * 100).toFixed(1)}%"></div></div>
    <div class="lapse-times"><span style="color:${LIVE_COLORS.fires}">FIRES ${f(times.fires)}</span>
    <span style="color:${LIVE_COLORS.quakes}">QUAKES ${f(times.quakes)}</span>
    <span style="color:${LIVE_COLORS.nisarGCOV}">NISAR ${f(times.nisar)}</span></div>
    <div class="lapse-note">TIME-LAPSE · each layer replays its own window (fires ~1 day · quakes 30 days · NISAR 3 days) · UTC</div>`;
}

export function renderLiveCard(el, pick, live, { draped } = {}) {
  const d = live.data;
  let html = '';
  if (pick.kind === 'fire') {
    const [lon, lat, frp, min, sat, conf, night] = pick.record;
    const satName = d.fires.satellites[sat];
    html = `<div class="eyebrow">ACTIVE FIRE DETECTION · ${tag(DATA_CLASS.REAL_OTHER_SATELLITE, 'SATELLITE DATA')}</div>
      <h2 style="color:${LIVE_COLORS.fires}">SOMETHING IS BURNING</h2>
      <p>The <b>${esc(satName)}</b> satellite’s ${sat >= 3 ? 'MODIS' : 'VIIRS'} instrument detected a thermal anomaly here: a spot much hotter than its surroundings.</p>
      <dl class="kv">
        <dt>DETECTED BY</dt><dd>${esc(satName)} · ${sat >= 3 ? 'MODIS' : 'VIIRS'}</dd>
        <dt>WHEN</dt><dd>${fmtDate(new Date(min * 60000).toISOString(), { time: true })} · ${ago(min * 60000)}</dd>
        <dt>WHERE</dt><dd>${fmtCoord(lat, lon, 3)}</dd>
        <dt>FIRE POWER</dt><dd>${frp} MW (FRP)</dd>
        <dt>CONFIDENCE</dt><dd>${['low', 'nominal', 'high'][conf]}</dd>
        <dt>PASS</dt><dd>${night ? 'night' : 'day'}</dd>
      </dl>
      <p class="fine">May indicate a wildfire, agricultural burning, a gas flare or another heat source. FIRMS detections are not confirmed fires.</p>
      <div class="btn-row">
        <button class="btn primary" data-act="follow-sat" data-norad="${d.fires.satelliteNorad[sat]}">FOLLOW ${esc(satName)}</button>
        <button class="btn" data-act="sat-fires" data-sat="${sat}">ONLY ITS FIRES</button>
        <a class="btn" href="https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${lon},${lat},9z" target="_blank" rel="noopener">FIRMS ↗</a>
      </div>`;
  } else if (pick.kind === 'quake') {
    const [lon, lat, depth, mag, time, id, place, tsunami, alert] = pick.record;
    html = `<div class="eyebrow">EARTHQUAKE · ${tag(DATA_CLASS.REAL_CONTEXT, 'USGS')}</div>
      <h2 style="color:${LIVE_COLORS.quakes}">THE GROUND SHOOK</h2>
      <p style="font-size:22px;margin:4px 0 10px;color:var(--ink)">M${mag.toFixed(1)} · ${esc(place || '')}</p>
      <dl class="kv">
        <dt>WHEN</dt><dd>${fmtDate(new Date(time).toISOString(), { time: true })} · ${ago(time)}</dd>
        <dt>WHERE</dt><dd>${fmtCoord(lat, lon, 2)}</dd>
        <dt>DEPTH</dt><dd>${depth} km</dd>
        ${alert ? `<dt>PAGER</dt><dd>${esc(alert)}</dd>` : ''}${tsunami ? '<dt>TSUNAMI</dt><dd>flag set by USGS</dd>' : ''}
      </dl>
      <p class="fine">Located by seismometers, not satellites. NISAR can reveal the ground deformation of larger, shallow quakes.</p>
      <div class="btn-row">
        <button class="btn primary" data-act="nisar-here" data-lat="${lat}" data-lon="${lon}" data-after="${time}">DID NISAR SEE IT?</button>
        <a class="btn" href="https://earthquake.usgs.gov/earthquakes/eventpage/${esc(id)}" target="_blank" rel="noopener">USGS ↗</a>
      </div>`;
  } else if (pick.kind === 'event') {
    const e = pick.record;
    const c = EVENT_COLORS[e.category] || EVENT_COLORS.other;
    html = `<div class="eyebrow">${esc(e.categoryTitle.toUpperCase())} · ${tag(DATA_CLASS.REAL_CONTEXT, e.source)}</div>
      <h2 style="color:${c}">${esc(e.title)}</h2>
      <dl class="kv">
        <dt>LAST UPDATE</dt><dd>${fmtDate(e.date, { time: true })}</dd>
        <dt>WHERE</dt><dd>${fmtCoord(e.lat, e.lon, 2)}${e.country ? ' · ' + esc(e.country) : ''}</dd>
        ${e.magnitude ? `<dt>MAGNITUDE</dt><dd>${esc(e.magnitude)}</dd>` : ''}
        ${e.alert ? `<dt>ALERT</dt><dd>${esc(e.alert)}</dd>` : ''}
        ${e.sources?.length ? `<dt>REPORTED BY</dt><dd>${esc(e.sources.join(', '))}</dd>` : ''}
      </dl>
      <div class="btn-row">
        <button class="btn primary" data-act="nisar-here" data-lat="${e.lat}" data-lon="${e.lon}">DID NISAR SEE IT?</button>
        <a class="btn" href="${esc(e.url)}" target="_blank" rel="noopener">SOURCE ↗</a>
      </div>`;
  } else if (pick.kind === 'nisar') {
    const g = pick.record;
    html = `<div class="eyebrow">NISAR OBSERVATION · ${tag(DATA_CLASS.REAL_NISAR, 'NISAR DATA')}</div>
      <h2 style="color:${g.type === 'GUNW' ? LIVE_COLORS.nisarGUNW : LIVE_COLORS.nisarGCOV}">NISAR LOOKED HERE</h2>
      <p>${g.type === 'GUNW' ? 'An interferogram: how the ground moved between two passes.' : 'A radar image: how strongly each spot reflects radar (water dark, vegetation green, towns bright).'}</p>
      <dl class="kv">
        <dt>PRODUCT</dt><dd>L2 ${esc(g.type)}</dd>
        <dt>ACQUIRED</dt><dd>${fmtDate(g.t, { time: true })} · ${ago(Date.parse(g.t))}</dd>
        <dt>ORBIT</dt><dd>track ${g.track} · frame ${g.frame} · ${g.dir === 'A' ? 'ascending' : 'descending'}</dd>
        ${draped ? `<dt>GEOREF ±</dt><dd>${draped.residualKm} km ${tag(DATA_CLASS.DERIVED, 'FITTED')}</dd>` : ''}
      </dl>
      <div class="granule" style="margin-bottom:10px">${esc(g.id)}</div>
      <div class="btn-row">
        <button class="btn primary" data-act="drape" data-i="${pick.i}" ${draped ? 'disabled' : ''}>${draped ? 'IMAGE ON THE GLOBE' : 'SHOW THE REAL IMAGE'}</button>
        <a class="btn" href="https://search.asf.alaska.edu/#/?dataset=NISAR&searchType=List%20Search&searchList=${encodeURIComponent(g.id)}" target="_blank" rel="noopener">ASF ↗</a>
      </div>
      <p class="fine">Quick-look browse image (not calibrated), placed by fitting its corners to the ASF footprint.</p>`;
  }
  el.innerHTML = `<button class="close-x" data-act="close-live" aria-label="Close">✕</button>${html}`;
}

export function renderFeed(el, live) {
  const d = live.data;
  const items = [];
  const now = Date.now();
  if (d.quakes) {
    d.quakes.quakes.map((q, i) => ({ q, i })).filter(({ q }) => now - q[4] < 7 * 864e5).sort((a, b) => b.q[3] - a.q[3]).slice(0, 4)
      .forEach(({ q, i }) => items.push({ kind: 'quake', i, color: LIVE_COLORS.quakes, title: `M${q[3].toFixed(1)} earthquake`, sub: `${q[6] || ''} · ${ago(q[4])}`, lat: q[1], lon: q[0] }));
  }
  if (d.fires) {
    d.fires.fires.map((f, i) => ({ f, i })).sort((a, b) => b.f[2] - a.f[2]).slice(0, 3)
      .forEach(({ f, i }) => items.push({ kind: 'fire', i, color: LIVE_COLORS.fires, title: `Intense fire · ${f[2]} MW`, sub: `${d.fires.satellites[f[4]]} · ${fmtCoord(f[1], f[0], 1)} · ${ago(f[3] * 60000)}`, lat: f[1], lon: f[0] }));
  }
  if (d.events) {
    d.events.events.map((e, i) => ({ e, i })).filter(({ e }) => e.category !== 'wildfires').sort((a, b) => (a.e.date < b.e.date ? 1 : -1)).slice(0, 5)
      .forEach(({ e, i }) => items.push({ kind: 'event', i, color: EVENT_COLORS[e.category] || '#ffd166', title: e.title, sub: `${e.categoryTitle} · ${e.source} · ${fmtDate(e.date)}`, lat: e.lat, lon: e.lon }));
  }
  if (d.nisar?.granules?.length) {
    d.nisar.granules.slice(-3).reverse().forEach((g) => {
      const i = d.nisar.granules.indexOf(g);
      const c = g.ring.reduce((a, p) => [a[0] + p[0] / g.ring.length, a[1] + p[1] / g.ring.length], [0, 0]);
      items.push({ kind: 'nisar', i, color: LIVE_COLORS.nisarGCOV, title: `New NISAR ${g.type} image`, sub: `${fmtCoord(c[1], c[0], 1)} · ${ago(Date.parse(g.t))}`, lat: c[1], lon: c[0] });
    });
  }
  el.innerHTML = `<button class="close-x" data-act="close-feed" aria-label="Close">✕</button>
    <h2>WHAT’S HAPPENING ON EARTH</h2>
    <ul class="feed">${items.map((it, j) => `<li><button data-feed="${j}"><i style="background:${it.color}"></i><span><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></span></button></li>`).join('')}</ul>
    <p class="fine">${freshnessPill(live.status.quakes)} USGS · ${freshnessPill(live.status.fires)} FIRMS · ${freshnessPill(live.status.events)} EONET/GDACS · ${freshnessPill(live.status.nisar)} NISAR</p>`;
  return items;
}

export function tooltipText(pick, live) {
  const d = live.data;
  if (pick.kind === 'satellite') return pick.name || 'Satellite';
  if (pick.kind === 'story') return 'Earth story: click to explore';
  if (pick.kind === 'fire') return `Fire · ${d.fires.satellites[pick.record[4]]} · ${pick.record[2]} MW`;
  if (pick.kind === 'quake') return `M${pick.record[3].toFixed(1)} · ${pick.record[6] || ''}`;
  if (pick.kind === 'event') return `${pick.record.categoryTitle}: ${pick.record.title}`;
  if (pick.kind === 'radar') return `NISAR change hotspot · ${Math.round(pick.record.score * 100)}% of frame changed · click to compare`;
  if (pick.kind === 'nisar') return `NISAR ${pick.record.type} · ${pick.record.t.slice(0, 16).replace('T', ' ')} UTC`;
  return '';
}
