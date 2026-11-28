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
uniform sampler2D tIrradiance;      // octahedral irradiance map (local sky frame), circumsolar row, and
                                    // the sky light on level ground against the Sun's height (row IRR+1)
uniform float uSkyGainMix;          // 0 near the ground (everything in view shares the camera's sky), 1 from high up
uniform sampler2D tFroxelA;         // aerial perspective: smooth in-scatter
uniform sampler2D tFroxelB;         //                      un-phased dust in-scatter
uniform sampler2D tFroxelC;         //                      transmittance
uniform vec2 uFroxelRange;          // x: exponent of the slice distribution, y: far limit (km)
uniform vec2 uLutScaleInv;          // x: 1 / scale of the irradiance LUT, y: 1 / scale of the froxels
uniform mat3 uSkyFrame;             // planet-fixed -> local sky frame
uniform vec4 uMist;                 // mist in a hollow, for an eye above it (globals.js): x its top (m from the world's middle), y 1/m, z m of depth, w m from its top down to the water it lies on
uniform vec3 uMistAt;               // its middle, from the camera
uniform vec4 uWeather;              // x: the Sun through the cloud overhead (1: clear), y: sky light left under it, z: how wet the ground is,
                                    // w: rain in the air (how much of the view a metre of it hides; 0: dry)
uniform vec3 uFlash;                // lightning's light from the whole sky
uniform vec3 uShineDir;             // toward the brightest sky body
uniform vec3 uShineE;               // its irradiance at the ground (planetshine)
uniform vec3 uHomeShine;            // sunlight the home world's day side sends up to something high above it
uniform vec4 uQuality;              // governor switches: x close-up detail, y soft shadow edges, z edge-glow samples
uniform vec4 uPaint;                // the painted look: x amount, y sky light on things, z colour, w facets (globals.js)
uniform float uSkyBoost;           // the painted sky light's extra share from up in the air (globals.js)
uniform float uAloft;               // how much of the haze a line of sight straight down is spared, from up in the air (globals.js)
uniform float uHaze;                // how much of the haze lies over what is seen (1: all; less from high above a world with thick low air)
uniform float uPhotometry;          // 0 = matte dust under air (Oren-Nayar), 1 = airless regolith (lunarDiffuse)
uniform vec3 uGroundTint;           // the world's albedo map at the camera, relative to its mean
uniform vec4 uOccluders[16];        // spheres that hide the sky from the ground beside them (camera-relative
                                    // centre, radius; 0 = none): 0-3 the character, 4-7 the lander, 8-15 the nearest rocks
uniform vec4 uOccGroups[3];         // per group (character, lander, rocks): centre, and how far its darkening reaches (0: off)

