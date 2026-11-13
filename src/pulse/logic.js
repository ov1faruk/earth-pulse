// PULSE logic — turns one /api/pulse payload into plain-language alerts for a
// persona. Pure functions (no DOM), shared by the home card and the tests.
// Every alert names the measurement it comes from; thresholds are the user's.
// (Written with AI assistance — see README → AI disclosure.)

export const LEVELS = {
  calm: { rank: 0, label: 'ALL CLEAR', color: '#7fe6ff' },
  watch: { rank: 1, label: 'WATCH', color: '#ffd166' },
  warning: { rank: 2, label: 'WARNING', color: '#ff9447' },
  danger: { rank: 3, label: 'DANGER', color: '#ff4d6d' },
};

export const PERSONAS = [
  { id: 'everyone', label: 'Everyone', blurb: 'Floods, heat, fire and storms around you' },
  { id: 'farmer', label: 'Farmer', blurb: 'Rain thresholds, dry spells, heat stress and frost for your fields' },
  { id: 'climber', label: 'Climber', blurb: 'Melt, freezing level, fresh snow and slope failure in the mountains' },
];

export const DEFAULT_THRESHOLDS = {
  heavyRain7: 60, // mm over the next 7 days that would harm a crop or flood a field
  drySpell: 14, // days in a row without 1 mm of rain
  heat: 35, // °C daytime high that stresses crops and livestock
  frost: 0, // °C night low
  altitude: 4500, // m, the climber's objective
};

const LAPSE = 6.5; // °C per 1,000 m — standard atmosphere
const r0 = (v) => Math.round(v);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayName = (iso) => DAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** Numbers every persona uses, computed once. Missing inputs stay null. */
export function derive(p) {
  const o = p.observed || null;
  const days = p.forecast?.days || [];
  const fc7 = days.length ? sum(days.map((d) => d.rainMm || 0)) : null;
  const wettest = days.length ? days.reduce((a, d) => ((d.rainMm || 0) > (a.rainMm || 0) ? d : a)) : null;
  const hottest = days.length ? days.reduce((a, d) => (d.tmax > a.tmax ? d : a)) : null;
  const coldest = days.length ? days.reduce((a, d) => (d.tmin < a.tmin ? d : a)) : null;
  const ratio30 = o?.rain30?.normalMm > 0 ? o.rain30.mm / o.rain30.normalMm : null;
  // Dry spell: days without ≥1 mm counted back from the latest NASA day, then on through dry forecast days.
  let dryRun = 0;
  if (o?.series?.length) for (let i = o.series.length - 1; i >= 0 && (o.series[i].rain ?? 0) < 1; i--) dryRun++;
  let dryAhead = 0;
  for (const d of days) { if ((d.rainMm || 0) >= 1) break; dryAhead++; }
  const elev = o?.elevationM ?? null;
  return {
    fc7, wettest, hottest, coldest, ratio30, dryRun, dryAhead,
    soil: o?.soilWetness ?? null, soilNormal: o?.soilNormal ?? null,
    anomaly: o?.tempAnomaly7C ?? null, elev,
    // Freezing level from the forecast high at the grid-cell elevation (estimate).
    freezingLevelM: elev != null && hottest ? r0(elev + (Math.max(0, hottest.tmax) / LAPSE) * 1000) : null,
  };
}

/** Temperature at another altitude, from a value at `fromM` (standard lapse rate). */
export const atAltitude = (tC, fromM, toM) => tC - ((toM - fromM) / 1000) * LAPSE;

