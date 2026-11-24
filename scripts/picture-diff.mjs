// How far two pictures of the same size are apart:   node scripts/picture-diff.mjs a.png b.png [out.png] [--box x0,y0,x1,y1]
// The mean and the largest difference in levels (0..255), the share of pixels more than 2
// and more than 8 levels off; out.png: the difference times 8. Exit code 1 if the sizes differ.
// --box: only that part of the picture (shares of its width and height).
import { writeFile } from 'node:fs/promises';
import { readPng, png } from './lib/png.mjs';
const [fa, fb, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const bi = process.argv.indexOf('--box'), box = bi > 0 ? process.argv[bi + 1].split(',').map(Number) : [0, 0, 1, 1];
const a = readPng(fa), b = readPng(fb);          // (RGB bytes)
if (a.w !== b.w || a.h !== b.h) { console.log(`sizes differ: ${a.w}x${a.h} and ${b.w}x${b.h}`); process.exit(1); }
const w = a.w, h = a.h, ca = 3, cb = 3, d = new Uint8Array(w * h * 3);
let sum = 0, max = 0, n2 = 0, n8 = 0, n = 0;
for (let y = Math.floor(box[1] * h); y < Math.ceil(box[3] * h); y++) for (let x = Math.floor(box[0] * w); x < Math.ceil(box[2] * w); x++) {
  const i = y * w + x; let m = 0;
  for (let c = 0; c < 3; c++) { const e = Math.abs(a.data[i * ca + c] - b.data[i * cb + c]); if (e > m) m = e; d[i * 3 + c] = Math.min(255, e * 8); }
  sum += m; n++; if (m > max) max = m; if (m > 2) n2++; if (m > 8) n8++;
}
console.log(`mean ${(sum / n).toFixed(2)} levels, largest ${max}, over 2 levels ${(100 * n2 / n).toFixed(2)} %, over 8 levels ${(100 * n8 / n).toFixed(3)} %`);
if (out) await writeFile(out, png(w, h, d, 3));
