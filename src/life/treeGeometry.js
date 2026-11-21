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
      const k = isLeaf ? 0.35 : 0.6; nx += (ox - nx) * k; ny += (oy - ny) * k; nz += (oz - nz) * k;
      l = Math.hypot(nx, ny, nz) || 1;
      for (let v = 0; v < 3; v++) {
        const i = t * 3 + v, y = Math.max(0, pos[i * 3 + 1]), r = Math.hypot(pos[i * 3], pos[i * 3 + 2]);
        nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
        leaf[i] = isLeaf; sway[i] = y * y * (isLeaf ? 1 + 2.5 * r : 0.6);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 1)); g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    return g;
  }
}

// One list per shape: [near mesh, far mesh]. (Widths are for a tree whose crown-width
// number is 1; heights are fractions of the tree's height.)
export function makeTreeGeometries() {
  const out = [];
  const make = (seed, near, far) => { const a = new Shape(), b = new Shape(); near(a, rng(seed)); far(b, rng(seed + 1000)); out.push([a.build(), b.build()]); };

  // 0 conifer: plates of boughs one above another, each hanging at its tips, smaller to
  // the top, and a spire (spruce, fir, larch, redwood)
  const conifer = (plates, points) => (s, R) => {
    s.limb([0, 0, 0], [0, 0.55, 0], 0.017, 0.009, plates > 5 ? 5 : 3); s.limb([0, 0.55, 0], [0, 0.96, 0], 0.009, 0.003, 3);
    for (let k = 0; k < plates; k++) {
      const t = k / (plates - 1), y = 0.17 + 0.76 * Math.pow(t, 0.92);
      const r = (0.2 * Math.pow(1 - t, 0.8) + 0.03) * (0.88 + 0.24 * R()) * (plates > 5 ? 1 : 1.12);
      s.tuft((R() - 0.5) * 0.025, y, (R() - 0.5) * 0.025, r, 0.02 + 0.03 * (1 - t) + (plates > 5 ? 0 : 0.04), points, R, 0.42);
    }
    s.skirt(0, 0, 0.9, 1.0, 0.03, 3, R, 0.1, 0.7);
  };
  make(11, conifer(11, 7), conifer(4, 5));

  // 1 pine: a long bare trunk, flat tufts of needles on the upper branches (ponderosa, Scots pine)
  const pine = (n, sides, points) => (s, R) => {
    s.limb([0, 0, 0], [0.01, 0.55, 0], 0.02, 0.013, sides); s.limb([0.01, 0.55, 0], [0, 0.93, 0.01], 0.013, 0.005, sides);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), y = 0.46 + 0.5 * t, a = k * 2.4 + R(), d = (0.07 + 0.13 * (1 - t) * (0.6 + 0.6 * R())) * (k === n - 1 ? 0 : 1);
      const x = Math.cos(a) * d, z = Math.sin(a) * d, r = (0.11 + 0.07 * (1 - t)) * (0.85 + 0.3 * R()) * (n < 5 ? 1.5 : 1);
      if (d > 0.05 && sides > 3) s.limb([0, y - 0.05, 0], [x * 0.8, y - 0.01, z * 0.8], 0.006, 0.003, 3);
      s.tuft(x, y, z, r, 0.035 + 0.03 * R(), points, R);
    }
  };
  make(23, pine(9, 6, 5), pine(3, 3, 4));

  // 2 broadleaf: a trunk that parts into limbs inside a broad crown of many cut lumps (oak, beech, maple)
  make(37, (s, R) => {
    s.limb([0, 0, 0], [0.01, 0.44, 0], 0.024, 0.015, 6);
    s.limb([0.01, 0.42, 0], [0.12, 0.62, 0.05], 0.012, 0.006, 4); s.limb([0.01, 0.4, 0], [-0.1, 0.66, -0.06], 0.012, 0.006, 4); s.limb([0.01, 0.43, 0], [-0.02, 0.7, 0.1], 0.011, 0.005, 4);
    // a ring of lumps at the crown's widest, a smaller ring above it, one on top
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.2831853 + R() * 0.5, d = 0.16 + 0.07 * R(); s.lump(Math.cos(a) * d, 0.56 + 0.1 * R(), Math.sin(a) * d, 0.13 + 0.05 * R(), 0.1 + 0.04 * R(), R, 0.3); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.2831853 + R(), d = 0.08 + 0.05 * R(); s.lump(Math.cos(a) * d, 0.74 + 0.06 * R(), Math.sin(a) * d, 0.13 + 0.04 * R(), 0.1 + 0.03 * R(), R, 0.3); }
    s.lump(0, 0.66, 0, 0.16, 0.14, R, 0.25); s.lump(0.01, 0.89, 0, 0.12, 0.09, R, 0.3);
  }, (s, R) => {
    s.limb([0, 0, 0], [0, 0.45, 0], 0.024, 0.014, 3);
    s.lump(0, 0.64, 0, 0.3, 0.2, R, 0.25); s.lump(0.02, 0.83, 0, 0.19, 0.14, R, 0.25);
  });

  // 3 tropical: a tall straight trunk and a wide shallow crown above everything (kapok, dipterocarp, gum)
  make(41, (s, R) => {
    s.limb([0, 0, 0], [0, 0.72, 0], 0.02, 0.012, 6);
    s.limb([0, 0.7, 0], [0.13, 0.8, 0.03], 0.01, 0.005, 3); s.limb([0, 0.7, 0], [-0.12, 0.81, -0.06], 0.01, 0.005, 3);
    s.lump(0, 0.86, 0, 0.26, 0.11, R); s.lump(0.2, 0.82, 0.04, 0.18, 0.085, R); s.lump(-0.19, 0.83, -0.08, 0.19, 0.09, R); s.lump(-0.03, 0.82, 0.2, 0.16, 0.08, R); s.lump(0.04, 0.93, -0.03, 0.15, 0.07, R);
  }, (s, R) => { s.limb([0, 0, 0], [0, 0.74, 0], 0.02, 0.012, 3); s.lump(0, 0.85, 0, 0.31, 0.14, R, 0.2); });

  // 4 umbrella: a forked trunk under flat plates of leaves (acacia, stone pine, koa)
  make(53, (s, R) => {
    s.limb([0, 0, 0], [0.02, 0.45, 0], 0.022, 0.014, 5);
    s.limb([0.02, 0.43, 0], [0.2, 0.78, 0.06], 0.012, 0.005, 4); s.limb([0.02, 0.43, 0], [-0.19, 0.77, -0.08], 0.012, 0.005, 4); s.limb([0.02, 0.44, 0], [0, 0.8, 0.16], 0.011, 0.005, 4);
    s.tuft(0, 0.86, 0, 0.36, 0.05, 7, R); s.tuft(0.22, 0.81, 0.08, 0.24, 0.045, 6, R); s.tuft(-0.22, 0.8, -0.1, 0.25, 0.045, 6, R); s.tuft(0, 0.82, 0.2, 0.2, 0.04, 5, R);
  }, (s, R) => { s.limb([0, 0, 0], [0, 0.78, 0], 0.02, 0.01, 3); s.tuft(0, 0.84, 0, 0.42, 0.06, 6, R); });

  // 5 bush: leaves to the ground, wider than tall (juniper, pinyon, sagebrush)
  make(67, (s, R) => {
    s.limb([0, 0, 0], [0, 0.3, 0], 0.03, 0.02, 4);
    s.lump(0, 0.5, 0, 0.36, 0.38, R, 0.32); s.lump(0.22, 0.34, 0.1, 0.25, 0.26, R, 0.32); s.lump(-0.2, 0.38, -0.13, 0.26, 0.28, R, 0.32); s.lump(-0.05, 0.3, 0.24, 0.2, 0.22, R, 0.32); s.lump(0.05, 0.78, -0.03, 0.2, 0.2, R, 0.32);
  }, (s, R) => { s.lump(0, 0.46, 0, 0.42, 0.46, R, 0.25); });

  // 6 palm: a thin leaning trunk and a crown of fronds (each a bent, pointed blade)
  const palm = (fronds) => (s, R) => {
    s.limb([0, 0, 0], [0.03, 0.5, 0], 0.014, 0.011, fronds > 6 ? 5 : 3); s.limb([0.03, 0.5, 0], [0.05, 0.9, 0.01], 0.011, 0.009, fronds > 6 ? 5 : 3);
    for (let k = 0; k < fronds; k++) {
      const a = k / fronds * 6.2831853 + R(), c = Math.cos(a), sn = Math.sin(a), len = 0.3 + 0.08 * R(), w = 0.05, top = [0.05, 0.9, 0.01];
      const mid = [top[0] + c * len * 0.5, 0.97, top[2] + sn * len * 0.5], end = [top[0] + c * len, 0.86 - 0.1 * R(), top[2] + sn * len];
      const l = [mid[0] - sn * w, mid[1] - 0.02, mid[2] + c * w], r = [mid[0] + sn * w, mid[1] - 0.02, mid[2] - c * w];
      s.tri(top, l, mid, 1, top[0], 0.8, top[2]); s.tri(top, mid, r, 1, top[0], 0.8, top[2]); s.tri(l, end, mid, 1, top[0], 0.8, top[2]); s.tri(mid, end, r, 1, top[0], 0.8, top[2]);
    }
  };
  make(71, palm(9), palm(5));

  // 7 slender: a pale straight pole with small light lumps of leaves up its length (aspen, birch)
  make(83, (s, R) => {
    s.limb([0, 0, 0], [0.005, 0.5, 0], 0.011, 0.008, 5); s.limb([0.005, 0.5, 0], [0, 0.95, 0.005], 0.008, 0.003, 5);
    for (let k = 0; k < 9; k++) {
      const t = k / 8, y = 0.42 + 0.54 * t, a = k * 2.2 + R() * 0.8, d = k === 8 ? 0 : 0.045 + 0.075 * (1 - t) * (0.6 + 0.7 * R());
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (d > 0.05) s.limb([0, y - 0.04, 0], [x * 0.7, y, z * 0.7], 0.004, 0.002, 3);
      s.lump(x, y, z, 0.085 * (0.8 + 0.5 * R()) * (1 - 0.3 * t), 0.07 * (0.8 + 0.5 * R()), R, 0.3);
    }
  }, (s, R) => { s.limb([0, 0, 0], [0, 0.7, 0], 0.011, 0.006, 3); s.lump(0, 0.62, 0, 0.14, 0.17, R, 0.2); s.lump(0.01, 0.85, 0, 0.1, 0.13, R, 0.2); });
  return out;
}
