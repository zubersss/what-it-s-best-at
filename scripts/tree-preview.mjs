// The tree shapes drawn without a browser, in seconds: every shape of life/treeGeometry.js
// from the side, at its three distances, onto PNG sheets. For working on outlines and on
// what a tree is made of; the game's own light, colours and wind are not in it.
//
//   node scripts/tree-preview.mjs [--out dir] [--variant 0|1|2] [--only 0,2,7] [--below]
//                                 [--close [--from 4] [--tall 22] [--size 1540x721] [--fov 30]]
//                                 [--against dir]
//
// One sheet per four shapes: columns are shapes, rows are close, near and far.
// --below: seen from under the crown, looking up (what a walker in a forest sees).
// --close: one picture a shape of the close mesh from `from` metres off its foliage, at
//   eye height, at the density of the phone (1540 x 721 through a 30 degree lens is what
//   a 1 440 pixel screen shows of it): what a walker sees of a leaf.
// --against dir: the same pictures from the tree code of another checkout (its src/life
//   and scripts/lib), side by side, old on the left.
import fs from 'node:fs';
import path from 'node:path';
import { png } from './lib/png.mjs';
import { camera, sideView, drawTree, sky } from './lib/treeDraw.mjs';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = opt('out', '.'), variant = +opt('variant', 0), only = opt('only', null)?.split(',').map(Number), below = args.includes('--below'), close = args.includes('--close'), against = opt('against', null);
const NAMES = ['conifer', 'pine', 'broadleaf', 'tropical', 'umbrella', 'bush', 'palm', 'slender', 'blossom'];
const TALL = [24, 22, 18, 30, 9, 4, 14, 16, 7], WIDE = [0.75, 0.9, 1.2, 1.2, 1.3, 1.1, 1, 0.8, 1.2];
const LEAF = [[0.14, 0.3, 0.17], [0.19, 0.36, 0.15], [0.22, 0.42, 0.13], [0.16, 0.38, 0.12], [0.24, 0.38, 0.15], [0.2, 0.32, 0.17], [0.22, 0.4, 0.13], [0.3, 0.5, 0.15], [0.24, 0.42, 0.15]];
const TRUNK = [[0.3, 0.23, 0.18], [0.4, 0.24, 0.17], [0.33, 0.29, 0.25], [0.5, 0.47, 0.42], [0.3, 0.23, 0.18], [0.34, 0.32, 0.29], [0.36, 0.34, 0.3], [0.62, 0.6, 0.56], [0.26, 0.2, 0.18]];
const PETAL = [0.95, 0.72, 0.8];

async function load(dir) {
  const g = await import(path.resolve(dir, 'src/life/treeGeometry.js')), a = await import(path.resolve(dir, 'src/life/treeAtlasGen.js'));
  const geos = g.makeTreeGeometries(), atlas = a.addImpostors(a.makeSprays(), geos);
  return { geos, atlas };
}
const here = await load(new URL('..', import.meta.url).pathname), sets = against ? [await load(against), here] : [here];
const list = (only || here.geos.map((_, i) => i));
const look = (a) => ({ tall: 1, leaf: LEAF[a], trunk: TRUNK[a], petal: a === 8 ? PETAL : null });

if (close) {
  const [cw, ch] = opt('size', '1540x721').split('x').map(Number), fov = +opt('fov', 30), from = +opt('from', 4);
  for (const a of list) {
    const W = cw * sets.length + 6 * (sets.length - 1), img = Buffer.alloc(W * ch * 3, 255), tall = +opt('tall', TALL[a]), counts = [];
    sets.forEach((set, si) => {
      if (!set.geos[a]) return;
      const geo = set.geos[a][variant][0], P = geo.attributes.position.array, L = geo.attributes.aLeaf.array;
      // the foliage nearest the eye's side (+x) below a third of the way up the crown: stand `from` metres off it
      let reach = 0, low = 1e9; for (let i = 0; i < L.length; i++) if (L[i] > 0.5) low = Math.min(low, P[i * 3 + 1]);
      const band = low + 0.3 * (1 - low); let ys = 0, nn = 0;
      for (let i = 0; i < L.length; i++) if (L[i] > 0.5 && P[i * 3 + 1] < band && Math.abs(P[i * 3 + 2]) < 0.05) { reach = Math.max(reach, P[i * 3] * WIDE[a]); if (P[i * 3] * WIDE[a] > 0.06) { ys += P[i * 3 + 1]; nn++; } }
      const aim = [reach * tall * 0.75, Math.max(1.7, (nn ? ys / nn : band) * tall), 0], eye = [reach * tall + from, 1.7, from * 0.45];
      const ox = si * (cw + 6); sky(img, W, ox, 0, cw, ch);
      counts.push(drawTree(geo, set.atlas, img, W, ox, 0, cw, ch, camera(eye, aim, fov, cw, ch), { ...look(a), tall, wide: WIDE[a] }));
    });
    const file = `${out}/tree_close_${NAMES[a]}_${from}m_v${variant}.png`;
    fs.writeFileSync(file, png(W, ch, img));
    console.log(`${file}\n  ${NAMES[a]}, ${tall} m tall, from ${from} m: ${counts.join(' against ')} triangles`);
  }
} else {
  const CW = 330, CH = 310, S = 262;
  // from below: looking up the trunk from a point under the crown's edge
  const under = (p) => [CW / 2 + p[0] * S * 1.5 / (0.25 + p[1]) * 0.5, CH * 0.5 - (p[2] + 0.1) * S * 1.5 / (0.25 + p[1]) * 0.5, 1 / (10 + p[1])];
  for (const set of sets) for (let s0 = 0; s0 < list.length; s0 += 4) {
    const cols = list.slice(s0, s0 + 4).filter((a) => set.geos[a]), W = CW * cols.length, H = CH * 3, img = Buffer.alloc(W * H * 3);
    const counts = [];
    cols.forEach((a, ci) => { for (let lod = 0; lod < 3; lod++) { sky(img, W, ci * CW, lod * CH, CW, CH); counts.push(`${NAMES[a]} ${['close', 'near', 'far'][lod]} ${drawTree(set.geos[a][variant][lod], set.atlas, img, W, ci * CW, lod * CH, CW, CH, below ? under : sideView(S, CW, CH), look(a))}`); } });
    const file = `${out}/trees_${cols.map((a) => NAMES[a]).join('_')}${below ? '_below' : ''}_v${variant}${against && set !== here ? '_old' : ''}.png`;
    fs.writeFileSync(file, png(W, H, img));
    console.log(file + '\n  ' + counts.join(' · '));
  }
}
