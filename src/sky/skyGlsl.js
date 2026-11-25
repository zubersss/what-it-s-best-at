// The one shared shader rule for cloud cover and cloud shade (docs/briefs/clouds-weather-plan.md,
// step 0: version 0). Every shader that draws a cloud or is shaded by one takes its rule from
// here, and so does the JS that must agree with it (the parity test: scripts/sky-system-test.mjs).
// Package B owns this file after step 0; C builds its shade atlas on skyShade() and
// skyShadeLight(), whose signatures are fixed.
//
// Two parts:
//
// 1. The rule the game draws with today (moved here from sky/clouds.js), on the steering: the
//    day's cloud map, fair-weather fields, and heaps carved from the 3-D noise. The noise is
//    read where the low layer's pattern stands still, M_low(t)^-1 p (weather/sky/steer.js), so
//    the heaps go WITH the low wind at the day's speed, on the game clock, whether or not the
//    volume is drawn. (Before, p / scale + drift: the pattern went against the wind, and a
//    'change' term slid it along the planet's axis at six times the wind; the drift was added
//    up only while the volume was drawn, on the wall clock.) Readers: the volume
//    (cloudVolume.js), the far shell (clouds.js), the ground (terrainMaterial.js), the trees'
//    shade map (life/treeShade.js) and the far rocks (rocks/farRocks.js), all through the one
//    uniform SKY_UNIFORMS.uCloudSteer, filled once a frame by sky/skySystem.js.
//
// 2. The field's rule, version 0 (nothing on screen reads it yet): the low cloud from the
//    snapshot's maps (weather/sky/format.js, decoded by its FIELD_GLSL), carved by the same
//    noise in the same steering frame; and the cloud-shade atlas's four channels (skyShade) with
//    the reader that turns a texel into sunlight and skylight (skyShadeLight).
//
// The rise: the low pattern also rises through its layer at steer.js's `rise` (0.5 m/s), so a
// heap grows and fades in place as it goes (in the place of the old 'change' term, which slid
// the clouds along the planet's axis): skyLowNoise() reads the masses' noise where the pattern
// stood the rise's phase lower, blended with a second phase near the first's wrap (steer.js
// RISE, riseWeight). One number a frame, SKY_UNIFORMS.uCloudRise.x (m); the shared heap rule
// takes it as the fourth of its `vol` (uCloudVol.w on the ground, uVol.w on the shell), so no
// shader's uniform count grows. The smaller lobes and the wisps are read unrisen: they go with
// the wind and only the masses grow and fade.
//
// Every text here is guarded (format.js glslOnce): a shader may take two of them (the shared
// rule and the field's) and gets their common parts once. The uniforms they read are declared
// by guarded texts too (SKY_STEER_UNIFORM_GLSL, SKY_NOISE_UNIFORM_GLSL, SKY_RISE_UNIFORM_GLSL,
// SKY_FIELD_UNIFORMS_GLSL): a reader declares them through these, never by a line of its own.
//
// The steering in a shader: one unit quaternion of M_low(t)^-1 (four numbers: a uniform vec4
// takes the place the old vec3 drift had, so no shader's uniform count grows; the ground's
// vertex and fragment shaders are near a phone's limits). steerQuat() makes it from steer.js's
// matrix; skyToLow() turns a point with it; the test checks both against steer.inverse().
// (STEER_GLSL in steer.js has every layer as mat3 arrays, for shaders that want them all.)
//
// Pure: no three, no DOM, no Math.random (it is imported by Node tests).
import { FIELD_GLSL, ENC, glslOnce } from '../weather/sky/format.js';
import { RISE, riseWeight, makeSteerUniforms } from '../weather/sky/steer.js';
import { makeCellUniforms } from '../weather/sky/cellShape.js';

// a JS number as a GLSL float literal
const glf = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---- the steering -------------------------------------------------------------------------

// The quaternion (x, y, z, w; w >= 0) of the turning M^-1 = M^T, M row-major (steer.js's motion()).
export function steerQuat(M, out = new Float32Array(4)) {
  const n = (r, c) => M[c * 3 + r];           // N = M^T
  const tr = n(0, 0) + n(1, 1) + n(2, 2);
  let x, y, z, w;
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; w = 0.25 * S; x = (n(2, 1) - n(1, 2)) / S; y = (n(0, 2) - n(2, 0)) / S; z = (n(1, 0) - n(0, 1)) / S; }
  else if (n(0, 0) > n(1, 1) && n(0, 0) > n(2, 2)) { const S = Math.sqrt(1 + n(0, 0) - n(1, 1) - n(2, 2)) * 2; w = (n(2, 1) - n(1, 2)) / S; x = 0.25 * S; y = (n(0, 1) + n(1, 0)) / S; z = (n(0, 2) + n(2, 0)) / S; }
  else if (n(1, 1) > n(2, 2)) { const S = Math.sqrt(1 + n(1, 1) - n(0, 0) - n(2, 2)) * 2; w = (n(0, 2) - n(2, 0)) / S; x = (n(0, 1) + n(1, 0)) / S; y = 0.25 * S; z = (n(1, 2) + n(2, 1)) / S; }
  else { const S = Math.sqrt(1 + n(2, 2) - n(0, 0) - n(1, 1)) * 2; w = (n(1, 0) - n(0, 1)) / S; x = (n(0, 2) + n(2, 0)) / S; y = (n(1, 2) + n(2, 1)) / S; z = 0.25 * S; }
  const l = Math.hypot(x, y, z, w) * (w < 0 ? -1 : 1);
  out[0] = x / l; out[1] = y / l; out[2] = z / l; out[3] = w / l;
  return out;
}

