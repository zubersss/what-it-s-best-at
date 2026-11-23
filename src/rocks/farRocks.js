// Boulders and outcrops as far as they can be seen: the land's own rocks (rockBlock.js: where
// they lie is a rule of the place), from a metre across to the size of a house, drawn to
// `reach` metres for every metre of their size (a 4 m block to a mile, the largest to six
// kilometres). The rocks one walks among (rocks.js: 300 within 110 m, down to pebbles)
// stay as they were; these are the ones that are still there from the next hill.
//
// How: the land is cut into tiles, a set for each level of size (small rocks in tiles of
// 333 m, the largest in tiles of 2.2 km). A tile is worked out once in a terrain worker
// and filled into buffers taken from a fixed pool; after that nothing is done per rock on
// the CPU. Each tile is two instanced meshes on the same buffers: the block of the near
// rocks (80 triangles) for rocks that are large on screen, a 20-triangle one for the rest.
// A tile's rocks come largest first, so a tile far off draws only its first few. Which of
// the two meshes draws a rock, and whether it is drawn at all, is decided per rock in the
// vertex shader from its distance over its size: it grows in as the traveller comes
// nearer, and a rock not drawn is thrown out of the picture.
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
import { ROCK_SHAPE_GLSL, rockGeometry } from './rocks.js';
import { rocksFarDef, tileDeg, tileLon } from './rockBlock.js';

const POOL = [64, 56, 48];            // tiles held at once, by level (fixed: memory cannot creep)
const HI_K = 80;                      // nearer than this many times its size a rock is the 80-triangle block
const SMALL_SHARE = 0.82;             // a rock under 2.6 m is seen from this share of `reach` (it is a few pixels there; and they are most of the count)
const VIS_TURN = 0.9998;              // the land's shadow on the rocks is asked again when the Sun has moved 1.1 degrees
const COLLIDE_FROM = 1;               // levels from this one on carry a walker (rocks of 2.6 m and more)

const VERT = /* glsl */`
in vec4 aOff;            // xyz: the rock's middle from the tile's origin (m, planet axes), w: its size (m)
in vec4 aQuat; in vec3 aScale;
in vec4 aShape;          // four numbers of its own (its fracture planes)
in vec4 aMisc;           // x: sunlight on it (the land's shadow), y: its tone, z: snow on it
uniform vec4 uFar;       // x: metres a rock is seen from per metre of its size, y: the same for the 80-triangle block, z: the share of x left to small rocks (the governor), w: where the near shadow map ends (m)
${ROCK_SHAPE_GLSL}
// A rock's place and size; false when this mesh does not draw it.
bool rockPlace(out vec3 centre, out float grow) {
  centre = (modelMatrix * vec4(aOff.xyz, 1.0)).xyz;
  float key = length(centre) / aOff.w, reach = uFar.x * mix(uFar.z, 1.0, smoothstep(2.6, 6.5, aOff.w));
  grow = 1.0 - smoothstep(0.78, 1.0, key / reach);
#ifdef ROCK_HI
  return key <= uFar.y && grow > 0.0;
#else
  return key > uFar.y && grow > 0.0;
#endif
}`;

// The share of `reach` a rock of a size has (as the vertex shader has it: uFar.z).
function shareOf(sz, small) { if (sz >= 6.5) return 1; if (sz <= 2.6) return small; const t = (sz - 2.6) / 3.9; return small + (1 - small) * t * t * (3 - 2 * t); }

