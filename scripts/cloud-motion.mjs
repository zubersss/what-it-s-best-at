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
// 3. THE HAND-OVER AT THE REACH. A storm cell is looked at from four distances astride the
//    16 km where the near slices give way to the two far ones, and the light and the cover it
//    shows are compared: the step across the hand-over must be no larger than the steps either
//    side of it. (The same function marches it near and far; this says so in the picture.)
//
//   node scripts/cloud-motion.mjs [--distdir <build>] [--query "..."] [--seconds 20]
//                                 [--break still|follow] [--out dir] [--no-handover]
// --break still holds the steering between the two frames (nothing moves: motion must fail);
// --break follow makes the march's base follow the traveller again (anchoring must fail).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag } from './lib/browser.mjs';
import { png } from './lib/png.mjs';

// (the view looks ACROSS the day's wind: along it the clouds come toward the eye and the picture
// hardly moves, which says nothing about where they are going.
// And it looks AT cloud: the stub's fair heaps stand between 1 250 and 2 575 m and cover a third
// of the sky at its best hour over the low country west of the opening place, so the camera is
// 3.2 km up and 8 degrees down — the ray is inside the layer for the whole of the fifth slice,
// 5 to 9 km out. Its first view was 3 km up at +10 degrees, above a layer whose top is 2 575 m:
// the slice it measured was empty sky, and a correlation of nothing moved nothing.)
const query = opt('query', 'world=haven&shot=ledge&lat=-51.3&lon=46.978&alt=3200&pitch=-8&heading=168&t=4&debug=sky:fair');
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
  const t0 = sky.t, jd0 = a.ephemeris.jd;
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
  // ---- 1b. the high layer, which runs faster and often on another heading ----
  // (the shell drawn alone into the main picture, which the clouds write their cover into as
  // alpha; the mid shell is kept out of the pass by its own flag)
  let high = null;
  if (a.sky.upper && !a.sky.upper.stub) {
    const post = a.post;
    const highPic = () => {
      a.sky.upper.update({ rig, sky: a.sky.frame });
      a.sky.upper.camBelowMid = false;                  // (the mid shell goes to the other pass)
      post.beginScene();
      a.sky.upper.draw({ renderer: r, rig }, 'above');
      // (the main picture is half floats: read back as floats it comes out as nothing. readRT
      // asks the driver what it will give and decodes the halves.)
      const w = post.viewW, h2 = post.viewH, f = readRT(post.scene, w, h2);
      const out = new Float32Array(w * h2);
      for (let i = 0; i < w * h2; i++) out[i] = f[i * 4 + 3];
      return { a: out, w, h: h2 };
    };
    const A2 = highPic();
    // a point of the world on the high shell straight ahead, carried by the high steering
    const hr = a.world.radius + 9000;
    const o = [rig.pos.x, rig.pos.y, rig.pos.z], dd = [rig.forward.x, rig.forward.y, rig.forward.z];
    const bq = o[0] * dd[0] + o[1] * dd[1] + o[2] * dd[2], disc = bq * bq - (o[0] * o[0] + o[1] * o[1] + o[2] * o[2]) + hr * hr;
    if (disc > 0) {
      const tt = -bq + Math.sqrt(disc), P2 = [o[0] + dd[0] * tt, o[1] + dd[1] * tt, o[2] + dd[2] * tt];
      const P3 = sky.steer.carry('high', t0, t0 + SEC, P2);
      const pa = project(toDir(P2), A2), pb = project(toDir(P3), A2);
      if (BREAK !== 'still') sky.clockStep(jd0 + SEC / 86400, 0.016, 1, false);
      const B2 = highPic();
      sky.clockStep(jd0, 0.016, 1, false);
      const sh = bestShift(A2, B2, 12);
      high = { shift: sh, want: pa && pb ? { x: pb.x - pa.x, y: pb.y - pa.y } : null, cover: A2.a.reduce((x, y) => x + y, 0) / A2.a.length };
    }
  }

  // ---- 2. anchoring ----
  const keep = rig.pos.clone();
  const marks = [];
  const anchorRun = (metres) => {
    // the camera moved across its own view, still looking the same way (the same world point ahead)
    rig.pos.set(keep.x + rig.right.x * metres, keep.y + rig.right.y * metres, keep.z + rig.right.z * metres);
    // (the camera the shaders read is the app's own uniform, which only the app's frame sets:
    // moved by hand here, and checked below that it really moved)
    cv.uniforms.uCamPlanetPos.value.copy(rig.pos);
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
  // the camera really moved for the shaders (a test that moves the camera must say so)
  const camMoved = moved.map((x) => {
    const a0 = base.u.uCamPlanetPos, a1 = x.u.uCamPlanetPos;
    return Math.round(Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]));
  });
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
    shift, want, q: shift.q, slice, high, wind: sky.steer.windAt('low', t0, 0, 0).speed,
    secs: SEC, anchored, changed, camMoved, cells: sky.frame.cells.length,
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
// ---- the high layer ----
if (res.high && res.high.want) {
  const g = res.high.shift, wnt = res.high.want;
  let dA = Math.abs(ang(g) - ang(wnt)); if (dA > 180) dA = 360 - dA;
  const ra = len(g) / Math.max(len(wnt), 1e-6);
  console.log(`the high layer over ${res.secs} s: the picture moved ${len(g).toFixed(1)} px toward ${ang(g).toFixed(0)} deg, the steering says ${len(wnt).toFixed(1)} px toward ${ang(wnt).toFixed(0)} deg (cover ${res.high.cover.toFixed(3)}, match ${g.q.toFixed(2)})`);
  check(`a patch of the high layer moves with its own wind (within 15 degrees and 25 %): ${dA.toFixed(0)} degrees, ${(100 * ra).toFixed(0)} %`,
    res.high.cover > 0.01 && len(wnt) > 1.5 && dA <= 15 && ra > 0.75 && ra < 1.25);
} else console.log('the high layer: the shells are not in the sky system here (the main session\'s three lines), or nothing of them is in view');

