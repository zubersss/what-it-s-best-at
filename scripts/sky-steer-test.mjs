// The steering winds of the cloud layers (src/weather/sky/steer.js), without a browser: what
// numbers can prove of them. Fails (exit 1) when a promise is broken.   (about 20 s)
//   node scripts/sky-steer-test.mjs
//   node scripts/sky-steer-test.mjs --today    the cloud drift as it was (CloudVolume.render, before
//                                              the steering) put to check 12 in its place: it fails
// 1. Pure: steer.js and what it imports use no three, no DOM and no Math.random; nothing under
//    src/weather/sky/ does.
// 2. The same numbers whatever was asked before, and in another process.
// 3. The closed form against a frame-by-frame sum at 30 frames a second: a few cm over an hour,
//    for every layer, across the knots (midpoint steps; Euler steps, as the game takes them, for
//    the low layer); speed x clock, the old mistake, is kilometres off.
// 4. Each layer's wind is the velocity of its motion (the closed form, differentiated).
// 5. No wind has a vertical part.
// 6. At the opening place over 20 days, for several seeds: the speeds in the plan's ranges (low
//    0..max, mid k|low| + add, high, cells between), the slow turnings' share, the high layer's
//    axis within `veer` of the low's.
// 7. The days: westerly on about 85 % of them, the rate continuous through every knot.
// 8. Days a world file pins hold exactly, and change nothing outside their own hours; a plain
//    westerly every day (Earth's form) is just that, on Earth's radius.
// 9. The cells move with the mean of the low and mid layers.
// 10. The GLSL (STEER_GLSL, run by scripts/lib/glslRun.mjs with the arrays Steer.uniforms()
//    fills, as WebGL takes them) gives what the JS gives, to centimetres, from 1950 to 2099;
//    and the check would catch matrices sent the wrong way round.
// 11. The rise: its exact integral; its two phases blend without a jump (one phase alone jumps).
// 12. The pattern moves with the wind (cloudwf/drift.mjs ported): the real cloud noise, read
//    through the shader's own text a few seconds apart, is matched to find where its clouds went;
//    they must go where the low wind carries them (within 10 degrees and 20 %) and rise at the
//    rise. The cloud drift as it was goes against the wind at 4 to 6 times its speed and boils up
//    at 28 m/s: the same check must fail on it, or the check is worth nothing.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Steer, STEER_GLSL, STEER_LAYERS, STEER_HEIGHT, makeSteerUniforms, mulM, mulMT, motionOf } from '../src/weather/sky/steer.js';
import { runGlsl } from './lib/glslRun.mjs';
import { cloudNoiseData } from '../src/sky/cloudNoiseData.js';
import haven from '../src/worlds/haven.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = process.argv.includes('--today');
let failed = false;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) failed = true; };
const note = (text) => console.log(`     ${text}`);

const R = haven.radius, D2R = Math.PI / 180;
// Haven's weather block when it has one; until then the plan's numbers (the world's day begins at
// 09 h UTC: midnight at the opening place, where the scene's 17 h UTC is 08 h)
const WX = { seed: 1, epoch: '2024-09-01T00:00:00Z', dayStart: 9, ...(haven.weather || {}) };
const START = haven.scene.start, SCENE_MS = Date.parse(haven.scene.dateUTC);
const steer = new Steer(WX, R);
const T_SCENE = steer.t(SCENE_MS);
const LAYERS = STEER_LAYERS;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const at = (lat, lon, h = 0) => { const la = lat * D2R, lo = lon * D2R, r = R + h; return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)]; };
const enu = (lat, lon) => {
  const la = lat * D2R, lo = lon * D2R;
  return { e: [-Math.sin(lo), Math.cos(lo), 0], n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], u: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)] };
};
// a fixed spread of places and times (no Math.random here either)
let seedState = 12345;
const rnd = () => { seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0; return seedState / 4294967296; };
const places = Array.from({ length: 60 }, () => [Math.asin(2 * rnd() - 1) / D2R, 360 * rnd()]);
const times = [T_SCENE, ...Array.from({ length: 12 }, () => T_SCENE + (rnd() - 0.3) * 400 * 86400)];
const quart = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))]; };

