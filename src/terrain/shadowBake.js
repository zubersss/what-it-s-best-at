// Terrain sun shadows by ray-marching the height function toward the Sun. Runs in the
// chunk workers. Baked into one small map per chunk, and used for single-point queries
// (rocks, the ship) so everything agrees with the terrain.
//
// A chunk bake is split by distance so that almost no ray does a long march:
//   inner  – every texel marches across the chunk's own height grid (bilinear lookups);
//   mid    – a 17x17 grid of rays continues from the chunk's edge out to 8 chunk widths;
//   far    – a 5x5 grid of rays covers the rest of the range (distant walls).
// The three minimum clearance angles are combined per texel.
import { faceToDir, dirToFace, nodeEdge } from './cubeSphere.js';
import { toHalf } from './halfFloat.js';

const SUN_HALF_ANGLE_MIN = 0.0015;
const MID = 16, FAR = 4;          // cells of the mid / far ray grids
const EDGE_CELLS = 10;            // how far past the chunk's own height grid a ray is still followed at full detail

export class ShadowBaker {
  constructor(hs, cfg, world) {
    this.hs = hs;
    this.S = cfg.SHADOW_RES;
    this.range = world.terrain.shadowRange ?? 150000;                           // metres
    this.dir = [0, 0, 0]; this.uv = [0, 0];
    const M = this.S + 3;
    this.H = new Float64Array(M * M);          // height grid for re-bakes
    this.midA = new Float32Array((MID + 1) * (MID + 1));
    this.farA = new Float32Array((FAR + 1) * (FAR + 1));
  }

  // Minimum clearance angle of the ray from (dx,dy,dz)*(R+h) toward the Sun over t in [t0, t1].
  // Returns early (with a very negative value) once the ray is clearly underground.
  // `hWL` is the detail limit `h` was sampled with. When the march starts with a much
  // coarser one, the ray starts from the ground as that coarser view has it (if higher):
  // a point in a hollow or under a ledge smaller than the first samples can resolve would
  // otherwise begin "underground" and come out dark (whole benches did, with straight
  // edges where chunks meet).
  _march(dx, dy, dz, h, sx, sy, sz, t0, t1, minWL, floorStep, stopAngle, hWL = 0) {
    const hs = this.hs, R = hs.radius;
    if (hWL > 0) {
      const wl0 = Math.max(minWL, t0 * 0.12);
      if (wl0 > hWL * 1.5) { const hc = hs.height(dx, dy, dz, wl0) + floorStep * 0.02; if (hc > h) h = hc; }
    }
    const r0 = R + h, ceil = R + hs.ceilingAt(dx, dy, dz);   // above this the ray is in the clear
    const px = dx * r0, py = dy * r0, pz = dz * r0;
    let t = t0, minAngle = 1e9;
    for (let k = 0; k < 400 && t < t1; k++) {
      const x = px + sx * t, y = py + sy * t, z = pz + sz * t;
      const r = Math.sqrt(x * x + y * y + z * z);
      if (r > ceil) break;
      const ground = hs.height(x / r, y / r, z / r, Math.max(minWL, t * 0.12));
      const a = (r - R - ground) / t;
      if (a < minAngle) { minAngle = a; if (a < stopAngle) return a; }
      t += Math.min(900, Math.max(floorStep, t * 0.16));
    }
    return minAngle;
  }

  // Sun visibility (0..1) at a point `h` metres above datum along unit direction (dx,dy,dz).
  visibility(dx, dy, dz, h, sx, sy, sz, minWL, sunHalf) {
    if (dx * sx + dy * sy + dz * sz < -0.06) return 0;      // Sun well below the horizon
    const first = Math.max(1.0, minWL * 0.75);
    const a = this._march(dx, dy, dz, h + Math.max(0.03, minWL * 0.02), sx, sy, sz, first, this.range, minWL, first, -sunHalf * 1.5);
    return toVisibility(a, sunHalf);
  }

