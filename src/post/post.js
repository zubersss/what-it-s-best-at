// HDR scene target + post chain: metering, half-res bloom, AgX tone map, sRGB, dither.
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
float A(vec2 o) { return texture(tSrc, min((vUv + o * uTexel) * uUvScale, uUvMax)).a; }
void main() {
  // 13-tap downsample (Jimenez 2014): stable under motion, no fireflies after the clamp.
  vec3 a = S(vec2(-2.0, 2.0)), b = S(vec2(0.0, 2.0)), c = S(vec2(2.0, 2.0));
  vec3 d = S(vec2(-2.0, 0.0)), e = S(vec2(0.0, 0.0)), f = S(vec2(2.0, 0.0));
  vec3 g = S(vec2(-2.0, -2.0)), h = S(vec2(0.0, -2.0)), i = S(vec2(2.0, -2.0));
  vec3 j = S(vec2(-1.0, 1.0)), k = S(vec2(1.0, 1.0)), l = S(vec2(-1.0, -1.0)), m = S(vec2(1.0, -1.0));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  // alpha = fraction of the footprint covered by lit surfaces (0 for sky, stars, Sun)
  float cover = 0.25 * (A(vec2(-1.0, 1.0)) + A(vec2(1.0, 1.0)) + A(vec2(-1.0, -1.0)) + A(vec2(1.0, -1.0)));
  outColor = vec4(col, cover);
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
uniform sampler2D tScene;  // the full-resolution HDR scene, for exact per-pixel samples
uniform vec2 uViewSize;    // its used size in pixels
uniform float uFloor;      // fraction of the frame mean below which texels stop pulling exposure up
in vec2 vUv;
out vec4 outColor;
float cover;
float lumAt(int x, int y) {
  vec4 c = texture(tSrc, (vec2(float(x), float(y)) + 0.5) / vec2(32.0, 18.0));
  cover = c.a;
  return dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  // Centre-weighted average of log2 luminance over a 32 x 18 grid. Texels far darker than
  // the frame's mean (a black airless sky, deep shadow) are floored at a fraction of that
  // mean, so they pull the exposure up only a little — like a camera's matrix metering.
  float mean = 0.0;
  for (int y = 0; y < 18; y++) for (int x = 0; x < 32; x++) mean += lumAt(x, y);
  mean /= 576.0;
  float floorLum = max(mean * uFloor, 1e-7);
  float sum = 0.0, wsum = 0.0, peak = 0.0;
  for (int y = 0; y < 18; y++) {
    for (int x = 0; x < 32; x++) {
      vec2 d = ((vec2(float(x), float(y)) + 0.5) / vec2(32.0, 18.0) - 0.5) * vec2(1.0, 1.15);
      float w = exp(-dot(d, d) * 3.0);
      float l = lumAt(x, y);
      sum += w * log2(max(l, floorLum));
      wsum += w;
      if (cover > 0.2) peak = max(peak, l / cover);   // brightest region that is a lit surface
    }
  }
  // Lit surfaces only, from single pixels of the scene (alpha is exactly 1 on a lit
  // surface and 0 on sky, stars and the Sun, so nothing bleeds in): how much of the frame
  // they cover, and how bright their bright parts are (mean weighted by brightness, so a
  // half-lit globe counts as its day side).
  float s1 = 0.0, s2 = 0.0, n = 0.0;
  for (int y = 0; y < 18; y++) for (int x = 0; x < 32; x++) {
    vec4 c = texelFetch(tScene, ivec2((vec2(float(x), float(y)) + 0.5) / vec2(32.0, 18.0) * uViewSize), 0);
    if (c.a < 0.5) continue;
    float l = min(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)), 48.0);
    s1 += l; s2 += l * l; n += 1.0;
  }
  outColor = vec4(sum / wsum, peak, s2 / max(s1, 1e-9), n / 576.0);
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
    this.bloomEnabled = true;

    // Auto exposure state
    this.settings = { key: 0.16, min: 0.5, max: 6e5, speed: 1.6, shadowFloor: 0.2, highlight: 6, surface: 0.6, ...exposureSettings };
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
    this.meterMat = makePassMaterial(METER_FRAG, { tSrc: { value: null }, tScene: { value: null }, uViewSize: { value: new THREE.Vector2(1, 1) }, uFloor: { value: this.settings.shadowFloor } });
    this.compositeMat = makePassMaterial(COMPOSITE_FRAG, {
      tScene: { value: null }, tBloom: { value: null }, tBlueNoise: { value: noise },
      uUvScale: { value: new THREE.Vector2(1, 1) }, uUvMax: { value: new THREE.Vector2(1, 1) },
      uBloom: { value: CONFIG.BLOOM_STRENGTH }, uBloomNorm: { value: 0.2 }, uNoiseSize: { value: BLUE_NOISE_SIZE },
    });
  }

  setExposureSettings(s) {
    this.settings = { key: 0.16, min: 0.5, max: 6e5, speed: 1.6, shadowFloor: 0.2, highlight: 6, surface: 0.6, ...s };
    this.meterMat.uniforms.uFloor.value = this.settings.shadowFloor;
  }

  resize(width, height) {
    this.width = Math.max(2, width | 0); this.height = Math.max(2, height | 0);
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.scene?.dispose();
    this.scene = new THREE.WebGLRenderTarget(this.width, this.height, { ...opts, depthBuffer: true, stencilBuffer: false });
    this.scene.texture.colorSpace = THREE.NoColorSpace;
    this.scene.scissorTest = true;
    for (const t of this.bloomDown) t.dispose();
    for (const t of this.bloomUp) t.dispose();
    this.bloomDown = []; this.bloomUp = [];
    // The bloom chain does not need to follow the native size: its first level is capped
    // at about 0.6 M pixels, which keeps its cost flat on very dense screens.
    const first = Math.max(2, Math.sqrt(this.width * this.height / 600000));
    let w = Math.round(this.width / first) * 2, h = Math.round(this.height / first) * 2, bytes = this.width * this.height * (8 + 4);
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
    r.setClearColor(0x000000, 0);      // alpha 0 = "not a lit surface" (used by the metering)
    // The target is native-sized but only the governor's sub-rectangle is used: the clear
    // is scissored to it, so a tile-based GPU never touches the tiles outside.
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

    // Metering from the 1/16-res level: every part of the frame contributes (a small bright
    // object cannot fall between samples), and the clamp keeps the solar disc from dominating.
    this.meterMat.uniforms.tSrc.value = this.bloomDown[3].texture;
    this.meterMat.uniforms.tScene.value = this.scene.texture;
    this.meterMat.uniforms.uViewSize.value.set(this.viewW, this.viewH);
    renderPass(r, this.meterMat, this.meterTarget);
    this._meter(dt);

    // Upsample chain (skipped when the governor has switched bloom off).
    const um = this.upMat.uniforms;
    let acc = this.bloomDown[this.bloomDown.length - 1];
    for (let i = this.bloomUp.length - 1; i >= 0 && this.bloomEnabled; i--) {
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
    cm.uBloom.value = this.bloomEnabled ? CONFIG.BLOOM_STRENGTH : 0;
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
      let target = s.key / Math.pow(2, this.measuredLog2);
      // Highlight priority: a sunlit surface (the hero in space, a planet filling the view)
      // may not be pushed more than `highlight` times over white, however dark the rest is.
      const peak = this._readBuf[1] / used;
      if (peak > 0) target = Math.min(target, s.highlight / peak);
      // Subject priority: once lit surfaces are more than a small part of the frame (a
      // planet from space, not a figure against the stars) their bright parts may not go
      // above `surface`, however much black surrounds them.
      const bright = this._readBuf[2] / used, cover = this._readBuf[3];
      if (bright > 0) {
        const x = Math.min(1, Math.max(0, (cover - 0.01) / 0.05)), k = x * x * (3 - 2 * x);
        target = Math.min(target, s.highlight * Math.pow(s.surface / s.highlight, k) / bright);
      }
      this.surfaceCover = cover; this.surfaceBright = bright * target;
      target = Math.min(s.max, Math.max(s.min, target));
      this.stableReads = Math.abs(Math.log2(target / used)) < 0.03 ? this.stableReads + 1 : 0;
      this.targetExposure = target;
    }).catch(() => { this._readPending = false; });
  }
}