// p turned by the quaternion q: the JS twin of skyToLow()
export function skyToLowJS(q, p, out = [0, 0, 0]) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3], px = p[0], py = p[1], pz = p[2];
  const tx = 2 * (qy * pz - qz * py), ty = 2 * (qz * px - qx * pz), tz = 2 * (qx * py - qy * px);
  out[0] = px + qw * tx + (qy * tz - qz * ty); out[1] = py + qw * ty + (qz * tx - qx * tz); out[2] = pz + qw * tz + (qx * ty - qy * tx);
  return out;
}

export const SKY_STEER_GLSL = glslOnce('SKY_TO_LOW', /* glsl */`
// Where the low layer's pattern stands still: p (planet axes, m, or a direction) turned back by
// the low layer's motion; q is SKY_UNIFORMS.uCloudSteer (src/sky/skyGlsl.js)
vec3 skyToLow(vec4 q, vec3 p) { vec3 t = 2.0 * cross(q.xyz, p); return p + q.w * t + cross(q.xyz, t); }`);

// The uniforms the shared texts read, each declared once however many texts a shader takes.
export const SKY_STEER_UNIFORM_GLSL = glslOnce('SKY_U_STEER', "uniform vec4 uCloudSteer;      // the low layer's motion as a quaternion of M_low(t)^-1 (src/sky/skyGlsl.js)");
export const SKY_NOISE_UNIFORM_GLSL = glslOnce('SKY_U_NOISE', "uniform highp sampler3D tCloudNoise;  // the clouds' noise (src/sky/cloudNoiseData.js)");
export const SKY_RISE_UNIFORM_GLSL = glslOnce('SKY_U_RISE', "uniform vec4 uCloudRise;       // the low pattern's rise: x its phase (m), y its weight, z its speed (m/s) (src/sky/skyGlsl.js)");

// ---- the uniforms every reader shares (one object each, never replaced; three takes the flat arrays)

export function makeSkyUniforms() {
  const st = makeSteerUniforms();
  return {
    // the clouds' noise, made once by the volume's worker and read by every shader that draws or
    // is shaded by cloud (sky/cloudNoiseData.js)
    tCloudNoise: { value: null },
    uCloudSteer: { value: new Float32Array([0, 0, 0, 1]) },     // the low layer's M^-1 as a quaternion (identity: no motion)
    uCloudRise: { value: new Float32Array([0, 1, 0, 0]) },       // the low pattern's rise (skyRiseOf): x its phase (m), y its weight, z its speed
    // the field's rule (part 2): x 1 / the noise's scale (1/m), y the world's radius (m), z how dark a
    // full cloud's shadow is (0..1), w 1 when there is a field (0: no cloud from it at all)
    uSkyLow: { value: new Float32Array([1 / 4200, 250000, 0.85, 0]) },
    tWxA: { value: null }, tWxB: { value: null }, tWxC: { value: null },      // the field's 'now' maps (sky/skyField.js)
    // every layer's steering, as steer.js's STEER_GLSL declares it (Steer.uniforms fills them each frame)
    uSteerInv: { value: st.uSteerInv }, uSteerSpin: { value: st.uSteerSpin }, uSteerRise: { value: st.uSteerRise },
    // the storm cells and anvils in reach, as cellShape.js's CELL_GLSL and ANVIL_GLSL declare them
    // (sky/skySystem.js fills them each frame from the field's cells, nearest first)
    ...makeCellUniforms(),
  };
}
export const SKY_UNIFORMS = makeSkyUniforms();

// ---- the numbers the low cloud's shapes are cut by -------------------------------------------

