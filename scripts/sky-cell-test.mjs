// A storm cell's shape (src/weather/sky/cellShape.js), without a browser: what numbers can prove
// of it. Fails (exit 1) when a promise is broken.   (about half a minute)
//   node scripts/sky-cell-test.mjs
// 1. Pure: cellShape.js imports nothing, and nothing under src/weather/sky/ uses three, the DOM
//    or Math.random.
// 2. The GLSL's text: no backtick, no word GLSL ES 3 reserves, no whole number outside an
//    index (GLSL ES turns no int into a float), the uniforms' names and sizes as exported, every
//    function the header names, with its types.
// 3. The GLSL (CELL_GLSL and ANVIL_GLSL, run by scripts/lib/glslRun.mjs in 32-bit floats with the
//    arrays packCells and packAnvils fill) gives what the JS gives, on Haven and on Earth: how
//    solid, the cell's own frame, rain, cover from above, chords, the Sun's length, the anvil.
//    Each answer to within what a few 32-bit roundings of its inputs move the JS's answer by
//    (measured at that very place: a ray grazing a surface is allowed more than one crossing it).
// 4. The JS's chords are exact: on a brute-force march of the hull's own test, each end is on the
//    surface (inside a tenth of a millimetre one way, outside the other), nothing of the hull lies
//    beyond them, nothing is missed, and nothing solid lies outside the hull; the Sun's length is
//    the length the march measures inside; the same for the rain shaft. The GLSL's chords against
//    the same march.
// 5. A cell's shape is unchanged by where it is asked from: a world point asked from cameras 50 m
//    to 150 km off, a line's chord from four places along it (as world points), the same cell in
//    another slot, and the JS after 20 000 questions about other cells.
// 6. The shape's own promises: a flat base, the top where the state says (500 m more over a
//    mature tower), as wide as its radius, leaning by its tilt; no jump through a whole life (the
//    change in a step halves when the step does; the overshooting dome is born inside the tower);
//    nothing from a cell of no strength or an empty slot; rain only under the base, all of it in
//    the core, drifting downwind; the cover from above over every solid point; the anvil at 8.5 to
//    9.5 km over a tall tower, rooted over the apex, as wide as its radius at its far end and
//    thinner there.
// Every check is also run once on something broken the way it guards against, and must fail
// there: a check that cannot fail is worth nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CELL_SHAPE, CELL_MAX, CELL_VEC4, ANVIL_MAX, ANVIL_VEC4, CELL_UNIFORMS, CELL_GLSL, ANVIL_GLSL,
  cellGeometry, cellDensity, cellInside, cellChord, cellLight, cellLocal, cellRain, cellShaftChord,
  cellShaftInside, cellFootprint, cellApex, cellOvershoot, cellDomeHeight, anvilGeometry, anvilLevel,
  anvilCover, anvilDensity, makeCellUniforms, setCellUniforms,
} from '../src/weather/sky/cellShape.js';
import { runGlsl, GLSL_RESERVED } from './lib/glslRun.mjs';
import haven from '../src/worlds/haven.js';
import earth from '../src/worlds/earth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) failed = true; };
const note = (text) => console.log(`     ${text}`);
const S = CELL_SHAPE;

// a seeded random sequence (the test's own: the game's weather has none)
const rand = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const tangent = (rng, u, size) => { const v = [rng() - 0.5, rng() - 0.5, rng() - 0.5], k = dot(v, u); const t = unit([v[0] - u[0] * k, v[1] - u[1] * k, v[2] - u[2] * k]); return [t[0] * size, t[1] * size, t[2] * size]; };
const onSphere = (rng) => { const z = 2 * rng() - 1, a = 2 * Math.PI * rng(), s = Math.sqrt(1 - z * z); return [s * Math.cos(a), s * Math.sin(a), z]; };
const hit = (c) => c[0] <= c[1];
const ulp32 = (x) => { const a = Math.fround(Math.abs(x)); return Math.fround(a * (1 + 2 ** -23)) - a; };
// a broken copy of a text: throws if the text to break is not there (a break that breaks nothing proves nothing)
const broken = (text, from, to, all = false) => { if (!text.includes(from)) throw new Error(`sky-cell-test: nothing to break: "${from}" is not in the text`); return all ? text.replaceAll(from, to) : text.replace(from, to); };
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// a random cell's state, as a producer would hand it (some fields left out, some out of range)
function makeState(rng, R, over = {}) {
  const u = onSphere(rng), radius = 2500 + 3500 * rng(), base = 500 + 2500 * rng();
  const st = {
    id: Math.floor(rng() * 1e6), centre: u, radius, base, top: base + 1500 + (11500 - base - 1500) * rng(),
    stage: rng() < 0.3 ? 1 + rng() : 3 * rng(), strength: rng() < 0.08 ? 0 : 0.2 + 0.8 * rng(),
    tilt: tangent(rng, u, rng() < 0.1 ? 1.2 : 0.7 * rng()), shaft: tangent(rng, u, rng() < 0.1 ? 3 : 1.6 * rng()),
    rain: rng() < 0.2 ? 0 : 45 * rng(), seed: Math.floor(rng() * 4294967296), age: 5400 * rng(),
  };
  if (rng() < 0.7) st.frame = tangent(rng, u, 1);
  if (rng() < 0.7) st.core = (0.5 + 0.2 * rng()) * radius;
  return { ...st, ...over };
}
// a point given in the cell's own frame (x, y across, z over the base), and one in its shaft's
const world = (g, x, y, z) => { const X = x + g.te * z, Y = y + g.tf * z, w = g.w0 + z; return [g.u0 * w + g.e0 * X + g.f0 * Y, g.u1 * w + g.e1 * X + g.f1 * Y, g.u2 * w + g.e2 * X + g.f2 * Y]; };
const worldShaft = (g, x, y, z) => world(g, x - (g.se + g.te) * z, y - (g.sf + g.tf) * z, z);
const upOf = (g) => [g.u0, g.u1, g.u2];
// points in and round a cell: the tower and its edge, the dome, over the apex, under the base, far off
function pointsAround(rng, g, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 5, a = 2 * Math.PI * rng();
    if (kind < 3) { const rho = g.r * 1.25 * Math.sqrt(rng()), z = -300 + (g.D + 900) * rng(); out.push(world(g, rho * Math.cos(a), rho * Math.sin(a), z)); }
    else if (kind === 3) { const rho = g.core * 1.4 * Math.sqrt(rng()), z = -g.base * rng(); out.push(worldShaft(g, rho * Math.cos(a), rho * Math.sin(a), z)); }
    else { const rho = 30000 * rng(), z = -g.base + 14000 * rng(); out.push(world(g, rho * Math.cos(a), rho * Math.sin(a), z)); }
  }
  return out;
}
// rays at a cell: from 0 to 225 km off (some from inside), at a point in or near it (some not whole)
function raysAt(rng, g, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * rng(), rho = g.r * 1.3 * Math.sqrt(rng()), z = -200 + (g.D + 800) * rng();
    const target = world(g, rho * Math.cos(a), rho * Math.sin(a), z);
    const far = i % 6 === 0 ? 0 : [300, 3000, 20000, 60000, 150000][i % 5] * (0.5 + rng());
    const from = add(target, onSphere(rng), far);
    const d = far === 0 ? onSphere(rng) : unit(add(target, from, -1));
    out.push({ o: from, d: i % 7 === 0 ? [d[0] * 3, d[1] * 3, d[2] * 3] : d });
  }
  return out;
}
function makeUniformsFor(geoms, anvils) {
  const u = setCellUniforms(makeCellUniforms(), geoms, anvils);
  return Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value]));
}
const runFor = (text, geoms, anvils = []) => runGlsl(text, makeUniformsFor(geoms, anvils));

