// The shapes trees have (cover.js, ARCH), each as three meshes: close (within some tens of
// metres: every leaf), near, and far (a few masses with the same outline). A tree is one
// unit tall and stands on the origin with +Y up; the shader sizes, turns and places it
// (trees.js).
//
// The shapes are those of a landscape poster: a tree is known by its outline, and its
// outline is made of what a real one's is. A trunk and limbs that can be seen; foliage in
// separate bunches at the limbs' ends with sky between them, never one solid mass. A fir
// is tiers of boughs, each a frond with needles down both sides, hanging at its tip; a
// pine a bare bent trunk with round sprays of needles on upturned branches; an oak a
// forked trunk under a dozen balls of leaves; an aspen a white pole with small bunches of
// round leaves on thin branches all up its length. Every face is flat (one normal a
// face, leaning outward from the middle of its bunch, so a bunch is lit as a ball): with
// the painted look's two tones of light a face is either lit or in shade.
//
// Vertex data: position, normal, aLeaf (0 wood, 1 a mass of leaves, 1.25 the dark heart
// of a bunch, 2 a single leaf or needle: these flutter), aSway (how far the wind can move
// the vertex: its height and its distance from the trunk).
//
// node scripts/tree-preview.mjs draws them all without a browser.
import * as THREE from 'three';

// (the same numbers every time: a tree shape is the same on every device)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// A mesh under construction: triangles as nine numbers each, with what they are.
// q: how much is drawn (2 close, 1 near, 0 far).
class Shape {
  constructor(q) { this.pos = []; this.leaf = []; this.out = []; this.q = q; }
  // a, b, c: [x, y, z]; leaf: see aLeaf above; cx, cy, cz: the middle of the mass the face
  // belongs to (its normal leans away from there)
  tri(a, b, c, leaf, cx = 0, cy = null, cz = 0) { this.pos.push(...a, ...b, ...c); this.leaf.push(leaf); this.out.push(cx, cy, cz); }

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

  // A skirt of boughs: from a point on the axis at (cx, y1, cz) down and out to a jagged
  // ring of `points` tips at height y0, `r` wide; the tips droop, the notches between
  // them are drawn in. R: the random numbers.
  skirt(cx, cz, y0, y1, r, points, R, droop = 0.35, notch = 0.55, leaf = 1) {
    const n = points * 2, turn = R() * 6.2831853, ring = [];
    for (let k = 0; k < n; k++) {
      const a = turn + k / n * 6.2831853, tip = k % 2 === 0, rr = r * (tip ? 0.86 + 0.3 * R() : notch * (0.8 + 0.4 * R()));
      ring.push([cx + Math.cos(a) * rr, y0 + (tip ? -droop * (y1 - y0) * (0.6 + 0.8 * R()) : 0.22 * (y1 - y0)), cz + Math.sin(a) * rr]);
    }
    const top = [cx, y1, cz];
    for (let k = 0; k < n; k++) this.tri(top, ring[(k + 1) % n], ring[k], leaf, cx, y0 - (y1 - y0) * 0.6, cz);
  }

