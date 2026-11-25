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
//        snapshot), ladder (a cloud step's setter bypassing the sky), parts (a sky part with no has()),
//        guards (the shared texts without their guards), rise (the rise's phase held at 0, as step 0
//        was first), fade (the rise's second phase dropped: one phase alone), shell (the far low shell
//        drawn before the shells above), probe (the probe's value not taken for the figure's shade),
//        frame (the sky's frame not handed to the weather), worker (the field's worker kept after a
//        switch away), hour (a cost view without an hour put at 0 h), clockpin (the route's clock left
//        as the player set it), rain (debug=noclouds leaving the rain)
//
// What is checked:
//  1. Purity: skyGlsl.js, weather/sky/producer.js and weather/sky/skyWorker.js import neither three
//     nor the DOM (the worker its own two words of a worker's API); nothing under src/sky/sky* or
//     src/weather/sky uses Math.random.
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
//     noclouds no field at all, and no rain, wet ground or rainbow either.
// 13. The shared texts are guarded: every one of them twice in one program runs, and without the
//     guards the same program is refused (a uniform or a function defined twice); no reader
//     declares the shared uniforms by a line of its own; the programs the volume, the shell and the
//     trees' shade map build declare each sky name once.
// 14. The rise: the masses' noise rises through the layer (heaps grow and fade in place), its GLSL
//     is its JS twin's, it never jumps (one phase alone does), a blend of the two phases keeps the
//     cover, and what the sky system fills is the steering's closed form.
// 15. The interfaces the packages build on: the weather gets the sky's frame (clocks, steering,
//     field, at() here, cells in reach nearest first, the strokes since the last frame within
//     reach, as the field's windows); `own` decides uWind and uWeather; the probe's value is the
//     figure's shade; the flashes reach the volume's uBolt setter; the cells and every layer's
//     steering are in SKY_UNIFORMS; the parts get the frame; D's slot and strokes; the order in the
//     picture with the far low shell after the shells above; the ground's uniforms with or
//     without the map and noise; the field's worker ended on a switch away.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { runGlsl } from './lib/glslRun.mjs';
import { sampler2D, sampler3D } from './lib/glslSamplers.mjs';
import { cloudNoiseData } from '../src/sky/cloudNoiseData.js';
import {
  steerQuat, skyToLowJS, SKY_STEER_GLSL, HEAP_GLSL, FAIR_GLSL, cloudHeapJS, SKY_UNIFORMS, makeSkyUniforms,
  SKY_FIELD_GLSL, SKY_FIELD_UNIFORMS_GLSL, skyLowJS, skyLowDensityJS, skyShadeJS, skyShadeLightJS,
  SKY_RISE_GLSL, SKY_RISE_UNIFORM_GLSL, SKY_STEER_UNIFORM_GLSL, SKY_NOISE_UNIFORM_GLSL, RISE_RULE, skyRiseOf, skyLowNoiseJS,
} from '../src/sky/skyGlsl.js';
import { Steer, mulMT, STEER_GLSL, RISE, riseWeight } from '../src/weather/sky/steer.js';
import { landFromI16, STUB_PRESETS } from '../src/weather/sky/stub.js';
import { CELL_KIND, FIELD_GLSL } from '../src/weather/sky/format.js';
import { CELL_GLSL, ANVIL_GLSL, CELL_MAX, cellGeometry, packCells } from '../src/weather/sky/cellShape.js';
import { makeProducer, hourAtEpoch } from '../src/weather/sky/producer.js';
import { SkySystem, SKY_SAVINGS, SKY_PARTS, skyDebug, NOISE_RATE_MAX, STRIKE_REACH, CELL_REACH } from '../src/sky/skySystem.js';
import { SkyField } from '../src/sky/skyField.js';
import { CloudLayer } from '../src/sky/clouds.js';
import { CloudVolume, BOLTS } from '../src/sky/cloudVolume.js';
import { TreeShade } from '../src/life/treeShade.js';
import { FEATURE_STEPS } from '../src/perf/governor.js';
import { PARTS_OUT, CostTest, Benchmark } from '../src/perf/benchmark.js';
import { G } from '../src/render/globals.js';
import { dateToJD } from '../src/core/ephemeris.js';
import haven from '../src/worlds/haven.js';
import earth from '../src/worlds/earth.js';

const argv = process.argv.slice(2), BREAK = argv.includes('--break') ? argv[argv.indexOf('--break') + 1] : null;
const BREAKS = ['quat', 'march', 'heap', 'clock', 'order', 'noclouds', 'field', 'ladder', 'parts', 'guards', 'rise', 'fade', 'shell', 'probe', 'frame', 'worker', 'hour', 'clockpin', 'rain', 'reask'];
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

if (BREAK === 'rise') { const orig = SkySystem.prototype.clockStep; SkySystem.prototype.clockStep = function (...a) { orig.apply(this, a); SKY_UNIFORMS.uCloudRise.value[0] = 0; if (this.shared.uCloudVol?.value) this.shared.uCloudVol.value.w = 0; }; }
if (BREAK === 'shell') { const orig = SkySystem.prototype.afterGround; SkySystem.prototype.afterGround = function (c) { if (c.nearVisible !== false && this.clouds.mesh.visible && this.shellScene.children.length) c.renderer.render(this.shellScene, c.rig.camera); const sc = this.shellScene.children.slice(); for (const o of sc) this.shellScene.remove(o); orig.call(this, c); for (const o of sc) this.shellScene.add(o); }; }
if (BREAK === 'probe') { const orig = SkySystem.prototype.weatherStep; SkySystem.prototype.weatherStep = function (c) { const pr = this.probe, v = pr.value; pr.value = null; try { return orig.call(this, c); } finally { pr.value = v; } }; }
if (BREAK === 'frame') { const orig = SkySystem.prototype.weatherStep; SkySystem.prototype.weatherStep = function (c) { const wx = this.weather, up = wx.update; wx.update = function (...a) { return up.apply(this, a.slice(0, 5)); }; try { return orig.call(this, c); } finally { wx.update = up; } }; }
if (BREAK === 'worker') { const orig = SkyField.prototype.setWorld; SkyField.prototype.setWorld = function (world, opts) { const w = this.worker; this.worker = null; orig.call(this, world, opts); if (!opts && w) this.worker = w; }; }
if (BREAK === 'rain') { const orig = SkySystem.prototype.weatherStep; SkySystem.prototype.weatherStep = function (c) { const wx = this.weather, keep = { rain: 0, snow: 0, veil: 0, wet: 0 }; const up = wx.update; wx.update = function (...a) { up.apply(this, a); Object.assign(keep, { rain: this.rain, snow: this.snow, veil: this.veil, wet: this.wet }); }; const r = orig.call(this, c); wx.update = up; if (this.noClouds) { Object.assign(wx, keep); G.uWeather.value.z = keep.wet; G.uWeather.value.w = keep.veil; } return r; }; }

