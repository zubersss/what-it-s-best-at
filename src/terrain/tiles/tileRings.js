// Map tiles round the traveller. A world may list `terrain.tiles`: services of 256-pixel
// Web Mercator tiles (elevation, pictures such as the land's colour). This keeps a few
// square mosaics of them centred on the traveller (a "ring" each: fine and small, coarse
// and wide), asks the tile worker for a new one when the traveller nears a ring's edge,
// and hands each to its user when it arrives:
//   onElevation(slot, raster | null)   raster: { data: Int16Array, width, height, zoom, tx, ty }
//   onPicture(name, picture | null)    picture: { data: Uint8Array RGBA, mips: [Uint8Array], width, zoom, tx, ty }
// Nothing here is needed for the game to run: without the services (no connection, a
// world with no tiles) the bundled maps are all there is.
//
// World file:  terrain.tiles = {
//   elevation: { url, rings: [{ zoom, below }, ...] },        coarsest first; below: only while the traveller is lower than this (m)
//   pictures: { colour: { url, zoom, below }, ... } }
const TILE = 256, N = 4;                 // a ring is N x N tiles
const MARGIN = 1.0;                      // the traveller stays this many tiles from a ring's edge

export class TileRings {
  constructor(handlers) {
    this.handlers = handlers;
    this.worker = null; this.rings = []; this.nextId = 1; this.world = null;
    this.ext = (typeof globalThis !== 'undefined' && globalThis.__EXT) || '';        // the test mirror
    this.failures = 0;
  }

