// THE MISSION — the story, told on the globe itself. One cinematic sequence:
// the camera flies between real places while a lower-third panel carries the
// narrative, the numbers and their sources. No separate page, no tabs.
//   pulse → warming → live disasters → the year's events → Nepal under the
//   lens → the ripple effect → reading the signals → the forecast → your turn
// Every figure comes from src/story/data.js (sourced) or a live API route.
// (Written with AI assistance — see README → AI disclosure.)
import * as Cesium from 'cesium';
import './mission.css';
import { $, esc } from '../ui/dom.js';
import { EVENTS, TYPE_META, NEPAL, RIPPLE, SOURCES } from '../story/data.js';
import { lineChart, stripes } from '../story/charts.js';
import { riskLevel } from '../core/risk.js';
import { sfx } from './sound.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const getJson = async (url, timeout = 60000) => { const r = await fetch(url, { signal: AbortSignal.timeout(timeout) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const src = (...keys) => keys.map((k) => (typeof k === 'string' && SOURCES[k] ? `<a href="${esc(SOURCES[k].url)}" target="_blank" rel="noopener">${esc(SOURCES[k].label.split(' — ')[0].split(' (')[0])}</a>` : esc(k))).join(' · ');
// The clearest day of imagery for an event, where it is not the event day itself.
const IMAGE_DAY = { france: '2026-07-23', nepal: '2026-10-23' };

export function createMission(app, mc) {
  const { viewer } = app;
  const el = $('#mission');
  const st = { on: false, i: 0, playing: true, timer: null, t0: 0, left: 0, layers: [], ents: [], ticks: [], token: 0 };
  const vitalsP = getJson('/api/vitals').catch(() => getJson('/data/story/vitals.json')).catch(() => null);

  // ---------- globe helpers ----------
  const fly = (lon, lat, height, duration = 3.2, pitch = -90) => { sfx.whoosh(); viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, height), orientation: { heading: 0, pitch: Cesium.Math.toRadians(pitch), roll: 0 }, duration: REDUCED ? 0 : duration }); };
  const addGibs = (layer, date, level, ext = 'jpg', alpha = 1) => {
    const l = new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({ url: `${GIBS}/${layer}/default/${date}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`, maximumLevel: level, tilingScheme: new Cesium.WebMercatorTilingScheme(), credit: new Cesium.Credit('NASA GIBS') }), { alpha });
    viewer.imageryLayers.add(l); st.layers.push(l); return l;
  };
  const drape = (url, b) => {
    const l = Cesium.ImageryLayer.fromProviderAsync(Cesium.SingleTileImageryProvider.fromUrl(url, { rectangle: Cesium.Rectangle.fromDegrees(b.west, b.south, b.east, b.north), credit: 'HLS · NASA GIBS' }), {});
    viewer.imageryLayers.add(l); st.layers.push(l); return l;
  };
  const dot = (lon, lat, color, size = 12, label = '') => {
    const e = viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(lon, lat), point: { pixelSize: new Cesium.CallbackProperty(() => (REDUCED ? size : size + 3 * Math.sin(performance.now() / 380 + lon)), false), color: Cesium.Color.fromCssColorString(color).withAlpha(0.95), outlineColor: Cesium.Color.WHITE, outlineWidth: 2 }, label: label ? { text: label, font: '500 11px "IBM Plex Mono", monospace', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -20) } : undefined });
    st.ents.push(e); return e;
  };
  function clearScene() {
    for (const l of st.layers) viewer.imageryLayers.remove(l, true);
    for (const e of st.ents) viewer.entities.remove(e);
    for (const t of st.ticks) clearInterval(t);
    st.layers = []; st.ents = []; st.ticks = [];
  }
  const every = (ms, fn) => { const t = setInterval(fn, ms); st.ticks.push(t); return t; };
  const data = () => $('#ms-data');
  const figs = (list) => `<div class="ms-figs">${list.map((f, k) => `<div style="animation-delay:${k * 140}ms"><b>${esc(f[0])}</b><span>${esc(f[1])}</span></div>`).join('')}</div>`;

  // ---------- the acts ----------
  const eventAct = (ev) => ({
    id: `ev-${ev.id}`, chapter: 'A YEAR OF DISASTERS', kicker: `${TYPE_META[ev.type].label} · ${fmt(ev.date)}`, title: ev.title, line: ev.what, color: TYPE_META[ev.type].color, dur: 15,
    source: `${src(ev.src)} · imagery: VIIRS NOAA-20, ${fmt(IMAGE_DAY[ev.id] || ev.date)} — NASA GIBS`,
    enter() {
      viewer.pulseSetLighting(false);
      addGibs('VIIRS_NOAA20_CorrectedReflectance_TrueColor', IMAGE_DAY[ev.id] || ev.date, 9);
      dot(ev.lon, ev.lat, TYPE_META[ev.type].color, 13);
      fly(ev.lon, ev.lat - 1.6, 1.25e6, 3.4); // straight down, event sitting above the caption panel
      if (ev.type === 'earthquake' || ev.type === 'glacier') setTimeout(() => st.on && sfx.rumble(), 2600);
      data().innerHTML = `${figs(ev.figures)}<div class="ms-why"><p><i style="--c:var(--cyan)"></i><b>Nature</b> ${esc(ev.natural[0])}</p><p><i style="--c:var(--amber)"></i><b>People</b> ${esc(ev.human[0])}</p></div>`;
    },
  });

  const ACTS = [
    { id: 'pulse', chapter: 'THE PULSE', kicker: 'Vital signs · read moments ago', title: 'Earth has a pulse.', line: 'Four numbers describe the state of the planet. Each one is read from the agency that measures it.', dur: 13,
      source: src('gistemp', 'noaa_co2', 'noaa_lsa', 'nsidc'),
      async enter(tok) {
        viewer.pulseSetLighting(true); app.cam.idleSpin(true); fly(78, 14, 2.4e7, 3);
        const v = await vitalsP; if (tok !== st.token) return;
        const cards = [];
        if (v?.temperature?.last12MonthMean != null) cards.push([`+${(v.temperature.last12MonthMean + v.temperature.baselineShift).toFixed(2)} °C`, 'warmer than 1880–1899, last 12 months']);
        if (v?.co2?.latestMonth) cards.push([`${v.co2.latestMonth.ppm.toFixed(1)} ppm`, `CO₂ at Mauna Loa — ${Math.round((v.co2.latestMonth.ppm / 280 - 1) * 100)}% above pre-industrial`]);
        if (v?.seaLevel?.riseSinceStartMm) cards.push([`+${Math.round(v.seaLevel.riseSinceStartMm)} mm`, `sea level since ${v.seaLevel.startYear + 1}, by satellite radar`]);
        if (v?.seaIce?.latest) cards.push([`${v.seaIce.latest.extent.toFixed(2)} M km²`, `Arctic sea ice, ${v.seaIce.anomalyPct.toFixed(0)}% against normal for the day`]);
        data().innerHTML = cards.length ? figs(cards) : '<p class="ms-miss">The vital-signs sources are unreachable right now. Nothing is substituted.</p>';
      } },
    { id: 'warming', chapter: 'THE WARMING', kicker: 'One stripe per year since 1880', title: 'It built up slowly. Then quickly.', line: 'Blue years were cooler than the 1951–1980 average, red years warmer. The ocean below is today\'s sea-surface temperature.', dur: 16,
      source: `${src('gistemp')} · sea surface temperature: MUR, NASA JPL PO.DAAC`,
      async enter(tok) {
        viewer.pulseSetLighting(false); app.cam.idleSpin(true); fly(-150, 5, 2.2e7, 3);
        addGibs('GHRSST_L4_MUR_Sea_Surface_Temperature', 'default', 7, 'png', 0.85);
        const v = await vitalsP; if (tok !== st.token) return;
        const t = v?.temperature;
        if (!t?.annual) { data().innerHTML = '<p class="ms-miss">NASA GISTEMP is unreachable right now.</p>'; return; }
        data().innerHTML = '<div class="ms-stripes" id="ms-stripes"></div><p class="ms-year" id="ms-year"></p>';
        stripes($('#ms-stripes'), t.annual);
        const bars = [...$('#ms-stripes').children]; bars.forEach((b) => b.classList.add('off'));
        let k = 0;
        every(70, () => { if (k >= bars.length) return; bars[k].classList.remove('off'); const [y, a] = t.annual[k]; $('#ms-year').innerHTML = `<b>${y}</b> ${a > 0 ? '+' : ''}${a.toFixed(2)} °C`; if (k % 3 === 0) sfx.year(a); k++; });
      } },
    { id: 'breaks', chapter: 'WHEN EARTH BREAKS', kicker: 'Live · right now', title: 'And the surface never stops moving.', line: 'Every point on the globe is a real detection from the last hours and days: fires, earthquakes, storms, eruptions.', dur: 14,
      source: `${src('firms', 'usgs', 'eonet', 'gdacs')}`,
      async enter(tok) {
        viewer.pulseSetLighting(false); app.cam.idleSpin(true); fly(125, 8, 1.6e7, 3.4);
        const [q, e, f] = await Promise.all([getJson('/api/live/quakes').catch(() => null), getJson('/api/live/events').catch(() => null), getJson('/api/live/fires/density', 20000).catch(() => null)]);
        if (tok !== st.token) return;
        const week = Date.now() - 7 * 864e5, qs = (q?.quakes || []).filter((x) => x[4] >= week && x[3] >= 4.5), top = qs.slice().sort((a, b) => b[3] - a[3])[0];
        const cards = [];
        if (f?.total) cards.push([f.total.toLocaleString(), 'fire detections in the last day']);
        if (q) cards.push([String(qs.length), 'earthquakes of M 4.5+ this week']);
        if (top) cards.push([`M ${top[3].toFixed(1)}`, `largest: ${top[6]}`]);
        if (e) cards.push([String(e.events.filter((x) => x.category !== 'wildfires').length), 'open storms, eruptions, floods and droughts']);
        data().innerHTML = cards.length ? figs(cards) : '<p class="ms-miss">The live feeds are unreachable right now.</p>';
      } },
    ...EVENTS.map(eventAct),
    { id: 'lens', chapter: 'NEPAL UNDER THE LENS', kicker: 'Langtang valley · before and after, from orbit', title: 'Seven minutes from the mountain to the border.', line: 'The same valley on 10 November 2025 and 23 October 2026. The pale band that appears is the river channel, scoured and widened by the debris flow.', color: '#c8a6ff', dur: 16,
      source: `${src('hls', 'gibs', 'wiki_nepal')}`,
      enter() {
        viewer.pulseSetLighting(false); app.cam.idleSpin(false);
        const b = { south: 28.05, west: 85.1, north: 28.45, east: 85.6 };
        const before = drape('/data/story/nepal/overview_2025-11-10.jpg', b), after = drape('/data/story/nepal/overview_2026-10-23.jpg', b);
        fly(85.35, 28.25, 9.5e4, 4);
        data().innerHTML = `<div class="ms-ba"><span id="ms-ba-a" class="on">BEFORE · 10 NOV 2025</span><span id="ms-ba-b">AFTER · 23 OCT 2026</span></div>${figs([['08:37', 'ice and rock fall 1,200 m near Langtang Lirung'], ['08:44', 'the border crossing is destroyed'], ['72 km', 'of the Trishuli valley struck'], ['1,455', 'deaths in Nepal; 5,285 missing']])}`;
        let showAfter = false; after.show = false;
        every(2200, () => { showAfter = !showAfter; after.show = showAfter; before.show = !showAfter; $('#ms-ba-a')?.classList.toggle('on', !showAfter); $('#ms-ba-b')?.classList.toggle('on', showAfter); sfx.tick(); });
        setTimeout(() => st.on && sfx.rumble(), 3000);
      } },
    { id: 'ripple', chapter: 'THE RIPPLE EFFECT', kicker: 'One collapse, followed through seven systems', title: 'A disaster does not end where the water stops.', line: 'Every figure is from the Nepal flood of 26 August 2026.', color: '#ffb347', dur: 22,
      source: `${src('wiki_nepal', 'un_nepal')} · compiled 13 Nov 2026 · shading: landslide hazard, NASA SEDAC`,
      enter() {
        viewer.pulseSetLighting(false); fly(85.0, 27.4, 4.2e5, 4, -55);
        addGibs('NDH_Landslide_Hazard_Distribution_2000', 'default', 7, 'png', 0.55); // the long-term landslide hazard this valley sits in
        for (const p of NEPAL.places.filter((x) => x.kind !== 'ref')) dot(p.lon, p.lat, p.kind === 'source' ? '#ff4d6d' : '#ffb347', p.kind === 'source' ? 13 : 8);
        let k = 0;
        const show = () => { const r = RIPPLE[k % RIPPLE.length]; data().innerHTML = `<div class="ms-ripple" style="--c:${r.color}"><div class="ms-steps">${RIPPLE.map((x, j) => `<i class="${j === k % RIPPLE.length ? 'on' : j < k % RIPPLE.length ? 'done' : ''}" style="--c:${x.color}" title="${esc(x.label)}"></i>`).join('')}</div><h3>${esc(r.label)} — ${esc(r.lead)}</h3>${figs(r.facts)}</div>`; sfx.step(k); k++; };
        show(); every(3000, show);
      } },
    { id: 'signals', chapter: 'READING THE SIGNALS', kicker: 'Central Sri Lanka · the week before Cyclone Ditwah', title: 'The warning is usually there before the disaster.', line: 'Rain measured by NASA, day by day. The dashed line is what is normal for the month.', color: '#48d6ff', dur: 15,
      source: `${src('power')} · PRECTOTCORR, 2001–2025 climatology`,
      async enter(tok) {
        viewer.pulseSetLighting(false); app.cam.idleSpin(false); fly(80.7, 5.6, 1.1e6, 3.6); dot(80.6, 7.3, '#48d6ff', 12, 'CENTRAL SRI LANKA');
        data().innerHTML = '<div class="ms-chart" id="ms-chart"><p class="ms-miss">Loading NASA POWER…</p></div>';
        let d; try { d = await getJson('/api/signals?lat=7.3&lon=80.6&start=20251101&end=20251210'); } catch { if (tok === st.token) data().innerHTML = '<p class="ms-miss">NASA POWER is unreachable right now. Nothing is substituted.</p>'; return; }
        if (tok !== st.token) return;
        const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], dn = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 864e5;
        const obs = Object.entries(d.daily.PRECTOTCORR).filter(([, v]) => v > -900).map(([k, v]) => [dn(k), v, k]);
        const norm = obs.map(([x, , k]) => [x, d.climatology.PRECTOTCORR[MON[+k.slice(4, 6) - 1]]]);
        const ev = dn('20251128'), wk = obs.filter(([x]) => x > ev - 7 && x <= ev), nk = norm.filter(([x]) => x > ev - 7 && x <= ev);
        const s = wk.reduce((a, b) => a + b[1], 0), n = nk.reduce((a, b) => a + b[1], 0);
        data().innerHTML = `<div class="ms-chart" id="ms-chart"></div><p class="ms-year"><b>${Math.round(s)} mm</b> in the 7 days to landfall — ${(s / n).toFixed(1)}× the normal ${Math.round(n)} mm</p>`;
        lineChart($('#ms-chart'), { series: [{ label: 'Daily rain', color: '#48d6ff', points: obs, bars: true }, { label: 'Normal', color: '#fff', points: norm, dashed: true, width: 1.2 }], marks: [{ x: ev, label: 'LANDFALL' }], zero: true, height: 150, xFmt: (x) => { const t = new Date(x * 864e5); return `${t.getUTCDate()}/${t.getUTCMonth() + 1}`; }, yFmt: (y) => `${Math.round(y)}` });
        $('#ms-chart').classList.add('play'); sfx.scan();
      } },
    { id: 'forecast', chapter: 'THE FORECAST', kicker: 'Hazard signals being measured today', title: 'Where are the signals elevated right now?', line: 'An index of measured rain, heat, fire and seismic signals around 24 cities. It is a risk estimate, not a prediction.', dur: 16,
      source: `${src('power', 'usgs', 'firms', 'eonet')} · shading: population density 2020, NASA SEDAC GPW v4`,
      async enter(tok) {
        viewer.pulseSetLighting(false); app.cam.idleSpin(true); fly(60, 18, 2.3e7, 3.4);
        addGibs('GPW_Population_Density_2020', 'default', 7, 'png', 0.6); // where the signals meet people
        let r; try { r = await getJson('/api/risk/map', 120000); } catch { try { r = await getJson('/data/story/risk.json'); } catch { r = null; } }
        if (tok !== st.token) return;
        const places = (r?.places || []).filter((p) => !p.unavailable).sort((a, b) => b.overall - a.overall);
        if (!places.length) { data().innerHTML = '<p class="ms-miss">The index is unreachable right now.</p>'; return; }
        for (const p of places) dot(p.lon, p.lat, riskLevel(p.overall).color, 9 + p.overall / 14, p.overall >= 50 ? p.name.toUpperCase() : '');
        data().innerHTML = `<div class="ms-rank">${places.slice(0, 5).map((p, k) => `<button data-probe="${p.lat},${p.lon},${esc(p.name)}" style="--c:${riskLevel(p.overall).color};animation-delay:${k * 120}ms"><b>${p.overall}</b><span>${esc(p.name)}</span><em>${esc(riskLevel(p.overall).label)} · ${esc(p.top === 'wet' ? 'rain surplus' : p.top === 'dry' ? 'rain deficit' : p.top)}</em></button>`).join('')}</div>`;
      } },
    { id: 'turn', chapter: 'YOUR TURN', kicker: 'The mission continues with you', title: 'Now ask about a place that matters to you.', line: 'Search any place on Earth for its live signals, a seven-day forecast and what to do — or compare real NISAR radar passes there.', dur: 0,
      source: 'NISAR data courtesy of NASA/JPL-Caltech and ISRO, distributed by ASF DAAC. Products are provisional.',
      enter() {
        viewer.pulseSetLighting(true); app.cam.idleSpin(true); fly(78, 14, 2.4e7, 3);
        data().innerHTML = '<div class="ms-end"><button class="ms-cta" data-a="locate">◎ CHECK MY LOCATION</button><button class="ms-cta" data-a="search">SEARCH A PLACE</button><button class="ms-cta ghost" data-a="replay">↺ REPLAY THE MISSION</button></div>';
      } },
  ];

  // ---------- shell ----------
  el.innerHTML = `<div class="ms-progress" id="ms-progress">${ACTS.map((a, k) => `<button data-go="${k}" title="${esc(a.chapter)}: ${esc(a.title)}" aria-label="${esc(a.title)}"><i></i></button>`).join('')}</div>
    <div class="ms-main"><div class="ms-left"><span class="ms-chapter" id="ms-chapter"></span><span class="ms-kicker" id="ms-kicker"></span><h2 id="ms-title"></h2><p class="ms-line" id="ms-line"></p></div><div class="ms-right" id="ms-data"></div></div>
    <div class="ms-foot"><p class="ms-src" id="ms-src"></p><div class="ms-ctl"><button data-a="prev" aria-label="Previous">◀</button><button data-a="play" id="ms-play" aria-label="Pause">❚❚</button><button data-a="next" aria-label="Next">▶</button><span class="ms-count" id="ms-count"></span><button data-a="exit" class="ms-exit">EXIT ✕</button></div></div>`;

  function schedule(sec) {
    clearTimeout(st.timer);
    if (!sec || !st.playing) return;
    st.left = sec * 1000; st.t0 = performance.now();
    st.timer = setTimeout(() => go(st.i + 1), st.left);
  }
  function go(i) {
    if (!st.on) return;
    if (i >= ACTS.length) i = ACTS.length - 1;
    if (i < 0) i = 0;
    st.i = i; const tok = ++st.token; const a = ACTS[i];
    clearScene();
    el.style.setProperty('--c', a.color || 'var(--cyan)');
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    $('#ms-chapter').textContent = a.chapter; $('#ms-kicker').textContent = a.kicker; $('#ms-title').textContent = a.title; $('#ms-line').textContent = a.line;
    $('#ms-src').innerHTML = `Source: ${a.source}`; $('#ms-count').textContent = `${String(i + 1).padStart(2, '0')} / ${ACTS.length}`;
    data().innerHTML = '';
    el.querySelectorAll('[data-go]').forEach((b, k) => { b.className = k < i ? 'done' : k === i ? 'now' : ''; b.querySelector('i').style.animationDuration = `${a.dur || 0}s`; b.querySelector('i').style.animationPlayState = st.playing ? 'running' : 'paused'; });
    sfx.step(i);
    Promise.resolve(a.enter(tok)).catch((e) => console.error('[mission]', e));
    schedule(a.dur);
  }
  function setPlaying(on) {
    st.playing = on;
    $('#ms-play').textContent = on ? '❚❚' : '▶'; $('#ms-play').setAttribute('aria-label', on ? 'Pause' : 'Play');
    el.querySelectorAll('[data-go] i').forEach((x) => { x.style.animationPlayState = on ? 'running' : 'paused'; });
    if (on) { const a = ACTS[st.i]; if (a.dur) { st.t0 = performance.now(); st.timer = setTimeout(() => go(st.i + 1), st.left || a.dur * 1000); } }
    else { clearTimeout(st.timer); st.left = Math.max(800, st.left - (performance.now() - st.t0)); }
  }
  function start(i = 0) {
    if (st.on) return;
    if (app.state.view !== 'home') app.goHome?.();
    st.on = true; st.playing = true; st.wasOpen = !$('#mc').hidden;
    mc.setOpen(false);
    document.body.classList.add('mission-on');
    el.hidden = false;
    $('#btn-mission')?.setAttribute('aria-pressed', 'true');
    go(i);
  }
  function stop({ keepScene = false } = {}) {
    if (!st.on) return;
    st.on = false; clearTimeout(st.timer); st.token++;
    if (!keepScene) { clearScene(); viewer.pulseSetLighting(true); }
    document.body.classList.remove('mission-on');
    el.hidden = true;
    $('#btn-mission')?.setAttribute('aria-pressed', 'false');
    if (st.wasOpen) mc.setOpen(true);
  }
  el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]'); if (g) return go(Number(g.dataset.go));
    const pb = e.target.closest('[data-probe]');
    if (pb) { const [lat, lon, ...n] = pb.dataset.probe.split(','); stop(); mc.setOpen(true); return mc.probe(+lat, +lon, n.join(',')); }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'prev') go(st.i - 1);
    if (a === 'next') go(st.i + 1);
    if (a === 'play') setPlaying(!st.playing);
    if (a === 'exit') stop();
    if (a === 'replay') go(0);
    if (a === 'search') { stop(); mc.setOpen(true); mc.setTab('probe'); setTimeout(() => $('#mc-q')?.focus(), 200); }
    if (a === 'locate') { stop(); mc.setOpen(true); mc.setTab('probe'); setTimeout(() => $('#mc [data-a="locate"]')?.click(), 200); }
  });
  addEventListener('keydown', (e) => {
    if (!st.on || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowRight') go(st.i + 1); else if (e.key === 'ArrowLeft') go(st.i - 1); else if (e.key === ' ') { e.preventDefault(); setPlaying(!st.playing); } else if (e.key === 'Escape') stop(); else return;
    e.stopPropagation();
  }, true);
  // Touching the globe pauses the film so the viewer can look around.
  viewer.scene.canvas.addEventListener('pointerdown', () => { if (st.on && st.playing) setPlaying(false); });
  $('#btn-mission')?.addEventListener('click', () => (st.on ? stop() : start()));
  $('#mission-cta')?.addEventListener('click', () => start());
  const q = new URLSearchParams(location.search);
  if (q.has('mission')) setTimeout(() => start(Math.max(0, ACTS.findIndex((a) => a.id === q.get('mission')))), 1800);
  return { start, stop, go, get active() { return st.on; }, acts: ACTS.map((a) => a.id) };
}
