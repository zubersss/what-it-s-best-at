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

// Flowers. A kind: its name, its habit, the size of a head (m), how tall it stands (m, in
// grass of middling height), how many petals a head has, two colours its petals range between,
// the colour of its middle, and whether it is pale (pale flowers tint the far ground least:
// a white patch from the air is snow or stone). Habits:
//   turf     a scatter of tiny heads down among the blades (clover, speedwell)
//   cup      petals round a middle, held up and toward whoever looks (daisy, buttercup, poppy; the large ones are the big single heads)
//   spike    florets one above another up the top of a tall stem (lupin, foxglove, fireweed)
//   umbel    a flat-topped spray of tiny florets on a tall stem (cow parsley, yarrow)
//   globe    a ball of florets on a stem (thrift, thistle, cotton grass, a dandelion's clock)
//   cushion  a low mound on the ground, specked with flowers (moss campion, saxifrage)
// The first seven keep the numbers they had (the ground's shader knows 1 as the pale one).
export const HABIT = { turf: 0, cup: 1, spike: 2, umbel: 3, globe: 4, cushion: 5 };
const K = (name, habit, size, stem, petals, a, b, mid, pale = false) => ({ name, habit: HABIT[habit], size, stem, petals, a, b, mid, pale });
export const KINDS = [null,
  K('daisy', 'cup', 0.034, 0.62, 10, [0.82, 0.82, 0.76], [0.85, 0.80, 0.68], [0.80, 0.52, 0.03], true),
  K('poppy', 'cup', 0.056, 0.70, 4, [0.70, 0.045, 0.025], [0.78, 0.13, 0.03], [0.03, 0.02, 0.03]),
  K('lupin', 'spike', 0.036, 0.90, 12, [0.16, 0.14, 0.58], [0.40, 0.20, 0.62], [0.50, 0.45, 0.70]),
  K('buttercup', 'cup', 0.028, 0.55, 5, [0.82, 0.60, 0.03], [0.85, 0.72, 0.10], [0.70, 0.50, 0.03]),
  K('fireweed', 'spike', 0.036, 1.10, 12, [0.68, 0.16, 0.42], [0.55, 0.22, 0.55], [0.70, 0.30, 0.50]),
  K('orange poppy', 'cup', 0.046, 0.50, 4, [0.88, 0.36, 0.02], [0.85, 0.52, 0.03], [0.75, 0.30, 0.02]),
  K('pink mallow', 'cup', 0.07, 0.80, 5, [0.82, 0.08, 0.28], [0.85, 0.42, 0.52], [0.85, 0.70, 0.10]),
  K('clover', 'turf', 0.013, 0.16, 12, [0.80, 0.80, 0.74], [0.80, 0.60, 0.66], [0.80, 0.80, 0.74], true),
  K('speedwell', 'turf', 0.011, 0.12, 12, [0.16, 0.26, 0.72], [0.30, 0.40, 0.80], [0.80, 0.80, 0.80]),
  K('cow parsley', 'umbel', 0.11, 1.10, 12, [0.84, 0.84, 0.78], [0.80, 0.82, 0.72], [0.84, 0.84, 0.78], true),
  K('yarrow', 'umbel', 0.07, 0.70, 12, [0.84, 0.78, 0.50], [0.82, 0.80, 0.66], [0.84, 0.78, 0.50], true),
  K('foxglove', 'spike', 0.05, 1.30, 12, [0.62, 0.14, 0.46], [0.72, 0.36, 0.60], [0.80, 0.60, 0.72]),
  K('balsamroot', 'cup', 0.10, 0.85, 12, [0.86, 0.62, 0.03], [0.86, 0.70, 0.06], [0.16, 0.08, 0.02]),
  K('cornflower', 'cup', 0.036, 0.70, 8, [0.10, 0.20, 0.70], [0.18, 0.26, 0.78], [0.20, 0.10, 0.40]),
  K('moss campion', 'cushion', 0.16, 0.00, 12, [0.70, 0.20, 0.46], [0.78, 0.36, 0.58], [0.10, 0.16, 0.05]),
  K('saxifrage', 'cushion', 0.13, 0.00, 12, [0.84, 0.84, 0.76], [0.84, 0.78, 0.40], [0.12, 0.17, 0.06], true),
  K('dandelion', 'cup', 0.03, 0.40, 12, [0.86, 0.68, 0.03], [0.86, 0.74, 0.06], [0.86, 0.66, 0.03]),
  K('thrift', 'globe', 0.028, 0.40, 12, [0.72, 0.30, 0.58], [0.60, 0.26, 0.66], [0.72, 0.30, 0.58]),
  K('gentian', 'cup', 0.03, 0.14, 5, [0.06, 0.10, 0.62], [0.10, 0.16, 0.72], [0.70, 0.70, 0.60]),
  K('ox-eye daisy', 'cup', 0.062, 0.75, 12, [0.84, 0.84, 0.78], [0.86, 0.84, 0.74], [0.82, 0.56, 0.03], true),
  K('sage', 'spike', 0.03, 0.50, 12, [0.38, 0.30, 0.62], [0.46, 0.40, 0.66], [0.46, 0.44, 0.52]),
  K('bluebell', 'spike', 0.028, 0.36, 8, [0.18, 0.20, 0.66], [0.28, 0.26, 0.72], [0.30, 0.30, 0.70]),
  K('primrose', 'cup', 0.03, 0.16, 5, [0.86, 0.80, 0.42], [0.86, 0.84, 0.56], [0.82, 0.60, 0.05], true),
  K('paintbrush', 'spike', 0.034, 0.45, 10, [0.82, 0.12, 0.03], [0.86, 0.28, 0.03], [0.80, 0.40, 0.05]),
  K('cotton grass', 'globe', 0.03, 0.50, 12, [0.86, 0.86, 0.82], [0.84, 0.84, 0.78], [0.86, 0.86, 0.82], true),
  K('thistle', 'globe', 0.034, 0.95, 12, [0.52, 0.20, 0.56], [0.62, 0.28, 0.60], [0.20, 0.30, 0.12]),
];
const kindOf = (name) => { const i = KINDS.findIndex((k) => k && k.name === name); if (i < 0) throw new Error('no flower called ' + name); return i; };

