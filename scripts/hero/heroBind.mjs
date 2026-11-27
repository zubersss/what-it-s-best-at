// The sculpt bound to the game's figure (see scripts/make-hero.mjs, step 6), and the figure
// posed by the game's own code without a browser (for scripts/hero-preview.mjs).
//
// A vertex is carried by one or two of the body's nine rigid parts (the torso with the head,
// upper arms, forearms with the hands, thighs, shins with the feet) and the torso, by how
// near it is to each part's middle line as the sculpt stands; and, where the cloth is loose
// (the skirt below the hips, the sleeves away from the arms, the hair down the back), it
// goes by its share of cloth with the simulated cloth instead (hero/heroPalette.js): with
// the three particles round the place on its garment's sheets nearest it. Which loose cloth
// a vertex may hang on is its garment (hero/seeds.mjs, garments), blended across the joins
// between garments.
//
// Written a vertex: parts (u8 x 4: first part, second part, the second's share and the
// torso's share in 255ths; the rest is the first's), movers (u16 x 4: particles) and shares
// (u8 x 4: their weights in 255ths; they add up to the vertex's share of cloth). And once:
// rest (each particle's place as the sculpt stands), carried (which parts carry it rigidly:
// three numbers), grid and frame (its neighbours along its sheet and the sheet's axes
// there), near and nearW (the neighbours its turn and move are evened out over), partsRest
// (the nine parts' places then, 4 x 4 each).
import * as THREE from 'three';
import { Hero } from '../../src/hero/hero.js';
import { ELBOW, HAND, KNEE, ANKLE, SHOULDER, HIP, SCULPT_ARM, SCULPT_LEG } from '../../src/hero/heroModel.js';
import { LABELS } from './seeds.mjs';
import { adjacency, Heap } from './lib.mjs';
import { PARTS, NEAR, paletteTexels, particleFrames, fillPalette } from '../../src/hero/heroPalette.js';

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
  const kind = new Uint8Array(np), SHARE = 255;
  robe.patches.forEach((p) => { const k = p.name.startsWith('skirt') ? 1 : p.name === 'sleeveL' ? 2 : p.name === 'sleeveR' ? 3 : 4; for (let i = 0; i < p.nx * p.ny; i++) kind[p.base + i] = k; });
  // ---- the simulated sheets as triangles (two a cell of each patch's grid), by garment ----
  const sheet = [[], [], [], [], []];
  robe.patches.forEach((p) => {
    const g = kind[p.base], id = (ix, iy) => p.base + iy * p.nx + ix;
    for (let iy = 0; iy + 1 < p.ny; iy++) for (let ix = 0; ix + 1 < p.nx; ix++) sheet[g].push([id(ix, iy), id(ix + 1, iy), id(ix + 1, iy + 1)], [id(ix, iy), id(ix + 1, iy + 1), id(ix, iy + 1)]);
  });
  // the place on triangle a, b, c (particles) nearest a point: its three weights and how far (squared)
  const bary = [0, 0, 0];
  const nearest = (x, y, z, a, b, c) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2], abx = pos[b * 3] - ax, aby = pos[b * 3 + 1] - ay, abz = pos[b * 3 + 2] - az, acx = pos[c * 3] - ax, acy = pos[c * 3 + 1] - ay, acz = pos[c * 3 + 2] - az;
    const apx = x - ax, apy = y - ay, apz = z - az, d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    let v, w;
    if (d1 <= 0 && d2 <= 0) { v = 0; w = 0; } else {
      const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
      if (d3 >= 0 && d4 <= d3) { v = 1; w = 0; } else {
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { v = d1 / (d1 - d3); w = 0; } else {
          const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
          if (d6 >= 0 && d5 <= d6) { v = 0; w = 1; } else {
            const vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) { v = 0; w = d2 / (d2 - d6); } else {
              const va = d3 * d6 - d5 * d4;
              if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { w = (d4 - d3) / (d4 - d3 + d5 - d6); v = 1 - w; } else { const dn = 1 / (va + vb + vc); v = vb * dn; w = vc * dn; }
            }
          }
        }
      }
    }
    bary[0] = 1 - v - w; bary[1] = v; bary[2] = w;
    return (apx - abx * v - acx * w) ** 2 + (apy - aby * v - acy * w) ** 2 + (apz - abz * v - acz * w) ** 2;
  };
  // ---- a garment's rule at a place: the nine parts' shares, and the cloth's particles: the
  //      three round the place on the garment's simulated sheets nearest it, by how near each
  //      is to that place. (So the shift is the sheet's own there, running smoothly over it:
  //      the particles "that pull hardest" by a rounded weight gave a shift that changed its
  //      slope every few centimetres, and the gown was crinkled like foil in every pose: the
  //      fold between neighbouring faces changed by 17 degrees on average) --------------------
  const rule = (g, x, y, z, lab, w9, cloth, f) => {
    const [b0, b1, w1] = partsOf(x, y, z, lab, g); w9[b0] += f * (1 - w1); w9[b1] += f * w1;
    let wc = 0;
    if (g === 4) wc = ss(0.72, 0.58, y) * ss(0.05, -0.03, z);        // the hair down the back,
    else if (g === 1) wc = ss(0.12, -0.04, y);                       // the skirt below the hips,
    else if (g) { const [along, rad] = armPlace(x, y, z, g - 2); wc = ss(0.06, 0.13, rad) * ss(0.02, 0.12, along); }   // a sleeve away from its arm
    if (wc * f < 0.004) return;
    let best = 1e9, bt = null, w0 = 0, w1b = 0, w2 = 0;
    for (const t of sheet[g]) { const d = nearest(x, y, z, t[0], t[1], t[2]); if (d < best) { best = d; bt = t; w0 = bary[0]; w1b = bary[1]; w2 = bary[2]; } }
    if (!bt) return;
    const order = [[w0, bt[0]], [w1b, bt[1]], [w2, bt[2]]].sort((p, q) => q[0] - p[0]);
    cloth.push({ share: wc * f, w: order.map((o) => o[0]), i: order.map((o) => o[1]) });
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
    // cloth: four particles in all. One garment's rule has its three; where rules are blended
    // each keeps its whole share and they divide the four between them (two and two; two, one
    // and one), each keeping the nearest of its three: were the ones that count most taken
    // from all together, the choice would tip from one garment's particles to the other's
    // between two neighbours, and tear there.
    if (cloth.length) {
      cloth.sort((p, q) => q.share - p.share); cloth.length = Math.min(4, cloth.length);
      const slots = cloth.length === 1 ? [3] : cloth.length === 2 ? [2, 2] : cloth.length === 3 ? [2, 1, 1] : [1, 1, 1, 1];
      let k = 0, total = 0; const wts = [0, 0, 0, 0];
      cloth.forEach((c, r) => {
        const cnt = slots[r]; let sum = 0;
        for (let q = 0; q < cnt; q++) sum += c.w[q];
        for (let q = 0; q < cnt; q++, k++) { movers[v * 4 + k] = c.i[q]; wts[k] = sum > 1e-9 ? c.share * c.w[q] / sum : q === 0 ? c.share : 0; total += wts[k]; }
      });
      let left = Math.round(SHARE * Math.min(1, total)); if (left > 0) bound++;
      const most = wts.indexOf(Math.max(...wts));
      for (let q = 0; q < 4; q++) { if (q === most) continue; const w = Math.min(left, Math.round(SHARE * wts[q])); shares[v * 4 + q] = w; left -= w; }
      shares[v * 4 + most] = left;
    }
  }
  say(`bound: ${n} vertices, ${bound} of them to the cloth`);
  // (the cloth as the sculpt stands, what carries each particle, and the parts)
  const rest = Float32Array.from(pos), carried = new Float32Array(np * 3);
  for (let i = 0; i < np; i++) carried.set(kind[i] === 2 || kind[i] === 3 ? sleeveCarry(pos[i * 3], pos[i * 3 + 1], kind[i] - 2) : [0, 0, 0], i * 3);
  // (each particle's neighbours of its own garment as the sculpt stands, over which its shift is evened out: hero/heroPalette.js)
  const near = new Uint16Array(np * NEAR), nearW = new Float32Array(np * NEAR), EVEN = [0, 0.34, 0.24, 0.24, 0.16];
  for (let i = 0; i < np; i++) {
    const r2 = EVEN[kind[i]] ** 2, list = [];
    for (let j = 0; j < np; j++) { if (kind[j] !== kind[i]) continue; const d2 = (pos[i * 3] - pos[j * 3]) ** 2 + (pos[i * 3 + 1] - pos[j * 3 + 1]) ** 2 + (pos[i * 3 + 2] - pos[j * 3 + 2]) ** 2; if (d2 < r2) list.push([j, (1 - d2 / r2) ** 2]); }
    list.sort((p, q) => q[1] - p[1]); list.length = Math.min(NEAR, list.length);
    let sum = 0; for (const c of list) sum += c[1];
    for (let k = 0; k < NEAR; k++) { near[i * NEAR + k] = k < list.length ? list[k][0] : i; nearW[i * NEAR + k] = k < list.length ? list[k][1] / sum : 0; }
  }
  // (each particle's neighbours along its sheet's two grid lines, and the sheet's axes there as the sculpt stands)
  const grid = new Uint16Array(np * 4);
  robe.patches.forEach((p) => { const id = (ix, iy) => p.base + iy * p.nx + ix; for (let iy = 0; iy < p.ny; iy++) for (let ix = 0; ix < p.nx; ix++) grid.set([id(Math.max(ix - 1, 0), iy), id(Math.min(ix + 1, p.nx - 1), iy), id(ix, Math.max(iy - 1, 0)), id(ix, Math.min(iy + 1, p.ny - 1))], id(ix, iy) * 4); });
  const frame = particleFrames(pos, grid, new Float32Array(np * 9));
  const partsRest = new Float32Array(PARTS * 16); hero.parts.forEach((p, i) => partsRest.set(p.matrix.elements, i * 16));
  return { parts, movers, shares, shared: { rest, carried, grid, frame, near, nearW, partsRest } };
}

