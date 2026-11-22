// The trees' picture, drawn by rule (no outside artwork): sprays of foliage as cut-outs
// (a fir's hanging bough, a pine's burst of needles, twigs of leaves) and every tree
// shape seen whole from the side, for the trees far off. scripts/make-tree-atlas.mjs
// writes it to public/data/tree_atlas.png; scripts/tree-preview.mjs uses it as it is.
//
// Three numbers a pixel: how much of it is covered (the cut-out), a tone (each needle
// and leaf a little lighter or darker than its neighbours), and whether it is wood.
// Everything is drawn nine times too large and averaged down, so edges are soft enough
// to be cut cleanly at any size.
//
// Plain JavaScript with no canvas: it runs in Node.
import { ATLAS_W, ATLAS_H, SPRAY, SPRAY_COLS, SPRAYS, IMP_X0, IMP_W, IMP_H, IMP_HALF, IMP_TALL } from './treeAtlasLayout.js';

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const SS = 3;                       // drawn this many times too large each way

// A cell being drawn: coordinates 0..1, x to the right, y downward.
class Cell {
  constructor(size) { this.n = size * SS; this.size = size; this.cov = new Uint8Array(this.n * this.n); this.tone = new Float32Array(this.n * this.n); this.wood = new Uint8Array(this.n * this.n); this.xf = null; }
  // a convex polygon, filled
  poly(pts, tone, wood = 0) {
    const n = this.n, X = this.xf;
    const P = pts.map(([x, y]) => X ? [(X[0] * x + X[1] * y + X[4]) * n, (X[2] * x + X[3] * y + X[5]) * n] : [x * n, y * n]);
    let y0 = Infinity, y1 = -Infinity; for (const p of P) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y <= Math.min(n - 1, Math.floor(y1 - 0.5)); y++) {
      const yc = y + 0.5; let a = Infinity, b = -Infinity;
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length];
        if ((p[1] <= yc) === (q[1] <= yc)) continue;
        const x = p[0] + (q[0] - p[0]) * (yc - p[1]) / (q[1] - p[1]); if (x < a) a = x; if (x > b) b = x;
      }
      for (let x = Math.max(0, Math.ceil(a - 0.5)); x <= Math.min(n - 1, Math.floor(b - 0.5)); x++) { const i = y * n + x; this.cov[i] = 1; this.tone[i] = tone; this.wood[i] = wood; }
    }
  }
  // a twig: a tapering line
  line(x0, y0, x1, y1, w0, w1, tone = 0.5, wood = 1) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    this.poly([[x0 + nx * w0, y0 + ny * w0], [x1 + nx * w1, y1 + ny * w1], [x1 - nx * w1, y1 - ny * w1], [x0 - nx * w0, y0 - ny * w0]], tone, wood);
  }
  // a needle: a thin blade from a point, at an angle (radians, 0 = to the right, positive = downward)
  needle(x, y, a, len, w, tone) {
    const c = Math.cos(a), s = Math.sin(a);
    this.poly([[x - s * w, y + c * w], [x + c * len, y + s * len], [x + s * w, y - c * w]], tone);
  }
  // a leaf: from its stalk at a point, `len` long at an angle, `ratio` as wide as long, with a point
  leaf(x, y, a, len, ratio, tone) {
    const c = Math.cos(a), s = Math.sin(a), pts = [], N = 7;
    const w = (t) => 0.5 * ratio * len * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85);
    for (let k = 0; k <= N; k++) { const t = k / N; pts.push([x + c * len * t - s * w(t), y + s * len * t + c * w(t)]); }
    for (let k = N - 1; k >= 1; k--) { const t = k / N; pts.push([x + c * len * t + s * w(t), y + s * len * t - c * w(t)]); }
    this.poly(pts, tone);
  }
  // averaged down to its real size: { cov, tone, wood } as numbers 0..1
  down() {
    const s = this.size, n = this.n, cov = new Float32Array(s * s), tone = new Float32Array(s * s), wood = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      let c = 0, t = 0, w = 0;
      for (let b = 0; b < SS; b++) for (let a = 0; a < SS; a++) { const i = (y * SS + b) * n + x * SS + a; if (this.cov[i]) { c++; t += this.tone[i]; w += this.wood[i]; } }
      const o = y * s + x; cov[o] = c / (SS * SS); tone[o] = c ? t / c : 0; wood[o] = c ? w / c : 0;
    }
    return { cov, tone, wood, size: s };
  }
}

