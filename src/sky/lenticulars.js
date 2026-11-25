// Lenticular clouds: the smooth lens-shaped plates that stand still in the lee of a summit on a
// windy, stable day while the wind streams through them (the plan's "Lenticular (standing-wave)
// clouds"). A poster's shape: a clean line between light and shade, a pearly rim, and one, two
// or three plates stacked.
//
// They do not move with the wind — the wave they form in stands over the land — so they are
// placed from the field's own list (one record per lens: where, how big, which way it lies, how
// many plates, how strong) and nothing about them depends on the traveller. The list is the
// model's (package A: field.lenses(t), as field.anvils(t) is); until that call is there, the
// records are read out of the snapshot the field is blending now, which holds them already
// (weather/sky/format.js LENS). They stand still over the land, so the snapshot round the clock
// is as good as a blend between two. Where there is neither, this draws nothing and costs nothing.
//
// Cost: at most LENS_MAX plates, 768 triangles each, one draw each, no texture read.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { LENS } from '../weather/sky/format.js';

export const LENS_LOOK = Object.freeze({
  MAX: 12,                  // plates at once
  THIN_MAX: 3,              // ... and with the governor's step on (one plate each, the nearest three lenses)
  FLAT: 0.11,               // how deep a plate is, against its width
  GAP: 1.35,                // the gap between stacked plates, against a plate's depth
  SHADE: 0.66,              // its shaded side (the two tones)
  RIM: 0.35,                // the pearly rim where it is seen edge on
  THICK: 140,               // m of it a ray must cross to hide what is behind (its edges fade out by themselves)
});
const L = LENS_LOOK;
const NO_LENS = [];
const LENS_EVERY = 10;            // s of the game clock between one reading of the field's list and the next
const LENS_REAL = 0.25;           // ... and at least this many seconds of the wall clock

// The lenses standing now, each { x, y, z, base, length, width, heading, plates, strength }:
// the field's own call where there is one (the model hands back objects), else the LENS records
// of the snapshot it is blending (its pair's first, or the nearest it holds).
const fromRecords = (rec) => {
  const out = [];
  for (let o = 0; o + LENS.STRIDE <= rec.length; o += LENS.STRIDE) {
    out.push({
      x: rec[o + LENS.X], y: rec[o + LENS.Y], z: rec[o + LENS.Z], base: rec[o + LENS.BASE],
      length: rec[o + LENS.LENGTH], width: rec[o + LENS.WIDTH], heading: rec[o + LENS.HEADING],
      plates: rec[o + LENS.PLATES], strength: rec[o + LENS.STRENGTH],
    });
  }
  return out;
};
function lensList(field, t) {
  if (typeof field.lenses === 'function') {
    const v = field.lenses(t);
    if (!v) return NO_LENS;
    return ArrayBuffer.isView(v) ? fromRecords(v) : v;
  }
  /* eslint-disable-next-line no-unreachable */
  const snaps = field.snaps;
  if (!snaps || !snaps.size) return NO_LENS;
  const want = field.pair ? field.pair[0] : t;
  let best = null, bd = Infinity;
  for (const [k, s] of snaps) { const d = Math.abs(k - want); if (s && s.lenses && d < bd) { bd = d; best = s; } }
  return best ? fromRecords(best.lenses) : NO_LENS;
}
const glf = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

