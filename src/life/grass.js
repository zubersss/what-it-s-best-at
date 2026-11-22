// Grass round the traveller: tufts of bold blades on a lattice that is fixed to the ground
// and wraps round the camera, so walking through it brings no new geometry, only the
// tufts that leave behind coming in again ahead. Where grass grows, how thick and how dry
// comes from the land-cover map; the ground's height under each tuft from the height code.
//
// Nothing is kept per tuft. A tuft's place is its number on the lattice (gl_InstanceID)
// and a hash; what the ground is like there is read from a small table kept on the CPU
// (64 x 64 places 1.25 m apart, also wrapping: only the rows that come in ahead are worked
// out, a few a frame) and sent as a texture of four numbers a place: the ground's height
// above the anchor's sphere, how much grass (0..1), how dry it is (0 green .. 1 gold), and
// the flowers there (whole part: which kind; fraction: how many).
//
// Three lattices are drawn from the one table: grass close by (thick, a box of 26 m),
// grass farther out (72 m), and flowers (43 m). Which flowers grow where follows the land
// cover, the latitude and the height, in patches some tens of metres across: a meadow has
// two or three kinds, each in drifts of its own. Tufts are drawn in a scrambled order, so
// the governor's share is a count of instances: the work goes down with it.
//
// A world has grass if it lists `life.grass` ({ below: metres above the ground under which
// it is drawn }) and its tiles give a land-cover picture.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { localFrame } from '../core/ephemeris.js';

const TEX = 64, CELL = 1.25;                // the ground table: places a side, metres between them (80 m)
// The lattices: tufts a side, metres between them, blades a tuft, a blade's width (m).
const NEAR = { grid: 120, spacing: 0.22, blades: 8, wide: 0.012, seed: 0 };
const FAR = { grid: 144, spacing: 0.5, blades: 7, wide: 0.02, seed: 37 };
const FLOWERS = { grid: 96, spacing: 0.45, seed: 91 };
// How much grass a land-cover class has, and how dry it is (IGBP classes 1..17; 0: none known).
const AMOUNT = [0, 0.6, 0.55, 0.6, 0.7, 0.65, 0.4, 0.3, 0.85, 0.9, 1, 0.9, 0.9, 0, 0.9, 0, 0.04, 0];
const DRY = [0.5, 0.35, 0.1, 0.4, 0.25, 0.3, 0.75, 0.85, 0.6, 0.75, 0.8, 0.1, 0.45, 0.5, 0.4, 0.5, 0.9, 0.5];
// Flowers. Kinds: 1 daisies (white), 2 poppies (red), 3 lupins (blue spikes), 4 buttercups
// (yellow), 5 fireweed and heather (pink spikes), 6 orange poppies and marigolds,
// 7 the big pink flowers of the wet tropics. By land-cover class: the kinds that grow
// there and how many (0..1 of the lattice at the heart of a drift).
const FLORA = [null, [[3, 5], 0.45], [[7, 1, 7], 0.5], [[5, 3], 0.45], [[3, 1, 4], 0.5], [[1, 3, 4], 0.5], [[6, 2], 0.4], [[6, 4], 0.3], [[4, 2], 0.45],
  [[4, 6], 0.45], [[1, 2, 4, 3], 0.8], [[5, 1, 4], 0.55], [[2, 1], 0.45], null, [[1, 2, 4], 0.7], null, [[6], 0.12], null];
const TUNDRA = [[5, 1, 4], 0.5], ALPINE = [[3, 5, 1], 0.6];

// Smooth noise over the world's own coordinates (metres): the drifts stay where they are
// whatever the lattice is anchored to.
function hash3(x, y, z) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}