// ---- the figure posed (what the vertex shader of hero/heroSculpt.js does, in JavaScript) ----
export function deform(m, M) {
  const n = m.position.length / 3, P = m.position, N = m.normal, outP = new Float32Array(n * 3), outN = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2], a = m.parts[v * 4] * 12, b = m.parts[v * 4 + 1] * 12, w = m.parts[v * 4 + 2] / 255, t = m.parts[v * 4 + 3] / 255, u = 1 - w - t;
    const q = [0, 0, 0], r = [0, 0, 0];
    let cloth = 0; for (let k = 0; k < 4; k++) cloth += m.shares[v * 4 + k] / 255;
    for (let k = 0; k < 3; k++) {
      const o = k * 4;
      q[k] = (1 - cloth) * ((M[a + o] * x + M[a + o + 1] * y + M[a + o + 2] * z + M[a + o + 3]) * u + (M[b + o] * x + M[b + o + 1] * y + M[b + o + 2] * z + M[b + o + 3]) * w + (M[o] * x + M[o + 1] * y + M[o + 2] * z + M[o + 3]) * t);
      r[k] = (1 - cloth) * ((M[a + o] * nx + M[a + o + 1] * ny + M[a + o + 2] * nz) * u + (M[b + o] * nx + M[b + o + 1] * ny + M[b + o + 2] * nz) * w + (M[o] * nx + M[o + 1] * ny + M[o + 2] * nz) * t);
    }
    for (let j = 0; j < 4; j++) {
      const sh = m.shares[v * 4 + j] / 255; if (!sh) continue; const c = (PARTS + m.movers[v * 4 + j]) * 12;
      for (let k = 0; k < 3; k++) { const o = c + k * 4; q[k] += sh * (M[o] * x + M[o + 1] * y + M[o + 2] * z + M[o + 3]); r[k] += sh * (M[o] * nx + M[o + 1] * ny + M[o + 2] * nz); }
    }
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
  return fillPalette(new Float32Array(paletteTexels(hero.robe.count) * 4), parts, hero.robe.pos, shared);
}

