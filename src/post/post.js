// HDR scene target + post chain: metering, half-res bloom, AgX tone map, sRGB, dither.
// Nothing else belongs here (see CLAUDE.md "Do not build").
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makePassMaterial, renderPass } from '../render/fullscreen.js';
import { BLUE_NOISE_BASE64, BLUE_NOISE_SIZE } from './blueNoiseData.js';

const DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;     // source texel size in source UV
uniform vec2 uUvScale;   // used region of the source (dynamic resolution)
uniform vec2 uUvMax;
uniform float uClamp;
in vec2 vUv;
out vec4 outColor;
vec3 S(vec2 o) { return min(texture(tSrc, min((vUv + o * uTexel) * uUvScale, uUvMax)).rgb, vec3(uClamp)); }
void main() {
  // 13-tap downsample (Jimenez 2014): stable under motion, no fireflies after the clamp.
  vec3 a = S(vec2(-2.0, 2.0)), b = S(vec2(0.0, 2.0)), c = S(vec2(2.0, 2.0));
  vec3 d = S(vec2(-2.0, 0.0)), e = S(vec2(0.0, 0.0)), f = S(vec2(2.0, 0.0));
  vec3 g = S(vec2(-2.0, -2.0)), h = S(vec2(0.0, -2.0)), i = S(vec2(2.0, -2.0));
  vec3 j = S(vec2(-1.0, 1.0)), k = S(vec2(1.0, 1.0)), l = S(vec2(-1.0, -1.0)), m = S(vec2(1.0, -1.0));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  outColor = vec4(col, 1.0);
}`;

const UP_FRAG = /* glsl */`
uniform sampler2D tSrc;    // smaller level (already accumulated)
uniform sampler2D tBase;   // this level's downsample
uniform vec2 uTexel;       // tSrc texel size
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 s = vec3(0.0);
  s += texture(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  s += texture(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  s += 2.0 * (texture(tSrc, vUv + vec2(-1.0, 0.0) * uTexel).rgb + texture(tSrc, vUv + vec2(1.0, 0.0) * uTexel).rgb);
  s += 2.0 * (texture(tSrc, vUv + vec2(0.0, -1.0) * uTexel).rgb + texture(tSrc, vUv + vec2(0.0, 1.0) * uTexel).rgb);
  s += 4.0 * texture(tSrc, vUv).rgb;
  outColor = vec4(texture(tBase, vUv).rgb + s / 16.0, 1.0);
}`;

const METER_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform float uFloor;      // fraction of the frame mean below which texels stop pulling exposure up
in vec2 vUv;
out vec4 outColor;
float lumAt(int x, int y) {
  vec3 c = texture(tSrc, (vec2(float(x), float(y)) + 0.5) / vec2(32.0, 18.0)).rgb;
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  // Centre-weighted average of log2 luminance over a 32 x 18 grid. Texels far darker than
  // the frame's mean (a black airless sky, deep shadow) are floored at a fraction of that
  // mean, so they pull the exposure up only a little — like a camera's matrix metering.
  float mean = 0.0;
  for (int y = 0; y < 18; y++) for (int x = 0; x < 32; x++) mean += lumAt(x, y);
  mean /= 576.0;
  float floorLum = max(mean * uFloor, 1e-7);
  float sum = 0.0, wsum = 0.0;
  for (int y = 0; y < 18; y++) {
    for (int x = 0; x < 32; x++) {
      vec2 d = ((vec2(float(x), float(y)) + 0.5) / vec2(32.0, 18.0) - 0.5) * vec2(1.0, 1.15);
      float w = exp(-dot(d, d) * 3.0);
      sum += w * log2(max(lumAt(x, y), floorLum));
      wsum += w;
    }
  }
  outColor = vec4(sum / wsum, 0.0, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tBlueNoise;
uniform vec2 uUvScale;
uniform vec2 uUvMax;
uniform float uBloom;
uniform float uBloomNorm;
uniform float uNoiseSize;
in vec2 vUv;
out vec4 outColor;

// AgX (Troy Sobotka), minimal fit after Benjamin Wrensch. Input: linear Rec.709, exposed.
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 v) {
  const mat3 inMat = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                          0.0784335999999992, 0.878468636469772, 0.0784336,
                          0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 outMat = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                           -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                           -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  const float minEv = -12.47393, maxEv = 4.026069;
  v = inMat * max(v, vec3(0.0));
  v = clamp(log2(max(v, vec3(1e-10))), minEv, maxEv);
  v = (v - minEv) / (maxEv - minEv);
  v = agxContrast(v);
  v = outMat * v;
  return clamp(v, 0.0, 1.0);   // display-encoded (2.2)
}

void main() {
  vec3 scene = texture(tScene, min(vUv * uUvScale, uUvMax)).rgb;
  vec3 bloom = texture(tBloom, vUv).rgb * uBloomNorm;
  vec3 c = mix(scene, bloom, uBloom);
  c = agx(c);
  // Blue-noise dither, triangular PDF, one 8-bit step wide: removes sky banding.
  float n = texture(tBlueNoise, gl_FragCoord.xy / uNoiseSize).r;
  float t = n * 2.0 - 1.0;
  t = sign(t) * (1.0 - sqrt(1.0 - abs(t)));
  c += t / 255.0;
  outColor = vec4(c, 1.0);
}`;

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class PostPipeline {
  constructor(renderer, exposureSettings) {
    this.renderer = renderer;
    this.width = 1; this.height = 1;
    this.scale = 1;
    this.viewW = 1; this.viewH = 1;
    this.scene = null;
    this.bloomDown = []; this.bloomUp = [];
    this.gpuBytes = 0;

    // Auto exposure state
    this.settings = { key: 0.16, min: 0.5, max: 6e5, speed: 1.6, shadowFloor: 0.2, ...exposureSettings };
    this.exposure = 20;
    this.targetExposure = 20;
    this.measuredLog2 = 0;
    this.instant = false;              // screenshot mode: converge immediately
    this.stableReads = 0;
    this._readPending = false;
    this._readBuf = new Float32Array(4);
    this.meterTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });

    const noise = new THREE.DataTexture(decodeBase64(BLUE_NOISE_BASE64), BLUE_NOISE_SIZE, BLUE_NOISE_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
    noise.minFilter = noise.magFilter = THREE.NearestFilter;
    noise.needsUpdate = true;
    this.blueNoise = noise;

    this.downMat = makePassMaterial(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uUvScale: { value: new THREE.Vector2(1, 1) }, uUvMax: { value: new THREE.Vector2(1, 1) }, uClamp: { value: 1e9 } });
    this.upMat = makePassMaterial(UP_FRAG, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.meterMat = makePassMaterial(METER_FRAG, { tSrc: { value: null }, uFloor: { value: this.settings.shadowFloor } });
    this.compositeMat = makePassMaterial(COMPOSITE_FRAG, {
      tScene: { value: null }, tBloom: { value: null }, tBlueNoise: { value: noise },
      uUvScale: { value: new THREE.Vector2(1, 1) }, uUvMax: { value: new THREE.Vector2(1, 1) },
      uBloom: { value: CONFIG.BLOOM_STRENGTH }, uBloomNorm: { value: 0.2 }, uNoiseSize: { value: BLUE_NOISE_SIZE },
    });
  }

  resize(width, height) {
    this.width = Math.max(2, width | 0); this.height = Math.max(2, height | 0);
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.scene?.dispose();
    this.scene = new THREE.WebGLRenderTarget(this.width, this.height, { ...opts, depthBuffer: true, stencilBuffer: false });
    this.scene.texture.colorSpace = THREE.NoColorSpace;
    for (const t of this.bloomDown) t.dispose();
    for (const t of this.bloomUp) t.dispose();
    this.bloomDown = []; this.bloomUp = [];
    let w = this.width, h = this.height, bytes = this.width * this.height * (8 + 4);
    for (let i = 0; i < CONFIG.BLOOM_LEVELS; i++) {
      w = Math.max(2, w >> 1); h = Math.max(2, h >> 1);
      this.bloomDown.push(new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: false }));
      if (i < CONFIG.BLOOM_LEVELS - 1) this.bloomUp.push(new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: false }));
      bytes += w * h * 8 * (i < CONFIG.BLOOM_LEVELS - 1 ? 2 : 1);
    }
    this.gpuBytes = bytes;
    this.setScale(this.scale);
  }

  setScale(scale) {
    this.scale = scale;
    this.viewW = Math.max(2, Math.round(this.width * scale));
    this.viewH = Math.max(2, Math.round(this.height * scale));
    this.scene.viewport.set(0, 0, this.viewW, this.viewH);
    this.scene.scissor.set(0, 0, this.viewW, this.viewH);
  }

  // Binds the HDR target with the current sub-viewport and clears it.
  beginScene() {
    const r = this.renderer;
    this.exposureUsed = this.exposure;       // what this frame's shaders were given
    r.setRenderTarget(this.scene);
    r.setClearColor(0x000000, 1);
    // Whole-target clear (not scissored to the sub-viewport): the fast path on tile-based GPUs.
    r.clear(true, true, false);
  }

  // Call right after the last scene draw: the depth buffer is not needed any more, so a
  // tile-based GPU does not have to write it back to memory.
  endScene() {
    const gl = this.renderer.getContext();
    gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.DEPTH_ATTACHMENT]);
  }

  render(dt) {
    const r = this.renderer;
    const sx = this.viewW / this.width, sy = this.viewH / this.height;
    const maxU = (this.viewW - 0.5) / this.width, maxV = (this.viewH - 0.5) / this.height;

    // Bloom downsample chain. Level 0 reads the (sub-viewport of the) HDR scene.
    const dm = this.downMat.uniforms;
    for (let i = 0; i < this.bloomDown.length; i++) {
      const src = i === 0 ? this.scene : this.bloomDown[i - 1];
      dm.tSrc.value = src.texture;
      if (i === 0) {
        dm.uTexel.value.set(1 / this.viewW, 1 / this.viewH);
        dm.uUvScale.value.set(sx, sy); dm.uUvMax.value.set(maxU, maxV); dm.uClamp.value = 48.0;
      } else {
        dm.uTexel.value.set(1 / src.width, 1 / src.height);
        dm.uUvScale.value.set(1, 1); dm.uUvMax.value.set(1, 1); dm.uClamp.value = 1e9;
      }
      renderPass(r, this.downMat, this.bloomDown[i]);
    }

    // Metering from the quarter-res level (already clamped, so the solar disc cannot dominate).
    this.meterMat.uniforms.tSrc.value = this.bloomDown[1].texture;
    renderPass(r, this.meterMat, this.meterTarget);
    this._meter(dt);

    // Upsample chain.
    const um = this.upMat.uniforms;
    let acc = this.bloomDown[this.bloomDown.length - 1];
    for (let i = this.bloomUp.length - 1; i >= 0; i--) {
      um.tSrc.value = acc.texture; um.tBase.value = this.bloomDown[i].texture;
      um.uTexel.value.set(1 / acc.width, 1 / acc.height);
      renderPass(r, this.upMat, this.bloomUp[i]);
      acc = this.bloomUp[i];
    }

    const cm = this.compositeMat.uniforms;
    cm.tScene.value = this.scene.texture; cm.tBloom.value = acc.texture;
    cm.uUvScale.value.set(sx, sy); cm.uUvMax.value.set(maxU, maxV);
    // The accumulated bloom is a sum over levels; normalise so strength is a true mix weight.
    cm.uBloomNorm.value = 1 / this.bloomDown.length;
    renderPass(r, this.compositeMat, null);
  }

  _meter(dt) {
    const s = this.settings;
    // Smooth toward the last known target every frame.
    const used = this.exposureUsed;
    const k = this.instant ? 1 : 1 - Math.exp(-dt * s.speed);
    this.exposure = Math.exp(Math.log(this.exposure) + (Math.log(this.targetExposure) - Math.log(this.exposure)) * k);
    if (this._readPending) return;
    this._readPending = true;
    this.renderer.readRenderTargetPixelsAsync(this.meterTarget, 0, 0, 1, 1, this._readBuf).then(() => {
      this._readPending = false;
      const log2Pre = this._readBuf[0];
      if (!Number.isFinite(log2Pre)) return;
      this.measuredLog2 = log2Pre - Math.log2(used);           // scene luminance, log2
      const target = Math.min(s.max, Math.max(s.min, s.key / Math.pow(2, this.measuredLog2)));
      this.stableReads = Math.abs(Math.log2(target / used)) < 0.03 ? this.stableReads + 1 : 0;
      this.targetExposure = target;
    }).catch(() => { this._readPending = false; });
  }
}
