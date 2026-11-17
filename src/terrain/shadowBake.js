// Terrain sun shadows by ray-marching the height function toward the Sun. Runs in the
// chunk workers. Baked into one small map per chunk, and used for single-point queries
// (rocks, the ship) so everything agrees with the terrain.
import { faceToDir, nodeEdge } from './cubeSphere.js';

const SUN_HALF_ANGLE_MIN = 0.0015;

export class ShadowBaker {
  constructor(hs, cfg, world) {
    this.hs = hs;
    this.S = cfg.SHADOW_RES;
    this.ceiling = world.terrain.shadowCeiling ?? world.terrain.maxAltitude;   // rays above this are in the clear
    this.range = world.terrain.shadowRange ?? 150000;                           // metres
    this.out = null;
    this.dir = [0, 0, 0];
  }

  // Sun visibility (0..1) at a point `h` metres above datum along unit direction (dx,dy,dz).
  // minWL: detail limit of the receiver. sunHalf: the Sun's angular radius (rad).
  visibility(dx, dy, dz, h, sx, sy, sz, minWL, sunHalf) {
    const hs = this.hs, R = hs.radius;
    const mu = dx * sx + dy * sy + dz * sz;             // sine of the Sun's elevation here
    if (mu < -0.06) return 0;                            // well below the horizon
    const r0 = R + h + Math.max(0.03, minWL * 0.02);
    const px = dx * r0, py = dy * r0, pz = dz * r0;
    let t = Math.max(1.0, minWL * 0.75), minAngle = 1e9;
    const first = t, maxStep = 450, range = this.range, ceil = R + this.ceiling;
    for (let k = 0; k < 400 && t < range; k++) {
      const x = px + sx * t, y = py + sy * t, z = pz + sz * t;
      const r = Math.sqrt(x * x + y * y + z * z);
      if (r > ceil) break;
      const wl = Math.max(minWL, t * 0.1);
      const ground = hs.height(x / r, y / r, z / r, wl);
      const a = (r - R - ground) / t;                   // clearance angle of the ray over the terrain
      if (a < minAngle) { minAngle = a; if (a < -sunHalf * 1.5) return 0; }
      t += Math.min(maxStep, Math.max(first, t * 0.14));
    }
    const v = 0.5 + minAngle / (2 * Math.max(sunHalf, SUN_HALF_ANGLE_MIN));
    return v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
  }

  // Bakes an (S+1)^2 map for a chunk. `heights`/`dirs` may be supplied by the chunk builder
  // (stride = samples between shadow texels in those arrays); otherwise they are computed.
  bakeChunk(face, level, ix, iy, sun, sunHalf, grid) {
    const S = this.S, T = S + 1, hs = this.hs;
    const out = new Uint8Array(T * T);
    const size = 2 / (1 << level), a0 = -1 + ix * size, b0 = -1 + iy * size;
    const edge = nodeEdge(level, hs.radius);
    const minWL = 2 * edge / (grid ? grid.NR : S * 2);
    const dir = this.dir;
    const state = new Int16Array(T * T).fill(-1);
    const sample = (i, j) => {
      const o = j * T + i;
      if (state[o] >= 0) return state[o];
      let h;
      if (grid) {
        const s = (1 + j * grid.stride) * grid.M + 1 + i * grid.stride;
        dir[0] = grid.D[s * 3]; dir[1] = grid.D[s * 3 + 1]; dir[2] = grid.D[s * 3 + 2]; h = grid.H[s];
      } else {
        faceToDir(face, a0 + i / S * size, b0 + j / S * size, dir);
        h = hs.height(dir[0], dir[1], dir[2], minWL);
      }
      const v = Math.round(255 * this.visibility(dir[0], dir[1], dir[2], h, sun[0], sun[1], sun[2], minWL, sunHalf));
      state[o] = v; out[o] = v;
      return v;
    };
    // Coarse pass, then refine only the cells whose corners disagree.
    const C = 4;
    for (let j = 0; j <= S; j += C) for (let i = 0; i <= S; i += C) sample(i, j);
    for (let j = 0; j < S; j += C) for (let i = 0; i < S; i += C) {
      const a = state[j * T + i], b = state[j * T + i + C], c = state[(j + C) * T + i], d = state[(j + C) * T + i + C];
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      if (hi - lo <= 2) {
        for (let y = j; y <= j + C; y++) for (let x = i; x <= i + C; x++) { const o = y * T + x; if (state[o] < 0) { state[o] = a; out[o] = a; } }
      } else {
        for (let y = j; y <= j + C; y++) for (let x = i; x <= i + C; x++) sample(x, y);
      }
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
