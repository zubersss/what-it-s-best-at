// A place to begin on the small world: level ground to stand on, high over a valley with
// water in it, ranges behind. Looks through the baked maps (scripts/make-world.mjs) and
// prints the best few with the way to face (toward the water).
//   node scripts/find-haven-site.mjs [--data public/data] [--width 4096] [--lat 10,45] [--count 8]
import fs from 'node:fs';
import path from 'node:path';
import { readPng } from './lib/png.mjs';
import { landAt, landNoise1, landNoise2, LAND_DEFAULTS } from '../src/terrain/tiles/madeLand.js';
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const W = +opt('width', 4096), H = W >> 1, DATA = opt('data', 'public/data'), [LAT0, LAT1] = opt('lat', '8,48').split(',').map(Number);
const R = 250000, CELL = Math.PI * R / H;
const dem = new Int16Array(fs.readFileSync(path.join(DATA, `haven_dem_${W}.i16`)).buffer.slice(0));
const lk = readPng(path.join(DATA, `haven_lakes_${W}.png`)).data;
const at = (i, j) => dem[Math.max(0, Math.min(H - 1, j)) * W + ((i % W) + W) % W];
const lakeAt = (i, j) => lk[(Math.max(0, Math.min(H - 1, j)) * W + ((i % W) + W) % W) * 3];
const rain = new Uint8Array(fs.readFileSync(path.join(DATA, 'haven_rain_720.u8')));
// what covers a cell (the land rule, with the rain map's nearest cell)
const coverAt = (i, j, lat, s) => {
  const lon = (i + 0.5) / W * 360, la = lat * Math.PI / 180, lo = lon * Math.PI / 180, x = Math.cos(la) * Math.cos(lo), y = Math.cos(la) * Math.sin(lo), z = Math.sin(la);
  const v = rain[Math.min(359, Math.floor((90 - lat) * 2)) * 720 + Math.floor(((lon + 180) % 360) * 2)] / 3.2, o = {};
  landAt(LAND_DEFAULTS, at(i, j), s, lat, v * v, landNoise1(x, y, z, 7), landNoise2(x, y, z, 7), o);
  return o;
};
const OPEN = process.argv.includes('--open');
const found = [];
for (let j = 0; j < H; j += 3) {
  const lat = 90 - (j + 0.5) / H * 180; if (Math.abs(lat) < LAT0 || Math.abs(lat) > LAT1) continue;
  const cx = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  for (let i = 0; i < W; i += 3) {
    const h = at(i, j); if (h < 500 || h > 1900 || lakeAt(i, j)) continue;
    // level where one stands
    const s = Math.hypot((at(i + 1, j) - at(i - 1, j)) / (2 * CELL * cx), (at(i, j - 1) - at(i, j + 1)) / (2 * CELL));
    if (s > 0.12) continue;
    // (--open: on open ground, parkland or meadow, with forest within a few kilometres: a place to see from)
    let woods = 0;
    if (OPEN) {
      const c = coverAt(i, j, lat, s); if (c.cls !== 9 && c.cls !== 10 && c.cls !== 8) continue;
      for (let a = 0; a < 8; a++) for (const r of [3, 6]) { const ii = i + Math.round(r * Math.sin(a * Math.PI / 4) / cx), jj = j - Math.round(r * Math.cos(a * Math.PI / 4)); if (at(ii, jj) > 0 && coverAt(ii, jj, lat, 0.1).cls === 1) woods++; }
      if (woods < 3 || woods > 12) continue;
    }
    // what is round it, out to 14 km, on the land (the sea and a lake count as their surfaces):
    // how far the ground falls away on the side it falls most, how high it stands on the
    // other side, how much of the view is water, and how much the skyline goes up and down
    const lvl = (ii, jj) => { const v = at(ii, jj); return v <= 0 ? 0 : v; };
    let high = h, wx = 0, wy = 0, wet = 0, lake = 0, drop = 0, dropDir = 0; const sky = [];
    for (let a = 0; a < 16; a++) {
      const ca = Math.cos(a * Math.PI / 8), sa = Math.sin(a * Math.PI / 8); let lowA = h, top = -1;
      for (let r = 2; r <= 36; r += 2) {
        const ii = i + Math.round(r * sa / cx), jj = j - Math.round(r * ca), v = lvl(ii, jj);
        if (r <= 20 && v < lowA) lowA = v; if (v > high) high = v;
        const el = (v - h) / (r * CELL); if (el > top) top = el;                    // how high the skyline stands that way
        const lk = lakeAt(ii, jj);
        if ((lk || at(ii, jj) <= 0) && r < 28) { wet++; wx += sa; wy += ca; if (lk) lake++; }
      }
      sky.push(top);
      if (h - lowA > drop) { drop = h - lowA; dropDir = a * 22.5; }
    }
    // (the view is toward the drop: mountains should stand in it, beyond the low ground)
    const toward = sky[Math.round(dropDir / 22.5) % 16], rough = Math.max(...sky) - Math.min(...sky);
    if (wet < 4 || drop < 350 || high - h < 700) continue;
    const heading = Math.round(dropDir);
    found.push({ score: Math.min(drop, 1200) + 0.5 * Math.min(high - h, 2400) + 10 * Math.min(wet, 30) + 14 * Math.min(lake, 20) + 2500 * Math.max(0, toward + 0.02) + 800 * rough,
      lat: +lat.toFixed(3), lon: +((i + 0.5) / W * 360).toFixed(3), h, drop, above: high - h, wet, lake, heading, dropDir, water: Math.round((Math.atan2(wx, wy) * 180 / Math.PI + 360) % 360) });
  }
}
found.sort((a, b) => b.score - a.score);
// (not ten of one hillside: the best, then the best at least 3 degrees from those taken)
const out = [];
for (const f of found) { if (out.every((o) => Math.hypot(o.lat - f.lat, (o.lon - f.lon) * Math.cos(f.lat * Math.PI / 180)) > 3)) out.push(f); if (out.length >= +opt('count', 8)) break; }
for (const f of out) console.log(`lat ${f.lat}  lon ${f.lon}  ground ${f.h} m  falls ${f.drop} m toward ${f.dropDir}  rises ${f.above} m near by  water toward ${f.water} (${f.wet} sightings, ${f.lake} of a lake)  (score ${f.score.toFixed(0)})`);
