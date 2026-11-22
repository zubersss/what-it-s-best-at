// The shapes trees have (cover.js, ARCH), each as three meshes: close (within some tens of
// metres), near, and far. A tree is one unit tall and stands on the origin with +Y up;
// the shader sizes, turns and places it (trees.js).
//
// The trees are made the way a painted landscape's are: a trunk and limbs that can be seen,
// and the foliage as flat cards, each showing a spray cut out of the trees' picture
// (life/treeAtlasGen.js: a fir's hanging bough, a pine's burst of needles, a twig of
// leaves). A fir is tiers of boughs hanging from the trunk; a pine a bare bent trunk with
// bursts of needles on upturned branches; an oak a forked trunk with twigs of leaves all
// round every limb's end; an aspen a white pole with twigs of round leaves on thin
// branches. Far off a tree is its own silhouette on two crossed cards (the picture has
// every shape seen whole, drawn from these very meshes) and a rosette lying flat in its
// crown for whoever looks down on it.
//
// Vertex data: position, normal (smooth over the whole crown: a tree is lit as one round
// mass, light on the side to the Sun and dark away from it, whatever way its cards
// face), aLeaf (0 wood, 1 and 2 leaves drawn as plain faces: a palm's fronds; 3 a card of
// foliage; 4 a whole tree's card), aUv (where in the picture; -1 on plain faces), aSway
// (how far the wind can move the vertex: its height and its distance from the trunk).
//
// node scripts/tree-preview.mjs draws them all without a browser;
// node scripts/make-tree-atlas.mjs draws the picture (run it after changing a shape).
import * as THREE from 'three';
import { SPRAYS, sprayRect, impostorRect, IMP_HALF, IMP_TALL } from './treeAtlasLayout.js';

// (the same numbers every time: a tree shape is the same on every device)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const NOUV = [-1, -1];

// A mesh under construction: triangles as nine numbers each, with what they are.
// q: how much is drawn (2 close, 1 near, 0 far).
class Shape {
  constructor(q) { this.pos = []; this.leaf = []; this.out = []; this.uv = []; this.q = q; this.mid = 0.6; }
  // a, b, c: [x, y, z]; leaf: see aLeaf above; cx, cy, cz: the middle of the bunch the face
  // belongs to; ua, ub, uc: where its corners are in the picture
  tri(a, b, c, leaf, cx = 0, cy = null, cz = 0, ua = NOUV, ub = NOUV, uc = NOUV) { this.pos.push(...a, ...b, ...c); this.leaf.push(leaf); this.out.push(cx, cy, cz); this.uv.push(...ua, ...ub, ...uc); }

