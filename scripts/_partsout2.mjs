// scratch: which shadow casters draw the patch on the opening brow
import { open } from './lib/browser.mjs';
import { mkdir } from 'node:fs/promises';
const out = process.argv[process.argv.indexOf('--o') + 1];
await mkdir(out, { recursive: true });
const { base, page, snap, goto, close } = await open({ dist: true, width: 660, height: 309, dsf: 1 });
await goto(`${base}?world=haven&shot=ledge`);
await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: 1700000, polling: 500 });
const frames = async (n) => { const g = await page.evaluate((n) => window.__app.frameCount + n, n); await page.waitForFunction((g) => window.__app.frameCount >= g, g, { timeout: 600000, polling: 200 }); };
console.log(await page.evaluate(() => { const a = window.__app; return JSON.stringify(a.nearShadow.casters.map((c, i) => [i, c.mesh.type, c.mesh.name, c.mesh.count ?? '', c.mesh.geometry?.index?.count ?? c.mesh.geometry?.attributes?.position?.count, a.trees.meshes.includes(c.mesh) || a.trees.sets.flat(2).some((s) => s.cast === c.mesh) ? 'tree' : c.mesh === a.rocks.mesh ? 'rock' : c.mesh.parent === a.farForest.mesh || c.mesh === a.farForest.mesh ? 'farforest' : '?', c.isVisible ? !!c.isVisible() : true])); }));
for (const p of ['treesets', 'others']) {
  await page.evaluate((p) => {
    const a = window.__app, ns = a.nearShadow, keep = ns.casters.slice();
    const isTree = (c) => a.trees.sets.flat(2).some((s) => s.cast === c.mesh);
    ns.casters = keep.filter((c) => (p === 'treesets' ? !isTree(c) : isTree(c)));
    window.__back = () => { ns.casters = keep; };
  }, p);
  await frames(8); await snap(`${out}/cast_${p}.png`); console.log(p);
  await page.evaluate(() => window.__back());
}
await close();
