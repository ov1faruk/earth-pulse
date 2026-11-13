# EARTH//PULSE

**Your weather app tells you if it will rain. EARTH//PULSE tells you what the rain will do.**

The first screen is the **Pulse card**: pick a place (search, ◎ your location, or one of 24 cities) and who you are —
**Everyone**, **Farmer** or **Climber** — and get one plain sentence about what is building there (floods on saturated
ground, heat, fire, drought, melt, frost, slope failure), the alerts behind it, a 7-day strip and the NASA measurements
it comes from: NASA POWER rain / temperature / soil wetness / snow, FIRMS fires, EONET events, the Global Landslide
Catalog and NISAR passes. Farmers set their own alert lines (heavy rain over 7 days, dry spell, heat, frost; saved on
the device); climbers set an objective altitude and get temperatures and freezing level there. Only the 7-day forecast
is not NASA data (Open-Meteo), and it says so. Links: `/?persona=farmer&place=23.81,90.41,Dhaka`.

**OPEN THE GLOBE** loads the heavy globe tools (fires, events, NISAR footprints, ~300 satellites) only when asked;
**◉ MY PULSE** comes back to the card. `?globe` skips the card.

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

No API keys are required. Data is NASA-only except the labelled Open-Meteo forecast (see DATA_SOURCES.md). The optional `VITE_CESIUM_ION_TOKEN` in `.env` enables Cesium World Terrain.

```bash
npm test             # orbit math, story integrity, language rules, live feeds (23 tests)
npm run data         # rebuild the pre-processed NISAR story data from ASF (Python 3 + Pillow + NumPy)
npm run scan         # global NISAR change scan → public/data/change/radar.json (~5–10 min)
npm run snapshot     # refresh the offline snapshot of the live feeds (dev server running)
npm run build && npm run preview
```

## Presentation video

