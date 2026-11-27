// Every rock whose shadow falls in the near shadow map's fine tile is drawn into it, without
// a browser in seconds. The real near shadow map (shadows/nearShadow.js), the real stones
// underfoot (rocks/rocks.js) and the real far rocks' casters (rocks/farRocks.js), wired as
// app.js wires them, are run frame by frame on Haven's ground at its opening place while the
// traveller walks 60 m (toward the Sun, and across it), with a renderer that only writes
// down what each tile is given.
//
// The fine tile is a square 20 m across the Sun's rays round the eye (read alone inside 0.86
// of it, handing over to the wide tile out to 0.98). On level ground it reaches 17.2 m /
// sin(the Sun's height) along the Sun: 51 m with the Sun 20 degrees up. A rock seen from
// there that the tile was not given casts no shadow there; the shadow fades as the tile's
// edge passes and pops back when the rocks are chosen again. (On 5024b61, which chose them by
// straight distance, 30 m for the stones and 45 m for the far rocks: with the Sun 20 degrees
// up, 2.7 of the 17.5 stones whose shadow lay in the tile had none at a drawing, up to 7, and
// 0.8 of 13.5 far rocks, up to 3; even at 55 degrees one now and then.)
//
// A rock is counted when its light-space footprint (its middle, and its lump's largest
// radius times its largest scale) overlaps the part of the tile that is read (0.98 of it),
// as the tile's own camera, written down at the drawing, sees it.
//
//   node scripts/shadow-fine-rocks-test.mjs [--src <a copy of src/ to run instead>] [--metres 60]
// Fails (exit 1) when a rock whose shadow lies in the fine tile is left out of it, at any of
// the Sun's heights tried (20, 35 and 55 degrees), or when the run saw no such rock.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { loadWorld } from './lib/loadWorld.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const src = path.resolve(opt('src', path.join(root, 'src')));
const imp = (f) => import(pathToFileURL(path.join(src, f)).href);
const { NearShadow } = await imp('shadows/nearShadow.js');
const { Rocks, rockGeometry } = await imp('rocks/rocks.js');
const { FarRocks } = await imp('rocks/farRocks.js');
const METRES = +opt('metres', 60), FPS = 30, SPEED = 4.5, RAD = Math.PI / 180;

const { world, hs } = await loadWorld('haven');
const R = world.radius, st = world.scene.start;
const dirOf = (lat, lon) => { const c = Math.cos(lat * RAD); return new THREE.Vector3(c * Math.cos(lon * RAD), c * Math.sin(lon * RAD), Math.sin(lat * RAD)); };
const groundAt = (d) => R + hs.height(d.x, d.y, d.z, 0.6);

// the lump's largest radius (the fracture planes only cut it back): a rock's reach is that times its largest scale
const lumpR = (detail) => { const p = rockGeometry(detail).attributes.position; let m = 0; for (let i = 0; i < p.count; i++) m = Math.max(m, Math.hypot(p.getX(i), p.getY(i), p.getZ(i))); return m; };
const nearLump = lumpR(1), farLump = lumpR(0);

