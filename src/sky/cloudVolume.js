// Clouds with depth: the part of the cloud layer near the traveller, drawn as a volume
// that can be flown into, through and out of. (Farther off the layer is the thin shell of
// clouds.js, which fades in where this fades out.)
//
// How it is drawn, each frame the volume is on:
//   1. Before the main picture is begun, a small picture is marched: six of them side by
//      side (a quarter of the view each way), one for each slice of distance from the eye
//      (0 to 300 m, to 900 m, to 2.4 km, to 5 km, to 9 km, to the reach). Every pixel's
//      ray is followed through the part of the cloud layer that lies in its slice, the
//      cloud's light and what it lets through added up along it. A second small pass
//      takes the grain out of it.
//   2. In the main picture, once the ground is drawn, six passes lay them over it from
//      the farthest to the nearest, each a curved sheet at the distance where its slice
//      begins: the depth test lets a slice through only where the ground is farther
//      than that. So a ridge hides the cloud behind it, to within a slice.
// Nothing reads the main picture's depth and nothing is drawn elsewhere in the middle of
// it. (The first form did both: the depth was kept as a texture and the march came
// after the ground. On the test phone every world then ran at a quarter of its frame
// rate, at any resolution: a tile-based GPU pays for both in full pictures written out
// and read back.)
// And nothing about a cloud hangs on where the traveller is or looks: the base stands
// over the country's own height (setGround), the slices are of distance and not of the
// view's depth, the clean edge is cut by all the cloud along the line of sight, and the
// far shell (clouds.js) shows the same clouds. Each of these was once otherwise, and the
// clouds "moved when I moved".
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
import { G } from '../render/globals.js';

