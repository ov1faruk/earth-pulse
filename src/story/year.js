// Chapter 6: a year of disasters — event browser with daily NASA imagery,
// cause explorer, research links and the impact calculator.
// (Written with AI assistance — see README → AI disclosure.)
import { $, esc, getJson, srcLine, how, fmtDay, fmtInt, fmtUsd, snapshotUrl, worldviewUrl, addDays, dayDiff } from './lib.js';
import { EVENTS, TYPE_META, YEAR_CONTEXT, SOURCES } from './data.js';

const LAYERS = {
  true: { label: 'True colour', layers: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', note: 'what the eye would see (VIIRS on NOAA-20, 375 m)' },
  false: { label: 'False colour', layers: 'VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1', note: 'shortwave infrared (VIIRS bands M11-I2-I1): water is dark blue-black, burn scars red-brown, vegetation bright green' },
  fires: { label: 'Fire detections', layers: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor,VIIRS_NOAA20_Thermal_Anomalies_375m_All', note: 'VIIRS NOAA-20 thermal anomalies (375 m, red) over true colour' },
};

let current = EVENTS.at(-1), layer = 'true', dayOffset = 0, playing = null;

function viewer(ev) {
  const span = dayDiff(ev.imgFrom, ev.imgTo);
  const eventOffset = dayDiff(ev.imgFrom, ev.date);
  dayOffset = Math.min(span, eventOffset + 3);
  layer = ev.fires ? 'fires' : 'true';
  const mx = ((ev.lon - ev.box[1]) / (ev.box[3] - ev.box[1])) * 100, my = ((ev.box[2] - ev.lat) / (ev.box[2] - ev.box[0])) * 100;
  return `<div class="viewer">
    <div class="viewer-img" id="viewer-img"><img id="viewer-a" alt="" /><span class="loading-ring" id="viewer-ring"></span><span class="marker" style="left:${mx}%;top:${my}%"></span></div>
    <div class="viewer-bar">
      <div class="viewer-row"><button class="btn small" id="viewer-play">▶ Play</button><span class="viewer-date" id="viewer-date"></span><input type="range" id="viewer-range" min="0" max="${span}" value="${dayOffset}" aria-label="Image date" /><button class="btn small" id="viewer-event" title="Jump to the day of the event">Event day</button></div>
      <div class="viewer-row"><div class="seg" id="viewer-layers">${Object.entries(LAYERS).map(([k, l]) => `<button data-l="${k}" aria-pressed="${k === layer}">${l.label}</button>`).join('')}</div><a class="btn small" id="viewer-wv" target="_blank" rel="noopener">Open in NASA Worldview ↗</a></div>
      <div id="viewer-note"></div>
    </div></div>`;
}

function showImage(ev) {
  const date = addDays(ev.imgFrom, dayOffset);
  const img = $('#viewer-a'), ring = $('#viewer-ring');
  const opts = { box: ev.box, date, layers: LAYERS[layer].layers };
  ring.hidden = false;
  img.style.opacity = 0.35;
  const url = snapshotUrl(opts);
  img.onload = () => { if (img.dataset.want === url) { ring.hidden = true; img.style.opacity = 1; } };
  img.onerror = () => { ring.hidden = true; $('#viewer-note').innerHTML = '<div class="error" style="margin-top:6px">NASA Worldview Snapshots did not return this image. Try another date, or open the same view in Worldview.</div>'; };
  img.dataset.want = url; img.src = url;
  img.alt = `${LAYERS[layer].label} satellite image of ${ev.place} on ${fmtDay(date)}`;
  const rel = dayDiff(ev.date, date);
  $('#viewer-date').textContent = `${fmtDay(date)}${rel === 0 ? ' · EVENT' : rel < 0 ? ` · ${-rel} d before` : ` · ${rel} d after`}`;
  $('#viewer-wv').href = worldviewUrl(opts);
  $('#viewer-note').innerHTML = `<div class="src" style="margin-top:0"><span>${esc(LAYERS[layer].note)}. The ring marks the event. White is cloud — which is why radar missions like NISAR matter.</span></div>`;
}

function body(ev) {
  const t = TYPE_META[ev.type];
  return `<div class="event-body panel" style="margin:0"><span class="pill" style="color:${t.color}"><span class="dot"></span>${esc(t.label.toUpperCase())}</span>
    <h3 style="margin-top:10px">${esc(ev.title)}</h3><p class="where">${fmtDay(ev.date)} · ${esc(ev.place)}</p><p>${esc(ev.what)}</p>
    <div class="facts">${ev.figures.map((f) => `<div class="fact"><b>${esc(f[0])}</b><span>${esc(f[1])}</span></div>`).join('')}</div>
    ${srcLine(ev.src, { freshness: 'RESEARCH', date: 'compiled 13 Nov 2026' })}
    <div class="causes"><div style="--c:var(--cyan)"><h4>Natural drivers</h4><ul>${ev.natural.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div style="--c:var(--amber)"><h4>Human drivers</h4><ul>${ev.human.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
    <div class="research"><h4>Research and records</h4>${ev.research.map((k) => `<a href="${esc(SOURCES[k].url)}" target="_blank" rel="noopener">${esc(SOURCES[k].label)} ↗</a>`).join('')}</div>
    <p style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn small primary" href="/?event=${ev.id}">See it on the live globe →</a><a class="btn small" href="/?probe=${ev.lat},${ev.lon},${encodeURIComponent(ev.place.split(',')[0])}">Conditions there now →</a><a class="btn small" href="/?change=${ev.lat},${ev.lon}">Compare NISAR radar passes →</a></p>
    ${how('<p>Deaths and losses are the latest figures published by the cited source when this page was compiled; several are stated as minimums and are still rising. "Natural" and "human" drivers summarise what the cited reports and studies say — they are not our own attribution, and no percentages are assigned because none have been published.</p>', 'About these figures')}</div>`;
}

function select(ev) {
  current = ev;
  clearInterval(playing); playing = null;
  $('#events-nav').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === ev.id));
  $('#event').innerHTML = viewer(ev) + body(ev);
  showImage(ev);
  $('#viewer-range').addEventListener('input', (e) => { dayOffset = Number(e.target.value); showImage(ev); });
  $('#viewer-event').addEventListener('click', () => { dayOffset = dayDiff(ev.imgFrom, ev.date); $('#viewer-range').value = dayOffset; showImage(ev); });
  $('#viewer-layers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]'); if (!b) return;
    layer = b.dataset.l;
    $('#viewer-layers').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    showImage(ev);
  });
  $('#viewer-play').addEventListener('click', (e) => {
    if (playing) { clearInterval(playing); playing = null; e.target.textContent = '▶ Play'; return; }
    e.target.textContent = '❚❚ Pause';
    const max = Number($('#viewer-range').max);
    playing = setInterval(() => { dayOffset = dayOffset >= max ? 0 : dayOffset + 1; $('#viewer-range').value = dayOffset; showImage(ev); }, 1500);
  });
}

