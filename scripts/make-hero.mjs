// The character, from the owner's sculpt to what the game draws (public/data/hero.bin).
//
//   node scripts/make-hero.mjs [--tris 120000] [--low 24000] [--stage look]
//
// The sculpt (assets-src/hero/Silver_Plumage_Sentinel_compressed.glb: 1.8 million triangles,
// one fused surface, no colour, no skeleton) is:
//   1. read and welded (scripts/hero/lib.mjs);
//   2. given its materials by seeds (scripts/hero/seeds.mjs): every vertex takes the label of
//      the seed nearest over the surface, where crossing a crease costs dear;
//   3. coloured (the owner's design: white-silver silk, magenta-purple hair, silver ornament),
//      its hollows a little darker so the carving shows without a texture;
//   4. reduced, twice (the figure, and a lighter one for its shadow);
//   5. put in the game's frame (hips at the origin, +Y the head, +Z the chest, metres);
//   6. bound to the game's figure (hero/hero.js): each vertex to up to four of its movers, the
//      nine rigid parts and the particles of the simulated cloth (hero/robe.js: skirt,
//      sleeves, hair), as they are with the figure standing as the sculpt stands (heroBind.mjs).
// --stage look stops after 5 and writes no binding (for looking at colours).
//
// Untrusted input: the GLB is parsed by hand and nothing in it is run.
import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
import { loadGLB, adjacency, Heap } from './hero/lib.mjs';
import { LABELS, seeds, GARMENTS, garments } from './hero/seeds.mjs';

const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const ROOT = new URL('..', import.meta.url).pathname, SRC = ROOT + 'assets-src/hero/Silver_Plumage_Sentinel_compressed.glb';
const TRIS = +opt('tris', 120000), LOW = +opt('low', 24000), STAGE = opt('stage', 'all'), OUT = opt('out', ROOT + 'public/data/hero.bin');

// The sculpt in the game's frame: its hip joints are 0.02 above its middle, and the game's
// figure stands with its hips 0.93 m above its soles (controls/cameraRig.js, body).
export const FIT = { lift: -0.02, scale: 0.959 };

// Albedos (linear) and materials, as hero/heroModel.js names them: 0 silk, 1 skin, 3 silver
// embroidery, 4 polished silver and pearls, 5 hair.
const LOOK = {
  silk: [[0.74, 0.74, 0.76], 0], inner: [[0.50, 0.50, 0.62], 0], hair: [[0.12, 0.008, 0.115], 5], skin: [[0.60, 0.42, 0.33], 1],
  silver: [[0.60, 0.61, 0.64], 3], pearl: [[0.80, 0.79, 0.82], 4], tassel: [[0.40, 0.40, 0.50], 0], boot: [[0.66, 0.66, 0.70], 0],
  brow: [[0.07, 0.012, 0.04], 5], lip: [[0.42, 0.20, 0.19], 1],
};

