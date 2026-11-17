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
uniform vec2 uMorph;         // x = distance where this chunk has fully become its parent, y = start fraction
uniform vec4 uDetail;        // xy = offset in tiles, zw = chunk extent in tiles
out vec2 vUv;
out vec2 vGrid;
out vec2 vDetailUv;
out float vHeight;
out vec3 vRel;
void main() {
  vec3 rel = (modelMatrix * vec4(position, 1.0)).xyz;      // camera-relative, planet axes
  float k = clamp((length(rel) / uMorph.x - uMorph.y) / (0.96 - uMorph.y), 0.0, 1.0);
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
uniform sampler2D tStrata;
uniform sampler2D tDetail;
uniform vec3 uDust, uSand, uScree, uRock;
uniform vec4 uSlopes;          // dustMax, screeMin, screeMax, rockMin (tan slope)
uniform vec4 uStrata;          // 1/period, contrast, 1/finePeriod, fine contrast
uniform vec2 uSandRange;       // below altitude, fade
uniform vec3 uRipple;          // 2pi / wavelength (per metre), strength, tile size (m)
uniform float uRoughness;
uniform float uDetailStrength;
uniform vec3 uTanU, uTanV;
in vec2 vUv;
in vec2 vGrid;
in vec2 vDetailUv;
in float vHeight;
in vec3 vRel;
layout(location = 0) out vec4 fragColor;

void main() {
  vec4 nt = texture(tNormal, vUv);
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

  // --- detail normal: grain everywhere, wind ripples on dust (both vanish with distance via mips / footprint)
  vec2 dn = (d1.rg - 0.5) * 0.9 + (d2.rg - 0.5) * 0.8;
  dn *= uDetailStrength * (0.55 + 0.9 * rockW + 0.5 * screeW);
  vec2 wind = vec2(0.82, 0.57);
  float phase = dot(vDetailUv * uRipple.z, wind) * uRipple.x + (d1.b - 0.5) * 9.0 + (d0.b - 0.5) * 30.0;
  float ripFade = fine ? (1.0 - smoothstep(0.5, 1.6, fwidth(phase))) * flatW * (1.0 - sandW * 0.5) : 0.0;
  dn += wind * cos(phase) * uRipple.y * ripFade;
  N = normalize(N + uTanU * dn.x + uTanV * dn.y);

  // --- light
  float shadow = texture(tShadow, (vGrid * float(SHADOW_RES) + 0.5) / float(SHADOW_RES + 1)).r;
  shadow *= nearShadow(vRel, N);
  vec3 direct = directSun(planetPos) * shadow * diffuseON(N, uSunDir, V, uRoughness);
  vec3 ambient = (skyLight(N, up) * ao + planetShine(N)) / PI;
  vec3 col = albedo * (direct + ambient);
  col = aerialPerspective(col, vRel);
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
    uRoughness: { value: 0.5 }, uDetailStrength: { value: 0.5 },
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
  shared.uDetailStrength.value = s.detailStrength ?? 0.5;
}

export const DETAIL_TILE = 64;   // metres covered by one repeat of the detail texture at the coarsest scale

export function makeTerrainMaterial(shared, normalTex, shadowTex) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { ...atmosphereDefines(), NORMAL_RES: CONFIG.NORMAL_RES, SHADOW_RES: CONFIG.SHADOW_RES },
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      ...shared,
      tNormal: { value: normalTex }, tShadow: { value: shadowTex },
      uChunkPlanetPos: { value: new THREE.Vector3() }, uMorph: { value: new THREE.Vector2(1e12, CONFIG.MORPH_START) },
      uDetail: { value: new THREE.Vector4() }, uTanU: { value: new THREE.Vector3() }, uTanV: { value: new THREE.Vector3() },
    },
  });
}
