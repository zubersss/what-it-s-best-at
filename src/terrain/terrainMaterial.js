// Terrain surface shader: 3–4 materials blended by slope and height, strata bands on
// cliffs, tiling detail and wind ripples close to the camera. All colours and thresholds
// come from world.surface.
import * as THREE from 'three';
import { WAVE_GLSL, LIFTED, WAVE_STEPS } from '../water/waves.js';
import { CONFIG } from '../config.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { FACES } from './cubeSphere.js';
import { SKY_UNIFORMS } from '../sky/skyGlsl.js';
import { SHADE_READ_GLSL, SHADE_WET_GLSL, CLOUD_SHADE_UNIFORMS, CLOUD_WET_UNIFORMS } from '../sky/cloudShade.js';
import { GRASS_GLSL, FLOWERS_GLSL, GRASS_GROUND } from '../life/grassRules.js';
import { PAINT_LEAF } from '../life/trees.js';
import { FAR_GREEN_GLSL } from '../life/farTreeForm.js';
import { FAR_GROUND } from './farGround.js';

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

// The cloud that stands between a place on the ground and the Sun, and how wet the ground is
// there: both read from the one cloud-shade atlas and the weather field (src/sky/cloudShade.js),
// which work them out once a frame for the whole country round the traveller. The ground used
// to work the heaps out for itself - the day's map plus up to three reads of the cloud noise,
// at its vertices near by and at every pixel of far ground - and the shadow then slid under it
// as the traveller moved, because the cloud base followed the country underfoot. Now it is one
// texture read: cloudShadeLight(rel) gives the share of the Sun and of the sky's light left at
// a place `rel` metres from the camera, from a map fixed to the world.
const CLOUD_OVER_GLSL = SHADE_READ_GLSL;

// The near ground asks about the cloud over it at its vertices: patches up to this many
// detail tiles across (their vertices are then at most 20 m apart, and the cloud's heaps
// are cut from a noise whose cells are 80 m: between two vertices it is all but a straight
// line). The shade's clean edge is still cut at every pixel, from the numbers handed on.
const CLOUD_VERT_TILES = 12.5;

// One instance per drawn chunk; its sixteen numbers (written in terrain.js):
//   aI0 = xyz the chunk's centre relative to the camera, w the distance where it has fully become its parent
//   aI1 = xyz the chunk's centre in planet axes, w the fade from the parent's look just after it first appeared (1 -> 0)
//   aI2 = xy detail-texture offset in tiles, z the chunk's extent in tiles, w its layer in the texture arrays
//   aI3 = x the parent's layer (-1: none loaded), y and z this chunk's corner inside the parent (0 or 0.5), w the cube face
// (the lighting chunk is here for two things that hardly change over a triangle of the
// ground and are worked out at its vertices, not at every pixel: the Sun's light through
// the air above the place, and the air between the eye and it. See the end of main.)
const VERT = /* glsl */`
#define HAZE_UV 1
${LIGHTING_PARS}
in vec2 aGrid;
in vec4 aI0, aI1, aI2, aI3;
uniform highp sampler2DArray tVert;     // xyz = vertex relative to the chunk's centre, w = height above datum
uniform highp sampler2DArray tMorph;    // height change toward the parent LOD
uniform highp sampler2DArray tNormal;   // (its fourth number says where water is, and how deep)
uniform vec4 uSea;
uniform sampler2D tRingColour;          // (its fourth number: how tall the canopy stands, 0.2 m a step)
uniform vec4 uRingColour;
uniform vec3 uShell;         // the forest raised as a whole: from x to y metres away it rises to its height; z: 1 if this world has forests
out vec3 vHMS;               // x the height above the datum, y the morph (0 = this chunk's own shape and shading, 1 = its parent's), z how much of the canopy stands here (0: none, the ground is the ground)
out vec3 vSun;               // the Sun's light reaching the place (directSun)
out vec3 vHazeT;             // the air between the eye and the place: colour * T + L + G * (rho - 1), see hazeAffine (lightingGlsl.js)
out vec3 vHazeL;
out vec3 vHazeG;
out vec4 vCloud;             // x the Sun's share and y the sky's left by the cloud over the place (the atlas, at the vertices of the near ground: CLOUD_VERT_TILES), z how wet the ground is here, w the wind's gusts over the grass (a noise 240 m wide)
${CLOUD_OVER_GLSL}
${SHADE_WET_GLSL}
uniform vec4 uGrassTone;     // (w: how strongly the ground wears the grass; 0: none drawn)
${FLOWERS_GLSL}
out vec2 vFlowerFields;      // the flower rule's two broad noises (grassRules.js: flowerMeadow, flowerHill), for the ground within 900 m
uniform float uPlain;        // 1: the benchmark's flat tone (see the fragment shader): none of the shading below is done
uniform vec4 uWind;          // xyz: where the wind blows to (unit, planet axes), w: its speed (m/s)
uniform vec3 uWave;          // x: the waves' height scale (m), y: 1 if the surface itself is lifted, z: time (s)
uniform vec2 uTide;          // x: the sea's level against the level its shore is mapped at (m, 0 or below: the map is the highest tide)
${WAVE_GLSL}
out vec2 vGrid;
out vec2 vDetailUv;
out vec3 vRel;
flat out vec3 vTanU;         // the cube face's two axes laid on the ground at the chunk's centre
flat out vec3 vTanV;
flat out vec4 vChunk;        // x = layer, y = parent's layer (-1: none), z = extent in detail tiles
flat out vec2 vParentOff;
const vec3 FACE_U[6] = vec3[6](${FACES.map((f) => `vec3(${f.u.map((x) => x.toFixed(1)).join(', ')})`).join(', ')});
const vec3 FACE_V[6] = vec3[6](${FACES.map((f) => `vec3(${f.v.map((x) => x.toFixed(1)).join(', ')})`).join(', ')});
void main() {
  float vMorph, vHeight, vShell;           // (handed on as one: vHMS)
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
  vShell = 0.0;
  if (uShell.z > 0.5 && uRingColour.w > 0.0) {
    // Forest too far off to draw tree by tree: the ground itself rises to the canopy's
    // height there, uneven as crowns are, and is shaded as leaves (fragment shader).
    float lonT = atan(up.y, up.x) * 0.15915494, kv = uRingColour.z * 0.15915494;
    vec2 uvR = vec2(fract(lonT - uRingColour.x) * uRingColour.z, (uRingColour.y - 0.5 * log((1.0 + up.z) / (1.0 - up.z))) * kv);
    vec2 e2 = min(uvR, 1.0 - uvR);
    if (min(e2.x, e2.y) > 0.0) {
      float tall = textureLod(tRingColour, uvR, 0.0).a * 51.0 * smoothstep(0.0, 0.05, min(e2.x, e2.y));
      float k = smoothstep(uShell.x, uShell.y, length(rel)) * smoothstep(2.0, 4.0, pv.w - uSea.y * uSea.x + 4.0 * (1.0 - uSea.x));
      // (no forest on rock faces: the land-cover map's pixels are 600 m wide and know
      // nothing of a cliff inside them; and none on water)
      // (the slope over about a hundred metres, whatever the patch's size, from a coarse
      // level of the normal map: a small steep spot on a wooded hillside is not a cliff, and
      // each one was a pit in the canopy. Patches of different detail then ask about the same
      // stretch of ground along their shared edge; what difference is left their skirts hide.)
      // (never the whole of a patch in one: a small patch on a steep hillside lost its canopy
      // all at once, a square hole in the forest. And the trees' own rule for slopes, of
      // life/treeBlock.js: all of them up to a slope of 0.5, none from 0.95; the canopy
      // used to end at 39 degrees where trees stand to 43, and they stood on bare ground.)
      vec4 nv = textureLod(tNormal, vec3((aGrid * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1), aI2.w), clamp(log2(187.0 / max(aI2.z, 1.0)), 1.0, 3.0));
      // (but a coarse level of a patch's own map knows only its own side of an edge: at
      // the patch's edge its texel is the mean of that side alone, and two neighbours
      // disagreed by enough to cross the test below, a straight cut through a wood seen
      // from 3 km. Toward an edge the slope is taken instead from the fine map along the
      // edge's own line, every 60 m for 240 m, which both neighbours read alike.)
      vec2 ge = min(aGrid, 1.0 - aGrid);
      float wx = 1.0 - smoothstep(0.0, 0.12, ge.x), wy = 1.0 - smoothstep(0.0, 0.12, ge.y), wE = wx + wy - wx * wy;
      if (wE > 0.0) {
        float dg = 60.0 / (aI2.z * float(DETAIL_TILE));
        vec3 ax = vec3(0.0), ay = vec3(0.0);
        for (int i = -2; i <= 2; i++) {
          ax += textureLod(tNormal, vec3((vec2(aGrid.x, clamp(aGrid.y + float(i) * dg, 0.0, 1.0)) * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1), aI2.w), 0.0).xyz;
          ay += textureLod(tNormal, vec3((vec2(clamp(aGrid.x + float(i) * dg, 0.0, 1.0), aGrid.y) * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1), aI2.w), 0.0).xyz;
        }
        vec3 c0 = textureLod(tNormal, vec3((aGrid * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1), aI2.w), 0.0).xyz;
        vec3 ne = (c0 * (wx * wy) + normalize(ax) * (wx * (1.0 - wy)) + normalize(ay) * (wy * (1.0 - wx))) / wE;
        nv.xyz = mix(normalize(nv.xyz), normalize(ne), wE);
      }
      // (a little short of the trees' 43 degrees: the canyon's walls must not go green again)
      k *= smoothstep(0.76, 0.885, dot(normalize(nv.xyz), up)) * (1.0 - step(1.02, textureLod(tNormal, vec3((aGrid * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1), aI2.w), 1.0).a));
      // (crowns: a whole number of them across the detail tile, so patches agree; only near
      // enough that a patch's vertices can carry them: on the far patches the bumps fell
      // between the vertices and came out as stripes down every hillside. By distance,
      // not by patch: neighbours of different detail must agree along their edge.)
      float crowns = 0.72 + 0.14 * (1.0 - smoothstep(160.0, 380.0, length(rel))) * (sin(6.2831853 * (5.0 * vDetailUv.x + 3.0 * vDetailUv.y)) + sin(6.2831853 * (-4.0 * vDetailUv.x + 7.0 * vDetailUv.y)));
      vShell = k * smoothstep(0.5, 5.0, tall);
      rel += up * (tall * crowns * k);
      vRel = rel;
    }
  }
  // (asked only by vertices that can need it: near the sea's level and near the traveller
  // for the tide, in the finest patches for the waves)
  float far = length(rel);
  if (uSea.x > 0.5 && aI2.z < 20.0 && ((uTide.x < 0.0 && pv.w - uSea.y < 6.0 && far < 1000.0) || (uWave.y > 0.5 && aI2.z < 2.5))) {
    float wa = textureLod(tNormal, vec3((aGrid * float(NORMAL_RES) + 0.5) / float(NORMAL_RES + 1), aI2.w), 0.0).a;
    float inland = smoothstep(2.0, 6.0, pv.w - uSea.y);
    // The tide: the sea stands uTide.x metres under the level its shore is mapped at. Its
    // surface comes down to that; where the water was shallower, the bed it leaves bare
    // is drawn at its own depth: the beach slopes down to the water's new edge. The sea
    // only, not lakes and rivers; and near the traveller only (by distance, not by patch:
    // neighbours of different detail must agree along their edge).
    float mapped = max(wa - 1.0, 0.0), drop = min(mapped, -uTide.x * (1.0 - inland));
    rel -= up * (drop * (1.0 - smoothstep(400.0, 1000.0, far)));
    if (uWave.y > 0.5 && aI2.z < 2.5) {
      // Open water rises and falls with its waves (the long ones, where the mesh is fine
      // enough to carry them; none at the shore, where the water is shallow).
      float deep = clamp((mapped - drop - 0.15) / 1.5, 0.0, 1.0) * (1.0 - smoothstep(160.0, 420.0, far));
      deep *= 1.0 - 0.8 * inland;          // (lakes and rivers: small waves)
      if (deep > 0.0) rel += up * (wave(vDetailUv, uWave.z, vec2(dot(uWind.xyz, vTanU), dot(uWind.xyz, vTanV)), uWave.x, ${LIFTED}).z * deep);
    }
    vRel = rel;
  }
  vChunk = vec4(aI2.w, aI3.x, aI2.z, 0.0);
  vParentOff = aI3.yz;
  gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
  vHMS = vec3(vHeight, vMorph, vShell);
  // The Sun's light here, and the air between the eye and here (from inside the air: from
  // space the air is worked out pixel by pixel, the planet's edge needs it). Both were asked
  // at every pixel: eight texture reads of the sixteen a pixel of far ground made.
  // (none of it in the benchmark's flat tone, uPlain: the cost test's row for the ground's
  // shading must see the shading done here as well as the pixels')
  vSun = vec3(0.0);
  vHazeT = vec3(1.0); vHazeL = vec3(0.0); vHazeG = vec3(0.0);
  vCloud = vec4(1.0, 1.0, 0.0, 0.5);
  vFlowerFields = vec2(0.0, 0.5);
  if (uPlain > 0.5) return;
  vSun = directSun(uCamPlanetPos + rel);
  // (a vertex behind the eye has no place in the view: the edge of the view on its side)
  // (the cloud over the place, at the vertices of the near ground: the far ground asks at every
  // pixel, see CLOUD_VERT_TILES. And how wet the ground is here, from the weather field: it was
  // one number for the whole world, the traveller's own.)
  if (aI2.z <= float(CLOUD_VERT_TILES)) vCloud.xy = cloudShadeLight(rel);
  vCloud.z = cloudWet(normalize(uCamPlanetPos + rel), uWeather.z);
  // (the gusts that send waves over the grass: broad, 240 m to a cell of their noise, and
  // seen to 900 m: the patches that near have vertices a few tens of metres apart at most)
  // (and where the meadows are and which hillsides flower: noises 260 and 420 m to the cell,
  // which every pixel of grass within 900 m used to work out for itself before it knew
  // whether a flower was near)
  // (the meadows' two noises to 2.6 km, where the ground's tint of flowers is seen from the
  // air; the gusts only to 1.1 km)
  if (uGrassTone.a > 0.0 && far < 2600.0) { vec3 Pg = uCamPlanetPos + rel; if (far < 1100.0) vCloud.w = flNoise(Pg / 240.0 + vec3(3.0, 11.0, 5.0)); vFlowerFields = vec2(flowerMeadow(Pg), flowerHill(Pg)); }
  if (length(uCamPlanetPos) * 0.001 <= uRTop) hazeAffine(rel, gl_Position.xy / max(abs(gl_Position.w), 1e-6) * 0.5 + 0.5, vHazeT, vHazeL, vHazeG);
}`;

