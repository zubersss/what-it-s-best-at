// What the sky draws every frame whatever is on screen, counted without a browser: the clouds'
// shade map (sky/cloudShade.js) draws its near and middle windows only when their picture can
// have changed, and its probe looks every fourth frame.
//   node scripts/sky-turns-test.mjs [--break always]
// --break always draws the windows every frame, as they were: the first check must fail.
import * as THREE from 'three';
import { CloudShade, SHADE } from '../src/sky/cloudShade.js';
import haven from '../src/worlds/haven.js';

const BREAK = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : null;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const R = haven.radius;
// a renderer that keeps count of what is drawn where
const log = [];
const renderer = {
  autoClear: true, vp: [0, 0, 1, 1],
  getRenderTarget: () => null, setRenderTarget() {}, getViewport(v) { return v; }, getScissor(v) { return v; }, getScissorTest: () => false,
  setScissorTest() {}, setScissor() {}, clear() {}, setViewport(x, y, w, h) { this.vp = [x, y, w, h]; },
  render() { log.push(this.vp.join(',')); },
  readRenderTargetPixelsAsync: () => new Promise(() => {}),
};
const shared = { uCloud: { value: new THREE.Vector4(0.85, R + 2500, 0, 0) }, tClouds: { value: null }, uCloudHeap: { value: new THREE.Vector4() }, uCloudVol: { value: new THREE.Vector4() } };
const cs = new CloudShade({ shared });
const near = `${SHADE.NEAR_X},${SHADE.NEAR_Y},${SHADE.WIN},${SHADE.WIN}`, mid = `${SHADE.MID_X},${SHADE.MID_Y},${SHADE.WIN},${SHADE.WIN}`;
const la = -48.5 * Math.PI / 180, lo = 49 * Math.PI / 180;
const at = (east) => new THREE.Vector3(Math.cos(la) * Math.cos(lo + east / (R * Math.cos(la))), Math.cos(la) * Math.sin(lo + east / (R * Math.cos(la))), Math.sin(la)).multiplyScalar(R + 1500);
const sun = new THREE.Vector3(0.3, 0.5, 0.81).normalize();
const sky = { R, rate: 1, shotMode: false, world: haven, noClouds: false };
let n = 0, m = 0;
const frame = (pos, s = sun) => {
  log.length = 0;
  if (BREAK === 'always') { cs._kN = null; cs._kM = null; }
  cs.render(renderer, { pos, agl: 100, world: haven, onFoot: false, mode: 'fly' }, s, true, sky);
  n += log.filter((x) => x === near).length; m += log.filter((x) => x === mid).length;
};
// standing still for 240 frames
for (let k = 0; k < 4; k++) frame(at(0));
n = m = 0;
for (let k = 0; k < 240; k++) frame(at(0));
check(n <= 240 / SHADE.NEAR_EVERY + 2 && m <= 240 / SHADE.MID_EVERY + 2 && n >= 240 / SHADE.NEAR_EVERY - 2 && m >= 240 / SHADE.MID_EVERY - 2,
  `standing still, 240 frames: the near window drawn ${n} times and the middle ${m} (every ${SHADE.NEAR_EVERY} and every ${SHADE.MID_EVERY} frames: the clouds drift), not 240 each`);
// a step of the lattice is drawn in the very frame
n = m = 0; frame(at(SHADE.NEAR_STEP * 1.2));
check(n === 1, `the traveller moves a near texel: the near window is drawn in that frame (${n})`);
n = m = 0; frame(at(SHADE.NEAR_STEP * 1.2 + SHADE.MID_STEP * 1.2));
check(n === 1 && m === 1, `... and a middle texel: both (${n}, ${m})`);
// flying 80 m a frame: every frame
n = m = 0; for (let k = 1; k <= 30; k++) frame(at(2000 + 80 * k));
check(n === 30, `flying 80 m a frame, the near window is drawn every frame (${n} of 30)`);
// the Sun moves
for (let k = 0; k < 3; k++) frame(at(5000));
n = m = 0; frame(at(5000), new THREE.Vector3(0.3, 0.502, 0.81).normalize());
check(n === 1 && m === 1, `the Sun moves: both windows in that frame (${n}, ${m})`);
// the world window's strip every WORLD_EVERY frames, and on the other frames the atlas is not bound at all
{
  let strips = 0, idle = 0;
  for (let k = 0; k < 64; k++) { frame(at(5000)); if (log.some((x) => x === `0,0,${SHADE.WORLD_W},${SHADE.WORLD_H}`)) strips++; if (!log.some((x) => x === near || x === mid || x.endsWith(`,${SHADE.WORLD_W},${SHADE.WORLD_H}`))) idle++; }
  check(strips === 64 / SHADE.WORLD_EVERY, `the world window's strip is drawn every ${SHADE.WORLD_EVERY} frames (${strips} of 64)`);
  check(idle >= 40, `standing still, the atlas is not drawn into at all on ${idle} frames of 64 (it was bound, and read back by a tile-based GPU, on every one)`);
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
