// What the game hands the GPU, counted call by call in the real game (headless, from a build):
//   node scripts/gl-count.mjs --distdir <frozen build> [--world haven] [--stops ledge,sun,wall,ship,dusk]
//        [--out counts.json] [--floor] [--arrive 150] [--steady 12] [--look 16] [--fly 24] [--size 880x412 --dsf 1.25]
// Nothing here is a frame rate (software WebGL): the counts are true on any device. The benchmark's
// stops of a world are visited in its order, in play mode with the character, the picture held at
// one size (so the governor takes no step; --floor: every saving on). At each stop: the frames
// while what streams in arrives ("arrive": until the ground, trees, far forest, rocks and grass
// are at rest, or --arrive seconds; all but the first --first frames with the scenes hidden, as a
// software-drawn frame takes ten seconds), then --steady frames at rest, a few with nothing drawn (the
// four scenes hidden: what is paid whatever is on screen), the look round and the flight forward
// of the benchmark. For every frame: each pass (a bind of a render target that is then drawn into
// or cleared) with its draw calls, triangles, runs of the vertex shader and instances by material;
// whether the pass began
// with a whole clear (a tile-based GPU must otherwise read the target back in) or took up a target
// left earlier in the frame; every texture and buffer upload with its bytes, what it is, and where
// it fell (between frames, before the frame's first draw, between two passes, or inside a pass:
// between two draws into the same target); read-backs, mip maps made on the GPU, programs linked.
// The summary answers the three questions of docs/briefs/phone-speed-2.md: what differs between
// builds (run it on each and compare the tables), what differs between one frame and the next,
// what grows with the time spent at a place. Exits 1 if no frame was counted at a stop.
import fs from 'node:fs';
import { open, opt, flag } from './lib/browser.mjs';

const world = opt('world', 'haven');
const [W, H] = opt('size', '880x412').split('x').map(Number), dsf = +opt('dsf', 1.25);
const N = { first: +opt('first', 6), arrive: +opt('arrive', 240), steady: +opt('steady', 12), none: +opt('none', 4), look: +opt('look', 16), fly: +opt('fly', 24) };
const out = opt('out', null);

