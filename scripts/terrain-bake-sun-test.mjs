// The land's own shadow, baked per terrain patch, is baked for one Sun for every patch drawn,
// without a browser in seconds. The real Terrain.update (terrain/terrain.js) is run frame by
// frame while the traveller walks and the Sun turns, with a strip of patches in place of the
// quadtree (each pair under a parent, as a split does: the parent is drawn until both its
// children have arrived, and the shader blends a child into its parent's map), workers that
// answer three frames later, and map rings arriving twice (the ground built again).
//
// On 5024b61 a patch built while walking was baked for the Sun of that moment, its neighbours
// and its parent for a Sun up to a degree older (they wait for a degree before being baked
// again): a seam along the patch's edge, and the blend from its parent ran between two
// shadow edges. At Haven's opening (the Sun 19.5 degrees up) a degree moves the shadow of a
// 50 m rise by 7.9 m.
//
// Whenever nothing is on its way (no job at the workers, nothing waiting to be taken in),
// every patch drawn and every parent a drawn patch blends into must have been baked for the
// same Sun.
//
//   node scripts/terrain-bake-sun-test.mjs [--src <a copy of src/ to run instead>]
// Fails (exit 1) when they differ, or when the run saw too little to say (no patch built
// while walking, no new bake of the shadows, no moment with nothing on its way).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const src = path.resolve(opt('src', path.join(root, 'src')));
// (the clock the terrain reads, a frame at a time)
let nowMs = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => nowMs }, configurable: true });
const { Terrain } = await import(pathToFileURL(path.join(src, 'terrain/terrain.js')).href);
const RAD = Math.PI / 180, R = 250000, FPS = 30, FRAMES = 2400, SPEED = 4.5, EDGE = 8, SEEN = 40;

// workers: two, each job answered three frames after it was taken
let frame = 0; const jobs = [], asked = { chunk: 0, shadow: 0 };
const workers = {
  get idle() { return 2 - jobs.length; },
  run(m) {
    if (jobs.length >= 2) return null;
    asked[m.type]++;
    let done; const p = new Promise((res) => { done = res; });
    jobs.push({ at: frame + 3, done, m });
    return p;
  },
};
const answer = (m) => m.type === 'shadow' ? { shadow: new Uint8Array(1) } : { center: [m.ix * EDGE / 2 ** (m.level - 5), 0, R], radius: EDGE, minH: 0, maxH: 1, ms: 5 };
const SLOTS = 256;
const pool = { free: [...Array(SLOTS).keys()].reverse(), slots: Array.from({ length: SLOTS }, () => ({ node: null, detail: [0, 0, 0], morphX: 0, fade: 0 })), instances: new Float32Array(SLOTS * 64), upload() {}, uploadShadow() {}, setCount() {}, gpuBytes: 0 };

// the strip: parents (level 4, 16 m) each over two children (level 5, 8 m)
const node = (level, ix, parent) => ({ face: 0, level, ix, iy: 0, slot: -1, reserved: -1, loading: false, dead: false, parent, center: new THREE.Vector3(ix * EDGE * 2 ** (5 - level), 0, R), radius: EDGE, edge: EDGE * 2 ** (5 - level), a0: 0, b0: 0, size: 1, children: null });
const parents = new Map();
const parentAt = (i) => { if (!parents.has(i)) { const p = node(4, i, null); p.children = [node(5, 2 * i, p), node(5, 2 * i + 1, p)]; parents.set(i, p); } return parents.get(i); };

const t = Object.create(Terrain.prototype);
Object.assign(t, {
  world: { terrain: { minAltitude: 0 } }, radius: R, maxLevel: 5, hs: null, relief: 1, epoch: 1, frame: 0,
  drawList: [], wanted: [], ready: [], readyShadows: [], readyRefresh: [], regions: [], ringBoxes: [], ringSerial: 0, staleData: 0,
  pool, workers, tiles: { update() {}, busy: false, busyElevation: false, catchingUp: false },
  lodScale: 1, maxChunks: 1000, splitIn: 1, splitOut: 1, frustum: new THREE.Frustum(), wideFrustum: new THREE.Frustum(),
  roots: [{ children: null }], _cam: new THREE.Vector3(), _camDir: [0, 0, 1], _focusDir: [0, 0, 1], _focusAlt: 0, _focus: null, dest: null,
  idleFrames: 0, uploads: 0, buildMs: 0, built: 0, worldAt: -1e9, farDistance: 1e6,
});
// (the quadtree's visit, for the strip: what is seen within 40 m of the eye; a parent drawn until both its children are there)
t._visit = function () {
  const x = this._cam.x;
  for (let i = Math.floor((x - SEEN) / 16); i <= Math.floor((x + SEEN) / 16); i++) {
    const p = parentAt(i); p.lastVisit = this.frame; p.dist = Math.abs(p.center.x - x);
    if (p.slot < 0) { if (!p.loading) { p.prio = p.dist; this.wanted.push(p); } continue; }
    let ready = true;
    for (const c of p.children) { c.lastVisit = this.frame; c.dist = Math.abs(c.center.x - x); if (c.slot < 0) { ready = false; if (!c.loading) { c.prio = c.dist; this.wanted.push(c); } } }
    if (ready) { if (!p.childrenLive) { p.childrenLive = true; p.liveAt = this.now; } for (const c of p.children) this.drawList.push(c); }
    else { p.childrenLive = false; this.drawList.push(p); }
  }
};
// (a map ring that has arrived: every patch drawn is out of date and built again)
let ringStale = false;
t._stale = () => ringStale;

