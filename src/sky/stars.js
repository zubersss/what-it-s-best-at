// Point sources in the far pass: the star catalogue and any sky body too small to
// resolve. Each point carries its true irradiance, so visibility is decided purely by
// exposure (art rule 2): invisible in daylight, emerging as the scene darkens.
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { ATMO_UNIFORMS, ATMO_COMMON } from '../atmosphere/atmosphereGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

const SUN_VMAG = -26.74;       // apparent magnitude of the Sun at 1 AU = irradiance 1.0

// B-V colour index -> a restrained RGB tint (hot stars slightly blue, cool slightly orange).
function colourFromBV(bv) {
  const t = Math.min(1, Math.max(0, (bv + 0.3) / 2.0));
  const r = 0.82 + 0.18 * Math.min(1, t * 2.2);
  const g = 0.88 + 0.12 * (1 - Math.abs(t - 0.4) * 1.6);
  const b = 1.0 - 0.52 * t;
  return [r, g, b];
}

function makeMaterial(extraUniforms) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, defines: atmosphereDefines(),
    depthTest: true, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { ...G, uToFixed: { value: new THREE.Matrix3() }, uUp: { value: new THREE.Vector3(0, 0, 1) }, uCamRkm: { value: 1 }, uPixelSolidAngle: { value: 1e-6 }, uSigma: { value: 0.75 }, ...extraUniforms },
    vertexShader: /* glsl */`
      ${ATMO_UNIFORMS}
      ${ATMO_COMMON}
      uniform sampler2D tTransmittance;
      uniform mat3 uToFixed; uniform vec3 uUp; uniform vec3 uSunIrradiance;
      uniform float uCamRkm, uPixelSolidAngle, uSigma, uExposure;
      in vec4 aFlux;                 // rgb irradiance (solar constant = 1), a unused
      out vec3 vRadiance;
      void main() {
        vec3 d = normalize(uToFixed * position);
        // (through the home world's air only from inside it: from far outside, the table
        // answers "the ground is in the way" and a third of the sky lost its stars)
        vec3 T = uCamRkm < uRTop ? mix(texture(tTransmittance, transmittanceUv(uCamRkm, dot(d, uUp))).rgb, vec3(1.0), smoothstep(0.9, 1.0, (uCamRkm - uRBottom) / (uRTop - uRBottom))) : vec3(1.0);
        // spread the flux over a Gaussian spot of uSigma pixels: sum over pixels = flux
        vRadiance = aFlux.rgb * T * uExposure / (uPixelSolidAngle * 6.2832 * uSigma * uSigma);
        gl_Position = projectionMatrix * viewMatrix * vec4(d * 90.0, 1.0);
        gl_PointSize = ceil(uSigma * 6.0) + 1.0;
      }`,
    fragmentShader: /* glsl */`
      uniform float uSigma;
      in vec3 vRadiance; layout(location = 0) out vec4 fragColor;
      void main() {
        vec2 p = (gl_PointCoord - 0.5) * (ceil(uSigma * 6.0) + 1.0);
        float w = exp(-dot(p, p) / (2.0 * uSigma * uSigma));
        fragColor = vec4(min(vRadiance * w, vec3(60000.0)), 0.0);
      }`,
  });
}

export class PointSources {
  // capacity: number of points. Positions are unit directions in the source frame.
  constructor(capacity) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.flux = new Float32Array(capacity * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aFlux', new THREE.BufferAttribute(this.flux, 4));
    this.material = makeMaterial({});
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.geometry = geo;
  }

  setFrame(rowMajor3x3, rig, viewH) {
    const u = this.material.uniforms;
    if (rowMajor3x3) u.uToFixed.value.set(...rowMajor3x3); else u.uToFixed.value.identity();
    u.uUp.value.set(rig.localUp[0], rig.localUp[1], rig.localUp[2]);
    u.uCamRkm.value = rig.pos.length() * 0.001;
    const px = 2 * Math.tan(rig.fov * Math.PI / 360) / viewH;
    u.uPixelSolidAngle.value = px * px;
  }
}

// Builds the star field from the Yale BSC records [ra, dec, vmag, b-v] (float32).
export function makeStars(records) {
  const n = records.length / 4;
  const ps = new PointSources(n);
  for (let i = 0; i < n; i++) {
    const ra = records[i * 4], dec = records[i * 4 + 1], v = records[i * 4 + 2], bv = records[i * 4 + 3];
    ps.positions[i * 3] = Math.cos(dec) * Math.cos(ra); ps.positions[i * 3 + 1] = Math.cos(dec) * Math.sin(ra); ps.positions[i * 3 + 2] = Math.sin(dec);
    const e = Math.pow(10, -0.4 * (v - SUN_VMAG)), c = colourFromBV(bv);
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    ps.flux[i * 4] = e * c[0] / lum; ps.flux[i * 4 + 1] = e * c[1] / lum; ps.flux[i * 4 + 2] = e * c[2] / lum; ps.flux[i * 4 + 3] = 1;
  }
  ps.geometry.attributes.position.needsUpdate = true; ps.geometry.attributes.aFlux.needsUpdate = true;
  return ps;
}
