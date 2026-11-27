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
  constructor(n, q = 4) {
    this.n = n; this.q = q; this.m = n / q;
    if (this.m !== Math.floor(this.m)) throw new Error(`a table of ${n} a side is not whole cells of ${q}`);
    const k = this.m * this.m;
    this.lo = new Float32Array(k); this.hi = new Float32Array(k); this.amount = new Float32Array(k); this.flower = new Float32Array(k);
    this.out = { lo: 0, hi: 0, amount: 0, flower: 0 };
    this.dirty = new Uint8Array(k); this.list = new Int32Array(k); this.dirtyN = 0;
  }

  // Entry (i, j) of the table (0 .. n - 1) has changed: its cell is summed up again by refresh().
  touch(i, j) { const c = Math.floor(j / this.q) * this.m + Math.floor(i / this.q); if (!this.dirty[c]) { this.dirty[c] = 1; this.list[this.dirtyN++] = c; } }

  // The cells touched since the last time, summed up again (a walk changes a few rows of a
  // table a frame: the whole of it summed again was half a millisecond a frame).
  refresh(data) {
    const { n, q, m, lo, hi, amount, flower } = this;
    for (let k = 0; k < this.dirtyN; k++) {
      const c = this.list[k], i0 = (c % m) * q, j0 = Math.floor(c / m) * q;
      let l = Infinity, h = -Infinity, a = 0, f = 0;
      for (let j = j0; j < j0 + q; j++) for (let i = i0; i < i0 + q; i++) {
        const o = (j * n + i) * 4, v = data[o];
        if (v < l) l = v;
        if (v > h) h = v;
        if (data[o + 1] > a) a = data[o + 1];
        if (data[o + 3] > f) f = data[o + 3];
      }
      lo[c] = l; hi[c] = h; amount[c] = a; flower[c] = f; this.dirty[c] = 0;
    }
    this.dirtyN = 0;
  }

  // data: the table's four numbers an entry (height, amount of grass, dryness, flowers)
  build(data) {
    const { n, q, m, lo, hi, amount, flower } = this;
    lo.fill(Infinity); hi.fill(-Infinity); amount.fill(0); flower.fill(0);
    for (let j = 0; j < n; j++) {
      const row = Math.floor(j / q) * m;
      for (let i = 0; i < n; i++) {
        const o = (j * n + i) * 4, c = row + Math.floor(i / q), h = data[o];
        if (h < lo[c]) lo[c] = h;
        if (h > hi[c]) hi[c] = h;
        if (data[o + 1] > amount[c]) amount[c] = data[o + 1];
        if (data[o + 3] > flower[c]) flower[c] = data[o + 3];
      }
    }
  }

  // Over the entries i0..i1, j0..j1 (absolute numbers: the table wraps): this.out
  range(i0, i1, j0, j1) {
    const { q, m, out } = this, wrap = (x) => ((x % m) + m) % m;
    let a0 = Math.floor(i0 / q), a1 = Math.floor(i1 / q), b0 = Math.floor(j0 / q), b1 = Math.floor(j1 / q);
    if (a1 - a0 >= m) { a0 = 0; a1 = m - 1; }
    if (b1 - b0 >= m) { b0 = 0; b1 = m - 1; }
    let lo = Infinity, hi = -Infinity, amount = 0, flower = 0;
    for (let b = b0; b <= b1; b++) {
      const row = wrap(b) * m;
      for (let a = a0; a <= a1; a++) {
        const c = row + wrap(a);
        if (this.lo[c] < lo) lo = this.lo[c];
        if (this.hi[c] > hi) hi = this.hi[c];
        if (this.amount[c] > amount) amount = this.amount[c];
        if (this.flower[c] > flower) flower = this.flower[c];
      }
    }
    out.lo = lo; out.hi = hi; out.amount = amount; out.flower = flower;
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
const cc = new Float64Array(8 * 4);
export function visibleBlocks(f, v, table, codes) {
  const bw = blockWide(f.grid), S = f.spacing;
  const px = latticePhase(v.ce, S), py = latticePhase(v.cn, S);
  const m = f.reach + SLACK, mx = m * (1 + v.p00), my = m * (1 + Math.abs(v.p11));
  const pv = v.pv, E = v.E, N = v.N, U = v.U;
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
      // -- the ground there: the table's entries the shader could read for any foot in the block
      const s = table.sum.range(Math.floor((x0 + v.ce + v.ox) / table.cell) - 1, Math.floor((x1 + v.ce + v.ox) / table.cell) + 2,
        Math.floor((y0 + v.cn + v.oy) / table.cell) - 1, Math.floor((y1 + v.cn + v.oy) / table.cell) + 2);
      if (!(s.amount > 0)) continue;                           // no grass anywhere in it: every blade's share is nothing
      if (f.flowers && (s.flower < 0.999 || s.amount < 0.0999)) continue;      // no kind of flower grows, or too little grass for one
      // -- in the picture? the shader's own test, for every corner of the box the feet are in
      const ax = Math.max(Math.abs(x0 + v.ce), Math.abs(x1 + v.ce)), ay = Math.max(Math.abs(y0 + v.cn), Math.abs(y1 + v.cn));
      const z0 = s.lo + v.curveX - (ax * ax + ay * ay) * v.curveY - v.cu - SLACK, z1 = s.hi + v.curveX - v.cu + SLACK;
      for (let k = 0; k < 8; k++) {
        const x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, z = k & 4 ? z1 : z0;
        const rx = E[0] * x + N[0] * y + U[0] * z, ry = E[1] * x + N[1] * y + U[1] * z, rz = E[2] * x + N[2] * y + U[2] * z;
        cc[k * 4] = pv[0] * rx + pv[4] * ry + pv[8] * rz + pv[12];
        cc[k * 4 + 1] = pv[1] * rx + pv[5] * ry + pv[9] * rz + pv[13];
        cc[k * 4 + 3] = pv[3] * rx + pv[7] * ry + pv[11] * rz + pv[15];
      }
      let behind = true, left = true, right = true, below = true, above = true;
      for (let k = 0; k < 32; k += 4) {
        const X = cc[k], Y = cc[k + 1], W = cc[k + 3];
        if (!(W < -m)) behind = false;
        if (!(X > W + mx)) right = false;
        if (!(-X > W + mx)) left = false;
        if (!(Y > W + my)) above = false;
        if (!(-Y > W + my)) below = false;
      }
      if (behind || left || right || below || above) continue;
      codes[count++] = bx + NB * by;
    }
  }
  return count;
}
