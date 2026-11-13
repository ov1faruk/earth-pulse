// Opens a visible Chrome window and drives it through the NASA source sites and
// the running app, so you can watch the platform being used.
//   npm run dev   (in another terminal)   then   node tools/walkthrough.mjs
// The window is left open at the end. Uses a temporary Chrome profile, so your
// own tabs, logins and history are not touched. macOS + Google Chrome.
// (Written with AI assistance — see README → AI disclosure.)
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.PULSE_URL || 'http://localhost:5173';
const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [`--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), 'earthpulse-walkthrough')}`, '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', detached: true });
chrome.unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ } }
if (!target) throw new Error('Chrome did not start');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result || msg); pending.delete(msg.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const go = async (url, wait) => { console.log('→', url); await send('Page.navigate', { url }); await sleep(wait); };
const js = async (expression, wait = 0, note = '') => { if (note) console.log('  ·', note); await send('Runtime.evaluate', { expression, awaitPromise: true }); await sleep(wait); };
await send('Page.enable'); await send('Runtime.enable');

// 1. The four NASA sources the platform draws on.
await go('https://data.nasa.gov/dataset/global-landslide-catalog-export', 6000);
await go('https://api.nasa.gov/#browseAPI', 5000);
await go('https://search.earthdata.nasa.gov/search?q=NISAR', 7000);
await go('https://www.jpl.nasa.gov/go/opera', 6000);

// 2. The platform: search a place, read its risk and forecast, simulate rain.
await go(`${APP}/`, 12000);
await js("document.querySelector('#btn-sound')?.click()", 800, 'sound on');
await js("window.earthPulse.mission.setOpen(true); window.earthPulse.mission.probe(23.81, 90.41, 'Dhaka')", 14000, 'probe Dhaka: live signals + 7-day forecast');
await js("document.querySelector('#mc-body').scrollTo({ top: 330, behavior: 'smooth' })", 2500);
for (const v of [80, 160, 240, 320]) await js(`(() => { const r = document.querySelector('#mc-whatif'); if (r) { r.value = ${v}; r.dispatchEvent(new Event('input', { bubbles: true })); } })()`, 900, `what-if: +${v} mm of rain`);
// 3. NASA / JPL layers on the globe.
await js("document.querySelector('[data-tab=layers]').click()", 1200, 'layers');
await js("document.querySelector('[data-layer=rain]').click()", 5000, 'IMERG rainfall');
await js("document.querySelector('[data-a=slides]').click()", 5000, 'NASA landslide catalog');
await js("document.querySelector('[data-layer=rain]').click()", 1000);
// 4. The year's disasters, worldwide.
await js("document.querySelector('[data-tab=events]').click(); document.querySelector('[data-a=tour]').click()", 30000, 'tour of the year\'s disasters');
await js("document.querySelector('[data-a=tour]')?.click(); document.querySelector('[data-tab=data]').click()", 6000, 'data sources and live status');
// 5. The Mission: the story, told on the globe.
await js("window.earthPulse.mission.setOpen(false); window.earthPulse.film.start(0)", 200000, 'the mission plays through');
console.log('Done. The window stays open — it is yours to explore.');
ws.close();
process.exit(0);
