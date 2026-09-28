// Real positions for the film, from the same TLE snapshot + SGP4 code as the app.
import fs from 'node:fs';
import { parseTle } from '../../src/core/tle.js';
import { satrecFromTle, geodeticAt, swathSamples } from '../../src/core/orbit.js';
const groups = ['resource', 'weather', 'science', 'stations'];
const seen = new Set(), sats = [];
for (const g of groups) for (const t of parseTle(fs.readFileSync(`public/data/tle/${g}.tle`, 'utf8'))) if (!seen.has(t.norad)) { seen.add(t.norad); sats.push(t); }
for (const t of parseTle(fs.readFileSync('public/data/tle/65053.tle', 'utf8'))) if (!seen.has(t.norad)) { seen.add(t.norad); sats.push(t); }
const t0 = Date.parse('2026-09-22T23:05:00Z'); // leads into NISAR's real Bangladesh pass (23:21:32 UTC)
const steps = 240, dt = 15000; // one hour of orbital motion, 15 s steps
const out = { t0: new Date(t0).toISOString(), dtMs: dt, steps, sats: [] };
for (const s of sats) {
  const rec = satrecFromTle(s);
  const pos = [];
  for (let k = 0; k < steps; k++) { const g = geodeticAt(rec, new Date(t0 + k * dt)); pos.push(g ? [+g.lon.toFixed(3), +g.lat.toFixed(3), Math.round(g.altKm)] : null); }
  out.sats.push({ name: s.name, norad: s.norad, pos });
}
const nisar = satrecFromTle(sats.find((s) => s.norad === 65053));
out.nisarSwath = swathSamples(nisar, new Date(t0), new Date(t0 + steps * dt), 15).map((p) => ({ t: p.t.toISOString(), nadir: [p.nadir.lon, p.nadir.lat, p.nadir.altKm], near: [p.near.lon, p.near.lat], far: [p.far.lon, p.far.lat] }));
fs.writeFileSync('brag-output/work/orbits.json', JSON.stringify(out));
console.log('sats', out.sats.length, 'swath samples', out.nisarSwath.length);
const cover = out.nisarSwath.find((p) => p.t >= '2026-09-22T23:21:30');
console.log('NISAR at 23:21:30', cover.nadir, 'swath mid', cover.near, cover.far);
