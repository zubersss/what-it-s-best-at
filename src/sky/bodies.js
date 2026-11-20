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
const MAPS = [['colour', 'tColour'], ['clouds', 'tClouds'], ['lights', 'tLights'], ['water', 'tWater']];     // a globe's maps and their samplers
function mapTexture(url, srgb, onLoad) {
  // (a map that does not arrive counts as arrived: nothing waits for it for ever)
  const t = new THREE.TextureLoader().load(import.meta.env.BASE_URL + url, onLoad, undefined, () => { console.warn('map did not load:', url); onLoad?.(null); });
  t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (!srgb) t.format = THREE.RedFormat;                 // the grey maps take one byte a pixel
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
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
uniform vec4 uGlobe;           // x colour gain, y glint roughness, z glint strength
uniform vec3 uLightObj;        // toward the Sun in the globe's own axes (the maps' axes)
in vec3 vN; in vec3 vObj; in vec3 vDir;
layout(location = 0) out vec4 fragColor;
${GLARE}
void main() {
  vec3 p = normalize(vObj);
  vec3 N = normalize(vN), V = -normalize(vDir), L = uLightDir;      // (p is in the globe's own axes, N in the scene's)
  // Map coordinates, with their footprint taken from the direction itself: the longitude
  // jumps by a whole turn at the back of the globe and its own derivatives would draw a seam.
  vec2 uv = vec2(atan(p.y, p.x) / TWO_PI + 0.5, 0.5 - asin(clamp(p.z, -1.0, 1.0)) / PI);
  vec3 px = dFdx(p), py = dFdy(p);
  float r2 = max(p.x * p.x + p.y * p.y, 1e-6), cz = sqrt(max(1.0 - p.z * p.z, 1e-6));
  vec2 gx = vec2((p.x * px.y - p.y * px.x) / (r2 * TWO_PI), -px.z / (cz * PI));
  vec2 gy = vec2((p.x * py.y - p.y * py.x) / (r2 * TWO_PI), -py.z / (cz * PI));
  vec3 base = textureGrad(tColour, uv, gx, gy).rgb * uGlobe.x;
  float water = textureGrad(tWater, uv, gx, gy).r;
  float c0 = textureGrad(tClouds, uv, gx, gy).r;
  // The clouds stand above the ground: the same map a little way toward the Sun is the
  // cloud that shades this spot (a shadow on the sea beside every cloud), and tells which
  // side of a cloud this is (its sunward edge bright, its far side in its own shade).
  vec3 ps = normalize(p + uLightObj * 0.0035);
  vec2 uvs = vec2(atan(ps.y, ps.x) / TWO_PI + 0.5, 0.5 - asin(clamp(ps.z, -1.0, 1.0)) / PI);
  float c1 = textureGrad(tClouds, uvs, gx, gy).r;
  float cloud = smoothstep(0.04, 0.9, c0);
  float shadow = 1.0 - 0.55 * smoothstep(0.15, 0.8, c1) * (1.0 - cloud);
  float relief = clamp(1.0 + 1.3 * (c0 - c1), 0.55, 1.25);
  float mu0 = dot(N, L), NL = max(mu0, 0.0), mu = max(dot(N, V), 0.02);
  // land and sea
  vec3 alb = max(base, uOcean * water);
  vec3 col = alb * NL / PI * shadow;
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
  constructor(world, catalogue) {
    this.world = world; this.cat = catalogue;
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
      let shell = null, su = null;
      if (globe) {
        // maps: a small copy of each now (the body far away), the full ones when it grows
        // large in view (see update)
        for (const [key, name] of MAPS) { this.pending++; u[name] = { value: mapTexture(s.maps[key].far, key === 'colour', () => this.pending--) }; }
        u.uOcean = { value: new THREE.Vector3(...(s.ocean || [0, 0, 0])) }; u.uCloudCol = { value: new THREE.Vector3(...(s.cloud || [0.8, 0.8, 0.8])) };
        u.uLights = { value: new THREE.Vector3(...(s.lights || [0, 0, 0])) };
        const air = s.air || { tau: [0, 0, 0], scaleHeight: 8000 };
        u.uAirTau = { value: new THREE.Vector3(...air.tau) };
        u.uGlobe = { value: new THREE.Vector4(s.gain ?? 1, s.glint?.roughness ?? 0.2, s.glint?.strength ?? 1, 0) };
        u.uLightObj = { value: new THREE.Vector3(1, 0, 0) };
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
      return { id, def, mesh, u, reach, shell, su, maps: globe ? s.maps : null, full: 0, info: {}, pos: new THREE.Vector3(), rel: new THREE.Vector3(), dist: Infinity };
    });
    this.byId = new Map(this.bodies.map((b) => [b.id, b]));
    this._v = new THREE.Vector3(); this._m = new THREE.Matrix4();
  }

  setWorld(world) { this.world = world; }

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

      if (2 * angRadius / pxAngle < 2.5) {
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
      if (b.maps && !b.full && b.info.pixels > FULL_MAPS_PX) {
        b.full = 1;
        for (const [key, name] of MAPS) {
          this.pending++;           // (screenshots wait for them)
          const uni = b.u[name], old = uni.value, t = mapTexture(b.maps[key].full, key === 'colour', (ok) => { if (ok !== null) { uni.value = t; old.dispose(); this.mapsAt = performance.now(); } this.pending--; });
        }
      }
      b.u.uLightDir.value.subVectors(sunPos, b.pos).normalize();
      b.u.uLightE.value.set(E * sunC[0], E * sunC[1], E * sunC[2]);
      b.u.uCamRkm.value = cam.length() * 0.001;
      // A body far brighter than the scene is exposed for (the Earth in the lunar night, a
      // moon at dusk) keeps its colours: the whole of it is dimmed until its sunlit face
      // sits just under white, as the eye does with a bright thing in a dark place. Seen
      // from its night side, or in a scene exposed for daylight, nothing changes.
      {
        const s = def.surface || {}, peak = (s.recipe === 'globe' ? 0.8 : 1.6 * Math.max(...(s.albedo || [0.1]))) / Math.PI;
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
    if (def.tidallyLocked && def.parent) {
      // long axis toward the parent, short axis along the orbit normal (≈ home pole for our moons)
      const parentPos = def.parent === this.world.body ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(...eph.bodies.get(def.parent).pos);
      const x = parentPos.sub(b.pos).normalize(), z = new THREE.Vector3(0, 0, 1);
      const y = new THREE.Vector3().crossVectors(z, x).normalize(); z.crossVectors(x, y);
      m.makeBasis(x, y, z);
    } else if (def.rotation) {
      const Rb = eph.rotationMatrix(b.id, eph.jd), Rh = eph.icrfToFixed;   // row-major: fixed = R * icrf
      // home <- icrf <- body : Rh * Rb^T
      const e = new Array(9);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) e[r * 3 + c] = Rh[r * 3] * Rb[c * 3] + Rh[r * 3 + 1] * Rb[c * 3 + 1] + Rh[r * 3 + 2] * Rb[c * 3 + 2];
      m.set(e[0], e[1], e[2], 0, e[3], e[4], e[5], 0, e[6], e[7], e[8], 0, 0, 0, 0, 1);
    } else m.identity();
  }
}
