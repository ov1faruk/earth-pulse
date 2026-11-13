// Production server: serves the built app (dist/) and the same /api/* routes
// the dev server uses.   npm run build && npm start
// Works on any Node host (Render, Railway, Fly.io, a VPS). PORT comes from the host.
// (Written with AI assistance — see README → AI disclosure.)
import http from 'node:http';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { handleApi, warmCaches } from './api.js';

const DIST = path.join(process.cwd(), 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.tle': 'text/plain', '.date': 'text/plain', '.xml': 'application/xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };

async function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/story') rel = '/story.html';
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  try {
    const body = await fsp.readFile(file);
    const hashed = /\/assets\//.test(rel);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=300' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

const port = Number(process.env.PORT) || 8080;
http.createServer((req, res) => handleApi(req, res, () => serveStatic(req, res))).listen(port, () => {
  console.log(`EARTH//PULSE listening on :${port}`);
  warmCaches();
});
