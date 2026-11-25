// The sky's step 0 joined (docs/briefs/clouds-weather-plan.md): the one shared shader rule
// (src/sky/skyGlsl.js), the clouds moved onto the steering winds, the frame order moved into
// src/sky/skySystem.js, the field with the stub as its producer (src/sky/skyField.js), the
// governor's and the benchmark's hooks, and the debug switches. No browser: the GLSL is run
// by scripts/lib/glslRun.mjs in 32-bit floats, the noise read as a GPU reads it
// (scripts/lib/glslSamplers.mjs), and the sky system driven with stand-ins that write down
// what is asked of them.
//   node scripts/sky-system-test.mjs                 every check (about 20 s); exits 1 on any failure
//   node scripts/sky-system-test.mjs --break <what>  one fault put in on purpose, to see its checks fail:
//        quat (the quaternion of M, not of M^-1), march (the march's ray not turned), heap (the shared
//        rule reading p / scale, as before), clock (the steering advanced only while the volume is
//        drawn, as the drift was), order (the bolt slot after the near slices), noclouds (the figure
//        left in the clouds' shade), field (the field's 'now' maps never blended past the first
//        snapshot), ladder (a cloud step's setter bypassing the sky), parts (a sky part with no has())
//
// What is checked:
//  1. Purity: skyGlsl.js, skyProducer.js and skyFieldWorker.js import neither three nor the DOM;
//     nothing under src/sky/sky* or src/weather/sky uses Math.random.
//  2. The GLSL texts run (no reserved word, no backtick): the shared rule, the field rule, and
//     the march's own marchPattern() and density() read out of src/sky/cloudVolume.js.
//  3. The steering's quaternion turns a point as steer.js's M^-1 does: in JS to a micrometre,
//     in the GLSL to 8 ulp of 32 bits, on Haven and on Earth.
//  4. The shared heap rule: GLSL against its JS twin.
//  5. The field rule (skyLow, skyLowDensity, skyShade, skyShadeLight): GLSL against the JS twins,
//     on the stub's snapshot of Haven.
//  6. The clouds go with the low wind at the day's speed: a cloud element carried by the low
//     layer's motion (steer.carry) reads the same value 30 s later, through the shared rule's
//     text and through the march's text, and the visible pattern of the march moves with the
//     wind within 10 degrees and 20 %; the drift as it was fails both.
//  7. The clock: the steering is a function of the game clock alone (paused, jumped, run
//     backwards, asked in any order), whether or not the volume is drawn; above 600 x it keeps
//     to 600 x and is set back when the clock slows.
//  8. The frame order: each step calls the parts in the plan's order; the bolt slot is drawn
//     before the near slices; noclouds takes every cloud and its shade away.
//  9. The governor's ladder is the same and its cloud steps go through the sky's setters; every
//     saving of the sky does what it says.
// 10. The benchmark: PARTS_OUT has ids, the sky's six among them, measured only where the sky has
//     them; a cost view's hour is set, and the clock held while views are measured.
// 11. __shotReady waits on the sky (the field and the probe among it).
// 12. The debug switches on Haven: sky:<preset> makes the field with that preset, storm a still
//     mature cell 8 km north-east of the opening view, flash a stroke held at its brightest,
//     noclouds no field at all.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { runGlsl } from './lib/glslRun.mjs';
import { sampler2D, sampler3D } from './lib/glslSamplers.mjs';
import { cloudNoiseData } from '../src/sky/cloudNoiseData.js';
import {
  steerQuat, skyToLowJS, SKY_STEER_GLSL, HEAP_GLSL, FAIR_GLSL, cloudHeapJS, SKY_UNIFORMS, makeSkyUniforms,
  SKY_FIELD_GLSL, SKY_FIELD_UNIFORMS_GLSL, skyLowJS, skyLowDensityJS, skyShadeJS, skyShadeLightJS,
} from '../src/sky/skyGlsl.js';
import { Steer, mulMT } from '../src/weather/sky/steer.js';
import { landFromI16, STUB_PRESETS } from '../src/weather/sky/stub.js';
import { CELL_KIND } from '../src/weather/sky/format.js';
import { makeProducer, hourAtEpoch } from '../src/sky/skyProducer.js';
import { SkySystem, SKY_SAVINGS, SKY_PARTS, skyDebug, NOISE_RATE_MAX } from '../src/sky/skySystem.js';
import { SkyField } from '../src/sky/skyField.js';
import { CloudLayer } from '../src/sky/clouds.js';
import { CloudVolume } from '../src/sky/cloudVolume.js';
import { FEATURE_STEPS } from '../src/perf/governor.js';
import { PARTS_OUT, CostTest } from '../src/perf/benchmark.js';
import { G } from '../src/render/globals.js';
import { dateToJD } from '../src/core/ephemeris.js';
import haven from '../src/worlds/haven.js';
import earth from '../src/worlds/earth.js';

const argv = process.argv.slice(2), BREAK = argv.includes('--break') ? argv[argv.indexOf('--break') + 1] : null;
const BREAKS = ['quat', 'march', 'heap', 'clock', 'order', 'noclouds', 'field', 'ladder', 'parts'];
if (BREAK && !BREAKS.includes(BREAK)) { console.log(`no break ${BREAK} (${BREAKS.join(', ')})`); process.exit(2); }
if (BREAK) console.log(`(with a fault put in: ${BREAK})`);
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const D2R = Math.PI / 180;
const at = (R, lat, lon, h = 0) => { const la = lat * D2R, lo = lon * D2R, r = R + h; return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)]; };
const enu = (lat, lon) => { const la = lat * D2R, lo = lon * D2R; return { e: [-Math.sin(lo), Math.cos(lo), 0], n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], u: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)] }; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l]; };
// a fixed spread of numbers (no Math.random here either)
const spread = (i, k = 0) => { const x = Math.sin(i * 12.9898 + k * 78.233 + 0.5) * 43758.5453; return x - Math.floor(x); };
const transpose = (M) => Float64Array.from([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]);
const quatOf = (M, out) => (BREAK === 'quat' ? steerQuat(transpose(M), out) : steerQuat(M, out));

