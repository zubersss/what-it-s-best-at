// The shapes trees have (cover.js, ARCH), each as two meshes: one for trees near the
// traveller and a plain one for those farther off. A tree is one unit tall and stands on
// the origin with +Y up; the shader sizes, turns and places it (trees.js).
//
// The shapes are those of a landscape poster, not of a botanical plate: a tree is known
// by its outline. A spruce is a stack of drooping, jagged skirts; a pine is a bare trunk
// with flat tufts on its upper branches; a broadleaf is a few cut lumps on a forked trunk;
// an aspen a white pole with small light lumps up its length. Every face is flat (one
// normal a face, leaning a little outward so the whole still reads as a mass): with the
// painted look's two tones of light a face is either lit or in shade.
//
// Vertex data: position, normal, aLeaf (0 on the trunk, 1 on leaves), aSway (how far the
// wind can move the vertex: its height and its distance from the trunk).
import * as THREE from 'three';

// (the same numbers every time: a tree shape is the same on every device)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// A mesh under construction: triangles as nine numbers each, with what they are.
class Shape {
  constructor() { this.pos = []; this.leaf = []; this.out = []; }
  // a, b, c: [x, y, z]; leaf: 0 or 1; cx, cy, cz: the middle of the mass the face belongs to
  // (its normal leans away from there)
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

  // A skirt of boughs: from a point on the axis at (cx, y1, cz) down and out to a jagged
  // ring of `points` tips at height y0, `r` wide; the tips droop, the notches between
  // them are drawn in. R: the random numbers.
  skirt(cx, cz, y0, y1, r, points, R, droop = 0.35, notch = 0.55) {
    const n = points * 2, turn = R() * 6.2831853, ring = [];
    for (let k = 0; k < n; k++) {
      const a = turn + k / n * 6.2831853, tip = k % 2 === 0, rr = r * (tip ? 0.86 + 0.3 * R() : notch * (0.8 + 0.4 * R()));
      ring.push([cx + Math.cos(a) * rr, y0 + (tip ? -droop * (y1 - y0) * (0.6 + 0.8 * R()) : 0.22 * (y1 - y0)), cz + Math.sin(a) * rr]);
    }
    const top = [cx, y1, cz];
    for (let k = 0; k < n; k++) this.tri(top, ring[(k + 1) % n], ring[k], 1, cx, y0 - (y1 - y0) * 0.6, cz);
  }

  // A tuft: a flat jagged star with a low point above and below its middle (a pine's
  // bunch of needles at a branch's end, an acacia's plate of leaves).
  // droop: how far the tips hang below the middle, as a share of the tuft's radius (a
  // spruce's bough).
  tuft(cx, cy, cz, r, thick, points, R, droop = 0) {
    const n = points * 2, turn = R() * 6.2831853, ring = [];
    for (let k = 0; k < n; k++) {
      const a = turn + k / n * 6.2831853, tip = k % 2 === 0, rr = r * (tip ? 0.8 + 0.4 * R() : 0.5 + 0.2 * R());
      ring.push([cx + Math.cos(a) * rr, cy + (R() - 0.5) * thick * 0.5 - droop * rr * (tip ? 1 : 0.55), cz + Math.sin(a) * rr]);
    }
    const up = [cx, cy + thick, cz], dn = [cx, cy - thick * 0.7, cz];
    for (let k = 0; k < n; k++) { this.tri(up, ring[(k + 1) % n], ring[k], 1, cx, cy, cz); this.tri(dn, ring[k], ring[(k + 1) % n], 1, cx, cy, cz); }
  }

  // A lump of leaves: a twenty-faced ball, each corner pushed in or out, `rx` wide and `ry` tall.
  lump(cx, cy, cz, rx, ry, R, rough = 0.28) {
    const t = (1 + Math.sqrt(5)) / 2, V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const c0 = Math.cos(R() * 6.28), s0 = Math.sin(R() * 6.28);
    const P = V.map((v) => { const l = Math.hypot(...v), k = 1 - rough + 2 * rough * R(), x = v[0] / l, z = v[2] / l; return [cx + (x * c0 - z * s0) * rx * k, cy + v[1] / l * ry * k, cz + (x * s0 + z * c0) * rx * k]; });
    for (const f of F) this.tri(P[f[0]], P[f[1]], P[f[2]], 1, cx, cy, cz);
  }

