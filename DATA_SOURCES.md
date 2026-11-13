# Data sources

Every source, its class, access terms, and how EARTH//PULSE uses it.

**NASA first.** All measured data in the app is NASA's (or NASA-partner missions served by NASA DAACs).
The single non-NASA *data* input is the 7-day forecast from Open-Meteo, because NASA has no public
point forecast; it is labelled "not NASA" everywhere it appears. USGS, GDACS, NOAA CO₂/sea level,
GloFAS and World Bank feeds were removed in Nov 2026. CelesTrak (orbits), Photon (place search) and
Esri/OSM (base map) remain as infrastructure, not data.

| Source | Class | Access | Used for | Terms / attribution |
|---|---|---|---|---|
| **NISAR L2 GCOV & GUNW** (NASA/JPL-Caltech × ISRO), via **ASF DAAC** | `REAL_NISAR` | ASF Search API (public, no login). Browse PNGs at `nisar.asf.earthdatacloud.nasa.gov/BROWSE/…` are public. HDF5 products need a free NASA Earthdata login and are only **linked**. | All five Earth stories; live archive search; product metadata. | NASA data are openly shared under the [NASA Earth Science Data and Information Policy](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies). Cite: *NISAR data courtesy of NASA/JPL-Caltech and ISRO, distributed by ASF DAAC.* Products are **PROVISIONAL** (`*_PROVISIONAL_V1` collections). |
| **NASA FIRMS** active fire (VIIRS C2: NOAA-20, NOAA-21, Suomi NPP; MODIS C6.1: Terra, Aqua) | `REAL_OTHER_SATELLITE` | Public "Global 24h" CSV files (keyless) at `firms.modaps.eosdis.nasa.gov/data/active_fire/…` | ~200,000 detections per day on the globe; each is tagged with the satellite that made it. The files actually span ~30 h, and the legend shows the computed span. | NASA open data; cite NASA FIRMS / LANCE. Detections are thermal anomalies, not confirmed fires. Cached 1 h. |
| **NASA CMR** (NISAR GCOV `C2854338529-ASF`, GUNW `C2854335566-ASF`) | `REAL_NISAR` | `cmr.earthdata.nasa.gov/search/granules.json` (keyless, 2,000 per page) | Footprints of every NISAR image from the last 3 days (~2,500–3,000). Clicking one drapes its real browse image. | As NISAR above. Cached 3 h. |
| **NASA EONET v3** | `REAL_CONTEXT` | `eonet.gsfc.nasa.gov/api/v3/events?status=open` — hazards and wildfires fetched separately so the 1,000-event cap never crowds storms out | Open natural events (storms with tracks, volcanoes, sea ice, wildfires); the Pulse card's "open events". | NASA open data; each event links to its original source. Cached 30 min. |
| **NASA POWER** (Langley; MERRA-2 / IMERG-corrected) | `REAL_OTHER_SATELLITE` | `power.larc.nasa.gov/api/temporal/daily/point` + `/climatology/point` (keyless) | The Pulse card: rain 7/30 d vs the 2001–2025 normal (PRECTOTCORR), temperature anomaly and extremes (T2M, T2M_MAX, T2M_MIN), surface soil wetness (GWETTOP), snow depth (SNODP), grid elevation; the hazard-signal index. | NASA open data. Runs ~2 days behind real time. Cached 12 h. |
| **NASA Global Landslide Catalog** | `REAL_CONTEXT` | data.nasa.gov export → `public/data/context/landslides.json` | 11,033 landslides (1988–2017): history within 50 km on the card, globe layer. | NASA open data. Historical only. |
| **Open-Meteo forecast** (NOAA GFS / ECMWF) — *not NASA* | forecast | `api.open-meteo.com/v1/forecast` (keyless) | The 7-day strip and the rain / heat / frost threshold alerts. | Labelled "not NASA" in the UI. Cached 3 h. |
| **NASA GIBS true colour** (MODIS Terra/Aqua, VIIRS SNPP/NOAA-20/NOAA-21) | `REAL_OTHER_SATELLITE` | WMTS `epsg4326/best/<layer>/default/<yesterday>/250m` | "See its image of Earth" on those satellites' cards. | NASA open data; credit NASA GIBS / LANCE. |
| **CelesTrak GP/TLE** | `REAL_OTHER_SATELLITE` (orbits) | `celestrak.org/NORAD/elements/gp.php` (groups `resource, weather, science, stations`; `CATNR=65053` for NISAR) | Satellite positions, NISAR orbit, pass geometry. | Free; CelesTrak asks for ≤ 1 refresh per ~2 h, so we cache for 6 h. A dated snapshot ships in `public/data/tle/` (`FETCHED_AT`). |
| **NASA GIBS: VIIRS Black Marble (2016)** | `REAL_OTHER_SATELLITE` | WMTS tiles (keyless, CORS) | City lights on the night side. | NASA open data; credit NASA Earth Observatory / GIBS. |
| **Esri World Imagery** | base map | ArcGIS MapServer tiles (keyless) | Day-side base imagery. | Esri terms of use; credit Esri, Maxar, Earthstar Geographics. |
| **OpenStreetMap tiles** | base map fallback | `tile.openstreetmap.org` | Only if Esri fails. | © OpenStreetMap contributors (ODbL); tile usage policy. |
| **Re:Earth / Mapterhorn terrain** | base terrain | Quantized mesh (keyless) | Terrain relief. | CC BY 4.0. Cesium World Terrain is used instead if `VITE_CESIUM_ION_TOKEN` is set. |
| **Photon (komoot)** | `REAL_CONTEXT` | `photon.komoot.io` (keyless) | Place search. | Data © OpenStreetMap contributors (ODbL); fair use: requests are spaced ≥0.6 s and cached 7 d. |

