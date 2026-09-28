#!/usr/bin/env python3
"""Epic 240 s score for the pitch cut (pitch.py). Original, synthesized.
D minor, 100 BPM. Braams + taiko hits on the story beats, string ostinato,
choir pads, reverse-cymbal swells. Ducks under the real sonification (182–190 s)
and leaves space for a voiceover (VO_DUCK applied at mix time if a VO exists)."""
import json, os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100; DUR = 240.0; N = int(SR * DUR)
t = np.arange(N) / SR
BPM = 100.0; BEAT = 60 / BPM; BAR = 4 * BEAT
rng = np.random.default_rng(11)
midi = lambda m: 440.0 * 2 ** ((m - 69) / 12)

# ---- story beats: all derived from timeline.json (shared with pitch.py and the voiceover) ----
TL = json.load(open(os.path.join(HERE, 'timeline.json')))
C = TL['cues']; SG = C['segments']
HITS_BIG, HITS_MED, CARDS, SONIFY = C['big'], C['med'], C['cards'], [tuple(x) for x in C['sonify']]
T0, T1 = SG['team']; N0, N1 = SG['nisar']; P0, P1 = SG['problem']; B0, B1 = SG['bangladesh']; K0, K1 = SG['kumamoto']
C0, C1 = SG['change']; I0, I1 = SG['integrity']; S0, S1 = SG['sonify']; M0, M1 = SG['impact']; F = M0 + 33.4
KEYS = [(0, .15), (10, .35), (T0 - 0.5, .45), (T0 + 0.3, .8), (T0 + 5, .5), (T1 - 1, .55), (N0, .6), (N0 + 2.3, .8), (N0 + 15, .65), (N1 - 0.5, .7),
        (P0, .35), (P1 - 1, .5), (B0, .9), (B1 - 1.5, .85), (K0, .55), (K0 + 7, .7), (K0 + 16, 1.0), (K1 - 1, .85), (C0, .7), (C0 + 12.7, 1.0), (C1 - 0.5, .8),
        (I0, .45), (I1 - 0.5, .45), (S0, .2), (S1 - 0.2, .2), (M0, .5), (M0 + 15, .6), (F - 1, .7), (F + 5, 1.0), (237, .9), (240, 0)]
kt, kv = zip(*KEYS)
I = np.interp(t, kt, kv).astype(np.float32)

