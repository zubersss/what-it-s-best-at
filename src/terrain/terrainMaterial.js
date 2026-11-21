// Terrain surface shader: 3–4 materials blended by slope and height, strata bands on
// cliffs, tiling detail and wind ripples close to the camera. All colours and thresholds
// come from world.surface.
import * as THREE from 'three';
import { WAVE_GLSL, LIFTED, WAVE_STEPS } from '../water/waves.js';
import { CONFIG } from '../config.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { FACES } from './cubeSphere.js';

// Holds an albedo map's brightness (relative to its mean) inside the range the real ground
// spans, with soft knees: a mosaic also records the shading of steep slopes, haze and
// cloud, which would otherwise turn into ground two or three times too bright or dark.
// The colour of a pixel pulled back into range is trusted even less than its brightness
// (a bluish-white cloud or sunlit wall is not bluish-white ground). r = (lowest, highest);
// r.y = 0: no limit. Shared with the rocks (uGroundTint).
export const ALBEDO_RANGE_GLSL = /* glsl */`
vec3 albedoRange(vec3 t, vec2 r) {
  if (r.y <= 0.0) return t;
  float L = max(dot(t, vec3(0.3333)), 1e-4), x = L;
  float a = mix(r.x, r.y, 0.15), b = mix(r.x, r.y, 0.7);
  if (x > b) x = r.y - (r.y - b) * exp(-(x - b) / (r.y - b));
  if (x < a) x = r.x + (a - r.x) * exp(-(a - x) / (a - r.x));
  float trust = min(x / L, L / x);
  return x * (1.0 + (t / L - 1.0) * trust * trust);
}`;

