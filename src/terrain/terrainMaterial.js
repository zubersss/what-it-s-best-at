// Terrain surface shader: 3–4 materials blended by slope and height, strata bands on
// cliffs, tiling detail and wind ripples close to the camera. All colours and thresholds
// come from world.surface.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

const VERT = /* glsl */`
in vec2 aGrid;
in vec2 aHM;                 // x = height above datum, y = morph delta toward the parent LOD
uniform vec3 uChunkPlanetPos;
uniform vec3 uMorph;         // x = distance where this chunk has fully become its parent, y = start fraction,
                             // z = fade from the parent's look just after this chunk first appeared (1 -> 0)
uniform vec4 uDetail;        // xy = offset in tiles, zw = chunk extent in tiles
out vec2 vUv;
out vec2 vGrid;
out float vMorph;            // 0 = this chunk's own shape and shading, 1 = its parent's
out vec2 vDetailUv;
out float vHeight;
out vec3 vRel;
void main() {
  vec3 rel = (modelMatrix * vec4(position, 1.0)).xyz;      // camera-relative, planet axes
  float k = max(clamp((length(rel) / uMorph.x - uMorph.y) / (0.96 - uMorph.y), 0.0, 1.0), uMorph.z);
  vMorph = k;
  vec3 up = normalize(uChunkPlanetPos + position);
  rel += up * (aHM.y * k);
  vHeight = aHM.x + aHM.y * k;
  vGrid = aGrid;
  vUv = (aGrid * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1);
  vDetailUv = uDetail.xy + aGrid * uDetail.zw;
  vRel = rel;
  gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform sampler2D tNormal;     // xyz world normal, a = cavity occlusion
uniform sampler2D tShadow;     // baked sun visibility
uniform sampler2D tParentNormal;   // the same two maps of the parent chunk: shading morphs
uniform sampler2D tParentShadow;   // toward them exactly as the vertices morph toward its shape
uniform vec3 uParent;          // xy = this chunk's corner inside the parent (0 or 0.5), z = parent maps bound
uniform sampler2D tStrata;
uniform sampler2D tDetail;
uniform vec3 uDust, uSand, uScree, uRock;
uniform vec4 uSlopes;          // dustMax, screeMin, screeMax, rockMin (tan slope)
uniform vec4 uStrata;          // 1/period, contrast, 1/finePeriod, fine contrast
uniform vec2 uSandRange;       // below altitude, fade
uniform vec3 uRipple;          // 2pi / wavelength (per metre), strength, tile size (m)
uniform float uRoughness;
uniform float uFarRoughness;  // the same for ground whose chunk texels are kilometres (seen from orbit)
uniform float uDetailStrength;
uniform vec3 uTanU, uTanV;
uniform sampler2D tAlbedo;     // global map of the world's real brightness or colour (longitude 0..360 E from the left edge, north in the first row)
uniform vec4 uAlbedoMap;       // rgb = 1 / the map's mean, w = how strongly it tints the palette (0 = no map)
uniform float uAlbedoChroma;   // how much of the map's colour (not just its brightness) is used, 0..1
uniform vec2 uAlbedoFade;      // sines of the latitudes between which the map fades out toward the poles
uniform float uAlbedoMax;      // the map's tint is held below this brightness (the mosaic's photographed sunlit walls)
uniform sampler2D tRelief;     // the ground's slope everywhere: east slope in the top half, north in the bottom (fetch-maps.py)
uniform vec4 uRelief;          // x = strength (0 = no map), y = metres per map texel (north-south), z = texels across, w unused
uniform vec2 uReliefFade;      // sines of the latitudes between which it fades out toward the poles
uniform sampler2D tDemRes;     // how sharp the elevation data is at each place: log2(metres per pixel) * 16 / 255
uniform vec4 uDetail;          // (per chunk) xy = offset in tiles, zw = chunk extent in tiles of uRipple.z metres

// Slope (east, north; metres per metre) of the relief map at a level of detail.
vec2 reliefSlope(vec2 uv, float lod) {
  float e = textureLod(tRelief, vec2(uv.x, uv.y * 0.5), lod).r * 2.0 - 1.0;
  float n = textureLod(tRelief, vec2(uv.x, 0.5 + uv.y * 0.5), lod).r * 2.0 - 1.0;
  return vec2(e * abs(e), n * abs(n));
}
in vec2 vUv;
in vec2 vGrid;
in vec2 vDetailUv;
in float vHeight;
in vec3 vRel;
in float vMorph;
layout(location = 0) out vec4 fragColor;

void main() {
  vec4 nt = texture(tNormal, vUv);
  float shadow = texture(tShadow, (vGrid * float(SHADOW_RES) + 0.5) / float(SHADOW_RES + 1)).r;
  float pk = vMorph * uParent.z;
  if (pk > 0.004) {
    // Near the distance where this chunk hands over to its parent (and for a moment
    // after it first appears) normals, cavities and baked shadows blend into the
    // parent's, so detail arrives and leaves without a pop.
    vec2 pg = uParent.xy + vGrid * 0.5;
    nt = mix(nt, texture(tParentNormal, (pg * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1)), pk);
    shadow = mix(shadow, texture(tParentShadow, (pg * float(SHADOW_RES) + 0.5) / float(SHADOW_RES + 1)).r, pk);
  }
  vec3 N = normalize(nt.xyz);
  float ao = nt.a;
  vec3 planetPos = uCamPlanetPos + vRel;
  vec3 up = normalize(planetPos);
  float dist = length(vRel);
  vec3 V = -vRel / dist;

  vec4 d0 = texture(tDetail, vDetailUv);
  vec4 d1 = vec4(0.5), d2 = vec4(0.5);
  bool fine = uQuality.x > 0.5;                 // governor step: close-up ground detail
  if (fine) { d1 = texture(tDetail, vDetailUv * 9.0); d2 = texture(tDetail, vDetailUv * 83.0); }

  // --- materials by slope
  float cosS = clamp(dot(N, up), 0.0, 1.0);
  float ts = sqrt(max(0.0, 1.0 - cosS * cosS)) / max(cosS, 0.04);
  ts *= 1.0 + (d0.a - 0.5) * 0.5 + (d1.b - 0.5) * 0.3;
  float rockW = smoothstep(uSlopes.z, uSlopes.w, ts);
  float screeW = smoothstep(uSlopes.x, uSlopes.y, ts) * (1.0 - rockW);
  float flatW = 1.0 - rockW - screeW;

  // --- colour
  float hs = vHeight + (d0.b - 0.5) * 24.0;
  vec3 tint = texture(tStrata, vec2(hs * uStrata.x, 0.25)).rgb * 2.0;
  vec3 tintFine = texture(tStrata, vec2(hs * uStrata.z, 0.75)).rgb * 2.0;
  vec3 band = mix(vec3(1.0), tint, uStrata.y) * mix(vec3(1.0), tintFine, uStrata.w);
  vec3 rock = uRock * band;
  vec3 scree = uScree * mix(vec3(1.0), band, 0.35);
  float sandW = smoothstep(uSandRange.x + uSandRange.y, uSandRange.x, vHeight + (d0.a - 0.5) * 900.0);
  vec3 flatC = mix(uDust, uSand, sandW * (0.55 + 0.45 * d0.b));
  vec3 albedo = rock * rockW + scree * screeW + flatC * flatW;
  albedo *= 0.93 + 0.14 * d1.a;
  // Global maps (longitude 0..360 E from the left edge, north in the first row). Longitude
  // jumps by a full turn somewhere, so a map's footprint on screen is worked out from the
  // direction itself (which has no seam) and handed to the sampler.
  vec2 uvA = vec2(atan(up.y, up.x) * 0.15915494, acos(clamp(up.z, -1.0, 1.0)) * 0.31830989);
  vec3 upX = dFdx(up), upY = dFdy(up);
  float kA = 0.15915494 / max(dot(up.xy, up.xy), 1e-5);
  vec2 gx = vec2((up.x * upX.y - up.y * upX.x) * kA, dFdx(uvA.y));
  vec2 gy = vec2((up.x * upY.y - up.y * upY.x) * kA, dFdy(uvA.y));
  if (uAlbedoMap.w > 0.0) {
    // The world's real large-scale brightness and colour: maria, rays, dark sands.
    vec3 tint = textureGrad(tAlbedo, uvA, gx, gy).rgb * uAlbedoMap.rgb;
    tint = mix(vec3(dot(tint, vec3(0.3333))), tint, uAlbedoChroma);
    tint *= min(1.0, uAlbedoMax / max(dot(tint, vec3(0.2126, 0.7152, 0.0722)), 1e-3));
    albedo *= mix(vec3(1.0), tint, uAlbedoMap.w * (1.0 - smoothstep(uAlbedoFade.x, uAlbedoFade.y, abs(up.z))));
  }

  // --- detail normal: grain everywhere, wind ripples on dust (both vanish with distance via mips / footprint)
  vec2 dn = (d1.rg - 0.5) * 0.9 + (d2.rg - 0.5) * 0.8;
  dn *= uDetailStrength * (0.55 + 0.9 * rockW + 0.5 * screeW);
  vec2 wind = vec2(0.82, 0.57);
  float phase = dot(vDetailUv * uRipple.z, wind) * uRipple.x + (d1.b - 0.5) * 9.0 + (d0.b - 0.5) * 30.0;
  float ripFade = fine ? (1.0 - smoothstep(0.5, 1.6, fwidth(phase))) * flatW * (1.0 - sandW * 0.5) : 0.0;
  dn += wind * cos(phase) * uRipple.y * ripFade;
  N = normalize(N + uTanU * dn.x + uTanV * dn.y);

  // --- relief from far away. Outside the sharp landmark patches the heights come from a
  // global elevation map that only knows features some tens of kilometres across, and a
  // chunk's normal map has 120 texels across the chunk: from space every crater wall and
  // canyon side was smoothed away and the planet looked like a painted disc. The world's
  // slope map adds the real relief between its own resolution (or the screen's, if that
  // is coarser) and the coarser of the chunk's texels and what the heights resolve
  // (about 2.5 raster pixels). Near the ground, where the chunks are far finer than the
  // map, it fades out, so the shading never disagrees with the ground underfoot.
  if (uRelief.x * uQuality.w > 0.0) {
    float chunkTexel = uDetail.z * uRipple.z / float(NORMAL_RES) * (1.0 + pk);
    float lodC = log2(chunkTexel / uRelief.y);
    float demRes = exp2(texture(tDemRes, uvA).r * 15.9375);
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

  // --- light
  shadow *= nearShadow(vRel, N);
  // Oren-Nayar roughness describes the grains and clods underfoot; at the scale of a whole
  // disc it kept the limb nearly as bright as the centre (71 % at 72 degrees off the
  // vertical; real Mars is about half). Far ground blends to the world's farRoughness.
  float sigma = mix(uRoughness, uFarRoughness, smoothstep(200.0, 2000.0, uDetail.z * uRipple.z / float(NORMAL_RES)));
  float diffuse = groundDiffuse(N, uSunDir, V, sigma);
  vec3 direct = directSun(planetPos) * shadow * diffuse;
  vec3 ambient = (skyLight(N, up) * ao + planetShine(N)) / PI;
  vec3 col = albedo * (direct + ambient);
  col = aerialPerspective(col, vRel, albedo);      // the haze above depends on how bright the ground is
  fragColor = vec4(col * uExposure, 1.0);
}`;

