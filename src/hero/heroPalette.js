// What moves the sculpted figure (hero/heroSculpt.js). A vertex is carried by one or two of
// the body's nine rigid parts (Hero.parts), as a skinned figure is; and where its cloth is
// loose it is then shifted by what the simulated cloth (hero/robe.js) has done near it: by a
// blend of up to four particles' "shifts", a particle's shift being where it is now less
// where it would be had it been carried rigidly by the body's parts too. So a sleeve swings
// with its arm as one piece, and bends, sways and streams from there as the cloth does.
// (Shifts, not turns: the sculpt is one fused surface, sleeve to wrist and skirt to trousers.
// Carried by the particles' own turning frames it tore along every such join.)
//
// The texture the vertex shader reads ("the palette"): three texels for each part (the rows
// of its matrix: a place as the sculpt stands to where the part carries it now), then one
// texel a particle (its shift).
//
// Plain JavaScript and plain arrays: the game uses it, and the tools in Node
// (scripts/hero/heroBind.mjs), so both move the figure by the same sums.
export const PARTS = 9;
export const PALETTE_W = 64;               // texels a row of the palette
export const paletteTexels = (particles) => PARTS * 3 + particles;

// out: four numbers a texel. parts: nine 4 x 4 matrices (column-major, as three's elements)
// taking the sculpt's standing place to now. pos: the cloth now. rest: where each particle
// was as the sculpt stood (x, y, z). carried: which parts carry each particle rigidly (three
// numbers each: first part, second part, the second's share). limit: a shift is eased so it
// never passes this (m).
export function fillPalette(out, parts, pos, rest, carried, limit = 0.7) {
  for (let b = 0; b < PARTS; b++) {
    const m = parts[b], o = b * 12;
    out[o] = m[0]; out[o + 1] = m[4]; out[o + 2] = m[8]; out[o + 3] = m[12];
    out[o + 4] = m[1]; out[o + 5] = m[5]; out[o + 6] = m[9]; out[o + 7] = m[13];
    out[o + 8] = m[2]; out[o + 9] = m[6]; out[o + 10] = m[10]; out[o + 11] = m[14];
  }
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2], a = parts[carried[i * 3]], b = parts[carried[i * 3 + 1]], w = carried[i * 3 + 2], o = (PARTS * 3 + i) * 4;
    let dx = pos[i * 3] - ((a[0] * x + a[4] * y + a[8] * z + a[12]) * (1 - w) + (b[0] * x + b[4] * y + b[8] * z + b[12]) * w);
    let dy = pos[i * 3 + 1] - ((a[1] * x + a[5] * y + a[9] * z + a[13]) * (1 - w) + (b[1] * x + b[5] * y + b[9] * z + b[13]) * w);
    let dz = pos[i * 3 + 2] - ((a[2] * x + a[6] * y + a[10] * z + a[14]) * (1 - w) + (b[2] * x + b[6] * y + b[10] * z + b[14]) * w);
    const l = Math.hypot(dx, dy, dz), k = limit / (limit + l);
    out[o] = dx * k; out[o + 1] = dy * k; out[o + 2] = dz * k; out[o + 3] = 0;
  }
  return out;
}
