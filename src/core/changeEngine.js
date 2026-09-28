// CHANGE ENGINE — radar change between two NISAR passes of the same track/frame.
//
// Input: two georeferenced browse images (8-bit quick-looks). Method:
//   1. resample both onto the intersection grid (nearest neighbour)
//   2. normalise each by its own median brightness over the common valid area
//      (absorbs the per-image contrast stretch of browse PNGs)
//   3. log-ratio  r = ln((B+1)/medB) − ln((A+1)/medA)
//   4. 5×5 box filter (suppresses radar speckle)
//   5. |r| > threshold → "brighter" or "darker" (only where the whole
//      smoothing window has data from both passes — suppresses edge artifacts)
// Result is DERIVED data: a relative-brightness change indicator, NOT a
// calibrated backscatter difference in dB.

export const CHANGE_DEFAULTS = Object.freeze({ threshold: 0.45, box: 2, edge: 8 });

function median(values, n) {
  const h = new Uint32Array(256);
  for (let i = 0; i < n; i++) h[Math.min(255, values[i] | 0)]++;
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= n / 2) return Math.max(1, v); }
  return 128;
}

/** Resample a georeferenced image onto a target grid (nearest neighbour). */
function sample(img, grid) {
  const { W: gw, H: gh, west, north, dLon, dLat } = grid;
  const lum = new Float32Array(gw * gh);
  const valid = new Uint8Array(gw * gh);
  const sx = img.W / (img.rect.east - img.rect.west);
  const sy = img.H / (img.rect.north - img.rect.south);
  for (let y = 0; y < gh; y++) {
    const lat = north - (y + 0.5) * dLat;
    const py = Math.floor((img.rect.north - lat) * sy);
    if (py < 0 || py >= img.H) continue;
    for (let x = 0; x < gw; x++) {
      const lon = west + (x + 0.5) * dLon;
      const px = Math.floor((lon - img.rect.west) * sx);
      if (px < 0 || px >= img.W) continue;
      const si = py * img.W + px;
      if (!img.valid[si]) continue;
      const gi = y * gw + x;
      valid[gi] = 1;
      lum[gi] = img.lum[si];
    }
  }
  return { lum, valid };
}

/** Box filter via integral images, ignoring invalid pixels. Also returns, per
 * pixel, whether its whole (2r+1)² window is valid (edge guard). */
function boxMean(values, valid, W, H, r) {
  const S = new Float64Array((W + 1) * (H + 1));
  const N = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let rs = 0, rn = 0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (valid[i]) { rs += values[i]; rn++; }
      const o = (y + 1) * (W + 1) + (x + 1);
      S[o] = S[o - (W + 1)] + rs;
      N[o] = N[o - (W + 1)] + rn;
    }
  }
  const out = new Float32Array(W * H);
  const full = new Uint8Array(W * H);
  const need = (2 * r + 1) * (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H - 1, y + r);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!valid[i]) continue;
      const x0 = Math.max(0, x - r), x1 = Math.min(W - 1, x + r);
      const a = y0 * (W + 1) + x0, b = y0 * (W + 1) + x1 + 1, c = (y1 + 1) * (W + 1) + x0, d = (y1 + 1) * (W + 1) + x1 + 1;
      const n = N[d] - N[b] - N[c] + N[a];
      out[i] = n ? (S[d] - S[b] - S[c] + S[a]) / n : 0;
      full[i] = n === need ? 1 : 0;
    }
  }
  return { mean: out, full };
}

/**
 * @param A,B {W,H,rect:{west,east,north,south},lum:Float32Array,valid:Uint8Array}
 * @returns {{grid, ratio:Float32Array, valid:Uint8Array, cls:Int8Array, stats, hotspots}}
 */
