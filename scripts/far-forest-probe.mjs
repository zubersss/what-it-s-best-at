// What the far forest is doing in the real game at a place: its tiles, the land's and the
// clouds' shadow on its trees, the Sun, and a picture at the end.
//   node scripts/far-forest-probe.mjs --distdir <build> --query "lat=..&lon=..&alt=..&pitch=.." [--seconds 600] [--out file.png]
//        [--eval "<javascript run in the page once the game is there: a switch to try>"] [--print "<an expression printed when the picture is ready>"]
import { open, opt } from './lib/browser.mjs';
import { shaderUse, overPhone } from './lib/glLimits.mjs';
const { base, page, errors, snap, goto, close } = await open({ dist: true, width: 660, height: 309, dsf: 1 });
await goto(`${base}?world=haven&shot=ledge&${opt('query', '')}`);
const secs = +opt('seconds', 600), t0 = Date.now();
if (opt('eval', '')) { await page.waitForFunction(() => !!(window.__app && window.__app.farForest), null, { timeout: 120000 }); await page.evaluate(opt('eval', '')); }
let ready = false;
while (Date.now() - t0 < secs * 1000) {
  await page.waitForTimeout(5000);
  if (await page.evaluate(() => window.__shotReady === true || !!window.__shotError)) { ready = true; break; }
}
console.log(ready ? `ready after ${((Date.now() - t0) / 1000).toFixed(0)} s` : `NOT READY after ${secs} s (waiting for: ${await page.evaluate(() => window.__stats?.wait || '?')})`);
{ const use = await shaderUse(page), bad = use.filter((p) => !p.linked).length, errs = await page.evaluate(() => window.__app?.shaderErrors || []);
  for (const l of overPhone(use)) { console.log("OVER A PHONE'S LIMITS: " + l); errors.push(l); }
  if (bad || errs.length) { console.log(`SHADER FAILED: ${bad} not linked: ${errs.join(' / ').slice(0, 3000)}`); errors.push('shader'); } }
console.log(JSON.stringify(await page.evaluate(() => {
  const a = window.__app, f = a.farForest, r = a.rig, o = { stats: window.__stats?.farTrees, agl: Math.round(r.agl), calls: a.stats.calls, triangles: a.stats.triangles };
  // the land's shadow on the trees, tile by tile: the share of the Sun left, mean over a tile's trees, by level
  o.landSun = {}; o.tiles = {};
  for (const t of f.tiles.values()) { if (t.state !== 1 || !t.have) continue; let s = 0; for (let k = 0; k < t.have; k++) s += t.vis[k]; (o.landSun[t.level] ||= []).push(+(s / t.have).toFixed(2)); o.tiles[t.level] = (o.tiles[t.level] || 0) + 1; }
  const u = f.shared, sun = u.uSunDir.value, up = r.pos.clone().normalize();
  o.sunUp = +(Math.asin(sun.dot(up)) * 180 / Math.PI).toFixed(1);
  o.uFar = u.uFar.value.toArray().map((x) => +x.toFixed(2)); o.uShadow = u.uShadow?.value.x; o.shadeInv = u.uShadeInv.value; o.cloud = a.terrain.shared.uCloud.value.toArray?.().map((x) => +x.toFixed(3));
  // the clouds' shadow map the trees read (256 x 256 over 14 km): how much of it is in shade
  try {
    const buf = new Uint8Array(256 * 256); a.renderer.readRenderTargetPixels(a.treeShade.target, 0, 0, 256, 256, buf);
    let m = 0, lo = 255, hi = 0, dark = 0; for (let i = 0; i < 65536; i++) { const v = buf[i]; m += v; if (v < lo) lo = v; if (v > hi) hi = v; if (v < 128) dark++; }
    o.cloudMap = { mean: +(m / 65536 / 255).toFixed(2), least: +(lo / 255).toFixed(2), most: +(hi / 255).toFixed(2), inShade: +(dark / 65536).toFixed(2) };
    const mu = a.treeShade.material.uniforms; o.cloudPass = { heap: mu.uCloudHeap.value.toArray().map((x) => +x.toFixed(3)), vol: mu.uCloudVol.value.toArray().map((x) => +x.toPrecision(4)), map: !!mu.tClouds.value && (mu.tClouds.value.image?.width || 'no image'), noise: !!mu.tCloudNoise.value, sameObjects: mu.uCloud === a.terrain.shared.uCloud && mu.tClouds === a.terrain.shared.tClouds };
  } catch (e) { o.cloudMap = String(e); }
  return o;
}), null, 1));
// --map file.png: the clouds' shadow map the trees read (north up, 14 km across, white: in the Sun)
if (opt('map', '')) {
  const bytes = await page.evaluate(() => { const a = window.__app, buf = new Uint8Array(256 * 256); a.renderer.readRenderTargetPixels(a.treeShade.target, 0, 0, 256, 256, buf); return Array.from(buf); });
  const { png } = await import('./lib/png.mjs'), fs = await import('node:fs'), rgb = Buffer.alloc(256 * 256 * 3);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const v = bytes[(255 - y) * 256 + x], q = (y * 256 + x) * 3; rgb[q] = rgb[q + 1] = rgb[q + 2] = v; }
  fs.writeFileSync(opt('map', ''), png(256, 256, rgb));
}
if (opt('print', '')) console.log(JSON.stringify(await page.evaluate(opt('print', ''))));
if (opt('out', '')) await snap(opt('out', ''));
if (errors.length) console.log('PAGE ERRORS: ' + errors.slice(0, 4).join(' | '));
await close();
process.exit(errors.length || !ready ? 1 : 0);
