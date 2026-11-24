// What making the near trees' lists costs the page (no browser; seconds): the real Trees class
// (life/trees.js) on the real trees of a Haven wood, timed in Node. Two kinds of making
// (life/treeLod.js): the whole list (every tree within reach, the far cards, the trees in
// flower) every REBUILD_M, and the close and near lists every few metres. Prints the
// milliseconds and the bytes handed to the GPU of each, and what a second of walking (4.5
// m/s), of super speed (60 m/s) and of low flight (21 m/s) costs at that pace.
// (Node on this machine is not a phone: a phone's JavaScript is some three times slower.)
//
// Run: node scripts/tree-build-cost.mjs [--lat 22.983 --lon 129.507]
import * as THREE from 'three';
import { loadWorld } from './lib/loadWorld.mjs';
import { setMadeCover } from './lib/madeCover.mjs';
import { treeBlock, blockDeg, blockLon, TREE_FLOATS } from '../src/life/treeBlock.js';
import { Trees, nearListReach } from '../src/life/trees.js';
import { fineStep, REBUILD_M } from '../src/life/treeLod.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const LAT = arg('lat', 22.983), LON = arg('lon', 129.507);
const { world, hs } = await loadWorld('haven');
setMadeCover(hs, world, LAT, LON);
globalThis.fetch = () => Promise.reject(new Error('no atlas in Node')); globalThis.createImageBitmap = () => Promise.reject(new Error('no atlas in Node'));
const origErr = console.error; console.error = () => {};
const terrain = { shared: { uWind: { value: new THREE.Vector4(1, 0, 0, 3) } } };
const trees = new Trees(world, terrain);
setTimeout(() => { console.error = origErr; }, 0);          // (after the atlas has failed to load, quietly)
const radius = world.life.trees.radius ?? 240, R = world.radius, DEG = blockDeg(R), M = R * Math.PI / 180;
// every block within reach, as the trees ask for them
const bi0 = Math.floor(LAT / DEG), nb = Math.ceil(nearListReach(radius) / 111.2) + 1;
let blocks = 0;
for (let bi = bi0 - nb; bi <= bi0 + nb; bi++) {
  const dLon = blockLon(bi, DEG), count = Math.round(360 / dLon), bj0 = Math.floor(LON / dLon);
  for (let bu = bj0 - nb; bu <= bj0 + nb; bu++) {
    const bj = ((bu % count) + count) % count, b = treeBlock(hs, bi, bj, world.life.trees.spacing ?? 7);
    trees.blocks.set(bi + ':' + bj, { state: 1, origin: b.origin, trees: b.trees, vis: null, count: b.count, used: 0 });
    blocks++;
  }
}
const at = (lat, lon, h) => { const la = lat * Math.PI / 180, lo = lon * Math.PI / 180, r = R + h; return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)); };
const p0 = at(LAT, LON, hs.height ? 0 : 0), up = p0.clone().normalize(), east = new THREE.Vector3(-Math.sin(LON * Math.PI / 180), Math.cos(LON * Math.PI / 180), 0);
// (the ground's height there: the trees' own, the nearest tree's distance from the centre)
let ground = R, best = 1e18;
for (const b of trees.blocks.values()) for (let k = 0; k < b.count; k++) { const q = k * TREE_FLOATS, x = b.origin[0] + b.trees[q], y = b.origin[1] + b.trees[q + 1], z = b.origin[2] + b.trees[q + 2], l = Math.hypot(x, y, z), d = (x / l - up.x) ** 2 + (y / l - up.y) ** 2 + (z / l - up.z) ** 2; if (d < best) { best = d; ground = l; } }
const eye = up.clone().multiplyScalar(ground + 1.7);
const rig = { pos: eye.clone(), agl: 1.7 };
const bytes = (lods) => trees.sets.flat(2).filter((s) => lods.includes(s.lod)).reduce((n, s) => n + s.count * (4 + 4 + 3 + 4 + 4) * 4, 0);
// warm up, then time each kind many times over a walk east
trees._build(rig, radius);
let tWhole = 0, nWhole = 0, tFine = 0, nFine = 0, bWhole = 0, bFine = 0;
for (let k = 0; k < 60; k++) {
  rig.pos.copy(eye).addScaledVector(east, k * 0.9);
  let t = performance.now(); trees._fine(rig.pos); tFine += performance.now() - t; nFine++; bFine += bytes([0, 1]);
  if (k % 6 === 0) { t = performance.now(); trees._build(rig, radius); tWhole += performance.now() - t; nWhole++; bWhole += bytes([0, 1, 2]); }
}
const whole = tWhole / nWhole, fine = tFine / nFine, wb = bWhole / nWhole, fb = bFine / nFine;
let listed = 0; for (const s of trees.sets.flat(2)) listed += s.count;
console.log(`${blocks} blocks, ${trees._list.length} trees within reach; drawn ${trees.count}, listed ${listed} (far cards cut inside the near radius are listed and not drawn)`);
console.log(`the whole list: ${whole.toFixed(2)} ms, ${(wb / 1024).toFixed(0)} KB to the GPU (every ${REBUILD_M} m)`);
console.log(`the close and near lists: ${fine.toFixed(2)} ms, ${(fb / 1024).toFixed(0)} KB to the GPU`);
for (const [what, speed, agl] of [['walking', 4.5, 1.7], ['super speed on foot', 60, 1.7], ['low flight, boosted', 21, 15]]) {
  const step = fineStep(1, true, agl, speed), perS = speed / step, wholeS = speed / REBUILD_M;
  console.log(`${what} (${speed} m/s, close and near lists every ${step.toFixed(1)} m): ${(perS * fine + wholeS * whole).toFixed(2)} ms and ${((perS * fb + wholeS * wb) / 1024).toFixed(0)} KB a second (it was ${(wholeS * whole).toFixed(2)} ms and ${(wholeS * wb / 1024).toFixed(0)} KB with the whole list every ${REBUILD_M} m and nothing between)`);
}