// Uniforms shared by every chunk material (same objects, by reference).
export function makeTerrainShared(world, textures) {
  const shared = {
    ...lightingUniforms(),
    tStrata: { value: textures.strata }, tDetail: { value: textures.detail },
    uDust: { value: new THREE.Vector3() }, uSand: { value: new THREE.Vector3() },
    uScree: { value: new THREE.Vector3() }, uRock: { value: new THREE.Vector3() },
    uSlopes: { value: new THREE.Vector4() }, uStrata: { value: new THREE.Vector4() },
    uSandRange: { value: new THREE.Vector2() }, uRipple: { value: new THREE.Vector3() },
    uRoughness: { value: 0.5 }, uFarRoughness: { value: 0.5 }, uDetailStrength: { value: 0.5 },
    tAlbedo: { value: textures.white }, uAlbedoMap: { value: new THREE.Vector4(1, 1, 1, 0) }, uAlbedoChroma: { value: 1 }, uAlbedoFade: { value: new THREE.Vector2(2, 3) },
    uAlbedoMax: { value: 1e6 }, tDemRes: { value: textures.white }, tRelief: { value: textures.white }, uRelief: { value: new THREE.Vector4(0, 1, 1, 0) }, uReliefFade: { value: new THREE.Vector2(2, 3) },
  };
  setTerrainSurface(shared, world);
  return shared;
}

