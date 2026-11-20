// The menu, the clock, the map, the journal, saves, photo mode and the sound switch in the
// real game (headless; frame rates mean nothing).   node scripts/ui-test.mjs [--dist] [--out dir]
// Every check must be able to fail: the script exits non-zero if one does.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';

const out = path.resolve(root, opt('out', '.cache/ui'));
await mkdir(out, { recursive: true });
const { base, page, problems, errors, snap, goto, close } = await open({ dist: flag('dist'), touch: true });
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  (' + extra + ')' : ''}`); if (!ok) problems.push(name); };
const start = async (query = '') => {
  await goto(`${base}?world=mars&touch=1&scale=0.4${query}`);          // (a low render scale: frames are slow here)
  await page.waitForFunction(() => window.__app?.groundReady, null, { timeout: 400000 });
  await page.waitForSelector('#start button.primary:not([disabled])', { timeout: 300000 });
};
await start();
const worlds = await page.$$eval('#start .where option', (o) => o.map((x) => x.value));
check('the start screen lists the worlds', worlds.length >= 15 && worlds.includes('titan') && worlds.includes('earth'), worlds.length + ' worlds');
await page.click('#start button.primary', { noWaitAfter: true });
await page.waitForTimeout(3000);
const app = (fn, arg) => page.evaluate(fn, arg);

// --- the menu and the clock
await page.dispatchEvent('#tbuttons button[data-act="menu"]', 'pointerdown');
await page.waitForSelector('#menu:not(.hidden)', { timeout: 30000 });
const items = await page.$$eval('#menu button b', (b) => b.map((x) => x.textContent));
check('MENU opens with the map, the clock, the journal, photo and sound', ['Map', 'Targets', 'Journal', 'Photograph', 'Today', 'Free camera'].every((n) => items.includes(n)) && items.some((n) => n.startsWith('Sound')), items.join(', '));
await snap(path.join(out, '1_menu.png'));
const jd0 = await app(() => window.__app.ephemeris.jd);
await page.click('#menu button:has-text("▶▶")'); await page.click('#menu button:has-text("▶▶")'); await page.click('#menu button:has-text("▶▶")');
const rate = await app(() => window.__app.timeRate);
check('faster, three times: an hour a second', rate === 3600, String(rate));
check('the menu stays open for the clock', await page.isVisible('#menu'));
await page.waitForFunction((j) => window.__app.ephemeris.jd - j > 0.02, jd0, { timeout: 120000 }).catch(() => {});
const jd1 = await app(() => window.__app.ephemeris.jd);
check('the clock runs ahead', jd1 - jd0 > 0.02, `${((jd1 - jd0) * 24).toFixed(2)} h`);
await page.click('#menu button:has-text("Real time")');
check('real time again', await app(() => window.__app.timeRate) === 1);
await page.click('#menu button:has-text("Today")');
const today = await app(() => window.__app.clock.toISOString().slice(0, 10));
check('Today sets the real date', today === new Date().toISOString().slice(0, 10), today);
await page.fill('#menu input[type="date"]', '2031-05-04'); await page.dispatchEvent('#menu input[type="date"]', 'change');
const picked = await app(() => window.__app.clock.toISOString().slice(0, 10));
check('a date can be chosen', picked === '2031-05-04', picked);

// --- the map
await page.click('#menu button:has-text("Map")');
await page.waitForSelector('#map:not(.hidden)', { timeout: 30000 });
check('the menu gives way to the map', await page.isHidden('#menu'));
await page.click('#map button[data-a="outer"]');
const pts = await app(() => window.__app.map.points.map((p) => p.id));
check('the whole system is on the map', ['sun', 'mercury', 'earth', 'jupiter', 'saturn', 'neptune', 'pluto'].every((b) => pts.includes(b)), pts.length + ' bodies');
await snap(path.join(out, '2_map.png'));
const jup = await app(() => window.__app.map.points.find((p) => p.id === 'jupiter'));
await page.touchscreen.tap(jup.x, jup.y);
await page.waitForSelector('#map .info:not(.hidden)', { timeout: 10000 }).catch(() => {});
const info = await page.textContent('#map .info');
check('a tap chooses a body and says how far it is', /Jupiter/.test(info) && /AU away/.test(info), info.slice(0, 80));
await page.click('#map button[data-a="closer"]');
const moons = await app(() => window.__app.map.points.map((p) => p.id));
check('Look closer shows its moons', ['io', 'europa', 'ganymede', 'callisto'].every((b) => moons.includes(b)), moons.join(','));
await snap(path.join(out, '3_moons.png'));
await page.click('#map button[data-a="target"]');
check('Set target sets it', await app(() => window.__app.targetId) === 'jupiter');
await page.click('#map button[data-a="go"]');
await page.waitForTimeout(1500);
check('GO starts the trip and closes the map', await page.isHidden('#map') && await app(() => !!window.__app.transfer));
await app(() => window.__app.stopTransfer());

// --- a place is found by going there, and the journal keeps it
await app(() => { const a = window.__app; a.applyBookmark('gale'); });
await page.waitForFunction(() => window.__app.save.has('mars/gale'), null, { timeout: 120000 }).catch(() => {});
check('standing at Gale crater finds it', await app(() => window.__app.save.has('mars/gale')));
await page.keyboard.press('KeyJ');
await page.waitForSelector('#journal:not(.hidden)', { timeout: 60000 }).catch(() => {});
const jtitle = await page.textContent('#journal h1').catch(() => '');
check('the journal counts it', /[1-9]\d* of \d+ places found/.test(jtitle), jtitle);
const found = await page.$$eval('#journal .place.found b', (b) => b.map((x) => x.textContent));
check('... and lists it with what it is', found.some((f) => /Gale/.test(f)), found.join(' | ').slice(0, 120));
await snap(path.join(out, '4_journal.png'));
await page.click('#journal h1 button');

// --- sound switch, photo mode
const s0 = await app(() => window.__app.audio.on);
await page.keyboard.press('KeyK'); await page.waitForTimeout(1500);
check('K switches the sound', await app(() => window.__app.audio.on) === !s0);
await page.keyboard.press('KeyO');
await page.waitForFunction(() => !!window.__app.photo, null, { timeout: 60000 }).catch(() => {});
check('photo mode puts the controls away', await app(() => !!window.__app.photo) && await page.isHidden('#touch') && await page.isVisible('#photobar'));
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }).catch(() => null), page.click('#photobar button[data-a="shoot"]')]);
const size = await app(() => [window.__app.canvas.width, window.__app.canvas.height]);
check('the shutter saves a picture', !!download && /solar-system-mars-.*\.png/.test(download?.suggestedFilename() || ''), download ? `${download.suggestedFilename()}, canvas ${size.join(' x ')}` : 'no download');
if (download) await download.saveAs(path.join(out, '5_photo.png')).catch(() => {});
await page.click('#photobar button[data-a="back"]');
check('Back leaves photo mode', await app(() => !window.__app.photo) && await page.isVisible('#touch'));

// --- the browser remembers
await app(() => window.__app.save.flush());
await start();
check('after a reload the place is still found and the sound switch kept', await app(() => window.__app.save.has('mars/gale')) && await app(() => window.__app.audio.on) === !s0);
check('no errors in the page', errors.length === 0, errors.join(' | ').slice(0, 300));
await close();
console.log(problems.length ? `${problems.length} problem(s)` : 'ui test passed');
process.exit(problems.length ? 1 : 0);
