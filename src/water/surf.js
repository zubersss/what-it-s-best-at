// Surf: the swell that comes in to a beach, lifts, breaks and washes up the sand. One rule
// for the ground's vertex shader (the surface lifts), its fragment shader (the line of
// foam, the wash on the sand) and the game (what swims rides it): terrainMaterial.js and
// app.js read it here.
//
// A swell slows as the water shoals (its speed is the root of g x depth), so its crests
// turn to lie along the shore whatever way they came, and crowd together toward it. That
// is all in one number here: where in its turn the swell is at a place, from the clock
// and the root of the depth there (the time a crest still needs to the shore, on a beach
// of a common slope). Crests are then lines of equal depth that move in. Along the shore
// the turn is put a little out of step by two long waves of the detail tile's own
// coordinates (whole numbers of cycles a tile: a patch knows its place in the tile only
// modulo one), so a crest does not reach a whole beach at one stroke. No texture is read.
// The clock is the waves' (uWave.z, wraps at 14 400 s): a whole number of periods.
export const SURF_PERIOD = 8;                       // seconds from crest to crest
const SHOAL = 10;                                   // radians of the turn a root-metre of depth: 25 m from crest to crest in 4 m of water on a beach of one in twenty
const TAU = 2 * Math.PI, OMEGA = TAU / SURF_PERIOD;
const IRR = [[1, 1, 1.1, 0], [-1, 2, 0.7, 1.3]];     // [i, j, radians, phase]: 45 m and 29 m along the shore

export const SURF_GLSL = /* glsl */`
// Where in its turn the swell is at a place: 0 as a crest passes, rising to 1 as the next
// comes. uv: detail-tile coordinates; depth: of the water there (m); t: the clock (s).
float surfTurn(vec2 uv, float depth, float t) {
  float irr = ${IRR.map(([i, j, a, p]) => `${a.toFixed(2)} * sin(6.2831853 * (${i.toFixed(1)} * uv.x + ${j.toFixed(1)} * uv.y) + ${p.toFixed(2)})`).join(' + ')};
  return fract((${OMEGA.toFixed(7)} * t + ${SHOAL.toFixed(1)} * sqrt(max(depth, 0.0)) + irr) * 0.1591549);
}
// How tall the breakers are (m) by the waves' height scale (waves.js, waveScale).
float surfHeight(float scale) { return 0.35 + 0.75 * scale; }
// How far the surface is lifted (m): the crest steepens as it comes in, stands tallest
// where it breaks (water about as deep as it is tall) and runs out as a low bore.
float surfLift(float p, float depth, float tall) {
  float c = 0.5 + 0.5 * cos(6.2831853 * p); c *= c * c;
  return tall * 0.8 * c * smoothstep(0.08, 0.7, depth) * (1.0 - smoothstep(2.0 * tall, 5.0 * tall + 2.0, depth));
}`;

// The same on the CPU (u, v: detail-tile coordinates: waves.js, detailUvAt).
export function surfTurn(u, v, depth, t) {
  let irr = 0; for (const [i, j, a, p] of IRR) irr += a * Math.sin(TAU * (i * u + j * v) + p);
  const x = (OMEGA * t + SHOAL * Math.sqrt(Math.max(depth, 0)) + irr) / TAU;
  return x - Math.floor(x);
}
export function surfHeight(scale) { return 0.35 + 0.75 * scale; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function surfLift(p, depth, tall) {
  let c = 0.5 + 0.5 * Math.cos(TAU * p); c *= c * c;
  return tall * 0.8 * c * sstep(0.08, 0.7, depth) * (1 - sstep(2 * tall, 5 * tall + 2, depth));
}
