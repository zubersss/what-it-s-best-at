// The target list, the marker and a GO trip in the real game, as a phone player would use
// them (headless; frame rates mean nothing).   node scripts/target-test.mjs [--dist] [--out dir]
// Opens the list with TARGET, picks a place, checks the marker and its label, presses GO,
// and watches the distance shrink; then cycles with T to a body in the sky.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';

const out = path.resolve(root, opt('out', '.cache/target'));
await mkdir(out, { recursive: true });
const { base, page, problems, snap, goto, close } = await open({ dist: flag('dist'), touch: true });
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  (' + extra + ')' : ''}`); if (!ok) problems.push(name); };

await goto(`${base}?world=mars&touch=1&scale=0.4`);          // (a low render scale: frames are slow here)
await page.waitForFunction(() => window.__app?.groundReady, null, { timeout: 400000 });
await page.click('#start button.primary');
await page.waitForTimeout(3000);

// TARGET opens the list
await page.dispatchEvent('#tbuttons button[data-act="target"]', 'pointerdown');
await page.waitForSelector('#picker:not(.hidden)', { timeout: 30000 });
const entries = await page.$$eval('#picker button b', (b) => b.map((x) => x.textContent));
check('the list has this world\'s places and the sky', entries.includes('Olympus Mons') && entries.includes('Phobos') && entries.includes('Sun'), entries.length + ' entries');
await snap(path.join(out, '1_list.png'));
await page.click('#picker button:has-text("Olympus Mons")');
// frames are slow here: wait for the marker to carry its label
await page.waitForFunction(() => /GO \d/.test(document.querySelector('#target')?.textContent || ''), null, { timeout: 120000 }).catch(() => {});
check('picking closes the list', await page.isHidden('#picker'));
const label = async () => page.evaluate(() => document.querySelector('#target')?.textContent || '');
const l1 = await label();
check('the marker names the target, its distance and the trip time', /Olympus Mons/.test(l1) && /km/.test(l1) && /GO \d/.test(l1), l1);
check('GO appears', await page.isVisible('#touch button[data-act="go"]'));
await snap(path.join(out, '2_marker.png'));

// GO: the distance shrinks
// distance along the ground to the place (the straight line runs through the world)
const gap = () => page.evaluate(() => { const a = window.__app, t = a.resolveTarget(a.targetId, {}), p = a.rig.pos; const c = (p.x * t.pos[0] + p.y * t.pos[1] + p.z * t.pos[2]) / (p.length() * Math.hypot(...t.pos)); return Math.acos(Math.min(1, c)) * a.world.radius; });
const g0 = await gap();
await page.dispatchEvent('#touch button[data-act="go"]', 'pointerdown');
await page.waitForTimeout(500);
check('GO starts a trip', await page.evaluate(() => window.__app.transfer));
// Frames are slow and uneven here, and each counts as at most 0.1 s of flight: wait for
// 300 frames (30 s of the trip or more) rather than for a time, at most 15 minutes.
let g1 = g0, alt = 0;
const f0 = await page.evaluate(() => window.__app.frameCount), t0 = Date.now();
while (Date.now() - t0 < 900000) {
  await page.waitForTimeout(3000);
  g1 = await gap(); alt = await page.evaluate(() => window.__app.rig.agl);
  if (!(await page.evaluate(() => window.__app.transfer)) || g1 < 0.5 * g0) break;
  if ((await page.evaluate(() => window.__app.frameCount)) - f0 > 300) break;
}
check('the trip climbs and closes on the place', g1 < 0.9 * g0 && alt > 100, `${(g0 / 1e3).toFixed(0)} km -> ${(g1 / 1e3).toFixed(0)} km, ${(alt / 1e3).toFixed(1)} km up`);
await snap(path.join(out, '3_trip.png'));
const l2 = await label();
check('during the trip the marker counts down', /arriving in|here/.test(l2), l2);

// T cycles the targets; the stick takes control back
await page.keyboard.press('KeyT');
await page.waitForFunction(() => window.__app.targetId !== 'place:olympus', null, { timeout: 120000 }).catch(() => {});
check('a key press of T picks the next target and ends the trip', !(await page.evaluate(() => window.__app.transfer)) && (await page.evaluate(() => window.__app.targetId)) !== 'place:olympus');
await snap(path.join(out, '4_next.png'));

console.log(problems.length ? `PROBLEMS:\n  ${problems.join('\n  ')}` : 'target test passed');
await close();
process.exit(problems.length ? 1 : 0);
