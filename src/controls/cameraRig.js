// Camera state in double precision plus the movement modes and zoom.
// The three.js camera always sits at the origin; `pos` is the real world position.
//
// Modes:
//   walk – on the ground at eye height, jumps under the world's gravity
//   fly  – free debug camera
//   hero – flight behind the flying character: smoothed velocity, and a top speed that
//          grows with the distance to the nearest surface (of any body), so the same
//          stick takes you from hovering over a rock to crossing between planets.
//          Bodies pull (see gravity.js) unless `hover` is on, and the nearest body may
//          not sweep across the view faster than SWEEP, so a fly-by can be caught.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { latLonToDir, localFrame, dirToLatLon } from '../core/ephemeris.js';
import { SWEEP, SPACE_CAP } from './gravity.js';

const DEG = Math.PI / 180;
// The view may point this close to straight up or down. (One degree short, as it used to
// be, turned every aim at a world directly overhead or underfoot into a miss.)
const PITCH_MAX = 89.9;

export class CameraRig {
  // heightAt(dirArray) -> terrain height above datum in metres.
  constructor(world, heightAt) {
    this.world = world;
    this.heightAt = heightAt;
    this.pos = new THREE.Vector3(world.radius, 0, 0);
    this.heading = 0; this.pitch = 0;
    // Roll about the view axis (radians). Normally zero: "up" on screen is the world's
    // up. After a hand-over to another world it holds the previous world's up, so the
    // view does not jump, and it is let go as the new world gets close.
    this.roll = 0;
    this.baseFov = CONFIG.DEFAULT_FOV; this.teleFov = CONFIG.TELE_FOV; this.fov = CONFIG.DEFAULT_FOV;
    this.mode = 'walk';
    this.vUp = 0; this.jumpOffset = 0;
    this.agl = 0; this.groundAlt = 0;
    this.velocity = new THREE.Vector3();     // m/s, planet-fixed axes
    this.throttle = 0;                       // 0..1, how hard the stick is pushed (hero mode)
    this.yawRate = 0;                        // deg/s, smoothed
    this.spaceDistance = Infinity;           // metres to the nearest surface of any other body (set by the app)
    // Set by the app every frame from gravity.js `surroundings`: the summed pull of every
    // body (a fraction of top speed, pointing where things fall) and the body with the
    // nearest surface (unit vector toward its centre, distance to that centre).
    this.pull = new THREE.Vector3();
    this.nearDir = new THREE.Vector3(0, 0, -1); this.nearR = Infinity;
    this.hover = false;                      // true: no gravity, the figure stays where it is put
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.3, 1e6);
    this.camera.matrixAutoUpdate = true;
    this.forward = new THREE.Vector3(); this.right = new THREE.Vector3(); this.up = new THREE.Vector3();
    this.east = [0, 0, 0]; this.north = [0, 0, 0]; this.localUp = [0, 0, 0];
    this._m = new THREE.Matrix4();
    this._dir = [0, 0, 0];
    this._wish = new THREE.Vector3(); this._prev = new THREE.Vector3(); this._prevHeading = 0;
    this._f0 = new THREE.Vector3(); this._u0 = new THREE.Vector3();
    this.held = 0;                           // 0: the view follows the local horizon, 1: it keeps its direction in space
  }

  setWorld(world, heightAt) { this.world = world; this.heightAt = heightAt; this.agl = 0; }

  setLatLon(lat, lon, eye, heading, pitch) {
    const d = latLonToDir(lat, lon);
    const h = this.heightAt(d);
    const r = this.world.radius + h + eye;
    this.pos.set(d[0] * r, d[1] * r, d[2] * r);
    // Height above ground is known here; leaving the old value until the next update
    // would give one frame of the previous place's flight speed (it scales with height).
    this.agl = eye; this.groundAlt = h;
    if (heading != null) this.heading = heading;
    if (pitch != null) this.pitch = pitch;
    this.jumpOffset = 0; this.vUp = 0; this.velocity.set(0, 0, 0); this._prevHeading = this.heading;
    this.roll = 0;
    this._refresh();
  }

  // Moves by metres east/north of the current position, standing on the ground.
  offsetMetres(east, north, eye) {
    localFrame([this.pos.x, this.pos.y, this.pos.z], this.east, this.north, this.localUp);
    const p = [this.pos.x + this.east[0] * east + this.north[0] * north, this.pos.y + this.east[1] * east + this.north[1] * north, this.pos.z + this.east[2] * east + this.north[2] * north];
    const l = Math.hypot(p[0], p[1], p[2]);
    const d = [p[0] / l, p[1] / l, p[2] / l];
    const ground = this.heightAt(d), r = this.world.radius + ground + eye;
    this.pos.set(d[0] * r, d[1] * r, d[2] * r);
    this.agl = eye; this.groundAlt = ground;
    this._refresh();
  }

  // Turns the view to look along a planet-fixed direction.
  lookAlong(dir) {
    localFrame([this.pos.x, this.pos.y, this.pos.z], this.east, this.north, this.localUp);
    const E = this.east, N = this.north, U = this.localUp;
    const l = dir.length() || 1;
    const e = (dir.x * E[0] + dir.y * E[1] + dir.z * E[2]) / l, n = (dir.x * N[0] + dir.y * N[1] + dir.z * N[2]) / l, u = (dir.x * U[0] + dir.y * U[1] + dir.z * U[2]) / l;
    this.heading = (Math.atan2(e, n) / DEG + 360) % 360;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, Math.asin(Math.max(-1, Math.min(1, u))) / DEG));
    this._prevHeading = this.heading;
    this._refresh();
  }

  get latLon() { return dirToLatLon([this.pos.x, this.pos.y, this.pos.z]); }
  get altitude() { return this.pos.length() - this.world.radius; }

  update(dt, input, zoomHeld) {
    this._prev.copy(this.pos);
    // Look
    const sens = 0.12 * (this.fov / CONFIG.DEFAULT_FOV);
    const kx = (input.down('ArrowRight') ? 1 : 0) - (input.down('ArrowLeft') ? 1 : 0);
    const ky = (input.down('ArrowUp') ? 1 : 0) - (input.down('ArrowDown') ? 1 : 0);
    let turn = input.dx * sens + kx * 60 * dt * (this.fov / CONFIG.DEFAULT_FOV);
    let lift = -input.dy * sens + ky * 45 * dt * (this.fov / CONFIG.DEFAULT_FOV);
    if (this.roll) {
      // While the view is rolled, "right" on the stick still means right on the screen.
      const cr = Math.cos(this.roll), sr = Math.sin(this.roll), t = turn;
      turn = t * cr - lift * sr; lift = t * sr + lift * cr;
      // Let the roll go as the world comes close: held beyond 40 radii, gone within a
      // few seconds inside 10.
      const R = this.world.radius, x = Math.min(1, Math.max(0, (40 * R - this.agl) / (30 * R)));
      this.roll *= Math.exp(-dt * 1.2 * x * x * (3 - 2 * x) * (1 - this.held));   // not while the view is being held in space
      if (Math.abs(this.roll) < 2e-4) this.roll = 0;
    }
    this.heading = (this.heading + turn + 360) % 360;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch + lift));
    if (dt > 0) {
      const dh = ((this.heading - this._prevHeading + 540) % 360) - 180;
      this.yawRate += (dh / dt - this.yawRate) * (1 - Math.exp(-dt * 8));
    }
    this._prevHeading = this.heading;

    // Zoom (hold key); wheel changes the telephoto strength.
    if (input.wheel) this.teleFov = Math.max(1.5, Math.min(30, this.teleFov * Math.pow(1.15, input.wheel)));
    const target = zoomHeld ? this.teleFov : this.baseFov;
    const k = 1 - Math.exp(-dt * 9);
    this.fov = Math.exp(Math.log(this.fov) + (Math.log(target) - Math.log(this.fov)) * k);

    this._basis();
    const fwd = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0) + input.moveY;
    const strafe = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0) + input.moveX;
    // Touch stick pushed to its rim = run / fly fast.
    const fast = input.down('ShiftLeft') || input.down('ShiftRight') || Math.hypot(input.moveX, input.moveY) > 0.96;
    const slow = input.down('ControlLeft');
    const upDown = (input.down('KeyE') || input.down('Space') ? 1 : 0) - (input.down('KeyQ') ? 1 : 0);
    const p = this.pos;

    if (this.mode === 'walk') {
      const speed = (fast ? 12 : 3.2) * (slow ? 0.3 : 1);
      const ch = Math.cos(this.heading * DEG), sh = Math.sin(this.heading * DEG);
      const e = (sh * fwd + ch * strafe) * speed * dt, n = (ch * fwd - sh * strafe) * speed * dt;
      p.x += this.east[0] * e + this.north[0] * n; p.y += this.east[1] * e + this.north[1] * n; p.z += this.east[2] * e + this.north[2] * n;
      // Jump under the world's gravity.
      if (input.hit('Space') && this.jumpOffset <= 0) this.vUp = 3.0;
      this.vUp -= this.world.gravity * dt;
      this.jumpOffset = Math.max(0, this.jumpOffset + this.vUp * dt);
      if (this.jumpOffset === 0 && this.vUp < 0) this.vUp = 0;
      this._snapToGround(CONFIG.EYE_HEIGHT + this.jumpOffset);
    } else if (this.mode === 'hero') {
      const w = this._wish.set(0, 0, 0).addScaledVector(this.forward, fwd).addScaledVector(this.right, strafe);
      w.x += this.localUp[0] * upDown; w.y += this.localUp[1] * upDown; w.z += this.localUp[2] * upDown;
      const wl = w.length();
      if (wl > 1) w.divideScalar(wl);
      this.throttle = Math.min(1, wl);
      // Top speed is proportional to how far the nearest surface is: metres per second near
      // the ground, faster than light between planets, and a smooth arrival at the far end.
      // Near the ground the fraction is small (a fifth of the height per second), so a 7 km
      // canyon wall drifts past slowly enough to look 7 km tall: with one fraction at every
      // height the ground streams by alike at 10 m and at 10 km, and the eye loses the
      // size of everything. Between 3 and 60 km it grows to 0.85, so trips between worlds
      // take as long as before.
      const dist = Math.max(1.5, Math.min(this.agl, this.spaceDistance));
      const xs = Math.min(1, Math.max(0, Math.log(dist / 3000) / Math.log(20)));
      const base = Math.max(7, dist * (0.2 + 0.65 * xs * xs * (3 - 2 * xs)));
      const fallBase = Math.max(7, dist * 0.85);     // falling keeps its pace (gravity is not a choice of speed)
      const top = Math.min(SPACE_CAP, base * (fast ? 3 : 1)) * (slow ? 0.12 : 1);
      // What the figure should be doing: what the stick asks for ...
      let tx = w.x * top, ty = w.y * top, tz = w.z * top;
      // ... plus the fall toward whatever pulls, unless hovering. The fall fades out as
      // the stick is pushed: flying is a decision and goes where it is aimed (a pull
      // that bent the path would make every aimed trip miss); letting go is what hands
      // the traveller to gravity.
      const g = this.pull;
      if (!this.hover && this.throttle < 1) {
        const k = Math.min(SPACE_CAP, fallBase) * (1 - this.throttle) * (1 - this.throttle);
        tx += g.x * k; ty += g.y * k; tz += g.z * k;
      }
      // The nearest body may not sweep across the view faster than SWEEP while it is
      // being approached or passed: the whole motion is slowed (never bent, an aimed trip
      // must stay aimed) until the part of it that goes around the body is slow enough.
      // Once the traveller is clearly receding the limit lets go.
      if (this.nearR < Infinity) {
        const n = this.nearDir, tl = Math.sqrt(tx * tx + ty * ty + tz * tz), vr = tx * n.x + ty * n.y + tz * n.z;
        const sl = Math.sqrt(Math.max(0, tl * tl - vr * vr)), lim = SWEEP * this.nearR;
        if (sl > lim) {
          const c = Math.min(1, Math.max(0, (vr / tl + 0.8) / 0.3)), f = 1 + (lim / sl - 1) * c * c * (3 - 2 * c);   // lets go once the motion is mostly away
          tx *= f; ty *= f; tz *= f;
        }
      }
      // Speeding up is eased; slowing down is five times quicker. Top speed shrinks with
      // the distance left, and a speed that lagged behind it carried the traveller
      // straight past the world being approached.
      const v = this.velocity;
      const kv = 1 - Math.exp(-dt * (v.lengthSq() > tx * tx + ty * ty + tz * tz ? 13 : 2.6));
      v.x += (tx - v.x) * kv; v.y += (ty - v.y) * kv; v.z += (tz - v.z) * kv;
      const step = v.length() * dt, maxStep = dist * 0.4 + 2;       // never cross the gap in one frame
      this._f0.copy(this.forward); this._u0.copy(this.up);
      p.addScaledVector(v, dt * (step > maxStep ? maxStep / step : 1));
      this._snapToGround(null);
      this._holdDirection();
      if (this.agl <= 1.2001) {
        // Standing on the ground: what is left of the fall is gone (the figure's pose and
        // cloak read the velocity, and a figure at rest must not look like it is sinking).
        const down = -(v.x * this.localUp[0] + v.y * this.localUp[1] + v.z * this.localUp[2]);
        if (down > 0) { v.x += this.localUp[0] * down; v.y += this.localUp[1] * down; v.z += this.localUp[2] * down; }
      }
    } else {
      const base = Math.max(4, Math.min(60000, this.agl * 0.7));
      const speed = base * (fast ? 6 : 1) * (slow ? 0.15 : 1);
      p.addScaledVector(this.forward, fwd * speed * dt);
      p.addScaledVector(this.right, strafe * speed * dt);
      p.x += this.localUp[0] * upDown * speed * dt; p.y += this.localUp[1] * upDown * speed * dt; p.z += this.localUp[2] * upDown * speed * dt;
      this._snapToGround(null);
    }
    if (this.mode !== 'hero') {
      this.throttle = 0;
      if (dt > 0) this.velocity.subVectors(p, this._prev).divideScalar(dt);
    }
    this._refresh();
  }

  // Heading and pitch are measured against the local horizon, which is right on and near
  // the ground: walk around a world and the horizon stays level. But the horizon's frame
  // turns as the traveller moves, so a view aimed at a distant body would slide off it on
  // the way out (and the trip would miss). So, away from the ground and when looking past
  // the world's edge rather than at it, the view keeps its direction in space instead:
  // heading, pitch and roll are re-read from the direction held before the move.
  // Looking at the world itself keeps the horizon frame, which is what makes "point at
  // the ground and push" come down on it, and an orbit keep its horizon.
  _holdDirection() {
    this.held = 0;
    const R = this.world.radius, ax = Math.min(1, Math.max(0, (this.agl - 0.01 * R) / (0.09 * R)));
    if (ax <= 0) return;
    const p = this.pos, r = p.length(), f = this._f0;
    const fromNadir = Math.acos(Math.max(-1, Math.min(1, -(f.x * p.x + f.y * p.y + f.z * p.z) / r)));
    const limb = Math.asin(Math.min(1, R / r));
    const dx = Math.min(1, Math.max(0, (fromNadir - limb - 0.035) / 0.175));
    const hold = ax * ax * (3 - 2 * ax) * dx * dx * (3 - 2 * dx);
    if (hold <= 0) return;
    const h0 = this.heading, p0 = this.pitch, r0 = this.roll;
    this.lookAlong(f);
    this.keepUp(this._u0);
    if (hold < 1) {
      const wrap = (a, m) => ((a + m * 1.5) % m) - m / 2;
      this.heading = (h0 + hold * wrap(this.heading - h0, 360) + 360) % 360;
      this.pitch = p0 + hold * (this.pitch - p0);
      this.roll = r0 + hold * wrap(this.roll - r0, 2 * Math.PI);
    }
    this._prevHeading = this.heading;
    this.held = hold;
  }

  toggleMode() { this.setMode(this.mode === 'walk' ? 'fly' : 'walk'); }

  setMode(mode) {
    this.mode = mode;
    this.jumpOffset = 0; this.vUp = 0; this.velocity.set(0, 0, 0);
    if (mode === 'walk') this.roll = 0;        // feet on the ground: the horizon is level
  }

  _snapToGround(eye) {
    const p = this.pos, l = p.length();
    const d = this._dir; d[0] = p.x / l; d[1] = p.y / l; d[2] = p.z / l;
    const ground = this.world.radius + this.heightAt(d);
    let r = l;
    if (eye != null) r = ground + eye; else r = Math.max(l, ground + 1.2);
    p.set(d[0] * r, d[1] * r, d[2] * r);
    this.agl = r - ground; this.groundAlt = ground - this.world.radius;
  }

  _basis() {
    localFrame([this.pos.x, this.pos.y, this.pos.z], this.east, this.north, this.localUp);
    const h = this.heading * DEG, p = this.pitch * DEG;
    const ch = Math.cos(h), sh = Math.sin(h), cp = Math.cos(p), sp = Math.sin(p);
    const E = this.east, N = this.north, U = this.localUp;
    this.forward.set(cp * (sh * E[0] + ch * N[0]) + sp * U[0], cp * (sh * E[1] + ch * N[1]) + sp * U[1], cp * (sh * E[2] + ch * N[2]) + sp * U[2]);
    this.right.set(ch * E[0] - sh * N[0], ch * E[1] - sh * N[1], ch * E[2] - sh * N[2]);
    this.up.crossVectors(this.right, this.forward);
    if (this.roll) {
      const cr = Math.cos(this.roll), sr = Math.sin(this.roll), r = this.right, u = this.up;
      const rx = r.x * cr + u.x * sr, ry = r.y * cr + u.y * sr, rz = r.z * cr + u.z * sr;
      u.set(u.x * cr - r.x * sr, u.y * cr - r.y * sr, u.z * cr - r.z * sr);
      r.set(rx, ry, rz);
    }
  }

  // Sets the roll so that the screen's up is as close as possible to `up` (planet-fixed).
  keepUp(up) {
    this.roll = 0; this._basis();
    this.roll = Math.atan2(-up.dot(this.right), up.dot(this.up));
    this._refresh();
  }

  _refresh() {
    this._basis();
    if (this.agl === 0) this._snapToGround(null);
    const f = this.forward;
    this._m.makeBasis(this.right, this.up, new THREE.Vector3(-f.x, -f.y, -f.z));
    this.camera.quaternion.setFromRotationMatrix(this._m);
    this.camera.position.set(0, 0, 0);
    this.camera.fov = this.fov;
  }

  // Sets near/far and aspect, then updates matrices. Called by the app before each pass.
  finalize(aspect, near, far) {
    const c = this.camera;
    c.aspect = aspect; c.near = near; c.far = far; c.fov = this.fov;
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
  }
}