// (its GLSL and its JS twins are made from these; change them here. The first group is the rule
// as the game has drawn it; the second the forms the field's cover is cut into, which the volume,
// the far shell and the shade atlas all take from here.)
export const CLOUD_RULE = Object.freeze({
  FIELD_OFFSET: 0.31, CLUSTER_K: 0.2, CLUSTER_OFFSET: 0.83,     // where the fair-weather field and its clusters are read
  FAIR_MAX: 0.5, FAIR_M0: 0.55, FAIR_M1: 0.45, FAIR_M_EDGE: 0.5, // never a whole cover; more where the day's map has some
  FIELD0: 0.12, FIELD1: 0.34, CLUSTER0: 0.40, CLUSTER1: 0.56, FAIR_GAIN: 1.3 / 0.55,
  EDGE0: 0.08, EDGE1: 0.34,                                     // the map's cover: smoothstep(lo - EDGE0, lo + EDGE1, m)
  LOBE_K: 5.3, LOBE_OFFSET: 0.37, LOBE_AMP: 0.26,               // the smaller lobes that push a heap's outline in and out
  CUT: 0.85, FLOOR: 0.15, FLOOR_MIN: 0.2, GAIN: 2.2,            // the heap from the noise: clamp((n - (1 - c) CUT) / max(c CUT + FLOOR, FLOOR_MIN) GAIN)
  // the heap's dome (as the volume has drawn it): its top from the noise, and the rounded foot
  DOME_LO: 0.36, DOME_EDGE: 0.32, DOME_COVER: 0.4, FOOT: 0.1, CROWN: 0.14,
  // the lobes eat at the edges of the masses, not their hearts
  EAT: 0.4,
  // a sheet (stratus, stratocumulus, a rain deck): a flat base, a lumpy rolled top, even
  // through its depth; `SHEET_SQUASH` is how much the noise is squashed upright for it (its
  // lumps lie flat), `SHEET_BODY0/1` where a cover becomes a solid deck
  SHEET_TOP: 0.82, SHEET_LUMP: 0.3, SHEET_BASE: 0.04, SHEET_CROWN: 0.12, SHEET_SQUASH: 0.667,
  SHEET_BODY0: 0.02, SHEET_BODY1: 0.3,
});
const C = CLOUD_RULE;

// The forms: cover and noise in, how solid out. No texture read and nothing of the traveller:
// the volume reads the noise along its ray, the far shell and the shade atlas once at the
// height where the masses are widest, and all of them cut it by these.
export const SKY_FORM_GLSL = glslOnce('SKY_FORM', /* glsl */`
// the top of a heap cut from the noise n where the cover is c, as a share of the layer's depth
float skyHeapTop(float n, float c) {
  float over = n - (1.0 - c) * ${glf(C.CUT)};
  return mix(${glf(C.DOME_LO)}, 1.0, smoothstep(0.0, ${glf(C.DOME_EDGE)}, over)) * (1.0 - ${glf(C.DOME_COVER)} + ${glf(C.DOME_COVER)} * c);
}
// how solid a heap's body is where the noise reads n under a cover c (no profile: the height at
// which the masses are widest, as the far shell and the shade atlas read them)
float skyHeapBody(float n, float c) {
  return clamp((n - (1.0 - c) * ${glf(C.CUT)}) / max(c * ${glf(C.CUT)} + ${glf(C.FLOOR)}, ${glf(C.FLOOR_MIN)}) * ${glf(C.GAIN)}, 0.0, 1.0);
}
// A heap at the height y in its layer (0 base .. 1 top): rounded below, a dome over its middle
// (with one height for all, a sky full of them was a flat-topped deck).
float skyHeapAt(float n, float c, float y) {
  float top = skyHeapTop(n, c);
  float profile = smoothstep(0.0, ${glf(C.FOOT)}, y) * (1.0 - smoothstep(top - ${glf(C.CROWN)}, top, y));
  return skyHeapBody(n * profile, c);
}
// the smaller lobes (e: the noise's second channel) eating at a mass's edge, not its heart
float skyEdgeEat(float d, float e) {
  if (d <= 0.0) return d;
  return clamp((d - e * ${glf(C.EAT)} * (1.0 - d)) / (1.0 - ${glf(C.EAT)} * (1.0 - d) * e + 1e-3), 0.0, 1.0);
}
// A sheet of cover "sheet" whose own top is "share" of the layer's depth, at the height y:
// a flat base, a lumpy rolled top, the same through its depth.
float skySheetAt(float n, float sheet, float y, float share) {
  // (nothing where there is no sheet: a smoothstep whose two edges meet is not defined, and a
  // share of nothing met them)
  float body = smoothstep(${glf(C.SHEET_BODY0)}, ${glf(C.SHEET_BODY1)}, sheet);
  if (body <= 0.0 || share <= 0.001) return 0.0;
  float top = share * (${glf(C.SHEET_TOP)} + ${glf(C.SHEET_LUMP)} * n);
  return smoothstep(0.0, max(${glf(C.SHEET_BASE)} * share, 1e-3), y) * (1.0 - smoothstep(top - max(${glf(C.SHEET_CROWN)} * share, 1e-3), top, y)) * body;
}
// Where the noise is read for a place that is part heap and part sheet: the sheet squashes the
// pattern upright, so its lumps lie flat (one read serves both).
vec3 skyFormQ(vec3 q, vec3 up, float sheetShare) {
  return q - up * (dot(q, up) * ${glf(C.SHEET_SQUASH)} * sheetShare);
}`) + glslOnce('SKY_LOW_AT', /* glsl */`
// The whole of the low layer at one place, from ONE read of the noise (two while the rise crosses
// its wrap): the heaps and the sheet, with the smaller lobes eating at their edges. q is the place
// in the low pattern (noise units, skyFormQ of it where a sheet is there), r its distance from
// the world's centre (m), a the rise's phase, cover and sheet the field's two covers there, share
// the part of the layer's depth the sheet fills, y the height in the layer (0 base .. 1 top).
// The volume marches it, the far shell reads it where the masses are widest, and the shade atlas
// follows it toward the Sun: one rule.
float skyLowAt(highp sampler3D noise, vec3 q, float r, float a, float cover, float sheet, float share, float y, bool fine) {
  vec2 n = skyLowNoise2(noise, q, r, a);
  float d = max(skyHeapAt(n.x, cover, y), skySheetAt(n.x, sheet, y, share));
  return fine ? skyEdgeEat(d, n.y) : d;
}`);