export class FarRocks {
  // terrain: the Terrain (its workers, its cloud and strata uniforms).
  constructor(world, terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    const hi = rockGeometry(1), lo = rockGeometry(0);
    this.base = [lo, hi]; this.tris = [lo.index.count / 3, hi.index.count / 3];
    const sh = terrain.shared;
    this.uFar = { value: new THREE.Vector4(420, HI_K, 1, CONFIG.NEAR_SHADOW_RADIUS) };
    this.uniforms = {
      ...lightingUniforms(), uFar: this.uFar,
      uRockAlbedo: { value: new THREE.Vector3(0.2, 0.15, 0.1) }, uDustAlbedo: { value: new THREE.Vector3(0.2, 0.17, 0.12) }, uRoughness: { value: 0.5 }, uDustCap: { value: 0.55 },
      // (the ground's own: the clouds' shadow and the beds of coloured rock, read as the ground reads them)
      tClouds: sh.tClouds, uCloud: sh.uCloud, tCloudNoise: sh.tCloudNoise, uCloudHeap: sh.uCloudHeap, uCloudVol: sh.uCloudVol, uCloudWind: sh.uCloudWind,
      tStrata: sh.tStrata, uStrata: sh.uStrata,
    };
    const vertex = /* glsl */`${VERT}
      uniform vec3 uCamPlanetPos, uSunDir; uniform float uPlanetRadius;
      uniform sampler2D tClouds; uniform vec4 uCloud; uniform highp sampler3D tCloudNoise; uniform vec4 uCloudHeap; uniform vec3 uCloudVol, uCloudWind;
      uniform sampler2D tStrata; uniform vec4 uStrata;
      ${HEAP_GLSL}
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
        float sun = aMisc.x;
        // the cloud that stands between this rock and the Sun (as the ground has it: terrainMaterial.js)
        if (uCloud.x > 0.0 && length(planetPos) < uCloud.y) {
          vec3 uc = normalize(planetPos + uSunDir * ((uCloud.y - length(planetPos)) / max(dot(up, uSunDir), 0.08)));
          float cd = textureLod(tClouds, vec2(atan(uc.y, uc.x) * 0.15915494 + uCloud.z, acos(clamp(uc.z, -1.0, 1.0)) * 0.31830989), 0.0).r;
          float shade = smoothstep(0.2, 0.7, cd);
          if (uCloudHeap.w > 0.5) { float cc, hp = cloudHeap(tCloudNoise, uc, cd, uCloudHeap.x, uCloudHeap.y, uCloudVol, uCloudWind, 0.0, cc); shade = 0.85 * smoothstep(0.06, 0.42, hp); }
          sun *= 1.0 - uCloud.x * shade;
        }
        vTone = vec4(sun, 0.8 + 0.4 * aMisc.y, aMisc.z, grow);
        float hs = length(planetPos) - uPlanetRadius;
        vec3 tint = textureLod(tStrata, vec2(hs * uStrata.x, 0.25), 0.0).rgb * 2.0, fine = textureLod(tStrata, vec2(hs * uStrata.z, 0.75), 0.0).rgb * 2.0;
        vBand = mix(vec3(1.0), tint, uStrata.y) * mix(vec3(1.0), fine, uStrata.w);
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
    const mat = (hiDef) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), OWN_CLOUD_SHADOW: 1, ...(hiDef ? { ROCK_HI: 1 } : {}) }, uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment });
    this.materials = [mat(false), mat(true)];
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
    this.slots = []; this.tiles = new Map();
    this.frame = 0; this.asked = 0; this.missing = 0; this.fraction = 1; this.count = 0; this.drawn = [0, 0]; this.triangles = 0;
    this.coverSerial = -1; this.visSun = [0, 0, 0]; this.sun = [0, 0, 1]; this.sunHalf = 0.0046;
    this._c = new THREE.Vector3(); this._q = [0, 0, 0];
    this.setWorld(world);
  }

  // The pool: every tile's buffers and its two meshes, made once.
  _makePool() {
    if (this.slots.length) return;
    for (let li = 0; li < this.def.levels.length; li++) {
      const cap = this.def.levels[li].cap ?? 512;
      for (let k = 0; k < (POOL[li] ?? 48); k++) {
        const fl = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
        const by = () => { const a = new THREE.InstancedBufferAttribute(new Uint8Array(cap * 4), 4, true); a.setUsage(THREE.DynamicDrawUsage); return a; };
        const at = { aOff: fl(4), aQuat: fl(4), aScale: fl(3), aShape: by(), aMisc: by() };
        const meshes = this.base.map((b, m) => {
          const geo = new THREE.InstancedBufferGeometry();
          geo.setAttribute('position', b.attributes.position); geo.setAttribute('normal', b.attributes.normal); geo.setIndex(b.index);
          for (const name in at) geo.setAttribute(name, at[name]);
          geo.instanceCount = 0; geo.boundingSphere = new THREE.Sphere();
          const mesh = new THREE.Mesh(geo, this.materials[m]);
          mesh.visible = false; mesh.renderOrder = -10; mesh.matrixAutoUpdate = true;
          this.group.add(mesh);
          return mesh;
        });
        this.slots.push({ li, cap, at, lo: meshes[0], hi: meshes[1], tile: null, shadowN: 0 });
      }
    }
  }

  setWorld(world) {
    this.world = world; this.def = rocksFarDef(world);
    for (const s of this.slots) { s.tile = null; s.lo.visible = s.hi.visible = false; s.shadowN = 0; }
    this.tiles.clear(); this.asked = 0; this.missing = 0; this.count = 0; this.coverSerial = -1; this.visSun = [0, 0, 0];
    this.group.visible = !!this.def;
    if (!this.def) return;
    this._makePool();
    const s = world.surface, r = s.rocks, u = this.uniforms;
    u.uRockAlbedo.value.set(...(this.def.albedo || s.rock)); u.uDustAlbedo.value.set(...s.dust); u.uRoughness.value = s.roughness ?? 0.5; u.uDustCap.value = r.dustCap ?? 0.55;
    this.uFar.value.x = this.def.reach;
  }

  // The governor: the share of their distance the small rocks keep (the large ones keep all of it).
  setFraction(f) { this.fraction = f; }
  // True while tiles that are wanted have not arrived (screenshots wait for them).
  get busy() { return !!this.def && this.group.visible && (this.asked > 0 || this.missing > 0 || this.visBusy > 0); }

  // The near shadow map draws the blocks near the eye: every slot's 80-triangle mesh is a
  // caster, on while its tile has rocks within the map's reach (app.js adds them).
  get casters() { return this.slots.map((s) => ({ mesh: s.hi, on: () => s.shadowN > 0 && !!s.tile })); }

  // Every frame. rig: the camera rig; sun: the Sun's direction (planet axes); sunHalf: its half angle.
  update(rig, sun, sunHalf) {
    this.frame++; this.missing = 0; this.visBusy = 0;
    const def = this.def, t = this.terrain;
    const show = !!def && rig.agl < (def.below ?? 9000) && (!this.world.terrain.tiles || !!t.coverSerial);
    this.group.visible = show;
    if (!show) { this.count = 0; this.triangles = 0; return; }
    this.sun = sun; this.sunHalf = sunHalf;
    const small = SMALL_SHARE * this.fraction;          // (the share of the reach a small rock has: see uFar)
    this.uFar.value.z = small; this.uFar.value.y = small < 1 ? HI_K * 0.6 : HI_K;
    const R = this.world.radius, p = rig.pos, len = p.length(), lat = Math.asin(p.z / len) * 180 / Math.PI, lon = ((Math.atan2(p.y, p.x) * 180 / Math.PI) + 360) % 360, M = R * Math.PI / 180;
    // (the land cover moved or changed: every tile is asked again; a ring of water: the tiles it touches)
    if (t.coverSerial !== this.coverSerial) { this.coverSerial = t.coverSerial; for (const b of this.tiles.values()) b.stale = true; }
    const want = this._want || (this._want = []); want.length = 0;
    for (let li = 0; li < def.levels.length; li++) {
      const L = def.levels[li], DEG = tileDeg(R, L.tile), T = DEG * M;
      // (a level's small rocks are not seen as far as its large ones: under the governor's saving its tiles are asked for less far)
      const reach = def.reach * L.size[1] * shareOf(L.size[1], small), radius = reach + 0.75 * T, nb = Math.ceil(radius / T);
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
            if (b.state === 1 && !b.stale && (b.serial || 0) < t.ringSerial) { if (b.center && t._stale(b)) b.stale = true; else b.serial = t.ringSerial; }
            if ((b.state === 1 && !b.stale) || b.asking) continue;
          }
          this.missing++;
          // (nearest first, as near as the rocks of the tile can matter: by distance over the level's reach)
          const score = d / reach;
          if (want.length < 4 || score < want[want.length - 1][4]) { want.push([li, bi, bj, key, score]); want.sort((x, y) => x[4] - y[4]); if (want.length > 4) want.length = 4; }
        }
      }
    }
    // asked for when a worker is free: the ground itself comes first (it has taken its workers already this frame)
    this.ask();
    this._refreshVis();
    // tiles left far behind are let go (their slots are free for others at once)
    if (this.frame % 120 === 0) for (const [k, b] of this.tiles) if (this.frame - b.used > 300 && !b.asking) { if (b.slot) { b.slot.tile = null; b.slot.lo.visible = b.slot.hi.visible = false; b.slot.shadowN = 0; } this.tiles.delete(k); }
    // what each tile draws from here: its rocks are largest first, so the first so-many
    // (counted: what is in the view, which is what is drawn: three leaves out the tiles behind the traveller)
    let count = 0, tris = 0, all = 0; const c = this._c, shadowR = CONFIG.NEAR_SHADOW_RADIUS * 1.6;
    const fr = this._frustum || (this._frustum = new THREE.Frustum()), pm = this._pm || (this._pm = new THREE.Matrix4()), sp = this._sp || (this._sp = new THREE.Sphere());
    fr.setFromProjectionMatrix(pm.multiplyMatrices(rig.camera.projectionMatrix, rig.camera.matrixWorldInverse));
    for (const s of this.slots) {
      const b = s.tile;
      if (!b) continue;
      const L = def.levels[s.li], reach = def.reach, sizes = b.sizes;
      c.copy(b.origin).sub(p);
      s.lo.position.copy(c); s.hi.position.copy(c);
      const dmin = Math.max(0, Math.hypot(c.x + b.bound[0], c.y + b.bound[1], c.z + b.bound[2]) - b.bound[3]);
      // (the first rock too small to be seen from the tile's nearest point; a small rock's reach is less under the governor)
      const smallK = (sz) => reach * shareOf(sz, small);
      let nLo = 0, nHi = 0;
      if (dmin < sizes[0] * smallK(sizes[0])) {
        let a = 0, z = b.count;
        while (a < z) { const m = (a + z) >> 1; if (sizes[m] * smallK(sizes[m]) > dmin) a = m + 1; else z = m; }
        nLo = a; a = 0; z = nLo; const hk = this.uFar.value.y;
        while (a < z) { const m = (a + z) >> 1; if (sizes[m] * hk > dmin) a = m + 1; else z = m; }
        nHi = a;
      }
      void L;
      s.lo.visible = nLo > 0; s.lo.geometry.instanceCount = nLo;
      s.hi.visible = nHi > 0; s.hi.geometry.instanceCount = nHi;
      s.shadowN = dmin < shadowR ? nHi : 0;
      all += nLo;
      sp.center.set(c.x + b.bound[0], c.y + b.bound[1], c.z + b.bound[2]); sp.radius = b.bound[3];
      if (nLo && fr.intersectsSphere(sp)) { count += nLo; tris += nLo * this.tris[0] + nHi * (this.tris[1] - this.tris[0]); }
    }
    this.count = count; this.triangles = tris; this.countAll = all;
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
      if (t.workers.idle < 1 || this.asked >= (t.wanted.length > 0 || !t.idle ? 1 : 4)) break;
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
      if (!res.count) { if (b.slot) { b.slot.tile = null; b.slot.lo.visible = b.slot.hi.visible = false; b.slot.shadowN = 0; b.slot = null; } b.center = null; return; }
      const slot = b.slot || this._slot(li, b);
      if (!slot) { b.count = 0; b.center = null; this.dropped = (this.dropped || 0) + 1; return; }           // (the pool is full of tiles in use: it stays undrawn until it is let go and wanted again; counted, so that a pool too small shows)
      b.slot = slot; slot.tile = b;
      b.origin = new THREE.Vector3(res.origin[0], res.origin[1], res.origin[2]); b.bound = res.bound;
      b.center = new THREE.Vector3(res.origin[0] + res.bound[0], res.origin[1] + res.bound[1], res.origin[2] + res.bound[2]); b.radius = res.bound[3]; b.box = null;
      const off = new Float32Array(res.off), n = res.count;
      b.sizes = new Float32Array(n); for (let i = 0; i < n; i++) b.sizes[i] = off[i * 4 + 3];
      const put = (a, src) => { a.array.set(src); a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; };
      put(slot.at.aOff, off); put(slot.at.aQuat, new Float32Array(res.quat)); put(slot.at.aScale, new Float32Array(res.scale)); put(slot.at.aShape, new Uint8Array(res.shape));
      const misc = new Uint8Array(res.misc), vis = new Uint8Array(res.vis);
      for (let i = 0; i < n; i++) misc[i * 4] = vis[i];
      put(slot.at.aMisc, misc);
      for (const m of [slot.lo, slot.hi]) { m.geometry.boundingSphere.center.set(res.bound[0], res.bound[1], res.bound[2]); m.geometry.boundingSphere.radius = res.bound[3]; }
      // (kept for whoever walks among them: the larger levels only)
      b.solid = li >= COLLIDE_FROM ? { off, quat: slot.at.aQuat.array, scale: slot.at.aScale.array, shape: slot.at.aShape.array } : null;
    }, () => { this.asked--; b.asking = false; });
  }

  // How far a large rock stands over the ground at a place: d: the unit direction from the
  // world's centre, r: the ground's distance from the centre there (m). The block as it is
  // drawn, near enough: its fracture planes (ROCK_SHAPE_GLSL, in JavaScript: change one,
  // change the other) and a sphere a little inside the lump they are cut from, so that
  // feet sink a hand into a corner and never hang over one. 0 where there is none.
  riseAt(d, r) {
    if (!this.def || !this.slots.length) return 0;
    const px = d[0] * r, py = d[1] * r, pz = d[2] * r;
    let best = 0;
    for (const s of this.slots) {
      const b = s.tile;
      if (!b || !b.solid || !b.center) continue;
      const cx = px - b.center.x, cy = py - b.center.y, cz = pz - b.center.z;
      if (cx * cx + cy * cy + cz * cz > b.radius * b.radius) continue;
      const { off, quat, scale, shape } = b.solid, ox = px - b.origin.x, oy = py - b.origin.y, oz = pz - b.origin.z;
      for (let i = 0; i < b.count; i++) {
        const x = ox - off[i * 4], y = oy - off[i * 4 + 1], z = oz - off[i * 4 + 2], size = off[i * 4 + 3], lim = 1.6 * size;
        if (x * x + y * y + z * z > lim * lim) continue;
        const t = rockTop(x, y, z, d, quat, scale, shape, i);
        if (t > best) best = t;
      }
    }
    return best;
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
    if (far) { far.tile.slot = null; far.tile.state = 0; far.tile.center = null; far.tile = null; }
    return far;
  }

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
    const job = t.workers.run({ type: 'rockvis', origin: [b.origin.x, b.origin.y, b.origin.z], off: pick.at.aOff.array.slice(0, n * 4), count: n, sun: want, sunHalf: this.sunHalf });
    if (!job) return;
    b.visAsking = true; this.visAsked = true;
    job.then((res) => {
      b.visAsking = false; this.visAsked = false;
      if (epoch !== t.epoch || pick.tile !== b || b.count !== n) return;
      const vis = new Uint8Array(res.vis), a = pick.at.aMisc;
      for (let i = 0; i < n; i++) a.array[i * 4] = vis[i];
      a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true;
      b.visSun = want;
    }, () => { b.visAsking = false; this.visAsked = false; });
  }
}

// The highest point of rock i on the vertical through a place: (x, y, z): the place from
// the rock's middle (m, planet axes); up: the vertical there. Metres over the place, or 0.
const LUMP = 0.86, TAU = 6.2831853;
const fr = (v) => v - Math.floor(v);
function rockTop(x, y, z, up, quat, scale, shape, i) {
  // into the rock's own axes (the turn undone), in units of its size along each
  const qx = -quat[i * 4], qy = -quat[i * 4 + 1], qz = -quat[i * 4 + 2], qw = quat[i * 4 + 3];
  const rot = (vx, vy, vz, o) => {
    const tx = qy * vz - qz * vy + qw * vx, ty = qz * vx - qx * vz + qw * vy, tz = qx * vy - qy * vx + qw * vz;
    o[0] = vx + 2 * (qy * tz - qz * ty); o[1] = vy + 2 * (qz * tx - qx * tz); o[2] = vz + 2 * (qx * ty - qy * tx);
  };
  const p = _p, u = _u;
  rot(x, y, z, p); rot(up[0], up[1], up[2], u);
  const sx = scale[i * 3], sy = scale[i * 3 + 1], sz = scale[i * 3 + 2];
  p[0] /= sx; p[1] /= sy; p[2] /= sz; u[0] /= sx; u[1] /= sy; u[2] /= sz;
  // the line p + t u inside the lump's sphere ...
  const a = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], bq = p[0] * u[0] + p[1] * u[1] + p[2] * u[2], c = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - LUMP * LUMP, disc = bq * bq - a * c;
  if (disc <= 0) return 0;
  let t0 = (-bq - Math.sqrt(disc)) / a, t1 = (-bq + Math.sqrt(disc)) / a;
  // ... and under every fracture plane
  const s0 = shape[i * 4] / 255, s1 = shape[i * 4 + 1] / 255, s2 = shape[i * 4 + 2] / 255, s3 = shape[i * 4 + 3] / 255;
  const az = s0 * TAU, sides = 4 + Math.floor(s3 * 2.999);
  for (let f = 0; f <= sides; f++) {
    let nz, ang, h;
    if (f < sides) { ang = az + f * TAU / sides + (fr(s1 * 7.13 + f * 0.618034) - 0.5) * 0.9; nz = (fr(s2 * 5.71 + f * 0.381966) - 0.45) * 0.55; h = 0.5 + 0.32 * fr(s1 * 3.31 + f * 0.754878); }
    else { ang = s2 * TAU; nz = 0.6 + 0.37 * s1; h = 0.35 + 0.35 * s0; }
    const sn = Math.sqrt(Math.max(0, 1 - nz * nz)), nx = Math.cos(ang) * sn, ny = Math.sin(ang) * sn;
    const dp = p[0] * nx + p[1] * ny + p[2] * nz - h, du = u[0] * nx + u[1] * ny + u[2] * nz;
    if (Math.abs(du) < 1e-9) { if (dp > 0) return 0; continue; }
    const t = -dp / du;
    if (du > 0) { if (t < t1) t1 = t; } else if (t > t0) t0 = t;
    if (t0 >= t1) return 0;
  }
  return t1 > 0 ? t1 : 0;
}
const _p = [0, 0, 0], _u = [0, 0, 0];