// ---- in the page, before any of its scripts: every WebGL call that matters is counted --------
function install() {
  const P = WebGL2RenderingContext.prototype;
  const C = (window.__glc = { rec: false, frames: [], cur: null, between: [], hook: null, label: '', tag: '', matName: new Map(), bufName: new Map(), texName: new Map(), fbName: new Map() });
  const ids = new WeakMap(); let nextId = 1;
  const idOf = (o) => { if (!o) return 0; let i = ids.get(o); if (!i) ids.set(o, (i = nextId++)); return i; };
  const texInfo = new WeakMap(), rbInfo = new WeakMap(), fbInfo = new WeakMap();
  const S = { fb: null, unit: 0, tex: {}, rb: null, scissor: false, sbox: [0, 0, 0, 0], vp: [0, 0, 0, 0], buf: {} };
  const comps = { 0x1903: 1, 0x8D94: 1, 0x1902: 1, 0x1909: 1, 0x1906: 1, 0x8227: 2, 0x8228: 2, 0x190A: 2, 0x1907: 3, 0x8D98: 3, 0x1908: 4, 0x8D99: 4, 0x84F9: 1 };
  const tbytes = { 0x1401: 1, 0x1400: 1, 0x1403: 2, 0x1402: 2, 0x140B: 2, 0x1405: 4, 0x1404: 4, 0x1406: 4 };
  const whole = { 0x8363: 2, 0x8033: 2, 0x8034: 2, 0x84FA: 4, 0x8C3B: 4, 0x8C3E: 4, 0x8368: 4, 0x8DAD: 8 };
  const bpp = (format, type) => whole[type] || (comps[format] || 4) * (tbytes[type] || 1);
  // (bytes a pixel of a sized format, for storage that is allotted without data)
  const sized = { 0x8229: 1, 0x822B: 2, 0x8051: 3, 0x8058: 4, 0x822D: 2, 0x822F: 4, 0x881A: 8, 0x822E: 4, 0x8230: 8, 0x8814: 16, 0x8C3A: 4, 0x81A5: 2, 0x81A6: 4, 0x8CAC: 4, 0x88F0: 4, 0x8CAD: 8, 0x8C43: 4, 0x8C41: 3, 0x881B: 6, 0x8815: 12 };
  const fbSize = (fb) => { if (!fb) return [P.__canvasW || 0, P.__canvasH || 0]; const i = fbInfo.get(fb); return i ? [i.w, i.h] : [0, 0]; };
  const wrap = (name, f) => { const o = P[name]; if (!o) return; P[name] = function (...a) { return f.call(this, o, a); }; };

  // -- state the counting needs
  wrap('bindFramebuffer', function (o, a) { if (a[0] === 0x8D40 || a[0] === 0x8CA9) S.fb = a[1] || null; return o.apply(this, a); });
  wrap('activeTexture', function (o, a) { S.unit = a[0]; return o.apply(this, a); });
  wrap('bindTexture', function (o, a) { S.tex[S.unit + ':' + a[0]] = a[1]; return o.apply(this, a); });
  wrap('bindRenderbuffer', function (o, a) { S.rb = a[1]; return o.apply(this, a); });
  wrap('bindBuffer', function (o, a) { S.buf[a[0]] = a[1]; return o.apply(this, a); });
  wrap('enable', function (o, a) { if (a[0] === 0x0C11) S.scissor = true; return o.apply(this, a); });
  wrap('disable', function (o, a) { if (a[0] === 0x0C11) S.scissor = false; return o.apply(this, a); });
  wrap('scissor', function (o, a) { S.sbox = a.slice(0, 4); return o.apply(this, a); });
  wrap('viewport', function (o, a) { S.vp = a.slice(0, 4); return o.apply(this, a); });
  wrap('renderbufferStorage', function (o, a) { if (S.rb) rbInfo.set(S.rb, { w: a[2], h: a[3] }); return o.apply(this, a); });
  wrap('renderbufferStorageMultisample', function (o, a) { if (S.rb) rbInfo.set(S.rb, { w: a[3], h: a[4] }); return o.apply(this, a); });
  wrap('framebufferTexture2D', function (o, a) { const t = a[3] && texInfo.get(a[3]); if (S.fb && t) fbInfo.set(S.fb, { w: t.w >> a[4], h: t.h >> a[4], tex: a[3] }); return o.apply(this, a); });
  wrap('framebufferTextureLayer', function (o, a) { const t = a[2] && texInfo.get(a[2]); if (S.fb && t) fbInfo.set(S.fb, { w: t.w >> a[3], h: t.h >> a[3], tex: a[2] }); return o.apply(this, a); });
  wrap('framebufferRenderbuffer', function (o, a) { const t = a[3] && rbInfo.get(a[3]); if (S.fb && t && !fbInfo.get(S.fb)) fbInfo.set(S.fb, { w: t.w, h: t.h }); return o.apply(this, a); });

  // -- a frame's record
  const pass = (kind) => {
    const f = C.cur; if (!f) return null;
    let p = f.passes[f.passes.length - 1];
    if (!p || p.fbo !== S.fb) {
      const [w, h] = fbSize(S.fb), id = idOf(S.fb);
      const seen = f.passes.some((q) => q.fb === id);
      const full = kind === 'clear' && (!S.scissor || (S.sbox[0] <= 0 && S.sbox[1] <= 0 && S.sbox[2] >= w && S.sbox[3] >= h));
      p = { fbo: S.fb, fb: id, w, h, n: 0, draws: 0, tris: 0, inst: 0, verts: 0, clears: 0, first: full ? 'whole clear' : kind === 'clear' ? 'clear of a part' : 'draw', again: seen, area: 0, by: {} };
      f.passes.push(p);
    }
    p.n++;
    return p;
  };
  const draw = (gl, mode, count, inst) => {
    const p = pass('draw'); if (!p) return;
    const t = (mode === 4 ? Math.floor(count / 3) : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0) * inst;
    p.draws++; p.tris += t; p.inst += inst > 1 ? inst : 0;
    p.area = Math.max(p.area, S.scissor ? Math.min(S.vp[2] * S.vp[3], S.sbox[2] * S.sbox[3]) : S.vp[2] * S.vp[3]);
    // (runs of the vertex shader: every corner of an unindexed mesh, each vertex once of an indexed one, for every instance)
    const v = (C.vtx || count) * inst;
    p.verts += v;
    const l = C.label || '(direct)', b = p.by[l] || (p.by[l] = [0, 0, 0, 0]);
    b[0]++; b[1] += t; b[2] += inst > 1 ? inst : 0; b[3] += v;
  };
  wrap('drawArrays', function (o, a) { draw(this, a[0], a[2], 1); return o.apply(this, a); });
  wrap('drawElements', function (o, a) { draw(this, a[0], a[1], 1); return o.apply(this, a); });
  wrap('drawArraysInstanced', function (o, a) { draw(this, a[0], a[2], a[3]); return o.apply(this, a); });
  wrap('drawElementsInstanced', function (o, a) { draw(this, a[0], a[1], a[4]); return o.apply(this, a); });
  wrap('drawRangeElements', function (o, a) { draw(this, a[0], a[3], 1); return o.apply(this, a); });
  wrap('clear', function (o, a) { const p = pass('clear'); if (p) p.clears++; return o.apply(this, a); });
  for (const n of ['clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi']) wrap(n, function (o, a) { const p = pass('clear'); if (p) p.clears++; return o.apply(this, a); });

  // -- uploads
  const upload = (kind, bytes, what, extra) => {
    if (!C.rec) return;
    const f = C.cur, u = { kind, bytes, what, ...extra };
    if (!f) { C.between.push(u); return; }
    u.pi = f.passes.length - 1; u.at = u.pi >= 0 ? f.passes[u.pi].n : 0; u.fb = S.fb;
    f.up.push(u);
  };
  const texOf = (target) => S.tex[S.unit + ':' + (target >= 0x8515 && target <= 0x851A ? 0x8513 : target)];
  const srcDims = (s) => [s.videoWidth || s.naturalWidth || s.width || 0, s.videoHeight || s.naturalHeight || s.height || 0];
  const texUp = (kind, target, level, w, h, d, bytes, sub) => {
    const t = texOf(target);
    if (t && !sub && level === 0) texInfo.set(t, { w, h, d });
    upload(kind, bytes, t ? 't' + idOf(t) : 't?', { w, h, d, level, tex: t });
  };
  wrap('texImage2D', function (o, a) {
    if (a.length >= 9) texUp(a[8] ? 'tex' : 'tex-alloc', a[0], a[1], a[3], a[4], 1, a[3] * a[4] * bpp(a[6], a[7]), false);
    else { const [w, h] = srcDims(a[5]); texUp('tex', a[0], a[1], w, h, 1, w * h * bpp(a[3], a[4]), false); }
    return o.apply(this, a);
  });
  wrap('texSubImage2D', function (o, a) {
    if (a.length >= 9) texUp('tex', a[0], a[1], a[4], a[5], 1, a[4] * a[5] * bpp(a[6], a[7]), true);
    else { const [w, h] = srcDims(a[6]); texUp('tex', a[0], a[1], w, h, 1, w * h * bpp(a[4], a[5]), true); }
    return o.apply(this, a);
  });
  wrap('texImage3D', function (o, a) { texUp(a[9] ? 'tex' : 'tex-alloc', a[0], a[1], a[3], a[4], a[5], a[3] * a[4] * a[5] * bpp(a[7], a[8]), false); return o.apply(this, a); });
  wrap('texSubImage3D', function (o, a) { texUp('tex', a[0], a[1], a[5], a[6], a[7], a[5] * a[6] * a[7] * bpp(a[8], a[9]), true); return o.apply(this, a); });
  wrap('texStorage2D', function (o, a) { texUp('tex-alloc', a[0], 0, a[3], a[4], 1, a[3] * a[4] * (sized[a[2]] || 4) * (a[1] > 1 ? 4 / 3 : 1), false); return o.apply(this, a); });
  wrap('texStorage3D', function (o, a) { texUp('tex-alloc', a[0], 0, a[3], a[4], a[5], a[3] * a[4] * a[5] * (sized[a[2]] || 4), false); return o.apply(this, a); });
  wrap('compressedTexImage2D', function (o, a) { texUp('tex', a[0], a[1], a[3], a[4], 1, a[6]?.byteLength || 0, false); return o.apply(this, a); });
  wrap('compressedTexSubImage2D', function (o, a) { texUp('tex', a[0], a[1], a[4], a[5], 1, a[7]?.byteLength || 0, true); return o.apply(this, a); });
  const bufWhat = (src) => (src && src.buffer ? src.buffer : src);
  wrap('bufferData', function (o, a) {
    const s = a[1], bytes = typeof s === 'number' ? s : !s ? 0 : a.length > 4 && a[4] ? a[4] * (s.BYTES_PER_ELEMENT || 1) : s.byteLength;
    upload(typeof s === 'number' || !s ? 'buf-alloc' : 'buf', bytes, 'b' + idOf(S.buf[a[0]]), { src: typeof s === 'object' ? bufWhat(s) : null, index: a[0] === 0x8893 });
    return o.apply(this, a);
  });
  wrap('bufferSubData', function (o, a) {
    const s = a[2], bytes = !s ? 0 : a.length > 4 && a[4] ? a[4] * (s.BYTES_PER_ELEMENT || 1) : s.byteLength;
    upload('buf', bytes, 'b' + idOf(S.buf[a[0]]), { src: bufWhat(s), index: a[0] === 0x8893, sub: true });
    return o.apply(this, a);
  });
  // -- other calls that can make the GPU wait, counted by name (and by where in the frame)
  for (const n of ['readPixels', 'getBufferSubData', 'generateMipmap', 'blitFramebuffer', 'invalidateFramebuffer', 'invalidateSubFramebuffer', 'linkProgram', 'finish', 'flush', 'getError', 'copyTexSubImage2D', 'copyTexImage2D', 'fenceSync', 'clientWaitSync', 'checkFramebufferStatus', 'beginQuery', 'bufferData', 'useProgram']) {
    wrap(n, function (o, a) {
      const f = C.cur; if (f) { let k = n; if (n === 'readPixels') k = S.buf[0x88EB] ? 'readPixels into a buffer (no wait)' : 'readPixels (waits for the GPU)'; f.misc[k] = (f.misc[k] || 0) + 1; }
      // (a target given up is as good as cleared: the next pass into it need not read it back)
      return o.apply(this, a);
    });
  }

  // -- frames: one per animation-frame callback that drew anything
  C.begin = () => {
    if (C.hook) C.hook();
    if (!C.rec) { C.cur = null; return; }
    const cv = document.getElementById('view'); if (cv) { P.__canvasW = cv.width; P.__canvasH = cv.height; }
    C.cur = { tag: C.tag, t: performance.now(), passes: [], up: C.between.map((u) => ({ ...u, where: 'between frames' })), misc: {} };
    C.between = [];
  };
  C.end = () => {
    const f = C.cur; C.cur = null;
    if (!f || !f.passes.length) { if (f) C.between.push(...f.up.filter((u) => u.where)); return; }
    const fbLabel = (id, w, h) => (id ? (C.fbName.get(id) || 'target ' + id) : 'the canvas') + ` ${w}x${h}`;
    const texLabel = (u) => { const t = u.tex && C.texNameOf ? C.texNameOf(u.tex) : null; return t || `texture ${u.w}x${u.h}${u.d > 1 ? 'x' + u.d : ''}`; };
    const rec = { tag: f.tag, ms: +(performance.now() - f.t).toFixed(1), passes: [], up: [], misc: f.misc, game: C.game ? C.game() : null };
    for (const p of f.passes) rec.passes.push({ fb: fbLabel(p.fb, p.w, p.h), first: p.first, again: p.again, draws: p.draws, tris: p.tris, inst: p.inst, verts: p.verts, clears: p.clears, area: p.area, by: p.by });
    for (const u of f.up) {
      let where = u.where;
      if (!where) {
        const p = u.pi >= 0 ? f.passes[u.pi] : null;
        where = !p ? "before the frame's first draw" : p.n > u.at && u.at > 0 ? 'inside a pass' : 'between passes';
        if (where === 'inside a pass') where += ' (' + fbLabel(p.fb, p.w, p.h) + ')';
      }
      const what = u.kind.startsWith('tex') ? texLabel(u) : (C.bufName.get(u.src) || (u.index ? 'an index buffer' : 'a vertex buffer'));
      rec.up.push({ kind: u.kind, bytes: Math.round(u.bytes), what, where, sub: !!u.sub });
    }
    C.frames.push(rec);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { C.begin(); try { cb(t); } finally { C.end(); } });

  // -- names: who owns each material, texture, render target and buffer (found by walking the
  // game's own objects from window.__app; the shortest way to each is its name)
  C.names = () => {
    const app = window.__app, r = app.renderer, props = r.properties;
    C.matName.clear(); C.bufName.clear(); C.texName.clear(); C.fbName.clear();
    const texByThree = [];
    const seen = new Set(), queue = [[app, 'app', 0]];
    const skip = new Set(['parent', 'renderer', 'domElement', 'canvas', 'gl', 'context', 'app', 'workers', 'hs', 'audio', 'save', 'ephemeris', 'params', 'log']);
    let n = 0;
    while (queue.length && n < 400000) {
      const [o, path, depth] = queue.shift(); n++;
      if (o.isMaterial) { if (!C.matName.has(o)) C.matName.set(o, path); }
      if (o.isTexture) { texByThree.push([o, path]); }
      if (o.isWebGLRenderTarget) { const p = props.get(o), fb = p && p.__webglFramebuffer; if (fb && !Array.isArray(fb)) { const id = idOf(fb); if (!C.fbName.has(id)) C.fbName.set(id, path); } }
      if (o.isBufferAttribute || o.isInterleavedBuffer) { const a = o.array; if (a && a.buffer && !C.bufName.has(a.buffer)) C.bufName.set(a.buffer, path); continue; }
      if (depth >= 9) continue;
      const push = (v, k) => {
        if (!v || typeof v !== 'object' || seen.has(v)) return;
        if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer || (typeof Node !== 'undefined' && v instanceof Node) || v instanceof WebGLTexture || v instanceof Worker || v instanceof Promise) return;
        seen.add(v); queue.push([v, k, depth + 1]);
      };
      if (Array.isArray(o)) { if (o.length && typeof o[0] !== 'object') continue; for (let i = 0; i < Math.min(o.length, 600); i++) push(o[i], path + '[]'); continue; }
      if (o instanceof Map || o instanceof Set) { let i = 0; for (const v of o.values()) { if (i++ > 600) break; push(v, path + '[]'); } continue; }
      let keys; try { keys = Object.keys(o); } catch { continue; }
      for (const k of keys) { if (skip.has(k) || k.startsWith('__')) continue; let v; try { v = o[k]; } catch { continue; } push(v, path === 'app' ? k : path + '.' + k); }
    }
    for (const [t, path] of texByThree) { const p = props.get(t), g = p && p.__webglTexture; if (g) { const id = idOf(g); if (!C.texName.has(id)) C.texName.set(id, path); } }
    C.texNameOf = (g) => C.texName.get(idOf(g));
    if (!r.__glcWrapped) {
      r.__glcWrapped = true;
      const rbd = r.renderBufferDirect.bind(r);
      r.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
        C.label = C.matName.get(material) || material.name || material.type || '?';
        // (how many vertices one instance of this draw runs the shader for)
        const pos = geometry.attributes.position, range = geometry.drawRange;
        C.vtx = geometry.index ? (pos ? pos.count : 0) : Math.min(pos ? pos.count : 0, range.count < Infinity ? range.count : Infinity);
        try { return rbd(camera, scene, geometry, material, object, group); } finally { C.label = ''; C.vtx = 0; }
      };
    }
    return { materials: C.matName.size, textures: C.texName.size, targets: C.fbName.size, buffers: C.bufName.size, walked: n };
  };
  // (what the game itself says of the frame)
  C.game = () => {
    const a = window.__app; if (!a) return null;
    return { frame: a.frameCount, own: +(a.scriptMs || 0).toFixed(1), patches: a.terrain.drawList.length, built: a.terrain.built, trees: a.trees.count, treeTris: a.trees.triangles, far: a.farForest.count, level: a.governor.featureLevel, scale: +a.governor.scale.toFixed(3), view: a.post.viewW + 'x' + a.post.viewH, tiles: (a.nearShadow._draw || []).map((d) => (d ? 1 : 0)).join(''), hour: +a.timeOffsetHours.toFixed(3) };
  };
}

