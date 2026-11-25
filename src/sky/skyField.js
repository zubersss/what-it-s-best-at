// The sky's field on the GPU and on the CPU (docs/briefs/clouds-weather-plan.md, "THE FIELD"):
// the snapshots a producer makes every SNAP_STEP s of game time (weather/sky/format.js), the
// 'now' maps blended between the two round the clock (tWxA, tWxB, tWxC in SKY_UNIFORMS, read
// through FIELD_GLSL), and at(), cells() and strikes() for the CPU.
//
// VERSION 0 (step 0). The interface below is what sky/skySystem.js calls and the readers bind;
// package A rewrites the inside (its model in the worker, strip uploads between frames, the
// blend as a GPU pass) and keeps the interface. Here: the producer is the stub
// (sky/skyProducer.js), its snapshots made in a worker (sky/skyFieldWorker.js; at once where
// there is none, as in Node), the 'now' bytes blended on the CPU a sixteenth of the rows a
// frame and uploaded whole when all are done.
//
//   setWorld(world, opts)  opts: null (no field: every read is clear sky) or { preset, origin,
//                          stormAt, land }: sky/skyProducer.js makeProducer's
//   update(t)              at the start of a frame (between frames): snapshots asked for and
//                          taken in, a strip of 'now' blended, the maps uploaded when whole
//   on                     a producer is there
//   busy                   on, and the first 'now' maps not yet uploaded (screenshots wait)
//   at(place, t, out)      what a place has (format.js makeSkyAt); place { lat, lon, h? } or [x, y, z]
//   cells(t)               the live cells (the stub's cells(t) objects)
//   strikes(t0, t1)        the lightning in [t0, t1), in time order
//   textures               { A, B, C } (the 'now' maps) or null
import * as THREE from 'three';
import { SNAP_STEP, STRIPS, fieldLayout, blendByte, checkSnapshot, makeSkyAt } from '../weather/sky/format.js';
import { makeProducer } from './skyProducer.js';
import { SKY_UNIFORMS } from './skyGlsl.js';

const CLEAR = makeSkyAt();

export class SkyField {
  constructor(renderer = null) {
    this.renderer = renderer;
    this.producer = null; this.layout = null; this.id = 0; this.opts = null;
    this.snaps = new Map();        // tk -> snapshot (at most a few)
    this.asking = null;            // the time asked of the worker
    this.textures = null; this.now = null; this.strip = 0; this.uploaded = false; this.pair = null;
    this.worker = null;
  }

