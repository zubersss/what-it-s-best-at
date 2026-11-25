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
// The steering in a shader: one unit quaternion of M_low(t)^-1 (four numbers: a uniform vec4
// takes the place the old vec3 drift had, so no shader's uniform count grows; the ground's
// vertex and fragment shaders are near a phone's limits). steerQuat() makes it from steer.js's
// matrix; skyToLow() turns a point with it; the test checks both against steer.inverse().
// (STEER_GLSL in steer.js has every layer as mat3 arrays, for shaders that want them all.)
//
// Pure: no three, no DOM, no Math.random (it is imported by Node tests).
import { FIELD_GLSL, ENC } from '../weather/sky/format.js';

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

export const SKY_STEER_GLSL = /* glsl */`
// Where the low layer's pattern stands still: p (planet axes, m, or a direction) turned back by
// the low layer's motion; q is SKY_UNIFORMS.uCloudSteer (src/sky/skyGlsl.js)
vec3 skyToLow(vec4 q, vec3 p) { vec3 t = 2.0 * cross(q.xyz, p); return p + q.w * t + cross(q.xyz, t); }`;

// ---- the uniforms every reader shares (one object each, never replaced; three takes the flat arrays)

export function makeSkyUniforms() {
  return {
    uCloudSteer: { value: new Float32Array([0, 0, 0, 1]) },     // the low layer's M^-1 as a quaternion (identity: no motion)
    // the field's rule (part 2): x 1 / the noise's scale (1/m), y the world's radius (m), z how dark a
    // full cloud's shadow is (0..1), w 1 when there is a field (0: no cloud from it at all)
    uSkyLow: { value: new Float32Array([1 / 4200, 250000, 0.85, 0]) },
    tWxA: { value: null }, tWxB: { value: null }, tWxC: { value: null },      // the field's 'now' maps (sky/skyField.js)
  };
}
export const SKY_UNIFORMS = makeSkyUniforms();

// ---- 1. the rule as drawn today -------------------------------------------------------------

// Its numbers (the GLSL below and its JS twins are made from them; change them here).
export const CLOUD_RULE = Object.freeze({
  FIELD_OFFSET: 0.31, CLUSTER_K: 0.2, CLUSTER_OFFSET: 0.83,     // where the fair-weather field and its clusters are read
  FAIR_MAX: 0.5, FAIR_M0: 0.55, FAIR_M1: 0.45, FAIR_M_EDGE: 0.5, // never a whole cover; more where the day's map has some
  FIELD0: 0.12, FIELD1: 0.34, CLUSTER0: 0.40, CLUSTER1: 0.56, FAIR_GAIN: 1.3 / 0.55,
  EDGE0: 0.08, EDGE1: 0.34,                                     // the map's cover: smoothstep(lo - EDGE0, lo + EDGE1, m)
  LOBE_K: 5.3, LOBE_OFFSET: 0.37, LOBE_AMP: 0.26,               // the smaller lobes that push a heap's outline in and out
  CUT: 0.85, FLOOR: 0.15, FLOOR_MIN: 0.2, GAIN: 2.2,            // the heap from the noise: clamp((n - (1 - c) CUT) / max(c CUT + FLOOR, FLOOR_MIN) GAIN)
});
const C = CLOUD_RULE;

// Fair-weather cloud, where the day's map shows none (its pixels are 10 km: it never saw them):
// fields of small heaps with clear stretches between, and the fields themselves in clusters
// some tens of kilometres across with clear country between them. (Without the clusters, seen
// from high up one even field lay over the whole land: the same few heaps in rows to the
// horizon, since the noise they are cut from repeats every few kilometres.) Fixed to the
// ground, as before: the field model (package A) takes its place.
//   noise: the cloud volume's noise; up: the direction from the world's centre; k: the
//   world's radius in units of the field; fair: its cover; m: the day's map there.
//   Never a whole cover: fair weather has sky between its heaps.
export const FAIR_GLSL = /* glsl */`
float fairCover(highp sampler3D noise, vec3 up, float k, float fair, float m) {
  float field = texture(noise, up * k + ${glf(C.FIELD_OFFSET)}).r, cluster = texture(noise, up * (k * ${glf(C.CLUSTER_K)}) + ${glf(C.CLUSTER_OFFSET)}).g;
  return min(${glf(C.FAIR_MAX)}, fair * (${glf(C.FAIR_M0)} + ${glf(C.FAIR_M1)} * smoothstep(0.0, ${glf(C.FAIR_M_EDGE)}, m)) * smoothstep(${glf(C.FIELD0)}, ${glf(C.FIELD1)}, field) * smoothstep(${glf(C.CLUSTER0)}, ${glf(C.CLUSTER1)}, cluster) * ${glf(C.FAIR_GAIN)});
}`;

