// Earth's lakes against the real ones, without a browser: the tile worker's own path
// (elevation mosaic, sea bed, hydrology.js) run in Node on a few regions of the world, and
// what comes out compared with what is there.
//
//   node scripts/lakes-check.mjs            every region
//   node scripts/lakes-check.mjs utah alps  some of them
//   --list                                   print each region's twelve largest lakes
//
// Checks: each named lake is found, within a factor of its real area (the part inside the
// mosaic); each named place that is land has no lake on it; no region is drowned (lake
// area under a limit); the drawn surface has no step at the edges of the water.
// Exits non-zero on any failure.
//
// Tiles come from the test mirror's cache (/root/mapcache/ext, or EXT_CACHE), fetched with
// curl on a miss (needs s3.amazonaws.com). The water map is a JPEG: it is turned into
// plain bytes once with python3 and Pillow.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hydrology, packWater, seaBed, despike } from '../src/terrain/tiles/hydrology.js';
import { createHeightSource } from '../src/terrain/height/heightSource.js';
import earth from '../src/worlds/earth.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = process.env.EXT_CACHE || '/root/mapcache/ext';
const HOST = 's3.amazonaws.com/elevation-tiles-prod/terrarium';
const TILE = 256, N = 4, RAD = 180 / Math.PI;
const args = process.argv.slice(2), LIST = args.includes('--list'), only = args.filter((a) => !a.startsWith('--'));

// Regions: a mosaic (zoom, lat and lon of its middle), what a river is there (m3/s), the
// lakes that must be found { name, lat, lon, km2 (real), part (the share inside the
// mosaic, if not all) }, places that must be land, and the most lake there may be (km2).
const REGIONS = {
  utah: { zoom: 6, lat: 38.5, lon: -113, minFlow: 1500, most: 14000,
    lakes: [{ name: 'Great Salt Lake', lat: 41.2, lon: -112.7, km2: 3500 }],          // (2 300 to 4 400 km2 over the years)
    land: [{ name: 'Carson Sink', lat: 39.8, lon: -118.5 }, { name: "Tulare's dry bed", lat: 36.1, lon: -119.8 }, { name: 'the Snake River Plain', lat: 43.6, lon: -116.6 }, { name: 'Black Rock Desert', lat: 40.9, lon: -119.0 }] },
  greatLakes: { zoom: 6, lat: 46, lon: -80, minFlow: 1500, most: 260000,
    lakes: [{ name: 'Superior', lat: 47.6, lon: -87.3, km2: 82100 }, { name: 'Michigan', lat: 44.0, lon: -86.8, km2: 58000 }, { name: 'Huron', lat: 44.8, lon: -82.2, km2: 59600 }, { name: 'Erie', lat: 42.1, lon: -81.3, km2: 25700 }, { name: 'Ontario', lat: 43.7, lon: -77.8, km2: 19000 }],
    land: [] },
  alps: { zoom: 6, lat: 47, lon: 12, minFlow: 1500, most: 6000,
    lakes: [],
    land: [{ name: "the Tisza's plain", lat: 45.3, lon: 20.9 }, { name: 'the Hungarian plain', lat: 47.3, lon: 20.2 }, { name: 'the Po plain', lat: 45.1, lon: 10.5 }] },
  africa: { zoom: 6, lat: 0, lon: 34, minFlow: 1500, most: 220000,
    lakes: [{ name: 'Victoria', lat: -1.1, lon: 32.9, km2: 68800 }, { name: 'Tanganyika', lat: -6.3, lon: 29.9, km2: 32900 }, { name: 'Turkana', lat: 3.7, lon: 36.1, km2: 6400 }],
    land: [] },
  vermont: { zoom: 9, lat: 44.1, lon: -72.4, minFlow: 60, most: 2600,
    lakes: [{ name: 'Champlain', lat: 44.6, lon: -73.3, km2: 1269 }, { name: 'Winnipesaukee', lat: 43.6, lon: -71.3, km2: 180, part: 0.3 }],          // (islands and bays finer than a cell: only its open middle is level)
    land: [] },
  tahoe: { zoom: 9, lat: 39.6, lon: -120.2, minFlow: 60, most: 2600,
    lakes: [{ name: 'Tahoe', lat: 39.1, lon: -120.0, km2: 490 }, { name: 'Pyramid Lake', lat: 40.1, lon: -119.6, km2: 487 }],
    land: [] },
  canyon: { zoom: 9, lat: 36.3, lon: -112.5, minFlow: 60, most: 400,
    lakes: [],
    land: [{ name: 'the Little Colorado valley', lat: 35.8, lon: -111.3 }, { name: 'the Painted Desert', lat: 36.0, lon: -111.1 }] },
  titicaca: { zoom: 9, lat: -15.9, lon: -69.4, minFlow: 60, most: 9500,
    lakes: [{ name: 'Titicaca', lat: -15.8, lon: -69.4, km2: 8370 }],
    land: [] },
  vermontNear: { zoom: 12, lat: 44.1, lon: -72.6, minFlow: 0.5, most: 12, layers: true, lakes: [], land: [] },
};

