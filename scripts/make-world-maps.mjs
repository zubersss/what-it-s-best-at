// The small world's other maps, made from its land (scripts/make-world.mjs must have run):
//   haven_day_<W>.jpg, _512.jpg        its colours from the air (the globe's face; the land's colour from far)
//   haven_slopes_<W>.jpg               the ground's slope everywhere (east in the top half, north in the bottom:
//                                      127.5 + 127.5 sign(s) sqrt(min(|s|, 1)), as scripts/fetch-maps.py makes them)
//   haven_water_2048.jpg, _512.jpg     white where water lies: the sea, the lakes, the great rivers
//   haven_clouds_<W>.jpg, _512.jpg     a day's clouds
//   haven_wxland_1024.u8               the land as the day's weather needs it (src/weather/sky/land.js)
//   haven_peaks.json                   its summits: place, height, prominence, the bearing of their ridge
// The colours are the same rule the game uses round the traveller (src/terrain/tiles/madeLand.js).
//
//   node scripts/make-world-maps.mjs [--width 4096] [--data public/data]
//
// Pictures are written as PNG and turned into JPEG by Python's PIL (python3 -c ...): the
// one thing here that is not plain Node.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { noise3 } from '../src/terrain/height/noise.js';
import { landAt, landNoise1, landNoise2, landNoise3, LAND_DEFAULTS } from '../src/terrain/tiles/madeLand.js';
import { png, readPng } from './lib/png.mjs';
import { makeWxLand, packWxLand, WxLand, WX_LAND } from '../src/weather/sky/land.js';

