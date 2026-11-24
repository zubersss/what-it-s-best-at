// The ground's far look, without a browser (terrain/terrainMaterial.js, "THE GROUND FROM
// AFAR" and the steppe's colour; review groundfar2). Fails (exit 1) when:
//  1. a pattern read in the detail tile's coordinates has a scale that is not a whole number
//     of cycles over DETAIL_PERIOD tiles (it breaks along the patches' edges: each patch knows
//     its tile only modulo that many);
//  2. a shade or share the shader divides by or subtracts (terrain/farGround.js) is no longer
//     the mean of its pattern, measured on the pattern's mirror (the land's tone would then
//     change with distance as the pattern fades);
//  3. the steppe's shrubs repeat: the mask against itself moved by a third of a tile, a tile
//     and two tiles (the 178b732 shrubs, one picture tiled every 21.3 m: --old) must not match.
//   node scripts/far-ground-test.mjs [--file <a terrainMaterial.js>] [--old]
import { readFileSync } from 'node:fs';
import { FAR_GROUND, crowns } from '../src/terrain/farGround.js';
import { makeDetailTexture } from '../src/terrain/surfaceTextures.js';
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const PERIOD = 16;
let failed = false; const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed = true; };
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

{ // 1
  const src = readFileSync(opt('file', new URL('../src/terrain/terrainMaterial.js', import.meta.url)), 'utf8');
  const scalesIn = (text) => {
    const out = [];
    for (const m of text.matchAll(/vDetailUv\s*\*\s*([0-9.]+)/g)) out.push(+m[1]);
    for (const m of text.matchAll(/dot\(vDetailUv,\s*vec2\(([-0-9.]+),\s*([-0-9.]+)\)\)/g)) out.push(+m[1], +m[2]);
    for (const m of text.matchAll(/crowns\([^;]*?,\s*([0-9.]+)\);/g)) out.push(+m[1]);
    return out;
  };
  const whole = (k) => Math.abs(k * PERIOD - Math.round(k * PERIOD)) < 1e-6;
  // (the far look's own text: the helpers above main, and the block of the far forest)
  const part = (from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i); return i >= 0 && j > i ? src.slice(i, j) : ''; };
  const own = part('vec4 crowns(', 'void main()') + part('THE GROUND FROM AFAR, 1', 'end of THE GROUND FROM AFAR, 1');
  const scales = scalesIn(own), bad = scales.filter((k) => !whole(k));
  check(scales.length > 8 && bad.length === 0, `${scales.length} scales in the detail tile's coordinates in the far look, each a whole number of cycles over ${PERIOD} tiles${bad.length ? ': not ' + bad.join(', ') : ''}`);
  const elsewhere = [...new Set(scalesIn(src).filter((k) => !whole(k)))];
  if (elsewhere.length) console.log(`     (elsewhere in the shader, not the far look's: ${elsewhere.join(', ')})`);
}
{ // 2
  const N = 500; let st = 0, cr = 0, cl = 0, clz = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * PERIOD, v = y / N * PERIOD;
    const g = crowns(u + 0.37, v + 0.37, 3), c = crowns(u, v, 8), z = crowns(u + 0.71, v + 0.71, 1.5);
    st += (0.7 + 0.42 * ss(0, 0.6, g[2])) * (0.84 + 0.32 * g[3]); cr += (0.4 + 0.78 * ss(0, 0.5, c[2])) * (0.76 + 0.48 * c[3]);
    cl += (0.48 + 0.8 * ss(0, 0.55, z[2])) * (0.8 + 0.4 * z[3]); clz += z[2];
  }
  const n = N * N, m = { standMean: st / n, crownMean: cr / n, clumpMean: cl / n, clumpZ: clz / n };
  // the steppe's: on the detail tile's level 4, as the shader reads it
  const t = makeDetailTexture(256), d = t.image.data, s = 16, L = [], ln = 16;
  for (let j = 0; j < ln; j++) for (let i = 0; i < ln; i++) { let a = 0; for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) a += d[((j * s + y) * 256 + i * s + x) * 4 + 2] / 255; L.push(a / s / s); }
  const bl = (u, v) => { const x = u * ln - 0.5, y = v * ln - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, g = (i, j) => L[(((j % ln) + ln) % ln) * ln + (((i % ln) + ln) % ln)]; return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy; };
  let soil = 0, shrub = 0; const M = 400;
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const u = x / M * PERIOD, v = y / M * PERIOD;
    soil += ss(0.545, 0.605, 0.6 * bl(0.75 * u + 0.25 * v + 0.13, -0.25 * u + 0.75 * v + 0.13) + 0.4 * bl(0.3125 * u - 0.125 * v + 0.61, 0.125 * u + 0.3125 * v + 0.61));
    const gate = Math.min(0.4, Math.max(0, 0.12 + 0.8 * (bl(0.3125 * u + 0.29, 0.3125 * v + 0.83) - 0.5))), c = crowns(u + 0.19, v + 0.53, 16);
    shrub += ss(0.05, 0.35, c[2]) * (c[3] < gate ? 1 : 0);
  }
  m.soilMean = soil / (M * M); m.shrubMean = shrub / (M * M);
  for (const k of Object.keys(FAR_GROUND)) { const ok = Math.abs(m[k] - FAR_GROUND[k]) < 0.01 + 0.02 * FAR_GROUND[k]; check(ok, `${k}: ${FAR_GROUND[k]} in farGround.js, measured ${m[k].toFixed(3)}`); }
}
{ // 3
  const old = args.includes('--old');
  let lv = null;
  if (old) { const t = makeDetailTexture(256), d = t.image.data; lv = []; for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { let a = 0; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) a += d[((j * 16 + y) * 256 + i * 16 + x) * 4 + 2] / 255; lv.push(a / 256); } }
  const mask = (u, v) => {
    if (old) { const x = ((Math.floor((u * 3 + 0.37) * 16) % 16) + 16) % 16, y = ((Math.floor((v * 3 + 0.37) * 16) % 16) + 16) % 16; return ss(0.665, 0.695, lv[y * 16 + x]); }
    const c = crowns(u + 0.19, v + 0.53, 16); return ss(0.05, 0.35, c[2]) * (c[3] < 0.2 ? 1 : 0);
  };
  for (const shift of [1 / 3, 1, 2]) {
    let sab = 0, sa = 0, sb = 0, saa = 0, sbb = 0, n = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) { const u = 3.1 + x * 0.004, v = 5.7 + y * 0.004, a = mask(u, v), b = mask(u + shift, v); sab += a * b; sa += a; sb += b; saa += a * a; sbb += b * b; n++; }
    const r = (sab / n - sa / n * sb / n) / Math.sqrt(Math.max(1e-9, (saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2)));
    check(r < 0.3, `the shrubs against themselves ${(shift * 64).toFixed(1)} m on: correlation ${r.toFixed(2)}${old ? ' (178b732)' : ''}`);
  }
}
console.log(failed ? '\nthe ground from afar: FAILED' : '\nthe ground from afar: every check passed');
process.exit(failed ? 1 : 0);