// ---- anchoring ----
for (const x of res.anchored) console.log(`  the camera ${x.m} m away, aimed at the same place: the same cloud there to ${x.q.toFixed(3)} (${x.n} pixels, ${(100 * x.diff).toFixed(1)} % apart on average, mean cover ${x.mean.toFixed(3)})`);
check(`the camera really moved for the shaders (${res.camMoved.join(' and ')} m)`, res.camMoved[0] > 90 && res.camMoved[1] > 9000);
// (100 m: the parallax through the layer is small, so the same cloud must be over the same place.
// 10 km: a volume seen from 10 km to the side is a different path through it, so what must hold
// there is that the sky is the same sky — as much cloud as before — and that no uniform but the
// camera's own moved, which is what makes it so.)
const near100 = res.anchored[0], far10k = res.anchored[1];
check(`nothing of the cloud moves because the traveller moved: the same cloud over the same place from 100 m away (${near100.q.toFixed(3)})`,
  near100.n > 200 && near100.q > 0.85 && near100.diff < 0.06);
check(`... and from 10 km away the sky is the same sky (cover ${far10k.mean.toFixed(3)} against ${near100.mean.toFixed(3)})`,
  far10k.n > 200 && Math.abs(far10k.mean - near100.mean) < 0.3 * Math.max(near100.mean, 0.02) + 0.02);
