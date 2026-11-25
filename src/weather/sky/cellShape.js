// A storm cell's shape, written once (docs/briefs/clouds-weather-plan.md, "Towering heaps
// growing into thunderstorms"): where its cloud is, how solid, where its rain falls, and where
// a ray enters and leaves it. The same rule in two forms made from the constants below: plain
// JS here (the model's wet ground, anvils and at(): rain at the eye, darkness overhead) and a
// GLSL string (CELL_GLSL, ANVIL_GLSL: the march near and far, the shade pass, the rain shafts,
// the high shell). scripts/sky-cell-test.mjs runs the GLSL's own text in JS against the JS.
//
// Pure: no three, no DOM, no Math.random. It runs in a worker, on the main thread and in Node.
// Everything is a function of the cell's state and the place asked about: nothing here knows
// where the traveller is, so a cell cannot move because the traveller moved.
//
// THE SHAPE, in the cell's own frame: up is the world's up at the cell's centre, the base a
// flat plane at the cell's base height there, and x, y across it along the cell's own axis
// (turned with the cell as it travels, so its noise travels with it).
//   - The tower: a round column of the cell's radius standing on the flat base, leaning with
//     the shear (each metre up, `tilt` metres downshear), capped by a dome (an ellipsoid as wide
//     as the column and DOME of its radius high, at most DOME_MAX of the tower's depth). Its top
//     (the dome's apex) is the state's top: it rises while the cell grows (format.js, cellLife).
//   - The overshooting dome: a small ellipsoid over the apex, OS_RADIUS of the radius wide, that
//     rises OS_HEIGHT over it while the cell is mature (by the stage) and sinks as it decays.
//   - How solid: 1 in the heart; from EDGE_IN of the way out to the hull it falls to 0 (that
//     band is what the noise eats into); the flat base fades in over BASE_SOFT. All of it times
//     the cell's strength (0 at birth and death: a cell never pops in or out).
//   - The rain shaft: under the base, a round column of the core's radius, drifting downwind as
//     it falls (`shaft` metres a metre of fall); full rain inside SHAFT_FULL of the core, none
//     beyond SHAFT_EDGE. None above the base.
//   - The footprint: the tower seen from straight above (the lean's whole length, the column's
//     radius), for cover and darkness overhead.
//   - The anvil (its own list: an anvil outlives its cell by 40 min): a flat fan at its level
//     (at most ANVIL_TOP, ANVIL_UNDER under its tower's mature top), ANVIL_THICK deep over the
//     tower and thinner downwind, from a neck over the tower (ANVIL_NECK of its far radius) to
//     its far end where the high wind has blown it.
// The hull (where the solidity is above 0) is made of quadric pieces in the cell's frame, so a
// ray's entry and exit are exact: cellChord. cellLight is the exact length inside the hull
// from a point toward the Sun.
//
// The flat frame: a plane tangent to the world at the cell's centre, not a sphere. Across a
// tower 5 km in radius leaning 2.4 km that is at most about 110 m of height on Haven (250 km in
// radius) and 4 m on Earth; the anvil, 30 km long, is laid on the true sphere instead.
//
// A CELL'S STATE (what cellGeometry takes: the cell at one time, its life already applied;
// format.js's cellLife gives the life, steer.js the place):
//   centre  [x, y, z] or { x, y, z }, or x, y, z on the state itself: the unit direction of the
//           cell's centre (planet axes) now
//   radius  m: the tower's radius now (cellLife's radius)
//   base    m above the sea: the base (the low cloud's base at the cell's place)
//   top     m above the sea: the tower's top now, the dome's apex (base + rise * (TOP - base))
//   stage   0..3: growing 0..1, mature 1..2, decaying 2..3 (cellLife's stage)
//   strength 0..1 (cellLife's strength)
//   tilt    [x, y, z] planet axes, tangent: the lean, m across a metre up (optional; 0)
//   age     s since birth (optional; 0): for the noise's boil
//   frame   [x, y, z] planet axes, tangent: the cell's own axis, turned with it from birth
//           (optional; east at the centre, which turns with latitude as the cell travels)
//   rain    mm/h in the core now (optional; 0); core: m, the rain core's radius now (optional;
//           CORE of the radius); shaft: [x, y, z] tangent, m downwind a metre of fall (optional; 0)
//   seed    0 .. 2^32 - 1 (optional; 0): the cell's own noise
//   id      (optional)
// AN ANVIL (anvilGeometry): from, to: unit directions of its root (over the tower's apex,
// cellApex) and of its far end's middle; level: m above the sea, its top (anvilLevel);
// radius: m, its far end's; strength 0..1.

