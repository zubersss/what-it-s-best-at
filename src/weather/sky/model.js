// Haven's weather, made by rule (docs/briefs/clouds-weather-plan.md, "The weather model"): what
// decides each day's sky, where the cloud of each kind is, where and when it rains, which days
// are calm and which are gales, and where the storms stand. It writes the snapshots of
// format.js, which the GPU and the CPU both read, and answers at() for the traveller's place.
//
// The chain, for a place and a moment:
//   the land (land.js)          the country the cloud stands over, the hills that lift the air,
//                               the basins the fog lies in, the coast, the summits
//   the steering (steer.js)     each layer's wind, and the day's character (calm or a gale)
//   the systems (systems.js)    lows with their fronts, highs, tropical waves, carried by M_mid
//   moisture                    the latitude's climate x the day's x how far the sea is upwind
//                               x the dry lee of the ranges, with the systems' wet and dry air
//   heat and lift               the Sun two hours ago over proud high ground, the hills' slopes,
//                               the fronts' and the lows' lift
//   the kinds                   heaps (with caps, streets and the dry lee), sheets and their
//                               thickness, the base, the fog's top, the mid and high shields,
//                               the anvils of the live cells, the field's rain, the wet ground
//   the cells (cells.js)        born at trigger sites in the afternoon and along the fronts,
//                               with their rain, their anvils and their lightning (strikes.js)
//
// WHAT COSTS WHAT. A snapshot of 1 024 x 512 is half a million texels, so the work is split:
//   - the slow part of the weather (how far the sea is upwind, the highest ground upwind, the
//     systems' arcs) is worked out on a coarse grid, a quarter of the field's width, and read
//     from it bilinearly: COARSE_CH channels, each cell filled the first time it is asked for;
//   - the fast part (the land's own slope and prominence, the clusters' noise, the kinds, the
//     cells and anvils) is worked out at every texel;
//   - the wet ground's half-hour slots are kept on a grid of their own, coarser still.
// at() fills only the texels a read at its place takes, so a question costs microseconds and its
// answer is the snapshot's own bytes.
//
// Pure: no three, no DOM, no Math.random. Everything is a function of (the world's numbers, the
// clock, the place): nothing here knows where the traveller is, so nothing in the sky can move
// because the traveller moved.
import {
  SNAP_STEP, fieldLayout, makeSnapshot, putA, putB, putC, fieldAt, footprint, uvOfLatLon,
  makeSkyAt, CELL, CELL_KIND, cellLife, makeCellLife,
} from './format.js';
import { Steer, mulMT } from './steer.js';
import { WxLand, makeWxLand, dirOf, latOf, lonOf, angleBetween, offsetDir, sampleGrid } from './land.js';
import { SYSTEM_DEFAULTS, systemsAt, systemFieldAt, makeSystemField } from './systems.js';
import { CELL_DEFAULTS, cellRecords, cellPlace, cellsAlive, slotsFor } from './cells.js';
import { strikesIn } from './strikes.js';
import { cellGeometry, cellFootprint, cellRain, anvilLevel, anvilGeometry, anvilCover } from './cellShape.js';
import { hash3, noise3 } from '../../terrain/height/noise.js';

// The model's numbers. A world file may set any of them under its `weather` block.
export const MODEL_DEFAULTS = Object.freeze({
  moisture: Object.freeze({
    // the latitude's climate (as the rain map's: wet equator, dry belts, wet middle latitudes)
    eq: 0.25, eqWidth: 200, dry: 0.2, dryAt: 27, dryWidth: 90, wet: 0.12, wetAt: 50, wetWidth: 200, base: 0.72,
    day: 0.95, dayAmp: 0.22, dayHours: 70,       // the day's own: base + amp x a knot noise over so many hours
    fetchSteps: 10, fetchStep: 6000,            // how far upwind the sea is looked for (10 x 6 km)
    land: 0.6, landFetch: 300000,               // over land: land + (1 - land) exp(-fetch / landFetch)
    shadowOver: 600, shadow: 3000, lee: 0.5,    // the dry lee: ground upwind standing over the place by
    //                                            // shadowOver, then exp(-that / shadow) of the moisture is
    //                                            // left - but only where the wind sinks (lee: the lift at
    //                                            // which none of it is taken)
    sector: 0.15, dry2: 0.15, high: 0.12,       // what a warm sector, the air behind a cold front and a high do
    height: 0.4, heightAt: [400, 3000],        // the cold high ground holds its air nearer to saturation
  }),
  heat: Object.freeze({
    lag: 7200, sun: [5, 45], prom: [0.6, 0.9, 600], humPow: 1.5, gain: 1.8,
    behind: 0.3, tropic: 0.2, tropicAt: 14, high: 0.4, seaDay: 0.3, seaNight: 0.15, overcast: 0.8,
  }),
  temperature: Object.freeze({ eq: 27, latK: 0.42, latFrom: 12, season: 8, seasonLat: 45, lapse: 6.5, swingLand: [5, 3], swingSea: 0.5, snow: 1.5 }),
  cloudBase: Object.freeze({ land: [400, 1600, 400], sea: [300, 900], overHill: 600, overGround: 150, sheetDrop: 650, capUnder: 300 }),
  heap: Object.freeze({
    instab: [0.25, 1.6], hum: [0.52, 0.82], lift: [0.5, 1.4], liftHum: [0.56, 0.86], liftGain: 0.6,
    cap: [0.5, 8, 1500], capCover: [0.6, 1], street: [7000, 0.75], lee: 0.85, leeAt: [0.05, -0.45],
    height: 1.3, heightAt: [400, 3200],      // the cold high ground carries more cloud than the lowland
    cluster: 26000, field: 9000, clusterEdge: [0.4, 0.68], fieldEdge: [0.32, 0.66], seaDay: 0.25, seaNight: 0.5,
    depth: [600, 2400],
  }),
  sheet: Object.freeze({
    stratus: [0.86, 0.97], marineHum: [0.66, 0.86], stableAt: [0.2, 0.85], nimbo: [0.1, 0.6], nimboHum: [0.8, 0.95], oro: [0.5, 1.3], oroHum: [0.78, 0.94],
    thick: [300, 1200], rainThick: [400, 4500], rainThickAt: [1, 6], marine: 0.75, mid: 0.35,
  }),
  fog: Object.freeze({ wind: [2, 4.5], hum: [0.55, 0.78], clear: [0.25, 0.6], depth: 0.4, min: 60, max: 400,
    hollow: [0.3, 60, 500], night: 0.15,       // cold air sinking into a hollow at night holds its moisture nearer to saturation
    lift: [1, 3.5], sea: 0.3, seaTop: [100, 300], none: false }),
  rain: Object.freeze({ frontal: [1, 5], slope: [1.3, 2.8], slopeK: 1.8, drizzle: [0.2, 0.5], drizzleAt: [0.9, 1], gate: [0.01, 0.5, 0.74], virga: 2000, wetK: 1.5, slots: 6, slotStep: 1800, wetFall: 10800 }),
  wind: Object.freeze({
    base: 0.8, turn: 25, crest: [0.5, 500], valley: [0.4, 300], low: 0.6,
    slopeDay: 2.5, slopeNight: 1.5, breeze: [3.5, 1.5], breezeIn: 15000, gust: [0.12, 0.35], gustScale: 2500,
  }),
  lenses: Object.freeze({ wind: 11, hum: [0.3, 0.7], N: 0.011, plates: 3, prom: 600, max: 12, length: [6000, 11000], width: [1800, 3200] }),
  upper: Object.freeze({ midMoist: 0.35, midNoise: 70000, highNoise: 90000, jet: 25, jetGain: 0.32, jetNoise: [0.55, 0.85], anvil: 0.92,
    anvilBlow: 420, anvilLength: [10000, 30000] }),   // s of the high wind the anvil reaches downwind, and its limits
  cells: CELL_DEFAULTS,
  systems: SYSTEM_DEFAULTS,
  test: Object.freeze({ jumpCover: false, rainAnywhere: false, flatLand: false, noDay: false }),
});