const PRELUDE = /* glsl */`
  uniform sampler2D tGrass;
  uniform vec3 uGrassCam, uGrassEast, uGrassNorth, uGrassUp;       // the camera on the lattice: east, north (m from the anchor), height above the anchor's sphere
  uniform vec4 uGrassWind; uniform float uGrassTime;
  out vec3 vRel; out vec4 vAlb;       // the surface's colour, and how much of the sky's light it has
  vec2 hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
  // the ground table at a place on the lattice (m): the four entries round it, blended
  vec4 ground(vec2 at) {
    vec2 f = at / CELL, i = floor(f), t = f - i;
    ivec2 a = ivec2(mod(i, float(TEX))), b = ivec2(mod(i + 1.0, float(TEX)));
    return mix(mix(texelFetch(tGrass, a, 0), texelFetch(tGrass, ivec2(b.x, a.y), 0), t.x), mix(texelFetch(tGrass, ivec2(a.x, b.y), 0), texelFetch(tGrass, b, 0), t.x), t.y);
  }
  // this instance's place on the lattice (instances are drawn in a scrambled order: a
  // smaller count thins the field evenly)
  vec2 latticeCell() { int id = (gl_InstanceID * 7919) % (GRID * GRID); return vec2(float(id % GRID), float(id / GRID)); }
  // the wind over the field: waves that run across it (x, y: which way and how hard; z: 0..1 where the wave is)
  vec3 windAt(vec2 at, float own) {
    vec2 w2 = vec2(dot(uGrassWind.xyz, uGrassEast), dot(uGrassWind.xyz, uGrassNorth));
    float wave = sin(dot(at, w2) * 0.35 - uGrassTime * (1.2 + 0.12 * uGrassWind.w) + own * 2.0) * 0.5 + 0.5;
    return vec3(w2 * (0.05 + 0.03 * uGrassWind.w * (0.4 + 0.6 * wave)), wave);
  }`;

const GRASS_VERT = /* glsl */`
  in float aBlade;
  ${PRELUDE}
  void main() {
    vec2 cell = latticeCell() + SEED, h = hash2(cell), h2 = hash2(cell + 71.3 + aBlade * 7.7);
    vec2 lp = (cell + 0.15 + 0.7 * h) * SPACING;
    vec2 rel2 = mod(lp - uGrassCam.xy, BOX) - 0.5 * BOX;            // from the camera, wrapped: the lattice stays on the ground
    vec2 at = rel2 + uGrassCam.xy;
    vec4 g = ground(at);
    float dist = length(rel2);
    // (out to nothing at the edge of the box; thinner where the map has less grass, tuft by tuft)
    float keep = step(h.y, g.g * 1.15) * (1.0 - smoothstep(0.36 * BOX, 0.48 * BOX, dist));
    // (stretches of taller and shorter, greener and drier grass, some metres across)
    float lie = sin(at.x * 0.13 + 2.0 * sin(at.y * 0.071)) * sin(at.y * 0.11 + 1.7 + 1.5 * sin(at.x * 0.053));
    float tall = (0.24 + 0.34 * h2.x) * (0.6 + 0.6 * g.g) * (1.0 + 0.3 * g.b) * (0.85 + 0.3 * lie) * keep;
    // the blade: its foot somewhere in the tuft, turned its own way, leaning outward
    float turn = h2.y * 6.2831853, c = cos(turn), s = sin(turn);
    vec2 foot = rel2 + ((h2 - 0.5) * 0.5 + (hash2(cell + aBlade) - 0.5) * 0.4) * min(1.0, SPACING * 2.0);
    float wide = WIDE * (0.8 + 0.9 * h2.x) * (1.0 + dist * 0.06);          // (wider far off: fewer pixels, the same mass)
    vec2 across = vec2(c, s) * wide * position.x, lean = vec2(-s, c) * (0.10 + 0.22 * h2.y) * tall;
    vec3 w = windAt(at, h.x);
    vec2 blow = w.xy * tall;
    float y = position.y;
    vec2 p2 = foot + across * (1.0 - y) + (lean + blow) * y * y;
    float up = g.r - uGrassCam.z + tall * y * (1.0 - 0.25 * length(lean + blow) / max(tall, 0.01));
    vRel = uGrassEast * p2.x + uGrassNorth * p2.y + uGrassUp * up;
    // green grass and dry grass, each darker at the foot (the blades shade each other there)
    vec3 green = mix(vec3(0.035, 0.06, 0.02), vec3(0.11, 0.17, 0.045), y), gold = mix(vec3(0.10, 0.06, 0.02), vec3(0.33, 0.20, 0.045), y);
    vAlb = vec4(mix(green, gold, clamp(g.b + (h.x - 0.5) * 0.16 - 0.22 * lie, 0.0, 1.0)) * (0.85 + 0.3 * h.x) * (0.92 + 0.12 * lie), 0.55 + 0.45 * y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vRel, 1.0);
  }`;