// ---------- impact calculator ----------
const econ = new Map();
const economy = (iso3) => { if (!econ.has(iso3)) econ.set(iso3, getJson(`/api/economy/${iso3}`, { timeout: 30000 })); return econ.get(iso3); };

async function calc() {
  const host = $('#calc');
  host.innerHTML = `<h3>Impact calculator</h3>
    <div class="calc-row"><label>Event <select id="calc-event">${EVENTS.map((e) => `<option value="${e.id}"${e.id === 'ditwah' ? ' selected' : ''}>${esc(e.title)} — ${esc(e.place)}</option>`).join('')}</select></label></div>
    <div id="calc-out"><div class="skeleton" style="margin-top:14px"></div></div>`;
  const out = $('#calc-out');
  const run = async () => {
    const ev = EVENTS.find((e) => e.id === $('#calc-event').value);
    out.innerHTML = '<div class="skeleton" style="margin-top:14px"></div>';
    let e;
    try { e = await economy(ev.iso3); } catch { econ.delete(ev.iso3); out.innerHTML = `<div class="error" style="margin-top:14px"><strong>World Bank data for this country is unavailable right now</strong> (or the World Bank publishes no recent GDP for it, as is the case for Venezuela). The calculator needs a real GDP and population figure, so it shows nothing instead of guessing.</div>`; return; }
    const cells = [];
    const steps = [];
    if (ev.damageUsd) {
      const pct = (ev.damageUsd / e.gdpUsd) * 100;
      cells.push([`${pct.toFixed(pct < 1 ? 2 : 1)}%`, `of ${esc(e.country)}'s annual GDP`]);
      cells.push([`${Math.round((pct / 100) * 365)} days`, 'of national economic output']);
      cells.push([`US$${fmtInt(ev.damageUsd / e.population)}`, 'per person in the country']);
      steps.push(`<li><b>Share of GDP</b> = ${fmtUsd(ev.damageUsd)} (${esc(ev.damageNote)}) ÷ ${fmtUsd(e.gdpUsd)} (GDP, current US$, ${e.gdpYear}) = ${pct.toFixed(2)}%.</li>`);
      steps.push(`<li><b>Days of output</b> = that share × 365.</li>`);
      steps.push(`<li><b>Per person</b> = ${fmtUsd(ev.damageUsd)} ÷ ${fmtInt(e.population)} people (${e.populationYear}).</li>`);
    }
    if (ev.deaths) {
      const pm = (ev.deaths / e.population) * 1e6;
      cells.push([pm >= 10 ? fmtInt(pm) : pm.toFixed(1), `deaths per million people`]);
      steps.push(`<li><b>Deaths per million</b> = ${fmtInt(ev.deaths)} (${esc(ev.deathsNote)}) ÷ ${fmtInt(e.population)} × 1,000,000.${ev.id === 'senyar' || ev.id === 'nepal' ? ' The death toll spans more than one country; the population used is the main affected country\'s, so this slightly overstates the national rate.' : ''}</li>`);
    }
    if (!cells.length) { out.innerHTML = `<p style="margin-top:14px;color:var(--ink-2)">No death toll or damage estimate has been published for this event, so there is nothing to calculate. Burned area is in the event card above.</p>`; return; }
    out.innerHTML = `<div class="calc-grid">${cells.map((c) => `<div><b>${c[0]}</b><span>${c[1]}</span></div>`).join('')}</div>
      ${!ev.damageUsd ? '<p style="margin-top:12px;font-size:13px;color:var(--ink-3)">No damage estimate in US dollars has been published for this event, so the economic measures are not shown.</p>' : ''}
      ${srcLine([ev.src, 'worldbank'], { freshness: 'DERIVED', date: `World Bank ${e.gdpYear}` })}
      ${how(`<ul>${steps.join('')}</ul><p>These are simple ratios of published figures, meant to put an event on a human scale. They are not a damage model: the damage figure covers what its source counted (often direct physical damage only), and GDP is a yearly flow while damage is a loss of assets.</p>`)}`;
  };
  $('#calc-event').addEventListener('change', run);
  run();
}

