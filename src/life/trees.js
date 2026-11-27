// Trees round the traveller. Where they stand, how tall and of what kind is worked out
// block by block in the terrain workers (treeBlock.js) from the land-cover and canopy
// maps; this keeps the blocks near the traveller, turns them into instances of a few
// tree shapes (treeGeometry.js: a near and a far mesh each) and draws them with the
// world's one light. Farther off the ground shader raises the forest as a whole
// (terrainMaterial.js): trees are for walking among and flying low over.
//
// A world has trees if it lists `life.trees` ({ radius (m), spacing (m), below (m above
// the ground: no trees drawn from higher) }) and its tiles give a land-cover picture.
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { TREE_SHADE_VERT, TREE_SHADE_UNIFORMS } from './treeShade.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';
import { makeTreeGeometries, VARIANTS, sharedCorners } from './treeGeometry.js';
import { ATLAS_W, ATLAS_H } from './treeAtlasLayout.js';
import { SNOW_GLSL, SNOW_UNIFORMS } from '../render/snowGlsl.js';
import { EDGE0, EDGE1, TOP0, TOP1 } from './farTreeForm.js';
import { SPECIES, bloomOf, treeLook, canopyYear, canopyFar } from './cover.js';
import { treeSeason } from './season.js';

// A tree of the middle sort (turns orange to red, neither early nor late): what the season of a place is said by
const MIDDLE_TREE = { leaf: [0.06, 0.11, 0.03], fall: 1 };
import { blockDeg, TREE_FLOATS, blockLon } from './treeBlock.js';
import { REBUILD_M, radii, fineStep, toMake, inFarList, nearCandidates, makeOf, castMake, CUT_IN } from './treeLod.js';

const CLOSE_CAP = 192, NEAR_CAP = 768, FAR_CAP = 4096;       // instances of one shape: close, near and far mesh
// (which make a tree gets, and when the lists are made again: life/treeLod.js)
export { REBUILD_M } from './treeLod.js';
// How far from where a list was made its trees reach: every tree that can come within the
// radius of the eye before the list is made again (the cut at the radius is by distance
// from the eye, and the far forest draws nothing inside it).
export const nearListReach = (radius) => radius + REBUILD_M + 5;
// How far from the eye the near trees are drawn, given how far off the middle of the
// nearest block is whose trees have not come (a block's corner is 79 m from its middle):
// no farther than the blocks that are in. The far forest begins there.
export const nearReach = (radius, noTrees) => Math.max(0, Math.min(radius, noTrees - 80));
// Blocks are asked for from this many radii over the ground (trees can be drawn from one).
export const ASK_ABOVE = 1.6;

// The painted look's leaf: a cleaner green of the tree's own kind, warm for broad leaves, a
// cold blue-green for firs and spruces, told by the colour the species has. (The far trees
// of life/farForest.js take it from here: the two must be one green.)
// What a texel of the trees' picture is (its blue: 0 a leaf, a half a petal, 1 wood): ONE
// rule, used by the near trees' picture and shadow passes and by the far forest
// (life/farForest.js imports it). Written in two places, the two crossed over twice.
export const TREE_WOOD = /* glsl */`
bool treeWood(vec3 cut) { return cut.b > 0.75; }`;

export const PAINT_LEAF = /* glsl */`
vec3 paintLeaf(vec3 c) {
  vec3 hue = mix(vec3(0.62, 1.0, 0.36), vec3(0.36, 1.0, 0.62), smoothstep(-0.2, 0.2, (c.b - c.r) / max(c.g, 1e-4)));
  // (a green leaf's hue is painted cleaner; a leaf turned gold or red keeps its own: with the
  // green's hue in it an autumn crown was olive. Nothing changes for a leaf with more green than red.)
  return mix(c, dot(c, vec3(0.2, 0.7, 0.1)) * hue, 0.45 * (1.0 - smoothstep(0.0, 0.3, (c.r - c.g) / max(c.r, 1e-4))));
}`;

// A whole tree's picture with some of its leaves off (near here from 60 m, and the far
// forest's): they go clump by clump, a clump a block of the picture's texels that is never
// under a pixel wide (its size doubles with the distance), so a far tree thins as a near one
// does and nothing sparkles; the blocks' edges are pushed about by the picture's own tone, so
// a clump has a leafy outline (square, the clumps left on a half-bare crown were orange
// rectangles in the air). uv: where in the trees' picture; tone: the picture's tone there
// (its green); lod: texels a pixel, as a power of two; own: the tree's own number; gone: how
// much of its leaves is off, 0..1 (the crown's top seen from above, a solid mass, is asked
// with more: ROSETTE_THIN times as much, or it lay in a thinned crown as a pad).
export const ROSETTE_THIN = 2.2;
export const TREE_THIN = /* glsl */`
bool treeThinned(vec2 uv, float tone, float lod, float own, float gone) {
  if (gone <= 0.0) return false;
  float size = 10.0 * exp2(ceil(max(lod, 0.0)));
  vec2 cell = floor((uv * vec2(${ATLAS_W}.0, ${ATLAS_H}.0) + (tone - 0.8) * vec2(5.0, -4.0) * size) / size);
  return fract(sin(dot(cell, vec2(12.9898, 78.233)) + own * 37.0) * 43758.5453) < gone * 1.05;
}`;

