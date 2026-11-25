// A world whose weather is one real day's maps: Earth (docs/briefs/clouds-weather-plan.md,
// "EARTH"). One static snapshot of the field (format.js) is made from the maps of 8 September
// 2017 - the cloud map's cover, the cloud-top map's middle and high layers, the rain map's rain -
// and the storms of that day's list become cells, so Earth's thunderstorms have towers, rain
// shafts, anvils and deterministic lightning like Haven's.
//
// Its ground wind is the belts and the storm vortices that src/weather/weather.js had (the trades,
// the westerlies, and each hurricane's own whirl), moved here so that one writer answers for
// every world: scripts/sky-model-test.mjs holds it against weather.js's own numbers.
//
// The maps are greyscale bytes, handed in as plain arrays (the page decodes them; a script reads
// them with scripts/lib/earthMaps.mjs), each { data, w, h } with longitude -180 at the left edge
// and latitude 90 at the top:
//   rain   mm/h = 2^(byte / 60) - 1          (the same encoding as the snapshot's own rain)
//   tops   m = byte / 16 * 1000              (the cloud tops)
//   cloud  cover = byte / 255
// storms: [{ name, lat, lon, wind (m/s), rmw (m) }] (data/earth_storms.json's `storms`).
//
// Nothing here moves with the clock: the day is fixed. The cloud still drifts, because the noise
// the heaps are carved from goes with the steering (steer.js), which the world file sets to a
// plain westerly.
//
// Pure: no three, no DOM, no Math.random.
import { SNAP_STEP, fieldLayout, makeSnapshot, putA, putB, putC, fieldAt, footprint, uvOfLatLon, makeSkyAt, CELL, CELL_KIND, cellLife, makeCellLife } from './format.js';
import { Steer } from './steer.js';
import { dirOf, latOf, lonOf, angleBetween } from './land.js';
import { cellGeometry, cellFootprint, cellRain } from './cellShape.js';
import { strikesIn } from './strikes.js';

export const EARTH_DEFAULTS = Object.freeze({
  base: 1400,            // m above the sea: the low cloud's base (the world file's clouds.volume.base)
  thick: [400, 1800],    // m: the sheet's thickness, by the cover
  heapFrom: 0.22,        // the cover under which the map's cloud is drawn as heaps ...
  sheetFrom: 0.55,       // ... and over which as a sheet
  midTops: [4000, 7000], // m: tops between these are the mid layer ...
  highTops: 7000,        // ... and above this the high layer
  cellRain: 3.5,         // mm/h: a cell where the rain is over this and the tops over highTops
  cellTop: 7000,
  cellRadius: [4000, 9000], cellApart: 220000, cellMax: 8,
  belts: [[-7, 15, 10], [10, 45, 12], [-4, 75, 10]],   // [m/s, at this latitude, this wide]
  trade: 2,              // m/s toward the equator in the trades
  stormReach: 700000, stormFade: [450000, 250000], stormMix: 0.34, stormIn: 0.3, stormFall: 0.62, stormRise: 1.6,
  wet: 0.6,              // how wet the ground is where it rains hard
});

