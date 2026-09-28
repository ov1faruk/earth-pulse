# Architecture

EARTH//PULSE is a Vite + CesiumJS web app with a small Node API that runs as
Vite middleware (dev and `vite preview`). There is no framework: plain ES
modules, like the God's Eye View codebase it borrows from.

```
DATA SOURCES            INGESTION / PROCESSING          STORAGE / CACHE          API                     VISUALIZATION
ASF DAAC Search API ──▶ server/providers/nisar.js  ──▶  .pulse-cache/ (TTL,  ──▶ /api/nisar/*       ──▶ src/ui/science.js
NISAR browse PNGs   ──▶ tools/build_stories.py     ──▶  public/data/stories  ──▶ /api/story/:id     ──▶ src/globe/storyLayers.js
CelesTrak GP/TLE    ──▶ server/providers/space.js  ──▶  .pulse-cache/        ──▶ /api/satellites    ──▶ src/globe/satellites.js
USGS FDSN events    ──▶ server/providers/context.js──▶  .pulse-cache/        ──▶ /api/context/usgs  ──▶ story CONTEXT block
Photon (OSM)        ──▶ server/providers/context.js──▶  .pulse-cache/        ──▶ /api/locations     ──▶ search
FIRMS · USGS feed   ──▶ server/providers/live.js   ──▶  .pulse-cache/        ──▶ /api/live/*        ──▶ src/globe/live.js + src/livingEarth.js
EONET · GDACS · CMR ──▶ (compacted arrays, gzip)
NASA GIBS, Esri     ─────────────────────────────── (browser tiles) ─────────────────────────────────▶ src/globe/viewer.js
```

## Layers

| Layer | Files | Notes |
|---|---|---|
| Shared domain model | `src/core/dataClass.js`, `stories.js`, `storyModel.js`, `missions.js`, `orbit.js`, `tle.js` | Pure JS, imported by both server and browser. `DATA_CLASS` travels from server to UI. |
| Offline pipeline | `tools/build_stories.py`, `tools/stories.json` | Builds the **pre-processed real data** tier from real NISAR granules. Re-run with `npm run data`. |
| API | `server/api.js`, `server/cache.js`, `server/providers/*` | Validates input and caches upstreams (memory + disk, single-flight, serve-stale). Never exposes credentials. |
| Globe | `src/globe/viewer.js`, `satellites.js`, `camera.js`, `storyLayers.js`, `atlas.js` | Cesium viewer, real-orbit satellites, camera verbs, NISAR imagery layers, change atlas. |
| UI | `src/ui/*` | Story panel, time machine, How did NISAR know?, Science Mode, provenance, satellite card. |
| Living Earth | `server/providers/live.js`, `src/globe/live.js`, `src/livingEarth.js`, `src/ui/live.js` | ~200k fires as one `PointPrimitiveCollection`, quakes, event billboards, NISAR footprints as one batched `Primitive` with per-instance colour/show (time-lapse), and click-to-drape NISAR browse images with in-browser corner-fit georeferencing. A central picking handler with a 14 px hit area prioritises satellites, then stories, then live data. |
| Demo | `src/demo/director.js` | Deterministic, abortable 15-beat presenter sequence (`▶ PLAY DEMO`, or `?demo`). |

## Fallback hierarchy (§34)

`LIVE` (fresh upstream) → `CACHED` (server cache within TTL) → `STALE` (expired
cache served because the upstream failed) → `ARCHIVED` (pre-processed real data
shipped in `public/data`) → `UNAVAILABLE` (clearly shown, and nothing is
substituted). The browser (`src/data/api.js`) falls back to `public/data/...`
directly if the API is unreachable, so a static build still shows real data.
The status pills (bottom left) always show which tier is active.

## What was reused from God's Eye View

God's Eye View (MIT, © 2026 Bilawal Sidhu) was inspected in full; the mapping is in
the build notes. It is a large app where most modules share one services
object, so EARTH//PULSE is a **new app that copies and adapts the standalone
pieces** instead of forking the shell:

| Reused | From | How |
|---|---|---|
| Apple-Metal model-atmosphere workaround | `src/app/atmosphereCompat.js` | Copied verbatim (`src/globe/atmosphereCompat.js`) |
| Viewer defaults, keyless Esri imagery + Re:Earth terrain fallback | `src/app/viewer.js`, `src/maps/imagery.js`, `src/maps/terrain.js` | Adapted |
| CelesTrak proxy with 6 h TTL, disk cache, single-flight, serve-stale | `server/providers/space/celestrak.js` | Generalised into `server/cache.js` |
| SGP4 propagation, point-collection rendering, tracked entity with per-frame `CallbackProperty` | `src/layers/satellites/*` | Rewritten without the app shell |
| Orbit camera controller, cubic/quintic eased fly-to | `src/orbit.js`, `src/camera.js` | Adapted |
| Keyless Photon geocoding path | `src/keylessGeocoder.js` | Server-side and cached here |
| Abortable, phase-based scene playback idea | `src/director/playback.js` | Re-implemented as `src/demo/director.js` |

Not reused: God's Eye View branding, UI, wording, voice/CCTV/aircraft/SDR features, and
the Bhote Koshi flood data (CC BY-NC 4.0).

## Performance

- ~300 satellites in one `PointPrimitiveCollection`, re-propagated at 2 Hz; only the selected object becomes an entity.
- NISAR frames are single-tile WebP (≤1600 px, ~0.3–0.8 MB); layers are created per story and destroyed on exit.
- The swath polygon is rebuilt at most every 2 s (simulated time) and cached between frames.
- Upstream responses are cached server-side (ASF 3 h, TLE 6 h, USGS 24 h, geocoding 7 d, browse 30 d).
- Reduced motion shortens every camera move and disables idle spin, pulses and diagram animation.

## Scaling to full NISAR products

`NISARDataProvider` already normalizes every ASF record (product type, orbit,
polarization, QA links, HDF5 URL). To move from browse quick-looks to
calibrated science products, add an authenticated worker (Earthdata login in
server env only). It would read GCOV/GUNW HDF5 layers with `h5py`/`xarray`,
write COGs, and serve tiles. `storyLayers` would then swap `SingleTileImageryProvider`
for a tiled provider, and the rest of the app is unchanged.
