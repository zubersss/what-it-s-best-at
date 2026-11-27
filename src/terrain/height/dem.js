// Elevation raster sampling: simple-cylindrical int16 grids, cubic B-spline interpolation
// (C2-smooth, so lighting has no facets even when one raster pixel spans kilometres).

const RAD2DEG = 180 / Math.PI;
const TOP_CELL = 2;      // degrees per cell of the "tallest ground nearby" grid
// How many numbers a stretch of river is (tiles/hydrology.js, packWater, writes them): its
// two ends (pixels), the water's level, half width and depth at each end, then the speed of
// its flow in mid stream at each end (m/s) and the way it runs there (radians from east,
// turning toward north). A stretch runs from its first end down to its second.
export const RIVER_STRIDE = 14;
// A ring that brings water only answers for the places at least this many pixels inside its
// mosaic; outside that box the coarser ring answers. (The tile worker makes the rivers of
// both meet on the box's edge: tiles/hydrology.js, "joined to the coarser mosaic".)
export const RING_INSET = 20;
// The far ground's share of river (cover, below): a ring's wider grid lists every stretch
// within this many pixels of a cell (packWater).
export const RIVER_REACH = 4;
// A beach. The map's ground within BEACH metres above and below the sea's level, flattened
// toward it: to `beach` of its height at the very shore (0..1; 1: as the map has it), easing
// back to the map's own at BEACH. up: metres above the sea's level in the map. One rule for
// the ground (layers.js, sea) and for the mosaics a made world's rivers are worked out on
// (tiles/madeTiles.js): a river must come down to the shore the walker stands on.
export const BEACH = 7;
export function shoreUp(up, beach) { const a = up < 0 ? -up : up; if (beach >= 1 || a >= BEACH) return up; const t = a / BEACH; return up * (beach + (1 - beach) * t * t * (3 - 2 * t)); }
// How fast a river runs across its width: fastest in the middle, slow at its banks.
// u: 0 in mid stream .. 1 at the water's edge.
export function flowAcross(u) { const k = 1 - u * u; return 0.3 + 0.7 * (k > 0 ? k : 0); }

export class DemSet {
  // rasters: [{ data:Int16Array, width, height, lon0, lon1, lat0, lat1, wrap, feather, scale }]
  // scale = metres per unit of the stored numbers (1 when absent).
  constructor(rasters, radius) {
    this.radius = radius;
    this.rasters = rasters.map((r) => ({
      ...r,
      scale: r.scale || 1,
      ppdX: r.width / (r.lon1 - r.lon0),
      ppdY: r.height / (r.lat0 - r.lat1),
      res: (Math.PI / 180) * radius * (r.lon1 - r.lon0) / r.width,   // metres per pixel at the equator
    }));
    // Rings: mosaics of map tiles round the traveller that arrive and move while the game
    // runs (terrain/tiles). They lie over the fixed rasters, finest last, each with a
    // feathered edge. Web Mercator: columns even in longitude, rows in asinh(tan(latitude)).
    this.rings = [];
    // outputs of sample()
    this.h = 0; this.gE = 0; this.gN = 0; this.res = 0;
    // ... and the water there, from the finest ring that has any (see _water): a lake's
    // level (lakeL, -1e9: none); the nearest river's centre line (rivS metres away, 1e9:
    // none), its half width, level and depth, and its flow there (m/s toward east and
    // north: the one rule of how fast a river runs, for the picture and for what it carries)
    this.lakeL = -1e9; this.lakeS = 0; this.rivS = 1e9; this.rivA = 0; this.rivL = 0; this.rivD = 0; this.rivE = 0; this.rivN = 0;
    // The far ground. A patch of ground far off has texels wider than a river: asked point by
    // point, the river was there at one texel and not at the next (a string of beads). With
    // `cover` set to the half width a sample stands for (m; the patch builder sets it, nobody
    // else), sample() also answers the nearest river within reach, in its water or not: how
    // far its middle line is (covS, 1e9: none), its half width, depth and its flow in mid
    // stream (m/s east and north). The builder works out the share of the sample that is river.
    this.cover = 0; this.covS = 1e9; this.covA = 0; this.covD = 0; this.covE = 0; this.covN = 0;
    this._h = 0; this._gx = 0; this._gy = 0;
    this.tops = null;
  }

