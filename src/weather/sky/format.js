// The sky's snapshot: its layout and its encodings, in one place (docs/briefs/
// clouds-weather-plan.md, "THE SNAPSHOT"). A producer (the model, sky/model.js, or the test
// pattern, sky/stub.js) writes these bytes every SNAP_STEP seconds of game time; the GPU's
// textures and the CPU's at() decode the same bytes, the GPU through FIELD_GLSL and the CPU
// through the decoders here. Both are made from the constants below, and
// scripts/sky-format-test.mjs evaluates the GLSL's arithmetic in JS against the JS.
//
// Pure: no three, no DOM, no Math.random. It runs in a worker, on the main thread and in Node.
//
// THE MAPS (all in latitude and longitude: rows from north to south, row 0 at latitude 90;
// columns from longitude 0 eastward, as in the elevation map; a texel's centre is at
// ((i + 0.5) / width, (j + 0.5) / height) of the map. Bytes computed, never stored as JPEG, so
// no channel leaks into another.)
//   A, width x height, RGBA8:  R heap cover        0..1
//                              G sheet cover       0..1   (stratus, stratocumulus, rain deck)
//                              B base              m above the sea of the low cloud, BASE_STEP a step
//                              A sheet thickness   m, THICK_STEP a step
//   B, width x height, RGBA8:  R mid cover         0..1   (5 km: altocumulus, altostratus)
//                              G high cover        0..1   (9 km: cirrus, cirrostratus, anvils)
//                              B field rain        mm/h = 2^(byte / RAIN_K) - 1 (the cells' rain is not here)
//                              A wet ground        0..1   (the cells' rain included)
//   C, the small map, width/2 x height/2, RG8:
//                              R fog top           m above the sea, FOG_STEP a step (0: none above the sea)
//                              G country height    m above the sea, COUNTRY_STEP a step (the ground smoothed over 15 km)
// Plus the cell list (CELL) and the lens list (LENS), Float64Arrays of fixed-size records.
//
// HOW THEY ARE READ. The GPU binds A, B and C with LINEAR filtering, no mipmaps, REPEAT across
// longitude (S) and CLAMP_TO_EDGE across latitude (T), unflipped (FIELD_SAMPLING). The 'now'
// copies are mix(snapshot k, snapshot k + 1, f) written back to bytes (wxBlend, blendByte);
// a read filters those bytes and then decodes (wxRead + wxBase and the rest). The CPU does the
// same in fieldAt(): blend each texel to bytes, filter as the GPU does (sampleMap), decode.

export const FORMAT_VERSION = 1;

// s of game time between snapshots (a producer may space them wider while the clock runs fast)
export const SNAP_STEP = 120;
// a snapshot is uploaded, and the 'now' copies blended, in this many strips of rows a map
export const STRIPS = 16;

// Steps of the encodings: a byte times the step is the value.
export const ENC = Object.freeze({
  BASE_STEP: 25,       // m: A.B, the low cloud's base above the sea (0..6 375 m)
  THICK_STEP: 25,      // m: A.A, the sheet's thickness (0..6 375 m)
  RAIN_K: 60,          // B.B = RAIN_K * log2(1 + mm/h)  (0..18 mm/h; as Earth's rain map)
  FOG_STEP: 16,        // m: C.R, the fog's top above the sea (0..4 080 m)
  COUNTRY_STEP: 16,    // m: C.G, the country height above the sea (0..4 080 m)
});

// What each map holds, channel by channel (the names fieldAt() and makeField() use).
export const CHANNELS = Object.freeze({
  A: Object.freeze(['heap', 'sheet', 'base', 'thick']),
  B: Object.freeze(['mid', 'high', 'rain', 'wet']),
  C: Object.freeze(['fogTop', 'country']),
});

// The samplers' uniform names, the same in every shader that reads the field.
export const FIELD_UNIFORMS = Object.freeze({ A: 'tWxA', B: 'tWxB', C: 'tWxC' });

