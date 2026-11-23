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
import { treeBlock, treeTile, blockDeg, blockLon, TREE_FLOATS, siteRank } from '../src/life/treeBlock.js';
import { band, LEVELS, BASE_BLOCKS } from '../src/life/farForest.js';

const PLACES = [
  ['the opening place', -48.56367, 49.04424],
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
  const blocks = BASE_BLOCKS, ti = Math.floor(bi / blocks), tj = Math.floor(bj / blocks);
  const t0 = Date.now(), whole = treeTile(hs, ti, tj, blocks, 7, 0, 1), tileMs = Date.now() - t0;
  const all = treesOf(whole, whole.origin);
  console.log(`\n${name} (${lat}, ${lon}): a tile of ${blocks} x ${blocks} blocks (${(blocks * DEG * M / 1000).toFixed(2)} km) holds ${whole.count} trees, ${tileMs} ms`);
  check(whole.count === all.size, `${name}: two trees of one tile stand in the same place with the same shape`);

  // 1. the same trees as block by block
  const byBlock = new Map();
  for (let a = 0; a < blocks; a++) for (let b = 0; b < blocks; b++) {
    const r = treeBlock(hs, ti * blocks + a, tj * blocks + b, 7);
    for (const [k, v] of treesOf(r, whole.origin)) byBlock.set(k, v);
  }
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
    const r = treeTile(hs, Math.floor(ti * blocks / bw), Math.floor(tj * blocks / bw), bw, 7, lo, hi);
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

// rank itself: a site's own number, spread evenly
{
  let under = 0, n = 0;
  for (let i = 0; i < 400; i++) for (let j = 0; j < 400; j++) { n++; if (siteRank(-1906, 7000, i, j) < 0.25) under++; }
  check(Math.abs(under / n - 0.25) < 0.01, `a quarter of all sites have a rank under a quarter (${(under / n * 100).toFixed(2)} %)`);
}

console.log('');
if (fail.length) { for (const f of fail.slice(0, 12)) console.error('FAILED: ' + f); console.error(`${fail.length} check(s) failed`); process.exit(1); }
console.log('far trees: every check passed');
