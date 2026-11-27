// HDR scene target + post chain: metering, half-res bloom, AgX tone map, sRGB, dither.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makePassMaterial, renderPass } from '../render/fullscreen.js';
import { BLUE_NOISE_BASE64, BLUE_NOISE_SIZE } from './blueNoiseData.js';
import { STORM } from '../weather/storm.js';

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
uniform vec3 uSunGrid;     // the Sun's disc on the 32 x 18 grid: centre (texels), radius plus margin (texels); radius < 0: not in view
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
      // brightest region that is a lit surface; never next to the Sun's disc, whose light
      // shares those texels and would read as a lit surface many times over white
      vec2 toSun = (vec2(float(x), float(y)) + 0.5) - uSunGrid.xy;
      if (cover > 0.2 && dot(toSun, toSun) > uSunGrid.z * uSunGrid.z) peak = max(peak, l / cover);
    }
  }
  // Lit surfaces only, from single pixels of the scene (alpha is exactly 1 on a lit
  // surface and 0 on sky, stars and the Sun, so nothing bleeds in): how much of the frame
  // they cover, and how bright their bright parts are. The mean is weighted by the square
  // root of brightness: a half-lit globe or a crescent counts as its day side, yet a small
  // white object (a lander on dark ground) cannot speak for the whole scene.
  float s1 = 0.0, s2 = 0.0, n = 0.0;
  for (int y = 0; y < 18; y++) for (int x = 0; x < 32; x++) {
    vec4 c = texelFetch(tScene, ivec2((vec2(float(x), float(y)) + 0.5) / vec2(32.0, 18.0) * uViewSize), 0);
    if (c.a < 0.5) continue;
    float l = min(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)), 48.0), r = sqrt(l);
    s1 += r; s2 += l * r; n += 1.0;
  }
  outColor = vec4(sum / wsum, peak, s2 / max(s1, 1e-9), n / 576.0);
}`;

// The Sun's beams (the painted look): along the line from a pixel to the Sun, how much
// bright sky there is. Where trunks and crowns stand in that line the sum is small, so the
// light comes in shafts between them. Twelve steps, each begun a little differently from
// pixel to pixel so the steps do not show; strongest near the Sun. Drawn into a picture a
// quarter of the view each way and added in the last pass: at the screen's own size the
// twelve looks a pixel were among the dearest things in the frame on the test phone.
const SHAFT_FRAG = /* glsl */`
uniform sampler2D tShaft;   // the picture at half size (the first step of the bloom): what the beams are cut from
uniform sampler2D tBlueNoise;
uniform float uNoiseSize;
uniform vec4 uShaft;        // xy: the Sun on screen (0..1), z: strength of its beams, w: the picture's width over its height
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
void main() {
  vec2 d = uShaft.xy - vUv;
  float j = texture(tBlueNoise, gl_FragCoord.xy / uNoiseSize).r, far = length(d * vec2(uShaft.w, 1.0));
  vec3 s = vec3(0.0);
  // (only the sky's light counts: the half-size picture's fourth number is how much of a
  // place is lit ground, which is in the way of a beam, not its source)
  // (no place counts for more than a bright sky does: with the Sun's own disc in the sum,
  // whether a step happened to land on it showed as a pattern of dots)
  for (int i = 0; i < 12; i++) { float t = (float(i) + j) / 12.0; vec4 q = texture(tShaft, clamp(vUv + d * t, 0.0, 1.0)); s += min(q.rgb, vec3(1.6)) * (1.0 - q.a) * (1.0 - 0.5 * t); }
  fragColor = vec4(s * (0.075 * uShaft.z * exp(-far * 2.4)), 1.0);
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
uniform vec4 uGrade;        // the painted look's grade: x saturation, y contrast, z how much of the two tints
uniform vec3 uGradeShade;   // tint of the dark half of the picture
uniform vec3 uGradeLight;   // tint of the light half
uniform sampler2D tShaft;   // the Sun's beams, on a small picture of their own
uniform vec4 uShaft;        // xy: the Sun on screen (0..1), z: strength of its beams (0: none), w: the picture's width over its height
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
  // (the Sun's beams, worked out on a small picture of their own: SHAFT_FRAG)
  if (uShaft.z > 0.0) c += texture(tShaft, vUv).rgb;
  c = agx(c);
  // The grade of a painted look (render/look.js): the darks lean one way and the lights
  // the other (blue shade under a warm Sun, violet under a red one), colours stronger,
  // a little more contrast. Nothing when uGrade.z is 0 and x, y are 1.
  if (uGrade.z > 0.0 || uGrade.x != 1.0 || uGrade.y != 1.0 || uGrade.w > 0.0) {
    float l = dot(c, vec3(0.3, 0.55, 0.15));
    // From up in the air (uGrade.w) the shade is lifted toward a light coloured one, about
    // two thirds as bright as the light (the grade's shade colour, cooled toward violet):
    // from above the shadows of clouds and mountains filled a third of the view in a
    // green-black. Only the darks; nothing on foot.
    if (uGrade.w > 0.0) {
      // (the shade's own colour brought up, so that a wood in shade is still a wood, then
      // leant a third of the way to the cool shade colour)
      float sh = uGrade.w * (1.0 - smoothstep(0.03, 0.3, l));
      vec3 v = uGradeShade * vec3(1.12, 0.85, 1.25); v /= dot(v, vec3(0.3, 0.55, 0.15));
      c *= 1.0 + 1.2 * sh;
      float lc = dot(c, vec3(0.3, 0.55, 0.15));
      c = mix(c, lc * v, 0.3 * sh) + 0.025 * sh * v;
      l = dot(c, vec3(0.3, 0.55, 0.15));
    }
    c = mix(vec3(l), c, uGrade.x);
    c *= mix(vec3(1.0), mix(uGradeShade, uGradeLight, smoothstep(0.12, 0.7, l)), uGrade.z);
    c = clamp((c - 0.45) * uGrade.y + 0.45, 0.0, 1.0);
  }
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

const GIVE_UP = [0x8CE0, 0x8D00];      // COLOR_ATTACHMENT0, DEPTH_ATTACHMENT
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
    this.settings = { key: 0.16, min: 0.5, max: 6e5, speed: 1.6, shadowFloor: 0.2, highlight: 6, surface: 0.6, globe: 0.32, ...exposureSettings };
    this.exposure = 20;
    this.targetExposure = 20;
    this.measuredLog2 = 0;
    this.instant = false;              // screenshot mode: converge immediately
    this.sunUv = [0.5, 0.5, 0]; this.shafts = 0;       // the Sun's beams: its place on screen and weight; their strength (render/look.js)
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
    this.meterMat = makePassMaterial(METER_FRAG, { tSrc: { value: null }, tScene: { value: null }, uViewSize: { value: new THREE.Vector2(1, 1) }, uFloor: { value: this.settings.shadowFloor }, uSunGrid: { value: new THREE.Vector3(0, 0, -1) } });
    this.shaftMat = makePassMaterial(SHAFT_FRAG, { tShaft: { value: null }, tBlueNoise: { value: noise }, uNoiseSize: { value: BLUE_NOISE_SIZE }, uShaft: { value: new THREE.Vector4(0.5, 0.5, 0, 1) } });
    this.compositeMat = makePassMaterial(COMPOSITE_FRAG, {
      tScene: { value: null }, tBloom: { value: null }, tBlueNoise: { value: noise },
      uUvScale: { value: new THREE.Vector2(1, 1) }, uUvMax: { value: new THREE.Vector2(1, 1) },
      uBloom: { value: CONFIG.BLOOM_STRENGTH }, uBloomNorm: { value: 0.2 }, uNoiseSize: { value: BLUE_NOISE_SIZE },
      tShaft: { value: null }, uShaft: { value: new THREE.Vector4(0.5, 0.5, 0, 1) },
      uGrade: { value: new THREE.Vector4(1, 1, 0, 0) }, uGradeShade: { value: new THREE.Vector3(1, 1, 1) }, uGradeLight: { value: new THREE.Vector3(1, 1, 1) },
    });
  }

  setExposureSettings(s) {
    this.settings = { key: 0.16, min: 0.5, max: 6e5, speed: 1.6, shadowFloor: 0.2, highlight: 6, surface: 0.6, globe: 0.32, ...s };
    this.meterMat.uniforms.uFloor.value = this.settings.shadowFloor;
  }

  resize(width, height) {
    this.width = Math.max(2, width | 0); this.height = Math.max(2, height | 0);
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.scene?.dispose();
    this.scene = new THREE.WebGLRenderTarget(this.width, this.height, { ...opts, depthBuffer: true, stencilBuffer: false });
    // (the depth is a plain buffer, never a texture: see sky/cloudVolume.js for what that cost on a phone)
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
    this.shaftTarget?.dispose();
    this.shaftTarget = new THREE.WebGLRenderTarget(this.bloomDown[1].width, this.bloomDown[1].height, { ...opts, depthBuffer: false });
    this.gpuBytes = bytes + this.shaftTarget.width * this.shaftTarget.height * 8;
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
    // (given up first: a clear of a part does not tell a tile-based GPU that the picture begins
    // anew, and it reads last frame's colour and depth back in before drawing over them; below
    // full size the clear is of a part. Nothing outside the part is ever read.)
    { const gl = r.getContext(); gl.invalidateFramebuffer(gl.FRAMEBUFFER, GIVE_UP); }
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
    // (the Sun's beams go with the bloom: one governor step for both)
    const beams = this.bloomEnabled && this.shaftsOn !== false ? this.shafts * this.sunUv[2] : 0;
    if (beams > 0) {
      const sm = this.shaftMat.uniforms;
      sm.tShaft.value = this.bloomDown[0].texture; sm.uShaft.value.set(this.sunUv[0], this.sunUv[1], beams, this.viewW / this.viewH);
      renderPass(r, this.shaftMat, this.shaftTarget);
    }
    cm.tShaft.value = this.shaftTarget.texture;
    cm.uShaft.value.set(this.sunUv[0], this.sunUv[1], beams, this.viewW / this.viewH);
    renderPass(r, this.compositeMat, null);
  }

  // Where the Sun's disc is on screen, for the meter: (u, v) in 0..1 from the bottom left,
  // its angular radius over the vertical field of view; visible = false when it is not in
  // front of the camera.
  setSun(u, v, radiusFraction, visible) {
    const g = this.meterMat.uniforms.uSunGrid.value;
    // (for the beams: where it is, and how much it counts: all in the picture, fading to
    // none a third of a picture outside it)
    const out = Math.max(0, -u, u - 1, -v, v - 1);
    this.sunUv[0] = u; this.sunUv[1] = v; this.sunUv[2] = visible ? Math.max(0, 1 - out * 3) : 0;
    if (!visible) { g.set(0, 0, -1); return; }
    g.set(u * 32, v * 18, radiusFraction * 18 + 1.6);
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
      const bright = this._readBuf[2] / used, cover = this._readBuf[3], peak = this._readBuf[1] / used;
      // The storm overhead holds the picture dark (weather/storm.js, written by weather.js from
      // the cloud over the traveller). Nothing else of the weather reaches the meter.
      const target = meterTarget(s, this.measuredLog2, peak, bright, cover, STORM.light, STORM.flash);
      this.surfaceCover = cover; this.surfaceBright = bright * target;
      this.stableReads = Math.abs(Math.log2(target / used)) < 0.03 ? this.stableReads + 1 : 0;
      this.targetExposure = target;
    }).catch(() => { this._readPending = false; });
  }
}

