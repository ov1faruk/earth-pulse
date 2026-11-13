// MISSION CONTROL — turns the globe into a working tool:
//   LAYERS  NASA / JPL observation layers draped on the globe, with a day-by-day time-lapse
//   PROBE   click any place (or search, or use your location) → hazard-signal index,
//           landslide history, what to do, and a jump into the NISAR change engine
//   ALERTS  live earthquakes and open events, click to fly there and probe
//   EARTH   today's full-disc photos of Earth from DSCOVR/EPIC, played as a rotation
// Every panel names its source. Nothing is simulated.
// (Written with AI assistance — see README → AI disclosure.)
import * as Cesium from 'cesium';
import './mc.css';
import { $, esc, toast } from '../ui/dom.js';
import { riskLevel, METHOD, haversineKm, scoreSignals } from '../core/risk.js';
import { HAZARD_GUIDE, EVENTS, TYPE_META, SOURCES } from '../story/data.js';
import { REGISTRY } from './registry.js';
import { sfx, mountSoundToggle, clickFeedback } from './sound.js';

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
// level = deepest tile level GIBS serves; lag = days behind real time the product usually is.
export const MC_LAYERS = [
  { id: 'radar', gibs: 'OPERA_L2_Radiometric_Terrain_Corrected_SAR_Sentinel-1', level: 12, lag: 1, group: 'Radar (SAR)', name: 'Radar backscatter', by: 'OPERA · NASA JPL · Sentinel-1 C-band', use: 'The same kind of measurement NISAR makes: bright is rough or built-up, dark is smooth water. Works through cloud and at night. Zoom in — it is drawn in orbit strips.', color: '#c8a6ff' },
  { id: 'water', gibs: 'OPERA_L3_Dynamic_Surface_Water_Extent-Sentinel-1', level: 12, lag: 1, group: 'Radar (SAR)', name: 'Surface water from radar', by: 'OPERA DSWx-S1 · NASA JPL', use: 'Where radar sees open water today. Compare with a normal day to find flooding under cloud.', color: '#48d6ff' },
  { id: 'flood', gibs: 'MODIS_Combined_Flood_3-Day', level: 9, lag: 1, group: 'Water', name: 'Flood detection, 3-day', by: 'MODIS · NASA LANCE', use: 'Red marks unusual water against the normal water map. Cloud leaves gaps.', color: '#ff5f4d' },
  { id: 'rain', gibs: 'IMERG_Precipitation_Rate', level: 6, lag: 2, group: 'Water', name: 'Rainfall rate', by: 'GPM IMERG · NASA GSFC', use: 'Where it is raining and how hard. Days of heavy rain on one place is the flood and landslide signal.', color: '#5b8cff' },
  { id: 'soil', gibs: 'SMAP_L4_Analyzed_Surface_Soil_Moisture', level: 6, lag: 3, group: 'Water', name: 'Soil moisture', by: 'SMAP L4 · NASA JPL', use: 'Wet soil cannot absorb more rain (flood, landslide); very dry soil means drought and fire weather.', color: '#9be15d' },
  { id: 'disturb', gibs: 'OPERA_L3_DIST-ALERT-HLS_Color_Index', level: 12, lag: 8, group: 'Land', name: 'Vegetation disturbance alerts', by: 'OPERA DIST-ALERT · NASA JPL', use: 'New loss of vegetation: clearing, burn scars, storm damage. Zoom in to see it.', color: '#ffb347' },
  { id: 'heat', gibs: 'MODIS_Terra_Land_Surface_Temp_Day', level: 7, lag: 1, group: 'Land', name: 'Land surface temperature', by: 'MODIS Terra · NASA', use: 'How hot the ground is by day. Heatwaves and urban heat islands stand out.', color: '#ff7a5c' },
  { id: 'snow', gibs: 'MODIS_Terra_NDSI_Snow_Cover', level: 8, lag: 1, group: 'Land', name: 'Snow cover', by: 'MODIS Terra · NASA NSIDC DAAC', use: 'Snow and ice extent — the water store above mountain valleys.', color: '#c8e9ff' },
  { id: 'sst', gibs: 'GHRSST_L4_MUR_Sea_Surface_Temperature', level: 7, lag: 2, group: 'Ocean & air', name: 'Sea surface temperature', by: 'MUR · NASA JPL PO.DAAC', use: 'Warm seas feed cyclones. Look for the hot pools ahead of a storm.', color: '#ff9447' },
  { id: 'aerosol', gibs: 'MODIS_Terra_Aerosol', level: 6, lag: 1, group: 'Ocean & air', name: 'Smoke and dust (aerosol)', by: 'MODIS Terra · NASA', use: 'Wildfire smoke, dust storms and haze — the air-quality footprint of a disaster.', color: '#d9a066' },
  { id: 'true', gibs: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', level: 9, ext: 'jpg', lag: 1, group: 'Ocean & air', name: 'Earth in true colour', by: 'VIIRS NOAA-20 · NASA GIBS', use: 'What the planet looked like on that day: storms, smoke plumes, snow.', color: '#f2f5f8', alpha: 1 },
  { id: 'pop', gibs: 'GPW_Population_Density_2020', level: 7, static: true, group: 'Who and what is exposed', name: 'Population density, 2020', by: 'GPW v4 · NASA SEDAC · data.nasa.gov', use: 'Where people live. A hazard only becomes a disaster where it meets people.', color: '#ffd166', alpha: 0.7 },
  { id: 'built', gibs: 'Landsat_Human_Built-up_And_Settlement_Extent', level: 12, static: true, group: 'Who and what is exposed', name: 'Built-up and settlement extent', by: 'Landsat HBASE · NASA SEDAC', use: 'Buildings and paved ground — what stands in the way. Zoom in.', color: '#ff9447', alpha: 0.75 },
  { id: 'slidehaz', gibs: 'NDH_Landslide_Hazard_Distribution_2000', level: 7, static: true, group: 'Long-term hazard maps', name: 'Landslide hazard', by: 'Natural Disaster Hotspots · NASA SEDAC · data.nasa.gov', use: 'Where slopes, soils and rain make landslides most likely over the long term.', color: '#c8a6ff', alpha: 0.75 },
  { id: 'floodhaz', gibs: 'NDH_Flood_Hazard_Frequency_Distribution_1985-2003', level: 7, static: true, group: 'Long-term hazard maps', name: 'Flood frequency, 1985–2003', by: 'Natural Disaster Hotspots · NASA SEDAC · data.nasa.gov', use: 'How often each place flooded in the historical record.', color: '#5b8cff', alpha: 0.75 },
  { id: 'floodrisk', gibs: 'NDH_Flood_Mortality_Risks_Distribution_2000', level: 7, static: true, group: 'Long-term hazard maps', name: 'Flood mortality risk', by: 'Natural Disaster Hotspots · NASA SEDAC · data.nasa.gov', use: 'Where floods have been most deadly relative to the people living there.', color: '#ff5fa2', alpha: 0.75 },
  { id: 'cyclonehaz', gibs: 'NDH_Cyclone_Hazard_Frequency_Distribution_1980-2000', level: 7, static: true, group: 'Long-term hazard maps', name: 'Cyclone frequency, 1980–2000', by: 'Natural Disaster Hotspots · NASA SEDAC', use: 'The world\'s cyclone belts — and why a storm outside them, like Senyar, is so unusual.', color: '#48d6ff', alpha: 0.75 },
  { id: 'droughthaz', gibs: 'NDH_Drought_Hazard_Frequency_Distribution_1980-2000', level: 7, static: true, group: 'Long-term hazard maps', name: 'Drought frequency, 1980–2000', by: 'Natural Disaster Hotspots · NASA SEDAC', use: 'Where droughts recur. Compare with today\'s soil moisture.', color: '#d9a066', alpha: 0.75 },
  { id: 'volcanohaz', gibs: 'NDH_Volcano_Hazard_Frequency_Distribution_1979-2000', level: 7, static: true, group: 'Long-term hazard maps', name: 'Volcano hazard, 1979–2000', by: 'Natural Disaster Hotspots · NASA SEDAC', use: 'Where eruptions have recurred.', color: '#ff7a5c', alpha: 0.8 },
];
// Which layers and NASA references matter for each kind of event.
const EVENT_CONTEXT = { cyclone: ['cyclonehaz', 'floodhaz', 'pop', 'rain'], earthquake: ['pop', 'built', 'slidehaz'], wildfire: ['disturb', 'aerosol', 'heat'], glacier: ['slidehaz', 'snow', 'pop'] };
const EVENT_REFS = {
  all: [['NASA Disasters Mapping Portal', 'https://data.nasa.gov/dataset/nasa-disasters-mapping-portal']],
  earthquake: [['JPL ARIA damage and displacement maps', 'https://aria.jpl.nasa.gov/']],
  cyclone: [['NASA LHASA landslide nowcast', 'https://data.nasa.gov/dataset/?q=landslide+nowcast']],
  glacier: [['High Mountain Asia glacial lake inventory (NSIDC)', 'https://data.nasa.gov/dataset/?q=glacial+lake+inventory'], ['NASA LHASA landslide nowcast', 'https://data.nasa.gov/dataset/?q=landslide+nowcast']],
  wildfire: [['NASA FIRMS fire map', 'https://firms.modaps.eosdis.nasa.gov/map/']],
};
const TABS = [['probe', 'PROBE'], ['layers', 'LAYERS'], ['alerts', 'ALERTS'], ['events', 'EVENTS'], ['earth', 'EARTH'], ['data', 'DATA']];
const DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 864e5));
const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const getJson = async (url, timeout = 60000) => { const r = await fetch(url, { signal: AbortSignal.timeout(timeout) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createMissionControl(app) {
  const { viewer } = app;
  const dock = $('#mc');
  const st = { tab: 'layers', open: innerWidth >= 1180, active: new Map(), date: null, playing: null, slides: null, slideLayer: null, probe: null, alerts: [], epic: null, epicTimer: null, marker: null };

  dock.innerHTML = `<header class="mc-head"><span class="mc-title"><i class="mc-live"></i>MISSION CONTROL</span><button class="mc-x" data-a="close" aria-label="Close mission control">×</button></header>
    <div class="mc-vitals" id="mc-vitals"></div>
    <nav class="mc-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}">${l}<b id="mc-badge-${k}" hidden></b></button>`).join('')}</nav>
    <div class="mc-body" id="mc-body"></div>`;
  const body = $('#mc-body');

  // ---------- vital-sign ticker ----------
  getJson('/api/vitals').catch(() => getJson('/data/story/vitals.json')).then((v) => {
    const items = [];
    if (v.temperature?.last12MonthMean != null) items.push(['TEMP', `+${(v.temperature.last12MonthMean + v.temperature.baselineShift).toFixed(2)} °C`, '#ff7a5c']);
    if (v.co2?.latestMonth) items.push(['CO₂', `${v.co2.latestMonth.ppm.toFixed(1)} ppm`, '#ffd166']);
    if (v.seaLevel?.riseSinceStartMm) items.push(['SEA', `+${Math.round(v.seaLevel.riseSinceStartMm)} mm`, '#48d6ff']);
    if (v.seaIce?.latest) items.push(['ICE', `${v.seaIce.latest.extent.toFixed(2)} M km²`, '#c8e9ff']);
    $('#mc-vitals').innerHTML = items.map(([k, val, c]) => `<a href="#" data-a="film" style="--c:${c}" title="Earth's vital signs — play the mission"><span>${k}</span><b>${esc(val)}</b></a>`).join('');
  }).catch(() => {});

  // ---------- LAYERS ----------
  function gibsLayer(l, date) {
    return new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
      url: `${GIBS}/${l.gibs}/default/${l.static ? 'default' : date || 'default'}/GoogleMapsCompatible_Level${l.level}/{z}/{y}/{x}.${l.ext || 'png'}`,
      maximumLevel: l.level, tilingScheme: new Cesium.WebMercatorTilingScheme(),
      credit: new Cesium.Credit(`${l.name}: ${l.by} · NASA GIBS`),
    }), { alpha: l.alpha ?? 0.82 });
  }
  function syncLighting() {
    // Evidence view: overlays must be readable on the night side too.
    if (app.state.view === 'home') viewer.pulseSetLighting(st.active.size === 0 && !st.slides && !st.probe && !st.event);
  }
  function setLayer(l, on) {
    const cur = st.active.get(l.id);
    if (cur) { viewer.imageryLayers.remove(cur, true); st.active.delete(l.id); }
    if (on) { const layer = gibsLayer(l, st.date); viewer.imageryLayers.add(layer); st.active.set(l.id, layer); app.cam.idleSpin(false); }
    syncLighting();
  }
  function setDate(date) {
    st.date = date;
    for (const [id, old] of [...st.active]) {
      const l = MC_LAYERS.find((x) => x.id === id);
      const next = gibsLayer(l, date);
      viewer.imageryLayers.add(next); st.active.set(id, next);
      setTimeout(() => viewer.imageryLayers.remove(old, true), 1300); // cross-over without a flash
    }
    const lab = $('#mc-date'); if (lab) lab.textContent = date ? fmt(date) : 'LATEST AVAILABLE';
    const rng = $('#mc-range'); if (rng && date) rng.value = String(13 - Math.round((Date.parse(daysAgo(0)) - Date.parse(date)) / 864e5));
  }
  function play() {
    if (st.playing) { clearInterval(st.playing); st.playing = null; renderLayers(); return; }
    if (!st.active.size) { toast('Switch on a layer first, then play it through time.'); return; }
    let k = 0;
    const step = () => { setDate(daysAgo(13 - (k % 12))); k++; };
    step();
    st.playing = setInterval(step, 2600);
    renderLayers();
  }
  async function toggleSlides(on) {
    if (st.slideLayer) { viewer.scene.primitives.remove(st.slideLayer); st.slideLayer = null; }
    st.slides = null;
    if (on) {
      try {
        const d = await getJson('/data/context/landslides.json');
        const pts = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
        for (const e of d.events) {
          pts.add({ position: Cesium.Cartesian3.fromDegrees(e[0], e[1]), pixelSize: 3 + Math.min(9, Math.sqrt(e[3])), color: Cesium.Color.fromCssColorString(e[3] > 0 ? '#ff5fa2' : '#c8a6ff').withAlpha(e[3] > 0 ? 0.9 : 0.5), outlineColor: Cesium.Color.BLACK.withAlpha(0.5), outlineWidth: 1, id: { glc: e, meta: d } });
        }
        st.slideLayer = pts; st.slides = d; app.cam.idleSpin(false);
      } catch { toast('The landslide catalog could not be loaded.'); }
    }
    syncLighting(); renderLayers();
  }
  function renderLayers() {
    const groups = {};
    for (const l of MC_LAYERS) (groups[l.group] ||= []).push(l);
    body.innerHTML = `<div class="mc-time"><button class="mc-play" data-a="play" aria-pressed="${!!st.playing}">${st.playing ? '❚❚' : '▶'}</button><div><span class="mc-k">OBSERVATION DATE</span><b id="mc-date">${st.date ? fmt(st.date) : 'LATEST AVAILABLE'}</b></div><button class="mc-mini" data-a="latest">LATEST</button></div>
      <input class="mc-range" id="mc-range" type="range" min="0" max="13" value="${st.date ? 13 - Math.round((Date.parse(daysAgo(0)) - Date.parse(st.date)) / 864e5) : 13}" aria-label="Observation date, last 14 days" />
      ${Object.entries(groups).map(([g, list]) => `<h4>${esc(g)}</h4>${list.map((l) => `<button class="mc-layer" data-layer="${l.id}" aria-pressed="${st.active.has(l.id)}" style="--c:${l.color}"><i></i><span><strong>${esc(l.name)}</strong><em>${esc(l.by)}</em>${st.active.has(l.id) ? `<small>${esc(l.use)}</small>` : ''}</span></button>`).join('')}`).join('')}
      <h4>History</h4><button class="mc-layer" data-a="slides" aria-pressed="${!!st.slides}" style="--c:#ff5fa2"><i></i><span><strong>Landslide catalog, 1988–2017</strong><em>NASA Global Landslide Catalog · data.nasa.gov</em>${st.slides ? `<small>${st.slides.events.length.toLocaleString()} recorded landslides; pink ones were fatal. Click a point for its record. Where it happened before, it can happen again.</small>` : ''}</span></button>
      <p class="mc-src">Imagery: <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noopener">NASA GIBS</a> · OPERA and SMAP: <a href="https://www.jpl.nasa.gov/go/opera" target="_blank" rel="noopener">NASA JPL</a>. Layers show the product for the chosen day; a product that has not been published for that day yet stays empty.</p>`;
  }

  // ---------- PROBE ----------
  function mark(lat, lon) {
    viewer.pulseSetLighting(false); // a probed place must be readable even on the night side
    if (st.marker) viewer.entities.remove(st.marker);
    st.marker = viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(lon, lat), point: { pixelSize: 12, color: Cesium.Color.fromCssColorString('#7fe6ff'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
  }
  async function nearbySlides(lat, lon) {
    try {
      const d = st.slides || await getJson('/data/context/landslides.json');
      const near = d.events.filter((e) => Math.abs(e[1] - lat) < 0.6 && haversineKm(lat, lon, e[1], e[0]) <= 50);
      return { count: near.length, deaths: near.reduce((a, e) => a + e[3], 0), last: near.at(-1)?.[2] || null, first: d.firstDate, lastAll: d.lastDate };
    } catch { return null; }
  }
  async function probe(lat, lon, name) {
    setTab('probe');
    st.probe = { lat, lon, name, loading: true };
    mark(lat, lon); renderProbe();
    try {
      const [risk, slides] = await Promise.all([getJson(`/api/risk?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}${name ? `&name=${encodeURIComponent(name)}` : ''}`, 90000), nearbySlides(lat, lon)]);
      if (st.probe?.lat !== lat) return;
      st.probe = { lat, lon, name, risk, slides, whatIf: 0 };
      sfx.result(risk.overall);
      // The forecast arrives separately so today's reading is never held up by it.
      getJson(`/api/outlook?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`, 45000).catch(() => null).then((o) => { if (st.probe?.lat === lat && st.probe.risk) { st.probe.outlook = o; if (st.tab === 'probe') renderProbe(); } });
    } catch { if (st.probe?.lat === lat) st.probe = { lat, lon, name, error: true }; }
    renderProbe();
  }
  /** Project the index 7 days ahead: 23 observed days + 7 forecast days (+ a what-if amount), same formulas as today. */
  function projected(p, extraMm = 0) {
    const o = p.outlook;
    if (!o?.basis) return null;
    const fRain = o.days.reduce((a, d) => a + d.rainMm, 0) + extraMm, fNorm = o.days.reduce((a, d) => a + (d.normalRainMm || 0), 0);
    const observed = o.basis.observedMm + fRain, normal = o.basis.normalMm + fNorm;
    const tMean = o.days.reduce((a, d) => a + (d.tmax + d.tmin) / 2, 0) / o.days.length, tNorm = o.days.reduce((a, d) => a + (d.normalTempC ?? 0), 0) / o.days.length;
    const s = scoreSignals({ rain: { observed, normal }, heat: { observed: tMean, normal: tNorm } }).scores;
    return { wet: s.wet, dry: s.dry, heat: s.heat, observed: Math.round(observed), normal: Math.round(normal), tAnom: tMean - tNorm };
  }
  const projLine = (p, extra) => {
    const pr = projected(p, extra);
    if (!pr) return '<span>Not enough recent rainfall data to project the signal.</span>';
    const now = p.risk.scores.wet ?? 0, col = riskLevel(pr.wet).color;
    return `<span>Rain-surplus signal</span><b>${now}</b><i>→</i><b style="color:${col}">${pr.wet}</b><em>in 7 days · projected 30-day rain ${pr.observed} mm vs normal ${pr.normal} mm</em>`;
  };
  function outlookHtml(p) {
    const o = p.outlook;
    if (o === undefined) return '<h4>Next 7 days</h4><div class="mc-scan"><i></i><span>Loading the forecast…</span></div>';
    if (!o) return '<h4>Next 7 days</h4><p class="mc-err">The forecast service did not answer. No outlook is shown.</p>';
    const max = Math.max(8, ...o.days.map((d) => Math.max(d.rainMm, d.normalRainMm || 0)));
    const sum = o.days.reduce((a, d) => a + d.rainMm, 0), wettest = o.days.reduce((a, d) => (d.rainMm > a.rainMm ? d : a));
    const hot = o.days.reduce((a, d) => (d.tmax > a.tmax ? d : a)), gust = Math.max(...o.days.map((d) => d.gustKmh || 0));
    const pr = projected(p, 0);
    return `<h4>Next 7 days · forecast</h4>
      <div class="mc-days">${o.days.map((d, k) => `<div class="mc-day" title="${d.date}: ${d.rainMm} mm rain, ${d.tmin}–${d.tmax} °C"><b>${d.rainMm >= 1 ? Math.round(d.rainMm) : ''}</b><i style="height:${Math.max(2, (d.rainMm / max) * 100)}%;animation-delay:${k * 70}ms"></i>${d.normalRainMm != null ? `<u style="bottom:${(d.normalRainMm / max) * 100}%"></u>` : ''}<span>${DAY[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}</span></div>`).join('')}</div>
      <p class="mc-out"><b>${Math.round(sum)} mm</b> of rain expected${sum >= 1 ? `, most on ${DAY[new Date(`${wettest.date}T00:00:00Z`).getUTCDay()]} (${Math.round(wettest.rainMm)} mm)` : ''}. Highs to <b>${Math.round(hot.tmax)} °C</b>${pr ? ` (${pr.tAnom >= 0 ? '+' : ''}${pr.tAnom.toFixed(1)} °C vs normal)` : ''}, gusts to ${Math.round(gust)} km/h.${o.river ? ` River flow nearby: <b>${o.river.today} m³/s</b> today${o.river.changePct > 5 ? `, rising to ${o.river.peak} m³/s (+${o.river.changePct}%) by ${DAY[new Date(`${o.river.peakDate}T00:00:00Z`).getUTCDay()]}` : ', not forecast to rise'}.` : ''} <span class="mc-dash">— dashed line: normal daily rain</span></p>
      <div class="mc-proj" id="mc-proj">${projLine(p, p.whatIf || 0)}</div>
      ${pr ? `<div class="mc-whatif"><label for="mc-whatif">SIMULATE: what if <b id="mc-wi-v">+${p.whatIf || 0} mm</b> more rain falls this week?</label><input class="mc-range" id="mc-whatif" type="range" min="0" max="400" step="10" value="${p.whatIf || 0}" /></div>` : ''}
      <p class="mc-src">Forecast: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (NOAA GFS / ECMWF)${o.river ? ' · river flow: Copernicus GloFAS' : ''} — not NASA products. Normals and recent rain: NASA POWER. The projection re-runs today's rain formula on 23 observed days plus the 7 forecast days; the simulator adds your amount to that. It is an estimate of the signal, not a flood forecast.</p>`;
  }
  const measured = (k, m) => {
    if (k === 'wet' || k === 'dry') return m.rain ? `${m.rain.observedMm} mm in ${m.rain.days} d · normal ${m.rain.normalMm} mm` : 'no rainfall data';
    if (k === 'heat') return m.heat ? `${m.heat.observedC} °C · ${m.heat.anomalyC >= 0 ? '+' : ''}${m.heat.anomalyC} °C vs normal` : 'no temperature data';
    if (k === 'seismic') return m.seismic.maxMag ? `largest M ${m.seismic.maxMag} within 300 km, 30 d` : 'no M 2.5+ quake within 300 km';
    if (k === 'fire') return `${m.fire.detections} fire detections within 100 km`;
    return `${m.events.count} open events within 500 km`;
  };
  function renderProbe() {
    const p = st.probe;
    const search = `<form class="mc-search" id="mc-search" autocomplete="off"><input id="mc-q" type="search" placeholder="Search a place" aria-label="Search a place" /><button class="mc-mini" type="submit">GO</button><button class="mc-mini" type="button" data-a="locate" title="Use my location">◎ ME</button><ul id="mc-results" hidden></ul></form>`;
    if (!p) { body.innerHTML = `${search}<div class="mc-empty"><span class="mc-cross"></span><strong>Click anywhere on the globe</strong><p>You get the hazard signals being measured there right now — rain, heat, earthquakes, fires — its landslide history, and what to do about the biggest one.</p></div>`; return; }
    const where = `<div class="mc-where"><b>${esc(p.name || 'Selected place')}</b><span>${Math.abs(p.lat).toFixed(2)}° ${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(p.lon).toFixed(2)}° ${p.lon >= 0 ? 'E' : 'W'}</span></div>`;
    if (p.loading) { body.innerHTML = `${search}${where}<div class="mc-scan"><i></i><span>Reading NASA POWER, USGS, FIRMS, EONET…</span></div>`; return; }
    if (p.error) { body.innerHTML = `${search}${where}<p class="mc-err">The live data service did not answer for this place. Nothing is substituted.</p>`; return; }
    const r = p.risk, lvl = riskLevel(r.overall);
    const order = Object.entries(r.scores).sort((a, b) => b[1] - a[1]);
    const g = HAZARD_GUIDE[order[0][0]];
    body.innerHTML = `${search}${where}
      <div class="mc-gauge" style="--c:${lvl.color};--v:${r.overall}"><div class="mc-dial"><b>${r.overall}</b></div><div><span class="mc-level">${lvl.label} SIGNAL</span><p>Strongest: <b>${esc(METHOD.signals[order[0][0]].label.toLowerCase())}</b></p></div></div>
      ${order.map(([k, s]) => `<div class="mc-sig"><span><strong>${esc(METHOD.signals[k].label)}</strong><em>${esc(measured(k, r.measured))}</em></span><b>${s}</b><i><u style="width:${Math.max(2, s)}%;background:${riskLevel(s).color}"></u></i></div>`).join('')}
      ${outlookHtml(p)}
      ${p.slides ? `<div class="mc-fact"><b>${p.slides.count}</b> landslides recorded within 50 km, ${p.slides.first.slice(0, 4)}–${p.slides.lastAll.slice(0, 4)}${p.slides.count ? ` · ${p.slides.deaths} deaths · latest ${fmt(p.slides.last)}` : ''}<em>NASA Global Landslide Catalog</em></div>` : ''}
      ${ctxChips(['pop', 'slidehaz', 'floodhaz', 'rain'], 'CONTEXT ON THE GLOBE')}
      <div class="mc-act"><h4>${esc(g.title)} — what to do</h4><ul>${g.act.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>
      <div class="mc-row"><button class="mc-cta" data-a="nisar">COMPARE NISAR RADAR PASSES HERE</button></div>
      <details class="mc-how"><summary>How this is calculated</summary><p>${esc(METHOD.overall)}</p><p>${esc(METHOD.signals[order[0][0]].formula)}</p><p>${esc(METHOD.caveat)}</p><p>Weather to ${r.measured.rain ? esc(r.measured.rain.to) : '—'} · sources: NASA POWER, USGS, NASA FIRMS, NASA EONET, GDACS.</p></details>`;
  }
  async function search(q) {
    const res = $('#mc-results');
    res.hidden = false; res.innerHTML = '<li class="mc-k">SEARCHING…</li>';
    try {
      const r = await getJson(`/api/locations/search?q=${encodeURIComponent(q)}`, 12000);
      res.innerHTML = (r.results || []).slice(0, 5).map((p, k) => `<li><button type="button" data-r="${k}">${esc([p.name, p.detail].filter(Boolean).join(', '))}</button></li>`).join('') || '<li class="mc-k">NO PLACE FOUND</li>';
      res.onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b) return; const p = r.results[Number(b.dataset.r)]; flyAndProbe(p.lat, p.lon, p.name); };
    } catch { res.innerHTML = '<li class="mc-k">SEARCH UNAVAILABLE</li>'; }
  }
  const ctxChips = (ids, label) => `<div class="mc-ctx"><span class="mc-k">${label}</span>${ids.map((id) => { const l = MC_LAYERS.find((x) => x.id === id); return `<button class="mc-mini" data-ctx="${id}" aria-pressed="${st.active.has(id)}" style="--c:${l.color}"><i></i>${esc(l.name.replace(/, \d{4}.*$/, '').toUpperCase())}</button>`; }).join('')}</div>`;

  // ---------- EVENTS: the year's major disasters, worldwide ----------
  const evEntities = [];
  function addEventMarkers() {
    for (const ev of EVENTS) {
      const color = Cesium.Color.fromCssColorString(TYPE_META[ev.type].color);
      const e = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat),
        point: { pixelSize: new Cesium.CallbackProperty(() => (REDUCED ? 13 : 12 + 4 * Math.sin(performance.now() / 420 + ev.lon)), false), color: color.withAlpha(0.95), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: 0 },
        label: { text: ev.title.split(',')[0].toUpperCase(), font: '500 11px "IBM Plex Mono", monospace', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -22), distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1.6e7), disableDepthTestDistance: 0 },
      });
      e.mcEvent = ev; evEntities.push(e);
    }
  }
  function openEvent(ev, { fly = true } = {}) {
    st.event = ev; setTab('events');
    viewer.pulseSetLighting(false);
    if (fly) { app.cam.idleSpin(false); sfx.whoosh(); viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, 1.8e6), duration: REDUCED ? 0 : 2.6 }); }
    if (ev.type === 'earthquake' || ev.type === 'glacier') sfx.rumble(); else sfx.scan();
  }
  function tour() {
    if (st.tour) { clearInterval(st.tour); st.tour = null; return renderEvents(); }
    let k = Math.max(0, EVENTS.indexOf(st.event));
    openEvent(EVENTS[k]);
    st.tour = setInterval(() => { k = (k + 1) % EVENTS.length; openEvent(EVENTS[k]); }, 9000);
    renderEvents();
  }
  function renderEvents() {
    const ev = st.event;
    body.innerHTML = `<div class="mc-row" style="margin:0 0 10px"><button class="mc-cta" data-a="tour">${st.tour ? '❚❚ STOP THE TOUR' : '▶ TOUR THE YEAR\'S DISASTERS'}</button></div>
      <div class="mc-evlist">${EVENTS.map((e) => `<button class="mc-ev" data-ev="${e.id}" aria-pressed="${e === ev}" style="--c:${TYPE_META[e.type].color}"><i></i><span><strong>${esc(e.title)}</strong><em>${fmt(e.date)} · ${esc(e.place)}</em></span></button>`).join('')}</div>
      ${ev ? `<div class="mc-evcard" style="--c:${TYPE_META[ev.type].color}"><span class="mc-level" style="--c:${TYPE_META[ev.type].color}">${esc(TYPE_META[ev.type].label.toUpperCase())}</span><p>${esc(ev.what)}</p>
        <div class="mc-figs">${ev.figures.slice(0, 4).map((f) => `<div><b>${esc(f[0])}</b><span>${esc(f[1])}</span></div>`).join('')}</div>
        ${ctxChips(EVENT_CONTEXT[ev.type], 'SHOW ON THE GLOBE')}
        <div class="mc-row"><button class="mc-mini" data-a="ev-probe">CONDITIONS THERE NOW</button><button class="mc-mini" data-a="ev-nisar">NISAR PASSES</button><button class="mc-mini" data-a="ev-film">▶ PLAY ITS STORY</button></div>
        <p class="mc-src">Source: <a href="${esc(SOURCES[ev.src].url)}" target="_blank" rel="noopener">${esc(SOURCES[ev.src].label.split(' — ')[0])}</a> · figures compiled 13 Nov 2026 and still being revised.<br />Go deeper: ${[...EVENT_REFS.all, ...(EVENT_REFS[ev.type] || [])].map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join(' · ')}</p></div>` : '<p class="mc-src">Seven major disasters from 13 Nov 2025 to 13 Nov 2026 are pinned on the globe. Pick one, or take the tour.</p>'}`;
  }

  // ---------- DATA: every dataset, API and JPL resource in use ----------
  const status = new Map();
  function renderData() {
    const n = REGISTRY.reduce((a, g) => a + g.items.length, 0);
    body.innerHTML = `<p class="mc-out" style="margin-top:0"><b>${n}</b> datasets and services power this platform. A green dot means the live connection answered just now; a hollow dot is a tile or file source; an amber ring is a NASA resource we link to for depth but cannot load without a login or an open endpoint.</p>
      ${REGISTRY.map((g) => `<h4>${esc(g.group)}</h4>${g.items.map((it) => `<div class="mc-ds"><i class="${it.ref ? 'ref' : it.check ? status.get(it.check) || 'wait' : 'static'}" data-check="${esc(it.check || '')}"></i><div><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)} ↗</a><em>${esc(it.by)}</em><p>${esc(it.use)}</p><code>${it.ref ? 'REFERENCE · ' : ''}${esc(it.how)}</code></div></div>`).join('')}`).join('')}`;
    for (const check of new Set(REGISTRY.flatMap((g) => g.items.map((i) => i.check).filter(Boolean)))) {
      if (status.has(check)) continue;
      status.set(check, 'wait');
      fetch(check, { signal: AbortSignal.timeout(60000) }).then((r) => (r.ok ? 'ok' : 'down')).catch(() => 'down').then((s) => { status.set(check, s); body.querySelectorAll(`[data-check="${CSS.escape(check)}"]`).forEach((d) => { d.className = s; }); });
    }
  }

  function flyAndProbe(lat, lon, name) {
    sfx.whoosh();
    app.cam.idleSpin(false);
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, 1.4e6), duration: REDUCED ? 0 : 2 });
    probe(lat, lon, name);
  }

  // ---------- ALERTS ----------
  async function loadAlerts() {
    const [q, e] = await Promise.all([getJson('/api/live/quakes').catch(() => getJson('/data/live/quakes.json')).catch(() => null), getJson('/api/live/events').catch(() => getJson('/data/live/events.json')).catch(() => null)]);
    const since = Date.now() - 7 * 864e5, items = [];
    for (const x of q?.quakes || []) if (x[4] >= since && x[3] >= 5) items.push({ t: x[4], lat: x[1], lon: x[0], title: `M ${x[3].toFixed(1)} — ${x[6]}`, kind: 'EARTHQUAKE', color: '#ffb347', hot: x[3] >= 6 || !!x[7] || ['orange', 'red'].includes(x[8]), url: `https://earthquake.usgs.gov/earthquakes/eventpage/${x[5]}`, src: 'USGS' });
    for (const x of e?.events || []) if (x.category !== 'wildfires' && Number.isFinite(x.lat)) items.push({ t: Date.parse(x.date), lat: x.lat, lon: x.lon, title: x.title, kind: (x.categoryTitle || 'EVENT').toUpperCase(), color: '#48d6ff', hot: false, url: x.url, src: x.source });
    st.alerts = items.sort((a, b) => b.t - a.t).slice(0, 60);
    const hot = st.alerts.filter((a) => a.hot).length;
    if (st.hotSeen != null && hot > st.hotSeen) sfx.alert();
    st.hotSeen = hot;
    const badge = $('#mc-badge-alerts'); badge.hidden = !hot; badge.textContent = hot;
    $('#btn-mc')?.classList.toggle('hot', hot > 0);
    if (st.tab === 'alerts') renderAlerts();
  }
  const ago = (t) => { const m = (Date.now() - t) / 6e4; return m < 60 ? `${Math.round(m)} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  function renderAlerts() {
    body.innerHTML = st.alerts.length ? `<p class="mc-k" style="margin:0 0 8px">EARTHQUAKES M 5+ (7 DAYS) AND OPEN EVENTS · CLICK TO FLY AND PROBE</p>${st.alerts.map((a, k) => `<button class="mc-alert${a.hot ? ' hot' : ''}" data-alert="${k}" style="--c:${a.color}"><i></i><span><strong>${esc(a.title)}</strong><em>${esc(a.kind)} · ${ago(a.t)} · ${esc(a.src)}</em></span></button>`).join('')}<p class="mc-src">Sources: USGS, NASA EONET, GDACS. Red entries are M 6+, tsunami messages or PAGER orange/red. Refreshes every 5 minutes.</p>` : '<div class="mc-scan"><i></i><span>Loading live feeds…</span></div>';
  }

  // ---------- EARTH TODAY ----------
  async function renderEarth() {
    body.innerHTML = '<div class="mc-scan"><i></i><span>Fetching today\'s photos from DSCOVR…</span></div>';
    try { st.epic ||= await getJson('/api/epic', 40000); } catch { body.innerHTML = '<p class="mc-err">NASA EPIC did not answer. Nothing is substituted.</p>'; return; }
    if (st.tab !== 'earth') return;
    const im = st.epic.images;
    body.innerHTML = `<div class="mc-epic"><img id="mc-epic-img" alt="Earth photographed by DSCOVR EPIC" src="${esc(im[0].url)}" /><span class="mc-epic-t" id="mc-epic-t"></span></div>
      <input class="mc-range" id="mc-epic-range" type="range" min="0" max="${im.length - 1}" value="0" aria-label="Photo of the day" />
      <div class="mc-row"><button class="mc-mini" data-a="epic-play">${st.epicTimer ? '❚❚ PAUSE' : '▶ ROTATE'}</button><button class="mc-mini" data-a="epic-fly">FLY THE GLOBE TO THIS VIEW</button></div>
      <p class="mc-src">${im.length} real photographs of the sunlit Earth taken on ${fmt(st.epic.date)} by NASA's EPIC camera on the DSCOVR spacecraft, 1.5 million km away. Source: <a href="https://epic.gsfc.nasa.gov/" target="_blank" rel="noopener">NASA EPIC</a> via the <a href="https://api.nasa.gov/" target="_blank" rel="noopener">NASA API portal</a>.</p>`;
    const show = (k) => { const x = im[k]; $('#mc-epic-img').src = x.url; $('#mc-epic-t').textContent = `${x.time} UTC · centred ${x.lat.toFixed(0)}°, ${x.lon.toFixed(0)}°`; $('#mc-epic-range').value = k; st.epicK = k; };
    show(st.epicK || 0);
    $('#mc-epic-range').oninput = (e) => show(Number(e.target.value));
    st.epicShow = show;
    for (const x of im) { const pre = new Image(); pre.src = x.url; }
    if (!REDUCED && !st.epicTimer) toggleEpic();
  }
  function toggleEpic() {
    if (st.epicTimer) { clearInterval(st.epicTimer); st.epicTimer = null; } else st.epicTimer = setInterval(() => { if (st.tab === 'earth' && st.epic) st.epicShow(((st.epicK || 0) + 1) % st.epic.images.length); }, 900);
    const b = body.querySelector('[data-a="epic-play"]'); if (b) b.textContent = st.epicTimer ? '❚❚ PAUSE' : '▶ ROTATE';
  }

  // ---------- shell ----------
  function setTab(tab) {
    st.tab = tab;
    dock.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    document.body.classList.toggle('mc-probing', tab === 'probe' && st.open);
    if (tab !== 'earth' && st.epicTimer) { clearInterval(st.epicTimer); st.epicTimer = null; }
    if (tab !== 'events' && st.tour) { clearInterval(st.tour); st.tour = null; }
    ({ layers: renderLayers, probe: renderProbe, alerts: renderAlerts, events: renderEvents, earth: renderEarth, data: renderData })[tab]();
    dock.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function setOpen(on) {
    st.open = on;
    dock.hidden = !on;
    $('#btn-mc')?.setAttribute('aria-pressed', on);
    document.body.classList.toggle('mc-open', on);
    document.body.classList.toggle('mc-probing', on && st.tab === 'probe');
  }
  dock.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]'); if (t) return setTab(t.dataset.tab);
    const lay = e.target.closest('[data-layer]');
    if (lay) { const l = MC_LAYERS.find((x) => x.id === lay.dataset.layer); setLayer(l, !st.active.has(l.id)); sfx.toggle(st.active.has(l.id)); return renderLayers(); }
    const cx = e.target.closest('[data-ctx]');
    if (cx) { const l = MC_LAYERS.find((x) => x.id === cx.dataset.ctx); setLayer(l, !st.active.has(l.id)); sfx.toggle(st.active.has(l.id)); return st.tab === 'events' ? renderEvents() : renderProbe(); }
    const evb = e.target.closest('[data-ev]');
    if (evb) return openEvent(EVENTS.find((x) => x.id === evb.dataset.ev));
    const al = e.target.closest('[data-alert]');
    if (al) { const a = st.alerts[Number(al.dataset.alert)]; return flyAndProbe(a.lat, a.lon, a.title.replace(/^M [\d.]+ — /, '')); }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') setOpen(false);
    if (a === 'film') { e.preventDefault(); app.film?.start(0); }
    if (a === 'play') play();
    if (a === 'latest') { if (st.playing) play(); setDate(null); }
    if (a === 'slides') toggleSlides(!st.slides);
    if (a === 'nisar' && st.probe) app.change.start(st.probe.lat, st.probe.lon);
    if (a === 'tour') tour();
    if (a === 'ev-film' && st.event) app.film?.start(app.film.acts.indexOf(`ev-${st.event.id}`));
    if (a === 'ev-probe' && st.event) flyAndProbe(st.event.lat, st.event.lon, st.event.place.split(',')[0]);
    if (a === 'ev-nisar' && st.event) app.change.start(st.event.lat, st.event.lon);
    if (a === 'epic-play') toggleEpic();
    if (a === 'epic-fly' && st.epic) { const x = st.epic.images[st.epicK || 0]; app.cam.idleSpin(false); viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(x.lon, x.lat, 2.2e7), duration: REDUCED ? 0 : 2.4 }); }
    if (a === 'locate') {
      if (!navigator.geolocation) return toast('Location is not available in this browser.');
      navigator.geolocation.getCurrentPosition((pos) => flyAndProbe(pos.coords.latitude, pos.coords.longitude, 'Your location'), () => toast('Location permission was not given.'), { timeout: 10000 });
    }
  });
  dock.addEventListener('input', (e) => {
    if (e.target.id === 'mc-range') { if (st.playing) play(); setDate(daysAgo(13 - Number(e.target.value))); }
    if (e.target.id === 'mc-whatif' && st.probe) {
      // Update in place so the slider keeps focus while it is dragged.
      st.probe.whatIf = Number(e.target.value);
      $('#mc-wi-v').textContent = `+${st.probe.whatIf} mm`;
      $('#mc-proj').innerHTML = projLine(st.probe, st.probe.whatIf);
      const pr = projected(st.probe, st.probe.whatIf);
      if (pr && pr.wet !== st.lastWet) { st.lastWet = pr.wet; sfx.step(Math.round(pr.wet / 12)); }
    }
  });
  dock.addEventListener('submit', (e) => { if (e.target.id === 'mc-search') { e.preventDefault(); const q = $('#mc-q').value.trim(); if (q.length > 1) search(q); } });
  $('#btn-mc')?.addEventListener('click', () => setOpen(!st.open));

  // Globe clicks: landslide records always answer; other clicks probe while the PROBE tab is open.
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click) => {
    if (!st.open || app.state.view !== 'home' || app.state.demoRunning) return;
    const hit = viewer.scene.pick(click.position);
    if (hit?.id?.mcEvent) return openEvent(hit.id.mcEvent);
    if (hit?.id?.glc) {
      const e = hit.id.glc, m = hit.id.meta;
      toast(`${e[6] || 'Landslide'} · ${fmt(e[2])} · ${m.triggers[e[4]]} · ${e[3]} death${e[3] === 1 ? '' : 's'} — NASA Global Landslide Catalog`, 6500);
      return;
    }
    if (st.tab !== 'probe' || hit) return;
    const cart = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
    if (!cart) return;
    const c = Cesium.Cartographic.fromCartesian(cart);
    probe(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude));
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Step aside while a story, the demo or Science Mode owns the screen.
  setInterval(() => { dock.classList.toggle('away', app.state.view !== 'home' || !!app.state.demoRunning); }, 600);

  addEventMarkers();
  mountSoundToggle($('#btn-sound'));
  clickFeedback('button, a.ghost-btn, .mc-mini');
  setOpen(st.open);
  setTab('probe');
  // Deep links from the story page: /?event=<id> and /?probe=lat,lon,name
  const qs = new URLSearchParams(location.search);
  const evq = EVENTS.find((x) => x.id === qs.get('event'));
  if (evq) { setOpen(true); setTimeout(() => openEvent(evq), 1200); }
  const pq = (qs.get('probe') || '').split(',');
  if (pq.length >= 2 && Number.isFinite(+pq[0]) && Number.isFinite(+pq[1])) { setOpen(true); setTimeout(() => flyAndProbe(+pq[0], +pq[1], pq.slice(2).join(',') || undefined), 1200); }
  loadAlerts().catch(() => {});
  setInterval(() => loadAlerts().catch(() => {}), 5 * 60000);
  return { setOpen, setTab, probe: flyAndProbe, setLayer: (id, on) => { const l = MC_LAYERS.find((x) => x.id === id); if (l) { setLayer(l, on); if (st.tab === 'layers') renderLayers(); } } };
}
