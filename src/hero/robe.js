// The robe's moving cloth: the long skirt of the outer robe (open at the front), the two
// wide sleeves and the long hair. One small mass-spring simulation on the CPU with a patch
// (a grid of particles whose top row is pinned) per piece, in the wearer's axes-aligned,
// anchor-relative frame, so planet-scale coordinates and interplanetary speeds never touch
// it. All patches are drawn as one mesh (one draw call), each finer than it is simulated:
// a smooth surface through the particles (Catmull-Rom across and down) with folds pressed
// in along its normal.
//
// Local frame of the wearer: +Y toward the head, +Z the chest, +X its left. Metres.
import * as THREE from 'three';

const STEP = 1 / 75;          // (at 1/60 the cloth stretched: a link reached 1.9 times its length hovering in vacuum)

// Colours (linear) and materials shared with heroModel.js (see the material list there).
const SILK = [0.74, 0.74, 0.76], TRIM = [0.62, 0.63, 0.66];
const HAIR = [0.12, 0.008, 0.115], HAIR_DEEP = [0.05, 0.004, 0.05];
const M_SILK = 2, M_EMB = 3, M_HAIR = 5;      // (2: thin silk cloth, which lets a little sunlight through)

// The patches. rest(u, v) is the hanging shape in the wearer's frame (u across, v down,
// both 0..1; row v = 0 is pinned). body: the capsule along the spine the cloth stays out
// of ([yLow, yHigh, radius]); spheres: more round obstacles ([x, y, z, r]); limbs: which of
// the eight limb capsules it is kept out of; folds(u, v): fold depth in metres;
// paint(u, v): [colour, material]; normal: how its rest normal is found, for the flutter.
function patches() {
  const D = Math.PI / 180;
  // The skirt of the outer robe: three panels with slits at the front and at both sides, so
  // each flows on its own (th: the angle round the body, 0 = the front, 90 = its left).
  const skirt = (name, th0, th1, nx) => ({
    name, nx, ny: 13, sx: 2, sy: 2, pins: 'row', out: -1,
    rest: (u, v) => {
      const th = (th0 + u * (th1 - th0)) * D, r = 0.165 + 0.21 * v;
      return [r * Math.sin(th), 0.085 - v * 0.985, r * Math.cos(th) * 0.88];
    },
    normal: 'radial',
    body: [-0.30, 0.62, 0.15], spheres: [], limbs: [4, 5, 6, 7],
    folds: (u, v) => (0.004 + 0.024 * Math.pow(v, 0.8)) * Math.cos(9.0 * (th0 + u * (th1 - th0)) * D + 0.7 * Math.sin(u * 9 + v * 2)),
    paint: (u, v) => (v > 0.93 || u < 0.06 || u > 0.94 || (v > 0.80 && v < 0.84) ? [TRIM, M_EMB] : [SILK, M_SILK]),
  });
  // A wide sleeve: a sheet laid over the arm from the upper arm to the wrist, its middle
  // line fixed along the arm (Hero sets those pins every frame), both halves hanging down
  // round it and sewn together along the bottom, widening to a deep opening at the wrist.
  const sleeve = (s) => ({
    name: s > 0 ? 'sleeveL' : 'sleeveR', nx: 7, ny: 6, sx: 2, sy: 2, pins: 'col', pinCol: 3, seam: 0.03, out: 0,
    rest: (u, v) => [s * 0.26, 0.40 - v * 0.52, (u - 0.5) * 2 * (0.10 + 0.32 * v)],
    normal: [s, 0, 0],
    body: [-0.30, 0.62, 0.155], spheres: [], limbs: s > 0 ? [0, 1, 4, 5, 6, 7] : [2, 3, 4, 5, 6, 7],
    folds: (u, v) => 0.012 * v * Math.cos(2 * Math.PI * 3.0 * u + 1.0),
    paint: (u, v) => (v > 0.88 ? [TRIM, M_EMB] : [SILK, M_SILK]),
  });
  // Long straight hair from the crown to the hips: three overlapping locks down the back,
  // each narrowing to its tip, so they part and stream on their own.
  const hair = (name, th0, th1, lift, len) => ({
    name, nx: 4, ny: 12, sx: 3, sy: 2, pins: 'row', out: -1,
    rest: (u, v) => {
      const mid = (th0 + th1) / 2, th = (mid + (u - 0.5) * (th1 - th0) * (1 - 0.55 * Math.pow(v, 1.4))) * D;
      const rho = 0.112 + lift + 0.045 * Math.min(1, v * 3);
      return [rho * Math.sin(th) * 0.95, 0.805 - v * len, -0.005 + rho * Math.cos(th) - 0.035 * Math.min(1, v * 2.5)];
    },
    normal: 'radialHead',
    body: [-0.35, 0.56, 0.165], spheres: [[0, 0.765, -0.004, 0.122]], limbs: [],
    folds: (u, v) => (0.003 + 0.007 * v) * Math.cos(2 * Math.PI * 3.5 * u + 0.6 * Math.sin(v * 5) + th0),
    // deep magenta-purple, darker at the roots, with darker strands
    paint: (u, v) => {
      const k = Math.min(1, 0.35 + v * 3), streak = 0.78 + 0.22 * Math.cos(u * 23.0 + th0) * Math.cos(u * 7.0 + 1.0);
      return [HAIR.map((c, i) => (HAIR_DEEP[i] + (c - HAIR_DEEP[i]) * k) * streak), M_HAIR];
    },
  });
  return [
    skirt('skirtBack', 96, 264, 9), skirt('skirtL', 9, 100, 6), skirt('skirtR', 260, 351, 6),
    sleeve(1), sleeve(-1),
    hair('hairL', 104, 162, 0.0, 0.80), hair('hairC', 148, 212, 0.012, 0.86), hair('hairR', 198, 256, 0.0, 0.80),
  ];
}

