// The far tree's forms by the angle it is looked down at (life/farTreeForm.js), without a
// browser: what a number can prove of them. Fails (exit 1) when a promise is broken.
//   node scripts/far-tree-form-test.mjs
// 1. Seen from the ground nothing has changed: up to TOP0 every part is as wide as before
//    the forms (keep^-1/4, at most 1.5) and there is no shadow.
// 2. Nothing switches: no part's width jumps as the angle or the distance changes.
// 3. Looked down on at 45 degrees a tree still has both upright pictures, and its shadow;
//    from nearly straight above no upright picture (a pair of lines crossed otherwise).
// 4. A closed wood closes from above: the cover its crowns' tops give at 1, 2 and 4 km.
// 5. A lone tree stays its own size from above (at most 1.5 wide, as from the side).
// 6. Shadows lying over one another at a wood's edge come to SHADOW_DARK, and a lone
//    tree's shadow is SHADOW_DARK.
import { widths, shadowAlpha, TOP0, SHADOW_DARK, SITE_M2, TOP_MAX, SHADOW0 } from '../src/life/farTreeForm.js';
import { tileShadow } from '../src/life/farForest.js';

let failed = false;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) failed = true; };
const FULL = 450, keepAt = (d) => Math.min(1, (FULL / d) ** 2), old = (keep) => Math.min(1.5, Math.max(1, keep ** -0.25));

{ // 1
  let worst = 0;
  for (let d = 240; d <= 5600; d += 40) for (let down = -1; down <= TOP0 + 1e-9; down += 0.01) for (const dens of [0, 0.1, 0.5, 1]) {
    const w = widths(keepAt(d), down, dens), o = old(keepAt(d));
    worst = Math.max(worst, Math.abs(w.card - o), Math.abs(w.rose - o), w.shadow);
  }
  check(worst < 1e-9, `from the ground (looked down on by less than ${(Math.asin(TOP0) * 180 / Math.PI).toFixed(0)} degrees) every part is as it was: largest difference ${worst.toExponential(1)}`);
}
{ // 2
  let jump = 0, at = '';
  for (const dens of [0, 0.2, 0.5, 1]) for (let d = 240; d <= 5600; d += 20) for (let down = 0; down < 1; down += 0.0005) {
    const a = widths(keepAt(d), down, dens), b = widths(keepAt(d), down + 0.0005, dens), c = widths(keepAt(d + 20), down, dens);
    for (const k of ['card', 'rose', 'shadow']) for (const o of [b, c]) { const j = Math.abs(o[k] - a[k]) / Math.max(1, a[k]); if (j > jump) { jump = j; at = `${k} at ${d} m, down ${down.toFixed(3)}`; } }
  }
  check(jump < 0.05, `nothing switches: the largest change of a part over a 2 000th of the way from level to straight down or 20 m of distance is ${(jump * 100).toFixed(1)} % (${at})`);
}
{ // 3
  const w45 = widths(0.3, Math.sin(45 * Math.PI / 180), 1), w80 = widths(0.3, Math.sin(80 * Math.PI / 180), 1);
  check(w45.card >= 1 && w45.shadow === 1 && w80.card === 0, `looked down on at 45 degrees a tree has both its upright pictures (${w45.card.toFixed(2)} wide) and its shadow; at 80 degrees no upright picture`);
}
{ // 4: crowns of 3 m radius (a fir 18 m tall), a site in 49 m2 carrying a tree, placed without regard to one another
  const r = 3, cover = (d, w) => 1 - Math.exp(-keepAt(d) * Math.PI * (r * w) ** 2 / SITE_M2);
  const rows = [450, 1000, 2000, 4000].map((d) => ({ d, was: cover(d, old(keepAt(d))), now: cover(d, widths(keepAt(d), 1, 1).rose) }));
  console.log('     a closed wood from straight above, the share of the ground its crowns cover: ' + rows.map((x) => `${x.d} m: ${(x.now * 100).toFixed(0)} % (was ${(x.was * 100).toFixed(0)} %)`).join(', '));
  check(rows.every((x) => x.now >= x.was - 1e-9) && rows[1].now > 0.3 && rows[2].now > 0.25 && rows[3].now > 0.2, 'a closed wood keeps a fifth and more of its ground under crowns out to 4 km (the canopy the ground raises is the rest)');
  let widest = 0; for (let d = 240; d <= 5600; d += 20) widest = Math.max(widest, widths(keepAt(d), 1, 1).rose);
  check(widest <= TOP_MAX + 1e-9, `a crown's top spreads to at most ${widest.toFixed(1)} crown widths`);
}
{ // 5
  let widest = 0; for (let d = 240; d <= 5600; d += 20) for (let down = 0; down <= 1; down += 0.01) widest = Math.max(widest, widths(keepAt(d), down, 0.05).rose);
  check(widest <= 1.5 + 1e-9, `a lone tree is at most ${widest.toFixed(2)} of its width from any angle`);
}
{ // 6
  const lone = shadowAlpha(300, 0.02, 1), area = 400, n = 1 * 1 * area / SITE_M2, stacked = 1 - (1 - shadowAlpha(area, 1, 1)) ** n;
  check(Math.abs(lone - SHADOW_DARK) < 1e-9 && Math.abs(stacked - SHADOW_DARK) < 1e-6, `a lone tree's shadow takes ${lone.toFixed(2)} of the light, ${n.toFixed(1)} shadows over one another at a wood's edge ${stacked.toFixed(2)}`);
}
{ // 7: a rim (review farforest-2 and 3). The eye 70 m over a rim, a valley's trees 600 m
  // below, the nearest of them 1 200 m out along the ground: they are looked down on at
  // 29 degrees, past where shadows begin, so their tile's shadows are drawn, whole; and one
  // metre on, over the drop, nothing changes for them. (By the height over the ground
  // underfoot they were at 3 % on the rim and all there a metre on, and the tile was not
  // handed its shadows at all.)
  const R = 250000, rim = R + 1500, eye = rim + 70, low = rim - 600, near = 1200;
  const a = tileShadow(eye, low, near), b = tileShadow(eye, low, near - 1), down = (eye - low) / Math.hypot(eye - low, near);
  check(down > SHADOW0 && a.air === 1 && a.reach && b.air === a.air, `a valley's trees from a rim 670 m over them, looked down on at ${(Math.asin(down) * 180 / Math.PI).toFixed(0)} degrees: their shadows drawn ${(a.air * 100).toFixed(0)} %, handed over ${a.reach}; a metre on ${(b.air * 100).toFixed(0)} %`);
  const flat = tileShadow(R + 2, R, 300);
  check(flat.air === 0, `on the ground among the trees no shadows are drawn (${(flat.air * 100).toFixed(0)} %)`);
}
console.log(failed ? '\nfar tree forms: FAILED' : '\nfar tree forms: every check passed');
process.exit(failed ? 1 : 0);
