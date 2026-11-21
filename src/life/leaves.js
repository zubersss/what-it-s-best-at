// Leaves the wind takes off the trees: a few hundred small points that come loose
// overhead, ride the wind down, turning, and lie on the ground a moment before they are
// gone. Only where trees that drop their leaves stand near, in their season, or in a gale.
// Every leaf is the same sum worked out in the vertex shader from a number of its own and
// the clock, so nothing is kept or updated per leaf; they stay where they are in the
// world as the traveller moves (the camera's own travel is taken out).
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';

const COUNT = 420, BOX = 44;            // leaves, and the side of the square of ground they fall over (m)

export class Leaves {
  constructor(trees) {
    this.trees = trees;
    const seed = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT * 4; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.uniforms = {
      ...lightingUniforms(),
      uLeafEast: trees.shared.uTreeEast, uLeafNorth: trees.shared.uTreeNorth, uLeafUp: trees.shared.uTreeUp, uLeafWind: trees.shared.uTreeWind, uLeafSeason: trees.shared.uSeason,
      uTravel: { value: new THREE.Vector3() },        // the camera's travel east and north (m, wrapped to the box), and its height above its feet's ground
      uLeafPx: { value: 1000 },                        // pixels a metre covers at a metre's distance
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: { ...atmosphereDefines(), BOX: BOX.toFixed(1) }, uniforms: this.uniforms,
      vertexShader: /* glsl */`
        in vec4 aSeed;
        uniform vec3 uLeafEast, uLeafNorth, uLeafUp, uTravel, uLeafSeason; uniform vec4 uLeafWind; uniform float uLeafPx;
        out vec3 vRel; out vec4 vSeed; out float vSpin; out float vFade;
        void main() {
          float T = 6.0 + 5.0 * aSeed.z, t = uLeafSeason.z / T + aSeed.w, cyc = fract(t), lap = floor(t);
          // (a new place and height every time round)
          vec2 r = fract(aSeed.xy + lap * vec2(0.618034, 0.754878));
          float top = 3.0 + 13.0 * fract(aSeed.z * 7.0 + lap * 0.37), fall = min(1.0, cyc / 0.82);
          vec2 wind = vec2(dot(uLeafWind.xyz, uLeafEast), dot(uLeafWind.xyz, uLeafNorth)) * (0.35 * uLeafWind.w);
          float h = top * (1.0 - fall) * (1.0 - 0.25 * fall);
          // down the wind as it falls, side to side as leaves do; still once it lies
          vec2 p = r * BOX + wind * (fall * T * 0.82) + vec2(sin(t * 37.0 + aSeed.x * 9.0), cos(t * 29.0 + aSeed.y * 7.0)) * (0.35 * (1.0 - fall) + 0.02);
          p = mod(p - uTravel.xy, BOX) - 0.5 * BOX;
          vec3 rel = uLeafEast * p.x + uLeafNorth * p.y + uLeafUp * (h + 0.03 - uTravel.z);
          vRel = rel; vSeed = aSeed; vSpin = t * (40.0 + 60.0 * aSeed.x) * (1.0 - step(1.0, fall));
          float edge = 1.0 - smoothstep(0.38 * BOX, 0.5 * BOX, max(abs(p.x), abs(p.y)));
          vFade = edge * smoothstep(0.0, 0.05, cyc) * (1.0 - smoothstep(0.93, 1.0, cyc));
          vec4 clip = projectionMatrix * viewMatrix * vec4(rel, 1.0);
          gl_Position = clip;
          gl_PointSize = clamp((0.06 + 0.05 * aSeed.y) * uLeafPx / max(clip.w, 0.3), 1.0, 40.0) * step(0.02, vFade);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        uniform vec3 uLeafSeason;
        in vec3 vRel; in vec4 vSeed; in float vSpin; in float vFade;
        layout(location = 0) out vec4 fragColor;
        void main() {
          // a leaf seen at some angle of its tumble: an ellipse that narrows and widens
          vec2 q = gl_PointCoord * 2.0 - 1.0; float c = cos(vSpin), s = sin(vSpin);
          q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
          float thin = 0.25 + 0.75 * abs(cos(vSpin * 0.37 + vSeed.z * 6.0));
          if (q.x * q.x + (q.y / thin) * (q.y / thin) > 1.0 || fract(vSeed.w * 91.0 + gl_FragCoord.x * 0.37 + gl_FragCoord.y * 0.61) > vFade) discard;
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
          // green in a gale out of season, else the season's colours
          vec3 autumn = mix(vec3(0.42, 0.24, 0.03), vec3(0.30, 0.05, 0.02), smoothstep(0.3, 0.8, vSeed.x));
          vec3 albedo = mix(vec3(0.06, 0.11, 0.03), autumn, clamp(uLeafSeason.x * 2.0 + uLeafSeason.y, 0.0, 1.0));
          vec3 col = albedo * (directSun(planetPos) * nearShadow(vRel, up) * (0.35 + 0.65 * thin) + skyLight(up, up)) / PI;
          col = aerialPerspective(col, vRel);
          fragColor = vec4(col * uExposure, 1.0);
        }`,
    });
    this.mesh = new THREE.Points(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this._last = new THREE.Vector3(); this._has = false; this.amount = 0; this.enabled = true;
  }

  // Every frame. rig: the camera rig; viewH: the picture's height in pixels.
  update(rig, viewH) {
    const tr = this.trees, s = tr.shared.uSeason.value, wind = tr.shared.uTreeWind.value.w;
    // how many: by the season, by the wind, by how many leaf-dropping trees stand near
    // (in their season, from the trees that drop their leaves; in a gale, from every tree,
    // green; and from the trees a traveller tears past: the wind of its passing takes them)
    const speed = rig.onFoot ? (rig.footVel?.length() || 0) : rig.velocity.length(), all = Math.min(1, (tr.near || 0) / 8);
    const pass = this._pass = Math.max((this._pass || 0) * 0.985, Math.min(1, Math.max(0, speed - 18) / 50) * all);
    const want = this.enabled && tr.def && rig.agl < 200 ? Math.max(Math.min(1, s.x * 1.3 + 0.5 * s.y * (1 - s.y) * 4) * Math.min(1, tr.falling / 12), Math.min(1, Math.max(0, wind - 9) / 12) * all, pass) : 0;
    this.amount += (want - this.amount) * (want > this.amount ? 0.12 : 0.02);
    const n = Math.round(COUNT * this.amount);
    this.geo.setDrawRange(0, n); this.mesh.visible = n > 0;
    const p = rig.pos, t = this.uniforms.uTravel.value, e = tr.shared.uTreeEast.value, nn = tr.shared.uTreeNorth.value;
    if (this._has) {
      const dx = p.x - this._last.x, dy = p.y - this._last.y, dz = p.z - this._last.z, step = Math.hypot(dx, dy, dz);
      if (step < 500) { t.x = ((t.x + dx * e.x + dy * e.y + dz * e.z) % BOX + BOX) % BOX; t.y = ((t.y + dx * nn.x + dy * nn.y + dz * nn.z) % BOX + BOX) % BOX; }
    }
    this._last.copy(p); this._has = true;
    // the camera's height above the ground its figure stands on (the leaves' floor)
    t.z = rig.onFoot ? rig.pos.distanceTo(rig.feet) * 0 + (rig.pos.length() - rig.feet.length()) : Math.min(60, rig.agl);
    this.uniforms.uLeafPx.value = viewH / (2 * Math.tan(rig.fov * Math.PI / 360));
  }
}
