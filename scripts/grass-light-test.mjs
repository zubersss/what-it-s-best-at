// The grass's light table (life/grass.js, renderLight) against its promises, without a
// browser (a few seconds): node scripts/grass-light-test.mjs
// The real Grass and Pollen are built in Node over a level stub of ground with grass all
// over it, flown up and down and moved about, and the light pass is drawn into a renderer
// that only writes down what it is asked to draw (where, and with which shader). Fails
// (exit 1) when a promise is broken:
//   - every row of the table that something drawn this frame reads (a ring of blades, the
//     clumps, the flowers, the pollen) is drawn in this frame, in all three of its parts:
//     after a climb, a dive, a jump to another place, the governor's clumps put back;
//   - nothing is drawn when nothing reads it (from 220 m to 3 km up the grass is only the
//     ground's colour), and no row beyond those read;
//   - a pixel works out only the number it keeps: the Sun's light only in the Sun's third,
//     the sky's only in the sky's, the air between looked up once, not twice;
//   - the air's two numbers taken from one look (hazeAffine) are those of the two looks it
//     replaces (aerialPerspective of black and of white) as near as 32-bit floats allow,
//     and the same in the half floats the table holds. (A replay of the shader's arithmetic,
//     which cannot run here: it checks first that the shader still says what it replays.)
import * as THREE from 'three';
import { Grass } from '../src/life/grass.js';
import { Pollen } from '../src/life/pollen.js';
import { LIGHTING_PARS } from '../src/render/lightingGlsl.js';

let failed = 0;
const broken = new Map();
const check = (ok, what) => { if (!ok) { failed++; broken.set(what, (broken.get(what) || 0) + 1); } };

// --- a world of grass: level ground 100 m over the datum, grassland everywhere
const R = 250000, GROUND = 100;
const shared = { uGrassTone: { value: new THREE.Vector4() }, uGrassWave: { value: new THREE.Vector4() }, uWind: { value: new THREE.Vector4(0.6, 0.8, 0, 3) } };
const hs = { radius: R, waterDepth: 0, baseSlope: 0.05, height() { return GROUND; }, coverAt() { return 10; } };
const terrain = { shared, hs, coverSerial: 1, ringSerial: 1, tiles: { busy: false }, workers: { idle: 0, run: () => null }, epoch: 1 };
const grass = new Grass(terrain, shared.uWind);
grass.setWorld({ life: { grass: { below: 90, mid: 220 } }, surface: {} });
const pollen = new Pollen(grass, shared);

// --- a renderer that writes down what it is asked to do (three applies a target's viewport
// and scissor when the target is set, and a clear ignores the viewport)
const log = [];
const renderer = {
  target: null, vp: null, sc: null, st: false,
  getDrawingBufferSize: (v) => v.set(1760, 824),
  initTexture() {},
  setRenderTarget(t) { this.target = t; this.vp = t ? t.viewport.clone() : null; this.sc = t ? t.scissor.clone() : null; this.st = t ? t.scissorTest : false; },
  clear() { log.push({ clear: true, target: this.target }); },
  render(obj) { log.push({ target: this.target, vp: this.vp.clone(), sc: this.sc.clone(), st: this.st, frag: obj.material.fragmentShader }); },
};
const camera = new THREE.PerspectiveCamera(60, 2.14, 0.5, 1e6);

