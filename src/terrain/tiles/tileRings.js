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
    this.worker.postMessage({ type: 'reset' });
    // A made world (terrain.tiles.made: its lakes, its land rule): the worker makes its
    // mosaics by rule from the world's own bundled elevation instead of asking a service.
    const md = t.made ? { key: world.id, radius: world.radius, seed: t.made.seed ?? 0, land: t.made.land || null,
      dem: { ...world.terrain.dems[0], url: new URL(world.terrain.dems[0].url, base).href },
      lakes: t.made.lakes ? new URL(t.made.lakes, base).href : null, levels: t.made.levels ? new URL(t.made.levels, base).href : null,
      rain: t.hydrology?.rain ? new URL(t.hydrology.rain, base).href : null } : null;
    this.made = md;
    (t.elevation?.rings || []).forEach((r, slot) => this.rings.push({ key: 'elevation' + slot, kind: 'elevation', slot, url: t.elevation.url, zoom: r.zoom, below: r.below ?? 1e12,
      // (rivers and lakes worked out from the elevation, if the world asks for them)
      hydrology: t.hydrology ? { rain: new URL(t.hydrology.rain, base).href, water: t.hydrology.water ? new URL(t.hydrology.water, base).href : null, minFlow: r.minFlow ?? 1 } : null }));
    // (zooms: a picture may be asked for coarser and wider the higher the traveller is, see update)
    for (const [name, p] of Object.entries(t.pictures || {})) this.rings.push({ key: 'picture:' + name, kind: 'picture', name, url: p.url, zoom: p.zoom, below: p.below ?? 1e12, zooms: p.zooms || null,
      cover: p.cover && p.cover.palette ? { ...p.cover, palette: new URL(p.cover.palette, base).href } : null });
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
  // altitude above the datum (m); vel: its velocity (m/s, same axes; optional); dest: where a
  // hands-off trip ends (same axes; optional).
  // Looking ahead: a new mosaic is centred up to half a tile ahead of the traveller along its
  // way, and asked for when the place twelve seconds ahead nears the edge. And a trip's
  // destination gets its mosaics while the traveller is still on the way (too high or too
  // fast to use them where it is, or outside them): the fine ground is there on arrival.
  update(pos, altitude, vel, dest) {
    if (!this.rings.length) return;
    const len = Math.hypot(pos.x, pos.y, pos.z) || 1, now = performance.now();
    // (speed from the last frame's place: smoothed, and no jump counts as speed)
    const l = this._last || (this._last = { x: pos.x, y: pos.y, z: pos.z, t: now, v: 0 });
    const dt = (now - l.t) / 1000, step = Math.hypot(pos.x - l.x, pos.y - l.y, pos.z - l.z);
    if (dt > 0.001) { const v = step / dt; l.v = step > 0.2 * len ? 0 : l.v + (v - l.v) * Math.min(1, dt * 3); l.x = pos.x; l.y = pos.y; l.z = pos.z; l.t = now; }
    const speed = l.v;
    const lat = Math.asin(Math.max(-1, Math.min(1, pos.z / len))), lon = Math.atan2(pos.y, pos.x);
    const mercY = Math.log(Math.tan(Math.PI / 4 + Math.max(-1.48, Math.min(1.48, lat)) / 2));
    // a place as fractions of the world map (x: 0..1 eastward from -180, y: 0..1 southward in Mercator)
    const frac = (x, y, z) => { const L = Math.hypot(x, y, z) || 1, la = Math.asin(Math.max(-1, Math.min(1, z / L))); return [((Math.atan2(y, x) / (2 * Math.PI) + 0.5) % 1 + 1) % 1, (1 - Math.log(Math.tan(Math.PI / 4 + Math.max(-1.48, Math.min(1.48, la)) / 2)) / Math.PI) / 2]; };
    const lead = vel && speed > 5 ? frac(pos.x + vel.x * 12, pos.y + vel.y * 12, pos.z + vel.z * 12) : null;
    const end = dest ? frac(dest.x, dest.y, dest.z) : null;
    const inside = (r, n, x, y, m) => { if (r.tx == null) return false; let dx = x * n - r.tx; dx -= n * Math.floor(dx / n); return dx >= m && dx <= N - m && y * n - r.ty >= m && y * n - r.ty <= N - m; };
    for (const r of this.rings) {
      if (r.id || now < r.retryAt) continue;
      if (r.zooms) {
        // A picture with `zooms: [[zoom, up to this height (m)], ...]` (finest first): the same
        // four tiles a side, coarser and so wider the higher the traveller is. From 400 km up
        // the land's colour was sharp in one patch 600 km wide under the traveller and a
        // blur (the globe's own map, ten kilometres a pixel) everywhere else in view.
        // (The zoom in use is kept until the height is a seventh past its range: no going
        // back and forth at a boundary. A trip's destination is asked for at the finest.)
        let z = r.zooms[r.zooms.length - 1][0];
        for (const [zz, top] of r.zooms) if (altitude <= top) { z = zz; break; }
        if (end) z = r.zooms[0][0];
        if (z !== r.zoom) {
          const cur = r.zooms.findIndex((q) => q[0] === r.zoom), lo = cur > 0 ? r.zooms[cur - 1][1] : 0, hi = cur >= 0 ? r.zooms[cur][1] : 0;
          if (end || cur < 0 || altitude < lo * 0.87 || altitude > hi * 1.15) { r.zoom = z; r.tx = null; r.ty = null; }
        }
      }
      const n = 2 ** r.zoom;
      const fx = ((lon / (2 * Math.PI) + 0.5) % 1 + 1) % 1 * n, fy = (1 - mercY / Math.PI) / 2 * n;
      if (end && n >= N) {
        // the destination's mosaic, unless this ring is in use under the traveller
        const using = altitude <= r.below && inside(r, n, fx / n, fy / n, 0);
        if (!using) {
          if (!inside(r, n, end[0], end[1], 0.75)) {
            const tx = Math.round(end[0] * n - N / 2), ty = Math.max(0, Math.min(n - N, Math.round(end[1] * n - N / 2)));
            r.fresh = false; r.id = this.nextId++; r.wantTx = tx; r.wantTy = ty;
            this.worker.postMessage({ type: 'want', id: r.id, key: r.key, url: r.url, kind: r.kind, zoom: r.zoom, tx, ty, n: N, ext: this.ext, hydrology: r.hydrology, cover: r.cover, made: this.made, radius: this.world.radius });
          }
          continue;          // (it waits there for the traveller)
        }
      }
      if (altitude > r.below) continue;
      // (going too fast for this ring: it would be behind before it arrived)
      const tileM = 2 * Math.PI * len / n * Math.cos(lat);
      if (speed * 6 > tileM) continue;
      let ok = r.tx != null, off = !ok;
      if (ok) {
        let dx = fx - r.tx; dx -= n * Math.floor(dx / n);
        const lowY = r.ty <= 0, highY = r.ty >= n - N;        // (at the map's top and bottom rows there is no further to go)
        ok = dx >= MARGIN && dx <= N - MARGIN && (lowY || fy - r.ty >= MARGIN) && (highY || fy - r.ty <= N - MARGIN);
        // (... and the place twelve seconds ahead, if it is leaving by an edge the traveller is not already beside)
        if (ok && lead) { let lx = lead[0] * n - r.tx; lx -= n * Math.floor(lx / n); const ly = lead[1] * n - r.ty; ok = lx >= MARGIN * 0.5 && lx <= N - MARGIN * 0.5 && (lowY || ly >= MARGIN * 0.5) && (highY || ly <= N - MARGIN * 0.5); }
        off = dx > N || fy < r.ty || fy > r.ty + N;           // (the traveller is outside this mosaic altogether: a jump)
      }
      if (ok) continue;
      // (asked for because the place has none yet, not because the traveller neared its edge)
      r.fresh = off; if (off && r.kind === 'elevation') this.freshAt = now;
      // (centred up to half a tile ahead along the traveller's way)
      let cx = fx, cy = fy;
      if (lead) { let ax = lead[0] * n - fx; ax -= n * Math.round(ax / n); const ay = lead[1] * n - fy, al = Math.hypot(ax, ay); if (al > 0.05) { const k = Math.min(0.5, al) / al; cx += ax * k; cy += ay * k; } }
      const tx = Math.round(cx - N / 2), ty = Math.max(0, Math.min(n - N, Math.round(cy - N / 2)));
      if (n < N) continue;
      if (r.have && r.tx === tx && r.ty === ty) continue;          // (the look ahead asks for what is already here: the traveller is too fast for this ring to lead it)
      r.id = this.nextId++; r.wantTx = tx; r.wantTy = ty;
      this.worker.postMessage({ type: 'want', id: r.id, key: r.key, url: r.url, kind: r.kind, zoom: r.zoom, tx, ty, n: N, ext: this.ext, hydrology: r.hydrology, cover: r.cover, made: this.made, radius: this.world.radius });
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
      this._give(r, { data: new Int16Array(m.buffer), width: W, height: W, zoom: m.zoom, tx: m.tx, ty: m.ty, waterOnly: !!m.waterOnly,
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
