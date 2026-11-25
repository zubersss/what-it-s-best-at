// The two upper layers of cloud, each a painted shell at its own true height (the plan's
// "Mid-level patches and veil" and "High cloud"): the mid layer at 5 km above the sea
// (altocumulus in rows of small cloudlets, altostratus as a veil that turns the Sun into a pale
// disc) and the high layer at 9 km (cirrus brushed out along the high wind, cirrostratus with a
// faint 22-degree halo, and the anvils of storms, opaque and dark beneath).
//
// Why shells and not sheets at the far plane: a storm's tower stands through both of them, and a
// layer laid at the far plane would be drawn in front of a tower that should stand through it.
// Each shell is cut where a tower passes through it (the cells' own shape, cellShape.js), and
// the two are drawn above or below the camera by their height, so a traveller flying between
// them sees the mid layer under the cirrus.
//
// Where the cloud is comes from the field (weather/sky/format.js: B.R the mid cover, B.G the
// high cover); how it is shaped comes from the clouds' own noise read in each layer's own frame
// (weather/sky/steer.js: the mid layer overtakes the heaps, the high layer often runs on another
// heading), so both move with their own wind on the game clock.
//
// Reads: one into the field and one into the noise where a pixel has cloud; where it is clear
// the pixel is thrown out after the field's read alone. The governor's 'cloud-upper' step takes
// the second noise octave and the relief look away (the cloudlets become a soft veil).
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { G } from '../render/globals.js';
import { SKY_FIELD_GLSL, SKY_UNIFORMS } from './skyGlsl.js';
import { STEER_GLSL } from '../weather/sky/steer.js';
import { CELL_GLSL, ANVIL_GLSL, CELL_MAX, ANVIL_MAX } from '../weather/sky/cellShape.js';

// the look's numbers (the report lists them; the world file may pin them)
export const UPPER_LOOK = Object.freeze({
  MID_H: 5000, HIGH_H: 9000,      // m above the sea
  MID_K: 2.2, HIGH_K: 0.8,        // how fine each layer's pattern is (the noise's period over this)
  MID_CELL: 520,                  // m: a cloudlet of the mackerel sky (what counts as smaller than a pixel)
  MID_ALPHA: 0.92,                // the most a thick altostratus veil takes
  MID_SHADE: 0.72,                // its shaded side (two tones, as the heaps have)
  HIGH_STRETCH: 7,                // how far the high noise is drawn out along its own wind
  HIGH_ALPHA: 0.5,                // cirrus is never more than half there ...
  HIGH_ANVIL: 0.97,               // ... but an anvil is solid
  HIGH_UNDER: 0.45,               // an anvil's underside, against its top
  HALO: 0.062,                    // how strong the 22-degree halo is
});
const U = UPPER_LOOK;
const glf = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

