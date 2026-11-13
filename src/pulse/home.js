// PULSE HOME — the first screen. A weather-app-style card for one place:
// "your weather app tells you if it will rain; Pulse tells you what the rain
// will do." NASA measurements first; the 7-day forecast is labelled non-NASA.
// The globe spins, dimmed, behind it and only loads its heavy data on request.
// (Written with AI assistance — see README → AI disclosure.)
import * as Cesium from 'cesium';
import './home.css';
import { $, esc, toast } from '../ui/dom.js';
import { assess, derive, atAltitude, dayName, LEVELS, PERSONAS, DEFAULT_THRESHOLDS } from './logic.js';

export const QUICK_PLACES = [
  ['Kathmandu', 27.72, 85.32], ['Dhaka', 23.81, 90.41], ['Delhi', 28.61, 77.21], ['Karachi', 24.86, 67.01],
  ['Colombo', 6.93, 79.86], ['Medan', 3.59, 98.67], ['Jakarta', -6.21, 106.85], ['Cebu', 10.32, 123.89],
  ['General Santos', 6.11, 125.17], ['Tokyo', 35.68, 139.69], ['Sydney', -33.87, 151.21], ['Istanbul', 41.01, 28.98],
  ['Cairo', 30.04, 31.24], ['Lagos', 6.52, 3.38], ['Nairobi', -1.29, 36.82], ['Rome', 41.9, 12.5],
  ['Bordeaux', 44.84, -0.58], ['Los Angeles', 34.05, -118.24], ['Miami', 25.76, -80.19], ['Mexico City', 19.43, -99.13],
  ['Caracas', 10.48, -66.9], ['Quibdó', 5.69, -76.66], ['Lima', -12.05, -77.04], ['Santiago', -33.45, -70.67],
];

