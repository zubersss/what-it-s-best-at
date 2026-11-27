// Where water runs and stands, worked out from the shape of the land: a square elevation
// mosaic in, rivers (as lines with a width and a level) and lakes (as a raster of water
// levels) out. Plain arrays only: it runs in the tile worker and in Node.
//
// The method is the textbook one. Every cell is given a way out to the sea or to the
// mosaic's edge by flooding inward from there in order of height (priority-flood: Barnes,
// Lehman and Mulla 2014), which also fills the pits; water then runs down the steepest
// way on the filled land. Each cell sheds the rain that falls on it less what the air
// takes back; adding that up along the way down gives every cell the flow of a year.
// A cell is river where that flow is enough.
//
// Lakes are read from the elevation itself, not made by the flood: every real lake, great
// or small, lies in the elevation set as a stretch of exactly level cells (its water's
// surface, as the radar saw it). A pit that only the flood fills is nearly always a valley
// whose gorge is narrower than a cell: filled, the Snake River Plain and half of Nevada
// stood under water. So a level stretch is a lake if it lies in a hollow and the water it
// loses to the air can come in (a dry lake bed is level too), and a large one if it was
// seen as water from space; a filled pit is one only where the map is fine
// enough to trust and the pit shallow and in wet country (a pond the radar left rough);
// and a river cuts through the pits it meets, as rivers have.
//
// A mosaic is a window: a river that comes in over its edge brought its water from
// outside. The coarser mosaic's result says how much and where (opts.coarse).

import { RIVER_STRIDE, RING_INSET, RIVER_REACH } from '../height/dem.js';

// Rain to run-off (mm a year): dry land gives none back, wet land about half.
export function runoff(mm) { const k = (mm - 150) / 1400; return mm * (k < 0 ? 0 : k > 0.55 ? 0.55 : k); }
// A river's width (m) and depth (m) from its mean flow (m3/s): hydraulic geometry.
export function riverWidth(q) { return 5.5 * Math.sqrt(q); }
export function riverDepth(q) { return 0.32 * Math.pow(q, 0.33); }
// How fast a river runs in mid stream (m/s) by the fall of its water (m a metre) and its
// depth (m): Manning's rule for a bed of boulders and steps (a mountain brook on a slope of
// one in six runs at some 3 m/s, not at the 5 a smooth channel would give). Never quite
// still (a pool drifts); faster than FLOW_RUN only at a fall and in the pool at its foot. The one rule of a river's speed: the
// stretches carry it (packWater), the height code hands it on (DemSet, flowAcross), the
// ground's picture and whatever the water carries read it there.
export const FLOW_MIN = 0.12, FLOW_RUN = 5, FLOW_FOOT = 5.5, FLOW_MAX = 8;          // (FLOW_RUN: the fastest a river runs down its bed; FLOW_FOOT: at a fall's foot, in its pool; FLOW_MAX: a fall itself)
export function flowSpeed(fall, depth) { const v = 14 * Math.pow(depth > 0.05 ? depth : 0.05, 2 / 3) * Math.sqrt(fall > 0 ? fall : 0); return v < FLOW_MIN ? FLOW_MIN : v > FLOW_RUN ? FLOW_RUN : v; }
// What open water gives to the air in a year (m), by latitude (degrees) and the year's rain
// (mm): more toward the equator, more in dry air.
export function evaporation(lat, mm) { const c = Math.cos(lat * Math.PI / 180), dry = 1 - mm / 800; return 1.6 * Math.pow(c > 0 ? c : 0, 1.5) * (1 + 0.6 * (dry > 0 ? dry : 0)); }

const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1], DL = [1, 1.41421, 1, 1.41421, 1, 1.41421, 1, 1.41421];

