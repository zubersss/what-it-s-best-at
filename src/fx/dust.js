// Dust kicked up by the character near the ground: touching down, taking off, and
// skimming along. A fixed pool of sprites, each a packet of grains flying under the
// world's gravity and slowed by whatever air there is. What a packet looks like follows
// from the air:
// - In air (Mars): fine dust is held up and spreads. A packet is a puff whose density is
//   carved by 3-D noise: the large lumps are fixed in space and shared by all puffs, so
//   overlapping puffs show one lumpy cloud rather than many discs; the small lumps travel
//   and grow with each puff. Lumps facing the Sun are lit, the far side of a lump lies in
//   its own shadow, and old puffs fray into wisps at the edge of the cloud.
// - In vacuum (the Moon): nothing holds the grains up. Each packet flies a clean parabola,
//   is strung out along its path by the small spread of speeds inside it (a thin streak
//   with a crisp edge, the faster grains in front) and stops where it lands. All grains of
//   a burst leave at about the same angle, so together they form a thin sharp-edged sheet,
//   as under Apollo's lunar module and behind its rover's wheels.
// Lit through the shared lighting chunk like every other surface (art rule 1); the
// world's dust colour, tinted like the ground under the camera.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

const N = 1024;           // packets in the pool (one draw call; a lunar touch-down throws up to ~330)
const MAX_PX = 256;       // largest sprite, pixels

