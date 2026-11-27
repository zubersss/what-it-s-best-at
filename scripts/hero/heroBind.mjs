// The sculpt bound to the game's figure (see scripts/make-hero.mjs, step 6), and the figure
// posed by the game's own code without a browser (for scripts/hero-preview.mjs).
//
// A vertex is carried by one or two of the body's nine rigid parts (the torso with the head,
// upper arms, forearms with the hands, thighs, shins with the feet), by how near it is to
// each part's middle line as the sculpt stands; and, where the cloth is loose (the skirt
// below the hips, the sleeves away from the arms, the hair down the back), shifted by the
// simulated cloth's particles near it (hero/heroPalette.js), by a weight that falls smoothly
// to nothing with distance and toward the garment's edge. Which loose cloth a vertex may
// hang on is its garment (hero/seeds.mjs, garments).
//
// Written a vertex: parts (u8 x 4: first part, second part, the second's share and the
// torso's share in 255ths; the rest is the first's), movers (u16 x 4: particles) and shares
// (u8 x 4: their weights in 255ths; they add up to the vertex's share of cloth). And once:
// rest (each particle's place as the sculpt stands), carried (which parts carry it rigidly:
// three numbers), partsRest (the nine parts' places then, 4 x 4 each).
import * as THREE from 'three';
import { Hero } from '../../src/hero/hero.js';
import { ELBOW, HAND, KNEE, ANKLE, SHOULDER, HIP, SCULPT_ARM, SCULPT_LEG } from '../../src/hero/heroModel.js';
import { LABELS } from './seeds.mjs';
import { adjacency, Heap } from './lib.mjs';
import { PARTS, paletteTexels, fillPalette } from '../../src/hero/heroPalette.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const L = Object.fromEntries(LABELS.map((n, i) => [n, i]));

// The figure standing as the sculpt stands, its cloth hung still.
function standing() {
  const hero = new Hero(); hero.group.visible = true;
  hero.sculptPose();
  const rot = new THREE.Matrix3(), g = new THREE.Vector3(0, -9.8, 0), zero = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  hero.robe.reset(rot);
  for (let i = 0; i < 480; i++) hero.robe.update(1 / 60, rot, g, zero, zero, 0.2, hero.colliders, up, -0.93);
  return hero;
}

// distance from p to the segment a-b, and how far along it (0..1)
function seg(px, py, pz, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz;
  const t = Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / l2));
  return [Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t, pz - a[2] - dz * t), t];
}

