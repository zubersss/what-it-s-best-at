// The benchmark's counts and the plan of its cost test, without a browser (a second):
//   node scripts/cost-plan-test.mjs [--break drift|pass|bytes]
// 1. perf/glTally.js against a made-up context: draw calls, triangles, passes, uploads and their
//    bytes, and which uploads fall inside a pass; the context is left as it was found.
// 2. perf/costPlan.js: every group is measured twice with "everything on" on both sides; and with
//    a baseline that climbs by 40 ms over the test, a group that truly costs 9 ms reads 9 ms
//    (set against the first baseline, as --break drift does, it reads far off).
import { GlTally, TALLY, texelBytes, trianglesOf } from '../src/perf/glTally.js';
import { GROUPS, SAVING_GROUPS, costConfigs, baselineAt, framesFor } from '../src/perf/costPlan.js';
import { FEATURE_STEPS } from '../src/perf/governor.js';
const brk = process.argv.includes('--break') ? process.argv[process.argv.indexOf('--break') + 1] : null;
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

// --- 1. the tally
{
  const calls = [];
  class Fake { }
  for (const n of ['bindFramebuffer', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'bufferData', 'bufferSubData']) Fake.prototype[n] = function (...a) { calls.push(n); return n; };
  const gl = new Fake(), t = new GlTally(gl);
  t.install();
  const A = {}, B = {};
  // a frame: an upload before anything is drawn; target A cleared, drawn, an upload, drawn again
  // (inside a pass); an upload, then target B (between passes); the canvas.
  gl.texSubImage2D(0x0DE1, 0, 0, 0, 16, 8, 0x1908, 0x1401, new Uint8Array(16 * 8 * 4));          // 512 bytes
  gl.bindFramebuffer(0x8D40, A); gl.clear(0x4100);
  gl.drawElements(4, 300, 0x1403, 0);                                                             // 100 triangles
  gl.bufferSubData(0x8892, 0, new Float32Array(25));                                              // 100 bytes, inside A
  gl.drawElementsInstanced(4, 30, 0x1403, 0, 50);                                                 // 500 triangles
  gl.texSubImage2D(0x0DE1, 0, 0, 0, 4, 4, 0x1903, 0x140B, new Uint16Array(16));                   // 32 bytes, after A's last draw
  gl.bindFramebuffer(0x8D40, B); gl.drawArrays(5, 0, 4);                                          // 2 triangles
  gl.bindFramebuffer(0x8D40, null); if (brk !== 'pass') gl.drawArrays(4, 0, 3);                   // 1 triangle
  gl.bufferData(0x8892, 4096, 0x88E4);                                                            // storage alone: no bytes sent
  const sum = new Float64Array(TALLY.length); t.take(sum);
  const want = brk === 'bytes' ? [4, 603, 3, 3, 9999, 1, 100] : [4, 603, 3, 3, 644, 1, 100];
  check('a frame counted: ' + TALLY.map((n, i) => `${n} ${sum[i]}`).join(', '), want.every((v, i) => sum[i] === v), 'wanted ' + want.join(', '));
  check('the calls still reach the context', calls.length === (brk === 'pass' ? 11 : 12) && gl.drawArrays(4, 0, 3) === 'drawArrays');
  t.take(null); const none = new Float64Array(TALLY.length); t.take(none);
  check('a take begins the count again', none.every((v) => v === 0));
  t.remove();
  check('removed: the context is as it was', !Object.keys(gl).length && gl.clear === Fake.prototype.clear);
  check('bytes a texel', texelBytes(0x1908, 0x140B) === 8 && texelBytes(0x1903, 0x1401) === 1 && texelBytes(0x1902, 0x1405) === 4);
  check('triangles of a call', trianglesOf(4, 9, 2) === 6 && trianglesOf(5, 4) === 2 && trianglesOf(1, 10) === 0);
  check('the line for the report', /3\.0 passes · 4\.0 draw calls · 603 triangles · uploads 3\.0 \(1 KB\), 1\.00 of them inside a pass/.test(GlTally.text(sum, 0, 1)), GlTally.text(sum, 0, 1));
}

