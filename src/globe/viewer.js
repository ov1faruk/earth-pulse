// Globe setup. Viewer defaults, the Apple-Metal atmosphere workaround and the
// keyless imagery/terrain fallbacks are adapted from God's Eye View
// (github.com/bilawalsidhu/gods-eye-view, MIT © 2026 Bilawal Sidhu).
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { applyModelAtmosphereWorkaround } from './atmosphereCompat.js';

const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

export async function createGlobe({ container, creditContainer }) {
  if (ION_TOKEN) Cesium.Ion.defaultAccessToken = ION_TOKEN;
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    selectionIndicator: false,
    infoBox: false,
    baseLayer: false,
    creditContainer,
    msaaSamples: 4,
    shouldAnimate: true,
    requestRenderMode: false,
  });
  applyModelAtmosphereWorkaround(viewer.scene);
  viewer.targetFrameRate = 60;
  const { scene } = viewer;
  const globe = scene.globe;

  // Look: real sun lighting (day/night terminator), atmosphere, stars.
  globe.enableLighting = true;
  globe.dynamicAtmosphereLighting = true;
  globe.dynamicAtmosphereLightingFromSun = true;
  globe.showGroundAtmosphere = true;
  globe.atmosphereLightIntensity = 12;
  globe.baseColor = Cesium.Color.fromCssColorString('#05070c');
  globe.maximumScreenSpaceError = 1.6;
  globe.tileCacheSize = 400;
  scene.skyAtmosphere.show = true;
  scene.skyAtmosphere.atmosphereLightIntensity = 18;
  scene.skyAtmosphere.saturationShift = -0.1;
  scene.skyAtmosphere.brightnessShift = -0.05;
  scene.sun.show = true;
  scene.moon.show = true;
  scene.backgroundColor = Cesium.Color.fromCssColorString('#010204');
  scene.highDynamicRange = false;
  scene.postProcessStages.fxaa.enabled = true;
  scene.screenSpaceCameraController.minimumZoomDistance = 1500;
  scene.screenSpaceCameraController.maximumZoomDistance = 1.2e8;
  scene.light = new Cesium.SunLight();

  // Base imagery: Esri World Imagery (keyless), OSM fallback if it fails.
  const baseLayer = Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromUrl(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
      { enablePickFeatures: false },
    ),
    { nightAlpha: 0.0, dayAlpha: 1.0 }, // night side shows VIIRS city lights instead
  );
  baseLayer.errorEvent.addEventListener(() => {
    const osm = new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }), { nightAlpha: 0.15 });
    viewer.imageryLayers.remove(baseLayer, true);
    viewer.imageryLayers.add(osm, 0);
  });
  viewer.imageryLayers.add(baseLayer);

  // Night: NASA GIBS VIIRS Black Marble (real VIIRS night-lights composite).
  const night = new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
      maximumLevel: 8,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      credit: new Cesium.Credit('Night lights: NASA Earth Observatory / GIBS, VIIRS Black Marble 2016'),
    }),
    { dayAlpha: 0.0, nightAlpha: 1.0, brightness: 1.6 },
  );
  viewer.imageryLayers.add(night);

  /** Sun shading on (planet view) or off (evidence view: imagery must be readable day or night). */
  viewer.pulseSetLighting = (on) => {
    globe.enableLighting = on;
    globe.dynamicAtmosphereLighting = on;
    night.show = on;
  };

  // Terrain: Cesium World Terrain with a token, else keyless Re:Earth mesh.
  loadTerrain(viewer).catch(() => {});
  return viewer;
}

async function loadTerrain(viewer) {
  try {
    const provider = ION_TOKEN
      ? await Cesium.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true })
      : await Cesium.CesiumTerrainProvider.fromUrl('https://terrain.reearth.land/cesium-mesh/ellipsoid', { requestVertexNormals: true });
    viewer.terrainProvider = provider;
  } catch (e) {
    console.warn('[globe] terrain unavailable, using ellipsoid', e?.message);
  }
}