// The far rocks: a field of blocks 1.4 to 3.4 m (the first level's sizes), one in 15 m by 15 m
// (a rocky slope's middling density), on Haven's ground round the place, put into the pool's
// first slots as tiles that have arrived (the worker's rule of where rocks lie is not what is
// tested here: rock-field.mjs is for that).
function farField(far, at) {
  const up = at.clone().normalize(), east = new THREE.Vector3(-up.y, up.x, 0).normalize(), north = new THREE.Vector3().crossVectors(up, east);
  let s = 11; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const rocks = [];
  for (let i = -300; i <= 300; i += 15) for (let j = -300; j <= 300; j += 15) {
    const e = i + rnd() * 15, n = j + rnd() * 15, size = 1.4 + 2 * rnd(), d = up.clone().multiplyScalar(R).addScaledVector(east, e).addScaledVector(north, n).normalize();
    const p = d.multiplyScalar(groundAt(d) + 0.2 * size);
    rocks.push({ p, size, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize()), a: [rnd(), rnd(), rnd(), rnd()] });
  }
  const slots = far.slots.filter((x) => x.li === 0);
  let k = 0;
  for (const slot of slots) {
    const part = rocks.slice(k, k + Math.min(slot.cap, 2000)); k += part.length;
    if (!part.length) break;
    const n = part.length, origin = part[0].p.clone(), off = new Float32Array(n * 4), quat = new Float32Array(n * 4), scale = new Float32Array(n * 3), shape = new Uint8Array(n * 4), misc = new Uint8Array(n * 4).fill(255), tint = new Uint8Array(n * 4).fill(255), sizes = new Float32Array(n);
    const c = new THREE.Vector3();
    part.forEach((r, i) => {
      off[i * 4] = r.p.x - origin.x; off[i * 4 + 1] = r.p.y - origin.y; off[i * 4 + 2] = r.p.z - origin.z; off[i * 4 + 3] = r.size;
      quat[i * 4] = r.q.x; quat[i * 4 + 1] = r.q.y; quat[i * 4 + 2] = r.q.z; quat[i * 4 + 3] = r.q.w;
      scale[i * 3] = r.size * 0.6; scale[i * 3 + 1] = r.size * 0.5; scale[i * 3 + 2] = r.size * 0.4;
      for (let m = 0; m < 4; m++) shape[i * 4 + m] = Math.floor(r.a[m] * 255);
      sizes[i] = r.size; c.add(r.p);
    });
    c.divideScalar(n);
    let rad = 0; for (const r of part) rad = Math.max(rad, r.p.distanceTo(c) + 2 * r.size);
    const b = { state: 1, li: 0, count: n, origin, bound: [c.x - origin.x, c.y - origin.y, c.z - origin.z, rad], used: 1e9, tinted: true, filled: 0, sizes: new Float32Array(n), full: { off, quat, scale, shape, misc, tint, sizes }, slot };
    slot.tile = b;
  }
  return rocks.length;
}

// The renderer: what each draw of the shadow pass was given (the tile, the mesh, how many of its instances, the camera)
let target = null; const draws = [];
const renderer = {
  setRenderTarget(t) { target = t; }, clear() {}, getContext: () => ({ invalidateFramebuffer() {}, invalidateSubFramebuffer() {}, FRAMEBUFFER: 0, COLOR_ATTACHMENT0: 0 }),
  render(mesh, cam) {
    const v = target.viewport, k = v.x === 0 ? 0 : v.y === 0 ? 1 : 2;
    draws.push({ k, mesh, n: mesh.geometry.instanceCount, cam: cam.clone() });
  },
};

