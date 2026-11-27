// The rigged character drawn without a browser, in a second: frames of a clip side by side,
// coloured from its texture (a colour a vertex), posed by the game's own skeleton code
// (src/hero/heroRig.js). For looking at what each clip is before the game plays it.
//
//   node scripts/hero-rig-preview.mjs --clip Run [--frames 6] [--yaw 90] [--h 420] [--lod 0|1]
//                                     [--box -1,-1,1,1] [--out file.png] [--times 0,0.5,1.2]
//   node scripts/hero-rig-preview.mjs --state "foot=1,speed=5.5" ...   the game's own choice of clips (hero/heroAnim.js)
import fs from 'node:fs';
import { png } from './lib/png.mjs';
import { parseHero } from '../src/hero/heroFile.js';
import { HeroRig, skinned } from '../src/hero/heroRig.js';

const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
const b = fs.readFileSync(opt('file', 'public/data/hero_rig.bin')), file = parseHero(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), m = file.lods[+opt('lod', 1)], rig = new HeroRig(file);
const clip = opt('clip', 'Idle'), H = +opt('h', 420), box = opt('box', '-1.1,-1.0,1.1,1.05').split(',').map(Number), yaw = +opt('yaw', 90) * Math.PI / 180;
const frames = +opt('frames', 6), times = opt('times', null)?.split(',').map(Number) || Array.from({ length: frames }, (_, i) => i * rig.clips[clip].duration / frames);
const sc = H / (box[3] - box[1]), W = Math.round((box[2] - box[0]) * sc), TW = W * times.length, img = Buffer.alloc(TW * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < TW; x++) { const q = (y * TW + x) * 3, t = y / H; img[q] = 118 - 40 * t; img[q + 1] = 150 - 40 * t; img[q + 2] = 190 - 40 * t; }
let anim = null; const state = opt('state', null);
if (state) { const { HeroAnim } = await import('../src/hero/heroAnim.js'); anim = new HeroAnim(rig); }
const pal = new Float32Array(rig.count * 12), I = m.index, c = Math.cos(yaw), s = Math.sin(yaw), L = [-0.42, 0.62, 0.66], enc = (v) => Math.min(255, 255 * Math.pow(Math.max(0, v), 1 / 2.2));
times.forEach((time, ti) => {
  if (anim) { const st = Object.fromEntries(state.split(',').map((kv) => kv.split('=')).map(([k, v]) => [k, +v])); for (let i = 0; i < Math.round((2 + time) * 60); i++) anim.update(1 / 60, st); } else rig.sample(clip, time, rig.pose, true);
  rig.solve(); rig.palette(pal);
  const { position: P, normal: N } = skinned(m, pal), nv = P.length / 3, X = new Float32Array(nv), Y = new Float32Array(nv), Z = new Float32Array(nv), Sh = new Float32Array(nv), zb = new Float32Array(W * H).fill(-1e9);
  for (let v = 0; v < nv; v++) { const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2], nx = N[v * 3] * c + N[v * 3 + 2] * s, ny = N[v * 3 + 1], nz = -N[v * 3] * s + N[v * 3 + 2] * c; X[v] = ((px * c + pz * s) - box[0]) * sc; Y[v] = (box[3] - py) * sc; Z[v] = -px * s + pz * c; Sh[v] = 0.75 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]) + 0.42 + 0.16 * ny; }
  for (let t = 0; t < I.length; t += 3) {
    const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2], x0 = X[i0], y0 = Y[i0], x1 = X[i1], y1 = Y[i1], x2 = X[i2], y2 = Y[i2], den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(den) < 1e-12) continue;
    const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2))), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2))), ya = Math.max(0, Math.floor(Math.min(y0, y1, y2))), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
      const qx = px + 0.5, qy = py + 0.5, u = ((y1 - y2) * (qx - x2) + (x2 - x1) * (qy - y2)) / den, v = ((y2 - y0) * (qx - x2) + (x0 - x2) * (qy - y2)) / den, w = 1 - u - v; if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const z = u * Z[i0] + v * Z[i1] + w * Z[i2], o = py * W + px; if (z <= zb[o]) continue; zb[o] = z;
      const sh = u * Sh[i0] + v * Sh[i1] + w * Sh[i2], q = (py * TW + ti * W + px) * 3;
      for (let k = 0; k < 3; k++) img[q + k] = enc(Math.pow((u * m.colour[i0 * 4 + k] + v * m.colour[i1 * 4 + k] + w * m.colour[i2 * 4 + k]) / 255, 2.2) * sh);
    }
  }
});
const out = opt('out', `hero_rig_${clip}.png`); fs.writeFileSync(out, png(TW, H, img)); console.log(`${out}: ${TW} x ${H}, ${state ? 'state ' + state : clip} at ${times.map((t) => t.toFixed(2)).join(', ')} s`);
