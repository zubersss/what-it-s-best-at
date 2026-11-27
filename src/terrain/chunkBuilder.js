// Builds the data of one terrain chunk from the HeightSource. Runs in workers.
// Layout produced here must match terrainMaterial.js and chunkPool.js.
import { faceToDir, nodeEdge } from './cubeSphere.js';
import { toHalf } from './halfFloat.js';
import { FLOW_UNIT } from '../water/river.js';

// Running water in the normal map (read by riverShare and riverFlow in water/river.js): the
// normal x (1 + cv) + the flow x 2 cv / FLOW_UNIT, cv being the share of the texel that is
// river. n: the surface's normal; d: the place's direction from the world's centre; fe, fn:
// the flow (m/s east, north). Writes out[0..2].
export function riverNormal(n, d, fe, fn, cv, out) {
  const el = 1 / (Math.hypot(d[0], d[1]) || 1), ex = -d[1] * el, ey = d[0] * el;          // east; north = up x east
  const kx = -d[2] * ey, ky = d[2] * ex, kz = d[0] * ey - d[1] * ex, f2 = 2 * cv / FLOW_UNIT;
  out[0] = (1 + cv) * n[0] + (ex * fe + kx * fn) * f2; out[1] = (1 + cv) * n[1] + (ey * fe + ky * fn) * f2; out[2] = (1 + cv) * n[2] + kz * fn * f2;
  return out;
}

export function vertexCount(G) { return (G + 1) * (G + 1) + 4 * (G + 1); }

// The vertices of a chunk are kept in one layer of a texture, G + 1 texels wide: vertex v
// is texel (v mod width, v div width). The grid's rows come first, then the four skirts.
export function vertexLayer(G) { return [G + 1, G + 5]; }

// Sizes of the mip chain of a square texture T texels wide (halved and rounded down).
export function mipSizes(T) { const s = [T]; while (T > 1) { T >>= 1; s.push(T); } return s; }

// The next mip level of an n x n image with 4 channels, m = floor(n / 2) texels wide: every
// texel is the mean of the part of the image it covers (for an odd n that is a little more
// than two texels each way, so the weights come from the overlap).
function halve(src, n, dst, m, tmp) {
  const s = n / m;
  for (let j = 0; j < m; j++) {                       // rows first: n columns x m rows into tmp
    const y0 = j * s, y1 = y0 + s, a = Math.floor(y0), b = Math.min(n - 1, Math.ceil(y1) - 1);
    for (let i = 0; i < n; i++) {
      let r = 0, g = 0, bl = 0, al = 0;
      for (let y = a; y <= b; y++) {
        const w = Math.min(y + 1, y1) - Math.max(y, y0), o = (y * n + i) * 4;
        r += src[o] * w; g += src[o + 1] * w; bl += src[o + 2] * w; al += src[o + 3] * w;
      }
      const t = (j * n + i) * 4;
      tmp[t] = r / s; tmp[t + 1] = g / s; tmp[t + 2] = bl / s; tmp[t + 3] = al / s;
    }
  }
  for (let i = 0; i < m; i++) {
    const x0 = i * s, x1 = x0 + s, a = Math.floor(x0), b = Math.min(n - 1, Math.ceil(x1) - 1);
    for (let j = 0; j < m; j++) {
      let r = 0, g = 0, bl = 0, al = 0;
      for (let x = a; x <= b; x++) {
        const w = Math.min(x + 1, x1) - Math.max(x, x0), o = (j * n + x) * 4;
        r += tmp[o] * w; g += tmp[o + 1] * w; bl += tmp[o + 2] * w; al += tmp[o + 3] * w;
      }
      const t = (j * m + i) * 4;
      dst[t] = r / s; dst[t + 1] = g / s; dst[t + 2] = bl / s; dst[t + 3] = al / s;
    }
  }
}

// Shared index buffer: grid quads split along (i,j)-(i+1,j+1), then four skirt strips.
export function buildIndices(G) {
  const V = G + 1, idx = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const base = V * V;
  const edge = (e, k) => (e === 0 ? k : e === 1 ? G * V + k : e === 2 ? k * V : k * V + G);   // bottom, top, left, right
  for (let e = 0; e < 4; e++) for (let k = 0; k < G; k++) {
    const e0 = edge(e, k), e1 = edge(e, k + 1), s0 = base + e * V + k, s1 = s0 + 1;
    if (e === 0 || e === 3) idx.push(e0, s0, e1, e1, s0, s1); else idx.push(e0, e1, s0, e1, s1, s0);
  }
  return new Uint16Array(idx);
}

