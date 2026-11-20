// A few hundred GPU-instanced rocks scattered deterministically around the camera.
// One draw call (plus one in the shadow map). They shrink to nothing at the edge of
// their radius, so they never pop.
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { noise3, hash3 } from '../terrain/height/noise.js';
import { latLonToDir, dirToLatLon } from '../core/ephemeris.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const INSTANCE_VERT = /* glsl */`
in vec3 aOffset; in vec4 aQuat; in vec3 aScale; in vec2 aMisc; in vec4 aShape;
uniform float uFadeRadius;
vec3 qrot(vec3 v, vec4 q) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 sphDir(float u, float z) { float s = sqrt(max(0.0, 1.0 - z * z)), a = 6.2831853 * u; return vec3(cos(a) * s, sin(a) * s, z); }
// Every rock is a block: the same lump trimmed by four to six fracture planes round its
// sides and one across its top, placed, tilted and sized differently on each rock
// (aShape), so no two rocks are alike. nrm comes in as the lump's smooth normal and
// leaves as the surface's.
vec3 rockShape(vec3 p, inout vec3 nrm) {
  float r = length(p);
  vec3 d = p / r;
  float az = aShape.x * 6.2831853, sides = 4.0 + floor(aShape.w * 2.999);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    if (fi > sides) break;
    vec3 n; float h;
    if (fi < sides) {
      float a = az + fi * 6.2831853 / sides + (fract(aShape.y * 7.13 + fi * 0.618034) - 0.5) * 0.9;
      n = sphDir(a * 0.15915494, (fract(aShape.z * 5.71 + fi * 0.381966) - 0.45) * 0.55);
      h = mix(0.5, 0.82, fract(aShape.y * 3.31 + fi * 0.754878));
    } else {
      n = sphDir(aShape.z, mix(0.6, 0.97, aShape.y));
      h = mix(0.35, 0.7, aShape.x);
    }
    float c = dot(d, n);
    if (c > 1e-3 && r * c > h) { r = h / c; nrm = n; }
  }
  return d * r;
}
vec3 rockPosition(out vec3 centre, inout vec3 nrm) {
  centre = (modelMatrix * vec4(aOffset, 1.0)).xyz;
  float fade = 1.0 - smoothstep(uFadeRadius * 0.72, uFadeRadius, length(centre));
  return centre + qrot(rockShape(position, nrm) * aScale, aQuat) * fade;
}`;

// A rounded lump (80 triangles on 42 shared vertices); the fracture planes that make each
// rock a different block are cut in the vertex shader.
function rockGeometry() {
  const ico = new THREE.IcosahedronGeometry(1, 1);
  ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
  const geo = mergeVertices(ico, 1e-4);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const r = 0.86 + 0.24 * noise3(v.x * 1.7 + 3.1, v.y * 1.7 - 1.2, v.z * 1.7 + 8.8) + 0.06 * noise3(v.x * 4.1, v.y * 4.1, v.z * 4.1);
    v.multiplyScalar(r);
    if (v.z < -0.35) v.z = -0.35 - (v.z + 0.35) * 0.15;       // flattened base sits in the ground
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Rocks {
  constructor(world, hs) {
    this.world = world; this.hs = hs;
    const def = world.surface.rocks || { count: 0, radius: 100, size: [0.3, 1], albedo: [0.15, 0.1, 0.07] };
    this.def = def; this.capacity = 512;                // fixed instance buffer; a world may use fewer
    this.cell = 7;
    this.nearRadius = 30;             // rocks the fine shadow tile can see (its half-width, 20 m, plus a margin for the camera moving)
    this.nearCount = 0;
    this.prob = Math.min(1, Math.min(this.capacity, def.count | 0) / (Math.PI * def.radius * def.radius / (this.cell * this.cell)) * 0.92);
    const base = rockGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.attributes.position); geo.setAttribute('normal', base.attributes.normal); geo.setIndex(base.index);
    const n = this.capacity;
    this.aOffset = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aQuat = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.aScale = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(n * 2).fill(1), 2);
    this.aShape = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute('aOffset', this.aOffset); geo.setAttribute('aQuat', this.aQuat); geo.setAttribute('aScale', this.aScale); geo.setAttribute('aMisc', this.aMisc);
    geo.setAttribute('aShape', this.aShape);
    geo.instanceCount = 0;
    this.geometry = geo;
    this.trianglesPerRock = base.index.count / 3;
    const fade = { value: def.radius };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(),
      uniforms: {
        ...lightingUniforms(), uFadeRadius: fade, uRockAlbedo: { value: new THREE.Vector3(...def.albedo) }, uDustAlbedo: { value: new THREE.Vector3(...world.surface.dust) },
        uRoughness: { value: world.surface.roughness ?? 0.5 },
        uDustCap: { value: def.dustCap ?? 0.55 },
      },
      vertexShader: /* glsl */`${INSTANCE_VERT}
        out vec3 vRel; out vec3 vN; out vec3 vLocal; out vec2 vMisc;
        void main() {
          vec3 c, nrm = normal; vec3 rel = rockPosition(c, nrm);
          vRel = rel; vN = qrot(nrm / aScale, aQuat); vLocal = position; vMisc = aMisc;
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform vec3 uRockAlbedo, uDustAlbedo; uniform float uRoughness, uDustCap;
        in vec3 vRel; in vec3 vN; in vec3 vLocal; in vec2 vMisc;
        layout(location = 0) out vec4 fragColor;
        void main() {
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel);
          // Shaded by the true faces: the fracture planes are flat, the narrow faces between
          // them read as worn edges (the smooth normal only softens them a little).
          vec3 F = normalize(cross(dFdx(vRel), dFdy(vRel)));
          F *= sign(dot(F, V));
          vec3 N = normalize(mix(F, normalize(vN), 0.3));
          float top = smoothstep(0.45, 0.95, dot(N, up));
          vec3 albedo = mix(uRockAlbedo * vMisc.y, uDustAlbedo, top * uDustCap) * uGroundTint;   // (the map's range is already in uGroundTint: Terrain.tintAt)       // dust settles on top; local rock is the local colour
          float contact = mix(0.55, 1.0, smoothstep(-0.35, 0.25, vLocal.z));        // darker where it meets the ground
          vec3 direct = directSun(planetPos) * vMisc.x * nearShadow(vRel, N) * groundDiffuse(N, uSunDir, V, uRoughness);
          vec3 col = albedo * (direct + (skyLight(N, up) * contact + planetShine(N)) / PI);
          col = aerialPerspective(col, vRel);
          fragColor = vec4(col * uExposure, 1.0);
        }`,
    });
    this.depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, colorWrite: false, uniforms: { uFadeRadius: fade },
      vertexShader: /* glsl */`${INSTANCE_VERT}
        void main() { vec3 c, nrm = normal; gl_Position = projectionMatrix * viewMatrix * vec4(rockPosition(c, nrm), 1.0); }`,
      fragmentShader: /* glsl */`layout(location = 0) out vec4 fragColor; void main() { fragColor = vec4(1.0); }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = (def.count | 0) > 0;
    this.anchor = new THREE.Vector3();
    this.cellKey = '';
    this.points = new Float64Array(n * 3);
    this.count = 0; this.needVis = false; this.visSun = [0, 0, 0];
    this._d = [0, 0, 0];
  }

  get triangles() { return this.count * this.trianglesPerRock; }

  // Governor step: draw only part of the scattered rocks (they are in a stable order).
  setFraction(f) { this.fraction = f; this.geometry.instanceCount = Math.floor(this.count * f); }

  // Another world: new numbers, same buffers.
  setWorld(world, hs) {
    this.world = world; this.hs = hs;
    const def = world.surface.rocks || { count: 0, radius: 100, size: [0.3, 1], albedo: [0.15, 0.1, 0.07] };
    this.def = def;
    this.prob = Math.min(1, Math.min(this.capacity, def.count | 0) / (Math.PI * def.radius * def.radius / (this.cell * this.cell)) * 0.92);
    const u = this.material.uniforms;
    u.uFadeRadius.value = def.radius; u.uRockAlbedo.value.set(...def.albedo); u.uDustAlbedo.value.set(...world.surface.dust);
    u.uRoughness.value = world.surface.roughness ?? 0.5;
    u.uDustCap.value = def.dustCap ?? 0.55;
    this.mesh.visible = (def.count | 0) > 0;
    this.cellKey = ''; this.count = 0; this.geometry.instanceCount = 0; this.needVis = false;
    this.visByCell = new Map(); this.slotKey = [];       // sun visibility per rock (keyed by its cell)
  }

  // Re-scatter when the camera enters a new grid cell; keep sun visibility up to date.
  update(rig, sun, sunHalf, workers) {
    if (!this.mesh.visible) return;
    if (rig.agl > this.def.radius * 3) {                 // far above the ground: no rocks in reach
      if (this.count) { this.count = 0; this.geometry.instanceCount = 0; this.cellKey = ''; }
      this.needVis = false;
      return;
    }
    const R = this.world.radius, cell = this.cell, ll = rig.latLon;
    const dLat = cell / R * 180 / Math.PI;
    const band = Math.round(ll.lat / 2) * 2;                                    // longitude step fixed per 2-degree band
    const dLon = dLat / Math.max(0.05, Math.cos(band * Math.PI / 180));
    const ci = Math.floor(ll.lat / dLat), cj = Math.floor(ll.lon / dLon);
    const key = ci + ',' + cj + ',' + band;
    // (no rocks in reach, e.g. a few hundred metres up: nothing to ask the shadow workers about)
    if (key !== this.cellKey) { this.cellKey = key; this._scatter(rig, ci, cj, dLat, dLon); this.needVis = this.count > 0; }
    this.mesh.position.subVectors(this.anchor, rig.pos);
    const s = this.visSun;
    if (!this.needVis && this.count && s[0] * sun[0] + s[1] * sun[1] + s[2] * sun[2] < 0.99995) this.needVis = true;   // > 0.57 degrees
    if (this.needVis && this.count && !this.pendingVis) {
      const want = [sun[0], sun[1], sun[2]], count = this.count, stamp = this.cellKey, keys = this.slotKey.slice(0, count), world = this.world;
      const job = workers.run({ type: 'points', points: this.points.slice(0, count * 3), sun: want, sunHalf, minWL: 0.6 });
      if (job) {
        this.pendingVis = true; this.needVis = false;
        job.then((res) => {
          this.pendingVis = false;
          if (world !== this.world) return;
          // answers for another Sun direction are stale; the table is also kept small
          const v = this.visSun;
          if (v[0] * want[0] + v[1] * want[1] + v[2] * want[2] < 0.99995 || this.visByCell.size > 6000) this.visByCell.clear();
          for (let i = 0; i < count; i++) this.visByCell.set(keys[i], res.vis[i]);
          this.visSun = want;
          // every rock now on screen takes what is known for it; scattered again meanwhile,
          // the ones still unknown are asked about next
          let missing = false;
          for (let i = 0; i < this.count; i++) { const k = this.visByCell.get(this.slotKey[i]); if (k === undefined) missing = true; else this.aMisc.array[i * 2] = k; }
          this.aMisc.needsUpdate = true;
          if (missing || stamp !== this.cellKey) this.needVis = true;
        }).catch(() => { this.pendingVis = false; });
      }
    }
  }

  _scatter(rig, ci, cj, dLat, dLon) {
    const { hs, def } = this, R = this.world.radius, radius = def.radius;
    const span = Math.ceil(radius / this.cell) + 1;
    this.anchor.copy(rig.pos);
    const cam = rig.pos, d = this._d, q = new THREE.Quaternion(), e = new THREE.Euler(), up = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1), qUp = new THREE.Quaternion();
    let n = 0;
    const maxN = Math.min(this.capacity, def.count | 0);
    // cells nearest the camera first, so the first instances are the nearest rocks (the fine
    // shadow tile draws only those: see nearCount)
    const order = this._order || (this._order = []);
    if (order.span !== span) {
      order.length = 0;
      for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) order.push([a, b, a * a + b * b]);
      order.sort((x, y) => x[2] - y[2]); order.span = span;
    }
    let nearN = 0;
    for (let o = 0; o < order.length && n < maxN; o++) {
      const i = ci + order[o][0], j = cj + order[o][1];
      const h0 = hash3(i, j, 17, 911);
      if ((h0 & 0xffff) / 65536 >= this.prob) continue;
      const h1 = hash3(i, j, 29, 911), h2 = hash3(i, j, 43, 911);
      const lat = (i + (h1 & 0xffff) / 65536) * dLat, lon = (j + (h1 >>> 16) / 65536) * dLon;
      latLonToDir(lat, lon, d);
      const ground = hs.height(d[0], d[1], d[2], 0.6);
      const r = R + ground;
      const x = d[0] * r, y = d[1] * r, z = d[2] * r;
      const dist = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
      if (dist > radius) continue;
      if (dist < this.nearRadius) nearN = n + 1;
      const u = (h2 & 0xffff) / 65536;
      const size = def.size[0] * Math.pow(def.size[1] / def.size[0], u * u);
      up.set(d[0], d[1], d[2]);
      e.set(((h2 >>> 16) / 65536 - 0.5) * 0.9, ((h0 >>> 16) / 65536 - 0.5) * 0.9, (h1 & 0xff) / 256 * Math.PI * 2);
      q.setFromEuler(e); qUp.setFromUnitVectors(zAxis, up); q.premultiply(qUp);
      const sink = size * 0.12;
      this.aOffset.setXYZ(n, x - d[0] * sink - cam.x, y - d[1] * sink - cam.y, z - d[2] * sink - cam.z);
      this.aQuat.setXYZW(n, q.x, q.y, q.z, q.w);
      const sx = 0.8 + 0.5 * ((h0 >>> 8) & 0xff) / 255, sy = 0.7 + 0.5 * ((h1 >>> 8) & 0xff) / 255, sz = 0.5 + 0.4 * ((h2 >>> 8) & 0xff) / 255;
      this.aScale.setXYZ(n, size * sx, size * sy, size * sz);
      // sunlight on it: what is known for this rock (by its cell), not what the slot last held
      // (after a re-scatter each rock wore another rock's light until the next answer)
      const key = i * 8388608 + j;
      this.slotKey[n] = key;
      this.aMisc.setXY(n, this.visByCell.get(key) ?? 1, 0.8 + 0.4 * ((h2 >>> 4) & 0xff) / 255);
      const h3 = hash3(i, j, 61, 911);
      this.aShape.setXYZW(n, (h3 & 0xff) / 256, ((h3 >>> 8) & 0xff) / 256, ((h3 >>> 16) & 0xff) / 256, (h3 >>> 24) / 256);
      this.points[n * 3] = x + d[0] * size * 0.4; this.points[n * 3 + 1] = y + d[1] * size * 0.4; this.points[n * 3 + 2] = z + d[2] * size * 0.4;
      n++;
    }
    this.count = n;
    this.nearCount = nearN;          // the instances that can fall inside nearRadius (they come first)
    this.geometry.instanceCount = Math.floor(n * (this.fraction ?? 1));
    this.aOffset.needsUpdate = this.aQuat.needsUpdate = this.aScale.needsUpdate = this.aMisc.needsUpdate = this.aShape.needsUpdate = true;
    void dirToLatLon; void G;
  }
}