export const CELL_SHAPE = Object.freeze({
  EDGE_IN: 0.55,      // the heart ends at this share of the way out; the edge fades from here to the hull
  BASE_SOFT: 120,     // m: the flat base fades in over this much height
  DOME: 0.85,         // the dome's height, a share of the radius ...
  DOME_MAX: 0.6,      // ... and at most this share of the tower's depth
  DEPTH_MIN: 200,     // m: the least tower over the base
  TILT_MAX: 0.8,      // m across a metre up: the most a tower leans
  OS_RADIUS: 0.3,     // the overshooting dome: its radius, a share of the tower's (small enough to start inside the dome)
  OS_SINK: 300,       // m: its middle under the apex
  OS_HEIGHT: 500,     // m: how far it stands over the apex at its full
  OS_RISE0: 0.8, OS_RISE1: 1.1,   // it rises between these stages (the end of growing) ...
  OS_SINK0: 1.9, OS_SINK1: 2.3,   // ... and sinks between these (the start of decay)
  CORE: 0.6,          // the rain core's radius, a share of the tower's, when a state names none
  SHAFT_FULL: 0.7,    // all of the core's rain inside this share of the core's radius ...
  SHAFT_EDGE: 1.15,   // ... and none beyond this
  SHAFT_MAX: 2,       // m a drop drifts a metre it falls, at most
  SHAFT_DEEP: 500,    // m under the sea at the cell: where the shaft's chord ends (the ground ends it sooner)
  ANVIL_TOP: 9500,    // m above the sea: an anvil's top, at most ...
  ANVIL_UNDER: 300,   // ... and this far under its tower's mature top
  ANVIL_THICK: 1000,  // m: its depth over the tower ...
  ANVIL_THIN: 0.6,    // ... thinning by this share to its far end
  ANVIL_NECK: 0.45,   // its radius over the tower, a share of its far radius
  ANVIL_EDGE_IN: 0.6, // its heart ends at this share of the way out
  ANVIL_SOFT: 150,    // m: its top and bottom fade over this much height
});

export const CELL_MAX = 8;      // cells a shader holds
export const CELL_VEC4 = 5;     // vec4s a cell
export const ANVIL_MAX = 12;    // anvils a shader holds
export const ANVIL_VEC4 = 2;    // vec4s an anvil
// The uniforms' names, the same in every shader that includes CELL_GLSL or ANVIL_GLSL.
export const CELL_UNIFORMS = Object.freeze({ cells: 'uCells', count: 'uCellCount', anvils: 'uAnvils', anvilCount: 'uAnvilCount' });

// What a ray misses: an empty stretch, (BIG, -BIG).
const BIG = 1e30;
const S = CELL_SHAPE;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- a cell's numbers ---------------------------------------------------------------------

const vec = (v, name) => {
  if (v == null) return null;
  const a = Array.isArray(v) || ArrayBuffer.isView(v) ? [v[0], v[1], v[2]] : [v.x, v.y, v.z];
  if (!a.every(Number.isFinite)) throw new Error(`cellShape: ${name} is not three numbers`);
  return a;
};
const need = (s, k) => { const v = s[k]; if (!Number.isFinite(v)) throw new Error(`cellShape: a cell's state needs ${k} (a number), not ${v}`); return v; };

// The cell's numbers, worked out once from its state (see the top of this file) and the
// world's radius (m). Every JS function below takes this, and packCells hands the same
// numbers to the GPU: { id, R, base, u0..u2 (up), w0 (the base plane: R + base), e0..e2 (its
// axis), f0..f2 (up x axis), r, te, tf (the lean along e and f), se, sf (the shaft's drift),
// D (depth: top - base), strength, stage, rain, core, age, seed (0..1) }.
export function cellGeometry(state, worldRadius) {
  if (!(worldRadius > 0)) throw new Error('cellShape: the world radius must be above 0');
  let u = vec(state.centre, 'centre') || vec(state, 'the centre (x, y, z)');
  const ul = Math.hypot(u[0], u[1], u[2]);
  if (!(ul > 0)) throw new Error('cellShape: the centre is not a direction');
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const radius = need(state, 'radius'), base = need(state, 'base'), top = need(state, 'top');
  const stage = need(state, 'stage'), strength = need(state, 'strength');
  // its own axis: the frame given, made level and whole; else east at the centre (else, at a
  // pole, the x axis or the y axis made level)
  let e = null;
  for (const c of [vec(state.frame, 'frame'), [-u[1], u[0], 0], [1, 0, 0], [0, 1, 0]]) {
    if (!c) continue;
    const cu = c[0] * u[0] + c[1] * u[1] + c[2] * u[2], l = [c[0] - u[0] * cu, c[1] - u[1] * cu, c[2] - u[2] * cu], ll = Math.hypot(l[0], l[1], l[2]);
    if (ll > 1e-6) { e = [l[0] / ll, l[1] / ll, l[2] / ll]; break; }
  }
  const f = [u[1] * e[2] - u[2] * e[1], u[2] * e[0] - u[0] * e[2], u[0] * e[1] - u[1] * e[0]];
  // a level vector as its parts along e and f, at most `max` long
  const level = (v, max) => {
    if (!v) return [0, 0];
    let a = v[0] * e[0] + v[1] * e[1] + v[2] * e[2], b = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
    const l = Math.hypot(a, b); if (l > max) { a *= max / l; b *= max / l; }
    return [a, b];
  };
  const [te, tf] = level(vec(state.tilt, 'tilt'), S.TILT_MAX), [se, sf] = level(vec(state.shaft, 'shaft'), S.SHAFT_MAX);
  const r = Math.max(radius, 1), seed = state.seed == null ? 0 : (Number(state.seed) >>> 0) / 4294967296;
  return {
    id: state.id ?? -1, R: worldRadius, base,
    u0: u[0], u1: u[1], u2: u[2], w0: worldRadius + base,
    e0: e[0], e1: e[1], e2: e[2], f0: f[0], f1: f[1], f2: f[2],
    r, te, tf, se, sf,
    D: Math.max(top - base, S.DEPTH_MIN), strength: Math.max(0, Math.min(1, strength)), stage,
    rain: Math.max(0, state.rain ?? 0), core: Math.max(state.core ?? S.CORE * r, 1), age: state.age ?? 0, seed,
  };
}

