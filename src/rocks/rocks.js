// A few hundred GPU-instanced rocks scattered deterministically around the camera.
// One draw call (plus one in the shadow map). They shrink to nothing at the edge of
// their radius, so they never pop.
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { noise3, hash3 } from '../terrain/height/noise.js';
import { latLonToDir, dirToLatLon } from '../core/ephemeris.js';

const INSTANCE_VERT = /* glsl */`
in vec3 aOffset; in vec4 aQuat; in vec3 aScale; in vec2 aMisc;
uniform float uFadeRadius;
vec3 qrot(vec3 v, vec4 q) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 rockPosition(out vec3 centre) {
  centre = (modelMatrix * vec4(aOffset, 1.0)).xyz;
  float fade = 1.0 - smoothstep(uFadeRadius * 0.72, uFadeRadius, length(centre));
  return centre + qrot(position * aScale, aQuat) * fade;
}`;

function rockGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 1);          // 80 flat triangles
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const r = 0.78 + 0.34 * noise3(v.x * 1.7 + 3.1, v.y * 1.7 - 1.2, v.z * 1.7 + 8.8) + 0.12 * noise3(v.x * 4.1, v.y * 4.1, v.z * 4.1);
    v.multiplyScalar(r);
    if (v.z < -0.35) v.z = -0.35 - (v.z + 0.35) * 0.15;       // flattened base sits in the ground
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();                                 // non-indexed -> face normals
  geo.deleteAttribute('uv');
  return geo;
}

export class Rocks {
  constructor(world, hs) {
    this.world = world; this.hs = hs;
    const def = world.surface.rocks || { count: 0, radius: 100, size: [0.3, 1], albedo: [0.15, 0.1, 0.07] };
    this.def = def; this.capacity = 512;                // fixed instance buffer; a world may use fewer
    this.cell = 7;
    this.prob = Math.min(1, Math.min(this.capacity, def.count | 0) / (Math.PI * def.radius * def.radius / (this.cell * this.cell)) * 0.92);
    const base = rockGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.attributes.position); geo.setAttribute('normal', base.attributes.normal);
    const n = this.capacity;
    this.aOffset = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aQuat = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.aScale = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(n * 2).fill(1), 2);
    geo.setAttribute('aOffset', this.aOffset); geo.setAttribute('aQuat', this.aQuat); geo.setAttribute('aScale', this.aScale); geo.setAttribute('aMisc', this.aMisc);
    geo.instanceCount = 0;
    this.geometry = geo;
    this.trianglesPerRock = base.attributes.position.count / 3;
    const fade = { value: def.radius };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(),
      uniforms: { ...lightingUniforms(), uFadeRadius: fade, uRockAlbedo: { value: new THREE.Vector3(...def.albedo) }, uDustAlbedo: { value: new THREE.Vector3(...world.surface.dust) }, uRoughness: { value: world.surface.roughness ?? 0.5 } },
      vertexShader: /* glsl */`${INSTANCE_VERT}
        out vec3 vRel; out vec3 vN; out vec3 vLocal; out vec2 vMisc;
        void main() {
          vec3 c; vec3 rel = rockPosition(c);
          vRel = rel; vN = qrot(normal / aScale, aQuat); vLocal = position; vMisc = aMisc;
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform vec3 uRockAlbedo, uDustAlbedo; uniform float uRoughness;
        in vec3 vRel; in vec3 vN; in vec3 vLocal; in vec2 vMisc;
        layout(location = 0) out vec4 fragColor;
        void main() {
          vec3 N = normalize(vN);
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos), V = -normalize(vRel);
          float top = smoothstep(0.45, 0.95, dot(N, up));
          vec3 albedo = mix(uRockAlbedo * vMisc.y, uDustAlbedo, top * 0.55);       // dust settles on top
          float contact = mix(0.55, 1.0, smoothstep(-0.35, 0.25, vLocal.z));        // darker where it meets the ground
          vec3 direct = directSun(planetPos) * vMisc.x * nearShadow(vRel, N) * diffuseON(N, uSunDir, V, uRoughness);
          vec3 col = albedo * (direct + (skyLight(N, up) * contact + planetShine(N)) / PI);
          col = aerialPerspective(col, vRel);
          fragColor = vec4(col * uExposure, 1.0);
        }`,
    });
    this.depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, colorWrite: false, uniforms: { uFadeRadius: fade },
      vertexShader: /* glsl */`${INSTANCE_VERT}
        void main() { vec3 c; gl_Position = projectionMatrix * viewMatrix * vec4(rockPosition(c), 1.0); }`,
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
    this.mesh.visible = (def.count | 0) > 0;
    this.cellKey = ''; this.count = 0; this.geometry.instanceCount = 0; this.needVis = false;
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
      const want = [sun[0], sun[1], sun[2]], count = this.count, stamp = this.cellKey;
      const job = workers.run({ type: 'points', points: this.points.slice(0, count * 3), sun: want, sunHalf, minWL: 0.6 });
      if (job) {
        this.pendingVis = true; this.needVis = false;
        job.then((res) => {
          this.pendingVis = false;
          if (stamp !== this.cellKey) { this.needVis = true; return; }
          for (let i = 0; i < count; i++) this.aMisc.array[i * 2] = res.vis[i];
          this.aMisc.needsUpdate = true; this.visSun = want;
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
    for (let a = -span; a <= span && n < maxN; a++) for (let b = -span; b <= span && n < maxN; b++) {
      const i = ci + a, j = cj + b;
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
      this.aMisc.setXY(n, this.aMisc.array[n * 2] ?? 1, 0.8 + 0.4 * ((h2 >>> 4) & 0xff) / 255);
      this.points[n * 3] = x + d[0] * size * 0.4; this.points[n * 3 + 1] = y + d[1] * size * 0.4; this.points[n * 3 + 2] = z + d[2] * size * 0.4;
      n++;
    }
    this.count = n;
    this.geometry.instanceCount = Math.floor(n * (this.fraction ?? 1));
    this.aOffset.needsUpdate = this.aQuat.needsUpdate = this.aScale.needsUpdate = this.aMisc.needsUpdate = true;
    void dirToLatLon; void G;
  }
}
