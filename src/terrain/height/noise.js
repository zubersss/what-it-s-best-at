// Fast 3-D gradient noise and integer hashing. Pure JS, allocation-free.
// Coordinates may be large (planet scale in metres times frequency) — doubles keep the
// fractional part exact, and the lattice wraps every 1024 cells.

const SIZE = 1024, MASK = SIZE - 1;
const P = new Uint16Array(SIZE * 2);
const GX = new Float64Array(16), GY = new Float64Array(16), GZ = new Float64Array(16);

(function init() {
  let s = 0x9e3779b9 >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const p = new Uint16Array(SIZE);
  for (let i = 0; i < SIZE; i++) p[i] = i;
  for (let i = SIZE - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < SIZE * 2; i++) P[i] = p[i & MASK];
  // 12 edge directions of a cube (+4 repeats), as in improved Perlin noise.
  const g = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [0, -1, 1], [-1, 1, 0], [0, -1, -1]];
  for (let i = 0; i < 16; i++) { GX[i] = g[i][0]; GY[i] = g[i][1]; GZ[i] = g[i][2]; }
})();

// Returns roughly [-1, 1].
export function noise3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  x -= fx; y -= fy; z -= fz;
  const X = fx & MASK, Y = fy & MASK, Z = fz & MASK;
  const u = x * x * x * (x * (x * 6 - 15) + 10);
  const v = y * y * y * (y * (y * 6 - 15) + 10);
  const w = z * z * z * (z * (z * 6 - 15) + 10);
  const A = P[X] + Y, B = P[X + 1] + Y;
  const AA = P[A & MASK] + Z, AB = P[(A + 1) & MASK] + Z, BA = P[B & MASK] + Z, BB = P[(B + 1) & MASK] + Z;
  const x1 = x - 1, y1 = y - 1, z1 = z - 1;
  let h = P[AA & MASK] & 15; const n000 = GX[h] * x + GY[h] * y + GZ[h] * z;
  h = P[BA & MASK] & 15; const n100 = GX[h] * x1 + GY[h] * y + GZ[h] * z;
  h = P[AB & MASK] & 15; const n010 = GX[h] * x + GY[h] * y1 + GZ[h] * z;
  h = P[BB & MASK] & 15; const n110 = GX[h] * x1 + GY[h] * y1 + GZ[h] * z;
  h = P[(AA + 1) & MASK] & 15; const n001 = GX[h] * x + GY[h] * y + GZ[h] * z1;
  h = P[(BA + 1) & MASK] & 15; const n101 = GX[h] * x1 + GY[h] * y + GZ[h] * z1;
  h = P[(AB + 1) & MASK] & 15; const n011 = GX[h] * x + GY[h] * y1 + GZ[h] * z1;
  h = P[(BB + 1) & MASK] & 15; const n111 = GX[h] * x1 + GY[h] * y1 + GZ[h] * z1;
  const nx00 = n000 + u * (n100 - n000), nx10 = n010 + u * (n110 - n010);
  const nx01 = n001 + u * (n101 - n001), nx11 = n011 + u * (n111 - n011);
  const nxy0 = nx00 + v * (nx10 - nx00), nxy1 = nx01 + v * (nx11 - nx01);
  return (nxy0 + w * (nxy1 - nxy0)) * 1.05;
}

// Integer lattice hash -> uint32. Used for craters and per-band randomness.
export function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ Math.imul(seed | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

export function hash1(i, seed) { return hash3(i, 0x51ed, 0x2f, seed) / 4294967296; }

// Smooth 1-D value noise in [0, 1].
export function vnoise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const a = hash1(i, seed), b = hash1(i + 1, seed);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

export function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