// The JS twins of the forms (the parity test runs the GLSL above against these).
export const skyHeapTopJS = (n, c) => (C.DOME_LO + (1 - C.DOME_LO) * sstep(0, C.DOME_EDGE, n - (1 - c) * C.CUT)) * (1 - C.DOME_COVER + C.DOME_COVER * c);
export const skyHeapBodyJS = (n, c) => clamp((n - (1 - c) * C.CUT) / Math.max(c * C.CUT + C.FLOOR, C.FLOOR_MIN) * C.GAIN, 0, 1);
export function skyHeapAtJS(n, c, y) {
  const top = skyHeapTopJS(n, c), profile = sstep(0, C.FOOT, y) * (1 - sstep(top - C.CROWN, top, y));
  return skyHeapBodyJS(n * profile, c);
}
export const skyEdgeEatJS = (d, e) => (d <= 0 ? d : clamp((d - e * C.EAT * (1 - d)) / (1 - C.EAT * (1 - d) * e + 1e-3), 0, 1));
export function skySheetAtJS(n, sheet, y, share) {
  const body = sstep(C.SHEET_BODY0, C.SHEET_BODY1, sheet);
  if (body <= 0 || share <= 0.001) return 0;
  const top = share * (C.SHEET_TOP + C.SHEET_LUMP * n);
  return sstep(0, Math.max(C.SHEET_BASE * share, 1e-3), y) * (1 - sstep(top - Math.max(C.SHEET_CROWN * share, 1e-3), top, y)) * body;
}
export function skyLowAtJS(noise, q, r, a, cover, sheet, share, y, fine) {
  const n = skyLowNoise2JS(noise, q, r, a);
  const d = Math.max(skyHeapAtJS(n[0], cover, y), skySheetAtJS(n[0], sheet, y, share));
  return fine ? skyEdgeEatJS(d, n[1]) : d;
}
export function skyFormQJS(q, up, share) {
  const k = (q[0] * up[0] + q[1] * up[1] + q[2] * up[2]) * C.SHEET_SQUASH * share;
  return [q[0] - up[0] * k, q[1] - up[1] * k, q[2] - up[2] * k];
}

// ---- the rise ------------------------------------------------------------------------------

