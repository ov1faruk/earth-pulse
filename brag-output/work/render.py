#!/usr/bin/env python3
"""EARTH//PULSE — 240 s launch film. Every frame is a pure function of time,
drawn from the project's real data (NISAR imagery, FIRMS, USGS, EONET, CMR, TLEs).

  python3 render.py still <t> [out.png]     render one frame
  python3 render.py video out.mp4 [t0 t1]   render (pipes raw frames to ffmpeg)
"""
import json, math, os, sys, subprocess
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
A = os.path.join(HERE, 'assets')
W, H, FPS, DUR = 1920, 1080, 30, 240.0

# ---------------------------------------------------------------- palette
BG = np.array([4, 6, 10], np.float32) / 255
CYAN = (127, 230, 255); WATER = (72, 214, 255); AMBER = (255, 179, 71); MAGENTA = (255, 95, 162)
FIRE = (255, 122, 47); WHITE = (242, 245, 248); INK2 = (200, 208, 216); INK3 = (130, 140, 150); ORANGE = (255, 160, 51)

# ---------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(x): x = clamp(x); return x * x * (3 - 2 * x)
def ease_io(x): x = clamp(x); return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def ramp(t, a, b): return clamp((t - a) / (b - a)) if b > a else float(t >= a)
def window(t, a, b, fi=0.6, fo=0.6): return min(smooth(ramp(t, a, a + fi)), 1 - smooth(ramp(t, b - fo, b)))
def lerp(a, b, k): return a + (b - a) * k

# ---------------------------------------------------------------- assets (lazy, per process)
_cache = {}
def asset(name, loader):
    if name not in _cache: _cache[name] = loader()
    return _cache[name]

def tex(name):
    return asset(name, lambda: np.asarray(Image.open(os.path.join(A, name)).convert('RGB'), np.float32) / 255)

def rgba(path, maxw=None):
    def ld():
        im = Image.open(path).convert('RGBA')
        if maxw and im.width > maxw: im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
        return np.asarray(im, np.float32) / 255
    return asset('rgba:' + path + str(maxw), ld)

def data():
    return asset('data', lambda: dict(np.load(os.path.join(A, 'data.npz'))))

def meta():
    return asset('meta', lambda: json.load(open(os.path.join(A, 'meta.json'))))

def orbits():
    return asset('orbits', lambda: json.load(open(os.path.join(HERE, 'orbits.json'))))

def story(sid):
    return asset('story:' + sid, lambda: json.load(open(os.path.join(ROOT, 'public', 'data', 'stories', sid, 'manifest.json'))))

def radar():
    p = os.path.join(ROOT, 'public', 'data', 'change', 'radar.json')
    return asset('radar', lambda: json.load(open(p)) if os.path.exists(p) else {'hotspots': [], 'pairsCompared': 0})

def film():
    return asset('film', lambda: json.load(open(os.path.join(HERE, 'film.json'))))

@lru_cache(64)
def font(size, weight=500, mono=False):
    if mono:
        f = ImageFont.truetype(os.path.join(A, 'PlexMonoMed.ttf' if weight >= 500 else 'PlexMono.ttf'), size)
    else:
        f = ImageFont.truetype(os.path.join(A, 'InterTight.ttf'), size)
        try: f.set_variation_by_axes([weight])
        except Exception: pass
    return f

# ---------------------------------------------------------------- globe
def basis(lon0, lat0):
    lo, la = math.radians(lon0), math.radians(lat0)
    c = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    e = np.array([-math.sin(lo), math.cos(lo), 0.0])
    n = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    return e, n, c

def to_xyz(lon, lat, r=1.0):
    lo, la = np.radians(lon), np.radians(lat)
    return np.stack([r * np.cos(la) * np.cos(lo), r * np.cos(la) * np.sin(lo), r * np.sin(la)], -1)

def project(cam, lon, lat, r=1.0):
    e, n, c = basis(cam['lon'], cam['lat'])
    p = to_xyz(np.asarray(lon, np.float64), np.asarray(lat, np.float64), r)
    x, y, z = p @ e, p @ n, p @ c
    u = cam['cx'] + cam['R'] * x
    v = cam['cy'] - cam['R'] * y
    vis = (z > 0) | ((x * x + y * y) > 1.0) if np.ndim(r) or r > 1 else (z > 0)
    return u, v, vis

def sample(img, lon, lat, rect):
    w, s, e_, n = rect
    h, wd = img.shape[:2]
    m = (lon >= w) & (lon < e_) & (lat > s) & (lat <= n)
    ix = np.clip(((lon[m] - w) / (e_ - w) * wd).astype(np.int32), 0, wd - 1)
    iy = np.clip(((n - lat[m]) / (n - s) * h).astype(np.int32), 0, h - 1)
    return m, img[iy, ix]

def render_globe(cam, overlays=(), light=1.0, sun=(-60.0, 0.0), atmo=1.0):
    """Orthographic Earth with real sun lighting, VIIRS night lights and draped overlays."""
    img = np.empty((H, W, 3), np.float32); img[:] = BG
    cx, cy, R = cam['cx'], cam['cy'], cam['R']
    # Margin must cover the atmosphere halo, or its glow is cut off in a visible square.
    halo_w = R * 0.045 + 6
    m = R + (halo_w * 9 if atmo > 0 else 2)
    x0, x1 = int(max(0, cx - m)), int(min(W, cx + m))
    y0, y1 = int(max(0, cy - m)), int(min(H, cy + m))
    if x1 <= x0 or y1 <= y0: return img
    uu, vv = np.meshgrid(np.arange(x0, x1, dtype=np.float32), np.arange(y0, y1, dtype=np.float32))
    x = (uu + .5 - cx) / R; y = (cy - vv - .5) / R
    rr = x * x + y * y
    inside = rr < 1
    z = np.sqrt(np.clip(1 - rr, 0, 1))
    e, n, c = basis(cam['lon'], cam['lat'])
    wx = x * e[0] + y * n[0] + z * c[0]; wy = x * e[1] + y * n[1] + z * c[1]; wz = x * e[2] + y * n[2] + z * c[2]
    lat = np.degrees(np.arcsin(np.clip(wz, -1, 1))); lon = np.degrees(np.arctan2(wy, wx))
    L, La = lon[inside], lat[inside]
    day = tex('day.jpg'); night = tex('night.jpg')
    th, tw = day.shape[:2]
    ix = np.clip(((L + 180) / 360 * tw).astype(np.int32), 0, tw - 1)
    iy = np.clip(((90 - La) / 180 * th).astype(np.int32), 0, th - 1)
    col = day[iy, ix]
    if light > 0:
        s = to_xyz(sun[0], sun[1])
        d = wx[inside] * s[0] + wy[inside] * s[1] + wz[inside] * s[2]
        dayk = np.clip((d + 0.08) / 0.22, 0, 1)[:, None]
        nt = night[iy, ix]
        lit = col * (0.35 + 0.65 * np.clip(d, 0, 1)[:, None] ** 0.5)
        dark = col * 0.05 + nt * np.array([1.35, 1.15, 0.8]) * 1.1
        col = lerp(col, lit * dayk + dark * (1 - dayk), light)
    for ov in overlays:
        m, sm = sample(ov['img'], L, La, ov['rect'])
        if not m.any(): continue
        a = sm[:, 3:4] * ov.get('alpha', 1.0)
        if 'xmask' in ov:
            ux = uu[inside][m]
            a = a * ((ux >= ov['xmask'][0]) & (ux < ov['xmask'][1]))[:, None]
        cur = col[m]
        col[m] = cur * (1 - a) + sm[:, :3] * a
    # limb: darken + blue haze
    zi = z[inside][:, None]
    col = col * (0.62 + 0.38 * zi ** 0.35) + np.array([0.25, 0.5, 1.0]) * (1 - zi) ** 3 * 0.35 * atmo
    sub = img[y0:y1, x0:x1]
    sub[inside] = col
    if atmo > 0:
        r = np.sqrt(rr)
        halo = np.exp(-np.clip(r - 1, 0, None) * R / halo_w) * (~inside)
        sub += halo[..., None] * np.array([0.22, 0.45, 0.95], np.float32) * 0.55 * atmo
    return img