// How the textures are made and sampled (names, not three's constants: this file imports no three).
export const FIELD_SAMPLING = Object.freeze({
  minFilter: 'linear', magFilter: 'linear', mipmaps: false,
  wrapS: 'repeat', wrapT: 'clamp-to-edge', flipY: false, type: 'unsigned-byte',
  formats: Object.freeze({ A: 'rgba', B: 'rgba', C: 'rg' }),
});

// The maps' sizes for a world: its file's weather.field.width (A and B; default 1 024, 1.53 km
// a texel on Haven; Earth's static snapshot is 2 048), height half of that unless given; the
// small map C half of each.
export function fieldLayout(world) {
  const f = (world && world.weather && world.weather.field) || {};
  const width = f.width || 1024, height = f.height || (width >> 1);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 2 || width % 2 || height % 2) throw new Error(`sky field: bad size ${width} x ${height}`);
  return Object.freeze({ width, height, cWidth: width >> 1, cHeight: height >> 1 });
}

// ---- the encodings ------------------------------------------------------------------------

const TWO_PI = 2 * Math.PI;
const BASE_M = 255 * ENC.BASE_STEP, THICK_M = 255 * ENC.THICK_STEP, RAIN_N = 255 / ENC.RAIN_K;
const FOG_M = 255 * ENC.FOG_STEP, COUNTRY_M = 255 * ENC.COUNTRY_STEP;

// a byte from a number of steps: rounded to nearest, clamped to 0..255; NaN gives 0
export const byte = (x) => (x > 0 ? (x >= 255 ? 255 : Math.round(x)) : 0);

// Value -> byte (for producers).
export const enc = Object.freeze({
  cover: (c) => byte(c * 255),
  base: (m) => byte(m / ENC.BASE_STEP),
  thick: (m) => byte(m / ENC.THICK_STEP),
  rain: (mmh) => byte(ENC.RAIN_K * Math.log2(1 + (mmh > 0 ? mmh : 0))),
  wet: (w) => byte(w * 255),
  fogTop: (m) => byte(m / ENC.FOG_STEP),
  country: (m) => byte(m / ENC.COUNTRY_STEP),
});

// Normalised value (what a GPU's texture read returns: byte / 255, or a filtered mean of
// them) -> value. The GLSL decoders below are the same arithmetic.
export const dec = Object.freeze({
  cover: (n) => n,
  base: (n) => n * BASE_M,
  thick: (n) => n * THICK_M,
  rain: (n) => Math.pow(2, n * RAIN_N) - 1,
  wet: (n) => n,
  fogTop: (n) => n * FOG_M,
  country: (n) => n * COUNTRY_M,
});

// The decoder of each channel, by map (in CHANNELS' order).
export const DECODERS = Object.freeze({
  A: Object.freeze([dec.cover, dec.cover, dec.base, dec.thick]),
  B: Object.freeze([dec.cover, dec.cover, dec.rain, dec.wet]),
  C: Object.freeze([dec.fogTop, dec.country]),
});

// Writing one texel (index i = row * width + column of its map).
export function putA(A, i, heap, sheet, base, thick) {
  const o = i * 4; A[o] = enc.cover(heap); A[o + 1] = enc.cover(sheet); A[o + 2] = enc.base(base); A[o + 3] = enc.thick(thick);
}
export function putB(B, i, mid, high, rain, wet) {
  const o = i * 4; B[o] = enc.cover(mid); B[o + 1] = enc.cover(high); B[o + 2] = enc.rain(rain); B[o + 3] = enc.wet(wet);
}
export function putC(C, i, fogTop, country) {
  const o = i * 2; C[o] = enc.fogTop(fogTop); C[o + 1] = enc.country(country);
}

// ---- places on the maps -------------------------------------------------------------------

// uv of a place (u in turns of longitude, wrapped by the sampler; v from the north pole).
export function uvOfLatLon(lat, lon, out = [0, 0]) { out[0] = lon / 360; out[1] = (90 - lat) / 180; return out; }
// ... of a direction in planet axes (z the spin axis, x toward longitude 0); any length. As wxUV.
export function uvOfDir(x, y, z, out = [0, 0]) {
  const r = Math.hypot(x, y, z) || 1, c = z / r;
  out[0] = Math.atan2(y, x) / TWO_PI; out[1] = Math.acos(c > 1 ? 1 : c < -1 ? -1 : c) / Math.PI; return out;
}
// A texel's centre: latitude and longitude (degrees).
export function texelLatLon(i, j, width, height, out = { lat: 0, lon: 0 }) {
  out.lon = (i + 0.5) * 360 / width; out.lat = 90 - (j + 0.5) * 180 / height; return out;
}