const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const W = +opt('width', 4096), H = W >> 1, N = W * H, DATA = opt('data', 'public/data'), SEED = +opt('seed', 7);
const RADIUS = 250000, CELL = Math.PI * RADIUS / H;
const t0 = Date.now(), say = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${s}`);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fbm = (x, y, z, f, oct, o) => { let a = 1, s = 0, n = 0; x = x * f + o; y = y * f + o * 0.7; z = z * f + o * 1.3; for (let k = 0; k < oct; k++) { s += a * noise3(x, y, z); n += a; a *= 0.5; x *= 2.03; y *= 2.03; z *= 2.03; } return s / n; };

const dem = new Int16Array(fs.readFileSync(path.join(DATA, `haven_dem_${W}.i16`)).buffer.slice(0));
const lakeImg = readPng(path.join(DATA, `haven_lakes_${W}.png`)), lakeInfo = JSON.parse(fs.readFileSync(path.join(DATA, 'haven_lakes.json'), 'utf8')).lakes;
const flow = new Uint8Array(fs.readFileSync(path.join(opt('cache', '.cache/haven'), `haven_flow_${W}.u8`)));
const rain = new Uint8Array(fs.readFileSync(path.join(DATA, 'haven_rain_720.u8')));
// (between the rain map's cells, not cell by cell: the edge of the grassland was a staircase)
const rainAt = (j, i) => {
  const fy = Math.min(358.999, Math.max(0, (j + 0.5) / H * 360 - 0.5)), fx = ((((i + 0.5) / W + 0.5) % 1) * 720 - 0.5 + 720) % 720;
  const y0 = Math.floor(fy), x0 = Math.floor(fx), ty = fy - y0, tx = fx - x0, x1 = (x0 + 1) % 720, y1 = Math.min(359, y0 + 1);
  const v = ((rain[y0 * 720 + x0] * (1 - tx) + rain[y0 * 720 + x1] * tx) * (1 - ty) + (rain[y1 * 720 + x0] * (1 - tx) + rain[y1 * 720 + x1] * tx) * ty) / 3.2;
  return v * v;
};
const tmp = fs.mkdtempSync(path.join(DATA, '.maps-'));
const jobs = [];          // [png file, jpg file, width (0: as it is), quality, mode]
const toJpeg = (name, w, h, px, channels, out, quality, small) => { const f = path.join(tmp, name + '.png'); fs.writeFileSync(f, png(w, h, px, channels)); jobs.push([f, path.join(DATA, out), 0, quality]); if (small) jobs.push([f, path.join(DATA, small), 512, 88]); };

// --- colours, water, slopes
{
  const day = new Uint8Array(N * 3), water = new Uint8Array(N * 3), slopes = new Uint8Array(W * W * 3), o = {}, L = LAND_DEFAULTS;
  let sr = 0, sg = 0, sb = 0, sw = 0;
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  for (let j = 0; j < H; j++) {
    const la = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(la), sl = Math.sin(la), lat = la * 180 / Math.PI, dx = CELL * Math.max(0.05, cl);
    for (let i = 0; i < W; i++) {
      const q = j * W + i, h = dem[q], lo = (i + 0.5) / W * 2 * Math.PI, x = cl * Math.cos(lo), y = cl * Math.sin(lo);
      const e = dem[j * W + ((i + 1) % W)], w = dem[j * W + ((i - 1 + W) % W)], n = dem[Math.max(0, j - 1) * W + i], s = dem[Math.min(H - 1, j + 1) * W + i];
      // (the sea's bed has no slope to show: only the land is in the slope map)
      const gE = h > 0 ? (Math.max(e, 0) - Math.max(w, 0)) / (2 * dx) : 0, gN = h > 0 ? (Math.max(n, 0) - Math.max(s, 0)) / (2 * CELL) : 0;
      const id = lakeImg.data[q * 3], lk = id > 0, depth = lk ? Math.max(0, lakeInfo[id - 1].level - h) : 0;
      const n1 = landNoise1(x, y, sl, SEED), n2 = landNoise2(x, y, sl, SEED);
      landAt(L, h, Math.hypot(gE, gN), lat, rainAt(j, i), n1, n2, o, lk, depth, landNoise3(x, y, sl, SEED));
      // the great rivers show from space (a cell wide)
      const river = h > 0 && !lk && flow[q] > 112;
      if (river) { o.r = L.colours.lake[0] * 0.6 + o.r * 0.4; o.g = L.colours.lake[1] * 0.6 + o.g * 0.4; o.b = L.colours.lake[2] * 0.6 + o.b * 0.4; }
      day[q * 3] = Math.max(0, Math.min(255, Math.round(o.r))); day[q * 3 + 1] = Math.max(0, Math.min(255, Math.round(o.g))); day[q * 3 + 2] = Math.max(0, Math.min(255, Math.round(o.b)));
      if (h > 0 && !lk) { sr += lin(day[q * 3]) * cl; sg += lin(day[q * 3 + 1]) * cl; sb += lin(day[q * 3 + 2]) * cl; sw += cl; }
      const wv = h <= 0 || lk ? 255 : river ? 150 : 0; water[q * 3] = water[q * 3 + 1] = water[q * 3 + 2] = wv;
      const enc = (g) => Math.round(127.5 + 127.5 * Math.sign(g) * Math.sqrt(Math.min(Math.abs(g), 1)));
      const a = (j * W + i) * 3, b = ((j + H) * W + i) * 3; slopes[a] = slopes[a + 1] = slopes[a + 2] = enc(gE); slopes[b] = slopes[b + 1] = slopes[b + 2] = enc(gN);
    }
  }
  console.log(`the land's mean colour (linear), for the world file's albedoMap.mean: [${(sr / sw).toFixed(4)}, ${(sg / sw).toFixed(4)}, ${(sb / sw).toFixed(4)}]`);
  toJpeg('day', W, H, day, 3, `haven_day_${W}.jpg`, 90, 'haven_day_512.jpg');
  toJpeg('slopes', W, W, slopes, 3, `haven_slopes_${W}.jpg`, 90, null); jobs[jobs.length - 1].push('L');
  { const f = path.join(tmp, 'water.png'); fs.writeFileSync(f, png(W, H, water)); jobs.push([f, path.join(DATA, 'haven_water_2048.jpg'), 2048, 88, 'L'], [f, path.join(DATA, 'haven_water_512.jpg'), 512, 88, 'L']); }
  say('colours, water and slopes');
}

// --- a day's clouds: wide bands and swirls of weather, clear country between
{
  const cloud = new Uint8Array(N * 3);
  for (let j = 0; j < H; j++) {
    const la = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(la), sl = Math.sin(la), lat = Math.abs(la * 180 / Math.PI);
    // (more weather in the middle latitudes and along the equator, less in the dry belts)
    const belt = 0.1 * Math.exp(-lat * lat / 120) - 0.12 * Math.exp(-((lat - 26) ** 2) / 100) + 0.14 * Math.exp(-((lat - 52) ** 2) / 220);
    for (let i = 0; i < W; i++) {
      const lo = (i + 0.5) / W * 2 * Math.PI; let x = cl * Math.cos(lo), y = cl * Math.sin(lo), z = sl;
      const wx = fbm(x, y, z, 2.1, 3, 11.3 + SEED), wy = fbm(x, y, z, 2.1, 3, 23.9 + SEED), wz = fbm(x, y, z, 2.1, 3, 37.1 + SEED);
      x += 0.35 * wx; y += 0.35 * wy; z += 0.35 * wz;
      const big = fbm(x, y, z, 2.6, 5, 51.7 + SEED), fine = fbm(x, y, z, 24, 4, 63.3 + SEED);
      const v = ss(0.02, 0.42, big + belt + 0.12 * fine);
      const q = (j * W + i) * 3; cloud[q] = cloud[q + 1] = cloud[q + 2] = Math.round(255 * v * (0.75 + 0.25 * ss(-0.3, 0.3, fine)));
    }
  }
  let m = 0; for (let q = 0; q < N; q++) m += cloud[q * 3]; console.log(`the day's cloud: ${(m / N / 2.55).toFixed(0)} % of full, on average`);
  { const f = path.join(tmp, 'clouds.png'); fs.writeFileSync(f, png(W, H, cloud)); jobs.push([f, path.join(DATA, `haven_clouds_${W}.jpg`), 0, 85, 'L'], [f, path.join(DATA, 'haven_clouds_512.jpg'), 512, 85, 'L']); }
  say('clouds');
}

