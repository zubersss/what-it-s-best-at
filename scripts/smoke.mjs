// Headless smoke test of the parts a screenshot bookmark never touches: the start screen,
// Play, the Smooth/Sharp switch, the HUD states, and a complete benchmark run with its
// results screen.   node scripts/smoke.mjs [--dist] [--out <dir>] [--no-bench]
// Software WebGL: the frame rates it prints are meaningless; it checks that things work.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';

const out = path.resolve(root, opt('out', 'docs/shots/ui'));
await mkdir(out, { recursive: true });
const { base, page, problems, snap, goto, close } = await open({ dist: flag('dist'), touch: true });
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) problems.push(name); };

await goto(base);
await page.waitForSelector('#start', { timeout: 30000 });
check('start screen is up while loading', await page.isVisible('#start'));
await page.waitForFunction(() => window.__app?.loaded, null, { timeout: 240000 });
check('buttons unlock when the terrain is ready', await page.evaluate(() => ![...document.querySelectorAll('#start .row button')].some((b) => b.disabled)));
check('build shown on the start screen', /build \w+/.test(await page.textContent('#start .build')));
await page.waitForTimeout(8000);
await snap(path.join(out, 'start_screen.png'));
const before = await page.evaluate(() => window.__app.governor.mode);
await page.click('#start button.mode');
check('mode button switches Smooth <-> Sharp', (await page.evaluate(() => window.__app.governor.mode)) !== before);
await page.click('#start button.mode');
await page.click('#start button.primary');
check('Play hides the start screen', !(await page.isVisible('#start')));
await page.waitForTimeout(6000);
check('compact HUD shows frame rate, resolution, mode and build', /fps · [\d.]+ MP · (Smooth|Sharp) · build \w+/.test(await page.textContent('#hud')));
await snap(path.join(out, 'playing_compact_hud.png'));
await page.evaluate(() => window.__app.hud.toggle());
await page.waitForTimeout(4000);
check('full HUD shows the quality line', /quality\s+(Smooth|Sharp)/.test(await page.textContent('#hud')));
await snap(path.join(out, 'playing_full_hud.png'));
console.log(await page.evaluate(() => window.__app.governor.summary), '| steps so far:', await page.evaluate(() => window.__app.governor.log.map((s) => s.text).join('; ')));

if (!flag('no-bench')) {
  await goto(base + '?bench=run');
  await page.waitForFunction(() => window.__app?.benchmark?.active, null, { timeout: 240000 });
  check('benchmark starts from ?bench=run', true);
  const t0 = Date.now();
  let shot = 0;
  for (;;) {
    const s = await page.evaluate(() => { const a = window.__app; return { done: !!window.__benchResult, phase: a.benchmark.phase, flight: a.benchmark.flight, world: a.world.id, agl: a.rig.agl, banner: document.querySelector('#benchbar span')?.textContent }; });
    if (s.done) break;
    if (Date.now() - t0 > 330000) { check('benchmark finishes', false); break; }
    const elapsed = (Date.now() - t0) / 1000;
    if (elapsed > shot * 20) { console.log(`  ${elapsed.toFixed(0)}s ${s.banner} | world ${s.world} agl ${s.agl.toExponential(2)} ${s.phase === 5 ? s.flight : ''}`); if (shot % 2 === 0) await snap(path.join(out, `bench_${String(shot).padStart(2, '0')}.png`)); shot++; }
    await page.waitForTimeout(1000);
  }
  const text = await page.evaluate(() => window.__benchResult || '');
  check('results screen is up', await page.isVisible('#results'));
  check('results have every line the owner asked for', ['average fps', '1% low', 'worst frame', 'render resolution', 'quality steps', 'hitches over 100 ms', 'GPU:', 'pixel ratio', 'mode', 'build'].every((k) => text.includes(k)));
  await snap(path.join(out, 'results_screen.png'));
  console.log('\n' + text + '\n');
  await page.click('#results button.primary');
  await page.waitForTimeout(500);
  console.log('copy button says:', await page.textContent('#results button.primary'));
  await page.click('#results .row button:not(.primary)');
  check('closing the results returns to the start screen', await page.isVisible('#start'));
}
console.log(problems.length ? `PROBLEMS:\n  ${problems.join('\n  ')}` : 'smoke test passed');
await close();
process.exit(problems.length ? 1 : 0);
