// Motion layer for the story page: everything that moves on its own.
// It only animates real data that the chapters already rendered — it never
// creates numbers. All of it is skipped when the visitor prefers reduced motion.
// (Written with AI assistance — see README → AI disclosure.)
import './motion.css';
import { $, $$, esc } from './lib.js';
import { NEPAL } from './data.js';
import { sfx, mountSoundToggle, clickFeedback } from '../platform/sound.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const onVisible = (node, fn, opts = { threshold: 0.35 }) => {
  const io = new IntersectionObserver((es) => es.forEach((e) => fn(e.isIntersecting, e.target)), opts);
  io.observe(node);
  return io;
};
/** Wait until `sel` exists and `ready(node)` is true, then run fn once. */
function whenReady(sel, ready, fn) {
  const tryNow = () => { const n = $(sel); if (n && ready(n)) { fn(n); return true; } return false; };
  if (tryNow()) return;
  const mo = new MutationObserver(() => { if (tryNow()) mo.disconnect(); });
  mo.observe(document.body, { childList: true, subtree: true });
}

// ---------- charts draw themselves when they scroll into view ----------
function chartsInMotion() {
  const seen = new WeakSet();
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('play'); io.unobserve(e.target); } }), { threshold: 0.25 });
  const scan = () => $$('.chart').forEach((c) => { if (!seen.has(c)) { seen.add(c); io.observe(c); } });
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}

// ---------- hero: parallax and a heartbeat trace ----------
function hero() {
  const copy = $('.hero-copy'), hero = $('.hero');
  hero.insertAdjacentHTML('beforeend', '<svg class="ecg" viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M0,50 H300 l12,-6 l10,6 h40 l8,10 l10,-52 l12,70 l10,-28 h50 q14,-22 30,0 H640 l12,-6 l10,6 h40 l8,10 l10,-52 l12,70 l10,-28 h50 q14,-22 30,0 H1200"/></svg>');
  if (REDUCED) return;
  addEventListener('scroll', () => {
    const y = Math.min(scrollY, innerHeight);
    copy.style.transform = `translateY(${y * 0.22}px)`;
    copy.style.opacity = String(1 - y / (innerHeight * 0.8));
  }, { passive: true });
}

// ---------- 02: replay the warming, year by year ----------
function warmingReplay() {
  whenReady('#stripes', (n) => n.children.length > 100, (host) => {
    const read = $('#stripes-read');
    const bars = [...host.children];
    const ctl = document.createElement('div');
    ctl.className = 'replay';
    ctl.innerHTML = '<button class="btn small" id="stripes-play">▶ Replay 1880 → today</button><span class="replay-year mono" id="stripes-year"></span>';
    read.after(ctl);
    let timer = null;
    const stop = () => { clearInterval(timer); timer = null; bars.forEach((b) => b.classList.remove('off', 'now')); $('#stripes-play').textContent = '▶ Replay 1880 → today'; };
    const play = () => {
      if (timer) return stop();
      let k = 0;
      bars.forEach((b) => b.classList.add('off'));
      $('#stripes-play').textContent = '❚❚ Stop';
      timer = setInterval(() => {
        if (k >= bars.length) { clearInterval(timer); timer = null; bars.at(-1).classList.remove('now'); $('#stripes-play').textContent = '▶ Replay 1880 → today'; return; }
        bars[k - 1]?.classList.remove('now');
        bars[k].classList.remove('off'); bars[k].classList.add('now');
        if (k % 2 === 0) sfx.year(Number((bars[k].title.match(/([+-]?[\d.]+) °C/) || [])[1]) || 0);
        const [year, rest] = bars[k].title.split(': ');
        $('#stripes-year').innerHTML = `<b>${esc(year)}</b> ${esc(rest || '')}`;
        k++;
      }, 55);
    };
    $('#stripes-play').addEventListener('click', play);
    if (!REDUCED) { let done = false; onVisible(host, (vis) => { if (vis && !done) { done = true; play(); } }, { threshold: 0.6 }); }
  });
}

// ---------- 05: before/after sweeps by itself until you take over ----------
function autoSweep() {
  if (REDUCED) return;
  whenReady('#ba', (n) => !!n.querySelector('img'), (ba) => {
    let user = false, vis = false, raf = 0;
    const t0 = performance.now();
    ba.addEventListener('pointerdown', () => { user = true; }, { once: true });
    $('#ba-views')?.addEventListener('click', () => { user = false; });
    const tick = (t) => {
      if (vis && !user) ba.style.setProperty('--split', `${50 + 34 * Math.sin((t - t0) / 1900)}%`);
      raf = requestAnimationFrame(tick);
    };
    onVisible(ba, (v) => { vis = v; if (v && !raf) raf = requestAnimationFrame(tick); }, { threshold: 0.4 });
  });
}

