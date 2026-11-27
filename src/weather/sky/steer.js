// The wind of each cloud layer: a rigid turning of the whole sky, worked out in closed form
// from the game clock (docs/briefs/clouds-weather-plan.md, "STEERING").
//
// For each layer L (low 1.5 km, mid 5 km, high 9 km, and the storm cells between low and mid)
//   M_L(t) = Rz(psi(t)) . Rx(phi(t) + dphi_L(t)) . Rz(theta_L(t) - psi(t))
// in the planet's fixed axes (z the spin axis, x through longitude 0). theta_L is the exact
// integral of a signed rate made of 12-hour knots joined by smoothsteps (its prefix sums from
// the epoch are kept, so any time costs the same and gives the same number whatever was asked
// before); the tilt phi and its azimuth psi are slow knots over days; dphi_high tilts the high
// layer's axis up to `veer` degrees from the low's, so high cloud can run on another heading.
// (The - psi: the axis is turned round the pole without dragging the whole sky round with it.
// With no tilt psi does nothing; with one, the slow turnings add about (2 sin(phi / 2) psi' +
// phi') R, under 2 m/s on Haven. They grow with the radius: a world as large as Earth keeps its
// tilt at 0 or its knots far apart.)
// The wind of a layer at p IS the velocity of its motion, omega_L(t) x p: always level, and a
// pattern read at M_L(t)^-1 p moves with it exactly, at any jump of the clock, drawn or not.
// (Haven is 1 571 km round, smaller than one of Earth's weather systems: one steering flow per
// layer is not a simplification that shows.)
//
// The day's character is what the low wind does that day: two knots, at 06 h and 18 h of the
// world's day (`dayStart`: the hour, UTC, at which its calendar day begins), westerly (toward
// the east about the steering axis) on about 85 % of days and easterly on the rest, passing
// through calm between. A world file may pin a day: weather.days['2024-09-24'] = { wind: 12 }
// (m/s on the steering's great circle; negative is easterly; [w06, w18] for two knots) and
// { veer: -20 } (degrees). Other keys of a day belong to the rest of the model. A plain westerly
// for every day (Earth's): steering { low: { fixed: 8 }, tilt: 0, high: { veer: 0 } }.
//
// The low pattern also rises through its layer at `rise` m/s (in the place of the old 'change'
// term, which slid it along the planet's axis at six times the wind), so heaps grow and fade in
// place as they go: read in two phases half a period apart, so the pattern never jumps when one
// wraps (risePhases; steerLowA and steerLowB in the GLSL; the shared cloud rule's skyLowNoise in
// src/sky/skyGlsl.js). The first phase alone is read but for a fade either side of its wrap
// (RISE.FADE of the period each side), where the second takes over: one noise read most of
// the time, two only in the fades.
//
// Pure JS: no three, no DOM, no Math.random. It runs in the worker, on the main thread and in
// Node. Everything is a function of (seed, the world's numbers, the clock); nothing here knows
// where the traveller is. Test: node scripts/sky-steer-test.mjs.
import { hash3 } from '../../terrain/height/noise.js';
import { glslOnce } from './format.js';

// The layers, in the order of the shader's arrays (STEER_GLSL is made from this list).
export const STEER_LAYERS = Object.freeze(['low', 'mid', 'high', 'cell']);
// Where each layer's wind is meant (m above the sea). The motion is rigid, so the wind at any
// height is omega x p; these are only where windAt() looks when not told.
export const STEER_HEIGHT = Object.freeze([1500, 5000, 9000, 3000]);

