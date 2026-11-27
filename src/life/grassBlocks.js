// Which parts of a grass field are handed to the GPU at all (life/grass.js).
//
// A field is a square of cells round the eye, and every cell of it was drawn as an instance
// every frame: 147 000 cells of blades and 26 000 of flowers at Haven's opening view, 1.74
// million triangles, of which the vertex shader threw two in three out again (behind the eye,
// off the side of the picture, beyond the ring, on ground with no grass), each after its
// hashes, a table read and a projection, three times over (a blade is three vertices with
// nothing shared). Here the field is cut into NB x NB blocks of the window round the eye, and
// a block is handed over only if the shader could keep anything of it. The tests are the
// shader's own (BLADE_VERT, FLOWER_VERT: the ring's distances, `outside` with the field's
// reach, no grass or no flower in the table), asked of a box that holds every place the
// shader could ask them of: a block is left out only when the shader would throw out every
// vertex in it, so the picture is the same to the pixel.
//
// No DOM, no three: the game uses it, and its test in Node (scripts/grass-blocks-test.mjs).
// (12 a side: with 8 the test's views hand over 19 % of the blocks, with 12 15 %, with 16 14 %,
// and the choosing costs the page 0.15, 0.21 and 0.38 ms a frame on the build machine)
export const NB = 12;                // blocks a side
export const NBLOCKS = NB * NB;
export const blockWide = (grid) => Math.ceil(grid / NB);      // cells a side of a block (the last row and column may reach past the field: those cells are no cell)
const SLACK = 0.05;                  // metres the box is larger than the shader's own numbers say (32-bit sums there, 64-bit here)

// A ground table summed up, Q x Q entries to a cell: the lowest and highest ground, the most
// grass and the highest flower number among them. Kept in step with the table: touch() for
// every entry written, refresh() before the next question (build(): the whole of it).
export class TableSummary {
  // densOf: from an entry's flower number, the share of cells there that carry a flower (0..1)
  constructor(n, q = 4, densOf = null) {
    this.n = n; this.q = q; this.m = n / q; this.densOf = densOf;
    if (this.m !== Math.floor(this.m)) throw new Error(`a table of ${n} a side is not whole cells of ${q}`);
    const k = this.m * this.m;
    this.lo = new Float32Array(k); this.hi = new Float32Array(k); this.amount = new Float32Array(k); this.flower = new Float32Array(k); this.dens = new Float32Array(k);
    this.out = { lo: 0, hi: 0, amount: 0, flower: 0, dens: 0 };
    this.dirty = new Uint8Array(k); this.list = new Int32Array(k); this.dirtyN = 0;
    this.share = new Float32Array(n * n);      // densOf of every entry (the flowers' lists ask entry by entry)
  }

  // Entry (i, j) of the table (0 .. n - 1) has changed: its cell is summed up again by refresh().
  touch(i, j) { const c = Math.floor(j / this.q) * this.m + Math.floor(i / this.q); if (!this.dirty[c]) { this.dirty[c] = 1; this.list[this.dirtyN++] = c; } }

  // The cells touched since the last time, summed up again (a walk changes a few rows of a
  // table a frame: the whole of it summed again was half a millisecond a frame).
  refresh(data) {
    const { n, q, m, lo, hi, amount, flower } = this;
    for (let k = 0; k < this.dirtyN; k++) {
      const c = this.list[k], i0 = (c % m) * q, j0 = Math.floor(c / m) * q;
      let l = Infinity, h = -Infinity, a = 0, f = 0, dn = 0;
      for (let j = j0; j < j0 + q; j++) for (let i = i0; i < i0 + q; i++) {
        const o = (j * n + i) * 4, v = data[o];
        if (v < l) l = v;
        if (v > h) h = v;
        if (data[o + 1] > a) a = data[o + 1];
        if (data[o + 3] > f) f = data[o + 3];
        if (this.densOf) { const x = this.densOf(data[o + 3]); this.share[j * n + i] = x; if (x > dn) dn = x; }
      }
      lo[c] = l; hi[c] = h; amount[c] = a; flower[c] = f; this.dens[c] = dn; this.dirty[c] = 0;
    }
    // (the lowest and highest ground of the whole table: a block is asked about with these first)
    if (this.dirtyN) { let l = Infinity, h = -Infinity; for (let c = 0; c < lo.length; c++) { if (lo[c] < l) l = lo[c]; if (hi[c] > h) h = hi[c]; } this.allLo = l; this.allHi = h; }
    this.dirtyN = 0;
  }

