// The cloak: a small mass–spring cloth pinned along the shoulders. It reacts to gravity,
// to the wearer's acceleration (inertia), to air streaming past in flight and to gusts.
// Simulated on the CPU (a 9 x 14 grid) in the wearer's own axes-aligned, anchor-relative
// frame, so planet-scale coordinates and interplanetary speeds never touch it.
import * as THREE from 'three';

const NX = 9, NY = 14;
const LENGTH = 1.08, TOP_WIDTH = 0.44, BOTTOM_WIDTH = 0.80;
const STEP = 1 / 90;
// The drawn cloth is finer than the simulated one: a smooth surface through the simulated
// points (Catmull-Rom across and down), with folds that fan from the shoulders and deepen
// toward the hem pressed into it along its own normal. Drawn straight from the 9 x 14
// grid it read as a board: three folds on nine points do not show.
const SX = 3, SY = 2;                                   // drawn points per simulated span
const RX = (NX - 1) * SX + 1, RY = (NY - 1) * SY + 1;
const FOLDS = 4.5;                                      // folds across the cloak

export class Cloak {
  constructor() {
    const n = NX * NY;
    this.pos = new Float32Array(n * 3);       // relative to the wearer's anchor, world axes
    this.prev = new Float32Array(n * 3);
    this.pin = new Float32Array(NX * 3);      // pin positions in the wearer's local frame
    this.rest = [];                           // constraints: [i, j, restLength, stiffness]
    this.time = 0; this.accum = 0;
    const local = (ix, iy, out) => {
      const u = ix / (NX - 1) - 0.5, v = iy / (NY - 1);
      const w = TOP_WIDTH + (BOTTOM_WIDTH - TOP_WIDTH) * v;
      // hangs down the back (−z is the wearer's back), slightly away from the body
      // gathered at the shoulders: three soft vertical folds that deepen toward the hem
      out[0] = u * w * (1 - 0.10 * v); out[1] = 0.60 - v * LENGTH; out[2] = -0.19 - 0.05 * v - 0.06 * (1 - 4 * u * u) * Math.min(1, v * 3) + 0.045 * v * Math.cos(u * Math.PI * 6);
      return out;
    };
    const t = [0, 0, 0], idx = (ix, iy) => iy * NX + ix;
    this.localRest = new Float32Array(n * 3);
    for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
      local(ix, iy, t); this.localRest.set(t, idx(ix, iy) * 3);
      if (iy === 0) this.pin.set(t, ix * 3);
    }
    const dist = (a, b) => Math.hypot(this.localRest[a * 3] - this.localRest[b * 3], this.localRest[a * 3 + 1] - this.localRest[b * 3 + 1], this.localRest[a * 3 + 2] - this.localRest[b * 3 + 2]);
    const link = (a, b, k) => this.rest.push([a, b, dist(a, b), k]);
    for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
      if (ix + 1 < NX) link(idx(ix, iy), idx(ix + 1, iy), 1);
      if (iy + 1 < NY) link(idx(ix, iy), idx(ix, iy + 1), 1);
      if (ix + 1 < NX && iy + 1 < NY) { link(idx(ix, iy), idx(ix + 1, iy + 1), 0.6); link(idx(ix + 1, iy), idx(ix, iy + 1), 0.6); }
      if (ix + 2 < NX) link(idx(ix, iy), idx(ix + 2, iy), 0.25);     // bending resistance
      if (iy + 2 < NY) link(idx(ix, iy), idx(ix, iy + 2), 0.25);
    }

    // Render mesh (positions are written every frame), RX x RY points.
    const geo = new THREE.BufferGeometry();
    const indices = [], rn = RX * RY, ridx = (ix, iy) => iy * RX + ix;
    for (let iy = 0; iy < RY - 1; iy++) for (let ix = 0; ix < RX - 1; ix++) {
      const a = ridx(ix, iy), b = a + 1, c = a + RX, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    geo.setIndex(indices);
    this.positionAttr = new THREE.BufferAttribute(new Float32Array(rn * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.positionAttr);
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(rn * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(rn).fill(2), 1));
    // the folds: depth (m) at each drawn point, and the colour a touch darker deep in a
    // fold (its inside sees less of the sky and the Sun)
    this.fold = new Float32Array(rn);
    const col = new Float32Array(rn * 3);
    for (let iy = 0; iy < RY; iy++) for (let ix = 0; ix < RX; ix++) {
      const u = ix / (RX - 1), v = iy / (RY - 1);
      const ph = 2 * Math.PI * (FOLDS * u + 0.15 * Math.sin(u * 7.0 + v * 2.0));
      const f = Math.cos(ph);
      this.fold[ridx(ix, iy)] = (0.006 + 0.028 * Math.pow(v, 0.8)) * f * (0.75 + 0.25 * Math.sin(u * 11.0 + 1.3));
      const k = (0.94 + 0.06 * Math.cos(ix * 0.9) * Math.cos(iy * 0.5)) * (1 - 0.14 * Math.min(1, v * 2.5) * Math.max(0, -f));
      col.set([0.20 * k, 0.026 * k, 0.024 * k], ridx(ix, iy) * 3);        // deep, muted crimson
    }
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    this._row = new Float32Array(NY * RX * 3);          // scratch: rows smoothed across
    this._surf = new Float32Array(rn * 3);              // scratch: the smooth surface
    this.geometry = geo;
    this.triangles = indices.length / 3;
    this._m = new THREE.Matrix3();
    this.reset(null);
  }

  // rot: THREE.Matrix3 mapping wearer-local -> world axes (or null for identity).
  reset(rot) {
    const e = rot ? rot.elements : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let i = 0; i < NX * NY; i++) {
      const x = this.localRest[i * 3], y = this.localRest[i * 3 + 1], z = this.localRest[i * 3 + 2];
      this.pos[i * 3] = e[0] * x + e[3] * y + e[6] * z; this.pos[i * 3 + 1] = e[1] * x + e[4] * y + e[7] * z; this.pos[i * 3 + 2] = e[2] * x + e[5] * y + e[8] * z;
    }
    this.prev.set(this.pos);
    if (this.positionAttr) this._draw();
  }

  // dt seconds. rot: wearer-local -> world axes. gravity: world-axes vector (m/s^2).
  // accel: wearer's acceleration (m/s^2, clamped by the caller). wind: air velocity
  // relative to the wearer (m/s). air: 0 (vacuum) .. 1 (dense air) — how hard it pushes.
  // colliders (optional): capsules of the wearer's limbs in its own frame, 7 numbers each
  // (ax, ay, az, bx, by, bz, radius); the cloth is kept outside them as well as the torso.
  update(dt, rot, gravity, accel, wind, air, colliders = null) {
    this.colliders = colliders;
    // halfRate (governor step): every other simulation step is skipped; the cloth moves
    // a little more stiffly but costs half.
    const step = this.halfRate ? STEP * 2 : STEP;
    this.accum = Math.min(this.accum + dt, step * 4);
    while (this.accum >= step) { this._step(rot, gravity, accel, wind, air, step); this.accum -= step; }
    this._draw();
  }

  // The drawn surface from the simulated points (see RX, RY above).
  _draw() {
    const P = this.pos, row = this._row, S = this._surf, out = this.positionAttr.array, fold = this.fold;
    const cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
    };
    // across each simulated row
    for (let iy = 0; iy < NY; iy++) for (let rx = 0; rx < RX; rx++) {
      const sx = Math.min(NX - 2, Math.floor(rx / SX)), t = rx / SX - sx;
      const i0 = Math.max(0, sx - 1), i1 = sx, i2 = sx + 1, i3 = Math.min(NX - 1, sx + 2);
      for (let k = 0; k < 3; k++) {
        row[(iy * RX + rx) * 3 + k] = cr(P[(iy * NX + i0) * 3 + k], P[(iy * NX + i1) * 3 + k], P[(iy * NX + i2) * 3 + k], P[(iy * NX + i3) * 3 + k], t);
      }
    }
    // then down each drawn column
    for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
      const sy = Math.min(NY - 2, Math.floor(ry / SY)), t = ry / SY - sy;
      const j0 = Math.max(0, sy - 1), j1 = sy, j2 = sy + 1, j3 = Math.min(NY - 1, sy + 2);
      for (let k = 0; k < 3; k++) {
        S[(ry * RX + rx) * 3 + k] = cr(row[(j0 * RX + rx) * 3 + k], row[(j1 * RX + rx) * 3 + k], row[(j2 * RX + rx) * 3 + k], row[(j3 * RX + rx) * 3 + k], t);
      }
    }
    // folds pressed in along the surface's normal
    for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
      const i = ry * RX + rx, o = i * 3;
      const xa = (ry * RX + Math.max(0, rx - 1)) * 3, xb = (ry * RX + Math.min(RX - 1, rx + 1)) * 3;
      const ya = (Math.max(0, ry - 1) * RX + rx) * 3, yb = (Math.min(RY - 1, ry + 1) * RX + rx) * 3;
      const ux = S[xb] - S[xa], uy = S[xb + 1] - S[xa + 1], uz = S[xb + 2] - S[xa + 2];
      const vx = S[yb] - S[ya], vy = S[yb + 1] - S[ya + 1], vz = S[yb + 2] - S[ya + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1, d = fold[i] / l;
      out[o] = S[o] + nx * d; out[o + 1] = S[o + 1] + ny * d; out[o + 2] = S[o + 2] + nz * d;
    }
    this.positionAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  _step(rot, gravity, accel, wind, air, h) {
    const { pos, prev } = this, e = rot.elements, n = NX * NY, h2 = h * h;
    this.time += h;
    const t = this.time;
    const wlen = Math.hypot(wind.x, wind.y, wind.z);
    const drag = 0.9 + 5.5 * air;                       // 1/s: how quickly cloth follows the air
    const damp = 0.992 - 0.01 * air;
    // Flag flutter: waves pushing along the cloak's own normal (the wearer's back, local z)
    // that run down its length, quicker and stronger with the flow. Drag alone lines the
    // cloth up with the air into a flat sheet, which seen from the side was a stick or a plank.
    const fl = (1.4 + 3.0 * air) * Math.min(2, wlen / 8), fw = Math.min(26, 4 + 0.9 * wlen);     // (up to twice as strong in a fast stream, or it is pulled flat)
    const bx = e[6], by = e[7], bz = e[8], sx = e[0], sy = e[1], sz = e[2];
    // forces
    for (let i = NX; i < n; i++) {
      const o = i * 3, ix = i % NX, iy = (i / NX) | 0;
      const vx = (pos[o] - prev[o]) / h, vy = (pos[o + 1] - prev[o + 1]) / h, vz = (pos[o + 2] - prev[o + 2]) / h;
      // travelling ripples: stronger with speed and with real air
      const ph = t * (5 + wlen * 0.5) - iy * 0.9 + ix * 0.6;
      const gust = (0.45 + 2.0 * air) * Math.min(1, wlen / 12 + 0.10) * (iy / NY);
      const flap = fl * (iy / NY) * Math.sin(t * fw - iy * 0.75 + 0.35 * Math.sin(ix * 0.9 + t * 1.3));
      const twist = 0.35 * fl * (iy / NY) * Math.sin(t * fw * 0.6 - iy * 0.5 + 1.1) * (ix / (NX - 1) - 0.5);
      const gx = Math.sin(ph) * gust * 6 + bx * flap * 6 + sx * twist * 6;
      const gy = Math.cos(ph * 0.83 + 1.7) * gust * 4 + by * flap * 6 + sy * twist * 6;
      const gz = Math.sin(ph * 1.31 + 0.5) * gust * 6 + bz * flap * 6 + sz * twist * 6;
      const ax = gravity.x - accel.x + (wind.x - vx) * drag + gx;
      const ay = gravity.y - accel.y + (wind.y - vy) * drag + gy;
      const az = gravity.z - accel.z + (wind.z - vz) * drag + gz;
      const nx = pos[o] + (pos[o] - prev[o]) * damp + ax * h2;
      const ny = pos[o + 1] + (pos[o + 1] - prev[o + 1]) * damp + ay * h2;
      const nz = pos[o + 2] + (pos[o + 2] - prev[o + 2]) * damp + az * h2;
      prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
      pos[o] = nx; pos[o + 1] = ny; pos[o + 2] = nz;
    }
    // pins follow the shoulders
    for (let ix = 0; ix < NX; ix++) {
      const x = this.pin[ix * 3], y = this.pin[ix * 3 + 1], z = this.pin[ix * 3 + 2], o = ix * 3;
      pos[o] = e[0] * x + e[3] * y + e[6] * z; pos[o + 1] = e[1] * x + e[4] * y + e[7] * z; pos[o + 2] = e[2] * x + e[5] * y + e[8] * z;
      prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
    }
    // constraints
    const rest = this.rest;
    for (let it = 0; it < 4; it++) {
      for (let c = 0; c < rest.length; c++) {
        const r = rest[c], a = r[0] * 3, b = r[1] * 3;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        let k = (d - r[2]) / d * 0.5 * r[3];
        if (r[3] < 0.5 && d > r[2]) k = 0;              // bend links only resist folding
        const pa = r[0] < NX ? 0 : 1, pb = r[1] < NX ? 0 : 1, w = pa + pb;
        if (!w) continue;
        const ka = k * (pa * 2 / w), kb = k * (pb * 2 / w);
        pos[a] += dx * ka; pos[a + 1] += dy * ka; pos[a + 2] += dz * ka;
        pos[b] -= dx * kb; pos[b + 1] -= dy * kb; pos[b + 2] -= dz * kb;
      }
      // keep the cloth outside the body: a capsule along the wearer's spine, in local space
      for (let i = NX; i < n; i++) {
        const o = i * 3, px = pos[o], py = pos[o + 1], pz = pos[o + 2];
        const lx = e[0] * px + e[1] * py + e[2] * pz, ly = e[3] * px + e[4] * py + e[5] * pz, lz = e[6] * px + e[7] * py + e[8] * pz;
        const cy = ly < -0.95 ? -0.95 : ly > 0.62 ? 0.62 : ly;
        const dx = lx, dy = ly - cy, dz = lz, d2 = dx * dx + dy * dy + dz * dz;
        const R = ly > 0.0 ? 0.255 : 0.215;          // (round the pack above the hips, the suit below)
        let ox = 0, oy = 0, oz = 0;
        if (d2 < R * R && d2 > 1e-9) { const s = R / Math.sqrt(d2) - 1; ox = dx * s; oy = dy * s; oz = dz * s; }
        // arms and legs: closest point on each capsule's axis, pushed out to its radius
        const col = this.colliders;
        if (col) {
          for (let c = 0; c < col.length; c += 7) {
            const px2 = lx + ox, py2 = ly + oy, pz2 = lz + oz;
            const ax = col[c], ay = col[c + 1], az = col[c + 2], bx = col[c + 3] - ax, by = col[c + 4] - ay, bz = col[c + 5] - az, r = col[c + 6];
            let t = ((px2 - ax) * bx + (py2 - ay) * by + (pz2 - az) * bz) / (bx * bx + by * by + bz * bz + 1e-9);
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = px2 - (ax + bx * t), qy = py2 - (ay + by * t), qz = pz2 - (az + bz * t), q2 = qx * qx + qy * qy + qz * qz;
            if (q2 < r * r && q2 > 1e-9) { const s = r / Math.sqrt(q2) - 1; ox += qx * s; oy += qy * s; oz += qz * s; }
          }
        }
        if (ox !== 0 || oy !== 0 || oz !== 0) {
          pos[o] += e[0] * ox + e[3] * oy + e[6] * oz; pos[o + 1] += e[1] * ox + e[4] * oy + e[7] * oz; pos[o + 2] += e[2] * ox + e[5] * oy + e[8] * oz;
        }
      }
    }
  }
}
