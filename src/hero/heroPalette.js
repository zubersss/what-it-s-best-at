// What moves the sculpted figure (hero/heroSculpt.js). A vertex is carried by one or two of
// the body's nine rigid parts (Hero.parts) and the torso, as a skinned figure is; and where
// its cloth is loose it goes instead, by its share of cloth, with the simulated cloth
// (hero/robe.js) near it: with up to four particles, each of which carries the sculpt round
// it as a small rigid piece: turned as the sheet has turned there since the sculpt stood,
// and moved to where the particle is.
// (Turned, not only moved: moved alone, every fold carved into the gown was sheared as the
// sheet under it turned, and the cloth looked like crumpled foil in any pose but standing.)
//
// A particle's turn and move are evened out over its neighbours of the same garment: the
// simulated skirt is three panels that part at their slits and a sleeve two sheets, where
// the sculpt's gown is one closed surface; taken panel by panel the gown was drawn out
// across every open slit, and turned particle by particle it tore.
//
// The texture the vertex shader reads ("the palette"): three texels each (the rows of a
// 3 x 4 matrix: a place as the sculpt stands to where it is carried now), the nine parts
// first, then the particles.
//
// Plain JavaScript and plain arrays: the game uses it, and the tools in Node
// (scripts/hero/heroBind.mjs), so both move the figure by the same sums.
export const PARTS = 9;
export const PALETTE_W = 64;               // texels a row of the palette
export const NEAR = 24;                    // particles a particle's turn and move are evened out over
export const paletteTexels = (particles) => (PARTS + particles) * 3;

// The sheet's own axes at every particle (nine numbers: along the sheet's two grid lines,
// squared up, and its normal), from its grid neighbours (grid: four a particle: the ones
// before and after it along each line, itself at an edge).
export function particleFrames(pos, grid, out) {
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const a = grid[i * 4] * 3, b = grid[i * 4 + 1] * 3, c = grid[i * 4 + 2] * 3, d = grid[i * 4 + 3] * 3;
    let ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[d] - pos[c], vy = pos[d + 1] - pos[c + 1], vz = pos[d + 2] - pos[c + 2];
    let l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const o = i * 9;
    out[o] = ux; out[o + 1] = uy; out[o + 2] = uz;
    out[o + 3] = ny * uz - nz * uy; out[o + 4] = nz * ux - nx * uz; out[o + 5] = nx * uy - ny * ux;
    out[o + 6] = nx; out[o + 7] = ny; out[o + 8] = nz;
  }
  return out;
}

// out: four numbers a texel. parts: nine 4 x 4 matrices (column-major, as three's elements)
// taking the sculpt's standing place to now. pos: the cloth now. shared: the file's rest
// (where each particle was as the sculpt stood), carried (which parts carry each particle
// rigidly: first part, second part, the second's share), grid and frame (each particle's
// grid neighbours, and the sheet's axes there as the sculpt stood), near and nearW (NEAR
// particles of its garment round each particle, and their weights, which add up to one).
let work = null;
export function fillPalette(out, parts, pos, shared) {
  const { rest, carried, grid, frame, near, nearW } = shared;
  for (let b = 0; b < PARTS; b++) {
    const m = parts[b], o = b * 12;
    out[o] = m[0]; out[o + 1] = m[4]; out[o + 2] = m[8]; out[o + 3] = m[12];
    out[o + 4] = m[1]; out[o + 5] = m[5]; out[o + 6] = m[9]; out[o + 7] = m[13];
    out[o + 8] = m[2]; out[o + 9] = m[6]; out[o + 10] = m[10]; out[o + 11] = m[14];
  }
  const n = pos.length / 3;
  if (!work || work.n !== n) work = { n, now: new Float32Array(n * 9), turn: new Float32Array(n * 9), at: new Float32Array(n * 3), shift: new Float32Array(n * 3) };
  const { now, turn, at, shift } = work;
  particleFrames(pos, grid, now);
  for (let i = 0; i < n; i++) {
    // (where the parts alone would have carried the particle, and how far the cloth is from there)
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2], a = parts[carried[i * 3]], b = parts[carried[i * 3 + 1]], w = carried[i * 3 + 2];
    at[i * 3] = (a[0] * x + a[4] * y + a[8] * z + a[12]) * (1 - w) + (b[0] * x + b[4] * y + b[8] * z + b[12]) * w;
    at[i * 3 + 1] = (a[1] * x + a[5] * y + a[9] * z + a[13]) * (1 - w) + (b[1] * x + b[5] * y + b[9] * z + b[13]) * w;
    at[i * 3 + 2] = (a[2] * x + a[6] * y + a[10] * z + a[14]) * (1 - w) + (b[2] * x + b[6] * y + b[10] * z + b[14]) * w;
    shift[i * 3] = pos[i * 3] - at[i * 3]; shift[i * 3 + 1] = pos[i * 3 + 1] - at[i * 3 + 1]; shift[i * 3 + 2] = pos[i * 3 + 2] - at[i * 3 + 2];
    // (the turn: the sheet's axes now against its axes then; row r, column c)
    const f = i * 9;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) turn[f + r * 3 + c] = now[f + r] * frame[f + c] + now[f + 3 + r] * frame[f + 3 + c] + now[f + 6 + r] * frame[f + 6 + c];
  }
  for (let i = 0; i < n; i++) {
    let dx = 0, dy = 0, dz = 0, m0 = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0, m5 = 0, m6 = 0, m7 = 0, m8 = 0;
    for (let k = i * NEAR, e = k + NEAR; k < e; k++) {
      const w = nearW[k]; if (w === 0) continue;
      const j = near[k] * 3, t = near[k] * 9;
      dx += w * shift[j]; dy += w * shift[j + 1]; dz += w * shift[j + 2];
      m0 += w * turn[t]; m1 += w * turn[t + 1]; m2 += w * turn[t + 2]; m3 += w * turn[t + 3]; m4 += w * turn[t + 4]; m5 += w * turn[t + 5]; m6 += w * turn[t + 6]; m7 += w * turn[t + 7]; m8 += w * turn[t + 8];
    }
    // (the evened-out turn made a true turn again: its first column, the third squared to it, the second from both)
    let l = Math.hypot(m0, m3, m6) || 1; const ax = m0 / l, ay = m3 / l, az = m6 / l;
    let cx = ay * m7 - az * m4, cy = az * m1 - ax * m7, cz = ax * m4 - ay * m1;
    l = Math.hypot(cx, cy, cz) || 1; cx /= l; cy /= l; cz /= l;
    const bx = cy * az - cz * ay, by = cz * ax - cx * az, bz = cx * ay - cy * ax;
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2], o = (PARTS + i) * 12;
    out[o] = ax; out[o + 1] = bx; out[o + 2] = cx; out[o + 3] = at[i * 3] + dx - (ax * x + bx * y + cx * z);
    out[o + 4] = ay; out[o + 5] = by; out[o + 6] = cy; out[o + 7] = at[i * 3 + 1] + dy - (ay * x + by * y + cy * z);
    out[o + 8] = az; out[o + 9] = bz; out[o + 10] = cz; out[o + 11] = at[i * 3 + 2] + dz - (az * x + bz * y + cz * z);
  }
  return out;
}