const VERT = /* glsl */`
in vec4 aState;              // x = age 0..1 (>= 1: dead), y = size in metres, z = height above its ground (m), w = seed 0..1
in vec4 aMotion;             // xyz = velocity (m/s, planet axes), w = seconds lived
uniform float uPixelsPerRadian;
uniform float uVac;
out vec3 vRel;               // camera-relative position
out vec3 vLocal;             // position from the pool's anchor (planet axes)
out vec4 vA;                 // age, brightness variation, seed, opacity
out vec4 vB;                 // xy: direction of motion on screen, zw: half length (along it) and half width, pixels
out vec3 vC;                 // half the sprite's size in pixels, metres per pixel at the packet, its height above its ground
void main() {
  vec3 rel = (modelMatrix * vec4(position, 1.0)).xyz;
  vRel = rel; vLocal = position;
  vec4 pv = viewMatrix * vec4(rel, 1.0);
  gl_Position = projectionMatrix * pv;
  float dist = max(length(rel), 0.3), depth = max(-pv.z, 0.3);
  vec3 v = aMotion.xyz;
  float sp = length(v), t = aMotion.w;
  // the motion's direction on screen, and how many pixels a metre along it covers
  vec3 dv = mat3(viewMatrix) * (v / max(sp, 1e-4));
  vec2 d = (dv.xy * depth + pv.xy * dv.z) / (depth * depth);
  float along = length(d) * uPixelsPerRadian, across = uPixelsPerRadian / dist;
  float D = aState.y;
  // in air a puff, drawn out a little while it moves fast; in vacuum a thin packet of
  // grains strung out along its path by the spread of speeds inside it (6 to 14 % of its
  // speed: at a fifth to two fifths the frozen burst read as a graphic sunburst of long
  // lines, not a fine spray), plus the film's blur
  float Lm = mix(D * (1.0 + 0.15 * min(sp, 3.0)), D + sp * (0.02 + (0.06 + 0.08 * aState.w) * t), uVac);
  float Wm = mix(D, 0.2 * D + 0.006 * sp * t, uVac);
  float L = max(Lm * along, Wm * across), W = Wm * across;
  // never thinner than 2 pixels (a thinner streak sparkles as it moves), with the same coverage
  float Ld = max(L, 2.0), Wd = max(W, 2.0);
  float cover = (L * W) / (Ld * Wd);
  // (in vacuum the faint fringe of a packet reaches out to 2.5 times its half width)
  float S = max(Ld, Wd * mix(1.0, 2.5, uVac));
  float k = min(1.0, (${MAX_PX}.0 - 2.0) / S);        // shrunk to fit the largest sprite
  float size = min(S + 2.0, ${MAX_PX}.0);               // (+2: room for the soft ends)
  vB = vec4(length(d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0), 0.5 * vec2(Ld, Wd) * k);
  vC = vec3(0.5 * size, 1.0 / (across * k), aState.z);
  // a packet's grains spread over a growing area: its sheet thins as it flies
  vA = vec4(aState.x, 0.85 + 0.3 * fract(aState.w * 7.31), aState.w, cover * mix(1.0, min(0.6, 0.004 / max(Lm * Wm, 1e-6)), uVac));
  gl_PointSize = aState.x >= 1.0 ? 0.0 : size;
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform vec3 uDustAlbedo;
uniform float uSunVis;
uniform float uVac;         // 1 = vacuum: grains in clean arcs; 0 = any real air: billowing cloud
uniform float uDustTime;    // seconds of dust time (stops in screenshot mode)
uniform float uDustDetail;  // 1: full detail; 0: the governor's dust step (large lumps only)
in vec3 vRel;
in vec3 vLocal;
in vec4 vA;
in vec4 vB;
in vec3 vC;
layout(location = 0) out vec4 fragColor;

float dustHash(uvec3 q) {
  q *= uvec3(1597334673u, 3812015801u, 2798796415u);
  return float((q.x ^ q.y ^ q.z) * 1597334673u) * (1.0 / 4294967296.0);
}
// value noise, 0..1 (lattice kept positive: the packets stay within a few hundred metres)
float dustNoise(vec3 p) {
  vec3 i = floor(p), f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  uvec3 c = uvec3(i + 4096.0);
  float a = mix(dustHash(c), dustHash(c + uvec3(1u, 0u, 0u)), f.x);
  float b = mix(dustHash(c + uvec3(0u, 1u, 0u)), dustHash(c + uvec3(1u, 1u, 0u)), f.x);
  float e = mix(dustHash(c + uvec3(0u, 0u, 1u)), dustHash(c + uvec3(1u, 0u, 1u)), f.x);
  float g = mix(dustHash(c + uvec3(0u, 1u, 1u)), dustHash(c + uvec3(1u, 1u, 1u)), f.x);
  return mix(mix(a, b, f.y), mix(e, g, f.y), f.z);
}
// Henyey-Greenstein relative to isotropic scattering (1 on average over all directions)
float hgRel(float c, float g) { float d = 1.0 + g * g - 2.0 * g * c; return (1.0 - g * g) / (d * sqrt(d)); }
// Loose dust grains: most light goes on forward, some comes straight back (rough grains,
// as soil brightens away from the Sun) - two lobes, still 1 on average
float dustPhase(float c) { return 0.85 * hgRel(c, 0.35) + 0.15 * hgRel(c, -0.3); }

void main() {
  float vAge = vA.x, vTone = vA.y, vSeed = vA.z, vOpacity = vA.w, vPx = vC.x, vMetres = vC.y;
  vec2 vAxis = vB.xy, vHalf = vB.zw;
  vec2 q = (gl_PointCoord * 2.0 - 1.0) * vec2(vPx, -vPx);          // pixels from the centre, y up
  vec2 a = vec2(dot(q, vAxis), dot(q, vec2(-vAxis.y, vAxis.x)));      // along the motion, across it
  vec2 e = a / vHalf;
  float r2 = dot(e, e);
  float alpha = 0.0, lump = 1.0, tone = vTone;
  float air = 1.0 - smoothstep(0.1, 0.9, uVac);
  vec3 planetPos = uCamPlanetPos + vRel;
  vec3 up = normalize(planetPos);
  // this pixel's point on the sprite, metres from the packet's centre
  vec3 off = (vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]) * q.x + vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]) * q.y) * vMetres;
  if (air > 0.0) {
    float env = max(1.0 - r2, 0.0), shell = env * sqrt(env);
    float fade = (1.0 - vAge) * (1.0 - vAge) * min(1.0, vAge * 12.0) * 0.42;
    if ((1.0 - exp(-3.2 * shell)) * fade > 0.004) {          // (the most this pixel can show)
      // the point of the puff this pixel sees: pushed toward the eye by the puff's roundness
      // so that the noise has depth
      float Rm = vHalf.y * vMetres;
      vec3 P = vLocal + off - normalize(vRel) * (sqrt(env) * 0.7 * Rm);
      // large lumps fixed in space (all puffs share them: one cloud) and slowly churning;
      // small lumps carried and grown by each puff (faded out below a pixel or two, and
      // left out by the governor's dust step)
      vec3 boil = uDustTime * vec3(0.05, -0.04, 0.09);
      float n1 = dustNoise(P * 2.4 + boil), n = n1;
      if (uDustDetail > 0.5) {
        float fine = 1.0 - smoothstep(0.06, 0.14, vMetres);
        float n2 = dustNoise(mat3(0.8, 0.36, -0.48, -0.6, 0.48, -0.64, 0.0, 0.8, 0.6) * ((P - vLocal) * (3.2 / Rm)) + vSeed * 61.0);
        n = mix(n1, 0.5 * n1 + 0.5 * n2, fine);
      }
      // dense lumps and thin gaps, thinning toward the puff's edge; as it ages only the
      // densest lumps are left (it frays into wisps)
      float dens = 1.6 * shell * smoothstep(0.15 + 0.5 * vAge, 0.85, smoothstep(0.18, 0.82, n));
      alpha = (1.0 - exp(-2.0 * dens)) * fade;
      // a lump's sunward side catches the Sun; its far side lies in the lump's own shadow
      if (uDustDetail > 0.5) {
        float n1s = dustNoise((P + uSunDir * 0.18) * 2.4 + boil);
        lump = mix(1.0, clamp(1.0 + 1.8 * (n1 - n1s), 0.4, 1.4), dens);
      }
      tone = mix(1.0, vTone, 0.3) * (0.92 + 0.16 * n1);
      // the part of the flat sprite that would lie under the ground fades out softly
      // there (a hard line where it cuts into the ground otherwise)
      alpha *= smoothstep(0.0, 0.03 + 0.15 * Rm, vC.z + dot(P - vLocal, up));
    }
    alpha *= air;
  }
  if (air < 1.0) {
    // a thin streak with a crisp head and sides (anti-aliased over one pixel); the slower
    // grains lag behind, so a packet narrows and thins out toward its back
    float hw = vHalf.y * (0.5 + 0.5 * smoothstep(-1.0, 0.5, e.x));
    float tip = clamp(vHalf.x - a.x, 0.0, hw);
    hw = sqrt(tip * (2.0 * hw - tip));                                  // a rounded head
    // around the dense core a faint fringe of strays: neighbouring packets' fringes join
    // into one thin sheet, their cores streak it
    float side = max(clamp(hw + 0.5 - abs(a.y), 0.0, 1.0), 0.3 * (1.0 - smoothstep(0.0, 2.5 * hw + 1.0, abs(a.y))));
    float cov = side * clamp(vHalf.x + 0.5 - abs(a.x), 0.0, 1.0);
    float lead = smoothstep(-1.0, 0.4, e.x);
    float va = cov * lead * vOpacity * min(1.0, vAge * 12.0) * (1.0 - smoothstep(0.85, 1.0, vAge));
    va *= smoothstep(-0.01, 0.03, vC.z + dot(off, up));             // (not under the ground)
    alpha += va * (1.0 - air);
  }
  if (alpha < 0.004) discard;
  // A cloud of loose grains sends back about half of the sunlight that reaches it (they do
  // not hide each other's shadows as packed soil does, so even over dark lunar ground a
  // plume catches the light), more of it forward than back; plus sky light.
  float ph = dustPhase(dot(normalize(vRel), uSunDir));
  vec3 E = directSun(planetPos) * (uSunVis * 0.5 * ph * lump) + skyLight(up, up) + planetShine(up);
  // (always within a few metres of the eye: no haze in between worth the cost)
  fragColor = vec4(uDustAlbedo * uGroundTint * tone * E / PI * uExposure, alpha);
}`;

