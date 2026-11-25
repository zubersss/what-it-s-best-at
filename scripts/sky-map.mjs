// Haven's weather from above, drawn without a browser (docs/briefs/sky-A-model.md, job 7): each
// kind of cloud, the rain, the storm cells and their lightning, the wind by layer, the fog, over
// the land's shaded relief. PNGs into docs/shots/sky/, named A-...
//
//   node scripts/sky-map.mjs --day 2024-09-22 --hours 6,9,12,15,18    the set of maps of a day
//   node scripts/sky-map.mjs --scene                                  the three scene days (15 maps)
//   node scripts/sky-map.mjs --lapse --span 300000 --frames 48        a time-lapse round the opening place
//   node scripts/sky-map.mjs --meteogram --days 7                     the weather at the opening place over a week
//   node scripts/sky-map.mjs --land                                   the land the weather is worked out over
// Options: --width 1024 (the field), --out docs/shots/sky, --size 1100 (pixels across),
//          --span (m: a window round the opening place; without it the whole world),
//          --seed, --suffix _x
//
// Each map is the land in grey (its own shaded relief) with the weather laid over it in colour,
// a key down the side, and the numbers that matter printed in the corner. Nothing here is drawn
// by a GPU: every pixel is worked out from the model's own snapshot, so these pictures are what
// the game's field holds.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldLayout, ENC, cellLife, makeCellLife, CELL } from '../src/weather/sky/format.js';
import { makeProducer, tForHour, localHour } from '../src/weather/sky/producer.js';
import { readWxLand, makeWxLand, WxLand, dirOf, latOf, lonOf, angleBetween, offsetLatLon } from '../src/weather/sky/land.js';
import { Steer } from '../src/weather/sky/steer.js';
import { png } from './lib/png.mjs';
import haven from '../src/worlds/haven.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && !String(process.argv[i + 1] ?? '').startsWith('--') ? process.argv[i + 1] : (i > 0 ? true : d); };
const flag = (k) => process.argv.includes('--' + k);
const num = (k, d) => { const v = opt(k, null); return v === null || v === true ? d : +v; };

const OUT = String(opt('out', 'docs/shots/sky'));
const SIZE = num('size', 1100);
const SUFFIX = opt('suffix', '') === true ? '' : String(opt('suffix', ''));
const R = haven.radius, START = haven.scene.start;
fs.mkdirSync(path.join(root, OUT), { recursive: true });

const DEM = (() => { const b = fs.readFileSync(path.join(root, 'public/data/haven_dem_4096.i16')); return { data: new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1), width: 4096, height: 2048 }; })();
const PLANES = (() => {
  const f = path.join(root, 'public/data/haven_wxland_1024.u8'), pf = path.join(root, 'public/data/haven_peaks.json');
  if (fs.existsSync(f)) return readWxLand(fs.readFileSync(f), fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')).peaks : null);
  return makeWxLand({ dem: DEM, width: 1024, radius: R });
})();
const LAND = new WxLand({ ...PLANES, radius: R });

const weather = { ...haven.weather, seed: num('seed', haven.weather.seed) };
const WIDTH = num('width', 512);
const layout = fieldLayout({ weather: { ...weather, field: { width: WIDTH } } });
const opts = { weather, radius: R, dayHours: haven.dayHours || 24, origin: START, layout, wxland: PLANES };
const producer = makeProducer(opts);
const steer = new Steer(weather, R);

// ---- the picture ------------------------------------------------------------------------------

// A window: the whole world, or a span of metres round a place.
function makeView(span, centre = START) {
  if (!span) return { w: SIZE, h: SIZE >> 1, whole: true, place: (x, y) => ({ lat: 90 - (y + 0.5) * 180 / (SIZE >> 1), lon: (x + 0.5) * 360 / SIZE }) };
  const n = SIZE, half = span / 2;
  return {
    w: n, h: n, whole: false, span, centre,
    place: (x, y) => {
      const east = (x + 0.5 - n / 2) / n * span, north = (n / 2 - y - 0.5) / n * span;
      const d = Math.hypot(east, north);
      if (d < 1) return { ...centre };
      return offsetLatLon(centre.lat, centre.lon, Math.atan2(east, north), d, R);
    },
  };
}

// the land's own shaded relief, in grey (the sea darker, the snow lighter)
function relief(view) {
  const { w, h } = view, px = new Uint8Array(w * h * 3);
  const sun = [-0.55, 0.6, 0.58];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = view.place(x, y);
    const g = LAND.atLatLon('g', p.lat, p.lon), landf = LAND.atLatLon('land', p.lat, p.lon);
    const gE = LAND.atLatLon('gE', p.lat, p.lon) * 6, gN = LAND.atLatLon('gN', p.lat, p.lon) * 6;
    const nl = Math.hypot(gE, gN, 1), lambert = Math.max(0.15, (-gE * sun[0] - gN * sun[1] + sun[2]) / nl);
    let v = landf > 0.5 ? (0.30 + 0.42 * Math.min(1, g / 3500)) * (0.55 + 0.75 * lambert) : 0.13;
    const k = (y * w + x) * 3;
    v = Math.max(0, Math.min(1, v));
    px[k] = Math.round(255 * v * (landf > 0.5 ? 1 : 0.65));
    px[k + 1] = Math.round(255 * v * (landf > 0.5 ? 1 : 0.8));
    px[k + 2] = Math.round(255 * v);
  }
  return px;
}

