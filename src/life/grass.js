// Grass round the traveller, with no end to it that one can see.
//
// Near by, tufts of bold blades; farther out, clumps (cards, each the cut-out picture of
// many blades) on coarser lattices, taller and wider the farther the lattice, out to some
// 500 m; beyond, the ground's own grass (terrain/terrainMaterial.js: its colour, the
// wind's waves on it, drifts of flowers) as far as the ground is drawn. Each field comes
// in over a stretch where the one inside it goes out, clump by clump growing from nothing
// and shrinking to nothing, never at one line: there is no ring.
//
// Every lattice is fixed to the ground and wraps round the camera, so moving brings no new
// geometry, only the places that leave behind coming in again ahead. Nothing is kept per
// tuft or clump: a place is its number on the lattice (gl_InstanceID) and a hash. What the
// ground is like there is read from tables kept on the CPU and sent as textures of four
// numbers a place (height above the world's datum, how much grass 0..1, how dry 0 green ..
// 1 gold, and the flowers: whole part which kind, fraction how many): 64 x 64 places
// 1.25 m apart for the blades, 128 x 128 4 m apart and 128 x 128 10 m apart for the
// clumps. They wrap too: only the rows that come in ahead are worked out, a few a frame,
// nearest first.
//
// All of it is measured on a plane through an anchor near the traveller (east, north, up).
// The anchor moves in whole steps of SNAP metres, which every lattice spacing and table
// cell divides, and its axes are carried over rather than worked out afresh, so a move of
// the anchor changes nothing that is drawn (places, hashes and tables are counted from an
// origin carried along with it). Heights are put where the round world has them: the plane
// falls away from the ground as d^2 / 2R (0.7 m at 600 m on Haven).
//
// A world has grass if it lists `life.grass` ({ below: metres above the ground under which
// the blades are drawn, mid: under which the clumps are }) and its tiles give a land-cover
// picture.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';
import { TREE_SHADE_VERT, TREE_SHADE_UNIFORMS } from './treeShade.js';
import { renderPass } from '../render/fullscreen.js';
import { AMOUNT, DRY, KINDS, floraAt, flowersAt, flowerTable, FLOWERS_GLSL, GRASS_GLSL, GRASS_GROUND, WAVE_K } from './grassRules.js';

const SHADE_N = 36, SHADE_CELL = 40, SHADE_MOVE = 120;   // the land's shadow for the far grass: places a side, metres between them, how far the traveller goes before it is asked again
const SNAP = 40;                 // the anchor moves in steps of this (m)
const RENEW = 60;                // ... when the traveller is this far from it
const PERIOD = 2560;             // the stretches of taller and drier grass repeat after this (m; a multiple of SNAP)
// The ground tables: places a side, metres between them.
const TABLES = { near: { n: 64, cell: 1.25 }, mid: { n: 128, cell: 4 }, far: { n: 128, cell: 10 } };
// The grass, ring by ring outward. All of it is blades: opaque triangles, no cut-out
// anywhere (on the phone the cut-out cards of the middle distance, lying twenty deep over
// each other toward the horizon, cost five times what all the blades did). A ring: cells a
// side, metres between them, blades a cell, a blade's half width at the eye (m) and how
// much wider it is for every metre of distance (far blades are broad teeth: fewer pixels
// across, the same mass), how tall against the nearest, which ground table, where it
// comes in and goes out (m from the eye), how far its blades are turned from facing the
// eye (radians, the whole spread), how far they lean back toward an eye above them, and
// how far a blade can stand from where its cell's middle is taken to be (m: for throwing
// out what is not in the picture).
// (every spacing divides SNAP, so nothing changes when the anchor steps)
export const RINGS = [
  { id: 'feet', grid: 96, spacing: 0.125, blades: 14, wide: 0.013, grow: 0.06, tall: 1, table: 'near', out: [4, 6], yaw: 2.6, back: 0, reach: 1.5, seed: 0 },
  { id: 'near', grid: 125, spacing: 0.32, blades: 12, wide: 0.015, grow: 0.05, tall: 1, table: 'near', in: [4, 6], out: [14, 20], yaw: 2.0, back: 0.5, reach: 1.8, seed: 37 },
  { id: 'nearer', grid: 160, spacing: 0.5, blades: 10, wide: 0.016, grow: 0.05, tall: 1.05, table: 'near', in: [14, 20], out: [30, 39], yaw: 1.6, back: 0.8, reach: 2, seed: 59 },
  { id: 'mid', grid: 150, spacing: 1.0, blades: 9, wide: 0.02, grow: 0.05, tall: 1.12, table: 'mid', in: [30, 39], out: [55, 74], yaw: 1.3, back: 1.2, reach: 3.5, seed: 11, far: true },
  { id: 'far', grid: 160, spacing: 2.5, blades: 6, wide: 0.04, grow: 0.03, tall: 1.3, table: 'mid', in: [55, 74], out: [140, 195], yaw: 1.3, back: 1.2, reach: 5, seed: 23, far: true },
  { id: 'farthest', grid: 220, spacing: 5.0, blades: 4, wide: 0.18, grow: 0.012, tall: 1.7, table: 'far', in: [140, 195], out: [320, 545], yaw: 1.3, back: 1.2, reach: 9, seed: 47, far: true },
];
// The flowers, as single plants: near the eye with leaves and fourteen petals; farther out six
// petals and no leaves, larger, as far as a flower can be told from the grass. Beyond, some
// blades of the far grass are stalks in flower (BLADE_VERT), and the ground has its dusting.
// light: which ring's stretch of the light table they read.
const FLOWERS = [
  { grid: 100, spacing: 0.32, seed: 91, table: 'near', out: [12, 15.5], petals: 14, leaves: 2, grow: 0.03, light: 1 },
  { grid: 128, spacing: 0.8, seed: 131, table: 'mid', in: [12, 15.5], out: [38, 50], petals: 6, leaves: 0, grow: 0.03, light: 3 },
];
// How many blades may lie over each other along a line of sight before the rest are left
// out, blade by blade (looked along at eye height a full field is twenty deep, and all but
// the front few are hidden), and the share of a field that is kept whatever the angle.
const LAYERS = 5, LAYERS_FLOOR = 0.12;
// The light on the ground round the traveller (GrassLight below): places a side for each ring.
const LIGHT_N = 96;

// --- shaders
// A ground table at a place of the plane (at, m from the anchor): the four entries round
// it, blended, and the ground's lie there (metres up per metre east and north).
const TABLE_GLSL = /* glsl */`
  vec4 tableAt(sampler2D t, vec4 info, vec2 at, out vec2 grad) {
    vec2 f = (at + info.xy) / info.z, i = floor(f), w = f - i;
    ivec2 a = ivec2(mod(i, info.w)), b = ivec2(mod(i + 1.0, info.w));
    vec4 t00 = texelFetch(t, a, 0), t10 = texelFetch(t, ivec2(b.x, a.y), 0), t01 = texelFetch(t, ivec2(a.x, b.y), 0), t11 = texelFetch(t, b, 0);
    vec4 g = mix(mix(t00, t10, w.x), mix(t01, t11, w.x), w.y);
    // (the height from the entries that have grass: one without may hold another place's
    // height until it is worked out, and pulled the tufts beside it into the air)
    vec4 has = step(0.001, vec4(t00.g, t10.g, t01.g, t11.g));
    vec4 k = vec4((1.0 - w.x) * (1.0 - w.y), w.x * (1.0 - w.y), (1.0 - w.x) * w.y, w.x * w.y) * (has + 0.001);
    g.r = dot(k, vec4(t00.r, t10.r, t01.r, t11.r)) / (k.x + k.y + k.z + k.w);
    // (the lie from entries that all have grass; level otherwise)
    grad = has.x * has.y * has.z * has.w > 0.5 ? vec2(mix(t10.r - t00.r, t11.r - t01.r, w.y), mix(t01.r - t00.r, t11.r - t10.r, w.x)) / info.z : vec2(0.0);
    return g;
  }
  vec4 tableNearest(sampler2D t, vec4 info, vec2 at) { return texelFetch(t, ivec2(mod(floor((at + info.xy) / info.z + 0.5), info.w)), 0); }`;