// The sculpt as the game would draw it in a pose, after `seconds` of that pose: 'stand' (as
// the sculpt stands), 'hover', 'fly', 'fast', 'walk', 'run', 'super', 'land', 'launch'. In the figure's group frame.
export async function posed(m, shared, pose, seconds = 3) {
  if (pose === 'stand') return deform(m, paletteOf(standing(), shared));
  const hero = new Hero(); hero.group.visible = true;
  const rig = { localUp: [0, 1, 0], forward: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0), pitch: 0, agl: 50, heroRel: new THREE.Vector3(0, 0, 4), velocity: new THREE.Vector3(0, 0, 0), throttle: 0, boost: false, onFoot: false, airborne: false, yawRate: 0, vUp: 0, clock: 0, facing: new THREE.Vector3(0, 0, 1) };
  if (pose === 'fly') { rig.velocity.set(0, 0, 25); rig.throttle = 1; }
  if (pose === 'fast') { rig.velocity.set(0, 0, 80); rig.throttle = 1; rig.boost = true; }
  if (pose === 'walk') { rig.onFoot = true; rig.velocity.set(0, 0, 1.5); rig.agl = 0; }
  if (pose === 'run') { rig.onFoot = true; rig.velocity.set(0, 0, 4.5); rig.agl = 0; }
  // (the app's own on-foot poses: FOOT_POSES in app.js)
  if (pose === 'super') { rig.onFoot = true; rig.velocity.set(0, 0, 45); rig.throttle = 1; rig.agl = 0; }
  if (pose === 'land') { rig.onFoot = true; rig.velocity.set(0.6, 0, 0); rig.agl = 0; rig.landedAt = -0.35; rig.landSpeed = 14; }
  if (pose === 'launch') { rig.onFoot = true; rig.airborne = true; rig.vUp = 2.5; rig.upHeld = 0.3; rig.agl = 1.6; }
  const tick = pose === 'land' ? 0 : 1 / 60;       // (the kneel is held a third of a second after the landing, as the app's picture of it is)
  const env = { gravity: 9.8, air: 1, groundClearance: null };
  for (let i = 0; i < Math.round(seconds * 60); i++) { rig.clock += tick; hero.update(1 / 60, rig, env); }
  return deform(m, paletteOf(hero, shared));
}