// Irradiance of the Sun reaching a point (planet-centred metres), unshadowed:
// the attenuated direct beam plus the forward-scattered aureole around it.
vec3 directSun(vec3 planetPos) {
  vec3 pk = planetPos * 0.001;
  float r = length(pk);
  vec3 T = texture(tTransmittance, transmittanceUv(r, dot(pk, uSunDir) / r)).rgb;
  vec3 circ = texelFetch(tIrradiance, ivec2(0, IRR), 0).rgb * uLutScaleInv.x;
  // (cloud between the Sun and the things round the camera; the ground and the clouds
  // themselves work that out place by place and define OWN_CLOUD_SHADOW)
#ifdef OWN_CLOUD_SHADOW
  return uSunIrradiance * (T + circ);
#else
  return uSunIrradiance * (T + circ) * uWeather.x;
#endif
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
// (in three parts, so that a shader whose vertices can ask for what does not depend on the
// surface's normal does so: the level-ground table's answer at a place, skyThere, is the same
// for every surface there. One rule: skyLight(N, up) is skyLight(N, up, skyThere(up)).)
vec3 skyThere(vec3 up) {
  float mu = dot(up, uSunDir);
  float ug = 0.5 + 0.5 * sign(mu) * sqrt(abs(mu));
  return texture(tIrradiance, vec2((ug * (float(SKYE_W) - 1.0) + 0.5) / float(SKYL_W), (float(IRR) + 1.5) / float(SKYL_H))).rgb;
}
vec3 skyLight(vec3 N, vec3 up, vec3 thereRaw) {
  vec2 e = octEncode(uSkyFrame * N);
  vec2 uv = (e * (float(IRR) - 1.0) + 0.5) / vec2(float(SKYL_W), float(SKYL_H));
  vec3 E = texture(tIrradiance, uv).rgb * uLutScaleInv.x;
  if (uSkyGainMix > 0.0) {
    vec3 there = thereRaw * ((0.5 + 0.5 * dot(N, up)) / SKYE_SCALE);
    E = mix(E, there, uSkyGainMix);
  }
  // (the painted look: shade is lit by more of the sky than is physical, and by its colour
  // more than its grey: shadows are blue at noon and violet at dusk, never black)
  // (from up in the air, uAloft, the sky's light leans violet: look.js also makes more of it there)
  if (uPaint.x > 0.0) { float g = dot(E, vec3(0.3, 0.55, 0.15)); E = max(vec3(0.0), mix(vec3(g), E, 1.0 + 0.3 * uPaint.x)) * mix(vec3(1.0), uPaint.y * mix(vec3(0.88, 1.06, 0.98), vec3(1.04, 0.9, 1.1), uAloft), uPaint.x); }
  return E * uSunIrradiance * uWeather.y + uFlash;
}
vec3 skyLight(vec3 N, vec3 up) { return skyLight(N, up, uSkyGainMix > 0.0 ? skyThere(up) : vec3(0.0)); }

// The painted look's light and colour. paintLit: sunlight on a surface in two tones with a
// soft edge between them, in place of the plain cosine (x: the cosine of the Sun's angle
// on the surface; the result already holds the 1 / pi of a matte surface). paintColour: a
// surface colour made cleaner, more of its own hue and nearer the middle in brightness.
float paintLit(float nl) { return smoothstep(-0.04, 0.34, nl) * (0.62 + 0.38 * smoothstep(0.3, 1.0, nl)) * 0.3183099; }
vec3 paintColour(vec3 c) {
  float g = dot(c, vec3(0.3, 0.55, 0.15));
  vec3 s = max(vec3(0.0), mix(vec3(g), c, 1.0 + 0.55 * uPaint.z));
  return mix(c, s * pow(max(g, 1e-4) / 0.18, -0.12), uPaint.x);
}

// How much of the sky a surface at camera-relative position rel (normal N) still sees past
// the things standing near it: each sphere of radius r at distance d, in the direction of
// the normal, hides about (r/d)^2 of it. A figure, a lander or a rock on the ground darkens
// the ground at its foot in the light of the sky (sunlight is the near shadow map's
// business): the contact that keeps it from looking pasted on, most visible in shade.
// Nothing is added; light is only lost. Groups out of reach of the pixel are skipped.
float contactSky(vec3 rel, vec3 N) {
  float vis = 1.0;
  for (int g = 0; g < 3; g++) {
    vec4 G = uOccGroups[g];
    if (G.w <= 0.0) continue;
    vec3 dg = G.xyz - rel;
    if (dot(dg, dg) > G.w * G.w) continue;
    int n0 = g * 4, n1 = g == 2 ? 16 : n0 + 4;
    for (int i = n0; i < n1; i++) {
      vec4 o = uOccluders[i];
      if (o.w <= 0.0) continue;
      vec3 d = o.xyz - rel;
      float l2 = max(dot(d, d), 1e-4);
      vis *= 1.0 - min(0.9, o.w * o.w / l2 * max(dot(N, d) * inversesqrt(l2), 0.0));
    }
  }
  return vis;
}

// Irradiance from planetshine (sunlight reflected by a sky body) onto a surface with normal N.
vec3 planetShine(vec3 N) { return uShineE * max(dot(N, uShineDir), 0.0); }
// Light from the world below on something in orbit over it (zero near the ground, where
// the sky light already carries the ground's bounce): most on what faces down.
vec3 homeShine(vec3 N, vec3 up) { float d = clamp(0.5 - 0.5 * dot(N, up), 0.0, 1.0); return uHomeShine * d * sqrt(d); }

// Attenuates a surface colour and adds in-scattered light along the view ray.
// Materials that can fill the view from space (the terrain) define SPACE_HAZE to get the
// per-pixel march near the planet's edge; small objects do without that code.
// rho: the ground's albedo here over the mean albedo the air's light was computed with.
// Most of the haze over the day side seen from above is sunlight that the ground below
// reflected and the dust scattered back up, so over dark ground there is less of it and
// over bright ground more: a large dark region keeps its contrast through the haze, as
// it does in photographs from orbit. This holds where the line of sight crosses the low
// air close to the place it looks at (a steep view); along a grazing line the air is lit
// by all the ground it passes over, which is the mean (weight fades out by angle).
#ifdef HAZE_UV
vec2 gHazeUv;                       // this pixel's place in the main view (0..1), set by the pass before it asks for haze
#endif
vec3 hazeOverGroundFull(vec3 color, vec3 rel, vec3 rho);
// What the froxels say of a place dk km along a line of sight that is in the air from pathA
// to pathB km, seen at uv of the main view (0..1): the share of the light from there that
// arrives (T), the air's own light over ground of the mean brightness (L0), and what ground
// of another brightness adds to it or takes from it (Lg, times rho - 1).
void froxelHaze(float dk, float pathA, float pathB, vec2 uvIn, float cosT, out vec3 T, out vec3 L0, out vec3 Lg) {
  float s = float(FROX_D) * pow(clamp((dk - pathA) / max(pathB - pathA, 1e-4), 0.0, 1.0), 1.0 / uFroxelRange.x);
  float c = max(s - 1.0, 0.0);
  float k0 = min(floor(c), float(FROX_D) - 1.0), k1 = min(k0 + 1.0, float(FROX_D) - 1.0), f = c - k0;
  vec2 uv = clamp(uvIn, vec2(0.5) / vec2(FROX_W, FROX_H), 1.0 - vec2(0.5) / vec2(FROX_W, FROX_H));
  vec2 atlas = vec2(float(ATLAS_X), float(ATLAS_Y));
  vec2 t0 = (vec2(mod(k0, atlas.x), floor(k0 / atlas.x)) + uv) / atlas;
  vec2 t1 = (vec2(mod(k1, atlas.x), floor(k1 / atlas.x)) + uv) / atlas;
  float near = clamp(s, 0.0, 1.0);
  vec4 A = mix(texture(tFroxelA, t0), texture(tFroxelA, t1), f);
  vec3 Ls = A.rgb * near;
  vec3 Lm = mix(texture(tFroxelB, t0).rgb, texture(tFroxelB, t1).rgb, f) * near;
  T = mix(vec3(1.0), mix(texture(tFroxelC, t0).rgb, texture(tFroxelC, t1).rgb, f), near);
  vec3 k = uLutScaleInv.y * uSunIrradiance;
  L0 = (Ls + Lm * phaseHG3(cosT, uMieG)) * k;
  Lg = Ls * A.a * k;                                        // alpha: the ground's share of it
}
// Seen from up in the air, the ground straight below lies under little of the haze and
// the land toward the horizon under all of it: the haze along a line of sight is thinned
// by how steeply it looks down at the place it ends (rd: its direction, up: the vertical
// there). From 100 m to 3 km up the air lay over the ground below as fully as over the
// horizon, an even veil "as if under murky water". Nothing on foot (uAloft is 0 there),
// and blended in by height.
float hazeAloft(vec3 rd, vec3 up) {
  if (uAloft <= 0.0) return 1.0;
  return 1.0 - uAloft * smoothstep(0.04, 0.5, -dot(rd, up));
}
vec3 hazeOverGround(vec3 color, vec3 rel, vec3 rho) {
  vec3 h = hazeOverGroundFull(color, rel, rho);
  // (seen from high above, through less of the look's thick low air: see uHaze)
  return uHaze < 1.0 ? mix(color, h, uHaze) : h;
}
vec3 hazeOverGroundFull(vec3 color, vec3 rel, vec3 rho) {
  float dist = length(rel);
  // Same path through the air as the froxel pass computed for this view ray.
  vec3 ro = uCamPlanetPos * 0.001, rd = rel / dist;
  float rc = length(ro), bq = dot(ro, rd), pathA = 0.0, pathB;
  float discT = bq * bq - (rc * rc - uRTop * uRTop);
  float cosT = dot(rd, uSunDir);
  vec3 marched = vec3(0.0);
  float useMarch = 0.0;
  // cosine between the line of sight and the vertical at the far end: 1 looking straight down
  vec3 pEnd = ro + rd * (dist * 0.001);
  vec3 rhoW = 1.0 + (rho - 1.0) * smoothstep(0.3, 0.6, -dot(rd, pEnd) / length(pEnd));
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
      vec3 Ls, Lm, T, Lg;
      if (uQuality.z > 0.5) integrateToGround(ro + rd * tin, rd, uSunDir, max(dk - tin, 0.0), 12, Ls, Lm, T, Lg);
      else integrateToGround(ro + rd * tin, rd, uSunDir, max(dk - tin, 0.0), 6, Ls, Lm, T, Lg);      // governor step
      marched = color * T + (Ls + Lg * (rhoW - 1.0) + Lm * phaseHG3(cosT, uMieG)) * uSunIrradiance;
      if (useMarch >= 1.0) return marched;
    }
#endif
  } else pathB = -bq + sqrt(max(discT, 0.0));
  if (rc > uRTop) {
    float discB = bq * bq - (rc * rc - uRBottom * uRBottom);
    if (discB > 0.0) { float tg = -bq - sqrt(discB); if (tg > pathA) pathB = min(pathB, tg); }
  }
  pathB = min(pathB, uFroxelRange.y);
  // (a pass that does not draw into the main view at its own size, the cloud volume's small
  // picture, says where its pixel is in the main view: HAZE_UV)
