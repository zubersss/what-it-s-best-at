// The big benchmark in the real page, headless: either its chain (--chain: the short chain of
// two runs on Mars, opened by ?bench=big&bigtest=1; every run's text must come back under its
// name in one text), or one run of its route from the air (--air: Haven's five stops from 90 m
// to 3 km, each pictured; hours on software WebGL, so --stops 2 ends it after so many stops).
//   node scripts/big-bench-run.mjs --chain | --air [--stops 5] [--distdir <frozen build>] [--out dir] [--dsf 0.5] [--limit 7000]
// Software WebGL: nothing it prints is a frame rate; it checks that the runs follow one another.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';

const out = path.resolve(root, opt('out', 'docs/shots/ui')); await mkdir(out, { recursive: true });
const { base, page, problems, snap, goto, close } = await open({ dist: flag('dist'), touch: true, dsf: +opt('dsf', 0.5) });
const check = (name, ok, more = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !more ? '' : ' — ' + more}`); if (!ok) problems.push(name); };
const limit = +opt('limit', 7000) * 1000, t0 = Date.now();
// (the page is opened anew at every run of the chain: a question put to it in between finds no page)
const ask = async () => { try { return await page.evaluate(() => { const a = window.__app; return a ? { done: !!window.__benchResult, active: !!a.benchmark?.active, phase: a.benchmark?.phase ?? -1, world: a.world?.id, banner: document.querySelector('#benchbar span')?.textContent || '', url: location.search } : null; }); } catch { return null; } };

if (flag('chain')) {
  await goto(base + '?world=mars&bench=big&bigtest=1');
  const urls = new Set(); let last = '', done = false;
  while (Date.now() - t0 < limit) {
    const s = await ask();
    if (s) { if (s.url.includes('big=1')) urls.add(s.url); if (s.banner && s.banner !== last && /run \d of \d/.test(s.banner) && s.banner.slice(0, 26) !== last.slice(0, 26)) { console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s ${s.banner}`); } last = s.banner || last; if (s.done) { done = true; break; } }
    await page.waitForTimeout(2000);
  }
  check('the chain comes to its end', done);
  const text = done ? await page.evaluate(() => window.__benchResult) : '';
  check('the banner named the run and how many there are', /Big benchmark, run \d of 2/.test(last), last);
  check('the page was opened once for each run', urls.size === 1 || urls.size === 2, [...urls].join(' | '));          // (the two runs of the check have the same link)
  check('one text: the heading, both runs under their names, each a whole result', text.startsWith('SOLAR SYSTEM EXPLORER — THE BIG BENCHMARK') && text.includes('==== A. Mars') && text.includes('==== B. Mars again') && (text.match(/average fps/g) || []).length === 2 && (text.match(/^what each thing costs to draw/gm) || []).length === 0, text.slice(0, 300));
  check('the results screen is up with it, under its own title', done && await page.isVisible('#results') && /big benchmark/i.test(await page.textContent('#results h1')));
  check('nothing of the chain is kept', done && await page.evaluate(() => localStorage.getItem('sse.big') == null));
  if (done) { await snap(path.join(out, 'big_results.png')); console.log('\n' + text.slice(0, 1500) + '\n...'); }
} else if (flag('air')) {
  const stops = +opt('stops', 5);
  await goto(base + '?world=haven&bench=havenair&mode=sharp&cost=0&scale=0.775');
  await page.waitForFunction(() => window.__app?.benchmark?.active, null, { timeout: 1800000 });
  const names = await page.evaluate(() => window.__app.benchmark.names.haven);
  check(`the route's stops are Haven's five from the air (${names.join(', ')})`, names.join(' ') === 'woodDawn wood300 air1k air3k mist');
  const seen = []; let ended = false;
  while (Date.now() - t0 < limit) {
    const s = await ask();
    if (s) {
      if (s.done) { ended = true; break; }
      if (s.phase >= 0 && s.phase < 5 && !seen.includes(s.phase)) {
        // (a stop lasts twelve seconds by the clock on the wall, a frame or two of software rendering: its picture is of ground still arriving; what is checked is that the route comes by)
        const at = await page.evaluate(() => { const a = window.__app; return { agl: a.rig.agl, hours: a.timeOffsetHours, idle: a.terrain.idle, busy: a.benchmark.busy }; });
        if (!at.busy) { seen.push(s.phase); console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s stop ${s.phase} ${names[s.phase]}: ${at.agl.toFixed(0)} m over the ground, hour ${at.hours} · ${s.banner}`); await snap(path.join(out, `air_stop_${s.phase}_${names[s.phase]}.png`)); if (seen.length >= stops) break; }
      }
    }
    await page.waitForTimeout(1000);
  }
  check(`${stops} of the stops were reached and pictured (${seen.join(', ')})`, seen.length >= stops || ended);
  check('no shader failed to compile or link', !(await page.evaluate(() => window.__app.shaderErrors.length)));
} else { console.error('say --chain or --air'); problems.push('no job'); }
await close();
if (problems.length) { console.error('\nFAILED:\n' + problems.map((p) => '  ' + p).join('\n')); process.exit(1); }
console.log('\nbig-bench-run: passed');
