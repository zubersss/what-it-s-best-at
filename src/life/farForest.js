// The far forest: the trees one cannot walk among, out to some kilometres — the same trees
// as those near by, at the same places, thinned with distance.
//
// What was here before (`groves.js`): beyond the 240 m of trees.js, one site in eighteen on
// a lattice of its own, out to 2 km. Those were *other* trees than the ones a traveller had
// just walked past: at 240 m a wood thinned eighteen times over and every tree in it moved.
//
// How it works now:
//
// - **One lattice.** Every tree site has a **rank** (treeBlock.js, `siteRank`): a hash of
//   the site alone, 0..1, of nothing else. The trees of a band of ranks are the very trees
//   that stand there, at their own places, with their own shapes.
// - **How many stand at a distance.** `keep(d) = (full / d)^2`, capped at 1: full density
//   out to `full` metres, then thinner and thinner. A tree is drawn when its rank is under
//   `keep` at its own distance from the eye, and it **grows in** as that distance closes
//   (never pops). The thinned ones are drawn a little wider, so a wood keeps its cover.
// - **Tiles.** The ground is worked out in squares of tree blocks in one worker job
//   (treeBlock.js, `treeTile`), a band of ranks at a time: level 0 asks for the thickest
//   band (a quarter of all sites and up) over 8 x 8 blocks (889 m), level 1 for the quarter
//   of that band below it over 16 x 16, and so on. Each level's trees are drawn twice as
//   far out as the one before, so the same number of tiles, and about the same number of
//   trees in each, serve every distance. Every tile is one instanced mesh from a fixed
//   pool, filled when it arrives (and again, from the same data, when the traveller has
//   come close enough that more of its trees are wanted); nothing is worked out per tree
//   per frame.
// - **The join.** Inside `inner` (where trees.js draws its own trees) nothing here is
//   drawn: a clean cut by distance from the eye in both shaders, on the same tree, with
//   the same picture, size, turn and colours on both sides of it.
//
// A world has them with `life.trees.far: { full (m), radius (m), below (m above the ground:
// none from higher) }`; how many levels, how large a tile and how many trees one may hold
// are the same on every world (the constants below).
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';
import { VARIANTS } from './treeGeometry.js';
import { SPECIES, treeLook, COLOUR_TOP } from './cover.js';
import { TREE_FLOATS } from './treeBlock.js';
import { BASE_BLOCKS, BAND, LEVELS, band, levelReach, wantedTiles, GROW } from './farTiles.js';
import { ATLAS_W, ATLAS_H } from './treeAtlasLayout.js';
import { PAINT_LEAF, TREE_WOOD, TREE_THIN, ROSETTE_THIN } from './trees.js';
import { SNOW_GLSL, SNOW_UNIFORMS } from '../render/snowGlsl.js';
import { TREE_SHADE_VERT, TREE_SHADE_UNIFORMS } from './treeShade.js';
import { SHADOW0, FORM_GLSL, SHADOW_GLSL, FAR_GREEN_GLSL, DENS_STEPS, SHADOW_LONG, SHADOW_FAR0, SHADOW_FAR1, TOP0, TOP1, TOP_MAX, TOP_POW, END_ABOVE } from './farTreeForm.js';

// Trees one tile may hand the GPU (a fixed pool). A band of ranks of levels 0 to 2 has at
// most 64 blocks x 256 sites x 3/4 = 12 288 sites, and a traveller in the thick of a wood
// wants nearly all of the tile underfoot (11 425 at the north wood, level 1): at 6 144 one
// tree in six that should have stood was left out there.
const CAP = 12288;
const POOL = 40;              // tiles drawn at once
// A tree is looked down on at the angle its shadow begins at (farTreeForm.js, SHADOW0) when
// it is no farther off along the ground than this many times the traveller's height; half
// as much again, for ground that falls away.
const SHADOW_REACH = 1.5 * Math.sqrt(1 / (SHADOW0 * SHADOW0) - 1);
// A tile's shadows, from the eye's distance from the world's middle, its lowest tree's and
// its nearest point's distance along the ground (m): air, how much of them is drawn (0 to 60
// m over the tile, all from 160 m), and reach, whether any of its trees can be looked down
// on at the angle shadows begin at (scripts/far-tree-form-test.mjs checks a rim).
export function tileShadow(eyeLen, low, near) {
  const over = Math.max(0, eyeLen - low), a = Math.min(1, Math.max(0, (over - 60) / 100));
  return { over, air: a * a * (3 - 2 * a), reach: near < over * SHADOW_REACH + 400 };
}
// How steeply a tree is looked down on, as the vertex shader measures it (`down`): the sine
// of the angle to its crown (its foot plus 0.7 of its height along up), 0 from the side, 1
// from straight above. foot: the tree's foot from the eye (m); up: the tile's up.
export function crownDown(fx, fy, fz, h, up) {
  const cx = fx + up[0] * 0.7 * h, cy = fy + up[1] * 0.7 * h, cz = fz + up[2] * 0.7 * h;
  return -(cx * up[0] + cy * up[1] + cz * up[2]) / Math.max(1e-6, Math.hypot(cx, cy, cz));
}
// Whether a tile is handed its shadows' draw: when the most steeply seen of its trees at its
// last fill (maxDown) is near the angle shadows begin at. rise: how much higher the eye is
// now than at that fill (m); near: the tile's nearest point along the ground (m). (By the
// height over the tile's lowest tree alone, nearly every tile on Haven reaches down into a
// valley or the sea, and on foot in a wood 32 of 33 tiles drew the shadows of trees none of
// which could cast one: review farforest2-1.)
export function shadowGate(maxDown, rise, near) {
  return maxDown * 1.05 + Math.max(0, rise) / Math.max(50, near) > SHADOW0;
}
const MARGIN = 1.5;           // a tile is filled with rather more trees than are wanted now, so that coming nearer does not refill it at once

// Three bytes of colour in one number a float can hold exactly (the shader takes it apart).
// Leaves and bark are dark (0.03 to 0.6 of the light that falls on them): the byte covers
// that range, not 0 to 1, so that a far tree's green is the near one's to within a part in
// three hundred and the two cannot differ at the line where they meet.
// (COLOUR_TOP: life/cover.js, with treeLook, which the near trees ask too)
// A tree in flower, far off: its leaf colour gone over to its petals' as far as it is in
// flower (near by the picture says which texels are petals: life/trees.js; here the whole
// crown takes the colour).
const b8 = (v) => Math.round(Math.min(1, Math.max(0, v / COLOUR_TOP)) * 255);
function pack(c) { return b8(c[0]) * 65536 + b8(c[1]) * 256 + b8(c[2]); }
// A tree's leaves on a day, packed (tl: treeLook's answer for it)
function packLook(sp, tl) {
  if (!sp.blossom) return b8(tl.r) * 65536 + b8(tl.g) * 256 + b8(tl.b);
  const k = tl.open * 0.8, c = sp.blossom.colour;
  return b8(tl.r + (c[0] * 0.5 - tl.r) * k) * 65536 + b8(tl.g + (c[1] * 0.5 - tl.g) * k) * 256 + b8(tl.b + (c[2] * 0.5 - tl.b) * k);
}
// The colours that never change, packed once: a species' bark, and the leaves of a species
// that neither drops them nor flowers. (A tree that does either is asked about in every fill,
// into one object kept for it: worked out into new arrays tree by tree, a flowering wood made
// thousands of short-lived objects a frame in flight: review farforest-8.)
const PACK_LEAF = SPECIES.map((sp) => pack(sp.leaf)), PACK_TRUNK = SPECIES.map((sp) => pack(sp.trunk));


