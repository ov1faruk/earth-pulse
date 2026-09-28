// WHO IS WATCHING THIS PLACE? — strongest *supported* claim per satellite.
// NISAR: PROVIDED THIS EVIDENCE (story frames) and OBSERVED THIS LOCATION
// (live ASF archive). Others: CAPABLE OF OBSERVING (instrument type) with a
// geometric next-pass prediction from their real TLE — never an observation claim.
import { esc, tag, fmtDate } from './dom.js';
import { CLAIM } from '../core/missions.js';
import { nextPass, nextSwathCover } from '../core/orbit.js';
import { DATA_CLASS } from '../core/dataClass.js';
import { NISAR_NORAD } from '../globe/satellites.js';

const claimTag = (c) => `<span class="tag ${c === CLAIM.PROVIDED_EVIDENCE || c === CLAIM.OBSERVED ? 'real' : 'context'}">${esc(c)}</span>`;
const hhmm = (d) => `${fmtDate(d.toISOString())} ${d.toISOString().slice(11, 16)} UTC`;

export async function computeWatching({ story, sats, now, archive }) {
  const point = { lat: story.location.lat, lon: story.location.lon };
  const rows = [];
  const nisar = sats.sats.get(NISAR_NORAD);
  const frames = story.timeline || [];
  const t0 = frames[0], tN = frames.at(-1);
  let nisarHtml = `<div style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="letter-spacing:.14em">NISAR</b>${claimTag(CLAIM.PROVIDED_EVIDENCE)}</div>
    <p style="font-size:12.5px;color:var(--ink-2);margin:6px 0 0">${frames.length} ${esc(frames[0]?.observation?.productType || '')} products used here,
    ${t0 ? fmtDate(t0.referenceDate || t0.date) : ''} → ${tN ? fmtDate(tN.date) : ''} · track ${esc(t0?.observation?.track)} · ${esc(t0?.observation?.flightDirection?.toLowerCase())}</p>`;
  if (archive?.passes) {
    const last = archive.passes[0];
    nisarHtml += `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px"><span style="font-size:12.5px;color:var(--ink-2)">${archive.passes.length} passes in the ASF archive here · latest ${fmtDate(last?.date)}</span>${claimTag(CLAIM.OBSERVED)}</div>`;
  } else if (archive?.error) {
    nisarHtml += `<p style="font-size:12px;color:var(--amber);margin:6px 0 0">Live archive check: ${esc(archive.error)}</p>`;
  }
  if (nisar) {
    const next = nextSwathCover(nisar.satrec, point, now, { hours: 96 });
    nisarHtml += next
      ? `<p style="font-size:12px;color:var(--ink-3);margin:6px 0 0">Next time its modeled swath covers this point: <span class="mono">${hhmm(next.time)}</span> ${tag(DATA_CLASS.DERIVED, 'PREDICTED GEOMETRY')}</p>`
      : `<p style="font-size:12px;color:var(--ink-3);margin:6px 0 0">Modeled swath does not cover this point in the next 4 days.</p>`;
  }
  nisarHtml += `<div class="cta-row" style="margin:10px 0 0"><button class="btn accent" data-act="follow-nisar">FOLLOW NISAR</button><button class="btn" data-act="replay">REPLAY THE PASS</button><button class="btn" data-act="compare">SEE OBSERVATION</button></div></div>`;

  // Other capable observers: geometric next pass within 12 h.
  const others = sats.earthObservers().filter((s) => s.tle.norad !== NISAR_NORAD && s.mission.capable.includes(story.phenomenon));
  await new Promise((r) => setTimeout(r, 0));
  for (const s of others) {
    const p = nextPass(s.satrec, point, now, { hours: 12, minElevation: 25 });
    rows.push({ name: s.tle.name, mission: s.mission, pass: p, norad: s.tle.norad });
  }
  rows.sort((a, b) => (a.pass?.start ?? Infinity) - (b.pass?.start ?? Infinity));
  const list = rows.slice(0, 6).map((r) => `<li style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
      <span><button class="btn" style="padding:3px 8px;font-size:9.5px" data-act="sat" data-norad="${r.norad}">${esc(r.name)}</button>
      <span style="font-size:11px;color:var(--ink-3)">${esc(r.mission.instrument)}</span></span>
      <span class="mono" style="font-size:10.5px;color:var(--ink-2);white-space:nowrap">${r.pass ? (r.pass.inProgress ? 'overhead now' : hhmm(r.pass.start).slice(-9)) : '—'}</span></li>`).join('');
  const othersHtml = rows.length
    ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:4px 0 6px"><b style="font-size:10px;letter-spacing:.24em;color:var(--ink-3)">ALSO ABLE TO SEE THIS</b>${claimTag(CLAIM.CAPABLE)}</div>
       <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px">${list}</ul>
       <p style="font-size:11px;color:var(--ink-3);margin:8px 0 0">Times are the next pass ≥25° above the horizon, computed from each satellite’s real TLE. Being overhead does not mean it acquired data. ${tag(DATA_CLASS.DERIVED, 'GEOMETRY ONLY')}</p>`
    : '';
  return nisarHtml + othersHtml;
}
