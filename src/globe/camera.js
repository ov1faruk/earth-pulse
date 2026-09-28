// Camera verbs. Every move is eased and continuous — never a teleport — and
// shortened when the user prefers reduced motion. Orbit controller pattern is
// adapted from God's Eye View's orbit.js (MIT © 2026 Bilawal Sidhu).
import * as Cesium from 'cesium';

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const dur = (s) => (reducedMotion() ? Math.min(0.6, s * 0.2) : s);
const EASE = Cesium.EasingFunction.QUINTIC_IN_OUT;

export function createCameraDirector(viewer, sats) {
  const camera = viewer.camera;
  let orbitHandle = null;

  function cancel() {
    camera.cancelFlight();
    stopOrbit();
  }

  function flyTo({ lon, lat, height = 1.2e6, heading = 0, pitch = -90, roll = 0, duration = 3.2, easing = EASE }) {
    stopOrbit();
    return new Promise((resolve) => {
      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        orientation: { heading: Cesium.Math.toRadians(heading), pitch: Cesium.Math.toRadians(pitch), roll },
        duration: dur(duration),
        easingFunction: easing,
        complete: resolve,
        cancel: resolve,
      });
    });
  }

  /** Look at a ground point from an offset, keeping the point centered. */
  function flyToLocation({ lon, lat, height = 450000, pitch = -58, heading = 0, duration = 3.5 }) {
    stopOrbit();
    const target = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    const sphere = new Cesium.BoundingSphere(target, 1);
    return new Promise((resolve) => {
      camera.flyToBoundingSphere(sphere, {
        offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(heading), Cesium.Math.toRadians(pitch), height),
        duration: dur(duration),
        easingFunction: EASE,
        complete: resolve,
        cancel: resolve,
      });
    });
  }

  function returnToEarth({ duration = 3.5, lon } = {}) {
    sats?.unfollow();
    const c = Cesium.Cartographic.fromCartesian(camera.positionWC);
    const centerLon = lon ?? (c ? Cesium.Math.toDegrees(c.longitude) : 20);
    return flyTo({ lon: centerLon, lat: 12, height: 2.3e7, pitch: -90, duration });
  }

  /** Smoothly lock onto a satellite: fly near it first, then hand to tracking. */
  async function flyToSatellite(norad, { range = 1.6e6 } = {}) {
    stopOrbit();
    const info = sats.info(norad);
    if (!info?.position) return false;
    const p = info.position;
    await flyTo({ lon: p.lon, lat: p.lat - 8, height: (p.altKm * 1000) + range * 1.8, pitch: -58, duration: 2.8 });
    return sats.follow(norad, { range });
  }

  function followSatellite(norad, opts) {
    return sats.follow(norad, opts);
  }

  /** Slow cinematic orbit around a point (stops on user input). */
  function orbitCamera({ lon, lat, range = 600000, pitch = -45, speedDegPerSec = 2.2 }) {
    stopOrbit();
    if (reducedMotion()) return;
    const center = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    let heading = Cesium.Math.toDegrees(camera.heading);
    let last = performance.now();
    const onTick = () => {
      const now = performance.now();
      heading += ((now - last) / 1000) * speedDegPerSec;
      last = now;
      camera.lookAt(center, new Cesium.HeadingPitchRange(Cesium.Math.toRadians(heading), Cesium.Math.toRadians(pitch), range));
    };
    viewer.scene.preRender.addEventListener(onTick);
    const stopOnInput = () => stopOrbit();
    viewer.canvas.addEventListener('pointerdown', stopOnInput, { once: true });
    viewer.canvas.addEventListener('wheel', stopOnInput, { once: true, passive: true });
    orbitHandle = () => {
      viewer.scene.preRender.removeEventListener(onTick);
      viewer.canvas.removeEventListener('pointerdown', stopOnInput);
      viewer.canvas.removeEventListener('wheel', stopOnInput);
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    };
  }

  function stopOrbit() {
    if (orbitHandle) { const h = orbitHandle; orbitHandle = null; h(); }
  }

  /** Slow idle rotation of the whole planet (first screen). */
  let spinHandle = null;
  function idleSpin(on) {
    if (spinHandle) { viewer.clock.onTick.removeEventListener(spinHandle); spinHandle = null; }
    if (!on || reducedMotion()) return;
    let last = performance.now();
    spinHandle = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (viewer.trackedEntity) return;
      camera.rotate(Cesium.Cartesian3.UNIT_Z, -dt * 0.012);
    };
    viewer.clock.onTick.addEventListener(spinHandle);
    const stop = () => idleSpin(false);
    viewer.canvas.addEventListener('pointerdown', stop, { once: true });
  }

  /** Descend from orbit to a regional view of an observation, via a wide intermediate view. */
  async function transitionToObservation(story) {
    sats?.unfollow();
    const c = story.camera || { lat: story.location.lat, lon: story.location.lon, height: 500000, pitch: -60 };
    const here = Cesium.Cartographic.fromCartesian(camera.positionWC);
    const altNow = here?.height ?? 2e7;
    if (altNow > 4e6 && !reducedMotion()) {
      await flyTo({ lon: c.lon, lat: c.lat - 4, height: 5.5e6, pitch: -80, duration: 3.0 });
    }
    await flyToLocation({ lon: c.lon, lat: c.lat, height: c.height, pitch: c.pitch ?? -60, duration: 3.4 });
  }

  const surfaceDescent = (lon, lat) => flyToLocation({ lon, lat, height: 120000, pitch: -40, duration: 3 });
  const surfaceRise = () => {
    const c = Cesium.Cartographic.fromCartesian(camera.positionWC);
    return flyTo({ lon: Cesium.Math.toDegrees(c.longitude), lat: Cesium.Math.toDegrees(c.latitude), height: Math.max(c.height * 4, 3e6), pitch: -85, duration: 2.5 });
  };
  const lockCamera = (locked) => {
    const s = viewer.scene.screenSpaceCameraController;
    s.enableInputs = !locked;
  };

  return { flyTo, flyToLocation, flyToSatellite, followSatellite, returnToEarth, orbitCamera, stopOrbit, idleSpin, transitionToObservation, surfaceDescent, surfaceRise, lockCamera, cancel };
}
