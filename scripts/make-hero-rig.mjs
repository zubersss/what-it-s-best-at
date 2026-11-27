// The owner's rigged character (assets-src/hero-rig/*.glb: made by the owner with Meshy:
// a textured surface, a skeleton of 24 joints, eight clips of motion) into the game's files:
//
//   public/data/hero_rig.bin   the skeleton (names, parents, the pose it was bound in), the
//                              clips read 30 times a second, and three meshes (the whole
//                              surface, a lighter one, and the shape alone for the shadow map)
//   public/data/hero_rig.jpg   its colours (the file's own texture, 2048 square)
//
//   node scripts/make-hero-rig.mjs [--low 24000] [--texture 2048] [--out public/data/hero_rig]
//
// Nothing of the surface or the motion is changed: the vertices stay as the file holds them
// (the skeleton's matrices put them in place), joints are only put in an order where a
// parent comes before its children. The figure is fitted to the game's frame (the soles
// 0.93 m under the origin as it stands in Idle, 1.88 m tall) by one matrix, `root`.
// The texture needs Python's PIL (as scripts/make-world-maps.mjs does).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { MeshoptSimplifier } from 'meshoptimizer';
import { readGLB } from './hero/glb.mjs';
import { HeroRig, skinned } from '../src/hero/heroRig.js';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SRC = opt('src', fs.readdirSync('assets-src/hero-rig').filter((f) => f.endsWith('.glb')).map((f) => 'assets-src/hero-rig/' + f)[0]);
const OUT = opt('out', 'public/data/hero_rig'), LOW = +opt('low', 24000), TEX = +opt('texture', 2048), FPS = 30, TALL = 1.88, SOLES = -0.93;
const t0 = Date.now(), say = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} s  ${s}`);

const g = await readGLB(SRC), J = g.json, prim = J.meshes[0].primitives[0], skin = J.skins[0];
say(`read ${SRC}: ${J.accessors[prim.attributes.POSITION].count} vertices, ${J.accessors[prim.indices].count / 3} triangles, ${skin.joints.length} joints, ${J.animations.length} clips`);

// ---- the skeleton: parents before children ------------------------------------------------
const parentOf = new Map(); J.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
const depth = (node) => { let d = 0, p = node; while (parentOf.has(p)) { p = parentOf.get(p); d++; } return d; };
const order = skin.joints.map((node, k) => ({ node, k })).sort((a, b) => depth(a.node) - depth(b.node));
const jointOfNode = new Map(order.map((o, j) => [o.node, j])), newOfOld = new Int32Array(skin.joints.length); order.forEach((o, j) => { newOfOld[o.k] = j; });
const NJ = order.length, names = order.map((o) => J.nodes[o.node].name.replace(/^mixamorig:/, '')), parents = order.map((o) => (parentOf.has(o.node) && jointOfNode.has(parentOf.get(o.node)) ? jointOfNode.get(parentOf.get(o.node)) : -1));
const trs = (n) => [...(n.translation || [0, 0, 0]), ...(n.rotation || [0, 0, 0, 1])];
const rest = new Float32Array(NJ * 7); order.forEach((o, j) => rest.set(trs(J.nodes[o.node]), j * 7));
const ibmOld = g.accessor(skin.inverseBindMatrices), inverseBind = new Float32Array(NJ * 16); order.forEach((o, j) => inverseBind.set(ibmOld.subarray(o.k * 16, o.k * 16 + 16), j * 16));
// (what stands above the skeleton in the file: its Armature, a hundredth in size)
const mat = (n) => { if (n.matrix) return n.matrix; const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0]; return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1]; };
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
let above = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
{ const chain = []; let p = order[0].node; while (parentOf.has(p)) { p = parentOf.get(p); chain.unshift(p); } for (const n of chain) above = mul(above, mat(J.nodes[n])); }
for (const [j, o] of order.entries()) { const n = J.nodes[o.node]; if (n.scale && n.scale.some((s) => Math.abs(s - 1) > 1e-3)) throw new Error(`joint ${names[j]} is scaled in its rest pose: not handled`); }

// ---- the clips, read FPS times a second ------------------------------------------------------
const clips = [], shared = { rest, inverseBind };
for (const a of J.animations) {
  let dur = 0; for (const s of a.samplers) dur = Math.max(dur, J.accessors[s.input].max[0]);
  const frames = Math.round(dur * FPS) + 1, rot = new Float32Array(frames * NJ * 4), pos = new Float32Array(frames * NJ * 3);
  for (let f = 0; f < frames; f++) for (let j = 0; j < NJ; j++) { pos.set(rest.subarray(j * 7, j * 7 + 3), (f * NJ + j) * 3); rot.set(rest.subarray(j * 7 + 3, j * 7 + 7), (f * NJ + j) * 4); }
  let scaled = 0;
  for (const c of a.channels) {
    const j = jointOfNode.get(c.target.node); if (j === undefined) continue;
    const s = a.samplers[c.sampler], T = g.accessor(s.input), V = g.accessor(s.output), n = c.target.path === 'rotation' ? 4 : 3, step = s.interpolation === 'STEP';
    if (s.interpolation === 'CUBICSPLINE') throw new Error('a clip in curves: not handled');
    if (c.target.path === 'scale') { for (let i = 0; i < V.length; i++) if (Math.abs(V[i] - 1) > 2e-3) scaled++; continue; }
    let k = 0;
    for (let f = 0; f < frames; f++) {
      const t = Math.min(f / FPS, T[T.length - 1]); while (k + 1 < T.length && T[k + 1] <= t) k++;
      const k1 = Math.min(k + 1, T.length - 1), u = step || k1 === k ? 0 : Math.min(1, Math.max(0, (t - T[k]) / (T[k1] - T[k])));
      if (n === 3) for (let e = 0; e < 3; e++) pos[(f * NJ + j) * 3 + e] = V[k * 3 + e] * (1 - u) + V[k1 * 3 + e] * u;
      else { let dot = 0; for (let e = 0; e < 4; e++) dot += V[k * 4 + e] * V[k1 * 4 + e]; const q = [0, 1, 2, 3].map((e) => V[k * 4 + e] * (1 - u) + V[k1 * 4 + e] * (dot < 0 ? -u : u)), l = Math.hypot(...q); for (let e = 0; e < 4; e++) rot[(f * NJ + j) * 4 + e] = q[e] / l; }
    }
  }
  // (one sign for each joint's turn through the clip, so that reading between two frames never goes the long way round)
  for (let j = 0; j < NJ; j++) for (let f = 1; f < frames; f++) { const a0 = ((f - 1) * NJ + j) * 4, a1 = (f * NJ + j) * 4; let dot = 0; for (let e = 0; e < 4; e++) dot += rot[a0 + e] * rot[a1 + e]; if (dot < 0) for (let e = 0; e < 4; e++) rot[a1 + e] = -rot[a1 + e]; }
  clips.push({ name: a.name, duration: (frames - 1) / FPS, fps: FPS, frames }); shared['rot_' + a.name] = rot; shared['pos_' + a.name] = pos;
  say(`clip ${a.name}: ${frames} frames, ${((frames - 1) / FPS).toFixed(2)} s${scaled ? `, ${scaled} scale keys off 1 (left out)` : ''}`);
}

// ---- the surface ----------------------------------------------------------------------------------
const P = g.accessor(prim.attributes.POSITION), N = g.accessor(prim.attributes.NORMAL), UV = g.accessor(prim.attributes.TEXCOORD_0), JN = g.accessor(prim.attributes.JOINTS_0, { raw: true }), WT = g.accessor(prim.attributes.WEIGHTS_0), I = Uint32Array.from(g.accessor(prim.indices, { raw: true })), nv = P.length / 3;
const joints = new Uint8Array(nv * 4), weights = new Uint8Array(nv * 4);
for (let v = 0; v < nv; v++) {
  let sum = 0; for (let k = 0; k < 4; k++) sum += WT[v * 4 + k];
  let left = 255, big = 0;
  for (let k = 0; k < 4; k++) { const w = Math.round(255 * WT[v * 4 + k] / (sum || 1)); weights[v * 4 + k] = w; joints[v * 4 + k] = w ? newOfOld[JN[v * 4 + k]] : 0; left -= w; if (weights[v * 4 + k] > weights[v * 4 + big]) big = k; }
  weights[v * 4 + big] += left;
}
// ---- the colours -------------------------------------------------------------------------------------
const base = g.image(J.textures[J.materials[prim.material].pbrMetallicRoughness.baseColorTexture.index].source);
fs.mkdirSync('.cache/hero-rig', { recursive: true }); fs.writeFileSync('.cache/hero-rig/base.' + (base.mime === 'image/png' ? 'png' : 'jpg'), base.bytes);
execFileSync('python3', ['-I', '-c', `
from PIL import Image
import sys
im = Image.open(sys.argv[1]).convert('RGB')
im.resize((${TEX}, ${TEX}), Image.LANCZOS).save(sys.argv[2], quality=88, optimize=True)
im.resize((256, 256), Image.LANCZOS).save(sys.argv[3])
open(sys.argv[4], 'wb').write(im.resize((512, 512), Image.LANCZOS).tobytes())
`, '.cache/hero-rig/base.' + (base.mime === 'image/png' ? 'png' : 'jpg'), OUT + '.jpg', '.cache/hero-rig/base_256.png', '.cache/hero-rig/base_512.rgb']);
say(`${OUT}.jpg: ${(fs.statSync(OUT + '.jpg').size / 1024).toFixed(0)} KB (${TEX} square, from ${base.mime})`);
const small = fs.readFileSync('.cache/hero-rig/base_512.rgb');

// ---- how loose each vertex is: how far it hangs off the bones (0: on the body, 1: free cloth
//      or hair). Measured as the file stands, from the middle line of every bone, each with
//      the girth of what it carries; the game lets what is loose trail and flutter in the air
//      (hero/heroRigMesh.js). The surface itself is not changed --------------------------------
const loose = new Uint8Array(nv);
{
  const inv4 = (m) => { // the inverse of a rigid-with-scale 4 x 4 (column-major): by cofactors
    const a = m, o = new Array(16); const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6], b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    o[12] = (-a[4] * b09 + a[5] * b07 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det; o[14] = (-a[12] * b03 + a[13] * b01 - a[14] * b00) * det; return [o[12], o[13], o[14]];
  };
  // (each joint's place in the surface's own space, as it was bound)
  const at = Array.from({ length: NJ }, (_, j) => inv4(Array.from(inverseBind.subarray(j * 16, j * 16 + 16))));
  let y0 = 1e9, y1 = -1e9; for (let v = 0; v < nv; v++) { y0 = Math.min(y0, P[v * 3 + 1]); y1 = Math.max(y1, P[v * 3 + 1]); }
  const metre = (y1 - y0) / TALL;                       // the surface's units a metre of the fitted figure
  const girth = (n) => (/Spine|Hips|Shoulder/.test(n) ? 0.17 : /Neck|Head|headfront/.test(n) ? 0.13 : /UpLeg/.test(n) ? 0.11 : /Leg|Foot|Toe/.test(n) ? 0.085 : 0.065);
  const segs = []; for (let j = 0; j < NJ; j++) if (parents[j] >= 0) segs.push([at[parents[j]], at[j], Math.max(girth(names[j]), /UpLeg|Arm$/.test(names[j]) ? 0 : 0) ]);
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const nape = at[names.indexOf('Neck')][1]; let hairs = 0;
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; let lo = 1;
    for (const [a, b, r] of segs) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz || 1e-9, t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / l2));
      const d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t) / metre; lo = Math.min(lo, sm(r + 0.02, r + 0.2, d));
    }
    // (the hair lies close down the back, inside the spine's girth: it is known by its colour
    //  in the picture, and is loose by how far below the nape it hangs)
    const px = Math.min(511, Math.floor(UV[v * 2] * 512)), py = Math.min(511, Math.floor(UV[v * 2 + 1] * 512)), cr = small[(py * 512 + px) * 3], cg = small[(py * 512 + px) * 3 + 1], cb = small[(py * 512 + px) * 3 + 2];
    if (cr > 90 && cb > 60 && cg < 0.55 * cr && cg < 0.75 * cb) { lo = Math.max(lo, 0.85 * sm(0.0, 0.55, (nape - y) / metre)); hairs++; }
    loose[v] = Math.round(255 * lo);
  }
  say(`hair: ${hairs} vertices by their colour`);
  let free = 0; for (let v = 0; v < nv; v++) if (loose[v] > 128) free++;
  say(`loose: ${(100 * free / nv).toFixed(0)} % of the vertices hang more than half free of the bones`);
}
const full = { position: P, loose, normal: Int8Array.from({ length: nv * 4 }, (_, i) => (i % 4 === 3 ? 0 : Math.round(127 * N[(i >> 2) * 3 + (i % 4)]))), uv: Uint16Array.from(UV, (x) => Math.round(65535 * Math.min(1, Math.max(0, x)))), joints, weights, index: I };

// ---- fitted to the game's frame: standing in Idle, the soles at SOLES and TALL from sole to crown
const fileLike = { joints: names, parents, root: above, clips, shared };
{
  const rig = new HeroRig(fileLike); rig.sample('Idle', 0); rig.solve();
  const { position: Q } = skinned({ ...full, normalScale: 1 / 127, weightScale: 1 / 255 }, rig.palette(new Float32Array(NJ * 12)));
  let y0 = 1e9, y1 = -1e9, xs = 0, zs = 0; for (let v = 0; v < nv; v++) { y0 = Math.min(y0, Q[v * 3 + 1]); y1 = Math.max(y1, Q[v * 3 + 1]); xs += Q[v * 3]; zs += Q[v * 3 + 2]; }
  const s = TALL / (y1 - y0), hip = rig.world.subarray(0, 12);
  say(`as the file has it: ${(y1 - y0).toFixed(3)} m tall standing in Idle, the soles at ${y0.toFixed(3)} m; fitted by ${s.toFixed(4)}`);
  // (the hips over the origin in x and z as it stands, so the figure turns about itself)
  const hx = above[0] * hip[3] + above[12], hz = above[10] * hip[11] + above[14];
  fileLike.root = mul([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, -s * hx, SOLES - s * y0, -s * hz, 1], above);
  // Where each clip's ground is: the lowest the boots come in it, in the figure's frame. (The
  // clips were not all made over the same floor: the gaits tread 5 cm over Idle's; the game
  // puts each on the ground by this: hero/heroAnim.js.)
  const feet = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map((n) => names.indexOf(n)), pick = [];
  for (let v = 0; v < nv; v++) { let w = 0; for (let k = 0; k < 4; k++) if (feet.includes(joints[v * 4 + k])) w += weights[v * 4 + k]; if (w > 200) pick.push(v); }
  const sub = { position: Float32Array.from(pick.flatMap((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]])), normal: new Float32Array(pick.length * 3).fill(0.5), joints: Uint8Array.from(pick.flatMap((v) => [...joints.subarray(v * 4, v * 4 + 4)])), weights: Uint8Array.from(pick.flatMap((v) => [...weights.subarray(v * 4, v * 4 + 4)])), weightScale: 1 / 255 };
  const rig2 = new HeroRig(fileLike), pal = new Float32Array(NJ * 12);
  for (const c of clips) { let lo = 1e9; for (let f = 0; f < c.frames; f++) { rig2.sample(c.name, f / FPS, rig2.pose, false); rig2.solve(); rig2.palette(pal); const { position: Q2 } = skinned(sub, pal); for (let i = 1; i < Q2.length; i += 3) lo = Math.min(lo, Q2[i]); } c.ground = +lo.toFixed(4); }
  say(`the clips' ground (m under the origin; the soles belong at ${-SOLES}): ${clips.map((c) => `${c.name} ${(-c.ground).toFixed(3)}`).join(', ')}`);
}