  // Prepares topAt(): the tallest raster height within `reach` metres of any place, on a
  // coarse grid (TOP_CELL degrees). Shadow rays use it to stop as soon as nothing ahead
  // can be in their way, wherever on the planet they start.
  buildTops(reach) {
    const W = Math.round(360 / TOP_CELL), H = Math.round(180 / TOP_CELL), raw = new Float32Array(W * H).fill(-1e9);
    for (const r of this.rasters) {
      const col = new Int32Array(r.width);
      for (let i = 0; i < r.width; i++) { const lon = r.lon0 + (i + 0.5) / r.ppdX; col[i] = Math.min(W - 1, Math.floor((((lon % 360) + 360) % 360) / TOP_CELL)); }
      for (let j = 0; j < r.height; j++) {
        const o = Math.min(H - 1, Math.max(0, Math.floor((90 - (r.lat0 - (j + 0.5) / r.ppdY)) / TOP_CELL))) * W, row = j * r.width;
        for (let i = 0; i < r.width; i++) { const v = r.data[row + i] * r.scale; if (v > raw[o + col[i]]) raw[o + col[i]] = v; }
      }
    }
    // widen by the reach (plus one cell: a ray can start anywhere inside its cell)
    this._reach = reach;
    const reachDeg = reach / (this.radius * Math.PI / 180) + TOP_CELL, dj = Math.ceil(reachDeg / TOP_CELL);
    const tops = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      const latEdge = Math.min(89.9, Math.max(Math.abs(90 - j * TOP_CELL), Math.abs(90 - (j + 1) * TOP_CELL)) + reachDeg);
      const di = Math.min(W >> 1, Math.ceil(reachDeg / Math.cos(latEdge / RAD2DEG) / TOP_CELL));
      for (let i = 0; i < W; i++) {
        let m = -1e9;
        for (let b = Math.max(0, j - dj); b <= Math.min(H - 1, j + dj); b++) {
          for (let a = i - di; a <= i + di; a++) { const v = raw[b * W + ((a % W) + W) % W]; if (v > m) m = v; }
        }
        tops[j * W + i] = m;
      }
    }
    this.tops = tops; this.topsW = W; this.topsH = H;
  }

  // Unit direction -> the tallest raster height (m) anywhere within the reach given to buildTops().
  topAt(x, y, z) {
    const lat = Math.asin(z < -1 ? -1 : z > 1 ? 1 : z) * RAD2DEG;
    let lon = Math.atan2(y, x) * RAD2DEG; if (lon < 0) lon += 360;
    const j = Math.min(this.topsH - 1, Math.max(0, Math.floor((90 - lat) / TOP_CELL))), i = Math.min(this.topsW - 1, Math.floor(lon / TOP_CELL));
    let top = this.tops[j * this.topsW + i];
    // (a ring's own tallest ground counts wherever the ring, widened by the reach, is)
    for (let k = 0; k < this.rings.length; k++) {
      const r = this.rings[k];
      if (!r || r.max <= top) continue;
      let l = lon - (r.lon0 - r.reachLon); l -= 360 * Math.floor(l / 360);
      if (l < r.lon1 - r.lon0 + 2 * r.reachLon && lat < r.lat0 + r.reachLat && lat > r.lat1 - r.reachLat) top = r.max;
    }
    return top;
  }

  // Puts a ring in place (or takes it away: raster = null). slot: 0 = coarsest.
  // raster: { data: Int16Array, width, height, zoom, tx, ty } (tx, ty: the tile column and
  // row of its top-left corner at that zoom; 256-pixel tiles), heights in metres.
  setRing(slot, raster) {
    if (!raster) { this.rings[slot] = null; return; }
    const n = 2 ** raster.zoom, k = 256 * n / (2 * Math.PI);          // pixels per radian of longitude
    const latOf = (ty) => Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * RAD2DEG;
    const lat0 = latOf(raster.ty), lat1 = latOf(raster.ty + raster.height / 256), mid = (lat0 + lat1) / 2;
    let max = -1e9; const d = raster.data; for (let i = 0; i < d.length; i++) if (d[i] > max) max = d[i];
    const reachDeg = (this._reach || 150000) / (this.radius * Math.PI / 180);
    // (waterOnly: a made world's ring. Its ground is the world's own maps and layers at any
    // fineness; the ring brings the rivers and the lakes' levels and nothing else.)
    this.rings[slot] = {
      ...raster, k, lat0, lat1, water: raster.water || null, waterOnly: !!raster.waterOnly,
      lon0: raster.tx / n * 360 - 180, lon1: (raster.tx + raster.width / 256) / n * 360 - 180,       // (tile column 0 starts at longitude -180; a ring may cross longitude 0 or 180)
      my0: Math.PI * (1 - 2 * raster.ty / n),
      feather: raster.feather || 40,                                    // pixels
      res: 2 * Math.PI * this.radius / (256 * n) * Math.cos(mid / RAD2DEG),
      logRes: Math.log(2 * Math.PI * this.radius / (256 * n) * Math.cos(mid / RAD2DEG)),
      max: max + 60, reachLat: reachDeg, reachLon: reachDeg / Math.max(0.1, Math.cos((Math.abs(mid) + reachDeg) / RAD2DEG)),
    };
  }

  // A ring's height and slopes at a place inside it; returns its weight (0: outside).
  _ring(r, lon, lat) {
    if (lat >= r.lat0 || lat <= r.lat1) return 0;
    let l = lon - r.lon0; l -= 360 * Math.floor(l / 360);
    const x = l / RAD2DEG * r.k - 0.5;
    const w = r.width, hgt = r.height;
    if (x < 0.5 || x > w - 1.5) return 0;
    const phi = lat / RAD2DEG, sp = Math.sin(phi);
    const y = (r.my0 - 0.5 * Math.log((1 + sp) / (1 - sp))) * r.k - 0.5;
    if (y < 0.5 || y > hgt - 1.5) return 0;
    const e = Math.min(x - 0.5, w - 1.5 - x, y - 0.5, hgt - 1.5 - y) / r.feather;
    const wgt = e >= 1 ? 1 : e * e * (3 - 2 * e);
    if (wgt <= 0) return 0;
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy, d = r.data;
    const tx2 = tx * tx, tx3 = tx2 * tx, ty2 = ty * ty, ty3 = ty2 * ty, ux = 1 - tx, uy = 1 - ty;
    const wx0 = ux * ux * ux / 6, wx1 = (3 * tx3 - 6 * tx2 + 4) / 6, wx2 = (-3 * tx3 + 3 * tx2 + 3 * tx + 1) / 6, wx3 = tx3 / 6;
    const wy0 = uy * uy * uy / 6, wy1 = (3 * ty3 - 6 * ty2 + 4) / 6, wy2 = (-3 * ty3 + 3 * ty2 + 3 * ty + 1) / 6, wy3 = ty3 / 6;
    const dx0 = -ux * ux / 2, dx1 = (3 * tx2 - 4 * tx) / 2, dx2 = (-3 * tx2 + 2 * tx + 1) / 2, dx3 = tx2 / 2;
    const dy0 = -uy * uy / 2, dy1 = (3 * ty2 - 4 * ty) / 2, dy2 = (-3 * ty2 + 2 * ty + 1) / 2, dy3 = ty2 / 2;
    const c0 = ix - 1 < 0 ? 0 : ix - 1, c1 = ix, c2 = ix + 1, c3 = ix + 2 >= w ? w - 1 : ix + 2;
    let h = 0, gx = 0, gy = 0;
    for (let q = 0; q < 4; q++) {
      let row = iy - 1 + q; row = row < 0 ? 0 : row >= hgt ? hgt - 1 : row;
      const o = row * w, a = d[o + c0], b = d[o + c1], c = d[o + c2], f = d[o + c3];
      const rowH = a * wx0 + b * wx1 + c * wx2 + f * wx3, rowD = a * dx0 + b * dx1 + c * dx2 + f * dx3;
      const wy = q === 0 ? wy0 : q === 1 ? wy1 : q === 2 ? wy2 : wy3, dy = q === 0 ? dy0 : q === 1 ? dy1 : q === 2 ? dy2 : dy3;
      h += rowH * wy; gx += rowD * wy; gy += rowH * dy;
    }
    const cosLat = Math.max(0.02, Math.cos(phi));
    this._h = h;
    if (r.water && wgt > 0.5 && !this._wet) this._water(r, x + 0.5, y + 0.5, cosLat);
    this._gx = gx * r.k / (this.radius * cosLat);          // dh/d(east), m/m
    this._gy = -gy * r.k / (this.radius * cosLat);         // dh/d(north): a row is k / cos(latitude) pixels per radian
    return wgt;
  }

  // The water of a ring that brings water only, at a place inside it (well inside: the
  // outermost pixels are left to the coarser ring, as a blended ring's feathered edge is).
  _ringWater(r, lon, lat) {
    if (lat >= r.lat0 || lat <= r.lat1) return;
    let l = lon - r.lon0; l -= 360 * Math.floor(l / 360);
    const x = l / RAD2DEG * r.k - 0.5, w = r.width, hgt = r.height;
    if (x < RING_INSET - 0.5 || x > w - RING_INSET - 0.5) return;
    const phi = lat / RAD2DEG, sp = Math.sin(phi);
    const y = (r.my0 - 0.5 * Math.log((1 + sp) / (1 - sp))) * r.k - 0.5;
    if (y < RING_INSET - 0.5 || y > hgt - RING_INSET - 0.5) return;
    this._water(r, x + 0.5, y + 0.5, Math.max(0.02, Math.cos(phi)));
  }

  _bicubic(r, lon, lat) {
    const x = (lon - r.lon0) * r.ppdX - 0.5, y = (r.lat0 - lat) * r.ppdY - 0.5;
    const ix = Math.floor(x), iy = Math.floor(y);
    const tx = x - ix, ty = y - iy;
    const w = r.width, hgt = r.height, d = r.data;
    const tx2 = tx * tx, tx3 = tx2 * tx, ty2 = ty * ty, ty3 = ty2 * ty;
    const ux = 1 - tx, uy = 1 - ty;
    const wx0 = ux * ux * ux / 6, wx1 = (3 * tx3 - 6 * tx2 + 4) / 6, wx2 = (-3 * tx3 + 3 * tx2 + 3 * tx + 1) / 6, wx3 = tx3 / 6;
    const wy0 = uy * uy * uy / 6, wy1 = (3 * ty3 - 6 * ty2 + 4) / 6, wy2 = (-3 * ty3 + 3 * ty2 + 3 * ty + 1) / 6, wy3 = ty3 / 6;
    const dx0 = -ux * ux / 2, dx1 = (3 * tx2 - 4 * tx) / 2, dx2 = (-3 * tx2 + 2 * tx + 1) / 2, dx3 = tx2 / 2;
    const dy0 = -uy * uy / 2, dy1 = (3 * ty2 - 4 * ty) / 2, dy2 = (-3 * ty2 + 2 * ty + 1) / 2, dy3 = ty2 / 2;
    let c0, c1, c2, c3;
    if (r.wrap) { c0 = ((ix - 1) % w + w) % w; c1 = (ix % w + w) % w; c2 = ((ix + 1) % w + w) % w; c3 = ((ix + 2) % w + w) % w; }
    else { c0 = ix - 1 < 0 ? 0 : ix - 1 >= w ? w - 1 : ix - 1; c1 = ix < 0 ? 0 : ix >= w ? w - 1 : ix; c2 = ix + 1 < 0 ? 0 : ix + 1 >= w ? w - 1 : ix + 1; c3 = ix + 2 < 0 ? 0 : ix + 2 >= w ? w - 1 : ix + 2; }
    let h = 0, gx = 0, gy = 0;
    for (let k = 0; k < 4; k++) {
      let row = iy - 1 + k; row = row < 0 ? 0 : row >= hgt ? hgt - 1 : row;
      const o = row * w;
      const a = d[o + c0], b = d[o + c1], c = d[o + c2], e = d[o + c3];
      const rowH = a * wx0 + b * wx1 + c * wx2 + e * wx3;
      const rowD = a * dx0 + b * dx1 + c * dx2 + e * dx3;
      const wy = k === 0 ? wy0 : k === 1 ? wy1 : k === 2 ? wy2 : wy3;
      const dy = k === 0 ? dy0 : k === 1 ? dy1 : k === 2 ? dy2 : dy3;
      h += rowH * wy; gx += rowD * wy; gy += rowH * dy;
    }
    this._h = h * r.scale;
    const cosLat = Math.max(0.02, Math.cos(lat / RAD2DEG));
    this._gx = gx * r.scale * r.ppdX * RAD2DEG / (this.radius * cosLat);    // dh/d(east), m/m
    this._gy = -gy * r.scale * r.ppdY * RAD2DEG / this.radius;              // dh/d(north), m/m
  }

  // Unit direction -> this.h (m), this.gE / this.gN (slope east / north), this.res (m per pixel).
  // Later rasters win inside their bounds; their feathered edge blends with what is below.
  sample(x, y, z) {
    const lat = Math.asin(z < -1 ? -1 : z > 1 ? 1 : z) * RAD2DEG;
    let lon = Math.atan2(y, x) * RAD2DEG; if (lon < 0) lon += 360;
    this._wet = false; this.lakeL = -1e9; this.lakeS = 0; this.rivS = 1e9; this.rivE = 0; this.rivN = 0; this.covS = 1e9;
    // The rings first, finest first. Each lies on what is under it by its weight; `acc` is
    // how much of the answer is still to come from below.
    let acc = 1, rh = 0, re = 0, rn = 0, rres = 0;
    for (let i = this.rings.length - 1; i >= 0 && acc > 0; i--) {
      const r = this.rings[i];
      if (!r) continue;
      if (r.waterOnly) { if (r.water && !this._wet) this._ringWater(r, lon, lat); continue; }
      const w = this._ring(r, lon, lat);
      if (w <= 0) continue;
      const a = acc * w;
      rh += this._h * a; re += this._gx * a; rn += this._gy * a; rres += r.logRes * a;
      acc -= a;
    }
    if (acc <= 0) { this.h = rh; this.gE = re; this.gN = rn; this.res = Math.exp(rres); return; }
    if (acc < 1) {
      this._fixed(lon, lat);
      this.h = rh + this.h * acc; this.gE = re + this.gE * acc; this.gN = rn + this.gN * acc; this.res = Math.exp(rres + Math.log(Math.max(1e-3, this.res)) * acc);
      return;
    }
    this._fixed(lon, lat);
  }

  // The water a ring knows of at a place (px, py: its pixel coordinates): see the fields.
  _water(r, px, py, cosLat) {
    const w = r.water, W = r.width;
    this._wet = true;                                       // (the finest ring answers; coarser ones are not asked)
    if (w.lake) {
      // (from the four cells round the place, not the nearest one: lakeS is the share of them
      // that are this lake's, eased from a half to all, so that its water and its shore end
      // nowhere at a pixel's edge. A lake has one level in all its cells: see hydrology.js)
      const qx = px < 0.5 ? 0 : px > W - 1.5 ? W - 1.5 : px - 0.5, qy = py < 0.5 ? 0 : py > W - 1.5 ? W - 1.5 : py - 0.5;
      const ix = Math.min(W - 2, Math.floor(qx)), iy = Math.min(W - 2, Math.floor(qy)), tx = qx - ix, ty = qy - iy, o = iy * W + ix, lk = w.lake;
      const v0 = lk[o], v1 = lk[o + 1], v2 = lk[o + W], v3 = lk[o + W + 1];
      if (v0 | v1 | v2 | v3) {
        const w0 = (1 - tx) * (1 - ty), w1 = tx * (1 - ty), w2 = (1 - tx) * ty, w3 = tx * ty;
        let n = 0, lv = 0;
        for (let q = 0; q < 4; q++) {
          const v = q === 0 ? v0 : q === 1 ? v1 : q === 2 ? v2 : v3; if (!v || v === lv) continue;
          const k = (v0 === v ? w0 : 0) + (v1 === v ? w1 : 0) + (v2 === v ? w2 : 0) + (v3 === v ? w3 : 0);
          if (k > n) { n = k; lv = v; }
        }
        if (n > 0.5) { const t = n >= 1 ? 1 : (n - 0.5) * 2; this.lakeS = t * t * (3 - 2 * t); this.lakeL = lv / 4 - 500; }
      }
    }
    const G = W >> 3, c = (py >> 3) * G + (px >> 3), s = w.segs, m = 2 * Math.PI * this.radius * cosLat / (r.k * 2 * Math.PI);      // metres per pixel here
    let best = 1e9, bo = -1, bt = 0;
    for (let q = w.gridStart[c], e = w.gridStart[c + 1]; q < e; q++) {
      const o = w.gridItems[q] * RIVER_STRIDE, ax = s[o], ay = s[o + 1], bx = s[o + 2] - ax, by = s[o + 3] - ay;
      let t = ((px - ax) * bx + (py - ay) * by) / (bx * bx + by * by || 1); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - ax - bx * t, dy = py - ay - by * t, half = s[o + 6] + (s[o + 7] - s[o + 6]) * t;
      // (nearest by how far outside its own water the place is: a wide river wins over a brook beside it)
      const d = Math.sqrt(dx * dx + dy * dy) * m, score = d - half;
      if (score < best) { best = score; bo = o; bt = t; this.rivS = d; this.rivA = half; this.rivL = s[o + 4] + (s[o + 5] - s[o + 4]) * t; this.rivD = s[o + 8] + (s[o + 9] - s[o + 8]) * t; }
    }
    // The flow of the stretch that won: its speed in mid stream between its ends', slowed
    // toward the bank; its way between its ends' ways (the shorter way round), so that the
    // flow turns through a bend and does not jump at each joint of the line.
    if (bo >= 0 && this.rivS < this.rivA) {
      let da = s[bo + 13] - s[bo + 12]; da -= 6.283185307179586 * Math.round(da / 6.283185307179586);
      const ang = s[bo + 12] + da * bt, v = (s[bo + 10] + (s[bo + 11] - s[bo + 10]) * bt) * flowAcross(this.rivS / this.rivA);
      this.rivE = Math.cos(ang) * v; this.rivN = Math.sin(ang) * v;
    } else { this.rivE = 0; this.rivN = 0; }
    if (this.cover > 0 && w.wideStart) {
      let bestC = 1e9, co = -1, ct = 0;
      for (let q = w.wideStart[c], e = w.wideStart[c + 1]; q < e; q++) {
        const o = w.wideItems[q] * RIVER_STRIDE, ax = s[o], ay = s[o + 1], bx = s[o + 2] - ax, by = s[o + 3] - ay;
        // (a listed stretch stands for the one after it too: twice its length)
        let t = ((px - ax) * bx + (py - ay) * by) / (bx * bx + by * by || 1); t = t < 0 ? 0 : t > 2 ? 2 : t;
        const dx = px - ax - bx * t, dy = py - ay - by * t, d = Math.sqrt(dx * dx + dy * dy) * m, half = s[o + 6], score = d - half;
        if (score < bestC) { bestC = score; co = o; ct = t > 1 ? 1 : t; this.covS = d; this.covA = half; }
      }
      if (co >= 0) {
        let da = s[co + 13] - s[co + 12]; da -= 6.283185307179586 * Math.round(da / 6.283185307179586);
        const ang = s[co + 12] + da * ct, v = s[co + 10] + (s[co + 11] - s[co + 10]) * ct;
        this.covD = s[co + 8]; this.covE = Math.cos(ang) * v; this.covN = Math.sin(ang) * v;
      }
    }
  }

  // The fixed rasters alone (the bundled maps).
  _fixed(lon, lat) {
    const rs = this.rasters;
    let topW = 0, topH = 0, topE = 0, topN = 0, topRes = 0;
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      let wgt = 1;
      if (!r.wrap) {
        if (lon <= r.lon0 || lon >= r.lon1 || lat >= r.lat0 || lat <= r.lat1) continue;
        const f = r.feather || 0.25;
        const cosLat = Math.max(0.05, Math.cos(lat / RAD2DEG));
        const e = Math.min((lon - r.lon0) * cosLat, (r.lon1 - lon) * cosLat, r.lat0 - lat, lat - r.lat1) / f;
        wgt = e >= 1 ? 1 : e * e * (3 - 2 * e);
        if (wgt <= 0) continue;
      }
      this._bicubic(r, lon, lat);
      if (topW <= 0) {
        if (wgt >= 1) { this.h = this._h; this.gE = this._gx; this.gN = this._gy; this.res = r.res; return; }
        topW = wgt; topH = this._h; topE = this._gx; topN = this._gy; topRes = r.res;
      } else {
        // base under a feathered raster
        const w = topW;
        this.h = this._h + (topH - this._h) * w; this.gE = this._gx + (topE - this._gx) * w; this.gN = this._gy + (topN - this._gy) * w;
        this.res = r.res * Math.pow(topRes / r.res, w);
        return;
      }
    }
    this.h = topH; this.gE = topE; this.gN = topN; this.res = topRes || 1e12;
  }
}