export const GRASS_PRELUDE = /* glsl */`
  uniform vec3 uGrassCam, uGrassEast, uGrassNorth, uGrassUp;       // the camera on the anchor's plane: east, north, up (m)
  uniform vec2 uGrassCurve;          // x: the datum's radius less the anchor's, y: 1 / (2 x the world's radius)
  uniform vec4 uGrassWind;           // the wind: xyz where it blows (planet axes), w its speed (m/s)
  uniform vec2 uGrassLie;            // the anchor on the plane counted from the grass's origin, modulo PERIOD (m)
  uniform vec2 uLatOrigin;           // ... and in this lattice's cells, modulo 4096
  uniform float uGrassView;          // the picture's height (pixels), halved
  uniform vec4 uGrassKeep;           // how much is kept by the height of the traveller: x near grass, y far grass; z the governor's share of the far grass, w how much wider it is for it
  uniform vec2 uGrassGov;            // the governor's share of the near grass (x) and of the far grass (y) that is handed over at all
  uniform vec4 uGrassTone;           // x: how dry the grass round the traveller is in the mean (the ground under it is painted with this)
  uniform vec3 uSunDir;
  uniform sampler2D tLight; uniform vec4 uLight;      // the light on the ground (GrassLight): this field's part of it: xy its middle from the anchor (m), z 1 / its span, w its row
  ${GRASS_GLSL}
  ${TABLE_GLSL}
  // how dry a tuft is: mostly what the ground under it is painted as, a little its own place's
  // (by its own place's alone, a green stretch of blades stood on golden ground: a dark smear)
  float dryHere(float own) { return mix(own, uGrassTone.x, 0.7); }
  out vec3 vCol;                     // the colour, lit and seen through the air: all of it worked out here
  vec2 hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
  // the ground's height at a place, measured up from the camera (g: its table entry)
  float groundUp(vec4 g, vec2 at) { return g.r + uGrassCurve.x - dot(at, at) * uGrassCurve.y - uGrassCam.z; }
  // this instance's cell: its middle from the camera (m), and its number on the ground
  // (instances are drawn in a scrambled order: a smaller count thins the field evenly)
  vec2 latticeCell(out vec2 own) {
    int id = (gl_InstanceID * 7919) % (GRID * GRID);
    vec2 c = vec2(float(id % GRID), float(id / GRID));
    vec2 rc = mod((c + 0.5) * SPACING - uGrassCam.xy, BOX) - 0.5 * BOX;
    own = mod(floor((rc + uGrassCam.xy) / SPACING) + uLatOrigin, 4096.0) + SEED;
    return rc;
  }
  // stretches of taller and shorter, greener and drier grass, some metres across (in the
  // ground's own coordinates: a whole number of waves in PERIOD)
  float lieAt(vec2 at) {
    // (two bent waves that cross at a slant: a product of an east wave and a north wave
    // was a chequerboard, woven across the whole field seen from 100 m up)
    vec2 p = (at + uGrassLie) * ${(2 * Math.PI / PERIOD).toFixed(8)};
    return 0.55 * sin(47.0 * p.x + 23.0 * p.y + 2.2 * sin(11.0 * p.y - 7.0 * p.x)) + 0.45 * sin(53.0 * p.y - 19.0 * p.x + 1.7 + 1.9 * sin(9.0 * p.x + 5.0 * p.y + 2.0 * sin(3.0 * p.y - 2.0 * p.x)));
  }
  // the wind over the field: which way and how hard it bends grass (east, north), and where the wave is (0..1)
  vec3 windAt(vec3 rel, float own) {
    vec2 w2 = vec2(dot(uGrassWind.xyz, uGrassEast), dot(uGrassWind.xyz, uGrassNorth));
    float wave = sin(dot(rel, uGrassWave.xyz) + uGrassWave.w + own * 2.0) * 0.5 + 0.5;
    return vec3(w2 * (0.05 + 0.03 * uGrassWind.w * (0.4 + 0.6 * wave)), wave);
  }
  // kept (1), going (0..1) or gone (0): a share 'k' of a field, this one's own number 'own' (0..1)
  float keepOf(float k, float own) { return clamp((k - own * 0.85) / 0.15, 0.0, 1.0); }
  // The light at a place of the plane: the Sun's on the ground there (its shadows, the
  // clouds', the land's and the slope's own in it), the sky's, and the air's own light
  // between there and the eye; the first two already dimmed by that air. A thing of colour
  // c that takes a share s of the sky is c * (sun + sky * s) + air.
  void lightAt(vec2 at, out vec3 sun, out vec3 sky, out vec3 air) {
    vec2 uv = clamp((at - uLight.xy) * uLight.z + 0.5, ${(0.5 / LIGHT_N).toFixed(6)}, ${(1 - 0.5 / LIGHT_N).toFixed(6)});
    float v = (uv.y + uLight.w) * ${(1 / RINGS.length).toFixed(6)};
    sun = textureLod(tLight, vec2(uv.x / 3.0, v), 0.0).rgb;
    sky = textureLod(tLight, vec2((uv.x + 1.0) / 3.0, v), 0.0).rgb;
    air = textureLod(tLight, vec2((uv.x + 2.0) / 3.0, v), 0.0).rgb;
  }
  #define OUT_OF_PICTURE { vCol = vec3(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // (behind the eye or off the side of the picture, by more than m metres)
  bool outside(vec4 cc, float m) { return cc.w < -m || abs(cc.x) > cc.w + m * (1.0 + projectionMatrix[0][0]) || abs(cc.y) > cc.w + m * (1.0 + abs(projectionMatrix[1][1])); }`;

