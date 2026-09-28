#!/usr/bin/env python3
"""Mix the ElevenLabs voiceover over the epic score, following timeline.json.
Voice: tempo 1.06 (pitch kept), high-pass, gentle compression, level-matched,
light warm reverb. Music: ducked ~8 dB under speech (smooth attack/release)."""
import json, os, subprocess, wave
import numpy as np
import vo

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100; N = int(SR * 240)
TL = json.load(open(os.path.join(HERE, 'timeline.json')))

def read_wav(p):
    with wave.open(p) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32767
        return x.reshape(-1, w.getnchannels())

def line_audio(text):
    import hashlib
    h = hashlib.sha1(f'{vo.VOICE}|{vo.MODEL}|{text}'.encode()).hexdigest()[:16]
    mp3 = os.path.join(vo.CACHE, h + '.mp3')
    af = f"atempo={TL['tempo']},highpass=f=75,acompressor=threshold=-22dB:ratio=2.5:attack=8:release=160:makeup=2"
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp3, '-af', af, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
    x = np.frombuffer(pcm, np.int16).astype(np.float32) / 32767
    nz = np.nonzero(np.abs(x) > 0.01)[0]
    x = x[max(0, nz[0] - 600): nz[-1] + 2000] if len(nz) else x
    rms = np.sqrt(np.mean(x[np.abs(x) > 0.02] ** 2)) if (np.abs(x) > 0.02).any() else 0.1
    return x * (0.16 / rms)          # consistent speech level across lines

voice = np.zeros(N, np.float32)
for v in TL['vo']:
    x = line_audio(v['text'])
    i0 = int(v['start'] * SR); voice[i0:i0 + len(x)] += x[:N - i0]
# light, warm room (short early reflections + soft tail) so the voice sits inside the music
ir_n = int(0.9 * SR); rng = np.random.default_rng(5)
ir = rng.standard_normal(ir_n) * np.exp(-np.linspace(0, 9, ir_n)); ir = np.convolve(ir, np.ones(30) / 30, 'same'); ir /= np.sqrt((ir ** 2).sum())
size = 1 << int(np.ceil(np.log2(N + ir_n)))
wet = np.fft.irfft(np.fft.rfft(voice, size) * np.fft.rfft(ir, size), size)[:N].astype(np.float32)
voice_st = np.stack([voice + wet * 0.10, voice + wet * 0.12], 1)

# ducking envelope from the dry voice
frame = int(0.02 * SR)
env = np.sqrt(np.convolve(voice ** 2, np.ones(frame) / frame, 'same'))
active = np.clip(env / 0.03, 0, 1)
g = np.empty(N, np.float32); cur = 0.0
att, rel = np.exp(-1 / (0.08 * SR)), np.exp(-1 / (0.55 * SR))
for i in range(0, N, 64):                      # block-wise smoothing (fast enough, smooth enough)
    tgt = active[i]
    coef = att if tgt > cur else rel
    cur = tgt + (cur - tgt) * coef ** 64
    g[i:i + 64] = cur
duck_db = -8.0
music_gain = 10 ** (duck_db * g / 20)

music = read_wav(os.path.join(HERE, 'score_pitch_vo.wav'))[:N]
mix = music * music_gain[:, None] * 0.78 + voice_st
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix /= np.abs(mix).max() / 0.89
with wave.open(os.path.join(HERE, 'final_mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())

# report: speech vs music level in a few spots
def db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
for name, (a, b) in TL['cues']['segments'].items():
    sl = slice(int(a * SR), int(b * SR))
    sp = voice[sl]; mask = np.abs(sp) > 0.02
    print(f"{name:11s} mix {db(mix[sl].mean(1)):6.1f} dBFS | voice-active {mask.mean():4.0%} | music under voice {db((music[sl].mean(1) * music_gain[sl])[mask]) if mask.any() else float('nan'):6.1f} dB")
print('wrote final_mix.wav')
