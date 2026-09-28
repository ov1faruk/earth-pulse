// Global Change Atlas: one restrained, pulsing halo per Earth story.
import * as Cesium from 'cesium';
import { PHENOMENA } from '../core/stories.js';
import { reducedMotion } from './camera.js';

function halo(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(48, 48, 0, 48, 48, 46);
  g.addColorStop(0, color + 'ff');
  g.addColorStop(0.12, color + 'ee');
  g.addColorStop(0.2, color + '55');
  g.addColorStop(1, color + '00');
  x.fillStyle = g;
  x.fillRect(0, 0, 96, 96);
  x.strokeStyle = color + 'aa';
  x.lineWidth = 1.5;
  x.beginPath(); x.arc(48, 48, 22, 0, Math.PI * 2); x.stroke();
  return c;
}

export function createAtlas(viewer) {
  const entries = new Map();
  let filter = null;

  function set(stories) {
    for (const e of entries.values()) viewer.entities.remove(e);
    entries.clear();
    const t0 = performance.now();
    for (const s of stories) {
      const color = PHENOMENA[s.phenomenon]?.color || '#ffffff';
      const phase = Math.random() * Math.PI * 2;
      const e = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(s.location.lon, s.location.lat, 0),
        billboard: {
          image: halo(color),
          scale: reducedMotion() ? 0.5 : new Cesium.CallbackProperty(() => 0.44 + 0.08 * Math.sin((performance.now() - t0) / 700 + phase), false),
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1.3, 3e7, 0.8),
          disableDepthTestDistance: 0,
          heightReference: Cesium.HeightReference.NONE,
        },
        label: {
          text: `${s.humanTitle}\n${s.location.name.toUpperCase()}`,
          font: '500 11px "Inter Tight", sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(22, 0),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          translucencyByDistance: new Cesium.NearFarScalar(8e6, 1, 2.6e7, 0),
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1, 2e7, 0.85),
        },
      });
      e.pulseStory = s.id;
      e.pulsePhenomenon = s.phenomenon;
      entries.set(s.id, e);
    }
    applyFilter();
  }

  function applyFilter() {
    for (const e of entries.values()) e.show = !filter || e.pulsePhenomenon === filter;
  }

  return {
    set,
    setFilter(p) { filter = p; applyFilter(); },
    setVisible(v) { for (const e of entries.values()) e.show = v && (!filter || e.pulsePhenomenon === filter); },
    get filter() { return filter; },
  };
}
