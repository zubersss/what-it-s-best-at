// Haven's rivers without a browser (seconds): the three mosaics the game keeps round a
// place, worked out by the tile worker's own path (scripts/lib/havenWater.mjs).
//
//   node scripts/haven-rivers.mjs --lat -48.55 --lon 49.06          the rivers of the finest mosaic there, largest first
//   ... --follow 2 [--every 150]     points along river 2 of that list: place, level, width, depth, speed, the way it runs
//   ... --map out.png [--span 4000] [--px 640]   the water round the place from straight above (relief, lakes, rivers by speed, falls)
//   ... --check                      the promises (exits non-zero if one is broken), at the place or at the built-in places
//
// Promises checked: the water's level never rises along a stretch and stretches follow one
// another down stream; the flow the height code answers in a river points down its line
// and is the stretch's speed in mid stream; no river stands in the air or runs in a trench
// (its level against the ground beside it).
import { ringsAt, havenSource, dirOf, haven, RAD } from './lib/havenWater.mjs';
import { RIVER_STRIDE, RING_INSET } from '../src/terrain/height/dem.js';
import { FLOW_MIN, FLOW_MAX, JOIN_NEAR } from '../src/terrain/tiles/hydrology.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes('--' + k);
const S = RIVER_STRIDE;

function riversOf(m) {
  return m.res.rivers.map((r, id) => {
    const p = r.pts, n = p.length / 4; let q = 0, len = 0;
    for (let i = 0; i < n; i++) { q = Math.max(q, p[i * 4 + 3]); if (i) len += Math.hypot(p[i * 4] - p[i * 4 - 4], p[i * 4 + 1] - p[i * 4 - 3]) * m.cell; }
    return { id, p, n, q, len, top: p[2], foot: p[(n - 1) * 4 + 2] };
  }).sort((a, b) => b.q - a.q);
}

function list(lat, lon) {
  const rings = ringsAt(lat, lon), m = rings[rings.length - 1];
  for (const r of rings) console.log(`mosaic at zoom ${r.zoom} (${r.cell.toFixed(0)} m a pixel): ${r.packed.info.rivers} rivers, ${r.packed.info.stretches} stretches, largest flow ${r.packed.info.flow.toFixed(1)} m3/s`);
  const rs = riversOf(m);
  rs.slice(0, 20).forEach((r, k) => {
    const mid = (r.n >> 1) * 4;
    console.log(`${String(k).padStart(2)}: ${r.q.toFixed(1).padStart(6)} m3/s, ${(r.len / 1000).toFixed(1)} km, from ${r.top.toFixed(0)} m down to ${r.foot.toFixed(0)} m; its middle at lat ${m.g.latOf(r.p[mid + 1] - 0.5).toFixed(4)} lon ${m.g.lonOf(r.p[mid] - 0.5).toFixed(4)}`);
  });
  const k = arg('follow', null);
  if (k != null) {
    const r = rs[+k], every = +arg('every', 150), hs = havenSource(rings); let next = 0, along = 0;
    for (let i = 0; i < r.n; i++) {
      if (i) along += Math.hypot(r.p[i * 4] - r.p[i * 4 - 4], r.p[i * 4 + 1] - r.p[i * 4 - 3]) * m.cell;
      if (along < next) continue; next += every;
      const la = m.g.latOf(r.p[i * 4 + 1] - 0.5), lo = m.g.lonOf(r.p[i * 4] - 0.5), d = dirOf(la, lo);
      const h = hs.height(d[0], d[1], d[2], 1), sp = Math.hypot(hs.flowE, hs.flowN), head = (Math.atan2(hs.flowE, hs.flowN) * RAD + 360) % 360;
      console.log(`  ${(along / 1000).toFixed(2)} km: lat ${la.toFixed(5)} lon ${lo.toFixed(5)}, level ${h.toFixed(1)} m, ${r.p[i * 4 + 3].toFixed(1)} m3/s, depth ${hs.waterDepth.toFixed(2)} m, runs at ${sp.toFixed(2)} m/s toward ${head.toFixed(0)} deg`);
    }
  }
}

