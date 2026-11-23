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
import { AMOUNT, DRY, floraAt, flowersAt, FLOWERS_GLSL, GRASS_GLSL, GRASS_GROUND, WAVE_K } from './grassRules.js';

const SHADE_N = 36, SHADE_CELL = 40, SHADE_MOVE = 120;   // the land's shadow for the clumps: places a side, metres between them, how far the traveller goes before it is asked again
const SNAP = 40;                 // the anchor moves in steps of this (m)
const RENEW = 60;                // ... when the traveller is this far from it
const PERIOD = 2560;             // the stretches of taller and drier grass repeat after this (m; a multiple of SNAP)
// The ground tables: places a side, metres between them.
const TABLES = { near: { n: 64, cell: 1.25 }, mid: { n: 128, cell: 4 }, far: { n: 128, cell: 10 } };
// The blades: tufts a side, metres between them, blades a tuft, a blade's width (m), and
// where they thin out (m from the camera).
const NEAR = { grid: 128, spacing: 0.2, blades: 8, wide: 0.012, seed: 0, out: [9.0, 12.2] };
const FAR = { grid: 144, spacing: 0.5, blades: 7, wide: 0.02, seed: 37, out: [17, 34] };
const FLOWERS = { grid: 108, spacing: 0.4, seed: 91, out: [15.5, 20.5] };
// The clumps: clumps a side, metres between them, which table, where they come in and go
// out (m), how tall and wide a clump is (m, before the grass's own height).
export const CLUMPS = [
  { grid: 200, spacing: 0.8, table: 'mid', in: [13, 30], out: [50, 74], tall: 0.5, wide: 1.3, seed: 11 },
  { grid: 200, spacing: 2.0, table: 'mid', in: [50, 74], out: [135, 188], tall: 0.62, wide: 3.0, seed: 23 },
  { grid: 220, spacing: 5.0, table: 'far', in: [135, 188], out: [320, 545], tall: 0.85, wide: 6.6, seed: 47 },
];
// The clumps' picture: blades side by side, repeating across (a card shows as much of it as it is wide).
const PIC_W = 256, PIC_H = 64;