// A heap of the cloud layer over a place, as the far shell draws it and as the ground, the
// trees and the far rocks are shaded by it: one rule.
//   noise: the cloud volume's noise; up: the direction from the world's centre; m: the day's
//   map there; lo: 1 - the layer's cover; fair: the fair-weather cover; vol: x 1 / the noise's
//   scale, y the fair-weather field's scale, z the radius at which the volume's masses are
//   widest; steer: SKY_UNIFORMS.uCloudSteer; fine: how much of the smaller lobes (0..1).
//   Returns x the heap (0..1), y the cover there (0..1).
export const HEAP_GLSL = SKY_STEER_GLSL + FAIR_GLSL + /* glsl */`
vec2 cloudHeap(highp sampler3D noise, vec3 up, float m, float lo, float fair, vec3 vol, vec4 steer, float fine) {
  float c = smoothstep(lo - ${glf(C.EDGE0)}, lo + ${glf(C.EDGE1)}, m);
  if (fair > 0.0) c = max(c, fairCover(noise, up, vol.y, fair, m));
  vec3 qv = skyToLow(steer, up) * (vol.z * vol.x);
  float n = texture(noise, qv).r;
  if (fine > 0.0) n += (texture(noise, qv * ${glf(C.LOBE_K)} + ${glf(C.LOBE_OFFSET)}).g - 0.5) * ${glf(C.LOBE_AMP)} * fine;
  return vec2(clamp((n - (1.0 - c) * ${glf(C.CUT)}) / max(c * ${glf(C.CUT)} + ${glf(C.FLOOR)}, ${glf(C.FLOOR_MIN)}) * ${glf(C.GAIN)}, 0.0, 1.0), c);
}`;

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
  let n = noise.sample(q)[0];
  if (fine > 0) { const k = C.LOBE_K, o = C.LOBE_OFFSET; n += (noise.sample([q[0] * k + o, q[1] * k + o, q[2] * k + o])[1] - 0.5) * C.LOBE_AMP * fine; }
  return [clamp((n - (1 - c) * C.CUT) / Math.max(c * C.CUT + C.FLOOR, C.FLOOR_MIN) * C.GAIN, 0, 1), c];
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

export const SKY_FIELD_UNIFORMS_GLSL = /* glsl */`
uniform sampler2D tWxA, tWxB, tWxC;   // the field's 'now' maps (src/weather/sky/format.js; src/sky/skyField.js)
uniform vec4 uSkyLow;                 // x 1 / the noise's scale (1/m), y the world's radius (m), z the shadow's strength, w 1: a field is there
uniform vec4 uCloudSteer;             // the low layer's motion (src/sky/skyGlsl.js)
uniform highp sampler3D tCloudNoise;  // the clouds' noise (src/sky/cloudNoiseData.js)`;

const V = SKY_V0;
// (FIELD_GLSL's decoders, then:)
export const SKY_FIELD_GLSL = FIELD_GLSL + SKY_STEER_GLSL + /* glsl */`
// The low cloud over a place (dir: a unit direction, planet axes), from field A:
// x heap cover, y sheet cover, z its base, w its top (m above the sea).
vec4 skyLow(vec3 dir) {
  vec4 a = wxRead(tWxA, dir);
  float heap = wxHeap(a), sheet = wxSheet(a), base = wxBase(a);
  float depth = max(wxThick(a) * smoothstep(0.0, 0.1, sheet), (${glf(V.HEAP_DEPTH)} + ${glf(V.HEAP_DEPTH_FULL)} * heap) * smoothstep(0.0, 0.1, heap));
  return vec4(heap, sheet, base, base + depth);
}
// How much low cloud there is at p (planet axes, m; 0..1): the heaps carved from the noise in the
// low layer's own pattern, rounded below and domed above; a sheet even through its depth.
float skyLowDensity(vec3 p) {
  float r = length(p);
  vec4 L = skyLow(p / r);
  float y = (r - uSkyLow.y - L.z) / max(L.w - L.z, 1.0);
  float inside = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.86, 1.0, y));
  float n = texture(tCloudNoise, skyToLow(uCloudSteer, p) * uSkyLow.x).r;
  float heap = clamp((n * inside - (1.0 - L.x) * 0.85) / max(L.x * 0.85 + 0.15, 0.2) * 2.2, 0.0, 1.0);
  return max(heap, L.y * inside) * uSkyLow.w;
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
  float n = texture(tCloudNoise, skyToLow(uCloudSteer, uq) * ((uSkyLow.y + widest) * uSkyLow.x)).r;
  float heap = clamp((n - (1.0 - L.x) * 0.85) / max(L.x * 0.85 + 0.15, 0.2) * 2.2, 0.0, 1.0);
  float raw = max(heap, L.y);
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
}`;

