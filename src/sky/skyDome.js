// Far pass: additive sky in-scatter, drawn over stars, Sun and bodies (each of those
// attenuates itself by the atmosphere's transmittance). With the camera in the air it
// comes from the sky-view LUT; from space each ray is marched through the shell, which
// gives the thin glow along the planet's edge.
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { fullscreenGeometry } from '../render/fullscreen.js';
import { ATMO_UNIFORMS, ATMO_COMMON, ATMO_LUT_ACCESS, SKYVIEW_ACCESS } from '../atmosphere/atmosphereGlsl.js';
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
      ${ATMO_LUT_ACCESS}
      ${SKYVIEW_ACCESS}
      uniform mat3 uSkyFrame; uniform vec3 uSunLocal; uniform vec3 uSunIrradiance; uniform float uExposure; uniform float uSkyFade;
      uniform vec3 uCamPlanetPos; uniform vec3 uSunDir; uniform vec4 uQuality; uniform vec4 uWeather;
      in vec3 vDir; out vec4 outColor;
      void main() {
        vec3 rd = normalize(vDir);
        vec3 L = vec3(0.0);
        if (uSkyFade > 0.0) L = skyRadianceLocal(uSkyFrame * rd, uSunLocal, uMieG) * uSkyFade;
        if (uSkyFade < 1.0) {
          // Where does this ray cross the shell? Worked out from the point of closest
          // approach, which stays accurate in 32-bit floats thousands of km out.
          vec3 ro = uCamPlanetPos * 0.001;
          float b = dot(ro, rd);
          float d = length(ro - rd * b);                       // closest approach to the centre
          if (d < uRTop) {
            float half_ = sqrt((uRTop - d) * (uRTop + d));
            float t0 = max(-b - half_, 0.0), t1 = -b + half_;
            if (d < uRBottom) t1 = min(t1, -b - sqrt((uRBottom - d) * (uRBottom + d)));   // the ground (terrain draws over it)
            if (t1 > t0) {
              vec3 Ls, Lm, T;
              if (uQuality.z > 0.5) integrateUniform(ro + rd * t0, rd, uSunDir, t1 - t0, 16, Ls, Lm, T);
              else integrateUniform(ro + rd * t0, rd, uSunDir, t1 - t0, 8, Ls, Lm, T);     // governor step
              L += (Ls + Lm * phaseHG3(dot(rd, uSunDir), uMieG)) * (1.0 - uSkyFade);
            }
          }
        }
        // Rain between the eye and the sky hides it as it hides the land (rainVeil in the
        // lighting chunk; uWeather.w a share a metre): through some 1 500 m of it overhead,
        // through tens of kilometres toward the horizon, the sky is the rain's own grey.
        // (A bright dawn sky showed through every gap in the cloud at the horizon, in the
        // eye wall of a hurricane.)
        if (uWeather.w > 0.0 && uSkyFade > 0.0) {
          float se = dot(rd, normalize(uCamPlanetPos));
          vec3 veil = skyRadianceLocal(vec3(0.0, 0.0, 1.0), uSunLocal, uMieG) * (0.7 * uWeather.y);
          L = mix(veil, L, exp(-uWeather.w * min(1500.0 / max(se, 0.03), 40000.0)));
        }
        outColor = vec4(min(L * uSunIrradiance * uExposure, vec3(60000.0)), 0.0);
      }`,
  });
  const mesh = new THREE.Mesh(fullscreenGeometry, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 100;     // last in the far pass
  return mesh;
}
