// The trees' shadows while the traveller moves (no browser; some seconds). Findings shadows-2
// and shadows-3 of docs/briefs/shadows-governor-10.md, with the real Trees (life/trees.js) and
// the real NearShadow (shadows/nearShadow.js) run frame by frame on the trees Haven plants
// in its north wood (terrain workers' rule, life/treeBlock.js). Each check failed on 5024b61.
//
//   1. The gusts: when the lists are made again from a new anchor (every 25 m of a walk), no
//      tree's lean changes. Each tree's bend at the top of its crown, as TREE_VERT's own lines
//      work it out (run in JavaScript), before and after the rebuild at the same moment. (The
//      gust's phase was measured from the anchor: every tree, and its shadow, lurched 13 to
//      22 cm at once.)
//   2. Which mesh casts a tree's shadow: walking through the wood (4.5 m/s), every tree the
//      near trees draw casts exactly one shadow every frame, and the mesh that casts it
//      changes only in the frame the tree's own picture changes between its near mesh and its
//      far cards (the near radius); never at the close radius, 20 m from the walker, where it
//      changed 25 to 70 % of a tree's shadow in one frame.
//   3. The fine tile draws only the first instances of each list (Trees.fineCount): every
//      tree it leaves out cannot reach it (its every vertex, swayed by the wind at a dozen
//      moments, falls outside the tile's square), and neither can any tree the count's rule
//      rules out on its own (this catches a rule that is short by the wind's reach: broken on
//      purpose, it left out trees in the north wood). And what the shadow pass draws, the rule
//      of 5024b61 beside this one, at the opening and in the north wood: printed.
//
// Run: node scripts/tree-shadow-test.mjs      (exit 1 on a failed check)
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { NearShadow } from '../src/shadows/nearShadow.js';
import { Trees, TREE_VERT } from '../src/life/trees.js';
import { loadWorld } from './lib/loadWorld.mjs';
import { setMadeCover } from './lib/madeCover.mjs';
import { treeBlock, blockDeg, blockLon } from '../src/life/treeBlock.js';
import { radii } from '../src/life/treeLod.js';

globalThis.fetch = () => new Promise(() => {}); globalThis.createImageBitmap = () => new Promise(() => {});      // (the trees' picture: not needed)
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); return ok; };
const RAD = Math.PI / 180;

