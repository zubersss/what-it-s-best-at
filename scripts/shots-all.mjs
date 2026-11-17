// The full reference set: every bookmark on every world, each world from orbit, and the
// character. Builds the site first and takes every picture from dist/, in the phone's
// shape (880 x 412 CSS px).   node scripts/shots-all.mjs [--no-build] [--only moon] [--out docs/shots]
// Software WebGL: expect 1-3 minutes per picture. Run it in the background.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, opt, flag } from './lib/browser.mjs';

const out = opt('out', 'docs/shots'), only = opt('only', '');
// [world, bookmarks, extra URL query, file suffix]
const SETS = [
  ['mars', 'ledge,sun,wall,ship,dusk', '', ''],
  ['moon', 'ledge,sun,wall,ship,dusk', '', ''],
  // from orbit: low and oblique, then the whole globe from straight above the site
  ['mars', 'ledge', 'alt=250000&pitch=-22', '_orbit_low'],
  ['mars', 'ledge', 'alt=6000000&pitch=-89', '_orbit_globe'],
  ['moon', 'ledge', 'alt=120000&pitch=-22', '_orbit_low'],
  ['moon', 'ledge', 'alt=3500000&pitch=-89', '_orbit_globe'],
  // the character
  ['mars', 'ledge', 'hero=1', '_hero_flight'],
  ['mars', 'ship', 'hero=1&heropose=hover', '_hero_hover'],
  ['mars', 'ledge', 'hero=1&alt=400000&pitch=-20', '_hero_orbit'],
  ['moon', 'ship', 'hero=1&heropose=hover', '_hero_hover'],
  ['moon', 'ledge', 'hero=1', '_hero_flight'],
];

if (!flag('no-build')) {
  const b = spawnSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' });
  if (b.status !== 0) process.exit(1);
}
let failed = 0;
for (const [world, shots, query, suffix] of SETS) {
  if (only && !`${world}${suffix}`.includes(only)) continue;
  const a = ['scripts/shots.mjs', '--dist', '--world', world, '--shot', shots, '--size', '880x412', '--dsf', '1.25', '--timeout', '480', '--out', out];   // night scenes need ~570 frames for exposure to settle
  if (query) a.push('--query', query);
  if (suffix) a.push('--suffix', suffix);
  const r = spawnSync('node', a, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `${failed} set(s) had problems` : `reference set saved in ${path.join(out)}`);
process.exit(failed ? 1 : 0);