// How far a JS answer moves when its inputs move by eps (m) along each axis: what 32-bit
// rounding of the inputs alone can change it by, at this very place.
const spread = (fn, p, eps) => { const v = fn(p); let s = 0; for (const a of AXES) s = Math.max(s, Math.abs(fn(add(p, a, eps)) - v)); return s; };
// The same for a chord (its ends, in metres): null where the ray grazes so closely that such a
// move makes it hit or miss.
function chordSpread(fn, o, d, eps) {
  const c = fn(o, d), dl = len(d); let s = 0;
  const moved = (o2, d2) => { const c2 = fn(o2, d2); if (hit(c2) !== hit(c)) return false; if (hit(c)) s = Math.max(s, Math.abs(c2[0] - c[0]) * dl, Math.abs(c2[1] - c[1]) * dl); return true; };
  for (const a of AXES) if (!moved(add(o, a, eps), d) || !moved(o, add(d, a, 2e-7 * dl))) return null;
  return { c: [c[0], c[1]], s };
}

// ---- 1. pure -------------------------------------------------------------------------------
{
  const src = fs.readFileSync(path.join(root, 'src/weather/sky/cellShape.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check(!/^\s*import\b/m.test(code), 'cellShape.js imports nothing');
  const dir = path.join(root, 'src/weather/sky'), bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.m?js$/.test(x))) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (/Math\.random/.test(s)) bad.push(`${f}: Math.random`);
    if (/from\s+['"]three['"]/.test(s)) bad.push(`${f}: three`);
    if (/\b(document|window|navigator|HTMLElement|requestAnimationFrame)\b/.test(s)) bad.push(`${f}: the DOM`);
  }
  check(bad.length === 0, `nothing under src/weather/sky/ uses three, the DOM or Math.random${bad.length ? ': ' + bad.join(', ') : ''}`);
}

// ---- 2. the GLSL's text --------------------------------------------------------------------
// backticks, words GLSL reserves, whole numbers outside an index
function lintGlsl(text) {
  const problems = [];
  if (text.includes('`')) problems.push('a backtick');
  const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
  let depth = 0;
  const TOK = /([A-Za-z_]\w*)|(\d+\.\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|\d+(?:[eE][-+]?\d+)?)|(\[|\])|\S/g;
  for (const m of code.matchAll(TOK)) {
    if (m[3] === '[') depth++; else if (m[3] === ']') depth--;
    else if (m[1] && GLSL_RESERVED.has(m[1])) problems.push(`the reserved word ${m[1]}`);
    else if (m[2] && /^\d+$/.test(m[2]) && depth === 0) problems.push(`the whole number ${m[2]} outside an index`);
  }
  return problems;
}
{
  for (const [name, text] of [['CELL_GLSL', CELL_GLSL], ['ANVIL_GLSL', ANVIL_GLSL]]) {
    const p = lintGlsl(text);
    check(p.length === 0, `${name}: no backtick, no reserved word, no whole number outside an index${p.length ? ': ' + p.slice(0, 4).join('; ') : ''}`);
  }
  const found = lintGlsl(broken(CELL_GLSL, '(1.0 - dot(m, m))', '(1 - dot(m, m))') + '\nfloat f(float sample) { return 2.0 * sample; }');
  check(found.some((x) => x.includes('whole number 1 ')) && found.some((x) => x.includes('sample')), `... and the same lint finds a whole number in arithmetic and a reserved name put there (${found.length} found)`);
  const c = runFor(CELL_GLSL, []), a = runFor(ANVIL_GLSL, []);
  const sizes = Object.fromEntries([...c.uniforms, ...a.uniforms].map((x) => [x.name, x]));
  check(sizes[CELL_UNIFORMS.cells]?.size === CELL_MAX * CELL_VEC4 && sizes[CELL_UNIFORMS.cells]?.type === 'vec4' && sizes[CELL_UNIFORMS.count]?.type === 'int'
    && sizes[CELL_UNIFORMS.anvils]?.size === ANVIL_MAX * ANVIL_VEC4 && sizes[CELL_UNIFORMS.anvils]?.type === 'vec4' && sizes[CELL_UNIFORMS.anvilCount]?.type === 'int',
  `the uniforms: ${CELL_UNIFORMS.cells}[${CELL_MAX * CELL_VEC4}] and ${CELL_UNIFORMS.anvils}[${ANVIL_MAX * ANVIL_VEC4}] (vec4), ${CELL_UNIFORMS.count} and ${CELL_UNIFORMS.anvilCount} (int)`);
  const sig = (r, n) => { const f = r.functions.find((x) => x.name === n); return f ? `${f.ret} ${n}(${f.params.map((p) => p.type).join(', ')})` : `no ${n}`; };
  const want = ['float cellDensity(int, vec3)', 'vec2 cellChord(int, vec3, vec3)', 'float cellLight(int, vec3, vec3)', 'vec3 cellLocal(int, vec3)',
    'float cellRain(int, vec3)', 'vec2 cellShaftChord(int, vec3, vec3)', 'float cellFootprint(int, vec3)'];
  const wantA = ['float anvilCover(int, vec3)', 'float anvilDensity(int, vec3)'];
  const got = want.map((w) => sig(c, w.split(' ')[1].split('(')[0])), gotA = wantA.map((w) => sig(a, w.split(' ')[1].split('(')[0]));
  check(got.every((x, i) => x === want[i]) && gotA.every((x, i) => x === wantA[i]), `the functions the header names: ${[...got, ...gotA].join(', ')}`);
  const u = makeCellUniforms();
  check(u[CELL_UNIFORMS.cells].value.length === CELL_MAX * CELL_VEC4 * 4 && u[CELL_UNIFORMS.anvils].value.length === ANVIL_MAX * ANVIL_VEC4 * 4, 'makeCellUniforms holds arrays of those sizes');
}

// ---- 3. the GLSL gives what the JS gives ---------------------------------------------------
// Cells in packs of CELL_MAX, each asked at points and along rays in JS and in the GLSL's text.
// Returns the worst error of each answer over its own tolerance (1: at the tolerance).
function parity(R, seed, nCells, glslText = CELL_GLSL, anvilText = ANVIL_GLSL) {
  const rng = rand(seed), eps = 4 * ulp32(R + 15000), epsDir = eps / R;
  const w = { density: 0, local: 0, rain: 0, foot: 0, light: 0, chord: 0, shaft: 0, anvil: 0, flips: 0, grazing: 0, n: 0, rays: 0 };
  const worse = (key, err, tol) => { w[key] = Math.max(w[key], err / tol); };
  for (let p0 = 0; p0 < nCells; p0 += CELL_MAX) {
    const geoms = [];
    for (let k = 0; k < CELL_MAX; k++) geoms.push(cellGeometry(makeState(rng, R), R));
    const G = runFor(glslText, geoms).fn;
    for (let k = 0; k < CELL_MAX; k++) {
      const g = geoms[k], tl = Math.hypot(g.te, g.tf);
      for (const p of pointsAround(rng, g, 60)) {
        w.n++;
        worse('density', Math.abs(cellDensity(g, p) - G.cellDensity(k, p)), 4 * spread((q) => cellDensity(g, q), p, eps) + 1e-5);
        const lj = cellLocal(g, p), lg = G.cellLocal(k, p);
        for (let i = 0; i < 3; i++) worse('local', Math.abs(lj[i] - lg[i]), 4 * eps * (1 + tl) + 1e-6 * Math.abs(lj[i]));
        worse('rain', Math.abs(cellRain(g, p) - G.cellRain(k, p)), 4 * spread((q) => cellRain(g, q), p, eps) + 1e-5 * g.rain + 1e-9);
        const dn = unit(p);
        worse('foot', Math.abs(cellFootprint(g, dn) - G.cellFootprint(k, dn)), 4 * spread((q) => cellFootprint(g, q), dn, epsDir) + 1e-5);
        const sun = onSphere(rng);
        worse('light', Math.abs(cellLight(g, p, sun) - G.cellLight(k, p, sun)),
          4 * Math.max(spread((q) => cellLight(g, q, sun), p, eps), spread((s) => cellLight(g, p, s), sun, 2e-7)) + 1e-3);
      }
      for (const { o, d } of raysAt(rng, g, 25)) {
        for (const [fj, fg, key] of [[cellChord, G.cellChord, 'chord'], [cellShaftChord, G.cellShaftChord, 'shaft']]) {
          w.rays++;
          const cs = chordSpread((oo, dd) => fj(g, oo, dd), o, d, eps);
          if (!cs) { w.grazing++; continue; }
          const cg = fg(k, o, d);
          if (hit(cs.c) !== hit(cg)) { w.flips++; continue; }
          if (hit(cs.c)) for (let i = 0; i < 2; i++) worse(key, Math.abs(cs.c[i] - cg[i]) * len(d), 4 * cs.s + 1e-3);
        }
      }
    }
  }
  // anvils: from over a tower's apex, blown 10 to 30 km, at their level
  for (let p0 = 0; p0 < nCells; p0 += ANVIL_MAX) {
    const list = [];
    for (let k = 0; k < ANVIL_MAX; k++) {
      const g = cellGeometry(makeState(rng, R), R), from = cellApex(g), to = unit(add(from, tangent(rng, from, (10000 + 20000 * rng()) / R)));
      list.push(anvilGeometry({ from, to, level: anvilLevel(g.base + g.D), radius: 4000 + 6000 * rng(), strength: rng() < 0.1 ? 0 : rng() }, R));
    }
    const G = runFor(anvilText, [], list).fn;
    for (let k = 0; k < ANVIL_MAX; k++) {
      const A = list[k], a = [A.a0, A.a1, A.a2], b = [A.b0, A.b1, A.b2];
      for (let i = 0; i < 40; i++) {
        const m = add(a, add(b, a, -1), rng() * 1.3 - 0.15), q = add(m, tangent(rng, unit(m), A.radius * 1.4 * rng()));
        const p = add([0, 0, 0], unit(q), A.L - 1400 * rng() + 200), dn = unit(p);
        worse('anvil', Math.abs(anvilCover(A, dn) - G.anvilCover(k, dn)), 4 * spread((x) => anvilCover(A, x), dn, epsDir) + 1e-5);
        worse('anvil', Math.abs(anvilDensity(A, p) - G.anvilDensity(k, p)), 4 * spread((x) => anvilDensity(A, x), p, eps) + 1e-5);
      }
    }
  }
  return w;
}
const PARITY_KEYS = ['density', 'local', 'rain', 'foot', 'light', 'chord', 'shaft', 'anvil'];
const parityOk = (w) => PARITY_KEYS.every((k) => w[k] <= 1) && w.flips === 0 && w.grazing < 0.05 * w.rays;
const parityReport = (name, w) => `${name}: ${w.n} points, ${w.rays} chords; worst error over its tolerance: ${PARITY_KEYS.map((k) => `${k} ${w[k].toFixed(2)}`).join(', ')}; ${w.flips} hit against miss, ${w.grazing} grazing too closely to compare`;
for (const [name, R, seed] of [['Haven', haven.radius, 11], ['Earth', earth.radius, 12]]) {
  const w = parity(R, seed, 96);
  check(parityOk(w), `GLSL against JS on ${name}`); note(parityReport(name, w));
}
{
  // the same check on a GLSL whose edge begins a hundredth later, whose rain drifts upwind, whose
  // overshooting dome rises 50 m less, and an anvil whose neck is 0.05 wider
  const w1 = parity(haven.radius, 11, 16, broken(CELL_GLSL, `smoothstep(${S.EDGE_IN}, 1.0`, 'smoothstep(0.56, 1.0', true));
  const w2 = parity(haven.radius, 11, 16, broken(CELL_GLSL, 'dot(p, b.xyz) + c.z * z', 'dot(p, b.xyz) - c.z * z'));
  const w3 = parity(haven.radius, 11, 16, broken(CELL_GLSL, `${(S.OS_SINK + S.OS_HEIGHT).toFixed(1)} * ko`, `${(S.OS_SINK + S.OS_HEIGHT - 50).toFixed(1)} * ko`, true));
  const w4 = parity(haven.radius, 11, 16, CELL_GLSL, broken(ANVIL_GLSL, `${S.ANVIL_NECK} +`, `${S.ANVIL_NECK + 0.05} +`));
  check(!parityOk(w1) && !parityOk(w2) && !parityOk(w3) && !parityOk(w4), `... and fails on an edge a hundredth later (solid ${w1.density.toFixed(0)}x its tolerance), rain drifting upwind (rain ${w2.rain.toFixed(0)}x), an overshooting dome 50 m lower (chords ${w3.chord.toFixed(0)}x), an anvil's neck 0.05 wider (anvil ${w4.anvil.toFixed(0)}x)`);
}

// ---- 4. the chords against a brute-force march --------------------------------------------
// Along a ray: the hull's stretches by marching the hull's own test (in doubles) every `step`
// metres over [t0, t1] (metres along the ray), each change refined to a micrometre.
function marchHull(inside, o, d, t0, t1, step) {
  const dn = unit(d), runs = [];
  const at = (t) => inside(add(o, dn, t));
  let prev = at(t0), start = prev ? t0 : null;
  const refine = (a, b) => { const was = at(a); for (let i = 0; i < 60 && b - a > 1e-6; i++) { const m = (a + b) / 2; if (at(m) === was) a = m; else b = m; } return (a + b) / 2; };
  for (let t = t0 + step; t <= t1 + step / 2; t += step) {
    const now = at(Math.min(t, t1));
    if (now !== prev) { const x = refine(t - step, Math.min(t, t1)); if (now) start = x; else { runs.push([start, x]); start = null; } prev = now; }
  }
  if (start !== null) runs.push([start, t1]);
  return runs;
}
// a window along the ray (metres) round the cell: a ball round the tower, the overshooting dome and the shaft
function windowOf(g, o, d) {
  const dn = unit(d), lean = Math.hypot(g.te, g.tf) * g.D, sh = Math.hypot(g.se, g.sf) * (g.base + S.SHAFT_DEEP);
  const c = world(g, 0, 0, (g.D - g.base) / 2), rad = Math.hypot(Math.max(g.r, g.core * 1.2) + lean + sh, (g.D + g.base + S.SHAFT_DEEP) / 2 + S.OS_HEIGHT) + 200;
  const oc = add(o, c, -1), b = dot(oc, dn), h = b * b - (dot(oc, oc) - rad * rad);
  return h < 0 ? null : [-b - Math.sqrt(h), -b + Math.sqrt(h)];
}
// one chord function against the march: chord(k, o, d) -> [t0, t1] in units of |d|; tol(k, o, d)
// the metres allowed (a millimetre for the JS; for the GLSL what rounding can move the JS by)
function chordCheck(R, seed, nCells, impl, tol) {
  const rng = rand(seed), w = { rays: 0, surface: 0, beyond: 0, missed: 0, ends: 0, light: 0, solidOut: 0, tangent: 0, grazing: 0 };
  for (let n = 0; n < nCells; n += CELL_MAX) {
    const geoms = [];
    for (let k = 0; k < CELL_MAX; k++) geoms.push(cellGeometry(makeState(rng, R, { strength: 0.3 + 0.7 * rng() }), R));
    const fns = impl(geoms);
    for (let k = 0; k < CELL_MAX; k++) {
      const g = geoms[k];
      for (const { o, d } of raysAt(rng, g, 30)) {
        const win = windowOf(g, o, d), dl = len(d), dn = unit(d);
        for (const [chord, inside, jsChord] of [[fns.chord, (p) => cellInside(g, p), cellChord], [fns.shaft, (p) => cellShaftInside(g, p), cellShaftChord]]) {
          w.rays++;
          const tl = tol(R, (oo, dd) => jsChord(g, oo, dd), o, d);
          if (tl === null) { w.grazing++; continue; }
          const c = chord(k, o, d), runs = win ? marchHull(inside, o, d, win[0], win[1], 3) : [];
          if (!hit(c)) { if (runs.some((r) => r[1] - r[0] > tl)) w.missed++; continue; }
          const a = c[0] * dl, b = c[1] * dl;
          if (b - a < 2 * tl) { w.tangent++; continue; }
          // each end on the surface: inside just within, outside just beyond
          const e = Math.max(1e-4, tl);
          if (!inside(add(o, dn, a + e)) || inside(add(o, dn, a - e)) || !inside(add(o, dn, b - e)) || inside(add(o, dn, b + e))) w.surface++;
          // nothing of the hull beyond the ends
          if (runs.some((r) => r[0] < a - tl || r[1] > b + tl)) w.beyond++;
          if (runs.length) w.ends = Math.max(w.ends, Math.abs(runs[0][0] - a), Math.abs(runs[runs.length - 1][1] - b));
        }
        // nothing solid outside the hull, along the ray
        if (win) for (let i = 0; i < 40; i++) { const p = add(o, dn, win[0] + (win[1] - win[0]) * rng()); if (cellDensity(g, p) > 0 && !cellInside(g, p)) w.solidOut++; }
      }
      // the Sun's length from points in and round the tower, against the march's length inside
      for (const p of pointsAround(rng, g, 30)) {
        const sun = onSphere(rng), win = windowOf(g, p, sun);
        const runs = win ? marchHull((q) => cellInside(g, q), p, sun, Math.max(0, win[0]), Math.max(0, win[1]), 2) : [];
        w.light = Math.max(w.light, Math.abs(fns.light(k, p, sun) - runs.reduce((s, r) => s + r[1] - r[0], 0)));
      }
    }
  }
  return w;
}
const chordOk = (w, lightTol) => w.surface === 0 && w.beyond === 0 && w.missed === 0 && w.solidOut === 0 && w.light <= lightTol && w.grazing < 0.05 * w.rays;
const chordReport = (w) => `${w.rays} chords: ${w.surface} ends off the surface, ${w.beyond} with hull beyond an end, ${w.missed} missed, ${w.tangent} tangent, ${w.grazing} grazing too closely; ends ${w.ends.toExponential(1)} m from the march's; the Sun's length ${w.light.toExponential(1)} m off; ${w.solidOut} solid points outside the hull`;
const fromJs = (geoms) => ({ chord: (k, o, d) => cellChord(geoms[k], o, d), shaft: (k, o, d) => cellShaftChord(geoms[k], o, d), light: (k, p, s) => cellLight(geoms[k], p, s) });
const fromGlsl = (text) => (geoms) => { const G = runFor(text, geoms).fn; return { chord: G.cellChord, shaft: G.cellShaftChord, light: G.cellLight }; };
const exactTol = () => 1e-4;
const f32Tol = (R, fn, o, d) => { const cs = chordSpread(fn, o, d, 4 * ulp32(R + 15000)); return cs ? 4 * cs.s + 1e-3 : null; };
{
  const w = chordCheck(haven.radius, 21, 48, fromJs, exactTol);
  check(chordOk(w, 1e-3), 'the JS chords are exact on Haven'); note(chordReport(w));
  const we = chordCheck(earth.radius, 22, 24, fromJs, exactTol);
  check(chordOk(we, 1e-3), 'the JS chords are exact on Earth'); note(chordReport(we));
  const wg = chordCheck(haven.radius, 23, 24, fromGlsl(CELL_GLSL), f32Tol);
  check(chordOk(wg, 1), "the GLSL's chords, in 32-bit floats, on Haven"); note(chordReport(wg));
  // the same check on a dome whose chord begins 100 m high, and a shaft only as wide as the core's full rain
  const wb = chordCheck(haven.radius, 23, 16, fromGlsl(broken(CELL_GLSL, 'cellAbove(lo.z, ld.z, zd))', 'cellAbove(lo.z, ld.z, zd + 100.0))')), f32Tol);
  const ws = chordCheck(haven.radius, 23, 16, fromGlsl(broken(CELL_GLSL, `rc = e.x * ${S.SHAFT_EDGE}`, `rc = e.x * ${S.SHAFT_FULL}`)), f32Tol);
  check(!chordOk(wb, 1) && !chordOk(ws, 1), `... and fails on a dome's chord begun 100 m high (${wb.surface} ends off the surface, ${wb.beyond} with hull beyond) and a shaft too narrow (${ws.surface}, ${ws.beyond})`);
}

// ---- 5. unchanged by where it is asked from -----------------------------------------------
const ASK = `
float askDensity(int k, vec3 cam, vec3 dir, float t) { return cellDensity(k, cam + dir * t); }
vec3 askEntry(int k, vec3 cam, vec3 dir) { vec2 c = cellChord(k, cam, dir); return cam + dir * c.x; }
vec3 askExit(int k, vec3 cam, vec3 dir) { vec2 c = cellChord(k, cam, dir); return cam + dir * c.y; }
`;
function askedFrom(R, seed, ask = ASK) {
  const rng = rand(seed), w = { density: 0, chord: 0, slot: 0, n: 0, lines: 0 };
  const geoms = []; for (let k = 0; k < CELL_MAX; k++) geoms.push(cellGeometry(makeState(rng, R, { strength: 1, stage: 1.5 }), R));
  const G = runFor(CELL_GLSL + ask, geoms).fn;
  for (let k = 0; k < CELL_MAX; k++) {
    const g = geoms[k];
    for (const W of pointsAround(rng, g, 40)) {
      const want = cellDensity(g, W);
      for (const far of [50, 3000, 40000, 150000]) {
        // a camera that far off, up in the air; what 32-bit floats can do to cam + dir * t
        const cam = add(W, unit(add(onSphere(rng), upOf(g), 1.5)), far), dv = add(W, cam, -1), t = len(dv), dir = unit(dv);
        const eps = 4 * (ulp32(len(cam)) + 1.2e-7 * t);
        w.density = Math.max(w.density, Math.abs(G.askDensity(k, cam, dir, t) - want) / (4 * spread((q) => cellDensity(g, q), W, eps) + 1e-5)); w.n++;
      }
    }
    // a line through the cell: its entry and exit as world points, from four places along it
    for (const { o, d } of raysAt(rng, g, 12)) {
      const dn = unit(d), eps = 4 * (ulp32(R + 15000) + 1.2e-7 * 160000), cs = chordSpread((oo, dd) => cellChord(g, oo, dd), o, dn, eps);
      if (!cs || !hit(cs.c) || cs.c[1] - cs.c[0] < 200) continue;
      const pin = add(o, dn, cs.c[0]), pout = add(o, dn, cs.c[1]);
      for (const s of [-160000, -20000, (cs.c[0] + cs.c[1]) / 2, cs.c[1] + 30000]) {
        const cam = add(o, dn, s);
        w.chord = Math.max(w.chord, len(add(G.askEntry(k, cam, dn), pin, -1)) / (4 * cs.s + 4 * eps), len(add(G.askExit(k, cam, dn), pout, -1)) / (4 * cs.s + 4 * eps));
      }
      w.lines++;
    }
  }
  // the same cell in another slot, among others: the very same numbers
  const other = []; for (let k = 0; k < CELL_MAX; k++) other.push(cellGeometry(makeState(rng, R), R));
  other[CELL_MAX - 1] = geoms[0];
  const G2 = runFor(CELL_GLSL + ask, other).fn, sun = unit([0.2, -0.3, 0.9]);
  for (const p of pointsAround(rng, geoms[0], 200)) {
    if (G.askDensity(0, p, [1, 0, 0], 0) !== G2.askDensity(CELL_MAX - 1, p, [1, 0, 0], 0) || G.cellLight(0, p, sun) !== G2.cellLight(CELL_MAX - 1, p, sun)) w.slot++;
  }
  return w;
}
const askOk = (w) => w.density <= 1 && w.chord <= 1 && w.slot === 0;
for (const [name, R, seed] of [['Haven', haven.radius, 31], ['Earth', earth.radius, 32]]) {
  const w = askedFrom(R, seed);
  check(askOk(w), `on ${name} a cell's shape is the same asked from 50 m to 150 km off, a line's chord the same from four places along it, and the same in another slot`);
  note(`${w.n} questions and ${w.lines} lines; worst over the tolerance of 32-bit floats there: solid ${w.density.toFixed(2)}, chord ends ${w.chord.toFixed(2)}; ${w.slot} answers different in another slot`);
}
{
  // the same check on a base that follows the camera's height (a tenth of it), and on a chord cut where the camera is
  const follow = broken(ASK, 'cellDensity(k, cam + dir * t)', `cellDensity(k, cam + dir * t - normalize(cam) * 0.1 * (length(cam) - ${CELL_UNIFORMS.cells}[k * ${CELL_VEC4}].w))`);
  const forward = broken(ASK, 'vec2 c = cellChord(k, cam, dir);', 'vec2 c = cellChord(k, cam, dir); c = vec2(max(c.x, 0.0), c.y);', true);
  const w1 = askedFrom(haven.radius, 31, follow), w2 = askedFrom(haven.radius, 31, forward);
  check(!askOk(w1) && !askOk(w2), `... and fails on a base that follows the camera's height (solid ${w1.density.toFixed(0)}x its tolerance) and a chord cut at the camera (chord ends ${w2.chord.toFixed(0)}x)`);
}
{
  // the JS keeps nothing between questions
  const rng = rand(41), g = cellGeometry(makeState(rng, haven.radius, { strength: 1, stage: 1.4, rain: 20 }), haven.radius);
  const pts = pointsAround(rng, g, 50), rays = raysAt(rng, g, 20), sun = unit([0.3, 0.2, 0.9]);
  const ask = () => [...pts.map((p) => cellDensity(g, p)), ...pts.map((p) => cellRain(g, p)), ...pts.map((p) => cellLight(g, p, sun)), ...pts.map((p) => cellFootprint(g, unit(p))),
    ...rays.flatMap(({ o, d }) => [...cellChord(g, o, d), ...cellShaftChord(g, o, d)])];
  const first = ask();
  for (let i = 0; i < 2000; i++) {
    const h = cellGeometry(makeState(rng, haven.radius), haven.radius);
    for (const p of pointsAround(rng, h, 2)) { cellDensity(h, p); cellRain(h, p); cellLight(h, p, onSphere(rng)); cellFootprint(h, unit(p)); }
    for (const { o, d } of raysAt(rng, h, 2)) { cellChord(h, o, d); cellShaftChord(h, o, d); }
  }
  const again = ask();
  check(first.every((x, i) => Object.is(x, again[i])), 'the JS gives the same numbers, to the last bit, after 20 000 questions about other cells');
}

// ---- 6. the shape's own promises ------------------------------------------------------------
{
  const R = haven.radius, rng = rand(51), worst = { base: 0, top: 0, topGrow: 0, axis: 0, width: 0 };
  for (let i = 0; i < 60; i++) {
    const st = makeState(rng, R, { strength: 1, stage: 1.5 }), g = cellGeometry(st, R), up = upOf(g);
    // the base: straight up through the middle, in at the base
    worst.base = Math.max(worst.base, Math.abs(cellChord(g, world(g, 0, 0, -1000), up)[0] - 1000));
    // the top: up the axis through the apex, out 500 m over the top when mature, at the top while growing
    const ax = world(g, 0, 0, g.D - 50), dirAx = unit(add(world(g, 0, 0, g.D + 1000), ax, -1));
    const cm = cellChord(g, ax, dirAx);
    worst.top = Math.max(worst.top, Math.abs(cellLocal(g, add(ax, dirAx, cm[1]))[2] - (g.D + S.OS_HEIGHT)));
    const gg = cellGeometry({ ...st, stage: 0.5 }, R), cg = cellChord(gg, ax, dirAx);
    worst.topGrow = Math.max(worst.topGrow, Math.abs(cellLocal(gg, add(ax, dirAx, cg[1]))[2] - gg.D));
    // level lines across the column at 0.6 of its height: the chord's middle on the leaning axis, its length the width
    const z = (g.D - cellDomeHeight(g.r, g.D)) * 0.6;
    for (const [a0, a1] of [[1, 0], [0, 1]]) {
      const o = world(g, -20000 * a0, -20000 * a1, z), d = unit(add(world(g, 20000 * a0, 20000 * a1, z), o, -1));
      const c = cellChord(g, o, d), mid = cellLocal(g, add(o, d, (c[0] + c[1]) / 2));
      worst.axis = Math.max(worst.axis, Math.hypot(mid[0], mid[1]));
      worst.width = Math.max(worst.width, Math.abs(c[1] - c[0] - 2 * g.r));
    }
  }
  check(Math.max(...Object.values(worst)) < 1e-6, `the base is flat; the top is the state's (500 m more over a mature tower); the column is as wide as its radius round its leaning axis (worst ${Math.max(...Object.values(worst)).toExponential(1)} m)`);
}
{
  // the lean in the world: marching level lines across the column (along its axis and across it,
  // through where the lean puts its middle), the middle is tilt x height from the base's middle
  // (and the same check on a lean the other way must fail)
  const R = haven.radius, rng = rand(52);
  const leanErr = (sign) => {
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const g = cellGeometry(makeState(rng, R, { strength: 1 }), R), z = (g.D - cellDomeHeight(g.r, g.D)) * 0.5;
      const ex = sign * g.te * z, ey = sign * g.tf * z, e = [g.e0, g.e1, g.e2], f = [g.f0, g.f1, g.f2];
      const along = marchHull((p) => cellInside(g, p), add(add([g.u0 * (g.w0 + z), g.u1 * (g.w0 + z), g.u2 * (g.w0 + z)], f, ey), e, -30000), e, 0, 60000, 5);
      const across = marchHull((p) => cellInside(g, p), add(add([g.u0 * (g.w0 + z), g.u1 * (g.w0 + z), g.u2 * (g.w0 + z)], e, ex), f, -30000), f, 0, 60000, 5);
      const mx = along.length ? (along[0][0] + along[0][1]) / 2 - 30000 : NaN, my = across.length ? (across[0][0] + across[0][1]) / 2 - 30000 : NaN;
      worst = Math.max(worst, Math.abs(mx - ex), Math.abs(my - ey));
      if (!Number.isFinite(worst)) return Infinity;
    }
    return worst;
  };
  const ok = leanErr(1), wrong = leanErr(-1);
  check(ok < 1e-3 && !(wrong < 1e-3), `the tower leans tilt metres a metre up, marched across in the world (worst ${ok.toExponential(1)} m; leaning the other way would be ${wrong.toFixed(0)} m off)`);
}
{
  // No jump through a whole life: how solid fixed points are, stage by stage (the overshooting dome
  // rising and sinking) with the top rising. A rule without a jump changes half as much in half
  // the step; a jump does not shrink.
  const R = haven.radius;
  const lifeJump = (topOf) => {
    const rng = rand(53), most = [0, 0];
    for (let i = 0; i < 16; i++) {
      const st = makeState(rng, R, { strength: 1, tilt: [0, 0, 0] }), g0 = cellGeometry(st, R);
      const pts = [...pointsAround(rng, g0, 150)];
      for (let j = 0; j < 150; j++) { const a = 2 * Math.PI * rng(), rho = S.OS_RADIUS * g0.r * 1.2 * Math.sqrt(rng()); pts.push(world(g0, rho * Math.cos(a), rho * Math.sin(a), g0.D - 600 + 1500 * rng())); }
      [0.002, 0.001].forEach((h, n) => {
        let prev = null;
        for (let s = 0; s <= 3 + 1e-9; s += h) {
          const g = cellGeometry({ ...st, stage: s, top: topOf(st.top, s) }, R), now = pts.map((p) => cellDensity(g, p));
          if (prev) for (let j = 0; j < pts.length; j++) most[n] = Math.max(most[n], Math.abs(now[j] - prev[j]));
          prev = now;
        }
      });
    }
    return most;
  };
  const [a, b] = lifeJump((top, s) => top + 300 * s), [c, d] = lifeJump((top, s) => top + 300 * s + (s > 1.5 ? 400 : 0));
  check(b <= 0.6 * a && a < 0.05, `no jump through a whole life: how solid a point is changes by ${a.toFixed(4)} at most in 0.002 of a stage (2.4 s of growing) and ${b.toFixed(4)} in 0.001`);
  check(!(d <= 0.6 * c), `... and the same check fails on a top that jumps 400 m (${c.toFixed(3)}, then ${d.toFixed(3)})`);
  // the overshooting dome is born inside the tower: while it is low, all of it lies in the tower
  const rng = rand(54);
  const bornOutside = (roShare) => {
    let out = 0;
    for (let i = 0; i < 60; i++) {
      const g = cellGeometry(makeState(rng, R, { strength: 1, radius: 2500 + 4700 * rng() }), R), tower = { ...g, stage: 0 };
      for (const s of [S.OS_RISE0 + 1e-4, S.OS_RISE0 + 0.05, S.OS_RISE0 + 0.12, S.OS_SINK1 - 0.05]) {
        const ko = cellOvershoot(s), ro = roShare * g.r, ho = (S.OS_SINK + S.OS_HEIGHT) * ko, cz = g.D - S.OS_SINK;
        if (ko > 0.3) continue;
        for (let j = 0; j < 200; j++) {
          const a = 2 * Math.PI * rng(), x = Math.sqrt(rng()), zz = (2 * rng() - 1) * Math.sqrt(1 - x * x);
          if (!cellInside(tower, world(g, ro * x * Math.cos(a), ro * x * Math.sin(a), cz + ho * zz))) out++;
        }
      }
    }
    return out;
  };
  const inside = bornOutside(S.OS_RADIUS), wider = bornOutside(0.6);
  check(inside === 0 && wider > 0, `the overshooting dome is born inside the tower (${inside} of its points outside while it is low; ${wider} if it were twice as wide)`);
  const ko = [0, S.OS_RISE0, S.OS_RISE1, 1.5, S.OS_SINK0, S.OS_SINK1, 3].map(cellOvershoot);
  check(ko[0] === 0 && ko[1] === 0 && ko[2] === 1 && ko[3] === 1 && ko[4] === 1 && ko[5] === 0 && ko[6] === 0, `the overshooting dome: none while growing, whole from stage ${S.OS_RISE1} to ${S.OS_SINK0}, none from ${S.OS_SINK1}`);
}
{
  // a cell of no strength is nothing: no solid, no chord, no Sun's length, no cover (a cell born or dead, and an empty slot)
  const R = haven.radius, rng = rand(55); let any = 0;
  const geoms = []; for (let k = 0; k < CELL_MAX; k++) geoms.push(cellGeometry(makeState(rng, R, { strength: 0 }), R));
  const G = runFor(CELL_GLSL, geoms.slice(0, 3)).fn;
  for (let k = 0; k < CELL_MAX; k++) {
    const g = geoms[k];
    for (const p of pointsAround(rng, g, 100)) {
      if (cellDensity(g, p) !== 0 || cellLight(g, p, [0, 0, 1]) !== 0 || cellFootprint(g, unit(p)) !== 0) any++;
      if (G.cellDensity(k, p) !== 0 || G.cellLight(k, p, [0, 0, 1]) !== 0 || G.cellFootprint(k, unit(p)) !== 0 || (k >= 3 && G.cellRain(k, p) !== 0)) any++;
    }
    for (const { o, d } of raysAt(rng, g, 20)) { if (hit(cellChord(g, o, d)) || hit(G.cellChord(k, o, d)) || (k >= 3 && hit(G.cellShaftChord(k, o, d)))) any++; }
  }
  check(any === 0, `a cell of no strength, and an empty slot, has no solid, no chord, no shadow, no cover (${any} answers otherwise)`);
}
{
  // rain: none above the base; all of it in the core below; none beyond the edge; the shaft drifts downwind
  const R = haven.radius;
  const rainCheck = (sign) => {
    const rng = rand(56); let above = 0, core = 0, beyond = 0, drift = 0;
    for (let i = 0; i < 60; i++) {
      const g = cellGeometry(makeState(rng, R, { rain: 5 + 40 * rng() }), R);
      for (let j = 0; j < 50; j++) {
        const a = 2 * Math.PI * rng(), z = -g.base * rng();
        if (cellRain(g, world(g, g.r * rng() * Math.cos(a), g.r * rng() * Math.sin(a), 1 + 3000 * rng())) !== 0) above++;
        const rr = g.core * S.SHAFT_FULL * 0.99 * Math.sqrt(rng());
        if (Math.abs(cellRain(g, worldShaft(g, rr * Math.cos(a), rr * Math.sin(a), z)) - g.rain) > 1e-9) core++;
        if (cellRain(g, worldShaft(g, g.core * S.SHAFT_EDGE * 1.001 * Math.cos(a), g.core * S.SHAFT_EDGE * 1.001 * Math.sin(a), z)) !== 0) beyond++;
      }
      // at sea level under it: level lines through where the drift puts the shaft, marched across it
      const z = -g.base, c0 = [g.u0 * (g.w0 + z), g.u1 * (g.w0 + z), g.u2 * (g.w0 + z)], e = [g.e0, g.e1, g.e2], f = [g.f0, g.f1, g.f2];
      const ex = sign * g.se * g.base, ey = sign * g.sf * g.base;
      const along = marchHull((p) => cellShaftInside(g, p), add(add(c0, f, ey), e, -40000), e, 0, 80000, 5);
      const across = marchHull((p) => cellShaftInside(g, p), add(add(c0, e, ex), f, -40000), f, 0, 80000, 5);
      const mx = along.length ? (along[0][0] + along[0][1]) / 2 - 40000 : NaN, my = across.length ? (across[0][0] + across[0][1]) / 2 - 40000 : NaN;
      const err = Math.max(Math.abs(mx - g.se * g.base), Math.abs(my - g.sf * g.base));
      drift = Number.isFinite(err) ? Math.max(drift, err) : Infinity;
    }
    return { above, core, beyond, drift };
  };
  const r = rainCheck(1), w = rainCheck(-1);
  check(r.above === 0 && r.core === 0 && r.beyond === 0 && r.drift < 1e-3, `rain: none above the base (${r.above}), all of it in the core (${r.core} otherwise), none beyond its edge (${r.beyond}); at sea level the shaft has drifted downwind by its drift x the base's height (worst ${r.drift.toExponential(1)} m)`);
  check(!(w.drift < 1e-3), `... and the same check fails on a shaft drifting upwind (${w.drift === Infinity ? 'not found where it should be' : w.drift.toFixed(0) + ' m off'})`);
}
{
  // the cover from above: over every solid point (a shadow straight down, a place under the storm)
  const R = haven.radius;
  const under = (foot) => {
    const rng = rand(57); let n = 0, bad = 0;
    for (let i = 0; i < 80; i++) {
      const g = cellGeometry(makeState(rng, R, { strength: 1, stage: 1.5 }), R);
      for (const p of pointsAround(rng, g, 200)) { const d = cellDensity(g, p); if (d <= 0) continue; n++; if (foot(g, unit(p)) + 1e-9 < d) bad++; }
    }
    return { n, bad };
  };
  const ok = under(cellFootprint), narrow = under((g, d) => cellFootprint({ ...g, r: 0.9 * g.r }, d));
  check(ok.bad === 0 && narrow.bad > 0, `the cover from above is at least as much as any solid point over the place (${ok.n} points, ${ok.bad} under it; ${narrow.bad} with a footprint a tenth narrower)`);
}
{
  // the anvil: its level, its depth, its root and its far end
  const R = haven.radius, rng = rand(58), bad = [];
  if (anvilLevel(11000) !== S.ANVIL_TOP || anvilLevel(9800) !== S.ANVIL_TOP || Math.abs(anvilLevel(8000) - (8000 - S.ANVIL_UNDER)) > 1e-9) bad.push('its level');
  for (let i = 0; i < 40; i++) {
    const g = cellGeometry(makeState(rng, R, { top: 9800 + 1700 * rng(), strength: 1 }), R), from = cellApex(g);
    const to = unit(add(from, tangent(rng, from, (10000 + 20000 * rng()) / R))), radius = 4000 + 6000 * rng();
    const A = anvilGeometry({ from, to, level: anvilLevel(g.base + g.D), radius, strength: 0.8 }, R), lvl = A.L - R;
    if (lvl > 9500 + 1e-6 || lvl - S.ANVIL_THICK < 8500 - 1e-6) bad.push(`level ${lvl.toFixed(0)} m`);
    const solidAt = (dir, h) => anvilDensity(A, [dir[0] * (R + h), dir[1] * (R + h), dir[2] * (R + h)]);
    // over the apex: whole cover; solid only between its bottom and its top
    if (Math.abs(anvilCover(A, from) - 0.8) > 1e-9) bad.push('cover over the apex');
    if (solidAt(from, lvl + 1) !== 0 || solidAt(from, lvl - S.ANVIL_THICK - 1) !== 0 || Math.abs(solidAt(from, lvl - S.ANVIL_THICK / 2) - 0.8) > 1e-9) bad.push('its depth over the tower');
    // at its far end, across the way it was blown: whole in its heart, none beyond its radius; thinner
    const side = unit(cross(to, add([A.b0, A.b1, A.b2], [A.a0, A.a1, A.a2], -1))), across = (k) => unit(add(to, side, k * radius / A.L));
    if (Math.abs(anvilCover(A, to) - 0.8) > 1e-9 || anvilCover(A, across(1.001)) !== 0 || Math.abs(anvilCover(A, across(S.ANVIL_EDGE_IN * 0.99)) - 0.8) > 1e-9) bad.push('its far end');
    const thinFar = S.ANVIL_THICK * (1 - S.ANVIL_THIN);
    if (solidAt(to, lvl - thinFar - 1) !== 0 || !(solidAt(to, lvl - thinFar / 2) > 0)) bad.push('thinner at the far end');
  }
  check(bad.length === 0, `the anvil: at most 9.5 km and at least 8.5 km for a tall tower, rooted over the apex, as wide as its radius at its far end, thinner there${bad.length ? ': ' + [...new Set(bad)].join(', ') : ''}`);
}
{
  // how long the JS takes (the model paints anvils and wet ground over its field with it)
  const R = haven.radius, rng = rand(61), g = cellGeometry(makeState(rng, R, { strength: 1, stage: 1.5 }), R);
  const pts = pointsAround(rng, g, 1000), rays = raysAt(rng, g, 1000);
  let s = 0, t0 = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) for (const p of pts) s += cellDensity(g, p);
  const dNs = Number(process.hrtime.bigint() - t0) / 1e6;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < 100; i++) for (const { o, d } of rays) s += cellChord(g, o, d)[0] > 0 ? 1 : 0;
  const cNs = Number(process.hrtime.bigint() - t0) / 1e5;
  check(dNs < 2000 && cNs < 5000 && Number.isFinite(s), `in JS a solid takes ${dNs.toFixed(0)} ns, a chord ${cNs.toFixed(0)} ns`);
}

console.log(failed ? 'sky-cell-test: FAILED' : 'sky-cell-test: all passed');
process.exit(failed ? 1 : 0);
