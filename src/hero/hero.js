// The flying character: a suited figure built from code (like the lander), posed rigidly
// between "hover" (upright) and "flight" (horizontal, arms forward), with a simulated
// cloak. It is drawn a few metres in front of the camera, so the engine's camera, floating
// origin and controls stay exactly as they are — the hero is the thing you fly behind.
//
// Local frame of the figure: +Y = toward the head, +Z = chest, +X = its left. Metres.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { Cloak } from './cloak.js';

const SUIT = [0.74, 0.73, 0.70], TRIM = [0.20, 0.20, 0.21], BOOT = [0.07, 0.07, 0.075], VISOR = [0.55, 0.38, 0.12];
export const HERO_DISTANCE = 4.1, HERO_DROP = 1.2;     // metres in front of / below the camera axis

function part(geo, col, mat = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(col, i * 3);
  g.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
  return g;
}
const capsule = (r, len, col, x, y, z, mat) => { const g = new THREE.CapsuleGeometry(r, len, 3, 8); g.translate(x, y, z); return part(g, col, mat); };
const ball = (r, col, x, y, z, mat, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 12, 9); g.scale(sx, sy, sz); g.translate(x, y, z); return part(g, col, mat); };

function torsoGeometry() {
  return mergeGeometries([
    capsule(0.165, 0.30, SUIT, 0, 0.30, 0),                         // chest
    ball(0.185, SUIT, 0, 0.47, 0.01, 0, 1.12, 0.8, 0.9),            // shoulders
    ball(0.165, SUIT, 0, 0.04, 0, 0, 1.0, 0.85, 0.9),               // hips
    capsule(0.05, 0.03, TRIM, 0, 0.64, 0),                          // neck ring
    ball(0.135, SUIT, 0, 0.80, 0, 0),                               // helmet
    ball(0.108, VISOR, 0, 0.805, 0.052, 1, 1.0, 0.86, 0.8),         // visor
    ball(0.09, TRIM, 0, 0.34, 0.15, 0, 1.3, 1.0, 0.45),             // chest unit
    capsule(0.04, 0.42, TRIM, 0, 0.60, -0.115, 0).rotateZ(Math.PI / 2).translate(0.6, 0.6, 0),   // cloak clasp bar across the shoulders
  ]);
}
// A limb hangs along -Y from its pivot at the origin.
function armGeometry() {
  return mergeGeometries([
    capsule(0.052, 0.22, SUIT, 0, -0.15, 0), capsule(0.047, 0.20, SUIT, 0, -0.42, 0),
    ball(0.056, TRIM, 0, -0.29, 0, 0), ball(0.058, BOOT, 0, -0.60, 0, 0, 1.0, 1.15, 1.0),
  ]);
}
function legGeometry() {
  const boot = new THREE.CapsuleGeometry(0.06, 0.13, 3, 8);
  boot.rotateX(Math.PI / 2 - 0.3); boot.translate(0, -0.86, 0.055);
  return mergeGeometries([
    capsule(0.075, 0.28, SUIT, 0, -0.20, 0), capsule(0.062, 0.28, SUIT, 0, -0.60, 0),
    ball(0.07, TRIM, 0, -0.41, 0.005, 0), part(boot, BOOT),
  ]);
}

