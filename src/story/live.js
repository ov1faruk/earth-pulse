// Chapter 3: live disaster console — a filterable globe of open events and
// recent earthquakes, with a real-time feed and alerts.
// (Written with AI assistance — see README → AI disclosure.)
import { $, esc, liveOrArchived, srcLine, how, errorBox, ago, fmtDay, pill } from './lib.js';

const TYPES = {
  earthquake: { label: 'Earthquakes', color: '#ffb347' },
  wildfires: { label: 'Wildfires', color: '#ff5f4d' },
  severeStorms: { label: 'Storms', color: '#48d6ff' },
  volcanoes: { label: 'Volcanoes', color: '#ff5fa2' },
  floods: { label: 'Floods', color: '#5b8cff' },
  drought: { label: 'Drought', color: '#d9a066' },
  seaLakeIce: { label: 'Sea & lake ice', color: '#c8e9ff' },
  other: { label: 'Other', color: '#9be15d' },
};
const REGIONS = {
  world: ['World', null], asia: ['Asia', [-11, 25, 78, 180]], europe: ['Europe', [34, -25, 72, 45]], africa: ['Africa', [-36, -19, 38, 52]],
  namerica: ['North America', [7, -170, 84, -50]], samerica: ['South America', [-57, -83, 13, -33]], oceania: ['Oceania', [-50, 110, 0, 180]],
};
const WINDOWS = { 1: '24 hours', 7: '7 days', 30: '30 days' };

const state = { types: new Set(Object.keys(TYPES)), region: 'world', days: 7, minMag: 4.5, items: [], freshness: {}, viewer: null, Cesium: null, points: null, selected: null };

