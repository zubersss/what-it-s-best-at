// The land, as the weather needs it (docs/briefs/clouds-weather-plan.md, "INPUTS"): the country
// height the cloud bases stand over, the hills whose slopes lift the air, the basins the fog
// lies in, where the coast is, the summits that wear caps and stand lenses downwind, and the
// sites where storm cells are born.
//
// One rule, two ways in:
//   makeWxLand({ dem, width, radius })   works the planes out from a world's elevation map
//                                        (about a second for Haven's 4 096 x 2 048)
//   readWxLand(bytes)                    reads them back from public/data/<world>_wxland_<W>.u8,
//                                        which scripts/make-world-maps.mjs writes with packWxLand
// Both give the same numbers (to the file's quantisation: scripts/sky-model-test.mjs checks it),
// so the game may load the file and a script may do without it.
//
// THE PLANES, 1 024 x 512 by default (rows from north to south, row 0 at latitude 90; columns
// from longitude 0 eastward, as the elevation map and the snapshot's maps):
//   g      m: the ground, the mean of the elevation map's cells in the texel, the sea at 0
//   hC     m: the country, g smoothed over COUNTRY_M (15 km). Cloud bases and fog stand over it.
//   hS     m: the hills, g smoothed over HILL_M (4.5 km). Its gradient lifts the air and turns
//             the ground wind (worked out from hS at load, never stored: one rule).
//   gmin   m: the lowest g within BASIN_M (13 km): the floor of the basin a place belongs to
//   land   0..1: the share of the texel that is land
//   coast  m: how far the nearest water is (0 over water), to COAST_MAX
// and derived: prom = max(0, hS - hC) (how proud of its country a hill stands), valley =
// max(0, hC - g) (how deep under its country a hollow lies).
//
// THE SUMMITS (peaks): every local top of the elevation map standing PEAK_PROM (600 m) or more
// over its country, with the bearing of its ridge. They stand the lenticular clouds downwind and
// wear caps. public/data/<world>_peaks.json is the same list, so a script need not build it.
//
// THE TRIGGER SITES (sites): where a storm cell may be born (cells.js) - the proud high ground
// (SITE_PROM or more over its country, SITE_APART apart) and points SEA_SITE_IN inland of the
// coast, where the sea breeze piles the air up. A fixed order (north to south, then east), so
// every machine makes the same list.
//
// Pure: no three, no DOM, no Math.random, no fs. It runs in the worker, on the main thread and
// in Node. Nothing here knows where the traveller is.

export const WX_LAND = Object.freeze({
  VERSION: 1,
  COUNTRY_M: 15000,   // m: the country's smoothing (hC)
  HILL_M: 4500,       // m: the hills' smoothing (hS)
  BASIN_M: 8000,      // m: how far round a place the floor of its hollow is looked for (gmin: where fog lies)
  COAST_MAX: 510000,  // m: the farthest the coast is counted (a byte of 2 km)
  COAST_STEP: 2000,   // m a byte of the coast plane
  PEAK_PROM: 600,     // m over its country: a summit of the peak list
  PEAK_APART: 6000,   // m: the least between two summits of the list
  SITE_PROM: 250,     // m over its country: high ground where a cell may be born
  SITE_APART: 5000,   // m: the least between two trigger sites
  SEA_SITE_IN: 12000, // m inland: the sea-breeze line
  SEA_SITE_BAND: 3000,// m: how wide that line is
  SEA_SITE_APART: 18000,
});

const DEG = Math.PI / 180, TWO_PI = 2 * Math.PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---- reading the planes --------------------------------------------------------------------

// A plane read as the GPU reads a map: LINEAR, REPEAT across longitude, CLAMP across latitude
// (format.js sampleMap's filter, on numbers instead of bytes). u in turns of longitude, v from
// the north pole.
export function sampleGrid(a, w, h, u, v) {
  const x = u * w - 0.5, y = v * h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const i0 = ((x0 % w) + w) % w, i1 = (i0 + 1) % w, j0 = clamp(y0, 0, h - 1), j1 = clamp(y0 + 1, 0, h - 1);
  return (a[j0 * w + i0] * (1 - fx) + a[j0 * w + i1] * fx) * (1 - fy) + (a[j1 * w + i0] * (1 - fx) + a[j1 * w + i1] * fx) * fy;
}

