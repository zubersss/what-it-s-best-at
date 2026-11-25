// Clouds with depth: the cloud near the traveller, drawn as a volume that can be flown into,
// through and out of, and the storm cells wherever they stand, near or far.
//
// WHERE THE CLOUD IS. From the sky's field (src/sky/skyField.js, made by the weather model):
// one read of its map A at every step gives the heap cover, the sheet cover, the base and the
// sheet's thickness AT THAT PLACE, so the base stands over the country by rule and nothing of
// the cloud depends on where the traveller is or looks. (It once stood a fixed height over the
// ground smoothed round the traveller: the whole sky's base shifted by up to 51 m per 100 m
// flown, and its shadows slid over the land as one moved.) The 3-D noise carves the cover into
// heaps and decks by the shared forms of sky/skyGlsl.js, read where the low layer's pattern
// stands still (the steering, weather/sky/steer.js), so the clouds go with that day's wind and
// the masses rise and fade in place, drawn or not, on the game clock.
// A world whose weather has no field (none yet made) keeps the rule as it was: the day's cloud
// map and fair-weather fields, over the country under the traveller. That path goes when every
// world has a field.
//
// WHAT IS DRAWN, each frame:
//   1. Before the main picture is begun, a small picture is marched: eight of them side by side
//      (a quarter of the view each way), one for each slice of DISTANCE FROM THE EYE (0 to
//      300 m, to 900 m, to 2.4 km, to 5 km, to 9 km, to the reach of 16 km; then 16 to 40 km
//      and 40 to 200 km, which hold storm cells alone and are marched only while a cell stands
//      out there). Every pixel's ray is followed through the cloud that lies in its slice, the
//      light and what it lets through added up along it; a second small pass takes the grain
//      out of it, and a third gathers all the cloud along each line of sight (the clean edge is
//      cut by that, so a cloud cannot change its outline as a slice boundary passes through it).
//   2. In the main picture: the two far slices first, laid with each pixel's own distance as its
//      depth (so a ridge in front hides a storm behind it, and a near-solid core writes depth,
//      so the shells and the far heaps behind it are hidden); then, after the ground and the
//      shells, the six near slices from the farthest to the nearest, each a curved sheet at the
//      distance where its slice begins.
// Nothing reads the main picture's depth and nothing leaves the picture in the middle of it.
// (The first form did both: on the test phone every world then ran at a quarter of its frame
// rate, at any resolution.)
//
// A STORM CELL is an exact shape from the cell list (weather/sky/cellShape.js: one rule for the
// march, the shade pass, the rain and the model), marched by the same function in the near
// slices and in the two far ones, so the hand-over at 16 km cannot pop. Its noise boils in the
// cell's own moving frame, its sunlight is the exact chord toward the Sun through the tower, its
// base is slate-indigo, and up to two flashes light it from inside (setBolts, package D's).
//
// RAIN comes out of the cloud above: below a raining base each ray crosses the shafts once (the
// cells' exact chords, and the field's rain under decks), grey-blue with a silver glow toward a
// low Sun, fading out within 600 m of the eye where package D's streaks take over.
//
// Light: the Sun through the air to the cloud, then through the cloud itself (a short look
// toward the Sun at every step, an exact chord in a cell), brightest at the edges facing it; the
// sky from all round; the mid and high layers' shade read once a ray; the air between the cloud
// and the eye.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { G } from '../render/globals.js';
import { FAIR_GLSL, SKY_FIELD_GLSL, SKY_FIELD_UNIFORMS_GLSL, SKY_UNIFORMS } from './skyGlsl.js';
import { CELL_GLSL, CELL_MAX } from '../weather/sky/cellShape.js';
import { makeSkyAt } from '../weather/sky/format.js';

// ---- the numbers of the look (the report lists them; the world file may pin them) ------------
export const CLOUD_LOOK = Object.freeze({
  SUN_LOOK: 280,            // m toward the Sun: the look that splits a heap into its two tones
  SHADE: 0.64, LIT: 1.0,    // the two tones, with a clean line between them
  CELL_DENSE: 1.45,         // a cell is this much more solid than a heap
  CELL_FACE0: 250, CELL_FACE1: 700,   // m of chord between which a tower's own face turns from the Sun's tone to its shade
  CELL_LIT: 300,            // m of chord toward the Sun under which a tower's cloud is fully lit ...
  CELL_DEEP: 2600,          // ... and over which it is as dark as it gets
  CELL_FLOOR: 0.11,         // the light the base of a tower keeps (0.08..0.15 of the lit top)
  CELL_TINT: [0.62, 0.66, 1.0],   // the slate-indigo its shade is pulled toward
  CELL_SKY: 0.2,            // the share of the sky's light that reaches the heart of a tower
  CELL_BOIL: 5.5,           // m/s: its noise boils upward in the cell's own moving frame (3..8)
  CELL_NOISE: 0.55,         // the share of the cell's own noise that eats at its hull
  ROUND: 0.18, ROUND_K: 0.22,   // the light that comes round into a cloud from its sides, and how deep it reaches
  FLOOR_DECK: 0.3,              // the least light a deck's base keeps (coloured shade, never black)
  GROUND_HALF: 0.5,         // under a storm the light from the ground below is halved
  MID_K: 1.2, HIGH_K: 0.35, // the Sun left by the layers above: exp(-MID_K mid - HIGH_K high)
  SCUD: 400,                // m under a raining base that ragged scud hangs
  SHAFT_K: 0.00014, SHAFT_P: 0.85,   // the rain's optical depth a metre: K rate^P
  SHAFT_FALL: 9,            // m/s a drop falls (its foot is offset downwind by this)
  SHAFT_NEAR: 600,          // m: nearer than this the shafts fade out (D's streaks take over)
  SHAFT_MIST: 300,          // m over the country that a shaft's foot turns to mist
  SHAFT_GREY: 0.7,          // the share of the sky's light a shaft shows
  SHAFT_GLOW: 1.1,          // the silver glow with a low Sun behind it
  VIRGA: 2000,              // m: light rain under a base this far over the ground fades out
});
const K = CLOUD_LOOK;
const glf = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

const VERT = /* glsl */`
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// What the march, the far lay and the near lay all need to know about the slices: which tile of
// the small picture a slice is drawn in (down a column first, so that the six near slices fill
// the first three columns and the two far ones the fourth: with no storm out there the fourth
// column is neither marched nor read, and the target is used in part as it was).
const SLICE_GLSL = /* glsl */`
vec2 cloudTile(float s) { return vec2(floor(s / float(ROWS)), mod(s, float(ROWS))); }
int cloudSliceAt(vec2 cellf) { return min(int(cellf.y), ROWS - 1) + ROWS * min(int(cellf.x), COLS - 1); }`;

const MARCH = /* glsl */`
${LIGHTING_PARS}
precision highp sampler3D;
${SKY_FIELD_UNIFORMS_GLSL}
uniform sampler2D tCloudMap;   // (no field: the day's cloud map, the rule as it was)
uniform vec4 uCloud;           // x cover, y longitude shift of the map (turns), z 1 / noise scale (1/m), w the reach (m)
uniform vec4 uLayer;           // x the lowest base in reach (m, radius), y the depth to the highest top (m), z steps in a near slice, w steps in a far one
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform vec4 uProj;            // x tan(half the vertical view angle), y aspect, z near, w far
uniform float uSliceZ[SLICES + 1];   // where each slice of the distance from the eye begins and ends (m)
uniform int uSliceCount;       // how many slices are marched (6, or 8 with a storm beyond the reach)
uniform float uDense;          // how solid the cloud is, against the plain measure
uniform float uStorm;          // (no field: how much of a storm this is, from the world's weather)
uniform float uFieldK;         // (no field: the world's radius in units of the fair-weather field's noise)
uniform vec2 uFair;            // (no field: x the fair-weather cover, y how far round the eye the cloud is thinned (m))
uniform float uLayerOn;        // 0 at the governor's last step: the field's own heaps and decks go to the far shell and only the storm cells are marched
uniform vec4 uBolt[BOLTS];     // flashes inside the cloud: xyz where (from the camera, m), w how bright
uniform vec4 uShaft;           // x 0 no rain shafts, 1 the cells' alone, 2 the field's rain as well; y 1 while they are thinned (the governor), z the streaks' phase (0..1), w the highest base in reach (m)
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
${SKY_FIELD_GLSL}
${FAIR_GLSL}
${CELL_GLSL}
${SLICE_GLSL}