// A flora: the mix of a kind of land. `lead`: the kinds that take turns to lead, one to a
// patch some 100 m across (up to six); `turf`: a low kind scattered among whichever leads;
// `slope`: the kind that carpets a hillside by itself; `many`: how many of the lattice's
// places flower at the heart of a meadow (0..1); `rich`: the share of the land that is
// flower meadow (the rest is plain grass with a drift here and there).
const F = (name, lead, turf, slope, many, rich) => ({ name, lead: lead.map(kindOf), turf: turf ? kindOf(turf) : 0, slope: kindOf(slope), many, rich });
export const FLORAS = [null,
  F('conifer', ['fireweed', 'lupin', 'bluebell', 'foxglove'], 'speedwell', 'fireweed', 0.5, 0.28),
  F('rainforest', ['pink mallow', 'ox-eye daisy', 'thrift', 'pink mallow'], 'clover', 'pink mallow', 0.5, 0.3),
  F('larch', ['fireweed', 'lupin', 'paintbrush'], 'speedwell', 'fireweed', 0.45, 0.28),
  F('broadleaf', ['bluebell', 'primrose', 'cow parsley', 'foxglove', 'buttercup'], 'speedwell', 'bluebell', 0.55, 0.35),
  F('mixed', ['daisy', 'lupin', 'buttercup', 'foxglove', 'cow parsley'], 'clover', 'lupin', 0.5, 0.32),
  F('shrub', ['orange poppy', 'sage', 'poppy', 'paintbrush'], 'dandelion', 'sage', 0.4, 0.25),
  F('dry', ['orange poppy', 'sage', 'balsamroot', 'paintbrush', 'thistle'], 'dandelion', 'orange poppy', 0.4, 0.24),
  F('glade', ['foxglove', 'lupin', 'cow parsley', 'fireweed', 'bluebell', 'balsamroot'], 'primrose', 'lupin', 0.55, 0.36),
  F('parkland', ['lupin', 'balsamroot', 'ox-eye daisy', 'paintbrush', 'buttercup', 'cornflower'], 'clover', 'balsamroot', 0.6, 0.38),
  F('steppe', ['poppy', 'cornflower', 'buttercup', 'daisy', 'yarrow', 'orange poppy'], 'clover', 'poppy', 0.8, 0.4),
  F('wetland', ['fireweed', 'cotton grass', 'buttercup', 'cow parsley', 'thrift'], 'speedwell', 'cotton grass', 0.55, 0.35),
  F('crop', ['poppy', 'cornflower', 'daisy'], 'clover', 'poppy', 0.45, 0.2),
  F('farm', ['daisy', 'poppy', 'buttercup', 'cow parsley'], 'clover', 'buttercup', 0.7, 0.35),
  F('barren', ['orange poppy', 'dandelion'], null, 'orange poppy', 0.15, 0.1),
  F('tundra', ['cotton grass', 'fireweed', 'thrift', 'buttercup', 'moss campion'], 'saxifrage', 'moss campion', 0.5, 0.32),
  F('alpine', ['gentian', 'moss campion', 'ox-eye daisy', 'buttercup', 'thrift', 'lupin'], 'saxifrage', 'moss campion', 0.65, 0.42),
];
export const floraNamed = (name) => { const i = FLORAS.findIndex((f) => f && f.name === name); if (i < 0) throw new Error('no flora called ' + name); return i; };

