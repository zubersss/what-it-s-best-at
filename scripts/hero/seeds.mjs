// Where the character's materials are, on the owner's sculpt (assets-src/hero): seeds as they
// are seen in its front (f), back (b), side (r: from its left, +x; l) and top (t) views, in
// the sculpt's own coordinates (metres; f and b: [x, y]; r and l: [z, y]; t: [x, z]). Every
// vertex takes the label of the seed nearest over the surface, where crossing a crease costs
// dear (scripts/make-hero.mjs). A seed is put on both sides of the figure unless said not.
// To place more: node scripts/hero-preview.mjs --labels --grid, and read the grid.
export const LABELS = ['silk', 'hair', 'skin', 'silver', 'pearl', 'tassel', 'boot', 'inner', 'brow', 'lip'];

export function seeds() {
  const out = Object.fromEntries(LABELS.map((k) => [k, []]));
  const pt = (lab, v, a, b, sym = true) => {
    for (const s of sym && a !== 0 && 'fbt'.includes(v) ? [1, -1] : [1]) out[lab].push({ v, p: [s * a, b] });
    if ('rl'.includes(v) && sym) out[lab].push({ v: v === 'r' ? 'l' : 'r', p: [a, b] });
  };
  const line = (lab, v, a, b, sym = true) => {
    for (const s of sym && 'fbt'.includes(v) ? [1, -1] : [1]) out[lab].push({ v, a: [s * a[0], a[1]], b: [s * b[0], b[1]] });
    if ('rl'.includes(v) && sym) out[lab].push({ v: v === 'r' ? 'l' : 'r', a, b });
  };
  // hair: from the back, the top and the sides; in front the fringe and the locks beside the face
  line('hair', 'b', [0, 0.9], [0, 0.12], false); line('hair', 'b', [0.06, 0.85], [0.07, 0.2]); line('hair', 'b', [0.11, 0.8], [0.12, 0.45]);
  line('hair', 't', [-0.08, 0.0], [0.08, 0.0], false); line('hair', 't', [0, 0.1], [0, -0.12], false);
  line('hair', 'r', [0.0, 0.9], [-0.05, 0.7]); line('hair', 'r', [-0.1, 0.85], [-0.15, 0.5]);
  line('hair', 'f', [-0.07, 0.885], [0.07, 0.885], false); line('hair', 'f', [0.085, 0.85], [0.105, 0.72]); line('hair', 'f', [0.115, 0.8], [0.125, 0.7]);
  // skin: the face under the fringe, the neck, the hands
  for (const y of [0.80, 0.77, 0.745]) pt('skin', 'f', 0, y);
  pt('skin', 'f', 0.03, 0.80); pt('skin', 'f', 0.028, 0.76); pt('skin', 'f', 0, 0.715);
  pt('skin', 'f', 0.461, 0.05); pt('skin', 'f', 0.47, 0.0); pt('skin', 'b', 0.461, 0.05); pt('skin', 'b', 0.47, 0.0); pt('skin', 'r', 0.03, 0.03);
  // the inner robe on the chest, the trousers
  for (const y of [0.6, 0.53, 0.46, 0.39, 0.32]) line('inner', 'f', [-0.06, y], [0.06, y], false);
  pt('inner', 'f', 0, 0.67);
  line('inner', 'f', [0.126, -0.3], [0.14, -0.78]);
  // silver: the mantle over the shoulders, the sash, the front panel, the bracers
  line('silver', 'f', [0.13, 0.64], [0.3, 0.64]); line('silver', 'b', [0.16, 0.64], [0.3, 0.63]); line('silver', 't', [0.2, 0.0], [0.3, 0.0]);
  line('silver', 'f', [-0.12, 0.245], [0.12, 0.245], false); line('silver', 'r', [-0.1, 0.24], [0.1, 0.24]);
  line('silver', 'f', [0, -0.1], [0, -0.66], false);
  line('silver', 'f', [0.39, 0.23], [0.43, 0.14]);
  // the outer robe: chest, back, sleeves, skirt
  line('silk', 'f', [0.15, 0.5], [0.17, 0.32]); line('silk', 'b', [0.17, 0.55], [0.2, 0.3]); line('silk', 'b', [0.1, -0.1], [0.15, -0.85]); line('silk', 'b', [0, -0.2], [0, -0.85], false);
  line('silk', 'f', [0.26, 0.5], [0.34, 0.3]); line('silk', 'b', [0.26, 0.5], [0.36, 0.3]); line('silk', 'r', [0.0, 0.5], [0.0, 0.3]);
  line('silk', 'b', [0.37, 0.25], [0.42, 0.1]);
  line('silk', 'f', [0.34, 0.05], [0.42, -0.5]); line('silk', 'b', [0.36, 0.1], [0.43, -0.5]); line('silk', 'r', [-0.1, 0.0], [-0.15, -0.5]); line('silk', 'r', [0.05, -0.1], [0.05, -0.5]);
  line('silk', 'f', [0.21, -0.15], [0.25, -0.85]); line('silk', 'f', [0.3, -0.5], [0.36, -0.85]); line('silk', 'b', [0.25, -0.3], [0.33, -0.85]);
  pt('boot', 'f', 0.173, -0.9); pt('boot', 'f', 0.19, -0.93); pt('boot', 'b', 0.16, -0.92); pt('boot', 'r', 0.1, -0.92);
  return out;
}