function common(p, d, add) {
  const name = p.name || 'this place';
  // Flood / landslide: wet ground + more rain coming is the combination that matters.
  if (d.soil != null && d.fc7 != null) {
    if (d.soil >= 0.75 && d.fc7 >= 50) add('danger', 'flood', `Saturated ground and ${r0(d.fc7)} mm more rain this week`, `The soil is ${r0(d.soil * 100)}% wet, so new rain will run off instead of soaking in. Expect flash floods in low ground and landslides on slopes, worst around ${dayName(d.wettest.date)}.`);
    else if (d.soil >= 0.75 && d.fc7 >= 20) add('warning', 'flood', `Wet ground, ${r0(d.fc7)} mm of rain on the way`, `The soil is already ${r0(d.soil * 100)}% wet. Drains and streams will rise faster than usual.`);
    else if (d.fc7 >= 100) add('warning', 'flood', `${r0(d.fc7)} mm of rain forecast in 7 days`, 'That is a flood-producing amount almost anywhere. Watch rivers and slopes.');
  }
  if (d.ratio30 != null && d.ratio30 >= 2 && p.observed.rain30.mm - p.observed.rain30.normalMm >= 50)
    add('watch', 'rain', `A very wet month: ${d.ratio30.toFixed(1)}× normal rain`, `${r0(p.observed.rain30.mm)} mm fell in 30 days against a normal ${r0(p.observed.rain30.normalMm)} mm (NASA POWER).`);
  if (d.ratio30 != null && p.observed.rain30.normalMm >= 30 && d.ratio30 <= 0.3 && (d.soil ?? 1) <= 0.4)
    add('watch', 'drought', 'Drought is building', `Only ${r0(p.observed.rain30.mm)} mm in 30 days against a normal ${r0(p.observed.rain30.normalMm)} mm, and the soil is drying out.`);
  // Heat
  if (d.hottest) {
    if (d.hottest.tmax >= 40) add('danger', 'heat', `Dangerous heat: ${r0(d.hottest.tmax)} °C on ${dayName(d.hottest.date)}`, 'Avoid exertion from late morning to late afternoon; check on older people and children.');
    else if (d.hottest.tmax >= 35) add('warning', 'heat', `Hot days ahead, up to ${r0(d.hottest.tmax)} °C`, 'Drink often and keep out of the midday sun.');
  }
  if (d.anomaly != null && d.anomaly >= 3) add('watch', 'heat', `${d.anomaly.toFixed(1)} °C warmer than normal this week`, 'NASA POWER: the last 7 days against the 2001–2025 normal for the month.');
  // Fire
  const f = p.fires;
  if (f?.within50km >= 10) add('warning', 'fire', `${f.within50km} active fires within 50 km`, `Seen from orbit in the last day by ${f.nearest?.sat || 'NASA FIRMS'}. Expect smoke; be ready to leave if fire nears.`);
  else if (f?.within50km >= 1) add('watch', 'fire', `${f.within50km} fire detection${f.within50km > 1 ? 's' : ''} within 50 km`, `Nearest ${f.nearest.km} km away (${f.nearest.sat}). Often crop burning; still check the smoke.`);
  // Declared events (storms, volcanoes, floods, ice) near the place
  const ev = (p.events || []).find((e) => e.category !== 'wildfires' && e.km <= 600);
  if (ev) add(ev.km <= 250 ? 'warning' : 'watch', 'event', `${ev.title}, ${ev.km} km away`, `${ev.categoryTitle} tracked by NASA EONET${ev.magnitude ? ` · ${ev.magnitude}` : ''}.`);
  return name;
}

function farmer(p, d, t, add) {
  if (d.fc7 != null) {
    if (d.fc7 >= t.heavyRain7) add('warning', 'rain', `Your heavy-rain line is crossed: ${r0(d.fc7)} mm this week`, `You set ${t.heavyRain7} mm. Most falls on ${dayName(d.wettest.date)} (${r0(d.wettest.rainMm)} mm). Harvest ripe crops, clear field drains, hold off fertiliser and spraying.`);
    else if (d.fc7 >= t.heavyRain7 * 0.6) add('watch', 'rain', `${r0(d.fc7)} mm this week, near your ${t.heavyRain7} mm line`, 'Plan field work for the drier days.');
  }
  const run = d.dryRun + d.dryAhead;
  if (run >= t.drySpell) add('warning', 'drought', `${run} days without real rain`, `${d.dryRun} dry days so far (NASA POWER) and ${d.dryAhead} more in the forecast. Your line is ${t.drySpell}. Plan irrigation and mulch to keep soil moisture.`);
  else if (run >= t.drySpell * 0.7) add('watch', 'drought', `Dry spell of ${run} days building`, `Your line is ${t.drySpell} days.`);
  const hot = (p.forecast?.days || []).filter((x) => x.tmax >= t.heat);
  if (hot.length >= 3) add('warning', 'heat', `${hot.length} days at or above ${t.heat} °C`, 'Heat stress for crops at flowering and for livestock. Water early or late, give animals shade.');
  else if (hot.length) add('watch', 'heat', `${hot.length} day${hot.length > 1 ? 's' : ''} at or above ${t.heat} °C`, `${hot.map((x) => dayName(x.date)).join(', ')}.`);
  const frost = (p.forecast?.days || []).filter((x) => x.tmin <= t.frost);
  if (frost.length) add('warning', 'frost', `Frost risk: ${r0(Math.min(...frost.map((x) => x.tmin)))} °C on ${dayName(frost[0].date)}`, 'Cover seedlings, harvest frost-tender crops, protect water pipes.');
  if (d.soil != null && d.soilNormal != null) {
    if (d.soil <= d.soilNormal - 0.15) add('watch', 'soil', `Soil drier than normal: ${r0(d.soil * 100)}% wet`, `Normal for the month is ${r0(d.soilNormal * 100)}% (NASA POWER, surface soil wetness). Irrigation pays off now.`);
    if (d.soil >= 0.85) add('watch', 'soil', `Waterlogged soil: ${r0(d.soil * 100)}% wet`, 'Keep heavy machinery off the fields; roots suffocate in standing water.');
  }
}

