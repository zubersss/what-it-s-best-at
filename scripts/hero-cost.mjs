// What the character costs the page each frame, without a browser (seconds):
//   node scripts/hero-cost.mjs [--world haven,moon] [--check file.json] [--write file.json] [--no-check]
// The cloth (robe, sleeves, hair: hero/robe.js) at 60 and at 30 frames a second, and the
// questions the figure asks the height function (the ground under it). This machine's
// times, not a phone's: what counts is before against after.
// The cloth's drawn points after ten seconds of a set flight are compared with those of
// the cloth as it was when its code was last changed on purpose (scripts/lib/robe-reference.json;
// --check another file; --no-check: not at all): the largest distance any point is off by,
// in millimetres; fails over 2 mm. A change to the cloth that is meant to move it writes the
// reference anew (--write scripts/lib/robe-reference.json) and shows the figure's poses.
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { Robe } from '../src/hero/robe.js';
import { Hero } from '../src/hero/hero.js';
import { loadWorld } from './lib/loadWorld.mjs';
import { latLonToDir } from '../src/core/ephemeris.js';

const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);

// A set flight: the body turning slowly, the air streaming past, gusting.
function fly(robe, fps, seconds) {
  const rot = new THREE.Matrix3(), m4 = new THREE.Matrix4(), g = new THREE.Vector3(0, -9.8, 0), acc = new THREE.Vector3(), wind = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new Float32Array(8 * 7 * 2);
  for (let i = 0; i < 8; i++) col.set([i < 4 ? (i < 2 ? 0.26 : -0.26) : (i < 6 ? 0.09 : -0.09), i < 4 ? 0.35 : -0.4, 0, i < 4 ? (i < 2 ? 0.3 : -0.3) : (i < 6 ? 0.09 : -0.09), i < 4 ? 0.0 : -0.9, 0.05, 0.05], i * 7);
  const dt = 1 / fps, n = Math.round(seconds * fps);
  robe.reset(rot);
  let worst = 0; const t0 = performance.now();
  for (let f = 0; f < n; f++) {
    const t = f * dt;
    m4.makeRotationFromEuler(new THREE.Euler(0.5 * Math.sin(t * 0.7), 0.4 * t, 0.2 * Math.sin(t * 1.1))); rot.setFromMatrix4(m4);
    wind.set(6 * Math.sin(t * 0.3), 1.5, -14 - 6 * Math.sin(t * 0.9));
    acc.set(2 * Math.sin(t * 2.0), 0, 1.5 * Math.cos(t * 1.3));
    const a = performance.now();
    robe.update(dt, rot, g, acc, wind, 0.2, col, up, -1.2);
    worst = Math.max(worst, performance.now() - a);
  }
  return { ms: (performance.now() - t0) / n, worst };
}

{
  const robe = new Robe();
  fly(robe, 60, 5);           // (warm)
  for (const fps of [60, 30]) { const r = fly(new Robe(), fps, 20); console.log(`cloth at ${fps} frames a second: ${r.ms.toFixed(3)} ms a frame (worst ${r.worst.toFixed(2)})`); }
  const half = new Robe(); half.halfRate = true; const r = fly(half, 30, 20);
  console.log(`cloth at 30 frames a second with the governor's saving on: ${r.ms.toFixed(3)} ms a frame`);
  const ref = new Robe(); fly(ref, 60, 10);
  const pts = Array.from(ref.positionAttr.array, (v) => +v.toFixed(5));
  if (opt('write', null)) { await writeFile(opt('write', null), JSON.stringify(pts)); console.log('written: ' + opt('write', null)); }
  const refFile = args.includes('--no-check') || opt('write', null) ? null : opt('check', new URL('./lib/robe-reference.json', import.meta.url));
  if (refFile) {
    const old = JSON.parse(await readFile(refFile, 'utf8'));
    let worst = 0;
    if (old.length !== pts.length) { console.log(`check: the cloth has ${pts.length / 3} drawn points, the reference ${old.length / 3}`); process.exit(1); }
    for (let i = 0; i < pts.length; i += 3) worst = Math.max(worst, Math.hypot(pts[i] - old[i], pts[i + 1] - old[i + 1], pts[i + 2] - old[i + 2]));
    console.log(`check: after ten seconds of the set flight the cloth's points are within ${(worst * 1000).toFixed(3)} mm of the reference`);
    if (!(worst < 0.002)) { console.log('FAILED: over 2 mm'); process.exit(1); }
  }
}

// The whole figure as the game runs it each frame (pose, limbs, cloth), in flight and on foot.
{
  const hero = new Hero();
  hero.group.visible = true;
  const rig = { localUp: [0, 0, 1], forward: new THREE.Vector3(1, 0, 0), right: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1), pitch: 0, agl: 50, heroRel: new THREE.Vector3(4, 0, -1), velocity: new THREE.Vector3(20, 0, 0), throttle: 1, boost: false, onFoot: false, airborne: false, yawRate: 0, vUp: 0, clock: 0, facing: new THREE.Vector3(1, 0, 0) };
  const env = { gravity: 9.8, air: 1, groundClearance: null };
  for (const foot of [false, true]) {
    rig.onFoot = foot; if (foot) rig.velocity.set(3, 0, 0);
    for (let i = 0; i < 600; i++) hero.update(1 / 60, rig, env);
    const r = hero.robe, u0 = r.update; let cloth = 0;
    r.update = function (...a) { const t = performance.now(); u0.apply(this, a); cloth += performance.now() - t; };
    const t0 = performance.now(), n = 3000;
    for (let i = 0; i < n; i++) { rig.clock += 1 / 60; hero.update(1 / 60, rig, env); }
    const all = (performance.now() - t0) / n;
    r.update = u0;
    console.log(`the figure ${foot ? 'on foot' : 'in flight'} at 60 frames a second: ${all.toFixed(3)} ms a frame, of it the cloth ${(cloth / n).toFixed(3)}, the pose and the rest ${(all - cloth / n).toFixed(3)}`);
  }
}

for (const id of opt('world', 'haven,moon').split(',')) {
  const { world, hs } = await loadWorld(id);
  const s = world.scene.start, d0 = latLonToDir(s.lat, s.lon), n = 4000;
  let sum = 0; const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    // (places a step apart round the opening place, as a figure moving asks)
    const x = d0[0] + (i % 64) * 2e-7, y = d0[1] + ((i / 64) | 0) * 2e-7, z = d0[2], l = Math.hypot(x, y, z);
    sum += hs.height(x / l, y / l, z / l, 1.0);
  }
  console.log(`${world.name}: one question to the height function (the ground under the figure) ${((performance.now() - t0) / n).toFixed(4)} ms (mean height ${(sum / n).toFixed(1)} m)`);
}
