// A stroke of lightning to the ground: a jagged line from the cloud's base down, with a
// branch or two, there for a quarter of a second and flickering. (The light it throws on
// the clouds and the land is the Weather's: `flashLight`.)
import * as THREE from 'three';

const MAX = 96;      // line pieces

export class Bolt {
  constructor(shared) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.uniforms = { uExposure: shared.uExposure, uBoltGlow: { value: 0 } };
    this.mesh = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: this.uniforms, depthTest: true, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: 'void main() { gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uExposure, uBoltGlow; layout(location = 0) out vec4 fragColor; void main() { fragColor = vec4(vec3(0.85, 0.9, 1.0) * (uBoltGlow * uExposure), 0.0); }',
    }));
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.seen = null;
  }

  // Every frame. weather: the Weather (its flash and local frame); agl: the camera's height above the ground (m).
  update(weather, agl, sunE = 1) {
    const f = weather.flash;
    if (!f || !f.ground) { this.mesh.visible = false; this.seen = null; return; }
    if (this.seen !== f) {
      // a new stroke: from where its light is (the cloud's base) to the ground below it
      this.seen = f;
      const e = weather._e, n = weather._n, u = weather._u, top = f.dir.clone().multiplyScalar(f.dist), P = this.pos;
      const height = Math.max(200, top.x * u[0] + top.y * u[1] + top.z * u[2] + agl);
      let k = 0, rnd = (() => { let s = (f.seed * 1e6) | 0 || 7; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s >>>= 0) / 4294967296)); })();
      const walk = (x, y, z, drop, steps, wander) => {
        for (let i = 0; i < steps && k < MAX; i++) {
          const dx = (rnd() - 0.5) * wander, dy = (rnd() - 0.5) * wander, dz = -drop / steps;
          const nx = x + e[0] * dx + n[0] * dy + u[0] * dz, ny = y + e[1] * dx + n[1] * dy + u[1] * dz, nz = z + e[2] * dx + n[2] * dy + u[2] * dz;
          P.set([x, y, z, nx, ny, nz], k * 6); k++;
          // a branch now and then, shorter, that stops in the air
          if (steps > 12 && rnd() < 0.12 && k < MAX - 8) walk(nx, ny, nz, drop * 0.25 * rnd(), 5, wander * 1.3);
          x = nx; y = ny; z = nz;
        }
      };
      walk(top.x, top.y, top.z, height, 30, height * 0.05);
      this.geo.setDrawRange(0, k * 2); this.geo.attributes.position.needsUpdate = true;
    }
    const flick = Math.max(0, Math.sin(f.age * 38 + f.seed * 6) * 0.5 + 0.5) * Math.exp(-f.age * 10);
    this.uniforms.uBoltGlow.value = 400 * sunE * f.power * flick;          // (far brighter than anything sunlit: it blooms)
    this.mesh.visible = flick > 0.02;
  }
}