// Its numbers (the GLSL below is made from them): the noise's mean, about which a blend of two
// phases is stretched back to the spread of one (a blend of two reads is flatter than either,
// and the heaps cut from it would thin while the phases blend).
export const RISE_RULE = Object.freeze({ PERIOD: RISE.PERIOD, FADE: RISE.FADE, NOISE_MEAN: 0.339, NOISE_MEAN_G: 0.49 });
// What a frame hands the shaders: [phase (m), its weight, the rise's speed (m/s), 0] at the
// clock t (the clouds' noise clock) from the world's steering (steer.js); no steering: none.
export function skyRiseOf(steer, t, out = new Float32Array(4)) {
  if (!steer) { out[0] = 0; out[1] = 1; out[2] = 0; out[3] = 0; return out; }
  const ph = steer.risePhases(t);
  out[0] = ph.a; out[1] = ph.wa; out[2] = steer.cfg.rise; out[3] = 0;
  return out;
}
// Every read of the clouds' noise and of the field's maps along a ray goes through these two,
// so that a shader can be compiled to COUNT them: with SKY_COUNT_READS defined, each adds one to
// gSkyReads, and the march hands that number back (its reads a step, on real rays:
// scripts/cloud-cost.mjs). Without it they are the texture read itself.
// Every read of the clouds' noise and of the field's maps along a ray goes through these two, and
// each adds one to gSkyReads: a shader that hands that number back says how many reads a step it
// made, on real rays (the march under ?cloudreads=1; scripts/cloud-cost.mjs). A shader that never
// reads it is unchanged: the sum is dead code.
export const SKY_TEX_GLSL = glslOnce('SKY_TEX', /* glsl */`
// every read of the clouds' noise and of the field's maps along a ray, counted into gSkyReads
// (a shader that never reads that number is left exactly as it was: the sum is dead code).
float gSkyReads = 0.0;
vec4 skyTex3(highp sampler3D s, vec3 q) { gSkyReads += 1.0; return texture(s, q); }
vec4 skyTex2(sampler2D s, vec2 uv) { gSkyReads += 1.0; return textureLod(s, uv, 0.0); }`);
export const SKY_RISE_GLSL = SKY_TEX_GLSL + glslOnce('SKY_RISE', /* glsl */`
const float SKY_RISE_W = ${glf(RISE_RULE.PERIOD)};
const float SKY_RISE_FADE = ${glf(RISE_RULE.FADE)};
const float SKY_NOISE_MEAN = ${glf(RISE_RULE.NOISE_MEAN)};
// the weight of the rise's first phase a (m into its period): 1 but near its wrap (steer.js riseWeight)
float skyRiseWeight(float a) { float f = a / SKY_RISE_W; return smoothstep(0.0, SKY_RISE_FADE, f) * smoothstep(0.0, SKY_RISE_FADE, 1.0 - f); }
// The low pattern's masses (the noise's red) at the pattern point q (noise units) whose radius is
// r (m), risen by the phase a (m): read where q stood a metres lower; near a's wrap blended with
// the second phase, half a period on, and the blend stretched back to one read's spread.
// Both channels of one read: x the masses, y the smaller lobes that eat at their edges (one
// read, two in a fade; the lobes rise with the masses, so a heap's edge keeps its shape as
// it grows). The two are stretched back about their own means.
const vec2 SKY_NOISE_MEAN2 = vec2(SKY_NOISE_MEAN, ${glf(RISE_RULE.NOISE_MEAN_G)});
vec2 skyLowNoise2(highp sampler3D noise, vec3 q, float r, float a) {
  float wa = skyRiseWeight(a);
  vec2 n = vec2(0.0);
  if (wa > 0.0) n = wa * skyTex3(noise, q * (1.0 - a / r)).rg;
  if (wa < 1.0) {
    float b = mod(a + 0.5 * SKY_RISE_W, SKY_RISE_W);
    n += (1.0 - wa) * skyTex3(noise, q * (1.0 - b / r)).rg;
    n = SKY_NOISE_MEAN2 + (n - SKY_NOISE_MEAN2) * inversesqrt(wa * wa + (1.0 - wa) * (1.0 - wa));
  }
  return n;
}
float skyLowNoise(highp sampler3D noise, vec3 q, float r, float a) { return skyLowNoise2(noise, q, r, a).x; }`) + SKY_FORM_GLSL;
// its JS twin (noise: anything with sample([x, y, z]) -> [r, g, b, a], filtered as the GPU does)
export function skyLowNoise2JS(noise, q, r, a) {
  const wa = riseWeight(a), mean = [RISE_RULE.NOISE_MEAN, RISE_RULE.NOISE_MEAN_G];
  const n = [0, 0];
  if (wa > 0) { const k = 1 - a / r, v = noise.sample([q[0] * k, q[1] * k, q[2] * k]); n[0] = wa * v[0]; n[1] = wa * v[1]; }
  if (wa < 1) {
    const W = RISE_RULE.PERIOD, b = ((a + 0.5 * W) % W + W) % W, k = 1 - b / r, v = noise.sample([q[0] * k, q[1] * k, q[2] * k]);
    const g = 1 / Math.sqrt(wa * wa + (1 - wa) * (1 - wa));
    for (let i = 0; i < 2; i++) n[i] = mean[i] + (n[i] + (1 - wa) * v[i] - mean[i]) * g;
  }
  return n;
}
export const skyLowNoiseJS = (noise, q, r, a) => skyLowNoise2JS(noise, q, r, a)[0];

// ---- 1. the rule as drawn today -------------------------------------------------------------

// (its numbers: CLOUD_RULE, at the top of this file)

// Fair-weather cloud, where the day's map shows none (its pixels are 10 km: it never saw them):
// fields of small heaps with clear stretches between, and the fields themselves in clusters
// some tens of kilometres across with clear country between them. (Without the clusters, seen
// from high up one even field lay over the whole land: the same few heaps in rows to the
// horizon, since the noise they are cut from repeats every few kilometres.) Fixed to the
// ground, as before: the field model (package A) takes its place.
//   noise: the cloud volume's noise; up: the direction from the world's centre; k: the
//   world's radius in units of the field; fair: its cover; m: the day's map there.
//   Never a whole cover: fair weather has sky between its heaps.
export const FAIR_GLSL = glslOnce('SKY_FAIR', /* glsl */`
float fairCover(highp sampler3D noise, vec3 up, float k, float fair, float m) {
  float field = texture(noise, up * k + ${glf(C.FIELD_OFFSET)}).r, cluster = texture(noise, up * (k * ${glf(C.CLUSTER_K)}) + ${glf(C.CLUSTER_OFFSET)}).g;
  return min(${glf(C.FAIR_MAX)}, fair * (${glf(C.FAIR_M0)} + ${glf(C.FAIR_M1)} * smoothstep(0.0, ${glf(C.FAIR_M_EDGE)}, m)) * smoothstep(${glf(C.FIELD0)}, ${glf(C.FIELD1)}, field) * smoothstep(${glf(C.CLUSTER0)}, ${glf(C.CLUSTER1)}, cluster) * ${glf(C.FAIR_GAIN)});
}`);

