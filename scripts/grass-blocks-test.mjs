// The grass handed over block by block (life/grassBlocks.js) leaves out nothing the shader
// would have drawn (no browser, some seconds): node scripts/grass-blocks-test.mjs [--break reach|ring|table|height|stale|flowers|still]
//
// The real Grass over a made-up land (hills, a steep ridge, stretches with no grass, drifts of
// flowers) on a world of Haven's size, its tables filled; then the eye is turned through
// looks along the ground, down a slope, steeply down and up, from the ground and from 30 and
// 150 m up, and cull() is asked which blocks to hand over. For every cell of every field, and
// a foot at the cell's middle and at the four corners of where a foot can stand, the shader's
// own early tests are run here as it has them (the ring's distances, the table's nearest
// entry and `outside` with the field's reach, grass in the table at all; a flower's kind and
// its grass, and whether its own number lets it flower where the ground has so many, the number
// worked out in 32-bit sums as the shader does): a cell that passes them in a block that was left
// out, or a flower's cell that is not on the list of cells handed over, is a blade or a flower
// missing from the picture, and fails the test (exit 1).
// Also printed: the share of each field that is handed over (the saving), which must be under
// a half in the mean (a cull that keeps everything is no cull).
// --break <what>: one fault put into the culling, to see the test fail.
import * as THREE from 'three';
import { Grass, RINGS } from '../src/life/grass.js';
import { NB, NBLOCKS, blockWide, hash2x, FLOWER_MARGIN } from '../src/life/grassBlocks.js';
import { KINDS } from '../src/life/grassRules.js';

const brk = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : null;
const R = 250000;
let failed = 0;
const broken = (what) => { failed++; console.log('BROKEN: ' + what); };

// --- a land: hills 20 m high, a ridge with steep sides, bare stretches, grass elsewhere
const lat0 = 0.35, lon0 = 1.1;
const en = (d) => { const la = Math.asin(d[2]), lo = Math.atan2(d[1], d[0]); return [(lo - lon0) * R * Math.cos(lat0), (la - lat0) * R]; };
const land = (e, n) => 20 * Math.sin(e / 70) * Math.cos(n / 55) + 35 / (1 + ((e - 60) / 12) ** 2) + 0.4 * Math.sin(e / 3.1 + n / 2.3);
const bare = (e, n) => Math.sin(e / 23) * Math.sin(n / 31) > 0.55 || (e > 150 && e < 260 && n > -80 && n < 40);
const hs = { radius: R, waterDepth: 0, baseSlope: 0, height(x, y, z) { const [e, n] = en([x, y, z]); return land(e, n); }, coverAt(x, y, z) { const [e, n] = en([x, y, z]); return bare(e, n) ? 0 : 10; } };
const terrain = { shared: { uGrassWave: { value: new THREE.Vector4() }, uGrassTone: { value: new THREE.Vector4() }, uWind: { value: new THREE.Vector4(0.6, 0.8, 0, 5) } }, hs, coverSerial: 1, ringSerial: 1, tiles: { busy: false }, workers: { idle: 0 }, epoch: 0 };
const grass = new Grass(terrain, terrain.shared.uWind);
grass.setWorld({ life: { grass: { below: 80, mid: 220 }, flowers: { byClass: { 10: 'steppe' } } }, surface: {} });
grass.eager = true;
const renderer = { getDrawingBufferSize: (v) => v.set(1100, 515), initTexture() {} };
const fields = [...grass.rings, ...grass.flowers];
const name = (fl) => fl.f.id || `flowers ${fl.f.spacing} m`;