// The four texels a LINEAR read at uv takes from a map of w x h (REPEAT across longitude,
// CLAMP_TO_EDGE across latitude) and its weights: out = [i0, i1, j0, j1, fx, fy]; the texel
// (i1, j0) weighs fx * (1 - fy), and so on.
export function footprint(w, h, u, v, out) {
  const x = u * w - 0.5, y = v * h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y);
  const i0 = ((x0 % w) + w) % w;
  out[0] = i0; out[1] = (i0 + 1) % w;
  out[2] = y0 < 0 ? 0 : y0 > h - 1 ? h - 1 : y0; out[3] = y0 + 1 < 0 ? 0 : y0 + 1 > h - 1 ? h - 1 : y0 + 1;
  out[4] = x - x0; out[5] = y - y0;
  return out;
}
const _fp = new Float64Array(6);

// What a GPU's LINEAR filter returns from a map of `ch` bytes a texel (REPEAT across
// longitude, CLAMP_TO_EDGE across latitude) at uv, normalised to 0..1, into out[o .. o+ch-1].
// With `bytes1` and `f`, each texel is first blended between two snapshots and written back
// to a byte (blendByte), as the 'now' copies are.
export function sampleMap(bytes, w, h, ch, u, v, out, o = 0, bytes1 = null, f = 0) {
  footprint(w, h, u, v, _fp);
  const i0 = _fp[0], i1 = _fp[1], j0 = _fp[2], j1 = _fp[3], fx = _fp[4], fy = _fp[5];
  const a = (j0 * w + i0) * ch, b = (j0 * w + i1) * ch, c = (j1 * w + i0) * ch, d = (j1 * w + i1) * ch;
  const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
  for (let k = 0; k < ch; k++) {
    let ba = bytes[a + k], bb = bytes[b + k], bc = bytes[c + k], bd = bytes[d + k];
    if (bytes1) { ba = blendByte(ba, bytes1[a + k], f); bb = blendByte(bb, bytes1[b + k], f); bc = blendByte(bc, bytes1[c + k], f); bd = blendByte(bd, bytes1[d + k], f); }
    out[o + k] = (wa * ba + wb * bb + wc * bc + wd * bd) / 255;
  }
  return out;
}

// The 'now' copy of one byte: mix(snapshot k, snapshot k + 1, f) of the normalised values,
// written back to a byte (wxBlend into a target of bytes; round to nearest).
export const blendByte = (b0, b1, f) => byte(((b0 / 255) * (1 - f) + (b1 / 255) * f) * 255);

// ---- a snapshot ---------------------------------------------------------------------------

// An empty snapshot of a layout at time t (s since the weather epoch).
export function makeSnapshot(layout, t) {
  const { width, height, cWidth, cHeight } = layout;
  return {
    version: FORMAT_VERSION, t, width, height, cWidth, cHeight,
    A: new Uint8Array(width * height * 4), B: new Uint8Array(width * height * 4), C: new Uint8Array(cWidth * cHeight * 2),
    cells: new Float64Array(0), lenses: new Float64Array(0),
  };
}
// What a worker hands over without copying.
export const snapshotTransfer = (s) => [s.A.buffer, s.B.buffer, s.C.buffer, s.cells.buffer, s.lenses.buffer];
// Throws unless s is a snapshot of this format (sizes, version, whole records).
export function checkSnapshot(s) {
  const bad = (w) => { throw new Error(`sky snapshot: ${w}`); };
  if (!s || s.version !== FORMAT_VERSION) bad(`version ${s && s.version}, not ${FORMAT_VERSION}`);
  if (!(s.A instanceof Uint8Array) || s.A.length !== s.width * s.height * 4) bad('A is not width x height x 4 bytes');
  if (!(s.B instanceof Uint8Array) || s.B.length !== s.width * s.height * 4) bad('B is not width x height x 4 bytes');
  if (!(s.C instanceof Uint8Array) || s.C.length !== s.cWidth * s.cHeight * 2 || s.cWidth * 2 !== s.width || s.cHeight * 2 !== s.height) bad('C is not (width/2) x (height/2) x 2 bytes');
  if (!(s.cells instanceof Float64Array) || s.cells.length % CELL.STRIDE) bad('cells are not whole records');
  if (!(s.lenses instanceof Float64Array) || s.lenses.length % LENS.STRIDE) bad('lenses are not whole records');
  return s;
}

