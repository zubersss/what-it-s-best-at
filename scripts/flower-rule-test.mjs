// The flower rule against its promises, without a browser (2 s): node scripts/flower-rule-test.mjs
// Fails (exit 1) when one is broken:
//   - twenty kinds and more, every habit among them, every flora's kinds real ones;
//   - a flora flowers on about the share of the land it names (meadows and their fringe), and the rest is plain grass;
//   - in a meadow one kind leads a patch with companions: in a 30 m square the commonest kind
//     has about half the places, and three kinds and more show in nearly every square;
//   - the companions are of other habits than the kind they stand among, where the flora has such;
//   - the ground's mean share of the companions (flowerTint's formula) is the rule's own share;
//   - on a thickly flowered hillside the flora's slope kind leads (two places in three), companions sparse inside, more at its edges;
//   - asking for the turf kinds changes which kind, never how many; the same place answers the same twice;
//   - the GLSL carries every flora and kind (the tables' sizes) and no backtick or reserved word of GLSL ES 3.
import { KINDS, FLORAS, HABIT, COMPANY, flowerCompanions, flowersAt, floraAt, flowerTable, floraNamed, FLOWERS_GLSL, DEFAULT_FLOWERS } from '../src/life/grassRules.js';
let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log('BROKEN: ' + what); } };
const kinds = KINDS.slice(1), floras = FLORAS.slice(1);
check(kinds.length >= 20, `twenty kinds and more (${kinds.length})`);
for (const h in HABIT) check(kinds.some((k) => k.habit === HABIT[h]), `a kind of habit ${h}`);
check(new Set(kinds.map((k) => k.name)).size === kinds.length, 'every kind its own name');
for (const f of floras) for (const k of [...f.lead, f.slope, ...f.with, ...(f.turf ? [f.turf] : [])]) check(k >= 1 && k < KINDS.length, `${f.name}: kind ${k} exists`);
for (const f of floras) check(f.lead.length >= 1 && f.lead.length <= 6, `${f.name}: one to six leading kinds`);
for (const f of floras) check(f.with.length >= 2 && f.with.length <= 4, `${f.name}: two to four companions`);
// the companions of each leading kind: never the kind itself, never the same two, of another habit where the list has one
for (const f of floras) for (const lead of [...f.lead, f.slope]) for (let h = 0; h < 1; h += 0.05) {
  const [a, b] = flowerCompanions(f, lead, h, (h * 7.3) % 1), other = f.with.filter((k) => k !== lead && KINDS[k].habit !== KINDS[lead].habit);
  check(a !== lead && b !== lead || f.with.filter((k) => k !== lead).length < 2, `${f.name}: a companion is not the kind it stands among`);
  check(a !== b || f.with.filter((k) => k !== lead).length < 2, `${f.name}: two companions, not one twice`);
  if (other.length >= 2) check(KINDS[a].habit !== KINDS[lead].habit && KINDS[b].habit !== KINDS[lead].habit, `${f.name}: companions of ${KINDS[lead].name} of other habits`);
}
// a square of 4 km on a world 250 km in radius, 20 m apart
const at = (i, j) => [240000 + i, j - 2000, 70000];
for (let fi = 1; fi < FLORAS.length; fi++) {
  const f = FLORAS[fi]; let n = 0, fl = 0, heart = 0;
  for (let j = 0; j < 4000; j += 20) for (let i = 0; i < 4000; i += 20) { const v = flowersAt(...at(i, j), fi); n++; if (v) { fl++; if (v - Math.floor(v) > 0.5 * f.many) heart++; check(f.lead.includes(Math.floor(v)) || f.with.includes(Math.floor(v)), `${f.name}: only its leading kinds and companions on level ground (${Math.floor(v)})`); } }
  const share = heart / n;
  check(share > 0.3 * f.rich && share < 1.6 * f.rich + 0.05, `${f.name}: meadows on about ${f.rich} of the land (${share.toFixed(2)})`);
  check(fl / n < 0.8, `${f.name}: plain grass between the meadows (${(1 - fl / n).toFixed(2)} of the land)`);
  // one kind leads a patch, with companions: in squares of 30 m inside meadows, the commonest
  // kind's share, and how many squares show three kinds and more (each on a twentieth or more)
  let squares = 0, lead = 0, three = 0, compS = 0, compM = 0;
  for (let j = 0; j < 4000; j += 200) for (let i = 0; i < 4000; i += 200) {
    const c = {}; let m = 0;
    for (let y = 0; y < 30; y += 2) for (let x = 0; x < 30; x += 2) { const v = flowersAt(...at(i + x, j + y), fi); if (v) { m++; c[Math.floor(v)] = (c[Math.floor(v)] || 0) + 1; } }
    if (m < 120) continue;
    squares++; lead += Math.max(...Object.values(c)) / m; if (Object.values(c).filter((v) => v / m >= 0.05).length >= 3) three++;
  }
  check(squares > 5 && lead / squares > 0.42 && lead / squares < 0.75, `${f.name}: one kind leads a patch, about half of it (${squares} squares, ${(lead / Math.max(1, squares)).toFixed(2)})`);
  check(three / Math.max(1, squares) > 0.8, `${f.name}: three kinds and more in a patch (${(three / Math.max(1, squares)).toFixed(2)} of the squares)`);
  // the ground's mean of the companions' share (flowerTint, when a pixel is too wide to tell
  // their clumps) against the rule's own share over a stretch of meadow
  const was = COMPANY.at;
  for (let j = 0; j < 4000; j += 7) for (let i = 0; i < 4000; i += 7) { const v = flowersAt(...at(i, j), fi); if (!v) continue; compM++; COMPANY.at = 9; if (Math.floor(flowersAt(...at(i, j), fi)) !== Math.floor(v)) compS++; COMPANY.at = was; }
  const pm = (t) => 0.5 * (1 - Math.min(1, Math.max(0, (t - 0.5) / 0.45))) ** 2;
  let mean = 0; for (let p = 0.2; p < 0.8; p += 0.01) { const a = pm(COMPANY.at - COMPANY.pool * p), b = pm(COMPANY.at - COMPANY.pool * (1 - p)); mean += (a + b * (1 - a)) / 60; }
  check(compS / compM > 0.75 * mean && compS / compM < 1.33 * mean, `${f.name}: the companions' share (${(compS / compM).toFixed(2)}) about the ground's mean (${mean.toFixed(2)})`);
  // a hillside: where it flowers thickly, the slope's kind alone
  let hill = 0, alone = 0;
  for (let j = 0; j < 4000; j += 20) for (let i = 0; i < 4000; i += 20) { const v = flowersAt(...at(i, j), fi, 0.32), w = flowersAt(...at(i, j), fi, 0); if (v - Math.floor(v) > 0.6 * f.many && !w) { hill++; if (Math.floor(v) === f.slope) alone++; } }
  check(hill > 200 && alone / hill > 0.62, `${f.name}: hillsides led by its slope kind, companions sparse inside and more at the edges (${hill} places, ${(alone / Math.max(1, hill)).toFixed(2)} the slope kind)`);
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