#ifdef HAZE_UV
  vec2 uvS = gHazeUv;
#else
  vec2 uvS = gl_FragCoord.xy / uViewport;
#endif
  vec3 T, L0, Lg;
  froxelHaze(dist * 0.001, pathA, pathB, uvS, cosT, T, L0, Lg);
  if (uAloft > 0.0) { float ka = hazeAloft(rd, normalize(pEnd)); T = mix(vec3(1.0), T, ka); L0 *= ka; Lg *= ka; }
  vec3 hazed = color * T + L0 + Lg * (rhoW - 1.0);
  return mix(hazed, marched, useMarch);
}
// Mist lying in a hollow, for an eye ABOVE it: how much of a thing rel from the eye it
// takes. By the thing's own depth under the mist's top and by the stretch of the line of sight
// that runs under that top: a tree standing in it goes paler from its crown down to its foot
// and is gone, with no line where a sheet would cut it; straight down through a few metres of
// it one sees the water dimly, along it nothing. Thin near its top (it comes on over uMist.z m
// of depth), and only within its own reach (the low land of another valley is not in it).
// mistCol: the mist's own light there. Nothing is read where there is no mist or the thing
// stands over it. (An eye INSIDE the mist has the air's veil instead: uWeather.w.)
float mistShare(vec3 rel, out vec3 mistCol) {
  mistCol = vec3(0.0);
  if (uMist.y <= 0.0) return 0.0;
  vec3 p = uCamPlanetPos + rel;
  float hE = length(uCamPlanetPos) - uMist.x, hP = length(p) - uMist.x;      // m over its top (under 0: in it)
  if (hP >= 0.0 || hE < 0.0) return 0.0;
  float under = -hP / max(hE - hP, 1e-3);                                     // the share of the line that runs under the top
  float k = 1.0 - exp(-uMist.y * length(rel) * under * clamp(-0.5 * hP / uMist.z, 0.0, 1.0));
  k *= 1.0 - smoothstep(6300.0, 9000.0, length(rel - uMistAt));
  // (not the water it lies on, uMist.w m under its top: that is the sheet's to hide and to show
  // through its thin places. With the water taken here as well the lake was one flat tone.)
  k *= 1.0 - smoothstep(uMist.w - 8.0, uMist.w - 2.0, -hP);
  if (k <= 0.002) return 0.0;
  vec3 up = normalize(p);
  mistCol = (skyLight(up, up) * 0.9 + directSun(p) * 0.3) * (1.06 / PI);
  return k;
}
// Rain (or snow) falling in the air between the eye and a thing: a grey veil that thickens
// with distance, as bright as the sky above lights it (uWeather.w: how much of the view a
// metre of it takes; 0 in dry air). In a downpour the far shore is gone within a kilometre.
vec3 rainVeil(vec3 color, vec3 rel) {
#ifndef NO_MIST
  if (uMist.y > 0.0) { vec3 mc; float km = mistShare(rel, mc); color = mix(color, mc, km); }
#endif
  if (uWeather.w <= 0.0) return color;
  vec3 up = normalize(uCamPlanetPos + rel);
  return mix(color, skyLight(up, up) * (0.7 / PI), 1.0 - exp(-length(rel) * uWeather.w));
}
// The whole of the air between the eye and a place as three numbers, for an eye inside the
// air (the caller asks: length(uCamPlanetPos) * 0.001 <= uRTop): what aerialPerspective
// does to a colour there is colour * T + L0 + Lg * (rho - 1), rho being the ground's albedo
// over the mean (see aerialPerspective below). The ground works these out at its vertices
// and not at every pixel: over a triangle of the ground the air changes by next to nothing.
// uv: the place in the main view (0..1). The froxels, the look's thinner air from high
// above (uHaze) and the rain's veil, as hazeOverGround, hazeOverGroundFull and rainVeil
// have them: one rule, worked out in froxelHaze for both.
void hazeAffine(vec3 rel, vec2 uv, out vec3 T, out vec3 L0, out vec3 Lg) {
  float dist = length(rel);
  vec3 ro = uCamPlanetPos * 0.001, rd = rel / dist;
  float rc = length(ro), bq = dot(ro, rd);
  float pathB = min(-bq + sqrt(max(bq * bq - (rc * rc - uRTop * uRTop), 0.0)), uFroxelRange.y);
  vec3 pEnd = ro + rd * (dist * 0.001);
  froxelHaze(dist * 0.001, 0.0, pathB, uv, dot(rd, uSunDir), T, L0, Lg);
  Lg *= smoothstep(0.3, 0.6, -dot(rd, pEnd) / length(pEnd));
  if (uAloft > 0.0) { float ka = hazeAloft(rd, normalize(pEnd)); T = mix(vec3(1.0), T, ka); L0 *= ka; Lg *= ka; }
  if (uHaze < 1.0) { T = mix(vec3(1.0), T, uHaze); L0 *= uHaze; Lg *= uHaze; }
  if (uWeather.w > 0.0) {
    vec3 up = normalize(uCamPlanetPos + rel);
    float kv = 1.0 - exp(-dist * uWeather.w);
    T *= 1.0 - kv; Lg *= 1.0 - kv; L0 = L0 * (1.0 - kv) + skyLight(up, up) * (0.7 / PI) * kv;
  }
  if (uMist.y > 0.0) { vec3 mc; float km = mistShare(rel, mc); T *= 1.0 - km; Lg *= 1.0 - km; L0 = L0 * (1.0 - km) + mc * km; }
}
// Small things (rocks, the lander, the character): the haze of mean ground.
// The air of a wood: a forest breathes a blue haze of its own, and row behind row of trees
// stands paler in it (the painted look's layers of distance, inside a forest and over one).
// amount: how much forest this is (1: a tree). Trees, the ground under them and the far
// canopy all ask here, so that they agree.
// (in two parts, for whoever works the air out at a thing's corners and not at every pixel,
// as the far forest does: the colour is mix(colour, air, k). skyUp: skyLight(up, up) at the
// place, for a shader whose vertices have asked for it, as the ground's do.)
void forestAirParts(vec3 rel, vec3 up, float amount, vec3 skyUp, out vec3 air, out float k) {
  // (the sky's light, a third of the way to grey: with its full blue the far firs were cyan)
  air = mix(skyUp, vec3(dot(skyUp, vec3(0.3, 0.55, 0.15))), 0.35) * (0.3 / PI);
  // (not from high above: the air of a wood is a thing of the landscape, and from orbit it
  // turned every forest teal)
  // (and from up in the air, like the haze, less of it over the wood straight below)
  k = uPaint.x * 0.34 * amount * (1.0 - exp(-length(rel) / 150.0)) * smoothstep(0.5, 1.0, uHaze) * hazeAloft(normalize(rel), up);
}
void forestAirParts(vec3 rel, vec3 up, float amount, out vec3 air, out float k) { forestAirParts(rel, up, amount, skyLight(up, up), air, k); }
vec3 forestAir(vec3 color, vec3 rel, vec3 up, float amount, vec3 skyUp) {
  vec3 air; float k; forestAirParts(rel, up, amount, skyUp, air, k);
  return mix(color, air, k);
}
vec3 forestAir(vec3 color, vec3 rel, vec3 up, float amount) { return forestAir(color, rel, up, amount, skyLight(up, up)); }
vec3 aerialPerspective(vec3 color, vec3 rel) { return rainVeil(hazeOverGround(color, rel, vec3(1.0)), rel); }
// The ground itself, with its own albedo.
vec3 aerialPerspective(vec3 color, vec3 rel, vec3 albedo) {
  return rainVeil(hazeOverGround(color, rel, clamp(albedo / max(uGroundAlbedo, vec3(1e-4)), 0.0, 2.5)), rel);
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