// The trees' picture with its smaller copies (mip maps) made here, off the GPU (made on the
// GPU, a phone builds them in the middle of a frame: see CLAUDE.md), and made for a
// cut-out: a smaller copy's tone and kind are averaged over what is covered only, so the
// edge of a leaf never takes the colour of the nothing beside it (no grey fringe far off).
async function loadAtlas(url) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  let w = bmp.width, h = bmp.height;
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0); bmp.close?.();
  let src = new Uint8Array(cx.getImageData(0, 0, w, h).data.buffer);
  const mips = [{ data: src, width: w, height: h }];
  while (w > 1 && h > 1) {
    const W = w >> 1, H = h >> 1, out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0, o = y * W * 4, i = y * 2 * w * 4; x < W; x++, o += 4, i += 8) {
      const j = i + w * 4, c0 = src[i], c1 = src[i + 4], c2 = src[j], c3 = src[j + 4], c = c0 + c1 + c2 + c3;
      out[o] = (c + 2) >> 2; out[o + 3] = 255;
      if (c > 0) { out[o + 1] = (src[i + 1] * c0 + src[i + 5] * c1 + src[j + 1] * c2 + src[j + 5] * c3) / c; out[o + 2] = (src[i + 2] * c0 + src[i + 6] * c1 + src[j + 2] * c2 + src[j + 6] * c3) / c; } else { out[o + 1] = (src[i + 1] + src[i + 5] + src[j + 1] + src[j + 5]) >> 2; out[o + 2] = 0; }
    }
    mips.push({ data: out, width: W, height: H }); src = out; w = W; h = H;
  }
  const t = new THREE.DataTexture(mips[0].data, mips[0].width, mips[0].height, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.mipmaps = mips; t.generateMipmaps = false; t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

// The wind in the trees (TREE_VERT), as numbers the shadow pass's fine count reads too:
// the gusts' wave (radians a metre along the wind), how far a tree bends per metre of its
// height and m/s of wind (in a gust, swinging), and how far a single leaf flutters (still
// air, and more per m/s).
export const GUST_K = 0.05, WIND_BEND = [0.004, 0.0025], WIND_FLUTTER = [0.0012, 0.0009];

// How far a mesh reaches from the tree's foot, in tree heights (a tree is one unit tall, its
// x and z scaled by its crown's width), and the most its vertices sway and flutter.
function castBound(geo) {
  const P = geo.attributes.position.array, S = geo.attributes.aSway.array;
  let r = 0, lo = 0, hi = 0, sway = 0, flutter = 0;
  for (let i = 0, j = 0; i < P.length; i += 3, j += 2) {
    r = Math.max(r, Math.hypot(P[i], P[i + 2])); lo = Math.min(lo, P[i + 1]); hi = Math.max(hi, P[i + 1]);
    sway = Math.max(sway, Math.abs(S[j])); flutter = Math.max(flutter, Math.abs(S[j + 1]));
  }
  return { r, lo, hi, sway, flutter };
}

// How far (m) a vertex of a tree can be from its trunk, the line from b.lo to b.hi of its
// height up from its foot, as TREE_VERT places it: across, its x and z times the crown's
// width (crown, iB.x) times the height (h, iA.w); the wind moves it by at most aSway.x times
// the height times WIND_BEND's two terms (gust and swing at their largest, W the wind's
// speed), and a leaf flutters by aSway.y times the height times WIND_FLUTTER's, along three
// axes at once (root 3). b: castBound of the mesh. Trees.fineCount reads it;
// scripts/tree-shadow-test.mjs places every vertex of every mesh that casts by TREE_VERT's
// own lines and fails if one lies farther: a TREE_VERT that moves a vertex farther is caught there.
export const treeReach = (b, h, crown, W) => h * (b.r * crown + b.sway * (WIND_BEND[0] + WIND_BEND[1]) * W + b.flutter * (WIND_FLUTTER[0] + WIND_FLUTTER[1] * W) * 1.74);

export const TREE_VERT = /* glsl */`
in vec4 iA;            // xyz: the tree's foot from the anchor (m, planet axes), w: its height (m)
in vec4 iB;            // x: crown width, y: turn (radians), z: a number of its own (0..1), w: how much of its leaves is off it, 0..1 (life/season.js, treeSeason)
in float aLeaf; in vec2 aSway;      // aSway.x: how far the wind moves the vertex, y: how much it flutters (0 where a spray is held)
in vec2 aUv;            // where in the trees' picture (a card of foliage, a whole tree's card); -1: a plain face
in vec3 aCrown;         // the far mesh's crown coordinates (treeGeometry.js crownCoords): z 1, 2 an upright card, 3 the crown's top
uniform vec3 uAnchorRel, uTreeEast, uTreeNorth, uTreeUp;
uniform vec4 uTreeWind;      // xyz: where the wind blows to (unit), w: its speed (m/s)
uniform float uGustPhase;    // the gust's phase at the anchor (Trees.update): a tree's gust is its place's, whatever the anchor
uniform vec3 uSeason;        // z: time (s). (x, y: the season of the place, for the leaves in the air; a tree's own season is in iB.w and its leaf colour)
uniform float uTreeRadius;
in float iF;                  // 1: a tree of the far list (its cards), drawn only outside uLodCut's radius (life/treeLod.js)
uniform vec4 uLodCut;         // xyz: the eye at the last choice of makes, from the anchor (m); w: the near radius then
bool treeCull;                // set by treePosition: this tree is the far forest's to draw
vec3 treePosition(out vec3 foot, out float leaf) {
  foot = uAnchorRel + iA.xyz;
  float c = cos(iB.y), s = sin(iB.y);
  vec3 p = position;
  // bare in winter: the leaves draw in to the branches (the trunk stays)
  // (plain leaves and the dark lumps only: a spray's card stays on its twig, and its leaves
  // are left out of it one by one in the fragment shader, so the twigs drawn in it stay)
  float gone = (aLeaf > 0.5 && aLeaf < 2.5 ? 1.0 : 0.0) * iB.w;
  // A whole tree's upright pictures, looked down on: on edge they are bright slivers on the
  // crown, so they draw in to nothing as the far forest's do, by its rule (life/farTreeForm.js:
  // the same tree at 150 m and at 400 m), and the rosette in the crown is the tree from there.
  // (Not in the shadow pass: a shadow is the tree seen from the Sun, never from the eye. Drawn
  // in by the eye's angle there, every tree in a ring under anyone looking down cast a disc.)
#ifdef TREE_DEPTH
  float edge = 1.0;
#else
  float edge = aLeaf > 3.5 ? 1.0 - smoothstep(${EDGE0.toFixed(3)}, ${EDGE1.toFixed(3)}, dot(-normalize(foot + uTreeUp * (iA.w * 0.7)), uTreeUp)) : 1.0;
#endif
  // The crown's top, from low down, draws in inside the side pictures (lying flat at crown
  // height and wider than the crown seen from the side, it was a pink or green pad laid on
  // every tree from 20 degrees down); from above it is the crown, whole (the far trees' rule,
  // TOP0 to TOP1). It is its old size again from 180 m to the 240 m line, as the far forest's.
  if (aCrown.z > 2.5) p.xz *= mix(mix(0.55, 1.0, smoothstep(${TOP0.toFixed(3)}, ${TOP1.toFixed(3)}, dot(-normalize(foot + uTreeUp * (iA.w * 0.7)), uTreeUp))), 1.0, smoothstep(180.0, 240.0, length(foot)));
  p.xz *= iB.x * (1.0 - 0.85 * gone) * edge;
  vec3 l = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c) * iA.w;
  // wind: the whole tree leans a little and its crown swings, gust by gust, each tree in
  // its own time; more the higher and the farther out a leaf is (the gust's phase by the
  // tree's place: from the anchor, plus the anchor's own, so that no tree lurches when the
  // lists are made again from a new anchor)
  float gust = 0.6 + 0.4 * sin(uSeason.z * 0.7 + dot(iA.xyz, uTreeWind.xyz) * ${GUST_K} + uGustPhase + iB.z * 6.28);
  float swing = sin(uSeason.z * (1.6 + iB.z) + iB.z * 40.0 + p.y * 3.0) * 0.5 + 0.5 * sin(uSeason.z * 3.7 + iB.z * 17.0 + p.x * 9.0);
  float bend = aSway.x * iA.w * (${WIND_BEND[0]} * uTreeWind.w * gust + ${WIND_BEND[1]} * uTreeWind.w * swing);
  // The far forest (life/farForest.js) draws the very same trees beyond this radius, with
  // the same picture at the same size: the two are cut against each other by distance from
  // the eye, and a tree is drawn by exactly one of them. (They used to shrink away over the
  // last 14 % of the radius, from when nothing stood beyond it.)
  // A far card is cut where its tree stands inside the near radius of the eye at the last
  // choice of makes: the close and near lists have it there (life/treeLod.js).
  treeCull = length(foot) > uTreeRadius || edge <= 0.0 || (iF > 0.5 && length(iA.xyz - uLodCut.xyz) < uLodCut.w);
  float fade = 1.0;
  leaf = aLeaf;
  // (single leaves flutter, each in its own time, harder the harder it blows)
  vec3 flutter = vec3(0.0);
  if (aLeaf > 1.5 && aLeaf < 3.5) { float ph = dot(position, vec3(41.0, 57.0, 73.0)) + iB.z * 31.0, amp = aSway.y * iA.w * (${WIND_FLUTTER[0]} + ${WIND_FLUTTER[1]} * uTreeWind.w); flutter = (uTreeEast * sin(uSeason.z * 7.3 + ph) + uTreeUp * sin(uSeason.z * 9.1 + ph * 1.7) + uTreeNorth * sin(uSeason.z * 6.1 + ph * 0.6)) * amp; }
  return foot + (uTreeEast * l.x + uTreeUp * l.y + uTreeNorth * l.z + uTreeWind.xyz * bend + flutter) * fade;
}
vec3 treeNormal() {
  float c = cos(iB.y), s = sin(iB.y);
  vec3 n = normal;
  return normalize(uTreeEast * (n.x * c - n.z * s) + uTreeUp * n.y + uTreeNorth * (n.x * s + n.z * c));
}`;

// Bark, by rule, on a tube's own coordinates (life/treeGeometry.js, tube): U = -aUv.x - 2 is
// twice the furrows round the tube plus how far round it (0..1), bv how far along it in
// metres. Three kinds, told by the trunk's colour as the leaf's kind is by its green: a pale
// trunk is smooth with dark bands part of the way round and black scars (birch, aspen); a red
// one is large plates, each its own tone, with dark cracks between (pine); any other is
// furrowed, the ridges broken into lengths (fir, spruce, oak).
// Every term goes a whole number of times round the tube (the furrows' wander, which column a
// plate is in, the bands, the scars), so the pattern meets itself where the tube's
// coordinate starts again: it broke along a line down every trunk and limb. And where a
// pattern is finer than the pixels (fu, fv: a pixel's footprint in furrows round and in
// metres along), it gives way to its own mean, not to a plain trunk: near-black furrows a
// pixel or two apart crawled on every trunk's flanks as one walked.
// (scripts/trees-near-test.mjs evaluates this function as written, in JavaScript.)
export const BARK = /* glsl */`
float barkHash(float x) { return fract(sin(x) * 43758.5453); }
float barkMean(float pale, float red) { return mix(mix(0.665, 0.81, red), 0.915, pale); }
float barkTone(float U, float bv, float fu, float fv, float pale, float red, float own) {
  float fur = floor(U * 0.5), bu = (U - 2.0 * fur) * fur;
  // (whole turns round the tube: about 2.1 and 1 radians a furrow, as the wander was)
  float k1 = max(1.0, floor(fur * 0.334 + 0.5)) * 6.2831853 / fur, k2 = max(1.0, floor(fur * 0.159 + 0.5)) * 6.2831853 / fur;
  // furrows: lines up the tube that wander; a ridge between two is broken across here and there
  float wob = bu + 0.3 * sin(bv * 1.7 + bu * k1) + 0.12 * sin(bv * 5.3 + bu * k2), col = mod(floor(wob), fur), f = abs(fract(wob) - 0.5) * 2.0;
  float rowF = mix(1.5, 0.9, red), row = bv * rowF + barkHash(col * 12.9898) * 7.0;
  // (how fine each pattern is on the screen: the furrows in periods a pixel, the breaks across in lines a pixel)
  float aaF = smoothstep(0.3, 0.6, (fu + fv * 1.15) * mix(1.0, 2.0, red)), aaR = smoothstep(0.1, 0.25, fv * rowF);
  float across = mix(smoothstep(0.82, 0.95, abs(fract(row) - 0.5) * 2.0), 0.115, aaR);
  float plate = mix(barkHash(dot(vec2(col, floor(row + 0.5)), vec2(127.1, 311.7))), 0.5, aaF);
  float furrow = max(smoothstep(mix(0.45, 0.72, red), mix(0.8, 0.92, red), f), across * mix(0.7, 1.0, red));
  float rough = (1.0 - 0.86 * furrow) * (1.0 + mix(0.45, 0.6, red) * (plate - 0.4));          // (furrows near black, the plates' faces catching the light)
  // a pale trunk: bands a little way round it, a black scar now and then
  float band = floor(bv * 9.0), bh = barkHash(band * 91.7 + own * 31.0);
  float bandOn = step(0.45, bh) * step(abs(fract(bu * max(1.0, floor(fur * 0.31 + 0.5)) / fur + bh * 5.0) - 0.5), 0.12 + 0.2 * bh) * step(0.55, fract(bv * 9.0));
  float scar = step(0.9, barkHash(floor(bv * 1.3) * 17.3 + own * 9.0)) * step(abs(fract(bu * max(1.0, floor(fur * 0.2 + 0.5)) / fur + bh) - 0.5), 0.1) * step(abs(fract(bv * 1.3) - 0.5), 0.2);
  float smooth_ = 1.0 - 0.6 * max(mix(bandOn, 0.17, smoothstep(0.25, 0.5, fv * 9.0)), scar * 1.4);
  return mix(mix(rough, barkMean(0.0, red), aaF), smooth_, pale);
}`;

export class Trees {
  constructor(world, terrain) {
    this.terrain = terrain;
    this.geos = makeTreeGeometries();
    this.shared = {
      ...SNOW_UNIFORMS,
      ...lightingUniforms(), ...TREE_SHADE_UNIFORMS,
      uAnchorRel: { value: new THREE.Vector3() }, uTreeEast: { value: new THREE.Vector3(1, 0, 0) }, uTreeNorth: { value: new THREE.Vector3(0, 1, 0) }, uTreeUp: { value: new THREE.Vector3(0, 0, 1) },
      uTreeWind: terrain.shared.uWind, uGustPhase: { value: 0 }, uSeason: { value: new THREE.Vector3() }, uTreeRadius: { value: 240 }, uLodCut: { value: new THREE.Vector4(0, 0, 0, 0) },
      tTreeAtlas: { value: null },
      // 1: the Sun's light and the air worked out at every pixel, as before they were taken
      // from the vertices (?debug=treeairpixel, and the benchmark's row)
      uTreeOld: { value: 0 },
    };
    // The trees' picture (made by scripts/make-tree-atlas.mjs). Until it has come, no tree is drawn.
    this.atlasReady = false;
    loadAtlas((import.meta.env?.BASE_URL ?? '/') + 'data/tree_atlas.png').then((t) => {
      this.renderer?.initTexture(t);              // (to the GPU now, between frames, if the renderer is known by then)
      this.shared.tTreeAtlas.value = t; this.atlasReady = true; this.dirty = true;
    }).catch((e) => console.error(e));
    // What the vertices hand the pixels, declared once for both shaders. Packed: a phone must
    // offer no more than 15 rows of these, and each declaration takes a row (14 here).
    const vary = (io) => /* glsl */`
        ${io} vec4 vBloom; ${io} vec2 vTall;  // (vTall: the tree's height in metres; how bare it is)
        ${io} vec3 vRel; ${io} vec3 vN; ${io} vec3 vLeafC; ${io} vec3 vTrunkC; ${io} vec3 vTreeM;
        ${io} vec4 vUvOwn;                // xy: where in the trees' picture, zw: the tree's own number, and how much of its leaves is off it
        ${io} vec4 vBits;                 // x: leaf or wood (aLeaf), y: the height in the tree, z: how much of the Sun the clouds and the land leave it, w: new snow lying where the tree stands (render/snowGlsl.js)
        ${io} vec3 vCrown; ${io} vec3 vCardX;          // (the far mesh's crown coordinates, treeGeometry.js crownCoords; and its card's own x in the world)
        ${io} vec3 vSun;                  // the Sun's light where the vertex is, unshadowed (lightingGlsl.js, directSun)
        ${io} vec3 vAirT; ${io} vec3 vAirL;            // the air between it and the eye: colour x vAirT + vAirL
        #define vUv vUvOwn.xy
        #define vOwn vUvOwn.zw
        #define vLeaf vBits.x
        #define vY vBits.y
        #define vCloud vBits.z
        #define vSnow vBits.w`;
    this.material = new THREE.ShaderMaterial({
      name: 'Trees', glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.shared, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
#define HAZE_UV 1
${LIGHTING_PARS}
${TREE_VERT}
        in vec3 iC; in vec4 iD;          // (iD.w: how much of the Sun the land leaves this tree, from the worker)
        in vec4 iE;                      // rgb: its petals' colour, w: how far in flower it is (0..1; -1: a tree that never flowers)
        ${vary('out')}
        uniform float uTreeOld;
        ${SNOW_GLSL}
        ${TREE_SHADE_VERT}
        void main() {
          vec3 foot; float leaf;
          vec3 rel = treePosition(foot, leaf);
          // (beyond the radius the far forest draws this tree: out of the picture here)
          if (treeCull) { vSun = vec3(0.0); vAirT = vec3(1.0); vAirL = vec3(0.0); vCloud = 1.0; vRel = vec3(0.0); vN = vec3(0.0, 0.0, 1.0); vLeafC = vec3(0.0); vTrunkC = vec3(0.0); vLeaf = 0.0; vY = 0.0; vOwn = vec2(0.0); vTreeM = vec3(0.0); vUv = vec2(0.0); vBloom = vec4(0.0); vTall = vec2(0.0); vSnow = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          { vec3 pp = uCamPlanetPos + foot, ups = normalize(pp); vSnow = snowSeason(length(pp) - uPlanetRadius, ups, ups, 0.0, 0.0).x; }
          vTreeM = vec3(position.x * iB.x, position.y, position.z * iB.x) * iA.w + iB.z * 37.0;        // metres in the tree's own frame (for the pattern of its leaves)
          vRel = rel; vN = treeNormal(); vLeaf = leaf; vY = position.y; vLeafC = iC; vTrunkC = iD.rgb; vOwn = vec2(iB.z, iB.w); vUv = aUv; vBloom = iE; vTall = vec2(iA.w, aLeaf < 3.5 ? iB.w : iB.w * (1.0 - max(iE.w, 0.0)) * (aCrown.z > 2.5 ? ${ROSETTE_THIN.toFixed(1)} : 1.0));          // (a whole tree's picture in flower keeps its crown: the far forest's rule, TREE_THIN)
          vCloud = cloudShade(foot + uTreeUp * (iA.w * 0.7)) * iD.w;
          { float c = cos(iB.y), s = sin(iB.y); vec3 ax = aCrown.z > 1.5 && aCrown.z < 2.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0); vCardX = uTreeEast * (ax.x * c - ax.z * s) + uTreeNorth * (ax.x * s + ax.z * c); vCrown = aCrown; }          // (the clouds' shadow, from the map of it: life/treeShade.js)
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
          // The Sun's light where the vertex is and the air between it and the eye, worked out
          // here and not at every pixel: over a face of a tree they change by next to nothing,
          // and a wood is eleven whole pictures of such faces one behind another, each pixel of
          // each of which looked nine times into the tables for them. The rules are the same
          // ones (directSun, forestAirParts, hazeAffine: what aerialPerspective does for an eye
          // inside the air). The trees' own shadows stay the pixel's.
          vSun = vec3(0.0); vAirT = vec3(1.0); vAirL = vec3(0.0);
          if (uTreeOld < 0.5 && length(uCamPlanetPos) * 0.001 <= uRTop) {
            vec3 pv = uCamPlanetPos + rel, upv = normalize(pv), air, T, L0, Lg; float k;
            vSun = directSun(pv);
            forestAirParts(rel, upv, 1.0, air, k);
            hazeAffine(rel, gl_Position.xy / max(abs(gl_Position.w), 1e-6) * 0.5 + 0.5, T, L0, Lg);
            vAirT = (1.0 - k) * T; vAirL = air * k * T + L0;
          }
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform vec3 uSeason;
        uniform sampler2D tTreeAtlas;        // sprays of foliage and whole trees, as cut-outs: r cover, g tone, b wood (life/treeAtlasGen.js)
        ${vary('in')}
        uniform float uTreeOld;
        layout(location = 0) out vec4 fragColor;
        float leafHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        // bunches of leaves: cells about 40 cm across, each a tone of its own
        float leafCells(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(leafHash(i), leafHash(i + vec3(1, 0, 0)), f.x), mix(leafHash(i + vec3(0, 1, 0)), leafHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(leafHash(i + vec3(0, 0, 1)), leafHash(i + vec3(1, 0, 1)), f.x), mix(leafHash(i + vec3(0, 1, 1)), leafHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        ${PAINT_LEAF}
        ${TREE_WOOD}
        ${TREE_THIN}
        ${BARK}
        void main() {
          // (a pixel's footprint in the trees' coordinates, here before anything is thrown away:
          // a derivative is only sure where every pixel round it is still being drawn)
          vec2 uvW = fwidth(vUv);
          // A card: cut out of the picture first of all (most of a card is nothing). Far off the
          // cut is taken lower: averaged down, needles and leaves cover less of a pixel, and a
          // tree would thin to nothing.
          bool card = vUv.x >= 0.0; vec3 cut = vec3(1.0, 0.8, 0.0); float lodC = 0.0;
          if (card) {
            cut = texture(tTreeAtlas, vUv).rgb;
            vec2 px = vUv * vec2(${ATLAS_W}.0, ${ATLAS_H}.0);
            float lod = 0.5 * log2(max(max(dot(dFdx(px), dFdx(px)), dot(dFdy(px), dFdy(px))), 1.0)); lodC = lod;
            if (cut.r < mix(0.42, 0.16, clamp(lod / 3.0, 0.0, 1.0))) discard;
          }
          // What the picture says a texel is (its blue): 0 a leaf, a half a petal, 1 wood (over
          // 0.75 on every tree, as the far forest takes it: life/farForest.js). Only a tree that
          // flowers has petals (vBloom.w >= 0), and it shows them flower by flower as it comes
          // into bloom; a flower not yet open, or a tree out of flower, is leaves there, as the
          // far forest draws it (thrown away, a cherry out of flower was a lace of twigs near by
          // and a full crown from 240 m on, ten months of the year).
          bool flowers = vBloom.w >= 0.0, wood = card ? treeWood(cut) : vLeaf < 0.5;
          float petal = card && flowers && !wood ? clamp(cut.b * 2.0, 0.0, 1.0) : 0.0;
          if (card && !wood) {
            // (one number for each flower, each leaf: the texels of a spray in blocks of twelve)
            vec2 cell = floor(vUv * vec2(${ATLAS_W}.0, ${ATLAS_H}.0) / 12.0); float h = fract(sin(dot(cell, vec2(12.9898, 78.233)) + vOwn.x * 37.0) * 43758.5453);
            if (h >= vBloom.w) petal = 0.0;          // (and a texel part leaf part petal: no petal's tint out of flower)
            // bare in winter: the leaves are gone from the spray, leaf by leaf; its twigs stay
            // (a whole tree's picture: clump by clump, as the far forest thins it, TREE_THIN)
            if (petal <= 0.5 && (vLeaf > 3.5 ? treeThinned(vUv, cut.g, lodC, vOwn.x, vTall.y) : h < vTall.y * 1.05)) discard;
          }
          if (!card && vLeaf > 0.5 && vTall.y > 0.5) discard;
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel);
          vec3 N = normalize(vN);
          if (vLeaf < 0.5) N *= sign(dot(N, V));                // (trunks are open tubes: light the side that is seen)
          // A far-made tree's pictures (60 to 240 m) lit as one rounded mass: each pixel's normal
          // from its place in the crown (a ball: the cap toward the Sun warm and lit, the far
          // side in the cool shade); on the crown top looked down on, a dome. (Lit by four
          // corner normals, a crown was one flat tone with a gradient across it: a sticker.)
          // It gives way to the corner normals from 180 m to the 240 m line, where the far
          // forest, lit by its corners, takes over.
          if (card && vCrown.z > 0.5) {
            float kb = 1.0 - smoothstep(180.0, 240.0, length(vRel));
            if (kb > 0.0) {
              vec3 R = normalize(vCardX), Nb; float u = clamp(vCrown.x, -1.0, 1.0), w = clamp(vCrown.y, -1.0, 1.0), h = sqrt(max(0.08, 1.0 - u * u - w * w));
              if (vCrown.z > 2.5) Nb = normalize(R * u * 0.85 + cross(up, R) * w * 0.85 + up * h);
              else { vec3 F = cross(R, up); F *= dot(F, V) < 0.0 ? -1.0 : 1.0; Nb = normalize(R * u * 0.85 + up * (w * 0.85 + 0.15) + F * h); }
              N = normalize(mix(N, Nb, kb));
            }
          }
          // (a plain leaf seen from its under side: the side that looks away from the sky)
          float under = vLeaf > 0.5 && !card && dot(N, V) < 0.0 ? 1.0 : 0.0;
          // (leaves in their season: vLeafC is this tree's leaves on this day, life/season.js)
          // (a crown is leaves and the gaps between them: as a surface it is darker than a leaf)
          vec3 leafC = vLeafC * (0.5 + 0.22 * fract(vOwn.x * 13.7));
          // (the painted look: a crown's faces that look up are its light tone, those that look
          // down its dark one; a pale trunk has its dark scars, as aspen and birch do)
          if (uPaint.x > 0.0 && vLeaf > 0.5 && !card) {
            leafC = paintLeaf(leafC) * mix(0.64, 1.15, smoothstep(-0.45, 0.55, dot(N, up)));
            // (a crown is bunches of leaves, drawn as patches of three tones with clean edges;
            // not from far off, where a patch is smaller than a pixel)
            float c = leafCells(vTreeM * 2.6) * 0.65 + leafCells(vTreeM * 6.1 + 3.3) * 0.35, near = 1.0 - smoothstep(60.0, 140.0, length(vRel));
            leafC *= mix(1.0, 0.72 + 0.3 * smoothstep(0.40, 0.44, c) + 0.26 * smoothstep(0.58, 0.62, c), near);
          }
          // (single leaves: each lighter or darker than its neighbours)
          leafC *= 1.0 - 0.36 * under;
          if (vLeaf > 1.5) leafC *= 0.94 + 0.44 * smoothstep(0.35, 0.65, leafCells(vTreeM * 4.7 + 1.9));
          else if (vLeaf > 1.1) leafC *= 0.46;          // (the heart of a mass of foliage: the dark inside, see Shape.heart in treeGeometry.js)
          // (a card's foliage: cleaner green, lighter where the crown looks up; and each needle
          // and leaf its own tone, from the picture)
          if (card) {
            if (uPaint.x > 0.0) leafC = paintLeaf(leafC) * mix(0.5, 1.12, smoothstep(-0.5, 0.6, dot(N, up)));
            leafC *= 0.46 + 0.6 * cut.g;
            // (petals: their own colour, pale and bright whatever the leaf's green is)
            // From a deep tone of it inside the crown and on its under side to near white on the
            // flowers at the sprays' tips and where the crown looks up at the sky (the picture's
            // tone says which flower: the last of a twig is its lightest).
            // (pink kept at every distance and from above: its palest is a pale pink, not white; seen
            // from above every texel looks up, and at 0.72 of white a cherry was a white splat)
            float pale = clamp(smoothstep(0.45, 1.0, cut.g) * 0.75 + smoothstep(-0.3, 0.7, dot(N, up)) * 0.3 - (vLeaf > 3.1 && vLeaf < 3.5 ? 0.5 : 0.0), 0.0, 1.0);
            leafC = mix(leafC, mix(vBloom.rgb * vec3(0.62, 0.42, 0.52), mix(vBloom.rgb, vec3(0.8, 0.76, 0.76), 0.45), pale), petal);
          }
          // (the heart of a bunch: the dark inside of the crown, see Shape.heart in treeGeometry.js)
          bool heart = (vLeaf > 3.1 && vLeaf < 3.5) || (vLeaf > 1.1 && vLeaf < 1.5);
          if (vLeaf > 3.1 && vLeaf < 3.5) leafC *= 0.5;
          // (a twig, drawn in a spray or a thin tube of its own: grey-brown whatever the trunk's
          // colour, and darker than the limb it grows from; a pine's red is its trunk's plates)
          vec3 twigC = mix(vTrunkC, dot(vTrunkC, vec3(0.333)) * vec3(1.06, 1.0, 0.9), 0.75) * 0.4;
          // (bark is dark: a fir's or a pine's trunk in the Sun is grey-brown to red-brown, never a
          // pale peeled pole; only the pale trunks, birch and aspen, keep their tone)
          float paleT = step(0.4, dot(vTrunkC, vec3(0.333))), redT = (1.0 - paleT) * smoothstep(1.7, 2.3, vTrunkC.r / max(vTrunkC.b, 1e-3));
          // (a pine's red plates are lighter than a fir's grey-brown furrows: at 0.28 a ponderosa
          // was a black pole against the morning sky)
          vec3 albedo = wood ? (card || vLeaf > 0.1 ? twigC : vTrunkC * mix(mix(0.28, 0.45, redT), 0.6, paleT)) : leafC;
          // (new snow on the crown: on what of it looks up at the sky)
          if (vSnow > 0.0) albedo = mix(albedo, vec3(0.80, 0.83, 0.88), vSnow * smoothstep(0.1, 0.6, dot(N, up)) * (wood ? 0.45 : 0.85));
          // (bark: furrows, plates or bands by rule, BARK above; a trunk is round even in the
          // shade of the wood, where no light says so: darker toward its edges)
          if (wood && !card) {
            albedo *= mix(0.42, 1.0, smoothstep(0.05, 0.75, abs(dot(N, V))));          // (round: darker toward its two edges)
            float dW = length(vRel);
            if (vUv.x < -1.5) {
              float U = -vUv.x - 2.0, pale = step(0.4, dot(vTrunkC, vec3(0.333))), red = (1.0 - pale) * smoothstep(1.7, 2.3, vTrunkC.r / max(vTrunkC.b, 1e-3));
              // (from 30 m the pattern gives way to its mean: tubes are drawn to 60 m at most)
              float near = 1.0 - smoothstep(30.0, 70.0, dW);
              albedo *= near > 0.0 ? mix(barkMean(pale, red), barkTone(U, vUv.y * vTall.x, uvW.x * floor(U * 0.5), uvW.y * vTall.x, pale, red, vOwn.x), near) : barkMean(pale, red);
            } else if (uPaint.x > 0.0 && dot(vTrunkC, vec3(0.333)) > 0.4) albedo *= 1.0 - 0.75 * step(0.8, fract(vY * 31.0 + vOwn.x * 9.0)) * step(0.35, fract(vY * 7.7 + vOwn.x * 3.0));
          }
          // (the shadow is asked for a little outside the crown: on a mass of a few faces the
          // shadow map would draw the faces)
          float shadow = nearShadow(vRel + N * (wood ? 0.05 : 0.45), N) * vCloud;
          // (the Sun's light and the air come from the vertices; at every pixel, as it was,
          // under ?debug=treeairpixel and for an eye outside the air)
          bool atCorners = uTreeOld < 0.5 && length(uCamPlanetPos) * 0.001 <= uRTop;
          vec3 sun0;
          if (atCorners) sun0 = vSun; else sun0 = directSun(planetPos);
          vec3 sun = sun0 * shadow;
          // a crown is not a wall: light wraps round it, and some comes through from behind
          float nl = dot(N, uSunDir), lit = !wood ? max(nl * 0.7 + 0.3, 0.0) : max(nl, 0.0);
          if (uPaint.x > 0.0) { lit = mix(lit, paintLit(!wood ? nl * 0.75 + 0.25 : nl) * PI, uPaint.x); albedo = paintColour(albedo); leafC = paintColour(leafC); }
          // (and seen against the Sun, foliage glows: the light comes through needles and leaves)
          float through = wood || heart ? 0.0 : (max(-nl, 0.0) * 0.28 + (card ? 0.4 * pow(max(dot(-V, uSunDir), 0.0), 4.0) : 0.0)) * (1.0 + petal);
          // inside and under a crown less sky is seen
          float open = !wood ? mix(0.5, 1.0, smoothstep(-0.6, 0.8, dot(N, up))) : mix(0.22, 0.6, smoothstep(0.0, 0.5, vY));
          // (the painted look: the shaded side of a crown is its dark tone, not a bright one lit by the sky)
          if (uPaint.x > 0.0 && !wood) open *= 0.8;
          // (and in the shade of the wood a crown is never black: by day some light has always
          // come down through the leaves above it, green from the passage)
          vec3 glow = !wood ? leafC * sun0 * (0.07 * smoothstep(0.0, 0.25, dot(up, uSunDir))) * vec3(0.9, 1.2, 0.5) : vec3(0.0);
          // (a trunk's shade side is coloured, never black: the sunlit ground round it throws warm
          // light up onto its sides, most onto the side away from the Sun)
          vec3 bounce = wood && !card ? albedo * sun0 * vCloud * (0.14 * smoothstep(0.0, 0.3, dot(up, uSunDir))) * (1.0 - 0.6 * abs(dot(N, up))) * vec3(1.0, 0.72, 0.6) : vec3(0.0);
          vec3 col = (albedo * (sun * lit + skyLight(N, up) * open + planetShine(N)) + bounce + leafC * sun * through * vec3(1.1, 1.25, 0.6) + glow) / PI;
          if (atCorners) col = col * vAirT + vAirL;
          else col = aerialPerspective(forestAir(col, vRel, up, 1.0), vRel);
          fragColor = vec4(col * uExposure, 1.0);
        }`,
    });
    this.depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, colorWrite: false, uniforms: this.shared, side: THREE.DoubleSide, defines: { TREE_DEPTH: 1 },
      vertexShader: /* glsl */`${TREE_VERT}
        in vec4 iE;
        out float vLeaf; out vec2 vUv; out float vBare; out vec2 vBloom;
        void main() {
          vBloom = vec2(iE.w, aLeaf < 3.5 ? iB.w : 0.0);
          vec3 foot; float leaf; vec3 rel = treePosition(foot, leaf);
          gl_Position = treeCull ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(rel, 1.0); vLeaf = leaf; vUv = aUv;
          // (a whole tree's card keeps its leaves in winter: its shadow then is thinned instead)
          vBare = aLeaf > 3.5 ? iB.w * (1.0 - max(iE.w, 0.0)) : 0.0;
        }`,
      // (a crown lets some of the Sun through: its shadow is flecked, not solid)
      fragmentShader: /* glsl */`${TREE_WOOD}
        uniform sampler2D tTreeAtlas; in float vLeaf; in vec2 vUv; in float vBare; in vec2 vBloom; layout(location = 0) out vec4 fragColor;
        uniform ivec2 uShadowHashShift;     // this tile's texels counted on the ground (shadows/nearShadow.js)
        void main() {
          if (vUv.x >= 0.0) {
            vec3 cut = texture(tTreeAtlas, vUv).rgb;
            if (cut.r < 0.3) discard;
            // (leaves of a bare one, as the picture pass leaves them out; a tree's petals while it
            // is in flower are kept, and out of flower they are leaves, as in the picture pass)
            bool wood = treeWood(cut), open = cut.b > 0.25 && !wood && vBloom.x >= 0.5;
            if (!open && !wood && vBloom.y > 0.5) discard;
          } else if (vLeaf > 0.5 && vBloom.y > 0.5) discard;
          // (which pixels: scattered, not in rows; the shadow's soft edge blends them. Each is
          // the texel of the ground it falls on, not of the tile: a tile is drawn again a whole
          // number of texels on as the traveller moves, and its own pixel would draw every
          // fleck under every crown anew, fifteen times a second. One choice for all that a
          // ray of the Sun passes, as before: a crown lets as much through, however deep.)
          uvec2 q = uvec2(ivec2(gl_FragCoord.xy) + uShadowHashShift); uint h = q.x * 1597334677u ^ q.y * 3812015801u; h ^= h >> 15; h *= 2246822507u; h ^= h >> 13;
          if (vLeaf > 0.5 && float(h & 255u) < 80.0 + 150.0 * vBare) discard;
          fragColor = vec4(1.0);
        }`,
    });
    // one mesh per shape, variant and distance: [shape][variant][0 close, 1 near, 2 far]
    this.sets = this.geos.map((variants) => variants.map((pair) => pair.map((base, lod) => {
      const cap = [CLOSE_CAP, NEAR_CAP, FAR_CAP][lod], geo = new THREE.InstancedBufferGeometry();
      // (the same triangles, each corner that several share handed over once: half the vertices)
      const shared = sharedCorners(base, ['position', 'normal', 'aLeaf', 'aSway', 'aUv', 'aCrown']);
      for (const name of ['position', 'normal', 'aLeaf', 'aSway', 'aUv', 'aCrown']) geo.setAttribute(name, shared.attributes[name]);
      geo.setIndex(shared.index);
      const at = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
      const iA = at(4), iB = at(4), iC = at(3), iD = at(4), iE = at(4);
      geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iC', iC); geo.setAttribute('iD', iD); geo.setAttribute('iE', iE);
      // (iF: 1 on the far list's cards, cut inside the near radius; written once)
      const iF = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(lod === 2 ? 1 : 0), 1); geo.setAttribute('iF', iF);
      geo.instanceCount = 0;
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = false; mesh.visible = false; mesh.userData.lod = lod;
      return { geo, mesh, cap, iA, iB, iC, iD, iE, iF, count: 0, tris: base.attributes.position.count / 3, lod };
    })));
    // What casts a tree's shadow (life/treeLod.js, castMake: the near mesh while the tree is
    // drawn with skeleton and sprays, its far mesh, two crossed pictures of the tree and a
    // rosette in its crown, once it is drawn so; every tree its far mesh while the close mesh
    // is given up). this.casters: what the shadow pass is handed (app.js), one for each mesh a
    // set can cast with: that mesh's shape drawn with the set's trees (the set's own mesh
    // where it is the same), drawn while its set casts with it; its bound, for the fine
    // tile's count (fineCount).
    this.casters = [];
    for (const variants of this.sets) for (const trio of variants) trio.forEach((s, lod) => {
      s.castGeos = [];
      // (no close list without a close radius)
      for (const make of new Set([castMake(lod, true), ...(lod > 0 ? [castMake(lod, false)] : [])])) {
        const src = trio[make], bound = castBound(src.geo);
        let mesh = s.mesh;
        if (src !== s) {
          const g = new THREE.InstancedBufferGeometry();
          for (const name of ['position', 'normal', 'aLeaf', 'aSway', 'aUv', 'aCrown']) g.setAttribute(name, src.geo.attributes[name]);
          g.setIndex(src.geo.index);
          g.setAttribute('iA', s.iA); g.setAttribute('iB', s.iB); g.setAttribute('iE', s.iE); g.setAttribute('iF', s.iF);
          g.instanceCount = 0; s.castGeos.push(g);
          mesh = new THREE.Mesh(g, this.depthMaterial); mesh.frustumCulled = false;
        }
        this.casters.push({
          set: s, make, mesh, bound,
          // (as the lists were made: a saving switched since has not reached them yet)
          on: () => s.mesh.visible && castMake(lod, this.closeInLists) === make && (lod <= 1 || this.shadowsFar),
          fineCount: () => this.fineCount(s, bound),
        });
      }
    });
    this.meshes = this.sets.flat(2).map((s) => s.mesh);
    this.blocks = new Map();                 // 'bi:bj' -> { state: 0 asked, 1 ready, origin, trees, count, used }
    this.asked = 0; this.frame = 0; this.serial = -1;
    this.anchor = new THREE.Vector3(); this.builtAt = new THREE.Vector3(1e12, 0, 0); this.fineAt = new THREE.Vector3(1e12, 0, 0); this.nearest = 0; this.dirty = false;
    this.fraction = 1; this.shadowsFar = true; this.closeInLists = true; this.count = 0; this.triangles = 0; this.reach = 0;
    this._gustO = new THREE.Vector3(); this._gustAt = new THREE.Vector3(); this._gustSet = false;
    this.names = '';                          // the species standing nearest, for anyone who asks
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0];
    this.setWorld(world);
  }

  setWorld(world) {
    this.world = world; this.def = world.life?.trees || null;
    this.blocks.clear(); this.asked = 0; this.gen = (this.gen || 0) + 1; this.sunStale = 0; this.sunDirty = false; this.dirty = true; this.serial = -1; this._gustSet = false;
    this.shared.uSeason.value.set(0, 0, 0);
    for (const s of this.sets.flat(2)) { s.count = 0; s.geo.instanceCount = 0; for (const g of s.castGeos) g.instanceCount = 0; s.mesh.visible = false; }
    this.count = 0; this.triangles = 0; this.names = ''; this.falling = 0; this.reach = 0; this.blooming = []; this.shedding = []; this.day = 0;
  }

  // True while blocks that are wanted have not arrived (screenshots wait for them).
  get busy() { return !!this.def && (this.asked > 0 || this.missing > 0 || this.sunStale > 0 || !this.atlasReady); }

  // Every frame. rig: the camera rig; day: the day of the year (0..365.25); time (s).
  update(rig, day, time) {
    this.frame++; this.missing = 0; this.sunStale = 0;
    // (a new day: every tree's season is a day further on. The whole day is what the trees are
    // asked with, here and in the far forest: the same tree, the same day, whenever it was filled)
    const whole = Math.floor(day + 1e-6);
    if (whole !== this.seasonDay) { this.seasonDay = whole; this.dirty = true; }
    this.day = day;
    const def = this.def, t = this.terrain;
    if (!def) return;
    const R = this.world.radius, radius = def.radius ?? 240;
    // The trees are cut at a sphere round the eye, and the far forest draws everything
    // outside it. Blocks are asked for from well above the height at which the first tree
    // can come inside that sphere (on the way down they are there in time), and `reach` —
    // how far these trees reach from the eye, 0 when none are drawn; the far forest and
    // the raised canopy both start where it ends — goes no farther than the blocks that
    // are in: where a block has not come, its trees stay the far forest's to draw.
    const show = rig.agl < Math.min(def.below ?? 1500, radius * ASK_ABOVE) && !!t.coverSerial;
    if (!show) this.reach = 0;
    // (hidden: the cost test takes the near trees out without moving the line the far forest begins at)
    for (const s of this.sets.flat(2)) s.mesh.visible = show && !this.hidden && s.count > 0 && this.atlasReady;
    const p = rig.pos, len = p.length(), lat = Math.asin(p.z / len) * 180 / Math.PI, lon = ((Math.atan2(p.y, p.x) * 180 / Math.PI) + 360) % 360;
    {
      // The year in the leaves (worked out whether or not trees are drawn: the far forest
      // and the ground under it take their season from here too): y runs 0 at the spring
      // equinox of this hemisphere, 0.5 at the autumn one. Leaves turn through the autumn,
      // are gone in winter, back in spring; only away from the tropics.
      // (x, y: a tree of the middle sort where the traveller's ground is, for the leaves in the
      // air and on the ground near by; every tree drawn asks for itself, life/cover.js treeLook)
      const se = treeSeason(MIDDLE_TREE, whole, lat, len - R - Math.max(0, rig.agl), 0.5, this._se || (this._se = {}));
      this.shared.uSeason.value.set(se.turn, se.gone, time); this.placeSeason = se;
      // (the far canopy's patches of such trees, for the ground: by the same rule, when the day
      // or the latitude has moved)
      if (t.shared?.uCanopyYear && (whole !== this._cyDay || Math.abs(lat - (this._cyLat ?? 1e9)) > 0.2 || this._cyWorld !== this.world)) {
        this._cyDay = whole; this._cyLat = lat; this._cyWorld = this.world;
        const cy = canopyYear(this.world, whole, lat, lon, t.shared.uCanopyYear.value, t.shared.uLitterYear.value);
        this.litterMost = Math.max(...t.shared.uLitterYear.value.map((v) => v.w));
        t.shared.uCanopyAlt.value.set(cy.alt0, 1 / cy.step, cy.perDeg, cy.lat);
        if (t.shared.uCanopyFar) canopyFar(this.world, whole, lat, lon, t.shared.uCanopyFar.value);
      }
    }
    if (!show) return;
    // A new land-cover picture or new elevation: every tree is worked out again. The trees
    // that stand stay until their block's new ones arrive (they vanished all at once before,
    // every time a map moved).
    const serial = t.coverSerial * 100000 + t.ringSerial;
    if (serial !== this.serial) { this.serial = serial; for (const b of this.blocks.values()) b.stale = true; }
    // (a block is 111 m on any world: so many degrees on this one, so many metres a degree)
    const DEG = blockDeg(this.world.radius), M = this.world.radius * Math.PI / 180;
    const bi0 = Math.floor(lat / DEG), nb = Math.ceil(nearListReach(radius) / 111.2);
    let noTrees = 1e9, want = null, wantD = 1e9, sunWant = null, sunD = 1e9; const sunNow = this.shared.uSunDir.value, now = performance.now(), sweep = now - (this.sweepAt || 0) > 1000;
    this.sunStale = 0;
    for (let bi = bi0 - nb; bi <= bi0 + nb; bi++) {
      const dLon = blockLon(bi, DEG), count = Math.round(360 / dLon), bj0 = Math.floor(lon / dLon);
      for (let bu = bj0 - nb; bu <= bj0 + nb; bu++) {
        // (the block's middle, in metres from the traveller along the ground)
        const dy = ((bi + 0.5) * DEG - lat) * M, dx = ((bu + 0.5) * dLon - lon) * M * Math.cos(lat * Math.PI / 180), d = Math.hypot(dx, dy);
        if (d > nearListReach(radius) + 80) continue;
        const bj = ((bu % count) + count) % count;          // (the lattice goes once round the world and meets itself)
        const key = bi + ':' + bj, b = this.blocks.get(key);
        if (b) {
          b.used = this.frame;
          if (b.asking) continue;
          if (b.state === 1 && !b.stale) {
            // The land's shadow on its trees was worked out for a Sun that has moved on:
            // again, but after everything that has no trees yet, a sweep a second at most,
            // and not counted as missing. (With the clock at an hour a second the Sun moves
            // that far every six frames: counted as missing, these held the far forest's
            // own asking back for good, and each reply made the lists again.)
            if (sweep && b.sun && b.sun.dot(sunNow) < 0.99966) { b.sunStale = true; this.sweepAt = now; }
            if (b.sunStale) { this.sunStale++; if (d < sunD) { sunD = d; sunWant = [bi, bj, key]; } }
            continue;
          }
        }
        this.missing++;
        if (!b || b.state !== 1) noTrees = Math.min(noTrees, d);
        if (d < wantD) { wantD = d; want = [bi, bj, key]; }
      }
    }
    this.reach = nearReach(radius, noTrees);
    if (!want) want = sunWant;
    // (the lists are made again once, when a sweep for the Sun is all in)
    if (this.sunDirty && this.sunStale === 0 && this.asked <= 0) { this.sunDirty = false; this.dirty = true; }
    // ask for the nearest missing block when a worker has nothing better to do
    if (want && this.asked < 2 && t.workers.idle && !t.tiles.busy && t.wanted.length === 0) {
      const [bi, bj, key] = want, epoch = t.epoch, serialAt = this.serial, sun = sunNow.clone(), job = t.workers.run({ type: 'trees', bi, bj, spacing: def.spacing ?? 7, sun: [sun.x, sun.y, sun.z], sunHalf: t._sunHalf ?? 0.00465 });
      if (job) {
        let b = this.blocks.get(key);
        if (!b) { b = { state: 0, used: this.frame }; this.blocks.set(key, b); }
        const forSun = b.state === 1 && !b.stale, gen = this.gen;
        b.asking = true; this.asked++;
        job.then((res) => {
          if (gen === this.gen) this.asked--;
          b.asking = false;
          if (epoch !== t.epoch) return;                       // another world by now
          // (worked out from maps that have changed again since: kept as it is, and asked for again)
          b.state = 1; b.origin = res.origin; b.trees = new Float32Array(res.trees); b.vis = new Float32Array(res.vis); b.sun = sun; b.count = res.count; b.stale = serialAt !== this.serial; b.sunStale = false;
          if (forSun) this.sunDirty = true; else this.dirty = true;
        }).catch((e) => { if (gen === this.gen) this.asked--; b.asking = false; if (b.state === 0) this.blocks.delete(key); console.error(e); });
      }
    }
    if (this.frame % 600 === 0) for (const [key, b] of this.blocks) if (b.state === 1 && b.used < this.frame - 1200) this.blocks.delete(key);
    // the whole list when the eye has gone REBUILD_M, the close and near ones every few metres
    const make = toMake(this.dirty, this.builtAt.distanceToSquared(p), this.fineAt.distanceToSquared(p), fineStep(this.fraction, this.closeOn !== false, this.nearest, rig.onFoot ? (rig.footVel?.length() || 0) : rig.velocity.length()));
    if (make === 2) this._build(rig, radius); else if (make === 1) this._fine(p);
    // per frame: where the anchor is from the camera, the season, the wind's clock
    const u = this.shared;
    u.uAnchorRel.value.subVectors(this.anchor, p);
    u.uTreeRadius.value = this.reach;
    if (u.uGustPhase) u.uGustPhase.value = this._gustPhase();
  }

  // The gust's phase at the anchor (uGustPhase; TREE_VERT adds a tree's own from the anchor).
  // The gusts are a wave that runs along the wind; its phase is measured from a point O that
  // stays put while the lists are made again. Measured from the anchor itself, every tree's
  // phase jumped at each new anchor and every tree (and its shadow) lurched 13 to 22 cm at
  // once, every 25 m of a walk. O is taken again near each new anchor, a whole number of the
  // wave's lengths along the wind from where it was: no tree's phase changes then.
  _gustPhase() {
    const w = this.shared.uTreeWind.value, A = this.anchor, O = this._gustO, w2 = w.x * w.x + w.y * w.y + w.z * w.z;
    if (!(w2 > 1e-12)) return this.shared.uGustPhase.value;          // (no wind to run along)
    if (!this._gustSet) { this._gustSet = true; O.copy(A); this._gustAt.copy(A); }
    else if (!this._gustAt.equals(A)) {
      const along = (A.x - O.x) * w.x + (A.y - O.y) * w.y + (A.z - O.z) * w.z, wave = 2 * Math.PI / GUST_K;
      O.copy(A).addScaledVector(w, -(along - Math.round(along / wave) * wave) / w2);
      this._gustAt.copy(A);
    }
    const ph = ((A.x - O.x) * w.x + (A.y - O.y) * w.y + (A.z - O.z) * w.z) * GUST_K;
    return ph - 2 * Math.PI * Math.floor(ph / (2 * Math.PI));
  }

  // How many of a set's instances the shadow pass's fine tile draws (shadows/nearShadow.js,
  // tile 1, fineCount): the first ones, as many as hold every tree whose shadow can fall on
  // it. Read from where the tile is drawn this time (G.uShadowTile[1]: its middle, light
  // space from the camera) and the light's axes (G.uShadowMatrix's first two rows). A tree is
  // its trunk's line and everything within treeReach of it: as wide as its crown, as tall as
  // its tallest twig, and as much again as the wind can move its boughs and leaves. b:
  // castBound of the mesh it casts with. The lists are nearest first (the close and near ones
  // from the eye, the far one from the anchor), so the trees that can reach the tile's square,
  // 40 m across, come first: it drew every tree out to 240 m.
  fineCount(s, b) {
    const n = s.count;
    if (!n || !b) return n;
    const e = G.uShadowMatrix.value.elements, t = G.uShadowTile.value[1], R = 1 / t.z + 0.1;
    const lx0 = e[0], lx1 = e[4], lx2 = e[8], ly0 = e[1], ly1 = e[5], ly2 = e[9];
    const a = this.shared.uAnchorRel.value, up = this.shared.uTreeUp.value, W = this.shared.uTreeWind.value.w;
    // (the anchor from the tile's middle, and a metre up, in light space)
    const ax = a.x * lx0 + a.y * lx1 + a.z * lx2 - t.x, ay = a.x * ly0 + a.y * ly1 + a.z * ly2 - t.y;
    const ux = up.x * lx0 + up.y * lx1 + up.z * lx2, uy = up.x * ly0 + up.y * ly1 + up.z * ly2;
    const A = s.iA.array, B = s.iB.array;
    for (let i = n - 1; i >= 0; i--) {
      const k = 4 * i, h = A[k + 3], r = treeReach(b, h, B[k], W);
      const x = ax + A[k] * lx0 + A[k + 1] * lx1 + A[k + 2] * lx2, y = ay + A[k] * ly0 + A[k + 1] * ly1 + A[k + 2] * ly2;
      const x0 = x + ux * h * b.lo, x1 = x + ux * h * b.hi, y0 = y + uy * h * b.lo, y1 = y + uy * h * b.hi;
      if (Math.max(x0, x1) + r > -R && Math.min(x0, x1) - r < R && Math.max(y0, y1) + r > -R && Math.min(y0, y1) - r < R) return i + 1;
    }
    return 0;
  }

  // The whole list, from the blocks that are in, measured from an anchor at the traveller's
  // place: every tree within reach, nearest first; the far cards of every tree that may need
  // them before the list is made again (life/treeLod.js); then the close and near lists.
  _build(rig, radius) {
    this.dirty = false; this.builtAt.copy(rig.pos); this.builtMs = performance.now();          // (when: for the benchmark's hitch list, App.frameCause)
    const p = rig.pos, A = this.anchor.copy(p);
    localFrame([A.x, A.y, A.z], this._e, this._n, this._u);
    const u = this.shared;
    u.uTreeEast.value.set(...this._e); u.uTreeNorth.value.set(...this._n); u.uTreeUp.value.set(...this._u);
    for (const s of this.sets.flat(2)) s.count = 0;
    const r2 = nearListReach(radius) ** 2, { near: nearR } = radii(this.fraction, this.closeOn !== false);
    let names = new Map(), falling = 0, near = 0;
    // Every tree within reach, nearest first: the lists are filled in that order and the
    // meshes drawn close, near, far, so that what stands in front is drawn first and what
    // it hides is never shaded (a forest is layers of cut-out pixels).
    const list = this._list || (this._list = []); let n = 0;
    for (const b of this.blocks.values()) {
      if (b.state !== 1 || !b.count) continue;
      const ox = b.origin[0] - A.x, oy = b.origin[1] - A.y, oz = b.origin[2] - A.z, T = b.trees;
      if (ox * ox + oy * oy + oz * oz > (radius + 200) * (radius + 200)) continue;
      for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) {
        const x = ox + T[q], y = oy + T[q + 1], z = oz + T[q + 2], d2 = x * x + y * y + z * z;
        if (d2 > r2) continue;
        const e = list[n] || (list[n] = {}); n++;
        e.d2 = d2; e.x = x; e.y = y; e.z = z; e.b = b; e.k = k; e.q = q;
      }
    }
    list.length = n; list.sort((p, q) => p.d2 - q.d2);
    const blooming = [], shedding = [], tl = this._tl || (this._tl = {}), lat = this._lat = Math.asin(A.z / A.length()) * 180 / Math.PI;
    for (const e of list) {
      const T = e.b.trees, q = e.q, d2 = e.d2, sp = SPECIES[T[q + 6]];
      e.trio = this.sets[sp.arch][Math.min(VARIANTS - 1, Math.floor(((T[q + 7] * 7.31) % 1) * VARIANTS))];
      e.far = false; if (inFarList(d2, nearR)) { const set = e.trio[2]; if (set.count < set.cap) { this._put(set, e); e.far = true; } }
      if (sp.blossom) { const bl = bloomOf(sp, this.day + (T[q + 7] - 0.5) * 8, lat); if (bl.fall > 0 && blooming.length < 8 && d2 < 90 * 90) blooming.push({ x: e.x, y: e.y, z: e.z, tall: T[q + 3], wide: T[q + 4], fall: bl.fall, colour: sp.blossom.colour }); }
      // (the nearest trees whose leaves are coming off or lie under them: the list is nearest first)
      if (sp.fall && d2 < 90 * 90 && shedding.length < 12) {
        treeLook(sp, this.seasonDay, A.x + e.x, A.y + e.y, A.z + e.z, this.world.radius, T[q + 7], tl);
        if (tl.shed > 0.02 || tl.down > 0.03) shedding.push({ x: e.x, y: e.y, z: e.z, tall: T[q + 3], wide: T[q + 4], fall: tl.shed, down: tl.down, colour: [tl.r, tl.g, tl.b], litter: [tl.lr, tl.lg, tl.lb] });
      }
      if (d2 < 60 * 60) { names.set(sp.name, (names.get(sp.name) || 0) + 1); near++; if (sp.fall) falling++; }
    }
    this.shedding = shedding;                 // the nearest trees dropping their leaves, or with leaves lying under them (life/leaves.js, TreeLeaves)
    this.blooming = blooming;                 // the nearest trees in flower (from the anchor, m): the petals come off these (life/leaves.js)
    for (const trio of this.sets.flat()) this._send(trio[2]);
    this.falling = falling; this.near = near;          // (near: trees within 60 m, for the leaves that come off them)
    this.names = [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]).join(', ');
    this._fine(p);
  }

  // The close and near lists, by each tree's distance from the eye now (p: the eye, planet
  // axes). A few hundred trees: made again every few metres (life/treeLod.js, fineStep).
  _fine(p) {
    this.fineAt.copy(p);
    const A = this.anchor, ex = p.x - A.x, ey = p.y - A.y, ez = p.z - A.z, { close, near } = radii(this.fraction, this.closeOn !== false);
    this.closeInLists = close > 0;          // (which meshes cast the shadows: castMake)
    for (const trio of this.sets.flat()) trio[0].count = trio[1].count = 0;
    const reach2 = nearCandidates(near) ** 2, list = this._list || [], pick = this._pick || (this._pick = []);
    let n = 0, cut = 0, cutTris = 0, nearest2 = reach2;
    for (const e of list) {
      if (e.d2 >= reach2) break;              // (the list is nearest first from the anchor)
      const dx = e.x - ex, dy = e.y - ey, dz = e.z - ez, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < nearest2) nearest2 = d2;
      if (d2 >= near * near) continue;
      if (e.far) { cut++; cutTris += e.trio[2].tris; }          // (its far card is cut in the vertex shader)
      e.de2 = d2; pick[n++] = e;
    }
    pick.length = n; pick.sort((a, b) => a.de2 - b.de2);          // (nearest first: what stands in front is drawn first)
    for (const e of pick) {
      // (a list that is full hands the tree to the next simpler one; the far list's cards
      // are cut here, so a tree the near list has no room for is left out)
      let lod = makeOf(e.de2, close, near); while (lod < 2 && e.trio[lod].count >= e.trio[lod].cap) lod++;
      if (lod < 2) this._put(e.trio[lod], e);
    }
    this.shared.uLodCut.value.set(ex, ey, ez, Math.max(0, near - CUT_IN));
    this.nearest = Math.sqrt(nearest2);          // (the nearest tree's foot from the eye: how soon the makes are chosen again)
    let count = 0, tris = 0;
    for (const s of this.sets.flat(2)) {
      if (s.lod < 2) this._send(s);
      count += s.count; tris += s.count * s.tris;
    }
    this.count = count - cut; this.triangles = tris - cutTris;          // (trees drawn: the far cards cut inside the near radius are not)
  }

  // One tree into a list: where it stands from the anchor, its size, kind and colours.
  _put(set, e) {
    const T = e.b.trees, q = e.q, sp = SPECIES[T[q + 6]], own = T[q + 7], i = set.count++, A = set.iA.array, B = set.iB.array, D = set.iD.array, E = set.iE.array;
    A[i * 4] = e.x; A[i * 4 + 1] = e.y; A[i * 4 + 2] = e.z; A[i * 4 + 3] = T[q + 3];
    B[i * 4] = T[q + 4]; B[i * 4 + 1] = T[q + 5]; B[i * 4 + 2] = own;
    // (its leaves on this day: their colour, how much of them is off the tree, how far it is in
    // flower: the one answer, life/cover.js treeLook, from where the tree itself stands; the far
    // forest asks the same)
    const An = this.anchor, tl = treeLook(sp, this.seasonDay, An.x + e.x, An.y + e.y, An.z + e.z, this.world.radius, own, this._tl || (this._tl = {})), C = set.iC.array;
    C[i * 3] = tl.r; C[i * 3 + 1] = tl.g; C[i * 3 + 2] = tl.b; B[i * 4 + 3] = tl.gone;
    D[i * 4] = sp.trunk[0]; D[i * 4 + 1] = sp.trunk[1]; D[i * 4 + 2] = sp.trunk[2]; D[i * 4 + 3] = e.b.vis ? e.b.vis[e.k] : 1;
    if (sp.blossom) { E[i * 4] = sp.blossom.colour[0]; E[i * 4 + 1] = sp.blossom.colour[1]; E[i * 4 + 2] = sp.blossom.colour[2]; E[i * 4 + 3] = tl.open; }
    else { E[i * 4] = E[i * 4 + 1] = E[i * 4 + 2] = 0; E[i * 4 + 3] = -1; }
  }

  // A list's instances to the GPU (the part that is used).
  _send(s) {
    s.geo.instanceCount = s.count; s.mesh.visible = s.count > 0 && this.atlasReady && !this.hidden;
    for (const g of s.castGeos) g.instanceCount = s.count;
    if (s.count) { for (const a of [s.iA, s.iB, s.iC, s.iD, s.iE]) { a.clearUpdateRanges?.(); a.addUpdateRange?.(0, s.count * a.itemSize); a.needsUpdate = true; } }
  }

  // Governor: the trees' full shapes to a shorter distance (1: all the way); beyond it a
  // tree is its three cards. The radius stays: shortening it only handed the same cards
  // to the far forest and brought the line between the two nearer.
  setFraction(f) { if (f !== this.fraction) { this.fraction = f; this.dirty = true; } }
}
