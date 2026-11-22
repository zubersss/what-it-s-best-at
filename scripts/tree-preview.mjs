// The tree shapes drawn without a browser, in seconds: every shape of life/treeGeometry.js
// from the side, at its three distances, flat-lit in two tones, onto PNG sheets. For
// working on outlines; the game's own light, colours and wind are not in it.
//
//   node scripts/tree-preview.mjs [--out dir] [--variant 0|1|2] [--only 0,2,7] [--below]
//
// One sheet per four shapes: columns are shapes, rows are close, near and far.
// --below: seen from under the crown, looking up (what a walker in a forest sees).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { makeTreeGeometries } from '../src/life/treeGeometry.js';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = opt('out', '.'), variant = +opt('variant', 0), only = opt('only', null)?.split(',').map(Number), below = args.includes('--below');
const NAMES = ['conifer', 'pine', 'broadleaf', 'tropical', 'umbrella', 'bush', 'palm', 'slender'];
const CW = 330, CH = 310, S = 262;

function png(w, h, rgb) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function draw(geo, img, W, ox, oy) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, L = geo.attributes.aLeaf.array, n = P.length / 9;
  const zb = new Float32Array(CW * CH).fill(-1e9), sun = [-0.5, 0.75, 0.43];
  // side view: x right, y up, z toward the eye; from below: looking up the trunk from a point under the crown's edge
  const proj = (x, y, z) => below ? [CW / 2 + (x - 0.0) * S * 1.5 / (0.25 + y) * 0.5, CH * 0.5 - (z + 0.1) * S * 1.5 / (0.25 + y) * 0.5, -y] : [CW / 2 + x * S, CH - 18 - y * S, z];
  for (let t = 0; t < n; t++) {
    const o = t * 9, a = proj(P[o], P[o + 1], P[o + 2]), b = proj(P[o + 3], P[o + 4], P[o + 5]), c = proj(P[o + 6], P[o + 7], P[o + 8]);
    const nl = N[o] * sun[0] + N[o + 1] * sun[1] + N[o + 2] * sun[2], leaf = L[t * 3], lit = nl > 0.12 ? 1 : 0.5;
    const col = leaf < 0.5 ? [0.42, 0.33, 0.27] : leaf > 1.5 ? [0.36, 0.62, 0.2] : leaf > 1.1 ? [0.1, 0.27, 0.12] : [0.2, 0.44, 0.16];
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(CW - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(CH - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5, u = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den, v = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den, w = 1 - u - v;
      if (u < 0 || v < 0 || w < 0) continue;
      const z = u * a[2] + v * b[2] + w * c[2], i = y * CW + x;
      if (z <= zb[i]) continue;
      zb[i] = z;
      const q = ((oy + y) * W + ox + x) * 3;
      img[q] = Math.min(255, col[0] * lit * 300); img[q + 1] = Math.min(255, col[1] * lit * 300); img[q + 2] = Math.min(255, col[2] * lit * 300);
    }
  }
  return n;
}

const geos = makeTreeGeometries(), list = (only || NAMES.map((_, i) => i));
for (let s0 = 0; s0 < list.length; s0 += 4) {
  const cols = list.slice(s0, s0 + 4), W = CW * cols.length, H = CH * 3, img = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = (y * W + x) * 3, t = (y % CH) / CH; img[q] = 232 - 40 * t; img[q + 1] = 226 - 22 * t; img[q + 2] = 205 + 10 * t; }
  const counts = [];
  cols.forEach((a, ci) => { for (let lod = 0; lod < 3; lod++) counts.push(`${NAMES[a]} ${['close', 'near', 'far'][lod]} ${draw(geos[a][variant][lod], img, W, ci * CW, lod * CH)}`); });
  const file = `${out}/trees_${cols.map((a) => NAMES[a]).join('_')}${below ? '_below' : ''}_v${variant}.png`;
  fs.writeFileSync(file, png(W, H, img));
  console.log(file + '\n  ' + counts.join(' · '));
}