// a 5 x 7 pixel font, enough for a caption (the figures and the letters a caption needs)
const GLYPHS = {
  ' ': '00000,00000,00000,00000,00000,00000,00000', '0': '01110,10001,10011,10101,11001,10001,01110',
  1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111',
  3: '11111,00010,00100,00010,00001,10001,01110', 4: '00010,00110,01010,10010,11111,00010,00010',
  5: '11111,10000,11110,00001,00001,10001,01110', 6: '00110,01000,10000,11110,10001,10001,01110',
  7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110',
  9: '01110,10001,10001,01111,00001,00010,01100', '.': '00000,00000,00000,00000,00000,01100,01100',
  ':': '00000,01100,01100,00000,01100,01100,00000', '-': '00000,00000,00000,11111,00000,00000,00000',
  '%': '11001,11010,00100,01000,10000,01011,10011', '/': '00001,00010,00100,00100,01000,10000,10000',
  ',': '00000,00000,00000,00000,01100,00100,01000', '(': '00010,00100,01000,01000,01000,00100,00010',
  ')': '01000,00100,00010,00010,00010,00100,01000', '+': '00000,00100,00100,11111,00100,00100,00000',
  a: '00000,00000,01110,00001,01111,10001,01111', b: '10000,10000,11110,10001,10001,10001,11110',
  c: '00000,00000,01111,10000,10000,10000,01111', d: '00001,00001,01111,10001,10001,10001,01111',
  e: '00000,00000,01110,10001,11111,10000,01110', f: '00110,01000,11100,01000,01000,01000,01000',
  g: '00000,01111,10001,10001,01111,00001,01110', h: '10000,10000,11110,10001,10001,10001,10001',
  i: '00100,00000,00100,00100,00100,00100,00100', j: '00010,00000,00010,00010,00010,10010,01100',
  k: '10000,10010,10100,11000,10100,10010,10001', l: '01000,01000,01000,01000,01000,01000,00110',
  m: '00000,00000,11010,10101,10101,10101,10101', n: '00000,00000,11110,10001,10001,10001,10001',
  o: '00000,00000,01110,10001,10001,10001,01110', p: '00000,11110,10001,10001,11110,10000,10000',
  q: '00000,01111,10001,10001,01111,00001,00001', r: '00000,00000,01110,10000,10000,10000,10000',
  s: '00000,00000,01111,10000,01110,00001,11110', t: '01000,01000,11100,01000,01000,01000,00110',
  u: '00000,00000,10001,10001,10001,10001,01111', v: '00000,00000,10001,10001,10001,01010,00100',
  w: '00000,00000,10101,10101,10101,10101,01010', x: '00000,00000,10001,01010,00100,01010,10001',
  y: '00000,10001,10001,01111,00001,00010,01100', z: '00000,00000,11111,00010,00100,01000,11111',
  A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,11110,10001,10001,10001,11110',
  C: '01111,10000,10000,10000,10000,10000,01111', D: '11110,10001,10001,10001,10001,10001,11110',
  E: '11111,10000,11110,10000,10000,10000,11111', F: '11111,10000,11110,10000,10000,10000,10000',
  G: '01111,10000,10000,10011,10001,10001,01111', H: '10001,10001,11111,10001,10001,10001,10001',
  I: '01110,00100,00100,00100,00100,00100,01110', J: '00111,00010,00010,00010,00010,10010,01100',
  K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
  M: '10001,11011,10101,10001,10001,10001,10001', N: '10001,11001,10101,10011,10001,10001,10001',
  O: '01110,10001,10001,10001,10001,10001,01110', P: '11110,10001,10001,11110,10000,10000,10000',
  Q: '01110,10001,10001,10001,10101,10011,01111', R: '11110,10001,10001,11110,10100,10010,10001',
  S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100',
  U: '10001,10001,10001,10001,10001,10001,01110', V: '10001,10001,10001,10001,10001,01010,00100',
  W: '10001,10001,10001,10101,10101,11011,10001', X: '10001,01010,00100,00100,00100,01010,10001',
  Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
};
function text(px, w, h, x0, y0, str, colour = [255, 255, 255], scale = 2) {
  for (let i = 0; i < str.length; i++) {
    const g = GLYPHS[str[i]] ?? GLYPHS[' '];
    const rows = g.split(',');
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (rows[r][c] !== '1') continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const x = x0 + (i * 6 + c) * scale + sx, y = y0 + r * scale + sy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const k = (y * w + x) * 3;
        px[k] = colour[0]; px[k + 1] = colour[1]; px[k + 2] = colour[2];
      }
    }
  }
}
const over = (px, w, k, r, g, b, a) => { px[k] = px[k] * (1 - a) + r * a; px[k + 1] = px[k + 1] * (1 - a) + g * a; px[k + 2] = px[k + 2] * (1 - a) + b * a; void w; };
function dot(px, w, h, x0, y0, radius, colour, a = 1) {
  for (let y = Math.max(0, y0 - radius); y <= Math.min(h - 1, y0 + radius); y++) for (let x = Math.max(0, x0 - radius); x <= Math.min(w - 1, x0 + radius); x++) {
    if ((x - x0) ** 2 + (y - y0) ** 2 > radius * radius) continue;
    over(px, w, (y * w + x) * 3, colour[0], colour[1], colour[2], a);
  }
}
function line(px, w, h, x0, y0, x1, y1, colour, a = 1) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    over(px, w, (y * w + x) * 3, colour[0], colour[1], colour[2], a);
  }
}

