// Refresh the offline snapshot used by the story page when the API or an
// upstream is unreachable:  npm run snapshot:story   (dev server running)
// Only overwrites a section when the live source answered, so a source that is
// down today never erases yesterday's real data.
import fs from 'node:fs';
const BASE = process.env.PULSE_URL || 'http://127.0.0.1:5173';
const DIR = 'public/data/story';
fs.mkdirSync(DIR, { recursive: true });
const read = (f) => { try { return JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8')); } catch { return {}; } };
const get = async (p) => (await fetch(BASE + p, { signal: AbortSignal.timeout(300000) })).json();

const vitals = read('vitals.json');
const live = await get('/api/vitals');
for (const [k, v] of Object.entries(live)) {
  if (v.unavailable || v.freshness === 'ARCHIVED') { console.log(`vitals.${k}: kept existing snapshot (source unavailable)`); continue; }
  vitals[k] = { ...v, freshness: 'ARCHIVED', snapshotAt: new Date().toISOString() };
  console.log(`vitals.${k}: refreshed`);
}
fs.writeFileSync(`${DIR}/vitals.json`, JSON.stringify(vitals));

const risk = await get('/api/risk/map');
if (risk.places?.some((p) => !p.unavailable)) {
  fs.writeFileSync(`${DIR}/risk.json`, JSON.stringify({ ...risk, snapshotAt: new Date().toISOString() }));
  console.log(`risk: ${risk.places.filter((p) => !p.unavailable).length}/${risk.places.length} places`);
}
