// Chapter 8: the forecast — the hazard-signal index for places around the
// world, the cause explorer and preparedness guidance, and three scenario
// tools built from published projections.
// (Written with AI assistance — see README → AI disclosure.)
import { $, esc, getJson, liveOrArchived, srcLine, how, errorBox, fmtYmd, fmtDay, pill } from './lib.js';
import { RISK_LEVELS, riskLevel, METHOD } from '../core/risk.js';
import { HAZARD_GUIDE, SCENARIOS, SCENARIO_NOTE } from './data.js';
import { lineChart, scoreBar } from './charts.js';
import { loadVitals } from './climate.js';

let places = [], selected = null, openSignal = null;

const pos = (lat, lon) => [((lon + 180) / 360) * 100, ((90 - lat) / 180) * 100];

function measuredText(k, m) {
  if (k === 'wet' || k === 'dry') return m.rain ? `${m.rain.observedMm} mm in ${m.rain.days} days · normal ${m.rain.normalMm} mm${m.rain.ratio != null ? ` · ${m.rain.ratio}×` : ''}` : 'no rainfall data';
  if (k === 'heat') return m.heat ? `${m.heat.observedC} °C · normal ${m.heat.normalC} °C · ${m.heat.anomalyC >= 0 ? '+' : ''}${m.heat.anomalyC} °C` : 'no temperature data';
  if (k === 'seismic') return m.seismic.maxMag ? `largest M ${m.seismic.maxMag} · ${m.seismic.count} quakes within ${m.seismic.radiusKm} km in ${m.seismic.days} days` : `no M 2.5+ earthquake within ${m.seismic.radiusKm} km in ${m.seismic.days} days`;
  if (k === 'fire') return `${m.fire.detections} detections within ${m.fire.radiusKm} km, last ~24 h`;
  if (k === 'events') return `${m.events.count} open event${m.events.count === 1 ? '' : 's'} within ${m.events.radiusKm} km`;
  return '';
}

function detail(p) {
  const host = $('#risk-detail');
  if (!p || p.unavailable) { host.innerHTML = errorBox('The index for this place'); return; }
  const lvl = riskLevel(p.overall);
  const order = Object.entries(p.scores).sort((a, b) => b[1] - a[1]);
  openSignal = openSignal && p.scores[openSignal] != null ? openSignal : order[0][0];
  const g = HAZARD_GUIDE[openSignal];
  host.style.setProperty('--c', lvl.color);
  host.innerHTML = `<h3>${esc(p.name || `${p.lat}°, ${p.lon}°`)}</h3>
    <div class="risk-score"><b>${p.overall}</b><span>${lvl.label} SIGNAL</span></div>
    ${order.map(([k, s]) => `<button class="sig" data-s="${k}" aria-pressed="${k === openSignal}"><span><strong>${esc(METHOD.signals[k].label)}</strong><em>${esc(measuredText(k, p.measured))}</em></span><b>${s}</b>${scoreBar(s, riskLevel(s).color)}</button>`).join('')}
    ${p.missing?.length ? `<p class="mono" style="font-size:10.5px;color:var(--amber)">Not included (source unreachable): ${esc(p.missing.join(', '))}</p>` : ''}
    <div class="guide"><strong style="font-size:15px">${esc(g.title)}: why, and what to do</strong>
      <h4 style="--c:var(--cyan)">Natural drivers</h4><ul>${g.natural.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h4 style="--c:var(--amber)">Human drivers</h4><ul>${g.human.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h4 style="--c:var(--green)">How to prepare</h4><ul>${g.act.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${p.measured.events.titles?.length ? `<h4>Open events nearby</h4><ul>${p.measured.events.titles.map((t) => `<li><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a> (${esc(t.source)})</li>`).join('')}</ul>` : ''}
    </div>
    ${srcLine(['power', 'usgs', 'firms', 'eonet', 'gdacs'], { freshness: p.freshness || 'ARCHIVED', date: p.measured.rain ? `weather to ${fmtYmd(p.measured.rain.to)}` : fmtDay(p.computedAt) })}
    ${srcLine(['ifrc', 'ready', 'undrr'], {}).replace('Source:', 'Preparedness guidance:')}
    ${how(`<p><b>${esc(METHOD.signals[openSignal].label)}:</b> ${esc(METHOD.signals[openSignal].formula)}</p><p>${esc(METHOD.overall)}</p><p>${esc(METHOD.caveat)}</p>`)}`;
}

