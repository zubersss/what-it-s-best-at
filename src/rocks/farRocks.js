// Boulders and outcrops as far as they can be seen: the land's own rocks (rockBlock.js: where
// they lie is a rule of the place), from a metre across to the size of a house, drawn to
// `reach` metres for every metre of their size (a 4 m block to a mile, the largest to six
// kilometres). The rocks one walks among (rocks.js: 300 within 110 m, down to pebbles)
// stay as they were; these are the ones that are still there from the next hill.
//
// How: the land is cut into tiles, a set for each level of size, a level's tile about as
// wide as its largest rock is seen from far (1.3, 3.3 and 8.3 km): so every level needs the
// same few tiles, and a view holds three or four of each. A tile is worked out once in a
// terrain worker and filled into buffers taken from a fixed pool; after that nothing is
// done per rock on the CPU. Each tile is ONE instanced mesh of one block (20 flat faces:
// the near rocks' lump at its coarsest, cut by the same fracture planes), and one more for
// the rocks' shadows on the ground: the draw calls are counted in tiles, some twenty in a
// view. A tile's rocks come largest first, so a tile far off draws only its first few.
// Whether a rock is drawn is decided per rock in the vertex shader from its distance over
// its size: it grows in as the traveller comes nearer, and a rock not drawn is thrown out
// of the picture. A rock is the same block at the same place from six kilometres to
// arm's length: nothing about it changes as one comes near.
//
// Light: the shared lighting chunk and the painted look, as the near rocks; the land's own
// shadow on each rock from the workers (asked again when the Sun has moved); the clouds'
// shadow as the ground has it, worked out per rock in the vertex shader; the near shadow
// map within its reach (the rocks near the eye cast into it too).
//
// A world has them with `surface.rocks.far` in its file (rockBlock.js has the defaults).
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { HEAP_GLSL } from '../sky/clouds.js';
import { CONFIG } from '../config.js';
import { shadowTileDistance, tileShare } from '../shadows/nearShadow.js';
import { ROCK_SHAPE_GLSL, rockGeometry } from './rocks.js';
import { rocksFarDef, tileDeg, tileLon, rockTop, SMALL_SHARE, shareOf, ROCKS_FAR_DEFAULTS, tileCap } from './rockBlock.js';

const POOL = [14, 14, 14, 16];            // tiles held at once, by level (fixed: memory cannot creep)
const CASTERS = 1024;                 // the most rocks drawn into the near shadow map
const CASTER_STEP = 20;               // metres the traveller goes before they are chosen again
const VIS_TURN = 0.9998;              // the land's shadow on the rocks is asked again when the Sun has moved 1.1 degrees
const COLLIDE_FROM = 3.4;             // levels whose rocks are this large and more carry a walker (m)

const VERT = /* glsl */`
in vec4 aOff;            // xyz: the rock's middle from the tile's origin (m, planet axes), w: its size (m)
in vec4 aQuat; in vec3 aScale;
in vec4 aShape;          // four numbers of its own (its fracture planes)
in vec4 aMisc;           // x: sunlight on it (the land's shadow), y: its tone (and over a half: snow on it), zw: the ground's slope there, east and north
in vec4 aTint;           // rgb: the land's colour at its place over the world's mean (the albedo map's tint, a fifth of it); a: the share of its size it is seen as from afar (less under trees)
uniform vec4 uFar;       // x: metres a rock is seen from per metre of its size, z: the share of x left to small rocks (the governor), w: where the near shadow map ends (m)
uniform vec2 uShareSize; // the size up to which a rock is small, and from which it has all its reach (m)
${ROCK_SHAPE_GLSL}
// A rock's place and size; false when this mesh does not draw it.
bool rockPlace(out vec3 centre, out float grow) {
  centre = (modelMatrix * vec4(aOff.xyz, 1.0)).xyz;
  float seen = aOff.w * aTint.a, key = length(centre) / seen, reach = uFar.x * mix(uFar.z, 1.0, smoothstep(uShareSize.x, uShareSize.y, seen));
  grow = 1.0 - smoothstep(0.78, 1.0, key / reach);
  return grow > 0.0;
}`;


// Sunlight on a rock (vertex shader): the land's shadow from the worker, and the cloud that
// stands between it and the Sun, as the ground has it (terrainMaterial.js).
const SUN_VERT = /* glsl */`
uniform vec3 uCamPlanetPos, uSunDir; uniform float uPlanetRadius;
uniform sampler2D tClouds; uniform vec4 uCloud; uniform highp sampler3D tCloudNoise; uniform vec4 uCloudHeap; uniform vec3 uCloudVol, uCloudWind;
${HEAP_GLSL}
float rockSun(vec3 planetPos, vec3 up) {
  float sun = aMisc.x;
  if (uCloud.x > 0.0 && length(planetPos) < uCloud.y) {
    vec3 uc = normalize(planetPos + uSunDir * ((uCloud.y - length(planetPos)) / max(dot(up, uSunDir), 0.08)));
    float cd = textureLod(tClouds, vec2(atan(uc.y, uc.x) * 0.15915494 + uCloud.z, acos(clamp(uc.z, -1.0, 1.0)) * 0.31830989), 0.0).r;
    float shade = smoothstep(0.2, 0.7, cd);
    if (uCloudHeap.w > 0.5) { float cc, hp = cloudHeap(tCloudNoise, uc, cd, uCloudHeap.x, uCloudHeap.y, uCloudVol, uCloudWind, 0.0, cc); shade = 0.85 * smoothstep(0.06, 0.42, hp); }
    sun *= 1.0 - uCloud.x * shade;
  }
  return sun;
}`;

