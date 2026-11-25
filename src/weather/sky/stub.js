// A test pattern for the sky, with the final producer API (docs/briefs/clouds-weather-plan.md,
// "STEP 0"): what the renderer, the shade map and the weather at the traveller are built and
// tested against until the model (sky/model.js) takes its place. It writes the snapshot of
// format.js and answers as the model will:
//   snapshot(t)       the whole sky at t (s since the weather epoch): maps A, B, C, the cells, the lenses
//   at(place, t, out) what a place has (format.js makeSkyAt): the bytes of the two snapshots round
//                     t, blended and filtered as the GPU does (format.js fieldAt), plus the cells
//   cells(t)          the cells alive at t, with where they are and how they live
//   strikes(t0, t1)   the lightning in [t0, t1), in time order; a window split in two gives the same
// Presets: 'fair' (heaps over the high ground in clusters, a little mid and high cloud, a
// marine deck, lenses by the nearest high ground), 'fog' (mist in every basin and patches of
// sea fog, fewer heaps), 'storm' (heavier heaps; storm cells born again and again at sites west
// of the opening place, drifting east past it, with anvils, wet trails, flashes and strokes),
// 'front' (a front crossing the opening place 6 h after the epoch: cirrus, then a veil, then
// a rain deck, wet ground behind).
//
// Everything is a function of (the preset, the time, the place): no Math.random, no state
// that a question changes, nothing about the traveller. Patterns move with the wind of their
// layer: a pattern is read at M_layer(t)^-1 . p. The motion is a parameter (opts.motion), so
// steer.js's steering can be put in; without it each layer turns rigidly about the spin axis
// (STUB_SPEED, m/s at the equator, toward the east). Pure: no three, no DOM.
//
// What is the stub's own, for the model to replace: the patterns, the cells' footprint
// (cellRainShare and friends below: a stand-in until cellShape.js), the ground wind, the
// temperature, the overcast and fog rules of at().
import {
  SNAP_STEP, fieldLayout, makeSnapshot, putA, putB, putC, fieldAt, footprint, uvOfLatLon, makeSkyAt,
  CELL, CELL_KIND, LENS, cellLife, makeCellLife,
} from './format.js';

export const STUB_PRESETS = Object.freeze(['fair', 'fog', 'storm', 'front']);
// m/s at the equator, toward the east, of each layer's rigid turning (the default motion)
export const STUB_SPEED = Object.freeze({ low: 7.5, mid: 18, high: 36, cell: 12.75 });

const DEG = Math.PI / 180;
const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---- hashes and noise (integer arithmetic: the same bytes on every machine) ----------------

const mix32 = (h) => { h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return (h ^ (h >>> 16)) >>> 0; };
const hashU = (a, b) => mix32((Math.imul(a | 0, 0x9e3779b1) ^ mix32(b | 0)) | 0);
const h01 = (a, b) => hashU(a, b) / 4294967296;
const lattice = (x, y, z, seed) => mix32((Math.imul(x, 0x8da6b343) + Math.imul(y, 0xd8163841) + Math.imul(z, 0xcb1ab31f) + seed) | 0) / 4294967296;
function vnoise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iy, iz, seed), b = lattice(ix + 1, iy, iz, seed), c = lattice(ix, iy + 1, iz, seed), d = lattice(ix + 1, iy + 1, iz, seed);
  const e = lattice(ix, iy, iz + 1, seed), f = lattice(ix + 1, iy, iz + 1, seed), g = lattice(ix, iy + 1, iz + 1, seed), h = lattice(ix + 1, iy + 1, iz + 1, seed);
  const ab = a + (b - a) * fx, cd = c + (d - c) * fx, ef = e + (f - e) * fx, gh = g + (h - g) * fx;
  const l0 = ab + (cd - ab) * fy, l1 = ef + (gh - ef) * fy;
  return l0 + (l1 - l0) * fz;
}

// ---- the default motion: each layer a rigid turning about the spin axis ----------------------

// motion(layer, t, out) -> M, row-major 3 x 3: a pattern's point q is at M . q at time t.
// layer: 'low', 'mid', 'high', 'cell' or 'still' (the identity).
export function stubMotion(radius) {
  return function motion(layer, t, out = new Float64Array(9)) {
    const w = layer === 'still' ? 0 : (STUB_SPEED[layer] || 0) / radius, a = w * t, c = Math.cos(a), s = Math.sin(a);
    out[0] = c; out[1] = -s; out[2] = 0; out[3] = s; out[4] = c; out[5] = 0; out[6] = 0; out[7] = 0; out[8] = 1;
    return out;
  };
}
const mulT = (M, x, y, z, o) => { o[0] = M[0] * x + M[3] * y + M[6] * z; o[1] = M[1] * x + M[4] * y + M[7] * z; o[2] = M[2] * x + M[5] * y + M[8] * z; return o; };
const mul = (M, x, y, z, o) => { o[0] = M[0] * x + M[1] * y + M[2] * z; o[1] = M[3] * x + M[4] * y + M[5] * z; o[2] = M[6] * x + M[7] * y + M[8] * z; return o; };

// ---- places ---------------------------------------------------------------------------------

