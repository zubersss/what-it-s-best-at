// Rain and snow round the traveller: streaks (or flakes) that fall through a box of air
// that goes with the camera, slanted by the wind. Like the leaves, each is a sum worked out
// in the vertex shader from a number of its own and the clock; nothing is kept per drop.
// How many are drawn follows how hard it falls.
//
// A streak is a narrow strip turned to the eye: as wide as a drop's smear (a few
// millimetres) and never under a pixel and a half, so that rain is seen on a phone's
// screen. (As one-pixel lines the heaviest rain there is was a few scratches; and the two
// ends of a line were wrapped into the box apart, so one streak in twelve was drawn right
// across it.) A third of them fall in a small box round the eye: the rain one sees drop
// by drop is the rain within a few metres; what is farther is the veil (lightingGlsl).
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

const COUNT = 5600, BOX = 26, TALL = 22, NEAR = 0.36;      // NEAR: the small box's size against the large one's

export class Rain {
  constructor(shared) {
    // four corners to a streak: position.x 0 at the drop, 1 where it was a moment ago; y the side
    const pos = new Float32Array(COUNT * 4 * 3), seed = new Float32Array(COUNT * 4 * 4), index = new Uint32Array(COUNT * 6);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random(), b = Math.random(), c = Math.random(), d = Math.random();
      for (let e = 0; e < 4; e++) { seed.set([a, b, c, d], (i * 4 + e) * 4); pos[(i * 4 + e) * 3] = e >> 1; pos[(i * 4 + e) * 3 + 1] = (e & 1) * 2 - 1; }
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.uniforms = {
      ...lightingUniforms(),
      uExposure: shared.uExposure, uSunIrradiance: shared.uSunIrradiance, uWeather: shared.uWeather, uFlash: shared.uFlash,
      uRainEast: { value: new THREE.Vector3(1, 0, 0) }, uRainNorth: { value: new THREE.Vector3(0, 1, 0) }, uRainUp: { value: new THREE.Vector3(0, 0, 1) },
      uFall: { value: new THREE.Vector4(0, 0, 9, 0) },         // xy: the wind's push east and north (m/s), z: how fast it falls (m/s), w: time (s)
      uKind: { value: new THREE.Vector3(0, 0, 0) },            // x: 0 rain, 1 snow; yz: the camera's travel east and north (m, wrapped)
      uBlown: { value: new THREE.Vector2(0, 0) },              // how far the wind has carried the air east and north (m, wrapped)
      uPix: { value: 0.001 },                                  // the angle of one pixel of the picture (radians)
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: /* glsl */`
        in vec4 aSeed;
        uniform vec3 uRainEast, uRainNorth, uRainUp, uKind; uniform vec4 uFall; uniform vec2 uBlown; uniform float uPix;
        out vec2 vA;
        void main() {
          float snow = uKind.x, speed = uFall.z * (0.8 + 0.4 * aSeed.z), t = uFall.w + aSeed.w * 40.0;
          // (which box: the small one round the eye, or the large one)
          float k = fract(aSeed.w * 7.31) < 0.34 ? ${NEAR.toFixed(2)} : 1.0, box = ${BOX.toFixed(1)} * k, tall = ${TALL.toFixed(1)} * k;
          // (how far the wind has carried the air is added up on the CPU, uBlown: the wind
          // gusts, and its speed times all the time that has passed threw the rain about)
          vec2 drift = uBlown + vec2(sin(t * 1.7 + aSeed.x * 9.0), cos(t * 1.3 + aSeed.y * 7.0)) * (0.5 * snow);
          vec2 p = mod(aSeed.xy * ${BOX.toFixed(1)} + drift - uKind.yz, box) - 0.5 * box;
          float h = mod(aSeed.z * 53.0 - speed * t, tall) - 0.4 * tall;
          vec3 head = uRainEast * p.x + uRainNorth * p.y + uRainUp * h;
          // the drop a moment ago, from the drop now (never wrapped apart from it): the smear
          // the eye makes of a falling drop, about a thirtieth of a second long
          vec3 vel = uRainEast * uFall.x + uRainNorth * uFall.y - uRainUp * speed;
          vec3 tail = head - vel * mix(0.034, 0.03, snow);
          vec3 hv = (viewMatrix * vec4(head, 1.0)).xyz, tv = (viewMatrix * vec4(tail, 1.0)).xyz, at = mix(hv, tv, position.x);
          vec3 sd = cross(at, tv - hv); float sl = length(sd);
          // (as wide as the smear, and never under a pixel and a half of the picture)
          // (hw, not the word for a half: GLSL keeps that one for itself)
          float dist = max(-at.z, 0.05), hw = max(mix(0.0035, 0.011, snow), 0.75 * uPix * dist);
          if (sl > 1e-6) at += sd / sl * (hw * position.y);
          float d0 = length(head);
          vA = vec2((1.0 - smoothstep(0.36 * box, 0.5 * box, max(abs(p.x), abs(p.y)))) * smoothstep(0.4, 1.6, d0)
                    // (a strip widened to a pixel and a half carries less: a far drop is faint, not fat)
                    * min(1.0, mix(0.0035, 0.011, snow) / hw * 2.2),
                    position.x);
          gl_Position = projectionMatrix * vec4(at, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform vec3 uKind, uRainUp;
        in vec2 vA;
        layout(location = 0) out vec4 fragColor;
        void main() {
          // A drop is a lens full of the sky: it shows as bright as the sky it falls from,
          // well over the grey that rain lays on what is far (rainVeil) and over the ground
          // under an overcast, and it goes dark with the sky at night; lightning lights it
          // (skyLight carries the flash). (Lit by a set share of the Sun's light it came out
          // as bright as the scene behind it: rain that could not be seen.)
          vec3 light = skyLight(uRainUp, uRainUp) * (mix(1.5, 1.9, uKind.x) / PI);
          // (bright at the drop, fading along the smear behind it)
          float a = vA.x * mix(0.55, 0.7, uKind.x) * (1.0 - 0.7 * vA.y);
          fragColor = vec4(light * a * uExposure, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this._last = new THREE.Vector3(); this._has = false; this.enabled = true; this.amount = 0;
  }

  // Every frame. weather: the Weather; rig: the camera rig; frame: local east, north, up arrays.
  // pix: the angle of one pixel of the picture (radians).
  update(weather, rig, time, pix) {
    if (pix) this.uniforms.uPix.value = pix;
    const u = this.uniforms, fall = weather.rain + weather.snow, snow = fall > 0 ? weather.snow / fall : 0;
    const want = this.enabled && rig.agl < 3000 ? Math.min(1, fall / 6) : 0;
    this.amount += (want - this.amount) * 0.08;
    const n = Math.round(COUNT * Math.sqrt(this.amount) * (this.share ?? 1));          // (share: the governor's thinner rain)
    this.geo.setDrawRange(0, n * 6); this.mesh.visible = n > 0;
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
