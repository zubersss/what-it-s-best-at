// The flying character: how it moves. A robed figure (heroModel.js) posed between
// "hover" (upright, relaxed) and "flight" (horizontal, arms forward), with elbows and
// knees that bend, and simulated cloth (robe.js: the robe's skirt, the wide sleeves, the
// hair) that is kept off the body, head, arms and legs. In
// flight it is drawn a few metres in front of the camera, so the engine's camera, floating
// origin and controls stay exactly as they are: the hero is the thing you fly behind.
//
// Local frame of the figure: +Y = toward the head, +Z = chest, +X = its left. Metres.
import * as THREE from 'three';
import { lightingUniforms } from '../render/lightingGlsl.js';
import { torsoGeometry, upperArmGeometry, forearmGeometry, thighGeometry, shinGeometry, ELBOW, HAND, KNEE, ANKLE, SHOULDER, HIP, SCULPT_ARM, SCULPT_LEG, HERO_VERT, HERO_FRAG } from './heroModel.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { Robe } from './robe.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);

// metres in front of / below the camera axis in flight (0.9 below keeps the trailing legs in
// the frame; 1.2 cut them off at the bottom edge)
export const HERO_DISTANCE = 4.1, HERO_DROP = 0.9;
const HOVER_BACK = 1.4;                          // the upright figure is drawn this much farther ahead
const KNEEL_LEAN = 1.05, KNEEL_DROP = 0.45;      // the three-point landing: torso forward (rad), hips lowered (m)

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
    this.robe = new Robe();
    this.cape = mk(this.robe.geometry);      // cloth vertices are already in world axes, anchor-relative
    this.group.add(this.cape);
    this._pins = new Float32Array(8 * 3); this._pv = new THREE.Vector3(); this._bz = new THREE.Vector3();
    // The near shadow map gives the figure's parts a tile of their own that follows it
    // (its "focus"), fine enough (7 mm) for the hard-edged shadow of a suited figure under
    // an airless sky.
    for (const m of this.casters) m.userData.shadowFocus = this.group;
    this.group.visible = false; this.sculpt = null; this.shown = true;
    const tris = (m) => m.geometry.attributes.position.count / 3;
    this.triangles = this.robe.triangles + tris(this.torso) + 2 * (tris(this.arms[0]) + tris(this.forearms[0]) + tris(this.legs[0]) + tris(this.shins[0]));

    this.flight = 0;                          // 0 hover .. 1 flying
    this.foot = 0;                            // 0 in the air .. 1 on foot (walking pose)
    this.gait = 0; this.air = 0; this.lean = 0;
    this.facing = new THREE.Vector3();        // where the figure faces on foot (horizontal, planet-fixed)
    this._f = new THREE.Vector3(); this._hv = new THREE.Vector3();
    this.bank = 0; this.time = 0;
    this.boost = 0;                           // 0 cruising .. 1 boosting (the streamlined pose)
    this.flare = 0;                           // 0 .. 1 swinging upright to land
    this.kneel = 0; this.launch = 0;          // the hard-landing kneel, the fist-up launch while taking off
    this.turnLead = new THREE.Vector2();      // where the chase camera leaves the figure while the view turns (m, right / up)
    this.vel = new THREE.Vector3(); this.prevVel = new THREE.Vector3(); this.accel = new THREE.Vector3();
    this.lag = new THREE.Vector3();           // the figure trails slightly behind sudden moves
    this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
    this._m4 = new THREE.Matrix4(); this._m3 = new THREE.Matrix3(); this._q = new THREE.Quaternion();
    this._g = new THREE.Vector3(); this._wind = new THREE.Vector3(); this._t = new THREE.Vector3();
    this.chaseBack = HERO_DISTANCE;
    this.started = false;
  }

  // The owner's sculpt (heroSculpt.js) takes the place of the figure built in code: the
  // parts and the cloth go on moving, and are no longer drawn themselves.
  useSculpt(sculpt) {
    this.sculpt = sculpt; this.group.add(sculpt.mesh);
    this.robe.drawn = false;
    this.show(this.shown);
  }
  // ... and gives it back (a device that cannot make the sculpt's shaders).
  dropSculpt() {
    if (!this.sculpt) return null;
    const sculpt = this.sculpt; this.group.remove(sculpt.mesh); this.sculpt = null;
    this.robe.drawn = true;
    this.show(this.shown);
    return sculpt;
  }
  // The figure in the picture or out of it (its shadow stays either way).
  show(on) {
    this.shown = on;
    this.body.visible = this.cape.visible = on && !this.sculpt;
    if (this.sculpt) this.sculpt.mesh.visible = on;
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

  // The figure standing as the owner's sculpt stands (arms out and down, legs a little apart,
  // nothing bent, the body upright at the origin): the pose the sculpt is bound in
  // (scripts/hero/heroBind.mjs) and the one its parts' rest places are taken from (heroSculpt.js).
  sculptPose() {
    this.body.position.set(0, 0, 0); this.body.quaternion.identity();
    this._limb(this.arms[0], this.forearms[0], 0, SCULPT_ARM, 0, ELBOW, HAND, 0.065, 0.06, 0);
    this._limb(this.arms[1], this.forearms[1], 0, -SCULPT_ARM, 0, ELBOW, HAND, 0.065, 0.06, 2);
    this._limb(this.legs[0], this.shins[0], 0, SCULPT_LEG, 0, KNEE, ANKLE, 0.085, 0.078, 4);
    this._limb(this.legs[1], this.shins[1], 0, -SCULPT_LEG, 0, KNEE, ANKLE, 0.085, 0.078, 6);
    this._sleevePins(0, 'sleeveL'); this._sleevePins(1, 'sleeveR');
    for (const m of this.parts) m.updateMatrix();
  }
  // The nine rigid parts, in the order the sculpt's binding names them.
  get parts() { return [this.torso, this.arms[0], this.forearms[0], this.arms[1], this.forearms[1], this.legs[0], this.shins[0], this.legs[1], this.shins[1]]; }

  // The wide sleeve of arm i lies over the arm from the upper arm to the wrist: the line it
  // is fixed along, in the body's frame, on the outer side of the limb as posed this frame.
  _sleevePins(i, name) {
    const up = this.arms[i], lo = this.forearms[i], pts = this._pins, v = this._pv, n = 6, sx = i ? -0.05 : 0.05;
    for (let k = 0; k < n; k++) {
      const along = 0.08 + (k / (n - 1)) * 0.47;
      if (along <= ELBOW) v.set(sx, -along, 0).applyQuaternion(up.quaternion).add(up.position);
      else v.set(sx, -(along - ELBOW), 0).applyQuaternion(lo.quaternion).add(lo.position);
      pts[k * 3] = v.x; pts[k * 3 + 1] = v.y; pts[k * 3 + 2] = v.z;
    }
    this.robe.setPins(name, pts);
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
    // (going nearly straight down without the boost, it descends feet first, upright; a dive
    // forward, or with the boost, stays head first)
    const sinking = speed > 0.5 && !motion.boost ? THREE.MathUtils.smoothstep(-motion.velocity.dot(up) / speed, 0.6, 0.92) : 0;
    const target = onFoot ? 0 : Math.min(1, motion.throttle * 1.2) * (speed > 0.5 ? 1 : 0) * (1 - sinking);
    this.flight += (target - this.flight) * (1 - Math.exp(-dt * 3.2));
    const boostTarget = !onFoot && motion.boost && motion.throttle > 0.5 ? 1 : 0;
    this.boost += (boostTarget - this.boost) * (1 - Math.exp(-dt * (boostTarget ? 2.5 : 1.8)));
    // Banking: into a turn of the view, and into sideways flight (the stick pushed to a side).
    const side = speed > 0.5 ? THREE.MathUtils.clamp(motion.velocity.dot(rig.right) / speed, -1, 1) : 0;
    // (yawRate > 0: turning right; bank > 0 rolls the right side down, into the turn)
    const bankTarget = THREE.MathUtils.clamp(motion.yawRate / 60 + side * 0.9, -1, 1) * 0.75;
    this.bank += (bankTarget - this.bank) * (1 - Math.exp(-dt * 4));
    // Coming in to land (flying, not hovering): in the last second or so before the feet
    // would touch, the body swings upright and the legs reach down.
    const vDown = -motion.velocity.dot(up), feetClear = (motion.agl ?? rig.agl ?? 99) - HERO_DROP - 0.9;
    const flareTarget = onFoot ? 0 : (1 - THREE.MathUtils.smoothstep(feetClear, 2, 3 + 1.2 * Math.max(0, vDown))) * THREE.MathUtils.smoothstep(vDown, 0.6, 2.0);
    this.flare += (flareTarget - this.flare) * (1 - Math.exp(-dt * 7));
    // (nothing of the flight tilt on foot: after a flared landing the standing figure tipped
    // forward 22 degrees while the flight amount faded)
    const f = this.flight * (1 - this.flare) * (1 - this.foot), fs = f * f * (3 - 2 * f), b = this.boost * this.boost * (3 - 2 * this.boost);
    // The chase distance: upright (hovering, landing) the figure stands 1.8 m tall and at
    // 4.1 m its boots fell on the frame's edge; it is drawn farther ahead then. The rig reads
    // it (App.updateHero), so landing puts the feet where the figure is drawn.
    const backTarget = HERO_DISTANCE + HOVER_BACK * (1 - fs);
    this.chaseBack = this.started ? this.chaseBack + (backTarget - this.chaseBack) * (1 - Math.exp(-dt * 2.5)) : backTarget;

    // Body axes: head direction goes from "up" to the direction of travel; the chest turns
    // from facing forward to facing the ground.
    const dir = speed > 0.5 ? this._z.copy(motion.velocity).divideScalar(speed) : this._z.copy(rig.forward);
    // On foot the figure faces where it runs (or, standing, where it last faced), turning smoothly.
    // (standing, it keeps facing where it last faced: the view can be turned round it to
    // see its face; it followed the view before, whatever the comment said)
    const moving = hspeed > 0.4, keep = onFoot && !moving && this.started && this.facing.lengthSq() > 0.5;
    const src = moving ? hv : keep ? this.facing : rig.forward;
    const want = this._f.copy(src).addScaledVector(up, -src.dot(up));
    if (want.lengthSq() > 1e-8) want.normalize();
    if (!this.started || this.facing.lengthSq() < 0.5) this.facing.copy(want);
    if (motion.facing) this.facing.copy(motion.facing);          // (screenshot poses)
    // (turning straight round: a lerp between opposite directions never leaves their line,
    // so nudge it sideways and let it swing round at the usual rate)
    if (this.facing.dot(want) < -0.98) this.facing.addScaledVector(this._g.crossVectors(up, this.facing), 0.05);
    this.facing.addScaledVector(up, -this.facing.dot(up)).lerp(want, 1 - Math.exp(-dt * 9)).normalize();
    // Cruising, the body is tipped a little short of the direction of travel (head up);
    // boosting, it lies along it.
    const head = this._y.copy(up).lerp(dir, fs * (0.82 + 0.18 * b)).normalize();
    // The chest faces the ground in flight (down from the view), and away from the camera
    // when the body is upright: climbing straight up, "down from the view" lies along the
    // body, and on its own it left the chest to a rounding error that turned the figure to
    // face the camera. The small share of the view's forward settles that case.
    const flyChest = this._g.copy(rig.up).negate().addScaledVector(rig.forward, 0.35);
    const chest = this._x.copy(rig.forward).lerp(this.facing, this.foot).lerp(flyChest, fs);
    chest.addScaledVector(head, -chest.dot(head));
    if (chest.lengthSq() < 1e-6) chest.copy(rig.forward).addScaledVector(head, -rig.forward.dot(head));
    chest.normalize();
    const left = this._g.crossVectors(head, chest).normalize();
    this._m4.makeBasis(left, head, chest);
    this.body.quaternion.setFromRotationMatrix(this._m4);
    this.body.rotateY(this.bank * (0.4 + 0.6 * fs) * (1 - 0.5 * b) * (1 - this.foot));     // lean into turns (about the head axis)
    // Running leans forward (a sprinter's lean, more at super speed); braking leans back.
    const run = THREE.MathUtils.smoothstep(hspeed, 2.5, 6.5), sup = THREE.MathUtils.smoothstep(hspeed, 8, 40);
    const leanTarget = onFoot && !motion.airborne ? 0.15 * run + 0.40 * sup : 0;
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt * 6));
    this.body.rotateX((this.lean + KNEEL_LEAN * this.kneel) * this.foot);
    // A step turns and tips the body: the shoulders against the legs, the weight over the
    // foot on the ground (from the gait as the last frame left it).
    const going = this.foot * (1 - this.air) * Math.min(1, hspeed / 1.6) * (1 - this.kneel), gs = Math.sin(this.gait);
    this.body.rotateY(-(0.05 + 0.07 * run) * gs * going * (1 - 0.6 * sup));
    this.body.rotateZ((0.025 + 0.02 * run) * Math.cos(this.gait) * going * (1 - 0.6 * sup));
    this.body.updateMatrix();
    this._m3.setFromMatrix4(this.body.matrix);

    // Acceleration felt by the figure (for the trailing lag, the legs and the cloak's inertia).
    if (!this.started) { this.prevVel.copy(motion.velocity); this.lag.set(0, 0, 0); this.turnLead.set(0, 0); this._pitch0 = rig.pitch ?? 0; this.legSwing = 0; }
    this.accel.copy(motion.velocity).sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
    this.prevVel.copy(motion.velocity);
    const aLen = this.accel.length();
    if (aLen > 30) this.accel.multiplyScalar(30 / aLen);     // interplanetary thrust would shred any cloth
    // (a rate: the same trail at 30, 60 and 120 fps; on foot the figure stands where its feet
    // are, so there it only fades)
    if (!onFoot) this.lag.addScaledVector(this.accel, -0.24 * dt);
    this.lag.multiplyScalar(Math.exp(-dt * 5));
    if (this.lag.length() > 0.8) this.lag.setLength(0.8);

    // Limbs, as [shoulder or hip x, z, elbow or knee] for left arm, right arm, left leg,
    // right leg (x < 0 swings a limb toward the chest side, z > 0 away from the body on
    // the left). Three poses blended by how much it flies and how much it boosts:
    // hovering: arms a little out from the sides with relaxed elbows, knees slightly bent,
    //   one more than the other, everything swaying a little; speeding up or braking
    //   swings the legs;
    // cruising: both arms swept back and a little out from the sides, so the wide sleeves
    //   stream behind them, the legs trailing with one knee a little bent, all of it alive
    //   (the arms ride the air, the legs trade places slowly); a turn lifts the outside arm
    //   and tucks the inside one. (It was one arm reaching ahead, "the classic flying pose":
    //   right for a caped suit, wrong for a robe: the sleeve hid the hand and hung forward of
    //   the head.)
    // boosting: streamlined, the arms tight back along the body, legs straight and together.
    const hov = 1 - fs, sway = Math.sin(this.time * 1.7) * 0.04 * hov, breathe = Math.sin(this.time * 1.1 + 0.6) * 0.03 * hov;
    const swingTarget = THREE.MathUtils.clamp(this.lag.dot(chest) * 1.4, -0.45, 0.45) * hov;
    this.legSwing += (swingTarget - this.legSwing) * (1 - Math.exp(-dt * 6));
    const P = this._pose || (this._pose = new Float32Array(12)), F = this._footPose || (this._footPose = new Float32Array(12));
    const H = this._hovPose || (this._hovPose = new Float32Array(12)), C = this._cruisePose || (this._cruisePose = new Float32Array(12));
    const B = this._boostPose || (this._boostPose = new Float32Array(12));
    const lean = this.bank * 0.35, flutter = Math.sin(this.time * 2.3) * 0.03;
    // (the arms hang a little out from the sides: OUT. The sculpt holds them much further
    // out, 0.585; a figure that stood, ran and flew like that was "doing a constant T pose",
    // the owner said. What lets them come in is the binding: a sleeve gives way to the skirt
    // where they join, scripts/hero/heroBind.mjs)
    const OUT = 0.24;
    H.set([-0.06 + sway, OUT + 0.5 * breathe + Math.max(0, lean), -0.20 - breathe,
      -0.06 - sway, -OUT + 0.5 * breathe + Math.min(0, lean), -0.16 + breathe,
      -0.12 + sway - this.legSwing, 0.04, 0.50 + this.legSwing * 0.5,
      -0.05 - sway - this.legSwing, -0.04, 0.16 + Math.max(0, this.legSwing)]);
    const ride = Math.sin(this.time * 1.3) * 0.05, ride2 = Math.sin(this.time * 0.9 + 1.7) * 0.04, kick = Math.sin(this.time * 0.75) * 0.10;
    C.set([0.42 + ride, Math.max(0.08, OUT + ride2 + lean * 1.4), -0.22 - ride2,     // (x > 0: back from the shoulder; z: out from the side)
      0.42 - ride * 0.7, Math.min(-0.08, -OUT + ride2 * 0.6 + lean * 1.4), -0.22 + ride2,
      0.05 + kick, 0.05, 0.42 + flutter - kick * 1.2,
      0.02 - kick, -0.04, 0.22 - flutter + kick * 1.2]);
    B.set([0.34, 0.10, -0.05,
      0.34, -0.10, -0.05,
      0.02, -0.012, 0.05,
      0.02, 0.012, 0.05]);
    for (let i = 0; i < 12; i++) P[i] = H[i] + (C[i] + (B[i] - C[i]) * b - H[i]) * fs;
    let crouch = 0;
    if (this.foot > 0.001) {
      // Gait: one stride (two steps) per cycle; longer strides the faster it goes, and at
      // super speed the cadence stops rising (the legs are a blur anyway).
      const stride = Math.min(2.8, 0.9 + 0.32 * hspeed);
      const g0 = this.gait;
      this.gait += Math.min(Math.PI * hspeed / stride, 2 * Math.PI * 4.2) * dt;
      // a footfall every half cycle, alternating feet (the app kicks up dust at each)
      if (onFoot && !motion.airborne && hspeed > 1.2 && Math.floor(this.gait / Math.PI - 0.5) !== Math.floor(g0 / Math.PI - 0.5)) {
        this.steps = (this.steps || 0) + 1; this.stepSide = this.stepSide ? 0 : 1; this.stepSpeed = hspeed;
      }
      // (the arms work with the legs: a walker's easy swing, a runner's bent arms driving
      // forward and back; at super speed they trail, swept back)
      const amp = Math.min(1, hspeed / 1.6), legA = 0.36 + 0.44 * run, armB = (0.30 + 0.50 * run) * (1 - 0.7 * sup);
      const kneeK = 0.34 + 1.10 * run, elbow = 0.10 + 0.14 * amp + 1.05 * run * (1 - 0.75 * sup);
      // In the air: legs tucked while rising, reaching down for the ground while falling.
      this.air += ((motion.airborne ? 1 : 0) - this.air) * (1 - Math.exp(-dt * 10));
      const rising = THREE.MathUtils.clamp((motion.vUp || 0) / 2, 0, 1);
      // Landing: a crouch that absorbs the impact, deeper for harder landings.
      const since = (motion.clock ?? 0) - (motion.landedAt ?? -99);
      crouch = onFoot && since >= 0 && since < 1.5 ? Math.exp(-since * 5) * THREE.MathUtils.clamp((motion.landSpeed || 0) / 7, 0, 1) : 0;
      // A hard landing (a fall of some 20 m on Mars) ends in a three-point landing: one knee
      // down, a hand on the ground, held for a moment before standing.
      // (all or nothing: the pose reaches the ground only at full weight)
      // The rig's own threshold and hold (it brakes the skid and locks the stick for
      // exactly that long: held longer, the figure slid a metre on one knee), and the pose
      // lets go as soon as the figure really moves.
      const hard = (motion.landSpeed || 0) > (rig.hardSpeed ?? 9) ? 1 : 0, hold = rig.hardHold ?? 0.45;
      // (a jump or take-off straight out of it lets go of the kneel at once)
      this.kneel = motion.airborne || !onFoot ? this.kneel * Math.exp(-dt * 10)
        : since >= 0 && since < 2.2 ? hard * (since < hold ? 1 : Math.exp(-(since - hold) * 6)) * (1 - THREE.MathUtils.smoothstep(hspeed, 0.5, 2.0)) : 0;
      crouch *= 1 - hard;
      // Up still held after a jump: the launch into flight, arms pressed down, legs together.
      this.launch += ((motion.airborne ? THREE.MathUtils.smoothstep(motion.upHeld || 0, 0.06, 0.3) : 0) - this.launch) * (1 - Math.exp(-dt * 12));
      const ga = (1 - this.air) * amp;
      for (let i = 0; i < 2; i++) {
        const ph = this.gait + i * Math.PI, sn = Math.sin(ph), cs = Math.cos(ph), sd = i ? -1 : 1;
        // legs (index 2 + i): forward swing is a negative hip angle; the knee bends most mid-swing
        // (the thigh swings further forward than back, and quicker forward: a stride, not a
        // pendulum; the knee folds as the leg comes through, and gives a little as the foot
        // takes the weight just after it lands)
        const swing = sn + 0.22 * Math.sin(2 * ph) * run, off = (((ph - 2.2 + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI, give = Math.exp(-off * off / 0.5);
        const hip = -(legA * swing + 0.10 * run) * ga - this.lean * 0.55 - crouch * 0.7 - this.air * (0.35 + 0.45 * rising);
        const fold = Math.max(0, cs), knee = 0.06 + ga * (kneeK * fold * fold * (3 - 2 * fold) + 0.10 * run + 0.22 * run * give) + crouch * 1.4 + this.air * (0.35 + 0.95 * rising);
        F[6 + i * 3] = hip; F[7 + i * 3] = sd * (0.04 + 0.05 * this.air); F[8 + i * 3] = knee;
        // arms (index i) swing against the leg on the same side
        F[i * 3] = armB * sn * ga + 0.04 + 0.50 * sup * ga - this.air * 0.45 + crouch * 0.3;
        F[1 + i * 3] = sd * (OUT - 0.06 + 0.22 * this.air + 0.04 * run + 0.10 * sup);
        F[2 + i * 3] = -(elbow * (0.6 + 0.4 * ga) + 0.15 * this.air);
      }
      // (angles are relative to the torso, which leans KNEEL_LEAN forward with the hips
      // KNEEL_DROP lower: in the world the left thigh is near level and its shin upright,
      // the right thigh hangs to a knee on the ground with the shin along it, the right arm
      // reaches straight down to a fist on the ground)
      const K = this._kneelPose || (this._kneelPose = new Float32Array([
        -0.15, 0.60, -0.40,       // left arm out behind, for balance
        -1.12, -0.14, -0.05,      // right arm straight down to the ground
        -2.70, 0.10, 1.55,        // left leg: foot planted ahead
        -0.95, -0.06, 1.40]));    // right leg: knee on the ground, shin along it
      // (rising: the arms pressed down and out a little, as if pushing off the air; it was a fist up)
      const L = this._launchPose || (this._launchPose = new Float32Array([
        0.14, 0.32, -0.18,  0.14, -0.32, -0.18,  0.05, 0.02, 0.10,  0.02, -0.02, 0.22]));
      for (let i = 0; i < 12; i++) F[i] += (K[i] - F[i]) * this.kneel + (L[i] - F[i]) * this.launch * (1 - this.kneel);
      const k = this.foot;
      for (let i = 0; i < 12; i++) P[i] += (F[i] - P[i]) * k;
    }
    this._limb(this.arms[0], this.forearms[0], P[0], P[1], P[2], ELBOW, HAND, 0.065, 0.06, 0);
    this._limb(this.arms[1], this.forearms[1], P[3], P[4], P[5], ELBOW, HAND, 0.065, 0.06, 2);
    this._limb(this.legs[0], this.shins[0], P[6], P[7], P[8], KNEE, ANKLE, 0.085, 0.078, 4);
    this._limb(this.legs[1], this.shins[1], P[9], P[10], P[11], KNEE, ANKLE, 0.085, 0.078, 6);
    this._sleevePins(0, 'sleeveL'); this._sleevePins(1, 'sleeveR');

    // Place the figure: on foot where the rig puts it (standing on the ground, lowered in a
    // landing crouch and by the bent knees of a run); flying, in front of and a little
    // below the camera (camera-relative metres).
    const p = this.group.position;
    if (onFoot || (rig._relBlend > 0.01 && motion === rig)) {
      p.copy(motion.heroRel || rig.heroRel);
      // (and the body rides the stride: lowest as a foot takes the weight, highest between steps)
      const bob = (0.012 + 0.030 * run) * Math.cos(2 * this.gait - 1.4) * Math.min(1, hspeed / 1.6) * (1 - this.air) * (1 - this.kneel);
      p.addScaledVector(up, -(crouch * 0.30 + 0.05 * run * (1 - this.air) + KNEEL_DROP * this.kneel + bob) * this.foot);
      // The chase offsets of flight fade out on foot instead of dropping (the figure jumped
      // up to 0.7 m on landing while the view turned, and again after the next take-off),
      // and the pitch is tracked so it is never stale when flight resumes.
      const kd = Math.exp(-dt * 8);
      this.lag.multiplyScalar(kd); this.turnLead.multiplyScalar(kd);
      this._pitch0 = rig.pitch ?? 0;
      const o = this._x.copy(this.lag).addScaledVector(rig.right, this.turnLead.x).addScaledVector(rig.up, this.turnLead.y);
      // (on foot the soles never go under the ground; an offset upward fades with the rest)
      if (onFoot) { const vu = o.dot(up); o.addScaledVector(up, -(vu > 0 ? vu * this.foot : vu)); }
      p.add(o);
    } else {
      // A chase camera: turning the view swings the camera round the figure, so the figure
      // drifts against the turn for a moment (up to ~0.7 m) and settles back to the centre.
      const pr = rig.pitch ?? 0, pitchRate = dt > 0 ? (pr - (this._pitch0 ?? pr)) / dt : 0;
      this._pitch0 = pr;
      const lx = THREE.MathUtils.clamp(-(motion.yawRate || 0) * 0.011, -0.7, 0.7), ly = THREE.MathUtils.clamp(-pitchRate * 0.008, -0.45, 0.45);
      const kl = 1 - Math.exp(-dt * 5);
      this.turnLead.x += (lx - this.turnLead.x) * kl; this.turnLead.y += (ly - this.turnLead.y) * kl;
      p.copy(rig.forward).multiplyScalar(this.chaseBack).addScaledVector(rig.up, -HERO_DROP).add(this.lag);
      p.addScaledVector(rig.right, this.turnLead.x).addScaledVector(rig.up, this.turnLead.y);
      p.addScaledVector(up, Math.sin(this.time * 0.9) * 0.05 * (1 - fs));      // gentle hover bob
      if (env.groundClearance) {
        const c = env.groundClearance(p);                     // metres of air under the figure's centre
        if (c < 1.0) p.addScaledVector(up, 1.0 - c);          // never sink into the ground
      }
    }

    // The cloth: gravity, inertia, and the air streaming past. In vacuum there is no air, but
    // it is still made to trail the direction of flight a little (owner's request).
    const g = this._g.copy(up).multiplyScalar(-env.gravity);
    // (the cloth is tuned for thin air: under a dense sky its forces would tear it, so the
    // air it feels stops at 0.2)
    const air = Math.min(env.air, 0.2);
    const flow = Math.min(speed, 42) * (0.3 + 0.7 * air);
    const wind = this._wind.copy(dir).multiplyScalar(-flow * (speed > 0.05 ? 1 : 0));
    // Across the body (upright while moving: coming in to land, drifting in a hover) the
    // stream may lean the cloth back but not lift it: its push there stops at 1.1 times the
    // cloth's weight. Along the body (streamlined flight) it is free. A full stream on an
    // upright figure flipped the robe up round the waist and the hair over the head.
    {
      const al = wind.dot(head), cx = wind.x - head.x * al, cy = wind.y - head.y * al, cz = wind.z - head.z * al;
      const cl = Math.hypot(cx, cy, cz), lim = (1.1 - 0.5 * this.foot + 0.9 * this.foot * sup) * env.gravity / (0.9 + 5.5 * air);     // (on foot the robe trails behind a runner at some thirty degrees, it does not fly: 0.6 of its weight; it was three times, right for a short cloak and a flag on this gown; at super speed 1.5)
      if (cl > lim) { const k = lim / cl - 1; wind.x += cx * k; wind.y += cy * k; wind.z += cz * k; }
    }
    // A breeze is always blowing through the robe and the hair (gently, from ahead and a
    // little to one side, its strength drifting), even standing still and in vacuum: the
    // owner wants the robe flowing. Like the cloak trailing in vacuum before it, a
    // deliberate departure from physics.
    // (its push is a share of this world's gravity, so the cloth leans and ripples instead
    // of standing straight out)
    // (a fifth of its weight, gusting to a third: at a third to a half, a wide sleeve of the
    // sculpt stood out sideways like a flag on a figure standing still)
    const bt = this.time, push = env.gravity * (0.20 + 0.09 * Math.sin(bt * 0.53) + 0.05 * Math.sin(bt * 1.37 + 1.0));
    const bs = push / (0.9 + 5.5 * air);                  // (cloth follows the air at this rate: robe.js)
    // ("From ahead" is toward the back of an upright figure and toward the feet of a flying
    // one: left blowing at its back in flight, it blew upward, and stood a sleeve on end
    // over the back like a fin.)
    const bx = (0.45 + 0.2 * Math.sin(bt * 0.21)) * (1 - 0.8 * fs);
    const bl = this._bz.set(bx * bs, (0.1 - 0.8 * fs) * bs, -0.65 * (1 - fs) * bs).applyMatrix3(this._m3);
    wind.add(bl);
    if (!this.started) { this.robe.reset(this._m3); this.started = true; }
    // the ground under the figure, as a plane for the cloth (kneeling put half a metre of the
    // skirt under it)
    const clear = env.groundClearance ? env.groundClearance(p) : null;
    this.robe.update(dt, this._m3, g, this.accel, wind, air, this.colliders, up, clear != null && clear < 4 ? -clear : null);
  }

  // Runs the cloak for a while with steady conditions (deterministic screenshots).
  settle(seconds, rig, env, motion = rig) {
    for (let t = 0; t < seconds; t += 1 / 60) this.update(1 / 60, rig, env, motion);
  }
}
