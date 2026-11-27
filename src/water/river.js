// A river that runs: how the ground's shader draws running water (terrainMaterial.js,
// "living water"). Where the water runs and how fast is not decided here: the tile worker
// works out the rivers (terrain/tiles/hydrology.js: flowSpeed is the one rule of a river's
// speed), the height code hands the flow on (DemSet.rivE / rivN, hs.flowE / flowN) and the
// patch builder writes it into the ground's normal map. This file is the picture of it.
//
// What is drawn, and why this way:
// - Lanes. A current draws its foam and its ripples out into lanes that run with it, round
//   every bend. A lane is a stripe across the flow, and a pattern in the ground's shader
//   must repeat with the 64 m detail tile (a patch knows its place in the tile only modulo
//   one tile): a stripe pattern does if it is a function of i * u + j * v with whole i and
//   j. So the lanes are a few sines of that, (i, j) being the whole-number pair nearest
//   RIVER_LANES cycles a tile across the flow; as the flow turns the pair changes, and the
//   four pairs round the exact one are blended by how near each is: lanes that part and
//   join through a bend instead of a seam across the river. No texture is read for them.
// - Standing waves. Fast water heaps up in ridges across the flow that stay where they are:
//   the same stripes turned a quarter, strong where the water is fast, white on their crests.
// - Dashes. What moves is the detail texture carried down stream at the flow's own speed:
//   it breaks the lanes into dashes that travel along them, and ripples the water. A
//   picture carried for ever by a flow that is faster in mid stream than at the banks is
//   torn to threads, so there are two of them, each carried for RIVER_T seconds from a
//   fresh start, half a turn apart, each faded out while it is put back and the other
//   shows (the usual flow map). The turn is a closed form of the clock (the waves' clock,
//   uWave.z, which wraps at 14 400 s: a whole number of turns), so nothing jumps.
// The texture is asked at a whole number of repeats a detail tile (RIVER_SCALE).
const DETAIL_TILE = 64;          // metres: the same number as terrainMaterial.js's (which imports this file)
export const FLOW_UNIT = 16;     // running water in the normal map: this many m/s of flow to one
export const RIVER_T = 3;        // seconds a picture is carried before it is put back
export const RIVER_SCALE = 3;    // repeats of the detail texture a tile: 21 m a repeat
export const RIVER_LANES = 14;   // lanes a tile across the flow: 4.6 m from lane to lane, and finer ones between
export const RIVER_STAND = 18;   // standing waves a tile along the flow, where it is fast: 3.6 m from crest to crest

