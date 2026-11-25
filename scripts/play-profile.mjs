// Where the page's own work goes while the real game runs at a place (headless):
//   node scripts/play-profile.mjs [--world earth] [--go place:irma] [--query "mode=sharp"] [--rate 60] [--seconds 60] [--dist]
// Plays (no screenshot mode), hero on, and prints the frame's parts (ms a frame) every few
// seconds, with the governor's level and what is drawn. Software rendering: the times of
// the parts that draw are this machine's, the rest (terrain, weather, trees) are fair.
import { open, opt, flag } from './lib/browser.mjs';
const world = opt('world', 'earth'), query = opt('query', ''), seconds = +opt('seconds', 60);
const { base, page, problems, goto, close } = await open({ dist: flag('dist') || !!opt('distdir', null), touch: true });
await goto(`${base}?world=${world}&hud=1${query ? '&' + query : ''}`);
await page.waitForFunction(() => window.__app && window.__app.loaded, null, { timeout: 600000 });
await page.waitForSelector('#start button.primary:not([disabled])', { timeout: 600000 });
await page.click('#start button.primary', { noWaitAfter: true, timeout: 240000 });      // (a software-drawn frame of Haven takes seconds, and a click needs several)
// --go <target>: set that target and fly there hands-off, as a player would (place:irma, moon, ...)
const go = opt('go', null);
if (go) await page.evaluate((id) => { const a = window.__app; a.pickTarget(id); a.startTransfer(); }, go);
// --at "lat,lon,alt": put the flying figure there (a GO trip takes hours at this machine's frame rate)
const at = opt('at', null);
if (at) await page.evaluate(([lat, lon, alt]) => { const a = window.__app, r = a.rig; a.stopTransfer(); r.setLatLon(lat, lon, 1.7, 90, -4); r.pos.setLength(a.world.radius + alt); r.onFoot = false; r.hover = true; a.jumpedAt = performance.now(); }, at.split(',').map(Number));
// --rate <seconds a second>: run the world's clock faster (the sky's snapshots and its 'now' maps
// are then made and blended as fast as they ever are)
const rate = +opt('rate', 0);
if (rate) await page.evaluate((r) => window.__app.setTimeRate(r), rate);
// --floor: every saving the governor has, switched on (what a phone that cannot keep up ends at)
if (flag('floor')) await page.evaluate(() => window.__app.governor.toFloor());
const t0 = Date.now();
let lastF = 0, lastT = Date.now();
while (Date.now() - t0 < seconds * 1000) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => {
    const a = window.__app, names = a.profileParts;
    return { parts: Array.from(a.profile.avg).map((v, i) => [names ? names[i] : i, +v.toFixed(2)]).filter((p) => p[1] >= 0.05).sort((x, y) => y[1] - x[1]), script: +(a.scriptMs || 0).toFixed(1), frame: a.frameCount, level: a.governor.featureLevel, scale: +a.governor.scale.toFixed(2), calls: a.stats.calls, tris: a.stats.triangles, chunks: a.terrain.drawList.length, agl: Math.round(a.rig.agl), rings: a.terrain.ringSerial, built: a.terrain.built, asked: a.terrain.tiles?.asked || 0, trip: !!a.transfer, wx: a.weather.own ? `wind ${a.weather.windSpeed.toFixed(0)} m/s, rain ${a.weather.rain.toFixed(0)} mm/h` : '', busy: a.terrain.tiles?.busy, stale: a.terrain.staleData, uploads: a.lastUploads,
      sky: a.sky?.field?.on ? `field: ${(a.sky.field.bytesThisFrame / 1024).toFixed(0)} KB this frame, ${a.sky.field.slots.length} snapshots, rate ${a.sky.field.rate.toFixed(0)}x${a.sky.field.busy ? ', waiting' : ''}` : '' };
  });
  const per = lastF ? (Date.now() - lastT) / Math.max(1, s.frame - lastF) : 0; lastF = s.frame; lastT = Date.now();
  console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  frame ${s.frame}  ${per.toFixed(0)} ms a frame here  own work ${s.script} ms: ${s.parts.map((p) => p[0] + ' ' + p[1]).join(' · ')}\n        steps down ${s.level}, scale ${s.scale}, ${s.calls} draw calls, ${s.tris} triangles, ${s.chunks} patches, ${s.agl} m up, map arrivals ${s.rings}, patches built ${s.built}${s.trip ? ', on a GO trip' : ''}${s.wx ? ', ' + s.wx : ''}${s.busy ? ', maps arriving' : ''}${s.stale ? ', stale ' + s.stale : ''}${s.sky ? '\n        ' + s.sky : ''}`);
}
if (opt('shot', null)) { await page.screenshot({ path: opt('shot', null) }); console.log('picture: ' + opt('shot', null)); }
if (problems.length) console.log('problems:', problems.slice(0, 5).join(' | '));
await close();
