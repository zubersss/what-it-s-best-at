// Clouds with depth: the part of the cloud layer near the traveller, drawn as a volume
// that can be flown into, through and out of. (Farther off the layer is the thin shell of
// clouds.js, which fades in where this fades out.)
//
// How it is drawn, each frame the volume is on:
//   1. After the ground is drawn, a small picture (a third of the view each way) is
//      marched: every pixel's ray is followed through the cloud layer, the cloud's light
//      and what it lets through added up along it. Two such pictures side by side: one
//      stops at the ground or thing behind the pixel (for the pixels that show ground),
//      one runs out to the sky (for the pixels that show sky). A pixel of the small
//      picture covers nine of the view; where those are part ground, part sky, both are
//      made, else one.
//   2. Back in the main picture, two full-screen passes lay them over it: the "sky" one
//      only where nothing was drawn (the depth test does the choosing, per pixel, so a
//      ridge against cloud keeps a clean edge), the "ground" one over the rest.
// Shapes: the world's cloud map says where cloud is and how much; a repeating 3-D noise
// carves it into masses between a base and a top that rises where the map is thick.
// Light: the Sun through the air to the cloud, then through the cloud itself (a short
// look toward the Sun at every step), brightest at the edges facing it; the sky from all
// round; the air between the cloud and the eye.
//
// A world's `clouds` block adds: volume: { base (m), thick (m), reach (m: how far the
// volume is drawn before the shell takes over) }.
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

const VERT = /* glsl */`
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const MARCH = /* glsl */`
${LIGHTING_PARS}
precision highp sampler3D;
uniform sampler3D tCloudNoise;
uniform sampler2D tCloudMap;
uniform highp sampler2D tSceneDepth;
uniform vec4 uCloud;           // x cover, y longitude shift of the map (turns), z 1 / noise scale (1/m), w the reach (m)
uniform vec4 uLayer;           // x base radius (m), y thickness (m), z steps, w time (s)
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform vec4 uProj;            // x tan(half the vertical view angle), y aspect, z near, w far
uniform vec4 uDepthUv;         // xy: the part of the depth picture in use, zw: a pixel of it
uniform vec3 uCloudWind;       // where the noise has drifted to (noise units)
uniform sampler2D tCloudTop;   // how high the cloud tops stand, where the day's map says (red x 16 km; 0: not seen)
uniform vec3 uTops;            // x the base's altitude (m), y the tops' usual share of the layer, z 1 if there is a map
uniform vec4 uBolt;            // lightning inside the cloud: xyz where (from the camera, m), w how bright
in vec2 vUv;
layout(location = 0) out vec4 fragColor;

// x: the cover at a place (0..1); y: how far up the layer its tops reach there (0..1)
vec2 mapCover(vec3 up) {
  vec2 uv = vec2(atan(up.y, up.x) * 0.15915494 + uCloud.y, acos(clamp(up.z, -1.0, 1.0)) * 0.31830989);
  float m = textureLod(tCloudMap, uv, 0.0).r, lo = 1.0 - uCloud.x, top = uTops.y;
  if (uTops.z > 0.5) { float km = textureLod(tCloudTop, uv, 0.0).r * 15.94; if (km > 0.4) top = clamp((km * 1000.0 - uTops.x) / uLayer.y, 0.15, 1.0); }
  return vec2(smoothstep(lo - 0.08, lo + 0.34, m), top);
}
// How much cloud is at a place: c = the map's cover there (0..1), y = height in the layer (0..1).
float density(vec3 p, float c, float y, bool fine) {
  // rounded below, billowing above; a thick cover stands taller
  float profile = smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.45 + 0.5 * c, 0.55 + 0.45 * c, y));
  vec3 q = p * uCloud.z + uCloudWind;
  vec2 n = texture(tCloudNoise, q).rg;
  float d = clamp((n.r * profile - (1.0 - c) * 0.85) / max(c * 0.85 + 0.15, 0.2) * 1.6, 0.0, 1.0);
  if (fine && d > 0.0) {
    // small cells eat at the edges (not the hearts) of the masses
    float e = texture(tCloudNoise, q * 5.3 + 0.37).g;
    d = clamp((d - e * 0.32 * (1.0 - d)) / (1.0 - 0.32 * (1.0 - d) * e + 1e-3), 0.0, 1.0);
  }
  return d;
}
float viewZ(float depth) { return uProj.z * uProj.w / (uProj.w - depth * (uProj.w - uProj.z)); }