// ---- a map of the weather at one time ----------------------------------------------------------

const KINDS = {
  heap: { chan: ['A', 0], colour: [255, 255, 255], label: 'heaps (cumulus)' },
  sheet: { chan: ['A', 1], colour: [205, 210, 225], label: 'sheets and rain decks' },
  mid: { chan: ['B', 0], colour: [180, 170, 215], label: 'mid cloud (5 km)' },
  high: { chan: ['B', 1], colour: [225, 225, 180], label: 'high cloud and anvils (9 km)' },
  rain: { chan: ['B', 2], colour: [80, 160, 255], label: 'rain (mm/h)' },
  wet: { chan: ['B', 3], colour: [120, 90, 60], label: 'wet ground' },
  fog: { chan: ['C', 0], colour: [240, 255, 255], label: 'fog, its top over the sea' },
};

function mapAt(t, title, view, kinds = ONLY && ONLY !== true ? String(ONLY).split(',') : ['heap', 'sheet', 'mid', 'high', 'rain']) {
  const { w, h } = view, px = relief(view);
  const s = producer.snapshot(t);
  const read = (plane, chan, lat, lon) => {
    const W = plane === 'C' ? s.cWidth : s.width, H = plane === 'C' ? s.cHeight : s.height, ch = plane === 'C' ? 2 : 4;
    const x = ((lon / 360) % 1 + 1) % 1 * W - 0.5, y = Math.min(H - 1.001, Math.max(0, (90 - lat) / 180 * H - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % W) + W) % W, i1 = (i0 + 1) % W, j0 = Math.max(0, Math.min(H - 1, y0)), j1 = Math.max(0, Math.min(H - 1, y0 + 1));
    const b = s[plane];
    return ((b[(j0 * W + i0) * ch + chan] * (1 - fx) + b[(j0 * W + i1) * ch + chan] * fx) * (1 - fy)
      + (b[(j1 * W + i0) * ch + chan] * (1 - fx) + b[(j1 * W + i1) * ch + chan] * fx) * fy) / 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = view.place(x, y), k = (y * w + x) * 3;
    for (const name of kinds) {
      const K = KINDS[name];
      let v = read(K.chan[0], K.chan[1], p.lat, p.lon);
      if (name === 'rain') v = Math.min(1, (Math.pow(2, v * 255 / ENC.RAIN_K) - 1) / 8);
      if (name === 'fog') v = v > 0 ? 0.35 + 0.65 * Math.min(1, v * 255 * ENC.FOG_STEP / 800) : 0;
      if (v <= 0.01) continue;
      const a = name === 'heap' || name === 'sheet' ? 0.85 * v : 0.7 * v;
      over(px, w, k, K.colour[0], K.colour[1], K.colour[2], a);
    }
  }
  // the storm cells, their rain cores and their strikes
  const toPixel = (lat, lon) => {
    if (view.whole) return [((lon / 360) % 1 + 1) % 1 * w, (90 - lat) / 180 * h];
    const d = angleBetween(dirOf(lat, lon), dirOf(view.centre.lat, view.centre.lon)) * R;
    if (d > view.span) return null;
    const a = dirOf(lat, lon), c = dirOf(view.centre.lat, view.centre.lon);
    const cl = Math.max(Math.hypot(c[0], c[1]), 1e-9), ex = -c[1] / cl, ey = c[0] / cl;
    const nx = -c[2] * ex, ny = -c[2] * ey, nz = cl;
    const vx = a[0] - c[0], vy = a[1] - c[1], vz = a[2] - c[2];
    const east = (vx * ex + vy * ey) * R, north = (vx * nx + vy * ny + vz * nz) * R;
    return [w / 2 + east / view.span * w, h / 2 - north / view.span * h];
  };
  const cells = producer.cells(t);
  for (const c of cells) {
    const q = toPixel(c.lat, c.lon);
    if (!q) continue;
    const rpx = Math.max(2, Math.round(c.radius / (view.whole ? (2 * Math.PI * R / w) : (view.span / w))));
    dot(px, w, h, Math.round(q[0]), Math.round(q[1]), rpx, [255, 120, 60], 0.55);
    dot(px, w, h, Math.round(q[0]), Math.round(q[1]), Math.max(1, Math.round(rpx * c.core / c.radius)), [255, 60, 30], 0.8);
    if (c.flash > 0) text(px, w, h, Math.round(q[0]) + rpx + 2, Math.round(q[1]) - 7, 'X', [255, 240, 120], 2);
  }
  for (const st of producer.strikes(t, t + 60)) {
    const q = toPixel(latOf([st.x, st.y, st.z]), lonOf([st.x, st.y, st.z]));
    if (q) dot(px, w, h, Math.round(q[0]), Math.round(q[1]), 2, [255, 255, 160], 1);
  }
  // the wind arrows, low and high
  const step = Math.round(w / 14);
  for (let y = step; y < h - step / 2; y += step) for (let x = step; x < w - step / 2; x += step) {
    const p = view.place(x, y);
    for (const [layer, colour, scale] of [['low', [120, 255, 160], 1.6], ['high', [255, 180, 120], 0.5]]) {
      const v = steer.windAt(layer, t, p.lat, p.lon, layer === 'low' ? 1500 : 9000);
      const l = Math.min(step * 0.45, v.speed * scale);
      line(px, w, h, x, y, x + v.east / Math.max(0.1, v.speed) * l, y - v.north / Math.max(0.1, v.speed) * l, colour, 0.8);
      dot(px, w, h, Math.round(x + v.east / Math.max(0.1, v.speed) * l), Math.round(y - v.north / Math.max(0.1, v.speed) * l), 1, colour, 0.9);
    }
  }
  // the opening place and the Crown
  for (const id of ['landing', 'crown']) {
    const pl = haven.places.find((q) => q.id === id);
    const q = toPixel(pl.lat, pl.lon);
    if (q) { dot(px, w, h, Math.round(q[0]), Math.round(q[1]), 3, [255, 60, 255], 1); text(px, w, h, Math.round(q[0]) + 6, Math.round(q[1]) - 7, pl.id === 'landing' ? 'ledge' : 'Crown', [255, 160, 255], 2); }
  }
  // the caption and the key
  text(px, w, h, 8, 8, title, [255, 255, 255], 2);
  let y0 = 26;
  for (const name of kinds) { text(px, w, h, 8, y0, KINDS[name].label, KINDS[name].colour, 2); y0 += 18; }
  text(px, w, h, 8, y0, `cells ${cells.length}, strikes a minute ${producer.strikes(t, t + 60).length}`, [255, 150, 90], 2); y0 += 18;
  text(px, w, h, 8, y0, `wind low ${Math.abs(steer.speed('low', t)).toFixed(1)} mid ${Math.abs(steer.speed('mid', t)).toFixed(1)} high ${Math.abs(steer.speed('high', t)).toFixed(1)} m/s`, [160, 255, 200], 2);
  return { px, w, h };
}