// A heap of the cloud layer over a place, as the far shell draws it and as the ground, the
// trees and the far rocks are shaded by it: one rule.
//   noise: the cloud volume's noise; up: the direction from the world's centre; m: the day's
//   map there; lo: 1 - the layer's cover; fair: the fair-weather cover; vol: x 1 / the noise's
//   scale, y the fair-weather field's scale, z the radius at which the volume's masses are
//   widest, w the rise's phase (m, SKY_UNIFORMS.uCloudRise.x); steer: SKY_UNIFORMS.uCloudSteer;
//   fine: how much of the smaller lobes (0..1).
//   Returns x the heap (0..1), y the cover there (0..1).
export const HEAP_GLSL = SKY_STEER_GLSL + FAIR_GLSL + SKY_RISE_GLSL + glslOnce('SKY_HEAP', /* glsl */`
vec2 cloudHeap(highp sampler3D noise, vec3 up, float m, float lo, float fair, vec4 vol, vec4 steer, float fine) {
  float c = smoothstep(lo - ${glf(C.EDGE0)}, lo + ${glf(C.EDGE1)}, m);
  if (fair > 0.0) c = max(c, fairCover(noise, up, vol.y, fair, m));
  vec3 qv = skyToLow(steer, up) * (vol.z * vol.x);
  float n = skyLowNoise(noise, qv, vol.z, vol.w);
  if (fine > 0.0) n += (skyTex3(noise, qv * ${glf(C.LOBE_K)} + ${glf(C.LOBE_OFFSET)}).g - 0.5) * ${glf(C.LOBE_AMP)} * fine;
  return vec2(skyHeapBody(n, c), c);
}`);

// The JS twins (noise: anything with sample([x, y, z]) -> [r, g, b, a], filtered as the GPU does)
export function fairCoverJS(noise, up, k, fair, m) {
  const o = C.FIELD_OFFSET, field = noise.sample([up[0] * k + o, up[1] * k + o, up[2] * k + o])[0];
  const kc = k * C.CLUSTER_K, oc = C.CLUSTER_OFFSET, cluster = noise.sample([up[0] * kc + oc, up[1] * kc + oc, up[2] * kc + oc])[1];
  return Math.min(C.FAIR_MAX, fair * (C.FAIR_M0 + C.FAIR_M1 * sstep(0, C.FAIR_M_EDGE, m)) * sstep(C.FIELD0, C.FIELD1, field) * sstep(C.CLUSTER0, C.CLUSTER1, cluster) * C.FAIR_GAIN);
}
export function cloudHeapJS(noise, up, m, lo, fair, vol, steer, fine) {
  let c = sstep(lo - C.EDGE0, lo + C.EDGE1, m);
  if (fair > 0) c = Math.max(c, fairCoverJS(noise, up, vol[1], fair, m));
  const q = skyToLowJS(steer, up), s = vol[2] * vol[0];
  q[0] *= s; q[1] *= s; q[2] *= s;
  let n = skyLowNoiseJS(noise, q, vol[2], vol[3] ?? 0);
  if (fine > 0) { const k = C.LOBE_K, o = C.LOBE_OFFSET; n += (noise.sample([q[0] * k + o, q[1] * k + o, q[2] * k + o])[1] - 0.5) * C.LOBE_AMP * fine; }
  return [skyHeapBodyJS(n, c), c];
}

// ---- 2. the field's rule, version 0 -----------------------------------------------------------

// Its numbers (the GLSL below is made from them; change them here).
export const SKY_V0 = Object.freeze({
  HEAP_DEPTH: 600,        // m: a heap's depth at no cover ...
  HEAP_DEPTH_FULL: 2400,  // ... and how much more at full cover
  WIDEST: 0.35,           // the share of the low cloud's depth where the heaps are widest (the far shell stands there)
  SHADOW: 0.85,           // a full heap's shade before the world's strength (today's 0.85 smoothstep(0.06, 0.42, heap))
  CRISP0: 0.06, CRISP1: 0.42,
  MID_K: 1.2, HIGH_K: 0.35,   // the Sun through the mid and high layers: exp(-MID_K mid - HIGH_K high)
  SKY_K: 0.6,             // the sky's light under a whole low cover keeps 1 - SKY_K of it
  TOP_M: 16000,           // m above the sea that the atlas's fourth channel holds at 1 (a byte is 63 m)
  TOP_SOFT: 60,           // m: a lit thing this near the low cloud's top is half in its shade
  MU_MIN: 0.08,           // the Sun's height (sine) below which a ray is taken as this low
});

