// Pollen and seed in the air over flowers: fine golden motes that catch the Sun (brightest
// looked at toward it) and now and then a floating seed, a dandelion's parachute. Points in
// a fixed pool, each a place of its own in a box of air that goes with the traveller: the
// place is fixed to the ground and carried by the wind (how far is added up frame by frame),
// and one point wraps round the box as a whole, so nothing is ever drawn across it.
//
// A mote shows where the ground under it flowers (the grass's own table: the more flowers,
// the more motes; none over bare ground or plain grass), in daylight, in dry air, more after
// a gust, and is lit by the light the grass under it has (the grass's light table: in a
// tree's shadow or a cloud's it is dim). Nothing here is kept per mote.
import * as THREE from 'three';
import { GRASS_PRELUDE } from './grass.js';

const COUNT = 3200, BOX = 40, NEAR_BOX = 10, TALL = 6;        // BOX divides the grass anchor's step (a step moves no mote), NEAR_BOX divides BOX
// How fast each mote wanders about its place (radians a second, east, north, up): whole
// hundredths, so that all three come round together after 200 pi seconds (70, 53 and 90
// turns), and the clock of the wander wraps there without a mote moving. (It wrapped at an
// hour once, which is no whole number of turns of any of them: every mote jumped as much as
// 0.9 m in one frame.)
const WANDER = [0.70, 0.53, 0.90], WANDER_PERIOD = 200 * Math.PI;