// --- the clumps' picture, made by rule: R how much is covered, G how far up its blade
// (0 at the foot), B the flower heads on some blades' tips. Mip levels made here (not on
// the GPU in the middle of a frame), the tone and flowers weighted by what covers.
function rngOf(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function makeClumpPicture() {
  const SS = 4, W = PIC_W * SS, H = PIC_H * SS, cov = new Float32Array(W * H), tone = new Float32Array(W * H), fl = new Float32Array(W * H);
  const R = rngOf(4242);
  const blade = (x0, len, lean, w0, flower) => {
    for (let y = 0; y < H; y++) {
      const t = y / (len * H); if (t > 1) break;
      const xc = x0 + lean * t * t, hw = Math.max(0.35, w0 * (1 - t) * SS * 0.5);
      for (let x = Math.floor(xc - hw); x <= Math.ceil(xc + hw); x++) {
        const c = Math.min(1, Math.max(0, hw + 0.5 - Math.abs(x + 0.5 - xc)));
        if (c <= 0) continue;
        const o = y * W + (((x % W) + W) % W);
        if (c > cov[o] || t > tone[o]) { tone[o] = Math.max(tone[o] * cov[o], t * c) / Math.max(1e-6, Math.max(cov[o], c)); cov[o] = Math.max(cov[o], c); }
      }
    }
    if (flower) {
      const cx = x0 + lean, cy = len * H, r = 3.0 * SS;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (y < 0 || y >= H) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d > r) continue;
        const o = y * W + (((x % W) + W) % W); cov[o] = 1; tone[o] = 1; fl[o] = 1;
      }
    }
  };
  // (a mat of short blades at the foot, then the tall ones, some with a flower head)
  for (let k = 0; k < 150; k++) blade(R() * W, 0.18 + 0.3 * R(), (R() - 0.5) * 0.5 * H * 0.3, 2.6 + 1.4 * R(), false);
  for (let k = 0; k < 80; k++) { const len = 0.5 + 0.48 * R(); blade(R() * W, len, (R() - 0.5) * 2 * len * H * 0.38, 2.4 + 1.2 * R(), k % 2 === 0 && len > 0.58); }
  // down to the picture's own size, then the mip levels
  const levels = [];
  let w = PIC_W, h = PIC_H, c0 = new Float32Array(w * h), t0 = new Float32Array(w * h), f0 = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = 0, t = 0, f = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const o = (y * SS + j) * W + x * SS + i; c += cov[o]; t += tone[o] * cov[o]; f += fl[o]; }
    const q = y * w + x; c0[q] = c / (SS * SS); t0[q] = c > 0 ? t / c : 0; f0[q] = f / (SS * SS);
  }
  for (;;) {
    const data = new Uint8Array(w * h * 4);
    for (let q = 0; q < w * h; q++) { data[q * 4] = Math.round(c0[q] * 255); data[q * 4 + 1] = Math.round(t0[q] * 255); data[q * 4 + 2] = Math.round(Math.min(1, f0[q] / Math.max(c0[q], 1e-6)) * 255); data[q * 4 + 3] = 255; }
    levels.push({ data, width: w, height: h });
    if (w === 1 && h === 1) break;
    const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1), c1 = new Float32Array(w2 * h2), t1 = new Float32Array(w2 * h2), f1 = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      let c = 0, t = 0, f = 0, n = 0;
      for (let j = 0; j < (h > 1 ? 2 : 1); j++) for (let i = 0; i < (w > 1 ? 2 : 1); i++) { const o = (y * (h > 1 ? 2 : 1) + j) * w + x * (w > 1 ? 2 : 1) + i; c += c0[o]; t += t0[o] * c0[o]; f += f0[o]; n++; }
      const q = y * w2 + x; c1[q] = c / n; t1[q] = c > 0 ? t / c : 0; f1[q] = f / n;
    }
    w = w2; h = h2; c0 = c1; t0 = t1; f0 = f1;
  }
  const tex = new THREE.DataTexture(levels[0].data, PIC_W, PIC_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = levels; tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}

// --- shaders
const PRELUDE = /* glsl */`
  uniform vec3 uGrassCam, uGrassEast, uGrassNorth, uGrassUp;       // the camera on the anchor's plane: east, north, up (m)
  uniform vec2 uGrassCurve;          // x: the datum's radius less the anchor's, y: 1 / (2 x the world's radius)
  uniform vec4 uGrassWind;           // the wind: xyz where it blows (planet axes), w its speed (m/s)
  uniform vec2 uGrassLie;            // the anchor on the plane counted from the grass's origin, modulo PERIOD (m)
  uniform vec2 uLatOrigin;           // ... and in this lattice's cells, modulo 4096
  uniform float uGrassView;          // the picture's height (pixels), halved
  uniform vec4 uGrassKeep;           // how much is kept by the height of the traveller: x blades, y clumps; z the governor's share of the clumps, w how much wider they are for it
  uniform vec4 uGrassTone;           // x: how dry the grass round the traveller is in the mean (the ground under it is painted with this)
  ${GRASS_GLSL}
  // how dry a tuft is: mostly what the ground under it is painted as, a little its own place's
  // (by its own place's alone, a green stretch of blades stood on golden ground: a dark smear)
  float dryHere(float own) { return mix(own, uGrassTone.x, 0.7); }
  out vec3 vRel; out vec4 vAlb;      // the surface's colour, and how much of the sky's light it has
  vec2 hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
  // a ground table at a place of the plane (at, m from the anchor): the four entries round it, blended
  vec4 tableAt(sampler2D t, vec4 info, vec2 at) {
    vec2 f = (at + info.xy) / info.z, i = floor(f), w = f - i;
    ivec2 a = ivec2(mod(i, info.w)), b = ivec2(mod(i + 1.0, info.w));
    vec4 t00 = texelFetch(t, a, 0), t10 = texelFetch(t, ivec2(b.x, a.y), 0), t01 = texelFetch(t, ivec2(a.x, b.y), 0), t11 = texelFetch(t, b, 0);
    vec4 g = mix(mix(t00, t10, w.x), mix(t01, t11, w.x), w.y);
    // (the height from the entries that have grass: one without may hold another place's
    // height until it is worked out, and pulled the tufts beside it into the air)
    vec4 k = vec4((1.0 - w.x) * (1.0 - w.y), w.x * (1.0 - w.y), (1.0 - w.x) * w.y, w.x * w.y) * (step(0.001, vec4(t00.g, t10.g, t01.g, t11.g)) + 0.001);
    g.r = dot(k, vec4(t00.r, t10.r, t01.r, t11.r)) / (k.x + k.y + k.z + k.w);
    return g;
  }
  vec4 tableNearest(sampler2D t, vec4 info, vec2 at) { return texelFetch(t, ivec2(mod(floor((at + info.xy) / info.z + 0.5), info.w)), 0); }
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
  #define OUT_OF_PICTURE { vRel = vec3(0.0); vAlb = vec4(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }`;