function png(file) {
  const b = fs.readFileSync(file); let p = 8, w = 0, h = 0, ct = 0; const idat = []; let plte = null;
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error('a PNG this reader does not know'); } else if (type === 'IDAT') idat.push(d); else if (type === 'PLTE') plte = d;
    p += 12 + len;
  }
  const ch = ct === 2 ? 3 : ct === 6 ? 4 : 1, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8Array(w * h * 3), cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], o = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, bb = prev[x], c = x >= ch ? prev[x - ch] : 0, v = raw[o + x]; let r;
      if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + bb; else if (f === 3) r = v + ((a + bb) >> 1); else { const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c); }
      cur[x] = r & 255;
    }
    for (let x = 0; x < w; x++) { const q = (y * w + x) * 3; if (ct === 3) { const i = cur[x] * 3; out[q] = plte[i]; out[q + 1] = plte[i + 1]; out[q + 2] = plte[i + 2]; } else { out[q] = cur[x * ch]; out[q + 1] = cur[x * ch + 1]; out[q + 2] = cur[x * ch + 2]; } }
    prev.set(cur);
  }
  return out;
}

function tileFile(z, x, y) {
  const f = `${EXT}/${HOST}/${z}/${x}/${y}.png`;
  if (!fs.existsSync(f) || fs.statSync(f).size === 0) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    execFileSync('curl', ['-sf', '--max-time', '60', '--retry', '2', '-o', f, `https://${HOST}/${z}/${x}/${y}.png`]);
  }
  return f;
}

const rain = new Uint8Array(fs.readFileSync(REPO + '/public/data/earth_rain_720.u8'));
function waterMap() {
  const f = `${EXT}/earth_water_2048.u8`;
  if (!fs.existsSync(f)) {
    fs.mkdirSync(EXT, { recursive: true });
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("L")\nassert im.size == (2048, 1024)\nopen(sys.argv[2], "wb").write(im.tobytes())', REPO + '/public/' + earth.terrain.tiles.hydrology.water, f]);
  }
  return fs.readFileSync(f);
}
const seen = waterMap();