// One instance per drawn chunk; its sixteen numbers (written in terrain.js):
//   aI0 = xyz the chunk's centre relative to the camera, w the distance where it has fully become its parent
//   aI1 = xyz the chunk's centre in planet axes, w the fade from the parent's look just after it first appeared (1 -> 0)
//   aI2 = xy detail-texture offset in tiles, z the chunk's extent in tiles, w its layer in the texture arrays
//   aI3 = x the parent's layer (-1: none loaded), y and z this chunk's corner inside the parent (0 or 0.5), w the cube face
const VERT = /* glsl */`
in vec2 aGrid;
in vec4 aI0, aI1, aI2, aI3;
uniform highp sampler2DArray tVert;     // xyz = vertex relative to the chunk's centre, w = height above datum
uniform highp sampler2DArray tMorph;    // height change toward the parent LOD
uniform highp sampler2DArray tNormal;   // (its fourth number says where water is, and how deep)
uniform vec4 uSea;
uniform vec4 uWind;          // xyz: where the wind blows to (unit, planet axes), w: its speed (m/s)
uniform vec3 uWave;          // x: the waves' height scale (m), y: 1 if the surface itself is lifted, z: time (s)
${WAVE_GLSL}
out vec2 vGrid;
out float vMorph;            // 0 = this chunk's own shape and shading, 1 = its parent's
out vec2 vDetailUv;
out float vHeight;
out vec3 vRel;
flat out vec3 vTanU;         // the cube face's two axes laid on the ground at the chunk's centre
flat out vec3 vTanV;
flat out vec4 vChunk;        // x = layer, y = parent's layer (-1: none), z = extent in detail tiles
flat out vec2 vParentOff;
const vec3 FACE_U[6] = vec3[6](${FACES.map((f) => `vec3(${f.u.map((x) => x.toFixed(1)).join(', ')})`).join(', ')});
const vec3 FACE_V[6] = vec3[6](${FACES.map((f) => `vec3(${f.v.map((x) => x.toFixed(1)).join(', ')})`).join(', ')});
void main() {
  ivec3 tc = ivec3(gl_VertexID % VERT_W, gl_VertexID / VERT_W, int(aI2.w + 0.5));
  vec4 pv = texelFetch(tVert, tc, 0);
  float dm = texelFetch(tMorph, tc, 0).r;
  vec3 rel = aI0.xyz + pv.xyz;                              // camera-relative, planet axes
  float k = max(clamp((length(rel) / aI0.w - float(MORPH_START)) / (0.96 - float(MORPH_START)), 0.0, 1.0), aI1.w);
  vMorph = k;
  vec3 up = normalize(aI1.xyz + pv.xyz);
  rel += up * (dm * k);
  vHeight = pv.w + dm * k;
  vGrid = aGrid;
  vDetailUv = aI2.xy + aGrid * aI2.z;
  vRel = rel;
  vec3 n = normalize(aI1.xyz);
  int face = int(aI3.w + 0.5);
  vTanU = normalize(FACE_U[face] - n * dot(FACE_U[face], n));
  vTanV = normalize(FACE_V[face] - n * dot(FACE_V[face], n));
  if (uSea.x > 0.5 && uWave.y > 0.5 && aI2.z < 2.5) {
    // Open water rises and falls with its waves (the long ones, where the mesh is fine
    // enough to carry them; none at the shore, where the water is shallow).
    float wa = textureLod(tNormal, vec3((aGrid * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1), aI2.w), 0.0).a;
    // (by distance, not by patch: neighbours of different detail must agree along their edge)
    float deep = clamp((wa - 1.15) / 1.5, 0.0, 1.0) * (1.0 - smoothstep(160.0, 420.0, length(rel)));
    deep *= 1.0 - 0.88 * smoothstep(2.0, 6.0, pv.w - uSea.y);          // (lakes and rivers: small waves)
    if (deep > 0.0) rel += up * (wave(vDetailUv, uWave.z, vec2(dot(uWind.xyz, vTanU), dot(uWind.xyz, vTanV)), uWave.x, ${LIFTED}).z * deep);
    vRel = rel;
  }
  vChunk = vec4(aI2.w, aI3.x, aI2.z, 0.0);
  vParentOff = aI3.yz;
  gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform highp sampler2DArray tNormal;   // one layer per chunk: xyz world normal, a = cavity occlusion
uniform lowp sampler2DArray tShadow;    // one layer per chunk: baked sun visibility
// (the parent chunk's layers of the same two arrays: shading morphs toward them exactly as
// the vertices morph toward the parent's shape)
uniform sampler2D tStrata;
uniform sampler2D tDetail;
uniform vec3 uDust, uSand, uScree, uRock, uBedrock;
uniform vec4 uSlopes;          // dustMax, screeMin, screeMax, rockMin (tan slope)
uniform vec4 uStrata;          // 1/period, contrast, 1/finePeriod, fine contrast
uniform float uStrataFlat;     // how much of the bands shows through the dust on gentle ground
uniform vec2 uSandRange;       // below altitude, fade
uniform vec4 uCover;           // x, y = map brightness of dust-covered and of dark ground; z = least sand anywhere; w = sand below uSandRange
uniform vec4 uCoverPattern;    // x, y = bedrock share on dust-covered and on dark ground, z = pull of hollows, w = spread of the pattern
uniform vec2 uRockHue;         // how much of the dust's hue rock wears on dust-covered and on dark ground
uniform float uCoverContrast;  // how pure the cover's patches are (1: all sand or all dust)
uniform float uBedrockSlope;   // bedrock share on gentle slopes just short of scree (dust and sand slide off)
uniform vec4 uRipple;          // xy = ripple wave vector (whole cycles per detail tile), z = strength, w = share on dust
uniform float uRoughness;
uniform sampler2D tClouds;      // the home world's cloud map (its shadow on the ground)
uniform vec4 uCloud;           // x how dark the shadow is (0: no clouds), y the cloud layer's radius (m), z the map's longitude shift (turns)
uniform vec4 uSea;             // water: x = 1 if the world has any, y the sea's level (m), z how tight the Sun's glint is, w how strong the ripples
uniform vec3 uSeaColor;        // deep water's own colour
uniform vec4 uWind;            // xyz: where the wind blows to (unit, planet axes), w: its speed (m/s)
uniform vec3 uWave;            // x: the waves' height scale (m), y: 1 if the surface itself is lifted, z: time (s)
${WAVE_GLSL}
uniform float uTime;
uniform vec2 uGloss;           // ice and wet ground: x = how strong the Sun's sheen is (0: none), y = how tight (roughness)
uniform float uFarRoughness;  // the same for ground whose chunk texels are kilometres (seen from orbit)
uniform float uDetailStrength;
uniform sampler2D tAlbedo;     // global map of the world's real brightness or colour (longitude 0..360 E from the left edge, north in the first row)
uniform sampler2D tRingColour; // the same from map tiles round the traveller (Web Mercator, far finer; terrain/tiles)
uniform vec4 uRingColour;      // longitude of its left edge (turns), Mercator Y of its top edge (radians), 1 / its width in turns, strength (0: none)
uniform vec4 uAlbedoMap;       // rgb = 1 / the map's mean, w = how strongly it tints the palette (0 = no map)
uniform float uAlbedoChroma;   // how much of the map's colour (not just its brightness) is used, 0..1
uniform float uAlbedoSteep;    // how much of the map's tint steep rock takes (1: all, as gentle ground)
uniform float uAlbedoShift;    // 0.5 for a map whose left edge is longitude -180 (Earth's), else 0
uniform vec2 uAlbedoFade;      // sines of the latitudes between which the map fades out toward the poles
uniform vec2 uAlbedoRange;     // soft limits of the map's brightness relative to its mean (y = 0: none), held near the ground only
uniform sampler2D tRelief;     // the ground's slope everywhere: east slope in the top half, north in the bottom (fetch-maps.py)
uniform vec4 uRelief;          // x = strength (0 = no map), y = metres per map texel (north-south), z = texels across, w unused
uniform vec2 uReliefFade;      // sines of the latitudes between which it fades out toward the poles
// How sharp the elevation data is at each place, from the world's raster list (setDemList):
// per raster lon0, lon1, lat0, lat1 in degrees; and log2(metres per pixel), 1 / feather in
// degrees, whole world (1/0), in use (1/0). Numbers, not a map: the ground's shader may read
// at most 16 textures on a phone, and it was over that with a map here.
#define DEM_N 8
uniform vec4 uDemBox[DEM_N];
uniform vec4 uDemInfo[DEM_N];

// log2 of the metres per pixel of the elevation data at a longitude and latitude (degrees):
// the last raster in the list that covers the place, blended across its feather with the
// one under it (the same rule as the height function's blend; see DemSet).
float demLog2Res(float lon, float lat) {
  float cosLat = max(0.05, cos(radians(lat)));
  float topW = -1.0, topRes = 17.0;
  for (int k = DEM_N - 1; k >= 0; k--) {
    vec4 b = uDemBox[k], f = uDemInfo[k];
    if (f.w < 0.5) continue;
    float w = 1.0;
    if (f.z < 0.5) {
      if (lon <= b.x || lon >= b.y || lat >= b.z || lat <= b.w) continue;
      w = smoothstep(0.0, 1.0, min(min(lon - b.x, b.y - lon) * cosLat, min(b.z - lat, lat - b.w)) * f.y);
    }
    if (topW < 0.0) { if (w >= 1.0) return f.x; topW = w; topRes = f.x; }
    else return mix(f.x, topRes, topW);
  }
  return topRes;
}

// Slope (east, north; metres per metre) of the relief map at a level of detail.
vec2 reliefSlope(vec2 uv, float lod) {
  float e = textureLod(tRelief, vec2(uv.x, uv.y * 0.5), lod).r * 2.0 - 1.0;
  float n = textureLod(tRelief, vec2(uv.x, 0.5 + uv.y * 0.5), lod).r * 2.0 - 1.0;
  return vec2(e * abs(e), n * abs(n));
}
in vec2 vGrid;
in vec2 vDetailUv;
in float vHeight;
in vec3 vRel;
in float vMorph;
flat in vec3 vTanU;
flat in vec3 vTanV;
flat in vec4 vChunk;           // x = layer, y = parent's layer (-1: none), z = extent in tiles of DETAIL_TILE metres
flat in vec2 vParentOff;       // this chunk's corner inside the parent (0 or 0.5)
layout(location = 0) out vec4 fragColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Pattern level below which a share c of the ground lies (the pattern is roughly normal
// around 0.5 with the spread uCoverPattern.w; logistic fit of its distribution).
float coverLevel(float c) {
  c = clamp(c, 1e-3, 1.0 - 1e-3);
  return 0.5 + uCoverPattern.w * log(c / (1.0 - c));
}

${ALBEDO_RANGE_GLSL}

void main() {
  vec3 uTanU = vTanU, uTanV = vTanV;
  vec4 nt = texture(tNormal, vec3((vGrid * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1), vChunk.x));
  float shadow = texture(tShadow, vec3((vGrid * float(SHADOW_RES) + 0.5) / float(SHADOW_RES + 1), vChunk.x)).r;
  float pk = vMorph * step(0.0, vChunk.y);
  if (pk > 0.004) {
    // Near the distance where this chunk hands over to its parent (and for a moment
    // after it first appears) normals, cavities and baked shadows blend into the
    // parent's, so detail arrives and leaves without a pop.
    vec2 pg = vParentOff + vGrid * 0.5;
    nt = mix(nt, texture(tNormal, vec3((pg * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1), vChunk.y)), pk);
    shadow = mix(shadow, texture(tShadow, vec3((pg * float(SHADOW_RES) + 0.5) / float(SHADOW_RES + 1), vChunk.y)).r, pk);
  }
  vec3 N = normalize(nt.xyz);
  // (the fourth number: cavity shading, 0..1, on land; 1 + the water's depth in metres on water)
  float waterDepth = max(nt.a - 1.0, 0.0);
  float ao = min(nt.a, 1.0);
  vec3 planetPos = uCamPlanetPos + vRel;
  vec3 up = normalize(planetPos);
  float dist = length(vRel);
  vec3 V = -vRel / dist;

  vec4 d0 = texture(tDetail, vDetailUv);
  vec4 d1 = vec4(0.5), d2 = vec4(0.5);
  vec3 grain = vec3(0.0);                       // close-up detail normal (planet axes, before scaling)
  bool fine = uQuality.x > 0.5;                 // governor step: close-up ground detail
  if (fine) {
    // Mapped from above on gentle ground. A steep face also takes it mapped onto itself
    // (along it and up it, the height wrapped by one tile: the texture repeats), else
    // the texture stretches down the face into streaks. Weights reach 0 where the slope
    // turns gentle, so the plain mapping takes over there without a seam.
    vec2 gx = dFdx(vDetailUv), gy = dFdy(vDetailUv);
    float hy = mod(vHeight, float(DETAIL_TILE)) / float(DETAIL_TILE);
    vec2 hg = vec2(dFdx(vHeight), dFdy(vHeight)) / float(DETAIL_TILE);
    vec3 w = max(abs(vec3(dot(N, uTanU), dot(N, uTanV), dot(N, up))) - 0.42, 0.0);
    w *= w; w /= w.x + w.y + w.z + 1e-8;
    vec4 a, b;
    if (w.z > 0.0) {
      a = textureGrad(tDetail, vDetailUv * 9.0, gx * 9.0, gy * 9.0); b = textureGrad(tDetail, vDetailUv * 83.0, gx * 83.0, gy * 83.0);
      d1 += (a - 0.5) * w.z; d2 += (b - 0.5) * w.z;
      grain += (uTanU * ((a.r - 0.5) * 0.9 + (b.r - 0.5) * 0.8) + uTanV * ((a.g - 0.5) * 0.9 + (b.g - 0.5) * 0.8)) * w.z;
    }
    if (w.x > 0.0) {             // a face looking along U: along V and up
      vec2 uv = vec2(vDetailUv.y, hy), sx = vec2(gx.y, hg.x), sy = vec2(gy.y, hg.y);
      a = textureGrad(tDetail, uv * 9.0, sx * 9.0, sy * 9.0); b = textureGrad(tDetail, uv * 83.0, sx * 83.0, sy * 83.0);
      d1 += (a - 0.5) * w.x; d2 += (b - 0.5) * w.x;
      grain += (uTanV * ((a.r - 0.5) * 0.9 + (b.r - 0.5) * 0.8) + up * ((a.g - 0.5) * 0.9 + (b.g - 0.5) * 0.8)) * w.x;
    }
    if (w.y > 0.0) {             // a face looking along V: along U and up
      vec2 uv = vec2(vDetailUv.x, hy), sx = vec2(gx.x, hg.x), sy = vec2(gy.x, hg.y);
      a = textureGrad(tDetail, uv * 9.0, sx * 9.0, sy * 9.0); b = textureGrad(tDetail, uv * 83.0, sx * 83.0, sy * 83.0);
      d1 += (a - 0.5) * w.y; d2 += (b - 0.5) * w.y;
      grain += (uTanU * ((a.r - 0.5) * 0.9 + (b.r - 0.5) * 0.8) + up * ((a.g - 0.5) * 0.9 + (b.g - 0.5) * 0.8)) * w.y;
    }
  }

  // --- materials by slope
  float cosS = clamp(dot(N, up), 0.0, 1.0);
  float ts = sqrt(max(0.0, 1.0 - cosS * cosS)) / max(cosS, 0.04);
  ts *= 1.0 + (d0.a - 0.5) * 0.5 + (d1.b - 0.5) * 0.3;
  float rockW = smoothstep(uSlopes.z, uSlopes.w, ts);
  float screeW = smoothstep(uSlopes.x, uSlopes.y, ts) * (1.0 - rockW);
  float flatW = 1.0 - rockW - screeW;

  // Global maps (longitude 0..360 E from the left edge, north in the first row). Longitude
  // jumps by a full turn somewhere, so a map's footprint on screen is worked out from the
  // direction itself (which has no seam) and handed to the sampler.
  vec2 uvA = vec2(atan(up.y, up.x) * 0.15915494, acos(clamp(up.z, -1.0, 1.0)) * 0.31830989);
  vec3 upX = dFdx(up), upY = dFdy(up);
  float kA = 0.15915494 / max(dot(up.xy, up.xy), 1e-5);
  vec2 gx = vec2((up.x * upX.y - up.y * upX.x) * kA, dFdx(uvA.y));
  vec2 gy = vec2((up.x * upY.y - up.y * upY.x) * kA, dFdy(uvA.y));
  // metres per texel of this chunk's normal map: how far away (in detail) this ground is
  float chunkTexel = vChunk.z * float(DETAIL_TILE) / float(NORMAL_RES);
  float farW = smoothstep(200.0, 2000.0, chunkTexel);

  // --- the world's real large-scale brightness and colour: maria, rays, dark sands
  vec3 mapTint = vec3(1.0);
  float mapW = 0.0;
  if (uAlbedoMap.w > 0.0) {
    vec3 raw = textureGrad(tAlbedo, vec2(uvA.x + uAlbedoShift, uvA.y), gx, gy).rgb;
    if (uRingColour.w > 0.0) {
      // (Mercator: columns even in longitude, rows in atanh(sin(latitude)))
      float oz = max(1.0 - up.z * up.z, 1e-6), kv = uRingColour.z * 0.15915494;
      vec2 uvR = vec2(fract(uvA.x - uRingColour.x) * uRingColour.z, (uRingColour.y - 0.5 * log((1.0 + up.z) / (1.0 - up.z))) * kv);
      vec2 e2 = min(uvR, 1.0 - uvR);
      float rw = smoothstep(0.0, 0.07, min(e2.x, e2.y)) * uRingColour.w;
      if (rw > 0.0) raw = mix(raw, textureGrad(tRingColour, uvR, vec2(gx.x * uRingColour.z, -upX.z / oz * kv), vec2(gy.x * uRingColour.z, -upY.z / oz * kv)).rgb, rw);
    }
    raw *= uAlbedoMap.rgb;
    vec3 t = mix(albedoRange(raw, uAlbedoRange), raw, farW);
    mapW = uAlbedoMap.w * (1.0 - smoothstep(uAlbedoFade.x, uAlbedoFade.y, abs(up.z)));
    mapTint = mix(vec3(1.0), mix(vec3(dot(t, vec3(0.3333))), t, uAlbedoChroma), mapW);
  }

  // --- colour
  float hs = vHeight + (d0.b - 0.5) * 24.0;
  vec3 tint = texture(tStrata, vec2(hs * uStrata.x, 0.25)).rgb * 2.0;
  vec3 tintFine = texture(tStrata, vec2(hs * uStrata.z, 0.75)).rgb * 2.0;
  vec3 band = mix(vec3(1.0), tint, uStrata.y) * mix(vec3(1.0), tintFine, uStrata.w);
  // How dark the map is here: dark ground is bare rock and sand, bright ground is mantled in dust.
  float dark = clamp((uCover.x - dot(mapTint, vec3(0.3333))) / (uCover.x - uCover.y), 0.0, 1.0);
  // Where dust mantles everything, rock and scree wear its hue (at their own brightness).
  float hue = mix(uRockHue.x, uRockHue.y, dark);
  vec3 dustHue = uDust / luma(uDust);
  vec3 rock = mix(uRock, dustHue * luma(uRock), hue) * band;
  vec3 scree = mix(uScree, dustHue * luma(uScree), hue) * mix(vec3(1.0), band, 0.35);
  vec3 bedrock = mix(uBedrock, dustHue * luma(uBedrock), hue);

  // What covers gentle ground: dust, dark sand and bare bedrock. How much of each comes
  // from the place (the map's darkness, the altitude); where, from one pattern of patches
  // a few metres to tens of metres across that gathers sand in hollows and leaves bedrock
  // on the rises. Edges are crisp up close; once the patches are smaller than a pixel the
  // ground takes their mean colour.
  float cBed = mix(uCoverPattern.x, uCoverPattern.y, dark);
  cBed = mix(cBed, max(cBed, uBedrockSlope), smoothstep(0.0, uSlopes.x, ts));
  float cSand = max(max(uCover.z, uCover.w * smoothstep(uSandRange.x + uSandRange.y, uSandRange.x, vHeight)), dark) * (1.0 - cBed);
  float sandM = 0.0, bedM = 0.0;
  if (uCover.x > 0.0 || uCover.z + uCover.w + uCoverPattern.x + uCoverPattern.y > 0.0) {
    float pat = d0.a + 0.3 * (d1.a - 0.5) - (1.0 - ao) * uCoverPattern.z;
    float aa = fwidth(pat) + 0.012;
    float tS = coverLevel(cSand), tB = coverLevel(1.0 - cBed);
    sandM = 1.0 - smoothstep(tS - aa, tS + aa, pat);
    bedM = min(smoothstep(tB - aa, tB + aa, pat), 1.0 - sandM);
    float far = smoothstep(6.0, 48.0, (abs(dFdx(vDetailUv.x)) + abs(dFdy(vDetailUv.x)) + abs(dFdx(vDetailUv.y)) + abs(dFdy(vDetailUv.y))) * 128.0);
    sandM = mix(cSand, sandM, uCoverContrast * (1.0 - far)); bedM = mix(cBed, bedM, uCoverContrast * (1.0 - far));
  }
  // (on gentle ground the bands follow the height, so from far away they would draw
  // contour lines across the plains: they show near the ground only)
  vec3 bandFlat = mix(band, vec3(1.0), farW);
  vec3 dust = uDust * mix(vec3(1.0), bandFlat, uStrataFlat);
  vec3 flatC = dust * (1.0 - sandM - bedM) + uSand * sandM + bedrock * bandFlat * bedM;
  // The map gives the mean brightness of the ground; the cover only shares it out.
  vec3 meanFlat = uDust * (1.0 - cSand - cBed) + uSand * cSand + bedrock * cBed;
  flatC *= mix(1.0, luma(uDust) / luma(meanFlat), mapW);
  vec3 albedo = rock * rockW * mix(vec3(1.0), mapTint, uAlbedoSteep) + (scree * screeW + flatC * flatW) * mapTint;
  albedo *= 0.93 + 0.14 * d1.a;

  // --- detail normal: grain everywhere (above), wind ripples on sand (both vanish with distance via mips / footprint)
  grain *= uDetailStrength * (0.55 + 0.9 * rockW + 0.5 * screeW);
  vec2 dn = vec2(0.0);
  // A whole number of ripples per detail tile, so crests run on unbroken across chunk edges
  // (each chunk's tile offset is only known modulo one tile). Large gentle bends only.
  vec2 wind = normalize(uRipple.xy + 1e-6);
  float phase = 6.2831853 * dot(vDetailUv, uRipple.xy) + (d0.b - 0.5) * 18.0 + (d1.b - 0.5) * 2.0;
  float ripFade = fine ? (1.0 - smoothstep(0.5, 1.6, fwidth(phase))) * flatW * mix(uRipple.w, 1.0, sandM) : 0.0;
  dn += wind * cos(phase) * uRipple.z * ripFade;
  N = normalize(N + grain + uTanU * dn.x + uTanV * dn.y);

  // --- relief from far away. Outside the sharp landmark patches the heights come from a
  // global elevation map that only knows features some tens of kilometres across, and a
  // chunk's normal map has 120 texels across the chunk: from space every crater wall and
  // canyon side was smoothed away and the planet looked like a painted disc. The world's
  // slope map adds the real relief between its own resolution (or the screen's, if that
  // is coarser) and the coarser of the chunk's texels and what the heights resolve
  // (about 2.5 raster pixels). Near the ground, where the chunks are far finer than the
  // map, it fades out, so the shading never disagrees with the ground underfoot.
  if (uRelief.x * uQuality.w > 0.0) {
    float lodC = log2(chunkTexel * (1.0 + pk) / uRelief.y);
    float demRes = exp2(demLog2Res(fract(uvA.x) * 360.0, 90.0 - uvA.y * 180.0));
    float lodRef = max(lodC, log2(2.5 * demRes / uRelief.y));
    vec2 ts = vec2(uRelief.z, uRelief.z * 0.5);
    float lodF = max(0.5 * log2(max(dot(gx * ts, gx * ts), dot(gy * ts, gy * ts))), 0.0);
    float nearFade = smoothstep(-5.0, -3.0, lodC);
    if (lodRef > lodF + 0.05 && nearFade > 0.0) {
      vec2 dS = reliefSlope(uvA, lodF) - reliefSlope(uvA, lodRef);
      vec3 east = normalize(vec3(-up.y, up.x, 0.0) + vec3(1e-6, 0.0, 0.0)), north = cross(up, east);
      float k = uRelief.x * nearFade * (1.0 - smoothstep(uReliefFade.x, uReliefFade.y, abs(up.z)));
      N = normalize(N - k * (dS.x * east + dS.y * north));
    }
  }

  // --- water: dark, moving, shining; its colour by how deep it is
  float water = uSea.x > 0.5 ? smoothstep(0.02, 0.22, waterDepth) : 0.0;
  float foam = 0.0, waveRough = 0.0;
  if (water > 0.0) {
    // waves: the long ones as slopes (the surface itself rises with them near the
    // traveller, see the vertex shader), ripples from the detail texture on top
    float fw = fwidth(vDetailUv.x) + fwidth(vDetailUv.y);                  // detail tiles per pixel
    vec2 wind2 = vec2(dot(uWind.xyz, vTanU), dot(uWind.xyz, vTanV));
    float shoal = 0.35 + 0.65 * smoothstep(0.0, 1.5, waterDepth);
    // (a wave shorter than two pixels is roughness, not shape)
    float mpp = fw * float(DETAIL_TILE);
    int nw = ${WAVE_STEPS.map(([n, len]) => `mpp < ${(len / 5).toFixed(2)} ? ${n} : `).reverse().join('')}0;
    float inland = smoothstep(2.0, 6.0, vHeight - uSea.y);                  // lakes and rivers: small waves
    vec3 wv = wave(vDetailUv, uWave.z, wind2, uWave.x * shoal * (1.0 - 0.88 * inland), nw);
    waveRough = uWave.x * 0.5 * smoothstep(0.02, 0.3, fw);
    vec2 drift = uWave.z * vec2(0.011, 0.006);
    vec3 r1 = texture(tDetail, vDetailUv * 3.0 + drift).rgb - 0.5, r2 = texture(tDetail, vDetailUv * 13.0 - drift * 2.3).rgb - 0.5;
    float near = 1.0 - smoothstep(0.02, 0.4, fw);
    vec2 rip = (r1.rg + 0.6 * r2.rg) * (uSea.w * near * (0.4 + 0.1 * uWind.w));
    vec3 Nw = normalize(up - uTanU * (wv.x + rip.x) - uTanV * (wv.y + rip.y));
    N = normalize(mix(N, Nw, water));
    // foam: a line where the water runs out on the shore, bands that follow the bed's
    // contours and run in toward it, and the crests in a strong wind
    float lace = texture(tDetail, vDetailUv * 5.0 - drift * 3.0).b * 0.6 + texture(tDetail, vDetailUv * 21.0 + drift * 5.0).b * 0.4;
    float crest = smoothstep(0.55, 0.95, wv.z / max(uWave.x * 2.2, 0.05)) * smoothstep(7.0, 14.0, uWind.w) * smoothstep(0.45, 0.7, lace);
    float inshore = 1.0 - smoothstep(0.25, 1.6 + uWave.x, waterDepth);
    float band = smoothstep(0.62, 0.97, sin(6.2831853 * (waterDepth / (0.45 + 0.5 * uWave.x) + lace * 0.9) + uWave.z * 1.1)) * inshore * smoothstep(0.25, 0.55, lace + 0.35 * inshore);
    float edge = 1.0 - smoothstep(0.0, 0.10 + 0.08 * lace, waterDepth);
    foam = clamp(max(max(edge, band) * (1.0 - 0.85 * inland), crest), 0.0, 1.0) * water * near;
    // colour: light goes down to the bed and comes back, red lost first; what is left of
    // it shows the bed (pale sand), the rest is the water's own blue
    vec3 through = exp(-vec3(0.42, 0.07, 0.035) * (waterDepth * 2.3));
    vec3 body = vec3(0.30, 0.27, 0.20) * through + uSeaColor * (1.0 - through.b);
    albedo = mix(albedo, mix(body, vec3(0.75), foam), water);
    ao = mix(ao, 1.0, water);
  }

  // --- light
  if (uCloud.x > 0.0 && length(planetPos) < uCloud.y) {
    // the cloud that stands between this ground and the Sun
    vec3 uc = normalize(planetPos + uSunDir * ((uCloud.y - length(planetPos)) / max(dot(up, uSunDir), 0.08)));
    float cd = textureLod(tClouds, vec2(atan(uc.y, uc.x) * 0.15915494 + uCloud.z, acos(clamp(uc.z, -1.0, 1.0)) * 0.31830989), 0.0).r;
    shadow *= 1.0 - uCloud.x * smoothstep(0.2, 0.7, cd);
  }
  shadow *= nearShadow(vRel, N);
  // Oren-Nayar roughness describes the grains and clods underfoot; at the scale of a whole
  // disc it kept the limb nearly as bright as the centre (71 % at 72 degrees off the
  // vertical; real Mars is about half). Far ground blends to the world's farRoughness.
  float sigma = mix(uRoughness, uFarRoughness, farW);
  float diffuse = groundDiffuse(N, uSunDir, V, sigma);
  vec3 direct = directSun(planetPos) * shadow * diffuse;
  vec3 ambient = (skyLight(N, up) * ao + planetShine(N)) * contactSky(vRel, N) / PI;
  vec3 col = albedo * (direct + ambient);
  if (water > 0.0) {
    // the Sun's glint (seen from orbit too) and the sky in the water at a grazing view
    vec3 Hh = normalize(uSunDir + V);
    float rough = uSea.z + waveRough + 0.25 * smoothstep(0.02, 0.6, fwidth(vDetailUv.x) + fwidth(vDetailUv.y));
    float nh = max(dot(N, Hh), 0.0), a2 = rough * rough, dd = nh * nh * (a2 - 1.0) + 1.0;
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0), Fv = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 Rv = reflect(-V, N); Rv = normalize(Rv + up * max(0.0, 0.05 - dot(Rv, up)));
    col += water * (1.0 - foam) * (directSun(planetPos) * shadow * (a2 / (PI * dd * dd) * F * max(dot(N, uSunDir), 0.0) * 0.25 / max(dot(N, V), 0.2)) + Fv * skyLight(Rv, up) / PI);
  } else if (uGloss.x > 0.0) {
    // the Sun's sheen on ice: a broad glint toward the Sun, strongest at a grazing view;
    // it fades with distance into the far ground's plain brightness
    vec3 Hh = normalize(uSunDir + V);
    float nh = max(dot(N, Hh), 0.0), a2 = uGloss.y * uGloss.y, dd = nh * nh * (a2 - 1.0) + 1.0;
    float F = 0.03 + 0.97 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
    col += directSun(planetPos) * shadow * (uGloss.x * (1.0 - farW) * a2 / (PI * dd * dd) * F * max(dot(N, uSunDir), 0.0));
  }
  col = aerialPerspective(col, vRel, albedo);      // the haze above depends on how bright the ground is
  fragColor = vec4(col * uExposure, 1.0);
}`;

