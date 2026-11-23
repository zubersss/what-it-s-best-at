// The rocks of one tile of ground, worked out in a terrain worker (and in Node): where
// each block lies, how large, how it is turned. The rule is of the land alone, on a
// lattice that depends on the place alone, so the same boulders are there whenever anyone
// comes back.
//
// Where rock lies (`rockField`): fields of blocks on and under steep ground (talus, and
// the benches under cliffs: the slope is measured over some tens of metres, so the foot
// of a cliff counts as steep), blocks on brows and crests (ground that stands above its
// neighbours), scattered erratics on open ground, few in closed forest, none in water;
// in clusters with bare ground between (two noises decide, and how rocky the ground is
// sets how much of them is taken).
//
// Sizes come in levels (`surface.rocks.far.levels` in the world file): each level has its
// own tiles (larger tiles for larger rocks, which are seen from farther) and its own
// lattice of sites; a site holds a rock with the chance the field gives it. Within a tile
// the rocks are handed back in the order of how far each is seen from (largest first, the
// ones under trees after the ones in the open), so that whoever draws them can draw the
// first so-many and have the ones that can be seen from where they stand.
//
// (Plain arithmetic, no DOM, no three: it runs in the terrain workers and in Node.)
import { hash3, noise3 } from '../terrain/height/noise.js';