// --- the shader's numbers, read off the shaders themselves (a change there must be brought here)
const need = (s, re, what) => { const m = s.match(re); if (!m) { broken(`the shader has no ${what} (bring the replay in step)`); return ['', '0']; } return m; };
const rules = fields.map((fl) => {
  const vs = fl.mesh.material.vertexShader, d = fl.mesh.material.defines, blades = d.BLADES != null;
  need(vs, /bool outside\(vec4 cc, float m\) \{ return cc\.w < -m \|\| abs\(cc\.x\) > cc\.w \+ m \* \(1\.0 \+ projectionMatrix\[0\]\[0\]\) \|\| abs\(cc\.y\) > cc\.w \+ m \* \(1\.0 \+ abs\(projectionMatrix\[1\]\[1\]\)\); \}/, "`outside` as the replay has it");
  need(vs, /float ring = \(1\.0 - smoothstep\(OUT0, OUT1, dist\)\)/, 'ring going out over OUT0..OUT1');
  need(vs, /vec2 rc = \(n \+ 0\.5\) \* SPACING - uGrassCam\.xy;/, 'cell middle from the ground cell');
  const r = { blades, grid: +d.GRID, S: Number(d.SPACING), half: Number(d.HALF), out1: Number(d.OUT1), in0: d.IN0 != null ? Number(d.IN0) : null };
  if (blades) {
    r.jit = Number(need(vs, /vec2 foot2 = rc \+ \(hc - 0\.5\) \* \(([\d.]+) \* SPACING\)/, "blade's foot")[1]) / 2;
    need(vs, /if \(outside\(cc, REACH\)\) OUT_OF_PICTURE/, 'blades thrown out by REACH');
    need(vs, /float dens = clamp\(g\.g \* 2\.4 - 0\.1, 0\.0, 1\.0\);/, 'density from the table');
    r.reach = Number(d.REACH);
  } else {
    r.jit = Number(need(vs, /vec2 rel2 = rc \+ \(h - 0\.5\) \* ([\d.]+) \* SPACING/, "flower's place")[1]) / 2;
    r.reach = Number(need(vs, /groundUp\(gn, at\), 1\.0\), ([\d.]+)\)\) OUT_OF_PICTURE/, 'flowers thrown out by their reach')[1]);
    need(vs, /vec4 gn = tableNearest\(tTable, uTab, at \+ \(h3 - 0\.5\) \* uTab\.z\);/, "flower's kind from the nearest entry");
    need(vs, /float keep = step\(0\.1, g\.g\) \* keepOf\(ring, h\.x\);/, "flower kept by the grass's amount");
    need(vs, /vec2 h = hash2\(cell\), h2 = hash2\(cell \+ 23\.9\), h3 = hash2\(cell \+ 57\.1\);/, "flower's own numbers (h2 = hash2(cell + 23.9))");
    need(vs, /if \(kind < 0\.5 \|\| h2\.x >= fract\(gn\.a \+ 0\.001\) \* 1\.1 \* min\(1\.0, pow\(0\.036 \/ headSize, 2\.0\)\)\) OUT_OF_PICTURE/, 'rule for which cells flower');
    need(vs, /vec2 hash2\(vec2 p\) \{ vec3 q = fract\(vec3\(p\.xyx\) \* vec3\(0\.1031, 0\.1030, 0\.0973\)\); q \+= dot\(q, q\.yzx \+ 33\.33\); return fract\(\(q\.xx \+ q\.yz\) \* q\.zy\); \}/, 'hash2 as the culling works it out');
    r.seed = Number(d.SEED);
  }
  if (r.reach !== fl.cullBy.reach || Math.abs(r.jit * r.S - fl.cullBy.jitter) > 1e-9 || r.half !== fl.cullBy.half || r.out1 !== fl.cullBy.out1 || r.in0 !== fl.cullBy.in0)
    broken(`${name(fl)}: the culling is told reach ${fl.cullBy.reach}, jitter ${fl.cullBy.jitter}, half ${fl.cullBy.half}, ring ${fl.cullBy.in0}..${fl.cullBy.out1}; the shader has ${r.reach}, ${r.jit * r.S}, ${r.half}, ${r.in0}..${r.out1}`);
  return r;
});
if (failed) { console.log('grass blocks: the replay cannot run'); process.exit(1); }

