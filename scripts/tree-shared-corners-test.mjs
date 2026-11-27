// A tree's mesh with its corners shared (life/treeGeometry.js, sharedCorners: what trees.js
// hands the GPU) is the same triangles: node scripts/tree-shared-corners-test.mjs [--break merge|order]
// For every shape, variant and distance: drawn out again through its index, every attribute of
// every corner of every triangle is the mesh's own to the last bit, in the same order; and the
// vertices are fewer by a third at least over all meshes (or the sharing is not worth having).
// --break merge: corners that differ only in their normal are shared; --break order: the
// index is turned round. Each must fail.
import { makeTreeGeometries, sharedCorners } from '../src/life/treeGeometry.js';
const brk = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : null;
const NAMES = ['position', 'normal', 'aLeaf', 'aSway', 'aUv', 'aCrown'];
let failed = 0, was = 0, now = 0, meshes = 0;
const geos = makeTreeGeometries();
geos.forEach((variants, si) => variants.forEach((trio, vi) => trio.forEach((geo, lod) => {
  const names = brk === 'merge' ? NAMES.filter((n) => n !== 'normal') : NAMES;
  const s = sharedCorners(geo, names), ix = Array.from(s.index.array);
  if (brk === 'merge') s.attributes.normal = { array: Float32Array.from({ length: s.attributes.position.count * 3 }, () => 0), itemSize: 3 };
  if (brk === 'order') ix.reverse();
  const n = geo.attributes.position.count; meshes++; was += n; now += s.attributes.position.count;
  let bad = ix.length !== n ? 1 : 0;
  for (const name of NAMES) {
    const a = geo.attributes[name], b = s.attributes[name], k = a.itemSize;
    const wa = new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length), wb = new Uint32Array(b.array.buffer, b.array.byteOffset, b.array.length);
    for (let i = 0; i < n && !bad; i++) for (let c = 0; c < k; c++) if (wa[i * k + c] !== wb[ix[i] * k + c]) { bad = 1; console.log(`BROKEN: shape ${si} variant ${vi} distance ${lod}: corner ${i} has another ${name} through the index`); break; }
  }
  if (Math.max(...ix) !== s.attributes.position.count - 1) { bad = 1; console.log(`BROKEN: shape ${si} variant ${vi} distance ${lod}: vertices no triangle uses`); }
  failed += bad;
})));
console.log(`${meshes} meshes: ${was} corners handed over as ${now} vertices (${(100 * now / was).toFixed(0)} %)`);
if (now > was * 0.67) { failed++; console.log('BROKEN: fewer than a third of the corners are shared'); }
console.log(failed ? `tree corners: ${failed} broken` : 'tree corners: the same triangles from half the vertices');
process.exit(failed ? 1 : 0);