  // Bakes an (S+1)^2 map for a chunk. `grid` = { H, D, M, NR, stride } comes from the chunk
  // builder (heights at NR cells across with a one-sample border, stride samples per shadow
  // texel). Without it (re-bake after the Sun moved) a coarser grid is computed here.
  bakeChunk(face, level, ix, iy, sun, sunHalf, grid) {
    const S = this.S, T = S + 1, hs = this.hs, R = hs.radius;
    const out = new Uint8Array(T * T);
    const size = 2 / (1 << level), a0 = -1 + ix * size, b0 = -1 + iy * size;
    const edge = nodeEdge(level, R);
    const dir = this.dir, uv = this.uv;
    const sx = sun[0], sy = sun[1], sz = sun[2];

    let H, M, cells, stride;
    if (grid) { H = grid.H; M = grid.M; cells = grid.NR; stride = grid.stride; }
    else {
      H = this.H; M = S + 3; cells = S; stride = 1;
      const wl = 2 * edge / S;
      faceToDir(face, a0 + size / 2, b0 + size / 2, dir);
      hs.prepare(dir[0], dir[1], dir[2], edge * 0.76);
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        faceToDir(face, a0 + (i - 1) / S * size, b0 + (j - 1) / S * size, dir);
        H[j * M + i] = hs.height(dir[0], dir[1], dir[2], wl);
      }
      hs.release();
    }
    const minWL = 2 * edge / cells, spacing = edge / cells;

    // Chunk-local affine model of the ray in grid space (exact enough below ~100 km chunks).
    faceToDir(face, a0 + size / 2, b0 + size / 2, dir);
    const cx = dir[0], cy = dir[1], cz = dir[2];
    const muC = cx * sx + cy * sy + cz * sz;
    if (muC < -0.08 && edge < 400000) return out;                 // night: all shadow
    const cosE = Math.sqrt(Math.max(0, 1 - muC * muC));
    let ux = 0, uy = 0, metresPerCell = spacing;
    if (cosE > 0.02) {
      const hx = (sx - muC * cx) / cosE, hy = (sy - muC * cy) / cosE, hz = (sz - muC * cz) / cosE;
      const delta = edge * 0.2;
      let qx = cx * R + hx * delta, qy = cy * R + hy * delta, qz = cz * R + hz * delta;
      const ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
      if (dirToFace(face, qx / ql, qy / ql, qz / ql, uv)) {
        const gx = (uv[0] - (a0 + size / 2)) / size * cells, gy = (uv[1] - (b0 + size / 2)) / size * cells;
        const gl = Math.hypot(gx, gy);
        if (gl > 1e-9) { ux = gx / gl; uy = gy / gl; metresPerCell = delta / gl; }
      }
    }
    const tPerCell = cosE > 0.02 ? metresPerCell / cosE : 1e12;    // ray length per grid cell crossed (at the chunk's centre)
    const stop = -sunHalf * 1.5, clampA = sunHalf * 2.5;