// --- the weather's land: the planes the day's weather is worked out over, and the summits
// (src/weather/sky/land.js; the same rule the model uses when it has no file, so the two agree)
{
  const planes = makeWxLand({ dem: { data: dem, width: W, height: H }, width: +opt('wxwidth', 1024), radius: RADIUS });
  fs.writeFileSync(path.join(DATA, `haven_wxland_${planes.width}.u8`), packWxLand(planes));
  const peaks = planes.peaks.map((p) => ({ lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), h: Math.round(p.h), prom: Math.round(p.prom), ridge: p.ridge }));
  fs.writeFileSync(path.join(DATA, 'haven_peaks.json'), `${JSON.stringify({ version: WX_LAND.VERSION, radius: RADIUS, prominence: WX_LAND.PEAK_PROM, apart: WX_LAND.PEAK_APART, count: peaks.length, peaks }, null, 1)}\n`);
  const land = new WxLand(planes);
  const high = planes.peaks[0];
  console.log(`  the weather's land: ${planes.width} x ${planes.height}, ${land.sites.length} trigger sites, ${peaks.length} summits over ${WX_LAND.PEAK_PROM} m of prominence (the highest ${Math.round(high.h)} m at ${high.lat.toFixed(2)}, ${high.lon.toFixed(2)})`);
  say(`the weather's land (haven_wxland_${planes.width}.u8, haven_peaks.json)`);
}

// --- PNG -> JPEG
const py = `
import sys, json
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
for src, out, width, quality, *mode in json.loads(sys.argv[1]):
    im = Image.open(src)
    if mode: im = im.convert(mode[0])
    if width and width != im.size[0]: im = im.resize((width, round(im.size[1] * width / im.size[0])), Image.LANCZOS)
    im.save(out, quality=quality, optimize=True)
`;
execFileSync('python3', ['-c', py, JSON.stringify(jobs)], { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true });
for (const j of jobs) console.log(`  ${path.basename(j[1])}  ${(fs.statSync(j[1]).size / 1e6).toFixed(2)} MB`);
say('done');
