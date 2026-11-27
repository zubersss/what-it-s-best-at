// Headless smoke test of the parts a screenshot bookmark never touches: the start screen,
// Play, the Smooth/Sharp switch, the HUD states, and a complete benchmark run with its
// results screen.   node scripts/smoke.mjs [--dist] [--out <dir>] [--no-bench] [--soak] [--earth]
// --soak runs the 10-minute soak instead of the 3-minute benchmark (two extra laps, and
// the minute-by-minute table).
// Software WebGL: the frame rates it prints are meaningless; it checks that things work.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';
import { shaderUse, overPhone, countVaryings, PHONE } from './lib/glLimits.mjs';

const out = path.resolve(root, opt('out', 'docs/shots/ui'));
await mkdir(out, { recursive: true });
const { base, page, problems, snap, goto, close } = await open({ dist: flag('dist'), touch: true });
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) problems.push(name); };

// (on Mars: the game opens on Haven, whose wooded ground takes this machine seven seconds a
// frame; the start screen, the modes and the read-out are the same on any world. --haven
// runs the Haven benchmark, which opens there.)
await goto(base + '?world=mars');
await page.waitForSelector('#start', { timeout: 30000 });
check('start screen is up while loading', await page.isVisible('#start'));
await page.waitForFunction(() => window.__app?.loaded, null, { timeout: 240000 });
// Play waits for the ground under the start (or 20 s after the first terrain)
await page.waitForFunction(() => window.__app?.groundReady, null, { timeout: 120000 });
check('buttons unlock when the ground under the start is ready', await page.evaluate(() => ![...document.querySelectorAll('#start .row button')].some((b) => b.disabled)));
check('build shown on the start screen', /build \w+/.test(await page.textContent('#start .build')));
await page.waitForTimeout(8000);
await snap(path.join(out, 'start_screen.png'));
const before = await page.evaluate(() => window.__app.governor.mode);
// (noWaitAfter: a click otherwise waits for the page to come to rest, which at a frame
// every two seconds in a software renderer can take more than its 30 s)
await page.click('#start button.mode', { noWaitAfter: true, timeout: 240000 });
await page.waitForFunction((b) => window.__app.governor.mode !== b, before, { timeout: 60000 }).catch(() => {});
check('mode button switches Smooth <-> Sharp', (await page.evaluate(() => window.__app.governor.mode)) !== before);
await page.click('#start button.mode', { noWaitAfter: true, timeout: 240000 });
await page.waitForFunction((b) => window.__app.governor.mode === b, before, { timeout: 60000 }).catch(() => {});
await page.waitForSelector('#start button.primary:not([disabled])', { timeout: 300000 });   // (Play unlocks once the ground under the start is drawn)
await page.click('#start button.primary', { noWaitAfter: true, timeout: 240000 });
check('Play hides the start screen', !(await page.isVisible('#start')));
await page.waitForTimeout(6000);
check('compact HUD shows frame rate, resolution, mode and build', /fps · [\d.]+ MP · (Smooth|Sharp) · build \w+/.test(await page.textContent('#hud')));
await snap(path.join(out, 'playing_compact_hud.png'));
await page.evaluate(() => window.__app.hud.toggle());
// the HUD refreshes on the next rendered frame, and a software-rendered frame can take seconds
const fullHud = await page.waitForFunction(() => /quality\s+(Smooth|Sharp)/.test(document.querySelector('#hud').textContent), null, { timeout: 60000, polling: 500 }).then(() => true, () => false);
check('full HUD shows the quality line', fullHud);
await snap(path.join(out, 'playing_full_hud.png'));
console.log(await page.evaluate(() => window.__app.governor.summary), '| steps so far:', await page.evaluate(() => window.__app.governor.log.map((s) => s.text).join('; ')));

