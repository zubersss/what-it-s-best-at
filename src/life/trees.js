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
import { HEAP_GLSL } from '../sky/clouds.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';
import { makeTreeGeometries, VARIANTS } from './treeGeometry.js';
import { ATLAS_W, ATLAS_H } from './treeAtlasLayout.js';
import { SPECIES } from './cover.js';
import { blockDeg, TREE_FLOATS, blockLon } from './treeBlock.js';

const CLOSE_CAP = 192, NEAR_CAP = 768, FAR_CAP = 4096;       // instances of one shape: close, near and far mesh
const CLOSE_M = 42, NEAR_M = 115;             // trees nearer than these get the close mesh (every leaf), the near mesh
const REBUILD_M = 25;                        // the instance lists are made again when the traveller has moved this far

// The painted look's leaf: a cleaner green of the tree's own kind, warm for broad leaves, a
// cold blue-green for firs and spruces, told by the colour the species has. (The far trees
// of life/farForest.js take it from here: the two must be one green.)
export const PAINT_LEAF = /* glsl */`
vec3 paintLeaf(vec3 c) {
  vec3 hue = mix(vec3(0.62, 1.0, 0.36), vec3(0.36, 1.0, 0.62), smoothstep(-0.2, 0.2, (c.b - c.r) / max(c.g, 1e-4)));
  return mix(c, dot(c, vec3(0.2, 0.7, 0.1)) * hue, 0.45);
}`;

// The clouds' shadow on a tree, by the ground's own rule and from the ground's own numbers
// (terrainMaterial.js, its light): the cloud between the crown and the Sun, once per tree
// in the vertex shader (a heap is hundreds of metres across). The trees one walks among and
// the far forest both read it here; the uniforms are the ground's own objects, so a saving
// that takes the shadow off the ground takes it off the trees.
export const CLOUD_SHADE_VERT = /* glsl */`
uniform vec3 uCamPlanetPos, uSunDir;
uniform sampler2D tClouds;
precision highp sampler3D;
uniform sampler3D tCloudNoise;
uniform vec4 uCloud, uCloudHeap;
uniform vec3 uCloudVol, uCloudWind;
${HEAP_GLSL}
float cloudShade(vec3 planetPos) {
  float r = length(planetPos);
  if (uCloud.x <= 0.0 || r >= uCloud.y) return 1.0;
  vec3 uc = normalize(planetPos + uSunDir * ((uCloud.y - r) / max(dot(planetPos / r, uSunDir), 0.08)));
  float cd = textureLod(tClouds, vec2(atan(uc.y, uc.x) * 0.15915494 + uCloud.z, acos(clamp(uc.z, -1.0, 1.0)) * 0.31830989), 0.0).r;
  float shade = smoothstep(0.2, 0.7, cd);
  if (uCloudHeap.w > 0.5) { float cc, hp = cloudHeap(tCloudNoise, uc, cd, uCloudHeap.x, uCloudHeap.y, uCloudVol, uCloudWind, 0.0, cc); shade = 0.85 * smoothstep(0.06, 0.42, hp); }
  return 1.0 - uCloud.x * shade;
}`;
export const cloudShadeUniforms = (terrain) => ({
  tClouds: terrain.shared.tClouds, uCloud: terrain.shared.uCloud, tCloudNoise: terrain.shared.tCloudNoise,
  uCloudHeap: terrain.shared.uCloudHeap, uCloudVol: terrain.shared.uCloudVol, uCloudWind: terrain.shared.uCloudWind,
});