const dirOf = (lat, lon, o = [0, 0, 0]) => { const a = lat * DEG, b = lon * DEG, c = Math.cos(a); o[0] = c * Math.cos(b); o[1] = c * Math.sin(b); o[2] = Math.sin(a); return o; };
const latOf = (d) => Math.asin(clamp(d[2], -1, 1)) / DEG;
const lonOf = (d) => { const l = Math.atan2(d[1], d[0]) / DEG; return l < 0 ? l + 360 : l; };
// the angle between two unit directions (exact for small ones too)
const angle = (ax, ay, az, bx, by, bz) => 2 * Math.asin(Math.min(1, 0.5 * Math.hypot(ax - bx, ay - by, az - bz)));
// a unit direction `dist` m from d toward `bearing` (radians from north toward east)
function offsetDir(d, bearing, dist, radius, o = [0, 0, 0]) {
  const lat = Math.asin(clamp(d[2], -1, 1)), lon = Math.atan2(d[1], d[0]), a = dist / radius;
  const la2 = Math.asin(Math.sin(lat) * Math.cos(a) + Math.cos(lat) * Math.sin(a) * Math.cos(bearing));
  const lo2 = lon + Math.atan2(Math.sin(bearing) * Math.sin(a) * Math.cos(lat), Math.cos(a) - Math.sin(lat) * Math.sin(la2));
  return dirOf(la2 / DEG, lo2 / DEG, o);
}
// east and north components of a vector v at the unit direction d
function enOf(d, v, o) {
  const ex = -d[1], ey = d[0], el = Math.hypot(ex, ey) || 1;
  const e = (v[0] * ex + v[1] * ey) / el;
  const nx = -d[2] * ex / el, ny = -d[2] * ey / el, nz = el;      // up x east
  o[0] = e; o[1] = v[0] * nx + v[1] * ny + v[2] * nz; return o;
}

// ---- the land, from an elevation map of the whole world (optional) ---------------------------

// land: { data: Int16Array, width, height, scale? } laid out as the field (row 0 at latitude
// 90, column 0 at longitude 0), e.g. Haven's haven_dem_4096.i16. Without it the world is level
// land at sea level. Returns grids at the small map's size (C) and at the field's (A, B):
// g the mean ground (m, the sea at 0), hC the country height (g smoothed over about 13 km),
// gmin the lowest g round (the floor of a basin), lf the share of land.
function makeLand(land, layout, radius) {
  const { width: W, height: H, cWidth: cw, cHeight: ch } = layout, n = cw * ch;
  const g = new Float32Array(n), lf = new Float32Array(n).fill(1);
  if (land) {
    const { data, width: dw, height: dh } = land, sc = land.scale || 1;
    if (data.length !== dw * dh) throw new Error('sky stub: the land map is not width x height');
    const sum = new Float64Array(n), cnt = new Float64Array(n), wet = new Float64Array(n);
    for (let j = 0; j < dh; j++) {
      const r = Math.min(ch - 1, Math.floor(j * ch / dh)) * cw;
      for (let i = 0; i < dw; i++) {
        const k = r + Math.min(cw - 1, Math.floor(i * cw / dw)), v = data[j * dw + i] * sc;
        sum[k] += v > 0 ? v : 0; cnt[k]++; if (v <= 0) wet[k]++;
      }
    }
    for (let k = 0; k < n; k++) { g[k] = sum[k] / cnt[k]; lf[k] = 1 - wet[k] / cnt[k]; }
  }
  // the country: a box mean about 13 km across (wider in cells toward the poles), wrapped in longitude
  const cellM = 2 * Math.PI * radius / cw, rad = Math.max(1, Math.round(6500 / cellM));
  const hC = new Float32Array(n), gmin = new Float32Array(n), tmp = new Float32Array(n), tmin = new Float32Array(n);
  for (let j = 0; j < ch; j++) {
    const lat = 90 - (j + 0.5) * 180 / ch, rx = Math.min(cw >> 2, Math.round(rad / Math.max(Math.cos(lat * DEG), 0.05)));
    for (let i = 0; i < cw; i++) {
      let s = 0, m = Infinity;
      for (let k = -rx; k <= rx; k++) { const v = g[j * cw + (((i + k) % cw) + cw) % cw]; s += v; if (v < m) m = v; }
      tmp[j * cw + i] = s / (2 * rx + 1); tmin[j * cw + i] = m;
    }
  }
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    let s = 0, m = Infinity, c = 0;
    for (let k = -rad; k <= rad; k++) { const jj = clamp(j + k, 0, ch - 1); s += tmp[jj * cw + i]; c++; if (tmin[jj * cw + i] < m) m = tmin[jj * cw + i]; }
    hC[j * cw + i] = s / c; gmin[j * cw + i] = m;
  }
  // ... and the same at the field's texels (filtered from the small grids, as a GPU would)
  const N = W * H, gA = new Float32Array(N), hA = new Float32Array(N), lA = new Float32Array(N);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W, v = (j + 0.5) / H, k = j * W + i;
    gA[k] = bilinear(g, cw, ch, u, v); hA[k] = bilinear(hC, cw, ch, u, v); lA[k] = bilinear(lf, cw, ch, u, v);
  }
  return { g, hC, gmin, lf, gA, hA, lA, cw, ch };
}
function bilinear(a, w, h, u, v) {
  const x = u * w - 0.5, y = v * h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const i0 = ((x0 % w) + w) % w, i1 = (i0 + 1) % w, j0 = clamp(y0, 0, h - 1), j1 = clamp(y0 + 1, 0, h - 1);
  return (a[j0 * w + i0] * (1 - fx) + a[j0 * w + i1] * fx) * (1 - fy) + (a[j1 * w + i0] * (1 - fx) + a[j1 * w + i1] * fx) * fy;
}

