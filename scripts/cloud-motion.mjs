// Do the clouds go where the day's wind carries them, and does anything of them move because
// the traveller moved? Both answered in the real game, in one headless run.
//
// 1. MOTION. The march is drawn twice with the camera held still, 20 s of game time apart, and
//    the alpha of one slice cross-correlated between the two. The shift it finds is set against
//    the shift the steering itself predicts (a point of the world at the slice's own distance,
//    carried by weather/sky/steer.js and projected back into the picture): within 10 degrees and
//    20 %. The same for the high layer's shell, which runs faster and often on another heading.
//    (The drift as it was moved the pattern AGAINST the wind at four to six times its speed.)
// 2. ANCHORING. The same picture is drawn from the camera's place, from 100 m away and from
//    10 km away, each aimed at the same point of the world. Every pixel of the second picture is
//    followed to where its ray crosses the height at which the masses are widest, and that point
//    of the world is projected back into the first picture: the two must show the SAME cloud
//    there. And every uniform the march reads is compared between the two: none but the
//    camera-relative ones and the march's own bounds may change with the traveller's place.
//    (The base once stood over the ground smoothed round the traveller: the whole sky moved by
//    up to 51 m for every 100 m flown.)
//
//   node scripts/cloud-motion.mjs [--distdir <build>] [--query "..."] [--seconds 20]
//                                 [--break still|follow] [--out dir]
// --break still holds the steering between the two frames (nothing moves: motion must fail);
// --break follow makes the march's base follow the traveller again (anchoring must fail).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag } from './lib/browser.mjs';
import { png } from './lib/png.mjs';

const query = opt('query', 'world=haven&shot=ledge&alt=3000&pitch=14&heading=90&debug=sky:fair');
const SEC = +opt('seconds', 20), BREAK = opt('break', null), OUT = opt('out', null);
const { base, page, errors, goto, close } = await open({ dist: flag('dist') });
await goto(`${base}?${query}`);
await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: 900000, polling: 500 });

let bad = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) bad++; };

