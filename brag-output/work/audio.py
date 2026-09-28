#!/usr/bin/env python3
"""Original 240 s score for the EARTH//PULSE film (synthesized, no samples).
D minor, 90 BPM. Cues are locked to the scene timeline in render.py.
During 203–211 s and 212.5–220.5 s the music ducks under the real
sonification of the change map (same algorithm as src/sonify.js)."""
import json, os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100
DUR = 240.0
N = int(SR * DUR)
t = np.arange(N, dtype=np.float64) / SR
BPM = 90.0
BEAT = 60 / BPM
rng = np.random.default_rng(3)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

# ---------------------------------------------------------------- intensity automation
KEYS = [(0, .12), (7, .18), (9, .45), (29, .5), (30.6, .7), (39, .55), (41, .5), (56, .62), (71.5, .66), (72.2, .78), (100, .8), (111.5, .75),
        (112.3, .55), (126, .62), (134.5, .72), (145.5, .6), (146.3, .68), (160, .78), (161.6, .85), (177, .78), (178.5, .4), (199, .42),
        (200.3, .22), (221.5, .25), (222.3, .75), (224, .9), (235, .8), (240, 0)]
kt, kv = zip(*KEYS)
I = np.interp(t, kt, kv).astype(np.float32)
DUCK = np.ones(N, np.float32)
for a, b in ((202.6, 211.4), (212.1, 220.9)):
    DUCK *= 1 - 0.72 * np.clip(np.minimum((t - a) / .4, (b - t) / .4), 0, 1).astype(np.float32)

# ---------------------------------------------------------------- chords
# i – VI – III – VII in D minor, one chord per 2 bars; darker ii°-flavour for the earthquake
PROG = [[50, 57, 62, 65, 69], [46, 53, 58, 62, 65], [53, 57, 60, 65, 69], [48, 55, 60, 64, 67]]
QUAKE = [[50, 57, 62, 65, 69], [55, 58, 62, 67, 70], [46, 53, 58, 62, 65], [45, 52, 57, 61, 64]]
BAR = 4 * BEAT
SEG = 2 * BAR
def chord_at(sec):
    k = int(sec // SEG) % 4
    return (QUAKE if 112 <= sec < 146 else PROG)[k]

# ---------------------------------------------------------------- pad (additive, detuned)
pad = np.zeros((N, 2), np.float32)
nseg = int(np.ceil(DUR / SEG))
fade = int(1.6 * SR)
for s in range(nseg):
    s0 = int(s * SEG * SR); s1 = min(N, int((s + 1) * SEG * SR) + fade)
    if s0 >= N: break
    tt = t[s0:s1]
    env = np.ones(s1 - s0, np.float32)
    a = min(fade, len(env)); env[:a] = np.linspace(0, 1, a)
    r = min(fade, len(env)); env[-r:] *= np.linspace(1, 0, r)
    notes = chord_at(s * SEG + 0.1)
    bright = float(np.interp(s * SEG, kt, kv))
    seg = np.zeros((s1 - s0, 2), np.float32)
    for j, m in enumerate(notes):
        f = midi(m + (12 if j == 0 and False else 0))
        for det, pan in ((-0.07, 0.25), (0.0, 0.5), (0.07, 0.75)):
            ff = f * 2 ** (det / 12)
            ph = rng.uniform(0, 6.28)
            w = np.zeros_like(tt)
            for h in range(1, 5):
                w += np.sin(2 * np.pi * ff * h * tt + ph * h) * (1 / h) * (bright ** (h - 1) if h > 1 else 1)
            gain = 0.028 if j else 0.04
            seg[:, 0] += (w * gain * (1 - pan)).astype(np.float32)
            seg[:, 1] += (w * gain * pan).astype(np.float32)
    lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * tt + s)
    pad[s0:s1] += seg * (env * lfo)[:, None].astype(np.float32)
