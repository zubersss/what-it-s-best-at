// The far forest: the trees one cannot walk among, out to some kilometres — the same trees
// as those near by, at the same places, thinned with distance.
//
// What was here before (`groves.js`): beyond the 240 m of trees.js, one site in eighteen on
// a lattice of its own, out to 2 km. Those were *other* trees than the ones a traveller had
// just walked past: at 240 m a wood thinned eighteen times over and every tree in it moved.
//
// How it works now:
//
// - **One lattice.** Every tree site has a **rank** (treeBlock.js, `siteRank`): a hash of
//   the site alone, 0..1, of nothing else. The trees of a band of ranks are the very trees
//   that stand there, at their own places, with their own shapes.
// - **How many stand at a distance.** `keep(d) = (full / d)^2`, capped at 1: full density
//   out to `full` metres, then thinner and thinner. A tree is drawn when its rank is under
//   `keep` at its own distance from the eye, and it **grows in** as that distance closes
//   (never pops). The thinned ones are drawn a little wider, so a wood keeps its cover.
// - **Tiles.** The ground is worked out in squares of tree blocks in one worker job
//   (treeBlock.js, `treeTile`), a band of ranks at a time: level 0 asks for the thickest
//   band (a quarter of all sites and up) over 8 x 8 blocks (889 m), level 1 for the quarter
//   of that band below it over 16 x 16, and so on. Each level's trees are drawn twice as
//   far out as the one before, so the same number of tiles, and about the same number of
//   trees in each, serve every distance. Every tile is one instanced mesh from a fixed
//   pool, filled when it arrives (and again, from the same data, when the traveller has
//   come close enough that more of its trees are wanted); nothing is worked out per tree
//   per frame.
// - **The join.** Inside `inner` (where trees.js draws its own trees) nothing here is
//   drawn: a clean cut by distance from the eye in both shaders, on the same tree, with
//   the same picture, size, turn and colours on both sides of it.
//
// A world has them with `life.trees.far: { full (m), radius (m), below (m above the ground:
// none from higher) }`; how many levels, how large a tile and how many trees one may hold
// are the same on every world (the constants below).
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';
import { VARIANTS } from './treeGeometry.js';
import { SPECIES } from './cover.js';
import { TREE_FLOATS, blockLon, blockDeg } from './treeBlock.js';
import { ATLAS_W, ATLAS_H } from './treeAtlasLayout.js';
import { PAINT_LEAF } from './trees.js';

const BASE_BLOCKS = 8;        // level 0: 8 x 8 tree blocks (889 m); level L: that doubled L times
const BAND = 4;               // each level's band of ranks is this much thinner than the one before
const LEVELS = 4;             // 1, 1/4, 1/16, 1/64 of the sites: the last band is everything below
const CAP = 6144;             // trees drawn from one tile (a fixed pool; the thickest band of a close tile)
const POOL = 40;              // tiles drawn at once
const MARGIN = 1.5;           // a tile is filled with rather more trees than are wanted now, so that coming nearer does not refill it at once

// Three bytes of colour in one number a float can hold exactly (the shader takes it apart).
// Leaves and bark are dark (0.03 to 0.6 of the light that falls on them): the byte covers
// that range, not 0 to 1, so that a far tree's green is the near one's to within a part in
// three hundred and the two cannot differ at the line where they meet.
const COLOUR_TOP = 0.75;
function pack(c) { const b = (v) => Math.round(Math.min(1, Math.max(0, v / COLOUR_TOP)) * 255); return b(c[0]) * 65536 + b(c[1]) * 256 + b(c[2]); }

// The band of ranks a level holds: [lo, hi).
function band(level) { return [level >= LEVELS - 1 ? 0 : BAND ** -(level + 1), BAND ** -level]; }