  // A lump of leaves: a ball of twenty faces (or of eight: `few`), each corner pushed in or
  // out, `rx` wide and `ry` tall.
  lump(cx, cy, cz, rx, ry, R, rough = 0.28, leaf = 1, few = false) {
    const t = (1 + Math.sqrt(5)) / 2;
    const V = few ? [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] : [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const F = few ? [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]] : [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const c0 = Math.cos(R() * 6.28), s0 = Math.sin(R() * 6.28), tilt = few ? 0.5 + 0.5 * R() : 0, c1 = Math.cos(tilt), s1 = Math.sin(tilt);
    // (the eight-faced one is tipped over as well as turned: standing on a corner it is a diamond)
    const P = V.map((v) => { const l = Math.hypot(...v), k = 1 - rough + 2 * rough * R(); let x = v[0] / l, y = v[1] / l, z = v[2] / l; [x, y] = [x * c1 - y * s1, x * s1 + y * c1]; return [cx + (x * c0 - z * s0) * rx * k, cy + y * ry * k, cz + (x * s0 + z * c0) * rx * k]; });
    for (const f of F) this.tri(P[f[0]], P[f[1]], P[f[2]], leaf, cx, cy, cz);
  }

  // A bough of a fir or spruce: from `root` outward at the angle `a`, `len` long; it rises
  // a little, then hangs. A blade down its middle and `teeth` needles off each side, swept
  // toward the tip and shorter toward it: the jagged outline of a conifer's tier.
  frond(root, a, len, wide, teeth, droop, R) {
    const c = Math.cos(a), s = Math.sin(a), sx = -s, sz = c;
    const at = (t) => [root[0] + c * len * t, root[1] + len * (0.12 * Math.sin(t * 3.1416) - droop * t * t), root[2] + s * len * t];
    const oy = root[1] - len * 0.7, m = at(0.45), tip = at(1), hw = wide * 0.34;
    const l = [m[0] - sx * hw, m[1], m[2] - sz * hw], r = [m[0] + sx * hw, m[1], m[2] + sz * hw];
    this.tri(root, l, r, 1, root[0], oy, root[2]); this.tri(l, tip, r, 1, root[0], oy, root[2]);
    for (let j = 0; j < teeth; j++) for (const sd of [-1, 1]) {
      const t = (j + 0.4 + 0.35 * R()) / (teeth + 0.4), w = wide * (1 - 0.6 * t) * (0.75 + 0.5 * R());
      const b0 = at(Math.max(0, t - 0.13)), b1 = at(Math.min(1, t + 0.1)), e = at(Math.min(1, t + 0.17));
      this.tri(b0, b1, [e[0] + sx * sd * w, e[1] - 0.22 * w, e[2] + sz * sd * w], 2, root[0], oy, root[2]);
    }
  }

  // A pine's bunch of needles: `n` of them standing out of a point every way but down, as a
  // spiky ball `r` across, round a small dark heart.
  spray(c, r, n, R, heart = true) {
    if (heart) this.lump(c[0], c[1], c[2], r * 0.5, r * 0.42, R, 0.25, 1.25, this.q < 2);
    for (let k = 0; k < n; k++) {
      const u = -0.4 + 1.4 * R(), a = R() * 6.2831853, h = Math.sqrt(Math.max(0, 1 - u * u)), d = [Math.cos(a) * h, u, Math.sin(a) * h];
      const len = r * (0.75 + 0.5 * R()), w = r * 0.26, sl = Math.hypot(d[2], d[0]) || 1, sx = -d[2] / sl, sz = d[0] / sl, k0 = 0.15 * r;
      this.tri([c[0] + d[0] * k0 + sx * w, c[1] + d[1] * k0 - 0.3 * w, c[2] + d[2] * k0 + sz * w], [c[0] + d[0] * k0 - sx * w, c[1] + d[1] * k0 - 0.3 * w, c[2] + d[2] * k0 - sz * w], [c[0] + d[0] * len, c[1] + d[1] * len, c[2] + d[2] * len], 2, c[0], c[1], c[2]);
    }
  }

  // A bunch of leaves at a limb's end: `n` single leaves in a shell `rx` wide and `ry` tall
  // round (cx, cy, cz), at several depths, each `size` long with its point outward and
  // down. Close by a leaf has a leaf's own shape (narrow at the stalk, widest part of the
  // way out, a point; `round`: nearly as wide as long, an aspen's). heart: a dark lump at
  // the middle, this share of the bunch's size (0: none), so the bunch is not see-through.
  cluster(cx, cy, cz, rx, ry, n, size, R, heart = 0.5, round = false) {
    if (heart > 0) this.lump(cx, cy, cz, rx * heart, ry * heart, R, 0.3, 1.25, this.q < 2);
    const kite = this.q === 2;
    for (let k = 0; k < n; k++) {
      const u = -0.65 + 1.65 * R(), a = R() * 6.2831853, h = Math.sqrt(Math.max(0, 1 - u * u)), dx = Math.cos(a) * h, dz = Math.sin(a) * h, out = 0.62 + 0.5 * R();
      const px = cx + dx * rx * out, py = cy + u * ry * out, pz = cz + dz * rx * out, len = size * (0.7 + 0.6 * R()), w = len * (round ? 0.5 : 0.36);
      // (across the leaf; and the way its point goes: outward, a little down, a little any way)
      const tl = Math.hypot(dx, dz) || 1, tx = -dz / tl, tz = dx / tl, ox = dx * 0.7 + (R() - 0.5) * 0.5, oy = u * 0.35 - 0.45 + (R() - 0.5) * 0.3, oz = dz * 0.7 + (R() - 0.5) * 0.5;
      const tip = [px + ox * len, py + oy * len, pz + oz * len];
      if (kite) {
        const m = round ? 0.5 : 0.42, mx = px + ox * len * m, my = py + oy * len * m + 0.12 * len, mz = pz + oz * len * m;
        const l = [mx - tx * w, my, mz - tz * w], r = [mx + tx * w, my, mz + tz * w];
        this.tri([px, py, pz], l, r, 2, cx, cy, cz); this.tri(l, tip, r, 2, cx, cy, cz);
      } else this.tri([px - tx * w * 1.15, py + 0.2 * len, pz - tz * w * 1.15], [px + tx * w * 1.15, py + 0.2 * len, pz + tz * w * 1.15], tip, 2, cx, cy, cz);
    }
  }

  build() {
    const n = this.pos.length / 3, pos = new Float32Array(this.pos), nrm = new Float32Array(n * 3), leaf = new Float32Array(n), sway = new Float32Array(n);
    for (let t = 0; t < n / 3; t++) {
      const o = t * 9, ax = pos[o], ay = pos[o + 1], az = pos[o + 2], bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5], cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
      // the face's own normal, turned to look away from the middle of its mass ...
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      let l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3, q = t * 3, isLeaf = this.leaf[t];
      let ox = mx - this.out[q], oy = this.out[q + 1] == null ? 0 : my - this.out[q + 1], oz = mz - this.out[q + 2];
      l = Math.hypot(ox, oy, oz) || 1; ox /= l; oy /= l; oz /= l;
      if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      // ... and leaning a third of the way toward straight out from it
      const k = isLeaf > 1.5 ? 0.8 : isLeaf ? 0.35 : 0.6; nx += (ox - nx) * k; ny += (oy - ny) * k; nz += (oz - nz) * k;
      l = Math.hypot(nx, ny, nz) || 1;
      for (let v = 0; v < 3; v++) {
        const i = t * 3 + v, y = Math.max(0, pos[i * 3 + 1]), r = Math.hypot(pos[i * 3], pos[i * 3 + 2]);
        nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
        leaf[i] = isLeaf; sway[i] = y * y * (isLeaf ? 1 + 2.5 * r : 0.6) * (isLeaf > 1.5 ? 1.5 : 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 1)); g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    return g;
  }
}

// One list per shape, of VARIANTS trees of that shape, each [close mesh, near mesh, far
// mesh]: no two neighbours need be the same tree turned round. The three are the same
// tree (the same limbs in the same places: the random numbers of its build are drawn the
// same way at every distance, those of its leaves apart). (Widths are for a tree whose
// crown-width number is 1; heights are fractions of the tree's height.)
export const VARIANTS = 3;
export function makeTreeGeometries() {
  const out = [];
  // build: (shape, the build's random numbers, the leaves' random numbers, which variant, q) => fills the shape
  const make = (seed, build) => {
    const list = [];
    for (let v = 0; v < VARIANTS; v++) list.push([2, 1, 0].map((q) => { const s = new Shape(q); build(s, rng(seed + v * 7919), rng(seed + 577 + v * 7919 + q * 131), v, q); return s.build(); }));
    out.push(list);
  };
  const TAU = 6.2831853;

  // 0 conifer: tiers of boughs one above another, each bough a frond that hangs at its tip,
  // shorter to the top, and a spire (spruce, fir, larch, redwood). Far off: a stack of
  // jagged skirts with the same outline. Variants: fuller, sparser, taller-crowned.
  make(11, (s, R, L, v, q) => {
    const tiers = [13, 11, 15][v], wide = [1, 0.84, 1.1][v], foot = [0.15, 0.24, 0.1][v], per = [0, 5, 8][q];
    s.trunk([[0, 0, 0], [0.004, 0.5, 0.003], [0, 0.97, 0]], 0.018, 0.003, [3, 4, 6][q]);
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1), y = foot + (0.94 - foot) * Math.pow(t, 0.9), rr = (0.235 * Math.pow(1 - t, 0.8) + 0.028) * (0.78 + 0.4 * R()) * wide, turn = R() * TAU;
      if (q === 0) { if (k % 2 === 0 || k === tiers - 1) s.skirt(0, 0, y - 0.02, y + rr * 0.6 + 0.06, rr * 1.05, 6, L, 0.5, 0.5); continue; }
      // (a dark heart to the tier: the trunk is not seen through a fir)
      s.skirt(0, 0, y - 0.005, y + rr * 0.55 + 0.03, rr * 0.62, q === 2 ? 5 : 4, L, 0.3, 0.6, 1.25);
      for (let j = 0; j < per; j++) {
        if (L() < 0.07) continue;
        const a = turn + (j + 0.4 * (L() - 0.5)) / per * TAU;
        s.frond([Math.cos(a) * 0.008, y, Math.sin(a) * 0.008], a, rr * (0.8 + 0.38 * L()), rr * (q === 2 ? 0.52 : 0.6), q === 2 ? 5 : 2, 0.16 + 0.22 * L(), L);
      }
    }
    s.skirt(0, 0, 0.93, 1.0, 0.026, 3, L, 0.1, 0.7);
  });

  // 1 pine: a long bare trunk with a bend in it, branches that turn up at their ends, a
  // round spray of needles on each (ponderosa, Scots pine). Far off: a lump for a spray.
  make(23, (s, R, L, v, q) => {
    const lean = [0.012, 0.05, -0.04][v], low = [0.46, 0.54, 0.38][v], N = [11, 9, 12][v];
    const tr = (y) => [lean * (y < 0.5 ? y * 1.6 : 0.8 + (y - 0.5) * 0.9) + 0.012 * Math.sin(y * 7), y, 0.01 * Math.sin(y * 5 + 1)];
    s.trunk([tr(0), tr(0.3), tr(0.62), tr(0.93)], 0.016, 0.004, [3, 5, 6][q]);
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1), y = low + (0.9 - low) * t, a = k * 2.4 + R(), len = (0.15 + 0.15 * (1 - t)) * (0.7 + 0.5 * R()), up = 0.25 + 0.35 * R(), big = 0.115 * (0.85 + 0.4 * R());
      if ((q === 1 && k % 4 === 3) || (q === 0 && k % 2 === 1)) continue;
      const root = tr(y), mid = [root[0] + Math.cos(a) * len * 0.6, y + len * 0.08, root[2] + Math.sin(a) * len * 0.6], end = [root[0] + Math.cos(a) * len, y + len * up, root[2] + Math.sin(a) * len];
      if (q === 0) { s.limb(root, end, 0.005, 0.002, 3); s.lump(end[0], end[1], end[2], big * 1.25, big * 0.85, L, 0.3, 1, true); continue; }
      s.limb(root, mid, 0.007, 0.004, 3); s.limb(mid, end, 0.004, 0.002, 3);
      s.spray(end, big, q === 2 ? 20 : 11, L);
      s.spray([mid[0] + (L() - 0.5) * 0.04, mid[1] + 0.035, mid[2] + (L() - 0.5) * 0.04], big * 0.8, q === 2 ? 14 : 7, L, q === 2);
      if (q === 2) s.spray([end[0] - Math.cos(a) * 0.05, end[1] - 0.03, end[2] - Math.sin(a) * 0.05], big * 0.7, 9, L, false);
    }
    const top = tr(0.93);
    if (q === 0) s.lump(top[0], top[1] + 0.02, top[2], 0.13, 0.09, L, 0.3);
    else { s.spray([top[0], top[1] + 0.02, top[2]], 0.125, q === 2 ? 22 : 12, L); s.spray([top[0] + 0.05, top[1] - 0.03, top[2] + 0.03], 0.07, q === 2 ? 11 : 6, L, q === 2); }
  });

  // What the broad crowns share: bunches of leaves [x, y, z, rx, ry] drawn as leaves round a
  // dark heart (close: n leaves each; near: fewer; far: a lump each).
  const bunches = (s, L, list, n, size, heart, round) => {
    list.forEach(([x, y, z, rx, ry], i) => {
      // (far off: every other bunch, half as large again, the smaller ones of eight faces:
      // far trees are the many, and a forest of them is drawn in its thousands)
      if (s.q === 0) { if (i % 2 === 0) s.lump(x, y, z, rx * 1.45, ry * 1.4, L, 0.3, 1, i % 4 === 2); return; }
      s.cluster(x, y, z, rx, ry, s.q === 2 ? n : Math.round(n * 0.33), size * (s.q === 2 ? 1 : 1.2), L, s.q === 2 ? heart : Math.min(0.8, heart + 0.2), round);
    });
  };

  // 2 broadleaf: a trunk that parts into limbs, each limb into two, a ball of leaves at every
  // end and three in the middle, with sky between them (oak, beech, maple). Variants: round,
  // wide and low, tall.
  make(37, (s, R, L, v, q) => {
    const wide = [1, 1.2, 0.84][v], tall = [1, 0.9, 1.1][v], split = [0.38, 0.32, 0.44][v], M = [4, 4, 3][v], sides = [3, 5, 6][q];
    s.trunk([[0, 0, 0], [0.012, split * 0.55, 0.004], [0.006, split, 0]], 0.015, 0.011, sides);
    const list = [], top = [0.006, split, 0];
    for (let i = 0; i < M; i++) {
      // a limb out and up, with a bend in it; two twigs from its end; a bunch on each and one hanging under the bend
      const a = i / M * TAU + R() * 0.7, d = (0.12 + 0.04 * R()) * wide, bend = [Math.cos(a) * d * 0.55, split + 0.07 * tall, Math.sin(a) * d * 0.55], e1 = [Math.cos(a) * d * 1.25, split + (0.2 + 0.05 * R()) * tall, Math.sin(a) * d * 1.25];
      if (q) { s.limb([top[0], top[1] - 0.03, top[2]], bend, 0.01, 0.007, 4); s.limb(bend, e1, 0.007, 0.004, 4); } else s.limb([top[0], top[1] - 0.03, top[2]], e1, 0.009, 0.004, 3);
      list.push([Math.cos(a) * d * 1.9, split + (0.1 + 0.05 * R()) * tall, Math.sin(a) * d * 1.9, (0.13 + 0.03 * R()) * wide, 0.095 + 0.02 * R()]);
      for (const da of [-0.6, 0.6]) {
        const b = a + da + (R() - 0.5) * 0.3, d2 = (0.1 + 0.05 * R()) * wide, e2 = [e1[0] + Math.cos(b) * d2, e1[1] + (0.09 + 0.08 * R()) * tall, e1[2] + Math.sin(b) * d2];
        if (q) s.limb(e1, e2, 0.004, 0.002, 3);
        list.push([e2[0], e2[1] + 0.02, e2[2], (0.135 + 0.04 * R()) * wide, 0.1 + 0.03 * R()]);
      }
    }
    list.push([0.01, split + 0.3 * tall, 0, 0.16 * wide, 0.11], [0.03, split + 0.52 * tall, -0.02, 0.14 * wide, 0.1], [-0.05, split + 0.43 * tall, 0.06, 0.14 * wide, 0.1], [0.07, split + 0.42 * tall, -0.07, 0.13 * wide, 0.095]);
    if (q) s.limb(top, [0.02, split + 0.4 * tall, 0], 0.009, 0.003, 4);
    bunches(s, L, list, 54, 0.058, 0.46, false);
  });

  // 3 tropical: a tall straight trunk with a flare at its foot, and far above everything a
  // wide crown of big-leaved bunches on spreading limbs (kapok, dipterocarp, gum)
  make(41, (s, R, L, v, q) => {
    const top = [0.7, 0.62, 0.76][v], wide = [1, 1.15, 0.9][v];
    s.trunk([[0, 0, 0], [0, 0.07, 0], [0.006, top * 0.6, 0], [0, top, 0]], 0.028, 0.01, [3, 5, 6][q]);
    const list = [[0, top + 0.17, 0, 0.19 * wide, 0.085]];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + R(), d = (0.19 + 0.09 * R()) * wide, e = [Math.cos(a) * d, top + 0.07 + 0.08 * R(), Math.sin(a) * d];
      s.limb([0, top - 0.03, 0], e, 0.011, 0.005, q ? 4 : 3);
      list.push([e[0], e[1] + 0.02, e[2], (0.14 + 0.05 * R()) * wide, 0.07 + 0.025 * R()]);
    }
    bunches(s, L, list, 40, 0.062, 0.55, false);
  });

  // 4 umbrella: a forked trunk whose limbs spread wide and level, and one flat layer of
  // small-leaved bunches over them (acacia, stone pine, koa)
  make(53, (s, R, L, v, q) => {
    const fork = [0.42, 0.34, 0.5][v], flat = [0.82, 0.74, 0.86][v];
    s.trunk([[0, 0, 0], [0.02, fork * 0.6, 0.01], [0.012, fork, 0]], 0.017, 0.011, [3, 5, 6][q]);
    const list = [[0, flat + 0.015, 0, 0.17, 0.04]];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + R(), d = 0.15 + 0.05 * R(), e1 = [Math.cos(a) * d, fork + (flat - fork) * 0.7, Math.sin(a) * d];
      s.limb([0.012, fork - 0.02, 0], e1, 0.013, 0.007, q ? 4 : 3);
      for (const da of [-0.5, 0.5]) {
        const b = a + da + (R() - 0.5) * 0.3, d2 = 0.13 + 0.06 * R(), e2 = [e1[0] + Math.cos(b) * d2, flat - 0.02 + 0.03 * R(), e1[2] + Math.sin(b) * d2];
        if (q) s.limb(e1, e2, 0.007, 0.003, 3);
        list.push([e2[0], e2[1] + 0.02, e2[2], 0.15 + 0.05 * R(), 0.035 + 0.012 * R()]);
      }
    }
    bunches(s, L, list, 36, 0.036, 0.7, false);
  });

  // 5 bush: bunches of leaves from the ground up on a short stem, wider than tall (juniper, pinyon, sagebrush)
  make(67, (s, R, L, v, q) => {
    s.trunk([[0, 0, 0], [0.01, 0.16, 0], [0, 0.34, 0.01]], 0.03, 0.016, [3, 4, 5][q]);
    const list = [[0, 0.5, 0, 0.21, 0.2]];
    for (let k = 0; k < [5, 4, 6][v]; k++) {
      const a = k * 1.3 + R(), d = 0.15 + 0.12 * R(), y = 0.26 + 0.2 * R();
      if (q) s.limb([0, 0.2, 0], [Math.cos(a) * d * 0.8, y - 0.03, Math.sin(a) * d * 0.8], 0.012, 0.005, 3);
      list.push([Math.cos(a) * d, y, Math.sin(a) * d, 0.17 + 0.07 * R(), 0.15 + 0.07 * R()]);
    }
    list.push([0.04, 0.68 + 0.05 * v, -0.03, 0.16, 0.15]);
    bunches(s, L, list, 38, 0.062, 0.55, false);
  });

  // 6 palm: a thin leaning trunk and a crown of fronds, each a bent blade with leaflets down both sides
  make(71, (s, R, L, v, q) => {
    const fronds = [6, 10, 13][q] + [0, -1, 2][v], lean = [0.05, -0.08, 0.12][v], top = [lean, 0.9, 0.01], sides = [3, 4, 5][q];
    s.trunk([[0, 0, 0], [lean * 0.35, 0.45, 0], top], 0.015, 0.009, sides);
    for (let k = 0; k < fronds; k++) {
      const a = k / fronds * TAU + L(), c = Math.cos(a), sn = Math.sin(a), len = 0.3 + 0.1 * L(), w = 0.05, rise = 0.04 + 0.06 * L();
      const mid = [top[0] + c * len * 0.5, top[1] + rise, top[2] + sn * len * 0.5], end = [top[0] + c * len, top[1] - 0.06 - 0.12 * L(), top[2] + sn * len];
      const l = [mid[0] - sn * w, mid[1] - 0.02, mid[2] + c * w], r = [mid[0] + sn * w, mid[1] - 0.02, mid[2] - c * w];
      s.tri(top, l, mid, 1, top[0], 0.8, top[2]); s.tri(top, mid, r, 1, top[0], 0.8, top[2]); s.tri(l, end, mid, 1, top[0], 0.8, top[2]); s.tri(mid, end, r, 1, top[0], 0.8, top[2]);
      // (leaflets: pointed leaves hanging off both edges of the frond)
      const nl = [0, 5, 10][q];
      for (let j = 1; j <= nl; j++) for (const sd of [-1, 1]) {
        const t = j / (nl + 1), bx = top[0] + c * len * t, bz = top[2] + sn * len * t, by = top[1] + rise * Math.sin(t * 3.14) - (t > 0.5 ? (t - 0.5) * 0.3 : 0), wl = 0.075 * (1 - 0.5 * t);
        s.tri([bx, by, bz], [bx + c * 0.035, by, bz + sn * 0.035], [bx + c * 0.02 - sn * sd * wl, by - 0.05, bz + sn * 0.02 + c * sd * wl], 2, top[0], 0.8, top[2]);
      }
    }
  });

  // 7 slender: a pale pole, thin branches all up it that reach upward, small bunches of round
  // leaves on each with nothing solid in them (aspen, birch)
  make(83, (s, R, L, v, q) => {
    const N = [14, 12, 16][v], low = [0.36, 0.44, 0.3][v];
    const tr = (y) => [0.012 * Math.sin(y * 4 + v), y, 0.008 * Math.sin(y * 6)];
    s.trunk([tr(0), tr(0.35), tr(0.7), tr(0.97)], 0.013, 0.003, [3, 5, 6][q]);
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1), y = low + (0.9 - low) * t, a = k * 2.3 + R() * 0.8, len = (0.07 + 0.16 * Math.sin(3.1416 * Math.pow(t, 0.7))) * (0.65 + 0.6 * R()), rx = 0.085 * (0.8 + 0.5 * R()), ry = 0.065 * (0.8 + 0.5 * R());
      if ((q === 1 && k % 3 === 2) || (q === 0 && k % 3 !== 0)) continue;
      const root = tr(y), end = [root[0] + Math.cos(a) * len, y + len * 0.7, root[2] + Math.sin(a) * len], mid = [(root[0] + end[0]) / 2, (root[1] + end[1]) / 2 + 0.01, (root[2] + end[2]) / 2];
      if (q === 0) { s.lump(end[0] * 0.8, end[1], end[2] * 0.8, rx * 1.7, ry * 1.9, L, 0.3); continue; }
      s.limb(root, end, 0.004, 0.0015, 3);
      s.cluster(end[0], end[1] + 0.01, end[2], rx * (q === 2 ? 1 : 1.15), ry * (q === 2 ? 1 : 1.15), q === 2 ? 20 : 9, q === 2 ? 0.042 : 0.055, L, 0, true);
      s.cluster(mid[0], mid[1], mid[2], rx * 0.8, ry * 0.8, q === 2 ? 11 : 4, q === 2 ? 0.04 : 0.055, L, 0, true);
    }
    const top = tr(0.97);
    if (q === 0) s.lump(top[0], top[1] - 0.04, top[2], 0.09, 0.1, L, 0.3); else s.cluster(top[0], top[1] - 0.02, top[2], 0.075, 0.07, q === 2 ? 20 : 9, 0.042, L, 0, true);
  });
  return out;
}
