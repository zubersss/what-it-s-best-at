// Terrain manager: selects quadtree nodes every frame, keeps the fixed chunk pool filled
// through the workers, and re-bases chunk meshes to the camera (floating origin).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Node } from './quadtree.js';
import { ChunkPool, INSTANCE_FLOATS } from './chunkPool.js';
import { WorkerPool } from './workerPool.js';
import { makeTerrainMaterial, makeTerrainShared, setTerrainSurface, setDemList, DETAIL_TILE } from './terrainMaterial.js';
import { makeDetailTexture, makeStrataTexture } from './surfaceTextures.js';
import { FACES, dirToFace } from './cubeSphere.js';
import { TileRings, mosaicBox } from './tiles/tileRings.js';

const _focus = new THREE.Vector3(), _vel = new THREE.Vector3();
const _rel = new THREE.Vector3(), _sphere = new THREE.Sphere(), _m = new THREE.Matrix4(), _p = new THREE.Matrix4();
const FADE_MS = 600;       // how long a new chunk takes to settle from its parent's look into its own

export class Terrain {
  constructor(world, rasters, hs, renderer) {
    this.world = world; this.hs = hs; this.renderer = renderer;
    this.radius = world.radius;
    this.maxLevel = world.terrain.maxLevel;
    this.relief = world.terrain.maxAltitude - world.terrain.minAltitude;
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.needsUpdate = true;
    this.textures = { detail: makeDetailTexture(256), strata: makeStrataTexture(world.surface.strata), white, albedo: null, relief: null };
    this.shared = makeTerrainShared(world, this.textures);
    this.pool = new ChunkPool(renderer, (pool) => makeTerrainMaterial(this.shared, pool));
    this.group = this.pool.mesh;
    const count = Math.max(1, Math.min(CONFIG.WORKERS, (navigator.hardwareConcurrency || 2) - 1));
    this.epoch = 0;                    // bumped on every world switch; stale worker replies are dropped
    this.workers = new WorkerPool(count, this._initMessage(world, rasters));
    this.roots = FACES.map((_, f) => new Node(f, 0, 0, 0, null, hs, this.relief));
    this.frame = 0;
    this.drawList = []; this.wanted = [];
    this.ready = [];                               // built chunks waiting for their turn to be uploaded
    this.readyShadows = [];                        // re-baked shadows waiting for the next frame
    // Map tiles that arrive while the game runs (terrain/tiles): each arrival is a region
    // whose ground must be built again from the better data.
    this.ringSerial = 0; this.regions = []; this.ringBoxes = []; this.readyRefresh = []; this.staleData = 0;
    this.ringTex = null;
    this.tiles = new TileRings({ onElevation: (slot, raster) => this.setRing(slot, raster), onPicture: (name, pic) => this.setRingPicture(name, pic) });
    this.lodScale = 1;
    this.maxChunks = CONFIG.MAX_RENDER_CHUNKS;     // lowered by the governor's terrain steps
    this.uploads = 0;                              // chunks uploaded since the app last read it
    this.splitIn = CONFIG.SPLIT_FACTOR; this.splitOut = CONFIG.SPLIT_FACTOR_OFFSCREEN;
    this.frustum = new THREE.Frustum(); this.wideFrustum = new THREE.Frustum();
    this.farDistance = 1e6;
    this.buildMs = 0; this.built = 0;
    this.idleFrames = 0;
    this.gpuBytes = this.pool.gpuBytes + 256 * 256 * 4 * 4 / 3 + 4096 * 2048 * 4 * 4 / 3 + 4096 * 4096 * 4 / 3;      // + one global albedo map (RGBA8) and one slope map (R8)
    this._cam = new THREE.Vector3(); this._camDir = [0, 0, 1]; this._focusDir = [0, 0, 1]; this._focusAlt = 0; this._focus = null; this.dest = null;
    this.loadAlbedoMap(world);
    this.loadReliefMap(world);
    this.tiles.setWorld(world); this.worldAt = performance.now(); this.ringAt = [];
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
    // (the world being left keeps its height source for a while, App.worldData: without the
    // mosaics, which the workers will not have either if the traveller comes back)
    for (let k = 0; k < this.ringBoxes.length; k++) this.hs.setRing(k, null);
    this.hs.setCover?.(null);
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
    for (let i = 0; i < pool.slots.length; i++) { pool.slots[i].node = null; pool.free.push(i); }
    pool.setCount(0);
    this.roots = FACES.map((_, f) => new Node(f, 0, 0, 0, null, hs, this.relief));
    this.drawList.length = 0; this.wanted.length = 0; this.ready.length = 0; this.readyShadows.length = 0;
    this.regions.length = 0; this.ringBoxes.length = 0; this.readyRefresh.length = 0; this.staleData = 0; this.ringWet = [];
    this.setRingPicture('colour', null);
    this.tiles.setWorld(world); this.worldAt = performance.now(); this.ringAt = [];
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
    loadMap(def.url, (tex) => {
      if (epoch !== this.epoch) { tex.dispose(); return; }
      tex.colorSpace = def.encoding === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.flipY = false;                    // row 0 (north) at v = 0, as the shader expects
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
      tex.anisotropy = 4;
      this.textures.albedo = tex; u.tAlbedo.value = tex;
      u.uAlbedoMap.value.set(1 / def.mean[0], 1 / def.mean[1], 1 / def.mean[2], def.strength ?? 1);
      u.uAlbedoChroma.value = def.chroma ?? 1;
      u.uAlbedoShift.value = def.lon0 === -180 ? 0.5 : 0;
      u.uAlbedoSteep.value = def.steep ?? 1;
      const rad = Math.PI / 180;      // latFade: [from, to] degrees of latitude over which the map hands back to the palette
      if (def.latFade) u.uAlbedoFade.value.set(Math.sin(def.latFade[0] * rad), Math.sin(def.latFade[1] * rad)); else u.uAlbedoFade.value.set(2, 3);
      tex.needsUpdate = true; this.renderer.initTexture(tex);       // to the GPU now, between frames
      this.tint = makeTintGrid(tex.image, def);
      this.albedoBusy = false;
    }, () => { this.albedoBusy = false; });
  }

