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
export const TREE_FLOATS = 8;          // x, y, z (m from the block's origin, planet axes), height, crown width, turn, species, a number of its own

// (the block's width in longitude: the same for every block of a one-degree band of latitude)
// (a whole number of blocks round the world: the lattice meets itself at longitude 0)
// (deg: the block's height in degrees; the far trees' blocks are ten times a tree block's)
export function blockLon(bi, deg = BLOCK_DEG) { const band = Math.floor(bi * deg) + 0.5; return 360 / Math.max(1, Math.round(360 / (deg / Math.max(0.05, Math.cos(band * Math.PI / 180))))); }

// hs: the world's height source (with setCover given); radius; bi, bj: the block; spacing (m).
// Returns { origin: [x, y, z] (planet-centred, m), count, trees: Float32Array }.
// deg, salt: the far trees (life/groves.js) ask for larger blocks with fewer sites, on a
// lattice of their own: BLOCK_DEG and the trees' own numbers when left out.
export function treeBlock(hs, bi, bj, spacing = 7, nominal = BLOCK_DEG, salt = 4409) {
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
    const near = hs.nearWater < 30 + 0.6 * Math.max(0, 60 - tall);                 // metres from a river's or a lake's edge
    if (near) dens = Math.max(dens, cls === 15 || cls === 17 ? 0 : 0.5);
    const slope = hs.baseSlope;
    dens *= slope > 0.95 ? 0 : slope > 0.5 ? 1 - (slope - 0.5) / 0.45 : 1;
    const line = lineDef ? lineDef.base - lineDef.perDeg * Math.max(0, Math.abs(lat) - (lineDef.from ?? 0)) : treeLine(lat), over = (h - line + 350) / 350;                     // 0 well below the tree line, 1 at it
    if (over >= 1) continue;
    if (over > 0) dens *= 1 - over;
    if (u3 >= dens) continue;
    const sp = pick(flora ? floraFor(flora, cls, h / Math.max(1, line), near) : speciesFor(cls, lat, ((lon + 540) % 360) - 180, h, near), u4), S = SPECIES[sp];
    // height: the measured canopy's, more or less, and stunted toward the tree line
    const base = Math.max(tall, near ? 9 : 2.5), height = Math.max(1.2, base * S.tall * (0.72 + 0.5 * u1) * (over > 0 ? 1 - 0.6 * over : 1));
    const r = R + h, q = n * TREE_FLOATS;
    out[q] = d[0] * r - origin[0]; out[q + 1] = d[1] * r - origin[1]; out[q + 2] = d[2] * r - origin[2];
    out[q + 3] = height; out[q + 4] = S.wide * (0.85 + 0.35 * u2); out[q + 5] = u3 / Math.max(dens, 1e-3) * 6.2831853; out[q + 6] = sp; out[q + 7] = u4;
    n++;
  }
  return { origin, count: n, trees: out.slice(0, n * TREE_FLOATS) };
}
