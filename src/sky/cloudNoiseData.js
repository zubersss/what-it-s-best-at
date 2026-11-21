// The noise clouds are carved from: a small 3-D texture that repeats in every direction.
// Red: large rounded masses (smooth noise pushed out by a cellular one, the "Perlin-
// Worley" of cloud rendering); green: small cells that eat at the masses' edges.
// Made once, on the CPU, in a worker of its own (a quarter of a million points; about a
// second): cloudNoiseWorker.js.

function hash(x, y, z, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// Cellular noise, `cells` to a side, repeating: 1 at a cell's point, falling to 0 between.
function worley(N, cells, seed) {
  const out = new Float32Array(N * N * N), pts = new Float32Array(cells * cells * cells * 3);
  for (let z = 0; z < cells; z++) for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) { const o = ((z * cells + y) * cells + x) * 3; pts[o] = x + hash(x, y, z, seed); pts[o + 1] = y + hash(x, y, z, seed + 1); pts[o + 2] = z + hash(x, y, z, seed + 2); }
  const s = cells / N;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = (i + 0.5) * s, py = (j + 0.5) * s, pz = (k + 0.5) * s, cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy, z = cz + dz, wx = ((x % cells) + cells) % cells, wy = ((y % cells) + cells) % cells, wz = ((z % cells) + cells) % cells, o = ((wz * cells + wy) * cells + wx) * 3;
      const ex = pts[o] + x - wx - px, ey = pts[o + 1] + y - wy - py, ez = pts[o + 2] + z - wz - pz, d = ex * ex + ey * ey + ez * ez;
      if (d < best) best = d;
    }
    out[(k * N + j) * N + i] = 1 - Math.min(1, Math.sqrt(best));
  }
  return out;
}
// Smooth noise, `cells` to a side, repeating, 0..1.
function smoothNoise(N, cells, seed) {
  const out = new Float32Array(N * N * N), s = cells / N, w = (a) => ((a % cells) + cells) % cells, f = (t) => t * t * (3 - 2 * t);
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = i * s, py = j * s, pz = k * s, x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz), tx = f(px - x), ty = f(py - y), tz = f(pz - z);
    const v = (a, b, c) => hash(w(x + a), w(y + b), w(z + c), seed);
    const lx = (b, c) => v(0, b, c) + (v(1, b, c) - v(0, b, c)) * tx, ly = (c) => lx(0, c) + (lx(1, c) - lx(0, c)) * ty;
    out[(k * N + j) * N + i] = ly(0) + (ly(1) - ly(0)) * tz;
  }
  return out;
}

// The numbers alone (two bytes a point: shape, detail): this part runs in a worker.
export function cloudNoiseData(N = 64) {
  const w4 = worley(N, 4, 11), w8 = worley(N, 8, 23), w16 = worley(N, 16, 37), w32 = worley(N, 32, 51);
  const p4 = smoothNoise(N, 4, 3), p8 = smoothNoise(N, 8, 5), p16 = smoothNoise(N, 16, 7);
  const data = new Uint8Array(N * N * N * 2);
  for (let i = 0; i < N * N * N; i++) {
    const perlin = (p4[i] * 0.55 + p8[i] * 0.3 + p16[i] * 0.15), cells = w4[i] * 0.6 + w8[i] * 0.28 + w16[i] * 0.12;
    // (the smooth masses, with the cells' round tops pushed out of them)
    const shape = Math.min(1, Math.max(0, (perlin - (1 - cells) * 0.55) / (1 - (1 - cells) * 0.55) * 1.25));
    data[i * 2] = Math.round(shape * 255);
    data[i * 2 + 1] = Math.round(Math.min(1, w8[i] * 0.5 + w16[i] * 0.32 + w32[i] * 0.18) * 255);
  }
  return data;
}