export class Dust {
  constructor(world) {
    this.pos = new Float32Array(N * 3);          // metres, relative to `anchor`
    this.motion = new Float32Array(N * 4);       // velocity (m/s), seconds lived
    this.span = new Float32Array(N).fill(1);     // seconds to live
    this.base = new Float32Array(N);             // height of the ground it left (metres along up, from `anchor`)
    this.state = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) this.state[i * 4] = 1;
    this.next = 0; this.alive = 0;
    this.seed = 12345;                           // own random numbers, so a burst can be replayed exactly
    this.time = 0;                               // seconds of dust time (churns the cloud)
    this.amount = 1;                             // governor: 1 = full, 0.5 = half the packets, and in air only the large lumps
    this.afloat = 0;                             // 0 = vacuum (ballistic grains) .. 1 = air that holds dust up
    this.vac = 1;                                // (1 - afloat)^2: the vacuum look (small, numerous grains)
    this.gravity = 1;                            // m/s^2 at the last update
    this.anchor = new THREE.Vector3();
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aMotion = new THREE.BufferAttribute(this.motion, 4).setUsage(THREE.DynamicDrawUsage);
    this.aState = new THREE.BufferAttribute(this.state, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aMotion', this.aMotion); geo.setAttribute('aState', this.aState);
    this.uniforms = { ...lightingUniforms(), uDustAlbedo: { value: new THREE.Vector3() }, uSunVis: { value: 1 }, uPixelsPerRadian: { value: 500 }, uVac: { value: 1 }, uDustTime: { value: 0 }, uDustDetail: { value: 1 } };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      // colour is blended; the HDR target's alpha (the "lit surface" mask used by metering) is left alone
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false; this.points.renderOrder = 50;
    this._up = new THREE.Vector3(); this._t = new THREE.Vector3(); this._b = new THREE.Vector3();
    this.setWorld(world);
  }

