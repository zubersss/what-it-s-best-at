// The character drawn without a browser, in seconds: public/data/hero.bin as it stands
// (scripts/make-hero.mjs), from several sides, onto a PNG.
//
//   node scripts/hero-preview.mjs [--out file.png] [--yaws 0,45,180] [--h 1000] [--box x0,y0,x1,y1]
//        [--lod 0|1] [--labels] [--grid] [--pose name]
//
// --labels: each label in a loud colour of its own (for placing seeds: hero/seeds.mjs);
// --garments, --parts, --cloth: the same for the binding's garments, the rigid parts that carry
//   a vertex, and its share of loose cloth (white: all cloth);
// --grid: a line every 0.1 m (in the game's frame; the sculpt's own coordinates are these
// divided by fit.scale, less fit.lift). --pose: the figure as the game poses it (heroBind.mjs).
import fs from 'node:fs';
import { png } from './lib/png.mjs';
import { parseHero } from '../src/hero/heroFile.js';

const a = process.argv.slice(2), opt = (n, d) => (a.includes('--' + n) ? a[a.indexOf('--' + n) + 1] : d);
const file = opt('file', new URL('../public/data/hero.bin', import.meta.url).pathname), buf = fs.readFileSync(file);
const hero = parseHero(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)), m = hero.lods[+opt('lod', 0)];
let P = m.position, N = m.normal; const I = m.index, nv = m.vertices;
if (opt('pose', null)) { const { posed } = await import('./hero/heroBind.mjs'); ({ position: P, normal: N } = await posed(m, hero.shared, opt('pose', null), +opt('time', 3))); }
const yaws = opt('yaws', '0,45,180').split(',').map(Number), H = +opt('h', 1000), box = (opt('box', null) || '-0.6,-0.96,0.6,0.92').split(',').map(Number);
const sc = H / (box[3] - box[1]), W = Math.ceil((box[2] - box[0]) * sc), TW = W * yaws.length, img = new Uint8Array(TW * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < TW; x++) { const q = (y * TW + x) * 3, t = y / H; img[q] = 120 - 40 * t; img[q + 1] = 150 - 40 * t; img[q + 2] = 185 - 50 * t; }
const PAL = [[225, 225, 232], [150, 30, 140], [215, 160, 130], [120, 125, 150], [240, 235, 120], [120, 120, 220], [70, 70, 80], [200, 80, 60], [40, 20, 10], [220, 60, 90]];
const C = new Float32Array(nv * 3);
for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) C[v * 3 + k] = a.includes('--labels') ? PAL[m.label[v] % PAL.length][k] / 255 : a.includes('--garments') ? PAL[m.garment[v] % PAL.length][k] / 255 : a.includes('--parts') ? (PAL[m.parts[v * 4] % PAL.length][k] * (255 - m.parts[v * 4 + 2] - m.parts[v * 4 + 3]) + PAL[m.parts[v * 4 + 1] % PAL.length][k] * m.parts[v * 4 + 2] + PAL[0][k] * m.parts[v * 4 + 3]) / 65025 : a.includes('--cloth') ? (m.shares[v * 4] + m.shares[v * 4 + 1] + m.shares[v * 4 + 2] + m.shares[v * 4 + 3]) / 255 : (m.colour[v * 4 + k] / 255) ** 2;
const CULL = a.includes('--twosided') ? 0 : +opt('cull', 1);   // the game draws the sculpt's outside only (it is a closed surface)
const L = [-0.42, 0.62, 0.66], enc = (v) => Math.min(255, 255 * Math.pow(Math.max(0, v), 1 / 2.2));
yaws.forEach((yd, vi) => {
  const y = yd * Math.PI / 180, c = Math.cos(y), s = Math.sin(y), zb = new Float32Array(W * H).fill(-1e9);
  const X = new Float32Array(nv), Y = new Float32Array(nv), Z = new Float32Array(nv), Sh = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2], nx = N[v * 3] * c + N[v * 3 + 2] * s, ny = N[v * 3 + 1], nz = -N[v * 3] * s + N[v * 3 + 2] * c;
    X[v] = ((px * c + pz * s) - box[0]) * sc; Y[v] = (box[3] - py) * sc; Z[v] = -px * s + pz * c;
    // (the Sun, and a sky that lights what looks up more than what looks down)
    Sh[v] = 1.0 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]) + 0.38 + 0.18 * ny;
  }
  for (let t = 0; t < I.length; t += 3) {
    const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2], x0 = X[i0], y0 = Y[i0], x1 = X[i1], y1 = Y[i1], x2 = X[i2], y2 = Y[i2];
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(den) < 1e-12 || (CULL && den * CULL > 0)) continue;
    const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2))), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2))), ya = Math.max(0, Math.floor(Math.min(y0, y1, y2))), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
      const qx = px + 0.5, qy = py + 0.5, u = ((y1 - y2) * (qx - x2) + (x2 - x1) * (qy - y2)) / den, v = ((y2 - y0) * (qx - x2) + (x0 - x2) * (qy - y2)) / den, w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const z = u * Z[i0] + v * Z[i1] + w * Z[i2], o = py * W + px; if (z <= zb[o]) continue; zb[o] = z;
      const sh = u * Sh[i0] + v * Sh[i1] + w * Sh[i2], q = (py * TW + vi * W + px) * 3;
      for (let k = 0; k < 3; k++) img[q + k] = enc((u * C[i0 * 3 + k] + v * C[i1 * 3 + k] + w * C[i2 * 3 + k]) * sh);
    }
  }
  if (a.includes('--grid')) {
    for (let g = Math.ceil(box[1] * 10); g <= Math.floor(box[3] * 10); g++) { const py = Math.round((box[3] - g / 10) * sc); if (py < 0 || py >= H) continue; const d = g % 5 === 0 ? 40 : 110; for (let px = 0; px < W; px += g === 0 ? 1 : 2) { const q = (py * TW + vi * W + px) * 3; img[q] = d; img[q + 1] = d; img[q + 2] = g === 0 ? 255 : d; } }
    for (let g = Math.ceil(box[0] * 10); g <= Math.floor(box[2] * 10); g++) { const px = Math.round((g / 10 - box[0]) * sc); if (px < 0 || px >= W) continue; const d = g % 5 === 0 ? 40 : 110; for (let py = 0; py < H; py += g === 0 ? 1 : 2) { const q = (py * TW + vi * W + px) * 3; img[q] = g === 0 ? 255 : d; img[q + 1] = d; img[q + 2] = d; } }
  }
});
const out = opt('out', 'hero_preview.png'); fs.writeFileSync(out, png(TW, H, img)); console.log(`${out}: ${TW} x ${H}, ${m.triangles} triangles`);
