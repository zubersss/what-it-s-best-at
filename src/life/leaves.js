// Leaves the wind takes off the trees: a few hundred small points that come loose
// overhead, ride the wind down, turning, and lie on the ground a moment before they are
// gone. Only where trees that drop their leaves stand near, in their season, or in a gale.
// Every leaf is the same sum worked out in the vertex shader from a number of its own and
// the clock, so nothing is kept or updated per leaf; they stay where they are in the
// world as the traveller moves (the camera's own travel is taken out).
import * as THREE from 'three';
import { LIGHTING_PARS, lightingUniforms } from '../render/lightingGlsl.js';
import { atmosphereDefines } from '../atmosphere/atmosphere.js';
import { AMOUNT } from './grassRules.js';

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
    const want = this.enabled && tr.def && rig.agl < 200 ? Math.max(0.7 * (tr.placeSeason?.shed || 0) * Math.min(1, tr.falling / 12), Math.min(1, Math.max(0, wind - 9) / 12) * all, pass) : 0;
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
// The same machine lets a tree's leaves go in autumn and lays them under it (TreeLeaves,
// from Trees.shedding: the trees the season's rule says are dropping leaves or have leaves
// lying under them, in each tree's own colours): what differs is in the options.
export const SLOTS = 8;
const SHED = {
  list: 'blooming',                 // which of the trees' lists: each entry { x, y, z (from the anchor), tall, wide, fall (0..1: how fast it lets go), colour }
  falling: 640, lying: 480,         // points in the air, points on the ground
  perFrame: 6,                      // lying ones put on the ground a frame
  lie: (t) => t.fall * 1.3,         // how much of a tree's lying share is there, 0..1
  lieColour: (t) => t.colour.map((v) => v * 0.9),
  size: [0.085, 0.05, 0.09, 0.05],  // a falling one's size (m) and how much its own number adds; a lying one's
  spread: 1,                        // how far out from under the crown they lie (x the crown's radius)
  downwind: 0.9,                    // ... and how far down the wind (x the radius, in a wind of 6 m/s and more)
  lieFar: [35, 55],                 // lying ones are drawn to here (m: fading from, gone at)
};