// --- the faults (--break)
if (brk === 'reach') for (const fl of fields) fl.cullBy.reach = -8;                    // blocks at the picture's edge are left out
if (brk === 'ring') for (const fl of fields) fl.cullBy.out1 *= 0.8;                    // the ring's outer stretch is left out
if (brk === 'height') for (const k in grass.tables) { const s = grass.tables[k].sum, b = s.refresh.bind(s); s.refresh = (d) => { b(d); s.hi.set(s.lo); }; }      // the ground taken for level at its lowest
if (brk === 'table') for (const k in grass.tables) { const s = grass.tables[k].sum, b = s.refresh.bind(s); s.refresh = (d) => { b(d); for (let i = 0; i < s.amount.length; i += 3) s.amount[i] = 0; }; }      // a third of the land taken for bare
if (brk === 'flowers') for (const fl of fields) if (fl.list) fl.margin = -0.004;      // a flower's cell kept only when its number is far under the ground's share
// (the choosing kept from the last frame although the eye has turned)
if (brk === 'still') { const cull = grass.cull.bind(grass); grass.cull = (cam) => { if (grass._culled && grass._view) { cam.updateMatrixWorld(); const P = cam.projectionMatrix.elements, V = cam.matrixWorldInverse.elements; for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) grass._culled[c * 4 + r] = P[r] * V[c * 4] + P[4 + r] * V[c * 4 + 1] + P[8 + r] * V[c * 4 + 2] + P[12 + r] * V[c * 4 + 3]; } return cull(cam); }; }
if (brk === 'stale') for (const k in grass.tables) grass.tables[k].sum.touch = () => {};      // the summary never hears of a change to its table

// --- the eye
const rig = { agl: 1.7, pos: new THREE.Vector3() };
const place = (e, n, agl) => { rig.agl = agl; const la = lat0 + n / R, lo = lon0 + e / (R * Math.cos(la)); rig.pos.set(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)).multiplyScalar(R + land(e, n) + agl); };
const camera = new THREE.PerspectiveCamera(60, 880 / 412, 0.3, 30000);
const look = (heading, pitch, fov) => {
  const E = grass._e, N = grass._n, U = grass._u, h = heading * Math.PI / 180, p = pitch * Math.PI / 180;
  const f = new THREE.Vector3().addScaledVector(new THREE.Vector3(...E), Math.sin(h) * Math.cos(p)).addScaledVector(new THREE.Vector3(...N), Math.cos(h) * Math.cos(p)).addScaledVector(new THREE.Vector3(...U), Math.sin(p));
  camera.fov = fov; camera.updateProjectionMatrix();
  camera.position.set(0, 0, 0); camera.up.set(...U); camera.lookAt(f); camera.updateMatrixWorld(true);
};