function normalise(events, quakes) {
  const items = [];
  for (const e of events?.events || []) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    const type = TYPES[e.category] ? e.category : 'other';
    items.push({ id: e.id, type, title: e.title, lat: e.lat, lon: e.lon, t: Date.parse(e.date), detail: [e.categoryTitle, e.magnitude].filter(Boolean).join(' · '), url: e.url, source: e.source, alert: false });
  }
  for (const q of quakes?.quakes || []) {
    const [lon, lat, depth, mag, t, id, place, tsunami, pager] = q;
    items.push({ id: `usgs:${id}`, type: 'earthquake', title: `M ${mag.toFixed(1)} — ${place}`, lat, lon, t, mag, detail: `Depth ${Math.round(depth)} km${tsunami ? ' · tsunami message issued' : ''}${pager ? ` · PAGER ${pager}` : ''}`, url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`, source: 'USGS', alert: mag >= 6 || !!tsunami || ['orange', 'red'].includes(pager) });
  }
  return items.sort((a, b) => b.t - a.t);
}

function visible() {
  const since = Date.now() - state.days * 864e5;
  const box = REGIONS[state.region][1];
  return state.items.filter((i) => state.types.has(i.type)
    // Open events (fires, storms, volcanoes…) stay on the map while they are open; the time window applies to earthquakes.
    && (i.type !== 'earthquake' || (i.t >= since && i.mag >= state.minMag))
    && (!box || (i.lat >= box[0] && i.lat <= box[2] && i.lon >= box[1] && i.lon <= box[3])));
}

function renderFilters() {
  const counts = {};
  const since = Date.now() - state.days * 864e5;
  for (const i of state.items) if (i.type !== 'earthquake' || (i.t >= since && i.mag >= state.minMag)) counts[i.type] = (counts[i.type] || 0) + 1;
  $('#filters').innerHTML = Object.entries(TYPES).filter(([k]) => counts[k]).map(([k, t]) => `<button class="chip" data-type="${k}" aria-pressed="${state.types.has(k)}" style="--c:${t.color}"><i></i>${t.label} <b>${counts[k]}</b></button>`).join('')
    + `<select id="f-region" aria-label="Region">${Object.entries(REGIONS).map(([k, r]) => `<option value="${k}"${k === state.region ? ' selected' : ''}>${r[0]}</option>`).join('')}</select>`
    + `<select id="f-days" aria-label="Earthquake time window">${Object.entries(WINDOWS).map(([k, l]) => `<option value="${k}"${Number(k) === state.days ? ' selected' : ''}>Quakes: last ${l}</option>`).join('')}</select>`
    + `<select id="f-mag" aria-label="Minimum magnitude">${[2.5, 4.5, 5.5, 6.5].map((m) => `<option value="${m}"${m === state.minMag ? ' selected' : ''}>M ${m}+</option>`).join('')}</select>`;
}

function renderFeed() {
  const list = visible().filter((i) => i.type !== 'wildfires' || i.t > Date.now() - 3 * 864e5).slice(0, 80);
  const alerts = list.filter((i) => i.alert).length;
  const f = state.freshness;
  $('#feed').innerHTML = `<div class="feed-head"><span>Live feed${alerts ? ` · <span style="color:var(--severe)">${alerts} alert${alerts > 1 ? 's' : ''}</span>` : ''}</span>${pill(f.events === 'ARCHIVED' || f.quakes === 'ARCHIVED' ? 'ARCHIVED' : 'LIVE')}</div>
    <div class="feed-list">${list.map((i) => `<button class="feed-item${i.alert ? ' alert' : ''}" data-id="${esc(i.id)}" style="--c:${TYPES[i.type].color}"><i></i><div><strong>${esc(i.title)}</strong><span>${esc(TYPES[i.type].label.toUpperCase())} · ${ago(i.t)} · ${esc(i.source)}</span></div></button>`).join('') || '<p style="padding:16px;color:var(--ink-3)">Nothing matches these filters.</p>'}</div>
    <div class="feed-foot">${visible().length.toLocaleString()} items on the map · refreshes every 5 minutes · alerts are earthquakes of M 6+, tsunami messages, or USGS PAGER orange/red</div>`;
}

function showCard(i) {
  state.selected = i;
  const card = $('#pick-card');
  card.hidden = false;
  card.innerHTML = `<button class="close" aria-label="Close">×</button><h4>${esc(i.title)}</h4><p>${esc(i.detail || '')}</p>
    <p class="mono" style="font-size:11px;margin-top:6px;color:var(--ink-3)">${fmtDay(i.t)} · ${i.lat.toFixed(2)}°, ${i.lon.toFixed(2)}° · ${esc(i.source)}</p>
    <p style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn small" href="${esc(i.url)}" target="_blank" rel="noopener">Source record</a><a class="btn small" href="/?change=${i.lat.toFixed(3)},${i.lon.toFixed(3)}">Compare NISAR passes here</a></p>`;
  if (state.viewer) {
    const C = state.Cesium;
    state.viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(i.lon, i.lat, 2.2e6), duration: 1.6 });
  }
}

function drawPoints() {
  if (!state.viewer) return;
  const C = state.Cesium;
  state.points.removeAll();
  for (const i of visible()) {
    const size = i.type === 'earthquake' ? 4 + Math.max(0, i.mag - 4) * 3.2 : i.type === 'wildfires' ? 4 : 8;
    state.points.add({
      position: C.Cartesian3.fromDegrees(i.lon, i.lat), pixelSize: size, color: C.Color.fromCssColorString(TYPES[i.type].color).withAlpha(i.type === 'wildfires' ? 0.75 : 0.92),
      outlineColor: C.Color.BLACK.withAlpha(0.6), outlineWidth: 1, id: i, disableDepthTestDistance: 0,
    });
  }
}