const fail = [];
let seenAny = 0;
for (const elev of [20, 35, 55]) for (const across of [false, true]) {
  const ns = new NearShadow(renderer);
  ns.every = 2; ns.alternate = true;                         // Sharp, as app.js sets it
  const rocks = new Rocks(world, hs);
  const terrain = { shared: new Proxy({}, { get: () => ({ value: null }) }), workers: { idle: 0, run: () => null }, wanted: [], coverSerial: 1, ringSerial: 1, tint: null, epoch: 1 };
  const far = new FarRocks(world, terrain);
  ns.addCaster(rocks.mesh, rocks.depthMaterial, null, () => rocks.nearCount);
  for (const c of far.casters) ns.addCaster(c.mesh, far.depthMaterial, c.on, c.fine);
  const d0 = dirOf(st.lat, st.lon), up0 = d0.clone(), east = new THREE.Vector3(-up0.y, up0.x, 0).normalize(), north = new THREE.Vector3().crossVectors(up0, east);
  farField(far, d0.clone().multiplyScalar(groundAt(d0)));
  // the Sun to the south-east, so many degrees up; the walk toward it, or across it
  const az = 130 * RAD, toward = east.clone().multiplyScalar(Math.sin(az)).addScaledVector(north, Math.cos(az));
  const sun = up0.clone().multiplyScalar(Math.sin(elev * RAD)).addScaledVector(toward, Math.cos(elev * RAD)).normalize();
  const walk = across ? new THREE.Vector3().crossVectors(up0, toward) : toward;
  const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1e6);
  const rig = { pos: new THREE.Vector3(), agl: st.eye, latLon: { lat: 0, lon: 0 }, camera, localUp: [0, 0, 1] };
  let fineDraws = 0, needed = { near: 0, far: 0 }, missing = { near: 0, far: 0 }, worst = { near: 0, far: 0 }, given = { near: 0, far: 0 };
  for (let f = 0; f * SPEED / FPS <= METRES; f++) {
    const d = up0.clone().multiplyScalar(R).addScaledVector(walk, f * SPEED / FPS).normalize();
    rig.pos.copy(d).multiplyScalar(groundAt(d) + st.eye);
    rig.latLon.lat = Math.asin(d.z) / RAD; rig.latLon.lon = ((Math.atan2(d.y, d.x) / RAD) + 360) % 360;
    rig.localUp = [d.x, d.y, d.z];
    rocks.update(rig, [sun.x, sun.y, sun.z], 0.00465, terrain.workers);
    far.update(rig, [sun.x, sun.y, sun.z], 0.00465);
    draws.length = 0;
    ns.render(rig.pos, sun, rig.localUp);
    const fine = draws.filter((x) => x.k === 1);
    if (!fine.length) continue;
    fineDraws++;
    const cam = fine[0].cam, half = cam.right, v = new THREE.Vector3();
    cam.updateMatrixWorld(true);
    // every instance each caster draws at all (the wide tile has them), and whether the fine tile was given it
    const sets = [
      { name: 'near', mesh: rocks.mesh, off: rocks.aOffset.array, os: 3, scale: rocks.aScale.array, lump: nearLump },
      { name: 'far', mesh: far.caster, off: far.casterAt.aOff.array, os: 4, scale: far.casterAt.aScale.array, lump: farLump },
    ];
    for (const s of sets) {
      const total = s.mesh.geometry.instanceCount, got = fine.find((x) => x.mesh === s.mesh)?.n ?? 0;
      let miss = 0;
      for (let i = 0; i < total; i++) {
        v.set(s.off[i * s.os], s.off[i * s.os + 1], s.off[i * s.os + 2]).add(s.mesh.position);
        const r = s.lump * Math.max(s.scale[i * 3], s.scale[i * 3 + 1], s.scale[i * 3 + 2]) / half;
        v.project(cam);
        if (Math.abs(v.x) < 0.98 + r && Math.abs(v.y) < 0.98 + r && Math.abs(v.z) <= 1) { needed[s.name]++; if (i >= got) miss++; }
      }
      missing[s.name] += miss; worst[s.name] = Math.max(worst[s.name], miss); given[s.name] += Math.min(got, total);
    }
  }
  const line = (k) => `${k === 'near' ? 'stones underfoot' : 'far rocks'} ${(needed[k] / fineDraws).toFixed(1)} a draw in the tile's reach, left out ${(missing[k] / fineDraws).toFixed(1)} (at worst ${worst[k]}), drawn ${(given[k] / fineDraws).toFixed(1)}`;
  console.log(`Sun ${elev} degrees up, walking ${across ? 'across it   ' : 'toward it   '} (${fineDraws} drawings of the fine tile): ${line('near')} · ${line('far')}`);
  seenAny += needed.near + needed.far;
  if (missing.near + missing.far) fail.push(`Sun ${elev} degrees, walking ${across ? 'across' : 'toward'} it: ${missing.near + missing.far} rock-drawings left out of the fine tile`);
}
if (!seenAny) fail.push('no rock ever lay in the fine tile: the test saw nothing');
if (fail.length) { console.log('FAIL:\n  ' + fail.join('\n  ')); process.exit(1); }
console.log(`ok: every rock whose shadow lies in the fine tile was drawn into it (${src === path.join(root, 'src') ? 'this code' : src})`);
