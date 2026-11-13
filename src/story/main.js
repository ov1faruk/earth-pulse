// EARTH//PULSE — The Story. Scroll-driven narrative over real data.
// Chapters initialise lazily as they approach the viewport so the page stays
// light: the 3D globe and the NISAR change engine load only when needed.
// (Written with AI assistance — see README → AI disclosure.)
import { $, $$, esc, whenNear, fmtDay } from './lib.js';
import { SOURCES, COMPILED_ON } from './data.js';
import { initVitals, initWarming } from './climate.js';
import { initMotion } from './motion.js';

// ---------- hero: the real Earth, two days ago ----------
(async () => {
  const el = $('#hero-earth');
  el.style.backgroundImage = "url('/data/story/earth_latest.jpg')";
  let date = '';
  try { date = (await (await fetch('/data/story/earth_latest.date')).text()).trim(); } catch { /* optional */ }
  $('#hero-credit').textContent = `BACKGROUND: EARTH ON ${/^\d{4}-\d\d-\d\d$/.test(date) ? fmtDay(date).toUpperCase() : 'A RECENT DAY'}, VIIRS / NOAA-20 TRUE COLOUR — NASA GIBS. THE DARK BAND IS POLAR NIGHT.`;
})();

// ---------- navigation, progress, reveal ----------
const chapters = $$('.chapter[data-title]');
$('#topnav').innerHTML = chapters.map((c) => `<a href="#${c.id}" data-id="${c.id}">${esc(c.dataset.title)}</a>`).join('');
$('#rail').innerHTML = chapters.map((c) => `<a href="#${c.id}" data-id="${c.id}" data-t="${esc(c.dataset.title)}" aria-label="${esc(c.dataset.title)}"></a>`).join('');
const bar = $('#progress'), topbar = $('#topbar');
let ticking = false;
addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    topbar.classList.toggle('solid', scrollY > innerHeight * 0.6);
    ticking = false;
  });
}, { passive: true });
const navLinks = $$('[data-id]', $('#topnav')).concat($$('[data-id]', $('#rail')));
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    for (const a of navLinks) a.classList.toggle('on', a.dataset.id === e.target.id);
    const on = $('#topnav .on'), nav = $('#topnav');
    if (on) nav.scrollTo({ left: on.offsetLeft - nav.clientWidth / 2 + on.clientWidth / 2, behavior: 'smooth' });
  }
}, { rootMargin: '-45% 0px -50% 0px' });
chapters.forEach((c) => spy.observe(c));
const reveal = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
$$('.ch-head, .panel, .ch-sub').forEach((n) => { n.classList.add('reveal'); reveal.observe(n); });

// ---------- chapters (lazy) ----------
initMotion();
initVitals();
whenNear($('#ch2'), initWarming);
whenNear($('#ch3'), async () => (await import('./live.js')).initLive(), '400px');
whenNear($('#ch4'), async () => (await import('./nepal.js')).initRipple());
whenNear($('#ch5'), async () => (await import('./nepal.js')).initNepal());
whenNear($('#ch6'), async () => (await import('./year.js')).initYear());
whenNear($('#ch7'), async () => (await import('./signals.js')).initSignals());
whenNear($('#ch8'), async () => (await import('./forecast.js')).initForecast());

// ---------- sources ----------
const groups = {};
for (const s of Object.values(SOURCES)) (groups[s.group] ||= []).push(s);
$('#source-list').innerHTML = Object.entries(groups).map(([g, list]) => `<h4>${esc(g)}</h4>${list.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join('')}`).join('');
$('#fine').innerHTML = `Event figures were compiled on ${fmtDay(COMPILED_ON)} and are attributed beside each number; tolls and loss estimates for 2026 events are still being revised. Live panels say whether they are showing live, cached or archived data. Nothing on this page is invented: where a source is unreachable the panel says so and shows nothing in its place. NISAR products are provisional (NASA/JPL-Caltech and ISRO, distributed by ASF DAAC). This page and its code were built with AI assistance; the idea, the choice of sources and the review are the team's.`;
