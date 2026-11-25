// Lenticular clouds: the smooth lens-shaped plates that stand still in the lee of a summit on a
// windy, stable day while the wind streams through them (the plan's "Lenticular (standing-wave)
// clouds"). A poster's shape: a clean line between light and shade, a pearly rim, and one, two
// or three plates stacked.
//
// They do not move with the wind — the wave they form in stands over the land — so they are
// placed from the field's own list (one record per lens: where, how big, which way it lies, how
// many plates, how strong) and nothing about them depends on the traveller. The list is the
// model's (package A: field.lenses(t), as field.anvils(t) is); while there is none, this draws
// nothing and costs nothing.
//
// Cost: at most LENS_MAX plates, 768 triangles each, one draw each, no texture read.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { LENS } from '../weather/sky/format.js';

export const LENS_LOOK = Object.freeze({
  MAX: 12,                  // plates at once
  FLAT: 0.11,               // how deep a plate is, against its width
  GAP: 1.35,                // the gap between stacked plates, against a plate's depth
  SHADE: 0.66,              // its shaded side (the two tones)
  RIM: 0.35,                // the pearly rim where it is seen edge on
  EDGE: 0.22,               // how much of the lens is the soft rim
});
const L = LENS_LOOK;
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

const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform float uStrength;
in vec3 vRel;
in vec3 vN;
in vec3 vLocal;
layout(location = 0) out vec4 fragColor;
void main() {
  // the soft rim: the lens fades out at its own edge, so it has no cut line in the air
  float r = length(vLocal.xz);
  float alpha = uStrength * (1.0 - smoothstep(1.0 - ${glf(L.EDGE)}, 1.0, r));
  if (alpha < 0.01) discard;
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
  vec3 N = normalize(vN);
  float sun = dot(N, uSunDir);
  // two tones with a clean line between them, and a pearly rim where the plate is seen edge on
  float lit = mix(${glf(L.SHADE)}, 1.0, smoothstep(-0.05, 0.12, sun));
  float rim = ${glf(L.RIM)} * pow(1.0 - abs(dot(N, normalize(-vRel))), 3.0);
  vec3 col = vec3(0.92) * (directSun(planetPos) * (lit + rim) + skyLight(up, up) * 0.85) / PI;
  col = aerialPerspective(col, vRel);
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

export class Lenticulars {
  constructor(renderer) {
    this.renderer = renderer;
    this.off = false; this.list = [];
    this.uniforms = { ...lightingUniforms(), uCentre: { value: new THREE.Vector3() }, uAlong: { value: new THREE.Vector3() }, uAcross: { value: new THREE.Vector3() }, uUpAxis: { value: new THREE.Vector3() }, uStrength: { value: 1 } };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1 }, uniforms: this.uniforms,
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthTest: true, depthWrite: false, transparent: true,
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
    if (!sky || sky.noClouds || this.off || !sky.field?.on || !sky.field.lenses) return;
    const rec = sky.field.lenses(sky.t), R = sky.R, cam = c.rig.pos;
    for (let o = 0; o + LENS.STRIDE <= rec.length && list.length < L.MAX; o += LENS.STRIDE) {
      const strength = rec[o + LENS.STRENGTH];
      if (!(strength > 0.02)) continue;
      const x = rec[o + LENS.X], y = rec[o + LENS.Y], z = rec[o + LENS.Z], base = rec[o + LENS.BASE];
      const len = rec[o + LENS.LENGTH], wid = rec[o + LENS.WIDTH], head = rec[o + LENS.HEADING], plates = Math.max(1, Math.min(3, Math.round(rec[o + LENS.PLATES])));
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
  }

  draw(c) {
    if (!this.list.length) return;
    const u = this.uniforms;
    for (const p of this.list) {
      u.uCentre.value.set(p.centre[0], p.centre[1], p.centre[2]);
      u.uAlong.value.set(p.along[0], p.along[1], p.along[2]);
      u.uAcross.value.set(p.across[0], p.across[1], p.across[2]);
      u.uUpAxis.value.set(p.up[0], p.up[1], p.up[2]);
      u.uStrength.value = p.strength;
      this.material.uniformsNeedUpdate = true;
      c.renderer.render(this.scene, c.rig.camera);
    }
  }

  saving() {}
  live() { return false; }
  has() { return false; }
  partOut(id, out) { if (id === 'fog') this.off = !!out; }
}