// ---- the parts' middle lines as the sculpt stands (the body's frame) ----------------------
const sa = Math.sin(SCULPT_ARM), ca = Math.cos(SCULPT_ARM), sl = Math.sin(SCULPT_LEG), cl = Math.cos(SCULPT_LEG);
const lines = [[[[0, 0.0, 0], [0, 0.80, 0]], 0.20]];
for (const s of [1, -1]) {
  const S = [s * SHOULDER[0], SHOULDER[1], SHOULDER[2]], E = [S[0] + s * sa * ELBOW, S[1] - ca * ELBOW, S[2]], T = [E[0] + s * sa * (HAND + 0.12), E[1] - ca * (HAND + 0.12), E[2]];
  lines.push([[S, E], 0.075], [[E, T], 0.065]);
}
for (const s of [1, -1]) {
  const H = [s * HIP[0], 0, 0], K = [H[0] + s * sl * KNEE, -cl * KNEE, 0], A = [K[0] + s * sl * (ANKLE + 0.08), K[1] - cl * (ANKLE + 0.08), 0.03];
  lines.push([[H, K], 0.10], [[K, A], 0.09]);
}
// which parts carry a place rigidly: [first, second, the second's share]
const carry = (x, y, z, legs, arms) => {
  const s = x >= 0 ? 0 : 1; let b0 = 0, b1 = 0, w0 = 0, w1 = 0;
  for (let b = 0; b < 9; b++) {
    if (b >= 5 && !legs) continue;
    if (b >= 1 && b <= 4 && (!arms || (b <= 2) !== (s === 0))) continue;
    if (b === 0 && legs && y < -0.2) continue;
    const [d] = seg(x, y, z, lines[b][0][0], lines[b][0][1]), r = lines[b][1], w = Math.pow(r / Math.max(d, 0.3 * r), 4);
    if (w > w0) { b1 = b0; w1 = w0; b0 = b; w0 = w; } else if (w > w1) { b1 = b; w1 = w; }
  }
  return [b0, b1, w1 / (w0 + w1)];
};
// a place against an arm (s: 0 the left, 1 the right): how far along it from the shoulder, and how far off its line
const armPlace = (x, y, z, s) => { const S = lines[1 + 2 * s][0][0], adx = (s ? -1 : 1) * sa, along = (x - S[0]) * adx + (y - S[1]) * -ca; return [along, Math.hypot(x - S[0] - adx * along, y - S[1] + ca * along, z - S[2])]; };
// (a sleeve's cloth, and a sleeve's particle, go with the arm it hangs from: by how far along the arm)
const sleeveCarry = (x, y, s) => [1 + 2 * s, 2 + 2 * s, ss(ELBOW - 0.06, ELBOW + 0.06, armPlace(x, y, 0, s)[0])];
// What carries a vertex rigidly, by its garment: the skirt hangs from the torso; a sleeve
// goes with its arm as one piece (toward the shoulder, more and more as the body's own cloth
// does); the body and its own clothes by the nearest middle lines.
function partsOf(x, y, z, lab, g) {
  if (g === 1) return [0, 0, 0];
  if (g === 2 || g === 3) {
    const sc = sleeveCarry(x, y, g - 2), k = ss(0.0, 0.14, armPlace(x, y, z, g - 2)[0]);
    if (k <= 0.5) return [0, sc[0], k];
    let b0 = sc[2] > 0.5 ? sc[1] : sc[0], b1 = sc[2] > 0.5 ? sc[0] : sc[1], w1 = sc[2] > 0.5 ? 1 - sc[2] : sc[2];
    if (k < 1 && w1 < 1 - k) { b1 = 0; w1 = 1 - k; }
    return [b0, b1, w1];
  }
  return carry(x, y, z, (lab === L.inner && y < 0.02) || lab === L.boot || lab === L.skin && y < -0.3, lab !== L.hair);
}

// The sculpt is one fused surface: where a hanging sleeve touches the skirt, or the gown a
// leg, the two are joined by triangles. The seeds' labels run over such joins, so garments
// are first put right by where they are: a sleeve is on its own side, off the middle and
// above the knee; loose silk beside an arm is that arm's sleeve; loose silk and ornament
// below the waist is the skirt (the front panel, the sash's ends, the tassels), and so is
// the lilac lining away from the legs (near a leg it is the trousers).
export function tidy(m, say = () => {}) {
  const n = m.position.length / 3, P = m.position, G = m.garment; let moved = 0;
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], lab = m.label[v], loose = lab === L.silk || lab === L.silver || lab === L.pearl || lab === L.tassel, g0 = G[v];
    if ((G[v] === 2 && !(x > 0.15 && y > -0.5)) || (G[v] === 3 && !(x < -0.15 && y > -0.5))) G[v] = y < 0.1 ? 1 : 0;
    const inner = lab === L.inner, leg = Math.min(seg(x, y, z, lines[5][0][0], lines[5][0][1])[0], seg(x, y, z, lines[6][0][0], lines[6][0][1])[0], seg(x, y, z, lines[7][0][0], lines[7][0][1])[0], seg(x, y, z, lines[8][0][0], lines[8][0][1])[0]);
    if (G[v] === 0 && (loose || inner) && Math.abs(x) > 0.22 && y > -0.5 && y < 0.45 && armPlace(x, y, z, x > 0 ? 0 : 1)[1] > 0.08) G[v] = x > 0 ? 2 : 3;
    if (G[v] === 0 && (loose || (inner && leg > 0.13)) && y < -0.05) G[v] = 1;
    if (G[v] === 1 && inner && leg < 0.10) G[v] = 0;
    if (G[v] === 1 && !loose && lab !== L.inner) G[v] = 0;
    if (G[v] !== g0) moved++;
  }
  say(`tidied: ${moved} vertices to another garment`);
}

