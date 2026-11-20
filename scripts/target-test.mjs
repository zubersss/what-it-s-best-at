// The target list, the marker and a GO trip in the real game, as a phone player would use
// them (headless; frame rates mean nothing).   node scripts/target-test.mjs [--dist] [--out dir]
// Opens the list with TARGET, picks a place, checks the marker and its label, presses GO,
// and watches the distance shrink; then the T key picks the next target, which ends the trip.
// Last, real touches (sent through the browser's own touch input, so they hit whatever is
// on top at that spot): the move stick on the left ends a GO trip, pushed to its rim it
// boosts, letting go centres it, and a drag on the right turns the view. The buttons
// above are pressed with made-up pointer events, which do not test what covers them.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';

const out = path.resolve(root, opt('out', '.cache/target'));
await mkdir(out, { recursive: true });
const { base, page, problems, snap, goto, close } = await open({ dist: flag('dist'), touch: true });
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  (' + extra + ')' : ''}`); if (!ok) problems.push(name); };

await goto(`${base}?world=mars&touch=1&scale=0.4`);          // (a low render scale: frames are slow here)
await page.waitForFunction(() => window.__app?.groundReady, null, { timeout: 400000 });
await page.waitForSelector('#start button.primary:not([disabled])', { timeout: 300000 });   // (Play unlocks once the ground under the start is drawn)
await page.click('#start button.primary', { noWaitAfter: true });
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

// T picks the next target, and that ends the trip
await page.keyboard.press('KeyT');
await page.waitForFunction(() => window.__app.targetId !== 'place:olympus', null, { timeout: 120000 }).catch(() => {});
check('a key press of T picks the next target and ends the trip', !(await page.evaluate(() => window.__app.transfer)) && (await page.evaluate(() => window.__app.targetId)) !== 'place:olympus');
await snap(path.join(out, '4_next.png'));

// The phone's own input: touches on the canvas (src/controls/touch.js). Left 38 % of the
// screen is the move stick, the rest is drag-to-look. Software frames are slow, so every
// step waits on the game's own state. A step that cannot be done is reported as a FAIL
// with the reason; it never passes by being skipped.
try {
  const { width: VW, height: VH } = page.viewportSize();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
  const waitFor = (fn, arg, seconds) => page.waitForFunction(fn, arg, { timeout: seconds * 1000, polling: 200 }).then(() => true, () => false);
  const frames = async (n) => { const f = await page.evaluate(() => window.__app.frameCount); return waitFor((g) => window.__app.frameCount >= g, f + n, 180); };
  const stick = () => page.evaluate(() => { const a = window.__app; return { x: a.input.moveX, y: a.input.moveY, on: document.querySelector('#stick').classList.contains('on'), boost: !!a.rig.boost, speed: a.rig.velocity.length(), mode: a.rig.mode, onFoot: a.rig.onFoot, transfer: !!a.transfer }; });
  const fwd = () => page.evaluate(() => window.__app.rig.forward.toArray());
  const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;

  // a trip under way again (to the far place, so it cannot simply arrive)
  await page.evaluate(() => window.__app.pickTarget('place:olympus'));
  await page.dispatchEvent('#touch button[data-act="go"]', 'pointerdown');
  const going = await waitFor(() => window.__app.transfer === true, null, 60);
  check('touch: a trip is under way before the stick is touched', going);

  // the stick: touch the left of the screen, push half-way up
  const sx = VW * 0.12, sy = VH * 0.62;
  await touch('touchStart', sx, sy);
  await touch('touchMove', sx, sy - 15);
  await touch('touchMove', sx, sy - 30);
  const pushed = await waitFor(() => window.__app.input.moveY > 0.3, null, 60);
  let st = await stick();
  check('touch: a finger on the left of the screen works the move stick', pushed && st.on && Math.abs(st.x) < 0.2, `stick ${st.x.toFixed(2)}, ${st.y.toFixed(2)}${st.on ? '' : ', the stick is not shown'}`);
  const handedBack = await waitFor(() => window.__app.transfer === false, null, 180);
  check('touch: the stick takes control back from GO', going && handedBack);
  await frames(2);
  st = await stick();
  check('touch: half a push flies without boost', st.mode === 'hero' && !st.onFoot && !st.boost, `mode ${st.mode}${st.onFoot ? ', on foot' : ''}, ${st.speed.toExponential(2)} m/s`);

  // pushed past the rim: the knob stops at the rim, and that is boost
  await touch('touchMove', sx, sy - 60);
  await touch('touchMove', sx, sy - 95);
  const boosted = await waitFor(() => { const a = window.__app; return Math.hypot(a.input.moveX, a.input.moveY) > 0.96 && a.rig.boost === true; }, null, 180);
  await frames(3);
  const st2 = await stick();
  check('touch: pushed to the rim the stick stops at 1 and boosts', boosted && Math.hypot(st2.x, st2.y) < 1.001, `stick ${st2.x.toFixed(2)}, ${st2.y.toFixed(2)}, boost ${st2.boost}, ${st.speed.toExponential(2)} -> ${st2.speed.toExponential(2)} m/s`);
  await snap(path.join(out, '5_stick.png'));

  // let go: the stick centres and hides
  await touch('touchEnd');
  const released = await waitFor(() => { const a = window.__app; return a.input.moveX === 0 && a.input.moveY === 0 && !document.querySelector('#stick').classList.contains('on'); }, null, 60);
  check('touch: letting go centres the stick', released);

  // drag on the right: the view turns (against how far it wanders by itself in the same time)
  await frames(2);
  const f0 = await fwd();
  await frames(2);
  const f1 = await fwd();
  const lx = VW * 0.55, ly = VH * 0.6;
  await touch('touchStart', lx, ly);
  for (const d of [40, 80, 120]) await touch('touchMove', lx + d, ly);
  await frames(2);
  await touch('touchEnd');
  const f2 = await fwd();
  const drift = angle(f0, f1), turned = angle(f1, f2);
  check('touch: a drag on the right of the screen turns the view', turned - drift > 5, `turned ${turned.toFixed(1)} deg, ${drift.toFixed(2)} deg by itself in the same time`);
  st = await stick();
  check('touch: looking around leaves the stick alone', st.x === 0 && st.y === 0 && !st.on);
} catch (e) {
  check('touch: the stick and look checks could be run', false, String(e).split('\n')[0]);
}

console.log(problems.length ? `PROBLEMS:\n  ${problems.join('\n  ')}` : 'target test passed');
await close();
process.exit(problems.length ? 1 : 0);
