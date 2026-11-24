// The far forest's trees are the near ones (no browser; a few seconds).
//
// What it proves, on Haven at three places:
//   1. A tile of trees (treeTile: a square of tree blocks in one worker job) holds exactly
//      the trees of its blocks, each at the same place, of the same height, species and
//      shape, as life/trees.js asks for them block by block.
//   2. The bands of rank the far forest asks for (a quarter of the sites and up, then a
//      quarter of that, ...) share no tree and together are every tree: thinning is a
//      subset, so nothing moves or changes as the traveller comes nearer.
//   3. A thinner band is a subset of a thicker one at the very same places.
//   4. Rank is a hash of the site alone: the share of sites under a rank is that rank, and
//      ranks are spread evenly over the trees that stand (no bias by species or size).
// It also prints what a tile costs a worker and how many trees a level holds, for the report.
//
// Run: node scripts/far-trees-test.mjs
import { loadWorld } from './lib/loadWorld.mjs';
import { setMadeCover } from './lib/madeCover.mjs';
import { treeBlock, treeTile, blockDeg, blockLon, TREE_FLOATS, siteRank, tileSpan, tileRow, tileOf } from '../src/life/treeBlock.js';
import { wantedTiles, levelReach, GROW, LEAD } from '../src/life/farTiles.js';
import { REBUILD_M, nearListReach, nearReach } from '../src/life/trees.js';
import { band, LEVELS, BASE_BLOCKS, CAP, MARGIN } from '../src/life/farForest.js';

const PLACES = [
  ['the opening place', -48.54992, 49.05567],
  ['the north wood', 22.983, 129.507],
  ['the golden shore', 18.501, 132.671],
];
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); return ok; };

// A tree by what it is, not where it is: its height, crown, turn, species, its own number
// and its rank, each worked out the same way whichever block or tile asks for it. Where it
// stands is then compared with a tolerance: a tile holds its trees as metres from its own
// origin, and that shift is made in single precision (a tenth of a millimetre at a kilometre).
const keyOf = (T, q) => [3, 4, 5, 6, 7, 8].map((k) => T[q + k]).join(',');
// -> Map(key -> { rank, pos: [x, y, z] in metres from `origin`})
const treesOf = (r, origin) => {
  const out = new Map(), dx = r.origin[0] - origin[0], dy = r.origin[1] - origin[1], dz = r.origin[2] - origin[2];
  for (let k = 0, q = 0; k < r.count; k++, q += TREE_FLOATS) out.set(keyOf(r.trees, q), { rank: r.trees[q + 8], pos: [r.trees[q] + dx, r.trees[q + 1] + dy, r.trees[q + 2] + dz] });
  return out;
};
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const { world, hs } = await loadWorld('haven');
const DEG = blockDeg(world.radius), M = world.radius * Math.PI / 180;