// ---- the reduced mesh ------------------------------------------------------------------------------
await MeshoptSimplifier.ready;
function reduce(tris) {
  const attr = new Float32Array(nv * 5); for (let v = 0; v < nv; v++) { attr[v * 5] = N[v * 3]; attr[v * 5 + 1] = N[v * 3 + 1]; attr[v * 5 + 2] = N[v * 3 + 2]; attr[v * 5 + 3] = UV[v * 2]; attr[v * 5 + 4] = UV[v * 2 + 1]; }
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, attr, 5, [0.5, 0.5, 0.5, 1.5, 1.5], null, tris * 3, 0.05, []);
  const map = new Int32Array(nv).fill(-1); let n = 0; for (const v of idx) if (map[v] < 0) map[v] = n++;
  const pick = (a, w) => { const o = new a.constructor(n * w); for (let v = 0; v < nv; v++) if (map[v] >= 0) for (let k = 0; k < w; k++) o[map[v] * w + k] = a[v * w + k]; return o; };
  return { position: pick(full.position, 3), loose: pick(loose, 1), normal: pick(full.normal, 4), uv: pick(full.uv, 2), joints: pick(joints, 4), weights: pick(weights, 4), index: Uint32Array.from(idx, (v) => map[v]) };
}
const low = reduce(Math.round(I.length / 9));
say(`the lighter mesh: ${low.index.length / 3} triangles, ${low.position.length / 3} vertices`);
// (for the shadow map: the shape alone. The surface is cut into many small pieces for its
//  picture; welded by place it is one skin again and reduces far further)
function shape(tris) {
  const key = new Map(), to = new Int32Array(nv), firsts = [];
  for (let v = 0; v < nv; v++) { const k = `${Math.round(P[v * 3] * 2e4)},${Math.round(P[v * 3 + 1] * 2e4)},${Math.round(P[v * 3 + 2] * 2e4)}`; let w = key.get(k); if (w === undefined) { w = firsts.length; key.set(k, w); firsts.push(v); } to[v] = w; }
  const wp = new Float32Array(firsts.length * 3); firsts.forEach((v, i) => wp.set(P.subarray(v * 3, v * 3 + 3), i * 3));
  const wi = []; for (let t = 0; t < I.length; t += 3) { const a = to[I[t]], b = to[I[t + 1]], c = to[I[t + 2]]; if (a !== b && b !== c && a !== c) wi.push(a, b, c); }
  const [idx] = MeshoptSimplifier.simplify(Uint32Array.from(wi), wp, 3, tris * 3, 0.08, []);
  const map = new Int32Array(firsts.length).fill(-1); let n = 0; for (const v of idx) if (map[v] < 0) map[v] = n++;
  const out = { position: new Float32Array(n * 3), loose: new Uint8Array(n), joints: new Uint8Array(n * 4), weights: new Uint8Array(n * 4), index: Uint32Array.from(idx, (v) => map[v]) };
  firsts.forEach((v, i) => { if (map[i] < 0) return; out.loose[map[i]] = loose[v]; out.position.set(P.subarray(v * 3, v * 3 + 3), map[i] * 3); out.joints.set(joints.subarray(v * 4, v * 4 + 4), map[i] * 4); out.weights.set(weights.subarray(v * 4, v * 4 + 4), map[i] * 4); });
  return out;
}
const shadow = shape(LOW);
say(`the shadow's mesh: ${shadow.index.length / 3} triangles, ${shadow.position.length / 3} vertices`);

