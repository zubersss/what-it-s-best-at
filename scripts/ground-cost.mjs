// What the ground's shading costs, as a count of work (never a frame rate): the real
// game's ground drawn alone, at a fixed size, at a set of views, in the headless browser.
//   node scripts/ground-cost.mjs [--only ledge,air3k] [--save dir] [--compare dir] [--frames 5]
//                                [--tiers] [--step ground-far] [--add t=6] [--size 880x412] [--dsf 1.25] [--dist | --distdir <build>] [--timeout 900] [--floor]
// Software WebGL runs every instruction of a fragment on the CPU: its time per pixel
// follows the count of instructions and texture reads, not a phone's GPU. A shader three
// times faster here is very likely a great deal faster on the phone; how much, only the
// phone's benchmark says (its row "the ground's shading").
// For each view: the ground alone drawn `frames` times in one flat tone (uPlain 1: its
// triangles and nothing else) and shaded (uPlain 0), each timed until drawn (a pixel read
// back); the difference is the shading. The lowest time of the runs is kept (a machine
// that is busy only ever adds).
// --save dir: the ground-alone picture of each view (PNG, and the raw bytes for --compare).
// --compare dir: against pictures saved earlier: the mean and the largest difference in
// display levels (0..255), the share of pixels more than 2 and more than 8 levels off, and a
// difference picture (x 8) beside the new one. Exit code 1 if a view failed to load.
// --before file.js: an earlier terrainMaterial.js (git show <commit>:src/terrain/terrainMaterial.js > file.js):
// the same ground, in the same browser session and at the same moment, is drawn with that
// shader too, timed, and its picture set against the new one's: before -> after for each
// view, and how far the two pictures are apart. (Needs the dev server: not with --dist.)
// The dev server reloads the page when a source file changes: for a long run copy the tree
// first and start the script from the copy (scripts/ground-cost-run.sh does).
// --floor: with every saving of the governor on (the picture a phone at its floor draws).
// --parts file.mjs: where the shading goes. The file's default export is a list of
// [name, find, replacement] (find: a string of the fragment shader's source); each is made
// alone, the shader built again, and the time it saves printed (a part that is taken out
// this way costs what it saves; the picture is wrong meanwhile, which is the point).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { open, opt, flag, root } from './lib/browser.mjs';
import { shaderUse, overPhone } from './lib/glLimits.mjs';

// The views. q: the game's own URL parameters. (alt is the height over the datum, not over
// the ground: the opening place stands at 1 513 m, the steppe at 761 m. Each was looked at:
// the pictures are in docs/shots/phone-speed.)
export const VIEWS = [
  { id: 'ledge', what: 'Haven, the opening view', q: 'world=haven&shot=ledge' },
  { id: 'steppe', what: 'Haven, dry grassland from 40 m up', q: 'world=haven&shot=ledge&lat=18.501&lon=132.671&alt=801&heading=250&pitch=-8' },
  { id: 'wood', what: 'Haven, in the north wood', q: 'world=haven&shot=ledge&lat=22.983&lon=129.507&heading=6&pitch=-4' },
  { id: 'rock', what: 'Haven, a steep mountain side from 150 m off', q: 'world=haven&shot=ledge&lat=-49.0223&lon=48.211&alt=1968&heading=257&pitch=0' },
  { id: 'shore', what: 'Haven, the eastern shore from 25 m up', q: 'world=haven&shot=ledge&lat=18.501&lon=133.348&alt=41&heading=90&pitch=-8' },
  { id: 'air300', what: 'Haven from 300 m up', q: 'world=haven&shot=ledge&alt=1813&heading=235&pitch=-10' },
  { id: 'air3k', what: 'Haven from 3 km up', q: 'world=haven&shot=ledge&alt=4513&heading=235&pitch=-14' },
  { id: 'air30k', what: 'Haven from 30 km up', q: 'world=haven&shot=ledge&alt=31513&heading=235&pitch=-30' },
  { id: 'meadow', what: 'Haven, the cornflower meadow', q: 'world=haven&shot=ledge&lat=-54.39501&lon=38.28479&t=5&heading=45' },
  { id: 'meadow1k', what: 'Haven, the cornflower meadow from 1 km up, 60 degrees down', q: 'world=haven&shot=ledge&lat=-54.39501&lon=38.28479&t=5&heading=45&alt=2468&pitch=-60' },
  { id: 'river', what: 'Haven, a mountain river from 35 m over its water, looking down stream', q: 'world=haven&shot=ledge&lat=-51.95908&lon=48.94203&alt=484&heading=38&pitch=-22' },
  { id: 'fall', what: 'Haven, a waterfall on a mountain brook from 120 m down stream', q: 'world=haven&shot=ledge&lat=-48.72839&lon=50.32466&alt=911&heading=315&pitch=-8' },
  { id: 'earth', what: "Earth's opening view", q: 'world=earth&shot=ledge' },
  { id: 'mars', what: "Mars's opening view", q: 'world=mars&shot=ledge' },
];

