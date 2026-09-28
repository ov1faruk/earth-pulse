// DEMO MODE — deterministic presenter sequence. Every beat uses the same real
// data as the interactive app; nothing is staged or simulated except the
// explicitly labelled explanatory diagram in HOW DID NISAR KNOW?.
// Idea borrowed from God's Eye View's scene director (abortable, phase-based
// playback), implemented here as a small async script.
import * as Cesium from 'cesium';
import { $ } from '../ui/dom.js';
import { NISAR_NORAD } from '../globe/satellites.js';
import { reducedMotion } from '../globe/camera.js';

export function createDemo(app) {
  let ctrl = null;

  const caption = (main, sub = '') => {
    const el = $('#caption');
    if (!main) { el.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = `<div class="cap-main">${main}</div>${sub ? `<div class="cap-sub">${sub}</div>` : ''}`;
    el.hidden = false;
  };

  function wait(ms, signal) {
    return new Promise((res, rej) => {
      const t = setTimeout(res, reducedMotion() ? Math.min(ms, 1200) : ms);
      signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('stopped', 'AbortError')); }, { once: true });
    });
  }
  const guard = (signal, p) => Promise.race([p, new Promise((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('stopped', 'AbortError')), { once: true }))]);

  async function run(signal) {
    const { viewer, cam, sats } = app;
    const w = (ms) => wait(ms, signal);
    const g = (p) => guard(signal, p);

    // 1 · Earth
    await g(app.goHome());
    $('#explore').classList.add('away');
    caption('EARTH IS ALIVE.', 'EARTH//PULSE · WATCH EARTH CHANGE');
    cam.idleSpin(true);
    await w(4200);

    // 2 · The living planet: every real observation of the last hours and days
    const L = app.living.live.data;
    const cnt = (x) => (x ?? 0).toLocaleString('en-US');
    caption('WATCH THE PLANET', `${cnt(L.fires?.fires?.length)} FIRES · ${cnt(L.quakes?.quakes?.length)} EARTHQUAKES · ${cnt(L.events?.events?.length)} EVENTS · ${cnt(L.nisar?.granules?.length)} NISAR IMAGES`);
    await g(app.living.playLapse({ seconds: 12 }));
    caption(`${cnt(L.fires?.fires?.length)} FIRES SEEN FROM SPACE IN ABOUT A DAY`, 'DETECTED BY NOAA-20 · NOAA-21 · SUOMI NPP · TERRA · AQUA · NASA FIRMS');
    await w(4200);

    // NISAR change radar: the most-changed place this cycle, computed live
    const top = L.radar?.hotspots?.[0];
    if (top) {
      caption('WHERE DID EARTH CHANGE MOST?', `NISAR CHANGE RADAR · ${cnt(L.radar.pairsCompared)} REPEAT PAIRS SCANNED`);
      await w(3200);
      caption('');
      await g(app.change.startPair(top));
      caption('COMPUTED LIVE FROM TWO REAL NISAR PASSES', 'CYAN = BECAME DARKER · ORANGE = BECAME BRIGHTER');
      await w(6000);
      app.change.close();
      caption('');
    }

    // Satellites
    caption(`${sats.sats.size} EARTH-WATCHING SATELLITES`, 'REAL ORBITS · CELESTRAK ELEMENTS · SGP4');
    await w(3800);

    // 3–5 · NISAR, its orbit and swath, replaying its real pass over Bangladesh
    caption('NISAR', 'NASA × ISRO · L-BAND + S-BAND SAR · EARTH OBSERVATION');
    const story = await g(app.openStoryData('bangladesh-water'));
    app.replayPass(story, { leadSec: 200, multiplier: 12 });
    app.selectSatellite(NISAR_NORAD);
    cam.idleSpin(false);
    await g(cam.flyToSatellite(NISAR_NORAD, { range: 2.4e6 }));
    caption('FOLLOW NISAR', 'REPLAYING ITS PASS OF 22 SEPTEMBER 2026 · POSITION FROM ITS REAL ORBIT');
    await w(5200);
    caption('ITS RADAR SWATH', 'MODELED FROM REAL FOOTPRINTS · ≈242 KM WIDE, LOOKING LEFT');
    await w(5200);

    // 6–7 · footprint crosses Bangladesh → descend
    caption('PASSING OVER BANGLADESH', '');
    await w(3000);
    $('#sat-card').hidden = true;
    sats.unfollow();
    caption('');
    await g(app.openStory('bangladesh-water', { replay: false }));
    caption('SOMETHING CHANGED HERE.', '');
    await w(3400);

    // 8 · the story
    caption('THE WATER CHANGED.', 'NISAR · 8 PASSES · JUNE → SEPTEMBER 2026');
    await w(3600);
    caption('');

    // 9 · before / after
    app.timebar.setMode('split');
    for (let i = 0; i <= 40; i++) { app.timebar.setSplit(0.15 + 0.7 * (i / 40)); await w(55); }
    for (let i = 40; i >= 0; i--) { app.timebar.setSplit(0.35 + 0.3 * (i / 40)); await w(40); }
    await w(1800);
    app.timebar.setMode('timeline');
    app.timebar.go(app.state.story.afterIndex);
    app.timebar.showOverlay('change');
    caption('WHERE WATER APPEARED', 'DERIVED FROM REAL NISAR IMAGES · CYAN = BECAME WATER');
    await w(4600);
    app.timebar.showOverlay(null);
    caption('');

    // 10 · timeline
    app.timebar.go(0);
    await w(600);
    app.timebar.play();
    await w(8 * 1500 + 800);
    app.timebar.stop();

    // 11–12 · how did NISAR know?
    app.know.open(app.state.story, { autoplay: false });
    const k = app.know;
    for (let i = 0; i < 5; i++) {
      const steps = document.querySelectorAll('#know .step');
      steps[i]?.click();
      await w(i === 4 ? 6000 : 3800);
    }
    k.close();

    // 13 · science mode
    app.openScience();
    await w(6500);
    app.science.close();

    // 14 · back to Earth
    caption('');
    await g(app.goHome());
    app.living.stopLapse();
    // 15 · the atlas
    caption('SHOW ME ANOTHER ONE.', 'WATER · GROUND · FARMLAND · FOREST · ICE, ALL OBSERVED BY NISAR');
    await w(5000);
    caption('');
  }

  return {
    async start() {
      if (ctrl) return;
      ctrl = new AbortController();
      app.state.demoRunning = true;
      $('#btn-demo').textContent = '■ STOP DEMO';
      try {
        await run(ctrl.signal);
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      } finally {
        caption('');
        app.state.demoRunning = false;
        $('#btn-demo').textContent = '▶ PLAY DEMO';
        ctrl = null;
      }
    },
    stop() {
      ctrl?.abort();
      app.timebar.stop();
      app.living.stopLapse();
      app.cam.cancel();
      app.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    },
    get running() { return !!ctrl; },
  };
}