for (const [name, lat, lon] of PLACES) {
  setMadeCover(hs, world, lat, lon);
  const dLon = blockLon(Math.floor(lat / DEG), DEG);
  const bi = Math.floor(lat / DEG), bj = Math.floor(lon / dLon);
  const blocks = BASE_BLOCKS, [ti, tj] = tileOf(bi, bj, blocks, DEG);
  const t0 = Date.now(), whole = treeTile(hs, ti, tj, blocks, 7, 0, 1), tileMs = Date.now() - t0;
  const all = treesOf(whole, whole.origin);
  console.log(`\n${name} (${lat}, ${lon}): a tile of ${blocks} x ${blocks} blocks (${(blocks * DEG * M / 1000).toFixed(2)} km) holds ${whole.count} trees, ${tileMs} ms`);
  check(whole.count === all.size, `${name}: two trees of one tile stand in the same place with the same shape`);

  // 1. the same trees as block by block
  const byBlock = new Map();
  { const { w, e } = tileSpan(ti, tj, blocks, DEG);
    for (let a = 0; a < blocks; a++) { const [b0, b1] = tileRow(ti * blocks + a, w, e, DEG); for (let b = b0; b < b1; b++) {
      const r = treeBlock(hs, ti * blocks + a, b, 7);
      for (const [k, v] of treesOf(r, whole.origin)) byBlock.set(k, v);
    } } }
  check(byBlock.size === all.size, `${name}: a tile holds as many trees as its blocks (${all.size} vs ${byBlock.size})`);
  let same = 0, moved = 0;
  for (const [k, v] of all) { const o = byBlock.get(k); if (!o) continue; same++; if (apart(v.pos, o.pos) > 0.05) moved++; }
  check(same === all.size, `${name}: every tree of a tile is a tree of its blocks (${same} of ${all.size})`);
  check(moved === 0, `${name}: a tile's trees stand where its blocks' trees stand (${moved} apart by more than 5 cm)`);

  // 2, 3. the bands: disjoint, together everything, and each a subset at the same places
  const seen = new Map();
  let counts = [];
  for (let L = 0; L < LEVELS; L++) {
    const [lo, hi] = band(L), t1 = Date.now();
    const bw = BASE_BLOCKS * 2 ** L;
    const r = treeTile(hs, ...tileOf(bi, bj, bw, DEG), bw, 7, lo, hi);
    counts.push(`level ${L} (ranks ${lo.toFixed(4)}..${hi.toFixed(4)}, ${bw} blocks, ${(bw * DEG * M / 1000).toFixed(2)} km): ${r.count} trees, ${Date.now() - t1} ms`);
    // the band of the tile itself, to compare with the whole tile
    const inTile = treeTile(hs, ti, tj, blocks, 7, lo, hi), band1 = treesOf(inTile, whole.origin);
    for (const [k, { rank }] of band1) {
      check(all.has(k), `${name}: a tree of band ${L} is a tree of the whole tile`);
      check(rank >= lo - 1e-9 && rank < hi, `${name}: a tree of band ${L} has a rank in that band`);
      check(!seen.has(k), `${name}: no tree is in two bands`);
      seen.set(k, rank);
    }
  }
  check(seen.size === all.size, `${name}: the bands together are every tree (${seen.size} of ${all.size})`);
  for (const line of counts) console.log('  ' + line);

  // the subset test as the shader thins: fewer and fewer, always at the same places
  let last = all;
  for (const keep of [0.5, 0.25, 0.1, 0.03]) {
    const thin = treesOf(treeTile(hs, ti, tj, blocks, 7, 0, keep), whole.origin);
    for (const [k, v] of thin) check(last.has(k) && apart(v.pos, last.get(k).pos) < 0.05, `${name}: a tree kept at ${keep} stands where it stood`);
    check(thin.size <= last.size, `${name}: keeping ${keep} draws no more trees`);
    console.log(`  keep ${keep}: ${thin.size} of ${all.size} trees (${(thin.size / Math.max(1, all.size) * 100).toFixed(1)} %)`);
    last = thin;
  }
  // 4. rank is a hash of the site alone: evenly spread over the trees that stand
  let lowHalf = 0, tall = 0, tallLow = 0;
  for (let k = 0, q = 0; k < whole.count; k++, q += TREE_FLOATS) {
    if (whole.trees[q + 8] < 0.5) lowHalf++;
    if (whole.trees[q + 3] > 18) { tall++; if (whole.trees[q + 8] < 0.5) tallLow++; }
  }
  const sh = lowHalf / Math.max(1, whole.count);
  check(Math.abs(sh - 0.5) < 0.04, `${name}: half the trees have a rank under a half (${(sh * 100).toFixed(1)} %)`);
  if (tall > 200) check(Math.abs(tallLow / tall - 0.5) < 0.07, `${name}: rank does not pick by height (${(tallLow / tall * 100).toFixed(1)} % of the tall ones under a half)`);
}