// The dome's height over the column, m.
export const cellDomeHeight = (r, D) => Math.min(S.DOME * r, S.DOME_MAX * D);
// How far the overshooting dome has risen (0..1), by the stage.
export const cellOvershoot = (stage) => ss(S.OS_RISE0, S.OS_RISE1, stage) * (1 - ss(S.OS_SINK0, S.OS_SINK1, stage));

// A point in the cell's own frame, the lean taken out: x along its axis, y across, z over its
// base (m). (The noise read here travels and leans with the tower.)
export function cellLocal(g, p, out = [0, 0, 0]) {
  const z = p[0] * g.u0 + p[1] * g.u1 + p[2] * g.u2 - g.w0;
  out[0] = p[0] * g.e0 + p[1] * g.e1 + p[2] * g.e2 - g.te * z;
  out[1] = p[0] * g.f0 + p[1] * g.f1 + p[2] * g.f2 - g.tf * z;
  out[2] = z;
  return out;
}
// The same for a direction (the linear part).
export function cellLocalDir(g, v, out = [0, 0, 0]) {
  const z = v[0] * g.u0 + v[1] * g.u1 + v[2] * g.u2;
  out[0] = v[0] * g.e0 + v[1] * g.e1 + v[2] * g.e2 - g.te * z;
  out[1] = v[0] * g.f0 + v[1] * g.f1 + v[2] * g.f2 - g.tf * z;
  out[2] = z;
  return out;
}

const _l = [0, 0, 0];
// How solid the cell is at p (planet axes, m): 0..1, 0 outside its hull; what the noise erodes.
export function cellDensity(g, p) {
  if (g.strength <= 0) return 0;
  const l = cellLocal(g, p, _l), x = l[0], y = l[1], z = l[2];
  if (z <= 0) return 0;
  const r = g.r, D = g.D, hd = cellDomeHeight(r, D), zd = D - hd;
  const q2 = x * x + y * y, rho2 = q2 / (r * r);
  const dz = z > zd ? (z - zd) / hd : 0;
  let env = (1 - ss(S.EDGE_IN, 1, Math.sqrt(rho2 + dz * dz))) * ss(0, S.BASE_SOFT, z);
  const ko = cellOvershoot(g.stage);
  if (ko > 0) {
    const ro = S.OS_RADIUS * r, ho = (S.OS_SINK + S.OS_HEIGHT) * ko, zo = (z - (D - S.OS_SINK)) / ho;
    env = Math.max(env, ko * (1 - ss(S.EDGE_IN, 1, Math.sqrt(q2 / (ro * ro) + zo * zo))));
  }
  return env * g.strength;
}

// Whether p is inside the hull (where cellDensity can be above 0): the tower and the
// overshooting dome. (For tests and for the model; the shaders need only the chords.)
export function cellInside(g, p) {
  if (g.strength <= 0) return false;
  const l = cellLocal(g, p, _l), x = l[0], y = l[1], z = l[2];
  const r = g.r, D = g.D, hd = cellDomeHeight(r, D), zd = D - hd, q2 = x * x + y * y;
  if (z >= 0 && (z <= zd ? q2 <= r * r : q2 / (r * r) + ((z - zd) / hd) ** 2 <= 1)) return true;
  const ko = cellOvershoot(g.stage);
  if (ko <= 0) return false;
  const ro = S.OS_RADIUS * r, ho = (S.OS_SINK + S.OS_HEIGHT) * ko;
  return q2 / (ro * ro) + ((z - (D - S.OS_SINK)) / ho) ** 2 <= 1;
}

// ---- stretches of a ray: (entry, exit), empty as (BIG, -BIG) ------------------------------

// the stretch of x(t) = xo + xd t (3 numbers each) inside the unit ball (as cellBall below)
function ball(xo0, xo1, xo2, xd0, xd1, xd2, out) {
  const a = xd0 * xd0 + xd1 * xd1 + xd2 * xd2;
  if (a < 1e-20) { const inside = xo0 * xo0 + xo1 * xo1 + xo2 * xo2 <= 1; out[0] = inside ? -BIG : BIG; out[1] = inside ? BIG : -BIG; return out; }
  const tc = -(xo0 * xd0 + xo1 * xd1 + xo2 * xd2) / a;
  const m0 = xo0 + xd0 * tc, m1 = xo1 + xd1 * tc, m2 = xo2 + xd2 * tc;
  let h = (1 - (m0 * m0 + m1 * m1 + m2 * m2)) / a;
  if (h < 0) { out[0] = BIG; out[1] = -BIG; return out; }
  h = Math.sqrt(h);
  out[0] = tc - h; out[1] = tc + h; return out;
}
// the stretch where zo + zd t >= h, and where it is <= h
function above(zo, zd, h, out) {
  if (Math.abs(zd) < 1e-12) { const ok = zo >= h; out[0] = ok ? -BIG : BIG; out[1] = ok ? BIG : -BIG; return out; }
  const t = (h - zo) / zd;
  if (zd > 0) { out[0] = t; out[1] = BIG; } else { out[0] = -BIG; out[1] = t; }
  return out;
}
function below(zo, zd, h, out) {
  if (Math.abs(zd) < 1e-12) { const ok = zo <= h; out[0] = ok ? -BIG : BIG; out[1] = ok ? BIG : -BIG; return out; }
  const t = (h - zo) / zd;
  if (zd > 0) { out[0] = -BIG; out[1] = t; } else { out[0] = t; out[1] = BIG; }
  return out;
}
// both (an empty one made (BIG, -BIG)), and the hull of either
function and(a, b, out) {
  const x = Math.max(a[0], b[0]), y = Math.min(a[1], b[1]);
  if (x > y) { out[0] = BIG; out[1] = -BIG; } else { out[0] = x; out[1] = y; }
  return out;
}
function or(a, b, out) { out[0] = Math.min(a[0], b[0]); out[1] = Math.max(a[1], b[1]); return out; }

