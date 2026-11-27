// The trees' shadows while the traveller moves, and what the governor's tree savings take back
// (no browser; some seconds). Findings shadows-2 and shadows-3 of
// docs/briefs/shadows-governor-10.md and the review of their fix, with the real Trees
// (life/trees.js) and the real NearShadow (shadows/nearShadow.js) run frame by frame on the
// trees Haven plants in its north wood (terrain workers' rule, life/treeBlock.js). The shadow
// pass is handed the trees' casters as app.js hands them (read from its source).
//
//   1. The gusts: when the lists are made again from a new anchor (every 25 m of a walk), no
//      tree's lean changes. Each tree's bend at the top of its crown, as TREE_VERT's own lines
//      work it out (run in JavaScript), before and after the rebuild at the same moment. (The
//      gust's phase was measured from the anchor: every tree, and its shadow, lurched 13 to
//      22 cm at once. Failed on 5024b61.)
//   2. Which mesh casts a tree's shadow: walking through the wood (4.5 m/s) with every saving
//      on, with the trees' full shapes to two thirds of their distance (trees-far) and without
//      the close mesh (tree-leaves), every tree the near trees draw casts exactly one shadow
//      every frame, and the mesh that casts it changes only in the frame the tree's own
//      picture changes between its near mesh and its far cards (the near radius); never at
//      the close radius, 20 m from the walker, where it changed 25 to 70 % of a tree's shadow
//      in one frame. (Failed on 5024b61.)
//   3. The fine tile draws only the first instances of each list (Trees.fineCount). Every
//      vertex is placed by TREE_VERT's own lines as the shadow pass compiles them (the body of
//      treePosition read from the shader and run in JavaScript; a line this test cannot read
//      stops it). First, every vertex of every mesh that casts, in still air and in a storm, in
//      summer and bare, lies within treeReach of its trunk, the rule the count is made by (a
//      TREE_VERT with crowns 15 % wider fails here at 18 720 vertices, a rule without the
//      wind's reach at 7 438). Then, tile by tile at the opening and in the north wood (low,
//      middle and high Sun; a 20 m/s storm; the near trees casting their cards): every tree
//      the fine tile leaves out cannot reach it, swayed at a dozen moments, and neither can any
//      tree the count's rule rules out on its own. And what the shadow pass draws, the rule of
//      5024b61 beside this one: printed.
//   4. What the governor's tree savings take back, in tree triangles a wide tile draw, at the
//      opening and in the north wood, for every combination of 'tree-leaves', 'trees-far' and
//      'tree-shadows': without the close mesh the shadow pass draws no more than on 5024b61
//      (the near trees cast their cards again: the saving takes back the near meshes' shadows
//      with the leaves, and the floor costs what it did); and no saving, given up on top of
//      any others, adds to it. (Failed on 5a05e2b: there the near trees cast their near mesh
//      whatever the governor did, 113k triangles in the wood with 'tree-leaves' given up
//      where 5024b61 drew 28k, and 38k at the floor where it drew 0.6k.)
//
// Run: node scripts/tree-shadow-test.mjs      (exit 1 on a failed check)
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { NearShadow } from '../src/shadows/nearShadow.js';
import * as TREES from '../src/life/trees.js';
import { loadWorld } from './lib/loadWorld.mjs';
import { setMadeCover } from './lib/madeCover.mjs';
import { treeBlock, blockDeg, blockLon } from '../src/life/treeBlock.js';
import { radii } from '../src/life/treeLod.js';

globalThis.fetch = () => new Promise(() => {}); globalThis.createImageBitmap = () => new Promise(() => {});      // (the trees' picture: not needed)
const { Trees, TREE_VERT, treeReach } = TREES;          // (treeReach: not in a build before it, where part 3's first check is left out)
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const RAD = Math.PI / 180, M = ['close', 'near', 'far'];

