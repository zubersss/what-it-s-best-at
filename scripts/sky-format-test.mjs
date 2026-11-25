// The sky's snapshot format and its test pattern, without a browser (src/weather/sky/format.js
// and src/weather/sky/stub.js; docs/briefs/clouds-weather-plan.md, "STEP 0"). Fails (exit 1) when:
//  1. an encoding does not give back its own bytes (every byte of every channel, decoded and
//     encoded again), or is not monotonic;
//  2. the GLSL readers (FIELD_GLSL: its arithmetic read back from the string and run in JS)
//     and the JS decoders disagree on sample bytes and places; the string's constants are not
//     the JS's; it lacks a decoder, uses a word GLSL ES 3 reserves as a name, or a backtick;
//  3. the CPU reader (fieldAt) is not what a GPU gives from the blended bytes (an emulation
//     written here: each texel mixed and written back to a byte, LINEAR, REPEAT x CLAMP);
//  4. snapshot(t) is not byte-identical across two calls, two stubs and two processes, or is
//     not a snapshot of the format (checkSnapshot);
//  5. at() is not a bilinear decode of the snapshots' bytes within 1/255, or rains above the base;
//  6. asking at() at 200 other places (and times) changes anything: the field, at() at a
//     fixed place, the cells or the strikes (no traveller input);
//  7. strikes over a split window are not the union of its parts, differ between two stubs,
//     or reach the ground far from 30-35 % of the time;
//  8. more than 8 cells live within 200 km of a place; a cell moves further between two frames
//     than its steering allows; two live cells share an id;
//  9. a preset does not hold: 'fair' dry and heaps 2x as many over high ground; 'fog' in the
//     basins and the opening place 300 m or more above every fog top within 2 km; 'storm' a
//     mature cell within 40 km of the opening place at every 10 minutes of a day, raining
//     under its core; 'front' cirrus ahead, rain at the opening place at 6 h, wet after;
// 10. a file under src/weather/sky imports three or the DOM, or calls Math.random.
//   node scripts/sky-format-test.mjs [--break glsl|const|uv]   (--break: a fault put into the
//   GLSL as read, to see check 2 fail)
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ENC, CHANNELS, DECODERS, GLSL_DECODERS, FIELD_GLSL, enc, dec, byte, fieldAt, uvOfDir, uvOfLatLon,
  blendByte, checkSnapshot, CELL, SNAP_STEP, fieldLayout,
} from '../src/weather/sky/format.js';
import { createSkyStub, landFromI16, STUB_PRESETS, STUB_SPEED } from '../src/weather/sky/stub.js';
import world from '../src/worlds/haven.js';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const here = fileURLToPath(import.meta.url);
const DEM = new URL('../public/data/haven_dem_4096.i16', import.meta.url);
const land = () => landFromI16(readFileSync(DEM), 4096, 2048);
const hashOf = (s) => { const h = createHash('sha1'); for (const k of ['A', 'B', 'C']) h.update(s[k]); h.update(new Uint8Array(s.cells.buffer)); h.update(new Uint8Array(s.lenses.buffer)); return h.digest('hex'); };

// ---- a child process: the hash of one snapshot -------------------------------------------
if (args[0] === '--child') {
  const st = createSkyStub({ world, preset: args[1], land: land() });
  process.stdout.write(hashOf(st.snapshot(+args[2])));
  process.exit(0);
}

let failed = false; const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed = true; };
const D2R = Math.PI / 180, R = world.radius;
// a deterministic sequence for the test's own samples
let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const randDir = () => { const z = 2 * rnd() - 1, a = 2 * Math.PI * rnd(), r = Math.sqrt(1 - z * z); return [r * Math.cos(a), r * Math.sin(a), z]; };
const dirOf = (lat, lon) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
const latLonOf = (d) => ({ lat: Math.asin(d[2]) / D2R, lon: ((Math.atan2(d[1], d[0]) / D2R) + 360) % 360 });
const distM = (a, b) => 2 * Math.asin(Math.min(1, 0.5 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))) * R;
const offset = (lat, lon, bearing, m) => { const d = m / R, la = lat * D2R, lo = lon * D2R, b = bearing * D2R; const l2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b)); return { lat: l2 / D2R, lon: (lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(l2))) / D2R }; };
const MAPS = { A: 4, B: 4, C: 2 };

