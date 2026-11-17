// Small procedural textures used by the terrain shader. Generated at start-up from the
// world's surface numbers (no image assets).
import * as THREE from 'three';
import { hash3 } from './height/noise.js';

// Periodic 2-D gradient noise (period in lattice cells).
function pnoise2(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const g = (i, j, dx, dy) => {
    const h = hash3(((i % period) + period) % period, ((j % period) + period) % period, 7, seed);
    const a = (h / 4294967296) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = g(ix, iy, fx, fy), b = g(ix + 1, iy, fx - 1, fy), c = g(ix, iy + 1, fx, fy - 1), d = g(ix + 1, iy + 1, fx - 1, fy - 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.5;
}

function fbm2(x, y, basePeriod, octs, seed, gain = 0.55) {
  let s = 0, a = 1, n = 0, p = basePeriod;
  for (let k = 0; k < octs; k++, p *= 2, a *= gain) { s += a * pnoise2(x * p, y * p, p, seed + k * 13); n += a; }
  return s / n;
}

// Tiling detail texture: rg = slope of a fine fractal (detail normal), b = its height,
// a = an independent low-frequency fractal for breaking up material borders.
export function makeDetailTexture(size = 256) {
  const H = new Float32Array(size * size), L = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = i / size, y = j / size;
    H[j * size + i] = fbm2(x, y, 4, 6, 101);
    L[j * size + i] = fbm2(x, y, 2, 4, 977, 0.6);
  }
  const data = new Uint8Array(size * size * 4);
  const at = (i, j) => H[((j + size) % size) * size + ((i + size) % size)];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = (at(i + 1, j) - at(i - 1, j)) * size * 0.012, dy = (at(i, j + 1) - at(i, j - 1)) * size * 0.012;
    const o = (j * size + i) * 4;
    data[o] = Math.max(0, Math.min(255, 127.5 - dx * 127.5));
    data[o + 1] = Math.max(0, Math.min(255, 127.5 - dy * 127.5));
    data[o + 2] = Math.max(0, Math.min(255, 127.5 + H[j * size + i] * 210));
    data[o + 3] = Math.max(0, Math.min(255, 127.5 + L[j * size + i] * 230));
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// 1-D strata lookup, two rows: row 0 = thick bands, row 1 = thin bands. Stores tint / 2.
export function makeStrataTexture(strata) {
  const W = 1024, data = new Uint8Array(W * 2 * 4);
  const cols = strata?.colors?.length ? strata.colors : [[1, 1, 1]];
  const seed = strata?.seed ?? 1;
  const rnd = (i, s) => hash3(i, 3, 5, seed * 31 + s) / 4294967296;
  const row = (r, bands, soft) => {
    // random band edges, random colour per band, slightly softened edges
    const edges = [0];
    while (edges[edges.length - 1] < 1) edges.push(edges[edges.length - 1] + (0.35 + 1.3 * rnd(edges.length, r)) / bands);
    const n = edges.length - 1;
    const colour = (k) => { const c = cols[Math.floor(rnd(((k % n) + n) % n, r + 50) * cols.length) % cols.length]; const v = 0.88 + 0.24 * rnd(k, r + 90); return [c[0] * v, c[1] * v, c[2] * v]; };
    for (let x = 0; x < W; x++) {
      const t = x / W;
      let k = 0; while (k < n - 1 && edges[k + 1] / edges[n] < t) k++;
      const e0 = edges[k] / edges[n], e1 = edges[k + 1] / edges[n];
      const c0 = colour(k), c1 = colour(k + 1);
      const f = Math.min(1, Math.max(0, (t - (e1 - soft / W)) / (soft / W)));
      const o = (r * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[o + ch] = Math.max(0, Math.min(255, (c0[ch] + (c1[ch] - c0[ch]) * f) * 127.5));
      data[o + 3] = 255;
      void e0;
    }
  };
  row(0, 11, 5); row(1, 9, 8);
  const tex = new THREE.DataTexture(data, W, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
