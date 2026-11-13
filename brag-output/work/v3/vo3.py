"""v3 tail (60 s): the Pulse pitch. Reuses vo.synth (ElevenLabs eleven_v3, George)."""
import sys, os, wave, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np, vo
L = [
 (0.5, "[warmly] But seeing change isn't enough. People need to know what it means for them, today."),
 (6.0, "Everyone has a weather app. It tells you if it will rain. Earth Pulse tells you what the rain will do."),
 (13.2, "Pick any place, and Pulse reads NASA's own measurements: rain against normal, how saturated the soil is, heat, fires, open events, and the landslide record."),
 (25.4, "A farmer sets their own limits, heavy rain, dry spells, heat, frost, and sees the moment the season crosses the line."),
 (34.4, "A climber sees the warm spells and freezing nights that loosen glaciers, and the slopes that have failed before."),
 (42.0, "One simple card. Built on NASA data. Every number with its source."),
 (47.5, "Next: alerts on every phone and watch, and flood warnings measured by NISAR itself."),
 (54.0, "[softly] We are The L Band. This is Earth Pulse. Watch Earth change."),
]
SR = vo.SR; D = 60.0
out = np.zeros(int(SR * D), np.float32); rep = []
for i, (t, s) in enumerate(L):
    x = vo.synth(s); d = len(x) / SR; nxt = L[i+1][0] if i+1 < len(L) else D
    rep.append((t, round(d, 2), round(t + d - nxt, 2), s[:50]))
    i0 = int(t * SR); out[i0:i0+len(x)] += x[:len(out)-i0]
with wave.open(os.path.join(os.path.dirname(__file__), 'vo3.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
for r in rep: print(r, '<-- OVERRUN' if r[2] > 0.15 else '')
