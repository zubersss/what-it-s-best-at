// The flower rule against its promises, without a browser (2 s): node scripts/flower-rule-test.mjs
// Fails (exit 1) when one is broken:
//   - twenty kinds and more, every habit among them, every flora's kinds real ones;
//   - a flora flowers on about the share of the land it names (meadows and their fringe), and the rest is plain grass;
//   - in a meadow one kind leads a patch: most places of a 30 m square show the same kind;
//   - on a thickly flowered hillside one kind alone, the flora's slope kind;
//   - asking for the turf kinds changes which kind, never how many; the same place answers the same twice;
//   - the GLSL carries every flora and kind (the tables' sizes) and no backtick or reserved word of GLSL ES 3.
import { KINDS, FLORAS, HABIT, flowersAt, floraAt, flowerTable, floraNamed, FLOWERS_GLSL, DEFAULT_FLOWERS } from '../src/life/grassRules.js';
let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log('BROKEN: ' + what); } };
const kinds = KINDS.slice(1), floras = FLORAS.slice(1);
check(kinds.length >= 20, `twenty kinds and more (${kinds.length})`);
for (const h in HABIT) check(kinds.some((k) => k.habit === HABIT[h]), `a kind of habit ${h}`);
check(new Set(kinds.map((k) => k.name)).size === kinds.length, 'every kind its own name');
for (const f of floras) for (const k of [...f.lead, f.slope, ...(f.turf ? [f.turf] : [])]) check(k >= 1 && k < KINDS.length, `${f.name}: kind ${k} exists`);
for (const f of floras) check(f.lead.length >= 1 && f.lead.length <= 6, `${f.name}: one to six leading kinds`);
// a square of 4 km on a world 250 km in radius, 20 m apart
const at = (i, j) => [240000 + i, j - 2000, 70000];
for (let fi = 1; fi < FLORAS.length; fi++) {
  const f = FLORAS[fi]; let n = 0, fl = 0, heart = 0;
  for (let j = 0; j < 4000; j += 20) for (let i = 0; i < 4000; i += 20) { const v = flowersAt(...at(i, j), fi); n++; if (v) { fl++; if (v - Math.floor(v) > 0.5 * f.many) heart++; check(f.lead.includes(Math.floor(v)), `${f.name}: only its leading kinds on level ground (${Math.floor(v)})`); } }
  const share = heart / n;
  check(share > 0.3 * f.rich && share < 1.6 * f.rich + 0.05, `${f.name}: meadows on about ${f.rich} of the land (${share.toFixed(2)})`);
  check(fl / n < 0.8, `${f.name}: plain grass between the meadows (${(1 - fl / n).toFixed(2)} of the land)`);
  // one kind to a patch: in squares of 30 m inside meadows, the commonest kind's share
  let squares = 0, lead = 0;
  for (let j = 0; j < 4000; j += 200) for (let i = 0; i < 4000; i += 200) {
    const c = {}; let m = 0;
    for (let y = 0; y < 30; y += 5) for (let x = 0; x < 30; x += 5) { const v = flowersAt(...at(i + x, j + y), fi); if (v) { m++; c[Math.floor(v)] = (c[Math.floor(v)] || 0) + 1; } }
    if (m < 30) continue;
    squares++; lead += Math.max(...Object.values(c)) / m;
  }
  check(squares > 5 && lead / squares > 0.8, `${f.name}: one kind leads a patch (${squares} squares, ${(lead / Math.max(1, squares)).toFixed(2)})`);
  // a hillside: where it flowers thickly, the slope's kind alone
  let hill = 0, alone = 0;
  for (let j = 0; j < 4000; j += 20) for (let i = 0; i < 4000; i += 20) { const v = flowersAt(...at(i, j), fi, 0.32), w = flowersAt(...at(i, j), fi, 0); if (v - Math.floor(v) > 0.6 * f.many && !w) { hill++; if (Math.floor(v) === f.slope) alone++; } }
  check(hill > 200 && alone / hill > 0.9, `${f.name}: hillsides of its slope kind alone (${hill} places, ${(alone / Math.max(1, hill)).toFixed(2)})`);
  // the turf kinds: which, never how many
  let diff = 0, turfed = 0, any = 0;
  for (let j = 0; j < 400; j += 2) for (let i = 0; i < 400; i += 2) { const p = at(1000 + i, 1000 + j), v = flowersAt(...p, fi, 0, false), w = flowersAt(...p, fi, 0, true); if (v) any++; if (Math.abs((v - Math.floor(v)) - (w - Math.floor(w))) > 1e-9 || !v !== !w) diff++; if (v && Math.floor(w) !== Math.floor(v)) { turfed++; check(Math.floor(w) === f.turf, `${f.name}: the turf kind is the flora's`); } if (flowersAt(...p, fi, 0, true) !== w) diff++; }
  check(diff === 0, `${f.name}: turf changes the kind only, and a place answers the same twice`);
  if (f.turf && any > 500) check(turfed / any > 0.15 && turfed / any < 0.45, `${f.name}: about a quarter of the places are its turf kind (${(turfed / any).toFixed(2)})`);
}
// the table of a world: names to numbers, rules in order
const t = flowerTable({ byClass: { 10: 'steppe' }, rules: [{ overLine: 250, flora: 'alpine' }] }, { base: 3000, perDeg: 30 });
check(floraAt(10, 40, 1000, 1, t) === floraNamed('steppe') && floraAt(10, 40, 2100, 1, t) === floraNamed('alpine') && floraAt(9, 40, 1000, 1, t) === 0 && floraAt(10, 40, 1000, 0.05, t) === 0, 'a world\'s table: by class, above the tree line, none without grass');
check(floraAt(10, 30, 2500, 1) === floraNamed('alpine') && floraAt(10, 65, 100, 1) === floraNamed('tundra') && floraAt(10, 30, 100, 1) === floraNamed(DEFAULT_FLOWERS.byClass[10]), 'the table of a world without one');
// the GLSL
check(FLOWERS_GLSL.includes(`FLORA_N = ${FLORAS.length}`) && FLOWERS_GLSL.includes(`KIND_N = ${KINDS.length}`), 'the GLSL has every flora and kind');
check(!FLOWERS_GLSL.includes('`') && !/\b(patch|sample|filter|input|output|common|active|partition|half)\b/.test(FLOWERS_GLSL.replace(/\/\/.*$/gm, '')), 'no backtick and no reserved word in the GLSL');
console.log(failed ? `flower rule: ${failed} promise(s) broken` : `flower rule: every promise kept (${kinds.length} kinds, ${floras.length} floras)`);
process.exit(failed ? 1 : 0);