// A blade: one triangle standing on the ground. Near the eye a thin leaf among hundreds
// to the square metre; far off a broad tooth, a few to a cell some metres wide.
const BLADE_VERT = /* glsl */`
  in float aBlade;
  uniform sampler2D tTable; uniform vec4 uTab;
  ${GRASS_PRELUDE}
  #ifdef FAR
  ${FLOWERS_GLSL}
  #endif
  void main() {
    vec2 cell, rc = latticeCell(cell), h = hash2(cell), hb = hash2(cell + 71.3 + aBlade * 7.7), hc = hash2(cell * 1.7 + 5.3 + aBlade * 13.1);
    // (each blade anywhere in its cell and a little beyond: an even field, no rows)
    vec2 foot2 = rc + (hc - 0.5) * (1.15 * SPACING), at = foot2 + uGrassCam.xy;
    float dist = length(foot2);
    // (this ring: in over IN0..IN1 where the one inside it goes out, out over OUT0..OUT1; the traveller's height)
    float ring = (1.0 - smoothstep(OUT0, OUT1, dist)) * KEEP;
    #ifdef IN0
    ring *= smoothstep(IN0, IN1, dist);
    #endif
    if (ring <= 0.0) OUT_OF_PICTURE
    // (not in the picture: thrown out before anything dear is worked out. Two blades in
    // three of a field round the eye are behind it or off to the side.)
    vec4 cc = projectionMatrix * viewMatrix * vec4(uGrassEast * foot2.x + uGrassNorth * foot2.y + uGrassUp * groundUp(tableNearest(tTable, uTab, at), at), 1.0);
    if (outside(cc, REACH)) OUT_OF_PICTURE
    vec2 grad; vec4 g = tableAt(tTable, uTab, at, grad);
    // How thick the grass stands here. Where the land has grass it is all there; only thin
    // land (scrub, scree, the edge of a wood) is thin, and thin in tussocks half a metre
    // across with bare ground between (the same tussocks in every ring), not as an even
    // sprinkle of single blades.
    float dens = clamp(g.g * 2.4 - 0.1, 0.0, 1.0);
    #ifdef FAR
    float own = hb.y;
    #else
    float own = hash2(floor((at + uGrassLie) * 2.0) + 3.3).x;
    #endif
    if (own >= dens) OUT_OF_PICTURE
    vec3 nrm = normalize(uGrassUp - uGrassEast * grad.x - uGrassNorth * grad.y);
    float base = groundUp(g, at);
    vec3 foot = uGrassEast * foot2.x + uGrassNorth * foot2.y + uGrassUp * base, toCam = normalize(-foot);
    // How squarely the ground is looked at here: from above, or a hillside that faces the eye.
    float rise = clamp(max(dot(toCam, uGrassUp), dot(toCam, nrm)), 0.0, 1.0);
    #ifdef FAR
    // (looked at squarely from farther than some 60 m a blade adds nothing: the ground wears
    // the grass there, and it was a scratch on it. They go one by one, by chance.)
    float square = smoothstep(0.22, 0.5, rise);
    if (hash2(cell + 3.7 + aBlade).y < square * smoothstep(40.0, 90.0, dist) * 1.02) OUT_OF_PICTURE
    #endif
    float lie = lieAt(at);
    float wide = WIDE * (0.8 + 0.9 * hb.x) * (1.0 + GROW * dist);
    #ifdef FAR
    wide *= uGrassKeep.w;          // (the governor's step: half of them, each wider)
    #endif
    float tall = TALL * (0.24 + 0.34 * hb.x) * (0.6 + 0.6 * g.g) * (1.0 + 0.3 * g.b) * (0.85 + 0.3 * lie);
    // How many blades lie over each other along the line of sight: the field's blade area
    // over a square metre of ground, seen at this angle. Beyond LAYERS deep the rest are
    // behind those in front: left out, blade by blade, each by its own number. (This is
    // what bounds the layers the GPU fills: at eye height a full field is twenty deep.)
    // (the governor's share of the ring counts: with half its blades handed over, a field
    // looked along loses none that the eye could see)
    float area = float(BLADES) * GOV * WIDE * 1.25 * (1.0 + GROW * dist) * TALL * 0.41 * (0.6 + 0.6 * g.g) / (SPACING * SPACING);
    float share = clamp(${LAYERS.toFixed(1)} * rise / area, ${LAYERS_FLOOR.toFixed(2)}, 1.0);
    // (by a number of its own, not the one its height and width come from: the blades kept
    // where few are kept would have been the short thin ones, and the field low and flat)
    float keep = keepOf(ring * share, fract(hb.x * 7.13 + hb.y * 3.71)) * clamp((dens - own) / 0.12, 0.0, 1.0);
    if (keep <= 0.0) OUT_OF_PICTURE
    tall *= keep;
    #ifdef FAR
    // (under a pixel tall: not drawn, where it was a dash; lower where the ground is looked at squarely)
    if (tall * abs(projectionMatrix[1][1]) * uGrassView < cc.w) OUT_OF_PICTURE
    tall *= 1.0 - 0.45 * smoothstep(0.15, 0.6, rise);
    #endif
    // the blade: facing the eye give or take a turn of its own, leaning its own way, bowed by the wind
    vec2 flat2 = dist > 1e-3 ? -foot2 / dist : vec2(0.0, 1.0);
    float yaw = (hb.y - 0.5) * YAW, turn = hc.x * 6.2831853;
    vec2 across = (vec2(-flat2.y, flat2.x) * cos(yaw) + flat2 * sin(yaw)) * wide * position.x;
    vec2 lean = vec2(cos(turn), sin(turn)) * (0.10 + 0.22 * hb.y) * tall + flat2 * (BACK * rise * tall);
    vec3 w = windAt(foot, h.x);
    vec2 blow = w.xy * tall;
    float y = position.y;
    vec2 p2 = foot2 + across * (1.0 - y) + (lean + blow) * y * y;
    float up = base + tall * y * (1.0 - 0.25 * length(lean + blow) / max(tall, 0.01));
    vec3 rel = uGrassEast * p2.x + uGrassNorth * p2.y + uGrassUp * up;
    // green grass and dry grass, each darker at the foot (the blades shade each other
    // there); paler where the wind's wave bows them
    float tone = y, shade = (0.85 + 0.3 * h.x) * (0.92 + 0.12 * lie) * (0.94 + 0.12 * w.z), dry = dryHere(g.b) + (h.x - 0.5) * 0.16;
    #ifdef FAR
    // (looked down on, or far off, a blade is the ground's own grass colour: its dark foot
    // showing from above was a field of dark specks that ended in an arc)
    tone = mix(y, 0.62, 0.9 * max(smoothstep(0.05, 0.35, rise), smoothstep(120.0, 420.0, dist)));
    shade = mix(shade, 1.0, 0.8 * smoothstep(0.05, 0.35, rise));
    dry -= mix(0.10, 0.2, smoothstep(30.0, 120.0, dist)) * lie;
    #else
    dry -= 0.10 * lie;
    #endif
    vec3 alb = grassColour(dry, tone) * shade;
    float skyShare = 0.55 + 0.45 * tone;
    #ifdef FAR
    // (flowers: in a drift some blades are stalks in flower, their upper part the flower's colour:
    // fewer from above and far off: grass with a dusting, and no band of colour along the skyline)
    float fk = tableNearest(tTable, uTab, at).a, kind = floor(fk + 0.001);
    // (pale kinds on fewer blades: a white meadow seen from the air was frost)
    float flowered = step(0.5, kind) * step(hash2(cell + 5.1 + aBlade).x, fract(fk + 0.001) * (KIND_PALE[clamp(int(kind + 0.5), 0, KIND_N - 1)] > 0.5 ? 0.35 : 0.7) * (1.0 - 0.5 * rise) * (1.0 - 0.7 * smoothstep(60.0, 400.0, dist))) * smoothstep(38.0, 52.0, dist);
    if (flowered > 0.5) { alb = mix(alb, petalColour(kind, h.y), 0.3 + 0.7 * y); skyShare = 1.0; }
    #endif
    vec3 sun, sky, air; lightAt(at, sun, sky, air);
    // (looked at toward the Sun a blade glows: the light comes through it)
    float through = pow(max(dot(normalize(rel), uSunDir), 0.0), 3.0);
    vCol = alb * (sun * (1.0 + 0.7 * through * y) + sky * skyShare) + air;
    gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
  }`;

