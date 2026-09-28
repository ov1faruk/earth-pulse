// EARTH//PULSE application controller.
import * as Cesium from 'cesium';
import { $, $$, esc, toast } from './ui/dom.js';
import { createGlobe } from './globe/viewer.js';
import { createSatelliteLayer, NISAR_NORAD } from './globe/satellites.js';
import { createCameraDirector, reducedMotion } from './globe/camera.js';
import { createStoryLayers } from './globe/storyLayers.js';
import { createAtlas } from './globe/atlas.js';
import { renderStory, updateWatching } from './ui/story.js';
import { computeWatching } from './ui/watching.js';
import { createTimebar } from './ui/timebar.js';
import { createKnow } from './ui/know.js';
import { createScience } from './ui/science.js';
import { renderProvenance, renderSatCard, renderStatus } from './ui/panels.js';
import { listStories, getStory, searchPlaces, nisarPasses } from './data/api.js';
import { STORIES, PHENOMENA, matchTopic } from './core/stories.js';
import { distanceKm } from './core/orbit.js';
import { createLivingEarth } from './livingEarth.js';
import { createChangeAnywhere } from './changeAnywhere.js';
import { sonifyChange, stopSonify } from './sonify.js';

const CHIPS = [
  ['FLOODS', 'water'], ['FORESTS', 'forest'], ['GLACIERS', 'ice'], ['EARTHQUAKES', 'ground_motion'],
  ['AGRICULTURE', 'agriculture'], ['WETLANDS', 'water'], ['GROUND MOVEMENT', 'ground_motion'],
];
const MODES = [
  ['natural', 'NATURAL', 'Optical base map only'],
  ['radar', 'RADAR', 'Show NISAR radar evidence'],
  ['change', 'CHANGE', 'Highlight what changed'],
  ['orbit', 'ORBIT', 'Satellites and NISAR orbit'],
  ['science', 'SCIENCE', 'Technical evidence'],
];
const PLACEHOLDERS = ['A flood in Bangladesh', 'A changing glacier', 'A forest that changed', 'Ground movement', 'Wetlands', 'Agriculture', 'An earthquake', 'Dhaka'];

