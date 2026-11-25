// Strokes of lightning, as ribbons (docs/briefs/clouds-weather-plan.md, "LIGHTNING"). A pool of
// four strokes; each is a seeded walk from the cloud's base at the strike's own place down to the
// ground there, with branches that stop in the air, drawn as quads turned to the eye: a narrow
// white-violet core with a glow ribbon five times as wide round it, so that a stroke reads even
// with the bloom switched off (the governor turns bloom off early) and is never thinner than two
// and a half pixels on a phone, 40 km away as 2 km away. (They were one-pixel lines: on a phone
// the heaviest storm there is came out as a few scratches.)
//
// Everything of a stroke is built in planet axes round its own foot and drawn relative to the
// camera each frame (uBoltPos: the camera to the foot), so a stroke stands still in the world
// while the traveller flies: built in the camera's frame, it flew along with the traveller.
//
// A stroke writes alpha 0 into the picture, so the exposure meter cannot be owned by it (it is
// 60 times as bright as sunlight). The light it throws on the land, the clouds and the rain is
// the weather's (flashLight, uFlash), and the flicker of both is one rule: storm.js boltFlicker.
//
// It is drawn in the bolt slot (sky/skySystem.js, after the far sheets and before the near cloud
// slices, so cloud in front of a stroke covers its top): `slot` and `mesh` are the same object.
import * as THREE from 'three';
import { localFrame } from '../core/ephemeris.js';
import { boltFlicker, boltReturns } from './storm.js';

export const BOLT = Object.freeze({
  STROKES: 4,          // strokes at once (weather.js FLASHES)
  PIECES: 64,          // pieces a stroke, at most (a walk takes 30 to 64 of them, branches the rest)
  BRANCH: 0.12,        // the chance of a branch at a piece
  MIN_PX: 1.25,        // the core's half-width: never under this many pixels of the picture ...
  MIN_M: 3,            // ... and never under this many metres (6 m wide, as a channel's glow is)
  GLOW: 5,             // the glow ribbon's width, times the core's
  GLOW_A: 0.25,        // ... at this share of the core's brightness
  SUNS: 60,            // the core: this many times the Sun's own light
  CORE: [1.0, 0.95, 1.2],      // white, a little violet
});

const F = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
// The one rule for a stroke's width, in metres of half-width: the JS and the shader are made
// from the same numbers (scripts/bolt-test.mjs checks that the shader has no rule of its own).
export function boltHalfWidth(dist, pix) { return Math.max(BOLT.MIN_M, BOLT.MIN_PX * pix * dist); }
export const BOLT_WIDTH_GLSL = `float boltHalfWidth(float dist, float pix) { return max(${F(BOLT.MIN_M)}, ${F(BOLT.MIN_PX)} * pix * dist); }`;

const MAX_V = BOLT.STROKES * BOLT.PIECES * 4;