export function computeChange(A, B, { threshold = CHANGE_DEFAULTS.threshold, box = CHANGE_DEFAULTS.box, edge = CHANGE_DEFAULTS.edge, maxSize = 1400, land = null } = {}) {
  const west = Math.max(A.rect.west, B.rect.west), east = Math.min(A.rect.east, B.rect.east);
  const north = Math.min(A.rect.north, B.rect.north), south = Math.max(A.rect.south, B.rect.south);
  if (!(east > west && north > south)) throw new Error('the two images do not overlap');
  const resLon = (A.rect.east - A.rect.west) / A.W, resLat = (A.rect.north - A.rect.south) / A.H;
  let W = Math.round((east - west) / resLon), H = Math.round((north - south) / resLat);
  const k = Math.max(1, Math.max(W, H) / maxSize);
  W = Math.max(1, Math.round(W / k)); H = Math.max(1, Math.round(H / k));
  const grid = { W, H, west, east, north, south, dLon: (east - west) / W, dLat: (north - south) / H };
  const a = sample(A, grid), b = sample(B, grid);
  const valid = new Uint8Array(W * H);
  let n = 0;
  const va = new Float32Array(W * H), vb = new Float32Array(W * H);
  // Optional land mask (lon,lat)→bool: over open water radar brightness follows the wind, not the surface.
  let waterPx = 0;
  for (let y = 0; y < H; y++) {
    const lat = north - (y + 0.5) * grid.dLat;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!(a.valid[i] && b.valid[i])) continue;
      if (land && !land(west + (x + 0.5) * grid.dLon, lat)) { waterPx++; continue; }
      valid[i] = 1; va[n] = a.lum[i]; vb[n] = b.lum[i]; n++;
    }
  }
  if (n < 100) throw new Error('not enough overlapping data');
  const medA = median(va, n), medB = median(vb, n);
  const raw = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) if (valid[i]) raw[i] = Math.log((b.lum[i] + 1) / medB) - Math.log((a.lum[i] + 1) / medA);
  const { mean: ratio } = boxMean(raw, valid, W, H, box);
  // Edge guard: swath edges often carry intensity tapers that differ between
  // passes, so only classify pixels ≥ `edge` px inside the common valid area.
  const { full } = boxMean(raw, valid, W, H, Math.max(box, edge));
  const cls = new Int8Array(W * H);
  let brighter = 0, darker = 0;
  for (let i = 0; i < W * H; i++) {
    if (!valid[i] || !full[i]) continue; // edge guard: no classification where data runs out
    if (ratio[i] > threshold) { cls[i] = 1; brighter++; } else if (ratio[i] < -threshold) { cls[i] = -1; darker++; }
  }
  // Pixel area (km²) at the grid's mid-latitude.
  const latMid = ((north + south) / 2) * (Math.PI / 180);
  const pxKm2 = grid.dLon * 111.32 * Math.cos(latMid) * grid.dLat * 110.57;
  // Hotspots: 24×24-cell blocks with the most changed pixels.
  const B_ = 24, blocks = [];
  for (let by = 0; by < H; by += B_) {
    for (let bx = 0; bx < W; bx += B_) {
      let up = 0, dn = 0, v = 0;
      for (let y = by; y < Math.min(H, by + B_); y++) for (let x = bx; x < Math.min(W, bx + B_); x++) {
        const i = y * W + x; if (!valid[i]) continue; v++; if (cls[i] > 0) up++; else if (cls[i] < 0) dn++;
      }
      if (v > B_ * B_ * 0.5 && up + dn > 0) blocks.push({
        score: (up + dn) / v, brighter: up / v, darker: dn / v,
        lon: west + (bx + B_ / 2) * grid.dLon, lat: north - (by + B_ / 2) * grid.dLat,
      });
    }
  }
  blocks.sort((p, q) => q.score - p.score);
  return {
    grid, ratio, valid, cls,
    stats: {
      validKm2: Math.round(n * pxKm2), brighterKm2: Math.round(brighter * pxKm2), darkerKm2: Math.round(darker * pxKm2),
      brighterFrac: brighter / n, darkerFrac: darker / n, threshold, box, medA, medB, waterMaskedKm2: Math.round(waterPx * pxKm2),
    },
    hotspots: blocks.slice(0, 5),
  };
}

/** Colour a change result: darker → cyan, brighter → orange, alpha by magnitude. */
export function changeToRGBA(res, { threshold = res.stats.threshold } = {}) {
  const { W, H } = res.grid;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    if (!res.cls[i]) continue;
    const m = Math.min(1, (Math.abs(res.ratio[i]) - threshold) / (threshold * 2));
    const o = i * 4;
    if (res.cls[i] > 0) { out[o] = 255; out[o + 1] = 160; out[o + 2] = 51; }
    else { out[o] = 72; out[o + 1] = 214; out[o + 2] = 255; }
    out[o + 3] = Math.round(120 + 135 * m);
  }
  return out;
}
