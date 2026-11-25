// The fog sheet's lattice, without a browser: it is a lattice OF THE WORLD, so nothing of it
// moves when the traveller moves between two anchors, and what the shader is given depends on
// the anchor alone and never on where the traveller stands in its cell.
//   node scripts/fog-sheet-test.mjs
import * as THREE from 'three';
import { FogSheet, FOG_LOOK, frameAt } from '../src/sky/fogSheet.js';
import { SKY_UNIFORMS } from '../src/sky/skyGlsl.js';
import haven from '../src/worlds/haven.js';

let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) fails++; };

const R = haven.radius;
const step = FOG_LOOK.SPAN / (FOG_LOOK.N - 1);
const half = (FOG_LOOK.N - 1) / 2;
SKY_UNIFORMS.uSkyLow.value.y = R;
// a field that says there is fog everywhere, and never asks the clock
const field = { on: true, at: (q, t, out) => { out.field.fogTop = 120; out.field.country = 20; return out; } };

const fog = new FogSheet(null);
fog.uniforms.tCloudNoise.value = {};                       // (the noise is made in a worker; its presence is all that is asked)

// the traveller walks 12 km north from a place on Haven, in steps of 60 m
const lat = -41.674 * Math.PI / 180, lon = 59.442 * Math.PI / 180, alt = 1800;
const start = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)).multiplyScalar(R + alt);
const f0 = frameAt([start.x, start.y, start.z]);
const corner = (u) => {                                    // the far corner of the lattice, a world point
  const a = u.uAnchor.value, e = u.uEast.value, n = u.uNorth.value, d = half * step;
  return [a.x + e.x * d + n.x * d, a.y + e.y * d + n.y * d, a.z + e.z * d + n.z * d];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const pos = start.clone();
const frame = () => { fog.update({ rig: { pos }, sky: { R, t: 0, field, noClouds: false } }); return fog.ready; };
check('with fog in reach the sheet is drawn', frame() === true);

let worstHeld = 0, biggest = 0, moves = 0, anchors = 0;
let prevCorner = corner(fog.uniforms), prevAnchor = fog.uniforms.uAnchor.value.clone();
for (let i = 1; i <= 200; i++) {
  pos.addScaledVector(new THREE.Vector3(f0.north[0], f0.north[1], f0.north[2]), 60);
  frame();
  const c = corner(fog.uniforms), moved = dist(c, prevCorner);
  const anchorMoved = fog.uniforms.uAnchor.value.distanceTo(prevAnchor) > 1e-6;
  if (anchorMoved) { anchors++; biggest = Math.max(biggest, moved); }
  else worstHeld = Math.max(worstHeld, moved);
  if (moved > 1e-6) moves++;
  prevCorner = c; prevAnchor = fog.uniforms.uAnchor.value.clone();
}
check('over 12 km the lattice is re-anchored a few times, and only then does it move',
  anchors >= 20 && anchors <= 30 && moves === anchors, `${anchors} anchors, ${moves} moves`);
check('between two anchors no point of the sheet moves at all (the corner, 42 km out)',
  worstHeld < 1e-6, `${worstHeld.toExponential(1)} m`);
check('and at an anchor it moves by about one step, not by a swing of the whole sheet',
  biggest > 0 && biggest < 1.6 * step, `${biggest.toFixed(0)} m at the corner (a step is ${step.toFixed(0)} m)`);

// what the shader is given depends on the anchor alone: two travellers in the same cell, one at
// its edge, must be given the very same lattice
{
  const a = fog.uniforms.uAnchor.value.clone(), e = fog.uniforms.uEast.value.clone();
  const p2 = a.clone().addScaledVector(e, step * 0.49);
  const f2 = new FogSheet(null); f2.uniforms.tCloudNoise.value = {};
  f2._anchor = [a.x, a.y, a.z];
  f2.update({ rig: { pos: p2 }, sky: { R, t: 0, field, noClouds: false } });
  const far = dist(corner(f2.uniforms), corner(fog.uniforms));
  check('two travellers in the same cell are given the same lattice', far < 1e-6, `${far.toExponential(1)} m apart`);
}

// and with no fog in reach it is not drawn at all
{
  const dry = new FogSheet(null); dry.uniforms.tCloudNoise.value = {};
  dry.update({ rig: { pos: start.clone() }, sky: { R, t: 0, field: { on: true, at: (q, t, out) => { out.field.fogTop = 0; out.field.country = 20; return out; } }, noClouds: false } });
  check('with no fog in reach nothing is drawn', dry.ready === false);
}

// the governor's step and the benchmark's part: a coarser lattice over the same ground, the fog
// still there (a step thins; it does not take away what the place is about)
{
  const tri = (g) => g.index.count / 3;
  const fine = tri(fog.mesh.geometry);
  fog.saving('fog-sheet', true);
  frame();
  const coarse = tri(fog.mesh.geometry);
  check('the governor\'s step quarters the sheet\'s triangles and keeps the fog',
    coarse * 4 === fine && fog.ready === true && fog.uniforms.uStep.value === 2 * step,
    `${fine} -> ${coarse} triangles, step ${fog.uniforms.uStep.value} m`);
  check('and the step and the part are offered to the governor', fog.has('fog-sheet') && fog.has('fog') && fog.live('fog-sheet') === true);
  fog.saving('fog-sheet', false); frame();
  check('and it goes back when there is room again', tri(fog.mesh.geometry) === fine && fog.uniforms.uStep.value === step);
  fog.partOut('fog', true); frame();
  check('the benchmark can leave the fog out', fog.ready === false && fog.live('fog-sheet') === false);
  fog.partOut('fog', false);
}

console.log(fails ? `fog-sheet-test: ${fails} FAILED` : 'fog-sheet-test: all passed');
process.exit(fails ? 1 : 0);