const only = opt('only', null)?.split(','), frames = +opt('frames', 5), timeoutS = +opt('timeout', 900);
const [W, H] = opt('size', '880x412').split('x').map(Number), dsf = +opt('dsf', 1.25);
const saveDir = opt('save', null), cmpDir = opt('compare', null);
const beforeFile = opt('before', null);
if (beforeFile) {
  // the earlier shader as a module the page can load: its imports named from the root
  const src = (await readFile(beforeFile, 'utf8')).replace(/from '\.\.\//g, "from '/src/").replace(/from '\.\//g, "from '/src/terrain/");
  await mkdir(path.join(root, '.cache', 'ground-before'), { recursive: true });
  await writeFile(path.join(root, '.cache', 'ground-before', 'terrainMaterial.js'), src);
}
const parts = opt('parts', null) ? (await import(path.resolve(opt('parts', null)))).default : null;

// A PNG from RGB bytes (no library: zlib is all it takes).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; }
export function png(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

const { base, page, errors, goto, close } = await open({ dist: flag('dist'), width: W, height: H, dsf });
if (saveDir) await mkdir(saveDir, { recursive: true });
let failed = false;
const rows = [];
for (const v of VIEWS) {
  if (only && !only.includes(v.id)) continue;
  const t0 = Date.now();
  errors.length = 0;
  // (a small picture while the ground arrives: a software-drawn frame at full size takes seconds;
  // the measuring is at full size)
  await goto(`${base}?${v.q}&scale=0.25${opt('add', null) ? '&' + opt('add', null) : ''}`);   // --add "t=6": the same views at another hour
  // (only the ground is wanted: what stands on it is taken out of its scene as it arrives,
  // so that a wood settles in minutes, not in half an hour of software-drawn leaves)
  const strip = () => page.evaluate(() => {
    const a = window.__app; if (!a || !a.nearScene || !a.terrain) return;
    for (const c of [...a.nearScene.children]) if (c !== a.terrain.group) a.nearScene.remove(c);
  }).catch(() => {});
  const until = Date.now() + timeoutS * 1000;
  let ready = false;
  while (Date.now() < until) {
    await strip();
    ready = await page.evaluate(() => window.__shotReady === true || !!window.__shotError).catch(() => false);
    if (ready) break;
    await page.waitForTimeout(1000);
  }
  const err = await page.evaluate(() => window.__shotError || null);
  if (!ready || err) { console.log(`${v.id}: ${err ? 'ERROR ' + err : 'not ready after ' + timeoutS + ' s'}`); failed = true; if (err) continue; }
  try {
    const use = await shaderUse(page);
    for (const l of overPhone(use)) { console.log(`${v.id}: OVER A PHONE'S LIMITS — ${l}`); failed = true; }
    if (use.some((p) => !p.linked)) { console.log(`${v.id}: SHADER FAILED`); failed = true; }
  } catch { /* the page errors below say it */ }
  if (errors.length) { console.log(`${v.id}: PAGE ERRORS — ${errors.slice(0, 3).join(' | ')}`); failed = true; }
  // --step id[,id]: with these savings of the governor on (what one step buys, and how the ground looks with it)
  if (opt('step', null)) await page.evaluate(async (ids) => { const m = await import(/* @vite-ignore */ '/src/perf/governor.js'); for (const id of ids) { const st = m.FEATURE_STEPS.find((f) => f.id === id); if (!st) throw new Error('no step ' + id); st.apply(window.__app, true); } }, opt('step', null).split(','));
  const res = await page.evaluate(async ({ frames, floor, before }) => {
    const a = window.__app, r = a.renderer, gl = r.getContext(), post = a.post, sh = a.terrain.shared, cam = a.rig.camera;
    if (floor) a.governor.toFloor();
    post.setScale(1); sh.uViewport.value.set(post.viewW, post.viewH);
    const mesh = a.terrain.group, matNew = mesh.material;
    let matOld = null;
    if (before) { const m = await import(/* @vite-ignore */ '/.cache/ground-before/terrainMaterial.js'); matOld = m.makeTerrainMaterial(sh, a.terrain.pool); post.setScale(1); sh.uViewport.value.set(post.viewW, post.viewH); }
    // (the game's own loop stands still while this runs: one synchronous stretch)
    const px = new Float32Array(4);
    const draw = (plain) => {
      sh.uPlain.value = plain;
      post.beginScene();
      const t = performance.now();
      r.render(mesh, cam);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);         // (returns when it is drawn)
      return performance.now() - t;
    };
    const w = post.viewW, h = post.viewH, f = new Float32Array(w * h * 4);
    let lit = 0;
    // the picture of the ground alone, in display levels (a plain curve: the same for every build)
    const picture = () => {
      draw(0);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, f);
      const out = new Uint8Array(w * h * 3);
      lit = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 3;
        if (f[i + 3] > 0.5) lit++;
        for (let c = 0; c < 3; c++) { const e = Math.max(f[i + c], 0); out[o + c] = Math.round(255 * Math.pow(Math.min(1, 1.5 * e / (e + 0.5)), 1 / 2.2)); }
      }
      let s = ''; for (let i = 0; i < out.length; i += 32768) s += String.fromCharCode.apply(null, out.subarray(i, i + 32768));
      return btoa(s);
    };
    const measure = (mat) => {
      mesh.material = mat;
      draw(1); draw(0);
      let plain = 1e9, full = 1e9;
      for (let i = 0; i < frames; i++) { plain = Math.min(plain, draw(1)); full = Math.min(full, draw(0)); }
      return { plain, full, b64: picture() };
    };
    const old = matOld ? measure(matOld) : null, now = measure(matNew);
    mesh.material = matNew;
    return { ...now, old, w, h, lit: lit / (w * h), chunks: a.terrain.drawList.length, exposure: post.exposure };
  }, { frames, floor: flag('floor'), before: !!beforeFile });
  if (parts) {
    const saved = await page.evaluate(({ frames, parts }) => {
      const a = window.__app, r = a.renderer, gl = r.getContext(), post = a.post, sh = a.terrain.shared, cam = a.rig.camera, mat = a.terrain.group.material;
      const px = new Float32Array(4), src = mat.fragmentShader;
      // (the game's own frames in between have put the picture back to its small size)
      post.setScale(1); sh.uViewport.value.set(post.viewW, post.viewH);
      const time = () => {
        sh.uPlain.value = 0;
        let best = 1e9;
        for (let i = 0; i < frames + 2; i++) { post.beginScene(); const t = performance.now(); r.render(a.terrain.group, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px); if (i >= 2) best = Math.min(best, performance.now() - t); }
        return best;
      };
      const out = [];
      let base = time();
      for (const [name, find, rep] of parts) {
        if (!src.includes(find)) { out.push([name, NaN]); continue; }
        mat.fragmentShader = src.split(find).join(rep); mat.needsUpdate = true;
        const t = time();
        mat.fragmentShader = src; mat.needsUpdate = true;
        const b2 = time();
        out.push([name, (base + b2) / 2 - t, t]); base = b2;
      }
      return out;
    }, { frames, parts });
    console.log(`${v.id.padEnd(7)} where it goes (ms saved by taking a part out): ${saved.sort((x, y) => (y[1] || 0) - (x[1] || 0)).map(([n, t, abs]) => `${n} ${Number.isNaN(t) ? 'NOT FOUND' : t.toFixed(0) + ' (' + abs.toFixed(0) + ' left)'}`).join(' · ')}`);
  }
  if (flag('tiers')) {
    // --tiers: what a pixel of the ground reads, counted by the shader itself. The fragment
    // shader is built again with a counter in every texture read (by the map read and by the
    // kind of read), in every noise and in every loop, and a flag at the head of each block
    // that only some pixels enter; it writes its counts where its colour went, and they are
    // added up here by how far off the pixel's ground is and by block. Counts are true on any
    // device; they say nothing of what a read costs there.
    const t = await page.evaluate(() => {
      const a = window.__app, r = a.renderer, gl = r.getContext(), post = a.post, sh = a.terrain.shared, cam = a.rig.camera, mat = a.terrain.group.material;
      post.setScale(1); sh.uViewport.value.set(post.viewW, post.viewH);
      const src = mat.fragmentShader, kinds = {};
      for (const m of src.matchAll(/sampler(\w+)\s+(\w+)/g)) kinds[m[2]] = kinds[m[2]] && kinds[m[2]] !== m[1] ? 'mixed' : m[1];
      // the classes of read: 0 the detail tile, plain · 1 the detail tile with a long footprint (textureGrad)
      // 2 the patch's own maps (normal, baked shadow) · 3 the land's colour maps · 4 strata and far relief · 5 light, shade and air
      const cls = (fn, name) => name === 'tDetail' ? (fn === 'textureGrad' ? 1 : 0) : name === 'tNormal' || name === 'tShadow' ? 2 : name === 'tRingColour' || name === 'tAlbedo' ? 3 : name === 'tStrata' || name === 'tRelief' ? 4 : name === 'tIrradiance' ? 6 : name === 'tCloudShade' || name === 'tCloudWet' ? 7 : 5;
      const missing = [];
      let body = src.replace(/\b(texture|textureGrad|textureLod)\(\s*(\w+)\s*,/g, (all, fn, name) => {
        const k = kinds[name]; if (!k || k === 'mixed') { missing.push(name); return all; }
        return `${fn}(${name}, ${k === '2D' ? 'cnt2' : k === '2DArrayShadow' ? 'cnt4' : 'cnt3'}(${cls(fn, name)}) +`;
      });
      body = body.replace(/([^\w ]\s*|return |= )flNoise\(/g, (all, pre) => `${pre}flNoise(cntN() + `);
      body = body.replace(/(for \(int [^)]*\)[^;{]*\{)/g, '$1 gLoop += 1.0;');
      const flags = [
        ['canopy', 'if (canopyTall > 0.3 && vShell > 0.0) {', 0, 1], ['floor', 'if (vShell < 1.0) {', 0, 2], ['grass', 'if (gw > 0.0) {', 0, 4], ['flowers', 'if (fw.a > 0.0) {', 0, 8],
        ['patches', 'if (uPaint.x > 0.0 && farW < 1.0 && flatW > 0.0 && dist > 60.0) {', 0, 16], ['broad', 'if (grassyB > 0.0) {', 0, 32], ['swaths', 'if (grassy > 0.0) {', 0, 64],
        ['water', 'if (water > 0.0) {', 0, 128], ['strata', '* (uStrata.y + uStrata.w) > STRATA_LEAST * (1.0 + 24.0 * uGroundThin)) {', 0, 256],
        ['snow', 'if (pale > 0.0 || snowMay(vHeight, up)) {', 1, 8], ['relief', 'if (lodRef > lodF + 0.05 && nearFade > 0.0) {', 1, 16], ['litter', 'if (nearL > 0.0) {', 1, 32], ['planes', 'if (kp > 0.0) {', 1, 64], ['reliefLight', 'if (kr > 0.0) {', 1, 128],
      ];
      for (const [name, find, ch, bit] of flags) {
        const i = body.indexOf(find); if (i < 0) { missing.push('block ' + name); continue; }
        body = body.slice(0, i + find.length) + ` gFlag[${ch}] += ${bit}.0;` + body.slice(i + find.length);
      }
      // (why: how far the blend toward the parent patch has gone, and what asked for the strata)
      for (const [find, add] of [['float pk = vMorph * step(0.0, vChunk.y);', ' gWhy += pk <= 0.004 ? 0.0 : pk < 0.999 ? 1.0 : 2.0;'], ['vec3 band = vec3(1.0);', ' gWhy += (rockW + screeW > 0.0 ? 4.0 : 0.0) + (bedM > 0.0 ? 8.0 : 0.0) + (uStrataFlat > 0.0 ? 16.0 : 0.0);']]) {
        const i = body.indexOf(find); if (i < 0) { missing.push('why: ' + find); continue; }
        body = body.slice(0, i + find.length) + add + body.slice(i + find.length);
      }
      const cloudAt = 'shadow *= vChunk.z > float(CLOUD_VERT_TILES)';
      if (body.includes(cloudAt)) body = body.replace(cloudAt, 'if (vChunk.z > float(CLOUD_VERT_TILES)) gFlag[0] += 512.0; ' + cloudAt); else missing.push('block cloud');
      const head = `float gCnt[8] = float[8](0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0); float gNoise = 0.0, gLoop = 0.0; float gFlag[2] = float[2](0.0, 0.0); float gWhy = 0.0;
vec2 cnt2(int k) { gCnt[k] += 1.0; return vec2(0.0); } vec3 cnt3(int k) { gCnt[k] += 1.0; return vec3(0.0); } vec4 cnt4(int k) { gCnt[k] += 1.0; return vec4(0.0); } vec3 cntN() { gNoise += 1.0; return vec3(0.0); }
`;
      const end = 'fragColor = vec4(col * uExposure, 1.0);';
      if (!body.includes(end)) missing.push('the last line');
      const bin = 'float gBin = dist < 30.0 ? 0.0 : dist < 100.0 ? 1.0 : dist < 300.0 ? 2.0 : dist < 1000.0 ? 3.0 : dist < 3000.0 ? 4.0 : dist < 10000.0 ? 5.0 : dist < 30000.0 ? 6.0 : 7.0;';
      const outs = [
        'fragColor = vec4(min(gCnt[0], 31.0) + 32.0 * min(gCnt[1], 31.0), min(gCnt[2], 31.0) + 32.0 * min(gCnt[3], 31.0), min(gCnt[4], 31.0) + 32.0 * min(gCnt[5] + gCnt[6] + gCnt[7], 31.0), 1.0);',
        bin + ' fragColor = vec4(min(gNoise, 31.0) + 32.0 * min(gLoop, 31.0), gFlag[0], gBin + gFlag[1], 1.0);',
        'fragColor = vec4(gWhy, min(gCnt[6], 31.0) + 32.0 * min(gCnt[7], 31.0), 0.0, 1.0);',
      ];
      const w = post.viewW, h = post.viewH, bufs = [];
      for (const o of outs) {
        mat.fragmentShader = head + body.replace(end, o); mat.needsUpdate = true;
        sh.uPlain.value = 0; post.beginScene(); r.render(a.terrain.group, cam);
        const f = new Float32Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, f); bufs.push(f);
      }
      mat.fragmentShader = src; mat.needsUpdate = true;
      const err = gl.getError();
      // by distance and by block: pixels, and the sums of each count
      const NB = 8, mk = () => ({ n: 0, c: [0, 0, 0, 0, 0, 0], noise: 0, loop: 0 });
      const bins = Array.from({ length: NB }, mk), all = mk(), byFlag = {}, hist = new Array(64).fill(0);
      for (const [name] of flags) byFlag[name] = mk(); byFlag.cloud = mk();
      let odd = 0, sky = 0;
      const A = bufs[0], B = bufs[1], C = bufs[2], why = Array.from({ length: NB }, () => new Array(32).fill(0)); const lightSky = new Array(NB).fill(0), lightCloud = new Array(NB).fill(0);
      for (let i = 0; i < w * h * 4; i += 4) {
        if (!(A[i + 3] > 0.5)) { sky++; continue; }
        const v = [A[i], A[i + 1], A[i + 2], B[i], B[i + 1], B[i + 2]];
        if (v.some((x) => Math.abs(x - Math.round(x)) > 1e-3)) { odd++; continue; }
        const c = [A[i] % 32, Math.floor(A[i] / 32), A[i + 1] % 32, Math.floor(A[i + 1] / 32), A[i + 2] % 32, Math.floor(A[i + 2] / 32)];
        const noise = B[i] % 32, loop = Math.floor(B[i] / 32), f0 = B[i + 1], b = B[i + 2] % 8, f1 = B[i + 2] - b;
        const add = (o) => { o.n++; for (let k = 0; k < 6; k++) o.c[k] += c[k]; o.noise += noise; o.loop += loop; };
        why[b][Math.round(C[i]) & 31]++;
        lightSky[b] += C[i + 1] % 32; lightCloud[b] += Math.floor(C[i + 1] / 32);
        add(all); add(bins[b]); hist[Math.min(63, c[0] + c[1] + c[2] + c[3] + c[4] + c[5])]++;
        for (const [name, , ch, bit] of flags) if (Math.floor((ch ? f1 : f0) / bit) % 2 === 1) add(byFlag[name]);
        if (Math.floor(f0 / 512) % 2 === 1) add(byFlag.cloud);
      }
      return { w, h, sky, odd, all, bins, byFlag, hist, why, lightSky, lightCloud, missing: [...new Set(missing)], err };
    });
    const f1 = (x) => x.toFixed(1), row = (name, o) => o.n ? `| ${name} | ${(100 * o.n / t.all.n).toFixed(1)} % | ${f1(o.c.reduce((s, x) => s + x, 0) / o.n)} | ${o.c.map((x) => f1(x / o.n)).join(' | ')} | ${f1(o.noise / o.n)} | ${f1(o.loop / o.n)} | ${(100 * o.c.reduce((s, x) => s + x, 0) / t.all.c.reduce((s, x) => s + x, 0)).toFixed(0)} % |` : null;
    const names = ['under 30 m', '30 to 100 m', '100 to 300 m', '300 m to 1 km', '1 to 3 km', '3 to 10 km', '10 to 30 km', 'beyond 30 km'];
    console.log(`\n${v.id}: ${v.what} (${t.w} x ${t.h}; ground on ${(100 * t.all.n / (t.w * t.h)).toFixed(0)} % of the picture${t.odd ? `; ${t.odd} pixels on an edge left out` : ''}${t.missing.length ? '; NOT COUNTED: ' + t.missing.join(', ') : ''}${t.err ? '; GL error ' + t.err : ''})`);
    console.log('| ground | share of the ground\'s pixels | reads a pixel | detail tile, plain | detail tile, long footprint | the patch\'s normal and shadow | the land\'s colour maps | strata, far relief | light, shade, air | noises | loop turns | share of all reads |\n|---|---|---|---|---|---|---|---|---|---|---|---|');
    console.log(row('all of it', t.all));
    for (let b = 0; b < 8; b++) { const l = row(names[b], t.bins[b]); if (l) console.log(l); }
    console.log('by block (a pixel is in several):');
    for (const [name, o] of Object.entries(t.byFlag)) { const l = row(name, o); if (l) console.log(l); }
    console.log('why (share of that distance\'s pixels): the blend toward the parent none / part / all · the strata asked for by rock or scree / by bare bedrock / by the world');
    for (let b = 0; b < 8; b++) if (t.bins[b].n) { const y = t.why[b], n = t.bins[b].n, sh = (f) => (100 * y.reduce((s2, x, k) => s2 + (f(k) ? x : 0), 0) / n).toFixed(0) + ' %'; console.log(`  ${names[b]}: blend ${sh((k) => k % 4 === 0)} / ${sh((k) => k % 4 === 1)} / ${sh((k) => k % 4 === 2)} · strata ${sh((k) => k & 4)} / ${sh((k) => k & 8)} / ${sh((k) => k & 16)} · of the light's reads a pixel: the sky's table ${(t.lightSky[b] / n).toFixed(1)}, the cloud's shade ${(t.lightCloud[b] / n).toFixed(1)}`); }
    console.log(`reads a pixel, spread: ${t.hist.map((n, k) => n ? `${k}: ${(100 * n / t.all.n).toFixed(1)} %` : null).filter(Boolean).join(' · ')}`);
    if (t.missing.length || t.err) failed = true;
  }
  const rgb = Buffer.from(res.b64, 'base64'), rgbOld = res.old ? Buffer.from(res.old.b64, 'base64') : null;
  const row = { id: v.id, what: v.what, plain: res.plain, full: res.full, shading: res.full - res.plain, lit: res.lit, w: res.w, h: res.h };
  // (per million pixels of ground: views with more sky have less to shade)
  row.perMP = row.shading / Math.max(res.lit * res.w * res.h / 1e6, 1e-3);
  let cmp = '';
  if (rgbOld || (cmpDir && existsSync(path.join(cmpDir, v.id + '.rgb')))) {
    const old = rgbOld || await readFile(path.join(cmpDir, v.id + '.rgb'));
    if (old.length !== rgb.length) cmp = ' · compare: sizes differ';
    else {
      let sum = 0, max = 0, n2 = 0, n8 = 0; const diff = Buffer.alloc(rgb.length);
      for (let i = 0; i < rgb.length; i += 3) {
        const d = Math.max(Math.abs(rgb[i] - old[i]), Math.abs(rgb[i + 1] - old[i + 1]), Math.abs(rgb[i + 2] - old[i + 2]));
        sum += d; if (d > max) max = d; if (d > 2) n2++; if (d > 8) n8++;
        for (let c = 0; c < 3; c++) diff[i + c] = Math.min(255, Math.abs(rgb[i + c] - old[i + c]) * 8);
      }
      const n = rgb.length / 3;
      cmp = ` · against ${rgbOld ? 'the shader before' : path.basename(cmpDir)}: mean ${(sum / n).toFixed(2)} levels, largest ${max}, over 2 levels ${(100 * n2 / n).toFixed(2)} %, over 8 levels ${(100 * n8 / n).toFixed(3)} %`;
      if (saveDir) await writeFile(path.join(saveDir, v.id + '_diff.png'), png(diff, res.w, res.h));
    }
  }
  if (saveDir && rgbOld) await writeFile(path.join(saveDir, v.id + '_before.png'), png(rgbOld, res.w, res.h));
  if (res.old) { row.before = res.old.full - res.old.plain; cmp = ` · before: shaded ${res.old.full.toFixed(0)} ms, the shading ${row.before.toFixed(0)} ms (now ${(100 * row.shading / row.before).toFixed(0)} % of it)` + cmp; }
  if (saveDir) { await writeFile(path.join(saveDir, v.id + '.rgb'), rgb); await writeFile(path.join(saveDir, v.id + '.png'), png(rgb, res.w, res.h)); }
  rows.push(row);
  console.log(`${v.id.padEnd(7)} ${v.what}: flat ${row.plain.toFixed(0)} ms · shaded ${row.full.toFixed(0)} ms · the shading ${row.shading.toFixed(0)} ms (${row.perMP.toFixed(0)} ms a million pixels of ground; ground on ${(100 * row.lit).toFixed(0)} % of ${res.w}x${res.h}; ${res.chunks} patches)${cmp}   [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
}
if (rows.length) console.log(`all ${rows.length} views: the shading ${rows.reduce((s, r) => s + r.shading, 0).toFixed(0)} ms in sum${rows.every((r) => r.before) ? ` (before: ${rows.reduce((s, r) => s + r.before, 0).toFixed(0)} ms)` : ''} (software WebGL: a count of work, not a frame rate)`);
await close();
process.exit(failed ? 1 : 0);
