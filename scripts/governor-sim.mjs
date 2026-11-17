// Simulates the governor against pretend GPUs (frame cost = fixed + per-pixel x pixels) on
// 60 and 120 Hz screens: does it settle, come down fast, climb back, and ignore terrain
// uploads?   node scripts/governor-sim.mjs
// Each line of the trace is time:megapixels (fN = N feature steps down), every 5 s.
import { Governor, FRAME } from '../src/perf/governor.js';
const stubGl = { getExtension: () => null };
function run(label, { vsyncMs, mode, native, cost, seconds, events = () => {}, uploadsEvery = 0 }) {
  const app = { renderer: { getContext: () => stubGl }, quality: { x: 1, y: 1 }, rocks: { setFraction() {} }, terrainBudget() {}, post: { bloomEnabled: true }, hero: { cloak: {} } };
  const g = new Governor(app, mode); g.setNative(native);
  let prevSoft = false, bucket = -1, now = 0, last = 0, busyUntil = 0, frames = 0, lateFrames = 0, lastRender = -1, n = 0;
  const trace = [];
  while (now < seconds * 1000) {
    now += vsyncMs;                          // one display refresh
    events(now / 1000, g);
    if (now < busyUntil) continue;           // still drawing the previous frame: no callback
    if (!g.shouldRender(now)) continue;
    const dt = lastRender < 0 ? vsyncMs : now - lastRender; lastRender = now;
    let c = cost(g.pixels, now / 1000, g);
    const soft = uploadsEvery && (++n % uploadsEvery === 0);
    if (soft) c += 9;                        // a terrain upload hitch
    busyUntil = now + c;
    g.update(dt, prevSoft ? FRAME.SOFT : FRAME.NORMAL); prevSoft = soft;   // the upload's cost shows in the gap to the next frame
    frames++; if (dt > 1000 / (mode === 'smooth' ? 60 : 30) * 1.2) lateFrames++;
    if (Math.floor(now / 5000) !== bucket) (bucket = Math.floor(now / 5000), trace.push(`${(now / 1000).toFixed(0)}s:${(g.pixels / 1e6).toFixed(2)}${g.featureLevel ? 'f' + g.featureLevel : ''}`));
  }
  console.log(`\n${label}\n  refresh est ${(1000 / g.vsync).toFixed(0)} Hz, target ${g.targetFps.toFixed(0)} fps, got ${(frames / seconds).toFixed(1)} fps, late ${(100 * lateFrames / frames).toFixed(1)} %, steps ${g.log.length}, holdUp ${g.holdUp}`);
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
run('Desktop 1080p 60 Hz, strong GPU', { vsyncMs: 16.667, mode: 'smooth', native: 1920 * 1080, seconds: 40, cost: (p) => 2 + 1.5 * p / 1e6 });
