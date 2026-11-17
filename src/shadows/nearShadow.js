// The one shadow map: 2048^2, orthographic along the Sun, covering ~150 m around the
// camera. Only the ship and rocks render into it (terrain shadows are baked per chunk).
// Publishes tNearShadow / uShadowMatrix / uShadowParams into the shared uniforms.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { G } from '../render/globals.js';

export class NearShadow {
  constructor(renderer) {
    this.renderer = renderer;
    const N = CONFIG.NEAR_SHADOW_SIZE, R = CONFIG.NEAR_SHADOW_RADIUS;
    this.size = N; this.radius = R;
    const depth = new THREE.DepthTexture(N, N, THREE.UnsignedIntType);
    depth.compareFunction = THREE.LessEqualCompare;         // hardware PCF through sampler2DShadow
    depth.minFilter = depth.magFilter = THREE.LinearFilter;
    this.target = new THREE.WebGLRenderTarget(N, N, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: true, depthTexture: depth, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.depth = depth;
    this.gpuBytes = N * N * 5;
    this.range = 420;                                        // depth extent along the Sun (m)
    this.camera = new THREE.OrthographicCamera(-R, R, R, -R, 1, 1 + this.range);
    this.casters = [];                                       // { mesh, depthMaterial }
    G.tNearShadow = { value: depth };
    G.uShadowMatrix = { value: new THREE.Matrix4() };
    G.uShadowParams = { value: new THREE.Vector3(R, 1 / N, 0) };   // radius, texel (uv), enabled
    this._lx = new THREE.Vector3(); this._ly = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this._bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  }

  // isVisible: optional predicate (a mesh inside a hidden group still reports visible).
  addCaster(mesh, depthMaterial, isVisible = null) { this.casters.push({ mesh, depthMaterial, isVisible }); }
  removeCaster(mesh) { this.casters = this.casters.filter((c) => c.mesh !== mesh); }
  _on(c) { return c.mesh.visible && (!c.isVisible || c.isVisible()); }

  // camPos: planet-fixed doubles; sunDir: unit; localUp: array.
  render(camPos, sunDir, localUp) {
    const elevationSin = sunDir.x * localUp[0] + sunDir.y * localUp[1] + sunDir.z * localUp[2];
    const enabled = elevationSin > -0.02 && this.casters.some((c) => this._on(c));
    G.uShadowParams.value.z = enabled ? 1 : 0;
    if (!this.initialised) {
      // The depth texture must exist even when shadows are off (night): a shadow sampler
      // bound to an unallocated texture makes every lit draw call fail.
      this.initialised = true;
      this.renderer.setRenderTarget(this.target);
      this.renderer.clear(true, true, false);
    }
    if (!enabled) return;
    // Light basis; lz = toward the Sun.
    const lz = sunDir, lx = this._lx, ly = this._ly;
    lx.set(localUp[0], localUp[1], localUp[2]).cross(lz);
    if (lx.lengthSq() < 1e-8) lx.set(1, 0, 0).cross(lz);
    lx.normalize(); ly.crossVectors(lz, lx);
    // Snap the map centre to whole texels so shadows do not crawl as the camera moves.
    const texel = 2 * this.radius / this.size;
    const cx = camPos.dot(lx), cy = camPos.dot(ly);
    const ox = Math.round(cx / texel) * texel - cx, oy = Math.round(cy / texel) * texel - cy;
    const cam = this.camera, D = 1 + this.range * 0.5;
    cam.position.set(lx.x * ox + ly.x * oy + lz.x * D, lx.y * ox + ly.y * oy + lz.y * D, lx.z * ox + ly.z * oy + lz.z * D);
    this._m.makeBasis(lx, ly, lz);
    cam.quaternion.setFromRotationMatrix(this._m);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    G.uShadowMatrix.value.copy(this._bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.clear(true, true, false);
    for (const c of this.casters) {
      if (!this._on(c)) continue;
      const keep = c.mesh.material;
      c.mesh.material = c.depthMaterial;
      r.render(c.mesh, cam);
      c.mesh.material = keep;
    }
    const gl = r.getContext();
    gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT0]);   // only depth is kept
  }
}

// GLSL used by the shared lighting chunk.
export const NEAR_SHADOW_PARS = /* glsl */`
uniform highp sampler2DShadow tNearShadow;
uniform mat4 uShadowMatrix;
uniform vec3 uShadowParams;     // radius (m), texel size (uv), enabled
// (uQuality is declared by the lighting chunk that includes this.)
// Visibility of the Sun (0..1) from ship/rock shadows at a camera-relative position.
float nearShadow(vec3 rel, vec3 N) {
  float d = length(rel);
  if (uShadowParams.z < 0.5 || d > uShadowParams.x) return 1.0;
  vec3 c = (uShadowMatrix * vec4(rel + N * 0.05, 1.0)).xyz;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  c.z -= 0.00025;
  float s;
  if (uQuality.y > 0.5) {
    float t = uShadowParams.y * 0.75;
    s = 0.25 * (texture(tNearShadow, vec3(c.xy + vec2(-t, -t * 0.4), c.z)) + texture(tNearShadow, vec3(c.xy + vec2(t, t * 0.4), c.z))
              + texture(tNearShadow, vec3(c.xy + vec2(-t * 0.4, t), c.z)) + texture(tNearShadow, vec3(c.xy + vec2(t * 0.4, -t), c.z)));
  } else s = texture(tNearShadow, c);          // governor step: one filtered tap
  return mix(s, 1.0, smoothstep(uShadowParams.x * 0.8, uShadowParams.x, d));
}
`;
