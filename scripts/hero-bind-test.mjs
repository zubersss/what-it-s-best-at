// The sculpted character's binding (public/data/hero.bin, scripts/hero/heroBind.mjs) against
// its promises, without a browser (some 10 s):
//   1. standing as the sculpt stands, the game's sums give the sculpt back (within 2 mm);
//   2. in the game's poses (hover, walk, run, fly, fast, the take-off; super speed and the
//      kneel after a hard landing; after three seconds of each) the surface is not torn: few
//      edges are drawn out by more than 5 cm and to three times their length. The sculpt is
//      one fused surface, and whatever moves the two sides of a join apart draws shards
//      between them: 5 400 such edges in the hover when the cloth was bound sheet by sheet,
//      70 with the arms brought in to the sides, 8 with them held out as sculpted; in flight
//      4 000 while one arm reached ahead, under 100 with the arms swept back. At super speed
//      the sleeves whip, and in the kneel the bent legs press the gown out: known, and
//      bounded (ROUGH) so that it is seen if it grows.
//
//   node scripts/hero-bind-test.mjs [--list]      --list: the worst edges of each pose, by cause
import fs from 'node:fs';
import { parseHero } from '../src/hero/heroFile.js';
import { posed } from './hero/heroBind.mjs';

const LIMIT = 600, ROUGH = 3000, list = process.argv.includes('--list');
const b = fs.readFileSync(new URL('../public/data/hero.bin', import.meta.url)), hero = parseHero(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
let failed = 0; const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) failed++; };
for (const [li, m] of hero.lods.entries()) {
  const P = m.position, I = m.index, d = (A, i, j) => Math.hypot(A[i * 3] - A[j * 3], A[i * 3 + 1] - A[j * 3 + 1], A[i * 3 + 2] - A[j * 3 + 2]);
  {
    const { position: Q } = await posed(m, hero.shared, 'stand'); let worst = 0;
    for (let i = 0; i < P.length; i++) worst = Math.max(worst, Math.abs(Q[i] - P[i]));
    check(worst < 0.002, `mesh ${li}: standing, the sums give the sculpt back (furthest ${(worst * 1000).toFixed(2)} mm)`);
  }
  for (const pose of ['hover', 'walk', 'run', 'super', 'land', 'fly', 'fast', 'launch']) {
    const { position: Q } = await posed(m, hero.shared, pose, 3), bad = [];
    let finite = true; for (let i = 0; i < Q.length; i++) if (!Number.isFinite(Q[i])) finite = false;
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const i = I[t + e], j = I[t + (e + 1) % 3], l0 = d(P, i, j), r = d(Q, i, j) - l0; if (r > 0.05 && r > 2 * l0) bad.push([r, i, j]); }
    const limit = pose === 'super' || pose === 'land' ? ROUGH : LIMIT;      // (the same for the lighter mesh: it has fewer edges and longer ones, and by no steady rule fewer drawn out)
    check(finite && bad.length <= limit, `mesh ${li}: ${pose}: ${bad.length} edges drawn out by more than 5 cm and to three times their length (at most ${limit})${finite ? '' : ', and a place that is no number'}`);
    if (list) {
      bad.sort((p, q) => q[0] - p[0]);
      const cloth = (v) => m.shares[v * 4] + m.shares[v * 4 + 1] + m.shares[v * 4 + 2] + m.shares[v * 4 + 3];
      const say = (v) => `garment ${m.garment[v]} label ${hero.labels[m.label[v]]} parts ${m.parts[v * 4]},${m.parts[v * 4 + 1]}:${m.parts[v * 4 + 2]}:${m.parts[v * 4 + 3]} cloth ${cloth(v)} at ${[0, 1, 2].map((k) => P[v * 3 + k].toFixed(2)).join(',')} moved ${[0, 1, 2].map((k) => (Q[v * 3 + k] - P[v * 3 + k]).toFixed(2)).join(',')}`;
      let g = 0, p = 0, c = 0; for (const [, i, j] of bad) { if (m.garment[i] !== m.garment[j]) g++; else if (m.parts[i * 4] !== m.parts[j * 4]) p++; else if (Math.abs(cloth(i) - cloth(j)) > 40) c++; }
      console.log(`     across garments ${g}, across parts ${p}, across a step in the cloth's share ${c}, other ${bad.length - g - p - c}`);
      for (const [r, i, j] of bad.slice(0, 5)) console.log(`     ${r.toFixed(2)} m\n       ${say(i)}\n       ${say(j)}`);
    }
  }
}
console.log(failed ? `hero-bind-test: ${failed} FAILED` : 'hero-bind-test: all passed');
process.exit(failed ? 1 : 0);
