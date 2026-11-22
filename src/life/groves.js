// The far trees: beyond the ring of trees one walks among (trees.js, 240 m), a wider ring of
// tree shapes out to some two kilometres, one in every few that stand there, each the
// picture of a whole tree on two crossed cards with a rosette in its crown (what the far
// mesh of trees.js is). They rise out of the forest the ground shader raises as a whole
// (terrainMaterial.js, the canopy): its even surface gets crowns that stand out of it,
// and a wooded skyline gets trees.
//
// Why: trees were drawn within 240 m of the eye only. From the air there were none at
// all (nothing within 240 m but air), and a traveller coming down saw "a green plot of
// land" until the last seconds before landing.
//
// One draw call: every far tree is an instance of the same three quads, and its shape (one
// of 8 x 3 pictures in the trees' atlas) is a number of its own. Where they stand is
// worked out in the terrain workers by the trees' own rule (treeBlock.js) on larger,
// sparser blocks: the same land cover, slopes, water and tree line, another lattice.
// A world has them with `life.trees.far: { radius (m), spacing (m), below (m above the
// ground: none from higher) }`. Drawn after the ground, so what the canopy hides of a
// tree costs nothing.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';
import { VARIANTS } from './treeGeometry.js';
import { SPECIES } from './cover.js';
import { TREE_FLOATS, blockLon } from './treeBlock.js';
import { PAINT_LEAF } from './trees.js';

const GROVE_DEG = 0.01, SALT = 7717;      // a block of far trees: 0.01 degrees (1.1 km); its lattice's own number
const CAP = 16384;                         // far trees drawn at once
const REBUILD_M = 90;                      // the list is made again when the traveller has moved this far

