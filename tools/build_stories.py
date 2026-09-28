#!/usr/bin/env python3
"""
EARTH//PULSE story data pipeline.

Builds the PRE-PROCESSED REAL DATA tier used by the app when live requests are
slow or unavailable. Every asset written here is traceable to a real NISAR
granule published by ASF DAAC; nothing is synthesized.

For each story in tools/stories.json:
  1. Query the ASF Search API (public, no credentials) for NISAR granules that
     match the story's product type / track / frame / date window.
  2. Download the public LATLON browse PNG for each granule
     (https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/...). Browse images are
     8-bit quick-look renderings, NOT calibrated measurements.
  3. Georeference the browse image. The public browse PNG has no world file and
     the KML sidecar requires Earthdata login, so we fit the four extreme
     corners of the valid-data quadrilateral to the four vertices of the ASF
     footprint polygon (least squares, separable linear lon/lat model) and
     record the residual as georeferencing uncertainty.
  4. Make background transparent, downscale, and write WebP.
  5. For water stories (GCOV): derive an approximate open-water mask by
     thresholding low backscatter at the histogram valley between the dark
     (water) and bright (land) modes. Marked DERIVED with explicit caveats.
  6. Write manifest.json with full provenance for every asset.

Usage:  python3 tools/build_stories.py [story_id ...]
Requires: Python 3.9+, Pillow, NumPy. No Earthdata credentials needed.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "tools" / "stories.json"
CACHE = ROOT / "tools" / ".cache"
OUT = ROOT / "public" / "data" / "stories"
ASF_SEARCH = "https://api.daac.asf.alaska.edu/services/search/param"
BROWSE_BASE = "https://nisar.asf.earthdatacloud.nasa.gov/BROWSE"
PRODUCT_BASE = "https://nisar.asf.earthdatacloud.nasa.gov/NISAR"
UA = "earth-pulse-pipeline/0.1 (NASA Space Apps prototype)"
MAX_WIDTH = 1600
Image.MAX_IMAGE_PIXELS = 200_000_000


def log(*a):
    print("[pipeline]", *a, flush=True)


def http_get(url: str, timeout=60) -> bytes:
    # curl rather than urllib: Python 3.13+ enforces strict X.509 checks that
    # some intercepting proxies' certificate chains fail, while curl uses the
    # system trust store. Follows ASF's 303 redirect to the signed browse URL.
    last = None
    for attempt in range(3):
        r = subprocess.run(
            ["curl", "-sSfL", "--max-time", str(timeout), "-A", UA, url],
            capture_output=True,
        )
        if r.returncode == 0:
            return r.stdout
        last = r.stderr.decode(errors="replace").strip()
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"GET failed {url}: {last}")


def cached(url: str, suffix: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + suffix)
    if not p.exists():
        log("download", url[-90:])
        p.write_bytes(http_get(url, timeout=180))
    return p


def asf_search(params: dict) -> list[dict]:
    q = dict(params)
    q.setdefault("platform", "NISAR")
    q.setdefault("output", "jsonlite")
    q.setdefault("maxResults", "250")
    url = ASF_SEARCH + "?" + urllib.parse.urlencode(q, quote_via=urllib.parse.quote, safe="(),")
    body = cached(url, ".json").read_text()
    return json.loads(body)["results"]


def parse_wkt_polygon(wkt: str) -> list[tuple[float, float]]:
    inner = wkt[wkt.index("((") + 2 : wkt.rindex("))")]
    pts = [tuple(map(float, p.strip().split()[:2])) for p in inner.split(",")]
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def georeference(valid: np.ndarray, poly: list[tuple[float, float]]):
    """Fit pixel<->lon/lat for a north-up browse raster.

    Returns (west, south, east, north, residual_px, residual_km).
    """
    ys, xs = np.nonzero(valid)
    H, W = valid.shape
    # Extreme pixels of the valid quadrilateral.
    px = {
        "top": (xs[np.argmin(ys)], ys.min()),
        "bottom": (xs[np.argmax(ys)], ys.max()),
        "left": (xs.min(), ys[np.argmin(xs)]),
        "right": (xs.max(), ys[np.argmax(xs)]),
    }
    geo = {
        "top": max(poly, key=lambda p: p[1]),
        "bottom": min(poly, key=lambda p: p[1]),
        "left": min(poly, key=lambda p: p[0]),
        "right": max(poly, key=lambda p: p[0]),
    }
    keys = list(px)
    X = np.array([px[k][0] for k in keys], float)
    Y = np.array([px[k][1] for k in keys], float)
    LON = np.array([geo[k][0] for k in keys])
    LAT = np.array([geo[k][1] for k in keys])
    ax, bx = np.polyfit(LON, X, 1)  # x = ax*lon + bx
    ay, by = np.polyfit(LAT, Y, 1)  # y = ay*lat + by
    res = np.sqrt((ax * LON + bx - X) ** 2 + (ay * LAT + by - Y) ** 2)
    west = (0 - bx) / ax
    east = (W - bx) / ax
    north = (0 - by) / ay
    south = (H - by) / ay
    lat_mid = (north + south) / 2
    km_per_px = (abs(1 / ax) * 111.32 * math.cos(math.radians(lat_mid)) + abs(1 / ay) * 110.57) / 2
    rmax = float(res.max())
    return float(west), float(south), float(east), float(north), rmax, rmax * km_per_px, km_per_px


def histogram_valley(lum: np.ndarray, lo=8, hi=110, fallback=40) -> int:
    h, _ = np.histogram(lum, bins=256, range=(0, 256))
    k = np.ones(9) / 9
    s = np.convolve(h, k, mode="same")
    seg = s[lo:hi]
    if seg.size == 0:
        return fallback
    t = int(lo + np.argmin(seg))
    return t if 15 <= t <= 100 else fallback


def granule_browse_url(collection: str, granule: str) -> str:
    return f"{BROWSE_BASE}/{collection}/{granule}/{granule}_LATLON.png"


def parse_granule_name(name: str) -> dict:
    """Decode fields of the NISAR file naming convention used on ASF.

    GCOV/GSLC: NISAR_L2_PR_GCOV_<cycle>_<track>_<dir>_<frame>_<mode>_<pol>_<coverage>_<start>_<stop>_<crid>_...
    GUNW/GOFF: NISAR_L2_PR_GUNW_<refcycle>_<track>_<dir>_<frame>_<seccycle>_<mode>_<pol>_<refstart>_<refstop>_<secstart>_<secstop>_<crid>_...
    """
    p = name.split("_")
    out = {"level": p[1], "urgency": p[2], "productType": p[3]}
    try:
        if p[3] in ("GUNW", "GOFF", "RIFG", "RUNW", "ROFF"):
            out.update(referenceCycle=int(p[4]), track=int(p[5]), direction=p[6], frame=int(p[7]),
                       secondaryCycle=int(p[8]), mode=p[9], polarization=p[10],
                       referenceStart=p[11], secondaryStart=p[13])
        else:
            out.update(cycle=int(p[4]), track=int(p[5]), direction=p[6], frame=int(p[7]),
                       mode=p[8], polarization=p[9], start=p[11])
    except (IndexError, ValueError):
        pass
    return out


def iso(t: str) -> str:
    return dt.datetime.strptime(t, "%Y%m%dT%H%M%S").replace(tzinfo=dt.timezone.utc).isoformat().replace("+00:00", "Z")


def select_granules(story: dict) -> list[dict]:
    sel = story["select"]
    params = {"processingLevel": sel["product"], "intersectsWith": sel["point"]}
    if sel.get("start"):
        params["start"] = sel["start"]
    if sel.get("end"):
        params["end"] = sel["end"]
    results = asf_search(params)
    picked = {}
    for r in results:
        g = r["granuleName"]
        meta = parse_granule_name(g)
        if sel.get("track") is not None and meta.get("track") != sel["track"]:
            continue
        if sel.get("frame") is not None and meta.get("frame") != sel["frame"]:
            continue
        if sel.get("direction") and meta.get("direction") != sel["direction"]:
            continue
        if sel.get("mode") and meta.get("mode") != sel["mode"]:
            continue
        if sel.get("pairs"):
            key = (meta.get("referenceStart", "")[:8], meta.get("secondaryStart", "")[:8])
            if f"{key[0]}-{key[1]}" not in sel["pairs"]:
                continue
        else:
            key = r["startTime"][:10]
        # Prefer the highest product version / latest processing for a date.
        if key not in picked or g > picked[key]["granuleName"]:
            picked[key] = r
    out = sorted(picked.values(), key=lambda r: r["startTime"])
    if sel.get("thin") == "monthly":
        by_month = {}
        for r in out:
            cur = by_month.get(r["startTime"][:7])
            # Prefer PROVISIONAL (public browse) over BETA, then full frames.
            def rank(x):
                return ("PROVISIONAL" in x["collectionName"], (x.get("nisar") or {}).get("frameCoverage") == "Full")
            if cur is None or rank(r) > rank(cur):
                by_month[r["startTime"][:7]] = r
        out = list(by_month.values())
    if sel.get("limit"):
        out = out[: sel["limit"]]
    return out


def process_story(story: dict):
    sid = story["id"]
    outdir = OUT / sid
    outdir.mkdir(parents=True, exist_ok=True)
    granules = select_granules(story)
    if not granules:
        log(f"{sid}: no granules found — story will run in DEMO fallback")
        return None
    log(f"{sid}: {len(granules)} granules")
    frames = []
    skipped = []
    masks = []
    common_valid = None
    grid = None
    for r in granules:
        g = r["granuleName"]
        coll = r["collectionName"]
        meta = parse_granule_name(g)
        url = next((b for b in r.get("browse") or [] if b.endswith("_LATLON.png")), None) or granule_browse_url(coll, g)
        try:
            png = cached(url, ".png")
        except RuntimeError as e:
            # e.g. early BETA collections whose browse is not public.
            log(f"{sid}: skip {g[:60]}… browse unavailable ({str(e)[-40:]})")
            skipped.append({"granule": g, "reason": "browse image not publicly available"})
            continue
        im = Image.open(png).convert("RGBA")
        a = np.asarray(im).astype(np.uint8)
        rgb = a[..., :3].astype(int)
        valid = (rgb.max(axis=2) > 0) & (a[..., 3] > 0)
        poly = parse_wkt_polygon(r["wkt"])
        west, south, east, north, res_px, res_km, km_px = georeference(valid, poly)
        # Transparent background, downscale.
        a = a.copy()
        a[..., 3] = np.where(valid, 255, 0)
        H, W = valid.shape
        scale = min(1.0, MAX_WIDTH / W)
        size = (max(1, int(W * scale)), max(1, int(H * scale)))
        date_key = (meta.get("referenceStart", "")[:8] + "_" + meta.get("secondaryStart", "")[:8]) if meta.get("referenceStart") else r["startTime"][:10]
        fname = f"{date_key}.webp"
        Image.fromarray(a, "RGBA").resize(size, Image.LANCZOS).save(outdir / fname, "WEBP", quality=82, method=6)
        frame = {
            "id": g,
            "file": fname,
            "rectangle": {"west": west, "south": south, "east": east, "north": north},
            "footprint": poly,
            "acquisitionStart": r["startTime"],
            "acquisitionStop": r.get("stopTime"),
            "productType": r.get("productType") or meta.get("productType"),
            "processingLevel": meta.get("level"),
            "collection": coll,
            "conceptId": r.get("conceptID"),
            "flightDirection": r.get("flightDirection"),
            "track": meta.get("track"),
            "frame": meta.get("frame"),
            "orbit": (r.get("orbit") or [None])[0],
            "instrument": r.get("instrument"),
            "polarization": (r.get("nisar") or {}).get("mainBandPolarization"),
            "sideBandPolarization": (r.get("nisar") or {}).get("sideBandPolarization"),
            "rangeBandwidth": (r.get("nisar") or {}).get("rangeBandwidth"),
            "frameCoverage": (r.get("nisar") or {}).get("frameCoverage"),
            "orbitType": (r.get("nisar") or {}).get("orbitType"),
            "pgeVersion": r.get("pgeVersion"),
            "crid": (r.get("nisar") or {}).get("crid"),
            "downloadUrl": r.get("downloadUrl"),
            "browseUrl": url,
            "asfSearchUrl": f"https://search.asf.alaska.edu/#/?dataset=NISAR&searchType=List%20Search&searchList={g}",
            "georeferencing": {
                "method": "corner-fit of browse valid-data quadrilateral to ASF footprint polygon",
                "residualPx": round(res_px, 1),
                "residualKm": round(res_km, 2),
                "kmPerPx": round(km_px, 4),
            },
        }
        if meta.get("referenceStart"):
            frame["referenceDate"] = iso(meta["referenceStart"])
            frame["secondaryDate"] = iso(meta["secondaryStart"])
        frames.append(frame)

        if story.get("derive") == "water":
            lum = rgb.mean(axis=2)
            masks.append([frame, lum, valid, None, (west, south, east, north), (H, W)])

    if masks:
        # One threshold for the whole series keeps dates comparable: the median
        # of the per-image histogram valleys, scaled by each image's land-mode
        # brightness to absorb the per-image contrast stretch of browse PNGs.
        valleys, peaks = [], []
        for m in masks:
            lv = m[1][m[2]]
            valleys.append(histogram_valley(lv))
            h, _ = np.histogram(lv, bins=256, range=(0, 256))
            peaks.append(64 + int(np.argmax(np.convolve(h, np.ones(9) / 9, "same")[64:])))
        base_t, ref_peak = float(np.median(valleys)), float(np.median(peaks))
        for m, pk in zip(masks, peaks):
            t = round(base_t * pk / ref_peak, 1)
            m[1] = m[2] & (m[1] < t)
            m[3] = t

    derived = None
    if masks:
        derived = derive_water(story, outdir, masks)
    manifest = {
        "storyId": sid,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "dataClass": "REAL_NISAR",
        "source": {
            "name": "NASA/ISRO NISAR via ASF DAAC",
            "search": ASF_SEARCH,
            "query": story["select"],
            "access": "Public browse images (no login). Full HDF5 products require NASA Earthdata login.",
            "status": "PROVISIONAL products (collection *_PROVISIONAL_V1)",
        },
        "assetNotes": [
            "Images are ASF/NISAR LATLON browse quick-looks: 8-bit renderings of the product, not calibrated values.",
            "Georeferencing is approximate (see residualKm per frame).",
        ],
        "frames": frames,
        "skipped": skipped,
        "derived": derived,
    }
    if not frames:
        log(f"{sid}: no usable frames")
        return None
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=1))
    log(f"{sid}: wrote {len(frames)} frames")
    return manifest


def derive_water(story, outdir, masks):
    """Resample each water mask onto a common grid, compute stats + change."""
    # Common grid = union rectangle at the first frame's resolution.
    ws = min(m[4][0] for m in masks); ss = min(m[4][1] for m in masks)
    es = max(m[4][2] for m in masks); ns = max(m[4][3] for m in masks)
    f0 = masks[0]
    res_lon = (f0[4][2] - f0[4][0]) / f0[5][1]
    res_lat = (f0[4][3] - f0[4][1]) / f0[5][0]
    step = 3  # coarse grid is plenty for statistics / overlays
    GW = int((es - ws) / (res_lon * step)); GH = int((ns - ss) / (res_lat * step))
    lon = ws + (np.arange(GW) + 0.5) * res_lon * step
    lat = ns - (np.arange(GH) + 0.5) * res_lat * step
    LON, LAT = np.meshgrid(lon, lat)
    grids = []
    for frame, water, valid, t, (w, s, e, n), (H, W) in masks:
        xi = ((LON - w) / (e - w) * W).astype(int)
        yi = ((n - LAT) / (n - s) * H).astype(int)
        inside = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
        xi = np.clip(xi, 0, W - 1); yi = np.clip(yi, 0, H - 1)
        gv = inside & valid[yi, xi]
        gw = gv & water[yi, xi]
        grids.append((frame, gw, gv, t))
    common = np.logical_and.reduce([g[2] for g in grids])
    area_km2_per_cell = abs(res_lon * step * 111.32 * math.cos(math.radians((ns + ss) / 2))) * abs(res_lat * step * 110.57)
    series = []
    for frame, gw, gv, t in grids:
        wc = int((gw & common).sum())
        series.append({
            "date": frame["acquisitionStart"],
            "granule": frame["id"],
            "threshold": t,
            "waterFraction": round(wc / max(1, int(common.sum())), 4),
            "waterAreaKm2": round(wc * area_km2_per_cell),
        })
    fracs = [s["waterFraction"] for s in series]
    i0 = 0
    ipk = int(np.argmax(fracs))
    ilast = len(grids) - 1
    # Per-date water overlay + change map between first and peak dates.
    def rgba_mask(mask, color):
        img = np.zeros(mask.shape + (4,), np.uint8)
        img[mask] = color
        return Image.fromarray(img, "RGBA")
    for frame, gw, gv, t in grids:
        name = f"water_{frame['acquisitionStart'][:10]}.webp"
        rgba_mask(gw & common, (72, 214, 255, 210)).save(outdir / name, "WEBP", lossless=True)
        frame["waterMask"] = name
    before = grids[i0][1] & common; peak = grids[ipk][1] & common
    change = np.zeros(common.shape + (4,), np.uint8)
    change[peak & ~before] = (72, 214, 255, 225)   # became water
    change[before & ~peak] = (255, 176, 64, 225)   # water receded
    Image.fromarray(change, "RGBA").save(outdir / "change_first_to_peak.webp", "WEBP", lossless=True)
    gained = int((peak & ~before).sum() * area_km2_per_cell)
    lost = int((before & ~peak).sum() * area_km2_per_cell)
    return {
        "dataClass": "DERIVED",
        "method": "Open-water approximation: pixels darker than a series-wide threshold (median histogram valley between the low-backscatter water mode and the land mode, scaled per image by its land-mode brightness). Statistics are computed only where every date has valid data.",
        "caveats": [
            "Browse images are contrast-stretched per image, so thresholds differ slightly between dates.",
            "Smooth open water is dark in radar; but so are radar shadow, some dry sand and very smooth surfaces.",
            "Flooded vegetation can appear BRIGHT (double bounce) and is not captured by this dark-water mask.",
            "Wind-roughened water can appear bright and be missed.",
            "Not a substitute for the calibrated GCOV backscatter or an official flood product.",
        ],
        "grid": {"west": ws, "south": ss, "east": es, "north": ns, "cellKm2": round(area_km2_per_cell, 4)},
        "commonAreaKm2": round(int(common.sum()) * area_km2_per_cell),
        "series": series,
        "change": {
            "file": "change_first_to_peak.webp",
            "fromDate": series[i0]["date"],
            "toDate": series[ipk]["date"],
            "becameWaterKm2": gained,
            "recededKm2": lost,
        },
        "peakIndex": ipk,
        "lastIndex": ilast,
    }


def main(argv):
    cfg = json.loads(CONFIG.read_text())
    wanted = set(argv[1:])
    for story in cfg["stories"]:
        if wanted and story["id"] not in wanted:
            continue
        try:
            process_story(story)
        except Exception as e:  # keep going; the app falls back per story
            log(f"{story['id']}: FAILED {e}")
    index = []
    for story in cfg["stories"]:
        mp = OUT / story["id"] / "manifest.json"
        m = json.loads(mp.read_text()) if mp.exists() else None
        index.append({"id": story["id"], "available": bool(m), "frames": len(m["frames"]) if m else 0,
                      "generatedAt": m["generatedAt"] if m else None})
    (OUT / "index.json").write_text(json.dumps({"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "stories": index}, indent=1))


if __name__ == "__main__":
    main(sys.argv)
