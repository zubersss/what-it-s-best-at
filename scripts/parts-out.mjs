// Who draws that? One view of the real game, taken again and again with one part out of
// it each time, and for each part how much of the picture (or of a box in it) changed.
// For the thing in a picture nobody can name: a dark patch, a sprinkle of specks, a line.
// One browser session: the scene settles once, each part costs a few frames.
//
//   node scripts/parts-out.mjs --world haven --shot ledge [--query "alt=60&pitch=-20"]
//        [--box 0.2,0.6,0.8,1] [--only casters.trees,trees] [--out dir] [--distdir build] [--timeout 1700]
//
// --box x0,y0,x1,y1: the part of the picture to judge, as shares of its width and height
// (0,0 top left). Pictures are saved as <out>/<part>.png, the whole one as none.png.
// The parts are found in the running game (a part it does not have is left out):
//   grass.blades.N  grass.clumps.N  trees  farForest  rocks  farRocks  leaves
//   casters.trees  casters.rocks  casters.other   (what draws into the near shadow maps)
// A part is taken out of its scene, never hidden: the app shows a hidden part again on
// the next frame.
import { open, opt } from './lib/browser.mjs';
import { decodePNG } from './lib/png.mjs';
import { mkdir, readFile } from 'node:fs/promises';

const world = opt('world', 'haven'), shot = opt('shot', 'ledge'), query = opt('query', '');
const out = opt('out', 'parts-out'), timeout = +opt('timeout', 1700) * 1000;
const only = opt('only', null)?.split(',') ?? null;
const box = (opt('box', '0,0,1,1')).split(',').map(Number);
const [W, H] = opt('size', '660x309').split('x').map(Number);
await mkdir(out, { recursive: true });

const { base, page, snap, goto, close, errors } = await open({ dist: true, width: W, height: H, dsf: 1 });
let failed = false;
try {
  await goto(`${base}?world=${world}&shot=${shot}${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout, polling: 500 });
  const frames = async (n) => {
    const g = await page.evaluate((n) => window.__app.frameCount + n, n);
    await page.waitForFunction((g) => window.__app.frameCount >= g, g, { timeout: 900000, polling: 200 });
  };
  // the parts this game has, by name; each a way to take it out that hands back the way to put it back
  const names = await page.evaluate(() => {
    const a = window.__app, P = (window.__parts = {});
    const takeAll = (ms) => () => { const ps = ms.map((m) => m.parent); ms.forEach((m) => m.parent && m.parent.remove(m)); return () => ms.forEach((m, i) => ps[i] && ps[i].add(m)); };
    const g = a.grass;
    (g?.fields ?? []).forEach((f, i) => { if (f.mesh) P['grass.blades.' + i] = takeAll([f.mesh]); });
    (g?.clumps ?? []).forEach((f, i) => { if (f.mesh) P['grass.clumps.' + i] = takeAll([f.mesh]); });
    if (a.trees?.meshes?.length) P.trees = takeAll(a.trees.meshes.slice());
    if (a.farForest?.mesh) P.farForest = takeAll([a.farForest.mesh]);
    if (a.rocks?.mesh) P.rocks = takeAll([a.rocks.mesh]);
    if (a.farRocks?.group) P.farRocks = takeAll([a.farRocks.group]);
    if (a.leaves?.mesh) P.leaves = takeAll([a.leaves.mesh]);
    const ns = a.nearShadow;
    if (ns?.casters) {
      const treeCast = new Set((a.trees?.sets ?? []).flat(3).map((s) => s?.cast).filter(Boolean));
      const kind = (c) => (treeCast.has(c.mesh) ? 'trees' : c.mesh === a.rocks?.mesh ? 'rocks' : 'other');
      for (const k of ['trees', 'rocks', 'other']) {
        if (!ns.casters.some((c) => kind(c) === k)) continue;
        P['casters.' + k] = () => { const keep = ns.casters; ns.casters = keep.filter((c) => kind(c) !== k); return () => { ns.casters = keep; }; };
      }
    }
    return Object.keys(P);
  });
  const parts = ['none', ...names.filter((n) => !only || only.includes(n))];
  console.log(`parts: ${names.join(' ')}`);
  const pic = async (name) => { const f = `${out}/${name}.png`; if (!(await snap(f))) throw new Error('no picture of ' + name); return decodePNG(await readFile(f)); };
  let ref = null;
  console.log('part                changed   mean brighter by   (in the box)');
  for (const p of parts) {
    if (p !== 'none') await page.evaluate((p) => { window.__back = window.__parts[p](); }, p);
    await frames(8);
    const im = await pic(p);
    if (p === 'none') ref = im;
    else {
      const x0 = Math.floor(box[0] * im.width), x1 = Math.ceil(box[2] * im.width), y0 = Math.floor(box[1] * im.height), y1 = Math.ceil(box[3] * im.height);
      let n = 0, ch = 0, lum = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * im.width + x) * 3, a = im.rgb, b = ref.rgb;
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        n++; if (d > 24) ch++; lum += (a[i] + a[i + 1] + a[i + 2] - b[i] - b[i + 1] - b[i + 2]) / 3;
      }
      console.log(`${p.padEnd(18)} ${(100 * ch / n).toFixed(1).padStart(6)} %   ${(lum / n).toFixed(1).padStart(7)}`);
      await page.evaluate(() => { window.__back(); window.__back = null; });
    }
  }
  if (errors.length) { console.log('errors in the page:', errors.slice(0, 3)); failed = true; }
} catch (e) { console.log('FAILED:', String(e).split('\n')[0]); failed = true; }
await close();
process.exit(failed ? 1 : 0);
