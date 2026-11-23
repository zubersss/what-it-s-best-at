// Makes the small world's maps (milestone 12: `haven`), by rule, from a seed: no data from
// anywhere. A planet 250 km in radius whose land is shaped to be flown over: continents and
// islands in a sea, long mountain ranges, stepped plateaus, basins; then the water that
// would run on it cuts its valleys and canyons and stands in its hollows (the land is
// solved against its own drainage, see `solve`), so that every valley leads down to a
// lake or the sea, as on a real world.
//
//   node scripts/make-world.mjs [--width 4096] [--seed 7] [--out public/data] [--preview dir] [--only-preview]
//
// Writes (width W, height W / 2, north in the first row, longitude 0 at the left edge):
//   haven_dem_<W>.i16         elevation, metres (the sea's level is 0; lake beds as they are)
//   haven_lakes_<W>.png       grey: which lake a cell belongs to (0: none), and
//   haven_lakes.json          each lake's water level (m), area (km2) and deepest place (m)
//   haven_rain_720.u8         the year's rain, 3.2 * sqrt(mm), 720 x 360, from longitude -180
//   .cache/haven/haven_flow_<W>.u8   how much water runs through every cell (for the maps made after this)
// and, with --preview, pictures to judge the land by: shaded relief with rivers and lakes.
// The colour, slope, water and cloud maps are made from these by scripts/make-world-maps.mjs.
//
// Everything here runs in Node in a minute or two; nothing of it runs in the game.
import fs from 'node:fs';
import path from 'node:path';
import { noise3 } from '../src/terrain/height/noise.js';
import { png } from './lib/png.mjs';