  setWorld(world, opts) {
    this.id++;
    this.snaps.clear(); this.asking = null; this.uploaded = false; this.strip = 0; this.pair = null;
    this.producer = null; this.opts = null;
    SKY_UNIFORMS.uSkyLow.value[3] = 0;
    for (const k of ['tWxA', 'tWxB', 'tWxC']) SKY_UNIFORMS[k].value = null;
    if (!opts || !world) return;
    this.layout = fieldLayout(world);
    const po = {
      preset: opts.preset || 'fair', weather: world.weather || {}, radius: world.radius, dayHours: world.dayHours || 24,
      origin: opts.origin || world.scene?.start, layout: this.layout, stormAt: opts.stormAt || null, land: opts.land || null,
    };
    this.opts = po;
    this.producer = makeProducer(po);                  // (on the page: at(), cells(), strikes())
    const { width: W, height: H, cWidth: CW, cHeight: CH } = this.layout;
    if (!this.now || this.now.A.length !== W * H * 4) {
      this.now = { A: new Uint8Array(W * H * 4), B: new Uint8Array(W * H * 4), C: new Uint8Array(CW * CH * 2) };
      if (this.textures) for (const t of Object.values(this.textures)) t.dispose();
      const make = (data, w, h, format) => {
        const t = new THREE.DataTexture(data, w, h, format, THREE.UnsignedByteType);
        t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = false; t.unpackAlignment = 1;
        t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace;
        return t;
      };
      this.textures = { A: make(this.now.A, W, H, THREE.RGBAFormat), B: make(this.now.B, W, H, THREE.RGBAFormat), C: make(this.now.C, CW, CH, THREE.RGFormat) };
    }
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./skyFieldWorker.js', import.meta.url), { type: 'module' });
        const id = this.id;
        this.worker.onmessage = (ev) => { const m = ev.data; if (m.id !== this.id || m.id !== id) return; this.asking = null; this.snaps.set(m.t, checkSnapshot(m.s)); };
        // (a worker that cannot start: the snapshots are made here, as in Node; never a picture waiting for ever)
        this.worker.onerror = () => { if (this.id !== id) return; this.worker?.terminate(); this.worker = null; this.asking = null; };
        this.worker.postMessage({ kind: 'init', id, opts: { ...po, land: po.land ? { ...po.land, data: po.land.data.slice() } : null } });
      } catch { this.worker = null; }
    }
  }

  get on() { return !!this.producer; }
  get busy() { return !!this.producer && !this.uploaded; }

  // The snapshot of tk: asked of the worker (one at a time), or made here where there is none.
  _snap(tk) {
    const s = this.snaps.get(tk);
    if (s) return s;
    if (!this.worker) { const n = checkSnapshot(this.producer.snapshot(tk)); this.snaps.set(tk, n); return n; }
    if (this.asking == null) { this.asking = tk; this.worker.postMessage({ kind: 'snap', id: this.id, t: tk }); }
    return null;
  }

  // t: the weather clock (s since weather.epoch). Between frames.
  update(t) {
    if (!this.producer) return;
    const k = Math.floor(t / SNAP_STEP), tk = k * SNAP_STEP, f = (t - tk) / SNAP_STEP;
    // (the pair round the clock first, the one before it if there is room: running backwards)
    const s0 = this._snap(tk), s1 = s0 ? this._snap(tk + SNAP_STEP) : null;
    for (const key of this.snaps.keys()) if (key < tk - SNAP_STEP || key > tk + 2 * SNAP_STEP) this.snaps.delete(key);
    if (!s0) return;
    // (the first maps only once both snapshots round the clock are in: a picture waits for them,
    // and must show what at() says)
    if (!this.uploaded && f > 0 && !s1) return;
    // 'now': a sixteenth of the rows a frame (all of them at first: a picture waits for none)
    const { width: W, height: H, cWidth: CW, cHeight: CH } = this.layout, n = this.now;
    const strips = this.uploaded ? 1 : STRIPS;
    for (let k2 = 0; k2 < strips; k2++) {
      const st = this.strip, r0 = Math.floor(st * H / STRIPS), r1 = Math.floor((st + 1) * H / STRIPS), c0 = Math.floor(st * CH / STRIPS), c1 = Math.floor((st + 1) * CH / STRIPS);
      blendRows(n.A, s0.A, s1 && s1.A, f, r0 * W * 4, r1 * W * 4);
      blendRows(n.B, s0.B, s1 && s1.B, f, r0 * W * 4, r1 * W * 4);
      blendRows(n.C, s0.C, s1 && s1.C, f, c0 * CW * 2, c1 * CW * 2);
      this.strip = (st + 1) % STRIPS;
      if (this.strip === 0) this._upload();
    }
    this.pair = [tk, s1 ? tk + SNAP_STEP : tk, s1 ? f : 0];
  }

  _upload() {
    if (this.renderer) for (const t of Object.values(this.textures)) { t.needsUpdate = true; this.renderer.initTexture(t); }
    SKY_UNIFORMS.tWxA.value = this.textures.A; SKY_UNIFORMS.tWxB.value = this.textures.B; SKY_UNIFORMS.tWxC.value = this.textures.C;
    SKY_UNIFORMS.uSkyLow.value[3] = 1;
    this.uploaded = true;
  }

  at(place, t, out = makeSkyAt()) { return this.producer ? this.producer.at(place, t, out) : Object.assign(out, CLEAR, { field: { ...CLEAR.field } }); }
  cells(t) { return this.producer ? this.producer.cells(t) : []; }
  strikes(t0, t1) { return this.producer ? this.producer.strikes(t0, t1) : []; }

  dispose() { this.worker?.terminate(); this.worker = null; if (this.textures) for (const t of Object.values(this.textures)) t.dispose(); this.textures = null; }
}

// out[i] = the blend of a[i] and b[i] (b null: a alone) for i in [i0, i1)
function blendRows(out, a, b, f, i0, i1) {
  if (!b || f <= 0) { out.set(a.subarray(i0, i1), i0); return; }
  for (let i = i0; i < i1; i++) out[i] = blendByte(a[i], b[i], f);
}