// ---------- 05: replay the recorded sequence on the map ----------
function floodReplay() {
  whenReady('#areamap', (n) => n.querySelectorAll('.pt').length > 5, (map) => {
    const b = NEPAL.regionBox;
    const pos = (p) => [((p.lon - b.west) / (b.east - b.west)) * 100, ((b.north - p.lat) / (b.north - b.south)) * 100];
    const route = NEPAL.places.filter((p) => p.kind !== 'ref');
    const pts = route.map(pos);
    map.insertAdjacentHTML('beforeend', '<span class="front" id="front" hidden></span><div class="replay-clock glass" id="replay-clock" hidden></div>');
    map.querySelector('svg').insertAdjacentHTML('beforeend', `<polyline id="front-trail" points="" fill="none" stroke="#ff4d6d" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`);
    $('#areamap-note').insertAdjacentHTML('afterbegin', '<div class="replay"><button class="btn small primary" id="flood-play">▶ Replay the flood</button><span class="replay-note">Replays the recorded sequence. Only the first leg has a published time (7 minutes to the border crossing); downstream arrival times were not published, so that part shows order, not timing.</span></div>');
    const front = $('#front'), clock = $('#replay-clock'), trail = $('#front-trail');
    const dots = [...map.querySelectorAll('.pt')].filter((d) => !d.classList.contains('ref'));
    let raf = 0;
    const play = () => {
      cancelAnimationFrame(raf);
      dots.forEach((d) => d.classList.add('dim'));
      front.hidden = false; clock.hidden = false;
      sfx.rumble();
      const LEG1 = 4200, REST = 1500; // ms of animation per leg
      const t0 = performance.now();
      const step = (t) => {
        const el = t - t0;
        let leg, k;
        if (el < LEG1) { leg = 0; k = el / LEG1; } else { leg = 1 + Math.floor((el - LEG1) / REST); k = ((el - LEG1) % REST) / REST; }
        if (leg >= pts.length - 1) {
          front.hidden = true; dots.forEach((d) => d.classList.remove('dim'));
          trail.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
          clock.innerHTML = '<b>250 km</b> victims were carried as far as Nawalparasi and into India';
          return;
        }
        const [x0, y0] = pts[leg], [x1, y1] = pts[leg + 1];
        const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
        front.style.left = `${x}%`; front.style.top = `${y}%`;
        trail.setAttribute('points', pts.slice(0, leg + 1).map((p) => p.join(',')).join(' ') + ` ${x},${y}`);
        dots.forEach((d, i) => { if (i <= leg) d.classList.remove('dim'); });
        if (leg === 0) { const sec = Math.round(k * 420); clock.innerHTML = `<b>08:${String(37 + Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}</b> collapse → border crossing · recorded: 7 minutes`; }
        else clock.innerHTML = `<b>${esc(route[leg + 1].name.split(' —')[0])}</b> downstream order · time not published`;
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    $('#flood-play').addEventListener('click', play);
    if (!REDUCED) { let done = false; onVisible(map, (v) => { if (v && !done) { done = true; play(); } }, { threshold: 0.6 }); }
  });
}

// ---------- 06: the satellite time-lapse starts on its own ----------
function autoTimelapse() {
  if (REDUCED) return;
  whenReady('#viewer-play', () => true, () => {
    let started = false;
    onVisible($('#event'), (v) => {
      const btn = $('#viewer-play');
      if (v && !started && btn && /Play/.test(btn.textContent)) { started = true; btn.click(); }
    }, { threshold: 0.5 });
  });
}

// ---------- 08: scenario gauges (animated views of the published numbers) ----------
function gauges() {
  const watch = (sel, re, build, update) => whenReady(`${sel} .out`, (n) => re.test(n.textContent), (out) => {
    out.closest('.sim').querySelector('.chart-host').insertAdjacentHTML('afterend', build);
    const apply = () => { const m = out.textContent.match(re); if (m) update(Number(m[1]), out.closest('.sim')); };
    apply();
    new MutationObserver(apply).observe(out, { childList: true, characterData: true, subtree: true });
  });
  watch('#sim-sea', /\+(\d+) cm/, '<div class="tank" aria-hidden="true"><div class="tank-water"><svg viewBox="0 0 400 20" preserveAspectRatio="none"><path d="M0,10 q50,-12 100,0 t100,0 t100,0 t100,0 v10 h-400z"/></svg></div><span class="tank-mark" style="bottom:45.5%">50 cm</span><span class="tank-mark" style="bottom:91%">1 m</span><span class="tank-now"></span></div>',
    (cm, sim) => { sim.querySelector('.tank-water').style.height = `${Math.min(100, (cm / 110) * 100)}%`; sim.querySelector('.tank-now').textContent = `+${cm} cm by 2100`; });
  watch('#sim-temp', /\+([\d.]+) °C/, '<div class="thermo" aria-hidden="true"><div class="thermo-fill"></div><span style="left:25%">1.5°</span><span style="left:33.3%">2°</span><span style="left:50%">3°</span><span style="left:66.6%">4°</span></div>',
    (deg, sim) => { sim.querySelector('.thermo-fill').style.width = `${Math.min(100, (deg / 6) * 100)}%`; });
}

// ---------- 03 + 08: mission-control sweeps ----------
function sweeps() {
  whenReady('#riskmap', (n) => n.children.length > 5, (map) => { if (!map.querySelector('.sweep')) map.insertAdjacentHTML('afterbegin', '<span class="sweep" aria-hidden="true"></span>'); new MutationObserver(() => { if (!map.querySelector('.sweep')) map.insertAdjacentHTML('afterbegin', '<span class="sweep" aria-hidden="true"></span>'); }).observe(map, { childList: true }); });
}

export function initMotion() {
  document.documentElement.classList.add('motion');
  mountSoundToggle($('#btn-sound'));
  clickFeedback('button, a.btn, .cta, .topnav a');
  // A soft note each time a new chapter takes over the screen.
  let chapter = 0;
  new MutationObserver(() => { const on = $$('#rail a').findIndex((a) => a.classList.contains('on')); if (on >= 0 && on !== chapter) { chapter = on; sfx.step(on); } }).observe($('#rail'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  hero(); chartsInMotion(); warmingReplay(); autoSweep(); floodReplay(); autoTimelapse(); gauges(); sweeps();
}