// A twig with needles down both sides, swept toward its tip and shorter toward it.
function needled(c, R, x0, y0, x1, y1, nlen, step, wide = 0.0065) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), dir = Math.atan2(dy, dx);
  c.line(x0, y0, x1, y1, 0.006, 0.0025, 0.5);
  for (let d = step * 0.5; d < l; d += step) {
    const t = d / l, x = x0 + dx * t, y = y0 + dy * t;
    for (const sd of [-1, 1]) c.needle(x, y, dir + sd * (0.85 + 0.35 * R()), nlen * (1 - 0.45 * t) * (0.75 + 0.5 * R()), wide, 0.6 + 0.4 * R());
  }
  c.needle(x1, y1, dir, nlen * 0.7, wide, 0.9);
}

// A fir's bough seen from the side: the branch along the top, sagging, its twigs hanging
// from it and forward, all needled. Root at the left, a fifth of the way down.
function fir(c, R) {
  const P = (t) => [0.02 + 0.95 * t, 0.2 + 0.24 * t * t];
  for (let t = 0.05; t < 0.94; t += 0.055 + 0.03 * R()) {
    const [x, y] = P(t), L = (0.52 * Math.pow(1 - t, 0.65) + 0.07) * (0.75 + 0.5 * R()), a = 0.95 + 0.45 * R();
    const ex = Math.min(0.975, x + Math.cos(a) * L), ey = Math.min(0.975, y + Math.sin(a) * L);
    needled(c, R, x, y, ex, ey, 0.045, 0.011);
    // (smaller twigs off the long ones, and a short one standing up from the branch)
    if (L > 0.22) for (let k = 0; k < 3; k++) { const u = 0.3 + 0.2 * k + 0.1 * R(), sx = x + (ex - x) * u, sy = y + (ey - y) * u, b = a + (k % 2 ? 0.7 : -0.7), l2 = L * 0.33 * (0.7 + 0.5 * R()); needled(c, R, sx, sy, Math.min(0.975, sx + Math.cos(b) * l2), Math.min(0.975, Math.max(0.02, sy + Math.sin(b) * l2)), 0.038, 0.012); }
    if (R() < 0.6) { const b = -(0.5 + 0.5 * R()), l2 = 0.05 + 0.07 * R(); needled(c, R, x, y, Math.min(0.975, x + Math.cos(b) * l2), Math.max(0.02, y + Math.sin(b) * l2), 0.035, 0.012); }
  }
  for (let k = 0; k < 12; k++) { const a = P(k / 12), b = P((k + 1) / 12); needled(c, R, a[0], a[1], b[0], b[1], 0.04, 0.012); }
}

// A bough seen from above or below: the branch down the middle, twigs to both sides.
function firTop(c, R, reach = 0.36, nlen = 0.045) {
  for (let t = 0.06; t < 0.93; t += 0.06 + 0.03 * R()) for (const sd of [-1, 1]) {
    const x = 0.02 + 0.95 * t, L = (reach * Math.pow(1 - t, 0.6) + 0.06) * (0.75 + 0.5 * R()), a = sd * (0.75 + 0.35 * R());
    needled(c, R, x, 0.5, Math.min(0.975, x + Math.cos(a) * L), Math.min(0.975, Math.max(0.025, 0.5 + Math.sin(a) * L)), nlen, 0.011);
  }
  needled(c, R, 0.02, 0.5, 0.97, 0.5, nlen, 0.011);
}