// What a place has. Everything a model asks of the land goes through this class, so the file and
// the freshly built planes cannot drift apart.
export class WxLand {
  // planes: { width, height, g, hC, hS, gmin, land, coast } (Float32Array or Int16Array each),
  // radius (m), peaks (the list below) and sites (made here when not given).
  constructor(planes) {
    const { width, height } = planes;
    if (!(width > 1 && height > 1)) throw new Error('wxland: no size');
    Object.assign(this, planes);
    this.radius = planes.radius;
    if (!(this.radius > 0)) throw new Error('wxland: the world radius (m) is needed');
    this.cellLat = Math.PI * this.radius / height;          // m a row
    this.peaks = planes.peaks || [];
    // the hills' gradient, worked out here once (one rule wherever it is asked for)
    if (!planes.gE) {
      const gE = new Float32Array(width * height), gN = new Float32Array(width * height), o = [0, 0];
      for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) { this.gradAt(i, j, o); gE[j * width + i] = o[0]; gN[j * width + i] = o[1]; }
      this.gE = gE; this.gN = gN;
    }
    this.sites = planes.sites || makeSites(this);
  }
  // metres a column at a row
  cellLon(j) { const lat = 90 - (j + 0.5) * 180 / this.height; return TWO_PI * this.radius * Math.cos(lat * DEG) / this.width; }
  // one plane at uv (format.js uvOfLatLon or uvOfDir)
  at(name, u, v) { return sampleGrid(this[name], this.width, this.height, u, v); }
  // ... at a place (degrees)
  atLatLon(name, lat, lon) { return sampleGrid(this[name], this.width, this.height, lon / 360, (90 - lat) / 180); }
  coastAt(u, v) { return sampleGrid(this.coast, this.width, this.height, u, v) * (this.coastStep || 1); }
  // the hills' gradient at a texel (m a metre, toward the east and the north), from hS
  gradAt(i, j, out = [0, 0]) {
    const W = this.width, H = this.height, hS = this.hS;
    const e = hS[j * W + ((i + 1) % W)], w = hS[j * W + ((i - 1 + W) % W)];
    const n = hS[Math.max(0, j - 1) * W + i], s = hS[Math.min(H - 1, j + 1) * W + i];
    out[0] = (e - w) / (2 * this.cellLon(j)); out[1] = (n - s) / (2 * this.cellLat);
    return out;
  }
}

// ---- building the planes from an elevation map -----------------------------------------------

// dem: { data: Int16Array, width, height, scale? } (rows from latitude 90, columns from longitude
// 0). width: the planes' width (height is half of it). Returns the planes and the peaks, ready
// for `new WxLand(...)` or packWxLand().
export function makeWxLand({ dem, width = 1024, radius, peaks: given = null }) {
  if (!dem || !dem.data) throw new Error('wxland: an elevation map is needed');
  const W = width, H = W >> 1, N = W * H, dw = dem.width, dh = dem.height, sc = dem.scale || 1;
  if (dem.data.length !== dw * dh) throw new Error('wxland: the elevation map is not width x height');
  if (!(radius > 0)) throw new Error('wxland: the world radius (m) is needed');
  const g = new Float32Array(N), land = new Float32Array(N), gfine = new Float32Array(N);
  {
    const sum = new Float64Array(N), cnt = new Float64Array(N), wet = new Float64Array(N), lo = new Float32Array(N).fill(Infinity);
    for (let j = 0; j < dh; j++) {
      const r = Math.min(H - 1, Math.floor(j * H / dh)) * W;
      for (let i = 0; i < dw; i++) {
        const k = r + Math.min(W - 1, Math.floor(i * W / dw)), v = dem.data[j * dw + i] * sc, h = v > 0 ? v : 0;
        sum[k] += h; cnt[k]++; if (v <= 0) wet[k]++; if (h < lo[k]) lo[k] = h;
      }
    }
    for (let k = 0; k < N; k++) { g[k] = sum[k] / cnt[k]; land[k] = 1 - wet[k] / cnt[k]; gfine[k] = lo[k]; }
  }
  const hC = blur(g, W, H, radius, WX_LAND.COUNTRY_M);
  const hS = blur(g, W, H, radius, WX_LAND.HILL_M);
  const gmin = lowest(gfine, W, H, radius, WX_LAND.BASIN_M);
  const coast = coastDistance(land, W, H, radius);
  const planes = { version: WX_LAND.VERSION, width: W, height: H, radius, g, hC, hS, gmin, land, coast, coastStep: 1 };
  planes.peaks = given || findPeaks(dem, planes);
  return planes;
}

