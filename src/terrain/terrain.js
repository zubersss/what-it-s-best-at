// Terrain manager: selects quadtree nodes every frame, keeps the fixed chunk pool filled
// through the workers, and re-bases chunk meshes to the camera (floating origin).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Node } from './quadtree.js';
import { ChunkPool } from './chunkPool.js';
import { WorkerPool } from './workerPool.js';
import { makeTerrainMaterial, makeTerrainShared, setTerrainSurface, setDemList, DETAIL_TILE } from './terrainMaterial.js';
import { makeDetailTexture, makeStrataTexture } from './surfaceTextures.js';
import { FACES, dirToFace } from './cubeSphere.js';

const _rel = new THREE.Vector3(), _sphere = new THREE.Sphere(), _m = new THREE.Matrix4(), _p = new THREE.Matrix4();
const FADE_MS = 600;       // how long a new chunk takes to settle from its parent's look into its own

export class Terrain {
  constructor(world, rasters, hs, renderer) {
    this.world = world; this.hs = hs;
    this.radius = world.radius;
    this.maxLevel = world.terrain.maxLevel;
    this.relief = world.terrain.maxAltitude - world.terrain.minAltitude;
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.needsUpdate = true;
    this.textures = { detail: makeDetailTexture(256), strata: makeStrataTexture(world.surface.strata), white, albedo: null, relief: null };
    this.shared = makeTerrainShared(world, this.textures);
    this.pool = new ChunkPool((n, s) => makeTerrainMaterial(this.shared, n, s), renderer.capabilities.getMaxAnisotropy());
    this.group = this.pool.group;
    const count = Math.max(1, Math.min(CONFIG.WORKERS, (navigator.hardwareConcurrency || 2) - 1));
    this.epoch = 0;                    // bumped on every world switch; stale worker replies are dropped
    this.workers = new WorkerPool(count, this._initMessage(world, rasters));
    this.roots = FACES.map((_, f) => new Node(f, 0, 0, 0, null, hs, this.relief));
    this.frame = 0;
    this.drawList = []; this.wanted = [];
    this.ready = [];                               // built chunks waiting for their turn to be uploaded
    this.lodScale = 1;
    this.maxChunks = CONFIG.MAX_RENDER_CHUNKS;     // lowered by the governor's terrain steps
    this.uploads = 0;                              // chunks uploaded since the app last read it
    this.splitIn = CONFIG.SPLIT_FACTOR; this.splitOut = CONFIG.SPLIT_FACTOR_OFFSCREEN;
    this.frustum = new THREE.Frustum(); this.wideFrustum = new THREE.Frustum();
    this.farDistance = 1e6;
    this.buildMs = 0; this.built = 0;
    this.idleFrames = 0;
    this.gpuBytes = this.pool.gpuBytes + 256 * 256 * 4 * 4 / 3 + 4096 * 2048 * 4 * 4 / 3 + 4096 * 4096 * 4 / 3;      // + one global albedo map (RGBA8) and one slope map (R8)
    this._cam = new THREE.Vector3(); this._camDir = [0, 0, 1];
    this.loadAlbedoMap(world);
    this.loadReliefMap(world);
  }

  _initMessage(world, rasters) {
    return {
      type: 'init', world,
      rasters: rasters.map((r) => ({ ...r, data: undefined, buffer: r.data.buffer })),
      cfg: { GRID: CONFIG.GRID, NORMAL_RES: CONFIG.NORMAL_RES, SHADOW_RES: CONFIG.SHADOW_RES },
    };
  }

  // Replaces the planet: every chunk slot is released, the workers load the new height
  // source, the surface palette changes. The GPU pool itself is reused as is.
  setWorld(world, rasters, hs) {
    this.epoch++;
    this.world = world; this.hs = hs;
    this.radius = world.radius; this.maxLevel = world.terrain.maxLevel;
    this.relief = world.terrain.maxAltitude - world.terrain.minAltitude;
    setTerrainSurface(this.shared, world);
    this.textures.strata.dispose();
    this.textures.strata = makeStrataTexture(world.surface.strata);
    this.shared.tStrata.value = this.textures.strata;
    this.loadAlbedoMap(world);
    this.loadReliefMap(world);
    const pool = this.pool;
    pool.free.length = 0;
    for (let i = 0; i < pool.slots.length; i++) { pool.slots[i].node = null; pool.slots[i].mesh.visible = false; pool.free.push(i); }
    this.roots = FACES.map((_, f) => new Node(f, 0, 0, 0, null, hs, this.relief));
    this.drawList.length = 0; this.wanted.length = 0; this.ready.length = 0;
    this.lodScale = 1; this.idleFrames = 0;
    this.workers.reinit(this._initMessage(world, rasters));
  }