  // data: the table's four numbers an entry (height, amount of grass, dryness, flowers)
  build(data) {
    // (every cell touched, and summed up by the one rule: refresh)
    for (let c = 0; c < this.dirty.length; c++) if (!this.dirty[c]) { this.dirty[c] = 1; this.list[this.dirtyN++] = c; }
    this.refresh(data);
  }

  // Over the entries i0..i1, j0..j1 (absolute numbers: the table wraps): this.out
  range(i0, i1, j0, j1) {
    const { q, m, out } = this, wrap = (x) => ((x % m) + m) % m;
    let a0 = Math.floor(i0 / q), a1 = Math.floor(i1 / q), b0 = Math.floor(j0 / q), b1 = Math.floor(j1 / q);
    if (a1 - a0 >= m) { a0 = 0; a1 = m - 1; }
    if (b1 - b0 >= m) { b0 = 0; b1 = m - 1; }
    let lo = Infinity, hi = -Infinity, amount = 0, flower = 0, dens = 0;
    for (let b = b0; b <= b1; b++) {
      const row = wrap(b) * m;
      for (let a = a0; a <= a1; a++) {
        const c = row + wrap(a);
        if (this.lo[c] < lo) lo = this.lo[c];
        if (this.hi[c] > hi) hi = this.hi[c];
        if (this.amount[c] > amount) amount = this.amount[c];
        if (this.flower[c] > flower) flower = this.flower[c];
        if (this.dens[c] > dens) dens = this.dens[c];
      }
    }
    out.lo = lo; out.hi = hi; out.amount = amount; out.flower = flower; out.dens = dens;
    return out;
  }
}

// Where the window's cells stand: the middle of window cell w (0 .. grid - 1 on each axis) is
// (w + phase) * spacing - half from the eye. (The shader had it from the cell's number on the
// ground, wrapped round the eye: mod((c - o + 0.5) * spacing - cam, grid * spacing) - half,
// which is the same place for the same cell.)
export const latticePhase = (cam, spacing) => { const x = 0.5 - cam / spacing; return x - Math.floor(x); };