const VERT = /* glsl */`
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const MARCH = /* glsl */`
${LIGHTING_PARS}
precision highp sampler3D;
uniform sampler3D tCloudNoise;
uniform sampler2D tCloudMap;
uniform vec4 uCloud;           // x cover, y longitude shift of the map (turns), z 1 / noise scale (1/m), w the reach (m)
uniform vec4 uLayer;           // x base radius (m), y thickness (m), z steps, w time (s)
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform vec4 uProj;            // x tan(half the vertical view angle), y aspect, z near, w far
uniform float uSliceZ[SLICES + 1];   // where each slice of the view's depth begins and ends (m)
uniform float uDense;          // how solid the cloud is, against the plain measure
uniform float uFieldK;         // the world's radius in units of the fair-weather field's noise
uniform vec2 uFair;            // x: the cover of fair-weather cloud where the day's map has none (0: none); y: how far round the eye the cloud is thinned (m)
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
  float c = smoothstep(lo - 0.08, lo + 0.34, m);
  if (uFair.x > 0.0) {
    // fair-weather cloud: where the day's map shows none there are still fields of small
    // heaps, with clear stretches between the fields (the map's pixels are 10 km: it
    // never saw them)
    // (placed by the world's own radius: the field must not shift when the layer's height does)
    float field = texture(tCloudNoise, up * uFieldK + 0.31).r;
    c = max(c, uFair.x * (0.55 + 0.45 * smoothstep(0.0, 0.5, m)) * smoothstep(0.12, 0.34, field) / 0.55);
  }
  return vec2(c, top);
}
// How much cloud is at a place: c = the map's cover there (0..1), y = height in the layer (0..1).
float density(vec3 p, float c, float y, bool fine) {
  // rounded below, billowing above; a thick cover stands taller
  float profile = smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.45 + 0.5 * c, 0.55 + 0.45 * c, y));
  vec3 q = p * uCloud.z + uCloudWind;
  vec2 n = texture(tCloudNoise, q).rg;
  float d = clamp((n.r * profile - (1.0 - c) * 0.85) / max(c * 0.85 + 0.15, 0.2) * 2.2, 0.0, 1.0);
  if (fine && d > 0.0) {
    // small cells eat at the edges (not the hearts) of the masses
    float e = texture(tCloudNoise, q * 5.3 + 0.37).g;
    d = clamp((d - e * 0.32 * (1.0 - d)) / (1.0 - 0.32 * (1.0 - d) * e + 1e-3), 0.0, 1.0);
  }
  return d;
}
void main() {
  // which slice of the view's depth this pixel belongs to, and its ray
  vec2 cellf = vUv * vec2(float(COLS), float(ROWS));
  int slice = min(int(cellf.x), COLS - 1) + COLS * min(int(cellf.y), ROWS - 1);
  vec2 uv = fract(cellf), ndc = uv * 2.0 - 1.0;
  gHazeUv = uv;
  vec3 dir = normalize(uCamFwd + uCamRight * (ndc.x * uProj.x * uProj.y) + uCamUp * (ndc.y * uProj.x));
  // (slices by distance from the eye, not by depth along the view: a cloud must not pass
  // from one slice to another because the view was turned)
  float tA = uSliceZ[slice], tB = uSliceZ[slice + 1];
  // the stretch of the ray inside the layer (between two spheres round the world)
  float rc = length(uCamPlanetPos), rb = uLayer.x, rt = uLayer.x + uLayer.y;
  float b = dot(uCamPlanetPos, dir), disc = b * b - rc * rc;
  float qt = disc + rt * rt, qb = disc + rb * rb;
  if (qt <= 0.0) { fragColor = vec4(0.0); return; }
  float sT = sqrt(qt), t0, t1;
  if (rc < rb) { t0 = -b + sqrt(max(qb, 0.0)); t1 = -b + sT; }                    // below: up through the base to the top
  else if (rc < rt) { t0 = 0.0; t1 = (qb > 0.0 && b < 0.0) ? -b - sqrt(qb) : -b + sT; }      // inside: to the top, or down to the base
  else { t0 = -b - sT; t1 = (qb > 0.0) ? -b - sqrt(qb) : -b + sT; if (t0 < 0.0) { fragColor = vec4(0.0); return; } }    // above: in through the top
  t0 = max(t0, tA); t1 = min(min(t1, tB), uCloud.w);
  if (t1 <= t0) { fragColor = vec4(0.0); return; }

  // steps: short near the eye, longer farther off; started at a different place in every
  // pixel so the layers of the march do not show
  // (even steps: the slices themselves are short near the eye and long far off)
  float n = uLayer.z, L = t1 - t0;
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  // (the far slices are cut to clean shapes when they are laid: less grain there, a little banding instead)
  float jw = slice >= 2 ? 0.4 : 1.0;
  vec3 mid = uCamPlanetPos + dir * (t0 + 0.4 * L);
  vec3 sunC = directSun(mid), upM = normalize(mid);
  vec3 skyC = skyLight(upM, upM), skyDown = skyLight(-upM, upM);
  float cs = dot(dir, uSunDir);
  // (forward: the bright rim round the Sun; back: a soft glow away from it)
  float phase = 0.55 * (1.0 - 0.72 * 0.72) / pow(1.0 + 0.72 * 0.72 - 2.0 * 0.72 * cs, 1.5) + 0.45 * (1.0 - 0.04) / pow(1.04 + 0.4 * cs, 1.5);
  float mu0 = max(dot(upM, uSunDir), 0.0);
  // Inside a deep cloud no shape can be seen: every way one looks is the same grey. What is
  // seen in a real one is the cloud lighter and darker in great soft patches going by:
  // taken from the noise a few hundred metres off along the ray (one look a pixel; fine
  // wisps along the ray itself only average out).
  vec3 wq = (uCamPlanetPos + dir * 450.0) * uCloud.z;
  float wispV = 0.55 + 0.6 * texture(tCloudNoise, wq * 6.0 + uCloudWind * 2.0).g + 0.3 * texture(tCloudNoise, wq * 15.0 - uCloudWind * 3.0 + 0.4).g;
  float T = 1.0, tMean = 0.0, wSum = 0.0; vec3 C = vec3(0.0);
  float sigma = 0.012 * uDense;                          // how fast cloud takes light out, per metre at full density
  for (float i = 0.0; i < n; i += 1.0) {
    float t = t0 + L * (i + 0.5 + (jit - 0.5) * jw) / n, dt = L / n;
    vec3 p = uCamPlanetPos + dir * t;
    float r = length(p); vec3 up = p / r;
    float y = (r - rb) / uLayer.y;
    vec2 mc = mapCover(up);
    float c = mc.x * (1.0 - smoothstep(0.7 * uCloud.w, uCloud.w, t));
    y /= mc.y;
    if (c < 0.01 || y <= 0.0 || y >= 1.0) continue;
    float d = density(p, c, y, t < 30000.0);
    if (d <= 0.001) continue;
    float wisp = 1.0;
    if (t < 2500.0) {
      // close by: wisps a few hundred metres across torn out of the cloud, and the cloud
      // round the eye itself thin, so that flying through one is shapes going by and not
      // a blank wall
      float e2 = texture(tCloudNoise, p * (uCloud.z * 19.0) + uCloudWind * 3.0 + 0.71).g, nearK = 1.0 - smoothstep(600.0, 2500.0, t);
      d *= mix(1.0, smoothstep(0.25, 0.75, e2 + 0.5 * d), 0.7 * nearK);
      d *= mix(0.35, 1.0, smoothstep(0.0, uFair.y, t));
      // (and lighter and darker by the way one looks: see wispV)
      wisp = mix(1.0, wispV, 1.0 - smoothstep(500.0, 1500.0, t));
    }
    // The Sun on the cloud, as a painter has it: full on the tops and on the sides turned
    // to it (less cloud a little way toward the Sun than here), little in the hearts and
    // under the masses; and under a deep layer (a storm) hardly any reaches the base.
    float dl = density(p + uSunDir * 280.0, c, y + 280.0 * mu0 / (uLayer.y * mc.y), false);
    float sunward = clamp(0.5 + (d - dl) * 2.2 + (y - 0.42) * 1.1, 0.0, 1.0);
    // (only a cover that is nearly whole stands between the Sun and what is under it: among
    // scattered heaps the light comes down between them)
    float above = 0.012 * (1.0 - y) * uLayer.y * mc.y * smoothstep(0.55, 0.95, c) * 0.35 / max(mu0, 0.25);
    // (a small cloud's shade is light: the Sun's light goes round inside it; a storm's is not)
    float lit = mix(0.36, 1.0, smoothstep(0.2, 0.7, sunward)) * min(exp(-above) + 0.18 * exp(-0.22 * above), 1.0);
    vec3 light = sunC * (lit * min(0.6 + 0.4 * phase, 2.5)) + (skyC * (0.45 + 0.55 * y) + skyDown * (1.0 - y) * 0.5) * 0.8;
    light *= wisp;
    if (uBolt.w > 0.0) { vec3 fb = dir * t - uBolt.xyz; light += vec3(0.8, 0.88, 1.0) * (uBolt.w / (1.0 + dot(fb, fb) / (900.0 * 900.0))); }
    float a = 1.0 - exp(-sigma * d * dt);
    C += T * a * light;
    tMean += t * T * a; wSum += T * a;
    T *= 1.0 - a;
    if (T < 0.02) break;
  }
  // (cut off at a fiftieth, the march has let that much through: stretched so the thickest
  // cloud lets nothing through. The Sun's disc is tens of thousands of times white.)
  float alpha = clamp((1.0 - T) / 0.98, 0.0, 1.0);
  if (alpha < 0.003) { fragColor = vec4(0.0); return; }
  // the cloud's own brightness, seen through the air between it and the eye
  vec3 col = aerialPerspective(C / alpha / PI, dir * (tMean / max(wSum, 1e-5)));
  fragColor = vec4(col * uExposure * alpha, alpha);
}`;

// The march's grain taken out: every pixel of every slice's picture becomes the mean of
// four looks round it (the march starts at a different depth in every pixel).
const SMOOTH = /* glsl */`
uniform sampler2D tCloudPass;
uniform vec2 uPixel;           // a pixel of the part in use
uniform vec2 uUsed;            // the part of the target that is in use
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
void main() {
  // (kept inside this slice's own picture: its neighbours are other slices)
  vec2 cells = vec2(float(COLS), float(ROWS)), cell = min(floor(vUv * cells), cells - 1.0), lo = cell / cells + 0.5 * uPixel, hi = (cell + 1.0) / cells - 0.5 * uPixel;
  #define TAP(o) texture(tCloudPass, clamp(vUv + uPixel * o, lo, hi) * uUsed)
  fragColor = 0.25 * (TAP(vec2(1.2, 0.45)) + TAP(vec2(-0.45, 1.2)) + TAP(vec2(-1.2, -0.45)) + TAP(vec2(0.45, -1.2)));
}`;

const LAY = /* glsl */`
uniform sampler2D tCloudPass;
uniform float uSlice;          // which slice this pass lays
uniform vec2 uPixel;           // a pixel of the part in use
uniform vec2 uUsed;            // the part of the target that is in use
uniform float uCrisp;          // how clean the cloud's edge is cut (0: as marched, soft; 1: a clean shape)
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
vec4 look(float k) {
  vec2 cells = vec2(float(COLS), float(ROWS)), cell = vec2(mod(k, cells.x), floor(k / cells.x));
  return texture(tCloudPass, (cell + clamp(vUv, 0.5 * uPixel * cells, 1.0 - 0.5 * uPixel * cells)) / cells * uUsed);
}
void main() {
  vec4 c = look(uSlice);
  if (c.a < 0.003) discard;
  // The painted look: a cloud is a shape with a clean edge, cut out of the soft mass the
  // march gives. The cut goes by all the cloud along the line of sight, in whatever slices
  // it lies: cut slice by slice, a cloud thinned and changed its outline as the boundary
  // between two slices passed through it, which is to say whenever the traveller moved.
  if (uCrisp > 0.0) {
    float through = 1.0;
    for (int j = 0; j < SLICES; j++) through *= 1.0 - look(float(j)).a;
    float all = 1.0 - through;
    c *= mix(1.0, smoothstep(0.1, 0.62, all) / max(all, 0.003), uCrisp);
  }
  fragColor = c;
}`;

// The slices of the view's depth (m; the last ends at the volume's reach), and how their
// pictures are laid out in the small target.
const SLICE_Z = [0, 300, 900, 2400, 5000, 9000], COLS = 3, ROWS = 2, SLICES = COLS * ROWS, SMALL = 4;

export class CloudVolume {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true; this.steps = 36; this.def = null; this.noise = null; this.active = false;
    this.target = null; this.tw = 0; this.th = 0;
    this.uniforms = {
      ...lightingUniforms(), tCloudNoise: { value: null }, tCloudMap: { value: null }, uSliceZ: { value: new Float32Array(SLICES + 1) }, uDense: { value: 1 }, uFair: { value: new THREE.Vector2(0, 300) }, uFieldK: { value: 1 },
      uCloud: { value: new THREE.Vector4(0.5, 0, 1 / 5200, 45000) }, uLayer: { value: new THREE.Vector4(1, 1, 26, 0) },
      uCamRight: { value: new THREE.Vector3() }, uCamUp: { value: new THREE.Vector3() }, uCamFwd: { value: new THREE.Vector3() },
      uProj: { value: new THREE.Vector4() }, uCloudWind: { value: new THREE.Vector3() },
      tCloudTop: { value: null }, uTops: { value: new THREE.Vector3(1400, 1, 0) }, uBolt: { value: new THREE.Vector4() },
    };
    this.march = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), SPACE_HAZE: 1, OWN_CLOUD_SHADOW: 1, HAZE_UV: 1, SLICES, COLS, ROWS }, uniforms: this.uniforms, vertexShader: VERT, fragmentShader: MARCH, depthTest: false, depthWrite: false });
    this.smoothMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: { COLS, ROWS }, uniforms: { tCloudPass: { value: null }, uPixel: { value: new THREE.Vector2() }, uUsed: { value: new THREE.Vector2(1, 1) } }, vertexShader: VERT, fragmentShader: SMOOTH, depthTest: false, depthWrite: false });
    // A slice is laid as a sheet at the distance where it begins: a grid over the view, each
    // corner at the depth that distance has along its own ray.
    this.layMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { COLS, ROWS, SLICES },
      uniforms: { tCloudPass: { value: null }, uSlice: { value: 0 }, uPixel: { value: new THREE.Vector2() }, uUsed: { value: new THREE.Vector2(1, 1) }, uCrisp: { value: 0 }, uY: { value: new THREE.Vector2(-1, 1) }, uSheet: { value: new THREE.Vector4() }, uDist: { value: 0 } }, vertexShader: /* glsl */`
        uniform vec2 uY;         // the part of the view's height this slice can show cloud in (-1 bottom .. 1 top)
        uniform vec4 uSheet;     // x: tan(half the view angle) across, y: up and down, z: near, w: far
        uniform float uDist;     // how far from the eye the slice begins (m)
        out vec2 vUv;
        void main() {
          float y = mix(uY.x, uY.y, position.y * 0.5 + 0.5);
          vUv = vec2(position.x, y) * 0.5 + 0.5;
          vec2 q = vec2(position.x * uSheet.x, y * uSheet.y);
          float z = uDist / sqrt(1.0 + dot(q, q)), n = uSheet.z, f = uSheet.w;
          gl_Position = vec4(position.x, y, z <= n ? -1.0 : min(1.0, (f + n) / (f - n) - 2.0 * f * n / ((f - n) * z)), 1.0);
        }`,
      fragmentShader: LAY, depthTest: true, depthFunc: THREE.LessEqualDepth, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 24, 12), this.layMat); this.sheet.frustumCulled = false;
    this.sheetScene = new THREE.Scene(); this.sheetScene.add(this.sheet);
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
  get reach() { return this.def?.volume?.reach ?? 16000; }

  // Step 1: the small picture, before the main one is begun. post: the Post (for the view's
  // size); rig: the camera rig; time (s); layer: the cloud shell; wind: the terrain's wind uniform.
  render(post, rig, time, layer, wind, weather) {
    const r = this.renderer, v = this.def.volume, u = this.uniforms;
    // (the layer is as thick as the tallest cloud near the traveller: storms reach 13 km)
    // The base stands that high over the country, not over the sea: on a plateau 2 km up a
    // base at 1 400 m would be fog on the ground. The country's height is read from the
    // world's coarse elevation, smoothed over a degree: a thing of the place, not of where
    // the traveller happens to stand (it once followed the ground under the traveller, and
    // the whole sky sank when one flew out over a canyon).
    const altNow = rig.pos.length() - this.radius;
    this.lift = this.groundAt ? this.groundAt(rig.pos) : 0;
    const base = (v.base ?? 1500) + this.lift, thick = Math.max(v.thick ?? 3000, Math.min(13000, (weather?.topNear || 0)) - base);
    this.thickNow = this.thickNow ? this.thickNow + (thick - this.thickNow) * 0.05 : thick;
    u.uTops.value.x = base; u.uTops.value.y = Math.min(1, (v.thick ?? 3000) / this.thickNow);
    const fl = weather?.flash;
    if (fl && !fl.ground) u.uBolt.value.set(fl.dir.x * fl.dist, fl.dir.y * fl.dist, fl.dir.z * fl.dist, weather.flashLight.z * 6); else u.uBolt.value.w = 0;
    // The target is as large as the view can ever be (six pictures of a quarter of the
    // canvas each way) and only the part the governor's resolution asks for is used, as
    // with the main picture: made anew at every resolution step it cost an allocation in
    // the middle of the very frames that were late already.
    const fw = Math.max(8, Math.ceil(post.width / SMALL)) * COLS, fh = Math.max(4, Math.ceil(post.height / SMALL)) * ROWS;
    if (!this.target || this.fw !== fw || this.fh !== fh) {
      this.target?.dispose(); this.smooth?.dispose();
      const make = () => { const t = new THREE.WebGLRenderTarget(fw, fh, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false }); t.texture.wrapS = t.texture.wrapT = THREE.ClampToEdgeWrapping; t.scissorTest = true; return t; };
      this.target = make(); this.smooth = make();          // (as marched; and with the grain taken out)
      this.fw = fw; this.fh = fh;
    }
    const tw = Math.max(8, Math.round(post.viewW / SMALL)) * COLS, th = Math.max(4, Math.round(post.viewH / SMALL)) * ROWS;
    this.tw = tw; this.th = th;
    for (const t of [this.target, this.smooth]) { t.viewport.set(0, 0, tw, th); t.scissor.set(0, 0, tw, th); }
    u.uCamRight.value.copy(rig.right); u.uCamUp.value.copy(rig.up); u.uCamFwd.value.copy(rig.forward);
    u.uProj.value.set(Math.tan(rig.fov * Math.PI / 360), post.viewW / post.viewH, 0, 0); this.aspect = post.viewW / post.viewH;
    const z = u.uSliceZ.value; for (let k = 0; k < SLICES; k++) z[k] = SLICE_Z[k]; z[SLICES] = this.reach;
    // (no ray meets the layer nearer than the traveller's distance below its base or above its top)
    const alt = altNow; this.below = alt < base; this.minDist = alt < base ? base - alt : alt > base + this.thickNow ? alt - base - this.thickNow : 0;
    u.uDense.value = v.dense ?? 1; u.uFair.value.set(v.fair ?? 0, v.clear ?? 120); u.uFieldK.value = this.radius / (v.scale ?? 5200) * 0.11;
    this.base = base;
    u.tCloudMap.value = layer.texture;
    u.uCloud.value.set(this.def.cover ?? 0.8, this.def.lon0 === -180 ? 0.5 : 0, 1 / (v.scale ?? 5200), this.reach);
    // (the governor's step count is for the whole ray: shared out among the slices)
    u.uLayer.value.set(this.radius + base, this.thickNow, Math.max(3, Math.round(this.steps / SLICES) + 1), time);
    // the masses drift with the wind (slowly: this is not the weather moving, only the air)
    // (added up frame by frame: the wind's gusts must not move the whole field by their share
    // of all the time that has passed)
    const w = wind?.value, dtw = this.lastTime == null || time < this.lastTime ? 0 : Math.min(0.2, time - this.lastTime);
    this.lastTime = time;
    if (w) this.drift.addScaledVector(w, dtw * Math.min(20, w.w) / (v.scale ?? 5200));
    // (... and they change as they go: the noise rises slowly through the layer's shape, so a
    // mass is not the same mass a minute later)
    this.drift.z += dtw * (v.change ?? 0.006);
    for (const c of ['x', 'y', 'z']) this.drift[c] -= Math.floor(this.drift[c]);          // (the noise repeats every unit)
    u.uCloudWind.value.copy(this.drift);
    this.quad.material = this.march;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0); r.clear(true, false, false);
    r.render(this.scene, this.camera);
    const su = this.smoothMat.uniforms;
    su.tCloudPass.value = this.target.texture; su.uPixel.value.set(1 / tw, 1 / th); su.uUsed.value.set(tw / fw, th / fh);
    this.quad.material = this.smoothMat;
    r.setRenderTarget(this.smooth);
    r.clear(true, false, false);
    r.render(this.scene, this.camera);
  }

  // The world's coarse elevation (its first bundled raster: whole-world, Int16 metres), for
  // the height the cloud base stands over. null: none.
  setGround(raster) {
    if (!raster || !raster.wrap) { this.groundAt = null; return; }
    const { data, width: W, height: H } = raster, lon0 = raster.lon0 ?? 0, lat0 = raster.lat0 ?? 90, lat1 = raster.lat1 ?? -90;
    const at = (lat, lon) => {
      const fx = (((lon - lon0) / 360) % 1 + 1) % 1 * W - 0.5, fy = Math.min(H - 1.001, Math.max(0, (lat0 - lat) / (lat0 - lat1) * H - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, xa = ((x0 % W) + W) % W, xb = (xa + 1) % W;
      const sc = raster.scale ?? 1, h = (x, y) => Math.max(0, data[y * W + x] * sc);
      return (h(xa, y0) * (1 - tx) + h(xb, y0) * tx) * (1 - ty) + (h(xa, y0 + 1) * (1 - tx) + h(xb, y0 + 1) * tx) * ty;
    };
    this.groundAt = (p) => {
      const len = p.length(), lat = Math.asin(p.z / len) * 57.29578, lon = Math.atan2(p.y, p.x) * 57.29578, k = 1 / Math.max(0.2, Math.cos(lat / 57.29578));
      let sum = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += at(Math.max(-89.9, Math.min(89.9, lat + j * 0.4)), lon + i * 0.4 * k);
      return sum / 9;
    };
  }

  // Step 2: over the main picture, once the ground is drawn. near, far: the planes it was
  // drawn with. From the farthest slice to the nearest, each at the depth where it begins.
  lay(near, far, rig) {
    const r = this.renderer, m = this.layMat, u = m.uniforms;
    // From under the layer a slice that ends at a distance shows cloud only above some
    // height in the sky (a ray must climb to the base within that distance), from over it
    // only below some depth: each pass covers that part of the view and no more. (With
    // the view level, no roll: the line of that height is lowest in the middle of the view.)
    const U = rig.localUp, dot = (v) => v.x * U[0] + v.y * U[1] + v.z * U[2];
    const sp = dot(rig.forward), cp = dot(rig.up), level = Math.abs(dot(rig.right)) < 0.03 && cp > 0.2 && this.minDist > 0;
    const pitch = Math.atan2(sp, cp), ty = Math.tan(rig.fov * Math.PI / 360);
    u.tCloudPass.value = this.smooth.texture;
    u.uPixel.value.set(1 / this.tw, 1 / this.th); u.uUsed.value.set(this.tw / this.fw, this.th / this.fh);
    u.uSheet.value.set(ty * this.aspect, ty, near, far); u.uCrisp.value = G.uPaint.value.x;
    for (let k = SLICES - 1; k >= 0; k--) {
      const z = SLICE_Z[k], end = k + 1 < SLICES ? SLICE_Z[k + 1] : this.reach;
      if (z >= far || end < this.minDist) continue;
      let y0 = -1, y1 = 1;
      if (level) {
        const el = Math.asin(Math.min(1, this.minDist / end)) - 0.03;
        if (this.below) { const a = el - pitch; y0 = a > 1.4 ? 2 : a < -1.4 ? -1 : Math.max(-1, Math.tan(a) / ty); }
        else { const a = -el - pitch; y1 = a < -1.4 ? -2 : a > 1.4 ? 1 : Math.min(1, Math.tan(a) / ty); }
        if (y0 >= 1 || y1 <= -1) continue;
      }
      u.uY.value.set(y0, y1);
      u.uSlice.value = k; u.uDist.value = z;
      m.uniformsNeedUpdate = true;
      r.render(this.sheetScene, this.camera);
    }
  }
}
