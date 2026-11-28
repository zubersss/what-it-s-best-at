// The tree shapes drawn without a browser, in seconds: every shape of life/treeGeometry.js
// from the side, at its three distances, onto PNG sheets. For working on outlines and on
// what a tree is made of; the game's own light, colours and wind are not in it.
//
//   node scripts/tree-preview.mjs [--out dir] [--variant 0|1|2] [--only 0,2,7] [--below]
//                                 [--close [--from 4] [--tall 22] [--size 1540x721] [--fov 30]]
//                                 [--against dir] [--solid [--down 60] [--file f.png]]
//                                 [--year <species number> [--alt 1400] [--lat 45]]
//
// One sheet per four shapes: columns are shapes, rows are close, near and far.
// --below: seen from under the crown, looking up (what a walker in a forest sees).
// --above: looked down on from 60 degrees (what one sees of a tree from the air).
// --close: one picture a shape of the close mesh from `from` metres off its foliage, at
//   eye height, at the density of the phone (1540 x 721 through a 30 degree lens is what
//   a 1 440 pixel screen shows of it): what a walker sees of a leaf.
// --year n: one species (life/cover.js) through its year by the season's rule (life/season.js):
//   a column a stage from bare in flower to bare again, rows close, near, far; under each its
//   hemisphere's day, and how much of its leaves is gone.
// --against dir: the same pictures from the tree code of another checkout (its src/life
//   and scripts/lib), side by side, old on the left.
import fs from 'node:fs';
import path from 'node:path';
import { png } from './lib/png.mjs';
import { camera, sideView, drawTree, sky } from './lib/treeDraw.mjs';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = opt('out', '.'), variant = +opt('variant', 0), only = opt('only', null)?.split(',').map(Number), below = args.includes('--below'), above = args.includes('--above'), close = args.includes('--close'), against = opt('against', null);
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

const yearOf = opt('year', null);
if (yearOf != null) {
  const { SPECIES, treeLook } = await import('../src/life/cover.js');
  const sp = SPECIES[+yearOf], a = sp.arch, alt = +opt('alt', 1400), lat = +opt('lat', 45), R = 250000, la = lat * Math.PI / 180;
  const DAYS = [84, 100, 108, 116, 130, 200, 250, 262, 270, 278, 286, 296, 320], CW = 250, CH = 300, S = 250, W = CW * DAYS.length, img = Buffer.alloc(W * CH * 3 * 3), tl = {};
  const side = sideView(S / (TALL[a] * 1.12), CW, CH);
  const show = (c) => c.map((v) => Math.min(1, v * 3.2));
  console.log(`${sp.name} at ${alt} m, latitude ${lat}:`);
  DAYS.forEach((d, ci) => {
    treeLook(sp, d, (R + alt) * Math.cos(la), 0, (R + alt) * Math.sin(la), R, +opt('own', 0.37), tl);
    for (let lod = 0; lod < 3; lod++) {
      sky(img, W, ci * CW, lod * CH, CW, CH);
      const thin = lod === 2 ? tl.thin : tl.gone;
      drawTree(here.geos[a][variant][lod], here.atlas, img, W, ci * CW, lod * CH, CW, CH, side, { tall: TALL[a], wide: WIDE[a], leaf: show([tl.r, tl.g, tl.b]), trunk: show(sp.trunk), petal: sp.blossom && tl.open > 0.5 ? show(sp.blossom.colour) : null, gone: thin, lod: lod === 2 ? 1 : 0 });
    }
    console.log(`  day ${d}: gone ${tl.gone.toFixed(2)}, in flower ${tl.open.toFixed(2)}, leaf ${[tl.r, tl.g, tl.b].map((v) => v.toFixed(3)).join(' ')}`);
  });
  const file = `${out}/tree_year_${sp.name.replace(/ /g, '_')}_${alt}m.png`;
  fs.writeFileSync(file, png(W, CH * 3, img)); console.log(file);
} else if (args.includes('--solid')) {
  // --solid: the solid make (for whoever looks down on a tree) beside the tree's pictures: a
  // column a shape; rows: the solid from 60 degrees above, the far pictures from there (what
  // it replaces), the solid from the side, the pictures from the side (it must be the same tree).
  const CW = 200, CH = 230, S = 190, W = CW * list.length, img = Buffer.alloc(W * CH * 4 * 3), counts = [];
  const down = +opt('down', 60) * Math.PI / 180, top = camera([0, 0.55 + 2.7 * Math.sin(down), 2.7 * Math.cos(down)], [0, 0.55, 0], 26, CW, CH), side = sideView(S, CW, CH);
  list.forEach((a, ci) => {
    const trio = here.geos[a][variant], o = look(a);
    [[trio.solid, top], [trio[2], top], [trio.solid, side], [trio[2], side]].forEach(([g, view], row) => { sky(img, W, ci * CW, row * CH, CW, CH); const n = drawTree(g, here.atlas, img, W, ci * CW, row * CH, CW, CH, view, o); if (row === 0) counts.push(`${NAMES[a]} ${n}`); });
  });
  const file = opt('file', `${out}/solids_sheet_v${variant}.png`);
  fs.writeFileSync(file, png(W, CH * 4, img));
  console.log(file + '\n  triangles: ' + counts.join(' · '));
} else if (close) {
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
    cols.forEach((a, ci) => { for (let lod = 0; lod < 3; lod++) { sky(img, W, ci * CW, lod * CH, CW, CH); counts.push(`${NAMES[a]} ${['close', 'near', 'far'][lod]} ${drawTree(set.geos[a][variant][lod], set.atlas, img, W, ci * CW, lod * CH, CW, CH, below ? under : above ? camera([0, 0.55 + 2.6 * 0.866, 2.6 * 0.5], [0, 0.55, 0], 26, CW, CH) : sideView(S, CW, CH), look(a))}`); } });
    const file = `${out}/trees_${cols.map((a) => NAMES[a]).join('_')}${below ? '_below' : above ? '_above' : ''}_v${variant}${against && set !== here ? '_old' : ''}.png`;
    fs.writeFileSync(file, png(W, H, img));
    console.log(file + '\n  ' + counts.join(' · '));
  }
}
