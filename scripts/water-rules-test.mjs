// Living water's rules, where two places must agree (no browser, seconds):
//  1. the surf: the GLSL the ground's shaders compile against the JS the swimmer rides
//     (water/surf.js), and its clock: nothing moves when the waves' clock wraps;
//  2. running water in the normal map: what the patch builder writes (riverNormal) read
//     back by the GLSL the ground's shader reads it with (riverShare, riverFlow): the
//     river's share of a texel and its flow come back, land and still water read as none;
//  3. the river's lanes repeat with the detail tile whatever way the river runs (a patch
//     knows its place in the tile only modulo one tile), with all four wave vectors and
//     with the governor's one;
//  4. no shader text of the water's uses a word GLSL ES 3 reserves as a name (a float
//     called `half` once left the waterfalls undrawn; the build does not compile shaders).
import fs from 'node:fs';
import { runGlsl, GLSL_RESERVED } from './lib/glslRun.mjs';
import { SURF_GLSL, surfTurn, surfLift, surfHeight, SURF_PERIOD } from '../src/water/surf.js';
import { RIVER_GLSL, FLOW_UNIT, RIVER_T } from '../src/water/river.js';
import { riverNormal } from '../src/terrain/chunkBuilder.js';

let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// --- 1. the surf
{
  const g = runGlsl(SURF_GLSL, {});
  let worst = 0, worstLift = 0, wrap = 0;
  for (let k = 0; k < 400; k++) {
    const u = rnd() * 40 - 20, v = rnd() * 40 - 20, depth = rnd() * 9, t = rnd() * 14400, scale = 0.45 + rnd() * 2.7;
    const a = g.fn.surfTurn([u, v], depth, t), b = surfTurn(u, v, depth, t);
    let d = Math.abs(a - b); d = Math.min(d, 1 - d); worst = Math.max(worst, d);
    worstLift = Math.max(worstLift, Math.abs(g.fn.surfLift(b, depth, g.fn.surfHeight(scale)) - surfLift(b, depth, surfHeight(scale))));
    // (the clock wraps at 14 400 s: the turn at t and at t + 14 400 is the same)
    let w = Math.abs(surfTurn(u, v, depth, t) - surfTurn(u, v, depth, t + 14400)); w = Math.min(w, 1 - w); wrap = Math.max(wrap, w);
  }
  // (32-bit floats in the shader: the clock of four hours times its rate keeps some four digits of the turn)
  check(worst < 2e-3, `the surf's turn: the shader's text and the game's agree (at most ${worst.toExponential(1)} of a turn apart in 400 places)`);
  check(worstLift < 1e-4, `the surf's lift: the shader's text and the game's agree (at most ${worstLift.toExponential(1)} m apart)`);
  check(wrap < 1e-6 && 14400 % SURF_PERIOD === 0, `the surf does not move when the waves' clock wraps (period ${SURF_PERIOD} s; ${wrap.toExponential(1)} of a turn)`);
}

