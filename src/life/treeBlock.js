// The trees of one block of ground, worked out in a terrain worker: where each stands,
// how tall, of what species. A block is 0.001 degrees of latitude high (111 m) and as
// wide on the ground, on a lattice that depends on the place alone, so the same trees
// stand there whenever anyone comes back.
//
// A tree site every `spacing` metres (jittered); a site is taken with the chance the
// land-cover class gives it (cover.js), less on steep ground, never in water, on bare
// rock faces or above the tree line; beside a river or a lake the trees that follow
// water grow whatever the class says.
import { hash3, noise3 } from '../terrain/height/noise.js';
import { speciesFor, floraFor, pick, treeLine, SPECIES } from './cover.js';

export const BLOCK_DEG = 0.001;
// A block is 111 m on any world: its height in degrees on one of radius R (BLOCK_DEG is
// Earth's; on a world 250 km in radius 0.001 degrees would be four metres).
const EARTH_R = 6371000;
// (on Earth exactly the number it always was: its trees stand where they stood)
export function blockDeg(R, deg = BLOCK_DEG) { return R === EARTH_R ? deg : deg * EARTH_R / R; }
export const TREE_FLOATS = 10;         // x, y, z (m from the block's origin, planet axes), height, crown width, turn, species, a number of its own, its rank,
                                       // the chance a site here had of carrying a tree (0..1: how closed the wood is round it; the far forest's view from above)
// A site's **rank** (0..1): a hash of the site alone, of nothing else — not of the chance
// the class gives it, its species or its shape. A band of ranks can therefore be asked
// for on its own (`lo`, `hi` below), and the trees of a band are the very trees that
// stand there, at the same places, with the same shapes: the far forest (life/farForest.js)
// draws the land in bands, thinner band by band the farther off, and no tree is drawn
// twice or moves as the traveller comes nearer.
const RANK_SALT = 60919;
export function siteRank(bi, bj, i, j) { return (hash3(bi * 131 + i, bj * 137 + j, 97, RANK_SALT) & 0xffffff) / 0x1000000; }

// (the block's width in longitude: the same for every block of a one-degree band of latitude)
// (a whole number of blocks round the world: the lattice meets itself at longitude 0)
// (deg: the block's height in degrees; the far trees' blocks are ten times a tree block's)
export function blockLon(bi, deg = BLOCK_DEG) { const band = Math.floor(bi * deg) + 0.5; return 360 / Math.max(1, Math.round(360 / (deg / Math.max(0.05, Math.cos(band * Math.PI / 180))))); }

