// The sky's field on the GPU and on the CPU (docs/briefs/clouds-weather-plan.md, "1. THE FIELD"):
// the snapshots a producer makes every SNAP_STEP seconds of game time (weather/sky/format.js,
// weather/sky/producer.js), the 'now' maps blended between the two round the clock (tWxA, tWxB,
// tWxC in SKY_UNIFORMS, read through FIELD_GLSL), and at(), cells() and strikes() for the CPU.
//
// WHAT HAPPENS EACH FRAME (update(t), between frames: nothing here draws inside the picture)
//   1. The pair of snapshot times round the clock is worked out. The worker (weather/sky/
//      skyWorker.js) is asked for the ones that are missing, one at a time and the newest first,
//      spaced max(SNAP_STEP, |rate| x RATE_LEAD) apart so a fast clock does not ask for times it
//      will have run past before they arrive.
//   2. A snapshot that has arrived is uploaded to its slot a STRIP_ROWS strip of ONE map at a
//      time: at most about 128 KB a frame on Haven (the budget is 260 KB), with texSubImage2D
//      between frames and no mip maps. (three uploads a changed texture at the draw call that
//      first uses it, in the middle of the render pass, and has the GPU build its mips there: on
//      the test phone every frame that took in a map came late. The slots are therefore raw GL
//      textures that three only ever binds - as the chunk pool's are.)
//   3. The 'now' maps are blended from the pair on the GPU, a sixteenth of the rows a frame
//      (scissored), so nothing of the blend is paid for twice and no byte is touched by the page.
//      They are blended whole while the clock runs faster than RATE_WHOLE (a sixteenth of the
//      rows would tear) and for the first maps a picture waits for.
//   4. After a jump of the clock the old maps keep showing until the new pair is there, and the
//      new values are then faded in over FADE seconds, by blending them over the old with a
//      constant factor (no second target, no read-back).
// Running backwards, a bookmark's jump, a paused clock and a clock at x3600 all simply work: a
// snapshot is a pure function of its time.
//
// IN NODE (no renderer) the 'now' maps are kept as bytes instead, blended on the CPU in the same
// strips, so that scripts/sky-model-test.mjs can count what a frame would upload and hold at()
// against the bytes the GPU would be reading.
//
// THE INTERFACE (what sky/skySystem.js calls and the readers bind; step 0's, unchanged)
//   setWorld(world, opts)  opts: null (no field: every read is clear sky) or { preset, origin,
//                          stormAt, land, wxland, maps }: weather/sky/producer.js makeProducer's.
//                          A world whose weather names `land` and `peaks` has them fetched here.
//   update(t)              at the start of a frame (between frames)
//   on                     a producer is there
//   busy                   on, and the first 'now' maps not yet there (screenshots wait)
//   at(place, t, out)      what a place has (format.js makeSkyAt); place { lat, lon, h? } or [x, y, z]
//   cells(t) · strikes(t0, t1) · anvils(t) · lenses(t)
//   textures               { A, B, C } (the 'now' maps) or null
import * as THREE from 'three';
import { SNAP_STEP, STRIPS, fieldLayout, blendByte, checkSnapshot, makeSkyAt, makeSnapshot } from '../weather/sky/format.js';
import { makeProducer } from '../weather/sky/producer.js';
import { readWxLand } from '../weather/sky/land.js';
import { ListClock } from '../weather/sky/listClock.js';
import { SKY_UNIFORMS } from './skyGlsl.js';
import { makePassMaterial, fullscreenGeometry } from '../render/fullscreen.js';

export const SLOTS = 3;             // snapshots held at once (the pair round the clock, and one spare)
export const STRIP_ROWS = 32;       // rows of one map uploaded in a frame
export const RATE_LEAD = 0.5;       // s of game time a snapshot is asked ahead per x of the clock's rate
export const RATE_WHOLE = 60;       // above this rate the 'now' maps are blended whole every frame
export const FADE = 2;              // s of real time over which a new field fades in after a jump
export const JUMP = 2.5 * SNAP_STEP; // s of game time between frames that counts as a jump

