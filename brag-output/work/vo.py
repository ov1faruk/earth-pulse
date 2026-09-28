#!/usr/bin/env python3
"""Generate the pitch voiceover with ElevenLabs (eleven_v3, George), line by line.

Reads timecoded lines from ../voiceover-script.md, swaps team names for the
Bengali-script spellings the team approved (native pronunciation), adds a few
v3 delivery cues, and caches each line by content hash (no credits spent twice).
Then lays the lines on a 240 s timeline and reports any overlaps.

  python3 vo.py            generate + assemble vo.wav
  python3 vo.py --dry      show the lines and character count only
"""
import hashlib, json, os, re, subprocess, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SCRIPT = os.path.join(HERE, '..', 'voiceover-script.md')
CACHE = os.path.join(HERE, 'eleven', 'lines'); os.makedirs(CACHE, exist_ok=True)
VOICE = 'JBFqnCBsd6RMkjVDRZzb'   # George
MODEL = 'eleven_v3'
SR = 44100; DUR = 240.0

NAMES = {  # on-screen spelling → spoken (Bengali script, approved by the team)
    'Mohammad Golam Faruk Ovi': 'মোহাম্মদ গোলাম ফারুক অভি',
    'Md. Zaharabi Bhuiyain Rafi': 'এম ডি জাহারাবি ভূঁইয়া রাফি',
    'Mohammad Mushfiq Us Saleheen': 'মোহাম্মদ মুশফিক উস সালেহীন',
    'Rezaul Karim Anik': 'রেজাউল করিম অনিক',
    'Rifah Tamanna': 'রিফাহ তামান্না',
}
CUES = {  # line start (s) → v3 audio tag for delivery
    1: '[softly]', 10: '[softly]', 39: '[warmly]', 77: '[quietly]', 180: '[hushed]', 231: '[softly]', 236: '[warmly]',
}

def lines():
    out = []
    for m in re.finditer(r'^\*\*(\d+):(\d{2})\*\*\s+(.+)$', open(SCRIPT, encoding='utf-8').read(), re.M):
        t = int(m.group(1)) * 60 + int(m.group(2))
        text = m.group(3).strip().replace('*', '')
        for k, v in NAMES.items(): text = text.replace(k, v)
        text = text.replace('EARTH//PULSE', 'Earth Pulse').replace('L-Band', 'L Band')
        if t in CUES: text = f'{CUES[t]} {text}'
        out.append((t, text))
    return out

def key():
    for ln in open(os.path.join(ROOT, '.env')):
        if ln.startswith('ELEVENLABS_API_KEY='): return ln.split('=', 1)[1].strip()
    raise SystemExit('ELEVENLABS_API_KEY missing in .env')

def synth(text):
    h = hashlib.sha1(f'{VOICE}|{MODEL}|{text}'.encode()).hexdigest()[:16]
    mp3 = os.path.join(CACHE, h + '.mp3')
    if not os.path.exists(mp3) or os.path.getsize(mp3) < 2000:
        body = json.dumps({'text': text, 'model_id': MODEL}, ensure_ascii=False).encode()
        r = subprocess.run(['curl', '-s', '-m', '180', '-o', mp3, '-w', '%{http_code}', '-X', 'POST',
                            f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128',
                            '-H', f'xi-api-key: {key()}', '-H', 'Content-Type: application/json; charset=utf-8', '--data-binary', '@-'],
                           input=body, capture_output=True)
        if r.stdout.decode() != '200':
            err = open(mp3, 'rb').read()[:300]; os.remove(mp3)
            raise SystemExit(f'ElevenLabs error {r.stdout.decode()}: {err}')
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp3, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
    x = np.frombuffer(pcm, np.int16).astype(np.float32) / 32767
    # trim leading/trailing silence
    nz = np.nonzero(np.abs(x) > 0.01)[0]
    return x[max(0, nz[0] - 800): nz[-1] + 2400] if len(nz) else x

def main():
    L = lines()
    total = sum(len(t) for _, t in L)
    print(f'{len(L)} lines, {total} characters')
    if '--dry' in sys.argv:
        for t, s in L: print(f'{t // 60}:{t % 60:02d}  {s}')
        return
    vo = np.zeros(int(SR * DUR), np.float32)
    report = []
    for i, (t, text) in enumerate(L):
        x = synth(text)
        start = t
        nxt = L[i + 1][0] if i + 1 < len(L) else DUR
        dur = len(x) / SR
        over = start + dur - nxt
        report.append({'t': t, 'dur': round(dur, 2), 'gap_to_next': round(nxt - t, 2), 'overrun': round(over, 2), 'text': text[:70]})
        i0 = int(start * SR); vo[i0:i0 + len(x)] += x[:len(vo) - i0]
    json.dump(report, open(os.path.join(HERE, 'eleven', 'timing.json'), 'w'), indent=1, ensure_ascii=False)
    with wave.open(os.path.join(HERE, 'vo.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(vo, -1, 1) * 32767).astype(np.int16).tobytes())
    for r in report:
        flag = '  <-- OVERRUNS NEXT LINE' if r['overrun'] > 0.15 else ''
        print(f"{r['t'] // 60}:{r['t'] % 60:02d}  {r['dur']:5.2f}s / {r['gap_to_next']:5.2f}s{flag}  {r['text']}")

if __name__ == '__main__':
    main()
