// Chapters 1–2: Earth's vital signs and the long records behind them.
// (Written with AI assistance — see README → AI disclosure.)
import { $, esc, liveOrArchived, srcLine, how, errorBox, fmtDay, MONTH } from './lib.js';
import { lineChart, legend, stripes, countUp } from './charts.js';

let vitalsP = null;
export const loadVitals = () => (vitalsP ||= liveOrArchived('/api/vitals', '/data/story/vitals.json', { timeout: 60000 }).then(async (v) => {
  // A source that is down on the server may still exist in the shipped snapshot.
  if (Object.values(v).some((x) => x?.unavailable)) {
    try {
      const snap = await (await fetch('/data/story/vitals.json')).json();
      for (const k of Object.keys(v)) if (v[k]?.unavailable && snap[k]) v[k] = { ...snap[k], freshness: 'ARCHIVED' };
    } catch { /* keep the unavailable state */ }
  }
  return v;
}));

function spark(points, color) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(((p[0] - x0) / (x1 - x0)) * 300).toFixed(1)},${(44 - ((p[1] - y0) / (y1 - y0 || 1)) * 40).toFixed(1)}`).join('');
  return `<div class="spark"><svg viewBox="0 0 300 46" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg></div>`;
}

const stamp = (v) => (v.freshness === 'ARCHIVED' ? `saved ${fmtDay(v.snapshotAt || v.fetchedAt)}` : `read ${fmtDay(v.fetchedAt)}`);

function card({ c, label, value, decimals, prefix = '', unit, what, sparkPts, v, srcKey, howHtml }) {
  return `<article class="vital reveal" style="--c:${c}">
    <div class="vital-label"><span class="beat"></span>${esc(label)}</div>
    <div class="vital-value"><span data-count="${value}" data-dec="${decimals}" data-prefix="${prefix}">—</span><small>${esc(unit)}</small></div>
    <p class="vital-what">${what}</p>
    ${sparkPts ? spark(sparkPts, c) : ''}
    ${srcLine(srcKey, { freshness: v.freshness, date: stamp(v) })}
    ${how(howHtml)}
  </article>`;
}

export async function initVitals() {
  const host = $('#vitals');
  let v;
  try { v = await loadVitals(); } catch { host.innerHTML = errorBox('The vital-signs feed'); return; }
  const out = [];
  const t = v.temperature, c = v.co2, s = v.seaLevel, i = v.seaIce;
  if (t && !t.unavailable) {
    const val = t.last12MonthMean + t.baselineShift;
    out.push(card({
      c: '#ff7a5c', label: 'Global temperature', value: val, decimals: 2, prefix: '+', unit: '°C',
      what: `above the 1880–1899 average, over the 12 months to <b>${MONTH[t.latestMonth.month - 1]} ${t.latestMonth.year}</b>. That month alone was <b>+${(t.latestMonth.anomaly + t.baselineShift).toFixed(2)} °C</b>.`,
      sparkPts: t.annual.slice(-60), v: t, srcKey: ['gistemp'],
      howHtml: `<p>NASA GISTEMP publishes monthly anomalies relative to 1951–1980. We average the latest 12 months (${t.last12MonthMean.toFixed(2)} °C) and add ${t.baselineShift.toFixed(2)} °C — the difference between the 1951–1980 and 1880–1899 means in the same dataset — to express warming since the start of the instrumental record. 1880–1899 is used as a pre-industrial proxy because this dataset starts in 1880; the IPCC uses 1850–1900.</p>`,
    }));
  } else out.push(`<article class="vital" style="--c:#ff7a5c"><div class="vital-label">Global temperature</div>${errorBox('NASA GISTEMP')}</article>`);
  if (c && !c.unavailable) {
    out.push(card({
      c: '#ffd166', label: 'Carbon dioxide', value: c.latestMonth.ppm, decimals: 1, unit: 'ppm',
      what: `monthly mean at Mauna Loa, <b>${MONTH[c.latestMonth.month - 1]} ${c.latestMonth.year}</b> — <b>${Math.round((c.latestMonth.ppm / c.preIndustrial - 1) * 100)}%</b> above the pre-industrial 280 ppm, and ${c.yearOverYear > 0 ? '+' : ''}${c.yearOverYear} ppm on a year earlier.`,
      sparkPts: c.annual, v: c, srcKey: ['noaa_co2', 'climate_nasa'],
      howHtml: `<p>The latest monthly mean from NOAA's Mauna Loa record (the series NASA shows on climate.nasa.gov). The year-on-year change compares it with the same month a year before. ${esc(c.preIndustrialNote)}</p>`,
    }));
  } else out.push(`<article class="vital" style="--c:#ffd166"><div class="vital-label">Carbon dioxide</div>${errorBox('NOAA CO₂')}</article>`);
  if (s && !s.unavailable) {
    const yr = Math.floor(s.latest.decimalYear), mo = MONTH[Math.min(11, Math.floor((s.latest.decimalYear % 1) * 12))];
    out.push(card({
      c: '#48d6ff', label: 'Sea level', value: s.riseSinceStartMm, decimals: 0, prefix: '+', unit: 'mm',
      what: `higher than in ${s.startYear + 1}, measured by satellite radar altimeters. The trend is <b>${s.trendMmPerYear} mm a year</b>. Latest data: <b>${mo} ${yr}</b>.`,
      sparkPts: s.series, v: s, srcKey: ['noaa_lsa', 'sealevel_nasa'],
      howHtml: `<p>Mean of the last 12 months of data minus the mean of the first 12 months (${s.startYear}–${s.startYear + 1}), from the TOPEX/Poseidon → Jason → Sentinel-6 Michael Freilich altimeter series, seasonal signal removed. The trend is the one published in the file's header. The public file currently ends in ${mo} ${yr}.</p>`,
    }));
  } else out.push(`<article class="vital" style="--c:#48d6ff"><div class="vital-label">Sea level</div>${errorBox('The altimetry record')}</article>`);
  if (i && !i.unavailable) {
    out.push(card({
      c: '#c8e9ff', label: 'Arctic sea ice', value: i.latest.extent, decimals: 2, unit: 'million km²',
      what: `on <b>${fmtDay(i.latest.date)}</b> — <b>${i.anomalyPct.toFixed(1)}%</b> against the 1981–2010 average for this day (${i.sameDayMean1981_2010}). September ice is shrinking by <b>${Math.abs(i.septemberTrend.perDecadePct).toFixed(1)}% a decade</b>.`,
      sparkPts: i.september, v: i, srcKey: ['nsidc'],
      howHtml: `<p>The latest daily extent from the NSIDC Sea Ice Index, compared with the mean of the same calendar day in 1981–2010 (NSIDC's reference period). The decadal figure is a least-squares trend through every September mean since 1979, expressed against the 1981–2010 September mean.</p>`,
    }));
  } else out.push(`<article class="vital" style="--c:#c8e9ff"><div class="vital-label">Arctic sea ice</div>${errorBox('NSIDC sea ice')}</article>`);
  host.innerHTML = out.join('');
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    e.target.classList.add('in');
    const n = e.target.querySelector('[data-count]');
    if (n) countUp(n, Number(n.dataset.count), { decimals: Number(n.dataset.dec), prefix: n.dataset.prefix || '' });
  }), { threshold: 0.3 });
  host.querySelectorAll('.vital').forEach((n) => io.observe(n));
}