// (and a colour a vertex, read from the picture: for the tools' sketches)
for (const m of [low]) { const n = m.position.length / 3; m.colour = new Uint8Array(n * 4); for (let v = 0; v < n; v++) { const x = Math.min(511, Math.floor(m.uv[v * 2] / 65536 * 512)), y = Math.min(511, Math.floor(m.uv[v * 2 + 1] / 65536 * 512)); m.colour.set([small[(y * 512 + x) * 3], small[(y * 512 + x) * 3 + 1], small[(y * 512 + x) * 3 + 2], 255], v * 4); } }

// ---- written (the container of scripts/make-hero.mjs: 'HERO', the header's length, the header, the arrays)
{
  const TYPES = new Map([[Float32Array, 'f32'], [Uint8Array, 'u8'], [Uint16Array, 'u16'], [Uint32Array, 'u32'], [Int8Array, 'i8']]);
  const head = { kind: 'rig', joints: names, parents, root: fileLike.root, clips, shared: {}, lods: [] }, lay = []; let at = 0;
  for (const [name, a] of Object.entries(shared)) { head.shared[name] = { type: TYPES.get(a.constructor), count: a.length, at: 0 }; lay.push([head.shared[name], a]); }
  for (const m of [full, low, shadow]) {
    const L = { vertices: m.position.length / 3, triangles: m.index.length / 3, normalScale: 1 / 127, weightScale: 1 / 255, arrays: {} };
    for (const [name, a] of Object.entries(m)) { L.arrays[name] = { type: TYPES.get(a.constructor), count: a.length, at: 0 }; lay.push([L.arrays[name], a]); }
    head.lods.push(L);
  }
  for (const [d, a] of lay) { d.at = at; at += Math.ceil(a.byteLength / 4) * 4; }
  let json = Buffer.from(JSON.stringify(head)); json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const pre = Buffer.alloc(8); pre.write('HERO', 0); pre.writeUInt32LE(json.length, 4);
  const chunks = lay.map(([, a]) => { const b = Buffer.alloc(Math.ceil(a.byteLength / 4) * 4); Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(b); return b; });
  fs.writeFileSync(OUT + '.bin', Buffer.concat([pre, json, ...chunks]));
  say(`${OUT}.bin: ${(fs.statSync(OUT + '.bin').size / 1048576).toFixed(2)} MB; joints: ${names.join(' ')}`);
}
