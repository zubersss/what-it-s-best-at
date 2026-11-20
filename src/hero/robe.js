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

const STEP = 1 / 75;

// Colours (linear) and materials shared with heroModel.js (see the material list there).
const SILK = [0.74, 0.74, 0.76], TRIM = [0.62, 0.63, 0.66];
const HAIR = [0.12, 0.008, 0.115], HAIR_DEEP = [0.05, 0.004, 0.05];
const M_SILK = 0, M_EMB = 3, M_HAIR = 5;

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
    name, nx, ny: 13, sx: 2, sy: 2, pins: 'row',
    rest: (u, v) => {
      const th = (th0 + u * (th1 - th0)) * D, r = 0.165 + 0.21 * v;
      return [r * Math.sin(th), 0.085 - v * 0.985, r * Math.cos(th) * 0.88];
    },
    normal: 'radial',
    body: [-0.30, 0.62, 0.15], spheres: [], limbs: [4, 5, 6, 7],
    folds: (u, v) => (0.004 + 0.024 * Math.pow(v, 0.8)) * Math.cos(9.0 * (th0 + u * (th1 - th0)) * D + 0.7 * Math.sin(u * 9 + v * 2)),
    paint: (u, v) => (v > 0.93 || u < 0.05 || u > 0.95 || (v > 0.80 && v < 0.84) ? [TRIM, M_EMB] : [SILK, M_SILK]),
  });
  // A wide sleeve: a sheet laid over the arm from the upper arm to the wrist, its middle
  // line fixed along the arm (Hero sets those pins every frame), both halves hanging down
  // round it and sewn together along the bottom, widening to a deep opening at the wrist.
  const sleeve = (s) => ({
    name: s > 0 ? 'sleeveL' : 'sleeveR', nx: 7, ny: 6, sx: 2, sy: 2, pins: 'col', pinCol: 3, seam: 0.03,
    rest: (u, v) => [s * 0.26, 0.40 - v * 0.52, (u - 0.5) * 2 * (0.10 + 0.32 * v)],
    normal: [s, 0, 0],
    body: [-0.30, 0.62, 0.155], spheres: [], limbs: s > 0 ? [0, 1, 4, 5, 6, 7] : [2, 3, 4, 5, 6, 7],
    folds: (u, v) => 0.012 * v * Math.cos(2 * Math.PI * 3.0 * u + 1.0),
    paint: (u, v) => (v > 0.88 ? [TRIM, M_EMB] : [SILK, M_SILK]),
  });
  // Long straight hair from the crown to the hips: three overlapping locks down the back,
  // each narrowing to its tip, so they part and stream on their own.
  const hair = (name, th0, th1, lift, len) => ({
    name, nx: 4, ny: 12, sx: 3, sy: 2, pins: 'row',
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

    // The drawn mesh: every patch's fine grid in one geometry.
    const geo = new THREE.BufferGeometry(), indices = [];
    const col = new Float32Array(rn * 3), mat = new Float32Array(rn);
    this.fold = new Float32Array(rn);
    for (const p of this.patches) {
      const ri = (ix, iy) => p.rbase + iy * p.RX + ix;
      for (let iy = 0; iy < p.RY - 1; iy++) for (let ix = 0; ix < p.RX - 1; ix++) {
        const a = ri(ix, iy), b = a + 1, c = a + p.RX, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      for (let iy = 0; iy < p.RY; iy++) for (let ix = 0; ix < p.RX; ix++) {
        const u = ix / (p.RX - 1), v = iy / (p.RY - 1), i = ri(ix, iy);
        this.fold[i] = p.folds(u, v);
        const [c, m] = p.paint(u, v);
        // the inside of a fold a touch darker (it sees less of the sky and the Sun)
        const k = 1 - 0.12 * Math.min(1, v * 2.5) * Math.max(0, -Math.sign(this.fold[i])) * Math.min(1, Math.abs(this.fold[i]) * 60);
        col.set([c[0] * k, c[1] * k, c[2] * k], i * 3); mat[i] = m;
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
    const e = rot ? rot.elements : [1, 0, 0, 0, 1, 0, 0, 0, 1], L = this.localRest;
    for (let i = 0; i < this.count; i++) {
      const x = L[i * 3], y = L[i * 3 + 1], z = L[i * 3 + 2];
      this.pos[i * 3] = e[0] * x + e[3] * y + e[6] * z; this.pos[i * 3 + 1] = e[1] * x + e[4] * y + e[7] * z; this.pos[i * 3 + 2] = e[2] * x + e[5] * y + e[8] * z;
    }
    this.prev.set(this.pos);
    if (this.positionAttr) this._draw();
  }

  // dt seconds. rot: wearer-local -> world axes. gravity: world-axes vector (m/s^2).
  // accel: the wearer's acceleration (m/s^2, clamped by the caller). wind: air velocity
  // relative to the wearer (m/s, world axes). air: 0 (vacuum) .. 1 (dense air).
  // colliders: the limbs' capsules in the wearer's frame, 7 numbers each.
  update(dt, rot, gravity, accel, wind, air, colliders = null) {
    this.colliders = colliders;
    // halfRate (governor step): every other simulation step is skipped; the cloth moves
    // a little more stiffly but costs half.
    const step = this.halfRate ? STEP * 2 : STEP;
    this.accum = Math.min(this.accum + dt, step * 4);
    while (this.accum >= step) { this._step(rot, gravity, accel, wind, air, step); this.accum -= step; }
    this._draw();
  }

  _step(rot, gravity, accel, wind, air, h) {
    const { pos, prev, restN, pinned, owner } = this, e = rot.elements, n = this.count, h2 = h * h;
    this.time += h;
    const t = this.time, wlen = Math.hypot(wind.x, wind.y, wind.z);
    const drag = 0.9 + 5.5 * air;                       // 1/s: how quickly cloth follows the air
    const damp = 0.992 - 0.01 * air;
    // Flutter: waves pushing along each piece's own normal that run down its length,
    // quicker and stronger with the flow (drag alone lines cloth up with the air into a
    // flat sheet, which seen from the side is a stick or a plank).
    const fl = (2.1 + 4.5 * air) * Math.min(2, wlen / 8), fw = Math.min(26, 4 + 0.9 * wlen);
    for (let i = 0; i < n; i++) {
      if (pinned[i]) continue;
      const p = this.patches[owner[i]], li = i - p.base, ix = li % p.nx, iy = (li / p.nx) | 0, fv = iy / (p.ny - 1);
      const o = i * 3;
      const vx = (pos[o] - prev[o]) / h, vy = (pos[o + 1] - prev[o + 1]) / h, vz = (pos[o + 2] - prev[o + 2]) / h;
      // the rest normal in world axes
      const rx = restN[o], ry = restN[o + 1], rz = restN[o + 2];
      const bx = e[0] * rx + e[3] * ry + e[6] * rz, by = e[1] * rx + e[4] * ry + e[7] * rz, bz = e[2] * rx + e[5] * ry + e[8] * rz;
      const ph = t * (5 + wlen * 0.5) - iy * 0.9 + ix * 0.6;
      const gust = (0.45 + 2.0 * air) * Math.min(1, wlen / 12 + 0.10) * fv;
      const flap = fl * fv * Math.sin(t * fw - iy * 0.75 + 0.35 * Math.sin(ix * 0.9 + t * 1.3) + owner[i] * 1.7);
      const gx = Math.sin(ph) * gust * 6 + bx * flap * 6;
      const gy = Math.cos(ph * 0.83 + 1.7) * gust * 4 + by * flap * 6;
      const gz = Math.sin(ph * 1.31 + 0.5) * gust * 6 + bz * flap * 6;
      const ax = gravity.x - accel.x + (wind.x - vx) * drag + gx;
      const ay = gravity.y - accel.y + (wind.y - vy) * drag + gy;
      const az = gravity.z - accel.z + (wind.z - vz) * drag + gz;
      const nx = pos[o] + (pos[o] - prev[o]) * damp + ax * h2;
      const ny = pos[o + 1] + (pos[o + 1] - prev[o + 1]) * damp + ay * h2;
      const nz = pos[o + 2] + (pos[o + 2] - prev[o + 2]) * damp + az * h2;
      prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
      pos[o] = nx; pos[o + 1] = ny; pos[o + 2] = nz;
    }
    // pins follow the body (and the arms, for the sleeves)
    const P = this.pinLocal;
    for (let i = 0; i < n; i++) {
      if (!pinned[i]) continue;
      const o = i * 3, x = P[o], y = P[o + 1], z = P[o + 2];
      pos[o] = e[0] * x + e[3] * y + e[6] * z; pos[o + 1] = e[1] * x + e[4] * y + e[7] * z; pos[o + 2] = e[2] * x + e[5] * y + e[8] * z;
      prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
    }
    const rest = this.rest, col = this.colliders;
    for (let it = 0; it < 4; it++) {
      for (let c = 0; c < rest.length; c++) {
        const r = rest[c], a = r[0] * 3, b = r[1] * 3;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        let k = (d - r[2]) / d * 0.5 * r[3];
        if (r[3] < 0.5 && d > r[2]) k = 0;              // bend links only resist folding
        const pa = pinned[r[0]] ? 0 : 1, pb = pinned[r[1]] ? 0 : 1, w = pa + pb;
        if (!w) continue;
        const ka = k * (pa * 2 / w), kb = k * (pb * 2 / w);
        pos[a] += dx * ka; pos[a + 1] += dy * ka; pos[a + 2] += dz * ka;
        pos[b] -= dx * kb; pos[b + 1] -= dy * kb; pos[b + 2] -= dz * kb;
      }
      // keep the cloth out of the body, the head and the limbs (in the wearer's frame);
      // on the last two passes only (half the cost, no visible difference)
      if (it < 2) continue;
      for (let i = 0; i < n; i++) {
        if (pinned[i]) continue;
        const p = this.patches[owner[i]], o = i * 3, px = pos[o], py = pos[o + 1], pz = pos[o + 2];
        let lx = e[0] * px + e[1] * py + e[2] * pz, ly = e[3] * px + e[4] * py + e[5] * pz, lz = e[6] * px + e[7] * py + e[8] * pz;
        const x0 = lx, y0 = ly, z0 = lz;
        const B = p.body, cy = ly < B[0] ? B[0] : ly > B[1] ? B[1] : ly;
        let dx = lx, dy = ly - cy, dz = lz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < B[2] * B[2] && d2 > 1e-9) { const s = B[2] / Math.sqrt(d2) - 1; lx += dx * s; ly += dy * s; lz += dz * s; }
        for (const S of p.spheres) {
          dx = lx - S[0]; dy = ly - S[1]; dz = lz - S[2]; d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < S[3] * S[3] && d2 > 1e-9) { const s = S[3] / Math.sqrt(d2) - 1; lx += dx * s; ly += dy * s; lz += dz * s; }
        }
        if (col) {
          for (const li of p.limbs) {
            const c = li * 7;
            const ax = col[c], ay = col[c + 1], az = col[c + 2], qx0 = col[c + 3] - ax, qy0 = col[c + 4] - ay, qz0 = col[c + 5] - az, r = col[c + 6];
            let tt = ((lx - ax) * qx0 + (ly - ay) * qy0 + (lz - az) * qz0) / (qx0 * qx0 + qy0 * qy0 + qz0 * qz0 + 1e-9);
            tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
            const qx = lx - (ax + qx0 * tt), qy = ly - (ay + qy0 * tt), qz = lz - (az + qz0 * tt), q2 = qx * qx + qy * qy + qz * qz;
            if (q2 < r * r && q2 > 1e-9) { const s = r / Math.sqrt(q2) - 1; lx += qx * s; ly += qy * s; lz += qz * s; }
          }
        }
        const ox = lx - x0, oy = ly - y0, oz = lz - z0;
        if (ox !== 0 || oy !== 0 || oz !== 0) {
          pos[o] += e[0] * ox + e[3] * oy + e[6] * oz; pos[o + 1] += e[1] * ox + e[4] * oy + e[7] * oz; pos[o + 2] += e[2] * ox + e[5] * oy + e[8] * oz;
        }
      }
    }
  }

  // The drawn surface of every patch from its particles.
  _draw() {
    const P = this.pos, row = this._row, S = this._surf, out = this.positionAttr.array, tan = this.tanAttr.array, fold = this.fold;
    const cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
    };
    for (const p of this.patches) {
      const { nx, ny, sx, sy, RX, RY, base, rbase } = p;
      // across each simulated row
      for (let iy = 0; iy < ny; iy++) for (let rx = 0; rx < RX; rx++) {
        const s0 = Math.min(nx - 2, Math.floor(rx / sx)), t = rx / sx - s0;
        const i0 = Math.max(0, s0 - 1), i1 = s0, i2 = s0 + 1, i3 = Math.min(nx - 1, s0 + 2);
        const q = (rbase + iy * RX + rx) * 3;
        for (let k = 0; k < 3; k++) row[q + k] = cr(P[(base + iy * nx + i0) * 3 + k], P[(base + iy * nx + i1) * 3 + k], P[(base + iy * nx + i2) * 3 + k], P[(base + iy * nx + i3) * 3 + k], t);
      }
      // then down each drawn column
      for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
        const s0 = Math.min(ny - 2, Math.floor(ry / sy)), t = ry / sy - s0;
        const j0 = Math.max(0, s0 - 1), j1 = s0, j2 = s0 + 1, j3 = Math.min(ny - 1, s0 + 2);
        const q = (rbase + ry * RX + rx) * 3, rq = (j) => (rbase + j * RX + rx) * 3;
        for (let k = 0; k < 3; k++) S[q + k] = cr(row[rq(j0) + k], row[rq(j1) + k], row[rq(j2) + k], row[rq(j3) + k], t);
      }
      // folds along the normal; the tangent down the cloth (the hair's strands)
      for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
        const i = rbase + ry * RX + rx, o = i * 3;
        const xa = (rbase + ry * RX + Math.max(0, rx - 1)) * 3, xb = (rbase + ry * RX + Math.min(RX - 1, rx + 1)) * 3;
        const ya = (rbase + Math.max(0, ry - 1) * RX + rx) * 3, yb = (rbase + Math.min(RY - 1, ry + 1) * RX + rx) * 3;
        const ux = S[xb] - S[xa], uy = S[xb + 1] - S[xa + 1], uz = S[xb + 2] - S[xa + 2];
        const vx = S[yb] - S[ya], vy = S[yb + 1] - S[ya + 1], vz = S[yb + 2] - S[ya + 2];
        const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx;
        const l = Math.hypot(nX, nY, nZ) || 1, d = fold[i] / l, lv = Math.hypot(vx, vy, vz) || 1;
        out[o] = S[o] + nX * d; out[o + 1] = S[o + 1] + nY * d; out[o + 2] = S[o + 2] + nZ * d;
        tan[o] = vx / lv; tan[o + 1] = vy / lv; tan[o + 2] = vz / lv;
      }
    }
    // normals of the folded surface, from each point's neighbours in its own grid (cheaper
    // than a general pass over the triangles)
    const nrm = this.geometry.attributes.normal.array;
    for (const p of this.patches) {
      const { RX, RY, rbase } = p;
      for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
        const o = (rbase + ry * RX + rx) * 3;
        const xa = (rbase + ry * RX + Math.max(0, rx - 1)) * 3, xb = (rbase + ry * RX + Math.min(RX - 1, rx + 1)) * 3;
        const ya = (rbase + Math.max(0, ry - 1) * RX + rx) * 3, yb = (rbase + Math.min(RY - 1, ry + 1) * RX + rx) * 3;
        const ux = out[xb] - out[xa], uy = out[xb + 1] - out[xa + 1], uz = out[xb + 2] - out[xa + 2];
        const vx = out[yb] - out[ya], vy = out[yb + 1] - out[ya + 1], vz = out[yb + 2] - out[ya + 2];
        const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx, l = Math.hypot(nX, nY, nZ) || 1;
        nrm[o] = nX / l; nrm[o + 1] = nY / l; nrm[o + 2] = nZ / l;
      }
    }
    this.positionAttr.needsUpdate = true; this.tanAttr.needsUpdate = true; this.geometry.attributes.normal.needsUpdate = true;
  }
}