# ---------------------------------------------------------------- glow splats
def blur(a, r):
    if r <= 0: return a
    for axis in (0, 1):
        c = np.cumsum(np.pad(a, [(r + 1, r) if i == axis else (0, 0) for i in range(a.ndim)]), axis=axis)
        sl_hi = [slice(None)] * a.ndim; sl_lo = [slice(None)] * a.ndim
        sl_hi[axis] = slice(2 * r + 1, None); sl_lo[axis] = slice(0, -(2 * r + 1))
        a = (c[tuple(sl_hi)] - c[tuple(sl_lo)]) / (2 * r + 1)
    return a

def splat_layer(pts, scale=2):
    """pts: list of (u, v, weight, (r,g,b), core_px, glow_px) arrays. Returns additive RGB layer."""
    hw, hh = W // scale, H // scale
    out = np.zeros((hh, hw, 3), np.float32)
    for u, v, wgt, color, core, glow in pts:
        m = (u >= 0) & (u < W) & (v >= 0) & (v < H)
        if not m.any(): continue
        idx = (v[m] // scale).astype(np.int64) * hw + (u[m] // scale).astype(np.int64)
        acc = np.bincount(idx, weights=wgt[m], minlength=hw * hh).reshape(hh, hw).astype(np.float32)
        layer = blur(acc, core) * 1.0 + blur(acc, glow) * 0.9
        out += (1 - np.exp(-layer * 1.6))[..., None] * (np.array(color, np.float32) / 255) * 1.1  # soft saturation
    return np.asarray(Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), np.float32) / 255

# ---------------------------------------------------------------- text & UI
def tracking_text(draw, xy, text, f, fill, track=0.0, anchor='l'):
    """Draw text with letter spacing (track in em). anchor l|c|r on x.
    On RGB targets Pillow ignores text alpha, so text is drawn onto a
    transparent patch and blended in with its alpha as the mask."""
    target = getattr(draw, '_image', None)
    if target is not None and target.mode == 'RGB' and len(fill) == 4:
        if fill[3] <= 0: return
        asc, desc = f.getmetrics()
        sp = f.size * track
        widths = [draw.textlength(ch, font=f) for ch in text] if track else [draw.textlength(text, font=f)]
        total = sum(widths) + (sp * (len(text) - 1) if track else 0)
        x0 = xy[0] - (total / 2 if anchor == 'c' else total if anchor == 'r' else 0)
        pad = 4
        patch = Image.new('RGBA', (int(total) + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))
        pd = ImageDraw.Draw(patch)
        tracking_text(pd, (pad, pad + asc), text, f, fill, track, 'l')
        target.paste(patch, (int(round(x0)) - pad, int(round(xy[1])) - asc - pad), patch)
        return
    if track == 0:
        a = {'l': 'ls', 'c': 'ms', 'r': 'rs'}[anchor]
        draw.text(xy, text, font=f, fill=fill, anchor=a); return
    sp = f.size * track
    widths = [draw.textlength(ch, font=f) for ch in text]
    total = sum(widths) + sp * (len(text) - 1)
    x = xy[0] - (total / 2 if anchor == 'c' else total if anchor == 'r' else 0)
    for ch, wd in zip(text, widths):
        draw.text((x, xy[1]), ch, font=f, fill=fill, anchor='ls'); x += wd + sp

def cap(ov, t, a, b, text, y, size=64, weight=600, color=WHITE, track=0.0, x=W / 2, anchor='c', rise=18, fi=0.7, fo=0.6, mono=False):
    k = window(t, a, b, fi, fo)
    if k <= 0: return
    d = ImageDraw.Draw(ov)
    yy = y + (1 - ease_out(ramp(t, a, a + fi))) * rise
    tracking_text(d, (x, yy), text, font(size, weight, mono), color + (int(255 * k),), track, anchor)

def shadow_text(frame, fn):
    """Draw via fn(ov) with a soft dark shadow for legibility over imagery."""
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); fn(ov)
    a = ov.split()[3]
    sh = a.filter(ImageFilter.GaussianBlur(10)).point(lambda p: int(p * 0.75))
    frame.paste((0, 0, 0), (0, 0, W, H), sh)
    frame.paste(ov, (0, 0), ov)

def glass(frame, box, radius=18, alpha=1.0, tint=(10, 14, 22)):
    x0, y0, x1, y1 = [int(v) for v in box]
    if x1 <= x0 or y1 <= y0 or alpha <= 0: return
    crop = frame.crop((x0, y0, x1, y1)).convert('RGB').filter(ImageFilter.GaussianBlur(18))
    crop = Image.blend(crop, Image.new('RGB', crop.size, tint), 0.55)
    mask = Image.new('L', crop.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, x1 - x0 - 1, y1 - y0 - 1), radius, fill=int(255 * alpha))
    frame.paste(crop, (x0, y0), mask)
    d = ImageDraw.Draw(frame, 'RGBA')
    d.rounded_rectangle((x0, y0, x1 - 1, y1 - 1), radius, outline=(255, 255, 255, int(40 * alpha)), width=1)

def tag(d, x, y, text, color, alpha=1.0, size=15):
    f = font(size, 500)
    wd = d.textlength(text, font=f) + size * 0.2 * len(text) * 0.15
    tw = sum(d.textlength(ch, font=f) for ch in text) + size * 0.16 * (len(text) - 1)
    d.rounded_rectangle((x, y, x + tw + 34, y + size + 16), 7, outline=color + (int(255 * alpha),), width=2)
    d.ellipse((x + 11, y + (size + 16) / 2 - 4, x + 19, y + (size + 16) / 2 + 4), fill=color + (int(255 * alpha),))
    tracking_text(d, (x + 26, y + size + 7), text, f, color + (int(255 * alpha),), 0.16)
    return tw + 34

def paste_img(frame, arr, box, alpha=1.0):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGBA')
    x0, y0, x1, y1 = [int(v) for v in box]
    im = im.resize((x1 - x0, y1 - y0), Image.LANCZOS)
    if alpha < 1: im.putalpha(im.split()[3].point(lambda p: int(p * alpha)))
    frame.paste(im, (x0, y0), im)

# ---------------------------------------------------------------- camera keyframes
def cam_path(t, keys):
    """keys: [(time, lon, lat, R, cx, cy)] with eased interpolation (shortest lon)."""
    if t <= keys[0][0]: k0 = k1 = keys[0]; f = 0
    elif t >= keys[-1][0]: k0 = k1 = keys[-1]; f = 0
    else:
        for i in range(len(keys) - 1):
            if keys[i][0] <= t <= keys[i + 1][0]:
                k0, k1 = keys[i], keys[i + 1]; f = ease_io((t - k0[0]) / (k1[0] - k0[0])); break
    dl = ((k1[1] - k0[1] + 540) % 360) - 180
    # zoom interpolated in log space so descents feel continuous
    R = math.exp(lerp(math.log(k0[3]), math.log(k1[3]), f))
    return {'lon': k0[1] + dl * f, 'lat': lerp(k0[2], k1[2], f), 'R': R, 'cx': lerp(k0[4], k1[4], f), 'cy': lerp(k0[5], k1[5], f)}

def stars(frame_arr, t, alpha=1.0, seed=7):
    rng = np.random.default_rng(seed)
    n = 900
    u = rng.uniform(0, W, n); v = rng.uniform(0, H, n); b = rng.uniform(0.15, 1, n) ** 3
    tw = 0.75 + 0.25 * np.sin(t * rng.uniform(0.5, 2, n) + rng.uniform(0, 6, n))
    iu, iv = u.astype(int), v.astype(int)
    frame_arr[iv, iu] = np.maximum(frame_arr[iv, iu], (b * tw * alpha)[:, None] * np.array([0.85, 0.9, 1.0]))

