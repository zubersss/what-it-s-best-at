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
import { treeTile, blockDeg, tileOf, blockLon, TREE_FLOATS } from '../src/life/treeBlock.js';
import { landShadow, tileGrid } from '../src/life/treeLandShade.js';
import { band, LEVELS, BASE_BLOCKS, MARGIN, CAP, tileShadow, crownDown, shadowGate } from '../src/life/farForest.js';
import { wantedTiles } from '../src/life/farTiles.js';
import { SHADOW0 } from '../src/life/farTreeForm.js';

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
// The slope's share of the sunlight on a round world with no relief at all (review
// farforest-5): every tree's ground is level, so it must take what level ground takes under
// its own sky, at a Sun 6 degrees up. (The heights over the tile's plane once had the
// world's curve the wrong way round: the slope was tilted by 2x/R, 1.6 degrees at the edge
// of a 7 km tile on Haven, and the shadows' strength stepped at the seams of big tiles.)
{
  const flat = { radius: R, height: () => 0 }, open = { visibility: () => 1 }, low = 6 * rad;
  const sun6 = [0, 1, 2].map((i) => up[i] * Math.sin(low) + east[i] * Math.cos(low));
  for (let L = 0; L < LEVELS; L++) {
    const blocks = BASE_BLOCKS * 2 ** L, bi = Math.floor(lat / DEG), bj = Math.floor(lon / blockLon(bi, DEG)), [ti, tj] = tileOf(bi, bj, blocks, DEG), [lo, hi] = band(L);
    const b = treeTile(hs, ti, tj, blocks, spacing, lo, hi), ground = new Float32Array(b.count);
    landShadow(flat, open, b, sun6, 0.00465, tileGrid(blocks), ground);
    let worst = 0;
    for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) {
      const px = b.origin[0] + b.trees[q], py = b.origin[1] + b.trees[q + 1], pz = b.origin[2] + b.trees[q + 2], l = Math.hypot(px, py, pz);
      const nl = (sun6[0] * px + sun6[1] * py + sun6[2] * pz) / l, t = Math.min(1, Math.max(0, (nl + 0.04) / 0.38)), want = t * t * (3 - 2 * t);
      worst = Math.max(worst, Math.abs(ground[k] - want));
    }
    const ok = worst < 0.02;
    console.log(`${ok ? 'ok  ' : 'FAIL'} level ${L}, level ground on a round world, Sun 6 degrees up: the slope's share of the Sun off by at most ${worst.toFixed(3)}`);
    if (!ok) failed = true;
  }
}
// Which tiles are handed the shadows' draw (review farforest2-1), on the real tiles of two
// places, as the game asks for them (wantedTiles, treeTile, the fill's rank rule): a walker
// in the north wood (hardly a tree can be looked down on steeply enough to cast a shadow: at
// most a tenth of the tiles may be handed the draw for nothing) and the opening ledge (every tile with a tree that can cast must
// be handed it). --was: by the eye's height over the tile's lowest tree alone, as it was.
for (const [name, pl] of [['the north wood', { lat: 22.983, lon: 129.507, none: true }], ['the opening ledge', { lat, lon, none: false }]]) {
  await setMadeCover(hs, world, pl.lat, pl.lon);
  const c = Math.cos(pl.lat * rad), dir = [c * Math.cos(pl.lon * rad), c * Math.sin(pl.lon * rad), Math.sin(pl.lat * rad)];
  const eyeLen = R + hs.height(dir[0], dir[1], dir[2], 1) + 1.7, eye = dir.map((v) => v * eyeLen), far = world.life.trees.far;
  let handed = 0, can = 0, wrongOn = 0, wrongOff = 0, tiles = 0;
  for (const w of wantedTiles(pl.lat, pl.lon, R, far.full, far.radius, 0)) {
    const [lo, hi] = band(w.level), b = treeTile(hs, w.ti, w.tj, w.blocks, spacing, lo, hi), T = b.trees, o = b.origin;
    if (!b.count) continue;
    tiles++;
    const ol = Math.hypot(...o), tu = o.map((v) => v / ol);
    let low2 = Infinity, maxDown = -1, cast = false, n = 0;
    for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) {
      const x = o[0] + T[q], y = o[1] + T[q + 1], z = o[2] + T[q + 2]; low2 = Math.min(low2, x * x + y * y + z * z);
      const fx = x - eye[0], fy = y - eye[1], fz = z - eye[2], d2 = fx * fx + fy * fy + fz * fz, keep = Math.min(1, far.full * far.full / Math.max(d2, 1));
      if (T[q + 8] >= MARGIN * keep || n >= CAP) continue;
      n++;
      const dn = crownDown(fx, fy, fz, T[q + 3], tu); if (dn > maxDown) maxDown = dn;
      if (T[q + 8] < keep && d2 > 240 * 240 && d2 < 4200 * 4200 && dn > SHADOW0) cast = true;
    }
    const sh = tileShadow(eyeLen, Math.sqrt(low2), w.near), on = sh.air > 0 && sh.reach && (was || shadowGate(maxDown, 0, w.near));
    if (on) handed++; if (cast) can++;
    if (on && !cast && pl.none) wrongOn++;
    if (cast && !on) wrongOff++;
  }
  // (a few tiles whose steepest tree is within a twentieth of the angle are handed it ahead of
  // time: the gate keeps that margin for the eye's coming nearer before the next fill)
  const ok = wrongOn <= Math.ceil(0.1 * tiles) && wrongOff === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}, on foot: ${tiles} tiles, ${can} with a tree that can cast a shadow, ${handed} handed the shadows' draw${wrongOn ? `, ${wrongOn} for nothing` : ''}${wrongOff ? `, ${wrongOff} missing` : ''}`);
  if (!ok) failed = true;
}
console.log(failed ? '\nfar trees, the land\'s shadow: FAILED' : '\nfar trees, the land\'s shadow: every check passed');
process.exit(failed ? 1 : 0);