function drawMap() {
  const map = $('#riskmap');
  map.innerHTML = places.map((p, k) => {
    if (p.unavailable) return '';
    const [x, y] = pos(p.lat, p.lon), lvl = riskLevel(p.overall);
    return `<button class="${lvl.id}${p.custom ? ' custom' : ''}" data-k="${k}" style="left:${x}%;top:${y}%;--c:${lvl.color}" aria-pressed="${p === selected}" aria-label="${esc(p.name)}: ${p.overall}, ${lvl.label}" title="${esc(p.name)} · ${p.overall} · ${lvl.label}"></button>`;
  }).join('');
}

function pick(p) { selected = p; openSignal = null; drawMap(); detail(p); }

async function riskMap() {
  let d;
  try { d = await liveOrArchived('/api/risk/map', '/data/story/risk.json', { timeout: 180000 }); } catch { $('#risk-detail').innerHTML = errorBox('The hazard-signal index'); return; }
  places = d.places.filter((p) => !p.unavailable);
  const archived = d.freshness === 'ARCHIVED';
  if (archived) places.forEach((p) => { p.freshness = 'ARCHIVED'; });
  $('#risk-legend').innerHTML = RISK_LEVELS.map((l) => `<span><i style="background:${l.color}"></i>${l.label}</span>`).join('') + `<span style="margin-left:auto">${pill(archived ? 'ARCHIVED' : 'LIVE', archived ? `snapshot ${fmtDay(d.snapshotAt)}` : `computed ${fmtDay(d.computedAt)}`)}</span>`;
  pick(places.slice().sort((a, b) => b.overall - a.overall)[0]);
  $('#riskmap').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) pick(places[Number(b.dataset.k)]); });
  $('#risk-detail').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { openSignal = b.dataset.s; detail(selected); } });

  $('#method').innerHTML = `<h3>How the index is calculated</h3><p style="color:var(--ink-2);font-size:14px;max-width:820px">${esc(METHOD.window)} ${esc(METHOD.overall)}</p>
    <div class="method-grid">${Object.values(METHOD.signals).map((s) => `<div><b>${esc(s.label)} → ${esc(s.hazard)}</b>${esc(s.formula)}</div>`).join('')}</div>
    <p style="margin-top:14px;font-size:13.5px;color:var(--amber)">${esc(METHOD.caveat)}</p>
    <p style="margin-top:8px;font-size:12.5px;color:var(--ink-3)">The thresholds are our own transparent choices, not a validated forecast model. The code is in <span class="mono">src/core/risk.js</span>, with unit tests in <span class="mono">test/story.test.mjs</span>.</p>`;

  // Check any place.
  const form = $('#risk-search'), results = $('#risk-results');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#risk-q').value.trim();
    if (q.length < 2) return;
    results.hidden = false; results.innerHTML = '<li style="padding:8px 10px;color:var(--ink-3)">Searching…</li>';
    try {
      const r = await getJson(`/api/locations/search?q=${encodeURIComponent(q)}`);
      results.innerHTML = (r.results || []).slice(0, 6).map((p, k) => `<li><button type="button" data-r="${k}">${esc([p.name, p.detail].filter(Boolean).join(', '))}</button></li>`).join('') || '<li style="padding:8px 10px;color:var(--ink-3)">No place found.</li>';
      results.onclick = async (ev) => {
        const b = ev.target.closest('[data-r]'); if (!b) return;
        const p = r.results[Number(b.dataset.r)];
        results.hidden = true;
        $('#risk-detail').innerHTML = '<div class="skeleton tall"></div>';
        try {
          const risk = await getJson(`/api/risk?lat=${p.lat}&lon=${p.lon}&name=${encodeURIComponent(p.name || 'Selected place')}`, { timeout: 90000 });
          risk.custom = true;
          places = places.filter((x) => !x.custom).concat(risk);
          pick(risk);
        } catch { $('#risk-detail').innerHTML = errorBox('The index for this place'); }
      };
    } catch { results.innerHTML = '<li style="padding:8px 10px;color:#ffb3b3">Place search needs the live data service.</li>'; }
  });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) results.hidden = true; });
}

