// The far forest's trees seen from above, sketched without a browser in seconds: a patch of
// wood (closed on the left, a scatter of lone trees on the right) at three distances, each
// looked down on at four angles. For working on the far tree's forms (life/farTreeForm.js:
// the rule is read from there; the light and colours here are a sketch, not the game's).
//   node scripts/far-tree-above.mjs [--out file.png] [--dist 450,1200,3000] [--down 15,35,60,90] [--sun 25] [--old] [--scale 1.5]
// --old: as it was before the top form (rosette of the crown's own width, both pictures upright, no shadow).
// --sun: the Sun's height in degrees (it stands in the west, on the left).
import fs from 'node:fs';
import { makeTreeGeometries } from '../src/life/treeGeometry.js';
import { makeSprays, addImpostors, sampleAtlas } from '../src/life/treeAtlasGen.js';
import { widths, shadowAlpha, SHADOW_LONG } from '../src/life/farTreeForm.js';
import { png } from './lib/png.mjs';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = opt('out', 'far-tree-above.png'), old = args.includes('--old'), S = +opt('scale', 1.5);
const DIST = opt('dist', '450,1200,3000').split(',').map(Number), DOWN = opt('down', '15,35,60,90').split(',').map(Number);
const sunEl = +opt('sun', 25) * Math.PI / 180, SUN = [-Math.cos(sunEl), Math.sin(sunEl), 0];      // (x east, y up, z north)
const FULL = 450, PATCH = 220, CW = Math.round(PATCH * S), CH = Math.round(PATCH * S * 0.8);

const geos = makeTreeGeometries(), ATLAS = addImpostors(makeSprays(), geos);
// where each shape's pictures are, read off its far mesh as life/farForest.js reads them
const cellOf = (a, v) => {
  const g = geos[a][v][2], P = g.attributes.position.array, U = g.attributes.aUv.array;
  const box = (from, to) => { let u0 = 1, v0 = 1, u1 = 0, v1 = 0; for (let i = from; i < to; i++) { u0 = Math.min(u0, U[i * 2]); u1 = Math.max(u1, U[i * 2]); v0 = Math.min(v0, U[i * 2 + 1]); v1 = Math.max(v1, U[i * 2 + 1]); } return [u0, v0, u1, v1]; };
  let r = 0, hw = 0, tall = 0;
  for (let i = 12; i < 18; i++) r = Math.max(r, Math.abs(P[i * 3]));
  for (let i = 0; i < 6; i++) { hw = Math.max(hw, Math.hypot(P[i * 3], P[i * 3 + 2])); tall = Math.max(tall, P[i * 3 + 1]); }
  return { tree: box(0, 6), rose: box(12, 18), r, y: P[12 * 3 + 1], hw, tall, mid: g.userData.mid ?? 0.6 };
};
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// the patch: a site every 7 m; closed wood west of the middle, a scatter east of it
const TREES = [];
for (let z = -PATCH / 2 - 40; z < PATCH / 2 + 40; z += 7) for (let x = -PATCH / 2 - 40; x < PATCH / 2 + 40; x += 7) {
  const dens = x < 10 ? 1 : 0.06, u = rnd(), a = [0, 0, 2, 1][Math.floor(rnd() * 4)], v = Math.floor(rnd() * 3), rank = rnd(), h = (a === 2 ? 17 : 24) * (0.72 + 0.5 * rnd()), wide = (a === 2 ? 1 : 0.8) * (0.85 + 0.35 * rnd()), turn = rnd() * 6.28, jx = rnd(), jz = rnd();
  if (u < dens) TREES.push({ x: x + 7 * (0.15 + 0.7 * jx), z: z + 7 * (0.15 + 0.7 * jz), h, wide, turn, rank, dens, cell: cellOf(a, v), tone: 0.8 + 0.4 * rnd() });
}

