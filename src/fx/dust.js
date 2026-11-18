// Dust kicked up by the character near the ground: touching down, taking off, and
// skimming along. A fixed pool of soft sprites, each a grain cloud flying a ballistic arc
// under the world's gravity, slowed by whatever air there is (on the Moon: none, so the
// dust flies clean parabolas and falls straight back, as it did under Apollo's rover).
// Lit through the shared lighting chunk like every other surface (art rule 1).
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

const N = 256;

const VERT = /* glsl */`
in vec4 aState;              // x = age 0..1 (>= 1: dead), y = size in metres, z = brightness variation, w unused
uniform float uPixelsPerRadian;
out float vAge; out float vTone; out vec3 vRel;
void main() {
  vec3 rel = (modelMatrix * vec4(position, 1.0)).xyz;
  vRel = rel; vAge = aState.x; vTone = aState.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
  float dist = max(length(rel), 0.3);
  gl_PointSize = aState.x >= 1.0 ? 0.0 : clamp(aState.y / dist * uPixelsPerRadian, 1.0, 220.0);
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform vec3 uDustAlbedo;
uniform float uSunVis;
in float vAge; in float vTone; in vec3 vRel;
layout(location = 0) out vec4 fragColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float a = (1.0 - r2) * (1.0 - r2) * (1.0 - vAge) * (1.0 - vAge) * min(1.0, vAge * 12.0) * 0.34;
  vec3 planetPos = uCamPlanetPos + vRel;
  vec3 up = normalize(planetPos);
  // a cloud of grains: half of the sunlight that reaches it comes back out (less toward
  // the Sun on airless regolith, like the ground it came from), plus sky light
  vec3 E = directSun(planetPos) * (uSunVis * 0.5 * dustPhase(uSunDir, -normalize(vRel))) + skyLight(up, up) + planetShine(up);
  // (always within a few metres of the eye: no haze in between worth the cost)
  fragColor = vec4(uDustAlbedo * uGroundTint * vTone * E / PI * uExposure, a);
}`;

export class Dust {
  constructor(world) {
    this.pos = new Float32Array(N * 3);          // metres, relative to `anchor`
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);             // seconds lived
    this.span = new Float32Array(N).fill(1);     // seconds to live
    this.state = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) this.state[i * 4] = 1;
    this.next = 0; this.alive = 0;
    this.seed = 12345;                           // own random numbers, so a burst can be replayed exactly
    this.amount = 1;                             // governor: 1 = full, 0.5 = half the grains
    this.afloat = 0;                             // 0 = vacuum (ballistic grains) .. 1 = air that holds dust up
    this.anchor = new THREE.Vector3();
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aState = new THREE.BufferAttribute(this.state, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aState', this.aState);
    this.uniforms = { ...lightingUniforms(), uDustAlbedo: { value: new THREE.Vector3() }, uSunVis: { value: 1 }, uPixelsPerRadian: { value: 500 } };
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

  // Throws `count` grains from `at` (planet-fixed metres): outward along the ground with
  // speed `spread`, upward with `lift`, plus `carry` (a velocity they inherit).
  emit(at, up, count, spread, lift, carry) {
    if (this.alive === 0) this.anchor.copy(at);                 // re-anchor when the pool is empty: keeps the numbers small
    const t = this._t.set(up.y, -up.x, 0); if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.addScaledVector(up, -t.dot(up)).normalize();
    const b = this._b.crossVectors(up, t);
    const ox = at.x - this.anchor.x, oy = at.y - this.anchor.y, oz = at.z - this.anchor.z;
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % N;
      const a = this._rnd() * Math.PI * 2, s = spread * (0.35 + 0.65 * this._rnd()), l = lift * (0.3 + 0.7 * this._rnd()), r = 0.25 * this._rnd();
      const cx = Math.cos(a), sx = Math.sin(a);
      this.pos[i * 3] = ox + (t.x * cx + b.x * sx) * r; this.pos[i * 3 + 1] = oy + (t.y * cx + b.y * sx) * r; this.pos[i * 3 + 2] = oz + (t.z * cx + b.z * sx) * r;
      this.vel[i * 3] = (t.x * cx + b.x * sx) * s + up.x * l + carry.x; this.vel[i * 3 + 1] = (t.y * cx + b.y * sx) * s + up.y * l + carry.y; this.vel[i * 3 + 2] = (t.z * cx + b.z * sx) * s + up.z * l + carry.z;
      this.life[i] = 0; this.span[i] = (1.5 + 1.8 * this._rnd()) * (1 + 1.4 * this.afloat);
      this.state[i * 4] = 0; this.state[i * 4 + 1] = 0.14 + 0.26 * this._rnd(); this.state[i * 4 + 2] = 0.85 + 0.3 * this._rnd();
    }
  }

  // dt seconds; camPos: planet-fixed camera position; gravity m/s^2; air 0..1 (drag);
  // viewH / tanHalfFov size the sprites; sunVis: 0..1 terrain shadow at the character.
  update(dt, camPos, up, gravity, air, viewH, tanHalfFov, sunVis) {
    // Even thin air holds fine dust up: with any real atmosphere a puff slows, hangs and
    // spreads; with none every grain flies its arc and falls straight back.
    const afloat = this.afloat = 1 - Math.exp(-air * 12);
    const drag = Math.exp(-dt * (0.12 + 2.6 * afloat));
    gravity *= 1 - 0.92 * afloat;
    let alive = 0;
    for (let i = 0; i < N; i++) {
      if (this.state[i * 4] >= 1) continue;
      this.life[i] += dt;
      const age = this.life[i] / this.span[i];
      if (age >= 1) { this.state[i * 4] = 1; continue; }
      const o = i * 3;
      this.vel[o] = (this.vel[o] - up.x * gravity * dt) * drag; this.vel[o + 1] = (this.vel[o + 1] - up.y * gravity * dt) * drag; this.vel[o + 2] = (this.vel[o + 2] - up.z * gravity * dt) * drag;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      this.state[i * 4] = age;
      this.state[i * 4 + 1] += dt * (0.06 + 1.0 * afloat);                    // the puff spreads (in air)
      alive++;
    }
    this.alive = alive;
    this.points.visible = alive > 0;
    if (!alive) return;
    this.points.position.subVectors(this.anchor, camPos);
    this.uniforms.uPixelsPerRadian.value = viewH / (2 * tanHalfFov);
    this.uniforms.uSunVis.value = sunVis;
    this.aPos.needsUpdate = true; this.aState.needsUpdate = true;
  }
}