// h: Int16Array W x W (metres; sea at or below 0). cell: metres per pixel. rain(x, y) -> mm
// a year at a pixel. opts: { coarse (see below), minFlow (m3/s: what counts as a river),
// lakeRain (mm: ponds only above this), pondDepth (m: a filled pit no deeper than this is a
// pond; 0: none; by default 12 where a cell is under 80 m), lat(y) -> degrees (for what a
// lake loses to the air; without it no lake is tested for that), water(x, y) -> 0 .. 255
// (how much of the place is water seen from space; without it large lakes go by their
// shape alone) }.
// Returns { q: Float32Array (m3/s), down: Int32Array (the cell each drains to, -1: out),
//   lake: Uint16Array (water level = v / 4 - 500 m; 0: none), rivers: [{ pts: Float64Array
//   (x, y, level, flow per point, in pixels and metres) }], order }.
export function hydrology(h, W, cell, rain, opts = {}) {
  const N = W * W, minFlow = opts.minFlow ?? 0.5, lakeRain = opts.lakeRain ?? 450, pond = opts.pondDepth ?? (cell < 80 ? 12 : 0);
  const fill = new Float32Array(N), down = new Int32Array(N).fill(-2), order = new Int32Array(N);
  // Cells at or under sea level that the sea does not reach (no way to the mosaic's edge
  // through such cells). A few of them with high ground all round are holes in the
  // elevation (one in Lake Winnipesaukee reads 1 926 m under the sea): read as sea they are
  // wells of sea water, so they are given the lowest ground round them. The rest are marked
  // `inland`: where a lake lies round them they are its bed (the deep of Lake Champlain is
  // in the map, under the sea's level).
  const inland = new Uint8Array(N);
  {
    const seen = new Uint8Array(N), stack = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (h[s0] > 0 || seen[s0]) continue;
      stack.length = 0; stack.push(s0); seen[s0] = 1; const cells = []; let rimLow = 32767, shut = true;
      while (stack.length) {
        const c = stack.pop(), x = c % W, y = (c - x) / W; if (cells.length < 20000) cells.push(c); else shut = false;
        if (x === 0 || y === 0 || x === W - 1 || y === W - 1) shut = false;
        for (let k = 0; k < 8; k++) {
          const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue; const j = yy * W + xx;
          if (h[j] <= 0) { if (!seen[j]) { seen[j] = 1; stack.push(j); } } else if (h[j] < rimLow) rimLow = h[j];
        }
      }
      if (!shut) continue;
      if (cells.length < 400 && rimLow >= 10 && rimLow < 32767) for (const c of cells) h[c] = rimLow;
      else for (const c of cells) inland[c] = 1;
    }
  }
  // --- joined to the coarser mosaic. A finer mosaic's rivers are worked out afresh on
  // finer ground, and where it hands over to the coarser one (RING_INSET pixels inside its
  // edge: DemSet._ringWater) the two sets of lines did not meet: a river stepped sideways
  // there, or ended. So the coarser mosaic's rivers (opts.coarse.rivers, its lines) are cut
  // into the ground the water is routed on, as a trench, all through the margin outside
  // that box and for JOIN_TAPER pixels inside it, ever shallower: water that comes in over
  // the edge runs along the coarser river's own line to the box and on into its own
  // valley, and a river on its way out is caught by the line it must leave on. The cells
  // of the trench remember the line's own points and levels (jx, jy, jl): a river traced
  // through them lies on the coarser river exactly, at its level. The real ground (h) is
  // not changed: only the routing is (hr).
  let hr = h, jx = null, jy = null, jl = null;
  const gate = [];
  let exits = null;
  if (opts.coarse && opts.coarse.rivers) {
    const C = opts.coarse, in0 = RING_INSET, in1 = W - RING_INSET;
    for (const p of C.rivers) {
      const n = p.length / 4;
      for (let i = 0; i + 1 < n; i++) {
        const ax = (p[i * 4] - C.ox) / C.s, ay = (p[i * 4 + 1] - C.oy) / C.s, bx = (p[i * 4 + 4] - C.ox) / C.s, by = (p[i * 4 + 5] - C.oy) / C.s;
        if (Math.max(ax, bx) < 0 || Math.max(ay, by) < 0 || Math.min(ax, bx) >= W || Math.min(ay, by) >= W) continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 3));
        for (let k = 0, last = -1; k <= steps; k++) {
          const t = k / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
          // (where the line leaves the mosaic, going down stream: the water leaves there too)
          if (x < 0 || y < 0 || x >= W || y >= W) { if (last >= 0 && jl !== null && !Number.isNaN(jl[last])) (exits || (exits = new Uint8Array(N)))[last] = 1; last = -1; continue; }
          last = Math.floor(y) * W + Math.floor(x);
          const d = Math.min(x - in0, in1 - x, y - in0, in1 - y);          // pixels inside the box (under 0: in the margin)
          if (d >= JOIN_TAPER) continue;
          const c = Math.floor(y) * W + Math.floor(x);
          if (h[c] <= 0) continue;                               // (the sea is met as it is, and so are the lakes)
          if (opts.lakes) { const L = opts.lakes(Math.floor(x), Math.floor(y)); if (L != null && h[c] < L) continue; }
          if (hr === h) { hr = Float32Array.from(h); jx = new Float32Array(N); jy = new Float32Array(N); jl = new Float32Array(N).fill(NaN); }
          if (d < 0 && d >= -2) gate.push(Math.floor(x), Math.floor(y));          // (where the line crosses into the box, or out of it)
          const w = d <= 0 ? 1 : 1 - d / JOIN_TAPER, cut = h[c] - JOIN_DEPTH * w;
          if (cut < hr[c]) hr[c] = cut;
          // (the point of the line nearest the cell's middle is the one remembered)
          const e = (x - Math.floor(x) - 0.5) ** 2 + (y - Math.floor(y) - 0.5) ** 2;
          if (Number.isNaN(jl[c]) || e < (jx[c] - Math.floor(x) - 0.5) ** 2 + (jy[c] - Math.floor(y) - 0.5) ** 2) { jx[c] = x; jy[c] = y; jl[c] = p[i * 4 + 2] + (p[i * 4 + 6] - p[i * 4 + 2]) * t; }
        }
      }
    }
  }
  // (... and round the trench the routing ground falls toward it, as a funnel JOIN_SHUT
  // pixels wide and as deep as the trench is there: this mosaic's own valley floor often
  // lies a pixel or two beside the coarser river's line, behind a rise the water does not
  // climb, and the river ran on beside the line it was to be met on.)
  if (jl !== null) {
    const line = []; for (let c = 0; c < N; c++) if (!Number.isNaN(jl[c])) line.push(c);
    for (const c of line) {
      const cx = c % W, cy = (c - cx) / W;
      for (let y = Math.max(0, cy - JOIN_SHUT); y <= Math.min(W - 1, cy + JOIN_SHUT); y++) for (let x = Math.max(0, cx - JOIN_SHUT); x <= Math.min(W - 1, cx + JOIN_SHUT); x++) {
        const r = Math.hypot(x - cx, y - cy); if (r >= JOIN_SHUT || r === 0) continue;
        const d = Math.min(x - RING_INSET, W - RING_INSET - x, y - RING_INSET, W - RING_INSET - y); if (d >= JOIN_TAPER) continue;
        const o = y * W + x; if (h[o] <= 0 || !Number.isNaN(jl[o])) continue;
        const cut = h[o] - JOIN_DEPTH * (d <= 0 ? 1 : 1 - d / JOIN_TAPER) * (1 - r / JOIN_SHUT) * 0.9;
        if (cut < hr[o]) hr[o] = cut;
      }
    }
  }
  // (... and beside each crossing the box's edge is shut for JOIN_SHUT pixels either way, by
  // a wall two pixels thick just outside it: this mosaic's own valley floor often lies a
  // pixel or two beside the coarser river's line, and the water crossed there, beside the
  // place it was to be met at.)
  for (let g = 0; g < gate.length; g += 2) {
    const gx = gate[g], gy = gate[g + 1];
    for (let y = Math.max(0, gy - JOIN_SHUT); y <= Math.min(W - 1, gy + JOIN_SHUT); y++) for (let x = Math.max(0, gx - JOIN_SHUT); x <= Math.min(W - 1, gx + JOIN_SHUT); x++) {
      const d = Math.min(x - RING_INSET, W - RING_INSET - 1 - x, y - RING_INSET, W - RING_INSET - 1 - y), c = y * W + x;
      if (d < 0 && d >= -2 && Number.isNaN(jl[c]) && h[c] > 0) hr[c] = h[c] + 1000;
    }
  }
  // --- priority-flood from the sea and the edge
  const heap = new Int32Array(N + 1); let hn = 0;
  const push = (i) => { let k = ++hn; heap[k] = i; const v = fill[i]; while (k > 1) { const p = k >> 1; if (fill[heap[p]] <= v) break; heap[k] = heap[p]; k = p; } heap[k] = i; };
  const pop = () => {
    const top = heap[1], last = heap[hn--]; if (hn === 0) return top;
    const v = fill[last]; let k = 1;
    for (;;) { let c = k << 1; if (c > hn) break; if (c < hn && fill[heap[c + 1]] < fill[heap[c]]) c++; if (fill[heap[c]] >= v) break; heap[k] = heap[c]; k = c; }
    heap[k] = last; return top;
  };
  // Water leaves by the sea and over the mosaic's edge. With a coarser result to ask, only
  // over the stretches of edge where that says the land outside is downhill: elsewhere the
  // edge is a wall (a river that comes in there must not be sent back out the way it came,
  // and a lake cut by the edge must drain by its real outlet).
  const C0 = opts.coarse;
  const leaves = (x, y) => {
    if (!C0) return true;
    const u = Math.floor((x + 0.5) * C0.s + C0.ox), v = Math.floor((y + 0.5) * C0.s + C0.oy), span = W * C0.s;
    if (u < 0 || v < 0 || u >= C0.W || v >= C0.W) return true;
    const d = C0.down[v * C0.W + u];
    if (d < 0) return true;
    const du = d % C0.W, dv = (d - du) / C0.W;
    return !(du + 0.5 > C0.ox && dv + 0.5 > C0.oy && du + 0.5 < C0.ox + span && dv + 0.5 < C0.oy + span);
  };
  let outlets = 0;
  for (let pass = 0; pass < 2 && !outlets; pass++) for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, edge = x === 0 || y === 0 || x === W - 1 || y === W - 1;
    // (the sea: not the cells under its level that it does not reach)
    if ((h[i] <= 0 && !inland[i]) || (edge && (pass === 1 || leaves(x, y) || (exits !== null && exits[i])))) { if (down[i] !== -1) { fill[i] = hr[i]; down[i] = -1; push(i); outlets++; } }
  }
  let n = 0;
  while (hn) {
    const i = pop(); order[n++] = i;
    const x = i % W, y = (i - x) / W, f = fill[i];
    for (let k = 0; k < 8; k++) {
      const xx = x + DX[k], yy = y + DY[k];
      if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue;
      const j = yy * W + xx;
      if (down[j] !== -2) continue;
      // (a hair above the cell it was reached from: the way out always goes down)
      const g = f + 2e-4 * DL[k];
      fill[j] = hr[j] > g ? hr[j] : g; down[j] = i; push(j);
    }
  }
  // --- steepest way down on the filled land (the flood's own way where there is none steeper)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (down[i] === -1) continue;
    let best = 0, to = -1; const f = fill[i];
    for (let k = 0; k < 8; k++) { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue; const j = yy * W + xx, s = (f - fill[j]) / DL[k]; if (s > best) { best = s; to = j; } }
    if (to >= 0) down[i] = to;
  }
  // --- the year's flow: what each cell sheds, added up on the way down
  const q = new Float32Array(N), k0 = cell * cell / 3.156e7 / 1000;       // mm a year over a cell -> m3/s
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (h[i] > 0) q[i] = runoff(rain(x, y)) * k0; }
  if (opts.coarse) {
    // Rivers that come in over the edge bring their water from outside. opts.coarse: the
    // coarser mosaic's result ({ q, down, W }) and how a pixel here maps into it
    // (coarse = pixel * s + ox, + oy). Every coarse cell just outside this mosaic that
    // drains to a cell inside it is a river crossing the edge, if it carries enough: its
    // water goes in at the lowest ground near where it crosses (the coarse result knows
    // the place only to within a cell of its own).
    const C = opts.coarse, cs = C.s, CW = C.W, least = minFlow * 4, span = W * cs;
    const inside = (u, v) => u + 0.5 > C.ox && v + 0.5 > C.oy && u + 0.5 < C.ox + span && v + 0.5 < C.oy + span;
    const u0 = Math.max(0, Math.floor(C.ox) - 1), u1 = Math.min(CW - 1, Math.ceil(C.ox + span)), v0 = Math.max(0, Math.floor(C.oy) - 1), v1 = Math.min(CW - 1, Math.ceil(C.oy + span));
    const R = Math.max(2, Math.round(1 / cs));
    for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
      if (inside(u, v)) continue;
      const c = v * CW + u, d = C.down[c];
      if (d < 0 || C.q[c] < least) continue;
      const du = d % CW, dv = (d - du) / CW;
      if (!inside(du, dv)) continue;
      const fx = Math.round((du + 0.5 - C.ox) / cs), fy = Math.round((dv + 0.5 - C.oy) / cs);
      let low = -1, lowF = 1e9;
      for (let y = Math.max(1, fy - R); y <= Math.min(W - 2, fy + R); y++) for (let x = Math.max(1, fx - R); x <= Math.min(W - 2, fx + R); x++) { const i = y * W + x; if (h[i] > 0 && fill[i] < lowF) { lowF = fill[i]; low = i; } }
      if (low >= 0) { q[low] += C.q[c]; if (opts.debug) console.log(`  a river of ${C.q[c].toFixed(0)} m3/s comes in at ${low % W}, ${Math.floor(low / W)} (level ${lowF.toFixed(0)})`); }
    }
  }
  for (let k = N - 1; k >= 0; k--) { const i = order[k], d = down[i]; if (d >= 0) q[d] += q[i]; }

  // --- lakes: the water the elevation set itself shows (a stretch of exactly level cells
  // above the sea), and ponds (shallow pits in wet country, on a fine map)
  const lake = new Uint16Array(N), enc = (m) => Math.max(1, Math.min(65535, Math.round((m + 500) * 4)));
  // (a made world knows its own lakes: opts.lakes(x, y) -> the water's level there (m), or
  // null. Where the bed is under that level it is the lake; nothing is read from level
  // stretches, of which a made land has none.)
  const given = opts.lakes || null;
  if (given) for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, L = given(x, y); if (L != null && h[i] < L && (h[i] > 0 || inland[i])) lake[i] = enc(L); }
  if (!given) for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (h[i] <= 0) continue;
    const v = h[i]; let flat = true;
    for (let k = 0; k < 8 && flat; k++) flat = h[(y + DY[k]) * W + x + DX[k]] === v;
    if (flat) lake[i] = 65535;                              // (marked; kept below only in stretches large enough)
    else if (pond > 0 && fill[i] - h[i] > 3 && rain(x, y) > lakeRain) lake[i] = 65534;          // (a pit that fills; kept below if it is a pond)
  }
  if (!given) {
    // Level stretches. A cell with all eight neighbours at its own height is the middle of
    // one; the stretch is every cell at that height joined to it (the narrow arms of a
    // reservoir have no such middle). Kept: those with enough middle (a lake, a wide river) ...
    const id = new Int32Array(N), stack = [], found = [], least = cell < 80 ? 60 : cell < 600 ? 24 : 8;
    // (A great lake's surface is not one whole number of metres all over: Michigan reads 175
    // here and 174 there. A cell of a stretch a metre or two lower, a middle or beside one,
    // joins the higher stretch it touches; so the highest are followed first.)
    const part = new Uint8Array(N), seeds = [];
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (lake[i] !== 65535) continue;
      seeds.push(i); part[i] = 1;
      for (let k = 0; k < 8; k++) part[(y + DY[k]) * W + x + DX[k]] = 1;
    }
    seeds.sort((a, b) => h[b] - h[a] || a - b);
    for (const s of seeds) {
      if (id[s]) continue;
      const me = found.length + 1, level = h[s];
      stack.length = 0; stack.push(s); id[s] = me; const cells = [];
      // (... that lie in a hollow: hardly any of the ground round water is lower. Elevation
      // in whole metres also makes level stretches of gently sloping fields; those have
      // lower ground all along one side, and it goes on falling. Three cells further out is
      // where to look: the first cell past a lake's edge is often a metre low in these maps,
      // from the resampling that made them.)
      let rim = 0, lower = 0, middle = 0, coast = false;
      while (stack.length) {
        const i = stack.pop(); cells.push(i); const x = i % W, y = (i - x) / W;
        if (lake[i] === 65535) middle++;
        if (inland[i]) continue;                               // (its bed, under the sea's level: part of it, but the lake does not grow from there)
        for (let k = 0; k < 8; k++) {
          const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue; const j = yy * W + xx;
          if (h[j] === level || inland[j] || (part[j] && h[j] < level && h[j] >= level - 2 && h[j] > 0)) { if (!id[j]) { id[j] = me; stack.push(j); } }
          else if (!(k & 1)) { rim++; if (h[j] <= 0) coast = true; if (h[j] < level) { const x3 = xx + 3 * DX[k], y3 = yy + 3 * DY[k]; if (x3 >= 0 && y3 >= 0 && x3 < W && y3 < W && h[y3 * W + x3] < level) lower++; } }
        }
      }
      // (a level flat that touches the sea is its shore, not a lake: as one, its water stood
      // a step above the sea's)
      found.push({ cells, level, keep: middle >= least && !coast, hollow: lower < 0.12 * rim, seen: -1, open: false, inflow: 0, middle, rim, lower });
    }
    // What was seen from space (opts.water: 0 land .. 255 water, on a map with cells some
    // 20 km wide) settles the large ones: a great lake is water whatever its rim does (the
    // rift lakes and Superior have low cells all round them in these maps), and a plain as
    // level as a lake is land (the Tisza's plain, Tulare's dry bed).
    if (opts.water) for (const f of found) {
      if (!f.keep) continue;
      // (seen: the most water over any of it; open: water over most of it)
      let m = 0, sum = 0, n = 0; const step = Math.max(1, f.cells.length >> 8);
      for (let k = 0; k < f.cells.length; k += step) { const c = f.cells[k], x = c % W, v = opts.water(x, (c - x) / W); if (v > m) m = v; sum += v; n++; }
      f.seen = m; f.open = sum / n >= 110;
    }
    for (const f of found) if (f.keep && !f.open) f.keep = f.hollow && (f.seen < 0 || f.seen >= 12 || f.cells.length * cell * cell < 1.5e8);
    if (opts.lat) {
      // ... and only if what the lake would lose to the air can come in: the rain on it and
      // the flow that reaches it. (A dry lake bed is as level as a lake: without this the
      // salt flats and playas of every desert were water.)
      for (let i = 0; i < N; i++) { const d = down[i]; if (d >= 0 && id[d] && id[d] !== id[i]) found[id[d] - 1].inflow += q[i]; }
      for (const f of found) {
        if (!f.keep || f.open) continue;
        const c = f.cells[f.cells.length >> 1], x = c % W, y = (c - x) / W, mm = rain(x, y), loss = evaporation(opts.lat(y), mm) - mm / 1000;
        if (loss > 0 && f.inflow * 3.156e7 < 0.3 * f.cells.length * cell * cell * loss) f.keep = false;
      }
    }
    if (opts.debug) for (const f of found) if (f.cells.length > (opts.debug === true ? 200 : opts.debug)) console.log(`  level stretch of ${f.cells.length} cells at ${f.level} m: kept ${f.keep} (middle ${f.middle}, rim ${f.rim}, lower ${f.lower}, seen ${f.seen}), inflow ${f.inflow.toFixed(1)} m3/s`);
    for (const f of found) { const v = f.keep ? enc(f.level) : 0; for (const i of f.cells) lake[i] = v; }
    // (a middle cell is in one stretch only, but two stretches at one height can share an
    // edge cell: the later one has it, which is as good)
  }
  if (!given) {
    const stack = [];
    // pits: keep the hollows of 12 cells or more that are no deeper than a pond (and not
    // one round a lake already found: that lake's own hollow, filled past its level)
    const seenP = new Uint8Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (lake[s0] !== 65534 || seenP[s0]) continue;
      stack.length = 0; stack.push(s0); seenP[s0] = 1; const cells = []; let beside = false;
      while (stack.length) {
        const c = stack.pop(); cells.push(c); const x = c % W, y = (c - x) / W;
        for (let k = 0; k < 8; k++) { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue; const j = yy * W + xx; if (lake[j] === 65534) { if (!seenP[j]) { seenP[j] = 1; stack.push(j); } } else if (lake[j]) beside = true; }
      }
      // (one level for the whole hollow, its lowest: the filled land rises by a hair from cell
      // to cell, and a lake whose cells round to two levels would be two lakes to the height code)
      let low = 1e9, deep = 0; for (const c of cells) { if (fill[c] < low) low = fill[c]; if (fill[c] - h[c] > deep) deep = fill[c] - h[c]; }
      const v = cells.length >= 12 && deep <= pond && !beside ? enc(low) : 0;
      for (const c of cells) lake[c] = v;
    }
  }
  {
    // A lake that is kept is its whole hollow: every cell under its level that joins it,
    // however shallow and whatever the rain there (cut at 3 m of depth or along the rain
    // map's cells, the water ended in a wall); and any ground beside it that is lower than
    // its water and cannot drain (a pit in the map at its edge, the sea-deep part of its bed).
    const stack = [];
    for (let i = 0; i < N; i++) if (lake[i]) stack.push(i);
    while (stack.length) {
      const c = stack.pop(), x = c % W, y = (c - x) / W, v = lake[c], level = v / 4 - 500;
      for (let k = 0; k < 8; k++) { const xx = x + DX[k], yy = y + DY[k]; if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= W - 1) continue; const j = yy * W + xx; if (!lake[j] && (h[j] > 0 ? fill[j] - h[j] > 0.05 && (Math.abs(fill[j] - level) < 0.3 || h[j] < level) : inland[j] === 1)) { lake[j] = v; stack.push(j); } }
    }
  }
  // --- rivers: followed down from where the flow first is enough, as lines
  const rivers = [], done = new Uint8Array(N), ups = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const d = down[i]; if (d >= 0 && q[i] >= minFlow && q[d] >= minFlow) ups[d]++; }
  const isRiver = (i) => q[i] >= minFlow && h[i] > 0;
  // The water's level along a river: it never rises on the way down, and it stays as near
  // the ground as that allows (the least-squares fit: where the ground along the way dips
  // and rises again, a pit in the map or a gorge narrower than a cell, the river is cut a
  // little into the rise and stands a little over the dip; held to the filled level it
  // crossed every hollow on a causeway, held to the lowest ground so far it ran on in a
  // trench). A lake's surface, the sea's, and the river it joins are met exactly.
  const lev = new Float32Array(N);
  const outside = (i) => { const x = i % W, y = (i - x) / W; return x < RING_INSET || y < RING_INSET || x >= W - RING_INSET || y >= W - RING_INSET; };
  const trace = (start) => {
    const cells = [], want = [], wgt = [];
    let i = start;
    for (;;) {
      const joined = done[i] && i !== start;
      cells.push(i);
      // (in the margin, on the coarser river's line: its level, to be met at the box's edge)
      // (not where the coarser river is far off this ground: a coarse map's river can lie
      // tens of metres over a hollow or inside a hillside, and met there it would run on in a slot)
      const pin = jl !== null && !Number.isNaN(jl[i]) && !lake[i] && outside(i) && Math.abs(jl[i] - h[i]) <= JOIN_NEAR;
      want.push(joined ? lev[i] : lake[i] ? lake[i] / 4 - 500 : pin ? jl[i] : h[i] > 0 ? h[i] : 0); wgt.push(joined || lake[i] || h[i] <= 0 || pin ? 1e6 : 1);
      if (joined) break;                                   // joined a river already followed: end on it
      done[i] = 1;
      const d = down[i];
      if (d < 0) break;
      if (!isRiver(d)) { cells.push(d); want.push(lake[d] ? lake[d] / 4 - 500 : h[d] > 0 ? h[d] : 0); wgt.push(lake[d] || h[d] <= 0 ? 1e6 : 1); break; }
      i = d;
    }
    // (pool adjacent violators: blocks of cells that share a level. Three rounds, standing
    // over the ground counted six times as dear as being cut into it: a river lies in the
    // low of its valley, and the high cells along its way are its banks and walls.)
    const bv = [], bw = [], bn = [];
    for (let round = 0; round < 3; round++) {
      if (round) for (let b = 0, k = 0; b < bv.length; b++) for (let e = k + bn[b]; k < e; k++) if (wgt[k] < 1e5) wgt[k] = bv[b] > want[k] ? 6 : 1;
      bv.length = bw.length = bn.length = 0;
      for (let k = 0; k < cells.length; k++) {
        let v = want[k], w = wgt[k], n = 1;
        while (bv.length && bv[bv.length - 1] < v) { const pv = bv.pop(), pw = bw.pop(); v = (pv * pw + v * w) / (pw + w); w += pw; n += bn.pop(); }
        bv.push(v); bw.push(w); bn.push(n);
      }
    }
    const pts = [];
    for (let b = 0, k = 0; b < bv.length; b++) for (let e = k + bn[b]; k < e; k++) {
      const c = cells[k], x = c % W;
      if (!(done[c] && lev[c] && k === cells.length - 1 && k > 0)) lev[c] = bv[b];
      // (a cell of the coarser river's trench: the river lies on that river's own line)
      const on = jl !== null && !Number.isNaN(jl[c]);
      pts.push(on ? jx[c] : x + 0.5, on ? jy[c] : (c - x) / W + 0.5, bv[b], q[k === cells.length - 1 && k > 0 ? cells[k - 1] : c]);
    }
    if (pts.length >= 8) {
      // (where another river comes in, by cell: no fall is made just above one, see falls())
      const meet = new Uint8Array(cells.length); for (let k = 0; k < cells.length; k++) meet[k] = ups[cells[k]] > 1 || (k === cells.length - 1 && done[cells[k]] && k > 0) ? 1 : 0;
      rivers.push(opts.falls === false ? { pts: smooth(new Float64Array(pts)), falls: [] } : falls(smooth(new Float64Array(pts)), cell, W, meet));
    }
  };
  // (sources first, largest flow first, so the main stem is one line and the others join it)
  const starts = [];
  for (let i = 0; i < N; i++) if (isRiver(i) && ups[i] === 0) starts.push(i);
  // a river that enters over the edge has no source inside: start at the cell the inflow reached
  starts.sort((a, b) => q[b] - q[a]);
  // follow from each source, the one whose way down carries most first
  const reach = (i) => { let m = 0, g = 0; while (i >= 0 && g++ < 4 * W) { if (q[i] > m) m = q[i]; i = down[i]; } return m; };
  const ranked = starts.map((i) => [i, reach(i)]).sort((a, b) => b[1] - a[1]);
  for (const [i] of ranked) if (!done[i]) trace(i);
  return { q, down, fill, lake, rivers, W, cell };
}

