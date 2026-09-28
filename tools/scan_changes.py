#!/usr/bin/env python3
"""
GLOBAL CHANGE RADAR — scan the newest NISAR repeat pairs worldwide.

For every NISAR GCOV frame (track/direction/frame/mode) imaged at least twice
in the last N days, compare its two most recent passes using the public
LATLON *thumbnail* browse images (≈100×100 px, ~2.4 km/px), with the same
method as the in-browser Change Engine (src/core/changeEngine.js):
median-normalised log-ratio, 3×3 smoothing, threshold ±0.45.

Output: public/data/change/radar.json — ranked change hotspots (DERIVED data).
A hotspot means "the radar brightness of this frame changed a lot between two
passes", NOT a confirmed event. Clicking one in the app runs the full-resolution
engine on the same pair.

Usage: python3 tools/scan_changes.py [days=18] [max_frames=1500]
"""
import concurrent.futures as cf
import datetime as dt
import io
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "change"
CACHE = ROOT / "tools" / ".cache" / "thumbs"
GCOV = ("C2854338529-ASF", "NISAR_L2_GCOV_PROVISIONAL_V1")
BROWSE = "https://nisar.asf.earthdatacloud.nasa.gov/BROWSE"
UA = "earth-pulse-scan/0.1"
THRESH = 0.45
LAND_TEX = ROOT / "tools" / ".cache" / "bluemarble_2048.jpg"
_land = None


def land_mask(LON, LAT):
    """True over land (incl. ice sheets), from NASA Blue Marble (GIBS): ocean pixels are dark and blue-dominant."""
    global _land
    if _land is None:
        if not LAND_TEX.exists():
            _, body = curl("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/jpeg&LAYERS=BlueMarble_NextGeneration", timeout=120)
            LAND_TEX.parent.mkdir(parents=True, exist_ok=True); LAND_TEX.write_bytes(body)
        a = np.asarray(Image.open(LAND_TEX).convert("RGB")).astype(np.int16)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        _land = ~((b > r + 8) & (b >= g) & (r + g + b < 330))
    h, w = _land.shape
    x = np.clip((((LON + 180) % 360) / 360 * w).astype(int), 0, w - 1)
    y = np.clip(((90 - LAT) / 180 * h).astype(int), 0, h - 1)
    return _land[y, x]


def curl(url, headers=None, timeout=120, retries=3):
    cmd = ["curl", "-sSfL", "--max-time", str(timeout), "-A", UA, "-D", "-", url]
    for k, v in (headers or {}).items():
        cmd[1:1] = ["-H", f"{k}: {v}"]
    for attempt in range(retries):
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode == 0:
            break
        import time; time.sleep(3 * (attempt + 1))
    else:
        raise RuntimeError(r.stderr.decode(errors="replace")[:200])
    raw = r.stdout
    # split last header block from body (redirects produce several header blocks)
    idx = 0
    hdrs = {}
    while raw[idx:idx + 5] == b"HTTP/":
        end = raw.index(b"\r\n\r\n", idx)
        hdrs = {}
        for line in raw[idx:end].decode(errors="replace").split("\r\n")[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                hdrs[k.strip().lower()] = v.strip()
        idx = end + 4
    return hdrs, raw[idx:]


def cmr_granules(days):
    cache = ROOT / "tools" / ".cache" / f"cmr_gcov_{days}d_{dt.datetime.now(dt.timezone.utc):%Y%m%d%H}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    items = _cmr_granules(days)
    cache.write_text(json.dumps(items))
    return items


def _cmr_granules(days):
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).strftime("%Y-%m-%dT%H:00:00Z")
    items, after = [], None
    for _ in range(12):
        url = f"https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id={GCOV[0]}&temporal={since},&page_size=2000&sort_key=-start_date"
        h, body = curl(url, {"CMR-Search-After": after} if after else None, timeout=180)
        entries = json.loads(body)["feed"]["entry"]
        for e in entries:
            poly = (e.get("polygons") or [[""]])[0][0].split()
            ring = [[float(poly[i + 1]), float(poly[i])] for i in range(0, len(poly) - 1, 2)]
            items.append({"id": e.get("producer_granule_id") or e["title"], "t": e["time_start"], "ring": ring})
        after = h.get("cmr-search-after")
        print(f"[scan] CMR page: {len(entries)} (total {len(items)})", flush=True)
        if not after or len(entries) < 2000:
            break
    return items


