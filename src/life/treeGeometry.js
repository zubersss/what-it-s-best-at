// The shapes trees have (cover.js, ARCH), each as three meshes: close (the few trees one
// stands among), near, and far. A tree is one unit tall and stands on the origin with +Y
// up; the shader sizes, turns and places it (trees.js).
//
// A tree is made the way a painted landscape's is: a skeleton that can be seen and
// foliage finely cut. Close by the skeleton is whole: a trunk with a flare at its root,
// limbs, branches and the twigs the foliage sits on, each a tapering tube; and the
// foliage is small cards (a metre or so), each showing one spray cut out of the trees'
// picture (life/treeAtlasGen.js: a fir's frond, the twigs hanging under a bough, a pine's
// branch end with its tufts, a twig of leaves or of blossom), in bunches at the twigs
// with sky between. Inside every bunch is a dark heart (crossed cards of a rosette, and
// the sprays nearest the middle drawn dark): cards alone are a lace one sees through. At the middle distance the same skeleton carries a few large cards (a whole
// bough, a whole bunch); far off a tree is its own silhouette on two crossed cards (the
// picture has every shape seen whole, drawn from these very meshes) and a rosette lying
// flat in its crown for whoever looks down on it.
//
// Vertex data: position, normal (smooth over the whole crown: a tree is lit as one round
// mass, light on the side to the Sun and dark away from it, whatever way its cards
// face; a tube's is its own round), aLeaf (0 wood, 0.25 a twig's wood, 1 and 2 leaves drawn as plain faces: a
// palm's fronds; 1.25 the dark inside of a fir's tier, a plain face; 3 a card of foliage; 3.25 a
// card of the dark heart of a bunch; 4 a whole tree's card), aUv (where in the picture; -1 on
// plain faces; on a tube (-2 - how far round it, in furrows of its bark; how far along it,
// in tree heights)), aSway (x: how far the wind can move the vertex, by its height and its
// distance from the trunk, wood and leaf alike so that a spray stays on its twig; y: how
// much it flutters: nothing where a spray is held, most at its tip).
//
// In a mesh the wood and the firs' dark skirts (plain faces, nothing cut out) come first,
// the cards after: drawn in that order the cards hidden behind them are never shaded.
//
// node scripts/tree-preview.mjs draws them all without a browser;
// node scripts/make-tree-atlas.mjs draws the picture (run it after changing a shape).
import * as THREE from 'three';
import { SPRAYS, sprayRect, impostorRect, IMP_HALF, IMP_TALL } from './treeAtlasLayout.js';

// (the same numbers every time: a tree shape is the same on every device)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const NOUV = [-1, -1], TAU = 6.2831853;
// How many furrows a tube's bark has round it, by its radius (tree heights): one every 9 cm
// on a tree 20 m tall.
const furrows = (r) => Math.max(3, Math.round(TAU * r * 20 / 0.09));

// A mesh under construction: triangles with what they are. q: how much is drawn (2 close, 1 near, 0 far).
class Shape {
  constructor(q) { this.tris = []; this.q = q; this.mid = 0.6; }
  // a, b, c: [x, y, z]; leaf: see aLeaf above; cx, cy, cz: the middle of the bunch the face
  // belongs to; ua, ub, uc: where its corners are in the picture; n: its corners' normals
  // (left out: worked out in build); fl: how much each corner flutters
  tri(a, b, c, leaf, cx = 0, cy = null, cz = 0, ua = NOUV, ub = NOUV, uc = NOUV, n = null, fl = null) { this.tris.push({ p: [a, b, c], leaf, out: [cx, cy, cz], uv: [ua, ub, uc], n, fl }); }

