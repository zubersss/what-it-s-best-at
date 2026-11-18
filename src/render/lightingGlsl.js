// Shared lighting chunk. Every surface shader (terrain, rocks, ship, sky bodies) lights
// itself through these functions so that art rule 1 ("one light") holds everywhere:
// direct Sun (with its circumsolar aureole), sky light, and ground bounce — nothing else.
import { G } from './globals.js';
import { ATMO_UNIFORMS, ATMO_COMMON, ATMO_LUT_ACCESS } from '../atmosphere/atmosphereGlsl.js';
import { NEAR_SHADOW_PARS } from '../shadows/nearShadow.js';

// Call after the Atmosphere has been constructed (it publishes its uniforms into G).
export const lightingUniforms = () => ({ ...G });

export const LIGHTING_PARS = /* glsl */`
${ATMO_UNIFORMS}
${ATMO_COMMON}
${ATMO_LUT_ACCESS}
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform float uExposure;
uniform vec3 uCamPlanetPos;
uniform float uPlanetRadius;
uniform vec2 uViewport;
uniform sampler2D tIrradiance;      // octahedral irradiance map (local sky frame) + circumsolar row
uniform sampler2D tSkyGain;         // sky light at another Sun height relative to the camera's (1-D)
uniform float uSkyGainMix;          // 0 near the ground (everything in view shares the camera's sky), 1 from high up
uniform sampler2D tFroxelA;         // aerial perspective: smooth in-scatter
uniform sampler2D tFroxelB;         //                      un-phased dust in-scatter
uniform sampler2D tFroxelC;         //                      transmittance
uniform vec2 uFroxelRange;          // x: exponent of the slice distribution, y: far limit (km)
uniform vec2 uLutScaleInv;          // x: 1 / scale of the irradiance LUT, y: 1 / scale of the froxels
uniform mat3 uSkyFrame;             // planet-fixed -> local sky frame
uniform vec3 uShineDir;             // toward the brightest sky body
uniform vec3 uShineE;               // its irradiance at the ground (planetshine)
uniform vec4 uQuality;              // governor switches: x close-up detail, y soft shadow edges, z edge-glow samples

// Irradiance of the Sun reaching a point (planet-centred metres), unshadowed:
// the attenuated direct beam plus the forward-scattered aureole around it.
vec3 directSun(vec3 planetPos) {
  vec3 pk = planetPos * 0.001;
  float r = length(pk);
  vec3 T = texture(tTransmittance, transmittanceUv(r, dot(pk, uSunDir) / r)).rgb;
  vec3 circ = texelFetch(tIrradiance, ivec2(0, IRR), 0).rgb * uLutScaleInv.x;
  return uSunIrradiance * (T + circ);
}

vec2 octEncode(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 e = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return e * 0.5 + 0.5;
}

// Irradiance from the sky (minus the aureole) and from sunlit ground onto a surface with
// normal N, at a place whose local vertical is up. The irradiance map belongs to the
// camera's place; elsewhere on the globe it is scaled by how the sky's brightness changes
// with the Sun's height there (exactly 1 at the camera, 0 on the night side). Near the
// ground nothing in view is far enough round the globe for that to matter, and the
// look-up is skipped (uSkyGainMix fades it in between 3 and 30 km of altitude).
vec3 skyLight(vec3 N, vec3 up) {
  vec2 e = octEncode(uSkyFrame * N);
  vec2 uv = (e * (float(IRR) - 1.0) + 0.5) / vec2(float(IRR), float(IRR) + 1.0);
  vec3 gain = vec3(1.0);
  if (uSkyGainMix > 0.0) {
    float mu = dot(up, uSunDir);
    float ug = 0.5 + 0.5 * sign(mu) * sqrt(abs(mu));
    gain = mix(gain, texture(tSkyGain, vec2((ug * (float(SKYE_W) - 1.0) + 0.5) / float(SKYE_W), 0.5)).rgb, uSkyGainMix);
  }
  return texture(tIrradiance, uv).rgb * gain * (uLutScaleInv.x * uSunIrradiance);
}

// Irradiance from planetshine (sunlight reflected by a sky body) onto a surface with normal N.
vec3 planetShine(vec3 N) { return uShineE * max(dot(N, uShineDir), 0.0); }

// Attenuates a surface colour and adds in-scattered light along the view ray.
// Materials that can fill the view from space (the terrain) define SPACE_HAZE to get the
// per-pixel march near the planet's edge; small objects do without that code.
vec3 aerialPerspective(vec3 color, vec3 rel) {
  float dist = length(rel);
  // Same path through the air as the froxel pass computed for this view ray.
  vec3 ro = uCamPlanetPos * 0.001, rd = rel / dist;
  float rc = length(ro), bq = dot(ro, rd), pathA = 0.0, pathB;
  float discT = bq * bq - (rc * rc - uRTop * uRTop);
  float cosT = dot(rd, uSunDir);
  vec3 marched = vec3(0.0);
  float useMarch = 0.0;
  if (rc > uRTop) {
    if (discT <= 0.0 || bq > 0.0) return color;
    float sT = sqrt(discT); pathA = -bq - sT; pathB = -bq + sT;
    float dk = dist * 0.001;
    if (dk <= pathA) return color;                 // the surface is this side of the air (a figure in orbit)
#ifdef SPACE_HAZE
    // Seen from space at a grazing angle (toward the planet's edge) the path through the
    // air changes too fast from pixel to pixel for the screen-space froxels: there the
    // haze is marched for this pixel. (cosine of the angle between view ray and local vertical)
    vec3 pk = ro + rd * dk;
    float graze = -dot(rd, pk) / length(pk);
    useMarch = 1.0 - smoothstep(0.22, 0.38, graze);
    if (useMarch > 0.0) {
      // entry point from the closest approach to the centre: accurate in 32-bit floats
      float dc = length(ro - rd * bq);
      float tin = -bq - sqrt(max((uRTop - dc) * (uRTop + dc), 0.0));
      vec3 Ls, Lm, T;
      if (uQuality.z > 0.5) integrateToGround(ro + rd * tin, rd, uSunDir, max(dk - tin, 0.0), 12, Ls, Lm, T);
      else integrateToGround(ro + rd * tin, rd, uSunDir, max(dk - tin, 0.0), 6, Ls, Lm, T);      // governor step
      marched = color * T + (Ls + Lm * phaseHG3(cosT, uMieG)) * uSunIrradiance;
      if (useMarch >= 1.0) return marched;
    }
#endif
  } else pathB = -bq + sqrt(max(discT, 0.0));
  if (rc > uRTop) {
    float discB = bq * bq - (rc * rc - uRBottom * uRBottom);
    if (discB > 0.0) { float tg = -bq - sqrt(discB); if (tg > pathA) pathB = min(pathB, tg); }
  }
  pathB = min(pathB, uFroxelRange.y);
  float s = float(FROX_D) * pow(clamp((dist * 0.001 - pathA) / max(pathB - pathA, 1e-4), 0.0, 1.0), 1.0 / uFroxelRange.x);
  float c = max(s - 1.0, 0.0);
  float k0 = min(floor(c), float(FROX_D) - 1.0), k1 = min(k0 + 1.0, float(FROX_D) - 1.0), f = c - k0;
  vec2 uv = clamp(gl_FragCoord.xy / uViewport, vec2(0.5) / vec2(FROX_W, FROX_H), 1.0 - vec2(0.5) / vec2(FROX_W, FROX_H));
  vec2 atlas = vec2(float(ATLAS_X), float(ATLAS_Y));
  vec2 t0 = (vec2(mod(k0, atlas.x), floor(k0 / atlas.x)) + uv) / atlas;
  vec2 t1 = (vec2(mod(k1, atlas.x), floor(k1 / atlas.x)) + uv) / atlas;
  float near = clamp(s, 0.0, 1.0);
  vec3 Ls = mix(texture(tFroxelA, t0).rgb, texture(tFroxelA, t1).rgb, f) * near;
  vec3 Lm = mix(texture(tFroxelB, t0).rgb, texture(tFroxelB, t1).rgb, f) * near;
  vec3 T = mix(vec3(1.0), mix(texture(tFroxelC, t0).rgb, texture(tFroxelC, t1).rgb, f), near);
  vec3 hazed = color * T + (Ls + Lm * phaseHG3(cosT, uMieG)) * (uLutScaleInv.y * uSunIrradiance);
  return mix(hazed, marched, useMarch);
}

${NEAR_SHADOW_PARS}

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
