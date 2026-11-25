// Valley fog and sea fog: white lakes of mist lying in the basins between dark ridges, with
// their tops gilded by a low Sun (the plan's "Valley fog and sea fog").
//
// It is a sheet of 129 x 129 points over 60 km, on a LATTICE FIXED TO THE WORLD (the middle
// snapped to whole steps and re-anchored only when the traveller has moved a whole step), so
// nothing of the fog moves when the traveller moves: a point of the world keeps its own height
// and its own lumps. Each vertex is lifted to the fog's top at its own place, which is field C's
// first channel (m above the sea), and the sheet is depth-tested, so a ridge cuts it crisply and
// the mist lies behind what stands out of it.
//
// Cost: one draw of 32 768 triangles, one read of the field a vertex and one of the noise a
// pixel. It is drawn only where the field has fog within reach.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { SKY_FIELD_GLSL, SKY_UNIFORMS } from './skyGlsl.js';
import { makeSkyAt } from '../weather/sky/format.js';

export const FOG_LOOK = Object.freeze({
  SPAN: 60000,       // m across the whole sheet
  N: 129,            // points a side
  EDGE: 40,          // m of fog over the country at which the sheet is fully there
  LUMP: 900,         // m: the soft lumps of its top (in what it takes of the light behind it;
                     // its top itself is level, as a lake of mist is)
  ALPHA: 0.97,       // the most it takes of what is behind it
  BRIGHT: 1.06,      // mist is bright: it takes the Sun and the sky and keeps them
});
const F = FOG_LOOK;
const glf = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

