// The clouds' shadow on trees, near and far: a small map of it round the traveller, worked
// out once a frame before the main picture by the ground's own rule and from the ground's
// own numbers (terrainMaterial.js, its light: the day's cloud map and the heaps the layer
// shows, HEAP_GLSL), and read once per vertex of a tree at the tree's own place.
//
// Why a map: worked out in the trees' vertex shaders it was one map read and up to three
// reads of the cloud noise on every vertex of every tree, one to two million vertices in a
// wood, for a thing that is the same all over a tree and changes over hundreds of metres.
// The map is 256 x 256 points 55 m apart (14 km: the far forest's reach and a margin); a
// tree reads it once. The ground is still shaded pixel by pixel; under a cloud's edge a
// tree is as dark as the map says at its crown.
//
// The map lies on a level plane through the ground under the traveller. A tree higher or
// lower than that plane is under another part of the cloud: it looks the map up where the
// Sun's ray through its crown meets the plane, which is the ground's rule exactly.
import * as THREE from 'three';
import { makePassMaterial, renderPass } from '../render/fullscreen.js';
import { HEAP_GLSL } from '../sky/clouds.js';
import { localFrame } from '../core/ephemeris.js';

const SIZE = 256, WIDTH = 14000;

// (one set of uniform objects for every tree shader: never replaced)
export const TREE_SHADE_UNIFORMS = {
  tTreeShade: { value: null },
  uShadeRel: { value: new THREE.Vector3() },          // the map's middle, from the camera (m, planet axes)
  uShadeE: { value: new THREE.Vector3(1, 0, 0) }, uShadeN: { value: new THREE.Vector3(0, 1, 0) }, uShadeU: { value: new THREE.Vector3(0, 0, 1) },
  uShadeInv: { value: 0 },                            // 1 / the map's width (1/m); 0: no cloud casts a shadow
  uShadeSun: { value: new THREE.Vector3(0, 0, 1) },
};

// rel: a place from the camera (m, planet axes). Returns how much of the Sun the clouds leave it.
export const TREE_SHADE_VERT = /* glsl */`
uniform sampler2D tTreeShade;
uniform vec3 uShadeRel, uShadeE, uShadeN, uShadeU, uShadeSun;
uniform float uShadeInv;
float cloudShade(vec3 rel) {
  if (uShadeInv <= 0.0) return 1.0;
  vec3 d = rel - uShadeRel;
  d -= uShadeSun * (dot(d, uShadeU) / max(dot(uShadeSun, uShadeU), 0.08));
  return textureLod(tTreeShade, vec2(dot(d, uShadeE), dot(d, uShadeN)) * uShadeInv + 0.5, 0.0).r;
}`;

const FRAG = /* glsl */`
precision highp sampler3D;
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
uniform vec3 uCentre, uE, uN, uSunDir;
uniform float uWidth;
uniform sampler2D tClouds;
uniform sampler3D tCloudNoise;
uniform vec4 uCloud, uCloudHeap;
uniform vec3 uCloudVol, uCloudWind;
${HEAP_GLSL}
void main() {
  vec3 planetPos = uCentre + (uE * (vUv.x - 0.5) + uN * (vUv.y - 0.5)) * uWidth;
  float r = length(planetPos), lit = 1.0;
  if (uCloud.x > 0.0 && r < uCloud.y) {
    // (the ground's rule, line for line: the cloud between this place and the Sun)
    vec3 uc = normalize(planetPos + uSunDir * ((uCloud.y - r) / max(dot(planetPos / r, uSunDir), 0.08)));
    float cd = textureLod(tClouds, vec2(atan(uc.y, uc.x) * 0.15915494 + uCloud.z, acos(clamp(uc.z, -1.0, 1.0)) * 0.31830989), 0.0).r;
    float shade = smoothstep(0.2, 0.7, cd);
    if (uCloudHeap.w > 0.5) { float cc, hp = cloudHeap(tCloudNoise, uc, cd, uCloudHeap.x, uCloudHeap.y, uCloudVol, uCloudWind, 0.0, cc); shade = 0.85 * smoothstep(0.06, 0.42, hp); }
    lit = 1.0 - uCloud.x * shade;
  }
  fragColor = vec4(lit, lit, lit, 1.0);
}`;

export class TreeShade {
  // terrain: the Terrain (its shared uniforms carry what the ground is shaded by)
  constructor(terrain) {
    const sh = terrain.shared;
    this.shared = sh;
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.target.texture.wrapS = this.target.texture.wrapT = THREE.ClampToEdgeWrapping;
    TREE_SHADE_UNIFORMS.tTreeShade.value = this.target.texture;
    this.material = makePassMaterial(FRAG, {
      uCentre: { value: new THREE.Vector3() }, uE: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uWidth: { value: WIDTH },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      tClouds: sh.tClouds, tCloudNoise: sh.tCloudNoise, uCloud: sh.uCloud, uCloudHeap: sh.uCloudHeap, uCloudVol: sh.uCloudVol, uCloudWind: sh.uCloudWind,
    });
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0]; this._c = new THREE.Vector3();
  }

  // Before the main picture is begun. on: some tree is drawn. sun: the Sun's direction.
  render(renderer, rig, sun, on) {
    const U = TREE_SHADE_UNIFORMS, m = this.material.uniforms;
    if (!on || !(this.shared.uCloud.value.x > 0) || !this.shared.tClouds.value) { U.uShadeInv.value = 0; return; }
    // (the map's middle: the ground under the traveller)
    const p = rig.pos, len = p.length(), c = this._c.copy(p).multiplyScalar(Math.max(0.5, (len - Math.max(0, rig.agl)) / len));
    localFrame([c.x, c.y, c.z], this._e, this._n, this._u);
    m.uCentre.value.copy(c); m.uE.value.set(...this._e); m.uN.value.set(...this._n); m.uSunDir.value.copy(sun);
    U.uShadeRel.value.subVectors(c, p); U.uShadeE.value.set(...this._e); U.uShadeN.value.set(...this._n); U.uShadeU.value.set(...this._u);
    U.uShadeSun.value.copy(sun); U.uShadeInv.value = 1 / WIDTH;
    renderPass(renderer, this.material, this.target);
  }
}
