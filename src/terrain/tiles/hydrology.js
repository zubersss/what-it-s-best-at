// Where water runs and stands, worked out from the shape of the land: a square elevation
// mosaic in, rivers (as lines with a width and a level) and lakes (as a raster of water
// levels) out. Plain arrays only: it runs in the tile worker and in Node.
//
// The method is the textbook one. Every cell is given a way out to the sea or to the
// mosaic's edge by flooding inward from there in order of height (priority-flood: Barnes,
// Lehman and Mulla 2014), which also fills the pits; water then runs down the steepest
// way on the filled land. Each cell sheds the rain that falls on it less what the air
// takes back; adding that up along the way down gives every cell the flow of a year.
// A cell is river where that flow is enough; a pit that fills is a lake where enough
// rain falls to keep it.
//
// A mosaic is a window: a river that comes in over its edge brought its water from
// outside. The coarser mosaic's result says how much and where (opts.coarse).

// Rain to run-off (mm a year): dry land gives none back, wet land about half.
export function runoff(mm) { const k = (mm - 150) / 1400; return mm * (k < 0 ? 0 : k > 0.55 ? 0.55 : k); }
// A river's width (m) and depth (m) from its mean flow (m3/s): hydraulic geometry.
export function riverWidth(q) { return 5.5 * Math.sqrt(q); }
export function riverDepth(q) { return 0.32 * Math.pow(q, 0.33); }

const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1], DL = [1, 1.41421, 1, 1.41421, 1, 1.41421, 1, 1.41421];