{ // 1
  const bad = [], seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return; seen.add(file);
    const text = fs.readFileSync(file, 'utf8'), code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const m of code.matchAll(/(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g)) {
      if (!m[1].startsWith('.')) bad.push(`${path.relative(root, file)} imports ${m[1]}`);
      else visit(path.resolve(path.dirname(file), m[1]));
    }
    if (/\bMath\.random\b/.test(code)) bad.push(`${path.relative(root, file)} uses Math.random`);
    // (the worker, skyWorker.js, has its own two words of a worker's API: those, and nothing else)
    const own = path.basename(file) === 'skyWorker.js' ? code.replace(/\bself\.(onmessage|postMessage)\b/g, '') : code;
    if (/\b(document|window|navigator|self|globalThis)\.|\b(localStorage|requestAnimationFrame|performance\.now)\b/.test(own)) bad.push(`${path.relative(root, file)} uses the DOM`);
  };
  const dir = path.join(root, 'src/weather/sky');
  for (const f of fs.readdirSync(dir).filter((x) => /\.m?js$/.test(x))) visit(path.join(dir, f));
  check(bad.length === 0, `src/weather/sky/ (${[...seen].map((f) => path.relative(root, f)).join(', ')}): no three, no DOM, no Math.random${bad.length ? ': ' + bad.join('; ') : ''}`);
}

{ // 2
  const ts = [T_SCENE, steer.t(Date.parse('2099-12-30T05:00:00Z')), steer.t(Date.parse('1950-01-03T11:00:00Z')), T_SCENE + 1234.5, -77777.25];
  const values = (s, order) => { const out = {}; for (const i of order) for (const L of LAYERS) out[`${i} ${L}`] = Array.from(s.motion(L, ts[i])).concat(s.omega(L, ts[i]), [s.rise(ts[i])]); return out; };
  const a = values(new Steer(WX, R), [0, 1, 2, 3, 4]), b = values(new Steer(WX, R), [4, 2, 3, 1, 0]);
  let same = true; for (const k of Object.keys(a)) a[k].forEach((x, j) => { if (!Object.is(x, b[k][j])) same = false; });
  check(same, 'the same matrices and winds, bit for bit, whatever was asked first (1950 and 2099 among the times)');
  const code = `import { Steer, STEER_LAYERS } from ${JSON.stringify(pathToFileURL(path.join(root, 'src/weather/sky/steer.js')).href)};
    const s = new Steer(${JSON.stringify(WX)}, ${R}), ts = ${JSON.stringify(ts)}, out = {};
    for (const i of [3, 0, 4, 1, 2]) for (const L of STEER_LAYERS) out[i + ' ' + L] = Array.from(s.motion(L, ts[i])).concat(s.omega(L, ts[i]), [s.rise(ts[i])]);
    process.stdout.write(JSON.stringify(out, Object.keys(out).sort()));`;
  const other = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  const mine = JSON.stringify(a, Object.keys(a).sort());
  check(other === mine, 'another process gives the same numbers, bit for bit');
}