const GRASS_VERT = /* glsl */`
  in float aBlade;
  uniform sampler2D tGrass; uniform vec4 uTabNear;
  ${PRELUDE}
  void main() {
    vec2 cell, rc = latticeCell(cell), h = hash2(cell), h2 = hash2(cell + 71.3 + aBlade * 7.7);
    vec2 rel2 = rc + (h - 0.5) * 0.7 * SPACING, at = rel2 + uGrassCam.xy;
    float dist = length(rel2);
    vec4 g = tableAt(tGrass, uTabNear, at);
    // (thinner where the map has less grass, tuft by tuft; and blade by blade out to the end of the field)
    float keep = step(h.y, g.g * 1.15) * keepOf((1.0 - smoothstep(OUT0, OUT1, dist)) * uGrassKeep.x, h2.x);
    // (no tuft here: out of the picture altogether. Left in, a blade of no height is a
    // sliver lying on the ground that still lands on a pixel now and then: a sprinkle of
    // dark specks on water, sand and rock, wherever there is no grass.)
    if (keep <= 0.0) OUT_OF_PICTURE
    float lie = lieAt(at);
    float tall = (0.24 + 0.34 * h2.x) * (0.6 + 0.6 * g.g) * (1.0 + 0.3 * g.b) * (0.85 + 0.3 * lie) * keep;
    // the blade: its foot somewhere in the tuft, turned its own way, leaning outward
    float turn = h2.y * 6.2831853, c = cos(turn), s = sin(turn);
    vec2 foot = rel2 + ((h2 - 0.5) * 0.5 + (hash2(cell + aBlade) - 0.5) * 0.4) * min(1.0, SPACING * 2.0);
    float wide = WIDE * (0.8 + 0.9 * h2.x) * (1.0 + dist * 0.06);          // (wider far off: fewer pixels, the same mass)
    vec2 across = vec2(c, s) * wide * position.x, lean = vec2(-s, c) * (0.10 + 0.22 * h2.y) * tall;
    float base = groundUp(g, at);
    vec3 w = windAt(uGrassEast * rel2.x + uGrassNorth * rel2.y + uGrassUp * base, h.x);
    vec2 blow = w.xy * tall;
    float y = position.y;
    vec2 p2 = foot + across * (1.0 - y) + (lean + blow) * y * y;
    float up = base + tall * y * (1.0 - 0.25 * length(lean + blow) / max(tall, 0.01));
    vRel = uGrassEast * p2.x + uGrassNorth * p2.y + uGrassUp * up;
    // green grass and dry grass, each darker at the foot (the blades shade each other
    // there); paler where the wind's wave bows them
    vAlb = vec4(grassColour(dryHere(g.b) + (h.x - 0.5) * 0.16 - 0.10 * lie, y) * (0.85 + 0.3 * h.x) * (0.92 + 0.12 * lie) * (0.94 + 0.12 * w.z), 0.55 + 0.45 * y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vRel, 1.0);
  }`;

