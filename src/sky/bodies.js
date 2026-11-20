// Sky bodies (moons, planets) in the far pass. A body is drawn as a lit mesh when it is
// big enough on screen to resolve and as a point source of the correct brightness when
// it is not — Earth is a point from Mars and a disc from the Moon with the same code.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../render/globals.js';
import { noise3 } from '../terrain/height/noise.js';
import { ATMO_UNIFORMS, ATMO_COMMON } from '../atmosphere/atmosphereGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { PointSources } from './stars.js';
import { AU_M } from '../worlds/solarSystem.js';

const RECIPES = { rock: 0, oceanWorld: 1, globe: 2 };
const SHELL_HEIGHTS = 8;        // the shell of air round a globe reaches this many scale heights up
const FULL_MAPS_PX = 260;       // a globe this many pixels across gets its full-size maps

// A map wrapped round a globe: rows as stored (north first), mipmaps, repeating in longitude.
// Every map but the colour is optional (clouds, city lights, water, relief).
const MAPS = [['colour', 'tColour'], ['clouds', 'tClouds'], ['lights', 'tLights'], ['water', 'tWater'], ['relief', 'tRelief']];     // a globe's maps and their samplers
function wrapMap(t, srgb) {
  t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (!srgb) t.format = THREE.RedFormat;                 // the grey maps take one byte a pixel
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  return t;
}
// The picture is decoded off the main thread (a 4096 x 2048 JPEG decoded at its first
// draw call was a hitch of its own) and handed to the GPU when it arrives, between frames.
// onLoad(texture), or onLoad(null) when it does not arrive: nothing waits for it for ever.
function mapTexture(url, srgb, renderer, onLoad) {
  const loader = new THREE.ImageBitmapLoader();
  loader.setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  loader.load(import.meta.env.BASE_URL + url, (bitmap) => {
    const t = wrapMap(new THREE.Texture(bitmap), srgb);
    t.needsUpdate = true;
    renderer?.initTexture(t);
    onLoad(t);
  }, undefined, () => { console.warn('map did not load:', url); onLoad(null); });
}
function pixel(r, g, b) { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t; }
const NONE = { tColour: () => pixel(128, 128, 128), tClouds: () => pixel(0, 0, 0), tLights: () => pixel(0, 0, 0), tWater: () => pixel(0, 0, 0), tRelief: () => pixel(128, 128, 128) };

// A world with no solid face to map (a gas giant without a usable picture, a world under
// cloud or haze) gets its colour map made here from its catalogue entry: `bands` is a list
// of [latitude, r, g, b] (degrees, north to south; linear colour), blended between;
// `streaks` (0..1) adds fine east-west streaks and `mottle` soft patches, both seeded.
function bandMap(spec, seed) {
  const W = 1024, H = 512, data = new Uint8Array(W * H * 4), stops = spec.bands;
  const enc = (c) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  const streaks = spec.streaks ?? 0.04, mottle = spec.mottle ?? 0.03;
  for (let j = 0; j < H; j++) {
    const lat = 90 - (j + 0.5) / H * 180;
    let k = 0; while (k < stops.length - 2 && lat < stops[k + 1][0]) k++;
    const a = stops[k], b = stops[k + 1], t = Math.min(1, Math.max(0, (a[0] - lat) / Math.max(1e-6, a[0] - b[0]))), u = t * t * (3 - 2 * t);
    const row = noise3(seed, lat * 0.9, 0.5) * 0.6 + noise3(seed + 9, lat * 3.1, 0.5) * 0.4;      // each latitude a touch lighter or darker
    for (let i = 0; i < W; i++) {
      const lon = i / W * Math.PI * 2, cx = Math.cos(lon), sx = Math.sin(lon);
      const n = noise3(cx * 2.2 + seed, sx * 2.2, lat * 0.06) * mottle + noise3(cx * 9 + seed, sx * 9, lat * 0.9) * streaks * 0.5 + row * streaks;
      const o = (j * W + i) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = enc(Math.max(0, (a[1 + c] + (b[1 + c] - a[1 + c]) * u) * (1 + n)));
      data[o + 3] = 255;
    }
  }
  const t = wrapMap(new THREE.DataTexture(data, W, H), true);
  t.needsUpdate = true;
  return t;
}

// A body far brighter than the scene's exposure allows (the Earth in the lunar night, a
// moon at dusk) keeps its colour: its brightness is rolled off below white, as the eye
// does when it looks at a bright thing in a dark place. In daylight nothing changes.
const GLARE = /* glsl */`
vec3 glare(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  const float lim = 4.0;
  return l > 1e-6 ? c * (lim * (1.0 - exp(-l / lim)) / l) : c;
}`;

const VERT = /* glsl */`
out vec3 vN; out vec3 vObj; out vec3 vDir;
void main() {
  vObj = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDir = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
${ATMO_UNIFORMS}
${ATMO_COMMON}
uniform sampler2D tTransmittance;
uniform float uExposure, uCamRkm;
uniform float uGain;           // below 1 when the body is far brighter than the scene is exposed for (see update)
uniform vec3 uUp;
uniform vec3 uLightDir;        // toward the Sun, at the body
uniform vec3 uLightE;          // solar irradiance at the body (eclipse included)
uniform vec3 uShineDir;        // toward the parent planet (planetshine)
uniform vec3 uShineE;
uniform int uRecipe;
uniform vec3 uAlbedo, uColB, uColC, uColD, uHaze;
uniform vec4 uParams;          // recipe numbers
uniform vec4 uParams2;
in vec3 vN; in vec3 vObj; in vec3 vDir;
layout(location = 0) out vec4 fragColor;

float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
${GLARE}

void main() {
  vec3 N = normalize(vN);
  vec3 V = -normalize(vDir);
  vec3 p = normalize(vObj);
  vec3 albedo; float cloud = 0.0;
  if (uRecipe == 1) {
    // ocean world: uParams = landScale, landBias, cloudScale, cloudCover; uParams2.x = haze strength
    float land = fbm(p * uParams.x + 3.1) + uParams.y - 0.5;
    albedo = mix(uAlbedo, uColB, smoothstep(0.0, 0.04, land));
    albedo = mix(albedo, uColD, smoothstep(0.72, 0.86, abs(p.z)));
    cloud = smoothstep(1.0 - uParams.w, 1.0 - uParams.w + 0.25, fbm(p * uParams.z + vec3(fbm(p * 2.0) * 1.5)) * 1.6);
    albedo = mix(albedo, uColC, cloud);
  } else {
    // rock: uParams = mottling, mottleScale
    albedo = uAlbedo * (1.0 + uParams.x * (fbm(p * uParams.y * 2.0) - 0.5) * 2.0);
  }
  float NL = max(dot(N, uLightDir), 0.0);
  // Lommel-Seeliger-ish for airless dusty bodies (flat disc, no limb darkening), Lambert under haze.
  float NV = max(dot(N, V), 1e-3);
  float diffuse = uRecipe == 1 ? NL / PI : 2.0 * NL / (NL + NV) / (PI * 1.6);
  vec3 col = albedo * (uLightE * diffuse + uShineE * max(dot(N, uShineDir), 0.0) / PI);
  if (uRecipe == 1) {
    float rim = pow(max(1.0 - NV, 0.0), 2.5);
    col += uHaze * uParams2.x * uLightE * NL * (0.12 + rim) / PI;
  }
  // (seen through the home world's air only from inside it: far outside, the table has no answer)
  vec3 T = uCamRkm < uRTop ? mix(texture(tTransmittance, transmittanceUv(uCamRkm, dot(normalize(vDir), uUp))).rgb, vec3(1.0), smoothstep(0.9, 1.0, (uCamRkm - uRBottom) / (uRTop - uRBottom))) : vec3(1.0);
  fragColor = vec4(glare(col * T * uExposure * uGain), 1.0);
}`;