// How much of the darkness under cloud the meter makes up: with `light` of the day's light left
// overhead it aims light^METER_HOLD of the way, so a storm (about 0.15 of the light left) comes
// out 1.2 stops darker than full compensation would make it, and a clear sky is untouched.
// (It made up all of it: the owner's thunderstorm was as bright as noon.)
export const METER_HOLD = 0.45;

// What the meter aims at, from one read-back: pure, so that scripts/weather-test.mjs can replay
// it (check 6). s: the world's exposure settings; measuredLog2: the scene's luminance (log2);
// peak: the brightest part of the frame; bright, cover: how bright lit surfaces are and how much
// of the frame they fill; light: the share of the day's light the cloud overhead leaves (1: clear).
export function meterTarget(s, measuredLog2, peak, bright, cover, light = 1, flash = 0) {
  let target = s.key / Math.pow(2, measuredLog2);
  // Highlight priority: a sunlit surface (the hero in space, a planet filling the view)
  // may not be pushed more than `highlight` times over white, however dark the rest is.
  // (The peak comes from a blurred copy of the frame: the texels around the Sun's disc
  // are left out of it in the shader, see setSun.)
  // (not while a stroke of lightning is alight: a channel 60 times as bright as sunlight lies
  // over lit ground, so alpha 0 does not keep it out of this, and chasing it took two stops off
  // a sunlit landscape with a storm on the horizon)
  if (peak > 0 && !(flash > 0)) target = Math.min(target, s.highlight / peak);
  // Subject priority: once lit surfaces are more than a small part of the frame (a
  // planet from space, not a figure against the stars) their bright parts may not go
  // above `surface`, however much black surrounds them.
  if (bright > 0) {
    // (coverFrom: from what share of the frame lit surfaces count as the subject; a small
    // world is a small disc from not far off, and at the default it burned out to a white
    // ball in black space while it covered less than a hundredth of the view)
    const from = s.coverFrom ?? 0.01, x = Math.min(1, Math.max(0, (cover - from) / (5 * from))), k = x * x * (3 - 2 * x);
    // A world in black space (lit surfaces cover a small part of the frame) is held
    // lower, at `globe`, where its markings and colour still have contrast; a view
    // filled with ground keeps the higher `surface` limit.
    const y = Math.min(1, Math.max(0, (cover - 0.35) / 0.3)), cap = s.globe + (s.surface - s.globe) * y * y * (3 - 2 * y);
    target = Math.min(target, s.highlight * Math.pow(cap / s.highlight, k) / bright);
  }
  // Dim scenes stay dim: past `dim.above` only part of the missing light is made up
  // (the picture darkens by the scene's darkening to the power `dim.power`), until
  // the picture is `dim.most` times darker than full compensation would make it. So
  // an earthlit night reads as night, and a view into a low Sun shows its dark ground
  // as a camera set by hand would (Apollo crews opened up about two stops for those).
  if (s.dim && target > s.dim.above) target /= Math.min(s.dim.most ?? Infinity, Math.pow(target / s.dim.above, s.dim.power));
  // ... and a storm stays dark: only part of what the cloud overhead takes is made up.
  if (light < 1) target *= Math.pow(Math.max(0.02, light), METER_HOLD);
  return Math.min(s.max, Math.max(s.min, target));
}