  // A trunk or a branch: a tapered tube from p0 to p1.
  limb(p0, p1, r0, r1, sides = 5) {
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], l = Math.hypot(...d) || 1, w = [d[0] / l, d[1] / l, d[2] / l];
    const u = Math.abs(w[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let e = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const el = Math.hypot(...e); e = e.map((v) => v / el);
    const f = [w[1] * e[2] - w[2] * e[1], w[2] * e[0] - w[0] * e[2], w[0] * e[1] - w[1] * e[0]];
    const ring = (p, r, k) => { const a = k / sides * 6.2831853, c = Math.cos(a) * r, s = Math.sin(a) * r; return [p[0] + e[0] * c + f[0] * s, p[1] + e[1] * c + f[1] * s, p[2] + e[2] * c + f[2] * s]; };
    for (let k = 0; k < sides; k++) {
      const a0 = ring(p0, r0, k), a1 = ring(p0, r0, k + 1), b0 = ring(p1, r1, k), b1 = ring(p1, r1, k + 1);
      const mx = (p0[0] + p1[0]) / 2, mz = (p0[2] + p1[2]) / 2;
      this.tri(a0, a1, b1, 0, mx, null, mz); this.tri(a0, b1, b0, 0, mx, null, mz);
    }
  }

  // A trunk through several points, tapering from r0 to r1.
  trunk(pts, r0, r1, sides) {
    for (let k = 0; k + 1 < pts.length; k++) { const n = pts.length - 1; this.limb(pts[k], pts[k + 1], r0 + (r1 - r0) * k / n, r0 + (r1 - r0) * (k + 1) / n, sides); }
  }

  // A card: a flat piece `w` by `h` showing the part [u0, v0, u1, v1] of the picture, laid
  // so that the picture's point (au, av) (0..1 across and down the part) is at `p`, its
  // left-to-right along `right` and its bottom-to-top along `up`. c: the middle of the
  // bunch it belongs to (for its light). bend: the far edge moved by this much (a bough
  // that hangs: the card is then two pieces).
  plate(p, right, up, w, h, rect, au, av, c, leaf = 3, bend = null) {
    const [u0, v0, u1, v1] = rect;
    const at = (u, v, k = 0) => [p[0] + right[0] * w * (u - au) + up[0] * h * (av - v) + (bend ? bend[0] * k : 0), p[1] + right[1] * w * (u - au) + up[1] * h * (av - v) + (bend ? bend[1] * k : 0), p[2] + right[2] * w * (u - au) + up[2] * h * (av - v) + (bend ? bend[2] * k : 0)];
    const uv = (u, v) => [u0 + (u1 - u0) * u, v0 + (v1 - v0) * v];
    const cuts = bend ? [0, 0.5, 1] : [0, 1];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1], ka = a * a, kb = b * b;
      const p00 = at(a, 0, ka), p01 = at(a, 1, ka), p10 = at(b, 0, kb), p11 = at(b, 1, kb);
      this.tri(p00, p01, p11, leaf, c[0], c[1], c[2], uv(a, 0), uv(a, 1), uv(b, 1)); this.tri(p00, p11, p10, leaf, c[0], c[1], c[2], uv(a, 0), uv(b, 1), uv(b, 0));
    }
  }

  // A spray growing from `p` along `ax`, `len` long and `wid` across (`ay`: the way the
  // picture's downward goes); its root `off` of the way down the card's root edge.
  card(p, ax, ay, len, wid, cell, c, off = 0.5, bend = null) { this.plate(p, ax, [-ay[0], -ay[1], -ay[2]], len, wid, sprayRect(cell), 0, off, c, 3, bend); }

  // A bunch of sprays at a limb's end: `n` of them growing out of (cx, cy, cz) every way
  // (more up and out than down), each about `r` long, flatter than round by `flat`.
  bunch(cx, cy, cz, r, n, cells, R, flat = 1, low = -0.45) {
    for (let k = 0; k < n; k++) {
      const u = low + (1 - low) * (k + R()) / n, a = k * 2.4 + R() * 1.2, h = Math.sqrt(Math.max(0, 1 - u * u));
      const d = norm([Math.cos(a) * h, u * flat, Math.sin(a) * h]), e = norm(cross(d, norm([R() - 0.5, R() - 0.5, R() - 0.5]))), len = r * (1.15 + 0.5 * R());
      this.card([cx - d[0] * r * 0.12, cy - d[1] * r * 0.12, cz - d[2] * r * 0.12], d, e, len, len * 0.9, cells[k % cells.length], [cx, cy, cz]);
    }
  }

  // The whole tree on two crossed cards (shape `arch`, variant `v`), and a rosette lying in
  // its crown `r` wide at the height `y`.
  whole(arch, v, rose, r, y) {
    const rect = impostorRect(arch, v);
    for (const [rx, rz] of [[1, 0], [0, 1]]) this.plate([0, 0, 0], [rx, 0, rz], [0, 1, 0], 2 * IMP_HALF, IMP_TALL, rect, 0.5, 1, [0, this.mid, 0], 4);
    this.plate([0, y, 0], [1, 0, 0], [0, 0, 1], 2 * r, 2 * r, sprayRect(rose), 0.5, 0.5, [0, y - r, 0], 3);
  }

  build() {
    const n = this.pos.length / 3, pos = new Float32Array(this.pos), nrm = new Float32Array(n * 3), leaf = new Float32Array(n), sway = new Float32Array(n), uv = new Float32Array(this.uv);
    for (let t = 0; t < n / 3; t++) {
      const o = t * 9, ax = pos[o], ay = pos[o + 1], az = pos[o + 2], bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5], cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
      const q = t * 3, isLeaf = this.leaf[t], card = isLeaf > 2.5;
      // a plain face: its own normal, turned to look away from the middle of its mass and
      // leaning toward straight out from it
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      let l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
      let ox = mx - this.out[q], oy = this.out[q + 1] == null ? 0 : my - this.out[q + 1], oz = mz - this.out[q + 2];
      l = Math.hypot(ox, oy, oz) || 1; ox /= l; oy /= l; oz /= l;
      if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const k = isLeaf > 1.5 ? 0.8 : isLeaf ? 0.35 : 0.6; nx += (ox - nx) * k; ny += (oy - ny) * k; nz += (oz - nz) * k;
      l = Math.hypot(nx, ny, nz) || 1;
      for (let v = 0; v < 3; v++) {
        const i = t * 3 + v, px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2], y = Math.max(0, py), r = Math.hypot(px, pz);
        if (card) {
          // a card: lit as part of the whole crown and of its own bunch, corner by corner (the
          // way the card itself faces says nothing: a tree is a round thing)
          const a = norm([px - this.out[q], py - (this.out[q + 1] ?? py), pz - this.out[q + 2]]), b = norm([px, (py - this.mid) * 0.8, pz]), m = norm([a[0] * 0.45 + b[0] * 0.8, a[1] * 0.45 + b[1] * 0.8 + 0.3, a[2] * 0.45 + b[2] * 0.8]);
          nrm[i * 3] = m[0]; nrm[i * 3 + 1] = m[1]; nrm[i * 3 + 2] = m[2];
        } else { nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l; }
        leaf[i] = isLeaf; sway[i] = y * y * (isLeaf ? 1 + 2.5 * r : 0.6) * (isLeaf > 1.5 && isLeaf < 2.5 ? 1.5 : 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 1)); g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1)); g.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
}