// The decoded field: what the bytes say at one place (fieldAt's output).
export function makeField() {
  return { heap: 0, sheet: 0, base: 0, thick: 0, mid: 0, high: 0, rain: 0, wet: 0, fogTop: 0, country: 0 };
}

const _n = new Float64Array(4);
// The field at a place (uv: uvOfLatLon or uvOfDir) between two snapshots, f of the way from
// s0 to s1 (s1 null: s0 alone): each texel blended to a byte, filtered as the GPU filters,
// decoded. The one CPU reader of the bytes; the GPU's is FIELD_GLSL.
export function fieldAt(s0, s1, f, u, v, out = makeField()) {
  const b = s1 && f > 0;
  sampleMap(s0.A, s0.width, s0.height, 4, u, v, _n, 0, b ? s1.A : null, f);
  out.heap = dec.cover(_n[0]); out.sheet = dec.cover(_n[1]); out.base = dec.base(_n[2]); out.thick = dec.thick(_n[3]);
  sampleMap(s0.B, s0.width, s0.height, 4, u, v, _n, 0, b ? s1.B : null, f);
  out.mid = dec.cover(_n[0]); out.high = dec.cover(_n[1]); out.rain = dec.rain(_n[2]); out.wet = dec.wet(_n[3]);
  sampleMap(s0.C, s0.cWidth, s0.cHeight, 2, u, v, _n, 0, b ? s1.C : null, f);
  out.fogTop = dec.fogTop(_n[0]); out.country = dec.country(_n[1]);
  return out;
}

// ---- the cell list ------------------------------------------------------------------------

// One storm cell a record of CELL.STRIDE numbers (Float64: times are seconds since the epoch).
// Where it is at t is the steering's (steer.js): M_cell(t) . M_cell(born)^-1 . the birth point,
// except a STILL cell, which stays at its birth point. How it lives is cellLife() below.
export const CELL = Object.freeze({
  STRIDE: 16,
  ID: 0,          // a whole number, unique in the world's weather
  SEED: 1,        // 0 .. 2^32 - 1: its own noise, its flashes, its strokes
  BORN: 2,        // s since the weather epoch
  X: 3, Y: 4, Z: 5,   // the birth point: a unit direction in planet axes
  RADIUS: 6,      // m: the mature tower's radius (2 500 .. 5 000)
  TOP: 7,         // m above the sea: the mature tower's top (6 500 .. 11 000; its dome stands 500 m higher)
  GROW: 8,        // s of growing (about 20 min)
  MATURE: 9,      // s mature (25 .. 40 min)
  DECAY: 10,      // s of decay (about 30 min)
  RAIN: 11,       // mm/h at its peak, in the core (15 .. 45)
  CORE: 12,       // the rain core's radius, a share of RADIUS (0.6)
  FLASH: 13,      // flashes a minute when mature (2 .. 12)
  SITE: 14,       // the trigger site's index; -1: none (a front, a debug cell)
  KIND: 15,       // CELL_KIND
});
export const CELL_KIND = Object.freeze({ HIGH_GROUND: 0, SEA_BREEZE: 1, FRONT: 2, STILL: 3 });