// Bad cells in an elevation mosaic: one that stands off the middle value of the nine round
// it by more than four times a cell's width is no landform (a mosaic over Vermont has a
// cell at 7 964 m beside one at -2 496 m). It is given that middle value.
export function despike(h, W, cell) {
  const lim = Math.max(100, 4 * cell), v = new Float64Array(9); let n = 0;
  for (let y = 1; y < W - 1; y++) for (let x = 1, o = y * W + 1; x < W - 1; x++, o++) {
    const c = h[o];
    if (Math.abs(c - h[o - 1]) < lim || Math.abs(c - h[o + 1]) < lim || Math.abs(c - h[o - W]) < lim || Math.abs(c - h[o + W]) < lim) continue;
    let k = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) v[k++] = h[o + b * W + a];
    v.sort(); const mid = v[4];
    if (Math.abs(c - mid) > lim) { h[o] = mid; n++; }
  }
  return n;
}

// Elevation sets made from radar leave coastal water at exactly zero: no bed, so no
// depth, and nothing to tell sea from a beach. Water pixels (zero or below) get a bed that
// falls away from the land: 2.5 % for the first stretch, then more gently, as deep as the
// set says where it knows better. Distance to land by a two-pass chamfer transform.
export function seaBed(h, W, metresPerPixel) {
  const d = new Float32Array(W * W), far = 1e9;
  let wet = 0;
  for (let i = 0; i < W * W; i++) { if (h[i] <= 0) { d[i] = far; wet++; } }
  if (!wet || wet === W * W) { if (wet) for (let i = 0; i < W * W; i++) if (h[i] === 0) h[i] = -30; return; }
  const a = 1, b = 1.41421;
  for (let y = 0; y < W; y++) for (let x = 0, o = y * W; x < W; x++, o++) {
    let v = d[o]; if (v === 0) continue;
    if (x > 0 && d[o - 1] + a < v) v = d[o - 1] + a;
    if (y > 0) { if (d[o - W] + a < v) v = d[o - W] + a; if (x > 0 && d[o - W - 1] + b < v) v = d[o - W - 1] + b; if (x < W - 1 && d[o - W + 1] + b < v) v = d[o - W + 1] + b; }
    d[o] = v;
  }
  for (let y = W - 1; y >= 0; y--) for (let x = W - 1, o = y * W + x; x >= 0; x--, o--) {
    let v = d[o]; if (v === 0) continue;
    if (x < W - 1 && d[o + 1] + a < v) v = d[o + 1] + a;
    if (y < W - 1) { if (d[o + W] + a < v) v = d[o + W] + a; if (x < W - 1 && d[o + W + 1] + b < v) v = d[o + W + 1] + b; if (x > 0 && d[o + W - 1] + b < v) v = d[o + W - 1] + b; }
    d[o] = v;
  }
  for (let i = 0; i < W * W; i++) {
    if (d[i] === 0) continue;
    const m = (d[i] - 0.5) * metresPerPixel, bed = -(m < 400 ? m * 0.025 : 10 + Math.sqrt(m - 400) * 0.9);
    if (bed < h[i]) h[i] = Math.max(-32000, Math.round(bed < -1 ? bed : -1));
  }
}