function write(name, pic) {
  const f = path.join(root, OUT, `${name}${SUFFIX}.png`);
  fs.writeFileSync(f, png(pic.w, pic.h, pic.px, 3));
  console.log(`  ${path.relative(root, f)}  ${pic.w} x ${pic.h}`);
}

// ---- the sets ----------------------------------------------------------------------------------

function dayMaps(date, hours, span) {
  const day = steer.dayOfDate(date), view = makeView(span);
  for (const hour of hours) {
    const t = tForHour(opts, steer, day, hour);
    const title = `${date} ${String(hour).padStart(2, '0')} h at the ledge`;
    write(`A-${date}-${String(hour).padStart(2, '0')}h${span ? '-near' : ''}`, mapAt(t, title, view));
  }
}

function lapse() {
  const span = num('span', 300000), frames = num('frames', 48), view = makeView(span);
  const day = steer.dayOfDate(String(opt('day', '2024-09-22')));
  const t0 = tForHour(opts, steer, day, 0);
  for (let k = 0; k < frames; k++) {
    const t = t0 + k * 1800;
    const h = localHour(opts, START.lon, t);
    write(`A-lapse-${String(k).padStart(2, '0')}`, mapAt(t, `${steer.dateOfDay(steer.dayIndex(t))} ${h.toFixed(1)} h, ${Math.round(span / 1000)} km round the ledge`, view));
  }
}

