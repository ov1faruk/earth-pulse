// Build public/data/context/landslides.json from NASA's Global Landslide
// Catalog (data.nasa.gov, Kirschbaum et al.). Keeps only what the globe needs.
//   node tools/build_landslides.mjs [path-to-csv]
// Without a path it downloads the CSV from data.nasa.gov.
// (Written with AI assistance — see README → AI disclosure.)
import fs from 'node:fs';

const URL_ = 'https://data.nasa.gov/docs/legacy/Global_Landslide_Catalog_Export/Global_Landslide_Catalog_Export_rows.csv';
const text = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : await (await fetch(URL_)).text();

// RFC-4180 parser: quoted fields may contain commas, quotes and newlines.
function parseCsv(s) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const rows = parseCsv(text);
const head = rows.shift();
const col = Object.fromEntries(head.map((h, i) => [h, i]));
const triggers = [], sizes = [];
const idx = (list, v) => { v = (v || 'unknown').toLowerCase().replace(/_/g, ' '); let i = list.indexOf(v); if (i < 0) { list.push(v); i = list.length - 1; } return i; };
const out = [];
for (const r of rows) {
  const lon = Number(r[col.longitude]), lat = Number(r[col.latitude]);
  const m = /^(\d\d)\/(\d\d)\/(\d{4})/.exec(r[col.event_date] || '');
  if (!m || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;
  out.push([Math.round(lon * 1e3) / 1e3, Math.round(lat * 1e3) / 1e3, `${m[3]}-${m[1]}-${m[2]}`, Number(r[col.fatality_count]) || 0, idx(triggers, r[col.landslide_trigger]), idx(sizes, r[col.landslide_size]), (r[col.event_title] || '').trim().slice(0, 70), r[col.country_name] || '']);
}
out.sort((a, b) => (a[2] < b[2] ? -1 : 1));
fs.mkdirSync('public/data/context', { recursive: true });
fs.writeFileSync('public/data/context/landslides.json', JSON.stringify({
  fields: ['lon', 'lat', 'date', 'fatalities', 'triggerIndex', 'sizeIndex', 'title', 'country'], triggers, sizes, events: out,
  source: { name: 'NASA Global Landslide Catalog (Kirschbaum et al., NASA GSFC) via data.nasa.gov', url: 'https://data.nasa.gov/dataset/global-landslide-catalog-export' },
  builtAt: new Date().toISOString(), firstDate: out[0][2], lastDate: out.at(-1)[2],
}));
console.log(`${out.length} landslides, ${out[0][2]} → ${out.at(-1)[2]}, ${out.reduce((a, b) => a + b[3], 0)} recorded fatalities; triggers: ${triggers.join(', ')}`);