function climber(p, d, t, add) {
  const o = p.observed;
  if (d.anomaly != null && d.anomaly >= 2) add(d.anomaly >= 4 ? 'warning' : 'watch', 'melt', `${d.anomaly.toFixed(1)} °C warmer than normal`, 'More meltwater, icefall and rockfall, worst in the afternoon. Move early, be off exposed ground by midday, and watch glacial lakes and streams.');
  if (d.freezingLevelM != null && d.elev != null) {
    const at = atAltitude(d.hottest.tmax, d.elev, t.altitude), lo = atAltitude(d.coldest.tmin, d.elev, t.altitude);
    if (d.freezingLevelM > t.altitude) add('watch', 'melt', `Above freezing at ${t.altitude.toLocaleString()} m`, `Estimated freezing level ${d.freezingLevelM.toLocaleString()} m. Snow bridges and seracs weaken in the heat of the day.`);
    if (lo <= -20) add('warning', 'cold', `Down to about ${r0(lo)} °C at ${t.altitude.toLocaleString()} m`, 'Frostbite weather before wind chill. Check your layers.');
    else if (at < 0 && lo < 0) add('calm', 'cold', `Frozen at ${t.altitude.toLocaleString()} m (about ${r0(lo)} to ${r0(at)} °C)`, 'Firm snow and ice: usually better conditions for glacier travel.');
  }
  if (d.fc7 != null && d.fc7 >= 20) {
    const snowLine = d.freezingLevelM != null ? ` Above about ${d.freezingLevelM.toLocaleString()} m it falls as snow: fresh loading on slopes.` : '';
    add(d.fc7 >= 50 ? 'warning' : 'watch', 'slope', `${r0(d.fc7)} mm of precipitation forecast`, `Rain on steep ground triggers landslides and rockfall on approach trails.${snowLine}`);
  }
  if (o?.snowDepthCm != null && o?.snowDepth7AgoCm != null && Math.abs(o.snowDepthCm - o.snowDepth7AgoCm) >= 5) {
    const dd = o.snowDepthCm - o.snowDepth7AgoCm;
    add('watch', 'snow', `Snow on the ground ${dd > 0 ? 'grew' : 'shrank'} ${r0(Math.abs(dd))} cm in a week`, `NASA POWER (MERRA-2) snow depth at the grid cell: ${r0(o.snowDepthCm)} cm now.${dd > 0 ? ' New snow needs days to bond.' : ''}`);
  }
  const L = p.landslides;
  if (L?.count >= 10) add('watch', 'slope', `${L.count} landslides recorded within 50 km`, `${L.fatalities} deaths in the NASA Global Landslide Catalog (${L.period}). Most were triggered by ${L.topTrigger}. Where slopes failed before, they fail again.`);
}

/**
 * The card for one place and persona.
 * @returns {{ level, headline, detail, alerts: Array<{level, kind, title, detail}> }}
 */
export function assess(p, persona = 'everyone', thresholds = DEFAULT_THRESHOLDS) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const d = derive(p);
  const alerts = [];
  const add = (level, kind, title, detail) => alerts.push({ level, kind, title, detail });
  const name = common(p, d, add);
  if (persona === 'farmer') farmer(p, d, t, add);
  if (persona === 'climber') climber(p, d, t, add);
  // One alert per kind (keep the most severe), most severe first.
  const best = new Map();
  for (const a of alerts) { const b = best.get(a.kind); if (!b || LEVELS[a.level].rank > LEVELS[b.level].rank) best.set(a.kind, a); }
  const list = [...best.values()].sort((a, b) => LEVELS[b.level].rank - LEVELS[a.level].rank);
  const top = list.find((a) => a.level !== 'calm');
  if (!top) {
    const fc = d.fc7 != null ? ` ${r0(d.fc7)} mm of rain forecast this week.` : '';
    return { level: 'calm', headline: `Nothing unusual is building around ${name}.`, detail: `NASA measurements are close to normal for the season.${fc}`, alerts: list, derived: d };
  }
  return { level: top.level, headline: top.title, detail: top.detail, alerts: list.filter((a) => a !== top), derived: d };
}
