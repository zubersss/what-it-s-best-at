// Which blade, flower and tussock a place of the ground gets must be the place's, never the
// anchor's or the traveller's (no browser, some seconds): node scripts/grass-place-test.mjs
//
// The grass is measured from an anchor that follows the traveller in steps of 40 or 80 m
// (life/grass.js). Here the real Grass (its update(), setFraction(), setMidShare()) is walked
// over a made-up level grassland on a world of Haven's size: west and south across the line
// where the anchor's place modulo 2560 m wraps, back across it diagonally, then off at a
// slant that makes single 40 m steps. At every step of the anchor, the lines of the grass's
// own shaders that decide which ground cell an instance draws, what that cell's number is,
// where a near blade's foot is and which tussock it stands in are run here (taken from each
// field's vertex shader as three has it, one component at a time) on the uniforms update()
// set just before the step and just after (32-bit, as the GPU gets them). Fails (exit 1) when:
//   - the instances handed over (every block of the field's window: life/grassBlocks.js) do
//     not draw every cell of the window exactly once;
//   - a cell is drawn on one side of a step and left out on the other, with the governor's
//     grass savings on ('grass' and 'grass-mid': half the cells, by the cells' own numbers) or off;
//   - the savings thin nothing, or not about half;
//   - a cell's number (what all its hashes are made from) changes at a step;
//   - a near blade's foot moves or its tussock changes at a step (thin land: whether it
//     stands, how tall);
//   - a cell's number is taken anywhere but at its middle (at an edge, rounding decides it,
//     frame by frame);
//   - the walk did not take the anchor across the wrap both ways on both axes, or a shader
//     line it replays is not there any more (bring the replay in step).
// (A place: a cell counted from where the grass began, and a blade of it.)
import * as THREE from 'three';
import { Grass } from '../src/life/grass.js';
import { Pollen } from '../src/life/pollen.js';
import { NB, NBLOCKS } from '../src/life/grassBlocks.js';

const R = 250000;                                   // Haven's radius (m)
const f32 = Math.fround;
let failed = 0;
const broken = (what) => { failed++; console.log('BROKEN: ' + what); };

// --- the real Grass over a level grassland (no browser: its tables are filled from this)
const hs = { radius: R, waterDepth: 0, baseSlope: 0, height: () => 0, coverAt: () => 10 };
const terrain = { shared: { uGrassWave: { value: new THREE.Vector4() }, uGrassTone: { value: new THREE.Vector4() }, uWind: { value: new THREE.Vector4(0.6, 0.8, 0, 5) } }, hs, coverSerial: 1, ringSerial: 1, tiles: { busy: false }, workers: { idle: 0 }, epoch: 0 };
const grass = new Grass(terrain, terrain.shared.uWind);
grass.setWorld({ life: { grass: { below: 80, mid: 220 } }, surface: {} });
const renderer = { getDrawingBufferSize: (v) => v.set(1100, 515), initTexture() {} };
const fields = [...grass.rings, ...grass.flowers];
const name = (fl) => fl.f.id || `flowers ${fl.f.spacing} m`;
// (the governor's savings are a share the shader is told, uGrassGov: read off the real calls further down)

