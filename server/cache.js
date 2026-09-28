// TTL cache with memory + disk tiers, single-flight refresh and serve-stale.
// Pattern adapted from God's Eye View's CelesTrak proxy
// (github.com/bilawalsidhu/gods-eye-view, MIT © 2026 Bilawal Sidhu).
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fsp } from 'node:fs';

const CACHE_DIR = path.join(process.cwd(), '.pulse-cache');

/**
 * Freshness of a cached response, reported to the UI:
 *   LIVE     fetched from the upstream for this request
 *   CACHED   served from cache within its TTL
 *   STALE    upstream failed; an expired copy was served
 */
export function createCache(namespace, { ttlMs, binary = false }) {
  const mem = new Map();
  const inflight = new Map();
  const file = (key) =>
    path.join(
      CACHE_DIR,
      `${namespace}-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 20)}${binary ? '.bin' : '.json'}`,
    );

  async function readDisk(key) {
    try {
      const p = file(key);
      if (binary) {
        const [meta, body] = await Promise.all([
          fsp.readFile(p + '.meta', 'utf8').then(JSON.parse),
          fsp.readFile(p),
        ]);
        return { ...meta, body };
      }
      return JSON.parse(await fsp.readFile(p, 'utf8'));
    } catch {
      return null;
    }
  }

  async function writeDisk(key, entry) {
    try {
      await fsp.mkdir(CACHE_DIR, { recursive: true });
      const p = file(key);
      if (binary) {
        await fsp.writeFile(p, entry.body);
        await fsp.writeFile(p + '.meta', JSON.stringify({ at: entry.at, type: entry.type }));
      } else {
        await fsp.writeFile(p, JSON.stringify(entry));
      }
    } catch {
      /* cache is best-effort */
    }
  }

  /** @returns {Promise<{body:any, type?:string, at:number, state:'LIVE'|'CACHED'|'STALE'}>} */
  async function get(key, loader) {
    let entry = mem.get(key);
    if (!entry) {
      entry = await readDisk(key);
      if (entry) mem.set(key, entry);
    }
    if (entry && Date.now() - entry.at < ttlMs) return { ...entry, state: 'CACHED' };
    if (!inflight.has(key)) {
      inflight.set(
        key,
        loader()
          .then(async (fresh) => {
            const e = { at: Date.now(), ...fresh };
            mem.set(key, e);
            await writeDisk(key, e);
            return e;
          })
          .catch((err) => {
            console.warn(`[cache:${namespace}] refresh failed: ${err.message}`);
            return null;
          })
          .finally(() => inflight.delete(key)),
      );
    }
    const fresh = await inflight.get(key);
    if (fresh) return { ...fresh, state: 'LIVE' };
    if (entry) return { ...entry, state: 'STALE' };
    throw new Error(`${namespace}: upstream unavailable and nothing cached`);
  }

  return { get };
}

export const USER_AGENT = 'earth-pulse/0.1 (NASA Space Apps prototype; built on gods-eye-view patterns)';

export async function fetchText(url, { timeoutMs = 20000, headers = {}, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': USER_AGENT, ...headers },
      });
      if (res.ok) return res.text();
      lastErr = new Error(`HTTP ${res.status} ${url.slice(0, 120)}`);
      if (res.status < 500 && res.status !== 429) break; // client errors won't heal
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
  }
  throw lastErr;
}
