// A hands-off trip (GO) flown without a browser, the way App.updateTransfer flies it, to
// check that it arrives, how long it takes against the time the target marker predicts,
// and that a trip to a place on the same world never touches the ground on the way.
//   node scripts/transfer.mjs [--case body|place|both] [--arc 60] [--lat 30] [--ground 0]
// body: from 2 m above a Mars-sized world to a Moon-sized world 2000 of its radii away.
// place: from 2 m above the ground to a place --arc degrees away along the surface (smooth
// ground at height 0), the place --lat degrees off the start's latitude.
import * as THREE from 'three';
import { CameraRig } from '../src/controls/cameraRig.js';
import { surroundings } from '../src/controls/gravity.js';
import { aimDirection, gapTo, standoff, transferMult, tripTime } from '../src/controls/autopilot.js';

const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const which = opt('case', 'both');
const A = { radius: 3389500, gravity: 3.71 }, B = { radius: 1737400, gravity: 1.62 };
const DEG = Math.PI / 180, dt = 1 / 60;
const input = { dx: 0, dy: 0, wheel: 0, moveX: 0, moveY: 0, down: () => false, hit: () => false };

function fly(rig, target, world, others, label) {
  const around = {}, q = new THREE.Quaternion(), qi = new THREE.Quaternion(), want = new THREE.Vector3(), aim = [0, 0, 0];
  const p = rig.pos, cam = () => [p.x, p.y, p.z];
  const predicted = tripTime(cam(), target, world.radius, rig.pos.length() - world.radius - rig.agl);
  rig.auto = { mult: 1 };
  if (rig.onFoot) rig._takeOff(8);
  let t = 0, minAlt = Infinity, arrived = -1, maxMult = 1;
  for (; t < 600; t += dt) {
    const wells = [{ x: 0, y: 0, z: 0, radius: world.radius, gravity: world.gravity }, ...others.map((o) => ({ x: o.pos[0], y: o.pos[1], z: o.pos[2], radius: o.radius, gravity: o.gravity }))];
    const s = surroundings(p, wells, around);
    rig.pull.set(s.gx, s.gy, s.gz); rig.nearDir.set(s.nx, s.ny, s.nz); rig.nearR = s.nr;
    rig.spaceDistance = Math.min(...others.map((o) => Math.hypot(o.pos[0] - p.x, o.pos[1] - p.y, o.pos[2] - p.z) - o.radius), Infinity);
    if (rig.auto) {
      if (gapTo(cam(), target) < standoff(target)) { arrived = t; rig.auto = null; }
      else {
        const a = aimDirection(cam(), target, world.radius, aim);
        want.set(a[0], a[1], a[2]);
        q.setFromUnitVectors(rig.forward, want);
        rig.lookAlong(rig.forward.clone().applyQuaternion(qi.identity().slerp(q, 1 - Math.exp(-dt * 2.5))));
        const clear = Math.max(1, Math.min(rig.agl, rig.spaceDistance));
        rig.auto.mult = transferMult(clear, rig.nearR - clear);
        maxMult = Math.max(maxMult, rig.auto.mult);
      }
    }
    rig.update(dt, input, false);
    if (rig.auto && t > 1) minAlt = Math.min(minAlt, rig.agl);
    if (arrived >= 0 && t > arrived + 30) break;
  }
  const gapEnd = gapTo(cam(), target);
  console.log(`${label}:`);
  console.log(`  predicted by the marker: ${predicted.toFixed(1)} s · arrived after ${arrived < 0 ? 'never' : arrived.toFixed(1) + ' s'} · largest extra boost x${maxMult.toFixed(2)}`);
  console.log(`  lowest height above the ground on the way (after the first second): ${Number.isFinite(minAlt) ? minAlt.toFixed(0) + ' m' : '-'}`);
  console.log(`  30 s after arriving: ${gapEnd.toFixed(0)} m from the target (stop distance ${standoff(target).toFixed(0)} m), speed ${rig.velocity.length().toFixed(1)} m/s`);
  return { predicted, arrived };
}

if (which === 'body' || which === 'both') {
  // Leave A from 2 m up; B 2000 of its radii away (no world hand-over here: B is a target body seen from A's frame).
  const rig = new CameraRig(A, () => 0);
  rig.setMode('hero'); rig.hover = false;
  rig.pos.set(0, A.radius + 2, 0); rig.agl = 2;
  rig.lookAlong(new THREE.Vector3(0, 1, 0));
  const tB = { kind: 'body', pos: [2000 * B.radius, 0, 0], radius: B.radius };
  fly(rig, tB, A, [{ pos: tB.pos, radius: B.radius, gravity: B.gravity }], 'to a Moon-sized world 2000 radii away');
}
if (which === 'place' || which === 'both') {
  const arc = +opt('arc', '60') * DEG, lat = +opt('lat', '30') * DEG, G = +opt('ground', '0');     // --ground: the whole world's ground this high above the datum
  const rig = new CameraRig(A, () => G);
  rig.setMode('hero'); rig.hover = false;
  rig.pos.set(A.radius + G + 2, 0, 0); rig.agl = 2;
  rig.lookAlong(new THREE.Vector3(0, 1, 0));
  const d = [Math.cos(lat) * Math.cos(arc), Math.cos(lat) * Math.sin(arc), Math.sin(lat)];
  const tP = { kind: 'place', pos: d.map((x) => x * (A.radius + G)), radius: 0 };
  const sep = Math.acos(d[0]) / DEG;
  fly(rig, tP, A, [], `to a place ${sep.toFixed(0)} degrees away on the same world`);
}