  // A tube through several points with a radius at each: a trunk, a limb, a twig. Round
  // (its normals are), with its bark's coordinates. lobes: how much the first ring bulges
  // in and out (a trunk's flare where the roots begin).
  tube(pts, radii, sides = 5, lobes = 0) {
    const n = pts.length, fur = furrows(radii[Math.min(1, n - 1)] * (lobes ? 0.8 : 1)), rings = [];
    const w0 = norm([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]]), ref = Math.abs(w0[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const kind = radii[0] < 0.0045 ? 0.25 : 0;          // (aLeaf 0.25: a twig, grey-brown and darker than the limb it grows from)
    let along = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], w = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), e = norm(cross(ref, w)), f = cross(w, e);
      if (i) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      const ring = [];
      for (let k = 0; k <= sides; k++) {
        const t = (k % sides) / sides * TAU, d = [e[0] * Math.cos(t) + f[0] * Math.sin(t), e[1] * Math.cos(t) + f[1] * Math.sin(t), e[2] * Math.cos(t) + f[2] * Math.sin(t)];
        const r = radii[i] * (i === 0 && lobes ? 1 + lobes * Math.sin(t * 3 + 1) + lobes * 0.5 * Math.sin(t * 5) : 1);
        ring.push({ p: add(pts[i], d, r), n: d, uv: [-2 - k / sides * fur, along] });
      }
      rings.push(ring);
    }
    for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) {
      const a0 = rings[i][k], a1 = rings[i][k + 1], b0 = rings[i + 1][k], b1 = rings[i + 1][k + 1];
      this.tri(a0.p, a1.p, b1.p, kind, 0, null, 0, a0.uv, a1.uv, b1.uv, [a0.n, a1.n, b1.n], [0, 0, 0]);
      this.tri(a0.p, b1.p, b0.p, kind, 0, null, 0, a0.uv, b1.uv, b0.uv, [a0.n, b1.n, b0.n], [0, 0, 0]);
    }
  }
  // A trunk or a branch: a tapered tube from p0 to p1; a trunk through several points, tapering from r0 to r1.
  limb(p0, p1, r0, r1, sides = 5) { this.tube([p0, p1], [r0, r1], sides); }
  trunk(pts, r0, r1, sides) { this.tube(pts, pts.map((_, k) => r0 + (r1 - r0) * k / (pts.length - 1)), sides); }
  // The nearest trees' trunk: `at(y)` is its line, r0 its radius above the root, top where
  // it ends; a flare at the root, where it is half as wide again and bulges over its roots.
  bole(at, r0, r1, top, sides = 8) {
    const ys = [0, 0.012, 0.035, 0.09, 0.3 * top, 0.62 * top, top], rs = [r0 * 1.75, r0 * 1.3, r0 * 1.08, r0, r0 + (r1 - r0) * 0.3, r0 + (r1 - r0) * 0.62, r1];
    this.tube(ys.map(at), rs, sides, 0.2);
  }

  // A card: a flat piece `w` by `h` showing the part [u0, v0, u1, v1] of the picture, laid
  // so that the picture's point (au, av) (0..1 across and down the part) is at `p`, its
  // left-to-right along `right` and its bottom-to-top along `up`. c: the middle of the
  // bunch it belongs to (for its light). bend: the far edge moved by this much (a bough
  // that hangs: the card is then two pieces). The card is held at (au, av): it flutters
  // the more the farther from there, and a small card less than a large one.
  plate(p, right, up, w, h, rect, au, av, c, leaf = 3, bend = null) {
    const [u0, v0, u1, v1] = rect, fk = Math.min(1, Math.max(w, h) / 0.15);
    const at = (u, v, k = 0) => [p[0] + right[0] * w * (u - au) + up[0] * h * (av - v) + (bend ? bend[0] * k : 0), p[1] + right[1] * w * (u - au) + up[1] * h * (av - v) + (bend ? bend[1] * k : 0), p[2] + right[2] * w * (u - au) + up[2] * h * (av - v) + (bend ? bend[2] * k : 0)];
    const uv = (u, v) => [u0 + (u1 - u0) * u, v0 + (v1 - v0) * v], fl = (u, v) => Math.min(1, Math.hypot(u - au, v - av) * 1.2) * fk;
    const cuts = bend ? [0, 0.5, 1] : [0, 1];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1], ka = a * a, kb = b * b;
      const p00 = at(a, 0, ka), p01 = at(a, 1, ka), p10 = at(b, 0, kb), p11 = at(b, 1, kb);
      this.tri(p00, p01, p11, leaf, c[0], c[1], c[2], uv(a, 0), uv(a, 1), uv(b, 1), null, [fl(a, 0), fl(a, 1), fl(b, 1)]); this.tri(p00, p11, p10, leaf, c[0], c[1], c[2], uv(a, 0), uv(b, 1), uv(b, 0), null, [fl(a, 0), fl(b, 1), fl(b, 0)]);
    }
  }

  // A spray growing from `p` along `ax`, `len` long and `wid` across (`ay`: the way the
  // picture's downward goes); its root `off` of the way down the card's root edge.
  card(p, ax, ay, len, wid, cell, c, off = 0.5, bend = null) { this.plate(p, ax, [-ay[0], -ay[1], -ay[2]], len, wid, sprayRect(cell), 0, off, c, 3, bend); }

  // The heart of a mass of foliage: crossed cards of a rosette at its middle, drawn dark
  // (aLeaf 3.25). Sprays alone are a lace one sees straight through: a forest of them was a
  // green noise with no tree in it. With a heart a crown is a dark mass with a cut edge,
  // and the light catches the sprays that stand out of it. (A plain lump does the same for
  // fewer layers of cut-out, and shows its flat faces from every side: tried twice.)
  // rx: its radius, ry: its half height; flatToo: a third card lying flat (for whoever looks up or down into it).
  heart(cx, cy, cz, rx, ry, rose, flatToo = true) {
    const c = [cx, cy, cz], rect = sprayRect(rose), t = cx * 37 + cz * 53 + cy * 11, a = [Math.cos(t), 0, Math.sin(t)], b = [-Math.sin(t), 0, Math.cos(t)];
    this.plate(c, a, [0, 1, 0], 2 * rx, 2 * ry, rect, 0.5, 0.5, c, 3.25);
    this.plate(c, b, [0, 1, 0], 2 * rx, 2 * ry, rect, 0.5, 0.5, c, 3.25);
    if (flatToo) this.plate(c, a, b, 2 * rx, 2 * rx, rect, 0.5, 0.5, c, 3.25);
  }

  // A skirt: the heart of one tier of a fir's boughs, a cone hanging from the trunk at
  // height y down to a ring `r` out and `fall` lower.
  skirt(y, r, fall, turn) {
    const top = [0, y, 0], ring = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(turn + k * 1.0472) * r * (k % 2 ? 1 : 0.86), y - fall * (k % 2 ? 1 : 0.8), Math.sin(turn + k * 1.0472) * r * (k % 2 ? 1 : 0.86)]);
    for (let k = 0; k < 6; k++) this.tri(top, ring[k], ring[(k + 1) % 6], 1.25, 0, y - fall * 1.6, 0);
  }

  // A bunch of large sprays at a limb's end (the middle distance): `n` of them growing out of
  // (cx, cy, cz) every way (more up and out than down), each about `r` long, flatter than
  // round by `flat`, round a dark heart.
  bunch(cx, cy, cz, r, n, cells, R, flat = 1, low = -0.45, rose = SPRAYS.roseL) {
    this.heart(cx, cy + r * 0.12, cz, r * 0.95, r * 0.8 * Math.min(1, flat + 0.25), rose);
    for (let k = 0; k < n; k++) {
      const u = low + (1 - low) * (k + R()) / n, a = k * 2.4 + R() * 1.2, h = Math.sqrt(Math.max(0, 1 - u * u));
      // (sprays two thirds the size they were here and twice as many, standing a little out from
      // the middle: the leaves are nearer the size they have on the nearest trees, for fewer pixels)
      const d = norm([Math.cos(a) * h, u * flat, Math.sin(a) * h]), e = norm(cross(d, norm([R() - 0.5, R() - 0.5, R() - 0.5]))), len = r * (0.82 + 0.3 * R());
      this.card([cx + d[0] * r * 0.2, cy + d[1] * r * 0.2 * flat, cz + d[2] * r * 0.2], d, e, len, len * 0.9, cells[k % cells.length], [cx, cy, cz]);
    }
  }

  // The same bunch for the nearest trees: `n` twigs growing out of its middle every way,
  // each a thin tube, and on every twig sprays a metre or so long (`size`, tree heights):
  // two part way along it, standing off to its sides, two at its end. from: where the limb
  // that carries the bunch ends (the twigs start there, not in the air).
  twigs(cx, cy, cz, r, n, cells, R, size, flat = 1, low = -0.45, from = null, rose = SPRAYS.roseL) {
    const c = [cx, cy, cz], f = from || c;
    this.heart(cx, cy + r * 0.05, cz, r * 0.6, r * 0.5 * Math.min(1, flat + 0.25), rose);
    for (let k = 0; k < n; k++) {
      const u = low + (1 - low) * (k + R()) / n, a = k * 2.4 + R() * 1.2, h = Math.sqrt(Math.max(0, 1 - u * u));
      const d = norm([Math.cos(a) * h, u * flat, Math.sin(a) * h]), reach = r * (0.62 + 0.3 * R()), tip = add(c, [d[0], d[1] * flat, d[2]], reach), knee = add(add(f, [tip[0] - f[0], tip[1] - f[1], tip[2] - f[2]], 0.5), [0, 1, 0], reach * 0.08);
      this.tube([f, knee, tip], [0.0026, 0.0017, 0.0008], 3);
      const e1 = norm(cross(d, norm([R() - 0.5, R() - 0.5, R() - 0.5]))), e2 = cross(d, e1);
      for (let j = 0; j < 5; j++) {
        // (two from the knee, off to the sides and outward; three from the tip, onward)
        const at = j < 2 ? knee : tip, sd = j % 2 ? 1 : -1, sw = j < 2 ? 0.9 : 0.45, dir = norm([d[0] + (e1[0] * sd + e2[0] * (R() - 0.5)) * sw, d[1] + (e1[1] * sd + e2[1] * (R() - 0.5)) * sw + 0.12, d[2] + (e1[2] * sd + e2[2] * (R() - 0.5)) * sw]);
        const len = size * (j < 2 ? 1.15 : 1) * (0.85 + 0.4 * R()), ay = norm(cross(dir, norm([R() - 0.5, R() - 0.5 + 0.6 * sd, R() - 0.5])));
        this.plate(add(at, dir, -len * 0.04), dir, [-ay[0], -ay[1], -ay[2]], len, len * 0.9, sprayRect(cells[(k + j) % cells.length]), 0, 0.5, c, j < 2 ? 3.25 : 3);          // (those inside the bunch are its dark heart)
      }
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
    // (wood and lumps first, cards after, each kind in the order it was made)
    const T = this.tris.filter((t) => t.uv[0][0] < 0).concat(this.tris.filter((t) => t.uv[0][0] >= 0));
    const n = T.length * 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), leaf = new Float32Array(n), sway = new Float32Array(n * 2), uv = new Float32Array(n * 2);
    T.forEach((tr, t) => {
      const [A, B, C] = tr.p, isLeaf = tr.leaf, card = isLeaf > 2.5, out = tr.out;
      // a plain face: its own normal, turned to look away from the middle of its mass and
      // leaning toward straight out from it
      let fn = norm(cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]));
      const m = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3], o = norm([m[0] - out[0], out[1] == null ? 0 : m[1] - out[1], m[2] - out[2]]);
      if (fn[0] * o[0] + fn[1] * o[1] + fn[2] * o[2] < 0) fn = [-fn[0], -fn[1], -fn[2]];
      const k = isLeaf > 1.5 ? 0.8 : isLeaf ? 0.35 : 0.6; fn = norm([fn[0] + (o[0] - fn[0]) * k, fn[1] + (o[1] - fn[1]) * k, fn[2] + (o[2] - fn[2]) * k]);
      for (let v = 0; v < 3; v++) {
        const i = t * 3 + v, [px, py, pz] = tr.p[v], y = Math.max(0, py), r = Math.hypot(px, pz);
        let nn = fn;
        if (tr.n) nn = tr.n[v];
        else if (card) {
          // a card: lit as part of the whole crown and of its own bunch, corner by corner (the
          // way the card itself faces says nothing: a tree is a round thing)
          const a = norm([px - out[0], py - (out[1] ?? py), pz - out[2]]), b = norm([px, (py - this.mid) * 0.8, pz]);
          nn = norm([a[0] * 0.45 + b[0] * 0.8, a[1] * 0.45 + b[1] * 0.8 + 0.3, a[2] * 0.45 + b[2] * 0.8]);
        }
        pos.set(tr.p[v], i * 3); nrm.set(nn, i * 3); uv.set(tr.uv[v], i * 2); leaf[i] = isLeaf;
        sway[i * 2] = y * y * (0.6 + 1.5 * r) * (isLeaf > 1.5 && isLeaf < 2.5 ? 1.5 : 1); sway[i * 2 + 1] = tr.fl ? tr.fl[v] : isLeaf > 1.5 && isLeaf < 3.5 ? 1 : 0;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 1)); g.setAttribute('aSway', new THREE.BufferAttribute(sway, 2)); g.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
    g.userData.mid = this.mid;          // (the height the crown's light is reckoned from: the far forest lights its cards by the same rule)
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
  const UP = [0, 1, 0];

  // 0 conifer: tiers of boughs hanging from the trunk, shorter to the top, and a spire
  // (spruce, fir, larch, redwood). Close by a bough is a branch that sags, fronds off it to
  // both sides swept forward, and its twigs hanging under it like a curtain. At the middle
  // distance it is one card standing on edge, out from the trunk, its spray hanging; a few
  // lie flat in every tier for whoever looks from above or below. Variants: fuller,
  // sparser, taller-crowned.
  make(0, 11, (v) => [SPRAYS.roseN, [0.2, 0.17, 0.22][v], 0.3, 0.5], (s, R, L, v, q) => {
    // (a tall narrow spire, as spruce and fir stand: a third as wide as it is tall at most.
    // It was half as wide as tall, the tree of a Christmas card.)
    const tiers = [13, 11, 15][v], wide = [1, 0.84, 1.1][v], foot = [0.15, 0.25, 0.1][v], nV = 5, nH = 1;
    s.mid = 0.5;
    const tr = (y) => [0.016 * y * (1 - y), y, 0.012 * y * (1 - y)];
    if (q === 2) s.bole(tr, 0.016, 0.0025, 0.97); else s.trunk([tr(0), tr(0.5), tr(0.97)], 0.016, 0.003, 5);
    // (the dead stubs of old boughs low on the trunk, as firs have)
    if (q === 2) for (let k = 0; k < 9; k++) { const y = 0.035 + (foot - 0.03) * (k + L()) / 9, a = k * 2.4 + L() * 2, l = 0.012 + 0.03 * L(), p = tr(y); s.tube([p, [p[0] + Math.cos(a) * l, y + l * (0.25 - 0.5 * L()), p[2] + Math.sin(a) * l]], [0.0028, 0.0009], 3); }
    const bough = (y, a, len, c) => {
      const root = tr(y), dir = [Math.cos(a), 0, Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)], droop = 0.2 + 0.2 * L();
      const P = (u) => [root[0] + dir[0] * len * u, y + len * (0.07 * u - droop * u * u), root[2] + dir[2] * len * u];
      s.tube([P(0), P(0.5), P(1)], [0.0034 * Math.min(1, 0.4 + len / 0.15), 0.0022 * Math.min(1, 0.4 + len / 0.15), 0.0007], 3);
      // fronds off the bough to both sides, swept forward, their outer edges hanging a little
      const gap = 0.027 / len; let sd = L() < 0.5 ? 1 : -1;
      for (let u = 0.22 + 0.1 * L(); u < 0.86; u += gap * (0.8 + 0.4 * L()), sd = -sd) {
        const fl = Math.min(0.085, len * (0.68 * (1 - u) + 0.24)) * (0.85 + 0.3 * L()), sw = 0.85 + 0.3 * L();
        const f = norm([dir[0] * Math.cos(sw) + side[0] * sd * Math.sin(sw), -0.2 - 0.15 * L(), dir[2] * Math.cos(sw) + side[2] * sd * Math.sin(sw)]), nrm = norm([dir[0] * 0.1 - side[0] * sd * 0.3, 1, dir[2] * 0.1 - side[2] * sd * 0.3]);
        s.card(P(u), f, norm(cross(nrm, f)), fl, fl * 0.95, SPRAYS.firTop, c, 0.5, fl > 0.05 ? [0, -fl * 0.22, 0] : null);
      }
      // the frond the bough ends in
      { const e = norm([dir[0], 0.07 - 2 * droop * 0.75, dir[2]]), fl = Math.max(0.03, len * 0.42); s.card(P(0.72), e, side, fl, fl * 0.85, SPRAYS.firTop, c, 0.5, [0, -fl * 0.15, 0]); }
      // and what hangs under it, piece by piece along it
      const m = Math.max(1, Math.round(len / 0.065));
      for (let i = 0; i < m; i++) {
        const u0 = 0.12 + 0.88 * i / m, u1 = 0.12 + 0.88 * (i + 1) / m, p0 = P(u0), p1 = P(u1), d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], l = Math.hypot(...d), ax = [d[0] / l, d[1] / l, d[2] / l];
        const down = norm([side[0] * (L() - 0.5) * 0.5, -1, side[2] * (L() - 0.5) * 0.5]), ay = norm(add(down, ax, -(down[0] * ax[0] + down[1] * ax[1] + down[2] * ax[2])));
        s.card(p0, ax, ay, l * 1.04, Math.min(0.06, len * 0.42) * (0.75 + 0.5 * L()) * (1 - 0.3 * i / m), SPRAYS.firHang, c, 0.07);
      }
    };
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1), y = foot + (0.93 - foot) * Math.pow(t, 0.9), rr = (0.185 * Math.pow(1 - t, 0.85) + 0.024) * (0.8 + 0.36 * R()) * wide, turn = R() * TAU, c = [0, y - rr * 0.4, 0];
      // The tier's dark inside, so that the tree is not seen through: a rosette of fronds lying
      // under the boughs, drawn dark (a cut edge; a solid cone here showed as a black pyramid
      // from every side on the nearest trees). At the middle distance a small cone inside it too.
      s.plate([0, y - rr * 0.22, 0], [Math.cos(turn), -0.12, Math.sin(turn)], [-Math.sin(turn), 0.12, Math.cos(turn)], rr * 1.5, rr * 1.5, sprayRect(SPRAYS.roseN), 0.5, 0.5, c, 3.25);
      if (q === 2) s.plate([0, y - rr * 0.45, 0], [Math.cos(turn + 0.6), 0.1, Math.sin(turn + 0.6)], [-Math.sin(turn + 0.6), -0.1, Math.cos(turn + 0.6)], rr * 1.1, rr * 1.1, sprayRect(SPRAYS.roseN), 0.5, 0.5, c, 3.25);
      else s.skirt(y + rr * 0.1, rr * 0.5, rr * 0.5, turn);
      if (q === 2) { const nB = t > 0.7 ? 5 : 7; for (let j = 0; j < nB; j++) bough(y - rr * 0.1 * L(), turn + (j + 0.6 * (L() - 0.5)) / nB * TAU, rr * (0.85 + 0.35 * L()), c); continue; }
      for (let j = 0; j < nV; j++) {
        const a = turn + (j + 0.5 * (L() - 0.5)) / nV * TAU, len = rr * (0.85 + 0.35 * L()), ax = norm([Math.cos(a), -0.18 - 0.2 * L(), Math.sin(a)]), d = -ax[1], ay = norm([-d * ax[0], -1 - d * ax[1], -d * ax[2]]);
        s.card([Math.cos(a) * 0.006, y, Math.sin(a) * 0.006], ax, ay, len, len * 0.66, SPRAYS.fir, c, 0.2);
      }
      for (let j = 0; j < nH; j++) {
        const a = turn + 0.6 + (j + 0.4 * (L() - 0.5)) / nH * TAU, len = rr * (0.85 + 0.3 * L());
        s.card([0, y, 0], norm([Math.cos(a), -0.15, Math.sin(a)]), [-Math.sin(a), 0, Math.cos(a)], len, len * 0.9, SPRAYS.firTop, c, 0.5);
      }
    }
    for (let j = 0; j < (q === 2 ? 3 : 2); j++) s.card([0, 0.88, 0], [0, 1, 0], [Math.cos(j * (q === 2 ? 1.05 : 1.57)), 0, Math.sin(j * (q === 2 ? 1.05 : 1.57))], 0.13, 0.085, SPRAYS.firTop, [0, 0.8, 0]);
  });

  // 1 pine: a long bare trunk with a bend in it, branches that turn up at their ends, a
  // round head of needles on each (ponderosa, Scots pine). Close by a head is a handful of
  // twigs, each ending in a branch end's tufts on crossed cards; at the middle distance a
  // few large bursts.
  make(1, 23, (v) => [SPRAYS.roseN, 0.26, [0.72, 0.76, 0.68][v], 0.7], (s, R, L, v, q) => {
    const lean = [0.012, 0.05, -0.04][v], low = [0.46, 0.54, 0.38][v], N = [11, 9, 12][v];
    s.mid = 0.7;
    const tr = (y) => [lean * (y < 0.5 ? y * 1.6 : 0.8 + (y - 0.5) * 0.9) + 0.012 * Math.sin(y * 7), y, 0.01 * Math.sin(y * 5 + 1)];
    if (q === 2) s.bole(tr, 0.016, 0.004, 0.93); else s.trunk([tr(0), tr(0.3), tr(0.62), tr(0.93)], 0.016, 0.004, 5);
    // a burst: crossed cards standing on the point, the needles upward and outward
    const burst = (c, r, n) => { s.heart(c[0], c[1] + r * 0.7, c[2], r * 0.74, r * 0.66, SPRAYS.roseN); for (let j = 0; j < n; j++) { const a = L() * TAU + j * (3.1416 / n), tilt = (L() - 0.5) * 0.7; s.plate(c, [Math.cos(a), 0, Math.sin(a)], norm([-Math.sin(a) * tilt, 1, Math.cos(a) * tilt]), r * 2.5, r * 2.5, sprayRect(SPRAYS.pineTwig), 0.5, 0.8, [c[0], c[1] - r * 0.6, c[2]]); } };
    // a head, close by: twigs up and out of the branch's end, a branch end's tufts on each
    const head = (c, r, n) => {
      for (let j = 0; j < n; j++) {
        const a = j / n * TAU + L() * 1.2, out = j === 0 ? 0 : 0.5 + 0.5 * L(), d = norm([Math.cos(a) * out, 0.55 + 0.6 * L(), Math.sin(a) * out]), tip = add(c, d, r * (0.45 + 0.35 * L())), size = Math.min(0.13, r * 1.25) * (0.85 + 0.3 * L());
        s.tube([c, tip], [0.0024, 0.0012], 3);
        const b = L() * TAU;
        for (let i = 0; i < 2; i++) { const e = [Math.cos(b + i * 1.5708), 0, Math.sin(b + i * 1.5708)], rt = norm(add(e, d, -(e[0] * d[0] + e[1] * d[1] + e[2] * d[2]))); s.plate(tip, rt, d, size, size, sprayRect(SPRAYS.pineTwig), 0.5, 0.97, [c[0], c[1] + r * 0.2, c[2]]); }
      }
    };
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1), y = low + (0.9 - low) * t, a = k * 2.4 + R(), len = (0.15 + 0.15 * (1 - t)) * (0.7 + 0.5 * R()), up = 0.25 + 0.35 * R(), big = 0.12 * (0.85 + 0.4 * R());
      if (q === 1 && k % 4 === 3) continue;
      const root = tr(y), mid = [root[0] + Math.cos(a) * len * 0.6, y + len * 0.08, root[2] + Math.sin(a) * len * 0.6], end = [root[0] + Math.cos(a) * len, y + len * up, root[2] + Math.sin(a) * len];
      const m2 = [mid[0] + (L() - 0.5) * 0.04, mid[1] + 0.02, mid[2] + (L() - 0.5) * 0.04];
      if (q === 2) {
        s.tube([root, mid, end], [0.0065, 0.0042, 0.0022], 4);
        head(end, big, 8); const m3 = add(m2, [Math.cos(a + 1.3), 0.5, Math.sin(a + 1.3)], 0.035); s.tube([mid, m3], [0.003, 0.0016], 3); head(m3, big * 0.8, 5);
      } else { s.limb(root, mid, 0.006, 0.004, 3); s.limb(mid, end, 0.004, 0.002, 3); burst(end, big, 2); burst(m2, big * 0.8, 1); }
    }
    const top = tr(0.93);
    if (q === 2) { head(top, 0.13, 9); const t2 = [top[0] + 0.05, top[1] - 0.05, top[2] + 0.03]; s.tube([tr(0.86), t2], [0.003, 0.0016], 3); head(t2, 0.1, 6); } else { burst([top[0], top[1], top[2]], 0.13, 2); burst([top[0] + 0.05, top[1] - 0.05, top[2] + 0.03], 0.1, 2); }
  });

  // What the broad crowns share: bunches [x, y, z, r, where the limb that carries it ends]
  // at the limbs' ends. Close by each is twigs with small sprays (`size`: how long a spray
  // is, in tree heights); at the middle distance a few large ones.
  const bunches = (s, L, list, n, cells, flat = 1, low = -0.45, size = 0.09, rose = SPRAYS.roseL) => {
    for (const [x, y, z, r, from] of list) { if (s.q === 2) s.twigs(x, y, z, r, Math.max(5, Math.round(n * 1.2)), cells, L, Math.min(size, r * 0.7), flat, low, from, rose); else s.bunch(x, y, z, r, Math.ceil(n * 1.1), cells, L, flat, low, rose); }
  };

  // 2 broadleaf: a trunk that parts into limbs, each limb into two, twigs of leaves all round
  // every end and in the middle, with sky between them (oak, beech, maple). Variants: round,
  // wide and low, tall.
  make(2, 37, (v) => [SPRAYS.roseL, [0.33, 0.4, 0.28][v], [0.68, 0.6, 0.76][v], 0.68], (s, R, L, v, q) => {
    const wide = [1, 1.2, 0.84][v], tall = [1, 0.9, 1.1][v], split = [0.38, 0.32, 0.44][v], M = [4, 4, 3][v], sides = q === 2 ? 5 : 4;
    s.mid = split + 0.28 * tall;
    const tr = (y) => [0.03 * y * (1 - y / split * 0.8), y, 0.01 * y / split];
    if (q === 2) s.bole(tr, 0.0125, 0.0095, split); else s.trunk([tr(0), tr(split * 0.55), tr(split)], 0.0105, 0.008, sides);
    const list = [], top = tr(split);
    for (let i = 0; i < M; i++) {
      // a limb out and up, with a bend in it; two twigs from its end; a bunch on each and one hanging under the bend
      const a = i / M * TAU + R() * 0.7, d = (0.12 + 0.04 * R()) * wide, bend = [Math.cos(a) * d * 0.55, split + 0.07 * tall, Math.sin(a) * d * 0.55], e1 = [Math.cos(a) * d * 1.25, split + (0.2 + 0.05 * R()) * tall, Math.sin(a) * d * 1.25];
      s.tube([[top[0], top[1] - 0.03, top[2]], bend, e1], [0.0078, 0.0058, 0.0034], sides);
      const b0 = [Math.cos(a) * d * 1.9, split + (0.1 + 0.05 * R()) * tall, Math.sin(a) * d * 1.9, (0.13 + 0.03 * R()) * wide];
      if (q === 2) s.tube([bend, [(bend[0] + b0[0]) / 2, (bend[1] + b0[1]) / 2 + 0.015, (bend[2] + b0[2]) / 2], b0], [0.004, 0.003, 0.0018], 4);
      list.push([...b0, b0.slice(0, 3)]);
      for (const da of [-0.6, 0.6]) {
        const b = a + da + (R() - 0.5) * 0.3, d2 = (0.1 + 0.05 * R()) * wide, e2 = [e1[0] + Math.cos(b) * d2, e1[1] + (0.09 + 0.08 * R()) * tall, e1[2] + Math.sin(b) * d2];
        s.tube([e1, e2], [0.004, 0.002], q === 2 ? 4 : 3);
        list.push([e2[0], e2[1] + 0.02, e2[2], (0.135 + 0.04 * R()) * wide, e2]);
      }
    }
    const lead = [0.02, split + 0.4 * tall, 0];
    s.tube([top, [0.012, split + 0.2 * tall, 0.004], lead], [0.0075, 0.005, 0.003], sides);
    const mids = [[0.01, split + 0.3 * tall, 0, 0.16 * wide], [0.03, split + 0.52 * tall, -0.02, 0.14 * wide], [-0.05, split + 0.43 * tall, 0.06, 0.14 * wide], [0.07, split + 0.42 * tall, -0.07, 0.13 * wide]];
    for (const m of mids) list.push([...m, m[1] > lead[1] ? lead : [0.012, split + 0.2 * tall, 0.004]]);
    bunches(s, L, list, 7, [SPRAYS.leaf, SPRAYS.leaf2]);
  });

  // 3 tropical: a tall straight trunk with a flare at its foot, and far above everything a
  // wide crown of big-leaved bunches on spreading limbs (kapok, dipterocarp, gum)
  make(3, 41, (v) => [SPRAYS.roseL, [0.36, 0.4, 0.33][v], [0.84, 0.76, 0.9][v], 0.8], (s, R, L, v, q) => {
    const top = [0.7, 0.62, 0.76][v], wide = [1, 1.15, 0.9][v];
    s.mid = top + 0.1;
    const tr = (y) => [0.006 * Math.sin(y / top * 3.1416), y, 0];
    if (q === 2) s.bole(tr, 0.017, 0.01, top); else s.trunk([[0, 0, 0], [0, 0.07, 0], [0.006, top * 0.6, 0], [0, top, 0]], 0.028, 0.01, 5);
    const list = [[0, top + 0.17, 0, 0.17 * wide, [0, top, 0]]];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + R(), d = (0.19 + 0.09 * R()) * wide, e = [Math.cos(a) * d, top + 0.07 + 0.08 * R(), Math.sin(a) * d];
      s.tube([[0, top - 0.03, 0], [e[0] * 0.5, top + 0.01, e[2] * 0.5], e], [0.009, 0.0062, 0.004], q === 2 ? 5 : 4);
      list.push([e[0], e[1] + 0.02, e[2], (0.14 + 0.05 * R()) * wide, e]);
    }
    bunches(s, L, list, 7, [SPRAYS.big, SPRAYS.leaf], 0.7, -0.45, 0.075);
  });

  // 4 umbrella: a forked trunk whose limbs spread wide and level, and one flat layer of
  // feathery sprays over them (acacia, stone pine, koa)
  make(4, 53, (v) => [SPRAYS.roseL, 0.45, [0.84, 0.76, 0.88][v], 0.8], (s, R, L, v, q) => {
    const fork = [0.42, 0.34, 0.5][v], flat = [0.82, 0.74, 0.86][v];
    s.mid = flat - 0.05;
    const tr = (y) => [0.02 * Math.sin(y / fork * 2.2), y, 0.01 * y / fork];
    if (q === 2) s.bole(tr, 0.017, 0.011, fork); else s.trunk([tr(0), tr(fork * 0.6), tr(fork)], 0.017, 0.011, 5);
    const f0 = tr(fork), list = [[0, flat + 0.015, 0, 0.16, f0]];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + R(), d = 0.15 + 0.05 * R(), e1 = [Math.cos(a) * d, fork + (flat - fork) * 0.7, Math.sin(a) * d];
      s.tube([[f0[0], fork - 0.02, f0[2]], [e1[0] * 0.5, fork + (flat - fork) * 0.3, e1[2] * 0.5], e1], [0.01, 0.008, 0.006], q === 2 ? 5 : 4);
      for (const da of [-0.5, 0.5]) {
        const b = a + da + (R() - 0.5) * 0.3, d2 = 0.13 + 0.06 * R(), e2 = [e1[0] + Math.cos(b) * d2, flat - 0.02 + 0.03 * R(), e1[2] + Math.sin(b) * d2];
        s.tube([e1, e2], [0.006, 0.003], q === 2 ? 4 : 3);
        list.push([e2[0], e2[1] + 0.02, e2[2], 0.15 + 0.05 * R(), e2]);
      }
    }
    bunches(s, L, list, 7, [SPRAYS.fine], 0.22, -0.3, 0.085);
  });

  // 5 bush: tufts from the ground up on a short stem, wider than tall (juniper, pinyon, sagebrush)
  make(5, 67, (v) => [SPRAYS.roseN, 0.4, 0.45, 0.42], (s, R, L, v, q) => {
    s.mid = 0.42;
    const tr = (y) => [0.03 * Math.sin(y * 9), y, 0.03 * y];
    if (q === 2) s.bole(tr, 0.024, 0.012, 0.34, 6); else s.trunk([[0, 0, 0], [0.01, 0.16, 0], [0, 0.34, 0.01]], 0.024, 0.012, 4);
    const t0 = tr(0.34), list = [[0, 0.5, 0, 0.2, t0]];
    for (let k = 0; k < [5, 4, 6][v]; k++) {
      const a = k * 1.3 + R(), d = 0.15 + 0.12 * R(), y = 0.26 + 0.2 * R(), e = [Math.cos(a) * d * 0.8, y - 0.03, Math.sin(a) * d * 0.8];
      s.tube([tr(0.2), [e[0] * 0.5, 0.2 + (e[1] - 0.2) * 0.35, e[2] * 0.5], e], [0.011, 0.008, 0.004], q === 2 ? 4 : 3);
      list.push([Math.cos(a) * d, y, Math.sin(a) * d, 0.17 + 0.07 * R(), e]);
    }
    list.push([0.04, 0.68 + 0.05 * v, -0.03, 0.16, t0]);
    bunches(s, L, list, 8, [SPRAYS.tuft], 1, -0.2, 0.13, SPRAYS.roseN);
  });

  // 6 palm: a thin leaning trunk and a crown of fronds, each a bent blade with leaflets down
  // both sides (plain faces: a frond is its own shape)
  make(6, 71, (v) => [SPRAYS.roseN, 0.36, 0.9, 0.85], (s, R, L, v, q) => {
    const fronds = [0, 10, 13][q] + [0, -1, 2][v], lean = [0.05, -0.08, 0.12][v], top = [lean, 0.9, 0.01];
    s.mid = 0.85;
    s.trunk([[0, 0, 0], [lean * 0.35, 0.45, 0], top], 0.015, 0.009, q === 2 ? 6 : 4);
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
    if (q === 2) s.bole(tr, 0.011, 0.003, 0.97); else s.trunk([tr(0), tr(0.35), tr(0.7), tr(0.97)], 0.012, 0.003, 5);
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1), y = low + (0.9 - low) * t, a = k * 2.3 + R() * 0.8, len = (0.07 + 0.16 * Math.sin(3.1416 * Math.pow(t, 0.7))) * (0.65 + 0.6 * R());
      const root = tr(y), dir = norm([Math.cos(a), 0.7, Math.sin(a)]), end = [root[0] + dir[0] * len, y + dir[1] * len, root[2] + dir[2] * len], c = [root[0], y + len * 0.3, root[2]];
      const e1 = norm(cross(dir, [0, 1, 0])), e2 = cross(dir, e1), L2 = len * 1.5 + 0.05, at = (u) => [root[0] + dir[0] * len * u, y + dir[1] * len * u, root[2] + dir[2] * len * u];
      if (q === 2) {
        // (close by: twigs of leaves off the branch to every side all along it, and one from its end)
        s.tube([root, at(0.5), end], [0.0038, 0.0024, 0.001], 4);
        const m = Math.max(3, Math.round(len / 0.02));
        for (let j = 0; j <= m; j++) {
          const u = 0.25 + 0.75 * j / m, tw = j * 2.4 + L() * 2, sp = j === m ? 0.2 : 0.9, f = norm([dir[0] + (e1[0] * Math.cos(tw) + e2[0] * Math.sin(tw)) * sp, dir[1] + (e1[1] * Math.cos(tw) + e2[1] * Math.sin(tw)) * sp - 0.15, dir[2] + (e1[2] * Math.cos(tw) + e2[2] * Math.sin(tw)) * sp]), ln = 0.1 * (0.8 + 0.5 * L());
          s.card(at(u), f, norm(cross(f, norm([L() - 0.5, L() - 0.5, L() - 0.5]))), ln, ln * 0.9, SPRAYS.aspen, c);
        }
        continue;
      }
      s.limb(root, end, 0.004, 0.0015, 3);
      // (two twigs of leaves along the branch, crossed)
      s.card(at(0.2), dir, e1, L2, L2 * 0.85, SPRAYS.aspen, c);
      s.card(at(0.35), dir, e2, L2 * 0.9, L2 * 0.8, SPRAYS.aspen, c);
    }
    const top = tr(0.97);
    if (q === 2) s.twigs(top[0], top[1] - 0.03, top[2], 0.07, 5, [SPRAYS.aspen], L, 0.07, 1, 0); else s.bunch(top[0], top[1] - 0.02, top[2], 0.07, 3, [SPRAYS.aspen], L, 1, 0);
  });

  // 8 blossom: a small tree that flowers before its leaves are out (cherry, plum, thorn): a
  // short trunk that parts low into rising limbs, each forking, a wide round crown of
  // twigs thick with flowers. Its sprays show petals only while the tree is in flower
  // (trees.js); the rest of the year it is a small round-leaved tree.
  make(8, 97, (v) => [SPRAYS.roseB, [0.44, 0.5, 0.4][v], [0.74, 0.68, 0.8][v], 0.62], (s, R, L, v, q) => {
    const fork = [0.24, 0.2, 0.3][v], wide = [1, 1.15, 0.9][v], M = [5, 5, 4][v];
    s.mid = 0.62;
    const tr = (y) => [0.03 * Math.sin(y / fork * 2), y, 0.02 * y / fork];
    if (q === 2) s.bole(tr, 0.022, 0.017, fork); else s.trunk([tr(0), tr(fork * 0.5), tr(fork)], 0.022, 0.016, 5);
    const f0 = tr(fork), list = [];
    for (let i = 0; i < M; i++) {
      const a = i / M * TAU + R() * 0.8, d = (0.17 + 0.07 * R()) * wide, e1 = [f0[0] + Math.cos(a) * d, fork + 0.2 + 0.08 * R(), f0[2] + Math.sin(a) * d];
      s.tube([[f0[0], fork - 0.02, f0[2]], [f0[0] + Math.cos(a) * d * 0.6, fork + 0.07, f0[2] + Math.sin(a) * d * 0.6], e1], [0.012, 0.0085, 0.005], q === 2 ? 5 : 4);
      list.push([e1[0] * 1.15, e1[1] - 0.03, e1[2] * 1.15, (0.16 + 0.04 * R()) * wide, e1]);
      for (const da of [-0.7, 0.7]) {
        const b = a + da + (R() - 0.5) * 0.3, d2 = (0.12 + 0.06 * R()) * wide, e2 = [e1[0] + Math.cos(b) * d2, e1[1] + 0.1 + 0.1 * R(), e1[2] + Math.sin(b) * d2];
        s.tube([e1, e2], [0.005, 0.0025], q === 2 ? 4 : 3);
        list.push([e2[0], e2[1] + 0.02, e2[2], (0.15 + 0.04 * R()) * wide, e2]);
      }
    }
    const lead = [f0[0], fork + 0.42, f0[2]];
    s.tube([f0, lead], [0.011, 0.004], q === 2 ? 5 : 4);
    list.push([lead[0], lead[1] + 0.1, lead[2], 0.2 * wide, lead], [lead[0] + 0.03, fork + 0.24, lead[2] - 0.02, 0.17 * wide, f0]);
    bunches(s, L, list, 8, [SPRAYS.blossom], 0.85, -0.4, 0.14, SPRAYS.roseB);
  });
  return out;
}
