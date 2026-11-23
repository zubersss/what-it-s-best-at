// Which tiles of trees the far forest wants from a place: no DOM and no three, so that the
// test (scripts/far-trees-test.mjs) reads the very rule the game uses.
//
// A level's band of ranks is drawn out to where keep(d) = (full / d)^2 falls to the band's
// lowest rank; a tile of the level is wanted when its nearest ground is within that. Where
// a tile stands comes from tileSpan (life/treeBlock.js): its rows of blocks and its span
// of longitude, which is what a worker's treeTile fills.
import { blockDeg, tileSpan } from './treeBlock.js';

export const BASE_BLOCKS = 8;        // level 0: 8 x 8 tree blocks (889 m); level L: that doubled L times
export const BAND = 4;               // each level's band of ranks is this much thinner than the one before
export const LEVELS = 4;             // 1, 1/4, 1/16, 1/64 of the sites: the last band is everything below

// The band of ranks a level holds: [lo, hi).
export function band(level) { return [level >= LEVELS - 1 ? 0 : BAND ** -(level + 1), BAND ** -level]; }

// A tree of rank r begins to grow in where keep(d) passes GROW x r, and is full size where
// keep(d) = r (the far forest's vertex shader takes the number from here).
export const GROW = 0.85;
// How far from the eye a level's trees are drawn (m). A tree of rank r begins to grow in
// where keep(d) passes 0.85 r (the vertex shader's smoothstep), which for the band's lowest
// rank is a twelfth farther out than where keep(d) = lo: cut at that nearer line, the
// lowest ranks of a band came in already full size.
export function levelReach(level, full, radius) { const lo = band(level)[0]; return Math.min(radius, lo > 0 ? full / Math.sqrt(GROW * lo) : radius); }
// Tiles are asked for this much before they can show a tree (the worker needs the time).
export const LEAD = 1.1;

// lat, lon (degrees, lon 0..360), R (m), full, radius (m). Returns the tiles, each
// { key, level, ti, tj, blocks, side (m), near (m along the ground to its nearest ground), mid }.
// (0.7 of the height: the ground under a tile may stand higher than under the traveller)
// agl: the traveller's height over the ground (m): from high up the nearest tiles of the
// thick bands cannot show a tree, and are neither worked out nor given a place.
export function wantedTiles(lat, lon, R, full, radius, agl = 0) {
  const DEG = blockDeg(R), M = R * Math.PI / 180, rad = Math.PI / 180, BLOCK_M = DEG * M;
  const out = [], seen = new Set();
  for (let L = 0; L < LEVELS; L++) {
    const blocks = BASE_BLOCKS * 2 ** L, side = blocks * BLOCK_M, reach = levelReach(L, full, radius);
    const tDeg = blocks * DEG, ti0 = Math.floor(lat / tDeg), nt = Math.ceil(reach * LEAD / side) + 1;
    for (let ti = ti0 - nt; ti <= ti0 + nt; ti++) {
      const lat0 = ti * tDeg, lat1 = lat0 + tDeg, dy = (lat0 + lat1) / 2 - lat;
      const nearY = Math.max(0, Math.abs(dy) - tDeg / 2) * M;
      if (nearY > reach * LEAD) continue;
      // (metres to a degree of longitude along the tile's row nearest the traveller)
      const mLon = M * Math.cos(Math.min(lat1, Math.max(lat0, lat)) * rad);
      const s0 = tileSpan(ti, 0, blocks, DEG), tLon = s0.e - s0.w, count = s0.count, tj0 = Math.min(count - 1, Math.floor(lon / tLon));
      for (let tu = tj0 - nt; tu <= tj0 + nt; tu++) {
        const tj = ((tu % count) + count) % count, key = L + ':' + ti + ':' + tj;
        if (seen.has(key)) continue;
        // (where the tile really is: the last of a row is short, and the row meets itself at 0)
        const { w, e } = tileSpan(ti, tj, blocks, DEG);
        let dl = (w + e) / 2 - lon; dl -= 360 * Math.round(dl / 360);
        // (a row gives the tile the blocks whose west edge is in its span: a block of slack)
        const dx = dl * mLon, nearX = Math.max(0, Math.abs(dx) - (e - w) / 2 * mLon - BLOCK_M);
        const near = Math.hypot(nearX, nearY);
        if (Math.hypot(near, 0.7 * agl) > reach * LEAD) continue;
        seen.add(key);
        out.push({ key, level: L, ti, tj, blocks, side, near, mid: Math.hypot(dx, dy * M) });
      }
    }
  }
  return out;
}
