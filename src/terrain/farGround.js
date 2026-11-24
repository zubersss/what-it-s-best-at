// Numbers the ground's far look (terrain/terrainMaterial.js, "THE GROUND FROM AFAR" and the
// steppe's colour) needs from outside the shader, and a mirror of its crowns() pattern that
// they are measured on (scripts/far-ground-test.mjs measures them again and fails if a
// number here no longer agrees). No three, no DOM: Node reads it.
//
// The means: a pattern that fades out where it is under a pixel must fade to its own mean,
// or the land's tone changes with distance (review groundfar2-5: the crowns' shading
// averaged 0.76 to 0.89 where it was drawn and 1 where it had faded, so a wood was darker
// near by than far off). Each shade factor is divided by its mean, so its mean is 1 at
// every distance.
export const FAR_GROUND = {
  standMean: 0.886,      // farCrownShade(stand): (0.7 + 0.42 s(z)) (0.84 + 0.32 w)
  crownMean: 0.764,      // farCrownShade(crown): (0.4 + 0.78 s(z)) (0.76 + 0.48 w)
  clumpMean: 0.843,      // the clumps: (0.48 + 0.8 s(z)) (0.8 + 0.4 w)
  clumpZ: 0.317,         // the clumps' mean height in their dome (the wood's broken edge)
  soilMean: 0.213,       // the steppe's bare soil: its share of the ground
  shrubMean: 0.071,      // the steppe's shrubs: their share of the ground
};

const fract = (x) => x - Math.floor(x);
// crowns() of terrainMaterial.js, in JavaScript: [tilt x, tilt y, height in the dome, own number].
export function crowns(u, v, cells, period = 16) {
  let px = u * cells, py = v * cells; const a = Math.min(0.3, 0.0225 * cells);
  px += a * Math.sin(2 * Math.PI * (v + u)); py += a * Math.sin(2 * Math.PI * (u - v));
  const bx = Math.floor(px - 0.5), by = Math.floor(py - 0.5); let best = [0, 0, 0, 0.5], hb = -1e3;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const cx = bx + i, cy = by + j, m = cells * period, wx = ((cx % m) + m) % m, wy = ((cy % m) + m) % m;
    const h = [fract(Math.sin(wx * 127.1 + wy * 311.7) * 43758.5453), fract(Math.sin(wx * 269.5 + wy * 183.3) * 43758.5453), fract(Math.sin(wx * 419.2 + wy * 371.9) * 43758.5453)];
    if (fract(h[2] * 17.31) < 0.1) continue;
    const dx = px - (cx + 0.5 + (h[0] - 0.5) * 0.66), dy = py - (cy + 0.5 + (h[1] - 0.5) * 0.66);
    const r = 0.3 + 0.36 * h[2], hg = 1 - (dx * dx + dy * dy) / (r * r);
    if (hg > hb) { hb = hg; best = [dx / (r * r), dy / (r * r), Math.max(hg, 0), fract(h[2] * 7.31)]; }
  }
  return best;
}