const FRAG = /* glsl */`
${LIGHTING_PARS}
uniform highp sampler2DArray tNormal;   // one layer per chunk: xyz world normal, a = cavity occlusion
uniform lowp sampler2DArray tShadow;    // one layer per chunk: baked sun visibility
// (the parent chunk's layers of the same two arrays: shading morphs toward them exactly as
// the vertices morph toward the parent's shape)
uniform sampler2D tStrata;
uniform sampler2D tDetail;
uniform vec4 uDetailMean;        // the detail texture's last level: the one number it comes to seen from far enough
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
${CLOUD_OVER_GLSL}
uniform vec4 uSea;             // water: x = 1 if the world has any, y the sea's level (m), z how tight the Sun's glint is, w how strong the ripples
uniform vec3 uSeaColor;        // deep water's own colour
uniform vec4 uGrassTone;       // the grass round the traveller (life/grass.js): x how dry, y how much of the ground it covers, z its flowers, w how strongly (0: none drawn)
${GRASS_GLSL}
${FLOWERS_GLSL}
uniform vec4 uWind;            // xyz: where the wind blows to (unit, planet axes), w: its speed (m/s)
uniform vec3 uWave;            // x: the waves' height scale (m), y: 1 if the surface itself is lifted, z: time (s)
uniform float uLitter;         // fallen leaves under the trees, 0..1 by the season
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
in vec3 vRel;
in vec3 vHMS;                  // x height above the datum, y the morph toward the parent, z the forest raised as a whole (vertex shader): how much canopy stands here
in vec3 vSun;                  // the Sun's light reaching the place, and the air between the eye and it (worked out at the vertices)
in vec3 vHazeT;
in vec3 vHazeL;
in vec3 vHazeG;
in vec2 vFlowerFields;         // the flower rule's two broad noises, worked out at the vertices (within 1 100 m)
in vec4 vCloud;                // x the Sun's share and y the sky's left by the cloud over the place (the atlas, at the vertices of the near ground), z how wet the ground is here, w the wind's gusts over the grass
flat in vec3 vTanU;
flat in vec3 vTanV;
flat in vec4 vChunk;           // x = layer, y = parent's layer (-1: none), z = extent in tiles of DETAIL_TILE metres
flat in vec2 vParentOff;       // this chunk's corner inside the parent (0 or 0.5)
uniform vec2 uTide;          // x: the sea's level against the level its shore is mapped at (m, 0 or below)
uniform float uAirRelief;    // the relief light of far ground (a world's look.reliefLight; 0: none)
uniform float uPlain;        // 1: the ground in one flat tone (the benchmark's cost test: its shading apart from its triangles)
layout(location = 0) out vec4 fragColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// A forest seen from above is crowns: domes side by side, each lit on its sunward side,
// dark in the gaps between. cells: crowns across the 64 m detail tile (a whole number). The
// crowns are different in every tile of a block of DETAIL_PERIOD tiles a side (each patch
// knows its tile modulo that many): the same 64 crowns in every tile were a cloth woven in
// squares, seen from the air. Returns xy: the surface's tilt (outward from the
// middle of the nearest crown, along the tile's two axes); z: how high in the crown (0 in a
// gap, 1 on its top); w: a number of the crown's own.
// Not a net (the first thing one saw of a wood from 300 m at a phone's density was the
// lattice: domes all of a size in straight rows): the rows are bent by a long wave (one
// across the tile each way, so patches agree; never stretching a dome by more than a fifth:
// at 0.4 of a cell, two to a tile, the domes were streaks), the crowns are from 0.3 to 0.66
// of a cell in radius, and one cell in ten has none (a gap where the ground shows dark). (The block searched is 2 x 2 cells: a crown's centre is at most 0.33 of a cell from
// its cell's middle and its radius at most 0.66, so no crown of a cell outside the block can
// reach the point: 0.66 <= 1 - 0.33. Larger, and a crown would be cut along a lattice line.)
vec4 crowns(vec2 uv, float cells) {
  vec2 p = uv * cells;
  p += min(0.3, 0.0225 * cells) * vec2(sin(6.2831853 * (uv.y + uv.x)), sin(6.2831853 * (uv.x - uv.y)));
  vec2 b = floor(p - 0.5);
  vec4 best = vec4(0.0, 0.0, 0.0, 0.5); float hb = -1e3;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 c = b + vec2(float(i), float(j)), w = mod(c, cells * float(DETAIL_PERIOD));
    vec3 h = fract(sin(vec3(dot(w, vec2(127.1, 311.7)), dot(w, vec2(269.5, 183.3)), dot(w, vec2(419.2, 371.9)))) * 43758.5453);
    if (fract(h.z * 17.31) < 0.1) continue;
    vec2 d = p - (c + 0.5 + (h.xy - 0.5) * 0.66);
    float r = 0.3 + 0.36 * h.z, hgt = 1.0 - dot(d, d) / (r * r);
    if (hgt > hb) { hb = hgt; best = vec4(d / (r * r), max(hgt, 0.0), fract(h.z * 7.31)); }
  }
  return best;
}

// Pattern level below which a share c of the ground lies (the pattern is roughly normal
// around 0.5 with the spread uCoverPattern.w; logistic fit of its distribution).
float coverLevel(float c) {
  c = clamp(c, 1e-3, 1.0 - 1e-3);
  return 0.5 + uCoverPattern.w * log(c / (1.0 - c));
}

${ALBEDO_RANGE_GLSL}

// ---- THE GROUND FROM AFAR: its look, one function a thing. Change the look in these; the
// ---- branches that decide where each runs are in main and need not be touched.
// The far canopy's own colour (the forest raised as a whole), before its crowns' light and
// shade. tint: the land's colour map there over its mean; c1, c2: two reads of the detail
// tile, about zero (five repeats a tile, and one); turn: the season's turning, 0..1; dist:
// metres from the eye.
// ONE FOREST IN ONE GREEN: the canopy is the crowns of the trees that stand out of it (the
// far forest, life/farForest.js), so it is their green by their rule, at every distance: a
// leaf as the trees have it (a species' leaf albedo x 0.61, through paintLeaf in the painted
// look, x 1.12 for a crown's top, x 0.76 for the tone of the trees' cut-out), then the far
// olive (farGreen, life/farTreeForm.js). The land's colour map is not in it: with 60 % of
// the map's tint the canopy was gold at the opening place and blue green in the north wood,
// and the trees on it specks of another colour in both.
${PAINT_LEAF}
${FAR_GREEN_GLSL}
vec3 farCanopyColour(vec3 tint, vec3 c1, vec3 c2, float turn, float dist) {
  vec3 leaf = vec3(0.045, 0.085, 0.03) * 0.61;
  if (uPaint.x > 0.0) leaf = paintLeaf(leaf);
  vec3 leaves = farGreen(leaf * (1.12 * 0.76), dist) * (0.85 + 0.5 * (c2.b + 0.5 * c1.b));
  // (in their season, in patches: the trees that turn among those that do not. Few patches:
  // turn is 1 from autumn to the end of winter, and with two thirds of the canopy turned a
  // wood of firs and pines, which keep their needles, was gold and rust all winter under
  // green trees: the gold scales of the opening place in its first morning, which is the
  // last day of its winter. The canopy does not know what grows in it; one patch in six
  // turns, as the aspens and cottonwoods among Haven's conifers do.)
  return mix(leaves, mix(vec3(0.17, 0.10, 0.02), vec3(0.13, 0.035, 0.015), smoothstep(-0.1, 0.25, c1.r)) * (0.8 + 0.6 * (c2.b + 0.5)), turn * 0.85 * smoothstep(0.2, 0.34, c2.r + 0.5 * c1.g));
}
// The far canopy's grain: how it tilts the surface, along the tile's two axes, where a
// pixel is narrower than the canopy's unevenness (nearC 1: all of it; 0: none).
// (Half of what it was, and the crowns' tilt under half: tilted hard, every dome had a side
// full in a low Sun's orange and a side with none of it, gold scales with violet gaps. A
// crown's light and dark is in its colour now, farCrownShade: the same green, lighter and
// darker, as the far trees' tops are.)
vec2 farCanopyGrain(vec3 c1, vec3 c2, float nearC) { return (c1.rg + 0.7 * c2.rg) * (0.8 * nearC); }
// A crown's or a stand's share of the canopy's colour: cr from crowns(); stand: true for the
// stands (21 m), false for single crowns (8 m). Its tilt is cr.xy times farCrownTilt.
float farCrownShade(vec4 cr, bool stand) {
  return stand ? (0.7 + 0.42 * smoothstep(0.0, 0.6, cr.z)) * (0.84 + 0.32 * cr.w) : (0.4 + 0.78 * smoothstep(0.0, 0.5, cr.z)) * (0.76 + 0.48 * cr.w);
}
float farCrownTilt(bool stand) { return stand ? 0.2 : 0.3; }
// The grass the ground wears beyond its blades, and under them: dry 0..1, grain: a read of
// the detail tile (0..1).
// THE STEPPE FROM ABOVE: from 90 m up no blade is drawn, and the grass was one even ochre.
// Open grassland from the air is a scatter of dark shrubs a few metres across and paler
// patches of bare soil where it is dry. Each is drawn as a departure from its own mean
// (terrain/farGround.js), so that the land's tone is the same at every height and every
// distance, and only the pattern fades: where a patch would be under two pixels, and near
// the eye, under the blades (on foot; from 150 m up nothing of the ground is that near).
// (Review groundfar2: a fade of the whole colour by distance from the eye was a plain disc
// under the traveller and a ring of tone at 250-500 m; one picture of the detail tile tiled
// every 21 m and 91 m was a lattice from the air; a scale of 0.7 a tile broke along the
// patches' edges; a grain a metre across read from a texture whose largest feature is 26 cm
// could not show, and is gone.)
vec3 farGrassColour(float dry, float grain) {
  vec3 c = grassColour(dry, 0.62) * (0.82 + 0.36 * grain);
  float fw = fwidth(vDetailUv.x) + fwidth(vDetailUv.y);          // (detail tiles, 64 m, a pixel)
  float show = smoothstep(40.0, 150.0, length(vRel));
  // Bare soil, in patches some 6 to 18 m across, more of it the drier: the detail tile's
  // large blobs at a fixed level of its smaller copies, two reads turned against each other
  // and against the cube face's axes (every number a sixteenth of a tile, which the patches
  // agree on), so no repeat lines up into rows.
  float kB = (1.0 - smoothstep(0.09, 0.18, fw)) * show;
  if (kB > 0.0) {
    vec2 uA = vec2(dot(vDetailUv, vec2(0.75, 0.25)), dot(vDetailUv, vec2(-0.25, 0.75))) + 0.13;
    vec2 uB = vec2(dot(vDetailUv, vec2(0.3125, -0.125)), dot(vDetailUv, vec2(0.125, 0.3125))) + 0.61;
    float bare = smoothstep(0.545, 0.605, 0.6 * textureLod(tDetail, uA, 4.0).b + 0.4 * textureLod(tDetail, uB, 4.0).b);
    c = mix(c, vec3(0.30, 0.22, 0.11) * (0.85 + 0.3 * grain), 0.42 * smoothstep(0.2, 0.8, dry) * kB * (bare - ${FAR_GROUND.soilMean.toFixed(3)}));
  }
  // Shrubs: dark rounded clumps 2 to 5 m across, each in a place of its own (crowns() in
  // 4 m cells: a hash a cell, nothing repeats within a kilometre), in clusters and gaps by
  // the detail tile's largest blobs (205 m apart).
  float kS = (1.0 - smoothstep(0.03, 0.06, fw)) * show;
  if (kS > 0.0) {
    vec4 sb = crowns(vDetailUv + vec2(0.19, 0.53), 16.0);
    float gate = clamp(0.12 + 0.8 * (textureLod(tDetail, vDetailUv * 0.3125 + vec2(0.29, 0.83), 4.0).b - 0.5), 0.0, 0.4);
    float shrub = smoothstep(0.05, 0.35, sb.z) * step(sb.w, gate);
    c = mix(c, vec3(0.04, 0.05, 0.025), 0.8 * kS * (shrub - ${FAR_GROUND.shrubMean.toFixed(3)}));
  }
  return c;
}

void main() {
  if (uPlain > 0.5) { fragColor = vec4(vec3(0.05), 1.0); return; }
  float vHeight = vHMS.x, vMorph = vHMS.y, vShell = vHMS.z;
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
    // (each of the two layers is read only where it can still show: where a pixel is so
    // wide on the ground that the sampler would answer with the texture's last level, one
    // number, that number is used and nothing is read. The picture is the same;
    // seen at a low angle that is all the ground beyond some 90 m for the fine layer and
    // 300 m for the coarse one. DETAIL_LAST: see makeTerrainMaterial.)
    vec4 a, b;
    if (w.z > 0.0) {
      float f2 = max(dot(gx, gx), dot(gy, gy));
      a = uDetailMean; b = uDetailMean;
      if (f2 < DETAIL_LAST / 81.0) { a = textureGrad(tDetail, vDetailUv * 9.0, gx * 9.0, gy * 9.0); if (f2 < DETAIL_LAST / 6889.0) b = textureGrad(tDetail, vDetailUv * 83.0, gx * 83.0, gy * 83.0); }
      d1 += (a - 0.5) * w.z; d2 += (b - 0.5) * w.z;
      grain += (uTanU * ((a.r - 0.5) * 0.9 + (b.r - 0.5) * 0.8) + uTanV * ((a.g - 0.5) * 0.9 + (b.g - 0.5) * 0.8)) * w.z;
    }
    if (w.x > 0.0) {             // a face looking along U: along V and up
      vec2 uv = vec2(vDetailUv.y, hy), sx = vec2(gx.y, hg.x), sy = vec2(gy.y, hg.y);
      float f2 = max(dot(sx, sx), dot(sy, sy));
      a = uDetailMean; b = uDetailMean;
      if (f2 < DETAIL_LAST / 81.0) { a = textureGrad(tDetail, uv * 9.0, sx * 9.0, sy * 9.0); if (f2 < DETAIL_LAST / 6889.0) b = textureGrad(tDetail, uv * 83.0, sx * 83.0, sy * 83.0); }
      d1 += (a - 0.5) * w.x; d2 += (b - 0.5) * w.x;
      grain += (uTanV * ((a.r - 0.5) * 0.9 + (b.r - 0.5) * 0.8) + up * ((a.g - 0.5) * 0.9 + (b.g - 0.5) * 0.8)) * w.x;
    }
    if (w.y > 0.0) {             // a face looking along V: along U and up
      vec2 uv = vec2(vDetailUv.x, hy), sx = vec2(gx.x, hg.x), sy = vec2(gy.x, hg.y);
      float f2 = max(dot(sx, sx), dot(sy, sy));
      a = uDetailMean; b = uDetailMean;
      if (f2 < DETAIL_LAST / 81.0) { a = textureGrad(tDetail, uv * 9.0, sx * 9.0, sy * 9.0); if (f2 < DETAIL_LAST / 6889.0) b = textureGrad(tDetail, uv * 83.0, sx * 83.0, sy * 83.0); }
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
  float canopyTall = 0.0;        // how tall the trees stand here (m; from the land-cover picture)
  float canopyShade = 0.0;       // how much of the sky a closed canopy hides from the ground here
  float woodAir = 0.0;           // how much this is forest (its floor, or its canopy far off): for the air of a wood
  vec3 mapTint = vec3(1.0);
  float mapW = 0.0;
  if (uAlbedoMap.w > 0.0) {
    // (the world's own map is read only where the finer one round the traveller does not
    // cover the place whole: where it does, nothing of the world's map is left in the colour)
    vec3 raw = vec3(0.0);
    float ringW = 0.0;
    if (uRingColour.w > 0.0) {
      // (Mercator: columns even in longitude, rows in atanh(sin(latitude)))
      float oz = max(1.0 - up.z * up.z, 1e-6), kv = uRingColour.z * 0.15915494;
      vec2 uvR = vec2(fract(uvA.x - uRingColour.x) * uRingColour.z, (uRingColour.y - 0.5 * log((1.0 + up.z) / (1.0 - up.z))) * kv);
      vec2 e2 = min(uvR, 1.0 - uvR);
      float rw = smoothstep(0.0, 0.07, min(e2.x, e2.y)) * uRingColour.w;
      if (rw > 0.0) { vec4 ring = textureGrad(tRingColour, uvR, vec2(gx.x * uRingColour.z, -upX.z / oz * kv), vec2(gy.x * uRingColour.z, -upY.z / oz * kv)); raw = ring.rgb; ringW = rw; canopyTall = ring.a * 51.0 * rw; }
    }
    if (ringW < 1.0) raw = mix(textureGrad(tAlbedo, vec2(uvA.x + uAlbedoShift, uvA.y), gx, gy).rgb, raw, ringW);
    raw *= uAlbedoMap.rgb;
    vec3 t = mix(albedoRange(raw, uAlbedoRange), raw, farW);
    mapW = uAlbedoMap.w * (1.0 - smoothstep(uAlbedoFade.x, uAlbedoFade.y, abs(up.z)));
    mapTint = mix(vec3(1.0), mix(vec3(dot(t, vec3(0.3333))), t, uAlbedoChroma), mapW);
  }

  // --- colour
  float hs = vHeight + (d0.b - 0.5) * 24.0;
  // How dark the map is here: dark ground is bare rock and sand, bright ground is mantled in dust.
  float dark = clamp((uCover.x - dot(mapTint, vec3(0.3333))) / (uCover.x - uCover.y), 0.0, 1.0);
  // Where dust mantles everything, rock and scree wear its hue (at their own brightness).
  float hue = mix(uRockHue.x, uRockHue.y, dark);
  vec3 dustHue = uDust / luma(uDust);

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
  // The bands of the rock: read only where one can show (on rock and scree; on gentle ground
  // only on worlds whose dust shows them, or where bedrock lies bare): most ground is gentle.
  vec3 band = vec3(1.0);
  if (rockW + screeW > 0.0 || uStrataFlat > 0.0 || bedM > 0.0) {
    // (the strata's picture has one level: read as that, it needs no footprint, which
    // inside a branch it could not have)
    vec3 tint = textureLod(tStrata, vec2(hs * uStrata.x, 0.25), 0.0).rgb * 2.0;
    vec3 tintFine = textureLod(tStrata, vec2(hs * uStrata.z, 0.75), 0.0).rgb * 2.0;
    band = mix(vec3(1.0), tint, uStrata.y) * mix(vec3(1.0), tintFine, uStrata.w);
  }
  // (on gentle ground the bands follow the height, so from far away they would draw
  // contour lines across the plains: they show near the ground only)
  vec3 rock = mix(uRock, dustHue * luma(uRock), hue) * band;
  vec3 scree = mix(uScree, dustHue * luma(uScree), hue) * mix(vec3(1.0), band, 0.35);
  vec3 bedrock = mix(uBedrock, dustHue * luma(uBedrock), hue);
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
    float nearFade = smoothstep(-5.0, -3.0, lodC);
    // (near the ground it adds nothing: none of the rest is worked out there)
    float lodRef = lodC, lodF = 1e3;
    if (nearFade > 0.0) {
      float demRes = exp2(demLog2Res(fract(uvA.x) * 360.0, 90.0 - uvA.y * 180.0));
      lodRef = max(lodC, log2(2.5 * demRes / uRelief.y));
      vec2 ts = vec2(uRelief.z, uRelief.z * 0.5);
      lodF = max(0.5 * log2(max(dot(gx * ts, gx * ts), dot(gy * ts, gy * ts))), 0.0);
    }
    if (lodRef > lodF + 0.05 && nearFade > 0.0) {
      vec2 dS = reliefSlope(uvA, lodF) - reliefSlope(uvA, lodRef);
      vec3 east = normalize(vec3(-up.y, up.x, 0.0) + vec3(1e-6, 0.0, 0.0)), north = cross(up, east);
      float k = uRelief.x * nearFade * (1.0 - smoothstep(uReliefFade.x, uReliefFade.y, abs(up.z)));
      N = normalize(N - k * (dS.x * east + dS.y * north));
    }
  }

  // --- forest: under the trees the ground is litter and shade
  if (canopyTall > 0.3) {
    float wooded = smoothstep(0.5, 5.0, canopyTall) * flatW;
    woodAir = max(vShell, smoothstep(5.0, 14.0, canopyTall) * flatW);
    // (where the canopy raised as a whole is all of the surface, nothing of the floor shows)
    if (vShell < 1.0) {
      {
        // open country is grass in patches; under a closed canopy it is litter and shade
        vec3 g1 = texture(tDetail, vDetailUv * 0.5).rgb, g2 = texture(tDetail, vDetailUv * 4.0).rgb;
        float veg = smoothstep(0.3, 3.0, canopyTall) * flatW * (1.0 - vShell), tuft = smoothstep(0.35, 0.65, 0.6 * g1.r + 0.4 * g2.g);
        vec3 grass = vec3(0.070, 0.095, 0.030) * mix(vec3(1.0), mapTint, 0.5) * (0.8 + 0.5 * g2.b);
        vec3 litter = vec3(0.085, 0.070, 0.042) * mix(vec3(1.0), mapTint, 0.4);
        albedo = mix(albedo, mix(grass, litter, smoothstep(4.0, 14.0, canopyTall) * (0.5 + 0.5 * tuft)), veg * (0.45 + 0.35 * tuft));
      }
      // (under a closed canopy little of the sky is seen, and what light comes down has
      // come through leaves)
      canopyShade = smoothstep(6.0, 16.0, canopyTall) * flatW * (1.0 - vShell);
      ao *= mix(1.0, 0.55, canopyShade);
      if (uLitter > 0.0) {
        // fallen leaves: a scatter of them, thicker as the season goes on
        vec3 f1 = texture(tDetail, vDetailUv * 23.0).rgb, f2 = texture(tDetail, vDetailUv * 61.0).rgb;
        float lie = smoothstep(0.70 - 0.22 * uLitter, 0.80 - 0.22 * uLitter, 0.6 * f1.r + 0.4 * f2.g) * wooded * (1.0 - vShell) * (1.0 - smoothstep(0.004, 0.03, fwidth(vDetailUv.x) + fwidth(vDetailUv.y)));
        albedo = mix(albedo, mix(vec3(0.17, 0.11, 0.035), vec3(0.13, 0.05, 0.03), smoothstep(0.35, 0.7, f1.b)), lie * 0.6);
      }
    }
  }

  // =====================================================================================
  // THE GROUND FROM AFAR, 1: the forest raised as a whole. Where the forest is too far off
  // to be drawn tree by tree the ground itself stands at the canopy's height (vertex
  // shader, uShell) and is shaded here as that canopy: leaves, uneven, darker between
  // crowns. vShell: how much of the surface is canopy (0: none; the block is skipped).
  // It reads: N, V, up, dist, mapTint, vDetailUv, uLitter, uTanU / uTanV; it writes: N
  // (the crowns' shapes), albedo (the leaves' colour, by vShell * ownC) and ao.
  // What a far wood looks like is decided in this block and in the functions it calls
  // (farCanopyColour, farCanopyGrain, farCrownShade, farCrownTilt, crowns; above main),
  // and nowhere else in this shader.
  // (THE GROUND FROM AFAR, 2 is the land's painted patches, further down; 3 the relief
  // light, in the lighting.)
  // =====================================================================================
  float shellOut = vShell;      // (how much of the ground here is canopy, the broken edge counted)
  if (canopyTall > 0.3 && vShell > 0.0) {
    vec3 c1 = texture(tDetail, vDetailUv * 5.0).rgb - 0.5, c2 = texture(tDetail, vDetailUv * 1.0).rgb - 0.5;
    float fwC = fwidth(vDetailUv.x) + fwidth(vDetailUv.y);
    // Where the crowns are under a pixel (from 3 km up, and out to some tens of km), the wood
    // is clumps: domes some 43 m across (one and a half to a tile), a dome each, as the far
    // trees' spread crown tops are where they end (6 to 8 crown widths, a quarter of a
    // closed wood's ground), lighter toward the Sun, dark in the gaps; and the wood's edge,
    // where the land-cover map's soft steps were, broken along them. Gone where a clump is
    // under two pixels, and beyond 40 km.
    float kz = smoothstep(0.05, 0.16, fwC) * (1.0 - smoothstep(0.3, 0.9, fwC)) * (1.0 - smoothstep(20000.0, 40000.0, dist));
    vec4 cz = vec4(0.0), cg = vec4(0.0), cr = vec4(0.0);
    if (kz > 0.0) cz = crowns(vDetailUv + 0.71, 1.5);
    float nearC = 1.0 - smoothstep(0.03, 0.5, fwidth(vDetailUv.x) + fwidth(vDetailUv.y));
    vec2 cgn = farCanopyGrain(c1, c2, nearC);
    N = normalize(N + (uTanU * cgn.x + uTanV * cgn.y) * vShell);
    // (a canopy seen from the side shows the sides of its crowns: lit with the Sun behind
    // the eye, dark against it, as the trees drawn one by one are; from straight above, its top)
    N = normalize(N + (V - up * dot(V, up)) * (1.1 * vShell));
    vec3 leaves = farCanopyColour(mapTint, c1, c2, uLitter, dist);
    // (not from far off: there the forest is what the picture from space shows, not one
    // flat green laid over it in blocks: the canopy's map has pixels a kilometre wide)
    // (by distance, not by the patch's texel: a patch a step finer than its neighbours was
    // a square of darker green in the land, seen from 30 km)
    float ownC = 1.0 - smoothstep(3000.0, 19000.0, dist);
    // Crowns, 8 m apart, and the stands they grow in, 21 m: where one is larger than a
    // pixel or so it is a dome with its own light and shade and its own green, and the
    // gaps between are dark. (Without them the far forest was one even green from the
    // air: "a green plot of land", the owner said, and no trees.)
    {
      // (a crown fades out between five pixels and one and a half: 0.25 / fwC pixels across)
      float kc = (1.0 - smoothstep(0.05, 0.16, fwC)) * vShell * ownC, kg = (1.0 - smoothstep(0.14, 0.42, fwC)) * vShell * ownC;
      // (seen at a low angle a dome is a flat oval, and a wood of them one dark oval stamped
      // over and over, "like bubble wrap": the single crowns give way to the stands there)
      kc *= smoothstep(0.12, 0.45, dot(V, up));
      // (and within the far trees' reach the trees are the crowns: the canopy under them is
      // the dark between them, its own domes only a hint, or each tree stood on an oval of
      // its own, the same oval over and over)
      // (neither the single crowns, 8 m, nor the stands, 21 m, within the far trees' reach: the
      // trees' own tops are the crowns there. With the crowns, an even field of small round
      // blobs, "bubble wrap"; with the stands alone, their tilted domes met along straight
      // lines, large angular facets. The wood's larger tones come from the shared tone below.)
      kc *= smoothstep(3000.0, 4500.0, dist); kg *= smoothstep(3000.0, 4500.0, dist);
      if (kg > 0.0) {
        cg = crowns(vDetailUv + 0.37, 3.0);
        N = normalize(N + (uTanU * cg.x + uTanV * cg.y) * (farCrownTilt(true) * kg));
        leaves *= mix(1.0, farCrownShade(cg, true) / ${FAR_GROUND.standMean.toFixed(3)}, kg);
      }
      if (kc > 0.0) {
        cr = crowns(vDetailUv, 8.0);
        // (strongly: at a phone's pixel a crown is a few pixels, and a faint one was a net
        // laid over the forest, not trees)
        N = normalize(N + (uTanU * cr.x + uTanV * cr.y) * (farCrownTilt(false) * kc));
        leaves *= mix(1.0, farCrownShade(cr, false) / ${FAR_GROUND.crownMean.toFixed(3)}, kc);
      }
    }
    // The wood's edge: where the land-cover map thins the canopy out, it thins into scattered
    // crowns, the tops of the finest crowns one can see standing longest, each with a clean
    // edge (as a soft ramp the edge was an airbrushed blur, and its half-canopy half-ground
    // colour a glowing yellow-olive fringe along every wood). (The domes' heights average
    // FAR_GROUND.clumpZ at every scale: the edge stays where the map puts it.)
    // (the single crowns only where they were worked out: within 3 km they are not, and read
    // as nought they opened the canopy in holes along its triangles, straight-edged facets)
    float kcE = (1.0 - smoothstep(0.05, 0.16, fwC)) * smoothstep(0.12, 0.45, dot(V, up)) * smoothstep(3000.0, 4500.0, dist), kgE = (1.0 - smoothstep(0.14, 0.42, fwC)) * smoothstep(3000.0, 4500.0, dist);
    // (where a pattern was not worked out, its weight is nought or the canopy is not drawn at all)
    float patH = mix(mix(mix(${FAR_GROUND.clumpZ.toFixed(3)}, cz.z, kz), cg.z, kgE), cr.z, kcE);
    float sharp = max(max(kz, kgE), kcE);
    // (and broken by the detail tile's broad blobs, 13 and 64 m, so that the edge wanders
    // freely, not along the land-cover map's square pixels, "a staircase")
    float shellW = mix(vShell, smoothstep(0.3, 0.7, clamp((vShell - 0.5) * 2.4 + 0.5 + 1.4 * (patH - ${FAR_GROUND.clumpZ.toFixed(3)}) + 0.9 * c2.g + 0.45 * c1.r, 0.0, 1.0)), sharp * step(vShell, 0.999));
    // (from a kilometre the wood gathers into larger soft clumps in two or three tones: the
    // detail tile's broad blob, 64 m, lighter and darker, as the far trees' shared tone is)
    leaves *= mix(1.0, 0.68 + 0.62 * smoothstep(-0.12, 0.12, c2.r + 0.4 * c1.g), smoothstep(400.0, 1200.0, dist));
    albedo = mix(albedo, leaves, shellW * ownC);
    shellOut = shellW;
    ao *= mix(1.0, 0.72 + 0.5 * clamp(c1.b + c2.b, -0.4, 0.5), vShell * ownC);
    // (the clumps: their light and shade on whatever colour the wood has there, its own or,
    // beyond 19 km, the map's; tilted a little toward their own light)
    if (kz > 0.0) {
      N = normalize(N + (uTanU * cz.x + uTanV * cz.y) * (0.25 * kz * shellW));
      albedo *= mix(1.0, (0.48 + 0.8 * smoothstep(0.0, 0.55, cz.z)) * (0.8 + 0.4 * cz.w) / ${FAR_GROUND.clumpMean.toFixed(3)}, kz * shellW);
    }
  }
  // A clearing in a wood, seen from the air, is a glade: the meadow's gold and green, not the
  // forest floor's grey-sage litter in the canopy's shade ("holes in the picture"). Wherever
  // the land carries trees and the ground shows between them, from 250 m off and from above.
  if (canopyTall > 0.3) {
    // (only where the canopy is open: the canopy's own weight is worked out at the vertices,
    // and a little under full across a wood, so a share of it drew the glade's colour in
    // straight-edged facets along the triangles)
    float glade = smoothstep(0.45, 0.15, shellOut) * smoothstep(250.0, 500.0, dist) * smoothstep(0.15, 0.35, dot(V, up)) * flatW;
    if (glade > 0.0) {
      albedo = mix(albedo, grassColour(uGrassTone.x, 0.62) * mapTint * (0.85 + 0.3 * texture(tDetail, vDetailUv).b), 0.85 * glade);
      ao = mix(ao, ao / mix(1.0, 0.55, canopyShade), glade); canopyShade *= 1.0 - glade;
    }
  }
  // ===================================== end of THE GROUND FROM AFAR, 1 ================

  // --- grass on the ground: round the traveller it is drawn blade by blade and clump by
  // clump (life/grass.js) out to some 500 m; under them and beyond, the ground wears the
  // same grass (life/grassRules.js: one rule for both): its colour, the wind's waves
  // running over it, drifts of flowers; far off it gives way to the map's own colour.
  // (On slopes by the grass's own rule, the one its blades and clumps stand by: grassRules.js.)
  if (uGrassTone.a > 0.0) {
    float dG = length(vRel), gw = uGrassTone.a * uGrassTone.y * (1.0 - smoothstep(GRASS_SLOPE0, GRASS_SLOPE1, ts)) * (1.0 - vShell) * (1.0 - smoothstep(6.0, 16.0, canopyTall)) * (1.0 - smoothstep(GRASS_FAR0, GRASS_FAR1, dG))
        // (a stopgap: ground whose own colour is far too pale to be grass, snow or pale sand, is not painted.
        // The ground's colour here is the surface's dust times the map's tint: on the made world
        // gold grass comes to 0.44 to 0.47, scrub 0.38, sand and snow 0.77)
        * (1.0 - smoothstep(0.52, 0.68, dot(albedo, vec3(0.2126, 0.7152, 0.0722))));
    if (gw > 0.0) {
      vec3 gc = farGrassColour(uGrassTone.x, d1.g);
      // (the waves: paler where they bow the grass; gone where a wave is narrower than a pixel or two)
      // (the wind over far grass: a few broad gusts with gaps between them, their lines bent,
      // and only a hint beyond 600 m. Everywhere and all alike, the waves ruled the land with stripes.)
      if (dG < 900.0) {
        float gustN = vCloud.w;      // (flNoise(planetPos / 240.0 + vec3(3.0, 11.0, 5.0)), asked at the vertices)
        float arg = dot(vRel, uGrassWave.xyz) + uGrassWave.w + 9.0 * gustN;
        gc *= 1.0 + 0.07 * sin(arg + 5.0 * (d1.g - 0.5)) * (1.0 - smoothstep(0.7, 1.8, fwidth(arg))) * smoothstep(0.52, 0.72, gustN) * (1.0 - 0.85 * smoothstep(250.0, 600.0, dG)) * (1.0 - smoothstep(600.0, 900.0, dG));
      }
      // (the drifts of flowers, where the clumps and blades have them)
      // (the flowers' tint: by the one rule (grassRules.js, flowerTint), the mean colour of what
      // flowers at a place as wide as the pixel: from near by the companions' clumps among the
      // leading kind, from the air soft drifts of a meadow's colours. The rule's two broad
      // noises come from the vertices (to 2 600 m). Nothing finer than a few pixels: no specks.)
      vec3 fwP = fwidth(planetPos);
      float fpx = max(fwP.x, max(fwP.y, fwP.z));
      vec4 fw = dG < 2500.0 ? flowerTint(planetPos, int(uGrassTone.z + 0.5), ts, vFlowerFields, fpx) : vec4(0.0);
      if (fw.a > 0.0) {
        // (thickest in a drift's heart, nothing at its edge; near by broken softly by a noise
        // some metres across, never single specks)
        float fk = 0.5 * smoothstep(0.0, 0.6, fw.a);
        if (fpx < 1.5) fk *= mix(0.55 + 0.9 * flNoise(planetPos / 4.5 + vec3(7.0, 0.0, 3.0)), 1.0, smoothstep(0.4, 1.5, fpx));
        // (less where the ground is looked along far off, where colour piles up along the
        // skyline; looked down on, the whole of it. Where the grass's own paint gives way to the
        // map's colour far off, the tint keeps a little more of its own: a meadow seen from
        // 1 to 2 km up is still a meadow)
        fk *= mix(0.35, 1.0, smoothstep(0.06, 0.4, dot(V, up))) / max(gw, 0.4);
        gc = mix(gc, fw.rgb, min(1.0, fk * GRASS_FLOWER_SHARE));
      }
      albedo = mix(albedo, gc, gw);
    }
  }

  // === THE GROUND FROM AFAR, 2: the land's painted patches (weight zero within 60 m) ===
  // --- the land from the air (the painted look): stretches of lighter and darker ground
  // some hundreds of metres across, with clean edges, as fields, stands of trees and open
  // ground lie beside each other. (Placed by the direction itself: whole repeats round the
  // globe, so no seam.)
  // (so many repeats round the globe that a repeat is 2.9 km on a world of any size: with
  // Earth's count on a world 250 km in radius the stretches were ten metres across, and on a
  // mountain side seen from some kilometres off they were level streaks, like a wood's grain)
  if (uPaint.x > 0.0 && farW < 1.0 && flatW > 0.0 && dist > 60.0) {
    vec2 kp = vec2(10.0, 5.0) * floor(uPlanetRadius * 0.00021975 + 0.5);
    float pa = textureGrad(tDetail, uvA * kp, gx * kp, gy * kp).a, pb = textureGrad(tDetail, uvA * kp * 3.7 + 0.31, gx * kp * 3.7, gy * kp * 3.7).a;
    float lay = smoothstep(0.42, 0.58, 0.6 * pa + 0.4 * pb);
    albedo *= mix(vec3(1.0), mix(vec3(0.85, 0.90, 0.85), vec3(1.15, 1.11, 1.0), lay), uPaint.x * (1.0 - farW) * flatW * smoothstep(60.0, 400.0, length(vRel)));
  }
  // --- open grassland from the air: broad painted variation that follows the land (the
  // critic: "a flat mustard felt", "a single ochre colour with soft blotches"). Greener in
  // the hollows, sunlit gold on the slopes turned to the Sun and a cooler olive on those
  // turned from it, and long swaths combed along the wind, some 60 m by 18. On ground whose
  // colour is grass (gold or green, not rock, sand or snow) and not under the canopy; each
  // a tint about the ground's own tone, the swaths faded where they are under a few pixels.
  // (the broad stretches out to 8 km, the rest to 4: from 1 km up a ring of plain ochre
  // began 3 km off, where the ground's grass gives way to the map's colour)
  if (uPaint.x > 0.0 && flatW > 0.0 && dist > 30.0 && dist < 8000.0) {
    // (grass, and beyond the ground's grass the map's dull ochre of it: from 1 km up the
    // land past 2 km was one plain tone, failing a test made for the grass's own gold)
    // (and only where the ground is looked down on, as from the air: at eye height the same
    // ground is seen nearly edge on, the swaths and stretches cannot be told apart, and
    // they cost the opening view a tenth of its ground's shading for nothing)
    float grassy0 = smoothstep(0.66, 0.42, albedo.b / max(albedo.r, 1e-4)) * smoothstep(0.62, 0.45, dot(albedo, vec3(0.2126, 0.7152, 0.0722))) * (1.0 - vShell) * flatW * smoothstep(0.08, 0.2, dot(V, up));
    float grassy = grassy0 * (1.0 - smoothstep(2500.0, 4000.0, dist)), grassyB = grassy0 * (1.0 - smoothstep(5500.0, 8000.0, dist));
    if (grassyB > 0.0) {
      float broad = flNoise(planetPos / 230.0 + vec3(3.7, 1.3, 8.1)) - 0.5;
      albedo *= mix(vec3(1.0), broad > 0.0 ? vec3(1.3, 1.08, 0.62) : vec3(0.66, 0.92, 0.78), grassyB * smoothstep(0.03, 0.3, abs(broad)));
    }
    if (grassy > 0.0) {
      vec3 n0 = normalize(nt.xyz);
      // (hollows: a cooler olive, and darkest along their bottoms, where water runs after rain)
      float hollow = smoothstep(0.97, 0.8, nt.a), damp = smoothstep(0.86, 0.7, nt.a);
      albedo *= mix(vec3(1.0), vec3(0.74, 0.96, 0.84), hollow * grassy);
      albedo *= mix(vec3(1.0), vec3(0.62, 0.7, 0.62), 0.8 * damp * grassy);
      float toSun = clamp((dot(n0, uSunDir) - dot(up, uSunDir)) * 5.0, -1.0, 1.0);
      albedo *= 1.0 + grassy * toSun * vec3(0.14, 0.05, -0.22) + grassy * min(toSun, 0.0) * vec3(0.12, 0.0, -0.2);
      vec3 wd = uWind.xyz - up * dot(uWind.xyz, up); float wl = length(wd); wd = wl > 1e-3 ? wd / wl : uTanU;
      vec3 q = planetPos / 18.0 + wd * (dot(planetPos, wd) * (1.0 / 60.0 - 1.0 / 18.0));
      vec3 fq = fwidth(planetPos);
      float kw = 1.0 - smoothstep(4.0, 9.0, max(fq.x, max(fq.y, fq.z)));
      // (the swaths: the wind's side of the grass paler and drier, its lee greener and darker)
      if (kw > 0.0) { float sw = flNoise(q) + 0.5 * flNoise(q * 2.3 + 7.1) - 0.75; albedo *= 1.0 + kw * grassy * sw * vec3(0.95, 0.75, 0.3); }
    }
  }

  // --- the tide, and the wash of the waves up the shore. The map's shore is the highest
  // tide; the sea stands uTide.x under it (the Moon's and the Sun's pull, worked out for
  // the place and the hour: App.updateTide), and every wave runs a little way up the
  // beach and back. Sand the water has left is dark and wet. The sea only.
  // (the beach: the strip of ground that stands a step above high water is sand, pale and dry)
  if (uSea.x > 0.5 && waterDepth <= 0.0) { float hb = vHeight - uSea.y; if (hb < 0.9 && hb > -0.5) albedo = mix(albedo, vec3(0.40, 0.34, 0.24), (1.0 - smoothstep(0.3, 0.9, hb)) * flatW); }
  if (uSea.x > 0.5 && waterDepth > 0.0) {
    float seaK = 1.0 - smoothstep(2.0, 6.0, vHeight - uSea.y);
    if (seaK > 0.0) {
      float left = waterDepth + uTide.x * seaK;
      float ph = texture(tDetail, vDetailUv * 0.375).b;   // (6 cycles over the 16 tiles the patches agree on: a fractional count broke along patch edges)
      // (only at the water's edge: a hand's depth in a calm, knee-deep in a storm)
      left += (0.07 + 0.16 * uWave.x) * sin(uWave.z * 0.85 + 12.566 * ph) * seaK * (1.0 - smoothstep(0.0, 1.0, abs(left)));
      float bared = (1.0 - smoothstep(0.0, 0.03, left)) * smoothstep(0.0, 0.05, waterDepth);
      waterDepth = max(left, 0.0);
      if (bared > 0.0) { albedo = mix(albedo, vec3(0.21, 0.175, 0.12), bared); ao = mix(ao, 1.0, bared); N = normalize(mix(N, up, 0.7 * bared)); }
    }
  }

  // --- water: dark, moving, shining; its colour by how deep it is
  // (seen from the air, uAloft, and far off, the shore is a soft margin a metre and a half
  // deep: a patch's texel there is tens of metres, and a sharp edge drew lakes with
  // stair-stepped outlines)
  float waterAir = smoothstep(0.0, 0.4, uAloft), waterFar = waterAir * smoothstep(1500.0, 6000.0, dist);
  float water = uSea.x > 0.5 ? smoothstep(0.02, 0.22 + 1.3 * waterFar, waterDepth) : 0.0;
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
    vec3 wv = wave(vDetailUv, uWave.z, wind2, uWave.x * shoal * (1.0 - 0.8 * inland), nw);
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
    // (far off, where no single crest is seen: the share of the sea that is white in this
    // wind, in streaks; a gale's sea is grey-white to the horizon, not a blue sheet)
    float white = clamp(3.84e-6 * pow(max(uWind.w, 0.0), 3.41), 0.0, 0.45) * (1.0 - inland);
    if (white > 0.004) foam = max(foam, white * smoothstep(0.3, 0.7, texture(tDetail, vDetailUv * 1.3125 - drift * 2.0).b + 0.3 * white) * water * (1.0 - 0.7 * near));
    // colour: light goes down to the bed and comes back, red lost first; what is left of
    // it shows the bed (pale sand), the rest is the water's own blue
    vec3 through = exp(-vec3(0.42, 0.07, 0.035) * (waterDepth * 2.3));
    // (far off, where a texel of the ground's maps is as wide as a river and its banks (by
    // distance, not by pixels: the phone has five times as many), the
    // shallows are a lighter, greener water and not the pale sand of the bed: a pixel there
    // is part water and part bank, and the bed's sand drew every river as a dashed line of
    // pale beads and every lake with a pale dotted rim. Seen from the air: uAloft)
    vec3 bed = mix(vec3(0.30, 0.27, 0.20), vec3(0.12, 0.25, 0.23), waterFar);
    // (from the air the deep water is a muted slate-blue, not the deep sea's pure blue: a
    // lake at 3 km was a paint-bucket fill of royal blue outside the picture's palette)
    vec3 deepC = mix(uSeaColor, dot(uSeaColor, vec3(0.3, 0.55, 0.15)) * vec3(0.8, 1.0, 1.2), 0.45 * waterAir);
    vec3 body = bed * through + deepC * (1.0 - through.b);
    // (and from the air, one fade from pale green shallows to the slate middle: red, green and
    // blue lost at three depths made a river of changing depth cycle through sand, yellow,
    // green and lilac, "an oily rainbow ribbon" from 1 km)
    if (waterAir > 0.0) { float tg = exp(-0.16 * waterDepth * 2.3); body = mix(body, mix(deepC, vec3(0.10, 0.20, 0.19), tg), waterAir); }
    albedo = mix(albedo, mix(body, vec3(0.75), foam), water);
    ao = mix(ao, 1.0, water);
  }

  // (wet ground is darker: water fills the gaps between the grains)
  albedo *= 1.0 - 0.32 * vCloud.z * (1.0 - water) * (1.0 - farW);

  // --- light
  // The cloud that stands between this ground and the Sun: from the atlas, asked at the
  // vertices of the near ground and here for the far (see CLOUD_VERT_TILES). Every heap the
  // layer shows casts its own shadow, crisp at its edge, and from far off the atlas's own
  // coarser windows hold the mean of it, so nothing shimmers.
  shadow *= vChunk.z > float(CLOUD_VERT_TILES) ? cloudShadeLight(vRel).x : vCloud.x;
  shadow *= nearShadow(vRel, N);
  // Oren-Nayar roughness describes the grains and clods underfoot; at the scale of a whole
  // disc it kept the limb nearly as bright as the centre (71 % at 72 degrees off the
  // vertical; real Mars is about half). Far ground blends to the world's farRoughness.
  float sigma = mix(uRoughness, uFarRoughness, farW);
  // (the painted look: two tones of light, cleaner colours; not from far off, where the
  // globe keeps its round shading)
  float paint = uPaint.x * (1.0 - farW);
  // (where the painted light is all of it, the other is not worked out)
  float diffuse = paint < 1.0 ? groundDiffuse(N, uSunDir, V, sigma) : 0.0;
  if (paint > 0.0) { diffuse = mix(diffuse, paintLit(dot(N, uSunDir)), paint); albedo = mix(albedo, paintColour(albedo), 1.0 - water); }
  // === THE GROUND FROM AFAR, 3: the relief light (weight zero within 1.5 km) ===
  // The relief light: far ground is lit as a relief map is drawn, by a Sun no higher than
  // 35 degrees (from the real Sun's side), so that a canyon or a range has its lit and its
  // shaded slopes at any hour. Under a high Sun every slope is in the light, and from the
  // air the land lay as flat as a carpet: no height, no depth. Level ground keeps the
  // brightness the real Sun gives it; nothing changes while the Sun is low, or near by.
  if (uAirRelief > 0.0) {
    float su = dot(up, uSunDir);
    // (less of it where a texel of the ground's maps is a kilometre: from orbit whole ranges
    // went blue-black, stains on the map and not relief)
    float kr = uAirRelief * smoothstep(1500.0, 9000.0, dist) * smoothstep(0.574, 0.75, su) * (1.0 - water) * mix(1.0, 0.4, farW);
    if (kr > 0.0) {
      vec3 Lh = uSunDir - up * su; float lh = length(Lh);
      vec3 Lr = normalize((lh > 1e-3 ? Lh / lh : uTanU) * 0.819 + up * 0.574);
      // (the slope's share of that light against level ground's, 1 on the level; times what
      // the real Sun gives level ground)
      float nlr = dot(N, Lr);
      float slopeL = clamp(mix(max(nlr, 0.0) / 0.574, paintLit(nlr) / paintLit(0.574), paint), 0.4, 1.6);
      diffuse = mix(diffuse, mix(max(su, 0.0) * 0.3183099, paintLit(su), paint) * slopeL, kr);
    }
    // Planes: far mountain sides (from 1.2 km, steeper than some 25 degrees) take the painted
    // light in a wider ramp, so that faces turned a little away from the Sun are clearly
    // darker than those facing it and the cool sky light shows in them. The two-tone light
    // put every face toward the Sun at one brightness: the big mountain of the opening view
    // was a smooth salmon dome with no shade side. Arithmetic only; no read.
    float kp = paint * smoothstep(1200.0, 3000.0, dist) * smoothstep(0.08, 0.25, 1.0 - dot(N, up)) * (1.0 - water);
    if (kp > 0.0) {
      vec3 Lp = uSunDir;
      if (kr > 0.0) { vec3 Lh = uSunDir - up * su; float lh = length(Lh); Lp = normalize(mix(uSunDir, normalize((lh > 1e-3 ? Lh / lh : uTanU) * 0.819 + up * 0.574), kr)); }
      float nlp = dot(N, Lp);
      float planes = smoothstep(-0.04, 0.2, nlp) * (0.28 + 0.72 * smoothstep(0.2, 0.85, nlp)) * 0.3183099;
      // (as a share of the two-tone light: what the relief light did to level ground stays)
      diffuse *= mix(1.0, clamp(planes / max(paintLit(nlp), 1e-4), 0.0, 1.0), kp);
    }
  }
  vec3 sunHere = vSun;
  vec3 direct = sunHere * shadow * diffuse;
  vec3 ambient = (skyLight(N, up) * ao + planetShine(N)) * contactSky(vRel, N) / PI;
  if (canopyShade > 0.0) ambient = mix(ambient, dot(ambient, vec3(0.3, 0.55, 0.15)) * mix(vec3(0.85, 1.1, 0.5), vec3(1.25, 0.95, 0.45), uLitter), 0.85 * canopyShade);
  vec3 col = albedo * (direct + ambient);
  if (water > 0.0) {
    // the Sun's glint (seen from orbit too) and the sky in the water at a grazing view
    vec3 Hh = normalize(uSunDir + V);
    float rough = uSea.z + waveRough + 0.25 * smoothstep(0.02, 0.6, fwidth(vDetailUv.x) + fwidth(vDetailUv.y));
    float nh = max(dot(N, Hh), 0.0), a2 = rough * rough, dd = nh * nh * (a2 - 1.0) + 1.0;
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0), Fv = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 Rv = reflect(-V, N); Rv = normalize(Rv + up * max(0.0, 0.05 - dot(Rv, up)));
    // (from the air the water shows the sky as one calm sheen: the sky toward the vertical,
    // without the painted look's extra sky light from above, and a little of it even looking
    // straight down. Each ripple read the painted sky in its own direction, and a river
    // from 1 km was a rainbow of lilac, mint and pink.)
    Rv = normalize(mix(Rv, up, waterAir)); Fv = max(Fv, 0.1 * waterAir);
    col += water * (1.0 - foam) * (sunHere * shadow * (a2 / (PI * dd * dd) * F * max(dot(N, uSunDir), 0.0) * 0.25 / max(dot(N, V), 0.2)) + Fv * skyLight(Rv, up) / (PI * mix(1.0, uSkyBoost, waterAir)));
  } else if (uGloss.x > 0.0 || vCloud.z > 0.01) {
    // the Sun's sheen on ice, and on ground the rain has wetted: a broad glint toward the
    // Sun, strongest at a grazing view; it fades with distance into the far ground's plain
    // brightness. Wet ground also mirrors a little of the sky at a low angle.
    float wetK = vCloud.z * (1.0 - farW), gl = max(uGloss.x, 0.7 * wetK), gr = mix(uGloss.y, 0.22, step(uGloss.x, 0.7 * wetK));
    vec3 Hh = normalize(uSunDir + V);
    float nh = max(dot(N, Hh), 0.0), a2 = gr * gr, dd = nh * nh * (a2 - 1.0) + 1.0;
    float F = 0.03 + 0.97 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
    col += sunHere * shadow * (gl * (1.0 - farW) * a2 / (PI * dd * dd) * F * max(dot(N, uSunDir), 0.0));
    if (wetK > 0.0) { vec3 Rw = reflect(-V, N); Rw = normalize(Rw + up * max(0.0, 0.05 - dot(Rw, up))); col += wetK * flatW * 0.5 * pow(1.0 - max(dot(N, V), 0.0), 4.0) * skyLight(Rw, up) / PI; }
  }
  if (woodAir > 0.0) col = forestAir(col, vRel, up, woodAir);
  // the air (the haze depends on how bright the ground is): from inside it by the numbers
  // worked out at the vertices, from space pixel by pixel
  if (length(uCamPlanetPos) * 0.001 <= uRTop) col = col * vHazeT + vHazeL + vHazeG * (clamp(albedo / max(uGroundAlbedo, vec3(1e-4)), 0.0, 2.5) - 1.0);
  else col = aerialPerspective(col, vRel, albedo);
  fragColor = vec4(col * uExposure, 1.0);
}`;