export class FarForest {
  // trees: the Trees (its tree shapes' far meshes say where each picture is in the atlas,
  // and its season and leaf colours are used here); terrain: the Terrain.
  constructor(trees, terrain) {
    this.trees = trees; this.terrain = terrain;
    // Where each shape's pictures are, read off its far mesh (treeGeometry.js, `whole`): the
    // first two quads show the whole tree, the third the rosette in its crown.
    const shapes = trees.geos.length, rectTree = [], rectRose = [], roseGeo = [], cellMid = [];
    for (let a = 0; a < shapes; a++) for (let v = 0; v < VARIANTS; v++) {
      const g = trees.geos[a][v][2], P = g.attributes.position.array, U = g.attributes.aUv.array;
      const box = (from, to) => { let u0 = 1, v0 = 1, u1 = 0, v1 = 0; for (let i = from; i < to; i++) { u0 = Math.min(u0, U[i * 2]); u1 = Math.max(u1, U[i * 2]); v0 = Math.min(v0, U[i * 2 + 1]); v1 = Math.max(v1, U[i * 2 + 1]); } return new THREE.Vector4(u0, v0, u1, v1); };
      rectTree.push(box(0, 6)); rectRose.push(box(12, 18));
      let r = 0; for (let i = 12; i < 18; i++) r = Math.max(r, Math.abs(P[i * 3]));
      // (x: the rosette's half width and y: its height, in tree heights; z, w: the tree card's)
      let hw = 0, tall = 0; for (let i = 0; i < 6; i++) { hw = Math.max(hw, Math.hypot(P[i * 3], P[i * 3 + 2])); tall = Math.max(tall, P[i * 3 + 1]); }
      roseGeo.push(new THREE.Vector4(r, P[12 * 3 + 1], hw, tall)); cellMid.push(g.userData.mid ?? 0.6);
    }
    this.cells = shapes * VARIANTS;
    // quads: position = (which: 0, 1 the crossed pictures of the whole tree, 2 the rosette; u; v)
    const corner = [], index = [];
    // (and a fourth, 3: the tree's shadow on the ground, drawn only for a traveller in the air: update())
    for (let q = 0; q < 4; q++) { for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) corner.push(q, u, v); index.push(q * 4, q * 4 + 2, q * 4 + 1, q * 4 + 1, q * 4 + 2, q * 4 + 3); }
    this.corner = new THREE.BufferAttribute(new Float32Array(corner), 3); this.index = new THREE.BufferAttribute(new Uint16Array(index), 1);
    this.seasonDay = null; this._tl = {};
    // Shared by every tile; only where a tile stands is its own (uTileRel and its frame).
    this.shared = {
      ...SNOW_UNIFORMS,
      ...lightingUniforms(),
      tTreeAtlas: trees.shared.tTreeAtlas,
      uSeason: trees.shared.uSeason,
      ...TREE_SHADE_UNIFORMS,
      uRectTree: { value: rectTree }, uRectRose: { value: rectRose }, uRoseGeo: { value: roseGeo }, uCellMid: { value: cellMid },
      // x: full density out to here (m), y: none beyond here (m), z: none nearer than here
      // (where the trees one walks among end), w: the share of them drawn (the governor)
      uFar: { value: new THREE.Vector4(450, 5600, 240, 1) },
      // y: 1 paints every tree by the Sun it is left (?debug=treeshade)
      // (how much of a tree's shadow on the ground is drawn is each tile's own: uTileShadow)
      // z: 1 works the Sun's light and the air out at every pixel, as it was before they were
      // worked out at each picture's corners (?debug=farairpixel, and the benchmark's row);
      // w: 1 throws no tree out for standing outside the picture (?debug=farwhole)
      uShadow: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
    // What the vertices hand the pixels, declared once for both shaders. Packed: a phone
    // must offer no more than 15 rows of these, and each declaration takes a row (13 here).
    const vary = (io) => /* glsl */`
      ${io} vec3 vRel; ${io} vec3 vN; ${io} vec3 vLeafC; ${io} vec3 vTrunkC;
      ${io} vec4 vUvOwn;     // xy: where in the trees' picture, zw: the tree's own number, and how much of its picture is thinned away (+ 4 if it flowers)
      ${io} vec3 vBits;      // x: how much of the Sun the land and the clouds leave it, y: a shadow's share (the fourth quad), z: new snow lying where the tree stands (render/snowGlsl.js)
      ${io} vec3 vDome;      // the crown's top seen from above: where in it (xy, -1..1), how much (z)
      ${io} vec2 vTone;      // x: the tone it shares with its neighbours (a clump), y: 1 for a fir's spire
      ${io} vec3 vDomeE; ${io} vec3 vDomeN;     // ... and its two axes
      ${io} vec3 vSun;       // the Sun's light where the tree stands (lightingGlsl.js, directSun)
      ${io} vec3 vAirT; ${io} vec3 vAirL;       // the air between it and the eye: colour x vAirT + vAirL
      #define vUv vUvOwn.xy
      #define vOwn vUvOwn.zw
      #define vShade vBits.x
      #define vShadowA vBits.y
      #define vSnow vBits.z`;
    const VARY_OUT = vary('out'), VARY_IN = vary('in');
    this.vertexShader = /* glsl */`
#define HAZE_UV 1
${LIGHTING_PARS}
      in vec4 iA;            // xyz: the tree's foot from the tile's origin (m, planet axes), w: its height (m)
      in vec4 iB;            // x: crown width, y: turn (radians), z: which picture (shape x variants + variant), w: a number of its own (under 1) + how much of its picture is thinned away, in 255 steps (whole)
      in vec4 iC;            // x: its rank, and beside it the chance its site had of a tree (2 x that in DENS_STEPS steps + the rank), y: leaf colour packed, z: trunk colour packed, w: 4 x (1 or 2 if it drops its leaves) + 3 x how much of the Sun the land leaves it + 16 x (in 15 steps) how much sunlight the ground at its feet takes by its slope + 256 if its species flowers
      uniform vec3 uTileRel, uTileEast, uTileNorth, uTileUp;
      uniform vec4 uRectTree[CELLS], uRectRose[CELLS], uRoseGeo[CELLS];
      uniform float uCellMid[CELLS];
      uniform vec4 uFar, uShadow;
      uniform float uTileShadow;
      // (a value noise over the world's place, for the tones neighbouring crowns share)
      float toneHash(vec3 c) { return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float toneNoise(vec3 p) {
        vec3 i = floor(p), f = p - i, u = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(toneHash(i), toneHash(i + vec3(1, 0, 0)), u.x), mix(toneHash(i + vec3(0, 1, 0)), toneHash(i + vec3(1, 1, 0)), u.x), u.y),
                   mix(mix(toneHash(i + vec3(0, 0, 1)), toneHash(i + vec3(1, 0, 1)), u.x), mix(toneHash(i + vec3(0, 1, 1)), toneHash(i + vec3(1, 1, 1)), u.x), u.y), u.z);
      }
      ${TREE_SHADE_VERT}
      ${SHADOW_GLSL}
      ${VARY_OUT}
      ${SNOW_GLSL}
      vec3 unpack(float p) { float r = floor(p / 65536.0), g = floor((p - r * 65536.0) / 256.0); return vec3(r, g, p - r * 65536.0 - g * 256.0) * (${COLOUR_TOP.toFixed(3)} / 255.0); }
      // (not drawn: thrown out of the picture whole, never left as a sliver of no size)
      #define NONE { vRel = vec3(0.0); vN = vec3(0.0, 0.0, 1.0); vLeafC = vec3(0.0); vTrunkC = vec3(0.0); vUv = vec2(0.0); vOwn = vec2(0.0); vShade = 0.0; vShadowA = 0.0; vSnow = 0.0; vDome = vec3(0.0); vDomeE = vec3(0.0); vDomeN = vec3(0.0); vTone = vec2(1.0, 0.0); vSun = vec3(0.0); vAirT = vec3(1.0); vAirL = vec3(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      void main() {
        vec3 foot = uTileRel + iA.xyz;
        float d = length(foot);
        float steps = floor(iC.x * 0.5), rank = iC.x - 2.0 * steps, dens = steps / ${DENS_STEPS.toFixed(1)};
        // how many of the sites here carry a tree at this distance, and whether this one is
        // among them: it grows in as the traveller comes nearer, and never pops
        float keep = min(1.0, uFar.x * uFar.x / max(d * d, 1.0)) * uFar.w;
        // How steeply the tree is looked down on: the sine of the angle, 0 from the side, 1
        // from straight above.
        float down = dot(-normalize(foot + uTileUp * (iA.w * 0.7)), uTileUp);
        // (Where the far forest ends its trees draw in to nothing: over the last seventh of its
        // reach seen from the side, where they stand on skylines; over the last two fifths
        // seen from above, where an edge that near would be a ring on the land below.)
        float grow = smoothstep(rank * ${GROW.toFixed(3)}, rank + 1e-5, keep) * (1.0 - smoothstep(uFar.y * mix(0.86, ${END_ABOVE.toFixed(2)}, smoothstep(${TOP0.toFixed(3)}, ${TOP1.toFixed(3)}, down)), uFar.y, d));
        // (inside the trees one walks among nothing here is drawn: they are the same trees)
        if (grow <= 0.0 || d < uFar.z) NONE
        // A tree no part of which can be in the picture is thrown out here, before the work
        // below (the clouds' shade, the shared tone, the snow, the Sun and the air): a tile is
        // handed over whole when any of it is in view, and of the trees of such a tile a good
        // half stand beside the picture or behind the eye. The test is of a ball round the
        // tree's middle that holds its pictures, its crown's top spread as wide as it ever is
        // (TOP_MAX) and, for the fourth quad, its shadow at its longest: wider than anything
        // drawn, so the picture is the same. (?debug=farwhole: none thrown out, for a pair.)
        if (uShadow.w < 0.5) {
          vec4 gq = uRoseGeo[int(iB.z + 0.5)];
          float ball = iA.w * (1.0 + max(iB.x * max(gq.x * ${(TOP_MAX * 1.5).toFixed(2)}, 1.5 * gq.z), position.x > 2.5 ? ${SHADOW_LONG.toFixed(1)} * gq.w + gq.z * iB.x : 0.0)) + 0.4 + 0.0015 * d;
          vec4 fc = projectionMatrix * viewMatrix * vec4(foot + uTileUp * (iA.w * 0.5), 1.0);
          if (fc.w < -ball
            || abs(fc.x) > fc.w + ball * (abs(projectionMatrix[0][0]) + abs(projectionMatrix[2][0]) + 1.0)
            || abs(fc.y) > fc.w + ball * (abs(projectionMatrix[1][1]) + abs(projectionMatrix[2][1]) + 1.0)) NONE
        }
        // What the angle makes of its three quads (life/farTreeForm.js): the thinned ones
        // stand a little wider, so a wood keeps its cover, and from above the rosette is the
        // crown's top, spread over the ground of the trees it stands for.
        ${FORM_GLSL}
        int cell = int(iB.z + 0.5);
        vec4 g = uRoseGeo[cell], rect;
        vec3 l, na;                                  // (na: outward from the middle of its mass, in the mesh's own measure)
        float mid = uCellMid[cell];
        float flowers = floor(iC.w / 256.0), rest = iC.w - 256.0 * flowers;
        float groundQ = floor(rest / 16.0), packed = rest - 16.0 * groundQ;
        float fall = floor(packed * 0.25 + 1e-3), thinQ = floor(iB.w), sunLeft = clamp((packed - fall * 4.0) / 3.0, 0.0, 1.0) * cloudShade(foot + uTileUp * (iA.w * 0.7));
        if (position.x > 2.5) {
          // The fourth quad, drawn only from the air and in a draw of its own (the slot's shadow
          // mesh): the picture of the whole tree laid on the ground along the Sun's ray, the
          // tree's shadow (its own outline, as long as the Sun is low).
          float sunUp = dot(uSunDir, uTileUp); vec3 lie = uSunDir - uTileUp * sunUp; float len = length(lie);
          // (a tree in the shade casts none, and one the grid of the land's shadow leaves half lit is in the shade as likely as not; none on ground the Sun does not reach by its slope)
          float a = wShadow * uTileShadow * smoothstep(0.03, 0.14, sunUp) * (1.0 - smoothstep(${SHADOW_FAR0.toFixed(1)}, ${SHADOW_FAR1.toFixed(1)}, d)) * smoothstep(0.5, 0.95, sunLeft) * (groundQ / 15.0);
          if (a < 0.004 || len < 1e-3) NONE
          vec3 along = -lie / len, across = cross(uTileUp, along);
          float stretch = min(len / max(sunUp, 0.12), ${SHADOW_LONG.toFixed(1)}), wideM = 2.0 * g.z * iB.x * iA.w * grow, longM = g.w * iA.w * grow * stretch;
          // (a little over the ground, and more far off, where the depth buffer is coarse)
          vRel = foot + across * ((position.y - 0.5) * wideM) + along * ((1.0 - position.z) * longM) + uTileUp * (0.4 + 0.0015 * d);
          vN = uTileUp; vLeafC = vec3(0.0); vTrunkC = vec3(0.0); vOwn = vec2(0.0); vShade = 0.0; vSnow = 0.0; vSun = vec3(0.0); vAirT = vec3(1.0); vAirL = vec3(0.0); vDome = vec3(0.0); vDomeE = vec3(0.0); vDomeN = vec3(0.0); vTone = vec2(1.0, 0.0);
          vShadowA = a * shadowAlpha(wideM * longM, dens, keep) * (1.0 - 0.8 * thinQ / 255.0);          // (a bare tree's shadow is its branches')
          rect = uRectTree[cell]; vUv = vec2(mix(rect.x, rect.z, position.y), mix(rect.y, rect.w, position.z));
          gl_Position = projectionMatrix * viewMatrix * vec4(vRel, 1.0);
          return;
        }
        if (position.x < 1.5) {
          // one of the two crossed pictures of the whole tree (its foot at the bottom middle)
          float w = wCard;
          if (w <= 0.0) NONE
          float a = position.x * 1.5707963, x = (position.y - 0.5) * 2.0 * g.z * iB.x * w;
          float x0 = (position.y - 0.5) * 2.0 * g.z;
          l = vec3(cos(a) * x, (1.0 - position.z) * g.w, sin(a) * x); rect = uRectTree[cell];
          na = vec3(cos(a) * x0, l.y - mid, sin(a) * x0);
        } else {
          // the rosette lying in its crown, for whoever looks down on it
          // (a fir's or a spruce's is its spire seen from above: it never spreads far, so a
          // conifer wood is dark spires among the canopy's round crowns, not a sheet of discs)
          float wide = iB.x * (cell < ${VARIANTS} ? min(wRose, 2.4) : wRose);
          l = vec3((position.y - 0.5) * 2.0 * g.x * wide, g.y, (0.5 - position.z) * 2.0 * g.x * wide); rect = uRectRose[cell];
          na = vec3(l.x / wide, g.x, l.z / wide);
        }
        // Lit as one round mass, by the very rule the near trees' cards are (treeGeometry.js,
        // build): outward from the middle of its mass and from the crown's own middle height,
        // and upward. (A rule of its own here, with one middle height for every shape, lit the
        // same tree up to 26 degrees differently on the two sides of the line.)
        vec3 nb = vec3(na.x, (l.y - mid) * 0.8, na.z);
        vec3 nl = normalize(normalize(na + vec3(0.0, 1e-4, 0.0)) * 0.45 + normalize(nb + vec3(0.0, 1e-4, 0.0)) * 0.8 + vec3(0.0, 0.3, 0.0));
        // Seen from above, the rosette is the top of the crown: a dome that faces the sky in
        // its middle and leans outward at its rim. (By the rule above alone a rosette lying
        // under the middle height of its crown, as a fir's does, faces the ground: looked
        // down on, every fir was a dark disc that the Sun did nothing to.)
        // (Not at the line where the trees one walks among take over, which have the old rule:
        // it comes in over the 200 m beyond that line.)
        if (position.x > 1.5) nl = normalize(mix(nl, normalize(vec3(na.x, g.x * 1.3, na.z)), smoothstep(${TOP0.toFixed(3)}, ${TOP1.toFixed(3)}, down) * smoothstep(uFar.z, uFar.z + 200.0, d)));
        float c = cos(iB.y), s = sin(iB.y);
        l *= iA.w * grow;
        vRel = foot + uTileEast * (l.x * c - l.z * s) + uTileUp * l.y + uTileNorth * (l.x * s + l.z * c);
        vN = normalize(uTileEast * (nl.x * c - nl.z * s) + uTileUp * nl.y + uTileNorth * (nl.x * s + nl.z * c));
        vLeafC = unpack(iC.y); vTrunkC = unpack(iC.z); vOwn = vec2(iB.w - thinQ, thinQ / 255.0 * (position.x > 1.5 ? ${ROSETTE_THIN.toFixed(1)} : 1.0) + 4.0 * flowers); vShade = sunLeft; vShadowA = 0.0;
        // (the crown's top: lit as a dome pixel by pixel in the fragment shader; by its four
        // corners alone it was one flat tone, no lit cap and no shaded side)
        vDome = vec3(0.0); vDomeE = vec3(0.0); vDomeN = vec3(0.0);
        // A tone neighbouring crowns share, so that from a kilometre they gather into clumps in two
        // or three tones (a noise of the place some 150 m to a cell, and finer, 55 m), lighter
        // and warmer on the slopes turned to the Sun, darker on those turned from it.
        vec3 wp = uCamPlanetPos + foot;
        { vec3 ups = normalize(wp); vSnow = snowSeason(length(wp) - uPlanetRadius, ups, ups, 0.0, 0.0).x; }
        float tn = smoothstep(0.3, 0.7, toneNoise(wp / 150.0)) + 0.3 * (toneNoise(wp / 55.0 + 7.3) - 0.5);
        vTone = vec2(0.66 + 0.55 * tn + 0.6 * (groundQ / 15.0 - 0.6), cell < ${VARIANTS} ? 1.0 : 0.0);
        if (position.x > 1.5) { vDome = vec3((position.y - 0.5) * 2.0, (0.5 - position.z) * 2.0, smoothstep(${TOP0.toFixed(3)}, ${TOP1.toFixed(3)}, down) * smoothstep(uFar.z, uFar.z + 200.0, d)); vDomeE = uTileEast * c + uTileNorth * s; vDomeN = uTileNorth * c - uTileEast * s; }
        vUv = vec2(mix(rect.x, rect.z, position.y), mix(rect.y, rect.w, position.z));
        gl_Position = projectionMatrix * viewMatrix * vec4(vRel, 1.0);
        // The Sun's light on the tree and the air between it and the eye, worked out here, at
        // the picture's corners: over a picture some metres wide, hundreds of metres off, they
        // change by next to nothing, and at every pixel they were eight looks into the tables
        // for each of the layers of trees behind trees (2.5 whole pictures of them at the
        // opening view). The rules are the same ones (directSun, forestAirParts, hazeAffine:
        // what aerialPerspective does for an eye inside the air).
        vSun = vec3(0.0); vAirT = vec3(1.0); vAirL = vec3(0.0);
        if (uShadow.z < 0.5 && length(uCamPlanetPos) * 0.001 <= uRTop) {
          vec3 pv = uCamPlanetPos + vRel, upv = normalize(pv), air, T, L0, Lg; float k;
          vSun = directSun(pv);
          forestAirParts(vRel, upv, 1.0 - smoothstep(300.0, 1000.0, length(vRel)), air, k);
          hazeAffine(vRel, gl_Position.xy / max(abs(gl_Position.w), 1e-6) * 0.5 + 0.5, T, L0, Lg);
          vAirT = (1.0 - k) * T; vAirL = air * k * T + L0;
        }
      }`;
    // The picture is the near trees' own far mesh, and this draws it as they do (life/trees.js,
    // the card path of its fragment shader): the same cut-out, the same greens, the same
    // season, the same light. The two meet at a line and nothing may show there.
    this.fragmentShader = /* glsl */`${LIGHTING_PARS}
      uniform sampler2D tTreeAtlas;        // r cover, g tone, b wood (life/treeAtlasGen.js)
      uniform vec3 uSeason;                // x: how far the leaves have turned, y: how bare, z: time
      uniform vec4 uShadow, uFar;
      ${VARY_IN}
      layout(location = 0) out vec4 fragColor;
      ${PAINT_LEAF}
      ${TREE_WOOD}
      ${TREE_THIN}
      ${FAR_GREEN_GLSL}
      void main() {
        vec3 cut = texture(tTreeAtlas, vUv).rgb;
        // The cut-out, taken exactly as the near trees take it (trees.js): lower the farther
        // off, because averaged down a tree's needles and leaves cover less of a pixel and a
        // tree would thin to nothing. A threshold of its own here made the trees just outside
        // the near radius thinner than the same trees just inside it.
        vec2 px = vUv * vec2(${ATLAS_W}.0, ${ATLAS_H}.0);
        float lod = 0.5 * log2(max(max(dot(dFdx(px), dFdx(px)), dot(dFdy(px), dFdy(px))), 1.0));
        if (cut.r < mix(0.42, 0.16, clamp(lod / 3.0, 0.0, 1.0))) discard;
        // (a tree's shadow on the ground: it takes this share of what is drawn there; see the
        // material's blending)
        if (vShadowA > 0.0) { fragColor = vec4(0.0, 0.0, 0.0, vShadowA); return; }
        // (what a texel is: the near trees' rule itself, TREE_WOOD from trees.js, so that the
        // two cannot differ at the line where the near trees end (they crossed over twice:
        // reviews farforest-6, farforest2-2); a tree that flowers is its petals' colour all
        // over from here, see inFlower)
        bool flowers = vOwn.y > 3.5;
        float thin = vOwn.y - (flowers ? 4.0 : 0.0);
        bool wood = treeWood(cut);          // (one rule with the near trees: TREE_WOOD, life/trees.js)
        // (leaves off the tree: its picture thinned clump by clump, the near trees' rule, TREE_THIN)
        if (!wood && treeThinned(vUv, cut.g, lod, vOwn.x, thin)) discard;
        vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel), N = normalize(vN);
        // Seen from above, the crown's top is a dome: its cap faces the sky, its rim leans out,
        // so the Sun's side is lit and the far side a crescent in the shade's colour (the
        // critic: "no lit top, no shaded side").
        if (vDome.z > 0.0 && !wood) {
          float r2 = min(dot(vDome.xy, vDome.xy), 1.0);
          N = normalize(mix(N, normalize(vDomeE * vDome.x + vDomeN * vDome.y + up * (1.1 * sqrt(1.0 - 0.8 * r2))), vDome.z));
        }
        // (leaves in their season: vLeafC is this tree's leaves on this day, life/season.js)
        vec3 leafC = vLeafC * (0.5 + 0.22 * fract(vOwn.x * 13.7));
        // (a tree in flower keeps its petals' pink at every distance: through the leaves'
        // painted green and the far olive it came out tan, "dead patches or litter")
        float bloomW = flowers ? smoothstep(-0.005, 0.03, vLeafC.r - vLeafC.g) : 0.0;
        vec3 bloomC = leafC * 1.3;
        if (uPaint.x > 0.0) leafC = paintLeaf(leafC) * mix(0.5, 1.12, smoothstep(-0.5, 0.6, dot(N, up)));
        leafC *= 0.46 + 0.6 * cut.g;
        // (the clumps' shared tone, from 250 m out; a fir's spire from above darker than the
        // round crowns about it)
        leafC *= mix(1.0, vTone.x, smoothstep(250.0, 900.0, length(vRel))) * mix(1.0, 0.7, vTone.y * vDome.z);
        // Far off a tree is a dark shape on the ground behind it, never bluer than that
        // ground: the cold blue-green a fir has near by (paintLeaf) and the blue of the sky's
        // light on a dark leaf made every far tree a teal speck on warm land. From the line
        // where the near trees end (nothing changes there) out to a kilometre and more its
        // green goes over to a dark warm olive, and less of the sky's blue is counted.
        // (farGreen, life/farTreeForm.js: one rule, for whatever else must be this green: the
        // canopy the ground raises beyond the trees)
        float dFar = length(vRel), farW = farGreenW(dFar);
        leafC = farGreen(leafC, dFar);
        leafC = mix(leafC, bloomC * (0.46 + 0.6 * cut.g), bloomW);
        // (wood on a card is the near trees' twig colour, trees.js: grey-brown, darker than the
        // trunk; as vTrunkC * 0.6 every bark pixel changed tone at the line, review farforest-6)
        vec3 albedo = wood ? mix(vTrunkC, dot(vTrunkC, vec3(0.333)) * vec3(1.06, 1.0, 0.9), 0.75) * 0.4 : leafC;
        // (new snow on the crown, as the near trees have it)
        if (vSnow > 0.0) albedo = mix(albedo, vec3(0.80, 0.83, 0.88), vSnow * smoothstep(0.1, 0.6, dot(N, up)) * (wood ? 0.45 : 0.85));
        float nl = dot(N, uSunDir), lit = wood ? max(nl, 0.0) : max(nl * 0.7 + 0.3, 0.0);
        if (uPaint.x > 0.0) { lit = mix(lit, paintLit(wood ? nl : nl * 0.75 + 0.25) * PI, uPaint.x); albedo = paintColour(albedo); leafC = paintColour(leafC); }
        // (seen against the Sun, foliage glows: the light comes through needles and leaves)
        float through = wood ? 0.0 : max(-nl, 0.0) * 0.28 + 0.4 * pow(max(dot(-V, uSunDir), 0.0), 4.0);
        float open = (wood ? 0.45 : mix(0.5, 1.0, smoothstep(-0.6, 0.8, dot(N, up)))) * (uPaint.x > 0.0 && !wood ? 0.8 : 1.0);
        // (the Sun's light and the air come from the picture's corners; at every pixel, as it
        // was, under ?debug=farairpixel and for an eye outside the air)
        bool atCorners = uShadow.z < 0.5 && length(uCamPlanetPos) * 0.001 <= uRTop;
        vec3 sun;
        if (atCorners) sun = vSun; else sun = directSun(planetPos);
        sun *= vShade;          // (the land's own shadow, from the worker)
        // (a crown's top in the land's shade takes the sky as the canopy round it does: open to
        // the sky it was a pale blue-grey disc on the darker canopy, a "ghost")
        open *= mix(1.0, mix(0.68, 1.0, vShade), vDome.z);
        // Looked down on, a trunk stands under its own crown, in its shade: on the upright
        // pictures it is drawn right through the crown's top, and a pale trunk in the Sun was a
        // bright line across every birch and aspen of a wood seen from above. (Not at the line
        // where the trees one walks among take over: it comes in over the 200 m beyond.)
        if (wood) { float under = smoothstep(0.25, 0.6, dot(V, up)) * smoothstep(uFar.z, uFar.z + 200.0, dFar); sun *= 1.0 - 0.92 * under; open *= 1.0 - 0.5 * under; }
        // (in the shade of the wood a crown is never black: light has come down through the
        // leaves above it, green from the passage)
        vec3 glow = wood ? vec3(0.0) : leafC * sun * (0.07 * smoothstep(0.0, 0.25, dot(up, uSunDir))) * vec3(0.9, 1.2, 0.5);
        vec3 sky = skyLight(N, up); sky = mix(sky, vec3(dot(sky, vec3(0.3, 0.55, 0.15))) * vec3(1.06, 1.0, 0.86), 0.7 * farW);
        vec3 col = (albedo * (sun * lit + sky * open + planetShine(N)) + leafC * sun * through * vec3(1.1, 1.25, 0.6) + glow) / PI;
        // The air of a wood is row behind row of trees seen through one another: it belongs
        // to the near forest, and past a kilometre the air itself does that work. Carried all
        // the way out it made the far trees blue-grey specks on warm ground.
        if (atCorners) col = col * vAirT + vAirL;
        else col = aerialPerspective(forestAir(col, vRel, up, 1.0 - smoothstep(300.0, 1000.0, dFar)), vRel);
        // (?debug=treeshade: how much of the Sun the land and the clouds leave each tree, red all of it, blue none)
        if (uShadow.y > 0.5) col = vec3(dot(col, vec3(0.6))) * mix(vec3(0.1, 0.3, 3.0), vec3(3.0, 0.4, 0.1), vShade);
        fragColor = vec4(col * uExposure, 1.0);
      }`;
    this.defines = { ...atmosphereDefines(), CELLS: this.cells };
    this.mesh = new THREE.Group();          // every tile's mesh hangs here
    this.pool = [];
    for (let i = 0; i < POOL; i++) this.pool.push(this._slot());
    this.tiles = new Map();                  // 'level:ti:tj' -> tile
    this.asked = 0; this.frame = 0; this.serial = -1; this.missing = 0; this.lastMs = 0;
    this.fraction = 1; this.count = 0; this.held = 0; this.shown = false;
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0];
    this._p = new THREE.Vector3(); this._rel = new THREE.Vector3();
    this.setWorld(trees.world);
  }

  // One tile of the pool: its buffers are made once and filled when a tile lands in it.
  // Two meshes share them: the trees (their three quads), and from the air the trees'
  // shadows (the fourth), in a draw of their own. (In the trees' own draw a shadow wrote
  // depth: one lying over another was thrown out by it, so a wood's edge came to a fifth of
  // the darkness meant, and it cut away the lower part of every tree standing in a
  // neighbour's shadow: review farforest-1.)
  _slot() {
    const at = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const iA = at(), iB = at(), iC = at();
    const geometry = (from, count) => {
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', this.corner);
      geo.setIndex(this.index);
      geo.setDrawRange(from, count);
      geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iC', iC);
      geo.instanceCount = 0;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
      return geo;
    };
    const geo = geometry(0, 18), shadowGeo = geometry(18, 6);
    const own = { uTileRel: { value: new THREE.Vector3() }, uTileEast: { value: new THREE.Vector3(1, 0, 0) }, uTileNorth: { value: new THREE.Vector3(0, 1, 0) }, uTileUp: { value: new THREE.Vector3(0, 0, 1) }, uTileShadow: { value: 0 } };
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: this.defines, side: THREE.DoubleSide,
      uniforms: { ...this.shared, ...own },
      vertexShader: this.vertexShader, fragmentShader: this.fragmentShader,
    });
    // A shadow takes its alpha's share of what was drawn there, and writes no depth: where
    // several lie over one another each darkens what the others left.
    const shadowMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: this.defines, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      uniforms: { ...this.shared, ...own },
      vertexShader: this.vertexShader, fragmentShader: this.fragmentShader,
    });
    const mesh = new THREE.Mesh(geo, material), shadow = new THREE.Mesh(shadowGeo, shadowMaterial);
    // The vertices are worked out from the tile's own uniform, not from this matrix; the
    // mesh is put where the tile stands all the same, so that three can cull it against the
    // view. (The order they are drawn in is set each frame, nearest first.)
    mesh.visible = false; shadow.visible = false;
    mesh.renderOrder = 5;                   // after the ground: the canopy hides the lower part of a far tree for nothing
    shadow.renderOrder = 3;                 // after the ground they lie on, before every far tree (which then stand on them whole)
    this.mesh.add(mesh); this.mesh.add(shadow);
    return { geo, shadowGeo, mesh, shadow, material, shadowMaterial, own, iA, iB, iC, tile: null };
  }

  setWorld(world) {
    this.world = world; this.def = world.life?.trees?.far || null;
    for (const t of this.tiles.values()) if (t.slot) this._free(t);
    this.tiles.clear(); this.asked = 0; this.gen = (this.gen || 0) + 1; this.serial = -1; this.missing = 0; this.count = 0; this.held = 0;
    for (const s of this.pool) { s.mesh.visible = false; s.shadow.visible = false; s.geo.instanceCount = 0; s.shadowGeo.instanceCount = 0; s.tile = null; }
    const d = this.def;
    if (d) this.shared.uFar.value.set(d.full ?? 450, d.radius ?? 5600, 0, 1);
  }

  // The governor: this share of the far trees. It thins them and shortens their reach; it
  // never takes a wood away (a wood must still be a wood at the floor). The tiles are
  // filled again at the new share, so that a thinned forest costs the GPU less and not
  // merely looks thinner.
  setFraction(f) { if (f !== this.fraction) { this.fraction = f; for (const b of this.tiles.values()) b.fillEye = null; } }

  get triangles() { return this.count * 6; }
  // True while the trees' shadows on the ground are drawn (in the air: update()).
  get shadowsShown() { return !!this.shown && this.shadowTiles > 0; }
  // True while tiles that are wanted have not arrived (screenshots wait for them).
  get busy() { return !!this.def && this.shown && (this.asked > 0 || this.missing > 0 || this.unfilled > 0); }

  _free(tile) {
    const s = tile.slot;
    if (!s) return;
    s.tile = null; s.mesh.visible = false; s.shadow.visible = false; s.geo.instanceCount = 0; s.shadowGeo.instanceCount = 0; tile.slot = null;
  }

  // Every frame. rig: the camera rig.
  update(rig) {
    this.frame++;
    const def = this.def, t = this.terrain, tr = this.trees;
    const shown = !!def && this.fraction > 0 && tr.atlasReady && !!t.coverSerial && rig.agl < (def.below ?? 6000);
    this.shown = shown;
    if (!shown) {
      for (const s of this.pool) { s.mesh.visible = false; s.shadow.visible = false; }
      this.count = 0; this.held = 0; this.missing = 0; this.shadowTiles = 0;
      return;
    }
    // The governor thins the trees and shortens their reach; the look of a wood is kept by
    // the widening the thinning carries with it (the vertex shader).
    const full = (def.full ?? 450), radius = (def.radius ?? 5600) * (0.55 + 0.45 * this.fraction);
    // (they begin where the trees one walks among end, and at the eye where none are drawn)
    const inner = tr.reach || 0;
    this.shared.uFar.value.set(full, radius, inner, this.fraction);
    const p = this._p.copy(rig.pos), R = this.world.radius, s0 = this._rel;
    const len = p.length(), lat = Math.asin(p.z / len) * 180 / Math.PI, lon = ((Math.atan2(p.y, p.x) * 180 / Math.PI) + 360) % 360;
    // new land cover or new elevation: every tile is worked out again (the ones that stand
    // stay until their new trees come)
    const serial = t.coverSerial * 100000 + t.ringSerial;
    if (serial !== this.serial) { this.serial = serial; for (const b of this.tiles.values()) b.stale = true; }

    // Which tiles are wanted: for each level, those near enough that some tree of its band
    // would be drawn (keep(d) > the band's lowest rank).
    const want = [], sunNow = this.shared.uSunDir.value, now = performance.now();
    this.missing = 0;
    const high = 0.7 * Math.max(0, rig.agl);
    // (a new day: the trees in flower are a day further on, as the near trees are; the tiles
    // that hold any are filled again)
    if (tr.seasonDay !== this.seasonDay) {
      const first = this.seasonDay == null; this.seasonDay = tr.seasonDay;
      if (!first) for (const b of this.tiles.values()) if (b.seasonal) b.fillEye = null;
    }
    // How long since the last frame, for what eases (s; a frame of a second and more in a
    // headless picture is let through whole)
    const dt = Math.min(5, Math.max(0, (now - (this.lastNow ?? now)) / 1000)); this.lastNow = now;
    for (const w of wantedTiles(lat, lon, R, full, radius, Math.max(0, rig.agl))) {
      let tile = this.tiles.get(w.key);
      if (!tile) { tile = { key: w.key, level: w.level, ti: w.ti, tj: w.tj, blocks: w.blocks, side: w.side, state: 0, fillEye: null, slot: null, data: null, count: 0, shown: 0, stale: false, asking: false }; this.tiles.set(w.key, tile); }
      tile.used = this.frame; tile.near = w.near; tile.mid = w.mid; tile.far3 = Math.hypot(w.near, high);
      // (the land's shadow on its trees was worked out for where the Sun then stood)
      // (not more than once in two seconds a tile: with the clock run fast the Sun moves that
      // far every few frames, and the workers would do nothing else)
      if (tile.state === 1 && !tile.stale && tile.sun.dot(sunNow) < 0.99966 && now - tile.at > 2000) tile.stale = true;
      if (tile.state !== 1 || tile.stale) this.missing++;
      want.push(tile);
    }
    want.sort((a, b) => a.near - b.near);

    // Ask the workers for the nearest tiles that have none of their trees yet, when the
    // ground and the trees near by have nothing waiting. One worker is always left free for
    // the ground, and the tiles are asked for nearest first.
    if (!t.tiles.busy && t.wanted.length === 0 && !(tr.missing > 0)) {
      // (one worker is kept for the ground where there is more than one; on a machine with a
      // single worker the far forest still gets it, or nothing would ever arrive)
      const free = t.workers.idle, room = (free > 1 ? Math.min(3, free - 1) : free) - this.asked;
      for (let i = 0, got = 0; got < room && i < want.length; i++) {
        const tile = want[i];
        if (tile.asking || (tile.state === 1 && !tile.stale)) continue;
        if (!this._ask(tile)) break;
        got++;
      }
    }

    // which tiles get a place in the pool: the nearest first
    // (a tile with no tree in it takes no place)
    const take = want.filter((b) => b.state === 1 && b.have > 0).slice(0, POOL);
    const keptTiles = new Set(take);
    for (const s of this.pool) if (s.tile && !keptTiles.has(s.tile)) this._free(s.tile);
    // At most two tiles are filled in a frame, the nearest first: tiles filled while the
    // traveller stood all came due together (15 to 20 of them every 45 m, some 8 ms of the
    // page's work and 3 MB of buffers in one frame). The margin a tile holds covers the wait.
    let drawn = 0, given = 0, fills = 0, i = 0, shadowTiles = 0; this.unfilled = 0;
    for (const tile of take) {
      if (!tile.slot) {
        const s = this.pool.find((q) => !q.tile);
        if (!s) continue;
        s.tile = tile; tile.slot = s; tile.fillEye = null; tile.count = 0;
      }
      // Filled again when the traveller has come a tenth of the way nearer to it: the trees
      // it holds are half as many again as stand in the picture, which covers that much
      // closing (and the nearest tiles are the cheapest to fill).
      const s = tile.slot;
      if (!tile.fillEye || tile.fillEye.distanceToSquared(p) > (0.1 * Math.max(tile.far3, full)) ** 2) {
        if (fills < 2) { fills++; this._fill(tile, s0.subVectors(tile.origin, p), p); } else if (!tile.fillEye) this.unfilled++;
      }
      // (drawn nearest first: each tile has a material of its own, and three would order
      // them by material before depth)
      s.mesh.renderOrder = 5 + i / 64; s.shadow.renderOrder = 3 + (i++) / 64;
      s.own.uTileRel.value.subVectors(tile.origin, p);
      s.mesh.position.copy(s.own.uTileRel.value); s.shadow.position.copy(s.own.uTileRel.value);
      // (the tile is drawn when a tree of its band could be; the view culls it by its bounds)
      const vis = tile.count > 0 && tile.far3 <= levelReach(tile.level, full, radius);
      // The trees' shadows on the ground are drawn for a traveller in the air over them: on
      // the ground the far trees are seen from the side, their shadows hidden behind them, and
      // their draw would be paid for nothing. "Over them" is the eye's height over the
      // tile's lowest tree, not over the ground underfoot: by the ground underfoot every
      // shadow came on and went off at once at a rim or a ridge (review farforest-2), and
      // a tile of a valley's trees looked down on steeply from a rim had none (farforest-3).
      // They come in between 60 and 160 m over the tile, eased over a second.
      // (the governor's step `tree-shadows` takes them away with the trees' other far shadows)
      // (The governor's switch acts at once: eased, the shadows stayed drawn for 3.7 s after
      // it, and the benchmark's cost test, which measures from the sixth frame, saw nothing
      // of what they cost: review farforest2-3. Only the height's part is eased.)
      const sh = tileShadow(len, tile.low, tile.near);
      tile.air = tile.air === undefined ? sh.air : tile.air + (sh.air - tile.air) * (1 - Math.exp(-dt / 0.8));
      if (Math.abs(sh.air - tile.air) < 0.01) tile.air = sh.air;
      s.own.uTileShadow.value = tile.air;
      // (only for the tiles that can show one: near enough for a shadow to be drawn at all,
      // and with a tree in them looked down on steeply enough to cast one)
      const shade = vis && this.shadows !== false && tile.air > 0 && tile.far3 < SHADOW_FAR1 && sh.reach && shadowGate(tile.maxDown ?? 1, len - (tile.fillLen ?? len), tile.near);
      s.mesh.visible = vis; s.shadow.visible = shade;
      if (shade) shadowTiles++;
      if (vis) { drawn += tile.shown; given += tile.count; }
    }
    // (count: the trees standing in the picture. held: the instances the tiles hand the
    // GPU, some of which the vertex shader throws out as too thin for their distance.)
    this.count = drawn; this.held = given; this.shadowTiles = shadowTiles;
    // Tiles left behind are let go, with the trees the worker gave them (a few hundred
    // kilobytes each): a traveller who comes back pays one worker job for them again.
    if (this.frame % 60 === 0) for (const [k, b] of this.tiles) if (this.frame - b.used > 240 && !b.asking) { this._free(b); this.tiles.delete(k); }
  }

  // Asks a worker for a tile's trees. False when no worker took it.
  _ask(tile) {
    const t = this.terrain, def = this.def, [lo, hi] = band(tile.level), epoch = t.epoch, serialAt = this.serial, sun = this.shared.uSunDir.value.clone();
    const job = t.workers.run({ type: 'treeTile', ti: tile.ti, tj: tile.tj, blocks: tile.blocks, spacing: def.spacing ?? this.trees.def?.spacing ?? 7, lo, hi, sun: [sun.x, sun.y, sun.z], sunHalf: t._sunHalf ?? 0.00465 });
    if (!job) return false;
    const gen = this.gen;
    tile.asking = true; this.asked++;
    job.then((res) => {
      if (gen === this.gen) this.asked--;
      tile.asking = false;
      if (epoch !== t.epoch) return;                       // another world by now
      tile.origin = new THREE.Vector3(...res.origin);
      tile.data = new Float32Array(res.trees);
      // (the tile's lowest tree: its foot's distance from the world's middle)
      // (squared lengths, one root: Math.hypot over every tree was more page work than all
      // the fills together, review farforest2-5)
      let low2 = Infinity; const T = tile.data, [ox, oy, oz] = res.origin;
      for (let k = 0, q = 0; k < res.count; k++, q += TREE_FLOATS) { const x = ox + T[q], y = oy + T[q + 1], z = oz + T[q + 2], r2 = x * x + y * y + z * z; if (r2 < low2) low2 = r2; }
      tile.low = Number.isFinite(low2) ? Math.sqrt(low2) : tile.origin.length();
      tile.vis = new Float32Array(res.vis); tile.lit = res.lit ? new Float32Array(res.lit) : null; tile.sun = sun; tile.at = performance.now(); tile.have = res.count; tile.state = 1;
      tile.stale = serialAt !== this.serial; tile.fillEye = null;
      this.lastMs = res.ms ?? 0;
    }).catch((e) => { if (gen === this.gen) this.asked--; tile.asking = false; if (tile.state === 0) this.tiles.delete(tile.key); console.error(e); });
    return true;
  }

  // Fill a tile's buffers from the trees the worker gave it: the ones that stand in the
  // picture from where the traveller is, each tested by **its own** distance, and half as
  // many again so that moving does not fill it again at once. (By the tile's nearest corner
  // instead, a tile 900 m across handed the GPU four times the trees it drew: the far side
  // of it wants a twentieth of what the near side does.)
  _fill(tile, eyeRel, eye) {
    const s = tile.slot, T = tile.data, iA = s.iA.array, iB = s.iB.array, iC = s.iC.array;
    localFrame([tile.origin.x, tile.origin.y, tile.origin.z], this._e, this._n, this._u);
    const u = s.material.uniforms;
    u.uTileEast.value.set(...this._e); u.uTileNorth.value.set(...this._n); u.uTileUp.value.set(...this._u);
    const uf = this.shared.uFar.value, full2 = uf.x ** 2, inner2 = uf.z ** 2, far2 = uf.y ** 2, thin = uf.w;
    const ex = eyeRel.x, ey = eyeRel.y, ez = eyeRel.z;
    const up = this._u, geoX = this.shared.uRoseGeo?.value || [], topPow = -0.25 - TOP_POW;
    const day = this.seasonDay ?? 0, R = this.world.radius, ox = tile.origin.x, oy = tile.origin.y, oz = tile.origin.z;
    let n = 0, bound2 = 0, shown = 0, margin = MARGIN, tallest = 0, seasonal = false, maxDown = -1, reach = 0;
    for (let pass = 0; pass < 3; pass++) {
      n = 0; bound2 = 0; shown = 0; tallest = 0; seasonal = false; maxDown = -1; reach = 0;
      for (let k = 0, q = 0; k < tile.have; k++, q += TREE_FLOATS) {
        const x = T[q], y = T[q + 1], z = T[q + 2], rank = T[q + 8];
        const dx = x + ex, dy = y + ey, dz = z + ez, d2 = dx * dx + dy * dy + dz * dz;
        const keep = Math.min(1, full2 / Math.max(d2, 1)) * thin;
        if (rank >= margin * keep) continue;
        if (n >= CAP) { n++; break; }
        // (how many of them the vertex shader will draw, for the read-out)
        if (rank < keep && d2 > inner2 && d2 < far2) shown++;
        const spi = T[q + 6], sp = SPECIES[spi], own = T[q + 7];
        iA[n * 4] = x; iA[n * 4 + 1] = y; iA[n * 4 + 2] = z; iA[n * 4 + 3] = T[q + 3];
        iB[n * 4] = T[q + 4]; iB[n * 4 + 1] = T[q + 5]; iB[n * 4 + 2] = sp.arch * VARIANTS + Math.min(VARIANTS - 1, Math.floor(((own * 7.31) % 1) * VARIANTS)); iB[n * 4 + 3] = Math.min(own, 0.9999);
        iC[n * 4] = rank + 2 * Math.round(Math.min(1, Math.max(0, T[q + 9])) * DENS_STEPS); iC[n * 4 + 1] = PACK_LEAF[spi]; iC[n * 4 + 2] = PACK_TRUNK[spi]; iC[n * 4 + 3] = sp.fall * 4 + 3 * tile.vis[k] + 16 * Math.round(15 * (tile.lit ? tile.lit[k] : 1)) + (sp.blossom ? 256 : 0);
        if (sp.fall || sp.blossom) {
          // (its leaves on this day, and how far in flower: the answer the near trees get)
          const tl = treeLook(sp, day, ox + x, oy + y, oz + z, R, own, this._tl);
          iC[n * 4 + 1] = packLook(sp, tl); iB[n * 4 + 3] += Math.round(tl.thin * 255);
          seasonal = true;
        }
        if (T[q + 3] > tallest) tallest = T[q + 3];
        // (how steeply it is seen, for its tile's shadows; and how far its parts reach out
        // from its foot: the rosette spread from above, the upright pictures widened)
        const dn = crownDown(dx, dy, dz, T[q + 3], up); if (dn > maxDown) maxDown = dn;
        const g = geoX[iB[n * 4 + 2]] || { x: 0.5, z: 0.5 }, spread = Math.min(TOP_MAX, Math.max(1.5, Math.pow(Math.max(keep, 1e-4), topPow)));
        const out = T[q + 3] * T[q + 4] * Math.max(g.x * spread * 1.1, 1.5 * g.z); if (out > reach) reach = out;
        const r2 = x * x + y * y + z * z + T[q + 3] * T[q + 3];
        if (r2 > bound2) bound2 = r2;
        n++;
      }
      // (more than a tile may hold: less of the margin, but never under the trees that
      // stand; if even those are too many, the last of the worker's list are left out)
      if (n <= CAP) break;
      n = CAP; margin = pass === 0 ? 1.2 : 1.0;
    }
    n = Math.min(n, CAP);
    tile.count = n; tile.shown = shown; tile.seasonal = seasonal; tile.maxDown = maxDown; tile.fillLen = eye.length();
    tile.fillEye = (tile.fillEye || new THREE.Vector3()).copy(eye);
    s.geo.instanceCount = n; s.shadowGeo.instanceCount = n;
    // (with the reach of its trees' parts: from above a closed wood's crown tops spread to
    // several crown widths, and the corner trees' tops were culled with the tile at the
    // screen's edge, review farforest2-4)
    s.geo.boundingSphere.center.set(0, 0, 0); s.geo.boundingSphere.radius = Math.sqrt(bound2) + 20 + reach;
    // (the shadows reach out from the trees' feet by as much as SHADOW_LONG of their heights:
    // with the trees' own bounds the shadows near a tile's corner were culled with it at the
    // screen's edge, review farforest-7)
    s.shadowGeo.boundingSphere.center.set(0, 0, 0); s.shadowGeo.boundingSphere.radius = Math.sqrt(bound2) + 20 + tallest * SHADOW_LONG;
    for (const a of [s.iA, s.iB, s.iC]) { a.clearUpdateRanges?.(); a.addUpdateRange?.(0, Math.max(1, n) * 4); a.needsUpdate = true; }
  }
}


export { BASE_BLOCKS, BAND, LEVELS, band, CAP, MARGIN };