// A pine's bunch of needles: long ones standing out of a point every way but straight down.
function burst(c, R, n, spread, len) {
  c.line(0.5, 0.98, 0.5, 0.56, 0.012, 0.007, 0.5);
  for (let k = 0; k < n; k++) c.needle(0.5 + (R() - 0.5) * 0.04, 0.56 + (R() - 0.5) * 0.04, -1.5708 + (R() - 0.5) * 2 * spread, len * (0.7 + 0.45 * R()), 0.0085, 0.58 + 0.42 * R());
}

// A twig of leaves: side twigs to both sides, a leaf at every joint and at every end, in
// three tones. o: { leaf (length), ratio (width over length), step (between leaves), twigs, bare (how much twig shows) }
function leafy(c, R, o) {
  const tones = [0.6, 0.8, 1.0], leaves = [];
  const along = (x0, y0, x1, y1) => {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), dir = Math.atan2(dy, dx);
    c.line(x0, y0, x1, y1, 0.005, 0.002, 0.45);
    let sd = R() < 0.5 ? 1 : -1;
    for (let d = o.step * (0.4 + 0.4 * R()); d < l; d += o.step * (0.8 + 0.4 * R())) { const t = d / l; leaves.push([x0 + dx * t, y0 + dy * t, dir + sd * (0.65 + 0.5 * R()), o.leaf * (0.8 + 0.4 * R())]); sd = -sd; }
    leaves.push([x1, y1, dir + (R() - 0.5) * 0.4, o.leaf * (0.9 + 0.3 * R())]);
  };
  const bend = (R() - 0.5) * 0.16, P = (t) => [0.03 + 0.82 * t, 0.5 + bend * t * t];
  for (let k = 0; k < o.twigs; k++) {
    const t = 0.12 + 0.72 * (k + 0.5 * R()) / o.twigs, [x, y] = P(t), sd = k % 2 ? 1 : -1, a = sd * (0.6 + 0.4 * R()), L = (0.34 * (1 - 0.55 * t) + 0.05) * (0.75 + 0.5 * R());
    along(x, y, Math.min(0.93, x + Math.cos(a) * L), Math.min(0.93, Math.max(0.07, y + Math.sin(a) * L)));
  }
  for (let k = 0; k < 6; k++) { const a = P(k / 6), b = P((k + 1) / 6); along(a[0], a[1], b[0], b[1]); }
  // (leaves over the twigs; those whose point would leave the cell are left out)
  for (const [x, y, a, len] of leaves) { const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len; if (tx > 0.985 || tx < 0.015 || ty > 0.985 || ty < 0.015) continue; c.leaf(x, y, a, len, o.ratio, tones[Math.floor(R() * 3)]); }
}

// A fan of short needled twigs from the root: a juniper's or a sagebrush's tuft.
function tuft(c, R) {
  for (let k = 0; k < 9; k++) { const a = (k / 8 - 0.5) * 1.9 + (R() - 0.5) * 0.15, L = 0.5 + 0.38 * R() * Math.cos(a); needled(c, R, 0.03, 0.5, Math.min(0.97, 0.03 + Math.cos(a) * L), Math.min(0.97, Math.max(0.03, 0.5 + Math.sin(a) * L)), 0.03, 0.009, 0.0075); }
}

// A rosette: sprays laid round a middle (a crown seen from straight above).
function rosette(c, R, draw, n) {
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.2831853 + (R() - 0.5) * 0.3, s = 0.5 * (0.85 + 0.25 * R()), co = Math.cos(a) * s, si = Math.sin(a) * s;
    // (the spray's root, at (0.02, 0.5) of its own cell, goes to the middle)
    c.xf = [co, -si, si, co, 0.5 - (co * 0.02 - si * 0.5), 0.5 - (si * 0.02 + co * 0.5)];
    draw(c, R);
  }
  c.xf = null;
}

