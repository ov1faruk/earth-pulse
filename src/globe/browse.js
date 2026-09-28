// Load a real NISAR browse image (via our caching proxy) and georeference it
// in the browser with the same corner-fit method as tools/build_stories.py.
export const BROWSE_BASE = 'https://nisar.asf.earthdatacloud.nasa.gov/BROWSE';

export function browseUrlFor(g) {
  return `${BROWSE_BASE}/${g.coll}/${g.id}/${g.id}_LATLON.png`;
}

function fitLine(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const k = sxy / sxx;
  return [k, my - k * mx];
}

/**
 * @param {{id:string, coll:string, ring:number[][]}} g  granule with ASF footprint ring [[lon,lat],…]
 * @returns {Promise<{canvas:HTMLCanvasElement, W:number, H:number, rect:{west,east,north,south}, residualKm:number,
 *   lum:Float32Array, valid:Uint8Array, browseUrl:string}>}
 */
export async function loadBrowse(g, { maxWidth = 1600, signal } = {}) {
  const url = g.browseUrl || browseUrlFor(g);
  const res = await fetch(`/api/nisar/browse?url=${encodeURIComponent(url)}`, { signal: signal || AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error('browse image not available');
  const bmp = await createImageBitmap(await res.blob());
  const scale = Math.min(1, maxWidth / bmp.width);
  const W = Math.round(bmp.width * scale), H = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0, W, H);
  const img = cx.getImageData(0, 0, W, H);
  const px = img.data;
  const lum = new Float32Array(W * H);
  const valid = new Uint8Array(W * H);
  let top = [0, H], bottom = [0, -1], left = [W, 0], right = [-1, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      const ok = px[o + 3] > 0 && (px[o] | px[o + 1] | px[o + 2]) > 0;
      if (!ok) { px[o + 3] = 0; continue; }
      valid[i] = 1;
      lum[i] = (px[o] + px[o + 1] + px[o + 2]) / 3;
      if (y < top[1]) top = [x, y];
      if (y > bottom[1]) bottom = [x, y];
      if (x < left[0]) left = [x, y];
      if (x > right[0]) right = [x, y];
    }
  }
  cx.putImageData(img, 0, 0);
  // Unwrap antimeridian-crossing footprints before fitting.
  const lons = g.ring.map((p) => p[0]);
  const ring = Math.max(...lons) - Math.min(...lons) > 180 ? g.ring.map(([lo, la]) => [lo < 0 ? lo + 360 : lo, la]) : g.ring;
  const geo = {
    top: ring.reduce((a, p) => (p[1] > a[1] ? p : a)), bottom: ring.reduce((a, p) => (p[1] < a[1] ? p : a)),
    left: ring.reduce((a, p) => (p[0] < a[0] ? p : a)), right: ring.reduce((a, p) => (p[0] > a[0] ? p : a)),
  };
  const pix = { top, bottom, left, right };
  const keys = ['top', 'bottom', 'left', 'right'];
  const [ax, bx] = fitLine(keys.map((k) => geo[k][0]), keys.map((k) => pix[k][0]));
  const [ay, by] = fitLine(keys.map((k) => geo[k][1]), keys.map((k) => pix[k][1]));
  const rect = { west: -bx / ax, east: (W - bx) / ax, north: -by / ay, south: (H - by) / ay };
  const resid = Math.max(...keys.map((k) => Math.hypot(ax * geo[k][0] + bx - pix[k][0], ay * geo[k][1] + by - pix[k][1])));
  const kmPerPx = Math.abs(1 / ax) * 111.32 * Math.cos((((rect.north + rect.south) / 2) * Math.PI) / 180);
  return { canvas, W, H, rect, residualKm: Math.round(resid * kmPerPx * 100) / 100, kmPerPx, lum, valid, browseUrl: url };
}