  // Leaves: `count` single leaves standing out of a mass round (cx, cy, cz), radii (rx,
  // ry): each a pointed triangle `size` long, hanging outward and down. They are what the
  // outline of a crown is made of, and what the wind moves most (their leaf number is 2).
  sprigs(cx, cy, cz, rx, ry, count, size, R, low = -0.5) {
    for (let k = 0; k < count; k++) {
      const u = low + (1 - low) * R(), a = R() * 6.2831853, h = Math.sqrt(Math.max(0, 1 - u * u)), dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      const px = cx + dx * rx * 1.02, py = cy + u * ry * 1.02, pz = cz + dz * rx * 1.02, len = size * (0.7 + 0.6 * R()), w = len * 0.42;
      // (its stalk end on the mass, its point outward and a little down; its width across both)
      const tx = -dz, tz = dx, ox = dx * 0.75, oy = u * 0.5 - 0.5, oz = dz * 0.75;
      this.tri([px - tx * w, py + 0.25 * len, pz - tz * w], [px + tx * w, py + 0.25 * len, pz + tz * w], [px + ox * len, py + oy * len, pz + oz * len], 2, cx, cy, cz);
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

// One list per shape, of VARIANTS trees of that shape, each [near mesh, far mesh]: no two
// neighbours need be the same tree turned round. (Widths are for a tree whose crown-width
// number is 1; heights are fractions of the tree's height.)
export const VARIANTS = 3;
export function makeTreeGeometries() {
  const out = [];
  // near, far: (shape, random numbers, which variant) => fills the shape
  const make = (seed, near, far) => {
    const list = [];
    for (let v = 0; v < VARIANTS; v++) { const a = new Shape(), b = new Shape(); near(a, rng(seed + v * 7919), v); far(b, rng(seed + 1000 + v * 7919), v); list.push([a.build(), b.build()]); }
    out.push(list);
  };

  // 0 conifer: plates of boughs one above another, each hanging at its tips, smaller to
  // the top, and a spire (spruce, fir, larch, redwood). Variants: fuller, sparser, taller-crowned.
  const conifer = (near) => (s, R, v) => {
    const plates = near ? [12, 10, 14][v] : 4, points = near ? 7 : 5, wide = [1, 0.86, 1.12][v], foot = [0.17, 0.26, 0.12][v];
    s.limb([0, 0, 0], [0, 0.55, 0], 0.017, 0.009, near ? 5 : 3); s.limb([0, 0.55, 0], [0, 0.96, 0], 0.009, 0.003, 3);
    for (let k = 0; k < plates; k++) {
      const t = k / (plates - 1), y = foot + (0.93 - foot) * Math.pow(t, 0.92);
      const r = (0.2 * Math.pow(1 - t, 0.8) + 0.03) * (0.82 + 0.36 * R()) * wide * (near ? 1 : 1.12), cx = (R() - 0.5) * 0.03, cz = (R() - 0.5) * 0.03;
      s.tuft(cx, y, cz, r, 0.02 + 0.03 * (1 - t) + (near ? 0 : 0.04), points, R, 0.42);
      // (needles: sprays hanging from the bough's edge)
      if (near) s.sprigs(cx, y - 0.02, cz, r * 0.95, 0.02, 12, 0.055, R, -1);
    }
    s.skirt(0, 0, 0.9, 1.0, 0.03, 3, R, 0.1, 0.7);
  };
  make(11, conifer(true), conifer(false));

  // 1 pine: a long bare trunk, flat tufts of needles on the upper branches (ponderosa, Scots pine)
  const pine = (near) => (s, R, v) => {
    const n = near ? [9, 7, 11][v] : 3, sides = near ? 6 : 3, points = near ? 5 : 4, lean = [0.01, 0.05, -0.04][v], low = [0.46, 0.55, 0.38][v];
    s.limb([0, 0, 0], [lean, 0.55, 0], 0.02, 0.013, sides); s.limb([lean, 0.55, 0], [lean * 1.6, 0.93, 0.01], 0.013, 0.005, sides);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), y = low + (0.96 - low) * t, a = k * 2.4 + R(), d = (0.07 + 0.13 * (1 - t) * (0.6 + 0.6 * R())) * (k === n - 1 ? 0 : 1);
      const x = lean * (1 + 0.6 * t) + Math.cos(a) * d, z = Math.sin(a) * d, r = (0.11 + 0.07 * (1 - t)) * (0.85 + 0.3 * R()) * (near ? 1 : 1.5);
      if (d > 0.05 && near) s.limb([lean, y - 0.05, 0], [x * 0.8, y - 0.01, z * 0.8], 0.006, 0.003, 3);
      s.tuft(x, y, z, r, 0.035 + 0.03 * R(), points, R);
      if (near) s.sprigs(x, y, z, r * 0.9, 0.035, 12, 0.055, R, -0.6);
    }
  };
  make(23, pine(true), pine(false));

  // 2 broadleaf: a trunk that parts into limbs inside a broad crown of many cut lumps, with
  // leaves standing out all over it (oak, beech, maple). Variants: round, wide and low, tall.
  make(37, (s, R, v) => {
    const wide = [1, 1.2, 0.84][v], tall = [1, 0.9, 1.1][v], split = [0.44, 0.36, 0.5][v];
    s.limb([0, 0, 0], [0.01, split, 0], 0.024, 0.015, 6);
    s.limb([0.01, split - 0.02, 0], [0.12 * wide, split + 0.18, 0.05], 0.012, 0.006, 4); s.limb([0.01, split - 0.04, 0], [-0.1 * wide, split + 0.22, -0.06], 0.012, 0.006, 4); s.limb([0.01, split - 0.01, 0], [-0.02, split + 0.26, 0.1 * wide], 0.011, 0.005, 4);
    const lumps = [];
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.2831853 + R() * 0.5, d = (0.16 + 0.07 * R()) * wide; lumps.push([Math.cos(a) * d, split + (0.12 + 0.1 * R()) * tall, Math.sin(a) * d, (0.13 + 0.05 * R()) * wide, 0.1 + 0.04 * R()]); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.2831853 + R(), d = (0.08 + 0.05 * R()) * wide; lumps.push([Math.cos(a) * d, split + (0.3 + 0.06 * R()) * tall, Math.sin(a) * d, (0.13 + 0.04 * R()) * wide, 0.1 + 0.03 * R()]); }
    lumps.push([0, split + 0.22 * tall, 0, 0.16 * wide, 0.14], [0.01, split + 0.45 * tall, 0, 0.12 * wide, 0.09]);
    for (const [x, y, z, rx, ry] of lumps) { s.lump(x, y, z, rx, ry, R, 0.3); s.sprigs(x, y, z, rx, ry, 16, 0.05, R); }
  }, (s, R, v) => {
    const wide = [1, 1.2, 0.84][v];
    s.limb([0, 0, 0], [0, 0.45, 0], 0.024, 0.014, 3);
    s.lump(0, 0.64, 0, 0.3 * wide, 0.2, R, 0.25); s.lump(0.02, 0.83, 0, 0.19 * wide, 0.14, R, 0.25);
  });

