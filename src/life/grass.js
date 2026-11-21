// Grass round the traveller: tufts of bold blades on a lattice that is fixed to the ground
// and wraps round the camera, so walking through it brings no new geometry, only the
// tufts that leave behind coming in again ahead. Where grass grows, how thick and how dry
// comes from the land-cover map; the ground's height under each tuft from the height code.
//
// Nothing is kept per tuft. A tuft's place is its number on the lattice (gl_InstanceID)
// and a hash; what the ground is like there is read from a small table kept on the CPU
// (64 x 64 places 1.25 m apart, also wrapping: only the rows that come in ahead are worked
// out, a few a frame) and sent as a texture of four numbers a place: the ground's height
// above the anchor's sphere, how much grass (0..1), how dry it is (0 green .. 1 gold), spare.
//
// A world has grass if it lists `life.grass` ({ below: metres above the ground under which
// it is drawn }) and its tiles give a land-cover picture.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';

const GRID = 144, SPACING = 0.5;            // tufts a side, metres between them (a box of 72 m)
const TEX = 64, CELL = 1.25;                // the ground table: places a side, metres between them (80 m)
const BLADES = 8;
// How much grass a land-cover class has, and how dry it is (IGBP classes 1..17; 0: none known).
const AMOUNT = [0, 0.45, 0.4, 0.45, 0.55, 0.5, 0.35, 0.3, 0.8, 0.9, 1, 0.9, 0.9, 0, 0.85, 0, 0.04, 0];
const DRY = [0.5, 0.35, 0.1, 0.4, 0.25, 0.3, 0.75, 0.85, 0.6, 0.75, 0.8, 0.1, 0.45, 0.5, 0.4, 0.5, 0.9, 0.5];