// How much of each garment a vertex is: all its own away from the others, and across a
// join with another garment a blend, some SPREAD wide over the surface (its garment's mark
// smoothed along the mesh, so it is as smooth where three garments meet as where two do).
const SPREAD = 0.06;
function membership(m) {
  const n = m.position.length / 3, { start, items } = adjacency(n, m.index), P = m.position, G = m.garment;
  let len = 0, cnt = 0; for (let v = 0; v < n; v += 7) for (let e = start[v]; e < start[v + 1]; e++) { const w = items[e]; len += Math.hypot(P[w * 3] - P[v * 3], P[w * 3 + 1] - P[v * 3 + 1], P[w * 3 + 2] - P[v * 3 + 2]); cnt++; }
  const turns = Math.ceil(2 * (SPREAD / (len / cnt)) ** 2);
  let a = new Float32Array(n * 5), b = new Float32Array(n * 5);
  for (let v = 0; v < n; v++) a[v * 5 + G[v]] = 1;
  for (let t = 0; t < turns; t++) {
    for (let v = 0; v < n; v++) {
      const k = 1 / (1 + start[v + 1] - start[v]);
      for (let g = 0; g < 5; g++) { let x = a[v * 5 + g]; for (let e = start[v]; e < start[v + 1]; e++) x += a[items[e] * 5 + g]; b[v * 5 + g] = x * k; }
    }
    [a, b] = [b, a];
  }
  return a;
}