// ---- a GPU, emulated here (not format.js's code): LINEAR filter, REPEAT across u, CLAMP across v
function gpuTexel(map, i, j) { const { bytes, w, ch } = map, o = (j * w + i) * ch, v = [0, 0, 0, 1]; for (let k = 0; k < ch; k++) v[k] = bytes[o + k] / 255; return v; }
function gpuTexture(map, uv) {
  const { w, h } = map, x = uv[0] * w - 0.5, y = uv[1] * h - 0.5, i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j;
  const wrap = (k) => ((k % w) + w) % w, cl = (k) => Math.min(h - 1, Math.max(0, k));
  const t00 = gpuTexel(map, wrap(i), cl(j)), t10 = gpuTexel(map, wrap(i + 1), cl(j)), t01 = gpuTexel(map, wrap(i), cl(j + 1)), t11 = gpuTexel(map, wrap(i + 1), cl(j + 1));
  return t00.map((_, k) => (t00[k] * (1 - a) + t10[k] * a) * (1 - b) + (t01[k] * (1 - a) + t11[k] * a) * b);
}
// the 'now' copy of a map: every texel mixed between two snapshots and written to a byte as a
// render target of bytes stores it (round to nearest)
function gpuBlend(m0, m1, f) {
  const out = new Uint8Array(m0.bytes.length);
  for (let k = 0; k < out.length; k++) { const x = (m0.bytes[k] / 255) * (1 - f) + (m1.bytes[k] / 255) * f; out[k] = Math.min(255, Math.max(0, Math.round(x * 255))); }
  return { ...m0, bytes: out };
}
const mapOf = (s, k) => (k === 'C' ? { bytes: s.C, w: s.cWidth, h: s.cHeight, ch: 2 } : { bytes: s[k], w: s.width, h: s.height, ch: 4 });

// ---- 1. the encodings -----------------------------------------------------------------------
{
  const encs = { A: [enc.cover, enc.cover, enc.base, enc.thick], B: [enc.cover, enc.cover, enc.rain, enc.wet], C: [enc.fogTop, enc.country] };
  let bad = [], mono = [];
  for (const m of Object.keys(MAPS)) CHANNELS[m].forEach((name, c) => {
    let last = -Infinity;
    for (let b = 0; b < 256; b++) {
      const v = DECODERS[m][c](b / 255);
      if (encs[m][c](v) !== b) bad.push(`${m}.${name} ${b} -> ${v} -> ${encs[m][c](v)}`);
      if (!(v > last)) mono.push(`${m}.${name} at ${b}`);
      last = v;
    }
  });
  check(bad.length === 0, `every byte of every channel decodes and encodes back to itself${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}`);
  check(mono.length === 0, `every decoder grows with its byte${mono.length ? ': not ' + mono.slice(0, 4).join(', ') : ''}`);
  check(enc.rain(0) === 0 && enc.base(-50) === 0 && enc.base(1e9) === 255 && byte(NaN) === 0 && Math.abs(dec.rain(enc.rain(5) / 255) - 5) < 0.06, 'the ends: no rain is byte 0, out of range clamps, NaN is 0, 5 mm/h within 0.06');
}