// The JS twins of part 2. maps: { A, B } samplers (sample([u, v]) -> [r, g, b, a], filtered as the
// GPU does), noise: as above, u: { uCloudSteer, uSkyLow } (arrays). Decoders as format.js's.
const TWO_PI = 2 * Math.PI;
const readMap = (m, d) => m.sample([Math.atan2(d[1], d[0]) / TWO_PI, Math.acos(clamp(d[2], -1, 1)) / Math.PI]);
export function skyLowJS(maps, d) {
  const a = readMap(maps.A, d), heap = a[0], sheet = a[1], base = a[2] * 255 * ENC.BASE_STEP;
  const depth = Math.max(a[3] * 255 * ENC.THICK_STEP * sstep(0, 0.1, sheet), (V.HEAP_DEPTH + V.HEAP_DEPTH_FULL * heap) * sstep(0, 0.1, heap));
  return [heap, sheet, base, base + depth];
}
export function skyLowDensityJS(maps, noise, u, p) {
  const r = Math.hypot(p[0], p[1], p[2]), L = skyLowJS(maps, [p[0] / r, p[1] / r, p[2] / r]), k = u.uSkyLow;
  const y = (r - k[1] - L[2]) / Math.max(L[3] - L[2], 1), inside = sstep(0, 0.08, y) * (1 - sstep(0.86, 1, y));
  const q = skyToLowJS(u.uCloudSteer, p); q[0] *= k[0]; q[1] *= k[0]; q[2] *= k[0];
  const n = noise.sample(q)[0];
  const heap = clamp((n * inside - (1 - L[0]) * 0.85) / Math.max(L[0] * 0.85 + 0.15, 0.2) * 2.2, 0, 1);
  return Math.max(heap, L[1] * inside) * k[3];
}
export function skyShadeJS(maps, noise, u, p, toSun) {
  const k = u.uSkyLow, r = Math.hypot(p[0], p[1], p[2]), up = [p[0] / r, p[1] / r, p[2] / r], L0 = skyLowJS(maps, up);
  const h = r - k[1], widest = L0[2] + (L0[3] - L0[2]) * V.WIDEST;
  const s = Math.max(widest - h, 0) / Math.max(up[0] * toSun[0] + up[1] * toSun[1] + up[2] * toSun[2], V.MU_MIN);
  const qp = [p[0] + toSun[0] * s, p[1] + toSun[1] * s, p[2] + toSun[2] * s], ql = Math.hypot(qp[0], qp[1], qp[2]), uq = [qp[0] / ql, qp[1] / ql, qp[2] / ql];
  const L = skyLowJS(maps, uq), q = skyToLowJS(u.uCloudSteer, uq), sc = (k[1] + widest) * k[0];
  q[0] *= sc; q[1] *= sc; q[2] *= sc;
  const n = noise.sample(q)[0];
  const heap = clamp((n - (1 - L[0]) * 0.85) / Math.max(L[0] * 0.85 + 0.15, 0.2) * 2.2, 0, 1), raw = Math.max(heap, L[1]);
  const b = readMap(maps.B, uq), upper = Math.exp(-V.MID_K * b[0] - V.HIGH_K * b[1]), sky = 1 - V.SKY_K * Math.max(L0[1], 0.6 * L0[0]);
  return [raw * k[3], 1 + (upper - 1) * k[3], 1 + (sky - 1) * k[3], clamp(L[3] / V.TOP_M, 0, 1) * k[3]];
}
export const skyShadeCrispJS = (x) => V.SHADOW * sstep(V.CRISP0, V.CRISP1, x);
export function skyShadeLightJS(u, s, h) {
  const top = s[3] * V.TOP_M, below = 1 - sstep(top - V.TOP_SOFT, top + V.TOP_SOFT, h);
  return [(1 - u.uSkyLow[2] * skyShadeCrispJS(s[0]) * below) * s[1], s[2]];
}