// --- the shaders' lines, run in JavaScript one component at a time (k: 0 east, 1 north)
const mod = (x, y) => x - y * Math.floor(x / y);   // GLSL's
function line(src, defs) {
  const js = src
    .replace(/\buGrassCam\.xy\b/g, 'U.cam[k]')
    .replace(/\buLatOrigin\.zw\b/g, 'U.lat[2 + k]')
    .replace(/\buLatOrigin(\.xy)?\b/g, 'U.lat[k]')
    .replace(/\buLatPhase\b/g, 'U.phase[k]')
    .replace(/\buGrassLie\b/g, 'U.lie[k]')
    .replace(/\b(w|n|rc|at|foot2|hc)\b/g, 'V.$1[k]')
    .replace(/\b(GRID|SPACING|BOX|HALF|SEED)\b/g, (m) => `(${Number(defs[m])})`)
    .replace(/\bfloor\(/g, 'Math.floor(');
  const rest = js.replace(/\bU\.(cam|lat|lie|phase)\[(2 \+ )?k\]/g, '').replace(/\bV\.\w+\[k\]/g, '').replace(/\bMath\.floor\b|\bmod\b/g, '').replace(/\d+(\.\d+)?/g, '');
  if (/[^\s+\-*/(),.]/.test(rest)) throw new Error(`a shader line the replay does not know: ${src}`);
  if (/NaN/.test(js)) throw new Error(`a define the field does not have, in: ${src}`);
  return new Function('U', 'V', 'k', 'mod', `return ${js};`);
}
const need = (s, re, what) => { const m = s.match(re); if (!m) { broken(`the shader has no ${what} (bring the replay in step)`); return null; } return m; };
const SCRAMBLE = ['int k = gl_InstanceID % uBlockN, lid = gl_InstanceID / uBlockN;', 'float code = uBlocks[k >> 2][k & 3];', `vec2 w = vec2(mod(code, ${NB}.0), floor(code / ${NB}.0)) * float(BW) + vec2(float(lid % BW), float(lid / BW));`, 'if (max(w.x, w.y) >= float(GRID)) { own = vec2(0.0); return vec2(1.0e6); }'];
const rules = fields.map((fl) => {
  const vs = fl.mesh.material.vertexShader, defs = fl.mesh.material.defines;
  // (a ring's instances are dealt to its blocks; a field of flowers has its cells as a list)
  for (const s of fl.list ? ['vec2 w = aCell;'] : SCRAMBLE) if (!vs.includes(s)) broken(`${name(fl)}: the instances' order is no longer "${s}" (bring the replay in step)`);
  const rc = need(vs, /\bvec2 rc = ([^;]+);/, 'cell middle (vec2 rc = ...)'), own = need(vs, /\n\s*own = ([^;]+);/, "cell's number (own = ...)");
  if (!rc || !own) return null;
  // (which cells a thinned field keeps: a rule of the cell's own number, and the share it is held against)
  const kp = need(vs, /bool keptCell\(vec2 own, float share\) \{ return fract\(dot\(own - SEED, vec2\(([\d.]+), ([\d.]+)\)\)\) < share; \}/, 'rule for the cells a thinned field keeps (keptCell)');
  const asked = need(vs, /if \(!keptCell\(cell, (GOVSHARE|uGrassGov\.x)\)\) OUT_OF_PICTURE/, 'thinning by keptCell before anything else');
  const nn = need(vs, /\bvec2 n = floor\((.+)\);/, "ground cell under a window cell (vec2 n = floor(...))");
  if (!rc || !own || !kp || !asked || !nn) return null;
  const share = asked[1] === 'GOVSHARE' ? defs.GOVSHARE : asked[1];
  if (share !== 'uGrassGov.x' && share !== 'uGrassGov.y') { broken(`${name(fl)}: thinned by ${share}, which the replay does not know`); return null; }
  const r = { grid: +defs.GRID, bw: +defs.BW, seed: Number(defs.SEED), ka: f32(+kp[1]), kb: f32(+kp[2]), gov: share.endsWith('.x') ? 0 : 1, spacing: Number(defs.SPACING), nAt: line(nn[1], defs), rc: line(rc[1], defs), own: line(own[1], defs), near: !defs.FAR && !!defs.BLADES };
  if (r.near) {
    const ft = need(vs, /\bvec2 foot2 = ([^,;]+), at = ([^;]+);/, "blade's foot (vec2 foot2 = ..., at = ...)");
    const tu = need(vs, /#else\s+(?:\/\/[^\n]*\n\s*)*float own = hash2\((.+) \+ 3\.3\)\.x;/, 'tussock (float own = hash2(... + 3.3).x)');
    if (!ft || !tu) return null;
    r.foot2 = line(ft[1], defs); r.at = line(ft[2], defs); r.tussock = line(tu[1], defs); r.blades = Math.min(3, +defs.BLADES);
  }
  return r;
});
// (every shader that compiles the grass's prelude has what its lattice names, the pollen's too, and no
// reserved word of GLSL ES 3: no browser here to compile them, and a shader that fails draws nothing)
const pollen = new Pollen(grass, terrain.shared);
for (const [who, mat] of [...fields.map((fl) => [name(fl), fl.mesh.material]), ['pollen', pollen.material]]) {
  if (/latticeCell/.test(mat.vertexShader)) for (const d of ['GRID', 'SPACING', 'HALF', 'SEED', ...(/uBlockN/.test(mat.vertexShader) ? ['BW'] : [])]) if (!(d in mat.defines)) broken(`${who}: the shader compiles the grass's lattice but has no ${d}`);
  if (/\b(patch|sample|filter|input|output|common|active|partition|half)\b/.test(mat.vertexShader.replace(/\/\/.*$/gm, ''))) broken(`${who}: a reserved word of GLSL ES 3 in the shader`);
}
if (failed) { console.log('grass places: the replay cannot run'); process.exit(1); }

// a blade's own jitter in its cell (the shader's hc): a hash of the cell's number and the blade
function rnd(x, y, b) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(b + 1, 1440662683); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// the uniforms as the GPU gets them (32-bit), and the anchor's origin to count cells from where the grass began
const snap = () => { const S = grass.shared; return { cam: [f32(S.uGrassCam.value.x), f32(S.uGrassCam.value.y)], lie: [f32(S.uGrassLie.value.x), f32(S.uGrassLie.value.y)], lat: fields.map((fl) => fl.lat.value.toArray().map(f32)), phase: fields.map((fl) => fl.phase.value.toArray().map(f32)), origin: grass.origin.slice() }; };
// a cell kept by a thinned field: the shader's keptCell, in 32-bit
const kept = (r, ox, oy, share) => { const d = f32(f32(f32(ox - r.seed) * r.ka) + f32(f32(oy - r.seed) * r.kb)); return d - Math.floor(d) < share; };
const SAVING = 0.5;
// What a field draws: for every ground cell in its window round the camera (one cell of each
// residue modulo GRID on each axis), which cell it is, whether it is drawn with the savings on
// and off, its number; for a near ring, its first blades' feet and tussocks.
function picture(k, sn, st) {
  const r = rules[k], G = r.grid, N = G * G;
  const U = { cam: sn.cam, lat: sn.lat[k], lie: sn.lie, phase: sn.phase[k] };
  const o = [Math.round(sn.origin[0] / r.spacing), Math.round(sn.origin[1] / r.spacing)];
  const out = { gx: new Float64Array(N), gy: new Float64Array(N), on: new Uint8Array(N), off: new Uint8Array(N), own: new Float64Array(N * 2), tus: r.near ? new Float64Array(N * r.blades * 2) : null, x: r.near ? new Float64Array(N * r.blades * 2) : null };
  const V = { w: [0, 0], n: [0, 0], rc: [0, 0], hc: [0, 0], foot2: [0, 0], at: [0, 0] };
  for (let i = 0; i < N; i++) {
    V.w[0] = i % G; V.w[1] = Math.floor(i / G);          // (every cell of the window: the instances draw each once, checked below)
    const ux = r.nAt(U, V, 0, mod), uy = r.nAt(U, V, 1, mod);
    V.n[0] = Math.floor(ux); V.n[1] = Math.floor(uy);
    V.rc[0] = r.rc(U, V, 0, mod); V.rc[1] = r.rc(U, V, 1, mod);
    // (a cell's number is taken at its middle: at an edge, rounding picks one of two cells)
    st.taken++;
    if (Math.abs(ux - Math.floor(ux) - 0.5) > 0.25 || Math.abs(uy - Math.floor(uy) - 0.5) > 0.25) st.edge++;
    const gx = Math.floor(ux) + o[0], gy = Math.floor(uy) + o[1], q = mod(gx, G) + G * mod(gy, G);
    const ox = r.own(U, V, 0, mod), oy = r.own(U, V, 1, mod);
    out.gx[q] = gx; out.gy[q] = gy; out.on[q] = kept(r, ox, oy, SAVING) ? 1 : 0; out.off[q] = kept(r, ox, oy, 1) ? 1 : 0;
    st.seen++; st.keptOn += out.on[q]; st.keptOff += out.off[q];
    out.own[q * 2] = ox; out.own[q * 2 + 1] = oy;
    if (r.near) for (let b = 0; b < r.blades; b++) {
      V.hc[0] = rnd(Math.round(ox), Math.round(oy), 2 * b); V.hc[1] = rnd(Math.round(ox), Math.round(oy), 2 * b + 1);
      V.foot2[0] = r.foot2(U, V, 0, mod); V.foot2[1] = r.foot2(U, V, 1, mod);
      V.at[0] = r.at(U, V, 0, mod); V.at[1] = r.at(U, V, 1, mod);
      const w = (q * r.blades + b) * 2;
      out.tus[w] = r.tussock(U, V, 0, mod); out.tus[w + 1] = r.tussock(U, V, 1, mod);
      out.x[w] = V.at[0] + sn.origin[0]; out.x[w + 1] = V.at[1] + sn.origin[1];
    }
  }
  return out;
}

// --- the walk: waypoints (m east, m north of the start, along the ground), 3 m a frame at eye height
const lat0 = 0.35, lon0 = 1.1;
const rig = { agl: 1.7, pos: new THREE.Vector3() };
const place = (e, n) => { const la = lat0 + n / R, lo = lon0 + e / (R * Math.cos(la)); rig.pos.set(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)).multiplyScalar(R + rig.agl); };
// (west and south from where the grass began: the anchor's place goes below 0, where it wraps
// modulo 2560 m as it does past 2560; back across diagonally (steps of 40 m on both axes); then
// at 18 degrees off east, which makes single steps of 40 m on one axis)
const route = [[0, 0], [-300, 0], [-300, -300], [300, 300], [300, 0], [700, 130]];
// --- the instances handed over: with every block (as update() leaves a field until cull() has
// chosen), the shader's own sums must give every cell of the window once and nothing else
fields.forEach((fl, k) => {
  const r = rules[k], G = r.grid, BW = r.bw, n = fl.blockN.value, codes = fl.blocks.value, seen = new Uint8Array(G * G);
  let twice = 0, none = 0;
  if (fl.list) {
    // (a field of flowers: the list it draws until cull() has chosen is every cell)
    const g = fl.mesh.geometry, a = g.attributes.aCell.array;
    if (g !== fl.geo || g.instanceCount !== G * G) broken(`${name(fl)}: a field of flowers that has not been culled draws ${g.instanceCount} cells, not its ${G * G}`);
    for (let i = 0; i < g.instanceCount; i++) { const wx = a[i * 2], wy = a[i * 2 + 1]; if (wx !== Math.floor(wx) || wy !== Math.floor(wy) || wx < 0 || wy < 0 || Math.max(wx, wy) >= G) { twice++; continue; } if (seen[wy * G + wx]++) twice++; }
  } else {
  if (n !== NBLOCKS || fl.geo.instanceCount !== NBLOCKS * BW * BW) broken(`${name(fl)}: a field that has not been culled hands over ${fl.geo.instanceCount} instances in ${n} blocks, not every block`);
  for (let i = 0; i < fl.geo.instanceCount; i++) {
    const b = i % n, lid = Math.floor(i / n), code = codes[b];
    const wx = mod(code, NB) * BW + (lid % BW), wy = Math.floor(code / NB) * BW + Math.floor(lid / BW);
    if (Math.max(wx, wy) >= G) continue;
    if (seen[wy * G + wx]++) twice++;
  }
  }
  for (let q = 0; q < G * G; q++) if (!seen[q]) none++;
  if (twice || none) broken(`${name(fl)}: of the window's cells ${none} are drawn by no instance and ${twice} by more than one`);
});
// (the savings by the real calls: the shares the shader is told)
grass.setFraction(SAVING); grass.setMidShare(SAVING);
{ place(0, 0); grass.update(rig, 1 / 30, renderer); const g = grass.shared.uGrassGov.value; if (g.x !== SAVING || g.y !== SAVING) broken(`setFraction(${SAVING}) and setMidShare(${SAVING}) tell the shader ${g.x} and ${g.y}`); }
grass.setFraction(1); grass.setMidShare(1);
const stats = fields.map(() => ({ seen: 0, keptOn: 0, keptOff: 0, cells: 0, on: 0, off: 0, own: 0, blades: 0, tus: 0, moved: 0, taken: 0, edge: 0, wrapBlades: 0, wrapTus: 0 }));
let steps = 0, wrapsX = 0, wrapsY = 0, single40 = 0, before = null, frames = 0;
const t0 = Date.now();
for (let w = 1; w < route.length; w++) {
  const [e0, n0] = route[w - 1], [e1, n1] = route[w], m = Math.ceil(Math.hypot(e1 - e0, n1 - n0) / 3);
  for (let s = w === 1 ? 0 : 1; s <= m; s++) {
    place(e0 + (e1 - e0) * s / m, n0 + (n1 - n0) * s / m);
    grass.update(rig, 1 / 30, renderer); frames++;
    if (!grass.mesh.visible) { broken('the grass is not drawn on the walk'); break; }
    const now = snap();
    if (before && (now.origin[0] !== before.origin[0] || now.origin[1] !== before.origin[1])) {
      steps++;
      const se = now.origin[0] - before.origin[0], sn = now.origin[1] - before.origin[1];
      if ((Math.abs(se) === 40 && sn === 0) || (Math.abs(sn) === 40 && se === 0)) single40++;
      const wx = Math.abs(now.lie[0] - before.lie[0]) > 100, wy = Math.abs(now.lie[1] - before.lie[1]) > 100;
      if (wx) wrapsX++;
      if (wy) wrapsY++;
      const pa = fields.map((fl, k) => picture(k, before, stats[k])), pb = fields.map((fl, k) => picture(k, now, stats[k]));
      for (let k = 0; k < fields.length; k++) {
        const A = pa[k], B = pb[k], st = stats[k], r = rules[k];
        for (let q = 0; q < A.on.length; q++) {
          if (A.gx[q] !== B.gx[q] || A.gy[q] !== B.gy[q]) continue;          // (a cell in one window only: the field wraps round the eye)
          st.cells++;
          if (A.on[q] !== B.on[q]) st.on++;
          if (A.off[q] !== B.off[q]) st.off++;
          if (A.own[q * 2] !== B.own[q * 2] || A.own[q * 2 + 1] !== B.own[q * 2 + 1]) st.own++;
          if (r.near) for (let b = 0; b < r.blades; b++) {
            const i = (q * r.blades + b) * 2;
            const changed = A.tus[i] !== B.tus[i] || A.tus[i + 1] !== B.tus[i + 1];
            st.blades++; if (changed) st.tus++;
            if (wx || wy) { st.wrapBlades++; if (changed) st.wrapTus++; }
            if (Math.abs(A.x[i] - B.x[i]) > 1e-3 || Math.abs(A.x[i + 1] - B.x[i + 1]) > 1e-3) st.moved++;
          }
        }
      }
    }
    before = now;
  }
}
const pc = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : '-');
console.log(`walked ${frames} frames, ${steps} anchor steps (${single40} of 40 m on one axis; the anchor's place wrapped ${wrapsX} times east-west, ${wrapsY} times north-south), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('field              cells compared  changed: saving on  saving off  number   taken at an edge | near blades  foot moved  tussock changed (at a wrap / at other steps)');
fields.forEach((fl, k) => {
  const s = stats[k];
  console.log(`${name(fl).padEnd(18)} ${String(s.cells).padStart(9)} ${pc(s.on, s.cells).padStart(19)} ${pc(s.off, s.cells).padStart(11)} ${pc(s.own, s.cells).padStart(7)} ${pc(s.edge, s.taken).padStart(17)} | ${String(s.blades || '-').padStart(11)} ${s.blades ? pc(s.moved, s.blades).padStart(11) : ''} ${s.blades ? `${pc(s.wrapTus, s.wrapBlades).padStart(24)} / ${pc(s.tus - s.wrapTus, s.blades - s.wrapBlades)}` : ''}`);
  if (!s.cells) broken(`${name(fl)}: no cell seen on both sides of a step`);
  if (s.keptOff !== s.seen) broken(`${name(fl)}: with the savings off, ${s.seen - s.keptOff} of ${s.seen} cells are left out`);
  if (Math.abs(s.keptOn / s.seen - SAVING) > 0.02) broken(`${name(fl)}: with the savings at ${SAVING}, ${(100 * s.keptOn / s.seen).toFixed(1)} % of the cells are kept`);
  if (s.on) broken(`${name(fl)}: with the savings on, ${s.on} times a cell was drawn on one side of a step and not on the other`);
  if (s.off) broken(`${name(fl)}: with the savings off, ${s.off} times a cell was drawn on one side of a step and not on the other`);
  if (s.own) broken(`${name(fl)}: ${s.own} times a cell's number changed at a step`);
  if (s.edge) broken(`${name(fl)}: ${s.edge} cells' numbers taken at a cell's edge, where rounding picks the cell`);
  if (s.moved) broken(`${name(fl)}: ${s.moved} times a blade's foot moved at a step`);
  if (s.tus) broken(`${name(fl)}: ${s.tus} times a blade's tussock changed at a step`);
});
if (steps < 15 || single40 < 2) broken(`only ${steps} anchor steps on the walk, ${single40} of them single 40 m steps`);
if (wrapsX < 2 || wrapsY < 2) broken(`the anchor's place wrapped ${wrapsX} times east-west and ${wrapsY} times north-south: two each are needed`);
console.log(failed ? `grass places: ${failed} promise(s) broken` : 'grass places: every place keeps its blades, flowers and tussocks across every anchor step, and every cell is counted at its middle');
process.exit(failed ? 1 : 0);
