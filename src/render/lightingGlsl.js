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
uniform sampler2D tSkyE;            // sky light on level ground against the Sun's height (1-D)
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
uniform float uPhotometry;          // 0 = matte dust under air (Oren-Nayar), 1 = airless regolith (lunarDiffuse)
uniform vec3 uGroundTint;           // the world's albedo map at the camera, relative to its mean

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
// normal N, at a place whose local vertical is up. Near the ground it comes from the
// irradiance map of the camera's own place: everything in view shares that sky. From high
// up that map is the wrong one (it belongs to thin air, or to a camera over the night
// side), so each place gets the sky light of its own Sun height from the level-ground
// table, over the part of the sky the surface faces (uSkyGainMix fades this in between 3
// and 30 km of altitude).
vec3 skyLight(vec3 N, vec3 up) {
  vec2 e = octEncode(uSkyFrame * N);
  vec2 uv = (e * (float(IRR) - 1.0) + 0.5) / vec2(float(IRR), float(IRR) + 1.0);
  vec3 E = texture(tIrradiance, uv).rgb * uLutScaleInv.x;
  if (uSkyGainMix > 0.0) {
    float mu = dot(up, uSunDir);
    float ug = 0.5 + 0.5 * sign(mu) * sqrt(abs(mu));
    vec3 there = texture(tSkyE, vec2((ug * (float(SKYE_W) - 1.0) + 0.5) / float(SKYE_W), 0.5)).rgb * ((0.5 + 0.5 * dot(N, up)) / SKYE_SCALE);
    E = mix(E, there, uSkyGainMix);
  }
  return E * uSunIrradiance;
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
    float rk = length(pk), graze = -dot(rd, pk) / rk;
    useMarch = 1.0 - smoothstep(0.22, 0.38, graze);
    // The same over the night side and the day-night line: there a screen tile of the
    // froxels can hold rays that pass the planet's edge through sunlit air, and that light
    // was smeared over dark ground as bright square blocks. From space only a few terrain
    // patches are drawn, so the march costs little.
    float sunUp = dot(pk, uSunDir) / rk;
    useMarch = max(useMarch, 1.0 - smoothstep(0.04, 0.14, sunUp));
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

// The Moon's phase curve: brightness of regolith at phase angle a (radians) relative to
// opposition. Fitted to the Moon's brightness through the month.
float regolithPhase(float a) { return 0.8 * exp(-0.8 * a) + 0.2 / (1.0 + tan(min(a, 3.0) * 0.5) / 0.05); }

// Airless regolith, times N.L, per unit irradiance: the lunar-Lambert function (McEwen's
// limb-darkening weight) times the Moon's phase curve. Equal to Lambert when Sun, surface
// and eye line up; it falls as the Sun moves round to face the viewer, which is why real
// lunar ground glares down-Sun and looks dark and rough toward the Sun. The phase curve is
// fitted to the Moon's brightness through the month (0.57 at 30 degrees, 0.37 at 60, 0.24
// at 90, 0.15 at 120), with a narrow shadow-hiding surge at opposition.
float lunarDiffuse(vec3 N, vec3 L, vec3 V) {
  float NL = dot(N, L);
  if (NL <= 0.0) return 0.0;
  float NV = max(dot(N, V), 1e-3);
  float a = acos(clamp(dot(L, V), -1.0, 1.0)), ad = a * 57.29578;          // phase angle
  float w = clamp(1.0 - 0.019 * ad + 2.42e-4 * ad * ad - 1.46e-6 * ad * ad * ad, 0.0, 1.0);
  return (2.0 * w / (NL + NV) + (1.0 - w)) * NL / PI * regolithPhase(a);
}

// The world's own ground and what lies on it (terrain, rocks).
float groundDiffuse(vec3 N, vec3 L, vec3 V, float sigma) {
  return uPhotometry > 0.5 ? lunarDiffuse(N, L, V) : diffuseON(N, L, V, sigma);
}
`;
