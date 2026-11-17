// Top-down shaded relief of the height function, without a browser. For tuning recipes.
//   node scripts/probe-terrain.mjs [--world mars] [--lat -13.1] [--lon 296.6] [--span 40000]
//        [--size 700] [--sunAz 297] [--sunEl 12] [--out probe.png] [--profile]
// span = width of the square area in metres. Prints height stats and timing.
import { writeFile } from 'node:fs/promises';
import { loadWorld } from './lib/loadWorld.mjs';
import { encodePNG } from './lib/png.mjs';
import { latLonToDir, localFrame } from '../src/core/ephemeris.js';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const worldId = opt('world', 'mars');
const { world, hs } = await loadWorld(worldId);
const lat = Number(opt('lat', world.scene.start.lat)), lon = Number(opt('lon', world.scene.start.lon));
const span = Number(opt('span', 40000)), N = Number(opt('size', 700));
const sunAz = Number(opt('sunAz', 297)) * Math.PI / 180, sunEl = Number(opt('sunEl', 12)) * Math.PI / 180;
const out = opt('out', 'probe.png');

const c = latLonToDir(lat, lon);
const { east, north, up } = localFrame(c);
const R = world.radius, step = span / N, minWL = step * 2;
const H = new Float32Array(N * N);
const t0 = performance.now();
let lo = Infinity, hi = -Infinity;
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const e = (i - N / 2) * step, n = (N / 2 - j) * step;
    let x = c[0] * R + east[0] * e + north[0] * n, y = c[1] * R + east[1] * e + north[1] * n, z = c[2] * R + east[2] * e + north[2] * n;
    const l = Math.hypot(x, y, z);
    const h = hs.height(x / l, y / l, z / l, minWL);
    H[j * N + i] = h; if (h < lo) lo = h; if (h > hi) hi = h;
  }
}
const ms = performance.now() - t0;
console.log(`${N * N} samples in ${ms.toFixed(0)} ms (${(ms * 1000 / (N * N)).toFixed(2)} us/sample), step ${step.toFixed(1)} m, height ${lo.toFixed(0)} .. ${hi.toFixed(0)} m`);

const L = [Math.sin(sunAz) * Math.cos(sunEl), Math.cos(sunAz) * Math.cos(sunEl), Math.sin(sunEl)];
const rgb = new Uint8Array(N * N * 3);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    const dzdx = (H[j * N + i1] - H[j * N + i0]) / ((i1 - i0) * step);
    const dzdy = (H[j0 * N + i] - H[j1 * N + i]) / ((j1 - j0) * step);
    const nl = 1 / Math.hypot(dzdx, dzdy, 1);
    let s = Math.max(0, (-dzdx * L[0] - dzdy * L[1] + L[2]) * nl);
    s = 0.12 + 0.88 * s;
    const t = (H[j * N + i] - lo) / (hi - lo + 1e-6);
    const slope = Math.hypot(dzdx, dzdy);
    // tint: steep = rock grey-brown, flat = dust
    const rock = Math.min(1, Math.max(0, (slope - 0.5) / 0.5));
    const o = (j * N + i) * 3;
    rgb[o] = Math.min(255, 255 * s * (0.75 + 0.25 * t) * (1 - 0.25 * rock));
    rgb[o + 1] = Math.min(255, 255 * s * (0.62 + 0.25 * t) * (1 - 0.3 * rock));
    rgb[o + 2] = Math.min(255, 255 * s * (0.48 + 0.25 * t) * (1 - 0.3 * rock));
  }
}
await writeFile(out, encodePNG(N, N, rgb));
console.log('wrote', out);

if (args.includes('--profile')) {
  // north-south profile through the centre
  const row = [];
  for (let j = 0; j < N; j += Math.max(1, Math.floor(N / 60))) row.push(H[j * N + (N >> 1)].toFixed(0));
  console.log('N->S profile:', row.join(' '));
}
