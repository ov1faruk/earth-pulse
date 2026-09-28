# Provenance model

## Data classes (`src/core/dataClass.js`)

```ts
type DataClass = 'REAL_NISAR' | 'REAL_OTHER_SATELLITE' | 'REAL_CONTEXT' | 'DERIVED' | 'DEMO' | 'SIMULATED';
```

The class is set where data enters the system (`server/providers/nisar.js`,
`tools/build_stories.py`, `storyModel.resolveStory`) and is sent to the
browser. UI labels are generated **only** from the class (`tag()` in
`src/ui/dom.js`), so a label can't drift from the data it describes.

| Element on screen | Class | Label shown |
|---|---|---|
| NISAR frames draped on the globe, thumbnails, evidence images | `REAL_NISAR` | NISAR OBSERVATION / REAL NISAR EVIDENCE |
| Satellite dots, NISAR marker, orbit, ground track | `REAL_OTHER_SATELLITE` (orbits from TLE) | REAL ORBIT |
| USGS epicentre, magnitude | `REAL_CONTEXT` | USGS |
| Water mask, change map, km² estimates, water sparkline | `DERIVED` | DERIVED / DERIVED ESTIMATE |
| NISAR swath band, next-coverage time, "who is watching" pass times | `DERIVED` | MODELED / PREDICTED GEOMETRY / GEOMETRY ONLY |
| Change Engine map, km² darker/brighter, hotspots | `DERIVED` | CHANGE MAP (with both granule IDs in *How this was computed*) |
| Change Radar hotspots | `DERIVED` | SCANNED + scan date in the legend |
| Sonification | `DERIVED` | from the change map only |
| How did NISAR know? animation | `SIMULATED` | SIMULATED VISUALIZATION · DIAGRAM, NOT DATA |
| A story whose data failed to load | `DEMO` class, `UNAVAILABLE` freshness | NO DATA · NOTHING SIMULATED |

There is **no** demo imagery anywhere in the app. If a story's data can't load,
the panel says so and shows nothing in its place.

## Freshness (`FRESHNESS`)

`LIVE` · `CACHED` · `STALE` (cached, source unreachable) · `ARCHIVED`
(pre-processed real data) · `DEMO` · `UNAVAILABLE`. Shown as pills in the
bottom-left corner: story data, orbital elements, and the clock (`LIVE` or `REPLAY`).

## Per-observation record

Each frame in a story manifest stores the following:

- granule ID, collection, concept ID, product type and level
- acquisition start/stop (or reference/secondary for interferograms)
- track, frame, direction, absolute orbit, orbit type, polarizations, bandwidth, frame coverage, PGE version, CRID
- footprint polygon (from ASF) and the fitted display rectangle
- georeferencing method + residual (px, km)
- browse URL (public), HDF5 URL (Earthdata login), ASF Vertex link

The story adds the pipeline query, the generation time, the source status
(PROVISIONAL), the derived-product method and caveats, and any skipped granules with reasons.

## Where a user sees it

1. **Story → SOURCE → INSPECT PROVENANCE**: the drawer with source, mission, product, acquisition, location, processing, confidence, granule, and links.
2. **SCIENCE MODE**: every observation, the selected product, how to read the colours, observation geometry, processing, uncertainty, thumbnails, and the live archive.
3. **Status pills**: which fallback tier is active.