const mod = (x, y) => x - y * Math.floor(x / y);
let cullMs = 0, culls = 0;
const stats = fields.map(() => ({ handed: 0, of: 0, could: 0, missing: 0, views: 0 }));
// one view: the fields' blocks as cull() chose them, against the shader's tests cell by cell
function check(label) {
  grass.update(rig, 1 / 30, renderer);
  if (!grass.mesh.visible) return;
  { const t = performance.now(); grass.cull(camera); cullMs += performance.now() - t; culls++; }
  const S = grass.shared, cam = S.uGrassCam.value, curve = S.uGrassCurve.value, E = grass._e, N = grass._n, U = grass._u;
  const P = camera.projectionMatrix.elements, pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  fields.forEach((fl, k) => {
    const r = rules[k], st = stats[k], T = fl.table, D = T.data, n = T.n, info = T.info.value, bw = blockWide(r.grid);
    if (!fl.want) return;
    st.views++;
    const listed = new Uint8Array(NBLOCKS), count = fl.list ? 0 : fl.mesh.visible ? fl.blockN.value : 0;
    for (let i = 0; i < count; i++) listed[fl.blocks.value[i]] = 1;
    if (!fl.list && fl.mesh.visible && fl.geo.instanceCount !== count * bw * bw) broken(`${name(fl)}: ${count} blocks listed and ${fl.geo.instanceCount} instances handed over`);
    // (a field of flowers: the cells on its list)
    const onList = fl.list ? new Uint8Array(r.grid * r.grid) : null;
    if (fl.list) {
      if (fl.mesh.visible && fl.mesh.geometry !== fl.list) broken(`${name(fl)}: culled, and not drawn from its list`);
      const a = fl.cells.array, m = fl.mesh.visible ? fl.list.instanceCount : 0;
      for (let i = 0; i < m; i++) { const q = a[i * 2 + 1] * r.grid + a[i * 2]; if (onList[q]++) broken(`${name(fl)}: the cell ${a[i * 2]},${a[i * 2 + 1]} is on the list twice`); }
      st.handed += m; st.of += r.grid * r.grid;
    } else { st.handed += count; st.of += NBLOCKS; }
    const lat = fl.lat.value, f32 = Math.fround, salt = f32(23.9);
    const px = fl.phase.value.x, py = fl.phase.value.y;
    const entry = (ax, ay) => (mod(Math.floor(ay), n) * n + mod(Math.floor(ax), n)) * 4;
    const outside = (x, y, z, m) => {
      const rx = E[0] * x + N[0] * y + U[0] * z, ry = E[1] * x + N[1] * y + U[1] * z, rz = E[2] * x + N[2] * y + U[2] * z;
      const X = pv[0] * rx + pv[4] * ry + pv[8] * rz + pv[12], Y = pv[1] * rx + pv[5] * ry + pv[9] * rz + pv[13], W = pv[3] * rx + pv[7] * ry + pv[11] * rz + pv[15];
      return W < -m || Math.abs(X) > W + m * (1 + P[0]) || Math.abs(Y) > W + m * (1 + Math.abs(P[5]));
    };
    for (let wy = 0; wy < r.grid; wy++) for (let wx = 0; wx < r.grid; wx++) {
      const block = Math.floor(wx / bw) + NB * Math.floor(wy / bw);
      if (fl.list ? onList[wy * r.grid + wx] : listed[block]) continue;
      const nx = Math.floor(((wx + px) * r.S - r.half + cam.x) / r.S), ny = Math.floor(((wy + py) * r.S - r.half + cam.y) / r.S);
      const rcx = (nx + 0.5) * r.S - cam.x, rcy = (ny + 0.5) * r.S - cam.y;
      let could = false;
      for (let c = 0; c < 5 && !could; c++) {
        const jx = c === 0 ? 0 : (c & 1 ? 1 : -1) * r.jit * 0.9999, jy = c === 0 ? 0 : (c & 2 ? 1 : -1) * r.jit * 0.9999;
        const fx = rcx + jx * r.S, fy = rcy + jy * r.S, dist = Math.hypot(fx, fy);
        if (dist >= r.out1 || (r.in0 != null && dist <= r.in0)) continue;
        const ax = fx + cam.x, ay = fy + cam.y, tx = (ax + info.x) / info.z, ty = (ay + info.y) / info.z;
        const up = (h) => h + curve.x - (ax * ax + ay * ay) * curve.y - cam.z;
        // (grass at all: the four entries round the place, as tableAt blends them)
        const amount = Math.max(D[entry(tx, ty) + 1], D[entry(tx + 1, ty) + 1], D[entry(tx, ty + 1) + 1], D[entry(tx + 1, ty + 1) + 1]);
        if (r.blades) {
          if (!(amount * 2.4 - 0.1 > 0)) continue;
          if (outside(fx, fy, up(D[entry(tx + 0.5, ty + 0.5)]), r.reach)) continue;
          could = true;
        } else {
          if (amount < 0.1) continue;
          // (its kind and the ground it is tested on: the nearest entry to a place up to half an entry off)
          // (and its own number against the share of cells that flower there: the shader's rule, in 32-bit sums)
          const h2x = hash2x(f32(f32(mod(nx + lat.x, 4096) + r.seed) + salt), f32(f32(mod(ny + lat.y, 4096) + r.seed) + salt));
          for (let q = 0; q < 4 && !could; q++) {
            const o = entry(tx + 0.5 + (q & 1 ? 0.4999 : -0.4999), ty + 0.5 + (q & 2 ? 0.4999 : -0.4999));
            const a = D[o + 3] + 0.001, kind = Math.floor(a);
            if (kind >= 1 && h2x < (a - kind) * 1.1 * Math.min(1, (0.036 / Number(KINDS[Math.min(kind, KINDS.length - 1)].size.toFixed(3))) ** 2) && !outside(fx, fy, up(D[o]), r.reach)) could = true;
          }
        }
      }
      if (could) { st.could++; st.missing++; if (st.missing <= 2) broken(`${name(fl)}, ${label}: the cell ${wx},${wy} of the window could be drawn and ${fl.list ? 'is not on the list' : `its block (${block % NB},${Math.floor(block / NB)}) was left out`}`); }
    }
  });
}