const R = haven.radius, START = haven.scene.start, T_SCENE_MS = Date.parse(haven.scene.dateUTC);
const steer = new Steer(haven.weather, R), T0 = steer.t(T_SCENE_MS);
const noise = sampler3D(cloudNoiseData(64), 64, 2);
const vol = haven.clouds.volume, SCALE = vol.scale;

// ---- 1. purity -------------------------------------------------------------------------------
{
  const pure = ['../src/sky/skyGlsl.js', '../src/weather/sky/producer.js', '../src/weather/sky/skyWorker.js'];
  let bad = [];
  for (const f of pure) {
    let s = read(f).replace(/\/\/.*$/gm, '');
    if (f.endsWith('skyWorker.js')) s = s.replace(/\bself\.(onmessage|postMessage)\b/g, '');
    if (/from\s+['"]three['"]/.test(s) || /\b(document|window|self|navigator)\./.test(s)) bad.push(f);
  }
  check(!bad.length, `skyGlsl.js, weather/sky/producer.js and weather/sky/skyWorker.js import neither three nor the DOM${bad.length ? ': ' + bad.join(', ') : ''}`);
  const imports = [...read('../src/sky/skyGlsl.js').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  check(imports.join(',') === '../weather/sky/format.js,../weather/sky/steer.js,../weather/sky/cellShape.js', `skyGlsl.js takes only format.js (its field decoders and guard), steer.js (the rise, the layers' uniforms) and cellShape.js (the cells' uniforms): ${imports.join(', ')}`);
  const rnd = ['../src/sky/skyGlsl.js', '../src/weather/sky/producer.js', '../src/weather/sky/skyWorker.js', '../src/sky/skySystem.js', '../src/sky/skyField.js', '../src/weather/sky/steer.js', '../src/weather/sky/format.js', '../src/weather/sky/stub.js', '../src/weather/sky/cellShape.js']
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
// (what the march's functions read: its uniforms and the rise, as the march declares them)
const MARCH_HEAD = 'uniform vec4 uCloud;\n' + SKY_NOISE_UNIFORM_GLSL + SKY_RISE_UNIFORM_GLSL + SKY_RISE_GLSL;
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
    runGlsl('uniform highp sampler3D tN;\n' + heapText + '\nvec2 probe(vec3 up) { return cloudHeap(tN, up, 0.5, 0.55, 0.44, vec4(1.0, 1.0, 1.0, 0.0), vec4(0.0, 0.0, 0.0, 1.0), 1.0); }', { tN: noise });
    runGlsl(SKY_FIELD_UNIFORMS_GLSL + SKY_FIELD_GLSL, { ...uField(null), tCloudNoise: noise });
    runGlsl(MARCH_HEAD + marchFns, { uCloud: [0, 0, 1 / SCALE, 16000], tCloudNoise: noise, uCloudRise: [0, 1, 0.5, 0] });
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
    // (the shared uniforms declared only through the guarded texts, and the heaps' scales a vec4: its w the rise)
    if (/uniform\s+(highp\s+)?(vec4\s+uCloudSteer|sampler3D\s+tCloudNoise|vec4\s+uCloudRise)\b/.test(s.replace(/\/\/.*$/gm, ''))) badR.push(`${k} declares a shared uniform by a line of its own`);
    if (['terrain', 'treeShade', 'farRocks'].includes(k) && !/uniform vec4 [^;]*\buCloudVol\b/.test(s)) badR.push(`${k}'s uCloudVol is not a vec4 (the rise is its w)`);
  }
  check(!badR.length, `the ground, the trees' shade map, the far rocks, the shell and the volume all read the clouds on the steering and the rise, through the guarded uniforms${badR.length ? ': ' + badR.join('; ') : ''}`);
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
function uField(s, steerQ = [0, 0, 0, 1], on = 1, rise = 0) {
  const blank = sampler2D(new Uint8Array(4 * 2 * 2), 2, 2, 4), blankC = sampler2D(new Uint8Array(2 * 2 * 2), 2, 2, 2);
  return {
    tWxA: s ? sampler2D(s.A, s.width, s.height, 4) : blank, tWxB: s ? sampler2D(s.B, s.width, s.height, 4) : blank, tWxC: s ? sampler2D(s.C, s.cWidth, s.cHeight, 2) : blankC,
    uSkyLow: [1 / SCALE, R, haven.clouds.shadow, on], uCloudSteer: steerQ, uCloudRise: [rise, riseWeight(rise), 0.5, 0],
  };
}

// ---- 4. the shared heap rule: GLSL against JS ---------------------------------------------------------
{
  const q = steerQuat(steer.motion('low', T0));
  let worst = 0, n = 0;
  // (three phases of the rise: in the steady part, in the fade before the wrap, just after it)
  for (const a of [1700, RISE.PERIOD * (1 - 0.4 * RISE.FADE), RISE.PERIOD * 0.3 * RISE.FADE]) {
    const vv = [1 / SCALE, R / SCALE * 0.11, R + vol.base + 0.3 * vol.thick, a];
    const g = runGlsl('uniform highp sampler3D tN;\nuniform vec4 uQ;\nuniform vec4 uV;\n' + HEAP_GLSL + '\nvec2 h(vec3 up, float m, float fine) { return cloudHeap(tN, up, m, 0.55, 0.44, uV, uQ, fine); }', { tN: noise, uQ: q, uV: vv });
    for (let i = 0; i < 300; i++) {
      const up = norm(at(1, START.lat + 6 * (spread(i, 1) - 0.5), START.lon + 8 * (spread(i, 2) - 0.5))), m = spread(i, 3), fine = i % 2;
      const r1 = g.fn.h(up, m, fine), r2 = cloudHeapJS(noise, up, m, 0.55, 0.44, vv, q, fine);
      worst = Math.max(worst, Math.abs(r1[0] - r2[0]), Math.abs(r1[1] - r2[1])); n++;
    }
  }
  check(worst < 2e-3, `the shared heap rule: the GLSL gives the JS twin's heap and cover within ${worst.toExponential(1)} at ${n} places (32-bit floats), at three phases of the rise`);
}

// ---- 5. the field rule: GLSL against JS on the stub's snapshot ---------------------------------------
const LAND = landFromI16(readFileSync(new URL('../public/data/haven_dem_4096.i16', import.meta.url)), 4096, 2048);
{
  const prod = makeProducer({ preset: 'storm', weather: haven.weather, radius: R, dayHours: 24, origin: START, layout: { width: 1024, height: 512, cWidth: 512, cHeight: 256 }, land: LAND });
  const s = prod.snapshot(Math.floor(T0 / 120) * 120 + 6 * 3600);
  // (the rise in its fade: both phases read)
  const q = steerQuat(steer.motion('low', s.t)), u = uField(s, q, 1, RISE.PERIOD * (1 - 0.5 * RISE.FADE));
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
// (the rise as the sky system fills it at t: --break rise holds it at 0)
const riseAt = (t) => (BREAK === 'rise' ? 0 : skyRiseOf(steer, t)[0]);
// (dz: the height the heaps are read at raised by so much; fine: the smaller lobes too)
const heapAt = (t, dz = 0, fine = 1) => { const g = runGlsl('uniform highp sampler3D tN;\nuniform vec4 uQ;\nuniform vec4 uV;\n' + heapText + `\nvec2 h(vec3 up) { return cloudHeap(tN, up, 0.8, 0.55, 0.0, uV, uQ, ${fine.toFixed(1)}); }`, { tN: noise, uQ: quatOf(steer.motion('low', t)), uV: [1 / SCALE, R / SCALE * 0.11, R + 2100 + dz, riseAt(t)] }); return (p) => g.fn.h(norm(p))[0]; };
const marchAt = (t, cam, fine = true) => {
  const q = quatOf(steer.motion('low', t)), g = runGlsl(MARCH_HEAD + marchFns, { uCloud: [0.45, 0, 1 / SCALE, 16000], tCloudNoise: noise, uCloudRise: [riseAt(t), 1, 0.5, 0] });
  const camQ = skyToLowJS(q, cam);
  return (p) => { const d = sub(p, cam), tt = len(d), dir = d.map((x) => x / tt), dirQ = marchDirTurned ? skyToLowJS(q, dir) : dir; return g.fn.density(g.fn.marchPattern(camQ, dirQ, tt), len(p), 0.85, 0.45, fine); };
};
// where a cloud element at P0 is T s later: carried by the low wind and risen by the rise (its
// pattern point stands still: carried, then moved up by what the rise added)
const carried = (t, T, P0) => { const P1 = steer.carry('low', t, t + T, P0), up = steer.rise(t + T) - steer.rise(t), l = len(P1); return P1.map((x) => x * (l + up) / l); };
// the drift as it was (CloudVolume.render, before: q = p / scale + drift, drift added up frame by
// frame from the wind at the traveller, rig.east x 6 m/s on Haven, plus the 'change' term)
const todayAt = (seconds) => {
  const E = enu(START.lat, START.lon), drift = [0.3, 0.6, 0.1], dt = 1 / 30;
  // (Haven's 'change' was 0.009 noise units a second: the number has left its file with the term)
  for (let s = 0; s < seconds - 1e-9; s += dt) { for (let c = 0; c < 3; c++) drift[c] += E.e[c] * dt * 6 / SCALE; drift[2] += dt * 0.009; }
  return (p) => noise.sample(p.map((x, c) => x / SCALE + drift[c]))[0];
};
{
  const T = 30, E = enu(START.lat, START.lon), cam = at(R, START.lat, START.lon, 1470 + 1.7);
  // three times with a wind worth measuring at the place, days apart (and away from the rise's
  // fades: there the two phases' weights change too, which check 14 looks at)
  const ts = [];
  for (let t = T0; ts.length < 3 && t < T0 + 40 * 86400; t += 1800) { if (ts.length && t - ts[ts.length - 1] < 2.5 * 86400) continue; if (steer.windAt('low', t, START.lat, START.lon, 2100).speed >= 4 && steer.risePhases(t).wa === 1 && steer.risePhases(t + T).wa === 1) ts.push(t); }
  // (a) exact: the masses at P0 at t are at carry(P0), risen by the rise, at t + T, and read the
  // same there. (The smaller lobes go with the wind alone and the masses rise through them, so
  // with the lobes the heaps change a little as they go: that is the rise, check 14.) The shared
  // heap rule reads one height (the shell and the shadows): risen, the masses are read that much
  // higher; the march reads the point itself, carried and risen.
  const rows = [
    ['the shared heap rule (shell, ground, trees, far rocks)', (t) => heapAt(t, 0, 0), (t, T) => heapAt(t + T, steer.rise(t + T) - steer.rise(t), 0), (t, T, P0) => steer.carry('low', t, t + T, P0)],
    ["the march's density", (t) => marchAt(t, cam, false), (t, T) => marchAt(t + T, cam, false), (t, T, P0) => carried(t, T, P0)],
  ];
  for (const [name, make0, make1, where] of rows) {
    let worst = 0, moved = 0, n = 0;
    for (const t of ts) {
      const f0 = make0(t), f1 = make1(t, T);
      for (let i = 0; i < 120; i++) {
        const P0 = at(R, START.lat + 0.6 * (spread(i, 12) - 0.5), START.lon + 0.9 * (spread(i, 13) - 0.5), 2100);
        const P1 = where(t, T, P0), a = f0(P0), b = f1(P1), c = f1(P0);
        worst = Math.max(worst, Math.abs(a - b)); if (Math.abs(a - c) > 0.02) moved++; n++;
      }
    }
    check(worst < 2e-3 && moved > n * 0.3, `${name}: the masses of a cloud carried 30 s by the low wind and risen 15 m by the rise read the same where they are (worst ${worst.toExponential(1)} at ${n} places on 3 days), and ${(100 * moved / n).toFixed(0)} % of places left where they were read otherwise: the clouds moved`);
  }
  {
    // and with the lobes: a little change in 30 s, no more (the heaps growing and fading as they go)
    let worst = 0;
    const t = ts[0], f0 = marchAt(t, cam), f1 = marchAt(t + T, cam);
    for (let i = 0; i < 120; i++) { const P0 = at(R, START.lat + 0.6 * (spread(i, 12) - 0.5), START.lon + 0.9 * (spread(i, 13) - 0.5), 2100); worst = Math.max(worst, Math.abs(f0(P0) - f1(carried(t, T, P0)))); }
    check(worst < 0.5, `... and with the lobes the march's cloud carried 30 s changes by at most ${worst.toFixed(2)} (it grows and fades as it goes, it does not jump)`);
  }
  {
    let worst = 0;
    const f0 = todayAt(0), f1 = todayAt(T), t = ts[0];
    for (let i = 0; i < 120; i++) { const P0 = at(R, START.lat + 0.6 * (spread(i, 12) - 0.5), START.lon + 0.9 * (spread(i, 13) - 0.5), 2100), P1 = carried(t, T, P0); worst = Math.max(worst, Math.abs(f0(P0) - f1(P1))); }
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
  clouds.mesh = new THREE.Object3D(); clouds.mesh.visible = true;
  const cloudVolume = { busy: false, wanted: false, enabled: true, steps: 36, reach: 16000, bolts: null, args: null, setWorld() { log.push('volume.setWorld'); }, setGround() {}, place() { log.push('volume.place'); }, ready() { log.push('volume.ready'); this.wanted = true; return this.enabled; }, render(...a) { log.push('volume.render'); this.args = a; }, lay() { log.push('volume.lay'); }, layFar() { log.push('volume.layFar'); }, setBolts(list) { this.bolts = list ? list.map((b) => ({ pos: b.pos.slice(), power: b.power })) : null; } };
  const treeShade = { args: null, render(...a) { log.push('shade.render'); this.args = a; } };
  const probe = { pending: false, value: null, saving() {}, live: () => false, has: () => false, partOut() {}, update() {}, draw() {}, render() { log.push('probe.render'); } };
  const drawn = (name) => ({ name, got: null, saving() {}, live: () => false, has: () => false, partOut() {}, update(c) { this.got = c; }, draw(c, where) { log.push(`${name}.draw${where ? ' ' + where : ''}`); } });
  return { clouds, cloudVolume, treeShade, probe, upper: drawn('upper'), fog: drawn('fog'), lenses: drawn('lenses') };
}
const shared = () => ({ uCloud: { value: null }, uWind: { value: new THREE.Vector4() }, tClouds: { value: null }, uCloudHeap: { value: new THREE.Vector4() }, tCloudNoise: { value: null }, uCloudVol: { value: new THREE.Vector4() }, uCloudSteer: SKY_UNIFORMS.uCloudSteer });
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
  // the rise and every layer's steering: the closed form at the clouds' clock, in SKY_UNIFORMS and on the ground
  sky.weatherStep(ctx(sky, rig, jdOf(ms0 + 7777e3)));
  const ph = steer.risePhases(sky.noiseT), su = steer.uniforms(sky.noiseT), ru = SKY_UNIFORMS.uCloudRise.value;
  const steerOk = su.uSteerInv.every((x, k) => Math.abs(x - SKY_UNIFORMS.uSteerInv.value[k]) < 1e-6) && su.uSteerRise.every((x, k) => Math.abs(x - SKY_UNIFORMS.uSteerRise.value[k]) < 1e-3);
  check(Math.abs(ru[0] - ph.a) < 1e-3 && Math.abs(ru[1] - ph.wa) < 1e-6 && Math.abs(sky.shared.uCloudVol.value.w - ph.a) < 1e-3 && steerOk,
    `the low pattern's rise (phase ${ru[0].toFixed(1)} m, weight ${ru[1].toFixed(2)}) and every layer's steering (uSteerInv, uSteerSpin, uSteerRise) are the closed form at the clouds' clock, filled whether or not anything is drawn; the ground, trees and far rocks take the rise as uCloudVol.w`);
  // a world without clouds: everything stands still
  const still = new SkySystem({ terrain: terrain(), parts: fakeParts() }); still.setWorld({ ...haven, id: 'bare', clouds: null, weather: null }, DATA);
  still.weatherStep(ctx(still, rig, jdOf(ms0)));
  const id = SKY_UNIFORMS.uSteerInv.value;
  check(Array.from(SKY_UNIFORMS.uCloudSteer.value).join() === '0,0,0,1' && SKY_UNIFORMS.uCloudRise.value[0] === 0 && id[0] === 1 && id[4] === 1 && id[8] === 1 && id[1] === 0 && id[9] === 1,
    'a world without clouds: no steering, no rise, every layer still');
}

// ---- 8. the frame order -----------------------------------------------------------------------------------
{
  log = [];
  const parts = fakeParts(), sh = terrain(), sky = new SkySystem({ renderer: null, terrain: sh, parts });
  sky.setWorld(haven, DATA);
  const r = renderer(), rig = makeRig();
  sky.weatherScene.name = 'weather'; sky.boltScene.name = 'bolt'; sky.shellScene.name = 'shell'; sky.rain.mesh.name = 'rain-slice';
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
  // (the near scene left out, as the benchmark's 'ground' and 'everything' rows do: the far low shell with it)
  sky.afterGround({ renderer: r, rig, near: 1, far: 1e6, nearVisible: false });
  const aOut = log.slice(); log = [];
  sky.rain.mesh.visible = true;
  sky.drawWeather({ renderer: r, rig, aspect: 2, near: 5, far: 1e6 });
  const dw = log.slice();
  check(b.join(',') === 'volume.place,clouds.update,volume.ready,shade.render,probe.render,volume.render', `before the main picture: ${b.join(' > ')}`);
  check(gOk, 'the ground is handed the layer\'s map, noise and heaps');
  check(a.join(',') === 'volume.layFar,upper.draw above,render shell,fog.draw,lenses.draw,render bolt,volume.lay,upper.draw below',
    `in the picture after the ground, the plan's order: far cell sheets, shells above, the far low shell, fog and lenses, the bolt slot, the near slices, shells below (${a.join(' > ')})`);
  check(!aOut.includes('render shell') && aOut.includes('volume.lay'), "... and with the near scene left out the far low shell is not drawn either (as when it was in the near scene)");
  check(dw[0] === 'render weather' && dw.includes('render rain-slice') && dw[1].startsWith('finalize 0.2'), `the weather scene, then the rain in its own slice from the eye (${dw.join(' > ')})`);
  check(sh.shared.uCloud.value === parts.clouds.shadow, "the ground's cloud shadow is the shell's own numbers (one object)");
  check(sky.shellScene.children.includes(parts.clouds.mesh), 'the far low shell is in the sky\'s shell scene (not the near scene)');
  // noclouds
  log = [];
  const p2 = fakeParts(), sh2 = terrain(), sky2 = new SkySystem({ terrain: sh2, parts: p2, debug: 'noclouds' });
  sky2.setWorld(haven, DATA);
  G.uWeather.value.set(0.3, 0.4, 0, 0);
  // (a weather that answers here, in its shade and its rain: Earth's in a storm)
  sky2.weather.def = { fake: true }; sky2.weather.own = true; sky2.weather.sunShade = 0.3; sky2.weather.skyShade = 0.4;
  sky2.weather.update = function () { this.rain = 5; this.snow = 1; this.veil = 0.4; this.wet = 0.7; };
  if (BREAK === 'noclouds') sky2.noClouds = false;
  sky2.weatherStep(ctx(sky2, makeRig(), jdOf(T_SCENE_MS)));
  sky2.beforeScene({ renderer: renderer(), post: {}, rig: makeRig(), worldRadius: R, time: 3, treesWanted: true });
  sky2.groundUniforms();
  const none = !p2.clouds.mesh.visible && p2.clouds.shadow.x === 0 && sh2.shared.uCloudHeap.value.w === 0 && !log.includes('volume.render') && G.uWeather.value.x === 1 && G.uWeather.value.y === 1 && !sky2.field.on;
  check(none, 'debug=noclouds: no shell, no volume, no shadow on the ground, trees or rocks, none of the clouds\' shade on the figure, no field');
  const wx2 = sky2.weather;
  check(wx2.rain === 0 && wx2.snow === 0 && G.uWeather.value.z === 0 && G.uWeather.value.w === 0 && !sky2.rainbow.mesh.visible,
    `debug=noclouds: no rain or snow (the streaks, the veil and the rain's sound read these), no wet ground, no rainbow (rain ${wx2.rain}, veil ${G.uWeather.value.w}, wet ${G.uWeather.value.z})`);
}

// ---- 9. the governor ---------------------------------------------------------------------------------
{
  // (the order of fix/governor10, the tenth phone results: the steps that bought nothing go last)
  const LADDER = ['grass-mid', 'trees-far', 'far-trees', 'tree-leaves', 'grass', 'pollen', 'cloud-upper', 'rain-shafts', 'cloud-shade-rate', 'terrain-1', 'terrain-2', 'cloud-shade-coarse', 'clouds', 'far-relief', 'cloud-volume', 'cloud-steps', 'cloak', 'fine-shadows', 'bloom', 'detail', 'soft-shadows', 'contact', 'edge-glow', 'dust', 'rocks', 'far-rock-shadows', 'far-rocks', 'rain', 'leaves', 'sun-beams', 'air-shadow', 'tree-shadows'];
  check(FEATURE_STEPS.map((f) => f.id).join(',') === LADDER.join(','), "the governor's ladder: as it was, with the plan's four sky steps (cloud-upper, rain-shafts, cloud-shade-rate in the second group, cloud-shade-coarse before 'clouds')");
  // the plan's four: through the sky's setters; not live and not built while their parts are stand-ins
  {
    const four = ['cloud-upper', 'rain-shafts', 'cloud-shade-rate', 'cloud-shade-coarse'], sk = new SkySystem({ terrain: terrain(), parts: fakeParts() });
    sk.setWorld(haven, DATA);
    const calls4 = [], app4 = { sky: { setSaving(id, off) { calls4.push(`${id}:${off}`); sk.setSaving(id, off); }, live: (id) => sk.live(id), hasSaving: (id) => sk.hasSaving(id) } };
    for (const id of four) { const f = FEATURE_STEPS.find((x) => x.id === id); f.apply(app4, true); f.apply(app4, false); }
    const passed = four.every((id) => { const f = FEATURE_STEPS.find((x) => x.id === id); return f.live(app4) === false && f.has(app4) === false; });
    check(calls4.length === 8 && passed && sk.clouds.shadows !== false, `the plan's four sky steps go through the sky's setters and are passed by (not live, not built) while their parts are stand-ins; 'cloud-shade-coarse' does not take the shadows away (${calls4.join(' ')})`);
  }
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
  // a view that names no hour keeps the first bookmark's (Earth's 'in the hurricane' and 'in the forest' at the ledge's -1.2 h, as before)
  {
    const ct2 = Object.create(CostTest.prototype);
    Object.assign(ct2, { app, bench, g, views: [{ world: 'haven', name: 'y', bookmark: 'ledge', lat: -48.5, lon: 49, heading: 0, pitch: 0 }], vi: 0, state: 'settle', placed: false, t0: performance.now(), parts: [], configs: [] });
    app.timeOffsetHours = -1.2;
    if (BREAK === 'hour') ct2.views[0].timeOffsetHours = 0;
    ct2.update();
    check(app.timeOffsetHours === -1.2, `a cost view without an hour keeps the bookmark's (${app.timeOffsetHours} h)`);
  }
  // the steps not built yet are not measured
  const stubIdx = FEATURE_STEPS.map((f, i) => (f.has && !f.has(app) ? i : -1)).filter((i) => i >= 0);
  check(stubIdx.length === 4 && !ct.configs.some((c) => stubIdx.includes(c[0])), `the cost test measures no step that is not built yet (${stubIdx.map((i) => FEATURE_STEPS[i].id).join(', ')})`);
  ct.restore();
  check(app.paused === false, '... and let go again when the test is over');
  // the route's clock is pinned: the game's own pace whatever the player had, given back at the end
  {
    const appB = { timeRate: 600, paused: true, loadWorldData: () => Promise.resolve(), profile: { total: new Float64Array(64) }, terrain: { rebakes: 0, built: 0, buildMs: 0 }, governor: { log: [], fresh() {} }, world: { id: 'haven' }, hiddenCount: 0, setHero() {}, onBenchmarkDone() {}, input: { virtualDown() {}, virtualUp() {} } };
    const b = new Benchmark(appB);
    if (BREAK === 'clockpin') { const st = b.start; b.start = function (k) { const r = appB.timeRate, pz = appB.paused; st.call(this, k); appB.timeRate = r; appB.paused = pz; }; }
    b.start('haven');
    const during = [appB.timeRate, appB.paused];
    b.report = () => '';
    b._finish(true);
    check(during[0] === 1 && during[1] === false && appB.timeRate === 600 && appB.paused === true, `the benchmark's route runs on a pinned clock (x${during[0]}, ${during[1] ? 'stopped' : 'running'}) whatever the player had set, and gives the player's clock back at the end (x${appB.timeRate}, ${appB.paused ? 'stopped' : 'running'})`);
  }
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
    // (sky B: the field is always on where the weather is made by rule: the clouds draw from it)
    check(sky.field.on || sky.field.busy, 'with no switch Haven has its field: the weather made by rule (sky B: the clouds draw from it)');
  }
  check(hourAtEpoch(haven.weather) === 15 && STUB_PRESETS.length === 4, "the stub's day: 15 h local at the weather clock's zero, so the scene's 17:00 UTC is 08:00 at the opening place");
}

// ---- 13. the shared texts are guarded -------------------------------------------------------------
{
  const unguard = (t) => t.replace(/^#(ifndef|define|endif)\b.*$/gm, '');
  const g = (t) => (BREAK === 'guards' ? unguard(t) : t);
  // every shared text twice, in the order a reader might take them (the shared rule, then the field's, then the cells', then again)
  const all = [SKY_STEER_UNIFORM_GLSL, SKY_NOISE_UNIFORM_GLSL, SKY_RISE_UNIFORM_GLSL, SKY_FIELD_UNIFORMS_GLSL, HEAP_GLSL, SKY_FIELD_GLSL, SKY_RISE_GLSL, SKY_STEER_GLSL, FAIR_GLSL, FIELD_GLSL, STEER_GLSL, CELL_GLSL, ANVIL_GLSL];
  const prog = [...all, ...all].map(g).join('\n');
  const u = { ...uField(null), tCloudNoise: noise, ...Object.fromEntries(Object.entries(SKY_UNIFORMS).filter(([k]) => /^u(Steer|Cell|Anvil)/.test(k)).map(([k, v]) => [k, v.value])) };
  let err = '';
  try { runGlsl(prog, u); } catch (e) { err = e.message; }
  check(!err, `every shared text (${all.length}) taken twice in one program runs: their uniforms and functions are declared once${err ? ': ' + err : ''}`);
  let err2 = '';
  try { runGlsl([...all, ...all].map(unguard).join('\n'), u); } catch (e) { err2 = e.message; }
  check(/defined twice/.test(err2), `... and without the guards the same program is refused, as a GPU would refuse it (${err2.slice(0, 70)})`);
  // the programs the volume, the shell and the trees' shade map build: each sky name declared once
  const names = ['uCloudSteer', 'tCloudNoise', 'uCloudRise', 'uSkyLow', 'tWxA', 'uCells', 'uSteerInv'];
  const fns = ['skyToLow', 'fairCover', 'cloudHeap', 'skyLowNoise', 'skyRiseWeight', 'skyLow', 'wxRead', 'steerLow', 'cellDensity'];
  const once = (src) => {
    // (the sky's own guards resolved; nothing else in these programs is guarded by SKY_ names)
    const out = [], defs = new Set(), live = [];
    for (const line of g(src).split('\n')) {
      const m = /^\s*#\s*(ifndef|ifdef|define|endif|else)\s*(\w*)/.exec(line);
      const sky = m && (m[1] === 'endif' || m[1] === 'else' ? live.length && live[live.length - 1].sky : /^SKY_/.test(m[2]));
      if (m && sky) {
        if (m[1] === 'ifndef') live.push({ sky: true, on: !defs.has(m[2]) }); else if (m[1] === 'ifdef') live.push({ sky: true, on: defs.has(m[2]) });
        else if (m[1] === 'else') live[live.length - 1].on = !live[live.length - 1].on; else if (m[1] === 'endif') live.pop(); else if (live.every((x) => x.on)) defs.add(m[2]);
        continue;
      }
      if (m && (m[1] === 'ifdef' || m[1] === 'ifndef')) live.push({ sky: false, on: true }); else if (m && m[1] === 'endif') live.pop();
      if (live.every((x) => x.on)) out.push(line);
    }
    const code = out.join('\n').replace(/\/\/.*$/gm, '');
    const twice = [];
    for (const n of names) { const k = (code.match(new RegExp(`uniform\\s+(?:highp\\s+)?\\w+\\s+${n}\\b`, 'g')) || []).length; if (k > 1) twice.push(`uniform ${n} x${k}`); }
    for (const f of fns) { const k = (code.match(new RegExp(`\\b(?:float|vec[234]|void|bool)\\s+${f}\\s*\\([^)]*\\)\\s*\\{`, 'g')) || []).length; if (k > 1) twice.push(`${f}() x${k}`); }
    return twice;
  };
  const cv = new CloudVolume(null), cl = new CloudLayer(null), ts = new TreeShade({ shared: { tClouds: { value: null }, tCloudNoise: { value: null }, uCloud: { value: null }, uCloudHeap: { value: null }, uCloudVol: { value: null }, uCloudSteer: SKY_UNIFORMS.uCloudSteer } });
  const progs = { 'the march': cv.march.fragmentShader, 'the far shell': cl.mesh.material.fragmentShader, "the trees' shade map": ts.material.fragmentShader };
  const bad = Object.entries(progs).map(([k, src]) => [k, once(src + (BREAK === 'guards' ? '\n' + SKY_STEER_GLSL : ''))]).filter(([, t]) => t.length);
  check(!bad.length, `the programs of the march, the far shell and the trees' shade map declare each of the sky's names once${bad.length ? ': ' + bad.map(([k, t]) => `${k}: ${t.join(', ')}`).join('; ') : ''}`);
}

// ---- 14. the rise ---------------------------------------------------------------------------------
{
  // the noise's mean, which the blend of the two phases is stretched about
  const data = cloudNoiseData(64); let sum = 0; for (let i = 0; i < data.length; i += 2) sum += data[i] / 255;
  const mean = sum / (data.length / 2);
  check(Math.abs(mean - RISE_RULE.NOISE_MEAN) < 0.002 && RISE_RULE.PERIOD === RISE.PERIOD && RISE_RULE.FADE === RISE.FADE, `the rise's numbers are steer.js's (a period of ${RISE.PERIOD} m, fading over ${RISE.FADE * 100} % of it), the noise's mean ${mean.toFixed(4)} (the rule takes ${RISE_RULE.NOISE_MEAN})`);
  // its GLSL against its JS, over a whole period
  const fadeText = BREAK === 'fade' ? SKY_RISE_GLSL.replace('if (wa < 1.0) {', 'if (wa < -1.0) {') : SKY_RISE_GLSL;
  const g = runGlsl('uniform highp sampler3D tN;\n' + fadeText + '\nfloat f(vec3 q, float r, float a) { return skyLowNoise(tN, q, r, a); }\nfloat w(float a) { return skyRiseWeight(a); }', { tN: noise });
  let worst = 0, ww = 0;
  for (let i = 0; i < 400; i++) {
    const a = RISE.PERIOD * i / 400, P = at(R, START.lat + spread(i, 1) - 0.5, START.lon + spread(i, 2) - 0.5, 1500 + 1500 * spread(i, 3)), r = len(P), q = P.map((x) => x / SCALE);
    worst = Math.max(worst, Math.abs(g.fn.f(q, r, a) - skyLowNoiseJS(noise, q, r, a))); ww = Math.max(ww, Math.abs(g.fn.w(a) - riseWeight(a)));
  }
  check(worst < 2e-3 && ww < 1e-6, `skyLowNoise and skyRiseWeight: the GLSL gives the JS twin's within ${worst.toExponential(1)} over a whole period (the weight within ${ww.toExponential(1)})`);
  // what a frame hands over is the steering's own phases
  let off = 0;
  for (let i = 0; i < 50; i++) { const t = T0 + i * 977.3, ph = steer.risePhases(t), r = skyRiseOf(steer, t); off = Math.max(off, Math.abs(r[0] - ph.a), Math.abs(r[1] - ph.wa)); }
  check(off < 1e-3, `skyRiseOf hands the shaders steer.js's phase and weight (within ${off.toExponential(1)})`);
  // no jump: down a fixed pattern point, along the clock across two wraps, 10 s a step
  const pts = []; for (let i = 0; i < 60; i++) pts.push(at(R, START.lat + 0.3 * (spread(i, 4) - 0.5), START.lon + 0.4 * (spread(i, 5) - 0.5), 2100).map((x) => x / SCALE));
  const rr = R + 2100, read = (a, q) => (BREAK === 'fade' ? g.fn.f(q, rr, a) : skyLowNoiseJS(noise, q, rr, a));
  const one = (a, q) => { const k = 1 - a / rr; return noise.sample([q[0] * k, q[1] * k, q[2] * k])[0]; };
  let jump = 0, oneJump = 0, wraps = 0, prev = null;
  for (let t = T0; t < T0 + 2.2 * RISE.PERIOD / steer.cfg.rise; t += 10) {
    const a = steer.risePhases(t).a;
    if (prev != null) {
      if (a < prev) wraps++;
      for (const q of pts) { jump = Math.max(jump, Math.abs(read(a, q) - read(prev, q))); oneJump = Math.max(oneJump, Math.abs(one(a, q) - one(prev, q))); }
    }
    prev = a;
  }
  check(wraps >= 2 && jump < 0.06, `the rise never jumps: over ${wraps} wraps of its phase, 10 s apart, the masses' noise at a point changes by at most ${jump.toFixed(3)}`);
  check(oneJump > 0.15, `... where its first phase read alone would jump at the wrap (${oneJump.toFixed(2)})`);
  // the heaps grow and fade in place: in the pattern's own frame (carried with the wind), 20 min apart
  const hp = (t, P) => { const c = 0.5, n = skyLowNoiseJS(noise, P.map((x) => x / SCALE), len(P), BREAK === 'rise' ? 0 : skyRiseOf(steer, t)[0]); return Math.min(1, Math.max(0, (n - (1 - c) * 0.85) / Math.max(c * 0.85 + 0.15, 0.2) * 2.2)); };
  let grew = 0, n = 0;
  const tA = ts0(), tB = tA + 1200;
  for (let i = 0; i < 300; i++) { const P = at(R, START.lat + 0.4 * (spread(i, 6) - 0.5), START.lon + 0.6 * (spread(i, 7) - 0.5), 1900 + 900 * spread(i, 8)); if (Math.abs(hp(tA, P) - hp(tB, P)) > 0.2) grew++; n++; }
  check(grew > n * 0.1, `the heaps grow and fade in place as they go: ${(100 * grew / n).toFixed(0)} % of places in the low pattern's own frame change by more than 0.2 of a heap in 20 minutes`);
  // a blend of the two phases keeps the cover (the plain blend would lose most of it)
  const cover = (wa, stretch) => {
    let k = 0, m = 0;
    for (let i = 0; i < 4000; i++) {
      const q = [spread(i, 9) * 7, spread(i, 10) * 7, spread(i, 11) * 7], A = noise.sample(q)[0], B = noise.sample([q[0] + 0.37, q[1] + 0.21, q[2] + 0.5])[0];
      let x = wa * A + (1 - wa) * B; if (stretch) x = RISE_RULE.NOISE_MEAN + (x - RISE_RULE.NOISE_MEAN) / Math.hypot(wa, 1 - wa);
      if ((x - 0.5 * 0.85) / 0.575 * 2.2 > 0.3) k++; m++;
    }
    return k / m;
  };
  const c1 = cover(1, true), cHalf = cover(0.5, true), cPlain = cover(0.5, false);
  check(cHalf > 0.75 * c1 && cPlain < 0.6 * c1, `halfway through a fade the heaps keep ${(100 * cHalf / c1).toFixed(0)} % of their cover (a plain blend: ${(100 * cPlain / c1).toFixed(0)} %)`);
}
function ts0() { let t = T0; while (steer.risePhases(t).wa < 1 || steer.risePhases(t + 1200).wa < 1) t += 600; return t; }

// ---- 15. the interfaces the packages build on -------------------------------------------------------
{
  // a run of frames of the stub's storm (not a picture: strokes strike by the clock)
  const parts = fakeParts(), sky = new SkySystem({ terrain: terrain(), parts, debug: 'sky:storm' });
  sky.setWorld(haven, DATA);
  const got = [];
  const realUpdate = sky.weather.update;
  sky.weather.update = function (...a) { got.push(a); return realUpdate.apply(this, a); };
  const strikes = []; let frames = 0, ms = T_SCENE_MS + 7 * 3600e3;          // (15 h at the opening place: the stub's storm is up)
  const rig = makeRig();
  for (let i = 0; i < 90; i++, ms += 1000) { sky.weatherStep(ctx(sky, rig, jdOf(ms), { now: 1000 + i * 1000 })); for (const st of sky.frame.strikes) strikes.push(st); frames++; }
  const last = got[got.length - 1] || [], fr = last[5];
  check(fr === sky.frame && typeof fr.t === 'number' && fr.tPrev != null && fr.steer === sky.steer && fr.field === sky.field && fr.here && fr.here === sky.here,
    'the weather is handed the sky\'s frame each frame: the weather clock and the one before, the steering, the field and at() at the traveller');
  const cells = sky.frame.cells, sorted = cells.every((c, k) => k === 0 || cells[k - 1].dist <= c.dist), inReach = cells.every((c) => c.dist <= CELL_REACH);
  const all = sky.field.cells(sky.t).length;
  check(cells.length > 0 && sorted && inReach && cells.length <= all, `... and the live cells a traveller here can see the top of, nearest first, within ${CELL_REACH / 1000} km (${cells.length} of ${all})`);
  // the strokes: the field's windows, split by the frames, within reach
  const want = sky.field.strikes(sky.steer.t(T_SCENE_MS + 7 * 3600e3), sky.t).filter((s) => sky._strikeDist(s, rig) <= STRIKE_REACH);
  const key = (s) => `${s.cell}:${s.t.toFixed(4)}`, gotK = strikes.map(key).sort().join(), wantK = want.map(key).sort().join();
  check(want.length > 0 && gotK === wantK && strikes.every((s) => s.dist <= STRIKE_REACH && s.pos.length === 3), `... and the strokes since the last frame within ${STRIKE_REACH / 1000} km, each with its place: ${strikes.length} over ${frames} frames, the same as the field's whole window`);
  // the cells into SKY_UNIFORMS, as cellShape packs them
  const expect = new Float32Array(SKY_UNIFORMS.uCells.value.length); packCells(cells.slice(0, CELL_MAX).map((c) => cellGeometry(c, R)), expect);
  const packed = SKY_UNIFORMS.uCells.value, same = expect.every((x, k) => Math.abs(x - packed[k]) <= 1e-3 * Math.max(1, Math.abs(x)));
  check(SKY_UNIFORMS.uCellCount.value === Math.min(CELL_MAX, cells.length) && same, `the nearest ${SKY_UNIFORMS.uCellCount.value} cells are in SKY_UNIFORMS' uCells, as cellShape.js packs them (CELL_GLSL reads them)`);
  // a weather that takes the strokes itself: the stand-in leaves the flash to it
  sky.weather.takesStrikes = true; sky.weather.flash = null; sky.flashOwn = null;
  for (let i = 0; i < 20; i++, ms += 1000) sky.weatherStep(ctx(sky, rig, jdOf(ms)));
  check(sky.flashOwn === null, "a weather that takes the strokes itself (D: takesStrikes) gets them in the frame, and the stand-in makes no flash of its own");
  sky.weather.takesStrikes = false;
  // the parts get the frame
  sky.beforeScene({ renderer: renderer(), post: {}, rig, worldRadius: R, time: 3, treesWanted: true });
  check(parts.upper.got?.sky === sky.frame && parts.cloudVolume.args?.[6] === sky.frame && parts.treeShade.args?.[4] === sky.frame, 'the parts get the frame: c.sky in their update, the last argument of the volume\'s render and of the shade map\'s render');
}
{
  // own: whether the weather's wind and shade are taken
  const parts = fakeParts(), sh = terrain(), sky = new SkySystem({ terrain: sh, parts });
  sky.setWorld(haven, DATA);
  const wx = sky.weather, rig = makeRig();
  wx.update = function () { this.wind.set(0, 0, 1); this.windSpeed = 9; this.sunShade = 0.3; this.skyShade = 0.6; this.wet = 0.5; this.veil = 0.2; };
  sky.weatherStep(ctx(sky, rig, jdOf(T_SCENE_MS)));
  const off = sh.shared.uWind.value.x === rig.east[0] && sh.shared.uWind.value.y === rig.east[1] && G.uWeather.value.x === 1 && G.uWeather.value.z === 0;
  wx.own = true;
  sky.weatherStep(ctx(sky, rig, jdOf(T_SCENE_MS)));
  const on = sh.shared.uWind.value.z === 1 && sh.shared.uWind.value.w === 9 && Math.abs(G.uWeather.value.x - 0.3) < 1e-6 && Math.abs(G.uWeather.value.z - 0.5) < 1e-6;
  check(off && on, "a weather that does not answer here (own false): the steady breeze and no shade; one that does (D on Haven, Earth's maps): its wind, shade, wet ground and veil");
  // the probe's value is the figure's shade
  parts.probe.value = { sun: 0.15, sky: 0.45 };
  sky.weatherStep(ctx(sky, rig, jdOf(T_SCENE_MS)));
  check(Math.abs(G.uWeather.value.x - 0.15) < 1e-6 && Math.abs(G.uWeather.value.y - 0.45) < 1e-6, `the shade probe's value (C) is the shade on the figure and the things near it: uWeather ${G.uWeather.value.x.toFixed(2)}, ${G.uWeather.value.y.toFixed(2)}`);
  parts.probe.value = null;
  // the flashes reach the volume's uBolt setter (a weather that takes the strokes itself, as D's
  // does: with the field always on the stand-in would set the flash from the field's own strokes)
  const tsWas = wx.takesStrikes; wx.takesStrikes = true;
  wx.flash = null; wx.bolts = [{ pos: [1, 2, 3], power: 4 }];
  sky.weatherStep(ctx(sky, rig, jdOf(T_SCENE_MS)));
  const fromD = parts.cloudVolume.bolts?.length === 1 && parts.cloudVolume.bolts[0].power === 4;
  wx.bolts = null; wx.update = function () { this.flash = { dir: new THREE.Vector3(0, 0, 1), dist: 5000, ground: false, power: 1 }; this.flashLight.set(0, 0, 0.5); };
  sky.weatherStep(ctx(sky, rig, jdOf(T_SCENE_MS)));
  const b = parts.cloudVolume.bolts?.[0], fromFlash = b && Math.abs(b.pos[2] - (rig.pos.z + 5000)) < 1e-6 && Math.abs(b.power - 3) < 1e-9;
  wx.update = function () { this.flash = { dir: new THREE.Vector3(0, 0, 1), dist: 5000, ground: true, power: 1 }; this.flashLight.set(0, 0, 0.5); };
  sky.weatherStep(ctx(sky, rig, jdOf(T_SCENE_MS)));
  const ground = parts.cloudVolume.bolts === null;
  wx.takesStrikes = tsWas;
  const cv = new CloudVolume(null); cv.setBolts([{ pos: [0, 0, 0], power: 1 }, { pos: [1, 0, 0], power: 0 }, { pos: [2, 0, 0], power: 2 }, { pos: [3, 0, 0], power: 3 }]);
  check(fromD && fromFlash && ground && cv.bolts.length === BOLTS && cv.bolts[1].power === 2, `the flashes reach the volume's uBolt setter: D's list, else a flash in the cloud (where it is, x6 its light), none for a stroke to the ground; the volume keeps ${BOLTS} of power`);
  // D's strokes have a slot of their own
  const bolt = { mesh: new THREE.Object3D(), slot: new THREE.Object3D(), update() {} };
  const skyD = new SkySystem({ terrain: terrain(), parts: { ...fakeParts(), bolt } });
  check(skyD.boltScene.children.includes(bolt.slot) && skyD.weatherScene.children.includes(bolt.mesh), "D's ribbons (bolt.slot) are drawn in the bolt slot, before the near slices");
}
{
  // the ground's uniforms, with or without the map and the noise (C takes them away)
  const parts = fakeParts(), sh = terrain(), sky = new SkySystem({ terrain: sh, parts });
  sky.setWorld(haven, DATA);
  sky.weatherStep(ctx(sky, makeRig(), jdOf(T_SCENE_MS + 3e6)));
  sky.beforeScene({ renderer: renderer(), post: {}, rig: makeRig(), worldRadius: R, time: 3, treesWanted: true });
  sky.groundUniforms();
  const w = sh.shared.uCloudVol.value.w === SKY_UNIFORMS.uCloudRise.value[0];
  delete sh.shared.tClouds; delete sh.shared.tCloudNoise;
  let threw = ''; try { sky.groundUniforms(); } catch (e) { threw = e.message; }
  let mine = false; parts.treeShade.groundUniforms = (s2, fr) => { mine = s2 === sh.shared && fr === sky.frame; };
  sky.groundUniforms();
  check(w && !threw && mine, `the ground's uniforms: the rise as uCloudVol.w; a ground without the map and the noise is left alone${threw ? ' (it threw: ' + threw + ')' : ''}; a shade map with its own groundUniforms (C) writes them instead`);
}
{
  // the field's worker ends when the field does
  const saved = globalThis.Worker; let made = 0, ended = 0;
  globalThis.Worker = class { constructor() { made++; } postMessage() {} terminate() { ended++; } };
  try {
    const f = new SkyField(null);
    f.setWorld(haven, { preset: 'fair', land: { data: new Int16Array(8), width: 4, height: 2, scale: 1 } });
    const had = !!f.worker;
    f.setWorld(null, null);
    check(made === 1 && had && ended === 1 && f.worker === null, `the field's worker (and its copy of the land) is ended when the field is: a switch away, or no field (${made} made, ${ended} ended)`);
  } finally { if (saved === undefined) delete globalThis.Worker; else globalThis.Worker = saved; }
}

{
  // (sky A) a worker started anew (the land's file arriving) is asked again: the question put to
  // the one it replaces is never answered (the model's field once waited for ever on it)
  const saved = globalThis.Worker; const made = [];
  globalThis.Worker = class { constructor() { this.asked = []; made.push(this); } postMessage(m) { if (m.kind === 'snap') this.asked.push(m.t); } terminate() {} };
  try {
    const f = new SkyField(null);
    f.setWorld(haven, { preset: 'fair', land: { data: new Int16Array(8), width: 4, height: 2, scale: 1 } });
    f.update(1000);
    const was = f.asking;
    f._make(f.opts);                       // what the land's arrival does
    if (BREAK === 'reask') f.asking = was;
    f.update(1000.5);
    check(made.length === 2 && made[0].asked.length === 1 && made[1].asked.length === 1, `a worker started anew is asked for the snapshot again (asked of the first ${made[0]?.asked.length}, of the second ${made[1]?.asked.length})`);
  } finally { if (saved === undefined) delete globalThis.Worker; else globalThis.Worker = saved; }
}

console.log(failed ? `sky-system-test: ${failed} FAILED` : 'sky-system-test: all passed');
process.exit(failed ? 1 : 0);
