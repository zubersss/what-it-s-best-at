// The trees' solid make (life/treeGeometry.js, solidOf: what a tree is to whoever looks down
// on it) is the same tree as its middle-distance mesh, and fit to be drawn (no browser, seconds):
//   node scripts/tree-solid-test.mjs [--break tall|wide|lean|grow]
// For every shape and variant: 24 to 90 triangles; its top within 7 % of the tree's height of
// the middle mesh's foliage top, its crown between 0.55 and 1.2 of that foliage's reach, its
// crown's middle within 0.08 of a tree height of it sideways (the lean), or a tree would change
// shape as the eye rises; every face's point of growth (aCrown) inside the solid's own box,
// the stem's its own vertex; its faces plain (aLeaf 1.5, no picture: fir, palm) or cards of the
// trees' picture (3: the domes of the other shapes), its tones 0..1; and the
// shaders that draw it know the code 1.5 (--break: one measure put wrong, to see its check fail).
import fs from 'node:fs';
import { makeTreeGeometries } from '../src/life/treeGeometry.js';
const brk = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : null;
const NAMES = ['conifer', 'pine', 'broadleaf', 'tropical', 'umbrella', 'bush', 'palm', 'slender', 'blossom'];
let failed = 0; const fail = (m) => { console.log('FAILED: ' + m); failed++; };
const pct = (a, q) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
const geos = makeTreeGeometries(), rows = [];
geos.forEach((variants, a) => variants.forEach((trio, v) => {
  const name = `${NAMES[a]} ${v}`, S = trio.solid, N = trio[1];
  if (!S) return fail(`${name}: no solid make`);
  const sp = S.attributes.position.array, sl = S.attributes.aLeaf.array, sc = S.attributes.aCrown.array, sw = S.attributes.aSway.array, su = S.attributes.aUv.array;
  const np = N.attributes.position.array, nl = N.attributes.aLeaf.array;
  const pts = (P, L, on) => { const o = []; for (let i = 0; i < L.length; i++) if (on(L[i])) o.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]); return o; };
  const sf = pts(sp, sl, (l) => l > 0.5), nf = pts(np, nl, (l) => l > 0.5);
  const mid = (Q) => [0, 2].map((i) => Q.reduce((x, p) => x + p[i], 0) / Q.length), reach = (Q, m) => pct(Q.map((p) => Math.hypot(p[0] - m[0], p[2] - m[1])), 0.95);
  const sm = mid(sf), nm = mid(nf);
  let top = Math.max(...sf.map((p) => p[1])), wide = reach(sf, sm) / reach(nf, nm), lean = Math.hypot(sm[0] - nm[0], sm[1] - nm[1]);
  const ntop = pct(nf.map((p) => p[1]), 0.99);
  if (brk === 'tall') top += 0.2; if (brk === 'wide') wide *= 1.6; if (brk === 'lean') lean += 0.2;
  const tris = sl.length / 3;
  if (tris < 24 || tris > 90) fail(`${name}: ${tris} triangles (24 to 90)`);
  if (Math.abs(top - ntop) > 0.07) fail(`${name}: its top at ${top.toFixed(3)} of the tree's height, the middle mesh's foliage at ${ntop.toFixed(3)}`);
  if (wide < 0.55 || wide > 1.2) fail(`${name}: its crown ${wide.toFixed(2)} of the middle mesh's reach (0.55 to 1.2)`);
  if (lean > 0.08) fail(`${name}: its crown's middle ${lean.toFixed(3)} of a tree height off the middle mesh's`);
  // box, growth points, codes, tones
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < sl.length; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], sp[i * 3 + k]); hi[k] = Math.max(hi[k], sp[i * 3 + k]); }
  let badGrow = 0, badCode = 0, badTone = 0;
  for (let i = 0; i < sl.length; i++) {
    const g = [sc[i * 3], sc[i * 3 + 1] + (brk === 'grow' && sl[i] > 0.5 ? 2 : 0), sc[i * 3 + 2]];
    if (sl[i] < 0.5) { if (g.some((x, k) => Math.abs(x - sp[i * 3 + k]) > 1e-6)) badGrow++; }
    else { if (g.some((x, k) => x < lo[k] - 0.02 || x > hi[k] + 0.02)) badGrow++; const plain = Math.abs(sl[i] - 1.5) < 1e-6 && su[i * 2] < 0, dome = Math.abs(sl[i] - 3) < 1e-6 && su[i * 2] >= 0 && su[i * 2] <= 1 && su[i * 2 + 1] >= 0 && su[i * 2 + 1] <= 1; if (!plain && !dome) badCode++; if (!(sw[i * 2 + 1] >= 0 && sw[i * 2 + 1] <= 1)) badTone++; }
  }
  if (badGrow) fail(`${name}: ${badGrow} corners grow from a point outside the solid (aCrown)`);
  if (badCode) fail(`${name}: ${badCode} foliage corners that are neither plain faces of code 1.5 nor cards of the picture (3, inside it)`);
  if (badTone) fail(`${name}: ${badTone} corners with a tone outside 0..1`);
  rows.push(`${name}: ${tris} tris, top ${top.toFixed(2)}/${ntop.toFixed(2)}, crown x${wide.toFixed(2)}`);
}));
console.log('  ' + rows.filter((_, i) => i % 3 === 0).join('\n  '));
// the shaders that draw it
const trees = fs.readFileSync(new URL('../src/life/trees.js', import.meta.url), 'utf8');
for (const t of ['bool solid = !card && vLeaf > 1.4 && vLeaf < 1.75;', 'if (solidMake && aLeaf > 0.5) p = mix(aCrown, p, solidG);', 'if (aLeaf > 1.75 && aLeaf < 3.5) { float ph', 'treeCull = treeCull || (solidMake ? solidG <= 0.0 : (aCrown.z > 2.5 && solidG >= 1.0));'])
  if (!trees.includes(t)) fail(`life/trees.js no longer has "${t}": the solid make's code (1.5) or its growth is read another way; bring this test in step`);
console.log(failed ? `tree solids: ${failed} FAILED` : `tree solids: every check passed (${rows.length} solids)`);
process.exit(failed ? 1 : 0);