// 5. The tiles the far forest wants from a place, by the game's own rule (farTiles.js),
// hold every block of trees within each level's reach exactly once, and each stands where
// the rule thinks it does. (Blocks are taken by longitude, not by index: a row's blocks
// are another width in every one-degree band of latitude, and taken by index the rows of
// a tile stood kilometres apart, with east-west strips of land that no wanted tile held.)
// Also at the seam at longitude 0, on both sides of it.
const FULL = world.life?.trees?.far?.full ?? 450, RADIUS = world.life?.trees?.far?.radius ?? 5600;
for (const [name, lat, lon] of [...PLACES, ['east of the seam', 22.983, 0.6], ['west of the seam', 22.983, 359.5], ['east of the seam, south', -48.55, 0.02], ['on a band boundary', 23.0, 200.0]]) {
  const tiles = wantedTiles(lat, ((lon % 360) + 360) % 360, world.radius, FULL, RADIUS), keys = new Map(tiles.map((t) => [t.key, t]));
  const rad = Math.PI / 180, unit = (la, lo) => [Math.cos(la * rad) * Math.cos(lo * rad), Math.cos(la * rad) * Math.sin(lo * rad), Math.sin(la * rad)];
  const here = unit(lat, lon), ground = (la, lo) => { const u = unit(la, lo); return world.radius * Math.acos(Math.min(1, u[0] * here[0] + u[1] * here[1] + u[2] * here[2])); };
  const line = [];
  for (let L = 0; L < LEVELS; L++) {
    const blocks = BASE_BLOCKS * 2 ** L, reach = levelReach(L, FULL, RADIUS), nb = Math.ceil(reach / (DEG * M)) + 1;
    // every block held by the wanted tiles of this level, counted
    const held = new Map();
    for (const t of tiles) if (t.level === L) {
      const { w, e } = tileSpan(t.ti, t.tj, blocks, DEG);
      for (let a = 0; a < blocks; a++) { const bi = t.ti * blocks + a, [b0, b1] = tileRow(bi, w, e, DEG); for (let b = b0; b < b1; b++) held.set(bi + ':' + b, (held.get(bi + ':' + b) || 0) + 1); }
    }
    let inReach = 0, lost = 0, twice = 0, wrongOwner = 0, far = 0;
    const bi0 = Math.floor(lat / DEG);
    for (let bi = bi0 - nb; bi <= bi0 + nb; bi++) {
      const dLon = blockLon(bi, DEG), round = Math.round(360 / dLon), bj0 = Math.floor(lon / dLon);
      for (let bu = bj0 - nb; bu <= bj0 + nb; bu++) {
        const bj = ((bu % round) + round) % round;
        // (a block is in reach when its middle is: half a block's diagonal of slack)
        const d = ground((bi + 0.5) * DEG, (bj + 0.5) * dLon);
        if (d > reach - 80) continue;
        inReach++;
        const n = held.get(bi + ':' + bj) || 0;
        if (n === 0) lost++; else if (n > 1) twice++;
        const [oi, oj] = tileOf(bi, bj, blocks, DEG), owner = keys.get(L + ':' + oi + ':' + oj);
        if (!owner) wrongOwner++;
        // (and the rule's own idea of how near the tile is must not be farther than this block)
        else if (owner.near > d + 80) far++;
      }
    }
    line.push(`level ${L}: ${inReach} blocks in ${(reach / 1000).toFixed(1)} km`);
    check(lost === 0, `${name}, level ${L}: ${lost} of ${inReach} blocks in reach are in no wanted tile`);
    check(twice === 0, `${name}, level ${L}: ${twice} blocks are in two wanted tiles`);
    check(wrongOwner === 0, `${name}, level ${L}: the tile that owns a block is not wanted (${wrongOwner} blocks)`);
    check(far === 0, `${name}, level ${L}: a tile is reckoned farther off than a block it holds (${far} blocks)`);
  }
  console.log(`${name} (${lat}, ${lon}): ${tiles.length} tiles wanted; ${line.join(', ')}`);
}
// ... and a large tile that lies across a boundary between two bands holds its blocks' trees
// where they stand (the first check, at level 1, on a thin band to keep it short)
{
  const [name, lat, lon] = PLACES[1];
  setMadeCover(hs, world, lat, lon);
  const bw = BASE_BLOCKS * 2, bi = Math.floor(lat / DEG), [ti, tj] = tileOf(bi, Math.floor(lon / blockLon(bi, DEG)), bw, DEG), { w, e } = tileSpan(ti, tj, bw, DEG);
  const bands = new Set(); for (let a = 0; a < bw; a++) bands.add(blockLon(ti * bw + a, DEG));
  const tile = treeTile(hs, ti, tj, bw, 7, 0, 0.1), all = treesOf(tile, tile.origin), byBlock = new Map();
  for (let a = 0; a < bw; a++) { const [b0, b1] = tileRow(ti * bw + a, w, e, DEG); for (let b = b0; b < b1; b++) for (const [k, v] of treesOf(treeBlock(hs, ti * bw + a, b, 7, undefined, undefined, 0, 0.1), tile.origin)) byBlock.set(k, v); }
  let moved = 0, wide = 0; for (const [k, v] of all) { const o = byBlock.get(k); if (!o || apart(v.pos, o.pos) > 0.05) moved++; wide = Math.max(wide, Math.hypot(v.pos[0], v.pos[1], v.pos[2])); }
  console.log(`${name}: a level-1 tile over ${bands.size} band(s) of latitude holds ${all.size} trees of rank under 0.1, the farthest ${wide.toFixed(0)} m from its middle`);
  check(all.size === byBlock.size && moved === 0, `${name}: a level-1 tile holds its blocks' trees where they stand (${all.size} vs ${byBlock.size}, ${moved} apart)`);
  check(wide < bw * DEG * M * 0.75 + 120, `${name}: a tile's trees lie within the tile (${wide.toFixed(0)} m from its middle, the tile is ${(bw * DEG * M).toFixed(0)} m across)`);
}