{ // 3
  const rows = []; let worstMid = 0, worstEuler = 0, worstOut = 0, wrongMost = 0;
  const p0 = at(START.lat, START.lon);
  // (an hour from the scene's time; an hour across a knot of the low wind; six hours from 06 h UTC)
  const knotT = steer.dayStartT(steer.dayIndex(T_SCENE)) + 6 * 3600 - 1800;
  for (const [t0, hours] of [[T_SCENE, 1], [knotT, 1], [T_SCENE + 2.6 * 86400, 6]]) for (const L of LAYERS) {
    const k = LAYERS.indexOf(L), p = p0.map((x) => x * (R + STEER_HEIGHT[k]) / R);
    const n = Math.round(hours * 3600 * 30), dt = 1 / 30, v = [0, 0, 0], m = [0, 0, 0];
    let pm = p.slice(), pe = p.slice();
    // (and the lesson's wrong way, speed x clock: the rate at the start times the time since)
    const a0 = steer.angles(L, t0), q0 = steer.inverse(L, t0, p);
    const wrongAt = (t) => { const a = steer.angles(L, t); return mulM(motionOf(a.psi, a.phi, a0.theta + a0.rate * (t - t0) - a.psi), q0); };
    for (let i = 0; i < n; i++) {
      const t = t0 + i * dt;
      steer.wind(L, t, pe, v); for (let c = 0; c < 3; c++) pe[c] += v[c] * dt;                    // as the game adds things up
      steer.wind(L, t, pm, v); for (let c = 0; c < 3; c++) m[c] = pm[c] + v[c] * dt / 2;
      steer.wind(L, t + dt / 2, m, v); for (let c = 0; c < 3; c++) pm[c] += v[c] * dt;
    }
    const exact = steer.carry(L, t0, t0 + n * dt, p), dm = len(sub(pm, exact)), d = sub(pe, exact), u = exact.map((x) => x / len(exact));
    // (Euler steps leave the sphere: each goes along the tangent, so a thing summed that way
    // climbs by v^2 dt / 2r a second; along the ground they are as good as the midpoint's)
    const out = dot(d, u), de = len(d.map((x, i) => x - out * u[i]));
    worstMid = Math.max(worstMid, dm); worstOut = Math.max(worstOut, Math.abs(out));
    if (L === 'low' && hours === 1) worstEuler = Math.max(worstEuler, de);
    if (hours > 1) wrongMost = Math.max(wrongMost, len(sub(pm, wrongAt(t0 + n * dt))));
    rows.push(`${L} ${hours} h: ${(len(sub(exact, p)) / 1000).toFixed(1)} km, ${(dm * 100).toFixed(1)} / ${(de * 100).toFixed(1)} cm`);
  }
  note(`closed form against frame by frame, 30 frames a second (travelled; apart with midpoint / Euler steps, along the ground): ${rows.join('; ')}`);
  // (Euler's own error on a sphere grows as v^2 t dt: a few cm an hour for the low layer, as the
  // plan's replay found; the sum the closed form must equal is the converged one, the midpoint's)
  check(worstMid < 0.05, `the closed form is the frame-by-frame sum: at most ${(worstMid * 100).toFixed(1)} cm apart, every layer, over up to six hours (midpoint steps)`);
  check(worstEuler < 0.05, `... and summed by Euler steps, as the game adds things up, the low layer is at most ${(worstEuler * 100).toFixed(1)} cm off along the ground in an hour (Euler's points also climb off the sphere: up to ${(worstOut * 100).toFixed(0)} cm over six hours at the high layer's speed)`);
  check(wrongMost > 1, `... where speed x clock (the rate at the start times the time since) is ${wrongMost.toFixed(0)} m off after six hours: the check can fail`);
}

{ // 4 and 5
  let worst = 0, vert = 0, fastest = 0;
  for (const t of times) for (const [lat, lon] of places.slice(0, 25)) for (const L of LAYERS) {
    const k = LAYERS.indexOf(L), p = at(lat, lon, STEER_HEIGHT[k]), h = 0.5;
    const v = steer.wind(L, t, p), num = sub(steer.carry(L, t, t + h, p), steer.carry(L, t, t - h, p)).map((x) => x / (2 * h));
    worst = Math.max(worst, len(sub(v, num))); vert = Math.max(vert, Math.abs(dot(v, p)) / len(p)); fastest = Math.max(fastest, len(v));
  }
  check(worst < 1e-5, `each layer's wind is its motion's velocity: largest difference ${worst.toExponential(1)} m/s (winds to ${fastest.toFixed(1)} m/s; 300 places and times a layer)`);
  check(vert < 1e-9, `no wind has a vertical part: at most ${vert.toExponential(1)} m/s`);
}

