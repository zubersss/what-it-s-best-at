// The owner's rigged character (public/data/hero_rig.bin, made from the owner's Meshy file by
// scripts/make-hero-rig.mjs): a skeleton of 24 joints, a skinned surface, and eight clips of
// motion (Idle, Walk, Run, Sprint, Jump, Hover, Flight, Landing). This file is the skeleton
// and its motion as plain numbers: a clip read at a time, clips blended, the joints' places
// worked out, and the matrices the surface is drawn with. No three, no DOM: the game uses
// it (hero/heroRigMesh.js draws, hero/heroAnim.js chooses the clips) and so do the tools in
// Node (scripts/hero-rig-preview.mjs), by the same sums.
//
// A pose is 7 numbers a joint: where it is in its parent (x, y, z) and how it is turned (a
// quaternion x, y, z, w). The file's clips are read 30 times a second.

// q = a * b (quaternions as x, y, z, w at offsets)
function qmul(a, ao, b, bo, out, oo) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3], bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[oo] = aw * bx + ax * bw + ay * bz - az * by; out[oo + 1] = aw * by - ax * bz + ay * bw + az * bx; out[oo + 2] = aw * bz + ax * by - ay * bx + az * bw; out[oo + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

export class HeroRig {
  // file: what heroFile.js's parseHero gives for hero_rig.bin
  constructor(file) {
    this.names = file.joints; this.count = file.joints.length; this.parents = file.parents;
    this.rest = file.shared.rest;                 // 7 a joint
    this.inverseBind = file.shared.inverseBind;   // 16 a joint, column-major
    this.root = file.root;                        // 16: the skeleton's own frame to the figure's (hips at the origin, soles at -0.93 m)
    this.clips = {};
    for (const c of file.clips) this.clips[c.name] = { name: c.name, duration: c.duration, frames: c.frames, fps: c.fps, ground: c.ground, rot: file.shared['rot_' + c.name], pos: file.shared['pos_' + c.name] };
    const n = this.count;
    this.pose = new Float32Array(n * 7);          // the pose now (local)
    this.world = new Float32Array(n * 12);        // each joint in the skeleton's frame: 3 x 4, rows
    this._a = new Float32Array(n * 7); this._w = new Float32Array(n);
  }

  // A clip at a time (s) into out (7 a joint). loop: the time wraps; otherwise it stops at the ends.
  sample(name, time, out = this.pose, loop = true) {
    const c = this.clips[name], n = this.count, last = c.frames - 1;
    let f = time * c.fps;
    if (loop) { const span = c.duration * c.fps; f = ((f % span) + span) % span; } else f = Math.min(Math.max(f, 0), last);
    const i0 = Math.min(Math.floor(f), last), i1 = loop ? (i0 + 1 > last ? 0 : i0 + 1) : Math.min(i0 + 1, last), k = f - i0;
    for (let j = 0; j < n; j++) {
      const a = (i0 * n + j), b = (i1 * n + j), o = j * 7;
      for (let e = 0; e < 3; e++) out[o + e] = c.pos[a * 3 + e] * (1 - k) + c.pos[b * 3 + e] * k;
      let dot = 0; for (let e = 0; e < 4; e++) dot += c.rot[a * 4 + e] * c.rot[b * 4 + e];
      const s = dot < 0 ? -k : k; let x = 0, y = 0, z = 0, w = 0;
      x = c.rot[a * 4] * (1 - k) + c.rot[b * 4] * s; y = c.rot[a * 4 + 1] * (1 - k) + c.rot[b * 4 + 1] * s; z = c.rot[a * 4 + 2] * (1 - k) + c.rot[b * 4 + 2] * s; w = c.rot[a * 4 + 3] * (1 - k) + c.rot[b * 4 + 3] * s;
      const l = Math.hypot(x, y, z, w) || 1; out[o + 3] = x / l; out[o + 4] = y / l; out[o + 5] = z / l; out[o + 6] = w / l;
    }
    return out;
  }

  // Several clips at once: layers [{ name, time, weight, loop }] blended by weight into this.pose.
  blend(layers) {
    const n = this.count, P = this.pose, A = this._a; let total = 0, first = true;
    for (const L of layers) {
      if (!(L.weight > 1e-4)) continue;
      this.sample(L.name, L.time, A, L.loop !== false);
      if (first) { for (let i = 0; i < n * 7; i++) P[i] = A[i] * L.weight; first = false; total = L.weight; continue; }
      for (let j = 0; j < n; j++) {
        const o = j * 7; let dot = 0; for (let e = 3; e < 7; e++) dot += P[o + e] * A[o + e];
        const s = dot < 0 ? -L.weight : L.weight;
        for (let e = 0; e < 3; e++) P[o + e] += A[o + e] * L.weight;
        for (let e = 3; e < 7; e++) P[o + e] += A[o + e] * s;
      }
      total += L.weight;
    }
    if (first) { P.set(this.rest); return P; }
    for (let j = 0; j < n; j++) { const o = j * 7; for (let e = 0; e < 3; e++) P[o + e] /= total; const l = Math.hypot(P[o + 3], P[o + 4], P[o + 5], P[o + 6]) || 1; for (let e = 3; e < 7; e++) P[o + e] /= l; }
    return P;
  }

  // The joints' places from the pose (parents come before their children in the file).
  solve(pose = this.pose) {
    const n = this.count, W = this.world;
    for (let j = 0; j < n; j++) {
      const o = j * 7, x = pose[o + 3], y = pose[o + 4], z = pose[o + 5], w = pose[o + 6], m = j * 12;
      // local 3 x 4 from the turn and the place
      const l0 = 1 - 2 * (y * y + z * z), l1 = 2 * (x * y - z * w), l2 = 2 * (x * z + y * w), l3 = pose[o];
      const l4 = 2 * (x * y + z * w), l5 = 1 - 2 * (x * x + z * z), l6 = 2 * (y * z - x * w), l7 = pose[o + 1];
      const l8 = 2 * (x * z - y * w), l9 = 2 * (y * z + x * w), l10 = 1 - 2 * (x * x + y * y), l11 = pose[o + 2];
      const p = this.parents[j];
      if (p < 0) { W[m] = l0; W[m + 1] = l1; W[m + 2] = l2; W[m + 3] = l3; W[m + 4] = l4; W[m + 5] = l5; W[m + 6] = l6; W[m + 7] = l7; W[m + 8] = l8; W[m + 9] = l9; W[m + 10] = l10; W[m + 11] = l11; continue; }
      const q = p * 12;
      for (let r = 0; r < 3; r++) {
        const a = W[q + r * 4], b = W[q + r * 4 + 1], c = W[q + r * 4 + 2], d = W[q + r * 4 + 3];
        W[m + r * 4] = a * l0 + b * l4 + c * l8; W[m + r * 4 + 1] = a * l1 + b * l5 + c * l9; W[m + r * 4 + 2] = a * l2 + b * l6 + c * l10; W[m + r * 4 + 3] = a * l3 + b * l7 + c * l11 + d;
      }
    }
    return W;
  }

  // The matrices the surface is drawn with: 12 numbers a joint (3 x 4, rows), each taking a
  // vertex as the file holds it to where the joint carries it, in the figure's frame turned
  // and placed by `frame` (16 numbers, column-major: the body in its group; null: none).
  palette(out, frame = null) {
    const n = this.count, W = this.world, B = this.inverseBind, R = this.root, t = this._t || (this._t = new Float64Array(24));
    // (frame x root: 3 x 4, rows)
    const F = this._f || (this._f = new Float64Array(12));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      let v = 0;
      if (frame) { for (let k = 0; k < 3; k++) v += frame[k * 4 + r] * R[c * 4 + k]; if (c === 3) v += frame[12 + r]; } else v = R[c * 4 + r];
      F[r * 4 + c] = v;
    }
    for (let j = 0; j < n; j++) {
      const m = j * 12, b = j * 16;
      // t = world x inverseBind (3 x 4)
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) t[r * 4 + c] = W[m + r * 4] * B[b + c * 4] + W[m + r * 4 + 1] * B[b + c * 4 + 1] + W[m + r * 4 + 2] * B[b + c * 4 + 2] + (c === 3 ? W[m + r * 4 + 3] : 0);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) out[m + r * 4 + c] = F[r * 4] * t[c] + F[r * 4 + 1] * t[4 + c] + F[r * 4 + 2] * t[8 + c] + (c === 3 ? F[r * 4 + 3] : 0);
    }
    return out;
  }
}