const TREE_VERT = /* glsl */`
in vec4 iA;            // xyz: the tree's foot from the anchor (m, planet axes), w: its height (m)
in vec4 iB;            // x: crown width, y: turn (radians), z: a number of its own (0..1), w: 1 if it drops its leaves
in float aLeaf, aSway;
in vec2 aUv;            // where in the trees' picture (a card of foliage, a whole tree's card); -1: a plain face
uniform vec3 uAnchorRel, uTreeEast, uTreeNorth, uTreeUp;
uniform vec4 uTreeWind;      // xyz: where the wind blows to (unit), w: its speed (m/s)
uniform vec3 uSeason;        // x: how far the leaves have turned, y: how bare the branches are, z: time (s)
uniform float uTreeRadius;
bool treeCull;                // set by treePosition: this tree is the far forest's to draw
vec3 treePosition(out vec3 foot, out float leaf) {
  foot = uAnchorRel + iA.xyz;
  float c = cos(iB.y), s = sin(iB.y);
  vec3 p = position;
  // bare in winter: the leaves draw in to the branches (the trunk stays)
  float gone = (aLeaf > 0.5 && aLeaf < 3.5 ? 1.0 : 0.0) * min(iB.w, 1.0) * uSeason.y;         // (iB.w is 1 or 2 on trees that drop their leaves: which colour they turn)
  p.xz *= iB.x * (1.0 - 0.85 * gone);
  vec3 l = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c) * iA.w;
  // wind: the whole tree leans a little and its crown swings, gust by gust, each tree in
  // its own time; more the higher and the farther out a leaf is
  float gust = 0.6 + 0.4 * sin(uSeason.z * 0.7 + dot(iA.xyz, uTreeWind.xyz) * 0.05 + iB.z * 6.28);
  float swing = sin(uSeason.z * (1.6 + iB.z) + iB.z * 40.0 + p.y * 3.0) * 0.5 + 0.5 * sin(uSeason.z * 3.7 + iB.z * 17.0 + p.x * 9.0);
  float bend = aSway * iA.w * (0.004 * uTreeWind.w * gust + 0.0025 * uTreeWind.w * swing);
  // The far forest (life/farForest.js) draws the very same trees beyond this radius, with
  // the same picture at the same size: the two are cut against each other by distance from
  // the eye, and a tree is drawn by exactly one of them. (They used to shrink away over the
  // last 14 % of the radius, from when nothing stood beyond it.)
  treeCull = length(foot) > uTreeRadius;
  float fade = 1.0;
  leaf = aLeaf;
  // (single leaves flutter, each in its own time, harder the harder it blows)
  vec3 flutter = vec3(0.0);
  if (aLeaf > 1.5 && aLeaf < 3.5) { float ph = dot(position, vec3(41.0, 57.0, 73.0)) + iB.z * 31.0, amp = iA.w * (0.0012 + 0.0009 * uTreeWind.w); flutter = (uTreeEast * sin(uSeason.z * 7.3 + ph) + uTreeUp * sin(uSeason.z * 9.1 + ph * 1.7) + uTreeNorth * sin(uSeason.z * 6.1 + ph * 0.6)) * amp; }
  return foot + (uTreeEast * l.x + uTreeUp * l.y + uTreeNorth * l.z + uTreeWind.xyz * bend + flutter) * fade;
}
vec3 treeNormal() {
  float c = cos(iB.y), s = sin(iB.y);
  vec3 n = normal;
  return normalize(uTreeEast * (n.x * c - n.z * s) + uTreeUp * n.y + uTreeNorth * (n.x * s + n.z * c));
}`;