const t0 = Date.now();
let views = 0;
for (const [e, n] of [[0, 0], [48, 13], [130, -40], [205, -20], [-90, 160]]) for (const agl of [1.7, 30, 150]) {
  place(e, n, agl);
  grass.update(rig, 1 / 30, renderer); grass.update(rig, 1 / 30, renderer);
  for (const [heading, pitch, fov] of [[222, -2, 60], [64, 12, 40], [250, 3, 26], [10, -35, 60], [135, -80, 60], [300, 55, 50], [180, -12, 75]]) { look(heading, pitch, fov); check(`at ${e},${n} from ${agl} m, heading ${heading} pitch ${pitch}`); views++; }
}
console.log(`${views} views, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
{
  // (what the choosing costs the page, on this machine: a frame's cull of all eight fields, and the tables summed up again as they are when they change)
  // (a walk: 3 m a frame, the tables filled at the game's own pace, the summaries kept in step)
  grass.eager = false; let sum = 0, steps = 0;
  for (let i = 0; i < 120; i++) { place(i * 3, 20, 1.7); const t = performance.now(); grass.update(rig, 1 / 30, renderer); const whole = performance.now() - t; const t3 = performance.now(); for (const k in grass.tables) grass.tables[k].sum.refresh(grass.tables[k].data); void whole; sum += performance.now() - t3; steps++; }
  // (the summaries after the walk against the tables summed up whole)
  for (const k in grass.tables) { const T = grass.tables[k], s = T.sum, keep = [s.lo.slice(), s.hi.slice(), s.amount.slice(), s.flower.slice()]; s.build(T.data); if (![s.lo, s.hi, s.amount, s.flower].every((a, q) => a.every((v, i) => v === keep[q][i]))) broken(`the ${k} table's summary, kept in step over a walk, is not the table summed up whole`); }
  grass.eager = true; sum /= steps;
  // (at eye height, every field drawn: a frame's choosing with the flowers' lists as they are)
  // (where the most flowers' cells are listed, of a few places)
  grass.eager = true; let bestAt = null, bestN = -1;
  for (const [e, n] of [[0, 0], [48, 13], [130, -40], [-90, 160], [20, 90], [-40, -60]]) { place(e, n, 1.7); grass.update(rig, 1 / 30, renderer); grass.update(rig, 1 / 30, renderer); look(222, -2, 60); grass.cull(camera); const m = fields.reduce((a, fl) => a + (fl.list && fl.mesh.visible ? fl.list.instanceCount : 0), 0); if (m > bestN) { bestN = m; bestAt = [e, n]; } }
  place(bestAt[0], bestAt[1], 1.7); grass.update(rig, 1 / 30, renderer); grass.update(rig, 1 / 30, renderer); look(222, -2, 60);
  // (the least of twenty batches: the machine may be busy with something else)
  const least = (fn) => { let m = Infinity; for (let b = 0; b < 20; b++) { const t = performance.now(); for (let i = 0; i < 40; i++) fn(); m = Math.min(m, (performance.now() - t) / 40); } return m; };
  for (let i = 0; i < 200; i++) grass.cull(camera);
  const per = least(() => { grass._culledOk = false; grass.cull(camera); });
  // (and the flowers' lists made again, as when the window has moved by a cell)
  const again = least(() => { grass._culledOk = false; for (const fl of fields) if (fl.list) fl.listKey[0] = NaN; grass.cull(camera); });
  // (and with nothing moved since the frame before: the last choosing put on again, and the same)
  const fresh = fields.map((fl) => (fl.list ? Array.from(fl.cells.array.subarray(0, fl.list.instanceCount * 2)).join() : Array.from(fl.blocks.value.subarray(0, fl.blockN.value)).join() + '|' + fl.geo.instanceCount) + '|' + fl.mesh.visible);
  grass.update(rig, 1 / 30, renderer); const t5 = performance.now(); grass.cull(camera); const still = performance.now() - t5;
  const held = fields.map((fl) => (fl.list ? Array.from(fl.cells.array.subarray(0, fl.list.instanceCount * 2)).join() : Array.from(fl.blocks.value.subarray(0, fl.blockN.value)).join() + '|' + fl.geo.instanceCount) + '|' + fl.mesh.visible);
  if (fresh.some((x, i) => x !== held[i])) broken('with nothing moved, the choosing put on again from the last frame is not the choosing');
  if (fields.some((fl) => fl.list && fl.mesh.visible && fl.mesh.geometry !== fl.list)) broken('with nothing moved, a field of flowers is drawn whole');
  const listed = fields.filter((fl) => fl.list).map((fl) => `${fl.list.instanceCount} of ${fl.f.grid * fl.f.grid}`).join(', ');
  console.log(`choosing the blocks: ${per.toFixed(3)} ms a frame here while the eye moves; with the flowers' lists made again (the window moved by a cell): ${again.toFixed(3)} ms (cells on the lists: ${listed}); with nothing moved: ${still.toFixed(3)} ms`);
  if (again > 0.8) broken(`making the flowers' lists again costs the page ${again.toFixed(2)} ms: too much`);
  if (per > 0.5) broken(`choosing the blocks costs the page ${per.toFixed(2)} ms a frame: too much`);
}
console.log('field              views drawn  handed over (blocks; of a field of flowers, cells)  cells that could be drawn and were left out');
let handed = 0, of = 0;
fields.forEach((fl, k) => {
  const s = stats[k]; if (!fl.list) { handed += s.handed; of += s.of; }
  console.log(`${name(fl).padEnd(18)} ${String(s.views).padStart(11)} ${(s.of ? (100 * s.handed / s.of).toFixed(1) + ' %' : '-').padStart(19)} ${String(s.missing).padStart(14)}`);
  if (s.missing) broken(`${name(fl)}: ${s.missing} cells left out that the shader would have drawn`);
  if (!s.views) broken(`${name(fl)}: never drawn in the test's views`);
});
if (RINGS.length + 2 !== fields.length) broken('the fields are not the six rings and the two fields of flowers the test was written for');
if (handed / of > 0.5) broken(`${(100 * handed / of).toFixed(0)} % of the rings' blocks are handed over: the culling saves too little to be worth having`);
fields.forEach((fl, k) => { if (fl.list && stats[k].of && stats[k].handed / stats[k].of > 0.1) broken(`${name(fl)}: ${(100 * stats[k].handed / stats[k].of).toFixed(1)} % of its cells are on the list: one in ten at most can carry a flower here`); });
console.log(failed ? `grass blocks: ${failed} promise(s) broken` : `grass blocks: nothing the shader would draw is left out; ${(100 * handed / of).toFixed(0)} % of the rings' blocks are handed over, and of the flowers' cells ${fields.map((fl, k) => (fl.list ? (100 * stats[k].handed / Math.max(1, stats[k].of)).toFixed(1) + ' %' : null)).filter(Boolean).join(' and ')}`);
process.exit(failed ? 1 : 0);