// Which flora grows where: a world's own table (`life.flowers` in its file), or this one.
// `byClass`: the flora of each land-cover class; `rules`: the first that fits takes its
// place: `above`/`below` (m over the datum), `latAbove`/`latBelow` (degrees from the
// equator), `fromClass` (this class number and higher), `overLine` (m above the world's
// tree line, `life.trees.line`).
export const DEFAULT_FLOWERS = {
  byClass: { 1: 'conifer', 2: 'rainforest', 3: 'larch', 4: 'broadleaf', 5: 'mixed', 6: 'shrub', 7: 'dry', 8: 'glade', 9: 'parkland', 10: 'steppe', 11: 'wetland', 12: 'crop', 14: 'farm', 16: 'barren' },
  rules: [{ above: 2300, latBelow: 50, flora: 'alpine' }, { latAbove: 58, fromClass: 6, flora: 'tundra' }],
};
// A table made ready: names turned to numbers once. line: the world's tree line ({ base, perDeg }) or null.
export function flowerTable(def = DEFAULT_FLOWERS, line = null) {
  const byClass = new Uint8Array(32);
  for (const c in def.byClass || {}) byClass[+c] = floraNamed(def.byClass[c]);
  return { byClass, rules: (def.rules || []).map((r) => ({ ...r, flora: floraNamed(r.flora) })), line };
}
const DEFAULT_TABLE = flowerTable();
// Which flora grows at a place: class, latitude (degrees, unsigned), height (m), how much grass.
export function floraAt(cls, lat, h, amount, table = DEFAULT_TABLE) {
  if (amount < 0.1) return 0;
  for (const r of table.rules) {
    if (r.above != null && !(h > r.above)) continue;
    if (r.below != null && !(h < r.below)) continue;
    if (r.latAbove != null && !(lat > r.latAbove)) continue;
    if (r.latBelow != null && !(lat < r.latBelow)) continue;
    if (r.fromClass != null && !(cls >= r.fromClass)) continue;
    if (r.overLine != null && !(table.line && h > table.line.base - (table.line.perDeg || 0) * lat + r.overLine)) continue;
    return r.flora;
  }
  return table.byClass[cls] || 0;
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
const sat = (x) => Math.min(1, Math.max(0, x));

// The flowers at a place (X, Y, Z: planet-fixed metres) of a flora: kind + how many
// (0..0.9), or 0. How abundant they are varies by place on purpose:
//   - flower meadows some hundreds of metres across (a share `rich` of the land), where one
//     kind after another carpets a hectare: full at a meadow's heart, in drifts toward its edge;
//   - round each meadow a fringe of single drifts some metres across, and beyond it plain grass;
//   - on some hillsides (slope: metres per metre) one kind alone over the whole slope.
// Which kind leads changes from patch to patch (some 100 m, with bent edges). `turf`: also scatter the
// flora's low kind among the leading one (the blades near the eye ask for this; the far
// ground and the far grass wear the leading kind alone).
export function flowersAt(X, Y, Z, flora, slope = 0, turf = false) {
  const fl = FLORAS[flora]; if (!fl) return 0;
  const meadow = noise3(X / 260 + 17, Y / 260, Z / 260 + 5), t0 = 0.64 - 0.28 * fl.rich;
  // (round a meadow a fringe where single drifts stand in plain grass; farther from one, nothing:
  // one noise settles most of the land, which matters to the ground's shader)
  const rich = sat((meadow - t0) / 0.07), fringe = sat((meadow - t0 + 0.11) / 0.06);
  let hill = 0;
  if (slope > 0.16) hill = sat((slope - 0.16) / 0.12) * sat((noise3(X / 420 + 5, Y / 420 + 3, Z / 420 + 11) - 0.5) / 0.08);
  if (fringe <= 0 && hill <= 0) return 0;
  const drift = noise3(X / 9 + 40, Y / 9, Z / 9);
  const many = fl.many * Math.max(rich * (0.45 + 0.75 * sat((drift - 0.25) / 0.4)), 0.5 * fringe * sat((drift - 0.6) / 0.15), 1.1 * hill);
  if (many <= 0.01) return 0;
  let kind;
  if (hill > 0.5) kind = fl.slope;
  else {
    // (patches with bent edges: blocks of 110 m, each of their three coordinates pushed about
    // by a wave of its own. By the levels of one smooth noise, the kinds lay in rings round
    // each other, the middle ones as thin bands; blocks unbent were a quilt of squares.)
    const n = fl.lead.length;
    kind = fl.lead[Math.min(n - 1, Math.floor(hash3(Math.floor(X / 110 + 0.45 * Math.sin(Y / 41 + Z / 67)), Math.floor(Y / 110 + 0.45 * Math.sin(Z / 37 + X / 59)), Math.floor(Z / 110 + 0.45 * Math.sin(X / 43 + Y / 61))) * n))];
    if (turf && fl.turf && hash3(Math.floor(X / 1.3), Math.floor(Y / 1.3), Math.floor(Z / 1.3)) < 0.28) kind = fl.turf;
  }
  return kind + Math.min(0.9, many);
}

const f1 = (v) => v.toFixed(4);
const v3 = (c) => `vec3(${c.map((x) => x.toFixed(3)).join(', ')})`;
const KN = KINDS.length, FN = FLORAS.length;
const kinds = (fn) => KINDS.map((k) => (k ? fn(k) : fn(KINDS[1]))).join(', ');
// The same in GLSL. flowersAt(P, flora): vec2(kind, how many); P: planet-fixed metres.
// With a third argument, the ground's slope there (metres per metre): the hillsides of one
// kind as well. (Without it the far ground does not know them: terrainMaterial.js may pass
// its slope when it likes.) The leading kind only, and of a pale kind less (see KINDS).
export const FLOWERS_GLSL = /* glsl */`
  const int FLORA_N = ${FN};
  const int KIND_N = ${KN};
  const int FLORA_LEAD[${FN * 6}] = int[${FN * 6}](${FLORAS.map((f) => [0, 1, 2, 3, 4, 5].map((i) => (f ? f.lead[Math.min(i, f.lead.length - 1)] : 0)).join(', ')).join(', ')});
  const int FLORA_COUNT[FLORA_N] = int[FLORA_N](${FLORAS.map((f) => (f ? f.lead.length : 1)).join(', ')});
  const int FLORA_SLOPE[FLORA_N] = int[FLORA_N](${FLORAS.map((f) => (f ? f.slope : 0)).join(', ')});
  const float FLORA_MANY[FLORA_N] = float[FLORA_N](${FLORAS.map((f) => f1(f ? f.many : 0)).join(', ')});
  const float FLORA_RICH[FLORA_N] = float[FLORA_N](${FLORAS.map((f) => f1(f ? 0.64 - 0.28 * f.rich : 2)).join(', ')});
  const vec4 KIND_SHAPE[KIND_N] = vec4[KIND_N](${kinds((k) => `vec4(${k.habit}.0, ${k.size.toFixed(3)}, ${k.stem.toFixed(2)}, ${k.petals}.0)`)});      // habit, a head's size (m), how tall (m), petals
  const vec3 KIND_MID[KIND_N] = vec3[KIND_N](${kinds((k) => v3(k.mid))});
  const vec3 KIND_A[KIND_N] = vec3[KIND_N](${kinds((k) => v3(k.a))});
  const vec3 KIND_B[KIND_N] = vec3[KIND_N](${kinds((k) => v3(k.b))});
  const float KIND_PALE[KIND_N] = float[KIND_N](${kinds((k) => (k.pale ? '1.0' : '0.0'))});
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
  vec2 flowersAt(vec3 P, int flora, float slope) {
    if (flora <= 0 || flora >= FLORA_N) return vec2(0.0);
    float meadow = flNoise(P / 260.0 + vec3(17.0, 0.0, 5.0)), t0 = FLORA_RICH[flora];
    float rich = clamp((meadow - t0) / 0.07, 0.0, 1.0), fringe = clamp((meadow - t0 + 0.11) / 0.06, 0.0, 1.0);
    float hill = 0.0;
    if (slope > 0.16) hill = clamp((slope - 0.16) / 0.12, 0.0, 1.0) * clamp((flNoise(P / 420.0 + vec3(5.0, 3.0, 11.0)) - 0.5) / 0.08, 0.0, 1.0);
    if (fringe <= 0.0 && hill <= 0.0) return vec2(0.0);
    float drift = flNoise(P / 9.0 + vec3(40.0, 0.0, 0.0));
    float many = FLORA_MANY[flora] * max(max(rich * (0.45 + 0.75 * clamp((drift - 0.25) / 0.4, 0.0, 1.0)), 0.5 * fringe * clamp((drift - 0.6) / 0.15, 0.0, 1.0)), 1.1 * hill);
    if (many <= 0.01) return vec2(0.0);
    int kind;
    if (hill > 0.5) kind = FLORA_SLOPE[flora];
    else {
      int n = FLORA_COUNT[flora];
      kind = FLORA_LEAD[flora * 6 + min(n - 1, int(flHash(uvec3(ivec3(floor(P / 110.0 + 0.45 * sin(P.yzx / vec3(41.0, 37.0, 43.0) + P.zxy / vec3(67.0, 59.0, 61.0)))))) * float(n)))];
    }
    return vec2(float(kind), min(0.9, many) * (kind > 1 && KIND_PALE[kind] > 0.5 ? 0.45 : 1.0));
  }
  vec2 flowersAt(vec3 P, int flora) { return flowersAt(P, flora, 0.0); }
  // a flower's colour (own: 0..1, the flower's own number)
  vec3 petalColour(float kind, float own) { int k = clamp(int(kind + 0.5), 0, KIND_N - 1); return mix(KIND_A[k], KIND_B[k], own); }`;

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
// `slope`: grass grows on ground up to the first slope (metres per metre) and none by the
// second: ONE rule for where the blades and clumps stand (life/grass.js, the tables' amount)
// and for where the ground wears the grass's colour (terrainMaterial.js). (The paint went
// by the ground's own soil-to-scree numbers once, 0.36 to 0.55 on Haven, and the tufts by
// 0.4 to 0.75: tufts on unpainted hillsides; then both by the ground's, and a steep meadow
// that had been a field of grass was bare ground with a tuft here and there.)
export const GRASS_GROUND = { far: [600, 2500], flowers: 0.5, slope: [0.45, 0.75] };