export const STEER_DEFAULTS = Object.freeze({
  seed: 1,
  epoch: '2024-01-01T00:00:00Z',    // the game clock's zero: theta and the rise count from here
  dayStart: 0,                      // hours after 00:00 UTC at which the world's day begins
  steering: Object.freeze({
    // the low wind on the great circle 90 degrees from the axis (m/s at sea level): westerly
    // days least..max, easterly ones least..easterlyMax (a share `easterly` of the days), skewed
    // toward the light end by `shape` (1: evenly); the 18 h knot differs from the 06 h one by up
    // to `change` of it; `fixed`: every day this. (At Haven's opening place, 48.5 degrees
    // south, that gives 0..14 m/s over 20 days, median 4.5: scripts/sky-steer-test.mjs.)
    low: Object.freeze({ max: 14, least: 2.5, easterly: 0.15, easterlyMax: 7, shape: 1, change: 0.25, fixed: null }),
    mid: Object.freeze({ k: 1.9, add: 4 }),            // k |low| + add, westerly
    high: Object.freeze({ k: 3.4, add: 8, veer: 30 }), // and its axis up to veer degrees from the low's
    tilt: 43, tiltDays: 3,          // how far the axis leans from the pole (degrees), knots every so many days
    turnDays: 5,                    // the lean's direction: a new one every so many days (the shorter way round)
    rise: 0.5,                      // the low pattern's rise through its layer (m/s); its phases: RISE
  }),
});

// The rise's two phases (the same for every world: a shader is handed only the first phase, in
// metres, and works out the second and the weights from these): their period (m; the noise's
// scale on Haven and Earth) and the share of a period over which the first fades out before its
// wrap and in after it. The weight of the first phase at a (m into its period): riseWeight(a).
export const RISE = Object.freeze({ PERIOD: 4200, FADE: 0.08 });
export function riseWeight(a) { const f = a / RISE.PERIOD; return smooth(Math.min(1, Math.max(0, f / RISE.FADE))) * smooth(Math.min(1, Math.max(0, (1 - f) / RISE.FADE))); }

const LOW = 0, MID = 1, HIGH = 2, CELL = 3;
const DAY = 86400, HALF = 43200, DEG = Math.PI / 180, TAU = 2 * Math.PI;
// (the hash's channels: one stream of numbers per thing decided)
const CH_SIGN = 1, CH_STRENGTH = 2, CH_CHANGE = 3, CH_VEER = 4, CH_TILT = 5, CH_TURN = 6;
const smooth = (f) => f * f * (3 - 2 * f), smoothD = (f) => 6 * f * (1 - f);
// the part of a smoothstep's integral from 0 to f: integral of 3u^2 - 2u^3
const smoothI = (f) => f * f * f - 0.5 * f * f * f * f;
const wrapPi = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

const layerIndex = (layer) => {
  const k = typeof layer === 'number' ? layer : STEER_LAYERS.indexOf(layer);
  if (!(k >= 0 && k < STEER_LAYERS.length) || (k | 0) !== k) throw new Error(`steer: no layer ${layer}`);
  return k;
};

// The integral of a sequence of knots (one every HALF seconds, joined by smoothsteps), from
// knot j0. Prefix sums are added up outward from j0 and kept, so the value at a knot never
// depends on the order of the questions (the same number in the worker and on the page).
class KnotIntegral {
  constructor(value, j0) { this.v = value; this.j0 = j0; this.up = [0]; this.down = [0]; }
  // from knot j0 to knot j, in units of HALF seconds
  prefix(j) {
    const n = j - this.j0;
    if (n >= 0) {
      const a = this.up;
      while (a.length <= n) { const k = this.j0 + a.length - 1; a.push(a[a.length - 1] + 0.5 * (this.v(k) + this.v(k + 1))); }
      return a[n];
    }
    const a = this.down;
    while (a.length <= -n) { const k = this.j0 - a.length; a.push(a[a.length - 1] - 0.5 * (this.v(k) + this.v(k + 1))); }
    return a[-n];
  }
  // from knot j0 to fraction f of the way from knot j to knot j + 1 (seconds x the value)
  at(j, f) { const a = this.v(j), b = this.v(j + 1); return HALF * (this.prefix(j) + a * f + (b - a) * smoothI(f)); }
}

// Row-major 3 x 3 helpers (planet-fixed axes). M p and M^T p (M^T = M^-1: a turning).
export function mulM(M, p, out = [0, 0, 0]) {
  const x = p[0], y = p[1], z = p[2];
  out[0] = M[0] * x + M[1] * y + M[2] * z; out[1] = M[3] * x + M[4] * y + M[5] * z; out[2] = M[6] * x + M[7] * y + M[8] * z;
  return out;
}
export function mulMT(M, p, out = [0, 0, 0]) {
  const x = p[0], y = p[1], z = p[2];
  out[0] = M[0] * x + M[3] * y + M[6] * z; out[1] = M[1] * x + M[4] * y + M[7] * z; out[2] = M[2] * x + M[5] * y + M[8] * z;
  return out;
}

