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
import { makeTreeGeometries, VARIANTS } from './treeGeometry.js';
import { ATLAS_W, ATLAS_H } from './treeAtlasLayout.js';
import { EDGE0, EDGE1 } from './farTreeForm.js';
import { SPECIES, bloomOf } from './cover.js';
import { blockDeg, TREE_FLOATS, blockLon } from './treeBlock.js';
import { REBUILD_M, radii, fineStep, toMake, inFarList, nearCandidates, makeOf, CUT_IN } from './treeLod.js';

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
  return mix(c, dot(c, vec3(0.2, 0.7, 0.1)) * hue, 0.45);
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

export const TREE_VERT = /* glsl */`
in vec4 iA;            // xyz: the tree's foot from the anchor (m, planet axes), w: its height (m)
in vec4 iB;            // x: crown width, y: turn (radians), z: a number of its own (0..1), w: 1 if it drops its leaves
in float aLeaf; in vec2 aSway;      // aSway.x: how far the wind moves the vertex, y: how much it flutters (0 where a spray is held)
in vec2 aUv;            // where in the trees' picture (a card of foliage, a whole tree's card); -1: a plain face
uniform vec3 uAnchorRel, uTreeEast, uTreeNorth, uTreeUp;
uniform vec4 uTreeWind;      // xyz: where the wind blows to (unit), w: its speed (m/s)
uniform vec3 uSeason;        // x: how far the leaves have turned, y: how bare the branches are, z: time (s)
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
  float gone = (aLeaf > 0.5 && aLeaf < 2.5 ? 1.0 : 0.0) * min(iB.w, 1.0) * uSeason.y;         // (iB.w is 1 or 2 on trees that drop their leaves: which colour they turn)
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
  p.xz *= iB.x * (1.0 - 0.85 * gone) * edge;
  vec3 l = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c) * iA.w;
  // wind: the whole tree leans a little and its crown swings, gust by gust, each tree in
  // its own time; more the higher and the farther out a leaf is
  float gust = 0.6 + 0.4 * sin(uSeason.z * 0.7 + dot(iA.xyz, uTreeWind.xyz) * 0.05 + iB.z * 6.28);
  float swing = sin(uSeason.z * (1.6 + iB.z) + iB.z * 40.0 + p.y * 3.0) * 0.5 + 0.5 * sin(uSeason.z * 3.7 + iB.z * 17.0 + p.x * 9.0);
  float bend = aSway.x * iA.w * (0.004 * uTreeWind.w * gust + 0.0025 * uTreeWind.w * swing);
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
  if (aLeaf > 1.5 && aLeaf < 3.5) { float ph = dot(position, vec3(41.0, 57.0, 73.0)) + iB.z * 31.0, amp = aSway.y * iA.w * (0.0012 + 0.0009 * uTreeWind.w); flutter = (uTreeEast * sin(uSeason.z * 7.3 + ph) + uTreeUp * sin(uSeason.z * 9.1 + ph * 1.7) + uTreeNorth * sin(uSeason.z * 6.1 + ph * 0.6)) * amp; }
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
      ...lightingUniforms(), ...TREE_SHADE_UNIFORMS,
      uAnchorRel: { value: new THREE.Vector3() }, uTreeEast: { value: new THREE.Vector3(1, 0, 0) }, uTreeNorth: { value: new THREE.Vector3(0, 1, 0) }, uTreeUp: { value: new THREE.Vector3(0, 0, 1) },
      uTreeWind: terrain.shared.uWind, uSeason: { value: new THREE.Vector3() }, uTreeRadius: { value: 240 }, uLodCut: { value: new THREE.Vector4(0, 0, 0, 0) },
      tTreeAtlas: { value: null },
    };
    // The trees' picture (made by scripts/make-tree-atlas.mjs). Until it has come, no tree is drawn.
    this.atlasReady = false;
    loadAtlas((import.meta.env?.BASE_URL ?? '/') + 'data/tree_atlas.png').then((t) => {
      this.renderer?.initTexture(t);              // (to the GPU now, between frames, if the renderer is known by then)
      this.shared.tTreeAtlas.value = t; this.atlasReady = true; this.dirty = true;
    }).catch((e) => console.error(e));
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.shared, side: THREE.DoubleSide,
      vertexShader: /* glsl */`${TREE_VERT}
        in vec3 iC; in vec4 iD;          // (iD.w: how much of the Sun the land leaves this tree, from the worker)
        in vec4 iE;                      // rgb: its petals' colour, w: how far in flower it is (0..1; -1: a tree that never flowers)
        out vec4 vBloom; out vec2 vTall;  // (vTall: the tree's height in metres; how bare it is)
        out vec3 vRel; out vec3 vN; out vec3 vLeafC; out vec3 vTrunkC; out float vLeaf; out float vY; out vec2 vOwn; out vec3 vTreeM; out vec2 vUv; out float vCloud;
        ${TREE_SHADE_VERT}
        void main() {
          vec3 foot; float leaf;
          vec3 rel = treePosition(foot, leaf);
          // (beyond the radius the far forest draws this tree: out of the picture here)
          if (treeCull) { vCloud = 1.0; vRel = vec3(0.0); vN = vec3(0.0, 0.0, 1.0); vLeafC = vec3(0.0); vTrunkC = vec3(0.0); vLeaf = 0.0; vY = 0.0; vOwn = vec2(0.0); vTreeM = vec3(0.0); vUv = vec2(0.0); vBloom = vec4(0.0); vTall = vec2(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vTreeM = vec3(position.x * iB.x, position.y, position.z * iB.x) * iA.w + iB.z * 37.0;        // metres in the tree's own frame (for the pattern of its leaves)
          vRel = rel; vN = treeNormal(); vLeaf = leaf; vY = position.y; vLeafC = iC; vTrunkC = iD.rgb; vOwn = vec2(iB.z, iB.w); vUv = aUv; vBloom = iE; vTall = vec2(iA.w, aLeaf < 3.5 ? min(iB.w, 1.0) * uSeason.y : 0.0);
          vCloud = cloudShade(foot + uTreeUp * (iA.w * 0.7)) * iD.w;          // (the clouds' shadow, from the map of it: life/treeShade.js)
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform vec3 uSeason;
        uniform sampler2D tTreeAtlas;        // sprays of foliage and whole trees, as cut-outs: r cover, g tone, b wood (life/treeAtlasGen.js)
        in vec3 vRel; in vec3 vN; in vec3 vLeafC; in vec3 vTrunkC; in float vLeaf; in float vY; in vec2 vOwn; in vec3 vTreeM; in vec2 vUv; in float vCloud; in vec4 vBloom; in vec2 vTall;
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
        ${BARK}
        void main() {
          // (a pixel's footprint in the trees' coordinates, here before anything is thrown away:
          // a derivative is only sure where every pixel round it is still being drawn)
          vec2 uvW = fwidth(vUv);
          // A card: cut out of the picture first of all (most of a card is nothing). Far off the
          // cut is taken lower: averaged down, needles and leaves cover less of a pixel, and a
          // tree would thin to nothing.
          bool card = vUv.x >= 0.0; vec3 cut = vec3(1.0, 0.8, 0.0);
          if (card) {
            cut = texture(tTreeAtlas, vUv).rgb;
            vec2 px = vUv * vec2(${ATLAS_W}.0, ${ATLAS_H}.0);
            float lod = 0.5 * log2(max(max(dot(dFdx(px), dFdx(px)), dot(dFdy(px), dFdy(px))), 1.0));
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
            if (petal <= 0.5 && h < vTall.y * 1.05) discard;
          }
          if (!card && vLeaf > 0.5 && vTall.y > 0.5) discard;
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel);
          vec3 N = normalize(vN);
          if (vLeaf < 0.5) N *= sign(dot(N, V));                // (trunks are open tubes: light the side that is seen)
          // (a plain leaf seen from its under side: the side that looks away from the sky)
          float under = vLeaf > 0.5 && !card && dot(N, V) < 0.0 ? 1.0 : 0.0;
          // leaves in their season: green, then each tree's own gold, orange or red
          float turn = vOwn.y > 0.5 ? clamp(uSeason.x * 1.6 - vOwn.x * 0.6, 0.0, 1.0) : 0.0;
          vec3 autumn = vOwn.y > 1.5 ? vec3(0.42, 0.26, 0.03) : mix(vec3(0.40, 0.20, 0.03), vec3(0.30, 0.045, 0.02), smoothstep(0.35, 0.8, fract(vOwn.x * 7.3)));
          // (a crown is leaves and the gaps between them: as a surface it is darker than a leaf)
          vec3 leafC = mix(vLeafC * (0.5 + 0.22 * fract(vOwn.x * 13.7)), autumn * 0.6, turn);
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
          float paleT = step(0.4, dot(vTrunkC, vec3(0.333)));
          vec3 albedo = wood ? (card || vLeaf > 0.1 ? twigC : vTrunkC * mix(0.28, 0.6, paleT)) : leafC;
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
          vec3 sun = directSun(planetPos) * shadow;
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
          vec3 glow = !wood ? leafC * directSun(planetPos) * (0.07 * smoothstep(0.0, 0.25, dot(up, uSunDir))) * vec3(0.9, 1.2, 0.5) : vec3(0.0);
          vec3 col = (albedo * (sun * lit + skyLight(N, up) * open + planetShine(N)) + leafC * sun * through * vec3(1.1, 1.25, 0.6) + glow) / PI;
          col = aerialPerspective(forestAir(col, vRel, up, 1.0), vRel);
          fragColor = vec4(col * uExposure, 1.0);
        }`,
    });
    this.depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, colorWrite: false, uniforms: this.shared, side: THREE.DoubleSide, defines: { TREE_DEPTH: 1 },
      vertexShader: /* glsl */`${TREE_VERT}
        in vec4 iE;
        out float vLeaf; out vec2 vUv; out float vBare; out vec2 vBloom;
        void main() {
          vBloom = vec2(iE.w, aLeaf < 3.5 ? min(iB.w, 1.0) * uSeason.y : 0.0);
          vec3 foot; float leaf; vec3 rel = treePosition(foot, leaf);
          gl_Position = treeCull ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(rel, 1.0); vLeaf = leaf; vUv = aUv;
          // (a whole tree's card keeps its leaves in winter: its shadow then is thinned instead)
          vBare = aLeaf > 3.5 ? min(iB.w, 1.0) * uSeason.y : 0.0;
        }`,
      // (a crown lets some of the Sun through: its shadow is flecked, not solid)
      fragmentShader: /* glsl */`${TREE_WOOD}
        uniform sampler2D tTreeAtlas; in float vLeaf; in vec2 vUv; in float vBare; in vec2 vBloom; layout(location = 0) out vec4 fragColor;
        void main() {
          if (vUv.x >= 0.0) {
            vec3 cut = texture(tTreeAtlas, vUv).rgb;
            if (cut.r < 0.3) discard;
            // (leaves of a bare one, as the picture pass leaves them out; a tree's petals while it
            // is in flower are kept, and out of flower they are leaves, as in the picture pass)
            bool wood = treeWood(cut), open = cut.b > 0.25 && !wood && vBloom.x >= 0.5;
            if (!open && !wood && vBloom.y > 0.5) discard;
          } else if (vLeaf > 0.5 && vBloom.y > 0.5) discard;
          // (which pixels: scattered, not in rows; the shadow's soft edge blends them)
          uvec2 q = uvec2(gl_FragCoord.xy); uint h = q.x * 1597334677u ^ q.y * 3812015801u; h ^= h >> 15; h *= 2246822507u; h ^= h >> 13;
          if (vLeaf > 0.5 && float(h & 255u) < 80.0 + 150.0 * vBare) discard;
          fragColor = vec4(1.0);
        }`,
    });
    // one mesh per shape, variant and distance: [shape][variant][0 close, 1 near, 2 far]
    this.sets = this.geos.map((variants) => variants.map((pair) => pair.map((base, lod) => {
      const cap = [CLOSE_CAP, NEAR_CAP, FAR_CAP][lod], geo = new THREE.InstancedBufferGeometry();
      for (const name of ['position', 'normal', 'aLeaf', 'aSway', 'aUv']) geo.setAttribute(name, base.attributes[name]);
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
    // What casts a tree's shadow: the next simpler mesh of the same tree (the nearest trees
    // cast as their near mesh, those farther as their far mesh: two crossed pictures of
    // the tree and a rosette in its crown). The shadow pass was drawing every spray of
    // every tree within 150 m, as many triangles again as the view itself, into a map
    // whose texels are 15 cm. set.cast: the mesh the shadow pass draws for the set.
    for (const variants of this.sets) for (const trio of variants) trio.forEach((s, lod) => {
      const src = trio[Math.min(2, lod + 1)];
      if (src === s) { s.cast = s.mesh; return; }
      const g = new THREE.InstancedBufferGeometry();
      for (const name of ['position', 'normal', 'aLeaf', 'aSway', 'aUv']) g.setAttribute(name, src.geo.attributes[name]);
      g.setAttribute('iA', s.iA); g.setAttribute('iB', s.iB); g.setAttribute('iE', s.iE); g.setAttribute('iF', s.iF);
      g.instanceCount = 0;
      s.castGeo = g; s.cast = new THREE.Mesh(g, this.depthMaterial); s.cast.frustumCulled = false;
    });
    this.meshes = this.sets.flat(2).map((s) => s.mesh);
    this.blocks = new Map();                 // 'bi:bj' -> { state: 0 asked, 1 ready, origin, trees, count, used }
    this.asked = 0; this.frame = 0; this.serial = -1;
    this.anchor = new THREE.Vector3(); this.builtAt = new THREE.Vector3(1e12, 0, 0); this.fineAt = new THREE.Vector3(1e12, 0, 0); this.nearest = 0; this.dirty = false;
    this.fraction = 1; this.shadowsFar = true; this.count = 0; this.triangles = 0; this.reach = 0;
    this.names = '';                          // the species standing nearest, for anyone who asks
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0];
    this.setWorld(world);
  }

  setWorld(world) {
    this.world = world; this.def = world.life?.trees || null;
    this.blocks.clear(); this.asked = 0; this.gen = (this.gen || 0) + 1; this.sunStale = 0; this.sunDirty = false; this.dirty = true; this.serial = -1;
    this.shared.uSeason.value.set(0, 0, 0);
    for (const s of this.sets.flat(2)) { s.count = 0; s.geo.instanceCount = 0; if (s.castGeo) s.castGeo.instanceCount = 0; s.mesh.visible = false; }
    this.count = 0; this.triangles = 0; this.names = ''; this.falling = 0; this.reach = 0; this.blooming = []; this.day = 0;
  }

  // True while blocks that are wanted have not arrived (screenshots wait for them).
  get busy() { return !!this.def && (this.asked > 0 || this.missing > 0 || this.sunStale > 0 || !this.atlasReady); }

  // Every frame. rig: the camera rig; day: the day of the year (0..365.25); time (s).
  update(rig, day, time) {
    this.frame++; this.missing = 0; this.sunStale = 0;
    if (Math.floor(day) !== Math.floor(this.day)) this.dirty = true;          // (a new day: the trees in flower are a day further on)
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
      const y = (((day - 80) / 365.25 + (lat < 0 ? 0.5 : 0)) % 1 + 1) % 1, sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
      const far = sm(25, 38, Math.abs(lat)), bare = (y > 0.5 ? sm(0.62, 0.72, y) : 1 - sm(0.02, 0.12, y)) * far;
      this.shared.uSeason.value.set(sm(0.46, 0.62, y) * (y > 0.4 ? 1 : 0) * far, bare, time);
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
  }

  // The whole list, from the blocks that are in, measured from an anchor at the traveller's
  // place: every tree within reach, nearest first; the far cards of every tree that may need
  // them before the list is made again (life/treeLod.js); then the close and near lists.
  _build(rig, radius) {
    this.dirty = false; this.builtAt.copy(rig.pos);
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
    const blooming = [], lat = this._lat = Math.asin(A.z / A.length()) * 180 / Math.PI;
    for (const e of list) {
      const T = e.b.trees, q = e.q, d2 = e.d2, sp = SPECIES[T[q + 6]];
      e.trio = this.sets[sp.arch][Math.min(VARIANTS - 1, Math.floor(((T[q + 7] * 7.31) % 1) * VARIANTS))];
      e.far = false; if (inFarList(d2, nearR)) { const set = e.trio[2]; if (set.count < set.cap) { this._put(set, e); e.far = true; } }
      if (sp.blossom) { const bl = bloomOf(sp, this.day + (T[q + 7] - 0.5) * 8, lat); if (bl.fall > 0 && blooming.length < 8 && d2 < 90 * 90) blooming.push({ x: e.x, y: e.y, z: e.z, tall: T[q + 3], wide: T[q + 4], fall: bl.fall, colour: sp.blossom.colour }); }
      if (d2 < 60 * 60) { names.set(sp.name, (names.get(sp.name) || 0) + 1); near++; if (sp.fall) falling++; }
    }
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
    B[i * 4] = T[q + 4]; B[i * 4 + 1] = T[q + 5]; B[i * 4 + 2] = own; B[i * 4 + 3] = sp.fall;
    set.iC.array.set(sp.leaf, i * 3); D[i * 4] = sp.trunk[0]; D[i * 4 + 1] = sp.trunk[1]; D[i * 4 + 2] = sp.trunk[2]; D[i * 4 + 3] = e.b.vis ? e.b.vis[e.k] : 1;
    // (in flower: each tree a few days before or after its neighbours)
    if (sp.blossom) { const bl = bloomOf(sp, this.day + (own - 0.5) * 8, this._lat); E[i * 4] = sp.blossom.colour[0]; E[i * 4 + 1] = sp.blossom.colour[1]; E[i * 4 + 2] = sp.blossom.colour[2]; E[i * 4 + 3] = bl.open; }
    else { E[i * 4] = E[i * 4 + 1] = E[i * 4 + 2] = 0; E[i * 4 + 3] = -1; }
  }

  // A list's instances to the GPU (the part that is used).
  _send(s) {
    s.geo.instanceCount = s.count; s.mesh.visible = s.count > 0 && this.atlasReady && !this.hidden;
    if (s.castGeo) s.castGeo.instanceCount = s.count;
    if (s.count) { for (const a of [s.iA, s.iB, s.iC, s.iD, s.iE]) { a.clearUpdateRanges?.(); a.addUpdateRange?.(0, s.count * a.itemSize); a.needsUpdate = true; } }
  }

  // Governor: the trees' full shapes to a shorter distance (1: all the way); beyond it a
  // tree is its three cards. The radius stays: shortening it only handed the same cards
  // to the far forest and brought the line between the two nearer.
  setFraction(f) { if (f !== this.fraction) { this.fraction = f; this.dirty = true; } }
}