export class Shed {
  constructor(trees, opts = {}) {
    const o = this.o = { ...SHED, ...opts }, FALLING = o.falling, LYING = o.lying;
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
      uPetalTop: { value: vec4s() },         // x: its height (m), y: how fast its petals come off (0..1), z: the slot's falling petals faded in (0..1: a slot moving to another tree fades out and in), w: how much of its lying share lies (0..1)
      uPetalCol: { value: Array.from({ length: SLOTS }, () => new THREE.Vector3()) },
      uLieCol: { value: Array.from({ length: SLOTS }, () => new THREE.Vector3()) },        // the colour of what lies under it
      uPetalWind: { value: new THREE.Vector3() },      // the wind's velocity, eased (m/s, planet axes)
      uLeafPx: { value: 1000 },
    };
    const HEAD = /* glsl */`
      in vec4 aSeed; in float aSlot;
      uniform vec3 uLeafEast, uLeafNorth, uLeafUp, uLeafSeason, uAnchorRel, uPetalWind; uniform float uLeafPx;
      uniform vec4 uPetalTree[${SLOTS}]; uniform vec4 uPetalTop[${SLOTS}]; uniform vec3 uPetalCol[${SLOTS}]; uniform vec3 uLieCol[${SLOTS}];
      out vec3 vRel; out vec4 vSeed; out float vSpin; out float vFade; out vec3 vCol;
      void place(vec3 rel, float fade, float size) {
        vRel = rel; vSeed = aSeed; vFade = fade;
        vec4 clip = projectionMatrix * viewMatrix * vec4(rel, 1.0);
        gl_PointSize = clamp(size * uLeafPx / max(clip.w, 0.3), 1.5, 56.0);          // (one that passes close to the eye is large on the screen: that is where petals are seen)
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
        // (thin and pale: lit from both sides, and the sky's light counts for much; a petal is
        // drawn larger than life, as the meadow's flowers are, or it would be under a pixel from ten metres)
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
        // (a steady light fall always, a flurry when a gust passes)
        float go = step(fract(aSeed.z * 13.0 + lap * 0.37), top.y * mix(0.6, 2.0, gust * gust));
        // from somewhere in the crown
        vec2 r = fract(aSeed.xy + lap * vec2(0.618034, 0.754878));
        float ang = r.x * 6.2831853, rad = tr.w * sqrt(r.y) * 0.95, y0 = top.x * (0.42 + 0.5 * fract(aSeed.x * 7.0 + lap * 0.21));
        float h = y0 - (0.55 + 0.5 * aSeed.y) * age;
        // down the wind as it falls (the wind is slower in among the trees than over them), swinging side to side
        vec3 drift = (uPetalWind - uLeafUp * dot(uPetalWind, uLeafUp)) * (0.75 * age);
        vec2 swing = vec2(sin(t * 31.0 + aSeed.x * 9.0), cos(t * 23.0 + aSeed.y * 7.0)) * (0.25 + 0.06 * age);
        vec3 rel = uAnchorRel + tr.xyz + uLeafEast * (cos(ang) * rad + swing.x) + uLeafNorth * (sin(ang) * rad + swing.y) + uLeafUp * (h + 0.03) + drift;
        vSpin = t * (50.0 + 70.0 * aSeed.x);
        place(rel, go * top.z * step(0.5, tr.w) * smoothstep(0.0, 0.04, cyc) * smoothstep(0.0, 0.35, h) * (1.0 - smoothstep(60.0, 90.0, length(rel))), ${o.size[0].toFixed(3)} + ${o.size[1].toFixed(3)} * aSeed.y);
      }`));
    this.lieGeo = mk(LYING, true);
    this.lying = new THREE.Points(this.lieGeo, material(/* glsl */`${HEAD}
      in vec4 aLie;          // xyz: where it lies, from the anchor (m); w: 1 when it has been put on the ground
      void main() {
        int s = int(aSlot); vCol = uLieCol[s];
        vec3 rel = uAnchorRel + aLie.xyz;
        vSpin = aSeed.x * 40.0;
        // (as many as the tree is letting go; none from far off, where a petal is under a pixel)
        place(rel, aLie.w * step(aSeed.z, uPetalTop[s].w) * (1.0 - smoothstep(${o.lieFar[0].toFixed(1)}, ${o.lieFar[1].toFixed(1)}, length(rel))), ${o.size[2].toFixed(3)} + ${o.size[3].toFixed(3)} * aSeed.y);
      }`));
    for (const m of [this.falling, this.lying]) { m.frustumCulled = false; m.visible = false; }
    this.mesh = new THREE.Group(); this.mesh.add(this.falling, this.lying);
    this.abs = new Float64Array(LYING * 3); this.put = new Uint8Array(LYING); this.next = 0; this.left = 0; this.feet = []; this.lift = new Float32Array(LYING); this.again = 0;
    this.cur = new Array(SLOTS).fill(null); this.want = new Array(SLOTS).fill(null); this.fade = new Float32Array(SLOTS);
    this.anchor = new THREE.Vector3(1e12, 0, 0); this.serial = null; this.enabled = true; this.count = 0;
    this._wind = new THREE.Vector3(); this._d = [0, 0, 0];
  }

  // Every frame. rig: the camera rig; viewH: the picture's height in pixels; dt (s); all: lay
  // every lying one at once (a picture: laid a few a frame, the picture went on changing for
  // a hundred frames, and a screenshot waits until it is still).
  update(rig, viewH, dt, all = false) {
    const { falling: FALLING, lying: LYING } = this.o, o = this.o, PER_FRAME = all ? LYING : o.perFrame;
    const tr = this.trees, list = tr[o.list] || [], u = this.uniforms, show = !!tr.def && list.length > 0 && rig.agl < 150 && tr.reach > 0;
    this.falling.visible = this.lying.visible = show; this.count = show ? list.length : 0;
    // the wind's velocity, eased over some three seconds
    const w = tr.shared.uTreeWind.value, k = Math.min(1, (dt || 0.016) / 3);
    this._wind.x += (w.x * w.w - this._wind.x) * k; this._wind.y += (w.y * w.w - this._wind.y) * k; this._wind.z += (w.z * w.w - this._wind.z) * k;
    u.uPetalWind.value.copy(this._wind);
    u.uLeafPx.value = viewH / (2 * Math.tan(rig.fov * Math.PI / 360));
    if (!show) return;
    // (the governor's step thins them to a third; it does not take them away)
    this.fallGeo.setDrawRange(0, this.enabled ? FALLING : Math.round(FALLING / 3)); this.lieGeo.setDrawRange(0, this.enabled ? LYING : Math.round(LYING / 3));
    // The trees in flower are listed again at every making of the trees' lists, from a new
    // anchor. A slot stays on its tree while the tree is still listed (found by its foot in
    // the world) and its lying petals stay where they lie, only measured from the new anchor;
    // only a slot whose tree has gone, or that the sharing out moves to a tree with too few,
    // is put on another tree and its petals put down again. (Every making once cleared all
    // the lying petals and moved the falling ones to other trees: every 25 m of a walk.)
    const A = tr.anchor, lie = this.lieGeo.attributes.aLie;
    if (this.serial !== list) { this.serial = list; this._relist(list, A, lie); }
    this._slots(A, lie, dt || 1 / 30);
    // a few a frame: where the ground is under each (the ground as it is drawn), in the world
    const seed = this.lieGeo.attributes.aSeed.array, e = u.uLeafEast.value, n = u.uLeafNorth.value, R = this.terrain.radius, d = this._d, P = rig.pos;
    let changed = false;
    for (let c = 0, scanned = 0; c < PER_FRAME && this.left > 0 && scanned < LYING; scanned++) {
      const i = this.next; this.next = (this.next + 1) % LYING;
      if (this.put[i]) continue;
      const f = this.feet[i % SLOTS];
      if (!f) continue;
      c++;
      // under the crown and a little beyond it, more of them down the wind
      // (thickest in a ring under the crown's edge: two in three lie there, the rest anywhere under it)
      const ring = seed[i * 4 + 2] < 0.67, ang = seed[i * 4] * 6.2831853, rad = f[3] * o.spread * (ring ? 1 + 0.4 * (seed[i * 4 + 1] + ((seed[i * 4 + 3] * 7) % 1) - 1) : 1.1 * Math.sqrt(seed[i * 4 + 1])), wl = this._wind.length() || 1, down = Math.min(1, wl / 6) * f[3] * o.downwind * seed[i * 4 + 3];
      const ox = Math.cos(ang) * rad, oy = Math.sin(ang) * rad;
      let x = f[0] + e.x * ox + n.x * oy + this._wind.x / wl * down, y = f[1] + e.y * ox + n.y * oy + this._wind.y / wl * down, z = f[2] + e.z * ox + n.z * oy + this._wind.z / wl * down;
      const l = Math.hypot(x, y, z); d[0] = x / l; d[1] = y / l; d[2] = z / l;
      // (the ground as drawn there: its morph is by the distance from the eye to that point)
      const g = this.terrain.drawnHeight(d, Math.hypot(x - P.x, y - P.y, z - P.z));
      if (g == null) { this.next = i; break; }          // (no ground drawn there yet: again next frame)
      // Where grass grows a petal lies on the grass, not under it: lifted to the turf's top (by
      // the grass's own rule for how much grows on this kind of land, and a share of a blade's
      // height: life/grass.js), each to a height of its own, so they lie in among the tips.
      const hs = this.terrain.hs, cover = hs?.coverAt ? hs.coverAt(d[0], d[1], d[2]) : -1, amount = cover < 0 ? 0 : (AMOUNT[cover & 255] || 0) * (1 - 0.4 * (cover >> 16) / 255);
      const lift = this.lift[i] = amount > 0.05 ? (0.2 + 0.26 * seed[i * 4 + 3]) * (0.6 + 0.6 * amount) : 0.03, r = R + g + lift;
      this.abs[i * 3] = d[0] * r; this.abs[i * 3 + 1] = d[1] * r; this.abs[i * 3 + 2] = d[2] * r; this.put[i] = 1; this.left--;
      lie.array[i * 4] = d[0] * r - A.x; lie.array[i * 4 + 1] = d[1] * r - A.y; lie.array[i * 4 + 2] = d[2] * r - A.z; lie.array[i * 4 + 3] = 1; changed = true;
    }
    // Once all lie, a few a frame are set again on the ground as it is drawn now: finer ground
    // comes in as one walks up to a tree, and a petal kept where it lies (it is no longer put
    // down afresh at every making of the lists) would stay on the coarser ground's height.
    for (let c = 0, scanned = 0; this.left === 0 && c < PER_FRAME && scanned < LYING; scanned++) {
      const i = this.again; this.again = (this.again + 1) % LYING;
      if (!this.put[i]) continue;
      c++;
      const x = this.abs[i * 3], y = this.abs[i * 3 + 1], z = this.abs[i * 3 + 2], l = Math.hypot(x, y, z);
      d[0] = x / l; d[1] = y / l; d[2] = z / l;
      const g = this.terrain.drawnHeight(d, Math.hypot(x - P.x, y - P.y, z - P.z));
      if (g == null) continue;
      const r = R + g + this.lift[i];
      if (Math.abs(r - l) < 0.002) continue;
      this.abs[i * 3] = d[0] * r; this.abs[i * 3 + 1] = d[1] * r; this.abs[i * 3 + 2] = d[2] * r;
      lie.array[i * 4] = d[0] * r - A.x; lie.array[i * 4 + 1] = d[1] * r - A.y; lie.array[i * 4 + 2] = d[2] * r - A.z; changed = true;
    }
    if (changed) lie.needsUpdate = true;
  }

  // The flowering trees listed again (list: from the anchor A). Each slot is given the tree it
  // should show (want): its own tree while that is listed, up to an even share; every listed
  // tree at least one; the rest to the trees with fewest. What is lying is re-measured from
  // the new anchor and stays where it lies.
  _relist(list, A, lie) {
    const LYING = this.o.lying, o = this.o;
    const k = list.length, abs = list.map((t) => [A.x + t.x, A.y + t.y, A.z + t.z]);
    const owner = new Array(SLOTS).fill(-1), has = new Array(k).fill(0), most = k ? Math.ceil(SLOTS / k) : 0;
    const same = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < 0.25;
    // (keep: a slot whose tree is still listed, up to the tree's share)
    for (let s = 0; s < SLOTS && k; s++) {
      const w = this.want[s]; if (!w) continue;
      const j = abs.findIndex((a) => same(a, w.abs));
      if (j >= 0 && has[j] < most) { owner[s] = j; has[j]++; }
    }
    // (the slots left over to the trees with fewest)
    for (let s = 0; s < SLOTS && k; s++) if (owner[s] < 0) { let j = 0; for (let m = 1; m < k; m++) if (has[m] < has[j]) j = m; owner[s] = j; has[j]++; }
    // (every listed tree at least one: a slot of the tree with the most goes to a tree with none)
    for (let guard = 0; guard < SLOTS; guard++) {
      const bare = has.indexOf(0); if (bare < 0) break;
      let rich = 0; for (let m = 1; m < k; m++) if (has[m] > has[rich]) rich = m;
      if (has[rich] < 2) break;
      const s = owner.lastIndexOf(rich); owner[s] = bare; has[rich]--; has[bare]++;
    }
    for (let s = 0; s < SLOTS; s++) {
      const j = owner[s], t = j >= 0 ? list[j] : null;
      this.want[s] = t ? { abs: abs[j], rad: Math.max(0.6, t.tall * t.wide * 0.42), tall: t.tall, fall: t.fall, colour: t.colour, lie: Math.min(1, o.lie(t)), lieColour: o.lieColour(t) } : null;
      // (a slot that keeps its tree takes the tree's news: how fast it lets go today)
      if (this.cur[s] && this.want[s] && same(this.cur[s].abs, this.want[s].abs)) this.cur[s] = this.want[s];
    }
    // every lying petal where it lies, from the new anchor
    for (let i = 0; i < LYING; i++) if (lie.array[i * 4 + 3] > 0) { lie.array[i * 4] = this.abs[i * 3] - A.x; lie.array[i * 4 + 1] = this.abs[i * 3 + 1] - A.y; lie.array[i * 4 + 2] = this.abs[i * 3 + 2] - A.z; }
    lie.needsUpdate = true; this.anchor.copy(A);
    for (let s = 0; s < SLOTS; s++) this._show(s, A);
  }

  // Every frame: a slot whose tree is to change fades its falling petals out (half a second),
  // changes tree, lays its lying petals again one by one under the new one (they stay where
  // they were until then) and fades back in.
  _slots(A, lie, dt) {
    const LYING = this.o.lying;
    const same = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < 0.25, top = this.uniforms.uPetalTop.value;
    for (let s = 0; s < SLOTS; s++) {
      const c = this.cur[s], w = this.want[s], moving = !(c === w || (c && w && same(c.abs, w.abs)));
      if (moving && (!c || this.fade[s] <= 0)) {
        this.cur[s] = w; this.fade[s] = 0; this._show(s, A);
        for (let i = s; i < LYING; i += SLOTS) { if (this.put[i]) { this.put[i] = 0; this.left++; } if (!w) lie.array[i * 4 + 3] = 0; }
        if (!w) lie.needsUpdate = true;
        this.left = 0; for (let i = 0; i < LYING; i++) if (!this.put[i] && this.feet[i % SLOTS]) this.left++;          // (to be laid: under a slot that has a tree)
      } else this.fade[s] = Math.min(1, Math.max(0, this.fade[s] + (moving ? -dt : dt) / 0.5));
      top[s].z = this.fade[s];
    }
  }

  // A slot's uniforms from the tree it shows now.
  _show(s, A) {
    const u = this.uniforms, c = this.cur[s];
    if (c) { u.uPetalTree.value[s].set(c.abs[0] - A.x, c.abs[1] - A.y, c.abs[2] - A.z, c.rad); u.uPetalTop.value[s].set(c.tall, c.fall, this.fade[s], c.lie); u.uPetalCol.value[s].set(...c.colour); u.uLieCol.value[s].set(...c.lieColour); this.feet[s] = [...c.abs, c.rad]; }
    else { u.uPetalTree.value[s].set(0, 0, 0, 0); u.uPetalTop.value[s].set(0, 0, 0, 0); this.feet[s] = null; }
  }
}

