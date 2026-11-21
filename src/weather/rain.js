// Rain and snow round the traveller: a few hundred streaks (or flakes) that fall through a
// box of air that goes with the camera, slanted by the wind. Like the leaves, each is a
// sum worked out in the vertex shader from a number of its own and the clock; nothing is
// kept per drop. How many are drawn follows how hard it falls.
import * as THREE from 'three';

const COUNT = 1400, BOX = 26, TALL = 22;

export class Rain {
  constructor(shared) {
    // two ends to a streak: the same drop, a moment apart
    const pos = new Float32Array(COUNT * 2 * 3), seed = new Float32Array(COUNT * 2 * 4);
    for (let i = 0; i < COUNT; i++) { const a = Math.random(), b = Math.random(), c = Math.random(), d = Math.random(); for (let e = 0; e < 2; e++) { seed.set([a, b, c, d], (i * 2 + e) * 4); pos[(i * 2 + e) * 3] = e; } }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.uniforms = {
      uExposure: shared.uExposure, uSunIrradiance: shared.uSunIrradiance, uWeather: shared.uWeather, uFlash: shared.uFlash,
      uRainEast: { value: new THREE.Vector3(1, 0, 0) }, uRainNorth: { value: new THREE.Vector3(0, 1, 0) }, uRainUp: { value: new THREE.Vector3(0, 0, 1) },
      uFall: { value: new THREE.Vector4(0, 0, 9, 0) },         // xy: the wind's push east and north (m/s), z: how fast it falls (m/s), w: time (s)
      uKind: { value: new THREE.Vector3(0, 0, 0) },            // x: 0 rain, 1 snow; yz: the camera's travel east and north (m, wrapped)
      uBlown: { value: new THREE.Vector2(0, 0) },              // how far the wind has carried the air east and north (m, wrapped)
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: /* glsl */`
        in vec4 aSeed;
        uniform vec3 uRainEast, uRainNorth, uRainUp, uKind; uniform vec4 uFall; uniform vec2 uBlown;
        out float vA;
        void main() {
          float snow = uKind.x, speed = uFall.z * (0.8 + 0.4 * aSeed.z);
          float ago = position.x * mix(0.035, 0.04, snow), t = uFall.w + aSeed.w * 40.0 - ago;      // (the streak's other end: a moment earlier)
          // (how far the wind has carried the air is added up on the CPU, uBlown: the wind
          // gusts, and its speed times all the time that has passed threw the rain about)
          vec2 drift = uBlown - uFall.xy * ago + vec2(sin(t * 1.7 + aSeed.x * 9.0), cos(t * 1.3 + aSeed.y * 7.0)) * (0.5 * snow);
          vec2 p = mod(aSeed.xy * ${BOX.toFixed(1)} + drift - uKind.yz, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
          float h = mod(aSeed.z * 53.0 - speed * t, ${TALL.toFixed(1)}) - ${(TALL * 0.4).toFixed(1)};
          vec3 rel = uRainEast * p.x + uRainNorth * p.y + uRainUp * h;
          vA = (1.0 - smoothstep(${(BOX * 0.36).toFixed(1)}, ${(BOX * 0.5).toFixed(1)}, max(abs(p.x), abs(p.y)))) * smoothstep(0.3, 1.5, length(rel));
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
          gl_PointSize = 2.0;
        }`,
      fragmentShader: /* glsl */`
        uniform float uExposure; uniform vec3 uSunIrradiance, uFlash, uKind; uniform vec4 uWeather;
        in float vA;
        layout(location = 0) out vec4 fragColor;
        void main() {
          // (drops are lit by the grey sky they fall from, and by lightning)
          vec3 light = uSunIrradiance * (0.035 + 0.05 * uWeather.x) * uWeather.y + uFlash * 0.4;
          float a = vA * mix(0.22, 0.6, uKind.x);
          fragColor = vec4(light * mix(0.5, 0.9, uKind.x) * a * uExposure, a);
        }`,
    });
    this.mesh = new THREE.LineSegments(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this._last = new THREE.Vector3(); this._has = false; this.enabled = true; this.amount = 0;
  }

  // Every frame. weather: the Weather; rig: the camera rig; frame: local east, north, up arrays.
  update(weather, rig, time) {
    const u = this.uniforms, fall = weather.rain + weather.snow, snow = fall > 0 ? weather.snow / fall : 0;
    const want = this.enabled && rig.agl < 3000 ? Math.min(1, fall / 6) : 0;
    this.amount += (want - this.amount) * 0.08;
    const n = Math.round(COUNT * Math.sqrt(this.amount) * (this.share ?? 1));          // (share: the governor's thinner rain)
    this.geo.setDrawRange(0, n * 2); this.mesh.visible = n > 0;
    const e = weather._e, nn = weather._n, up = weather._u, sp = weather.windSpeed, w = weather.wind;
    u.uRainEast.value.set(...e); u.uRainNorth.value.set(...nn); u.uRainUp.value.set(...up);
    const we = (w.x * e[0] + w.y * e[1] + w.z * e[2]) * sp, wn = (w.x * nn[0] + w.y * nn[1] + w.z * nn[2]) * sp;
    const k = snow > 0.5 ? 0.8 : 0.5, dt = this._t == null || time < this._t ? 0 : Math.min(0.2, time - this._t);
    this._t = time;
    u.uFall.value.set(we * k, wn * k, snow > 0.5 ? 1.4 : 9, time);
    const b = u.uBlown.value; b.x = ((b.x + we * k * dt) % BOX + BOX) % BOX; b.y = ((b.y + wn * k * dt) % BOX + BOX) % BOX;
    const p = rig.pos, t = u.uKind.value;
    if (this._has) {
      const dx = p.x - this._last.x, dy = p.y - this._last.y, dz = p.z - this._last.z;
      if (Math.hypot(dx, dy, dz) < 500) { t.y = ((t.y + dx * e[0] + dy * e[1] + dz * e[2]) % BOX + BOX) % BOX; t.z = ((t.z + dx * nn[0] + dy * nn[1] + dz * nn[2]) % BOX + BOX) % BOX; }
    }
    this._last.copy(p); this._has = true;
    t.x = snow;
  }
}