// ---- the cloth kept off the legs ---------------------------------------------------------------
// The simulated cloth is kept off the legs by the simulation, but the sculpt's gown is not
// the simulated sheet: it follows it, evened out, and the knees of a running figure came
// through it by up to 11 cm. So for each leg (thigh and shin, a capsule each) a cloth
// vertex stays on the side of the leg it was sculpted on: where it would be were it fixed
// to that leg says which side that is and how far off the leg's middle line it stood, and
// if it now lies within the leg's round (its radius and a little, or that standing distance
// if less) it is put on the round's face on that side. Standing, nothing moves; cloth
// never passes through a leg; and the push fades to nothing at the round's edge, so it
// tears nothing. (Pushed straight out from the line instead, cloth that had crossed the
// line went out the far side and tore from its neighbours.)
export const LEG_OVER = 0.055;             // m over the leg collider's radius

// The four leg capsules (left thigh, left shin, right thigh, right shin: Hero.parts 5 to 8)
// in the figure's group frame: seven numbers each (one end, the other, the radius), from
// the figure's colliders (the body's frame).
export function legsOf(hero, out = new Float32Array(28)) {
  const c = hero.colliders, e = hero.body.matrix.elements;
  for (let k = 0; k < 4; k++) {
    const o = (4 + k) * 7;
    for (let j = 0; j < 2; j++) {
      const x = c[o + j * 3], y = c[o + j * 3 + 1], z = c[o + j * 3 + 2];
      out[k * 7 + j * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; out[k * 7 + j * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; out[k * 7 + j * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    out[k * 7 + 6] = c[o + 6];
  }
  return out;
}

// q: a cloth vertex's place now (three numbers, changed in place). x, y, z: its place as the
// sculpt stands. legs: from legsOf. M: the palette (the parts' matrices are its first rows).
// share: how much of the push it takes (the binding's `clear`: by its share of cloth).
// (the vertex shader does the same sum: hero/heroSculpt.js)
export function keepOff(q, x, y, z, legs, M, share = 1) {
  for (let k = 0; k < 4; k++) {
    const o = k * 7, m = (5 + k) * 12, ax = legs[o], ay = legs[o + 1], az = legs[o + 2], bx = legs[o + 3] - ax, by = legs[o + 4] - ay, bz = legs[o + 5] - az, bb = bx * bx + by * by + bz * bz;
    // (fixed to this leg it would be at l: off the line by n, the side it belongs on)
    const lx = M[m] * x + M[m + 1] * y + M[m + 2] * z + M[m + 3] - ax, ly = M[m + 4] * x + M[m + 5] * y + M[m + 6] * z + M[m + 7] - ay, lz = M[m + 8] * x + M[m + 9] * y + M[m + 10] * z + M[m + 11] - az;
    const tl = Math.min(1, Math.max(0, (lx * bx + ly * by + lz * bz) / bb));
    let nx = lx - bx * tl, ny = ly - by * tl, nz = lz - bz * tl; const dl = Math.hypot(nx, ny, nz); if (dl < 1e-4) continue;
    nx /= dl; ny /= dl; nz /= dl;
    const tq = Math.min(1, Math.max(0, ((q[0] - ax) * bx + (q[1] - ay) * by + (q[2] - az) * bz) / bb));
    const dx = q[0] - ax - bx * tq, dy = q[1] - ay - by * tq, dz = q[2] - az - bz * tq, s = dx * nx + dy * ny + dz * nz;
    const want = Math.min(dl, legs[o + 6] + LEG_OVER), lat2 = dx * dx + dy * dy + dz * dz - s * s, push = Math.sqrt(Math.max(0, want * want - lat2)) - s;
    if (push > 0) { q[0] += nx * push * share; q[1] += ny * push * share; q[2] += nz * push * share; }
  }
  return q;
}