const DEG = Math.PI / 180, TWO_PI = 2 * Math.PI, HOUR = 3600;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// (a function declaration, not an arrow in a const: it is called a dozen times at every one of
// half a million texels, and the engine inlines this form)
function ss(a, b, x) { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
const mod24 = (h) => { h %= 24; return h < 0 ? h + 24 : h; };
// How much of the moisture the ranges upwind have taken out of the air: all of it where the wind
// sinks down the slope (the dry lee), none where it climbs one (the windward side keeps its rain).
// m: the moisture numbers; upwind: the highest ground upwind (m); hS: the hills there; lift: the
// wind up the slope (m/s). One rule, used wherever moisture is worked out.
// The moisture's own ceiling: the terms that raise it (the day, the high cold ground, a warm
// sector) must not pile up into a saturated sky everywhere. Over SOFT the climb eases off and
// never reaches 1, so only the moistest places and days carry decks and drizzle.
const SOFT = 0.8, SOFT_K = 0.2;
export function softHum(x) { return x <= SOFT ? x : SOFT + SOFT_K * (1 - Math.exp(-(x - SOFT) / SOFT_K)); }

export function rainShadow(m, upwind, hS, lift) {
  const over = Math.max(0, upwind - hS - m.shadowOver);
  if (over <= 0) return 1;
  const t = Math.min(1, Math.max(0, lift / m.lee));
  return Math.exp(-over * (1 - t * t * (3 - 2 * t)) / m.shadow);
}
const u01 = (a, b, c, seed) => hash3(a, b, c, seed) / 4294967296;
// a smooth knot noise of time (knots every `period` s), 0..1
function knot(t, period, ch, seed) {
  const x = t / period, i = Math.floor(x), f = x - i, a = u01(i, ch, 0x61, seed), b = u01(i + 1, ch, 0x61, seed);
  return a + (b - a) * f * f * (3 - 2 * f);
}
// the Sun's height (its sine) at a latitude, a declination and a local solar hour
export function sunHeightSin(lat, decl, hour) {
  const la = lat * DEG, de = decl * DEG, H = (hour - 12) * 15 * DEG;
  return Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(H);
}
// the Sun's declination (degrees) on a day of the year, as Earth's (Haven turns as Earth does)
export const declinationOf = (dayOfYear) => -23.44 * Math.cos(TWO_PI * (dayOfYear + 10) / 365.24);

// What the coarse grid holds: the slow parts of the weather, read from it bilinearly. The wind,
// the clusters of heaps and the upper layers' broad patterns are in it too: they change over tens
// of kilometres, so working them out at every texel of the field was wasted work.
const COARSE_CH = 16;
const COARSE_SHIFT = 2; // the coarse grid is the field's width over 1 << this (6 km a cell on Haven)
const C_HUM = 0, C_HEAT = 1, C_LIFT = 2, C_NIMBO = 3, C_MID = 4, C_HIGH = 5, C_COLD = 6, C_BEHIND = 7,
  C_HIGH0 = 8, C_STR = 9, C_UPWIND = 10, C_WE = 11, C_WN = 12, C_MIDN = 13, C_HIGHN = 14, C_CLUSTER = 15;

// opts: as producer.js's makeProducer (weather, radius, dayHours, origin, layout, land or
// wxland, stormAt). Returns the producer API.
export function createSkyModel(opts = {}) {
  const W0 = opts.weather || {};
  const cfg = {
    moisture: { ...MODEL_DEFAULTS.moisture, ...W0.moisture },
    heat: { ...MODEL_DEFAULTS.heat, ...W0.heat },
    temperature: { ...MODEL_DEFAULTS.temperature, ...W0.temperature },
    cloudBase: { ...MODEL_DEFAULTS.cloudBase, ...W0.cloudBase },
    heap: { ...MODEL_DEFAULTS.heap, ...W0.heap },
    sheet: { ...MODEL_DEFAULTS.sheet, ...W0.sheet },
    fog: { ...MODEL_DEFAULTS.fog, ...W0.fog },
    rain: { ...MODEL_DEFAULTS.rain, ...W0.rain },
    wind: { ...MODEL_DEFAULTS.wind, ...W0.wind },
    lenses: { ...MODEL_DEFAULTS.lenses, ...W0.lenses },
    upper: { ...MODEL_DEFAULTS.upper, ...W0.upper },
    cells: { ...MODEL_DEFAULTS.cells, ...W0.cells },
    systems: { ...MODEL_DEFAULTS.systems, ...W0.systems },
    test: { ...MODEL_DEFAULTS.test, ...W0.test },
  };
  const R = opts.radius || 250000;
  const layout = opts.layout || fieldLayout({ weather: W0 });
  const { width: W, height: H, cWidth: CW, cHeight: CH } = layout;
  const steer = new Steer(W0, R);
  const GW = Math.max(32, W >> COARSE_SHIFT), GH = Math.max(16, H >> COARSE_SHIFT);
  // the walks upwind are smoother still, and the dearest thing here: their own grid, half as
  // fine again (12 km a cell on Haven)
  const KW = Math.max(16, GW >> 1), KH = Math.max(8, GH >> 1);
  // the field's rows and columns: their latitude, longitude and the sines and cosines of both
  const rowsOf = (n) => { const a2 = new Float64Array(n); for (let j = 0; j < n; j++) a2[j] = 90 - (j + 0.5) * 180 / n; return a2; };
  const colsOf = (n) => { const a2 = new Float64Array(n); for (let i = 0; i < n; i++) a2[i] = (i + 0.5) * 360 / n; return a2; };
  const latAB = rowsOf(H), lonAB = colsOf(W);
  const sinLatAB = new Float64Array(H), cosLatAB = new Float64Array(H), sinLonAB = new Float64Array(W), cosLonAB = new Float64Array(W);
  for (let j = 0; j < H; j++) { sinLatAB[j] = Math.sin(latAB[j] * Math.PI / 180); cosLatAB[j] = Math.cos(latAB[j] * Math.PI / 180); }
  for (let i = 0; i < W; i++) { sinLonAB[i] = Math.sin(lonAB[i] * Math.PI / 180); cosLonAB[i] = Math.cos(lonAB[i] * Math.PI / 180); }
  const latCC = rowsOf(CH), lonCC = colsOf(CW);
  const tanLatC = new Float64Array(CH), sinLatC = new Float64Array(CH), cosLatC = new Float64Array(CH);
  for (let j = 0; j < CH; j++) { const la = latCC[j] * Math.PI / 180; tanLatC[j] = Math.tan(la); sinLatC[j] = Math.sin(la); cosLatC[j] = Math.cos(la); }
  const seed = steer.seed;
  const dayHours = opts.dayHours || 24;
  const origin = opts.origin || { lat: 0, lon: 0 };
  const hour0 = opts.hourAtEpoch ?? 0;
  // the land: the file's planes when they are there, else worked out from the elevation map
  const planes = opts.wxland ? { ...opts.wxland, radius: opts.wxland.radius || R } : makeWxLand({ dem: opts.land, width: Math.min(1024, W), radius: R });
  const land = new WxLand(planes);
  // (the planes to hand, and a direct lookup where the field's texels are the land's own: a
  // bilinear read of nine planes at half a million texels is half the cost of a snapshot)
  const LW = land.width, LH = land.height, sameLand = LW === W && LH === H;
  const pG = land.g, pHC = land.hC, pHS = land.hS, pGmin = land.gmin, pLand = land.land, pCoast = land.coast, pGE = land.gE, pGN = land.gN;
  const peaks = (planes.peaks || []).filter((p) => p.prom >= cfg.lenses.prom);

  // ---- the clock and the Sun ----------------------------------------------------------------
  const hourAt = (lon, t) => mod24(hour0 + t * 24 / (dayHours * HOUR) + (lon - origin.lon) / 15);
  const dayOfYear = (t) => {
    const ms = steer.ms(t), d = new Date(ms);
    return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000;
  };

  // ---- the static parts of the land: the caps the summits wear --------------------------------
  // (the summits do not move, so where a cap may stand is worked out once)
  const capStrength = new Float32Array(W * H), capTop = new Float32Array(W * H);
  for (const p of peaks) {
    const reach = cfg.heap.cap[2], j0 = (90 - p.lat) / 180 * H, i0 = p.lon / 360 * W;
    const rows = Math.ceil(reach / (Math.PI * R / H)) + 1;
    for (let dj = -rows; dj <= rows; dj++) {
      const j = Math.round(j0 - 0.5) + dj;
      if (j < 0 || j >= H) continue;
      const lat = 90 - (j + 0.5) * 180 / H, colM = TWO_PI * R * Math.max(Math.cos(lat * DEG), 1e-3) / W;
      const cols = Math.ceil(reach / colM) + 1;
      for (let di = -cols; di <= cols; di++) {
        const i = (((Math.round(i0 - 0.5) + di) % W) + W) % W, k = j * W + i;
        const lon = (i + 0.5) * 360 / W, d = angleBetween(dirOf(lat, lon), dirOf(p.lat, p.lon)) * R;
        const s = 1 - ss(0.35 * reach, reach, d);
        if (s > capStrength[k]) { capStrength[k] = s; capTop[k] = p.h; }
      }
    }
  }

  // ---- the weather at a place and a moment ----------------------------------------------------

  // What does not change over a snapshot's texels: the day, the Sun, the systems, the day's own
  // moisture and wind. Kept for the few times at() and the cells ask about (a pure function of t).
  const times = new Map();
  function timeOf(t) {
    let c = times.get(t);
    if (c) return c;
    const doy = dayOfYear(t), decl = declinationOf(doy), season = decl / 23.44;
    const dayIndex = steer.dayIndex(t), pin = (W0.days || {})[steer.dateOfDay(dayIndex)] || {};
    const m = cfg.moisture;
    const dayHum = pin.humidity ?? (cfg.test.noDay ? 1 : m.day + m.dayAmp * knot(t, m.dayHours * HOUR, 3, seed));
    const systems = systemsAt(cfg.systems, steer, t, season);
    c = {
      t, doy, decl, season, dayIndex, dayHum, systems, pin,
      lowSpeed: Math.abs(steer.speed('low', t)), midSpeed: Math.abs(steer.speed('mid', t)), highSpeed: Math.abs(steer.speed('high', t)),
      upwind: null, walk: walkOf(t), mLow: steer.motion('low', t, new Float64Array(9)),
      mMid: steer.motion('mid', t, new Float64Array(9)), mHigh: steer.motion('high', t, new Float64Array(9)),
      omLow: steer.omega('low', t, [0, 0, 0]), omMid: steer.omega('mid', t, [0, 0, 0]), omHigh: steer.omega('high', t, [0, 0, 0]),
      coarse: null, coarseDone: null, cells: null, geoms: null, anvils: null, lenses: null, tracks: null,
      wet: null, wetDone: null,
    };
    // the turn that takes a point of the low pattern to where the pattern was `street` metres
    // upwind of it: the clusters are read there too, so a field of heaps is drawn out downwind
    // into rows (the plan's cloud streets)
    c.upwind = upwindTurn(t, cfg.heap.street[0] * ss(3, 14, c.lowSpeed));
    // the rows' and the columns' own numbers, so no texel works out a sine of its own
    c.sinDecl = Math.sin(decl * DEG); c.cosDecl = Math.cos(decl * DEG);
    c.sinLat = sinLatAB; c.cosLat = cosLatAB; c.sinLon = sinLonAB; c.cosLon = cosLonAB;
    c.hour = new Float64Array(W); c.cosH = new Float64Array(W);
    for (let i = 0; i < W; i++) { const h = hourAt(lonAB[i], t); c.hour[i] = h; c.cosH[i] = Math.cos((h - 12) * 15 * DEG); }
    // the small map's own columns, and each of its rows' sunrise (the fog burns off after it)
    c.hourC = new Float64Array(CW); c.cosHC = new Float64Array(CW);
    for (let i = 0; i < CW; i++) { const h = hourAt(lonCC[i], t); c.hourC[i] = h; c.cosHC[i] = Math.cos((h - 12) * 15 * DEG); }
    // the tropical line's own term, by row (a function of the latitude and the season)
    c.tropic = new Float64Array(H);
    for (let j = 0; j < H; j++) { const la2 = Math.abs(latAB[j]) - (cfg.heat.tropicAt + 8 * season); c.tropic[j] = Math.exp(-la2 * la2 / 200); }
    c.riseC = new Float64Array(CH);
    const tDecl = Math.tan(decl * DEG);
    for (let j = 0; j < CH; j++) {
      const c0 = -tanLatC[j] * tDecl;
      c.riseC[j] = c0 <= -1 ? -24 : c0 >= 1 ? 48 : 12 - Math.acos(c0) / DEG / 15;
    }
    times.set(t, c);
    if (times.size > 24) times.delete(times.keys().next().value);
    return c;
  }
  // Rodrigues: the turn by -angle about the low layer's own axis of turning, in that layer's own
  // axes (where its pattern stands still), as a row-major 3 x 3.
  function upwindTurn(t, metres) {
    const M = steer.motion('low', t, new Float64Array(9)), w = steer.omega('low', t, [0, 0, 0]);
    const n = mulMT(M, w, [0, 0, 0]), l = Math.hypot(n[0], n[1], n[2]);
    if (!(l > 1e-14) || metres <= 0) return null;
    const x = n[0] / l, y = n[1] / l, z = n[2] / l, a = -metres / R, ca = Math.cos(a), sa = Math.sin(a), k = 1 - ca;
    return new Float64Array([
      ca + x * x * k, x * y * k - z * sa, x * z * k + y * sa,
      y * x * k + z * sa, ca + y * y * k, y * z * k - x * sa,
      z * x * k - y * sa, z * y * k + x * sa, ca + z * z * k,
    ]);
  }

  // The wind of a layer at a place, from the layer's turning (the velocity of its motion:
  // omega x p), into [east, north, speed]. No call into steer.js: a texel cannot afford one.
  const _en = [0, 0, 0];
  function windEN(om, d, height, out = _en) {
    const r = R + height, px = d[0] * r, py = d[1] * r, pz = d[2] * r;
    const vx = om[1] * pz - om[2] * py, vy = om[2] * px - om[0] * pz, vz = om[0] * py - om[1] * px;
    const cl = Math.max(Math.hypot(d[0], d[1]), 1e-9), ex = -d[1] / cl, ey = d[0] / cl;
    const e = vx * ex + vy * ey, n = vx * (-d[2] * ex) + vy * (-d[2] * ey) + vz * cl;
    out[0] = e; out[1] = n; out[2] = Math.hypot(e, n);
    return out;
  }
  // where a point of a layer's pattern stands still: M(t)^-1 . d
  function frameOf(M, d, out) {
    out[0] = M[0] * d[0] + M[3] * d[1] + M[6] * d[2];
    out[1] = M[1] * d[0] + M[4] * d[1] + M[7] * d[2];
    out[2] = M[2] * d[0] + M[5] * d[1] + M[8] * d[2];
    return out;
  }
  function lowFrame(c, d, out) {
    const M = c.mLow;
    out[0] = M[0] * d[0] + M[3] * d[1] + M[6] * d[2];
    out[1] = M[1] * d[0] + M[4] * d[1] + M[7] * d[2];
    out[2] = M[2] * d[0] + M[5] * d[1] + M[8] * d[2];
    return out;
  }

  // ---- how far the sea is upwind, and the highest ground upwind -------------------------------
  // Both are walks of ten steps against the wind. They belong to the moment, like everything
  // else here: a grid of its own for each time asked about, filled a cell at a time (a snapshot
  // fills them all; a question about one place fills four). An earlier version kept one grid per
  // rounded steering axis, which was cheaper and wrong: at the step between two roundings the
  // walk jumped a ridge and the cover of a whole countryside with it.
  function walkOf(t) {
    const a = steer.axis('low', t, [0, 0, 0]), sg = steer.rate('low', t) >= 0 ? 1 : -1;
    return { axis: [a[0] * sg, a[1] * sg, a[2] * sg], fetch: new Float32Array(KW * KH), upwind: new Float32Array(KW * KH), done: new Uint8Array(KW * KH) };
  }
  // one cell of it (the first question about a cell fills it; its own scratch vector, since a
  // question about a cell comes in the middle of working a place's weather out)
  const _wp = [0, 0, 0];
  function walkCell(g, ci, cj) {
    const k = cj * KW + ci;
    if (g.done[k]) return k;
    const m = cfg.moisture, lat = 90 - (cj + 0.5) * 180 / KH, lon = (ci + 0.5) * 360 / KW;
    dirOf(lat, lon, _wp);
    const hS0 = land.at('hS', lon / 360, (90 - lat) / 180);
    // upwind is against the wind, and the wind is the axis's turning: -(axis x p), made whole
    const ax = g.axis;
    let tx = -(ax[1] * _wp[2] - ax[2] * _wp[1]), ty = -(ax[2] * _wp[0] - ax[0] * _wp[2]), tz = -(ax[0] * _wp[1] - ax[1] * _wp[0]);
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    let fetch = m.fetchSteps * m.fetchStep, found = false, upwind = hS0;
    for (let n = 1; n <= m.fetchSteps; n++) {
      const sN = n * m.fetchStep / R;
      const qx2 = _wp[0] + tx * sN, qy2 = _wp[1] + ty * sN, qz2 = _wp[2] + tz * sN, ql = Math.hypot(qx2, qy2, qz2);
      const du = Math.atan2(qy2 / ql, qx2 / ql) / TWO_PI, dv = Math.acos(clamp(qz2 / ql, -1, 1)) / Math.PI;
      if (!found && land.at('land', du, dv) < 0.5) { fetch = n * m.fetchStep; found = true; }
      const q = land.at('hS', du, dv);
      if (q > upwind) upwind = q;
    }
    g.fetch[k] = fetch; g.upwind[k] = upwind; g.done[k] = 1;
    return k;
  }
  // ... read as a map is read, into out[0] (fetch, m) and out[1] (the highest ground upwind, m)
  const _wk = [0, 0];
  function walkAt(g, u, v, out = _wk) {
    footprint(KW, KH, u, v, _fp);
    const i0 = _fp[0], i1 = _fp[1], j0 = _fp[2], j1 = _fp[3], fx = _fp[4], fy = _fp[5];
    const a = walkCell(g, i0, j0), b = walkCell(g, i1, j0), d = walkCell(g, i0, j1), e = walkCell(g, i1, j1);
    const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
    out[0] = wa * g.fetch[a] + wb * g.fetch[b] + wc * g.fetch[d] + wd * g.fetch[e];
    out[1] = wa * g.upwind[a] + wb * g.upwind[b] + wc * g.upwind[d] + wd * g.upwind[e];
    return out;
  }

  // The climate at a place: what the coarse grid holds, worked out from scratch. The one writer
  // of moisture, heat and the systems' terms.
  const _sys = makeSystemField(), _p = [0, 0, 0], _q = [0, 0, 0];
  function climateInto(c, lat, lon, out, o = 0) {
    const m = cfg.moisture, ht = cfg.heat;
    const u = lon / 360, v = (90 - lat) / 180;
    const landf = land.at('land', u, v), hS = land.at('hS', u, v);
    dirOf(lat, lon, _p);
    const w = windEN(c.omLow, _p, 1500, _en);
    // how far the sea is upwind, and the highest ground upwind (the dry lee)
    const wk = walkAt(c.walk, u, v), fetch = wk[0], upwind = Math.max(wk[1], hS);
    systemFieldAt(c.systems, _p, R, _sys);
    const la = Math.abs(lat);
    const climate = m.base + m.eq * Math.exp(-la * la / m.eqWidth) - m.dry * Math.exp(-((la - m.dryAt) ** 2) / m.dryWidth) + m.wet * Math.exp(-((la - m.wetAt) ** 2) / m.wetWidth);
    const source = landf < 0.5 ? 1 : m.land + (1 - m.land) * Math.exp(-fetch / m.landFetch);
    let hum0 = climate * c.dayHum * source * (1 + m.height * ss(m.heightAt[0], m.heightAt[1], hS));
    hum0 += m.sector * _sys.wet - m.dry2 * _sys.dry - m.high * _sys.high0;
    hum0 = softHum(hum0);
    // the heating: the Sun two hours ago, less under a shield of cloud
    const hour = hourAt(lon, c.t), sunLag = sunHeightSin(lat, c.decl, mod24(hour - ht.lag / HOUR));
    const over = Math.max(_sys.nimbo, _sys.mid);
    const heat = landf * ss(Math.sin(ht.sun[0] * DEG), Math.sin(ht.sun[1] * DEG), sunLag) * (1 - ht.overcast * over);
    out[o + C_HUM] = clamp(hum0, 0.02, 1);
    out[o + C_HEAT] = heat;
    out[o + C_LIFT] = _sys.lift;
    out[o + C_NIMBO] = _sys.nimbo;
    out[o + C_MID] = _sys.mid;
    out[o + C_HIGH] = _sys.high;
    out[o + C_COLD] = _sys.cold;
    out[o + C_BEHIND] = _sys.behind;
    out[o + C_HIGH0] = _sys.high0;
    out[o + C_STR] = _sys.strength;
    out[o + C_UPWIND] = upwind;
    out[o + C_WE] = w[0]; out[o + C_WN] = w[1];
    // the broad patterns of the layers, each read in its own frame (where it stands still)
    const up = cfg.upper, hp = cfg.heap;
    frameOf(c.mMid, _p, _q);
    const km = R / up.midNoise;
    out[o + C_MIDN] = 0.5 + 0.5 * noise3(_q[0] * km + 3.3, _q[1] * km + 9.1, _q[2] * km + 1.7);
    frameOf(c.mHigh, _p, _q);
    const kh = R / up.highNoise;
    out[o + C_HIGHN] = 0.5 + 0.5 * noise3(_q[0] * kh + 5.9, _q[1] * kh + 2.3, _q[2] * kh + 8.1);
    frameOf(c.mLow, _p, _q);
    const kc = R / hp.cluster;
    out[o + C_CLUSTER] = 0.5 + 0.5 * noise3(_q[0] * kc + 11.3, _q[1] * kc + 4.1, _q[2] * kc + 7.7);
    return out;
  }

  // the coarse grid, a cell at a time (the first question about a cell fills it)
  function coarseCell(c, ci, cj) {
    if (!c.coarse) { c.coarse = new Float32Array(GW * GH * COARSE_CH); c.coarseDone = new Uint8Array(GW * GH); }
    const k = cj * GW + ci;
    if (!c.coarseDone[k]) {
      const lat = 90 - (cj + 0.5) * 180 / GH, lon = (ci + 0.5) * 360 / GW;
      climateInto(c, lat, lon, c.coarse, k * COARSE_CH);
      c.coarseDone[k] = 1;
    }
    return k * COARSE_CH;
  }
  const _co = new Float32Array(COARSE_CH), _fp = new Float64Array(6);
  // the coarse grid read as a map is read (LINEAR, wrapped in longitude)
  function coarseAt(c, u, v, out = _co) {
    const x = u * GW - 0.5, y = v * GH - 0.5, xi = Math.floor(x), yi = Math.floor(y);
    const i0 = ((xi % GW) + GW) % GW, i1 = (i0 + 1) % GW;
    const j0 = yi < 0 ? 0 : yi > GH - 1 ? GH - 1 : yi, j1 = yi + 1 < 0 ? 0 : yi + 1 > GH - 1 ? GH - 1 : yi + 1;
    const fx = x - xi, fy = y - yi;
    const a = coarseCell(c, i0, j0), b = coarseCell(c, i1, j0), d = coarseCell(c, i0, j1), e = coarseCell(c, i1, j1);
    const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
    const g = c.coarse;
    for (let n = 0; n < COARSE_CH; n++) out[n] = wa * g[a + n] + wb * g[b + n] + wc * g[d + n] + wd * g[e + n];
    return out;
  }

  // ---- the kinds of cloud at one texel --------------------------------------------------------

  // Everything a texel of A and B needs that is not in the coarse grid: the land's own slope and
  // prominence, the clusters' noise, the kinds. `out` holds the numbers the maps take.
  function kindsAt(c, i, j, out, diag = true) {
    const lat = latAB[j], lon = lonAB[i], u = (i + 0.5) / W, v = (j + 0.5) / H;
    // (the anvils of the live cells, painted into the high cloud with cellShape.js' own rule:
    // asked for here, before anything of this texel is worked out, because making them asks the
    // weather at the cells' own places and would write over this one's)
    const anv = anvilsOf(c);
    const co = coarseAt(c, u, v);
    const hum0 = co[C_HUM], heat = co[C_HEAT], sysLift = co[C_LIFT];
    const lk = sameLand ? j * LW + i : -1;
    const g = lk >= 0 ? pG[lk] : sampleGrid(pG, LW, LH, u, v);
    const hC = lk >= 0 ? pHC[lk] : sampleGrid(pHC, LW, LH, u, v);
    const hS = lk >= 0 ? pHS[lk] : sampleGrid(pHS, LW, LH, u, v);
    const landf = lk >= 0 ? pLand[lk] : sampleGrid(pLand, LW, LH, u, v);
    const gmin = lk >= 0 ? pGmin[lk] : sampleGrid(pGmin, LW, LH, u, v);
    const coast = lk >= 0 ? pCoast[lk] : sampleGrid(pCoast, LW, LH, u, v);
    const prom = Math.max(0, hS - hC), m = cfg.moisture;
    // the hills' lift, and the instability over them
    const gE = lk >= 0 ? pGE[lk] : sampleGrid(pGE, LW, LH, u, v);
    const gN = lk >= 0 ? pGN[lk] : sampleGrid(pGN, LW, LH, u, v);
    const slopeLift = co[C_WE] * gE + co[C_WN] * gN;
    const hum = clamp(hum0 * rainShadow(m, co[C_UPWIND], hS, slopeLift), 0.02, 1);
    const lift = clamp(slopeLift + sysLift, -1.5, 4);
    const ht = cfg.heat, la = Math.abs(lat);
    // (the Sun's height without trigonometry: its parts by row and by column, from the context)
    const sun = c.sinLat[j] * c.sinDecl + c.cosLat[j] * c.cosDecl * c.cosH[i];
    let instab = ht.gain * heat * (ht.prom[0] + ht.prom[1] * Math.min(1.6, prom / ht.prom[2])) * (ht.humPow === 1.5 ? hum * Math.sqrt(hum) : Math.pow(hum, ht.humPow));
    instab += ht.behind * co[C_BEHIND] + ht.tropic * c.tropic[j] - ht.high * co[C_HIGH0];
    // (over the sea: cool and steady by day, a little unstable at night; eased across the
    // terminator, since a step there drew the coarse grid's own cells as blocks of deck)
    if (landf < 0.5) instab += ht.seaNight - (ht.seaDay + ht.seaNight) * ss(-0.05, 0.3, sun);
    instab = clamp(instab, 0, 1.4);
    // heaps: unstable moist air, the hills' lift, and the caps the summits wear
    const hp = cfg.heap;
    let heap = clamp(hp.instab[1] * (instab - hp.instab[0]), 0, 1) * ss(hp.hum[0], hp.hum[1], hum);
    heap += hp.liftGain * ss(hp.lift[0], hp.lift[1], lift) * ss(hp.liftHum[0], hp.liftHum[1], hum) * (0.15 + 0.85 * ss(0.15, 0.45, instab));
    heap *= 1 + hp.height * ss(hp.heightAt[0], hp.heightAt[1], hS) * landf;
    const ck = j * W + i, cs = capStrength[ck];
    let capped = 0;
    if (cs > 0 && hum > hp.cap[0] && c.lowSpeed > hp.cap[1]) capped = cs * ss(hp.cap[0], hp.cap[0] + 0.15, hum) * ss(hp.cap[1], hp.cap[1] * 1.6, c.lowSpeed);
    if (landf < 0.5) heap *= hp.seaNight + (hp.seaDay - hp.seaNight) * ss(-0.05, 0.3, sun);
    // the clusters and the fields the heaps come in, carried by the low wind
    _p[0] = c.cosLat[j] * c.cosLon[i]; _p[1] = c.cosLat[j] * c.sinLon[i]; _p[2] = c.sinLat[j];
    lowFrame(c, _p, _q);
    const kf = R / hp.field, cluster = co[C_CLUSTER];
    // cloud streets: the field of heaps is drawn out along the wind on windy days, so they line
    // up in rows downwind of where they form (the plan's streets; the stretch is in the low
    // layer's own frame, where the pattern stands still, so the rows go with the wind)
    let fieldN = 0.5 + 0.5 * noise3(_q[0] * kf + 31.7, _q[1] * kf + 17.3, _q[2] * kf + 23.9);
    if (c.upwind) {
      const U = c.upwind, ux = U[0] * _q[0] + U[1] * _q[1] + U[2] * _q[2], uy = U[3] * _q[0] + U[4] * _q[1] + U[5] * _q[2], uz = U[6] * _q[0] + U[7] * _q[1] + U[8] * _q[2];
      fieldN = Math.max(fieldN, hp.street[1] * (0.5 + 0.5 * noise3(ux * kf + 31.7, uy * kf + 17.3, uz * kf + 23.9)));
    }
    const patch = ss(hp.clusterEdge[0], hp.clusterEdge[1], cluster) * (0.35 + 0.65 * ss(hp.fieldEdge[0], hp.fieldEdge[1], fieldN));
    heap *= 0.12 + 0.88 * patch;
    // the dry lee: where the air sinks, up to lee of the cover goes
    // the dry lee: where the air sinks down a slope the heaps go out (the lee of a range is
    // clear while its windward side is banked with cloud)
    // (the SLOPE's own lift, not the systems' as well: air sinking down a range's lee dries out
    // whatever a low far away is doing to the whole air mass)
    if (slopeLift < hp.leeAt[0]) heap *= 1 - hp.lee * ss(hp.leeAt[0], hp.leeAt[1], slopeLift);
    // the cap a summit wears: it stands on the mountain itself, where the air is going up one
    // side and down the other, so neither the lee's cut nor the clusters take it away
    if (capped > 0) heap = Math.max(heap, hp.capCover[0] + (hp.capCover[1] - hp.capCover[0]) * capped);
    heap = clamp(heap, 0, 1);
    // sheets: stratus in moist stable air, the rain deck of the fronts, cloud banked on slopes
    const sh = cfg.sheet;
    // how settled the air is: a smooth curve, not a cliff (a cliff turned the coarse grid's
    // own cells into blocks of marine deck)
    const stable = 1 - ss(sh.stableAt[0], sh.stableAt[1], instab);
    // (over the sea a deck is the ordinary weather: cool water holds a quilt of stratocumulus
    // where the land would be clear)
    let sheet = landf < 0.5
      ? ss(sh.marineHum[0], sh.marineHum[1], hum) * stable * sh.marine
      : ss(sh.stratus[0], sh.stratus[1], hum) * stable * 0.7;
    const nimbo = ss(sh.nimbo[0], sh.nimbo[1], co[C_NIMBO]) * ss(sh.nimboHum[0], sh.nimboHum[1], hum);
    sheet = Math.max(sheet, nimbo);
    sheet = Math.max(sheet, ss(sh.oro[0], sh.oro[1], lift) * ss(sh.oroHum[0], sh.oroHum[1], hum));
    sheet = clamp(sheet, 0, 1);
    // the base: over the country, never into the hills; a cap hangs on its summit
    const cb = cfg.cloudBase;
    const level = landf > 0.5 ? cb.land[0] + cb.land[1] * (1 - hum) + cb.land[2] * heat : cb.sea[0] + cb.sea[1] * (1 - hum);
    let base = Math.max(hC + level - cb.sheetDrop * sheet, hS + cb.overHill, (landf > 0.5 ? g : 0) + cb.overGround);
    // a cap hangs on its summit, lower than the day's base - but never under the ground
    if (capped > 0) base = Math.max(Math.min(base, Math.max(capTop[ck] - cb.capUnder, hC + 200)), (landf > 0.5 ? g : 0) + cb.overGround);
    // the sheet's thickness, deeper where it rains
    const rain0 = fieldRain(c, hum, lift, Math.max(sheet, heap), nimbo, base, g, landf);
    const thick = sheet > 0.01 ? sh.thick[0] + (sh.thick[1] - sh.thick[0]) * sheet + sh.rainThick[1] * ss(sh.rainThickAt[0], sh.rainThickAt[1], rain0) : 0;
    // the upper layers: the fronts' shields, moist air aloft, the jet's streaks, the anvils
    const up = cfg.upper;
    const midN = co[C_MIDN], highN = co[C_HIGHN];
    let mid = Math.max(co[C_MID], Math.min(up.midMoist, up.midMoist * ss(0.45, 0.8, hum) * ss(0.35, 0.75, midN)));
    let high = Math.max(co[C_HIGH], c.highSpeed > up.jet ? up.jetGain * ss(up.jet, up.jet * 1.8, c.highSpeed) * ss(up.jetNoise[0], up.jetNoise[1], highN) : 0);
    if (anv.length) {
      // (_p is the texel's own direction, from the row's and the column's tables above)
      for (let n = 0; n < anv.length; n++) {
        const A = anv[n];
        if (_p[0] * A.a0 + _p[1] * A.a1 + _p[2] * A.a2 < A.cos * A.L) continue;
        const cover = anvilCover(A, _p);
        if (cover > high) high = cover;
      }
    }
    out.heap = heap; out.sheet = sheet; out.base = base; out.thick = thick;
    out.mid = clamp(mid, 0, 1); out.high = clamp(high, 0, 1);
    out.rain = rain0; out.wet = wetAt(c, u, v, lat, lon);
    // (what went into it, for the tools and the tests; a snapshot's own texels do not ask)
    if (diag) {
      out.hum = hum; out.instab = instab; out.lift = lift; out.slope = slopeLift; out.heat = heat; out.cold = co[C_COLD];
      out.g = g; out.hC = hC; out.hS = hS; out.gmin = gmin; out.land = landf; out.coast = coast; out.prom = prom;
      out.hum0 = hum0; out.upwind = co[C_UPWIND]; out.heatC = co[C_HEAT];
      out.hour = c.hour[i]; out.sun = sun; out.strength = co[C_STR]; out.high0 = co[C_HIGH0];
      out.windE = co[C_WE]; out.windN = co[C_WN]; out.cap = capped;
    }
    if (cfg.test.jumpCover) out.heap = (Math.floor(c.t / SNAP_STEP) % 2) ? 0.95 : 0.05;
    return out;
  }
  // the field's rain (mm/h): the fronts' deck, the slopes, drizzle; none under a base far up
  function fieldRain(c, hum, lift, sheet, nimbo, base, g, landf) {
    const r = cfg.rain;
    if (cfg.test.rainAnywhere) return 4;
    let rain = (r.frontal[0] + r.frontal[1] * nimbo) * ss(0.45, 0.72, nimbo);
    rain = Math.max(rain, r.slopeK * ss(r.slope[0], r.slope[1], lift) * hum * hum);
    if (sheet > 0.85 && hum > 0.9) rain = Math.max(rain, r.drizzle[0] + (r.drizzle[1] - r.drizzle[0]) * ss(r.drizzleAt[0], r.drizzleAt[1], sheet));
    // it falls out of the cloud over it: a thin cover lets through a drizzle at most
    rain *= r.gate[0] + (1 - r.gate[0]) * ss(r.gate[1], r.gate[2], sheet);
    const ground = landf > 0.5 ? g : 0;
    if (base - ground > r.virga) rain *= 1 - ss(r.virga, r.virga * 1.8, base - ground);
    return rain > 0.02 ? rain : 0;
  }
  const _kinds = {};
  const kinds = () => _kinds;

  // ---- the wet ground -------------------------------------------------------------------------

  // The rain of the last hours, on a grid of its own (coarser still): the field's rain at the
  // half-hour slots behind t, and the cells' own rain along their tracks.
  // (a grid of its own, a cell at a time: a snapshot fills them all, a question about one place
  // fills the few it reads)
  const WETW = 64, WETH = 32;      // the wet ground is broad and slow: 24 km a cell on Haven
  const _wc = new Float32Array(COARSE_CH);
  function wetCell(c, i, j) {
    if (!c.wet) { c.wet = new Float32Array(WETW * WETH); c.wetDone = new Uint8Array(WETW * WETH); }
    const k = j * WETW + i;
    if (c.wetDone[k]) return c.wet[k];
    const r = cfg.rain, lat = 90 - (j + 0.5) * 180 / WETH, lon = (i + 0.5) * 360 / WETW;
    const u = lon / 360, v = (90 - lat) / 180;
    const hS = land.at('hS', u, v), landf = land.at('land', u, v), g = land.at('g', u, v);
    const hC = land.at('hC', u, v), gE = land.at('gE', u, v), gN = land.at('gN', u, v);
    let water = 0;
    for (let n = 0; n < r.slots; n++) {
      const tk = Math.floor((c.t - n * r.slotStep) / r.slotStep) * r.slotStep;
      const ck = timeOf(tk), weight = Math.exp(-n * r.slotStep / r.wetFall) * (r.slotStep / HOUR);
      climateInto(ck, lat, lon, _wc, 0);
      const w2 = windEN(ck.omLow, dirOf(lat, lon, _p), 1500, _en);
      const slope = w2[0] * gE + w2[1] * gN;
      const hum = clamp(_wc[C_HUM] * rainShadow(cfg.moisture, _wc[C_UPWIND], hS, slope), 0.02, 1);
      const lift = clamp(slope + _wc[C_LIFT], -1.5, 4);
      const nimbo = ss(cfg.sheet.nimbo[0], cfg.sheet.nimbo[1], _wc[C_NIMBO]) * ss(cfg.sheet.nimboHum[0], cfg.sheet.nimboHum[1], hum);
      const sheet = Math.max(nimbo, ss(cfg.sheet.stratus[0], cfg.sheet.stratus[1], hum) * 0.7);
      const base = Math.max(hC + 800, hS + cfg.cloudBase.overHill, g + cfg.cloudBase.overGround);
      water += weight * fieldRain(ck, hum, lift, sheet, nimbo, base, g, landf);
    }
    c.wet[k] = water; c.wetDone[k] = 1;
    return water;
  }
  // the grid read as a map is read
  function wetField(c, u, v) {
    footprint(WETW, WETH, u, v, _fp);
    const i0 = _fp[0], i1 = _fp[1], j0 = _fp[2], j1 = _fp[3], fx = _fp[4], fy = _fp[5];
    return (wetCell(c, i0, j0) * (1 - fx) + wetCell(c, i1, j0) * fx) * (1 - fy) + (wetCell(c, i0, j1) * (1 - fx) + wetCell(c, i1, j1) * fx) * fy;
  }
  // the cells' rain over the last hours, as tracks (the stub's rule, with cellShape's own shaft)
  function tracksOf(c) {
    if (c.tracks) return c.tracks;
    const r = cfg.rain, tracks = [], life = makeCellLife(), at = [0, 0, 0];
    const rec = recordsOf(c, c.t - 4 * HOUR, c.t);
    for (let o = 0; o < rec.length; o += CELL.STRIDE) {
      const born = rec[o + CELL.BORN], s = [], ctr = [0, 0, 0];
      for (let tau = Math.ceil(Math.max(born, c.t - 4 * HOUR) / 600) * 600; tau <= c.t; tau += 600) {
        cellLife(rec, o, tau, life);
        if (!life.alive || life.rain <= 0) continue;
        cellPlace(steer, rec, o, tau, at);
        s.push(at[0], at[1], at[2], life.core, life.rain * (600 / HOUR) * Math.exp(-(c.t - tau) / r.wetFall));
        ctr[0] += at[0]; ctr[1] += at[1]; ctr[2] += at[2];
      }
      if (!s.length) continue;
      const cl = Math.hypot(ctr[0], ctr[1], ctr[2]);
      ctr[0] /= cl; ctr[1] /= cl; ctr[2] /= cl;
      let reach = 0;
      for (let k = 0; k < s.length; k += 5) reach = Math.max(reach, angleBetween([s[k], s[k + 1], s[k + 2]], ctr) + 1.3 * s[k + 3] / R);
      tracks.push({ x: ctr[0], y: ctr[1], z: ctr[2], cos: Math.cos(Math.min(Math.PI, reach + 1e-4)), s: Float64Array.from(s) });
    }
    c.tracks = tracks;
    return tracks;
  }
  function wetAt(c, u, v, lat, lon) {
    let water = wetField(c, u, v);
    const tracks = tracksOf(c);
    if (tracks.length) {
      dirOf(lat, lon, _p);
      for (let n = 0; n < tracks.length; n++) {
        const tr = tracks[n];
        if (_p[0] * tr.x + _p[1] * tr.y + _p[2] * tr.z < tr.cos) continue;
        const s = tr.s;
        for (let q = 0; q < s.length; q += 5) {
          const d = angleBetween(_p, [s[q], s[q + 1], s[q + 2]]) * R, core = s[q + 3];
          if (d < 1.2 * core) water += s[q + 4] * (1 - ss(0.7 * core, 1.15 * core, d));
        }
      }
    }
    return 1 - Math.exp(-water / cfg.rain.wetK);
  }

  // ---- the cells, their anvils, their lenses ---------------------------------------------------

  // what the cells ask of the weather at a site and a moment
  const _ask = new Float32Array(COARSE_CH);
  function ask(lat, lon, t) {
    const c = timeOf(t);
    climateInto(c, lat, lon, _ask, 0);
    const u = lon / 360, v = (90 - lat) / 180, hS = land.at('hS', u, v);
    const landf = land.at('land', u, v), prom = Math.max(0, hS - land.at('hC', u, v));
    const w = windEN(c.omLow, dirOf(lat, lon, _p), 1500, [0, 0, 0]);
    const slope = w[0] * land.at('gE', u, v) + w[1] * land.at('gN', u, v);
    const hum = clamp(_ask[C_HUM] * rainShadow(cfg.moisture, _ask[C_UPWIND], hS, slope), 0.02, 1);
    const lift = clamp(slope + _ask[C_LIFT], -1.5, 4);
    const ht = cfg.heat;
    let instab = ht.gain * _ask[C_HEAT] * (ht.prom[0] + ht.prom[1] * Math.min(1.6, prom / ht.prom[2])) * Math.pow(hum, ht.humPow);
    instab += ht.behind * _ask[C_BEHIND] - ht.high * _ask[C_HIGH0];
    return {
      instab: clamp(instab, 0, 1.4), hum, lift, hour: hourAt(lon, t), land: landf, cold: _ask[C_COLD],
      windE: w[0], windN: w[1], heat: _ask[C_HEAT], nimbo: _ask[C_NIMBO], midShield: _ask[C_MID],
      highShield: _ask[C_HIGH], midN: _ask[C_MIDN], highN: _ask[C_HIGHN], cluster: _ask[C_CLUSTER],
      upwind: _ask[C_UPWIND], high0: _ask[C_HIGH0], behind: _ask[C_BEHIND], strength: _ask[C_STR],
    };
  }
  // the points along the live fronts where a cell may be born
  function frontsAt(t) {
    const c = timeOf(t), out = [];
    for (const s of c.systems) {
      if (s.kind !== 'low' || s.strength < 0.25) continue;
      for (const pts of [s.cold, s.warm]) {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], len = angleBetween(a, b) * R, n = Math.max(1, Math.round(len / cfg.cells.frontEvery));
          for (let k = 0; k < n; k++) {
            const f = (k + 0.5) / n;
            const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f, l = Math.hypot(x, y, z);
            const d = [x / l, y / l, z / l];
            out.push({ x: d[0], y: d[1], z: d[2], lat: latOf(d), lon: lonOf(d), id: s.id * 16 + i * 4 + k });
          }
        }
      }
    }
    return out;
  }
  // The base for the cells and the strikes: the same rule as the field's, worked out at the place
  // itself (no coarse grid, so a question about one cell costs microseconds and nothing circular).
  const _bs = new Float32Array(COARSE_CH);
  function baseSimple(c, lat, lon) {
    const u = lon / 360, v = (90 - lat) / 180;
    climateInto(c, lat, lon, _bs, 0);
    const hS = land.at('hS', u, v), hC = land.at('hC', u, v), landf = land.at('land', u, v), g = land.at('g', u, v);
    const slope = _bs[C_WE] * land.at('gE', u, v) + _bs[C_WN] * land.at('gN', u, v);
    const hum = clamp(_bs[C_HUM] * rainShadow(cfg.moisture, _bs[C_UPWIND], hS, slope), 0.02, 1);
    const cb = cfg.cloudBase;
    const level = landf > 0.5 ? cb.land[0] + cb.land[1] * (1 - hum) + cb.land[2] * _bs[C_HEAT] : cb.sea[0] + cb.sea[1] * (1 - hum);
    return Math.max(hC + level, hS + cb.overHill, (landf > 0.5 ? g : 0) + cb.overGround);
  }

  const recordCache = new Map();
  function recordsOf(c, ta, tb) {
    // (by the slots the window needs, not by the window itself: a question put every frame then
    // asks the same thing for half an hour of game time)
    const [k0, k1] = slotsFor(cfg.cells, ta, tb), key = `${k0}/${k1}`;
    let r = recordCache.get(key);
    if (!r) {
      r = cellRecords(cfg.cells, seed, land.sites, ask, frontsAt, k0, k1, R, hourAt);
      if (opts.stormAt) {
        const d = dirOf(opts.stormAt.lat, opts.stormAt.lon), extra = [999999, 0x5eed, -1e9, d[0], d[1], d[2], 4000, 10000, 60, 4e9, 60, 35, 0.6, 8, -1, CELL_KIND.STILL];
        const both = new Float64Array(r.length + extra.length);
        both.set(r); both.set(extra, r.length); r = both;
      }
      recordCache.set(key, r);
      if (recordCache.size > 8) recordCache.delete(recordCache.keys().next().value);
    }
    return r;
  }
  function cellsOf(c) {
    if (!c.cells) c.cells = cellsAlive(steer, recordsOf(c, c.t, c.t), c.t, (lat, lon) => baseSimple(c, lat, lon), R);
    return c.cells;
  }
  // the geometry of each live cell (cellShape.js), for the field's own painting and for at()
  function geomsOf(c) {
    if (!c.geoms) {
      c.geoms = cellsOf(c).map((k) => {
        const wLow = steer.wind('low', c.t, [k.x * (R + 3000), k.y * (R + 3000), k.z * (R + 3000)], [0, 0, 0]);
        const wMid = steer.wind('mid', c.t, [k.x * (R + 6000), k.y * (R + 6000), k.z * (R + 6000)], [0, 0, 0]);
        const shear = [(wMid[0] - wLow[0]) / 25, (wMid[1] - wLow[1]) / 25, (wMid[2] - wLow[2]) / 25];
        const shaft = [-wLow[0] / 9, -wLow[1] / 9, -wLow[2] / 9];
        return cellGeometry({
          id: k.id, centre: [k.x, k.y, k.z], radius: k.radius, base: k.base, top: k.top, stage: k.stage,
          strength: k.strength, tilt: shear, shaft, rain: k.rain, core: k.core, age: k.age, seed: (k.seed % 4294967296) / 4294967296,
        }, R);
      });
    }
    return c.geoms;
  }
  // the anvils: of every cell alive, and of those dead under 40 minutes, blown downwind
  function anvilsOf(c) {
    if (c.anvils) return c.anvils;
    const out = [], life = makeCellLife(), at = [0, 0, 0];
    const rec = recordsOf(c, c.t - 2400, c.t);
    for (let o = 0; o < rec.length; o += CELL.STRIDE) {
      const born = rec[o + CELL.BORN], grow = rec[o + CELL.GROW], end = born + grow + rec[o + CELL.MATURE] + rec[o + CELL.DECAY];
      const age = c.t - born;
      const a = ss(0.7 * grow, grow, age) * (1 - ss(0, 2400, c.t - end));
      if (a <= 0) continue;
      const tt = Math.min(c.t, end);
      cellLife(rec, o, tt, life); cellPlace(steer, rec, o, tt, at);
      const topMax = rec[o + CELL.TOP], level = anvilLevel(topMax);
      // blown downwind of its tower by the high wind, 10 to 30 km (the plan's anvil; an anvil
      // carried for its whole age would be two hundred kilometres long on a world this small)
      const wHigh = windEN(c.omHigh, at, level, _en);
      const blow = clamp(wHigh[2] * cfg.upper.anvilBlow, cfg.upper.anvilLength[0], cfg.upper.anvilLength[1]);
      const from = [at[0], at[1], at[2]];
      const to = offsetDir(at, Math.atan2(wHigh[0], wHigh[1]), blow, R, [0, 0, 0]);
      const radius = 4000 + 6000 * ss(0, grow + rec[o + CELL.MATURE], age);
      const A = anvilGeometry({ id: rec[o + CELL.ID], from, to, level, radius, strength: cfg.upper.anvil * a }, R);
      A.cos = Math.cos(Math.min(Math.PI, angleBetween(from, to) + 1.2 * radius / R));
      out.push(A);
    }
    c.anvils = out;
    return out;
  }
  // the lenticulars: downwind of the high summits on stable windy days
  function lensesOf(c) {
    if (c.lenses) return c.lenses;
    const L = cfg.lenses, out = [];
    if (c.midSpeed >= L.wind) {
      for (const p of peaks) {
        if (out.length >= L.max) break;
        const w = windEN(c.omMid, dirOf(p.lat, p.lon, _p), 6000, [0, 0, 0]);
        if (w[2] < L.wind) continue;
        climateInto(c, p.lat, p.lon, _bs, 0);
        const hum = clamp(_bs[C_HUM], 0.02, 1);
        if (hum < L.hum[0] || hum > L.hum[1]) continue;
        // across the ridge: the wind's part at right angles to it
        const ridge = p.ridge * DEG, across = Math.abs(Math.cos(ridge) * w[0] - Math.sin(ridge) * w[1]);
        if (across < L.wind * 0.6) continue;
        const lam = TWO_PI * w[2] / L.N, heading = Math.atan2(w[0], w[1]);
        const plates = 1 + Math.floor(Math.min(L.plates - 1, (w[2] - L.wind) / 6));
        for (let k = 0; k < Math.min(3, plates); k++) {
          if (out.length >= L.max) break;
          const d = offsetDir(dirOf(p.lat, p.lon), heading, lam * (k + 0.5), R);
          out.push({
            id: out.length + 1, x: d[0], y: d[1], z: d[2], base: Math.min(6500, p.h + 1200 + 400 * k),
            length: L.length[0] + (L.length[1] - L.length[0]) * (1 - k / 3), width: L.width[0] + (L.width[1] - L.width[0]) * (1 - k / 3),
            heading, plates: Math.min(3, plates - k), strength: (1 - 0.25 * k) * ss(L.wind, L.wind * 1.4, w[2]),
          });
        }
      }
    }
    c.lenses = out;
    return out;
  }

  // ---- the snapshot ---------------------------------------------------------------------------

  const rows = (n) => { const a = new Float64Array(n); for (let j = 0; j < n; j++) a[j] = 90 - (j + 0.5) * 180 / n; return a; };
  const cols = (n) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = (i + 0.5) * 360 / n; return a; };

  function texelAB(c, i, j, A, B) {
    const k = j * W + i;
    const o = kindsAt(c, i, j, kinds(), false);
    putA(A, k, o.heap, o.sheet, o.base, o.thick);
    putB(B, k, o.mid, o.high, o.rain, o.wet);
  }
  function texelC(c, i, j, C) {
    const u = (i + 0.5) / CW, v = (j + 0.5) / CH;
    putC(C, j * CW + i, fogTopAt(c, i, j, u, v), land.at('hC', u, v));
  }
  // the fog's top (m above the sea; 0: none): a basin on a calm, humid, clear night, and sea fog
  function fogTopAt(c, i, j, u, v) {
    const F = cfg.fog;
    if (F.none) return 0;
    const lat = latCC[j], lon = lonCC[i];
    // the hour first: through the middle of the day no fog can stand, and most of a snapshot's
    // small map is daylight (nothing of the land or the weather is read there)
    const sun0 = sinLatC[j] * c.sinDecl + cosLatC[j] * c.cosDecl * c.cosHC[i];
    const night0 = 1 - ss(-0.02, 0.12, sun0);
    const since = c.hourC[i] > c.riseC[j] ? c.hourC[i] - c.riseC[j] : 0;
    const after0 = ss(0, F.lift[1], since);
    if (Math.max(night0, 1 - after0) <= 0.05) return 0;
    const co = coarseAt(c, u, v), landf = land.at('land', u, v);
    const hC = land.at('hC', u, v), gmin = land.at('gmin', u, v), hS = land.at('hS', u, v);
    const slope = co[C_WE] * land.at('gE', u, v) + co[C_WN] * land.at('gN', u, v);
    const hum = clamp(co[C_HUM] * rainShadow(cfg.moisture, co[C_UPWIND], hS, slope), 0.02, 1);
    const ground = Math.hypot(co[C_WE], co[C_WN]) * cfg.wind.base;
    const night = night0, after = after0;        // (the night builds the fog; the morning burns it off)
    const calm = 1 - ss(F.wind[0], F.wind[1], ground);
    const clear = 1 - ss(F.clear[0], F.clear[1], Math.max(co[C_NIMBO], co[C_MID]));
    // in a hollow, and at night, the air is nearer to saturation than the day's field says
    const depth = Math.max(0, hC - gmin);
    const humFog = hum * (1 + F.hollow[0] * ss(F.hollow[1], F.hollow[2], depth)) * (1 + F.night * night);
    const strength = calm * clear * ss(F.hum[0], F.hum[1], humFog) * Math.max(night, 1 - after);
    if (landf > 0.5) {
      if (depth < 60 || strength <= 0.05) return 0;
      return gmin + clamp(F.depth * depth, F.min, F.max) * strength;
    }
    // sea fog: on some days, by a hash of the day
    const chance = u01(c.dayIndex, 0x5ea, 0x13, seed);
    if (chance > F.sea) return 0;
    const n = 0.5 + 0.5 * noise3(u * 40 + 3.1, v * 40 + 7.3, c.dayIndex * 0.37);
    const s2 = ss(0.5, 0.75, n) * ss(F.hum[0], F.hum[1], humFog) * calm;
    return s2 > 0.05 ? (F.seaTop[0] + (F.seaTop[1] - F.seaTop[0]) * n) * s2 : 0;
  }

  function snapshot(t) {
    const c = timeOf(t), s = makeSnapshot(layout, t);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) texelAB(c, i, j, s.A, s.B);
    for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) texelC(c, i, j, s.C);
    // (a copy: the records are cached, and a worker transfers the snapshot it hands over, which
    // emptied the cache's own list, and with it the cells of the next snapshot of the same slot)
    s.cells = recordsOf(c, t - SNAP_STEP, t + SNAP_STEP).slice();
    const lens = lensesOf(c), rec = [];
    for (const l of lens) rec.push(l.id, l.x, l.y, l.z, l.base, l.length, l.width, l.heading, l.plates, l.strength);
    s.lenses = Float64Array.from(rec);
    return s;
  }

  // ---- at(): the snapshot's own bytes at a place, and what the air there is doing --------------

  // The snapshots at() reads, made texel by texel as it needs them (the same bytes as
  // snapshot(t)'s), kept for the last few times.
  const partial = new Map();
  function partialSnap(tk) {
    let e = partial.get(tk);
    if (!e) {
      e = { s: makeSnapshot(layout, tk), c: timeOf(tk), ab: new Uint8Array(W * H), cc: new Uint8Array(CW * CH) };
      partial.set(tk, e);
      if (partial.size > 4) partial.delete(partial.keys().next().value);
    }
    return e;
  }
  const _f2 = new Float64Array(6);
  function fill(e, u, v) {
    footprint(W, H, u, v, _f2);
    for (let a = 2; a < 4; a++) for (let b = 0; b < 2; b++) {
      const i = _f2[b], j = _f2[a];
      if (!e.ab[j * W + i]) { texelAB(e.c, i, j, e.s.A, e.s.B); e.ab[j * W + i] = 1; }
    }
    footprint(CW, CH, u, v, _f2);
    for (let a = 2; a < 4; a++) for (let b = 0; b < 2; b++) {
      const i = _f2[b], j = _f2[a];
      if (!e.cc[j * CW + i]) { texelC(e.c, i, j, e.s.C); e.cc[j * CW + i] = 1; }
    }
    return e.s;
  }

  const _uv = [0, 0], _pd = [0, 0, 0], _pm = [0, 0, 0], _vw = [0, 0, 0];
  function at(place, t, out = makeSkyAt()) {
    let lat, lon, h, hasH;
    if (Array.isArray(place) || ArrayBuffer.isView(place)) {
      const r = Math.hypot(place[0], place[1], place[2]) || 1;
      _pd[0] = place[0] / r; _pd[1] = place[1] / r; _pd[2] = place[2] / r;
      lat = latOf(_pd); lon = lonOf(_pd); h = r - R; hasH = true;
    } else {
      lat = place.lat; lon = place.lon; hasH = place.h != null; h = place.h ?? 0;
      dirOf(lat, lon, _pd);
    }
    const k = Math.floor(t / SNAP_STEP), tk = k * SNAP_STEP, f = (t - tk) / SNAP_STEP;
    uvOfLatLon(lat, lon, _uv);
    const F = fieldAt(fill(partialSnap(tk), _uv[0], _uv[1]), f > 0 ? fill(partialSnap(tk + SNAP_STEP), _uv[0], _uv[1]) : null, f, _uv[0], _uv[1], out.field);
    const c = timeOf(tk);
    const g = land.at('g', _uv[0], _uv[1]), landf = land.at('land', _uv[0], _uv[1]);
    const ground = landf > 0.5 ? Math.max(g, 0) : 0;
    if (!hasH) h = ground;
    // the cells overhead: their rain, their darkness, their towers, the gust front
    let storm = 0, cellRainMm = 0, cell = -1, gustE = 0, gustN = 0;
    let top = F.base + Math.max(F.sheet > 0.05 ? F.thick : 0, F.heap > 0.05 ? cfg.heap.depth[0] + cfg.heap.depth[1] * F.heap : 0);
    const geoms = geomsOf(c), live = cellsOf(c);
    for (let n = 0; n < geoms.length; n++) {
      const G = geoms[n], kc = live[n];
      const d = angleBetween(_pd, [kc.x, kc.y, kc.z]) * R;
      if (d > kc.radius * 2 + 14000) continue;
      const foot = cellFootprint(G, _pd);
      if (foot > storm) storm = foot;
      _pm[0] = _pd[0] * (R + h); _pm[1] = _pd[1] * (R + h); _pm[2] = _pd[2] * (R + h);
      const rainHere = cellRain(G, _pm);
      if (rainHere > cellRainMm) cellRainMm = rainHere;
      if (d < kc.radius) top = Math.max(top, kc.top);
      if (d < kc.radius || rainHere > 0) cell = kc.id;
      if (kc.rain > 1 && d > 1) {
        const amp = (6 + 9 * u01(kc.seed, 9, 0x31, 1)) * kc.strength * ss(0.8 * kc.core, 0.8 * kc.core + 1500, d) * (1 - ss(kc.core + 3000, kc.core + 9000, d));
        if (amp > 0) {
          const dot = _pd[0] * kc.x + _pd[1] * kc.y + _pd[2] * kc.z;
          const vx = _pd[0] * dot - kc.x, vy = _pd[1] * dot - kc.y, vz = _pd[2] * dot - kc.z, vl = Math.hypot(vx, vy, vz) || 1;
          const en = eastNorth(_pd, [vx / vl * amp, vy / vl * amp, vz / vl * amp]);
          gustE += en[0]; gustN += en[1];
        }
      }
    }
    // the ground wind: the low layer's, slowed and turned, with the land's own doing
    const wd = cfg.wind;
    const w = steer.windAt('low', t, lat, lon, 150);
    const turn = (lat >= 0 ? wd.turn : -wd.turn) * DEG, ct = Math.cos(turn), st = Math.sin(turn);
    const hS = land.at('hS', _uv[0], _uv[1]), hC = land.at('hC', _uv[0], _uv[1]);
    const prom = Math.max(0, hS - hC), valley = Math.max(0, hC - g);
    const expo = (1 + wd.crest[0] * Math.min(2, prom / wd.crest[1])) * (1 - wd.valley[0] * Math.min(1, valley / wd.valley[1]));
    const co = coarseAt(c, _uv[0], _uv[1]);
    const low = 1 + wd.low * co[C_STR];
    let e = (w.east * ct - w.north * st) * wd.base * expo * low;
    let n2 = (w.east * st + w.north * ct) * wd.base * expo * low;
    // the slope wind: up the hills by day, down them at night
    const hour = hourAt(lon, t), sun = sunHeightSin(lat, c.decl, hour);
    const gE = land.at('gE', _uv[0], _uv[1]), gN = land.at('gN', _uv[0], _uv[1]), gl = Math.hypot(gE, gN);
    if (gl > 1e-4 && landf > 0.5) {
      const up = sun > 0.05 ? wd.slopeDay * ss(0, 0.3, sun) : -wd.slopeNight;
      e += up * gE / gl * Math.min(1, gl / 0.08); n2 += up * gN / gl * Math.min(1, gl / 0.08);
    }
    // the sea breeze: onshore by day, offshore at night, within breezeIn of the coast
    const coast = land.at('coast', _uv[0], _uv[1]);
    if (landf > 0.5 && coast < wd.breezeIn) {
      const near = 1 - ss(0.4 * wd.breezeIn, wd.breezeIn, coast);
      const day = ss(0, 0.5, sun) * (1 - ss(0.75, 1, Math.abs(hour - 15) / 6));
      const amp = day > 0 ? wd.breeze[0] * day * near : -wd.breeze[1] * near * (1 - ss(-0.1, 0.1, sun));
      if (gl > 1e-4) { e += amp * gE / gl; n2 += amp * gN / gl; }      // inland is uphill, near enough
    }
    e += gustE; n2 += gustN;
    // gusts: the place carried downwind, in time
    lowFrame(c, _pd, _pm);
    const gustAmp = wd.gust[0] + (wd.gust[1] - wd.gust[0]) * knot(t, 6 * HOUR, 7, seed);
    const gust = 1 + gustAmp * (2 * (0.5 + 0.5 * noise3(_pm[0] * R / wd.gustScale, _pm[1] * R / wd.gustScale, _pm[2] * R / wd.gustScale + t / 37)) - 1);
    out.windE = e * gust; out.windN = n2 * gust; out.wind = Math.hypot(out.windE, out.windN); out.gust = gust;
    // temperature, snow
    const T = cfg.temperature;
    const swing = landf > 0.5
      ? (sun > 0 ? T.swingLand[0] * ss(0, 0.6, sun) : -T.swingLand[1])
      : T.swingSea * Math.cos((hour - 15) * Math.PI / 12);
    // (summerness: 1 in that hemisphere's summer, -1 in its winter, 0 at an equinox)
    const summer = (lat >= 0 ? 1 : -1) * c.season;
    out.temp = T.eq - T.latK * Math.max(0, Math.abs(lat) - T.latFrom) + T.season * summer * Math.min(1, Math.abs(lat) / T.seasonLat) - T.lapse * h / 1000 + swing;
    const total = (h < F.base ? F.rain : 0) + cellRainMm;
    const sn = clamp((T.snow - out.temp) / 3, 0, 1);
    out.rain = total * (1 - sn); out.snow = total * sn;
    out.storm = storm;
    out.overcast = 1 - (1 - 0.55 * F.heap) * (1 - 0.95 * F.sheet) * (1 - 0.5 * F.mid) * (1 - 0.2 * F.high) * (1 - storm);
    // fog below its top, fading out over its last 40 m (0.0156 / m: 250 m to see)
    let fog = F.fogTop > 0 ? 0.0156 * ss(0, 40, F.fogTop - h) : 0;
    if (h > F.base && h < F.base + F.thick) fog = Math.max(fog, 0.02 * F.sheet);
    out.fog = fog; out.wet = F.wet; out.base = F.base; out.top = top; out.cell = cell;
    return out;
  }
  function eastNorth(d, v) {
    const cl = Math.max(Math.hypot(d[0], d[1]), 1e-9), ex = -d[1] / cl, ey = d[0] / cl;
    const nx = -d[2] * ex, ny = -d[2] * ey, nz = cl;
    return [v[0] * ex + v[1] * ey, v[0] * nx + v[1] * ny + v[2] * nz];
  }

  // ---- the API ---------------------------------------------------------------------------------

  return {
    recipe: 'made', layout, radius: R, origin, steer, land, sites: land.sites, peaks,
    snapshot,
    at,
    cells: (t) => cellsOf(timeOf(t)).map((k) => ({ ...k })),
    records: (ta, tb) => recordsOf(timeOf(tb), ta, tb),
    strikes: (t0, t1) => {
      const c = timeOf(Math.max(t0, t1));
      const rec = recordsOf(c, Math.min(t0, t1), Math.max(t0, t1));
      return strikesIn(rec, t0, t1, (r, o, t, out) => cellPlace(steer, r, o, t, out), (lat, lon) => baseSimple(c, lat, lon), (lat, lon) => Math.max(0, land.atLatLon('g', lat, lon)), R);
    },
    anvils: (t) => anvilsOf(timeOf(t)).map((A) => ({ id: A.id, from: [A.a0, A.a1, A.a2], to: [A.b0, A.b1, A.b2], level: A.L - R, radius: A.radius, strength: A.strength })),
    lenses: (t) => lensesOf(timeOf(t)).map((l) => ({ ...l })),
    systems: (t) => systemsAt(cfg.systems, steer, t, declinationOf(dayOfYear(t)) / 23.44).map((s) => ({ ...s })),
    day: (index) => steer.day(index),
    hourAt,
    climate: (lat, lon, t) => ask(lat, lon, t),
    // what a texel of the field holds, and everything that went into it (the tools and the tests)
    texel: (i, j, t) => ({ ...kindsAt(timeOf(t), ((i % W) + W) % W, Math.max(0, Math.min(H - 1, j)), kinds()) }),
    cfg,
  };
}

