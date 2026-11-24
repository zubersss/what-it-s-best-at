// The land's shadow on the far forest's trees, without a browser: what a tile's grid says
// of each tree (life/treeLandShade.js, as the terrain workers work it out) against a ray
// from the tree's own crown to the Sun (as the trees one walks among are asked). Fails
// (exit 1) when more than one tree in twelve of a tile is on the wrong side of a shadow.
//   node scripts/far-tree-shade-test.mjs [--sun 19.5,64] [--was]
// The place: the opening place of Haven in its first morning (the Sun 19.5 degrees up in
// the east-north-east: long shadows of hills over wooded ground). --was: with 20 points a
// side on every tile, as it was.
import { loadWorld } from './lib/loadWorld.mjs';
import { setMadeCover } from './lib/madeCover.mjs';
import { ShadowBaker } from '../src/terrain/shadowBake.js';
import { CONFIG } from '../src/config.js';
import { treeTile, blockDeg, tileOf, blockLon } from '../src/life/treeBlock.js';
import { landShadow, tileGrid } from '../src/life/treeLandShade.js';
import { band, LEVELS, BASE_BLOCKS } from '../src/life/farForest.js';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const was = args.includes('--was'), [sunEl, sunAz] = opt('sun', '19.5,64').split(',').map(Number);
const { world, hs } = await loadWorld('haven');
const lat = world.scene.start.lat, lon = world.scene.start.lon, rad = Math.PI / 180, R = world.radius;
await setMadeCover(hs, world, lat, lon);
const baker = new ShadowBaker(hs, CONFIG, world);
const cl = Math.cos(lat * rad), up = [cl * Math.cos(lon * rad), cl * Math.sin(lon * rad), Math.sin(lat * rad)], east = [-Math.sin(lon * rad), Math.cos(lon * rad), 0];
const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
const sun = [0, 1, 2].map((i) => up[i] * Math.sin(sunEl * rad) + (east[i] * Math.sin(sunAz * rad) + north[i] * Math.cos(sunAz * rad)) * Math.cos(sunEl * rad));
const DEG = blockDeg(R), spacing = world.life.trees.spacing ?? 7;
let failed = false;
for (let L = 0; L < LEVELS; L++) {
  const blocks = BASE_BLOCKS * 2 ** L, bi = Math.floor(lat / DEG), bj = Math.floor(lon / blockLon(bi, DEG)), [ti, tj] = tileOf(bi, bj, blocks, DEG), [lo, hi] = band(L);
  const b = treeTile(hs, ti, tj, blocks, spacing, lo, hi), G = was ? 20 : tileGrid(blocks);
  const t0 = performance.now(), grid = landShadow(hs, baker, b, sun, 0.00465, G), ms = performance.now() - t0, own = landShadow(hs, baker, b, sun, 0.00465, 0);
  let wrong = 0, lit = 0, shade = 0, litInShade = 0;
  for (let k = 0; k < b.count; k++) { const a = grid[k] > 0.5, t = own[k] > 0.5; if (t) lit++; else shade++; if (a !== t) { wrong++; if (a) litInShade++; } }
  const share = wrong / Math.max(1, b.count), ok = share < 1 / 12;
  console.log(`${ok ? 'ok  ' : 'FAIL'} level ${L} (${(blocks * DEG * R * rad).toFixed(0)} m, ${G} points a side, ${ms.toFixed(0)} ms): ${b.count} trees, ${shade} in the land's shadow; on the wrong side of it ${wrong} (${(share * 100).toFixed(1)} %), of them lit in the shade ${litInShade}`);
  if (!ok) failed = true;
}
console.log(failed ? '\nfar trees, the land\'s shadow: FAILED' : '\nfar trees, the land\'s shadow: every check passed');
process.exit(failed && !was ? 1 : 0);