// ---------- scenario tools ----------
async function sims() {
  const host = $('#sims');
  let v = null;
  try { v = await loadVitals(); } catch { /* scenario tables still work without the observed records */ }
  let scen = SCENARIOS[2];
  const seg = (id) => `<div class="seg" data-seg="${id}">${SCENARIOS.map((s) => `<button data-sc="${s.id}" aria-pressed="${s === scen}" style="${s === scen ? '' : `border-color:${s.color}55`}">${s.label}</button>`).join('')}</div>`;
  host.innerHTML = `
    <article class="panel sim" id="sim-temp"><span class="tagsim">SCENARIO · IPCC AR6</span><h4 style="margin-top:10px">Temperature futures</h4><div class="chart-host"></div><div class="out"></div><p class="range"></p></article>
    <article class="panel sim" id="sim-sea"><span class="tagsim">SCENARIO · IPCC AR6</span><h4 style="margin-top:10px">Sea-level rise</h4><div class="chart-host"></div><div class="out"></div><p class="range"></p></article>
    <article class="panel sim" id="sim-ice"><span class="tagsim">TREND EXTRAPOLATION</span><h4 style="margin-top:10px">Arctic summer ice</h4><div class="chart-host"></div><div class="out"></div><p class="range"></p></article>`;
  host.insertAdjacentHTML('beforebegin', `<div class="panel" style="margin-bottom:18px"><h3>Choose an emissions pathway</h3>${seg('main')}<p id="scen-blurb" style="margin-top:10px;color:var(--ink-2);font-size:14px"></p></div>`);

  const t = v?.temperature && !v.temperature.unavailable ? v.temperature : null;
  const ice = v?.seaIce && !v.seaIce.unavailable ? v.seaIce : null;

  const drawTemp = () => {
    const el = $('#sim-temp');
    const obs = t ? t.annual.filter((a) => a[0] >= 1950).map(([y, a]) => [y, a + t.baselineShift]) : [];
    lineChart(el.querySelector('.chart-host'), {
      series: [...(obs.length ? [{ label: 'Observed (NASA GISTEMP)', color: '#fff', points: obs, width: 1.6 }] : []),
        ...SCENARIOS.filter((s) => s !== scen).map((s) => ({ label: s.label, color: `${s.color}55`, points: s.temp.map((p) => [p[0], p[1]]), width: 1, noTip: true })),
        { label: scen.label, color: scen.color, points: scen.temp.map((p) => [p[0], p[1]]), width: 2.6, dots: true }],
      bands: [{ color: scen.color, points: scen.temp.map((p) => [p[0], p[2], p[3]]) }],
      height: 230, yFmt: (y) => `${y > 0 ? '+' : ''}${y.toFixed(1)}°`, yLabel: '°C above pre-industrial', xDomain: [1950, 2100], yDomain: [-0.2, 6],
    });
    const end = scen.temp[2];
    el.querySelector('.out').innerHTML = `+${end[1].toFixed(1)} °C <small>by 2081–2100</small>`;
    el.querySelector('.range').innerHTML = `Very likely range ${end[2]}–${end[3]} °C. Mid-century (2041–2060): +${scen.temp[1][1]} °C.`;
  };
  const drawSea = () => {
    const el = $('#sim-sea');
    lineChart(el.querySelector('.chart-host'), {
      series: [...SCENARIOS.filter((s) => s !== scen).map((s) => ({ label: s.label, color: `${s.color}55`, points: [[2005, 0], ...s.sea.map((p) => [p[0], p[1]])], width: 1, noTip: true })),
        { label: scen.label, color: scen.color, points: [[2005, 0], ...scen.sea.map((p) => [p[0], p[1]])], width: 2.6, dots: true }],
      bands: [{ color: scen.color, points: [[2005, 0, 0], ...scen.sea.map((p) => [p[0], p[2], p[3]])] }],
      height: 230, yFmt: (y) => `${y.toFixed(1)} m`, yLabel: 'metres above 1995–2014', xDomain: [2000, 2100], yDomain: [0, 1.1], xTicks: [2005, 2050, 2100],
    });
    const end = scen.sea[1];
    el.querySelector('.out').innerHTML = `+${Math.round(end[1] * 100)} cm <small>by 2100</small>`;
    el.querySelector('.range').innerHTML = `Likely range ${Math.round(end[2] * 100)}–${Math.round(end[3] * 100)} cm. By 2050: +${Math.round(scen.sea[0][1] * 100)} cm under every pathway shown, within a few centimetres.`;
  };
  const drawIce = () => {
    const el = $('#sim-ice');
    if (!ice) { el.querySelector('.chart-host').innerHTML = errorBox('NSIDC sea ice'); return; }
    const tr = ice.septemberTrend, last = ice.september.at(-1)[0];
    const yearAt = (ext) => (ext - tr.intercept) / tr.slope;
    const free = Math.round(yearAt(1));
    const future = [[last, tr.intercept + tr.slope * last], [Math.min(2100, free), Math.max(1, tr.intercept + tr.slope * Math.min(2100, free))]];
    lineChart(el.querySelector('.chart-host'), {
      series: [{ label: 'Observed September extent', color: '#c8e9ff', points: ice.september, width: 1.6 }, { label: 'Linear trend, continued', color: '#ff5fa2', points: future, dashed: true, width: 1.6 }],
      marks: [{ x: Math.min(2099, free), label: `${free}`, color: '#ff5fa2' }],
      height: 230, yFmt: (y) => y.toFixed(1), yLabel: 'million km²', xDomain: [1979, 2100], yDomain: [0, 8.5],
    });
    el.querySelector('.out').innerHTML = `${free} <small>if the trend simply continued</small>`;
    el.querySelector('.range').innerHTML = `The year a straight line through 1979–${last} reaches 1 million km² — the usual "ice-free" threshold. Not a prediction: ice loss is not linear and varies by pathway.`;
  };
  const drawAll = () => { $('#scen-blurb').innerHTML = `<b style="color:${scen.color}">${scen.label}</b> — ${esc(scen.blurb)}.`; drawTemp(); drawSea(); drawIce(); };
  drawAll();
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sc]'); if (!b) return;
    scen = SCENARIOS.find((s) => s.id === b.dataset.sc);
    document.querySelectorAll('[data-seg] button').forEach((x) => { const on = x.dataset.sc === scen.id; x.setAttribute('aria-pressed', on); });
    drawAll();
  });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawAll, 250); });
  host.insertAdjacentHTML('afterend', srcLine(['ipcc_spm', 'ipcc_ch9', 'gistemp', 'nsidc'], { freshness: 'SIMULATED', date: 'published projections' })
    + how(`<p><b>Temperature.</b> ${esc(SCENARIO_NOTE.temp)} The white line is the observed NASA record shifted to an 1880–1899 baseline.</p><p><b>Sea level.</b> ${esc(SCENARIO_NOTE.sea)}</p><p><b>Arctic ice.</b> A least-squares line through NSIDC's September means, extended forward. The IPCC's own assessment (AR6) is that the Arctic is likely to be practically ice-free in September at least once before 2050 under all the pathways it considered.</p><p>No flood-spread or inundation model is offered here: that needs local elevation and hydrology data, and we would rather show nothing than an invented map.</p>`));
}

export function initForecast() { riskMap(); sims(); }