// What hangs loose of the bones (the robe's skirt and sleeves, the hair) goes with the air:
// it trails down the air's flow past the figure and flutters, more the looser it hangs.
// p: a place as the skeleton put it (x, y, z; changed in place). k: how loose (0..1).
// flow: [x, y, z, time]: how far free cloth trails (m, the figure's group frame) and the clock.
// (the vertex shader of hero/heroRigMesh.js does the same sum)
export function flowed(p, k, flow) {
  if (!(k > 0)) return p;
  const fx = flow[0], fy = flow[1], fz = flow[2], t = flow[3], l = Math.hypot(fx, fy, fz), k2 = k * k;
  // (a wave running down the flow, and a slower one across it)
  const ph = (p[0] * fx + p[1] * fy + p[2] * fz) / (l + 0.05) * 9.0 - t * (4.0 + 9.0 * l), ph2 = p[0] * 5.3 + p[1] * 3.1 - p[2] * 4.7 + t * 1.9;
  const wave = 0.5 + 0.5 * Math.sin(ph) * (0.6 + 0.4 * Math.sin(ph2));
  const a = k2 * (0.55 + 0.45 * wave);
  p[0] += fx * a; p[1] += fy * a; p[2] += fz * a;
  const r = k2 * (0.012 + 0.05 * l) * Math.sin(ph2 + ph * 0.5);
  p[0] += r * 0.6; p[1] += r * 0.3; p[2] -= r * 0.7;
  return p;
}

