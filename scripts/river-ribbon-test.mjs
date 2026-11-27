// A river on far ground is one unbroken ribbon (no browser, seconds).
// Far patches have texels wider than a river. This builds real patches of Haven's ground
// over a river, coarser and coarser (the patch builder itself, with the rings the game has
// there), and walks down the river's middle line reading from each patch's normal map the
// share of river it holds there (as the ground's shader reads it: what the map has along
// the vertical, above one). Promises:
//   - at no place along the line is the share nothing, or under a third of what the
//     river's width is of a texel's (rivers over 8 m wide near the traveller, over 24 m
//     farther off: a brook in texels of 400 m is a hundredth of a texel, and nothing to see);
//   - the patch's ground is not cut where its texels are wider than the river (no notch
//     its mesh cannot hold): along the line it lies within 1 m of the ground beside it;
//   - on ground fine enough to hold the river it is all river in mid stream.
// --was: the builder as it was (a river met sample by sample): the first promise must fail.
import { ringsAt, havenSource, dirOf, haven } from './lib/havenWater.mjs';
import { ChunkBuilder } from '../src/terrain/chunkBuilder.js';
import { dirToFace, nodeEdge, FACES } from '../src/terrain/cubeSphere.js';
import { RIVER_STRIDE } from '../src/terrain/height/dem.js';
import { CONFIG } from '../src/config.js';

const WAS = process.argv.includes('--was'), S = RIVER_STRIDE;
// half float -> number
const fromHalf = (h) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return s * (e === 0 ? f * 2 ** -24 : e === 31 ? Infinity : (1 + f / 1024) * 2 ** (e - 15)); };

const PLACE = [-51.95908, 48.94203];          // the river south of the opening place: 46 m wide here
const rings = ringsAt(PLACE[0], PLACE[1]), R = haven.radius;
let fails = 0;
// Twice: with the three rings the game has near the traveller (the finest answers: patches up
// to 12 km wide lie inside its box), and with the two coarser ones alone, as the ground is
// farther off (the 126 m ring answers: patches of 12 to 49 km).
for (const [what, use, levels] of [['near the traveller (the 16 m ring answers)', rings, [9, 8, 7, 6, 5]], ['farther off (the 126 m ring answers)', [rings[0], rings[1], null], [5, 4, 3]]]) {
console.log(what + ':');
const hs = havenSource(use), fine = use[2] || use[1], sg = fine.packed.segs;
const builder = new ChunkBuilder(hs, CONFIG, { bakeChunk: () => null });
builder.noCover = WAS;
// the widest river's middle line near the place, as directions
const line = [];
{
  let best = -1, bw = 0; const px = (lat, lon) => { let bx = 0, by = 0, bd = 1e9; for (let y = 0; y < fine.W; y += 4) { const d = Math.abs(fine.g.latOf(y) - lat); if (d < bd) { bd = d; by = y; } } bd = 1e9; for (let x = 0; x < fine.W; x += 4) { const d = Math.abs(fine.g.lonOf(x) - lon); if (d < bd) { bd = d; bx = x; } } return [bx, by]; };
  const [cx, cy] = px(PLACE[0], PLACE[1]);
  for (let o = 0; o < sg.length; o += S) if (Math.hypot(sg[o] - cx, sg[o + 1] - cy) < (use[2] ? 150 : 60) && sg[o + 6] > (use[2] ? 4 : 12)) line.push({ lat: fine.g.latOf(sg[o + 1] - 0.5), lon: fine.g.lonOf(sg[o] - 0.5), half: sg[o + 6] });
}
if (line.length < 150) { console.log(`FAIL only ${line.length} points of a river were found near the place: the test tests nothing`); process.exit(1); }

const NR = CONFIG.NORMAL_RES, T = NR + 1;
for (const level of levels) {
  const edge = nodeEdge(level, R), texel = edge / NR, size = 2 / (1 << level), uv = [0, 0];
  // the patches the line crosses at this level
  const byPatch = new Map();
  for (const p of line) {
    const d = dirOf(p.lat, p.lon); let face = 0, bestN = -2;
    for (let f = 0; f < 6; f++) { const n = FACES[f].n, dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; if (dn > bestN) { bestN = dn; face = f; } }
    dirToFace(face, d[0], d[1], d[2], uv);
    const ix = Math.floor((uv[0] + 1) / size), iy = Math.floor((uv[1] + 1) / size), key = `${face}:${ix}:${iy}`;
    if (!byPatch.has(key)) byPatch.set(key, { face, ix, iy, pts: [] });
    byPatch.get(key).pts.push({ ...p, d, gu: ((uv[0] + 1) / size - ix) * NR, gv: ((uv[1] + 1) / size - iy) * NR });
  }
  let least = 1e9, leastWant = 0, n = 0, gaps = 0, worstCut = 0, patches = 0;
  for (const q of [...byPatch.values()].slice(0, 3)) {
    const out = builder.build(q.face, level, q.ix, q.iy, [0, 0, 1], 0.005), nm = out.normals;
    patches++;
    const share = (i, j) => { const o = (j * T + i) * 4, c = q.pts[0].d; return fromHalf(nm[o]) * c[0] + fromHalf(nm[o + 1]) * c[1] + fromHalf(nm[o + 2]) * c[2] - 1; };
    for (const p of q.pts) {
      const i = Math.min(NR - 1, Math.max(0, Math.floor(p.gu))), j = Math.min(NR - 1, Math.max(0, Math.floor(p.gv))), fu = p.gu - i, fv = p.gv - j;
      const v = (share(i, j) * (1 - fu) + share(i + 1, j) * fu) * (1 - fv) + (share(i, j + 1) * (1 - fu) + share(i + 1, j + 1) * fu) * fv;
      const want = Math.min(1, p.half / (0.7071 * texel));
      n++; if (v < Math.min(0.02, 0.2 * want)) gaps++;
      if (v / want < least / (leastWant || 1)) { least = v; leastWant = want; }
      // (the ground along the line against the ground some way to its side, where the texel is wider than the river)
      if (texel > 2.9 * p.half) {
        hs.setRiverCover(0.7071 * texel); const h0 = hs.height(p.d[0], p.d[1], p.d[2], 2 * texel); hs.setRiverCover(0);
        const e = 3 * p.half / R, h1 = hs.height(p.d[0] + e * 0.6, p.d[1] - e * 0.6, p.d[2], 2 * texel);
        if (!WAS) worstCut = Math.max(worstCut, 0);          // (measured below against the uncut ground)
        const hu = (() => { hs.setRiverCover(1e6); const h = hs.height(p.d[0], p.d[1], p.d[2], 2 * texel); hs.setRiverCover(0); return h; })();
        worstCut = Math.max(worstCut, Math.abs(h0 - hu));
      }
    }
  }
  const ok = gaps === 0 && least >= 0.3 * leastWant && worstCut < 1;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} patches ${(edge / 1000).toFixed(1)} km wide (texels of ${texel.toFixed(1)} m): ${n} places down the river in ${patches} patches; ${gaps} with no river; the least share ${least.toFixed(3)} where ${leastWant.toFixed(3)} is the river's width of a texel${worstCut > 0 ? `; the ground along the line within ${worstCut.toFixed(2)} m of the uncut ground` : ''}`);
}
}
console.log(fails ? `${fails} failures` : 'a river on far ground: an unbroken ribbon at every size of patch');
process.exit(fails ? 1 : 0);