export function makeCellLife() {
  return { alive: false, age: 0, phase: -1, stage: 0, strength: 0, rise: 0, radius: 0, rain: 0, core: 0, flash: 0, end: 0 };
}
const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
// A cell's life at time t from its record (cells[o ..]):
//   alive, age (s), phase (0 growing, 1 mature, 2 decaying; -1 not alive), stage (0..3 through
//   the three phases), strength (0 at birth, 1 mature, 0 at death), rise (the tower's height
//   over its base, a share of the mature one's: top = base + rise * (TOP - base)), radius (m
//   now), rain (mm/h in the core now), core (m: the core's radius now), flash (a minute now),
//   end (s since the epoch: its death).
export function cellLife(cells, o, t, out = makeCellLife()) {
  const g = cells[o + CELL.GROW], m = cells[o + CELL.MATURE], d = cells[o + CELL.DECAY];
  const age = t - cells[o + CELL.BORN];
  out.age = age; out.end = cells[o + CELL.BORN] + g + m + d;
  out.alive = age >= 0 && age < g + m + d;
  if (!out.alive) { out.phase = -1; out.stage = age < 0 ? 0 : 3; out.strength = 0; out.rise = 0; out.radius = 0; out.rain = 0; out.core = 0; out.flash = 0; return out; }
  const R0 = cells[o + CELL.RADIUS];
  let s, rise, size, rain;
  if (age < g) {                       // growing: a heap that towers, rain from its last 40 %
    const x = age / g; out.phase = 0; out.stage = x; s = sstep(x);
    rise = 0.3 + 0.7 * s; size = 0.55 + 0.45 * s; rain = sstep((x - 0.6) / 0.4);
  } else if (age < g + m) {            // mature: full height, full rain, flashes
    out.phase = 1; out.stage = 1 + (age - g) / m; s = 1; rise = 1; size = 1; rain = 1;
  } else {                             // decaying: the tower sinks and spreads, the rain thins
    const x = (age - g - m) / d; out.phase = 2; out.stage = 2 + x; s = 1 - sstep(x);
    rise = 1 - 0.35 * sstep(x); size = 1 + 0.2 * x; rain = (1 - x) * (1 - x);
  }
  out.strength = s; out.rise = rise; out.radius = R0 * size;
  out.rain = cells[o + CELL.RAIN] * rain; out.core = cells[o + CELL.CORE] * out.radius;
  out.flash = out.phase === 1 ? cells[o + CELL.FLASH] : 0;
  return out;
}

// ---- the lens list ------------------------------------------------------------------------

// One lenticular a record of LENS.STRIDE numbers. Lenses stand still over the land.
export const LENS = Object.freeze({
  STRIDE: 10,
  ID: 0,
  X: 1, Y: 2, Z: 3,   // its middle: a unit direction in planet axes
  BASE: 4,        // m above the sea: the lowest plate's middle
  LENGTH: 5,      // m along the ridge (across the wind)
  WIDTH: 6,       // m along the wind
  HEADING: 7,     // radians: the bearing the mid wind blows toward (0 north, pi/2 east); the lens lies across it
  PLATES: 8,      // 1 .. 3 plates, stacked
  STRENGTH: 9,    // 0..1 at the snapshot's time (they grow and fade over 20-40 min)
});

// ---- what a place has (the producer's at()) -----------------------------------------------

// at(place, t, out) of every producer fills this. A place is { lat, lon, h } (degrees, m above
// the sea; without h, at the ground) or a planet-fixed position [x, y, z] in metres.
export function makeSkyAt() {
  return {
    field: makeField(),   // what the bytes say there (fieldAt), the two snapshots round t blended
    windE: 0, windN: 0,   // m/s: the ground wind, toward the east and the north, gusts included
    wind: 0,              // m/s: its speed
    gust: 1,              // the gusts' factor in it now (1: none)
    rain: 0,              // mm/h falling as rain at that height: none above the base it falls from
    snow: 0,              // mm/h (of water) falling as snow there
    temp: 0,              // degrees C at that height
    overcast: 0,          // 0..1: how much of the sky's light the cloud overhead takes
    storm: 0,             // 0..1: storm darkness overhead (a cell's)
    fog: 0,               // 1/m: the extinction of fog or cloud at that height (0: clear air)
    wet: 0,               // 0..1: the ground's wetness there
    base: 0,              // m above the sea: the base of the low cloud overhead
    top: 0,               // m above the sea: its top (a cell's tower where one stands overhead)
    cell: -1,             // the id of the cell overhead (its tower or its rain); -1: none
  };
}