// --- 2. running water in the normal map
const rg = runGlsl(RIVER_GLSL.replace(/vec4 riverRun\([\s\S]*?\n}\n/, ''), {});          // (riverRun reads a texture by its gradients: not run here)
{
  let worstShare = 0, worstFlow = 0, land = 0, n = 0;
  const out = [0, 0, 0];
  for (let k = 0; k < 600; k++) {
    // a place, a water surface nearly level there, a flow, a share
    const lat = (rnd() - 0.5) * 3, lon = rnd() * 6.28, d = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    const fe = (rnd() - 0.5) * 12, fn = (rnd() - 0.5) * 12, cv = k % 3 === 0 ? 1 : 0.1 + 0.9 * rnd();
    riverNormal(d, d, fe, fn, cv, out);
    const share = rg.fn.riverShare(out, d), fl = rg.fn.riverFlow(out, d);
    // (the shader's share is eased: (dot - 1.03) / 0.9, so that still water's rounding reads as none)
    const want = Math.min(1, Math.max(0, (cv - 0.03) / 0.9));
    worstShare = Math.max(worstShare, Math.abs(share - want));
    // the flow back in east and north, over the share
    const el = 1 / Math.hypot(d[0], d[1]), e = [-d[1] * el, d[0] * el, 0], nn = [-d[2] * e[1], d[2] * e[0], d[0] * e[1] - d[1] * e[0]];
    const be = (fl[0] * e[0] + fl[1] * e[1]) / cv, bn = (fl[0] * nn[0] + fl[1] * nn[1] + fl[2] * nn[2]) / cv;
    worstFlow = Math.max(worstFlow, Math.hypot(be - fe, bn - fn)); n++;
    // land (a normal of length one, however tilted) and still water read as no river
    const tilt = rnd() * 1.2, a = rnd() * 6.28, ln = [d[0] + e[0] * tilt * Math.cos(a) + nn[0] * tilt * Math.sin(a), d[1] + e[1] * tilt * Math.cos(a) + nn[1] * tilt * Math.sin(a), d[2] + nn[2] * tilt * Math.sin(a)], ll = Math.hypot(...ln);
    if (rg.fn.riverShare(ln.map((x) => x / ll), d) > 0 || rg.fn.riverShare(d, d) > 0) land++;
  }
  check(worstShare < 2e-3, `a river's share of a texel comes back from the normal map (${n} texels; at most ${worstShare.toExponential(1)} off)`);
  check(worstFlow < 0.02, `and its flow (at most ${worstFlow.toFixed(4)} m/s off; ${FLOW_UNIT} m/s to one)`);
  check(land === 0, 'land, however steep, and still water read as no river');
}

// --- 3. the lanes repeat with the detail tile
{
  let worst = 0;
  for (const whole of [true, false]) for (let k = 0; k < 300; k++) {
    const ang = rnd() * 6.28, cyc = 10 + rnd() * 20, la = [Math.cos(ang) * cyc, Math.sin(ang) * cyc], uv = [rnd() * 3, rnd() * 3], hs = [1, 1];
    const a = rg.fn.riverStripes(la, uv, hs, whole);
    for (const [i, j] of [[1, 0], [0, 1], [3, -2], [-7, 5]]) { const b = rg.fn.riverStripes(la, [uv[0] + i, uv[1] + j], hs, whole); worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
  }
  check(worst < 2e-3, `the lanes are the same a whole tile on, any way the river runs, with four wave vectors and with one (at most ${worst.toExponential(1)} apart)`);
  check(14400 % RIVER_T === 0, `the dashes' turn (${RIVER_T} s) divides the waves' clock: nothing jumps when it wraps`);
}

// --- 4. no reserved word as a name in the water's shader texts
{
  const files = ['src/water/river.js', 'src/water/surf.js', 'src/water/falls.js', 'src/water/waves.js', 'src/terrain/terrainMaterial.js'];
  const bad = [];
  const scan = (f, src) => {
    const text = src.replace(/\/\/[^\n]*/g, '');
    for (const m of text.matchAll(/\b(?:float|int|bool|vec[234]|ivec[234]|mat[234])\s+([A-Za-z_]\w*)((?:\s*(?:=[^;,]*)?,\s*[A-Za-z_]\w*)*)/g)) {
      const names = [m[1], ...[...m[2].matchAll(/,\s*([A-Za-z_]\w*)/g)].map((q) => q[1])];
      for (const nm of names) if (GLSL_RESERVED.has(nm)) bad.push(`${f}: ${nm}`);
    }
  };
  // (the scan itself, on the fault it was written for: it must find both)
  scan('self', 'float half = aDim.x, drop = aDim.y; vec3 a = vec3(0.0), sample = a;');
  check(bad.length === 2, 'the scan for reserved words finds the two planted in its own test line');
  bad.length = 0;
  for (const f of files) scan(f, fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
  check(bad.length === 0, `no word GLSL ES 3 reserves is used as a name in ${files.length} files of shader text${bad.length ? ': ' + [...new Set(bad)].join(', ') : ''}`);
}
console.log(fails ? `${fails} failures` : "living water's rules: all kept");
process.exit(fails ? 1 : 0);
