// The near shadow map's lattice under a still spot, without a browser in a second. The real
// shadows/nearShadow.js is run with a renderer that writes down each tile's camera; for spots
// on the ground round the eye, where each lies on its tile's lattice of texels is followed
// from one drawing of the tile to the next. Where that changes by a fraction of a texel, every
// shadow edge there is drawn again a fraction of a texel off: it moves in one frame.
//
// 1. The light's axes are taken anew when the Sun has moved 0.03 degrees (every seven
//    seconds at Haven's clock), and the lattice turns about its anchor. On 5024b61 the
//    anchor stayed where it was put, up to 300 m back: the lattice under the eye moved
//    that far times the turn, up to a wide texel (15 cm). Here the eye stands still at
//    40 to 280 m from where the anchor was put, the Sun moves just past the limit, and the
//    lattice under every spot within 60 m must move less than a fine texel (3.9 cm). (The
//    turn itself moves a spot r metres from where it turns about by r times the turn: about
//    the eye, 3.3 cm at 60 m. The axes made anew from the local up also turned by the
//    up's own turn over the ground walked since: 0.06 degrees after 280 m on Haven.)
// 2. The anchor is put again after 300 m of travel. While it stays, the tiles move by whole
//    texels and the lattice keeps its place on the ground; on 5024b61 the new anchor was the
//    eye itself, off the lattice, and every shadow near by moved up to half a texel at once.
//    Walking 400 m (the Sun still), the lattice under the spots within 60 m of the eye must
//    not move at all (under a millimetre).
//
//   node scripts/shadow-axes-test.mjs [--src <a copy of src/ to run instead>]
// Fails (exit 1) when either moves more than it may, or when the test saw no renewal or no
// new anchor (a test that cannot fail is worse than none).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const src = path.resolve(opt('src', path.join(root, 'src')));
const { NearShadow } = await import(pathToFileURL(path.join(src, 'shadows/nearShadow.js')).href);
const RAD = Math.PI / 180, R = 250000, EYE = 1.7, FINE_TEXEL = 40 / 1024;

let target = null, draws = [];
const renderer = {
  setRenderTarget(t) { target = t; }, clear() {}, getContext: () => ({ invalidateFramebuffer() {}, invalidateSubFramebuffer() {}, FRAMEBUFFER: 0, COLOR_ATTACHMENT0: 0 }),
  render(mesh, cam) { const v = target.viewport, k = v.x === 0 ? 0 : v.y === 0 ? 1 : 2; if (!draws.some((d) => d.k === k)) draws.push({ k, n: v.z, cam: cam.clone() }); },
};
// Haven's opening place; the Sun 19.5 degrees up toward the south-east (as the opening has it)
const lat = -48.55 * RAD, lon = 49.06 * RAD;
const up0 = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
const east = new THREE.Vector3(-Math.sin(lon), Math.cos(lon), 0), north = new THREE.Vector3().crossVectors(up0, east);
const sunAt = (elev, az) => up0.clone().multiplyScalar(Math.sin(elev * RAD)).addScaledVector(east, Math.cos(elev * RAD) * Math.sin(az * RAD)).addScaledVector(north, Math.cos(elev * RAD) * Math.cos(az * RAD)).normalize();
// a place on the ground so many metres east and north of the opening (the world's round)
const ground = (e, n) => up0.clone().multiplyScalar(R).addScaledVector(east, e).addScaledVector(north, n).normalize().multiplyScalar(R);
const eyeAt = (e, n) => { const g = ground(e, n); return g.addScaledVector(g.clone().normalize(), EYE); };

function shadowMap() {
  const ns = new NearShadow(renderer);
  ns.every = 2; ns.alternate = true;                          // Sharp, as app.js sets it
  const geo = new THREE.InstancedBufferGeometry(); geo.instanceCount = 1;
  ns.addCaster(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()), new THREE.MeshBasicMaterial());
  return ns;
}
// Draws frames from a place and keeps each scene tile's last drawing.
function frames(ns, eye, sun, n, last) {
  const up = eye.clone().normalize();
  for (let f = 0; f < n; f++) { draws = []; ns.render(eye, sun, [up.x, up.y, up.z]); for (const d of draws) if (d.k < 2) last[d.k] = { ...d, eye: eye.clone() }; }
  return last;
}
// Where a spot lies on a drawing's lattice (texels, x and y) and how far inside the tile (0..1 of its half-width).
function onLattice(d, spot) {
  d.cam.updateMatrixWorld(true);
  const v = spot.clone().sub(d.eye).project(d.cam);
  return { x: (v.x + 1) / 2 * d.n, y: (v.y + 1) / 2 * d.n, m: Math.max(Math.abs(v.x), Math.abs(v.y)) };
}
const wrap = (x) => x - Math.round(x);
// How far the lattice under each spot moved between two drawings of each scene tile (m),
// for the spots where that tile is read (the fine one inside 0.98 of it; the wide one beyond 0.86 of the fine one)
function shift(before, after, spots) {
  const out = [0, 0];
  for (const s of spots) {
    const f0 = onLattice(before[1], s), f1 = onLattice(after[1], s);
    for (const k of [0, 1]) {
      const a = onLattice(before[k], s), b = onLattice(after[k], s);
      const read = k === 1 ? f0.m < 0.98 && f1.m < 0.98 : (f0.m >= 0.86 || f1.m >= 0.86) && a.m < 0.995 && b.m < 0.995;
      if (!read) continue;
      const texel = 2 * before[k].cam.right / before[k].n;
      out[k] = Math.max(out[k], Math.max(Math.abs(wrap(b.x - a.x)), Math.abs(wrap(b.y - a.y))) * texel);
    }
  }
  return out;
}
// spots on the ground within 60 m of a place
const spotsAround = (e0, n0) => { const out = []; for (const r of [1, 3, 6, 10, 15, 20, 30, 45, 60]) for (let a = 0; a < 360; a += 15) out.push(ground(e0 + r * Math.sin(a * RAD), n0 + r * Math.cos(a * RAD))); return out; };

