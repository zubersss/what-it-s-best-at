// Headless check of the character on foot in the real game: Play, walk, jump, super
// speed, take off by holding up, and land again with the stick released. It waits on the
// game's own state (software rendering is slow; frame times say nothing).
//   node scripts/foot-test.mjs [--world mars|moon] [--dist]
import { open, opt, flag } from './lib/browser.mjs';

const world = opt('world', 'mars');
const { base, page, problems, goto, close } = await open({ dist: flag('dist') });
let failed = false;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  (' + extra + ')' : ''}`); if (!ok) failed = true; };
const state = () => page.evaluate(() => {
  const a = window.__app, r = a.rig;
  const f = r.feet, l = f.length(), g = a.hs.height(f.x / l, f.y / l, f.z / l, 0.5);
  return { onFoot: r.onFoot, airborne: r.airborne, feetUp: l - a.world.radius - g, speed: r.footVel.length(), agl: r.agl, mode: r.mode, frame: a.frameCount };
});
const until = async (cond, seconds) => { const t0 = Date.now(); for (;;) { const s = await state(); if (cond(s)) return s; if (Date.now() - t0 > seconds * 1000) return null; await page.waitForTimeout(250); } };

await goto(`${base}?world=${world}`);
await page.waitForFunction(() => window.__app && window.__app.loaded, null, { timeout: 300000 });
await page.click('#start button.primary');
let s = await state();
check('starts on its feet behind the character', s.mode === 'hero' && s.onFoot && !s.airborne, `camera ${s.agl.toFixed(2)} m up`);
await page.keyboard.down('KeyW');
s = await until((x) => x.speed > 3, 240);
check('walks forward', !!s, s ? `${s.speed.toFixed(1)} m/s` : 'never got going');
await page.keyboard.up('KeyW');
await until((x) => x.speed < 0.5, 240);
await page.keyboard.press('Space');
s = await until((x) => x.airborne, 120);
check('a tap of up jumps', !!s);
let peak = 0;
s = await until((x) => { peak = Math.max(peak, x.feetUp); return !x.airborne; }, 400);
check('lands again on its feet', !!s && s.onFoot, `highest ${peak.toFixed(2)} m above the ground`);
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
s = await until((x) => x.speed > 25 || !x.onFoot, 400);
check('super speed', !!s && s.speed > 25, s ? `${s.speed.toFixed(1)} m/s` : '');
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
await until((x) => x.speed < 1 && !x.airborne, 400);
await page.keyboard.down('Space');
s = await until((x) => !x.onFoot, 240);
check('holding up takes off', !!s);
s = await until((x) => x.agl > 12, 300);
await page.keyboard.up('Space');
check('climbs while up is held', !!s, s ? `camera ${s.agl.toFixed(1)} m up` : '');
s = await until((x) => x.onFoot && !x.airborne, 600);
check('let go: falls and lands on its feet', !!s);
check('no errors in the page', problems.length === 0, problems.slice(0, 3).join(' | '));
await close();
console.log(failed ? 'foot test FAILED' : 'foot test passed');
process.exit(failed ? 1 : 0);