export class FarRocks {
  // terrain: the Terrain (its workers, its cloud and strata uniforms).
  constructor(world, terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.base = rockGeometry(0); this.tris = this.base.index.count / 3;
    // (the block's largest radius over its scale: how far a rock reaches, for the shadow map's fine tile)
    { const p = this.base.attributes.position; let m = 0; for (let i = 0; i < p.count; i++) m = Math.max(m, Math.hypot(p.getX(i), p.getY(i), p.getZ(i))); this.lumpRadius = m; }
    this.lump = { pos: this.base.attributes.position.array, idx: this.base.index.array };      // (the block's own faces, for whoever stands on one: riseAt)
    const sh = terrain.shared;
    this.uFar = { value: new THREE.Vector4(420, 0, 1, CONFIG.NEAR_SHADOW_RADIUS) }; this.uShareSize = { value: new THREE.Vector2(3.4, 8) };
    this.uniforms = {
      ...lightingUniforms(), uFar: this.uFar, uShareSize: this.uShareSize,
      uRockAlbedo: { value: new THREE.Vector3(0.2, 0.15, 0.1) }, uDustAlbedo: { value: new THREE.Vector3(0.2, 0.17, 0.12) }, uRoughness: { value: 0.5 }, uDustCap: { value: 0.55 },
      // (the ground's own: the clouds' shadow and the beds of coloured rock, read as the ground reads them)
      tClouds: sh.tClouds, uCloud: sh.uCloud, tCloudNoise: sh.tCloudNoise, uCloudHeap: sh.uCloudHeap, uCloudVol: sh.uCloudVol, uCloudWind: sh.uCloudWind,
      tStrata: sh.tStrata, uStrata: sh.uStrata,
    };
    const vertex = /* glsl */`${VERT}
      ${SUN_VERT}
      uniform sampler2D tStrata; uniform vec4 uStrata;
      out vec3 vRel; out vec3 vN; out float vLocalZ;
      flat out vec4 vTone;            // x: sunlight on it, y: its tone, z: snow, w: how far it has grown in
      flat out vec3 vBand;            // the tint of the bed of rock it lies on
      void main() {
        vec3 c; float grow;
        if (!rockPlace(c, grow)) { vRel = vec3(0.0); vN = vec3(0.0, 0.0, 1.0); vLocalZ = 0.0; vTone = vec4(0.0); vBand = vec3(1.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 nrm = normal;
        vec3 rel = c + qrot(rockShape(position, nrm) * aScale, aQuat) * grow;
        vRel = rel; vN = qrot(nrm / aScale, aQuat); vLocalZ = position.z;
        vec3 planetPos = uCamPlanetPos + c, up = normalize(planetPos);
        float sun = rockSun(planetPos, up);
        float tv = aMisc.y * 255.0, snow = step(127.5, tv);
        vTone = vec4(sun, 0.8 + 0.4 * (tv - 128.0 * snow) / 127.0, snow, grow);
        float hs = length(planetPos) - uPlanetRadius;
        vec3 tint = textureLod(tStrata, vec2(hs * uStrata.x, 0.25), 0.0).rgb * 2.0, fine = textureLod(tStrata, vec2(hs * uStrata.z, 0.75), 0.0).rgb * 2.0;
        vBand = mix(vec3(1.0), tint, uStrata.y) * mix(vec3(1.0), fine, uStrata.w);
        // (and the land's colour under it: as bright as the country it lies in, half of its hue.
        // A rock of one colour everywhere was near black on golden grass, the ground there
        // being three times the world's mean.)
        vec3 land = aTint.rgb * 5.0; float lg = dot(land, vec3(0.3333));
        vBand *= mix(vec3(lg), land, 0.5) * (clamp(lg, 0.55, 2.4) / max(lg, 1e-3));
        gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
      }`;
    const fragment = /* glsl */`${LIGHTING_PARS}
      uniform vec3 uRockAlbedo, uDustAlbedo; uniform float uRoughness, uDustCap; uniform vec4 uFar;
      in vec3 vRel; in vec3 vN; in float vLocalZ; flat in vec4 vTone; flat in vec3 vBand;
      layout(location = 0) out vec4 fragColor;
      void main() {
        vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel);
        // (shaded by the true faces, as the near rocks: rocks.js)
        vec3 F = normalize(cross(dFdx(vRel), dFdy(vRel)));
        F *= sign(dot(F, V));
        vec3 N = normalize(mix(F, normalize(vN), 0.3));
        float top = smoothstep(0.45, 0.95, dot(N, up));
        // the rock of the bed it lies on; dust settled on top, or snow
        vec3 cap = mix(uDustAlbedo, vec3(0.82, 0.85, 0.9), vTone.z);
        vec3 albedo = mix(uRockAlbedo * vBand * vTone.y, cap, max(top * uDustCap, vTone.z * smoothstep(0.2, 0.7, dot(N, up))));
        float contact = mix(0.5, 1.0, smoothstep(-0.35, 0.3, vLocalZ));        // darker where it meets the ground
        float diffuse = groundDiffuse(N, uSunDir, V, uRoughness);
        if (uPaint.x > 0.0) { N = normalize(mix(N, F, 0.6 * uPaint.x)); diffuse = mix(diffuse, paintLit(dot(N, uSunDir)), uPaint.x); albedo = paintColour(albedo); }
        float shadow = vTone.x;
        if (length(vRel) < uFar.w) shadow *= nearShadow(vRel, N);
        vec3 direct = directSun(planetPos) * shadow * diffuse;
        vec3 col = albedo * (direct + (skyLight(N, up) * contact + planetShine(N)) / PI);
        col = aerialPerspective(col, vRel);
        fragColor = vec4(col * uExposure, 1.0);
      }`;
    this.material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), OWN_CLOUD_SHADOW: 1 }, uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment });
    // (into the near shadow map: the blocks near the eye, as they are drawn)
    this.depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, colorWrite: false, uniforms: { uShadowReach: { value: CONFIG.NEAR_SHADOW_RADIUS * 1.6 } },
      vertexShader: /* glsl */`
        in vec4 aOff; in vec4 aQuat; in vec3 aScale; in vec4 aShape;
        uniform float uShadowReach;
        ${ROCK_SHAPE_GLSL}
        void main() {
          vec3 c = (modelMatrix * vec4(aOff.xyz, 1.0)).xyz, nrm = normal;
          if (length(c) > uShadowReach) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          gl_Position = projectionMatrix * viewMatrix * vec4(c + qrot(rockShape(position, nrm) * aScale, aQuat), 1.0);
        }`,
      fragmentShader: /* glsl */`layout(location = 0) out vec4 fragColor; void main() { fragColor = vec4(1.0); }`,
    });
    // The shadow a rock throws on the ground beyond the near shadow map's reach (150 m): a
    // soft dark patch on the ground beside it, away from the Sun and as long as the Sun is
    // low. Laid over the ground already drawn (it only darkens: the ground's colour times
    // what the sky alone lights of it), so a block on a far hillside stands on the hill.
    // Where the shadow map reaches, that draws the true shadow and these fade out.
    this.shadowMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines() }, uniforms: this.uniforms,
      depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      // (no slope-scaled depth offset: seen at a low angle that is metres, and the patch was drawn over the rock itself)
      polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -4,
      vertexShader: /* glsl */`
        in vec4 aOff; in vec4 aQuat; in vec3 aScale; in vec4 aMisc; in vec4 aTint;
        uniform vec4 uFar; uniform vec2 uShareSize;
        ${SUN_VERT}
        out vec3 vRel; out vec2 vDisc; flat out vec4 vSh;          // vSh: xyz the ground's normal, w how dark
        void main() {
          vec3 c = (modelMatrix * vec4(aOff.xyz, 1.0)).xyz;
          float d = length(c), size = aOff.w, seen = size * aTint.a, key = d / seen, reach = uFar.x * mix(uFar.z, 1.0, smoothstep(uShareSize.x, uShareSize.y, seen));
          // (not for a rock that is a pixel or two: its shadow would be less)
          float show = (1.0 - smoothstep(0.5, 0.72, key / reach));
          vec3 planetPos = uCamPlanetPos + c, up = normalize(planetPos);
          float sun = show > 0.0 ? rockSun(planetPos, up) : 0.0;
          vec2 g = (aMisc.zw * 255.0 - 127.5) / 63.75;
          vec3 east = normalize(cross(vec3(0.0, 0.0, 1.0), up)), north = cross(up, east);
          vec3 n = normalize(up - east * g.x - north * g.y);
          float sn = dot(uSunDir, n);
          if (show * sun <= 0.003 || sn < 0.05) { vRel = vec3(0.0); vDisc = vec2(0.0); vSh = vec4(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          // on the ground under the rock's middle; t: the way the shadow falls along the ground
          vec3 base = c - up * aScale.z * (0.2 - 0.08 * min(1.0, length(g)));          // (the ground under its middle: rockBlock.js stands it this far over it)
          vec3 st = uSunDir - n * sn; float sl = length(st);
          vec3 t = sl > 1e-4 ? -st / sl : east, b = cross(n, t);
          float r = 0.56 * max(aScale.x, aScale.y), tall = 0.6 * aScale.z, len = min(tall * sl / sn, 5.0 * tall);
          vec3 rel = base + (t * (position.x * r + len * (0.5 + 0.5 * position.x)) + b * (position.y * r)) + n * (0.04 * size + 0.0005 * d);
          vRel = rel; vDisc = position.xy; vSh = vec4(n, 0.88 * sun * show);
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        in vec3 vRel; in vec2 vDisc; flat in vec4 vSh;
        layout(location = 0) out vec4 fragColor;
        void main() {
          float d = length(vRel), a = vSh.w * (1.0 - smoothstep(0.5, 1.0, length(vDisc)));
          // (the shadow map draws the true shadow near the eye)
          if (uShadowParams.z > 0.5) a *= smoothstep(0.7 * uShadowParams.x, 0.98 * uShadowParams.x, d);
          if (a <= 0.004) discard;
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), n = vSh.xyz;
          // what is left of the ground's light without the Sun: the sky's share of it
          vec3 sky = skyLight(n, up), sun = directSun(planetPos) * (uPaint.x > 0.0 ? paintLit(dot(n, uSunDir)) * PI : max(dot(n, uSunDir), 0.0));
          vec3 k = sky / max(sky + sun, vec3(1e-6));
          // (less of it through the air between: the haze over the ground is not darkened)
          vec3 through = aerialPerspective(vec3(1.0), vRel) - aerialPerspective(vec3(0.0), vRel);
          fragColor = vec4(mix(vec3(1.0), k, a * clamp(through, 0.0, 1.0)), 1.0);
        }`,
    });
    // (a flat round patch: a middle and eight on its rim)
    { const pos = [0, 0, 0], idx = []; for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2; pos.push(Math.cos(an), Math.sin(an), 0); idx.push(0, 1 + i, 1 + (i + 1) % 8); }
      this.discPos = new THREE.BufferAttribute(new Float32Array(pos), 3); this.discIdx = new THREE.BufferAttribute(new Uint16Array(idx), 1); }
    this.shadows = true;
    this.slots = []; this.tiles = new Map();
    // The rocks near the eye, for the near shadow map: one small mesh of their own, the
    // nearest first (so the fine tile can take the first few), filled on the CPU when the
    // traveller has gone 20 m (_fillCaster). (Each tile's own mesh was the caster before:
    // every shadow tile was handed every instance of every tile within 240 m, nine to
    // seventeen thousand blocks, for the few that stand in the map.)
    {
      const fl = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CASTERS * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
      const by = new THREE.InstancedBufferAttribute(new Uint8Array(CASTERS * 4), 4, true); by.setUsage(THREE.DynamicDrawUsage);
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', this.base.attributes.position); geo.setAttribute('normal', this.base.attributes.normal); geo.setIndex(this.base.index);
      this.casterAt = { aOff: fl(4), aQuat: fl(4), aScale: fl(3), aShape: by };
      for (const name in this.casterAt) geo.setAttribute(name, this.casterAt[name]);
      geo.instanceCount = 0;
      this.caster = new THREE.Mesh(geo, this.depthMaterial); this.caster.frustumCulled = false;
      this.casterAnchor = new THREE.Vector3(); this.casterDirty = true; this.casterAt0 = 0;
    }
    this.frame = 0; this.asked = 0; this.missing = 0; this.fraction = 1; this.count = 0; this.drawn = [0, 0]; this.triangles = 0;
    this.coverSerial = -1; this.visSun = [0, 0, 0]; this.sun = [0, 0, 1]; this.sunHalf = 0.0046;
    this._c = new THREE.Vector3(); this._q = [0, 0, 0];
    this.setWorld(world);
  }

  // The pool: every tile's buffers and its two meshes, made once.
  _makePool() {
    if (this.slots.length) return;
    // (sized by the defaults, not by the world that happens to come first: a world's own
    // levels may hold fewer rocks a tile, never more: setWorld)
    for (let li = 0; li < ROCKS_FAR_DEFAULTS.levels.length; li++) {
      const cap = tileCap(ROCKS_FAR_DEFAULTS.levels[li]);
      for (let k = 0; k < (POOL[li] ?? 48); k++) {
        const fl = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
        const by = () => { const a = new THREE.InstancedBufferAttribute(new Uint8Array(cap * 4), 4, true); a.setUsage(THREE.DynamicDrawUsage); return a; };
        const at = { aOff: fl(4), aQuat: fl(4), aScale: fl(3), aShape: by(), aMisc: by(), aTint: by() };
        const geo = new THREE.InstancedBufferGeometry(), bg = this.base;
        geo.setAttribute('position', bg.attributes.position); geo.setAttribute('normal', bg.attributes.normal); geo.setIndex(bg.index);
        for (const name in at) geo.setAttribute(name, at[name]);
        geo.instanceCount = 0; geo.boundingSphere = new THREE.Sphere();
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.visible = false; mesh.renderOrder = -10;
        this.group.add(mesh);
        const sg = new THREE.InstancedBufferGeometry();
        sg.setAttribute('position', this.discPos); sg.setIndex(this.discIdx);
        for (const name of ['aOff', 'aQuat', 'aScale', 'aMisc', 'aTint']) sg.setAttribute(name, at[name]);
        sg.instanceCount = 0; sg.boundingSphere = new THREE.Sphere();
        const shade = new THREE.Mesh(sg, this.shadowMaterial);
        shade.visible = false; shade.renderOrder = 2;            // after the ground it lies on
        this.group.add(shade);
        this.slots.push({ li, cap, at, mesh, shade, tile: null });
      }
    }

  }

  setWorld(world) {
    this.world = world; this.def = rocksFarDef(world);
    for (const s of this.slots) this._free(s);
    this.caster.geometry.instanceCount = 0; this.casterDirty = true;
    this.tiles.clear(); this.missing = 0;          // (not `asked`: the last world's replies still arrive and each takes one off)
    this.missing0 = undefined; this.count = 0; this.coverSerial = -1; this.visSun = [0, 0, 0];
    this.group.visible = !!this.def;
    if (!this.def) return;
    this._makePool();
    // (the pool is what it is: a world's levels fit it, or are cut to it, with a word)
    if (this.def.levels.length > ROCKS_FAR_DEFAULTS.levels.length) { console.error(`far rocks: "${world.id}" asks for ${this.def.levels.length} levels, the pool has ${ROCKS_FAR_DEFAULTS.levels.length}: the rest are left out`); this.def.levels.length = ROCKS_FAR_DEFAULTS.levels.length; }
    this.def.levels.forEach((L, li) => { const cap = tileCap(ROCKS_FAR_DEFAULTS.levels[li]), want = tileCap(L); if (want > cap) console.error(`far rocks: "${world.id}" level ${li} can hold ${want} rocks a tile, the pool holds ${cap}: its fullest tiles are cut`); L.cap = cap; });
    const s = world.surface, r = s.rocks, u = this.uniforms;
    u.uRockAlbedo.value.set(...(this.def.albedo || s.rock)); u.uDustAlbedo.value.set(...s.dust); u.uRoughness.value = s.roughness ?? 0.5; u.uDustCap.value = r.dustCap ?? 0.55;
    this.uFar.value.x = this.def.reach;
    this.shareLo = this.def.share[0]; this.shareHi = this.def.share[1] + 1e-3; this.uShareSize.value.set(this.shareLo, this.shareHi);
  }

  // The governor: the share of their distance the small rocks keep (the large ones keep all of it).
  setFraction(f) { this.fraction = f; }
  // True while tiles that are wanted have not arrived (screenshots wait for them).
  get busy() { return !!this.def && this.group.visible && (this.asked > 0 || this.missing > 0 || this.visBusy > 0); }

  // The near shadow map draws the blocks near the eye: every slot's mesh is a
  // caster, on while its tile has rocks within the map's reach (app.js adds them).
  // What the near shadow map draws of the far rocks: the one small mesh, on while it holds
  // any; `fine`: how many of its first can reach the fine tile.
  get casters() { return [{ mesh: this.caster, on: () => this.group.visible && this.caster.geometry.instanceCount > 0, fine: () => this.fineCount() }]; }

  // How many of the casters the fine tile draws: up to the last one whose shadow falls in it,
  // asked by the shadow pass with the tile in place (nearShadow.js: tileShare). They were
  // put in order of their distance from that tile when chosen (_fillCaster), so it is the
  // first few dozen. (Those within 45 m of where they were chosen, as it was, left out the
  // rocks out to 51 m along a Sun 20 degrees up whose shadows lie in the tile.)
  fineCount() { return tileShare(1, this.caster.geometry.instanceCount, this.casterAt.aOff.array, 4, this.caster.position, this.casterAt.aScale.array, this.lumpRadius); }

  // Chooses the rocks that cast into the near shadow map: those within its reach of the
  // traveller, the nearest CASTERS of them, put in order of how far across the Sun's rays
  // they lie from the fine tile (shadowTileDistance: the shadow map's own axes, as last drawn),
  // so that the ones it draws come first. A pass over the tiles that reach that far, when the
  // traveller has gone CASTER_STEP metres or a tile has come or gone.
  _fillCaster(p) {
    const R = CONFIG.NEAR_SHADOW_RADIUS * 1.6, list = this._cl || (this._cl = []), at = this.casterAt;
    list.length = 0;
    for (const s of this.slots) {
      const b = s.tile; if (!b || !b.full) continue;
      const ox = b.origin.x - p.x, oy = b.origin.y - p.y, oz = b.origin.z - p.z;
      if (Math.hypot(ox + b.bound[0], oy + b.bound[1], oz + b.bound[2]) - b.bound[3] > R) continue;
      const off = b.full.off;
      for (let i = 0; i < b.count; i++) {
        const x = ox + off[i * 4], y = oy + off[i * 4 + 1], z = oz + off[i * 4 + 2], d = Math.sqrt(x * x + y * y + z * z) - off[i * 4 + 3];
        if (d < R) list.push({ d, b, i });
      }
    }
    list.sort((x, y) => x.d - y.d);
    const n = Math.min(CASTERS, list.length);
    if (list.length > n) list.length = n;
    for (const e of list) {
      const f = e.b.full, i4 = e.i * 4, i3 = e.i * 3;
      e.d = shadowTileDistance(1, e.b.origin.x - p.x + f.off[i4], e.b.origin.y - p.y + f.off[i4 + 1], e.b.origin.z - p.z + f.off[i4 + 2]) - this.lumpRadius * Math.max(f.scale[i3], f.scale[i3 + 1], f.scale[i3 + 2]);
    }
    list.sort((x, y) => x.d - y.d);
    for (let k = 0; k < n; k++) {
      const { b, i } = list[k], f = b.full, i4 = i * 4, k4 = k * 4;
      at.aOff.array[k4] = b.origin.x - p.x + f.off[i4]; at.aOff.array[k4 + 1] = b.origin.y - p.y + f.off[i4 + 1]; at.aOff.array[k4 + 2] = b.origin.z - p.z + f.off[i4 + 2]; at.aOff.array[k4 + 3] = f.off[i4 + 3];
      for (let c = 0; c < 4; c++) { at.aQuat.array[k4 + c] = f.quat[i4 + c]; at.aShape.array[k4 + c] = f.shape[i4 + c]; }
      for (let c = 0; c < 3; c++) at.aScale.array[k * 3 + c] = f.scale[i * 3 + c];
    }
    if (n) for (const name in at) { const a = at[name]; a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
    this.caster.geometry.instanceCount = n; this.casterDirty = false; this.casterAt0 = this.frame;
    this.casterAnchor.copy(p); list.length = 0;
  }

  // Every frame. rig: the camera rig; sun: the Sun's direction (planet axes); sunHalf: its half angle.
  update(rig, sun, sunHalf) {
    this.frame++; this.missing = 0; this.visBusy = 0;
    const def = this.def, t = this.terrain;
    const show = !this.off && !!def && rig.agl < (def.below ?? 9000) && (!this.world.terrain.tiles || !!t.coverSerial);
    this.group.visible = show;
    if (!show) { this.count = 0; this.triangles = 0; return; }
    this.sun = sun; this.sunHalf = sunHalf;
    const small = SMALL_SHARE * this.fraction;          // (the share of the reach a small rock has: see uFar)
    this.uFar.value.z = small;
    // (the traveller's place and speed, for the tiles' filling: _fill)
    const eye = this._eye || (this._eye = new THREE.Vector3().copy(rig.pos)), step = eye.distanceTo(rig.pos);
    this.speed = step > 5000 ? 0 : Math.max(step * 60, (this.speed || 0) * 0.95); eye.copy(rig.pos);
    const lo = this.shareLo, hi = this.shareHi;
    const R = this.world.radius, p = rig.pos, len = p.length(), lat = Math.asin(p.z / len) * 180 / Math.PI, lon = ((Math.atan2(p.y, p.x) * 180 / Math.PI) + 360) % 360, M = R * Math.PI / 180;
    // (the land cover moved or changed: every tile is asked again; a ring of water: the tiles it touches)
    if (t.coverSerial !== this.coverSerial) { this.coverSerial = t.coverSerial; for (const b of this.tiles.values()) b.stale = true; }
    // (which tiles are wanted: looked at every fourth frame; the list is asked from in between)
    const want = this._want || (this._want = []);
    if (this.frame % 4 === 1 || this.missing0 === undefined) {
    want.length = 0; let missing = 0;
    for (let li = 0; li < def.levels.length; li++) {
      const L = def.levels[li], DEG = tileDeg(R, L.tile), T = DEG * M;
      // (a level's small rocks are not seen as far as its large ones: under the governor's saving its tiles are asked for less far)
      const reach = L.seenTo ? L.seenTo * small / SMALL_SHARE : def.reach * L.size[1] * shareOf(L.size[1], small, lo, hi), radius = reach + 0.72 * T, nb = Math.ceil(radius / T);
      const bi0 = Math.floor(lat / DEG);
      for (let bi = bi0 - nb; bi <= bi0 + nb; bi++) {
        const dLon = tileLon(bi, DEG), n = Math.round(360 / dLon), bj0 = Math.floor(lon / dLon), cl = Math.cos(lat * Math.PI / 180);
        const nbj = Math.min(n >> 1, Math.ceil(radius / (dLon * M * Math.max(0.05, cl))));
        for (let bu = bj0 - nbj; bu <= bj0 + nbj; bu++) {
          const dy = ((bi + 0.5) * DEG - lat) * M, dx = ((bu + 0.5) * dLon - lon) * M * cl, d = Math.hypot(dx, dy);
          if (d > radius) continue;
          const bj = ((bu % n) + n) % n, key = li + ':' + bi + ':' + bj;
          let b = this.tiles.get(key);
          if (b) {
            b.used = this.frame;
            if (b.retry > this.frame) continue;
            if (b.state === 1 && !b.stale && (b.serial || 0) < t.ringSerial) { if (b.center && t._stale(b)) b.stale = true; else b.serial = t.ringSerial; }
            if ((b.state === 1 && !b.stale) || b.asking) continue;
          }
          missing++;
          // (nearest first, as near as the rocks of the tile can matter: by distance over the level's reach)
          want.push([li, bi, bj, key, d / reach]);
        }
      }
    }
    want.sort((x, y) => x[4] - y[4]); if (want.length > 16) want.length = 16;
    this.missing0 = missing;
    }
    this.missing = this.missing0;
    // asked for when a worker is free: the ground itself comes first (it has taken its workers already this frame)
    this.ask();
    this._refreshVis();
    // tiles left far behind are let go (their slots are free for others at once)
    if (this.frame % 120 === 0) for (const [k, b] of this.tiles) if (this.frame - b.used > 300 && !b.asking) { if (b.slot) this._free(b.slot); this.tiles.delete(k); }
    // what each tile draws from here: its rocks are largest first, so the first so-many
    // (counted: what is in the view, which is what is drawn: three leaves out the tiles behind the traveller)
    let count = 0, tris = 0, all = 0, calls = 0; const c = this._c;
    const fr = this._frustum || (this._frustum = new THREE.Frustum()), pm = this._pm || (this._pm = new THREE.Matrix4()), sp = this._sp || (this._sp = new THREE.Sphere());
    fr.setFromProjectionMatrix(pm.multiplyMatrices(rig.camera.projectionMatrix, rig.camera.matrixWorldInverse));
    // (the first rock too small to be seen from a tile's nearest point; a small rock's reach is less)
    const reach = def.reach, smallK = (sz) => reach * shareOf(sz, small, lo, hi);
    // (filled again: the tiles the traveller has moved most against, two a frame)
    let f1 = null, f2 = null, u1 = 0.5, u2 = 0.5;
    for (const s of this.slots) {
      const b = s.tile;
      if (!b) continue;
      if (!b.tinted && t.tint) this._tint(b);
      const u = b.dirty || !b.fillPos || b.fillSmall !== small ? 1e9 : b.fillPos.distanceTo(p) / b.fillSlack;
      if (u > u1) { f2 = f1; u2 = u1; f1 = s; u1 = u; } else if (u > u2) { f2 = s; u2 = u; }
    }
    if (f1) this._fill(f1, f1.tile);
    if (f2) this._fill(f2, f2.tile);
    // (the casters: chosen again after 20 m, or when a tile has come or gone; not more often
    // than every tenth frame, and not from where the shadow map has nothing to show of them)
    if (rig.agl < 400) { if ((this.casterDirty || this.casterAnchor.distanceTo(p) > CASTER_STEP) && this.frame - this.casterAt0 >= 10) this._fillCaster(p); }
    else if (this.caster.geometry.instanceCount) { this.caster.geometry.instanceCount = 0; this.casterDirty = true; }
    this.caster.position.copy(this.casterAnchor).sub(p);
    for (const s of this.slots) {
      const b = s.tile;
      if (!b) continue;
      const sizes = b.sizes;
      c.copy(b.origin).sub(p);
      s.mesh.position.copy(c); s.shade.position.copy(c);
      const dmin = Math.max(0, Math.hypot(c.x + b.bound[0], c.y + b.bound[1], c.z + b.bound[2]) - b.bound[3]);
      let nLo = 0;
      if (b.filled && dmin < sizes[0] * smallK(sizes[0])) {
        let a = 0, z = b.filled;
        while (a < z) { const m = (a + z) >> 1; if (sizes[m] * smallK(sizes[m]) > dmin) a = m + 1; else z = m; }
        nLo = a;
      }
      s.mesh.visible = nLo > 0; s.mesh.geometry.instanceCount = nLo;
      // (their shadows on the ground: of the rocks seen from under 0.72 of their reach)
      let nSh = 0;
      if (this.shadows && nLo && this.def.levels[s.li].shadow !== false) { let a = 0, z = nLo; while (a < z) { const m = (a + z) >> 1; if (sizes[m] * smallK(sizes[m]) * 0.72 > dmin) a = m + 1; else z = m; } nSh = a; }
      s.shade.visible = nSh > 0; s.shade.geometry.instanceCount = nSh;
      all += nLo;
      sp.center.set(c.x + b.bound[0], c.y + b.bound[1], c.z + b.bound[2]); sp.radius = b.bound[3];
      if (nLo && fr.intersectsSphere(sp)) { count += nLo; tris += nLo * this.tris + nSh * 8; calls += 1 + (nSh > 0 ? 1 : 0); }
    }
    this.count = count; this.triangles = tris; this.countAll = all; this.calls = calls;
  }

  // What is drawn in a camera's view, counted rock by rock by the vertex shader's own rule
  // (for the read-outs: screenshots and scripts ask, the game never does). The camera is at
  // the middle of things, as the meshes are placed.
  tally(camera) {
    const o = { rocks: 0, shadows: 0, triangles: 0, calls: 0, all: 0, handed: 0, tiles: 0 };
    if (!this.def || !this.group.visible) return o;
    const fr = this._frustum || (this._frustum = new THREE.Frustum()), pm = this._pm || (this._pm = new THREE.Matrix4()), v = this._tv || (this._tv = new THREE.Vector3());
    camera.updateMatrixWorld(); pm.copy(camera.matrixWorld).setPosition(0, 0, 0).invert().premultiply(camera.projectionMatrix); fr.setFromProjectionMatrix(pm);
    const reach = this.def.reach, small = this.uFar.value.z, lo = this.shareLo, hi = this.shareHi;
    for (const s of this.slots) {
      const b = s.tile; if (!b || !s.mesh.visible) continue;
      const off = s.at.aOff.array, c = s.mesh.position, n = s.mesh.geometry.instanceCount, nSh = s.shade.visible ? s.shade.geometry.instanceCount : 0;
      let rocks = 0, shadows = 0;
      o.tiles++; o.handed += n;
      for (let i = 0; i < n; i++) {
        v.set(c.x + off[i * 4], c.y + off[i * 4 + 1], c.z + off[i * 4 + 2]);
        const k = v.length() / (b.sizes[i] * reach * shareOf(b.sizes[i], small, lo, hi));
        if (k >= 1) continue;
        o.all++;
        if (!fr.containsPoint(v)) continue;
        rocks++; if (i < nSh && k < 0.72) shadows++;
      }
      o.rocks += rocks; o.shadows += shadows; o.calls += (rocks ? 1 : 0) + (shadows ? 1 : 0);
    }
    o.triangles = o.rocks * this.tris + o.shadows * 8;
    return o;
  }

  // Asks the workers for the tiles most wanted (update() made the list). app.js calls this
  // before the ground takes the workers for the frame as well: while the ground has patches
  // to build one tile of rocks is on its way at a time, so that a traveller on the move is
  // not left without rocks until the ground has settled (a tile takes a worker 5 to 30 ms);
  // with the ground at rest, every free worker.
  ask() {
    const t = this.terrain, want = this._want;
    if (!want || !this.group.visible) return;
    while (want.length) {
      if (t.workers.idle < 1 || this.asked >= (t.wanted.length > 0 ? 1 : 4)) break;      // (by the ground's own demand: `t.idle` is false while a tile of rocks is on its way, and one tile at a time was all that ever went)
      const w = want.shift(), b = this.tiles.get(w[3]);
      if (b && (b.asking || (b.state === 1 && !b.stale))) continue;
      this._ask(w);
    }
  }

  _ask([li, bi, bj, key]) {
    const t = this.terrain, epoch = t.epoch, world = this.world, sun = [this.sun[0], this.sun[1], this.sun[2]];
    const job = t.workers.run({ type: 'rocks', level: this.def.levels[li], li, bi, bj, sun, sunHalf: this.sunHalf });
    if (!job) return;
    let b = this.tiles.get(key);
    if (!b) { b = { state: 0, used: this.frame, li }; this.tiles.set(key, b); }
    b.asking = true; b.stale = false; this.asked++;
    const serial = t.ringSerial;
    job.then((res) => {
      this.asked--; b.asking = false;
      if (epoch !== t.epoch || world !== this.world || this.tiles.get(key) !== b) return;
      b.state = 1; b.serial = serial; b.count = res.count; b.visSun = sun;
      if (!res.count) { if (b.slot) { this._free(b.slot); b.slot = null; } b.center = null; return; }
      const slot = b.slot || this._slot(li, b);
      if (!slot) { b.state = 0; b.count = 0; b.center = null; b.retry = this.frame + 180; this.dropped = (this.dropped || 0) + 1; return; }           // (the pool is full of tiles in use: asked again in a while, when one may have been let go; counted, so that a pool too small shows)
      b.slot = slot; slot.tile = b;
      b.origin = new THREE.Vector3(res.origin[0], res.origin[1], res.origin[2]); b.bound = res.bound;
      b.center = new THREE.Vector3(res.origin[0] + res.bound[0], res.origin[1] + res.bound[1], res.origin[2] + res.bound[2]); b.radius = res.bound[3]; b.box = null;
      // (the whole tile stays here; the GPU is given the rocks that can be seen from where the traveller is: _fill)
      const off = new Float32Array(res.off), n = res.count, seen = new Uint8Array(res.seen), misc = new Uint8Array(res.misc), vis = new Uint8Array(res.vis), tint = new Uint8Array(n * 4);
      const sizes = new Float32Array(n);
      for (let i = 0; i < n; i++) { sizes[i] = off[i * 4 + 3] * seen[i] / 255; tint[i * 4 + 3] = seen[i]; misc[i * 4] = vis[i]; }
      b.full = { off, quat: new Float32Array(res.quat), scale: new Float32Array(res.scale), shape: new Uint8Array(res.shape), misc, tint, sizes };
      b.sizes = new Float32Array(n); b.filled = 0; b.tinted = false;
      this._tint(b);
      this._fill(slot, b); this.casterDirty = true; this.solidSerial = (this.solidSerial || 0) + 1;
      for (const m of [slot.mesh, slot.shade]) { m.geometry.boundingSphere.center.set(res.bound[0], res.bound[1], res.bound[2]); m.geometry.boundingSphere.radius = res.bound[3]; }
      // (kept for whoever walks among them: the larger levels only)
      b.solid = this.def.levels[li].size[0] >= COLLIDE_FROM - 1e-6 ? b.full : null;
    }, (e) => {
      // (a tile that cannot be worked out is asked twice more and then left empty, with a word:
      // asked for ever, it would keep every screenshot waiting and say nothing)
      this.asked--; b.asking = false; b.failed = (b.failed || 0) + 1;
      if (b.failed >= 3) { b.state = 1; b.count = 0; b.center = null; console.error(`far rocks: tile ${key} failed: ${e?.message || e}`); }
    });
  }

  // How far a large rock stands over the ground at a place: d: the unit direction from the
  // world's centre, r: the ground's distance from the centre there (m). The block as it is
  // drawn: its own twenty faces (rockTop). 0 where there is none.
  riseAt(d, r) {
    if (!this.def || !this.slots.length || !this.group.visible) return 0;
    const px = d[0] * r, py = d[1] * r, pz = d[2] * r;
    // (the rocks within 40 m of the last place asked about are kept: the rig asks eight
    // times a frame on foot, all within a few metres, and a pass over every rock of every
    // tile each time was half a millisecond a frame)
    const c = this._near || (this._near = { x: 1e12, y: 0, z: 0, serial: -1, list: [] });
    if (c.serial !== this.solidSerial || Math.hypot(px - c.x, py - c.y, pz - c.z) > 20) {
      c.x = px; c.y = py; c.z = pz; c.serial = this.solidSerial; c.list.length = 0;
      for (const s of this.slots) {
        const b = s.tile;
        if (!b || !b.solid || !b.center) continue;
        const cx = px - b.center.x, cy = py - b.center.y, cz = pz - b.center.z, reach = b.radius + 40;
        if (cx * cx + cy * cy + cz * cz > reach * reach) continue;
        const off = b.solid.off, ox = px - b.origin.x, oy = py - b.origin.y, oz = pz - b.origin.z;
        for (let i = 0; i < b.count; i++) {
          const x = ox - off[i * 4], y = oy - off[i * 4 + 1], z = oz - off[i * 4 + 2], lim = 40 + 1.6 * off[i * 4 + 3];
          if (x * x + y * y + z * z <= lim * lim) c.list.push(b, i);
        }
      }
    }
    let best = 0; const list = c.list;
    for (let k = 0; k < list.length; k += 2) {
      const b = list[k], i = list[k + 1], { off, quat, scale, shape } = b.solid;
      const x = px - b.origin.x - off[i * 4], y = py - b.origin.y - off[i * 4 + 1], z = pz - b.origin.z - off[i * 4 + 2], lim = 1.6 * off[i * 4 + 3];
      if (x * x + y * y + z * z > lim * lim) continue;
      const t = rockTop(x, y, z, d, quat, scale, shape, i, this.lump);
      if (t > best) best = t;
    }
    return best;
  }

  // The land's colour under each rock of a tile (the world's albedo map, as the ground and
  // the near rocks have it: Terrain.tintAt), once when the tile arrives; again if the map
  // itself had not arrived by then.
  _tint(b) {
    const t = this.terrain, a = b.full.tint, off = b.full.off, v = this._tv || (this._tv = new THREE.Vector3()), o = this._to || (this._to = new THREE.Vector3());
    for (let i = 0; i < b.count; i++) {
      v.set(b.origin.x + off[i * 4], b.origin.y + off[i * 4 + 1], b.origin.z + off[i * 4 + 2]);
      t.tintAt(v, o);
      a[i * 4] = Math.min(255, Math.round(o.x * 51)); a[i * 4 + 1] = Math.min(255, Math.round(o.y * 51)); a[i * 4 + 2] = Math.min(255, Math.round(o.z * 51));
    }
    b.tinted = !!t.tint || !this.world.surface.albedoMap; b.dirty = true;
  }

  // The GPU's share of a tile: the rocks that can be seen from where the traveller is, and
  // those that will be before the tile is filled again (it is, when the traveller has gone
  // half of `slack` metres: update()). A tile is as wide as its largest rocks are seen
  // from far, so most of the tile the traveller stands in is small rocks too far off to be
  // drawn: handed over all the same, the vertex shader ran over five times what it drew.
  // The order stays (seen from farthest first), so the first so-many are still the ones a
  // distance can show.
  _fill(slot, b) {
    if (!this._eye) { b.dirty = true; return; }
    const f = b.full, n = b.count, p = this._eye, at = slot.at, reach = this.def.reach, small = this.uFar.value.z, lo = this.shareLo, hi = this.shareHi;
    const slack = Math.max(0.2 * this.def.levels[slot.li].size[0] * reach, this.speed * 1.0);
    const ox = b.origin.x - p.x, oy = b.origin.y - p.y, oz = b.origin.z - p.z;
    const aOff = at.aOff.array, aQuat = at.aQuat.array, aScale = at.aScale.array, aShape = at.aShape.array, aMisc = at.aMisc.array, aTint = at.aTint.array;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = ox + f.off[i * 4], y = oy + f.off[i * 4 + 1], z = oz + f.off[i * 4 + 2], e = f.sizes[i], r = e * reach * shareOf(e, small, lo, hi) + slack;
      if (x * x + y * y + z * z >= r * r) continue;
      const i4 = i * 4, k4 = k * 4, i3 = i * 3, k3 = k * 3;
      aOff[k4] = f.off[i4]; aOff[k4 + 1] = f.off[i4 + 1]; aOff[k4 + 2] = f.off[i4 + 2]; aOff[k4 + 3] = f.off[i4 + 3];
      aQuat[k4] = f.quat[i4]; aQuat[k4 + 1] = f.quat[i4 + 1]; aQuat[k4 + 2] = f.quat[i4 + 2]; aQuat[k4 + 3] = f.quat[i4 + 3];
      aScale[k3] = f.scale[i3]; aScale[k3 + 1] = f.scale[i3 + 1]; aScale[k3 + 2] = f.scale[i3 + 2];
      aShape[k4] = f.shape[i4]; aShape[k4 + 1] = f.shape[i4 + 1]; aShape[k4 + 2] = f.shape[i4 + 2]; aShape[k4 + 3] = f.shape[i4 + 3];
      aMisc[k4] = f.misc[i4]; aMisc[k4 + 1] = f.misc[i4 + 1]; aMisc[k4 + 2] = f.misc[i4 + 2]; aMisc[k4 + 3] = f.misc[i4 + 3];
      aTint[k4] = f.tint[i4]; aTint[k4 + 1] = f.tint[i4 + 1]; aTint[k4 + 2] = f.tint[i4 + 2]; aTint[k4 + 3] = f.tint[i4 + 3];
      b.sizes[k] = e; k++;
    }
    if (k) for (const name in at) { const a = at[name]; a.clearUpdateRanges(); a.addUpdateRange(0, k * a.itemSize); a.needsUpdate = true; }
    b.filled = k; b.dirty = false; b.fillSlack = slack; b.fillSmall = small;
    (b.fillPos || (b.fillPos = new THREE.Vector3())).copy(p);
  }

  // A free slot of the level, or the one whose tile is farthest from the traveller if that
  // is farther than the tile that asks.
  _slot(li, b) {
    let far = null, farUsed = this.frame - 2;
    for (const s of this.slots) {
      if (s.li !== li) continue;
      if (!s.tile) return s;
      if (s.tile.used < farUsed) { far = s; farUsed = s.tile.used; }
    }
    void b;
    if (far) { far.tile.slot = null; far.tile.state = 0; far.tile.center = null; this._free(far); }
    return far;
  }
  _free(s) { s.tile = null; s.mesh.visible = s.shade.visible = false; this.casterDirty = true; this.solidSerial = (this.solidSerial || 0) + 1; }

  // The land's shadow on the rocks follows the Sun: one tile at a time, when a worker is free.
  _refreshVis() {
    const sun = this.sun, t = this.terrain;
    let pick = null;
    for (const s of this.slots) {
      const b = s.tile;
      if (!b || !b.visSun || b.asking) continue;
      if (b.visSun[0] * sun[0] + b.visSun[1] * sun[1] + b.visSun[2] * sun[2] >= VIS_TURN) continue;
      this.visBusy++;
      if (!b.visAsking && (!pick || b.used > pick.tile.used)) pick = s;
    }
    if (!pick || this.visAsked || t.workers.idle < 1 || t.wanted.length > 0) return;
    const b = pick.tile, n = b.count, want = [sun[0], sun[1], sun[2]], epoch = t.epoch;
    const job = t.workers.run({ type: 'rockvis', origin: [b.origin.x, b.origin.y, b.origin.z], off: b.full.off.slice(0, n * 4), count: n, sun: want, sunHalf: this.sunHalf });
    if (!job) return;
    b.visAsking = true; this.visAsked = true;
    job.then((res) => {
      b.visAsking = false; this.visAsked = false;
      if (epoch !== t.epoch || pick.tile !== b || b.count !== n) return;
      const vis = new Uint8Array(res.vis), a = b.full.misc;
      for (let i = 0; i < n; i++) a[i * 4] = vis[i];
      b.dirty = true;
      b.visSun = want;
    }, () => { b.visAsking = false; this.visAsked = false; });
  }
}
