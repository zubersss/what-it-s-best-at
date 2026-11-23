// What the far rocks are doing in the real game at a place, without waiting for a
// picture to be ready: the page's read-out every few seconds, and a picture at the end.
//   node scripts/far-rocks-probe.mjs --distdir <build> --query "lat=..&lon=..&alt=.." [--seconds 90] [--out file.png] [--eval "..."]
import { open, opt } from './lib/browser.mjs';
import { shaderUse, overPhone } from './lib/glLimits.mjs';
const { base, page, errors, snap, goto, close } = await open({ dist: true, width: 660, height: 309, dsf: 1 });
await goto(`${base}?world=haven&shot=ledge&${opt('query', '')}`);
const secs = +opt('seconds', 90), t0 = Date.now();
// --eval "<javascript>": run in the page once the game is there (a switch to try, e.g. window.__app.farRocks.shadows = false)
if (opt('eval', '')) { await page.waitForFunction(() => !!(window.__app && window.__app.farRocks), null, { timeout: 120000 }); await page.evaluate(opt('eval', '')); }
let last = '';
while (Date.now() - t0 < secs * 1000) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => { const a = window.__app, f = a && a.farRocks; return f ? { ready: !!window.__shotReady, frame: a.frameCount, far: window.__stats && window.__stats.farRocks, wait: window.__stats && window.__stats.wait, asked: f.asked, missing: f.missing, vis: f.visBusy, tiles: f.tiles.size, why: [a.post.stableReads >= 3 ? '' : 'exposure', a.terrain.idle ? '' : 'terrain', a.trees.busy ? 'trees' : '', a.farForest && a.farForest.busy ? 'farForest' : '', a.grass.busy ? 'grass' : '', a.cloudVolume.busy ? 'cloudvol' : '', a.rocks.needVis || a.rocks.pendingVis ? 'rocks' : '', a.lander.pending ? 'lander' : '', a.atmosphere.airBusy ? 'air' : '', a.bodies.pending ? 'bodies' : '', a.clouds.loading ? 'clouds' : '', f.busy ? 'farRocks' : ''].filter(Boolean).join(' '), calls: window.__stats && window.__stats.calls, tris: window.__stats && window.__stats.triangles } : null; });
  const line = JSON.stringify(s); if (line !== last) console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', line); last = line;
  if (s && s.ready) break;
}
{ const use = await shaderUse(page), bad = use.filter((p) => !p.linked).length, errs = await page.evaluate(() => window.__app?.shaderErrors || []);
  for (const l of overPhone(use)) { console.log("OVER A PHONE'S LIMITS: " + l); errors.push(l); }
  if (bad || errs.length) { console.log(`SHADER FAILED: ${bad} not linked: ${errs.join(' / ').slice(0, 3000)}`); errors.push('shader'); } }
console.log('sunlight on the rocks, by level (mean of the land\'s shadow, 1: all in the Sun):', JSON.stringify(await page.evaluate(() => { const f = window.__app.farRocks, o = {}; for (const s of f.slots) { if (!s.tile) continue; const a = s.tile.full.misc, n = s.tile.count; let v = 0; for (let i = 0; i < n; i++) v += a[i * 4] / 255; (o[s.li] || (o[s.li] = [0, 0]))[0] += v; o[s.li][1] += n; } for (const k in o) o[k] = +(o[k][0] / o[k][1]).toFixed(2); return o; })));
console.log('the Sun:', JSON.stringify(await page.evaluate(() => { const a = window.__app, r = a.rig, s = a.ephemeris ? a.ephemeris.sunDir : null, u = r.localUp, f = r.forward; if (!s) return 'unknown'; const el = Math.asin(s[0] * u[0] + s[1] * u[1] + s[2] * u[2]) * 57.3, e = r.east, n = r.north, az = (Math.atan2(s[0] * e[0] + s[1] * e[1] + s[2] * e[2], s[0] * n[0] + s[1] * n[1] + s[2] * n[2]) * 57.3 + 360) % 360; return { up: +el.toFixed(1), bearing: +az.toFixed(0), view: +((Math.atan2(f.x * e[0] + f.y * e[1] + f.z * e[2], f.x * n[0] + f.y * n[1] + f.z * n[2]) * 57.3 + 360) % 360).toFixed(0) }; })));
// what is truly drawn: every rock of every tile, by the vertex shader's own rule
console.log('drawn, counted rock by rock:', JSON.stringify(await page.evaluate(() => { const a = window.__app, o = a.farRocks.tally(a.rig.camera); o.note = 'rocks, shadows, triangles, calls: in the view; all: kept by the vertex shader all round; handed: instances given to the GPU'; return o; })));
if (opt('out', '')) await snap(opt('out', ''));
if (errors.length) console.log('PAGE ERRORS: ' + errors.slice(0, 5).join(' | '));
await close();
process.exit(errors.length ? 1 : 0);