// A surface moved by a palette, on the page's side of the GPU (the tools' pictures; the
// vertex shader of hero/heroRigMesh.js does the same sum). m: one of the file's meshes.
export function skinned(m, pal, flow = null) {
  const n = m.position.length / 3, P = m.position, N = m.normal, J = m.joints, Wt = m.weights, outP = new Float32Array(n * 3), outN = new Float32Array(n * 3);
  const ps = m.positionScale || 1, ns = m.normalScale || 1, ws = m.weightScale || 1, nstride = m.normal.length / n;
  for (let v = 0; v < n; v++) {
    const x = P[v * 3] * ps, y = P[v * 3 + 1] * ps, z = P[v * 3 + 2] * ps, nx = N[v * nstride] * ns, ny = N[v * nstride + 1] * ns, nz = N[v * nstride + 2] * ns;
    let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
    for (let k = 0; k < 4; k++) {
      const w = Wt[v * 4 + k] * ws; if (!w) continue; const o = J[v * 4 + k] * 12;
      px += w * (pal[o] * x + pal[o + 1] * y + pal[o + 2] * z + pal[o + 3]); py += w * (pal[o + 4] * x + pal[o + 5] * y + pal[o + 6] * z + pal[o + 7]); pz += w * (pal[o + 8] * x + pal[o + 9] * y + pal[o + 10] * z + pal[o + 11]);
      qx += w * (pal[o] * nx + pal[o + 1] * ny + pal[o + 2] * nz); qy += w * (pal[o + 4] * nx + pal[o + 5] * ny + pal[o + 6] * nz); qz += w * (pal[o + 8] * nx + pal[o + 9] * ny + pal[o + 10] * nz);
    }
    const l = Math.hypot(qx, qy, qz) || 1;
    if (flow && m.loose) { const q = flowed([px, py, pz], m.loose[v] / 255, flow); px = q[0]; py = q[1]; pz = q[2]; }
    outP[v * 3] = px; outP[v * 3 + 1] = py; outP[v * 3 + 2] = pz; outN[v * 3] = qx / l; outN[v * 3 + 1] = qy / l; outN[v * 3 + 2] = qz / l;
  }
  return { position: outP, normal: outN };
}