// Rz(a) Rx(b) Rz(c), row-major: a motion from its angles (Steer.motion takes a = psi, b = phi,
// c = theta - psi from Steer.angles)
export function motionOf(psi, phi, theta, out = new Float64Array(9)) {
  const ca = Math.cos(psi), sa = Math.sin(psi), cb = Math.cos(phi), sb = Math.sin(phi), cc = Math.cos(theta), sc = Math.sin(theta);
  out[0] = ca * cc - sa * cb * sc; out[1] = -ca * sc - sa * cb * cc; out[2] = sa * sb;
  out[3] = sa * cc + ca * cb * sc; out[4] = -sa * sc + ca * cb * cc; out[5] = -ca * sb;
  out[6] = sb * sc; out[7] = sb * cc; out[8] = cb;
  return out;
}

// The shader's uniforms, by the names STEER_GLSL declares (three takes flat arrays for arrays
// of mat3 and vec4; keep these objects and fill them each frame: never replace them).
export function makeSteerUniforms() {
  const n = STEER_LAYERS.length;
  return { uSteerInv: new Float32Array(9 * n), uSteerSpin: new Float32Array(4 * n), uSteerRise: new Float32Array(4) };
}

export class Steer {
  // weather: the world file's weather block (or {}); radius: the world's (m)
  constructor(weather = {}, radius) {
    if (!(radius > 0)) throw new Error('steer: the world radius (m) is needed');
    const D = STEER_DEFAULTS.steering, s = weather.steering || {};
    this.R = radius;
    this.cfg = {
      low: { ...D.low, ...s.low }, mid: { ...D.mid, ...s.mid }, high: { ...D.high, ...s.high },
      tilt: s.tilt ?? D.tilt, tiltDays: s.tiltDays ?? D.tiltDays, turnDays: s.turnDays ?? D.turnDays,
      rise: s.rise ?? D.rise, risePeriod: RISE.PERIOD,
    };
    this.seed = (weather.seed ?? STEER_DEFAULTS.seed) | 0;
    this.epochMs = Date.parse(weather.epoch ?? STEER_DEFAULTS.epoch);
    if (!Number.isFinite(this.epochMs)) throw new Error(`steer: the epoch ${weather.epoch} is not a date`);
    this.epochSec = this.epochMs / 1000;
    this.dayStart = (weather.dayStart ?? STEER_DEFAULTS.dayStart) * 3600;
    this.pins = new Map();
    for (const [date, pin] of Object.entries(weather.days || {})) {
      if (pin && (pin.wind != null || pin.veer != null)) this.pins.set(this.dayOfDate(date), pin);
    }
    // knot j of the low wind stands at T0 + j HALF (Unix seconds): 06 h and 18 h of the world's day
    this.T0 = this.dayStart + 6 * 3600;
    const lowKnot = (j) => this._wind(Math.floor(j / 2))[j & 1] / radius;
    const c = this.cfg, mid = (j) => (c.mid.k * Math.abs(lowKnot(j) * radius) + c.mid.add) / radius;
    const high = (j) => (c.high.k * Math.abs(lowKnot(j) * radius) + c.high.add) / radius;
    this.knot = [lowKnot, mid, high];
    const j0 = Math.floor((this.epochSec - this.T0) / HALF);
    this.int = this.knot.map((v) => new KnotIntegral(v, j0));
    this.theta0 = [LOW, MID, HIGH].map((k) => this._thetaAbs(k, this.epochSec));
    this._M = new Float64Array(9);
  }

  // --- the clock ---
  // seconds since the epoch, from a date in Unix milliseconds (app: jdToDate(jd)); and back
  t(ms) { return (ms - this.epochMs) / 1000; }
  ms(t) { return this.epochMs + t * 1000; }

