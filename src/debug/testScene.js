// Stage-1 placeholder content: an HDR gradient sky with a solar disc and a flat lit
// ground disc. Exists only to exercise the post chain before real modules land.
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { fullscreenGeometry } from '../render/fullscreen.js';

export function makeTestFar(camera) {
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    uniforms: { ...G, uInvViewProj: { value: new THREE.Matrix4() }, uUp: { value: new THREE.Vector3() } },
    vertexShader: `in vec3 position; out vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `precision highp float;
      uniform mat4 uInvViewProj; uniform vec3 uSunDir; uniform vec3 uUp; uniform float uExposure; uniform vec3 uSunIrradiance;
      in vec2 vNdc; out vec4 o;
      void main(){
        vec4 p = uInvViewProj * vec4(vNdc, 1.0, 1.0); vec3 d = normalize(p.xyz / p.w);
        float h = clamp(dot(d, uUp), -1.0, 1.0);
        vec3 sky = mix(vec3(0.09, 0.06, 0.035), vec3(0.02, 0.016, 0.012), smoothstep(0.0, 0.6, h)) * uSunIrradiance.r;
        float c = dot(d, uSunDir);
        sky += vec3(0.4, 0.5, 0.7) * 0.02 * pow(max(c, 0.0), 64.0);
        float disc = smoothstep(cos(0.0033), cos(0.0029), c);
        vec3 col = sky + disc * 14000.0 * 0.02 * uSunIrradiance;
        o = vec4(min(col * uExposure, vec3(60000.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(fullscreenGeometry, mat);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = () => {
    mat.uniforms.uInvViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
  };
  return mesh;
}

export function makeTestGround() {
  const geo = new THREE.CircleGeometry(4000, 96);
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...G, uN: { value: new THREE.Vector3(0, 0, 1) } },
    vertexShader: `out vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uSunDir; uniform vec3 uN; uniform float uExposure; uniform vec3 uSunIrradiance; in vec3 vP; out vec4 o;
      void main(){
        vec2 g = abs(fract(vP.xy / 10.0) - 0.5);
        float line = smoothstep(0.48, 0.5, max(g.x, g.y));
        vec3 albedo = mix(vec3(0.30, 0.165, 0.08), vec3(0.12, 0.07, 0.04), line);
        vec3 col = albedo / 3.14159 * (uSunIrradiance * max(dot(uN, uSunDir), 0.0) * 0.05 + vec3(0.03, 0.02, 0.012));
        o = vec4(col * uExposure, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