// (no field: the cover at a place from the day's map, as the game drew it before)
float mapCover(vec3 up) {
  vec2 uv = vec2(atan(up.y, up.x) * 0.15915494 + uCloud.y, acos(clamp(up.z, -1.0, 1.0)) * 0.31830989);
  float m = skyTex2(tCloudMap, uv).r, lo = 1.0 - uCloud.x;
  float c = smoothstep(lo - 0.08, lo + 0.34, m);
  if (uFair.x > 0.0) c = max(c, fairCover(tCloudNoise, up, uFieldK, uFair.x, m));
  return c;
}
// Where the low layer's pattern stands still, in noise units, at the distance t along a ray
// whose camera and direction are camQ and dirQ in that pattern's axes (skyToLow of
// uCamPlanetPos and of the ray's direction: a turning is linear, so it is done once a ray).
// Read there, the cloud goes with the low wind at the day's speed (weather/sky/steer.js).
vec3 marchPattern(vec3 camQ, vec3 dirQ, float t) { return (camQ + dirQ * t) * uCloud.z; }
// How much cloud is at a place, where the cover is c and the height in the layer y (0..1): the
// shared forms of sky/skyGlsl.js (one rule with the far shell and the shade atlas). q is the
// place in the low pattern (noise units, marchPattern), r its distance from the world's centre.
// The masses rise through the layer as they go (skyLowNoise2: the lobes that eat at their edges
// come from the same read and rise with them), so a heap grows and fades in place.
// How much cloud of the LAYER is at the place q (the low pattern, noise units) whose radius is
// r: the heaps and the sheet cut from one read of the noise by the shared forms. cover and sheet
// are the field's two covers there, share the part of the layer's depth the sheet fills, y the
// height in the layer (0 base .. 1 top).
// (the rule itself is the shared one, sky/skyGlsl.js's skyLowAt: the far shell and the shade
// atlas cut the same cloud by it)
float layerAt(vec3 q, float r, float cover, float sheet, float share, float y, bool fine) {
  return skyLowAt(tCloudNoise, q, r, uCloudRise.x, cover, sheet, share, y, fine);
}
// the heaps alone (no sheet), which is what the march read before the field: one call of it
float density(vec3 q, float r, float c, float y, bool fine) { return skyLowAt(tCloudNoise, q, r, uCloudRise.x, c, 0.0, 0.0, y, fine); }

// ---- what a ray gathers (one pixel's running total, so the stretches can be marched in order)
float gT;                      // what the ray still lets through
vec3 gC;                       // the light it has gathered (premultiplied)
float gTMean, gWSum;           // its cloud's mean distance, weighted by what each step added
vec3 gSunC, gSkyC, gSkyDown;   // the Sun and the sky at the middle of the stretch
float gPhase, gMu0, gCs;       // the forward lobe, the Sun's height, the angle to the Sun
float gWisp;                   // the great soft patches seen inside a cloud
vec3 gCamQ, gDirQ, gSunQ;      // the ray in the low layer's own axes
vec3 gDir;                     // the ray
float gSigma;                  // how fast full cloud takes light out, per metre

// The light of one step: lit (the share of the Sun that reaches it), skyK (the share of the
// sky's light, which a deep cloud shuts out as well), y (its height in its cloud), tint (its own
// colour), groundK (the light from the ground below, halved under a storm).
void cloudAdd(float d, float dt, float lit, float skyK, float y, vec3 tint, float groundK, vec3 p, float t) {
  vec3 light = gSunC * (lit * min(0.6 + 0.4 * gPhase, 2.5)) + (gSkyC * (0.45 + 0.55 * y) + gSkyDown * (1.0 - y) * 0.5 * groundK) * (0.55 * skyK);
  light *= tint;
  for (int b = 0; b < BOLTS; b++) {
    if (uBolt[b].w <= 0.0) continue;
    vec3 fb = gDir * t - uBolt[b].xyz;
    light += vec3(0.8, 0.88, 1.0) * (uBolt[b].w / (1.0 + dot(fb, fb) / (900.0 * 900.0)));
  }
  float a = 1.0 - exp(-gSigma * d * dt);
  gC += gT * a * light;
  gTMean += t * gT * a; gWSum += gT * a;
  gT *= 1.0 - a;
}

// ---- the storm cells on this ray ---------------------------------------------------------------
// the two nearest cells whose hull this ray crosses inside [t0, t1]: their stretches
int gCellK[2];
vec2 gCellT[2];
int gCells;
void cloudFindCells(vec3 o, vec3 dir, float t0, float t1) {
  gCells = 0;
  gCellK[0] = -1; gCellK[1] = -1; gCellT[0] = vec2(0.0); gCellT[1] = vec2(0.0);
  for (int k = 0; k < CELL_MAX; k++) {
    if (k >= uCellCount) break;
    vec2 c = cellChord(k, o, dir);
    c = vec2(max(c.x, t0), min(c.y, t1));
    if (c.y <= c.x) continue;
    // (nearest first: at most two, so a ray through a line of storms pays for two)
    if (gCells == 0) { gCellK[0] = k; gCellT[0] = c; gCells = 1; }
    else if (c.x < gCellT[0].x) { gCellK[1] = gCellK[0]; gCellT[1] = gCellT[0]; gCellK[0] = k; gCellT[0] = c; gCells = 2; }
    else if (gCells == 1 || c.x < gCellT[1].x) { gCellK[1] = k; gCellT[1] = c; gCells = 2; }
  }
}
// how solid the cell k is at p, its hull eroded by its own noise, boiling in its own moving frame
float cloudCellDensity(int k, vec3 p) {
  float e = cellDensity(k, p);
  if (e <= 0.0) return 0.0;
  vec4 d = uCells[k * 5 + 4];                 // (core, age, seed, base)
  vec3 l = cellLocal(k, p);
  l.z -= ${glf(K.CELL_BOIL)} * d.y;           // (it boils upward through the tower as it lives)
  vec2 n = skyTex3(tCloudNoise, (l + vec3(d.z * 977.0)) * uCloud.z * 2.2).rg;
  float eat = ${glf(K.CELL_NOISE)} * (1.0 - n.x) + 0.12 * (1.0 - n.y);
  return clamp((e - eat * (1.0 - e)) / max(1.0 - eat, 0.2), 0.0, 1.0);
}
// the light of a cell's cloud at p: the exact chord toward the Sun through the tower
void cloudCellAdd(int k, vec3 p, float d, float dt, float t, float y) {
  float chord = cellLight(k, p, uSunDir);
  // the painter's two tones for the tower's own cauliflower (a short chord toward the Sun is a
  // face turned to it), and under them the slate that comes with the depth of the whole tower
  float lit = mix(${glf(K.SHADE)}, 1.0, 1.0 - smoothstep(${glf(K.CELL_FACE0)}, ${glf(K.CELL_FACE1)}, chord));
  lit *= mix(1.0, ${glf(K.CELL_FLOOR)} / ${glf(K.SHADE)}, smoothstep(${glf(K.CELL_LIT)}, ${glf(K.CELL_DEEP)}, chord));
  float dark = 1.0 - lit;
  vec3 tint = mix(vec3(1.0), vec3(${glf(K.CELL_TINT[0])}, ${glf(K.CELL_TINT[1])}, ${glf(K.CELL_TINT[2])}), dark * 0.9);
  // (the sky's light is shut out of a tower as the Sun's is: a storm's base is slate, not a grey
  // that the sky keeps lighting)
  cloudAdd(d * ${glf(K.CELL_DENSE)}, dt, lit, mix(1.0, ${glf(K.CELL_SKY)}, dark), y, tint, ${glf(K.GROUND_HALF)}, p, t);
}