if (!flag('no-bench')) {
  // (--earth: the Earth benchmark; the cost test after the lap takes its time in a software renderer)
  const soak = flag('soak'), haven = flag('haven'), earth = flag('earth') || haven, limit = opt('limit', null) ? +opt('limit', 0) * 1000 : soak ? 760000 : haven ? 4800000 : earth ? 2400000 : 1500000;      // (--limit <seconds>: on a slow machine the Haven run takes hours)
  await goto(base + (soak ? '?world=mars&bench=soak' : haven ? '?world=haven&bench=haven' : earth ? '?world=earth&bench=earth' : '?world=mars&bench=run'));
  await page.waitForFunction(() => window.__app?.benchmark?.active, null, { timeout: earth ? 900000 : 240000 });
  check(`benchmark starts from ?bench=${soak ? 'soak' : 'run'}`, true);
  const t0 = Date.now();
  let shot = 0;
  for (;;) {
    const s = await page.evaluate(() => { const a = window.__app; return { done: !!window.__benchResult, phase: a.benchmark.phase, flight: a.benchmark.flight, world: a.world.id, agl: a.rig.agl, banner: document.querySelector('#benchbar span')?.textContent }; });
    if (s.done) break;
    if (Date.now() - t0 > limit) { check('benchmark finishes', false); break; }
    const elapsed = (Date.now() - t0) / 1000;
    if (elapsed > shot * (soak ? 60 : 20)) { console.log(`  ${elapsed.toFixed(0)}s ${s.banner} | world ${s.world} agl ${s.agl.toExponential(2)} ${s.phase === 5 ? s.flight : ''}`); if (shot % 2 === 0) await snap(path.join(out, `bench_${String(shot).padStart(2, '0')}.png`)); shot++; }
    await page.waitForTimeout(1000);
  }
  const text = await page.evaluate(() => window.__benchResult || '');
  check('results screen is up', await page.isVisible('#results'));
  // (the cost test: every view has its three lines, with numbers in them)
  if (!soak) check('the cost test measured each view', (text.match(/^what each thing costs to draw/gm) || []).length === (earth ? 3 : 1) && /everything on \d+\.\d \(from/.test(text) && !/everything on \? /.test(text), (text.match(/^what each thing costs.*$/gm) || []).join(' | ').slice(0, 200));
  // (what was handed to the GPU, by stop; and the cost test's groups, each with its two takes)
  check('every stop has its counts of what the GPU was handed', (text.match(/^      \d+\.\d passes · [\d.kM]+ draw calls · [\d.kM]+ triangles · uploads /gm) || []).length >= 6, (text.match(/^      \d+\.\d passes.*$/m) || [''])[0]);
  if (!soak) check('the cost test measured the groups twice each', /saved by leaving a group out/.test(text) && (text.match(/^    [^:\n]+: -?\d+\.\d \(-?\d+\.\d · -?\d+\.\d\)$/gm) || []).length >= 6 * (earth ? 3 : 1) && /every group out at once: -?\d+\.\d saved/.test(text), (text.match(/^    every group out.*$/m) || [''])[0]);
  check('the page\'s work is named by part at every stop', (text.match(/^      [a-z ]+ \d+\.\d( ·|$)/gm) || []).length >= 6);
  if (soak) check('soak has a minute-by-minute table with ten rows', (text.match(/^\s+\d+: [\d.]+ fps/gm) || []).length === 10);
  check('results have every line the owner asked for', ['average fps', '1% low', 'worst frame', 'render resolution', 'quality steps', 'hitches over 100 ms', 'GPU:', 'pixel ratio', 'mode', 'build'].every((k) => text.includes(k)));
  await snap(path.join(out, 'results_screen.png'));
  console.log('\n' + text + '\n');
  // (a click is three messages to the page, each answered between two frames, and a
  // software-drawn frame after a benchmark can take ten seconds: the usual 30 s ran out once)
  await page.click('#results button.primary', { noWaitAfter: true, timeout: 240000 });
  await page.waitForTimeout(500);
  console.log('copy button says:', await page.textContent('#results button.primary'));
  await page.click('#results .row button:not(.primary)', { noWaitAfter: true, timeout: 240000 });
  check('closing the results returns to the start screen', await page.isVisible('#start'));
}
// Every shader linked so far (after the benchmark: both worlds, the flight, the sky)
// against a phone's limits: the test browser would run a shader the phone cannot.
{
  const use = await shaderUse(page), over = overPhone(use);
  const most = use.reduce((a, p) => (p.fragTextures > a.fragTextures ? p : a), use[0]);
  console.log(`shaders: ${use.length}; most textures in one: ${most.fragTextures} of ${PHONE.fragTextures} (${most.textureNames.join(' ')})`);
  for (const l of over) console.log('  ' + l);
  check('the varying count reads every declaration (several on a line, matrices, arrays)', countVaryings('out vec3 a; out vec3 b;\nout mat3 m; out vec2 c[2];') === 7);
  check(`every shader fits a phone's limits (${PHONE.fragTextures} textures, ${PHONE.fragVectors} uniform vectors, ${PHONE.varyings} varyings)`, over.length === 0);
  check('no shader failed to compile or link', use.every((p) => p.linked) && !(await page.evaluate(() => window.__app.shaderErrors.length)));
}
console.log(problems.length ? `PROBLEMS:\n  ${problems.join('\n  ')}` : 'smoke test passed');
await close();
process.exit(problems.length ? 1 : 0);