// A flower: a stem (part 0), LEAVES leaves at its foot, NPET petals, a middle. What the
// petals are depends on the kind's habit (grassRules.js): a cup's petals round its
// middle, a spike's florets up the stem, an umbel's on a flat-topped spray, a globe's
// round a ball, a turf flower's tiny heads scattered among the blades, a cushion's mound
// on the ground. Near the eye fourteen petals and two leaves; farther out six and none.
const FLOWER_VERT = /* glsl */`
  in float aPart;
  uniform sampler2D tTable; uniform vec4 uTab;
  ${GRASS_PRELUDE}
  ${FLOWERS_GLSL}
  void main() {
    vec2 cell, rc = latticeCell(cell), h = hash2(cell), h2 = hash2(cell + 23.9);
    vec2 rel2 = rc + (h - 0.5) * 0.9 * SPACING, at = rel2 + uGrassCam.xy;
    float dist = length(rel2);
    float ring = (1.0 - smoothstep(OUT0, OUT1, dist)) * uGrassKeep.x;
    #ifdef IN0
    ring *= smoothstep(IN0, IN1, dist);
    #endif
    if (ring <= 0.0) OUT_OF_PICTURE
    // (which kind grows here is not something to blend: the nearest entry says)
    vec4 gn = tableNearest(tTable, uTab, at);
    float kind = floor(gn.a + 0.001);
    // (big heads stand wider apart: a lattice full of heads a hand across was a carpet that
    // hid the grass. As many of a kind's heads to the square metre as cover the same ground.)
    float headSize = KIND_SHAPE[clamp(int(kind + 0.5), 0, KIND_N - 1)].y;
    if (kind < 0.5 || h2.x >= fract(gn.a + 0.001) * 1.1 * min(1.0, pow(0.036 / headSize, 2.0))) OUT_OF_PICTURE
    if (outside(projectionMatrix * viewMatrix * vec4(uGrassEast * rel2.x + uGrassNorth * rel2.y + uGrassUp * groundUp(gn, at), 1.0), 2.2)) OUT_OF_PICTURE
    vec2 grad; vec4 g = tableAt(tTable, uTab, at, grad);
    float keep = step(0.1, g.g) * keepOf(ring, h.x);
    if (keep <= 0.0) OUT_OF_PICTURE
    int ki = clamp(int(kind + 0.5), 0, KIND_N - 1);
    vec4 shp = KIND_SHAPE[ki];
    float habit = shp.x;
    // (a dandelion gone to seed: a white clock)
    bool clock = ki == 17 && h2.y > 0.62;
    if (clock) habit = 4.0;
    // as tall as its kind in grass of middling height, taller in tall grass: the heads stand clear
    float stem = shp.z * (0.85 + 0.3 * h2.y) * mix(1.0, (0.6 + 0.6 * g.g) * (1.0 + 0.3 * g.b) / 1.2, 0.7) * keep;
    float size = shp.y * (0.8 + 0.4 * h.y) * (1.0 + dist * FGROW) * keep;
    float base = groundUp(g, at);
    vec3 foot = uGrassEast * rel2.x + uGrassNorth * rel2.y + uGrassUp * base;
    vec3 w = windAt(foot, h.x);
    vec2 top2 = rel2 + ((h - 0.5) * 0.24 + w.xy * 1.3) * stem;
    vec3 top = uGrassEast * top2.x + uGrassNorth * top2.y + uGrassUp * (base + stem);
    vec3 toCam = normalize(-top), side = normalize(cross(uGrassUp, toCam) + uGrassEast * 1e-4), fwd = cross(side, uGrassUp);
    vec3 col, rel; float skyShare = 1.0;
    float petal = aPart - 1.0 - float(LEAVES);          // which petal (0 .. NPET - 1); NPET: the middle
    vec3 petalCol = clock ? vec3(0.80, 0.80, 0.76) : petalColour(kind, fract(h2.y + (habit > 1.5 || habit < 0.5 ? petal * 0.37 : 0.0)));
    if (aPart < 0.5) {
      // the stem
      if (habit < 0.5 || habit > 4.5) OUT_OF_PICTURE
      rel = mix(foot, top, position.y) + side * position.x * 0.007 * (1.0 + dist * 0.07) * (1.0 - 0.5 * position.y);
      col = grassColour(0.0, 0.35 + 0.55 * position.y); skyShare = 0.6 + 0.4 * position.y;
    } else if (petal < 0.0) {
      // a leaf at the foot, out to one side and the other
      if (habit < 0.5 || habit > 4.5) OUT_OF_PICTURE
      float a = h.x * 6.2831853 + aPart * 3.3, len = (0.10 + 0.5 * shp.y) * (1.0 + dist * 0.05) * keep;
      vec3 o = uGrassEast * cos(a) + uGrassNorth * sin(a), across = cross(o, uGrassUp);
      rel = foot + (o * position.y + across * position.x * 0.22 * (1.0 - position.y)) * len + uGrassUp * (0.02 + 0.7 * len * position.y * (1.0 - 0.4 * position.y));
      col = grassColour(0.05, 0.3 + 0.4 * position.y); skyShare = 0.6 + 0.3 * position.y;
    } else if (habit < 0.5) {
      // turf: each petal a tiny head of its own, low among the blades, anywhere in the cell
      if (petal > float(NPET) - 0.5) OUT_OF_PICTURE
      vec2 hp = hash2(cell + petal * 3.17 + 1.3), off = (hp - 0.5) * (1.7 * SPACING);
      vec3 c = uGrassEast * (rel2.x + off.x) + uGrassNorth * (rel2.y + off.y) + uGrassUp * (base + dot(grad, off) + stem * (0.6 + 0.8 * hp.x));
      vec3 n = normalize(uGrassUp + toCam * 0.5), a = normalize(cross(n, uGrassEast + uGrassUp * 0.3)), b = cross(n, a);
      float ang = hp.y * 6.2831853, s = size * 1.6;
      vec2 q0 = vec2(position.x, position.y - 0.5), q = vec2(q0.x * cos(ang) - q0.y * sin(ang), q0.x * sin(ang) + q0.y * cos(ang));
      rel = c + (a * q.x + b * q.y) * s;
      col = petalCol * (0.85 + 0.2 * position.y);
    } else if (habit < 1.5) {
      // a cup: its petals round the middle, turned up and toward whoever looks
      float n = min(shp.w, float(NPET));
      bool mid = petal > float(NPET) - 0.5;
      if (!mid && petal > n - 0.5) OUT_OF_PICTURE
      vec3 nrm = normalize(uGrassUp * 0.8 + toCam * 0.55 + (uGrassEast * (h.x - 0.5) + uGrassNorth * (h.y - 0.5)) * 0.6);
      vec3 a = normalize(cross(nrm, uGrassEast + uGrassUp * 0.3)), b = cross(nrm, a);
      float ang = petal * 6.2831853 / n + h.x * 6.2831853, c = cos(ang), s = sin(ang);
      // (few petals: broad ones that overlap, a poppy's bowl; many: narrow rays, a daisy's)
      float wx = n < 4.5 ? 1.05 : n < 6.5 ? 0.74 : 3.4 / n, big = shp.y > 0.08 ? 1.15 : 1.0;
      vec2 q0 = mid ? vec2(position.x * 0.55 * big, position.y * 0.34 * big - 0.17 * big) : vec2(position.x * wx, position.y), q = vec2(q0.x * c - q0.y * s, q0.x * s + q0.y * c);
      rel = top + (a * q.x + b * q.y + nrm * (mid ? 0.12 : (n < 4.5 ? 0.55 : 0.32) * position.y * position.y)) * size;
      col = mid ? KIND_MID[ki] : petalCol * (0.78 + 0.3 * position.y);
    } else if (habit < 2.5) {
      // a spike: florets one above another up the top of the stem, round it in turn, smaller toward the tip
      float n = min(shp.w, float(NPET));
      if (petal > n - 0.5) OUT_OF_PICTURE
      float t = petal / max(n - 1.0, 1.0), a = petal * 2.39996 + h.x * 6.2831853, s = size * (1.35 - 0.75 * t) * (14.0 / (8.0 + float(NPET)));
      vec3 c = mix(foot, top, 0.56 + 0.44 * t), o = side * cos(a) + fwd * sin(a);
      // (a foxglove's bells hang; a lupin's florets stand out and up)
      float droop = ki == 12 || ki == 22 ? -0.75 : 0.35;
      rel = c + cross(o, uGrassUp) * (position.x * 0.5 * s) + (o * 0.95 + uGrassUp * droop) * (position.y * s);
      col = petalCol * (0.75 + 0.35 * position.y);
    } else if (habit < 3.5) {
      // an umbel: tiny florets on a flat-topped spray
      if (petal > float(NPET) - 0.5) OUT_OF_PICTURE
      vec3 n = normalize(uGrassUp + toCam * 0.35), a = normalize(cross(n, uGrassEast + uGrassUp * 0.3)), b = cross(n, a);
      float r = sqrt((petal + 0.5) / float(NPET)), ang = petal * 2.39996 + h.x * 6.2831853, s = 0.52 * sqrt(14.0 / float(NPET));
      vec2 q0 = vec2(position.x, position.y - 0.5) * s, q = vec2(r * cos(ang), r * sin(ang)) + vec2(q0.x * cos(ang) - q0.y * sin(ang), q0.x * sin(ang) + q0.y * cos(ang));
      rel = top + (a * q.x + b * q.y + n * (0.3 * (1.0 - r))) * size;
      col = petalCol * (0.82 + 0.2 * position.y);
    } else if (habit < 4.5) {
      // a globe: florets standing out all round a ball
      if (petal > float(NPET) - 0.5) OUT_OF_PICTURE
      float z = 1.0 - 2.0 * (petal + 0.5) / float(NPET), rr = sqrt(max(0.0, 1.0 - z * z)), ang = petal * 2.39996 + h.x * 6.2831853;
      vec3 d = side * (rr * cos(ang)) + fwd * (rr * sin(ang)) + uGrassUp * z, e = normalize(cross(d, uGrassUp + side * 0.3));
      rel = top + (d * (0.1 + 0.9 * position.y) + e * (position.x * 0.62 * (1.0 - position.y))) * size * (clock ? 1.25 : 1.0);
      col = petalCol * (0.7 + 0.4 * position.y);
    } else {
      // a cushion: a low mound on the ground, green shards and flowered ones in turn
      if (petal > float(NPET) - 0.5) OUT_OF_PICTURE
      float z = (petal + 0.5) / float(NPET), rr = sqrt(1.0 - z * z), ang = petal * 2.39996 + h.x * 6.2831853, R = size * (1.0 + 0.5 * h2.y);
      vec3 d = uGrassEast * (rr * cos(ang)) + uGrassNorth * (rr * sin(ang)) + uGrassUp * z, e = normalize(cross(d, uGrassUp + uGrassEast * 0.3)), f = cross(d, e);
      vec2 q = vec2(position.x, position.y - 0.4) * 0.95;
      rel = foot + (d * vec3(1.0) + e * q.x + f * q.y) * R - uGrassUp * (0.55 * R * dot(d, uGrassUp)) + (uGrassEast * grad.x + uGrassNorth * grad.y) * 0.0;
      bool green = mod(petal, 2.0) < 0.5;
      col = green ? KIND_MID[ki] * (0.8 + 0.5 * z) : petalCol * (0.8 + 0.25 * position.y);
      skyShare = 0.6 + 0.4 * z;
    }
    vec3 sun, sky, air; lightAt(at, sun, sky, air);
    // (a petal toward the Sun glows as a blade does)
    vCol = col * (sun * (1.0 + 0.5 * pow(max(dot(normalize(rel), uSunDir), 0.0), 3.0)) + sky * skyShare) + air;
    gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
  }`;