export class Petals extends Shed { constructor(trees) { super(trees); } }

// The leaves of the trees that are dropping them: off the nearest such trees themselves, in
// each tree's colour of the day, and lying under and down the wind of each, as many as the
// season's rule says lie there (thin at first, a carpet's worth when the tree is bare,
// thinning through the winter): life/season.js treeSeason's shed and down.
export class TreeLeaves extends Shed {
  constructor(trees) {
    super(trees, { list: 'shedding', falling: 480, lying: 1600, perFrame: 16, lie: (t) => t.down, lieColour: (t) => t.litter, size: [0.10, 0.06, 0.11, 0.06], spread: 1.5, downwind: 2.5, lieFar: [40, 65] });
  }
}

// Leaves kicked up: a traveller running, or flying low, through fallen leaves throws them
// up behind. A fixed pool of points in KICKS bursts; a burst is a place, a moment and the
// traveller's velocity then, and each of its leaves is one sum in the vertex shader from a
// number of its own and the burst's age: up and outward, slowed by the air, down again,
// lying where it lands until the burst is used again. Nothing is kept per leaf.
const KICKS = 12, PER_KICK = 26, KICK_LIFE = 3.2;
export class Kicked {
  constructor(trees, treeLeaves) {
    this.trees = trees; this.treeLeaves = treeLeaves; this.terrain = trees.terrain;
    const count = KICKS * PER_KICK, seed = new Float32Array(count * 4), slot = new Float32Array(count);
    for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
    for (let i = 0; i < count; i++) slot[i] = i % KICKS;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); geo.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
    this.geo = geo;
    this.uniforms = {
      ...lightingUniforms(),
      uLeafEast: trees.shared.uTreeEast, uLeafNorth: trees.shared.uTreeNorth, uLeafUp: trees.shared.uTreeUp, uLeafSeason: trees.shared.uSeason,
      uKick: { value: Array.from({ length: KICKS }, () => new THREE.Vector4(0, 0, 0, -1e9)) },      // xyz: where, from the eye (m); w: when (s, the trees' clock)
      uKickVel: { value: Array.from({ length: KICKS }, () => new THREE.Vector4()) },                 // xyz: the traveller's velocity then (m/s), w: how hard (0..1)
      uKickCol: { value: Array.from({ length: KICKS }, () => new THREE.Vector3()) },
      uLeafPx: { value: 1000 },
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, defines: atmosphereDefines(), uniforms: this.uniforms,
      vertexShader: /* glsl */`
        in vec4 aSeed; in float aSlot;
        uniform vec3 uLeafEast, uLeafNorth, uLeafUp, uLeafSeason; uniform float uLeafPx;
        uniform vec4 uKick[${KICKS}]; uniform vec4 uKickVel[${KICKS}]; uniform vec3 uKickCol[${KICKS}];
        out vec3 vRel; out vec4 vSeed; out float vSpin; out float vFade; out vec3 vCol;
        void main() {
          int s = int(aSlot); vec4 k = uKick[s], kv = uKickVel[s];
          float age = uLeafSeason.z - k.w;
          vSeed = aSeed; vCol = uKickCol[s] * (0.8 + 0.4 * aSeed.w);
          if (age < 0.0 || age > ${KICK_LIFE.toFixed(1)} || aSeed.w > kv.w + 0.25) { vRel = vec3(0.0); vSpin = 0.0; vFade = 0.0; gl_PointSize = 1.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          // thrown up and outward, and along with whoever kicked it; the air slows it at once
          float ang = aSeed.x * 6.2831853, out0 = 0.5 + 1.6 * aSeed.y, up0 = (1.4 + 2.6 * aSeed.z) * (0.5 + 0.5 * kv.w);
          float run = (1.0 - exp(-1.8 * age)) / 1.8;                    // (metres travelled a m/s of first speed)
          vec3 v0 = uLeafEast * cos(ang) * out0 + uLeafNorth * sin(ang) * out0 + (kv.xyz - uLeafUp * dot(kv.xyz, uLeafUp)) * 0.45;
          float h = up0 * run - 1.1 * age * age * (0.6 + 0.6 * aSeed.w);
          float land = step(h, 0.0);
          vec3 rel = k.xyz + v0 * run + uLeafUp * (max(h, 0.0) + 0.04)
            + (uLeafEast * sin(age * 9.0 + aSeed.x * 20.0) + uLeafNorth * cos(age * 7.0 + aSeed.y * 20.0)) * (0.12 * (1.0 - land) * min(age, 1.0));
          vRel = rel; vSpin = (1.0 - land) * age * (9.0 + 12.0 * aSeed.x) + aSeed.z * 40.0;
          vFade = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(${(KICK_LIFE - 0.9).toFixed(1)}, ${KICK_LIFE.toFixed(1)}, age));
          vec4 clip = projectionMatrix * viewMatrix * vec4(rel, 1.0);
          gl_PointSize = clamp((0.10 + 0.06 * aSeed.y) * uLeafPx / max(clip.w, 0.3), 1.5, 56.0);
          gl_Position = vFade > 0.02 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`${LIGHTING_PARS}
        in vec3 vRel; in vec4 vSeed; in float vSpin; in float vFade; in vec3 vCol;
        layout(location = 0) out vec4 fragColor;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0; float c = cos(vSpin), s = sin(vSpin);
          q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
          float thin = 0.3 + 0.7 * abs(cos(vSpin * 0.37 + vSeed.z * 6.0));
          if (q.x * q.x + (q.y / thin) * (q.y / thin) > 1.0 || fract(vSeed.w * 91.0 + gl_FragCoord.x * 0.37 + gl_FragCoord.y * 0.61) > vFade) discard;
          vec3 planetPos = uCamPlanetPos + vRel, up = normalize(planetPos);
          vec3 col = vCol * (directSun(planetPos) * nearShadow(vRel, up) * (0.4 + 0.6 * thin) + skyLight(up, up)) / PI;
          col = aerialPerspective(col, vRel);
          fragColor = vec4(col * uExposure, 1.0);
        }`,
    });
    this.mesh = new THREE.Points(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.abs = Array.from({ length: KICKS }, () => [0, 0, 0]); this.next = 0; this.since = 1; this.lastAt = -1e9; this.enabled = true; this.kicks = 0;
    this._d = [0, 0, 0];
  }

  // How much lies on the ground at a place (planet axes, m) and in what colour: under the
  // nearest trees with leaves under them (as the ground draws them: terrainMaterial's
  // [seasons] block), and the wood's own by its height. Into out: [r, g, b, amount].
  lyingAt(x, y, z, out) {
    const tr = this.trees, tl = this.treeLeaves, sh = this.terrain.shared;
    let amt = 0, r = 0.17, g = 0.1, b = 0.035;
    for (let s = 0; s < SLOTS; s++) {
      const c = tl.cur[s]; if (!c || c.lie <= 0) continue;
      const d = Math.hypot(x - c.abs[0], y - c.abs[1], z - c.abs[2]) / (1.5 * c.rad), k = c.lie * (1 - Math.min(1, Math.max(0, (d - 0.5) / 0.7)));
      if (k > amt) { amt = k; r = c.lieColour[0]; g = c.lieColour[1]; b = c.lieColour[2]; }
    }
    const hs = this.terrain.hs, len = Math.hypot(x, y, z), cover = hs?.coverAt ? hs.coverAt(x / len, y / len, z / len) : -1, cls = cover < 0 ? 0 : cover & 255;
    if ((cls >= 1 && cls <= 5) || cls === 8) {
      const ca = sh.uCanopyAlt.value, L = sh.uLitterYear.value, xl = Math.min(6.999, Math.max(0, (len - this.terrain.radius - ca.x) * ca.y)), i = Math.floor(xl), f = xl - i, w = L[i].w + (L[i + 1].w - L[i].w) * f;
      if (w > amt) { amt = w; r = L[i].x; g = L[i].y; b = L[i].z; }
    }
    out[0] = r; out[1] = g; out[2] = b; out[3] = Math.min(1, amt);
    return out;
  }

  // Every frame. rig: the camera rig; viewH: the picture's height (px); dt (s).
  update(rig, viewH, dt) {
    const tr = this.trees, u = this.uniforms, now = tr.shared.uSeason.value.z;
    u.uLeafPx.value = viewH / (2 * Math.tan(rig.fov * Math.PI / 360));
    const live = now - this.lastAt < KICK_LIFE + 0.2 && now >= this.lastAt;
    this.mesh.visible = live;
    // (a burst's place from the eye, as the eye moves)
    if (live) { const P = rig.pos; for (let s = 0; s < KICKS; s++) { const a = this.abs[s], k = u.uKick.value[s]; k.x = a[0] - P.x; k.y = a[1] - P.y; k.z = a[2] - P.z; } }
    if (!tr.def || !(tr.reach > 0)) return;
    // on foot at a run, or flying within two metres of the ground
    const onFoot = !!rig.onFoot, vel = onFoot ? rig.footVel : rig.velocity, speed = vel ? vel.length() : 0;
    const low = onFoot ? !rig.airborne : rig.mode === 'hero' && rig.agl < 2.2;
    this.since += dt || 0.016;
    if (!low || speed < 2.2 || this.since < Math.max(0.07, 0.5 / Math.max(speed, 1))) return;
    const f = onFoot && rig.feet ? rig.feet : null, P = rig.pos, len = P.length(), gx = f ? f.x : P.x * (1 - rig.agl / len), gy = f ? f.y : P.y * (1 - rig.agl / len), gz = f ? f.z : P.z * (1 - rig.agl / len);
    const ly = this.lyingAt(gx, gy, gz, this._ly || (this._ly = [0, 0, 0, 0]));
    if (ly[3] < 0.12) return;
    const s = this.next; this.next = (this.next + 1) % KICKS; this.since = 0; this.lastAt = now; this.kicks++;
    this.abs[s][0] = gx; this.abs[s][1] = gy; this.abs[s][2] = gz;
    u.uKick.value[s].set(gx - P.x, gy - P.y, gz - P.z, now);
    // (how hard: by the speed and by how much lies there; the governor's step thins a burst to a third)
    u.uKickVel.value[s].set(vel.x, vel.y, vel.z, Math.min(1, ly[3] * Math.min(1, speed / 9)) * (this.enabled ? 1 : 0.33));
    u.uKickCol.value[s].set(ly[0], ly[1], ly[2]);
    this.mesh.visible = true;
  }
}
