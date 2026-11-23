// scratch: the opening view with one part taken out at a time; counts dark pixels in a box
import { open } from './lib/browser.mjs';
import { mkdir } from 'node:fs/promises';
const out = process.argv[process.argv.indexOf('--o') + 1];
await mkdir(out, { recursive: true });
const { base, page, snap, goto, close } = await open({ dist: true, width: 660, height: 309, dsf: 1 });
await goto(`${base}?world=haven&shot=ledge`);
await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: 1700000, polling: 500 });
const frames = async (n) => { const g = await page.evaluate((n) => window.__app.frameCount + n, n); await page.waitForFunction((g) => window.__app.frameCount >= g, g, { timeout: 600000, polling: 200 }); };
const parts = ['none', 'blades0', 'blades1', 'flowers', 'clump0', 'clump1', 'clump2', 'treecasters', 'rockcasters', 'farforest', 'trees'];
for (const p of parts) {
  await page.evaluate((p) => {
    const a = window.__app, g = a.grass, ns = a.nearShadow;
    const take = (m) => { const par = m.parent; if (par) { par.remove(m); window.__back = () => par.add(m); } };
    window.__back = () => {};
    if (p === 'blades0') take(g.fields[0].mesh); if (p === 'blades1') take(g.fields[1].mesh); if (p === 'flowers') take(g.fields[2].mesh);
    if (p.startsWith('clump')) take(g.clumps[+p[5]].mesh);
    if (p === 'farforest') take(a.farForest.mesh);
    if (p === 'trees') { const ms = a.trees.meshes.slice(); const ps = ms.map((m) => m.parent); ms.forEach((m) => m.parent && m.parent.remove(m)); window.__back = () => ms.forEach((m, i) => ps[i] && ps[i].add(m)); window.__n = ms.length; }
    if (p === 'treecasters' || p === 'rockcasters') {
      const keep = ns.casters.slice(), rocks = a.rocks.mesh;
      const isRock = (c) => (c.mesh || c[0] || c.object) === rocks;
      ns.casters.length = 0; for (const c of keep) if (p === 'treecasters' ? isRock(c) : !isRock(c)) ns.casters.push(c);
      window.__n = keep.length - ns.casters.length;
      window.__back = () => { ns.casters.length = 0; for (const c of keep) ns.casters.push(c); };
    }
  }, p);
  await frames(8);
  await snap(`${out}/${p}.png`);
  console.log(p, await page.evaluate(() => window.__n ?? ''));
  await page.evaluate(() => { window.__back(); window.__n = undefined; });
}
await close();