// A line through cell centres, rounded: two passes of corner cutting (the ends stay).
function smooth(p) {
  for (let pass = 0; pass < 2; pass++) {
    const n = p.length / 4; if (n < 3) return p;
    const out = new Float64Array(((n - 1) * 2 + 2) * 4); let o = 0;
    const put = (a, b, t) => { for (let c = 0; c < 4; c++) out[o++] = p[a * 4 + c] + (p[b * 4 + c] - p[a * 4 + c]) * t; };
    put(0, 0, 0);
    for (let i = 0; i < n - 1; i++) { put(i, i + 1, 0.25); put(i, i + 1, 0.75); }
    put(n - 1, n - 1, 0);
    p = out;
  }
  // the level never rises along the way down (the cutting cannot make it, but the ends can)
  for (let i = 1, n = p.length / 4; i < n; i++) if (p[i * 4 + 2] > p[(i - 1) * 4 + 2]) p[i * 4 + 2] = p[(i - 1) * 4 + 2];
  return p;
}

// Falls. A river's level as traced follows the map's ground, which is smooth: a steep reach
// is one long chute. Rock is not like that: it holds in ledges, and the water goes over a
// ledge in one drop into a pool it has dug, and runs out of the pool through a short gorge.
// So where a river's level comes down through one of the ledges' heights (every FALL_STEP
// metres above the sea: by height, not by where the line's points happen to lie, so a
// coarser and a finer mosaic put the fall at the same place to within what their levels
// differ by) on a reach steep enough, the level drops there all at once by what the reach
// would have fallen over the next FALL_POOL metres, and lies level from the foot to where
// the old level comes down to it: fall, plunge pool, and the ground beside them cut down to
// the water as everywhere along a river (a gorge below the fall, a ledge above it).
// p: the line (x, y, level, flow a point); returns { pts (two points more a fall), falls:
// the index of each fall's upper point } (the stretch from it to the next point is the drop).
// Not in the margin outside the box a finer mosaic answers for (there the line is the
// coarser river's and its level is met), not within reach of a confluence (the river that
// comes in was levelled to the old level), and none under FALL_LEAST metres.
export const FALL_STEP = 60, FALL_POOL = 50, FALL_SLOPE = 0.14, FALL_MOST = 34, FALL_LEAST = 6, FALL_RUN = 1.5;
function falls(p, cell, W, meet) {
  const n = p.length / 4, along = new Float64Array(n);
  for (let i = 1; i < n; i++) along[i] = along[i - 1] + Math.hypot(p[i * 4] - p[i * 4 - 4], p[i * 4 + 1] - p[i * 4 - 3]) * cell;
  const lvAt = (d, from) => { let j = from; while (j + 1 < n && along[j + 1] < d) j++; if (j + 1 >= n) return p[(n - 1) * 4 + 2]; const t = (d - along[j]) / Math.max(1e-6, along[j + 1] - along[j]); return p[j * 4 + 2] + (p[j * 4 + 6] - p[j * 4 + 2]) * (t < 0 ? 0 : t > 1 ? 1 : t); };
  const inBox = (x, y) => x >= RING_INSET + 2 && y >= RING_INSET + 2 && x <= W - RING_INSET - 2 && y <= W - RING_INSET - 2;
  const out = [], at = [];
  let floor = Infinity;          // (the pool's level, while the old level is still above it)
  for (let i = 0; i < n; i++) {
    const o = i * 4, lv = p[o + 2];
    out.push(p[o], p[o + 1], lv < floor ? lv : floor, p[o + 3]);
    if (lv <= floor) floor = Infinity;
    if (i + 1 >= n || floor < Infinity) continue;
    const nx = p[o + 6], step = Math.floor(lv / FALL_STEP) * FALL_STEP;
    if (!(nx < step && lv >= step && step > 0)) continue;          // (comes down through a ledge's height between this point and the next)
    // (the lip far enough before the next point for the drop to end before it: the line never turns back)
    const dl0 = Math.hypot(p[o + 4] - p[o], p[o + 5] - p[o + 1]), run0 = FALL_RUN / cell;
    if (dl0 < run0 * 1.5) continue;
    const t = Math.min((lv - step) / Math.max(1e-6, lv - nx), 1 - run0 * 1.25 / dl0), d0 = along[i] + (along[i + 1] - along[i]) * t;
    const x = p[o] + (p[o + 4] - p[o]) * t, y = p[o + 1] + (p[o + 5] - p[o + 1]) * t;
    let drop = step - lvAt(d0 + FALL_POOL, i);
    if (drop < FALL_SLOPE * FALL_POOL || drop < FALL_LEAST || !inBox(x, y) || along[n - 1] - d0 < FALL_POOL * 1.5) continue;
    if (drop > FALL_MOST) drop = FALL_MOST;
    // (a river comes in within the pool's reach, or just above: its level there is the old one)
    let near = false; for (let c = Math.max(0, Math.floor(i / 4) - 2), e = Math.min(meet.length - 1, Math.ceil((i + 1) / 4 + (FALL_POOL * 1.3) / cell) + 2); c <= e; c++) if (meet[c]) near = true;
    if (near) continue;
    const dl = Math.hypot(p[o + 4] - p[o], p[o + 5] - p[o + 1]) || 1, ux = (p[o + 4] - p[o]) / dl, uy = (p[o + 5] - p[o + 1]) / dl, run = FALL_RUN / cell, q = p[o + 3] + (p[o + 7] - p[o + 3]) * t;
    at.push(out.length / 4);
    out.push(x, y, step, q, x + ux * run, y + uy * run, step - drop, q);
    floor = step - drop;
  }
  return { pts: new Float64Array(out), falls: at };
}