PROG = [[38, 50, 53, 57], [34, 46, 50, 53], [41, 53, 57, 60], [36, 48, 52, 55]]      # Dm Bb F C
DARK = [[38, 50, 53, 57], [43, 55, 58, 62], [34, 46, 50, 53], [33, 45, 49, 52]]      # Dm Gm Bb A
SEG = 2 * BAR
def chord(sec): return (DARK if K0 <= sec < K1 or P0 <= sec < P1 else PROG)[int(sec // SEG) % 4]

out = np.zeros((N, 2), np.float32)
def add(y, i0, gain=1.0, pan=0.5):
    i1 = min(N, i0 + len(y)); y = y[:i1 - i0] * gain
    out[i0:i1, 0] += y * (1 - pan) * 1.4; out[i0:i1, 1] += y * pan * 1.4

# ---- choir pad (formant-ish, vibrato) -------------------------------------------------------
fade = int(1.8 * SR)
for s in range(int(np.ceil(DUR / SEG))):
    s0 = int(s * SEG * SR); s1 = min(N, int((s + 1) * SEG * SR) + fade)
    if s0 >= N: break
    tt = t[s0:s1]; env = np.ones(s1 - s0); a = min(fade, len(env)); env[:a] = np.linspace(0, 1, a); env[-a:] *= np.linspace(1, 0, a)
    lvl = float(np.interp(s * SEG, kt, kv))
    for j, m in enumerate(chord(s * SEG + .1)[1:]):
        f0 = midi(m + 12)
        for v in range(3):
            f = f0 * 2 ** ((v - 1) * 0.08 / 12)
            vib = 1 + 0.004 * np.sin(2 * np.pi * (5 + v * .3) * tt + v)
            ph = np.cumsum(2 * np.pi * f * vib / SR)
            w = sum(np.sin(h * ph) * (1 / h) * (1.8 if 600 < f * h < 1300 else 1) for h in range(1, 5))
            add((w * env * 0.017 * (0.6 + lvl)).astype(np.float32), s0, 1.0, 0.2 + 0.3 * v)

# ---- low brass sustain (opens with energy) -------------------------------------------------
for s in range(int(np.ceil(DUR / SEG))):
    s0 = int(s * SEG * SR); s1 = min(N, int((s + 1) * SEG * SR) + fade)
    if s0 >= N: break
    lvl = float(np.interp(s * SEG, kt, kv))
    if lvl < 0.5: continue
    tt = t[s0:s1]; env = np.ones(s1 - s0); a = min(fade, len(env)); env[:a] = np.linspace(0, 1, a); env[-a:] *= np.linspace(1, 0, a)
    root = chord(s * SEG + .1)[0]
    for m in (root + 12, root + 19):
        f = midi(m); ph = 2 * np.pi * f * tt
        nh = int(4 + 10 * lvl)
        w = sum(np.sin(h * ph) / h ** 1.15 for h in range(1, nh))
        add((w * env * 0.018 * (lvl - 0.4)).astype(np.float32), s0, 1.0, 0.5)

# ---- string ostinato (8ths) during action -------------------------------------------------
st = BEAT / 2; ln = int(0.22 * SR); x = np.arange(ln) / SR
senv = np.exp(-x * 14) * np.minimum(1, x * 300)
b = 0.0; k = 0
PAT = [0, 0, 2, 0, 3, 0, 2, 1]
while b < DUR:
    lvl = float(np.interp(b, kt, kv))
    if lvl >= 0.6 and not any(a <= b < e for a, e in SONIFY):
        ch = chord(b); m = ch[1 + PAT[k % 8] % 3] + (12 if (k // 16) % 2 else 0)
        f = midi(m); ph = 2 * np.pi * f * x
        w = sum(np.sin(h * ph) / h for h in range(1, 9)) * senv
        add(w.astype(np.float32), int(b * SR), 0.075 * (lvl - 0.45), 0.35 + 0.3 * (k % 2))
    b += st; k += 1

# ---- drums ----------------------------------------------------------------------------------
def taiko(gain=1.0, low=52.0):
    n = int(1.4 * SR); x = np.arange(n) / SR
    body = np.sin(2 * np.pi * (low * x + 70 * (1 - np.exp(-x * 25)) / 25)) * np.exp(-x * 4.5)
    nz = rng.standard_normal(n); nz = np.convolve(nz, np.ones(40) / 40, 'same') * np.exp(-x * 18) * 2.5
    return ((body + nz) * gain).astype(np.float32)
def braam(at, gain=1.0):
    n = int(4.5 * SR); x = np.arange(n) / SR
    env = np.minimum(1, x / 0.06) * np.exp(-x * 0.7)
    root = chord(at)[0]
    y = np.zeros(n)
    for m, g in ((root - 12, 0.55), (root, 0.9), (root + 7, 0.6), (root + 12, 0.45)):
        f = midi(m); ph = 2 * np.pi * f * x
        y += sum(np.sin(h * ph + rng.uniform(0, 6)) / h ** 0.9 for h in range(1, 14)) * g
    y = np.tanh(y * 0.6) * env
    return (y * gain * 0.16).astype(np.float32)
def cymbal_swell(end, length=2.6, gain=0.18):
    n = int(length * SR); x = np.linspace(0, 1, n)
    nz = rng.standard_normal(n); nz = nz - np.convolve(nz, np.ones(8) / 8, 'same')
    add((nz * x ** 3 * gain).astype(np.float32), max(0, int(end * SR) - n), 1.0, 0.5)

for h in HITS_BIG:
    cymbal_swell(h)
    add(braam(h, 1.0), int(h * SR))
    for j, dt in enumerate((0, 0.02, 0.05)): add(taiko(0.36, 48 + j * 6), int((h + dt) * SR), 1.0, 0.3 + 0.2 * j)
for h in HITS_MED:
    add(taiko(0.3), int(h * SR)); add(braam(h, 0.45), int(h * SR))
for c in CARDS:
    add(taiko(0.25, 70), int(c * SR), 1.0, 0.5)

# taiko groove in high-energy passages (quarter notes, accents on 1 and 3)
b = 0.0; k = 0
while b < DUR:
    lvl = float(np.interp(b, kt, kv))
    if lvl >= 0.75 and not any(a <= b < e for a, e in SONIFY):
        add(taiko(0.09 + 0.07 * (k % 4 in (0, 2)) , 58 if k % 2 else 50), int(b * SR), 1.0, 0.4 + 0.2 * (k % 2))
    b += BEAT; k += 1

# heartbeat under the problem scene (77–90)
b = P0 + 0.3
while b < P1 - 0.5:
    add(taiko(0.15, 44), int(b * SR)); add(taiko(0.1, 44), int((b + 0.28) * SR)); b += 1.2

# ---- sonification of the real change map (same algorithm as src/sonify.js) ---------------
son = np.zeros(N, np.float32)
ser = json.load(open(os.path.join(HERE, 'film.json')))['sonify']['series']
for a, e in SONIFY:
    i0, i1 = int(a * SR), int(e * SR); n = i1 - i0; xx = np.linspace(0, 1, n, endpoint=False)
    idx = np.minimum(len(ser) - 1, (xx * len(ser)).astype(int))
    dn = np.array([s['dn'] for s in ser])[idx]; up = np.array([s['up'] for s in ser])[idx]
    sm = lambda v: np.convolve(v, np.ones(1200) / 1200, 'same')
    dl, bl = sm(np.minimum(1, dn * 6)), sm(np.minimum(1, up * 6))
    low = np.sin(2 * np.pi * np.cumsum(90 + dl * 130) / SR) * dl * 0.9
    ph = np.cumsum(380 + bl * 520) / SR; high = (2 * np.abs(2 * (ph % 1) - 1) - 1) * bl * 0.55
    env = np.clip(np.minimum(xx / .02, (1 - xx) / .03), 0, 1)
    son[i0:i1] = ((low + high) * env * 0.3).astype(np.float32)
duck = np.ones(N, np.float32)
for a, e in SONIFY:
    duck *= 1 - 0.8 * np.clip(np.minimum((t - a + .5) / .5, (e - t + .5) / .5), 0, 1).astype(np.float32)
mix = out * duck[:, None]
mix[:, 0] += son; mix[:, 1] += son

# ---- reverb, master --------------------------------------------------------------------------
def reverb(x, seconds=3.2, wet=0.28):
    n = int(seconds * SR); env = np.exp(-np.linspace(0, 6, n)); o = np.zeros_like(x)
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    for c in range(2):
        ir = rng.standard_normal(n) * env; ir /= np.sqrt((ir ** 2).sum())
        o[:, c] = np.fft.irfft(np.fft.rfft(x[:, c].astype(np.float64), size) * np.fft.rfft(ir, size), size)[:len(x)].astype(np.float32)
    return x + o * wet
mix = reverb(mix)
mix = np.tanh(mix * 1.5) / np.tanh(1.5)
fi, fo = int(1.2 * SR), int(3.0 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]; mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
mix /= np.abs(mix).max() / 0.89
with wave.open(os.path.join(HERE, 'score_pitch_vo.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('wrote score_pitch_vo.wav')