const W = CW * DIST.length, H = CH * DOWN.length, img = new Float32Array(W * H * 3);
function cellDraw(ox, oy, dist, downDeg) {
  const el = downDeg * Math.PI / 180, se = Math.sin(el), ce = Math.cos(el), keep = Math.min(1, (FULL / dist) ** 2);
  const zb = new Float32Array(CW * CH).fill(-1e9);
  // looking north and down: screen x = east, screen y = up * cos(el) + north * sin(el), depth toward the eye
  const proj = (p) => [CW / 2 + p[0] * S, CH * 0.55 - (p[1] * ce + p[2] * se) * S, p[1] * se - p[2] * ce];
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const q = ((oy + y) * W + ox + x) * 3, n = 0.94 + 0.12 * ((x * 7 + y * 13) % 5) / 5; img[q] = 0.42 * n; img[q + 1] = 0.40 * n; img[q + 2] = 0.22 * n; }
  const quad = (c, uv, shade, shadowA) => {
    const p = c.map(proj);
    for (const [i0, i1, i2] of [[0, 2, 1], [1, 2, 3]]) {
      const a = p[i0], b = p[i1], d = p[i2];
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], d[0]))), x1 = Math.min(CW - 1, Math.ceil(Math.max(a[0], b[0], d[0]))), y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], d[1]))), y1 = Math.min(CH - 1, Math.ceil(Math.max(a[1], b[1], d[1])));
      const den = (b[1] - d[1]) * (a[0] - d[0]) + (d[0] - b[0]) * (a[1] - d[1]);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5, u = ((b[1] - d[1]) * (px - d[0]) + (d[0] - b[0]) * (py - d[1])) / den, v = ((d[1] - a[1]) * (px - d[0]) + (a[0] - d[0]) * (py - d[1])) / den, w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        const A = sampleAtlas(ATLAS, u * uv[i0][0] + v * uv[i1][0] + w * uv[i2][0], u * uv[i0][1] + v * uv[i1][1] + w * uv[i2][1]);
        if (A[0] < 0.3) continue;
        const i = y * CW + x, q = ((oy + y) * W + ox + x) * 3;
        if (shadowA != null) { if (zb[i] > -1e8) continue; for (let k = 0; k < 3; k++) img[q + k] *= 1 - shadowA; continue; }
        const z = u * a[2] + v * b[2] + w * d[2];
        if (z <= zb[i]) continue;
        zb[i] = z;
        const lit = u * shade[i0] + v * shade[i1] + w * shade[i2], col = A[2] > 0.5 ? [0.3, 0.24, 0.2] : [0.17, 0.34, 0.13].map((cc) => cc * (0.46 + 0.6 * A[1]));
        for (let k = 0; k < 3; k++) img[q + k] = col[k] * lit * shade[4];
      }
    }
  };
  const CORN = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
  for (let pass = 0; pass < 2; pass++) for (const t of TREES) {
    // (the sketch grows no tree in: those under their distance's share stand whole)
    if (t.rank >= keep) continue;
    const g = t.cell, wd = old ? { card: Math.min(1.5, keep ** -0.25), rose: Math.min(1.5, keep ** -0.25), shadow: 0 } : widths(keep, se, t.dens);
    const c = Math.cos(t.turn), s = Math.sin(t.turn), turn = (l) => [t.x + (l[0] * c - l[2] * s) * t.h, l[1] * t.h, t.z + (l[0] * s + l[2] * c) * t.h];
    const light = (na, ly) => { const nb = [na[0], (ly - g.mid) * 0.8, na[2]], A = norm([na[0], na[1] + 1e-4, na[2]]), B = norm([nb[0], nb[1] + 1e-4, nb[2]]), n = norm([A[0] * 0.45 + B[0] * 0.8, A[1] * 0.45 + B[1] * 0.8 + 0.3, A[2] * 0.45 + B[2] * 0.8]); const nw = [n[0] * c - n[2] * s, n[1], n[0] * s + n[2] * c]; return 0.5 + 0.75 * Math.max(0, nw[0] * SUN[0] + nw[1] * SUN[1] + nw[2] * SUN[2]); };
    if (pass === 0) {
      // the shadow: the picture of the whole tree laid along the Sun's ray
      if (!(wd.shadow > 0)) continue;
      const len = Math.hypot(SUN[0], SUN[2]), dir = [-SUN[0] / len, -SUN[2] / len], stretch = Math.min(len / Math.max(SUN[1], 0.12), SHADOW_LONG);
      const pts = CORN.map(([u, v]) => { const X = (u - 0.5) * 2 * g.hw * t.wide * t.h, Y = (1 - v) * g.tall * t.h * stretch; return [t.x + (-dir[1]) * X + dir[0] * Y, 0.3, t.z + dir[0] * X + dir[1] * Y]; });
      quad(pts, CORN.map(([u, v]) => [g.tree[0] + (g.tree[2] - g.tree[0]) * u, g.tree[1] + (g.tree[3] - g.tree[1]) * v]), null, shadowAlpha(2 * g.hw * t.wide * t.h * g.tall * t.h * stretch, t.dens, keep) * wd.shadow);
      continue;
    }
    for (let q = 0; q < 3; q++) {
      const w = t.wide * (q < 2 ? wd.card : wd.rose);
      if (!(w > 0)) continue;
      const pts = [], shade = [];
      for (const [u, v] of CORN) {
        let l, na;
        if (q < 2) { const a = q * Math.PI / 2, x = (u - 0.5) * 2 * g.hw * w, x0 = (u - 0.5) * 2 * g.hw; l = [Math.cos(a) * x, (1 - v) * g.tall, Math.sin(a) * x]; na = [Math.cos(a) * x0, l[1] - g.mid, Math.sin(a) * x0]; }
        else { l = [(u - 0.5) * 2 * g.r * w, g.y, (0.5 - v) * 2 * g.r * w]; na = [l[0] / w, g.r, l[2] / w]; }
        pts.push(turn(l)); shade.push(light(na, l[1]));
      }
      shade[4] = t.tone;
      const R = q < 2 ? g.tree : g.rose;
      quad(pts, CORN.map(([u, v]) => [R[0] + (R[2] - R[0]) * u, R[1] + (R[3] - R[1]) * v]), shade, null);
    }
  }
}
DIST.forEach((d, ci) => DOWN.forEach((a, ri) => cellDraw(ci * CW, ri * CH, d, a)));
const bytes = Buffer.alloc(W * H * 3);
for (let i = 0; i < bytes.length; i++) bytes[i] = Math.min(255, Math.pow(Math.max(0, img[i]), 1 / 2.2) * 330);
fs.writeFileSync(out, png(W, H, bytes));
console.log(`${out}: columns ${DIST.map((d) => d + ' m (' + (100 * Math.min(1, (FULL / d) ** 2)).toFixed(1) + ' % of the sites)').join(', ')}; rows looked down on at ${DOWN.join(', ')} degrees${old ? ' (the old form)' : ''}`);