// A box mean of `metres` across, wrapped in longitude and clamped in latitude, the columns' reach
// widened toward the poles (a texel is narrower there). Separable: columns, then rows.
function blur(a, W, H, radius, metres) {
  const out = new Float32Array(W * H), tmp = new Float32Array(W * H);
  const rowM = Math.PI * radius / H, half = metres / 2;
  for (let j = 0; j < H; j++) {
    const lat = 90 - (j + 0.5) * 180 / H, colM = TWO_PI * radius * Math.max(Math.cos(lat * DEG), 1e-3) / W;
    const rx = Math.min(W >> 1, Math.max(1, Math.round(half / colM)));
    let s = 0;
    for (let k = -rx; k <= rx; k++) s += a[j * W + (((k % W) + W) % W)];
    const n = 2 * rx + 1;
    for (let i = 0; i < W; i++) {
      tmp[j * W + i] = s / n;
      s += a[j * W + ((i + rx + 1) % W)] - a[j * W + (((i - rx) % W + W) % W)];
    }
  }
  const ry = Math.max(1, Math.round(half / rowM));
  for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) {
    let s = 0;
    for (let k = -ry; k <= ry; k++) s += tmp[clamp(j + k, 0, H - 1) * W + i];
    out[j * W + i] = s / (2 * ry + 1);
  }
  return out;
}

// The lowest value within `metres` (the floor of the basin a place lies in), the same reach rule.
function lowest(a, W, H, radius, metres) {
  const out = new Float32Array(W * H), tmp = new Float32Array(W * H);
  const rowM = Math.PI * radius / H, half = metres / 2;
  for (let j = 0; j < H; j++) {
    const lat = 90 - (j + 0.5) * 180 / H, colM = TWO_PI * radius * Math.max(Math.cos(lat * DEG), 1e-3) / W;
    const rx = Math.min(W >> 1, Math.max(1, Math.round(half / colM)));
    for (let i = 0; i < W; i++) {
      let m = Infinity;
      for (let k = -rx; k <= rx; k++) { const v = a[j * W + (((i + k) % W + W) % W)]; if (v < m) m = v; }
      tmp[j * W + i] = m;
    }
  }
  const ry = Math.max(1, Math.round(half / rowM));
  for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) {
    let m = Infinity;
    for (let k = -ry; k <= ry; k++) { const v = tmp[clamp(j + k, 0, H - 1) * W + i]; if (v < m) m = v; }
    out[j * W + i] = m;
  }
  return out;
}

// How far the nearest water is (m), 0 over water: two sweeps of a chamfer distance, wrapped in
// longitude, with each row's own width in metres.
function coastDistance(land, W, H, radius) {
  const d = new Float32Array(W * H).fill(Infinity), rowM = Math.PI * radius / H;
  const colM = new Float32Array(H);
  for (let j = 0; j < H; j++) { const lat = 90 - (j + 0.5) * 180 / H; colM[j] = TWO_PI * radius * Math.max(Math.cos(lat * DEG), 1e-3) / W; }
  for (let k = 0; k < W * H; k++) if (land[k] < 0.5) d[k] = 0;
  const pass = (j0, j1, dj) => {
    for (let j = j0; j !== j1; j += dj) {
      const dy = rowM, dx = colM[j], dd = Math.hypot(dx, dy);
      for (let p = 0; p < 2; p++) {
        const i0 = p ? W - 1 : 0, i1 = p ? -1 : W, di = p ? -1 : 1;
        for (let i = i0; i !== i1; i += di) {
          const k = j * W + i; let v = d[k];
          const jm = j - dj; if (jm >= 0 && jm < H) {
            const a = d[jm * W + i] + dy; if (a < v) v = a;
            const b = d[jm * W + (((i - di) % W + W) % W)] + dd; if (b < v) v = b;
            const c = d[jm * W + (((i + di) % W + W) % W)] + dd; if (c < v) v = c;
          }
          const e = d[j * W + (((i - di) % W + W) % W)] + dx; if (e < v) v = e;
          if (v < d[k]) d[k] = v;
        }
      }
    }
  };
  for (let r = 0; r < 2; r++) { pass(0, H, 1); pass(H - 1, -1, -1); }
  for (let k = 0; k < W * H; k++) if (!(d[k] < WX_LAND.COAST_MAX)) d[k] = WX_LAND.COAST_MAX;
  return d;
}