{ // 6
  const c = steer.cfg, lowTop = c.low.max * (1 + STEER_HEIGHT[0] / R), all = [], E = enu(START.lat, START.lon);
  let ok = true, slowMost = 0, axisMost = 0, rateBad = '';
  const heads = [], ratio = [], meds = [];
  for (let seed = 1; seed <= 12; seed++) {
    const s = new Steer({ ...WX, seed }, R), sp = [];
    for (let h = 0; h < 20 * 24; h += 0.5) {
      const t = T_SCENE + h * 3600, w = {};
      for (const L of LAYERS) w[L] = s.windAt(L, t, START.lat, START.lon);
      sp.push(w.low.speed);
      // the slow turnings' share: the wind less the part the rate alone makes
      const k = 0, p = at(START.lat, START.lon, STEER_HEIGHT[k]), om = s.omega('low', t), ax = s.axis('low', t), rate = s.rate('low', t);
      const slow = [om[0] - rate * ax[0], om[1] - rate * ax[1], om[2] - rate * ax[2]];
      const sv = [slow[1] * p[2] - slow[2] * p[1], slow[2] * p[0] - slow[0] * p[2], slow[0] * p[1] - slow[1] * p[0]];
      slowMost = Math.max(slowMost, Math.hypot(dot(sv, E.e), dot(sv, E.n)));
      axisMost = Math.max(axisMost, Math.acos(Math.min(1, dot(s.axis('low', t), s.axis('high', t)))) / D2R);
      const lo = s.speed('low', t), mi = s.speed('mid', t), hi = s.speed('high', t), ce = s.speed('cell', t);
      if (lo < -c.low.easterlyMax - 1e-9 || lo > c.low.max + 1e-9) rateBad ||= `low ${lo.toFixed(2)}`;
      if (mi < c.mid.add - 1e-9 || mi > c.mid.k * c.low.max + c.mid.add + 1e-9) rateBad ||= `mid ${mi.toFixed(2)}`;
      if (hi < c.high.add - 1e-9 || hi > c.high.k * c.low.max + c.high.add + 1e-9) rateBad ||= `high ${hi.toFixed(2)}`;
      if (Math.abs(ce - (lo + mi) / 2) > 1e-9) rateBad ||= `cell ${ce.toFixed(2)}`;
      if (w.low.speed > 6) { let d = Math.abs(w.high.toward - w.low.toward); d = Math.min(d, 360 - d); heads.push(d); ratio.push(w.high.speed / w.low.speed); }
    }
    all.push(...sp); meds.push(quart(sp, 0.5));
    ok &&= Math.min(...sp) >= 0 && Math.max(...sp) <= lowTop + 2.5;
  }
  note(`the low wind at the opening place, 20 days from the scene's, every half hour, 12 seeds: ${quart(all, 0).toFixed(1)}, 10 % ${quart(all, 0.1).toFixed(1)}, median ${quart(all, 0.5).toFixed(1)}, 90 % ${quart(all, 0.9).toFixed(1)}, ${quart(all, 1).toFixed(1)} m/s; each seed's median ${quart(meds, 0).toFixed(1)} to ${quart(meds, 1).toFixed(1)}`);
  check(ok, `it stays within 0..${(lowTop + 2.5).toFixed(1)} m/s (its rate's ${c.low.max} m/s at 1.5 km, and the slow turnings), on every seed`);
  const med = quart(all, 0.5);
  check(med >= 3.5 && med <= 6, `its median is ${med.toFixed(1)} m/s (the plan: 4.6)`);
  check(!rateBad, `the rates on the steering's great circle stay in the plan's ranges: low ${-c.low.easterlyMax}..${c.low.max}, mid ${c.mid.add}..${c.mid.k * c.low.max + c.mid.add}, high ${c.high.add}..${c.high.k * c.low.max + c.high.add}, cells the mean of low and mid${rateBad ? ' (not: ' + rateBad + ')' : ''}`);
  check(slowMost <= 2.5, `the slow turnings of the axis add at most ${slowMost.toFixed(2)} m/s to the low wind there (the plan: about 2)`);
  check(axisMost <= c.high.veer + 1e-6, `the high layer's axis stands at most ${axisMost.toFixed(1)} degrees from the low's (veer ${c.high.veer})`);
  note(`where the low wind passes 6 m/s there: the high wind's heading differs by ${quart(heads, 0.1).toFixed(0)}, ${quart(heads, 0.5).toFixed(0)}, ${quart(heads, 0.9).toFixed(0)} degrees (10 %, median, 90 %), and it is ${quart(ratio, 0.1).toFixed(1)} to ${quart(ratio, 0.9).toFixed(1)} times as fast`);
  check(quart(ratio, 0.05) >= 2.5, `on 95 % of those hours the high wind there is at least 2.5 times the low (where its axis leans away from the place it can be less: least ${quart(ratio, 0).toFixed(2)}); on the great circles it always is (3.4 |low| + 8)`);
  // the knots join: rate continuous, mid and high exactly k |low| + add at every knot
  let jump = 0, knotBad = 0;
  for (let d = steer.dayIndex(T_SCENE); d < steer.dayIndex(T_SCENE) + 60; d++) for (const hk of [6, 18]) {
    const tk = steer.dayStartT(d) + hk * 3600;
    for (const L of LAYERS) jump = Math.max(jump, Math.abs(steer.speed(L, tk + 1e-3) - steer.speed(L, tk - 1e-3)));
    const lo = steer.speed('low', tk);
    knotBad = Math.max(knotBad, Math.abs(steer.speed('mid', tk) - (c.mid.k * Math.abs(lo) + c.mid.add)), Math.abs(steer.speed('high', tk) - (c.high.k * Math.abs(lo) + c.high.add)));
  }
  check(jump < 1e-6 && knotBad < 1e-9, `the rates are continuous through every knot (largest step ${jump.toExponential(1)} m/s) and at each knot mid and high are k |low| + add (off by ${knotBad.toExponential(1)})`);
}