// --- the promises
function check(lat, lon, name) {
  const rings = ringsAt(lat, lon), hs = havenSource(rings), fails = [];
  let stretches = 0, asked = 0, wet = 0, worstRise = 0, worstTurn = 0, air = 0, trench = 0, worstAir = 0, worstTrench = 0;
  rings.forEach((m, slot) => {
    const sg = m.packed.segs;
    for (let o = 0; o < sg.length; o += S) {
      stretches++;
      const rise = sg[o + 5] - sg[o + 4]; if (rise > worstRise) worstRise = rise;
      if (!(sg[o + 10] >= FLOW_MIN - 1e-6 && sg[o + 10] <= FLOW_MAX + 1e-6 && sg[o + 11] >= FLOW_MIN - 1e-6 && sg[o + 11] <= FLOW_MAX + 1e-6)) fails.push(`${name}: zoom ${m.zoom}: a stretch's speed is ${sg[o + 10]} / ${sg[o + 11]} m/s`);
      // (the way it runs at each end against the stretch's own line)
      const line = Math.atan2(-(sg[o + 3] - sg[o + 1]), sg[o + 2] - sg[o]);
      for (const a of [sg[o + 12], sg[o + 13]]) { let d = Math.abs(a - line); d = Math.min(d, 2 * Math.PI - d); if (d > worstTurn) worstTurn = d; }
    }
  });
  if (worstRise > 1e-3) fails.push(`${name}: the water's level rises along a stretch by ${worstRise.toFixed(3)} m`);
  if (worstTurn > 1.6) fails.push(`${name}: a stretch's flow is turned ${(worstTurn * RAD).toFixed(0)} degrees off its line`);
  // In the game's height source (finest ring that knows the place answers): in mid stream of
  // every 7th stretch of the finest mosaic, well inside it, the flow runs down the line at
  // the stretch's speed, and the water lies on its ground.
  const m = rings[rings.length - 1], sg = m.packed.segs;
  for (let o = 0; o < sg.length; o += S * 7) {
    const x = (sg[o] + sg[o + 2]) / 2, y = (sg[o + 1] + sg[o + 3]) / 2;
    if (x < 40 || y < 40 || x > m.W - 40 || y > m.W - 40) continue;
    const la = m.g.latOf(y - 0.5), lo = m.g.lonOf(x - 0.5), d = dirOf(la, lo);
    hs.height(d[0], d[1], d[2], 1); asked++;
    if (hs.waterDepth <= 0) continue;
    const sp = Math.hypot(hs.flowE, hs.flowN);
    if (sp <= 0) continue;                                   // (a lake's water lies over this stretch's line)
    wet++;
    const line = Math.atan2(-(sg[o + 3] - sg[o + 1]), sg[o + 2] - sg[o]), got = Math.atan2(hs.flowN, hs.flowE);
    let dd = Math.abs(got - line); dd = Math.min(dd, 2 * Math.PI - dd);
    // (another stretch may be the nearer one at a confluence: only a flow against the line is a fault)
    if (dd > 2.2 && sp > 0.5) fails.push(`${name}: at lat ${la.toFixed(4)} lon ${lo.toFixed(4)} the water runs ${(dd * RAD).toFixed(0)} degrees off its stretch (up stream)`);
    if (sp > FLOW_MAX + 1e-6) fails.push(`${name}: at lat ${la.toFixed(4)} lon ${lo.toFixed(4)} the water runs at ${sp.toFixed(1)} m/s`);
  }
  if (wet < 20) fails.push(`${name}: only ${wet} places in running water were found (of ${asked} asked): the check checks nothing`);
  console.log(`${name}: ${stretches} stretches in ${rings.length} mosaics; ${wet} places asked in running water; largest rise along a stretch ${worstRise.toFixed(4)} m; flow at most ${(worstTurn * RAD).toFixed(0)} degrees off a stretch's line`);
  return fails;
}