// The tile worker's elevation path for a mosaic of N x N tiles round a place.
function mosaic(zoom, lat, lon, minFlow) {
  const n = 2 ** zoom, W = N * TILE;
  const fx = (lon + 180) / 360 * n, fy = (1 - Math.log(Math.tan(Math.PI / 4 + lat / RAD / 2)) / Math.PI) / 2 * n;
  const tx = Math.round(fx) - N / 2, ty = Math.round(fy) - N / 2, h = new Int16Array(W * W);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d = png(tileFile(zoom, ((tx + i) % n + n) % n, ty + j));
    for (let y = 0; y < TILE; y++) for (let x = 0, o = (j * TILE + y) * W + i * TILE, q = y * TILE * 3; x < TILE; x++, q += 3) { const v = d[q] * 256 + d[q + 1] + d[q + 2] / 256 - 32768; h[o + x] = v > 32767 ? 32767 : v < -32768 ? -32768 : Math.round(v); }
  }
  const latOf = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + y / TILE) / n))) * RAD, lonOf = (x) => (tx + x / TILE) / n * 360 - 180;
  const cell = 40075016 / (TILE * n) * Math.cos(latOf(W / 2) / RAD);
  despike(h, W, cell);
  seaBed(h, W, cell);
  const raw = h.slice();
  const res = hydrology(h, W, cell, (x, y) => { const v = rain[Math.min(359, Math.max(0, Math.floor((90 - latOf(y)) * 2))) * 720 + ((Math.floor((lonOf(x) + 180) * 2) % 720) + 720) % 720] / 3.2; return v * v; }, {
    minFlow, lat: latOf,
    water: (x, y) => seen[Math.min(1023, Math.max(0, Math.floor((90 - latOf(y)) / 180 * 1024))) * 2048 + ((Math.floor((lonOf(x) + 180) / 360 * 2048) % 2048) + 2048) % 2048],
  });
  const lake = res.lake.slice(), packed = packWater(res, h);
  return { zoom, tx, ty, W, cell, h, raw, lake, res, packed, latOf, lonOf, px: (lo) => ((lo + 180) / 360 * n - tx) * TILE, py: (la) => ((1 - Math.log(Math.tan(Math.PI / 4 + la / RAD / 2)) / Math.PI) / 2 * n - ty) * TILE };
}

// Every lake of a mosaic: its area, its middle, its level.
function lakesOf(m) {
  const { W, lake, cell } = m, id = new Int32Array(W * W), list = [];
  for (let s = 0; s < W * W; s++) {
    if (!lake[s] || id[s]) continue;
    const me = list.length + 1, st = [s]; id[s] = me; let cells = 0, sx = 0, sy = 0;
    while (st.length) {
      const c = st.pop(), x = c % W, y = (c - x) / W; cells++; sx += x; sy += y;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const xx = x + a, yy = y + b; if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue; const j = yy * W + xx; if (lake[j] === lake[c] && !id[j]) { id[j] = me; st.push(j); } }
    }
    list.push({ km2: cells * cell * cell / 1e6, lat: m.latOf(sy / cells), lon: m.lonOf(sx / cells), level: lake[s] / 4 - 500 });
  }
  return { id, list };
}

// The drawn surface across the cell edges where water begins, ends or changes: the largest step (m).
function steps(m, layers) {
  const R = earth.radius, bundled = new Int16Array(fs.readFileSync(REPO + '/public/data/earth_dem_4ppd.i16').buffer.slice(0));
  const hs = createHeightSource({ radius: R, terrain: { ...earth.terrain, layers: layers ? earth.terrain.layers : [{ op: 'dem' }, { op: 'sea', level: 0 }] } }, [{ data: bundled, width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true }]);
  hs.setRing(0, { data: m.h, width: m.W, height: m.W, zoom: m.zoom, tx: m.tx, ty: m.ty, water: m.packed });
  const n = 2 ** m.zoom, W = m.W, lake = m.packed.lake; let worst = 0, count = 0, at = null;
  if (!lake) return { worst, count, at };
  const height = (px, py) => { const lon = ((m.tx + px / TILE) / n * 360 - 180) / RAD, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (m.ty + py / TILE) / n))), c = Math.cos(lat); return hs.height(c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat), 1); };
  for (let y = 60; y < W - 60; y++) for (let x = 60; x < W - 60; x++) {
    const i = y * W + x;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      // (where the lake raster changes, where the bed crosses the sea's level, and one edge in
      // twenty-five of all the rest)
      const j = i + dx + dy * W;
      if (lake[i] === lake[j] && (m.h[i] <= 0) === (m.h[j] <= 0) && (x % 5 || y % 5)) continue;
      for (const t of [0.2, 0.5, 0.8]) {
        // (two places a thousandth of a pixel apart, either side of the edge: a step is a rise
        // between them steeper than 80 degrees; a steep bank is not one)
        const ex = dx ? x + 1 : x + t, ey = dy ? y + 1 : y + t, e = 0.0005;
        const s = Math.abs(height(ex - dx * e, ey - dy * e) - height(ex + dx * e, ey + dy * e)) - 2 * e * m.cell * 5.67;
        count++; if (s > worst) { worst = s; at = [ex, ey]; }
      }
    }
  }
  return { worst, count, at };
}