**[EARTH//PULSE — The L-Band — NASA Space Apps 2026](https://youtu.be/9V4cdIAdCfo?si=7PG7CgoQE0bn1mTI)** · 3:39 · 1080p

Our entry film for the NASA Space Apps Challenge 2026, "Dancing with the SARs".
It introduces the challenge and The L-Band team, then shows EARTH//PULSE running:
the living planet, NISAR's real orbit, monsoon water spreading across Bangladesh,
the Kumamoto earthquake rings, the change engine, all 15 acts of THE MISSION,
Mission Control's NASA layers, and the change map turned into sound.

> **AI disclosure: the voice-over in this video is AI-generated.** No team member
> recorded it. It was produced with Kokoro-82M, an open-source text-to-speech model
> run offline, and every line was checked with Whisper speech recognition.

- **Footage:** a real screen recording of the running app. No AI-generated images
  or video; all imagery is NASA and partner satellite data.
- **Music:** original, generated in code. The sound near the end is the real
  sonification of the Bangladesh change map.
- **Built with free tools:** FFmpeg, Kokoro-82M (AI voice), Whisper via sherpa-onnx,
  Python and Pillow.
- **Team:** Mohammad Golam Faruk Ovi (Team Lead, System & Solution Architect),
  Md. Zaharabi Bhuiyain Rafi (Product Analyst), Mohammad Mushfiq Us Saleheen
  (AI Engineer), Rezaul Karim Anik (System Researcher), Rifah Tamanna
  (Communication & Coordination).

<!-- Also add this line at the end of the existing "### AI disclosure" section: -->
<!-- The presentation video's voice-over is AI-generated (Kokoro-82M text-to-speech); see "Presentation video" above. -->

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

## The Mission (the story, on the globe)

**▶ THE MISSION** plays the whole story on the globe itself — one cinematic sequence of 15 acts, no separate page. The camera flies between real places while a lower-third panel carries the narrative, the figures and their sources:

pulse (live vital signs) → the warming (year-by-year stripes over today's sea temperature) → live disasters → the year's seven events, each over that day's real VIIRS imagery → Nepal under the lens (before/after HLS images draped on the terrain) → the ripple effect through seven systems → reading the signals (NASA rainfall before Cyclone Ditwah) → the forecast (hazard-signal index for 24 cities) → your turn (probe any place).

Controls: play/pause, previous/next, click the progress bar to jump, arrow keys, space, Esc. Touching the globe pauses it. Deep link: `/?mission` or `/?mission=<act id>`. Code: `src/platform/mission.js`.

The earlier scroll page (`story.html`) is still in the repo with its charts and "how we calculated this" notes, but it is no longer linked from the app.

## Mission Control (on the globe)

The ◈ MISSION CONTROL dock turns the globe into a working tool:

- **LAYERS** — 11 NASA observation layers draped on the globe from [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api), with a 14-day time-lapse: radar backscatter, radar surface water and vegetation-disturbance alerts ([OPERA, NASA JPL](https://www.jpl.nasa.gov/go/opera)), soil moisture (SMAP, JPL), sea surface temperature (MUR, JPL PO.DAAC), IMERG rainfall, MODIS flood detection, land temperature, snow, aerosol and true colour. Plus the [NASA Global Landslide Catalog](https://data.nasa.gov/dataset/global-landslide-catalog-export) from data.nasa.gov (11,033 events, 1988–2017; rebuild with `node tools/build_landslides.mjs`).
- **Hazard and exposure layers** — eight more from NASA SEDAC (catalogued on data.nasa.gov, served by GIBS): population density 2020 (GPW v4), built-up extent (Landsat HBASE), and the Natural Disaster Hotspots maps for landslide, flood frequency, flood mortality risk, cyclone, drought and volcano. Each event and each probed place offers the ones relevant to it as one-click context chips; The Mission uses population in the forecast act and landslide hazard in the ripple act.
- **NASA references, linked where relevant** — resources that need an Earthdata login or have no open endpoint are linked from the events they concern and listed in the DATA tab with an amber ring: LHASA landslide nowcast, High Mountain Asia glacial lake inventory, JPL ARIA damage maps (earthquakes), NASA Disasters Mapping Portal (every event), NISAR orbit and observation-plan products.
- **PROBE** — click anywhere, search, or use your location: hazard-signal index, landslide history within 50 km, what to do, and a jump into the NISAR change engine.
- **ALERTS** — live M 5+ earthquakes and open events; click to fly there and probe.
- **PROBE → next 7 days** — a real forecast for the place (rain, temperature, wind from [Open-Meteo](https://open-meteo.com/); river flow from Copernicus GloFAS — not NASA products), the rain signal projected a week ahead, and a what-if simulator: add rain and watch the signal respond.
- **EVENTS** — the year's seven major disasters pinned worldwide, with a fly-through tour and links into the story (`/?event=<id>`, `/?probe=lat,lon,name`).
- **DATA** — every dataset, API and JPL resource in use: who publishes it, what it is used for, how it is wired in, and a live status dot (`src/platform/registry.js`).
- **Sound** — optional, off by default (♪ SOUND). All sounds are synthesised in the browser with the Web Audio API (`src/platform/sound.js`); there are no audio files.
- **EARTH TODAY** — full-disc photos of the sunlit Earth from [NASA EPIC / DSCOVR](https://epic.gsfc.nasa.gov/) (listed on [api.nasa.gov](https://api.nasa.gov/)), played as a rotation.

## The Story (story.html)

A scroll-driven narrative at `/story.html`, linked from the globe (◉ THE STORY). Eight chapters, all on real data:

1. **The Pulse** — live temperature, CO₂, sea level and Arctic sea ice.
2. **The Warming** — warming stripes and the long records since 1880 / 1958 / 1992 / 1979.
3. **When Earth Breaks** — live 3D globe of open events and earthquakes, filterable by type, region, time and magnitude, with an alert feed.
4. **The Ripple Effect** — one disaster followed through environment → economy → finance → GDP → health → mind → society.
5. **Nepal Under the Lens** — the 26 Aug 2026 Langtang glacier collapse: before/after imagery with zoom, an in-browser NISAR change map (19 → 31 Aug passes), area map, timeline, causes.
6. **A Year of Disasters** — seven events (13 Nov 2025 – 13 Nov 2026) with a daily NASA imagery scrubber, time-lapse, layer toggles, cause explorer, research links and an impact calculator.
7. **Reading the Signals** — NASA POWER rain and heat before each event, and live fire density.
8. **The Forecast** — a transparent hazard-signal index for 24 cities or any searched place, preparedness guidance, and IPCC AR6 scenario tools.

Every number has a source link, a LIVE / ARCHIVED / DERIVED label and a "How we calculated this" note. If a source is down, a dated snapshot from `public/data/story/` is shown; refresh it with `npm run snapshot:story`.

### Watch it drive itself

```bash
node tools/walkthrough.mjs   # opens a visible Chrome window and walks through the NASA sources and the platform
```

### Deploy

```bash
npm run build && npm start     # serves dist/ + the API on $PORT (default 8080)
```

`render.yaml` is included for a one-click Render deploy. A static-only host also works, but then live panels fall back to the archived snapshots.

### Data, APIs and research used by the story

| Source | Used for |
|---|---|
| [NASA GISTEMP v4](https://data.giss.nasa.gov/gistemp/) | Global temperature record |
| [NASA GIBS / Worldview Snapshots](https://wvs.earthdata.nasa.gov/) | VIIRS, MODIS and HLS imagery; fire overlays |
| [Harmonized Landsat Sentinel-2 (HLS)](https://www.earthdata.nasa.gov/data/projects/hls) | Nepal before/after images |
| [NASA POWER](https://power.larc.nasa.gov/) | Daily rain and temperature, 2001–2025 climatology |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Active fires, fire density |
| [NASA EONET v3](https://eonet.gsfc.nasa.gov/) | Open natural events |
| [NASA CMR](https://cmr.earthdata.nasa.gov/) / [ASF DAAC](https://search.asf.alaska.edu/) | NISAR L2 GCOV / GUNW (NASA/JPL-Caltech × ISRO) |
| [NISAR mission, NASA JPL](https://nisar.jpl.nasa.gov/) | Mission reference |
| [NSIDC Sea Ice Index v4](https://nsidc.org/data/g02135) (NASA NSIDC DAAC) | Arctic sea ice |
| [NASA Vital Signs](https://climate.nasa.gov/vital-signs/) · [NASA Sea Level Change](https://sealevel.nasa.gov/) | Reference for the vital signs |
| [IPCC AR6 WG1](https://www.ipcc.ch/report/ar6/wg1/) (Table SPM.1, Table 9.9) | Scenario tools |
| Shugar et al. 2020, World Weather Attribution 2026, World Bank GRADE 2025, Munich Re / Swiss Re 2026 | Research figures (full list on the page under Sources) |

Event figures were compiled on 13 Nov 2026 from the sources linked beside each number (several via Wikipedia event pages that compile agency reports); 2026 tolls are still being revised.

### AI disclosure

The story page (`story.html`, `src/story/`, `src/core/risk.js`, `server/providers/vitals.js`, `server/providers/risk.js`, `server/prod.js`, `test/story.test.mjs`, `src/story/motion.*`, `src/platform/` (Mission Control, The Mission, sound), `tools/build_landslides.mjs`, `tools/walkthrough.mjs`) was written with AI assistance (Claude). AI-assisted files say so in their header comment. No AI-generated images are used: all imagery is NASA satellite data.

## Docs

[ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_SOURCES.md](DATA_SOURCES.md) · [PROVENANCE.md](PROVENANCE.md) · [EARTH_STORIES.md](EARTH_STORIES.md) · [SCIENCE_MODEL.md](SCIENCE_MODEL.md)

Built on engineering patterns from [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) (MIT). See THIRD_PARTY_NOTICES.md.

*NISAR data courtesy of NASA/JPL-Caltech and ISRO, distributed by ASF DAAC. Products are provisional.*