// Where the rivers of a coarser mosaic cross the edge of the box a finer one answers for:
// how far the finer mosaic's nearest river is from that crossing (m), how far apart their
// levels (m) and their widths (the ratio).
function gates(coarse, fine) {
  const s = 2 ** (coarse.zoom - fine.zoom), ox = fine.tx * 256 * s - coarse.tx * 256, oy = fine.ty * 256 * s - coarse.ty * 256;
  const cs = coarse.packed.segs, fs = fine.packed.segs, W = fine.W, G = W >> 3, in0 = RING_INSET, in1 = W - RING_INSET, out = [];
  const inside = (x, y) => x >= in0 && y >= in0 && x <= in1 && y <= in1;
  for (let o = 0; o < cs.length; o += S) {
    const ax = (cs[o] - ox) / s, ay = (cs[o + 1] - oy) / s, bx = (cs[o + 2] - ox) / s, by = (cs[o + 3] - oy) / s, ia = inside(ax, ay), ib = inside(bx, by);
    if (ia === ib) continue;
    // (where the stretch crosses the box's edge: bisected)
    let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { const t = (lo + hi) / 2; if (inside(ax + (bx - ax) * t, ay + (by - ay) * t) === ia) lo = t; else hi = t; }
    const t = (lo + hi) / 2, gx = ax + (bx - ax) * t, gy = ay + (by - ay) * t, level = cs[o + 4] + (cs[o + 5] - cs[o + 4]) * t, half = cs[o + 6] + (cs[o + 7] - cs[o + 6]) * t;
    let best = 1e9, bl = 0, bh = 0;
    const c0x = Math.max(0, (gx >> 3) - 1), c1x = Math.min(G - 1, (gx >> 3) + 1), c0y = Math.max(0, (gy >> 3) - 1), c1y = Math.min(G - 1, (gy >> 3) + 1);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) for (let q = fine.packed.gridStart[cy * G + cx], e = fine.packed.gridStart[cy * G + cx + 1]; q < e; q++) {
      const f = fine.packed.gridItems[q] * S, px = fs[f], py = fs[f + 1], dx = fs[f + 2] - px, dy = fs[f + 3] - py;
      let u = ((gx - px) * dx + (gy - py) * dy) / (dx * dx + dy * dy || 1); u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(gx - px - dx * u, gy - py - dy * u) * fine.cell;
      if (d < best) { best = d; bl = fs[f + 4] + (fs[f + 5] - fs[f + 4]) * u; bh = fs[f + 6] + (fs[f + 7] - fs[f + 6]) * u; }
    }
    // (sound: the coarser river lies on this mosaic's ground there. Not sound: it crosses a
    // hollow this mosaic fills, a lake of this mosaic, or runs far over or under the ground:
    // a coarse map's river can, and there is nothing to meet.)
    // (the lowest ground of this mosaic within a pixel of the crossing: its valley's floor there)
    let lake = false, low = 1e9;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const c = Math.min(W - 1, Math.max(0, Math.floor(gy) + b)) * W + Math.min(W - 1, Math.max(0, Math.floor(gx) + a)); if (fine.res.lake[c]) lake = true; if (fine.h[c] < low) low = fine.h[c]; }
    // (and a coarse map's river can hang tens of metres over a hollow its own cells do not see,
    // or run through a rise they do not see: the finer mosaic's water goes round, as water would)
    const sound = !lake && Math.abs(level - low) <= 30, near = Math.abs(level - low) <= JOIN_NEAR;
    out.push({ lat: fine.g.latOf(gy - 0.5), lon: fine.g.lonOf(gx - 0.5), half, apart: best, step: best < 1e8 ? Math.abs(bl - level) : 0, width: best < 1e8 ? bh / half : 0, into: ib, sound, near, level, low });
  }
  return out;
}
// The promise: every river of a coarser mosaic that crosses a finer one's box is met there
// by a river of the finer one, on its line, at its level.
let total = 0, unmet = 0;
function checkJoin(lat, lon, name, join = true) {
  const rings = ringsAt(lat, lon, { join }), fails = [];
  for (let k = 1; k < rings.length; k++) {
    const g = gates(rings[k - 1], rings[k]);
    let worst = 0, worstStep = 0, lost = 0, off = 0;
    const unsound = g.filter((a) => !a.sound).length, far = g.filter((a) => a.sound && !a.near).length;
    for (const a of g) {
      if (!a.sound) continue;
      const bad = a.apart > 1e8 || a.apart > Math.max(8, a.half, 0.4 * rings[k].cell);          // (on its line: inside the coarser river's own water, or 8 m for a brook, or what a pixel of this mosaic can say)
      if (a.apart > 1e8) lost++; else { if (bad) off++; if (a.apart > worst) worst = a.apart; if (!bad && a.near && a.step > worstStep) worstStep = a.step; }
      if (has('gates') || (bad && join)) console.log(`    ${bad ? 'NOT MET' : 'met'} at lat ${a.lat.toFixed(4)} lon ${a.lon.toFixed(4)} (${a.into ? 'coming in' : 'going out'}): the coarser river ${(2 * a.half).toFixed(0)} m wide at ${a.level.toFixed(1)} m (ground there ${a.low.toFixed(1)} m), the finer ${a.apart > 1e8 ? 'none near' : a.apart.toFixed(1) + ' m off, its level ' + a.step.toFixed(2) + ' m apart'}`);
    }
    console.log(`${name}: zoom ${rings[k - 1].zoom} into ${rings[k].zoom}${join ? '' : ' (not joined)'}: ${g.length} rivers cross the box's edge (${unsound} of them into a lake of this mosaic, or more than 30 m over or under its ground: not counted; ${far} more than ${JOIN_NEAR} m off this mosaic's ground: their levels are not met); ${lost} met by none, ${off} met off their line; the worst met ${worst.toFixed(1)} m off its line, the largest step in level ${worstStep.toFixed(2)} m`);
    total += g.length - unsound; unmet += lost + off;
    if (worstStep > 3) fails.push(`${name}: zoom ${rings[k - 1].zoom} into ${rings[k].zoom}: a river's level steps ${worstStep.toFixed(1)} m at the edge`);
  }
  return fails;
}