// Uniforms shared by every chunk material (same objects, by reference).
export function makeTerrainShared(world, textures) {
  const shared = {
    ...lightingUniforms(),
    tStrata: { value: textures.strata }, tDetail: { value: textures.detail },
    uDust: { value: new THREE.Vector3() }, uSand: { value: new THREE.Vector3() },
    uScree: { value: new THREE.Vector3() }, uRock: { value: new THREE.Vector3() }, uBedrock: { value: new THREE.Vector3() },
    uSlopes: { value: new THREE.Vector4() }, uStrata: { value: new THREE.Vector4() }, uStrataFlat: { value: 0 },
    uSandRange: { value: new THREE.Vector2() }, uRipple: { value: new THREE.Vector4() },
    uCover: { value: new THREE.Vector4() },
    // w: the cover pattern (d0.a + 0.3 d1.a) is about normal; logistic scale = its spread / 1.702
    uCoverPattern: { value: new THREE.Vector4(0, 0, 0, (textures.detail.userData.lowSpread ?? 0.1) * Math.hypot(1, 0.3) / 1.702) },
    uRoughness: { value: 0.5 }, uFarRoughness: { value: 0.5 }, uDetailStrength: { value: 0.5 }, uGloss: { value: new THREE.Vector2(0, 0.3) }, uSea: { value: new THREE.Vector4(0, 0, 0.1, 0.05) }, uWind: { value: new THREE.Vector4(1, 0, 0, 5) }, uWave: { value: new THREE.Vector3(0.3, 1, 0) }, tClouds: { value: textures.white }, uCloud: { value: new THREE.Vector4(0, 1, 0, 0) }, uSeaColor: { value: new THREE.Vector3(0.01, 0.03, 0.07) },
    tRingColour: { value: textures.white }, uRingColour: { value: new THREE.Vector4(0, 0, 1, 0) },
    tAlbedo: { value: textures.white }, uAlbedoMap: { value: new THREE.Vector4(1, 1, 1, 0) }, uAlbedoChroma: { value: 1 }, uAlbedoShift: { value: 0 }, uAlbedoSteep: { value: 1 }, uAlbedoFade: { value: new THREE.Vector2(2, 3) },
    uAlbedoRange: { value: new THREE.Vector2() }, uRockHue: { value: new THREE.Vector2() }, uCoverContrast: { value: 1 }, uBedrockSlope: { value: 0 },
    uDemBox: { value: Array.from({ length: DEM_N }, () => new THREE.Vector4()) }, uDemInfo: { value: Array.from({ length: DEM_N }, () => new THREE.Vector4()) },
    tRelief: { value: textures.white }, uRelief: { value: new THREE.Vector4(0, 1, 1, 0) }, uReliefFade: { value: new THREE.Vector2(2, 3) },
  };
  setTerrainSurface(shared, world);
  return shared;
}