const _lo = [0, 0, 0], _ld = [0, 0, 0], _a = [0, 0], _b = [0, 0], _c = [0, 0], _tw = [0, 0], _os = [0, 0];
// the tower's stretch (convex: one stretch) and the overshooting dome's, from the ray in the cell's frame
function towerChord(g, lo, ld, out) {
  const r = g.r, D = g.D, hd = cellDomeHeight(r, D), zd = D - hd;
  ball(lo[0] / r, lo[1] / r, 0, ld[0] / r, ld[1] / r, 0, _a);
  and(_a, and(above(lo[2], ld[2], 0, _b), below(lo[2], ld[2], zd, _c), _b), _a);         // the column
  ball(lo[0] / r, lo[1] / r, (lo[2] - zd) / hd, ld[0] / r, ld[1] / r, ld[2] / hd, _b);
  and(_b, above(lo[2], ld[2], zd, _c), _b);                                                // the dome
  return or(_a, _b, out);
}
function topChord(g, lo, ld, out) {
  const ko = cellOvershoot(g.stage);
  if (ko <= 0) { out[0] = BIG; out[1] = -BIG; return out; }
  const ro = S.OS_RADIUS * g.r, ho = (S.OS_SINK + S.OS_HEIGHT) * ko, c = g.D - S.OS_SINK;
  return ball(lo[0] / ro, lo[1] / ro, (lo[2] - c) / ho, ld[0] / ro, ld[1] / ro, ld[2] / ho, out);
}

// Where the ray o + dir t (planet axes, m; dir need not be whole) enters and leaves the cell's
// hull: [t0, t1], t anywhere on the line (clamp it to the march's own bounds); t0 > t1 when it
// misses. Exact: the tower is convex, and the overshooting dome's stretch is joined to it (a
// ray grazing between the dome's shoulder and the overshooting dome gets the stretch from one
// to the other, where cellDensity is 0).
export function cellChord(g, o, dir, out = [0, 0]) {
  if (g.strength <= 0) { out[0] = BIG; out[1] = -BIG; return out; }
  cellLocal(g, o, _lo); cellLocalDir(g, dir, _ld);
  towerChord(g, _lo, _ld, _tw); topChord(g, _lo, _ld, _os);
  return or(_tw, _os, out);
}

// The length of the hull (m) from p toward the Sun (toSun, whole): exactly the part inside,
// what the Sun's light crosses in the cell. 0 when p's ray to the Sun misses it.
export function cellLight(g, p, toSun) {
  if (g.strength <= 0) return 0;
  cellLocal(g, p, _lo); cellLocalDir(g, toSun, _ld);
  towerChord(g, _lo, _ld, _tw); topChord(g, _lo, _ld, _os);
  const a0 = Math.max(_tw[0], 0), b0 = Math.max(_os[0], 0);
  const both = Math.max(Math.min(_tw[1], _os[1]) - Math.max(a0, b0), 0);
  return Math.max(_tw[1] - a0, 0) + Math.max(_os[1] - b0, 0) - both;
}

// ---- rain -----------------------------------------------------------------------------------

// The rain at p (mm/h): under the base, in the core's column drifting downwind as it falls;
// none above the base.
export function cellRain(g, p) {
  if (g.rain <= 0) return 0;
  const z = p[0] * g.u0 + p[1] * g.u1 + p[2] * g.u2 - g.w0;
  if (z >= 0) return 0;
  const x = p[0] * g.e0 + p[1] * g.e1 + p[2] * g.e2 + g.se * z, y = p[0] * g.f0 + p[1] * g.f1 + p[2] * g.f2 + g.sf * z;
  return g.rain * (1 - ss(S.SHAFT_FULL, S.SHAFT_EDGE, Math.sqrt(x * x + y * y) / g.core));
}
// Where the ray enters and leaves the rain shaft (from the base down to SHAFT_DEEP under the
// sea at the cell): [t0, t1] as cellChord.
export function cellShaftChord(g, o, dir, out = [0, 0]) {
  if (g.rain <= 0) { out[0] = BIG; out[1] = -BIG; return out; }
  const zo = o[0] * g.u0 + o[1] * g.u1 + o[2] * g.u2 - g.w0, zd = dir[0] * g.u0 + dir[1] * g.u1 + dir[2] * g.u2;
  const rc = g.core * S.SHAFT_EDGE;
  const xo = (o[0] * g.e0 + o[1] * g.e1 + o[2] * g.e2 + g.se * zo) / rc, yo = (o[0] * g.f0 + o[1] * g.f1 + o[2] * g.f2 + g.sf * zo) / rc;
  const xd = (dir[0] * g.e0 + dir[1] * g.e1 + dir[2] * g.e2 + g.se * zd) / rc, yd = (dir[0] * g.f0 + dir[1] * g.f1 + dir[2] * g.f2 + g.sf * zd) / rc;
  ball(xo, yo, 0, xd, yd, 0, _a);
  and(_a, and(above(zo, zd, -(g.base + S.SHAFT_DEEP), _b), below(zo, zd, 0, _c), _b), out);
  return out;
}
// Whether p is in the shaft's column (the hull of cellShaftChord).
export function cellShaftInside(g, p) {
  if (g.rain <= 0) return false;
  const z = p[0] * g.u0 + p[1] * g.u1 + p[2] * g.u2 - g.w0;
  if (z > 0 || z < -(g.base + S.SHAFT_DEEP)) return false;
  const x = p[0] * g.e0 + p[1] * g.e1 + p[2] * g.e2 + g.se * z, y = p[0] * g.f0 + p[1] * g.f1 + p[2] * g.f2 + g.sf * z;
  return x * x + y * y <= (g.core * S.SHAFT_EDGE) ** 2;
}

