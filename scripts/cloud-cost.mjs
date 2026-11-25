// What the cloud march reads, and what laying it costs, in the real game (never a frame rate).
//
// 1. THE READS A STEP. The march is compiled a second time with CLOUD_READS defined: every read
//    of the clouds' noise and of the field's maps adds one to a running total (sky/skyGlsl.js's
//    skyTex2 and skyTex3), and the pixel hands back that total and the steps it took. So this is
//    the count on REAL rays at a real view, not a reading of the source. The plan allows at most
//    4 a step (+1 within a kilometre of the eye); while the rise's pattern crosses its wrap (16 %
//    of the game clock) the masses and the look toward the Sun are each read twice, which the
//    check allows for and prints apart.
// 2. THE PROGRAM'S LIMITS: textures and varyings against what a phone allows (lib/glLimits.mjs).
// 3. THE WORK OF MARCHING AND LAYING, timed until the GPU has drawn it (one pixel read back), on
//    software WebGL: a count of work to set one build against another, never a frame rate.
//
//   node scripts/cloud-cost.mjs [--distdir <build>] [--query "world=haven&shot=ledge&..."]
//                               [--size 880x412] [--dsf 2.2] [--frames 5] [--out picture.png]
//                               [--break read]
// --break read puts one more read into the march's loop, to see the check fail.
import { writeFile } from 'node:fs/promises';
import { open, opt, flag } from './lib/browser.mjs';
import { png } from './lib/png.mjs';
import { shaderUse, overPhone } from './lib/glLimits.mjs';

const query = opt('query', 'world=haven&shot=ledge&alt=5000&heading=235&pitch=-14&debug=sky:fair'), frames = +opt('frames', 5);
const BREAK = opt('break', null);
const size = (opt('size', '880x412').match(/^(\d+)x(\d+)$/) || [0, 880, 412]).slice(1).map(Number);
const { base, page, errors, goto, close } = await open({ dist: flag('dist'), width: size[0], height: size[1], dsf: +opt('dsf', 1.25) });
await goto(`${base}?${query}`);
await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: 900000, polling: 500 });

let bad = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) bad++; };

// ---- 1. the reads a step, on real rays ---------------------------------------------------------
const reads = await page.evaluate(({ BREAK }) => {
  const a = window.__app, r = a.renderer, gl = r.getContext(), cv = a.cloudVolume;
  if (!cv.active) return { error: 'the cloud volume is not drawn at this view' };
  const src = cv.march.fragmentShader;
  if (BREAK === 'read') {
    // (one more read of the noise at every step: the fault the check guards against)
    cv.march.fragmentShader = src.replace('    if (ld <= 0.001) continue;', '    if (ld <= 0.001) continue;\n    ld *= 0.5 + skyTex3(tCloudNoise, marchPattern(gCamQ, gDirQ, t) * 3.1).r;');
  }
  cv.march.defines.CLOUD_READS = 1; cv.march.needsUpdate = true;
  // a render target read back as floats, whatever the driver gives (half floats decoded here)
  const half = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? s * f * 5.9604644775390625e-8 : e === 31 ? (f ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + f / 1024); };
  const readRT = (rt, w, h2) => {
    r.setRenderTarget(rt);
    const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
    let out;
    if (type === gl.FLOAT) { out = new Float32Array(w * h2 * 4); gl.readPixels(0, 0, w, h2, gl.RGBA, gl.FLOAT, out); }
    else { const u = new Uint16Array(w * h2 * 4); gl.readPixels(0, 0, w, h2, gl.RGBA, gl.HALF_FLOAT, u); out = new Float32Array(u.length); for (let i = 0; i < u.length; i++) out[i] = half(u[i]); }
    r.setRenderTarget(null);
    return out;
  };
  const run = (ridePhase) => {
    const u = cv.uniforms.uCloudRise.value, keep = [u[0], u[1]];
    if (ridePhase != null) { u[0] = ridePhase; u[1] = 0.5; }       // (inside the rise's fade: two phases read)
    a.sky.beforeScene({ renderer: r, post: a.post, rig: a.rig, worldRadius: a.world.radius, time: 0, treesWanted: false });
    const w = cv.tw, h = cv.th, buf = readRT(cv.target, w, h);
    u[0] = keep[0]; u[1] = keep[1];
    // The most reads a step, by slice (the tiles go down a column first: slice = row + ROWS * col).
    // The pixel hands back its stepping's reads, its steps, its cover and every read on the ray,
    // so the two are counted apart: a ray reads the field a few times whatever its steps do.
    const COLS = 4, ROWS = 2, tw = w / COLS, th = h / ROWS, out = [];
    for (let s = 0; s < COLS * ROWS; s++) {
      const col = Math.floor(s / ROWS), row = s % ROWS;
      let most = 0, steps = 0, pixels = 0, ray = 0;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const i = ((row * th + y) * w + col * tw + x) * 4;
        const reads = buf[i], n = buf[i + 1], alpha = buf[i + 2], all = buf[i + 3];
        if (!(n > 0) || alpha <= 0.002) continue;
        pixels++;
        ray = Math.max(ray, all - reads);
        const per = reads / n;
        if (per > most) { most = per; steps = n; }
      }
      out.push({ slice: s, most: +most.toFixed(2), steps, pixels, ray: +ray.toFixed(1) });
    }
    return out;
  };
  const plain = run(null), fade = run(0.02 * 4200);
  cv.march.defines.CLOUD_READS = 0; delete cv.march.defines.CLOUD_READS;
  cv.march.fragmentShader = src; cv.march.needsUpdate = true;
  return { plain, fade };
}, { BREAK });
if (reads.error) { console.log(reads.error); await close(); process.exit(1); }