  // --- the world's calendar (one rule for every part of the model that has days) ---
  dayIndex(t) { return Math.floor((this.epochSec + t - this.dayStart) / DAY); }
  dayOfDate(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) throw new Error(`steer: a day is written YYYY-MM-DD, not ${date}`);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) / (DAY * 1000);
  }
  dateOfDay(index) { return new Date(index * DAY * 1000).toISOString().slice(0, 10); }
  // the clock (s since the epoch) at which a day begins
  dayStartT(index) { return index * DAY + this.dayStart - this.epochSec; }

  // The day's character: its low wind at 06 h and 18 h (m/s on the steering's great circle at
  // sea level; negative: easterly), the high layer's lean from the low's (degrees).
  day(index) {
    const [wind06, wind18] = this._wind(index);
    return { index, date: this.dateOfDay(index), wind06, wind18, veer: this._veer(index), easterly: wind06 < 0, pinned: this.pins.has(index) };
  }
  _u(i, ch) { return hash3(i, ch, 0x5733, this.seed) / 4294967296; }
  _wind(index) {
    const L = this.cfg.low, pin = this.pins.get(index);
    if (pin?.wind != null) return Array.isArray(pin.wind) ? [pin.wind[0], pin.wind[1]] : [pin.wind, pin.wind];
    if (L.fixed != null) return [L.fixed, L.fixed];
    const east = this._u(index, CH_SIGN) < L.easterly, top = east ? L.easterlyMax : L.max;
    const a = L.least + (top - L.least) * Math.pow(this._u(index, CH_STRENGTH), L.shape);
    const b = Math.min(top, Math.max(L.least, a * (1 + L.change * (2 * this._u(index, CH_CHANGE) - 1))));
    return east ? [-a, -b] : [a, b];
  }
  // (two days' numbers averaged: the lean changes by at most `veer` from one day to the next)
  _veer(index) {
    const pin = this.pins.get(index);
    return pin?.veer ?? this.cfg.high.veer * (this._u(index, CH_VEER) + this._u(index + 1, CH_VEER) - 1);
  }

  // --- the motions ---
  _thetaAbs(k, U) {
    const x = (U - this.T0) / HALF, j = Math.floor(x);
    return this.int[k].at(j, (U - this.T0 - j * HALF) / HALF);
  }
  _rate(k, U) {
    const x = (U - this.T0) / HALF, j = Math.floor(x), f = (U - this.T0 - j * HALF) / HALF;
    const a = this.knot[k](j), b = this.knot[k](j + 1);
    return a + (b - a) * smooth(f);
  }
  // a slow knot noise: knots every `days` days from the day boundary; [value, d value / dt]
  _slow(U, days, value, period = 0) {
    const L = days * DAY, x = (U - this.dayStart) / L, i = Math.floor(x), f = (U - this.dayStart - i * L) / L;
    const a = value(i); let d = value(i + 1) - a;
    if (period) d = wrapPi(d);
    return [a + d * smooth(f), d * smoothD(f) / L];
  }
  // the angles of layer k at the clock t: psi, phi (with the layer's lean), theta, and their rates
  // (kept for the moment last asked about, layer by layer: a frame asks for the same layer at
  // the same moment a dozen times over — its motion, its rate, its wind here and there — and
  // each answer was worked out from the knots again. The answer is not to be written into.)
  angles(layer, t) {
    const k = layerIndex(layer), kept = (this._angles || (this._angles = []))[k];
    if (kept && kept.t === t) return kept.v;
    const v = this._anglesOf(k, t);
    this._angles[k] = { t, v };
    return v;
  }
  _anglesOf(k, t) {
    const U = this.epochSec + t, c = this.cfg;
    const [phi, dphi] = this._slow(U, c.tiltDays, (i) => c.tilt * DEG * this._u(i, CH_TILT));
    const [psi, dpsi] = this._slow(U, c.turnDays, (i) => TAU * this._u(i, CH_TURN), TAU);
    let lean = 0, dlean = 0;
    if (k === HIGH) {
      // the lean's knots at the middle of each world day
      const x = (U - this.dayStart - HALF) / DAY, i = Math.floor(x), f = (U - this.dayStart - HALF - i * DAY) / DAY;
      const a = this._veer(i) * DEG, b = this._veer(i + 1) * DEG;
      lean = a + (b - a) * smooth(f); dlean = (b - a) * smoothD(f) / DAY;
    }
    let theta, rate;
    if (k === CELL) {
      theta = 0.5 * (this._thetaAbs(LOW, U) - this.theta0[LOW] + this._thetaAbs(MID, U) - this.theta0[MID]);
      rate = 0.5 * (this._rate(LOW, U) + this._rate(MID, U));
    } else { theta = this._thetaAbs(k, U) - this.theta0[k]; rate = this._rate(k, U); }
    return { psi, phi: phi + lean, theta, dpsi, dphi: dphi + dlean, rate };
  }
  // the layer's rate (rad/s) and its speed on the great circle 90 degrees from its axis (m/s at sea level)
  rate(layer, t) { return this.angles(layer, t).rate; }
  speed(layer, t) { return this.angles(layer, t).rate * this.R; }
  // M_L(t), row-major
  motion(layer, t, out = new Float64Array(9)) {
    const { psi, phi, theta } = this.angles(layer, t);
    return motionOf(psi, phi, theta - psi, out);
  }
  // the layer's axis of turning (unit, planet-fixed): the steering's own north pole
  axis(layer, t, out = [0, 0, 0]) {
    const { psi, phi } = this.angles(layer, t);
    out[0] = Math.sin(psi) * Math.sin(phi); out[1] = -Math.cos(psi) * Math.sin(phi); out[2] = Math.cos(phi);
    return out;
  }
  // its angular velocity (rad/s, planet-fixed): dM/dt M^-1 = [omega]x, which for
  // Rz(psi) Rx(phi) Rz(theta - psi) is psi' z + phi' Rz(psi) x + (theta' - psi') axis
  omega(layer, t, out = [0, 0, 0]) {
    const { psi, phi, dpsi, dphi, rate } = this.angles(layer, t);
    const ca = Math.cos(psi), sa = Math.sin(psi), cb = Math.cos(phi), sb = Math.sin(phi), spin = rate - dpsi;
    out[0] = dphi * ca + spin * sa * sb; out[1] = dphi * sa - spin * ca * sb; out[2] = dpsi + spin * cb;
    return out;
  }
  // where the pattern of the layer stands still: M^-1 p; and back: M q
  inverse(layer, t, p, out = [0, 0, 0]) { return mulMT(this.motion(layer, t, this._M), p, out); }
  apply(layer, t, q, out = [0, 0, 0]) { return mulM(this.motion(layer, t, this._M), q, out); }
  // a thing carried by the layer from where it was at t0 to where it is at t1: M(t1) M(t0)^-1 p
  carry(layer, t0, t1, p, out = [0, 0, 0]) { return this.apply(layer, t1, this.inverse(layer, t0, p, out), out); }
  // the wind of the layer at p (planet-fixed metres; m/s, planet-fixed): the motion's velocity
  wind(layer, t, p, out = [0, 0, 0]) {
    const px = p[0], py = p[1], pz = p[2], w = this.omega(layer, t, out), x = w[0], y = w[1], z = w[2];
    out[0] = y * pz - z * py; out[1] = z * px - x * pz; out[2] = x * py - y * px;
    return out;
  }
  // ... at a place: east, north and up (m/s), its speed, and the bearing it blows toward (degrees)
  windAt(layer, t, lat, lon, height = STEER_HEIGHT[layerIndex(layer)]) {
    const la = lat * DEG, lo = lon * DEG, cl = Math.cos(la), sl = Math.sin(la), co = Math.cos(lo), so = Math.sin(lo), r = this.R + height;
    const v = this.wind(layer, t, [r * cl * co, r * cl * so, r * sl]);
    const east = -so * v[0] + co * v[1], north = -sl * co * v[0] - sl * so * v[1] + cl * v[2], up = cl * co * v[0] + cl * so * v[1] + sl * v[2];
    return { east, north, up, speed: Math.hypot(east, north), toward: (Math.atan2(east, north) / DEG + 360) % 360 };
  }

  // --- the low pattern's rise through its layer ---
  // metres since the epoch (the exact integral of its speed)
  rise(t) { return this.cfg.rise * t; }
  // Read whole, the rise would shrink the pattern sideways as it went (lower down a sphere is
  // smaller) and lose a float's precision: it is read in two phases half a period apart, each
  // weighted to nothing where it wraps, so the blend never jumps. a, b (m) and the weight of a
  // (riseWeight: 1 but within RISE.FADE of a period of a's wrap, where b is half a period from its own).
  risePhases(t) {
    const W = RISE.PERIOD, r = this.rise(t), a = r - W * Math.floor(r / W), b = (a + 0.5 * W) % W;
    return { a, b, wa: riseWeight(a) };
  }

  // All the shader needs at the clock t, into the arrays of makeSteerUniforms().
  uniforms(t, u = makeSteerUniforms()) {
    const M = this._M, w = [0, 0, 0], q = [0, 0, 0];
    for (let k = 0; k < STEER_LAYERS.length; k++) {
      this.motion(k, t, M);
      // (GLSL's mat3 is stored column by column: M^-1 = M^T column by column is M row by row)
      for (let i = 0; i < 9; i++) u.uSteerInv[9 * k + i] = M[i];
      mulMT(M, this.omega(k, t, w), q);
      u.uSteerSpin[4 * k] = q[0]; u.uSteerSpin[4 * k + 1] = q[1]; u.uSteerSpin[4 * k + 2] = q[2];
      u.uSteerSpin[4 * k + 3] = this.speed(k, t);
    }
    const r = this.risePhases(t);
    u.uSteerRise[0] = r.a; u.uSteerRise[1] = r.b; u.uSteerRise[2] = r.wa; u.uSteerRise[3] = this.cfg.rise;
    return u;
  }
}