// ---- the route ------------------------------------------------------------------------------
const { base, page, problems, errors, goto, close } = await open({ dist: true, width: W, height: H, dsf, touch: true });
await page.addInitScript(install);
await goto(`${base}?world=${world}&hud=0&scale=${opt('scale', 1)}${opt('query', '') ? '&' + opt('query', '') : ''}`);
await page.waitForFunction(() => window.__app && window.__app.loaded, null, { timeout: 900000 });
await page.waitForSelector('#start button.primary:not([disabled])', { timeout: 900000 });
await page.click('#start button.primary', { noWaitAfter: true, timeout: 600000 });
await page.waitForFunction(() => window.__app.playing !== false && !document.querySelector('#start'), null, { timeout: 600000 }).catch(() => {});
const info = await page.evaluate(({ floor }) => {
  const a = window.__app;
  a.setHero(true); a.timeRate = 1; a.paused = false;
  if (floor) a.governor.toFloor();
  const gl = a.renderer.getContext();
  return { commit: (document.body.innerText.match(/build ([0-9a-f]{7})/) || [])[1] || '', names: Object.keys(a.world.scene.bookmarks).slice(0, 5), view: a.post.viewW + 'x' + a.post.viewH, timer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'), mode: a.governor.mode, level: a.governor.featureLevel };
}, { floor: flag('floor') });
const stops = opt('stops', info.names.join(',')).split(',');
console.log(`gl-count: ${world}, stops ${stops.join(', ')} · picture ${info.view} · mode ${info.mode}${flag('floor') ? ' · every saving on (' + info.level + ' steps)' : ''}`);

const all = [];
for (const stop of stops) {
  const t0 = Date.now();
  await page.evaluate(({ stop, N }) => {
    const C = window.__glc, a = window.__app, rig = a.rig;
    C.names();
    a.applyBookmark(stop); a.jumpedAt = performance.now();
    const s = { k: 0, phase: 'arrive', t0: performance.now(), left: 0, done: false };
    C.script = s; C.frames = []; C.between = []; C.rec = true; C.tag = stop + ':arrive';
    const scenes = [a.nearScene, a.farScene, a.heroScene, a.dustScene];
    const show = (on) => { for (const x of scenes) x.visible = on; if (on) a.hero.setVisible(true); };
    const T = a.grass.tables, tables = () => (a.grass.keepBlades > 0 ? T.near.pending : 0) + (a.grass.keepClumps > 0 ? T.mid.pending + T.far.pending : 0);
    const rest = () => a.terrain.idle && !a.trees.busy && !a.farForest.busy && !a.farRocks.busy && !a.grass.busy && !a.sky.busy && tables() === 0;
    C.hook = () => {
      if (s.done) return;
      s.k++;
      const go = (phase, n) => { s.phase = phase; s.left = n; s.k = 0; C.tag = stop + ':' + phase; if (phase === 'steady') C.names(); };
      // (the first frames as they come; then the scenes hidden while the rest arrives: a frame
      // drawn in software takes ten seconds, hidden one, and what arrives is paced by frames)
      if (s.phase === 'arrive') { if (s.k >= N.first) { show(false); go('settle', 0); } return; }
      if (s.phase === 'settle') { if (s.k > 20 && (rest() || performance.now() - s.t0 > N.arrive * 1000)) { s.rested = rest(); show(true); go('warm', 3); } return; }
      if (--s.left > 0) { if (s.phase === 'look') rig.heading = (rig.heading + 60 / N.look + 360) % 360; return; }
      if (s.phase === 'warm') go('steady', N.steady);
      else if (s.phase === 'steady') { show(false); go('nothing drawn', N.none); }
      else if (s.phase === 'nothing drawn') { show(true); go('look', N.look); }
      else if (s.phase === 'look') { a.input.virtualDown('KeyW'); go('fly', N.fly); }
      else { a.input.virtualUp('KeyW'); s.done = true; C.rec = false; C.hook = null; }
    };
  }, { stop, N });
  await page.waitForFunction(() => window.__glc.script.done, null, { timeout: 3600000, polling: 2000 });
  const frames = await page.evaluate(() => { const C = window.__glc; return { frames: C.frames, rested: C.script.rested }; });
  console.log(`\n===== ${world} ${stop}: ${frames.frames.length} frames counted in ${((Date.now() - t0) / 1000).toFixed(0)} s${frames.rested ? '' : ' (still arriving when the wait ran out)'} =====`);
  all.push({ stop, ...frames });
  summary(stop, frames.frames);
}
if (out) { fs.writeFileSync(out, JSON.stringify({ world, info, stops: all })); console.log(`\nevery frame: ${out}`); }
if (problems.length) console.log('problems:', problems.slice(0, 5).join(' | '));
await close();
if (all.some((s) => !s.frames.length) || errors.length) { console.log('FAILED: a stop with no frame counted, or errors on the page'); process.exit(1); }

// ---- what the frames say --------------------------------------------------------------------
function summary(stop, frames) {
  const of = (ph) => frames.filter((f) => f.tag === stop + ':' + ph);
  const k = (x) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : String(Math.round(x)));
  const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB');
  const tot = (f) => f.passes.reduce((a, p) => { a.draws += p.draws; a.tris += p.tris; a.inst += p.inst; a.verts += p.verts || 0; return a; }, { draws: 0, tris: 0, inst: 0, verts: 0 });
  const avg = (list, fn) => (list.length ? list.reduce((a, f) => a + fn(f), 0) / list.length : 0);
  const line = (name, list) => {
    if (!list.length) return;
    const up = (f, inside) => f.up.filter((u) => !u.kind.endsWith('alloc') && (!inside || u.where.startsWith('inside'))).reduce((a, u) => a + u.bytes, 0);
    console.log(`  ${name.padEnd(14)} ${String(list.length).padStart(3)} frames · a frame: ${avg(list, (f) => f.passes.length).toFixed(1)} passes, ${avg(list, (f) => tot(f).draws).toFixed(0)} draw calls, ${k(avg(list, (f) => tot(f).tris))} triangles, ${k(avg(list, (f) => tot(f).verts))} runs of a vertex shader, ${k(avg(list, (f) => tot(f).inst))} instances · uploads ${kb(avg(list, (f) => up(f)))} (${kb(avg(list, (f) => up(f, true)))} inside a pass) · the page's own work ${avg(list, (f) => f.game?.own || 0).toFixed(1)} ms`);
  };
  for (const ph of ['arrive', 'settle', 'steady', 'nothing drawn', 'look', 'fly']) line(ph, of(ph));
  // -- growth: the first frames after the jump against the frames at rest
  const arr = of('arrive');
  {
    const g = (l) => `${avg(l, (f) => tot(f).draws).toFixed(0)} calls / ${k(avg(l, (f) => tot(f).tris))} triangles / ${avg(l, (f) => f.game?.patches || 0).toFixed(0)} patches / ${k(avg(l, (f) => f.game?.trees || 0))} trees (${k(avg(l, (f) => f.game?.treeTris || 0))} triangles) / ${k(avg(l, (f) => f.game?.far || 0))} far trees`;
    console.log(`  just arrived: ${g(arr)}\n  at rest:      ${g(of('steady'))}`);
  }
  // -- the passes of a frame at rest, in order, with who draws in each
  const st = of('steady');
  const table = (list, title) => {
    if (!list.length) return;
    console.log(`  ${title}`);
    // (passes are matched across frames by target and by their turn among the passes into that target)
    const rows = new Map();
    for (const f of list) {
      const turn = new Map();
      f.passes.forEach((p, i) => {
        const t = (turn.get(p.fb) || 0) + 1; turn.set(p.fb, t);
        const key = p.fb + (t > 1 ? ' #' + t : '');
        const r = rows.get(key) || { key, order: 0, n: 0, draws: 0, tris: 0, inst: 0, first: new Map(), again: 0, area: 0, by: new Map(), min: Infinity, max: 0 };
        r.order += i; r.n++; r.draws += p.draws; r.tris += p.tris; r.inst += p.inst; r.again += p.again ? 1 : 0; r.area = Math.max(r.area, p.area);
        r.min = Math.min(r.min, p.tris); r.max = Math.max(r.max, p.tris);
        r.first.set(p.first, (r.first.get(p.first) || 0) + 1);
        for (const [l, b] of Object.entries(p.by)) { const x = r.by.get(l) || [0, 0, 0, 0]; x[0] += b[0]; x[1] += b[1]; x[2] += b[2]; x[3] += b[3] || 0; r.by.set(l, x); }
        rows.set(key, r);
      });
    }
    for (const r of [...rows.values()].sort((a, b) => a.order / a.n - b.order / b.n)) {
      const first = [...r.first].sort((a, b) => b[1] - a[1]).map(([f, c]) => (c === r.n ? f : `${f} ${c}/${r.n}`)).join(', ');
      console.log(`    ${r.key}${r.n < list.length ? ` [in ${r.n} of ${list.length} frames]` : ''}: ${(r.draws / r.n).toFixed(1)} calls, ${k(r.tris / r.n)} tris${r.max > r.min * 1.05 + 10 ? ` (${k(r.min)} to ${k(r.max)})` : ''}${r.inst ? ', ' + k(r.inst / r.n) + ' inst' : ''} · begins with a ${first}${r.again ? ' · TAKEN UP AGAIN after another target' : ''} · up to ${k(r.area)} px`);
      const by = [...r.by].sort((a, b) => b[1][1] - a[1][1] || b[1][0] - a[1][0]);
      console.log('        ' + by.slice(0, 14).map(([l, b]) => `${l} ${(b[0] / r.n).toFixed(b[0] % r.n ? 1 : 0)}c ${k(b[1] / r.n)}t ${k(b[3] / r.n)}v${b[2] ? ' ' + k(b[2] / r.n) + 'i' : ''}`).join(' · ') + (by.length > 14 ? ` · and ${by.length - 14} more` : ''));
    }
  };
  table(st, 'at rest, pass by pass (c: draw calls, t: triangles, v: runs of the vertex shader, i: instances, a frame):');
  table(of('nothing drawn'), 'with the four scenes hidden (what is paid whatever is on screen):');
  // -- one frame and the next: the frames at rest side by side
  if (st.length >= 4) {
    console.log('  one frame and the next, at rest (shadow tiles drawn wide/fine/figure · passes · calls · triangles · uploads):');
    console.log('    ' + st.slice(0, 12).map((f) => `${f.game?.tiles || '?'} ${f.passes.length}p ${tot(f).draws}c ${k(tot(f).tris)}t ${kb(f.up.reduce((a, u) => a + (u.kind.endsWith('alloc') ? 0 : u.bytes), 0))}`).join(' | '));
    const sig = (f) => f.passes.map((p) => p.fb).join(' > ');
    const kinds = new Map(); for (const f of st) kinds.set(sig(f), (kinds.get(sig(f)) || 0) + 1);
    console.log(`    ${kinds.size} different order${kinds.size > 1 ? 's' : ''} of passes among them`);
    const ev = st.filter((_, i) => i % 2 === 0), od = st.filter((_, i) => i % 2 === 1);
    console.log(`    even frames ${k(avg(ev, (f) => tot(f).tris))} triangles in ${avg(ev, (f) => tot(f).draws).toFixed(0)} calls, odd frames ${k(avg(od, (f) => tot(f).tris))} in ${avg(od, (f) => tot(f).draws).toFixed(0)}`);
  }
  // -- uploads: what, how much, where
  const upTable = (list, title) => {
    const rows = new Map(); let n = 0;
    for (const f of list) for (const u of f.up) { n++; const key = `${u.kind} · ${u.what.replace(/\d+x\d+(x\d+)?/, (m) => m)} · ${u.where}`; const r = rows.get(key) || [0, 0, new Set()]; r[0]++; r[1] += u.bytes; r[2].add(f); rows.set(key, r); }
    if (!n) { console.log(`  ${title}: none`); return; }
    console.log(`  ${title} (${list.length} frames):`);
    for (const [key, r] of [...rows].sort((a, b) => b[1][1] - a[1][1]).slice(0, 22)) console.log(`    ${kb(r[1] / list.length).padStart(9)} a frame · ${r[0]} times in ${r[2].size} frames · ${key}`);
    if (rows.size > 22) console.log(`    and ${rows.size - 22} smaller`);
  };
  upTable(st, 'uploads at rest'); upTable(arr, 'uploads in the first frames after the jump'); upTable(of('settle'), 'uploads while the rest arrives (scenes hidden)'); upTable([...of('look'), ...of('fly')], 'uploads while looking round and flying');
  const misc = new Map(); for (const f of frames) for (const [n, c] of Object.entries(f.misc)) { const key = f.tag.split(':')[1] + ' · ' + n; misc.set(key, (misc.get(key) || 0) + c / of(f.tag.split(':')[1]).length); }
  const ms = [...misc].filter(([n]) => !/useProgram|bufferData|checkFramebufferStatus|invalidate/.test(n));
  if (ms.length) console.log('  other calls a frame: ' + ms.map(([n, c]) => `${n} ${c.toFixed(2)}`).join(' · '));
}