// Every local top of the elevation map standing PEAK_PROM or more over its country, PEAK_APART
// apart, highest first: { lat, lon, h, prom, ridge (degrees: the bearing its ridge runs along) }.
function findPeaks(dem, planes) {
  const { width: W, height: H, radius } = planes, dw = dem.width, dh = dem.height, sc = dem.scale || 1;
  const rowM = Math.PI * radius / dh, win = Math.max(2, Math.round(4500 / rowM));   // a top of its own 4.5 km
  const found = [];
  for (let j = win; j < dh - win; j++) {
    const lat = 90 - (j + 0.5) * 180 / dh, cl = Math.max(Math.cos(lat * DEG), 1e-3);
    const colM = TWO_PI * radius * cl / dw, wx = Math.min(dw >> 2, Math.max(2, Math.round(4500 / colM)));
    for (let i = 0; i < dw; i++) {
      const h = dem.data[j * dw + i] * sc;
      if (h < 600) continue;
      const u = (i + 0.5) / dw, v = (j + 0.5) / dh, c = sampleGrid(planes.hC, W, H, u, v);
      if (h - c < WX_LAND.PEAK_PROM) continue;
      let top = true;
      for (let b = -win; b <= win && top; b++) for (let a = -wx; a <= wx; a++) {
        const q = dem.data[(j + b) * dw + (((i + a) % dw + dw) % dw)] * sc;
        if (q > h || (q === h && (b < 0 || (b === 0 && a < 0)))) { top = false; break; }
      }
      if (top) found.push({ lat, lon: u * 360, h, prom: h - c, ridge: 0 });
    }
  }
  found.sort((a, b) => b.prom - a.prom);
  const out = [], spacer = new Spacer(radius, WX_LAND.PEAK_APART);
  for (const p of found) {
    const d = dirOf(p.lat, p.lon);
    if (!spacer.far(d, WX_LAND.PEAK_APART)) continue;
    spacer.add(d);
    p.ridge = ridgeOf(planes, p.lat, p.lon);
    out.push(p);
  }
  return out;
}

// The bearing (0..180 degrees, from north toward east) along which the ground falls away least
// 6 km off: the ridge through a summit.
function ridgeOf(planes, lat, lon) {
  const { width: W, height: H, radius } = planes;
  let best = -Infinity, bb = 0;
  for (let k = 0; k < 12; k++) {
    const b = k * 15 * DEG;
    let s = 0;
    for (const sign of [1, -1]) {
      const p = offsetLatLon(lat, lon, b + (sign < 0 ? Math.PI : 0), 6000, radius);
      s += sampleGrid(planes.hS, W, H, p.lon / 360, (90 - p.lat) / 180);
    }
    if (s > best) { best = s; bb = k * 15; }
  }
  return bb;
}