const VERT = /* glsl */`
uniform vec3 uCentre;          // the plate's middle, from the camera (m)
uniform vec3 uAlong, uAcross;  // its long axis (across the wind) and the wind's way, each as long as the plate's half-size
uniform vec3 uUpAxis;          // its own up, as deep as the plate is
out vec3 vRel;
out vec3 vN;
out vec3 vLocal;
void main() {
  vLocal = position;           // (a unit ball: the plate is it, flattened)
  vec3 p = uCentre + uAlong * position.x + uAcross * position.z + uUpAxis * position.y;
  vRel = p;
  // its exact normal: the flattening turned round
  vN = normalize(position.x * uAlong / dot(uAlong, uAlong) + position.z * uAcross / dot(uAcross, uAcross) + position.y * uUpAxis / dot(uUpAxis, uUpAxis));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
// (the back faces are drawn: every ray that meets the plate has one, from outside and from
// within, and what is wanted is the ray's way through, not the surface it first touches)

const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform float uStrength;
uniform vec3 uCamLocal;        // where the camera stands in the plate's own units (1 = its half-size)
uniform vec3 uAlong, uAcross, uUpAxis;
in vec3 vRel;
in vec3 vN;
in vec3 vLocal;
layout(location = 0) out vec4 fragColor;
void main() {
  // How far the ray goes through the plate — the metres of cloud it crosses, not where the
  // surface is. (By the surface's own distance from the middle, a lens seen edge on was its own
  // rim everywhere and faded away to nothing: from the side, which is how one stands under a
  // range and looks at them, there was no lens at all.)
  // The plate is a unit ball stretched by its three axes: the ray in those units meets it in a
  // quadratic, and one unit step is as many metres as the axes make it.
  vec3 du = normalize(vLocal - uCamLocal);
  float b = dot(uCamLocal, du), c = dot(uCamLocal, uCamLocal) - 1.0;
  float h = b * b - c;
  if (h <= 0.0) discard;
  h = sqrt(h);
  float tu = (-b + h) - max(-b - h, 0.0);
  if (tu <= 0.0) discard;
  vec3 dm = uAlong * du.x + uUpAxis * du.y + uAcross * du.z;
  float through = tu * length(dm);
  float alpha = uStrength * (1.0 - exp(-through / ${glf(L.THICK)}));
  if (alpha < 0.01) discard;
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
  // (the back faces are the ones drawn, so the normal is turned to face the eye: the tone
  // wanted is the one of the side one is looking at)
  vec3 N = normalize(vN), V = normalize(-vRel);
  if (dot(N, V) < 0.0) N = -N;
  float sun = dot(N, uSunDir);
  // two tones with a clean line between them, and a pearly rim where the plate is seen edge on
  float lit = mix(${glf(L.SHADE)}, 1.0, smoothstep(-0.05, 0.12, sun));
  float rim = ${glf(L.RIM)} * pow(1.0 - abs(dot(N, V)), 3.0);
  vec3 col = vec3(0.92) * (directSun(planetPos) * (lit + rim) + skyLight(up, up) * 0.85) / PI;
  col = aerialPerspective(col, vRel);
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

export class Lenticulars {
  constructor(renderer) {
    this.renderer = renderer;
    this.off = false; this.thin = false; this.list = []; this._lenses = null; this._lensT = null; this._lensField = null; this._lensReal = -1e9;
    this.uniforms = { ...lightingUniforms(), uCentre: { value: new THREE.Vector3() }, uAlong: { value: new THREE.Vector3() }, uAcross: { value: new THREE.Vector3() }, uUpAxis: { value: new THREE.Vector3() }, uStrength: { value: 1 }, uCamLocal: { value: new THREE.Vector3() } };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1 }, uniforms: this.uniforms,
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthTest: true, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12), this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 940;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
  }

  // Before the main picture: the lenses the field has now, as plates to draw. c: { rig, sky }.
  update(c) {
    const sky = c.sky, list = this.list;
    list.length = 0;
    if (!sky || sky.noClouds || this.off || !sky.field?.on) return;
    // The list itself is asked for rarely: a lens stands still over its summit and grows and
    // fades over half an hour, and the model works a whole weather moment out for every t it is
    // given (3.1 ms a call here, against 0.014 for one it has already seen). The plates are
    // built from it every frame all the same: where they stand is where the traveller is.
    const R = sky.R, cam = c.rig.pos;
    // (and not more often than LENS_REAL seconds of the wall clock, however fast the game's own
    // clock is running: at sixty times real time, ten seconds of it go by six times a second)
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this._lenses || this._lensT == null || sky.field !== this._lensField
      || (Math.abs(sky.t - this._lensT) > LENS_EVERY && now - (this._lensReal || -1e9) > LENS_REAL * 1000)) {
      this._lenses = lensList(sky.field, sky.t); this._lensT = sky.t; this._lensField = sky.field; this._lensReal = now;
    }
    const all = this._lenses;
    // The model lays them over the whole world (a dozen at a time, by its high summits), and this
    // draws at most L.MAX plates: so the NEAREST are taken, and any that stands beyond the
    // horizon from here is dropped. (Taking them in the order the model gives filled the twelve
    // with lenses four hundred kilometres away — over the edge of a world 250 km in radius — and
    // the one standing nine kilometres ahead was never drawn.)
    const alt = Math.max(0, cam.length() - R);
    const near = [];
    for (const L0 of all) {
      if (!(L0.strength > 0.02)) continue;
      const rr = R + L0.base;
      const d = Math.hypot(L0.x * rr - cam.x, L0.y * rr - cam.y, L0.z * rr - cam.z);
      // (the geometric horizon: as far as the eye reaches from its height, plus as far as the
      // lens's own height reaches back, and a little over)
      if (d > 1.2 * (Math.sqrt(2 * R * alt + alt * alt) + Math.sqrt(2 * R * L0.base + L0.base * L0.base))) continue;
      near.push([d, L0]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, L0] of near) {
      if (list.length >= (this.thin ? L.THIN_MAX : L.MAX)) break;
      const strength = L0.strength;
      const x = L0.x, y = L0.y, z = L0.z, base = L0.base;
      const len = L0.length, wid = L0.width, head = L0.heading;
      const plates = this.thin ? 1 : Math.max(1, Math.min(3, Math.round(L0.plates)));
      const r = R + base, up = [x, y, z];
      // its own axes: north and east at its place, turned to the heading the wind blows toward
      let east = [-y, x, 0];
      const el = Math.hypot(east[0], east[1]);
      east = el > 1e-9 ? [east[0] / el, east[1] / el, 0] : [1, 0, 0];
      const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
      const ce = Math.sin(head), cn = Math.cos(head);
      // the wind's way, and the ridge's way across it (the lens lies across the wind)
      const wind = [north[0] * cn + east[0] * ce, north[1] * cn + east[1] * ce, north[2] * cn + east[2] * ce];
      const along = [north[0] * -ce + east[0] * cn, north[1] * -ce + east[1] * cn, north[2] * -ce + east[2] * cn];
      const deep = L.FLAT * 0.5 * wid;
      for (let k = 0; k < plates; k++) {
        const lift = (k - (plates - 1) / 2) * deep * 2 * L.GAP, rr = r + lift;
        list.push({
          centre: [x * rr - cam.x, y * rr - cam.y, z * rr - cam.z],
          along: [along[0] * 0.5 * len, along[1] * 0.5 * len, along[2] * 0.5 * len],
          across: [wind[0] * 0.5 * wid, wind[1] * 0.5 * wid, wind[2] * 0.5 * wid],
          up: [up[0] * deep, up[1] * deep, up[2] * deep],
          strength: strength * (k === 0 ? 1 : 0.8),
        });
      }
    }
    // Drawn from the FARTHEST to the nearest: they are see-through, and what is laid over what
    // is the order they are drawn in. The nearest were taken first (that is what the cap is for),
    // which is exactly the wrong order to draw them in — a lens behind another was blended over
    // it, and the plates of one lens, which do overlap when it is seen from the side, were laid
    // bottom over top.
    list.sort((a, b) => (b.centre[0] ** 2 + b.centre[1] ** 2 + b.centre[2] ** 2) - (a.centre[0] ** 2 + a.centre[1] ** 2 + a.centre[2] ** 2));
  }

  draw(c) {
    if (!this.list.length) return;
    const u = this.uniforms;
    for (const p of this.list) {
      u.uCentre.value.set(p.centre[0], p.centre[1], p.centre[2]);
      u.uAlong.value.set(p.along[0], p.along[1], p.along[2]);
      u.uAcross.value.set(p.across[0], p.across[1], p.across[2]);
      u.uUpAxis.value.set(p.up[0], p.up[1], p.up[2]);
      // where the camera stands in the plate's own units (the camera is the origin, so this is
      // its middle turned round and measured along each axis)
      const q = p.centre, dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      u.uCamLocal.value.set(-dot3(q, p.along) / dot3(p.along, p.along), -dot3(q, p.up) / dot3(p.up, p.up), -dot3(q, p.across) / dot3(p.across, p.across));
      u.uStrength.value = p.strength;
      this.material.uniformsNeedUpdate = true;
      c.renderer.render(this.scene, c.rig.camera);
    }
  }

  // The governor's step and the benchmark's part (the wiring in sky/skySystem.js is the main
  // session's: SKY_SAVINGS 'lenses', SKY_PARTS 'lenses'. Until it is there this answers to
  // nothing, as a stand-in does, and the lenses are always drawn: at most L.MAX plates, one
  // draw each. Thinned, only the nearest few lenses are drawn and each as a single plate — a
  // lens is still over its summit, which is what the place is about.)
  saving(id, off) { if (id === 'lenses') this.thin = !!off; }
  live(id) { return id === 'lenses' && this.list.length > 0; }
  has(id) { return id === 'lenses'; }
  partOut(id, out) { if (id === 'lenses') this.off = !!out; }
}