// --- what a light shader's main() works out
const N = grass.light.width / 3, ROWS = grass.light.height / N;
const parts = new Map();
function partsOf(frag) {
  if (parts.has(frag)) return parts.get(frag);
  const main = frag.slice(frag.lastIndexOf('void main()')).replace(/\/\/.*$/gm, '');
  const p = { sun: /\b(directSun|nearShadow)\s*\(/.test(main), sky: /\bskyLight\s*\(/.test(main), haze: (main.match(/\b(aerialPerspective|hazeOverGround|hazeOverGroundFull|hazeAffine|froxelHaze)\s*\(/g) || []).length };
  // what it writes: one number ('sun', 'sky', 'air'), or each third its own (a choice by the pixel's third)
  const out = (main.match(/fragColor\s*=\s*vec4\(\s*\(?\s*([A-Za-z_]\w*)/) || [])[1];
  p.writes = out === 'third' ? null : out;
  check(!/\b(patch|sample|filter|input|output|common|active|partition|half)\b/.test(main), 'no reserved word of GLSL ES 3 in the light shaders');
  parts.set(frag, p); return p;
}
// what lightAt (GRASS_PRELUDE) reads in each third of the picture
const READS = ['sun', 'sky', 'air'];

// --- one frame as app.js has it: the grass, the pollen, then the light pass, then the picture
const rig = { agl: 0, pos: new THREE.Vector3(), localUp: [0, 0, 1] };
const dt = 1 / 30;
let place = new THREE.Vector3(0.3, 0.2, 0.93).normalize();
const seen = [];                     // per frame: height, pixels lit, rows read
let pollenHigh = 0, bandFrames = 0;
function frame(agl, what) {
  rig.agl = agl; rig.pos.copy(place).multiplyScalar(R + GROUND + agl); rig.localUp = [place.x, place.y, place.z];
  camera.position.copy(rig.pos); camera.up.copy(place); camera.lookAt(rig.pos.clone().add(new THREE.Vector3(-place.y, place.x, 0).normalize()));
  grass.update(rig, dt, renderer);
  pollen.update(dt, 0.5);
  const from = log.length;
  grass.renderLight(renderer, camera);
  const draws = log.slice(from).filter((d) => !d.clear && d.target === grass.light);
  // the rows read by what the picture draws this frame
  const read = new Set();
  if (grass.mesh.visible) for (const m of grass.mesh.children) if (m.visible && m.material.uniforms.uLight) read.add(m.material.uniforms.uLight.value.w);
  if (pollen.mesh.visible) read.add(pollen.uniforms.uLight.value.w);
  if (pollen.mesh.visible && agl > 220) pollenHigh++;
  if (grass.mesh.visible && agl > 230 && agl < 2900) bandFrames++;
  // which blocks of the table (a part of a row) each draw covers, and what it works out there
  const covered = new Set();
  let pixels = 0, waste = 0, unread = 0, twice = 0;
  const lo = Math.min(...read), hi = Math.max(...read);
  for (const d of draws) {
    let x0 = d.vp.x, y0 = d.vp.y, x1 = d.vp.x + d.vp.z, y1 = d.vp.y + d.vp.w;
    if (d.st) { x0 = Math.max(x0, d.sc.x); y0 = Math.max(y0, d.sc.y); x1 = Math.min(x1, d.sc.x + d.sc.z); y1 = Math.min(y1, d.sc.y + d.sc.w); }
    if (x1 <= x0 || y1 <= y0) continue;
    const p = partsOf(d.frag), px = (x1 - x0) * (y1 - y0);
    pixels += px;
    if (p.haze > 1) twice += px;
    for (let r = 0; r < ROWS; r++) for (let k = 0; k < 3; k++) {
      const bx0 = Math.max(x0, k * N), bx1 = Math.min(x1, (k + 1) * N), by0 = Math.max(y0, r * N), by1 = Math.min(y1, (r + 1) * N);
      if (bx1 <= bx0 || by1 <= by0) continue;
      const area = (bx1 - bx0) * (by1 - by0);
      if (area === N * N) covered.add(r * 3 + k);
      check(p.writes === null || p.writes === READS[k], `each third written with the number lightAt reads there (the ${READS[k]}'s, not the ${p.writes}'s)`);
      // (the Sun's light worked out outside the Sun's third, the sky's outside the sky's)
      if ((p.sun && k !== 0) || (p.sky && k !== 1)) waste += area;
      if (!read.size || r < lo || r > hi) unread += area;
    }
  }
  for (const r of read) for (let k = 0; k < 3; k++) check(covered.has(r * 3 + k), `a row read in the frame it is read (${what})`);
  check(read.size > 0 || draws.length === 0, `nothing drawn when nothing reads the table (${what})`);
  check(unread === 0, `no row drawn that nothing reads (${what})`);
  check(waste === 0, 'a pixel works out only the number it keeps (the Sun in the Sun\'s third, the sky in the sky\'s)');
  check(twice === 0, 'the air between looked up once a pixel, not twice');
  seen.push({ agl, what, pixels, waste, twice, read: read.size ? `${lo}-${hi}` : '-', drawn: draws.length });
}

// --- the flights
const steady = (agl, n, what) => { for (let i = 0; i < n; i++) frame(agl, what); };
steady(2, 40, 'on foot');
// a climb at 60 m/s to 2.6 km (the pollen's tail above the clumps' height on the way)
for (let a = 2; a < 2600; a += 60 * dt) frame(a, 'a climb');
steady(2600, 10, '2.6 km up');
// down at once to 30 m (a bookmark), and up again
frame(30, 'a jump down from 2.6 km'); steady(30, 5, '30 m');
steady(1000, 30, '1 km up');
// a dive at 400 m/s to 20 m
for (let a = 1000; a > 20; a -= 400 * dt) frame(a, 'a dive');
steady(20, 30, '20 m');
// to another place far off, at a walker's height
place = new THREE.Vector3(0.31, 0.15, 0.94).normalize();
frame(1.8, 'a jump to another place'); steady(1.8, 5, 'there');
// the clumps between 90 and 220 m, and the governor taking them away and giving them back
steady(150, 260, '150 m');
grass.setMidShare(0); steady(150, 5, 'clumps taken away'); grass.setMidShare(1);
frame(150, 'clumps given back'); steady(150, 5, '150 m again');
check(pollenHigh > 0, 'the flights include pollen still drifting above the clumps\' height');
check(bandFrames > 20, 'the flights include the band where the grass is only the ground\'s colour');

// what was drawn, by height
const show = [[2, 'on foot'], [150, '150 m'], [1000, '1 km up'], [2600, '2.6 km up']];
for (const [a, w] of show) {
  const s = seen.filter((f) => f.agl === a && f.what === w).pop();
  if (s) console.log(`${String(a).padStart(5)} m: ${String(s.pixels).padStart(6)} pixels lit in ${s.drawn} draw(s); rows read ${s.read}; pixels working out a number they throw away ${s.waste}; looking up the air twice ${s.twice}`);
}

// --- the air: one look against two, replayed in 32-bit floats
// The shader as it is: what the replay below copies must still be there.
const lines = [
  'vec3 hazed = color * T + L0 + Lg * (rhoW - 1.0);',
  'return uHaze < 1.0 ? mix(color, h, uHaze) : h;',
  'return mix(color, skyLight(up, up) * (0.7 / PI), 1.0 - exp(-length(rel) * uWeather.w));',
  'if (uHaze < 1.0) { T = mix(vec3(1.0), T, uHaze); L0 *= uHaze; Lg *= uHaze; }',
  'T *= 1.0 - kv; Lg *= 1.0 - kv; L0 = L0 * (1.0 - kv) + skyLight(up, up) * (0.7 / PI) * kv;',
];
for (const l of lines) check(LIGHTING_PARS.includes(l), `the replay of the air matches the shader (lightingGlsl.js: "${l}")`);
const f = Math.fround;
// GLSL's mix, as the standard writes it and as GPUs often do it
const mixes = [(x, y, a) => f(f(x * f(1 - a)) + f(y * a)), (x, y, a) => f(x + f(a * f(y - x)))];
// to a half float (round to nearest even), as the table holds it
const half = (x) => { if (x === 0) return 0; const e = Math.max(-14, Math.floor(Math.log2(Math.abs(x)))), q = 2 ** (e - 10); return Math.round(x / q) * q; };
const ulp = (x) => 2 ** (Math.floor(Math.log2(Math.max(Math.abs(x), 1e-30))) - 23);
let rnd = 12345; const r01 = () => { rnd = (rnd * 1103515245 + 12345) >>> 0; return rnd / 4294967296; };
let worstT = 0, worstA = 0, halfFlip = 0, halfFar = 0, cases = 0;
for (let i = 0; i < 200000; i++) {
  const mix = mixes[i & 1];
  // the froxels' answer for a place (T, L0, Lg: the same call, the same arguments, both ways), the look's thinner air, the rain
  const T = f(r01() ** 2), L0 = f(r01() * (r01() < 0.5 ? 0.05 : 3)), Lg = f(r01() - 0.5);
  const u = r01() < 0.4 ? 1 : f(r01()), wet = r01() < 0.4, kv = wet ? f(1 - f(Math.exp(-f(r01() * 400 * 0.004)))) : 0, V = f(r01() * 0.5);
  // before: aerialPerspective(colour) = rainVeil(hazeOverGround(colour, rel, 1)); rho = 1 makes rhoW - 1 exactly 0
  const ap = (c) => {
    let h = f(f(f(c * T) + L0) + f(Lg * 0));
    if (u < 1) h = mix(c, h, u);
    return wet ? mix(h, V, kv) : h;
  };
  const air0 = ap(0), through0 = f(ap(1) - air0);
  // after: hazeAffine's T and L0
  let T1 = T, L1 = L0;
  if (u < 1) { T1 = mix(1, T, u); L1 = f(L0 * u); }
  if (wet) { T1 = f(T1 * f(1 - kv)); L1 = f(f(L1 * f(1 - kv)) + f(V * kv)); }
  // how far apart, against the size of the numbers the old way added and took away
  const scale = Math.max(1, T + L0 + V);
  worstT = Math.max(worstT, Math.abs(through0 - T1) / ulp(scale));
  worstA = Math.max(worstA, Math.abs(air0 - L1) / ulp(Math.max(L0 + V, 1e-6)));
  // in the table: the Sun's light (or the sky's) through it, and the air, at some exposure
  const k = f(0.5 + r01() * 20);
  for (const [a, b] of [[f(through0 * k), f(T1 * k)], [f(air0 * k), f(L1 * k)]]) {
    cases++;
    const ha = half(a), hb = half(b);
    // (a half float's step at a value: 2^(exponent - 10), and 2^-24 under its smallest normal)
    const step = 2 ** Math.max(-24, Math.floor(Math.log2(Math.max(Math.abs(ha), Math.abs(hb), 1e-30))) - 10);
    if (ha !== hb) { halfFlip++; if (Math.abs(ha - hb) > 1.0001 * step) halfFar++; }
  }
}
console.log(`the air, one look against two (200 000 cases): through ${worstT.toFixed(1)} and air ${worstA.toFixed(1)} units of the last place at most; in the table's half floats ${(100 * halfFlip / cases).toFixed(3)} % of values one step apart, ${halfFar} more than one`);
check(worstT <= 4, 'the light let through the same as near as 32-bit floats allow');
check(worstA <= 4, 'the air\'s own light the same as near as 32-bit floats allow');
check(halfFar === 0 && halfFlip / cases < 0.01, 'the table\'s half floats the same, or one step apart where the old rounding fell the other way');

for (const [what, n] of broken) console.log(`BROKEN: ${what}${n > 1 ? ` (${n} times)` : ''}`);
console.log(failed ? `grass light: ${broken.size} promise(s) broken` : `grass light: every promise kept (${seen.length} frames)`);
process.exit(failed ? 1 : 0);