// A flower: a stem (part 0), five petals (1..5) round a middle (6). Daisies, poppies and
// the like hold the petals as a cup turned up and toward whoever looks; lupins and
// fireweed stack them up the top of the stem.
const FLOWER_VERT = /* glsl */`
  in float aPart;
  ${PRELUDE}
  vec3 petalColour(float kind, float own) {
    if (kind < 1.5) return mix(vec3(0.82, 0.82, 0.76), vec3(0.85, 0.78, 0.42), step(0.8, own));
    if (kind < 2.5) return mix(vec3(0.70, 0.045, 0.025), vec3(0.78, 0.13, 0.03), own);
    if (kind < 3.5) return mix(vec3(0.16, 0.14, 0.58), vec3(0.40, 0.20, 0.62), own);
    if (kind < 4.5) return mix(vec3(0.82, 0.60, 0.03), vec3(0.85, 0.72, 0.10), own);
    if (kind < 5.5) return mix(vec3(0.68, 0.16, 0.42), vec3(0.55, 0.22, 0.55), own);
    if (kind < 6.5) return mix(vec3(0.88, 0.36, 0.02), vec3(0.85, 0.52, 0.03), own);
    return mix(vec3(0.82, 0.08, 0.28), vec3(0.85, 0.80, 0.74), step(0.7, own));
  }
  void main() {
    vec2 cell = latticeCell() + SEED, h = hash2(cell), h2 = hash2(cell + 23.9);
    vec2 lp = (cell + 0.1 + 0.8 * h) * SPACING;
    vec2 rel2 = mod(lp - uGrassCam.xy, BOX) - 0.5 * BOX, at = rel2 + uGrassCam.xy;
    vec4 g = ground(at);
    // (which kind grows here is not something to blend: the nearest entry says)
    float fl = texelFetch(tGrass, ivec2(mod(floor(at / CELL + 0.5), float(TEX))), 0).a, kind = floor(fl + 0.001), dist = length(rel2);
    float keep = step(0.5, kind) * step(h2.x, fract(fl + 0.001) * 1.1) * step(0.1, g.g) * (1.0 - smoothstep(0.36 * BOX, 0.48 * BOX, dist));
    float spike = (abs(kind - 3.0) < 0.5 || abs(kind - 5.0) < 0.5) ? 1.0 : 0.0;
    // the stem: as tall as the grass round it and a little more, so the heads stand clear
    float stem = (0.50 + 0.22 * h2.y) * (0.6 + 0.6 * g.g) * (1.0 + 0.3 * g.b) * (1.0 + 0.3 * spike) * keep;
    float size = (kind > 6.5 ? 0.065 : (abs(kind - 2.0) < 0.5 || kind > 5.5) ? 0.044 : 0.034) * (0.8 + 0.4 * h.y) * (1.0 + dist * 0.045) * keep;
    vec3 w = windAt(at, h.x);
    vec2 top2 = rel2 + ((h - 0.5) * 0.24 + w.xy * 1.3) * stem;
    float base = g.r - uGrassCam.z;
    vec3 foot = uGrassEast * rel2.x + uGrassNorth * rel2.y + uGrassUp * base, top = uGrassEast * top2.x + uGrassNorth * top2.y + uGrassUp * (base + stem);
    vec3 toCam = normalize(-top), side = normalize(cross(uGrassUp, toCam) + uGrassEast * 1e-4);
    vec3 col; float sky = 1.0;
    if (aPart < 0.5) {
      vRel = mix(foot, top, position.y) + side * position.x * 0.007 * (1.0 + dist * 0.07) * (1.0 - 0.5 * position.y) * step(0.001, keep);
      col = mix(vec3(0.04, 0.07, 0.02), vec3(0.09, 0.15, 0.04), position.y); sky = 0.6 + 0.4 * position.y;
    } else if (spike > 0.5) {
      // a spike: the petals one above another down from the tip, left and right in turn, smaller toward the tip
      float k = aPart - 1.0, sgn = mod(k, 2.0) < 0.5 ? 1.0 : -1.0, shrink = 1.0 - 0.12 * k;
      vec2 q = aPart > 5.5 ? vec2(0.0, 0.3) : vec2(position.x * 0.9 * sgn + 0.25 * sgn * position.y, -position.y * 0.55 - (4.0 - k) * 0.62) * shrink;
      vRel = top + (side * q.x + uGrassUp * q.y) * size * 1.5;
      col = petalColour(kind, h2.y) * (0.8 + 0.25 * position.y);
    } else {
      // a cup of five petals, turned up and toward whoever looks
      vec3 nrm = normalize(uGrassUp * 0.8 + toCam * 0.55 + (uGrassEast * (h.x - 0.5) + uGrassNorth * (h.y - 0.5)) * 0.6);
      vec3 a = normalize(cross(nrm, uGrassEast + uGrassUp * 0.3)), b = cross(nrm, a);
      bool mid = aPart > 5.5;
      float ang = (aPart - 1.0) * 1.2566371 + h.x * 6.2831853, c = cos(ang), s = sin(ang);
      vec2 q0 = position.xy * (mid ? vec2(0.55, 0.34) : vec2(1.0)) - (mid ? vec2(0.0, 0.17) : vec2(0.0)), q = vec2(q0.x * c - q0.y * s, q0.x * s + q0.y * c);
      vRel = top + (a * q.x + b * q.y + nrm * (mid ? 0.12 : 0.32 * position.y * position.y)) * size;
      col = mid ? (abs(kind - 2.0) < 0.5 ? vec3(0.03, 0.02, 0.03) : kind > 6.5 ? vec3(0.85, 0.70, 0.10) : vec3(0.80, 0.52, 0.03)) : petalColour(kind, h2.y) * (0.78 + 0.3 * position.y);
    }
    vAlb = vec4(col, sky);
    gl_Position = projectionMatrix * viewMatrix * vec4(vRel, 1.0);
  }`;