// ---- the game's objects, as app.js makes them (the near shadow first: the trees' materials take its uniforms)
let calls = [], current = null;
const renderer = {
  setRenderTarget(t) { current = t; }, clear() {}, getContext: () => ({ invalidateFramebuffer() {}, invalidateSubFramebuffer() {}, FRAMEBUFFER: 0, COLOR_ATTACHMENT0: 0 }),
  render(mesh, cam) { calls.push({ mesh, count: mesh.geometry.instanceCount, cam: cam.clone(), k: current.viewport.x > 0 ? (current.viewport.y > 0 ? 2 : 1) : 0 }); },
};
const ns = new NearShadow(renderer); ns.every = 1;           // (all tiles every frame)
const { world, hs } = await loadWorld('haven');
const wind = new THREE.Vector4(1, 0, 0, 6);
const workers = { idle: 0, run: () => null };
const terrain = { shared: { uWind: { value: wind } }, coverSerial: 1, ringSerial: 1, epoch: 1, workers, tiles: { busy: true }, wanted: [] };
const trees = new Trees(world, terrain);
trees.atlasReady = true;
// The casters as app.js hands them to the near shadow (a build before trees.casters: one a set, set.cast)
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const casters = trees.casters ?? trees.sets.flat(2).map((s) => ({ set: s, mesh: s.cast, bound: s.castBound, on: () => s.mesh.visible && (s.lod <= 1 || trees.shadowsFar), fineCount: trees.fineCount ? () => trees.fineCount(s) : null }));
if (trees.casters) check(/for \(const (\w+) of this\.trees\.casters\) this\.nearShadow\.addCaster\(\1\.mesh, this\.trees\.depthMaterial, \1\.on, \1\.fineCount\)/.test(appSrc), 'app.js does not hand the near shadow the trees\' casters as this test does');
const casterOf = new Map();
for (const c of casters) {
  const trio = trees.sets.flat().find((t) => t.includes(c.set));
  c.make = trio.findIndex((o) => o.geo.attributes.position === c.mesh.geometry.attributes.position);       // (which of its trio's shapes it draws)
  casterOf.set(c.mesh, c);
  ns.addCaster(c.mesh, trees.depthMaterial, c.on, c.fineCount);
}
const makesOf = (lod) => casters.filter((c) => c.set === trees.sets[0][0][lod]).map((c) => M[c.make]).join(' or ');
console.log(`a close tree's shadow is cast by its ${makesOf(0)} mesh, a near tree's by its ${makesOf(1)} mesh, a far one's by its ${makesOf(2)} mesh`);

// ---- a place's trees, as the workers plant them, handed to the trees as arrived blocks
const R = world.radius;
function plant(lat, lon) {
  setMadeCover(hs, world, lat, lon);
  trees.setWorld(world); trees.atlasReady = true;
  const DEG = blockDeg(R), bi0 = Math.floor(lat / DEG), nb = 5;
  for (let bi = bi0 - nb; bi <= bi0 + nb; bi++) {
    const dLon = blockLon(bi, DEG), count = Math.round(360 / dLon), bj0 = Math.floor(lon / dLon);
    for (let bu = bj0 - nb; bu <= bj0 + nb; bu++) {
      const bj = ((bu % count) + count) % count, b = treeBlock(hs, bi, bj, world.life.trees.spacing ?? 7);
      trees.blocks.set(bi + ':' + bj, { state: 1, origin: b.origin, trees: b.trees, count: b.count, vis: null, used: 1e12 });
    }
  }
  trees.serial = terrain.coverSerial * 100000 + terrain.ringSerial;          // (the blocks are of these maps)
}
// The governor's three tree savings (perf/governor.js: tree-leaves, trees-far, tree-shadows), as their steps apply them
const savings = (leaves, far, shadows) => { trees.closeOn = !leaves; trees.dirty = true; trees.setFraction(far ? 0.66 : 1); trees.shadowsFar = !shadows; };
// The eye 1.7 m over the ground at a place (the ground: the nearest tree's foot)
const frameAt = (lat, lon) => {
  const up = new THREE.Vector3(Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD));
  const east = new THREE.Vector3(-Math.sin(lon * RAD), Math.cos(lon * RAD), 0), north = new THREE.Vector3().crossVectors(up, east);
  return { up, east, north };
};
const groundUnder = (dir) => {
  let best = 1e18, r = R;
  for (const b of trees.blocks.values()) for (let k = 0, q = 0; k < b.count; k++, q += 10) {
    const x = b.origin[0] + b.trees[q], y = b.origin[1] + b.trees[q + 1], z = b.origin[2] + b.trees[q + 2], l = Math.hypot(x, y, z);
    const d = (x / l - dir.x) ** 2 + (y / l - dir.y) ** 2 + (z / l - dir.z) ** 2;
    if (d < best) { best = d; r = l; }
  }
  return r;
};
const rig = { pos: new THREE.Vector3(), agl: 1.7, velocity: new THREE.Vector3(), onFoot: true, footVel: new THREE.Vector3(), localUp: [0, 0, 1] };
const place = (dir) => { const d = dir.clone().normalize(); rig.pos.copy(d).multiplyScalar(groundUnder(d) + 1.7); rig.localUp = [d.x, d.y, d.z]; };
const sunAt = (F, elev, az) => F.up.clone().multiplyScalar(Math.sin(elev * RAD)).addScaledVector(F.east, Math.cos(elev * RAD) * Math.sin(az * RAD)).addScaledVector(F.north, Math.cos(elev * RAD) * Math.cos(az * RAD)).normalize();
const DAY = 172, sh = trees.shared;

// TREE_VERT's own lines for the lean, run in JavaScript: a tree's bend at the top of its crown
const vert = TREE_VERT.split('\n'), grab = (name) => {
  const l = vert.find((x) => new RegExp(`^\\s*float ${name}\\s*=`).test(x));
  if (!l) throw new Error(`TREE_VERT has no line for ${name}: teach the test`);
  return l.trim().replace(/^float \w+\s*=\s*/, '').replace(/;\s*(\/\/.*)?$/, '').replace(/\.xyz/g, '');
};
const bendOf = new Function('sin', 'dot', 'uSeason', 'iA', 'iB', 'uTreeWind', 'uGustPhase', 'p', 'aSway',
  `const gust = ${grab('gust')}; const swing = ${grab('swing')}; return ${grab('bend')};`).bind(null, Math.sin, (a, b) => a.x * b.x + a.y * b.y + a.z * b.z);