const sun = new THREE.Vector3();
const rig = { pos: new THREE.Vector3(), camera: { quaternion: new THREE.Quaternion() }, fov: 60, agl: 1.7 };
// (the angle between two directions, exact for small ones as an arc cosine is not)
const angle = (a, b) => Math.atan2(Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / RAD;
let settled = 0, worst = 0, worstAt = -1, worstDrawn = 0, builtWalking = 0;
for (frame = 0; frame < FRAMES; frame++) {
  nowMs = frame * 1000 / FPS;
  // the Sun 19.5 degrees up, turning 0.012 degrees a frame (a degree every 2.8 s: the clock run fast)
  const az = (130 + frame * 0.012) * RAD;
  sun.set(Math.cos(19.5 * RAD) * Math.sin(az), Math.cos(19.5 * RAD) * Math.cos(az), Math.sin(19.5 * RAD)).normalize();
  for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].at <= frame) { const j = jobs.splice(i, 1)[0]; j.done(answer(j.m)); }
  await null; await null; await null;
  if (frame === 700 || frame === 1500) { t.ringSerial++; ringStale = true; }
  if (frame === 760 || frame === 1560) ringStale = false;
  rig.pos.set(frame * SPEED / FPS, 0, R + 1.7);
  const before = asked.chunk;
  t.update(rig, 2, sun, 0.00465);
  if (frame > 60) builtWalking += asked.chunk - before;
  // nothing on its way: every patch drawn, and the parents they blend into, baked for one Sun
  if (jobs.length || t.ready.length || t.readyShadows.length || t.readyRefresh.length) continue;
  settled++;
  const shown = new Set();
  for (const n of t.drawList) { shown.add(n); if (n.parent && n.parent.slot >= 0) shown.add(n.parent); }
  const suns = [...shown].map((n) => n.shadowSun).filter(Boolean), drawn = t.drawList.map((n) => n.shadowSun).filter(Boolean);
  for (const a of suns) for (const b of suns) { const d = angle(a, b); if (d > worst) { worst = d; worstAt = frame; } }
  for (const a of drawn) for (const b of drawn) worstDrawn = Math.max(worstDrawn, angle(a, b));
}
console.log(`${FRAMES} frames, ${(FRAMES * SPEED / FPS).toFixed(0)} m walked, the Sun turned ${(FRAMES * 0.012).toFixed(1)} degrees: ${asked.chunk} patches built (${builtWalking} while walking), ${asked.shadow} shadows baked again; ${settled} frames with nothing on its way`);
console.log(`  on those, the largest difference between the Suns two patches drawn were baked for: ${worstDrawn.toFixed(4)} degrees; with the parents they blend into: ${worst.toFixed(4)} degrees${worstAt >= 0 ? ` (frame ${worstAt})` : ''}`);
const fail = [];
if (builtWalking < 10) fail.push('hardly a patch was built while walking: the test saw nothing');
if (asked.shadow < 10) fail.push('the shadows were never baked again while the Sun turned: the test saw nothing');
if (settled < FRAMES * 0.1) fail.push(`only ${settled} frames had nothing on its way: the shadows never settle`);
if (worstDrawn > 1e-6) fail.push(`patches drawn side by side were baked for Suns ${worstDrawn.toFixed(3)} degrees apart (a seam in the land's shadow)`);
if (worst > 1e-6) fail.push(`a patch and the parent it blends into were baked for Suns ${worst.toFixed(3)} degrees apart`);
if (fail.length) { console.log('FAIL:\n  ' + fail.join('\n  ')); process.exit(1); }
console.log(`ok (${src === path.join(root, 'src') ? 'this code' : src})`);