async function startGlobe() {
  if (state.viewer) return;
  const poster = $('#globe-poster');
  poster.innerHTML = '<span class="loading-ring" style="position:static;margin:0"></span><span>LOADING 3D EARTH…</span>';
  try {
    const [C, { createGlobe }] = await Promise.all([import('cesium'), import('../globe/viewer.js')]);
    const viewer = await createGlobe({ container: $('#live-globe'), creditContainer: $('#live-credits') });
    state.Cesium = C; state.viewer = viewer;
    viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(85, 20, 1.55e7) });
    viewer.pulseSetLighting(false); // evidence view: every point readable, day or night
    // The page scrolls with the wheel; zoom the globe with pinch, right-drag or the buttons instead.
    viewer.scene.screenSpaceCameraController.zoomEventTypes = [C.CameraEventType.RIGHT_DRAG, C.CameraEventType.PINCH];
    state.points = viewer.scene.primitives.add(new C.PointPrimitiveCollection());
    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const hit = viewer.scene.pick(click.position);
      if (hit?.id?.title) showCard(hit.id);
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    poster.remove();
    drawPoints();
    // The globe turns slowly until someone touches it.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let spin = true;
      for (const ev of ['pointerdown', 'wheel', 'touchstart']) viewer.scene.canvas.addEventListener(ev, () => { spin = false; }, { passive: true });
      $('#feed').addEventListener('click', () => { spin = false; });
      $('#filters').addEventListener('change', () => { spin = false; });
      viewer.clock.onTick.addEventListener(() => { if (spin) viewer.camera.rotate(C.Cartesian3.UNIT_Z, -0.0009); });
    }
  } catch (e) {
    console.error(e);
    poster.innerHTML = `<div style="max-width:320px">${errorBox('The 3D globe', 'Your browser could not start WebGL. The feed on the right still works.')}</div>`;
  }
}

async function load() {
  const [events, quakes] = await Promise.all([
    liveOrArchived('/api/live/events', '/data/live/events.json', { timeout: 60000 }).catch(() => null),
    liveOrArchived('/api/live/quakes', '/data/live/quakes.json', { timeout: 60000 }).catch(() => null),
  ]);
  if (!events && !quakes) throw new Error('no feeds');
  state.items = normalise(events, quakes);
  state.freshness = { events: events?.freshness, quakes: quakes?.freshness };
}

export async function initLive() {
  try { await load(); } catch { $('#feed').innerHTML = errorBox('The live event feeds'); return; }
  renderFilters(); renderFeed();
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    const k = b.dataset.type;
    state.types.has(k) ? state.types.delete(k) : state.types.add(k);
    renderFilters(); renderFeed(); drawPoints();
  });
  $('#filters').addEventListener('change', (e) => {
    if (e.target.id === 'f-region') {
      state.region = e.target.value;
      const box = REGIONS[state.region][1];
      if (state.viewer) {
        const C = state.Cesium;
        state.viewer.camera.flyTo(box ? { destination: C.Rectangle.fromDegrees(box[1], box[0], box[3], box[2]), duration: 1.6 } : { destination: C.Cartesian3.fromDegrees(85, 20, 1.55e7), duration: 1.6 });
      }
    }
    if (e.target.id === 'f-days') state.days = Number(e.target.value);
    if (e.target.id === 'f-mag') state.minMag = Number(e.target.value);
    renderFilters(); renderFeed(); drawPoints();
  });
  $('#feed').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    const item = b && state.items.find((i) => i.id === b.dataset.id);
    if (item) showCard(item);
  });
  $('#pick-card').addEventListener('click', (e) => { if (e.target.closest('.close')) $('#pick-card').hidden = true; });
  $('#globe-start')?.addEventListener('click', startGlobe);
  // Start the globe automatically on larger screens; phones keep the tap-to-load poster.
  if (innerWidth >= 900 && !navigator.connection?.saveData) startGlobe();
  setInterval(async () => { try { await load(); renderFilters(); renderFeed(); drawPoints(); } catch { /* keep showing the last good data */ } }, 5 * 60000);

  $('#ch3').insertAdjacentHTML('beforeend', srcLine(['eonet', 'gdacs', 'usgs'], { freshness: state.freshness.events === 'ARCHIVED' ? 'ARCHIVED' : 'LIVE' })
    + how('<p>Open natural events come from NASA EONET and GDACS; earthquakes from the USGS 30-day feed (M 2.5+). Events stay on the map while their source lists them as open. The time and magnitude filters apply to earthquakes. Drag to rotate; pinch or right-drag to zoom. Click any point for its source record, or to compare NISAR radar passes at that spot on the main globe.</p>', 'How this map works'));
}
