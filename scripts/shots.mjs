// Headless screenshots of the camera bookmarks. See CLAUDE.md.
//   node scripts/shots.mjs [--world mars] [--shot ledge,sun] [--size 1280x720] [--out docs/shots] [--dist]
//                          [--query "t=0.5&hud=1"] [--suffix _x] [--timeout 240] [--dsf 2] [--touch]
// Phone-shaped example (S23 Ultra landscape is about 880x412 CSS px): --size 880x412 --dsf 2 --touch
// Headless Chromium uses software WebGL: frame rates here mean nothing.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';
import { shaderUse, overPhone } from './lib/glLimits.mjs';

const world = opt('world', 'mars');
const shots = opt('shot', 'ledge,sun,wall,ship,dusk').split(',');
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const outDir = path.resolve(root, opt('out', 'docs/shots'));
const extraQuery = opt('query', '');
const suffix = opt('suffix', '');
const timeoutS = Number(opt('timeout', '300'));
const dsf = Number(opt('dsf', '1'));                 // device scale factor (a phone is ~2.6–3.5)

await mkdir(outDir, { recursive: true });
// --dist serves the production build (run `npm run build` first) instead of the dev server.
// --touch emulates a touch device.
const { base, page, snap, goto, close } = await open({ dist: flag('dist'), width: W, height: H, dsf, touch: flag('touch') });

const summary = {};
let failed = false;
for (const shot of shots) {
  const url = `${base}?world=${world}&shot=${shot}${extraQuery ? '&' + extraQuery : ''}`;
  const t0 = Date.now();
  await goto(url);
  try {
    await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: timeoutS * 1000, polling: 250 });
  } catch {
    console.log(`  ${shot}: not ready after ${timeoutS}s — saving what is on screen`);
    failed = true;
  }
  const err = await page.evaluate(() => window.__shotError || null);
  if (err) { console.log(`  ${shot}: ERROR ${err}`); failed = true; }
  // A shader over a phone's limits renders here and draws nothing on the phone.
  try { for (const l of overPhone(await shaderUse(page))) { console.log(`  ${shot}: OVER A PHONE'S LIMITS — ${l}`); failed = true; } } catch { /* no app */ }
  const stats = await page.evaluate(() => window.__stats || null);
  const file = path.join(outDir, `${world}_${shot}${suffix}.png`);
  if (!(await snap(file))) failed = true;
  summary[shot] = stats;
  console.log(`${world}/${shot}: ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(stats));
}
await writeFile(path.join(outDir, `${world}_stats${suffix}.json`), JSON.stringify(summary, null, 2));
await close();
process.exit(failed ? 1 : 0);