// ---- the game's objects, as app.js makes them (the near shadow first: the trees' materials take its uniforms)
let calls = [], current = null;
const renderer = {
  setRenderTarget(t) { current = t; }, clear() {}, getContext: () => ({ invalidateFramebuffer() {}, FRAMEBUFFER: 0, COLOR_ATTACHMENT0: 0 }),
  render(mesh, cam) { calls.push({ mesh, count: mesh.geometry.instanceCount, cam: cam.clone(), k: current.viewport.x > 0 ? (current.viewport.y > 0 ? 2 : 1) : 0 }); },
};
const ns = new NearShadow(renderer); ns.every = 1;           // (all tiles every frame)
const { world, hs } = await loadWorld('haven');
const wind = new THREE.Vector4(1, 0, 0, 6);
const workers = { idle: 0, run: () => null };
const terrain = { shared: { uWind: { value: wind } }, coverSerial: 1, ringSerial: 1, epoch: 1, workers, tiles: { busy: true }, wanted: [] };
const trees = new Trees(world, terrain);
trees.atlasReady = true;
const castOf = new Map();          // the shadow's mesh of a set: 0 close, 1 near, 2 far (which of its trio's meshes the caster draws)
const setOf = new Map();
for (const trio of trees.sets.flat()) for (const s of trio) {
  castOf.set(s, trio.findIndex((o) => o.geo.attributes.position === s.cast.geometry.attributes.position));
  setOf.set(s.cast, s);
  ns.addCaster(s.cast, trees.depthMaterial, () => s.mesh.visible && (s.lod <= 1 || trees.shadowsFar), trees.fineCount ? () => trees.fineCount(s) : null);
}
// (app.js must hand the near shadow the trees' fine count, as above)
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
if (trees.fineCount) check(/addCaster\(set\.cast,[^\n]*this\.trees\.fineCount\(set\)/.test(appSrc), 'app.js does not hand the near shadow the trees\' fine count');
console.log('the shadow of a close tree is its ' + ['close', 'near', 'far'][castOf.get(trees.sets[0][0][0])] + ' mesh, of a near tree its ' + ['close', 'near', 'far'][castOf.get(trees.sets[0][0][1])] + ' mesh, of a far one its ' + ['close', 'near', 'far'][castOf.get(trees.sets[0][0][2])] + ' mesh');

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
const DAY = 172, sh = trees.shared;

// TREE_VERT's own lines for the lean, run in JavaScript: a tree's bend at the top of its crown
const vert = TREE_VERT.split('\n'), grab = (name) => {
  const l = vert.find((x) => new RegExp(`^\\s*float ${name}\\s*=`).test(x));
  if (!l) throw new Error(`TREE_VERT has no line for ${name}: teach the test`);
  return l.trim().replace(/^float \w+\s*=\s*/, '').replace(/;\s*(\/\/.*)?$/, '').replace(/\.xyz/g, '');
};
const bendOf = new Function('sin', 'dot', 'uSeason', 'iA', 'iB', 'uTreeWind', 'uGustPhase', 'p', 'aSway',
  `const gust = ${grab('gust')}; const swing = ${grab('swing')}; return ${grab('bend')};`).bind(null, Math.sin, (a, b) => a.x * b.x + a.y * b.y + a.z * b.z);
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
  const leans = () => {
    const out = new Map(), A = trees.anchor;
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
{
  plant(...NORTH_WOOD); wind.set(F0.east.x, F0.east.y, F0.east.z, 6);
  const hd = 6 * RAD, dir = F0.north.clone().multiplyScalar(Math.cos(hd)).addScaledVector(F0.east, Math.sin(hd)), speed = 4.5, fps = 30, walk = 120;
  const g0 = F0.up.clone().multiplyScalar(R);
  rig.footVel.copy(dir).multiplyScalar(speed);
  let prev = null, frames = 0, swaps = 0, atNear = 0, notAtNear = 0, twice = 0, onLine = 0, worst = null, closeRule = 0;
  const { close, near } = radii(1, true), cut = sh.uLodCut.value, M = ['close', 'near', 'far'];
  for (let f = 0; f * speed / fps <= walk; f++, frames++) {
    place(g0.clone().addScaledVector(dir, f * speed / fps));
    trees.update(rig, DAY, f / fps);
    const now = new Map();
    for (const [key, list] of drawn()) {
      // (a tree within a centimetre of the near radius at a choice is drawn by both its near mesh and
      // its far card for that choice, by design: life/treeLod.js CUT_IN. Anything else drawn twice is wrong.)
      if (list.length > 1) {
        const card = list.find(([s]) => s.lod === 2), I = card && card[0].iA.array, i = card && card[1];
        const d = card ? Math.hypot(I[4 * i] - cut.x, I[4 * i + 1] - cut.y, I[4 * i + 2] - cut.z) : -1;
        if (list.length === 2 && card && list.some(([s]) => s.lod < 2) && d >= cut.w && d < cut.w + 0.02) onLine++; else twice++;
      }
      const P = list.map(([s]) => s.lod).sort().join(''), C = [...new Set(list.map(([s]) => castOf.get(s)))].sort().join('');
      now.set(key, { P, C, nearish: /[01]/.test(P), far: P.includes('2') });
    }
    if (prev) for (const [key, t] of now) {
      const o = prev.get(key); if (!o) continue;
      if (o.P !== t.P && !o.far && !t.far) closeRule++;
      if (o.C === t.C) continue;
      swaps++;
      if (o.nearish !== t.nearish || o.far !== t.far) atNear++;
      else { notAtNear++; if (!worst) worst = `a tree drawn as its ${[...o.P].map((x) => M[x]).join(' and ')} mesh, then its ${[...t.P].map((x) => M[x]).join(' and ')} mesh, at frame ${f}`; }
    }
    prev = now;
  }
  const secs = walk / speed;
  console.log(`2. ${walk} m through the north wood at ${speed} m/s (close ${close} m, near ${near} m): ${closeRule} trees crossed the close radius; ${swaps} shadows changed mesh, ${atNear} where the tree's own picture went between its near mesh and its cards (${(atNear / secs).toFixed(1)} a second), ${notAtNear} anywhere else (${(notAtNear / secs).toFixed(1)} a second)`);
  check(closeRule > 20, `2. the walk crossed the close radius only ${closeRule} times: it tests nothing`);
  check(twice === 0, `2. ${twice} times a tree was drawn by two lists at once away from the near radius`);
  check(notAtNear === 0, `2. a tree's shadow changed its mesh where its picture did not change between near mesh and cards: ${notAtNear} times (${worst})`);
}

// ---- 3. the fine tile's count, and what the shadow pass draws ----------------------------
{
  const vertsOf = (s) => { const g = s.cast.geometry; return { P: g.attributes.position.array, L: g.attributes.aLeaf.array, S: g.attributes.aSway.array }; };
  const trisOf = (geo) => geo.attributes.position.count / 3;
  const oldCast = (s) => { const trio = trees.sets.flat().find((t) => t.includes(s)); return trio[Math.min(2, s.lod + 1)]; };
  // Can instance i of set s reach the fine tile drawn with camera cam? Its vertices as TREE_VERT places them,
  // swayed by the wind at a dozen moments (the bend from TREE_VERT's own lines; the flutter as TREE_VERT has it).
  const reaches = (s, i, cam, W) => {
    const I = s.iA.array, B = s.iB.array, a = sh.uAnchorRel.value, E = sh.uTreeEast.value, N = sh.uTreeNorth.value, U = sh.uTreeUp.value;
    const iA = { x: I[4 * i], y: I[4 * i + 1], z: I[4 * i + 2], w: I[4 * i + 3] }, iB = { x: B[4 * i], y: B[4 * i + 1], z: B[4 * i + 2], w: B[4 * i + 3] };
    const { P, L, S } = vertsOf(s), c = Math.cos(iB.y), sn = Math.sin(iB.y), v = new THREE.Vector3();
    const flutterK = /amp = aSway\.y \* iA\.w \* \(([\d.]+) \+ ([\d.]+) \* uTreeWind\.w\)/.exec(TREE_VERT);
    if (!flutterK) throw new Error('TREE_VERT\'s flutter is not in the form this test knows: teach the test');
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let t = 0; t < 12; t++) {
      const time = 3.7 * t, season = { x: 0, y: 0, z: time };
      for (let j = 0, n = P.length / 3; j < n; j++) {
        const px = P[3 * j] * iB.x, py = P[3 * j + 1], pz = P[3 * j + 2] * iB.x, sw = { x: S[2 * j], y: S[2 * j + 1] };
        const lx = (px * c - pz * sn) * iA.w, ly = py * iA.w, lz = (px * sn + pz * c) * iA.w;
        const bend = bendOf(season, iA, iB, W, sh.uGustPhase ? sh.uGustPhase.value : 0, { x: px, y: py }, sw);
        v.set(a.x + iA.x, a.y + iA.y, a.z + iA.z).addScaledVector(E, lx).addScaledVector(U, ly).addScaledVector(N, lz).addScaledVector(W, bend);
        if (L[j] > 1.5 && L[j] < 3.5) {
          const ph = P[3 * j] * 41 + P[3 * j + 1] * 57 + P[3 * j + 2] * 73 + iB.z * 31, amp = sw.y * iA.w * (+flutterK[1] + +flutterK[2] * W.w);
          v.addScaledVector(E, Math.sin(time * 7.3 + ph) * amp).addScaledVector(U, Math.sin(time * 9.1 + ph * 1.7) * amp).addScaledVector(N, Math.sin(time * 6.1 + ph * 0.6) * amp);
        }
        v.project(cam);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    }
    return x1 > -1 && x0 < 1 && y1 > -1 && y0 < 1;
  };
  let ruledAll = 0;
  for (const [pname, at] of [['the opening', OPENING], ['the north wood', NORTH_WOOD]]) {
    plant(...at);
    const F = frameAt(...at);
    for (const [elev, az, W] of [[19.5, 200, 12], [45, 120, 12], [70, 300, 3]]) {
      wind.set(F.east.x * 0.6 + F.north.x * 0.8, F.east.y * 0.6 + F.north.y * 0.8, F.east.z * 0.6 + F.north.z * 0.8, W);
      place(F.up); trees.update(rig, DAY, 0);
      const sun = F.up.clone().multiplyScalar(Math.sin(elev * RAD)).addScaledVector(F.east, Math.cos(elev * RAD) * Math.sin(az * RAD)).addScaledVector(F.north, Math.cos(elev * RAD) * Math.cos(az * RAD)).normalize();
      calls = []; ns._has = false;
      ns.render(rig.pos, sun, rig.localUp);
      let wideNow = 0, fineNow = 0, today = 0, left = 0, wrong = 0, picture = 0, ruled = 0, wrongRule = 0;
      for (const s of trees.sets.flat(2)) { if (!s.count) continue; today += s.count * trisOf(oldCast(s).geo); picture += s.count * s.tris; }
      for (const call of calls) {
        const s = setOf.get(call.mesh); if (!s) continue;
        const tris = trisOf(call.mesh.geometry) * call.count;
        if (call.k === 0) wideNow += tris;
        if (call.k !== 1) continue;
        fineNow += tris;
        call.cam.updateMatrixWorld(true);
        for (let i = call.count; i < s.count; i++) { left++; if (reaches(s, i, call.cam, wind)) wrong++; }
        // (and the rule tree by tree, where it matters: each tree the count's rule says cannot reach, alone)
        if (trees.fineCount) for (let i = 0; i < Math.min(call.count, s.count); i++) {
          const one = { count: 1, castBound: s.castBound, iA: { array: s.iA.array.subarray(4 * i, 4 * i + 4) }, iB: { array: s.iB.array.subarray(4 * i, 4 * i + 4) } };
          if (trees.fineCount(one) === 0) { ruled++; if (reaches(s, i, call.cam, wind)) wrongRule++; }
        }
      }
      const n = (x) => `${(x / 1000).toFixed(1)}k`;
      console.log(`3. ${pname}, Sun ${elev} deg, wind ${W} m/s: tree triangles per tile draw (wide, fine): today ${n(today)}, ${n(today)}; now ${n(wideNow)}, ${n(fineNow)} (the trees in the picture: ${n(picture)}); ${left} instances left out of the fine tile, ${wrong} of them could reach it; ${ruled} more ruled out one by one, ${wrongRule} of them could reach it`);
      check(calls.some((c) => c.k === 1 && setOf.has(c.mesh)), `3. ${pname}: no tree was drawn into the fine tile (the test draws nothing)`);
      check(wrong === 0, `3. ${pname}, Sun ${elev} deg: ${wrong} trees whose shadow can fall on the fine tile were left out of it`);
      check(wrongRule === 0, `3. ${pname}, Sun ${elev} deg: the fine count's rule says ${wrongRule} trees cannot reach the fine tile that can`);
      ruledAll += ruled;
    }
  }
  check(!trees.fineCount || ruledAll > 200, `3. the count's rule was tried on only ${ruledAll} trees it rules out inside the lists: it is hardly tested`);
}

if (fail.length) { console.log('FAIL:\n  ' + [...new Set(fail)].join('\n  ')); process.exit(1); }
console.log('ok: no tree lurches at a rebuild; a tree\'s shadow changes its mesh only where the tree does; the fine tile has every tree that can reach it');