// Shared per-vertex grid coordinates (0..1), skirts repeat their edge vertex.
export function buildGridUVs(G) {
  const V = G + 1, uv = new Float32Array(vertexCount(G) * 2);
  let o = 0;
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { uv[o++] = i / G; uv[o++] = j / G; }
  for (let e = 0; e < 4; e++) for (let k = 0; k < V; k++) {
    const i = e === 0 || e === 1 ? k : e === 2 ? 0 : G, j = e === 0 ? 0 : e === 1 ? G : k;
    uv[o++] = i / G; uv[o++] = j / G;
  }
  return uv;
}

export class ChunkBuilder {
  constructor(hs, cfg, shadowBaker) {
    this.hs = hs; this.shadowBaker = shadowBaker; this.SR = cfg.SHADOW_RES;
    this.G = cfg.GRID; this.NR = cfg.NORMAL_RES;
    this.step = this.NR / this.G;
    this.M = this.NR + 3;
    const M = this.M;
    this.H = new Float64Array(M * M);
    this.Wd = new Float32Array(M * M);          // how deep the water is at each sample (0 on land)
    this.Fl = new Float32Array(M * M * 2);      // how the water runs at each sample (m/s toward east and north; 0 on land and still water)
    this.Cv = new Float32Array(M * M * 2);      // the share of each sample that is river (0..1), and that river's depth (m): see build
    this.near = [0, 0, 0, 0, 0];
    this.P = new Float64Array(M * M * 3);
    this.D = new Float64Array(M * M * 3);
    this.hp = new Float64Array((this.G + 1) * (this.G + 1));
    this.hv = new Float64Array((this.G + 1) * (this.G + 1));
    this.dir = [0, 0, 0];
    // the normal map and its mip chain, as floats (scratch), and where each level starts
    this.mips = mipSizes(this.NR + 1);
    this.nf = this.mips.map((n) => new Float32Array(n * n * 4));
    this.nTexels = this.mips.reduce((a, n) => a + n * n, 0);
    this.tmp = new Float32Array(this.mips[0] * this.mips[0] * 4);
  }