// A real globe: colour, clouds, city lights and water from maps (equirectangular, longitude
// -180..180 left to right, north at the top), thin air over it, the Sun's glint on its
// seas. Numbers come from the body's entry in the catalogue (surface.recipe 'globe').
const GLOBE_FRAG = /* glsl */`
${ATMO_UNIFORMS}
${ATMO_COMMON}
uniform sampler2D tTransmittance;
#define TWO_PI 6.28318530718
uniform sampler2D tColour;     // the day side's colour (sRGB, decoded by the GPU)
uniform sampler2D tClouds, tLights, tWater;      // one grey map each
uniform float uExposure, uCamRkm;
uniform float uGain;           // below 1 when the body is far brighter than the scene is exposed for (see update)
uniform vec3 uUp;
uniform vec3 uLightDir;        // toward the Sun, at the body
uniform vec3 uLightE;          // solar irradiance at the body
uniform vec3 uShineDir, uShineE;
uniform vec3 uOcean;           // the sea's own albedo (the map's seas are near black)
uniform vec3 uCloudCol;        // cloud albedo
uniform vec3 uLights;          // radiance of a fully lit city pixel
uniform vec3 uAirTau;          // vertical optical depth of the air, per colour
uniform vec4 uGlobe;           // x 1 = the colour map is one grey channel, y glint roughness, z glint strength, w 1 = airless dusty ground (no limb darkening)
uniform vec3 uTint;            // what turns the colour map's values into albedo (gain x tint)
uniform float uMapShift;       // 0: the maps start at longitude -180 (Earth's); 0.5: at longitude 0 (every other world's)
uniform vec3 uLightObj;        // toward the Sun in the globe's own axes (the maps' axes)
uniform sampler2D tRelief;     // the ground's slope: east in the top half, north in the bottom (as the terrain's slope map)
uniform float uReliefK;        // how strongly it bends the shading normal (0: no map)
uniform mat4 modelMatrix;      // the globe's own axes -> the scene's
// Bands that drift at their own speeds (a gas giant's belts and zones): the colour map is
// read at a longitude shifted by the band's drift so far. uBands[k] = (sine of the latitude
// of band k's northern edge, shift in turns); bands run north to south. Across an edge the
// two neighbours cross-fade, so nothing shears however long the clock runs.
#define BANDS 14
uniform int uBandN;
uniform vec2 uBands[BANDS];
// Rings (round the globe's equator): their shadow on the globe. tRing = optical depth
// across the rings (red channel, x from the inner to the outer edge); uRing = inner and
// outer radius in the globe's own units (0: no rings), z = optical depth of a full texel.
uniform sampler2D tRing;
uniform vec3 uRing;
in vec3 vN; in vec3 vObj; in vec3 vDir;
layout(location = 0) out vec4 fragColor;
${GLARE}
void main() {
  vec3 p = normalize(vObj);
  vec3 N = normalize(vN), V = -normalize(vDir), L = uLightDir;      // (p is in the globe's own axes, N in the scene's)
  // Map coordinates, with their footprint taken from the direction itself: the longitude
  // jumps by a whole turn at the back of the globe and its own derivatives would draw a seam.
  vec2 uv = vec2(atan(p.y, p.x) / TWO_PI + 0.5 + uMapShift, 0.5 - asin(clamp(p.z, -1.0, 1.0)) / PI);
  vec3 px = dFdx(p), py = dFdy(p);
  float r2 = max(p.x * p.x + p.y * p.y, 1e-6), cz = sqrt(max(1.0 - p.z * p.z, 1e-6));
  vec2 gx = vec2((p.x * px.y - p.y * px.x) / (r2 * TWO_PI), -px.z / (cz * PI));
  vec2 gy = vec2((p.x * py.y - p.y * py.x) / (r2 * TWO_PI), -py.z / (cz * PI));
  vec3 base;
  if (uBandN > 0) {
    float sA = uBands[0].y, sB = sA, w = 0.0;
    const float SOFT = 0.012;
    for (int k = 1; k < BANDS; k++) {
      if (k >= uBandN) break;
      float e = uBands[k].x;
      if (p.z < e + SOFT) { sA = uBands[k - 1].y; sB = uBands[k].y; w = smoothstep(e + SOFT, e - SOFT, p.z); }
    }
    base = textureGrad(tColour, vec2(uv.x - sA, uv.y), gx, gy).rgb;
    if (w > 0.0) base = mix(base, textureGrad(tColour, vec2(uv.x - sB, uv.y), gx, gy).rgb, w);
  } else base = textureGrad(tColour, uv, gx, gy).rgb;
  base = (uGlobe.x > 0.5 ? base.rrr : base) * uTint;
  if (uReliefK > 0.0) {
    // real relief at the day-night line: the slope map tilts the normal (east and north in
    // the globe's axes, turned into the scene's)
    float se = textureGrad(tRelief, vec2(uv.x, uv.y * 0.5), gx, gy * 0.5).r * 2.0 - 1.0;
    float sn = textureGrad(tRelief, vec2(uv.x, 0.5 + uv.y * 0.5), gx, gy * 0.5).r * 2.0 - 1.0;
    vec3 east = normalize(vec3(-p.y, p.x, 0.0) + vec3(1e-6, 0.0, 0.0)), north = cross(p, east);
    vec3 t = mat3(modelMatrix) * (se * abs(se) * east + sn * abs(sn) * north);
    N = normalize(N - uReliefK * t / max(length(mat3(modelMatrix)[0]), 1e-12));
  }
  float water = textureGrad(tWater, uv, gx, gy).r;
  float c0 = textureGrad(tClouds, uv, gx, gy).r;
  // The clouds stand above the ground: the same map a little way toward the Sun is the
  // cloud that shades this spot (a shadow on the sea beside every cloud), and tells which
  // side of a cloud this is (its sunward edge bright, its far side in its own shade).
  vec3 ps = normalize(p + uLightObj * 0.0035);
  vec2 uvs = vec2(atan(ps.y, ps.x) / TWO_PI + 0.5 + uMapShift, 0.5 - asin(clamp(ps.z, -1.0, 1.0)) / PI);
  float c1 = textureGrad(tClouds, uvs, gx, gy).r;
  float cloud = smoothstep(0.04, 0.9, c0);
  float shadow = 1.0 - 0.55 * smoothstep(0.15, 0.8, c1) * (1.0 - cloud);
  float relief = clamp(1.0 + 1.3 * (c0 - c1), 0.55, 1.25);
  float mu0 = dot(N, L), NL = max(mu0, 0.0), mu = max(dot(N, V), 0.02);
  // land and sea
  vec3 alb = max(base, uOcean * water);
  // (airless dusty ground is as bright at the edge of the disc as at its middle)
  if (uRing.y > 0.0 && abs(uLightObj.z) > 1e-4) {
    // the sunbeam that reaches this spot crossed the ring plane here (if it did)
    float t = -vObj.z / uLightObj.z;
    if (t > 0.0) {
      float r = length(vObj.xy + uLightObj.xy * t);
      if (r > uRing.x && r < uRing.y) shadow *= exp(-texture(tRing, vec2((r - uRing.x) / (uRing.y - uRing.x), 0.5)).r * uRing.z / abs(uLightObj.z));
    }
  }
  vec3 col = alb * (uGlobe.w > 0.5 ? 2.0 * NL / (NL + mu) / (PI * 1.6) : NL / PI) * shadow;
  // the Sun's glint on the water: a wide, soft highlight (the sea is rough at this scale)
  vec3 H = normalize(L + V);
  float a2 = uGlobe.y * uGlobe.y, nh = max(dot(N, H), 0.0), dd = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * dd * dd), F = 0.02 + 0.98 * pow(clamp(1.0 - dot(V, H), 0.0, 1.0), 5.0);
  col += vec3(water * shadow * uGlobe.z * D * F * NL / (4.0 * max(mu, 0.15) * max(NL, 0.15) + 1e-3));
  // clouds over both, lit a little past the day-night line (they stand high)
  float cl = max(mu0 + 0.03, 0.0) / 1.03;
  vec3 land = col * uLightE, clouds = uCloudCol * (cl / PI) * relief * uLightE;
  land += alb * uShineE * max(dot(N, uShineDir), 0.0) / PI;
  // the air: a thin layer that scatters blue (single scattering in a flat layer), so the
  // day side hazes over toward the edge and the low Sun reddens the day-night line
  float m = 1.0 / max(mu, 0.05), m0 = 1.0 / max(mu0, 0.05);
  vec3 Tr = exp(-uAirTau * (m + m0));
  float cs = dot(-L, V), day = smoothstep(-0.10, 0.06, mu0);
  vec3 ins = uLightE * (3.0 / (16.0 * PI)) * (1.0 + cs * cs) * (m / (m + m0)) * (1.0 - Tr) * day;
  // (the clouds stand above most of the air: little of it dims or tints them)
  // (... except near the day-night line, where the low Sun's light has crossed a great deal: they turn warm)
  col = mix(land * mix(vec3(1.0), Tr, day), clouds * mix(vec3(1.0), Tr, (0.25 + 0.5 * (1.0 - smoothstep(0.0, 0.35, mu0))) * day), cloud) + ins * (1.0 - 0.6 * cloud);
  // City lights on the night side, under the clouds: faint sprawl to brilliant cores. They
  // are dimmed with the rest (uGain): a picture exposed for the day side shows none; the
  // night side seen on its own shows them.
  // (the map's lowest levels hold only the picture format's noise, which a long exposure
  // would turn into a glowing mottle over the whole night side)
  float lamp = max(textureGrad(tLights, uv, gx, gy).r - 0.05, 0.0) / 0.95;
  vec3 lamps = uLights * lamp * (0.15 + 2.2 * lamp * lamp) * (1.0 - 0.85 * cloud) * (1.0 - smoothstep(-0.14, 0.0, mu0));
  // (seen through the home world's air only from inside it: far outside, the table has no answer)
  vec3 T = uCamRkm < uRTop ? mix(texture(tTransmittance, transmittanceUv(uCamRkm, dot(normalize(vDir), uUp))).rgb, vec3(1.0), smoothstep(0.9, 1.0, (uCamRkm - uRBottom) / (uRTop - uRBottom))) : vec3(1.0);
  fragColor = vec4(glare((col + lamps) * uGain * T * uExposure), 1.0);
}`;