pad *= (0.55 + 0.6 * I)[:, None]

# ---------------------------------------------------------------- sub pulse (every beat when intensity > .4)
sub = np.zeros(N, np.float32)
kick_len = int(0.45 * SR); kt_ = np.arange(kick_len) / SR
kick = (np.sin(2 * np.pi * (48 * kt_ + 60 * (1 - np.exp(-kt_ * 30)) / 30)) * np.exp(-kt_ * 7)).astype(np.float32)
b = 0.0
while b < DUR:
    lvl = float(np.interp(b, kt, kv))
    if lvl > 0.42:
        i0 = int(b * SR); i1 = min(N, i0 + kick_len)
        sub[i0:i1] += kick[:i1 - i0] * (lvl - 0.35) * 0.9
    b += BEAT

# ---------------------------------------------------------------- hats (offbeat 8ths, soft) when intensity > .6
hat = np.zeros(N, np.float32)
hl = int(0.05 * SR)
noise = rng.standard_normal(hl).astype(np.float32)
noise = noise - np.convolve(noise, np.ones(6) / 6, 'same')  # crude high-pass
hsh = noise * np.exp(-np.arange(hl) / SR * 70).astype(np.float32)
b = BEAT / 2
while b < DUR:
    lvl = float(np.interp(b, kt, kv))
    if lvl > 0.6:
        i0 = int(b * SR); i1 = min(N, i0 + hl)
        hat[i0:i1] += hsh[:i1 - i0] * (lvl - 0.55) * 0.35
    b += BEAT

# ---------------------------------------------------------------- arp (16ths) with ping-pong delay
arp = np.zeros((N, 2), np.float32)
st = BEAT / 4
al = int(0.32 * SR); at_ = np.arange(al) / SR
aenv = np.exp(-at_ * 11).astype(np.float32) * np.minimum(1, at_ * 400).astype(np.float32)
k = 0; b = 0.0
PATTERN = [0, 2, 3, 4, 3, 2, 1, 2]
while b < DUR:
    lvl = float(np.interp(b, kt, kv))
    if lvl > 0.5:
        ch = chord_at(b)
        m = ch[1 + PATTERN[k % 8] % 4] + 12 + (12 if (k // 8) % 2 else 0)
        f = midi(m)
        w = (np.sin(2 * np.pi * f * at_) + 0.25 * np.sin(2 * np.pi * 3 * f * at_)) * aenv
        i0 = int(b * SR); i1 = min(N, i0 + al)
        g = (lvl - 0.45) * 0.09
        pan = 0.5 + 0.35 * np.sin(k * 0.9)
        arp[i0:i1, 0] += (w[:i1 - i0] * g * (1 - pan)).astype(np.float32)
        arp[i0:i1, 1] += (w[:i1 - i0] * g * pan).astype(np.float32)
    k += 1; b += st
dl = int(BEAT * 0.75 * SR)
echo = np.zeros_like(arp)
echo[dl:, 0] = arp[:-dl, 1] * 0.45; echo[2 * dl:, 1] = arp[:-2 * dl, 0] * 0.3
arp += echo

# ---------------------------------------------------------------- risers & impacts
fx = np.zeros((N, 2), np.float32)
def riser(end, length=3.0, gain=0.22):
    i1 = int(end * SR); i0 = max(0, i1 - int(length * SR))
    n = i1 - i0; x = np.linspace(0, 1, n)
    nz = rng.standard_normal(n)
    sm = np.convolve(nz, np.ones(24) / 24, 'same')
    body = (sm * (1 - x) + nz * x) * x ** 2.2
    sweep = np.sin(2 * np.pi * np.cumsum(180 + 900 * x ** 2) / SR) * x ** 3 * 0.5
    y = ((body * 0.35 + sweep) * gain).astype(np.float32)
    fx[i0:i1, 0] += y; fx[i0:i1, 1] += y
def impact(at, gain=0.6):
    i0 = int(at * SR); n = min(N - i0, int(2.4 * SR)); x = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 * x + 30 * (1 - np.exp(-x * 9)) / 9)) * np.exp(-x * 2.2)
    nz = rng.standard_normal(n) * np.exp(-x * 9) * 0.25
    y = ((boom + nz) * gain).astype(np.float32)
    fx[i0:i0 + n, 0] += y; fx[i0:i0 + n, 1] += y