// 6. A tile's buffer holds every tree the far forest would put in it (those whose rank is
// under MARGIN x keep at their own distance) from a traveller standing in the middle of the
// thickest wood: more than CAP and trees that should stand are left out.
for (const [name, lat, lon] of PLACES.slice(1)) {
  setMadeCover(hs, world, lat, lon);
  const rad = Math.PI / 180, cl = Math.cos(lat * rad), u = [cl * Math.cos(lon * rad), cl * Math.sin(lon * rad), Math.sin(lat * rad)], r = world.radius + hs.height(u[0], u[1], u[2], 30) + 2;
  const bi = Math.floor(lat / DEG), bj = Math.floor(lon / blockLon(bi, DEG)), line = [];
  for (let L = 0; L < LEVELS; L++) {
    const bw = BASE_BLOCKS * 2 ** L, [lo, hi] = band(L), t = treeTile(hs, ...tileOf(bi, bj, bw, DEG), bw, 7, lo, hi);
    let n = 0;
    for (let k = 0, q = 0; k < t.count; k++, q += TREE_FLOATS) {
      const d2 = (t.origin[0] + t.trees[q] - u[0] * r) ** 2 + (t.origin[1] + t.trees[q + 1] - u[1] * r) ** 2 + (t.origin[2] + t.trees[q + 2] - u[2] * r) ** 2;
      if (t.trees[q + 8] < MARGIN * Math.min(1, FULL * FULL / Math.max(d2, 1))) n++;
    }
    line.push(`level ${L}: ${n} of ${t.count}`);
    check(n <= CAP, `${name}, level ${L}: the tile under the traveller wants ${n} trees in a buffer of ${CAP}`);
  }
  console.log(`${name}: trees wanted in the buffer of the tile underfoot, ${line.join(', ')} (it holds ${CAP})`);
}

