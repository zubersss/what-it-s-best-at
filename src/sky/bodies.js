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

const RECIPES = { rock: 0, oceanWorld: 1 };

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
    float rim = pow(1.0 - NV, 2.5);
    col += uHaze * uParams2.x * uLightE * NL * (0.12 + rim) / PI;
  }
  vec3 T = texture(tTransmittance, transmittanceUv(uCamRkm, dot(normalize(vDir), uUp))).rgb;
  fragColor = vec4(min(col * T * uExposure, vec3(60000.0)), 1.0);
}`;

function lumpyGeometry(def, seed) {
  // three's polyhedra are triangle soup: without shared vertices the normals come out
  // one per face and the day-night edge of a small moon is a staircase of facets.
  const soup = new THREE.IcosahedronGeometry(1, 12);    // 2 880 triangles
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
    this.group = new THREE.Group();
    this.points = new PointSources(this.ids.length);
    this.points.points.renderOrder = 19;
    this.group.add(this.points.points);
    this.bodies = this.ids.map((id, i) => {
      const def = catalogue[id], s = def.surface || { recipe: 'rock', albedo: [0.1, 0.1, 0.1] };
      const u = {
        ...G,
        uCamRkm: { value: 1 }, uUp: { value: new THREE.Vector3(0, 0, 1) },
        uLightDir: { value: new THREE.Vector3(1, 0, 0) }, uLightE: { value: new THREE.Vector3(1, 1, 1) },
        uShineDir: { value: new THREE.Vector3(1, 0, 0) }, uShineE: { value: new THREE.Vector3(0, 0, 0) },
        uRecipe: { value: RECIPES[s.recipe] ?? 0 },
        uAlbedo: { value: new THREE.Vector3(...(s.albedo || s.ocean || [0.1, 0.1, 0.1])) },
        uColB: { value: new THREE.Vector3(...(s.land || [0, 0, 0])) }, uColC: { value: new THREE.Vector3(...(s.cloud || [0, 0, 0])) },
        uColD: { value: new THREE.Vector3(...(s.ice || [0, 0, 0])) }, uHaze: { value: new THREE.Vector3(...(s.haze || [0, 0, 0])) },
        uParams: { value: s.recipe === 'oceanWorld' ? new THREE.Vector4(s.landScale, s.landBias, s.cloudScale, s.cloudCover) : new THREE.Vector4(s.mottling || 0, s.mottleScale || 1, 0, 0) },
        uParams2: { value: new THREE.Vector4(s.hazeStrength || 0, 0, 0, 0) },
      };
      const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: u, vertexShader: VERT, fragmentShader: FRAG, depthTest: true, depthWrite: true });
      const mesh = new THREE.Mesh(lumpyGeometry(def, i * 13.7 + 1), mat);
      mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      return { id, def, mesh, u, info: {}, pos: new THREE.Vector3(), rel: new THREE.Vector3(), dist: Infinity };
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
      if (b.id === this.world.body) b.mesh.visible = false; else order.push(b);
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
        const above = Math.min(1, Math.max(0, (dir.dot(this._up(rig)) + 0.02) / 0.07));
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
        b.mesh.visible = false;
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
      b.u.uLightDir.value.subVectors(sunPos, b.pos).normalize();
      b.u.uLightE.value.set(E * sunC[0], E * sunC[1], E * sunC[2]);
      b.u.uCamRkm.value = cam.length() * 0.001;
      b.u.uUp.value.copy(this._up(rig));
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