export async function bind(m, say = () => {}) {
  tidy(m, say);
  const hero = standing(), robe = hero.robe, pos = robe.pos, np = robe.count, n = m.position.length / 3, P = m.position;
  // ---- the cloth's particles by garment, and how far each reaches --------------------------
  const kind = new Uint8Array(np), reach = [0, 0.17, 0.26, 0.26, 0.15];
  robe.patches.forEach((p) => { const k = p.name.startsWith('skirt') ? 1 : p.name === 'sleeveL' ? 2 : p.name === 'sleeveR' ? 3 : 4; for (let i = 0; i < p.nx * p.ny; i++) kind[p.base + i] = k; });
  // ---- a garment's rule at a place: the nine parts' shares, and the cloth's particles ------
  // (the particles: the four of the garment that pull hardest, less the fifth's pull, so one
  //  coming into the four comes in from nothing; the reach is the garment's, or, where the
  //  sculpt's cloth hangs further than the simulated sheet does, far enough to meet it)
  const top = new Float64Array(5), topI = new Int32Array(5);
  const rule = (g, x, y, z, lab, w9, cloth, f) => {
    const [b0, b1, w1] = partsOf(x, y, z, lab, g); w9[b0] += f * (1 - w1); w9[b1] += f * w1;
    let wc = 0;
    if (g === 4) wc = ss(0.72, 0.58, y) * ss(0.05, -0.03, z);        // the hair down the back,
    else if (g === 1) wc = ss(0.12, -0.04, y);                       // the skirt below the hips,
    else if (g) { const [along, rad] = armPlace(x, y, z, g - 2); wc = ss(0.06, 0.13, rad) * ss(0.02, 0.12, along); }   // a sleeve away from its arm
    if (wc * f < 0.004) return;
    let near = 1e9; for (let i = 0; i < np; i++) if (kind[i] === g) near = Math.min(near, (pos[i * 3] - x) ** 2 + (pos[i * 3 + 1] - y) ** 2 + (pos[i * 3 + 2] - z) ** 2);
    const r2 = Math.max(reach[g] * reach[g], 2.6 * near); top.fill(0); topI.fill(-1);
    for (let i = 0; i < np; i++) {
      if (kind[i] !== g) continue;
      const d2 = (pos[i * 3] - x) ** 2 + (pos[i * 3 + 1] - y) ** 2 + (pos[i * 3 + 2] - z) ** 2; if (d2 >= r2) continue;
      const w = (1 - d2 / r2) ** 2; let k = 4; if (w <= top[4]) continue;
      while (k > 0 && top[k - 1] < w) { top[k] = top[k - 1]; topI[k] = topI[k - 1]; k--; }
      top[k] = w; topI[k] = i;
    }
    let sum = 0; for (let k = 0; k < 4; k++) { top[k] = Math.max(0, top[k] - top[4]); sum += top[k]; }
    if (sum > 1e-6) for (let k = 0; k < 4; k++) if (top[k] > 0) cloth.push([topI[k], top[k] * wc * f / sum]);
  };
  // ---- every vertex: its garment's rule, and near a join with another garment a blend of
  //      both rules: so both sides of a join are moved alike, and what is drawn between a
  //      sleeve and the skirt it touches stretches as a fold of cloth would instead of tearing
  const share = membership(m);
  const parts = new Uint8Array(n * 4), movers = new Uint16Array(n * 4), shares = new Uint8Array(n * 4), w9 = new Float64Array(9);
  let bound = 0;
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], lab = m.label[v], cloth = [];
    w9.fill(0); for (let g = 0; g < 5; g++) if (share[v * 5 + g] > 0.01) rule(g, x, y, z, lab, w9, cloth, share[v * 5 + g]);
    // parts: the two that carry most beside the torso, and the torso's share
    let b0 = 0, b1 = 0; for (let b = 1; b < 9; b++) { if (w9[b] <= 0) continue; if (!b0 || w9[b] > w9[b0]) { b1 = b0; b0 = b; } else if (!b1 || w9[b] > w9[b1]) b1 = b; }
    const sum = (b0 ? w9[b0] : 0) + (b1 ? w9[b1] : 0) + w9[0];
    if (!b0) { parts[v * 4] = 0; parts[v * 4 + 1] = 0; }
    else { parts[v * 4] = b0; parts[v * 4 + 1] = b1 || b0; parts[v * 4 + 2] = b1 ? Math.round(255 * w9[b1] / sum) : 0; parts[v * 4 + 3] = Math.min(255 - parts[v * 4 + 2], Math.round(255 * w9[0] / sum)); }
    // cloth: the four particles that count most
    if (cloth.length) {
      let total = 0; for (const c of cloth) total += c[1];
      for (let i = 0; i < cloth.length; i++) for (let j = cloth.length - 1; j > i; j--) if (cloth[j][0] === cloth[i][0]) { cloth[i][1] += cloth[j][1]; cloth.splice(j, 1); }
      cloth.sort((p, q) => q[1] - p[1]); cloth.length = Math.min(4, cloth.length);
      let kept = 0; for (const c of cloth) kept += c[1];
      let left = Math.round(255 * Math.min(1, total));
      if (left > 0) bound++;
      cloth.forEach((c, k) => { const w = k === cloth.length - 1 ? left : Math.min(left, Math.round(255 * Math.min(1, total) * c[1] / kept)); movers[v * 4 + k] = c[0]; shares[v * 4 + k] = w; left -= w; });
    }
  }
  say(`bound: ${n} vertices, ${bound} of them to the cloth`);
  // (the cloth as the sculpt stands, what carries each particle, and the parts)
  const rest = Float32Array.from(pos), carried = new Float32Array(np * 3);
  for (let i = 0; i < np; i++) carried.set(kind[i] === 2 || kind[i] === 3 ? sleeveCarry(pos[i * 3], pos[i * 3 + 1], kind[i] - 2) : [0, 0, 0], i * 3);
  const partsRest = new Float32Array(PARTS * 16); hero.parts.forEach((p, i) => partsRest.set(p.matrix.elements, i * 16));
  return { parts, movers, shares, shared: { rest, carried, partsRest } };
}

