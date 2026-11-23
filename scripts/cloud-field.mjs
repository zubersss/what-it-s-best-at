// The fair-weather cloud field seen from straight above, drawn without a browser in a
// second or two: where the heaps of the cloud layer stand over some hundred kilometres of
// country, as the shell draws them from far (sky/clouds.js). For judging the field's
// pattern (rows, clusters, how much of the sky) before taking any picture in the game:
// from 30 km up the game's own picture takes eight minutes.
//
//   node scripts/cloud-field.mjs [--world earth] [--lat 36.07 --lon 247.88] [--span 150] [--out cloud-field.png]
//
// The rule below is a copy in JavaScript of FAIR_GLSL and HEAP_GLSL in src/sky/clouds.js
// (with the day's map clear, and no drift): change one, change the other. The noise is the
// game's own (src/sky/cloudNoiseData.js). The game's layer stands higher by the country's
// height round the traveller, so its heaps are not these very ones, only of this kind.
import fs from 'node:fs';
import { cloudNoiseData } from '../src/sky/cloudNoiseData.js';
import { WORLDS } from '../src/worlds/index.js';
import { png } from './lib/png.mjs';

const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const world = WORLDS[opt('world', 'earth')], v = world?.clouds?.volume;
if (!v) { console.log('this world has no cloud volume'); process.exit(1); }
const st = world.scene.start, lat = +opt('lat', st.lat) * Math.PI / 180, lon = +opt('lon', st.lon) * Math.PI / 180;
const SPAN = +opt('span', 150) * 1000, out = opt('out', 'cloud-field.png'), W = 512;

const N = 64, data = cloudNoiseData(N);
// the noise as the GPU reads it: trilinear, repeating, texel centres at (i + 0.5) / N
const tex = (x, y, z, ch) => {
  const f = (a) => { a = (a - Math.floor(a)) * N - 0.5; const i = Math.floor(a); return [((i % N) + N) % N, (((i + 1) % N) + N) % N, a - i]; };
  const [x0, x1, tx] = f(x), [y0, y1, ty] = f(y), [z0, z1, tz] = f(z);
  const g = (i, j, k) => data[((k * N + j) * N + i) * 2 + ch] / 255;
  const lx = (j, k) => g(x0, j, k) * (1 - tx) + g(x1, j, k) * tx, ly = (k) => lx(y0, k) * (1 - ty) + lx(y1, k) * ty;
  return ly(z0) * (1 - tz) + ly(z1) * tz;
};
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const R = world.radius, SCALE = v.scale ?? 5200, FAIR = v.fair ?? 0, RS = R + (v.base ?? 1500) + 0.3 * (v.thick ?? 3000);
const K = R / SCALE * 0.11, QS = RS / SCALE;
// FAIR_GLSL (m = 0: the day's map is clear)
const fairCover = (u) => {
  const field = tex(u[0] * K + 0.31, u[1] * K + 0.31, u[2] * K + 0.31, 0), cluster = tex(u[0] * K * 0.2 + 0.83, u[1] * K * 0.2 + 0.83, u[2] * K * 0.2 + 0.83, 1);
  return Math.min(0.5, FAIR * 0.55 * ss(0.12, 0.34, field) * ss(0.40, 0.56, cluster) * (1.3 / 0.55));
};
// HEAP_GLSL, and the shell's clean edge
const alphaAt = (u) => {
  const c = fairCover(u), n = tex(u[0] * QS, u[1] * QS, u[2] * QS, 0);
  const dv = Math.min(1, Math.max(0, (n - (1 - c) * 0.85) / Math.max(c * 0.85 + 0.15, 0.2) * 2.2));
  return ss(0.2, 0.38, ss(0, 0.45, dv) * 0.75) * 0.97;
};

const up0 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)], east = [-Math.sin(lon), Math.cos(lon), 0];
const north = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
const px = new Uint8Array(W * W * 3), ground = [70, 105, 60]; let sum = 0;
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
  const x = (i / W - 0.5) * SPAN, y = (0.5 - j / W) * SPAN;
  let u = [RS * up0[0] + x * east[0] + y * north[0], RS * up0[1] + x * east[1] + y * north[1], RS * up0[2] + x * east[2] + y * north[2]];
  const l = Math.hypot(...u); u = u.map((a) => a / l);
  const a = alphaAt(u); sum += a;
  // (the place asked for: a red mark in the middle)
  const mark = Math.abs(Math.hypot(i - W / 2, j - W / 2) - 4) < 0.7;
  for (let k = 0; k < 3; k++) px[(j * W + i) * 3 + k] = mark ? [255, 60, 60][k] : Math.round(ground[k] * (1 - a) + 240 * a);
}
fs.writeFileSync(out, png(W, W, px));
console.log(`${opt('world', 'earth')}: ${SPAN / 1000} km across round ${(lat * 180 / Math.PI).toFixed(2)}, ${(lon * 180 / Math.PI).toFixed(2)} (north up): cloud over ${(sum / W / W * 100).toFixed(1)} % of the country -> ${out}`);