// A flower: a stem (part 0), five petals (1..5) round a middle (6). Daisies, poppies and
// the like hold the petals as a cup turned up and toward whoever looks; lupins and
// fireweed stack them up the top of the stem.
const FLOWER_VERT = /* glsl */`
  in float aPart;
  uniform sampler2D tGrass; uniform vec4 uTabNear;
  ${PRELUDE}
  ${FLOWERS_GLSL}
  void main() {
    vec2 cell, rc = latticeCell(cell), h = hash2(cell), h2 = hash2(cell + 23.9);
    vec2 rel2 = rc + (h - 0.5) * 0.8 * SPACING, at = rel2 + uGrassCam.xy;
    vec4 g = tableAt(tGrass, uTabNear, at);
    // (which kind grows here is not something to blend: the nearest entry says)
    float fl = tableNearest(tGrass, uTabNear, at).a, kind = floor(fl + 0.001), dist = length(rel2);
    float keep = step(0.5, kind) * step(h2.x, fract(fl + 0.001) * 1.1) * step(0.1, g.g) * keepOf((1.0 - smoothstep(OUT0, OUT1, dist)) * uGrassKeep.x, h.x);
    if (keep <= 0.0) OUT_OF_PICTURE
    float spike = (abs(kind - 3.0) < 0.5 || abs(kind - 5.0) < 0.5) ? 1.0 : 0.0;
    // the stem: as tall as the grass round it and a little more, so the heads stand clear
    float stem = (0.50 + 0.22 * h2.y) * (0.6 + 0.6 * g.g) * (1.0 + 0.3 * g.b) * (1.0 + 0.3 * spike) * keep;
    float size = (kind > 6.5 ? 0.065 : (abs(kind - 2.0) < 0.5 || kind > 5.5) ? 0.044 : 0.034) * (0.8 + 0.4 * h.y) * (1.0 + dist * 0.045) * keep;
    float base = groundUp(g, at);
    vec3 foot = uGrassEast * rel2.x + uGrassNorth * rel2.y + uGrassUp * base;
    vec3 w = windAt(foot, h.x);
    vec2 top2 = rel2 + ((h - 0.5) * 0.24 + w.xy * 1.3) * stem;
    vec3 top = uGrassEast * top2.x + uGrassNorth * top2.y + uGrassUp * (base + stem);
    vec3 toCam = normalize(-top), side = normalize(cross(uGrassUp, toCam) + uGrassEast * 1e-4);
    vec3 col; float sky = 1.0;
    if (aPart < 0.5) {
      vRel = mix(foot, top, position.y) + side * position.x * 0.007 * (1.0 + dist * 0.07) * (1.0 - 0.5 * position.y);
      col = grassColour(0.0, 0.35 + 0.55 * position.y); sky = 0.6 + 0.4 * position.y;
    } else if (spike > 0.5) {
      // a spike: the petals one above another down from the tip, left and right in turn, smaller toward the tip
      float k = aPart - 1.0, sgn = mod(k, 2.0) < 0.5 ? 1.0 : -1.0, shrink = 1.0 - 0.12 * k;
      vec2 q = aPart > 5.5 ? vec2(0.0, 0.3) : vec2(position.x * 0.9 * sgn + 0.25 * sgn * position.y, -position.y * 0.55 - (4.0 - k) * 0.62) * shrink;
      vRel = top + (side * q.x + uGrassUp * q.y) * size * 1.5;
      col = petalColour(kind, h2.y) * (0.8 + 0.25 * position.y);
    } else {
      // a cup of five petals, turned up and toward whoever looks
      vec3 nrm = normalize(uGrassUp * 0.8 + toCam * 0.55 + (uGrassEast * (h.x - 0.5) + uGrassNorth * (h.y - 0.5)) * 0.6);
      vec3 a = normalize(cross(nrm, uGrassEast + uGrassUp * 0.3)), b = cross(nrm, a);
      bool mid = aPart > 5.5;
      float ang = (aPart - 1.0) * 1.2566371 + h.x * 6.2831853, c = cos(ang), s = sin(ang);
      vec2 q0 = position.xy * (mid ? vec2(0.55, 0.34) : vec2(1.0)) - (mid ? vec2(0.0, 0.17) : vec2(0.0)), q = vec2(q0.x * c - q0.y * s, q0.x * s + q0.y * c);
      vRel = top + (a * q.x + b * q.y + nrm * (mid ? 0.12 : 0.32 * position.y * position.y)) * size;
      col = mid ? (abs(kind - 2.0) < 0.5 ? vec3(0.03, 0.02, 0.03) : kind > 6.5 ? vec3(0.85, 0.70, 0.10) : vec3(0.80, 0.52, 0.03)) : petalColour(kind, h2.y) * (0.78 + 0.3 * position.y);
    }
    vAlb = vec4(col, sky);
    gl_Position = projectionMatrix * viewMatrix * vec4(vRel, 1.0);
  }`;

