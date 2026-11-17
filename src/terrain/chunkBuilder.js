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
  constructor(hs, cfg, shadowBaker) {
    this.hs = hs; this.shadowBaker = shadowBaker; this.SR = cfg.SHADOW_RES;
    this.G = cfg.GRID; this.NR = cfg.NORMAL_RES;
    this.step = this.NR / this.G;
    this.M = this.NR + 3;
    const M = this.M;
    this.H = new Float64Array(M * M);
    this.P = new Float64Array(M * M * 3);
    this.D = new Float64Array(M * M * 3);
    this.hp = new Float64Array((this.G + 1) * (this.G + 1));
    this.hv = new Float64Array((this.G + 1) * (this.G + 1));
    this.dir = [0, 0, 0];
  }

  // sun: [x,y,z] unit direction (planet-fixed) and sunHalf: its angular radius, for the baked shadow map.
  build(face, level, ix, iy, sun, sunHalf) {
    const { hs, G, NR, M, H, P, D, step } = this;
    const R = hs.radius;
    const size = 2 / (1 << level), a0 = -1 + ix * size, b0 = -1 + iy * size;
    const edge = nodeEdge(level, R);
    const minWL = 2 * edge / NR;
    const dir = this.dir;
    let minH = Infinity, maxH = -Infinity;
    faceToDir(face, a0 + size / 2, b0 + size / 2, dir);
    hs.prepare(dir[0], dir[1], dir[2], edge * 0.76);
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

    const nv = vertexCount(G);
    const positions = new Float32Array(nv * 3), attrs = new Float32Array(nv * 2);
    let radius2 = 0;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const s = (1 + j * step) * M + 1 + i * step, v = j * V + i, r = R + hv[v];
      const x = D[s * 3] * r - cx, y = D[s * 3 + 1] * r - cy, z = D[s * 3 + 2] * r - cz;
      positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
      attrs[v * 2] = hv[v]; attrs[v * 2 + 1] = level > 0 ? hp[v] - hv[v] : 0;
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

    const texel = edge / NR;

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
      // Cavity term from the immediate neighbours only (so it never changes across chunk edges):
      // texels sitting in a crease receive less sky light.
      const cav = ((H[s - 1] + H[s + 1] + H[s - M] + H[s + M]) * 0.25 - H[s]) / texel;
      const ao = 1 / (1 + Math.max(0, cav) * 5.0);
      const t = (j * T + i) * 4;
      normals[t] = toHalf(nx); normals[t + 1] = toHalf(ny); normals[t + 2] = toHalf(nz); normals[t + 3] = toHalf(ao);
    }

    const shadow = this.shadowBaker.bakeChunk(face, level, ix, iy, sun, sunHalf, { H, D, M, NR, stride: NR / this.SR });
    return { positions, attrs, normals, shadow, center: [cx, cy, cz], radius: Math.sqrt(radius2) + skirt * 0.5, minH, maxH };
  }
}