// ---- seen from above ------------------------------------------------------------------------

// How much of the sky over a place the tower covers (0..1, times its strength): its column seen
// from straight above, along the whole lean. dir: the place's unit direction.
export function cellFootprint(g, dir) {
  if (g.strength <= 0) return 0;
  const cu = dir[0] * g.u0 + dir[1] * g.u1 + dir[2] * g.u2;
  if (cu < 0.5) return 0;
  const sc = g.w0 / cu;
  const x = (dir[0] * g.e0 + dir[1] * g.e1 + dir[2] * g.e2) * sc, y = (dir[0] * g.f0 + dir[1] * g.f1 + dir[2] * g.f2) * sc;
  const lx = g.te * g.D, ly = g.tf * g.D, l2 = lx * lx + ly * ly;
  const k = l2 > 1 ? Math.min(1, Math.max(0, (x * lx + y * ly) / l2)) : 0;
  const dx = x - lx * k, dy = y - ly * k;
  return g.strength * (1 - ss(S.EDGE_IN, 1, Math.sqrt(dx * dx + dy * dy) / g.r));
}

// The unit direction of the tower's apex (the axis at its top): where its anvil is rooted.
export function cellApex(g) {
  const k = g.w0 + g.D, a = g.te * g.D, b = g.tf * g.D;
  const p = [g.u0 * k + g.e0 * a + g.f0 * b, g.u1 * k + g.e1 * a + g.f1 * b, g.u2 * k + g.e2 * a + g.f2 * b];
  const l = Math.hypot(p[0], p[1], p[2]);
  return [p[0] / l, p[1] / l, p[2] / l];
}

// ---- the anvil ------------------------------------------------------------------------------

// The anvil's top (m above the sea) for a tower whose mature top is topMax.
export const anvilLevel = (topMax) => Math.min(S.ANVIL_TOP, topMax - S.ANVIL_UNDER);

// An anvil's numbers: { from, to: planet-axes points (m) at its level, radius, strength, L (R + level) }.
export function anvilGeometry(anvil, worldRadius) {
  const a = vec(anvil.from, 'from'), b = vec(anvil.to, 'to');
  if (!a || !b) throw new Error('cellShape: an anvil needs from and to');
  const level = need(anvil, 'level'), L = worldRadius + level;
  const la = Math.hypot(a[0], a[1], a[2]), lb = Math.hypot(b[0], b[1], b[2]);
  return {
    id: anvil.id ?? -1, L,
    a0: a[0] / la * L, a1: a[1] / la * L, a2: a[2] / la * L,
    b0: b[0] / lb * L, b1: b[1] / lb * L, b2: b[2] / lb * L,
    radius: Math.max(need(anvil, 'radius'), 1), strength: Math.max(0, Math.min(1, need(anvil, 'strength'))),
  };
}
// Where a direction falls on the anvil: f, how far along it (0 over the tower, 1 at the far
// end), and w, the distance from its middle line over its radius there.
function anvilPlace(A, d0, d1, d2) {
  const L = Math.sqrt(A.a0 * A.a0 + A.a1 * A.a1 + A.a2 * A.a2);
  const p0 = d0 * L - A.a0, p1 = d1 * L - A.a1, p2 = d2 * L - A.a2;
  const ab0 = A.b0 - A.a0, ab1 = A.b1 - A.a1, ab2 = A.b2 - A.a2;
  const f = Math.min(1, Math.max(0, (p0 * ab0 + p1 * ab1 + p2 * ab2) / Math.max(ab0 * ab0 + ab1 * ab1 + ab2 * ab2, 1)));
  const rr = A.radius * (S.ANVIL_NECK + (1 - S.ANVIL_NECK) * f);
  const q0 = p0 - ab0 * f, q1 = p1 - ab1 * f, q2 = p2 - ab2 * f;
  _ap[0] = f; _ap[1] = Math.sqrt(q0 * q0 + q1 * q1 + q2 * q2) / rr;
  return _ap;
}
const _ap = [0, 0];
// How much of the sky over a place (unit direction) the anvil covers, 0..1 times its strength.
export function anvilCover(A, dir) {
  if (A.strength <= 0) return 0;
  const l = Math.hypot(dir[0], dir[1], dir[2]), w = anvilPlace(A, dir[0] / l, dir[1] / l, dir[2] / l)[1];
  return A.strength * (1 - ss(S.ANVIL_EDGE_IN, 1, w));
}
// How solid the anvil is at p (0..1): its cover, between its top and its bottom.
export function anvilDensity(A, p) {
  if (A.strength <= 0) return 0;
  const rp = Math.hypot(p[0], p[1], p[2]), g = anvilPlace(A, p[0] / rp, p[1] / rp, p[2] / rp), f = g[0], w = g[1];
  const L = Math.sqrt(A.a0 * A.a0 + A.a1 * A.a1 + A.a2 * A.a2), h = rp - L, th = S.ANVIL_THICK * (1 - S.ANVIL_THIN * f);
  return A.strength * (1 - ss(S.ANVIL_EDGE_IN, 1, w)) * ss(-th, S.ANVIL_SOFT - th, h) * (1 - ss(-S.ANVIL_SOFT, 0, h));
}