def thumb(gid):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / f"{gid}.png"
    if not p.exists():
        _, body = curl(f"{BROWSE}/{GCOV[1]}/{gid}/{gid}_LATLON_thumbnail.png", timeout=60)
        p.write_bytes(body)
    return p


def georef(img, ring):
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    valid = (a[..., 3] > 0) & (a[..., :3].max(axis=2) > 0)
    ys, xs = np.nonzero(valid)
    if len(xs) < 50:
        return None
    lons = [p[0] for p in ring]
    if max(lons) - min(lons) > 180:
        ring = [[lo + 360 if lo < 0 else lo, la] for lo, la in ring]
    geo = {"top": max(ring, key=lambda p: p[1]), "bottom": min(ring, key=lambda p: p[1]),
           "left": min(ring, key=lambda p: p[0]), "right": max(ring, key=lambda p: p[0])}
    pix = {"top": (xs[np.argmin(ys)], ys.min()), "bottom": (xs[np.argmax(ys)], ys.max()),
           "left": (xs.min(), ys[np.argmin(xs)]), "right": (xs.max(), ys[np.argmax(xs)])}
    k = list(geo)
    ax, bx = np.polyfit([geo[i][0] for i in k], [pix[i][0] for i in k], 1)
    ay, by = np.polyfit([geo[i][1] for i in k], [pix[i][1] for i in k], 1)
    H, W = valid.shape
    rect = (-bx / ax, (H - by) / ay, (W - bx) / ax, -by / ay)  # w s e n
    return {"lum": a[..., :3].mean(axis=2), "valid": valid, "rect": rect, "W": W, "H": H}