## Offline snapshot

`public/data/live/*.json` is a dated snapshot of the live feeds (refresh with
`npm run snapshot` while the dev server runs). It is used only when the live
API is unreachable, and the legend then says **ARCHIVED SNAPSHOT**.

## NISAR granules used

The exact granule IDs are listed in each `public/data/stories/<id>/manifest.json`
and in Science Mode. Summary:

| Story | Product | Track / frame / direction | Dates |
|---|---|---|---|
| bangladesh-water | L2 GCOV (HH+HV) | 069 / 014 / ascending | 8 passes, 18 Jun → 22 Sep 2026 (12-day repeat; 5 Aug missing from the archive query) |
| kumamoto-ground | L2 GUNW | 024 / 018 / ascending | 5 pairs, 27 Jun → 7 Sep 2026; pair 21 Jul → 14 Aug spans the 28 Jul earthquake |
| punjab-crops | L2 GCOV | 156 / 017 / ascending | monthly, Dec 2025 → Sep 2026 |
| rondonia-forest | L2 GCOV | 068 / 093 / descending | monthly, Jun → Sep 2026 |
| greenland-ice | L2 GCOV (HH) | 170 / 053 / descending | monthly, Jun → Sep 2026 |

Earlier (Oct 2025 – Jan 2026) granules in `*_BETA_V1` collections have no public
browse image. The pipeline records them in `manifest.skipped` and does not use them.

## Not used, and why

- **ISRO Bhoonidhi S-band products**: need registration and a manual order flow, with no public programmatic search. The S-band is described in the NISAR card but no S-band data is shown.
- **NISAR GOFF (ice offsets) over Jakobshavn**: available, but the provisional browse vectors looked noisy. The ice story instead uses GCOV and says so.
- **Full HDF5 products**: need an Earthdata login plus 1–7 GB per file. See ARCHITECTURE.md → *Scaling*.
- **God's Eye View bundled data** (Bhote Koshi CC BY-NC, TeleGeography, etc.): not copied.