const EARTH_R = 6371000, RAD = Math.PI / 180;
const ss = (a, b, x) => { const t = (x - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };

// The defaults of a world's `surface.rocks.far` (a world gives only what it changes).
//   reach    metres a rock is seen from, for every metre of its size
//   below    metres over the ground: none are drawn from higher
//   albedo   the rock's colour (the world's `surface.rock` when left out: the cliffs' own)
//   clear    [[latitude, longitude, metres], ...]: no rock within these places
//   check    { steep: [latitude, longitude], level: [...] }: two places for scripts/rock-field.mjs --check
//   levels   size [from, to] (m: the same measure as the near rocks' `size`), tile (degrees
//            of latitude on Earth: 0.012 is 1.3 km on a world of any radius), sites (along a
//            tile's side), density (the share of the sites that hold a rock where the ground
//            is all rock), cap (the most a tile holds: the largest are kept), wl (the
//            fineness of the ground they are stood on, m), forest (how much closed forest
//            takes away: the largest stand out of the trees)
// A level's tile is about as wide as its largest rock is seen from far, so every level
// needs the same few tiles round the traveller, and a view holds three or four of each:
// the draw calls are counted in tiles.
export const ROCKS_FAR_DEFAULTS = {
  reach: 420, below: 12000,
  levels: [
    { size: [1.4, 3.4], tile: 0.012, sites: 128, density: 0.42, cap: 3072, wl: 2, forest: 0.6 },
    { size: [3.4, 8], tile: 0.03, sites: 128, density: 0.5, cap: 4096, wl: 6, forest: 0.4 },
    { size: [8, 20], tile: 0.075, sites: 128, density: 0.6, cap: 4096, wl: 10, forest: 0.15 },
  ],
};
export function rocksFarDef(world) {
  const f = world?.surface?.rocks?.far;
  if (!f) return null;
  return { ...ROCKS_FAR_DEFAULTS, ...f, levels: (f.levels || ROCKS_FAR_DEFAULTS.levels).map((l, i) => ({ ...(ROCKS_FAR_DEFAULTS.levels[i] || ROCKS_FAR_DEFAULTS.levels[2]), clear: f.clear || [], reach: f.reach ?? ROCKS_FAR_DEFAULTS.reach, ...l })) };
}

// A tile's height in degrees on a world of radius R (nominal: on Earth), and its width in
// longitude: the same for every tile of a one-degree band of latitude, a whole number of
// tiles round the world. (The trees' blocks are laid out the same way: life/treeBlock.js.)
export function tileDeg(R, nominal) { return nominal * EARTH_R / R; }
export function tileLon(bi, deg) { const band = Math.floor(bi * deg) + 0.5; return 360 / Math.max(1, Math.round(360 / (deg / Math.max(0.05, Math.cos(band * RAD))))); }

// How rocky the ground is at a place, 0..1, and the share of the cluster noise taken there.
// S: slope (m per m) over some tens of metres; conv: how far the place stands above the
// mean of the ground 12 m round it (m); closed: how closed the canopy is (0..1); cls: the
// land-cover class; near: metres from a river's or a lake's edge; over: 0 well below the
// tree line, 1 at it and above.
export function rockiness(S, conv, closed, cls, near, over, forest = 0.82) {
  const steep = ss(0.08, 0.46, S) * (1 - 0.45 * ss(1.1, 1.9, S));           // talus and broken slopes; less on the faces themselves
  const brow = 0.7 * ss(0.25, 1.1, conv) * ss(0.06, 0.2, S);                // crests, brows of benches, knolls
  const shore = near < 14 ? 0.45 * (1 - near / 14) : 0;                     // boulders along the water
  let k = Math.max(steep, brow, shore) + 0.15 * over + (cls === 7 || cls === 16 ? 0.12 : 0);
  k *= 1 - forest * closed;                                                   // few in closed forest
  if (cls === 15) k *= 0.7;                                                 // under snow
  return k > 1 ? 1 : k;
}

// From how far a rock is seen: `reach` metres for every metre of the size it is seen as,
// times a share for the small ones (they are a few pixels there, and most of the count):
// SMALL_SHARE up to the size `lo`, all of it from the size `hi` (the vertex shader's rule:
// farRocks.js, uFar.z; the governor lowers `small`).
export const SMALL_SHARE = 0.82;
export function shareOf(sz, small, lo, hi) { if (sz >= hi) return 1; if (sz <= lo) return small; const t = (sz - lo) / (hi - lo); return small + (1 - small) * t * t * (3 - 2 * t); }

// The cluster noise at a place (planet-centred metres): fields some hundred metres across,
// broken into groups of some tens, with bare ground between. Roughly normal about 0 with a spread of 0.23.
export function clusterNoise(px, py, pz) {
  return 0.55 * noise3(px / 260 + 5.3, py / 260 - 2.9, pz / 260 + 11.7) + 0.5 * noise3(px / 85 - 7.1, py / 85 + 3.3, pz / 85 + 1.9) + 0.35 * noise3(px / 27 + 2.2, py / 27 - 8.4, pz / 27 + 6.1);
}
// The chance a site holds a rock (before the level's own density): c: clusterNoise there,
// k: rockiness there. Open ground keeps the noise's highest few per cent (erratics, here
// and there a field of them); rock ground nearly all of it.
const CANOPY_SEEN = 180;      // metres a rock under a closed canopy is seen from (it grows in over the last fifth)
const OPEN_THR = 0.33, ROCK_THR = -0.03, THR_SOFT = 0.14;
export function rockField(c, k) { const thr = OPEN_THR + (ROCK_THR - OPEN_THR) * k; return ss(thr, thr + THR_SOFT, c) * (0.45 + 0.55 * k); }

// (the ground's slope east and north, -2..2, in a byte: the shader lays the rock's shadow on that ground)
const slopeByte = (g) => Math.max(0, Math.min(255, Math.round(127.5 + 63.75 * g)));
function qmul(a, b, o) {
  const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0];
  const z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
  o[0] = x; o[1] = y; o[2] = z; o[3] = w; return o;
}
// the turn that takes the z axis to the unit vector n
function qFromZ(n, o) {
  const w = 1 + n[2];
  if (w < 1e-6) { o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; return o; }
  const l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + w * w);
  o[0] = -n[1] / l; o[1] = n[0] / l; o[2] = 0; o[3] = w / l; return o;
}