// ---- to the GPU -----------------------------------------------------------------------------

// The uniforms of CELL_GLSL and ANVIL_GLSL as three takes them (plain objects: no three here).
export function makeCellUniforms() {
  return {
    [CELL_UNIFORMS.cells]: { value: new Float32Array(CELL_MAX * CELL_VEC4 * 4) }, [CELL_UNIFORMS.count]: { value: 0 },
    [CELL_UNIFORMS.anvils]: { value: new Float32Array(ANVIL_MAX * ANVIL_VEC4 * 4) }, [CELL_UNIFORMS.anvilCount]: { value: 0 },
  };
}
// Writes up to CELL_MAX cells (cellGeometry's) into a uCells array, the rest of it 0 (an empty
// slot is a cell of no strength); returns how many. The caller chooses which cells (and in
// what order: a cell's shape does not depend on its slot). Per cell, 5 vec4:
//   (up, R + base), (axis, radius), (lean along axis, lean across, shaft along, shaft across),
//   (depth, strength, stage, rain), (core, age, seed, base)
export function packCells(geoms, out = new Float32Array(CELL_MAX * CELL_VEC4 * 4)) {
  out.fill(0);
  const n = Math.min(geoms.length, CELL_MAX);
  for (let k = 0; k < n; k++) {
    const g = geoms[k], o = k * CELL_VEC4 * 4;
    out.set([g.u0, g.u1, g.u2, g.w0, g.e0, g.e1, g.e2, g.r, g.te, g.tf, g.se, g.sf, g.D, g.strength, g.stage, g.rain, g.core, g.age, g.seed, g.base], o);
  }
  return n;
}
// Writes up to ANVIL_MAX anvils (anvilGeometry's) into a uAnvils array; returns how many. Per
// anvil, 2 vec4: (root point, far radius), (far end's point, strength).
export function packAnvils(list, out = new Float32Array(ANVIL_MAX * ANVIL_VEC4 * 4)) {
  out.fill(0);
  const n = Math.min(list.length, ANVIL_MAX);
  for (let k = 0; k < n; k++) { const A = list[k]; out.set([A.a0, A.a1, A.a2, A.radius, A.b0, A.b1, A.b2, A.strength], k * ANVIL_VEC4 * 4); }
  return n;
}
// Fills the uniforms (makeCellUniforms') from lists of geometries.
export function setCellUniforms(uniforms, geoms = [], anvils = []) {
  uniforms[CELL_UNIFORMS.count].value = packCells(geoms, uniforms[CELL_UNIFORMS.cells].value);
  uniforms[CELL_UNIFORMS.anvilCount].value = packAnvils(anvils, uniforms[CELL_UNIFORMS.anvils].value);
  return uniforms;
}

// ---- the GLSL -------------------------------------------------------------------------------

// a JS number as a GLSL float literal
const glf = (x) => { const s = String(x); return x < 0 ? `(${/[.eE]/.test(s) ? s : s + '.0'})` : /[.eE]/.test(s) ? s : s + '.0'; };
const U = CELL_UNIFORMS, V = CELL_VEC4;