  // The albedo map's tint at a place (planet-centred position), as the terrain shader
  // applies it: for the things that lie on the ground there. (1, 1, 1) without a map.
  tintAt(pos, out) {
    const t = this.tint;
    if (!t) return out.set(1, 1, 1);
    const r = pos.length(), u = (Math.atan2(pos.y, pos.x) / (2 * Math.PI) + 1 + this.shared.uAlbedoShift.value) % 1, v = Math.acos(Math.max(-1, Math.min(1, pos.z / r))) / Math.PI;
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
    loadMap(def.url, (tex) => {
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
      tex.needsUpdate = true; this.renderer.initTexture(tex);
      this.reliefBusy = false;
    }, () => { this.reliefBusy = false; });
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
    const s = this.pool.slots[live.slot], hv = s.verts, hd = s.morph, G = CONFIG.GRID, V = G + 1;
    const x = Math.min(G - 1e-6, Math.max(0, (uv[0] - live.a0) / live.size * G)), y = Math.min(G - 1e-6, Math.max(0, (uv[1] - live.b0) / live.size * G));
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const m0 = CONFIG.MORPH_START;
    const k = Math.max(Math.min(1, Math.max(0, (camDist / s.morphX - m0) / (0.96 - m0))), s.fade);
    const at = (ii, jj) => { const o = jj * V + ii; return hv[o * 4 + 3] + hd[o] * k; };
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), dd = at(i + 1, j + 1);
    // the two triangles of a cell split along its (i, j)-(i+1, j+1) diagonal (buildIndices)
    return fx >= fy ? a + (b - a) * fx + (dd - b) * fy : a + (c - a) * fy + (dd - c) * fx;
  }

  get loadedCount() { return CONFIG.CHUNK_POOL - this.pool.free.length; }
  get queueLength() { return this.wanted.length + this.workers.busy + this.ready.length; }
  get idle() { return this.idleFrames > 3 && !this.albedoBusy && !this.reliefBusy && !this.tiles.busy; }

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
    // (All uploads happen here, at the start of a frame's work and before any of its
    // drawing: never in the middle of a render pass. See chunkPool.js.)
    if (this.readyShadows.length) {
      for (const r of this.readyShadows) if (r.node.slot >= 0 && !r.node.dead) { this.pool.uploadShadow(r.node.slot, r.shadow); r.node.shadowSun = r.sun; this.rebakes = (this.rebakes || 0) + 1; }
      this.readyShadows.length = 0;
    }
    if (this.ready.length && !(this.pace === 2 && this.frame % 2)) {
      const budget = this.pace ? 1 : Math.max(1, Math.min(8, Math.round((this.now - before) / 16.7))) + (this.ready.length > 6 ? 1 : 0);
      for (let k = 0; k < budget && this.ready.length; k++) { const r = this.ready.shift(); this._upload(r.node, r.res); }
    }
    // Ground built again from better maps goes up in bursts: a dozen at once, twice a
    // second. (A frame that takes in ground can be late on a phone whether it takes one
    // patch or ten: the cost is the frame's, not the patch's. One at a time, a hundred
    // patches were a hundred late frames.)
    if (this.readyRefresh.length && (this.readyRefresh.length >= 12 || this.now - (this._burstAt || 0) > 500)) {
      this._burstAt = this.now;
      for (let k = 0; k < 16 && this.readyRefresh.length; k++) this._uploadRefresh(this.readyRefresh.shift());
    }
    this._sun = [sunDir.x, sunDir.y, sunDir.z]; this._sunHalf = sunHalf;
    const cam = this._cam.copy(rig.pos), R = this.radius;
    const camLen = cam.length();
    this._camDir[0] = cam.x / camLen; this._camDir[1] = cam.y / camLen; this._camDir[2] = cam.z / camLen;
    this._camAlt = camLen - R;
    // Where the ground should be ready before the traveller gets there: the end of a GO
    // trip (this.dest, set by the app), or the place three seconds ahead at this speed.
    // Patches are built for that place as well as for the camera's (_preload), and the map
    // rings look ahead too.
    const vel = this._velocity(cam), speed = vel.length();
    let focus = null;
    if (this.dest) focus = _focus.copy(this.dest);
    else if (speed > 8) { focus = _focus.copy(cam).addScaledVector(vel, 3); const low = camLen - rig.agl + 2; if (focus.length() < low) focus.setLength(low); }
    this._focus = focus;
    if (focus) { const fl = focus.length(); this._focusDir[0] = focus.x / fl; this._focusDir[1] = focus.y / fl; this._focusDir[2] = focus.z / fl; this._focusAlt = fl - R; }
    this.tiles.update(cam, this._camAlt, vel, this.dest);
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
    const hx = Math.min(1, Math.max(0, Math.log(Math.max(1, rig.agl) / CONFIG.SPACE_BOOST_FROM) / Math.log(CONFIG.SPACE_BOOST_ALT / CONFIG.SPACE_BOOST_FROM))), space = 1 + (CONFIG.SPLIT_SPACE_BOOST - 1) * hx * hx * (3 - 2 * hx);
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

    // One instance per drawn chunk, nearest first (the vertex shader's notes in
    // terrainMaterial.js say what the sixteen numbers are).
    const slots = this.pool.slots, I = this.pool.instances;
    let far = 1000, fading = 0;
    for (let i = 0, o = 0; i < list.length; i++, o += INSTANCE_FLOATS) {
      const n = list[i], s = slots[n.slot], par = n.parent, hasPar = !!par && par.slot >= 0;
      n.drawnAt = this.frame; if (par) par.drawnAt = this.frame;          // (see _refresh)
      const x = n.center.x - cam.x, y = n.center.y - cam.y, z = n.center.z - cam.z;
      s.morphX = par ? this.splitIn * par.edge : 1e15;
      // A chunk that has just taken over from its parent starts out looking exactly like
      // it and settles into its own detail over FADE_MS. (Shading morphs toward the
      // parent's maps: they stay loaded while its children are.)
      let fade = 0;
      if (hasPar) { const t = (this.now - par.liveAt) / FADE_MS; if (t < 1) { fade = 1 - t * t * (3 - 2 * t); fading++; } }
      s.fade = fade;
      I[o] = x; I[o + 1] = y; I[o + 2] = z; I[o + 3] = s.morphX;
      I[o + 4] = n.center.x; I[o + 5] = n.center.y; I[o + 6] = n.center.z; I[o + 7] = fade;
      I[o + 8] = s.detail[0]; I[o + 9] = s.detail[1]; I[o + 10] = s.detail[2]; I[o + 11] = n.slot;
      I[o + 12] = hasPar ? par.slot : -1; I[o + 13] = n.ix & 1 ? 0.5 : 0; I[o + 14] = n.iy & 1 ? 0.5 : 0; I[o + 15] = n.face;
      far = Math.max(far, Math.sqrt(x * x + y * y + z * z) + n.radius);
    }
    this.pool.setCount(list.length);
    this.fading = fading;
    this.farDistance = far;

    this.stalled = false;
    this._dispatch();
    this._refresh();
    this._rebakeShadows();
    // Idle = nothing left to build, or nothing more can be built (pool exhausted).
    this.idleFrames = (this.workers.busy === 0 && this.ready.length === 0 && this.readyRefresh.length === 0 && this.staleData === 0 && this.staleShadows === 0 && this.readyShadows.length === 0 && this.fading === 0 && (this.wanted.length === 0 || this.stalled)) ? this.idleFrames + 1 : 0;
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
    let split = false;
    if (node.level < this.maxLevel && d < f * node.edge) {
      split = true;
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
    if (node.slot >= 0) { if (vis === 2) this.drawList.push(node); if (this._focus && !split) this._preload(node); }
    else if (!node.loading) { node.prio = -1; this.wanted.push(node); }
  }

  // A drawn patch the camera does not need finer: would the place ahead (this._focus)? Then
  // its children are built now and kept, without being drawn: when the traveller arrives
  // they are there. They are asked for after everything the camera itself needs, and kept
  // up to date with the maps like drawn ground.
  _preload(node) {
    if (node.level >= this.maxLevel) return;
    const d = node.distanceTo(this._focus, this._focusDir, this._focusAlt, this.radius);
    if (d >= this.splitIn * node.edge) return;
    if (!node.children) node.split(this.hs, this.relief);
    node.lastSplit = this.frame;
    for (const c of node.children) {
      c.lastVisit = this.frame;
      if (c.slot >= 0) { c.drawnAt = this.frame; c.dist = 1e7 + d; this._preload(c); }
      else if (!c.loading) { c.prio = 500 + d / node.edge + c.level * 0.01; this.wanted.push(c); }
    }
  }

  // The traveller's velocity (m/s, the world's axes), from where the camera was a frame
  // ago: smoothed, and a jump is not speed.
  _velocity(cam) {
    const l = this._lastCam || (this._lastCam = { p: cam.clone(), t: this.now, v: new THREE.Vector3() });
    const dt = (this.now - l.t) / 1000;
    if (dt > 0.001) {
      _vel.subVectors(cam, l.p).divideScalar(dt);
      if (_vel.length() * dt > 0.02 * this.radius || dt > 1) l.v.set(0, 0, 0); else l.v.lerp(_vel, Math.min(1, dt * 4));
      l.p.copy(cam); l.t = this.now;
    }
    return l.v;
  }

  _dispatch() {
    if (!this.wanted.length || !this.workers.idle) return;
    // Map tiles on their way for a place that has none yet (the start, a jump, the end of a
    // fast trip): the fine ground waits for them a moment instead of being built from the
    // coarse maps and then built again.
    if ((this.tiles.busy && this.now - this.worldAt < 5000) || this.tiles.catchingUp) this.wanted = this.wanted.filter((n) => n.level <= 7);
    if (!this.wanted.length) return;
    this.wanted.sort((a, b) => a.prio - b.prio);
    let k = 0;
    while (this.workers.idle && k < this.wanted.length) {
      const node = this.wanted[k++];
      const slot = this._reserveSlot();
      if (slot < 0) { if (node.prio < 400 || node.prio >= 1000) this.stalled = true; break; }          // (ground built ahead of need does not count as running out)
      node.loading = true; node.reserved = slot;
      node.shadowSun = this._sun; node.serial = this.ringSerial; node.box = null;
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
        .then((res) => { node.shadowBusy = false; if (epoch === this.epoch && node.slot >= 0 && !node.dead) this.readyShadows.push({ node, shadow: res.shadow, sun: want }); })
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
    s.node.slot = -1; s.node = null;
    return best;
  }

  // --- map tiles round the traveller (terrain/tiles/tileRings.js) --------------------------
  // An elevation ring arrives, moves or goes: the height code here and in every worker
  // takes it, and the ground it changes is marked to be built again.
  setRing(slot, raster) {
    this.hs.setRing(slot, raster);
    // (posted without a transfer list: each worker gets its own copy)
    this.workers.tell(() => [{ type: 'ring', slot, raster: raster ? { width: raster.width, height: raster.height, zoom: raster.zoom, tx: raster.tx, ty: raster.ty, buffer: raster.data.buffer, water: raster.water } : null }]);
    const now = raster ? mosaicBox(raster.zoom, raster.tx, raster.ty, raster.width / 256) : null, old = this.ringBoxes[slot] || null;
    if (now) now.margin = 46 / 256 * 360 / 2 ** raster.zoom;          // the feathered edge, in degrees
    this.ringBoxes[slot] = now; (this.ringAt || (this.ringAt = []))[slot] = this.ringSerial + 1;
    // Where the mosaic has water (a coarse grid, cells of 16 pixels): a mosaic's rivers and
    // lakes are worked out afresh each time, from whatever the coarser mosaic said then, so
    // ground that holds water is built again even where the heights themselves did not change.
    const oldWet = (this.ringWet || (this.ringWet = []))[slot] || null;
    let nowWet = null;
    if (raster && raster.water) {
      const W = raster.width, G = W >> 4, grid = new Uint8Array(G * G), wt = raster.water, sg = wt.segs;
      for (let o = 0; o < sg.length; o += 10) {
        const pad = (Math.max(sg[o + 6], sg[o + 7]) * 2.2 + 12) / 25 + 1;        // (pixels, generously: banks included)
        const x0 = Math.max(0, Math.floor((Math.min(sg[o], sg[o + 2]) - pad) / 16)), x1 = Math.min(G - 1, Math.floor((Math.max(sg[o], sg[o + 2]) + pad) / 16));
        const y0 = Math.max(0, Math.floor((Math.min(sg[o + 1], sg[o + 3]) - pad) / 16)), y1 = Math.min(G - 1, Math.floor((Math.max(sg[o + 1], sg[o + 3]) + pad) / 16));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * G + x] = 1;
      }
      if (wt.lake) for (let y = 0; y < W; y += 4) for (let x = 0; x < W; x += 4) if (wt.lake[y * W + x]) grid[(y >> 4) * G + (x >> 4)] = 1;
      nowWet = { grid, G, n: 2 ** raster.zoom, tx: raster.tx, ty: raster.ty };
    }
    this.ringWet[slot] = nowWet;
    this.regions.push({ serial: ++this.ringSerial, old, now, slot, oldWet, nowWet });
    if (this.regions.length > 10) this.regions.shift();
  }

  // A picture ring (the land's colour): one texture the ground shader reads by place.
  setRingPicture(name, pic) {
    if (name !== 'colour') return;
    const u = this.shared;
    // what grows there (classes and canopy heights), for the workers that place the trees
    const c = pic && pic.cover ? { cls: pic.cover.cls.buffer, tall: pic.cover.tall.buffer, closed: pic.cover.closed.buffer, width: pic.width, zoom: pic.zoom, tx: pic.tx, ty: pic.ty } : null;
    this.workers.tell(() => [{ type: 'cover', cover: c }]);
    // (here too: the grass asks the main thread's height code what grows at a place)
    this.hs.setCover?.(pic && pic.cover ? { cls: pic.cover.cls, tall: pic.cover.tall, closed: pic.cover.closed, width: pic.width, zoom: pic.zoom, tx: pic.tx, ty: pic.ty } : null);
    this.coverSerial = c ? (this.coverSerial || 0) + 1 : 0;
    if (this.ringTex) { this.ringTex.dispose(); this.ringTex = null; }
    if (!pic) { u.tRingColour.value = this.textures.white; u.uRingColour.value.w = 0; return; }
    const tex = new THREE.DataTexture(pic.data, pic.width, pic.width, THREE.RGBAFormat, THREE.UnsignedByteType);
    let w = pic.width; tex.mipmaps = [{ data: pic.data, width: w, height: w }, ...pic.mips.map((d) => (w >>= 1, { data: d, width: w, height: w }))];
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    this.renderer.initTexture(tex);                 // to the GPU now, between frames
    this.ringTex = tex; u.tRingColour.value = tex;
    const n = 2 ** pic.zoom, tiles = pic.width / 256;
    // x: longitude of the left edge in turns; y: Mercator Y of the top edge (radians);
    // z: 1 / the mosaic's width in turns (its height in Mercator radians is 2 pi times less)
    u.uRingColour.value.set(pic.tx / n - 0.5, Math.PI * (1 - 2 * pic.ty / n), n / tiles, 1);
  }

  // Does ground built at `node.serial` lie where a later ring changed the heights?
  _stale(node) {
    const ser = node.serial || 0;
    let box = node.box;
    if (!box) {
      const c = node.center, len = c.length(), a = Math.min(90, node.radius / len * 57.3 * 1.2);
      const lat = Math.asin(Math.max(-1, Math.min(1, c.z / len))) * 57.29577951, lon = Math.atan2(c.y, c.x) * 57.29577951;
      box = node.box = { lat, lon, a, al: a / Math.max(0.05, Math.cos(Math.min(89, Math.abs(lat) + a) / 57.29577951)) };
    }
    const off = (b) => { const d = box.lon - (b.lon0 + b.lon1) / 2; return Math.abs(d - 360 * Math.round(d / 360)); };
    const touches = (b) => !!b && off(b) <= (b.lon1 - b.lon0) / 2 + box.al && box.lat - box.a <= b.lat0 && box.lat + box.a >= b.lat1;
    const inside = (b) => !!b && off(b) <= (b.lon1 - b.lon0) / 2 - b.margin - box.al && box.lat + box.a <= b.lat0 - b.margin && box.lat - box.a >= b.lat1 + b.margin;
    // (built before the oldest change still remembered: it has missed some, so it is stale)
    if (this.regions.length && ser < this.regions[0].serial - 1) return true;
    for (const g of this.regions) {
      if (g.serial <= ser) continue;
      if (!touches(g.old) && !touches(g.now)) continue;
      // (well inside a finer ring that was there before and still is: that one decides the heights)
      let under = false;
      for (let k = g.slot + 1; k < this.ringBoxes.length && !under; k++) under = inside(this.ringBoxes[k]) && (this.ringAt[k] || 0) < g.serial && (this.ringAt[k] || 0) <= ser;
      if (under) continue;
      // well inside both: the same heights as before, unless there is water here
      if (inside(g.old) && inside(g.now) && !this._wet(g.oldWet, box) && !this._wet(g.nowWet, box)) continue;
      return true;
    }
    return false;
  }

  // Is there water (a mosaic's coarse grid of it, see setRing) inside a patch's box?
  _wet(w, box) {
    if (!w) return false;
    const px = (lon) => { let t = (lon + 180) / 360 * w.n - w.tx; t -= w.n * Math.floor(t / w.n); return t * 16; };           // grid cells from the mosaic's left edge
    const py = (lat) => ((1 - Math.asinh(Math.tan(Math.max(-85, Math.min(85, lat)) * Math.PI / 180)) / Math.PI) / 2 * w.n - w.ty) * 16;
    const xc = px(box.lon), half = box.al / 360 * w.n * 16 + 1, y0 = Math.floor(py(box.lat + box.a)) - 1, y1 = Math.floor(py(box.lat - box.a)) + 1;
    for (let y = Math.max(0, y0); y <= Math.min(w.G - 1, y1); y++) for (let x = Math.max(0, Math.floor(xc - half)); x <= Math.min(w.G - 1, Math.floor(xc + half)); x++) if (w.grid[y * w.G + x]) return true;
    return false;
  }

  // Builds stale ground again, nearest first, when a worker has nothing newer to do.
  // Only once the maps on their way have all arrived, and only the ground that is on screen
  // (with the parents its shape leans on): a place's three rings arrive one after another,
  // and building after each of them built the same ground three times over, and four times
  // as many patches as were drawn (600 builds for 85 patches; on a phone every one that
  // comes in is a frame that can be late, and they came in for a minute on end). Ground
  // that is loaded but not on screen stays stale and is built again when it is drawn.
  _refresh() {
    this.staleData = 0;
    if (!this.ringSerial) return;
    const slots = this.pool.slots;
    // (ten seconds at most: maps that keep coming, on a steady flight, must not keep old ground for ever)
    if (!this.tiles.busyElevation) this._heldSince = this.now;
    const hold = this.tiles.busyElevation && this.now - (this._heldSince || 0) < 10000;
    let first = true;
    for (;;) {
      let best = null;
      for (let i = 0; i < slots.length; i++) {
        const n = slots[i].node;
        if (!n || n.dead || n.refreshBusy || (n.serial || 0) >= this.ringSerial || !(n.drawnAt >= this.frame - 2)) continue;
        if (!this._stale(n)) { n.serial = this.ringSerial; continue; }
        if (first) this.staleData++;
        if (!best || n.dist < best.dist) best = n;
      }
      first = false;
      if (!best || hold || !this.workers.idle) return;
      const node = best, epoch = this.epoch, serial = this.ringSerial, sun = this._sun;
      // (it counts as up to date from now on: its new build is on the way, and asking again
      // while that waits to be uploaded built the same ground over and over)
      node.refreshBusy = true; node.serial = serial; this.staleData--;
      this.workers.run({ type: 'chunk', face: node.face, level: node.level, ix: node.ix, iy: node.iy, sun, sunHalf: this._sunHalf })
        .then((res) => { node.refreshBusy = false; if (epoch === this.epoch && node.slot >= 0 && !node.dead) this.readyRefresh.push({ node, res, serial, sun }); })
        .catch((e) => { node.refreshBusy = false; console.error(e); });
    }
  }

  // A worker has finished a chunk: queue it for upload (see update).
  _onChunk(node, res) { this.ready.push({ node, res }); }

  // Ground built again from better maps takes its old place.
  _uploadRefresh(r) {
    const node = r.node, res = r.res;
    if (node.slot < 0 || node.dead) return;
    this.pool.upload(node.slot, res);
    this.uploads++;
    node.center.set(res.center[0], res.center[1], res.center[2]);
    node.radius = res.radius; node.minH = res.minH; node.maxH = res.maxH;
    node.shadowSun = r.sun; node.box = null;
    this.buildMs += res.ms; this.built++;
  }

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
    // Detail-texture coordinates: computed in doubles so they stay exact at planet scale.
    const K = (Math.PI * this.radius / 4) / DETAIL_TILE;
    const frac = (x) => ((x % 1) + 1) % 1;
    s.detail[0] = frac(node.a0 * K); s.detail[1] = frac(node.b0 * K); s.detail[2] = node.size * K;
    s.morphX = 1e15; s.fade = 0;
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

// A world map as a texture, decoded off the main thread (a 4096-wide JPEG decoded at its
// first draw call was most of the hitch on arriving at a world).
function loadMap(url, onLoad, onError) {
  const loader = new THREE.ImageBitmapLoader();
  loader.setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  loader.load(import.meta.env.BASE_URL + url, (bitmap) => onLoad(new THREE.Texture(bitmap)), undefined, onError);
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