// hs: the world's height source (with setCover given); radius; bi, bj: the block; spacing (m).
// Returns { origin: [x, y, z] (planet-centred, m), count, trees: Float32Array }.
// deg, salt: a caller may ask for larger blocks with fewer sites on a lattice of its own
// (BLOCK_DEG and the trees' own numbers when left out).
// lo, hi: only the sites whose rank is in [lo, hi) (see siteRank). The test is made before
// anything is asked about the ground, so a thin band costs little.
export function treeBlock(hs, bi, bj, spacing = 7, nominal = BLOCK_DEG, salt = 4409, lo = 0, hi = 1) {
  const R = hs.radius, rad = Math.PI / 180, deg = blockDeg(R, nominal), dLon = blockLon(bi, deg), lat0 = bi * deg, lon0 = bj * dLon;
  const K = Math.max(2, Math.round(111.2 * (nominal / 0.001) / spacing)), out = new Float32Array(K * K * TREE_FLOATS);
  // (a made world says where its own tree line is and what grows on it: world.life)
  const lineDef = hs.life?.trees?.line, flora = hs.life?.flora;
  const dirOf = (lat, lon, d) => { const cl = Math.cos(lat * rad); d[0] = cl * Math.cos(lon * rad); d[1] = cl * Math.sin(lon * rad); d[2] = Math.sin(lat * rad); };
  const d = [0, 0, 0], o = [0, 0, 0];
  dirOf(lat0 + deg / 2, lon0 + dLon / 2, o);
  const h0 = hs.height(o[0], o[1], o[2], 30), origin = [o[0] * (R + h0), o[1] * (R + h0), o[2] * (R + h0)];
  let n = 0;
  for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
    // (the band of ranks wanted, first of all: the ground is not asked about a site left out)
    const rank = siteRank(bi, bj, i, j);
    if (rank < lo || rank >= hi) continue;
    const h1 = hash3(bi * 131 + i, bj * 137 + j, 17, salt), h2 = hash3(bi * 131 + i, bj * 137 + j, 29, salt);
    const u1 = (h1 & 0xffff) / 65536, u2 = (h1 >>> 16) / 65536, u3 = (h2 & 0xffff) / 65536, u4 = (h2 >>> 16) / 65536;
    const lat = lat0 + (j + 0.15 + 0.7 * u1) / K * deg, lon = lon0 + (i + 0.15 + 0.7 * u2) / K * dLon;
    dirOf(lat, lon, d);
    const cover = hs.coverAt(d[0], d[1], d[2]);
    if (cover < 0) continue;
    // (how closed the canopy is comes with the map: the tile worker works it out once, for
    // the trees here and for the far forest the ground shader raises, so the two agree)
    const cls = cover & 255, tall = ((cover >> 8) & 255) / 4;
    let dens = (cover >> 16) / 255;
    // (clumps and clearings: the same class is not the same everywhere)
    const px = d[0] * R, py = d[1] * R, pz = d[2] * R;
    dens *= 0.55 + 0.9 * (0.5 + 0.5 * noise3(px / 140 + 3.7, py / 140, pz / 140 - 1.1));
    if (dens <= 0.004 && cls !== 7 && cls !== 10 && cls !== 16 && cls !== 12) continue;        // (dry open classes still have trees along their rivers: asked below)
    const h = hs.height(d[0], d[1], d[2], 4);
    if (hs.waterDepth > 0) continue;
    // (trees stand back from a river's edge by about a crown's reach: standing at the very
    // edge their crowns closed over every brook, and from the air a wooded valley had no
    // river in it, and no waterfall. Living water, 2026-11-27.)
    if (hs.nearRiver < 2 + 0.2 * Math.min(30, Math.max(tall, 9))) continue;
    const near = hs.nearWater < 30 + 0.6 * Math.max(0, 60 - tall);                 // metres from a river's or a lake's edge
    if (near) dens = Math.max(dens, cls === 15 || cls === 17 ? 0 : 0.5);
    const slope = hs.baseSlope;
    dens *= slope > 0.95 ? 0 : slope > 0.5 ? 1 - (slope - 0.5) / 0.45 : 1;
    const line = lineDef ? lineDef.base - lineDef.perDeg * Math.max(0, Math.abs(lat) - (lineDef.from ?? 0)) : treeLine(lat), over = (h - line + 350) / 350;                     // 0 well below the tree line, 1 at it
    if (over >= 1) continue;
    if (over > 0) dens *= 1 - over;
    if (u3 >= dens) continue;
    // (the trees that flower stand in drifts: along a wood's edge, a stream, one hillside, with
    // plain green between, and a few alone; by a broad noise of the place, some 400 m to a
    // cell, near water more. Evenly mixed they were polka dots over every wood from the air.)
    // (and within a drift in groves some 130 m across, with green between: by the broad noise
    // alone a drift was itself an even scatter of pink dots)
    // (by water too: a stream's banks in flower in stretches, not the whole of every bank)
    const grove = smoothstep01((0.5 + 0.5 * noise3(px / 130 + 1.7, py / 130 - 4.1, pz / 130 + 2.3) - 0.48) / 0.2);
    const drift = near ? 0.1 + 3.5 * grove : 0.05 + 14.0 * smoothstep01((0.5 + 0.5 * noise3(px / 420 - 5.3, py / 420 + 2.9, pz / 420 + 7.7) - 0.5) / 0.2) * grove;
    const sp = pickDrift(flora ? floraFor(flora, cls, h / Math.max(1, line), near) : speciesFor(cls, lat, ((lon + 540) % 360) - 180, h, near), u4, drift), S = SPECIES[sp];
    // height: the measured canopy's, more or less, and stunted toward the tree line
    const base = Math.max(tall, near ? 9 : 2.5), height = Math.max(1.2, base * S.tall * (0.72 + 0.5 * u1) * (over > 0 ? 1 - 0.6 * over : 1));
    const r = R + h, q = n * TREE_FLOATS;
    out[q] = d[0] * r - origin[0]; out[q + 1] = d[1] * r - origin[1]; out[q + 2] = d[2] * r - origin[2];
    out[q + 3] = height; out[q + 4] = S.wide * (0.85 + 0.35 * u2); out[q + 5] = u3 / Math.max(dens, 1e-3) * 6.2831853; out[q + 6] = sp; out[q + 7] = u4; out[q + 8] = rank; out[q + 9] = Math.min(1, dens);
    n++;
  }
  return { origin, count: n, trees: out.slice(0, n * TREE_FLOATS) };
}