export class Robe {
  constructor() {
    this.patches = patches();
    let n = 0, rn = 0;
    for (const p of this.patches) { p.base = n; p.rbase = rn; p.RX = (p.nx - 1) * p.sx + 1; p.RY = (p.ny - 1) * p.sy + 1; n += p.nx * p.ny; rn += p.RX * p.RY; }
    this.count = n;
    this.pos = new Float32Array(n * 3);        // relative to the wearer's anchor, world axes
    this.prev = new Float32Array(n * 3);
    this.localRest = new Float32Array(n * 3);
    this.restN = new Float32Array(n * 3);      // rest normal (wearer's frame), for the flutter
    this.pinned = new Uint8Array(n);
    this.pinLocal = new Float32Array(n * 3);   // pins' places in the wearer's frame (row 0 of each patch)
    this.owner = new Uint8Array(n);            // which patch a particle belongs to
    this.rest = [];                            // constraints: [i, j, restLength, stiffness]
    this.time = 0; this.accum = 0;
    for (let pi = 0; pi < this.patches.length; pi++) {
      const p = this.patches[pi], idx = (ix, iy) => p.base + iy * p.nx + ix;
      for (let iy = 0; iy < p.ny; iy++) for (let ix = 0; ix < p.nx; ix++) {
        const i = idx(ix, iy), r = p.rest(ix / (p.nx - 1), iy / (p.ny - 1));
        this.localRest.set(r, i * 3); this.owner[i] = pi;
        let nn;
        if (p.normal === 'radial') nn = [r[0], 0, r[2]];
        else if (p.normal === 'radialHead') nn = [r[0], 0, r[2] + 0.005];
        else nn = p.normal;
        const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
        this.restN.set([nn[0] / l, nn[1] / l, nn[2] / l], i * 3);
        if (p.pins === 'col' ? ix === p.pinCol : iy === 0) { this.pinned[i] = 1; this.pinLocal.set(r, i * 3); }
      }
      const L = this.localRest, dist = (a, b) => Math.hypot(L[a * 3] - L[b * 3], L[a * 3 + 1] - L[b * 3 + 1], L[a * 3 + 2] - L[b * 3 + 2]);
      const link = (a, b, k) => this.rest.push([a, b, dist(a, b), k]);
      for (let iy = 0; iy < p.ny; iy++) for (let ix = 0; ix < p.nx; ix++) {
        if (ix + 1 < p.nx) link(idx(ix, iy), idx(ix + 1, iy), 1);
        if (iy + 1 < p.ny) link(idx(ix, iy), idx(ix, iy + 1), 1);
        if (ix + 1 < p.nx && iy + 1 < p.ny) { link(idx(ix, iy), idx(ix + 1, iy + 1), 0.6); link(idx(ix + 1, iy), idx(ix, iy + 1), 0.6); }
        if (ix + 2 < p.nx) link(idx(ix, iy), idx(ix + 2, iy), 0.25);     // bending resistance
        if (iy + 2 < p.ny) link(idx(ix, iy), idx(ix, iy + 2), 0.25);
      }
      // a seam: the two side edges sewn together (a sleeve's underside)
      if (p.seam) for (let iy = 0; iy < p.ny; iy++) this.rest.push([idx(0, iy), idx(p.nx - 1, iy), p.seam, 1]);
    }

    // The same links as flat tables for the solver (a link between two pinned points does
    // nothing and is left out): ends, rest length, the share each end moves by, and whether
    // it only resists folding. And each point's own numbers, worked out once: where it is
    // in its patch, and the sines and cosines of its part of the flutter's phases (the
    // step then needs no sine of its own for a point: see _step).
    {
      const live = this.rest.filter((r) => !(this.pinned[r[0]] && this.pinned[r[1]])), m = live.length;
      this.cN = m; this.cA = new Uint16Array(m); this.cB = new Uint16Array(m); this.cLen = new Float64Array(m);
      this.cKa = new Float64Array(m); this.cKb = new Float64Array(m); this.cBend = new Uint8Array(m);
      live.forEach((r, c) => {
        const pa = this.pinned[r[0]] ? 0 : 1, pb = this.pinned[r[1]] ? 0 : 1, w = pa + pb;
        this.cA[c] = r[0] * 3; this.cB[c] = r[1] * 3; this.cLen[c] = r[2]; this.cBend[c] = r[3] < 0.5 ? 1 : 0;
        this.cKa[c] = 0.5 * r[3] * (pa * 2 / w); this.cKb[c] = 0.5 * r[3] * (pb * 2 / w);
      });
      this.pIx = new Uint8Array(n); this.pFv = new Float64Array(n); this.ph = new Float64Array(n * 8);
      this.maxNx = 0;
      for (let i = 0; i < n; i++) {
        const p = this.patches[this.owner[i]], li = i - p.base, ix = li % p.nx, iy = (li / p.nx) | 0;
        this.pIx[i] = ix; this.pFv[i] = iy / (p.ny - 1); this.maxNx = Math.max(this.maxNx, p.nx);
        const k = -iy * 0.9 + ix * 0.6, f = -iy * 0.75 + this.owner[i] * 1.7;
        this.ph.set([Math.sin(k), Math.cos(k), Math.sin(0.83 * k + 1.7), Math.cos(0.83 * k + 1.7), Math.sin(1.31 * k + 0.5), Math.cos(1.31 * k + 0.5), Math.sin(f), Math.cos(f)], i * 8);
      }
      this._sd = new Float64Array(this.maxNx); this._cd = new Float64Array(this.maxNx);
      // (what a patch's cloth is kept out of, as plain lists)
      for (const p of this.patches) { p.sph = new Float64Array(p.spheres.flat()); p.limbList = new Uint8Array(p.limbs); }
    }

    // The drawn mesh: every patch's fine grid in one geometry.
    const geo = new THREE.BufferGeometry(), indices = [];
    const col = new Float32Array(rn * 3), mat = new Float32Array(rn);
    this.fold = new Float32Array(rn);
    for (const p of this.patches) {
      const ri = (ix, iy) => p.rbase + iy * p.RX + ix;
      for (let iy = 0; iy < p.RY - 1; iy++) for (let ix = 0; ix < p.RX - 1; ix++) {
        const a = ri(ix, iy), b = a + 1, c = a + p.RX, d = c + 1;
        indices.push(a, b, c, b, d, c);       // both wound along the normals _draw writes (u x v), both ending on c (the cell's material: flat)
      }
      for (let iy = 0; iy < p.RY; iy++) for (let ix = 0; ix < p.RX; ix++) {
        const u = ix / (p.RX - 1), v = iy / (p.RY - 1), i = ri(ix, iy);
        this.fold[i] = p.folds(u, v);
        const c = p.paint(u, v)[0];
        // the inside of a fold a touch darker (it sees less of the sky and the Sun); which
        // way is in depends on which side of the patch its normal faces (p.out)
        const k = 1 - 0.12 * Math.min(1, v * 2.5) * Math.max(0, -p.out * Math.sign(this.fold[i])) * Math.min(1, Math.abs(this.fold[i]) * 60);
        col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
        // The material is per cell, not per point (between two points of different
        // materials the index would be a blend that names a third): each cell's material,
        // taken at its centre, is carried by the point both its triangles end on.
        mat[i] = iy >= 1 && ix < p.RX - 1 ? p.paint((ix + 0.5) / (p.RX - 1), (iy - 0.5) / (p.RY - 1))[1] : p.paint(u, v)[1];
      }
    }
    geo.setIndex(indices);
    this.positionAttr = new THREE.BufferAttribute(new Float32Array(rn * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.tanAttr = new THREE.BufferAttribute(new Float32Array(rn * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.positionAttr);
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(rn * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTan', this.tanAttr);
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 1));
    this.geometry = geo;
    this.triangles = indices.length / 3;
    this._row = new Float32Array(rn * 3); this._surf = new Float32Array(rn * 3);
    // The smooth surface through the particles, as tables worked out once: for each drawn
    // column (and row) the four simulated ones it lies between and their Catmull-Rom weights.
    const table = (nSim, sub, R) => {
      const idx = new Uint16Array(R * 4), w = new Float64Array(R * 4);
      for (let r = 0; r < R; r++) {
        const s0 = Math.min(nSim - 2, Math.floor(r / sub)), t = r / sub - s0, t2 = t * t, t3 = t2 * t;
        idx.set([Math.max(0, s0 - 1), s0, s0 + 1, Math.min(nSim - 1, s0 + 2)], r * 4);
        w.set([0.5 * (-t + 2 * t2 - t3), 0.5 * (2 - 5 * t2 + 3 * t3), 0.5 * (t + 4 * t2 - 3 * t3), 0.5 * (-t2 + t3)], r * 4);
      }
      return { idx, w };
    };
    for (const p of this.patches) { p.tx = table(p.nx, p.sx, p.RX); p.ty = table(p.ny, p.sy, p.RY); }
    this.reset(null);
  }

  // The pins of a patch pinned along a column (a sleeve), in the wearer's frame: `pts` holds
  // one point (x, y, z) per row.
  setPins(name, pts) {
    const p = this.patches.find((q) => q.name === name);
    if (!p || p.pins !== 'col') return;
    for (let iy = 0; iy < p.ny; iy++) { const o = (p.base + iy * p.nx + p.pinCol) * 3; this.pinLocal[o] = pts[iy * 3]; this.pinLocal[o + 1] = pts[iy * 3 + 1]; this.pinLocal[o + 2] = pts[iy * 3 + 2]; }
  }

  // rot: THREE.Matrix3 wearer-local -> world axes (or null for identity).
  reset(rot) {
    const e = rot ? rot.elements : [1, 0, 0, 0, 1, 0, 0, 0, 1], L = this.localRest, P = this.pinLocal;
    this.accum = 0;
    for (let i = 0; i < this.count; i++) {
      const p = this.patches[this.owner[i]];
      let x = L[i * 3], y = L[i * 3 + 1], z = L[i * 3 + 2];
      if (p.pins === 'col') {                       // a sleeve: each row starts at its pin on the arm as posed
        const k = (p.base + (((i - p.base) / p.nx) | 0) * p.nx + p.pinCol) * 3;
        x += P[k] - L[k]; y += P[k + 1] - L[k + 1]; z += P[k + 2] - L[k + 2];
      }
      this.pos[i * 3] = e[0] * x + e[3] * y + e[6] * z; this.pos[i * 3 + 1] = e[1] * x + e[4] * y + e[7] * z; this.pos[i * 3 + 2] = e[2] * x + e[5] * y + e[8] * z;
    }
    this.prev.set(this.pos);
    if (this.positionAttr) this._draw();
  }

  // dt seconds. rot: wearer-local -> world axes. gravity: world-axes vector (m/s^2).
  // accel: the wearer's acceleration (m/s^2, clamped by the caller). wind: air velocity
  // relative to the wearer (m/s, world axes). air: 0 (vacuum) .. 1 (dense air).
  // colliders: the limbs' capsules in the wearer's frame, 7 numbers each.
  // up, ground (optional): the ground as a plane, `ground` metres along the unit vector
  // `up` from the anchor (world axes): the cloth is kept above it.
  update(dt, rot, gravity, accel, wind, air, colliders = null, up = null, ground = null) {
    this.colliders = colliders; this.up = up; this.ground = ground;
    // halfRate (governor step): half the solver passes (the cloth hangs a little longer and
    // looser). The step itself stays: at twice the step the cloth stood still on three
    // frames in eight while the arms moved, and the sleeves came off them.
    const step = STEP;
    this.accum = Math.min(this.accum + dt, step * 4);
    let stepped = false;
    while (this.accum >= step) { this._step(rot, gravity, accel, wind, air, step); this.accum -= step; stepped = true; }
    if (!stepped) this._pin(rot);                 // (the pinned points follow the body on every frame)
    this._draw();
  }

  // The pinned points go where the body (and for the sleeves the arms) put them.
  _pin(rot) {
    const { pos, prev, pinned } = this, e = rot.elements, P = this.pinLocal;
    for (let i = 0; i < this.count; i++) {
      if (!pinned[i]) continue;
      const o = i * 3, x = P[o], y = P[o + 1], z = P[o + 2];
      pos[o] = e[0] * x + e[3] * y + e[6] * z; pos[o + 1] = e[1] * x + e[4] * y + e[7] * z; pos[o + 2] = e[2] * x + e[5] * y + e[8] * z;
      prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
    }
  }

  _step(rot, gravity, accel, wind, air, h) {
    const { pos, prev, restN, pinned, owner, ph, pIx, pFv } = this, e = rot.elements, n = this.count, h2 = h * h;
    const e0 = e[0], e1 = e[1], e2 = e[2], e3 = e[3], e4 = e[4], e5 = e[5], e6 = e[6], e7 = e[7], e8 = e[8];
    this.time += h;
    const t = this.time, wlen = Math.sqrt(wind.x * wind.x + wind.y * wind.y + wind.z * wind.z);
    const drag = 0.9 + 5.5 * air;                       // 1/s: how quickly cloth follows the air
    const damp = 0.992 - 0.01 * air;
    // Flutter: waves pushing along each piece's own normal that run down its length,
    // quicker and stronger with the flow (drag alone lines cloth up with the air into a
    // flat sheet, which seen from the side is a stick or a plank).
    const fl = (2.1 + 4.5 * air) * Math.min(2, wlen / 8), fw = Math.min(26, 4 + 0.9 * wlen);
    // (each point's phase is a part that only the time moves plus a part of its own, whose
    // sine and cosine are tables: sin(a + k) = sin a cos k + cos a sin k. Five sines a point
    // and step were a third of the cloth's cost.)
    const A = t * (5 + wlen * 0.5), sA = Math.sin(A), cA = Math.cos(A), sA2 = Math.sin(0.83 * A), cA2 = Math.cos(0.83 * A), sA3 = Math.sin(1.31 * A), cA3 = Math.cos(1.31 * A);
    const sT = Math.sin(t * fw), cT = Math.cos(t * fw), sd = this._sd, cd = this._cd;
    for (let ix = 0; ix < this.maxNx; ix++) { const d = 0.35 * Math.sin(ix * 0.9 + t * 1.3); sd[ix] = Math.sin(d); cd[ix] = Math.cos(d); }
    const gustK = (0.45 + 2.0 * air) * Math.min(1, wlen / 12 + 0.10);
    const fx = gravity.x - accel.x + wind.x * drag, fy = gravity.y - accel.y + wind.y * drag, fz = gravity.z - accel.z + wind.z * drag, ih = 1 / h;
    for (let i = 0; i < n; i++) {
      if (pinned[i]) continue;
      const o = i * 3, q = i * 8, fv = pFv[i], ix = pIx[i];
      const px = pos[o], py = pos[o + 1], pz = pos[o + 2], dx = px - prev[o], dy = py - prev[o + 1], dz = pz - prev[o + 2];
      // the rest normal in world axes
      const rx = restN[o], ry = restN[o + 1], rz = restN[o + 2];
      const bx = e0 * rx + e3 * ry + e6 * rz, by = e1 * rx + e4 * ry + e7 * rz, bz = e2 * rx + e5 * ry + e8 * rz;
      const gust = gustK * fv;
      const sTF = sT * ph[q + 7] + cT * ph[q + 6], cTF = cT * ph[q + 7] - sT * ph[q + 6];
      const flap = fl * fv * (sTF * cd[ix] + cTF * sd[ix]) * 6;
      const gx = (sA * ph[q + 1] + cA * ph[q]) * gust * 6 + bx * flap;
      const gy = (cA2 * ph[q + 3] - sA2 * ph[q + 2]) * gust * 4 + by * flap;
      const gz = (sA3 * ph[q + 5] + cA3 * ph[q + 4]) * gust * 6 + bz * flap;
      prev[o] = px; prev[o + 1] = py; prev[o + 2] = pz;
      pos[o] = px + dx * damp + (fx - dx * ih * drag + gx) * h2;
      pos[o + 1] = py + dy * damp + (fy - dy * ih * drag + gy) * h2;
      pos[o + 2] = pz + dz * damp + (fz - dz * ih * drag + gz) * h2;
    }
    this._pin(rot);
    const col = this.colliders, NIT = this.halfRate ? 2 : 4, up = this.up, ground = this.ground;
    const cN = this.cN, cA_ = this.cA, cB_ = this.cB, cLen = this.cLen, cKa = this.cKa, cKb = this.cKb, cBend = this.cBend;
    for (let it = 0; it < NIT; it++) {
      for (let c = 0; c < cN; c++) {
        const a = cA_[c], b = cB_[c];
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d2 = dx * dx + dy * dy + dz * dz, len = cLen[c];
        if (cBend[c] && d2 > len * len) continue;       // bend links only resist folding (asked before the root is taken: most of them are not folded)
        const d = Math.sqrt(d2) || 1e-6, k = (d - len) / d, ka = k * cKa[c], kb = k * cKb[c];
        pos[a] += dx * ka; pos[a + 1] += dy * ka; pos[a + 2] += dz * ka;
        pos[b] -= dx * kb; pos[b + 1] -= dy * kb; pos[b + 2] -= dz * kb;
      }
      // keep the cloth out of the body, the head and the limbs (in the wearer's frame);
      // on the last two passes only (half the cost, no visible difference)
      if (it < NIT - (NIT > 2 ? 2 : 1)) continue;
      const hasGround = !!up && ground != null, ux = up ? up.x : 0, uy = up ? up.y : 0, uz = up ? up.z : 0, floor = hasGround ? ground + 0.03 : 0;
      for (let i = 0; i < n; i++) {
        if (pinned[i]) continue;
        const p = this.patches[owner[i]], o = i * 3, px = pos[o], py = pos[o + 1], pz = pos[o + 2];
        let lx = e0 * px + e1 * py + e2 * pz, ly = e3 * px + e4 * py + e5 * pz, lz = e6 * px + e7 * py + e8 * pz;
        const x0 = lx, y0 = ly, z0 = lz;
        const B = p.body, cy = ly < B[0] ? B[0] : ly > B[1] ? B[1] : ly;
        let dx = lx, dy = ly - cy, dz = lz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < B[2] * B[2] && d2 > 1e-9) { const s = B[2] / Math.sqrt(d2) - 1; lx += dx * s; ly += dy * s; lz += dz * s; }
        const S = p.sph;
        for (let k = 0; k < S.length; k += 4) {
          dx = lx - S[k]; dy = ly - S[k + 1]; dz = lz - S[k + 2]; d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < S[k + 3] * S[k + 3] && d2 > 1e-9) { const s = S[k + 3] / Math.sqrt(d2) - 1; lx += dx * s; ly += dy * s; lz += dz * s; }
        }
        if (col) {
          const L = p.limbList;
          for (let k = 0; k < L.length; k++) {
            const c = L[k] * 7;
            const ax = col[c], ay = col[c + 1], az = col[c + 2], qx0 = col[c + 3] - ax, qy0 = col[c + 4] - ay, qz0 = col[c + 5] - az, r = col[c + 6];
            let tt = ((lx - ax) * qx0 + (ly - ay) * qy0 + (lz - az) * qz0) / (qx0 * qx0 + qy0 * qy0 + qz0 * qz0 + 1e-9);
            tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
            const qx = lx - (ax + qx0 * tt), qy = ly - (ay + qy0 * tt), qz = lz - (az + qz0 * tt), q2 = qx * qx + qy * qy + qz * qz;
            if (q2 < r * r && q2 > 1e-9) { const s = r / Math.sqrt(q2) - 1; lx += qx * s; ly += qy * s; lz += qz * s; }
          }
        }
        const ox = lx - x0, oy = ly - y0, oz = lz - z0;
        if (ox !== 0 || oy !== 0 || oz !== 0) {
          pos[o] += e0 * ox + e3 * oy + e6 * oz; pos[o + 1] += e1 * ox + e4 * oy + e7 * oz; pos[o + 2] += e2 * ox + e5 * oy + e8 * oz;
        }
        // and above the ground (3 cm: the drawn folds reach that far past the points)
        if (hasGround) {
          const s = floor - (pos[o] * ux + pos[o + 1] * uy + pos[o + 2] * uz);
          if (s > 0) { pos[o] += ux * s; pos[o + 1] += uy * s; pos[o + 2] += uz * s; }
        }
      }
    }
  }