const DRAW = {
  fir: (c, R) => fir(c, R), firTop: (c, R) => firTop(c, R),
  pine: (c, R) => burst(c, R, 120, 2.0, 0.44), pine2: (c, R) => burst(c, R, 150, 2.5, 0.4),
  leaf: (c, R) => leafy(c, R, { leaf: 0.13, ratio: 0.55, step: 0.075, twigs: 6 }), leaf2: (c, R) => leafy(c, R, { leaf: 0.12, ratio: 0.62, step: 0.07, twigs: 7 }),
  aspen: (c, R) => leafy(c, R, { leaf: 0.095, ratio: 0.92, step: 0.1, twigs: 5 }),
  big: (c, R) => leafy(c, R, { leaf: 0.2, ratio: 0.42, step: 0.1, twigs: 5 }),
  fine: (c, R) => leafy(c, R, { leaf: 0.04, ratio: 0.5, step: 0.022, twigs: 11 }),
  tuft: (c, R) => tuft(c, R),
  roseN: (c, R) => rosette(c, R, (cc, RR) => firTop(cc, RR, 0.3, 0.05), 8), roseL: (c, R) => rosette(c, R, (cc, RR) => leafy(cc, RR, { leaf: 0.15, ratio: 0.6, step: 0.09, twigs: 5 }), 7),
};

// The sprays: returns the whole picture so far, { W, H, cov, tone, wood } (numbers 0..1).
export function makeSprays() {
  const A = { W: ATLAS_W, H: ATLAS_H, cov: new Float32Array(ATLAS_W * ATLAS_H), tone: new Float32Array(ATLAS_W * ATLAS_H), wood: new Float32Array(ATLAS_W * ATLAS_H) };
  for (const [name, i] of Object.entries(SPRAYS)) {
    const c = new Cell(SPRAY); DRAW[name](c, rng(1000 + i * 77));
    put(A, c.down(), (i % SPRAY_COLS) * SPRAY, Math.floor(i / SPRAY_COLS) * SPRAY);
  }
  return A;
}
function put(A, d, x0, y0, w = d.size, h = d.size) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y0 + y) * A.W + x0 + x, i = y * w + x; A.cov[o] = d.cov[i]; A.tone[o] = d.tone[i]; A.wood[o] = d.wood[i]; }
}

// The picture at a place (u, v in 0..1), blended between its four nearest pixels: [cover, tone, wood].
export function sampleAtlas(A, u, v) {
  const fx = Math.min(A.W - 1.001, Math.max(0, u * A.W - 0.5)), fy = Math.min(A.H - 1.001, Math.max(0, v * A.H - 0.5)), x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y;
  const i = y * A.W + x, w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], k = [i, i + 1, i + A.W, i + A.W + 1];
  let c = 0, t = 0, wd = 0;
  for (let j = 0; j < 4; j++) { const cv = A.cov[k[j]] * w[j]; c += cv; t += A.tone[k[j]] * cv; wd += A.wood[k[j]] * cv; }
  return [c, c > 0 ? t / c : 0, c > 0 ? wd / c : 0];
}