// Storm cells in a shader: the same functions as the JS above, cell k of uCells (0 ..
// uCellCount - 1; an empty slot draws nothing). p, o: planet-centred positions (m), as the march
// has them (uCamPlanetPos + dir * t). Gives:
//   float cellDensity(int k, vec3 p)              how solid, 0..1 (times the noise in the march)
//   vec2  cellChord(int k, vec3 o, vec3 dir)      the ray's entry and exit (x > y: a miss)
//   float cellLight(int k, vec3 p, vec3 toSun)    m of the cell between p and the Sun
//   vec3  cellLocal(int k, vec3 p)                p in the cell's own frame (for its noise)
//   float cellRain(int k, vec3 p)                 mm/h
//   vec2  cellShaftChord(int k, vec3 o, vec3 dir) the ray through the rain shaft
//   float cellFootprint(int k, vec3 dir)          cover over a place, seen from above
// and each cell's numbers: uCells[k * 5 + 3] = (depth, strength, stage, rain), uCells[k * 5 + 4]
// = (core, age, seed, base).
export const CELL_GLSL = /* glsl */`
// storm cells (made by src/weather/sky/cellShape.js from its constants; the JS there is the same rule)
uniform vec4 ${U.cells}[${CELL_MAX * V}];
uniform int ${U.count};
const float CELL_BIG = ${glf(BIG)};
// the stretch of xo + xd t inside the unit ball, or (BIG, -BIG)
vec2 cellBall(vec3 xo, vec3 xd) {
  float a = dot(xd, xd);
  if (a < 1e-20) return dot(xo, xo) <= 1.0 ? vec2(-CELL_BIG, CELL_BIG) : vec2(CELL_BIG, -CELL_BIG);
  float tc = -dot(xo, xd) / a;
  vec3 m = xo + xd * tc;
  float h = (1.0 - dot(m, m)) / a;
  if (h < 0.0) return vec2(CELL_BIG, -CELL_BIG);
  h = sqrt(h);
  return vec2(tc - h, tc + h);
}
// the stretch where zo + zd t is at least h, and where it is at most h
vec2 cellAbove(float zo, float zd, float h) {
  if (abs(zd) < 1e-12) return zo >= h ? vec2(-CELL_BIG, CELL_BIG) : vec2(CELL_BIG, -CELL_BIG);
  float t = (h - zo) / zd;
  return zd > 0.0 ? vec2(t, CELL_BIG) : vec2(-CELL_BIG, t);
}
vec2 cellBelow(float zo, float zd, float h) {
  if (abs(zd) < 1e-12) return zo <= h ? vec2(-CELL_BIG, CELL_BIG) : vec2(CELL_BIG, -CELL_BIG);
  float t = (h - zo) / zd;
  return zd > 0.0 ? vec2(-CELL_BIG, t) : vec2(t, CELL_BIG);
}
vec2 cellAnd(vec2 a, vec2 b) {
  vec2 c = vec2(max(a.x, b.x), min(a.y, b.y));
  return c.x > c.y ? vec2(CELL_BIG, -CELL_BIG) : c;
}
vec2 cellOr(vec2 a, vec2 b) { return vec2(min(a.x, b.x), max(a.y, b.y)); }
float cellDomeHeight(float r, float depth) { return min(${glf(S.DOME)} * r, ${glf(S.DOME_MAX)} * depth); }
float cellOvershoot(float stage) { return smoothstep(${glf(S.OS_RISE0)}, ${glf(S.OS_RISE1)}, stage) * (1.0 - smoothstep(${glf(S.OS_SINK0)}, ${glf(S.OS_SINK1)}, stage)); }
vec3 cellLocal(int k, vec3 p) {
  vec4 a = ${U.cells}[k * ${V}], b = ${U.cells}[k * ${V} + 1], c = ${U.cells}[k * ${V} + 2];
  vec3 f = cross(a.xyz, b.xyz);
  float z = dot(p, a.xyz) - a.w;
  return vec3(dot(p, b.xyz) - c.x * z, dot(p, f) - c.y * z, z);
}
vec3 cellLocalDir(int k, vec3 v) {
  vec4 a = ${U.cells}[k * ${V}], b = ${U.cells}[k * ${V} + 1], c = ${U.cells}[k * ${V} + 2];
  vec3 f = cross(a.xyz, b.xyz);
  float z = dot(v, a.xyz);
  return vec3(dot(v, b.xyz) - c.x * z, dot(v, f) - c.y * z, z);
}
float cellDensity(int k, vec3 p) {
  vec4 d = ${U.cells}[k * ${V} + 3];
  if (d.y <= 0.0) return 0.0;
  vec3 l = cellLocal(k, p);
  if (l.z <= 0.0) return 0.0;
  float r = ${U.cells}[k * ${V} + 1].w, hd = cellDomeHeight(r, d.x), zd = d.x - hd;
  float q2 = dot(l.xy, l.xy), rho2 = q2 / (r * r);
  float dz = l.z > zd ? (l.z - zd) / hd : 0.0;
  float env = (1.0 - smoothstep(${glf(S.EDGE_IN)}, 1.0, sqrt(rho2 + dz * dz))) * smoothstep(0.0, ${glf(S.BASE_SOFT)}, l.z);
  float ko = cellOvershoot(d.z);
  if (ko > 0.0) {
    float ro = ${glf(S.OS_RADIUS)} * r, ho = ${glf(S.OS_SINK + S.OS_HEIGHT)} * ko, zo = (l.z - (d.x - ${glf(S.OS_SINK)})) / ho;
    env = max(env, ko * (1.0 - smoothstep(${glf(S.EDGE_IN)}, 1.0, sqrt(q2 / (ro * ro) + zo * zo))));
  }
  return env * d.y;
}
// the tower's stretch (the column and its dome) and the overshooting dome's, the ray in the cell's frame
vec2 cellTowerChord(int k, vec3 lo, vec3 ld) {
  float r = ${U.cells}[k * ${V} + 1].w, depth = ${U.cells}[k * ${V} + 3].x, hd = cellDomeHeight(r, depth), zd = depth - hd;
  vec2 col = cellAnd(cellBall(vec3(lo.xy / r, 0.0), vec3(ld.xy / r, 0.0)), cellAnd(cellAbove(lo.z, ld.z, 0.0), cellBelow(lo.z, ld.z, zd)));
  vec2 dome = cellAnd(cellBall(vec3(lo.xy / r, (lo.z - zd) / hd), vec3(ld.xy / r, ld.z / hd)), cellAbove(lo.z, ld.z, zd));
  return cellOr(col, dome);
}
vec2 cellTopChord(int k, vec3 lo, vec3 ld) {
  vec4 d = ${U.cells}[k * ${V} + 3];
  float ko = cellOvershoot(d.z);
  if (ko <= 0.0) return vec2(CELL_BIG, -CELL_BIG);
  float ro = ${glf(S.OS_RADIUS)} * ${U.cells}[k * ${V} + 1].w, ho = ${glf(S.OS_SINK + S.OS_HEIGHT)} * ko, c = d.x - ${glf(S.OS_SINK)};
  return cellBall(vec3(lo.xy / ro, (lo.z - c) / ho), vec3(ld.xy / ro, ld.z / ho));
}
vec2 cellChord(int k, vec3 o, vec3 dir) {
  if (${U.cells}[k * ${V} + 3].y <= 0.0) return vec2(CELL_BIG, -CELL_BIG);
  vec3 lo = cellLocal(k, o), ld = cellLocalDir(k, dir);
  return cellOr(cellTowerChord(k, lo, ld), cellTopChord(k, lo, ld));
}
float cellLight(int k, vec3 p, vec3 toSun) {
  if (${U.cells}[k * ${V} + 3].y <= 0.0) return 0.0;
  vec3 lo = cellLocal(k, p), ld = cellLocalDir(k, toSun);
  vec2 tw = cellTowerChord(k, lo, ld), os = cellTopChord(k, lo, ld);
  float a0 = max(tw.x, 0.0), b0 = max(os.x, 0.0);
  float both = max(min(tw.y, os.y) - max(a0, b0), 0.0);
  return max(tw.y - a0, 0.0) + max(os.y - b0, 0.0) - both;
}
float cellRain(int k, vec3 p) {
  vec4 a = ${U.cells}[k * ${V}], b = ${U.cells}[k * ${V} + 1], c = ${U.cells}[k * ${V} + 2], d = ${U.cells}[k * ${V} + 3];
  if (d.w <= 0.0) return 0.0;
  float z = dot(p, a.xyz) - a.w;
  if (z >= 0.0) return 0.0;
  vec3 f = cross(a.xyz, b.xyz);
  vec2 q = vec2(dot(p, b.xyz) + c.z * z, dot(p, f) + c.w * z);
  return d.w * (1.0 - smoothstep(${glf(S.SHAFT_FULL)}, ${glf(S.SHAFT_EDGE)}, length(q) / ${U.cells}[k * ${V} + 4].x));
}
vec2 cellShaftChord(int k, vec3 o, vec3 dir) {
  vec4 a = ${U.cells}[k * ${V}], b = ${U.cells}[k * ${V} + 1], c = ${U.cells}[k * ${V} + 2], e = ${U.cells}[k * ${V} + 4];
  if (${U.cells}[k * ${V} + 3].w <= 0.0) return vec2(CELL_BIG, -CELL_BIG);
  vec3 f = cross(a.xyz, b.xyz);
  float zo = dot(o, a.xyz) - a.w, zd = dot(dir, a.xyz), rc = e.x * ${glf(S.SHAFT_EDGE)};
  vec3 xo = vec3(dot(o, b.xyz) + c.z * zo, dot(o, f) + c.w * zo, 0.0) / rc;
  vec3 xd = vec3(dot(dir, b.xyz) + c.z * zd, dot(dir, f) + c.w * zd, 0.0) / rc;
  return cellAnd(cellBall(xo, xd), cellAnd(cellAbove(zo, zd, -(e.w + ${glf(S.SHAFT_DEEP)})), cellBelow(zo, zd, 0.0)));
}
float cellFootprint(int k, vec3 dir) {
  vec4 a = ${U.cells}[k * ${V}], b = ${U.cells}[k * ${V} + 1], c = ${U.cells}[k * ${V} + 2], d = ${U.cells}[k * ${V} + 3];
  if (d.y <= 0.0) return 0.0;
  float cu = dot(dir, a.xyz);
  if (cu < 0.5) return 0.0;
  float sc = a.w / cu;
  vec2 q = vec2(dot(dir, b.xyz), dot(dir, cross(a.xyz, b.xyz))) * sc;
  vec2 lean = c.xy * d.x;
  float l2 = dot(lean, lean);
  float s = l2 > 1.0 ? clamp(dot(q, lean) / l2, 0.0, 1.0) : 0.0;
  return d.y * (1.0 - smoothstep(${glf(S.EDGE_IN)}, 1.0, length(q - lean * s) / b.w));
}
`;