  // sun: [x,y,z] unit direction (planet-fixed) and sunHalf: its angular radius, for the baked shadow map.
  build(face, level, ix, iy, sun, sunHalf) {
    const { hs, G, NR, M, H, Wd, Fl, Cv, P, D, step } = this;
    const R = hs.radius;
    const size = 2 / (1 << level), a0 = -1 + ix * size, b0 = -1 + iy * size;
    const edge = nodeEdge(level, R);
    const minWL = 2 * edge / NR;
    const dir = this.dir;
    let minH = Infinity, maxH = -Infinity;
    faceToDir(face, a0 + size / 2, b0 + size / 2, dir);
    hs.prepare(dir[0], dir[1], dir[2], edge * 0.76);
    // A sample stands for the ground half a texel's diagonal round it. A river narrower than
    // that is not met sample by sample (it was there at one and not at the next: beads): each
    // sample takes the share of its own ground the nearest river covers, in its water or
    // beside it (hs.setRiverCover, hs.riverNear), and the river is not cut into ground this coarse.
    // ('cover: false' in the options: as it was, for the check to see the difference.)
    const coverHalf = this.noCover ? 0 : 0.7071 * edge / NR, near = this.near;
    if (hs.setRiverCover) hs.setRiverCover(coverHalf);
    for (let j = 0; j < M; j++) {
      const b = b0 + (j - 1) / NR * size;
      for (let i = 0; i < M; i++) {
        const a = a0 + (i - 1) / NR * size;
        faceToDir(face, a, b, dir);
        const h = hs.height(dir[0], dir[1], dir[2], minWL);
        const o = j * M + i, r = R + h;
        H[o] = h; Wd[o] = hs.waterDepth; Fl[o * 2] = hs.flowE; Fl[o * 2 + 1] = hs.flowN;
        Cv[o * 2] = 0;
        if (coverHalf > 0 && hs.riverNear(near)[0] < 1e8) {
          // (how much of the stretch from -coverHalf to +coverHalf round the sample lies within the river's two banks)
          const sd = near[0], a = near[1], lap = Math.min(sd + coverHalf, a) - Math.max(sd - coverHalf, -a);
          if (lap > 0) {
            const cv = Math.min(1, lap / (2 * coverHalf)), inside = sd < a, k = inside ? 0.3 + 0.7 * (1 - (sd / a) * (sd / a)) : 0.3;
            Cv[o * 2] = cv; Cv[o * 2 + 1] = inside ? near[2] * (1 - (sd / a) * (sd / a)) + 0.02 : 0.4 * near[2];
            // (in the water the flow is the height code's own, exactly; beside it the nearest river's, slowed as at a bank)
            if (hs.flowE === 0 && hs.flowN === 0) { Fl[o * 2] = near[3] * k; Fl[o * 2 + 1] = near[4] * k; }
          }
        }
        D[o * 3] = dir[0]; D[o * 3 + 1] = dir[1]; D[o * 3 + 2] = dir[2];
        P[o * 3] = dir[0] * r; P[o * 3 + 1] = dir[1] * r; P[o * 3 + 2] = dir[2] * r;
        if (h < minH) minH = h; if (h > maxH) maxH = h;
      }
    }
    if (hs.setRiverCover) hs.setRiverCover(0);
    hs.release();

    // Vertex heights are a small symmetric box average of the fine samples around each
    // vertex: the mesh cannot represent what only the normal map can resolve, and point
    // sampling that detail shows up as faceted, shimmering silhouettes. The window
    // shrinks toward the chunk edge so both neighbours compute identical edge vertices.
    const V = G + 1, hp = this.hp, hv = this.hv;
    const boxAvg = (si, sj, rad) => {
      let acc = 0;
      for (let y = sj - rad; y <= sj + rad; y++) { const o = y * M + si; for (let x = -rad; x <= rad; x++) acc += H[o + x]; }
      return acc / ((2 * rad + 1) * (2 * rad + 1));
    };
    const radV = Math.max(1, step >> 1), radP = radV * 2;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const si = 1 + i * step, sj = 1 + j * step;
      const border = Math.min(si, sj, M - 1 - si, M - 1 - sj);
      hv[j * V + i] = boxAvg(si, sj, Math.min(radV, border));
      // Parent-LOD height at the vertices the parent mesh also has (even ones): a wider average.
      if (level > 0 && !(i & 1) && !(j & 1)) hp[j * V + i] = boxAvg(si, sj, Math.min(radP, border));
    }
    if (level > 0) {
      for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
        const oi = i & 1, oj = j & 1;
        if (!oi && !oj) continue;
        if (oi && !oj) hp[j * V + i] = 0.5 * (hp[j * V + i - 1] + hp[j * V + i + 1]);
        else if (!oi && oj) hp[j * V + i] = 0.5 * (hp[(j - 1) * V + i] + hp[(j + 1) * V + i]);
        else hp[j * V + i] = 0.5 * (hp[(j - 1) * V + i - 1] + hp[(j + 1) * V + i + 1]);
      }
    }

    // Chunk origin: the centre vertex.
    const cs = (1 + NR / 2) * M + 1 + NR / 2, cv = (G / 2) * V + G / 2;
    const cr = R + hv[cv];
    const cx = D[cs * 3] * cr, cy = D[cs * 3 + 1] * cr, cz = D[cs * 3 + 2] * cr;

    // Vertices: xyz relative to the chunk's centre and the height above datum (verts), and
    // the height change toward the parent LOD (morph). One texture layer each (vertexLayer).
    const nv = vertexCount(G);
    const verts = new Float32Array(nv * 4), morph = new Float32Array(nv);
    let radius2 = 0;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const s = (1 + j * step) * M + 1 + i * step, v = j * V + i, r = R + hv[v];
      const x = D[s * 3] * r - cx, y = D[s * 3 + 1] * r - cy, z = D[s * 3 + 2] * r - cz;
      verts[v * 4] = x; verts[v * 4 + 1] = y; verts[v * 4 + 2] = z;
      verts[v * 4 + 3] = hv[v]; morph[v] = level > 0 ? hp[v] - hv[v] : 0;
      const d2 = x * x + y * y + z * z; if (d2 > radius2) radius2 = d2;
    }
    // Skirts hang below the four edges to hide LOD seams.
    const skirt = edge * 0.1 + 1;
    let o = V * V;
    for (let e = 0; e < 4; e++) for (let k = 0; k < V; k++, o++) {
      const i = e === 0 || e === 1 ? k : e === 2 ? 0 : G, j = e === 0 ? 0 : e === 1 ? G : k;
      const s = (1 + j * step) * M + 1 + i * step, v = j * V + i;
      verts[o * 4] = verts[v * 4] - D[s * 3] * skirt;
      verts[o * 4 + 1] = verts[v * 4 + 1] - D[s * 3 + 1] * skirt;
      verts[o * 4 + 2] = verts[v * 4 + 2] - D[s * 3 + 2] * skirt;
      verts[o * 4 + 3] = verts[v * 4 + 3]; morph[o] = morph[v];
    }

    const texel = edge / NR;

    // World-space normal map (RGBA16F): xyz normal, a = cavity occlusion (on water: 1 + depth). Its mip maps are
    // made here too and follow it in the same array, level after level: asking the GPU to
    // build them costs a render job per patch (and it cannot do one layer of a texture array).
    const T = NR + 1, nf = this.nf[0], rvn = [0, 0, 0], rvd = [0, 0, 0];
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const s = (j + 1) * M + i + 1;
      const l = (s - 1) * 3, r = (s + 1) * 3, d = (s - M) * 3, u = (s + M) * 3;
      const ux = P[r] - P[l], uy = P[r + 1] - P[l + 1], uz = P[r + 2] - P[l + 2];
      const vx = P[u] - P[d], vy = P[u + 1] - P[d + 1], vz = P[u + 2] - P[d + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= nl; ny *= nl; nz *= nl;
      // Cavity term from the immediate neighbours only (so it never changes across chunk edges):
      // texels sitting in a crease receive less sky light.
      const cav = ((H[s - 1] + H[s + 1] + H[s - M] + H[s + M]) * 0.25 - H[s]) / texel;
      // (water: the fourth number is 1 + its depth in metres instead: see terrainMaterial.js)
      const ao = Wd[s] > 0 ? 1 + Wd[s] : 1 / (1 + Math.max(0, cav) * 5.0);
      // (running water: the normal map holds twice (the surface's normal + the flow, in the
      // planet's axes, FLOW_UNIT m/s to one). Its length along the vertical, above one, says
      // how much of a texel is river, however texels and mip levels are blended; what is
      // left across the vertical is the flow. Land and still water keep a normal of length
      // one. Read in terrainMaterial.js: writer and reader change in the same edit.)
      // (cv: the share of the texel that is river. One in a river on ground fine enough to hold
      // it; on far ground what the nearest river covers of the texel, see the samples above.
      // The normal map holds the normal x (1 + cv) + the flow x 2 cv, the fourth number 1 + the
      // depth x cv: both go to nothing with the river's share, and blend as they should.)
      const fe = Fl[s * 2], fn = Fl[s * 2 + 1], covered = Cv[s * 2] > 0, cv = covered ? Cv[s * 2] : Wd[s] > 0 && (fe !== 0 || fn !== 0) ? 1 : 0;
      let a4 = ao;
      if (cv > 0) {
        rvd[0] = D[s * 3]; rvd[1] = D[s * 3 + 1]; rvd[2] = D[s * 3 + 2];
        // (in the river's water the normal written is the vertical, not the water's own: a river
        // falls as it runs, and the tilt of its surface read back as more flow (on a slope of
        // one in six 2.5 m/s more: every mountain brook was white water from end to end). The
        // shader lights water as level anyway. Beside the water it is the ground's.)
        if (Wd[s] > 0) { rvn[0] = rvd[0]; rvn[1] = rvd[1]; rvn[2] = rvd[2]; } else { rvn[0] = nx; rvn[1] = ny; rvn[2] = nz; }
        riverNormal(rvn, rvd, fe, fn, cv, rvn); nx = rvn[0]; ny = rvn[1]; nz = rvn[2];
        if (covered) a4 = 1 + cv * Cv[s * 2 + 1];
      }
      const t = (j * T + i) * 4;
      nf[t] = nx; nf[t + 1] = ny; nf[t + 2] = nz; nf[t + 3] = a4;
    }
    const normals = new Uint16Array(this.nTexels * 4);
    for (let l = 0, at = 0; l < this.mips.length; l++) {
      const n = this.mips[l], f = this.nf[l];
      if (l > 0) halve(this.nf[l - 1], this.mips[l - 1], f, n, this.tmp);
      for (let k = 0, e = n * n * 4; k < e; k++) normals[at + k] = toHalf(f[k]);
      at += n * n * 4;
    }

    const shadow = this.shadowBaker.bakeChunk(face, level, ix, iy, sun, sunHalf, { H, D, M, NR, stride: NR / this.SR });
    return { verts, morph, normals, shadow, center: [cx, cy, cz], radius: Math.sqrt(radius2) + skirt * 0.5, minH, maxH };
  }
}