// The same for a shader: declared from STEER_LAYERS, filled by Steer.uniforms(). p is a point
// in the planet's fixed axes (m; the march's uCamPlanetPos + dir t). What the functions give:
//   steerLow(p) .. steerCell(p): where p is in the layer's own axes (its pattern stands still
//     there: read the noise at it / scale and the pattern moves with that layer's wind);
//   steerLowA(p), steerLowB(p): the same for the low layer read at its two rise phases (blend
//     the two reads by uSteerRise.z for A; one read of A alone wraps once a period);
//   steerWindLow(q) ..: the wind at the place whose pattern point is q, in the layer's own axes
//     (m/s): to stretch a pattern along its wind.
const cap = (s) => s[0].toUpperCase() + s.slice(1);
export const STEER_GLSL = glslOnce('SKY_STEERING', [
  '// The steering of the cloud layers, made from src/weather/sky/steer.js (its constants; change it there).',
  ...STEER_LAYERS.map((n, k) => `#define STEER_${n.toUpperCase()} ${k}`),
  `uniform mat3 uSteerInv[${STEER_LAYERS.length}];    // each layer's M(t)^-1: the planet's axes to the layer's own`,
  `uniform vec4 uSteerSpin[${STEER_LAYERS.length}];   // xyz its turning in its own axes (rad/s), w its speed on its great circle (m/s)`,
  'uniform vec4 uSteerRise;       // the low rise: x, y its two phases (m), z the weight of x, w its speed (m/s)',
  ...STEER_LAYERS.map((n) => `vec3 steer${cap(n)}(vec3 p) { return uSteerInv[STEER_${n.toUpperCase()}] * p; }`),
  'vec3 steerRisen(vec3 p, float r) { return p * (1.0 - r / length(p)); }',
  'vec3 steerLowA(vec3 p) { return steerLow(steerRisen(p, uSteerRise.x)); }',
  'vec3 steerLowB(vec3 p) { return steerLow(steerRisen(p, uSteerRise.y)); }',
  ...STEER_LAYERS.map((n) => `vec3 steerWind${cap(n)}(vec3 q) { return cross(uSteerSpin[STEER_${n.toUpperCase()}].xyz, q); }`),
  '',
].join('\n'));
