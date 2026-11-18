// Terrain manager: selects quadtree nodes every frame, keeps the fixed chunk pool filled
// through the workers, and re-bases chunk meshes to the camera (floating origin).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Node } from './quadtree.js';
import { ChunkPool } from './chunkPool.js';
import { WorkerPool } from './workerPool.js';
import { makeTerrainMaterial, makeTerrainShared, setTerrainSurface, DETAIL_TILE } from './terrainMaterial.js';
import { makeDetailTexture, makeStrataTexture } from './surfaceTextures.js';
import { FACES } from './cubeSphere.js';

const _rel = new THREE.Vector3(), _sphere = new THREE.Sphere(), _m = new THREE.Matrix4(), _p = new THREE.Matrix4();
const FADE_MS = 600;       // how long a new chunk takes to settle from its parent's look into its own

export class Terrain {
  constructor(world, rasters, hs, renderer) {
    this.world = world; this.hs = hs;
    this.radius = world.radius;
    this.maxLevel = world.terrain.maxLevel;
    this.relief = world.terrain.maxAltitude - world.terrain.minAltitude;
    this.textures = { detail: makeDetailTexture(256), strata: makeStrataTexture(world.surface.strata) };
    this.shared = makeTerrainShared(world, this.textures);
    this.pool = new ChunkPool((n, s) => makeTerrainMaterial(this.shared, n, s), renderer.capabilities.getMaxAnisotropy());
    this.group = this.pool.group;
    const count = Math.max(1, Math.min(CONFIG.WORKERS, (navigator.hardwareConcurrency || 2) - 1));
    this.epoch = 0;                    // bumped on every world switch; stale worker replies are dropped
    this.workers = new WorkerPool(count, this._initMessage(world, rasters));
    this.roots = FACES.map((_, f) => new Node(f, 0, 0, 0, null, hs, this.relief));
    this.frame = 0;
    this.drawList = []; this.wanted = [];
    this.lodScale = 1;
    this.maxChunks = CONFIG.MAX_RENDER_CHUNKS;     // lowered by the governor's terrain steps
    this.uploads = 0;                              // chunks uploaded since the app last read it
    this.splitIn = CONFIG.SPLIT_FACTOR; this.splitOut = CONFIG.SPLIT_FACTOR_OFFSCREEN;
    this.frustum = new THREE.Frustum(); this.wideFrustum = new THREE.Frustum();
    this.farDistance = 1e6;
    this.buildMs = 0; this.built = 0;
    this.idleFrames = 0;
    this.gpuBytes = this.pool.gpuBytes + 256 * 256 * 4 * 4 / 3;
    this._cam = new THREE.Vector3(); this._camDir = [0, 0, 1];
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
    const pool = this.pool;
    pool.free.length = 0;
    for (let i = 0; i < pool.slots.length; i++) { pool.slots[i].node = null; pool.slots[i].mesh.visible = false; pool.free.push(i); }
    this.roots = FACES.map((_, f) => new Node(f, 0, 0, 0, null, hs, this.relief));
    this.drawList.length = 0; this.wanted.length = 0;
    this.lodScale = 1; this.idleFrames = 0;
    this.workers.reinit(this._initMessage(world, rasters));
  }

  get loadedCount() { return CONFIG.CHUNK_POOL - this.pool.free.length; }
  get queueLength() { return this.wanted.length + this.workers.busy; }
  get idle() { return this.idleFrames > 3; }

  // sunDir: THREE.Vector3 (planet-fixed); sunHalf: the Sun's angular radius in radians.
  update(rig, aspect, sunDir, sunHalf) {
    this.frame++;
    this.now = performance.now();
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
    this.splitIn = CONFIG.SPLIT_FACTOR * this.lodScale * Math.max(1, zoom);
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
    this.idleFrames = (this.workers.busy === 0 && this.staleShadows === 0 && this.fading === 0 && (this.wanted.length === 0 || this.stalled)) ? this.idleFrames + 1 : 0;
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
        .then((res) => { node.shadowBusy = false; if (epoch === this.epoch && node.slot >= 0 && !node.dead) { this.pool.uploadShadow(node.slot, res.shadow); node.shadowSun = want; } })
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

  _onChunk(node, res) {
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