// The flow a result has near a pixel of its own mosaic (the largest within `r` cells):
// what a finer mosaic asks at its edge.
export function flowAt(res, x, y, r = 1) {
  const W = res.W, xi = Math.floor(x), yi = Math.floor(y); let m = 0;
  for (let b = yi - r; b <= yi + r; b++) for (let a = xi - r; a <= xi + r; a++) { if (a < 0 || b < 0 || a >= W || b >= W) continue; const v = res.q[b * W + a]; if (v > m) m = v; }
  return m;
}

// What the height code needs of a result, as flat arrays (see DemSet.setRing):
//   segs  Float32Array, RIVER_STRIDE numbers a stretch of river: x0, y0, x1, y1 (pixels), the
//         water's level at both ends (m), its half width at both ends (m), its depth at both
//         ends (m), its speed in mid stream at both ends (m/s, flowSpeed) and the way it runs
//         at both ends (radians from east toward north). A stretch runs down from its first end.
//   grid  cells of GRID pixels: gridStart[cell] .. gridStart[cell + 1] index gridItems, the
//         stretches that can reach into that cell (their width and banks counted); and
//         wideStart / wideItems, the same with every stretch within RIVER_REACH pixels
//   lake  Uint16Array W x W: water level = v / 4 - 500 m (0: none), spread two pixels past
//         each lake's edge so a place on its shore can read it
// and it lowers `h` under the lakes to a bed that falls away from their shores.
export const GRID = 8, FLOW_SPAN = 8;
// Joined to the coarser mosaic (see hydrology): how deep its rivers are cut into the ground
// the water is routed on (m), how many pixels inside the box the cut tapers out over, and how
// near this mosaic's ground the coarser river's level must be for its level to be met too (m).
export const JOIN_DEPTH = 2000, JOIN_TAPER = 16, JOIN_NEAR = 8, JOIN_SHUT = 14;
export function packWater(res, h) {
  const { W, cell, rivers } = res, lake = res.lake, N = W * W;
  // --- lake beds, by distance from the shore (the same two-pass transform as the sea's)
  const d = new Float32Array(N);
  let any = false;
  for (let i = 0; i < N; i++) if (lake[i]) { d[i] = 1e9; any = true; }
  if (any) {
    const b = 1.41421;
    for (let y = 1; y < W - 1; y++) for (let x = 1, o = y * W + 1; x < W - 1; x++, o++) { let v = d[o]; if (v === 0) continue; v = Math.min(v, d[o - 1] + 1, d[o - W] + 1, d[o - W - 1] + b, d[o - W + 1] + b); d[o] = v; }
    for (let y = W - 2; y > 0; y--) for (let x = W - 2, o = y * W + x; x > 0; x--, o--) { let v = d[o]; if (v === 0) continue; v = Math.min(v, d[o + 1] + 1, d[o + W] + 1, d[o + W + 1] + b, d[o + W - 1] + b); d[o] = v; }
    for (let i = 0; i < N; i++) {
      if (!lake[i]) continue;
      const m = Math.min(d[i], 1e6) * cell, level = lake[i] / 4 - 500, bed = level - Math.min(60, 0.4 + (m < 300 ? m * 0.03 : 9 + Math.sqrt(m - 300) * 0.5));
      if (bed < h[i]) h[i] = Math.round(bed - 0.5);
    }
    // spread the levels two pixels outward, onto the shore only: ground no lower than the
    // water (below a lake's outlet the ground falls away, and a level carried out over it
    // stood there as a slab of water in the air)
    for (let pass = 0; pass < 2; pass++) {
      const src = lake.slice();
      for (let y = 1; y < W - 1; y++) for (let x = 1, o = y * W + 1; x < W - 1; x++, o++) {
        if (src[o]) continue;
        const v = src[o - 1] || src[o + 1] || src[o - W] || src[o + W] || src[o - W - 1] || src[o - W + 1] || src[o + W - 1] || src[o + W + 1];
        // (... or ground that cannot drain: a pit in the shore fills to the lake's level)
        if (v && (h[o] >= v / 4 - 500 - 0.5 || res.fill[o] - h[o] > 0.05)) lake[o] = v;
      }
    }
  }
  // --- rivers as stretches, and the grid that finds them
  let count = 0; for (const r of rivers) count += r.pts.length / 4 - 1;
  const S = RIVER_STRIDE, segs = new Float32Array(count * S), G = W / GRID, cells = Array.from({ length: G * G }, () => null), wide = Array.from({ length: G * G }, () => null);
  let o = 0, k = 0;
  const fallList = [];
  for (const r of rivers) {
    const p = r.pts, n = p.length / 4;
    // The flow at every point of the line: its way from the points before and after, its
    // speed from the water's fall over some two cells of the map (FLOW_SPAN points each way:
    // the line has four points to a cell) and its depth. A pool, where the level does not
    // fall, drifts; a step in the level is a rapid over the cells round it.
    const sp = new Float32Array(n), an = new Float32Array(n), along = new Float64Array(n);
    for (let i = 1; i < n; i++) along[i] = along[i - 1] + Math.hypot(p[i * 4] - p[i * 4 - 4], p[i * 4 + 1] - p[i * 4 - 3]) * cell;
    // (a fall's drop is not a slope the water runs down: the speed above it and in its pool is
    // worked out as if the drop were not there. ev: the level with every fall above put back.)
    const isFall = new Uint8Array(n), ev = new Float64Array(n); let back = 0;
    for (const f of r.falls || []) isFall[f] = 1;
    for (let i = 0; i < n; i++) { ev[i] = p[i * 4 + 2] + back; if (isFall[i]) back += p[i * 4 + 2] - p[i * 4 + 6]; }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - FLOW_SPAN), b = Math.min(n - 1, i + FLOW_SPAN);
      let a1 = Math.max(0, i - 1), b1 = Math.min(n - 1, i + 1);
      // (the way it runs at a fall's lip and foot: the way of the line above and below, not of the short drop)
      if (isFall[i] && i > 0) b1 = i; else if (i > 0 && isFall[i - 1] && i + 1 < n) a1 = i;
      sp[i] = flowSpeed((ev[a] - ev[b]) / Math.max(1, along[b] - along[a]), riverDepth(p[i * 4 + 3]));
      an[i] = Math.atan2(-(p[b1 * 4 + 1] - p[a1 * 4 + 1]), p[b1 * 4] - p[a1 * 4]);          // (rows run south)
    }
    // (below a fall the pool is white water that slows as it runs out: the fall's own speed at
    // its foot, easing to the pool's over FALL_POOL metres)
    for (let i = 0; i < n; i++) if (isFall[i]) for (let j = i + 1; j < n && along[j] - along[i + 1] < FALL_POOL; j++) { const u = 1 - (along[j] - along[i + 1]) / FALL_POOL, v = FLOW_FOOT * u * u; if (v > sp[j]) sp[j] = v; }
    for (let i = 0, j = 0; i + 4 < p.length; i += 4, j++, k++) {
      // (not where it runs through a lake or into the sea: that water is drawn already)
      const xi = Math.min(W - 1, Math.max(0, Math.floor(p[i]))), yi = Math.min(W - 1, Math.max(0, Math.floor(p[i + 1])));
      if (res.lake[yi * W + xi] || h[yi * W + xi] <= 0) continue;
      const a0 = riverWidth(p[i + 3]) / 2, a1 = riverWidth(p[i + 7]) / 2;
      segs[o] = p[i]; segs[o + 1] = p[i + 1]; segs[o + 2] = p[i + 4]; segs[o + 3] = p[i + 5];
      segs[o + 4] = p[i + 2]; segs[o + 5] = p[i + 6]; segs[o + 6] = a0; segs[o + 7] = a1; segs[o + 8] = riverDepth(p[i + 3]); segs[o + 9] = riverDepth(p[i + 7]);
      segs[o + 10] = sp[j]; segs[o + 11] = sp[j + 1]; segs[o + 12] = an[j]; segs[o + 13] = an[j + 1];
      // (a fall: the water falls, at the most a speed can say; and it is listed, for what is drawn of it from afar)
      if (isFall[j]) { segs[o + 10] = segs[o + 11] = FLOW_MAX; fallList.push(p[i], p[i + 1], p[i + 2], p[i + 2] - p[i + 6], a0, an[j]); }
      const pad = (Math.max(a0, a1) * 2.2 + 12) / cell + 0.5;
      const x0 = Math.max(0, Math.floor((Math.min(p[i], p[i + 4]) - pad) / GRID)), x1 = Math.min(G - 1, Math.floor((Math.max(p[i], p[i + 4]) + pad) / GRID));
      const y0 = Math.max(0, Math.floor((Math.min(p[i + 1], p[i + 5]) - pad) / GRID)), y1 = Math.min(G - 1, Math.floor((Math.max(p[i + 1], p[i + 5]) + pad) / GRID));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) (cells[y * G + x] || (cells[y * G + x] = [])).push(o / S);
      // (and the wider grid: every stretch within RIVER_REACH pixels, for the far ground's share of river)
      {
        const pw = pad + RIVER_REACH;
        const u0 = Math.max(0, Math.floor((Math.min(p[i], p[i + 4]) - pw) / GRID)), u1 = Math.min(G - 1, Math.floor((Math.max(p[i], p[i + 4]) + pw) / GRID));
        const v0 = Math.max(0, Math.floor((Math.min(p[i + 1], p[i + 5]) - pw) / GRID)), v1 = Math.min(G - 1, Math.floor((Math.max(p[i + 1], p[i + 5]) + pw) / GRID));
        // (every other stretch is enough there: a stretch is a quarter of a pixel long)
        if (!(j & 1)) for (let y = v0; y <= v1; y++) for (let x = u0; x <= u1; x++) (wide[y * G + x] || (wide[y * G + x] = [])).push(o / S);
      }
      o += S;
    }
  }
  const gridStart = new Int32Array(G * G + 1); let total = 0;
  for (let c = 0; c < G * G; c++) { gridStart[c] = total; total += cells[c] ? cells[c].length : 0; }
  gridStart[G * G] = total;
  const gridItems = new Int32Array(total);
  for (let c = 0; c < G * G; c++) if (cells[c]) gridItems.set(cells[c], gridStart[c]);
  const wideStart = new Int32Array(G * G + 1); total = 0;
  for (let c = 0; c < G * G; c++) { wideStart[c] = total; total += wide[c] ? wide[c].length : 0; }
  wideStart[G * G] = total;
  const wideItems = new Int32Array(total);
  for (let c = 0; c < G * G; c++) if (wide[c]) wideItems.set(wide[c], wideStart[c]);
  // falls: six numbers each: where its lip is (x, y: pixels), the lip's level (m), how far it
  // drops (m), its half width (m) and the way it faces (radians from east toward north)
  // wideStart / wideItems: the same grid with every stretch within RIVER_REACH pixels of a cell:
  // what the far ground asks, whose texels are wider than a river (DemSet._water, cover)
  return { segs: segs.slice(0, o), gridStart, gridItems, wideStart, wideItems, lake: any ? lake : null, falls: new Float32Array(fallList) };
}