export const SKY_FIELD_UNIFORMS_GLSL = glslOnce('SKY_U_FIELD', /* glsl */`
uniform sampler2D tWxA, tWxB, tWxC;   // the field's 'now' maps (src/weather/sky/format.js; src/sky/skyField.js)
uniform vec4 uSkyLow;                 // x 1 / the noise's scale (1/m), y the world's radius (m), z the shadow's strength, w 1: a field is there`)
  + SKY_STEER_UNIFORM_GLSL + SKY_NOISE_UNIFORM_GLSL + SKY_RISE_UNIFORM_GLSL;

const V = SKY_V0;
// (its uniforms, FIELD_GLSL's decoders, the steering and the rise, then:)
export const SKY_FIELD_GLSL = SKY_FIELD_UNIFORMS_GLSL + FIELD_GLSL + SKY_STEER_GLSL + SKY_RISE_GLSL + glslOnce('SKY_FIELD_RULE', /* glsl */`
// The low cloud over a place (dir: a unit direction, planet axes), from field A:
// x heap cover, y sheet cover, z its base, w its top (m above the sea).
// (from a read of A already in hand; skyLow(dir) reads it. The sheet's own depth and the share
// of the layer it fills come from the same read: skyLowSheetDepth, skyLowShare.)
float skyLowSheetDepth(vec4 a) { return wxThick(a) * smoothstep(0.0, 0.1, wxSheet(a)); }
vec4 skyLowOf(vec4 a) {
  float heap = wxHeap(a), base = wxBase(a);
  float depth = max(skyLowSheetDepth(a), (${glf(V.HEAP_DEPTH)} + ${glf(V.HEAP_DEPTH_FULL)} * heap) * smoothstep(0.0, 0.1, heap));
  return vec4(heap, wxSheet(a), base, base + depth);
}
float skyLowShare(vec4 a, vec4 L) { return clamp(skyLowSheetDepth(a) / max(L.w - L.z, 1.0), 0.0, 1.0); }
vec4 skyLow(vec3 dir) { return skyLowOf(wxRead(tWxA, dir)); }
// How much low cloud there is at p (planet axes, m; 0..1): the heaps carved from the noise in the
// low layer's own pattern, rounded below and domed above; a sheet even through its depth.
float skyLowDensity(vec3 p) {
  float r = length(p);
  vec3 up = p / r;
  vec4 a = wxRead(tWxA, up);
  vec4 L = skyLowOf(a);
  float depth = max(L.w - L.z, 1.0), y = (r - uSkyLow.y - L.z) / depth;
  if (y <= 0.0 || y >= 1.0) return 0.0;
  float share = skyLowShare(a, L);
  vec3 qr = skyToLow(uCloudSteer, p) * uSkyLow.x;
  return skyLowAt(tCloudNoise, skyFormQ(qr, normalize(qr), share), r, uCloudRise.x, L.x, L.y, share, y, true) * uSkyLow.w;
}
// The cloud-shade atlas at a point p (planet axes, m) for the Sun's direction toSun (unit):
//   x the raw shade of the low cloud along the ray toward the Sun (0 none .. 1 full: readers
//     apply the crisp curve, skyShadeLight), the heaps where the ray crosses the height at which
//     they are widest, and the sheets;
//   y the Sun left after the mid and high layers along the ray (0..1);
//   z the sky's light left under the cover over p (0..1);
//   w the top of the low cloud along the ray, m above the sea / ${glf(V.TOP_M)} (0..1).
vec4 skyShade(vec3 p, vec3 toSun) {
  float r = length(p);
  vec3 up = p / r;
  vec4 L0 = skyLow(up);
  float h = r - uSkyLow.y, widest = mix(L0.z, L0.w, ${glf(V.WIDEST)});
  float s = max(widest - h, 0.0) / max(dot(up, toSun), ${glf(V.MU_MIN)});
  vec3 uq = normalize(p + toSun * s);
  vec4 L = skyLow(uq);
  float n = skyLowNoise(tCloudNoise, skyToLow(uCloudSteer, uq) * ((uSkyLow.y + widest) * uSkyLow.x), uSkyLow.y + widest, uCloudRise.x);
  float raw = max(skyHeapBody(n, L.x), L.y);
  vec4 b = wxRead(tWxB, uq);
  float upper = exp(-${glf(V.MID_K)} * wxMid(b) - ${glf(V.HIGH_K)} * wxHigh(b));
  float sky = 1.0 - ${glf(V.SKY_K)} * max(L0.y, 0.6 * L0.x);
  return vec4(raw * uSkyLow.w, mix(1.0, upper, uSkyLow.w), mix(1.0, sky, uSkyLow.w), clamp(L.w / ${glf(V.TOP_M)}, 0.0, 1.0) * uSkyLow.w);
}
// The crisp edge of a cloud's shadow: what share of the Sun a raw shade x takes, before the
// world's strength (as today's ground: 0.85 smoothstep(0.06, 0.42, heap)).
float skyShadeCrisp(float x) { return ${glf(V.SHADOW)} * smoothstep(${glf(V.CRISP0)}, ${glf(V.CRISP1)}, x); }
// What a lit thing at height h (m above the sea) takes from a texel s of the atlas:
// x the share of the Sun's light, y of the sky's. Above the low cloud's top only the mid and
// high layers stand in the way.
vec2 skyShadeLight(vec4 s, float h) {
  float below = 1.0 - smoothstep(s.w * ${glf(V.TOP_M)} - ${glf(V.TOP_SOFT)}, s.w * ${glf(V.TOP_M)} + ${glf(V.TOP_SOFT)}, h);
  return vec2((1.0 - uSkyLow.z * skyShadeCrisp(s.x) * below) * s.y, s.z);
}`);