const show = (rows) => rows.filter((r) => r.pixels > 0).map((r) => `slice ${r.slice}: ${r.most} a step over ${Math.round(r.steps)}, ${r.ray} a ray`).join('; ');
console.log(`the march's reads a step, out of the rise's fade — ${show(reads.plain)}`);
console.log(`                        in the rise's fade      — ${show(reads.fade)}`);
// (slices 0 and 1 are the first kilometre: the wisps round the eye are the one read more)
const worst = (rows, from) => Math.max(0, ...rows.filter((r) => r.pixels > 0 && r.slice >= from).map((r) => r.most));
const near = (rows) => Math.max(0, ...rows.filter((r) => r.pixels > 0 && r.slice < 2).map((r) => r.most));
check(`at most 4 reads a step out of the rise's fade (${worst(reads.plain, 2).toFixed(2)} beyond the first kilometre, ${near(reads.plain).toFixed(2)} within it)`,
  worst(reads.plain, 2) <= 4.01 && near(reads.plain) <= 5.01);
check(`at most 6 in the fade, when the masses and the look toward the Sun are each read twice (${worst(reads.fade, 2).toFixed(2)} / ${near(reads.fade).toFixed(2)})`,
  worst(reads.fade, 2) <= 6.01 && near(reads.fade) <= 7.01);

// ---- 2. the limits a phone sets ------------------------------------------------------------------
const use = await shaderUse(page);
const over = overPhone(use);
const sky = use.filter((p) => p.textureNames.some((n) => /tWx|tCloudNoise|tCloudMap/.test(n)));
for (const p of sky) console.log(`  program ${p.id}: ${p.fragTextures} + ${p.vertTextures} textures, ${p.varyings} varyings (${p.textureNames.join(' ')})`);
check(`every program of the sky is inside a phone's limits (${sky.length} of them)`, over.length === 0);
for (const l of over) console.log(`  ${l}`);

// ---- 3. the work of marching and laying ----------------------------------------------------------
const res = await page.evaluate(({ frames }) => {
  const a = window.__app, r = a.renderer, gl = r.getContext(), post = a.post, cv = a.cloudVolume, rig = a.rig;
  const near = Math.max(0.25, Math.min(2e6, Math.min(rig.agl, rig.floor || rig.agl) * 0.15)), far = Math.max(a.terrain.farDistance, cv.reach) * 1.05;
  const px = new Float32Array(4);
  const draw = (what) => {
    const t = performance.now();
    if (what === 'march') a.sky.beforeScene({ renderer: r, post, rig, worldRadius: a.world.radius, time: 0, treesWanted: false });
    post.beginScene();
    if (what === 'lay') { cv.layFar({ renderer: r, rig, near, far }); cv.lay(near, far, rig); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
    return performance.now() - t;
  };
  draw('lay'); draw('none');
  let lay = 1e9, march = 1e9, none = 1e9;
  for (let i = 0; i < frames; i++) { lay = Math.min(lay, draw('lay')); march = Math.min(march, draw('march')); none = Math.min(none, draw('none')); }
  draw('lay');
  const w = post.viewW, h = post.viewH, f = new Float32Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, f);
  const out = new Uint8Array(w * h * 3); let cloudy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 3;
    if (f[i + 3] > 0.02) cloudy++;
    for (let c = 0; c < 3; c++) { const e = Math.max(f[i + c], 0); out[o + c] = Math.round(255 * Math.pow(Math.min(1, 1.5 * e / (e + 0.5)), 1 / 2.2)); }
  }
  let s = ''; for (let i = 0; i < out.length; i += 32768) s += String.fromCharCode.apply(null, out.subarray(i, i + 32768));
  return { lay, march, none, w, h, far: cv.farOn, cells: a.sky.frame.cells.length, cloudy: cloudy / (w * h), b64: btoa(s) };
}, { frames });
console.log(`at ${res.w}x${res.h} (${res.cells} cells in reach${res.far ? ', the far slices on' : ''}; cloud on ${(100 * res.cloudy).toFixed(0)} % of the picture)`);
console.log(`  laying the slices over an empty picture: ${(res.lay - res.none).toFixed(0)} ms`);
console.log(`  the march into its small picture:        ${(res.march - res.none).toFixed(0)} ms   (software WebGL: a count of work, not a frame rate)`);
if (opt('out', null)) await writeFile(opt('out', null), png(res.w, res.h, Buffer.from(res.b64, 'base64'), 3));
if (errors.length) { console.log('PAGE ERRORS: ' + errors.slice(0, 3).join(' | ')); bad++; }
await close();
if (bad) { console.log(`cloud-cost: ${bad} FAILED`); process.exit(1); }
console.log('cloud-cost: all passed');
