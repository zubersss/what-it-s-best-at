// Far pass: additive sky in-scatter from the sky-view LUT, drawn over stars, Sun and
// bodies (each of those attenuates itself by the atmosphere's transmittance).
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { fullscreenGeometry } from '../render/fullscreen.js';
import { ATMO_UNIFORMS, ATMO_COMMON, SKYVIEW_ACCESS } from '../atmosphere/atmosphereGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

export const RAY_VERT = /* glsl */`
in vec3 position;
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform vec2 uTanHalfFov;
out vec3 vDir;
void main() {
  vDir = uCamFwd + uCamRight * position.x * uTanHalfFov.x + uCamUp * position.y * uTanHalfFov.y;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

export function makeSkyDome() {
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, defines: atmosphereDefines(),
    depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { ...G },
    vertexShader: RAY_VERT,
    fragmentShader: /* glsl */`precision highp float; precision highp sampler2D;
      ${ATMO_UNIFORMS}
      ${ATMO_COMMON}
      ${SKYVIEW_ACCESS}
      uniform mat3 uSkyFrame; uniform vec3 uSunLocal; uniform vec3 uSunIrradiance; uniform float uExposure;
      in vec3 vDir; out vec4 outColor;
      void main() {
        vec3 d = uSkyFrame * normalize(vDir);
        vec3 L = skyRadianceLocal(d, uSunLocal, uMieG) * uSunIrradiance;
        outColor = vec4(min(L * uExposure, vec3(60000.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(fullscreenGeometry, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 100;     // last in the far pass
  return mesh;
}