// Where the storm cells may be born: the proud high ground and the sea-breeze line.
// Each: { lat, lon, x, y, z (a unit direction), h, prom, kind } (kind: 0 high ground, 1 sea breeze).
export function makeSites(land) {
  const { width: W, height: H, radius } = land, out = [];
  // (the spacing tested through a lattice of buckets: with a thousand sites, every pair would
  // be hundreds of thousands of distances)
  const spacer = new Spacer(radius, Math.max(WX_LAND.SITE_APART, WX_LAND.SEA_SITE_APART));
  const far = (lat, lon, m) => spacer.far(dirOf(lat, lon), m);
  const put = (lat, lon, h, prom, kind) => {
    const d = dirOf(lat, lon);
    out.push({ lat, lon, x: d[0], y: d[1], z: d[2], h, prom, kind });
    spacer.add(d);
  };
  // the high ground: a local top of how proud it stands, SITE_APART apart (a fixed order)
  const proud = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) proud[k] = land.land[k] > 0.5 ? Math.max(0, land.hS[k] - land.hC[k]) : 0;
  const list = [];
  for (let j = 1; j < H - 1; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, p = proud[k];
    if (p < WX_LAND.SITE_PROM) continue;
    let top = true;
    for (let b = -1; b <= 1 && top; b++) for (let a = -1; a <= 1; a++) {
      if (!a && !b) continue;
      if (proud[(j + b) * W + (((i + a) % W + W) % W)] > p) { top = false; break; }
    }
    if (top) list.push([j, i, p]);
  }
  list.sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);
  for (const [j, i, p] of list) {
    const lat = 90 - (j + 0.5) * 180 / H, lon = (i + 0.5) * 360 / W;
    if (!far(lat, lon, WX_LAND.SITE_APART)) continue;
    put(lat, lon, land.g[j * W + i], p, 0);
  }
  // the sea-breeze line: so far inland, well apart
  const inlandList = [];
  for (let j = 1; j < H - 1; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (land.land[k] < 0.6) continue;
    const c = land.coast[k] * (land.coastStep || 1);
    if (Math.abs(c - WX_LAND.SEA_SITE_IN) > WX_LAND.SEA_SITE_BAND) continue;
    inlandList.push([j, i]);
  }
  for (const [j, i] of inlandList) {
    const lat = 90 - (j + 0.5) * 180 / H, lon = (i + 0.5) * 360 / W;
    if (!far(lat, lon, WX_LAND.SEA_SITE_APART)) continue;
    put(lat, lon, land.g[j * W + i], 0, 1);
  }
  return out;
}

// Keeping things a distance apart without measuring every pair: a lattice of buckets as wide as
// the greatest distance asked about, so only the nine buckets round a place are looked at. The
// test is on squared chords, so nothing trigonometric is worked out.
export class Spacer {
  constructor(radius, reach) {
    this.R = radius;
    this.cell = Math.max(reach, 1) / radius;            // radians a bucket
    this.rows = Math.max(1, Math.ceil(Math.PI / this.cell));
    this.map = new Map();
  }
  _key(d) {
    const lat = Math.asin(clamp(d[2], -1, 1)), lon = Math.atan2(d[1], d[0]);
    const j = Math.min(this.rows - 1, Math.max(0, Math.floor((lat + Math.PI / 2) / this.cell)));
    const cols = Math.max(1, Math.ceil(TWO_PI * Math.max(Math.cos(lat), 1e-3) / this.cell));
    const i = ((Math.floor((lon + Math.PI) / (TWO_PI / cols)) % cols) + cols) % cols;
    return [i, j, cols];
  }
  add(d) {
    const [i, j] = this._key(d), k = `${i},${j}`;
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(d[0], d[1], d[2]);
  }
  // nothing already added within `metres` of d
  far(d, metres) {
    const [i, j, cols] = this._key(d), lim = (2 * Math.sin(Math.min(Math.PI / 2, metres / (2 * this.R)))) ** 2;
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= this.rows) continue;
      for (let di = -2; di <= 2; di++) {
        const a = this.map.get(`${(((i + di) % cols) + cols) % cols},${jj}`);
        if (!a) continue;
        for (let n = 0; n < a.length; n += 3) {
          const dx = a[n] - d[0], dy = a[n + 1] - d[1], dz = a[n + 2] - d[2];
          if (dx * dx + dy * dy + dz * dz < lim) return false;
        }
      }
    }
    return true;
  }
}

// ---- the file ---------------------------------------------------------------------------------

// The planes as bytes (public/data/<world>_wxland_<W>.u8): a line of text, a newline, then the
// planes one after another. g, hC, hS and gmin as 16-bit metres; land and the coast a byte each
// (the coast in COAST_STEP steps). About 4.7 MB for 1 024 x 512.
export function packWxLand(planes) {
  const { width: W, height: H, radius, g, hC, hS, gmin, land, coast } = planes, N = W * H;
  const head = `wxland ${WX_LAND.VERSION} ${W} ${H} ${radius} ${WX_LAND.COAST_STEP}\n`;
  const bytes = new Uint8Array(head.length + N * (4 * 2 + 2));
  for (let i = 0; i < head.length; i++) bytes[i] = head.charCodeAt(i);
  const i16 = new Int16Array(N * 4);
  for (let k = 0; k < N; k++) {
    i16[k] = Math.round(clamp(g[k], -32000, 32000));
    i16[N + k] = Math.round(clamp(hC[k], -32000, 32000));
    i16[2 * N + k] = Math.round(clamp(hS[k], -32000, 32000));
    i16[3 * N + k] = Math.round(clamp(gmin[k], -32000, 32000));
  }
  bytes.set(new Uint8Array(i16.buffer, 0, N * 8), head.length);
  const o = head.length + N * 8;
  for (let k = 0; k < N; k++) {
    bytes[o + k] = Math.round(clamp(land[k], 0, 1) * 255);
    bytes[o + N + k] = Math.round(clamp(coast[k] / WX_LAND.COAST_STEP, 0, 255));
  }
  return bytes;
}

