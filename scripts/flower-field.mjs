// Where the flowers of a flora lie, from straight above, without a browser in a second:
// the rule itself (life/grassRules.js) over a square of ground, each place the colour of
// what flowers there on grass gold (level ground; --slope 0.3: a hillside).
//   node scripts/flower-field.mjs [--flora steppe] [--span 2000] [--slope 0] [--out file.png] [--size 800]
import { flowersAt, floraNamed, KINDS, FLORAS } from '../src/life/grassRules.js';
import { encodePNG } from './lib/png.mjs';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const flora = floraNamed(opt('flora', 'steppe')), span = +opt('span', 2000), N = +opt('size', 800), slope = +opt('slope', 0), out = opt('out', 'flower-field.png');
const rgb = new Uint8Array(N * N * 3), count = {}; let any = 0;
const g = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  // (a square on the plane z = 0.3 R through a world 250 km in radius: any plane will do, the rule is the place's own)
  const v = flowersAt(240000 + (i + 0.5) * span / N, (j + 0.5) * span / N - span / 2, 70000, flora, slope, span / N < 2), k = Math.floor(v), many = v - k;
  let c = [0.30, 0.20, 0.05];
  if (k) { any++; count[KINDS[k].name] = (count[KINDS[k].name] || 0) + 1; const p = KINDS[k].a; c = c.map((x, q) => x + (p[q] - x) * Math.min(1, many * 1.1)); }
  rgb.set(c.map(g), (j * N + i) * 3);
}
writeFileSync(out, encodePNG(N, N, rgb));
console.log(`${FLORAS[flora].name}: ${span} m across, slope ${slope}; flowers on ${(100 * any / (N * N)).toFixed(1)} % of it`);
for (const [k, n] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${(100 * n / (N * N)).toFixed(1)} %`);
console.log('-> ' + out);