// hs: the world's height source (with its land cover given, if it has one); L: one level of
// rocksFarDef(world).levels; bi, bj: the tile; li: the level's number (its lattice's own).
// Returns { origin [x, y, z] (planet-centred, m), count, off Float32Array 4n (x, y, z from
// the origin in planet axes, and the rock's size), quat 4n, scale 3n, shape Uint8Array 4n
// (the numbers its fracture planes are made from), misc Uint8Array 4n (sunlight on it:
// 255 until asked; its tone in seven bits, and 128 more with snow on it; the ground's
// slope there toward the east and toward the north, 127.5 + 63.75 x metres per metre), seen
// Uint8Array n (the share of its size it is seen as from afar: 255 in the open, less under
// trees), bound [x, y, z, r] (a sphere round them all, from the origin) }, the rock seen
// from farthest first (size x seen / 255).
export function rockBlock(hs, L, li, bi, bj) {
  const R = hs.radius, deg = tileDeg(R, L.tile), dLon = tileLon(bi, deg), lat0 = bi * deg, lon0 = bj * dLon, K = L.sites ?? 128;
  const salt = 6007 + li * 131, s0 = L.size[0], sr = L.size[1] / L.size[0], wl = L.wl ?? 2;
  const lineDef = hs.life?.trees?.line;
  // (ground kept clear: where the journey begins and the lander stands; [lat, lon, metres])
  const clear = (L.clear || []).map(([la, lo, m]) => { const cl = Math.cos(la * RAD); return [cl * Math.cos(lo * RAD), cl * Math.sin(lo * RAD), Math.sin(la * RAD), Math.cos(m / R)]; });
  const dirOf = (lat, lon, d) => { const cl = Math.cos(lat * RAD); d[0] = cl * Math.cos(lon * RAD); d[1] = cl * Math.sin(lon * RAD); d[2] = Math.sin(lat * RAD); return d; };
  const d = [0, 0, 0], o = [0, 0, 0], e = [0, 0, 0], nn = [0, 0, 0], g = [0, 0, 0], q1 = [0, 0, 0, 1], q2 = [0, 0, 0, 1], q3 = [0, 0, 0, 1];
  dirOf(lat0 + deg / 2, lon0 + dLon / 2, o);
  const h0 = hs.height(o[0], o[1], o[2], 30), origin = [o[0] * (R + h0), o[1] * (R + h0), o[2] * (R + h0)];
  // (the slope and the brow are measured on ground this coarse, with arms this long: a
  // bench under a cliff is steep ground, a single step in a field is not)
  const ARM = 12, WLS = 16, a = ARM / R;
  const found = [];
  for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
    const h1 = hash3(bi * 131 + i, bj * 137 + j, 17, salt), h2 = hash3(bi * 131 + i, bj * 137 + j, 29, salt);
    const u1 = (h1 & 0xffff) / 65536, u2 = (h1 >>> 16) / 65536, u3 = (h2 & 0xffff) / 65536, u4 = (h2 >>> 16) / 65536;
    if (u3 >= L.density) continue;                               // (no field takes this site: nothing is asked)
    const lat = lat0 + (j + 0.1 + 0.8 * u1) / K * deg, lon = lon0 + (i + 0.1 + 0.8 * u2) / K * dLon;
    dirOf(lat, lon, d);
    const px = d[0] * R, py = d[1] * R, pz = d[2] * R;
    const c = clusterNoise(px, py, pz);
    if (u3 >= L.density * rockField(c, 1)) continue;             // (not even on all-rock ground)
    if (clear.length) { let out = false; for (const z of clear) if (d[0] * z[0] + d[1] * z[1] + d[2] * z[2] > z[3]) { out = true; break; } if (out) continue; }
    const cover = hs.coverAt ? hs.coverAt(d[0], d[1], d[2]) : -1;
    const cls = cover < 0 ? 0 : cover & 255, closed = cover < 0 ? 0 : (cover >> 16) / 255;
    if (cls === 17) continue;                                    // water, by the map
    // the ground there and 12 m round it: east and north of the place
    const cl = Math.cos(lat * RAD), sl = Math.sin(lat * RAD), co = Math.cos(lon * RAD), so = Math.sin(lon * RAD);
    e[0] = -so; e[1] = co; e[2] = 0; nn[0] = -sl * co; nn[1] = -sl * so; nn[2] = cl;
    const hc = hs.height(d[0], d[1], d[2], WLS);
    if (hs.waterDepth > 0) continue;
    const near = hs.nearWater;
    const at = (ke, kn) => { const x = d[0] + (e[0] * ke + nn[0] * kn) * a, y = d[1] + (e[1] * ke + nn[1] * kn) * a, z = d[2] + (e[2] * ke + nn[2] * kn) * a, l = Math.sqrt(x * x + y * y + z * z); return hs.height(x / l, y / l, z / l, WLS); };
    const hE = at(1, 0), hW = at(-1, 0), hN = at(0, 1), hS = at(0, -1);
    const gE = (hE - hW) / (2 * ARM), gN = (hN - hS) / (2 * ARM), S = Math.hypot(gE, gN), conv = hc - (hE + hW + hN + hS) / 4;
    const line = lineDef ? lineDef.base - lineDef.perDeg * Math.max(0, Math.abs(lat) - (lineDef.from ?? 0)) : 1e9, over = ss(line - 350, line + 150, hc);
    const k = rockiness(S, conv, closed, cls, near, over, L.forest ?? 0.82);
    if (u3 >= L.density * rockField(c, k)) continue;
    // its size: most are small, and the large ones lie where the ground is rockiest
    const size = s0 * Math.pow(sr, Math.pow(u4, 1.9 - 0.7 * k));
    const h = wl < WLS ? hs.height(d[0], d[1], d[2], wl) : hc;
    if (hs.waterDepth > 0) continue;
    // turned any way round, leaning half with the slope, tilted a little of its own
    const h3 = hash3(bi * 131 + i, bj * 137 + j, 43, salt), h4 = hash3(bi * 131 + i, bj * 137 + j, 61, salt);
    const lean = 0.55, gl = Math.sqrt(1 + (gE * lean) * (gE * lean) + (gN * lean) * (gN * lean));
    g[0] = (d[0] - (e[0] * gE + nn[0] * gN) * lean) / gl; g[1] = (d[1] - (e[1] * gE + nn[1] * gN) * lean) / gl; g[2] = (d[2] - (e[2] * gE + nn[2] * gN) * lean) / gl;
    qFromZ(g, q1);
    const yaw = (h3 & 0xffff) / 65536 * Math.PI, tx = (((h3 >>> 16) & 0xff) / 255 - 0.5) * 0.45, ty = ((h3 >>> 24) / 255 - 0.5) * 0.45;
    q2[0] = 0; q2[1] = 0; q2[2] = Math.sin(yaw); q2[3] = Math.cos(yaw);                    // (half angles: a whole turn)
    q3[0] = Math.sin(tx / 2); q3[1] = Math.sin(ty / 2); q3[2] = 0; q3[3] = Math.sqrt(Math.max(0, 1 - q3[0] * q3[0] - q3[1] * q3[1]));
    qmul(q1, q2, q1); qmul(q1, q3, q1);
    // its proportions: the large ones stand taller (outcrops, tors), the small lie flat
    const big = ss(6, 13, size);
    const sx = 0.8 + 0.5 * ((h4 >>> 8) & 0xff) / 255, sy = 0.7 + 0.5 * ((h4 >>> 16) & 0xff) / 255, sz = 0.5 + 0.4 * (h4 >>> 24) / 255 + 0.35 * big * u1;
    // sunk a little, and more on a slope: its downhill edge must not hang in the air
    const sink = size * (0.12 + Math.min(0.3, 0.3 * S)), r = R + h - sink;
    // from how far it is seen, as a size (`seen`, a share of its own in a byte): under a
    // closed canopy a rock cannot be seen from outside the wood, so there it is drawn to
    // 150 m or so, and only the few that stand above the trees from afar
    const under = ss(0.35, 0.7, closed), sq = Math.max(1, Math.round(255 * Math.max(1 - under * (1 - ss(9, 16, size)), Math.min(1, CANOPY_SEEN / ((L.reach || 420) * size)))));
    found.push({ size, sq, e: size * sq / 255, x: d[0] * r - origin[0], y: d[1] * r - origin[1], z: d[2] * r - origin[2], q: [q1[0], q1[1], q1[2], q1[3]], sx: size * sx, sy: size * sy, sz: size * sz,
      shape: hash3(bi * 131 + i, bj * 137 + j, 71, salt), tone: (h4 & 0x7f) + (cls === 15 ? 128 : 0), gE: slopeByte(gE), gN: slopeByte(gN) });
  }
  found.sort((p, q) => q.e - p.e || q.size - p.size);
  const n = Math.min(found.length, L.cap ?? 512);
  const off = new Float32Array(n * 4), quat = new Float32Array(n * 4), scale = new Float32Array(n * 3), shape = new Uint8Array(n * 4), misc = new Uint8Array(n * 4), seen = new Uint8Array(n);
  let bx = 0, by = 0, bz = 0, br = 0;
  for (let i = 0; i < n; i++) { bx += found[i].x; by += found[i].y; bz += found[i].z; }
  if (n) { bx /= n; by /= n; bz /= n; }
  for (let i = 0; i < n; i++) {
    const f = found[i];
    off[i * 4] = f.x; off[i * 4 + 1] = f.y; off[i * 4 + 2] = f.z; off[i * 4 + 3] = f.size;
    quat.set(f.q, i * 4); seen[i] = f.sq;
    scale[i * 3] = f.sx; scale[i * 3 + 1] = f.sy; scale[i * 3 + 2] = f.sz;
    shape[i * 4] = f.shape & 0xff; shape[i * 4 + 1] = (f.shape >>> 8) & 0xff; shape[i * 4 + 2] = (f.shape >>> 16) & 0xff; shape[i * 4 + 3] = f.shape >>> 24;
    misc[i * 4] = 255; misc[i * 4 + 1] = f.tone; misc[i * 4 + 2] = f.gE; misc[i * 4 + 3] = f.gN;
    br = Math.max(br, Math.hypot(f.x - bx, f.y - by, f.z - bz) + 1.5 * f.size);
  }
  return { origin, count: n, off, quat, scale, shape, misc, seen, bound: [bx, by, bz, br] };
}