const VERT = /* glsl */`
out vec3 vRel;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vRel = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
precision highp sampler3D;
${SKY_FIELD_GLSL}
${STEER_GLSL}
${CELL_GLSL}
${ANVIL_GLSL}
uniform vec4 uUpper;           // x 1 for the high layer (0 the mid), y the shell's radius (m), z 1 when the camera is below it, w 1 while the shell is thinned (the governor)
in vec3 vRel;
layout(location = 0) out vec4 fragColor;

// the layer's pattern at a point of its own frame (one read)
float upperNoise(vec3 q) { return skyTex3(tCloudNoise, q).r; }

void main() {
  vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
  float dist = length(vRel);
  bool high = uUpper.x > 0.5;
  // the cover over this place: one read of the field, and nothing more where the sky is clear
  vec4 B = wxRead(tWxB, up);
  float cover = high ? wxHigh(B) : wxMid(B);
  if (cover < 0.015) discard;
  // A tower stands through both layers: where one does, this shell is not drawn (the march
  // draws the tower itself, with its own depth).
  for (int k = 0; k < CELL_MAX; k++) {
    if (k >= uCellCount) break;
    if (cellDensity(k, planetPos) > 0.08) discard;
  }
  float px = length(dFdx(up)) + length(dFdy(up));          // radians a pixel
  float alpha, shade = 1.0;
  vec3 q = high ? steerHigh(up) : steerMid(up);
  if (high) {
    // Cirrus: fine brush strokes drawn out along the high wind, warped once. The wind in the
    // layer's own frame is where the strokes lie.
    vec3 w = steerWindHigh(q);
    float wl = length(w);
    vec3 e = wl > 1e-6 ? w / wl : vec3(1.0, 0.0, 0.0);
    float along = dot(q, e);
    vec3 qs = q - e * along * (1.0 - 1.0 / ${glf(U.HIGH_STRETCH)});
    float k = uUpper.y * uSkyLow.x * ${glf(U.HIGH_K)};
    float n = upperNoise(qs * k);
    if (uUpper.w < 0.5) n = 0.75 * n + 0.25 * upperNoise(qs * (k * 2.7));
    float streak = smoothstep(0.42, 0.78, n * (0.6 + 0.6 * cover));
    alpha = min(${glf(U.HIGH_ALPHA)}, streak * cover * 1.6);
    // an anvil: the same height, but solid, and dark underneath
    float an = 0.0;
    for (int k2 = 0; k2 < ANVIL_MAX; k2++) {
      if (k2 >= uAnvilCount) break;
      an = max(an, anvilCover(k2, up));
    }
    if (an > 0.0) {
      alpha = max(alpha, ${glf(U.HIGH_ANVIL)} * smoothstep(0.05, 0.35, an));
      shade = mix(shade, uUpper.z > 0.5 ? ${glf(U.HIGH_UNDER)} : 1.12, smoothstep(0.05, 0.5, an));
    }
  } else {
    // Altocumulus: rows of small rounded cloudlets, each with a lit and a shaded side; thick, it
    // is a grey-white veil with the Sun a pale disc behind it.
    float k = uUpper.y * uSkyLow.x * ${glf(U.MID_K)};
    float n = upperNoise(q * k);
    if (uUpper.w < 0.5) n = 0.78 * n + 0.22 * upperNoise(q * (k * 2.3));
    float veil = smoothstep(0.45, 0.85, cover);                 // thick: altostratus
    float lump = smoothstep(0.46, 0.62, n + 0.35 * cover);
    alpha = min(${glf(U.MID_ALPHA)}, mix(lump * cover * 1.8, 0.75 + 0.25 * cover, veil));
    // (its two tones: the side of each cloudlet turned from the Sun. Not in a veil, which is flat.)
    if (uUpper.w < 0.5 && veil < 1.0) {
      float n1 = upperNoise((q + steerMid(uSunDir) * 0.12) * k);
      shade = mix(mix(${glf(U.MID_SHADE)}, 1.06, smoothstep(-0.03, 0.05, n - n1)), 1.0, veil);
    }
  }
  // (nothing smaller than a pixel: from far above, a field of cloudlets is its own mean)
  float small = smoothstep(0.4, 1.4, px * uUpper.y / ${glf(U.MID_CELL)});
  if (small > 0.0) alpha = mix(alpha, cover * (high ? 0.55 : 0.8), small);
  if (alpha < 0.004) discard;
  // light: the Sun through the air at this height (so it goes gold and then pink after the land's
  // sunset), the sky from above and below
  float mu0 = dot(up, uSunDir), cs = dot(normalize(-vRel), uSunDir);
  vec3 sun = directSun(planetPos) * smoothstep(-0.09, 0.06, mu0);
  // (ice: a bright rim toward the Sun, and the 22-degree halo of a cirrostratus veil)
  float fwd = 0.75 + 0.9 * pow(max(cs, 0.0), 8.0);
  if (high) fwd += ${glf(U.HALO)} * (1.0 - smoothstep(0.0, 0.02, abs(cs - 0.927))) * smoothstep(0.1, 0.4, cover);
  vec3 col = vec3(0.9) * (sun * fwd * shade + skyLight(uUpper.z > 0.5 ? -up : up, up) * 0.8) / PI;
  col = aerialPerspective(col, vRel);
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

export class UpperClouds {
  constructor(renderer) {
    this.renderer = renderer;
    this.thin = false; this.off = false;
    this.uniforms = { ...lightingUniforms(), uUpper: { value: new THREE.Vector4(0, 1, 1, 0) },
      uSkyLow: SKY_UNIFORMS.uSkyLow, tWxA: SKY_UNIFORMS.tWxA, tWxB: SKY_UNIFORMS.tWxB, tWxC: SKY_UNIFORMS.tWxC,
      tCloudNoise: SKY_UNIFORMS.tCloudNoise, uCloudSteer: SKY_UNIFORMS.uCloudSteer, uCloudRise: SKY_UNIFORMS.uCloudRise,
      uSteerInv: { value: SKY_UNIFORMS.uSteerInv.value }, uSteerSpin: { value: SKY_UNIFORMS.uSteerSpin.value }, uSteerRise: { value: SKY_UNIFORMS.uSteerRise.value },
      uCells: SKY_UNIFORMS.uCells, uCellCount: SKY_UNIFORMS.uCellCount, uAnvils: SKY_UNIFORMS.uAnvils, uAnvilCount: SKY_UNIFORMS.uAnvilCount };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1, CELL_MAX, ANVIL_MAX }, uniforms: this.uniforms,
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthTest: true, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.material = mat;
    const geo = new THREE.IcosahedronGeometry(1, 32);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 900;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.ready = false;
  }

  // Before the main picture: where the two shells stand this frame and whether they are drawn.
  // c: { rig, sky } (the sky system's frame).
  update(c) {
    const sky = c.sky, R = sky?.R || 0;
    this.ready = !!(R && sky.field?.on && !sky.noClouds && !this.off && this.uniforms.tCloudNoise.value);
    if (!this.ready) return;
    const alt = c.rig.pos.length() - R;
    this.midR = R + UPPER_LOOK.MID_H; this.highR = R + UPPER_LOOK.HIGH_H;
    this.camBelowMid = alt < UPPER_LOOK.MID_H; this.camBelowHigh = alt < UPPER_LOOK.HIGH_H;
    this.cam = c.rig.pos;
  }

  // In the picture: the shells above the camera first (farthest first), the ones below it last.
  draw(c, where) {
    if (!this.ready) return;
    const above = where === 'above';
    const list = above
      ? [this.camBelowHigh && ['high', this.highR], this.camBelowMid && ['mid', this.midR]]
      : [!this.camBelowMid && ['mid', this.midR], !this.camBelowHigh && ['high', this.highR]];
    for (const item of list) {
      if (!item) continue;
      const [kind, r] = item;
      const u = this.uniforms;
      u.uUpper.value.set(kind === 'high' ? 1 : 0, r, (kind === 'high' ? this.camBelowHigh : this.camBelowMid) ? 1 : 0, this.thin ? 1 : 0);
      this.mesh.scale.setScalar(r);
      this.mesh.position.set(-this.cam.x, -this.cam.y, -this.cam.z);
      this.material.uniformsNeedUpdate = true;
      c.renderer.render(this.scene, c.rig.camera);
    }
  }

  saving(id, off) { if (id === 'cloud-upper') this.thin = !!off; }
  live(id) { return id === 'cloud-upper' && this.ready; }
  has() { return true; }
  partOut(id, out) { if (id === 'cloud-upper') this.off = !!out; }
}