// --map file.png [--span 4000] [--px 640]: the water round the place from straight above, as
// the height code answers it (the game's own ground and rings): relief in grey, lakes and
// the sea in blue, rivers by how fast they run (slow: dark teal, fast: pale), falls white.
async function map(lat, lon, file) {
  const { png } = await import('./lib/png.mjs'); const fs = await import('node:fs');
  const span = +arg('span', 4000), N = +arg('px', 640), rings = ringsAt(lat, lon), hs = havenSource(rings), R = haven.radius;
  const img = new Uint8Array(N * N * 3), H = new Float32Array(N * N), mLat = R / RAD, mLon = mLat * Math.cos(lat / RAD);
  const wl = Math.max(1, span / N);
  let wet = 0, run = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d = dirOf(lat + (0.5 - j / N) * span / mLat, lon + (i / N - 0.5) * span / mLon), h = hs.height(d[0], d[1], d[2], wl), o = (j * N + i) * 3;
    H[j * N + i] = h;
    if (hs.waterDepth > 0) {
      wet++;
      const v = Math.hypot(hs.flowE, hs.flowN);
      if (v > 0) { run++; const t = Math.min(1, v / 5.5), fall = v > 6 ? 1 : 0; img[o] = 20 + 200 * t + 35 * fall; img[o + 1] = 90 + 140 * t + 25 * fall; img[o + 2] = 110 + 120 * t + 25 * fall; }
      else { const k = Math.exp(-hs.waterDepth / 6); img[o] = 20 + 50 * k; img[o + 1] = 50 + 90 * k; img[o + 2] = 110 + 80 * k; }
      H[j * N + i] = NaN;
    }
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = j * N + i; if (Number.isNaN(H[c])) continue;
    const a = H[c - (i > 0 ? 1 : 0)], b = H[c - (j > 0 ? N : 0)], sh = Number.isNaN(a) || Number.isNaN(b) ? 0 : ((a - H[c]) + (b - H[c])) / wl;
    const v = Math.max(30, Math.min(235, 150 + 260 * sh));
    img[c * 3] = v; img[c * 3 + 1] = v; img[c * 3 + 2] = v * 0.92;
  }
  fs.writeFileSync(file, png(N, N, img));
  console.log(`${file}: ${span} m across, ${(span / N).toFixed(1)} m a pixel; water on ${(100 * wet / (N * N)).toFixed(1)} % of it, running water on ${(100 * run / (N * N)).toFixed(1)} %`);
}

const PLACES = [['the opening place', -48.54992, 49.05567], ['Longwater', -10.77, 253.7], ['the golden shore', 18.501, 132.671], ['the north wood', 22.983, 129.507], ['the river south of the opening place', -51.95908, 48.94203], ['the Deepwell', -31.07, 17.45], ['the steppe', -54.4271, 39.2697]];
if (has('check')) {
  const at = arg('lat', null) != null ? [['the place asked', +arg('lat'), +arg('lon')]] : PLACES;
  const fails = at.flatMap(([n, la, lo]) => [...check(la, lo, n), ...checkJoin(la, lo, n, !has('unjoined'))]);
  if (unmet > 0.15 * total) fails.push(`${unmet} of the ${total} rivers that cross a box's edge are not met there by the finer mosaic's`);
  console.log(`rivers across the edges between mosaics: ${total - unmet} of ${total} met`);
  if (total < 6) fails.push(`only ${total} rivers were found crossing a box's edge on sound ground: the check of the edges checks nothing`);
  for (const f of fails.slice(0, 30)) console.log('FAIL ' + f);
  console.log(fails.length ? `${fails.length} failures` : 'rivers: all promises kept');
  process.exit(fails.length ? 1 : 0);
} else if (arg('map', null)) await map(+arg('lat', -48.54992), +arg('lon', 49.05567), arg('map'));
else list(+arg('lat', -48.54992), +arg('lon', 49.05567));