# ================================================================ SCENES
def data_layers(cam, t, prog_fire=1.0, prog_quake=1.0, prog_nisar=1.0, fire_amt=1.0, quake_amt=1.0, nisar_amt=1.0, events_amt=0.6):
    D = data(); pts = []
    if fire_amt > 0:
        f = D['fires']
        order = asset('fire_rank', lambda: np.argsort(np.argsort(f[:, 3])) / len(f))
        m = order <= prog_fire
        u, v, vis = project(cam, f[m, 0], f[m, 1])
        wgt = (0.10 + np.clip(np.log10(1 + f[m, 2]), 0, 3) * 0.12) * vis * fire_amt
        pts.append((u, v, wgt.astype(np.float64), FIRE, 0, 1))
    if quake_amt > 0:
        q = D['quakes']
        order = asset('q_rank', lambda: np.argsort(np.argsort(q[:, 3])) / len(q))
        m = order <= prog_quake
        u, v, vis = project(cam, q[m, 0], q[m, 1])
        wgt = (0.6 + (q[m, 2] - 2.5) * 0.9) * vis * quake_amt
        pts.append((u, v, wgt.astype(np.float64), MAGENTA, 1, 4))
    if nisar_amt > 0:
        nz = D['nisar']
        k = int(len(nz) * prog_nisar)
        u, v, vis = project(cam, nz[:k, 0], nz[:k, 1])
        wgt = np.full(k, 2.6) * vis * nisar_amt
        pts.append((u, v, wgt, CYAN, 1, 5))
    if events_amt > 0:
        ev = D['events']
        u, v, vis = project(cam, ev[:, 0], ev[:, 1])
        pts.append((u, v, np.full(len(ev), 0.5) * vis * events_amt, (255, 209, 102), 1, 3))
    return splat_layer(pts)

def sat_layer(ov, cam, simk, amt=1.0, highlight_nisar=0.0, trail=0.0, swath=0.0):
    """Real satellite positions (orbits.json), simk = fractional step index."""
    O = orbits(); d = ImageDraw.Draw(ov)
    i0 = int(simk) % O['steps']; i1 = (i0 + 1) % O['steps']; fr = simk - int(simk)
    nisar_uv = None
    for s in O['sats']:
        a, b = s['pos'][i0], s['pos'][i1]
        if not a or not b: continue
        dl = ((b[0] - a[0] + 540) % 360) - 180
        lon, lat, alt = a[0] + dl * fr, lerp(a[1], b[1], fr), lerp(a[2], b[2], fr)
        if alt > 3000: alt = 3000 + (alt - 3000) * 0.05   # keep GEO/MEO within frame
        u, v, vis = project(cam, np.array([lon]), np.array([lat]), 1 + alt / 6371)
        if not vis[0]: continue
        if s['norad'] == 65053:
            nisar_uv = (float(u[0]), float(v[0])); continue
        r = 2.2
        d.ellipse((u[0] - r, v[0] - r, u[0] + r, v[0] + r), fill=(215, 228, 240, int(200 * amt)))
    if swath > 0:
        sw = O['nisarSwath']; k = int(simk)
        seg = sw[max(0, k - 16):k + 1]
        if len(seg) >= 2:
            near = np.array([p['near'] for p in seg]); far = np.array([p['far'] for p in seg])
            un, vn, vsn = project(cam, near[:, 0], near[:, 1]); uf, vf, vsf = project(cam, far[:, 0], far[:, 1])
            if vsn.all() and vsf.all():
                poly = list(zip(un, vn)) + list(zip(uf[::-1], vf[::-1]))
                d.polygon(poly, fill=CYAN + (int(60 * swath),), outline=CYAN + (int(140 * swath),))
    if trail > 0:
        sw = orbits()['nisarSwath']; k = int(simk)
        seg = sw[max(0, k - 120):min(len(sw), k + 120)]
        nad = np.array([p['nadir'] for p in seg])
        u, v, vis = project(cam, nad[:, 0], nad[:, 1], 1 + 750 / 6371)
        pts = [(a, b) for a, b, vv in zip(u, v, vis) if vv]
        if len(pts) > 2: d.line(pts, fill=CYAN + (int(150 * trail),), width=2)
    if nisar_uv and amt > 0:
        u, v = nisar_uv; k = highlight_nisar
        rr = 7 + 5 * k
        d.ellipse((u - rr * 2.4, v - rr * 2.4, u + rr * 2.4, v + rr * 2.4), fill=CYAN + (int(40 * max(amt, k)),))
        d.ellipse((u - rr, v - rr, u + rr, v + rr), outline=(255, 255, 255, int(255 * max(amt, k))), width=2)
        d.ellipse((u - 3.5, v - 3.5, u + 3.5, v + 3.5), fill=(255, 255, 255, 255))
        if k > 0:
            tracking_text(d, (u + 26, v + 7), 'NISAR', font(24, 600), WHITE + (int(255 * k),), 0.18)
    return nisar_uv

def counters(ov, t, a, b):
    k = window(t, a, b, 1.0, 0.8)
    if k <= 0: return
    c = meta()['counts']; d = ImageDraw.Draw(ov)
    p = ease_out(ramp(t, a, a + 6))
    items = [(c['fires'], 'FIRE DETECTIONS', FIRE), (c['quakes'], 'EARTHQUAKES', MAGENTA), (c['events'], 'NATURAL EVENTS', (255, 209, 102)), (c['nisar'], 'NISAR IMAGES', CYAN)]
    x = W / 2 - 4 * 250 + 250
    for i, (n, label, col) in enumerate(items):
        xx = W / 2 + (i - 1.5) * 330
        tracking_text(d, (xx, H - 118), f'{int(n * p):,}', font(46, 500, mono=True), WHITE + (int(255 * k),), 0, 'c')
        f15 = font(15, 500)
        lw = sum(d.textlength(ch, font=f15) for ch in label) + 15 * 0.22 * (len(label) - 1)
        lx = xx - lw / 2 + 9
        d.ellipse((lx - 18, H - 82, lx - 8, H - 72), fill=col + (int(255 * k),))
        tracking_text(d, (lx, H - 71), label, f15, INK2 + (int(230 * k),), 0.22, 'l')

def brand(ov, t, alpha=1.0):
    if alpha <= 0: return
    d = ImageDraw.Draw(ov)
    tracking_text(d, (48, 70), 'EARTH', font(24, 600), WHITE + (int(235 * alpha),), 0.22)
    x = 48 + sum(d.textlength(ch, font=font(24, 600)) for ch in 'EARTH') + 24 * 0.22 * 5
    tracking_text(d, (x, 70), '//', font(24, 600), CYAN + (int(235 * alpha),), 0.1)
    tracking_text(d, (x + 34, 70), 'PULSE', font(24, 600), WHITE + (int(235 * alpha),), 0.22)
    tracking_text(d, (48, 96), 'WATCH EARTH CHANGE.', font(13, 500), INK3 + (int(220 * alpha),), 0.34)

def replay_pill(ov, text, alpha):
    if alpha <= 0: return
    d = ImageDraw.Draw(ov); f = font(18, 500, mono=True)
    tw = d.textlength(text, font=f)
    d.rounded_rectangle((48, H - 76, 48 + tw + 44, H - 38), 19, fill=(8, 11, 18, int(200 * alpha)), outline=AMBER + (int(160 * alpha),))
    d.text((70, H - 57), text, font=f, fill=AMBER + (int(255 * alpha),), anchor='lm')

def radar_splat(cam, prog, amt=1.0):
    hs = radar()['hotspots']
    n = int(len(hs) * prog)
    if not n or amt <= 0: return 0
    arr = np.array([[h['lon'], h['lat'], h['hotDensity'], 1 if h['darker'] > h['brighter'] else 0] for h in hs[:n]])
    pts = []
    for dk, col in ((1, WATER), (0, ORANGE)):
        sel = arr[arr[:, 3] == dk]
        if len(sel):
            uu, vv, vis = project(cam, sel[:, 0], sel[:, 1])
            pts.append((uu, vv, (3.0 + sel[:, 2] * 8) * vis * amt, col, 2, 7))
    return splat_layer(pts) if pts else 0

