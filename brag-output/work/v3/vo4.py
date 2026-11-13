import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import vo, numpy as np, json
L = {
 'h1': "It's a clear morning in Punjab. The weather app says: sunny, twenty-nine degrees, no rain.",
 'h2': "But from orbit, NASA sees seventy-four fires burning within fifty kilometres. Twenty-eight days without real rain. And a week five degrees too warm.",
 'h3': "[warmly] Your weather app tells you if it will rain. Earth Pulse tells you what the weather will do.",
 'bridge': "And behind every card is NISAR: a radar that sees through cloud and night.",
 'pick': "Pick any place, and Pulse reads NASA's own measurements: rain against normal, how saturated the soil is, heat, fires, open events, and the landslide record.",
 'farmer': "A farmer sets their own limits, heavy rain, dry spells, heat, frost, and sees the moment the season crosses the line.",
 'climber': "A climber sees the warm spells and freezing nights that loosen glaciers, and the slopes that have failed before.",
 'one': "One simple card. Built on NASA data. Every number with its source.",
 'next': "Next: alerts on every phone and watch, and flood warnings measured by NISAR itself.",
 'outro': "[softly] We are The L Band. This is Earth Pulse. Watch Earth change.",
}
os.makedirs('vo4', exist_ok=True); d = {}
for k, t in L.items():
    x = vo.synth(t); np.save(f'vo4/{k}.npy', x); d[k] = round(len(x) / vo.SR, 2)
json.dump(d, open('vo4/dur.json', 'w')); print(d)
