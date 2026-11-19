// A hands-off trip (GO) flown without a browser, the way App.updateTransfer flies it, to
// check that it arrives, how long it takes against the time the target marker predicts,
// and that a trip to a place on the same world never touches the ground on the way.
//   node scripts/transfer.mjs [--case body|place|both] [--arc 60] [--lat 30] [--ground 0] [--hover]
// Each trip is flown twice: HOVER off (gravity takes over on arrival) and on (it must stay put).
// body: from 2 m above a Mars-sized world to a Moon-sized world 2000 of its radii away.
// place: from 2 m above the ground to a place --arc degrees away along the surface (smooth
// ground at height 0), the place --lat degrees off the start's latitude.
import * as THREE from 'three';
import { CameraRig } from '../src/controls/cameraRig.js';
import { surroundings } from '../src/controls/gravity.js';
import { aimDirection, gapTo, standoff, transferMult, tripTime } from '../src/controls/autopilot.js';
import { flightBase } from '../src/controls/speedLaw.js';

const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const which = opt('case', 'both');
const A = { radius: 3389500, gravity: 3.71 }, B = { radius: 1737400, gravity: 1.62 };
const DEG = Math.PI / 180, dt = 1 / 60;
const input = { dx: 0, dy: 0, wheel: 0, moveX: 0, moveY: 0, down: () => false, hit: () => false };

// hand (optional): { world, at: [x, y, z] } the target body as a world, centred at `at`: when
// its surface becomes nearer than the ground being left, the engine makes it home (as
// App.switchWorld does): everything shifts so its centre is the origin, and the target
// is then the world underfoot. The planet-fixed axes also turn (by 112 degrees, about what
// they turn between Mars and the Moon), and the trip's heading turns with them.
function fly(rig, target, world, others, label, hand) {
  const around = {}, q = new THREE.Quaternion(), qi = new THREE.Quaternion(), want = new THREE.Vector3(), aim = [0, 0, 0];
  const p = rig.pos, cam = () => [p.x, p.y, p.z];
  const predicted = tripTime(cam(), target, world.radius, rig.pos.length() - world.radius - rig.agl);
  rig.auto = { mult: 1 };
  if (rig.onFoot) rig._takeOff(8);
  let t = 0, minAlt = Infinity, arrived = -1, maxMult = 1, maxGap = 0, atArrival = '', after5 = '';
  const gapStart = gapTo(cam(), target);
  for (; t < 600; t += dt) {
    const wells = [{ x: 0, y: 0, z: 0, radius: world.radius, gravity: world.gravity }, ...others.map((o) => ({ x: o.pos[0], y: o.pos[1], z: o.pos[2], radius: o.radius, gravity: o.gravity }))];
    const s = surroundings(p, wells, around);
    rig.pull.set(s.gx, s.gy, s.gz); rig.nearDir.set(s.nx, s.ny, s.nz); rig.nearR = s.nr;
    rig.spaceDistance = Math.min(...others.map((o) => Math.hypot(o.pos[0] - p.x, o.pos[1] - p.y, o.pos[2] - p.z) - o.radius), Infinity);
    if (hand && !hand.done && rig.spaceDistance < rig.agl * 0.8) {
      const Rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, 0.8, 0.52).normalize(), 112 * DEG);
      const at = hand.at, f = rig.forward.clone().applyQuaternion(Rq), u = rig.up.clone().applyQuaternion(Rq), v = rig.velocity.clone().applyQuaternion(Rq), auto = rig.auto;
      if (auto?.dir) auto.dir.applyQuaternion(Rq);
      p.set(p.x - at[0], p.y - at[1], p.z - at[2]).applyQuaternion(Rq);
      const old = new THREE.Vector3(-at[0], -at[1], -at[2]).applyQuaternion(Rq);
      others = [{ pos: [old.x, old.y, old.z], radius: world.radius, gravity: world.gravity }];
      world = hand.world; target.pos = [0, 0, 0];
      rig.setWorld(world, () => 0); rig.velocity.copy(v); rig.lookAlong(f); if (rig.keepUp) rig.keepUp(u);
      rig.auto = auto; hand.done = t;
      rig.spaceDistance = Math.hypot(p.x - others[0].pos[0], p.y - others[0].pos[1], p.z - others[0].pos[2]) - others[0].radius;
    }
    if (rig.auto) {
      if (gapTo(cam(), target) < standoff(target)) {
        arrived = t; rig.auto = null;
        atArrival = `${gapTo(cam(), target).toFixed(0)} m from the target at ${rig.velocity.length().toFixed(0)} m/s`;
        // as App.stopTransfer: hand back the speed the stick would give here
        rig.velocity.clampLength(0, flightBase(Math.max(1.5, Math.min(rig.agl, rig.spaceDistance))));
      }
      else {
        // as App.updateTransfer: the flight follows the planned path (the view is left alone here)
        const a = aimDirection(cam(), target, world.radius, aim);
        want.set(a[0], a[1], a[2]);
        const dir = rig.auto.dir || (rig.auto.dir = rig.forward.clone());
        q.setFromUnitVectors(dir, want);
        dir.applyQuaternion(qi.identity().slerp(q, 1 - Math.exp(-dt * 2.5))).normalize();
        const clear = Math.max(1, Math.min(rig.agl, rig.spaceDistance));
        rig.auto.mult = transferMult(clear, rig.nearR - clear);
        maxMult = Math.max(maxMult, rig.auto.mult);
      }
    }
    rig.update(dt, input, false);
    if (rig.auto && t > 1) minAlt = Math.min(minAlt, rig.agl);
    if (process.env.TRACE && Math.round(t / dt) % 120 === 0) console.log(`    t ${t.toFixed(0)} s: height ${rig.agl.toExponential(2)} m, to the target ${gapTo(cam(), target).toExponential(2)} m, space ${rig.spaceDistance.toExponential(2)} m`);
    if (rig.auto) maxGap = Math.max(maxGap, gapTo(cam(), target));
    if (arrived >= 0 && !after5 && t > arrived + 5) after5 = `${rig.agl.toFixed(0)} m`;
    if (arrived >= 0 && t > arrived + 30) break;
  }
  const gapEnd = gapTo(cam(), target);
  label += rig.hover ? ' (HOVER on)' : ' (HOVER off)';
  console.log(`${label}:${hand ? ` (the target became home at ${hand.done ? hand.done.toFixed(1) + ' s' : 'no point'})` : ''}`);
  console.log(`  predicted by the marker: ${predicted.toFixed(1)} s · arrived after ${arrived < 0 ? 'never' : arrived.toFixed(1) + ' s'} · largest extra boost x${maxMult.toFixed(2)}`);
  console.log(`  lowest height above the ground on the way (after the first second): ${Number.isFinite(minAlt) ? minAlt.toFixed(0) + ' m' : '-'}; farthest from the target on the way: ${(100 * maxGap / gapStart).toFixed(1)} % of the start`);
  console.log(`  at arrival: ${atArrival || '-'}; height 5 s later: ${after5 || '-'}`);
  console.log(`  30 s after arriving: ${gapEnd.toFixed(0)} m from the target (stop distance ${standoff(target).toFixed(0)} m), height ${rig.agl.toFixed(0)} m, speed ${rig.velocity.length().toFixed(1)} m/s`);
  return { predicted, arrived };
}