  setWorld(world) {
    // (whatever was on its way belongs to the old world)
    for (const r of this.rings) { r.id = 0; if (r.have) this._give(r, null); }
    this.rings = []; this.world = world;
    const t = world.terrain?.tiles;
    if (!t || typeof Worker === 'undefined') return;
    if (!this.worker) {
      this.worker = new Worker(new URL('./tileWorker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev) => this._onMessage(ev.data);
      this.worker.onerror = (e) => { console.warn('tile worker failed', e.message); };
    }
    const base = typeof document !== 'undefined' ? document.baseURI : '';
    (t.elevation?.rings || []).forEach((r, slot) => this.rings.push({ key: 'elevation' + slot, kind: 'elevation', slot, url: t.elevation.url, zoom: r.zoom, below: r.below ?? 1e12,
      // (rivers and lakes worked out from the elevation, if the world asks for them)
      hydrology: t.hydrology ? { rain: new URL(t.hydrology.rain, base).href, water: t.hydrology.water ? new URL(t.hydrology.water, base).href : null, minFlow: r.minFlow ?? 1 } : null }));
    for (const [name, p] of Object.entries(t.pictures || {})) this.rings.push({ key: 'picture:' + name, kind: 'picture', name, url: p.url, zoom: p.zoom, below: p.below ?? 1e12,
      cover: p.cover ? { ...p.cover, palette: new URL(p.cover.palette, base).href } : null });
    for (const r of this.rings) { r.tx = null; r.ty = null; r.have = false; r.id = 0; r.retryAt = 0; r.fails = 0; }
  }

  // True while a mosaic that is wanted has not arrived (and has not failed).
  get busy() { for (const r of this.rings) if (r.id) return true; return false; }
  // ... of the elevation only (the heights the ground is built from).
  get busyElevation() { for (const r of this.rings) if (r.id && r.kind === 'elevation') return true; return false; }
  // True while elevation is on its way for a place that has none yet (the start, a jump,
  // the end of a fast trip), and for five seconds at most: fine ground waits for it.
  get catchingUp() { if (performance.now() - (this.freshAt || 0) > 5000) return false; for (const r of this.rings) if (r.id && r.fresh && r.kind === 'elevation') return true; return false; }

  // Every frame. pos: the traveller in the world's own axes (metres from its centre);
  // altitude above the datum (m).
  update(pos, altitude) {
    if (!this.rings.length) return;
    const len = Math.hypot(pos.x, pos.y, pos.z) || 1, now = performance.now();
    // (speed from the last frame's place: smoothed, and no jump counts as speed)
    const l = this._last || (this._last = { x: pos.x, y: pos.y, z: pos.z, t: now, v: 0 });
    const dt = (now - l.t) / 1000, step = Math.hypot(pos.x - l.x, pos.y - l.y, pos.z - l.z);
    if (dt > 0.001) { const v = step / dt; l.v = step > 0.2 * len ? 0 : l.v + (v - l.v) * Math.min(1, dt * 3); l.x = pos.x; l.y = pos.y; l.z = pos.z; l.t = now; }
    const speed = l.v;
    const lat = Math.asin(Math.max(-1, Math.min(1, pos.z / len))), lon = Math.atan2(pos.y, pos.x);
    const mercY = Math.log(Math.tan(Math.PI / 4 + Math.max(-1.48, Math.min(1.48, lat)) / 2));
    for (const r of this.rings) {
      if (altitude > r.below || r.id || now < r.retryAt) continue;
      const n = 2 ** r.zoom;
      const fx = ((lon / (2 * Math.PI) + 0.5) % 1 + 1) % 1 * n, fy = (1 - mercY / Math.PI) / 2 * n;
      // (going too fast for this ring: it would be behind before it arrived)
      const tileM = 2 * Math.PI * len / n * Math.cos(lat);
      if (speed * 6 > tileM) continue;
      let ok = r.tx != null, off = !ok;
      if (ok) {
        let dx = fx - r.tx; dx -= n * Math.floor(dx / n);
        const lowY = r.ty <= 0, highY = r.ty >= n - N;        // (at the map's top and bottom rows there is no further to go)
        ok = dx >= MARGIN && dx <= N - MARGIN && (lowY || fy - r.ty >= MARGIN) && (highY || fy - r.ty <= N - MARGIN);
        off = dx > N || fy < r.ty || fy > r.ty + N;           // (the traveller is outside this mosaic altogether: a jump)
      }
      if (ok) continue;
      // (asked for because the place has none yet, not because the traveller neared its edge)
      r.fresh = off; if (off && r.kind === 'elevation') this.freshAt = now;
      const tx = Math.round(fx - N / 2), ty = Math.max(0, Math.min(n - N, Math.round(fy - N / 2)));
      if (n < N) continue;
      r.id = this.nextId++; r.wantTx = tx; r.wantTy = ty;
      this.worker.postMessage({ type: 'want', id: r.id, key: r.key, url: r.url, kind: r.kind, zoom: r.zoom, tx, ty, n: N, ext: this.ext, hydrology: r.hydrology, cover: r.cover });
    }
  }

  _onMessage(m) {
    const r = this.rings.find((q) => q.key === m.key && q.id === m.id);
    if (!r) return;                                      // an old world's, or overtaken
    r.id = 0;
    if (m.type === 'failed') {
      r.fails++; this.failures++; r.retryAt = performance.now() + Math.min(60000, 4000 * 2 ** (r.fails - 1));
      if (r.fails === 1) console.warn(`map tiles (${r.key}): ${m.reason}`);
      return;
    }
    r.fails = 0; r.tx = m.tx; r.ty = m.ty; r.have = true;
    const W = m.n * TILE;
    if (r.kind === 'elevation') {
      const w = m.water; r.info = w ? w.info : null;
      if (r.hydrology) {
        // Rivers come into a mosaic where the coarser one says they cross its edge. One worked
        // out before the coarser was ready (it waits 8 s, then goes without) is asked for again,
        // once: finer ones when this arrives with water, this one if a coarser has come since.
        const inflow = !!(w && w.info.inflow), el = (q) => q.kind === 'elevation' && q.have && q.info;
        if (w) for (const f of this.rings) if (el(f) && f.zoom > r.zoom && !f.id && !f.info.inflow && !f.redone) { f.redone = true; f.tx = null; }
        if (inflow) r.redone = false;
        else if (w && !r.redone && this.rings.some((q) => q !== r && el(q) && q.zoom < r.zoom)) { r.redone = true; r.tx = null; }
      }
      this._give(r, { data: new Int16Array(m.buffer), width: W, height: W, zoom: m.zoom, tx: m.tx, ty: m.ty,
        water: w ? { segs: new Float32Array(w.segs), gridStart: new Int32Array(w.gridStart), gridItems: new Int32Array(w.gridItems), lake: w.lake ? new Uint16Array(w.lake) : null } : null });
    }
    else this._give(r, { data: new Uint8Array(m.buffer), mips: m.mips.map((b) => new Uint8Array(b)), width: W, zoom: m.zoom, tx: m.tx, ty: m.ty,
      cover: m.cover ? { cls: new Uint8Array(m.cover.cls), tall: new Uint8Array(m.cover.tall), closed: new Uint8Array(m.cover.closed) } : null });
  }

  _give(r, what) {
    if (!what) r.have = false;
    if (r.kind === 'elevation') this.handlers.onElevation?.(r.slot, what); else this.handlers.onPicture?.(r.name, what);
  }
}

// The box a mosaic covers: degrees, longitude from -180 (it may run past 180).
export function mosaicBox(zoom, tx, ty, tiles = N) {
  const n = 2 ** zoom, latOf = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  return { lon0: tx / n * 360 - 180, lon1: (tx + tiles) / n * 360 - 180, lat0: latOf(ty), lat1: latOf(ty + tiles) };
}
