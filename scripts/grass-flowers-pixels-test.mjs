// Three promises of the grass and the pollen, against the game's own code (no browser, a
// few seconds):   node scripts/grass-flowers-pixels-test.mjs
// Fails (exit 1) when one is broken:
//   1. The far blades in flower (life/grass.js, the far rings): they come in where the single
//      flowers go out and as many as go, by one rule, so there is no ring where the colour
//      jumps; no blade turns from grass to flower in one step, as the eye walks through the
//      hand-over or flies low over a meadow; beyond the hand-over the same share flowers as
//      before. The lines are taken out of the shaders as the game builds them (the far ring's
//      flower lines, the single flowers' fade) and run as JavaScript: a blade's colour
//      becomes how much of the flower's colour it wears (grass 0, flower 1).
//   2. The grass and the pollen size what they draw in pixels of the picture they are drawn
//      into (post.viewH: the governor's resolution), not of the canvas, which follows the
//      picture in coarse steps and is held: the real Grass.update, then what the app does
//      after post.setScale (and that it does it there).
//   3. No pollen mote jumps when the clock of its wander comes round: the real Pollen.update
//      frame by frame for more than an hour, the wander's speeds read from its shader.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Grass } from '../src/life/grass.js';
import { Pollen } from '../src/life/pollen.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok    ' : 'BROKEN'} ${what}`); if (!ok) failed++; };

// --- a grass and its pollen, as the app makes them, over a level meadow of steppe flowers
const shared = { uGrassWave: { value: new THREE.Vector4() }, uGrassTone: { value: new THREE.Vector4() }, uWind: { value: new THREE.Vector4(0.6, 0.8, 0, 3) } };
const R = 250000, H = 100;
const terrain = {
  shared, coverSerial: 1, ringSerial: 0, tiles: { busy: false }, workers: { idle: 0 }, epoch: 0,
  hs: { radius: R, waterDepth: 0, baseSlope: 0, height: () => H, coverAt: () => 10 },
};
const grass = new Grass(terrain, shared.uWind);
grass.setWorld({ life: { grass: { below: 90, mid: 220 } }, surface: {} });
const pollen = new Pollen(grass, shared);
const rig = { agl: 1.7, pos: new THREE.Vector3(R + H + 1.7, 0, 0) };

// --- 1. the far blades' flowers
// GLSL to JavaScript, enough for lines of scalar arithmetic
const G = {
  step: (e, x) => (x < e ? 0 : 1),
  smoothstep: (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
  clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
  fract: (x) => x - Math.floor(x), floor: Math.floor, abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow, sqrt: Math.sqrt,
  mix: (a, b, t) => a + (b - a) * t, int_: Math.trunc, float_: (x) => x,
};
const toJs = (s) => s.replace(/^\s*#.*$/gm, '').replace(/\b(?:float|int|bool|vec[234])\s+(?=[A-Za-z_]\w*\s*=)/g, 'let ').replace(/\bint\(/g, 'int_(').replace(/\bfloat\(/g, 'float_(');
// the shader's one-line functions that a piece of it calls
const functionsFor = (text, piece) => [...text.matchAll(/\bfloat\s+(\w+)\s*\(([^)]*)\)\s*\{\s*return\s+([^;]+);\s*\}/g)]
  .filter((m) => piece.includes(m[1] + '(')).map((m) => `const ${m[1]} = (${m[2].split(',').map((a) => a.trim().split(/\s+/).pop()).join(', ')}) => ${toJs(m[3])};`).join('\n');
const withDefines = (s, defs) => s.replace(/\b[A-Z][A-Z0-9_]*\b/g, (n) => (n in defs && n !== 'KIND_N' ? String(defs[n]) : n));
const PRE = 'const {step, smoothstep, clamp, fract, floor, abs, min, max, pow, sqrt, mix, int_, float_} = G;';

const mid = grass.rings.find((r) => r.f.id === 'mid'), single = grass.flowers[grass.flowers.length - 1];
const vs = mid.mesh.material.vertexShader, fvs = single.mesh.material.vertexShader;
const a0 = vs.indexOf('float fk ='), a1 = vs.indexOf('#endif', a0);
let bladeFlower = null, singleKeep = null;
if (a0 < 0 || a1 < 0) check(false, 'the far ring\'s flower lines are where this test looks for them (float fk = ... #endif)');
else {
  const piece = withDefines(vs.slice(a0, a1), mid.mesh.material.defines);
  const KN = +vs.match(/const int KIND_N = (\d+);/)[1], pale = vs.match(/const float KIND_PALE\[KIND_N\] = float\[KIND_N\]\(([^)]*)\)/)[1].split(',').map(Number);
  // (a blade: its own numbers h1, u2 (the hash its flowering reads), the ground's flowers fk, how squarely the eye sees
  // the ground rise, how far off dist, the near grass kept by the traveller's height kb (uGrassKeep.x: 1 under 45 m,
  // 0 over 90 m) and which corner y (0 foot, 1 tip): how much of the flower's colour it wears)
  const f = new Function('G', 'KIND_PALE', 'KIND_N', 'h1', 'u2', 'FK_', 'rise', 'dist', 'kb', 'y',
    `${PRE} const h = { x: 0.3, y: 0.7 }, cell = 0, aBlade = 0, at = 0, tTable = 0, uTab = 0, uGrassKeep = { x: kb, y: 1 };
     const hash2 = () => ({ x: h1, y: u2 }), tableNearest = () => ({ a: FK_ }), petalColour = () => 1;
     ${functionsFor(vs, piece)}
     let alb = 0, skyShare = 0;
     ${toJs(piece)}
     return alb;`);
  bladeFlower = (h1, u2, fk, rise, dist, kb = 1, y = 1) => f(G, pale, KN, h1, u2, fk, rise, dist, kb, y);
  const ring = fvs.match(/float ring = ([^;]+);/), ringIn = fvs.match(/ring \*= ([^;]+);/), keep = fvs.match(/float keep = ([^;]+);/);
  if (!ring || !keep) check(false, 'the single flowers\' fade is where this test looks for it (float ring = ...; float keep = ...;)');
  else {
    const lines = `let ring = ${ring[1]};\n${ringIn ? `ring *= ${ringIn[1]};` : ''}\nreturn ${keep[1]};`, sub = withDefines(lines, single.mesh.material.defines);
    const k = new Function('G', 'own', 'dist', 'kb', `${PRE} const uGrassKeep = { x: kb, y: 1 }, g = { g: 1 }, h = { x: own };\n${functionsFor(fvs, sub)}\n${toJs(sub)}`);
    singleKeep = (own, dist, kb = 1) => k(G, own, dist, kb);
  }
}
if (bladeFlower && singleKeep) {
  const N = 120, us = Array.from({ length: N }, (_, i) => (i + 0.5) / N);
  const meanBlades = (fk, rise, dist, kb = 1) => { let s = 0; for (const h1 of us) for (const u2 of us) s += bladeFlower(h1, u2, fk, rise, dist, kb); return s / (N * N); };
  // (the single flowers' own numbers on a grid of their own: the two rules are not met on the same points)
  const N1 = 997, ones = Array.from({ length: N1 }, (_, i) => (i + 0.5) / N1);
  const meanSingles = (dist, kb = 1) => ones.reduce((s, o) => s + singleKeep(o, dist, kb), 0) / N1;
  const [out0, out1] = single.f.out;
  for (const fk of [2.9, 2.35]) {
    // at eye height (the ground ahead seen almost along), and from 60 and 75 m up and above 90 m, where the single
    // flowers go with the traveller's height (the far ring's blades stand from 30 m out)
    const rise = 0.03, full = meanBlades(fk, rise, out1 + 4);
    for (const kb of [1, 0.5, 0.15, 0]) {
      // (the single flowers kept, and the blades in flower as a share of all they come to: together one, everywhere)
      let lo = Infinity, loAt = 0, hi = -Infinity, hiAt = 0, line = 0, lineAt = 0, prev = null;
      for (let d = 30; d <= out1 + 12; d += 0.25) {
        const b = meanBlades(fk, rise, d, kb) / full, s = meanSingles(d, kb), sum = b + s;
        if (sum < lo) { lo = sum; loAt = d; }
        if (sum > hi) { hi = sum; hiAt = d; }
        if (prev != null && Math.abs(b - prev) > line) { line = Math.abs(b - prev); lineAt = d; }
        prev = b;
      }
      const where = kb === 1 ? 'at eye height' : `with the near grass at ${kb} for the height`;
      check(lo > 0.92 && hi < 1.08, `flowers ${fk}, ${where}: the far blades come in as the single flowers go (${out0}-${out1} m): the two together between ${(lo * 100).toFixed(1)} % (at ${loAt.toFixed(2)} m) and ${(hi * 100).toFixed(1)} % (at ${hiAt.toFixed(2)} m) of either alone`);
      check(line < 0.05, `flowers ${fk}, ${where}: no ring where the blades' colour jumps: at most ${(line * 100).toFixed(1)} % of their full share comes in over 0.25 m (at ${lineAt.toFixed(2)} m)`);
    }
    // a blade crossing the hand-over as the eye walks, 0.5 m a step
    let step = 0, stepAt = 0;
    for (const h1 of us) for (const u2 of us) {
      let p = bladeFlower(h1, u2, fk, rise, out0 - 2);
      for (let d = out0 - 1.5; d <= out1 + 2; d += 0.5) { const w = bladeFlower(h1, u2, fk, rise, d); if (Math.abs(w - p) > step) { step = Math.abs(w - p); stepAt = d; } p = w; }
    }
    check(step <= 0.5, `flowers ${fk}: walking through the hand-over no blade turns more than half way from grass to flower in a step of 0.5 m (${step.toFixed(2)}, at ${stepAt.toFixed(1)} m)`);
    // low flight over a meadow: the ground 100 m off seen from 0.1 to 0.6 of straight down, 0.005 a step (40 m up, 0.5 m a step)
    let fly = 0;
    for (const h1 of us) for (const u2 of us) {
      let p = bladeFlower(h1, u2, fk, 0.1, 100);
      for (let r = 0.105; r <= 0.6; r += 0.005) { const w = bladeFlower(h1, u2, fk, r, 100); fly = Math.max(fly, Math.abs(w - p)); p = w; }
    }
    check(fly <= 0.25, `flowers ${fk}: in low flight no blade turns from grass to flower at once (at most ${fly.toFixed(2)} of the way in a step)`);
  }
  // beyond the hand-over, the share in flower as it was: 100 m off, a third of the way to straight down (measured
  // here on the code before the fade, 41705a3: poppies thick, daisies (a pale kind, on fewer blades) thick, poppies thin)
  // (times one half since flowers-3: looked down on, a far blade's colour fades, 1 - smoothstep(0.1, 0.5, rise), and the
  // ground's tint carries the meadow there; at a third of the way to straight down that is half)
  const lookDown = 0.5, was = { 2.9: 0.5217 * lookDown, 1.9: 0.2609 * lookDown, 2.35: 0.2033 * lookDown }, M = 4000;
  for (const fk in was) {
    let m = 0; for (let i = 0; i < M; i++) m += bladeFlower((i + 0.5) / M, 0.5, +fk, 0.3, 100); m /= M;
    check(Math.abs(m - was[fk]) < 0.002, `flowers ${fk}: beyond the hand-over the same share in flower as before (${m.toFixed(4)}, was ${was[fk]})`);
  }
}