const VERT = /* glsl */`
in vec3 aCol; in float aMat;
out vec3 vRel; out vec3 vN; out vec3 vCol; out float vMat;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vRel = w.xyz; vCol = aCol; vMat = aMat;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform float uSunVis;
in vec3 vRel; in vec3 vN; in vec3 vCol; in float vMat;
layout(location = 0) out vec4 fragColor;
void main() {
  int m = int(vMat + 0.5);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel), L = uSunDir;
  float NL = dot(N, L), NV = max(dot(N, V), 1e-3);
  vec3 Esun = directSun(planetPos) * uSunVis * nearShadow(vRel, N);
  vec3 sky = skyLight(N, up) + planetShine(N);
  vec3 col = vCol * (Esun * max(NL, 0.0) + sky) / PI;
  vec3 H = normalize(L + V);
  if (m == 1) {
    // visor: dark, glossy, mirrors the sky and a sharp Sun glint
    vec3 env = skyLight(reflect(-V, N), up) / PI;
    float F = 0.08 + 0.92 * pow(1.0 - NV, 5.0);
    col = vCol * 0.12 * (Esun * max(NL, 0.0) + sky) / PI + vCol * env * (0.6 + F) + Esun * pow(max(dot(N, H), 0.0), 220.0) * 6.0 * step(0.0, NL);
  } else if (m == 2) {
    // cloth: a little sunlight comes through from behind, soft sheen at grazing angles
    col += vCol * Esun * max(-NL, 0.0) * 0.22 / PI;
    col += vCol * sky * pow(1.0 - NV, 3.0) * 0.35 / PI;
  } else {
    col += Esun * max(NL, 0.0) * pow(max(dot(N, H), 0.0), 26.0) * 0.045;     // suit fabric highlight
  }
  col = aerialPerspective(col, vRel);
  fragColor = vec4(min(col * uExposure, vec3(60000.0)), 1.0);
}`;

