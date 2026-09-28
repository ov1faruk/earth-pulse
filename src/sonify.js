// LISTEN TO THE CHANGE — sonification of a Change Engine result.
// The map is scanned west → east. In each column, the share of pixels that got
// darker drives a low voice and the share that got brighter drives a high
// voice; silence means nothing changed there. The sound is derived only from
// the computed change map (an accessibility aid, and literally "dancing with
// the SARs").
import { toast } from './ui/dom.js';

let ctx = null;
let playing = null;

export function stopSonify() {
  if (playing) { playing.stop(); playing = null; }
}

export async function sonifyChange(result, { seconds = 8, onColumn } = {}) {
  stopSonify();
  if (!result) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
  } catch {
    toast('Audio is not available in this browser.');
    return;
  }
  const { W, H } = result.grid;
  const cols = 64;
  const series = [];
  for (let c = 0; c < cols; c++) {
    const x0 = Math.floor((c / cols) * W), x1 = Math.floor(((c + 1) / cols) * W);
    let v = 0, up = 0, dn = 0;
    for (let y = 0; y < H; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = y * W + x;
      if (!result.valid[i]) continue;
      v++;
      if (result.cls[i] > 0) up++; else if (result.cls[i] < 0) dn++;
    }
    series.push({ up: v ? up / v : 0, dn: v ? dn / v : 0 });
  }
  const t0 = ctx.currentTime + 0.1;
  const step = seconds / cols;
  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  const nodes = [];
  const voice = (type, base) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = base;
    g.gain.value = 0;
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + seconds + 0.3);
    nodes.push(o);
    return { o, g };
  };
  const low = voice('sine', 110), high = voice('triangle', 440);
  series.forEach((s, i) => {
    const t = t0 + i * step;
    const dl = Math.min(1, s.dn * 6), bl = Math.min(1, s.up * 6);
    low.g.gain.linearRampToValueAtTime(dl * 0.9, t);
    low.o.frequency.linearRampToValueAtTime(90 + dl * 130, t);
    high.g.gain.linearRampToValueAtTime(bl * 0.55, t);
    high.o.frequency.linearRampToValueAtTime(380 + bl * 520, t);
  });
  low.g.gain.linearRampToValueAtTime(0, t0 + seconds + 0.2);
  high.g.gain.linearRampToValueAtTime(0, t0 + seconds + 0.2);
  // Visual sync callback for a scan line.
  let raf = null;
  const startWall = performance.now() + 100;
  const tick = () => {
    const k = (performance.now() - startWall) / (seconds * 1000);
    if (k >= 0 && k <= 1) onColumn?.(k);
    if (k < 1.05) raf = requestAnimationFrame(tick); else onColumn?.(null);
  };
  raf = requestAnimationFrame(tick);
  playing = {
    stop() {
      cancelAnimationFrame(raf);
      onColumn?.(null);
      nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
      master.disconnect();
    },
  };
}