const res = await page.evaluate(({ SEC, BREAK }) => {
  const a = window.__app, r = a.renderer, gl = r.getContext(), cv = a.cloudVolume, rig = a.rig, sky = a.sky;
  if (!cv.active) return { error: 'the cloud volume is not drawn at this view' };
  if (!sky.field.on) return { error: 'this view has no field (add debug=sky:fair)' };
  const COLS = 4, ROWS = 2;
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
  const frame = () => a.sky.beforeScene({ renderer: r, post: a.post, rig, worldRadius: a.world.radius, time: 0, treesWanted: false });
  // the alpha of one slice of the march's small picture
  const slicePic = (slice) => {
    const w = cv.tw, h = cv.th, buf = readRT(cv.smooth, w, h);
    const tw = Math.floor(w / COLS), th = Math.floor(h / ROWS), col = Math.floor(slice / ROWS), row = slice % ROWS;
    const out = new Float32Array(tw * th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) out[y * tw + x] = buf[((row * th + y) * w + col * tw + x) * 4 + 3];
    return { a: out, w: tw, h: th };
  };
  // where a direction falls in a slice's picture (the march's own mapping), in pixels
  const project = (d, pic) => {
    const f = d.x * rig.forward.x + d.y * rig.forward.y + d.z * rig.forward.z;
    if (f <= 0) return null;
    const rx = (d.x * rig.right.x + d.y * rig.right.y + d.z * rig.right.z) / f;
    const ry = (d.x * rig.up.x + d.y * rig.up.y + d.z * rig.up.z) / f;
    const ty = Math.tan(rig.fov * Math.PI / 360), aspect = a.post.viewW / a.post.viewH;
    return { x: (rx / (ty * aspect) * 0.5 + 0.5) * pic.w, y: (ry / ty * 0.5 + 0.5) * pic.h };
  };
  // the best whole-pixel shift between two pictures (normalised cross-correlation)
  const bestShift = (A, B, win) => {
    const w = A.w, h = A.h;
    let best = -2, bx = 0, by = 0;
    for (let dy = -win; dy <= win; dy++) for (let dx = -win; dx <= win; dx++) {
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
      for (let y = win; y < h - win; y++) for (let x = win; x < w - win; x++) {
        const va = A.a[y * w + x], vb = B.a[(y + dy) * w + (x + dx)];
        sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb; n++;
      }
      const ca = saa - sa * sa / n, cb = sbb - sb * sb / n, c = sab - sa * sb / n;
      const q = c / Math.sqrt(Math.max(ca * cb, 1e-9));
      if (q > best) { best = q; bx = dx; by = dy; }
    }
    return { x: bx, y: by, q: best };
  };

  // ---- 1. motion ----
  const slice = 4;                       // (5 to 9 km from the eye: cloud, and far enough to move)
  frame();
  const A = slicePic(slice);
  const t0 = sky.t, jd0 = a.jd;
  const dist = 7000;
  const dirMid = { x: rig.forward.x, y: rig.forward.y, z: rig.forward.z };
  const P = [rig.pos.x + dirMid.x * dist, rig.pos.y + dirMid.y * dist, rig.pos.z + dirMid.z * dist];
  // the same point of the world, carried by the low wind for SEC seconds
  const P1 = sky.steer.carry('low', t0, t0 + SEC, P);
  const toDir = (p) => { const d = { x: p[0] - rig.pos.x, y: p[1] - rig.pos.y, z: p[2] - rig.pos.z }; const l = Math.hypot(d.x, d.y, d.z); return { x: d.x / l, y: d.y / l, z: d.z / l }; };
  const pA = project(toDir(P), A), pB = project(toDir(P1), A);
  // the clock moved on, the camera held still
  if (BREAK !== 'still') sky.clockStep(jd0 + SEC / 86400, 0.016, 1, false);
  frame();
  const B = slicePic(slice);
  sky.clockStep(jd0, 0.016, 1, false);
  const shift = bestShift(A, B, 10);
  const want = pA && pB ? { x: pB.x - pA.x, y: pB.y - pA.y } : null;
  // ---- 2. anchoring ----
  const keep = rig.pos.clone();
  const marks = [];
  const anchorRun = (metres) => {
    // the camera moved across its own view, still looking the same way (the same world point ahead)
    rig.pos.set(keep.x + rig.right.x * metres, keep.y + rig.right.y * metres, keep.z + rig.right.z * metres);
    if (BREAK === 'follow') { const v = cv.def.volume; cv.base = (v.base ?? 1500) + 0.02 * metres; cv.uniforms.uLayer.value.x = a.world.radius + cv.base; }
    frame();
    const pic = slicePic(slice);
    const u = {};
    for (const [k, o] of Object.entries(cv.uniforms)) {
      const v = o.value;
      if (v == null || typeof v === 'boolean') continue;
      if (typeof v === 'number') u[k] = [v];
      else if (v.isVector2 || v.isVector3 || v.isVector4) u[k] = v.toArray();
      else if (ArrayBuffer.isView(v)) u[k] = Array.from(v);
      else if (Array.isArray(v) && v[0]?.isVector4) u[k] = v.flatMap((q) => q.toArray());
    }
    return { pic, u };
  };
  const base = anchorRun(0);
  const moved = [100, 10000].map((m) => ({ m, ...anchorRun(m) }));
  rig.pos.copy(keep); frame();
  // the same point of the world in both pictures: every pixel of the moved picture followed to
  // the height at which the masses are widest, and projected back into the first
  const R = a.world.radius, widest = R + cv.base + 0.35 * Math.max(500, (cv.top ?? 0) - cv.base);
  const compare = (m, pic) => {
    const A2 = base.pic, w = pic.w, h = pic.h;
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0, diff = 0;
    const ty = Math.tan(rig.fov * Math.PI / 360), aspect = a.post.viewW / a.post.viewH;
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      // the ray of this pixel from the moved camera
      const ndx = ((x + 0.5) / w * 2 - 1) * ty * aspect, ndy = ((y + 0.5) / h * 2 - 1) * ty;
      const d = { x: rig.forward.x + rig.right.x * ndx + rig.up.x * ndy, y: rig.forward.y + rig.right.y * ndx + rig.up.y * ndy, z: rig.forward.z + rig.right.z * ndx + rig.up.z * ndy };
      const dl = Math.hypot(d.x, d.y, d.z); d.x /= dl; d.y /= dl; d.z /= dl;
      const o = { x: keep.x + rig.right.x * m, y: keep.y + rig.right.y * m, z: keep.z + rig.right.z * m };
      const bq = o.x * d.x + o.y * d.y + o.z * d.z, disc = bq * bq - (o.x * o.x + o.y * o.y + o.z * o.z) + widest * widest;
      if (disc <= 0) continue;
      const t = -bq + Math.sqrt(disc);
      if (t <= 0) continue;
      const W = { x: o.x + d.x * t - keep.x, y: o.y + d.y * t - keep.y, z: o.z + d.z * t - keep.z };
      const wl = Math.hypot(W.x, W.y, W.z); W.x /= wl; W.y /= wl; W.z /= wl;
      const p = project(W, A2);
      if (!p || p.x < 1 || p.y < 1 || p.x > A2.w - 2 || p.y > A2.h - 2) continue;
      const va = A2.a[Math.round(p.y) * A2.w + Math.round(p.x)], vb = pic.a[y * w + x];
      sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb; n++;
      diff += Math.abs(va - vb);
    }
    const ca = saa - sa * sa / n, cb = sbb - sb * sb / n, c = sab - sa * sb / n;
    return { n, q: c / Math.sqrt(Math.max(ca * cb, 1e-9)), diff: diff / Math.max(n, 1), mean: sa / n };
  };
  const anchored = moved.map((x) => ({ m: x.m, ...compare(x.m, x.pic) }));
  // which uniforms changed with the traveller's place
  const changed = [];
  for (const k of Object.keys(base.u)) {
    for (const x of moved) {
      const a0 = base.u[k], a1 = x.u[k];
      if (!a1 || a0.length !== a1.length) continue;
      if (a0.some((v, i) => Math.abs(v - a1[i]) > 1e-4 * Math.max(1, Math.abs(v)))) { if (!changed.includes(k)) changed.push(k); }
    }
  }
  const pic = (p) => { let s = ''; const u = new Uint8Array(p.w * p.h * 3); for (let i = 0; i < p.w * p.h; i++) { const v = Math.round(255 * Math.min(1, p.a[i])); u[i * 3] = u[i * 3 + 1] = u[i * 3 + 2] = v; } for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return { w: p.w, h: p.h, b64: btoa(s) }; };
  return {
    shift, want, q: shift.q, slice, wind: sky.steer.windAt('low', t0, 0, 0).speed,
    secs: SEC, anchored, changed, cells: sky.frame.cells.length,
    pics: { a: pic(A), b: pic(B) },
  };
}, { SEC, BREAK });

