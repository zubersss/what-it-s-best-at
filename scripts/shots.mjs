// Headless screenshots of the camera bookmarks. See CLAUDE.md.
//   node scripts/shots.mjs [--world mars] [--shot ledge,sun] [--size 880x412] [--dsf 1.25] [--out docs/shots]
//                          [--query "t=0.5&hud=1"] [--suffix _x] [--timeout 300] [--touch]
//                          [--dist] [--distdir <copy of a build>]
// Without --shot: every bookmark of the world. The default size is the reference set's
// (the phone's shape, S23 Ultra landscape: 880x412 CSS px at --dsf 1.25), because the
// default --out is the reference folder and the file names are the reference set's.
// For sharpness at the phone's real density add --dsf 3.5 and another --out or a --suffix.
// The run fails (exit code 1) when a picture was not ready in time, the page logged an
// error, a shader failed to compile or link, or a shader is over a phone's limits.
// Headless Chromium uses software WebGL: frame rates here mean nothing.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';
import { shaderUse, overPhone } from './lib/glLimits.mjs';
import { getWorld } from '../src/worlds/index.js';

const world = opt('world', 'mars');
const shots = (opt('shot', '') || Object.keys(getWorld(world).scene.bookmarks).join(',')).split(',');
const [W, H] = opt('size', '880x412').split('x').map(Number);
const outDir = path.resolve(root, opt('out', 'docs/shots'));
const extraQuery = opt('query', '');
const suffix = opt('suffix', '');
const timeoutS = Number(opt('timeout', '300'));
const dsf = Number(opt('dsf', '1.25'));              // device scale factor (the phone's own is ~3.5)

await mkdir(outDir, { recursive: true });
// --dist serves the production build (run `npm run build` first) instead of the dev server.
// --touch emulates a touch device.
const { base, page, errors, snap, goto, close } = await open({ dist: flag('dist'), width: W, height: H, dsf, touch: flag('touch') });

const summary = {};
let failed = false;
for (const shot of shots) {
  const url = `${base}?world=${world}&shot=${shot}${extraQuery ? '&' + extraQuery : ''}`;
  const t0 = Date.now();
  errors.length = 0;                     // each error is charged to the picture it happened in
  await goto(url);
  try {
    await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: timeoutS * 1000, polling: 250 });
  } catch {
    console.log(`  ${shot}: not ready after ${timeoutS}s — saving what is on screen`);
    failed = true;
  }
  const err = await page.evaluate(() => window.__shotError || null);
  if (err) { console.log(`  ${shot}: ERROR ${err}`); failed = true; }
  // A shader over a phone's limits renders here and draws nothing on the phone; one that
  // failed here draws nothing at all, and the picture would be saved with something missing.
  try {
    const use = await shaderUse(page);
    for (const l of overPhone(use)) { console.log(`  ${shot}: OVER A PHONE'S LIMITS — ${l}`); failed = true; }
    const unlinked = use.filter((p) => !p.linked).length, shaderErrors = await page.evaluate(() => window.__app?.shaderErrors || []);
    if (unlinked || shaderErrors.length) { console.log(`  ${shot}: SHADER FAILED — ${unlinked} program(s) not linked${shaderErrors.length ? ': ' + shaderErrors.join(' / ') : ''}`); failed = true; }
  } catch (e) { if (!err) { console.log(`  ${shot}: could not check the shaders (${String(e).split('\n')[0]})`); failed = true; } }
  const stats = await page.evaluate(() => window.__stats || null);
  const file = path.join(outDir, `${world}_${shot}${suffix}.png`);
  if (!(await snap(file))) failed = true;
  // Errors the page logged and uncaught exceptions (warnings are printed but do not fail the run).
  if (errors.length) { console.log(`  ${shot}: PAGE ERRORS (${errors.length}) — ${errors.slice(0, 3).join(' | ')}`); failed = true; }
  summary[shot] = stats;
  console.log(`${world}/${shot}: ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(stats));
}
// Merged into the file that is there, so a run of a few bookmarks keeps the others' rows.
const statsFile = path.join(outDir, `${world}_stats${suffix}.json`);
let earlier = {};
try { earlier = JSON.parse(await readFile(statsFile, 'utf8')) || {}; } catch { /* none yet */ }
await writeFile(statsFile, JSON.stringify({ ...earlier, ...summary }, null, 2));
await close();
if (failed) console.log(`${world}${suffix}: FAILED — see the lines above`);
process.exit(failed ? 1 : 0);
