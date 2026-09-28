# Earth stories

Five stories, each built on real NISAR data and checked by eye against the
imagery before any sentence was written. The editorial text is in
`src/core/stories.js`, and the numbers come from the manifests at runtime.

| # | Story | Human title | Evidence | Confidence |
|---|---|---|---|---|
| 1 | Bangladesh (featured) | THE WATER CHANGED | 8 GCOV passes through the 2026 monsoon, a derived water mask, and a change map | MEDIUM |
| 2 | Kumamoto, Japan | THE GROUND MOVED | 5 GUNW interferograms; only the one spanning the USGS M6.8 of 28 Jul 2026 shows compact rings at the epicentre | HIGH |
| 3 | Punjab, India | THE FARMLAND CHANGED | Monthly GCOV across a crop year | MEDIUM |
| 4 | Rondônia, Brazil | WHERE THE FOREST WAS CLEARED | GCOV "fishbone" clearing pattern | MEDIUM |
| 5 | West Greenland | THE ICE SHEET SURFACE CHANGED | 4 GCOV (HH) passes; the interior darkens in mid-August | LOW |

## What was actually observed (analyst notes)

- **Bangladesh**: Dark, water-like area peaks on 24 Jul 2026 (≈7,450 km² in the
  ≈59,500 km² evaluated), up from ≈5,900 km² on 18 Jun. Growth is concentrated
  along the braided Jamuna and its floodplain. The Sylhet haor basin is dark on
  every date. The 30 Jun dip is unexplained: wind roughening is possible. The
  story avoids the word "flood" as a measured claim and says "consistent with
  seasonal monsoon flooding".
- **Kumamoto**: All five pairs show broad banded fringes, including both
  pre-event pairs. These are typical of ionospheric, atmospheric or orbital
  effects at L-band, so the story says that explicitly. Only the
  21 Jul → 14 Aug pair shows a compact lobed pattern centred on the USGS
  epicentre, cut by a sharp NE–SW discontinuity. The descending pair
  (track 003, 8 Jul → 13 Aug) is decorrelated and not used.
- **Punjab**: Late-summer frames (Aug–Sep) are strongly magenta (HH-dominant).
  The 8 May frame has a green blob consistent with RFI, and 7 Jul has a no-data
  band. Both are disclosed.
- **Rondônia**: The classic fishbone pattern is visible on every date. The
  3-month window does not show new clearing reliably, so the story is about the
  pattern, not the event. From August the frames are HH-only (grey), and the
  story warns that the colour change comes from the acquisition mode.
- **Greenland**: Interior mean brightness (8-bit browse, HH) is 239 (25 Jun),
  237 (7 Jul), 209 (12 Aug), 229 (5 Sep). The story calls this "consistent with
  summer surface melt" with LOW confidence.

## Story structure

Location → what changed (human title) → scientific term → summary → **SHOW ME**
(before/after, flicker, fade, timeline, play) → **HOW DID NISAR KNOW?** →
what we saw / what it may mean / confidence / how we know / alternatives →
context → what does that mean (relevance only, no fabricated impact) → who is
watching this place → source and provenance → **SHOW ME ANOTHER ONE**.

## Adding a story

1. Find a NISAR frame: `curl "https://api.daac.asf.alaska.edu/services/search/param?platform=NISAR&processingLevel=GCOV&intersectsWith=POINT(lon%20lat)&output=jsonlite"`.
2. Add a `select` block to `tools/stories.json` and run `npm run data -- <id>`.
3. **Look at the images** before writing anything. Then add the editorial entry to `src/core/stories.js`.
4. `npm test` checks the manifest, the georeferencing, filled placeholders, and banned overclaiming words.