const fail = [];
// 1. the axes taken anew, the eye still
let worst1 = [0, 0], near1 = [0, 0], cases = 0, renewed = 0;
for (const back of [40, 80, 120, 160, 200, 240, 280]) for (const way of [0, 90, 225]) {
  // (the Sun moved 0.031 degrees, just past the limit, up, along the sky, or down and back)
  const de = 0.031 * Math.cos(way * RAD), da = 0.031 * Math.sin(way * RAD) / Math.cos(19.5 * RAD);
  const ns = shadowMap(), sun0 = sunAt(19.5, 130), sun1 = sunAt(19.5 + de, 130 + da);
  frames(ns, eyeAt(0, 0), sun0, 4, []);                         // the anchor is put here
  const e = back * Math.sin(70 * RAD), n = back * Math.cos(70 * RAD);
  const before = frames(ns, eyeAt(e, n), sun0, 4, []);         // walked off and standing still
  const s0 = before[0].cam.quaternion.clone();
  const after = frames(ns, eyeAt(e, n), sun1, 4, []);          // the Sun just past the limit
  if (after[0].cam.quaternion.angleTo(s0) > 1e-5) renewed++;
  const d = shift(before, after, spotsAround(e, n)), d20 = shift(before, after, spotsAround(e, n).slice(0, 6 * 24));
  worst1 = [Math.max(worst1[0], d[0]), Math.max(worst1[1], d[1])]; near1 = [Math.max(near1[0], d20[0]), Math.max(near1[1], d20[1])]; cases++;
}
const cm = (m) => (m * 100).toFixed(2) + ' cm';
console.log(`1. the light's axes taken anew with the eye still, 40 to 280 m from where the anchor was put (${renewed} of ${cases} cases renewed them): the lattice under a spot within 60 m moved at most ${cm(worst1[1])} in the fine tile, ${cm(worst1[0])} in the wide one (within 20 m: ${cm(near1[1])} and ${cm(near1[0])}; a fine texel: ${cm(FINE_TEXEL)})`);
if (renewed < cases) fail.push(`the Sun moved past the limit and the axes were not taken anew in ${cases - renewed} cases: the test saw nothing`);
if (Math.max(...worst1) >= FINE_TEXEL) fail.push(`the axes taken anew moved the lattice under a still spot by ${cm(Math.max(...worst1))}, a fine texel or more`);

// 2. a walk of 400 m with the Sun still: the anchor is put again at 300 m
let worst2 = [0, 0], resets = 0;
for (const heading of [0, 70, 205]) {
  const ns = shadowMap(), sun = sunAt(19.5, 130);
  let last = [];
  for (let f = 0; f * 0.15 <= 400; f++) {
    const m = f * 0.15, e = m * Math.sin(heading * RAD), n = m * Math.cos(heading * RAD), eye = eyeAt(e, n), up = eye.clone().normalize();
    const anchor = ns._anchor ? ns._anchor.clone() : null;
    draws = []; ns.render(eye, sun, [up.x, up.y, up.z]);
    if (f > 0 && anchor && ns._anchor && ns._anchor.distanceTo(anchor) > 1) resets++;
    for (const d of draws) {
      if (d.k === 2) continue;
      const now = { ...d, eye: eye.clone() };
      // (compared with this tile's drawing before, at the spots near the eye; the other tile as it was)
      if (last[0] && last[1]) {
        const before = [...last], after = [...last]; after[d.k] = now;
        const s = shift(before, after, spotsAround(e, n));
        worst2[d.k] = Math.max(worst2[d.k], s[d.k]);
      }
      last[d.k] = now;
    }
  }
}
console.log(`2. walking 400 m three ways (the anchor put again ${resets} times): the lattice under a spot within 60 m moved at most ${cm(worst2[1])} in the fine tile, ${cm(worst2[0])} in the wide one`);
if (!resets) fail.push('the anchor was never put again on a 400 m walk: the test saw nothing');
if (Math.max(...worst2) >= 0.001) fail.push(`walking, the lattice under the spots within 60 m moved ${cm(Math.max(...worst2))} at once (it must keep its place)`);

if (fail.length) { console.log('FAIL:\n  ' + fail.join('\n  ')); process.exit(1); }
console.log(`ok (${src === path.join(root, 'src') ? 'this code' : src})`);