const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const W = +opt('width', 4096), H = W >> 1, N = W * H, SEED = +opt('seed', 7);
const OUT = opt('out', 'public/data'), PREVIEW = opt('preview', null), CACHE = opt('cache', '.cache/haven');
const RADIUS = 250000, CELL = Math.PI * RADIUS / H;           // metres per cell of latitude (and of longitude at the equator)
const t0 = Date.now(), say = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${s}`);

// --- noise on the sphere
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
// (each field has its own corner of the noise: an offset by seed and by field)
const off = (k) => [SEED * 17.31 + k * 101.7, SEED * 5.77 + k * 47.3, SEED * 29.9 + k * 13.1];
function fbm(x, y, z, f, oct, o, gain = 0.5, lac = 2.03) {
  let a = 1, s = 0, n = 0; x = x * f + o[0]; y = y * f + o[1]; z = z * f + o[2];
  for (let k = 0; k < oct; k++) { s += a * noise3(x, y, z); n += a; a *= gain; x *= lac; y *= lac; z *= lac; }
  return s / n;
}
// ridges: sharp crests where the noise crosses zero, each octave stronger on the last one's crests
function ridged(x, y, z, f, oct, o, gain = 0.5, lac = 2.07) {
  let a = 1, s = 0, n = 0, w = 1; x = x * f + o[0]; y = y * f + o[1]; z = z * f + o[2];
  for (let k = 0; k < oct; k++) { let r = 1 - Math.abs(noise3(x, y, z)); r *= r; s += a * r * w; n += a; w = Math.min(1, r * 1.6); a *= gain; x *= lac; y *= lac; z *= lac; }
  return s / n;
}

// --- the grid
const cosLat = new Float64Array(H), sinLat = new Float64Array(H), cosLon = new Float64Array(W), sinLon = new Float64Array(W), latDeg = new Float64Array(H);
for (let j = 0; j < H; j++) { const la = (0.5 - (j + 0.5) / H) * Math.PI; cosLat[j] = Math.cos(la); sinLat[j] = Math.sin(la); latDeg[j] = la * 180 / Math.PI; }
for (let i = 0; i < W; i++) { const lo = (i + 0.5) / W * 2 * Math.PI; cosLon[i] = Math.cos(lo); sinLon[i] = Math.sin(lo); }

// ============================================================ 1. the land before water
// z: height (m). hard: how well the rock stands (1: ordinary; more on the plateaus' caps:
// their rivers run in canyons with walls). All of it from a handful of slow fields.
const z = new Float32Array(N), hard = new Float32Array(N);
{
  const oW1 = off(1), oW2 = off(2), oW3 = off(3), oC = off(4), oB = off(5), oR = off(6), oP = off(7), oT = off(8), oH = off(9), oL = off(10), oS = off(11), oI = off(12);
  for (let j = 0; j < H; j++) {
    const cl = cosLat[j], sl = sinLat[j], la = Math.abs(latDeg[j]);
    // (the caps are sea: the map tiles round the traveller are Mercator, which has no poles)
    const polar = ss(56, 72, la);
    for (let i = 0; i < W; i++) {
      let x = cl * cosLon[i], y = cl * sinLon[i], zz = sl;
      // the fields are read a little off their place, by a slow field of their own: coasts and
      // ranges wander instead of following the noise's own grain
      const wx = fbm(x, y, zz, 1.7, 3, oW1), wy = fbm(x, y, zz, 1.7, 3, oW2), wz = fbm(x, y, zz, 1.7, 3, oW3);
      x += 0.22 * wx; y += 0.22 * wy; zz += 0.22 * wz;
      // continents: land where this is over nothing
      const c = fbm(x, y, zz, 1.25, 6, oC, 0.52) * 1.5 + 0.035 - 0.8 * polar + 0.1 * fbm(x, y, zz, 9, 3, oI);
      const o = j * W + i;
      if (c <= 0) {
        // the sea's bed: a shelf, then the deep
        z[o] = -(6 + 150 * ss(0, 0.08, -c) + 3200 * ss(0.05, 0.6, -c)) + 60 * fbm(x, y, zz, 12, 3, oH);
        hard[o] = 1; continue;
      }
      const inland = ss(0, 0.16, c);
      // lowlands: rising slowly from the shore
      let h = 4 + 230 * inland + 420 * c * c;
      // rolling country
      h += (60 + 110 * inland) * fbm(x, y, zz, 16, 5, oH) * (0.4 + 0.6 * inland);
      // mountain ranges: long belts where a slow field crosses nothing, crested
      const belt = 1 - Math.abs(fbm(x, y, zz, 2.3, 4, oB, 0.5)) * 3.2;
      const range = ss(0.42, 0.9, belt) * ss(0.0, 0.1, c);
      const crest = ridged(x, y, zz, 10, 6, oR, 0.55);
      h += range * (550 + 3600 * Math.pow(crest, 1.7));
      // foothills round them
      h += ss(-0.1, 0.55, belt) * ss(0.02, 0.14, c) * 340 * ridged(x, y, zz, 22, 4, oS);
      // plateaus: tablelands at one of a few levels, their tops nearly level
      const pf = fbm(x, y, zz, 2.9, 3, oP);
      const table = ss(0.1, 0.2, pf) * (1 - ss(0.2, 0.6, range)) * ss(0.03, 0.12, c);
      const level = 700 + 380 * Math.floor(2.99 * ss(-0.5, 0.5, fbm(x, y, zz, 1.9, 2, oT)));
      const top = level + 50 * fbm(x, y, zz, 20, 4, oH) + 160 * ss(0.2, 0.5, pf);
      h = mix(h, Math.max(h, top), table);
      hard[o] = 1 + 2.2 * table;
      // hollows in the uplands (some will hold lakes)
      const hollow = ss(0.62, 0.85, fbm(x, y, zz, 6.5, 3, oL) + 0.25) * inland * (1 - 0.6 * table);
      h -= hollow * Math.min(0.55 * h, 320);
      z[o] = h;
    }
  }
  say('the land before water');
}

// ============================================================ 2. the water's own shaping
// Neighbours: 8, the grid wraps in longitude; distances in metres (a row's cells narrow
// toward the poles).
const DJ = [-1, -1, 0, 1, 1, 1, 0, -1], DI = [0, 1, 1, 1, 0, -1, -1, -1];
const dist = new Float32Array(H * 8);
for (let j = 0; j < H; j++) { const dx = CELL * cosLat[j]; for (let k = 0; k < 8; k++) dist[j * 8 + k] = Math.hypot(DI[k] * dx, DJ[k] * CELL); }
const rainYear = new Float32Array(N);          // mm a year
function rains() {
  const oN = off(20);
  // wet near the equator and in the middle latitudes, dry in the horse latitudes; more on
  // high ground up to 1 500 m, less above; patches
  for (let j = 0; j < H; j++) {
    const la = Math.abs(latDeg[j]), band = 1000 + 500 * Math.exp(-la * la / 200) - 520 * Math.exp(-((la - 27) ** 2) / 90) + 300 * Math.exp(-((la - 50) ** 2) / 200);
    for (let i = 0; i < W; i++) {
      const o = j * W + i, h = Math.max(0, z[o]), cl = cosLat[j];
      const n = fbm(cl * cosLon[i], cl * sinLon[i], sinLat[j], 3.1, 4, oN);
      rainYear[o] = Math.max(120, (band + 700 * ss(100, 1500, h) - 500 * ss(1500, 3500, h)) * (1 + 0.55 * n));
    }
  }
}
const fill = new Float32Array(N), rcv = new Int32Array(N), order = new Int32Array(N), area = new Float32Array(N);
let nOrder = 0;
const heap = new Int32Array(N + 1);
// The flood: every land cell gets a way down to the sea, reached in order of height from
// the coast inward; a hollow is filled to its lip on the way (fill). order: cells as
// reached (coast first); rcv: the cell each drains to (-1: the sea).
function flood() {
  let hn = 0; nOrder = 0; rcv.fill(-2);
  const push = (i) => { let k = ++hn; const v = fill[i]; while (k > 1) { const p = k >> 1; if (fill[heap[p]] <= v) break; heap[k] = heap[p]; k = p; } heap[k] = i; };
  const pop = () => {
    const top = heap[1], last = heap[hn--]; if (hn === 0) return top;
    const v = fill[last]; let k = 1;
    for (;;) { let c = k << 1; if (c > hn) break; if (c < hn && fill[heap[c + 1]] < fill[heap[c]]) c++; if (fill[heap[c]] >= v) break; heap[k] = heap[c]; k = c; }
    heap[k] = last; return top;
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = j * W + i; if (z[o] > 0) continue;
    rcv[o] = -1; fill[o] = z[o];
    // (only the sea beside land need be in the queue)
    let coast = false;
    for (let k = 0; k < 8 && !coast; k++) { const jj = j + DJ[k]; if (jj < 0 || jj >= H) continue; coast = z[jj * W + ((i + DI[k] + W) % W)] > 0; }
    if (coast) { fill[o] = 0; push(o); }
  }
  while (hn) {
    const o = pop(), i = o % W, j = (o - i) / W, f = fill[o];
    if (z[o] > 0) order[nOrder++] = o;
    for (let k = 0; k < 8; k++) {
      const jj = j + DJ[k]; if (jj < 0 || jj >= H) continue;
      const q = jj * W + ((i + DI[k] + W) % W);
      if (rcv[q] !== -2) continue;
      const g = f + 1e-3;                                   // (a hair up: the way out always goes down)
      fill[q] = z[q] > g ? z[q] : g; rcv[q] = o; push(q);
    }
  }
  // the steepest way down on the filled land, where there is one steeper than the flood's own
  for (let k = 0; k < nOrder; k++) {
    const o = order[k], i = o % W, j = (o - i) / W, f = fill[o]; let best = 0, to = -1;
    for (let q = 0; q < 8; q++) { const jj = j + DJ[q]; if (jj < 0 || jj >= H) continue; const p = jj * W + ((i + DI[q] + W) % W), s = (f - fill[p]) / dist[j * 8 + q]; if (s > best) { best = s; to = p; } }
    if (to >= 0) rcv[o] = to;
  }
  // what drains through each cell: the land above it, by its rain (in cells of ordinary rain)
  // (counted in cells of a 2048-wide map, 767 m: the numbers below were found at that size and hold at any)
  const unit = (CELL / 766.99) ** 2;
  for (let k = 0; k < nOrder; k++) { const o = order[k], j = (o / W) | 0; area[o] = cosLat[j] * rainYear[o] / 1000 * unit; }
  // (a cell's receiver is not always earlier in `order` once the steepest way is taken: sort by filled height)
  const idx = order.subarray(0, nOrder); idx.sort((a, b) => fill[a] - fill[b]);
  for (let k = nOrder - 1; k >= 0; k--) { const o = idx[k], d = rcv[o]; if (d >= 0 && z[d] > 0) area[d] += area[o]; }
}
// One round of the solve: along every way down, the land may stand no higher above the
// water below it than a river of that size keeps its bed (steep for a brook, nearly level
// for a great river: slope = KS / (land drained)^THETA), and never steeper than the rock
// stands. Where the land is lower than that already (plains, a plateau's top, a hollow)
// it is left alone: so valleys and canyons are cut, and hollows stay to hold lakes.
const THETA = 0.45, KS = 0.62, SMAX = 0.72;
const surf = new Float32Array(N);              // the water's surface on the way down (a lake's level in its hollow)
function carve(strength) {
  let cut = 0, deepest = 0;
  for (let k = 0; k < nOrder; k++) {
    const o = order[k], d = rcv[o];
    const below = d < 0 || z[d] <= 0 ? 0 : surf[d];
    const i = o % W, j = (o - i) / W;
    let q = 0; if (d >= 0) { const di = ((d % W) - i + W + 1) % W - 1, dj = ((d / W) | 0) - j; for (let n = 0; n < 8; n++) if (DI[n] === di && DJ[n] === dj) { q = n; break; } }
    const hd = hard[o], s = Math.min(SMAX * (1 + 0.9 * (hd - 1)), KS * hd * Math.pow(Math.max(1, area[o]), -THETA));
    const prof = below + dist[j * 8 + q] * s;
    if (prof < z[o]) { const nz = z[o] + (prof - z[o]) * strength; cut++; if (z[o] - nz > deepest) deepest = z[o] - nz; z[o] = nz; }
    surf[o] = z[o] > below ? z[o] : below;
  }
  return { cut, deepest };
}
// Great rivers have floors: the land beside one is brought down to a little over its water
// for a few cells, wider the greater the river (a meadow to fly along, not a notch).
function floors() {
  const zn = z.slice();
  for (let k = 0; k < nOrder; k++) {
    const o = order[k]; if (area[o] < 900 || z[o] <= 0) continue;
    const r = Math.round(Math.min(4, 1 + Math.floor(Math.log10(area[o] / 900) * 1.6)) * 766.99 / CELL), i = o % W, j = (o - i) / W, lvl = surf[o];
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const jj = j + dj; if (jj < 0 || jj >= H) continue;
      const p = jj * W + ((i + di + W) % W), dd = Math.hypot(di, dj); if (dd > r + 0.5 || z[p] <= 0) continue;
      const cap = lvl + 1.5 + 6 * (dd * CELL / 766.99) ** 2;
      if (zn[p] > cap) zn[p] = cap;
    }
  }
  z.set(zn);
}

rains();
const ROUNDS = +opt('rounds', 5);
for (let it = 0; it < ROUNDS; it++) {
  flood();
  const r = carve(it < ROUNDS - 1 ? 0.8 : 1);
  if (it === ROUNDS - 2) floors();
  if (it === 1) rains();                     // (the rain follows the land's height, which the water has changed)
  say(`round ${it + 1}: ${nOrder} land cells, ${r.cut} cut, the deepest by ${r.deepest.toFixed(0)} m`);
}

// ============================================================ 3. lakes
// What the last flood filled: a hollow that is large and deep enough is a lake at the
// level of its lip; the small ones are filled with land (a valley's level floor).
flood();
const lakeId = new Uint8Array(N), lakes = [];
{
  const seen = new Uint8Array(N), stack = [], found = [];
  const MIN_KM2 = 3, MIN_DEEP = 12, MOST = +opt('lakes', 150);
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0] || z[s0] <= 0 || fill[s0] - z[s0] < 0.5) continue;
    stack.length = 0; stack.push(s0); seen[s0] = 1; const cells = []; let deep = 0, lvl = 1e9, km2 = 0;
    while (stack.length) {
      const o = stack.pop(); cells.push(o); const i = o % W, j = (o - i) / W;
      if (fill[o] - z[o] > deep) deep = fill[o] - z[o]; if (fill[o] < lvl) lvl = fill[o]; km2 += CELL * CELL * cosLat[j] / 1e6;
      for (let k = 0; k < 8; k++) { const jj = j + DJ[k]; if (jj < 0 || jj >= H) continue; const p = jj * W + ((i + DI[k] + W) % W); if (!seen[p] && z[p] > 0 && fill[p] - z[p] >= 0.5) { seen[p] = 1; stack.push(p); } }
    }
    found.push({ cells, deep, lvl, km2 });
  }
  // the best of them are lakes (large and deep first); the rest are filled with land
  found.sort((a, b) => b.km2 * Math.min(b.deep, 120) - a.km2 * Math.min(a.deep, 120));
  let kept = 0;
  for (const f of found) {
    if (kept < Math.min(254, MOST) && f.km2 >= MIN_KM2 && f.deep >= MIN_DEEP && f.cells.length >= 6) {
      // (one level all over, a whole number of quarter metres, as the game stores lake levels)
      const level = Math.round(f.lvl * 4) / 4, id = ++kept, c0 = f.cells[f.cells.length >> 1];
      lakes.push({ level, km2: +f.km2.toFixed(1), deep: +f.deep.toFixed(0), lat: +latDeg[(c0 / W) | 0].toFixed(2), lon: +(((c0 % W) + 0.5) / W * 360).toFixed(2) });
      for (const o of f.cells) lakeId[o] = id;
    } else for (const o of f.cells) z[o] = fill[o];
  }
  flood();
  say(`${found.length} hollows, ${lakes.length} of them lakes; the largest ${Math.max(0, ...lakes.map((l) => l.km2)).toFixed(0)} km2, the deepest ${Math.max(0, ...lakes.map((l) => l.deep))} m`);
}

// ============================================================ 4. what it came to, and the files
{
  let land = 0, top = 0, sum = 0, a = 0, aLand = 0;
  const bands = [0, 0, 0, 0, 0];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const o = j * W + i, w = cosLat[j]; a += w; if (z[o] > 0) { aLand += w; land++; sum += z[o] * w; if (z[o] > top) top = z[o]; bands[z[o] < 300 ? 0 : z[o] < 800 ? 1 : z[o] < 1500 ? 2 : z[o] < 2500 ? 3 : 4] += w; } }
  say(`land ${(100 * aLand / a).toFixed(0)} % of the world; mean height ${(sum / aLand).toFixed(0)} m, highest ${top.toFixed(0)} m; under 300 m ${(100 * bands[0] / aLand).toFixed(0)} %, to 800 ${(100 * bands[1] / aLand).toFixed(0)} %, to 1500 ${(100 * bands[2] / aLand).toFixed(0)} %, to 2500 ${(100 * bands[3] / aLand).toFixed(0)} %, above ${(100 * bands[4] / aLand).toFixed(0)} %`);
}
if (!flag('only-preview')) {
  fs.mkdirSync(OUT, { recursive: true });
  const dem = new Int16Array(N); for (let o = 0; o < N; o++) dem[o] = Math.max(-32768, Math.min(32767, Math.round(z[o])));
  fs.writeFileSync(path.join(OUT, `haven_dem_${W}.i16`), Buffer.from(dem.buffer));
  const lk = new Uint8Array(N * 3); for (let o = 0; o < N; o++) lk[o * 3] = lk[o * 3 + 1] = lk[o * 3 + 2] = lakeId[o];
  fs.writeFileSync(path.join(OUT, `haven_lakes_${W}.png`), png(W, H, lk));
  fs.writeFileSync(path.join(OUT, 'haven_lakes.json'), JSON.stringify({ width: W, height: H, lakes }));
  // the year's rain, as the hydrology reads it: 720 x 360 from longitude -180, 3.2 * sqrt(mm)
  const rain = new Uint8Array(720 * 360);
  for (let y = 0; y < 360; y++) for (let x = 0; x < 720; x++) {
    const j = Math.min(H - 1, Math.floor((y + 0.5) / 360 * H)), i = Math.floor((((x + 0.5) / 720 + 0.5) % 1) * W);
    rain[y * 720 + x] = Math.min(255, Math.round(3.2 * Math.sqrt(rainYear[j * W + i])));
  }
  fs.writeFileSync(path.join(OUT, 'haven_rain_720.u8'), rain);
  // the flow of every cell (log scale), for the maps made after this and for the preview
  const fl = new Uint8Array(N); for (let o = 0; o < N; o++) fl[o] = z[o] > 0 ? Math.min(255, Math.round(32 * Math.log10(1 + area[o]))) : 0;
  fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(path.join(CACHE, `haven_flow_${W}.u8`), fl);
  say('files written');
}

// ============================================================ 5. pictures to judge the land by
if (PREVIEW) {
  fs.mkdirSync(PREVIEW, { recursive: true });
  // shaded relief (light from the north-west), tinted by height, with rivers and lakes
  const shade = (o, i, j) => {
    const e = z[j * W + ((i + 1) % W)], w = z[j * W + ((i - 1 + W) % W)], n = z[Math.max(0, j - 1) * W + i], s = z[Math.min(H - 1, j + 1) * W + i];
    const gx = (Math.max(e, 0) - Math.max(w, 0)) / (2 * CELL * Math.max(0.05, cosLat[j])), gy = (Math.max(n, 0) - Math.max(s, 0)) / (2 * CELL);
    const k = 2.2, nx = -gx * k, ny = -gy * k, l = 1 / Math.hypot(nx, ny, 1);
    return Math.max(0.15, Math.min(1.5, 0.35 + 1.0 * (-0.55 * nx * l + 0.55 * ny * l + 0.63 * l)));
  };
  const tint = (h) => h <= 0 ? [18 + 40 * ss(-400, 0, h), 60 + 70 * ss(-400, 0, h), 110 + 70 * ss(-400, 0, h)] : h < 300 ? [96, 132, 70] : h < 800 ? [150, 150, 84] : h < 1500 ? [176, 140, 92] : h < 2600 ? [150, 122, 104] : [236, 236, 240];
  const draw = (file, x0, y0, w, h, scale) => {
    const px = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (x0 + Math.floor(x / scale) + W) % W, j = Math.min(H - 1, y0 + Math.floor(y / scale)), o = j * W + i;
      let c = tint(z[o]); const s = z[o] > 0 ? shade(o, i, j) : 1;
      if (lakeId[o]) c = [40, 120, 200]; else if (z[o] > 0 && area[o] > 400) c = [30, 90, 190]; else if (z[o] > 0 && area[o] > 60) c = [c[0] * 0.6 + 20, c[1] * 0.6 + 50, c[2] * 0.6 + 90];
      for (let q = 0; q < 3; q++) px[(y * w + x) * 3 + q] = Math.max(0, Math.min(255, c[q] * (lakeId[o] ? 1 : s)));
    }
    fs.writeFileSync(path.join(PREVIEW, file), png(w, h, px));
  };
  // the whole world, a quarter size (every fourth cell)
  { const s = W / 1024, w = 1024, h = 512, px = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = Math.floor(x * s), j = Math.floor(y * s), o = j * W + i; let c = tint(z[o]); const sh = z[o] > 0 ? shade(o, i, j) : 1; if (lakeId[o]) c = [40, 120, 200]; else if (z[o] > 0 && area[o] > 3000) c = [30, 90, 190]; for (let q = 0; q < 3; q++) px[(y * w + x) * 3 + q] = Math.max(0, Math.min(255, c[q] * (lakeId[o] ? 1 : sh))); }
    fs.writeFileSync(path.join(PREVIEW, 'world.png'), png(w, h, px)); }
  // close views, cell for cell: the highest ground, the largest lake, and a plateau's edge
  let hi = 0; for (let o = 0; o < N; o++) if (z[o] > z[hi]) hi = o;
  const at = (o, name, size = 640) => draw(name, (o % W) - size / 2, Math.max(0, Math.min(H - size, ((o / W) | 0) - size / 2)), size, size, 1);
  at(hi, 'close_mountains.png');
  if (lakes.length) { const big = lakes.reduce((a, b) => (b.km2 > a.km2 ? b : a)); at(Math.floor((90 - big.lat) / 180 * H) * W + Math.floor(big.lon / 360 * W), 'close_lake.png'); }
  let pl = -1, plBest = 0; for (let o = 0; o < N; o += 97) if (hard[o] > 2.5 && area[o] > plBest && Math.abs(latDeg[(o / W) | 0]) < 45) { plBest = area[o]; pl = o; }
  if (pl >= 0) at(pl, 'close_plateau.png');
  say('previews written');
}
