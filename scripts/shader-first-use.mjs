// When the game first makes each of its shaders, in play (headless): three compiles and links a
// program at the first draw that uses it, in the middle of a frame; on a phone that is a
// hitch of 100 ms and more, and one made long after the start is a hitch in play.
//   node scripts/shader-first-use.mjs --distdir <frozen build> [--world haven] [--seconds 600] [--query ".."]
// Prints, frame by frame from the first frame of play, the programs made in it (by where
// the material that holds each is found from the app down; "unnamed" if nowhere) and how many there are by then. What is
// made in the first frames is start-up's; anything later is named here so that it can be
// made ahead. (The frame numbers are true on any device; the seconds are this machine's.)
import { open, opt } from './lib/browser.mjs';
const world = opt('world', 'haven'), query = opt('query', ''), seconds = +opt('seconds', 600);
const { base, page, problems, goto, close } = await open({ dist: true, touch: true });
await goto(`${base}?world=${world}${query ? '&' + query : ''}`);
await page.waitForFunction(() => window.__app && window.__app.loaded, null, { timeout: 600000 });
await page.evaluate(() => {
  const a = window.__app, log = window.__made = []; let had = (a.renderer.info.programs || []).length; const f0 = a.frameCount, t0 = performance.now();
  log.push({ frame: 0, s: 0, n: had, names: ['(made before play: ' + had + ')'] });
  // whose program: the materials of the game are looked for from the app down (five levels,
  // and every object of its scenes), and the one that holds the program gives its path as a name
  const whose = (prog) => {
    const seen = new Set(), hits = [];
    const mat = (m, path) => { if (!m || !m.isMaterial || seen.has(m)) return; seen.add(m); const pr = a.renderer.properties.get(m); if (pr && (pr.currentProgram === prog || (pr.programs && [...pr.programs.values()].includes(prog)))) hits.push(path + (m.name ? ':' + m.name : '')); };
    const walk = (o, path, depth) => {
      if (!o || typeof o !== 'object' || seen.has(o) || depth > 5) return;
      if (o.isMaterial) return mat(o, path);
      seen.add(o);
      if (o.isObject3D) { o.traverse((c) => { for (const m of [].concat(c.material || [], c.customDepthMaterial || [])) mat(m, path + (c.name ? '.' + c.name : '')); }); }
      if (Array.isArray(o)) { for (let i = 0; i < Math.min(o.length, 40); i++) walk(o[i], path + '[]', depth + 1); return; }
      if (o instanceof Map) { let i = 0; for (const v of o.values()) { if (i++ > 40) break; walk(v, path + '[]', depth + 1); } return; }
      if (ArrayBuffer.isView(o) || o.isTexture || o.isBufferGeometry || o.isBufferAttribute || o.isWebGLRenderer || o === window) return;
      for (const k in o) { let v; try { v = o[k]; } catch { continue; } if (v && typeof v === 'object') walk(v, path ? path + '.' + k : k, depth + 1); }
    };
    walk(a, '', 0);
    return [...new Set(hits)].slice(0, 2).join('|');
  };
  const fc = a.frameCause.bind(a);
  a.frameCause = (...args) => {
    const p = a.renderer.info.programs || [];
    if (p.length > had) { const fresh = p.slice(had); log.push({ frame: a.frameCount - f0, s: +((performance.now() - t0) / 1000).toFixed(1), n: p.length, names: fresh.map((q) => whose(q) || q.name || 'unnamed') }); had = p.length; }
    return fc(...args);
  };
});
await page.waitForSelector('#start button.primary:not([disabled])', { timeout: 600000 });
await page.click('#start button.primary', { noWaitAfter: true, timeout: 240000 });
await page.waitForTimeout(seconds * 1000);
const res = await page.evaluate(() => ({ made: window.__made, frames: window.__app.frameCount, wait: window.__stats?.wait }));
for (const m of res.made) console.log(`  frame ${String(m.frame).padStart(4)} (${m.s} s here): ${m.names.length} made, ${m.n} by then · ${m.names.join(' ')}`);
const late = res.made.filter((m) => m.frame > 3);
console.log(`${res.frames} frames in ${seconds} s; shaders made after the third frame of play: ${late.reduce((x, m) => x + m.names.length, 0)} in ${late.length} frames`);
if (problems.length) console.log('problems:', problems.slice(0, 5).join(' | '));
await close();