def blip(at, f=1320, gain=0.12):
    i0 = int(at * SR); n = int(0.06 * SR); x = np.arange(n) / SR
    y = (np.sin(2 * np.pi * f * x) * np.exp(-x * 60) * gain).astype(np.float32)
    fx[i0:i0 + n] += y[:, None]
for when in (30.6, 72.2, 161.6, 224.0):
    riser(when, 3.2); impact(when, 0.55)
impact(126.4, 0.35); impact(134.5, 0.7); impact(42.3, 0.3)
riser(112.3, 2.2, 0.15)
blip(152.05, 1480); blip(152.55, 990, 0.08)            # click → WHAT CHANGED HERE?
for j in range(5): blip(119.3 + j * 0.9, 660 + j * 110, 0.05)  # interferograms appear
for j in range(5): blip(181 + j * 0.35, 880, 0.04)              # provenance tags

# ---------------------------------------------------------------- sonification (real change map, src/sonify.js)
son = np.zeros(N, np.float32)
ser = json.load(open(os.path.join(HERE, 'film.json')))['sonify']['series']
for a, bnd in ((203.0, 211.0), (212.5, 220.5)):
    i0, i1 = int(a * SR), int(bnd * SR); n = i1 - i0
    x = np.linspace(0, 1, n, endpoint=False)
    idx = np.minimum(len(ser) - 1, (x * len(ser)).astype(int))
    dn = np.array([s['dn'] for s in ser])[idx]; up = np.array([s['up'] for s in ser])[idx]
    sm = lambda v: np.convolve(v, np.ones(1200) / 1200, 'same')
    dl_ = sm(np.minimum(1, dn * 6)); bl_ = sm(np.minimum(1, up * 6))
    f_low = 90 + dl_ * 130; f_high = 380 + bl_ * 520
    low = np.sin(2 * np.pi * np.cumsum(f_low) / SR) * dl_ * 0.9
    ph = np.cumsum(f_high) / SR
    tri = 2 * np.abs(2 * (ph % 1) - 1) - 1
    high = tri * bl_ * 0.55
    env = np.clip(np.minimum(x / 0.02, (1 - x) / 0.03), 0, 1)
    son[i0:i1] += ((low + high) * env * 0.22).astype(np.float32)

# ---------------------------------------------------------------- mix + reverb
dry = pad * 2.0 + arp * 1.7 + fx
dry[:, 0] += sub * 0.38 + hat * 1.3; dry[:, 1] += sub * 0.38 + hat * 1.3
dry *= DUCK[:, None]
dry[:, 0] += son; dry[:, 1] += son

def reverb(x, seconds=2.4, wet=0.22):
    n = int(seconds * SR); env = np.exp(-np.linspace(0, 6.5, n))
    out = np.zeros_like(x)
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    for c in range(2):
        ir = (rng.standard_normal(n) * env).astype(np.float64); ir /= np.sqrt((ir ** 2).sum())
        X = np.fft.rfft(x[:, c].astype(np.float64), size); Hh = np.fft.rfft(ir, size)
        out[:, c] = np.fft.irfft(X * Hh, size)[:len(x)].astype(np.float32)
    return x + out * wet

mix = reverb(dry)
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
fi = int(1.5 * SR); fo = int(3.5 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]; mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
mix /= np.abs(mix).max() / 0.89
pcm = (mix * 32767).astype(np.int16)
out = os.path.join(HERE, 'score.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', out, pcm.shape)
