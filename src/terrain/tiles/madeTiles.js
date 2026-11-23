// The mosaics of a made world (milestone 12): what a map service gives Earth, made by rule
// from the world's own bundled maps. A made world's elevation is in its bundled map at
// every fineness (the height layers add the rest), so nothing is fetched while the game
// runs; what the mosaics are for is the water (rivers and lakes worked out on them by
// tiles/hydrology.js) and what covers the land (its colour from the air, its land-cover
// class and canopy: tiles/madeLand.js).
// (Plain arrays and arithmetic: it runs in the tile worker and in Node.)
import { DemSet } from '../height/dem.js';
import { landAt, landNoise1, landNoise2, LAND_DEFAULTS } from './madeLand.js';

const TILE = 256, RAD = 180 / Math.PI;

export class MadeWorld {
  // dem: the world's bundled elevation raster ({ data: Int16Array, width, height, lon0, lon1,
  // lat0, lat1, wrap }); lakes: { ids: Uint8Array (which lake a cell belongs to, the raster's
  // own size, north first, from longitude 0), width, height, levels: [m] }; rain: Uint8Array
  // 720 x 360 (3.2 * sqrt(mm a year), from longitude -180) or null; land: the land rule's
  // numbers (madeLand.js); seed: the world's.
  constructor({ radius, dem, lakes, rain, land, seed }) {
    this.radius = radius; this.dem = new DemSet([dem], radius); this.lakes = lakes; this.rain = rain; this.seed = seed ?? 0;
    this.land = { ...LAND_DEFAULTS, ...(land || {}), colours: { ...LAND_DEFAULTS.colours, ...((land && land.colours) || {}) } };
  }

  // The level of the lake at a place (m), or null. lon: degrees east, 0..360.
  lakeAt(lon, lat) {
    const L = this.lakes; if (!L) return null;
    const j = Math.min(L.height - 1, Math.max(0, Math.floor((90 - lat) / 180 * L.height))), i = Math.min(L.width - 1, Math.floor(lon / 360 * L.width));
    const id = L.ids[j * L.width + i];
    return id ? L.levels[id - 1] : null;
  }

  // The year's rain at a place (mm), between the map's cells.
  rainAt(lon, lat) {
    const r = this.rain; if (!r) return 800;
    const fy = Math.min(358.999, Math.max(0, (90 - lat) * 2 - 0.5)), fx = (((lon + 180) % 360) * 2 - 0.5 + 720) % 720;
    const y0 = Math.floor(fy), x0 = Math.floor(fx), ty = fy - y0, tx = fx - x0, x1 = (x0 + 1) % 720, y1 = Math.min(359, y0 + 1);
    const v = ((r[y0 * 720 + x0] * (1 - tx) + r[y0 * 720 + x1] * tx) * (1 - ty) + (r[y1 * 720 + x0] * (1 - tx) + r[y1 * 720 + x1] * tx) * ty) / 3.2;
    return v * v;
  }

  // Where a mosaic's pixels are: lonOf(x) (degrees east, 0..360), latOf(y) (degrees).
  grid(zoom, tx, ty) {
    const n = 2 ** zoom;
    return {
      lonOf: (x) => ((((tx + (x + 0.5) / TILE) / n * 360 - 180) % 360) + 360) % 360,
      latOf: (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + (y + 0.5) / TILE) / n))) * RAD,
    };
  }

  // An elevation mosaic: Float32Array W x W of metres (the bundled map, between its cells),
  // for the hydrology. Lake beds are in it as they lie.
  elevation(zoom, tx, ty, tiles) {
    const W = tiles * TILE, out = new Float32Array(W * W), g = this.grid(zoom, tx, ty), d = this.dem;
    const lons = new Float64Array(W); for (let x = 0; x < W; x++) lons[x] = g.lonOf(x);
    for (let y = 0; y < W; y++) { const lat = g.latOf(y); for (let x = 0; x < W; x++) { d._fixed(lons[x], lat); out[y * W + x] = d.h; } }
    return out;
  }

  // A picture mosaic: the land's colour from the air (RGBA bytes; the fourth: the canopy as
  // a whole, height x how closed, 0.2 m a step, as the ground shader reads it) and what
  // grows there ({ cls, tall (0.25 m a step), closed (0..255) } a byte a pixel each).
  picture(zoom, tx, ty, tiles) {
    const W = tiles * TILE, rgba = new Uint8Array(W * W * 4), cls = new Uint8Array(W * W), tall = new Uint8Array(W * W), closed = new Uint8Array(W * W);
    const g = this.grid(zoom, tx, ty), d = this.dem, L = this.land, o = {}, seed = this.seed;
    const lons = new Float64Array(W), cx = new Float64Array(W), sx = new Float64Array(W);
    for (let x = 0; x < W; x++) { lons[x] = g.lonOf(x); cx[x] = Math.cos(lons[x] / RAD); sx[x] = Math.sin(lons[x] / RAD); }
    const b8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
    for (let y = 0; y < W; y++) {
      const lat = g.latOf(y), cl = Math.cos(lat / RAD), sl = Math.sin(lat / RAD);
      for (let x = 0; x < W; x++) {
        d._fixed(lons[x], lat);
        const h = d.h, slope = h > 0 ? Math.hypot(d.gE, d.gN) : 0, px = cl * cx[x], py = cl * sx[x];
        const lv = this.lakeAt(lons[x], lat), lake = lv != null && h < lv;
        landAt(L, h, slope, lat, this.rainAt(lons[x], lat), landNoise1(px, py, sl, seed), landNoise2(px, py, sl, seed), o, lake, lake ? lv - h : 0);
        const q = y * W + x, q4 = q * 4;
        rgba[q4] = b8(o.r); rgba[q4 + 1] = b8(o.g); rgba[q4 + 2] = b8(o.b); rgba[q4 + 3] = b8(o.tall * o.closed * 5);
        cls[q] = o.cls; tall[q] = b8(o.tall * 4); closed[q] = b8(o.closed * 255);
      }
    }
    return { rgba, cover: { cls, tall, closed } };
  }
}