  // The world's global brightness / colour map (surface.albedoMap), if it has one. Only
  // the current world's map is kept on the GPU; until it arrives the palette is used alone.
  loadAlbedoMap(world) {
    const def = world.surface.albedoMap, u = this.shared;
    if (this.textures.albedo) { this.textures.albedo.dispose(); this.textures.albedo = null; }
    u.tAlbedo.value = this.textures.white; u.uAlbedoMap.value.w = 0;
    this.tint = null;
    this.albedoBusy = !!def;
    if (!def) return;
    const epoch = this.epoch;
    new THREE.TextureLoader().load(import.meta.env.BASE_URL + def.url, (tex) => {
      if (epoch !== this.epoch) { tex.dispose(); return; }
      tex.colorSpace = def.encoding === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.flipY = false;                    // row 0 (north) at v = 0, as the shader expects
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
      tex.anisotropy = 4;
      this.textures.albedo = tex; u.tAlbedo.value = tex;
      u.uAlbedoMap.value.set(1 / def.mean[0], 1 / def.mean[1], 1 / def.mean[2], def.strength ?? 1);
      u.uAlbedoChroma.value = def.chroma ?? 1;
      const rad = Math.PI / 180;      // latFade: [from, to] degrees of latitude over which the map hands back to the palette
      if (def.latFade) u.uAlbedoFade.value.set(Math.sin(def.latFade[0] * rad), Math.sin(def.latFade[1] * rad)); else u.uAlbedoFade.value.set(2, 3);
      this.tint = makeTintGrid(tex.image, def);
      this.albedoBusy = false;
    }, undefined, () => { this.albedoBusy = false; });
  }

