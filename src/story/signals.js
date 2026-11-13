// Chapter 7: reading the signals — what the instruments recorded before each
// disaster. All series are real NASA POWER data fetched for the event window.
// (Written with AI assistance — see README → AI disclosure.)
import { $, esc, getJson, srcLine, how, errorBox, fmtYmd, fmtInt, whenNear } from './lib.js';
import { SIGNAL_CASES, SIGNAL_NOTES } from './data.js';
import { lineChart, legend, scoreBar } from './charts.js';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const dayNum = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) / 864e5;

async function drawCase(c, host) {
  const chart = host.querySelector('.sig-chart'), note = host.querySelector('.sig-note');
  let d;
  try { d = await getJson(`/api/signals?lat=${c.lat}&lon=${c.lon}&start=${c.start}&end=${c.end}`, { timeout: 60000 }); } catch { chart.innerHTML = errorBox('NASA POWER', 'This chart needs the live data service.'); return; }
  const rain = c.param === 'PRECTOTCORR';
  const obs = Object.entries(d.daily[c.param]).filter(([, v]) => v > -900).map(([k, v]) => [dayNum(k), v, k]);
  const norm = obs.map(([x, , k]) => [x, d.climatology[c.param][MON[+k.slice(4, 6) - 1]]]);
  const ev = dayNum(c.event);
  const fmtX = (x) => { const dt = new Date(x * 864e5); return `${dt.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getUTCMonth()]}`; };
  const render = () => lineChart(chart, {
    series: [
      { label: rain ? 'Daily rain' : 'Daily maximum', color: rain ? '#48d6ff' : '#ff7a5c', points: obs, bars: rain, width: 2 },
      { label: 'Normal for the month (2001–2025)', color: '#ffffff', points: norm, dashed: true, width: 1.3 },
    ],
    marks: [{ x: ev, label: c.eventLabel.toUpperCase() }], zero: rain, height: 240,
    xFmt: fmtX, yFmt: (y) => (rain ? `${y.toFixed(y < 10 ? 1 : 0)} mm` : `${y.toFixed(1)}°`), yLabel: c.unit,
  });
  render();
  addEventListener('resize', () => { clearTimeout(render.t); render.t = setTimeout(render, 250); });

  // The read-out: the run-up window compared with normal.
  const win = rain ? 7 : 30;
  const before = obs.filter(([x]) => x > ev - win && x <= ev);
  const nb = norm.filter(([x]) => x > ev - win && x <= ev);
  let stat = '', calc = '';
  if (before.length >= win * 0.7) {
    if (rain) {
      const s = before.reduce((a, b) => a + b[1], 0), n = nb.reduce((a, b) => a + b[1], 0);
      stat = `<b>${fmtInt(s)} mm</b> fell in the ${win} days to the event — <b>${n > 0 ? (s / n).toFixed(1) : '—'}×</b> the normal ${fmtInt(n)} mm.`;
      calc = `Sum of daily rain over the ${win} days ending on ${fmtYmd(c.event)} (${s.toFixed(1)} mm) divided by the sum of the monthly-normal daily rain over the same days (${n.toFixed(1)} mm).`;
    } else {
      const s = before.reduce((a, b) => a + b[1], 0) / before.length, n = nb.reduce((a, b) => a + b[1], 0) / nb.length;
      const hot = before.filter((b, k) => b[1] > nb[k][1]).length;
      stat = `Afternoons averaged <b>${s.toFixed(1)} °C</b> in the ${win} days before — <b>${s - n >= 0 ? '+' : ''}${(s - n).toFixed(1)} °C</b> against normal, with <b>${hot} of ${before.length}</b> days hotter than normal.`;
      calc = `Mean daily maximum 2 m temperature over the ${win} days ending on ${fmtYmd(c.event)} minus the mean of the monthly-normal maximum for the same days.`;
    }
  }
  note.innerHTML = `${stat ? `<p class="stat">${stat}</p>` : ''}<p class="read">${esc(c.read)}</p>`
    + legend([{ label: rain ? 'Daily rain' : 'Daily maximum temperature', color: rain ? '#48d6ff' : '#ff7a5c' }, { label: 'Normal for the month', color: '#fff', dashed: true }])
    + srcLine('power', { freshness: d.freshness, date: `${fmtYmd(c.start)} – ${fmtYmd(c.end)}` })
    + how(`<p>NASA POWER daily ${rain ? 'precipitation (PRECTOTCORR, IMERG-corrected MERRA-2)' : 'maximum 2 m air temperature (T2M_MAX, MERRA-2)'} for the grid cell at ${c.lat}°, ${c.lon}° (about 50 km across — it averages over the terrain, so local extremes are higher). The dashed line is the 2001–2025 mean for each calendar month. ${calc}</p>`);
}

async function fireDensity() {
  const host = $('#fire-density');
  let d;
  try { d = await getJson('/api/live/fires/density', { timeout: 120000 }); } catch { host.innerHTML = errorBox('The NASA FIRMS density summary'); return; }
  const max = d.top[0]?.detections || 1;
  host.innerHTML = `<div class="density">${d.top.map((t) => `<div class="density-row"><span title="${t.lat}°, ${t.lon}°">${esc(t.place || `${t.lat}°, ${t.lon}°`)}</span>${scoreBar((t.detections / max) * 100, '#ff5f4d')}<b>${fmtInt(t.detections)}</b></div>`).join('')}</div>`
    + srcLine('firms', { freshness: d.freshness, date: `${fmtInt(d.total)} detections worldwide` })
    + how(`<p>All NASA FIRMS thermal detections from the last ~24 hours (VIIRS on NOAA-20, NOAA-21 and Suomi NPP; MODIS on Terra and Aqua) are counted in ${d.cellDegrees}° × ${d.cellDegrees}° cells. The ten densest cells are listed, named by reverse-geocoding the cell's mean position (OpenStreetMap). A detection is a thermal anomaly — it includes farm burning and gas flares as well as wildfires.</p>`);
}

export function initSignals() {
  $('#signals').innerHTML = SIGNAL_CASES.map((c) => `<article class="panel signal" data-id="${c.id}"><h4>${esc(c.title)}</h4><p class="where">${esc(c.place)}</p><div class="sig-chart"><div class="skeleton" style="height:240px"></div></div><div class="sig-note"></div></article>`).join('');
  for (const c of SIGNAL_CASES) {
    const host = $(`[data-id="${c.id}"]`);
    whenNear(host, () => drawCase(c, host), '300px');
  }
  $('#signal-notes').innerHTML = SIGNAL_NOTES.map((n) => `<article class="panel note"><span class="icon">${n.icon}</span><h4>${esc(n.title)}</h4><p>${esc(n.text)}</p>${n.link ? `<p style="margin-top:10px"><a class="btn small" href="${n.link.href}">${esc(n.link.label)} →</a></p>` : ''}${srcLine(n.src, { freshness: 'RESEARCH' })}</article>`).join('');
  whenNear($('#fire-density'), fireDensity, '300px');
}