// One list per shape, of VARIANTS trees of that shape, each [close mesh, near mesh, far
// mesh]: no two neighbours need be the same tree turned round. Close and near are the
// same tree (the same limbs in the same places: the random numbers of its build are drawn
// the same way at both, those of its foliage apart); far is its picture. (Widths are for
// a tree whose crown-width number is 1; heights are fractions of the tree's height.)
export const VARIANTS = 3;
export function makeTreeGeometries() {
  const out = [];
  // build: (shape, the build's random numbers, the foliage's random numbers, which variant, q) => fills the shape
  // far: [rosette, its radius, its height] for the whole-tree mesh
  const make = (arch, seed, far, build) => {
    const list = [];
    for (let v = 0; v < VARIANTS; v++) list.push([2, 1, 0].map((q) => {
      const s = new Shape(q);
      if (q === 0) { const f = far(v); s.mid = f[3] ?? 0.6; s.whole(arch, v, f[0], f[1], f[2]); } else build(s, rng(seed + v * 7919), rng(seed + 577 + v * 7919 + q * 131), v, q);
      return s.build();
    }));
    out.push(list);
  };
  const TAU = 6.2831853, DOWN = [0, -1, 0];

  // 0 conifer: tiers of boughs hanging from the trunk, shorter to the top, and a spire
  // (spruce, fir, larch, redwood). Each bough is a card standing on edge, out from the
  // trunk, its spray hanging; a few lie flat in every tier for whoever looks from above or
  // below. Variants: fuller, sparser, taller-crowned.
  make(0, 11, (v) => [SPRAYS.roseN, [0.2, 0.17, 0.22][v], 0.3, 0.5], (s, R, L, v, q) => {
    const tiers = [13, 11, 15][v], wide = [1, 0.84, 1.1][v], foot = [0.14, 0.23, 0.1][v], nV = q === 2 ? 7 : 5, nH = q === 2 ? 3 : 1;
    s.mid = 0.5;
    s.trunk([[0, 0, 0], [0.004, 0.5, 0.003], [0, 0.97, 0]], 0.016, 0.003, q === 2 ? 6 : 4);
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1), y = foot + (0.93 - foot) * Math.pow(t, 0.9), rr = (0.24 * Math.pow(1 - t, 0.8) + 0.03) * (0.78 + 0.4 * R()) * wide, turn = R() * TAU, c = [0, y - rr * 0.4, 0];
      for (let j = 0; j < nV; j++) {
        const a = turn + (j + 0.5 * (L() - 0.5)) / nV * TAU, len = rr * (0.85 + 0.35 * L()), ax = norm([Math.cos(a), -0.18 - 0.2 * L(), Math.sin(a)]), d = -ax[1], ay = norm([-d * ax[0], -1 - d * ax[1], -d * ax[2]]);
        s.card([Math.cos(a) * 0.006, y, Math.sin(a) * 0.006], ax, ay, len, len * 0.66, SPRAYS.fir, c, 0.2);
      }
      for (let j = 0; j < nH; j++) {
        const a = turn + 0.6 + (j + 0.4 * (L() - 0.5)) / nH * TAU, len = rr * (0.85 + 0.3 * L());
        s.card([0, y, 0], norm([Math.cos(a), -0.15, Math.sin(a)]), [-Math.sin(a), 0, Math.cos(a)], len, len * 0.9, SPRAYS.firTop, c, 0.5, q === 2 ? [0, -len * 0.3, 0] : null);
      }
    }
    for (let j = 0; j < 2; j++) s.card([0, 0.88, 0], [0, 1, 0], [Math.cos(j * 1.57), 0, Math.sin(j * 1.57)], 0.13, 0.085, SPRAYS.firTop, [0, 0.8, 0]);
  });

  // 1 pine: a long bare trunk with a bend in it, branches that turn up at their ends, a
  // burst of needles on each (ponderosa, Scots pine).
  make(1, 23, (v) => [SPRAYS.roseN, 0.26, [0.72, 0.76, 0.68][v], 0.7], (s, R, L, v, q) => {
    const lean = [0.012, 0.05, -0.04][v], low = [0.46, 0.54, 0.38][v], N = [11, 9, 12][v];
    s.mid = 0.7;
    const tr = (y) => [lean * (y < 0.5 ? y * 1.6 : 0.8 + (y - 0.5) * 0.9) + 0.012 * Math.sin(y * 7), y, 0.01 * Math.sin(y * 5 + 1)];
    s.trunk([tr(0), tr(0.3), tr(0.62), tr(0.93)], 0.016, 0.004, q === 2 ? 6 : 4);
    // a burst: crossed cards standing on the point, the needles upward and outward
    const burst = (c, r, n) => { for (let j = 0; j < n; j++) { const a = L() * TAU + j * (3.1416 / n), tilt = (L() - 0.5) * 0.7; s.plate(c, [Math.cos(a), 0, Math.sin(a)], norm([-Math.sin(a) * tilt, 1, Math.cos(a) * tilt]), r * 2.3, r * 2.3, sprayRect(j % 2 ? SPRAYS.pine2 : SPRAYS.pine), 0.5, 0.56, [c[0], c[1] - r * 0.6, c[2]]); } };
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1), y = low + (0.9 - low) * t, a = k * 2.4 + R(), len = (0.15 + 0.15 * (1 - t)) * (0.7 + 0.5 * R()), up = 0.25 + 0.35 * R(), big = 0.12 * (0.85 + 0.4 * R());
      if (q === 1 && k % 4 === 3) continue;
      const root = tr(y), mid = [root[0] + Math.cos(a) * len * 0.6, y + len * 0.08, root[2] + Math.sin(a) * len * 0.6], end = [root[0] + Math.cos(a) * len, y + len * up, root[2] + Math.sin(a) * len];
      s.limb(root, mid, 0.006, 0.004, 3); s.limb(mid, end, 0.004, 0.002, 3);
      burst(end, big, q === 2 ? 3 : 2);
      burst([mid[0] + (L() - 0.5) * 0.04, mid[1] + 0.02, mid[2] + (L() - 0.5) * 0.04], big * 0.8, q === 2 ? 2 : 1);
    }
    const top = tr(0.93);
    burst([top[0], top[1], top[2]], 0.13, q === 2 ? 3 : 2); burst([top[0] + 0.05, top[1] - 0.05, top[2] + 0.03], 0.1, 2);
  });

  // What the broad crowns share: bunches of sprays [x, y, z, r] at the limbs' ends.
  const bunches = (s, L, list, n, cells, flat = 1, low = -0.45) => { for (const [x, y, z, r] of list) s.bunch(x, y, z, r, s.q === 2 ? n : Math.ceil(n * 0.55), cells, L, flat, low); };

  // 2 broadleaf: a trunk that parts into limbs, each limb into two, twigs of leaves all round
  // every end and in the middle, with sky between them (oak, beech, maple). Variants: round,
  // wide and low, tall.
  make(2, 37, (v) => [SPRAYS.roseL, [0.33, 0.4, 0.28][v], [0.68, 0.6, 0.76][v], 0.68], (s, R, L, v, q) => {
    const wide = [1, 1.2, 0.84][v], tall = [1, 0.9, 1.1][v], split = [0.38, 0.32, 0.44][v], M = [4, 4, 3][v], sides = q === 2 ? 6 : 4;
    s.mid = split + 0.28 * tall;
    s.trunk([[0, 0, 0], [0.012, split * 0.55, 0.004], [0.006, split, 0]], 0.0105, 0.008, sides);
    const list = [], top = [0.006, split, 0];
    for (let i = 0; i < M; i++) {
      // a limb out and up, with a bend in it; two twigs from its end; a bunch on each and one hanging under the bend
      const a = i / M * TAU + R() * 0.7, d = (0.12 + 0.04 * R()) * wide, bend = [Math.cos(a) * d * 0.55, split + 0.07 * tall, Math.sin(a) * d * 0.55], e1 = [Math.cos(a) * d * 1.25, split + (0.2 + 0.05 * R()) * tall, Math.sin(a) * d * 1.25];
      s.limb([top[0], top[1] - 0.03, top[2]], bend, 0.0075, 0.0055, 4); s.limb(bend, e1, 0.0055, 0.003, 4);
      list.push([Math.cos(a) * d * 1.9, split + (0.1 + 0.05 * R()) * tall, Math.sin(a) * d * 1.9, (0.13 + 0.03 * R()) * wide]);
      for (const da of [-0.6, 0.6]) {
        const b = a + da + (R() - 0.5) * 0.3, d2 = (0.1 + 0.05 * R()) * wide, e2 = [e1[0] + Math.cos(b) * d2, e1[1] + (0.09 + 0.08 * R()) * tall, e1[2] + Math.sin(b) * d2];
        s.limb(e1, e2, 0.004, 0.002, 3);
        list.push([e2[0], e2[1] + 0.02, e2[2], (0.135 + 0.04 * R()) * wide]);
      }
    }
    list.push([0.01, split + 0.3 * tall, 0, 0.16 * wide], [0.03, split + 0.52 * tall, -0.02, 0.14 * wide], [-0.05, split + 0.43 * tall, 0.06, 0.14 * wide], [0.07, split + 0.42 * tall, -0.07, 0.13 * wide]);
    s.limb(top, [0.02, split + 0.4 * tall, 0], 0.007, 0.003, 4);
    bunches(s, L, list, 7, [SPRAYS.leaf, SPRAYS.leaf2]);
  });

  // 3 tropical: a tall straight trunk with a flare at its foot, and far above everything a
  // wide crown of big-leaved bunches on spreading limbs (kapok, dipterocarp, gum)
  make(3, 41, (v) => [SPRAYS.roseL, [0.36, 0.4, 0.33][v], [0.84, 0.76, 0.9][v], 0.8], (s, R, L, v, q) => {
    const top = [0.7, 0.62, 0.76][v], wide = [1, 1.15, 0.9][v];
    s.mid = top + 0.1;
    s.trunk([[0, 0, 0], [0, 0.07, 0], [0.006, top * 0.6, 0], [0, top, 0]], 0.028, 0.01, q === 2 ? 6 : 4);
    const list = [[0, top + 0.17, 0, 0.17 * wide]];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + R(), d = (0.19 + 0.09 * R()) * wide, e = [Math.cos(a) * d, top + 0.07 + 0.08 * R(), Math.sin(a) * d];
      s.limb([0, top - 0.03, 0], e, 0.009, 0.004, 4);
      list.push([e[0], e[1] + 0.02, e[2], (0.14 + 0.05 * R()) * wide]);
    }
    bunches(s, L, list, 7, [SPRAYS.big, SPRAYS.leaf], 0.7);
  });

  // 4 umbrella: a forked trunk whose limbs spread wide and level, and one flat layer of
  // feathery sprays over them (acacia, stone pine, koa)
  make(4, 53, (v) => [SPRAYS.roseL, 0.45, [0.84, 0.76, 0.88][v], 0.8], (s, R, L, v, q) => {
    const fork = [0.42, 0.34, 0.5][v], flat = [0.82, 0.74, 0.86][v];
    s.mid = flat - 0.05;
    s.trunk([[0, 0, 0], [0.02, fork * 0.6, 0.01], [0.012, fork, 0]], 0.017, 0.011, q === 2 ? 6 : 4);
    const list = [[0, flat + 0.015, 0, 0.16]];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + R(), d = 0.15 + 0.05 * R(), e1 = [Math.cos(a) * d, fork + (flat - fork) * 0.7, Math.sin(a) * d];
      s.limb([0.012, fork - 0.02, 0], e1, 0.01, 0.006, 4);
      for (const da of [-0.5, 0.5]) {
        const b = a + da + (R() - 0.5) * 0.3, d2 = 0.13 + 0.06 * R(), e2 = [e1[0] + Math.cos(b) * d2, flat - 0.02 + 0.03 * R(), e1[2] + Math.sin(b) * d2];
        s.limb(e1, e2, 0.006, 0.003, 3);
        list.push([e2[0], e2[1] + 0.02, e2[2], 0.15 + 0.05 * R()]);
      }
    }
    bunches(s, L, list, 7, [SPRAYS.fine], 0.22, -0.3);
  });

  // 5 bush: tufts from the ground up on a short stem, wider than tall (juniper, pinyon, sagebrush)
  make(5, 67, (v) => [SPRAYS.roseN, 0.4, 0.45, 0.42], (s, R, L, v, q) => {
    s.mid = 0.42;
    s.trunk([[0, 0, 0], [0.01, 0.16, 0], [0, 0.34, 0.01]], 0.024, 0.012, q === 2 ? 5 : 4);
    const list = [[0, 0.5, 0, 0.2]];
    for (let k = 0; k < [5, 4, 6][v]; k++) {
      const a = k * 1.3 + R(), d = 0.15 + 0.12 * R(), y = 0.26 + 0.2 * R();
      s.limb([0, 0.2, 0], [Math.cos(a) * d * 0.8, y - 0.03, Math.sin(a) * d * 0.8], 0.009, 0.004, 3);
      list.push([Math.cos(a) * d, y, Math.sin(a) * d, 0.17 + 0.07 * R()]);
    }
    list.push([0.04, 0.68 + 0.05 * v, -0.03, 0.16]);
    bunches(s, L, list, 8, [SPRAYS.tuft], 1, -0.2);
  });

  // 6 palm: a thin leaning trunk and a crown of fronds, each a bent blade with leaflets down
  // both sides (plain faces: a frond is its own shape)
  make(6, 71, (v) => [SPRAYS.roseN, 0.36, 0.9, 0.85], (s, R, L, v, q) => {
    const fronds = [0, 10, 13][q] + [0, -1, 2][v], lean = [0.05, -0.08, 0.12][v], top = [lean, 0.9, 0.01];
    s.mid = 0.85;
    s.trunk([[0, 0, 0], [lean * 0.35, 0.45, 0], top], 0.015, 0.009, q === 2 ? 5 : 4);
    for (let k = 0; k < fronds; k++) {
      const a = k / fronds * TAU + L(), c = Math.cos(a), sn = Math.sin(a), len = 0.3 + 0.1 * L(), w = 0.05, rise = 0.04 + 0.06 * L();
      const mid = [top[0] + c * len * 0.5, top[1] + rise, top[2] + sn * len * 0.5], end = [top[0] + c * len, top[1] - 0.06 - 0.12 * L(), top[2] + sn * len];
      const l = [mid[0] - sn * w, mid[1] - 0.02, mid[2] + c * w], r = [mid[0] + sn * w, mid[1] - 0.02, mid[2] - c * w];
      s.tri(top, l, mid, 1, top[0], 0.8, top[2]); s.tri(top, mid, r, 1, top[0], 0.8, top[2]); s.tri(l, end, mid, 1, top[0], 0.8, top[2]); s.tri(mid, end, r, 1, top[0], 0.8, top[2]);
      // (leaflets: pointed leaves hanging off both edges of the frond)
      const nl = [0, 6, 11][q];
      for (let j = 1; j <= nl; j++) for (const sd of [-1, 1]) {
        const t = j / (nl + 1), bx = top[0] + c * len * t, bz = top[2] + sn * len * t, by = top[1] + rise * Math.sin(t * 3.14) - (t > 0.5 ? (t - 0.5) * 0.3 : 0), wl = 0.075 * (1 - 0.5 * t);
        s.tri([bx, by, bz], [bx + c * 0.035, by, bz + sn * 0.035], [bx + c * 0.02 - sn * sd * wl, by - 0.05, bz + sn * 0.02 + c * sd * wl], 2, top[0], 0.8, top[2]);
      }
    }
  });

  // 7 slender: a pale pole, thin branches all up it that reach upward, twigs of round leaves
  // along each with sky between them (aspen, birch)
  make(7, 83, (v) => [SPRAYS.roseL, 0.2, [0.66, 0.7, 0.62][v], 0.66], (s, R, L, v, q) => {
    const N = [14, 12, 16][v], low = [0.36, 0.44, 0.3][v];
    s.mid = 0.66;
    const tr = (y) => [0.012 * Math.sin(y * 4 + v), y, 0.008 * Math.sin(y * 6)];
    s.trunk([tr(0), tr(0.35), tr(0.7), tr(0.97)], 0.012, 0.003, q === 2 ? 6 : 4);
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1), y = low + (0.9 - low) * t, a = k * 2.3 + R() * 0.8, len = (0.07 + 0.16 * Math.sin(3.1416 * Math.pow(t, 0.7))) * (0.65 + 0.6 * R());
      const root = tr(y), dir = norm([Math.cos(a), 0.7, Math.sin(a)]), end = [root[0] + dir[0] * len, y + dir[1] * len, root[2] + dir[2] * len], c = [root[0], y + len * 0.3, root[2]];
      s.limb(root, end, 0.004, 0.0015, 3);
      // (two twigs of leaves along the branch, crossed, and one hanging from its end)
      const e1 = norm(cross(dir, [0, 1, 0])), e2 = cross(dir, e1), L2 = len * 1.5 + 0.05;
      s.card([root[0] + dir[0] * len * 0.2, y + dir[1] * len * 0.2, root[2] + dir[2] * len * 0.2], dir, e1, L2, L2 * 0.85, SPRAYS.aspen, c);
      s.card([root[0] + dir[0] * len * 0.35, y + dir[1] * len * 0.35, root[2] + dir[2] * len * 0.35], dir, e2, L2 * 0.9, L2 * 0.8, SPRAYS.aspen, c);
      if (q === 2) s.card(end, norm([Math.cos(a) * 0.7, -0.5, Math.sin(a) * 0.7]), e1, L2 * 0.7, L2 * 0.6, SPRAYS.aspen, c);
    }
    const top = tr(0.97);
    s.bunch(top[0], top[1] - 0.02, top[2], 0.07, q === 2 ? 5 : 3, [SPRAYS.aspen], L, 1, 0);
  });
  return out;
}
