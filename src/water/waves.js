// Waves on open water: a sum of sines that the ground shader draws (terrainMaterial.js) and
// that the game can ask the height of at a place (what floats, floats on them).
//
// Each wave is a whole number of cycles across the 64 m detail tile in both directions
// (i, j), so the pattern joins across terrain patches, which know their place in the tile
// only modulo one tile. A wave runs at deep-water speed for its length and takes part by
// how well it lines up with the wind. Lengths from 64 m (swell) down to 2 m (chop); what
// is shorter is the ripple texture's.
import { dirToFace, FACES } from '../terrain/cubeSphere.js';

const DETAIL_TILE = 64;          // metres: the same number as terrainMaterial.js's (which imports this file)

// [i, j, share of the wave height, lifts the surface itself (true) or only its shading]
export const WAVES = [
  [1, 0, 1.00, true], [0, 1, 1.00, true], [1, 1, 0.80, true], [1, -1, 0.80, true],        // 64 and 45 m
  [2, 1, 0.55, true], [1, 2, 0.55, true], [2, -1, 0.55, true], [-1, 2, 0.55, true],       // 29 m
  [5, 2, 0.30, false], [2, 5, 0.30, false], [5, -3, 0.28, false],                         // 12 m
  [11, 4, 0.16, false], [4, 11, 0.16, false], [-8, 9, 0.15, false],                       // 5.5 m
  [23, 9, 0.085, false], [9, 23, 0.085, false], [-17, 18, 0.08, false],                   // 2.6 m: chop
].map(([i, j, share, lift]) => {
  const k = 2 * Math.PI * Math.hypot(i, j) / DETAIL_TILE;          // radians per metre
  return { i, j, share, lift, k, omega: Math.sqrt(9.81 * k), len: 2 * Math.PI / k, dx: i / Math.hypot(i, j), dy: j / Math.hypot(i, j) };
});
export const LIFTED = WAVES.filter((w) => w.lift).length;

// The height of the waves a wind raises (m, the amplitude scale of the table): about a
// quarter of the significant wave height of a fully grown sea, and never so tall that a
// 64 m wave would break.
// (never less than a low swell: the open sea is not flat in a calm, waves raised by winds
// far away keep rolling through it. In windless air the sea was a sheet of glass to the
// horizon. Lakes and rivers take an eighth of this, see `inland` in the ground shader.)
export function waveScale(windSpeed) { return Math.min(3.2, Math.max(0.3, 0.012 * windSpeed * windSpeed + 0.03)); }

// How many waves of the table are at least `px` pixels long when a pixel covers `mpp` metres.
export const WAVE_STEPS = (() => { const out = []; let n = 0; while (n < WAVES.length) { const len = WAVES[n].len; while (n < WAVES.length && Math.abs(WAVES[n].len - len) < len * 0.3) n++; out.push([n, len]); } return out; })();

// GLSL: wave(uv, t, wind2, scale, n) -> xy the surface's slope along the tile's two axes,
// z its height (m). uv: detail-tile coordinates; wind2: the wind along those axes (unit);
// n: how many waves of the table to add (the lifted ones come first).
export const WAVE_GLSL = /* glsl */`
const int N_WAVES = ${WAVES.length};
const vec4 WAVE_A[N_WAVES] = vec4[N_WAVES](${WAVES.map((w) => `vec4(${w.i}.0, ${w.j}.0, ${w.share.toFixed(3)}, ${w.omega.toFixed(5)})`).join(', ')});
const vec3 WAVE_B[N_WAVES] = vec3[N_WAVES](${WAVES.map((w) => `vec3(${w.dx.toFixed(5)}, ${w.dy.toFixed(5)}, ${w.k.toFixed(6)})`).join(', ')});
vec3 wave(vec2 uv, float t, vec2 wind2, float scale, int n) {
  vec3 acc = vec3(0.0);
  for (int q = 0; q < n; q++) {
    vec4 a = WAVE_A[q]; vec3 b = WAVE_B[q];
    // (with the wind: full; across it: a third; against it: nothing)
    float along = dot(b.xy, wind2), wgt = a.z * scale * (along > 0.0 ? 0.3 + 0.7 * along * along : 0.3 * max(0.0, 1.0 + 3.0 * along));
    float ph = 6.2831853 * dot(a.xy, uv) - a.w * t + float(q) * 1.7;
    float s = sin(ph), c = cos(ph);
    // (crests a little sharper than troughs)
    acc += vec3(b.xy * (b.z * wgt * c * (1.0 + 0.5 * s)), wgt * (s + 0.25 * (1.0 - c * c)));
  }
  return acc;
}`;

// The same on the CPU: the surface's height (m) above the still water at a place.
// pos: planet-centred position; radius: the world's; time (s); wind: unit vector in the
// planet's axes and speed (m/s).
const _uv = [0, 0];
export function waveHeightAt(pos, radius, time, wind, speed) {
  const len = Math.hypot(pos.x, pos.y, pos.z) || 1, d = [pos.x / len, pos.y / len, pos.z / len];
  let face = 0, best = -2;
  for (let f = 0; f < 6; f++) { const n = FACES[f].n, dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; if (dn > best) { best = dn; face = f; } }
  dirToFace(face, d[0], d[1], d[2], _uv);
  const F = FACES[face], K = (Math.PI * radius / 4) / DETAIL_TILE;
  const u = _uv[0] * K, v = _uv[1] * K;
  // the tile's axes on the ground here, and the wind along them
  const du = F.u[0] * d[0] + F.u[1] * d[1] + F.u[2] * d[2], dv = F.v[0] * d[0] + F.v[1] * d[1] + F.v[2] * d[2];
  let ux = F.u[0] - d[0] * du, uy = F.u[1] - d[1] * du, uz = F.u[2] - d[2] * du, vx = F.v[0] - d[0] * dv, vy = F.v[1] - d[1] * dv, vz = F.v[2] - d[2] * dv;
  const ul = Math.hypot(ux, uy, uz) || 1, vl = Math.hypot(vx, vy, vz) || 1;
  // (as the shader has it: the wind along each axis, the two not made a unit pair; away
  // from a cube face's middle the axes are not at right angles)
  const wx = (wind.x * ux + wind.y * uy + wind.z * uz) / ul, wy = (wind.x * vx + wind.y * vy + wind.z * vz) / vl;
  const scale = waveScale(speed);
  let h = 0;
  for (let q = 0; q < LIFTED; q++) {
    const w = WAVES[q], along = w.dx * wx + w.dy * wy;
    const wgt = w.share * scale * (along > 0 ? 0.3 + 0.7 * along * along : 0.3 * Math.max(0, 1 + 3 * along));
    const ph = 2 * Math.PI * (w.i * u + w.j * v) - w.omega * time + q * 1.7, c = Math.cos(ph);
    h += wgt * (Math.sin(ph) + 0.25 * (1 - c * c));
  }
  return h;
}