// The JS twins of part 2. maps: { A, B } samplers (sample([u, v]) -> [r, g, b, a], filtered as the
// GPU does), noise: as above, u: { uCloudSteer, uSkyLow, uCloudRise } (arrays; without uCloudRise,
// no rise). Decoders as format.js's.
const TWO_PI = 2 * Math.PI;
const readMap = (m, d) => m.sample([Math.atan2(d[1], d[0]) / TWO_PI, Math.acos(clamp(d[2], -1, 1)) / Math.PI]);
export const skyLowSheetDepthJS = (a) => a[3] * 255 * ENC.THICK_STEP * sstep(0, 0.1, a[1]);
export function skyLowOfJS(a) {
  const heap = a[0], base = a[2] * 255 * ENC.BASE_STEP;
  const depth = Math.max(skyLowSheetDepthJS(a), (V.HEAP_DEPTH + V.HEAP_DEPTH_FULL * heap) * sstep(0, 0.1, heap));
  return [heap, a[1], base, base + depth];
}
export const skyLowShareJS = (a, L) => clamp(skyLowSheetDepthJS(a) / Math.max(L[3] - L[2], 1), 0, 1);
export const skyLowJS = (maps, d) => skyLowOfJS(readMap(maps.A, d));
export function skyLowDensityJS(maps, noise, u, p) {
  const r = Math.hypot(p[0], p[1], p[2]), up = [p[0] / r, p[1] / r, p[2] / r], k = u.uSkyLow;
  const a = readMap(maps.A, up), L = skyLowOfJS(a);
  const depth = Math.max(L[3] - L[2], 1), y = (r - k[1] - L[2]) / depth;
  if (y <= 0 || y >= 1) return 0;
  const share = skyLowShareJS(a, L);
  const qs = skyToLowJS(u.uCloudSteer, p); qs[0] *= k[0]; qs[1] *= k[0]; qs[2] *= k[0];
  const ql = Math.hypot(qs[0], qs[1], qs[2]) || 1;
  const q = skyFormQJS(qs, [qs[0] / ql, qs[1] / ql, qs[2] / ql], share);
  return skyLowAtJS(noise, q, r, u.uCloudRise?.[0] ?? 0, L[0], L[1], share, y, true) * k[3];
}
export function skyShadeJS(maps, noise, u, p, toSun) {
  const k = u.uSkyLow, r = Math.hypot(p[0], p[1], p[2]), up = [p[0] / r, p[1] / r, p[2] / r], L0 = skyLowJS(maps, up);
  const h = r - k[1], widest = L0[2] + (L0[3] - L0[2]) * V.WIDEST;
  const s = Math.max(widest - h, 0) / Math.max(up[0] * toSun[0] + up[1] * toSun[1] + up[2] * toSun[2], V.MU_MIN);
  const qp = [p[0] + toSun[0] * s, p[1] + toSun[1] * s, p[2] + toSun[2] * s], ql = Math.hypot(qp[0], qp[1], qp[2]), uq = [qp[0] / ql, qp[1] / ql, qp[2] / ql];
  const L = skyLowJS(maps, uq), q = skyToLowJS(u.uCloudSteer, uq), sc = (k[1] + widest) * k[0];
  q[0] *= sc; q[1] *= sc; q[2] *= sc;
  const n = skyLowNoiseJS(noise, q, k[1] + widest, u.uCloudRise?.[0] ?? 0);
  const raw = Math.max(skyHeapBodyJS(n, L[0]), L[1]);
  const b = readMap(maps.B, uq), upper = Math.exp(-V.MID_K * b[0] - V.HIGH_K * b[1]), sky = 1 - V.SKY_K * Math.max(L0[1], 0.6 * L0[0]);
  return [raw * k[3], 1 + (upper - 1) * k[3], 1 + (sky - 1) * k[3], clamp(L[3] / V.TOP_M, 0, 1) * k[3]];
}
export const skyShadeCrispJS = (x) => V.SHADOW * sstep(V.CRISP0, V.CRISP1, x);
export function skyShadeLightJS(u, s, h) {
  const top = s[3] * V.TOP_M, below = 1 - sstep(top - V.TOP_SOFT, top + V.TOP_SOFT, h);
  return [(1 - u.uSkyLow[2] * skyShadeCrispJS(s[0]) * below) * s[1], s[2]];
}