// Nothing is worked out per pixel: a blade's three corners carry its colour.
const FRAG = /* glsl */`
  in vec3 vCol;
  layout(location = 0) out vec4 fragColor;
  void main() { fragColor = vec4(vCol, 1.0); }`;

// --- the light on the ground round the traveller. Every blade once worked its own light
// out pixel by pixel: the Sun through the air, three shadows, the sky's light, the haze
// between it and the eye, some twenty looks into textures for each of the layers of grass
// over a pixel. Here it is worked out once for a small table of places on the ground,
// before the main picture is begun: for each ring LIGHT_N x LIGHT_N places over its
// stretch (the nearest 14 cm apart, the farthest 12 m), three numbers each (see lightAt).
// A blade reads it at its foot. The places are fixed to the ground (their middle moves in
// whole places), so a shadow's edge does not crawl as the traveller walks.
const LIGHT_FRAG = /* glsl */`
  ${LIGHTING_PARS}
  ${TREE_SHADE_VERT}
  ${TABLE_GLSL}
  uniform sampler2D tNear, tMid, tFar; uniform vec4 uTabNear, uTabMid, uTabFar;
  uniform vec4 uCasc[${RINGS.length}];     // each ring's stretch: xy its middle from the anchor (m), z its span (m), w which table
  uniform vec3 uGrassCam, uGrassEast, uGrassNorth, uGrassUp; uniform vec2 uGrassCurve;
  uniform sampler2D tLandShade; uniform vec4 uLandShade;   // the land's own shadow round the traveller: xy its middle from the anchor (m), z 1 / its span, w 1 when there is one
  uniform mat4 uViewProj;
  layout(location = 0) out vec4 fragColor;
  void main() {
    float third = floor(gl_FragCoord.x / ${LIGHT_N}.0), row = floor(gl_FragCoord.y / ${LIGHT_N}.0);
    vec4 c = uCasc[int(row)];
    vec2 at = c.xy + ((gl_FragCoord.xy - vec2(third, row) * ${LIGHT_N}.0) / ${LIGHT_N}.0 - 0.5) * c.z, rel2 = at - uGrassCam.xy, grad;
    vec4 g = c.w < 0.5 ? tableAt(tNear, uTabNear, at, grad) : c.w < 1.5 ? tableAt(tMid, uTabMid, at, grad) : tableAt(tFar, uTabFar, at, grad);
    float dist = length(rel2);
    vec3 rel = uGrassEast * rel2.x + uGrassNorth * rel2.y + uGrassUp * (g.r + uGrassCurve.x - dot(at, at) * uGrassCurve.y - uGrassCam.z + 0.15);
    vec3 planetPos = uCamPlanetPos + rel, up = normalize(planetPos);
    // (a field is lit as the ground it stands on: by the Sun's height over it close by, where
    // the blades are seen one by one; farther off by the lie of its slope, as the ground
    // between the blades is. Lit as level ground, a far hillside turned from the Sun was
    // bright scales on a dark slope.)
    float nl = dot(up, uSunDir), lit = uPaint.x > 0.0 ? paintLit(nl * 0.7 + 0.3) * PI : max(nl, 0.0);
    float ns = dot(normalize(uGrassUp - uGrassEast * grad.x - uGrassNorth * grad.y), uSunDir);
    lit = mix(lit, uPaint.x > 0.0 ? paintLit(ns) * PI : max(ns, 0.0), smoothstep(12.0, 45.0, dist));
    // (the clouds' shadow where the grass stands, by the ground's own rule, and the land's:
    // a ridge between it and the Sun. Close by, the shade at the traveller.)
    float far = smoothstep(30.0, 120.0, dist);
    float cloud = mix(uWeather.x, cloudShade(rel), far) * mix(1.0, texture(tLandShade, (at - uLandShade.xy) * uLandShade.z + 0.5).r, uLandShade.w * far);
    vec3 sun = directSun(planetPos) * (cloud * nearShadow(rel, up) * lit / PI), sky = skyLight(up, up) / PI;
    // (the air between: what it adds, and how much of the thing's own light it lets through)
    vec4 clip = uViewProj * vec4(rel, 1.0);
    gHazeUv = clip.w > 0.0 ? clamp(clip.xy / clip.w * 0.5 + 0.5, 0.0, 1.0) : vec2(0.5);
    vec3 air = aerialPerspective(vec3(0.0), rel), through = aerialPerspective(vec3(1.0), rel) - air;
    fragColor = vec4((third < 0.5 ? sun * through : third < 1.5 ? sky * through : air) * uExposure, 1.0);
  }`;