// ---- the rain below the base --------------------------------------------------------------------
// The rain on this ray between t0 and t1 (the stretch under the lowest raining base): the cells'
// exact chords and, under a deck, the field's own rain. Crossed once, in six steps (three while
// the governor thins it), with two looks into field B and one into the noise for the streaks.
void cloudShafts(float t0, float t1, float country) {
  if (uShaft.x <= 0.0 || t1 <= t0 || gT < 0.02) return;
  bool thin = uShaft.y > 0.0;
  float n = thin ? 3.0 : 6.0, L = t1 - t0;
  // The field's rain and the base it falls from, at a quarter and three quarters of the stretch
  // (one place while the governor thins it): rain belongs to the cloud above, so none is drawn
  // over its own base.
  vec3 na = normalize(uCamPlanetPos + gDir * (t0 + L * 0.25)), nb = normalize(uCamPlanetPos + gDir * (t0 + L * 0.75));
  float ra = 0.0, rb = 0.0, ba = 0.0, bb = 0.0;
  if (uSkyLow.w > 0.5) {
    ra = wxRain(skyTex2(tWxB, wxUV(na))); ba = wxBase(skyTex2(tWxA, wxUV(na)));
    if (thin) { rb = ra; bb = ba; } else { rb = wxRain(skyTex2(tWxB, wxUV(nb))); bb = wxBase(skyTex2(tWxA, wxUV(nb))); }
  }
  float streak = 1.0;
  if (!thin) {
    vec3 sq = marchPattern(gCamQ, gDirQ, 0.5 * (t0 + t1)) * vec3(15.3, 15.3, 1.7);
    sq.z -= uShaft.z;
    streak = 0.55 + 0.9 * skyTex3(tCloudNoise, sq).g;
  }
  // grey-blue sky light, and a silver glow where a low Sun stands behind the shaft
  vec3 grey = (gSkyC * ${glf(K.SHAFT_GREY)} + gSunC * (${glf(K.SHAFT_GLOW)} * pow(max(gCs, 0.0), 6.0) * (1.0 - smoothstep(0.0, 0.25, gMu0)))) / PI;
  for (float i = 0.0; i < 6.0; i += 1.0) {
    if (i >= n || gT < 0.02) break;
    float f = (i + 0.5) / n, t = t0 + L * f, dt = L / n;
    vec3 p = uCamPlanetPos + gDir * t;
    float h = length(p) - uSkyLow.y;
    float base = mix(ba, bb, f), fieldRain = mix(ra, rb, f);
    // the field's rain, under its own base; virga where that base stands high over the land
    float rate = 0.0;
    if (h < base) rate = fieldRain * (1.0 - smoothstep(0.35, 1.0, (base - country) / ${glf(K.VIRGA)}) * (1.0 - smoothstep(2.0, 6.0, fieldRain)));
    for (int c = 0; c < 2; c++) {
      if (c >= gCells) break;
      rate = max(rate, cellRain(gCellK[c], p));
    }
    if (rate <= 0.02) continue;
    // (a misty foot over the country, and nothing within 600 m of the eye: there D's streaks are)
    float foot = smoothstep(0.0, ${glf(K.SHAFT_MIST)}, h - country);
    float tau = ${glf(K.SHAFT_K)} * pow(rate, ${glf(K.SHAFT_P)}) * dt * mix(0.45, 1.0, foot) * streak;
    float a = (1.0 - exp(-tau)) * smoothstep(${glf(K.SHAFT_NEAR)} * 0.3, ${glf(K.SHAFT_NEAR)}, t);
    gC += gT * a * grey;
    gTMean += t * gT * a; gWSum += gT * a;
    gT *= 1.0 - a;
  }
}

// One step of the march at the distance t along the ray, dt long: the cell on this ray if there
// is one, else the layer's own cloud from the field, lit as a painter has it.
void cloudStep(float t, float dt, bool far) {
  vec3 p = uCamPlanetPos + gDir * t;
  float r = length(p); vec3 up = p / r;
  // the cell on this ray at this step, if any (arithmetic, but for its own noise)
  float cd = 0.0; int ck = -1;
  for (int c = 0; c < 2; c++) {
    if (c >= gCells) break;
    if (t < gCellT[c].x || t > gCellT[c].y) continue;
    float d = cloudCellDensity(gCellK[c], p);
    if (d > cd) { cd = d; ck = gCellK[c]; }
  }
  // the layer's own cloud at this place, from the field (one read) or from the day's map
  float ld = 0.0, y = 0.0, base = 0.0, depth = 1.0, share = 0.0, cover = 0.0, sheet = 0.0;
  if (!far && uLayerOn > 0.5 && cd < 0.75) {
    if (uSkyLow.w > 0.5) {
      vec4 A = skyTex2(tWxA, wxUV(up));
      vec4 Lf = skyLowOf(A);
      cover = Lf.x; sheet = Lf.y; base = Lf.z; depth = max(Lf.w - Lf.z, 1.0);
      share = skyLowShare(A, Lf);
    } else {
      cover = mapCover(up); sheet = 0.0; base = uLayer.x - uSkyLow.y; depth = uLayer.y;
    }
    cover *= 1.0 - smoothstep(0.7 * uCloud.w, uCloud.w, t);
    y = (r - uSkyLow.y - base) / depth;
    if ((cover > 0.01 || sheet > 0.01) && y > 0.0 && y < 1.0) {
      vec3 qr = marchPattern(gCamQ, gDirQ, t);
      ld = layerAt(skyFormQ(qr, normalize(qr), share), r, cover, sheet, share, y, true);
    }
  }
  if (cd > 0.0 && cd >= ld) {
    float yc = clamp((r - uCells[ck * 5].w) / max(uCells[ck * 5 + 3].x, 1.0), 0.0, 1.0);
    cloudCellAdd(ck, p, cd, dt, t, yc);
    return;
  }
  if (ld <= 0.001) return;
  float wisp = 1.0;
  float d = ld;
  if (t < 1000.0) {
    // close by: wisps a few hundred metres across torn out of the cloud, and the cloud round the
    // eye itself thin, so that flying through one is shapes going by and not a blank wall
    float e2 = skyTex3(tCloudNoise, marchPattern(gCamQ, gDirQ, t) * 19.0 + 0.71).g;
    float nearK = 1.0 - smoothstep(300.0, 1000.0, t);
    d *= mix(1.0, smoothstep(0.25, 0.75, e2 + 0.5 * d), 0.7 * nearK);
    d *= mix(0.35, 1.0, smoothstep(0.0, uFair.y, t));
    wisp = mix(1.0, gWisp, 1.0 - smoothstep(400.0, 1000.0, t));
  }
  // The Sun on the cloud, as a painter has it: full on the tops and on the sides turned to it
  // (less cloud a little way toward the Sun than here), little in the hearts and under the
  // masses; and under a deep deck hardly any reaches the base.
  vec3 q2 = marchPattern(gCamQ, gDirQ, t) + gSunQ * (${glf(K.SUN_LOOK)} * uCloud.z);
  float y2 = y + ${glf(K.SUN_LOOK)} * gMu0 / depth;
  float dl = layerAt(skyFormQ(q2, normalize(q2), share), r + ${glf(K.SUN_LOOK)} * gMu0, cover, sheet, share, y2, false);
  float sunward = clamp(0.5 + (d - dl) * 2.2 + (y - 0.42) * 1.1, 0.0, 1.0);
  // how much cloud stands between this place and the Sun inside its own column
  float above = gSigma * (1.0 - y) * depth * max(d, share) * 0.35 / max(gMu0, 0.25);
  // Only a cover that is nearly whole stands between the Sun and what is under it: among
  // scattered heaps the light comes down between them and goes round inside each one, so a fair
  // heap is light all over. A sheet darkens by its own depth, however much sky is left beside
  // it: that is what makes a deck grey and a rain deck nearly slate.
  above *= max(smoothstep(0.74, 0.97, cover), share);
  // (two tones with a clean line between them, the shade a light one: a poster's cloud)
  float through = clamp(exp(-above) + ${glf(K.ROUND)} * exp(-${glf(K.ROUND_K)} * above), mix(1.0, ${glf(K.FLOOR_DECK)}, share), 1.0);
  float lit = mix(${glf(K.SHADE)}, ${glf(K.LIT)}, smoothstep(0.4, 0.56, sunward)) * through;
  // (a sheet shuts the sky's light out as well as the Sun's; among heaps it comes round between them)
  float skyK = mix(1.0, through, share);
  // (no field: the storm patches the world's weather gave, as before)
  vec3 tint = vec3(1.0);
  if (uSkyLow.w < 0.5 && uStorm > 0.02 && y < 0.6) {
    float sm = skyTex3(tCloudNoise, marchPattern(gCamQ, gDirQ, t) * 1.9 + 0.23).g;
    tint *= mix(1.0, 0.36 + 1.25 * sm, uStorm * (1.0 - y / 0.6));
  }
  cloudAdd(d, dt, lit * wisp, skyK, y, tint, 1.0, p, t);
}

