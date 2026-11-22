// The tree shapes drawn without a browser, in seconds: every shape of life/treeGeometry.js
// from the side, at its three distances, flat-lit in two tones, onto PNG sheets. For
// working on outlines; the game's own light, colours and wind are not in it.
//
//   node scripts/tree-preview.mjs [--out dir] [--variant 0|1|2] [--only 0,2,7] [--below]
//
// One sheet per four shapes: columns are shapes, rows are close, near and far.
// --below: seen from under the crown, looking up (what a walker in a forest sees).
import fs from 'node:fs';
import { makeTreeGeometries } from '../src/life/treeGeometry.js';
import { makeSprays, addImpostors, sampleAtlas } from '../src/life/treeAtlasGen.js';
import { png } from './lib/png.mjs';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = opt('out', '.'), variant = +opt('variant', 0), only = opt('only', null)?.split(',').map(Number), below = args.includes('--below');
const NAMES = ['conifer', 'pine', 'broadleaf', 'tropical', 'umbrella', 'bush', 'palm', 'slender'];
const CW = 330, CH = 310, S = 262;

function draw(geo, img, W, ox, oy) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, L = geo.attributes.aLeaf.array, U = geo.attributes.aUv.array, n = P.length / 9;
  const zb = new Float32Array(CW * CH).fill(-1e9), sun = [-0.5, 0.75, 0.43];
  // side view: x right, y up, z toward the eye; from below: looking up the trunk from a point under the crown's edge
  const proj = (x, y, z) => below ? [CW / 2 + (x - 0.0) * S * 1.5 / (0.25 + y) * 0.5, CH * 0.5 - (z + 0.1) * S * 1.5 / (0.25 + y) * 0.5, -y] : [CW / 2 + x * S, CH - 18 - y * S, z];
  for (let t = 0; t < n; t++) {
    const o = t * 9, a = proj(P[o], P[o + 1], P[o + 2]), b = proj(P[o + 3], P[o + 4], P[o + 5]), c = proj(P[o + 6], P[o + 7], P[o + 8]);
    const leaf = L[t * 3], card = U[t * 6] >= 0, nls = [0, 1, 2].map((k) => N[o + k * 3] * sun[0] + N[o + k * 3 + 1] * sun[1] + N[o + k * 3 + 2] * sun[2]);
    const flat = leaf < 0.5 ? [0.42, 0.33, 0.27] : leaf > 1.5 ? [0.3, 0.52, 0.18] : leaf > 1.1 ? [0.085, 0.19, 0.075] : [0.18, 0.4, 0.15];     // (1.25: the dark inside of a fir's tier)
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(CW - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(CH - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5, u = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den, v = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den, w = 1 - u - v;
      if (u < 0 || v < 0 || w < 0) continue;
      const z = u * a[2] + v * b[2] + w * c[2], i = y * CW + x;
      if (z <= zb[i]) continue;
      let col = flat, nl = u * nls[0] + v * nls[1] + w * nls[2];
      if (card) {
        // (a card: cut out of the picture; lit smoothly, as the game does)
        const a = sampleAtlas(ATLAS, u * U[t * 6] + v * U[t * 6 + 2] + w * U[t * 6 + 4], u * U[t * 6 + 1] + v * U[t * 6 + 3] + w * U[t * 6 + 5]);
        if (a[0] < 0.42) continue;
        col = a[2] > 0.5 ? [0.36, 0.28, 0.23] : [0.2, 0.4, 0.17].map((c) => c * (0.6 + 0.5 * a[1]) * (leaf > 3.1 && leaf < 3.5 ? 0.5 : 1));     // (3.25: a crown's dark heart)
      }
      const lit = card ? 0.5 + 0.6 * Math.min(1, Math.max(0, (nl + 0.25) / 0.9)) : nl > 0.12 ? 1 : 0.5;
      zb[i] = z;
      const q = ((oy + y) * W + ox + x) * 3;
      img[q] = Math.min(255, col[0] * lit * 300); img[q + 1] = Math.min(255, col[1] * lit * 300); img[q + 2] = Math.min(255, col[2] * lit * 300);
    }
  }
  return n;
}

const geos = makeTreeGeometries(), ATLAS = addImpostors(makeSprays(), geos), list = (only || NAMES.map((_, i) => i));
for (let s0 = 0; s0 < list.length; s0 += 4) {
  const cols = list.slice(s0, s0 + 4), W = CW * cols.length, H = CH * 3, img = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = (y * W + x) * 3, t = (y % CH) / CH; img[q] = 232 - 40 * t; img[q + 1] = 226 - 22 * t; img[q + 2] = 205 + 10 * t; }
  const counts = [];
  cols.forEach((a, ci) => { for (let lod = 0; lod < 3; lod++) counts.push(`${NAMES[a]} ${['close', 'near', 'far'][lod]} ${draw(geos[a][variant][lod], img, W, ci * CW, lod * CH)}`); });
  const file = `${out}/trees_${cols.map((a) => NAMES[a]).join('_')}${below ? '_below' : ''}_v${variant}.png`;
  fs.writeFileSync(file, png(W, H, img));
  console.log(file + '\n  ' + counts.join(' · '));
}