// The far forest's tiles (life/farForest.js, life/farTiles.js). A tile (ti, tj) of `blocks`
// is `blocks` rows of tree blocks (rows ti * blocks ...) and a span of longitude: the span
// `blocks` blocks of its FIRST row take, [w, e). A row's blocks are not the same width in
// every row (blockLon: each one-degree band of latitude has its own, and on a small world
// a band is a few kilometres), so the same block index is another longitude in another
// row: taken by index, the rows of one tile stood kilometres apart and the far forest had
// east-west strips with no trees. Each row therefore gives the tile the blocks whose west
// edge lies in the span. Every block of the world belongs to exactly one tile of each
// size; the last tile of a row of tiles ends at longitude 360 and is the short one.
// tileSpan: { w, e (degrees), count (tiles round the world in this row of tiles) }.
export function tileSpan(ti, tj, blocks, deg) {
  const dLon0 = blockLon(ti * blocks, deg), count = Math.ceil(Math.round(360 / dLon0) / blocks);
  return { w: tj * blocks * dLon0, e: tj >= count - 1 ? 360 : (tj + 1) * blocks * dLon0, count };
}
// tileRow: the blocks [b0, b1) of row bi that lie in a span.
export function tileRow(bi, w, e, deg) {
  const dLon = blockLon(bi, deg), round = Math.round(360 / dLon);
  const edge = (x) => (x >= 360 ? round : Math.min(round, Math.max(0, Math.ceil(x / dLon - 1e-7))));
  return [edge(w), edge(e)];
}
// tileOf: the tile a block belongs to.
export function tileOf(bi, bj, blocks, deg) {
  const ti = Math.floor(bi / blocks), dLon = blockLon(bi, deg), dLon0 = blockLon(ti * blocks, deg), count = Math.ceil(Math.round(360 / dLon0) / blocks);
  return [ti, Math.min(count - 1, Math.floor((bj + 1e-7) * dLon / (blocks * dLon0)))];
}

// A tile of tree blocks in one go, as one array: what the far forest asks a worker for.
// lo, hi: the band of ranks. Positions are metres from the tile's own origin (the middle
// of its rows and of its span, on the ground).
export function treeTile(hs, ti, tj, blocks = 8, spacing = 7, lo = 0, hi = 1, nominal = BLOCK_DEG, salt = 4409) {
  const R = hs.radius, rad = Math.PI / 180, deg = blockDeg(R, nominal);
  const bi0 = ti * blocks, { w, e } = tileSpan(ti, tj, blocks, deg);
  const latMid = (bi0 + blocks / 2) * deg, lonMid = (w + e) / 2;
  const cl = Math.cos(latMid * rad), dm = [cl * Math.cos(lonMid * rad), cl * Math.sin(lonMid * rad), Math.sin(latMid * rad)];
  const hM = hs.height(dm[0], dm[1], dm[2], 30), origin = [dm[0] * (R + hM), dm[1] * (R + hM), dm[2] * (R + hM)];
  const parts = [];
  let n = 0;
  for (let a = 0; a < blocks; a++) {
    const bi = bi0 + a, [b0, b1] = tileRow(bi, w, e, deg);
    for (let bj = b0; bj < b1; bj++) {
      const blk = treeBlock(hs, bi, bj, spacing, nominal, salt, lo, hi);
      if (!blk.count) continue;
      const dx = blk.origin[0] - origin[0], dy = blk.origin[1] - origin[1], dz = blk.origin[2] - origin[2], T = blk.trees;
      for (let k = 0, q = 0; k < blk.count; k++, q += TREE_FLOATS) { T[q] += dx; T[q + 1] += dy; T[q + 2] += dz; }
      parts.push(T); n += blk.count;
    }
  }
  const trees = new Float32Array(n * TREE_FLOATS);
  let at = 0;
  for (const p of parts) { trees.set(p, at); at += p.length; }
  return { origin, count: n, trees };
}

// pick (life/cover.js) with the weight of the species that flower times `drift`.
function smoothstep01(x) { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); }
function pickDrift(list, u, drift) {
  let total = 0; for (const e of list) total += e[1] * (SPECIES[e[0]].blossom ? drift : 1);
  let t = u * total;
  for (const e of list) { t -= e[1] * (SPECIES[e[0]].blossom ? drift : 1); if (t <= 0) return e[0]; }
  return list[list.length - 1][0];
}
