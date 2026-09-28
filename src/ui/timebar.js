// Time machine + before/after. The camera stays put; time moves.
import { $, $$, esc, fmtDate, tag } from './dom.js';
import { DATA_CLASS } from '../core/dataClass.js';
import { reducedMotion } from '../globe/camera.js';

export function createTimebar({ el, divider, layers, onFrame }) {
  let story = null;
  let mode = 'timeline';
  let index = 0;
  let playing = null;
  let before = 0, after = 0;
  let split = 0.5;
  let labels = null;

  const dateOf = (t) => t.referenceDate ? `${fmtDate(t.referenceDate)} → ${fmtDate(t.secondaryDate)}` : fmtDate(t.date);
  const pos = (t) => {
    const a = new Date(story.timeline[0].date).getTime();
    const b = new Date(story.timeline.at(-1).date).getTime();
    return b === a ? 50 : ((new Date(t).getTime() - a) / (b - a)) * 100;
  };

  function render() {
    const tl = story.timeline;
    const ev = story.evidence?.contextEvent;
    const hasWater = !!story.evidence?.derived;
    const t = tl[index];
    el.innerHTML = `
      <div class="tb-top">
        <div class="tb-modes" role="group" aria-label="Compare mode">
          ${[['split', 'BEFORE / AFTER'], ['flicker', 'FLICKER'], ['fade', 'FADE'], ['timeline', 'TIMELINE']].map(([m, l]) => `<button data-mode="${m}" aria-pressed="${mode === m}">${l}</button>`).join('')}
          ${hasWater ? `<button data-overlay="water" aria-pressed="${layers.overlay === 'water'}">WATER</button><button data-overlay="change" aria-pressed="${layers.overlay === 'change'}">CHANGE</button>` : ''}
        </div>
        <div class="tb-transport" role="group" aria-label="Playback">
          <button data-t="first" aria-label="First observation">⏮</button>
          <button data-t="prev" aria-label="Previous observation">◀</button>
          <button data-t="play" aria-label="${playing ? 'Pause' : 'Play'}">${playing ? '❚❚' : '▶'}</button>
          <button data-t="next" aria-label="Next observation">▶</button>
          <button data-t="last" aria-label="Last observation">⏭</button>
        </div>
        <div class="tb-date">${mode === 'split' || mode === 'flicker' || mode === 'fade'
          ? `<small>BEFORE → AFTER</small>${esc(dateOf(tl[before]))} · ${esc(dateOf(tl[after]))}`
          : `<small>NISAR OBSERVATION ${index + 1}/${tl.length} ${t.spansEvent ? '· SPANS THE EARTHQUAKE' : ''}</small>${esc(dateOf(t))}`}</div>
      </div>
      <div class="track" aria-hidden="false">
        <div class="track-line"></div>
        <div class="track-fill" style="width:${pos(t.date)}%"></div>
        ${ev ? `<div class="event-mark" style="left:${pos(ev.time)}%" title="USGS M${esc(ev.mag)} earthquake"><span>EARTHQUAKE</span></div>` : ''}
        ${tl.map((f, i) => `<button class="tick ${i === index ? 'on' : ''} ${f.spansEvent ? 'event' : ''}" style="left:${pos(f.date)}%" data-i="${i}" aria-label="${esc(dateOf(f))}"></button>
          <span class="tick-label" style="left:${pos(f.date)}%">${esc(new Date(f.date).toISOString().slice(5, 10).replace('-', '/'))}</span>`).join('')}
      </div>
      ${mode === 'fade' ? `<input type="range" min="0" max="100" value="50" id="fade-range" aria-label="Fade between before and after" style="width:100%;margin-top:8px;accent-color:#7fe6ff">` : ''}
      ${hasWater && layers.overlay ? `<div style="margin-top:6px;font-size:10.5px;color:var(--ink-3);display:flex;gap:10px;align-items:center;flex-wrap:wrap">${tag(DATA_CLASS.DERIVED)} ${layers.overlay === 'water' ? '<span style="color:#48d6ff">■</span> dark-water-like pixels (approximate)' : '<span style="color:#48d6ff">■</span> became water &nbsp;<span style="color:#ffb347">■</span> water receded (first → peak)'}</div>` : ''}`;
    $$('[data-mode]', el).forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    $$('[data-overlay]', el).forEach((b) => (b.onclick = () => { layers.setOverlay(layers.overlay === b.dataset.overlay ? null : b.dataset.overlay); render(); }));
    $$('.tick', el).forEach((b) => (b.onclick = () => { stop(); setMode('timeline'); go(Number(b.dataset.i)); }));
    $$('[data-t]', el).forEach((b) => (b.onclick = () => transport(b.dataset.t)));
    const fr = $('#fade-range', el);
    if (fr) fr.oninput = () => layers.setFade(fr.value / 100);
    renderLabels();
  }

  function renderLabels() {
    labels?.remove();
    labels = null;
    divider.hidden = mode !== 'split';
    if (mode !== 'split') return;
    const tl = story.timeline;
    labels = document.createElement('div');
    labels.className = 'ba-labels';
    labels.innerHTML = `<div class="ba-label" style="right:calc(${(1 - split) * 100}% + 18px);text-align:right">BEFORE<b>${esc(dateOf(tl[before]))}</b></div>
      <div class="ba-label" style="left:calc(${split * 100}% + 18px)">AFTER<b>${esc(dateOf(tl[after]))}</b></div>`;
    document.body.appendChild(labels);
    divider.style.left = `${split * 100}%`;
    divider.setAttribute('aria-valuenow', Math.round(split * 100));
  }

  function setSplit(x) {
    split = Math.max(0.02, Math.min(0.98, x));
    layers.setSplitPosition(split);
    renderLabels();
  }

  // Divider drag (pointer + keyboard).
  divider.onpointerdown = (e) => {
    divider.setPointerCapture(e.pointerId);
    const move = (ev) => setSplit(ev.clientX / window.innerWidth);
    divider.onpointermove = move;
    divider.onpointerup = () => { divider.onpointermove = null; };
  };
  divider.onkeydown = (e) => {
    if (e.key === 'ArrowLeft') setSplit(split - 0.03);
    if (e.key === 'ArrowRight') setSplit(split + 0.03);
  };

  function setMode(m) {
    stop();
    mode = m;
    if (m === 'timeline') layers.show(index);
    else layers.setCompare(m, before, after);
    if (m === 'split') setSplit(split);
    render();
  }

  function go(i) {
    index = (i + story.timeline.length) % story.timeline.length;
    if (mode !== 'timeline') { mode = 'timeline'; }
    layers.show(index);
    onFrame?.(index);
    render();
  }

  function stop() {
    if (playing) clearInterval(playing);
    playing = null;
  }

  function play() {
    if (playing) { stop(); render(); return; }
    if (mode !== 'timeline') setMode('timeline');
    if (index === story.timeline.length - 1) go(0);
    playing = setInterval(() => {
      if (index >= story.timeline.length - 1) { stop(); render(); return; }
      go(index + 1);
    }, reducedMotion() ? 2400 : 1500);
    render();
  }

  function transport(t) {
    if (t === 'play') return play();
    stop();
    if (t === 'first') go(0);
    if (t === 'last') go(story.timeline.length - 1);
    if (t === 'prev') go(index - 1);
    if (t === 'next') go(index + 1);
  }

  return {
    open(s) {
      story = s;
      before = s.beforeIndex ?? 0;
      after = s.afterIndex ?? s.timeline.length - 1;
      index = before;
      mode = 'timeline';
      el.hidden = false;
      render();
    },
    close() {
      stop();
      el.hidden = true;
      divider.hidden = true;
      labels?.remove();
      labels = null;
      story = null;
    },
    setMode, go, play, stop, setSplit,
    showOverlay(kind) { layers.setOverlay(kind); if (story) render(); },
    get mode() { return mode; },
    get index() { return index; },
    get isOpen() { return !!story; },
  };
}