export class FarForest {
  // trees: the Trees (its tree shapes' far meshes say where each picture is in the atlas,
  // and its season and leaf colours are used here); terrain: the Terrain.
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
      // (x: the rosette's half width and y: its height, in tree heights; z, w: the tree card's)
      let hw = 0, tall = 0; for (let i = 0; i < 6; i++) { hw = Math.max(hw, Math.hypot(P[i * 3], P[i * 3 + 2])); tall = Math.max(tall, P[i * 3 + 1]); }
      roseGeo.push(new THREE.Vector4(r, P[12 * 3 + 1], hw, tall));
    }
    this.cells = shapes * VARIANTS;
    // three quads: position = (which: 0, 1 the crossed pictures of the whole tree, 2 the rosette; u; v)
    const corner = [], index = [];
    for (let q = 0; q < 3; q++) { for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) corner.push(q, u, v); index.push(q * 4, q * 4 + 2, q * 4 + 1, q * 4 + 1, q * 4 + 2, q * 4 + 3); }
    this.corner = new THREE.BufferAttribute(new Float32Array(corner), 3); this.index = index;
    // Shared by every tile; only where a tile stands is its own (uTileRel and its frame).
    this.shared = {
      ...lightingUniforms(),
      tTreeAtlas: trees.shared.tTreeAtlas,
      uSeason: trees.shared.uSeason,
      uRectTree: { value: rectTree }, uRectRose: { value: rectRose }, uRoseGeo: { value: roseGeo },
      // x: full density out to here (m), y: none beyond here (m), z: none nearer than here
      // (where the trees one walks among end), w: the share of them drawn (the governor)
      uFar: { value: new THREE.Vector4(450, 5600, 240, 1) },
    };
    this.vertexShader = /* glsl */`
      in vec4 iA;            // xyz: the tree's foot from the tile's origin (m, planet axes), w: its height (m)
      in vec4 iB;            // x: crown width, y: turn (radians), z: which picture (shape x variants + variant), w: a number of its own
      in vec4 iC;            // x: its rank, y: leaf colour packed, z: trunk colour packed, w: 1 or 2 if it drops its leaves
      uniform vec3 uTileRel, uTileEast, uTileNorth, uTileUp;
      uniform vec4 uRectTree[CELLS], uRectRose[CELLS], uRoseGeo[CELLS];
      uniform vec4 uFar;
      out vec3 vRel; out vec3 vN; out vec3 vLeafC; out vec3 vTrunkC; out vec2 vUv; out vec2 vOwn;
      vec3 unpack(float p) { float r = floor(p / 65536.0), g = floor((p - r * 65536.0) / 256.0); return vec3(r, g, p - r * 65536.0 - g * 256.0) * (${COLOUR_TOP.toFixed(3)} / 255.0); }
      void main() {
        vec3 foot = uTileRel + iA.xyz;
        float d = length(foot);
        // how many of the sites here carry a tree at this distance, and whether this one is
        // among them: it grows in as the traveller comes nearer, and never pops
        float keep = min(1.0, uFar.x * uFar.x / max(d * d, 1.0)) * uFar.w;
        float grow = smoothstep(iC.x * 0.85, iC.x + 1e-5, keep) * (1.0 - smoothstep(uFar.y * 0.86, uFar.y, d));
        // (inside the trees one walks among nothing here is drawn: they are the same trees)
        if (grow <= 0.0 || d < uFar.z) { vRel = vec3(0.0); vN = vec3(0.0, 0.0, 1.0); vLeafC = vec3(0.0); vTrunkC = vec3(0.0); vUv = vec2(0.0); vOwn = vec2(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        // (the thinned ones stand a little wider, so a wood keeps its cover)
        float wide = iB.x * clamp(pow(max(keep, 1e-3), -0.25), 1.0, 1.5);
        int cell = int(iB.z + 0.5);
        vec4 g = uRoseGeo[cell], rect;
        vec3 l;
        if (position.x < 1.5) {
          // one of the two crossed pictures of the whole tree (its foot at the bottom middle)
          float a = position.x * 1.5707963, x = (position.y - 0.5) * 2.0 * g.z * wide;
          l = vec3(cos(a) * x, (1.0 - position.z) * g.w, sin(a) * x); rect = uRectTree[cell];
        } else {
          // the rosette lying in its crown, for whoever looks down on it
          l = vec3((position.y - 0.5) * 2.0 * g.x * wide, g.y, (0.5 - position.z) * 2.0 * g.x * wide); rect = uRectRose[cell];
        }
        // (lit as one round mass: outward from the middle of the crown, and upward)
        vec3 nl = normalize(vec3(l.x, (l.y - 0.6) * 0.8 + 0.3, l.z) + vec3(0.0, 1e-3, 0.0));
        float c = cos(iB.y), s = sin(iB.y);
        l *= iA.w * grow;
        vRel = foot + uTileEast * (l.x * c - l.z * s) + uTileUp * l.y + uTileNorth * (l.x * s + l.z * c);
        vN = normalize(uTileEast * (nl.x * c - nl.z * s) + uTileUp * nl.y + uTileNorth * (nl.x * s + nl.z * c));
        vLeafC = unpack(iC.y); vTrunkC = unpack(iC.z); vOwn = vec2(iB.w, iC.w);
        vUv = vec2(mix(rect.x, rect.z, position.y), mix(rect.y, rect.w, position.z));
        gl_Position = projectionMatrix * viewMatrix * vec4(vRel, 1.0);
      }`;
    // The picture is the near trees' own far mesh, and this draws it as they do (life/trees.js,
    // the card path of its fragment shader): the same cut-out, the same greens, the same
    // season, the same light. The two meet at a line and nothing may show there.
    this.fragmentShader = /* glsl */`${LIGHTING_PARS}
      uniform sampler2D tTreeAtlas;        // r cover, g tone, b wood (life/treeAtlasGen.js)
      uniform vec3 uSeason;                // x: how far the leaves have turned, y: how bare, z: time
      in vec3 vRel; in vec3 vN; in vec3 vLeafC; in vec3 vTrunkC; in vec2 vUv; in vec2 vOwn;
      layout(location = 0) out vec4 fragColor;
      ${PAINT_LEAF}
      void main() {
        vec3 cut = texture(tTreeAtlas, vUv).rgb;
        // The cut-out, taken exactly as the near trees take it (trees.js): lower the farther
        // off, because averaged down a tree's needles and leaves cover less of a pixel and a
        // tree would thin to nothing. A threshold of its own here made the trees just outside
        // the near radius thinner than the same trees just inside it.
        vec2 px = vUv * vec2(${ATLAS_W}.0, ${ATLAS_H}.0);
        float lod = 0.5 * log2(max(max(dot(dFdx(px), dFdx(px)), dot(dFdy(px), dFdy(px))), 1.0));
        if (cut.r < mix(0.42, 0.16, clamp(lod / 3.0, 0.0, 1.0))) discard;
        bool wood = cut.b > 0.5;
        vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel), N = normalize(vN);
        // leaves in their season: green, then this tree's own gold, orange or red
        float turn = vOwn.y > 0.5 ? clamp(uSeason.x * 1.6 - vOwn.x * 0.6, 0.0, 1.0) : 0.0;
        vec3 autumn = vOwn.y > 1.5 ? vec3(0.42, 0.26, 0.03) : mix(vec3(0.40, 0.20, 0.03), vec3(0.30, 0.045, 0.02), smoothstep(0.35, 0.8, fract(vOwn.x * 7.3)));
        vec3 leafC = mix(vLeafC * (0.5 + 0.22 * fract(vOwn.x * 13.7)), autumn * 0.6, turn);
        if (uPaint.x > 0.0) leafC = paintLeaf(leafC) * mix(0.5, 1.12, smoothstep(-0.5, 0.6, dot(N, up)));
        leafC *= 0.46 + 0.6 * cut.g;
        // Far off a tree is a dark shape on the ground behind it, never bluer than that
        // ground: the cold blue-green a fir has near by (paintLeaf) and the blue of the sky's
        // light on a dark leaf made every far tree a teal speck on warm land. From the line
        // where the near trees end (nothing changes there) out to a kilometre and more its
        // green goes over to a dark warm olive, and less of the sky's blue is counted.
        float dFar = length(vRel), farW = smoothstep(300.0, 1300.0, dFar);
        leafC = mix(leafC, dot(leafC, vec3(0.3, 0.6, 0.1)) * vec3(0.86, 1.0, 0.40), 0.75 * farW);
        vec3 albedo = wood ? vTrunkC * 0.6 : leafC;
        float nl = dot(N, uSunDir), lit = wood ? max(nl, 0.0) : max(nl * 0.7 + 0.3, 0.0);
        if (uPaint.x > 0.0) { lit = mix(lit, paintLit(wood ? nl : nl * 0.75 + 0.25) * PI, uPaint.x); albedo = paintColour(albedo); leafC = paintColour(leafC); }
        // (seen against the Sun, foliage glows: the light comes through needles and leaves)
        float through = wood ? 0.0 : max(-nl, 0.0) * 0.28 + 0.4 * pow(max(dot(-V, uSunDir), 0.0), 4.0);
        float open = (wood ? 0.45 : mix(0.5, 1.0, smoothstep(-0.6, 0.8, dot(N, up)))) * (uPaint.x > 0.0 && !wood ? 0.8 : 1.0);
        vec3 sun = directSun(planetPos);
        // (in the shade of the wood a crown is never black: light has come down through the
        // leaves above it, green from the passage)
        vec3 glow = wood ? vec3(0.0) : leafC * sun * (0.07 * smoothstep(0.0, 0.25, dot(up, uSunDir))) * vec3(0.9, 1.2, 0.5);
        vec3 sky = skyLight(N, up); sky = mix(sky, vec3(dot(sky, vec3(0.3, 0.55, 0.15))) * vec3(1.06, 1.0, 0.86), 0.7 * farW);
        vec3 col = (albedo * (sun * lit + sky * open) + leafC * sun * through * vec3(1.1, 1.25, 0.6) + glow) / PI;
        // The air of a wood is row behind row of trees seen through one another: it belongs
        // to the near forest, and past a kilometre the air itself does that work. Carried all
        // the way out it made the far trees blue-grey specks on warm ground.
        col = aerialPerspective(forestAir(col, vRel, up, 1.0 - smoothstep(300.0, 1000.0, dFar)), vRel);
        fragColor = vec4(col * uExposure, 1.0);
      }`;
    this.defines = { ...atmosphereDefines(), CELLS: this.cells };
    this.mesh = new THREE.Group();          // every tile's mesh hangs here
    this.pool = [];
    for (let i = 0; i < POOL; i++) this.pool.push(this._slot());
    this.tiles = new Map();                  // 'level:ti:tj' -> tile
    this.asked = 0; this.frame = 0; this.serial = -1; this.missing = 0; this.lastMs = 0;
    this.fraction = 1; this.count = 0; this.held = 0; this.shown = false;
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0];
    this._p = new THREE.Vector3(); this._rel = new THREE.Vector3();
    this.setWorld(trees.world);
  }

  // One tile of the pool: its buffers are made once and filled when a tile lands in it.
  _slot() {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', this.corner);
    geo.setIndex(this.index);
    const at = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const iA = at(), iB = at(), iC = at();
    geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iC', iC);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: this.defines, side: THREE.DoubleSide,
      uniforms: { ...this.shared, uTileRel: { value: new THREE.Vector3() }, uTileEast: { value: new THREE.Vector3(1, 0, 0) }, uTileNorth: { value: new THREE.Vector3(0, 1, 0) }, uTileUp: { value: new THREE.Vector3(0, 0, 1) } },
      vertexShader: this.vertexShader, fragmentShader: this.fragmentShader,
    });
    const mesh = new THREE.Mesh(geo, material);
    // The vertices are worked out from the tile's own uniform, not from this matrix; the
    // mesh is put where the tile stands all the same, so that three can cull it against the
    // view and sort the tiles front to back as it does everything else.
    mesh.visible = false;
    mesh.renderOrder = 5;                   // after the ground: the canopy hides the lower part of a far tree for nothing
    this.mesh.add(mesh);
    return { geo, mesh, material, iA, iB, iC, tile: null };
  }

  setWorld(world) {
    this.world = world; this.def = world.life?.trees?.far || null;
    for (const t of this.tiles.values()) if (t.slot) this._free(t);
    this.tiles.clear(); this.asked = 0; this.serial = -1; this.missing = 0; this.count = 0; this.held = 0;
    for (const s of this.pool) { s.mesh.visible = false; s.geo.instanceCount = 0; s.tile = null; }
    const d = this.def;
    if (d) this.shared.uFar.value.set(d.full ?? 450, d.radius ?? 5600, 0, 1);
  }

  // The governor: this share of the far trees. It thins them and shortens their reach; it
  // never takes a wood away (a wood must still be a wood at the floor). The tiles are
  // filled again at the new share, so that a thinned forest costs the GPU less and not
  // merely looks thinner.
  setFraction(f) { if (f !== this.fraction) { this.fraction = f; for (const b of this.tiles.values()) b.fillEye = null; } }

  get triangles() { return this.count * 6; }
  // True while tiles that are wanted have not arrived (screenshots wait for them).
  get busy() { return !!this.def && this.shown && (this.asked > 0 || this.missing > 0); }

  _free(tile) {
    const s = tile.slot;
    if (!s) return;
    s.tile = null; s.mesh.visible = false; s.geo.instanceCount = 0; tile.slot = null;
  }

  // Every frame. rig: the camera rig.
  update(rig) {
    this.frame++;
    const def = this.def, t = this.terrain, tr = this.trees;
    const shown = !!def && this.fraction > 0 && tr.atlasReady && !!t.coverSerial && rig.agl < (def.below ?? 6000);
    this.shown = shown;
    if (!shown) {
      for (const s of this.pool) s.mesh.visible = false;
      this.count = 0; this.held = 0; this.missing = 0;
      return;
    }
    // The governor thins the trees and shortens their reach; the look of a wood is kept by
    // the widening the thinning carries with it (the vertex shader).
    const full = (def.full ?? 450), radius = (def.radius ?? 5600) * (0.55 + 0.45 * this.fraction);
    // (they begin where the trees one walks among end, and at the eye where none are drawn)
    const inner = tr.reach || 0;
    this.shared.uFar.value.set(full, radius, inner, this.fraction);
    const p = this._p.copy(rig.pos), R = this.world.radius, s0 = this._rel;
    const len = p.length(), lat = Math.asin(p.z / len) * 180 / Math.PI, lon = ((Math.atan2(p.y, p.x) * 180 / Math.PI) + 360) % 360;
    // new land cover or new elevation: every tile is worked out again (the ones that stand
    // stay until their new trees come)
    const serial = t.coverSerial * 100000 + t.ringSerial;
    if (serial !== this.serial) { this.serial = serial; for (const b of this.tiles.values()) b.stale = true; }

    // Which tiles are wanted: for each level, those near enough that some tree of its band
    // would be drawn (keep(d) > the band's lowest rank).
    const DEG = blockDeg(R), M = R * Math.PI / 180, cosLat = Math.cos(lat * Math.PI / 180);
    const want = [];
    this.missing = 0;
    for (let L = 0; L < LEVELS; L++) {
      const [lo] = band(L), blocks = BASE_BLOCKS * 2 ** L, side = blocks * DEG * M;
      // (how far this level's band reaches: none of it beyond where keep(d) falls to `lo`)
      const reach = Math.min(radius, lo > 0 ? full / Math.sqrt(lo) : radius);
      const tDeg = blocks * DEG, ti0 = Math.floor(lat / tDeg), nt = Math.ceil(reach / side) + 1;
      for (let ti = ti0 - nt; ti <= ti0 + nt; ti++) {
        const dLon = blockLon(ti * blocks, DEG), tLon = dLon * blocks, rows = Math.ceil(Math.round(360 / dLon) / blocks), tj0 = Math.floor(lon / tLon);
        for (let tu = tj0 - nt; tu <= tj0 + nt; tu++) {
          // the tile's middle and its nearest corner, in metres along the ground
          const dy = ((ti + 0.5) * tDeg - lat) * M, dx = ((tu + 0.5) * tLon - lon) * M * cosLat;
          const near = Math.hypot(Math.max(0, Math.abs(dx) - side / 2), Math.max(0, Math.abs(dy) - side / 2));
          if (near > reach) continue;
          const tj = ((tu % rows) + rows) % rows, key = L + ':' + ti + ':' + tj;
          let tile = this.tiles.get(key);
          if (!tile) { tile = { key, level: L, ti, tj, blocks, side, state: 0, fillEye: null, slot: null, data: null, count: 0, shown: 0, stale: false, asking: false }; this.tiles.set(key, tile); }
          tile.used = this.frame; tile.near = near; tile.mid = Math.hypot(dx, dy);
          if (tile.state !== 1 || tile.stale) this.missing++;
          want.push(tile);
        }
      }
    }
    want.sort((a, b) => a.near - b.near);

    // Ask the workers for the nearest tiles that have none of their trees yet, when the
    // ground and the trees near by have nothing waiting. One worker is always left free for
    // the ground, and the tiles are asked for nearest first.
    if (!t.tiles.busy && t.wanted.length === 0 && !(tr.missing > 0)) {
      // (one worker is kept for the ground where there is more than one; on a machine with a
      // single worker the far forest still gets it, or nothing would ever arrive)
      const free = t.workers.idle, room = (free > 1 ? Math.min(3, free - 1) : free) - this.asked;
      for (let i = 0, got = 0; got < room && i < want.length; i++) {
        const tile = want[i];
        if (tile.asking || (tile.state === 1 && !tile.stale)) continue;
        if (!this._ask(tile)) break;
        got++;
      }
    }

    // which tiles get a place in the pool: the nearest first
    const take = want.filter((b) => b.state === 1).slice(0, POOL);
    const keptTiles = new Set(take);
    for (const s of this.pool) if (s.tile && !keptTiles.has(s.tile)) this._free(s.tile);
    let drawn = 0, given = 0;
    for (const tile of take) {
      if (!tile.slot) {
        const s = this.pool.find((q) => !q.tile);
        if (!s) continue;
        s.tile = tile; tile.slot = s; tile.fillEye = null;
      }
      // Filled again when the traveller has come a tenth of the way nearer to it: the trees
      // it holds are half as many again as stand in the picture, which covers that much
      // closing (and the nearest tiles are the cheapest to fill).
      const s = tile.slot;
      if (!tile.fillEye || tile.fillEye.distanceToSquared(p) > (0.1 * Math.max(tile.near, full)) ** 2) this._fill(tile, s0.subVectors(tile.origin, p), p);
      s.material.uniforms.uTileRel.value.subVectors(tile.origin, p);
      s.mesh.position.copy(s.material.uniforms.uTileRel.value);
      // (the tile is drawn when a tree of its band could be; the view culls it by its bounds)
      const vis = tile.count > 0 && tile.near <= Math.min(radius, band(tile.level)[0] > 0 ? full / Math.sqrt(band(tile.level)[0]) : radius);
      s.mesh.visible = vis;
      if (vis) { drawn += tile.shown; given += tile.count; }
    }
    // (count: the trees standing in the picture. held: the instances the tiles hand the
    // GPU, some of which the vertex shader throws out as too thin for their distance.)
    this.count = drawn; this.held = given;
    // Tiles left behind are let go, with the trees the worker gave them (a few hundred
    // kilobytes each): a traveller who comes back pays one worker job for them again.
    if (this.frame % 60 === 0) for (const [k, b] of this.tiles) if (this.frame - b.used > 240 && !b.asking) { this._free(b); this.tiles.delete(k); }
  }

  // Asks a worker for a tile's trees. False when no worker took it.
  _ask(tile) {
    const t = this.terrain, def = this.def, [lo, hi] = band(tile.level), epoch = t.epoch, serialAt = this.serial;
    const job = t.workers.run({ type: 'treeTile', ti: tile.ti, tj: tile.tj, blocks: tile.blocks, spacing: def.spacing ?? this.trees.def?.spacing ?? 7, lo, hi });
    if (!job) return false;
    tile.asking = true; this.asked++;
    job.then((res) => {
      this.asked--; tile.asking = false;
      if (epoch !== t.epoch) return;                       // another world by now
      tile.origin = new THREE.Vector3(...res.origin);
      tile.data = new Float32Array(res.trees); tile.have = res.count; tile.state = 1;
      tile.stale = serialAt !== this.serial; tile.fillEye = null;
      this.lastMs = res.ms ?? 0;
    }).catch((e) => { this.asked--; tile.asking = false; if (tile.state === 0) this.tiles.delete(tile.key); console.error(e); });
    return true;
  }

  // Fill a tile's buffers from the trees the worker gave it: the ones that stand in the
  // picture from where the traveller is, each tested by **its own** distance, and half as
  // many again so that moving does not fill it again at once. (By the tile's nearest corner
  // instead, a tile 900 m across handed the GPU four times the trees it drew: the far side
  // of it wants a twentieth of what the near side does.)
  _fill(tile, eyeRel, eye) {
    const s = tile.slot, T = tile.data, iA = s.iA.array, iB = s.iB.array, iC = s.iC.array;
    localFrame([tile.origin.x, tile.origin.y, tile.origin.z], this._e, this._n, this._u);
    const u = s.material.uniforms;
    u.uTileEast.value.set(...this._e); u.uTileNorth.value.set(...this._n); u.uTileUp.value.set(...this._u);
    const uf = this.shared.uFar.value, full2 = uf.x ** 2, inner2 = uf.z ** 2, far2 = uf.y ** 2, thin = uf.w;
    const ex = eyeRel.x, ey = eyeRel.y, ez = eyeRel.z;
    let n = 0, bound2 = 0, shown = 0, margin = MARGIN;
    for (let pass = 0; pass < 4; pass++) {
      n = 0; bound2 = 0; shown = 0;
      for (let k = 0, q = 0; k < tile.have; k++, q += TREE_FLOATS) {
        const x = T[q], y = T[q + 1], z = T[q + 2], rank = T[q + 8];
        const dx = x + ex, dy = y + ey, dz = z + ez, d2 = dx * dx + dy * dy + dz * dz;
        const keep = Math.min(1, full2 / Math.max(d2, 1)) * thin;
        if (rank >= margin * keep) continue;
        if (n >= CAP) break;
        // (how many of them the vertex shader will draw, for the read-out)
        if (rank < keep && d2 > inner2 && d2 < far2) shown++;
        const sp = SPECIES[T[q + 6]], own = T[q + 7];
        iA[n * 4] = x; iA[n * 4 + 1] = y; iA[n * 4 + 2] = z; iA[n * 4 + 3] = T[q + 3];
        iB[n * 4] = T[q + 4]; iB[n * 4 + 1] = T[q + 5]; iB[n * 4 + 2] = sp.arch * VARIANTS + Math.min(VARIANTS - 1, Math.floor(((own * 7.31) % 1) * VARIANTS)); iB[n * 4 + 3] = own;
        iC[n * 4] = rank; iC[n * 4 + 1] = pack(sp.leaf); iC[n * 4 + 2] = pack(sp.trunk); iC[n * 4 + 3] = sp.fall;
        const r2 = x * x + y * y + z * z + T[q + 3] * T[q + 3];
        if (r2 > bound2) bound2 = r2;
        n++;
      }
      // (more trees than a tile may draw: the thinnest of them go)
      if (n < CAP) break;
      margin *= 0.6;
    }
    tile.count = n; tile.shown = shown; tile.capped = margin < MARGIN;
    tile.fillEye = (tile.fillEye || new THREE.Vector3()).copy(eye);
    s.geo.instanceCount = n;
    s.geo.boundingSphere.center.set(0, 0, 0); s.geo.boundingSphere.radius = Math.sqrt(bound2) + 20;
    for (const a of [s.iA, s.iB, s.iC]) { a.clearUpdateRanges?.(); a.addUpdateRange?.(0, Math.max(1, n) * 4); a.needsUpdate = true; }
  }
}


export { BASE_BLOCKS, BAND, LEVELS, band, CAP };
