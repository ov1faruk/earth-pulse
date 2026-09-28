#!/usr/bin/env python3
"""The L-Band × EARTH//PULSE — 240 s pitch cut ("240 Seconds of Glory").

Structure (Space Apps pitch model):  HOOK → 01 WHO → 02 WHY → 03 WHAT (demo) → 04 HOW.
Reuses the launch film (render.py) for the demo parts and adds new scenes for
the team, the problem, and impact/next steps.

  python3 pitch.py still <t> [out.png]
  python3 pitch.py video out.mp4
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import render as R
from render import (W, H, FPS, clamp, smooth, ramp, window, ease_out, ease_io, lerp, font, tracking_text, cap,
                    shadow_text, glass, tag, render_globe, data_layers, stars, meta, BG, CYAN, WHITE, INK2, INK3, AMBER,
                    MAGENTA, FIRE, WATER, ORANGE)

HERE = os.path.dirname(os.path.abspath(__file__))
TEAM = json.load(open(os.path.join(HERE, 'team', 'team.json')))
DUR = 240.0

TL = json.load(open(os.path.join(HERE, 'timeline.json')))
SEGMENTS = [(g['start'], g['end'], g['kind'], g) for g in TL['segments']]
CARDS = TL['team_cards']
EDGE = 0.35  # dip-to-black at every cut (seconds on each side)

def section_label(o, text, k, x=110, y=112):
    if k <= 0: return
    d = ImageDraw.Draw(o)
    tracking_text(d, (x, y), text, font(16, 600), CYAN + (int(255 * k),), 0.32)

def backdrop(t, lon0=95.0, cx=W * 0.72, R_=520, dim=0.42, data=0.7, light=1.0):
    cam = {'lon': lon0 + t * 1.4, 'lat': 12, 'R': R_, 'cx': cx, 'cy': H / 2 + 20}
    g = render_globe(cam, light=light, sun=R.SUN)
    stars(g, t, 0.9)
    if data > 0: g = g + data_layers(cam, t, 1, 1, 1, data, data, data, 0.35 * data)
    g = BG + (g - BG) * dim
    return Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8))

def circle_photo(path, size, ring, k, dim=1.0):
    im = R.asset('ph:' + path + str(size), lambda: Image.open(path).convert('RGB').resize((size, size), Image.LANCZOS))
    if dim < 1: im = Image.blend(Image.new('RGB', im.size, (8, 11, 18)), im, dim)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=int(255 * k))
    return im, mask

# ---------------------------------------------------------------- 01 WHO — The L-Band
def team_frame(t):
    fr = backdrop(t, lon0=80, dim=0.34, data=0.55)
    ui = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ui)
    # title: big centre (0–4.5 s), then settles top-left
    s = ease_io(ramp(t, 6.6, 8.2))
    k = window(t, 0.4, 40.4, 0.9, 0.7)
    size = int(lerp(128, 56, s))
    tx, ty = lerp(W / 2, 110, s), lerp(H / 2 - 10, 190, s)
    anchor = 'c' if s < 0.5 else 'l'
    if s >= 0.5: tx = 110
    tracking_text(d, (tx, ty), 'THE L-BAND', font(size, 700), WHITE + (int(255 * k),), 0.08, anchor)
    kk = window(t, 1.3, 40.4, 0.9, 0.7)
    sub = 'Named after the radar band NISAR uses to see through clouds.'
    tracking_text(d, (lerp(W / 2, 112, s) if s >= 0.5 or True else W / 2, lerp(H / 2 + 64, 238, s)), sub, font(int(lerp(28, 22, s)), 400),
                  INK2 + (int(255 * kk),), 0, 'c' if s < 0.5 else 'l')
    k3 = window(t, 2.2, 40.4, 0.9, 0.7)
    tracking_text(d, (lerp(W / 2, 112, s), lerp(H / 2 + 118, 276, s)), 'NASA SPACE APPS CHALLENGE 2026  ·  BANGLADESH', font(16, 600),
                  CYAN + (int(255 * k3),), 0.3, 'c' if s < 0.5 else 'l')
    section_label(ui, '01 · WHO WE ARE', window(t, 7.8, 40.4, 0.7, 0.7), 110, 128)
    fr_rgba = fr.convert('RGBA')
    # five member cards, introduced one by one (≈3.4 s each), then all together
    n = len(TEAM); cw, gap = 316, 26
    x0 = (W - n * cw - (n - 1) * gap) / 2
    starts = CARDS
    for i, p in enumerate(TEAM):
        a = smooth(ramp(t, starts[i] - 0.3, starts[i] + 0.5)) * (1 - smooth(ramp(t, 40.2, 40.9)))
        if a <= 0: continue
        nxt = starts[i + 1] if i + 1 < n else starts[i] + 4.4
        focus = 1.0 if t > starts[-1] + 4.4 else (1.0 if starts[i] - 0.3 <= t < nxt - 0.3 else 0.55)
        cx = x0 + i * (cw + gap) + cw / 2
        rise = (1 - ease_out(ramp(t, starts[i] - 0.3, starts[i] + 0.6))) * 30
        ps = 224
        py = 380 + rise
        gl = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(gl)
        glass(fr_rgba, (cx - cw / 2, py - 36, cx + cw / 2, py + ps + 200), 22, a * (0.9 if focus > 0.9 else 0.6))
        im, mask = circle_photo(p['file'], ps, CYAN, a, dim=lerp(0.55, 1.0, focus))
        fr_rgba.paste(im, (int(cx - ps / 2), int(py)), mask)
        gd.ellipse((cx - ps / 2 - 6, py - 6, cx + ps / 2 + 6, py + ps + 6), outline=(CYAN if focus > 0.9 else INK3) + (int(255 * a * focus),), width=3)
        # name (wrap to two lines when long)
        words = p['name'].split(' ')
        lines, cur = [], ''
        fN = font(25, 650)
        for w_ in words:
            test = (cur + ' ' + w_).strip()
            if gd.textlength(test, font=fN) > cw - 36 and cur: lines.append(cur); cur = w_
            else: cur = test
        lines.append(cur)
        ny = py + ps + 58
        for j, ln in enumerate(lines[:2]):
            tracking_text(gd, (cx, ny + j * 32), ln, fN, WHITE + (int(255 * a * lerp(0.7, 1, focus)),), 0, 'c')
        # position (wrap)
        fP = font(16, 600); pos = p['position'].upper()
        plines, cur = [], ''
        for w_ in pos.split(' '):
            test = (cur + ' ' + w_).strip()
            if gd.textlength(test, font=fP) + 16 * 0.16 * len(test) > cw - 40 and cur: plines.append(cur); cur = w_
            else: cur = test
        plines.append(cur)
        pyy = ny + len(lines[:2]) * 32 + 16
        for j, ln in enumerate(plines[:3]):
            tracking_text(gd, (cx, pyy + j * 24), ln, fP, CYAN + (int(255 * a * lerp(0.7, 1, focus)),), 0.16, 'c')
        fr_rgba.alpha_composite(gl)
    fr_rgba.alpha_composite(ui)
    return fr_rgba.convert('RGB')

# ---------------------------------------------------------------- 02 WHY — the problem
def problem_frame(t):
    fr = backdrop(t + 30, lon0=85, cx=W / 2, R_=470, dim=0.3, data=0.9)
    c = meta()['counts']
    def txt(o):
        section_label(o, '02 · WHY IT MATTERS', window(t, 0.2, 15.7, 0.6, 0.5))
        cap(o, t, 0.25, 1.9, 'But there’s a catch.', 330, 64, 650, fi=0.35, fo=0.35)
        k = window(t, 1.9, 8.9, 0.6, 0.5)
        if k > 0:
            d = ImageDraw.Draw(o)
            x0, y0 = W / 2 - 520, 380
            d.rounded_rectangle((x0, y0, x0 + 1040, y0 + 170), 18, fill=(8, 12, 20, int(225 * k)), outline=(255, 255, 255, int(50 * k)))
            tracking_text(d, (x0 + 34, y0 + 52), 'NISAR_L2_PR_GCOV_031_069_A_014_4005_DHDH_A_20260922T232132_….h5', font(20, 500, mono=True), CYAN + (int(255 * k),), 0)
            tracking_text(d, (x0 + 34, y0 + 108), '6.7 GB', font(44, 600, mono=True), WHITE + (int(255 * k),), 0)
            tracking_text(d, (x0 + 250, y0 + 104), 'ONE RADAR IMAGE  ·  HDF5  ·  CALIBRATED COVARIANCE MATRICES', font(16, 600), INK2 + (int(255 * k),), 0.2)
            tracking_text(d, (x0 + 34, y0 + 146), 'Real file size from the ASF archive (Bangladesh, 22 Sep 2026)', font(15, 400), INK3 + (int(255 * k),), 0)
        cap(o, t, 8.5, 15.7, 'The changes are in there.', 330, 56, 650)
        cap(o, t, 9.4, 15.7, 'For the people who need them most, they stay invisible.', 410, 34, 400, color=INK2)
    shadow_text(fr, txt)
    return fr

# ---------------------------------------------------------------- 04 HOW — impact, next, needs
def impact_frame(t, G=(0.3, 12.3, 23.4, 33.4), F=33.4, END=45.7):
    fr = backdrop(t + 60, lon0=70, cx=W * 0.74, R_=560, dim=lerp(0.45, 0.8, smooth(ramp(t, F, F + 4))), data=0.8)
    fr_rgba = fr.convert('RGBA')
    groups = [
        (G[0], G[1], '04 · IMPACT', 'WHO IT HELPS', [('Farmers', 'See flooded or changing fields, even under monsoon cloud.'), ('Disaster responders', 'Where water spread. Where the ground moved.'), ('Students & the public', 'Understand a living planet from orbit, with every pixel sourced.')]),
        (G[1], G[2], '04 · WHAT’S NEXT', 'ROADMAP', [('Calibrated NISAR products', 'Backscatter in dB and ground displacement in cm, via Earthdata.'), ('Change alerts', 'Pick a place and get notified when NISAR sees it change.'), ('More sensors', 'ISRO’s S-band plus optical data to explain each change.')]),
        (G[2], G[3], '04 · WHAT WE NEED', 'TO GO FURTHER', [('Data & compute', 'Earthdata access and servers for full-resolution processing.'), ('Mentors', 'Radar scientists to validate our change methods.'), ('Partners', 'Disaster-response and agriculture teams to test it in the field.')]),
    ]
    ui = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ui)
    for (a, b, label, head, items) in groups:
        k = window(t, a, b, 0.7, 0.6)
        if k <= 0: continue
        tracking_text(d, (110, 128), label, font(16, 600), CYAN + (int(255 * k),), 0.32)
        tracking_text(d, (110, 210), head, font(60, 700), WHITE + (int(255 * k),), 0.04)
        for j, (h1, h2) in enumerate(items):
            kj = k * smooth(ramp(t, a + 1.2 + j * 1.6, a + 2.0 + j * 1.6))
            if kj <= 0: continue
            y = 300 + j * 170
            glass(fr_rgba, (110, y, 110 + 860, y + 140), 18, kj)
            d.rounded_rectangle((110, y, 116, y + 140), 3, fill=CYAN + (int(255 * kj),))
            tracking_text(d, (146, y + 58), h1, font(32, 650), WHITE + (int(255 * kj),), 0)
            tracking_text(d, (146, y + 102), h2, font(21, 400), INK2 + (int(255 * kj),), 0)
    # finale 40–50 s
    kf = window(t, F + 0.8, END - 0.1, 1.0, 1.0)
    if kf > 0:
        tracking_text(d, (W / 2, 330), 'One day, anyone should be able to ask:', font(30, 400), INK2 + (int(255 * kf),), 0, 'c')
        k2 = window(t, F + 4.6, END - 0.1, 0.9, 1.0)
        tracking_text(d, (W / 2, 440), 'WHAT CHANGED HERE?', font(96, 700), WHITE + (int(255 * k2),), 0.04, 'c')
        k3 = window(t, F + 8.6, END - 0.1, 0.8, 1.0)
        tracking_text(d, (W / 2 - 170, 590), 'EARTH', font(54, 650), WHITE + (int(255 * k3),), 0.14, 'c')
        tracking_text(d, (W / 2 - 50, 590), '//', font(54, 650), CYAN + (int(255 * k3),), 0.0, 'c')
        tracking_text(d, (W / 2 + 72, 590), 'PULSE', font(54, 650), WHITE + (int(255 * k3),), 0.14, 'c')
        tracking_text(d, (W / 2, 640), 'WATCH EARTH CHANGE.', font(20, 500), INK2 + (int(255 * k3),), 0.42, 'c')
        k4 = window(t, F + 7.2, END - 0.1, 0.8, 1.0)
        tracking_text(d, (W / 2, 760), 'THE L-BAND', font(30, 700), CYAN + (int(255 * k4),), 0.24, 'c')
        tracking_text(d, (W / 2, 800), '  ·  '.join(p['name'] for p in TEAM), font(17, 500), INK2 + (int(255 * k4),), 0.02, 'c')
        tracking_text(d, (W / 2, 850), 'NASA SPACE APPS CHALLENGE 2026  ·  DANCING WITH THE SARs  ·  REAL NISAR DATA · NASA × ISRO · ASF DAAC', font(14, 600), INK3 + (int(255 * k4),), 0.2, 'c')
        tracking_text(d, (W / 2, 880), 'VOICEOVER: AI-GENERATED WITH ELEVENLABS (ELEVENLABS.IO)  ·  MUSIC: ORIGINAL, GENERATED IN CODE', font(13, 600), INK3 + (int(220 * k4),), 0.2, 'c')
    fr_rgba.alpha_composite(ui)
    out = fr_rgba.convert('RGB')
    # final fade to black
    fo = 1 - smooth(ramp(t, END - 0.8, END))
    if fo < 1: out = Image.eval(out, lambda v: int(v * fo))
    return out

# ---------------------------------------------------------------- assembly
def seg_at(t):
    for s in SEGMENTS:
        if s[0] <= t < s[1]: return s
    return SEGMENTS[-1]

def frame_at(t):
    a, b, kind, p = seg_at(t)
    lt = t - a
    if kind == 'film':
        if 'warp' in p:
            o = None
            for l0, l1, o0, o1 in p['warp']:
                if l0 <= lt <= l1 or o is None: o = o0 + (o1 - o0) * clamp((lt - l0) / (l1 - l0))
                if l0 <= lt <= l1: break
            im = R.frame_at(o)
        else:
            im = R.frame_at(p['o0'] + lt)
    elif kind == 'team': im = team_frame(lt)
    elif kind == 'problem': im = problem_frame(lt)
    else: im = impact_frame(lt, tuple(p['groups']), p['finale'], b - a)
    # dip through black at cuts (not at the very start/end, which have their own fades)
    k = 1.0
    if a > 0: k = min(k, smooth(ramp(t, a, a + EDGE)))
    if b < DUR: k = min(k, 1 - smooth(ramp(t, b - EDGE, b)))
    if a == 0: k = min(k, smooth(ramp(t, 0, 1.0)))
    if k < 1: im = Image.eval(im, lambda v: int(v * k))
    return im

def _render(t): return np.asarray(frame_at(t), np.uint8).tobytes()

if __name__ == '__main__':
    if sys.argv[1] == 'still':
        t = float(sys.argv[2]); out = sys.argv[3] if len(sys.argv) > 3 else f'pitch_{t:06.1f}.png'
        frame_at(t).save(out); print(out)
    elif sys.argv[1] == 'video':
        out = sys.argv[2]
        times = [i / FPS for i in range(int(DUR * FPS))]
        ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                               '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
        import multiprocessing as mp
        with mp.get_context('fork').Pool(int(os.environ.get('WORKERS', '10'))) as pool:
            for i, buf in enumerate(pool.imap(_render, times, chunksize=4)):
                ff.stdin.write(buf)
                if i % 300 == 0: print(f'[pitch] {i}/{len(times)}', flush=True)
        ff.stdin.close(); ff.wait(); print('[pitch] done', out)