export class Pollen {
  // grass: the Grass (its plane, tables and light); shared: the terrain's shared uniforms (wind, weather)
  constructor(grass, shared) {
    this.grass = grass; this.windU = shared.uWind; this.weatherU = grass.shared.uWeather;
    const seed = new Float32Array(COUNT * 4);
    let s = 90210; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < seed.length; i++) seed[i] = rnd();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.geo = geo; this.share = 1;
    const mid = grass.tables.mid;
    this.uniforms = {
      ...grass.shared, uLatOrigin: { value: new THREE.Vector2() }, tTable: { value: mid.tex }, uTab: mid.info, tLight: { value: grass.light.texture }, uLight: grass.lightU[2],
      uAir: { value: new THREE.Vector4() },          // xy: the traveller in the box less how far the wind has carried the air (m, wrapped), z: how far the air has risen (m, wrapped), w: time (s)
      uPollen: { value: new THREE.Vector4() },       // x: how much (0..1), y: a gust (0..1)
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      defines: { GRID: 1, SPACING: '1.0', BOX: '1.0', SEED: '0.0' },
      vertexShader: /* glsl */`
        in vec4 aSeed;
        uniform sampler2D tTable; uniform vec4 uTab;
        ${GRASS_PRELUDE}
        uniform vec4 uAir, uPollen;
        out float vSeed;
        void main() {
          vSeed = 0.0;
          // (which box: half of them in a small one round the eye, where a mote is seen as a mote;
          // its width divides the large one's, so both wrap with the same air)
          float box = fract(aSeed.w * 7.31) < 0.5 ? ${NEAR_BOX.toFixed(1)} : ${BOX.toFixed(1)};
          vec2 p = mod(aSeed.xy * ${BOX.toFixed(1)} - uAir.xy, box) - 0.5 * box, at = p + uGrassCam.xy;
          // (how many flowers the ground under it has: the four entries round it, blended)
          vec2 f = (at + uTab.xy) / uTab.z, i = floor(f), wq = f - i;
          ivec2 a = ivec2(mod(i, uTab.w)), b = ivec2(mod(i + 1.0, uTab.w));
          vec4 t00 = texelFetch(tTable, a, 0), t10 = texelFetch(tTable, ivec2(b.x, a.y), 0), t01 = texelFetch(tTable, ivec2(a.x, b.y), 0), t11 = texelFetch(tTable, b, 0);
          vec4 fl = vec4(t00.a, t10.a, t01.a, t11.a), many = fract(fl + 0.001) * step(0.5, fl) * step(0.1, vec4(t00.g, t10.g, t01.g, t11.g));
          float rich = mix(mix(many.x, many.y, wq.x), mix(many.z, many.w, wq.x), wq.y);
          float own = fract(aSeed.x * 13.7 + aSeed.y * 7.1 + aSeed.w * 3.3);
          bool seed = fract(aSeed.w * 23.0) < 0.045;
          // (which motes there are: more over more flowers and after a gust; each by its own number)
          float keep = smoothstep(own, own + 0.12, rich * 1.5 * uPollen.x * (1.0 + 1.2 * uPollen.y));
          if (keep <= 0.0) OUT_OF_PICTURE
          float ground = mix(mix(t00.r, t10.r, wq.x), mix(t01.r, t11.r, wq.x), wq.y) + uGrassCurve.x - dot(at, at) * uGrassCurve.y - uGrassCam.z;
          // (how high: most of them low over the flowers; rising slowly, some twice as fast)
          float zf = fract(aSeed.z + uAir.z * (1.0 + floor(aSeed.w * 2.0)) / ${TALL.toFixed(1)}), t = uAir.w;
          float hgt = 0.15 + ${TALL.toFixed(1)} * zf * zf * (box < ${BOX.toFixed(1)} ? 0.45 : 1.0);
          // (and wandering a little, each its own way)
          vec3 wander = vec3(sin(t * ${WANDER[0].toFixed(2)} + aSeed.x * 40.0), cos(t * ${WANDER[1].toFixed(2)} + aSeed.y * 40.0), sin(t * ${WANDER[2].toFixed(2)} + aSeed.z * 40.0) * 0.6) * (seed ? 0.5 : 0.22);
          vec3 rel = uGrassEast * (p.x + wander.x) + uGrassNorth * (p.y + wander.y) + uGrassUp * (ground + hgt + wander.z);
          // (fading at the box's sides and at the top and bottom of its rise: wrapping is never seen)
          float edge = (1.0 - smoothstep(0.38 * box, 0.5 * box, max(abs(p.x), abs(p.y)))) * smoothstep(0.0, 0.08, zf) * (1.0 - smoothstep(0.85, 1.0, zf));
          vec4 clip = projectionMatrix * viewMatrix * vec4(rel, 1.0);
          if (clip.w < 0.05) OUT_OF_PICTURE
          // its size on the picture: never under a pixel and a third (a mote there is as bright as its true size would be)
          // (a grain of pollen in the Sun is a glint wider than itself: drawn as 2 cm)
          float px = (seed ? 0.045 : 0.02) * uGrassView * abs(projectionMatrix[1][1]) / clip.w, drawn = clamp(px, 1.5, 22.0);
          float dim = min(1.0, (px * px) / (drawn * drawn) * 6.0);
          vec3 sun, sky, air; lightAt(at, sun, sky, air);
          // (a mote throws the Sun's light forward: looked at toward the Sun it is a spark)
          float c = max(dot(normalize(rel), uSunDir), 0.0), c2 = c * c, phase = 0.5 + 1.2 * c2 + 7.0 * c2 * c2 * c2 * c2;
          vec3 tint = seed ? vec3(0.95, 0.95, 0.90) : mix(vec3(1.0, 0.80, 0.34), vec3(1.0, 0.92, 0.6), aSeed.w);
          vCol = tint * (sun * phase * (seed ? 1.6 : 3.5) + sky * 0.35) * (keep * edge * dim);
          vSeed = seed ? 1.0 + aSeed.x * 6.0 : 0.0;
          gl_Position = clip; gl_PointSize = drawn;
        }`,
      fragmentShader: /* glsl */`
        in vec3 vCol; in float vSeed;
        layout(location = 0) out vec4 fragColor;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r = length(q), a;
          if (vSeed > 0.5) {
            // a seed: a small heart and the spokes of its parachute, turned its own way
            float th = atan(q.y, q.x) + vSeed;
            a = max(1.0 - smoothstep(0.1, 0.24, r), pow(abs(cos(th * 4.0)), 10.0) * (1.0 - smoothstep(0.5, 0.95, r)) * 0.8);
          } else { a = 1.0 - r; a *= a; }
          if (r > 1.0 || a <= 0.003) discard;
          fragColor = vec4(vCol * a, 0.0);
        }`,
    });
    this.mesh = new THREE.Points(geo, this.material); this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.air = [0, 0, 0]; this.time = 0; this.amount = 0; this.gust = 0; this.windSlow = null;
  }

  // The governor: draw this share of the motes.
  setShare(f) { this.share = f; }

  // Every frame, after the grass's own update. sunUp: the Sun's height over the traveller's horizon (its sine).
  update(dt, sunUp) {
    const g = this.grass, w = this.windU.value, rain = this.weatherU.value.w;
    // (in daylight, in dry air, as high as the near grass is drawn; eased, so rain does not switch it off at a stroke)
    const want = g.mesh.visible ? g.keepBlades * Math.min(1, Math.max(0, sunUp / 0.06)) * (rain > 0 ? 0 : 1) * (this.share > 0 ? 1 : 0) : 0;
    this.amount += (want - this.amount) * Math.min(1, dt * (want < this.amount ? 0.8 : 0.4));
    if (g.eager) this.amount = want;                     // (a picture: as it would be after a while)
    this.mesh.visible = this.amount > 0.004;
    // (a gust: the wind's speed above its own slow mean; it shakes more loose, and dies away)
    const speed = w.w;
    this.windSlow = this.windSlow == null ? speed : this.windSlow + (speed - this.windSlow) * Math.min(1, dt * 0.25);
    this.gust = Math.max(this.gust * Math.exp(-dt * 0.5), Math.min(1, Math.max(0, (speed - this.windSlow) / 2.5)));
    if (!this.mesh.visible) return;
    // (the air: carried by the wind at a part of its speed, rising slowly; added up frame by frame)
    const e = g._e, n = g._n, ws = Math.hypot(w.x, w.y, w.z) || 1, k = (0.25 + 0.3 * speed) / ws * dt, mod = (a, m) => ((a % m) + m) % m;
    this.air[0] = mod(this.air[0] + (w.x * e[0] + w.y * e[1] + w.z * e[2]) * k, BOX);
    this.air[1] = mod(this.air[1] + (w.x * n[0] + w.y * n[1] + w.z * n[2]) * k, BOX);
    this.air[2] = mod(this.air[2] + 0.1 * dt, TALL);
    this.time = mod(this.time + dt, WANDER_PERIOD);
    const cam = g.shared.uGrassCam.value;
    this.uniforms.uAir.value.set(mod(cam.x + g.origin[0] - this.air[0], BOX), mod(cam.y + g.origin[1] - this.air[1], BOX), this.air[2], this.time);
    this.uniforms.uPollen.value.set(this.amount, this.gust, 0, 0);
    this.geo.setDrawRange(0, Math.round(COUNT * Math.min(1, this.share)));
  }
}