const DEM_N = 8;
// The world's elevation rasters as the shader's sharpness list (uDemBox / uDemInfo, see
// demLog2Res). Rasters past DEM_N are left out (the far relief is then added a little
// where a sharp patch already has it).
export function setDemList(shared, world) {
  const R = world.radius, dems = world.terrain.dems || [];
  for (let k = 0; k < DEM_N; k++) {
    const r = dems[k], box = shared.uDemBox.value[k], info = shared.uDemInfo.value[k];
    if (!r) { box.set(0, 0, 0, 0); info.set(0, 0, 0, 0); continue; }
    const res = (Math.PI / 180) * R * (r.lon1 - r.lon0) / r.width;
    box.set(r.lon0, r.lon1, r.lat0, r.lat1);
    info.set(Math.log2(res), 1 / (r.feather || 0.25), r.wrap ? 1 : 0, 1);
  }
}

// Writes a world's surface numbers into the shared uniforms (also used when switching worlds).
export function setTerrainSurface(shared, world) {
  const s = world.surface, st = s.strata || {};
  shared.uDust.value.set(...s.dust); shared.uSand.value.set(...s.sand);
  shared.uScree.value.set(...s.scree); shared.uRock.value.set(...s.rock); shared.uBedrock.value.set(...(s.bedrock || s.rock));
  shared.uSlopes.value.set(s.slopes.dustMax, s.slopes.screeMin, s.slopes.screeMax, s.slopes.rockMin);
  shared.uStrata.value.set(1 / (st.period || 1000), st.contrast || 0, 1 / (st.finePeriod || 100), st.fine || 0);
  shared.uStrataFlat.value = st.flat || 0;
  shared.uSandRange.value.set(s.sandBelow ?? -1e9, s.sandFade ?? 1);
  // Cover of gentle ground (see the Mars file). Without `sandMap` the map never brings sand.
  const cv = s.cover || {}, bed = cv.bedrock ?? [0, 0];
  shared.uCover.value.set(cv.sandMap?.[0] ?? -1, cv.sandMap?.[1] ?? -2, cv.sandMin ?? 0, cv.sandLow ?? 0.78);
  shared.uCoverPattern.value.x = bed[0]; shared.uCoverPattern.value.y = bed[1]; shared.uBedrockSlope.value = bed[2] ?? 0;
  shared.uCoverPattern.value.z = cv.hollows ?? 0;
  shared.uRockHue.value.set(...(cv.rockHue || [0, 0]));
  shared.uCoverContrast.value = cv.contrast ?? 1;
  // Ripples: the wave vector is rounded to whole cycles per detail tile (crests continue across chunks).
  const rw = s.ripples?.wavelength || 1, dir = s.ripples?.direction ?? 34.8, cyc = DETAIL_TILE / rw;
  shared.uRipple.value.set(Math.round(cyc * Math.cos(dir * Math.PI / 180)), Math.round(cyc * Math.sin(dir * Math.PI / 180)), s.ripples?.strength || 0, s.ripples?.onDust ?? 1);
  shared.uRoughness.value = s.roughness ?? 0.5;
  shared.uGloss.value.set(s.gloss?.strength ?? 0, s.gloss?.roughness ?? 0.3);
  shared.uSea.value.set(s.sea ? 1 : 0, s.sea?.level ?? 0, s.sea?.roughness ?? 0.1, s.sea?.ripples ?? 0.05);
  shared.uSeaColor.value.set(...(s.sea?.color || [0.01, 0.03, 0.07]));
  shared.uFarRoughness.value = s.farRoughness ?? shared.uRoughness.value;
  shared.uDetailStrength.value = s.detailStrength ?? 0.5;
  shared.uPhotometry.value = s.photometry === 'lunar' ? 1 : 0;
  shared.uAlbedoMap.value.w = 0;          // until the world's map has loaded (Terrain.loadAlbedoMap)
  shared.uRelief.value.x = 0;             // until the world's slope map has loaded (Terrain.loadReliefMap)
  shared.uAlbedoRange.value.set(...(s.albedoMap?.range || [0, 0]));
}

export const DETAIL_TILE = 64;   // metres covered by one repeat of the detail texture at the coarsest scale

// The one material of the ground. pool: the ChunkPool, for its texture arrays.
export function makeTerrainMaterial(shared, pool) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { ...atmosphereDefines(), NORMAL_RES: CONFIG.NORMAL_RES, SHADOW_RES: CONFIG.SHADOW_RES, SPACE_HAZE: 1, DETAIL_TILE, VERT_W: pool.VW, MORPH_START: CONFIG.MORPH_START },
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      ...shared,
      tNormal: { value: pool.normalTex }, tShadow: { value: pool.shadowTex },
      tVert: { value: pool.vertTex }, tMorph: { value: pool.morphTex },
    },
  });
}