const R = haven.radius, START = haven.scene.start, T_SCENE_MS = Date.parse(haven.scene.dateUTC);
const steer = new Steer(haven.weather, R), T0 = steer.t(T_SCENE_MS);
const noise = sampler3D(cloudNoiseData(64), 64, 2);
const vol = haven.clouds.volume, SCALE = vol.scale;

// ---- 1. purity -------------------------------------------------------------------------------
{
  const pure = ['../src/sky/skyGlsl.js', '../src/sky/skyProducer.js', '../src/sky/skyFieldWorker.js'];
  let bad = [];
  for (const f of pure) {
    const s = read(f).replace(/\/\/.*$/gm, '');
    if (/from\s+['"]three['"]/.test(s) || /\b(document|window)\./.test(s)) bad.push(f);
  }
  check(!bad.length, `skyGlsl.js, skyProducer.js and skyFieldWorker.js import neither three nor the DOM${bad.length ? ': ' + bad.join(', ') : ''}`);
  const imports = [...read('../src/sky/skyGlsl.js').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  check(imports.length === 1 && imports[0] === '../weather/sky/format.js', `skyGlsl.js takes only format.js (its field decoders): ${imports.join(', ')}`);
  const rnd = ['../src/sky/skyGlsl.js', '../src/sky/skyProducer.js', '../src/sky/skyFieldWorker.js', '../src/sky/skySystem.js', '../src/sky/skyField.js', '../src/weather/sky/steer.js', '../src/weather/sky/format.js', '../src/weather/sky/stub.js', '../src/weather/sky/cellShape.js']
    .filter((f) => /Math\.random/.test(read(f).replace(/\/\/.*$/gm, '')));
  check(!rnd.length, `no Math.random in the sky's step-0 code${rnd.length ? ': ' + rnd.join(', ') : ''}`);
}

// ---- 2. the GLSL texts run -------------------------------------------------------------------
// the march's own functions, read out of cloudVolume.js (the text the GPU compiles)
const fnText = (src, name) => {
  const i = src.search(new RegExp(`\\b(?:float|vec[234]|void|bool)\\s+${name}\\s*\\(`));
  if (i < 0) throw new Error(`no function ${name}`);
  let k = src.indexOf('{', i), depth = 0;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}' && --depth === 0) break; }
  return src.slice(i, k + 1);
};
const volSrc = read('../src/sky/cloudVolume.js');
const MARCH = volSrc.slice(volSrc.indexOf('const MARCH = /* glsl */`'), volSrc.indexOf('`;', volSrc.indexOf('const MARCH = /* glsl */`')));
let marchFns = fnText(MARCH, 'marchPattern') + '\n' + fnText(MARCH, 'density');
// (--break march: the ray's direction left in the planet's axes)
const marchMain = BREAK === 'march' ? fnText(MARCH, 'main').replace('dirQ = skyToLow(uCloudSteer, dir)', 'dirQ = dir') : fnText(MARCH, 'main');
const marchDirTurned = /dirQ\s*=\s*skyToLow\(uCloudSteer,\s*dir\)/.test(marchMain);
const marchRayOk = /camQ\s*=\s*skyToLow\(uCloudSteer,\s*uCamPlanetPos\)/.test(marchMain) && marchDirTurned && /sunQ\s*=\s*skyToLow\(uCloudSteer,\s*uSunDir\)/.test(marchMain);
const heapText = BREAK === 'heap' ? HEAP_GLSL.replace('vec3 qv = skyToLow(steer, up) * (vol.z * vol.x);', 'vec3 qv = up * (vol.z * vol.x);') : HEAP_GLSL;
{
  const texts = { SKY_STEER_GLSL, FAIR_GLSL, HEAP_GLSL, SKY_FIELD_GLSL, SKY_FIELD_UNIFORMS_GLSL };
  check(Object.values(texts).every((s) => !s.includes('`')), 'no backtick in the GLSL strings');
  let err = '';
  try {
    runGlsl('uniform highp sampler3D tN;\n' + heapText + '\nvec2 probe(vec3 up) { return cloudHeap(tN, up, 0.5, 0.55, 0.44, vec3(1.0, 1.0, 1.0), vec4(0.0, 0.0, 0.0, 1.0), 1.0); }', { tN: noise });
    runGlsl(SKY_FIELD_UNIFORMS_GLSL + SKY_FIELD_GLSL, { ...uField(null), tCloudNoise: noise });
    runGlsl('uniform vec4 uCloud;\nuniform highp sampler3D tCloudNoise;\n' + marchFns, { uCloud: [0, 0, 1 / SCALE, 16000], tCloudNoise: noise });
  } catch (e) { err = e.message; }
  check(!err, `the shared rule, the field rule and the march's marchPattern() and density() run as GLSL ES 3${err ? ': ' + err : ''}`);
  check(marchRayOk, "the march turns its camera, its ray and the Sun's direction into the low layer's axes once a ray (skyToLow of uCloudSteer)");
  // every reader of the rule hands it the steering, and none reads a drift
  const readers = { terrain: '../src/terrain/terrainMaterial.js', treeShade: '../src/life/treeShade.js', farRocks: '../src/rocks/farRocks.js', shell: '../src/sky/clouds.js', volume: '../src/sky/cloudVolume.js' };
  const badR = [];
  for (const [k, f] of Object.entries(readers)) {
    const s = read(f);
    if (/uCloudWind|uVolWind|\.drift\b/.test(s.replace(/\/\/.*$/gm, ''))) badR.push(`${k} still reads a drift`);
    if (k !== 'volume' && !/cloudHeap\([^;]*uCloudSteer/.test(s)) badR.push(`${k} does not hand cloudHeap the steering`);
    if (!/uCloudSteer: (SKY_UNIFORMS|sh)\.uCloudSteer/.test(s)) badR.push(`${k} does not take the one uCloudSteer object`);
  }
  check(!badR.length, `the ground, the trees' shade map, the far rocks, the shell and the volume all read the clouds on the steering${badR.length ? ': ' + badR.join('; ') : ''}`);
  const cl = new CloudLayer(null), cv = new CloudVolume(null);
  check(cl.uniforms.uCloudSteer === SKY_UNIFORMS.uCloudSteer && cv.uniforms.uCloudSteer === SKY_UNIFORMS.uCloudSteer, 'the shell and the volume hold the very uniform object the sky system fills');
}

// ---- 3. the quaternion --------------------------------------------------------------------------
{
  let js = 0, gl = 0, glTol = 0, n = 0;
  for (const [world, st] of [[haven, steer], [earth, new Steer(earth.weather, earth.radius)]]) {
    for (let i = 0; i < 60; i++) {
      const t = (world === haven ? T0 : st.t(Date.parse(earth.scene.dateUTC))) + (i - 30) * 5.3 * 3600;
      // (the JS in 64 bits; the GLSL with the 32-bit quaternion the GPU is handed)
      const M = st.motion('low', t), q = quatOf(M), q64 = quatOf(M, new Float64Array(4));
      const g = runGlsl(SKY_STEER_GLSL + '\nuniform vec4 uQ;\nvec3 turn(vec3 p) { return skyToLow(uQ, p); }', { uQ: q });
      for (let j = 0; j < 8; j++) {
        const p = at(world.radius, 180 * spread(i, j) - 90, 360 * spread(j, i), 12000 * spread(i + j, 3));
        const want = mulMT(M, p), a = skyToLowJS(q64, p), b = g.fn.turn(p);
        js = Math.max(js, len(sub(a, want)));
        const d = len(sub(b, want)), tol = 8 * len(p) * 2 ** -23;
        gl = Math.max(gl, d / tol); n++;
      }
    }
  }
  check(js < 2e-6 && gl <= 1, `the steering's quaternion turns a point as M^-1 does: JS to ${js.toExponential(1)} m, the GLSL within ${gl.toFixed(2)} of 8 ulp, at ${n} places on Haven and Earth`);
}

// the uniforms the field rule takes, from a snapshot (or none)
function uField(s, steerQ = [0, 0, 0, 1], on = 1) {
  const blank = sampler2D(new Uint8Array(4 * 2 * 2), 2, 2, 4), blankC = sampler2D(new Uint8Array(2 * 2 * 2), 2, 2, 2);
  return {
    tWxA: s ? sampler2D(s.A, s.width, s.height, 4) : blank, tWxB: s ? sampler2D(s.B, s.width, s.height, 4) : blank, tWxC: s ? sampler2D(s.C, s.cWidth, s.cHeight, 2) : blankC,
    uSkyLow: [1 / SCALE, R, haven.clouds.shadow, on], uCloudSteer: steerQ,
  };
}

// ---- 4. the shared heap rule: GLSL against JS ---------------------------------------------------------
{
  const q = steerQuat(steer.motion('low', T0)), vv = [1 / SCALE, R / SCALE * 0.11, R + vol.base + 0.3 * vol.thick];
  const g = runGlsl('uniform highp sampler3D tN;\nuniform vec4 uQ;\nuniform vec3 uV;\n' + HEAP_GLSL + '\nvec2 h(vec3 up, float m, float fine) { return cloudHeap(tN, up, m, 0.55, 0.44, uV, uQ, fine); }', { tN: noise, uQ: q, uV: vv });
  let worst = 0, n = 0;
  for (let i = 0; i < 600; i++) {
    const up = norm(at(1, START.lat + 6 * (spread(i, 1) - 0.5), START.lon + 8 * (spread(i, 2) - 0.5))), m = spread(i, 3), fine = i % 2;
    const a = g.fn.h(up, m, fine), b = cloudHeapJS(noise, up, m, 0.55, 0.44, vv, q, fine);
    worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); n++;
  }
  check(worst < 2e-3, `the shared heap rule: the GLSL gives the JS twin's heap and cover within ${worst.toExponential(1)} at ${n} places (32-bit floats)`);
}

// ---- 5. the field rule: GLSL against JS on the stub's snapshot ---------------------------------------
const LAND = landFromI16(readFileSync(new URL('../public/data/haven_dem_4096.i16', import.meta.url)), 4096, 2048);
{
  const prod = makeProducer({ preset: 'storm', weather: haven.weather, radius: R, dayHours: 24, origin: START, layout: { width: 1024, height: 512, cWidth: 512, cHeight: 256 }, land: LAND });
  const s = prod.snapshot(Math.floor(T0 / 120) * 120 + 6 * 3600);
  const q = steerQuat(steer.motion('low', s.t)), u = uField(s, q);
  const g = runGlsl(SKY_FIELD_UNIFORMS_GLSL + SKY_FIELD_GLSL, { ...u, tCloudNoise: noise });
  const maps = { A: u.tWxA, B: u.tWxB };
  let wl = 0, wd = 0, ws = 0, wsl = 0, n = 0, shaded = 0, cloud = 0;
  for (let i = 0; i < 500; i++) {
    const lat = START.lat + 16 * (spread(i, 4) - 0.5), lon = START.lon + 24 * (spread(i, 5) - 0.5);
    const d = norm(at(1, lat, lon)), L = g.fn.skyLow(d), Lj = skyLowJS(maps, d);
    wl = Math.max(wl, Math.abs(L[0] - Lj[0]), Math.abs(L[1] - Lj[1]), Math.abs(L[2] - Lj[2]) / 50, Math.abs(L[3] - Lj[3]) / 50);
    const p = at(R, lat, lon, Lj[2] + (Lj[3] - Lj[2]) * spread(i, 6)), dd = g.fn.skyLowDensity(p), dj = skyLowDensityJS(maps, noise, u, p);
    wd = Math.max(wd, Math.abs(dd - dj)); if (dj > 0.05) cloud++;
    const sun = norm([d[0] + 0.6 * spread(i, 7) - 0.3, d[1] + 0.6 * spread(i, 8) - 0.3, d[2] + 0.4 + 0.5 * spread(i, 9)]);
    const pg = at(R, lat, lon, 1500 + 2500 * spread(i, 10)), sh = g.fn.skyShade(pg, sun), shj = skyShadeJS(maps, noise, u, pg, sun);
    ws = Math.max(ws, ...sh.map((x, k) => Math.abs(x - shj[k]))); if (shj[0] > 0.3) shaded++;
    const h = 1000 + 9000 * spread(i, 11), ll = g.fn.skyShadeLight(sh, h), llj = skyShadeLightJS(u, shj, h);
    wsl = Math.max(wsl, Math.abs(ll[0] - llj[0]), Math.abs(ll[1] - llj[1])); n++;
  }
  check(wl < 2e-3 && wd < 3e-3 && ws < 3e-3 && wsl < 3e-3, `the field rule: skyLow ${wl.toExponential(1)}, skyLowDensity ${wd.toExponential(1)}, skyShade ${ws.toExponential(1)}, skyShadeLight ${wsl.toExponential(1)} between GLSL and JS at ${n} places of the stub's storm (${cloud} in cloud, ${shaded} in a cloud's shade)`);
  check(cloud > 20 && shaded > 20, '... and the places tried are in cloud and in shade, not all clear sky');
  // no field: nothing
  const g0 = runGlsl(SKY_FIELD_UNIFORMS_GLSL + SKY_FIELD_GLSL, { ...uField(s, q, 0), tCloudNoise: noise });
  const none = g0.fn.skyShade(at(R, START.lat, START.lon, 1500), norm(at(1, START.lat, START.lon)));
  check(none[0] === 0 && none[1] === 1 && none[2] === 1 && g0.fn.skyLowDensity(at(R, START.lat, START.lon, 3000)) === 0, 'with no field (uSkyLow.w 0) the rule has no cloud and no shade');
}

// ---- 6. the clouds go with the low wind --------------------------------------------------------------
// The clouds' rule at the clock t, as the sky system fills it (one quaternion), through the GLSL texts.
const heapAt = (t) => { const g = runGlsl('uniform highp sampler3D tN;\nuniform vec4 uQ;\nuniform vec3 uV;\n' + heapText + '\nvec2 h(vec3 up) { return cloudHeap(tN, up, 0.8, 0.55, 0.0, uV, uQ, 1.0); }', { tN: noise, uQ: quatOf(steer.motion('low', t)), uV: [1 / SCALE, R / SCALE * 0.11, R + 2100] }); return (p) => g.fn.h(norm(p))[0]; };
const marchAt = (t, cam) => {
  const q = quatOf(steer.motion('low', t)), g = runGlsl('uniform vec4 uCloud;\nuniform highp sampler3D tCloudNoise;\n' + marchFns, { uCloud: [0.45, 0, 1 / SCALE, 16000], tCloudNoise: noise });
  const camQ = skyToLowJS(q, cam);
  return (p) => { const d = sub(p, cam), tt = len(d), dir = d.map((x) => x / tt), dirQ = marchDirTurned ? skyToLowJS(q, dir) : dir; return g.fn.density(g.fn.marchPattern(camQ, dirQ, tt), 0.85, 0.45, true); };
};
// the drift as it was (CloudVolume.render, before: q = p / scale + drift, drift added up frame by
// frame from the wind at the traveller, rig.east x 6 m/s on Haven, plus the 'change' term)
const todayAt = (seconds) => {
  const E = enu(START.lat, START.lon), drift = [0.3, 0.6, 0.1], dt = 1 / 30;
  for (let s = 0; s < seconds - 1e-9; s += dt) { for (let c = 0; c < 3; c++) drift[c] += E.e[c] * dt * 6 / SCALE; drift[2] += dt * vol.change; }
  return (p) => noise.sample(p.map((x, c) => x / SCALE + drift[c]))[0];
};
{
  const T = 30, E = enu(START.lat, START.lon), cam = at(R, START.lat, START.lon, 1470 + 1.7);
  // three times with a wind worth measuring at the place, days apart
  const ts = [];
  for (let t = T0; ts.length < 3 && t < T0 + 40 * 86400; t += 1800) { if (ts.length && t - ts[ts.length - 1] < 2.5 * 86400) continue; if (steer.windAt('low', t, START.lat, START.lon, 2100).speed >= 4) ts.push(t); }
  // (a) exact: the element at P0 at t is at carry(P0) at t + T, and reads the same there
  for (const [name, make] of [['the shared heap rule (shell, ground, trees, far rocks)', (t) => heapAt(t)], ["the march's density", (t) => marchAt(t, cam)]]) {
    let worst = 0, moved = 0, n = 0;
    for (const t of ts) {
      const f0 = make(t), f1 = make(t + T);
      for (let i = 0; i < 120; i++) {
        const P0 = at(R, START.lat + 0.6 * (spread(i, 12) - 0.5), START.lon + 0.9 * (spread(i, 13) - 0.5), 2100);
        const P1 = steer.carry('low', t, t + T, P0), a = f0(P0), b = f1(P1), c = f1(P0);
        worst = Math.max(worst, Math.abs(a - b)); if (Math.abs(a - c) > 0.02) moved++; n++;
      }
    }
    check(worst < 2e-3 && moved > n * 0.3, `${name}: a cloud carried 30 s by the low wind reads the same where it is carried (worst ${worst.toExponential(1)} at ${n} places on 3 days), and ${(100 * moved / n).toFixed(0)} % of places left where they were read otherwise: the clouds moved`);
  }
  {
    let worst = 0;
    const f0 = todayAt(0), f1 = todayAt(T), t = ts[0];
    for (let i = 0; i < 120; i++) { const P0 = at(R, START.lat + 0.6 * (spread(i, 12) - 0.5), START.lon + 0.9 * (spread(i, 13) - 0.5), 2100), P1 = steer.carry('low', t, t + T, P0); worst = Math.max(worst, Math.abs(f0(P0) - f1(P1))); }
    check(worst > 0.05, `the same check fails on the drift as it was (a cloud carried by the wind reads up to ${worst.toFixed(2)} otherwise)`);
  }
  // (b) the march's visible pattern: matched 30 s apart over a patch 2.1 km up, the shift is the wind's
  const pts = []; for (let a = -9; a <= 9; a += 2) for (let b = -9; b <= 9; b += 2) pts.push(sub(at(R, START.lat, START.lon, 2100), [0, 0, 0]).map((x, c) => x + E.e[c] * a * 330 + E.n[c] * b * 330));
  const match = (f0, f1) => {
    const v0 = pts.map(f0), sh = (p, s) => p.map((x, c) => x + E.e[c] * s[0] + E.n[c] * s[1]);
    const err = (s) => { let e = 0; for (let i = 0; i < pts.length; i++) { const d = f1(sh(pts[i], s)) - v0[i]; e += d * d; } return e; };
    let best = { s: [0, 0], e: err([0, 0]) };
    for (let a = -1650; a <= 1650; a += 150) for (let b = -1650; b <= 1650; b += 150) { const e = err([a, b]); if (e < best.e) best = { s: [a, b], e }; }
    for (const step of [40, 10, 2, 1]) { const s0 = best.s; for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { const s = [s0[0] + a * step, s0[1] + b * step], e = err(s); if (e < best.e) best = { s, e }; } }
    return best;
  };
  const judge = (got, want) => {
    const gh = Math.hypot(...got.s), wh = Math.hypot(want[0], want[1]);
    const ang = gh > 1 && wh > 1 ? Math.acos(Math.max(-1, Math.min(1, (got.s[0] * want[0] + got.s[1] * want[1]) / (gh * wh)))) / D2R : 180;
    return { ok: Math.hypot(got.s[0] - want[0], got.s[1] - want[1]) <= 0.2 * wh + 6 && ang <= 10, ang, ratio: gh / Math.max(wh, 1e-9), gh, wh };
  };
  let all = true; const lines = [];
  for (const t of ts) {
    const moved = sub(steer.carry('low', t, t + T, at(R, START.lat, START.lon, 2100)), at(R, START.lat, START.lon, 2100)), want = [dot(moved, E.e), dot(moved, E.n)];
    const j = judge(match(marchAt(t, cam), marchAt(t + T, cam)), want);
    all &&= j.ok; lines.push(`${(j.gh / T).toFixed(1)} m/s against ${(j.wh / T).toFixed(1)}, ${j.ang.toFixed(0)} degrees apart`);
  }
  check(all, `the march's clouds, seen from the opening place, go where the day's low wind carries them (within 10 degrees and 20 %): ${lines.join('; ')}`);
  const tWant = [6 * T, 0], tj = judge(match(todayAt(0), todayAt(T)), tWant);
  check(!tj.ok, `... and the drift as it was does not: ${(tj.gh / T).toFixed(1)} m/s against its own wind's 6.0, ${tj.ang.toFixed(0)} degrees apart`);
  // and the day's speed: what the steering carries is the wind steer.windAt gives there
  const w = steer.windAt('low', ts[0], START.lat, START.lon, 2100), moved = sub(steer.carry('low', ts[0], ts[0] + T, at(R, START.lat, START.lon, 2100)), at(R, START.lat, START.lon, 2100));
  check(Math.abs(len(moved) / T - w.speed) < 0.05, `... at the day's speed: ${(len(moved) / T).toFixed(2)} m/s carried, the low wind there ${w.speed.toFixed(2)} m/s`);
}

// ---- stand-ins for the sky system --------------------------------------------------------------------
function makeRig(lat = START.lat, lon = START.lon, h = 1471.7) {
  const p = at(R, lat, lon, h), E = enu(lat, lon);
  return { pos: new THREE.Vector3(...p), east: E.e, north: E.n, localUp: E.u, agl: 1.7, mode: 'walk', onFoot: true, throttle: 0, camera: { fov: 60 }, finalize(a, n, f) { log.push(`finalize ${n.toFixed(1)} ${f.toFixed(0)}`); } };
}
let log = [];
function fakeParts() {
  const clouds = {
    mesh: { visible: true }, shadow: new THREE.Vector4(), heap: new THREE.Vector4(0.55, 0.44, 0, 1), texture: { name: 'map' }, loading: false, shadows: true,
    uniforms: { uNearFade: { value: 0 }, tCloudNoise: { value: { name: 'noise' } }, uVol: { value: new THREE.Vector4(1 / SCALE, 1, 1, 0) } },
    setWorld() { log.push('clouds.setWorld'); }, update() { log.push('clouds.update'); this.mesh.visible = true; this.shadow.x = this.shadows !== false ? 0.85 : 0; this.heap.w = this.shadows !== false ? 1 : 0; return 1e5; },
  };
  const cloudVolume = { busy: false, wanted: false, enabled: true, steps: 36, reach: 16000, setWorld() { log.push('volume.setWorld'); }, setGround() {}, place() { log.push('volume.place'); }, ready() { log.push('volume.ready'); this.wanted = true; return this.enabled; }, render() { log.push('volume.render'); }, lay() { log.push('volume.lay'); } };
  const treeShade = { render() { log.push('shade.render'); } };
  const probe = { pending: false, saving() {}, live: () => false, has: () => false, partOut() {}, update() {}, draw() {}, render() { log.push('probe.render'); } };
  return { clouds, cloudVolume, treeShade, probe };
}
const shared = () => ({ uCloud: { value: null }, uWind: { value: new THREE.Vector4() }, tClouds: { value: null }, uCloudHeap: { value: new THREE.Vector4() }, tCloudNoise: { value: null }, uCloudVol: { value: new THREE.Vector3() }, uCloudSteer: SKY_UNIFORMS.uCloudSteer });
const terrain = () => ({ shared: shared(), textures: { white: { name: 'white' } } });
const DATA = { rasters: [{ data: LAND.data, width: 4096, height: 2048, wrap: true, lon0: 0, lat0: 90, lat1: -90 }] };
const renderer = () => ({ render(scene) { log.push(`render ${scene.name || scene.type}`); } });
const ctx = (sky, rig, jd, over = {}) => ({ now: 1000, dt: 1 / 30, jd, timeRate: 1, paused: false, rig, day: 265, sunE: 1, viewW: 880, viewH: 412, bench: false, transfer: null, audio: { thunder(p, d) { log.push(`thunder ${d.toFixed(0)}`); } }, ...over });
const jdOf = (ms) => dateToJD(ms);
if (BREAK === 'clock') {
  // the fault: the steering advanced only while the volume is drawn (as the old drift was)
  const orig = SkySystem.prototype.clockStep;
  SkySystem.prototype.clockStep = function (jd, dt, rate, paused) { if (this.cloudVolume.enabled) orig.call(this, jd, dt, rate, paused); };
}

// ---- 7. the clock -----------------------------------------------------------------------------------
{
  const sky = new SkySystem({ terrain: terrain(), parts: fakeParts() });
  sky.setWorld(haven, DATA);
  const rig = makeRig(), q = () => Array.from(SKY_UNIFORMS.uCloudSteer.value), closed = (ms) => Array.from(steerQuat(steer.motion('low', steer.t(ms))));
  const near = (a, b) => a.every((x, k) => Math.abs(x - b[k]) < 2e-7);
  const ms0 = T_SCENE_MS;
  sky.cloudVolume.enabled = false;              // (the governor's last saving: the volume is not drawn)
  sky.weatherStep(ctx(sky, rig, jdOf(ms0))); const a = q();
  sky.weatherStep(ctx(sky, rig, jdOf(ms0 + 60000))); const b = q();
  check(near(a, closed(ms0)) && near(b, closed(ms0 + 60000)) && !near(a, b), 'the steering is the closed form of the game clock, and moves a minute later with the volume not drawn');
  sky.weatherStep(ctx(sky, rig, jdOf(ms0 + 60000), { paused: true })); const c = q();
  check(near(b, c), 'with the clock stopped the clouds stand still');
  sky.weatherStep(ctx(sky, rig, jdOf(ms0 + 3 * 86400e3))); const d = q();
  sky.weatherStep(ctx(sky, rig, jdOf(ms0 - 86400e3))); const e = q();
  sky.weatherStep(ctx(sky, rig, jdOf(ms0 + 3 * 86400e3))); const f = q();
  check(near(d, closed(ms0 + 3 * 86400e3)) && near(e, closed(ms0 - 86400e3)) && near(d, f), 'a jump of the clock, forward or back, gives the clouds of that moment, whatever was asked before');
  sky.cloudVolume.enabled = true;
  // fast clock: the noise keeps to 600 x
  sky.weatherStep(ctx(sky, rig, jdOf(ms0)));
  let ms = ms0;
  for (let i = 0; i < 30; i++) { ms += 3600 * 1000 / 30; sky.weatherStep(ctx(sky, rig, jdOf(ms), { timeRate: 3600 })); }
  const kept = sky.noiseT - steer.t(ms0), want = 30 * NOISE_RATE_MAX / 30;
  sky.weatherStep(ctx(sky, rig, jdOf(ms + 1000 / 30)));
  // (the game clock through a Julian date and back: 40 microseconds)
  check(Math.abs(kept - want) < 1e-3 && Math.abs(sky.noiseT - steer.t(ms + 1000 / 30)) < 1e-3, `at an hour a second the clouds' clock goes ${NOISE_RATE_MAX} s a second (${kept.toFixed(1)} s in a second), and keeps to the game clock again when it slows`);
}

// ---- 8. the frame order -----------------------------------------------------------------------------------
{
  log = [];
  const parts = fakeParts(), sh = terrain(), sky = new SkySystem({ renderer: null, terrain: sh, parts });
  sky.setWorld(haven, DATA);
  const r = renderer(), rig = makeRig();
  sky.weatherScene.name = 'weather'; sky.boltScene.name = 'bolt'; sky.rain.mesh.name = 'rain-slice';
  // something in the bolt slot (D's strokes), and rain falling (to see its slice)
  const stroke = new THREE.Object3D(); stroke.visible = true; sky.boltScene.add(stroke);
  sky.rain.mesh.visible = true;
  log = [];
  sky.weatherStep(ctx(sky, rig, jdOf(T_SCENE_MS)));
  const w = log.slice(); log = [];
  sky.beforeScene({ renderer: r, post: {}, rig, worldRadius: R, time: 3, treesWanted: true });
  const b = log.slice(); log = [];
  sky.groundUniforms();
  const gOk = sh.shared.tClouds.value === parts.clouds.texture && sh.shared.uCloudHeap.value.w === 1 && sh.shared.tCloudNoise.value === parts.clouds.uniforms.tCloudNoise.value;
  log = [];
  const order = (c) => (BREAK === 'order' ? (sky.cloudVolume.lay(c.near, c.far, c.rig), c.renderer.render(sky.boltScene)) : sky.afterGround(c));
  order({ renderer: r, rig, near: 1, far: 1e6 });
  const a = log.slice(); log = [];
  sky.rain.mesh.visible = true;
  sky.drawWeather({ renderer: r, rig, aspect: 2, near: 5, far: 1e6 });
  const dw = log.slice();
  check(b.join(',') === 'volume.place,clouds.update,volume.ready,shade.render,probe.render,volume.render', `before the main picture: ${b.join(' > ')}`);
  check(gOk, 'the ground is handed the layer\'s map, noise and heaps');
  check(a.join(',') === 'render bolt,volume.lay', `in the picture after the ground: the bolt slot, then the near slices (${a.join(' > ')})`);
  check(dw[0] === 'render weather' && dw.includes('render rain-slice') && dw[1].startsWith('finalize 0.2'), `the weather scene, then the rain in its own slice from the eye (${dw.join(' > ')})`);
  check(sh.shared.uCloud.value === parts.clouds.shadow, "the ground's cloud shadow is the shell's own numbers (one object)");
  // noclouds
  log = [];
  const p2 = fakeParts(), sh2 = terrain(), sky2 = new SkySystem({ terrain: sh2, parts: p2, debug: 'noclouds' });
  sky2.setWorld(haven, DATA);
  G.uWeather.value.set(0.3, 0.4, 0, 0);
  sky2.weather.def = { fake: true }; sky2.weather.sunShade = 0.3; sky2.weather.skyShade = 0.4; sky2.weather.update = () => {};
  if (BREAK === 'noclouds') sky2.noClouds = false;
  sky2.weatherStep(ctx(sky2, makeRig(), jdOf(T_SCENE_MS)));
  sky2.beforeScene({ renderer: renderer(), post: {}, rig: makeRig(), worldRadius: R, time: 3, treesWanted: true });
  sky2.groundUniforms();
  const none = !p2.clouds.mesh.visible && p2.clouds.shadow.x === 0 && sh2.shared.uCloudHeap.value.w === 0 && !log.includes('volume.render') && G.uWeather.value.x === 1 && G.uWeather.value.y === 1 && !sky2.field.on;
  check(none, 'debug=noclouds: no shell, no volume, no shadow on the ground, trees or rocks, none of the clouds\' shade on the figure, no field');
}

// ---- 9. the governor ---------------------------------------------------------------------------------
{
  const LADDER = ['cloud-steps', 'tree-shadows', 'grass-mid', 'trees-far', 'far-trees', 'tree-leaves', 'cloak', 'fine-shadows', 'bloom', 'grass', 'pollen', 'terrain-1', 'terrain-2', 'clouds', 'far-relief', 'cloud-volume', 'detail', 'soft-shadows', 'contact', 'edge-glow', 'dust', 'rocks', 'far-rock-shadows', 'far-rocks', 'rain', 'leaves', 'sun-beams', 'air-shadow'];
  check(FEATURE_STEPS.map((f) => f.id).join(',') === LADDER.join(','), "the governor's ladder is as it was (ids and order)");
  const calls = [], app = { sky: { setSaving(id, off) { calls.push(`${id}:${off}`); } } };
  for (const id of ['cloud-steps', 'clouds', 'cloud-volume', 'rain']) { const f = FEATURE_STEPS.find((x) => x.id === id); f.apply(app, true); f.apply(app, false); }
  if (BREAK === 'ladder') calls.pop();
  check(calls.join(',') === 'cloud-steps:true,cloud-steps:false,clouds:true,clouds:false,cloud-volume:true,cloud-volume:false,rain:true,rain:false', `the cloud and rain steps go through the sky's setters: ${calls.join(' ')}`);
  const parts = fakeParts(), sky = new SkySystem({ terrain: terrain(), parts });
  sky.setWorld(haven, DATA);
  let ok = true; const why = [];
  for (const id of Object.keys(SKY_SAVINGS)) { try { sky.setSaving(id, true); } catch (e) { ok = false; why.push(e.message); } }
  ok &&= parts.cloudVolume.steps === 22 && parts.cloudVolume.enabled === false && sky.rain.share === 0.5 && parts.clouds.shadows === false;
  for (const id of Object.keys(SKY_SAVINGS)) sky.setSaving(id, false);
  ok &&= parts.cloudVolume.steps === 36 && parts.cloudVolume.enabled === true && sky.rain.share === 1 && parts.clouds.shadows === true;
  check(ok, `every saving of the sky (${Object.keys(SKY_SAVINGS).length}) is taken and given back: steps 36 -> 22, the volume, half the rain, the shadows${why.length ? ': ' + why.join('; ') : ''}`);
  let threw = false; try { sky.setSaving('no-such', true); } catch { threw = true; }
  check(threw, 'a saving the sky does not have is an error, not a silent nothing');
}

// ---- 10. the benchmark ---------------------------------------------------------------------------------
{
  const ids = PARTS_OUT.map((p) => p.id);
  const skyRows = PARTS_OUT.filter((p) => SKY_PARTS.includes(p.id));
  if (BREAK === 'parts') delete skyRows[0].has;
  check(new Set(ids).size === ids.length && ids[ids.length - 1] === 'everything' && SKY_PARTS.every((id) => ids.includes(id)) && skyRows.every((p) => typeof p.has === 'function'),
    `PARTS_OUT: ${ids.length} rows with ids, 'everything' last, the sky's six (${SKY_PARTS.join(', ')}) measured only where the sky has them`);
  // a cost test on a stand-in app: its parts, its hour, its clock held
  const sky = new SkySystem({ terrain: terrain(), parts: fakeParts() }); sky.setWorld(haven, DATA);
  const rig = { setLatLon(lat, lon) { this.at = [lat, lon]; }, pos: new THREE.Vector3(1, 0, 0), velocity: new THREE.Vector3(), mode: 'walk', standUp() {} };
  const g = { featureLevel: 0, resLevel: 0, fixed: null, nativePixels: 4.45e6, allOn: () => [], _applyScale() {}, restoreSavings() {} };
  const app = { governor: g, sky, rig, paused: false, timeOffsetHours: 0, world: { id: 'haven', radius: R }, terrain: { idle: true }, switching: false };
  const views = [{ name: 'under the storm', lat: -48.5, lon: 49, alt: 900, heading: 0, pitch: 10, timeOffsetHours: -2.5 }];
  const W = { ...haven, scene: { ...haven.scene, costViews: views } };
  const bench = { app, first: 'haven', names: { haven: ['ledge'] }, busy: false, goto() {} };
  const real = (await import('../src/worlds/index.js')).WORLDS, saved = real.haven; real.haven = W;
  let ct;
  try { ct = new CostTest(bench); } finally { real.haven = saved; }
  const partIds = ct.parts.map((p) => p.id);
  check(partIds.includes('clouds-all') && partIds.includes('cloud-shade') && !partIds.includes('fog') && !partIds.includes('cloud-upper'), `the cost test leaves out the sky's parts there are on Haven today (${partIds.filter((x) => SKY_PARTS.includes(x)).join(', ')}), not those still to come`);
  const heldAtStart = app.paused === true;
  // through the opening view to the storm view, placed at its hour
  ct.views = [{ world: 'haven', name: 'x', bookmark: 'ledge' }, ...views.map((v) => ({ world: 'haven', bookmark: 'ledge', ...v }))];
  ct.vi = 0; ct._next();
  const t0 = performance.now(); ct.t0 = t0 - 3000; ct.update();
  check(app.timeOffsetHours === -2.5 && heldAtStart, `a cost view is placed at its hour (${app.timeOffsetHours} h) and the clock is held while it is measured`);
  ct.restore();
  check(app.paused === false, '... and let go again when the test is over');
  // the sky's parts left out
  sky.partOut('clouds-all', true); log = []; sky.beforeScene({ renderer: renderer(), post: {}, rig: makeRig(), worldRadius: R, time: 3, treesWanted: true });
  const out = !sky.clouds.mesh.visible && !log.includes('volume.render');
  sky.partOut('clouds-all', false); sky.partOut('cloud-shade', true); sky.beforeScene({ renderer: renderer(), post: {}, rig: makeRig(), worldRadius: R, time: 3, treesWanted: true });
  const outShade = sky.clouds.shadows === false && sky.clouds.shadow.x === 0;
  sky.partOut('cloud-shade', false);
  check(out && outShade, "leaving out 'all the clouds' takes the shell, the volume and their shadows; 'the clouds' shadows' the shadows alone");
}

// ---- 11. __shotReady --------------------------------------------------------------------------------------
{
  const app = read('../src/app.js');
  const ready = app.match(/const ready = [^;]*;/)?.[0] || '';
  const parts = fakeParts(), sky = new SkySystem({ terrain: terrain(), parts }); sky.setWorld(haven, DATA);
  const b0 = sky.busy; parts.probe.pending = true; const b1 = sky.busy; parts.probe.pending = false;
  sky.field.producer = {}; sky.field.uploaded = false; const b2 = sky.busy; sky.field.producer = null;
  check(/!this\.sky\.busy/.test(ready) && !b0 && b1 && b2, 'pictures wait on the sky: the cloud noise and map, the field (its first maps) and the shade probe');
}

// ---- 12. the debug switches on Haven --------------------------------------------------------------------
{
  const d = skyDebug('floor,sky:fog,flash'), d2 = skyDebug('sky:storm'), d3 = skyDebug('storm'), d4 = skyDebug('sky:bogus,noclouds');
  check(d.preset === 'fog' && d.flash && !d.storm && d2.preset === 'storm' && !d2.storm && d3.storm && !d3.preset && d4.badPreset === 'bogus' && d4.noClouds, 'the switches are read: sky:<preset> (fair, fog, storm, front), storm, flash, noclouds');
  // sky:front: the field with that preset, its first maps blended and handed to the shaders
  const run = (debug, shot = true, steps = 1) => {
    const parts = fakeParts(), sky = new SkySystem({ terrain: terrain(), parts, debug, shotMode: shot });
    sky.setWorld(haven, DATA);
    const rig = makeRig();
    if (BREAK === 'field') sky.field.update = function (t) { if (!this.uploaded) SkyField.prototype.update.call(this, t); };
    for (let i = 0; i < steps; i++) sky.weatherStep(ctx(sky, rig, jdOf(T_SCENE_MS + i * 1000 / 30), { paused: shot }));
    return { sky, rig };
  };
  {
    const { sky } = run('sky:front', false, 1);
    const f = sky.field, s0 = f.snaps.get(Math.floor(sky.t / 120) * 120);
    const first = f.on && !f.busy && SKY_UNIFORMS.tWxA.value === f.textures.A && SKY_UNIFORMS.uSkyLow.value[3] === 1 && f.opts.preset === 'front';
    // 2 game minutes on: the 'now' maps are the blend of the two snapshots round the clock
    for (let i = 0; i < 20; i++) sky.weatherStep(ctx(sky, makeRig(), jdOf(T_SCENE_MS + 60000 + i * 1000 / 30)));
    const pair = f.pair, a = f.snaps.get(pair[0]), b = f.snaps.get(pair[1]);
    let diff = 0; if (a && b) for (let i = 0; i < f.now.A.length; i += 997) diff = Math.max(diff, Math.abs(f.now.A[i] - (Math.round((a.A[i] / 255 * (1 - pair[2]) + b.A[i] / 255 * pair[2]) * 255))));
    check(first && s0 && pair[2] > 0.3 && diff <= 1 + 255 * 0.02, `debug=sky:front: the field is the stub's front, its 'now' maps blended between the snapshots round the clock (f ${pair[2].toFixed(2)}, within ${diff} of a byte) and handed to every shader (tWxA, uSkyLow.w)`);
    const st = sky.stats(makeRig());
    check(/^low wind [\d.]+ m\/s toward \d+ deg; field \(front\): base \d+ m/.test(st) && sky.waiting === '', `what a picture reports of the sky: "${st.slice(0, 110)}..."`);
  }
  {
    const { sky, rig } = run('storm', true);
    const still = sky.field.cells(sky.t).filter((c) => c.kind === CELL_KIND.STILL);
    const c = still[0], P = at(R, c?.lat ?? 0, c?.lon ?? 0), d = len(sub(P, [rig.pos.x, rig.pos.y, rig.pos.z])), E = enu(START.lat, START.lon), v = sub(P, [rig.pos.x, rig.pos.y, rig.pos.z]);
    const bearing = (Math.atan2(dot(v, E.e), dot(v, E.n)) / D2R + 360) % 360;
    check(still.length === 1 && Math.abs(d - 8000) < 300 && Math.abs(bearing - 45) < 3 && c.stage >= 1 && c.stage < 2, `debug=storm: one mature cell standing still ${(d / 1000).toFixed(1)} km away at a bearing of ${bearing.toFixed(0)} degrees`);
  }
  {
    log = [];
    const { sky } = run('flash', true, 3);
    const f = sky.weather.flash;
    check(!!f && f.ground && f.dist < 60000 && f.held && sky.bolt.mesh.visible && G.uFlash.value.z > 0, `debug=flash on Haven: a stroke to the ground ${f ? (f.dist / 1000).toFixed(1) : '?'} km off, held at its brightest, drawn, its light on the sky (uFlash ${G.uFlash.value.z.toFixed(2)})`);
  }
  {
    const { sky } = run('noclouds,sky:storm,flash', true);
    check(!sky.field.on && !sky.weather.flash && SKY_UNIFORMS.uSkyLow.value[3] === 0, 'debug=noclouds wins over every other switch: no field, no stroke');
  }
  {
    const { sky } = run('', true);
    check(!sky.field.on && !sky.field.busy, 'with no switch Haven has no field yet (nothing on screen reads one in step 0)');
  }
  check(hourAtEpoch(haven.weather) === 15 && STUB_PRESETS.length === 4, "the stub's day: 15 h local at the weather clock's zero, so the scene's 17:00 UTC is 08:00 at the opening place");
}

console.log(failed ? `sky-system-test: ${failed} FAILED` : 'sky-system-test: all passed');
process.exit(failed ? 1 : 0);