// ---- the cells' footprint (a stand-in until cellShape.js) ---------------------------------

// share of the core's rain at d m from the centre
const cellRainShare = (d, life) => 1 - sstep((d - 0.7 * life.core) / (0.45 * life.core + 1));
// the darkness overhead at d m
const cellDark = (d, life) => life.strength * (1 - sstep((d - 0.9 * life.radius) / (0.9 * life.radius + 1)));

// ---- the stub -------------------------------------------------------------------------------

// opts: { preset, world (its radius, scene.start and weather.field), radius, origin {lat, lon}
// (where the patterns are laid: the world's opening place), land (see makeLand), motion
// (see stubMotion), hourAtEpoch (local solar hour at the origin at t = 0; 8 by default, as
// Haven's opening morning), dayHours, stormAt {lat, lon} (a mature cell that stands still there
// for ever: debug=storm) }
export function createSkyStub(opts = {}) {
  const world = opts.world || null;
  const preset = opts.preset || 'fair';
  if (!STUB_PRESETS.includes(preset)) throw new Error(`sky stub: no preset '${preset}' (${STUB_PRESETS.join(', ')})`);
  const R = opts.radius || (world && world.radius) || 250000;
  const layout = opts.layout || fieldLayout(world);
  const start = (world && world.scene && world.scene.start) || { lat: 0, lon: 0 };
  const origin = { lat: (opts.origin || start).lat, lon: (opts.origin || start).lon };
  const O = dirOf(origin.lat, origin.lon);
  const motion = opts.motion || stubMotion(R);
  const hourAtEpoch = opts.hourAtEpoch ?? 8, dayHours = opts.dayHours || (world && world.dayHours) || 24;
  const land = makeLand(opts.land || null, layout, R);
  const P = {
    fair: { heap: 1.0, marine: 0.6, mid: 0.3, high: 0.45, dayMin: 0.4 },
    fog: { heap: 0.5, marine: 0.4, mid: 0.15, high: 0.3, dayMin: 0.4 },
    storm: { heap: 1.3, marine: 0.3, mid: 0.35, high: 0.4, dayMin: 0.75 },
    front: { heap: 0.9, marine: 0.3, mid: 0.2, high: 0.3, dayMin: 0.5 },
  }[preset];
  const M9 = () => new Float64Array(9);

  // where the land is at a place (the stub's own grids)
  const uvT = [0, 0];
  const landAt = (lat, lon) => { uvOfLatLon(lat, lon, uvT); return { g: bilinear(land.g, land.cw, land.ch, uvT[0], uvT[1]), hC: bilinear(land.hC, land.cw, land.ch, uvT[0], uvT[1]), lf: bilinear(land.lf, land.cw, land.ch, uvT[0], uvT[1]) }; };
  // the low cloud's base where no sheet lowers it (as the field writes it)
  const baseOf = (g, hC, sheet) => Math.max(hC + 1250 - 650 * sheet, g + 500);
  const hourAt = (lon, t) => { let h = hourAtEpoch + t * 24 / (dayHours * 3600) + (lon - origin.lon) / 15; h %= 24; return h < 0 ? h + 24 : h; };
  const dayOf = (h) => sstep((h - 8.5) / 3) * (1 - sstep((h - 17.5) / 2.5));

  // ---- the cells: sites west of the origin, each giving birth again and again ---------------
  const sites = [];
  if (preset === 'storm') {
    // [bearing from the origin (deg), km, minutes between births, offset (min)]
    // (each near site gives birth every 50 min, a third of that after the one before: a cell is
    // mature for at least 25 of every 50 min, so one of the three always is. A cell lives at most
    // 90 min, so each site has at most two alive: never more than 8 cells near the origin.)
    for (const [b, km, every, off] of [[250, 30, 50, 0], [290, 45, 50, 50 / 3], [205, 40, 50, 100 / 3], [40, 140, 100, 13]]) {
      sites.push({ dir: offsetDir(O, b * DEG, km * 1000, R), every: every * 60, off: off * 60, kind: CELL_KIND.HIGH_GROUND });
    }
  }
  const still = opts.stormAt ? dirOf(opts.stormAt.lat, opts.stormAt.lon) : null;
  const GROW = 1200, MATURE_MAX = 2400, DECAY = 1800, LIFE_MAX = GROW + MATURE_MAX + DECAY;
  // the records of every cell alive at some time in [ta, tb], in a fixed order
  function records(ta, tb) {
    const out = [];
    sites.forEach((s, si) => {
      const k0 = Math.floor((ta - LIFE_MAX - s.off) / s.every), k1 = Math.floor((tb - s.off) / s.every);
      for (let k = k0; k <= k1; k++) {
        const born = s.off + k * s.every, seed = hashU(si + 101, k);
        const mature = 1500 + 900 * h01(seed, 3);
        if (born > tb || born + GROW + mature + DECAY <= ta) continue;
        const b = offsetDir(s.dir, (60 + 60 * h01(seed, 6)) * DEG, 2000 + 3000 * h01(seed, 7), R);     // born 2-5 km east of its site
        out.push((si + 1) * 1048576 + (((k % 1048576) + 1048576) % 1048576), seed, born, b[0], b[1], b[2],
          2500 + 2500 * h01(seed, 1), 6500 + 4500 * h01(seed, 2), GROW, mature, DECAY,
          15 + 30 * h01(seed, 4), 0.6, 2 + 10 * h01(seed, 5), si, s.kind);
      }
    });
    if (still) out.push(999999, 0x5eed, -1e9, still[0], still[1], still[2], 4000, 10000, 60, 4e9, 60, 35, 0.6, 8, -1, CELL_KIND.STILL);
    return Float64Array.from(out);
  }
  // where a cell is at t
  const mA = M9(), mB = M9(), qT = [0, 0, 0];
  function cellAt(rec, o, t, out = [0, 0, 0]) {
    if (rec[o + CELL.KIND] === CELL_KIND.STILL) { out[0] = rec[o + CELL.X]; out[1] = rec[o + CELL.Y]; out[2] = rec[o + CELL.Z]; return out; }
    motion('cell', rec[o + CELL.BORN], mA); motion('cell', t, mB);
    mulT(mA, rec[o + CELL.X], rec[o + CELL.Y], rec[o + CELL.Z], qT);
    return mul(mB, qT[0], qT[1], qT[2], out);
  }
  // the live cells at t, with their state (cached for the last t asked: a pure function of t)
  let liveT = NaN, live = [];
  function liveCells(t) {
    if (t === liveT) return live;
    const rec = records(t, t), list = [];
    for (let o = 0; o < rec.length; o += CELL.STRIDE) {
      const life = cellLife(rec, o, t, makeCellLife());
      if (!life.alive) continue;
      const d = cellAt(rec, o, t), L = landAt(latOf(d), lonOf(d)), base = baseOf(L.g, L.hC, 0);
      list.push({
        id: rec[o + CELL.ID], seed: rec[o + CELL.SEED], born: rec[o + CELL.BORN], site: rec[o + CELL.SITE], kind: rec[o + CELL.KIND],
        x: d[0], y: d[1], z: d[2], lat: latOf(d), lon: lonOf(d), age: life.age, phase: life.phase, stage: life.stage, strength: life.strength,
        rise: life.rise, radius: life.radius, core: life.core, rain: life.rain, rainPeak: rec[o + CELL.RAIN], flash: life.flash, end: life.end,
        base, topMax: rec[o + CELL.TOP], top: base + life.rise * (rec[o + CELL.TOP] - base), life,
      });
    }
    liveT = t; live = list; return list;
  }
  // the cells alive at t: the API's copy (plain objects, without the internal life record)
  function cells(t) { return liveCells(t).map(({ life, ...c }) => ({ ...c })); }

  // ---- lightning --------------------------------------------------------------------------
  const SLOT = 0.7, GROUND = 0.33;
  function strikes(t0, t1) {
    if (t1 < t0) [t0, t1] = [t1, t0];
    const rec = records(t0, t1), out = [], life = makeCellLife(), at = [0, 0, 0], foot = [0, 0, 0];
    for (let o = 0; o < rec.length; o += CELL.STRIDE) {
      const born = rec[o + CELL.BORN], m0 = born + rec[o + CELL.GROW], m1 = m0 + rec[o + CELL.MATURE];
      const a = Math.max(t0, m0), b = Math.min(t1, m1);
      if (a >= b) continue;
      const seed = rec[o + CELL.SEED] >>> 0, chance = rec[o + CELL.FLASH] / 60 * SLOT;
      for (let k = Math.floor(a / SLOT) - 1, k1 = Math.floor(b / SLOT); k <= k1; k++) {
        const hs = hashU(seed, k);
        if (hs / 4294967296 >= chance) continue;
        const t = (k + h01(hs, 1)) * SLOT;
        if (t < t0 || t >= t1 || t < m0 || t >= m1) continue;
        cellLife(rec, o, t, life); cellAt(rec, o, t, at);
        const ground = h01(hs, 2) < GROUND, r = (ground ? life.core : 0.6 * life.radius) * Math.sqrt(h01(hs, 3));
        offsetDir(at, 2 * Math.PI * h01(hs, 4), r, R, foot);
        const L = landAt(latOf(foot), lonOf(foot)), base = baseOf(L.g, L.hC, 0);
        let h0, h1;
        if (ground) { h0 = L.g; h1 = base; } else { h0 = h1 = (0.4 + 0.4 * h01(hs, 5)) * (base + life.rise * (rec[o + CELL.TOP] - base)); }
        out.push({ t, cell: rec[o + CELL.ID], ground, x: foot[0], y: foot[1], z: foot[2], h0, h1, power: 0.6 + 0.8 * h01(hs, 6), seed: hashU(hs, 7) });
      }
    }
    return out.sort((p, q) => p.t - q.t || p.cell - q.cell);
  }

  // ---- the lenses ('fair': over the nearest high ground, across the mid wind) --------------
  function lenses(t) {
    if (preset !== 'fair') return new Float64Array(0);
    // the highest cell of the small map within 80 km of the origin
    let best = -1, bg = -Infinity; const d = [0, 0, 0];
    for (let j = 0; j < land.ch; j++) for (let i = 0; i < land.cw; i++) {
      dirOf(90 - (j + 0.5) * 180 / land.ch, (i + 0.5) * 360 / land.cw, d);
      if (angle(d[0], d[1], d[2], O[0], O[1], O[2]) * R > 80000) continue;
      if (land.g[j * land.cw + i] > bg) { bg = land.g[j * land.cw + i]; best = j * land.cw + i; }
    }
    if (best < 0) return new Float64Array(0);
    const top = dirOf(90 - (Math.floor(best / land.cw) + 0.5) * 180 / land.ch, (best % land.cw + 0.5) * 360 / land.cw);
    const v = windOf('mid', top, t, [0, 0, 0]), en = enOf(top, v, [0, 0]), heading = Math.atan2(en[0], en[1]);
    const out = [];
    for (let k = 0; k < 2; k++) {
      const c = offsetDir(top, heading, 6000 + 7000 * k, R);
      out.push(k + 1, c[0], c[1], c[2], bg + 1500 + 300 * k, 7000 - 1500 * k, 2600 - 500 * k, heading, 2 - k, 1);
    }
    return Float64Array.from(out);
  }
  // the velocity (planet axes, m/s) of a layer's motion at the unit direction d
  const wA = M9(), wB = M9(), wC = M9(), wq = [0, 0, 0], w1 = [0, 0, 0], w2 = [0, 0, 0];
  function windOf(layer, d, t, out) {
    motion(layer, t, wA); motion(layer, t + 1, wB); motion(layer, t - 1, wC);
    mulT(wA, d[0] * R, d[1] * R, d[2] * R, wq); mul(wB, wq[0], wq[1], wq[2], w1); mul(wC, wq[0], wq[1], wq[2], w2);
    out[0] = (w1[0] - w2[0]) / 2; out[1] = (w1[1] - w2[1]) / 2; out[2] = (w1[2] - w2[2]) / 2; return out;
  }

  // ---- the snapshot -------------------------------------------------------------------------
  // what does not change across a snapshot's texels
  function context(t) {
    const c = { t, mL: motion('low', t, M9()), mM: motion('mid', t, M9()), mH: motion('high', t, M9()), anvils: [], tracks: [], front: null };
    // anvils: of every cell alive, or dead under 40 min, carried downwind by the high wind
    const rec = records(t - 2400, t), life = makeCellLife(), at = [0, 0, 0];
    for (let o = 0; o < rec.length; o += CELL.STRIDE) {
      const age = t - rec[o + CELL.BORN], end = rec[o + CELL.BORN] + rec[o + CELL.GROW] + rec[o + CELL.MATURE] + rec[o + CELL.DECAY];
      const a = sstep((age - 0.7 * rec[o + CELL.GROW]) / (0.3 * rec[o + CELL.GROW] + 1)) * (1 - sstep((t - end) / 2400));
      if (a <= 0) continue;
      cellAt(rec, o, Math.min(t, end), at);
      const carry = Math.min(age, 1800) * 0.5, mH0 = motion('high', t - carry, M9());
      const q = mulT(mH0, at[0], at[1], at[2], [0, 0, 0]), d = mul(c.mH, q[0], q[1], q[2], [0, 0, 0]);
      const r = 4000 + 6000 * sstep(age / (rec[o + CELL.GROW] + rec[o + CELL.MATURE]));
      c.anvils.push({ x: d[0], y: d[1], z: d[2], r, a: 0.92 * a, cos: Math.cos(r * 1.05 / R) });
    }
    // wet trails: the cells' rain over the last 4 h, every 10 min, fading over 3 h
    const past = records(t - 4 * 3600, t);
    for (let o = 0; o < past.length; o += CELL.STRIDE) {
      const born = past[o + CELL.BORN], s = [], ctr = [0, 0, 0];
      for (let tau = Math.ceil(Math.max(born, t - 4 * 3600) / 600) * 600; tau <= t; tau += 600) {
        cellLife(past, o, tau, life);
        if (!life.alive || life.rain <= 0) continue;
        cellAt(past, o, tau, at);
        s.push(at[0], at[1], at[2], life.core, life.rain * (600 / 3600) * Math.exp(-(t - tau) / (3 * 3600)));
        ctr[0] += at[0]; ctr[1] += at[1]; ctr[2] += at[2];
      }
      if (!s.length) continue;
      const cl = Math.hypot(ctr[0], ctr[1], ctr[2]); ctr[0] /= cl; ctr[1] /= cl; ctr[2] /= cl;
      let reach = 0;
      for (let k = 0; k < s.length; k += 5) reach = Math.max(reach, angle(s[k], s[k + 1], s[k + 2], ctr[0], ctr[1], ctr[2]) + 1.3 * s[k + 3] / R);
      c.tracks.push({ x: ctr[0], y: ctr[1], z: ctr[2], cos: Math.cos(reach + 1e-4), s: Float64Array.from(s) });
    }
    // the front: a great circle fixed in the mid layer's pattern, through the origin at 6 h
    if (preset === 'front') {
      const q = mulT(motion('mid', 6 * 3600, M9()), O[0], O[1], O[2], [0, 0, 0]), l = Math.atan2(q[1], q[0]);
      c.front = { nx: -Math.sin(l), ny: Math.cos(l), sx: Math.cos(l), sy: Math.sin(l) };
    }
    return c;
  }

  // One texel of A and B, and one of C: the only writers of the bytes. snapshot() runs them
  // over every texel; at() over the few it reads (so a question costs microseconds, and its
  // answer is the snapshot's bytes exactly).
  const K22 = R / 22000, K7 = R / 7000, K30 = R / 30000, K15 = R / 15000, K50 = R / 50000, K5 = R / 5000, K40 = R / 40000;
  const { width: W, height: H, cWidth: CW, cHeight: CH } = layout;
  const rows = (n) => { const c = new Float64Array(n), s = new Float64Array(n); for (let j = 0; j < n; j++) { const l = (90 - (j + 0.5) * 180 / n) * DEG; c[j] = Math.cos(l); s[j] = Math.sin(l); } return { c, s }; };
  const cols = (n) => { const c = new Float64Array(n), s = new Float64Array(n); for (let i = 0; i < n; i++) { const l = (i + 0.5) * 2 * Math.PI / n; c[i] = Math.cos(l); s[i] = Math.sin(l); } return { c, s }; };
  const rowAB = rows(H), colAB = cols(W), rowC = rows(CH), colC = cols(CW);
  function texelAB(c, i, j, A, B) {
    const { mL, mM, mH, anvils, tracks, front } = c;
    const k = j * W + i, cp = rowAB.c[j], px = cp * colAB.c[i], py = cp * colAB.s[i], pz = rowAB.s[j];
    const g = land.gA[k], hc = land.hA[k], lf = land.lA[k];
    // the low layer's pattern: heaps in clusters, more over high ground, by day
    const lx = mL[0] * px + mL[3] * py + mL[6] * pz, ly = mL[1] * px + mL[4] * py + mL[7] * pz, lz = mL[2] * px + mL[5] * py + mL[8] * pz;
    const cl = 0.65 * vnoise(lx * K22, ly * K22, lz * K22, 11) + 0.35 * vnoise(lx * K7, ly * K7, lz * K7, 12);
    const elev = lf * (0.3 + 0.7 * sstep((g - 400) / 1800)) + (1 - lf) * 0.12;
    let heap = sstep((cl - 0.42) / 0.36) * elev * c.dayC[i] * P.heap;
    let sheet = 0, thick = 0, rain = 0, wet = 0;
    if (lf < 0.5) { const n = vnoise(lx * K30, ly * K30, lz * K30, 13); sheet = (1 - 2 * lf) * P.marine * sstep((n - 0.5) / 0.3); thick = 500 + 400 * n; }
    // mid patches and high streaks (long along the wind, the east)
    const mx = mM[0] * px + mM[3] * py + mM[6] * pz, my = mM[1] * px + mM[4] * py + mM[7] * pz, mz = mM[2] * px + mM[5] * py + mM[8] * pz;
    let mid = P.mid * sstep((vnoise(mx * K15, my * K15, mz * K15, 21) - 0.55) / 0.3);
    const hx = mH[0] * px + mH[3] * py + mH[6] * pz, hy = mH[1] * px + mH[4] * py + mH[7] * pz, hz = mH[2] * px + mH[5] * py + mH[8] * pz;
    let high = P.high * sstep((vnoise(hx * K50, hy * K50, hz * K5, 31) - 0.55) / 0.35);
    if (front) {
      const side = mx * front.sx + my * front.sy, latq = Math.abs(Math.asin(clamp(mz, -1, 1))) / DEG;
      const mask = side > 0 ? sstep((latq - 18) / 10) * (1 - sstep((latq - 68) / 10)) : 0;
      if (mask > 0) {
        const d = Math.asin(clamp(mx * front.nx + my * front.ny, -1, 1)) * R / 1000;     // km ahead of the front
        const ns = (1 - sstep((d - 12) / 16)) * sstep((d + 45) / 20) * mask;
        high = Math.max(high, 0.8 * mask * (1 - sstep((d - 90) / 40)) * sstep((d + 40) / 40));
        mid = Math.max(mid, 0.9 * mask * (1 - sstep((d - 30) / 25)) * sstep((d + 50) / 30));
        if (ns > sheet) { sheet = ns; thick = 600 + 4000 * ns; }
        rain = (1 + 5 * ns) * sstep((ns - 0.25) / 0.2);
        wet = 0.9 * mask * Math.max(sstep((ns - 0.2) / 0.3), d < -30 ? Math.exp((d + 30) / 130) : 0);
        heap *= 1 - 0.8 * mask * sstep(d / 60) + 0.25 * mask * sstep((-d - 50) / 30);
      }
    }
    for (let a = 0; a < anvils.length; a++) {
      const v = anvils[a];
      if (px * v.x + py * v.y + pz * v.z < v.cos) continue;
      const d = angle(px, py, pz, v.x, v.y, v.z) * R;
      high = Math.max(high, v.a * (1 - sstep((d - 0.6 * v.r) / (0.4 * v.r))));
    }
    if (tracks.length) {
      let water = 0;
      for (let n = 0; n < tracks.length; n++) {
        const tr = tracks[n];
        if (px * tr.x + py * tr.y + pz * tr.z < tr.cos) continue;
        const ts = tr.s;
        for (let q = 0; q < ts.length; q += 5) {
          const d = angle(px, py, pz, ts[q], ts[q + 1], ts[q + 2]) * R, core = ts[q + 3];
          if (d < 1.2 * core) water += ts[q + 4] * (1 - sstep((d - 0.7 * core) / (0.45 * core + 1)));
        }
      }
      wet = Math.max(wet, 1 - Math.exp(-water / 1.5));
    }
    putA(A, k, heap, sheet, baseOf(g, hc, sheet), thick);
    putB(B, k, mid, high, rain, wet);
  }
  // the small map: the fog's top and the country
  function texelC(c, i, j, C) {
    const k = j * CW + i, hc = land.hC[k];
    let top = 0;
    if (preset === 'fog') {
      const floor = land.gmin[k], depth = hc - floor, lf = land.lf[k];
      if (lf > 0.5 && depth > 80) top = floor + clamp(0.4 * depth, 60, 400) * sstep((depth - 80) / 120);
      if (lf < 0.5) {
        const mL = c.mL, cp = rowC.c[j], px = cp * colC.c[i], py = cp * colC.s[i], pz = rowC.s[j];
        const lx = mL[0] * px + mL[3] * py + mL[6] * pz, ly = mL[1] * px + mL[4] * py + mL[7] * pz, lz = mL[2] * px + mL[5] * py + mL[8] * pz;
        const n = vnoise(lx * K40, ly * K40, lz * K40, 41);
        if (n > 0.62) top = Math.max(top, (180 + 80 * n) * sstep((n - 0.62) / 0.06));
      }
    }
    putC(C, k, top, hc);
  }
  // what the texels of one time share: the motions, the day by column, anvils, wet trails, the front
  function texelContext(t) {
    const c = context(t);
    c.dayC = new Float64Array(W);
    for (let i = 0; i < W; i++) c.dayC[i] = P.dayMin + (1 - P.dayMin) * dayOf(hourAt((i + 0.5) * 360 / W, t));
    return c;
  }
  function snapshot(t) {
    const s = makeSnapshot(layout, t), c = texelContext(t);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) texelAB(c, i, j, s.A, s.B);
    for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) texelC(c, i, j, s.C);
    s.cells = records(t - SNAP_STEP, t + SNAP_STEP);
    s.lenses = lenses(t);
    return s;
  }

  // ---- at(): the bytes round t, and the cells ------------------------------------------------
  // The snapshots at() decodes, made texel by texel as it reads them (the same bytes as
  // snapshot(t)'s; never handed out). The last four times are kept.
  const cache = new Map(), fp = new Float64Array(6);
  function snapAt(tk) {
    let e = cache.get(tk);
    if (!e) {
      e = { s: makeSnapshot(layout, tk), c: texelContext(tk), ab: new Uint8Array(W * H), cc: new Uint8Array(CW * CH) };
      cache.set(tk, e); if (cache.size > 4) cache.delete(cache.keys().next().value);
    }
    return e;
  }
  // make sure the texels a read at uv takes (format.js footprint, as sampleMap does) are made
  function fill(e, u, v) {
    footprint(W, H, u, v, fp);
    for (let a = 2; a < 4; a++) for (let b = 0; b < 2; b++) { const i = fp[b], j = fp[a]; if (!e.ab[j * W + i]) { texelAB(e.c, i, j, e.s.A, e.s.B); e.ab[j * W + i] = 1; } }
    footprint(CW, CH, u, v, fp);
    for (let a = 2; a < 4; a++) for (let b = 0; b < 2; b++) { const i = fp[b], j = fp[a]; if (!e.cc[j * CW + i]) { texelC(e.c, i, j, e.s.C); e.cc[j * CW + i] = 1; } }
    return e.s;
  }
  const pl = { lat: 0, lon: 0, h: 0, hasH: false }, pd = [0, 0, 0], uv = [0, 0], vw = [0, 0, 0], en = [0, 0];
  function at(place, t, out = makeSkyAt()) {
    if (Array.isArray(place) || ArrayBuffer.isView(place)) {
      const r = Math.hypot(place[0], place[1], place[2]);
      pd[0] = place[0] / r; pd[1] = place[1] / r; pd[2] = place[2] / r;
      pl.lat = latOf(pd); pl.lon = lonOf(pd); pl.h = r - R; pl.hasH = true;
    } else {
      pl.lat = place.lat; pl.lon = place.lon; pl.hasH = place.h != null; pl.h = place.h ?? 0;
      dirOf(pl.lat, pl.lon, pd);
    }
    const k = Math.floor(t / SNAP_STEP), tk = k * SNAP_STEP, f = (t - tk) / SNAP_STEP;
    uvOfLatLon(pl.lat, pl.lon, uv);
    const F = fieldAt(fill(snapAt(tk), uv[0], uv[1]), f > 0 ? fill(snapAt(tk + SNAP_STEP), uv[0], uv[1]) : null, f, uv[0], uv[1], out.field);
    const L = landAt(pl.lat, pl.lon), h = pl.hasH ? pl.h : Math.max(L.g, 0);
    // the cells overhead and round
    let storm = 0, cellRain = 0, top = F.base + Math.max(F.sheet > 0.05 ? F.thick : 0, F.heap > 0.05 ? 600 + 2400 * F.heap : 0), cell = -1, ge = 0, gn = 0;
    for (const c of liveCells(t)) {
      const d = angle(pd[0], pd[1], pd[2], c.x, c.y, c.z) * R;
      if (d > c.radius * 2 + 12000) continue;
      const dark = cellDark(d, c.life), wet = c.rain * cellRainShare(d, c.life);
      if (dark > storm) storm = dark;
      if (wet > cellRain) cellRain = wet;
      if (d < c.radius) top = Math.max(top, c.top);
      if (d < c.radius || wet > 0) cell = c.id;
      // the gust front: outward, a few km ahead of the rain
      if (c.rain > 1) {
        const amp = (6 + 9 * h01(c.seed, 9)) * c.strength * sstep((d - 0.8 * c.core) / 1500) * (1 - sstep((d - c.core - 3000) / 6000));
        if (amp > 0 && d > 1) {
          const k2 = pd[0] * c.x + pd[1] * c.y + pd[2] * c.z;
          vw[0] = pd[0] * k2 - c.x; vw[1] = pd[1] * k2 - c.y; vw[2] = pd[2] * k2 - c.z;      // in the tangent plane, away from the centre
          const l = Math.hypot(vw[0], vw[1], vw[2]) || 1;
          vw[0] *= amp / l; vw[1] *= amp / l; vw[2] *= amp / l;
          enOf(pd, vw, en); ge += en[0]; gn += en[1];
        }
      }
    }
    // the ground wind: the low layer's, slowed and turned toward low pressure, gusting
    windOf('low', pd, t, vw); enOf(pd, vw, en);
    const turn = (pl.lat >= 0 ? 25 : -25) * DEG, ct = Math.cos(turn), st = Math.sin(turn);
    const expo = 0.6 * (0.8 + 0.4 * sstep((L.g - 500) / 2000)) * (1 + 0.6 * F.sheet);
    const mL = motion('low', t, wA); mulT(mL, pd[0], pd[1], pd[2], wq);
    const gust = 1 + 0.25 * (2 * vnoise(wq[0] * R / 2500 + t / 41, wq[1] * R / 2500 + t / 53, wq[2] * R / 2500 + t / 47, 51) - 1);
    out.windE = (en[0] * ct - en[1] * st) * expo * gust + ge; out.windN = (en[0] * st + en[1] * ct) * expo * gust + gn;
    out.wind = Math.hypot(out.windE, out.windN); out.gust = gust;
    // temperature (an equinox: no season term), falling 6.5 degrees a km, warmer by day over land
    const hr = hourAt(pl.lon, t), swing = L.lf * (4 * Math.cos((hr - 15) * Math.PI / 12) + 1) + (1 - L.lf) * 0.5 * Math.cos((hr - 15) * Math.PI / 12);
    out.temp = 27 - 0.42 * Math.max(0, Math.abs(pl.lat) - 12) - 6.5 * h / 1000 + swing;
    // rain falls below the base it comes from; as snow where it is cold
    const below = h < F.base ? 1 : 0, total = (F.rain + cellRain) * below, sn = clamp((1.5 - out.temp) / 3, 0, 1);
    out.rain = total * (1 - sn); out.snow = total * sn;
    out.storm = storm;
    out.overcast = 1 - (1 - 0.55 * F.heap) * (1 - 0.95 * F.sheet) * (1 - 0.5 * F.mid) * (1 - 0.2 * F.high) * (1 - storm);
    // fog below its top; cloud between the base and the top
    let fog = 0.0156 * sstep((F.fogTop - h) / 40);
    if (h > F.base && h < F.base + F.thick) fog = Math.max(fog, 0.02 * F.sheet);
    out.fog = fog; out.wet = F.wet; out.base = F.base; out.top = top; out.cell = cell;
    return out;
  }

  return { preset, layout, radius: R, origin, motion, snapshot, at, cells, strikes, records };
}

// The elevation map a stub reads, in Node (scripts): Haven's own, from public/data.
//   import { readFileSync } from 'node:fs'; createSkyStub({ world, land: landFromI16(readFileSync(path), 4096, 2048) })
export function landFromI16(buffer, width, height) {
  const bytes = buffer.byteOffset % 2 ? Uint8Array.from(buffer) : buffer;
  const data = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
  if (data.length !== width * height) throw new Error('sky stub: the land map is not width x height');
  return { data, width, height };
}
