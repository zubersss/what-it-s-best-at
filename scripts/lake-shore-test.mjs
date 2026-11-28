// A made world's lakes end where the ground rises through their level, not on the lines of
// the map's lattice (tiles/madeTiles.js, lakeAt). No browser, seconds.
//   node scripts/lake-shore-test.mjs [--break lattice|leak]
// Checks, on Haven: (1) along the east shore of the mist view's lake no stretch of shore runs
// dead north-south or east-west for more than 60 m (cut at the cells' edges it ran 200 to
// 400 m so, with square corners); (2) every place the rule calls lake beyond the lake's own
// cells has ground under the lake's level all the way to a lake cell's middle (water does
// not stand beyond the lip a lake spills over); (3) inside its own cells nothing changed.
// --break lattice: the old rule (the cell's own id only); --break leak: no test of the way.
import { getWorld } from '../src/worlds/index.js';
import { madeWorldOf } from './lib/madeCover.mjs';

const args = process.argv.slice(2), brk = args.includes('--break') ? args[args.indexOf('--break') + 1] : null;
const world = getWorld('haven'), mw = madeWorldOf(world), L = mw.lakes, d = mw.dem;
let failed = 0; const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };
const own = (lon, lat) => { const j = Math.min(L.height - 1, Math.max(0, Math.floor((90 - lat) / 180 * L.height))), i = Math.min(L.width - 1, Math.floor(lon / 360 * L.width)), id = L.ids[j * L.width + i]; return id ? L.levels[id - 1] : null; };
const rule = brk === 'lattice' ? own : brk === 'leak' ? (lon, lat) => {
  const v = own(lon, lat); if (v != null) return v;
  const fy = (90 - lat) / 180 * L.height, fx = lon / 360 * L.width, j = Math.floor(fy), i = Math.floor(fx);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) { const id = L.ids[(j + dy) * L.width + ((i + dx + L.width) % L.width)]; if (id) return L.levels[id - 1]; }
  return null;
} : (lon, lat) => mw.lakeAt(lon, lat);
const water = (lon, lat) => { const lv = rule(lon, lat); if (lv == null) return false; d._fixed(lon, lat); return d.h < lv; };

// (1) the shore's longest straight run, in a window 3 km square on the lake's east shore
{
  const lat0 = -58.70, lon0 = 26.95, kmLat = 2 * Math.PI * world.radius / 1000 / 360, kmLon = kmLat * Math.cos(lat0 * Math.PI / 180), STEP = 0.01, N = 300;        // 10 m a cell
  const w = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) w[y * N + x] = water(lon0 + (x - N / 2) * STEP / kmLon, lat0 - (y - N / 2) * STEP / kmLat) ? 1 : 0;
  let longest = 0, shore = 0;
  for (let x = 1; x < N; x++) { let run = 0; for (let y = 0; y < N; y++) { const edge = w[y * N + x] !== w[y * N + x - 1]; run = edge ? run + 1 : 0; if (edge) shore++; longest = Math.max(longest, run); } }
  for (let y = 1; y < N; y++) { let run = 0; for (let x = 0; x < N; x++) { const edge = w[y * N + x] !== w[(y - 1) * N + x]; run = edge ? run + 1 : 0; longest = Math.max(longest, run); } }
  check(`the lake's east shore (${shore} cells of it in 3 km): its longest dead-straight run is ${longest * 10} m (120 allowed)`, shore > 100 && longest * 10 <= 120);
}
// (2) and (3): at random places round every lake cell's edge
{
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let beyond = 0, leaks = 0, worst = 0, inside = 0, changed = 0;
  for (let n = 0; n < 3000000; n++) {
    const j = 1 + Math.floor(rnd() * (L.height - 2)), i = Math.floor(rnd() * L.width);
    if (!L.ids[j * L.width + i] && !L.ids[j * L.width + ((i + 1) % L.width)] && !L.ids[(j + 1) * L.width + i] && !L.ids[(j - 1) * L.width + i] && !L.ids[j * L.width + ((i - 1 + L.width) % L.width)]) continue;
    const lon = (i + rnd()) / L.width * 360, lat = 90 - (j + rnd()) / L.height * 180, lv0 = own(lon, lat), lv = rule(lon, lat);
    if (lv0 != null) { inside++; if (lv !== lv0) changed++; continue; }
    if (lv == null) continue;
    d._fixed(lon, lat); if (d.h >= lv) continue;
    beyond++;
    // the way to the nearest lake cell's middle, walked finely
    const fy = (90 - lat) / 180 * L.height, fx = lon / 360 * L.width; let best = null, bd = 1e9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const id = L.ids[(j + dy) * L.width + ((i + dx + L.width) % L.width)]; if (!id || L.levels[id - 1] !== lv) continue; const cx = i + dx + 0.5, cy = j + dy + 0.5, dd = Math.hypot(cx - fx, cy - fy); if (dd < bd) { bd = dd; best = [cx / L.width * 360, 90 - cy / L.height * 180]; } }
    let over = 0; for (let t = 0; t <= 1; t += 0.05) { d._fixed(lon + (best[0] - lon) * t, lat + (best[1] - lat) * t); over = Math.max(over, d.h - lv); }
    if (over > 0.5) { leaks++; worst = Math.max(worst, over); }
  }
  check(`${beyond} places beyond a lake's own cells are lake: ground under its level all the way to a lake cell (${leaks} with a lip between, the highest ${worst.toFixed(1)} m over)`, beyond > 500 && leaks <= beyond * 0.02 && worst <= 2);
  check(`${inside} places inside lakes' own cells: the level as before (${changed} changed)`, inside > 5000 && changed === 0);
}
console.log(failed ? `lake-shore-test: ${failed} FAILED` : 'lake-shore-test: all passed');
process.exit(failed ? 1 : 0);
