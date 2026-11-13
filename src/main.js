import { startApp } from './app.js';

startApp()
  .then((app) => {
    window.earthPulse = app; // handy for presenters and debugging
    Promise.all([import('./platform/missionControl.js'), import('./platform/mission.js'), import('./pulse/home.js')])
      .then(([{ createMissionControl }, { createMission }, { createHome }]) => {
        app.mission = createMissionControl(app);
        app.film = createMission(app, app.mission);
        app.home = createHome(app);
      })
      .catch((e) => console.error('[pulse]', e));
    const hide = () => document.getElementById('loading').classList.add('done');
    // Reveal once the globe has drawn its first tiles (or after a short cap).
    let n = 0;
    const off = app.viewer.scene.globe.tileLoadProgressEvent.addEventListener((q) => {
      if (q === 0 && ++n > 0) { hide(); off(); }
    });
    setTimeout(hide, 4000);
  })
  .catch((err) => {
    console.error(err);
    const l = document.getElementById('loading');
    l.innerHTML = `<span>EARTH//PULSE could not start WebGL: ${String(err.message || err).replace(/[<>]/g, '')}</span>`;
  });
