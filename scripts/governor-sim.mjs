// Simulates the governor against pretend GPUs (frame cost = fixed + per-pixel x pixels) on
// 60 and 120 Hz screens: does it settle, come down fast, climb back, and ignore terrain
// uploads?   node scripts/governor-sim.mjs
// Each line of the trace is time:megapixels (fN = N feature steps down), every 5 s.
import { Governor, FRAME } from '../src/perf/governor.js';
const stubGl = { getExtension: () => null };
// cost: what the GPU needs for the frame (ms); work (optional): what the page's own work
// needs (ms). They run side by side: the frame takes the longer of the two.
function run(label, { vsyncMs, mode, native, cost, work = () => 2, seconds, events = () => {}, uploadsEvery = 0 }) {
  const app = { renderer: { getContext: () => stubGl }, quality: { x: 1, y: 1, z: 1, w: 1 }, dust: { amount: 1 }, rocks: { setFraction() {} }, terrainBudget(f, id) { this.budget = this.budget || {}; this.budget[id] = f; }, terrainPace(l) { this.pace = l; }, post: { bloomEnabled: true }, hero: { robe: {} }, atmosphere: { airEnabled: true }, nearShadow: { fine: true } };
  const g = new Governor(app, mode); g.setNative(native);
  let prevSoft = false, lastWork = 2, bucket = -1, now = 0, last = 0, busyUntil = 0, frames = 0, lateFrames = 0, lastRender = -1, n = 0;
  const trace = [], byMode = {};           // per mode: [frames, late frames]
  while (now < seconds * 1000) {
    now += vsyncMs;                          // one display refresh
    events(now / 1000, g);
    if (now < busyUntil) continue;           // still drawing the previous frame: no callback
    if (!g.shouldRender(now)) continue;
    const dt = lastRender < 0 ? vsyncMs : now - lastRender; lastRender = now;
    const w = work(now / 1000, g, app);
    let c = Math.max(cost(g.pixels, now / 1000, g, app), w);
    const softOnly = g._softSim && (++n % 3 !== 0);          // ground arriving, at no cost worth the name
    const soft = softOnly || (uploadsEvery && (++n % uploadsEvery === 0));
    if (soft && !softOnly) c += 9;           // a terrain upload hitch
    busyUntil = now + c;
    g.update(dt, prevSoft ? FRAME.SOFT : FRAME.NORMAL, lastWork); prevSoft = soft; lastWork = w + (soft ? 9 : 0);   // the upload's cost shows in the gap to the next frame
    // A frame is late against the target in force when it was drawn (the mode can change
    // during a run: a 33 ms Sharp frame is on time).
    const late = dt > 1000 / g.targetFps * 1.2, m = byMode[g.mode] || (byMode[g.mode] = [0, 0]);
    frames++; m[0]++; if (late) { lateFrames++; m[1]++; }
    if (Math.floor(now / 5000) !== bucket) (bucket = Math.floor(now / 5000), trace.push(`${(now / 1000).toFixed(0)}s:${(g.pixels / 1e6).toFixed(2)}${g.featureLevel ? 'f' + g.featureLevel : ''}${g.loadLevel ? 'p' + g.loadLevel : ''}${g.streamLevel ? 's' + g.streamLevel : ''}`));
  }
  console.log(`\n${label}\n  refresh est ${(1000 / g.vsync).toFixed(0)} Hz, target ${g.targetFps.toFixed(0)} fps, got ${(frames / seconds).toFixed(1)} fps, late ${(100 * lateFrames / frames).toFixed(1)} %${Object.keys(byMode).length > 1 ? ' (' + Object.entries(byMode).map(([k, [f, l]]) => `${k} ${(100 * l / f).toFixed(1)} %`).join(', ') + ')' : ''}, steps ${g.log.length}, holdUp ${g.holdUp}`);
  console.log('  ' + trace.join(' '));
  return g;
}
const NATIVE = 3088 * 1440;
// GPU that manages 60 fps at ~2.2 MP: 4 ms fixed + 5 ms per MP
run('Smooth, 120 Hz, steady scene (fits at ~2.3 MP)', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 120, cost: (p) => 4 + 5 * p / 1e6 });
run('Sharp, 120 Hz, same GPU (fits native at 30)', { vsyncMs: 8.333, mode: 'sharp', native: NATIVE, seconds: 60, cost: (p) => 4 + 5 * p / 1e6 });
run('Smooth, heats up: cost x1.6 after 40 s', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 120, cost: (p, t) => (4 + 5 * p / 1e6) * (t > 40 ? 1.6 : 1) });
run('Smooth, weak GPU: needs feature steps', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 60, cost: (p, t, g) => 15 + 6 * p / 1e6 - g.featureLevel * 1.2 });
run('Smooth, light scene after 30 s (should climb back)', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 150, cost: (p, t) => (t < 30 ? 4 + 9 * p / 1e6 : 2 + 2.2 * p / 1e6) });
run('Smooth, 60 Hz screen', { vsyncMs: 16.667, mode: 'smooth', native: NATIVE, seconds: 60, cost: (p) => 4 + 5 * p / 1e6 });
run('Smooth, steady + terrain upload every 3rd frame', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 60, uploadsEvery: 3, cost: (p) => 4 + 5 * p / 1e6 });
run('Smooth then Sharp at 30 s then Smooth at 60 s', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 90, cost: (p) => 4 + 5 * p / 1e6, events: (t, g) => { if (t > 30 && t < 60 && g.mode !== 'sharp') g.setMode('sharp'); if (t > 60 && g.mode !== 'smooth') g.setMode('smooth'); } });
// The test phone as measured (milestone 1 build): holds native at 60 fps, with a couple of
// seconds of slow frames now and then that resolution cannot cure. It should dip and
// then return to native in one step.
run('Phone-like: holds native; a 2 s burst of slow frames every 90 s', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 300, cost: (p, t) => 3 + 2.5 * p / 1e6 + (t % 90 > 60 && t % 90 < 62 ? 9 : 0) });
// The test phone after milestone 4: a 10 s stretch where the work per frame, not the pixels,
// makes frames slow (it once took the picture from 4.45 to 1.60 MP for nothing). Resolution
// should come back after two steps that do not help; fewer patches cure it here.
run('Phone-like: 10 s of slow work per frame (fewer patches cure it)', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 120, cost: (p) => 3 + 2.0 * p / 1e6, work: (t, g, app) => (t > 40 && t < 50 ? 22 * (app.budget?.load ?? 1) : 6) });
run('Phone-like: 10 s of slow work per frame that nothing cures', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 120, cost: (p) => 3 + 2.0 * p / 1e6, work: (t) => (t > 40 && t < 50 ? 30 : 6) });
// Heat: the GPU needs a lower resolution while the page's own work has grown to two thirds
// of the frame. Work that fits in the frame must not stop resolution from coming down (it
// once did, for good: every frame late at 3.91 MP).
{
  const g = run('Phone-like: heat after 40 s with the page\'s own work at 11 ms (pixels are still the cure)', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 120, cost: (p, t) => (3 + 2.5 * p / 1e6) * (t > 40 ? 1.6 : 1), work: (t) => (t > 40 ? 11 : 6) });
  if (g.pixels > 3.2e6) { console.log('FAILED: resolution did not come down'); process.exitCode = 1; }
}
// Sharp after slow work in Smooth: everything on means the patches too.
{
  const g = run('Slow work in Smooth, then Sharp at 60 s', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 70, cost: (p) => 3 + 2.0 * p / 1e6, work: (t) => (t > 40 && t < 58 ? 30 : 6), events: (t, gg) => { if (t > 60 && gg.mode !== 'sharp') gg.setMode('sharp'); } });
  if (g.loadLevel !== 0) { console.log('FAILED: Sharp did not get its patches back'); process.exitCode = 1; }
}
// The test phone on Mars (fourth results, build fa0c4c9): pixels are what is slow (60 fps
// holds at about 1.9 MP), the page's own work is 5 ms, and ground arrives in most frames
// for the first seconds at a new place. It took 9 s on terrain levers and 5 more coming
// down. From native, a holding size must be reached within 4 s, on resolution alone.
{
  let at = null;
  const g = run('Phone on Mars: pixels slow, ground arriving in 2 of 3 frames (must settle in 4 s)', { vsyncMs: 8.403, mode: 'smooth', native: NATIVE, seconds: 30, uploadsEvery: 0, cost: (p) => 3 + 6.6 * p / 1e6, work: () => 5.5,
    events: (t, gg) => { if (t < 0.02 && gg.resLevel !== 0) { gg.resLevel = 0; gg._applyScale(); } if (at == null && gg.pixels < 2.0e6) at = t; gg._softSim = t < 8; } });
  if (at == null || at > 4) { console.log(`FAILED: took ${at == null ? 'more than 30' : at.toFixed(1)} s to reach a size that holds`); process.exitCode = 1; }
  if (g.loadLevel !== 0 || g.streamLevel !== 0) { console.log('FAILED: terrain levers pulled for slow pixels'); process.exitCode = 1; }
}
// A place seen before starts from what it held.
{
  const known = { 'smooth:mars': 7 };
  const app = { renderer: { getContext: () => stubGl } }, g = new Governor(app, 'smooth');
  g.remember(known, () => {}); g.place = 'mars'; g.setNative(NATIVE);
  console.log(`\nA place seen before: starts at ${(g.pixels / 1e6).toFixed(2)} MP`);
  if (g.resLevel !== 7) { console.log('FAILED: the remembered level was not taken'); process.exitCode = 1; }
  g.arrive('moon');
  if (g.resLevel !== 5) { console.log('FAILED: a new place in Smooth should start 5 steps down'); process.exitCode = 1; }
}
run('Desktop 1080p 60 Hz, strong GPU', { vsyncMs: 16.667, mode: 'smooth', native: 1920 * 1080, seconds: 40, cost: (p) => 2 + 1.5 * p / 1e6 });
