// Headless Chrome (CDP) screenshots of the running app at 1920x1080.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'shots');
const APP = 'http://localhost:5173';
const port = 9300 + Math.floor(Math.random() * 300);
const chrome = spawn(process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'ep-cap-'))}`, '--window-size=1920,1080', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t; for (let i = 0; i < 60 && !t; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j.result); pend.delete(j.id); } };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }))?.result?.value;
await cmd('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const shot = async (name) => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); console.log('shot', name); };
const scrollCard = (y) => evalJs(`(()=>{const els=[...document.querySelectorAll('#pulse-home, #pulse-home *')].filter(e=>e.scrollHeight>e.clientHeight+20&&getComputedStyle(e).overflowY!='visible');const e=els[0];if(e){e.scrollTop=${y};return e.scrollHeight}return 0})()`);
const SHOTS = JSON.parse(process.argv[2]);
for (const s of SHOTS) {
  await cmd('Page.navigate', { url: /^(file|http)/.test(s.q) ? s.q : APP + s.q });
  await sleep(s.wait || 14000);
  if (s.js) { await evalJs(s.js); await sleep(s.after || 3000); }
  await shot(s.name);
  for (const [k, y] of (s.scroll || []).entries()) { await scrollCard(y); await sleep(800); await shot(`${s.name}_s${k + 1}`); }
}
ws.close(); chrome.kill();