export class Bolt {
  constructor(shared) {
    const geo = new THREE.BufferGeometry();
    // position: the piece's start, aTo its end, both in planet axes relative to the stroke's own
    // foot (uBoltPos). aBolt: x the stroke's slot, y the side (-1 or 1), z along the piece (0 at
    // its start, 1 at its end), w how bright the piece is (0: not a piece, thrown out below).
    this.pos = new Float32Array(MAX_V * 3); this.to = new Float32Array(MAX_V * 3); this.bolt = new Float32Array(MAX_V * 4);
    const index = new Uint32Array(BOLT.STROKES * BOLT.PIECES * 6);
    for (let s = 0; s < BOLT.STROKES; s++) for (let p = 0; p < BOLT.PIECES; p++) {
      const q = (s * BOLT.PIECES + p) * 4;
      for (let e = 0; e < 4; e++) { this.bolt[(q + e) * 4] = s; this.bolt[(q + e) * 4 + 1] = (e & 1) * 2 - 1; this.bolt[(q + e) * 4 + 2] = e >> 1; }
      index.set([q, q + 1, q + 2, q + 2, q + 1, q + 3], (s * BOLT.PIECES + p) * 6);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aTo', new THREE.BufferAttribute(this.to, 3));
    geo.setAttribute('aBolt', new THREE.BufferAttribute(this.bolt, 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.uniforms = {
      uExposure: shared.uExposure, uViewport: shared.uViewport,
      uBoltPos: { value: Array.from({ length: BOLT.STROKES }, () => new THREE.Vector3()) },        // the camera to each stroke's foot (m)
      uBoltBright: { value: new Array(BOLT.STROKES).fill(0) },
      uBoltGlow: { value: new THREE.Vector2(BOLT.GLOW, BOLT.GLOW_A) },   // the glow ribbon: its width in cores, its share of the core's light

    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: this.uniforms, depthTest: true, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: /* glsl */`
        in vec3 aTo; in vec4 aBolt;
        uniform vec3 uBoltPos[${BOLT.STROKES}]; uniform float uBoltBright[${BOLT.STROKES}]; uniform vec2 uViewport, uBoltGlow;
        out vec2 vRib;              // x: across the ribbon (-1 .. 1), y: how bright this piece is
        ${BOLT_WIDTH_GLSL}
        void main() {
          int k = int(aBolt.x + 0.5);
          float bright = aBolt.w * uBoltBright[k];
          // (a piece of no brightness is thrown out of the picture, not drawn with no size: a
          // quad of no width still lands on a pixel now and then)
          if (bright <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vRib = vec2(0.0); return; }
          vec3 base = uBoltPos[k], a = base + position, b = base + aTo;
          vec3 av = (viewMatrix * vec4(a, 1.0)).xyz, bv = (viewMatrix * vec4(b, 1.0)).xyz;
          vec3 at = mix(av, bv, aBolt.z);
          vec3 sd = cross(at, bv - av); float sl = length(sd);
          // one pixel of the picture, as an angle: from the projection and the viewport
          float pix = 2.0 / (projectionMatrix[1][1] * max(uViewport.y, 2.0));
          float hw = boltHalfWidth(max(-at.z, 0.05), pix) * uBoltGlow.x;
          if (sl > 1e-6) at += sd / sl * (hw * aBolt.y);
          vRib = vec2(aBolt.y, bright);
          gl_Position = projectionMatrix * vec4(at, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uExposure; uniform vec2 uBoltGlow;
        in vec2 vRib;
        layout(location = 0) out vec4 fragColor;
        void main() {
          float a = abs(vRib.x), g = 1.0 / uBoltGlow.x;
          // the core: the middle fifth of the ribbon, flat and hard-edged. Round it the glow,
          // which is what makes a stroke read when the bloom is off.
          float core = 1.0 - smoothstep(0.55 * g, g, a);
          float glow = uBoltGlow.y * pow(max(0.0, 1.0 - a), 2.5);
          vec3 c = vec3(${BOLT.CORE.map(F).join(', ')}) * (vRib.y * (core + glow) * uExposure);
          fragColor = vec4(c, 0.0);          // alpha 0: a stroke cannot own the exposure meter
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    // the bolt slot of sky/skySystem.js: the strokes are drawn there, before the near cloud slices
    this.slot = this.mesh;
    this.slots = Array.from({ length: BOLT.STROKES }, () => ({ flash: null, pieces: 0 }));
    this.saved = false;            // the governor's step: a narrower glow and half the pool
    this.seen = null;
  }

  // The governor's step (sky/skySystem.js setSaving): the glow ribbon narrower and half the
  // strokes, so a stroke still strikes and still reads.
  saving(id, off) {
    if (id !== 'bolt-glow') return;
    this.saved = !!off;
    // (it thins: the glow narrower and fainter, half the pool. A stroke still strikes, still
    // reaches the ground and is still over two pixels wide.)
    this.uniforms.uBoltGlow.value.set(off ? 2.5 : BOLT.GLOW, off ? 0.3 : BOLT.GLOW_A);
  }
  live(id) { return id === 'bolt-glow' ? this.saved : false; }
  has(id) { return id === 'bolt-glow'; }

  // Every frame. weather: the Weather (its flashes, their place and the traveller's); agl: the
  // camera's height over the ground (m); sunE: the Sun's irradiance in the game's units.
  update(weather, agl, sunE = 1) {
    const flashes = weather.flashes && weather.flashes.length ? weather.flashes : (weather.flash ? [weather.flash] : []);
    const R = weather.radius || 0, place = weather.place || [0, 0, 0];
    const slots = this.slots, pool = this.saved ? Math.max(1, BOLT.STROKES >> 1) : BOLT.STROKES;
    // a flash keeps its slot while it is alight; a slot whose flash is gone is free
    for (const s of slots) if (s.flash && !flashes.includes(s.flash)) { s.flash = null; s.pieces = 0; }
    for (const f of flashes) {
      if (!f.ground || slots.some((s) => s.flash === f)) continue;
      const k = slots.findIndex((s, i) => i < pool && !s.flash);
      if (k < 0) continue;
      slots[k].flash = f;
      slots[k].pieces = this._walk(k, f, R);
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aTo.needsUpdate = true; this.geo.attributes.aBolt.needsUpdate = true;
    }
    // where each stroke is (from the camera) and how bright it is now
    let used = 0, glow = 0;
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k], f = s.flash;
      let b = 0;
      if (f && k < pool) {
        const flick = boltFlicker(f.age, f.seed);
        b = flick > 0.004 ? BOLT.SUNS * sunE * f.power * flick : 0;
        const p = this.uniforms.uBoltPos.value[k], a = s.anchor;
        p.set(a[0] - place[0], a[1] - place[1], a[2] - place[2]);
      }
      this.uniforms.uBoltBright.value[k] = b;
      if (b > 0) { used = Math.max(used, k + 1); glow = Math.max(glow, b); }
    }
    this.glow = glow;              // (what a picture reports: the brightest stroke now)
    this.geo.setDrawRange(0, used * BOLT.PIECES * 6);
    this.mesh.visible = used > 0;
    this.seen = slots[0].flash;
  }

  // A stroke's channel: a seeded walk from the cloud's base at the strike's place down to the
  // ground there, with branches that stop in the air. Returns how many pieces it took. Every
  // piece is kept in planet axes relative to the stroke's foot.
  _walk(slot, f, R) {
    const e = [0, 0, 0], n = [0, 0, 0], u = [0, 0, 0];
    const dir = [f.x, f.y, f.z], dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    for (let i = 0; i < 3; i++) dir[i] /= dl;
    localFrame([dir[0] * R, dir[1] * R, dir[2] * R], e, n, u);
    const anchor = [dir[0] * (R + f.h0), dir[1] * (R + f.h0), dir[2] * (R + f.h0)];
    this.slots[slot].anchor = anchor;
    const drop = Math.max(200, f.h1 - f.h0);
    let seed = ((f.seed * 4294967296) | 0) || 7;
    const rnd = () => { seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909); return ((seed >>>= 0) / 4294967296); };
    const steps = Math.min(BOLT.PIECES - 10, 30 + Math.floor(rnd() * 35));
    const base = slot * BOLT.PIECES;
    let k = 0;
    const put = (x0, y0, z0, x1, y1, z1, bright) => {
      if (k >= BOLT.PIECES) return;
      const q = (base + k) * 4;
      for (let v = 0; v < 4; v++) {
        this.pos[(q + v) * 3] = x0; this.pos[(q + v) * 3 + 1] = y0; this.pos[(q + v) * 3 + 2] = z0;
        this.to[(q + v) * 3] = x1; this.to[(q + v) * 3 + 1] = y1; this.to[(q + v) * 3 + 2] = z1;
        this.bolt[(q + v) * 4 + 3] = bright;
      }
      k++;
    };
    // (local metres: a along the east, b along the north, h over the foot)
    const walk = (a, b, h, fall, count, wander, bright, home = true) => {
      for (let i = 0; i < count && k < BOLT.PIECES; i++) {
        // (a channel wanders, but it ends where the strike is: each step is drawn back toward
        // the foot by its share of what is left, so the walk closes on it instead of straying
        // a third of its own length sideways)
        const pull = home ? 1 / (count - i) : 0;
        const na = a + (rnd() - 0.5) * wander - a * pull, nb = b + (rnd() - 0.5) * wander - b * pull, nh = h - fall / count;
        put(e[0] * a + n[0] * b + u[0] * h, e[1] * a + n[1] * b + u[1] * h, e[2] * a + n[2] * b + u[2] * h,
          e[0] * na + n[0] * nb + u[0] * nh, e[1] * na + n[1] * nb + u[1] * nh, e[2] * na + n[2] * nb + u[2] * nh, bright);
        // a branch now and then, shorter and fainter, that stops in the air
        // (a branch only while the main channel's own pieces are still spoken for: branches ate
        // the budget, and the stroke stopped 300 m above the ground)
        if (count > 12 && rnd() < BOLT.BRANCH && k + (count - i) + 5 <= BOLT.PIECES) walk(na, nb, nh, fall * 0.25 * rnd(), 4, wander * 1.4, bright * 0.5, false);
        a = na; b = nb; h = nh;
      }
    };
    walk(0, 0, drop, drop, steps, drop * 0.04, 1);
    // the pieces of the slot this stroke does not use are thrown out of the picture
    for (let p = k; p < BOLT.PIECES; p++) { const q = (base + p) * 4; for (let v = 0; v < 4; v++) this.bolt[(q + v) * 4 + 3] = 0; }
    return k;
  }
}