  // 3 tropical: a tall straight trunk and a wide crown of lumps and leaves above everything (kapok, dipterocarp, gum)
  make(41, (s, R, v) => {
    const top = [0.72, 0.64, 0.78][v], wide = [1, 1.15, 0.9][v];
    s.limb([0, 0, 0], [0, top, 0], 0.02, 0.012, 6);
    const lumps = [[0, top + 0.14, 0, 0.24, 0.12]];
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.2831853 + R(), d = (0.15 + 0.08 * R()) * wide; lumps.push([Math.cos(a) * d, top + 0.06 + 0.08 * R(), Math.sin(a) * d, (0.14 + 0.05 * R()) * wide, 0.085 + 0.03 * R()]); s.limb([0, top - 0.02, 0], [Math.cos(a) * d * 0.8, top + 0.05, Math.sin(a) * d * 0.8], 0.008, 0.004, 3); }
    lumps.push([0.03, top + 0.23, -0.02, 0.14, 0.07]);
    for (const [x, y, z, rx, ry] of lumps) { s.lump(x, y, z, rx, ry, R, 0.3); s.sprigs(x, y, z, rx, ry, 18, 0.05, R); }
  }, (s, R, v) => { const top = [0.72, 0.64, 0.78][v]; s.limb([0, 0, 0], [0, top + 0.02, 0], 0.02, 0.012, 3); s.lump(0, top + 0.12, 0, 0.31, 0.15, R, 0.2); });

  // 4 umbrella: a forked trunk under flat plates of leaves (acacia, stone pine, koa)
  make(53, (s, R, v) => {
    const fork = [0.45, 0.36, 0.52][v];
    s.limb([0, 0, 0], [0.02, fork, 0], 0.022, 0.014, 5);
    const plates = [[0, 0.86, 0, 0.34, 7], [0.22, 0.81, 0.08, 0.24, 6], [-0.22, 0.8, -0.1, 0.25, 6], [0, 0.82, 0.2, 0.2, 5], [0.05, 0.79, -0.22, 0.2, 5]].slice(0, [5, 4, 5][v]);
    for (const [x, y, z, r, pts] of plates) {
      if (Math.hypot(x, z) > 0.05) s.limb([0.02, fork - 0.02, 0], [x * 0.9, y - 0.05, z * 0.9], 0.012, 0.005, 4);
      s.tuft(x, y, z, r, 0.05, pts, R, 0.08); s.sprigs(x, y + 0.01, z, r * 0.9, 0.04, 22, 0.05, R, -0.3);
    }
  }, (s, R) => { s.limb([0, 0, 0], [0, 0.78, 0], 0.02, 0.01, 3); s.tuft(0, 0.84, 0, 0.42, 0.06, 6, R); });

  // 5 bush: leaves to the ground, wider than tall (juniper, pinyon, sagebrush)
  make(67, (s, R, v) => {
    s.limb([0, 0, 0], [0, 0.3, 0], 0.03, 0.02, 4);
    const lumps = [[0, 0.5, 0, 0.3, 0.34]];
    for (let k = 0; k < [5, 4, 6][v]; k++) { const a = k * 1.3 + R(), d = 0.14 + 0.12 * R(); lumps.push([Math.cos(a) * d, 0.26 + 0.2 * R(), Math.sin(a) * d, 0.2 + 0.08 * R(), 0.2 + 0.1 * R()]); }
    lumps.push([0.04, 0.78 + 0.06 * v, -0.03, 0.18, 0.18]);
    for (const [x, y, z, rx, ry] of lumps) { s.lump(x, y, z, rx, ry, R, 0.32); s.sprigs(x, y, z, rx, ry, 14, 0.07, R); }
  }, (s, R) => { s.lump(0, 0.46, 0, 0.42, 0.46, R, 0.25); });

  // 6 palm: a thin leaning trunk and a crown of fronds, each a bent blade with leaflets down both sides
  const palm = (near) => (s, R, v) => {
    const fronds = near ? [11, 9, 13][v] : 5, lean = [0.05, -0.08, 0.12][v], top = [lean, 0.9, 0.01];
    s.limb([0, 0, 0], [lean * 0.5, 0.5, 0], 0.014, 0.011, near ? 5 : 3); s.limb([lean * 0.5, 0.5, 0], top, 0.011, 0.009, near ? 5 : 3);
    for (let k = 0; k < fronds; k++) {
      const a = k / fronds * 6.2831853 + R(), c = Math.cos(a), sn = Math.sin(a), len = 0.3 + 0.1 * R(), w = 0.05, rise = 0.04 + 0.06 * R();
      const mid = [top[0] + c * len * 0.5, top[1] + rise, top[2] + sn * len * 0.5], end = [top[0] + c * len, top[1] - 0.06 - 0.12 * R(), top[2] + sn * len];
      const l = [mid[0] - sn * w, mid[1] - 0.02, mid[2] + c * w], r = [mid[0] + sn * w, mid[1] - 0.02, mid[2] - c * w];
      s.tri(top, l, mid, 1, top[0], 0.8, top[2]); s.tri(top, mid, r, 1, top[0], 0.8, top[2]); s.tri(l, end, mid, 1, top[0], 0.8, top[2]); s.tri(mid, end, r, 1, top[0], 0.8, top[2]);
      // (leaflets: pointed leaves hanging off both edges of the frond)
      if (near) for (let j = 1; j <= 4; j++) for (const sd of [-1, 1]) {
        const t = j / 5, bx = top[0] + c * len * t, bz = top[2] + sn * len * t, by = top[1] + rise * Math.sin(t * 3.14) - (t > 0.5 ? (t - 0.5) * 0.3 : 0);
        s.tri([bx, by, bz], [bx + c * 0.035, by, bz + sn * 0.035], [bx + c * 0.02 - sn * sd * 0.07, by - 0.05, bz + sn * 0.02 + c * sd * 0.07], 2, top[0], 0.8, top[2]);
      }
    }
  };
  make(71, palm(true), palm(false));

  // 7 slender: a pale straight pole with small light lumps of leaves up its length (aspen, birch)
  make(83, (s, R, v) => {
    const n = [9, 7, 11][v], low = [0.42, 0.5, 0.34][v];
    s.limb([0, 0, 0], [0.005, 0.5, 0], 0.011, 0.008, 5); s.limb([0.005, 0.5, 0], [0, 0.95, 0.005], 0.008, 0.003, 5);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), y = low + (0.96 - low) * t, a = k * 2.2 + R() * 0.8, d = k === n - 1 ? 0 : 0.045 + 0.075 * (1 - t) * (0.6 + 0.7 * R());
      const x = Math.cos(a) * d, z = Math.sin(a) * d, rx = 0.085 * (0.8 + 0.5 * R()) * (1 - 0.3 * t), ry = 0.07 * (0.8 + 0.5 * R());
      if (d > 0.05) s.limb([0, y - 0.04, 0], [x * 0.7, y, z * 0.7], 0.004, 0.002, 3);
      s.lump(x, y, z, rx, ry, R, 0.3); s.sprigs(x, y, z, rx, ry, 12, 0.04, R);
    }
  }, (s, R) => { s.limb([0, 0, 0], [0, 0.7, 0], 0.011, 0.006, 3); s.lump(0, 0.62, 0, 0.14, 0.17, R, 0.2); s.lump(0.01, 0.85, 0, 0.1, 0.13, R, 0.2); });
  return out;
}
