#!/usr/bin/env python3
"""Prepare the film's CHANGE ANYWHERE scene from a real NISAR pair.

  python3 prep_change.py radar            # top Global Change Radar hotspot
  python3 prep_change.py radar <rank>     # n-th hotspot
Writes film.json (+ after.png, changemap.png). Uses the exact browser engine
(src/core/changeEngine.js) via Node, and the pipeline's georeferencing.
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import build_stories as bs  # noqa: E402

def load(g):
    url = f"{bs.BROWSE_BASE}/{g['coll']}/{g['id']}/{g['id']}_LATLON.png"
    p = bs.cached(url, '.png')
    im = Image.open(p).convert('RGBA')
    if im.width > 1600: im = im.resize((1600, int(im.height * 1600 / im.width)), Image.LANCZOS)
    a = np.asarray(im).astype(np.uint8).copy()
    rgb = a[..., :3].astype(np.float32)
    valid = (rgb.max(axis=2) > 0) & (a[..., 3] > 0)
    w, s, e, n, res_px, res_km, _ = bs.georeference(valid, bs.parse_wkt_polygon('POLYGON((' + ','.join(f'{x} {y}' for x, y in g['ring'] + [g['ring'][0]]) + '))'))
    a[..., 3] = np.where(valid, 255, 0)
    return a, rgb.mean(axis=2).astype(np.float32), valid.astype(np.uint8), (w, s, e, n), res_km

def main():
    rank = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == 'radar' else 0
    if sys.argv[1] == 'story':  # python3 prep_change.py story <story-id> <i> <j>
        m = json.load(open(os.path.join(ROOT, 'public', 'data', 'stories', sys.argv[2], 'manifest.json')))
        fa, fb = m['frames'][int(sys.argv[3])], m['frames'][int(sys.argv[4])]
        g = lambda f: {'id': f['id'], 't': f['acquisitionStart'], 'coll': f['collection'], 'ring': f['footprint']}
        h = {'from': g(fa), 'to': g(fb), 'track': fa['track'], 'lon': 0, 'lat': 0}
        rank = 0
    else:
        R = json.load(open(os.path.join(ROOT, 'public', 'data', 'change', 'radar.json')))
        h = R['hotspots'][rank]
    A = load(h['from']); B = load(h['to'])
    work = os.path.join(HERE, 'chg'); os.makedirs(work, exist_ok=True)
    meta = []
    for k, (a, lum, valid, rect, _) in (('A', A), ('B', B)):
        lum.tofile(f'{work}/{k}.lum'); valid.tofile(f'{work}/{k}.valid')
        meta.append({'k': k, 'W': int(lum.shape[1]), 'H': int(lum.shape[0]), 'rect': dict(zip(('west', 'south', 'east', 'north'), rect))})
    json.dump(meta, open(f'{work}/meta.json', 'w'))
    js = f"""
import fs from 'node:fs';
import {{ computeChange, changeToRGBA }} from '{ROOT}/src/core/changeEngine.js';
const S = '{work}';
const meta = JSON.parse(fs.readFileSync(S + '/meta.json'));
const ld = (m) => ({{ W: m.W, H: m.H, rect: m.rect, lum: new Float32Array(fs.readFileSync(S + '/' + m.k + '.lum').buffer.slice(0)), valid: new Uint8Array(fs.readFileSync(S + '/' + m.k + '.valid')) }});
const r = computeChange(ld(meta[0]), ld(meta[1]));
fs.writeFileSync(S + '/map.rgba', Buffer.from(changeToRGBA(r).buffer));
fs.writeFileSync(S + '/cls.bin', Buffer.from(r.cls.buffer));
fs.writeFileSync(S + '/valid.bin', Buffer.from(r.valid.buffer));
fs.writeFileSync(S + '/result.json', JSON.stringify({{ grid: r.grid, stats: r.stats, hotspots: r.hotspots }}));
"""
    open(f'{work}/run.mjs', 'w').write(js)
    subprocess.run(['node', f'{work}/run.mjs'], check=True)
    res = json.load(open(f'{work}/result.json'))
    g = res['grid']; Wg, Hg = g['W'], g['H']
    Image.fromarray(np.fromfile(f'{work}/map.rgba', np.uint8).reshape(Hg, Wg, 4), 'RGBA').save(os.path.join(HERE, 'changemap.png'))
    Image.fromarray(B[0], 'RGBA').save(os.path.join(HERE, 'after.png'))
    # sonification series — same algorithm as src/sonify.js (64 columns, every 2nd pixel)
    cls = np.fromfile(f'{work}/cls.bin', np.int8).reshape(Hg, Wg); val = np.fromfile(f'{work}/valid.bin', np.uint8).reshape(Hg, Wg)
    ser = []
    for c in range(64):
        x0, x1 = int(c / 64 * Wg), int((c + 1) / 64 * Wg)
        v = val[::2, x0:x1:2].astype(bool); cc = cls[::2, x0:x1:2]
        nv = int(v.sum())
        ser.append({'up': float(((cc > 0) & v).sum() / nv) if nv else 0.0, 'dn': float(((cc < 0) & v).sum() / nv) if nv else 0.0})
    hs = res['hotspots'][0] if res['hotspots'] else {'lon': h['lon'], 'lat': h['lat']}
    span_deg = max(g['east'] - g['west'], g['north'] - g['south'])
    import datetime as dt
    fmt = lambda s: dt.datetime.fromisoformat(s[:19]).strftime('%-d %b').upper()
    days = round((dt.datetime.fromisoformat(h['to']['t'][:19]) - dt.datetime.fromisoformat(h['from']['t'][:19])).total_seconds() / 86400)
    lat, lon = (g['north'] + g['south']) / 2, (g['east'] + g['west']) / 2
    film = {
        'change': {
            'lon': lon, 'lat': lat, 'zoomR': round(950 * 57.2958 / span_deg, 1),  # orthographic: frame spans ~950 px
            'after': os.path.join(HERE, 'after.png'), 'afterRect': list(B[3]),
            'map': os.path.join(HERE, 'changemap.png'), 'mapRect': [g['west'], g['south'], g['east'], g['north']],
            'coord': f"{abs(lat):.2f}° {'N' if lat >= 0 else 'S'}, {abs(lon):.2f}° {'E' if lon >= 0 else 'W'}",
            'place': os.environ.get('PLACE', 'NISAR change hotspot #%d' % (rank + 1)),
            'track': h['track'], 'from': fmt(h['from']['t']), 'to': fmt(h['to']['t']), 'days': days,
            'darkerKm2': res['stats']['darkerKm2'], 'brighterKm2': res['stats']['brighterKm2'],
            'granules': [h['from']['id'], h['to']['id']], 'georefKm': [A[4], B[4]],
        },
        'sonify': {'series': ser},
    }
    json.dump(film, open(os.path.join(HERE, 'film.json'), 'w'), indent=1)
    print(json.dumps(film['change'], indent=1))

if __name__ == '__main__':
    main()