// 7. The line at the near trees' radius, on the real trees round a place. Both shaders cut
// by distance from the EYE: the near trees draw inside the radius, the far forest outside.
//   a. The near trees' list is made round the place it was made at and made again after
//      REBUILD_M of travel: every tree within the radius of the eye, wherever the eye has
//      got to by then, must be in the list (or nobody draws it).
//   b. A block of near trees that has not come must have none of its trees inside the near
//      trees' reach (nearReach: no farther than the blocks that are in), or nobody draws
//      them: the far forest draws only outside that reach.
//   c. A far tree of a level's lowest rank begins to grow where keep(d) passes GROW x rank:
//      the level must be drawn (levelReach) at least that far, and asked for before (LEAD).
{
  const [name, lat, lon] = PLACES[1], RADIUS_NEAR = world.life?.trees?.radius ?? 240;
  setMadeCover(hs, world, lat, lon);
  const rad = Math.PI / 180, at = (la, lo, up) => { const c = Math.cos(la * rad), u = [c * Math.cos(lo * rad), c * Math.sin(lo * rad), Math.sin(la * rad)], r = world.radius + hs.height(u[0], u[1], u[2], 30) + up; return [u[0] * r, u[1] * r, u[2] * r]; };
  const A = at(lat, lon, 1.7), bi0 = Math.floor(lat / DEG), nb = 5, blocksNear = [];
  for (let bi = bi0 - nb; bi <= bi0 + nb; bi++) { const dLon = blockLon(bi, DEG), bj0 = Math.floor(lon / dLon); for (let bj = bj0 - nb; bj <= bj0 + nb; bj++) {
    const b = treeBlock(hs, bi, bj, 7), mid = at((bi + 0.5) * DEG, (bj + 0.5) * dLon, 0), pos = [];
    for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) pos.push([b.origin[0] + b.trees[q], b.origin[1] + b.trees[q + 1], b.origin[2] + b.trees[q + 2]]);
    blocksNear.push({ mid, pos });
  } }
  const all = blocksNear.flatMap((b) => b.pos);
  // a. eyes REBUILD_M from where the list was made, sixteen ways (along the ground, near enough)
  const e = [-A[1], A[0], 0], el = Math.hypot(...e), E = e.map((x) => x / el), al = Math.hypot(...A), N = [A[1] * E[2] - A[2] * E[1], A[2] * E[0] - A[0] * E[2], A[0] * E[1] - A[1] * E[0]].map((x) => x / al);
  let nobody = 0, nobodyOld = 0, inside = 0;
  for (let k = 0; k < 16; k++) {
    const c = Math.cos(k * Math.PI / 8) * REBUILD_M, s = Math.sin(k * Math.PI / 8) * REBUILD_M, eye = [A[0] + E[0] * c + N[0] * s, A[1] + E[1] * c + N[1] * s, A[2] + E[2] * c + N[2] * s];
    for (const p of all) { if (apart(p, eye) >= RADIUS_NEAR) continue; inside++; const d = apart(p, A); if (d > nearListReach(RADIUS_NEAR)) nobody++; if (d > RADIUS_NEAR + 10) nobodyOld++; }
  }
  console.log(`${name}: after ${REBUILD_M} m of travel, of ${inside} trees inside the near radius (16 ways) ${nobody} are not in the near list (a list 10 m past the radius, as it was: ${nobodyOld})`);
  check(inside > 1000 && nobody === 0, `${name}: ${nobody} trees inside the near trees' radius are in nobody's list after ${REBUILD_M} m of travel`);
  check(nobodyOld > 0, `${name}: the check of the near list cannot fail (a list 10 m past the radius lost no tree)`);
  // b. each block in turn has not come
  let lost = 0, lostOld = 0, shortest = 1e9;
  for (const b of blocksNear) {
    const d = apart(b.mid, A), reach = nearReach(RADIUS_NEAR, d);
    for (const p of b.pos) { const dp = apart(p, A); if (dp < reach) lost++; if (dp < RADIUS_NEAR) lostOld++; }
    if (b.pos.length) shortest = Math.min(shortest, reach);
  }
  console.log(`${name}: with each of ${blocksNear.length} blocks in turn not yet come, ${lost} of its trees lie inside the near trees' reach (with the reach always the full radius, as it was: ${lostOld}); the shortest reach ${shortest.toFixed(0)} m`);
  check(lost === 0, `${name}: ${lost} trees of a block that has not come lie inside the near trees' reach, where the far forest draws nothing`);
  check(lostOld > 0, `${name}: the check of the reach cannot fail`);
  // c.
  for (let L = 0; L < LEVELS - 1; L++) {
    const [lo] = band(L), begins = Math.min(RADIUS, FULL / Math.sqrt(GROW * lo));
    check(levelReach(L, FULL, RADIUS) >= begins - 1e-6, `level ${L}: its lowest rank begins to grow at ${begins.toFixed(0)} m, and the level is drawn to ${levelReach(L, FULL, RADIUS).toFixed(0)} m only`);
    check(Math.min(RADIUS, FULL / Math.sqrt(lo)) < begins || begins === RADIUS, `level ${L}: the check of the level's reach cannot fail`);
  }
  check(LEAD > 1.05, 'far tiles are asked for before they can show a tree');
  console.log(`levels drawn to ${[0, 1, 2, 3].map((L) => levelReach(L, FULL, RADIUS).toFixed(0)).join(', ')} m (their lowest ranks begin to grow there; cut where keep = the rank, as it was: ${[0, 1, 2].map((L) => (FULL / Math.sqrt(band(L)[0])).toFixed(0)).join(', ')} m), asked for ${((LEAD - 1) * 100).toFixed(0)} % before`);
}

// rank itself: a site's own number, spread evenly
{
  let under = 0, n = 0;
  for (let i = 0; i < 400; i++) for (let j = 0; j < 400; j++) { n++; if (siteRank(-1906, 7000, i, j) < 0.25) under++; }
  check(Math.abs(under / n - 0.25) < 0.01, `a quarter of all sites have a rank under a quarter (${(under / n * 100).toFixed(2)} %)`);
}

console.log('');
if (fail.length) { for (const f of fail.slice(0, 12)) console.error('FAILED: ' + f); console.error(`${fail.length} check(s) failed`); process.exit(1); }
console.log('far trees: every check passed');
