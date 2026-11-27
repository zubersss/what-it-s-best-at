// The far trees the vertex shader throws out for standing outside the picture (life/farForest.js,
// the ball test before its heavy work) could never have been in it (no browser, seconds):
//   node scripts/far-forest-cull-test.mjs [--break ball|plane]
// The shader's test is replayed here for made-up trees, eyes and lenses: a ball round the
// tree's middle against the picture's four sides and the eye's own plane. Whenever it says
// "out", every corner of the tree's four quads (the two upright pictures and the crown's top
// as wide as they ever get, the shadow at its longest) must lie outside the picture beyond the
// same side. The numbers the ball is made of are read from the shader's own text, so that a
// change there is a change here. --break ball: the ball without the crown top's spread;
// --break plane: the side planes without the ball's width. Each must fail.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { opt, root } from './lib/browser.mjs';

const brk = opt('break', '');
const { TOP_MAX, SHADOW_LONG } = await import(pathToFileURL(path.join(root, 'src/life/farTreeForm.js')).href);
const src = fs.readFileSync(path.join(root, 'src/life/farForest.js'), 'utf8');
const fail = [];
// the shader's ball, as written there
const line = src.split('\n').find((l) => l.includes('float ball ='));
const want = 'float ball = iA.w * (1.0 + max(iB.x * max(gq.x * ${(TOP_MAX * 1.5).toFixed(2)}, 1.5 * gq.z), position.x > 2.5 ? ${SHADOW_LONG.toFixed(1)} * gq.w + gq.z * iB.x : 0.0)) + 0.4 + 0.0015 * d;';
if (!line || line.trim() !== want) fail.push(`the shader's ball is not the one replayed here:\n    ${line?.trim()}`);
for (const t of ['if (fc.w < -ball', '|| abs(fc.x) > fc.w + ball * (abs(projectionMatrix[0][0]) + abs(projectionMatrix[2][0]) + 1.0)', '|| abs(fc.y) > fc.w + ball * (abs(projectionMatrix[1][1]) + abs(projectionMatrix[2][1]) + 1.0)) NONE', 'vec4 fc = projectionMatrix * viewMatrix * vec4(foot + uTileUp * (iA.w * 0.5), 1.0);'])
  if (!src.includes(t)) fail.push(`the shader's test has changed: "${t}" is not in it`);

let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const between = (a, b) => a + (b - a) * rnd();
const v = () => new THREE.Vector3(between(-1, 1), between(-1, 1), between(-1, 1)).normalize();
let outs = 0, trees = 0, worst = -Infinity;
for (let it = 0; it < 60000; it++) {
  // a tile's frame, a tree in it, an eye and a lens
  const up = v(), east = new THREE.Vector3().crossVectors(up, v()).normalize(), north = new THREE.Vector3().crossVectors(up, east);
  const cam = new THREE.PerspectiveCamera(between(20, 100), between(1.2, 2.4), between(0.5, 30), 60000);
  cam.lookAt(v()); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const P = cam.projectionMatrix, VM = cam.matrixWorldInverse, e = P.elements;
  const d = Math.exp(between(Math.log(20), Math.log(6000))), foot = v().multiplyScalar(d);
  const h = between(3, 45), wide = between(0.2, 1.4);                          // iA.w, iB.x
  const g = { x: between(0.1, 0.8), y: between(0, 1), z: between(0.1, 0.8), w: between(0.6, 1.4) };      // uRoseGeo: rosette half width and height, card half width and height (tree heights)
  let ball = h * (1.0 + Math.max(wide * Math.max(g.x * (brk === 'ball' ? 1.0 : TOP_MAX * 1.5), 1.5 * g.z), 0)) + 0.4 + 0.0015 * d;
  const ballShadow = h * (1.0 + Math.max(wide * Math.max(g.x * (brk === 'ball' ? 1.0 : TOP_MAX * 1.5), 1.5 * g.z), SHADOW_LONG * g.w + g.z * wide)) + 0.4 + 0.0015 * d;
  const clip = (p) => new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(VM).applyMatrix4(P);
  const fc = clip(foot.clone().addScaledVector(up, h * 0.5));
  const side = (b) => {
    const kx = brk === 'plane' ? 0 : b * (Math.abs(e[0]) + Math.abs(e[8]) + 1), ky = brk === 'plane' ? 0 : b * (Math.abs(e[5]) + Math.abs(e[9]) + 1);
    if (fc.w < -b) return 'behind';
    if (Math.abs(fc.x) > fc.w + kx) return fc.x > 0 ? 'right' : 'left';
    if (Math.abs(fc.y) > fc.w + ky) return fc.y > 0 ? 'top' : 'bottom';
    return null;
  };
  trees++;
  // every corner the shader could make of this tree, at the widest: a turn of its own
  const turn = between(0, 6.2832), c = Math.cos(turn), s = Math.sin(turn);
  const at = (lx, ly, lz) => foot.clone().addScaledVector(east, (lx * c - lz * s) * h).addScaledVector(up, ly * h).addScaledVector(north, (lx * s + lz * c) * h);
  const corners = [];
  for (const q of [0, 1]) for (const u of [0, 1]) for (const t of [0, 1]) { const a = q * 1.5707963, x = (u - 0.5) * 2 * g.z * wide * 1.5; corners.push(at(Math.cos(a) * x, (1 - t) * g.w, Math.sin(a) * x)); }
  for (const u of [0, 1]) for (const t of [0, 1]) { const w = wide * TOP_MAX; corners.push(at((u - 0.5) * 2 * g.x * w, g.y, (0.5 - t) * 2 * g.x * w)); }
  const sun = v(), sunUp = sun.dot(up), lie = sun.clone().addScaledVector(up, -sunUp), len = lie.length(), shadow = [];
  if (len > 1e-3) {
    const along = lie.clone().multiplyScalar(-1 / len), across = new THREE.Vector3().crossVectors(up, along);
    const wideM = 2 * g.z * wide * h, longM = g.w * h * SHADOW_LONG;
    for (const u of [0, 1]) for (const t of [0, 1]) shadow.push(foot.clone().addScaledVector(across, (u - 0.5) * wideM).addScaledVector(along, (1 - t) * longM).addScaledVector(up, 0.4 + 0.0015 * d));
  }
  for (const [name, b, pts] of [['the tree', ball, corners], ['its shadow', ballShadow, shadow]]) {
    const out = side(b);
    if (!out) continue;
    outs++;
    for (const p of pts) {
      const q = clip(p);
      // (how far inside the side the ball was thrown out by this corner lies: under 0 is outside)
      const inside = out === 'behind' ? q.w : out === 'right' ? q.w - q.x : out === 'left' ? q.w + q.x : out === 'top' ? q.w - q.y : q.w + q.y;
      if (inside > worst) worst = inside;
      if (inside > 1e-6 * Math.max(1, d) && fail.length < 6) fail.push(`${name} thrown out as "${out}" has a corner ${inside.toFixed(3)} inside that side (tree ${h.toFixed(1)} m, ${d.toFixed(0)} m off, crown ${wide.toFixed(2)})`);
    }
  }
}
console.log(`far forest cull: ${trees} made-up trees, ${outs} thrown out (trees and shadows); the corner nearest the picture among them lies ${(-worst).toFixed(3)} outside its side`);
if (outs < trees * 0.2) fail.push(`only ${outs} thrown out: the test tests nothing`);
for (const f of fail) console.log('FAILED: ' + f);
console.log(fail.length ? 'far forest cull: FAILED' : 'far forest cull: every check passed');
process.exit(fail.length ? 1 : 0);