const VERT = /* glsl */`
${SKY_FIELD_GLSL}
uniform vec3 uAnchor;          // the lattice's middle, a point of the world (planet axes, m)
uniform vec3 uEast, uNorth;    // its axes there
uniform float uStep;           // m between two points of the lattice
out vec3 vRel;
out vec3 vPlanet;
out float vFog;                // how much fog stands over the country here (m)
void main() {
  // the lattice point: a place of the world, not of the traveller
  vec3 p = uAnchor + uEast * (position.x * uStep) + uNorth * (position.y * uStep);
  vec3 dir = normalize(p);
  vec4 C = wxRead(tWxC, dir);
  float top = wxFogTop(C), country = wxCountry(C);
  vFog = max(top - country, 0.0);
  vPlanet = dir;
  vec3 w = dir * (uSkyLow.y + max(top, country)) - uCamPlanetPos;
  vRel = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
precision highp sampler3D;
${SKY_FIELD_GLSL}
in vec3 vRel;
in vec3 vPlanet;
in float vFog;
layout(location = 0) out vec4 fragColor;
void main() {
  if (vFog < 1.0) discard;
  // soft lumps along its top, read in the low layer's frame so they drift with the ground wind
  float n = skyTex3(tCloudNoise, skyToLow(uCloudSteer, vPlanet) * (uSkyLow.y * uSkyLow.x * ${glf(4200 / F.LUMP)})).r;
  float alpha = ${glf(F.ALPHA)} * smoothstep(0.0, ${glf(F.EDGE)}, vFog) * smoothstep(0.15, 0.55, n + 0.35);
  if (alpha < 0.01) discard;
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
  vec3 sun = directSun(planetPos) * max(dot(up, uSunDir), 0.0);
  vec3 col = vec3(${glf(F.BRIGHT)}) * (sun * 0.75 + skyLight(up, up) * 0.95) / PI;
  col = aerialPerspective(col, vRel);
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

export class FogSheet {
  constructor(renderer) {
    this.renderer = renderer;
    this.off = false; this.ready = false;
    this.uniforms = {
      ...lightingUniforms(), uSkyLow: SKY_UNIFORMS.uSkyLow, tWxA: SKY_UNIFORMS.tWxA, tWxB: SKY_UNIFORMS.tWxB, tWxC: SKY_UNIFORMS.tWxC,
      tCloudNoise: SKY_UNIFORMS.tCloudNoise, uCloudSteer: SKY_UNIFORMS.uCloudSteer, uCloudRise: SKY_UNIFORMS.uCloudRise,
      uAnchor: { value: new THREE.Vector3() }, uEast: { value: new THREE.Vector3() }, uNorth: { value: new THREE.Vector3() }, uStep: { value: F.SPAN / (F.N - 1) },
    };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1 }, uniforms: this.uniforms,
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthTest: true, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.material = mat;
    // (the grid's x and y run from -(N-1)/2 to (N-1)/2 in whole steps: a lattice, not a plane of
    // its own size, so the vertex shader can snap it to the world)
    const geo = new THREE.PlaneGeometry(F.N - 1, F.N - 1, F.N - 1, F.N - 1);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 950;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this._anchor = null;
  }

  // Before the main picture: where the lattice stands (snapped, so it does not slide), and
  // whether there is any fog in reach at all. c: { rig, sky }.
  update(c) {
    const sky = c.sky, R = sky?.R || 0;
    this.ready = false;
    if (!R || !sky.field?.on || sky.noClouds || this.off || !this.uniforms.tCloudNoise.value) return;
    const step = this.uniforms.uStep.value, p = c.rig.pos;
    const r = p.length(), up = [p.x / r, p.y / r, p.z / r];
    let east = [-p.y, p.x, 0];
    const el = Math.hypot(east[0], east[1]);
    east = el > 1 ? [east[0] / el, east[1] / el, 0] : [1, 0, 0];
    const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
    // the lattice's middle: the traveller's place snapped to whole steps in those axes, kept
    // until it is a whole step away (so the sheet's points stay on the same places of the world)
    const a = this._anchor;
    const de = a ? (p.x - a[0]) * east[0] + (p.y - a[1]) * east[1] + (p.z - a[2]) * east[2] : 0;
    const dn = a ? (p.x - a[0]) * north[0] + (p.y - a[1]) * north[1] + (p.z - a[2]) * north[2] : 0;
    if (!a || Math.abs(de) > step || Math.abs(dn) > step) {
      const ne = a ? Math.round(de / step) : 0, nn = a ? Math.round(dn / step) : 0;
      const base = a || [p.x, p.y, p.z];
      this._anchor = [base[0] + east[0] * ne * step + north[0] * nn * step, base[1] + east[1] * ne * step + north[1] * nn * step, base[2] + east[2] * ne * step + north[2] * nn * step];
    }
    // Is there fog within reach? (the field over a square of 25 places across the sheet; the
    // sheet is drawn only where there is. A ring of eight at the sheet's edge missed what lay
    // between them: fog lies in basins a few kilometres wide, and one of those falls through a
    // ring of 24 km easily. Asked again when the traveller has gone a few kilometres or the
    // clock has moved on — it burns off over an hour — so this is 0.2 ms every few seconds,
    // not page work in every frame.)
    const out = this._at || (this._at = makeSkyAt());
    const a0 = this._fogAt;
    if (!a0 || Math.abs(sky.t - this._fogT) > 60 || (p.x - a0[0]) ** 2 + (p.y - a0[1]) ** 2 + (p.z - a0[2]) ** 2 > 3000 * 3000) {
      let fog = 0;
      const look = (x, y, z) => { const v = sky.field.at([x, y, z], sky.t, out); fog = Math.max(fog, v.field.fogTop - v.field.country); };
      const reach = F.SPAN * 0.45;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const ce = i * reach * 0.5, cn = j * reach * 0.5;
        look(p.x + east[0] * ce + north[0] * cn, p.y + east[1] * ce + north[1] * cn, p.z + east[2] * ce + north[2] * cn);
      }
      this._fogAt = [p.x, p.y, p.z]; this._fogT = sky.t; this._fog = fog;
    }
    if (!(this._fog >= 1)) return;
    const u = this.uniforms;
    u.uAnchor.value.set(this._anchor[0], this._anchor[1], this._anchor[2]);
    u.uEast.value.set(east[0], east[1], east[2]); u.uNorth.value.set(north[0], north[1], north[2]);
    this.ready = true;
  }

  draw(c) {
    if (!this.ready) return;
    c.renderer.render(this.scene, c.rig.camera);
  }

  saving() {}
  live() { return false; }
  has(id) { return id === 'fog'; }
  partOut(id, out) { if (id === 'fog') this.off = !!out; }
}