def box3(x, v):
    xs = np.where(v, x, 0.0)
    n = v.astype(np.float32)
    k = lambda z: sum(np.roll(np.roll(z, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    s, c = k(xs), k(n)
    return np.where(c > 0, s / np.maximum(c, 1), 0)


def compare(A, B):
    w = max(A["rect"][0], B["rect"][0]); e = min(A["rect"][2], B["rect"][2])
    s = max(A["rect"][1], B["rect"][1]); n = min(A["rect"][3], B["rect"][3])
    if not (e > w and n > s):
        return None
    G = 90
    lon = w + (np.arange(G) + 0.5) * (e - w) / G
    lat = n - (np.arange(G) + 0.5) * (n - s) / G
    LON, LAT = np.meshgrid(lon, lat)

    def samp(I):
        x = ((LON - I["rect"][0]) / (I["rect"][2] - I["rect"][0]) * I["W"]).astype(int)
        y = ((I["rect"][3] - LAT) / (I["rect"][3] - I["rect"][1]) * I["H"]).astype(int)
        ok = (x >= 0) & (x < I["W"]) & (y >= 0) & (y < I["H"])
        x, y = np.clip(x, 0, I["W"] - 1), np.clip(y, 0, I["H"] - 1)
        return I["lum"][y, x], ok & I["valid"][y, x]

    la, va = samp(A); lb, vb = samp(B)
    v = va & vb
    if v.sum() < 800:
        return None
    land = land_mask(LON, LAT)
    land_frac = float((v & land).sum() / v.sum())
    if land_frac < 0.4:
        return None  # mostly ocean: radar brightness there is driven by wind, not surface change
    v = v & land
    ma, mb = max(1.0, np.median(la[v])), max(1.0, np.median(lb[v]))
    r = box3(np.log((lb + 1) / mb) - np.log((la + 1) / ma), v)
    up = v & (r > THRESH); dn = v & (r < -THRESH)
    nv = v.sum()
    # hotspot = densest 15×15 window of changed cells
    ch = (up | dn).astype(np.float32)
    cs = np.cumsum(np.cumsum(np.pad(ch, ((1, 0), (1, 0))), 0), 1)
    K = 15
    win = cs[K:, K:] - cs[:-K, K:] - cs[K:, :-K] + cs[:-K, :-K]
    iy, ix = np.unravel_index(np.argmax(win), win.shape)
    hlat, hlon = float(lat[iy + K // 2]), float(lon[ix + K // 2])
    return {"landFraction": round(land_frac, 2), "score": float((up.sum() + dn.sum()) / nv), "brighter": float(up.sum() / nv), "darker": float(dn.sum() / nv),
            "lon": ((hlon + 180) % 360) - 180, "lat": hlat, "hotDensity": float(win.max() / (K * K))}


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 18  # ≥ 12-day repeat + ~2-day processing latency + margin
    max_frames = int(sys.argv[2]) if len(sys.argv) > 2 else 1500
    gs = cmr_granules(days)
    frames = {}
    for g in gs:
        p = g["id"].split("_")
        if len(p) < 9 or len(g["ring"]) < 3:
            continue
        key = f"{p[5]}_{p[6]}_{p[7]}_{p[8]}"
        day = g["t"][:10]
        frames.setdefault(key, {})
        if day not in frames[key] or g["id"] > frames[key][day]["id"]:
            frames[key][day] = g
    pairs = []
    for key, dates in frames.items():
        ds = sorted(dates.values(), key=lambda g: g["t"])
        if len(ds) >= 2:
            a, b = ds[-2], ds[-1]
            gap = (dt.datetime.fromisoformat(b["t"][:19]) - dt.datetime.fromisoformat(a["t"][:19])).days
            if 6 <= gap <= 14:
                pairs.append((key, a, b, gap))
    pairs.sort(key=lambda x: x[2]["t"], reverse=True)
    pairs = pairs[:max_frames]
    print(f"[scan] {len(frames)} frames, {len(pairs)} repeat pairs to compare", flush=True)

    def work(pair):
        key, a, b, gap = pair
        try:
            A = georef(Image.open(thumb(a["id"])), a["ring"]); B = georef(Image.open(thumb(b["id"])), b["ring"])
            if not A or not B:
                return None
            c = compare(A, B)
            if not c:
                return None
            tr, di, fr, mo = key.split("_")
            return {"key": key, "track": int(tr), "dir": di, "frame": int(fr), "mode": mo, "gapDays": gap,
                    "from": {"id": a["id"], "t": a["t"], "coll": GCOV[1], "ring": a["ring"]},
                    "to": {"id": b["id"], "t": b["t"], "coll": GCOV[1], "ring": b["ring"]}, **c}
        except Exception as e:
            return None

    results = []
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        for i, r in enumerate(ex.map(work, pairs)):
            if r:
                results.append(r)
            if i % 100 == 0:
                print(f"[scan] {i}/{len(pairs)} compared, {len(results)} usable", flush=True)
    results.sort(key=lambda r: r["hotDensity"] * 0.6 + r["score"] * 0.4, reverse=True)
    OUT.mkdir(parents=True, exist_ok=True)
    out = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "dataClass": "DERIVED",
        "window": f"last {days} days",
        "method": "Two most recent passes of each NISAR GCOV frame (same track/direction/frame/mode, 6–14 days apart) compared with thumbnail browse images: median-normalised log-ratio, 3×3 smoothing, threshold ±0.45. Hotspot = densest 15×15-cell window of changed cells.",
        "caveats": [
            "Thumbnails are ~2.4 km/pixel quick-looks; small changes are invisible and speckle/edges can create false hotspots.",
            "A hotspot means radar brightness changed, not that a specific event happened (water, crops, soil moisture, snow, wind on water…).",
            "Frames at the edge of the data or with partial coverage can score spuriously.",
            "Only land pixels count (ocean masked with NASA Blue Marble): over water, radar brightness mostly tracks wind. Frames under 40% land are skipped.",
        ],
        "framesScanned": len(frames), "pairsCompared": len(results),
        "hotspots": results[:600],
    }
    (OUT / "radar.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"[scan] wrote {len(out['hotspots'])} hotspots from {len(results)} pairs", flush=True)


if __name__ == "__main__":
    main()
