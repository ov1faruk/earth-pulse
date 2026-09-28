#!/usr/bin/env python3
"""Single source of truth for the voiced 240 s pitch.

Segments (video), voiceover line placement (anchored to visuals, never
overlapping), and music cue times are all derived here and written to
timeline.json, which pitch.py, vo_mix.py and audio_pitch.py read.
Line durations come from the cached ElevenLabs takes (vo.py), sped up by TEMPO.
"""
import json, os, subprocess
import vo  # reuses the script parsing + cache

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPO = 1.06   # gentle speed-up (pitch preserved) so the dreamy read breathes
GAP = 0.45     # minimum pause between lines

# (name, duration, kind, params) — durations sum to 240 s
SEGMENTS = [
    ('hook', 15.0, 'film', {'o0': 8.0}),
    ('team', 41.0, 'team', {}),
    ('nisar', 27.0, 'film', {'o0': 43.0}),
    ('problem', 16.0, 'problem', {}),
    ('bangladesh', 29.8, 'film', {'o0': 81.0}),
    ('kumamoto', 27.2, 'film', {'o0': 118.5}),
    ('change', 16.0, 'film', {'o0': 148.5}),
    ('integrity', 8.0, 'film', {'o0': 178.5}),
    ('sonify', 14.3, 'film', {'warp': [[0.0, 6.3, 200.6, 202.9], [6.3, 14.3, 203.0, 211.0]]}),
    ('impact', 45.7, 'impact', {'groups': [0.3, 12.3, 23.4, 33.4], 'finale': 33.4}),
]
# voiceover line index → (segment, earliest offset). Lines without an anchor follow the previous line.
ANCHORS = {0: ('hook', 1.0), 3: ('team', 0.4), 10: ('nisar', 1.0), 14: ('nisar', 21.2), 15: ('problem', 0.3), 16: ('problem', 1.9),
           18: ('bangladesh', 0.4), 20: ('bangladesh', 11.8), 21: ('bangladesh', 19.5), 22: ('bangladesh', 22.2),
           23: ('kumamoto', 0.6), 24: ('kumamoto', 6.1), 28: ('change', 0.3), 29: ('change', 4.4), 30: ('change', 10.6),
           31: ('integrity', 0.4), 32: ('sonify', 0.2), 33: ('impact', 0.8), 34: ('impact', 12.6), 35: ('impact', 23.8),
           36: ('impact', 34.2), 37: ('impact', 40.8)}

def dur_of(text):
    x = vo.synth(text)          # cached, no credits spent
    return len(x) / vo.SR / TEMPO

def build():
    starts, t = {}, 0.0
    for name, d, kind, p in SEGMENTS:
        starts[name] = t; t += d
    assert abs(t - 240.0) < 1e-6, t
    lines = vo.lines()
    placed, prev_end = [], 0.0
    for i, (_, text) in enumerate(lines):
        d = dur_of(text)
        at = prev_end + GAP
        if i in ANCHORS:
            seg, off = ANCHORS[i]; at = max(at, starts[seg] + off)
        placed.append({'i': i, 'start': round(at, 3), 'dur': round(d, 3), 'end': round(at + d, 3), 'text': text})
        prev_end = at + d
    segs = []
    for name, d, kind, p in SEGMENTS:
        segs.append({'name': name, 'start': starts[name], 'end': starts[name] + d, 'kind': kind, **p})
    # team cards appear when each member's line starts (lines 4–8), relative to the team segment
    team_cards = [round(placed[i]['start'] - starts['team'], 3) for i in range(4, 9)]
    # music cues (absolute seconds)
    cues = {
        'big': [starts['team'] + 0.3, starts['nisar'] + 2.3, starts['bangladesh'] + 0.0, starts['kumamoto'] + 16.0,
                starts['change'] + 12.7, starts['impact'] + 33.4 + 5.0],
        'med': [starts['kumamoto'] + 7.0, starts['change'] + 3.5, starts['impact'] + 33.4 + 7.6, starts['nisar'],
                starts['kumamoto'], starts['change'], starts['impact']],
        'cards': [starts['team'] + c for c in team_cards],
        'sonify': [[starts['sonify'] + 6.3, starts['sonify'] + 14.3]],
        'problem': [starts['problem'], starts['problem'] + 16.0],
        'segments': {s['name']: [s['start'], s['end']] for s in segs},
    }
    out = {'tempo': TEMPO, 'segments': segs, 'vo': placed, 'team_cards': team_cards, 'cues': cues}
    json.dump(out, open(os.path.join(HERE, 'timeline.json'), 'w'), indent=1, ensure_ascii=False)
    return out

if __name__ == '__main__':
    tl = build()
    seg_of = lambda x: next(s['name'] for s in tl['segments'] if s['start'] <= x < s['end'] + 1e-6)
    for v in tl['vo']:
        s = next(s for s in tl['segments'] if s['start'] <= v['start'] < s['end'])
        spill = v['end'] - s['end']
        flag = f'  <-- spills {spill:.2f}s past {s["name"]}' if spill > 0.4 else ''
        print(f"{v['start']:7.2f}–{v['end']:7.2f}  [{s['name']:10s}]{flag}  {v['text'][:60]}")
    print('team cards at', tl['team_cards'])
    speech = sum(v['dur'] for v in tl['vo'])
    print(f'speech {speech:.1f}s of 240s ({speech / 240:.0%})')