  _rnd() {
    let t = (this.seed = (this.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  setWorld(world) {
    this.uniforms.uDustAlbedo.value.set(...world.surface.dust);
    this.dustiness = world.surface.dustiness ?? 1;
    for (let i = 0; i < N; i++) this.state[i * 4] = 1;
    this.alive = 0; this.aState.needsUpdate = true;
  }

  // Throws `count` packets from `at` (planet-fixed metres): outward along the ground with
  // speed `spread`, upward with `lift`, plus `carry` (a velocity they inherit). In air a
  // little over half the lift is kept (most of the dust rolls out along the ground); in
  // vacuum the lift is whatever carries a grain `lift` x 0.6 m high under this world's
  // gravity (low gravity: slow, long arcs), and every packet leaves at about the same
  // angle (a faster one also flies higher), so that a burst is a thin sheet.
  emit(at, up, count, spread, lift, carry) {
    const af = this.afloat, vac = this.vac;
    lift = 0.55 * lift * af + Math.sqrt(1.2 * lift * this.gravity) * (1 - af);
    if (this.alive === 0) this.anchor.copy(at);                 // re-anchor when the pool is empty: keeps the numbers small
    const t = this._t.set(up.y, -up.x, 0); if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.addScaledVector(up, -t.dot(up)).normalize();
    const b = this._b.crossVectors(up, t);
    const ox = at.x - this.anchor.x, oy = at.y - this.anchor.y, oz = at.z - this.anchor.z;
    const h0 = ox * up.x + oy * up.y + oz * up.z;
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % N;
      const u = this._rnd(), a = this._rnd() * Math.PI * 2, r = 0.25 * this._rnd();
      const ul = (1 - vac) * this._rnd() + vac * Math.min(1, Math.max(0, u + 0.14 * (this._rnd() - 0.5)));
      const s = spread * (0.35 + 0.65 * u), l = lift * (0.3 + 0.7 * ul);
      const cx = Math.cos(a), sx = Math.sin(a);
      const o = i * 3, m = i * 4;
      this.pos[o] = ox + (t.x * cx + b.x * sx) * r; this.pos[o + 1] = oy + (t.y * cx + b.y * sx) * r; this.pos[o + 2] = oz + (t.z * cx + b.z * sx) * r;
      const vx = (t.x * cx + b.x * sx) * s + up.x * l + carry.x, vy = (t.y * cx + b.y * sx) * s + up.y * l + carry.y, vz = (t.z * cx + b.z * sx) * s + up.z * l + carry.z;
      this.motion[m] = vx; this.motion[m + 1] = vy; this.motion[m + 2] = vz; this.motion[m + 3] = 0;
      this.base[i] = h0;
      // in air a puff lingers; in vacuum a packet lives until it lands
      const vUp = vx * up.x + vy * up.y + vz * up.z;
      this.span[i] = af > 0.5 ? (1.5 + 1.8 * this._rnd()) * (1 + 1.4 * af) : Math.max(0.3, 2 * vUp / Math.max(this.gravity, 0.05) + 0.3);
      this.state[i * 4] = 0; this.state[i * 4 + 1] = (0.14 + 0.26 * this._rnd()) * (1 - 0.84 * vac); this.state[i * 4 + 2] = 0;
      this.state[i * 4 + 3] = this._rnd();
    }
  }

  // dt seconds; camPos: planet-fixed camera position; gravity m/s^2; air 0..1 (drag);
  // viewH / tanHalfFov size the sprites; sunVis: 0..1 terrain shadow at the character.
  update(dt, camPos, up, gravity, air, viewH, tanHalfFov, sunVis) {
    // Even thin air holds fine dust up: with any real atmosphere a puff slows, hangs and
    // spreads; with none every grain flies its arc and falls straight back.
    const afloat = this.afloat = 1 - Math.exp(-air * 12);
    const vac = this.vac = (1 - afloat) * (1 - afloat);          // how much the vacuum look applies (Mars's thin air: 0.04)
    this.gravity = gravity;
    this.time += dt;
    // Air drag grows with speed (a fast puff is stopped quickly, a slow one drifts on);
    // the fine dust settles slowly. In vacuum: no drag, full gravity.
    const gEff = gravity * vac * (1 - afloat) + 0.06 * afloat;
    let alive = 0;
    for (let i = 0; i < N; i++) {
      if (this.state[i * 4] >= 1) continue;
      const o = i * 3, m = i * 4;
      const life = (this.motion[m + 3] += dt);
      const age = life / this.span[i];
      if (age >= 1) { this.state[m] = 1; continue; }
      let vx = this.motion[m], vy = this.motion[m + 1], vz = this.motion[m + 2];
      const drag = Math.exp(-dt * afloat * (0.4 + 0.8 * Math.sqrt(vx * vx + vy * vy + vz * vz)));
      vx = (vx - up.x * gEff * dt) * drag; vy = (vy - up.y * gEff * dt) * drag; vz = (vz - up.z * gEff * dt) * drag;
      let px = this.pos[o] + vx * dt, py = this.pos[o + 1] + vy * dt, pz = this.pos[o + 2] + vz * dt;
      let h = px * up.x + py * up.y + pz * up.z - this.base[i]; const vUp = vx * up.x + vy * up.y + vz * up.z;
      if (afloat < 0.5) {
        if (h < -0.02 && vUp < 0) { this.state[m] = 1; continue; }      // landed: the grains stop dead
      } else {
        // a puff rests on the ground and spreads along it (the part of its sprite that
        // would cut into the ground fades out in the shader)
        const hMin = 0.1 * this.state[m + 1];
        if (h < hMin) {
          px += up.x * (hMin - h); py += up.y * (hMin - h); pz += up.z * (hMin - h); h = hMin;
          if (vUp < 0) { vx -= up.x * vUp; vy -= up.y * vUp; vz -= up.z * vUp; }
        }
      }
      this.motion[m] = vx; this.motion[m + 1] = vy; this.motion[m + 2] = vz;
      this.pos[o] = px; this.pos[o + 1] = py; this.pos[o + 2] = pz;
      this.state[m] = age; this.state[m + 2] = h;
      this.state[m + 1] += dt * (0.06 + 1.0 * afloat);                    // the puff spreads (in air)
      alive++;
    }
    this.alive = alive;
    this.points.visible = alive > 0;
    if (!alive) return;
    this.points.position.subVectors(this.anchor, camPos);
    this.uniforms.uPixelsPerRadian.value = viewH / (2 * tanHalfFov);
    this.uniforms.uSunVis.value = sunVis;
    this.uniforms.uVac.value = vac;
    this.uniforms.uDustTime.value = this.time % 1000;
    this.uniforms.uDustDetail.value = this.amount >= 1 ? 1 : 0;
    this.aPos.needsUpdate = true; this.aState.needsUpdate = true; this.aMotion.needsUpdate = true;
  }
}