export async function startApp() {
  const viewer = await createGlobe({ container: $('#globe'), creditContainer: $('#credits') });
  const state = { view: 'home', story: null, storyList: [], mode: 'radar', replay: null, satSel: null };

  const sats = createSatelliteLayer(viewer, { onFreshness: () => status() });
  const cam = createCameraDirector(viewer, sats);
  const layers = createStoryLayers(viewer);
  const atlas = createAtlas(viewer);
  let living; // created once the app API exists (needs selectSatellite/openStory)
  const timebar = createTimebar({ el: $('#timebar'), divider: $('#split-divider'), layers, onFrame: (i) => science.select(i) });
  const know = createKnow({ el: $('#know'), onScience: () => openScience(), onClose: () => $('#story-title')?.focus?.() });
  const science = createScience({ el: $('#science'), onPickFrame: (i) => { timebar.go(i); } });

  // ---------- initial camera: whole Earth ----------
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(78, 14, 2.4e7) });
  cam.idleSpin(true);

  // ---------- clock (LIVE vs REPLAY) ----------
  function clockText() {
    const d = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    const s = d.toISOString();
    return `${s.slice(0, 10)} ${s.slice(11, 19)} UTC${state.replay ? ` ×${viewer.clock.multiplier}` : ''}`;
  }
  let lastStatus = 0;
  viewer.clock.onTick.addEventListener(() => {
    const now = performance.now();
    if (now - lastStatus > 1000) { lastStatus = now; status(); }
  });
  function status() {
    renderStatus($('#status'), { sats: sats.state, story: state.story, clock: { text: state.replay ? `${state.replay.label} · ${clockText()}` : `LIVE · ${clockText()}`, replay: !!state.replay } });
  }

  function setLiveClock() {
    state.replay = null;
    viewer.clock.currentTime = Cesium.JulianDate.now();
    viewer.clock.multiplier = 1;
    viewer.clock.shouldAnimate = true;
    status();
  }

  /** Replay NISAR's real pass at a story's acquisition time. */
  function replayPass(story, { leadSec = 170, multiplier = 10 } = {}) {
    const f = story.timeline[story.afterIndex] || story.timeline.at(-1);
    const acq = new Date(f.observation.secondaryDate || f.observation.acquisitionStart);
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(acq.getTime() - leadSec * 1000));
    viewer.clock.multiplier = reducedMotion() ? 1 : multiplier;
    viewer.clock.shouldAnimate = true;
    state.replay = { label: `NISAR PASS ${acq.toISOString().slice(0, 10)}`, at: acq };
    sats.showOrbit(NISAR_NORAD, { swath: true });
    status();
    return acq;
  }

  // ---------- first screen ----------
  const chipEl = $('#chips');
  chipEl.innerHTML = `<button class="chip" data-p="anywhere" style="border-color:rgba(127,230,255,.5);color:var(--cyan)"><i style="background:#fff"></i>CHANGE ANYWHERE</button>` +
    CHIPS.map(([l, p]) => `<button class="chip" data-p="${p}"><i style="background:${PHENOMENA[p].color}"></i>${l}</button>`).join('');
  chipEl.onclick = (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    if (c.dataset.p === 'anywhere') { $('#explore').classList.add('away'); toast('Click any land on the globe, then “WHAT CHANGED HERE?”. EARTH//PULSE compares two real NISAR passes of that place.', 7000); return; }
    const s = STORIES.find((x) => x.phenomenon === c.dataset.p);
    if (s) openStory(s.id);
  };
  let ph = 0;
  setInterval(() => { if (document.activeElement !== $('#search-input')) $('#search-input').placeholder = PLACEHOLDERS[(ph = (ph + 1) % PLACEHOLDERS.length)]; }, 3200);

  $('#modes').innerHTML = MODES.map(([k, l, d]) => `<button class="mode" role="radio" data-mode="${k}" title="${d}" aria-checked="${k === state.mode}">${l}</button>`).join('');
  $('#modes').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); };

  // ---------- search ----------
  const input = $('#search-input');
  const results = $('#search-results');
  let searchTimer, activeIdx = -1, lastResults = [];
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) { results.hidden = true; return; }
    searchTimer = setTimeout(() => runSearch(q, { preview: true }), 350);
  });
  input.addEventListener('keydown', (e) => {
    if (results.hidden) return;
    const items = $$('li', results);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.setAttribute('aria-selected', i === activeIdx));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      items[activeIdx].click();
    }
  });
  $('#search').onsubmit = (e) => { e.preventDefault(); runSearch(input.value.trim(), { preview: false }); };

  async function runSearch(q, { preview }) {
    if (!q) return;
    const topic = matchTopic(q);
    let places = [];
    try { places = await searchPlaces(q); } catch { if (!topic && !preview) toast('Place search is temporarily unavailable.'); }
    const satHits = sats.search(q);
    lastResults = [
      ...(topic ? [{ kind: 'story', story: topic }] : []),
      ...satHits.map((x) => ({ kind: 'satellite', sat: x })),
      ...places.map((p) => ({ kind: 'place', place: p })),
    ];
    if (!preview && lastResults.length === 1) return pickResult(lastResults[0]);
    if (!preview && topic && !places.length) return pickResult(lastResults[0]);
    activeIdx = -1;
    results.innerHTML = lastResults.length
      ? lastResults.map((r, i) => r.kind === 'story'
        ? `<li role="option" data-i="${i}"><span><span class="r-name">${esc(r.story.humanTitle)}</span><br><span class="r-detail">${esc(r.story.location.name)} · ${esc(r.story.tagline)}</span></span><span class="r-kind">EARTH STORY</span></li>`
        : r.kind === 'satellite'
        ? `<li role="option" data-i="${i}"><span><span class="r-name">${esc(r.sat.name)}</span><br><span class="r-detail">${esc(r.sat.mission ? r.sat.mission.operator + ' · ' + r.sat.mission.instrument : 'NORAD ' + r.sat.norad)}</span></span><span class="r-kind">SATELLITE · FOLLOW</span></li>`
        : `<li role="option" data-i="${i}"><span><span class="r-name">${esc(r.place.name)}</span><br><span class="r-detail">${esc(r.place.detail)}</span></span><span class="r-kind">${esc((r.place.kind || 'place').toUpperCase())}</span></li>`).join('')
      : `<li><span class="r-detail">No matches. Try “Bangladesh”, “earthquake” or “glacier”.</span></li>`;
    results.hidden = false;
    $$('li[data-i]', results).forEach((li) => (li.onclick = () => pickResult(lastResults[Number(li.dataset.i)])));
  }

  async function pickResult(r) {
    results.hidden = true;
    input.blur();
    if (r.kind === 'story') return openStory(r.story.id);
    if (r.kind === 'satellite') { $('#explore').classList.add('away'); selectSatellite(r.sat.norad); return cam.flyToSatellite(r.sat.norad); }
    return exploreLocation(r.place);
  }

  /** GLOBAL → COUNTRY → REGION → LOCATION, then: what's changing here? */
  async function exploreLocation(place) {
    closePanels();
    cam.idleSpin(false);
    sats.unfollow();
    const near = STORIES.map((s) => ({ s, d: distanceKm(s.location, place) })).sort((a, b) => a.d - b.d)[0];
    const h = place.bbox ? Math.min(2.5e6, Math.max(8e4, distanceKm({ lat: place.bbox[1], lon: place.bbox[0] }, { lat: place.bbox[3], lon: place.bbox[2] }) * 1400)) : 3.5e5;
    await cam.transitionToObservation({ location: place, camera: { lat: place.lat, lon: place.lon, height: h, pitch: -70 } });
    if (near && near.d < 400) {
      toast(`WHAT’S CHANGING HERE? ${near.s.humanTitle} (${near.s.location.name})`);
      return openStory(near.s.id);
    }
    // No curated story here → show the real NISAR archive for this point.
    toast(`Checking the NISAR archive at ${place.name}…`);
    try {
      const r = await nisarPasses(place.lat, place.lon);
      const n = r.passes?.length || 0;
      toast(n ? `WHAT’S CHANGING HERE? No Earth story yet, but NISAR has ${n} passes over ${place.name} in the archive (latest ${r.passes[0].date.slice(0, 10)}).` : `NISAR has no archived passes over ${place.name} yet.`, 7000);
    } catch {
      toast('DATA TEMPORARILY UNAVAILABLE: the NISAR archive could not be reached.', 6000);
    }
  }

  // ---------- modes ----------
  function setMode(m) {
    if (m === 'science') {
      if (state.story?.available) return openScience();
      toast('Open an Earth story to see its technical evidence.');
      return;
    }
    state.mode = m;
    $$('#modes .mode').forEach((b) => b.setAttribute('aria-checked', b.dataset.mode === m));
    layers.setRadarOpacity(m === 'natural' || m === 'orbit' ? 0 : 1);
    if (m === 'orbit') {
      sats.setVisible(true);
      sats.showOrbit(NISAR_NORAD, { swath: true });
      cam.returnToEarth({ duration: 2.8 });
    }
    if (m === 'change' && state.story?.available) {
      if (state.story.evidence?.derived) { timebar.setMode('timeline'); timebar.go(state.story.afterIndex); timebar.showOverlay('change'); }
      else timebar.setMode('split');
    }
    if (m === 'radar' && state.story?.available && layers.overlay) timebar.showOverlay(null);
  }

  // ---------- satellites ----------
  function selectSatellite(norad, { fly = false } = {}) {
    const info = sats.info(norad);
    if (!info) return;
    state.satSel = norad;
    cam.idleSpin(false);
    sats.showOrbit(norad, { swath: norad === NISAR_NORAD });
    const card = $('#sat-card');
    const draw = () => {
      const i = sats.info(norad);
      renderSatCard(card, i, { tracking: sats.tracked?.norad === norad, replay: !!state.replay, hasObservation: true, dataHtml: living.satDataHtml(norad) });
    };
    draw();
    living.closeCard();
    $('#legend').classList.add('min');
    card.hidden = false;
    clearInterval(state.cardTimer);
    state.cardTimer = setInterval(() => { if (!card.hidden && state.satSel === norad) draw(); }, 1000);
    card.onclick = async (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'close-sat') return closeSatCard();
      if (living.satAction(act, norad, a)) return draw();
      if (act === 'track') { await cam.flyToSatellite(norad); draw(); }
      if (act === 'follow') { cam.followSatellite(norad); draw(); }
      if (act === 'explore-nisar') { closeSatCard(); return openStory('bangladesh-water', { replay: true }); }
      if (act === 'see-observation') { closeSatCard(); return openStory('bangladesh-water'); }
      if (act === 'replay') {
        if (state.replay) { setLiveClock(); draw(); return; }
        const s = await getStory('bangladesh-water');
        replayPass(s);
        await cam.flyToSatellite(NISAR_NORAD, { range: 2.2e6 });
        toast('Replaying NISAR’s real pass over Bangladesh (orbit propagated from its TLE).', 5000);
        draw();
      }
    };
    if (fly) return cam.flyToSatellite(norad);
  }

  function closeSatCard() {
    $('#sat-card').hidden = true;
    clearInterval(state.cardTimer);
    state.satSel = null;
    if (state.view === 'home' && !state.replay) sats.clearDecor();
  }

  // ---------- stories ----------
  async function openStory(id, { replay = false, skipCamera = false } = {}) {
    closePanels({ keepSat: false });
    cam.idleSpin(false);
    $('#explore').classList.add('away');
    living.onStoryOpen();
    change.close();
    stopSonify();
    state.view = 'story';
    let story;
    try { story = await getStory(id); } catch { toast('DATA TEMPORARILY UNAVAILABLE'); return; }
    state.story = story;
    status();
    const el = $('#story');
    el.hidden = false;
    renderStory(el, story, { onAction: storyAction });
    if (!story.available) return story;
    if (replay) replayPass(story);
    viewer.pulseSetLighting(false); // evidence must be legible even on the night side
    const loading = layers.load(story);
    if (!skipCamera) await cam.transitionToObservation(story);
    await loading;
    timebar.open(story);
    layers.setRadarOpacity(state.mode === 'natural' || state.mode === 'orbit' ? 0 : 1);
    atlas.setVisible(false);
    $('#story-title')?.focus?.({ preventScroll: true });
    fillWatching(story);
    return story;
  }

  async function fillWatching(story) {
    let archive = null;
    try { archive = await nisarPasses(story.location.lat, story.location.lon); } catch (e) { archive = { error: 'DATA TEMPORARILY UNAVAILABLE' }; }
    if (state.story !== story) return;
    const html = await computeWatching({ story, sats, now: Cesium.JulianDate.toDate(viewer.clock.currentTime), archive });
    if (state.story === story) updateWatching($('#story'), html);
  }

  function storyAction(act, data) {
    const s = state.story;
    if (act === 'compare') { timebar.setMode('split'); if (!state.replay) cam.transitionToObservation(s); }
    if (act === 'know') know.open(s);
    if (act === 'science') openScience();
    if (act === 'provenance') openDrawer();
    if (act === 'home') goHome();
    if (act === 'next') {
      const avail = state.storyList.filter((x) => x.available);
      const i = avail.findIndex((x) => x.id === s.id);
      openStory(avail[(i + 1) % avail.length].id);
    }
    if (act === 'follow-nisar') { replayPass(s); cam.flyToSatellite(NISAR_NORAD, { range: 2.2e6 }); selectSatellite(NISAR_NORAD); }
    if (act === 'replay') { replayPass(s); cam.transitionToObservation({ ...s, camera: { ...s.camera, height: (s.camera?.height || 5e5) * 4.5, pitch: -70 } }); toast('Replaying NISAR’s real pass: watch the modeled swath cross this place.', 5000); }
    if (act === 'sat') selectSatellite(Number(data.norad));
  }

  function openScience() {
    if (!state.story?.available) return;
    science.open(state.story, { frame: timebar.index });
  }

  function openDrawer() {
    const d = $('#drawer');
    renderProvenance(d, state.story, timebar.index);
    d.hidden = false;
    d.onclick = (e) => { if (e.target.closest('[data-act=close]')) d.hidden = true; };
    d.querySelector('.close-x')?.focus();
  }

  function closePanels({ keepSat = false } = {}) {
    know.isOpen && know.close();
    science.isOpen && science.close();
    $('#drawer').hidden = true;
    if (!keepSat) closeSatCard();
  }

  async function goHome() {
    closePanels();
    timebar.close();
    layers.clear();
    $('#story').hidden = true;
    state.story = null;
    state.view = 'home';
    if (state.replay) setLiveClock();
    sats.clearDecor();
    atlas.setVisible(true);
    viewer.pulseSetLighting(true);
    living.onHome();
    $('#explore').classList.remove('away');
    status();
    await cam.returnToEarth();
    cam.idleSpin(true);
  }

  $('#brand-home').onclick = () => goHome();

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (state.demoRunning) return demo.stop();
      if (know.isOpen) return know.close();
      if (science.isOpen) return science.close();
      if (!$('#drawer').hidden) { $('#drawer').hidden = true; return; }
      if (!$('#sat-card').hidden) return closeSatCard();
      if (!$('#live-card').hidden) return living.closeCard();
      if (change.active) { stopSonify(); return change.close(); }
      if (!$('#feed').hidden) { $('#feed').hidden = true; return; }
      if (living.lapsing) return living.stopLapse();
      if (state.view === 'story') return goHome();
      return;
    }
    if (k === 'g') goHome();
    if (k === 'o') { selectSatellite(NISAR_NORAD); cam.flyToSatellite(NISAR_NORAD); }
    if (k === 't' && timebar.isOpen) timebar.play();
    if (k === 'c') setMode('change');
    if (k === 's') setMode('science');
    if (k === 'r') setMode('radar');
  });

  const changeApp = { viewer, get cam() { return cam; } };
  const change = createChangeAnywhere(changeApp);
  changeApp.sonify = (run) => {
    const line = $('#scanline');
    // Map the scan fraction to the screen x of the change grid's west→east span (at its mid-latitude).
    const g = run.result.grid;
    const lat = (g.north + g.south) / 2;
    sonifyChange(run.result, {
      onColumn: (k) => {
        if (k == null) { line.hidden = true; return; }
        const p = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, Cesium.Cartesian3.fromDegrees(g.west + k * (g.east - g.west), lat));
        if (!p) return;
        line.style.left = `${p.x}px`;
        line.hidden = false;
      },
    });
  };
  living = createLivingEarth({
    viewer, sats, state, get cam() { return cam; }, selectSatellite, openStory,
    offerChange: (pos) => { if (state.view === 'home' && !state.demoRunning) change.offerAt(pos); },
    startChangePair: (h) => change.startPair(h),
  });
  const liveStart = performance.now();
  living.load().then(() => {
    // First impression: let the planet light up with the real data, once —
    // only if it arrived quickly (otherwise the layers simply appear).
    const quick = performance.now() - liveStart < 15000;
    if (quick && state.view === 'home' && !state.demoRunning && !new URLSearchParams(location.search).has('story')) living.playLapse({ seconds: 12 });
  });

  // ---------- load data ----------
  const list = await listStories();
  state.storyList = list.stories;
  atlas.set(list.stories.filter((s) => s.available));
  sats.load().catch(() => toast('Satellite orbits temporarily unavailable.'));
  status();

  const api = {
    viewer, state, sats, cam, layers, atlas, timebar, know, science, living, change,
    openStory, openStoryData: getStory, goHome, selectSatellite, replayPass, setLiveClock, setMode, openScience, openDrawer, closePanels, status,
  };
  const { createDemo } = await import('./demo/director.js');
  const demo = createDemo(api);
  api.demo = demo;
  $('#btn-demo').onclick = () => (state.demoRunning ? demo.stop() : demo.start());
  if (new URLSearchParams(location.search).has('demo')) setTimeout(() => demo.start(), 1500);
  const storyParam = new URLSearchParams(location.search).get('story');
  if (storyParam) openStory(storyParam);
  return api;
}