// The air beyond a globe's solid edge: a shell a few scale heights thick, drawn from the
// inside (its far half, so the globe hides all of it but the rim), added to what is there.
const SHELL_VERT = /* glsl */`
out vec3 vDir;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDir = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SHELL_FRAG = /* glsl */`
${ATMO_UNIFORMS}
${ATMO_COMMON}
uniform sampler2D tTransmittance;
uniform float uExposure, uCamRkm;
uniform float uGain;           // below 1 when the body is far brighter than the scene is exposed for (see update)
uniform vec3 uUp;
uniform vec3 uLightDir, uLightE;
uniform vec3 uAirTau;
uniform vec3 uCentre;          // the globe's centre, in the far pass's own scale
uniform vec3 uShell;           // x: the globe's radius in that scale, y: scale height over radius, z: horizon factor sqrt(2 pi R / H)
in vec3 vDir;
layout(location = 0) out vec4 fragColor;
${GLARE}
void main() {
  vec3 d = normalize(vDir);
  float along = dot(uCentre, d);
  vec3 foot = d * along - uCentre;                  // from the centre to the ray's closest point
  float b = length(foot);
  float h = max(b / uShell.x - 1.0, 0.0) / uShell.y;            // height of that point, in scale heights
  vec3 tau = uAirTau * uShell.z * exp(-h);
  vec3 pt = foot / max(b, 1e-6);
  float mu0 = dot(pt, uLightDir), cs = dot(-uLightDir, -d);
  // lit a little past the day-night line; the low Sun's light has crossed more air (redder)
  float lit = smoothstep(-0.18, 0.08, mu0);
  vec3 sunT = exp(-tau * 0.5 * (1.0 - smoothstep(-0.08, 0.18, mu0)));
  vec3 col = uLightE * (3.0 / (16.0 * PI)) * (1.0 + cs * cs) * (1.0 - exp(-tau)) * sunT * lit;
  vec3 T = uCamRkm < uRTop ? mix(texture(tTransmittance, transmittanceUv(uCamRkm, dot(d, uUp))).rgb, vec3(1.0), smoothstep(0.9, 1.0, (uCamRkm - uRBottom) / (uRTop - uRBottom))) : vec3(1.0);
  fragColor = vec4(glare(col * T * uExposure * uGain), 0.0);
}`;


// Rings: a flat annulus in the planet's equatorial plane. Lit from the Sun's side they
// shine by reflection, from the other side by the light that filters through (so the
// dense B ring is dark there and the thin rings bright); the planet's shadow falls
// across them. One row of texture: rgb = colour of the ice, a = optical depth / uRing.z.
const RING_VERT = /* glsl */`
out vec3 vObj; out vec3 vDir;
void main() {
  vObj = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDir = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RING_FRAG = /* glsl */`
uniform sampler2D tRing;
uniform vec3 uRing;            // inner radius, outer radius (the globe's own units), optical depth of a full texel
uniform vec3 uRadii;           // the planet's equatorial and polar radius (x, z)
uniform vec3 uLightObj;        // toward the Sun, in the planet's axes
uniform vec3 uViewObj;         // from the camera to the planet's centre, in the planet's axes (unit)
uniform vec3 uLightE;
uniform float uExposure, uGain;
in vec3 vObj; in vec3 vDir;
layout(location = 0) out vec4 fragColor;
${GLARE}
void main() {
  float r = length(vObj.xy);
  vec4 ring = texture(tRing, vec2((r - uRing.x) / (uRing.y - uRing.x), 0.5));
  float tau = ring.a * uRing.z;
  if (tau < 1e-4) discard;
  // (the view direction in the planet's axes: the same for the whole ring, near enough)
  float mu = max(abs(uViewObj.z), 0.02), mu0 = max(abs(uLightObj.z), 0.004);
  float alpha = 1.0 - exp(-tau / mu);
  bool sameSide = uViewObj.z * uLightObj.z < 0.0;        // (uViewObj points from the eye to the planet)
  float refl = (mu0 / (mu0 + mu)) * (1.0 - exp(-tau * (1.0 / mu0 + 1.0 / mu)));
  float d = abs(mu0 - mu) < 1e-3 ? tau / mu0 * exp(-tau / mu0) : (mu0 / (mu0 - mu)) * (exp(-tau / mu0) - exp(-tau / mu));
  // icy grains throw light back toward the Sun and a little forward
  float cs = dot(normalize(uViewObj), uLightObj);         // 1: looking at the Sun through the rings
  float phase = sameSide ? 0.55 + 0.45 * (1.0 - cs) * 0.5 : 0.25 + 0.9 * pow(max(cs, 0.0), 6.0);
  float I = (sameSide ? refl : abs(d)) * phase;
  // the planet's shadow: does the sunbeam to this grain pass through the (flattened) globe?
  vec3 k = vec3(1.0, 1.0, uRadii.x / uRadii.z), o = vObj * k, l = normalize(uLightObj * k);
  float b = dot(o, l), disc = b * b - (dot(o, o) - uRadii.x * uRadii.x);
  float lit = (b < 0.0 && disc > 0.0) ? 0.0 : 1.0;
  if (b < 0.0) lit = smoothstep(-0.0025, 0.0025, -disc / (uRadii.x * uRadii.x));
  vec3 col = ring.rgb * uLightE * I * lit / PI_R;
  fragColor = vec4(glare(col * uExposure * uGain), alpha);
}`.replace(/PI_R/g, '3.14159265');

// The row of texture a ring system is drawn from. spec.profile: [radius m, optical depth,
// r, g, b] stops from the inner to the outer edge (blended between); spec.ringlets adds
// fine banding (the thousands of ringlets no stop list can hold), seeded.
function ringTexture(spec) {
  const N = 1024, data = new Uint8Array(N * 4), P = spec.profile, r0 = P[0][0], r1 = P[P.length - 1][0];
  let peak = 0; for (const p of P) peak = Math.max(peak, p[1]);
  const full = peak * 1.25, fine = spec.ringlets ?? 0.25;
  const enc = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));
  for (let i = 0; i < N; i++) {
    const r = r0 + (r1 - r0) * (i + 0.5) / N;
    let k = 0; while (k < P.length - 2 && r > P[k + 1][0]) k++;
    const a = P[k], b = P[k + 1], t = Math.min(1, Math.max(0, (r - a[0]) / Math.max(1, b[0] - a[0])));
    let tau = a[1] + (b[1] - a[1]) * t;
    // ringlets: fine structure in proportion to the local depth
    tau *= Math.max(0, 1 + fine * (noise3(r / 420e3 + 3.1, 0.5, 0.5) * 0.9 + noise3(r / 150e3, 7.7, 0.5) * 0.7 + noise3(r / 2600e3, 0.5, 9.9) * 0.6));
    data[i * 4] = enc(a[2] + (b[2] - a[2]) * t); data[i * 4 + 1] = enc(a[3] + (b[3] - a[3]) * t); data[i * 4 + 2] = enc(a[4] + (b[4] - a[4]) * t);
    data[i * 4 + 3] = Math.round(255 * Math.min(1, tau / full));
  }
  const tex = new THREE.DataTexture(data, N, 1);
  tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  // (the shadow on the globe reads the depth from the red channel of a second, grey copy)
  const grey = new Uint8Array(N * 4); for (let i = 0; i < N; i++) { grey[i * 4] = grey[i * 4 + 1] = grey[i * 4 + 2] = data[i * 4 + 3]; grey[i * 4 + 3] = 255; }
  const depth = new THREE.DataTexture(grey, N, 1);
  depth.minFilter = depth.magFilter = THREE.LinearFilter; depth.wrapS = depth.wrapT = THREE.ClampToEdgeWrapping; depth.needsUpdate = true;
  return { tex, depth, r0, r1, full };
}