// --- 2. pixels of the picture, not of the canvas
const appSrc = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
for (const [canvasH, viewH, what] of [[1440, 1190, 'a resolution step'], [1440, 982, 'the cost test (canvas held full)'], [1115, 1440, 'a photograph (full size at once)']]) {
  const renderer = { getDrawingBufferSize: (v) => v.set(Math.round(canvasH * 2.144), canvasH), initTexture() {} };
  grass.update(rig, 1 / 30, renderer);
  // (what the app does once the picture's size for this frame is set)
  if (typeof grass.setView === 'function') grass.setView(viewH);
  const v = grass.shared.uGrassView.value;
  check(Math.abs(v - 0.5 * viewH) < 1e-9, `${what}: the grass sizes its blades in the picture's pixels (half height ${v}, the picture ${viewH} high, the canvas ${canvasH})`);
}
check(pollen.uniforms.uGrassView === grass.shared.uGrassView, 'the pollen sizes its motes by the same number');
{
  const fr = appSrc.indexOf('  frame(now) {'), sc = appSrc.indexOf('post.setScale(', fr), sv = appSrc.indexOf('this.grass.setView(post.viewH)', fr), dr = appSrc.indexOf('renderer.render(this.nearScene', fr);
  check(fr >= 0 && sc > fr && sv > sc && sv < dr, 'the app tells the grass the picture\'s height after post.setScale and before the grass is drawn');
}