const CLEAR = makeSkyAt();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class SkyField {
  constructor(renderer = null) {
    this.renderer = renderer;
    this.producer = null; this.layout = null; this.id = 0; this.opts = null;
    this.worker = null; this.asking = null;
    this.slots = [];                 // { t, snap, rows: [A, B, C] uploaded so far, ready, slot: its texture }
    this.held = [];                  // the time of the snapshot each slot's textures were last written with
    this.textures = null;            // the 'now' maps (what the shaders read)
    this.strip = 0;                  // which sixteenth of the rows is blended next
    this.uploaded = false;           // the first 'now' maps are there
    this.pair = null;                // [t0, t1, f] the 'now' maps hold
    this.fade = 1;                   // how much of the new field is faded in (1: all of it)
    this.lastT = null; this.lastWall = 0; this.rate = 1;
    this.bytesThisFrame = 0;         // what the last update() uploaded (the cost test reads it)
    this.loading = false;            // the land's file is on its way
    this._rt = null; this._mat = null; this._cpu = null;
  }

  // ---- the world ----------------------------------------------------------------------------

  setWorld(world, opts) {
    this.id++;
    this.producer = null; this.opts = null; this.slots = []; this.held = []; this.asking = null; this._listsOf = null;
    this.uploaded = false; this.strip = 0; this.pair = null; this.fade = 1;
    this.lastT = null; this.bytesThisFrame = 0; this.loading = false;
    SKY_UNIFORMS.uSkyLow.value[3] = 0;
    for (const k of ['tWxA', 'tWxB', 'tWxC']) SKY_UNIFORMS[k].value = null;
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    if (!opts || !world) return;
    this.layout = fieldLayout(world);
    const po = {
      preset: opts.preset || null, weather: world.weather || {}, radius: world.radius, dayHours: world.dayHours || 24,
      origin: opts.origin || world.scene?.start, layout: this.layout, stormAt: opts.stormAt || null,
      land: opts.land || null, wxland: opts.wxland || null, maps: opts.maps || null,
    };
    this.opts = po;
    this._make(po);
    // The land the model works the weather out over: its own file where the world names one (the
    // model works the same planes out from the elevation map when there is none, which costs a
    // second of the worker's time at start-up).
    const w = world.weather || {};
    // (only the world's own weather needs it: a test pattern has no land in it)
    if ((!po.preset || po.preset === 'model') && !po.wxland && w.land && typeof fetch === 'function' && typeof document !== 'undefined') {
      this.loading = true;
      const id = this.id, base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '';
      Promise.all([
        fetch(base + w.land).then((r) => r.arrayBuffer()),
        w.peaks ? fetch(base + w.peaks).then((r) => r.json()).catch(() => null) : Promise.resolve(null),
      ]).then(([buf, peaks]) => {
        if (this.id !== id) return;
        po.wxland = readWxLand(new Uint8Array(buf), peaks && peaks.peaks);
        this.loading = false;
        this.slots = []; this.uploaded = false; this.strip = 0; this.pair = null;
        SKY_UNIFORMS.uSkyLow.value[3] = 0;
        this._make(po);
      }).catch(() => { this.loading = false; });
    }
    // A world of a day's maps (Earth: fromMaps.js): its three grey maps and its storms, decoded as
    // weather.js decodes them (the red of each pixel, longitude -180 at the left, latitude 90 at
    // the top). Until they are here the field is the clear sky, and busy.
    if ((w.recipe ?? 'made') === 'maps' && !po.maps && typeof document !== 'undefined' && typeof Image !== 'undefined') {
      this.loading = true;
      const id = this.id, base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '';
      const grey = (url) => (url ? new Promise((ok) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height).data, out = new Uint8Array(img.width * img.height);
          for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
          ok({ data: out, w: img.width, h: img.height });
        };
        img.onerror = () => ok(null);
        img.src = base + url;
      }) : Promise.resolve(null));
      Promise.all([
        grey(w.rain), grey(w.tops), grey(w.cloud),
        w.storms ? fetch(base + w.storms).then((r) => r.json()).then((j) => j.storms || []).catch(() => []) : Promise.resolve([]),
      ]).then(([rain, tops, cloud, storms]) => {
        if (this.id !== id) return;
        po.maps = {};
        if (rain) po.maps.rain = rain;
        if (tops) po.maps.tops = tops;
        if (cloud) po.maps.cloud = cloud;
        po.storms = storms;
        this.loading = false;
        this.slots = []; this.uploaded = false; this.strip = 0; this.pair = null;
        SKY_UNIFORMS.uSkyLow.value[3] = 0;
        this._make(po);
      });
    }
  }

  // the producer here (at(), cells(), strikes()) and its twin in the worker (the snapshots)
  _make(po) {
    this.producer = makeProducer(po);
    this._maps();
    // (a question put to a worker that is ended here is never answered: the new one is asked again.
    // Forgetting this left the model's field waiting for ever once the land's file arrived)
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    this.asking = null;
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('../weather/sky/skyWorker.js', import.meta.url), { type: 'module' });
      const id = this.id, gen = this.gen = (this.gen || 0) + 1;
      this.worker.onmessage = (ev) => {
        const m = ev.data;
        // (and never from a worker since replaced: an Earth made before its maps came answers clear sky)
        if (m.id !== this.id || m.id !== id || gen !== this.gen) return;
        this.asking = null;
        this._take(m.t, checkSnapshot(m.s));
      };
      // (a worker that cannot start: the snapshots are made here, as in Node; never a picture waiting for ever)
      this.worker.onerror = () => { if (this.id !== id) return; this.worker?.terminate(); this.worker = null; this.asking = null; };
      this.worker.postMessage({ kind: 'init', id, opts: this._postable(po) });
    } catch { this.worker = null; }
  }
  // the options as plain data a worker can be handed (the land's planes copied, not shared)
  _postable(po) {
    const copy = (o) => (o ? { ...o, data: o.data ? o.data.slice() : o.data } : o);
    const wx = po.wxland ? { ...po.wxland } : null;
    if (wx) for (const k of ['g', 'hC', 'hS', 'gmin', 'land', 'coast', 'gE', 'gN']) if (wx[k]) wx[k] = wx[k].slice();
    return { ...po, land: copy(po.land), wxland: wx };
  }

  get on() { return !!this.producer; }
  get busy() { return (!!this.producer && !this.uploaded) || this.loading; }

  // ---- the maps on the GPU --------------------------------------------------------------------

  _maps() {
    const { width: W, height: H, cWidth: CW, cHeight: CH } = this.layout;
    if (this.textures && this._size === W) return;
    this._free();
    this._size = W;
    const r = this.renderer;
    if (!r) {
      // Node: the 'now' maps as bytes, blended in the same strips (the tests read them), with
      // three's own textures over them so that every reader finds what it finds on the page
      this._cpu = { A: new Uint8Array(W * H * 4), B: new Uint8Array(W * H * 4), C: new Uint8Array(CW * CH * 2) };
      const make = (data, w, h, format) => {
        const t = new THREE.DataTexture(data, w, h, format, THREE.UnsignedByteType);
        t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = false; t.unpackAlignment = 1;
        t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace;
        return t;
      };
      this.textures = { A: make(this._cpu.A, W, H, THREE.RGBAFormat), B: make(this._cpu.B, W, H, THREE.RGBAFormat), C: make(this._cpu.C, CW, CH, THREE.RGFormat) };
      return;
    }
    const target = (w, h, format) => {
      const t = new THREE.WebGLRenderTarget(w, h, {
        format, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
        wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, colorSpace: THREE.NoColorSpace,
      });
      t.texture.flipY = false;
      return t;
    };
    this._rt = { A: target(W, H, THREE.RGBAFormat), B: target(W, H, THREE.RGBAFormat), C: target(CW, CH, THREE.RGFormat) };
    this.textures = { A: this._rt.A.texture, B: this._rt.B.texture, C: this._rt.C.texture };
    // the slots: raw GL textures three only binds (never uploads to)
    const gl = r.getContext();
    this._gl = gl;
    const make = (w, h, internal) => {
      const t = gl.createTexture();
      r.state.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this._tex = [];
    for (let k = 0; k < SLOTS; k++) {
      this._tex.push({
        A: make(W, H, gl.RGBA8), B: make(W, H, gl.RGBA8), C: make(CW, CH, gl.RG8),
        ex: null,
      });
      const s = this._tex[k];
      s.ex = { A: new THREE.ExternalTexture(s.A), B: new THREE.ExternalTexture(s.B), C: new THREE.ExternalTexture(s.C) };
      for (const t of Object.values(s.ex)) { t.flipY = false; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.NearestFilter; }
    }
    r.state.unbindTexture();
    this._mat = makePassMaterial(/* glsl */`
      uniform sampler2D t0, t1;
      uniform float uF;
      in vec2 vUv;
      layout(location = 0) out vec4 fragColor;
      void main() { fragColor = mix(texture(t0, vUv), texture(t1, vUv), uF); }`,
    { t0: { value: null }, t1: { value: null }, uF: { value: 0 } });
    this._quad = new THREE.Mesh(fullscreenGeometry, this._mat);
    this._quad.frustumCulled = false;
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  _free() {
    if (this._rt) for (const t of Object.values(this._rt)) t.dispose();
    if (this._gl && this._tex) for (const s of this._tex) { for (const k of ['A', 'B', 'C']) this._gl.deleteTexture(s[k]); for (const t of Object.values(s.ex)) t.dispose(); }
    this._rt = null; this._tex = null; this.textures = null; this._cpu = null;
    this._mat?.dispose(); this._mat = null;
  }

  // ---- the snapshots ---------------------------------------------------------------------------

  // the slot of a time, if it is there
  _slot(t) { return this.slots.find((s) => s.t === t) || null; }
  // Keep it, newest first, and let go the one farthest in time from it (the pair round the clock
  // is the newcomer and its neighbour: running forwards the oldest goes, backwards the newest).
  // A snapshot KEEPS THE TEXTURE it was uploaded to for as long as it is held: `slot` is the
  // index of a free one, given once. (It was the snapshot's position in the list, numbered again
  // at every arrival: the second snapshot of the first pair took the first one's number and was
  // uploaded over it, and the first was then read from a texture nothing had been written to. The
  // maps the game drew were f x the newer snapshot, f the clock's place between the two: no low
  // cloud at all at the start of every two minutes, bases at half their height in the middle.)
  _take(t, snap) {
    if (this._slot(t)) return;
    const { width: W, height: H } = this.layout;
    if (snap.width !== W || snap.height !== H) return;        // (a snapshot of a world since left)
    const s = { t, snap, rows: [0, 0, 0], ready: !this.renderer, slot: -1 };
    while (this.slots.length >= SLOTS) {
      let far = 0;
      for (let k = 1; k < this.slots.length; k++) if (Math.abs(this.slots[k].t - t) > Math.abs(this.slots[far].t - t)) far = k;
      this.slots.splice(far, 1);
    }
    s.slot = this._freeSlot();
    this.slots.push(s);
    this.slots.sort((a, b) => b.t - a.t);
  }
  // the index of a texture no held snapshot is in
  _freeSlot() {
    for (let k = 0; k < SLOTS; k++) if (!this.slots.some((q) => q.slot === k)) return k;
    return 0;
  }
  // ask the worker for a time (one at a time; made here when there is no worker, as in Node)
  _ask(t) {
    if (this._slot(t) || this.asking === t) return;
    if (!this.worker) { this._take(t, checkSnapshot(this.producer.snapshot(t))); return; }
    if (this.asking != null) return;
    this.asking = t;
    this.worker.postMessage({ kind: 'snap', id: this.id, t });
  }

  // How far apart the snapshots are asked for: wider while the clock runs fast, so that one is
  // still useful when it arrives.
  _step() {
    const r = Math.abs(this.rate);
    return Math.max(SNAP_STEP, Math.round(r * RATE_LEAD / SNAP_STEP) * SNAP_STEP);
  }

  // ---- the frame -------------------------------------------------------------------------------

  update(t) {
    this.bytesThisFrame = 0;
    if (!this.producer) return;
    // the clock's rate, measured here (the field is handed only the time)
    const wall = now();
    if (this.lastT != null && wall > this.lastWall) {
      const dt = (wall - this.lastWall) / 1000;
      if (dt > 0.002) this.rate = 0.6 * this.rate + 0.4 * Math.abs(t - this.lastT) / dt;
    }
    // a jump is a clock that has moved far more than its own rate would move it: at x600 the game
    // clock runs 20 s a frame at 30 frames a second, and that is not a jump
    const dtWall = this.lastT != null ? Math.max(0.004, (wall - this.lastWall) / 1000) : 0;
    const jumped = this.lastT != null && Math.abs(t - this.lastT) > Math.max(JUMP, 3 * this.rate * dtWall);
    this.lastT = t; this.lastWall = wall;
    const step = this._step();
    const k = Math.floor(t / step), t0 = k * step, t1 = t0 + step;
    const f = (t - t0) / step;
    // the pair round the clock, the newer one first (running backwards asks for the other side)
    this._ask(t0); this._ask(t1);
    const s0 = this._slot(t0), s1 = this._slot(t1);
    if (jumped && (!s0 || !s1 || !s0.ready || !s1.ready)) this.fade = 0;      // (the old field keeps showing)
    this._upload();
    if (!s0 || !s0.ready || !s1 || !s1.ready) return;
    const whole = !this.uploaded || this.rate > RATE_WHOLE || this.fade < 1;
    this._blend(s0, s1, f, whole);
    this.pair = [t0, t1, f];
    if (this.fade < 1) this.fade = Math.min(1, this.fade + (wall - (this._fadeWall || wall)) / (FADE * 1000) + 1e-3);
    this._fadeWall = wall;
  }

  // One strip of one map of one slot (the plan's budget: at most 260 KB a frame). The FIRST
  // snapshot goes up whole: nothing is on screen from the field until it is there, a picture
  // waits for it, and a strip a frame would be five minutes of a headless browser's frames.
  _upload() {
    const s = this.slots.find((q) => !q.ready);
    if (!s) return;
    if (!this.uploaded) { while (!s.ready) this._strip(s); return; }
    this._strip(s);
  }
  _strip(s) {
    const { width: W, height: H, cWidth: CW, cHeight: CH } = this.layout;
    const maps = [['A', W, H, 4], ['B', W, H, 4], ['C', CW, CH, 2]];
    for (let m = 0; m < maps.length; m++) {
      const [key, w, h, ch] = maps[m];
      if (s.rows[m] >= h) continue;
      const row0 = s.rows[m], rows = Math.min(STRIP_ROWS, h - row0);
      this.held[s.slot] = s.t;                 // (what this texture holds: scripts/sky-slots-test.mjs)
      if (this.renderer) {
        const gl = this._gl, st = this.renderer.state;
        st.bindTexture(gl.TEXTURE_2D, this._tex[s.slot][key]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row0, w, rows, ch === 4 ? gl.RGBA : gl.RG, gl.UNSIGNED_BYTE, s.snap[key], row0 * w * ch);
        st.unbindTexture();
      }
      s.rows[m] = row0 + rows;
      this.bytesThisFrame += rows * w * ch;
      break;                                   // one map's strip a frame
    }
    if (s.rows[0] >= H && s.rows[1] >= H && s.rows[2] >= CH) s.ready = true;
  }

  // the 'now' maps: mix(slot 0, slot 1, f), a sixteenth of the rows a frame or all of them
  _blend(s0, s1, f, whole) {
    const { width: W, height: H, cWidth: CW, cHeight: CH } = this.layout;
    if (!this.renderer) {
      // Node: the same blend on the bytes, in the same strips
      const n = whole ? STRIPS : 1;
      for (let q = 0; q < n; q++) {
        const st = this.strip;
        const r0 = Math.floor(st * H / STRIPS), r1 = Math.floor((st + 1) * H / STRIPS);
        const c0 = Math.floor(st * CH / STRIPS), c1 = Math.floor((st + 1) * CH / STRIPS);
        blendRows(this._cpu.A, s0.snap.A, s1.snap.A, f, r0 * W * 4, r1 * W * 4);
        blendRows(this._cpu.B, s0.snap.B, s1.snap.B, f, r0 * W * 4, r1 * W * 4);
        blendRows(this._cpu.C, s0.snap.C, s1.snap.C, f, c0 * CW * 2, c1 * CW * 2);
        this.strip = (st + 1) % STRIPS;
        if (this.strip === 0) this._shown();
      }
      return;
    }
    const r = this.renderer, mat = this._mat, a = this._tex[s0.slot], b = this._tex[s1.slot];
    const fade = this.fade < 1 ? Math.max(0.03, this.fade) : 1;
    mat.uniforms.uF.value = f;
    if (fade < 1) {
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.ConstantAlphaFactor; mat.blendDst = THREE.OneMinusConstantAlphaFactor;
      mat.blendSrcAlpha = THREE.ConstantAlphaFactor; mat.blendDstAlpha = THREE.OneMinusConstantAlphaFactor;
      mat.blendAlpha = fade;
    } else if (mat.blending !== THREE.NoBlending) {
      mat.blending = THREE.NoBlending;
    }
    const maps = [['A', W, H], ['B', W, H], ['C', CW, CH]];
    const n = whole ? STRIPS : 1;
    for (let q = 0; q < n; q++) {
      const st = this.strip;
      for (const [key, w, h] of maps) {
        const r0 = Math.floor(st * h / STRIPS), r1 = Math.floor((st + 1) * h / STRIPS);
        if (r1 <= r0) continue;
        mat.uniforms.t0.value = a.ex[key]; mat.uniforms.t1.value = b.ex[key];
        r.setRenderTarget(this._rt[key]);
        r.setScissorTest(true);
        r.setScissor(0, r0, w, r1 - r0);
        if (fade >= 1) r.clear(true, false, false);     // (the strip alone: the scissor holds)
        r.render(this._quad, this._cam);
        r.setScissorTest(false);
      }
      this.strip = (st + 1) % STRIPS;
      if (this.strip === 0) this._shown();
    }
    r.setRenderTarget(null);
  }
  // the maps hold a whole field now: let the readers have them
  _shown() {
    if (this.textures) {
      SKY_UNIFORMS.tWxA.value = this.textures.A; SKY_UNIFORMS.tWxB.value = this.textures.B; SKY_UNIFORMS.tWxC.value = this.textures.C;
    }
    SKY_UNIFORMS.uSkyLow.value[3] = 1;
    this.uploaded = true;
  }

  // ---- what a place has ------------------------------------------------------------------------

  at(place, t, out = makeSkyAt()) { return this.producer ? this.producer.at(place, t, out) : Object.assign(out, CLEAR, { field: { ...CLEAR.field } }); }
  // (the cells and the anvils every frame from moments two seconds apart, by the producer of the
  // moment: listClock.js)
  _lists() {
    const p = this.producer;
    if (this._listsOf !== p) { this._listsOf = p; this._cells = new ListClock((t) => p.cells(t)); this._anvils = p.anvils ? new ListClock((t) => p.anvils(t)) : null; }
  }
  cells(t) { if (!this.producer) return []; this._lists(); return this._cells.at(t); }
  strikes(t0, t1) { return this.producer ? this.producer.strikes(t0, t1) : []; }
  anvils(t) { if (!this.producer?.anvils) return []; this._lists(); return this._anvils.at(t); }
  lenses(t) { return this.producer?.lenses ? this.producer.lenses(t) : []; }
  systems(t) { return this.producer?.systems ? this.producer.systems(t) : []; }
  // The 'now' bytes (Node only: what the GPU's maps hold), and the snapshots by their time: what
  // scripts/sky-system-test.mjs and scripts/sky-model-test.mjs read of the inside.
  get nowBytes() { return this._cpu; }
  get now() { return this._cpu; }
  get snaps() { const m = new Map(); for (const s of this.slots) m.set(s.t, s.snap); return m; }
  // a snapshot of the 'now' maps as a snapshot record, so format.js's fieldAt can read them
  nowSnapshot() {
    if (!this._cpu || !this.pair) return null;
    const s = makeSnapshot(this.layout, this.pair[2] * 0 + this.pair[0]);
    s.A = this._cpu.A; s.B = this._cpu.B; s.C = this._cpu.C;
    return s;
  }

  dispose() { this.worker?.terminate(); this.worker = null; this._free(); }
}

// out[i] = the blend of a[i] and b[i] (b null: a alone) for i in [i0, i1)
function blendRows(out, a, b, f, i0, i1) {
  if (!b || f <= 0) { out.set(a.subarray(i0, i1), i0); return; }
  for (let i = i0; i < i1; i++) out[i] = blendByte(a[i], b[i], f);
}