{ // 7
  const d0 = steer.dayIndex(T_SCENE); let east = 0, calm = 0, gale = 0; const n = 3000;
  for (let d = d0; d < d0 + n; d++) { const day = steer.day(d); if (day.easterly) east++; if (Math.abs(day.wind06) < 3) calm++; if (Math.abs(day.wind06) > 10) gale++; }
  check(east / n > 0.11 && east / n < 0.19, `easterly on ${(100 * east / n).toFixed(1)} % of ${n} days (the plan: about 15 %)`);
  note(`the day's low wind on the steering's great circle: under 3 m/s on ${(100 * calm / n).toFixed(0)} % of days, over 10 m/s on ${(100 * gale / n).toFixed(0)} %`);
  let sawTurn = false;
  for (let d = d0; d < d0 + 200 && !sawTurn; d++) {
    if (Math.sign(steer.day(d).wind18) !== Math.sign(steer.day(d + 1).wind06)) {
      const a = steer.dayStartT(d) + 18 * 3600, b = steer.dayStartT(d + 1) + 6 * 3600; let lo = Infinity;
      for (let t = a; t <= b; t += 60) lo = Math.min(lo, Math.abs(steer.speed('low', t)));
      sawTurn = lo < 0.01;
    }
  }
  check(sawTurn, 'a day that turns easterly passes through calm on the way');
}

{ // 8
  const pinned = new Steer({ ...WX, days: { ...(WX.days || {}), '2024-09-24': { wind: 12, veer: -20, humidity: 0.9 }, '2024-09-25': { wind: [-3, -5] } } }, R);
  const plain = new Steer({ ...WX, days: Object.fromEntries(Object.entries(WX.days || {}).filter(([k]) => k !== '2024-09-24' && k !== '2024-09-25')) }, R);
  const d24 = pinned.dayOfDate('2024-09-24'), s24 = pinned.dayStartT(d24), s25 = pinned.dayStartT(d24 + 1);
  let exact = true;
  for (let h = 6; h <= 18; h += 0.25) exact &&= Math.abs(pinned.speed('low', s24 + h * 3600) - 12) < 1e-9;
  exact &&= Math.abs(pinned.speed('low', s25 + 6 * 3600) + 3) < 1e-9 && Math.abs(pinned.speed('low', s25 + 18 * 3600) + 5) < 1e-9;
  const lean = Math.acos(Math.min(1, dot(pinned.axis('low', s24 + 12 * 3600), pinned.axis('high', s24 + 12 * 3600)))) / D2R;
  check(exact && Math.abs(lean - 20) < 1e-6, `a pinned day holds: 12 m/s from 06 to 18 h of 24 September, -3 and -5 at 06 and 18 h of the 25th, the high axis 20 degrees off at noon (${lean.toFixed(3)})`);
  let outside = 0;
  for (let h = -48; h <= 96; h += 0.5) {
    const t = s24 + h * 3600; if (t > s24 - 12 * 3600 && t < s25 + 30 * 3600) continue;
    for (const L of LAYERS) outside = Math.max(outside, Math.abs(pinned.speed(L, t) - plain.speed(L, t)), len(sub(pinned.omega(L, t), plain.omega(L, t))) * R);
  }
  check(outside < 1e-9, `pins change no wind outside the hours their knots reach (largest change ${outside.toExponential(1)} m/s)`);
  check(pinned.day(d24).pinned && pinned.day(d24).date === '2024-09-24' && pinned.dateOfDay(pinned.dayIndex(s24 + 3600)) === '2024-09-24', 'the world\'s calendar: a day is found by its date and gives its date back');
}

{ // 8b: a plain westerly every day (Earth's form), on Earth's radius
  const RE = 6371000, s = new Steer({ seed: 3, epoch: '2017-09-08T00:00:00Z', steering: { low: { fixed: 8 }, tilt: 0, high: { veer: 0 } } }, RE);
  let worst = 0;
  for (const t of [0, 3600 * 7.3, 86400 * 40.1]) for (const lat of [-60, -20, 0, 35, 70]) {
    const w = s.windAt('low', t, lat, 120, 0);
    worst = Math.max(worst, Math.abs(w.east - 8 * Math.cos(lat * D2R)), Math.abs(w.north), Math.abs(w.up));
  }
  check(worst < 1e-9, `a world file's plain westerly holds: 8 m/s toward the east on the equator and cos(latitude) of it elsewhere, every day (off by ${worst.toExponential(1)} m/s)`);
}