// --- the ground tables
class Table {
  constructor(n, cell) {
    this.n = n; this.cell = cell;
    this.data = new Float32Array(n * n * 4);
    this.held = new Int32Array(n * n * 2).fill(0x7fffffff);       // which place (absolute cells) each entry holds
    this.gen = new Int32Array(n * n).fill(-1);                    // ... from which maps
    this.tex = new THREE.DataTexture(this.data, n, n, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter; this.tex.needsUpdate = true;
    this.info = { value: new THREE.Vector4(0, 0, cell, n) };      // the shader's: the origin modulo the table's span, cell, places a side
    this.pending = n * n; this.key = ''; this.changed = false;
    this.flora = new Uint8Array(n * n);                           // each entry's flora (the far ground's flowers are the table's majority)
    // (rows and columns from the camera's outward: the nearest are worked out first)
    const half = n >> 1; this.order = [0]; for (let k = 1; k < half; k++) this.order.push(k, -k); this.order.push(-half);
  }
  reset() { this.held.fill(0x7fffffff); this.gen.fill(-1); this.pending = this.n * this.n; this.key = ''; }
  // ci, cj: the camera's place (absolute cells); gen: the maps' number; sample(i, j, o): fill entry o
  fill(ci, cj, gen, budget, sample) {
    const key = `${ci},${cj},${gen}`;
    if (this.pending === 0 && key === this.key) return budget;
    this.key = key;
    const N = this.n, H = this.held, G = this.gen, D = this.data, ord = this.order;
    let pending = 0;
    for (const dj of ord) {
      const j = cj + dj, b = ((j % N) + N) % N;
      for (const di of ord) {
        const i = ci + di, a = ((i % N) + N) % N, q = b * N + a;
        const here = H[q * 2] === i && H[q * 2 + 1] === j;
        if (here && G[q] === gen) continue;
        if (budget <= 0) {
          // (an entry that still holds another place says "no grass" until it is worked
          // out: nothing stands on ground a table's width away)
          if (!here && D[q * 4 + 1] !== 0) { D[q * 4 + 1] = 0; D[q * 4 + 3] = 0; this.changed = true; }
          pending++; continue;
        }
        sample(i, j, q * 4, this.cell); H[q * 2] = i; H[q * 2 + 1] = j; G[q] = gen; budget--; this.changed = true;
      }
    }
    this.pending = pending;
    return budget;
  }
}

export class Grass {
  constructor(terrain, wind) {
    this.terrain = terrain;
    this.tables = { near: new Table(TABLES.near.n, TABLES.near.cell), mid: new Table(TABLES.mid.n, TABLES.mid.cell), far: new Table(TABLES.far.n, TABLES.far.cell) };
    this.waveU = terrain.shared.uGrassWave;           // (the ground's too: the waves run on from the grass onto it)
    this.shared = {
      ...lightingUniforms(),
      uGrassCam: { value: new THREE.Vector3() }, uGrassCurve: { value: new THREE.Vector2() }, uGrassLie: { value: new THREE.Vector2() },
      uGrassEast: { value: new THREE.Vector3(1, 0, 0) }, uGrassNorth: { value: new THREE.Vector3(0, 1, 0) }, uGrassUp: { value: new THREE.Vector3(0, 0, 1) },
      uGrassWind: wind, uGrassWave: this.waveU, uGrassKeep: { value: new THREE.Vector4(1, 1, 1, 1) }, uGrassGov: { value: new THREE.Vector2(1, 1) }, uGrassView: { value: 500 }, uGrassTone: terrain.shared.uGrassTone,
    };
    // The land's own shadow on the ground round the traveller (a mountain between a place
    // and the Sun), for the far grass: SHADE_N x SHADE_N places SHADE_CELL apart, asked of the
    // shadow baker in one worker job when the traveller has gone SHADE_MOVE from its middle,
    // the Sun has turned a degree and a half or maps have arrived. Sunlit until the first answer.
    this.shade = new Uint8Array(SHADE_N * SHADE_N).fill(255);
    this.shadeTex = new THREE.DataTexture(this.shade, SHADE_N, SHADE_N, THREE.RedFormat, THREE.UnsignedByteType);
    this.shadeTex.minFilter = this.shadeTex.magFilter = THREE.LinearFilter; this.shadeTex.needsUpdate = true;
    this.shadeU = { value: new THREE.Vector4(0, 0, 1 / (SHADE_N * SHADE_CELL), 0) };
    this._shade = null; this._shadeAsking = false; this._shadeNew = null;
    this._seen = new Float64Array(32);
    // The light on the ground (see LIGHT_FRAG): one picture, a row for each ring, three parts across.
    this.light = new THREE.WebGLRenderTarget(LIGHT_N * 3, LIGHT_N * RINGS.length, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
    this.light.texture.wrapS = this.light.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.casc = RINGS.map(() => new THREE.Vector4());
    this.lightU = RINGS.map((r, k) => ({ value: new THREE.Vector4(0, 0, 1, k) }));
    const T = this.tables;
    this.lightMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false, vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: LIGHT_FRAG,
      defines: { ...atmosphereDefines(), OWN_CLOUD_SHADOW: 1, HAZE_UV: 1 },
      uniforms: { ...this.shared, ...TREE_SHADE_UNIFORMS, tNear: { value: T.near.tex }, tMid: { value: T.mid.tex }, tFar: { value: T.far.tex }, uTabNear: T.near.info, uTabMid: T.mid.info, uTabFar: T.far.info,
        uCasc: { value: this.casc }, tLandShade: { value: this.shadeTex }, uLandShade: this.shadeU, uViewProj: { value: new THREE.Matrix4() } },
    });
    // a field: one cell's triangles, drawn once for every place of its lattice
    const field = (f, geo, vertexShader, defines, tris, light) => {
      geo.instanceCount = f.grid * f.grid;
      const lat = { value: new THREE.Vector2() }, t = this.tables[f.table];
      const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, side: THREE.DoubleSide, vertexShader, fragmentShader: FRAG,
        uniforms: { ...this.shared, uLatOrigin: lat, tTable: { value: t.tex }, uTab: t.info, tLight: { value: this.light.texture }, uLight: this.lightU[light] },
        defines: { GRID: f.grid, SPACING: f.spacing.toFixed(4), BOX: (f.grid * f.spacing).toFixed(3), SEED: f.seed.toFixed(1), OUT0: f.out[0].toFixed(2), OUT1: f.out[1].toFixed(2), ...defines },
      });
      const mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false;
      return { f, geo, mesh, lat, all: f.grid * f.grid, tris };
    };
    const plain = (pos, attr, values) => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute(attr, new THREE.BufferAttribute(new Float32Array(values), 1)); return g; };
    // a ring of grass: each blade a triangle; x: across the blade (-1, 1, 0 at the tip), y: up it, and which blade it is
    const ring = (f, k) => {
      const p = [], b = []; for (let i = 0; i < f.blades; i++) { p.push(-1, 0, 0, 1, 0, 0, 0, 1, 0); b.push(i, i, i); }
      const d = { BLADES: f.blades, WIDE: f.wide.toFixed(4), GROW: f.grow.toFixed(4), TALL: f.tall.toFixed(3), YAW: f.yaw.toFixed(2), BACK: f.back.toFixed(2), REACH: f.reach.toFixed(1), KEEP: f.far ? 'uGrassKeep.y' : 'uGrassKeep.x', GOV: f.far ? '(uGrassGov.y * uGrassKeep.w)' : 'uGrassGov.x' };
      if (f.in) { d.IN0 = f.in[0].toFixed(2); d.IN1 = f.in[1].toFixed(2); }
      if (f.far) d.FAR = 1;
      return field(f, plain(p, 'aBlade', b), BLADE_VERT, d, f.blades, k);
    };
    // a flower: the stem as a blade, leaves, each petal a triangle from the middle outward (x across, y out), the middle a triangle
    const flower = (f) => {
      const p = [-1, 0, 0, 1, 0, 0, 0, 1, 0], b = [0, 0, 0], n = f.leaves + f.petals + 1;
      for (let i = 1; i <= n; i++) { if (i <= f.leaves) p.push(-1, 0, 0, 1, 0, 0, 0, 1, 0); else p.push(0, 0, 0, -0.62, 1, 0, 0.62, 1, 0); b.push(i, i, i); }
      const d = { NPET: f.petals, LEAVES: f.leaves, FGROW: f.grow.toFixed(4) };
      if (f.in) { d.IN0 = f.in[0].toFixed(2); d.IN1 = f.in[1].toFixed(2); }
      return field(f, plain(p, 'aPart', b), FLOWER_VERT, d, n + 1, f.light);
    };
    // (fields: what goes with the traveller's height first, the grass near by and the flowers;
    // clumps: the far grass, which stays to a greater height and has the governor's step of its own.
    // Nearest first: what is in front is drawn first, and hides what is behind before it is filled.)
    this.rings = RINGS.map(ring);
    this.flowers = FLOWERS.map(flower);
    this.fields = [...this.rings.filter((r) => !r.f.far), ...this.flowers];
    this.clumps = this.rings.filter((r) => r.f.far);
    this.mesh = new THREE.Group(); for (const f of [...this.fields, ...this.clumps]) this.mesh.add(f.mesh);
    this.mesh.visible = false;
    this.anchor = new THREE.Vector3(); this.anchorR = 0; this.has = false; this.def = null; this.serial = -1; this.gen = 0;
    this.origin = [0, 0];                // the anchor on the plane, counted from where the grass began (m, multiples of SNAP)
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0]; this._d = [0, 0, 0];
    this.fraction = 1; this.midShare = 1; this.phase = 0; this.eager = false;
    this.keepBlades = 0; this.keepClumps = 0;
  }

  setWorld(world) { this.def = world.life?.grass || null; this.flowerTable = flowerTable(world.life?.flowers, world.life?.trees?.line || null); this.has = false; this.mesh.visible = false; this.seaLevel = world.surface.sea ? (world.surface.sea.level ?? 0) : null; }

  // The governor: draw this share of the tufts and flowers ...
  setFraction(f) { this.fraction = f; for (const fl of this.fields) fl.geo.instanceCount = Math.round(fl.all * Math.min(1, f)); }
  // ... and of the clumps (those left are wider: the ground stays covered).
  setMidShare(f) { this.midShare = f; for (const fl of this.clumps) fl.geo.instanceCount = Math.round(fl.all * Math.min(1, f)); }

  get triangles() { return this.mesh.visible ? [...this.fields, ...this.clumps].reduce((a, f) => a + (f.mesh.visible ? f.geo.instanceCount * f.tris : 0), 0) : 0; }
  get instances() { return this.mesh.visible ? [...this.fields, ...this.clumps].reduce((a, f) => a + (f.mesh.visible ? f.geo.instanceCount : 0), 0) : 0; }
  // True while the ground tables round the traveller are still being filled in (pictures wait for them).
  get busy() {
    if (!this.mesh.visible) return false;
    const T = this.tables; return (this.keepBlades > 0 && T.near.pending > 0) || ((this.keepClumps > 0 || !this._tone) && T.mid.pending > 0) || (this.keepClumps > 0 && (T.far.pending > 0 || !this._shade));
  }

  // What the ground is like at place (i, j) (absolute cells of `cell` metres) into entry o of a table.
  _sample(T, i, j, o, cell) {
    const hs = this.terrain.hs, A = this.anchor, e = this._e, n = this._n, d = this._d;
    const x = i * cell - this.origin[0], y = j * cell - this.origin[1];
    d[0] = A.x + e[0] * x + n[0] * y; d[1] = A.y + e[1] * x + n[1] * y; d[2] = A.z + e[2] * x + n[2] * y;
    const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
    // (wet: in water, or no higher than the sea's level, as the rocks ask: radar elevation has
    // the sea at exactly zero near land, with no depth to tell it by, and tufts and flowers
    // stood on the water off every low shore)
    const h = hs.height(d[0], d[1], d[2], Math.max(2.5, cell * 0.5)), wet = hs.waterDepth > 0 || (this.seaLevel != null && h <= this.seaLevel + 0.3), slope = hs.baseSlope, cover = hs.coverAt ? hs.coverAt(d[0], d[1], d[2]) : -1;
    const cls = cover < 0 ? 0 : cover & 255, closed = cover < 0 ? 0 : (cover >> 16) / 255;
    // (none in water; on slopes by the one rule the ground's grass colour goes by too
    // (GRASS_GROUND.slope in grassRules.js; terrainMaterial.js reads the same numbers): by
    // two rules, clumps stood on unpainted ground on every steeper hillside; thin under a
    // closed canopy)
    const amount = wet ? 0 : (AMOUNT[cls] || 0) * (1 - smoothstep(GRASS_GROUND.slope[0], GRASS_GROUND.slope[1], slope)) * (1 - 0.4 * closed);
    const D = T.data;
    D[o] = h; D[o + 1] = amount; D[o + 2] = DRY[cls] ?? 0.5;
    // the flowers: the kinds of this land, in drifts (grassRules.js: the far ground has the same)
    // (the low kinds of the turf only where single flowers are drawn: the near table)
    const R = hs.radius + h, flora = floraAt(cls, Math.abs(Math.asin(d[2])) * 57.29578, h, amount, this.flowerTable);
    D[o + 3] = flora ? flowersAt(d[0] * R, d[1] * R, d[2] * R, flora, slope, T === this.tables.near) : 0;
    T.flora[o >> 2] = flora;
    // (?debug=flowers: every kind there is, each in its own slice of the compass round where the
    // grass began, thick: scripts/flower-preview.mjs takes pictures of them side by side)
    if (this.debugKinds && amount > 0.1) D[o + 3] = 1 + Math.min(KINDS.length - 2, Math.floor(((Math.atan2(i * cell, j * cell) / (2 * Math.PI) + 1) % 1) * (KINDS.length - 1))) + 0.9;
  }

  // The land's shadow for the clumps (see the constructor). ce, cn: the traveller on the plane.
  _landShadow(ce, cn, kc, renderer) {
    const t = this.terrain, sun = this.shared.uSunDir.value, sh = this._shade;
    if (this._shadeNew) {
      // (an answer: to the GPU between frames)
      const r = this._shadeNew; this._shadeNew = null;
      this.shade.set(r.vis); this.shadeTex.needsUpdate = true; renderer.initTexture(this.shadeTex);
      this._shade = r;
    }
    if (this._shade) this.shadeU.value.set(this._shade.x - this.origin[0], this._shade.y - this.origin[1], 1 / (SHADE_N * SHADE_CELL), 1);
    if (kc <= 0 || this._shadeAsking) return;
    const ax = ce + this.origin[0], ay = cn + this.origin[1];
    if (sh && sh.gen === this.gen && Math.hypot(ax - sh.x, ay - sh.y) < SHADE_MOVE && sh.sun[0] * sun.x + sh.sun[1] * sun.y + sh.sun[2] * sun.z > 0.99966) return;
    if (t.workers.idle < 1) return;
    const x0 = Math.round(ax / SHADE_CELL) * SHADE_CELL, y0 = Math.round(ay / SHADE_CELL) * SHADE_CELL;
    const hs = t.hs, A = this.anchor, e = this._e, n = this._n, pts = new Float64Array(SHADE_N * SHADE_N * 3);
    for (let j = 0, q = 0; j < SHADE_N; j++) for (let i = 0; i < SHADE_N; i++, q += 3) {
      const x = x0 - this.origin[0] + (i + 0.5 - SHADE_N / 2) * SHADE_CELL, y = y0 - this.origin[1] + (j + 0.5 - SHADE_N / 2) * SHADE_CELL;
      let dx = A.x + e[0] * x + n[0] * y, dy = A.y + e[1] * x + n[1] * y, dz = A.z + e[2] * x + n[2] * y;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const r = hs.radius + hs.height(dx, dy, dz, SHADE_CELL * 0.5) + 2;
      pts[q] = dx * r; pts[q + 1] = dy * r; pts[q + 2] = dz * r;
    }
    const want = [sun.x, sun.y, sun.z], epoch = t.epoch, gen = this.gen, anchorKey = this._anchorKey;
    const job = t.workers.run({ type: 'points', points: pts, sun: want, sunHalf: 0.0047, minWL: 20 }, [pts.buffer]);
    if (!job) return;
    this._shadeAsking = true;
    job.then((res) => {
      this._shadeAsking = false;
      // (another world, or an anchor made afresh, since it was asked: not this ground's)
      if (epoch !== t.epoch || anchorKey !== this._anchorKey) return;
      const v = new Float32Array(res.vis), vis = new Uint8Array(v.length);
      for (let k = 0; k < v.length; k++) vis[k] = Math.round(255 * Math.min(1, Math.max(0, v[k])));
      this._shadeNew = { vis, x: x0, y: y0, sun: want, gen };
    }, () => { this._shadeAsking = false; });
  }

  // A new anchor where the traveller is: start afresh (far from the old one, or the first time) ...
  // The anchor lies on the ground's own sphere under the traveller, never at the traveller's
  // height: places are worked out along lines from the world's centre through the plane and
  // drawn at plain metres on it, and with the plane D metres over the ground a tuft x metres
  // out stood on ground x.D/R from where its height was taken (on a world 250 km in radius
  // and from 1 km up: 2 m at the far clumps, and the whole field 0.8 m aside at every step).
  _anchorAfresh(p, agl) {
    this.has = true; this._anchorKey = (this._anchorKey || 0) + 1; this.anchorR = p.length() - agl; this.anchor.copy(p).multiplyScalar(this.anchorR / p.length()); this.origin = [0, 0];
    localFrame([p.x, p.y, p.z], this._e, this._n, this._u);
    for (const k in this.tables) this.tables[k].reset();
    this._tone = null; this._shade = null; this._shadeNew = null; this.shadeU.value.w = 0;
  }
  // ... or move it by whole steps along its own plane, its axes carried over: nothing drawn changes.
  _anchorStep(se, sn, groundR) {
    const A = this.anchor, e = this._e, n = this._n, u = this._u;
    A.set(A.x + e[0] * se + n[0] * sn, A.y + e[1] * se + n[1] * sn, A.z + e[2] * se + n[2] * sn);
    // (the plane's axes turned to the new place by the least turn)
    const l = A.length(); u[0] = A.x / l; u[1] = A.y / l; u[2] = A.z / l;
    let k = e[0] * u[0] + e[1] * u[1] + e[2] * u[2]; e[0] -= u[0] * k; e[1] -= u[1] * k; e[2] -= u[2] * k;
    k = Math.hypot(e[0], e[1], e[2]); e[0] /= k; e[1] /= k; e[2] /= k;
    n[0] = u[1] * e[2] - u[2] * e[1]; n[1] = u[2] * e[0] - u[0] * e[2]; n[2] = u[0] * e[1] - u[1] * e[0];
    // (and the anchor onto the sphere of the ground under the traveller now)
    this.anchorR = groundR; A.multiplyScalar(this.anchorR / l);
    this.origin[0] += se; this.origin[1] += sn;
  }

  // The light on the ground round the traveller, for this frame: before the main picture is
  // begun (after the shadow maps and the clouds' shade are made).
  renderLight(renderer, camera) {
    if (!this.mesh.visible) return;
    camera.updateMatrixWorld();
    this.lightMat.uniforms.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    renderPass(renderer, this.lightMat, this.light);
  }

  // Every frame. rig: the camera rig; dt (s); renderer (the tables go to the GPU between frames).
  update(rig, dt, renderer) {
    const def = this.def, t = this.terrain, tone = t.shared.uGrassTone.value;
    const agl = rig.agl, below = def?.below ?? 80, midBelow = def?.mid ?? 220;
    // (by the traveller's height: the blades go between half their height and it, the clumps likewise)
    const kb = def ? 1 - smoothstep(below * 0.5, below, agl) : 0, kc = def ? 1 - smoothstep(midBelow * 0.55, midBelow, agl) : 0;
    // (the ground's own grass colour stays far higher: from 220 m up the ground went from gold to the map's beige as the clumps left)
    const kg = def ? 1 - smoothstep(1500, 3000, agl) : 0;
    const show = !!def && !!t.coverSerial && kg > 0 && this.fraction > 0;
    this.keepBlades = kb; this.keepClumps = kc;
    if (!show) { this.mesh.visible = false; tone.w = 0; this._toneK = 0; return; }
    const p = rig.pos, w = t.shared.uWind.value;
    // The anchor: afresh the first time, or far from the old one; else moved by whole steps.
    // (far: measured along the ground, the traveller's height does not count)
    if (this.has) { const A = this.anchor, pl = p.length(), c = (p.x * A.x + p.y * A.y + p.z * A.z) / (pl * A.length()); if (c < Math.cos(2000 / pl)) this.has = false; }
    if (!this.has) this._anchorAfresh(p, agl);
    {
      const A = this.anchor, e = this._e, n = this._n, dx = p.x - A.x, dy = p.y - A.y, dz = p.z - A.z;
      const ce = dx * e[0] + dy * e[1] + dz * e[2], cn = dx * n[0] + dy * n[1] + dz * n[2];
      if (Math.hypot(ce, cn) > RENEW) {
        const se = Math.round(ce / SNAP) * SNAP, sn = Math.round(cn / SNAP) * SNAP;
        // (the wind's waves pivot on the anchor: carried over so that they do not move)
        const kx = w.x * e[0] + w.y * e[1] + w.z * e[2], ky = w.x * n[0] + w.y * n[1] + w.z * n[2];
        // (the wave at a place is K.(place - anchor) + phase: the anchor moved by S, the phase grows by K.S)
        this.phase += WAVE_K / (Math.hypot(w.x, w.y, w.z) || 1) * (kx * se + ky * sn);
        this._anchorStep(se, sn, p.length() - agl);
      }
    }
    const A = this.anchor, e = this._e, n = this._n, u = this._u;
    const dx = p.x - A.x, dy = p.y - A.y, dz = p.z - A.z;
    const ce = dx * e[0] + dy * e[1] + dz * e[2], cn = dx * n[0] + dy * n[1] + dz * n[2], cu = dx * u[0] + dy * u[1] + dz * u[2];
    const S = this.shared;
    S.uGrassEast.value.set(...e); S.uGrassNorth.value.set(...n); S.uGrassUp.value.set(...u);
    S.uGrassCam.value.set(ce, cn, cu);
    S.uGrassCurve.value.set(t.hs.radius - this.anchorR, 0.5 / t.hs.radius);
    const mod = (a, m) => ((a % m) + m) % m;
    S.uGrassLie.value.set(mod(this.origin[0], PERIOD), mod(this.origin[1], PERIOD));
    for (const f of [...this.fields, ...this.clumps]) f.lat.value.set(mod(Math.round(this.origin[0] / f.f.spacing), 4096), mod(Math.round(this.origin[1] / f.f.spacing), 4096));
    for (const k in this.tables) { const T = this.tables[k], span = T.n * T.cell; T.info.value.set(mod(this.origin[0], span), mod(this.origin[1], span), T.cell, T.n); }
    // The wind's waves: where they are is added up frame by frame (their speed changes with the wind's).
    this.phase = mod(this.phase - dt * (1.2 + 0.12 * w.w), Math.PI * 2);
    {
      const ws = Math.hypot(w.x, w.y, w.z) || 1, k = WAVE_K / ws, wu = w.x * u[0] + w.y * u[1] + w.z * u[2];
      // (along the ground only; measured from the anchor, at the camera)
      const wx = (w.x - u[0] * wu) * k, wy = (w.y - u[1] * wu) * k, wz = (w.z - u[2] * wu) * k;
      this.waveU.value.set(wx, wy, wz, mod(wx * dx + wy * dy + wz * dz + this.phase, Math.PI * 2));
    }
    S.uGrassView.value = 0.5 * renderer.getDrawingBufferSize(this._size || (this._size = new THREE.Vector2())).y;
    S.uGrassKeep.value.set(kb, kc, this.midShare, 1 / Math.sqrt(Math.max(0.25, this.midShare)));
    S.uGrassGov.value.set(Math.min(1, this.fraction), Math.min(1, this.midShare));
    for (const f of this.fields) f.mesh.visible = kb > 0;
    for (const f of this.clumps) f.mesh.visible = kc > 0 && this.midShare > 0;
    // The tables: every entry should hold the place nearest the camera among those it
    // stands for, from the maps there are now. Those that do not are worked out, nearest
    // first, a few hundred a frame (all at once for a picture).
    const serial = t.coverSerial * 100000 + t.ringSerial;
    // (while maps are still arriving, what is there is kept a moment longer)
    if (serial !== this.serial && (!t.tiles.busy || this.gen === 0)) { this.serial = serial; this.gen++; }
    let budget = this.eager ? 1e9 : 300;
    for (const k of ['near', 'mid', 'far']) {
      const T = this.tables[k];
      // (above the clumps' height the middle table only feeds the ground's mean colour: the
      // last one is held, and the table filled only if there is none yet)
      if (k === 'near' ? kb <= 0 : k === 'far' ? kc <= 0 : kc <= 0 && !!this._tone) continue;
      const ci = Math.round((ce + this.origin[0]) / T.cell), cj = Math.round((cn + this.origin[1]) / T.cell);
      budget = T.fill(ci, cj, this.gen, Math.max(budget, k === 'near' && T.pending > 0 ? 200 : 0), (i, j, o, cell) => this._sample(T, i, j, o, cell));
      if (T.changed) { T.changed = false; T.tex.needsUpdate = true; renderer.initTexture(T.tex); if (k === 'mid') this._toneDirty = true; }
    }
    this._landShadow(ce, cn, kc, renderer);
    // The light table's stretches: each ring's, its middle on a place of its own grid nearest the traveller.
    RINGS.forEach((r, k) => {
      const span = 2 * r.out[1] + 6 * r.spacing + 2, cell = span / LIGHT_N;
      const x = Math.round((ce + this.origin[0]) / cell) * cell - this.origin[0], y = Math.round((cn + this.origin[1]) / cell) * cell - this.origin[1];
      this.casc[k].set(x, y, span, r.table === 'near' ? 0 : r.table === 'mid' ? 1 : 2);
      this.lightU[k].value.set(x, y, 1 / span, k);
    });
    // What the ground under and beyond the grass should wear: the grass of the middle field
    // (its mean dryness and how much of it there is), and the flowers that grow most here.
    if (this._toneDirty) {
      this._toneDirty = false;
      let am = 0, dry = 0; const D = this.tables.mid.data, F = this.tables.mid.flora, seen = this._seen.fill(0);
      for (let o = 0; o < D.length; o += 4) { am += D[o + 1]; dry += D[o + 1] * D[o + 2]; seen[F[o >> 2]] += D[o + 1]; }
      // (the flowers the far ground wears: the whole table's majority, and changed only when
      // another flora clearly leads. Tallied from the rows that had just come in, they hung
      // on which way the traveller last walked.)
      let fl = 0, best = 0; for (let f = 1; f < seen.length; f++) if (seen[f] > best) { best = seen[f]; fl = f; }
      if (best > 0 && fl !== this._flora && best > 1.25 * (seen[this._flora || 0] || 0)) this._flora = fl;
      if (!this._flora && best > 0) this._flora = fl;
      this._tone = [am / (D.length / 4), am > 0 ? dry / am : 0.5];
    }
    const [am, dry] = this._tone || [0, 0.5], on = this.tables.mid.pending > this.tables.mid.n * this.tables.mid.n * 0.5 && !(kc <= 0 && this._tone) ? 0 : 1;
    this._toneK = this.eager ? on : (this._toneK ?? 0) + (on - (this._toneK ?? 0)) * Math.min(1, dt * 1.5);
    // (x: how dry, y: how much of the ground is grass, z: the flowers, w: how strongly)
    // (the ground's flower dusting needs places to centimetres in the shader's 32-bit numbers:
    // on a world so large that their step at the surface is coarser than 0.1 m it is blocks that
    // crawl, and the ground gets none; and none while the governor has the middle grass thinned)
    const groundFlora = t.hs.radius * 1.2e-7 > 0.1 || this.midShare < 1 ? 0 : this._flora || 0;
    tone.set(dry, Math.min(1, am * 1.25), groundFlora, this._toneK * kg * Math.min(1, this.fraction * 2));
    this.mesh.visible = true;
  }
}

function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