export class Trees {
  constructor(world, terrain) {
    this.terrain = terrain;
    this.geos = makeTreeGeometries();
    this.shared = {
      ...lightingUniforms(), ...cloudShadeUniforms(terrain),
      uAnchorRel: { value: new THREE.Vector3() }, uTreeEast: { value: new THREE.Vector3(1, 0, 0) }, uTreeNorth: { value: new THREE.Vector3(0, 1, 0) }, uTreeUp: { value: new THREE.Vector3(0, 0, 1) },
      uTreeWind: terrain.shared.uWind, uSeason: { value: new THREE.Vector3() }, uTreeRadius: { value: 240 },
      tTreeAtlas: { value: null },
    };
    // The trees' picture (made by scripts/make-tree-atlas.mjs). Until it has come, no tree is drawn.
    this.atlasReady = false;
    new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'data/tree_atlas.png', (t) => {
      t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
      this.renderer?.initTexture(t);              // (to the GPU now, between frames, if the renderer is known by then)
      this.shared.tTreeAtlas.value = t; this.atlasReady = true; this.dirty = true;
    });
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.shared, side: THREE.DoubleSide,
      vertexShader: /* glsl */`${TREE_VERT}
        in vec3 iC; in vec4 iD;          // (iD.w: how much of the Sun the land leaves this tree, from the worker)
        out vec3 vRel; out vec3 vN; out vec3 vLeafC; out vec3 vTrunkC; out float vLeaf; out float vY; out vec2 vOwn; out vec3 vTreeM; out vec2 vUv; out float vCloud;
        ${CLOUD_SHADE_VERT}
        void main() {
          vec3 foot; float leaf;
          vec3 rel = treePosition(foot, leaf);
          // (beyond the radius the far forest draws this tree: out of the picture here)
          if (treeCull) { vCloud = 1.0; vRel = vec3(0.0); vN = vec3(0.0, 0.0, 1.0); vLeafC = vec3(0.0); vTrunkC = vec3(0.0); vLeaf = 0.0; vY = 0.0; vOwn = vec2(0.0); vTreeM = vec3(0.0); vUv = vec2(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vTreeM = vec3(position.x * iB.x, position.y, position.z * iB.x) * iA.w + iB.z * 37.0;        // metres in the tree's own frame (for the pattern of its leaves)
          vRel = rel; vN = treeNormal(); vLeaf = leaf; vY = position.y; vLeafC = iC; vTrunkC = iD.rgb; vOwn = vec2(iB.z, iB.w); vUv = aUv;
          vCloud = cloudShade(uCamPlanetPos + foot + uTreeUp * (iA.w * 0.7)) * iD.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform vec3 uSeason;
        uniform sampler2D tTreeAtlas;        // sprays of foliage and whole trees, as cut-outs: r cover, g tone, b wood (life/treeAtlasGen.js)
        in vec3 vRel; in vec3 vN; in vec3 vLeafC; in vec3 vTrunkC; in float vLeaf; in float vY; in vec2 vOwn; in vec3 vTreeM; in vec2 vUv; in float vCloud;
        layout(location = 0) out vec4 fragColor;
        float leafHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        // bunches of leaves: cells about 40 cm across, each a tone of its own
        float leafCells(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(leafHash(i), leafHash(i + vec3(1, 0, 0)), f.x), mix(leafHash(i + vec3(0, 1, 0)), leafHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(leafHash(i + vec3(0, 0, 1)), leafHash(i + vec3(1, 0, 1)), f.x), mix(leafHash(i + vec3(0, 1, 1)), leafHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        ${PAINT_LEAF}
        void main() {
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
          bool wood = card ? cut.b > 0.5 : vLeaf < 0.5;
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
          }
          // (the heart of a bunch: the dark inside of the crown, see Shape.heart in treeGeometry.js)
          bool heart = (vLeaf > 3.1 && vLeaf < 3.5) || (vLeaf > 1.1 && vLeaf < 1.5);
          if (vLeaf > 3.1 && vLeaf < 3.5) leafC *= 0.5;
          vec3 albedo = wood ? vTrunkC * 0.6 : leafC;
          // (bark near by: furrows running up the trunk, wandering a little; and a trunk is
          // round even in the shade of the wood, where no light says so: darker toward its edges)
          if (wood && !card) {
            albedo *= mix(0.66, 1.0, smoothstep(0.1, 0.65, abs(dot(N, V))));
            float dW = length(vRel);
            if (dW < 60.0) { vec2 q = vTreeM.xz - vOwn.x * 37.0; float a = atan(q.y, q.x); albedo *= 1.0 - 0.38 * smoothstep(0.5, 0.8, abs(fract(a * 1.7507 + 0.32 * sin(vTreeM.y * 1.3 + a * 2.0)) - 0.5) * 2.0) * (1.0 - smoothstep(25.0, 60.0, dW)); }
          }
          if (uPaint.x > 0.0 && wood && dot(vTrunkC, vec3(0.333)) > 0.4) albedo *= 1.0 - 0.75 * step(0.8, fract(vY * 31.0 + vOwn.x * 9.0)) * step(0.35, fract(vY * 7.7 + vOwn.x * 3.0));
          // (the shadow is asked for a little outside the crown: on a mass of a few faces the
          // shadow map would draw the faces)
          float shadow = nearShadow(vRel + N * (wood ? 0.05 : 0.45), N) * vCloud;
          vec3 sun = directSun(planetPos) * shadow;
          // a crown is not a wall: light wraps round it, and some comes through from behind
          float nl = dot(N, uSunDir), lit = !wood ? max(nl * 0.7 + 0.3, 0.0) : max(nl, 0.0);
          if (uPaint.x > 0.0) { lit = mix(lit, paintLit(!wood ? nl * 0.75 + 0.25 : nl) * PI, uPaint.x); albedo = paintColour(albedo); leafC = paintColour(leafC); }
          // (and seen against the Sun, foliage glows: the light comes through needles and leaves)
          float through = wood || heart ? 0.0 : max(-nl, 0.0) * 0.28 + (card ? 0.4 * pow(max(dot(-V, uSunDir), 0.0), 4.0) : 0.0);
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
      glslVersion: THREE.GLSL3, colorWrite: false, uniforms: this.shared, side: THREE.DoubleSide,
      vertexShader: /* glsl */`${TREE_VERT}
        out float vLeaf; out vec2 vUv; out float vBare;
        void main() {
          vec3 foot; float leaf; vec3 rel = treePosition(foot, leaf);
          gl_Position = treeCull ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(rel, 1.0); vLeaf = leaf; vUv = aUv;
          // (a whole tree's card keeps its leaves in winter: its shadow then is thinned instead)
          vBare = aLeaf > 3.5 ? min(iB.w, 1.0) * uSeason.y : 0.0;
        }`,
      // (a crown lets some of the Sun through: its shadow is flecked, not solid)
      fragmentShader: /* glsl */`uniform sampler2D tTreeAtlas; in float vLeaf; in vec2 vUv; in float vBare; layout(location = 0) out vec4 fragColor;
        void main() {
          if (vUv.x >= 0.0 && texture(tTreeAtlas, vUv).r < 0.3) discard;
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
      const iA = at(4), iB = at(4), iC = at(3), iD = at(4);
      geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iC', iC); geo.setAttribute('iD', iD);
      geo.instanceCount = 0;
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = false; mesh.visible = false;
      return { geo, mesh, cap, iA, iB, iC, iD, count: 0, tris: base.attributes.position.count / 3, lod };
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
      g.setAttribute('iA', s.iA); g.setAttribute('iB', s.iB);
      g.instanceCount = 0;
      s.castGeo = g; s.cast = new THREE.Mesh(g, this.depthMaterial); s.cast.frustumCulled = false;
    });
    this.meshes = this.sets.flat(2).map((s) => s.mesh);
    this.blocks = new Map();                 // 'bi:bj' -> { state: 0 asked, 1 ready, origin, trees, count, used }
    this.asked = 0; this.frame = 0; this.serial = -1;
    this.anchor = new THREE.Vector3(); this.builtAt = new THREE.Vector3(1e12, 0, 0); this.dirty = false;
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
    this.count = 0; this.triangles = 0; this.names = ''; this.falling = 0; this.reach = 0;
  }

  // True while blocks that are wanted have not arrived (screenshots wait for them).
  get busy() { return !!this.def && (this.asked > 0 || this.missing > 0 || this.sunStale > 0 || !this.atlasReady); }

  // Every frame. rig: the camera rig; day: the day of the year (0..365.25); time (s).
  update(rig, day, time) {
    this.frame++; this.missing = 0; this.sunStale = 0;
    const def = this.def, t = this.terrain;
    if (!def) return;
    const R = this.world.radius, radius = (def.radius ?? 240) * this.fraction;
    // Above the radius itself no tree can be within it of the eye (the cut is a sphere round
    // the eye, and the far forest draws everything outside it): blocks are not even asked
    // for up there. `reach`: how far these trees reach from the eye, 0 when none are drawn —
    // the far forest and the raised canopy both start where this ends.
    const show = rig.agl < Math.min(def.below ?? 1500, radius) && !!t.coverSerial;
    this.reach = show ? radius : 0;
    for (const s of this.sets.flat(2)) s.mesh.visible = show && s.count > 0 && this.atlasReady;
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
    const bi0 = Math.floor(lat / DEG), nb = Math.ceil((radius + REBUILD_M + 5) / 111.2);
    let want = null, wantD = 1e9, sunWant = null, sunD = 1e9; const sunNow = this.shared.uSunDir.value, now = performance.now(), sweep = now - (this.sweepAt || 0) > 1000;
    this.sunStale = 0;
    for (let bi = bi0 - nb; bi <= bi0 + nb; bi++) {
      const dLon = blockLon(bi, DEG), count = Math.round(360 / dLon), bj0 = Math.floor(lon / dLon);
      for (let bu = bj0 - nb; bu <= bj0 + nb; bu++) {
        // (the block's middle, in metres from the traveller along the ground)
        const dy = ((bi + 0.5) * DEG - lat) * M, dx = ((bu + 0.5) * dLon - lon) * M * Math.cos(lat * Math.PI / 180), d = Math.hypot(dx, dy);
        if (d > radius + 80 + REBUILD_M + 5) continue;
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
        if (d < wantD) { wantD = d; want = [bi, bj, key]; }
      }
    }
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
    if (this.dirty || this.builtAt.distanceToSquared(p) > REBUILD_M * REBUILD_M) this._build(rig, radius);
    // per frame: where the anchor is from the camera, the season, the wind's clock
    const u = this.shared;
    u.uAnchorRel.value.subVectors(this.anchor, p);
    u.uTreeRadius.value = radius;
  }

  // The instance lists, from the blocks that are in: near trees to the near meshes, the
  // rest to the far ones, all measured from an anchor at the traveller's place.
  _build(rig, radius) {
    this.dirty = false; this.builtAt.copy(rig.pos);
    const p = rig.pos, A = this.anchor.copy(p);
    localFrame([A.x, A.y, A.z], this._e, this._n, this._u);
    const u = this.shared;
    u.uTreeEast.value.set(...this._e); u.uTreeNorth.value.set(...this._n); u.uTreeUp.value.set(...this._u);
    for (const s of this.sets.flat(2)) s.count = 0;
    const r2 = (radius + REBUILD_M + 5) ** 2,          // (the list must hold every tree that can come within the radius before it is made again: the cut at the radius is by distance from the eye, and the far forest draws nothing inside it)
       near2 = NEAR_M * NEAR_M, close2 = CLOSE_M * CLOSE_M * (this.closeOn === false ? 0 : 1);
    let nearest = 1e9, names = new Map(), falling = 0, near = 0;
    for (const b of this.blocks.values()) {
      if (b.state !== 1 || !b.count) continue;
      const ox = b.origin[0] - A.x, oy = b.origin[1] - A.y, oz = b.origin[2] - A.z, T = b.trees;
      if (ox * ox + oy * oy + oz * oz > (radius + 200) * (radius + 200)) continue;
      for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) {
        const x = ox + T[q], y = oy + T[q + 1], z = oz + T[q + 2], d2 = x * x + y * y + z * z;
        if (d2 > r2) continue;
        const sp = SPECIES[T[q + 6]], own = T[q + 7], set = this.sets[sp.arch][Math.min(VARIANTS - 1, Math.floor(((own * 7.31) % 1) * VARIANTS))][d2 < close2 ? 0 : d2 < near2 ? 1 : 2];
        if (set.count >= set.cap) continue;
        const i = set.count++;
        set.iA.array.set([x, y, z, T[q + 3]], i * 4);
        set.iB.array.set([T[q + 4], T[q + 5], own, sp.fall], i * 4);
        set.iC.array.set(sp.leaf, i * 3); set.iD.array.set(sp.trunk, i * 4); set.iD.array[i * 4 + 3] = b.vis ? b.vis[k] : 1;
        if (d2 < 60 * 60) { names.set(sp.name, (names.get(sp.name) || 0) + 1); near++; if (sp.fall) falling++; }
        if (d2 < nearest) nearest = d2;
      }
    }
    let count = 0, tris = 0;
    for (const s of this.sets.flat(2)) {
      s.geo.instanceCount = s.count; s.mesh.visible = s.count > 0 && this.atlasReady;
      if (s.castGeo) s.castGeo.instanceCount = s.count;
      if (s.count) { for (const a of [s.iA, s.iB, s.iC, s.iD]) { a.clearUpdateRanges?.(); a.addUpdateRange?.(0, s.count * a.itemSize); a.needsUpdate = true; } }
      count += s.count; tris += s.count * s.tris;
    }
    this.count = count; this.triangles = tris; this.falling = falling; this.near = near;          // (near: trees within 60 m, for the leaves that come off them)
    this.names = [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]).join(', ');
  }

  // Governor: draw the trees to a shorter distance (1: all the way).
  setFraction(f) { if (f !== this.fraction) { this.fraction = f; this.dirty = true; } }
}