export function initYear() {
  $('#year-context').innerHTML = YEAR_CONTEXT.map((c) => `<div><b>${esc(c.v)}</b><span>${esc(c.label)}</span><small>${esc(c.note)} · <a href="${esc(SOURCES[c.src].url)}" target="_blank" rel="noopener">source ↗</a></small></div>`).join('');
  $('#events-nav').innerHTML = EVENTS.map((e) => `<button data-id="${e.id}" aria-pressed="false" style="--c:${TYPE_META[e.type].color}"><time>${fmtDay(e.date).toUpperCase()}</time><strong>${esc(e.title)}</strong></button>`).join('');
  $('#events-nav').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) select(EVENTS.find((x) => x.id === b.dataset.id)); });
  const asked = EVENTS.find((e) => e.id === new URLSearchParams(location.search).get('event'));
  select(asked || current);
  $('#events-nav').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  $('#event').insertAdjacentHTML('afterend', `<div style="margin:-6px 0 18px">${srcLine(['gibs', 'worldview'], { freshness: 'LIVE', date: 'imagery loads from NASA on demand' })}${how('<p>Each frame is requested live from NASA Worldview Snapshots for the chosen day and box: VIIRS corrected reflectance from the NOAA-20 satellite (375 m), and its thermal anomalies for fires. Play steps one day at a time. Earthquake damage is not visible at this resolution — the images show context and weather; radar interferometry is the right tool for ground displacement.</p>', 'About the imagery')}</div>`);
  calc();
}
