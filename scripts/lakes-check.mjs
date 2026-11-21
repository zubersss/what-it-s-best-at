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
import { createHeightSource } from '../src/terrain/height/heightSource.js';
import earth from '../src/worlds/earth.js';
import { mosaic, REPO, TILE, RAD } from './lib/earthTiles.mjs';

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
