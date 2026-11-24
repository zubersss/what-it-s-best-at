// How many layers of a part are drawn over each pixel, and how many triangles it hands
// over: the real game at a view, the part's meshes drawn alone with no depth test and
// every fragment that survives its shader's cut-outs adding one (src/perf/overdraw.js). A
// forest on a phone is paid for in these layers (cut-out cards over each other), not in
// triangles.
//
//   node scripts/overdraw.mjs [--part trees,farForest,grass,leaves] [--world haven] [--view "in the forest" | --query "lat=..&lon=.."]
//        [--distdir build] [--size 880x412] [--out dir] [--suffix _x] [--timeout 1700]
//
// Without --query the view is one of the world's cost views (scene.costViews; the first
// when no --view names one). Prints for each part: triangles handed over, the mean number
// of layers over the whole picture, over the pixels the part touches, and the most on any
// pixel; with --out a grey picture of the layers (white = 16 and more) is saved as
// <out>/overdraw_<part><suffix>.png. What the depth test saves when a part is drawn
// nearest first is not in these numbers: they are what is rasterised, the upper bound of
// what is shaded. (Needs a build with App.overdraw: this one or later.)
import { open, opt } from './lib/browser.mjs';
import { png } from './lib/png.mjs';
import { getWorld } from '../src/worlds/index.js';
import { mkdir, writeFile } from 'node:fs/promises';

const world = opt('world', 'haven'), parts = opt('part', 'trees').split(','), out = opt('out', null), timeout = +opt('timeout', 1700) * 1000, suffix = opt('suffix', '');
const [W, H] = opt('size', '880x412').split('x').map(Number);
let query = opt('query', '');
if (!query) {
  const views = getWorld(world).scene.costViews || [], v = views.find((x) => x.name === opt('view', views[0]?.name));
  if (!v) { console.error('no such cost view; give --query'); process.exit(1); }
  query = Object.entries(v).filter(([k]) => k !== 'name').map(([k, x]) => `${k}=${x}`).join('&');
}
if (out) await mkdir(out, { recursive: true });
const { base, page, goto, close, errors } = await open({ dist: true, width: W, height: H, dsf: 1 });
let failed = false;
try {
  await goto(`${base}?world=${world}&shot=ledge&${query}`);
  await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout, polling: 500 });
  console.log(`${world}, ${query}, ${W} x ${H}`);
  for (const part of parts) {
    const r = await page.evaluate((part) => { const a = window.__app; if (!a.overdraw) return { error: 'this build has no App.overdraw' }; const r = a.overdraw(part); if (r.layers) r.layers = Array.from(r.layers); return r; }, part);
    if (r.error) { console.log(`${part}: ${r.error}`); failed = true; continue; }
    console.log(`${part.padEnd(10)} ${String(r.triangles).padStart(8)} triangles; layers a pixel: ${r.mean.toFixed(2)} over the whole picture, ${r.meanCovered.toFixed(2)} where it is (${(r.covered * 100).toFixed(0)} % of the picture), ${r.max}${r.max >= 255 ? '+' : ''} at most`);
    if (out) { const img = new Uint8Array(r.width * r.height * 3); for (let i = 0; i < r.layers.length; i++) { const v = Math.min(255, r.layers[i] * 16); img[i * 3] = img[i * 3 + 1] = img[i * 3 + 2] = v; } await writeFile(`${out}/overdraw_${part}${suffix}.png`, png(r.width, r.height, img)); }
  }
  if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); failed = true; }
} catch (e) { console.error(String(e)); failed = true; } finally { await close(); }
process.exit(failed ? 1 : 0);
