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
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';
import { makeTreeGeometries } from './treeGeometry.js';
import { SPECIES } from './cover.js';
import { BLOCK_DEG, TREE_FLOATS, blockLon } from './treeBlock.js';

const NEAR_CAP = 768, FAR_CAP = 4096;       // instances of one shape, near mesh and far mesh
const NEAR_M = 110;                          // trees nearer than this get the near mesh
const REBUILD_M = 25;                        // the instance lists are made again when the traveller has moved this far

const TREE_VERT = /* glsl */`
in vec4 iA;            // xyz: the tree's foot from the anchor (m, planet axes), w: its height (m)
in vec4 iB;            // x: crown width, y: turn (radians), z: a number of its own (0..1), w: 1 if it drops its leaves
in float aLeaf, aSway;
uniform vec3 uAnchorRel, uTreeEast, uTreeNorth, uTreeUp;
uniform vec4 uTreeWind;      // xyz: where the wind blows to (unit), w: its speed (m/s)
uniform vec3 uSeason;        // x: how far the leaves have turned, y: how bare the branches are, z: time (s)
uniform float uTreeRadius;
vec3 treePosition(out vec3 foot, out float leaf) {
  foot = uAnchorRel + iA.xyz;
  float c = cos(iB.y), s = sin(iB.y);
  vec3 p = position;
  // bare in winter: the leaves draw in to the branches (the trunk stays)
  float gone = aLeaf * iB.w * uSeason.y;
  p.xz *= iB.x * (1.0 - 0.85 * gone);
  vec3 l = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c) * iA.w;
  // wind: the whole tree leans a little and its crown swings, gust by gust, each tree in
  // its own time; more the higher and the farther out a leaf is
  float gust = 0.6 + 0.4 * sin(uSeason.z * 0.7 + dot(iA.xyz, uTreeWind.xyz) * 0.05 + iB.z * 6.28);
  float swing = sin(uSeason.z * (1.6 + iB.z) + iB.z * 40.0 + p.y * 3.0) * 0.5 + 0.5 * sin(uSeason.z * 3.7 + iB.z * 17.0 + p.x * 9.0);
  float bend = aSway * iA.w * (0.004 * uTreeWind.w * gust + 0.0025 * uTreeWind.w * swing);
  // (out to nothing at the edge of the trees' radius, so none pops in)
  float fade = 1.0 - smoothstep(uTreeRadius * 0.82, uTreeRadius, length(foot));
  leaf = aLeaf;
  return foot + (uTreeEast * l.x + uTreeUp * l.y + uTreeNorth * l.z + uTreeWind.xyz * bend) * fade;
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
      ...lightingUniforms(),
      uAnchorRel: { value: new THREE.Vector3() }, uTreeEast: { value: new THREE.Vector3(1, 0, 0) }, uTreeNorth: { value: new THREE.Vector3(0, 1, 0) }, uTreeUp: { value: new THREE.Vector3(0, 0, 1) },
      uTreeWind: terrain.shared.uWind, uSeason: { value: new THREE.Vector3() }, uTreeRadius: { value: 240 },
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.shared, side: THREE.DoubleSide,
      vertexShader: /* glsl */`${TREE_VERT}
        in vec3 iC; in vec3 iD;
        out vec3 vRel; out vec3 vN; out vec3 vLeafC; out vec3 vTrunkC; out float vLeaf; out float vY; out vec2 vOwn;
        void main() {
          vec3 foot; float leaf;
          vec3 rel = treePosition(foot, leaf);
          vRel = rel; vN = treeNormal(); vLeaf = leaf; vY = position.y; vLeafC = iC; vTrunkC = iD; vOwn = vec2(iB.z, iB.w);
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform vec3 uSeason;
        in vec3 vRel; in vec3 vN; in vec3 vLeafC; in vec3 vTrunkC; in float vLeaf; in float vY; in vec2 vOwn;
        layout(location = 0) out vec4 fragColor;
        void main() {
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel);
          vec3 N = normalize(vN);
          if (vLeaf < 0.5) N *= sign(dot(N, V));                // (trunks are open tubes: light the side that is seen)
          // leaves in their season: green, then each tree's own gold, orange or red
          float turn = vOwn.y > 0.5 ? clamp(uSeason.x * 1.6 - vOwn.x * 0.6, 0.0, 1.0) : 0.0;
          vec3 autumn = vOwn.y > 1.5 ? vec3(0.42, 0.26, 0.03) : mix(vec3(0.40, 0.20, 0.03), vec3(0.30, 0.045, 0.02), smoothstep(0.35, 0.8, fract(vOwn.x * 7.3)));
          // (a crown is leaves and the gaps between them: as a surface it is darker than a leaf)
          vec3 leafC = mix(vLeafC * (0.5 + 0.22 * fract(vOwn.x * 13.7)), autumn * 0.6, turn);
          vec3 albedo = mix(vTrunkC, leafC, step(0.5, vLeaf));
          // (the shadow is asked for a little outside the crown: on a mass of a few faces the
          // shadow map would draw the faces)
          float shadow = nearShadow(vRel + N * (vLeaf > 0.5 ? 0.45 : 0.05), N);
          vec3 sun = directSun(planetPos) * shadow;
          // a crown is not a wall: light wraps round it, and some comes through from behind
          float nl = dot(N, uSunDir), lit = vLeaf > 0.5 ? max(nl * 0.7 + 0.3, 0.0) : max(nl, 0.0);
          float through = vLeaf > 0.5 ? max(-nl, 0.0) * 0.28 : 0.0;
          // inside and under a crown less sky is seen
          float open = vLeaf > 0.5 ? mix(0.35, 1.0, smoothstep(-0.6, 0.8, dot(N, up))) : mix(0.22, 0.6, smoothstep(0.0, 0.5, vY));
          vec3 col = (albedo * (sun * lit + skyLight(N, up) * open + planetShine(N)) + leafC * sun * through * vec3(1.1, 1.25, 0.6)) / PI;
          col = aerialPerspective(col, vRel);
          fragColor = vec4(col * uExposure, 1.0);
        }`,
    });
    this.depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, colorWrite: false, uniforms: this.shared, side: THREE.DoubleSide,
      vertexShader: /* glsl */`${TREE_VERT}
        void main() { vec3 foot; float leaf; gl_Position = projectionMatrix * viewMatrix * vec4(treePosition(foot, leaf), 1.0); }`,
      fragmentShader: /* glsl */`layout(location = 0) out vec4 fragColor; void main() { fragColor = vec4(1.0); }`,
    });
    // one mesh per shape and distance: [shape][0 near, 1 far]
    this.sets = this.geos.map((pair) => pair.map((base, lod) => {
      const cap = lod ? FAR_CAP : NEAR_CAP, geo = new THREE.InstancedBufferGeometry();
      for (const name of ['position', 'normal', 'aLeaf', 'aSway']) geo.setAttribute(name, base.attributes[name]);
      const at = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
      const iA = at(4), iB = at(4), iC = at(3), iD = at(3);
      geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iC', iC); geo.setAttribute('iD', iD);
      geo.instanceCount = 0;
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = false; mesh.visible = false;
      return { geo, mesh, cap, iA, iB, iC, iD, count: 0, tris: base.attributes.position.count / 3, lod };
    }));
    this.meshes = this.sets.flat().map((s) => s.mesh);
    this.blocks = new Map();                 // 'bi:bj' -> { state: 0 asked, 1 ready, origin, trees, count, used }
    this.asked = 0; this.frame = 0; this.serial = -1;
    this.anchor = new THREE.Vector3(); this.builtAt = new THREE.Vector3(1e12, 0, 0); this.dirty = false;
    this.fraction = 1; this.shadowsFar = true; this.count = 0; this.triangles = 0;
    this.names = '';                          // the species standing nearest, for anyone who asks
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0];
    this.setWorld(world);
  }

  setWorld(world) {
    this.world = world; this.def = world.life?.trees || null;
    this.blocks.clear(); this.asked = 0; this.dirty = true; this.serial = -1;
    for (const s of this.sets.flat()) { s.count = 0; s.geo.instanceCount = 0; s.mesh.visible = false; }
    this.count = 0; this.triangles = 0; this.names = ''; this.falling = 0;
  }

  // True while blocks that are wanted have not arrived (screenshots wait for them).
  get busy() { return !!this.def && (this.asked > 0 || this.missing > 0); }

  // Every frame. rig: the camera rig; day: the day of the year (0..365.25); time (s).
  update(rig, day, time) {
    this.frame++; this.missing = 0;
    const def = this.def, t = this.terrain;
    if (!def) return;
    const R = this.world.radius, radius = (def.radius ?? 240) * this.fraction;
    const show = rig.agl < (def.below ?? 1500) && !!t.coverSerial;
    for (const s of this.sets.flat()) s.mesh.visible = show && s.count > 0;
    if (!show) return;
    // (a new land-cover picture or new elevation: every tree is worked out again)
    const serial = t.coverSerial * 100000 + t.ringSerial;
    if (serial !== this.serial) { this.serial = serial; this.blocks.clear(); this.dirty = true; }
    const p = rig.pos, len = p.length(), lat = Math.asin(p.z / len) * 180 / Math.PI, lon = ((Math.atan2(p.y, p.x) * 180 / Math.PI) + 360) % 360;
    const bi0 = Math.floor(lat / BLOCK_DEG), nb = Math.ceil(radius / 111.2);
    let want = null, wantD = 1e9;
    for (let bi = bi0 - nb; bi <= bi0 + nb; bi++) {
      const dLon = blockLon(bi), bj0 = Math.floor(lon / dLon);
      for (let bj = bj0 - nb; bj <= bj0 + nb; bj++) {
        // (the block's middle, in metres from the traveller along the ground)
        const dy = ((bi + 0.5) * BLOCK_DEG - lat) * 111200, dx = ((bj + 0.5) * dLon - lon) * 111200 * Math.cos(lat * Math.PI / 180), d = Math.hypot(dx, dy);
        if (d > radius + 80) continue;
        const key = bi + ':' + bj, b = this.blocks.get(key);
        if (b) { b.used = this.frame; continue; }
        this.missing++;
        if (d < wantD) { wantD = d; want = [bi, bj, key]; }
      }
    }
    // ask for the nearest missing block when a worker has nothing better to do
    if (want && this.asked < 2 && t.workers.idle && !t.tiles.busy && t.wanted.length === 0) {
      const [bi, bj, key] = want, epoch = t.epoch, serialAt = this.serial, job = t.workers.run({ type: 'trees', bi, bj, spacing: def.spacing ?? 7 });
      if (job) {
        const b = { state: 0, used: this.frame }; this.blocks.set(key, b); this.asked++;
        job.then((res) => { this.asked--; if (epoch !== t.epoch || serialAt !== this.serial) { if (this.blocks.get(key) === b) this.blocks.delete(key); return; } b.state = 1; b.origin = res.origin; b.trees = new Float32Array(res.trees); b.count = res.count; this.dirty = true; })
          .catch((e) => { this.asked--; this.blocks.delete(key); console.error(e); });
      }
    }
    if (this.frame % 600 === 0) for (const [key, b] of this.blocks) if (b.state === 1 && b.used < this.frame - 1200) this.blocks.delete(key);
    if (this.dirty || this.builtAt.distanceToSquared(p) > REBUILD_M * REBUILD_M) this._build(rig, radius);
    // per frame: where the anchor is from the camera, the season, the wind's clock
    const u = this.shared;
    u.uAnchorRel.value.subVectors(this.anchor, p);
    u.uTreeRadius.value = radius;
    // The year in the leaves: y runs 0 at the spring equinox of this hemisphere, 0.5 at the
    // autumn one. Leaves turn through the autumn, are gone in winter, back in spring; only
    // away from the tropics.
    const y = (((day - 80) / 365.25 + (lat < 0 ? 0.5 : 0)) % 1 + 1) % 1, sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    const far = sm(25, 38, Math.abs(lat)), bare = (y > 0.5 ? sm(0.62, 0.72, y) : 1 - sm(0.02, 0.12, y)) * far;
    u.uSeason.value.set(sm(0.46, 0.62, y) * (y > 0.4 ? 1 : 0) * far, bare, time);
  }

  // The instance lists, from the blocks that are in: near trees to the near meshes, the
  // rest to the far ones, all measured from an anchor at the traveller's place.
  _build(rig, radius) {
    this.dirty = false; this.builtAt.copy(rig.pos);
    const p = rig.pos, A = this.anchor.copy(p);
    localFrame([A.x, A.y, A.z], this._e, this._n, this._u);
    const u = this.shared;
    u.uTreeEast.value.set(...this._e); u.uTreeNorth.value.set(...this._n); u.uTreeUp.value.set(...this._u);
    for (const s of this.sets.flat()) s.count = 0;
    const r2 = (radius + 10) * (radius + 10), near2 = NEAR_M * NEAR_M;
    let nearest = 1e9, names = new Map(), falling = 0;
    for (const b of this.blocks.values()) {
      if (b.state !== 1 || !b.count) continue;
      const ox = b.origin[0] - A.x, oy = b.origin[1] - A.y, oz = b.origin[2] - A.z, T = b.trees;
      if (ox * ox + oy * oy + oz * oz > (radius + 200) * (radius + 200)) continue;
      for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) {
        const x = ox + T[q], y = oy + T[q + 1], z = oz + T[q + 2], d2 = x * x + y * y + z * z;
        if (d2 > r2) continue;
        const sp = SPECIES[T[q + 6]], set = this.sets[sp.arch][d2 < near2 ? 0 : 1];
        if (set.count >= set.cap) continue;
        const i = set.count++, own = T[q + 7];
        set.iA.array.set([x, y, z, T[q + 3]], i * 4);
        set.iB.array.set([T[q + 4], T[q + 5], own, sp.fall], i * 4);
        set.iC.array.set(sp.leaf, i * 3); set.iD.array.set(sp.trunk, i * 3);
        if (d2 < 60 * 60) { names.set(sp.name, (names.get(sp.name) || 0) + 1); if (sp.fall) falling++; }
        if (d2 < nearest) nearest = d2;
      }
    }
    let count = 0, tris = 0;
    for (const s of this.sets.flat()) {
      s.geo.instanceCount = s.count; s.mesh.visible = s.count > 0;
      if (s.count) { for (const a of [s.iA, s.iB, s.iC, s.iD]) { a.clearUpdateRanges?.(); a.addUpdateRange?.(0, s.count * a.itemSize); a.needsUpdate = true; } }
      count += s.count; tris += s.count * s.tris;
    }
    this.count = count; this.triangles = tris; this.falling = falling;
    this.names = [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]).join(', ');
  }

  // Governor: draw the trees to a shorter distance (1: all the way).
  setFraction(f) { if (f !== this.fraction) { this.fraction = f; this.dirty = true; } }
}