  // The albedo map's tint at a place (planet-centred position), as the terrain shader
  // applies it: for the things that lie on the ground there. (1, 1, 1) without a map.
  tintAt(pos, out) {
    const t = this.tint;
    if (!t) return out.set(1, 1, 1);
    const r = pos.length(), u = (Math.atan2(pos.y, pos.x) / (2 * Math.PI) + 1) % 1, v = Math.acos(Math.max(-1, Math.min(1, pos.z / r))) / Math.PI;
    const x = u * t.w - 0.5, y = Math.max(0, Math.min(t.h - 1, v * t.h - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const xa = (x0 + t.w) % t.w, xb = (x0 + 1) % t.w, ya = y0, yb = Math.min(t.h - 1, y0 + 1), d = t.data;
    for (let c = 0; c < 3; c++) {
      const top = d[(ya * t.w + xa) * 3 + c] * (1 - fx) + d[(ya * t.w + xb) * 3 + c] * fx, bot = d[(yb * t.w + xa) * 3 + c] * (1 - fx) + d[(yb * t.w + xb) * 3 + c] * fx;
      out.setComponent(c, top * (1 - fy) + bot * fy);
    }
    return out;
  }

  // The world's slope map (surface.reliefMap): relief shading from far away, where the
  // chunks' own normal maps are far coarser than the screen (see terrainMaterial.js).
  // A greyscale image twice as tall as wide, uploaded as one channel (R8).
  loadReliefMap(world) {
    const def = world.surface.reliefMap, u = this.shared;
    if (this.textures.relief) { this.textures.relief.dispose(); this.textures.relief = null; }
    u.tRelief.value = this.textures.white; u.uRelief.value.x = 0;
    this.reliefBusy = !!def;
    if (!def) return;
    setDemList(u, world);
    const epoch = this.epoch;
    new THREE.TextureLoader().load(import.meta.env.BASE_URL + def.url, (tex) => {
      if (epoch !== this.epoch) { tex.dispose(); return; }
      tex.format = THREE.RedFormat; tex.colorSpace = THREE.NoColorSpace;
      tex.flipY = false;
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
      this.textures.relief = tex; u.tRelief.value = tex;
      const W = tex.image.width, rad = Math.PI / 180;
      u.uRelief.value.set(def.strength ?? 1, Math.PI * world.radius / (W / 2), W, 0);
      const f = def.latFade || [80, 88];
      u.uReliefFade.value.set(Math.sin(f[0] * rad), Math.sin(f[1] * rad));
      this.reliefBusy = false;
    }, undefined, () => { this.reliefBusy = false; });
  }

  // Height above datum of the ground as it is drawn at unit direction d: the finest live
  // chunk there, its triangles, and its morph toward its parent (camDist: metres from the
  // camera). The terrain mesh carries less detail than the height function wherever a
  // coarser chunk is drawn (while finer ones load, far away, or on a governor step), so
  // anything that must stand on the ground the player sees asks here. null: none loaded.
  drawnHeight(d, camDist) {
    const uv = this._uvDH || (this._uvDH = [0, 0]);
    let node = null;
    for (let f = 0; f < 6; f++) if (dirToFace(f, d[0], d[1], d[2], uv) && Math.abs(uv[0]) <= 1 && Math.abs(uv[1]) <= 1) { node = this.roots[f]; break; }
    if (!node) return null;
    let live = node.slot >= 0 ? node : null;
    while (node.children && node.childrenLive) {
      const half = node.size / 2;
      node = node.children[(uv[1] >= node.b0 + half ? 2 : 0) + (uv[0] >= node.a0 + half ? 1 : 0)];
      if (node.slot >= 0) live = node; else break;
    }
    if (!live) return null;
    const s = this.pool.slots[live.slot], hm = s.geometry.attributes.aHM.array, G = CONFIG.GRID, V = G + 1;
    const x = Math.min(G - 1e-6, Math.max(0, (uv[0] - live.a0) / live.size * G)), y = Math.min(G - 1e-6, Math.max(0, (uv[1] - live.b0) / live.size * G));
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const m = s.material.uniforms.uMorph.value;
    const k = Math.max(Math.min(1, Math.max(0, (camDist / m.x - m.y) / (0.96 - m.y))), m.z);
    const at = (ii, jj) => { const o = (jj * V + ii) * 2; return hm[o] + hm[o + 1] * k; };
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), dd = at(i + 1, j + 1);
    // the two triangles of a cell split along its (i, j)-(i+1, j+1) diagonal (buildIndices)
    return fx >= fy ? a + (b - a) * fx + (dd - b) * fy : a + (c - a) * fy + (dd - c) * fx;
  }

  get loadedCount() { return CONFIG.CHUNK_POOL - this.pool.free.length; }
  get queueLength() { return this.wanted.length + this.workers.busy + this.ready.length; }
  get idle() { return this.idleFrames > 3 && !this.albedoBusy && !this.reliefBusy; }

  // sunDir: THREE.Vector3 (planet-fixed); sunHalf: the Sun's angular radius in radians.
  update(rig, aspect, sunDir, sunHalf) {
    this.frame++;
    const before = this.now || 0;
    this.now = performance.now();
    // Finished chunks go to the GPU a few per frame, not all at once: about one per 60th
    // of a second of frame time (so one at 60 fps, two at 30, and no limit that matters
    // when frames take a second each in a software renderer).
    // `pace` (the governor, when frames are late only while terrain arrives): 1 = one a
    // frame whatever the queue, 2 = one every other frame.
    if (this.ready.length && !(this.pace === 2 && this.frame % 2)) {
      const budget = this.pace ? 1 : Math.max(1, Math.min(8, Math.round((this.now - before) / 16.7))) + (this.ready.length > 6 ? 1 : 0);
      for (let k = 0; k < budget && this.ready.length; k++) { const r = this.ready.shift(); this._upload(r.node, r.res); }
    }
    this._sun = [sunDir.x, sunDir.y, sunDir.z]; this._sunHalf = sunHalf;
    const cam = this._cam.copy(rig.pos), R = this.radius;
    const camLen = cam.length();
    this._camDir[0] = cam.x / camLen; this._camDir[1] = cam.y / camLen; this._camDir[2] = cam.z / camLen;
    this._camAlt = camLen - R;
    const Ro = R + this.world.terrain.minAltitude;
    this._Ro2 = Ro * Ro;
    this._horizonCam = Math.sqrt(Math.max(0, camLen * camLen - this._Ro2));

    // Culling frusta (rotation only: the camera is the origin).
    _m.makeRotationFromQuaternion(rig.camera.quaternion).invert();
    _p.makePerspective(...this._persp(rig.fov, aspect));
    this.frustum.setFromProjectionMatrix(_p.multiply(_m));
    _p.makePerspective(...this._persp(Math.min(150, rig.fov * 1.15 + 8), aspect));
    this.wideFrustum.setFromProjectionMatrix(_p.multiply(_m));

    // Telephoto needs detail further away; fewer chunks are in view, so the budget holds.
    const zoom = Math.min(6, Math.tan(CONFIG.DEFAULT_FOV * Math.PI / 360) / Math.tan(rig.fov * Math.PI / 360));
    const hx = Math.min(1, Math.max(0, (Math.log10(Math.max(1, rig.agl)) - Math.log10(CONFIG.SPACE_BOOST_ALT * 0.1)))), space = 1 + (CONFIG.SPLIT_SPACE_BOOST - 1) * hx * hx * (3 - 2 * hx);
    this.splitIn = CONFIG.SPLIT_FACTOR * this.lodScale * Math.max(1, zoom, space);
    this.splitOut = CONFIG.SPLIT_FACTOR_OFFSCREEN;

    this.drawList.length = 0; this.wanted.length = 0; this.visited = 0;
    for (const root of this.roots) this._visit(root);

    // Draw list: nearest first (early-z), capped.
    const list = this.drawList;
    list.sort((a, b) => a.dist - b.dist);
    // Budget feedback with a wide dead zone: changing the LOD scale re-tiles everything,
    // so it must not hunt around the cap.
    if (list.length > this.maxChunks || this.stalled) this.lodScale *= 0.97;
    else if (list.length < this.maxChunks * 0.84 && this.lodScale < 1 && this.wanted.length === 0) this.lodScale = Math.min(1, this.lodScale * 1.01);
    if (list.length > this.maxChunks) list.length = this.maxChunks;

    const slots = this.pool.slots;
    for (let i = 0; i < slots.length; i++) slots[i].mesh.visible = false;
    let far = 1000, fading = 0;
    for (let i = 0; i < list.length; i++) {
      const n = list[i], s = slots[n.slot];
      s.mesh.visible = true;
      s.mesh.position.subVectors(n.center, cam);
      s.mesh.renderOrder = i;
      const u = s.material.uniforms, par = n.parent, ps = par && par.slot >= 0 ? slots[par.slot] : null;
      u.uMorph.value.x = par ? this.splitIn * par.edge : 1e15;
      // Shading morphs toward the parent's maps (they stay loaded while its children are).
      u.tParentNormal.value = ps ? ps.normalTex : s.normalTex; u.tParentShadow.value = ps ? ps.shadowTex : s.shadowTex;
      u.uParent.value.set(n.ix & 1 ? 0.5 : 0, n.iy & 1 ? 0.5 : 0, ps ? 1 : 0);
      // A chunk that has just taken over from its parent starts out looking exactly like
      // it and settles into its own detail over FADE_MS.
      let fade = 0;
      if (par && ps) { const t = (this.now - par.liveAt) / FADE_MS; if (t < 1) { fade = 1 - t * t * (3 - 2 * t); fading++; } }
      u.uMorph.value.z = fade;
      far = Math.max(far, s.mesh.position.length() + n.radius);
    }
    this.fading = fading;
    this.farDistance = far;

    this.stalled = false;
    this._dispatch();
    this._rebakeShadows();
    // Idle = nothing left to build, or nothing more can be built (pool exhausted).
    this.idleFrames = (this.workers.busy === 0 && this.ready.length === 0 && this.staleShadows === 0 && this.fading === 0 && (this.wanted.length === 0 || this.stalled)) ? this.idleFrames + 1 : 0;
    if (this.frame % 240 === 0) for (const root of this.roots) this._prune(root);
  }

  _persp(fovDeg, aspect) {
    const near = 0.1, top = near * Math.tan(fovDeg * Math.PI / 360), right = top * aspect;
    return [-right, right, top, -top, near, 1e9];
  }

  _visibility(node) {
    _rel.subVectors(node.center, this._cam);
    const cd = _rel.length();
    const rn = this.radius + node.maxH;
    if (cd - node.radius > this._horizonCam + Math.sqrt(Math.max(0, rn * rn - this._Ro2))) return 0;
    _sphere.center.copy(_rel); _sphere.radius = node.radius;
    if (!this.wideFrustum.intersectsSphere(_sphere)) return 0;
    return this.frustum.intersectsSphere(_sphere) ? 2 : 1;
  }

  _visit(node) {
    node.lastVisit = this.frame; this.visited++;
    const vis = this._visibility(node);
    const d = node.distanceTo(this._cam, this._camDir, this._camAlt, this.radius);
    node.dist = d;
    const f = vis > 0 ? this.splitIn : this.splitOut;
    if (node.level < this.maxLevel && d < f * node.edge) {
      if (!node.children) node.split(this.hs, this.relief);
      node.lastSplit = this.frame;
      let ready = true;
      for (const c of node.children) {
        c.lastVisit = this.frame;        // keeps loaded children alive while their siblings are still building
        if (c.slot >= 0) continue;
        ready = false;
        if (!c.loading) { c.prio = (this._visibility(c) > 0 ? 0 : 1000) + d / node.edge + c.level * 0.01; this.wanted.push(c); }
      }
      if (ready) {
        if (!node.childrenLive) { node.childrenLive = true; node.liveAt = this.now; }   // the moment they take over
        for (const c of node.children) this._visit(c);
        return;
      }
    }
    node.childrenLive = false;
    if (node.slot >= 0) { if (vis === 2) this.drawList.push(node); }
    else if (!node.loading) { node.prio = -1; this.wanted.push(node); }
  }

  _dispatch() {
    if (!this.wanted.length || !this.workers.idle) return;
    this.wanted.sort((a, b) => a.prio - b.prio);
    let k = 0;
    while (this.workers.idle && k < this.wanted.length) {
      const node = this.wanted[k++];
      const slot = this._reserveSlot();
      if (slot < 0) { this.stalled = true; break; }
      node.loading = true; node.reserved = slot;
      node.shadowSun = this._sun;
      const epoch = this.epoch;
      this.workers.run({ type: 'chunk', face: node.face, level: node.level, ix: node.ix, iy: node.iy, sun: this._sun, sunHalf: this._sunHalf })
        .then((res) => { if (epoch === this.epoch) this._onChunk(node, res); })
        .catch((e) => { if (epoch === this.epoch) { node.loading = false; this.pool.free.push(node.reserved); } console.error(e); });
    }
    this.wanted.splice(0, k);
  }

  // Re-bakes baked shadows of drawn chunks whose Sun direction is stale by more than
  // SHADOW_REBAKE_DEG. Nearest first; chunk builds always take priority (they ran above).
  _rebakeShadows() {
    this.staleShadows = 0;
    if (!this.workers.idle && this.frame % 4) return;
    const cosLimit = Math.cos(CONFIG.SHADOW_REBAKE_DEG * Math.PI / 180), sun = this._sun;
    for (const node of this.drawList) {
      const s = node.shadowSun;
      if (node.shadowBusy || !s || s[0] * sun[0] + s[1] * sun[1] + s[2] * sun[2] >= cosLimit) continue;
      this.staleShadows++;
      if (!this.workers.idle) continue;
      node.shadowBusy = true;
      const want = sun, epoch = this.epoch;
      this.workers.run({ type: 'shadow', face: node.face, level: node.level, ix: node.ix, iy: node.iy, sun: want, sunHalf: this._sunHalf })
        .then((res) => { node.shadowBusy = false; if (epoch === this.epoch && node.slot >= 0 && !node.dead) { this.pool.uploadShadow(node.slot, res.shadow); node.shadowSun = want; this.uploads++; this.rebakes = (this.rebakes || 0) + 1; } })
        .catch((e) => { node.shadowBusy = false; console.error(e); });
    }
  }

  _reserveSlot() {
    const pool = this.pool;
    if (pool.free.length) return pool.free.pop();
    let best = -1, bestVisit = this.frame - 20;      // never evict anything used in the last few frames
    for (let i = 0; i < pool.slots.length; i++) {
      const n = pool.slots[i].node;
      if (!n || n.level === 0 || n.lastVisit >= bestVisit) continue;
      if (n.children && n.children.some((c) => c.slot >= 0 || c.loading)) continue;
      best = i; bestVisit = n.lastVisit;
    }
    if (best < 0) return -1;
    const s = pool.slots[best];
    s.node.slot = -1; s.node = null; s.mesh.visible = false;
    return best;
  }

  // A worker has finished a chunk: queue it for upload (see update).
  _onChunk(node, res) { this.ready.push({ node, res }); }

  _upload(node, res) {
    node.loading = false;
    const si = node.reserved; node.reserved = -1;
    if (node.dead) { this.pool.free.push(si); return; }
    this.pool.upload(si, res);
    this.uploads++;
    const s = this.pool.slots[si];
    s.node = node; node.slot = si;
    node.center.set(res.center[0], res.center[1], res.center[2]);
    node.radius = res.radius; node.minH = res.minH; node.maxH = res.maxH;
    const u = s.material.uniforms, f = FACES[node.face];
    u.uChunkPlanetPos.value.copy(node.center);
    // Detail-texture coordinates: computed in doubles so they stay exact at planet scale.
    const K = (Math.PI * this.radius / 4) / DETAIL_TILE;
    const frac = (x) => ((x % 1) + 1) % 1;
    u.uDetail.value.set(frac(node.a0 * K), frac(node.b0 * K), node.size * K, node.size * K);
    const n = _rel.copy(node.center).normalize();
    const tu = new THREE.Vector3(...f.u), tv = new THREE.Vector3(...f.v);
    u.uTanU.value.copy(tu.addScaledVector(n, -tu.dot(n)).normalize());
    u.uTanV.value.copy(tv.addScaledVector(n, -tv.dot(n)).normalize());
    this.buildMs += res.ms; this.built++;
  }

  // Drops node objects of branches nobody has asked for in a while (keeps the tree bounded).
  _prune(node) {
    if (!node.children) return false;
    let busy = false;
    for (const c of node.children) { if (this._prune(c)) busy = true; if (c.slot >= 0 || c.loading) busy = true; }
    if (!busy && node.lastSplit < this.frame - 600) {
      const kill = (n) => { n.dead = true; if (n.children) n.children.forEach(kill); };
      node.children.forEach(kill);
      node.children = null;
    }
    return busy;
  }
}

// A small copy of the albedo map on the CPU, already turned into the tint the shader
// applies (relative to the map's mean, colour differences and strength as configured).
function makeTintGrid(image, def, w = 512, h = 256) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data, data = new Float32Array(w * h * 3);
  const lin = def.encoding === 'srgb' ? (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) : (c) => c;
  const chroma = def.chroma ?? 1, strength = def.strength ?? 1;
  for (let i = 0; i < w * h; i++) {
    // (the things that lie on the ground are near it: the map's range applies, as in the
    // terrain shader near the ground; see albedoRange in terrainMaterial.js)
    const [r, g, b] = albedoRange(lin(px[i * 4] / 255) / def.mean[0], lin(px[i * 4 + 1] / 255) / def.mean[1], lin(px[i * 4 + 2] / 255) / def.mean[2], def.range), grey = (r + g + b) / 3;
    data[i * 3] = 1 + (grey + (r - grey) * chroma - 1) * strength;
    data[i * 3 + 1] = 1 + (grey + (g - grey) * chroma - 1) * strength;
    data[i * 3 + 2] = 1 + (grey + (b - grey) * chroma - 1) * strength;
    if (def.latFade) {
      const lat = Math.abs(90 - (Math.floor(i / w) + 0.5) / h * 180), x = Math.min(1, Math.max(0, (lat - def.latFade[0]) / (def.latFade[1] - def.latFade[0]))), k = 1 - x * x * (3 - 2 * x);
      for (let c = 0; c < 3; c++) data[i * 3 + c] = 1 + (data[i * 3 + c] - 1) * k;
    }
  }
  return { w, h, data };
}

// The same as albedoRange in terrainMaterial.js (keep the two alike).
function albedoRange(r, g, b, range) {
  if (!range || range[1] <= 0) return [r, g, b];
  const L = Math.max((r + g + b) / 3, 1e-4), lo = range[0], hi = range[1], a = lo + (hi - lo) * 0.15, k = lo + (hi - lo) * 0.7;
  let x = L;
  if (x > k) x = hi - (hi - k) * Math.exp(-(x - k) / (hi - k));
  if (x < a) x = lo + (a - lo) * Math.exp(-(a - x) / (a - lo));
  const trust = Math.min(x / L, L / x), t2 = trust * trust;
  return [x * (1 + (r / L - 1) * t2), x * (1 + (g / L - 1) * t2), x * (1 + (b / L - 1) * t2)];
}