// The blocks of a field that the shader could keep anything of. Returns how many; their
// numbers (bx + NB * by) go into `codes`.
//   f: { grid, spacing, half, jitter (how far a foot can stand from its cell's middle, m),
//        reach (the shader's `outside` margin, m), in0 (or null), out1, flowers (true: a field
//        of single flowers) }
//   v: { ce, cn, cu (the eye on the anchor's plane, m), ox, oy (the anchor from where the grass
//        began, m), curveX, curveY (uGrassCurve), E, N, U (the plane's axes in the scene's),
//        pv (projection x view, 16 numbers as three keeps them), p00, p11 }
//   table: { cell, sum: TableSummary }
export function visibleBlocks(f, v, table, codes) {
  const bw = blockWide(f.grid), S = f.spacing;
  const px = latticePhase(v.ce, S), py = latticePhase(v.cn, S);
  const m = f.reach + SLACK, mx = m * (1 + v.p00), my = m * (1 + Math.abs(v.p11));
  const pv = v.pv, E = v.E, N = v.N, U = v.U;
  // the shader's own test (`outside`), for every corner of a box: true when every foot in it is out of the picture
  const off = (x0, x1, y0, y1, z0, z1) => {
    let behind = true, left = true, right = true, below = true, above = true;
    for (let k = 0; k < 8; k++) {
      const x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, z = k & 4 ? z1 : z0;
      const rx = E[0] * x + N[0] * y + U[0] * z, ry = E[1] * x + N[1] * y + U[1] * z, rz = E[2] * x + N[2] * y + U[2] * z;
      const X = pv[0] * rx + pv[4] * ry + pv[8] * rz + pv[12], Y = pv[1] * rx + pv[5] * ry + pv[9] * rz + pv[13], W = pv[3] * rx + pv[7] * ry + pv[11] * rz + pv[15];
      if (!(W < -m)) behind = false;
      if (!(X > W + mx)) right = false;
      if (!(-X > W + mx)) left = false;
      if (!(Y > W + my)) above = false;
      if (!(-Y > W + my)) below = false;
      if (!(behind || left || right || below || above)) return false;
    }
    return true;
  };
  let count = 0;
  for (let by = 0; by < NB; by++) {
    const wy0 = by * bw, wy1 = Math.min(f.grid, wy0 + bw) - 1;
    if (wy1 < wy0) continue;
    const y0 = (wy0 + py) * S - f.half - f.jitter - SLACK, y1 = (wy1 + py) * S - f.half + f.jitter + SLACK;
    for (let bx = 0; bx < NB; bx++) {
      const wx0 = bx * bw, wx1 = Math.min(f.grid, wx0 + bw) - 1;
      if (wx1 < wx0) continue;
      const x0 = (wx0 + px) * S - f.half - f.jitter - SLACK, x1 = (wx1 + px) * S - f.half + f.jitter + SLACK;
      // -- the ring: wholly beyond where it has gone out, or wholly inside where it has not come in
      const nx = x0 > 0 ? x0 : x1 < 0 ? -x1 : 0, ny = y0 > 0 ? y0 : y1 < 0 ? -y1 : 0;
      if (nx * nx + ny * ny >= f.out1 * f.out1) continue;
      if (f.in0 != null) { const fx = Math.max(-x0, x1), fy = Math.max(-y0, y1); if (fx * fx + fy * fy <= f.in0 * f.in0) continue; }
      // -- in the picture at all? first with the whole table's lowest and highest ground (four
      // blocks in five go here, without a look at their own ground), then with the block's own
      const ax = Math.max(Math.abs(x0 + v.ce), Math.abs(x1 + v.ce)), ay = Math.max(Math.abs(y0 + v.cn), Math.abs(y1 + v.cn)), bend = (ax * ax + ay * ay) * v.curveY, lift = v.curveX - v.cu;
      if (off(x0, x1, y0, y1, table.sum.allLo + lift - bend - SLACK, table.sum.allHi + lift + SLACK)) continue;
      // -- the ground there: the table's entries the shader could read for any foot in the block
      const s = table.sum.range(Math.floor((x0 + v.ce + v.ox) / table.cell) - 1, Math.floor((x1 + v.ce + v.ox) / table.cell) + 2,
        Math.floor((y0 + v.cn + v.oy) / table.cell) - 1, Math.floor((y1 + v.cn + v.oy) / table.cell) + 2);
      if (!(s.amount > 0)) continue;                           // no grass anywhere in it: every blade's share is nothing
      if (f.flowers && (s.flower < 0.999 || s.amount < 0.0999)) continue;      // no kind of flower grows, or too little grass for one
      if (off(x0, x1, y0, y1, s.lo + lift - bend - SLACK, s.hi + lift + SLACK)) continue;
      codes[count++] = bx + NB * by;
    }
  }
  return count;
}

// ---- the single flowers: only the cells that can carry one
//
// A field of flowers is a lattice of cells, and one cell in a hundred carries a flower (a
// kind grows where the ground table says, and of the cells there the share its density
// gives, each by a number of its own: FLOWER_VERT, `h2.x >= ...`). Every cell of the window
// was handed over for the shader to say no to: 36 triangles a cell near the eye, 16 farther
// out. Here the cell's number is worked out as the shader works it out (hash2, in 32-bit
// sums), and a cell goes on the list unless its number is clear of the most flowers the
// ground could carry anywhere its plant could ask (the table's entries round it), with room
// to spare for a GPU that rounds a sum another way (MARGIN, and the two ends of 0..1, where a
// number that wraps is one side on one machine and the other on the next). The shader still
// decides, by its own number: nothing is left out that it would have drawn.
const f32 = Math.fround;
const C1 = f32(0.1031), C2 = f32(0.1030), C3 = f32(0.0973), C33 = f32(33.33);
// hash2(vec2(px, py)).x of the grass's shaders (GRASS_PRELUDE)
export function hash2x(px, py) {
  let qx = f32(px * C1), qy = f32(py * C2), qz = f32(px * C3);
  qx = f32(qx - Math.floor(qx)); qy = f32(qy - Math.floor(qy)); qz = f32(qz - Math.floor(qz));
  const d = f32(f32(f32(qx * f32(qy + C33)) + f32(qy * f32(qz + C33))) + f32(qz * f32(qx + C33)));
  qx = f32(qx + d); qy = f32(qy + d); qz = f32(qz + d);
  const x = f32(f32(qx + qy) * qz);
  return f32(x - Math.floor(x));
}
// (a sum rounded another way moves the number by some 0.003 for each last place of the dot
// product: the sums are of numbers near a hundred, multiplied together)
export const FLOWER_MARGIN = 0.03;
const FLOWER_SALT = f32(23.9);       // the shader's: h2 = hash2(cell + 23.9)

