// Every world of the registry opens at its start place: the page reaches "ready" (terrain
// settled, maps in), ground is drawn, no shader is over a phone's limits and nothing was
// logged as an error. One headless browser, one world after another (several minutes
// each under software WebGL).
//   node scripts/worlds-test.mjs [--only io,titan] [--out <dir for a picture of each>]
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag } from './lib/browser.mjs';
import { shaderUse, overPhone } from './lib/glLimits.mjs';
import { WORLDS } from '../src/worlds/index.js';

const only = opt('only', null)?.split(','), out = opt('out', null);
const ids = Object.keys(WORLDS).filter((id) => !only || only.includes(id));
if (out) await mkdir(out, { recursive: true });
const { base, page, errors, snap, goto, close } = await open({ dist: flag('dist') });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) failed++; };
for (const id of ids) {
  const shot = Object.keys(WORLDS[id].scene.bookmarks)[0], before = errors.length, t0 = Date.now();
  await goto(`${base}?world=${id}&shot=${shot}`);
  let ready = true;
  try { await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: 900000, polling: 500 }); } catch { ready = false; }
  const st = await page.evaluate(() => ({ stats: window.__stats, err: window.__shotError || null }));
  check(`${id}: opens at "${shot}" and settles`, ready && !st.err, `${((Date.now() - t0) / 1000).toFixed(0)} s${st.err ? ', ' + st.err : ''}${st.stats?.wait ? ', waiting for: ' + st.stats.wait : ''}`);
  check(`${id}: ground is drawn`, (st.stats?.chunks ?? 0) > 0, `${st.stats?.chunks} patches, ${st.stats?.calls} draw calls`);
  check(`${id}: no errors in the page`, errors.length === before, errors.slice(before).join(' | ').slice(0, 300));
  const use = await shaderUse(page).catch(() => []);
  const over = overPhone(use);
  check(`${id}: every shader fits a phone`, use.length > 0 && over.length === 0, over.length ? over.join('; ') : `${use.length} shaders`);
  if (out) await snap(path.join(out, `${id}_${shot}.png`));
}
await close();
console.log(failed ? `${failed} check(s) FAILED` : `worlds test passed (${ids.length} worlds)`);
process.exit(failed ? 1 : 0);
