// The rules the grass and the ground under it must agree on, written once: which flowers
// grow where (in JavaScript for the grass's tables and in GLSL, bit for bit the same, for
// the far ground), the colour of grass by how dry it is, and the waves the wind sends
// across a field. (When two places worked a rule out each for itself, they differed
// within a day: see CLAUDE.md.)
//
// Plain data and strings: no three.js here, so the ground's material can take the GLSL.

// How much grass a land-cover class has, and how dry it is (IGBP classes 1..17; 0: none known).
export const AMOUNT = [0, 0.6, 0.55, 0.6, 0.7, 0.65, 0.4, 0.3, 0.85, 0.9, 1, 0.9, 0.9, 0, 0.9, 0, 0.04, 0];
export const DRY = [0.5, 0.35, 0.1, 0.4, 0.25, 0.3, 0.75, 0.85, 0.6, 0.75, 0.8, 0.1, 0.45, 0.5, 0.4, 0.5, 0.9, 0.5];

// Flowers. Kinds: 1 daisies (white), 2 poppies (red), 3 lupins (blue spikes), 4 buttercups
// (yellow), 5 fireweed and heather (pink spikes), 6 orange poppies and marigolds,
// 7 the big pink flowers of the wet tropics. A flora: the kinds that grow there and how
// many (0..1 of the lattice at the heart of a drift). By land-cover class (the flora's
// number is the class's), then 18 tundra, 19 alpine meadows.
export const FLORA = [null, [[3, 5], 0.45], [[7, 1, 7], 0.5], [[5, 3], 0.45], [[3, 1, 4], 0.5], [[1, 3, 4], 0.5], [[6, 2], 0.4], [[6, 4], 0.3], [[4, 2], 0.45],
  [[4, 6], 0.45], [[1, 2, 4, 3], 0.8], [[5, 1, 4], 0.55], [[2, 1], 0.45], null, [[1, 2, 4], 0.7], null, [[6], 0.12], null,
  [[5, 1, 4], 0.5], [[3, 5, 1], 0.6]];
export const TUNDRA = 18, ALPINE = 19;

// Which flora grows at a place: class, latitude (degrees, unsigned), height (m), how much grass.
export function floraAt(cls, lat, h, amount) {
  if (amount < 0.1) return 0;
  const f = h > 2300 && lat < 50 ? ALPINE : lat > 58 && cls >= 6 ? TUNDRA : cls;
  return FLORA[f] ? f : 0;
}

// Smooth noise over the world's own coordinates (metres): the drifts stay where they are
// whatever the grass is anchored to. (Integer arithmetic, the same in the shaders.)
function hash3(x, y, z) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}

// The flowers at a place (X, Y, Z: planet-fixed metres) of a flora: kind + how many (0..0.9),
// or 0. A meadow has two or three kinds, one of them to a patch some 40 m across, in drifts
// some metres across with bare grass between.
export function flowersAt(X, Y, Z, flora) {
  const fl = FLORA[flora]; if (!fl) return 0;
  const which = noise3(X / 38, Y / 38, Z / 38), drift = noise3(X / 9 + 40, Y / 9, Z / 9), wide = noise3(X / 120, Y / 120 + 9, Z / 120);
  const many = fl[1] * Math.min(1, Math.max(0, (drift - 0.5) / 0.18)) * Math.min(1, Math.max(0.1, (wide - 0.35) / 0.25));
  if (many <= 0.01) return 0;
  const kinds = fl[0];
  return kinds[Math.min(kinds.length - 1, Math.floor(Math.min(0.999, Math.max(0, (which - 0.2) / 0.6)) * kinds.length))] + Math.min(0.9, many);
}

