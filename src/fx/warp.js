// The look of very fast travel: streaks of light rushing past the traveller, drawn when
// the speed is far beyond anything near a world (a GO trip between planets, the stick
// held in open space). It is a picture of speed, not a thing in the world: nothing of it
// is lit or casts light. A fixed pool of line segments in the camera's own frame.
import * as THREE from 'three';

const N = 420;

export class Warp {
  constructor() {
    const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 4);
    for (let i = 0; i < N; i++) {
      // each streak: an angle round the axis, a distance from it, a phase along it, a brightness
      const a = Math.random() * Math.PI * 2, r = 0.25 + 2.2 * Math.pow(Math.random(), 0.7), ph = Math.random(), br = 0.35 + 0.65 * Math.random();
      for (let e = 0; e < 2; e++) { const o = (i * 2 + e) * 4; seed[o] = a; seed[o + 1] = r; seed[o + 2] = ph; seed[o + 3] = e ? -br : br; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.uniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uAspect: { value: 2 }, uTan: { value: 0.6 } };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: this.uniforms, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: /* glsl */`
        in vec4 aSeed;
        uniform float uTime, uAmount, uAspect, uTan;
        out float vB;
        void main() {
          // the streak's place along the view axis runs from far ahead to behind the eye
          float end = aSeed.w < 0.0 ? 1.0 : 0.0;
          float z = fract(aSeed.z - uTime * (0.55 + 0.5 * abs(aSeed.w)));          // 1 far ahead .. 0 at the eye
          float len = 0.02 + 0.16 * uAmount;
          float depth = 0.6 + 14.0 * (z + end * len) * (z + end * len);
          vec2 p = vec2(cos(aSeed.x), sin(aSeed.x)) * aSeed.y / depth;              // perspective: it flies outward as it nears
          vB = abs(aSeed.w) * uAmount * smoothstep(1.0, 0.75, z) * smoothstep(0.0, 0.12, z);
          gl_Position = vec4(p.x / (uTan * uAspect), p.y / uTan, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        in float vB;
        layout(location = 0) out vec4 fragColor;
        void main() { fragColor = vec4(vec3(0.62, 0.78, 1.0) * vB * 0.5, 0.0); }`,
    });
    this.lines = new THREE.LineSegments(g, mat);
    this.lines.frustumCulled = false; this.lines.renderOrder = 40; this.lines.visible = false;
    this.amount = 0; this.enabled = true;
  }

  // speed (m/s), clearance to the nearest surface (m), dt (s), the view's aspect and tan(half fov).
  update(speed, clearance, dt, aspect, tanHalf) {
    // "far beyond anything near a world": more than 2 000 km/s and well clear of everything
    const s = Math.min(1, Math.max(0, (Math.log10(Math.max(1, speed)) - 6.3) / 2.2)), far = Math.min(1, Math.max(0, clearance / 3e7 - 0.2));
    const want = this.enabled ? s * far : 0;
    this.amount += (want - this.amount) * Math.min(1, dt * 2.5);
    this.lines.visible = this.amount > 0.01;
    const u = this.uniforms;
    u.uAmount.value = this.amount; u.uAspect.value = aspect; u.uTan.value = tanHalf;
    u.uTime.value = (u.uTime.value + dt * (0.5 + 1.6 * this.amount)) % 1000;
  }
}