const t0 = Date.now(), say = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} s  ${s}`);
const { P, N, I } = loadGLB(SRC), nv = P.length / 3, { start, items } = adjacency(nv, I);
say(`read: ${nv} vertices, ${I.length / 3} triangles`);

// ---- 2. labels by seeds -------------------------------------------------------------------
function label(names, list0, K) {
  const lab = new Uint8Array(nv).fill(255), dist = new Float64Array(nv).fill(Infinity), heap = new Heap(nv); let missed = 0;
  for (const [name, list] of Object.entries(list0)) {
    const id = names.indexOf(name), pts = [];
    for (const s of list) {
      if (s.p) pts.push([s.v, s.p[0], s.p[1]]);
      else { const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), n = Math.max(1, Math.ceil(L / 0.015)); for (let k = 0; k <= n; k++) { const t = k / n; pts.push([s.v, s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]); } }
    }
    for (const [view, a, b] of pts) {
      // (u, w): the picture's two axes; d: toward the eye. The surface nearest the eye within a centimetre.
      const iu = view === 'r' || view === 'l' ? 2 : 0, iw = view === 't' ? 2 : 1, id3 = view === 'f' || view === 'b' ? 2 : view === 't' ? 1 : 0, sg = view === 'b' || view === 'l' ? -1 : 1;
      let best = -1, bd = -1e9; const R2 = (s_r(view)) ** 2;
      for (let v = 0; v < nv; v++) { const du = P[v * 3 + iu] - a, dw = P[v * 3 + iw] - b; if (du * du + dw * dw > R2) continue; const d = sg * P[v * 3 + id3]; if (d > bd) { bd = d; best = v; } }
      if (best < 0) { missed++; continue; }
      dist[best] = 0; lab[best] = id; heap.push(0, best);
    }
  }
  while (heap.n) {
    const v = heap.pop(), d = heap.key; if (d > dist[v]) continue;
    for (let e = start[v]; e < start[v + 1]; e++) {
      const w = items[e], dx = P[w * 3] - P[v * 3], dy = P[w * 3 + 1] - P[v * 3 + 1], dz = P[w * 3 + 2] - P[v * 3 + 2], len = Math.hypot(dx, dy, dz);
      const cs = N[v * 3] * N[w * 3] + N[v * 3 + 1] * N[w * 3 + 1] + N[v * 3 + 2] * N[w * 3 + 2];
      // (concave if the normals lean toward each other along the edge)
      const conc = (N[w * 3] - N[v * 3]) * dx + (N[w * 3 + 1] - N[v * 3 + 1]) * dy + (N[w * 3 + 2] - N[v * 3 + 2]) * dz < 0 ? 1 : 0.25;
      const nd = d + len * (1 + K * conc * Math.max(0, 1 - cs) * 8);
      if (nd < dist[w]) { dist[w] = nd; lab[w] = lab[v]; heap.push(nd, w); }
    }
  }
  const cnt = names.map(() => 0); for (let v = 0; v < nv; v++) if (lab[v] < 255) cnt[lab[v]]++;
  say(`${names.map((n, i) => `${n} ${cnt[i]}`).join(', ')}; ${missed} seeds met nothing`);
  return lab;
}
function s_r(view) { return view === 'x' ? 0.004 : 0.012; }
const lab = label(LABELS, seeds(), 150);
// The garments (for the binding): 0 the body and its own clothes, 1 the skirt, 2 and 3 the
// left and right sleeve, 4 the hair. Hair, skin and boots by their material; the rest by seeds.
const gar = label(GARMENTS, garments(), 20);
for (let v = 0; v < nv; v++) {
  const name = LABELS[lab[v]];
  gar[v] = name === 'hair' ? 4 : name === 'skin' || name === 'boot' || name === 'brow' || name === 'lip' ? 0 : gar[v] === 2 ? (P[v * 3] >= 0 ? 2 : 3) : gar[v] === 1 ? 1 : 0;
}

// ---- 3. colour ----------------------------------------------------------------------------
// How hollow the surface is at a vertex, at the scale of a centimetre or two: the normals of
// its neighbourhood lean toward it (a groove, the foot of a fold) or away (a ridge). Smoothed
// over a few rings, so it is the carving's shape and not the mesh's grain.
function hollow() {
  let h = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    let s = 0, n = 0;
    for (let e = start[v]; e < start[v + 1]; e++) { const w = items[e], dx = P[w * 3] - P[v * 3], dy = P[w * 3 + 1] - P[v * 3 + 1], dz = P[w * 3 + 2] - P[v * 3 + 2], l2 = dx * dx + dy * dy + dz * dz; if (l2 < 1e-12) continue; s -= ((N[w * 3] - N[v * 3]) * dx + (N[w * 3 + 1] - N[v * 3 + 1]) * dy + (N[w * 3 + 2] - N[v * 3 + 2]) * dz) / Math.sqrt(l2); n++; }
    h[v] = n ? s / n : 0;
  }
  for (let pass = 0; pass < 6; pass++) {
    const g = new Float32Array(nv);
    for (let v = 0; v < nv; v++) { let s = h[v] * 2, n = 2; for (let e = start[v]; e < start[v + 1]; e++) { s += h[items[e]]; n++; } g[v] = s / n; }
    h = g;
  }
  return h;
}
const hol = hollow();
const col = new Float32Array(nv * 3), mat = new Uint8Array(nv);
for (let v = 0; v < nv; v++) {
  const name = LABELS[lab[v]] || 'silk', [c, m] = LOOK[name]; mat[v] = m;
  // (hollows darker, ridges a touch lighter: more on cloth and ornament than on skin)
  let k = 1 - Math.max(-0.12, Math.min(0.45, hol[v] * (m === 1 ? 2.5 : 5)));
  if (name === 'hair') {
    // strands: lighter and darker in turn round the head, darker at the roots
    const a = Math.atan2(P[v * 3], -P[v * 3 + 2] + 0.02);
    k *= (0.8 + 0.2 * Math.cos(a * 23 + P[v * 3 + 1] * 3) * Math.cos(a * 7 + 1)) * (0.75 + 0.25 * Math.min(1, (0.95 - P[v * 3 + 1]) * 5));
  }
  if (name === 'boot' && P[v * 3 + 1] < -0.925) k *= 0.45;          // (the soles)
  col[v * 3] = c[0] * k; col[v * 3 + 1] = c[1] * k; col[v * 3 + 2] = c[2] * k;
}
say('coloured');

// ---- 4. reduced ---------------------------------------------------------------------------
await MeshoptSimplifier.ready;
function reduce(tris) {
  // (the colour counts too: a reduction must not smear the hair into the robe)
  const attr = new Float32Array(nv * 6);
  for (let v = 0; v < nv; v++) { attr.set(N.subarray(v * 3, v * 3 + 3), v * 6); attr[v * 6 + 3] = Math.sqrt(col[v * 3]); attr[v * 6 + 4] = Math.sqrt(col[v * 3 + 1]); attr[v * 6 + 5] = Math.sqrt(col[v * 3 + 2]); }
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, attr, 6, [0.5, 0.5, 0.5, 0.4, 0.4, 0.4], null, tris * 3, 1.0, []);
  const map = new Int32Array(nv).fill(-1), from = []; const oi = new Uint32Array(idx.length);
  for (let k = 0; k < idx.length; k++) { if (map[idx[k]] < 0) { map[idx[k]] = from.length; from.push(idx[k]); } oi[k] = map[idx[k]]; }
  return { from: Uint32Array.from(from), index: oi };
}
// ---- 5. the game's frame ------------------------------------------------------------------
function mesh(tris) {
  const { from, index } = reduce(tris), n = from.length;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), colour = new Uint8Array(n * 4), label8 = new Uint8Array(n), garment = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const v = from[k];
    position[k * 3] = P[v * 3] * FIT.scale; position[k * 3 + 1] = (P[v * 3 + 1] + FIT.lift) * FIT.scale; position[k * 3 + 2] = P[v * 3 + 2] * FIT.scale;
    normal.set(N.subarray(v * 3, v * 3 + 3), k * 3);
    for (let c = 0; c < 3; c++) colour[k * 4 + c] = Math.round(255 * Math.sqrt(Math.min(1, col[v * 3 + c])));        // (the root of the albedo: the dark hair keeps its steps)
    colour[k * 4 + 3] = mat[v]; label8[k] = lab[v]; garment[k] = gar[v];
  }
  say(`reduced to ${index.length / 3} triangles, ${n} vertices`);
  return { position, normal, colour, label: label8, garment, index };
}
const lods = [mesh(TRIS), mesh(LOW)];

// ---- 6. bound to the game's figure --------------------------------------------------------
let shared = null;
if (STAGE !== 'look') { const { bind } = await import('./hero/heroBind.mjs'); for (const m of lods) { const b = await bind(m, say); shared = b.shared; delete b.shared; Object.assign(m, b); } }

// ---- written ------------------------------------------------------------------------------
// 'HERO', the length of a JSON header, the header, then the arrays it lists (each begins on a
// multiple of four bytes from the file's start).
{
  const TYPES = new Map([[Float32Array, 'f32'], [Uint8Array, 'u8'], [Uint16Array, 'u16'], [Uint32Array, 'u32'], [Int8Array, 'i8']]);
  const head = { fit: FIT, labels: LABELS, shared: {}, lods: [] }, chunks = []; let at = 0;
  const lay = [];
  for (const [name, a] of Object.entries(shared || {})) { head.shared[name] = { type: TYPES.get(a.constructor), count: a.length, at: 0 }; lay.push([head.shared[name], a]); }
  for (const m of lods) {
    const L = { vertices: m.position.length / 3, triangles: m.index.length / 3, arrays: {} };
    for (const [name, a] of Object.entries(m)) { if (!ArrayBuffer.isView(a)) { L[name] = a; continue; } L.arrays[name] = { type: TYPES.get(a.constructor), count: a.length, at: 0 }; lay.push([L.arrays[name], a]); }
    head.lods.push(L);
  }
  // (offsets are from the end of the header: worked out before the header's length is known)
  for (const [d, a] of lay) { d.at = at; at += Math.ceil(a.byteLength / 4) * 4; }
  let json = Buffer.from(JSON.stringify(head)); json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const pre = Buffer.alloc(8); pre.write('HERO', 0); pre.writeUInt32LE(json.length, 4);
  for (const [, a] of lay) { const b = Buffer.alloc(Math.ceil(a.byteLength / 4) * 4); Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(b); chunks.push(b); }
  fs.writeFileSync(OUT, Buffer.concat([pre, json, ...chunks]));
  say(`${OUT}: ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB`);
}
