// HOW DID NISAR KNOW? — progressive explanation that ends on real evidence.
// The animation is an explanatory diagram and is labelled SIMULATED; the final
// step shows the actual NISAR images the story is based on.
import { $, $$, esc, tag, fmtDate } from './dom.js';
import { DATA_CLASS } from '../core/dataClass.js';
import { reducedMotion } from '../globe/camera.js';

const STEPS = {
  backscatter: [
    { h: 'NISAR', p: 'A satellite 747 km up carries a radar. Unlike a camera, it brings its own light, so it works at night and sees through cloud.', scene: 'emit' },
    { h: 'RADAR SIGNAL', p: 'It sends pulses of microwave energy (L-band, ~24 cm wavelength) down and to the side toward the surface.', scene: 'travel' },
    { h: 'EARTH', p: 'Rough ground, crops and buildings scatter the pulse in all directions, and some of it comes back. Calm water acts like a mirror and bounces it away.', scene: 'hit' },
    { h: 'RETURN SIGNAL', p: 'The radar measures how much energy returns from each spot. Strong return shows up bright; weak return shows up dark. Open water is usually dark.', scene: 'return' },
    { h: 'MEASURABLE CHANGE', p: 'NISAR passes over the same place every 12 days from the same orbit. Comparing passes shows where dark, water-like areas appeared or disappeared.', term: 'SCIENTIFIC TERM · SAR backscatter change: the pattern and amount of returning radar energy changed.', scene: 'evidence' },
  ],
  interferometry: [
    { h: 'NISAR', p: 'The radar records not only how strong each echo is, but also its phase: exactly where in its wave cycle the echo arrives.', scene: 'emit' },
    { h: 'RADAR SIGNAL', p: 'The wave travels to the ground and back. The number of wavelengths in that round trip depends on the exact distance.', scene: 'travel' },
    { h: 'EARTH', p: 'Twelve or more days later, NISAR comes back to almost the same point in space. If the ground moved even a few centimetres toward or away from it, the round trip changes length.', scene: 'hit' },
    { h: 'RETURN SIGNAL', p: 'That change shifts the phase of the echo. Comparing the two passes pixel by pixel gives a phase-difference map.', scene: 'return' },
    { h: 'MEASURABLE CHANGE', p: 'Each full colour cycle in the map is a contour of equal movement along the radar’s line of sight. Tight rings mean the ground deformed strongly.', term: 'SCIENTIFIC TERM · Interferometric SAR (InSAR): line-of-sight surface displacement from phase differences.', scene: 'evidence' },
  ],
  polarization: [
    { h: 'NISAR', p: 'The radar sends waves that vibrate horizontally (H) and can listen for echoes vibrating horizontally (H) or vertically (V).', scene: 'emit' },
    { h: 'RADAR SIGNAL', p: 'Pulses reach fields that change through the year: bare soil, flooded paddies, growing stems and leaves.', scene: 'travel' },
    { h: 'EARTH', p: 'Plants twist the wave. Leaves and stems return some energy rotated to V (“cross-pol”, HV). Flat water or bare soil mostly do not.', scene: 'hit' },
    { h: 'RETURN SIGNAL', p: 'In these images, magenta means strong HH (same-polarization) return and green means strong HV (cross-polarization) return.', scene: 'return' },
    { h: 'MEASURABLE CHANGE', p: 'As crops are planted, grow and are harvested, the HH/HV mix changes. That is why whole regions change colour between dates.', term: 'SCIENTIFIC TERM · Polarimetric backscatter (GCOV): HH and HV intensity on a map grid.', scene: 'evidence' },
  ],
  forest: [
    { h: 'NISAR', p: 'NISAR’s L-band radar has a long wavelength (~24 cm). It passes through clouds, and partly through leaves.', scene: 'emit' },
    { h: 'RADAR SIGNAL', p: 'Pulses enter the forest canopy instead of only bouncing off the top.', scene: 'travel' },
    { h: 'EARTH', p: 'Inside the forest, trunks and branches scatter the wave many times, so a lot of energy returns. Where trees were removed, much less comes back.', scene: 'hit' },
    { h: 'RETURN SIGNAL', p: 'Intact forest looks uniformly bright. Cleared land looks darker and more patchy.', scene: 'return' },
    { h: 'MEASURABLE CHANGE', p: 'Mapping bright and dark areas reveals where forest stands and where it was cleared, even under the Amazon’s frequent cloud cover.', term: 'SCIENTIFIC TERM · L-band volume scattering / cross-polarized backscatter.', scene: 'evidence' },
  ],
};