{ // 9
  let worst = 0;
  for (const t of times) for (const [lat, lon] of places.slice(0, 10)) {
    const p = at(lat, lon, 3000), a = steer.wind('low', t, p), b = steer.wind('mid', t, p), c = steer.wind('cell', t, p);
    worst = Math.max(worst, len(sub(c, a.map((x, i) => (x + b[i]) / 2))));
  }
  check(worst < 1e-9, `the cells move with the mean of the low and mid winds (off by ${worst.toExponential(1)} m/s)`);
}

{ // 10
  const u = makeSteerUniforms();
  check(!STEER_GLSL.includes('`'), 'STEER_GLSL has no backtick');
  const defs = [...STEER_GLSL.matchAll(/#define STEER_(\w+) (\d+)/g)].map((m) => [m[1].toLowerCase(), +m[2]]);
  check(JSON.stringify(defs) === JSON.stringify(LAYERS.map((L, k) => [L, k])), `its layer numbers are STEER_LAYERS' (${defs.map((d) => d.join(' ')).join(', ')})`);
  const tsAll = [T_SCENE, T_SCENE + 3.3 * 86400 + 777, steer.t(Date.parse('1950-01-05T03:00:00Z')), steer.t(Date.parse('2099-12-20T21:00:00Z'))];
  let worst = 0, worstRise = 0, worstWind = 0, worstW = 0, declared = '';
  const transposed = { worst: 0 };
  for (const t of tsAll) {
    steer.uniforms(t, u);
    const g = runGlsl(STEER_GLSL, u);
    declared = g.uniforms.map((x) => `${x.type} ${x.name}${x.size ? `[${x.size}]` : ''}`).join(', ');
    const ph = steer.risePhases(t);
    worstW = Math.max(worstW, Math.abs(u.uSteerRise[2] - ph.wa));
    // the check against matrices uploaded the wrong way round (each one's transpose)
    const ut = { ...u, uSteerInv: u.uSteerInv.map((_, i) => u.uSteerInv[9 * Math.floor(i / 9) + 3 * (i % 3) + Math.floor((i % 9) / 3)]) };
    const gt = runGlsl(STEER_GLSL, ut);
    for (const [lat, lon] of places.slice(0, 30)) for (const h of [0, 1500, 5000, 9000]) {
      const p = at(lat, lon, h);
      for (const L of LAYERS) {
        const fn = `steer${L[0].toUpperCase()}${L.slice(1)}`, want = steer.inverse(L, t, p);
        worst = Math.max(worst, len(sub(g.fn[fn](p), want)));
        transposed.worst = Math.max(transposed.worst, len(sub(gt.fn[fn](p), want)));
        const wq = mulMT(steer.motion(L, t), steer.wind(L, t, p));
        worstWind = Math.max(worstWind, len(sub(g.fn[`steerWind${L[0].toUpperCase()}${L.slice(1)}`](want), wq)));
      }
      const r = len(p);
      worstRise = Math.max(worstRise, len(sub(g.fn.steerLowA(p), steer.inverse('low', t, p.map((x) => x * (1 - ph.a / r))))),
        len(sub(g.fn.steerLowB(p), steer.inverse('low', t, p.map((x) => x * (1 - ph.b / r))))));
    }
  }
  const keys = Object.keys(u).sort().join(', ');
  check(declared.split(', ').map((x) => x.split(' ')[1].replace(/\[.*/, '')).sort().join(', ') === keys, `the GLSL declares exactly the uniforms Steer fills: ${declared}`);
  check(worst < 0.1, `the GLSL's steerLow .. steerCell give the JS's M^-1 p within ${(worst * 100).toFixed(1)} cm, in 32-bit floats, from 1950 to 2099 (120 places at four heights)`);
  check(transposed.worst > 1000, `... and the same check fails on matrices sent the wrong way round (${(transposed.worst / 1000).toFixed(0)} km off)`);
  check(worstRise < 0.1 && worstW < 1e-6, `steerLowA and steerLowB give the JS's pattern at the two rise phases within ${(worstRise * 100).toFixed(1)} cm; the weight is the JS's`);
  check(worstWind < 1e-3, `steerWindLow .. steerWindCell give the wind in each layer's own axes within ${worstWind.toExponential(1)} m/s`);
}

{ // 11
  const v = steer.cfg.rise, W = steer.cfg.risePeriod;
  check(Math.abs(steer.rise(T_SCENE + 1000) - steer.rise(T_SCENE) - 1000 * v) < 1e-6 && Math.abs(steer.rise(0)) < 1e-12, `the rise is its speed's exact integral (${v} m/s from the epoch)`);
  const g = (r) => Math.sin(r * 2 * Math.PI / 730 + 0.4) + 0.3 * Math.cos(r * 2 * Math.PI / 1900);    // any pattern down a column
  const dt = 5, bound = 2 * v * dt * (2 * Math.PI / 730 + 0.3 * 2 * Math.PI / 1900) + 1e-9;
  let blendJump = 0, oneJump = 0, wraps = 0;
  let prev = steer.risePhases(T_SCENE - dt);
  for (let t = T_SCENE; t < T_SCENE + 4 * W / v; t += dt) {
    const ph = steer.risePhases(t);
    const b0 = prev.wa * g(prev.a) + (1 - prev.wa) * g(prev.b), b1 = ph.wa * g(ph.a) + (1 - ph.wa) * g(ph.b);
    blendJump = Math.max(blendJump, Math.abs(b1 - b0) - (Math.abs(ph.wa - prev.wa) * 2.6));
    oneJump = Math.max(oneJump, Math.abs(g(ph.a) - g(prev.a)));
    if (ph.a < prev.a) { wraps++; if (prev.wa > 0.002 || ph.wa > 0.002) blendJump = Infinity; }
    prev = ph;
  }
  check(wraps >= 3 && blendJump <= bound, `the two rise phases blend with no jump: ${wraps} wraps of phase a, each where its weight is nothing`);
  check(oneJump > 10 * bound, `... where one phase read alone would jump (${oneJump.toFixed(2)} in a pattern of amplitude 1.3)`);
}

{ // 12
  const N = 64, data = cloudNoiseData(N), scale = haven.clouds.volume.scale;
  const tex = (x, y, z) => {
    x = (x - Math.floor(x)) * N - 0.5; y = (y - Math.floor(y)) * N - 0.5; z = (z - Math.floor(z)) * N - 0.5;
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), tx = x - i, ty = y - j, tz = z - k;
    const I0 = (i + N) % N, I1 = (i + 1 + N) % N, J0 = (j + N) % N, J1 = (j + 1 + N) % N, K0 = (k + N) % N, K1 = (k + 1 + N) % N;
    const g = (a, b, c) => data[((c * N + b) * N + a) * 2];
    const lx = (b, c) => g(I0, b, c) + (g(I1, b, c) - g(I0, b, c)) * tx;
    const ly = (c) => lx(J0, c) + (lx(J1, c) - lx(J0, c)) * ty;
    return (ly(K0) + (ly(K1) - ly(K0)) * tz) / 255;
  };
  const E = enu(START.lat, START.lon), H = 2100, P0 = at(START.lat, START.lon, H), T = 30;
  const pts = []; for (let a = -9; a <= 9; a += 2) for (let b = -9; b <= 9; b += 2) pts.push(P0.map((x, c) => x + E.e[c] * a * 330 + E.n[c] * b * 330));
  const shift = (p, s) => p.map((x, c) => x + E.e[c] * s[0] + E.n[c] * s[1] + E.u[c] * s[2]);
  // where the clouds that stood at the points at the first time stand at the second: the shift
  // that matches the noise best, within 2 km (the noise repeats every `scale`: a larger search
  // would find the same clouds again one period away)
  const match = (q0, q1) => {
    const n0 = pts.map((p) => { const q = q0(p); return tex(q[0], q[1], q[2]); });
    const err = (s) => { let e = 0; for (let i = 0; i < pts.length; i++) { const q = q1(shift(pts[i], s)); const d = tex(q[0], q[1], q[2]) - n0[i]; e += d * d; } return e; };
    let cands = [];
    for (let a = -2000; a <= 2000; a += 125) for (let b = -2000; b <= 2000; b += 125) for (let c = -2000; c <= 2000; c += 125) if (a * a + b * b + c * c <= 2000 * 2000) cands.push({ s: [a, b, c], e: err([a, b, c]) });
    cands.sort((x, y) => x.e - y.e); cands = cands.slice(0, 5);
    let best = cands[0];
    for (const c0 of cands) {
      let cur = c0;
      for (const step of [25, 5, 1]) {
        const s0 = cur.s;
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let c = -3; c <= 3; c++) { const s = [s0[0] + a * step, s0[1] + b * step, s0[2] + c * step], e = err(s); if (e < cur.e) cur = { s, e }; }
      }
      if (cur.e < best.e) best = cur;
    }
    return best;
  };
  // judged as the plan judges the volume's motion: the horizontal shift within 10 degrees and 20 %
  // of the wind's (a few metres allowed for the search's own grain), the vertical one the rise
  const judge = (name, got, want) => {
    const gh = Math.hypot(got.s[0], got.s[1]), wh = Math.hypot(want[0], want[1]);
    const ang = wh > 1 && gh > 1 ? Math.acos(Math.max(-1, Math.min(1, (got.s[0] * want[0] + got.s[1] * want[1]) / (gh * wh)))) / D2R : 0;
    const ok = Math.hypot(got.s[0] - want[0], got.s[1] - want[1]) <= 0.2 * wh + 6 && (wh < 100 || ang <= 10) && Math.abs(got.s[2] - want[2]) <= 0.2 * Math.abs(want[2]) + 6;
    const line = `${name}: in ${T} s the clouds went ${got.s[0]} m east, ${got.s[1]} m north, ${got.s[2]} m up (match ${got.e.toExponential(1)}); the wind carries them ${want[0].toFixed(0)}, ${want[1].toFixed(0)}, ${want[2].toFixed(0)}: ${(gh / T).toFixed(1)} m/s against ${(wh / T).toFixed(1)}, ${ang.toFixed(0)} degrees apart`;
    return { ok, line, ratio: wh > 0 ? gh / wh : Infinity, ang };
  };
  // the cloud drift as it was (CloudVolume.render, lines 408-420, and the shader's q = p / scale + drift;
  // on Haven the wind is rig.east x the sea's wind or 6 m/s, at the traveller)
  const todayRule = () => {
    // (Haven's 'change' was 0.009 noise units a second: the number has left its file with the term)
    const v = haven.clouds.volume, wind = haven.surface.sea?.wind ?? 6, change = 0.009, sc = v.scale ?? 5200, drift = [0.3, 0.6, 0.1], dt = 1 / 30;
    const q0 = drift.slice(); for (let t = 0; t < T - 1e-9; t += dt) { for (let c = 0; c < 3; c++) drift[c] += E.e[c] * dt * Math.min(20, wind) / sc; drift[2] += dt * change; }
    const q1 = drift.slice();
    return { q0: (p) => p.map((x, c) => x / sc + q0[c]), q1: (p) => p.map((x, c) => x / sc + q1[c]), want: [wind * T, 0, 0] };
  };
  // the steering: the low pattern read through STEER_GLSL's steerLowA at the clock's two times
  const steerRule = (t) => {
    const g0 = runGlsl(STEER_GLSL, steer.uniforms(t)), g1 = runGlsl(STEER_GLSL, steer.uniforms(t + T));
    const moved = sub(steer.carry('low', t, t + T, P0), P0), up = steer.rise(t + T) - steer.rise(t);
    return { q0: (p) => g0.fn.steerLowA(p).map((x) => x / scale), q1: (p) => g1.fn.steerLowA(p).map((x) => x / scale), want: [dot(moved, E.e), dot(moved, E.n), dot(moved, E.u) + up] };
  };
  // three times with a wind worth measuring at the place (4 m/s and more), days apart, away from the rise's wraps
  const ts = [];
  for (let t = T_SCENE; ts.length < 3 && t < T_SCENE + 60 * 86400; t += 1800) {
    if (ts.length && t - ts[ts.length - 1] < 2.5 * 86400) continue;
    if (steer.windAt('low', t, START.lat, START.lon, H).speed >= 4 && steer.risePhases(t).wa > 0.1 && steer.risePhases(t + T).wa > 0.1) ts.push(t);
  }
  const today = todayRule(), tj = judge('the drift as it was', match(today.q0, today.q1), today.want);
  if (TODAY) {
    console.log(`     ${tj.line}`);
    check(tj.ok, 'the pattern moves with the wind (the drift as it was, CloudVolume.render)');
  } else {
    let all = true;
    for (const t of ts) {
      const r = steerRule(t), j = judge(`the steering, ${new Date(steer.ms(t)).toISOString().slice(0, 16)} UTC`, match(r.q0, r.q1), r.want);
      console.log(`     ${j.line}`); all &&= j.ok;
    }
    check(ts.length === 3 && all, 'the clouds go where the low wind carries them, within 10 degrees and 20 %, and rise at the rise (the noise read through the shader\'s own text)');
    console.log(`     ${tj.line}`);
    check(!tj.ok && tj.ratio > 4 && tj.ratio < 6 && tj.ang > 90, `the same check fails on the drift as it was: against the wind (${tj.ang.toFixed(0)} degrees off) at ${tj.ratio.toFixed(1)} times its speed`);
  }
}

console.log(failed ? 'sky-steer-test: FAILED' : 'sky-steer-test: all passed');
process.exit(failed ? 1 : 0);
