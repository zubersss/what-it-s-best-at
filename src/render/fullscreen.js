// Full-screen triangle helper for LUT and post passes.
import * as THREE from 'three';

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export const FS_VERT = /* glsl */`
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export function makePassMaterial(fragmentShader, uniforms, extra = {}) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FS_VERT,
    fragmentShader: `precision highp float;\nprecision highp sampler2D;\n${fragmentShader}`,
    uniforms,
    depthTest: false,
    depthWrite: false,
    ...extra,
  });
}

const mesh = new THREE.Mesh(geometry, null);
mesh.frustumCulled = false;

// Renders `material` over the whole viewport of `target` (null = canvas).
export function renderPass(renderer, material, target) {
  mesh.material = material;
  renderer.setRenderTarget(target);
  // A clear tells tile-based mobile GPUs they need not restore the previous contents.
  renderer.clear(true, false, false);
  renderer.render(mesh, camera);
}

export const fullscreenGeometry = geometry;