export const RIVER_GLSL = /* glsl */`
// What the ground's normal map says of running water (chunkBuilder.js writes it: the normal
// x (1 + the river's share of the texel) + the flow x 2 x that share / FLOW_UNIT):
// the share of a pixel that is river (nothing on land and on still water, whose normal is
// of length one), and the flow there (m/s, along the ground). up: the vertical at the place.
float riverShare(vec3 n, vec3 up) { return clamp((dot(n, up) - 1.03) / 0.9, 0.0, 1.0); }
vec3 riverFlow(vec3 n, vec3 up) { return (n - up * dot(n, up)) * ${(FLOW_UNIT / 2).toFixed(1)}; }
// The lanes' profile across the flow (p: cycles), and its slope: three sines, the finer
// ones dropped where a pixel is too wide for them (h: x the second's share, y the third's).
vec2 riverLanes(float p, vec2 h) {
  float a = 6.2831853 * p;
  return vec2(sin(a) + h.x * 0.6 * sin(2.0 * a + 1.7) + h.y * 0.45 * sin(3.0 * a + 4.1),
              cos(a) + h.x * 1.2 * cos(2.0 * a + 1.7) + h.y * 1.35 * cos(3.0 * a + 4.1));
}
// Stripes that repeat with the detail tile, la cycles a tile along each axis (any direction,
// any number): the four whole-number pairs round la blended by how near each is (whole), or
// the nearest alone. x the profile, y its slope.
vec2 riverStripes(vec2 la, vec2 uv, vec2 hs, bool whole) {
  if (!whole) return riverLanes(dot(floor(la + 0.5), uv), hs);
  vec2 l0 = floor(la), lf = la - l0;
  vec4 w = vec4((1.0 - lf.x) * (1.0 - lf.y), lf.x * (1.0 - lf.y), (1.0 - lf.x) * lf.y, lf.x * lf.y);
  return (w.x * riverLanes(dot(l0, uv), hs) + w.y * riverLanes(dot(l0 + vec2(1.0, 0.0), uv) + 0.31, hs)
        + w.z * riverLanes(dot(l0 + vec2(0.0, 1.0), uv) + 0.67, hs) + w.w * riverLanes(dot(l0 + vec2(1.0, 1.0), uv) + 0.13, hs)) / sqrt(dot(w, w));
}
// uv: detail-tile coordinates, dux / duy their change a pixel; f: the flow (m/s) along the
// tile's two axes (dot products with them), g: the cosine between the axes; t: the clock (s);
// near: 1 where a ripple is wider than a pixel, 0 where it is not;
// meanB: the mean of the texture's third number; whole: all four pairs of lanes blended
// (the governor's 'water' step: the nearest pair alone).
// Returns xy the ripples' slope along the two axes (to be scaled by the world's ripple
// strength), z the foam of the lanes (0..1), w the speed (m/s).
vec4 riverRun(vec2 uv, vec2 dux, vec2 duy, vec2 f, float g, float t, float near, float meanB, bool whole) {
  // (the axes are not at right angles away from the middle of a cube face)
  vec2 f2 = vec2(f.x - g * f.y, f.y - g * f.x) / max(1.0 - g * g, 0.3);
  float sp = length(f2);
  if (sp < 0.02) return vec4(0.0, 0.0, 0.0, sp);
  const float S = ${RIVER_SCALE.toFixed(1)}, K = ${(RIVER_SCALE / DETAIL_TILE).toFixed(6)}, T = ${RIVER_T.toFixed(1)};
  // --- the lanes
  float fw = abs(dux.x) + abs(duy.x) + abs(dux.y) + abs(duy.y);          // tiles a pixel
  float seen = 1.0 - smoothstep(${(0.3 / RIVER_LANES).toFixed(5)}, ${(0.7 / RIVER_LANES).toFixed(5)}, fw);
  vec2 hs = vec2(1.0 - smoothstep(${(0.15 / RIVER_LANES).toFixed(5)}, ${(0.35 / RIVER_LANES).toFixed(5)}, fw), 1.0 - smoothstep(${(0.1 / RIVER_LANES).toFixed(5)}, ${(0.23 / RIVER_LANES).toFixed(5)}, fw));
  vec2 along = f2 / sp, across = vec2(-along.y, along.x);
  vec2 lane = seen > 0.0 ? riverStripes(across * ${RIVER_LANES.toFixed(1)}, uv, hs, whole) : vec2(0.0);
  // --- standing waves: where the water is fast it heaps up in ridges across the flow that
  // stay where they are while the water runs through them (the same kind of stripes, turned)
  float fast = smoothstep(1.8, 3.4, sp) * seen;
  vec2 stand = fast > 0.0 ? riverStripes(along * ${RIVER_STAND.toFixed(1)}, uv, hs, whole) : vec2(0.0);
  // --- the dashes and the ripples: the texture carried down stream
  vec3 s = vec3(0.0);
  if (near > 0.0) {
    vec2 gx = dux * S, gy = duy * S;
    float cyc = t / T, pa = fract(cyc), pb = fract(cyc + 0.5), wa = 1.0 - abs(2.0 * pa - 1.0), wb = 1.0 - wa;
    vec3 a = textureGrad(tDetail, uv * S - f2 * (K * T * (pa - 0.5)), gx, gy).rgb, b = textureGrad(tDetail, uv * S - f2 * (K * T * (pb - 0.5)) + vec2(0.37, 0.71), gx, gy).rgb;
    // (two pictures half shown each are flatter than one: the blend keeps its contrast)
    s = (a * wa + b * wb - vec3(0.5, 0.5, meanB)) / sqrt(wa * wa + wb * wb);
  }
  // ripples: hardly any in a pool, strong in fast water; and the lanes' own ridges, across the flow
  float amp = near * (0.12 + 0.4 * min(sp, 4.0));
  vec2 rip = s.rg * amp + across * (lane.y * seen * 0.22 * min(sp, 3.0)) + along * (stand.y * fast * 0.5);
  // foam: the lanes' crests, in dashes where the carried picture is bright, and the standing
  // waves' crests where a lane crosses them; far off, where no lane is seen, the share of
  // the water they cover
  float crest = smoothstep(0.45, 1.2, lane.x), dash = mix(1.0, smoothstep(-0.06, 0.04, s.b), near);
  float heap = fast * smoothstep(0.7, 1.4, stand.x) * smoothstep(-0.4, 0.6, lane.x);
  return vec4(rip, mix(0.11 + 0.14 * smoothstep(1.8, 3.4, sp), max(crest * dash, heap), seen), sp);
}
// The pale lines the current draws out: a faint thread of bubbles in slow water, white water
// as it quickens; none in a pool, and none in the shallows at the bank.
float riverFoam(vec4 run, float depth) {
  float k = 0.35 * smoothstep(0.25, 1.2, run.w) + 0.5 * smoothstep(2.2, 5.0, run.w);
  // (churned white at a fall's foot, and the fall itself one white sheet: at the top of what a speed can be)
  float churn = 0.6 * smoothstep(4.6, 5.5, run.w), sheet = smoothstep(5.8, 7.4, run.w);
  return max(mix(run.z, 1.0, churn) * k, 0.94 * sheet) * smoothstep(0.03, 0.12, depth);
}
// A river's own colour (not the sea's): its bed of wet stones through shallow water, a
// green-brown depth. (The sky on calm water is the mirror every water has.)
vec3 riverBody(float depth, float air) {
  vec3 through = exp(-vec3(0.55, 0.20, 0.16) * (depth * 2.3));
  vec3 body = vec3(0.20, 0.185, 0.14) * through + vec3(0.030, 0.062, 0.048) * (1.0 - through.g);
  // (from the air: one fade from pale green shallows to a dark green middle)
  // (teal, not the bed's grey: with the sky's sheen over it a grey river from the air was a road)
  return mix(body, mix(vec3(0.035, 0.085, 0.095), vec3(0.09, 0.20, 0.20), exp(-0.5 * depth)), air);
}`;
