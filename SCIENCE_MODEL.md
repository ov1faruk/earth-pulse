# Science model

## Integrity model

Every story carries **WHAT WE SAW** · **WHAT IT MAY MEAN** · **HOW CONFIDENT
WE ARE** · **HOW WE KNOW** · **WHAT ELSE COULD EXPLAIN IT** · **SOURCE**.
Language rules: *observed, detected, consistent with, possible, may indicate*.
The words *proves, caused by, definitely, certainly* are banned by a unit test
(`test/stories.test.mjs`). Impact is shown only as "potentially relevant to…",
never as a number.

## Products

- **GCOV** (L2 geocoded polarimetric covariance): backscatter power per
  polarization on a map grid. The public browse composite has R = HH,
  G = HV, B = HH. This was verified empirically: R and B are identical in the
  8-bit files.
- **GUNW** (L2 geocoded unwrapped interferogram): line-of-sight displacement as
  phase. At L-band (λ ≈ 23.8 cm), 2π of phase ≈ 11.9 cm of line-of-sight
  change. The browse colour cycle's displacement per cycle isn't published in
  the public metadata, so the app never quotes centimetres from it.

## Georeferencing browse images

The LATLON browse PNGs are north-up lat/lon rasters without a world file (the
KML sidecar requires login). The pipeline finds the four extreme pixels of the
valid-data quadrilateral (top, bottom, left, right) and pairs them with the
extreme vertices of the ASF footprint polygon. It then fits `x = a·lon + b` and
`y = c·lat + d` by least squares. Residuals are 0.1–0.84 km across all 31
frames, and each residual is stored and shown in Science Mode.

## Derived water estimate (Bangladesh)

1. Luminance = mean of RGB for valid pixels.
2. Threshold = median, over all dates, of the histogram valley between the dark
   (water) and bright (land) modes (smoothed histogram, search window 8–110 DN),
   scaled per image by its land-mode brightness to offset the per-image
   contrast stretch of the browse files (thresholds 38.2–40.8 DN).
3. Masks are resampled to a common grid, and statistics use only the cells
   valid on every date (≈59,500 km²).
4. The change map runs from the first date to the peak date: cyan = became
   water, amber = receded.

Caveats shown to users: per-image stretching, radar shadow and smooth soils
look dark, flooded vegetation looks bright (double bounce), and wind-roughened
water can be missed. This is not calibrated σ⁰ and not an official flood product.

## NISAR look geometry (modeled swath)

Fitted, not assumed. For three real granules (two ascending, one descending),
the ASF footprint centroid lies **530–570 km to the left** of NISAR's ground
track, propagated with SGP4 from the CelesTrak TLE at the acquisition time. The
app therefore draws a band **430–672 km left of track** (≈242 km, the mission's
stated swath width). A unit test checks that this band covers the Bangladesh
footprint within 60 s of its real acquisition time (23:21:49 UTC, 22 Sep
2026). The band shows *where the radar can look*, not whether it was
acquiring, and is labelled MODELED.

TLE accuracy degrades with distance from its epoch, so replays use the story
frame closest to the TLE epoch.

## Who is watching

The strongest supported claim per satellite:

1. **PROVIDED THIS EVIDENCE**: granules in this story (NISAR only).
2. **OBSERVED THIS LOCATION**: live ASF archive passes at the point.
3. **CAPABLE OF OBSERVING**: the instrument type suits the phenomenon (from `missions.js`), plus the next pass ≥25° elevation from its TLE, labelled "geometry only".
4. **IN ORBIT**: the TLE propagates.

## Processing roadmap (not implemented)

Co-registration, radiometric calibration and terrain correction are already
done by the NISAR SDS for L2 products. Next steps, with Earthdata credentials
set server-side:

- GCOV HDF5 → σ⁰/γ⁰ in dB → calibrated water mask (e.g. Otsu on HH dB + HAND mask).
- GUNW HDF5 → `unwrappedPhase` → displacement (m) with `coherenceMagnitude` masking; ionospheric correction layer where present.
- COG tiling for full-resolution display.

## Change Engine: change anywhere (`src/core/changeEngine.js`)

For any clicked point, `/api/change/stacks` finds NISAR GCOV repeat-pass
stacks: granules grouped by **track / direction / frame / mode**, restricted to
public (PROVISIONAL) browse images. Comparing passes from one stack keeps the
viewing geometry identical, which is the precondition for a meaningful radar
change comparison.

1. Both browse images are georeferenced in the browser (`src/globe/browse.js`, the same corner fit).
2. They are resampled onto their intersection grid (≤1,400 px).
3. Each image is normalised by its own median brightness over the shared valid area.
4. `r = ln((B+1)/medB) − ln((A+1)/medA)`, then a 5×5 box mean to suppress speckle.
5. `|r| > 0.45` (a brightness factor of ≈1.57) → **darker** (cyan) or **brighter** (orange), only for pixels at least 8 px inside the area both passes cover (swath-edge intensity tapers otherwise create false bands) and, in the app, only over land (NASA Blue Marble mask, since over open water radar brightness follows the wind).

Validation on real data: for Bangladesh, 18 Jun → 24 Jul 2026, the engine flags
3,635 km² as darker along the Jamuna channels and western floodplain. That's
consistent with the independent water-mask analysis, with little false speckle
elsewhere, and runs in about 0.1 s. The synthetic unit tests
(`test/change.test.mjs`) check that a pure contrast-stretch difference is *not*
flagged, and that darkening and brightening regions are located correctly.

**Interpretation is deliberately open.** Darker *may indicate* new water, harvest,
clearing or drying. Brighter *may indicate* crop growth, flooded vegetation
(double bounce), wetter soil or new structures. The UI says a radar change
alone can't tell which.

Limitations: 8-bit quick-looks rather than calibrated γ⁰; the median
normalisation assumes most of the scene is stable (a scene-wide change such as
snowfall is partly normalised away); thresholds are fixed rather than
statistically calibrated per scene.

## Global Change Radar (`tools/scan_changes.py`)

Every GCOV frame imaged at least twice in the last 18 days (the 12-day repeat plus ~2 days of processing latency; pairs 6–14 days
apart) is compared with the same method on its public ~100 px thumbnails
(~2.4 km/px, 3×3 smoothing). Ranking = 0.6 × density of the densest 15×15-cell
window of changed cells + 0.4 × changed fraction of the frame. The top 600
hotspots ship in `public/data/change/radar.json` with the scan time. They're
labelled DERIVED and **SCANNED**, and clicking one runs the full-resolution
Change Engine on the same pair.

A hotspot says *the radar brightness changed a lot here*, not *an event
happened*. Edges, partial frames and wind on water can produce false
hotspots, and the full-resolution view is where a person judges them.

## Sonification (`src/sonify.js`)

The change map is scanned west → east over 8 s in 64 columns. The share of
darker pixels drives a low sine voice (90–220 Hz) and the share of brighter
pixels a high triangle voice (380–900 Hz); silence means no change. It's
derived only from the computed map and is offered as an accessibility aid.
