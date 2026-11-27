// The low cloud from straight above as the game cuts it, without a browser in seconds: the
// field's cover of the hour (left: heaps red, sheets blue, the ground's height grey) and the
// cloud the shared rule carves from it (right: the most cloud at any height over each place,
// as the volume marches it and the far shell reads it). For telling a fault of the model from a
// fault of the drawing before any picture.
//   node scripts/sky-above.mjs [--t 4] [--lat .. --lon ..] [--span 120] [--stub fair] [--out file.png]
// --t is the game's hour (?t=, from the scene's moment); the weather's clock is worked out here.
import fs from 'node:fs';
import { havenProducer, tWeather } from './sky-scan.mjs';
import { png } from './lib/png.mjs';
import { sampler2D, sampler3D } from './lib/glslSamplers.mjs';
import { cloudNoiseData } from '../src/sky/cloudNoiseData.js';
import { skyLowJS, skyLowDensityJS, skyHeapBodyJS, skyMassJS, skyToLowJS, steerQuat, skyRiseOf, SKY_V0 } from '../src/sky/skyGlsl.js';
import { Steer } from '../src/weather/sky/steer.js';
import haven from '../src/worlds/haven.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const H = Number(arg('t', 4)), lat0 = Number(arg('lat', haven.scene.start.lat)), lon0 = Number(arg('lon', haven.scene.start.lon));
const SPAN = Number(arg('span', 120)) * 1000, out = arg('out', 'sky-above.png'), W = Number(arg('px', 256));
const R = haven.radius, t = tWeather(H), p = havenProducer(arg('stub', null));
const s = p.snapshot(Math.floor(t / 120) * 120);
const maps = { A: sampler2D(s.A, s.width, s.height, 4), B: sampler2D(s.B, s.width, s.height, 4) };
const noise = sampler3D(cloudNoiseData(64), 64, 2);
const steer = new Steer(haven.weather, R);
const rise = skyRiseOf(steer, t);
const u = { uSkyLow: [1 / haven.clouds.volume.scale, R, haven.clouds.shadow, 1], uCloudSteer: steerQuat(steer.motion('low', t)), uCloudRise: [rise[0], rise[1], rise[2], 0] };
const px = new Uint8Array(W * 2 * W * 3);
let cov = 0, drawn = 0, shell = 0;
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
  const dn = (0.5 - (j + 0.5) / W) * SPAN, de = ((i + 0.5) / W - 0.5) * SPAN;
  const la = (lat0 + dn / R * 180 / Math.PI) * Math.PI / 180, lo = (lon0 * Math.PI / 180) + de / R / Math.cos(la);
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const L = skyLowJS(maps, up);
  let d = 0;
  for (let k = 0; k < 8; k++) {
    const r = R + L[2] + (L[3] - L[2]) * (k + 0.5) / 8;
    d = Math.max(d, skyLowDensityJS(maps, noise, u, [up[0] * r, up[1] * r, up[2] * r]));
  }
  // the far shell's reading: the body at the height where the masses are widest
  const rr = R + L[2] + (L[3] - L[2]) * SKY_V0.WIDEST, q = skyToLowJS(u.uCloudSteer, up).map((x) => x * rr * u.uSkyLow[0]);
  const body = Math.max(skyHeapBodyJS(skyMassJS(noise, q, rr, u.uCloudRise[0]), L[0]), L[1] > 0 ? Math.min(1, Math.max(0, (L[1] - 0.02) / 0.28)) : 0);
  cov += Math.max(L[0], L[1]) > 0.1 ? 1 : 0; drawn += d > 0.25 ? 1 : 0; shell += body > 0.12 ? 1 : 0;
  const o = (j * 2 * W + i) * 3;
  px[o] = 40 + 215 * L[0]; px[o + 1] = 40; px[o + 2] = 40 + 215 * L[1];
  const o2 = (j * 2 * W + W + i) * 3, g = 255 * Math.min(1, d * 1.2), b = 255 * Math.min(1, body);
  px[o2] = g; px[o2 + 1] = Math.max(g, b * 0.5); px[o2 + 2] = Math.max(60, g);
}
fs.writeFileSync(out, png(W * 2, W, px));
const n = W * W;
console.log(`?t=${H}: cover over 0.1 on ${(100 * cov / n).toFixed(0)} % of the square; cloud carved (the volume's rule) over ${(100 * drawn / n).toFixed(1)} %; the far shell's body over ${(100 * shell / n).toFixed(1)} % -> ${out}`);