const KEY = 'earthpulse.home.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: fine */ } };
const getJson = async (url, timeout = 120000) => { const r = await fetch(url, { signal: AbortSignal.timeout(timeout) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const fmtYmd = (s) => (s ? new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
const fmtIso = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
const coord = (lat, lon) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
const r0 = (v) => Math.round(v);
const ICON = { flood: '≋', rain: '☂', drought: '◌', heat: '☀', fire: '▲', event: '◉', frost: '❄', soil: '▦', melt: '◭', cold: '❄', slope: '◣', snow: '❅' };

export function createHome(app) {
  const prefs = load();
  const st = {
    place: prefs.place || { name: 'Kathmandu', lat: 27.72, lon: 85.32 },
    persona: prefs.persona || 'everyone',
    thresholds: { ...DEFAULT_THRESHOLDS, ...(prefs.thresholds || {}) },
    data: null, loading: false, error: null, token: 0, open: true,
  };
  // Shareable links: ?persona=farmer|climber|everyone and ?place=lat,lon,Name
  const qs0 = new URLSearchParams(location.search);
  if (PERSONAS.some((x) => x.id === qs0.get('persona'))) st.persona = qs0.get('persona');
  const pl = (qs0.get('place') || '').split(',');
  if (pl.length >= 2 && Number.isFinite(+pl[0]) && Number.isFinite(+pl[1]) && Math.abs(+pl[0]) <= 90 && Math.abs(+pl[1]) <= 180) st.place = { name: pl.slice(2).join(',').trim() || 'Selected place', lat: +pl[0], lon: +pl[1] };
  const persist = () => save({ place: st.place, persona: st.persona, thresholds: st.thresholds, openThresholds: !!prefs.openThresholds });

  const el = $('#pulse-home');
  const veil = $('#ph-veil');

  // ---------- place ----------
  function setPlace(place, { fly = true } = {}) {
    st.place = place; persist();
    if (fly && st.open) focusGlobe();
    fetchPulse();
  }
  // The backdrop is yesterday's real NASA satellite photo of the place itself
  // (VIIRS true colour via NASA GIBS WMS). The globe stays a tool you open.
  function focusGlobe() {
    const { lat, lon, name } = st.place;
    app.cam.idleSpin(false);
    const wide = innerWidth > 900, W = 16, H = 9, fx = wide ? 0.62 : 0.5;
    const cy = Math.max(-85.5, Math.min(85.5, lat));
    const day = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    const bbox = [cy - H / 2, lon - W * fx, cy + H / 2, lon + W * (1 - fx)].map((v) => v.toFixed(3)).join(',');
    const url = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_NOAA20_CorrectedReflectance_TrueColor&FORMAT=image/jpeg&WIDTH=1920&HEIGHT=1080&CRS=EPSG:4326&BBOX=${bbox}&TIME=${day}`;
    const nice = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    veil.innerHTML = `<img class="ph-bg" alt="" src="${url}" onload="this.classList.add('on')" /><i class="ph-shade"></i><span class="ph-pin" style="left:${fx * 100}%"><i></i><b>${esc(name || 'Selected place')}</b></span><span class="ph-credit">YOUR REGION FROM ORBIT · ${nice.toUpperCase()} · NASA VIIRS / NOAA-20 TRUE COLOUR · NASA GIBS</span>`;
  }
  async function fetchPulse() {
    const tok = ++st.token;
    st.loading = true; st.error = null; render();
    const { lat, lon, name } = st.place;
    try {
      const d = await getJson(`/api/pulse?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}${name ? `&name=${encodeURIComponent(name)}` : ''}`);
      if (tok !== st.token) return;
      st.data = d;
    } catch {
      if (tok !== st.token) return;
      st.data = null; st.error = true;
    }
    st.loading = false;
    render();
  }

  // ---------- pieces ----------
  const tile = (label, value, sub, src, tone = '') => `<div class="ph-tile ${tone}"><span class="ph-tk">${esc(label)}</span><b>${value}</b><em>${sub}</em><small>${esc(src)}</small></div>`;
  function tiles(p, d) {
    const o = p.observed;
    const out = [];
    if (o) {
      const r7 = o.rain7, r30 = o.rain30;
      out.push(tile('RAIN · LAST 7 DAYS', `${r0(r7.mm)}<u>mm</u>`, r7.normalMm != null ? `normal ${r0(r7.normalMm)} mm` : '', 'NASA POWER · IMERG', r7.normalMm != null && r7.mm > r7.normalMm * 2 && r7.mm - r7.normalMm > 20 ? 'hot' : ''));
      out.push(tile('RAIN · LAST 30 DAYS', `${r0(r30.mm)}<u>mm</u>`, d.ratio30 != null ? `${d.ratio30.toFixed(1)}× normal (${r0(r30.normalMm)} mm)` : '', 'NASA POWER · IMERG', d.ratio30 >= 2 ? 'hot' : d.ratio30 != null && d.ratio30 <= 0.3 && r30.normalMm >= 30 ? 'warm' : ''));
      if (o.soilWetness != null) out.push(tile('SOIL WETNESS', `${r0(o.soilWetness * 100)}<u>%</u>`, o.soilNormal != null ? `normal ${r0(o.soilNormal * 100)}% · ${o.soilWetness >= 0.75 ? 'saturated: rain will run off' : o.soilWetness <= 0.3 ? 'dry' : 'can still absorb rain'}` : '', 'NASA POWER · GWETTOP', o.soilWetness >= 0.75 ? 'hot' : ''));
      if (o.tempAnomaly7C != null) out.push(tile('TEMPERATURE · 7 DAYS', `${o.tempAnomaly7C >= 0 ? '+' : ''}${o.tempAnomaly7C.toFixed(1)}<u>°C</u>`, `vs normal · range ${r0(o.coldest7C)}–${r0(o.hottest7C)} °C`, 'NASA POWER · MERRA-2', o.tempAnomaly7C >= 3 ? 'hot' : ''));
    }
    const f = p.fires;
    if (f) out.push(tile('FIRES NEARBY', `${f.within50km}<u>≤50 km</u>`, f.within150km ? `${f.within150km} within 150 km${f.nearest ? ` · nearest ${f.nearest.km} km` : ''}` : 'none within 150 km', 'NASA FIRMS · last ~24 h', f.within50km >= 10 ? 'hot' : f.within50km ? 'warm' : ''));
    const ev = (p.events || []).find((e) => e.category !== 'wildfires');
    out.push(tile('OPEN EVENTS', ev ? `${ev.km.toLocaleString()}<u>km</u>` : '—', ev ? esc(ev.title) : 'no storm, eruption or flood within 1,000 km', 'NASA EONET', ev && ev.km <= 600 ? 'warm' : ''));
    const L = p.landslides;
    if (L) out.push(tile('LANDSLIDE HISTORY', `${L.count}<u>≤50 km</u>`, L.count ? `${L.fatalities} deaths · mostly ${esc(L.topTrigger)}` : 'none recorded', `NASA Global Landslide Catalog ${L.period}`, L.count >= 10 ? 'warm' : ''));
    const n = p.nisar;
    if (n) out.push(tile('NISAR RADAR', n.last ? fmtIso(n.last.date) : '—', n.last ? `last pass · ${n.passes} passes since ${fmtIso(n.first)}` : 'no pass found yet', 'NISAR · NASA/JPL × ISRO', ''));
    return out.join('');
  }
  function strip(p) {
    const days = p.forecast?.days;
    if (!days?.length) return '<p class="ph-miss">The forecast service did not answer. NASA measurements above are unaffected.</p>';
    const max = Math.max(10, ...days.map((x) => x.rainMm || 0));
    const t = st.thresholds;
    return `<div class="ph-strip">${days.map((x) => {
      const flag = st.persona === 'farmer' && (x.tmin <= t.frost || x.tmax >= t.heat) ? ' flag' : '';
      return `<div class="ph-day${flag}" title="${esc(x.date)}: ${x.rainMm} mm, ${x.tmin}–${x.tmax} °C"><span>${dayName(x.date)}</span><i><u style="height:${Math.max(3, ((x.rainMm || 0) / max) * 100)}%"></u></i><b>${x.rainMm >= 1 ? r0(x.rainMm) : '0'}<small>mm</small></b><em>${r0(x.tmax)}°<s>${r0(x.tmin)}°</s></em></div>`;
    }).join('')}</div><p class="ph-src">Forecast: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (NOAA GFS / ECMWF) — <b>not NASA</b>, the app's only non-NASA input.</p>`;
  }
  function personaExtra(p, d) {
    const t = st.thresholds;
    if (st.persona === 'farmer') {
      const field = (k, label, unit, min, max, step) => `<label class="ph-th"><span>${label}</span><input type="number" data-th="${k}" value="${t[k]}" min="${min}" max="${max}" step="${step}" inputmode="decimal" /><em>${unit}</em></label>`;
      return `<details class="ph-box" ${prefs.openThresholds ? 'open' : ''}><summary>YOUR ALERT LINES</summary>
        <p class="ph-note">Pulse warns you when the forecast or NASA's measurements cross these. They are saved on this device.</p>
        ${field('heavyRain7', 'Heavy rain over 7 days', 'mm', 10, 500, 5)}${field('drySpell', 'Dry spell', 'days', 3, 60, 1)}${field('heat', 'Heat stress at', '°C', 25, 50, 1)}${field('frost', 'Frost at', '°C', -10, 5, 1)}
        <button class="ph-link" data-a="reset-th">Reset to defaults</button></details>`;
    }
    if (st.persona === 'climber') {
      const alt = t.altitude;
      const at = d.elev != null && d.hottest ? `${r0(atAltitude(d.coldest.tmin, d.elev, alt))} to ${r0(atAltitude(d.hottest.tmax, d.elev, alt))} °C` : '—';
      return `<div class="ph-box"><div class="ph-alt"><span class="ph-tk">MY OBJECTIVE ALTITUDE</span><b id="ph-alt-v">${alt.toLocaleString()} m</b></div>
        <input class="ph-range" type="range" data-th="altitude" min="1000" max="8800" step="100" value="${alt}" aria-label="Objective altitude" />
        <div class="ph-grid3"><div><span class="ph-tk">GROUND</span><b>${d.elev != null ? `${r0(d.elev).toLocaleString()} m` : '—'}</b></div><div><span class="ph-tk">FREEZING LEVEL</span><b>${d.freezingLevelM != null ? `${d.freezingLevelM.toLocaleString()} m` : '—'}</b></div><div><span class="ph-tk">AT ${alt.toLocaleString()} M</span><b id="ph-alt-t">${at}</b></div></div>
        <p class="ph-note">Estimated from the forecast at the ${d.elev != null ? `${r0(d.elev)} m` : ''} grid cell with the standard lapse rate (6.5 °C per 1,000 m). Wind chill not included.</p>
        <p class="ph-note">Go deeper: <a href="https://data.nasa.gov/dataset/?q=glacial+lake+inventory" target="_blank" rel="noopener">High Mountain Asia glacial lakes ↗</a> · <a href="https://data.nasa.gov/dataset/?q=landslide+nowcast" target="_blank" rel="noopener">NASA LHASA landslide nowcast ↗</a> · <button class="ph-link" data-a="globe-snow">snow cover on the globe</button></p></div>`;
    }
    return '';
  }

  // ---------- render ----------
  function render() {
    const { place } = st;
    const p = st.data;
    const head = `<div class="ph-top"><p class="ph-usp">Your weather app tells you if it will rain. <b>Pulse tells you what the rain will do.</b></p>
      <form class="ph-search" id="ph-search" autocomplete="off" role="search"><input id="ph-q" type="search" placeholder="Search any place on Earth" aria-label="Search a place" /><button type="button" data-a="locate" title="Use my location" aria-label="Use my location">◎</button><ul id="ph-results" hidden></ul></form>
      <div class="ph-quick" role="list">${QUICK_PLACES.map(([n]) => `<button role="listitem" data-q="${esc(n)}" aria-pressed="${n === place.name}">${esc(n)}</button>`).join('')}</div>
      <div class="ph-personas" role="tablist">${PERSONAS.map((x) => `<button role="tab" data-persona="${x.id}" aria-selected="${x.id === st.persona}" title="${esc(x.blurb)}">${esc(x.label)}</button>`).join('')}</div></div>`;
    const where = `<div class="ph-where"><h1>${esc(place.name || 'Selected place')}</h1><span>${coord(place.lat, place.lon)}${p?.observed?.elevationM != null ? ` · ${r0(p.observed.elevationM).toLocaleString()} m` : ''}</span></div>`;
    let bodyHtml;
    if (st.loading && !p) bodyHtml = `<div class="ph-loading"><i></i><span>Reading NASA POWER, FIRMS, EONET, the landslide catalog and NISAR passes…</span><small>The first look at a new place can take up to a minute; after that it is cached.</small></div>`;
    else if (st.error) bodyHtml = `<div class="ph-loading err"><span>The NASA data service did not answer for this place. Nothing is substituted.</span><button class="ph-link" data-a="retry">Try again</button></div>`;
    else if (p) {
      const a = assess(p, st.persona, st.thresholds), d = derive(p), lvl = LEVELS[a.level];
      bodyHtml = `<div class="ph-hero" style="--c:${lvl.color}"><span class="ph-level"><i></i>${lvl.label}${st.loading ? ' · UPDATING' : ''}</span><h2>${esc(a.headline)}</h2><p>${esc(a.detail)}</p></div>
        ${a.alerts.length ? `<ul class="ph-alerts">${a.alerts.map((x) => `<li style="--c:${LEVELS[x.level].color}"><i>${ICON[x.kind] || '•'}</i><div><b>${esc(x.title)}</b><p>${esc(x.detail)}</p></div></li>`).join('')}</ul>` : ''}
        ${personaExtra(p, d)}
        <h3 class="ph-h">NEXT 7 DAYS</h3>${strip(p)}
        <h3 class="ph-h">MEASURED FROM ORBIT · NASA</h3><div class="ph-tiles">${tiles(p, d)}</div>
        <p class="ph-src">NASA data to ${fmtYmd(p.observed?.asOf)} (NASA POWER runs ~2 days behind) · fires and events: last day · ${p.missing?.length ? `<b>unavailable: ${esc(p.missing.join(', '))}</b> · ` : ''}<a href="#" data-a="how">how this works</a></p>`;
    } else bodyHtml = '';
    el.innerHTML = `${head}<div class="ph-card">${where}${bodyHtml}</div>
      <div class="ph-foot"><button class="ph-cta" data-a="globe">GO DEEPER · RADAR &amp; LAYERS →</button><button class="ph-cta ghost" data-a="mission">▶ THE MISSION</button></div>`;
  }

  // ---------- search ----------
  async function search(q) {
    const res = $('#ph-results');
    res.hidden = false; res.innerHTML = '<li class="ph-tk">SEARCHING…</li>';
    try {
      const r = await getJson(`/api/locations/search?q=${encodeURIComponent(q)}`, 12000);
      const list = (r.results || []).slice(0, 6);
      res.innerHTML = list.map((x, k) => `<li><button type="button" data-r="${k}">${esc([x.name, x.detail].filter(Boolean).join(', '))}</button></li>`).join('') || '<li class="ph-tk">NO PLACE FOUND</li>';
      res.onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b) return; const x = list[Number(b.dataset.r)]; res.hidden = true; setPlace({ name: x.name, lat: x.lat, lon: x.lon }); };
    } catch { res.innerHTML = '<li class="ph-tk">SEARCH UNAVAILABLE</li>'; }
  }

  // ---------- events ----------
  el.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) { const x = QUICK_PLACES.find(([n]) => n === q.dataset.q); return setPlace({ name: x[0], lat: x[1], lon: x[2] }); }
    const per = e.target.closest('[data-persona]');
    if (per) { st.persona = per.dataset.persona; persist(); return render(); }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'globe') hide();
    if (a === 'mission') app.film?.start(0);
    if (a === 'retry') fetchPulse();
    if (a === 'reset-th') { st.thresholds = { ...DEFAULT_THRESHOLDS, altitude: st.thresholds.altitude }; persist(); render(); }
    if (a === 'how') { e.preventDefault(); toast('NASA POWER gives rain, temperature, soil wetness and snow at your point, compared with its 2001–2025 normal. FIRMS shows fires seen from orbit in the last day, EONET open storms and eruptions, the Global Landslide Catalog past slope failures, and NISAR when its radar last imaged you. Only the 7-day forecast is not NASA (Open-Meteo). Alerts fire when those numbers cross stated lines; this is guidance, not an official warning.', 14000); }
    if (a === 'globe-snow') { hide(); setTimeout(() => app.mission?.setLayer('snow', true), 400); }
    if (a === 'locate') {
      if (!navigator.geolocation) return toast('Location is not available in this browser.');
      navigator.geolocation.getCurrentPosition((pos) => setPlace({ name: 'My location', lat: pos.coords.latitude, lon: pos.coords.longitude }), () => toast('Location permission was not given.'), { timeout: 10000 });
    }
  });
  el.addEventListener('submit', (e) => { if (e.target.id === 'ph-search') { e.preventDefault(); const q = $('#ph-q').value.trim(); if (q.length > 1) search(q); } });
  el.addEventListener('toggle', (e) => { if (e.target.matches('details')) { prefs.openThresholds = e.target.open; persist(); } }, true);
  el.addEventListener('change', (e) => {
    const k = e.target.dataset?.th;
    if (!k || k === 'altitude') return;
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    st.thresholds[k] = v; persist(); render();
  });
  el.addEventListener('input', (e) => {
    if (e.target.dataset?.th !== 'altitude') return;
    st.thresholds.altitude = Number(e.target.value);
    $('#ph-alt-v').textContent = `${st.thresholds.altitude.toLocaleString()} m`;
    clearTimeout(st.altT); st.altT = setTimeout(() => { persist(); render(); }, 350);
  });

  // ---------- show / hide ----------
  function hide({ silent = false } = {}) {
    if (!st.open) return;
    st.open = false;
    el.hidden = true; veil.hidden = true;
    document.body.classList.remove('home-on');
    $('#btn-pulse').hidden = false;
    app.startGlobe();
    if (!silent) {
      if (innerWidth >= 1180) app.mission?.setOpen(true);
      const { lat, lon, name } = st.place;
      if (app.mission) setTimeout(() => app.mission.probe(lat, lon, name), 300);
    }
  }
  function show() {
    if (app.film && document.body.classList.contains('mission-on')) return;
    st.open = true;
    el.hidden = false; veil.hidden = false;
    document.body.classList.add('home-on');
    $('#btn-pulse').hidden = true;
    app.mission?.setOpen(false);
    if (app.state.view !== 'home') app.goHome();
    focusGlobe();
  }
  $('#btn-pulse').addEventListener('click', show);

  // Deep links that go straight to the globe skip the card.
  const qp = new URLSearchParams(location.search);
  if (['demo', 'story', 'change', 'mission', 'event', 'probe', 'globe'].some((k) => qp.has(k))) { st.open = true; hide({ silent: true }); }
  else { document.body.classList.add('home-on'); render(); focusGlobe(); fetchPulse(); }

  return { show, hide, get open() { return st.open; }, setPlace };
}