# ---------------------------------------------------------------- scene timeline
SUN = (-15.0, 0.0)  # subsolar point for the planet shots (sun over the Atlantic)

GLOBE_KEYS = [
    (0, 40, 12, 380, W / 2, H / 2 + 20), (8, 60, 14, 430, W / 2, H / 2), (30, 100, 16, 440, W / 2, H / 2),
    (40, 110, 18, 470, W / 2, H / 2),
]

def frame_at(t):

    # ============ S1–S3: 0–40 s  cold open, living planet, title
    if t < 40:
        cam = {'lon': 40 + t * 1.6, 'lat': 14, 'R': lerp(360, 460, ease_io(t / 40)), 'cx': W / 2, 'cy': H / 2 + 10}
        g = render_globe(cam, light=1.0, sun=SUN)
        stars(g, t, alpha=smooth(ramp(t, 0.2, 3)))
        fade = smooth(ramp(t, 0.6, 4.5))
        g = BG + (g - BG) * fade
        pf = ease_io(ramp(t, 8, 24)); pq = ease_io(ramp(t, 9, 25)); pn = ease_io(ramp(t, 10, 26))
        amt = smooth(ramp(t, 7.5, 9)) * (1 - 0.55 * smooth(ramp(t, 30, 32)))
        if amt > 0: g = g + data_layers(cam, t, pf, pq, pn, amt, amt, amt, 0.5 * amt)
        fr = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8))
        def txt(o):
            cap(o, t, 2.8, 7.4, 'EARTH IS ALIVE.', 84, 76, 600, track=0.04)
            cap(o, t, 10, 15.2, 'Every day, the surface of our planet changes.', 80, 50, 500)
            cap(o, t, 16, 21.6, 'Floods.   Fires.   Earthquakes.   Farms.   Ice.', 80, 50, 500)
            cap(o, t, 22.6, 29.4, 'Most of it happens where no one is looking.', 80, 50, 500)
            counters(o, t, 11, 30)
            if t >= 30:
                k = window(t, 30.6, 40.5, 1.2, 0.9)
                d = ImageDraw.Draw(o)
                sc = 1 + 0.03 * ease_out(ramp(t, 30.6, 40))
                tracking_text(d, (W / 2 - 205, H / 2 + 20), 'EARTH', font(int(104 * sc), 650), WHITE + (int(255 * k),), 0.14, 'c')
                tracking_text(d, (W / 2 + 25, H / 2 + 20), '//', font(int(104 * sc), 650), CYAN + (int(255 * k),), 0.0, 'c')
                tracking_text(d, (W / 2 + 255, H / 2 + 20), 'PULSE', font(int(104 * sc), 650), WHITE + (int(255 * k),), 0.14, 'c')
                k2 = window(t, 32.2, 40.5, 1.0, 0.9)
                tracking_text(d, (W / 2, H / 2 + 86), 'WATCH EARTH CHANGE.', font(26, 500), INK2 + (int(255 * k2),), 0.42, 'c')
                k3 = window(t, 34, 40.5, 1.0, 0.9)
                tracking_text(d, (W / 2, H / 2 + 150), 'BUILT ON REAL NISAR RADAR DATA', font(16, 500), CYAN + (int(230 * k3),), 0.34, 'c')
        shadow_text(fr, txt)
        return fr.convert('RGB')

    # ============ S4: 40–72 s  meet NISAR (real orbit replay into the Bangladesh pass)
    if t < 72:
        u = ease_io(ramp(t, 40, 70))
        cam = {'lon': lerp(104, 92, u), 'lat': lerp(18, 22, u), 'R': lerp(470, 900, ease_io(ramp(t, 52, 71))), 'cx': W / 2 + lerp(0, 120, ease_io(ramp(t, 44, 50))), 'cy': H / 2 + lerp(0, 60, ease_io(ramp(t, 52, 71)))}
        g = render_globe(cam, light=lerp(1.0, 0.0, smooth(ramp(t, 62, 71))), sun=(95, 5), atmo=1.0)
        stars(g, t, 1 - smooth(ramp(t, 55, 66)))
        fin = smooth(ramp(t, 40, 41.2))
        g = BG + (g - BG) * fin
        nk = smooth(ramp(t, 64, 67.5)) * (1 - smooth(ramp(t, 70, 72)))
        if nk > 0: g = g + data_layers(cam, t, 0, 0, 1.0, 0, 0, nk, 0)
        fr = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8))
        sl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        # sim time: 23:05 → 23:22 UTC over this scene (real positions)
        simk = lerp(0, 66, ease_io(ramp(t, 41, 71)))
        out_ = 1 - smooth(ramp(t, 70.3, 71.9))   # hand over cleanly to the Bangladesh descent
        sat_layer(sl, cam, simk, amt=fin * (1 - 0.6 * smooth(ramp(t, 60, 66))) * out_, highlight_nisar=smooth(ramp(t, 42, 44)) * out_,
                  trail=smooth(ramp(t, 46, 49)) * out_, swath=smooth(ramp(t, 50, 53)) * out_)
        fr.paste(sl, (0, 0), sl)
        def txt(o):
            cap(o, t, 42.3, 48.6, 'NISAR', 190, 96, 650, track=0.12, x=180, anchor='l')
            cap(o, t, 43.0, 48.6, 'NASA  ×  ISRO', 250, 26, 500, color=CYAN, track=0.3, x=184, anchor='l')
            cap(o, t, 49.2, 55.2, 'An L-band radar in orbit.', 190, 52, 600, x=180, anchor='l')
            cap(o, t, 49.8, 55.2, 'It brings its own light.', 262, 52, 400, color=INK2, x=180, anchor='l')
            cap(o, t, 56.0, 63.0, 'Day or night.', 190, 52, 600, x=180, anchor='l')
            cap(o, t, 56.6, 63.0, 'Through cloud.', 262, 52, 600, x=180, anchor='l')
            cap(o, t, 57.2, 63.0, 'Every 12 days.', 334, 52, 600, color=CYAN, x=180, anchor='l')
            c = meta()['counts']
            cap(o, t, 64.2, 71.0, f"{c['nisar']:,} radar images", 190, 60, 650, x=180, anchor='l')
            cap(o, t, 64.8, 71.0, f"in the last {c['nisarDays']} days alone.", 262, 44, 400, color=INK2, x=180, anchor='l')
            k = window(t, 50.5, 70.5, 0.8, 0.6)
            if k > 0:
                d = ImageDraw.Draw(o)
                tracking_text(d, (180, H - 150), 'THE BAND IS NISAR’S IMAGING SWATH · MODELED FROM REAL FOOTPRINTS', font(14, 500), INK3 + (int(230 * k),), 0.2)
            hh = int(23 * 60 + 5 + simk * 0.25)
            replay_pill(o, f'REPLAY · REAL ORBIT · 22 SEP 2026  {hh // 60:02d}:{hh % 60:02d} UTC', window(t, 44, 70.8, 0.8, 0.6))
        shadow_text(fr, txt)
        return fr.convert('RGB')

    # ============ S5: 72–112 s  Bangladesh — THE WATER CHANGED
    if t < 112:
        m = story('bangladesh-water'); frames = m['frames']
        u = ease_io(ramp(t, 72, 82))
        cam = {'lon': lerp(92, 90.45, u), 'lat': lerp(22, 24.75, u), 'R': math.exp(lerp(math.log(900), math.log(21000), u)), 'cx': lerp(W / 2 + 120, W / 2 + 190, u), 'cy': lerp(H / 2 + 60, H / 2, u)}
        base = {'img': np.dstack([tex('bd_day.jpg'), np.ones(tex('bd_day.jpg').shape[:2], np.float32)]), 'rect': (85, 19, 97, 29), 'alpha': smooth(ramp(t, 73, 78))}
        nd = os.path.join(ROOT, 'public', 'data', 'stories', 'bangladesh-water')
        ovs = [base]
        ser_t0, ser_t1 = 86.0, 99.0
        if t < ser_t0:
            ovs.append({'img': rgba(os.path.join(nd, frames[0]['file'])), 'rect': tuple(frames[0]['rectangle'][k] for k in ('west', 'south', 'east', 'north')), 'alpha': smooth(ramp(t, 78, 81))})
            idx, label = 0, frames[0]['acquisitionStart']
        elif t < ser_t1 + 0.01:
            p = ramp(t, ser_t0, ser_t1) * (len(frames) - 1)
            i = int(p); f = smooth((p - i - 0.55) / 0.45) if i < len(frames) - 1 else 0
            for j, a in ((i, 1.0), (min(i + 1, len(frames) - 1), f)):
                ovs.append({'img': rgba(os.path.join(nd, frames[j]['file'])), 'rect': tuple(frames[j]['rectangle'][k] for k in ('west', 'south', 'east', 'north')), 'alpha': a})
            idx, label = i, frames[min(i + (1 if f > 0.5 else 0), len(frames) - 1)]['acquisitionStart']
        else:
            b, a = frames[0], frames[m['derived']['peakIndex']]
            div = W / 2 + 190 + math.sin((t - 100) * 0.9) * 420 * (1 - smooth(ramp(t, 104.5, 105.5))) if t < 106 else W + 10
            ovs.append({'img': rgba(os.path.join(nd, b['file'])), 'rect': tuple(b['rectangle'][k] for k in ('west', 'south', 'east', 'north')), 'alpha': 1.0, 'xmask': (0, div)})
            ovs.append({'img': rgba(os.path.join(nd, a['file'])), 'rect': tuple(a['rectangle'][k] for k in ('west', 'south', 'east', 'north')), 'alpha': 1.0, 'xmask': (div, W + 1)})
            ck = smooth(ramp(t, 106, 107.5))
            if ck > 0:
                gr = m['derived']['grid']
                ovs.append({'img': rgba(os.path.join(nd, m['derived']['change']['file'])), 'rect': (gr['west'], gr['south'], gr['east'], gr['north']), 'alpha': ck})
            idx, label = None, None
        g = render_globe(cam, overlays=ovs, light=0.0, atmo=1 - u)
        fr = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8))
        if 100 <= t < 106:
            d = ImageDraw.Draw(fr, 'RGBA')
            d.line((div, 0, div, H), fill=(255, 255, 255, 230), width=3)
            d.ellipse((div - 22, H / 2 - 22, div + 22, H / 2 + 22), fill=(8, 12, 20, 220), outline=(255, 255, 255, 230), width=2)
        def txt(o):
            k = window(t, 78.5, 111.5, 0.9, 0.6)
            cap(o, t, 78.5, 111.5, 'BANGLADESH', 190, 20, 500, color=INK2, track=0.4, x=110, anchor='l')
            cap(o, t, 79.2, 111.5, 'THE WATER', 285, 92, 650, x=106, anchor='l')
            cap(o, t, 79.4, 111.5, 'CHANGED.', 382, 92, 650, x=106, anchor='l')
            cap(o, t, 81.0, 99.5, 'Through the 2026 monsoon, NISAR imaged', 470, 26, 400, color=INK2, x=110, anchor='l')
            cap(o, t, 81.0, 99.5, 'this landscape every 12 days, through cloud.', 506, 26, 400, color=INK2, x=110, anchor='l')
            cap(o, t, 81.0, 99.5, 'Calm water returns little radar, so it shows dark.', 542, 26, 400, color=INK2, x=110, anchor='l')
            if label and t >= 82:
                kk = window(t, 82, 99.8, 0.6, 0.4)
                d = ImageDraw.Draw(o)
                tracking_text(d, (110, H - 150), 'NISAR OBSERVATION', font(15, 500), CYAN + (int(255 * kk),), 0.3)
                ds = label[:10]
                import datetime as _dt
                pretty = _dt.date.fromisoformat(ds).strftime('%-d %B %Y').upper()
                tracking_text(d, (110, H - 106), pretty, font(40, 500), WHITE + (int(255 * kk),), 0.04)
                # timeline ticks
                if t >= ser_t0 - 0.5:
                    x0, x1, yy = 110, 700, H - 70
                    d.line((x0, yy, x1, yy), fill=(255, 255, 255, int(70 * kk)), width=2)
                    n = len(frames)
                    for j in range(n):
                        xx = x0 + (x1 - x0) * j / (n - 1)
                        on = idx is not None and j <= idx
                        r = 6 if idx == j else 4
                        d.ellipse((xx - r, yy - r, xx + r, yy + r), fill=(CYAN if on else INK3) + (int(255 * kk),))
            if t >= 99.8:
                kk = window(t, 100, 111.5, 0.6, 0.6)
                d = ImageDraw.Draw(o)
                b, a = frames[0]['acquisitionStart'][:10], frames[m['derived']['peakIndex']]['acquisitionStart'][:10]
                if t < 106.2:
                    tracking_text(d, (W / 2 + 190 - 40, 150), 'BEFORE · 18 JUNE', font(22, 500), WHITE + (int(255 * kk),), 0.2, 'r')
                    tracking_text(d, (W / 2 + 190 + 40, 150), 'AFTER · 24 JULY', font(22, 500), WHITE + (int(255 * kk),), 0.2, 'l')
                ck = window(t, 106.4, 111.5, 0.7, 0.5)
                if ck > 0:
                    ch = m['derived']['change']
                    tracking_text(d, (110, 530), f"≈{ch['becameWaterKm2']:,} km²", font(64, 600), WATER + (int(255 * ck),), 0.0)
                    tracking_text(d, (110, 572), 'became dark-water-like  ·  18 JUN → 24 JUL', font(22, 400), INK2 + (int(255 * ck),), 0.0)
                    tag(d, 110, 600, 'DERIVED ESTIMATE', (200, 166, 255), ck)
            kk = window(t, 80, 111.5, 0.8, 0.6)
            if kk > 0:
                d = ImageDraw.Draw(o); tag(d, W - 360, H - 90, 'REAL NISAR DATA · L2 GCOV', CYAN, kk)
        shadow_text(fr, txt)
        return fr.convert('RGB')

    # ============ S6: 112–146 s  Kumamoto — THE GROUND MOVED
    if t < 146:
        m = story('kumamoto-ground'); frames = m['frames']
        nd = os.path.join(ROOT, 'public', 'data', 'stories', 'kumamoto-ground')
        if t < 119:
            u = ease_io(ramp(t, 112, 118.5))
            if t < 114.8: R = math.exp(lerp(math.log(21000), math.log(700), ease_io(ramp(t, 112, 114.8))))
            else: R = math.exp(lerp(math.log(700), math.log(5200), ease_io(ramp(t, 114.8, 118.6))))
            cam = {'lon': lerp(90.45, 130.7, u), 'lat': lerp(24.75, 32.6, u), 'R': R, 'cx': lerp(W / 2 + 190, W / 2, u), 'cy': H / 2}
            bdb = {'img': np.dstack([tex('bd_day.jpg'), np.ones(tex('bd_day.jpg').shape[:2], np.float32)]), 'rect': (85, 19, 97, 29), 'alpha': 1 - smooth(ramp(t, 112, 113.5))}
            base = {'img': np.dstack([tex('jp_day.jpg'), np.ones(tex('jp_day.jpg').shape[:2], np.float32)]), 'rect': (127.5, 29.5, 134.5, 35.5), 'alpha': smooth(ramp(t, 116.2, 117.6))}
            g = render_globe(cam, overlays=[bdb, base], light=0.0, atmo=1 - smooth(ramp(t, 116.5, 118.5)) * (1 - 0) if t > 114 else smooth(ramp(t, 112.5, 114.5)))
            g = g * (1 - smooth(ramp(t, 118.3, 119)) * 0.9)
            fr = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8))
        else:
            fr = Image.new('RGB', (W, H), (6, 9, 14))
            # the five real interferograms, left→right in time
            slots = 5; sw = 300; gap = 28; x0 = (W - slots * sw - (slots - 1) * gap) / 2; y0 = 330
            zoom = smooth(ramp(t, 131, 134))
            for j, f in enumerate(frames):
                k = smooth(ramp(t, 119.3 + j * 0.9, 120.3 + j * 0.9)) * (1 - zoom)
                if k <= 0: continue
                img = rgba(os.path.join(nd, f['file']), 900)
                spans = f['referenceDate'] < '2026-07-28T07:27' < f['secondaryDate']
                x = x0 + j * (sw + gap)
                hl = smooth(ramp(t, 125.5, 126.5)) if spans else 0
                dim = 1 - 0.55 * smooth(ramp(t, 125.5, 126.5)) * (0 if spans else 1)
                paste_img(fr, img * np.array([dim, dim, dim, 1]), (x, y0, x + sw, y0 + sw), k)
                d = ImageDraw.Draw(fr, 'RGBA')
                if hl > 0: d.rounded_rectangle((x - 8, y0 - 8, x + sw + 8, y0 + sw + 8), 14, outline=MAGENTA + (int(255 * hl * k),), width=3)
                tracking_text(d, (x + sw / 2, y0 + sw + 40), f"{f['referenceDate'][5:10].replace('-', '/')} → {f['secondaryDate'][5:10].replace('-', '/')}", font(20, 500, mono=True), WHITE + (int(230 * k),), 0, 'c')
                lab = 'SPANS THE EARTHQUAKE' if spans else ('BEFORE' if f['secondaryDate'] < '2026-07-28' else 'AFTER')
                tracking_text(d, (x + sw / 2, y0 + sw + 72), lab, font(15, 600), (MAGENTA if spans else INK3) + (int(255 * k),), 0.24, 'c')
            if zoom > 0:
                f = frames[2]; img = rgba(os.path.join(nd, f['file']))
                r = f['rectangle']; ih, iw = img.shape[:2]
                ex = (130.6269 - r['west']) / (r['east'] - r['west']) * iw; ey = (r['north'] - 32.6043) / (r['north'] - r['south']) * ih
                half = lerp(iw * 0.5, 170, ease_io(ramp(t, 131, 135)))
                cx_, cy_ = lerp(iw / 2, ex, ease_io(ramp(t, 131, 135))), lerp(ih / 2, ey, ease_io(ramp(t, 131, 135)))
                crop = img[int(max(0, cy_ - half)):int(min(ih, cy_ + half)), int(max(0, cx_ - half)):int(min(iw, cx_ + half))]
                size = 860
                bx = W / 2 + 230 - size / 2
                paste_img(fr, crop, (bx, (H - size) / 2, bx + size, (H + size) / 2), zoom)
                d = ImageDraw.Draw(fr, 'RGBA')
                ek = smooth(ramp(t, 135, 136))
                if ek > 0:
                    px = bx + (ex - (cx_ - half)) / (2 * half) * size; py = (H - size) / 2 + (ey - (cy_ - half)) / (2 * half) * size
                    rr = 10 + 6 * math.sin(t * 4)
                    d.ellipse((px - rr, py - rr, px + rr, py + rr), outline=(155, 255, 140, int(255 * ek)), width=3)
                    lbl = 'USGS EPICENTER · M6.8'; f18 = font(18, 600)
                    lw = sum(d.textlength(c_, font=f18) for c_ in lbl) + 18 * 0.14 * (len(lbl) - 1)
                    d.rounded_rectangle((px + 40, py - 40, px + 64 + lw, py - 6), 17, fill=(6, 9, 14, int(210 * ek)))
                    tracking_text(d, (px + 52, py - 17), lbl, f18, WHITE + (int(255 * ek),), 0.14)
        def txt(o):
            cap(o, t, 115.5, 130.8, 'KUMAMOTO, JAPAN  ·  28 JULY 2026  ·  M6.8 (USGS)', 150, 22, 500, color=INK2, track=0.24)
            cap(o, t, 120.5, 130.8, 'Five NISAR interferograms of the same place.', 222, 44, 600)
            cap(o, t, 126.4, 130.8, 'Only one spans the earthquake.', 280, 44, 600, color=MAGENTA)
            cap(o, t, 134.5, 145.6, 'THE GROUND', 300, 92, 650, x=110, anchor='l')
            cap(o, t, 134.7, 145.6, 'MOVED.', 396, 92, 650, x=110, anchor='l')
            cap(o, t, 136.5, 145.6, 'Each colour cycle is a contour of ground', 480, 26, 400, color=INK2, x=112, anchor='l')
            cap(o, t, 136.5, 145.6, 'motion toward or away from the satellite.', 516, 26, 400, color=INK2, x=112, anchor='l')
            cap(o, t, 139.0, 145.6, 'The sharp break is consistent with', 580, 26, 400, color=INK2, x=112, anchor='l')
            cap(o, t, 139.0, 145.6, 'the fault reaching the surface.', 616, 26, 400, color=INK2, x=112, anchor='l')
            k = window(t, 120, 145.6, 0.8, 0.6)
            if k > 0:
                d = ImageDraw.Draw(o); tag(d, W - 380, H - 90, 'REAL NISAR DATA · L2 GUNW', CYAN, k)
        shadow_text(fr, txt)
        return fr.convert('RGB')

    # ============ S7: 146–178 s  CHANGE ANYWHERE + global change radar
    if t < 178:
        F = film(); ch = F['change']
        if t < 168:
            u = ease_io(ramp(t, 146, 149))
            zoom = ease_io(ramp(t, 156.5, 160.5))
            cam = {'lon': lerp(ch['lon'] - 35, ch['lon'], u), 'lat': lerp(ch['lat'] - 8, ch['lat'], u), 'R': math.exp(lerp(math.log(480), math.log(ch['zoomR']), zoom)), 'cx': W / 2 - 170, 'cy': H / 2}
            ovs = [{'img': np.dstack([tex('bd_day.jpg'), np.ones(tex('bd_day.jpg').shape[:2], np.float32)]), 'rect': (85, 19, 97, 29), 'alpha': smooth(ramp(t, 157, 159))}]
            k_after = smooth(ramp(t, 160, 161.5)); k_change = smooth(ramp(t, 161.5, 163))
            if k_after > 0:
                ovs.append({'img': rgba(ch['after']), 'rect': tuple(ch['afterRect']), 'alpha': k_after * lerp(1, 0.55, k_change)})
            if k_change > 0:
                ovs.append({'img': rgba(ch['map']), 'rect': tuple(ch['mapRect']), 'alpha': k_change})
            g = render_globe(cam, overlays=ovs, light=0.0, atmo=1 - zoom)
            stars(g, t, 1 - zoom)
            fr = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8))
            d = ImageDraw.Draw(fr, 'RGBA')
            # cursor + click → WHAT CHANGED HERE?
            tu, tv, _ = project(cam, np.array([ch['lon']]), np.array([ch['lat']]))
            tx, ty = float(tu[0]), float(tv[0])
            ck = smooth(ramp(t, 149.5, 150.5)) * (1 - smooth(ramp(t, 156.8, 157.3)))
            if ck > 0:
                mx = lerp(tx + 380, tx, ease_io(ramp(t, 149.5, 152))); my = lerp(ty + 240, ty, ease_io(ramp(t, 149.5, 152)))
                if t > 152:
                    pr = ramp(t, 152, 152.6)
                    rr = 8 + 40 * pr
                    d.ellipse((tx - rr, ty - rr, tx + rr, ty + rr), outline=CYAN + (int(255 * (1 - pr) * ck),), width=3)
                if t > 152.5:
                    fk = smooth(ramp(t, 152.5, 153.1)) * ck
                    bw = 330
                    d.rounded_rectangle((tx - bw / 2, ty - 96, tx + bw / 2, ty - 42), 27, fill=(242, 245, 248, int(255 * fk)))
                    tracking_text(d, (tx, ty - 61), 'WHAT CHANGED HERE?', font(20, 600), (5, 8, 13, int(255 * fk)), 0.16, 'c')
                    d.ellipse((tx - 6, ty - 6, tx + 6, ty + 6), fill=CYAN + (int(255 * fk),))
                cur = [(mx, my), (mx, my + 30), (mx + 8, my + 23), (mx + 14, my + 36), (mx + 19, my + 34), (mx + 13, my + 21), (mx + 23, my + 21)]
                d.polygon(cur, fill=(255, 255, 255, int(255 * ck)), outline=(0, 0, 0, int(200 * ck)))
            # result card (real numbers from the Change Engine run)
            pk = smooth(ramp(t, 161.2, 162.2)) * (1 - smooth(ramp(t, 167.2, 168)))
            if pk > 0:
                x0 = W - 520 + (1 - pk) * 60
                glass(fr, (x0, 170, x0 + 440, 800), 20, pk)
                d = ImageDraw.Draw(fr, 'RGBA')
                tracking_text(d, (x0 + 28, 212), 'CHANGE ENGINE · NISAR DATA · DERIVED', font(13, 500), INK3 + (int(255 * pk),), 0.2)
                tracking_text(d, (x0 + 28, 262), 'WHAT CHANGED HERE?', font(34, 650), WHITE + (int(255 * pk),), 0.02)
                tracking_text(d, (x0 + 28, 292), ch['coord'], font(15, 400, mono=True), INK3 + (int(255 * pk),), 0)
                tracking_text(d, (x0 + 28, 350), f"{ch['place']}", font(20, 500), INK2 + (int(255 * pk),), 0)
                tracking_text(d, (x0 + 28, 384), f"Track {ch['track']} · {ch['from']} → {ch['to']}", font(17, 400, mono=True), INK2 + (int(255 * pk),), 0)
                for j, (val, lab, col) in enumerate([(f"{ch['darkerKm2']:,} km²", 'BECAME DARKER', WATER), (f"{ch['brighterKm2']:,} km²", 'BECAME BRIGHTER', ORANGE), (f"{ch['days']} days", 'BETWEEN PASSES', WHITE)]):
                    yy = 440 + j * 92
                    d.rounded_rectangle((x0 + 28, yy, x0 + 412, yy + 76), 12, fill=(255, 255, 255, int(12 * pk)), outline=(255, 255, 255, int(30 * pk)))
                    tracking_text(d, (x0 + 48, yy + 38), val, font(28, 500, mono=True), col + (int(255 * pk),), 0)
                    tracking_text(d, (x0 + 48, yy + 62), lab, font(12, 500), INK3 + (int(255 * pk),), 0.2)
                tracking_text(d, (x0 + 28, 745), 'Computed in the browser from two real passes.', font(15, 400), INK3 + (int(255 * pk),), 0)
        else:
            u = ease_io(ramp(t, 168, 171))
            cam = {'lon': lerp(F['change']['lon'], 20, u) + (t - 168) * 3, 'lat': lerp(F['change']['lat'], 18, u), 'R': math.exp(lerp(math.log(F['change']['zoomR']), math.log(440), u)), 'cx': W / 2, 'cy': H / 2 + 20}
            fo_ = 1 - smooth(ramp(t, 168, 170))
            ovs = [{'img': np.dstack([tex('bd_day.jpg'), np.ones(tex('bd_day.jpg').shape[:2], np.float32)]), 'rect': (85, 19, 97, 29), 'alpha': fo_},
                   {'img': rgba(ch['after']), 'rect': tuple(ch['afterRect']), 'alpha': 0.55 * fo_},
                   {'img': rgba(ch['map']), 'rect': tuple(ch['mapRect']), 'alpha': fo_}]
            g = render_globe(cam, overlays=ovs, light=0.0, atmo=u)
            stars(g, t, u)
            g = g + radar_splat(cam, ease_out(ramp(t, 170.5, 175)))
            hs = []
            pk = 0
            if hs:
                n = int(len(hs) * pk)
                arr = np.array([[h['lon'], h['lat'], h['hotDensity'], 1 if h['darker'] > h['brighter'] else 0] for h in hs[:n]]) if n else np.zeros((0, 4))
                pts = []
                for dk, col in ((1, WATER), (0, ORANGE)):
                    sel = arr[arr[:, 3] == dk] if len(arr) else arr
                    if len(sel):
                        uu, vv, vis = project(cam, sel[:, 0], sel[:, 1])
                        pts.append((uu, vv, (3.0 + sel[:, 2] * 8) * vis, col, 2, 7))
                if pts: g = g + splat_layer(pts)
            fr = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8))
        def txt(o):
            cap(o, t, 147.2, 156.4, 'Now: click anywhere on Earth.', 84, 50, 600, x=W / 2 - 170)
            cap(o, t, 153.6, 160.2, 'EARTH//PULSE finds two NISAR passes of that exact place', 900, 30, 500, x=W / 2 - 170)
            cap(o, t, 154.2, 160.2, 'from the same orbit track…', 942, 30, 500, color=INK2, x=W / 2 - 170)
            cap(o, t, 161.0, 167.6, '…and computes what changed.', 84, 50, 600, x=W / 2 - 170)
            cap(o, t, 161.6, 167.6, 'Cyan: became darker.   Orange: became brighter.', 130, 26, 400, color=INK2, x=W / 2 - 170)
            R_ = radar()
            if R_['hotspots']:
                cap(o, t, 171.0, 177.6, f"{R_['pairsCompared']:,} NISAR repeat pairs scanned worldwide.", 84, 46, 600)
                cap(o, t, 172.0, 177.6, 'Where the radar saw the biggest changes: rain, floods, harvests. Each one worth a look.', 132, 30, 400, color=INK2)
                k = window(t, 172, 177.6, 0.6, 0.5)
                if k > 0:
                    d = ImageDraw.Draw(o); tag(d, W / 2 - 150, H - 100, 'GLOBAL CHANGE RADAR · DERIVED', (200, 166, 255), k)
        shadow_text(fr, txt)
        return fr.convert('RGB')

    # ============ S8: 178–200 s  integrity — every pixel has a source
    if t < 200:
        cam = {'lon': 20 + (t - 168) * 3, 'lat': 18, 'R': 440, 'cx': W / 2, 'cy': H / 2 + 20}
        g = render_globe(cam, light=0.0, atmo=1.0)
        if t < 179.6: g = g + radar_splat(cam, 1.0, 1 - smooth(ramp(t, 178, 179.4)))
        g = BG + (g - BG) * lerp(1.0, 0.28, smooth(ramp(t, 178, 179.6)))
        stars(g, t, 0.8)
        fr = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8))
        d = ImageDraw.Draw(fr, 'RGBA')
        # granule IDs scrolling (real)
        ids = asset('ids', lambda: [f['id'] for s in ('bangladesh-water', 'kumamoto-ground', 'punjab-crops', 'rondonia-forest', 'greenland-ice') for f in story(s)['frames']])
        gk = window(t, 178.5, 199.6, 1.0, 0.8)
        for j, gid in enumerate(ids):
            yy = (j * 34 - (t - 178) * 38) % (len(ids) * 34) - 40
            if 0 < yy < H:
                tracking_text(d, (70, yy + 15), gid, font(15, 400, mono=True), (127, 230, 255, int(40 * gk)), 0)
        def txt(o):
            cap(o, t, 179.0, 185.6, 'Every pixel has a source.', 300, 64, 650)
            cap(o, t, 186.0, 192.6, 'Every claim says how confident it is.', 300, 64, 650)
            cap(o, t, 193.0, 199.6, 'Nothing simulated is ever shown as real.', 300, 64, 650)
            k = window(t, 180.5, 199.6, 0.8, 0.7)
            if k > 0:
                dd = ImageDraw.Draw(o)
                labels = [('REAL NISAR DATA', CYAN), ('REAL SATELLITE DATA', CYAN), ('CONTEXT · USGS / EONET', (185, 196, 208)), ('DERIVED', (200, 166, 255)), ('SIMULATED · LABELLED', AMBER)]
                widths = [len(s) * 12.2 + 50 for s, _ in labels]; total = sum(widths) + 18 * (len(labels) - 1)
                x = W / 2 - total / 2
                for j, (s, col) in enumerate(labels):
                    kk = k * smooth(ramp(t, 181 + j * 0.35, 181.6 + j * 0.35))
                    x += tag(dd, x, 470, s, col, kk, 16) + 18
                cap(o, t, 187.0, 199.6, 'CONFIDENCE', 600, 16, 500, color=INK3, track=0.34)
                for j, lv in enumerate(['LOW', 'MEDIUM', 'HIGH']):
                    kk = window(t, 187.4 + j * 0.3, 199.6, 0.5, 0.7)
                    xx = W / 2 - 240 + j * 240
                    for b in range(3):
                        dd.rounded_rectangle((xx - 40 + b * 28, 632, xx - 40 + b * 28 + 22, 638), 3, fill=(CYAN if b <= j else (60, 66, 74)) + (int(255 * kk),))
                    tracking_text(dd, (xx + 12, 672), lv, font(15, 600), WHITE + (int(255 * kk),), 0.24, 'c')
        shadow_text(fr, txt)
        return fr.convert('RGB')

    # ============ S9: 200–222 s  listen to the change (sonification of the real change map)
    if t < 222:
        F = film(); ch = F['change']
        fr = Image.new('RGB', (W, H), (4, 6, 10))
        mp = rgba(ch['map']); af = rgba(ch['after'])
        size_h = 760; size_w = int(size_h * mp.shape[1] / mp.shape[0]); size_w = min(size_w, 1100)
        bx = (W - size_w) / 2; by = 150
        k = smooth(ramp(t, 200.2, 201.2)) * (1 - smooth(ramp(t, 221, 222)))
        # draw after-image (dim) + change map on the same grid extent
        ar = ch['afterRect']; mr = ch['mapRect']
        # crop after image to map rect
        ih, iw = af.shape[:2]
        cx0 = int((mr[0] - ar[0]) / (ar[2] - ar[0]) * iw); cx1 = int((mr[2] - ar[0]) / (ar[2] - ar[0]) * iw)
        cy0 = int((ar[3] - mr[3]) / (ar[3] - ar[1]) * ih); cy1 = int((ar[3] - mr[1]) / (ar[3] - ar[1]) * ih)
        crop = af[max(0, cy0):cy1, max(0, cx0):cx1] * np.array([0.45, 0.45, 0.45, 1])
        paste_img(fr, crop, (bx, by, bx + size_w, by + size_h), k)
        paste_img(fr, mp, (bx, by, bx + size_w, by + size_h), k)
        # scanline + voice meters from the sonification series (same algorithm as src/sonify.js)
        ser = F['sonify']['series']
        for pass_i, (a, b) in enumerate(((203.0, 211.0), (212.5, 220.5))):
            if a <= t <= b:
                kk = (t - a) / (b - a)
                xs = bx + kk * size_w
                d = ImageDraw.Draw(fr, 'RGBA')
                for w_, al in ((14, 40), (6, 90), (2, 255)):
                    d.rectangle((xs - w_ / 2, by, xs + w_ / 2, by + size_h), fill=(255, 255, 255, int(al * k)))
                ci = min(len(ser) - 1, int(kk * len(ser)))
                dn, up = ser[ci]['dn'], ser[ci]['up']
                bars = 48
                for j in range(bars):
                    x = W / 2 - bars * 11 + j * 22
                    ph = math.sin(t * 9 + j * 0.7) * 0.5 + 0.5
                    hdn = 6 + min(1, dn * 6) * 120 * (0.6 + 0.4 * ph) * (1 - abs(j - bars / 2) / bars)
                    hup = 6 + min(1, up * 6) * 120 * (0.6 + 0.4 * (1 - ph)) * (1 - abs(j - bars / 2) / bars)
                    d.rectangle((x, by + size_h + 110 - hdn, x + 8, by + size_h + 110), fill=WATER + (int(220 * k),))
                    d.rectangle((x + 10, by + size_h + 110 - hup, x + 18, by + size_h + 110), fill=ORANGE + (int(220 * k),))
        def txt(o):
            cap(o, t, 200.6, 210.8, 'DANCING WITH THE SARs.', 100, 56, 650, track=0.06)
            cap(o, t, 212.0, 221.4, '…literally. Hear where the land changed.', 100, 44, 500)
            cap(o, t, 203.0, 221.4, 'Low voice = darker   ·   high voice = brighter   ·   silence = no change', H - 40, 20, 400, color=INK2)
        shadow_text(fr, txt)
        return fr.convert('RGB')

    # ============ S10: 222–240 s  outro
    cam = {'lon': 70 + (t - 222) * 2.2, 'lat': 14, 'R': lerp(520, 390, ease_io(ramp(t, 222, 240))), 'cx': W / 2, 'cy': H / 2 + 40}
    g = render_globe(cam, light=1.0, sun=SUN)
    stars(g, t, 1.0)
    fin = smooth(ramp(t, 222, 223.5)); fo = 1 - smooth(ramp(t, 237.5, 240))
    g = g + data_layers(cam, t, 1, 1, 1, 0.8, 0.8, 0.8, 0.4)
    g = BG + (g - BG) * fin * fo
    fr = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8))
    def txt(o):
        k = window(t, 224, 239.5, 1.2, 1.4)
        if k > 0:
            d = ImageDraw.Draw(o)
            tracking_text(d, (W / 2 - 180, 196), 'EARTH', font(96, 650), WHITE + (int(255 * k),), 0.14, 'c')
            tracking_text(d, (W / 2 + 32, 196), '//', font(96, 650), CYAN + (int(255 * k),), 0.0, 'c')
            tracking_text(d, (W / 2 + 244, 196), 'PULSE', font(96, 650), WHITE + (int(255 * k),), 0.14, 'c')
        cap(o, t, 225.6, 239.5, 'WATCH EARTH CHANGE.', 262, 26, 500, color=INK2, track=0.42, fo=1.4)
        cap(o, t, 228.4, 239.5, 'Real NISAR data  ·  NASA × ISRO  ·  ASF DAAC', H - 150, 22, 500, color=INK2, track=0.06, fo=1.4)
        cap(o, t, 229.4, 239.5, 'NASA SPACE APPS CHALLENGE 2026  ·  DANCING WITH THE SARs', H - 108, 18, 500, color=CYAN, track=0.26, fo=1.4)
    shadow_text(fr, txt)
    return fr.convert('RGB')

# ---------------------------------------------------------------- CLI
def _render(t):
    return np.asarray(frame_at(t), np.uint8).tobytes()

if __name__ == '__main__':
    if sys.argv[1] == 'still':
        t = float(sys.argv[2]); out = sys.argv[3] if len(sys.argv) > 3 else f'still_{t:06.1f}.png'
        frame_at(t).save(out); print(out)
    elif sys.argv[1] == 'video':
        out = sys.argv[2]
        t0 = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
        t1 = float(sys.argv[4]) if len(sys.argv) > 4 else DUR
        times = [t0 + i / FPS for i in range(int(round((t1 - t0) * FPS)))]
        ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                               '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
        import multiprocessing as mp
        with mp.get_context('fork').Pool(int(os.environ.get('WORKERS', '10'))) as pool:
            for i, buf in enumerate(pool.imap(_render, times, chunksize=4)):
                ff.stdin.write(buf)
                if i % 150 == 0: print(f'[render] {i}/{len(times)} t={times[i]:.1f}', flush=True)
        ff.stdin.close(); ff.wait(); print('[render] done', out)