// Where TREE_VERT puts a vertex, as the shadow pass compiles it (TREE_DEPTH defined): the body
// of treePosition, line by line, made into JavaScript. Scalar lines are taken as they are; the
// few that work on vectors must be in a form this knows, or the test stops (teach it, and
// Trees.fineCount, what the new line does). Returns the vertex from the camera.
const placeVertex = (() => {
  const lines = [], stack = [];
  for (const l of TREE_VERT.split('\n')) {
    const t = l.replace(/\/\/.*$/, '').trim(); let m;
    if ((m = /^#ifdef\s+(\w+)/.exec(t))) { stack.push(m[1] === 'TREE_DEPTH'); continue; }
    if ((m = /^#ifndef\s+(\w+)/.exec(t))) { stack.push(m[1] !== 'TREE_DEPTH'); continue; }
    if (t.startsWith('#else')) { stack.push(!stack.pop()); continue; }
    if (t.startsWith('#endif')) { stack.pop(); continue; }
    if (t.startsWith('#')) throw new Error(`TREE_VERT has a directive this test cannot follow: "${t}" (teach the test)`);
    if (stack.every(Boolean)) lines.push(t);
  }
  const at = lines.findIndex((l) => /^vec3 treePosition\(/.test(l)), end = lines.findIndex((l, k) => k > at && l === '}');
  if (at < 0 || end < 0) throw new Error('TREE_VERT has no treePosition this test can find: teach the test');
  // (split at the commas outside brackets)
  const parts = (s) => { const o = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { o.push(cur.trim()); cur = ''; } else cur += ch; } o.push(cur.trim()); return o; };
  const js = (e) => e.replace(/\.xyz\b/g, '');
  const decl = (list, kw = 'const') => parts(list).map((d) => { const m = /^(\w+)\s*=\s*(.+)$/.exec(d); if (!m) throw new Error(`TREE_VERT: "${d}" (teach the test)`); return `${kw} ${m[1]} = ${js(m[2])};`; }).join(' ');
  const out = [];
  for (const l of lines.slice(at + 1, end)) {
    if (!l) continue;
    let m;
    if (l === 'foot = uAnchorRel + iA.xyz;') out.push('const foot = { x: uAnchorRel.x + iA.x, y: uAnchorRel.y + iA.y, z: uAnchorRel.z + iA.z };');
    else if (l === 'vec3 p = position;') out.push('const p = { x: position.x, y: position.y, z: position.z };');
    else if ((m = /^float (.+);$/.exec(l))) out.push(decl(m[1]));
    else if ((m = /^p\.xz \*= (.+);$/.exec(l))) out.push(`{ const k = ${js(m[1])}; p.x *= k; p.z *= k; }`);
    else if ((m = /^vec3 l = vec3\((.+)\) \* iA\.w;$/.exec(l))) { const c = parts(m[1]); if (c.length !== 3) throw new Error(`TREE_VERT: "${l}" (teach the test)`); out.push(`const l = { x: (${js(c[0])}) * iA.w, y: (${js(c[1])}) * iA.w, z: (${js(c[2])}) * iA.w };`); }
    // (a far tree's crown top is drawn in toward its trunk when seen from low down and near: it
    // only ever makes the tree narrower, so the reach fineCount goes by stays an upper bound)
    else if ((m = /^if \(aCrown\.z > 2\.5\) p\.xz \*= mix\(mix\(([\d.]+), 1\.0, smoothstep\(([\d.-]+), ([\d.-]+), dot\(-normalize\(foot \+ uTreeUp \* \(iA\.w \* ([\d.]+)\)\), uTreeUp\)\)\), 1\.0, smoothstep\(([\d.]+), ([\d.]+), length\(foot\)\)\);$/.exec(l))) {
      const [, A, T0, T1, K, D0, D1] = m;
      out.push(`if (aCrown.z > 2.5) { const fx = foot.x + uTreeUp.x * (iA.w * ${K}), fy = foot.y + uTreeUp.y * (iA.w * ${K}), fz = foot.z + uTreeUp.z * (iA.w * ${K}), fl = Math.hypot(fx, fy, fz) || 1, d = -(fx * uTreeUp.x + fy * uTreeUp.y + fz * uTreeUp.z) / fl;`
        + ` const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }, k0 = ${A} + (1 - ${A}) * ss(${T0}, ${T1}, d), k = k0 + (1 - k0) * ss(${D0}, ${D1}, Math.hypot(foot.x, foot.y, foot.z)); if (!(k <= 1 + 1e-9)) throw new Error('the crown top grew'); p.x *= k; p.z *= k; }`);
    }
    else if (/^treeCull = /.test(l) || l === 'leaf = aLeaf;') continue;          // (whether it is drawn, and what it is: not where)
    else if (l === 'vec3 flutter = vec3(0.0);') out.push('const flutter = { x: 0, y: 0, z: 0 };');
    else if ((m = /^if \((.+?)\) \{ float (.+?); flutter = \(uTreeEast \* sin\((.+?)\) \+ uTreeUp \* sin\((.+?)\) \+ uTreeNorth \* sin\((.+?)\)\) \* amp; \}$/.exec(l))) {
      out.push(`if (${js(m[1])}) { ${decl(m[2])} const fe = sin(${js(m[3])}) * amp, fu = sin(${js(m[4])}) * amp, fn = sin(${js(m[5])}) * amp;`
        + ' flutter.x = uTreeEast.x * fe + uTreeUp.x * fu + uTreeNorth.x * fn; flutter.y = uTreeEast.y * fe + uTreeUp.y * fu + uTreeNorth.y * fn; flutter.z = uTreeEast.z * fe + uTreeUp.z * fu + uTreeNorth.z * fn; }');
    } else if (l === 'return foot + (uTreeEast * l.x + uTreeUp * l.y + uTreeNorth * l.z + uTreeWind.xyz * bend + flutter) * fade;') {
      out.push('return { x: foot.x + (uTreeEast.x * l.x + uTreeUp.x * l.y + uTreeNorth.x * l.z + uTreeWind.x * bend + flutter.x) * fade, y: foot.y + (uTreeEast.y * l.x + uTreeUp.y * l.y + uTreeNorth.y * l.z + uTreeWind.y * bend + flutter.y) * fade, z: foot.z + (uTreeEast.z * l.x + uTreeUp.z * l.y + uTreeNorth.z * l.z + uTreeWind.z * bend + flutter.z) * fade };');
    } else throw new Error(`TREE_VERT's treePosition has a line this test cannot read: "${l}" (teach the test, and Trees.fineCount, what it does)`);
  }
  const names = ['position', 'aLeaf', 'aSway', 'aCrown', 'iA', 'iB', 'uAnchorRel', 'uTreeEast', 'uTreeUp', 'uTreeNorth', 'uTreeWind', 'uGustPhase', 'uSeason'];
  const fn = new Function('sin', 'cos', 'min', 'max', 'dot', 'vec3', 'env', `const { ${names.join(', ')} } = env; ${out.join('\n')}`);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z, vec3 = (x, y = x, z = x) => ({ x, y, z });
  return (env) => fn(Math.sin, Math.cos, Math.min, Math.max, dot, vec3, env);
})();

// every tree drawn now, by its own number and place: [set, instance]
const drawn = () => {
  const out = new Map(), a = sh.uAnchorRel.value, cut = sh.uLodCut.value, rad = sh.uTreeRadius.value, A = trees.anchor;
  for (const s of trees.sets.flat(2)) for (let i = 0; i < s.count; i++) {
    const I = s.iA.array, x = I[4 * i], y = I[4 * i + 1], z = I[4 * i + 2];
    // (the vertex shader's cut: past the radius, or a far card inside the near radius at the last choice)
    if (Math.hypot(a.x + x, a.y + y, a.z + z) > rad || (s.lod === 2 && Math.hypot(x - cut.x, y - cut.y, z - cut.z) < cut.w)) continue;
    const key = `${s.iB.array[4 * i + 2]}|${Math.round(A.x + x)},${Math.round(A.y + y)},${Math.round(A.z + z)}`;
    const e = out.get(key) || []; e.push([s, i]); out.set(key, e);
  }
  return out;
};

const NORTH_WOOD = [22.983, 129.507], OPENING = [world.scene.start.lat, world.scene.start.lon];
plant(...NORTH_WOOD);
const F0 = frameAt(...NORTH_WOOD);

// ---- 1. the gusts through a rebuild ------------------------------------------------------
{
  savings(false, false, false);
  const leans = () => {
    const out = new Map();
    for (const [key, list] of drawn()) {
      const [s, i] = list[0], I = s.iA.array, B = s.iB.array;
      const iA = { x: I[4 * i], y: I[4 * i + 1], z: I[4 * i + 2], w: I[4 * i + 3] }, iB = { x: B[4 * i], y: B[4 * i + 1], z: B[4 * i + 2], w: B[4 * i + 3] };
      out.set(key, bendOf(sh.uSeason.value, iA, iB, wind, sh.uGustPhase ? sh.uGustPhase.value : 0, { x: 0.2 * iB.x, y: 1.0 }, { x: 1, y: 1 }));
    }
    return out;
  };
  for (const [name, speed, dirOf] of [['with the wind', 6, (f) => f.east], ['across it', 10, (f) => f.north], ['at 60 degrees to it', 10, (f) => f.east.clone().multiplyScalar(0.5).addScaledVector(f.north, 0.866)]]) {
    plant(...NORTH_WOOD);
    wind.set(F0.east.x, F0.east.y, F0.east.z, speed);
    place(F0.up); const p0 = rig.pos.clone();
    trees.update(rig, DAY, 100); const before = leans(), A0 = trees.anchor.clone();
    // the eye on, just past the rebuild distance; the lists are made again from there
    const dir = dirOf(F0);
    place(p0.clone().normalize().multiplyScalar(R).addScaledVector(dir, 26)); trees.update(rig, DAY, 100);
    check(trees.anchor.distanceTo(A0) > 20, `${name}: the lists were not made again from a new anchor (the test moved nothing)`);
    const after = leans();
    let n = 0, sum = 0, max = 0, over5 = 0;
    for (const [key, b0] of before) {
      const b1 = after.get(key); if (b1 === undefined) continue;
      const d = Math.abs(b1 - b0); n++; sum += d; max = Math.max(max, d); if (d > 0.05) over5++;
    }
    console.log(`1. walking ${name} (wind ${speed} m/s): ${n} trees in both lists; at the rebuild a crown top moves ${(100 * sum / Math.max(1, n)).toFixed(1)} cm on average, up to ${(100 * max).toFixed(1)} cm (${over5} trees over 5 cm)`);
    check(n > 500, `1. ${name}: only ${n} trees were in both lists`);
    check(max < 0.001, `1. walking ${name}: the trees lurch when the lists are made again (up to ${(100 * max).toFixed(1)} cm at once, ${over5} trees over 5 cm)`);
  }
}

// ---- 2. which mesh casts each tree's shadow, walking -------------------------------------
for (const [label, leaves, far, walk] of [['every saving on', false, false, 120], ["the governor's trees-far given up", false, true, 80], ["the governor's tree-leaves given up", true, false, 80]]) {
  plant(...NORTH_WOOD); wind.set(F0.east.x, F0.east.y, F0.east.z, 6);
  savings(leaves, far, false);
  const hd = 6 * RAD, dir = F0.north.clone().multiplyScalar(Math.cos(hd)).addScaledVector(F0.east, Math.sin(hd)), speed = 4.5, fps = 30;
  const g0 = F0.up.clone().multiplyScalar(R);
  rig.footVel.copy(dir).multiplyScalar(speed);
  let prev = null, frames = 0, swaps = 0, atNear = 0, notAtNear = 0, twice = 0, onLine = 0, worst = null, closeRule = 0, changes = 0, wrongCount = 0, wrongWhat = null;
  const { close, near } = radii(far ? 0.66 : 1, !leaves), cut = sh.uLodCut.value;
  for (let f = 0; f * speed / fps <= walk; f++, frames++) {
    place(g0.clone().addScaledVector(dir, f * speed / fps));
    trees.update(rig, DAY, f / fps);
    // (the casters on for each set now: exactly one for a set that is drawn and casts, none for any other)
    const castNow = new Map();
    for (const c of casters) if (c.on()) castNow.set(c.set, [...(castNow.get(c.set) || []), c.make]);
    for (const s of trees.sets.flat(2)) {
      const want = s.mesh.visible && (s.lod <= 1 || trees.shadowsFar) ? 1 : 0, got = (castNow.get(s) || []).length;
      if (got !== want) { wrongCount++; wrongWhat = wrongWhat || `a ${M[s.lod]} list drawn ${s.mesh.visible ? 'and' : 'but not'} casting with ${got} meshes at frame ${f}`; }
    }
    const now = new Map();
    for (const [key, list] of drawn()) {
      // (a tree within a centimetre of the near radius at a choice is drawn by both its near mesh and
      // its far card for that choice, by design: life/treeLod.js CUT_IN. Anything else drawn twice is wrong.)
      if (list.length > 1) {
        const card = list.find(([s]) => s.lod === 2), I = card && card[0].iA.array, i = card && card[1];
        const d = card ? Math.hypot(I[4 * i] - cut.x, I[4 * i + 1] - cut.y, I[4 * i + 2] - cut.z) : -1;
        if (list.length === 2 && card && list.some(([s]) => s.lod < 2) && d >= cut.w && d < cut.w + 0.02) onLine++; else twice++;
      }
      const P = list.map(([s]) => s.lod).sort().join(''), C = [...new Set(list.flatMap(([s]) => castNow.get(s) || []))].sort().join('');
      now.set(key, { P, C, nearish: /[01]/.test(P), far: P.includes('2') });
    }
    if (prev) for (const [key, t] of now) {
      const o = prev.get(key); if (!o) continue;
      if (o.P !== t.P) { changes++; if (!o.far && !t.far) closeRule++; }
      if (o.C === t.C) continue;
      swaps++;
      if (o.nearish !== t.nearish || o.far !== t.far) atNear++;
      else { notAtNear++; if (!worst) worst = `a tree drawn as its ${[...o.P].map((x) => M[x]).join(' and ')} mesh, then its ${[...t.P].map((x) => M[x]).join(' and ')} mesh, at frame ${f}`; }
    }
    prev = now;
  }
  const secs = walk / speed;
  console.log(`2. ${label}: ${walk} m through the north wood at ${speed} m/s (close ${close.toFixed(1)} m, near ${near.toFixed(1)} m): ${changes} times a tree's picture changed (${closeRule} at the close radius); ${swaps} shadows changed mesh, ${atNear} where the tree's own picture went between its near mesh and its cards (${(atNear / secs).toFixed(1)} a second), ${notAtNear} anywhere else (${(notAtNear / secs).toFixed(1)} a second)`);
  check(changes > 20 && (leaves || closeRule > 20), `2. ${label}: the walk changed a tree's picture only ${changes} times (${closeRule} at the close radius): it tests nothing`);
  check(wrongCount === 0, `2. ${label}: ${wrongCount} times a set did not cast with exactly one mesh (${wrongWhat})`);
  check(twice === 0, `2. ${label}: ${twice} times a tree was drawn by two lists at once away from the near radius`);
  check(notAtNear === 0, `2. ${label}: a tree's shadow changed its mesh where its picture did not change between near mesh and cards: ${notAtNear} times (${worst})`);
}

// ---- 3. the fine tile's count, and what the shadow pass draws ----------------------------
{
  const trisOf = (geo) => geo.attributes.position.count / 3;
  const oldCast = (s) => { const trio = trees.sets.flat().find((t) => t.includes(s)); return trio[Math.min(2, s.lod + 1)]; };
  // Can instance i of caster c reach the fine tile drawn with camera cam? Its every vertex as TREE_VERT places it, at a dozen moments.
  const env = { position: { x: 0, y: 0, z: 0 }, aLeaf: 0, aSway: { x: 0, y: 0 }, aCrown: { x: 0, y: 0, z: 0 }, iA: null, iB: null, uAnchorRel: null, uTreeEast: null, uTreeUp: null, uTreeNorth: null, uTreeWind: null, uGustPhase: 0, uSeason: { x: 0, y: 0, z: 0 } };
  const reaches = (c, i, cam) => {
    const s = c.set, I = s.iA.array, B = s.iB.array, g = c.mesh.geometry, P = g.attributes.position.array, L = g.attributes.aLeaf.array, S = g.attributes.aSway.array, v = new THREE.Vector3();
    env.iA = { x: I[4 * i], y: I[4 * i + 1], z: I[4 * i + 2], w: I[4 * i + 3] }; env.iB = { x: B[4 * i], y: B[4 * i + 1], z: B[4 * i + 2], w: B[4 * i + 3] };
    env.uAnchorRel = sh.uAnchorRel.value; env.uTreeEast = sh.uTreeEast.value; env.uTreeUp = sh.uTreeUp.value; env.uTreeNorth = sh.uTreeNorth.value;
    env.uTreeWind = wind; env.uGustPhase = sh.uGustPhase ? sh.uGustPhase.value : 0; env.uSeason.x = sh.uSeason.value.x; env.uSeason.y = sh.uSeason.value.y;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let t = 0; t < 12; t++) {
      env.uSeason.z = 3.7 * t;
      for (let j = 0, n = P.length / 3; j < n; j++) {
        env.position.x = P[3 * j]; env.position.y = P[3 * j + 1]; env.position.z = P[3 * j + 2]; env.aLeaf = L[j]; env.aSway.x = S[2 * j]; env.aSway.y = S[2 * j + 1]; { const C = g.attributes.aCrown; env.aCrown.z = C ? C.array[3 * j + 2] : 0; }
        const w = placeVertex(env);
        v.set(w.x, w.y, w.z).project(cam);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    }
    return x1 > -1 && x0 < 1 && y1 > -1 && y0 < 1;
  };
  // (the placement read from the shader agrees with the lean part 1 reads: a tree's top, no flutter)
  {
    plant(...OPENING); savings(false, false, false); place(frameAt(...OPENING).up); trees.update(rig, DAY, 0);
    const s = trees.sets.flat(2).find((x) => x.count > 0 && x.lod < 2), I = s.iA.array, B = s.iB.array;
    env.iA = { x: I[0], y: I[1], z: I[2], w: I[3] }; env.iB = { x: B[0], y: B[1], z: B[2], w: B[3] };
    Object.assign(env, { uAnchorRel: sh.uAnchorRel.value, uTreeEast: sh.uTreeEast.value, uTreeUp: sh.uTreeUp.value, uTreeNorth: sh.uTreeNorth.value, uTreeWind: wind, uGustPhase: sh.uGustPhase ? sh.uGustPhase.value : 0 });
    env.uSeason.z = 5; env.position = { x: 0, y: 1, z: 0 }; env.aLeaf = 0; env.aSway = { x: 1, y: 0 };
    const top = placeVertex(env), bend = bendOf(env.uSeason, env.iA, env.iB, wind, env.uGustPhase, { x: 0, y: 1 }, env.aSway);
    const want = new THREE.Vector3(env.uAnchorRel.x + env.iA.x, env.uAnchorRel.y + env.iA.y, env.uAnchorRel.z + env.iA.z).addScaledVector(env.uTreeUp, env.iA.w).addScaledVector(wind, bend);
    check(Math.hypot(top.x - want.x, top.y - want.y, top.z - want.z) < 1e-6, '3. TREE_VERT read line by line does not put a tree\'s top where its own lean says: the test reads the shader wrongly');
  }
  // Every vertex of every mesh that casts lies within treeReach of its trunk (the rule fineCount
  // counts by), placed by TREE_VERT's own lines: two crowns, a summer tree and a bare one, still
  // air to a storm, eight moments of wind. Tile by tile below, only the trees near a tile's edge
  // can show a rule that is short; here every vertex can.
  if (treeReach) {
    const seen = new Set(), h = 20, env3 = { position: { x: 0, y: 0, z: 0 }, aLeaf: 0, aSway: { x: 0, y: 0 }, aCrown: { x: 0, y: 0, z: 0 }, iA: { x: 0, y: 0, z: 0, w: h }, iB: null, uAnchorRel: { x: 0, y: 0, z: 0 }, uTreeEast: { x: 1, y: 0, z: 0 }, uTreeUp: { x: 0, y: 1, z: 0 }, uTreeNorth: { x: 0, y: 0, z: 1 }, uTreeWind: null, uGustPhase: 1.3, uSeason: { x: 0, y: 0, z: 0 } };
    let verts = 0, used = 0, over = 0, worst = '';
    for (const c of casters) {
      const g = c.mesh.geometry; if (seen.has(g.attributes.position)) continue; seen.add(g.attributes.position);
      const P = g.attributes.position.array, L = g.attributes.aLeaf.array, S = g.attributes.aSway.array, lo = h * c.bound.lo, hi = h * c.bound.hi;
      for (const [crown, turn, own, drops, bare] of [[0.7, 0.4, 0.13, 0, 0], [1.3, 2.2, 0.71, 1, 1]]) for (const W of [0, 8, 20]) {
        env3.iB = { x: crown, y: turn, z: own, w: drops }; env3.uSeason.y = bare; env3.uTreeWind = { x: 0.6, y: 0, z: 0.8, w: W };
        const lim = treeReach(c.bound, h, crown, W);
        for (let t = 0; t < 8; t++) {
          env3.uSeason.z = 2.3 * t + 0.7;
          for (let j = 0, n = P.length / 3; j < n; j++) {
            env3.position.x = P[3 * j]; env3.position.y = P[3 * j + 1]; env3.position.z = P[3 * j + 2]; env3.aLeaf = L[j]; env3.aSway.x = S[2 * j]; env3.aSway.y = S[2 * j + 1]; { const C = g.attributes.aCrown; env3.aCrown.z = C ? C.array[3 * j + 2] : 0; }
            const v = placeVertex(env3), y = Math.min(hi, Math.max(lo, v.y)), d = Math.hypot(v.x, v.y - y, v.z);
            verts++; used = Math.max(used, d / lim);
            if (d > lim * (1 + 1e-9) + 1e-9) { over++; if (!worst) worst = `a vertex of a ${M[c.make]} mesh ${d.toFixed(2)} m from the trunk of a tree ${h} m tall, crown ${crown}, wind ${W} m/s, where treeReach allows ${lim.toFixed(2)} m`; }
          }
        }
      }
    }
    console.log(`3. ${seen.size} meshes that cast, ${verts} vertices placed by TREE_VERT: the farthest from its trunk is at ${(100 * used).toFixed(1)} % of treeReach; ${over} beyond it`);
    check(verts > 1e5, `3. only ${verts} vertices were placed: the check of treeReach tests nothing`);
    check(over === 0, `3. ${over} vertices lie farther from their trunk than treeReach (the fine count's rule) allows: ${worst}`);
  } else console.log('3. (no treeReach in this build: the vertex-by-vertex check of the fine count\'s rule is left out)');
  let ruledAll = 0;
  const CASES = [
    ['the opening', OPENING, 19.5, 200, 12, false], ['the opening', OPENING, 45, 120, 12, false], ['the opening', OPENING, 70, 300, 3, false],
    ['the north wood', NORTH_WOOD, 19.5, 200, 12, false], ['the north wood', NORTH_WOOD, 45, 120, 12, false], ['the north wood', NORTH_WOOD, 70, 300, 3, false],
    ['the north wood, a storm', NORTH_WOOD, 19.5, 40, 20, false], ['the north wood, tree-leaves given up', NORTH_WOOD, 30, 160, 12, true],
  ];
  for (const [pname, at, elev, az, W, leaves] of CASES) {
    plant(...at);
    const F = frameAt(...at);
    wind.set(F.east.x * 0.6 + F.north.x * 0.8, F.east.y * 0.6 + F.north.y * 0.8, F.east.z * 0.6 + F.north.z * 0.8, W);
    savings(leaves, false, false);
    place(F.up); trees.update(rig, DAY, 0);
    calls = []; ns._has = false;
    ns.render(rig.pos, sunAt(F, elev, az), rig.localUp);
    let wideNow = 0, fineNow = 0, today = 0, left = 0, wrong = 0, picture = 0, ruled = 0, wrongRule = 0;
    for (const s of trees.sets.flat(2)) { if (!s.count) continue; today += s.count * trisOf(oldCast(s).geo); picture += s.count * s.tris; }
    for (const call of calls) {
      const c = casterOf.get(call.mesh); if (!c) continue;
      const s = c.set, tris = trisOf(call.mesh.geometry) * call.count;
      if (call.k === 0) wideNow += tris;
      if (call.k !== 1) continue;
      fineNow += tris;
      call.cam.updateMatrixWorld(true);
      for (let i = call.count; i < s.count; i++) { left++; if (reaches(c, i, call.cam)) wrong++; }
      // (and the rule tree by tree, where it matters: each tree the count's rule says cannot reach, alone)
      if (trees.fineCount) for (let i = 0; i < Math.min(call.count, s.count); i++) {
        const one = { count: 1, castBound: c.bound, iA: { array: s.iA.array.subarray(4 * i, 4 * i + 4) }, iB: { array: s.iB.array.subarray(4 * i, 4 * i + 4) } };
        if (trees.fineCount(one, c.bound) === 0) { ruled++; if (reaches(c, i, call.cam)) wrongRule++; }
      }
    }
    const n = (x) => `${(x / 1000).toFixed(1)}k`;
    console.log(`3. ${pname}, Sun ${elev} deg, wind ${W} m/s: tree triangles per tile draw (wide, fine): 5024b61 ${n(today)}, ${n(today)}; now ${n(wideNow)}, ${n(fineNow)} (the trees in the picture: ${n(picture)}); ${left} instances left out of the fine tile, ${wrong} of them could reach it; ${ruled} more ruled out one by one, ${wrongRule} of them could reach it`);
    check(calls.some((c) => c.k === 1 && casterOf.has(c.mesh)), `3. ${pname}: no tree was drawn into the fine tile (the test draws nothing)`);
    check(wrong === 0, `3. ${pname}, Sun ${elev} deg, wind ${W} m/s: ${wrong} trees whose shadow can fall on the fine tile were left out of it`);
    check(wrongRule === 0, `3. ${pname}, Sun ${elev} deg, wind ${W} m/s: the fine count's rule says ${wrongRule} trees cannot reach the fine tile that can`);
    ruledAll += ruled;
  }
  check(!trees.fineCount || ruledAll > 200, `3. the count's rule was tried on only ${ruledAll} trees it rules out inside the lists: it is hardly tested`);
}

// ---- 4. what the governor's tree savings take back from the shadow pass ------------------
{
  const trisOf = (geo) => geo.attributes.position.count / 3;
  const oldCast = (s) => { const trio = trees.sets.flat().find((t) => t.includes(s)); return trio[Math.min(2, s.lod + 1)]; };
  const n = (x) => `${(x / 1000).toFixed(1)}k`;
  for (const [pname, at] of [['the opening', OPENING], ['the north wood', NORTH_WOOD]]) {
    const F = frameAt(...at), wide = new Map(), rows = [];
    for (let bits = 0; bits < 8; bits++) {
      const leaves = !!(bits & 1), far = !!(bits & 2), shadows = !!(bits & 4);
      plant(...at); wind.set(F.east.x, F.east.y, F.east.z, 6);
      savings(leaves, far, shadows);
      place(F.up); trees.update(rig, DAY, 0);
      calls = []; ns._has = false;
      ns.render(rig.pos, sunAt(F, 45, 120), rig.localUp);
      let now = 0, then = 0;
      for (const call of calls) if (call.k === 0 && casterOf.has(call.mesh)) now += trisOf(call.mesh.geometry) * call.count;
      // (5024b61: a close tree cast its near mesh, any other its cards; the far list only while 'tree-shadows' was not given up)
      for (const s of trees.sets.flat(2)) if (s.count && s.mesh.visible && (s.lod <= 1 || !shadows)) then += s.count * trisOf(oldCast(s).geo);
      wide.set(bits, now);
      const name = [leaves && 'tree-leaves', far && 'trees-far', shadows && 'tree-shadows'].filter(Boolean).join(' + ') || 'none';
      rows.push(`${name}: ${n(now)} (5024b61 ${n(then)})`);
      if (leaves) check(now <= then * 1.0001 + 1, `4. ${pname}, given up ${name}: the shadow pass draws ${n(now)} tree triangles into the wide tile, more than 5024b61's ${n(then)}: the close mesh's saving does not take back the near meshes' shadows`);
    }
    console.log(`4. ${pname}, tree triangles a wide tile draw, by the savings given up: ${rows.join('; ')}`);
    for (let bits = 0; bits < 8; bits++) for (const [bit, name] of [[1, 'tree-leaves'], [2, 'trees-far'], [4, 'tree-shadows']]) {
      if (bits & bit) continue;
      check(wide.get(bits | bit) <= wide.get(bits) + 1, `4. ${pname}: giving up ${name} on top of ${bits ? ['tree-leaves', 'trees-far', 'tree-shadows'].filter((x, k) => bits & (1 << k)).join(' + ') : 'nothing'} adds to the shadow pass (${n(wide.get(bits))} to ${n(wide.get(bits | bit))})`);
    }
  }
}

if (fail.length) { console.log('FAIL:\n  ' + [...new Set(fail)].join('\n  ')); process.exit(1); }
console.log('ok: no tree lurches at a rebuild; a tree\'s shadow changes its mesh only where the tree does, with or without the governor\'s savings; the fine tile has every tree that can reach it, by TREE_VERT\'s own placement; the savings take back the near meshes\' shadows');