// Writes a world's surface numbers into the shared uniforms (also used when switching worlds).
export function setTerrainSurface(shared, world) {
  const s = world.surface, st = s.strata || {};
  shared.uDust.value.set(...s.dust); shared.uSand.value.set(...s.sand);
  shared.uScree.value.set(...s.scree); shared.uRock.value.set(...s.rock);
  shared.uSlopes.value.set(s.slopes.dustMax, s.slopes.screeMin, s.slopes.screeMax, s.slopes.rockMin);
  shared.uStrata.value.set(1 / (st.period || 1000), st.contrast || 0, 1 / (st.finePeriod || 100), st.fine || 0);
  shared.uSandRange.value.set(s.sandBelow ?? -1e9, s.sandFade ?? 1);
  shared.uRipple.value.set(2 * Math.PI / (s.ripples?.wavelength || 1), s.ripples?.strength || 0, DETAIL_TILE);
  shared.uRoughness.value = s.roughness ?? 0.5;
  shared.uFarRoughness.value = s.farRoughness ?? shared.uRoughness.value;
  shared.uDetailStrength.value = s.detailStrength ?? 0.5;
  shared.uPhotometry.value = s.photometry === 'lunar' ? 1 : 0;
  shared.uAlbedoMap.value.w = 0;          // until the world's map has loaded (Terrain.loadAlbedoMap)
  shared.uRelief.value.x = 0;             // until the world's slope map has loaded (Terrain.loadReliefMap)
}

export const DETAIL_TILE = 64;   // metres covered by one repeat of the detail texture at the coarsest scale

export function makeTerrainMaterial(shared, normalTex, shadowTex) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { ...atmosphereDefines(), NORMAL_RES: CONFIG.NORMAL_RES, SHADOW_RES: CONFIG.SHADOW_RES, SPACE_HAZE: 1 },
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      ...shared,
      tNormal: { value: normalTex }, tShadow: { value: shadowTex },
      tParentNormal: { value: normalTex }, tParentShadow: { value: shadowTex }, uParent: { value: new THREE.Vector3() },
      uChunkPlanetPos: { value: new THREE.Vector3() }, uMorph: { value: new THREE.Vector3(1e12, CONFIG.MORPH_START, 0) },
      uDetail: { value: new THREE.Vector4() }, uTanU: { value: new THREE.Vector3() }, uTanV: { value: new THREE.Vector3() },
    },
  });
}