const allowed = ['uCamPlanetPos', 'uCamRight', 'uCamUp', 'uCamFwd', 'uProj', 'uBolt', 'uSliceZ', 'uShaft', 'uLayer', 'uCells', 'uCellCount', 'uViewport', 'uHazeUv'];
const odd = res.changed.filter((k) => !allowed.includes(k));
console.log(`  the uniforms that changed with the traveller's place: ${res.changed.join(', ') || 'none'}`);
check(`no uniform but the camera-relative ones and the march's bounds changes with the traveller's place${odd.length ? ': ' + odd.join(', ') : ''}`, odd.length === 0);
if (OUT) {
  await mkdir(OUT, { recursive: true });
  for (const [k, p] of Object.entries(res.pics)) await writeFile(path.join(OUT, `cloud_motion_${k}.png`), png(p.w, p.h, Buffer.from(p.b64, 'base64'), 3));
}
// ---- 3. the hand-over at the reach ----------------------------------------------------------
if (!flag('no-handover')) {
  await goto(`${base}?world=haven&shot=ledge&alt=3000&pitch=0&heading=45&t=7&debug=storm`);
  await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: 900000, polling: 500 });
  const h = await page.evaluate(() => {
    const a = window.__app, r = a.renderer, gl = r.getContext(), cv = a.cloudVolume, rig = a.rig, sky = a.sky;
    const half = (x) => { const s = (x & 0x8000) ? -1 : 1, e = (x >> 10) & 0x1f, f = x & 0x3ff; return e === 0 ? s * f * 5.9604644775390625e-8 : s * Math.pow(2, e - 15) * (1 + f / 1024); };
    const cell = sky.frame.cells[0];
    if (!cell) return { error: 'no storm cell in reach (debug=storm)' };
    const R = a.world.radius, C = [cell.x * (R + cell.base), cell.y * (R + cell.base), cell.z * (R + cell.base)];
    const keep = rig.pos.clone();
    const rows = [];
    for (const want of [15000, 15800, 16200, 17000]) {
      // the camera moved back along its own view until the cell stands `want` metres away
      const d0 = Math.hypot(C[0] - keep.x, C[1] - keep.y, C[2] - keep.z);
      const back = want - d0;
      rig.pos.set(keep.x - rig.forward.x * back, keep.y - rig.forward.y * back, keep.z - rig.forward.z * back);
      // (the camera the shaders read is the app's own uniform: moved by hand, as in the
      // anchoring check, or every distance would draw the same picture)
      cv.uniforms.uCamPlanetPos.value.copy(rig.pos);
      a.sky.weatherStep({ now: performance.now(), dt: 0, jd: a.ephemeris.jd, timeRate: 0, paused: true, rig, day: 0, sunE: 1, viewW: a.post.viewW, viewH: a.post.viewH });
      a.sky.beforeScene({ renderer: r, post: a.post, rig, worldRadius: R, time: 0, treesWanted: false });
      const w = cv.tw, hh = cv.th, u = readRT(cv.smooth, w, hh);
      // the whole of the cloud in the picture, whatever slice it is in
      let sum = 0, light = 0, n = 0;
      for (let i = 0; i < w * hh; i++) {
        const al = u[i * 4 + 3];
        if (al <= 0.01) continue;
        sum += al; light += u[i * 4] / Math.max(al, 1e-3); n++;
      }
      rows.push({ d: Math.round(Math.hypot(C[0] - rig.pos.x, C[1] - rig.pos.y, C[2] - rig.pos.z)), alpha: sum / Math.max(n, 1), light: light / Math.max(n, 1), pixels: n, far: cv.farOn });
    }
    rig.pos.copy(keep);
    return { rows };
  });
  if (h.error) { console.log(h.error); bad++; }
  else {
    for (const x of h.rows) console.log(`  the cell ${(x.d / 1000).toFixed(1)} km away: ${x.pixels} pixels, mean cover ${x.alpha.toFixed(3)}, mean light ${x.light.toFixed(3)}${x.far ? ' (the far slices on)' : ''}`);
    const d = h.rows.map((x) => x.alpha), l = h.rows.map((x) => x.light);
    const step = (v) => [Math.abs(v[1] - v[0]), Math.abs(v[2] - v[1]), Math.abs(v[3] - v[2])];
    const sa = step(d), sl = step(l);
    const ok = (st) => st[1] <= 2 * (st[0] + st[2]) / 2 + 0.03;
    // (the four pictures must differ at all: identical ones mean the camera never moved, and the
    // check would pass whatever the hand-over did)
    const moved = new Set(h.rows.map((x) => `${x.pixels}:${x.alpha.toFixed(4)}:${x.light.toFixed(4)}`)).size === h.rows.length;
    check(`the four distances really drew four pictures (${h.rows.map((x) => x.pixels).join(', ')} pixels)`, moved);
    check(`no step at the hand-over at 16 km: the cover changes ${sa.map((x) => x.toFixed(3)).join(', ')} and the light ${sl.map((x) => x.toFixed(3)).join(', ')} across the four distances (the middle pair crosses it)`,
      moved && h.rows.every((x) => x.pixels > 50) && ok(sa) && ok(sl));
  }
}

if (errors.length) { console.log('PAGE ERRORS: ' + errors.slice(0, 3).join(' | ')); bad++; }
await close();
if (bad) { console.log(`cloud-motion: ${bad} FAILED`); process.exit(1); }
console.log('cloud-motion: all passed');