// A strike (strikes(t0, t1) of every producer returns these, in time order; a window [t0, t1)
// split in two gives the same strikes as the whole).
//   { t: s since the epoch, cell: its id, ground: true for a stroke to the ground,
//     x, y, z: unit direction of its foot (or of the flash inside the cloud),
//     h0, h1: m above the sea, its bottom and top (a stroke to the ground ends on the ground:
//            h0 there is a guide, the height function says where), power: 0.6 .. 1.4, seed }

// ---- the GLSL -----------------------------------------------------------------------------

// a JS number as a GLSL float literal
const glf = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

// A shared GLSL text that a shader may be handed twice (the field's readers, the steering, the
// cells, the shared cloud rule: a shader that takes two of them gets their common parts twice):
// guarded, so its uniforms and functions are declared once. Every shared text of the sky is
// made with this (src/sky/skyGlsl.js, steer.js, cellShape.js).
export const glslOnce = (name, text) => `\n#ifndef ${name}\n#define ${name}\n${text}\n#endif\n`;

// The GLSL readers of the field: include where a shader reads A, B or C (it declares its own
// samplers, FIELD_UNIFORMS). wxRead works in vertex and fragment shaders (level 0: the maps
// have no mipmaps, so no seam where longitude wraps). d is a unit direction in planet axes.
// Each decoder is one line, `type name(args) { return expression; }`: the format test reads
// them back from this string and runs their arithmetic in JS against `dec`.
export const FIELD_GLSL = glslOnce('SKY_FIELD_DECODERS', /* glsl */ `
// The sky's snapshot fields (src/weather/sky/format.js, format ${FORMAT_VERSION}; made from its constants, edit them there).
// A: heap cover, sheet cover, base (m above the sea), sheet thickness (m).
// B: mid cover, high cover, field rain (mm/h), wet ground (0..1).
// C (RG): fog top (m above the sea), country height (m above the sea).
const float WX_INV_2PI = ${glf(1 / TWO_PI)};
const float WX_INV_PI = ${glf(1 / Math.PI)};
const float WX_BASE_M = ${glf(BASE_M)};
const float WX_THICK_M = ${glf(THICK_M)};
const float WX_RAIN_N = ${glf(RAIN_N)};
const float WX_FOG_M = ${glf(FOG_M)};
const float WX_COUNTRY_M = ${glf(COUNTRY_M)};
vec2 wxUV(vec3 d) { return vec2(atan(d.y, d.x) * WX_INV_2PI, acos(clamp(d.z, -1.0, 1.0)) * WX_INV_PI); }
vec4 wxRead(sampler2D m, vec3 d) { return textureLod(m, wxUV(d), 0.0); }
vec4 wxBlend(vec4 a, vec4 b, float f) { return mix(a, b, f); }
float wxHeap(vec4 a) { return a.r; }
float wxSheet(vec4 a) { return a.g; }
float wxBase(vec4 a) { return a.b * WX_BASE_M; }
float wxThick(vec4 a) { return a.a * WX_THICK_M; }
float wxMid(vec4 b) { return b.r; }
float wxHigh(vec4 b) { return b.g; }
float wxRain(vec4 b) { return exp2(b.b * WX_RAIN_N) - 1.0; }
float wxWet(vec4 b) { return b.a; }
float wxFogTop(vec4 c) { return c.r * WX_FOG_M; }
float wxCountry(vec4 c) { return c.g * WX_COUNTRY_M; }
`);

// Which GLSL decoder reads which channel (for the parity test and for readers' reference).
export const GLSL_DECODERS = Object.freeze({
  A: Object.freeze(['wxHeap', 'wxSheet', 'wxBase', 'wxThick']),
  B: Object.freeze(['wxMid', 'wxHigh', 'wxRain', 'wxWet']),
  C: Object.freeze(['wxFogTop', 'wxCountry']),
});