function drawScene(ctx, W, H, t, scene, kind) {
  ctx.clearRect(0, 0, W, H);
  // backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#050a14'); bg.addColorStop(0.7, '#08111f'); bg.addColorStop(1, '#0a1624');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * W, y = (Math.sin(i * 37.3) * 0.5 + 0.5) * H * 0.55;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.3 * ((i * 13) % 7) / 7})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  const groundY = H * 0.74;
  const sat = { x: W * 0.22, y: H * 0.16 };
  const target = { x: W * 0.62, y: groundY };
  const waterX = W * 0.66;

  // ground
  ctx.fillStyle = '#12202b';
  ctx.fillRect(0, groundY, W, H - groundY);
  if (kind === 'backscatter') {
    ctx.fillStyle = '#0e3a52'; ctx.fillRect(waterX, groundY, W - waterX, H - groundY);
    ctx.strokeStyle = 'rgba(127,230,255,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(waterX, groundY); ctx.lineTo(W, groundY); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,215,225,.6)';
    ctx.beginPath(); ctx.moveTo(0, groundY);
    for (let x = 0; x < waterX; x += 8) ctx.lineTo(x, groundY - (Math.sin(x * 0.7) * 4 + Math.sin(x * 0.13) * 5));
    ctx.stroke();
    ctx.font = '500 11px Inter Tight, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText('ROUGH LAND', W * 0.1, groundY + 26); ctx.fillText('CALM WATER', waterX + 14, groundY + 26);
  } else if (kind === 'forest' || kind === 'polarization') {
    const n = kind === 'forest' ? 26 : 40;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (W / n);
      const cleared = kind === 'forest' && x > waterX;
      if (cleared) continue;
      const h = kind === 'forest' ? 42 + (i % 3) * 10 : 16 + (i % 4) * 3;
      ctx.strokeStyle = kind === 'forest' ? 'rgba(120,90,60,.9)' : 'rgba(155,225,93,.8)';
      ctx.lineWidth = kind === 'forest' ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x, groundY - h); ctx.stroke();
      if (kind === 'forest') { ctx.fillStyle = 'rgba(40,120,70,.85)'; ctx.beginPath(); ctx.arc(x, groundY - h, 12, 0, Math.PI * 2); ctx.fill(); }
    }
    if (kind === 'forest') { ctx.font = '500 11px Inter Tight'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText('FOREST', W * 0.1, groundY + 26); ctx.fillText('CLEARED', waterX + 14, groundY + 26); }
  }
  // interferometry: ground bulge that grows over time
  let lift = 0;
  if (kind === 'interferometry') {
    lift = scene === 'hit' || scene === 'return' || scene === 'evidence' ? 10 + 6 * Math.sin(t * 1.5) : 0;
    ctx.strokeStyle = 'rgba(255,95,162,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, groundY - lift * Math.exp(-(((x - target.x) / (W * 0.12)) ** 2)));
    ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke(); ctx.setLineDash([]);
  }

  // satellite
  const bob = Math.sin(t * 1.2) * 2;
  ctx.save(); ctx.translate(sat.x, sat.y + bob);
  ctx.fillStyle = '#dfe8f0'; ctx.fillRect(-8, -6, 16, 12);
  ctx.fillStyle = '#2d4f7a'; ctx.fillRect(-38, -4, 26, 8); ctx.fillRect(12, -4, 26, 8);
  ctx.strokeStyle = 'rgba(127,230,255,.9)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(10, 18, 18, 6, 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.font = '600 12px Inter Tight'; ctx.fillStyle = '#fff'; ctx.fillText('NISAR', sat.x - 18, sat.y - 18);
  if (kind === 'interferometry' && scene !== 'emit') {
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = '500 10px Inter Tight';
    ctx.fillText('PASS 1 · PASS 2 (12+ DAYS LATER)', sat.x - 40, sat.y - 34);
  }

  const dx = target.x - sat.x, dy = target.y - lift - sat.y;
  const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const order = ['emit', 'travel', 'hit', 'return', 'evidence'];
  const si = order.indexOf(scene);
  // outgoing wavefronts
  if (si >= 1 || scene === 'emit') {
    const count = scene === 'emit' ? 1 : 5;
    for (let k = 0; k < count; k++) {
      const ph = ((t * 0.45 + k / count) % 1);
      const r = ph * len;
      ctx.strokeStyle = `rgba(127,230,255,${0.85 * (1 - ph)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sat.x, sat.y, r, Math.atan2(uy, ux) - 0.18, Math.atan2(uy, ux) + 0.18); ctx.stroke();
    }
  }
  if (kind === 'interferometry' && si >= 1) {
    // the wave along the path, with phase set by the path length
    ctx.strokeStyle = 'rgba(127,230,255,.7)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let s = 0; s <= len; s += 2) {
      const w = Math.sin((s / 22) * Math.PI * 2 - t * 4) * 6;
      const x = sat.x + ux * s - uy * w, y = sat.y + uy * s + ux * w;
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  // returns
  if (si >= 3) {
    if (kind === 'backscatter') {
      for (let k = 0; k < 4; k++) {
        const ph = ((t * 0.5 + k / 4) % 1);
        const px = W * 0.35 - ux * ph * len * 0.5, py = groundY - uy * ph * len * 0.8;
        ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - ph)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 10 + ph * 12, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(127,230,255,.6)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(waterX + 30, groundY); ctx.lineTo(W - 10, groundY - (W - waterX - 40) * (uy / ux)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '500 11px Inter Tight';
      ctx.fillText('STRONG ECHO → BRIGHT', W * 0.12, groundY - 80);
      ctx.fillText('ECHO BOUNCES AWAY → DARK', waterX - 10, groundY - 120);
    } else if (kind === 'polarization') {
      ctx.lineWidth = 2.5;
      [['#ff5fa2', 'HH', 0], ['#9be15d', 'HV', 1]].forEach(([c, l, j]) => {
        const ph = (t * 0.5 + j * 0.5) % 1;
        const px = target.x - ux * ph * len, py = target.y - uy * ph * len;
        ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(px + j * 14, py, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = c; ctx.font = '600 11px Inter Tight'; ctx.fillText(l, px + j * 14 + 12, py + 4);
      });
    } else if (kind === 'forest') {
      for (let k = 0; k < 5; k++) {
        const ph = ((t * 0.5 + k / 5) % 1);
        ctx.strokeStyle = `rgba(155,225,93,${0.8 * (1 - ph)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(W * 0.3 - ux * ph * 160, groundY - 50 - uy * ph * 160, 12, Math.PI, Math.PI * 1.6); ctx.stroke();
      }
    } else if (kind === 'interferometry') {
      const cx = W * 0.8, cy = H * 0.36;
      for (let r = 34; r > 4; r -= 6) {
        ctx.strokeStyle = `hsl(${(r * 11 + t * 90) % 360}, 80%, 65%)`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '500 10px Inter Tight'; ctx.fillText('PHASE DIFFERENCE', cx - 44, cy + 52);
    }
  }
}

export function createKnow({ el, onScience, onClose }) {
  let raf = null, timer = null, step = 0, story = null;

  function stopAnim() { if (raf) cancelAnimationFrame(raf); raf = null; if (timer) clearInterval(timer); timer = null; }

  function open(s, { autoplay = true } = {}) {
    story = s;
    step = 0;
    const kind = s.radarExplainer || 'backscatter';
    const steps = STEPS[kind];
    const b = s.timeline[s.beforeIndex], a = s.timeline[s.afterIndex];
    el.innerHTML = `<div class="know-inner">
      <div>
        <div class="know-stage"><canvas width="880" height="760" aria-hidden="true"></canvas>
          <span class="stage-tag">${tag(DATA_CLASS.SIMULATED, 'SIMULATED VISUALIZATION · DIAGRAM, NOT DATA')}</span></div>
      </div>
      <div>
        <div style="font-size:10.5px;letter-spacing:.34em;color:var(--ink-3);margin-bottom:8px">${esc(s.location.name.toUpperCase())} · ${esc(s.humanTitle)}</div>
        <h2>HOW DID NISAR KNOW?</h2>
        <div class="know-steps" role="list">
          ${steps.map((st, i) => `<button class="step" data-i="${i}" role="listitem"><h4>${String(i + 1).padStart(2, '0')} · ${esc(st.h)}</h4><p>${esc(st.p)}</p>
            ${st.term ? `<div class="term">${esc(st.term)}</div>` : ''}
            ${st.scene === 'evidence' ? `<div class="evidence" hidden>
              <div style="display:flex;gap:8px;margin-top:10px">
                <figure style="margin:0;flex:1"><img class="evidence-img" src="${b.image}" alt="NISAR image ${esc(b.label)}"><figcaption class="mono" style="font-size:10px;color:var(--ink-3);margin-top:4px">BEFORE · ${esc(b.label)}</figcaption></figure>
                <figure style="margin:0;flex:1"><img class="evidence-img" src="${a.image}" alt="NISAR image ${esc(a.label)}"><figcaption class="mono" style="font-size:10px;color:var(--ink-3);margin-top:4px">AFTER · ${esc(a.label)}</figcaption></figure>
              </div><div style="margin-top:8px">${tag(DATA_CLASS.REAL_NISAR, 'REAL NISAR EVIDENCE')}</div></div>` : ''}
          </button>`).join('')}
        </div>
        <div class="know-foot">
          <button class="btn primary" data-act="science">SHOW TECHNICAL DATA</button>
          <button class="btn" data-act="close">BACK TO THE STORY</button>
        </div>
      </div></div>`;
    el.hidden = false;
    const canvas = $('canvas', el);
    const ctx = canvas.getContext('2d');
    const t0 = performance.now();
    const loop = () => {
      const t = reducedMotion() ? 2 : (performance.now() - t0) / 1000;
      drawScene(ctx, canvas.width, canvas.height, t, steps[step].scene, kind);
      if (!reducedMotion()) raf = requestAnimationFrame(loop);
    };
    const select = (i) => {
      step = i;
      $$('.step', el).forEach((n, j) => n.classList.toggle('on', j === i));
      const ev = $('.evidence', el);
      if (ev) ev.hidden = steps[i].scene !== 'evidence';
      if (reducedMotion()) loop();
    };
    $$('.step', el).forEach((n) => (n.onclick = () => { if (timer) clearInterval(timer); timer = null; select(Number(n.dataset.i)); }));
    el.onclick = (e) => {
      const a2 = e.target.closest('[data-act]');
      if (!a2) return;
      if (a2.dataset.act === 'science') { close(); onScience?.(); }
      if (a2.dataset.act === 'close') close();
    };
    select(0);
    loop();
    if (autoplay) timer = setInterval(() => { if (step < steps.length - 1) select(step + 1); else { clearInterval(timer); timer = null; } }, reducedMotion() ? 6000 : 4200);
    $('.step', el)?.focus();
    return { select, steps: steps.length };
  }

  function close() {
    stopAnim();
    el.hidden = true;
    el.innerHTML = '';
    onClose?.();
  }

  return { open, close, get isOpen() { return !el.hidden; }, get story() { return story; } };
}