export class Hero {
  constructor() {
    this.uniforms = { ...lightingUniforms(), uSunVis: { value: 1 } };
    this.material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    this.depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, side: THREE.DoubleSide, colorWrite: false,
      vertexShader: `void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
      fragmentShader: `layout(location = 0) out vec4 fragColor; void main() { fragColor = vec4(1.0); }`,
    });
    this.group = new THREE.Group();          // positioned camera-relative, world axes
    this.body = new THREE.Group();           // carries the figure's orientation
    this.group.add(this.body);
    const mk = (geo) => { const m = new THREE.Mesh(geo, this.material); m.frustumCulled = false; return m; };
    this.torso = mk(torsoGeometry());
    this.arms = [mk(armGeometry()), mk(armGeometry())];
    this.legs = [mk(legGeometry()), mk(legGeometry())];
    this.arms[0].position.set(0.235, 0.50, 0); this.arms[1].position.set(-0.235, 0.50, 0);
    this.legs[0].position.set(0.095, 0.0, 0); this.legs[1].position.set(-0.095, 0.0, 0);
    this.body.add(this.torso, ...this.arms, ...this.legs);
    this.cloak = new Cloak();
    this.cape = mk(this.cloak.geometry);     // cloth vertices are already in world axes, anchor-relative
    this.group.add(this.cape);
    this.group.visible = false;
    this.triangles = this.cloak.triangles + (this.torso.geometry.attributes.position.count + 2 * this.arms[0].geometry.attributes.position.count + 2 * this.legs[0].geometry.attributes.position.count) / 3;

    this.flight = 0;                          // 0 hover .. 1 flying
    this.bank = 0; this.time = 0;
    this.vel = new THREE.Vector3(); this.prevVel = new THREE.Vector3(); this.accel = new THREE.Vector3();
    this.lag = new THREE.Vector3();           // the figure trails slightly behind sudden moves
    this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
    this._m4 = new THREE.Matrix4(); this._m3 = new THREE.Matrix3(); this._q = new THREE.Quaternion();
    this._g = new THREE.Vector3(); this._wind = new THREE.Vector3(); this._t = new THREE.Vector3();
    this.started = false;
  }

  // Meshes that should cast into the near shadow map.
  get casters() { return [this.torso, ...this.arms, ...this.legs, this.cape]; }

  setVisible(v) { if (v && !this.group.visible) this.started = false; this.group.visible = v; }

  // rig: camera rig (pos, forward, right, up, localUp, velocity in m/s, throttle 0..1, yawRate deg/s).
  // env: { gravity (m/s^2), air (0..1 how dense the air is here), groundClearance(dirVec3)->m or null }.
  // motion (optional): { velocity, throttle, yawRate } to pose the figure with something
  // other than the rig's real motion (deterministic screenshots).
  update(dt, rig, env, motion = rig) {
    if (!this.group.visible) return;
    this.time += dt;
    const up = this._t.set(rig.localUp[0], rig.localUp[1], rig.localUp[2]);
    // Flight amount follows the stick; the velocity direction steers the body.
    const speed = motion.velocity.length();
    const target = Math.min(1, motion.throttle * 1.2) * (speed > 0.5 ? 1 : 0);
    this.flight += (target - this.flight) * (1 - Math.exp(-dt * 3.2));
    this.bank += (THREE.MathUtils.clamp(-motion.yawRate / 70, -1, 1) * 0.6 - this.bank) * (1 - Math.exp(-dt * 4));
    const f = this.flight, fs = f * f * (3 - 2 * f);

    // Body axes: head direction goes from "up" to the direction of travel; the chest turns
    // from facing forward to facing the ground.
    const dir = speed > 0.5 ? this._z.copy(motion.velocity).divideScalar(speed) : this._z.copy(rig.forward);
    const head = this._y.copy(up).lerp(dir, fs).normalize();
    const chest = this._x.copy(rig.forward).lerp(this._g.copy(rig.up).negate(), fs);
    chest.addScaledVector(head, -chest.dot(head)).normalize();
    const left = this._g.crossVectors(head, chest).normalize();
    this._m4.makeBasis(left, head, chest);
    this.body.quaternion.setFromRotationMatrix(this._m4);
    this.body.rotateY(this.bank * (0.4 + 0.6 * fs));        // lean into turns (about the head axis)
    this.body.updateMatrix();
    this._m3.setFromMatrix4(this.body.matrix);

    // Limbs: arms sweep from the sides to straight ahead, legs trail.
    const sway = Math.sin(this.time * 1.7) * 0.04 * (1 - fs);
    const armA = 0.16 + (Math.PI - 0.30) * fs;
    this.arms[0].rotation.set(-armA + sway, 0, 0.10 - 0.16 * fs); this.arms[1].rotation.set(-armA - sway, 0, -0.10 + 0.16 * fs);
    this.legs[0].rotation.set(0.10 * (1 - fs) + sway, 0, 0.04); this.legs[1].rotation.set(-0.05 * (1 - fs) - sway, 0, -0.04);

    // Acceleration felt by the figure (for the trailing lag and the cloak's inertia).
    if (!this.started) { this.prevVel.copy(motion.velocity); this.lag.set(0, 0, 0); }
    this.accel.copy(motion.velocity).sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
    this.prevVel.copy(motion.velocity);
    const aLen = this.accel.length();
    if (aLen > 30) this.accel.multiplyScalar(30 / aLen);     // interplanetary thrust would shred any cloth
    this.lag.addScaledVector(this.accel, -0.004).multiplyScalar(Math.exp(-dt * 5));
    if (this.lag.length() > 0.8) this.lag.setLength(0.8);

    // Place the figure in front of and a little below the camera (camera-relative metres).
    const p = this.group.position;
    p.copy(rig.forward).multiplyScalar(HERO_DISTANCE).addScaledVector(rig.up, -HERO_DROP).add(this.lag);
    p.addScaledVector(up, Math.sin(this.time * 0.9) * 0.05 * (1 - fs));      // gentle hover bob
    if (env.groundClearance) {
      const c = env.groundClearance(p);                     // metres of air under the figure's centre
      if (c < 1.0) p.addScaledVector(up, 1.0 - c);          // never sink into the ground
    }

    // Cloak: gravity, inertia, and the air streaming past. In vacuum there is no air, but
    // the cloak is still made to trail the direction of flight a little (owner's request).
    const g = this._g.copy(up).multiplyScalar(-env.gravity);
    const flow = Math.min(speed, 42) * (0.3 + 0.7 * env.air);
    const wind = this._wind.copy(dir).multiplyScalar(-flow * (speed > 0.05 ? 1 : 0));
    if (!this.started) { this.cloak.reset(this._m3); this.started = true; }
    this.cloak.update(dt, this._m3, g, this.accel, wind, env.air);
  }

  // Runs the cloak for a while with steady conditions (deterministic screenshots).
  settle(seconds, rig, env, motion = rig) {
    for (let t = 0; t < seconds; t += 1 / 60) this.update(1 / 60, rig, env, motion);
  }
}
