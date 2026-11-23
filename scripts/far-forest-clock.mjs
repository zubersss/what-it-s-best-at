// The far forest with the clock run fast, without a browser: the real update loops of the
// near trees (life/trees.js) and of the far forest (life/farForest.js) are run frame by
// frame against workers that answer a few frames later, while the Sun turns as it does at
// an hour a second (15 degrees a second). It counts what was asked for.
//
// What it guards: blocks of near trees whose shadow was worked out for an older Sun were
// counted as missing, and the far forest asks for nothing while near trees are missing;
// at this rate the Sun outdates them every six frames, so the far forest was never asked
// for at all and tiles made at night stayed unlit after sunrise.
//
//   node scripts/far-forest-clock.mjs [--src <a copy of src/ to run instead>] [--rate 3600] [--seconds 20]
// Fails (exit 1) when no far tile is asked for after the first sweep, or when the near
// trees' lists are made again more than twice a second.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { opt, root } from './lib/browser.mjs';

const src = path.resolve(opt('src', path.join(root, 'src')));
const imp = (f) => import(pathToFileURL(path.join(src, f)).href);
const { Trees } = await imp('life/trees.js');
const { FarForest } = await imp('life/farForest.js');
const { WORLDS } = await imp('worlds/index.js');
const RATE = +opt('rate', 3600), SECONDS = +opt('seconds', 20), FPS = 60;

// the clock the two loops read (performance.now), stepped a frame at a time
let nowMs = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => nowMs }, configurable: true });

const world = WORLDS.haven, R = world.radius, rad = Math.PI / 180;
const lat = 22.983, lon = 129.507, cl = Math.cos(lat * rad), up = new THREE.Vector3(cl * Math.cos(lon * rad), cl * Math.sin(lon * rad), Math.sin(lat * rad));
const sun = new THREE.Vector3();
// Workers: four of them, a job is answered three frames after it was taken; no tree in any
// answer (what is counted is the asking).
const jobs = []; const asked = { trees: 0, treeTile: 0 }; let frame = 0, builds = 0;
const workers = {
  get idle() { return 4 - jobs.length; },
  run(m) {
    if (jobs.length >= 4) return null;
    asked[m.type]++;
    let done; const p = new Promise((res) => { done = res; });
    jobs.push({ at: frame + 3, done, m });
    return p;
  },
};
const terrain = { epoch: 1, coverSerial: 1, ringSerial: 1, workers, tiles: { busy: false }, wanted: [], _sunHalf: 0.00465 };
const shared = () => ({ uSunDir: { value: sun }, uSeason: { value: new THREE.Vector3() }, uAnchorRel: { value: new THREE.Vector3() }, uTreeRadius: { value: 240 }, uTreeEast: { value: new THREE.Vector3() }, uTreeNorth: { value: new THREE.Vector3() }, uTreeUp: { value: new THREE.Vector3() }, uFar: { value: new THREE.Vector4() } });

const trees = Object.create(Trees.prototype);
Object.assign(trees, { terrain, world, def: world.life.trees, shared: shared(), sets: [], blocks: new Map(), asked: 0, frame: 0, serial: -1, fraction: 1, reach: 0, dirty: true, atlasReady: true, anchor: new THREE.Vector3(), builtAt: new THREE.Vector3(1e9, 0, 0), _e: [0, 0, 0], _n: [0, 0, 0], _u: [0, 0, 0], gen: 1 });
const build = trees._build; trees._build = function (...a) { builds++; return build.apply(this, a); };
const far = Object.create(FarForest.prototype);
Object.assign(far, { terrain, trees, world, def: world.life.trees.far, shared: shared(), pool: [], tiles: new Map(), asked: 0, frame: 0, serial: -1, fraction: 1, missing: 0, _p: new THREE.Vector3(), _rel: new THREE.Vector3(), gen: 1 });

const rig = { pos: up.clone().multiplyScalar(R + 2), agl: 2 };
const east = new THREE.Vector3(-up.y, up.x, 0).normalize();
let firstSweep = null, farAfter = 0, nearAfter = 0, buildsAfter = 0;
for (frame = 0; frame < SECONDS * FPS; frame++) {
  nowMs = frame * 1000 / FPS;
  // the Sun: 30 degrees up, going round at 15 degrees an hour of the game's clock
  const a = (frame / FPS) * RATE / 3600 * 15 * rad;
  sun.copy(up).multiplyScalar(Math.sin(30 * rad)).addScaledVector(east, Math.cos(30 * rad) * Math.cos(a)).addScaledVector(new THREE.Vector3().crossVectors(up, east), Math.cos(30 * rad) * Math.sin(a)).normalize();
  for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].at <= frame) { const j = jobs.splice(i, 1)[0]; j.done({ origin: [rig.pos.x, rig.pos.y, rig.pos.z], count: 0, trees: new ArrayBuffer(0), vis: new ArrayBuffer(0), ms: 20 }); }
  await null; await null; await null;                    // (the replies' then-callbacks run)
  const t0 = asked.trees, f0 = asked.treeTile, b0 = builds;
  trees.update(rig, 100, frame / FPS);
  far.update(rig);
  // (the first sweep: everything is new, both ask as fast as the workers answer)
  if (firstSweep == null && frame > 30 && trees.missing === 0 && [...far.tiles.values()].every((t) => t.state === 1)) firstSweep = frame;
  if (firstSweep != null && frame > firstSweep) { nearAfter += asked.trees - t0; farAfter += asked.treeTile - f0; buildsAfter += builds - b0; }
}
const secs = firstSweep == null ? 0 : (SECONDS * FPS - firstSweep) / FPS;
console.log(`the clock at ${RATE} x for ${SECONDS} s (${src === path.join(root, 'src') ? 'this code' : src}): ${trees.blocks.size} blocks of near trees, ${far.tiles.size} far tiles`);
console.log(firstSweep == null ? '  the first sweep never finished: something was always missing' : `  first sweep in after ${(firstSweep / FPS).toFixed(1)} s; in the ${secs.toFixed(1)} s after it: ${farAfter} far tiles asked for again (${(farAfter / secs).toFixed(1)} a second), ${nearAfter} near blocks (${(nearAfter / secs).toFixed(1)} a second), the near lists made again ${buildsAfter} times (${(buildsAfter / secs).toFixed(1)} a second)`);
const fail = [];
if (firstSweep == null) fail.push('with the Sun racing, the far forest never had all its tiles');
else {
  // (only where the Sun moves more than a tile's shadow allows in the time: 1.5 degrees)
  if (farAfter === 0 && secs * RATE / 3600 * 15 > 3) fail.push('no far tile was asked for again while the Sun went round: tiles made at night stay unlit');
  if (buildsAfter / secs > 2) fail.push(`the near trees' lists were made again ${(buildsAfter / secs).toFixed(1)} times a second`);
}
if (fail.length) { for (const f of fail) console.error('FAILED: ' + f); process.exit(1); }
console.log('far forest, clock run fast: every check passed');
