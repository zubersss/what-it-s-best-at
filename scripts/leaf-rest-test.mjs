// The lying leaves and petals at rest (life/leaves.js, Shed), replayed without a browser: a
// traveller standing still by trees that have leaves under them. Once every leaf lies, its
// buffer must not be handed to the GPU again (4 800 leaves are 75 KB a time, inside the
// picture's pass), and while they are being laid only the stretch laid that frame is: the run fails if it is handed over in any of the last 300 frames, or when
// the trees' list is made again with the same trees.
//   node scripts/leaf-rest-test.mjs [--break relist]
import * as THREE from 'three';
import { TreeLeaves, Petals } from '../src/life/leaves.js';
const brk = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : '';
const R = 250000, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const anchor = V(R + 1400, 0, 0);
const list = () => Array.from({ length: 12 }, (_, k) => ({ x: 0, y: 10 + 9 * k, z: 6 * (k % 3), tall: 14, wide: 0.9, fall: 0.4, down: 0.6, colour: [0.4, 0.2, 0.03], litter: [0.3, 0.16, 0.03] }));
const trees = {
  def: {}, reach: 240, anchor, world: { radius: R },
  shared: { uTreeEast: { value: V(0, 1, 0) }, uTreeNorth: { value: V(0, 0, 1) }, uTreeUp: { value: V(1, 0, 0) }, uSeason: { value: V(0, 0, 0) }, uAnchorRel: { value: V() }, uTreeWind: { value: new THREE.Vector4(0, 1, 0, 3) } },
  terrain: { radius: R, hs: null, drawnHeight: (d) => 1400 + 3 * Math.sin(d[1] * 40000) },
  shedding: list(), blooming: list(),
};
const rig = { pos: V(R + 1401.7, 0, 0), agl: 1.7, fov: 60, localUp: [1, 0, 0] };
let failed = 0;
for (const [name, Make, key] of [['leaves', TreeLeaves, 'shedding'], ['petals', Petals, 'blooming']]) {
  const p = new Make(trees), lie = p.lieGeo.attributes.aLie, n = p.o.lying, lay = Math.ceil(n / p.o.perFrame);
  let last = lie.version, early = 0, late = 0, relistUp = 0, most = 0;
  const total = 2 * lay + 320;
  for (let f = 0; f < total; f++) {
    // (the trees' lists are made again every so often as they are in the game, by the same trees)
    let again = false;
    if (f > 2 * lay && f % 50 === 0) { trees[key] = list(); if (brk === 'relist') trees[key][0].y += 3; again = true; }
    trees.shared.uSeason.value.z += 1 / 30;
    p.update(rig, 720, 1 / 30);
    if (lie.version !== last && f < lay) most = Math.max(most, p.sentFloats || 0);
    if (lie.version !== last) { last = lie.version; if (f >= 2 * lay + 20) { if (again) relistUp++; else late++; } else early++; }
  }
  const ok = late === 0 && relistUp === 0 && p.left === 0 && most > 0 && most <= 4 * 4 * p.o.perFrame * 8;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}: ${n} lying, laid in ${lay} frames (${early} hand-overs while laying and setting again, ${most * 4} bytes at most in one while laying); at rest after that: ${late} hand-overs in 300 frames, ${relistUp} when the same trees were listed again; ${p.left} still to lay`);
  if (!ok) failed++;
}
console.log(failed ? `\n${failed} FAILED` : '\nlying leaves at rest: nothing handed over');
process.exit(failed ? 1 : 0);