const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// A greyscale map's value at a place (0..255), smooth between its pixels: weather.js's sample().
export function sampleGrey(m, lat, lon) {
  if (!m) return 0;
  const x = (((lon + 180) / 360) % 1 + 1) % 1 * m.w - 0.5, y = Math.min(m.h - 1.001, Math.max(0, (90 - lat) / 180 * m.h - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, xa = ((x0 % m.w) + m.w) % m.w, xb = (x0 + 1) % m.w, d = m.data;
  return (d[y0 * m.w + xa] * (1 - fx) + d[y0 * m.w + xb] * fx) * (1 - fy) + (d[(y0 + 1) * m.w + xa] * (1 - fx) + d[(y0 + 1) * m.w + xb] * fx) * fy;
}
// mm/h and m, as weather.js reads them
export const rainOfByte = (v) => Math.pow(2, v / 60) - 1;
export const earthRainAt = (maps, lat, lon) => rainOfByte(sampleGrey(maps.rain, lat, lon));
export const earthTopAt = (maps, lat, lon) => sampleGrey(maps.tops, lat, lon) / 16 * 1000;
export const earthCoverAt = (maps, lat, lon) => sampleGrey(maps.cloud, lat, lon) / 255;

// The ground wind: the planet's belts, and round each storm its own whirl. [east, north] m/s.
// (weather.js's windAt, with its numbers in EARTH_DEFAULTS; one writer for every reader.)
export function earthWindAt(cfg, storms, lat, lon, out = [0, 0]) {
  const a = Math.abs(lat), g = (c, w) => Math.exp(-((a - c) / w) * ((a - c) / w));
  let u = 0;
  for (const [amp, at, wide] of cfg.belts) u += amp * g(at, wide);
  let v = -Math.sign(lat) * cfg.trade * g(cfg.belts[0][1], cfg.belts[0][2]);
  for (const s of storms) {
    const dy = (lat - s.lat) * 111200, dx = (((lon - s.lon + 540) % 360) - 180) * 111200 * Math.cos(lat * DEG), r = Math.hypot(dx, dy);
    if (r > cfg.stormReach) continue;
    const rm = s.rmw ?? 38000, vmax = s.wind ?? 20;
    const sp = (r < rm ? vmax * Math.pow(r / rm, cfg.stormRise) : vmax * Math.pow(rm / r, cfg.stormFall)) * (1 - clamp((r - cfg.stormFade[0]) / cfg.stormFade[1], 0, 1));
    const turn = s.lat >= 0 ? 1 : -1, k = r > 1 ? 1 / r : 0;
    const tx = -dy * k * turn, ty = dx * k * turn, inx = -dx * k, iny = -dy * k, mix = r < rm ? 0 : cfg.stormMix;
    u += sp * (tx * (1 - mix * cfg.stormIn) + inx * mix); v += sp * (ty * (1 - mix * cfg.stormIn) + iny * mix);
  }
  out[0] = u; out[1] = v;
  return out;
}

// opts: as producer.js's makeProducer (weather, radius, layout, maps, storms, base).
export function createEarthSky(opts = {}) {
  const W0 = opts.weather || {};
  const cfg = { ...EARTH_DEFAULTS, ...(W0.maps || {}) };
  const R = opts.radius || 6371000;
  const layout = opts.layout || fieldLayout({ weather: { ...W0, field: { width: W0.field?.width || 2048 } } });
  const { width: W, height: H, cWidth: CW, cHeight: CH } = layout;
  const steer = new Steer(W0, R);
  const maps = opts.maps || {};
  const storms = (opts.storms || maps.storms || []).filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon));
  const base0 = opts.base ?? cfg.base;
  const lonOfMap = (lon) => (lon > 180 ? lon - 360 : lon);
  const ready = !!(maps.cloud || maps.rain || maps.tops);

  // ---- the one snapshot ------------------------------------------------------------------------

  function texelAB(i, j, A, B) {
    const lat = 90 - (j + 0.5) * 180 / H, lon = lonOfMap((i + 0.5) * 360 / W), k = j * W + i;
    const cover = earthCoverAt(maps, lat, lon), top = earthTopAt(maps, lat, lon), rain = earthRainAt(maps, lat, lon);
    const sheet = cover * ss(cfg.heapFrom, cfg.sheetFrom, cover);
    const heap = cover * (1 - ss(cfg.heapFrom, cfg.sheetFrom, cover));
    const thick = sheet > 0.01 ? cfg.thick[0] + (cfg.thick[1] - cfg.thick[0]) * sheet + 2500 * ss(1, 6, rain) : 0;
    const mid = cover * ss(cfg.midTops[0], cfg.midTops[1], top) * (1 - ss(cfg.highTops, cfg.highTops + 2500, top));
    const high = cover * ss(cfg.highTops, cfg.highTops + 2500, top);
    putA(A, k, heap, sheet, base0, thick);
    putB(B, k, mid, high, rain, cfg.wet * ss(0.4, 4, rain));
  }
  function texelC(i, j, C) {
    putC(C, j * CW + i, 0, 0);
  }
  let snap = null;
  // (each call hands back maps of its own: the day is one snapshot, made once, but a worker
  // transfers what it is given, and a second reply with the same buffers found them detached)
  const own = (s, t) => ({ ...s, t, A: s.A.slice(), B: s.B.slice(), C: s.C.slice(), cells: s.cells.slice(), lenses: s.lenses.slice() });
  function snapshot(t = 0) {
    if (snap) return own(snap, t);
    const s = makeSnapshot(layout, t);
    if (ready) {
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) texelAB(i, j, s.A, s.B);
      for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) texelC(i, j, s.C);
    }
    s.cells = records(0, 0);
    snap = s;
    return own(s, t);
  }

  // ---- the cells: the day's storms ---------------------------------------------------------

  // Where the rain is hard and the tops high: a cell that stands still over its place for ever
  // (the maps are of one moment, so nothing of it travels).
  let cells0 = null;
  function records() {
    if (cells0) return cells0;
    const out = [];
    if (ready) {
      const found = [];
      const GW = 360, GH = 180;
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const lat = 89.5 - j, lon = -179.5 + i;
        const rain = earthRainAt(maps, lat, lon);
        if (rain < cfg.cellRain || earthTopAt(maps, lat, lon) < cfg.cellTop) continue;
        found.push({ lat, lon, rain, top: earthTopAt(maps, lat, lon) });
      }
      found.sort((a, b) => b.rain - a.rain);
      const taken = [];
      for (const f of found) {
        if (taken.length >= cfg.cellMax) break;
        if (taken.some((q) => angleBetween(dirOf(f.lat, f.lon), dirOf(q.lat, q.lon)) * R < cfg.cellApart)) continue;
        taken.push(f);
        const d = dirOf(f.lat, f.lon), strong = clamp((f.rain - cfg.cellRain) / 12, 0, 1);
        out.push(
          900000 + taken.length, 0x5eed + taken.length, -1e9, d[0], d[1], d[2],
          cfg.cellRadius[0] + (cfg.cellRadius[1] - cfg.cellRadius[0]) * strong, Math.min(f.top, 16000),
          60, 4e9, 60, f.rain, 0.6, 3 + 9 * strong, -1, CELL_KIND.STILL,
        );
      }
    }
    cells0 = Float64Array.from(out);
    return cells0;
  }
  const place = (rec, o, t, out = [0, 0, 0]) => { out[0] = rec[o + CELL.X]; out[1] = rec[o + CELL.Y]; out[2] = rec[o + CELL.Z]; return out; };
  function cells(t) {
    const rec = records(), out = [], life = makeCellLife();
    for (let o = 0; o < rec.length; o += CELL.STRIDE) {
      cellLife(rec, o, t, life);
      if (!life.alive) continue;
      const x = rec[o + CELL.X], y = rec[o + CELL.Y], z = rec[o + CELL.Z], top = rec[o + CELL.TOP];
      out.push({
        id: rec[o + CELL.ID], seed: rec[o + CELL.SEED], born: rec[o + CELL.BORN], site: -1, kind: CELL_KIND.STILL,
        x, y, z, lat: latOf([x, y, z]), lon: lonOf([x, y, z]), age: life.age, phase: life.phase, stage: life.stage,
        strength: life.strength, rise: life.rise, radius: life.radius, core: life.core, rain: life.rain,
        rainPeak: rec[o + CELL.RAIN], flash: life.flash, end: life.end, base: base0, topMax: top, top,
      });
    }
    return out;
  }
  let geoms = null, geomT = NaN;
  function geomsAt(t) {
    if (geomT === t) return geoms;
    geoms = cells(t).map((k) => cellGeometry({ id: k.id, centre: [k.x, k.y, k.z], radius: k.radius, base: k.base, top: k.top, stage: k.stage, strength: k.strength, rain: k.rain, core: k.core, age: k.age, seed: 0.5 }, R));
    geomT = t;
    return geoms;
  }

  // ---- at() ------------------------------------------------------------------------------------

  const _uv = [0, 0], _pd = [0, 0, 0], _pm = [0, 0, 0], _w = [0, 0];
  function at(place2, t, out = makeSkyAt()) {
    let lat, lon, h;
    if (Array.isArray(place2) || ArrayBuffer.isView(place2)) {
      const r = Math.hypot(place2[0], place2[1], place2[2]) || 1;
      _pd[0] = place2[0] / r; _pd[1] = place2[1] / r; _pd[2] = place2[2] / r;
      lat = latOf(_pd); lon = lonOf(_pd); h = r - R;
    } else { lat = place2.lat; lon = place2.lon; h = place2.h ?? 0; dirOf(lat, lon, _pd); }
    const s = snapshot(0);
    uvOfLatLon(lat, lon, _uv);
    const F = fieldAt(s, null, 0, _uv[0], _uv[1], out.field);
    const ml = lonOfMap(lon);
    earthWindAt(cfg, storms, lat, ml, _w);
    out.windE = _w[0]; out.windN = _w[1]; out.wind = Math.hypot(_w[0], _w[1]); out.gust = 1;
    // (the rain and the wind come from the maps themselves, as weather.js had them: the field's
    // bytes hold the same numbers for the GPU)
    let rain = earthRainAt(maps, lat, ml), storm = 0, cell = -1, top = F.base + Math.max(F.thick, 600 + 2400 * F.heap);
    const gs = geomsAt(t), list = cells(t);
    for (let n = 0; n < gs.length; n++) {
      const G = gs[n], k = list[n], d = angleBetween(_pd, [k.x, k.y, k.z]) * R;
      if (d > k.radius * 2 + 14000) continue;
      const foot = cellFootprint(G, _pd);
      if (foot > storm) storm = foot;
      _pm[0] = _pd[0] * (R + h); _pm[1] = _pd[1] * (R + h); _pm[2] = _pd[2] * (R + h);
      const rr = cellRain(G, _pm);
      if (rr > rain) rain = rr;
      if (d < k.radius) { top = Math.max(top, k.top); cell = k.id; }
    }
    const temp = 27 - 0.42 * Math.max(0, Math.abs(lat) - 12) - 6.5 * Math.max(0, h) / 1000;
    const sn = clamp((1.5 - temp) / 3, 0, 1);
    if (h > F.base) rain = Math.max(0, rain * (1 - ss(F.base, F.base + 600, h)));
    out.rain = rain * (1 - sn); out.snow = rain * sn; out.temp = temp; out.storm = storm;
    out.overcast = 1 - (1 - 0.55 * F.heap) * (1 - 0.95 * F.sheet) * (1 - 0.5 * F.mid) * (1 - 0.2 * F.high) * (1 - storm);
    out.fog = h > F.base && h < F.base + F.thick ? 0.02 * F.sheet : 0;
    out.wet = F.wet; out.base = F.base; out.top = top; out.cell = cell;
    return out;
  }

  return {
    recipe: 'maps', layout, radius: R, steer, ready, storms,
    snapshot, at, cells, records: () => records(),
    strikes: (t0, t1) => strikesIn(records(), t0, t1, place, () => base0, () => 0, R),
    anvils: () => [], lenses: () => [], systems: () => [],
    wind: (lat, lon, out) => earthWindAt(cfg, storms, lat, lonOfMap(lon), out),
    rain: (lat, lon) => earthRainAt(maps, lat, lonOfMap(lon)),
    cfg,
  };
}