void main() {
  // which of the two pictures this pixel belongs to, and its ray
  bool sky = vUv.x > 0.5;
  vec2 uv = vec2(fract(vUv.x * 2.0), vUv.y), ndc = uv * 2.0 - 1.0;
  vec3 dir = normalize(uCamFwd + uCamRight * (ndc.x * uProj.x * uProj.y) + uCamUp * (ndc.y * uProj.x));
  // what stands behind the nine pixels of the view this one covers (four looks)
  vec2 dUv = uv * uDepthUv.xy;
  float d0 = texture(tSceneDepth, dUv + uDepthUv.zw * vec2(-0.9, -0.9)).r, d1 = texture(tSceneDepth, dUv + uDepthUv.zw * vec2(0.9, -0.9)).r;
  float d2 = texture(tSceneDepth, dUv + uDepthUv.zw * vec2(-0.9, 0.9)).r, d3 = texture(tSceneDepth, dUv + uDepthUv.zw * vec2(0.9, 0.9)).r;
  float far = max(max(d0, d1), max(d2, d3)), nearest = min(min(d0, d1), min(d2, d3));
  // (Which of the two pictures is needed here is asked of a wider neighbourhood: where sky
  // meets ground both are laid over the view with soft edges, and a picture left empty
  // right beside the meeting line showed as a bright seam along every horizon.)
  float w0 = texture(tSceneDepth, dUv + uDepthUv.zw * vec2(-5.0, -5.0)).r, w1 = texture(tSceneDepth, dUv + uDepthUv.zw * vec2(5.0, -5.0)).r;
  float w2 = texture(tSceneDepth, dUv + uDepthUv.zw * vec2(-5.0, 5.0)).r, w3 = texture(tSceneDepth, dUv + uDepthUv.zw * vec2(5.0, 5.0)).r;
  float farW = max(far, max(max(w0, w1), max(w2, w3))), nearW = min(nearest, min(min(w0, w1), min(w2, w3)));
  if (sky ? farW < 1.0 : nearW >= 1.0) { fragColor = vec4(0.0); return; }
  float tStop = 1e9;
  if (!sky) {
    // (the farthest thing among them: a little too much cloud on a near edge, never a hole)
    float dg = max(max(d0 < 1.0 ? d0 : 0.0, d1 < 1.0 ? d1 : 0.0), max(d2 < 1.0 ? d2 : 0.0, d3 < 1.0 ? d3 : 0.0));
    // (no ground behind this very pixel, only near it: as far as the nearest ground round it)
    if (dg <= 0.0) dg = max(max(w0 < 1.0 ? w0 : 0.0, w1 < 1.0 ? w1 : 0.0), max(w2 < 1.0 ? w2 : 0.0, w3 < 1.0 ? w3 : 0.0));
    tStop = viewZ(dg) / max(dot(dir, uCamFwd), 0.05);
  }
  // the stretch of the ray inside the layer (between two spheres round the world)
  float rc = length(uCamPlanetPos), rb = uLayer.x, rt = uLayer.x + uLayer.y;
  float b = dot(uCamPlanetPos, dir), disc = b * b - rc * rc;
  float qt = disc + rt * rt, qb = disc + rb * rb;
  if (qt <= 0.0) { fragColor = vec4(0.0); return; }
  float sT = sqrt(qt), t0, t1;
  if (rc < rb) { t0 = -b + sqrt(max(qb, 0.0)); t1 = -b + sT; }                    // below: up through the base to the top
  else if (rc < rt) { t0 = 0.0; t1 = (qb > 0.0 && b < 0.0) ? -b - sqrt(qb) : -b + sT; }      // inside: to the top, or down to the base
  else { t0 = -b - sT; t1 = (qb > 0.0) ? -b - sqrt(qb) : -b + sT; if (t0 < 0.0) { fragColor = vec4(0.0); return; } }    // above: in through the top
  t1 = min(min(t1, tStop), uCloud.w);
  if (t1 <= t0) { fragColor = vec4(0.0); return; }

  // steps: short near the eye, longer farther off; started at a different place in every
  // pixel so the layers of the march do not show
  float n = uLayer.z, L = t1 - t0, k = log(1.0 + L / 3500.0), ek = exp(k) - 1.0;
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 mid = uCamPlanetPos + dir * (t0 + 0.4 * L);
  vec3 sunC = directSun(mid), upM = normalize(mid);
  vec3 skyC = skyLight(upM, upM), skyDown = skyLight(-upM, upM);
  float cs = dot(dir, uSunDir);
  // (forward: the bright rim round the Sun; back: a soft glow away from it)
  float phase = 0.55 * (1.0 - 0.72 * 0.72) / pow(1.0 + 0.72 * 0.72 - 2.0 * 0.72 * cs, 1.5) + 0.45 * (1.0 - 0.04) / pow(1.04 + 0.4 * cs, 1.5);
  float mu0 = max(dot(upM, uSunDir), 0.0);
  float T = 1.0, tMean = 0.0, wSum = 0.0; vec3 C = vec3(0.0);
  float sigma = 0.012;                                   // how fast cloud takes light out, per metre at full density
  float prev = t0;
  for (float i = 0.0; i < n; i += 1.0) {
    float s1 = (i + 1.0) / n, s = (i + jit) / n;
    float t = t0 + L * (exp(k * s) - 1.0) / ek, tNext = t0 + L * (exp(k * s1) - 1.0) / ek, dt = tNext - prev; prev = tNext;
    vec3 p = uCamPlanetPos + dir * t;
    float r = length(p); vec3 up = p / r;
    float y = (r - rb) / uLayer.y;
    vec2 mc = mapCover(up);
    float c = mc.x * (1.0 - smoothstep(0.7 * uCloud.w, uCloud.w, t));
    y /= mc.y;
    if (c < 0.01 || y <= 0.0 || y >= 1.0) continue;
    float d = density(p, c, y, t < 30000.0);
    if (d <= 0.001) continue;
    // toward the Sun: how much cloud the light came through (one look a little way off,
    // and the layer above this height as the map says it is)
    float dl = density(p + uSunDir * 280.0, c, y + 280.0 * mu0 / (uLayer.y * mc.y), false);
    float tau = sigma * (280.0 * (0.5 * d + dl) + (1.0 - y) * uLayer.y * mc.y * c * 0.35 / max(mu0, 0.25));
    float sunT = exp(-tau) + 0.18 * exp(-0.22 * tau);                         // (light scattered many times gets deeper than a single ray)
    vec3 light = sunC * (sunT * min(phase, 3.5) * (1.0 - 0.6 * exp(-2.5 * tau * d - 0.2))) + (skyC * (0.35 + 0.65 * y) + skyDown * (1.0 - y) * 0.4) * 0.6;
    if (uBolt.w > 0.0) { vec3 fb = dir * t - uBolt.xyz; light += vec3(0.8, 0.88, 1.0) * (uBolt.w / (1.0 + dot(fb, fb) / (900.0 * 900.0))); }
    float a = 1.0 - exp(-sigma * d * dt);
    C += T * a * light;
    tMean += t * T * a; wSum += T * a;
    T *= 1.0 - a;
    if (T < 0.02) break;
  }
  float alpha = 1.0 - T;
  if (alpha < 0.003) { fragColor = vec4(0.0); return; }
  // the cloud's own brightness, seen through the air between it and the eye
  vec3 col = aerialPerspective(C / alpha / PI, dir * (tMean / max(wSum, 1e-5)));
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

const LAY = /* glsl */`
uniform sampler2D tCloudPass;
uniform vec4 uHalf;            // x: 0 for the ground half of the small picture, 0.5 for the sky half
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
void main() {
  // (four looks round the place: the march starts at a different depth in every pixel of
  // the small picture, and this takes the grain out of it)
  // (kept a pixel and a half inside this half of the small picture: its neighbour is the other half)
  vec2 uv = vec2(uHalf.x + clamp(vUv.x * 0.5, 1.5 * uHalf.z, 0.5 - 1.5 * uHalf.z), clamp(vUv.y, 1.5 * uHalf.w, 1.0 - 1.5 * uHalf.w)), d = uHalf.zw;
  fragColor = 0.25 * (texture(tCloudPass, uv + d * vec2(0.9, 0.35)) + texture(tCloudPass, uv + d * vec2(-0.35, 0.9)) + texture(tCloudPass, uv + d * vec2(-0.9, -0.35)) + texture(tCloudPass, uv + d * vec2(0.35, -0.9)));
}`;

export class CloudVolume {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true; this.steps = 26; this.def = null; this.noise = null; this.active = false;
    this.target = null; this.tw = 0; this.th = 0;
    this.uniforms = {
      ...lightingUniforms(), tCloudNoise: { value: null }, tCloudMap: { value: null }, tSceneDepth: { value: null },
      uCloud: { value: new THREE.Vector4(0.5, 0, 1 / 5200, 45000) }, uLayer: { value: new THREE.Vector4(1, 1, 26, 0) },
      uCamRight: { value: new THREE.Vector3() }, uCamUp: { value: new THREE.Vector3() }, uCamFwd: { value: new THREE.Vector3() },
      uProj: { value: new THREE.Vector4() }, uDepthUv: { value: new THREE.Vector4() }, uCloudWind: { value: new THREE.Vector3() },
      tCloudTop: { value: null }, uTops: { value: new THREE.Vector3(1400, 1, 0) }, uBolt: { value: new THREE.Vector4() },
    };
    this.march = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1 }, uniforms: this.uniforms, vertexShader: VERT, fragmentShader: MARCH, depthTest: false, depthWrite: false });
    const lay = (half, func) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: { tCloudPass: { value: null }, uHalf: { value: new THREE.Vector4(half, 0, 0, 0) } }, vertexShader: /* glsl */`
        out vec2 vUv;
        void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }`,          // (at the far plane: the depth test tells sky from ground)
      fragmentShader: LAY, depthTest: true, depthFunc: func, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.laySky = lay(0.5, THREE.LessEqualDepth);          // passes where nothing was drawn (the cleared depth is the far plane's)
    this.layGround = lay(0, THREE.GreaterDepth);           // passes where something was
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(tri, this.march); this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.camera = new THREE.Camera();
    this.drift = new THREE.Vector3();
  }

  setWorld(world) {
    this.def = world.clouds?.volume ? world.clouds : null;
    this.radius = world.radius;
    // (the day's cloud-top map, if the world has weather: storms stand tall)
    this.topsTex?.dispose(); this.topsTex = null; this.uniforms.tCloudTop.value = null; this.uniforms.uTops.value.z = 0;
    if (this.def && world.weather?.tops) {
      const w = world;
      new THREE.TextureLoader().load(import.meta.env.BASE_URL + world.weather.tops, (t) => {
        if (this.world !== w) { t.dispose(); return; }
        t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
        this.renderer.initTexture(t); this.topsTex = t; this.uniforms.tCloudTop.value = t; this.uniforms.uTops.value.z = 1;
      });
    }
    this.world = world;
    if (this.def && !this.noise && !this.asked && typeof Worker !== 'undefined') {
      this.asked = true;
      const w = new Worker(new URL('./cloudNoiseWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => {
        const N = ev.data.n, tex = new THREE.Data3DTexture(new Uint8Array(ev.data.buffer), N, N, N);
        tex.format = THREE.RGFormat; tex.type = THREE.UnsignedByteType; tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping; tex.unpackAlignment = 1; tex.generateMipmaps = false; tex.needsUpdate = true;
        this.renderer.initTexture(tex);
        this.noise = tex; this.uniforms.tCloudNoise.value = tex; w.terminate();
      };
      w.postMessage({ n: 64 });
    }
  }

  // True while the noise is still being made (screenshots wait for it).
  get busy() { return !!this.def && !this.noise; }

  // Is the volume to be drawn this frame? cam: the camera's place (planet-fixed, m);
  // layer: the cloud shell (clouds.js: its map and whether it is on).
  ready(cam, layer) {
    const v = this.def?.volume;
    this.active = !!(v && this.enabled && this.noise && layer.mesh.visible && cam.length() - this.radius < (v.above ?? 30000));
    return this.active;
  }
  get reach() { return this.def?.volume?.reach ?? 45000; }

  // Step 1: the small picture. post: the Post (its scene target and depth); rig: the camera rig;
  // near, far: the planes the ground was drawn with; time (s); wind: the terrain's wind uniform.
  render(post, rig, near, far, time, layer, wind, weather) {
    const r = this.renderer, v = this.def.volume, u = this.uniforms;
    // (the layer is as thick as the tallest cloud near the traveller: storms reach 13 km)
    const base = v.base ?? 1500, thick = Math.max(v.thick ?? 3000, Math.min(13000, (weather?.topNear || 0)) - base);
    this.thickNow = this.thickNow ? this.thickNow + (thick - this.thickNow) * 0.05 : thick;
    u.uTops.value.x = base; u.uTops.value.y = Math.min(1, (v.thick ?? 3000) / this.thickNow);
    const fl = weather?.flash;
    if (fl && !fl.ground) u.uBolt.value.set(fl.dir.x * fl.dist, fl.dir.y * fl.dist, fl.dir.z * fl.dist, weather.flashLight.z * 6); else u.uBolt.value.w = 0;
    const tw = Math.max(8, Math.round(post.viewW / 3)) * 2, th = Math.max(4, Math.round(post.viewH / 3));
    if (!this.target || this.tw !== tw || this.th !== th) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(tw, th, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
      this.target.texture.wrapS = this.target.texture.wrapT = THREE.ClampToEdgeWrapping;
      this.tw = tw; this.th = th;
    }
    const cam = rig.camera, e = cam.matrixWorld.elements;
    u.uCamRight.value.set(e[0], e[1], e[2]); u.uCamUp.value.set(e[4], e[5], e[6]); u.uCamFwd.value.set(-e[8], -e[9], -e[10]);
    u.uProj.value.set(Math.tan(rig.fov * Math.PI / 360), post.viewW / post.viewH, near, far);
    u.uDepthUv.value.set(post.viewW / post.width, post.viewH / post.height, 1 / post.width, 1 / post.height);
    u.tSceneDepth.value = post.scene.depthTexture; u.tCloudMap.value = layer.texture;
    u.uCloud.value.set(this.def.cover ?? 0.8, this.def.lon0 === -180 ? 0.5 : 0, 1 / (v.scale ?? 5200), this.reach);
    u.uLayer.value.set(this.radius + base, this.thickNow, this.steps, time);
    // the masses drift with the wind (slowly: this is not the weather moving, only the air)
    const w = wind?.value; if (w) this.drift.set(w.x, w.y, w.z).multiplyScalar(time * Math.min(20, w.w) / (v.scale ?? 5200));
    u.uCloudWind.value.copy(this.drift);
    this.quad.material = this.march;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0); r.clear(true, false, false);
    r.render(this.scene, this.camera);
  }

  // Step 2: over the main picture (the caller has bound it again).
  lay() {
    const r = this.renderer;
    for (const m of [this.laySky, this.layGround]) {
      m.uniforms.tCloudPass.value = this.target.texture; m.uniforms.uHalf.value.set(m === this.laySky ? 0.5 : 0, 2 / this.tw, 1 / this.tw, 1 / this.th);
      this.quad.material = m; r.render(this.scene, this.camera);
    }
  }
}