// --- 2. the plan
{
  const steps = [0, 1, 2, 3, 4, 5, 6], parts = GROUPS.flatMap((g) => g.parts).map((id) => ({ id })), groups = GROUPS.map((g, k) => ({ ...g }));
  const families = SAVING_GROUPS.map((g) => ({ ...g }));
  const held = 0.7, c = costConfigs(steps, parts, groups, held, 0.4, families), n = c.length;
  const isOn = (k) => c[k][0] === -1 && c[k][1] === held;
  let twice = true, flanked = true;
  groups.forEach((g, i) => { const at = c.map((x, k) => (x[0] === -100 - i ? k : -1)).filter((k) => k >= 0); if (at.length !== 2) twice = false; for (const k of at) if (!isOn(k - 1) || !isOn(k + 1)) flanked = false; });
  families.forEach((g, i) => { const at = c.map((x, k) => (x[0] === -200 - i ? k : -1)).filter((k) => k >= 0); if (at.length !== 2) twice = false; for (const k of at) if (!isOn(k - 1) || !isOn(k + 1)) flanked = false; });
  check('every group of parts and every family of savings is measured twice', twice);
  // (every saving the governor has, but the two that draw fewer patches, is in exactly one family)
  const ids = FEATURE_STEPS.map((f) => f.id).filter((id) => !id.startsWith('terrain-')), inFam = SAVING_GROUPS.flatMap((g) => g.steps);
  const lost = ids.filter((id) => inFam.filter((x) => x === id).length !== 1), unknown = inFam.filter((id) => !ids.includes(id));
  check('every saving is in exactly one family', !lost.length && !unknown.length, [...lost.map((x) => x + ' (in ' + inFam.filter((y) => y === x).length + ')'), ...unknown.map((x) => x + ' (no such saving)')].join(', '));
  check('a part that is a group by itself is not measured twice over', !c.some((x) => x[0] <= -10 && x[0] > -100 && groups.some((g) => g.parts.length === 1 && g.parts[0] === parts[-10 - x[0]].id)));
  check('frames a measure: a group 12, a part 10, a saving 8', framesFor(-100) === 12 && framesFor(-203) === 12 && framesFor(-1) === 12 && framesFor(-12) === 10 && framesFor(5) === 8);
  check('with everything on measured just before and just after', flanked);
  check('the report reads the last four where it expects them', c[n - 4][0] === -2 && isOn(n - 3) && c[n - 2][1] === 0.4 && c[n - 1][1] === 1);
  check('every part has everything on just before it', c.every((x, k) => !(x[0] <= -10 && x[0] > -100) || isOn(k - 1)));
  // a baseline that climbs 40 ms over the test, a group that costs 9 ms, every saving and part 0
  const base = (k) => 40 + 40 * k / (n - 1), ms = Float32Array.from(c, (x, k) => base(k) - (x[0] === -100 - 2 ? 9 : 0));
  const reads = c.map((x, k) => (x[0] === -100 - 2 ? (brk === 'drift' ? ms[0] : baselineAt(c, ms, k)) - ms[k] : null)).filter((v) => v != null);
  check(`a group that costs 9 ms reads 9 ms under a baseline that climbs 40 ms (${reads.map((v) => v.toFixed(2)).join(', ')})`, reads.length === 2 && reads.every((v) => Math.abs(v - 9) < 0.05));
  const others = c.map((x, k) => (x[0] >= 0 || (x[0] <= -10 && x[0] !== -100 - 2) ? baselineAt(c, ms, k) - ms[k] : null)).filter((v) => v != null);
  check('and what costs nothing reads nothing', others.every((v) => Math.abs(v) < 0.6), `largest ${Math.max(...others.map(Math.abs)).toFixed(2)} ms`);
  const hole = Float32Array.from(ms); hole[1 + 4 * 2 + 1] = NaN;             // (a baseline that could not be measured)
  check('a baseline that is missing is passed over', Math.abs(baselineAt(c, hole, 1 + 4 * 2) - hole[1 + 4 * 2] - 9) < 0.6);
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
