// Flies the camera rig from one world to another without a browser and reports what the
// pilot would get. Used to tune (and to show) aim, fly-by behaviour and gravity.
//   node scripts/flyby.mjs [--rig src/controls/cameraRig.js] [--miss 0] [--release 0] [--hover 0]
// The trip: leave a Mars-sized world from 5 radii up, not straight above the launch point
// (as from any real site), with a Moon-sized world 2000 of its radii away. The view is
// aimed once, at the target's centre or `--miss` target radii beside it, and never
// touched again; forward and boost are held. --release 1 lets go of the stick once the
// target starts to recede. The hand-over to the target world happens as in the game.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { surroundings } from '../src/controls/gravity.js';

const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const { CameraRig } = await import(pathToFileURL(path.resolve(opt('rig', 'src/controls/cameraRig.js'))).href);
const A = { radius: 3389500, gravity: 3.71 }, B = { radius: 1737400, gravity: 1.62 };
const posB = new THREE.Vector3(2000 * B.radius, 0, 0);          // in A's frame
let home = A, other = { def: B, pos: posB.clone() };             // `other` is given in the home world's frame
const rig = new CameraRig(home, () => 0);
rig.setMode('hero'); rig.hover = opt('hover', '0') === '1';
rig.pos.set(0, 5 * A.radius, 0); rig.agl = 0;
const miss = +opt('miss', '0'), release = opt('release', '0') === '1';
rig.lookAlong(posB.clone().add(new THREE.Vector3(0, 0, miss * B.radius)).sub(rig.pos));
const keys = new Set(['KeyW', 'ShiftLeft']);
const input = { dx: 0, dy: 0, wheel: 0, moveX: 0, moveY: 0, down: (k) => keys.has(k), hit: () => false };
const around = {}, dt = 1 / 60, to = new THREE.Vector3(), prev = new THREE.Vector3();
let closest = Infinity, tClosest = 0, maxSweep = 0, switched = -1, receding = false, havePrev = false, maxOff = 0;
const log = [];
for (let t = 0; t < 60; t += dt) {
  const dB = rig.pos.distanceTo(other.pos) - other.def.radius;
  rig.spaceDistance = Math.max(0, dB);
  if (rig.pull) {
    const s = surroundings(rig.pos, [{ x: 0, y: 0, z: 0, radius: home.radius, gravity: home.gravity }, { x: other.pos.x, y: other.pos.y, z: other.pos.z, radius: other.def.radius, gravity: other.def.gravity }], around);
    rig.pull.set(s.gx, s.gy, s.gz); rig.nearDir.set(s.nx, s.ny, s.nz); rig.nearR = s.nr;
  }
  if (home === A && dB < rig.agl * 0.8) {                         // hand-over, as App.switchWorld does it
    const f = rig.forward.clone(), u = rig.up.clone(), v = rig.velocity.clone();
    rig.pos.sub(posB); home = B; other = { def: A, pos: posB.clone().negate() };
    rig.setWorld(B, () => 0); rig.velocity.copy(v); rig.lookAlong(f); if (rig.keepUp) rig.keepUp(u);
    switched = t;
  }
  rig.update(dt, input, false);
  // everything below is measured against the target world B
  const centre = home === B ? new THREE.Vector3() : posB, d = rig.pos.distanceTo(centre);
  if (d < closest) { closest = d; tClosest = t; } else if (!receding && d > closest * 1.05) { receding = true; if (release) keys.clear(); }
  to.copy(centre).sub(rig.pos).normalize();
  if (havePrev && d < 60 * B.radius) maxSweep = Math.max(maxSweep, prev.angleTo(to) / dt * 180 / Math.PI);
  prev.copy(to); havePrev = true;
  if (d > 3 * B.radius) maxOff = Math.max(maxOff, to.angleTo(rig.forward) * 180 / Math.PI);
  if (Math.round(t / dt) % 300 === 0) log.push(`${t.toFixed(0)}s ${(d / B.radius).toFixed(1)}`);
}
const centre = home === B ? new THREE.Vector3() : posB, end = rig.pos.distanceTo(centre) / B.radius;
console.log(`  hand-over to the target world: ${switched < 0 ? 'never' : 'at ' + switched.toFixed(1) + ' s'}`);
console.log(`  closest approach: ${(closest / B.radius).toFixed(2)} target radii from its centre, at ${tClosest.toFixed(1)} s`);
console.log(`  largest angle between the view and the target on the way (beyond 3 radii): ${maxOff.toFixed(1)} degrees`);
console.log(`  fastest sweep of the target across the sky (inside 60 radii): ${maxSweep.toFixed(0)} degrees per second`);
console.log(`  distance from the target's centre, in its radii: ${log.join(' · ')}`);
console.log(`  after 60 s: ${end.toFixed(2)} radii from the centre${end < 1.01 ? ' — on the ground' : ''}`);