if (res.error) { console.log(res.error); await close(); process.exit(1); }
// ---- motion ----
const got = res.shift, want = res.want;
if (!want) { console.log('the view has no cloud to follow at that distance'); await close(); process.exit(1); }
const ang = (v) => Math.atan2(v.y, v.x) * 180 / Math.PI, len = (v) => Math.hypot(v.x, v.y);
let dAng = Math.abs(ang(got) - ang(want)); if (dAng > 180) dAng = 360 - dAng;
const ratio = len(got) / Math.max(len(want), 1e-6);
console.log(`the low layer over ${res.secs} s: the picture moved ${len(got).toFixed(1)} px toward ${ang(got).toFixed(0)} deg, the steering says ${len(want).toFixed(1)} px toward ${ang(want).toFixed(0)} deg (match ${res.q.toFixed(2)})`);
check(`the clouds go where the day's low wind carries them (within 10 degrees and 20 %): ${dAng.toFixed(0)} degrees, ${(100 * ratio).toFixed(0)} %`,
  len(want) > 1.2 && dAng <= 10 && ratio > 0.8 && ratio < 1.2);
// ---- anchoring ----
for (const x of res.anchored) console.log(`  the camera ${x.m} m away, aimed at the same place: the same cloud there to ${x.q.toFixed(3)} (${x.n} pixels, ${(100 * x.diff).toFixed(1)} % apart on average)`);
check('nothing of the cloud moves because the traveller moved (the same cloud over the same place from 100 m and 10 km away)',
  res.anchored.every((x) => x.n > 200 && x.q > 0.9 && x.diff < 0.12));
const allowed = ['uCamPlanetPos', 'uCamRight', 'uCamUp', 'uCamFwd', 'uProj', 'uBolt', 'uSliceZ', 'uShaft', 'uLayer', 'uCells', 'uCellCount', 'uViewport', 'uHazeUv'];
const odd = res.changed.filter((k) => !allowed.includes(k));
console.log(`  the uniforms that changed with the traveller's place: ${res.changed.join(', ') || 'none'}`);
check(`no uniform but the camera-relative ones and the march's bounds changes with the traveller's place${odd.length ? ': ' + odd.join(', ') : ''}`, odd.length === 0);
if (OUT) {
  await mkdir(OUT, { recursive: true });
  for (const [k, p] of Object.entries(res.pics)) await writeFile(path.join(OUT, `cloud_motion_${k}.png`), png(p.w, p.h, Buffer.from(p.b64, 'base64'), 3));
}
if (errors.length) { console.log('PAGE ERRORS: ' + errors.slice(0, 3).join(' | ')); bad++; }
await close();
if (bad) { console.log(`cloud-motion: ${bad} FAILED`); process.exit(1); }
console.log('cloud-motion: all passed');