// a week of weather at the opening place: wind by layer, rain, cover by kind, cells within 40 km
function meteogram() {
  const days = num('days', 7), w = 1200, h = 620, px = new Uint8Array(w * h * 3).fill(18);
  const day0 = steer.dayOfDate(String(opt('day', '2024-09-22')));
  const hours = days * 24, x0 = 70, x1 = w - 20, yTop = 40;
  const band = (h - yTop - 40) / 4;
  const xOf = (i) => x0 + (x1 - x0) * i / hours;
  const rows = [
    { label: 'wind m/s (low, mid, high, ground)', max: 60 },
    { label: 'rain mm/h (and the wet ground)', max: 10 },
    { label: 'cover: heaps, sheets, mid, high', max: 1 },
    { label: 'cells within 40 km, fog top (m)', max: 8 },
  ];
  rows.forEach((r, k) => {
    const y = yTop + k * band;
    text(px, w, h, 8, Math.round(y + 4), r.label, [200, 200, 200], 2);
    line(px, w, h, x0, y + band - 1, x1, y + band - 1, [90, 90, 90], 1);
  });
  const vals = [];
  for (let i = 0; i < hours; i++) {
    const day = day0 + Math.floor(i / 24), hour = i % 24, t = tForHour(opts, steer, day, hour);
    const a = producer.at(START, t);
    const cells = producer.cells(t).filter((c) => angleBetween([c.x, c.y, c.z], dirOf(START.lat, START.lon)) * R < 40000);
    vals.push({
      t, low: Math.abs(steer.speed('low', t)), mid: Math.abs(steer.speed('mid', t)), high: Math.abs(steer.speed('high', t)),
      ground: a.wind, rain: a.rain + a.snow, wet: a.wet, heap: a.field.heap, sheet: a.field.sheet,
      midC: a.field.mid, highC: a.field.high, cells: cells.length, fog: a.field.fogTop, hour, day,
    });
  }
  const plot = (k, pick, colour, max) => {
    const y = yTop + k * band;
    for (let i = 1; i < vals.length; i++) {
      const a = pick(vals[i - 1]), b = pick(vals[i]);
      line(px, w, h, xOf(i - 1), y + band - 1 - band * Math.min(1, a / max), xOf(i), y + band - 1 - band * Math.min(1, b / max), colour, 1);
    }
  };
  plot(0, (v) => v.low, [120, 255, 160], 60); plot(0, (v) => v.mid, [160, 200, 255], 60);
  plot(0, (v) => v.high, [255, 180, 120], 60); plot(0, (v) => v.ground, [255, 255, 255], 60);
  plot(1, (v) => v.rain, [80, 160, 255], 10); plot(1, (v) => v.wet * 10, [120, 90, 60], 10);
  plot(2, (v) => v.heap, [255, 255, 255], 1); plot(2, (v) => v.sheet, [205, 210, 225], 1);
  plot(2, (v) => v.midC, [180, 170, 215], 1); plot(2, (v) => v.highC, [225, 225, 180], 1);
  plot(3, (v) => v.cells, [255, 120, 60], 8); plot(3, (v) => v.fog / 100, [240, 255, 255], 8);
  // the days' marks
  for (let d = 0; d <= days; d++) {
    const x = xOf(d * 24);
    line(px, w, h, x, yTop, x, h - 40, [70, 70, 70], 1);
    if (d < days) text(px, w, h, Math.round(x) + 4, h - 32, steer.dateOfDay(day0 + d), [170, 170, 170], 2);
  }
  text(px, w, h, 8, 8, `the weather at the opening place, ${days} days from ${steer.dateOfDay(day0)} (seed ${weather.seed})`, [255, 255, 255], 2);
  write('A-meteogram', { px, w, h });
}