export class Groves {
  // trees: the Trees (its tree shapes' far meshes say where each picture is in the atlas, its
  // picture is the one used here); terrain: the Terrain.
  constructor(trees, terrain) {
    this.trees = trees; this.terrain = terrain;
    // Where each shape's pictures are, read off its far mesh (treeGeometry.js, `whole`): the
    // first two quads show the whole tree, the third the rosette in its crown.
    const shapes = trees.geos.length, rectTree = [], rectRose = [], roseGeo = [];
    for (let a = 0; a < shapes; a++) for (let v = 0; v < VARIANTS; v++) {
      const g = trees.geos[a][v][2], P = g.attributes.position.array, U = g.attributes.aUv.array;
      const box = (from, to) => { let u0 = 1, v0 = 1, u1 = 0, v1 = 0; for (let i = from; i < to; i++) { u0 = Math.min(u0, U[i * 2]); u1 = Math.max(u1, U[i * 2]); v0 = Math.min(v0, U[i * 2 + 1]); v1 = Math.max(v1, U[i * 2 + 1]); } return new THREE.Vector4(u0, v0, u1, v1); };
      rectTree.push(box(0, 6)); rectRose.push(box(12, 18));
      let r = 0; for (let i = 12; i < 18; i++) r = Math.max(r, Math.abs(P[i * 3]));
      // (x: the cell's half width and y: its height, in tree heights, from the tree's own quads)
      let hw = 0, tall = 0; for (let i = 0; i < 6; i++) { hw = Math.max(hw, Math.hypot(P[i * 3], P[i * 3 + 2])); tall = Math.max(tall, P[i * 3 + 1]); }
      roseGeo.push(new THREE.Vector4(r, P[12 * 3 + 1], hw, tall));
    }
    this.cells = shapes * VARIANTS;
    // three quads: aCorner = (which: 0, 1 the crossed pictures, 2 the rosette; u; v)
    const corner = [], index = [];
    for (let q = 0; q < 3; q++) { for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) corner.push(q, u, v); index.push(q * 4, q * 4 + 2, q * 4 + 1, q * 4 + 1, q * 4 + 2, q * 4 + 3); }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(corner), 3));
    geo.setIndex(index);
    const at = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.iA = at(4); this.iB = at(4); this.iC = at(3);
    geo.setAttribute('iA', this.iA); geo.setAttribute('iB', this.iB); geo.setAttribute('iC', this.iC);
    geo.instanceCount = 0;
    this.geo = geo;
    this.uniforms = {
      ...lightingUniforms(),
      tTreeAtlas: trees.shared.tTreeAtlas,
      uAnchorRel: { value: new THREE.Vector3() }, uGroveEast: { value: new THREE.Vector3(1, 0, 0) }, uGroveNorth: { value: new THREE.Vector3(0, 1, 0) }, uGroveUp: { value: new THREE.Vector3(0, 0, 1) },
      uRectTree: { value: rectTree }, uRectRose: { value: rectRose }, uRoseGeo: { value: roseGeo },
      uRing: { value: new THREE.Vector2(240, 2000) },      // metres from the eye: they grow in from x (where the trees one walks among end), are gone by y
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), CELLS: this.cells }, uniforms: this.uniforms, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        in vec4 iA;            // xyz: the tree's foot from the anchor (m, planet axes), w: its height (m)
        in vec4 iB;            // x: crown width, y: turn (radians), z: which picture (shape x variants + variant), w: a number of its own
        in vec3 iC;            // its leaves' colour
        uniform vec3 uAnchorRel, uGroveEast, uGroveNorth, uGroveUp;
        uniform vec4 uRectTree[CELLS], uRectRose[CELLS], uRoseGeo[CELLS];
        uniform vec2 uRing;
        out vec3 vRel; out vec3 vN; out vec3 vLeafC; out vec2 vUv; out float vOwn;
        void main() {
          vec3 foot = uAnchorRel + iA.xyz;
          float d = length(foot);
          // (they grow out of the canopy where the nearer trees end, and sink back into it at
          // the ring's edge: none pops in or out)
          float grow = smoothstep(uRing.x * 0.8, uRing.x, d) * (1.0 - smoothstep(uRing.y * 0.82, uRing.y, d));
          if (grow <= 0.0) { vRel = vec3(0.0); vN = vec3(0.0, 0.0, 1.0); vLeafC = vec3(0.0); vUv = vec2(0.0); vOwn = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          int cell = int(iB.z + 0.5);
          vec4 g = uRoseGeo[cell], rect;
          vec3 l;
          if (position.x < 1.5) {
            // one of the two crossed pictures of the whole tree (its foot at the bottom middle)
            float a = position.x * 1.5707963, x = (position.y - 0.5) * 2.0 * g.z * iB.x;
            l = vec3(cos(a) * x, (1.0 - position.z) * g.w, sin(a) * x); rect = uRectTree[cell];
          } else {
            // the rosette lying in its crown, for whoever looks down on it
            l = vec3((position.y - 0.5) * 2.0 * g.x * iB.x, g.y, (0.5 - position.z) * 2.0 * g.x * iB.x); rect = uRectRose[cell];
          }
          // (lit as one round mass: outward from the middle of the crown, and upward)
          vec3 nl = normalize(vec3(l.x, (l.y - 0.6) * 0.8 + 0.3, l.z) + vec3(0.0, 1e-3, 0.0));
          float c = cos(iB.y), s = sin(iB.y);
          l *= iA.w * grow;
          vRel = foot + uGroveEast * (l.x * c - l.z * s) + uGroveUp * l.y + uGroveNorth * (l.x * s + l.z * c);
          vN = normalize(uGroveEast * (nl.x * c - nl.z * s) + uGroveUp * nl.y + uGroveNorth * (nl.x * s + nl.z * c));
          vLeafC = iC; vOwn = iB.w;
          vUv = vec2(mix(rect.x, rect.z, position.y), mix(rect.y, rect.w, position.z));
          gl_Position = projectionMatrix * viewMatrix * vec4(vRel, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform sampler2D tTreeAtlas;        // r cover, g tone, b wood (life/treeAtlasGen.js)
        in vec3 vRel; in vec3 vN; in vec3 vLeafC; in vec2 vUv; in float vOwn;
        layout(location = 0) out vec4 fragColor;
        ${PAINT_LEAF}
        void main() {
          vec3 cut = texture(tTreeAtlas, vUv).rgb;
          if (cut.r < 0.3) discard;
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), N = normalize(vN);
          // (the same greens as the trees near by: trees.js)
          vec3 leafC = vLeafC * (0.5 + 0.22 * fract(vOwn * 13.7));
          if (uPaint.x > 0.0) leafC = paintLeaf(leafC) * mix(0.5, 1.12, smoothstep(-0.5, 0.6, dot(N, up)));
          leafC *= 0.46 + 0.6 * cut.g;
          vec3 albedo = cut.b > 0.5 ? vec3(0.085, 0.07, 0.055) : leafC;
          float nl = dot(N, uSunDir), lit = max(nl * 0.7 + 0.3, 0.0);
          if (uPaint.x > 0.0) { lit = mix(lit, paintLit(nl * 0.75 + 0.25) * PI, uPaint.x); albedo = paintColour(albedo); }
          float open = mix(0.5, 1.0, smoothstep(-0.6, 0.8, dot(N, up))) * (uPaint.x > 0.0 ? 0.8 : 1.0);
          vec3 col = albedo * (directSun(planetPos) * lit + skyLight(N, up) * open) / PI;
          col = aerialPerspective(forestAir(col, vRel, up, 1.0), vRel);
          fragColor = vec4(col * uExposure, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.mesh.renderOrder = 5;              // after the ground (0): the canopy hides the lower part of every far tree
    this.blocks = new Map();                 // 'gi:gj' -> { state, origin, trees, count, used, stale, asking }
    this.asked = 0; this.frame = 0; this.serial = -1; this.missing = 0;
    this.anchor = new THREE.Vector3(); this.builtAt = new THREE.Vector3(1e12, 0, 0); this.dirty = false;
    this.fraction = 1; this.count = 0;
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0];
    this.setWorld(trees.world);
  }

  setWorld(world) {
    this.world = world; this.def = world.life?.trees?.far || null;
    this.blocks.clear(); this.asked = 0; this.dirty = true; this.serial = -1; this.missing = 0;
    this.geo.instanceCount = 0; this.mesh.visible = false; this.count = 0;
  }

  // The governor: this share of the far trees (and of their distance).
  setFraction(f) { if (f !== this.fraction) { this.fraction = f; this.dirty = true; } }
  get triangles() { return this.mesh.visible ? this.count * 6 : 0; }
  // True while blocks that are wanted have not arrived (screenshots wait for them).
  get busy() { return !!this.def && this.mesh.visible && (this.asked > 0 || this.missing > 0); }

  // Every frame. rig: the camera rig.
  update(rig) {
    this.frame++; this.missing = 0;
    const def = this.def, t = this.terrain, tr = this.trees;
    const show = !!def && this.fraction > 0 && tr.atlasReady && !!t.coverSerial && rig.agl < (def.below ?? 5000);
    if (!show) { this.mesh.visible = false; return; }
    const radius = (def.radius ?? 2000) * Math.sqrt(this.fraction);
    // (they begin where the trees one walks among end; from higher than those are drawn, at the eye)
    const nearShown = tr.def && rig.agl < (tr.def.below ?? 1500), inner = nearShown ? (tr.def.radius ?? 240) * tr.fraction : 0;
    this.uniforms.uRing.value.set(inner, radius);
    const p = rig.pos, len = p.length(), lat = Math.asin(p.z / len) * 180 / Math.PI, lon = ((Math.atan2(p.y, p.x) * 180 / Math.PI) + 360) % 360;
    const serial = t.coverSerial * 100000 + t.ringSerial;
    if (serial !== this.serial) { this.serial = serial; for (const b of this.blocks.values()) b.stale = true; }
    const gi0 = Math.floor(lat / GROVE_DEG), nb = Math.ceil(radius / 1112);
    let want = null, wantD = 1e9;
    for (let gi = gi0 - nb; gi <= gi0 + nb; gi++) {
      const dLon = blockLon(gi, GROVE_DEG), count = Math.round(360 / dLon), gj0 = Math.floor(lon / dLon);
      for (let gu = gj0 - nb; gu <= gj0 + nb; gu++) {
        const dy = ((gi + 0.5) * GROVE_DEG - lat) * 111200, dx = ((gu + 0.5) * dLon - lon) * 111200 * Math.cos(lat * Math.PI / 180), d = Math.hypot(dx, dy);
        if (d > radius + 800) continue;
        const gj = ((gu % count) + count) % count, key = gi + ':' + gj, b = this.blocks.get(key);
        if (b) { b.used = this.frame; if (!b.stale || b.asking) continue; }
        this.missing++;
        if (d < wantD) { wantD = d; want = [gi, gj, key]; }
      }
    }
    // (asked for when the workers have nothing better to do: the ground and the trees near by come first)
    if (want && this.asked < 1 && t.workers.idle && !t.tiles.busy && t.wanted.length === 0 && !(tr.missing > 0)) {
      const [gi, gj, key] = want, epoch = t.epoch, job = t.workers.run({ type: 'trees', bi: gi, bj: gj, spacing: def.spacing ?? 30, deg: GROVE_DEG, salt: SALT });
      if (job) {
        let b = this.blocks.get(key);
        if (!b) { b = { state: 0, used: this.frame }; this.blocks.set(key, b); }
        b.asking = true; this.asked++;
        job.then((res) => {
          this.asked--; b.asking = false;
          if (epoch !== t.epoch) return;                       // another world by now
          b.state = 1; b.stale = false; b.origin = res.origin; b.count = res.count; b.trees = new Float32Array(res.trees);
          this.dirty = true;
        }, () => { this.asked--; b.asking = false; });
      }
    }
    // blocks left far behind are let go
    if (this.frame % 240 === 0) for (const [k, b] of this.blocks) if (this.frame - b.used > 600 && !b.asking) this.blocks.delete(k);
    if (this.dirty || this.builtAt.distanceToSquared(p) > REBUILD_M * REBUILD_M) this._build(rig, radius);
    this.uniforms.uAnchorRel.value.subVectors(this.anchor, p);
    this.mesh.visible = this.count > 0;
  }

  _build(rig, radius) {
    this.dirty = false; this.builtAt.copy(rig.pos);
    const p = rig.pos, A = this.anchor.copy(p);
    localFrame([A.x, A.y, A.z], this._e, this._n, this._u);
    const u = this.uniforms;
    u.uGroveEast.value.set(...this._e); u.uGroveNorth.value.set(...this._n); u.uGroveUp.value.set(...this._u);
    const iA = this.iA.array, iB = this.iB.array, iC = this.iC.array, r2 = (radius + REBUILD_M) * (radius + REBUILD_M);
    let n = 0;
    for (const b of this.blocks.values()) {
      if (b.state !== 1 || !b.count) continue;
      const ox = b.origin[0] - A.x, oy = b.origin[1] - A.y, oz = b.origin[2] - A.z, T = b.trees;
      for (let k = 0, q = 0; k < b.count && n < CAP; k++, q += TREE_FLOATS) {
        const x = ox + T[q], y = oy + T[q + 1], z = oz + T[q + 2];
        if (x * x + y * y + z * z > r2) continue;
        const sp = SPECIES[T[q + 6]], own = T[q + 7];
        iA[n * 4] = x; iA[n * 4 + 1] = y; iA[n * 4 + 2] = z; iA[n * 4 + 3] = T[q + 3];
        iB[n * 4] = T[q + 4]; iB[n * 4 + 1] = T[q + 5]; iB[n * 4 + 2] = sp.arch * VARIANTS + Math.min(VARIANTS - 1, Math.floor(((own * 7.31) % 1) * VARIANTS)); iB[n * 4 + 3] = own;
        iC[n * 3] = sp.leaf[0]; iC[n * 3 + 1] = sp.leaf[1]; iC[n * 3 + 2] = sp.leaf[2];
        n++;
      }
    }
    this.count = n; this.geo.instanceCount = n;
    for (const a of [this.iA, this.iB, this.iC]) { a.clearUpdateRanges?.(); a.addUpdateRange?.(0, Math.max(1, n) * a.itemSize); a.needsUpdate = true; }
  }
}