void main() {
  // which slice of the distance from the eye this pixel belongs to, and its ray
  vec2 cellf = vUv * vec2(float(COLS), float(ROWS));
  int slice = cloudSliceAt(cellf);
  if (slice >= uSliceCount) { fragColor = vec4(0.0); return; }
  vec2 uv = fract(cellf), ndc = uv * 2.0 - 1.0;
  gHazeUv = uv;
  vec3 dir = normalize(uCamFwd + uCamRight * (ndc.x * uProj.x * uProj.y) + uCamUp * (ndc.y * uProj.x));
  gDir = dir;
  bool far = slice >= NEAR_SLICES;      // (the two far slices hold the storm cells alone)
  // (slices by distance from the eye, not by depth along the view: a cloud must not pass from
  // one slice to another because the view was turned)
  float tA = uSliceZ[slice], tB = uSliceZ[slice + 1];
  // the stretch of the ray inside the layer (between two spheres round the world: the lowest
  // base and the highest top within reach, which can only shorten the march)
  float rc = length(uCamPlanetPos), rb = uLayer.x, rt = uLayer.x + uLayer.y;
  float b = dot(uCamPlanetPos, dir), disc = b * b - rc * rc;
  float qt = disc + rt * rt, qb = disc + rb * rb;
  float t0 = 1.0, t1 = -1.0;
  if (qt > 0.0 && uLayerOn > 0.5) {
    float sT = sqrt(qt);
    if (rc < rb) { t0 = -b + sqrt(max(qb, 0.0)); t1 = -b + sT; }                               // below: up through the base to the top
    else if (rc < rt) { t0 = 0.0; t1 = (qb > 0.0 && b < 0.0) ? -b - sqrt(qb) : -b + sT; }      // inside: to the top, or down to the base
    else { t0 = -b - sT; t1 = (qb > 0.0) ? -b - sqrt(qb) : -b + sT; if (t0 < 0.0) { t0 = 1.0; t1 = -1.0; } }   // above: in through the top
  }
  t0 = max(t0, tA); t1 = min(t1, tB);
  if (far) { t0 = 1.0; t1 = -1.0; }
  // the cells this ray crosses in this slice, and the stretch they ask for
  cloudFindCells(uCamPlanetPos, dir, tA, tB);
  float cA = 1e30, cB = -1e30;
  for (int c = 0; c < 2; c++) {
    if (c >= gCells) break;
    cA = min(cA, gCellT[c].x); cB = max(cB, gCellT[c].y);
  }
  // (the stretch to march: the layer's, the cells', or the hull of both. The layer's is empty
  // when the ray misses it, and 'empty' is t0 > t1: taking its smaller end then would start the
  // march at a metre from the eye and spread its steps over everything in between.)
  bool haveLayer = t1 > t0;
  float mA = haveLayer ? (gCells > 0 ? min(t0, cA) : t0) : cA;
  float mB = haveLayer ? (gCells > 0 ? max(t1, cB) : t1) : cB;
  if (mB <= mA) { fragColor = vec4(0.0); return; }

  // steps: short near the eye, longer farther off; started at a different place in every pixel
  // so the layers of the march do not show
  float n = far ? uLayer.w : uLayer.z;
  if (gCells > 0 && !far) n = min(n * 1.7, 16.0);
  float L = mB - mA;
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  // (the far slices are cut to clean shapes when they are laid: less grain there, a little banding instead)
  float jw = slice >= 2 ? 0.4 : 1.0;
  vec3 mid = uCamPlanetPos + dir * (mA + 0.4 * L);
  vec3 upM = normalize(mid);
  gSunC = directSun(mid); gSkyC = skyLight(upM, upM); gSkyDown = skyLight(-upM, upM);
  gCs = dot(dir, uSunDir);
  // (forward: the bright rim round the Sun; back: a soft glow away from it)
  gPhase = 0.55 * (1.0 - 0.72 * 0.72) / pow(1.0 + 0.72 * 0.72 - 2.0 * 0.72 * gCs, 1.5) + 0.45 * (1.0 - 0.04) / pow(1.04 + 0.4 * gCs, 1.5);
  gMu0 = max(dot(upM, uSunDir), 0.0);
  gSigma = 0.012 * uDense;
  vec3 camQ = skyToLow(uCloudSteer, uCamPlanetPos), dirQ = skyToLow(uCloudSteer, dir), sunQ = skyToLow(uCloudSteer, uSunDir);
  gCamQ = camQ; gDirQ = dirQ; gSunQ = sunQ;
  // The Sun the mid and high layers leave for the cloud below them: one read a ray (a storm's
  // anvil and a front's veil put the heaps under them in shade).
  if (uSkyLow.w > 0.5) {
    vec4 B = skyTex2(tWxB, wxUV(upM));
    gSunC *= exp(-${glf(K.MID_K)} * wxMid(B) - ${glf(K.HIGH_K)} * wxHigh(B));
  }
  // Inside a deep cloud no shape can be seen: every way one looks is the same grey. What is seen
  // in a real one is the cloud lighter and darker in great soft patches going by: taken from the
  // noise a few hundred metres off along the ray (one look a pixel, in the low layer's pattern).
  gWisp = 1.0;
  if (!far && mA < 1000.0) {
    vec3 wq = marchPattern(gCamQ, gDirQ, 450.0);
    gWisp = 0.55 + 0.6 * skyTex3(tCloudNoise, wq * 6.0).g + 0.3 * skyTex3(tCloudNoise, wq * 15.0 + 0.4).g;
  }
  gT = 1.0; gC = vec3(0.0); gTMean = 0.0; gWSum = 0.0;
  // the country the rain falls onto (one read a ray; its foot turns to mist over it)
  float country = 0.0;
  if (uShaft.x > 0.0 && uSkyLow.w > 0.5) country = wxCountry(skyTex2(tWxC, wxUV(upM)));
  float sA = 1.0, sB = -1.0;
  if (uShaft.x > 0.0) {
    // Where the rain is on this ray: each raining cell's own shaft (an exact chord, no read),
    // and, where a deck is raining within reach, the stretch under the highest base there.
    for (int c = 0; c < 2; c++) {
      if (c >= gCells) break;
      vec2 q = cellShaftChord(gCellK[c], uCamPlanetPos, dir);
      if (q.y > q.x) { sA = min(sA > sB ? q.x : sA, q.x); sB = max(sB, q.y); }
    }
    if (uShaft.x > 1.5) {
      float rr = uSkyLow.y + uShaft.w, qr = disc + rr * rr;
      if (qr > 0.0) {
        float sq = sqrt(qr), lo = max(-b - sq, 0.0), hi = -b + sq;
        if (hi > lo) { sA = min(sA > sB ? lo : sA, lo); sB = max(sB, hi); }
      }
    }
    sA = max(sA, tA); sB = min(sB, tB);
  }

  // ---- the cloud, and the rain under it, in the order the ray meets them ----
  // The ray is marched in up to three stretches, in order: the layer up to the first cell, the
  // cell itself (with its own steps: a tower is five kilometres of cloud, and the layer's steps
  // would cross it in two), then the layer again. A second cell is still seen in the layer's
  // stretches, more coarsely.
  bool shaftFirst = sB > sA && sA < mA;
  if (shaftFirst) cloudShafts(sA, min(sB, mA), country);
  float layerLen = max(t1 - t0, 1.0);
  float c0 = gCells > 0 ? gCellT[0].x : 1e30, c1 = gCells > 0 ? gCellT[0].y : -1e30;
  for (int seg = 0; seg < 3; seg++) {
    if (gT < 0.02) break;
    float a, b, ns;
    if (seg == 0) { a = mA; b = min(mB, c0); ns = n * clamp((b - a) / layerLen, 0.0, 1.0); }
    else if (seg == 1) { a = max(mA, c0); b = min(mB, c1); ns = far ? max(n, 4.0) : clamp(n * 1.2, 6.0, 14.0); }
    else { a = max(mA, c1); b = mB; ns = n * clamp((b - a) / layerLen, 0.0, 1.0); }
    if (b <= a) continue;
    ns = max(ns, 2.0);
    float Ls = b - a;
    for (float i = 0.0; i < 16.0; i += 1.0) {
      if (i >= ns || gT < 0.02) break;
      float t = a + Ls * (i + 0.5 + (jit - 0.5) * jw) / ns, dt = Ls / ns;
      cloudStep(t, dt, far);
    }
  }
  if (!shaftFirst) cloudShafts(max(sA, mB), sB, country);

  // (cut off at a fiftieth, the march has let that much through: stretched so the thickest cloud
  // lets nothing through. The Sun's disc is tens of thousands of times white.)
  float alpha = clamp((1.0 - gT) / 0.98, 0.0, 1.0);
#ifdef CLOUD_READS
  // (the march compiled to count: the reads this ray made, the steps it took, what it gathered)
  fragColor = vec4(gSkyReads, n, alpha, 1.0);
  return;
#endif
  if (alpha < 0.003) { fragColor = vec4(0.0); return; }
  float tMean = gTMean / max(gWSum, 1e-5);
  // the cloud's own brightness, seen through the air between it and the eye
  vec3 col = aerialPerspective(gC / alpha / PI, dir * tMean);
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

// The march's grain taken out: every pixel of every slice's picture becomes the mean of four
// looks round it (the march starts at a different depth in every pixel).
const SMOOTH = /* glsl */`
uniform sampler2D tCloudPass;
uniform vec2 uPixel;           // a pixel of the part in use
uniform vec2 uUsed;            // the part of the target that is in use
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
void main() {
  // (kept inside this slice's own picture: its neighbours are other slices)
  vec2 cells = vec2(float(COLS), float(ROWS)), cell = min(floor(vUv * cells), cells - 1.0), lo = cell / cells + 0.5 * uPixel, hi = (cell + 1.0) / cells - 0.5 * uPixel;
  #define TAP(o) texture(tCloudPass, clamp(vUv + uPixel * o, lo, hi) * uUsed)
  fragColor = 0.25 * (TAP(vec2(1.2, 0.45)) + TAP(vec2(-0.45, 1.2)) + TAP(vec2(-1.2, -0.45)) + TAP(vec2(0.45, -1.2)));
}`;

// All the cloud along each line of sight, whatever slices it lies in: one small picture (a
// slice's size), made once a frame from the eight. The passes that lay the slices cut the
// cloud's clean edge by it. (Each of them used to work it out for itself at every pixel it drew
// cloud on: forty-two texture reads on a pixel with cloud in every slice. On the test phone the
// volume cost 9.4 ms a frame from the air.)
const ALL = /* glsl */`
uniform sampler2D tCloudPass;
uniform vec2 uPixel;           // a pixel of the part in use
uniform vec2 uUsed;            // the part of the target that is in use
uniform int uSliceCount;
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
${SLICE_GLSL}
void main() {
  vec2 cells = vec2(float(COLS), float(ROWS)), uv = clamp(vUv, 0.5 * uPixel * cells, 1.0 - 0.5 * uPixel * cells);
  float through = 1.0;
  for (int j = 0; j < SLICES; j++) {
    if (j >= uSliceCount) break;
    through *= 1.0 - texture(tCloudPass, (cloudTile(float(j)) + uv) / cells * uUsed).a;
  }
  fragColor = vec4(1.0 - through);
}`;

const LAY = /* glsl */`
uniform sampler2D tCloudPass;
uniform sampler2D tCloudAll;   // all the cloud along the line of sight (the ALL pass)
uniform float uSlice;          // which slice this pass lays
uniform vec2 uPixel;           // a pixel of the part in use
uniform vec2 uUsed;            // the part of the target that is in use
uniform float uCrisp;          // how clean the cloud's edge is cut (0: as marched, soft; 1: a clean shape)
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
${SLICE_GLSL}
void main() {
  vec2 cells = vec2(float(COLS), float(ROWS)), cell = cloudTile(uSlice);
  vec2 uv = clamp(vUv, 0.5 * uPixel * cells, 1.0 - 0.5 * uPixel * cells);
  vec4 c = texture(tCloudPass, (cell + uv) / cells * uUsed);
  if (c.a < 0.003) discard;
  // The painted look: a cloud is a shape with a clean edge, cut out of the soft mass the march
  // gives. The cut goes by all the cloud along the line of sight, in whatever slices it lies:
  // cut slice by slice, a cloud thinned and changed its outline as the boundary between two
  // slices passed through it, which is to say whenever the traveller moved.
  if (uCrisp > 0.0) {
    float all = texture(tCloudAll, uv * uUsed).r;
    c *= mix(1.0, smoothstep(0.18, 0.5, all) / max(all, 0.003), uCrisp);
  }
  fragColor = c;
}`;

// The two far slices, laid over the whole view with each pixel's own depth: the distance at
// which its ray enters the nearest cell it crosses. So a ridge in front of a storm hides it (and
// its shaft's foot), while a tower nearer than a ridge beyond it is drawn over that ridge. The
// depth pass writes the same depth where the cloud is nearly solid, so the shells and the far
// heaps behind a tower are hidden by it.
const LAY_FAR = /* glsl */`
precision highp float;
uniform sampler2D tCloudPass;
uniform sampler2D tCloudAll;
uniform float uSlice;
uniform vec2 uPixel, uUsed;
uniform float uCrisp;
uniform vec4 uProj;            // x tan(half the view angle), y aspect, z near, w far
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform vec3 uCamPlanetPos;
uniform float uDepthOnly;      // 1: write depth alone, where the core is nearly solid
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
${CELL_GLSL}
${SLICE_GLSL}
void main() {
  vec2 cells = vec2(float(COLS), float(ROWS)), cell = cloudTile(uSlice);
  vec2 uv = clamp(vUv, 0.5 * uPixel * cells, 1.0 - 0.5 * uPixel * cells);
  vec4 c = texture(tCloudPass, (cell + uv) / cells * uUsed);
  if (c.a < (uDepthOnly > 0.5 ? 0.6 : 0.003)) discard;
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 tang = uCamRight * (ndc.x * uProj.x * uProj.y) + uCamUp * (ndc.y * uProj.x);
  vec3 dir = normalize(uCamFwd + tang);
  // where this ray meets the nearest cell (the same rule the march used)
  float t = 1e30;
  for (int k = 0; k < CELL_MAX; k++) {
    if (k >= uCellCount) break;
    vec2 ch = cellChord(k, uCamPlanetPos, dir);
    if (ch.y > ch.x && ch.y > 0.0) t = min(t, max(ch.x, 0.0));
  }
  if (t > 1e29) discard;
  // the depth that distance has along this ray, as the near slices' sheets are laid
  float z = t * dot(dir, uCamFwd), n = uProj.z, f = uProj.w;
  if (z <= n) discard;
  gl_FragDepth = 0.5 * clamp((f + n) / (f - n) - 2.0 * f * n / ((f - n) * z), -1.0, 1.0) + 0.5;
  if (uDepthOnly > 0.5) { fragColor = vec4(0.0); return; }
  if (uCrisp > 0.0) {
    float all = texture(tCloudAll, uv * uUsed).r;
    c *= mix(1.0, smoothstep(0.18, 0.5, all) / max(all, 0.003), uCrisp);
  }
  fragColor = c;
}`;

// The slices of the distance from the eye (m): six near ones to the volume's reach, then the two
// that hold the storm cells alone, out to CELL_FAR. They are laid out in the small target down a
// column first, so the near six fill the first three columns and the far two the fourth: with no
// storm beyond the reach the fourth column is neither marched nor read.
const SLICE_Z = [0, 300, 900, 2400, 5000, 9000], NEAR_SLICES = 6, FAR_MID = 40000, CELL_FAR = 200000;
const COLS = 4, ROWS = 2, SLICES = COLS * ROWS, SMALL = 4;
// flashes that light the cloud from inside at once (the plan's two, in the near and far slices)
export const BOLTS = 2;

export class CloudVolume {
  constructor(renderer) {
    this.renderer = renderer;
    this._enabled = true; this.cellsOnly = false; this.steps = 36; this.def = null; this.noise = null; this.active = false;
    this.target = null; this.tw = 0; this.th = 0; this.farOn = false; this.shafts = true; this.shaftThin = false;
    this.out = new Set();
    this.bounds = { base: 0, baseHi: 0, top: 0 };
    this.uniforms = {
      ...lightingUniforms(), tCloudNoise: SKY_UNIFORMS.tCloudNoise, tCloudMap: { value: null }, uSliceZ: { value: new Float32Array(SLICES + 1) },
      uSliceCount: { value: NEAR_SLICES }, uDense: { value: 1 }, uStorm: { value: 0 }, uFair: { value: new THREE.Vector2(0, 300) }, uFieldK: { value: 1 },
      uCloud: { value: new THREE.Vector4(0.5, 0, 1 / 5200, 16000) }, uLayer: { value: new THREE.Vector4(1, 1, 26, 0) },
      uCamRight: { value: new THREE.Vector3() }, uCamUp: { value: new THREE.Vector3() }, uCamFwd: { value: new THREE.Vector3() },
      uProj: { value: new THREE.Vector4() }, uCloudSteer: SKY_UNIFORMS.uCloudSteer, uCloudRise: SKY_UNIFORMS.uCloudRise,
      uSkyLow: SKY_UNIFORMS.uSkyLow, tWxA: SKY_UNIFORMS.tWxA, tWxB: SKY_UNIFORMS.tWxB, tWxC: SKY_UNIFORMS.tWxC,
      uCells: SKY_UNIFORMS.uCells, uCellCount: SKY_UNIFORMS.uCellCount,
      uBolt: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uShaft: { value: new THREE.Vector4(1, 0, 0, 0) }, uLayerOn: { value: 1 },
    };
    const defs = { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1, HAZE_UV: 1, SLICES, COLS, ROWS, NEAR_SLICES, BOLTS, CELL_MAX };
    this.march = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: defs, uniforms: this.uniforms, vertexShader: VERT, fragmentShader: MARCH, depthTest: false, depthWrite: false });
    this.allMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: { COLS, ROWS, SLICES }, uniforms: { tCloudPass: { value: null }, uPixel: { value: new THREE.Vector2() }, uUsed: { value: new THREE.Vector2(1, 1) }, uSliceCount: this.uniforms.uSliceCount }, vertexShader: VERT, fragmentShader: ALL, depthTest: false, depthWrite: false });
    this.smoothMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: { COLS, ROWS }, uniforms: { tCloudPass: { value: null }, uPixel: { value: new THREE.Vector2() }, uUsed: { value: new THREE.Vector2(1, 1) } }, vertexShader: VERT, fragmentShader: SMOOTH, depthTest: false, depthWrite: false });
    // A slice is laid as a sheet at the distance where it begins: a grid over the view, each
    // corner at the depth that distance has along its own ray.
    this.layMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { COLS, ROWS, SLICES },
      uniforms: { tCloudPass: { value: null }, tCloudAll: { value: null }, uSlice: { value: 0 }, uPixel: { value: new THREE.Vector2() }, uUsed: { value: new THREE.Vector2(1, 1) }, uCrisp: { value: 0 }, uY: { value: new THREE.Vector2(-1, 1) }, uSheet: { value: new THREE.Vector4() }, uDist: { value: 0 } }, vertexShader: /* glsl */`
        uniform vec2 uY;         // the part of the view's height this slice can show cloud in (-1 bottom .. 1 top)
        uniform vec4 uSheet;     // x: tan(half the view angle) across, y: up and down, z: near, w: far
        uniform float uDist;     // how far from the eye the slice begins (m)
        out vec2 vUv;
        void main() {
          float y = mix(uY.x, uY.y, position.y * 0.5 + 0.5);
          vUv = vec2(position.x, y) * 0.5 + 0.5;
          vec2 q = vec2(position.x * uSheet.x, y * uSheet.y);
          float z = uDist / sqrt(1.0 + dot(q, q)), n = uSheet.z, f = uSheet.w;
          gl_Position = vec4(position.x, y, z <= n ? -1.0 : min(1.0, (f + n) / (f - n) - 2.0 * f * n / ((f - n) * z)), 1.0);
        }`,
      fragmentShader: LAY, depthTest: true, depthFunc: THREE.LessEqualDepth, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 24, 12), this.layMat); this.sheet.frustumCulled = false;
    this.sheetScene = new THREE.Scene(); this.sheetScene.add(this.sheet);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(tri, this.march); this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.camera = new THREE.Camera();
    // the far slices: one full-screen pass each, with every pixel's own depth
    this.farMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { COLS, ROWS, SLICES, CELL_MAX },
      uniforms: {
        tCloudPass: { value: null }, tCloudAll: { value: null }, uSlice: { value: NEAR_SLICES }, uPixel: { value: new THREE.Vector2() }, uUsed: { value: new THREE.Vector2(1, 1) },
        uCrisp: { value: 0 }, uProj: this.uniforms.uProj, uCamRight: this.uniforms.uCamRight, uCamUp: this.uniforms.uCamUp, uCamFwd: this.uniforms.uCamFwd,
        uCamPlanetPos: this.uniforms.uCamPlanetPos, uDepthOnly: { value: 0 }, uCells: SKY_UNIFORMS.uCells, uCellCount: SKY_UNIFORMS.uCellCount,
      },
      vertexShader: VERT, fragmentShader: LAY_FAR, depthTest: true, depthFunc: THREE.LessEqualDepth, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.farQuad = new THREE.Mesh(tri, this.farMat); this.farQuad.frustumCulled = false;
    this.farScene = new THREE.Scene(); this.farScene.add(this.farQuad);
    this.bolts = [];
  }

  setWorld(world) {
    this.def = world.clouds?.volume ? world.clouds : null;
    this.radius = world.radius;
    this.world = world;
    this.bounds.base = 0; this.bounds.baseHi = 0; this.bounds.top = 0;
    if (this.def && !this.noise && !this.asked && typeof Worker !== 'undefined') {
      this.asked = true;
      const w = new Worker(new URL('./cloudNoiseWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => {
        const N = ev.data.n, tex = new THREE.Data3DTexture(new Uint8Array(ev.data.buffer), N, N, N);
        tex.format = THREE.RGFormat; tex.type = THREE.UnsignedByteType; tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping; tex.unpackAlignment = 1; tex.generateMipmaps = false; tex.needsUpdate = true;
        this.renderer.initTexture(tex);
        this.noise = tex; SKY_UNIFORMS.tCloudNoise.value = tex; w.terminate();
      };
      w.postMessage({ n: 64 });
    }
  }

  // True while the noise is still being made (screenshots wait for it).
  get busy() { return !!this.def && !this.noise; }

  // The governor's last cloud step ('cloud-volume') puts the field's own heaps and decks on the
  // far shell. It does NOT take the storm cells away: they keep their towers, their darkness,
  // their rain and their strokes, marched at five steps a slice. (A step thins; it does not
  // remove what a place is about.)
  get enabled() { return this._enabled; }
  set enabled(v) { this._enabled = !!v; }
  get farSteps() { return this.steps <= 22 ? 5 : 8; }

  // Is the volume to be drawn this frame? cam: the camera's place (planet-fixed, m);
  // layer: the cloud shell (clouds.js: its map and whether it is on).
  ready(cam, layer) {
    const v = this.def?.volume;
    // (wanted: it would be drawn here if the governor's saving were not on: the governor asks)
    this.wanted = !!(v && this.noise && layer.mesh.visible && cam.length() - this.radius < (v.above ?? 30000));
    // (with the layer off, the cells are still marched while one stands within reach: the last
    // frame's list, since this is asked before the sky's frame reaches us)
    const cells = this._sky?.cells || [];
    this.cellsOnly = this.wanted && !this._enabled && cells.some((c) => c.dist < CELL_FAR);
    this.active = this.wanted && (this._enabled || this.cellsOnly);
    return this.active;
  }
  get reach() { return this.def?.volume?.reach ?? 16000; }

  // Where the clouds' base stands: the lowest base and the highest top of the field within
  // reach, snapped to 250 m and only ever widened by a step that has lasted (they shorten the
  // march and nothing else: no value of a cloud comes from them). With no field, the world's own
  // base over the sea.
  place(cam, sky = this._sky || null) {
    const v = this.def?.volume;
    if (!v) { this.base = null; return; }
    const field = sky?.field, R = this.radius;
    // (a world whose weather has no field yet: the base stands the world file's height over the
    // country smoothed round the traveller, as it did before the field — the whole sky's base
    // then shifts a little as one flies, which is the very fault the field puts right. This path
    // goes when every world has a field; until then it keeps Earth as it was.)
    if (!field?.on) {
      this.lift = this.groundAt ? this.groundAt(cam) : 0;
      this.base = (v.base ?? 1500) + this.lift; this.top = this.base + (v.thick ?? 3000);
      this.bounds.base = this.base; this.bounds.baseHi = this.base; this.bounds.top = this.top; this.rainNear = false;
      return;
    }
    // (nine places: under the traveller and eight round it at the reach, which is as far as the
    // layer is marched; a base is a thing of the country, smoothed over kilometres, so the
    // lowest and highest within reach are not missed between them)
    const reach = this.reach, out = this._at || (this._at = makeSkyAt());
    let lo = Infinity, loHi = 0, hi = -Infinity, rain = 0;
    const look = (p) => {
      const a = field.at(p, sky.t, out);
      if (a.base < lo) lo = a.base;
      if (a.base > loHi) loHi = a.base;
      if (a.top > hi) hi = a.top;
      if (a.field.rain > rain) rain = a.field.rain;
    };
    const r = cam.length(), east = [-cam.y, cam.x, 0], el = Math.hypot(east[0], east[1]) || 1;
    east[0] /= el; east[1] /= el;
    const up = [cam.x / r, cam.y / r, cam.z / r];
    const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
    const p = [0, 0, 0];
    look([cam.x, cam.y, cam.z]);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, ce = Math.cos(a) * reach, cn = Math.sin(a) * reach;
      for (let k = 0; k < 3; k++) p[k] = cam.getComponent(k) + east[k] * ce + north[k] * cn;
      look(p);
    }
    if (!(lo < Infinity)) { lo = v.base ?? 1500; loHi = lo; hi = lo + (v.thick ?? 3000); }
    // (snapped to 250 m with a margin either way, and only changed when the step has lasted: a
    // bound that followed every frame's reading would shorten the march by a different amount
    // every frame, and a cloud at its edge would flicker)
    const step = 250, baseWant = Math.floor((lo - step) / step) * step, topWant = Math.ceil((hi + step) / step) * step;
    const b = this.bounds;
    if (!b.top || baseWant < b.base - 1 || baseWant > b.base + step + 1) b.base = baseWant;
    if (!b.top || topWant > b.top + 1 || topWant < b.top - step - 1) b.top = topWant;
    const hiWant = Math.ceil((loHi + step) / step) * step;
    if (!b.baseHi || hiWant > b.baseHi + 1 || hiWant < b.baseHi - step - 1) b.baseHi = hiWant;
    this.base = b.base; this.top = Math.max(b.top, b.base + 500);
    // (is any rain falling within reach? Where none is, the shafts' looks into the field are not
    // made at all: a fair day pays nothing for them)
    this.rainNear = rain > 0.05;
  }

  // The world's coarse elevation (its first bundled raster: whole-world, Int16 metres), for
  // the height the cloud base stands over. null: none.
  setGround(raster) {
    if (!raster || !raster.wrap) { this.groundAt = null; return; }
    const { data, width: W, height: H } = raster, lon0 = raster.lon0 ?? 0, lat0 = raster.lat0 ?? 90, lat1 = raster.lat1 ?? -90;
    const at = (lat, lon) => {
      const fx = (((lon - lon0) / 360) % 1 + 1) % 1 * W - 0.5, fy = Math.min(H - 1.001, Math.max(0, (lat0 - lat) / (lat0 - lat1) * H - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, xa = ((x0 % W) + W) % W, xb = (xa + 1) % W;
      const sc = raster.scale ?? 1, h = (x, y) => Math.max(0, data[y * W + x] * sc);
      return (h(xa, y0) * (1 - tx) + h(xb, y0) * tx) * (1 - ty) + (h(xa, y0 + 1) * (1 - tx) + h(xb, y0 + 1) * tx) * ty;
    };
    this.groundAt = (p) => {
      const len = p.length(), lat = Math.asin(p.z / len) * 57.29578, lon = Math.atan2(p.y, p.x) * 57.29578, k = 1 / Math.max(0.2, Math.cos(lat / 57.29578));
      let sum = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += at(Math.max(-89.9, Math.min(89.9, lat + j * 0.4)), lon + i * 0.4 * k);
      return sum / 9;
    };
  }

  // Lightning inside the cloud: the uBolt setter (sky/skySystem.js calls it each frame with the
  // flashes package D hands it). list: up to BOLTS of { pos: [x, y, z] planet axes (m), power }.
  setBolts(list) {
    this.bolts.length = 0;
    if (list) for (const b of list) { if (this.bolts.length >= BOLTS) break; if (b && b.power > 0) this.bolts.push(b); }
  }

  // The governor's savings and the benchmark's parts (sky/skySystem.js calls these).
  saving(id, off) {
    if (id === 'rain-shafts') this.shaftThin = !!off;
    else if (id === 'cloud-steps') this.steps = off ? 22 : 36;
  }
  live(id) { return id === 'rain-shafts' ? !!this.wanted && this.shafts > 0 : !!this.wanted; }
  has(id) { return id === 'rain-shafts' || id === 'cells-far'; }
  partOut(id, out) { if (out) this.out.add(id); else this.out.delete(id); }

  // Step 1: the small picture, before the main one is begun. post: the Post (for the view's
  // size); rig: the camera rig; time (s, the wall clock); layer: the cloud shell; wind: the
  // terrain's wind uniform (not read: the clouds' motion is the steering's); weather:
  // weather.js (a world without a field: its storminess); sky: the sky system's frame.
  render(post, rig, time, layer, wind, weather, sky = null) {
    const r = this.renderer, v = this.def.volume, u = this.uniforms;
    const field = sky?.field, hasField = !!field?.on;
    this._sky = sky;
    this.place(rig.pos, sky);
    const base = this.base, thick = Math.max(500, this.top - this.base);
    // (a world with no field: the storm the world's weather gives, eased in as before)
    const storm = hasField ? 0 : (weather?.storminess || 0), squall = hasField ? 0 : (weather?.squall || 0);
    this.stormNow = this.stormNow == null || this.lastTime == null || time < this.lastTime ? storm : this.stormNow + (storm - this.stormNow) * Math.min(1, 1.2 * Math.min(0.2, time - this.lastTime));
    const sN = this.stormNow;
    // (lightning inside the cloud: what the sky system handed over, setBolts; camera-relative here)
    for (let b = 0; b < BOLTS; b++) {
      const bolt = this.bolts[b];
      if (bolt && bolt.power > 0) u.uBolt.value[b].set(bolt.pos[0] - rig.pos.x, bolt.pos[1] - rig.pos.y, bolt.pos[2] - rig.pos.z, bolt.power);
      else u.uBolt.value[b].set(0, 0, 0, 0);
    }
    // Is a cell standing beyond the reach? Only then are the two far slices marched and laid.
    const cells = sky?.cells || [];
    this.farOn = !this.out.has('cells-far') && cells.some((c) => c.dist > this.reach && c.dist < CELL_FAR);
    // (with the layer off the far shell shows it everywhere: it must not fade out near the
    // traveller, who would then fly through a hole in the sky)
    u.uLayerOn.value = this.cellsOnly ? 0 : 1;
    if (this.cellsOnly) layer.uniforms.uNearFade.value = 0;
    const slices = this.farOn ? SLICES : NEAR_SLICES;
    u.uSliceCount.value = slices;
    this.hasCellsNear = cells.some((c) => c.dist < this.reach + 6000);
    // (rain falls out of the cloud above: only a world whose weather says where it rains has it)
    // (0: none; 1: the cells' shafts alone; 2: a deck is raining within reach as well)
    const cellRain = cells.some((c) => c.dist < CELL_FAR && c.rain > 0);
    this.shafts = hasField && !this.out.has('rain-shafts') && (this.rainNear || cellRain) ? (this.rainNear ? 2 : 1) : 0;
    const phase = ((sky?.noiseT ?? 0) * K.SHAFT_FALL / (v.scale ?? 5200) * 1.7) % 1;
    u.uShaft.value.set(this.shafts, this.shaftThin ? 1 : 0, phase < 0 ? phase + 1 : phase, this.bounds.baseHi || base);
    // The target is as large as the view can ever be (eight pictures of a quarter of the canvas
    // each way) and only the part the governor's resolution asks for is used, as with the main
    // picture: made anew at every resolution step it cost an allocation in the middle of the
    // very frames that were late already.
    const fw = Math.max(8, Math.ceil(post.width / SMALL)) * COLS, fh = Math.max(4, Math.ceil(post.height / SMALL)) * ROWS;
    if (!this.target || this.fw !== fw || this.fh !== fh) {
      this.target?.dispose(); this.smooth?.dispose(); this.all?.dispose();
      // (all the cloud along each line of sight: one slice's size, one number a pixel, 16 bits:
      // the clean edge is cut where it passes 0.18 to 0.5, and steps of a 255th would show in it)
      this.all = new THREE.WebGLRenderTarget(fw / COLS, fh / ROWS, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
      this.all.texture.wrapS = this.all.texture.wrapT = THREE.ClampToEdgeWrapping; this.all.scissorTest = true;
      const make = () => { const t = new THREE.WebGLRenderTarget(fw, fh, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false }); t.texture.wrapS = t.texture.wrapT = THREE.ClampToEdgeWrapping; t.scissorTest = true; return t; };
      this.target = make(); this.smooth = make();          // (as marched; and with the grain taken out)
      this.fw = fw; this.fh = fh;
    }
    const tileW = Math.max(8, Math.round(post.viewW / SMALL)), tileH = Math.max(4, Math.round(post.viewH / SMALL));
    // The whole of the view that the slices are laid out in (every tile at its own place), and
    // the part of it that is drawn: the slices go down a column first, so the six near ones are
    // the first three columns and with no storm beyond the reach the fourth is neither drawn nor
    // read, and the target is used in part exactly as it was before the far slices.
    const tw = tileW * COLS, th = tileH * ROWS, twUsed = tileW * (this.farOn ? COLS : Math.ceil(slices / ROWS));
    this.tw = tw; this.th = th; this.tileW = tileW; this.tileH = tileH;
    for (const t of [this.target, this.smooth]) { t.viewport.set(0, 0, tw, th); t.scissor.set(0, 0, twUsed, th); }
    u.uCamRight.value.copy(rig.right); u.uCamUp.value.copy(rig.up); u.uCamFwd.value.copy(rig.forward);
    u.uProj.value.set(Math.tan(rig.fov * Math.PI / 360), post.viewW / post.viewH, 0, 0); this.aspect = post.viewW / post.viewH;
    const z = u.uSliceZ.value;
    for (let k = 0; k < NEAR_SLICES; k++) z[k] = SLICE_Z[k];
    z[NEAR_SLICES] = this.reach; z[NEAR_SLICES + 1] = FAR_MID; z[SLICES] = CELL_FAR;
    // (no ray meets the layer nearer than the traveller's distance below its base or above its top)
    const altNow = rig.pos.length() - this.radius;
    this.below = altNow < base; this.minDist = this.hasCellsNear ? 0 : altNow < base ? base - altNow : altNow > base + thick ? altNow - base - thick : 0;
    u.uStorm.value = Math.min(1, sN + 0.4 * squall);
    u.uDense.value = (v.dense ?? 1) * (1 + 0.45 * sN + 0.35 * squall); u.uFair.value.set(hasField ? 0 : (v.fair ?? 0), v.clear ?? 120); u.uFieldK.value = this.radius / (v.scale ?? 5200) * 0.11;
    u.tCloudMap.value = layer.texture;
    u.uCloud.value.set(this.def.cover ?? 0.8, this.def.lon0 === -180 ? 0.5 : 0, 1 / (v.scale ?? 5200), this.reach);
    // (the governor's step count is for the whole ray: shared out among the near slices)
    u.uLayer.value.set(this.radius + base, thick, this.cellsOnly ? 5 : Math.max(3, Math.round(this.steps / NEAR_SLICES) + 1), this.farSteps);
    this.lastTime = time;
    this.quad.material = this.march;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0); r.clear(true, false, false);
    r.render(this.scene, this.camera);
    const su = this.smoothMat.uniforms;
    su.tCloudPass.value = this.target.texture; su.uPixel.value.set(1 / tw, 1 / th); su.uUsed.value.set(tw / fw, th / fh);
    this.quad.material = this.smoothMat;
    r.setRenderTarget(this.smooth);
    r.clear(true, false, false);
    r.render(this.scene, this.camera);
    // (only where the cloud is cut to clean shapes: the painted look)
    if (G.uPaint.value.x > 0) {
      const au = this.allMat.uniforms;
      au.tCloudPass.value = this.smooth.texture; au.uPixel.value.set(1 / tw, 1 / th); au.uUsed.value.set(tw / fw, th / fh);
      this.all.viewport.set(0, 0, tileW, tileH); this.all.scissor.set(0, 0, tileW, tileH);
      this.quad.material = this.allMat;
      r.setRenderTarget(this.all);
      r.clear(true, false, false);
      r.render(this.scene, this.camera);
    }
  }

  // The far cell sheets, first in the picture: colour with each pixel's own depth, then a
  // depth-only pass where a core is nearly solid. c: { renderer, rig, near, far }.
  layFar(c) {
    if (!this.active || !this.farOn) return;
    const u = this.farMat.uniforms;
    u.tCloudPass.value = this.smooth.texture; u.tCloudAll.value = this.all.texture;
    u.uPixel.value.set(1 / this.tw, 1 / this.th); u.uUsed.value.set(this.tw / this.fw, this.th / this.fh);
    u.uCrisp.value = G.uPaint.value.x;
    this.uniforms.uProj.value.z = c.near; this.uniforms.uProj.value.w = c.far;
    for (let k = NEAR_SLICES; k < SLICES; k++) {
      u.uSlice.value = k;
      for (const depthOnly of [0, 1]) {
        u.uDepthOnly.value = depthOnly;
        this.farMat.depthWrite = depthOnly > 0;
        this.farMat.uniformsNeedUpdate = true;
        c.renderer.render(this.farScene, c.rig.camera);
      }
    }
    this.farMat.depthWrite = false;
  }

  // Step 2: over the main picture, once the ground is drawn. near, far: the planes it was drawn
  // with. From the farthest near slice to the nearest, each at the depth where it begins.
  lay(near, far, rig) {
    const r = this.renderer, m = this.layMat, u = m.uniforms;
    // From under the layer a slice that ends at a distance shows cloud only above some height in
    // the sky (a ray must climb to the base within that distance), from over it only below some
    // depth: each pass covers that part of the view and no more.
    const U = rig.localUp, dot = (v) => v.x * U[0] + v.y * U[1] + v.z * U[2];
    const sp = dot(rig.forward), cp = dot(rig.up), level = Math.abs(dot(rig.right)) < 0.03 && cp > 0.2 && this.minDist > 0 && !this.hasCellsNear;
    const pitch = Math.atan2(sp, cp), ty = Math.tan(rig.fov * Math.PI / 360);
    u.tCloudPass.value = this.smooth.texture; u.tCloudAll.value = this.all.texture;
    u.uPixel.value.set(1 / this.tw, 1 / this.th); u.uUsed.value.set(this.tw / this.fw, this.th / this.fh);
    u.uSheet.value.set(ty * this.aspect, ty, near, far); u.uCrisp.value = G.uPaint.value.x;
    for (let k = NEAR_SLICES - 1; k >= 0; k--) {
      const z = SLICE_Z[k], end = k + 1 < NEAR_SLICES ? SLICE_Z[k + 1] : this.reach;
      if (z >= far || end < this.minDist) continue;
      let y0 = -1, y1 = 1;
      if (level) {
        const el = Math.asin(Math.min(1, this.minDist / end)) - 0.03;
        if (this.below) { const a = el - pitch; y0 = a > 1.4 ? 2 : a < -1.4 ? -1 : Math.max(-1, Math.tan(a) / ty); }
        else { const a = -el - pitch; y1 = a < -1.4 ? -2 : a > 1.4 ? 1 : Math.min(1, Math.tan(a) / ty); }
        if (y0 >= 1 || y1 <= -1) continue;
      }
      u.uY.value.set(y0, y1);
      u.uSlice.value = k; u.uDist.value = z;
      m.uniformsNeedUpdate = true;
      r.render(this.sheetScene, this.camera);
    }
  }
}