// Sunlight on the rocks of a tile (the land's own shadow: a rock under a mountain's shade
// is in shade). baker: the worker's ShadowBaker; origin, off, count: the tile as rockBlock
// gave it. A ray for every rock where they are few; where they are many, rays on a grid
// across the tile and each rock reads between them (a tile of small rocks is 1.3 km wide:
// the grid's cells are 67 m). Returns Uint8Array n (0 shade .. 255 sun).
const VIS_GRID = 21, VIS_EACH = 400;
export function rockVis(baker, origin, off, count, sun, sunHalf) {
  const out = new Uint8Array(count), R = baker.hs.radius;
  const one = (x, y, z, lift) => { const r = Math.sqrt(x * x + y * y + z * z); return baker.visibility(x / r, y / r, z / r, r - R + lift, sun[0], sun[1], sun[2], 4, sunHalf); };
  if (count <= VIS_EACH) {
    for (let i = 0; i < count; i++) out[i] = Math.round(255 * one(origin[0] + off[i * 4], origin[1] + off[i * 4 + 1], origin[2] + off[i * 4 + 2], 0.6 * off[i * 4 + 3]));
    return out;
  }
  // a frame across the tile: two axes on the ground through the origin, wide enough for every rock
  const ol = Math.hypot(origin[0], origin[1], origin[2]), u = [origin[0] / ol, origin[1] / ol, origin[2] / ol];
  let ax = [-u[1], u[0], 0]; const al = Math.hypot(ax[0], ax[1]) || 1; ax = al < 1e-6 ? [1, 0, 0] : [ax[0] / al, ax[1] / al, 0];
  const ay = [u[1] * ax[2] - u[2] * ax[1], u[2] * ax[0] - u[0] * ax[2], u[0] * ax[1] - u[1] * ax[0]];
  let lo0 = 1e9, hi0 = -1e9, lo1 = 1e9, hi1 = -1e9;
  for (let i = 0; i < count; i++) { const a = off[i * 4] * ax[0] + off[i * 4 + 1] * ax[1] + off[i * 4 + 2] * ax[2], b = off[i * 4] * ay[0] + off[i * 4 + 1] * ay[1] + off[i * 4 + 2] * ay[2]; if (a < lo0) lo0 = a; if (a > hi0) hi0 = a; if (b < lo1) lo1 = b; if (b > hi1) hi1 = b; }
  const G = VIS_GRID, grid = new Float32Array(G * G), w0 = Math.max(1, hi0 - lo0), w1 = Math.max(1, hi1 - lo1), hs = baker.hs;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const a = lo0 + w0 * i / (G - 1), b = lo1 + w1 * j / (G - 1);
    const x = origin[0] + ax[0] * a + ay[0] * b, y = origin[1] + ax[1] * a + ay[1] * b, z = origin[2] + ax[2] * a + ay[2] * b, r = Math.sqrt(x * x + y * y + z * z);
    const h = hs.height(x / r, y / r, z / r, 8);
    grid[j * G + i] = baker.visibility(x / r, y / r, z / r, h + 1.2, sun[0], sun[1], sun[2], 8, sunHalf);
  }
  for (let i = 0; i < count; i++) {
    const a = (off[i * 4] * ax[0] + off[i * 4 + 1] * ax[1] + off[i * 4 + 2] * ax[2] - lo0) / w0 * (G - 1), b = (off[i * 4] * ay[0] + off[i * 4 + 1] * ay[1] + off[i * 4 + 2] * ay[2] - lo1) / w1 * (G - 1);
    const i0 = Math.min(G - 2, Math.max(0, Math.floor(a))), j0 = Math.min(G - 2, Math.max(0, Math.floor(b))), fa = Math.min(1, Math.max(0, a - i0)), fb = Math.min(1, Math.max(0, b - j0));
    const v = (grid[j0 * G + i0] * (1 - fa) + grid[j0 * G + i0 + 1] * fa) * (1 - fb) + (grid[(j0 + 1) * G + i0] * (1 - fa) + grid[(j0 + 1) * G + i0 + 1] * fa) * fb;
    out[i] = Math.round(255 * v);
  }
  return out;
}

