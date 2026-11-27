// The lying leaves' and petals' buffers at rest: how often each is handed to the GPU while the
// traveller stands still at a place, in the real game in play mode (headless; some ten minutes).
//   node scripts/leaf-uploads.mjs [--distdir <frozen build>] [--frames 300] [--query "season=autumn"]
// A buffer is handed over when its `version` moves. Once every leaf lies (and has been set
// again once on the ground as it is drawn now) none should be: the run fails if the lying
// leaves' or the petals' buffer is handed over in more than a twentieth of the frames after
// the first `settle` frames.
import { open, opt, flag } from './lib/browser.mjs';
const frames = +opt('frames', 300), settle = +opt('settle', 260), query = opt('query', '');
const { base, page, goto, close } = await open({ dist: flag('dist') || !!opt('distdir', null), touch: true });
await goto(`${base}?world=haven&hud=1${query ? '&' + query : ''}`);
await page.click('#start button.primary', { noWaitAfter: true, timeout: 600000 });
await page.waitForFunction(() => window.__app && window.__app.groundReady && window.__app.trees.reach > 0 && !window.__app.trees.busy, null, { timeout: 1500000, polling: 2000 });
const res = await page.evaluate(({ frames, settle }) => new Promise((resolve) => {
  const a = window.__app, parts = { leaves: a.treeLeaves, petals: a.petals }, out = {};
  for (const k in parts) { const p = parts[k]; out[k] = { uploads: 0, late: 0, relists: 0, shown: 0, last: p.lieGeo.attributes.aLie.version }; const r = p._relist.bind(p); p._relist = (...x) => { out[k].relists++; return r(...x); }; }
  let n = 0;
  const tick = () => {
    for (const k in parts) { const p = parts[k], v = p.lieGeo.attributes.aLie.version, o = out[k]; if (v !== o.last) { o.uploads++; if (n >= settle) o.late++; o.last = v; } if (p.lying.visible) o.shown++; o.left = p.left; o.lying = p.o.lying; }
    if (++n >= frames + settle) resolve({ out, frames: n, onFoot: a.rig.onFoot, speed: a.rig.velocity.length() }); else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), { frames, settle });
console.log(JSON.stringify(res));
let bad = false;
for (const k in res.out) { const o = res.out[k]; console.log(`${k}: ${o.lying} lying points, drawn in ${o.shown} of ${res.frames} frames; its buffer handed to the GPU in ${o.uploads} frames, ${o.late} of them among the last ${frames}; the trees' list made again ${o.relists} times; ${o.left} still to lay`); if (o.late > frames / 20) bad = true; }
await close();
console.log(bad ? 'FAILED: a buffer is handed over at rest' : 'ok: nothing handed over at rest');
process.exit(bad ? 1 : 0);
