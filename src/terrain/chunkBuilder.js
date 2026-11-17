// Builds the data of one terrain chunk from the HeightSource. Runs in workers.
// Layout produced here must match terrainMaterial.js and chunkPool.js.
import { faceToDir, nodeEdge } from './cubeSphere.js';
import { toHalf } from './halfFloat.js';

export function vertexCount(G) { return (G + 1) * (G + 1) + 4 * (G + 1); }

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
  constructor(hs, cfg) {
    this.hs = hs;
    this.G = cfg.GRID; this.NR = cfg.NORMAL_RES;
    this.step = this.NR / this.G;
    this.M = this.NR + 3;
    const M = this.M;
    this.H = new Float64Array(M * M);
    this.P = new Float64Array(M * M * 3);
    this.D = new Float64Array(M * M * 3);
    this.blurA = new Float64Array(M * M);
    this.blurB = new Float64Array(M * M);
    this.hp = new Float64Array((this.G + 1) * (this.G + 1));
    this.dir = [0, 0, 0];
  }

  build(face, level, ix, iy) {
    const { hs, G, NR, M, H, P, D, step } = this;
    const R = hs.radius;
    const size = 2 / (1 << level), a0 = -1 + ix * size, b0 = -1 + iy * size;
    const edge = nodeEdge(level, R);
    const minWL = 2 * edge / NR;
    const dir = this.dir;
    let minH = Infinity, maxH = -Infinity;
    for (let j = 0; j < M; j++) {
      const b = b0 + (j - 1) / NR * size;
      for (let i = 0; i < M; i++) {
        const a = a0 + (i - 1) / NR * size;
        faceToDir(face, a, b, dir);
        const h = hs.height(dir[0], dir[1], dir[2], minWL);
        const o = j * M + i, r = R + h;
        H[o] = h;
        D[o * 3] = dir[0]; D[o * 3 + 1] = dir[1]; D[o * 3 + 2] = dir[2];
        P[o * 3] = dir[0] * r; P[o * 3 + 1] = dir[1] * r; P[o * 3 + 2] = dir[2] * r;
        if (h < minH) minH = h; if (h > maxH) maxH = h;
      }
    }

    // Chunk origin: the centre sample.
    const cs = (1 + NR / 2) * M + 1 + NR / 2;
    const cx = P[cs * 3], cy = P[cs * 3 + 1], cz = P[cs * 3 + 2];

    // Parent-LOD heights at even vertices, for geomorphing.
    const V = G + 1, hp = this.hp;
    if (level > 0) {
      for (let j = 0; j < V; j += 2) for (let i = 0; i < V; i += 2) {
        const o = ((1 + j * step) * M + 1 + i * step) * 3;
        hp[j * V + i] = hs.height(D[o], D[o + 1], D[o + 2], minWL * 2);
      }
      for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
        const oi = i & 1, oj = j & 1;
        if (!oi && !oj) continue;
        if (oi && !oj) hp[j * V + i] = 0.5 * (hp[j * V + i - 1] + hp[j * V + i + 1]);
        else if (!oi && oj) hp[j * V + i] = 0.5 * (hp[(j - 1) * V + i] + hp[(j + 1) * V + i]);
        else hp[j * V + i] = 0.5 * (hp[(j - 1) * V + i - 1] + hp[(j + 1) * V + i + 1]);
      }
    }

    const nv = vertexCount(G);
    const positions = new Float32Array(nv * 3), attrs = new Float32Array(nv * 2);
    let radius2 = 0;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const s = (1 + j * step) * M + 1 + i * step, v = j * V + i;
      const x = P[s * 3] - cx, y = P[s * 3 + 1] - cy, z = P[s * 3 + 2] - cz;
      positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
      attrs[v * 2] = H[s]; attrs[v * 2 + 1] = level > 0 ? hp[v] - H[s] : 0;
      const d2 = x * x + y * y + z * z; if (d2 > radius2) radius2 = d2;
    }
    // Skirts hang below the four edges to hide LOD seams.
    const skirt = edge * 0.1 + 1;
    let o = V * V;
    for (let e = 0; e < 4; e++) for (let k = 0; k < V; k++, o++) {
      const i = e === 0 || e === 1 ? k : e === 2 ? 0 : G, j = e === 0 ? 0 : e === 1 ? G : k;
      const s = (1 + j * step) * M + 1 + i * step, v = j * V + i;
      positions[o * 3] = positions[v * 3] - D[s * 3] * skirt;
      positions[o * 3 + 1] = positions[v * 3 + 1] - D[s * 3 + 1] * skirt;
      positions[o * 3 + 2] = positions[v * 3 + 2] - D[s * 3 + 2] * skirt;
      attrs[o * 2] = attrs[v * 2]; attrs[o * 2 + 1] = attrs[v * 2 + 1];
    }

    // Cavity term: how far a texel sits below its neighbourhood (cheap baked occlusion).
    const A = this.blurA, B = this.blurB, rad = 6;
    for (let j = 0; j < M; j++) {
      let acc = 0, n = 0;
      for (let i = -rad; i < M; i++) {
        const add = i + rad; if (add < M) { acc += H[j * M + add]; n++; }
        const rem = i - rad - 1; if (rem >= 0) { acc -= H[j * M + rem]; n--; }
        if (i >= 0) A[j * M + i] = acc / n;
      }
    }
    for (let i = 0; i < M; i++) {
      let acc = 0, n = 0;
      for (let j = -rad; j < M; j++) {
        const add = j + rad; if (add < M) { acc += A[add * M + i]; n++; }
        const rem = j - rad - 1; if (rem >= 0) { acc -= A[rem * M + i]; n--; }
        if (j >= 0) B[j * M + i] = acc / n;
      }
    }
    const texel = edge / NR, cavScale = 1 / (texel * rad * 0.9);

    // World-space normal map (RGBA16F): xyz normal, a = cavity occlusion.
    const T = NR + 1;
    const normals = new Uint16Array(T * T * 4);
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const s = (j + 1) * M + i + 1;
      const l = (s - 1) * 3, r = (s + 1) * 3, d = (s - M) * 3, u = (s + M) * 3;
      const ux = P[r] - P[l], uy = P[r + 1] - P[l + 1], uz = P[r + 2] - P[l + 2];
      const vx = P[u] - P[d], vy = P[u + 1] - P[d + 1], vz = P[u + 2] - P[d + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= nl; ny *= nl; nz *= nl;
      const cav = (B[s] - H[s]) * cavScale;
      const ao = 1 / (1 + Math.max(0, cav) * 2.2);
      const t = (j * T + i) * 4;
      normals[t] = toHalf(nx); normals[t + 1] = toHalf(ny); normals[t + 2] = toHalf(nz); normals[t + 3] = toHalf(ao);
    }

    return { positions, attrs, normals, center: [cx, cy, cz], radius: Math.sqrt(radius2) + skirt * 0.5, minH, maxH };
  }
}
