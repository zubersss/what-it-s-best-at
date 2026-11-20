// Scripted flight test (headless): start on Mars behind the flying character, climb out,
// aim at the Moon, fly there and check that the engine hands over to the Moon world.
//   node scripts/flight-test.mjs [--out <dir for screenshots, default .cache/flight>] [--dist] [--distdir <copy of a build>]
// Headless frames are slow, so the script acts on distances, not on timers.
// It FAILS (exit code 1, and a FAIL line naming each step) when a leg of the flight does
// not get where it should in its time, the Moon does not become the world underfoot, the
// flight does not end low over the Moon with ground drawn, or the page logs an error.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { open, opt, flag, args, root } from './lib/browser.mjs';

// (the output folder used to be the first bare argument: still accepted)
const out = path.resolve(root, opt('out', args[0] && !args[0].startsWith('--') ? args[0] : path.join('.cache', 'flight')));
mkdirSync(out, { recursive: true });
const { base, page, errors, goto, close } = await open({ dist: flag('dist'), width: 720, height: 340, dsf: 1 });
const fails = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  (' + extra + ')' : ''}`); if (!ok) fails.push(name); return ok; };
try {
await goto(base + '?world=mars&hud=0&scale=0.6');
await page.waitForFunction(() => window.__app && window.__app.loaded, null, { timeout: 120000 });
const state = () => page.evaluate(() => { const a = window.__app; return { world: a.world.id, agl: a.rig.agl, speed: a.rig.velocity.length(), nearest: a.nearestName, clear: a.nearestClear, drawn: a.terrain.drawList.length, frame: a.frameCount }; });
const fmt = (s) => `${s.world} agl ${s.agl.toExponential(2)} m, speed ${s.speed.toExponential(2)} m/s, nearest ${s.nearest} ${s.clear.toExponential(2)} m, chunks ${s.drawn}, frame ${s.frame}`;
const snap = async (name) => { try { await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); } catch { console.log('snap failed', name); } console.log(name, '::', fmt(await state())); };
const until = async (cond, maxSeconds, every, tick) => {
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < maxSeconds * 1000) { const s = await state(); if (cond(s)) return true; if (tick) await tick(s, n++); await page.waitForTimeout(every); }
  return false;
};

await page.waitForSelector('#start button.primary:not([disabled])', { timeout: 300000 });   // (Play unlocks once the ground under the start is drawn)
await page.click('#start button.primary', { noWaitAfter: true });            // Play
await page.waitForTimeout(8000);
await snap('00_start');
const start = await state();
check('starts on Mars', start.world === 'mars', fmt(start));
await page.keyboard.down('KeyE');
check('holding up climbs past 20 km', await until((s) => s.agl > 2e4, 200, 1500), fmt(await state()));
await snap('01_20km');
check('and on to orbit, 1200 km up', await until((s) => s.agl > 1.2e6, 200, 1500), fmt(await state()));
await page.keyboard.up('KeyE');
await page.waitForTimeout(6000);
await snap('02_orbit');
await page.evaluate(() => window.__app.aimAt('moon'));
await page.waitForTimeout(2500);
await snap('03_aim_moon');
await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
let shots = 0;
const reached = await until((s) => s.world === 'moon' && s.agl < 4e6, 600, 1200, async (s, n) => {
  await page.evaluate(() => window.__app.aimAt('moon'));            // keep the nose on it
  if (n % 25 === 12 && shots < 6) await snap(`04_cruise_${shots++}`);
});
check('reached the Moon: it is the world underfoot, under 4000 km up', reached, fmt(await state()));
await page.keyboard.up('ShiftLeft');
const low = await until((s) => s.world === 'moon' && s.agl < 6e4, 300, 1200, async () => { await page.evaluate(() => { window.__app.rig.pitch = -85; }); });     // nose down: descend
check('nose down: descends to under 60 km', low, fmt(await state()));
await page.keyboard.up('KeyW');
await snap('05_low_orbit');
await page.waitForTimeout(25000);
await snap('06_settled');
// With the keys released the flight must end low over the Moon (or standing on it), not
// thrown back out or through the ground, and with ground on screen.
const end = await state();
check('ends low over the Moon with ground drawn', end.world === 'moon' && Number.isFinite(end.agl) && end.agl > -1 && end.agl < 1e5 && end.drawn > 0, fmt(end));
} catch (e) {
  check('the script runs to its end', false, String(e).split('\n')[0]);       // (a wait that timed out, a page that would not load)
}
check('no errors in the page', errors.length === 0, errors.slice(0, 6).join(' | '));
await close().catch(() => {});
console.log(fails.length ? `flight test FAILED: ${fails.join('; ')}` : 'flight test passed');
process.exit(fails.length ? 1 : 0);
