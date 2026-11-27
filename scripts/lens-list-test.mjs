// The lenticulars' list, without a browser: the plates a lens becomes, from either shape of
// list the field can hand over (the model's objects, or a snapshot's LENS records), and the
// places they stand in.
//   node scripts/lens-list-test.mjs
import * as THREE from 'three';
import { Lenticulars, LENS_LOOK } from '../src/sky/lenticulars.js';
import { LENS } from '../src/weather/sky/format.js';

let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) fails++; };

const R = 250000;
// one lens over the equator at longitude 0, 7 km long, 2.6 km across, two plates
const lens = { x: 1, y: 0, z: 0, base: 1500, length: 7000, width: 2600, heading: Math.PI / 2, plates: 2, strength: 1 };
const asRecords = (list) => {
  const out = new Float64Array(list.length * LENS.STRIDE);
  list.forEach((l, i) => {
    const o = i * LENS.STRIDE;
    out[o + LENS.ID] = i + 1; out[o + LENS.X] = l.x; out[o + LENS.Y] = l.y; out[o + LENS.Z] = l.z;
    out[o + LENS.BASE] = l.base; out[o + LENS.LENGTH] = l.length; out[o + LENS.WIDTH] = l.width;
    out[o + LENS.HEADING] = l.heading; out[o + LENS.PLATES] = l.plates; out[o + LENS.STRENGTH] = l.strength;
  });
  return out;
};
const cam = new THREE.Vector3(R + 2000, 0, 0);
const frame = (field) => ({ rig: { pos: cam }, sky: { field, t: 0, R, noClouds: false } });

const L = new Lenticulars(null);
// 1. the model's own list: objects
L.update(frame({ on: true, lenses: () => [lens] }));
const fromObjects = L.list.map((p) => ({ ...p }));
check('the model\'s list of objects becomes one plate per plate', fromObjects.length === lens.plates, `${fromObjects.length} plates`);

// 2. a snapshot's records, with no lenses(t) on the field
L.update(frame({ on: true, snaps: new Map([[0, { lenses: asRecords([lens]) }]]), pair: [0, 0, 0] }));
const fromRecords = L.list.map((p) => ({ ...p }));
check('a snapshot\'s LENS records become the same plates', fromRecords.length === fromObjects.length);
let worst = 0;
for (let i = 0; i < Math.min(fromObjects.length, fromRecords.length); i++) {
  for (const k of ['centre', 'along', 'across', 'up']) for (let j = 0; j < 3; j++) worst = Math.max(worst, Math.abs(fromObjects[i][k][j] - fromRecords[i][k][j]));
  worst = Math.max(worst, Math.abs(fromObjects[i].strength - fromRecords[i].strength));
}
check('and they stand in the same places, to a millimetre', worst < 1e-3, `worst ${worst.toExponential(1)} m`);

// 3. the plates' geometry: the lens lies ACROSS the wind, each plate as long as the record says
if (fromObjects.length) {
  const p = fromObjects[0];
  const len = 2 * Math.hypot(...p.along), wid = 2 * Math.hypot(...p.across), deep = 2 * Math.hypot(...p.up);
  check('a plate is as long and as wide as the lens', Math.abs(len - lens.length) < 1 && Math.abs(wid - lens.width) < 1, `${Math.round(len)} x ${Math.round(wid)} m`);
  check('and as flat as LENS_LOOK.FLAT says', Math.abs(deep - LENS_LOOK.FLAT * lens.width) < 1, `${deep.toFixed(0)} m deep`);
  // the wind blows toward heading = pi/2 (east): 'across' is the wind's way, 'along' the ridge's
  const east = [0, 1, 0], north = [0, 0, 1];
  const dotE = p.across.reduce((s, v, i) => s + v * east[i], 0) / Math.hypot(...p.across);
  const dotN = p.along.reduce((s, v, i) => s + v * north[i], 0) / Math.hypot(...p.along);
  check('it lies across the wind (the wind east, the lens north-south)', Math.abs(dotE) > 0.99 && Math.abs(dotN) > 0.99, `${dotE.toFixed(3)}, ${dotN.toFixed(3)}`);
  // the plates are stacked, and the first stands at the base
  const mid = fromObjects.map((q) => Math.hypot(q.centre[0] + cam.x, q.centre[1] + cam.y, q.centre[2] + cam.z) - R);
  check('the plates are stacked round the base', Math.abs((mid[0] + mid[1]) / 2 - lens.base) < 1, `${mid.map((m) => m.toFixed(0)).join(', ')} m`);
}