// ... and back (peaks: the list from <world>_peaks.json, or none).
export function readWxLand(bytes, peaks = null) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let nl = 0;
  while (nl < 200 && u8[nl] !== 10) nl++;
  const head = String.fromCharCode(...u8.subarray(0, nl)).split(' ');
  if (head[0] !== 'wxland' || +head[1] !== WX_LAND.VERSION) throw new Error(`wxland: not this format (${head.slice(0, 2).join(' ')})`);
  const W = +head[2], H = +head[3], radius = +head[4], coastStep = +head[5], N = W * H, o = nl + 1;
  if (u8.length < o + N * 10) throw new Error('wxland: the file is short');
  // (a copy of its own: the planes must be aligned for Int16Array, and the file's bytes may be a
  // view into a larger buffer - Node's Buffer.slice gives a view, not a copy, and read the wrong
  // plane for a whole delivery)
  const raw = new Uint8Array(N * 8);
  raw.set(u8.subarray(o, o + N * 8));
  const i16 = new Int16Array(raw.buffer);
  const g = new Float32Array(N), hC = new Float32Array(N), hS = new Float32Array(N), gmin = new Float32Array(N);
  for (let k = 0; k < N; k++) { g[k] = i16[k]; hC[k] = i16[N + k]; hS[k] = i16[2 * N + k]; gmin[k] = i16[3 * N + k]; }
  const land = new Float32Array(N), coast = new Float32Array(N), p = o + N * 8;
  for (let k = 0; k < N; k++) { land[k] = u8[p + k] / 255; coast[k] = u8[p + N + k] * coastStep; }
  return { version: WX_LAND.VERSION, width: W, height: H, radius, g, hC, hS, gmin, land, coast, coastStep: 1, peaks: peaks || [] };
}

// ---- places -----------------------------------------------------------------------------------

export const dirOf = (lat, lon, o = [0, 0, 0]) => { const a = lat * DEG, b = lon * DEG, c = Math.cos(a); o[0] = c * Math.cos(b); o[1] = c * Math.sin(b); o[2] = Math.sin(a); return o; };
export const latOf = (d) => Math.asin(clamp(d[2] / (Math.hypot(d[0], d[1], d[2]) || 1), -1, 1)) / DEG;
export const lonOf = (d) => { const l = Math.atan2(d[1], d[0]) / DEG; return l < 0 ? l + 360 : l; };
// the angle between two unit directions, exact for small ones
export const angleBetween = (a, b) => 2 * Math.asin(Math.min(1, 0.5 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])));
export function gcDist(lat0, lon0, lat1, lon1, radius) {
  const a = dirOf(lat0, lon0), b = dirOf(lat1, lon1);
  return angleBetween(a, b) * radius;
}
// a place `dist` m from (lat, lon) toward `bearing` (radians from north toward east)
export function offsetLatLon(lat, lon, bearing, dist, radius) {
  const la = lat * DEG, lo = lon * DEG, a = dist / radius;
  const la2 = Math.asin(clamp(Math.sin(la) * Math.cos(a) + Math.cos(la) * Math.sin(a) * Math.cos(bearing), -1, 1));
  const lo2 = lo + Math.atan2(Math.sin(bearing) * Math.sin(a) * Math.cos(la), Math.cos(a) - Math.sin(la) * Math.sin(la2));
  return { lat: la2 / DEG, lon: ((lo2 / DEG) % 360 + 360) % 360 };
}
// a unit direction `dist` m from the unit direction d toward `bearing`
export function offsetDir(d, bearing, dist, radius, o = [0, 0, 0]) {
  const p = offsetLatLon(latOf(d), lonOf(d), bearing, dist, radius);
  return dirOf(p.lat, p.lon, o);
}