// Anvils in a shader (the high shell's, or the march's): anvil k of uAnvils (0 .. uAnvilCount - 1).
//   float anvilCover(int k, vec3 dir)    cover over a place (unit direction), 0..1
//   float anvilDensity(int k, vec3 p)    how solid at p (planet-centred, m), 0..1
export const ANVIL_GLSL = /* glsl */`
// anvils (made by src/weather/sky/cellShape.js from its constants; the JS there is the same rule)
uniform vec4 ${U.anvils}[${ANVIL_MAX * ANVIL_VEC4}];
uniform int ${U.anvilCount};
// how far along the anvil a unit direction falls (0 over the tower, 1 at the far end), and its
// distance from the anvil's middle line over the anvil's radius there
vec2 anvilPlace(int k, vec3 n) {
  vec4 a = ${U.anvils}[k * ${ANVIL_VEC4}], b = ${U.anvils}[k * ${ANVIL_VEC4} + 1];
  vec3 pa = n * length(a.xyz) - a.xyz, ab = b.xyz - a.xyz;
  float f = clamp(dot(pa, ab) / max(dot(ab, ab), 1.0), 0.0, 1.0);
  float rr = a.w * (${glf(S.ANVIL_NECK)} + ${glf(1 - S.ANVIL_NECK)} * f);
  return vec2(f, length(pa - ab * f) / rr);
}
float anvilCover(int k, vec3 dir) {
  float s = ${U.anvils}[k * ${ANVIL_VEC4} + 1].w;
  if (s <= 0.0) return 0.0;
  return s * (1.0 - smoothstep(${glf(S.ANVIL_EDGE_IN)}, 1.0, anvilPlace(k, normalize(dir)).y));
}
float anvilDensity(int k, vec3 p) {
  vec4 a = ${U.anvils}[k * ${ANVIL_VEC4}];
  float s = ${U.anvils}[k * ${ANVIL_VEC4} + 1].w;
  if (s <= 0.0) return 0.0;
  float rp = length(p);
  vec2 g = anvilPlace(k, p / rp);
  float h = rp - length(a.xyz), th = ${glf(S.ANVIL_THICK)} * (1.0 - ${glf(S.ANVIL_THIN)} * g.x);
  return s * (1.0 - smoothstep(${glf(S.ANVIL_EDGE_IN)}, 1.0, g.y)) * smoothstep(-th, ${glf(S.ANVIL_SOFT)} - th, h) * (1.0 - smoothstep(${glf(-S.ANVIL_SOFT)}, 0.0, h));
}
`;
