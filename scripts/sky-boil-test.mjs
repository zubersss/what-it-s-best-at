// Do the heaps drift whole? The field's cloud is cut from two readings of the noise in ONE frame
// (the low layer's steering), so sideways they go together; upward the fine reading rises through
// the coarse one (steer.js's rise). This counts, without a browser, how much of a field of heaps
// changes in 60 s of the game's clock in the pattern's own frame (where drifting with the wind
// is standing still): the share of places and heights whose cloud appears or goes.
//   node scripts/sky-boil-test.mjs [--break slide]
// --break slide lets the coarse reading slide 3 m/s against the fine one: the check must fail.
import { sampler3D } from './lib/glslSamplers.mjs';
import { cloudNoiseData } from '../src/sky/cloudNoiseData.js';
import { skyLowNoise2JS, skyMassOfJS, skyMassLowJS, skyHeapAtTJS, skyCarveJS, skyEdgeEatJS, skyRiseOf, CLOUD_RULE } from '../src/sky/skyGlsl.js';
import { Steer } from '../src/weather/sky/steer.js';
import haven from '../src/worlds/haven.js';

const BREAK = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : null;
const noise = sampler3D(cloudNoiseData(64), 64, 2), R = haven.radius, SCALE = haven.clouds.volume.scale;
const steer = new Steer(haven.weather, R);
const t0 = steer.t(Date.parse(haven.scene.dateUTC) + 4 * 3600e3);
const cloud = (x, y, c, yy, a, slide) => {
  const depth = 600 + 2400 * c, r = R + 2500 + yy * depth;
  // (a place of the pattern: metres east and north on a patch of the sphere, in noise units)
  const q = [(R + 2500) / SCALE + yy * depth / SCALE, x / SCALE, y / SCALE];
  const ql = [q[0], q[1] + slide / SCALE, q[2]];
  const low = skyMassLowJS(noise, ql), n = skyMassOfJS(skyLowNoise2JS(noise, q, r, a), low);
  return skyEdgeEatJS(skyHeapAtTJS(n[0], n[0] + (low - n[0]) * CLOUD_RULE.TOP_LOW, skyCarveJS(c), c, yy), n[1]) > 0.25;
};
let failed = 0;
for (const [c, limit] of [[0.5, 0.06], [1.0, 0.06]]) {
  let worst = 0, when = 0, covered = 0;
  for (const dt0 of [0, 600, 1500, 2700]) {
    const a0 = skyRiseOf(steer, t0 + dt0)[0], a1 = skyRiseOf(steer, t0 + dt0 + 60)[0];
    let on = 0, flip = 0;
    for (let j = 0; j < 90; j++) for (let i = 0; i < 90; i++) for (let k = 0; k < 5; k++) {
      const x = i * 300, y = j * 300, yy = (k + 0.5) / 5;
      const A = cloud(x, y, c, yy, a0, 0), B = cloud(x, y, c, yy, a1, BREAK === 'slide' ? 180 : 0);
      if (A) on++; if (A !== B) flip++;
    }
    const share = flip / Math.max(1, on);
    if (share > worst) { worst = share; when = dt0; }
    covered = on / (90 * 90 * 5);
  }
  const ok = worst < limit;
  console.log(`${ok ? 'ok  ' : 'FAIL'} cover ${c}: in 60 s of the clock at most ${(100 * worst).toFixed(1)} % of a heap's cloud appears or goes in its own frame (at +${when} s; ${(100 * limit).toFixed(0)} % allowed; cloud in ${(100 * covered).toFixed(0)} % of the places and heights)`);
  if (!ok) failed++;
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
