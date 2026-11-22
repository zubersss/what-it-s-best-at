// The trees' picture (public/data/tree_atlas.png): sprays of foliage and every tree shape
// seen whole, drawn by rule in src/life/treeAtlasGen.js. Run again after changing the
// sprays or the tree shapes (the whole trees are drawn from the near meshes).
//
//   node scripts/make-tree-atlas.mjs [--sprays] [--look file.png]
//
// --sprays: the sprays only (no whole trees). --look: also a picture for the eye (the
// cut-out in green on a pale ground, wood in brown).
import fs from 'node:fs';
import { makeSprays, addImpostors, atlasBytes } from '../src/life/treeAtlasGen.js';
import { png } from './lib/png.mjs';

const args = process.argv.slice(2), look = args.includes('--look') ? args[args.indexOf('--look') + 1] : null;
const t0 = Date.now(), A = makeSprays();
if (!args.includes('--sprays')) { const { makeTreeGeometries } = await import('../src/life/treeGeometry.js'); addImpostors(A, makeTreeGeometries(A)); }
const bytes = atlasBytes(A), file = new URL('../public/data/tree_atlas.png', import.meta.url).pathname;
fs.writeFileSync(file, png(A.W, A.H, bytes));
console.log(`${file}: ${A.W} x ${A.H}, ${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (look) {
  const out = new Uint8Array(A.W * A.H * 3);
  for (let i = 0; i < A.W * A.H; i++) {
    const c = Math.min(1, Math.max(0, (bytes[i * 3] / 255 - 0.35) / 0.3)), t = bytes[i * 3 + 1] / 255, w = bytes[i * 3 + 2] / 255;
    const col = [0.25 + 0.2 * w, 0.5 - 0.22 * w, 0.2].map((v) => v * (0.45 + 0.75 * t)), bg = [0.93, 0.9, 0.82];
    for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(255 * (bg[k] + (col[k] - bg[k]) * c));
  }
  fs.writeFileSync(look, png(A.W, A.H, out));
}