// Every tree shape seen whole from the side, drawn from its near mesh (with the sprays cut
// out as the game cuts them) into its cell. geos: makeTreeGeometries().
export function addImpostors(A, geos) {
  const W = IMP_W * SS, H = IMP_H * SS;
  geos.forEach((variants, arch) => variants.forEach((lods, v) => {
    const g = lods[1], P = g.attributes.position.array, U = g.attributes.aUv.array, L = g.attributes.aLeaf.array, n = P.length / 9;
    const cov = new Uint8Array(W * H), tone = new Float32Array(W * H), wood = new Uint8Array(W * H), zb = new Float32Array(W * H).fill(-1e9);
    const px = (x) => (x / (2 * IMP_HALF) + 0.5) * W, py = (y) => (1 - y / IMP_TALL) * H;
    for (let t = 0; t < n; t++) {
      const o = t * 9, a = [px(P[o]), py(P[o + 1]), P[o + 2]], b = [px(P[o + 3]), py(P[o + 4]), P[o + 5]], c = [px(P[o + 6]), py(P[o + 7]), P[o + 8]];
      const ua = [U[t * 6], U[t * 6 + 1]], ub = [U[t * 6 + 2], U[t * 6 + 3]], uc = [U[t * 6 + 4], U[t * 6 + 5]], leaf = L[t * 3], card = ua[0] >= 0;
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(den) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0]))), y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const qx = x + 0.5, qy = y + 0.5, u = ((b[1] - c[1]) * (qx - c[0]) + (c[0] - b[0]) * (qy - c[1])) / den, w = ((c[1] - a[1]) * (qx - c[0]) + (a[0] - c[0]) * (qy - c[1])) / den, r = 1 - u - w;
        if (u < 0 || w < 0 || r < 0) continue;
        const z = u * a[2] + w * b[2] + r * c[2], i = y * W + x; if (z <= zb[i]) continue;
        let tn = leaf < 0.5 ? 0.8 : 0.85, wd = leaf < 0.5 ? 1 : 0;
        if (card) { const s = sampleAtlas(A, u * ua[0] + w * ub[0] + r * uc[0], u * ua[1] + w * ub[1] + r * uc[1]); if (s[0] < 0.42) continue; tn = s[1]; wd = s[2] > 0.5 ? 1 : 0; }
        // (what is nearer the eye a little lighter: the tree keeps some depth when it is flat)
        zb[i] = z; cov[i] = 1; tone[i] = tn * (0.82 + 0.18 * Math.min(1, Math.max(0, z / 0.3 * 0.5 + 0.5))); wood[i] = wd;
      }
    }
    const d = { size: 0, cov: new Float32Array(IMP_W * IMP_H), tone: new Float32Array(IMP_W * IMP_H), wood: new Float32Array(IMP_W * IMP_H) };
    for (let y = 0; y < IMP_H; y++) for (let x = 0; x < IMP_W; x++) {
      let c = 0, t = 0, w = 0;
      for (let bb = 0; bb < SS; bb++) for (let aa = 0; aa < SS; aa++) { const i = (y * SS + bb) * W + x * SS + aa; if (cov[i]) { c++; t += tone[i]; w += wood[i]; } }
      const o = y * IMP_W + x; d.cov[o] = c / (SS * SS); d.tone[o] = c ? t / c : 0; d.wood[o] = c ? w / c : 0;
    }
    put(A, d, IMP_X0 + arch * IMP_W, v * IMP_H, IMP_W, IMP_H);
  }));
  return A;
}

// The picture as bytes, three a pixel: cover, tone, wood. Where nothing is drawn the tone
// is that of what is drawn nearest (so a blended edge is never darker than the leaf).
export function atlasBytes(A) {
  const { W, H } = A, out = new Uint8Array(W * H * 3), tone = Float32Array.from(A.tone), has = Uint8Array.from(A.cov, (c) => (c > 0 ? 1 : 0));
  for (let pass = 0; pass < 6; pass++) {
    const t2 = Float32Array.from(tone), h2 = Uint8Array.from(has);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (has[i]) continue;
      let s = 0, k = 0; for (const j of [i - 1, i + 1, i - W, i + W]) if (has[j]) { s += tone[j]; k++; }
      if (k) { t2[i] = s / k; h2[i] = 1; }
    }
    tone.set(t2); has.set(h2);
  }
  for (let i = 0; i < W * H; i++) { out[i * 3] = Math.round(A.cov[i] * 255); out[i * 3 + 1] = Math.round((has[i] ? tone[i] : 0.8) * 255); out[i * 3 + 2] = Math.round(A.wood[i] * 255); }
  return out;
}