export async function initWarming() {
  let v;
  try { v = await loadVitals(); } catch { $('#stripes').innerHTML = errorBox('The climate records'); return; }
  const t = v.temperature, c = v.co2, s = v.seaLevel, i = v.seaIce;
  const draw = () => {
    if (t && !t.unavailable) {
      const read = $('#stripes-read');
      stripes($('#stripes'), t.annual, { onHover: (y, a) => { read.textContent = `${y}  ·  ${a > 0 ? '+' : ''}${a.toFixed(2)} °C vs 1951–1980`; } });
      const smooth = t.annual.map((p, k, a) => { const w = a.slice(Math.max(0, k - 4), k + 5); return [p[0], w.reduce((q, r) => q + r[1], 0) / w.length]; });
      lineChart($('#chart-temp'), {
        series: [{ label: 'Annual mean', color: 'rgba(255,122,92,.45)', points: t.annual, width: 1.2 }, { label: '9-year average', color: '#ff7a5c', points: smooth, width: 2.4 }],
        yFmt: (y) => `${y > 0 ? '+' : ''}${y.toFixed(1)}°`, yLabel: '°C vs 1951–1980', height: 280,
      });
      const first = t.annual.slice(0, 20).reduce((a, b) => a + b[1], 0) / 20, last = t.annual.slice(-10).reduce((a, b) => a + b[1], 0) / 10;
      $('#note-temp').innerHTML = legend([{ label: 'Annual mean', color: 'rgba(255,122,92,.45)' }, { label: '9-year average', color: '#ff7a5c' }])
        + srcLine('gistemp', { freshness: t.freshness, date: stamp(t) })
        + how(`<p>Annual January–December means from GISTEMP v4 (land and ocean). The last ten complete years average ${(last - first).toFixed(2)} °C warmer than 1880–1899. The bold line is a centred 9-year running mean, drawn only to show the trend.</p>`);
    } else { $('#stripes').innerHTML = errorBox('NASA GISTEMP'); $('#chart-temp').innerHTML = errorBox('NASA GISTEMP'); }
    if (c && !c.unavailable) {
      const pts = c.monthly.map((m) => [m[0] + (m[1] - 0.5) / 12, m[2]]);
      lineChart($('#chart-co2'), { series: [{ label: 'Monthly mean', color: '#ffd166', points: pts, width: 1.4 }, { label: 'Seasonal cycle removed', color: '#fff', points: c.monthly.map((m) => [m[0] + (m[1] - 0.5) / 12, m[3]]), width: 1.2 }], yFmt: (y) => `${Math.round(y)}`, yLabel: 'ppm', height: 280 });
      $('#note-co2').innerHTML = legend([{ label: 'Monthly mean', color: '#ffd166' }, { label: 'Seasonal cycle removed', color: '#fff' }])
        + srcLine('noaa_co2', { freshness: c.freshness, date: stamp(c) })
        + how(`<p>Direct measurements at Mauna Loa Observatory since March 1958: ${c.monthly[0][2]} ppm then, ${c.latestMonth.ppm} ppm in ${MONTH[c.latestMonth.month - 1]} ${c.latestMonth.year}. The yearly zig-zag is northern-hemisphere plants taking up CO₂ in summer and releasing it in winter.</p>`);
    } else $('#chart-co2').innerHTML = errorBox('NOAA CO₂');
    if (s && !s.unavailable) {
      lineChart($('#chart-sea'), { series: [{ label: 'Global mean sea level', color: '#48d6ff', points: s.series, width: 1.8, area: true }], yFmt: (y) => `${Math.round(y)} mm`, yLabel: 'mm, relative to the series reference', height: 280 });
      $('#note-sea').innerHTML = srcLine(['noaa_lsa', 'sealevel_nasa'], { freshness: s.freshness, date: stamp(s) })
        + how(`<p>Every point is a ~10-day global average from satellite radar altimeters, seasonal signal removed, no glacial isostatic adjustment applied. Published trend: ${s.trendMmPerYear} mm per year since ${s.startYear}.</p>`);
    } else $('#chart-sea').innerHTML = errorBox('The altimetry record');
    if (i && !i.unavailable) {
      const tr = i.septemberTrend, x0 = i.september[0][0], x1 = i.september.at(-1)[0];
      lineChart($('#chart-ice'), {
        series: [{ label: 'September mean extent', color: '#c8e9ff', points: i.september, width: 1.8, dots: true }, { label: 'Linear trend', color: '#ff5fa2', points: [[x0, tr.intercept + tr.slope * x0], [x1, tr.intercept + tr.slope * x1]], dashed: true, width: 1.4, noTip: true }],
        yFmt: (y) => y.toFixed(1), yLabel: 'million km²', height: 280,
      });
      $('#note-ice').innerHTML = legend([{ label: 'September mean extent', color: '#c8e9ff' }, { label: 'Linear trend', color: '#ff5fa2', dashed: true }])
        + srcLine('nsidc', { freshness: i.freshness, date: stamp(i) })
        + how(`<p>September is when Arctic sea ice reaches its yearly minimum. Each point is the mean of that month's daily extents (NSIDC Sea Ice Index, passive-microwave satellites). Trend: ${tr.perDecadeMkm2} million km² per decade (${tr.perDecadePct}% of the 1981–2010 mean).</p>`);
    } else $('#chart-ice').innerHTML = errorBox('NSIDC sea ice');
  };
  draw();
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 250); });
}