for (const hover of [false, true]) {
if (which === 'body' || which === 'both') {
  // Leave A from 2 m up; B 2000 of its radii away, and made home on the way as in the game.
  const rig = new CameraRig(A, () => 0);
  rig.setMode('hero'); rig.hover = hover;
  rig.pos.set(0, A.radius + 2, 0); rig.agl = 2;
  rig.lookAlong(new THREE.Vector3(0, 1, 0));
  const tB = { kind: 'body', pos: [2000 * B.radius, 0, 0], radius: B.radius };
  fly(rig, tB, A, [{ pos: tB.pos, radius: B.radius, gravity: B.gravity }], 'to a Moon-sized world 2000 radii away', { world: B, at: tB.pos.slice() });
}
if (which === 'place' || which === 'both') {
  const arc = +opt('arc', '60') * DEG, lat = +opt('lat', '30') * DEG, G = +opt('ground', '0');     // --ground: the whole world's ground this high above the datum
  const rig = new CameraRig(A, () => G);
  rig.setMode('hero'); rig.hover = hover;
  rig.pos.set(A.radius + G + 2, 0, 0); rig.agl = 2;
  rig.lookAlong(new THREE.Vector3(0, 1, 0));
  const d = [Math.cos(lat) * Math.cos(arc), Math.cos(lat) * Math.sin(arc), Math.sin(lat)];
  const tP = { kind: 'place', pos: d.map((x) => x * (A.radius + G)), radius: 0 };
  const sep = Math.acos(d[0]) / DEG;
  fly(rig, tP, A, [], `to a place ${sep.toFixed(0)} degrees away on the same world`);
}
}