// 4. the nearest are taken, and what stands over the horizon is dropped
{
  const far = { ...lens, x: Math.cos(1.6), y: Math.sin(1.6), z: 0, plates: 1 };       // 400 km away round the world
  const mid = { ...lens, x: Math.cos(0.08), y: Math.sin(0.08), z: 0, plates: 1 };     // 20 km away
  L.update(frame({ on: true, lenses: () => [far, far, far, far, far, far, far, far, far, far, far, far, mid] }));
  check('a lens over the horizon is not drawn', L.list.length > 0 && L.list.length <= LENS_LOOK.MAX, `${L.list.length} plates`);
  const d = L.list.map((p) => Math.hypot(p.centre[0], p.centre[1], p.centre[2]));
  check('and the nearest one is, though it came last in the list', d.length === 1 && d[0] < 30000, `${d.map((x) => Math.round(x / 1000) + ' km').join(', ')}`);
}

// 5. they are handed over farthest first: see-through plates are laid over one another in the
// order they are drawn, and the nearest were TAKEN first only so that the cap takes those
{
  const far = { ...lens, x: Math.cos(0.1), y: Math.sin(0.1), z: 0, plates: 1 };   // 25 km off
  const mid = { ...lens, x: Math.cos(0.02), y: Math.sin(0.02), z: 0, plates: 1 }; //  5 km off
  L.update(frame({ on: true, lenses: () => [mid, far, { ...lens, plates: 3 }] }));
  const d = L.list.map((p) => Math.hypot(...p.centre));
  let falling = true;
  for (let i = 1; i < d.length; i++) if (d[i] > d[i - 1] + 1e-6) falling = false;
  check('the plates are handed over farthest first, so the near one is drawn over the far',
    d.length === 5 && falling, `${d.map((x) => Math.round(x / 1000) + ' km').join(', ')}`);
}

// 6. a field with neither call nor snapshot draws nothing, and so does a sky with no clouds
L.update(frame({ on: true }));
check('a field with neither a list nor a snapshot draws nothing', L.list.length === 0);
L.update({ rig: { pos: cam }, sky: { field: { on: true, lenses: () => [lens] }, t: 0, R, noClouds: true } });
check('?debug=noclouds takes the lenses too', L.list.length === 0);

// 7. a lens that has faded out is not drawn
L.update(frame({ on: true, lenses: () => [{ ...lens, strength: 0.01 }] }));
check('a lens faded below 0.02 is not drawn', L.list.length === 0);

// 8. the field's list is asked for rarely (the model works out a whole weather moment for every
// t it is given), but the plates follow the traveller every frame
{
  let asked = 0;
  const field = { on: true, lenses: () => { asked++; return [lens]; } };
  const L2 = new Lenticulars(null);
  for (let i = 0; i < 20; i++) L2.update({ rig: { pos: cam }, sky: { field, t: i * 0.1, R, noClouds: false } });
  check('twenty frames over two seconds ask the field once', asked === 1, `asked ${asked} times`);
  // (the list is also held for a quarter of a second of the WALL clock, however fast the game's
  // own clock runs: at sixty times real time, ten seconds of it go by six times a second)
  L2.update({ rig: { pos: cam }, sky: { field, t: 30, R, noClouds: false } });
  check('the wall clock holds it too, however far the game clock jumps', asked === 1, `asked ${asked} times`);
  await new Promise((r) => setTimeout(r, 300));
  L2.update({ rig: { pos: cam }, sky: { field, t: 60, R, noClouds: false } });
  check('and it is asked again once both clocks have moved on', asked === 2, `asked ${asked} times`);
  const before = L2.list[0].centre.slice();
  const cam2 = new THREE.Vector3(R + 2000, 500, 0);
  L2.update({ rig: { pos: cam2 }, sky: { field, t: 60.1, R, noClouds: false } });
  const moved = Math.abs(L2.list[0].centre[1] - before[1]);
  check('the plates still follow the traveller in between', moved > 400, `${Math.round(moved)} m`);
}

// 9. the governor's step: the nearest few lenses, one plate each, and they are still there
{
  const L3 = new Lenticulars(null);
  const three = [0.02, 0.04, 0.06, 0.08, 0.1].map((a) => ({ ...lens, x: Math.cos(a), y: Math.sin(a), z: 0, plates: 3 }));
  L3.update(frame({ on: true, lenses: () => three }));
  const full = L3.list.length;
  check('every lens asks for its plates', full === LENS_LOOK.MAX, `${full} plates`);
  L3.saving('lenses', true);
  L3.update(frame({ on: true, lenses: () => three }));
  check('the governor\'s step leaves the nearest few, one plate each', L3.list.length === LENS_LOOK.THIN_MAX && L3.list.length > 0, `${L3.list.length} plates`);
  check('and it answers to the governor and to the benchmark', L3.has('lenses') === true && L3.live('lenses') === true);
  L3.partOut('lenses', true);
  L3.update(frame({ on: true, lenses: () => three }));
  check('the benchmark can leave the lenses out', L3.list.length === 0 && L3.live('lenses') === false);
}

console.log(fails ? `lens-list-test: ${fails} FAILED` : 'lens-list-test: all passed');
process.exit(fails ? 1 : 0);