// The cells of a flower field's blocks (codes, count of them: from visibleBlocks) that can
// carry a flower. Their places in the window (x, y) go into `out`; returns how many.
//   f: as for visibleBlocks, and seed (the field's SEED), jitter (a plant's place from its
//      cell's middle, m); lat: the field's uLatOrigin (x, y: the anchor's cell modulo 4096)
//   table: { n, cell, data, sum } with sum.densOf; margin: FLOWER_MARGIN (a test's switch)
//   kept: { h: Float32Array(grid * grid), own: Int32Array(grid * grid).fill(-1) }, the field's
//      own: the numbers of the cells last asked about (a cell's number is the ground's: when the
//      window moves by a cell, one row of it is new, and a number is some forty sums)
export function flowerCells(f, v, table, codes, count, lat, out, margin = FLOWER_MARGIN, kept = null) {
  const bw = blockWide(f.grid), S = f.spacing, T = table.cell, N = table.n, share = table.sum.share;
  const px = latticePhase(v.ce, S), py = latticePhase(v.cn, S);
  const reachT = f.jitter + 0.5 * T + SLACK;          // how far from its cell's middle a plant can ask the table (its own place, and half an entry off)
  // (the ground's cell under the window's cell w is w + n0: the window stands on whole cells)
  const G = f.grid, nx0 = Math.floor((px * S - f.half + v.ce) / S), ny0 = Math.floor((py * S - f.half + v.cn) / S);
  const lx = ((nx0 + lat.x) % 4096 + 4096) % 4096, ly = ((ny0 + lat.y) % 4096 + 4096) % 4096, lo = margin, hi = 1 - margin;
  const KH = kept ? kept.h : null, KO = kept ? kept.own : null;
  let k = 0;
  for (let c = 0; c < count; c++) {
    const bx = codes[c] % NB, by = Math.floor(codes[c] / NB);
    const wx0 = bx * bw, wx1 = Math.min(G, wx0 + bw), wy0 = by * bw, wy1 = Math.min(G, wy0 + bw);
    // (the most flowers anywhere in the block: most cells are clear of that already)
    const x0 = (wx0 + px) * S - f.half - reachT, x1 = (wx1 - 1 + px) * S - f.half + reachT, y0 = (wy0 + py) * S - f.half - reachT, y1 = (wy1 - 1 + py) * S - f.half + reachT;
    const most = table.sum.range(Math.floor((x0 + v.ce + v.ox) / T) - 1, Math.floor((x1 + v.ce + v.ox) / T) + 2, Math.floor((y0 + v.cn + v.oy) / T) - 1, Math.floor((y1 + v.cn + v.oy) / T) + 2).dens;
    if (!(most > 0)) continue;
    const top = most + margin;
    for (let wy = wy0; wy < wy1; wy++) {
      const cy = (ly + wy) & 4095, ky = (cy % G) * G, idy = cy;
      let hy = -1;
      for (let wx = wx0; wx < wx1; wx++) {
        const cx = (lx + wx) & 4095, q = ky + cx % G, id = cx * 4096 + idy;
        let h;
        if (KO && KO[q] === id) h = KH[q];
        else { if (hy < 0) hy = f32(f32(cy + f.seed) + FLOWER_SALT); h = hash2x(f32(f32(cx + f.seed) + FLOWER_SALT), hy); if (KO) { KO[q] = id; KH[q] = h; } }
        if (h >= top && h > lo && h < hi) continue;
        // (the entries its plant could ask: the most flowers among them)
        const ax = (nx0 + wx + 0.5) * S + v.ox, ay = (ny0 + wy + 0.5) * S + v.oy;
        const i0 = Math.floor((ax - reachT) / T + 0.5), i1 = Math.floor((ax + reachT) / T + 0.5), j0 = Math.floor((ay - reachT) / T + 0.5), j1 = Math.floor((ay + reachT) / T + 0.5);
        let dn = 0;
        for (let j = j0; j <= j1; j++) { const row = (((j % N) + N) % N) * N; for (let i = i0; i <= i1; i++) { const x = share[row + ((i % N) + N) % N]; if (x > dn) dn = x; } }
        if (!(dn > 0) || (h >= dn + margin && h > lo && h < hi)) continue;
        out[k * 2] = wx; out[k * 2 + 1] = wy; k++;
      }
    }
  }
  return k;
}
