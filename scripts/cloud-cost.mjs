// What laying the cloud volume over the picture costs, as a count of work (never a frame
// rate): the real game at a view from the air, the six laying passes of sky/cloudVolume.js
// drawn alone over an empty picture (the worst case: no ground hides any of them), timed
// until drawn, in the headless browser (software WebGL).
//   node scripts/cloud-cost.mjs [--distdir <build>] [--query "world=haven&shot=ledge&alt=5000&heading=235&pitch=-14"] [--frames 5] [--out picture.png]
// Run it on two builds (--distdir) to set one against the other.
import { writeFile } from 'node:fs/promises';
import { open, opt, flag } from './lib/browser.mjs';
import { png } from './lib/png.mjs';
const query = opt('query', 'world=haven&shot=ledge&alt=5000&heading=235&pitch=-14'), frames = +opt('frames', 5);
const { base, page, errors, goto, close } = await open({ dist: flag('dist') });
await goto(`${base}?${query}`);
await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: 900000, polling: 500 });
const res = await page.evaluate(({ frames }) => {
  const a = window.__app, r = a.renderer, gl = r.getContext(), post = a.post, cv = a.cloudVolume, rig = a.rig;
  if (!cv.active) return { error: 'the cloud volume is not drawn at this view' };
  const near = Math.max(0.25, Math.min(2e6, Math.min(rig.agl, rig.floor || rig.agl) * 0.15)), far = Math.max(a.terrain.farDistance, cv.reach) * 1.05;
  const px = new Float32Array(4);
  const draw = (lay) => { post.beginScene(); const t = performance.now(); if (lay) cv.lay(near, far, rig); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px); return performance.now() - t; };
  draw(true); draw(true);
  let best = 1e9, none = 1e9;
  for (let i = 0; i < frames; i++) { best = Math.min(best, draw(true)); none = Math.min(none, draw(false)); }
  draw(true);
  const w = post.viewW, h = post.viewH, f = new Float32Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, f);
  const out = new Uint8Array(w * h * 3); let cloudy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 3;
    if (f[i + 3] > 0.02) cloudy++;
    for (let c = 0; c < 3; c++) { const e = Math.max(f[i + c], 0); out[o + c] = Math.round(255 * Math.pow(Math.min(1, 1.5 * e / (e + 0.5)), 1 / 2.2)); }
  }
  let s = ''; for (let i = 0; i < out.length; i += 32768) s += String.fromCharCode.apply(null, out.subarray(i, i + 32768));
  return { best, none, w, h, cloudy: cloudy / (w * h), b64: btoa(s) };
}, { frames });
if (res.error) { console.log(res.error); await close(); process.exit(1); }
console.log(`the six laying passes over an empty picture of ${res.w}x${res.h}: ${(res.best - res.none).toFixed(0)} ms (cloud on ${(100 * res.cloudy).toFixed(0)} % of it; software WebGL: a count of work, not a frame rate)`);
if (opt('out', null)) await writeFile(opt('out', null), png(res.w, res.h, Buffer.from(res.b64, 'base64'), 3));
if (errors.length) { console.log('PAGE ERRORS: ' + errors.slice(0, 3).join(' | ')); await close(); process.exit(1); }
await close();
