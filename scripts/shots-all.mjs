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
  ['mars', 'ledge,sun,wall,ship,dusk,canyon,olympus,gale', '', ''],
  ['moon', 'ledge,sun,wall,ship,dusk,tycho,taurus', '', ''],
  // from orbit (above the sunset view along the canyon): low and oblique, then the whole globe from straight above (north
  // up) at the scene's own moment, by day and by night
  ['mars', 'canyon', 'alt=250000&pitch=-22', '_orbit_low'],
  ['mars', 'canyon', 'alt=6000000&pitch=-89&heading=0', '_orbit_globe'],
  ['mars', 'canyon', 'alt=6000000&pitch=-89&heading=0&t=-5', '_orbit_day'],
  ['mars', 'canyon', 'alt=6000000&pitch=-89&heading=0&t=5', '_orbit_night'],
  ['moon', 'ledge', 'alt=120000&pitch=-22', '_orbit_low'],
  ['moon', 'ledge', 'alt=3500000&pitch=-89&heading=0', '_orbit_globe'],
  ['moon', 'ledge', 'lat=0&lon=0&alt=8000000&pitch=-89&heading=0&fov=30', '_orbit_day'],     // the near side, terminator across it
  ['moon', 'ledge', 'alt=3500000&pitch=-89&heading=0&t=345', '_orbit_night'],                // earthlit
  // Mars's moons through a long lens: half-lit Phobos an hour before the scene, Deimos at dusk
  ['mars', 'canyon', 'aim=phobos&fov=1.0&t=-1', '_phobos'],
  ['mars', 'canyon', 'aim=deimos&fov=0.35&t=1.5', '_deimos'],
  // the character
  ['mars', 'ledge', 'hero=1', '_hero_flight'],
  ['mars', 'ship', 'hero=1&heropose=hover', '_hero_hover'],
  ['mars', 'ship', 'hero=1&heropose=hover&dust=1&pitch=-28', '_hero_dust'],
  ['mars', 'canyon', 'hero=1&alt=400000&pitch=-20', '_hero_orbit'],
  ['moon', 'ship', 'hero=1&heropose=hover', '_hero_hover'],
  ['moon', 'ship', 'hero=1&heropose=hover&dust=1&pitch=-28', '_hero_dust'],
  ['moon', 'ledge', 'hero=1', '_hero_flight'],
];

if (!flag('no-build')) {
  const b = spawnSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' });
  if (b.status !== 0) process.exit(1);
}
let failed = 0;
for (const [world, shots, query, suffix] of SETS) {
  if (only && !`${world}${suffix}`.includes(only)) continue;
  const a = ['scripts/shots.mjs', '--dist', '--world', world, '--shot', shots, '--size', '880x412', '--dsf', '1.25', '--timeout', '720', '--out', out];   // night scenes need ~570 frames for exposure to settle, the busiest day views ~270
  if (query) a.push('--query', query);
  if (suffix) a.push('--suffix', suffix);
  const r = spawnSync('node', a, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `${failed} set(s) had problems` : `reference set saved in ${path.join(out)}`);
process.exit(failed ? 1 : 0);