export class Grass {
  constructor(terrain, wind) {
    this.terrain = terrain;
    // one tuft: BLADES blades, each a triangle; x: across the blade (-1, 1, 0 at the tip),
    // y: up it (0, 0, 1), and which blade it is
    const pos = new Float32Array(BLADES * 9), blade = new Float32Array(BLADES * 3);
    for (let b = 0; b < BLADES; b++) { pos.set([-1, 0, 0, 1, 0, 0, 0, 1, 0], b * 9); blade.set([b, b, b], b * 3); }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aBlade', new THREE.BufferAttribute(blade, 1));
    geo.instanceCount = GRID * GRID;
    this.data = new Float32Array(TEX * TEX * 4);
    this.held = new Int32Array(TEX * TEX * 2).fill(0x7fffffff);       // which lattice place each entry of the table holds
    this.tex = new THREE.DataTexture(this.data, TEX, TEX, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter; this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping; this.tex.needsUpdate = true;
    this.uniforms = {
      ...lightingUniforms(),
      tGrass: { value: this.tex }, uGrassCam: { value: new THREE.Vector3() },
      uGrassEast: { value: new THREE.Vector3(1, 0, 0) }, uGrassNorth: { value: new THREE.Vector3(0, 1, 0) }, uGrassUp: { value: new THREE.Vector3(0, 0, 1) },
      uGrassWind: wind, uGrassTime: { value: 0 }, uGrassThin: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, side: THREE.DoubleSide, uniforms: this.uniforms,
      defines: { ...atmosphereDefines(), GRID, SPACING: SPACING.toFixed(2), BOX: (GRID * SPACING).toFixed(1), TEX, CELL: CELL.toFixed(2), BLADES: BLADES.toFixed(1) },
      vertexShader: /* glsl */`
        in float aBlade;
        uniform sampler2D tGrass;
        uniform vec3 uGrassCam, uGrassEast, uGrassNorth, uGrassUp;       // the camera on the lattice: east, north (m from the anchor), height above the anchor's sphere
        uniform vec4 uGrassWind; uniform float uGrassTime, uGrassThin;
        out vec3 vRel; out vec3 vTone;       // x: how far up the blade, y: how dry, z: a number of the tuft's own
        vec2 hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
        // the ground table at a place on the lattice (m): the four entries round it, blended
        vec4 ground(vec2 at) {
          vec2 f = at / CELL, i = floor(f), t = f - i;
          ivec2 a = ivec2(mod(i, float(TEX))), b = ivec2(mod(i + 1.0, float(TEX)));
          return mix(mix(texelFetch(tGrass, a, 0), texelFetch(tGrass, ivec2(b.x, a.y), 0), t.x), mix(texelFetch(tGrass, ivec2(a.x, b.y), 0), texelFetch(tGrass, b, 0), t.x), t.y);
        }
        void main() {
          vec2 cell = vec2(float(gl_InstanceID % GRID), float(gl_InstanceID / GRID)), h = hash2(cell), h2 = hash2(cell + 71.3 + aBlade * 7.7);
          vec2 lp = (cell + 0.15 + 0.7 * h) * SPACING;
          vec2 rel2 = mod(lp - uGrassCam.xy, BOX) - 0.5 * BOX;            // from the camera, wrapped: the lattice stays on the ground
          vec2 at = rel2 + uGrassCam.xy;
          vec4 g = ground(at);
          float dist = length(rel2);
          // (out to nothing at the edge of the box; thinner where the map has less grass,
          // tuft by tuft; the governor's thinning takes whole tufts too)
          float keep = step(h.y, g.g * 1.15) * step(h.x, uGrassThin) * (1.0 - smoothstep(0.36 * BOX, 0.48 * BOX, dist));
          float tall = (0.26 + 0.38 * h2.x) * (0.6 + 0.6 * g.g) * (1.0 + 0.3 * g.b) * keep;
          // the blade: its foot somewhere in the tuft, turned its own way, leaning outward
          float turn = h2.y * 6.2831853, c = cos(turn), s = sin(turn);
          vec2 foot = rel2 + (h2 - 0.5) * 0.5 + (hash2(cell + aBlade) - 0.5) * 0.4;
          float wide = (0.016 + 0.018 * h2.x) * (1.0 + dist * 0.06);          // (wider far off: fewer pixels, the same mass)
          vec2 across = vec2(c, s) * wide * position.x, lean = vec2(-s, c) * (0.10 + 0.22 * h2.y) * tall;
          // wind: waves that run over the field, each blade a little in its own time
          vec2 w2 = vec2(dot(uGrassWind.xyz, uGrassEast), dot(uGrassWind.xyz, uGrassNorth));
          float wave = sin(dot(at, w2) * 0.35 - uGrassTime * (1.2 + 0.12 * uGrassWind.w) + h.x * 2.0) * 0.5 + 0.5;
          vec2 blow = w2 * tall * (0.05 + 0.03 * uGrassWind.w * (0.4 + 0.6 * wave));
          float y = position.y;
          vec2 p2 = foot + across * (1.0 - y) + (lean + blow) * y * y;
          float up = g.r - uGrassCam.z + tall * y * (1.0 - 0.25 * length(lean + blow) / max(tall, 0.01));
          vec3 rel = uGrassEast * p2.x + uGrassNorth * p2.y + uGrassUp * up;
          vRel = rel; vTone = vec3(y, g.b, h.x);
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        in vec3 vRel; in vec3 vTone;
        layout(location = 0) out vec4 fragColor;
        void main() {
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
          // green grass and dry grass, each darker at the foot (the blades shade each other there)
          vec3 green = mix(vec3(0.035, 0.06, 0.02), vec3(0.11, 0.17, 0.045), vTone.x), gold = mix(vec3(0.10, 0.06, 0.02), vec3(0.33, 0.20, 0.045), vTone.x);
          vec3 albedo = mix(green, gold, clamp(vTone.y + (vTone.z - 0.5) * 0.16, 0.0, 1.0)) * (0.85 + 0.3 * vTone.z);
          // (a field is lit as the ground it stands on: by the Sun's height over it, in the shade of whatever stands near)
          float nl = dot(up, uSunDir), lit = uPaint.x > 0.0 ? paintLit(nl * 0.7 + 0.3) * PI : max(nl, 0.0);
          vec3 col = albedo * (directSun(planetPos) * nearShadow(vRel + up * 0.15, up) * lit + skyLight(up, up) * (0.55 + 0.45 * vTone.x)) / PI;
          col = aerialPerspective(col, vRel);
          fragColor = vec4(col * uExposure, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.anchor = new THREE.Vector3(); this.anchorR = 0; this.has = false; this.def = null; this.pending = TEX * TEX; this.serial = -1;
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0]; this._d = [0, 0, 0];
    this.fraction = 1; this.time = 0;
  }

  setWorld(world) { this.def = world.life?.grass || null; this.has = false; this.mesh.visible = false; }

  // The governor: draw this share of the tufts.
  setFraction(f) { this.fraction = f; }

  get triangles() { return this.mesh.visible ? GRID * GRID * BLADES : 0; }
  // True while the ground table round the traveller is still being filled in (pictures wait for it).
  get busy() { return this.mesh.visible && this.pending > 0; }

  // What the ground is like at a place of the lattice (i east, j north, in CELL steps from the anchor).
  _sample(i, j, o) {
    const hs = this.terrain.hs, A = this.anchor, e = this._e, n = this._n, d = this._d, x = i * CELL, y = j * CELL;
    d[0] = A.x + e[0] * x + n[0] * y; d[1] = A.y + e[1] * x + n[1] * y; d[2] = A.z + e[2] * x + n[2] * y;
    const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
    const h = hs.height(d[0], d[1], d[2], 2.5), wet = hs.waterDepth > 0, slope = hs.baseSlope, cover = hs.coverAt ? hs.coverAt(d[0], d[1], d[2]) : -1;
    const cls = cover < 0 ? 0 : cover & 255, closed = cover < 0 ? 0 : (cover >> 16) / 255;
    // (none in water or on rock faces, thin under a closed canopy)
    let amount = wet ? 0 : (AMOUNT[cls] || 0) * (slope > 0.75 ? 0 : slope > 0.4 ? 1 - (slope - 0.4) / 0.35 : 1) * (1 - 0.55 * closed);
    const D = this.data;
    D[o] = hs.radius + h - this.anchorR; D[o + 1] = amount; D[o + 2] = DRY[cls] ?? 0.5; D[o + 3] = 0;
  }

  // Every frame. rig: the camera rig; dt (s); renderer (the table goes to the GPU between frames).
  update(rig, dt, renderer) {
    const def = this.def, t = this.terrain;
    const show = !!def && !!t.coverSerial && rig.agl < (def.below ?? 80) && this.fraction > 0;
    if (!show) { this.mesh.visible = false; return; }
    this.time += dt;
    const p = rig.pos, len = p.length();
    // A new anchor: the first time, far from the old one (the lattice's flat ground would
    // part from the round one), or when the maps under it have changed.
    const serial = t.coverSerial * 100000 + t.ringSerial;
    if (!this.has || this.anchor.distanceToSquared(p) > 250 * 250 || serial !== this.serial) {
      if (t.tiles.busy && this.has) { /* maps still arriving: keep what is there a moment longer */ } else {
        this.has = true; this.serial = serial; this.anchor.copy(p); this.anchorR = len;
        localFrame([p.x, p.y, p.z], this._e, this._n, this._u);
        this.held.fill(0x7fffffff);
        const u = this.uniforms; u.uGrassEast.value.set(...this._e); u.uGrassNorth.value.set(...this._n); u.uGrassUp.value.set(...this._u);
      }
    }
    const dx = p.x - this.anchor.x, dy = p.y - this.anchor.y, dz = p.z - this.anchor.z, e = this._e, n = this._n;
    const ce = dx * e[0] + dy * e[1] + dz * e[2], cn = dx * n[0] + dy * n[1] + dz * n[2];
    this.uniforms.uGrassCam.value.set(ce, cn, len - this.anchorR);
    this.uniforms.uGrassTime.value = this.time; this.uniforms.uGrassThin.value = this.fraction;
    // The table: every entry should hold the lattice place nearest the camera among those
    // it stands for. Those that do not are worked out, a few hundred a frame.
    const ci = Math.round(ce / CELL), cj = Math.round(cn / CELL), H = this.held, half = TEX >> 1;
    let budget = this.pending > TEX * 8 ? 420 : 200, pending = 0, changed = false;
    for (let b = 0; b < TEX; b++) {
      const j = cj - half + (((b - (cj - half)) % TEX) + TEX) % TEX;
      for (let a = 0; a < TEX; a++) {
        const i = ci - half + (((a - (ci - half)) % TEX) + TEX) % TEX, q = (b * TEX + a) * 2;
        if (H[q] === i && H[q + 1] === j) continue;
        if (budget <= 0) { pending++; continue; }
        this._sample(i, j, (b * TEX + a) * 4); H[q] = i; H[q + 1] = j; budget--; changed = true;
      }
    }
    this.pending = pending;
    if (changed) { this.tex.needsUpdate = true; renderer.initTexture(this.tex); }
    this.mesh.visible = true;
  }
}
