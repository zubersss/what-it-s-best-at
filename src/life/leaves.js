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

// Petals: what a tree in flower lets go. They come off the nearest flowering trees
// themselves (Trees.blooming: up to eight of them), more in a gust than between gusts,
// and ride the wind down, turning; and some lie on the ground under each tree and a
// little down the wind of it. A fixed pool of points, like the leaves: a falling petal is
// one sum in the vertex shader from a number of its own and the clock; a lying one is put
// on the ground as it is drawn (a few of them a frame are asked where the ground is).
// What carries a falling petal is the wind's velocity, eased over a few seconds here
// (never the wind's speed times the clock: a change of wind would move every petal at once).
const FALLING = 640, LYING = 320, SLOTS = 8, PER_FRAME = 8;

export class Petals {
  constructor(trees) {
    this.trees = trees; this.terrain = trees.terrain;
    const mk = (count, extra) => {
      const seed = new Float32Array(count * 4), slot = new Float32Array(count);
      for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
      for (let i = 0; i < count; i++) slot[i] = i % SLOTS;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); geo.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
      if (extra) { const a = new THREE.BufferAttribute(new Float32Array(count * 4), 4); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aLie', a); }
      geo.setDrawRange(0, 0);
      return geo;
    };
    const vec4s = () => Array.from({ length: SLOTS }, () => new THREE.Vector4());
    this.uniforms = {
      ...lightingUniforms(),
      uLeafEast: trees.shared.uTreeEast, uLeafNorth: trees.shared.uTreeNorth, uLeafUp: trees.shared.uTreeUp, uLeafSeason: trees.shared.uSeason, uAnchorRel: trees.shared.uAnchorRel,
      uPetalTree: { value: vec4s() },        // xyz: a flowering tree's foot from the anchor (m), w: its crown's radius (m)
      uPetalTop: { value: vec4s() },         // x: its height (m), y: how fast its petals come off (0..1)
      uPetalCol: { value: Array.from({ length: SLOTS }, () => new THREE.Vector3()) },
      uPetalWind: { value: new THREE.Vector3() },      // the wind's velocity, eased (m/s, planet axes)
      uLeafPx: { value: 1000 },
    };
    const HEAD = /* glsl */`
      in vec4 aSeed; in float aSlot;
      uniform vec3 uLeafEast, uLeafNorth, uLeafUp, uLeafSeason, uAnchorRel, uPetalWind; uniform float uLeafPx;
      uniform vec4 uPetalTree[${SLOTS}]; uniform vec4 uPetalTop[${SLOTS}]; uniform vec3 uPetalCol[${SLOTS}];
      out vec3 vRel; out vec4 vSeed; out float vSpin; out float vFade; out vec3 vCol;
      void place(vec3 rel, float fade, float size) {
        vRel = rel; vSeed = aSeed; vFade = fade;
        vec4 clip = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        gl_PointSize = clamp(size * uLeafPx / max(clip.w, 0.3), 1.5, 28.0);
        // (nothing of it: out of the picture, not a point of no size)
        gl_Position = fade > 0.02 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
      }`;
    const FRAG = /* glsl */`${LIGHTING_PARS}
      in vec3 vRel; in vec4 vSeed; in float vSpin; in float vFade; in vec3 vCol;
      layout(location = 0) out vec4 fragColor;
      void main() {
        // a petal seen at some angle of its tumble: a round thing that narrows and widens
        vec2 q = gl_PointCoord * 2.0 - 1.0; float c = cos(vSpin), s = sin(vSpin);
        q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
        float thin = 0.3 + 0.7 * abs(cos(vSpin * 0.37 + vSeed.z * 6.0));
        if (q.x * q.x + (q.y / thin) * (q.y / thin) > 1.0 || fract(vSeed.w * 91.0 + gl_FragCoord.x * 0.37 + gl_FragCoord.y * 0.61) > vFade) discard;
        vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
        // (thin and pale: lit from both sides, and the sky's light counts for much)
        vec3 col = vCol * (0.85 + 0.3 * vSeed.x) * (directSun(planetPos) * nearShadow(vRel, up) * (0.45 + 0.55 * thin) + skyLight(up, up)) / PI;
        col = aerialPerspective(col, vRel);
        fragColor = vec4(col * uExposure, 1.0);
      }`;
    const material = (vertexShader) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.uniforms, vertexShader, fragmentShader: FRAG });
    this.fallGeo = mk(FALLING, false);
    this.falling = new THREE.Points(this.fallGeo, material(/* glsl */`${HEAD}
      void main() {
        int s = int(aSlot); vec4 tr = uPetalTree[s]; vec4 top = uPetalTop[s]; vCol = uPetalCol[s];
        float T = 8.0 + 6.0 * aSeed.z, t = uLeafSeason.z / T + aSeed.w, cyc = fract(t), lap = floor(t), age = cyc * T;
        // let go in a gust: the gust as it was when this petal came off (the trees sway to the same beat)
        float gust = 0.5 + 0.5 * sin((lap - aSeed.w) * T * 0.7 + aSlot * 2.1);
        float go = step(fract(aSeed.z * 13.0 + lap * 0.37), top.y * mix(0.12, 1.5, gust * gust));
        // from somewhere in the crown
        vec2 r = fract(aSeed.xy + lap * vec2(0.618034, 0.754878));
        float ang = r.x * 6.2831853, rad = tr.w * sqrt(r.y) * 0.95, y0 = top.x * (0.42 + 0.5 * fract(aSeed.x * 7.0 + lap * 0.21));
        float h = y0 - (0.8 + 0.6 * aSeed.y) * age;
        // down the wind as it falls (the wind is slower in among the trees than over them), swinging side to side
        vec3 drift = (uPetalWind - uLeafUp * dot(uPetalWind, uLeafUp)) * (0.55 * age);
        vec2 swing = vec2(sin(t * 31.0 + aSeed.x * 9.0), cos(t * 23.0 + aSeed.y * 7.0)) * (0.25 + 0.06 * age);
        vec3 rel = uAnchorRel + tr.xyz + uLeafEast * (cos(ang) * rad + swing.x) + uLeafNorth * (sin(ang) * rad + swing.y) + uLeafUp * (h + 0.03) + drift;
        vSpin = t * (50.0 + 70.0 * aSeed.x);
        place(rel, go * step(0.5, tr.w) * smoothstep(0.0, 0.04, cyc) * smoothstep(0.0, 0.35, h) * (1.0 - smoothstep(60.0, 90.0, length(rel))), 0.04 + 0.03 * aSeed.y);
      }`));
    this.lieGeo = mk(LYING, true);
    this.lying = new THREE.Points(this.lieGeo, material(/* glsl */`${HEAD}
      in vec4 aLie;          // xyz: where it lies, from the anchor (m); w: 1 when it has been put on the ground
      void main() {
        int s = int(aSlot); vCol = uPetalCol[s] * 0.9;
        vec3 rel = uAnchorRel + aLie.xyz;
        vSpin = aSeed.x * 40.0;
        // (as many as the tree is letting go; none from far off, where a petal is under a pixel)
        place(rel, aLie.w * step(aSeed.z, uPetalTop[s].y * 1.3) * (1.0 - smoothstep(35.0, 55.0, length(rel))), 0.045 + 0.03 * aSeed.y);
      }`));
    for (const m of [this.falling, this.lying]) { m.frustumCulled = false; m.visible = false; }
    this.mesh = new THREE.Group(); this.mesh.add(this.falling, this.lying);
    this.abs = new Float64Array(LYING * 3); this.put = new Uint8Array(LYING); this.next = 0;
    this.anchor = new THREE.Vector3(1e12, 0, 0); this.serial = null; this.enabled = true; this.count = 0;
    this._wind = new THREE.Vector3(); this._d = [0, 0, 0];
  }

  // Every frame. rig: the camera rig; viewH: the picture's height in pixels; dt (s).
  update(rig, viewH, dt) {
    const tr = this.trees, list = tr.blooming || [], u = this.uniforms, show = !!tr.def && list.length > 0 && rig.agl < 150 && tr.reach > 0;
    this.falling.visible = this.lying.visible = show; this.count = show ? list.length : 0;
    // the wind's velocity, eased over some three seconds
    const w = tr.shared.uTreeWind.value, k = Math.min(1, (dt || 0.016) / 3);
    this._wind.x += (w.x * w.w - this._wind.x) * k; this._wind.y += (w.y * w.w - this._wind.y) * k; this._wind.z += (w.z * w.w - this._wind.z) * k;
    u.uPetalWind.value.copy(this._wind);
    u.uLeafPx.value = viewH / (2 * Math.tan(rig.fov * Math.PI / 360));
    if (!show) return;
    // (the governor's step thins them to a third; it does not take them away)
    this.fallGeo.setDrawRange(0, this.enabled ? FALLING : Math.round(FALLING / 3)); this.lieGeo.setDrawRange(0, this.enabled ? LYING : Math.round(LYING / 3));
    // the trees in flower have changed (the lists were made again): the lying petals are put down afresh
    const A = tr.anchor, lie = this.lieGeo.attributes.aLie;
    if (this.serial !== list) {
      this.serial = list; this.put.fill(0); this.next = 0;
      for (let s = 0; s < SLOTS; s++) {
        const t = list[s];
        if (t) { u.uPetalTree.value[s].set(t.x, t.y, t.z, Math.max(0.6, t.tall * t.wide * 0.42)); u.uPetalTop.value[s].set(t.tall, t.fall, 0, 0); u.uPetalCol.value[s].set(...t.colour); } else { u.uPetalTree.value[s].set(0, 0, 0, 0); u.uPetalTop.value[s].set(0, 0, 0, 0); }
      }
      // (their feet in the world, to find again when the anchor moves)
      this.feet = list.map((t) => [A.x + t.x, A.y + t.y, A.z + t.z, Math.max(0.6, t.tall * t.wide * 0.42)]);
      for (let i = 0; i < LYING; i++) lie.array[i * 4 + 3] = 0;
      lie.needsUpdate = true; this.anchor.copy(A);
    }
    // a few a frame: where the ground is under each (the ground as it is drawn), in the world
    const seed = this.lieGeo.attributes.aSeed.array, e = u.uLeafEast.value, n = u.uLeafNorth.value, R = this.terrain.radius, d = this._d;
    let changed = false;
    for (let c = 0; c < PER_FRAME && this.next < LYING; c++) {
      const i = this.next++, f = this.feet[i % SLOTS];
      if (!f) continue;
      // under the crown and a little beyond it, more of them down the wind
      const ang = seed[i * 4] * 6.2831853, rad = f[3] * 1.25 * Math.sqrt(seed[i * 4 + 1]), wl = this._wind.length() || 1, down = Math.min(1, wl / 6) * f[3] * 0.6 * seed[i * 4 + 3];
      const ox = Math.cos(ang) * rad, oy = Math.sin(ang) * rad;
      let x = f[0] + e.x * ox + n.x * oy + this._wind.x / wl * down, y = f[1] + e.y * ox + n.y * oy + this._wind.y / wl * down, z = f[2] + e.z * ox + n.z * oy + this._wind.z / wl * down;
      const l = Math.hypot(x, y, z); d[0] = x / l; d[1] = y / l; d[2] = z / l;
      const g = this.terrain.drawnHeight(d, rig.pos.length());
      if (g == null) { this.next--; break; }          // (no ground drawn there yet: again next frame)
      const r = R + g + 0.03;
      this.abs[i * 3] = d[0] * r; this.abs[i * 3 + 1] = d[1] * r; this.abs[i * 3 + 2] = d[2] * r; this.put[i] = 1;
      lie.array[i * 4] = d[0] * r - A.x; lie.array[i * 4 + 1] = d[1] * r - A.y; lie.array[i * 4 + 2] = d[2] * r - A.z; lie.array[i * 4 + 3] = 1; changed = true;
    }
    if (changed) lie.needsUpdate = true;
  }
}
