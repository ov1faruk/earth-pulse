// Sound design. Every sound is synthesised in the browser with the Web Audio
// API — there are no audio files and no AI-generated audio. Sound is OFF until
// the visitor switches it on, the choice is remembered, and all sounds are
// short and quiet. (Code written with AI assistance — see README.)
const KEY = 'earthpulse.sound';
let ctx = null, master = null, enabled = false, drone = null;
try { enabled = localStorage.getItem(KEY) === 'on'; } catch { /* private mode */ }

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  return ctx;
}
function tone({ f = 440, f2 = null, t = 0.12, type = 'sine', gain = 0.08, delay = 0, attack = 0.008 }) {
  if (!enabled || !ensure()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + t);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + t + 0.03);
}
function noise({ t = 0.6, gain = 0.05, from = 300, to = 2400 }) {
  if (!enabled || !ensure()) return;
  const n = Math.floor(ctx.sampleRate * t), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime;
  src.buffer = buf; flt.type = 'bandpass'; flt.Q.value = 1.2;
  flt.frequency.setValueAtTime(from, t0); flt.frequency.exponentialRampToValueAtTime(to, t0 + t);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + t * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  src.connect(flt); flt.connect(g); g.connect(master); src.start();
}

export const sfx = {
  tick: () => tone({ f: 1250, t: 0.045, type: 'triangle', gain: 0.045 }),
  toggle: (on) => { tone({ f: on ? 520 : 660, f2: on ? 780 : 440, t: 0.11, gain: 0.06 }); },
  open: () => { tone({ f: 330, f2: 660, t: 0.22, gain: 0.05 }); },
  whoosh: () => noise({ t: 0.9, gain: 0.035 }),
  scan: () => { for (let i = 0; i < 4; i++) tone({ f: 880 + i * 110, t: 0.06, gain: 0.03, delay: i * 0.09, type: 'triangle' }); },
  /** Result chime: calm for low scores, tense for high ones. */
  result: (score = 0) => {
    const base = score >= 75 ? 220 : score >= 50 ? 294 : score >= 25 ? 392 : 523;
    const third = score >= 50 ? 1.189 : 1.26; // minor third when the signal is high, major when low
    tone({ f: base, t: 0.5, gain: 0.07 }); tone({ f: base * third, t: 0.5, gain: 0.05, delay: 0.09 }); tone({ f: base * 1.5, t: 0.6, gain: 0.04, delay: 0.18 });
  },
  alert: () => { tone({ f: 740, t: 0.16, gain: 0.07, type: 'square' }); tone({ f: 740, t: 0.16, gain: 0.07, type: 'square', delay: 0.24 }); },
  step: (k = 0) => tone({ f: 392 * 2 ** ((k % 8) / 12), t: 0.14, gain: 0.05, type: 'triangle' }),
  /** One note per year of the warming replay: pitch follows the temperature anomaly. */
  year: (anomaly = 0) => tone({ f: 330 * 2 ** (anomaly / 1.4), t: 0.07, gain: 0.035, type: 'sine' }),
  rumble: () => { tone({ f: 70, f2: 38, t: 1.6, gain: 0.16, type: 'sawtooth', attack: 0.2 }); noise({ t: 1.6, gain: 0.05, from: 120, to: 60 }); },
};

function setDrone(on) {
  if (!ensure()) return;
  if (on && !drone) {
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(master);
    const oscs = [55, 82.5, 110.4].map((f) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(); return o; });
    g.gain.exponentialRampToValueAtTime(0.02, ctx.currentTime + 3);
    drone = { g, oscs };
  } else if (!on && drone) {
    const d = drone; drone = null;
    d.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    setTimeout(() => d.oscs.forEach((o) => o.stop()), 800);
  }
}

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  if (on) { ensure(); ctx?.resume?.().catch(() => {}); sfx.open(); }
  setDrone(on);
  document.querySelectorAll('[data-sound-toggle]').forEach(paint);
}
function paint(btn) {
  btn.setAttribute('aria-pressed', enabled);
  btn.textContent = enabled ? '♪ SOUND ON' : '♪ SOUND OFF';
  btn.title = enabled ? 'Sound is on — click to mute' : 'Turn on subtle sound effects (synthesised in your browser)';
}
/** Wire a button as the sound switch, and add light click feedback to the page. */
export function mountSoundToggle(btn) {
  if (!btn) return;
  btn.dataset.soundToggle = '1';
  paint(btn);
  btn.addEventListener('click', () => setSound(!enabled));
  // A remembered "on" can only start after a user gesture (browser autoplay rules).
  if (enabled) addEventListener('pointerdown', () => { ensure(); ctx?.resume?.().catch(() => {}); setDrone(true); }, { once: true });
}
let feedback = false;
export function clickFeedback(selector = 'button, a.btn, a.ghost-btn, .cta') {
  if (feedback) return; feedback = true;
  document.addEventListener('click', (e) => { const el = e.target.closest(selector); if (el && !el.dataset.soundToggle && !el.dataset.quiet) sfx.tick(); }, true);
}