const f1 = (v) => v.toFixed(4);
// The same in GLSL. flowersAt(P, flora): vec2(kind, how many); P: planet-fixed metres.
export const FLOWERS_GLSL = /* glsl */`
  const int FLORA_N = ${FLORA.length};
  const ivec4 FLORA_KINDS[FLORA_N] = ivec4[FLORA_N](${FLORA.map((f) => { const k = f ? f[0] : [0]; return `ivec4(${[0, 1, 2, 3].map((i) => k[Math.min(i, k.length - 1)]).join(', ')})`; }).join(', ')});
  const float FLORA_MANY[FLORA_N] = float[FLORA_N](${FLORA.map((f) => f1(f ? f[1] : 0)).join(', ')});
  const int FLORA_COUNT[FLORA_N] = int[FLORA_N](${FLORA.map((f) => (f ? f[0].length : 1)).join(', ')});
  float flHash(uvec3 p) {
    uint h = (p.x * 374761393u) ^ (p.y * 668265263u) ^ (p.z * 1440662683u);
    h = (h ^ (h >> 13u)) * 1274126177u;
    return float(h ^ (h >> 16u)) / 4294967296.0;
  }
  float flNoise(vec3 p) {
    vec3 i = floor(p), f = p - i, u = f * f * (3.0 - 2.0 * f);
    uvec3 q = uvec3(ivec3(i));        // (the bits kept: negative places hash as they do in JavaScript)
    return mix(mix(mix(flHash(q), flHash(q + uvec3(1, 0, 0)), u.x), mix(flHash(q + uvec3(0, 1, 0)), flHash(q + uvec3(1, 1, 0)), u.x), u.y),
               mix(mix(flHash(q + uvec3(0, 0, 1)), flHash(q + uvec3(1, 0, 1)), u.x), mix(flHash(q + uvec3(0, 1, 1)), flHash(q + uvec3(1, 1, 1)), u.x), u.y), u.z);
  }
  vec2 flowersAt(vec3 P, int flora) {
    if (flora <= 0 || flora >= FLORA_N) return vec2(0.0);
    float drift = flNoise(P / 9.0 + vec3(40.0, 0.0, 0.0));
    float many = FLORA_MANY[flora] * clamp((drift - 0.5) / 0.18, 0.0, 1.0);
    if (many <= 0.01) return vec2(0.0);
    many *= clamp((flNoise(P / 120.0 + vec3(0.0, 9.0, 0.0)) - 0.35) / 0.25, 0.1, 1.0);
    if (many <= 0.01) return vec2(0.0);
    float which = flNoise(P / 38.0);
    int n = FLORA_COUNT[flora], k = min(n - 1, int(clamp((which - 0.2) / 0.6, 0.0, 0.999) * float(n)));
    return vec2(float(FLORA_KINDS[flora][k]), min(0.9, many));
  }
  // a flower's colour (own: 0..1, the flower's own number)
  vec3 petalColour(float kind, float own) {
    if (kind < 1.5) return mix(vec3(0.82, 0.82, 0.76), vec3(0.85, 0.78, 0.42), step(0.8, own));
    if (kind < 2.5) return mix(vec3(0.70, 0.045, 0.025), vec3(0.78, 0.13, 0.03), own);
    if (kind < 3.5) return mix(vec3(0.16, 0.14, 0.58), vec3(0.40, 0.20, 0.62), own);
    if (kind < 4.5) return mix(vec3(0.82, 0.60, 0.03), vec3(0.85, 0.72, 0.10), own);
    if (kind < 5.5) return mix(vec3(0.68, 0.16, 0.42), vec3(0.55, 0.22, 0.55), own);
    if (kind < 6.5) return mix(vec3(0.88, 0.36, 0.02), vec3(0.85, 0.52, 0.03), own);
    return mix(vec3(0.82, 0.08, 0.28), vec3(0.85, 0.80, 0.74), step(0.7, own));
  }`;

// The colour of grass: green to gold by how dry (0..1), dark at the foot (y 0) to the
// tip (y 1). And the waves the wind runs across a field: 0..1 where the wave is at a
// camera-relative place (the blades bow there and show their paler side).
// uGrassWave: xyz the way the waves run (planet axes) times their number per metre, w
// where they are at the camera (radians; worked out frame by frame: life/grass.js).
export const GRASS_GLSL = /* glsl */`
  uniform vec4 uGrassWave;
  vec3 grassColour(float dry, float y) {
    vec3 green = mix(vec3(0.035, 0.06, 0.02), vec3(0.11, 0.17, 0.045), y), gold = mix(vec3(0.10, 0.06, 0.02), vec3(0.33, 0.20, 0.045), y);
    return mix(green, gold, clamp(dry, 0.0, 1.0));
  }
  float grassWave(vec3 rel) { return sin(dot(rel, uGrassWave.xyz) + uGrassWave.w) * 0.5 + 0.5; }`;
// (the waves' number per metre: 18 m from crest to crest)
export const WAVE_K = 0.35;
// The ground's own grass: where it gives way to the map's colour (m from the eye), and how
// much of a drift's ground takes the flowers' colour at most (a tint: a meadow of daisies
// from above is grass with a dusting, not a white patch).
export const GRASS_GROUND = { far: [600, 2500], flowers: 0.5 };
