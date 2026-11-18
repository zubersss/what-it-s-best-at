// Camera state in double precision plus the movement modes and zoom.
// The three.js camera always sits at the origin; `pos` is the real world position.
//
// Modes:
//   walk – on the ground at eye height, jumps under the world's gravity
//   fly  – free debug camera
//   hero – flight behind the flying character: smoothed velocity, and a top speed that
//          grows with the distance to the nearest surface (of any body), so the same
//          stick takes you from hovering over a rock to crossing between planets
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { latLonToDir, localFrame, dirToLatLon } from '../core/ephemeris.js';

const DEG = Math.PI / 180;

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
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.3, 1e6);
    this.camera.matrixAutoUpdate = true;
    this.forward = new THREE.Vector3(); this.right = new THREE.Vector3(); this.up = new THREE.Vector3();
    this.east = [0, 0, 0]; this.north = [0, 0, 0]; this.localUp = [0, 0, 0];
    this._m = new THREE.Matrix4();
    this._dir = [0, 0, 0];
    this._wish = new THREE.Vector3(); this._prev = new THREE.Vector3(); this._prevHeading = 0;
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
    this.pitch = Math.max(-89, Math.min(89, Math.asin(Math.max(-1, Math.min(1, u))) / DEG));
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
      this.roll *= Math.exp(-dt * 1.2 * x * x * (3 - 2 * x));
      if (Math.abs(this.roll) < 2e-4) this.roll = 0;
    }
    this.heading = (this.heading + turn + 360) % 360;
    this.pitch = Math.max(-89, Math.min(89, this.pitch + lift));
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
      const dist = Math.max(1.5, Math.min(this.agl, this.spaceDistance));
      const top = Math.max(7, dist * 0.85) * (fast ? 3 : 1) * (slow ? 0.12 : 1);
      const kv = 1 - Math.exp(-dt * 2.6);
      const v = this.velocity;
      v.x += (w.x * top - v.x) * kv; v.y += (w.y * top - v.y) * kv; v.z += (w.z * top - v.z) * kv;
      const step = v.length() * dt, maxStep = dist * 0.4 + 2;       // never cross the gap in one frame
      p.addScaledVector(v, dt * (step > maxStep ? maxStep / step : 1));
      this._snapToGround(null);
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