// ---- the figure posed (what the vertex shader of hero/heroSculpt.js does, in JavaScript) ----
export function deform(m, M) {
  const n = m.position.length / 3, P = m.position, N = m.normal, outP = new Float32Array(n * 3), outN = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2], a = m.parts[v * 4] * 12, b = m.parts[v * 4 + 1] * 12, w = m.parts[v * 4 + 2] / 255, t = m.parts[v * 4 + 3] / 255, u = 1 - w - t;
    const q = [0, 0, 0], r = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const o = k * 4;
      q[k] = (M[a + o] * x + M[a + o + 1] * y + M[a + o + 2] * z + M[a + o + 3]) * u + (M[b + o] * x + M[b + o + 1] * y + M[b + o + 2] * z + M[b + o + 3]) * w + (M[o] * x + M[o + 1] * y + M[o + 2] * z + M[o + 3]) * t;
      r[k] = (M[a + o] * nx + M[a + o + 1] * ny + M[a + o + 2] * nz) * u + (M[b + o] * nx + M[b + o + 1] * ny + M[b + o + 2] * nz) * w + (M[o] * nx + M[o + 1] * ny + M[o + 2] * nz) * t;
    }
    for (let k = 0; k < 4; k++) { const sh = m.shares[v * 4 + k] / 255; if (!sh) continue; const o = (PARTS * 3 + m.movers[v * 4 + k]) * 4; q[0] += sh * M[o]; q[1] += sh * M[o + 1]; q[2] += sh * M[o + 2]; }
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    outP.set(q, v * 3); outN.set([r[0] / rl, r[1] / rl, r[2] / rl], v * 3);
  }
  return { position: outP, normal: outN };
}

// The palette of a figure as it is posed now (in its group's frame). shared: the file's
// rest, carried and partsRest.
export function paletteOf(hero, shared) {
  hero.body.updateMatrix();
  const inv = new THREE.Matrix4(), parts = hero.parts.map((p, i) => { p.updateMatrix(); inv.fromArray(shared.partsRest, i * 16).invert(); return new THREE.Matrix4().multiplyMatrices(hero.body.matrix, p.matrix).multiply(inv).elements; });
  return fillPalette(new Float32Array(paletteTexels(hero.robe.count) * 4), parts, hero.robe.pos, shared.rest, shared.carried);
}

// The sculpt as the game would draw it in a pose, after `seconds` of that pose: 'stand' (as
// the sculpt stands), 'hover', 'fly', 'fast', 'walk', 'run'. In the figure's group frame.
export async function posed(m, shared, pose, seconds = 3) {
  if (pose === 'stand') return deform(m, paletteOf(standing(), shared));
  const hero = new Hero(); hero.group.visible = true;
  const rig = { localUp: [0, 1, 0], forward: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0), pitch: 0, agl: 50, heroRel: new THREE.Vector3(0, 0, 4), velocity: new THREE.Vector3(0, 0, 0), throttle: 0, boost: false, onFoot: false, airborne: false, yawRate: 0, vUp: 0, clock: 0, facing: new THREE.Vector3(0, 0, 1) };
  if (pose === 'fly') { rig.velocity.set(0, 0, 25); rig.throttle = 1; }
  if (pose === 'fast') { rig.velocity.set(0, 0, 80); rig.throttle = 1; rig.boost = true; }
  if (pose === 'walk') { rig.onFoot = true; rig.velocity.set(0, 0, 1.5); rig.agl = 0; }
  if (pose === 'run') { rig.onFoot = true; rig.velocity.set(0, 0, 4.5); rig.agl = 0; }
  const env = { gravity: 9.8, air: 1, groundClearance: null };
  for (let i = 0; i < Math.round(seconds * 60); i++) { rig.clock += 1 / 60; hero.update(1 / 60, rig, env); }
  return deform(m, paletteOf(hero, shared));
}
