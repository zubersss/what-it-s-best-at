// Shared lighting chunk. Every surface shader (terrain, rocks, ship, sky bodies) lights
// itself through these functions so that art rule 1 ("one light") holds everywhere:
// direct Sun, sky light and ground bounce only.
//
// STAGE 2 PLACEHOLDER: the bodies below are stand-ins until the atmosphere LUTs exist.
import { G } from './globals.js';

export const lightingUniforms = () => ({ ...G });

export const LIGHTING_PARS = /* glsl */`
#define PI 3.14159265359
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform float uExposure;
uniform vec3 uCamPlanetPos;
uniform float uPlanetRadius;
uniform vec2 uViewport;

// Irradiance of the Sun (direct beam + circumsolar aureole) reaching a point, unshadowed.
vec3 directSun(vec3 planetPos) { return uSunIrradiance * 0.08; }

// Irradiance from the sky and from sunlit ground onto a surface with normal N.
vec3 skyLight(vec3 N, vec3 up) { return uSunIrradiance * vec3(0.030, 0.021, 0.013) * (0.65 + 0.35 * dot(N, up)); }

// Attenuates a surface colour and adds in-scattered light along the view ray.
vec3 aerialPerspective(vec3 color, vec3 rel) {
  float t = exp(-length(rel) / 60000.0);
  return color * t + uSunIrradiance * vec3(0.012, 0.008, 0.005) * (1.0 - t);
}

// Oren-Nayar diffuse (Fujii's qualitative fit) times N.L, divided by PI.
float diffuseON(vec3 N, vec3 L, vec3 V, float sigma) {
  float NL = dot(N, L), NV = max(dot(N, V), 0.0);
  if (NL <= 0.0) return 0.0;
  float s2 = sigma * sigma;
  float A = 1.0 - 0.5 * s2 / (s2 + 0.33);
  float B = 0.45 * s2 / (s2 + 0.09);
  float s = dot(L, V) - NL * NV;
  float t = s > 0.0 ? max(NL, NV) : 1.0;
  return NL * max(0.0, A + B * s / max(t, 1e-4)) / PI;
}
`;
