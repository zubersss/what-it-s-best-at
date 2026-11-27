// One view of the real game, loaded once, then photographed again and again with a switch
// tried each time: for telling WHICH part of the sky draws (or hides) a thing. A picture a
// switch costs seconds; a picture a page load costs minutes (the terrain).
//   node scripts/sky-probe.mjs --distdir <build> [--shot ledge] --query "alt=2500&heading=243&t=8.25" --out dir/name
//        [--size 440x206] [--dsf 1] [--frames 6] [--seconds 900] [--print "<expression>"]
//        [--try "upper=__app.sky.partOut('cloud-upper',true);;all=__app.sky.partOut('clouds-all',true)"]
// Writes <out>.png (the view as the game draws it) and <out>_<name>.png for each try; the tries
// are run in order and ADD UP (put the switch back in the next try's code to undo one).
// The sky's parts (sky/skySystem.js SKY_PARTS): clouds-all, cloud-shade, cloud-upper, cells-far,
// rain-shafts, fog, lenses.
import { open, opt } from './lib/browser.mjs';
const [W, H] = opt('size', '440x206').split('x').map(Number);
const { base, page, errors, snap, goto, close } = await open({ dist: true, width: W, height: H, dsf: +opt('dsf', '1') });
const out = opt('out', 'sky-probe'), frames = +opt('frames', '6');
await goto(`${base}?world=haven&shot=${opt('shot', 'ledge')}&${opt('query', '')}`);
const secs = +opt('seconds', 900), t0 = Date.now();
let ready = false;
while (Date.now() - t0 < secs * 1000) {
  await page.waitForTimeout(3000);
  if (await page.evaluate(() => window.__shotReady === true || !!window.__shotError)) { ready = true; break; }
}
console.log(ready ? `ready after ${((Date.now() - t0) / 1000).toFixed(0)} s` : `NOT READY after ${secs} s (waiting for: ${await page.evaluate(() => window.__stats?.wait || '?')})`);
console.log('sky: ' + await page.evaluate(() => window.__stats?.sky || ''));
if (opt('print', '')) console.log(JSON.stringify(await page.evaluate(opt('print', ''))));
await snap(`${out}.png`);
const settle = async () => {
  const f0 = await page.evaluate(() => window.__stats?.frame ?? 0), t1 = Date.now();
  while (Date.now() - t1 < 240000) {
    await page.waitForTimeout(1000);
    if (await page.evaluate((f) => (window.__stats?.frame ?? 0) >= f, f0 + frames)) return;
  }
};
for (const tr of opt('try', '').split(';;').filter(Boolean)) {
  const k = tr.indexOf('='), name = tr.slice(0, k), code = tr.slice(k + 1);
  try { const r = await page.evaluate(code); if (r !== undefined && r !== null) console.log(`${name}: ${JSON.stringify(r)}`); } catch (e) { console.log(`${name}: ERROR ${String(e).split('\n')[0]}`); errors.push(name); }
  await settle();
  await snap(`${out}_${name}.png`);
  console.log(`wrote ${out}_${name}.png`);
}
if (errors.length) console.log('PAGE ERRORS: ' + errors.slice(0, 4).join(' | '));
await close();
process.exit(errors.length || !ready ? 1 : 0);