// A clump: one card standing on the ground, turned to the camera (and leaning back toward
// it as one looks down from higher up), showing as much of the picture as it is wide.
const CLUMP_VERT = /* glsl */`
  in vec2 aCorner;                   // x across the card (-1..1), y up it (0..1)
  uniform sampler2D tTable; uniform vec4 uTab;
  ${PRELUDE}
  ${FLOWERS_GLSL}
  ${TREE_SHADE_VERT}
  uniform vec4 uWeather;
  uniform sampler2D tLandShade; uniform vec4 uLandShade;   // the land's own shadow round the traveller: xy its middle from the anchor (m), z 1 / its span, w 1 when there is one
  out float vCloud;                  // the cloud between this clump and the Sun (1: none)
  out vec3 vUv;                      // the picture (u, v), and how far across the card (-1..1)
  out vec3 vFoot, vTip; out vec4 vFlower; out vec4 vSlope; out float vEven;
  void main() {
    vec2 cell, rc = latticeCell(cell), h = hash2(cell), h2 = hash2(cell + 17.31);
    vec2 rel2 = rc + (h - 0.5) * 0.98 * SPACING, at = rel2 + uGrassCam.xy;
    float dist = length(rel2);
    // (this field's ring: in over IN0..IN1, out over OUT0..OUT1; the traveller's height; the governor)
    float ring = smoothstep(IN0, IN1, dist) * (1.0 - smoothstep(OUT0, OUT1, dist)) * uGrassKeep.y;
    if (ring <= 0.0) OUT_OF_PICTURE
    vec4 g = tableAt(tTable, uTab, at);
    float keep = step(h.y, g.g * 1.15) * keepOf(ring, h2.x);
    if (keep <= 0.0) OUT_OF_PICTURE
    float lie = lieAt(at), base = groundUp(g, at);
    // (the lie of the ground under the clump, from the table)
    vec2 fc = floor((at + uTab.xy) / uTab.z);
    float h00 = texelFetch(tTable, ivec2(mod(fc, uTab.w)), 0).r;
    vec2 dh = (vec2(texelFetch(tTable, ivec2(mod(fc + vec2(1.0, 0.0), uTab.w)), 0).r, texelFetch(tTable, ivec2(mod(fc + vec2(0.0, 1.0), uTab.w)), 0).r) - h00) / uTab.z;
    vec3 nrm = normalize(uGrassUp - uGrassEast * dh.x - uGrassNorth * dh.y);
    vec3 foot = uGrassEast * rel2.x + uGrassNorth * rel2.y + uGrassUp * base, toCam = normalize(-foot);
    // How squarely the ground is looked at here: from above, or a hillside that faces the
    // eye at a level gaze (judged by the world's up alone, such a hillside was hatched with
    // level dashes in rows). The more squarely, the lower a clump stands and the more it is
    // the ground's own colour with a tufted edge.
    float rise = clamp(max(dot(toCam, uGrassUp), dot(toCam, nrm)), 0.0, 1.0);
    float tall = TALL * (0.6 + 0.6 * g.g) * (1.0 + 0.3 * g.b) * (0.85 + 0.3 * lie) * (0.8 + 0.4 * h2.y) * keep * (1.0 - 0.45 * smoothstep(0.15, 0.6, rise));
    float wide = WIDE * (0.45 + 1.1 * h.x * h.x) * uGrassKeep.w * keep;
    // (behind the camera or far off the side of the picture: nothing to draw)
    vec4 cc = projectionMatrix * viewMatrix * vec4(foot + uGrassUp * (0.5 * tall), 1.0);
    float m = wide + tall;
    // (smaller than a pixel and a half on the screen: not drawn, where it was a one-pixel dash)
    if (tall * abs(projectionMatrix[1][1]) * uGrassView < 1.5 * cc.w) OUT_OF_PICTURE
    if (cc.w < -m || abs(cc.x) > cc.w + m * (1.0 + projectionMatrix[0][0]) || abs(cc.y) > cc.w + m * (1.0 + abs(projectionMatrix[1][1]))) OUT_OF_PICTURE
    vec3 flat3 = toCam - uGrassUp * dot(toCam, uGrassUp);
    float fl = length(flat3); flat3 = fl > 1e-4 ? flat3 / fl : uGrassNorth;
    // (turned a little its own way: cards all square to the eye were a hatching of level strokes from above)
    float yaw = (h2.y - 0.5) * 1.3;
    vec3 side = cross(uGrassUp, flat3) * cos(yaw) + flat3 * sin(yaw);
    // (and rolled a little its own way where the ground is looked at squarely: no two dashes level)
    float roll = (h.x - 0.5) * 1.4 * smoothstep(0.1, 0.5, rise);
    side = side * cos(roll) + uGrassUp * sin(roll);
    vec3 cup = normalize(uGrassUp + flat3 * rise * 2.0);
    vec3 w = windAt(foot, h.x);
    float y = aCorner.y;
    vRel = foot + side * (aCorner.x * 0.5 * wide) + cup * (y * tall) + (uGrassEast * w.x + uGrassNorth * w.y) * (tall * 1.4 * y * y);
    vUv = vec3((aCorner.x * 0.5 + 0.5) * wide / (4.0 * tall / ${(PIC_W / PIC_H / 4).toFixed(3)}) + h2.x * 7.0, y, aCorner.x);
    float dry = dryHere(g.b) + (h.x - 0.5) * 0.16 - mix(0.10, 0.2, smoothstep(30.0, 120.0, dist)) * lie, shade = (0.85 + 0.3 * h2.y) * (0.92 + 0.12 * lie) * (0.94 + 0.12 * w.z);
    shade = mix(shade, 1.0, 0.8 * smoothstep(0.05, 0.35, rise));
    vFoot = grassColour(dry, 0.0) * shade; vTip = grassColour(dry, 1.0) * shade;
    // (flowers: the drift this clump stands in says what kind and how many clumps carry some)
    float fk = tableNearest(tTable, uTab, at).a, kind = floor(fk + 0.001);
    // (fewer heads show from above and far off: grass with a dusting, and no band of colour along the skyline)
    vFlower = vec4(petalColour(kind, h.y), step(0.5, kind) * step(hash2(cell + 5.1).x, fract(fk + 0.001) * 0.6) * (1.0 - 0.5 * rise) * (1.0 - 0.7 * smoothstep(60.0, 400.0, dist)));
    // (the lie of the ground under the clump, from the table: far off a clump takes the
    // light of the slope it stands on, as the ground between the clumps does. Lit as level
    // ground, a hillside turned from the Sun was bright scales on a dark slope.)
    vSlope = vec4(nrm, smoothstep(12.0, 45.0, dist));
    // (looked down on, or far off, a clump is the ground's own grass colour with a tufted
    // edge: its dark foot showing from above was a field of dark specks that ended in an arc)
    // (the clouds' shadow where the clump stands, by the ground's own rule: with the shade at
    // the traveller for every clump, stepping under a cloud dimmed half a kilometre of grass
    // on sunlit ground. Close by it is the traveller's, as the blades have it.)
    vCloud = mix(uWeather.x, cloudShade(foot), smoothstep(30.0, 120.0, dist));       // (from the map of it: life/treeShade.js)
    // (and the land's: a ridge between the clump and the Sun. Beyond the shadow maps the
    // clumps of a meadow in a ridge's shadow stood sunlit on dark ground.)
    vCloud *= mix(1.0, texture(tLandShade, (at - uLandShade.xy) * uLandShade.z + 0.5).r, uLandShade.w * smoothstep(30.0, 120.0, dist));
    vEven = 0.9 * max(smoothstep(0.05, 0.35, rise), smoothstep(120.0, 420.0, dist));
    vAlb = vec4(0.0, 0.0, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(vRel, 1.0);
  }`;