let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) failed++; };
for (const [name, r] of Object.entries(REGIONS)) {
  if (only.length && !only.includes(name)) continue;
  const m = mosaic(r.zoom, r.lat, r.lon, r.minFlow), { id, list } = lakesOf(m), W = m.W;
  const total = list.reduce((a, l) => a + l.km2, 0), box = W * W * m.cell * m.cell / 1e6;
  console.log(`\n${name}: zoom ${r.zoom}, ${Math.round(Math.sqrt(box))} km square, ${list.length} lakes, ${Math.round(total)} km2 of water; ${m.res.rivers.length} rivers`);
  if (LIST) for (const l of [...list].sort((a, b) => b.km2 - a.km2).slice(0, 12)) console.log(`       ${Math.round(l.km2).toString().padStart(7)} km2 at ${l.lat.toFixed(1)}, ${l.lon.toFixed(1)}, level ${l.level.toFixed(0)} m`);
  // (a place's lake: the largest within a few cells of it)
  const near = (lat, lon, reach) => { const x0 = Math.round(m.px(lon)), y0 = Math.round(m.py(lat)); let best = null; for (let y = Math.max(0, y0 - reach); y <= Math.min(W - 1, y0 + reach); y++) for (let x = Math.max(0, x0 - reach); x <= Math.min(W - 1, x0 + reach); x++) { const k = id[y * W + x]; if (k && (!best || list[k - 1].km2 > best.km2)) best = list[k - 1]; } return best; };
  for (const l of r.lakes) {
    // (a lake pinched in two by a narrow or an island is two in the list: all that lies at
    // its level within 150 km counts)
    const got = near(l.lat, l.lon, 8), want = l.km2 * (l.part ?? 1);
    let km2 = 0; if (got) for (const o of list) if (Math.abs(o.level - got.level) <= 2 && Math.hypot(o.lat - got.lat, (o.lon - got.lon) * Math.cos(got.lat / RAD)) < 1.35) km2 += o.km2;
    check(got && km2 > 0.55 * want && km2 < 1.35 * want, `${l.name}: ${got ? Math.round(km2) + ' km2 at ' + got.level.toFixed(0) + ' m' : 'not found'} (real ${Math.round(l.km2)} km2${l.part ? ', of which ' + Math.round(want) + ' can be found' : ''})`);
  }
  for (const p of r.land) { const got = near(p.lat, p.lon, 3); check(!got, `${p.name} is land${got ? ': a lake of ' + Math.round(got.km2) + ' km2 at ' + got.level.toFixed(0) + ' m' : ''}`); }
  check(total <= r.most, `not drowned: ${Math.round(total)} km2 of lake (limit ${r.most})`);
  const st = steps(m, !!r.layers);
  check(st.worst < 0.3, `no step in the drawn surface at the water's edges${r.layers ? " (Earth's own layers)" : ''}: largest ${Math.max(0, st.worst).toFixed(2)} m over ${st.count} places${st.at && st.worst >= 0.3 ? ' at pixel ' + st.at.map((v) => v.toFixed(1)).join(', ') : ''}`);
  // rivers never stand above the ground they run on (a metre for the rounding of the line)
  let high = 0; for (const rv of m.res.rivers) for (let i = 0; i < rv.pts.length; i += 4) { const c = Math.floor(rv.pts[i + 1]) * W + Math.floor(rv.pts[i]); if (!m.lake[c] && m.raw[c] > 0 && rv.pts[i + 2] - m.raw[c] > high) high = rv.pts[i + 2] - m.raw[c]; }
  // (judged where the traveller is near: from far off a river crossing a hollow the flood
  // filled runs along its side, above the hollow's floor)
  if (r.zoom >= 12) check(high < 6, `rivers do not stand above their ground: at most ${high.toFixed(1)} m`);
  else console.log(`     (rivers stand above the ground beside them by at most ${high.toFixed(1)} m)`);
}
console.log(failed ? `\nlakes check FAILED (${failed})` : '\nlakes check passed');
process.exit(failed ? 1 : 0);