// Uniforms shared by every chunk material (same objects, by reference).
export function makeTerrainShared(world, textures) {
  const shared = {
    ...lightingUniforms(),
    tStrata: { value: textures.strata }, tDetail: { value: textures.detail }, uDetailMean: { value: new THREE.Vector4(...(textures.detail.userData.mean || [0.5, 0.5, 0.5, 0.5])) },
    uDust: { value: new THREE.Vector3() }, uSand: { value: new THREE.Vector3() },
    uScree: { value: new THREE.Vector3() }, uRock: { value: new THREE.Vector3() }, uBedrock: { value: new THREE.Vector3() },
    uSlopes: { value: new THREE.Vector4() }, uStrata: { value: new THREE.Vector4() }, uStrataFlat: { value: 0 },
    uSandRange: { value: new THREE.Vector2() }, uRipple: { value: new THREE.Vector4() },
    uCover: { value: new THREE.Vector4() },
    // w: the cover pattern (d0.a + 0.3 d1.a) is about normal; logistic scale = its spread / 1.702
    uCoverPattern: { value: new THREE.Vector4(0, 0, 0, (textures.detail.userData.lowSpread ?? 0.1) * Math.hypot(1, 0.3) / 1.702) },
    uPlain: { value: 0 }, uTide: { value: new THREE.Vector2(0, 0) }, uAirRelief: { value: 0 },
    // the clouds' shade, the one atlas every lit thing reads (sky/cloudShade.js), and how wet
    // the ground is per place; the four below are the cloud rule's own numbers, which the atlas
    // reads to write itself with (nothing in the ground's shaders reads them any more)
    ...CLOUD_SHADE_UNIFORMS, ...CLOUD_WET_UNIFORMS,
    tCloudNoise: { value: null }, uCloudHeap: { value: new THREE.Vector4(0, 0, 0, 0) }, uCloudVol: { value: new THREE.Vector4() }, uCloudSteer: SKY_UNIFORMS.uCloudSteer,
    uRoughness: { value: 0.5 }, uFarRoughness: { value: 0.5 }, uDetailStrength: { value: 0.5 }, uGloss: { value: new THREE.Vector2(0, 0.3) }, uSea: { value: new THREE.Vector4(0, 0, 0.1, 0.05) }, uWind: { value: new THREE.Vector4(1, 0, 0, 5) }, uWave: { value: new THREE.Vector3(0.3, 1, 0) }, uShell: { value: new THREE.Vector3(200, 300, 0) }, uLitter: { value: 0 }, tClouds: { value: textures.white }, uCloud: { value: new THREE.Vector4(0, 1, 0, 0) }, uSeaColor: { value: new THREE.Vector3(0.01, 0.03, 0.07) }, uGrassTone: { value: new THREE.Vector4(0, 0, 0, 0) }, uGrassWave: { value: new THREE.Vector4(0, 0, 0, 0) },
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
  shared.uAirRelief.value = world.look?.reliefLight ?? 0;
  shared.uDetailStrength.value = s.detailStrength ?? 0.5;
  shared.uPhotometry.value = s.photometry === 'lunar' ? 1 : 0;
  shared.uAlbedoMap.value.w = 0;          // until the world's map has loaded (Terrain.loadAlbedoMap)
  shared.uRelief.value.x = 0;             // until the world's slope map has loaded (Terrain.loadReliefMap)
  shared.uAlbedoRange.value.set(...(s.albedoMap?.range || [0, 0]));
}

export const DETAIL_TILE = 64;   // metres covered by one repeat of the detail texture at the coarsest scale
// A patch's tile coordinates are kept modulo this many tiles (terrain.js): everything that
// repeats in a whole number of cycles per tile is as before, and a pattern may be made to
// differ from tile to tile over this many (the far forest's crowns: a kilometre).
export const DETAIL_PERIOD = 16;

// The one material of the ground. pool: the ChunkPool, for its texture arrays.
export function makeTerrainMaterial(shared, pool) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    // DETAIL_LAST: the square of the footprint (in repeats of the texture a pixel) from which a
    // sampler with at most 4 taps along the long side answers with the last level: (4 / 1)^2, and as much again in case a GPU chooses its level a step finer than the rule
    defines: { ...atmosphereDefines(), DETAIL_LAST: '64.0', CLOUD_VERT_TILES: CLOUD_VERT_TILES.toFixed(1), NORMAL_RES: CONFIG.NORMAL_RES, SHADOW_RES: CONFIG.SHADOW_RES, SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1, DETAIL_TILE, DETAIL_PERIOD, VERT_W: pool.VW, MORPH_START: CONFIG.MORPH_START, GRASS_FAR0: GRASS_GROUND.far[0].toFixed(1), GRASS_FAR1: GRASS_GROUND.far[1].toFixed(1), GRASS_FLOWER_SHARE: GRASS_GROUND.flowers.toFixed(3), GRASS_SLOPE0: GRASS_GROUND.slope[0].toFixed(3), GRASS_SLOPE1: GRASS_GROUND.slope[1].toFixed(3) },
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      ...shared,
      tNormal: { value: pool.normalTex }, tShadow: { value: pool.shadowTex },
      tVert: { value: pool.vertTex }, tMorph: { value: pool.morphTex },
    },
  });
}