// For whoever walks among the large ones (farRocks.js, riseAt): the block as it is drawn,
// near enough: its fracture planes (ROCK_SHAPE_GLSL in rocks.js, in JavaScript: change one,
// change the other) and a sphere a little inside the lump they are cut from.
// The highest point of rock i on the vertical through a place: (x, y, z): the place from
// the rock's middle (m, planet axes); up: the vertical there. Metres over the place, or 0.
const LUMP = 0.86, TAU = 6.2831853;
const fr = (v) => v - Math.floor(v);
export function rockTop(x, y, z, up, quat, scale, shape, i) {
  // into the rock's own axes (the turn undone), in units of its size along each
  const qx = -quat[i * 4], qy = -quat[i * 4 + 1], qz = -quat[i * 4 + 2], qw = quat[i * 4 + 3];
  const rot = (vx, vy, vz, o) => {
    const tx = qy * vz - qz * vy + qw * vx, ty = qz * vx - qx * vz + qw * vy, tz = qx * vy - qy * vx + qw * vz;
    o[0] = vx + 2 * (qy * tz - qz * ty); o[1] = vy + 2 * (qz * tx - qx * tz); o[2] = vz + 2 * (qx * ty - qy * tx);
  };
  const p = _p, u = _u;
  rot(x, y, z, p); rot(up[0], up[1], up[2], u);
  const sx = scale[i * 3], sy = scale[i * 3 + 1], sz = scale[i * 3 + 2];
  p[0] /= sx; p[1] /= sy; p[2] /= sz; u[0] /= sx; u[1] /= sy; u[2] /= sz;
  // the line p + t u inside the lump's sphere ...
  const a = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], bq = p[0] * u[0] + p[1] * u[1] + p[2] * u[2], c = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - LUMP * LUMP, disc = bq * bq - a * c;
  if (disc <= 0) return 0;
  let t0 = (-bq - Math.sqrt(disc)) / a, t1 = (-bq + Math.sqrt(disc)) / a;
  // ... and under every fracture plane
  const s0 = shape[i * 4] / 255, s1 = shape[i * 4 + 1] / 255, s2 = shape[i * 4 + 2] / 255, s3 = shape[i * 4 + 3] / 255;
  const az = s0 * TAU, sides = 4 + Math.floor(s3 * 2.999);
  for (let f = 0; f <= sides; f++) {
    let nz, ang, h;
    if (f < sides) { ang = az + f * TAU / sides + (fr(s1 * 7.13 + f * 0.618034) - 0.5) * 0.9; nz = (fr(s2 * 5.71 + f * 0.381966) - 0.45) * 0.55; h = 0.5 + 0.32 * fr(s1 * 3.31 + f * 0.754878); }
    else { ang = s2 * TAU; nz = 0.6 + 0.37 * s1; h = 0.35 + 0.35 * s0; }
    const sn = Math.sqrt(Math.max(0, 1 - nz * nz)), nx = Math.cos(ang) * sn, ny = Math.sin(ang) * sn;
    const dp = p[0] * nx + p[1] * ny + p[2] * nz - h, du = u[0] * nx + u[1] * ny + u[2] * nz;
    if (Math.abs(du) < 1e-9) { if (dp > 0) return 0; continue; }
    const t = -dp / du;
    if (du > 0) { if (t < t1) t1 = t; } else if (t > t0) t0 = t;
    if (t0 >= t1) return 0;
  }
  return t1 > 0 ? t1 : 0;
}
const _p = [0, 0, 0], _u = [0, 0, 0];
