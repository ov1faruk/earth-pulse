# EARTH//PULSE — launch film plan (brag-slim, 240 s)

**What it is:** An interactive globe that shows how Earth's surface is changing,
built on real NASA–ISRO NISAR radar data.
**Who it's for:** Anyone curious about the planet, and the NASA Space Apps 2026
"Dancing with the SARs" judges.
**What sets it apart:** Click *anywhere* NISAR has imaged and the app compares two
real passes of that exact place and computes what changed, live in the browser.
Every pixel has a source.
**Most impressive claim:** Five NISAR interferograms of Kumamoto, and only the pair
spanning the 28 July 2026 M6.8 earthquake shows the rupture.
**Visual hook:** A dark Earth lighting up with 203,825 real fire detections, 2,004
quakes and 2,356 NISAR footprints, which trace NISAR's orbit as cyan stripes.
**Tone:** cinematic, polished (a competition entry, not a joke). Duration: 240 s,
at the user's request, instead of brag's 15–25 s default.
**Share caption:** see `share-copy.txt`.

## Storyboard (240 s, 30 fps, 1920×1080)

| # | Time | Scene | Real material |
|---|---|---|---|
| 1 | 0–8 | Cold open: stars → Earth → "EARTH IS ALIVE." | Blue Marble + VIIRS Black Marble (NASA GIBS), real sun lighting |
| 2 | 8–30 | The planet lights up as a time-lapse, with counters | FIRMS fires (5 satellites), USGS quakes, EONET/GDACS events, NISAR footprints (CMR) |
| 3 | 30–40 | Title: EARTH//PULSE · WATCH EARTH CHANGE. | — |
| 4 | 40–72 | Meet NISAR: 302 real satellites, NISAR's orbit and modeled swath, replay of the real 22 Sep 2026 pass | CelesTrak TLEs + SGP4 (same code as the app) |
| 5 | 72–112 | Bangladesh: descent, monsoon series (8 passes), before/after wipe, derived water change ≈1,945 km² | NISAR L2 GCOV, track 069 frame 014 |
| 6 | 112–146 | Kumamoto: 5 interferograms, only the coseismic one lights up; zoom on the rupture at the USGS epicentre | NISAR L2 GUNW, track 024; USGS us6000tgb9 |
| 7 | 146–178 | Change anywhere: cursor → WHAT CHANGED HERE? → live change map (Jamuna, 3,018 km² darker); then the global change radar (986 land pairs) | Change Engine output (src/core/changeEngine.js via Node) + tools/scan_changes.py |
| 8 | 178–200 | Integrity: every pixel has a source; data-class tags; confidence levels; real granule IDs scrolling | Story manifests |
| 9 | 200–222 | Dancing with the SARs: sonification scan of the real change map | src/sonify.js algorithm |
| 10 | 222–240 | Outro: the living Earth, credits | — |

## Honesty notes

- The global-radar caption says "where the radar saw the biggest changes: rain,
  floods, harvests". The land-masked scan showed the largest 12-day changes are
  often weather-driven, so the film doesn't claim "where Earth changed most".
- The Change Engine demo uses the 18 Jun → 24 Jul Bangladesh pair. The 30 Jun
  image has a dark stripe artifact along its top edge, so it wasn't used.
- The only simulated visual (the How-did-NISAR-know diagram) isn't in the film.

## Sound

An original synthesized score in D minor at 90 BPM: pads, sub pulse, arpeggio,
risers and impacts locked to scene hits. At 203–221 s the music ducks under the
real sonification of the change map. Mix checked numerically: ~40% power below
150 Hz, ~55% at 150 Hz–2 kHz, no clipping, peaks ≤ −1 dBFS.