// h: Int16Array W x W (metres; sea at or below 0). cell: metres per pixel. rain(x, y) -> mm
// a year at a pixel. opts: { coarse (see below), minFlow (m3/s: what counts as a river),
// lakeRain (mm: pits fill above this) }.
// Returns { q: Float32Array (m3/s), down: Int32Array (the cell each drains to, -1: out),
//   lake: Uint16Array (water level = v / 4 - 500 m; 0: none), rivers: [{ pts: Float64Array
//   (x, y, level, flow per point, in pixels and metres) }], order }.
export function hydrology(h, W, cell, rain, opts = {}) {
  const N = W * W, minFlow = opts.minFlow ?? 0.5, lakeRain = opts.lakeRain ?? 450;
  const fill = new Float32Array(N), down = new Int32Array(N).fill(-2), order = new Int32Array(N);
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
    if (h[i] <= 0 || (edge && (pass === 1 || leaves(x, y)))) { if (down[i] !== -1) { fill[i] = h[i]; down[i] = -1; push(i); outlets++; } }
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
      fill[j] = h[j] > g ? h[j] : g; down[j] = i; push(j);
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

  // --- lakes: pits that fill where it rains enough, and water the elevation set itself
  // shows (a stretch of exactly level cells above the sea)
  const lake = new Uint16Array(N), enc = (m) => Math.max(1, Math.min(65535, Math.round((m + 500) * 4)));
  for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (h[i] <= 0) continue;
    if (fill[i] - h[i] > 3 && rain(x, y) > lakeRain) { lake[i] = enc(fill[i]); continue; }
    const v = h[i]; let flat = true;
    for (let k = 0; k < 8 && flat; k++) flat = h[(y + DY[k]) * W + x + DX[k]] === v;
    if (flat) lake[i] = 65535;                              // (marked; kept below only in stretches large enough)
  }
  {
    // level stretches: keep those of 60 cells or more (a lake, a wide river), drop the rest
    const seen = new Uint8Array(N), stack = [];
    for (let s = 0; s < N; s++) {
      if (lake[s] !== 65535 || seen[s]) continue;
      stack.length = 0; stack.push(s); seen[s] = 1; const cells = [];
      // (water lies in a hollow: hardly any of the ground round it is lower. Elevation in
      // whole metres also makes level stretches of gently sloping fields; those have lower
      // ground all along one side.)
      let rim = 0, lower = 0;
      while (stack.length) {
        const i = stack.pop(); cells.push(i); const x = i % W, y = (i - x) / W;
        for (let k = 0; k < 8; k += 2) {
          const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue; const j = yy * W + xx;
          if (lake[j] === 65535) { if (!seen[j]) { seen[j] = 1; stack.push(j); } } else if (h[j] !== h[i]) { rim++; if (h[j] < h[i]) lower++; }
        }
      }
      const v = cells.length >= 60 && lower < 0.12 * rim ? enc(h[s]) : 0;
      for (const i of cells) lake[i] = v;
    }
  }

  // --- rivers: followed down from where the flow first is enough, as lines
  const rivers = [], done = new Uint8Array(N), ups = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const d = down[i]; if (d >= 0 && q[i] >= minFlow && q[d] >= minFlow) ups[d]++; }
  const isRiver = (i) => q[i] >= minFlow && h[i] > 0;
  const trace = (start) => {
    const pts = [];
    let i = start, level = 1e9;
    for (;;) {
      const x = i % W, y = (i - x) / W;
      // the water's level: the filled land's, never rising on the way down
      level = Math.min(level, fill[i]);
      pts.push(x + 0.5, y + 0.5, level, q[i]);
      if (done[i] && i !== start) break;                   // joined a river already followed: end on it
      done[i] = 1;
      const d = down[i];
      if (d < 0 || !isRiver(d)) { if (d >= 0) { const dx = d % W; pts.push(dx + 0.5, (d - dx) / W + 0.5, Math.min(level, fill[d]), q[i]); } break; }
      i = d;
    }
    if (pts.length >= 8) rivers.push({ pts: smooth(new Float64Array(pts)) });
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

// The flow a result has near a pixel of its own mosaic (the largest within `r` cells):
// what a finer mosaic asks at its edge.
export function flowAt(res, x, y, r = 1) {
  const W = res.W, xi = Math.floor(x), yi = Math.floor(y); let m = 0;
  for (let b = yi - r; b <= yi + r; b++) for (let a = xi - r; a <= xi + r; a++) { if (a < 0 || b < 0 || a >= W || b >= W) continue; const v = res.q[b * W + a]; if (v > m) m = v; }
  return m;
}

// What the height code needs of a result, as flat arrays (see DemSet.setRing):
//   segs  Float32Array, ten numbers a stretch of river: x0, y0, x1, y1 (pixels), the water's
//         level at both ends (m), its half width at both ends (m), its depth at both ends (m)
//   grid  cells of GRID pixels: gridStart[cell] .. gridStart[cell + 1] index gridItems, the
//         stretches that can reach into that cell (their width and banks counted)
//   lake  Uint16Array W x W: water level = v / 4 - 500 m (0: none), spread two pixels past
//         each lake's edge so a place on its shore can read it
// and it lowers `h` under the lakes to a bed that falls away from their shores.
export const GRID = 8;
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
    // spread the levels two pixels outward
    for (let pass = 0; pass < 2; pass++) {
      const src = lake.slice();
      for (let y = 1; y < W - 1; y++) for (let x = 1, o = y * W + 1; x < W - 1; x++, o++) {
        if (src[o]) continue;
        const v = src[o - 1] || src[o + 1] || src[o - W] || src[o + W] || src[o - W - 1] || src[o - W + 1] || src[o + W - 1] || src[o + W + 1];
        if (v) lake[o] = v;
      }
    }
  }
  // --- rivers as stretches, and the grid that finds them
  let count = 0; for (const r of rivers) count += r.pts.length / 4 - 1;
  const segs = new Float32Array(count * 10), G = W / GRID, cells = Array.from({ length: G * G }, () => null);
  let o = 0, k = 0;
  for (const r of rivers) {
    const p = r.pts;
    for (let i = 0; i + 4 < p.length; i += 4, k++) {
      // (not where it runs through a lake or into the sea: that water is drawn already)
      const xi = Math.min(W - 1, Math.max(0, Math.floor(p[i]))), yi = Math.min(W - 1, Math.max(0, Math.floor(p[i + 1])));
      if (res.lake[yi * W + xi] || h[yi * W + xi] <= 0) continue;
      const a0 = riverWidth(p[i + 3]) / 2, a1 = riverWidth(p[i + 7]) / 2;
      segs[o] = p[i]; segs[o + 1] = p[i + 1]; segs[o + 2] = p[i + 4]; segs[o + 3] = p[i + 5];
      segs[o + 4] = p[i + 2]; segs[o + 5] = p[i + 6]; segs[o + 6] = a0; segs[o + 7] = a1; segs[o + 8] = riverDepth(p[i + 3]); segs[o + 9] = riverDepth(p[i + 7]);
      const pad = (Math.max(a0, a1) * 2.2 + 12) / cell + 0.5;
      const x0 = Math.max(0, Math.floor((Math.min(p[i], p[i + 4]) - pad) / GRID)), x1 = Math.min(G - 1, Math.floor((Math.max(p[i], p[i + 4]) + pad) / GRID));
      const y0 = Math.max(0, Math.floor((Math.min(p[i + 1], p[i + 5]) - pad) / GRID)), y1 = Math.min(G - 1, Math.floor((Math.max(p[i + 1], p[i + 5]) + pad) / GRID));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) (cells[y * G + x] || (cells[y * G + x] = [])).push(o / 10);
      o += 10;
    }
  }
  const gridStart = new Int32Array(G * G + 1); let total = 0;
  for (let c = 0; c < G * G; c++) { gridStart[c] = total; total += cells[c] ? cells[c].length : 0; }
  gridStart[G * G] = total;
  const gridItems = new Int32Array(total);
  for (let c = 0; c < G * G; c++) if (cells[c]) gridItems.set(cells[c], gridStart[c]);
  return { segs: segs.slice(0, o), gridStart, gridItems, lake: any ? lake : null };
}