// the land the weather stands on: the country, how proud the hills are, the hollows, the sites
function landMaps() {
  const view = makeView(null);
  const { w, h } = view;
  const draw = (name, label, pick, scale) => {
    const px = relief(view);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = view.place(x, y), v = pick(p.lat, p.lon) / scale;
      if (v <= 0.01) continue;
      over(px, w, (y * w + x) * 3, 255, 200, 90, 0.75 * Math.min(1, v));
    }
    text(px, w, h, 8, 8, label, [255, 255, 255], 2);
    write(`A-land-${name}`, { px, w, h });
  };
  draw('country', "the country (hC): the height the cloud bases stand over, m", (lat, lon) => LAND.atLatLon('hC', lat, lon), 3500);
  draw('prominence', 'how proud the hills stand over their country (hS - hC), m', (lat, lon) => Math.max(0, LAND.atLatLon('hS', lat, lon) - LAND.atLatLon('hC', lat, lon)), 700);
  draw('hollows', 'the hollows the fog lies in (hC - gmin), m', (lat, lon) => Math.max(0, LAND.atLatLon('hC', lat, lon) - LAND.atLatLon('gmin', lat, lon)), 1200);
  draw('coast', 'how far the sea is (m)', (lat, lon) => LAND.atLatLon('coast', lat, lon), 200000);
  // the sites and the summits
  {
    const px = relief(view);
    for (const s of LAND.sites) dot(px, w, h, Math.round(((s.lon / 360) % 1 + 1) % 1 * w), Math.round((90 - s.lat) / 180 * h), 2, s.kind === 1 ? [120, 200, 255] : [255, 120, 60], 0.9);
    for (const p of LAND.peaks) dot(px, w, h, Math.round(((p.lon / 360) % 1 + 1) % 1 * w), Math.round((90 - p.lat) / 180 * h), 1, [255, 255, 255], 1);
    text(px, w, h, 8, 8, `${LAND.sites.length} trigger sites (high ground, sea breeze) and ${LAND.peaks.length} summits`, [255, 255, 255], 2);
    write('A-land-sites', { px, w, h });
  }
}

// ---- what to draw -------------------------------------------------------------------------------

const ONLY = opt('only', null);
const hours = String(opt('hours', '6,9,12,15,18')).split(',').map(Number);
const span = num('span', 0);
if (flag('land')) landMaps();
else if (flag('lapse')) lapse();
else if (flag('meteogram')) meteogram();
else if (flag('scene')) {
  for (const date of ['2024-09-22', '2024-09-23', '2024-09-24']) dayMaps(date, hours, span || 0);
} else dayMaps(String(opt('day', '2024-09-22')), hours, span || 0);
console.log('sky-map: done');