const FRAG = /* glsl */`${LIGHTING_PARS}
  in vec3 vRel; in vec4 vAlb;
  layout(location = 0) out vec4 fragColor;
  void main() {
    vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
    // (a field is lit as the ground it stands on: by the Sun's height over it, in the shade of whatever stands near)
    float nl = dot(up, uSunDir), lit = uPaint.x > 0.0 ? paintLit(nl * 0.7 + 0.3) * PI : max(nl, 0.0);
    vec3 col = vAlb.rgb * (directSun(planetPos) * nearShadow(vRel + up * 0.15, up) * lit + skyLight(up, up) * vAlb.a) / PI;
    col = aerialPerspective(col, vRel);
    fragColor = vec4(col * uExposure, 1.0);
  }`;

export class Grass {
  constructor(terrain, wind) {
    this.terrain = terrain;
    this.data = new Float32Array(TEX * TEX * 4);
    this.held = new Int32Array(TEX * TEX * 2).fill(0x7fffffff);       // which lattice place each entry of the table holds
    this.tex = new THREE.DataTexture(this.data, TEX, TEX, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter; this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping; this.tex.needsUpdate = true;
    this.uniforms = {
      ...lightingUniforms(),
      tGrass: { value: this.tex }, uGrassCam: { value: new THREE.Vector3() },
      uGrassEast: { value: new THREE.Vector3(1, 0, 0) }, uGrassNorth: { value: new THREE.Vector3(0, 1, 0) }, uGrassUp: { value: new THREE.Vector3(0, 0, 1) },
      uGrassWind: wind, uGrassTime: { value: 0 },
    };
    // a field: one tuft (or flower) of triangles, drawn once for every place of its lattice
    const field = (f, tris, attr, values, vertexShader) => {
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3)); geo.setAttribute(attr, new THREE.BufferAttribute(new Float32Array(values), 1));
      geo.instanceCount = f.grid * f.grid;
      const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, side: THREE.DoubleSide, uniforms: this.uniforms, vertexShader, fragmentShader: FRAG,
        defines: { ...atmosphereDefines(), GRID: f.grid, SPACING: f.spacing.toFixed(3), BOX: (f.grid * f.spacing).toFixed(2), TEX, CELL: CELL.toFixed(2), SEED: f.seed.toFixed(1), WIDE: (f.wide || 0).toFixed(4) },
      });
      const mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false;
      return { geo, mesh, all: f.grid * f.grid, tris: tris.length / 9 };
    };
    // a tuft: each blade a triangle; x: across the blade (-1, 1, 0 at the tip), y: up it, and which blade it is
    const tuft = (f) => { const p = [], b = []; for (let i = 0; i < f.blades; i++) { p.push(-1, 0, 0, 1, 0, 0, 0, 1, 0); b.push(i, i, i); } return field(f, p, 'aBlade', b, GRASS_VERT); };
    // a flower: the stem as a blade, each petal a triangle from the middle outward (x across, y out), the middle a triangle
    const flower = (f) => { const p = [-1, 0, 0, 1, 0, 0, 0, 1, 0], b = [0, 0, 0]; for (let i = 1; i <= 6; i++) { p.push(0, 0, 0, -0.62, 1, 0, 0.62, 1, 0); b.push(i, i, i); } return field(f, p, 'aPart', b, FLOWER_VERT); };
    this.fields = [tuft(NEAR), tuft(FAR), flower(FLOWERS)];
    this.mesh = new THREE.Group(); for (const f of this.fields) this.mesh.add(f.mesh);
    this.mesh.visible = false;
    this.anchor = new THREE.Vector3(); this.anchorR = 0; this.has = false; this.def = null; this.pending = TEX * TEX; this.serial = -1;
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0]; this._d = [0, 0, 0];
    this.fraction = 1; this.time = 0;
  }

  setWorld(world) { this.def = world.life?.grass || null; this.has = false; this.mesh.visible = false; this.seaLevel = world.surface.sea ? (world.surface.sea.level ?? 0) : null; }

  // The governor: draw this share of the tufts.
  setFraction(f) { this.fraction = f; for (const fl of this.fields) fl.geo.instanceCount = Math.round(fl.all * Math.min(1, f)); }

  get triangles() { return this.mesh.visible ? this.fields.reduce((a, f) => a + f.geo.instanceCount * f.tris, 0) : 0; }
  // True while the ground table round the traveller is still being filled in (pictures wait for it).
  get busy() { return this.mesh.visible && this.pending > 0; }

  // What the ground is like at a place of the lattice (i east, j north, in CELL steps from the anchor).
  _sample(i, j, o) {
    const hs = this.terrain.hs, A = this.anchor, e = this._e, n = this._n, d = this._d, x = i * CELL, y = j * CELL;
    d[0] = A.x + e[0] * x + n[0] * y; d[1] = A.y + e[1] * x + n[1] * y; d[2] = A.z + e[2] * x + n[2] * y;
    const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
    // (wet: in water, or no higher than the sea's level, as the rocks ask: radar elevation has
    // the sea at exactly zero near land, with no depth to tell it by, and tufts and flowers
    // stood on the water off every low shore)
    const h = hs.height(d[0], d[1], d[2], 2.5), wet = hs.waterDepth > 0 || (this.seaLevel != null && h <= this.seaLevel + 0.3), slope = hs.baseSlope, cover = hs.coverAt ? hs.coverAt(d[0], d[1], d[2]) : -1;
    const cls = cover < 0 ? 0 : cover & 255, closed = cover < 0 ? 0 : (cover >> 16) / 255;
    // (none in water or on rock faces, thin under a closed canopy)
    let amount = wet ? 0 : (AMOUNT[cls] || 0) * (slope > 0.75 ? 0 : slope > 0.4 ? 1 - (slope - 0.4) / 0.35 : 1) * (1 - 0.4 * closed);
    const D = this.data;
    D[o] = hs.radius + h - this.anchorR; D[o + 1] = amount; D[o + 2] = DRY[cls] ?? 0.5;
    // the flowers: the kinds of this land, one of them to a patch some 40 m across, in
    // drifts with bare grass between
    const lat = Math.abs(Math.asin(d[2])) * 57.29578, R = hs.radius + h;
    const flora = amount < 0.1 ? null : h > 2300 && lat < 50 ? ALPINE : lat > 58 && cls >= 6 ? TUNDRA : FLORA[cls];
    let fl = 0;
    if (flora) {
      const X = d[0] * R, Y = d[1] * R, Z = d[2] * R, kinds = flora[0];
      const which = noise3(X / 38, Y / 38, Z / 38), drift = noise3(X / 9 + 40, Y / 9, Z / 9), wide = noise3(X / 120, Y / 120 + 9, Z / 120);
      const many = flora[1] * Math.min(1, Math.max(0, (drift - 0.5) / 0.18)) * Math.min(1, Math.max(0.1, (wide - 0.35) / 0.25));
      if (many > 0.01) fl = kinds[Math.min(kinds.length - 1, Math.floor(Math.min(0.999, Math.max(0, (which - 0.2) / 0.6)) * kinds.length))] + Math.min(0.9, many);
    }
    D[o + 3] = fl;
  }

  // Every frame. rig: the camera rig; dt (s); renderer (the table goes to the GPU between frames).
  update(rig, dt, renderer) {
    const def = this.def, t = this.terrain;
    const show = !!def && !!t.coverSerial && rig.agl < (def.below ?? 80) && this.fraction > 0;
    if (!show) { this.mesh.visible = false; t.shared.uGrassTone.value.w = 0; this._toneK = 0; return; }
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
    this.uniforms.uGrassTime.value = this.time;
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
    if (changed) {
      this.tex.needsUpdate = true; renderer.initTexture(this.tex);
      // what the ground beyond the blades should wear: the mean of the grass here
      let am = 0, dry = 0; const D = this.data;
      for (let o = 0; o < D.length; o += 4) { am += D[o + 1]; dry += D[o + 1] * D[o + 2]; }
      this._tone = [am / (TEX * TEX), am > 0 ? dry / am : 0.5];
    }
    // (the colours of the blades two thirds of the way up, as the vertex shader mixes them)
    const [am, dry] = this._tone || [0, 0.5], tone = t.shared.uGrassTone.value, on = pending > TEX * TEX * 0.5 ? 0 : 1;
    this._toneK = (this._toneK ?? 0) + (on - (this._toneK ?? 0)) * Math.min(1, dt * 1.5);
    tone.set(0.085 + (0.225 - 0.085) * dry, 0.132 + (0.152 - 0.132) * dry, 0.037 + (0.044 - 0.037) * dry, Math.min(1, am * 1.25) * this._toneK * Math.min(1, this.fraction * 2));
    this.mesh.visible = true;
  }
}