// ---- 2. the GLSL, read back from its string -------------------------------------------------
{
  let glsl = FIELD_GLSL;
  const brk = opt('break', '');
  if (brk === 'glsl') glsl = glsl.replace('return a.b * WX_BASE_M', 'return a.a * WX_BASE_M');
  if (brk === 'const') glsl = glsl.replace(/const float WX_RAIN_N = [^;]+;/, 'const float WX_RAIN_N = 4.2;');
  if (brk === 'uv') glsl = glsl.replace('atan(d.y, d.x)', 'atan(d.x, d.y)');
  if (brk) console.log(`     (--break ${brk}: a fault put into the GLSL as read; check 2 must fail)`);
  // the constants
  const consts = {};
  for (const m of glsl.matchAll(/const float (\w+) = ([-+0-9.eE]+);/g)) consts[m[1]] = +m[2];
  const want = { WX_INV_2PI: 1 / (2 * Math.PI), WX_INV_PI: 1 / Math.PI, WX_BASE_M: 255 * ENC.BASE_STEP, WX_THICK_M: 255 * ENC.THICK_STEP, WX_RAIN_N: 255 / ENC.RAIN_K, WX_FOG_M: 255 * ENC.FOG_STEP, WX_COUNTRY_M: 255 * ENC.COUNTRY_STEP };
  const off = Object.keys(want).filter((k) => !(Math.abs(consts[k] - want[k]) <= 1e-12 * Math.abs(want[k])));
  check(off.length === 0, `the GLSL's ${Object.keys(consts).length} constants are the JS's${off.length ? ': not ' + off.map((k) => `${k} ${consts[k]} (${want[k]})`).join(', ') : ''}`);
  // the functions, one a line: type name(args) { return expression; }
  const S = Object.assign(Object.create(null), consts, {
    Math,
    __vec: (...a) => a,
    __exp2: (x) => Math.pow(2, x),
    __clamp: (x, a, b) => Math.min(Math.max(x, a), b),
    __mix: (a, b, f) => (Array.isArray(a) ? a.map((x, k) => x * (1 - f) + b[k] * f) : a * (1 - f) + b * f),
    __tex: (map, uv) => gpuTexture(map, uv),
  });
  const SW = { r: 0, g: 1, b: 2, a: 3, x: 0, y: 1, z: 2, w: 3 };
  const toJS = (e) => e
    .replace(/\.([rgbaxyzw])\b/g, (_, c) => `[${SW[c]}]`)
    .replace(/\bvec[234]\(/g, '__vec(').replace(/\batan\(/g, 'Math.atan2(').replace(/\bacos\(/g, 'Math.acos(')
    .replace(/\bexp2\(/g, '__exp2(').replace(/\bclamp\(/g, '__clamp(').replace(/\bmix\(/g, '__mix(').replace(/\btextureLod\(/g, '__tex(');
  const fns = {};
  let lines = 0;
  for (const m of glsl.matchAll(/^(float|vec2|vec3|vec4)\s+(\w+)\(([^)]*)\)\s*\{\s*return\s+(.+);\s*\}\s*$/gm)) {
    const params = m[3].split(',').map((p) => p.trim().split(/\s+/).pop());
    // (sloppy-mode Function, so `with` gives the expression the GLSL's names)
    const f = new Function('S', ...params, `with (S) { return (${toJS(m[4])}); }`);
    fns[m[2]] = f; S[m[2]] = (...a) => f(S, ...a); lines++;
  }
  const missing = [...Object.values(GLSL_DECODERS).flat(), 'wxUV', 'wxRead', 'wxBlend'].filter((n) => !fns[n]);
  check(missing.length === 0 && lines >= 13, `${lines} GLSL functions read back from the string${missing.length ? '; missing ' + missing.join(', ') : ''}`);
  // every byte of every channel through the GLSL decoder and the JS one
  let worst = 0, where = '';
  try {
    for (const m of Object.keys(MAPS)) GLSL_DECODERS[m].forEach((name, c) => {
      for (let b = 0; b < 256; b++) {
        const v = [rnd(), rnd(), rnd(), rnd()]; v[c] = b / 255;
        const g = S[name](v), j = DECODERS[m][c](b / 255), e = Math.abs(g - j) / Math.max(1, Math.abs(j));
        if (!(e <= worst)) { worst = e; where = `${name} at byte ${b}: GLSL ${g}, JS ${j}`; }
      }
    });
  } catch (e) { worst = Infinity; where = String(e); }
  check(worst < 1e-9, `every byte of every channel: the GLSL decoders give what the JS ones give (worst ${worst.toExponential(1)}${worst >= 1e-9 ? ': ' + where : ''})`);
  // places: wxUV against uvOfDir and uvOfLatLon; wxRead + the decoders against fieldAt, on random maps
  let uvWorst = 0, readWorst = 0, why = '';
  const w = 64, h = 32, mk = (n) => Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));
  const snap = { width: w, height: h, cWidth: w / 2, cHeight: h / 2, A: mk(w * h * 4), B: mk(w * h * 4), C: mk(w * h / 2) };
  try {
    for (let n = 0; n < 2000; n++) {
      const d = n < 8 ? [[1, 0, 0], [-1, 1e-17, 0], [-1, -1e-17, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [Math.SQRT1_2, 0, Math.SQRT1_2]][n] : randDir();
      const g = S.wxUV(d), j = uvOfDir(d[0], d[1], d[2]), ll = latLonOf(d), k = uvOfLatLon(ll.lat, ll.lon);
      const du = (x, y) => { const e = Math.abs(x - y) % 1; return Math.min(e, 1 - e); };
      uvWorst = Math.max(uvWorst, du(g[0], j[0]), Math.abs(g[1] - j[1]), du(g[0], k[0]), Math.abs(g[1] - k[1]));
      const F = fieldAt(snap, null, 0, j[0], j[1]);
      const a = S.wxRead(mapOf(snap, 'A'), d), b = S.wxRead(mapOf(snap, 'B'), d), c = S.wxRead(mapOf(snap, 'C'), d);
      const pairs = [[S.wxHeap(a), F.heap, 1], [S.wxSheet(a), F.sheet, 1], [S.wxBase(a), F.base, consts.WX_BASE_M], [S.wxThick(a), F.thick, consts.WX_THICK_M],
        [S.wxMid(b), F.mid, 1], [S.wxHigh(b), F.high, 1], [S.wxRain(b), F.rain, 18], [S.wxWet(b), F.wet, 1], [S.wxFogTop(c), F.fogTop, consts.WX_FOG_M], [S.wxCountry(c), F.country, consts.WX_COUNTRY_M]];
      for (const [x, y, sc] of pairs) { const e = Math.abs(x - y) / sc; if (!(e <= readWorst)) { readWorst = e; why = `${x} against ${y} at ${d.map((q) => q.toFixed(3))}`; } }
    }
  } catch (e) { uvWorst = readWorst = Infinity; why = String(e); }
  check(uvWorst < 1e-12, `2 000 directions: wxUV is uvOfDir and uvOfLatLon (worst ${uvWorst.toExponential(1)} of a turn)`);
  check(readWorst < 1e-9, `2 000 directions on random maps: wxRead and the GLSL decoders give what fieldAt gives (worst ${readWorst.toExponential(1)} of full scale${readWorst >= 1e-9 ? ': ' + why : ''})`);
  // the 'now' blend: wxBlend written to a byte is blendByte
  let blendBad = 0;
  try {
    for (let n = 0; n < 20000; n++) {
      const b0 = Math.floor(rnd() * 256), b1 = Math.floor(rnd() * 256), f = n < 4 ? [0, 1, 0.5, 0.25][n] : rnd();
      const g = Math.round(S.wxBlend([b0 / 255, 0, 0, 0], [b1 / 255, 0, 0, 0], f)[0] * 255);
      if (g !== blendByte(b0, b1, f)) blendBad++;
    }
  } catch (e) { blendBad = Infinity; }
  check(blendBad === 0, `20 000 texels: wxBlend written to a byte is blendByte (${blendBad} differ)`);
  // names and characters
  const reserved = ['patch', 'sample', 'filter', 'input', 'output', 'common', 'active', 'partition', 'half'];
  const code = glsl.replace(/\/\/.*$/gm, ''), used = new Set(code.match(/[A-Za-z_]\w*/g));
  const res = reserved.filter((r) => used.has(r));
  check(res.length === 0 && !glsl.includes('`') && (code.match(/\{/g) || []).length === (code.match(/\}/g) || []).length,
    `the GLSL uses no reserved word as a name${res.length ? ' (it does: ' + res.join(', ') + ')' : ''}, no backtick, balanced braces`);
}

// ---- 3. the CPU reader against the emulated GPU, two snapshots blended ----------------------
{
  const w = 32, h = 16, mk = (n) => Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));
  const s0 = { width: w, height: h, cWidth: 16, cHeight: 8, A: mk(w * h * 4), B: mk(w * h * 4), C: mk(16 * 8 * 2) };
  const s1 = { ...s0, A: mk(w * h * 4), B: mk(w * h * 4), C: mk(16 * 8 * 2) };
  let worst = 0;
  for (let n = 0; n < 1500; n++) {
    const f = n < 3 ? [0, 1, 0.5][n] : rnd(), d = randDir(), uv = uvOfDir(d[0], d[1], d[2]);
    const F = fieldAt(s0, s1, f, uv[0], uv[1]);
    const a = gpuTexture(gpuBlend(mapOf(s0, 'A'), mapOf(s1, 'A'), f), uv), b = gpuTexture(gpuBlend(mapOf(s0, 'B'), mapOf(s1, 'B'), f), uv), c = gpuTexture(gpuBlend(mapOf(s0, 'C'), mapOf(s1, 'C'), f), uv);
    const ref = [a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3], c[0], c[1]];
    const got = [F.heap, F.sheet, F.base / (255 * ENC.BASE_STEP), F.thick / (255 * ENC.THICK_STEP), F.mid, F.high, ENC.RAIN_K * Math.log2(1 + F.rain) / 255, F.wet, F.fogTop / (255 * ENC.FOG_STEP), F.country / (255 * ENC.COUNTRY_STEP)];
    for (let k = 0; k < 10; k++) worst = Math.max(worst, Math.abs(ref[k] - got[k]));
  }
  check(worst < 1e-9, `1 500 places between two random snapshots: fieldAt is the GPU's filter of the blended bytes (worst ${worst.toExponential(1)})`);
}

// ---- the stubs ------------------------------------------------------------------------------
const LAND = land();
const stubs = Object.fromEntries(STUB_PRESETS.map((p) => [p, createSkyStub({ world, preset: p, land: LAND })]));
const O = world.scene.start, OD = dirOf(O.lat, O.lon);
const T = 6.25 * 3600 + 37;                  // a time between two snapshots (14:15 at the opening place)

// ---- 4. determinism -------------------------------------------------------------------------
{
  const times = [];
  for (const p of STUB_PRESETS) {
    const t0 = performance.now(), a = stubs[p].snapshot(T); times.push(`${p} ${(performance.now() - t0).toFixed(0)} ms`);
    let ok = true; try { checkSnapshot(a); } catch (e) { ok = false; console.log('     ' + e.message); }
    check(ok && a.width === fieldLayout(world).width, `'${p}': snapshot(t) is a snapshot of the format (${a.width} x ${a.height}, ${a.cells.length / CELL.STRIDE} cells, ${a.lenses.length / 10} lenses)`);
    const b = stubs[p].snapshot(T), c = createSkyStub({ world, preset: p, land: LAND }).snapshot(T);
    const ha = hashOf(a), same = ha === hashOf(b) && ha === hashOf(c);
    let child = '';
    try { child = execFileSync(process.execPath, [here, '--child', p, String(T)], { encoding: 'utf8' }); } catch (e) { child = 'error: ' + e.message; }
    check(same && child === ha, `'${p}': snapshot(t) is byte-identical across two calls, two stubs and two processes (${ha.slice(0, 10)}${child === ha ? '' : ', the other process ' + child.slice(0, 40)})`);
  }
  console.log(`     (one snapshot: ${times.join(', ')})`);
}

// ---- 5. at() is the bytes ----------------------------------------------------------------------
{
  const places = [];
  for (let n = 0; n < 150; n++) { const d = randDir(), ll = latLonOf(d); places.push(ll); }
  for (let n = 0; n < 60; n++) places.push(offset(O.lat, O.lon, 360 * rnd(), 60000 * rnd()));
  for (const c of stubs.storm.cells(T)) for (let n = 0; n < 4; n++) places.push(offset(c.lat, c.lon, 90 * n, 3000 * n));
  for (const p of STUB_PRESETS) {
    const st = stubs[p], tk = Math.floor(T / SNAP_STEP) * SNAP_STEP, f = (T - tk) / SNAP_STEP;
    const s0 = st.snapshot(tk), s1 = st.snapshot(tk + SNAP_STEP);
    const now = Object.fromEntries(Object.keys(MAPS).map((k) => [k, gpuBlend(mapOf(s0, k), mapOf(s1, k), f)]));
    let worst = 0, what = '', above = 0, wrongRain = 0;
    for (const pl of places) {
      const r = st.at(pl, T), uv = uvOfLatLon(pl.lat, pl.lon);
      const a = gpuTexture(now.A, uv), b = gpuTexture(now.B, uv), c = gpuTexture(now.C, uv), F = r.field;
      const pairs = [['heap', a[0], F.heap], ['sheet', a[1], F.sheet], ['base', a[2], F.base / (255 * ENC.BASE_STEP)], ['thick', a[3], F.thick / (255 * ENC.THICK_STEP)],
        ['mid', b[0], F.mid], ['high', b[1], F.high], ['rain', b[2], ENC.RAIN_K * Math.log2(1 + F.rain) / 255], ['wet', b[3], F.wet],
        ['fog top', c[0], F.fogTop / (255 * ENC.FOG_STEP)], ['country', c[1], F.country / (255 * ENC.COUNTRY_STEP)]];
      for (const [n, x, y] of pairs) { const e = Math.abs(x - y); if (!(e <= worst)) { worst = e; what = `${n} at ${pl.lat.toFixed(2)}, ${pl.lon.toFixed(2)}: ${x.toFixed(5)} against ${y.toFixed(5)}`; } }
      // above the base nothing falls; below it, away from cells, the field's rain falls
      const up = st.at({ ...pl, h: r.base + 50 }, T), down = st.at({ ...pl, h: r.base - 300 }, T);
      if (up.rain + up.snow > 0) above++;
      if (down.cell < 0 && Math.abs(down.rain + down.snow - F.rain) > 1e-9) wrongRain++;
    }
    check(worst <= 1 / 255 + 1e-12, `'${p}', ${places.length} places between two snapshots: at() is a bilinear decode of the bytes within 1/255 (worst ${(worst * 255).toFixed(3)}/255${worst > 1 / 255 ? ': ' + what : ''})`);
    check(above === 0 && wrongRain === 0, `'${p}': no rain 50 m over the base (${above} places do), the field's rain below it away from cells (${wrongRain} places differ)`);
  }
}

// ---- 6. no traveller input ---------------------------------------------------------------------
{
  const deep = (x) => JSON.stringify(x);
  for (const p of ['storm', 'front', 'fog']) {
    const st = createSkyStub({ world, preset: p, land: LAND }), P0 = { lat: O.lat + 0.03, lon: O.lon - 0.05, h: 1800 };
    const before = { snap: hashOf(st.snapshot(T)), at: deep(st.at(P0, T)), cells: deep(st.cells(T)), strikes: deep(st.strikes(T, T + 60)) };
    for (let n = 0; n < 200; n++) { const d = randDir(), ll = latLonOf(d); st.at({ ...ll, h: 3000 * rnd() }, T + ((n % 5) - 2) * 3600 * rnd()); st.at(d.map((x) => x * (R + 2000)), T); }
    const after = { snap: hashOf(st.snapshot(T)), at: deep(st.at(P0, T)), cells: deep(st.cells(T)), strikes: deep(st.strikes(T, T + 60)) };
    const fresh = createSkyStub({ world, preset: p, land: LAND }), other = deep(fresh.at(P0, T));
    const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
    check(changed.length === 0 && other === before.at, `'${p}': at() asked at 200 other places and times changes nothing${changed.length ? ' (it changed: ' + changed.join(', ') + ')' : ''}${other === before.at ? '' : ', and a fresh stub answers differently'}`);
  }
}

// ---- 7. strikes ----------------------------------------------------------------------------------
{
  const st = stubs.storm, t0 = 13 * 3600, t1 = t0 + 1800;
  const key = (list) => list.map((s) => `${s.t.toFixed(9)}|${s.cell}|${s.ground}|${s.x.toFixed(12)}|${s.h0.toFixed(6)}|${s.h1.toFixed(6)}|${s.power}`).join('\n');
  const whole = st.strikes(t0, t1);
  let splits = true;
  for (const cut of [t0 + 0.35, t0 + 700, t0 + 700.0000001, t0 + 1234.5678]) if (key([...st.strikes(t0, cut), ...st.strikes(cut, t1)]) !== key(whole)) splits = false;
  const thirds = []; for (let k = 0; k < 30; k++) thirds.push(...st.strikes(t0 + k * 60, t0 + (k + 1) * 60));
  check(whole.length > 50 && splits && key(thirds) === key(whole), `30 min of strikes (${whole.length}) are the union of the parts at four splits and in 30 one-minute windows`);
  const other = createSkyStub({ world, preset: 'storm', land: LAND }).strikes(t0, t1);
  check(key(other) === key(whole) && whole.every((s, k) => k === 0 || s.t >= whole[k - 1].t), 'the strikes of two stubs are identical, in time order');
  const day = st.strikes(0, 6 * 3600), share = day.filter((s) => s.ground).length / day.length;
  check(share > 0.28 && share < 0.38 && day.every((s) => s.power >= 0.6 && s.power <= 1.4 && (!s.ground || s.h1 > s.h0)), `${(share * 100).toFixed(1)} % of ${day.length} flashes in 6 h reach the ground (30-35 % asked), power 0.6-1.4, strokes from above to below`);
  check(stubs.fair.strikes(0, 6 * 3600).length === 0 && stubs.front.strikes(0, 6 * 3600).length === 0, "no flash on the 'fair' or 'front' day");
}

// ---- 8. cells ------------------------------------------------------------------------------------
{
  const st = stubs.storm; let most = 0, dup = 0, worstMove = 0, mv = '';
  const places = [OD]; for (let n = 0; n < 40; n++) { const q = offset(O.lat, O.lon, 9 * n, 15000 * (n % 8)); places.push(dirOf(q.lat, q.lon)); }
  for (let m = 0; m < 24 * 60; m += 10) {
    const t = m * 60, cs = st.cells(t), ids = new Set(cs.map((c) => c.id));
    if (ids.size !== cs.length) dup++;
    for (const p of places) most = Math.max(most, cs.filter((c) => distM(p, [c.x, c.y, c.z]) < 200000).length);
    // a frame later no further than the steering speed allows; a minute later exactly where the
    // cells' steering motion carries it: M_cell(t + 60) . M_cell(t)^-1 . where it was
    const cs2 = st.cells(t + 1 / 30), cs3 = st.cells(t + 60), m0 = st.motion('cell', t), m1 = st.motion('cell', t + 60);
    for (const c of cs) {
      const c2 = cs2.find((x) => x.id === c.id), c3 = cs3.find((x) => x.id === c.id);
      if (c2) { const d = distM([c.x, c.y, c.z], [c2.x, c2.y, c2.z]), allow = STUB_SPEED.cell / 30 + 1; if (d - allow > worstMove) { worstMove = d - allow; mv = `cell ${c.id} moved ${d.toFixed(3)} m in a frame`; } }
      if (c3) {
        const q = [0, 1, 2].map((k) => m0[k] * c.x + m0[3 + k] * c.y + m0[6 + k] * c.z), p = [0, 1, 2].map((k) => m1[3 * k] * q[0] + m1[3 * k + 1] * q[1] + m1[3 * k + 2] * q[2]);
        const e = distM(p, [c3.x, c3.y, c3.z]); if (e - 0.01 > worstMove) { worstMove = e - 0.01; mv = `cell ${c.id} is ${e.toFixed(2)} m from where the steering carries it in a minute`; }
      }
    }
  }
  check(most <= 8 && most >= 3, `at most 8 cells within 200 km of any of ${places.length} places over a day (${most})`);
  check(worstMove <= 0 && dup === 0, `a cell moves with the cells' steering (in a frame no further than its speed allows, in a minute where the motion carries it)${mv ? ': ' + mv : ''}; no two live cells share an id`);
  const still = createSkyStub({ world, preset: 'storm', land: LAND, stormAt: { lat: O.lat + 0.05, lon: O.lon + 0.07 } });
  const sc = [0, 5000, 50000].map((t) => still.cells(t).find((c) => c.id === 999999));
  check(sc.every((c) => c && c.phase === 1 && c.x === sc[0].x), 'stormAt: a mature cell that stands still, at any time');
  // a motion put in (as steer.js's will be): each layer turning about an axis 40 degrees off the
  // spin axis. The cells go where it carries them, and the patterns move with it.
  const ax = [Math.sin(40 * D2R), 0, Math.cos(40 * D2R)], rate = { low: 6 / R, mid: 14 / R, high: 30 / R, cell: 10 / R, still: 0 };
  const tilted = (layer, t, o = new Float64Array(9)) => {
    const a = rate[layer] * t, c = Math.cos(a), s = Math.sin(a), [x, y, z] = ax, k = 1 - c;
    o.set([c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k]); return o;
  };
  const ts = createSkyStub({ world, preset: 'storm', land: LAND, motion: tilted });
  let off = 0, n = 0;
  for (const t of [3600, 7200, 30000]) {
    const m0 = tilted('cell', t), m1 = tilted('cell', t + 600), a = ts.cells(t), b = ts.cells(t + 600);
    for (const c of a) {
      const c2 = b.find((x) => x.id === c.id); if (!c2) continue;
      const q = [0, 1, 2].map((k) => m0[k] * c.x + m0[3 + k] * c.y + m0[6 + k] * c.z), p = [0, 1, 2].map((k) => m1[3 * k] * q[0] + m1[3 * k + 1] * q[1] + m1[3 * k + 2] * q[2]);
      off = Math.max(off, distM(p, [c2.x, c2.y, c2.z])); n++;
    }
  }
  const same = hashOf(ts.snapshot(T)) === hashOf(stubs.storm.snapshot(T));
  check(n > 5 && off < 0.01 && !same, `a motion put in: ${n} cells 10 min on are where it carries them (worst ${off.toFixed(4)} m), and the field moves with it`);
}

// ---- 9. the presets ------------------------------------------------------------------------------
{
  // fair: dry, no fog, heaps 2x as many over high ground (on land, over the whole world)
  const f = stubs.fair.snapshot(T), lay = fieldLayout(world);
  let rain = 0, wet = 0, fog = 0, hi = 0, nhi = 0, lo = 0, nlo = 0;
  for (let k = 0; k < lay.width * lay.height; k++) { rain += f.B[k * 4 + 2]; wet += f.B[k * 4 + 3]; }
  for (let k = 0; k < lay.cWidth * lay.cHeight; k++) fog += f.C[k * 2];
  for (let j = 0; j < lay.height; j++) for (let i = 0; i < lay.width; i++) {
    const c = f.C[((j >> 1) * lay.cWidth + (i >> 1)) * 2 + 1] * ENC.COUNTRY_STEP, hp = f.A[(j * lay.width + i) * 4];
    if (c > 1800) { hi += hp; nhi++; } else if (c > 50 && c < 500) { lo += hp; nlo++; }
  }
  check(rain === 0 && wet === 0 && fog === 0 && f.lenses.length > 0, `'fair': no rain, no wet ground, no fog anywhere; ${f.lenses.length / 10} lenses`);
  check(hi / nhi >= 2 * (lo / nlo), `'fair': heaps over country above 1 800 m ${(hi / nhi / 255).toFixed(3)}, below 500 m ${(lo / nlo / 255).toFixed(3)} (2x or more)`);
  // fog: in basins; the opening place stands 300 m or more above every fog top within 2 km, at every hour
  const ground = (() => { const d = LAND.data, W = 4096, H = 2048, x = O.lon / 360 * W - 0.5, y = (90 - O.lat) / 180 * H - 0.5, i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j; const g = (ii, jj) => d[jj * W + ((ii % W) + W) % W]; return (g(i, j) * (1 - a) + g(i + 1, j) * a) * (1 - b) + (g(i, j + 1) * (1 - a) + g(i + 1, j + 1) * a) * b; })();
  let topMax = 0, foggy = 0;
  for (let hr = 0; hr < 24; hr += 3) for (let n = 0; n < 48; n++) { const q = n ? offset(O.lat, O.lon, 360 * n / 47, 2000 * ((n % 4) + 1) / 4) : O; topMax = Math.max(topMax, stubs.fog.at(q, hr * 3600 + 17).field.fogTop); }
  const fs = stubs.fog.snapshot(T); for (let k = 0; k < lay.cWidth * lay.cHeight; k++) if (fs.C[k * 2] * ENC.FOG_STEP > fs.C[k * 2 + 1] * ENC.COUNTRY_STEP - 400 && fs.C[k * 2] > 0) foggy++;
  check(foggy > 200, `'fog': fog in ${foggy} cells of the small map`);
  check(ground - topMax >= 300, `'fog': the opening place (${ground.toFixed(0)} m) stands ${(ground - topMax).toFixed(0)} m above every fog top within 2 km at every 3 h (300 m or more)`);
  // storm: a mature cell within 40 km of the opening place every 10 minutes of a day, raining under its core
  let gaps = [], dry = 0;
  for (let m = 0; m < 24 * 60; m += 10) {
    const cs = stubs.storm.cells(m * 60).filter((c) => c.phase === 1 && distM(OD, [c.x, c.y, c.z]) < 40000);
    if (!cs.length) gaps.push(`${(m / 60).toFixed(2)} h`);
    for (const c of cs) { const r = stubs.storm.at({ lat: c.lat, lon: c.lon }, m * 60); if (!(r.rain + r.snow > 10 && r.storm > 0.9 && r.cell === c.id && r.top > 6000)) dry++; }
  }
  check(gaps.length === 0, `'storm': a mature cell within 40 km of the opening place at every 10 minutes of a day${gaps.length ? ': not at ' + gaps.slice(0, 6).join(', ') : ''}`);
  check(dry === 0, `'storm': under a mature cell's middle: rain over 10 mm/h, dark, its tower overhead (${dry} not)`);
  // the gust front: 3 km out from a mature cell's rain the ground wind blows outward (the mean
  // of eight places round it, so that the day's wind cancels)
  let weakest = Infinity, weakestMax = Infinity;
  for (let m = 0; m < 24 * 60; m += 30) for (const c of stubs.storm.cells(m * 60).filter((x) => x.phase === 1 && x.rain > 5)) {
    let out = 0, most = -Infinity;
    for (let b = 0; b < 360; b += 45) { const q = offset(c.lat, c.lon, b, c.core + 3000), r = stubs.storm.at(q, m * 60), o = r.windE * Math.sin(b * D2R) + r.windN * Math.cos(b * D2R); out += o / 8; most = Math.max(most, o); }
    weakest = Math.min(weakest, out); weakestMax = Math.min(weakestMax, most);
  }
  check(weakest >= 3 && weakestMax >= 6, `'storm': 3 km beyond a mature cell's rain the wind blows outward: ${weakest.toFixed(1)} m/s or more on average round it (3 asked), ${weakestMax.toFixed(1)} or more on its windiest side (6 asked)`);
  // front: cirrus 2 h ahead, rain at 6 h, wet 4 h after
  const a4 = stubs.front.at(O, 4 * 3600), a6 = stubs.front.at(O, 6 * 3600), a10 = stubs.front.at(O, 10 * 3600);
  check(a4.field.high > 0.3 && a4.rain === 0 && a6.rain + a6.snow > 1 && a6.field.sheet > 0.5 && a10.rain === 0 && a10.wet > 0.2,
    `'front' at the opening place: high cover ${a4.field.high.toFixed(2)} and no rain 2 h ahead, ${(a6.rain + a6.snow).toFixed(1)} mm/h under a deck of ${a6.field.sheet.toFixed(2)} at 6 h, dry with wet ground ${a10.wet.toFixed(2)} 4 h after`);
}

// ---- 10. the sky's code: no three, no DOM, no Math.random -------------------------------------
{
  const dir = new URL('../src/weather/sky/', import.meta.url), bad = [];
  const files = readdirSync(dir).filter((n) => n.endsWith('.js'));
  for (const n of files) {
    const s = readFileSync(new URL(n, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (/from\s+['"]three['"]|import\(\s*['"]three['"]/.test(s)) bad.push(`${n} imports three`);
    if (/\b(document|window|navigator|localStorage|requestAnimationFrame)\b/.test(s)) bad.push(`${n} touches the DOM`);
    if (/Math\.random/.test(s)) bad.push(`${n} calls Math.random`);
    for (const m of s.matchAll(/from\s+['"]([^'"]+)['"]/g)) if (!m[1].startsWith('.')) bad.push(`${n} imports the package ${m[1]}`);
  }
  check(files.length >= 2 && bad.length === 0, `src/weather/sky (${files.join(', ')}): no three, no DOM, no Math.random, no package${bad.length ? ': ' + bad.join('; ') : ''}`);
}

console.log(failed ? '\nthe sky format: FAILED' : '\nthe sky format: every check passed');
process.exit(failed ? 1 : 0);