  // The drawn surface of every patch from its particles. (Tables and plain loops: nothing
  // is made anew in here, it runs every frame.)
  _draw() {
    const P = this.pos, row = this._row, S = this._surf, out = this.positionAttr.array, tan = this.tanAttr.array, fold = this.fold;
    const nrm = this.geometry.attributes.normal.array;
    for (let pi = 0; pi < this.patches.length; pi++) {
      const p = this.patches[pi], nx = p.nx, ny = p.ny, RX = p.RX, RY = p.RY, base = p.base, rbase = p.rbase;
      const xi = p.tx.idx, xw = p.tx.w, yi = p.ty.idx, yw = p.ty.w;
      // across each simulated row
      for (let iy = 0; iy < ny; iy++) {
        const b = (base + iy * nx) * 3;
        for (let rx = 0; rx < RX; rx++) {
          const q = (rbase + iy * RX + rx) * 3, k = rx * 4;
          const a0 = b + xi[k] * 3, a1 = b + xi[k + 1] * 3, a2 = b + xi[k + 2] * 3, a3 = b + xi[k + 3] * 3, w0 = xw[k], w1 = xw[k + 1], w2 = xw[k + 2], w3 = xw[k + 3];
          row[q] = w0 * P[a0] + w1 * P[a1] + w2 * P[a2] + w3 * P[a3];
          row[q + 1] = w0 * P[a0 + 1] + w1 * P[a1 + 1] + w2 * P[a2 + 1] + w3 * P[a3 + 1];
          row[q + 2] = w0 * P[a0 + 2] + w1 * P[a1 + 2] + w2 * P[a2 + 2] + w3 * P[a3 + 2];
        }
      }
      // then down each drawn column
      for (let ry = 0; ry < RY; ry++) {
        const k = ry * 4, w0 = yw[k], w1 = yw[k + 1], w2 = yw[k + 2], w3 = yw[k + 3];
        const r0 = (rbase + yi[k] * RX) * 3, r1 = (rbase + yi[k + 1] * RX) * 3, r2 = (rbase + yi[k + 2] * RX) * 3, r3 = (rbase + yi[k + 3] * RX) * 3, q0 = (rbase + ry * RX) * 3;
        for (let j = 0; j < RX * 3; j++) S[q0 + j] = w0 * row[r0 + j] + w1 * row[r1 + j] + w2 * row[r2 + j] + w3 * row[r3 + j];
      }
      // folds along the normal; the tangent down the cloth (the hair's strands)
      for (let ry = 0; ry < RY; ry++) {
        const ra = (rbase + (ry > 0 ? ry - 1 : 0) * RX) * 3, rb = (rbase + (ry < RY - 1 ? ry + 1 : ry) * RX) * 3, r0 = (rbase + ry * RX) * 3;
        for (let rx = 0; rx < RX; rx++) {
          const o = r0 + rx * 3, xa = r0 + (rx > 0 ? rx - 1 : 0) * 3, xb = r0 + (rx < RX - 1 ? rx + 1 : rx) * 3, ya = ra + rx * 3, yb = rb + rx * 3;
          const ux = S[xb] - S[xa], uy = S[xb + 1] - S[xa + 1], uz = S[xb + 2] - S[xa + 2];
          const vx = S[yb] - S[ya], vy = S[yb + 1] - S[ya + 1], vz = S[yb + 2] - S[ya + 2];
          const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx;
          const l = Math.sqrt(nX * nX + nY * nY + nZ * nZ) || 1, d = fold[rbase + ry * RX + rx] / l, lv = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
          out[o] = S[o] + nX * d; out[o + 1] = S[o + 1] + nY * d; out[o + 2] = S[o + 2] + nZ * d;
          tan[o] = vx / lv; tan[o + 1] = vy / lv; tan[o + 2] = vz / lv;
        }
      }
      // normals of the folded surface, from each point's neighbours in its own grid (cheaper
      // than a general pass over the triangles)
      for (let ry = 0; ry < RY; ry++) {
        const ra = (rbase + (ry > 0 ? ry - 1 : 0) * RX) * 3, rb = (rbase + (ry < RY - 1 ? ry + 1 : ry) * RX) * 3, r0 = (rbase + ry * RX) * 3;
        for (let rx = 0; rx < RX; rx++) {
          const o = r0 + rx * 3, xa = r0 + (rx > 0 ? rx - 1 : 0) * 3, xb = r0 + (rx < RX - 1 ? rx + 1 : rx) * 3, ya = ra + rx * 3, yb = rb + rx * 3;
          const ux = out[xb] - out[xa], uy = out[xb + 1] - out[xa + 1], uz = out[xb + 2] - out[xa + 2];
          const vx = out[yb] - out[ya], vy = out[yb + 1] - out[ya + 1], vz = out[yb + 2] - out[ya + 2];
          const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx, l = Math.sqrt(nX * nX + nY * nY + nZ * nZ) || 1;
          nrm[o] = nX / l; nrm[o + 1] = nY / l; nrm[o + 2] = nZ / l;
        }
      }
    }
    this.positionAttr.needsUpdate = true; this.tanAttr.needsUpdate = true; this.geometry.attributes.normal.needsUpdate = true;
  }
}