    // Distance (in cells) from a grid position to where the ray leaves the height grid.
    const exitCells = (gx, gy) => {
      let s = 1e9;
      if (ux > 1e-9) s = Math.min(s, (M - 1 - gx) / ux); else if (ux < -1e-9) s = Math.min(s, -gx / ux);
      if (uy > 1e-9) s = Math.min(s, (M - 1 - gy) / uy); else if (uy < -1e-9) s = Math.min(s, -gy / uy);
      return s;
    };
    const dirAt = (fi, fj) => faceToDir(face, a0 + fi * size, b0 + fj * size, dir);
    const heightAt = (gx, gy) => {
      const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, o = y0 * M + x0;
      const a = H[o], b = H[o + 1], c = H[o + M], d = H[o + M + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };

    // --- far field: 5x5 rays beyond 8 chunk widths
    const tMid = Math.min(this.range, edge * 8);
    const farA = this.farA, midA = this.midA;
    for (let j = 0; j <= FAR; j++) for (let i = 0; i <= FAR; i++) {
      dirAt(i / FAR, j / FAR);
      const gx = 1 + i / FAR * cells, gy = 1 + j / FAR * cells;
      let a = 1e9;
      // (a point where the Sun is below the horizon is settled per texel further down)
      if (dir[0] * sx + dir[1] * sy + dir[2] * sz >= -0.12 && tMid < this.range) a = this._march(dir[0], dir[1], dir[2], heightAt(Math.min(gx, M - 1.001), Math.min(gy, M - 1.001)) + spacing * 0.05, sx, sy, sz, tMid, this.range, minWL, spacing * 2, stop, minWL);
      farA[j * (FAR + 1) + i] = Math.max(-clampA, Math.min(clampA, a));
    }
    // --- mid field: 17x17 rays from the edge of the height grid out to 8 chunk widths
    hs.prepare(cx, cy, cz, edge * 9);
    for (let j = 0; j <= MID; j++) for (let i = 0; i <= MID; i++) {
      dirAt(i / MID, j / MID);
      const gx = 1 + i / MID * cells, gy = 1 + j / MID * cells;
      let a = 1e9;
      const fa = bil(farA, FAR + 1, i / MID * FAR, j / MID * FAR);
      if (fa > stop && dir[0] * sx + dir[1] * sy + dir[2] * sz >= -0.12) {     // not already dark from far away, not night
        const tStart = Math.max(spacing * 1.5, exitCells(gx, gy) * tPerCell * 0.9);
        if (tStart < tMid) a = this._march(dir[0], dir[1], dir[2], heightAt(Math.min(gx, M - 1.001), Math.min(gy, M - 1.001)) + spacing * 0.05, sx, sy, sz, tStart, tMid, Math.max(minWL * 2, edge / 6), spacing * 2, stop, minWL);
      }
      midA[j * (MID + 1) + i] = Math.max(-clampA, Math.min(clampA, a));
    }
    hs.release();
    // --- inner field: every texel walks the chunk's own height grid, no further than the
    // shadow range, with the Sun's height at that texel (on a chunk that spans a good part
    // of the planet the Sun is up at one end and down at the other).
    const maxG = M - 1.001;
    let lowest = 1e9;
    for (let k = 0; k < M * M; k++) if (H[k] < lowest) lowest = H[k];
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      const outer = Math.min(bil(midA, MID + 1, i / S * MID, j / S * MID), bil(farA, FAR + 1, i / S * FAR, j / S * FAR));
      let minAngle = outer;
      const g0x = 1 + i * stride, g0y = 1 + j * stride;
      const h0 = H[g0y * M + g0x] + spacing * 0.04;
      dirAt(i / S, j / S);
      const mu = dir[0] * sx + dir[1] * sy + dir[2] * sz;
      // night: the Sun is below even the lowered horizon that this texel's height gives it
      if (mu < -(Math.max(0.06, Math.sqrt(2 * Math.max(h0 - lowest, 0) / R)) + sunHalf * 1.5)) minAngle = -1;
      else if (minAngle > stop && cosE > 0.02) {
        const cosL = Math.sqrt(Math.max(4e-4, 1 - mu * mu)), tCell = metresPerCell / cosL, curve = cosL * cosL / (2 * R);
        const sExit = Math.min(exitCells(g0x, g0y), this.range / tCell);
        for (let s = 0.8; s < sExit; s += Math.min(1.5, Math.max(0.8, s * 0.2))) {
          const gx = g0x + ux * s, gy = g0y + uy * s;
          if (gx < 0 || gy < 0 || gx > maxG || gy > maxG) break;
          const t = s * tCell;
          const a = (h0 + t * mu + t * t * curve - heightAt(gx, gy)) / t;
          if (a < minAngle) { minAngle = a; if (a < stop) break; }
        }
        // with no grid cell inside the range (planet-sized chunks) the horizon is the curve itself
        if (sExit <= 0.8 && mu < minAngle) minAngle = mu;
        // A ray that leaves the grid after only a few cells has seen almost nothing of the
        // ground next to it, and the coarse rays that take over skip small relief: without
        // this stretch at full detail the texels along the Sun-ward edge disagree with the
        // neighbouring chunk's and the border shows as a straight line at a low Sun.
        if (minAngle > stop && sExit < EDGE_CELLS && sExit * tCell < this.range) {
          const a = this._march(dir[0], dir[1], dir[2], h0, sx, sy, sz, Math.max(sExit, 0.8) * tCell, Math.min(this.range, EDGE_CELLS * tCell), minWL, spacing * 1.5, stop);
          if (a < minAngle) minAngle = a;
        }
      } else if (cosE <= 0.02 && mu < minAngle) minAngle = mu;
      out[j * T + i] = Math.round(255 * toVisibility(minAngle, sunHalf));
    }
    return out;
  }

  // Terrain shadow in the air: for each cell of an n x n map on the tangent plane at
  // `center` (unit direction; `east`/`north` unit vectors, +-`extent` metres), the altitude
  // above datum (km, half floats) below which the Sun is hidden by terrain. One coarse
  // height sample per step along the ray toward the Sun: the ray that leaves a column at
  // altitude h passes a place at (altitude of the h = 0 ray) + h, so the column is
  // shadowed up to the largest (ground - altitude of the h = 0 ray) found on the way.
  bakeAir(center, east, north, extent, n, sun) {
    const hs = this.hs, R = hs.radius, out = new Uint16Array(n * n), cell = 2 * extent / n;
    const sx = sun[0], sy = sun[1], sz = sun[2];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n * 2 - 1) * extent, y = ((j + 0.5) / n * 2 - 1) * extent;
      const z = Math.sqrt(Math.max(0, R * R - x * x - y * y));
      const px = east[0] * x + north[0] * y + center[0] * z, py = east[1] * x + north[1] * y + center[1] * z, pz = east[2] * x + north[2] * y + center[2] * z;
      const ceiling = hs.ceilingAt(px / R, py / R, pz / R), cap = ceiling + 30000;
      let top = hs.height(px / R, py / R, pz / R, cell * 2);          // the ground itself
      for (let t = cell * 0.75; t < this.range; t *= 1.3) {
        const qx = px + sx * t, qy = py + sy * t, qz = pz + sz * t;
        const r = Math.sqrt(qx * qx + qy * qy + qz * qz), ray = r - R;
        if (ray + top > ceiling) break;                                // nothing ahead is tall enough
        const need = hs.height(qx / r, qy / r, qz / r, Math.max(cell * 2, t * 0.12)) - ray;
        if (need > top) { top = need; if (top > cap) break; }           // (night: the planet itself)
      }
      out[j * n + i] = toHalf(Math.min(top, cap) / 1000);
    }
    return out;
  }

  // points: Float64Array of planet-centred positions (x,y,z per point). Returns Float32Array.
  bakePoints(points, sun, sunHalf, minWL) {
    const n = points.length / 3, out = new Float32Array(n), R = this.hs.radius;
    for (let i = 0; i < n; i++) {
      const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
      const r = Math.sqrt(x * x + y * y + z * z);
      out[i] = this.visibility(x / r, y / r, z / r, r - R, sun[0], sun[1], sun[2], minWL, sunHalf);
    }
    return out;
  }
}

function toVisibility(minAngle, sunHalf) {
  const v = 0.5 + minAngle / (2 * Math.max(sunHalf, SUN_HALF_ANGLE_MIN));
  return v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
}

function bil(A, W, x, y) {
  const x0 = Math.min(W - 2, x | 0), y0 = Math.min(W - 2, y | 0), fx = x - x0, fy = y - y0, o = y0 * W + x0;
  const a = A[o], b = A[o + 1], c = A[o + W], d = A[o + W + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