const FRAG = /* glsl */`${LIGHTING_PARS}
  in vec3 vRel; in vec4 vAlb;
  layout(location = 0) out vec4 fragColor;
  vec3 grassLit(vec3 alb, float skyShare, vec4 slope, float cloud) {
    vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
    // (a field is lit as the ground it stands on: by the Sun's height over it, in the shade of whatever stands near)
    float nl = dot(up, uSunDir), lit = uPaint.x > 0.0 ? paintLit(nl * 0.7 + 0.3) * PI : max(nl, 0.0);
    // (slope: the ground's own lie and how much of its light the grass takes)
    if (slope.w > 0.0) { float ns = dot(slope.xyz, uSunDir); lit = mix(lit, uPaint.x > 0.0 ? paintLit(ns) * PI : max(ns, 0.0), slope.w); }
    vec3 col = alb * (directSun(planetPos) * cloud * nearShadow(vRel + up * 0.15, up) * lit + skyLight(up, up) * skyShare) / PI;
    return aerialPerspective(col, vRel);
  }
  #ifdef CLUMP
  uniform sampler2D tClump;
  in vec3 vUv; in vec3 vFoot, vTip; in vec4 vFlower; in vec4 vSlope; in float vEven; in float vCloud;
  void main() {
    vec4 p = texture(tClump, vUv.xy);
    // (the card's ends rounded off; and the cut kept as sharp far off as near, where the
    // picture's coarser levels hold less cover per texel)
    float e = abs(vUv.z) / (1.0 - 0.45 * vUv.y), cov = p.r * (1.0 - smoothstep(0.55, 1.0, e)) * (1.0 - p.b * (1.0 - vFlower.a));
    vec2 tp = vUv.xy * vec2(${PIC_W}.0, ${PIC_H}.0);
    float lod = 0.5 * log2(max(dot(dFdx(tp), dFdx(tp)), dot(dFdy(tp), dFdy(tp))));
    cov *= 1.0 + 0.28 * clamp(lod, 0.0, 5.0);
    if (cov < 0.5) discard;
    float tone = mix(p.g, 0.62, vEven);
    vec3 alb = mix(vFoot, vTip, tone);
    alb = mix(alb, vFlower.rgb, p.b * vFlower.a);
    fragColor = vec4(grassLit(alb, 0.55 + 0.45 * tone, vSlope, vCloud) * uExposure, 1.0);
  }
  #else
  void main() { fragColor = vec4(grassLit(vAlb.rgb, vAlb.a, vec4(0.0), 1.0) * uExposure, 1.0); }
  #endif`;

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
      uGrassWind: wind, uGrassWave: this.waveU, uGrassKeep: { value: new THREE.Vector4(1, 1, 1, 1) }, uGrassView: { value: 500 }, uGrassTone: terrain.shared.uGrassTone,
    };
    this.clumpTex = makeClumpPicture();
    // The land's own shadow on the ground round the traveller (a mountain between a place
    // and the Sun), for the clumps: SHADE_N x SHADE_N places SHADE_CELL apart, asked of the
    // shadow baker in one worker job when the traveller has gone SHADE_MOVE from its middle,
    // the Sun has turned a degree and a half or maps have arrived. Sunlit until the first answer.
    this.shade = new Uint8Array(SHADE_N * SHADE_N).fill(255);
    this.shadeTex = new THREE.DataTexture(this.shade, SHADE_N, SHADE_N, THREE.RedFormat, THREE.UnsignedByteType);
    this.shadeTex.minFilter = this.shadeTex.magFilter = THREE.LinearFilter; this.shadeTex.needsUpdate = true;
    this.shadeU = { value: new THREE.Vector4(0, 0, 1 / (SHADE_N * SHADE_CELL), 0) };
    this._shade = null; this._shadeAsking = false; this._shadeNew = null;
    this._seen = new Float64Array(32);
    // a field: one tuft (or flower, or clump) of triangles, drawn once for every place of its lattice
    const field = (f, geo, vertexShader, own, defines, tris) => {
      geo.instanceCount = f.grid * f.grid;
      const lat = { value: new THREE.Vector2() };
      const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, side: THREE.DoubleSide, uniforms: { ...this.shared, ...own, uLatOrigin: lat }, vertexShader, fragmentShader: FRAG,
        defines: { ...atmosphereDefines(), GRID: f.grid, SPACING: f.spacing.toFixed(3), BOX: (f.grid * f.spacing).toFixed(2), SEED: f.seed.toFixed(1), WIDE: (f.wide || 0).toFixed(4), ...defines },
      });
      const mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false;
      return { f, geo, mesh, lat, all: f.grid * f.grid, tris };
    };
    const near = { tGrass: { value: this.tables.near.tex }, uTabNear: this.tables.near.info };
    const plain = (pos, attr, values) => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute(attr, new THREE.BufferAttribute(new Float32Array(values), 1)); return g; };
    // a tuft: each blade a triangle; x: across the blade (-1, 1, 0 at the tip), y: up it, and which blade it is
    const tuft = (f) => { const p = [], b = []; for (let i = 0; i < f.blades; i++) { p.push(-1, 0, 0, 1, 0, 0, 0, 1, 0); b.push(i, i, i); } return field(f, plain(p, 'aBlade', b), GRASS_VERT, near, { OUT0: f.out[0].toFixed(2), OUT1: f.out[1].toFixed(2) }, f.blades); };
    // a flower: the stem as a blade, each petal a triangle from the middle outward (x across, y out), the middle a triangle
    const flower = (f) => { const p = [-1, 0, 0, 1, 0, 0, 0, 1, 0], b = [0, 0, 0]; for (let i = 1; i <= 6; i++) { p.push(0, 0, 0, -0.62, 1, 0, 0.62, 1, 0); b.push(i, i, i); } return field(f, plain(p, 'aPart', b), FLOWER_VERT, near, { OUT0: f.out[0].toFixed(2), OUT1: f.out[1].toFixed(2) }, 7); };
    // a clump: one card, two triangles
    const clump = (f) => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]), 2));
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));       // (three wants one; the shader does not read it)
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const t = this.tables[f.table];
      return field(f, g, CLUMP_VERT, { tTable: { value: t.tex }, uTab: t.info, tClump: { value: this.clumpTex }, ...TREE_SHADE_UNIFORMS, tLandShade: { value: this.shadeTex }, uLandShade: this.shadeU },
        { CLUMP: 1, OWN_CLOUD_SHADOW: 1, IN0: f.in[0].toFixed(2), IN1: f.in[1].toFixed(2), OUT0: f.out[0].toFixed(2), OUT1: f.out[1].toFixed(2), TALL: f.tall.toFixed(3) }, 2);
    };
    this.fields = [tuft(NEAR), tuft(FAR), flower(FLOWERS)];
    this.clumps = CLUMPS.map((f) => clump({ ...f, wide: f.wide }));
    this.mesh = new THREE.Group(); for (const f of [...this.fields, ...this.clumps]) this.mesh.add(f.mesh);
    this.mesh.visible = false;
    this.anchor = new THREE.Vector3(); this.anchorR = 0; this.has = false; this.def = null; this.serial = -1; this.gen = 0;
    this.origin = [0, 0];                // the anchor on the plane, counted from where the grass began (m, multiples of SNAP)
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0]; this._d = [0, 0, 0];
    this.fraction = 1; this.midShare = 1; this.phase = 0; this.eager = false;
    this.keepBlades = 0; this.keepClumps = 0;
  }

  setWorld(world) { this.def = world.life?.grass || null; this.has = false; this.mesh.visible = false; this.seaLevel = world.surface.sea ? (world.surface.sea.level ?? 0) : null; }

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
    const R = hs.radius + h, flora = floraAt(cls, Math.abs(Math.asin(d[2])) * 57.29578, h, amount);
    D[o + 3] = flora ? flowersAt(d[0] * R, d[1] * R, d[2] * R, flora) : 0;
    T.flora[o >> 2] = flora;
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
    if (!this._clumpUp) { renderer.initTexture(this.clumpTex); this._clumpUp = true; }
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