// --- 3. the pollen's wander, frame by frame for 3 700 s
{
  const src = pollen.material.vertexShader;
  const m = src.match(/vec3 wander = vec3\(sin\(t \* ([\d.]+) \+ aSeed\.x \* ([\d.]+)\), cos\(t \* ([\d.]+) \+ aSeed\.y \* ([\d.]+)\), sin\(t \* ([\d.]+) \+ aSeed\.z \* ([\d.]+)\) \* ([\d.]+)\) \* \(seed \? ([\d.]+) : ([\d.]+)\)/);
  if (!m) check(false, 'the pollen\'s wander is where this test looks for it (vec3 wander = vec3(sin(t * .. + aSeed.x * ..), ...) * (seed ? .. : ..))');
  else {
    const [w1, k1, w2, k2, w3, k3, z, amp] = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => Math.fround(+m[i])), f = Math.fround;
    const seeds = [[0.13, 0.71, 0.42], [0.9, 0.05, 0.66], [0.5, 0.5, 0.5]];
    const wander = (t, s) => [Math.sin(f(f(t * w1) + f(s[0] * k1))) * amp, Math.cos(f(f(t * w2) + f(s[1] * k2))) * amp, Math.sin(f(f(t * w3) + f(s[2] * k3))) * z * amp];
    grass.update(rig, 1 / 30, { getDrawingBufferSize: (v) => v.set(3088, 1440), initTexture() {} });
    const dts = [1 / 30, 1 / 60, 1 / 45, 1 / 24];
    let t = 0, frames = 0, worst = 0, worstAt = 0, last = null, maxDt = 0, clock = 0;
    while (t < 3700) {
      const dt = dts[frames++ % dts.length]; t += dt; maxDt = Math.max(maxDt, dt);
      pollen.update(dt, 0.5);
      if (!pollen.mesh.visible) continue;
      const tw = f(pollen.uniforms.uAir.value.w); clock = Math.max(clock, tw);
      const now = seeds.map((s) => wander(tw, s));
      if (last) for (let i = 0; i < seeds.length; i++) { const d = Math.hypot(now[i][0] - last[i][0], now[i][1] - last[i][1], now[i][2] - last[i][2]); if (d > worst) { worst = d; worstAt = t; } }
      last = now;
    }
    // (the wander's own speed at most: amp x the fastest of its turns, over the longest frame)
    const bound = amp * Math.max(w1, w2, w3) * maxDt * 1.8 + 1e-4;
    check(worst <= bound, `no mote jumps in ${frames} frames over ${(t / 60).toFixed(0)} min (the wander's clock comes round at ${clock.toFixed(1)} s): at most ${(worst * 1000).toFixed(1)} mm in a frame${worst > bound ? `, at ${worstAt.toFixed(1)} s` : ''} (it moves ${(bound * 1000).toFixed(1)} mm at most)`);
  }
}

console.log(failed ? `grass flowers, pixels, pollen: ${failed} promise(s) broken` : 'grass flowers, pixels, pollen: every promise kept');
process.exit(failed ? 1 : 0);
