// The flying character: how it moves. A suited figure (heroModel.js) posed between
// "hover" (upright, relaxed) and "flight" (horizontal, arms forward), with elbows and
// knees that bend and a simulated cloak that is kept off the body, arms and legs. In
// flight it is drawn a few metres in front of the camera, so the engine's camera, floating
// origin and controls stay exactly as they are: the hero is the thing you fly behind.
//
// Local frame of the figure: +Y = toward the head, +Z = chest, +X = its left. Metres.
import * as THREE from 'three';
import { lightingUniforms } from '../render/lightingGlsl.js';
import { torsoGeometry, upperArmGeometry, forearmGeometry, thighGeometry, shinGeometry, ELBOW, HAND, KNEE, ANKLE, SHOULDER, HIP, HERO_VERT, HERO_FRAG } from './heroModel.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { Cloak } from './cloak.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);

export const HERO_DISTANCE = 4.1, HERO_DROP = 1.2;     // metres in front of / below the camera axis

export class Hero {
  constructor() {
    this.uniforms = { ...lightingUniforms(), uSunVis: { value: 1 } };
    this.material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.uniforms, vertexShader: HERO_VERT, fragmentShader: HERO_FRAG, side: THREE.DoubleSide });
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
    // Limbs: upper and lower piece are both children of the body (the lower one is
    // placed at the joint every frame), so each can be drawn into the shadow map alone.
    this.arms = [mk(upperArmGeometry()), mk(upperArmGeometry())];
    this.forearms = [mk(forearmGeometry()), mk(forearmGeometry())];
    this.legs = [mk(thighGeometry()), mk(thighGeometry())];
    this.shins = [mk(shinGeometry()), mk(shinGeometry())];
    this.arms[0].position.set(...SHOULDER); this.arms[1].position.set(-SHOULDER[0], SHOULDER[1], SHOULDER[2]);
    this.legs[0].position.set(...HIP); this.legs[1].position.set(-HIP[0], HIP[1], HIP[2]);
    this.body.add(this.torso, ...this.arms, ...this.forearms, ...this.legs, ...this.shins);
    // What the cloak must stay out of, in the body's own frame: 8 capsules (two per limb),
    // each ax, ay, az, bx, by, bz, radius. Filled in by the pose every frame.
    this.colliders = new Float32Array(8 * 7);
    this._bend = new THREE.Quaternion(); this._joint = new THREE.Vector3(); this._end = new THREE.Vector3();
    this.legSwing = 0;
    this.cloak = new Cloak();
    this.cape = mk(this.cloak.geometry);     // cloth vertices are already in world axes, anchor-relative
    this.group.add(this.cape);
    // The near shadow map gives the figure's parts a tile of their own that follows it
    // (its "focus"), fine enough (7 mm) for the hard-edged shadow of a suited figure under
    // an airless sky.
    for (const m of this.casters) m.userData.shadowFocus = this.group;
    this.group.visible = false;
    const tris = (m) => m.geometry.attributes.position.count / 3;
    this.triangles = this.cloak.triangles + tris(this.torso) + 2 * (tris(this.arms[0]) + tris(this.forearms[0]) + tris(this.legs[0]) + tris(this.shins[0]));

    this.flight = 0;                          // 0 hover .. 1 flying
    this.foot = 0;                            // 0 in the air .. 1 on foot (walking pose)
    this.gait = 0; this.air = 0; this.lean = 0;
    this.facing = new THREE.Vector3();        // where the figure faces on foot (horizontal, planet-fixed)
    this._f = new THREE.Vector3(); this._hv = new THREE.Vector3();
    this.bank = 0; this.time = 0;
    this.vel = new THREE.Vector3(); this.prevVel = new THREE.Vector3(); this.accel = new THREE.Vector3();
    this.lag = new THREE.Vector3();           // the figure trails slightly behind sudden moves
    this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
    this._m4 = new THREE.Matrix4(); this._m3 = new THREE.Matrix3(); this._q = new THREE.Quaternion();
    this._g = new THREE.Vector3(); this._wind = new THREE.Vector3(); this._t = new THREE.Vector3();
    this.started = false;
  }

  // Meshes that should cast into the near shadow map.
  get casters() { return [this.torso, ...this.arms, ...this.forearms, ...this.legs, ...this.shins, this.cape]; }

  // Places a limb: the upper piece turns at its pivot (Euler x, z), the lower piece sits at
  // the joint and bends by `bend` about the limb's own x axis. Also writes the limb's two
  // collision capsules for the cloak at index k.
  _limb(upper, lower, rx, rz, bend, jointLen, endLen, r0, r1, k) {
    upper.rotation.set(rx, 0, rz);
    const j = this._joint.set(0, -jointLen, 0).applyQuaternion(upper.quaternion).add(upper.position);
    lower.position.copy(j);
    lower.quaternion.copy(upper.quaternion).multiply(this._bend.setFromAxisAngle(X_AXIS, bend));
    const e = this._end.set(0, -endLen, 0).applyQuaternion(lower.quaternion).add(j);
    const c = this.colliders, o = k * 7, p = upper.position;
    c[o] = p.x; c[o + 1] = p.y; c[o + 2] = p.z; c[o + 3] = j.x; c[o + 4] = j.y; c[o + 5] = j.z; c[o + 6] = r0;
    c[o + 7] = j.x; c[o + 8] = j.y; c[o + 9] = j.z; c[o + 10] = e.x; c[o + 11] = e.y; c[o + 12] = e.z; c[o + 13] = r1;
  }

  setVisible(v) { if (v && !this.group.visible) this.started = false; this.group.visible = v; }

  // rig: camera rig (pos, forward, right, up, localUp, velocity in m/s, throttle 0..1, yawRate deg/s).
  // env: { gravity (m/s^2), air (0..1 how dense the air is here), groundClearance(dirVec3)->m or null }.
  // motion (optional): { velocity, throttle, yawRate } to pose the figure with something
  // other than the rig's real motion (deterministic screenshots).
  update(dt, rig, env, motion = rig) {
    if (!this.group.visible) return;
    this.time += dt;
    const up = this._t.set(rig.localUp[0], rig.localUp[1], rig.localUp[2]);
    // On foot (motion.onFoot): standing, walking, running and jumping; the rig places the
    // figure (motion.heroRel). In the air: flight amount follows the stick, the velocity
    // direction steers the body.
    const onFoot = !!motion.onFoot;
    this.foot += ((onFoot ? 1 : 0) - this.foot) * (1 - Math.exp(-dt * 8));
    if (!this.started) this.foot = onFoot ? 1 : 0;
    const speed = motion.velocity.length();
    const hv = this._hv.copy(motion.velocity).addScaledVector(up, -motion.velocity.dot(up)), hspeed = hv.length();
    const target = onFoot ? 0 : Math.min(1, motion.throttle * 1.2) * (speed > 0.5 ? 1 : 0);
    this.flight += (target - this.flight) * (1 - Math.exp(-dt * 3.2));
    this.bank += (THREE.MathUtils.clamp(-motion.yawRate / 70, -1, 1) * 0.6 - this.bank) * (1 - Math.exp(-dt * 4));
    const f = this.flight, fs = f * f * (3 - 2 * f);

    // Body axes: head direction goes from "up" to the direction of travel; the chest turns
    // from facing forward to facing the ground.
    const dir = speed > 0.5 ? this._z.copy(motion.velocity).divideScalar(speed) : this._z.copy(rig.forward);
    // On foot the figure faces where it runs (or, standing, where it last faced), turning smoothly.
    const want = this._f.copy(hspeed > 0.4 ? hv : rig.forward).addScaledVector(up, -(hspeed > 0.4 ? 0 : rig.forward.dot(up)));
    if (want.lengthSq() > 1e-8) want.normalize();
    if (!this.started || this.facing.lengthSq() < 0.5) this.facing.copy(want);
    this.facing.addScaledVector(up, -this.facing.dot(up)).lerp(want, 1 - Math.exp(-dt * 9)).normalize();
    const head = this._y.copy(up).lerp(dir, fs).normalize();
    const chest = this._x.copy(rig.forward).lerp(this.facing, this.foot).lerp(this._g.copy(rig.up).negate(), fs);
    chest.addScaledVector(head, -chest.dot(head)).normalize();
    const left = this._g.crossVectors(head, chest).normalize();
    this._m4.makeBasis(left, head, chest);
    this.body.quaternion.setFromRotationMatrix(this._m4);
    this.body.rotateY(this.bank * (0.4 + 0.6 * fs) * (1 - this.foot));        // lean into turns (about the head axis)
    // Running leans forward (a sprinter's lean, more at super speed); braking leans back.
    const run = THREE.MathUtils.smoothstep(hspeed, 2.5, 6.5), sup = THREE.MathUtils.smoothstep(hspeed, 8, 40);
    const leanTarget = onFoot && !motion.airborne ? 0.10 * run + 0.42 * sup : 0;
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt * 6));
    this.body.rotateX(this.lean * this.foot);
    this.body.updateMatrix();
    this._m3.setFromMatrix4(this.body.matrix);

    // Acceleration felt by the figure (for the trailing lag, the legs and the cloak's inertia).
    if (!this.started) { this.prevVel.copy(motion.velocity); this.lag.set(0, 0, 0); this.legSwing = 0; }
    this.accel.copy(motion.velocity).sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
    this.prevVel.copy(motion.velocity);
    const aLen = this.accel.length();
    if (aLen > 30) this.accel.multiplyScalar(30 / aLen);     // interplanetary thrust would shred any cloth
    this.lag.addScaledVector(this.accel, -0.004).multiplyScalar(Math.exp(-dt * 5));
    if (this.lag.length() > 0.8) this.lag.setLength(0.8);

    // Limbs. Hovering: arms a little out from the sides with relaxed elbows, knees
    // slightly bent, one more than the other, everything swaying a little. Flying: arms
    // reach ahead, legs trail nearly straight. Speeding up or braking swings the legs,
    // and a turn drops the inside arm away from the body.
    const hov = 1 - fs, sway = Math.sin(this.time * 1.7) * 0.04 * hov, breathe = Math.sin(this.time * 1.1 + 0.6) * 0.03 * hov;
    const swingTarget = THREE.MathUtils.clamp(this.lag.dot(chest) * 1.4, -0.45, 0.45) * hov;
    this.legSwing += (swingTarget - this.legSwing) * (1 - Math.exp(-dt * 6));
    const armA = 0.16 + (Math.PI - 0.30) * fs, out = 0.13 - 0.19 * fs, lean = this.bank * 0.35;
    // [hip or shoulder x, z, knee or elbow] for left arm, right arm, left leg, right leg
    const P = this._pose || (this._pose = new Float32Array(12)), F = this._footPose || (this._footPose = new Float32Array(12));
    P.set([-armA + sway, out + Math.max(0, lean), -(0.42 * hov + 0.10 * fs) - breathe,
      -armA - sway, -out + Math.min(0, lean), -(0.34 * hov + 0.10 * fs) + breathe,
      0.10 * hov + sway - this.legSwing - 0.22 * hov, 0.04, 0.50 * hov + 0.06 * fs + this.legSwing * 0.5,
      -0.05 * hov - sway - this.legSwing, -0.04, 0.16 * hov + 0.05 * fs + Math.max(0, this.legSwing)]);
    let crouch = 0;
    if (this.foot > 0.001) {
      // Gait: one stride (two steps) per cycle; longer strides the faster it goes, and at
      // super speed the cadence stops rising (the legs are a blur anyway).
      const stride = Math.min(2.8, 0.9 + 0.32 * hspeed);
      this.gait += Math.min(Math.PI * hspeed / stride, 2 * Math.PI * 4.2) * dt;
      const amp = Math.min(1, hspeed / 1.6), legA = 0.34 + 0.40 * run, armB = 0.30 + 0.55 * run;
      const kneeK = 0.30 + 0.95 * run, elbow = 0.30 + 1.05 * run;
      // In the air: legs tucked while rising, reaching down for the ground while falling.
      this.air += ((motion.airborne ? 1 : 0) - this.air) * (1 - Math.exp(-dt * 10));
      const rising = THREE.MathUtils.clamp((motion.vUp || 0) / 2, 0, 1);
      // Landing: a crouch that absorbs the impact, deeper for harder landings.
      const since = (motion.clock ?? 0) - (motion.landedAt ?? -99);
      crouch = since >= 0 && since < 1.5 ? Math.exp(-since * 5) * THREE.MathUtils.clamp((motion.landSpeed || 0) / 7, 0, 1) : 0;
      const ga = (1 - this.air) * amp;
      for (let i = 0; i < 2; i++) {
        const ph = this.gait + i * Math.PI, sn = Math.sin(ph), cs = Math.cos(ph), sd = i ? -1 : 1;
        // legs (index 2 + i): forward swing is a negative hip angle; the knee bends most mid-swing
        const hip = -legA * sn * ga - this.lean * 0.55 - crouch * 0.7 - this.air * (0.35 + 0.45 * rising);
        const knee = 0.06 + ga * (kneeK * Math.max(0, cs) + 0.12 * run) + crouch * 1.4 + this.air * (0.35 + 0.95 * rising);
        F[6 + i * 3] = hip; F[7 + i * 3] = sd * (0.04 + 0.05 * this.air); F[8 + i * 3] = knee;
        // arms (index i) swing against the leg on the same side
        F[i * 3] = armB * sn * ga + 0.06 - this.air * 0.55 + crouch * 0.3;
        F[1 + i * 3] = sd * (0.10 + 0.30 * this.air + 0.08 * run);
        F[2 + i * 3] = -(elbow * (0.6 + 0.4 * ga) + 0.15 * this.air);
      }
      const k = this.foot;
      for (let i = 0; i < 12; i++) P[i] += (F[i] - P[i]) * k;
    }
    this._limb(this.arms[0], this.forearms[0], P[0], P[1], P[2], ELBOW, HAND, 0.075, 0.07, 0);
    this._limb(this.arms[1], this.forearms[1], P[3], P[4], P[5], ELBOW, HAND, 0.075, 0.07, 2);
    this._limb(this.legs[0], this.shins[0], P[6], P[7], P[8], KNEE, ANKLE, 0.095, 0.085, 4);
    this._limb(this.legs[1], this.shins[1], P[9], P[10], P[11], KNEE, ANKLE, 0.095, 0.085, 6);

    // Place the figure: on foot where the rig puts it (standing on the ground, lowered in a
    // landing crouch and by the bent knees of a run); flying, in front of and a little
    // below the camera (camera-relative metres).
    const p = this.group.position;
    if (onFoot || (rig._relBlend > 0.01 && motion === rig)) {
      p.copy(motion.heroRel || rig.heroRel);
      p.addScaledVector(up, -(crouch * 0.30 + 0.05 * run * (1 - this.air)) * this.foot);
      this.lag.multiplyScalar(Math.exp(-dt * 8));
    } else {
      p.copy(rig.forward).multiplyScalar(HERO_DISTANCE).addScaledVector(rig.up, -HERO_DROP).add(this.lag);
      p.addScaledVector(up, Math.sin(this.time * 0.9) * 0.05 * (1 - fs));      // gentle hover bob
      if (env.groundClearance) {
        const c = env.groundClearance(p);                     // metres of air under the figure's centre
        if (c < 1.0) p.addScaledVector(up, 1.0 - c);          // never sink into the ground
      }
    }

    // Cloak: gravity, inertia, and the air streaming past. In vacuum there is no air, but
    // the cloak is still made to trail the direction of flight a little (owner's request).
    const g = this._g.copy(up).multiplyScalar(-env.gravity);
    const flow = Math.min(speed, 42) * (0.3 + 0.7 * env.air);
    const wind = this._wind.copy(dir).multiplyScalar(-flow * (speed > 0.05 ? 1 : 0));
    if (!this.started) { this.cloak.reset(this._m3); this.started = true; }
    this.cloak.update(dt, this._m3, g, this.accel, wind, env.air, this.colliders);
  }

  // Runs the cloak for a while with steady conditions (deterministic screenshots).
  settle(seconds, rig, env, motion = rig) {
    for (let t = 0; t < seconds; t += 1 / 60) this.update(1 / 60, rig, env, motion);
  }
}
