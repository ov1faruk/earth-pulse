# EARTH//PULSE

**Watch Earth change.**

An interactive planetary observation experience. It lets anyone explore how
Earth is changing, and how NISAR (NASA × ISRO) and other satellites detect those
changes. It's built on **real NISAR radar data**, real satellite orbits, and
explicit provenance for every observation.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

- `▶ PLAY DEMO` (top right) or `http://localhost:5173/?demo` runs the deterministic presenter sequence.
- `?story=kumamoto-ground` opens a story directly.
- Keys: **G** global · **O** follow NISAR · **T** play timeline · **C** change · **S** science · **R** radar · **Esc** close.

No API keys are required. The optional `VITE_CESIUM_ION_TOKEN` in `.env` enables Cesium World Terrain.

```bash
npm test             # orbit math, story integrity, language rules, live feeds (23 tests)
npm run data         # rebuild the pre-processed NISAR story data from ASF (Python 3 + Pillow + NumPy)
npm run scan         # global NISAR change scan → public/data/change/radar.json (~5–10 min)
npm run snapshot     # refresh the offline snapshot of the live feeds (dev server running)
npm run build && npm run preview
```

## What's inside

| | |
|---|---|
| **Change anywhere** | Click any land → **WHAT CHANGED HERE?** → the app finds NISAR passes of that exact place from the same orbit track, downloads both real images, and computes a change map in the browser (cyan darker / orange brighter). Pick any two dates, flicker, play every pass, or **♪ listen to the change** |
| **Global Change Radar** | `npm run scan` compares the two newest passes of every NISAR frame worldwide and lights up where the surface changed most this cycle; click a hotspot to see it at full resolution |
| **Living Earth** | About 200,000 real fire detections a day (each tagged with the satellite that saw it), ~2,000 earthquakes, ~1,000 natural events, and ~2,500 NISAR images from the last 3 days, all on the globe and clickable. **▶ PLAY THE PLANET** replays them as a time-lapse |
| **Satellites → their data** | Click NOAA-20 / NOAA-21 / Suomi NPP / Terra / Aqua to see *their* fire detections and yesterday's true-colour image of Earth they took; NISAR shows its recent images. Search any satellite by name |
| **5 real NISAR stories** | Bangladesh monsoon water (featured), Kumamoto M6.8 earthquake deformation, Punjab crop year, Rondônia forest clearing, Greenland ice-sheet summer |
| **Real satellites** | ~300 Earth-observation, weather, science and station satellites from CelesTrak TLEs (SGP4) |
| **NISAR tracking** | Distinct marker, orbit, ground track, and a modeled swath fitted to real footprints; time-travel replay of its actual pass over Bangladesh |
| **Before / after** | Draggable split, flicker, fade, and a timeline across real 12-day repeat passes |
| **How did NISAR know?** | A labelled explanatory diagram that ends on the real evidence |
| **Science Mode** | Granule IDs, orbits, polarizations, georeferencing error, processing, uncertainty, the live ASF archive, and product links |
| **Provenance** | Machine-readable data class on everything; LIVE / CACHED / ARCHIVED / UNAVAILABLE status always visible |

## Docs

[ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_SOURCES.md](DATA_SOURCES.md) · [PROVENANCE.md](PROVENANCE.md) · [EARTH_STORIES.md](EARTH_STORIES.md) · [SCIENCE_MODEL.md](SCIENCE_MODEL.md)

Built on engineering patterns from [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) (MIT). See THIRD_PARTY_NOTICES.md.

*NISAR data courtesy of NASA/JPL-Caltech and ISRO, distributed by ASF DAAC. Products are provisional.*