// The water of one mosaic of map tiles, as the tile worker hands it on and as the Node
// checks ask it (one path for both). m: { zoom, tx, ty, hydrology: { minFlow } } (256-pixel
// Web Mercator tiles from column tx, row ty); h: its elevation (W x W, changed in place:
// lake beds); cell: metres a pixel; rain: the year's rain (720 x 360 bytes, 3.2 * sqrt(mm),
// north first, from longitude -180) or null; seen: the world's water as seen from space
// ({ data, W, H }) or null; lakes: a made world's own (x, y) -> level or null; coarse: the
// coarser mosaic's result (what this returns as `mine`) or null; join: false to leave the
// rivers unjoined to the coarser mosaic's (as they were: for the check to see the difference).
// Returns { packed (packWater's, with info), mine (what a finer mosaic asks of this one) }.
export function mosaicWater(m, h, W, cell, opts = {}) {
  const { rain = null, seen = null, lakes = null, coarse = null } = opts;
  const TILE = 256, n = 2 ** m.zoom;
  const latOf = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (m.ty + y / TILE) / n))) * 57.29577951;
  const rainAt = (x, y) => {
    if (!rain) return 600;
    const lon = (m.tx + x / TILE) / n * 360, lat = latOf(y);
    const v = rain[Math.min(359, Math.max(0, Math.floor((90 - lat) * 2))) * 720 + ((Math.floor(lon * 2) % 720) + 720) % 720] / 3.2;
    return v * v;
  };
  const s = coarse ? 2 ** (coarse.zoom - m.zoom) : 1;
  const res = hydrology(h, W, cell, rainAt, {
    minFlow: m.hydrology.minFlow, lakes, lat: latOf, falls: opts.falls,
    // (the water map: the whole world, north first, from longitude -180)
    water: seen ? (x, y) => {
      const lon = (m.tx + x / TILE) / n, lat = latOf(y);
      return seen.data[Math.min(seen.H - 1, Math.max(0, Math.floor((90 - lat) / 180 * seen.H))) * seen.W + ((Math.floor(lon * seen.W) % seen.W) + seen.W) % seen.W];
    } : null,
    coarse: coarse ? { q: coarse.res.q, down: coarse.res.down, W: coarse.res.W, rivers: opts.join === false ? null : coarse.rivers || null, s, ox: m.tx * TILE * s - coarse.tx * TILE, oy: m.ty * TILE * s - coarse.ty * TILE } : null,
  });
  const packed = packWater(res, h);
  packed.info = { rivers: res.rivers.length, stretches: packed.segs.length / RIVER_STRIDE, falls: packed.falls.length / 6, inflow: !!coarse, flow: 0 };
  for (let i = 0; i < res.q.length; i++) if (res.q[i] > packed.info.flow) packed.info.flow = res.q[i];
  return { packed, res, mine: { res: { q: res.q, down: res.down, W }, zoom: m.zoom, tx: m.tx, ty: m.ty,
    // (its rivers' lines, for a finer mosaic to join: only the parts that are drawn, not those under a lake or the sea)
    rivers: res.rivers.map((r) => r.pts) } };
}