function lumpyGeometry(def, seed, detail = 12) {
  // three's polyhedra are triangle soup: without shared vertices the normals come out
  // one per face and the day-night edge of a small moon is a staircase of facets.
  const soup = new THREE.IcosahedronGeometry(1, detail);    // 3 380 triangles at 12; a mapped globe is finer (its edge is seen close up)
  soup.deleteAttribute('uv'); soup.deleteAttribute('normal');
  const geo = mergeVertices(soup, 1e-5);
  const pos = geo.attributes.position, s = def.surface || {};
  const lump = s.lumpiness || 0, radii = def.radii || [def.radius, def.radius, def.radius];
  const cr = s.crater;                                  // [size, depth, latitude]: one large dent
  const cdir = cr ? new THREE.Vector3(Math.cos(cr[2] || 0), 0.3, Math.sin(cr[2] || 0)).normalize() : null;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    if (lump) r += lump * (noise3(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3) * 0.7 + noise3(v.x * 3.1, v.y * 3.1 + seed, v.z * 3.1) * 0.3 + noise3(v.x * 7.0, v.y * 7.0, v.z * 7.0 + seed) * 0.12);
    if (cdir) { const d = Math.acos(Math.min(1, v.dot(cdir))) / cr[0]; if (d < 1) r -= cr[1] * (1 - d * d) * (1 - d * d); else if (d < 1.3) r += cr[1] * 0.12 * (1.3 - d) / 0.3; }
    pos.setXYZ(i, v.x * r * radii[0], v.y * r * radii[1], v.z * r * radii[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

export class SkyBodies {
  constructor(world, catalogue, renderer = null) {
    this.world = world; this.cat = catalogue; this.renderer = renderer;
    // The true sky: every body in the catalogue is always there. The one we stand on is
    // simply skipped (it is the terrain).
    this.ids = Object.keys(catalogue).filter((id) => id !== 'sun');
    this.pending = 0;             // maps still loading
    this.group = new THREE.Group();
    this.points = new PointSources(this.ids.length);
    this.points.points.renderOrder = 19;
    this.group.add(this.points.points);
    this.bodies = this.ids.map((id, i) => {
      const def = catalogue[id], s = def.surface || { recipe: 'rock', albedo: [0.1, 0.1, 0.1] };
      const u = {
        ...G,
        uCamRkm: { value: 1 }, uUp: { value: new THREE.Vector3(0, 0, 1) }, uGain: { value: 1 },
        uLightDir: { value: new THREE.Vector3(1, 0, 0) }, uLightE: { value: new THREE.Vector3(1, 1, 1) },
        uShineDir: { value: new THREE.Vector3(1, 0, 0) }, uShineE: { value: new THREE.Vector3(0, 0, 0) },
        uRecipe: { value: RECIPES[s.recipe] ?? 0 },
        uAlbedo: { value: new THREE.Vector3(...(s.albedo || s.ocean || [0.1, 0.1, 0.1])) },
        uColB: { value: new THREE.Vector3(...(s.land || [0, 0, 0])) }, uColC: { value: new THREE.Vector3(...(s.cloud || [0, 0, 0])) },
        uColD: { value: new THREE.Vector3(...(s.ice || [0, 0, 0])) }, uHaze: { value: new THREE.Vector3(...(s.haze || [0, 0, 0])) },
        uParams: { value: s.recipe === 'oceanWorld' ? new THREE.Vector4(s.landScale, s.landBias, s.cloudScale, s.cloudCover) : new THREE.Vector4(s.mottling || 0, s.mottleScale || 1, 0, 0) },
        uParams2: { value: new THREE.Vector4(s.hazeStrength || 0, 0, 0, 0) },
      };
      const globe = s.recipe === 'globe';
      let shell = null, su = null, ring = null, ringU = null;
      if (globe) {
        // maps: stand-ins now; a small copy of each when the body first shows a disc, the
        // full ones when it grows large in view (see update). A colour map given as
        // `bands` is made here instead of downloaded.
        for (const [, name] of MAPS) u[name] = { value: NONE[name]() };
        if (s.maps?.colour?.bands) { u.tColour.value.dispose(); u.tColour.value = bandMap(s.maps.colour, i * 7.3 + 2); }
        u.uOcean = { value: new THREE.Vector3(...(s.ocean || [0, 0, 0])) }; u.uCloudCol = { value: new THREE.Vector3(...(s.cloud || [0.8, 0.8, 0.8])) };
        u.uLights = { value: new THREE.Vector3(...(s.lights || [0, 0, 0])) };
        const air = s.air || { tau: [0, 0, 0], scaleHeight: 8000 };
        u.uAirTau = { value: new THREE.Vector3(...air.tau) };
        const grey = !!s.maps?.colour?.linear, tint = s.tint || [1, 1, 1], gain = s.gain ?? 1;      // (linear: a one-channel map of linear values)
        u.uGlobe = { value: new THREE.Vector4(grey ? 1 : 0, s.glint?.roughness ?? 0.2, s.glint?.strength ?? (s.maps?.water ? 1 : 0), s.airless ? 1 : 0) };
        u.uTint = { value: new THREE.Vector3(tint[0] * gain, tint[1] * gain, tint[2] * gain) };
        u.uMapShift = { value: s.lon0 === 0 ? 0.5 : 0 };
        u.uLightObj = { value: new THREE.Vector3(1, 0, 0) };
        u.uReliefK = { value: 0 };
        u.uBandN = { value: s.drift ? Math.min(14, s.drift.length) : 0 };
        u.uBands = { value: Array.from({ length: 14 }, (_, k) => new THREE.Vector2(s.drift?.[k] ? Math.sin(s.drift[k][0] * Math.PI / 180) : -2, 0)) };
        // rings: their shadow on the globe (uniforms here), and the ring itself (below)
        const rg = def.rings ? ringTexture(def.rings) : null;
        u.tRing = { value: rg ? rg.depth : NONE.tClouds() };
        u.uRing = { value: new THREE.Vector3(rg ? rg.r0 : 0, rg ? rg.r1 : 0, rg ? rg.full : 0) };
        if (rg) {
          const radii = def.radii || [def.radius, def.radius, def.radius];
          ringU = { uExposure: G.uExposure, uGain: u.uGain, uLightE: u.uLightE, uLightObj: u.uLightObj, tRing: { value: rg.tex }, uRing: u.uRing,
            uRadii: { value: new THREE.Vector3(radii[0], radii[1], radii[2]) }, uViewObj: { value: new THREE.Vector3(0, 0, 1) } };
          const rm = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: ringU, vertexShader: RING_VERT, fragmentShader: RING_FRAG,
            side: THREE.DoubleSide, depthTest: true, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
          ring = new THREE.Mesh(new THREE.RingGeometry(rg.r0, rg.r1, 180, 1), rm);
          ring.frustumCulled = false; ring.renderOrder = 7; ring.matrixAutoUpdate = false; ring.visible = false;
          this.group.add(ring);
          // Seen edge-on (always, from a moon in the ring plane) the annulus is thinner than
          // a pixel and breaks into dashes: then the rings are drawn as lines instead, one
          // circle per stop of the profile, each as bright as that part of the rings is deep.
          const pts = [], wts = [], SEG = 256, P = def.rings.profile;
          for (let q = 0; q < P.length - 1; q++) {
            const rr = (P[q][0] + P[q + 1][0]) / 2, wt = Math.min(1, (P[q][1] + P[q + 1][1]) / 2) * (P[q + 1][0] - P[q][0]) / (rg.r1 - rg.r0) * 6;
            if (wt < 0.01) continue;
            for (let k = 0; k < SEG; k++) {
              const a0 = k / SEG * Math.PI * 2, a1 = (k + 1) / SEG * Math.PI * 2;
              pts.push(Math.cos(a0) * rr, Math.sin(a0) * rr, 0, Math.cos(a1) * rr, Math.sin(a1) * rr, 0); wts.push(wt, wt);
            }
          }
          const lg = new THREE.BufferGeometry();
          lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3)); lg.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(wts), 1));
          ringU.uEdge = { value: 0 };
          const lm = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { uExposure: G.uExposure, uGain: u.uGain, uLightE: u.uLightE, uEdge: ringU.uEdge },
            vertexShader: 'in float aW; out float vW; void main() { vW = aW; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }',
            fragmentShader: 'uniform float uExposure, uGain, uEdge; uniform vec3 uLightE; in float vW; layout(location = 0) out vec4 fragColor; void main() { fragColor = vec4(vec3(0.80, 0.74, 0.62) * uLightE * (0.05 * vW * uEdge * uExposure * uGain), 0.0); }',
            depthTest: true, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
          ring.userData.edge = new THREE.LineSegments(lg, lm);
          ring.userData.edge.frustumCulled = false; ring.userData.edge.renderOrder = 8; ring.userData.edge.matrixAutoUpdate = false; ring.userData.edge.visible = false;
          this.group.add(ring.userData.edge);
        }
        if (s.air) {
          su = { ...G, uCamRkm: u.uCamRkm, uUp: u.uUp, uGain: u.uGain, uLightDir: u.uLightDir, uLightE: u.uLightE, uAirTau: u.uAirTau,
            uCentre: { value: new THREE.Vector3() }, uShell: { value: new THREE.Vector3(1, air.scaleHeight / def.radius, Math.sqrt(2 * Math.PI * def.radius / air.scaleHeight)) } };
          const sm = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: su, vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG,
            side: THREE.BackSide, depthTest: true, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
          shell = new THREE.Mesh(new THREE.IcosahedronGeometry(def.radius + SHELL_HEIGHTS * air.scaleHeight, 20), sm);
          shell.frustumCulled = false; shell.renderOrder = 6; shell.matrixAutoUpdate = false; shell.visible = false;
          this.group.add(shell);
        }
      }
      const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: u, vertexShader: VERT, fragmentShader: globe ? GLOBE_FRAG : FRAG, depthTest: true, depthWrite: true });
      const geo = lumpyGeometry(def, i * 13.7 + 1, globe ? 24 : 12), mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      // how far its surface reaches from its centre as drawn (an irregular moon's longest
      // axis and bumps stand well outside its mean radius): what a traveller must stay out of
      let reach = 0;
      for (let k = 0, p = geo.attributes.position; k < p.count; k++) reach = Math.max(reach, Math.hypot(p.getX(k), p.getY(k), p.getZ(k)));
      // maps: 0 = stand-ins, 1 = the small copies asked for, 2 = they are in, 3 = the full ones asked for
      const files = globe && s.maps ? MAPS.filter(([key]) => s.maps[key] && !s.maps[key].bands) : [];
      if (ring) reach = Math.max(reach, def.rings.profile[def.rings.profile.length - 1][0]);        // (a traveller keeps out of the rings too)
      return { id, def, mesh, u, reach, shell, su, ring, ringU, maps: files.length ? s.maps : null, files, got: files.length ? 0 : 2, info: {}, pos: new THREE.Vector3(), rel: new THREE.Vector3(), dist: Infinity };
    });
    this.byId = new Map(this.bodies.map((b) => [b.id, b]));
    this._v = new THREE.Vector3(); this._m = new THREE.Matrix4();
  }

  setWorld(world) { this.world = world; }

  // Fetches a globe's maps: 'far' (the small copies; a map without one waits for 'full')
  // or 'full'. Screenshots wait for them (pending).
  _loadMaps(b, which) {
    b.got = which === 'far' ? 1 : 3;
    const list = b.files.filter(([key]) => b.maps[key][which]);
    let left = list.length;
    if (left === 0 && which === 'far') b.got = 2;
    for (const [key, name] of list) {
      this.pending++;
      mapTexture(b.maps[key][which], key === 'colour' && !b.maps[key].linear, this.renderer, (t) => {
        if (t) { const uni = b.u[name], old = uni.value; uni.value = t; old.dispose(); this.mapsAt = performance.now(); if (key === 'relief') b.u.uReliefK.value = b.def.surface.relief ?? 1; }
        this.pending--;
        if (--left === 0 && which === 'far') b.got = 2;
      });
    }
  }

  // eph: Ephemeris (already updated); rig: camera rig; viewH: render height in pixels.
  update(eph, rig, viewH) {
    const home = this.cat[this.world.body], Rhome = this.world.radius;
    const cam = rig.pos, sunPos = this._sunPos || (this._sunPos = new THREE.Vector3());
    sunPos.set(eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]).multiplyScalar(eph.sunDistance);
    const pxAngle = 2 * Math.tan(rig.fov * Math.PI / 360) / viewH;
    this.points.setFrame(null, rig, viewH);
    const order = [];
    for (const b of this.bodies) {
      const e = eph.bodies.get(b.id);
      b.pos.set(e.pos[0], e.pos[1], e.pos[2]);
      b.rel.subVectors(b.pos, cam);
      b.dist = b.rel.length();
      if (b.ring) { b.ring.visible = false; b.ring.userData.edge.visible = false; }
      if (b.id === this.world.body) { b.mesh.visible = false; if (b.shell) b.shell.visible = false; } else order.push(b);
    }
    order.sort((a, b) => a.dist - b.dist);

    let np = 0, shine = 0;
    G.uShineE.value.set(0, 0, 0);
    const fx = this.points.flux, px = this.points.positions;
    for (let k = 0; k < order.length; k++) {
      const b = order[k], def = b.def;
      const toSun = this._v.subVectors(sunPos, b.pos);
      const dSun = toSun.length(); toSun.divideScalar(dSun);
      // Eclipse: is the home world between this body and the Sun?
      let lit = 1;
      const along = -b.pos.dot(toSun);                       // distance along the sun ray to the home centre's closest point
      if (along > 0 && def.radius < Rhome) {                 // only bodies the home world's shadow can swallow
        const perp = Math.sqrt(Math.max(0, b.pos.lengthSq() - along * along));
        const pen = along * (this.cat.sun.radius / dSun);     // penumbra half-width
        lit = Math.min(1, Math.max(0, (perp - (Rhome - pen)) / Math.max(1, 2 * pen)));
      }
      const E = (AU_M / dSun) ** 2 * lit;
      const sunC = this.cat.sun.color;
      const angRadius = Math.asin(Math.min(1, def.radius / b.dist));
      const dir = b.rel.clone().divideScalar(b.dist);
      // Phase angle (Sun - body - observer)
      const cosA = -dir.dot(toSun), alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
      // Planetshine on the ground: sunlight this body reflects toward us (Lambert-sphere phase law).
      {
        const phiS = (Math.sin(alpha) + (Math.PI - alpha) * Math.cos(alpha)) / Math.PI;
        const eS = E * def.geometricAlbedo * phiS * (def.radius / b.dist) ** 2;
        // (below the home world's horizon it lights nothing on the ground; far above the
        // ground there is no horizon to hide it)
        const above = rig.agl > 0.3 * Rhome ? 1 : Math.min(1, Math.max(0, (dir.dot(this._up(rig)) + 0.02) / 0.07));
        if (eS * above > shine) {
          shine = eS * above;
          const c = def.color || [1, 1, 1];
          G.uShineE.value.set(shine * c[0] * sunC[0], shine * c[1] * sunC[1], shine * c[2] * sunC[2]);
          G.uShineDir.value.copy(dir);
        }
      }
      b.info = { elevation: Math.asin(dir.dot(this._up(rig))) * 180 / Math.PI, phaseAngle: alpha * 180 / Math.PI, pixels: 2 * angRadius / pxAngle, lit };

      // Its maps are fetched when it first shows a disc; until the small copies are in it
      // stays a point of light (a grey ball would flash up otherwise).
      if (b.got === 0 && 2 * angRadius / pxAngle >= 2.0) this._loadMaps(b, 'far');
      if (2 * angRadius / pxAngle < 2.5 || b.got < 2) {
        // Unresolved: point source with the correct integrated brightness (Lambert sphere phase law).
        b.mesh.visible = false; if (b.shell) b.shell.visible = false;
        const phi = (Math.sin(alpha) + (Math.PI - alpha) * Math.cos(alpha)) / Math.PI;
        const flux = E * def.geometricAlbedo * phi * (def.radius / b.dist) ** 2;
        const c = def.color || [1, 1, 1];
        px[np * 3] = dir.x; px[np * 3 + 1] = dir.y; px[np * 3 + 2] = dir.z;
        fx[np * 4] = flux * c[0] * sunC[0]; fx[np * 4 + 1] = flux * c[1] * sunC[1]; fx[np * 4 + 2] = flux * c[2] * sunC[2]; fx[np * 4 + 3] = 1;
        np++;
        continue;
      }
      // Resolved: lit mesh at its true angular size. Far-pass distance encodes depth order.
      const D = 20 + k * 3, scale = D / b.dist;
      const m = b.mesh; m.visible = true;
      this._orientation(b, eph);
      m.matrix.copy(this._m).scale(this._v.set(scale, scale, scale)).setPosition(dir.x * D, dir.y * D, dir.z * D);
      m.matrixWorldNeedsUpdate = true;
      if (b.shell) {
        // the rim of air, once the globe is large enough for it to show
        b.shell.visible = b.info.pixels > 24;
        b.shell.matrix.copy(m.matrix); b.shell.matrixWorldNeedsUpdate = true;
        b.su.uCentre.value.set(dir.x * D, dir.y * D, dir.z * D); b.su.uShell.value.x = def.radius * scale;
      }
      // full-size maps when it grows large (once: they stay)
      if (b.maps && b.got === 2 && b.info.pixels > FULL_MAPS_PX) this._loadMaps(b, 'full');
      if (b.u.uBandN?.value) {
        // each band's drift so far, in turns (degrees a day from the catalogue; days from J2000)
        const days = eph.jd - 2451545.0, dr = def.surface.drift;
        for (let q = 0; q < b.u.uBandN.value; q++) b.u.uBands.value[q].y = ((dr[q][1] * days / 360) % 1 + 1) % 1;
      }
      b.u.uLightDir.value.subVectors(sunPos, b.pos).normalize();
      b.u.uLightE.value.set(E * sunC[0], E * sunC[1], E * sunC[2]);
      b.u.uCamRkm.value = cam.length() * 0.001;
      // A body far brighter than the scene is exposed for (the Earth in the lunar night, a
      // moon at dusk) keeps its colours: the whole of it is dimmed until its sunlit face
      // sits just under white, as the eye does with a bright thing in a dark place. Seen
      // from its night side, or in a scene exposed for daylight, nothing changes.
      {
        const s = def.surface || {}, peak = (s.recipe === 'globe' ? (s.peak ?? 0.8) : 1.6 * Math.max(...(s.albedo || [0.1]))) / Math.PI;     // (peak: the brightest thing on a globe, as an albedo)
        // (a thin crescent or the night side seen on its own is a night view: not dimmed)
        const f = (1 + cosA) / 2, lx = Math.min(1, Math.max(0, (f - 0.08) / 0.22)), litShare = lx * lx * (3 - 2 * lx);
        // (a body only a few pixels across stays a bright point: nothing of its face to save)
        // (sizes as on a picture 1000 pixels tall, whatever resolution the governor renders at)
        const px = 2 * angRadius / (2 * Math.tan(rig.fov * Math.PI / 360)) * 1000, tx = Math.min(1, Math.max(0, (px - 6) / 34)), target = 4 + (0.9 - 4) * tx * tx * (3 - 2 * tx);
        // Large in view, it is also brought up to that level: the exposure meter aims for a
        // middle grey over the whole picture, which left a globe that fills the view dull,
        // its clouds grey. Its sunlit clouds sit just under white whatever the meter does.
        const bx = Math.min(1, Math.max(0, (px - 60) / 240)), most = 1 + 2.5 * bx * bx * (3 - 2 * bx);
        b.u.uGain.value = litShare > 0 ? Math.min(most, target / Math.max(1e-9, G.uExposure.value * E * peak * litShare)) : 1;
      }
      if (b.u.uLightObj) {
        // toward the Sun in the body's own axes (this._m: body -> home)
        const e = this._m.elements, L = b.u.uLightDir.value;
        b.u.uLightObj.value.set(e[0] * L.x + e[1] * L.y + e[2] * L.z, e[4] * L.x + e[5] * L.y + e[6] * L.z, e[8] * L.x + e[9] * L.y + e[10] * L.z);
        if (b.ring) {
          b.ring.visible = true; b.ring.matrix.copy(m.matrix); b.ring.matrixWorldNeedsUpdate = true;
          b.ringU.uViewObj.value.set(e[0] * dir.x + e[1] * dir.y + e[2] * dir.z, e[4] * dir.x + e[5] * dir.y + e[6] * dir.z, e[8] * dir.x + e[9] * dir.y + e[10] * dir.z);
          // (edge-on: the lines take over from the annulus)
          const mz = Math.abs(b.ringU.uViewObj.value.z), ex = Math.min(1, Math.max(0, (0.035 - mz) / 0.03)), edge = b.ring.userData.edge;
          b.ringU.uEdge.value = ex * ex * (3 - 2 * ex);
          edge.visible = ex > 0; edge.matrix.copy(m.matrix); edge.matrixWorldNeedsUpdate = true;
          b.ring.visible = ex < 1;
        }
      }
      // Planetshine from the home world onto its own moons.
      if (def.parent === this.world.body) {
        const dHome = b.pos.length();
        const cosP = b.pos.clone().normalize().dot(new THREE.Vector3(eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]));
        const a = Math.acos(Math.max(-1, Math.min(1, -cosP)));   // phase of the home world seen from the moon
        const phi = (Math.sin(a) + (Math.PI - a) * Math.cos(a)) / Math.PI;
        const s = (AU_M / eph.sunDistance) ** 2 * (home.geometricAlbedo || 0.2) * phi * (Rhome / dHome) ** 2;
        const hc = home.color || [1, 1, 1];
        b.u.uShineE.value.set(s * hc[0], s * hc[1], s * hc[2]);
        b.u.uShineDir.value.copy(b.pos).normalize().negate();
      } else b.u.uShineE.value.set(0, 0, 0);
    }
    // Unused point slots: zero flux.
    for (let i = np; i < this.points.capacity; i++) { fx[i * 4] = fx[i * 4 + 1] = fx[i * 4 + 2] = 0; px[i * 3] = 0; px[i * 3 + 1] = 0; px[i * 3 + 2] = 1; }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.aFlux.needsUpdate = true;
  }

  // The share of the Sun's disc that sky bodies cover, seen from `cam` (home axes): an
  // eclipse. 0 = none, 1 = total. (The home world itself is the night, not an eclipse.)
  sunCover(eph, cam) {
    const s = this._sc || (this._sc = new THREE.Vector3()), v = this._bc || (this._bc = new THREE.Vector3());
    s.set(eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]).multiplyScalar(eph.sunDistance).sub(cam);
    const ds = s.length(), rs = Math.asin(Math.min(1, this.cat.sun.radius / ds));
    s.divideScalar(ds);
    let cover = 0;
    for (const b of this.bodies) {
      if (b.id === this.world.body) continue;
      const e = eph.bodies.get(b.id);
      v.set(e.pos[0], e.pos[1], e.pos[2]).sub(cam);
      const db = v.length();
      if (db >= ds) continue;                                // behind the Sun
      const rb = Math.asin(Math.min(1, b.def.radius / db)), sep = Math.acos(Math.max(-1, Math.min(1, v.dot(s) / db)));
      if (sep >= rs + rb) continue;
      let area;                                              // overlap of two discs (flat: they are small)
      if (sep <= Math.abs(rb - rs)) area = Math.PI * Math.min(rb, rs) ** 2;
      else {
        const cl = (x) => Math.max(-1, Math.min(1, x));
        const a = Math.acos(cl((sep * sep + rs * rs - rb * rb) / (2 * sep * rs))), c = Math.acos(cl((sep * sep + rb * rb - rs * rs) / (2 * sep * rb)));
        area = rs * rs * (a - Math.sin(2 * a) / 2) + rb * rb * (c - Math.sin(2 * c) / 2);
      }
      cover = Math.max(cover, area / (Math.PI * rs * rs));
    }
    return Math.min(1, cover);
  }

  _up(rig) { return (this._upv || (this._upv = new THREE.Vector3())).set(rig.localUp[0], rig.localUp[1], rig.localUp[2]); }

  // Body-fixed -> home-fixed rotation into this._m.
  _orientation(b, eph) {
    const def = b.def, m = this._m;
    if (def.rotation || (def.tidallyLocked && def.parent)) {
      // (a moon without rotation elements keeps its face to its planet: Ephemeris._lockedMatrix)
      const Rb = eph.rotationMatrix(b.id, eph.jd), Rh = eph.icrfToFixed;   // row-major: fixed = R * icrf
      // home <- icrf <- body : Rh * Rb^T
      const e = new Array(9);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) e[r * 3 + c] = Rh[r * 3] * Rb[c * 3] + Rh[r * 3 + 1] * Rb[c * 3 + 1] + Rh[r * 3 + 2] * Rb[c * 3 + 2];
      m.set(e[0], e[1], e[2], 0, e[3], e[4], e[5], 0, e[6], e[7], e[8], 0, 0, 0, 0, 1);
    } else m.identity();
  }
}
