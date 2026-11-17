// Elevation raster sampling: simple-cylindrical int16 grids, cubic B-spline interpolation
// (C2-smooth, so lighting has no facets even when one raster pixel spans kilometres).

const RAD2DEG = 180 / Math.PI;

export class DemSet {
  // rasters: [{ data:Int16Array, width, height, lon0, lon1, lat0, lat1, wrap, feather }]
  constructor(rasters, radius) {
    this.radius = radius;
    this.rasters = rasters.map((r) => ({
      ...r,
      ppdX: r.width / (r.lon1 - r.lon0),
      ppdY: r.height / (r.lat0 - r.lat1),
      res: (Math.PI / 180) * radius * (r.lon1 - r.lon0) / r.width,   // metres per pixel at the equator
    }));
    // outputs of sample()
    this.h = 0; this.gE = 0; this.gN = 0; this.res = 0;
    this._h = 0; this._gx = 0; this._gy = 0;
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
    this._h = h;
    const cosLat = Math.max(0.02, Math.cos(lat / RAD2DEG));
    this._gx = gx * r.ppdX * RAD2DEG / (this.radius * cosLat);    // dh/d(east), m/m
    this._gy = -gy * r.ppdY * RAD2DEG / this.radius;              // dh/d(north), m/m
  }

  // Unit direction -> this.h (m), this.gE / this.gN (slope east / north), this.res (m per pixel).
  // Later rasters win inside their bounds; their feathered edge blends with what is below.
  sample(x, y, z) {
    const lat = Math.asin(z < -1 ? -1 : z > 1 ? 1 : z) * RAD2DEG;
    let lon = Math.atan2(y, x) * RAD2DEG; if (lon < 0) lon += 360;
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
