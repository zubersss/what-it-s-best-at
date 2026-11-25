// Simulates the governor against pretend GPUs (frame cost = fixed + per-pixel x pixels) on
// 60 and 120 Hz screens: does it settle, come down fast, climb back, and ignore terrain
// uploads?   node scripts/governor-sim.mjs
// Each line of the trace is time:megapixels (fN = N feature steps down), every 5 s.
import fs from 'node:fs';
import * as GovModule from '../src/perf/governor.js';
import { Benchmark } from '../src/perf/benchmark.js';
import { PARTS } from '../src/perf/profile.js';
import { run as route, where as routeWhere } from './lib/governor-route.mjs';
const { Governor, FRAME, FEATURE_STEPS } = GovModule;
const stubGl = { getExtension: () => null };
// cost: what the GPU needs for the frame (ms); work (optional): what the page's own work
// needs (ms). They run side by side: the frame takes the longer of the two.
// scene (optional): what is drawn where the traveller is, for the steps that ask (`live`):
// by default everything (near trees, grass, the far forest, the cloud volume, the figure).
function run(label, { vsyncMs, mode, native, cost, work = () => 2, seconds, events = () => {}, uploadsEvery = 0, scene = {} }) {
  const app = { renderer: { getContext: () => stubGl }, quality: { x: 1, y: 1, z: 1, w: 1 }, dust: { amount: 1 }, rocks: { setFraction() {} }, terrainBudget(f, id) { this.budget = this.budget || {}; this.budget[id] = f; }, terrainPace(l) { this.pace = l; }, post: { bloomEnabled: true }, hero: { robe: {}, group: { visible: true } }, atmosphere: { airEnabled: true }, nearShadow: { fine: true },
    trees: { count: 200, setFraction() {} }, grass: { keepClumps: 1, keepBlades: 1, mesh: { visible: true }, setMidShare() {}, setFraction() {} }, farForest: { shown: true, count: 5000, setFraction() {} }, cloudVolume: { wanted: true }, clouds: { mesh: { visible: true } }, ...scene };
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
// The test phone on Earth (build 18c4a23): ground built again from arriving maps came in
// every frame for half a minute, every saving was switched on, and the picture stayed bare
// long after. Two things must hold now. Ground that arrives in bursts, twice a second, one
// late frame each, costs nothing in quality ...
{
  const g = run('Phone on Earth: a burst of ground twice a second, the rest on time (nothing given up)', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 40, uploadsEvery: 30, cost: (p) => 3 + 2.5 * p / 1e6, work: () => 5,
    events: (t, gg) => { if (t < 0.02 && gg.resLevel !== 0) { gg.resLevel = 0; gg._applyScale(); } } });
  if (g.featureLevel !== 0 || g.resLevel !== 0 || g.loadLevel !== 0) { console.log(`FAILED: quality given up for bursts of ground (resolution ${g.resLevel} steps down, ${g.featureLevel} savings, patches ${g.loadLevel})`); process.exitCode = 1; }
}
// ... and from the floor (every saving on, the fewest pixels) the savings are all off
// again within 45 s once frames are on time.
{
  let back = null;
  run('After a long dip (every saving on): the way back', { vsyncMs: 8.333, mode: 'smooth', native: NATIVE, seconds: 90, cost: (p) => 3 + 3.0 * p / 1e6,
    events: (t, gg) => { if (t < 0.02 && gg.featureLevel === 0) { gg.resLevel = gg.maxResLevel; gg._applyScale(); gg.toFloor(); } if (back == null && t > 1 && gg.featureLevel === 0) back = t; } });
  if (back == null || back > 45) { console.log(`FAILED: the savings took ${back == null ? 'more than 90' : back.toFixed(0)} s to come off again`); process.exitCode = 1; }
  else console.log(`  every saving off again after ${back.toFixed(0)} s`);
}
// A place seen before starts from what it held.
{
  const known = { 'smooth:mars:2': 7, 'smooth:moon': 12 };          // (the second: a level remembered under the old name, which must not be taken)
  const app = { renderer: { getContext: () => stubGl } }, g = new Governor(app, 'smooth');
  g.remember(known, () => {}); g.place = 'mars'; g.setNative(NATIVE);
  console.log(`\nA place seen before: starts at ${(g.pixels / 1e6).toFixed(2)} MP`);
  if (g.resLevel !== 7) { console.log('FAILED: the remembered level was not taken'); process.exitCode = 1; }
  g.arrive('moon');
  if (g.resLevel !== 5) { console.log('FAILED: a new place in Smooth should start 5 steps down (and a level remembered under the old name must not be taken)'); process.exitCode = 1; }
}
// The test phone, eighth results (build f300e6f): one frame in fifteen came late at every
// stop, at one million pixels with every saving on as at two million, and the governor sat
// at its floor for whole benchmarks, because one late frame in three seconds kept it from
// ever stepping up. Late frames of the device's own must neither bring quality down nor
// keep it down: from the floor it must climb to what the GPU holds (here 3 MP and more).
{
  let k = 0;
  const g = run('Phone, eighth results: one frame in fifteen late whatever is drawn (must climb from the floor)', { vsyncMs: 8.403, mode: 'smooth', native: NATIVE, seconds: 150, work: () => 6,
    cost: (p) => 6 + 3.0 * p / 1e6 + (++k % 15 === 0 ? 14 : 0),
    events: (t, gg) => { if (t < 0.02 && gg.featureLevel === 0) { gg.resLevel = gg.maxResLevel; gg._applyScale(); gg.toFloor(); } } });
  if (g.featureLevel !== 0 || g.pixels < 2.6e6) { console.log(`FAILED: stayed down among late frames of the device's own (${(g.pixels / 1e6).toFixed(2)} MP, ${g.featureLevel} savings on)`); process.exitCode = 1; }
}
// ... and a view's own trouble (a third of the frames late for 25 s, whatever is drawn):
// a short trial of fewer pixels, then the picture back as it was, not the floor.
{
  let k = 0, low = 0, lowT = 0;
  const g = run('Phone: a third of the frames late for 25 s that nothing drawn cures (a short trial, then back)', { vsyncMs: 8.403, mode: 'smooth', native: NATIVE, seconds: 90, work: () => 6,
    cost: (p, t) => 5 + 2.4 * p / 1e6 + (t > 30 && t < 55 && ++k % 3 === 0 ? 16 : 0),
    events: (t, gg) => { if (t > 30 && t < 55) { if (gg.pixels < 1.9e6 || gg.featureLevel > 0) lowT += 0.0084; low = Math.max(low, gg.featureLevel); } } });
  if (lowT > 8) { console.log(`FAILED: ${lowT.toFixed(0)} s near the floor for late frames that fewer pixels do not cure`); process.exitCode = 1; }
  if (g.pixels < 3.4e6) { console.log(`FAILED: did not come back (${(g.pixels / 1e6).toFixed(2)} MP)`); process.exitCode = 1; }
}
// Every frame late whatever is drawn (a GPU busy with something no lever touches): at the
// floor with every saving on the frames are as long as before. Then all of it comes back.
{
  const g = run('Every frame late whatever is drawn (everything comes back)', { vsyncMs: 8.403, mode: 'smooth', native: NATIVE, seconds: 60, work: () => 6, cost: (p, t) => (t > 10 ? 27 : 5 + 2.4 * p / 1e6) });
  if (g.featureLevel !== 0 || g.resLevel >= g.maxResLevel) { console.log(`FAILED: left at the floor for nothing (${(g.pixels / 1e6).toFixed(2)} MP, ${g.featureLevel} savings on)`); process.exitCode = 1; }
}
// A few late frames that ARE the pixels' (a frame's cost wanders by 4 ms: at 2.35 MP one
// frame in six is late, at 2.07 MP none): too few at a time to trip the window, and they
// must not be taken for the device's own. A trial step cures them and stays; steps back
// up fail and are tried less and less often.
{
  let seed = 12345, lateAfter = 0, framesAfter = 0, last = 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = run('A few late frames that fewer pixels do cure (must settle where they stop, without hunting)', { vsyncMs: 8.403, mode: 'smooth', native: NATIVE, seconds: 240, work: () => 6,
    cost: (p) => 6 + 3.2 * p / 1e6 + 4 * rnd(),
    events: (t, gg) => { if (t > 120 && gg.time !== last) { last = gg.time; } } });
  if (g.pixels > 2.4e6 || g.pixels < 1.7e6) { console.log(`FAILED: settled at ${(g.pixels / 1e6).toFixed(2)} MP (2.07 holds, 2.35 does not)`); process.exitCode = 1; }
  if (g.featureLevel !== 0) { console.log('FAILED: savings on for late frames that a resolution step cures'); process.exitCode = 1; }
  const tail = g.log.filter((l) => l.t > 120).length;
  if (tail > 12) { console.log(`FAILED: still hunting after two minutes (${tail} steps in the last two)`); process.exitCode = 1; }
}
// The test phone, ninth results (build 6ac24ff, Haven): at the fewest pixels a third to a
// half of the frames late, and what cures them is a few steps that each buy milliseconds
// (the cost test's own figures below), while most steps buy nothing. With those few behind
// eight that buy nothing, a trial of two to four steps ended before it reached one, four
// times in one benchmark, and the picture stayed at the floor with half its frames late.
// Now a trial must reach a step that cures them, keep it, and give the rest back.
// (each of these fails on the ladder as it was: "least loss first")
const offNow = (g, id) => (g.isOff ? g.isOff(id) : FEATURE_STEPS.findIndex((f) => f.id === id) < g.featureLevel);
const ninth = (label, base, saves, scene, check) => {
  let seed = 4711, late = 0, n = 0, back = 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = run(label, { vsyncMs: 8.403, mode: 'smooth', native: NATIVE, seconds: 240, work: () => 6, scene,
    // (under two million pixels the picture's size is hardly what a frame costs on this phone)
    cost: (p, t, gg) => { let c = base + 0.6 * p / 1e6 + 5 * rnd(); for (const id in saves) if (offNow(gg, id)) c -= saves[id]; if (t > 60) { n++; if (c > 16.67) late++; } return c; },
    events: (t, gg) => { if (t < 0.02 && gg.resLevel !== gg.maxResLevel) { gg.resLevel = gg.maxResLevel; gg._applyScale(); } } });
  back = g.log.filter((l) => /did not cure/.test(l.text)).length;
  // (every saving that was switched on at any time in the run, by its label in the log)
  const ever = FEATURE_STEPS.filter((f) => g.log.some((l) => l.text.includes('off: ' + f.label))).map((f) => f.id);
  const share = late / Math.max(1, n), ids = g.offIds || FEATURE_STEPS.slice(0, g.featureLevel).map((f) => f.id);
  console.log(`  late in the second minute ${(100 * share).toFixed(1)} %, savings on: ${ids.join(', ') || 'none'}; trials that ended with everything put back: ${back}`);
  if (share > 0.08) { console.log('FAILED: the late frames were not cured, though a step that cures them exists'); process.exitCode = 1; }
  check?.(ids, ever, g);
};
ninth('Phone, ninth results, the opening view: frames up to 3.5 ms too long; grass-mid buys 5.0, far-trees 3.6, clouds 4.0, far-relief 3.5', 13.2,
  { 'grass-mid': 5.0, clouds: 4.0, 'far-trees': 3.6, 'far-relief': 3.5, 'cloud-volume': 2.8, bloom: 1.1, 'fine-shadows': 1.1 }, {},
  (ids, ever, g) => {
    if (ids.length > 4) { console.log(`FAILED: ${ids.length} savings left on where one or two cure the frames`); process.exitCode = 1; }
    // (pixels are not what these frames wait for: with the one saving on, the picture's size comes back)
    if (g.pixels < 2.0e6) { console.log(`FAILED: the picture stayed at ${(g.pixels / 1e6).toFixed(2)} MP behind a saving that stays on`); process.exitCode = 1; }
  });
ninth('Phone, ninth results, in a wood: tree-leaves buys 11.5, trees-far 7.0, cloud-steps 3.4, tree-shadows 2.7', 15.0,
  { 'tree-leaves': 11.5, 'trees-far': 7.0, 'cloud-steps': 3.4, 'tree-shadows': 2.7, grass: 1.6, cloak: 1.0 }, {},
  (ids) => { if (ids.length > 5) { console.log(`FAILED: ${ids.length} savings left on where two or three cure the frames`); process.exitCode = 1; } });
// From the air nothing of the trees and the grass is drawn: their steps are passed over,
// and the trial reaches the one step that buys anything there.
ninth('Phone, ninth results, from the air: only cloud-volume cures (9.4); no near trees, no grass, no far forest drawn', 13.2,
  // (the near trees as the game leaves them after a take-off from a wood: the last list's count
  // kept, nothing drawn, reach 0: their steps must not count as live up there)
  { 'cloud-volume': 9.4 }, { trees: { count: 200, reach: 0, setFraction() {} }, grass: { keepClumps: 0, keepBlades: 0, mesh: { visible: false }, setMidShare() {}, setFraction() {} }, farForest: { shown: false, count: 0, setFraction() {} } },
  (ids, ever) => {
    if (!ids.includes('cloud-volume')) { console.log('FAILED: the one step that cures the frames was not reached'); process.exitCode = 1; }
    // (at any time in the run, not only at its end: what went first has come back by then)
    for (const id of ['tree-shadows', 'trees-far', 'tree-leaves', 'grass-mid', 'grass', 'far-trees']) if (ever.includes(id)) { console.log(`FAILED: ${id} switched off where nothing of it is drawn`); process.exitCode = 1; }
    if (ids.length > 4) { console.log(`FAILED: ${ids.length} savings left on where one cures the frames`); process.exitCode = 1; }
  });
// Sharp is the default since 2026-11-24 (a steady 30 with the sharpest picture that holds).
// A GPU like the test phone's, from its ninth results: Sharp starts at the screen's own
// size with everything on. (1) A view whose frames hardly depend on the picture's size (the
// opening view: 62 ms at native, 64 at 2 MP in the cost test): fewer pixels cure nothing,
// two savings do. It must not sit at native with its frames late, nor end at the fewest
// pixels: the savings are tried at the size that stands. (2) A view that is pixels (the
// wood: 104 ms at native, 72 at 2 MP): frames of 45 to 60 ms at native must settle at a
// size that holds, without hunting.
const sharp = (label, costAt, saves, check) => {
  let seed = 99, late = 0, n = 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = run(label, { vsyncMs: 8.403, mode: 'sharp', native: NATIVE, seconds: 300, work: () => 8,
    cost: (p, t, gg) => { let c = costAt(p / 1e6) + 4 * rnd(); for (const id in saves) if (offNow(gg, id)) c -= saves[id]; if (t > 180) { n++; if (c > 33.6) late++; } return c; } });
  const share = late / Math.max(1, n), tail = g.log.filter((l) => l.t > 180).length;
  console.log(`  late in the last two minutes ${(100 * share).toFixed(1)} %, ${(g.pixels / 1e6).toFixed(2)} MP, savings on: ${(g.offIds || []).join(', ') || 'none'}; steps in the last two minutes: ${tail}`);
  if (share > 0.1) { console.log('FAILED: frames still late against 33 ms'); process.exitCode = 1; }
  if (tail > 14) { console.log(`FAILED: still hunting (${tail} steps in the last two minutes)`); process.exitCode = 1; }
  check?.(g);
};
sharp('Phone in Sharp, a view that is not pixels (frames 38 to 43 ms at any size; grass-mid buys 5.0, far-trees 3.6)', (mp) => 33.5 + 1.0 * mp,
  { 'grass-mid': 5.0, 'far-trees': 3.6, clouds: 4.0, 'far-relief': 3.5 },
  (g) => { if (g.pixels < 3.0e6) { console.log(`FAILED: ended at ${(g.pixels / 1e6).toFixed(2)} MP for frames that fewer pixels do not cure`); process.exitCode = 1; } });
sharp('Phone in Sharp, a view that is pixels (frames 50 to 55 ms at native, 33 at 2 MP; must settle)', (mp) => 16 + 7.8 * mp, { 'tree-leaves': 6.0, 'trees-far': 3.5 });
// The cold review of 2026-11-24 (docs/briefs/haven-rich-review.md, governor-1 and -2), each
// case failing on the governor as it was then.
// (1) A device with late frames of its own (one in fifteen, whatever is drawn), frames that
// fit at any size: a trial of fewer pixels that cures nothing must not hand over to a
// minute of savings (it did, when the trial was started by the slow drift of the late share
// rather than by a burst: every large saving off, the cloud volume first, for a minute).
const ownLate = (mode) => {
  let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const offFor = {}; let lastT = 0;
  const g = run(`${mode === 'sharp' ? 'Sharp' : 'Smooth'}, late frames of the device's own (1 in 15 whatever is drawn), frames that fit at any size`, { vsyncMs: 8.403, mode, native: NATIVE, seconds: 300, work: () => 6,
    cost: (p, t, gg) => (gg.mode === 'sharp' ? 20 : 10) + 1.0 * p / 1e6 + (rnd() < 1 / 15 ? 30 : 0),
    events: (t, gg) => { for (const id of gg.offIds || []) offFor[id] = (offFor[id] || 0) + (t - lastT); lastT = t; } });
  const long = Object.entries(offFor).filter(([, s]) => s > 10);
  console.log(`  savings off for more than 10 s: ${long.map(([k, v]) => `${k} ${v.toFixed(0)} s`).join(', ') || 'none'}`);
  if (long.length) { console.log('FAILED: savings switched off for late frames that no saving cures'); process.exitCode = 1; }
};
ownLate('sharp'); ownLate('smooth');
// (2) Sharp at the opening view (frames 35 to 38 ms at native, grass-mid cures them): a saving
// that buys nothing (cloud-steps), once back with no late frame since, must not be taken off
// again by a late share that is only the memory of the trial's first frames.
{
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const offFor = {}; let lastT = 0;
  const g = run('Sharp, the opening view: frames 35 to 38 ms at any size, grass-mid buys 6.0, nothing else buys anything', { vsyncMs: 8.403, mode: 'sharp', native: NATIVE, seconds: 240, work: () => 8,
    cost: (p, t, gg) => 35 + 0.3 * p / 1e6 + 3 * rnd() - (gg.isOff('grass-mid') ? 6 : 0),
    events: (t, gg) => { for (const id of gg.offIds || []) offFor[id] = (offFor[id] || 0) + (t - lastT); lastT = t; } });
  // (a trial gives its savings back one at a time, some 6 s apart: up to half a minute off is
  // the trial; the fault kept cloud-steps off 70 s and trees-far 47 s)
  const kept = Object.entries(offFor).filter(([k, s]) => k !== 'grass-mid' && s > 30);
  console.log(`  off over the run: ${Object.entries(offFor).map(([k, v]) => `${k} ${v.toFixed(0)} s`).join(', ') || 'none'}; savings on at the end: ${(g.offIds || []).join(', ') || 'none'}`);
  if (kept.length) { console.log(`FAILED: ${kept.map(([k]) => k).join(', ')} kept off for more than 30 s, buying nothing`); process.exitCode = 1; }
  if (!(g.offIds || []).includes('grass-mid')) { console.log('FAILED: the one saving that cures the frames is not on at the end'); process.exitCode = 1; }
}
run('Desktop 1080p 60 Hz, strong GPU', { vsyncMs: 16.667, mode: 'smooth', native: 1920 * 1080, seconds: 40, cost: (p) => 2 + 1.5 * p / 1e6 });

// ---------------------------------------------------------------------------------------
// The tenth phone results (build e9d4888, Sharp, 60 Hz; docs/briefs/shadows-governor-10.md,
// governor-1 to -5 and shadows-4): Haven sat at the floor (1.60 MP) at every stop, the
// ladder's first savings bought nothing and came and went, trials and step-up watches ran on
// across bookmark jumps, the benchmark began where play had left the governor, its read-out
// hid most late frames, and the shadows near the traveller were switched back and forth.
// Each case fails on the governor as it was (5024b61). (1) to (4) are the readers' cases,
// with their replay of the benchmark's route (lib/governor-route.mjs).
{
  let failed10 = 0;
  const fail = (msg) => { console.log('  FAILED: ' + msg); failed10++; };
  const makeApp10 = (scene = {}) => ({ renderer: { getContext: () => stubGl }, quality: { x: 1, y: 1, z: 1, w: 1 }, dust: { amount: 1 }, rocks: { setFraction() {} }, terrainBudget() {}, terrainPace() {}, post: { bloomEnabled: true }, hero: { robe: {}, group: { visible: true } }, atmosphere: { airEnabled: true }, nearShadow: { fine: true },
    trees: { count: 0, reach: 0, setFraction() {} }, grass: { keepClumps: 1, keepBlades: 1, mesh: { visible: true }, setMidShare() {}, setFraction() {} }, farForest: { shown: false, count: 0, setFraction() {} },
    cloudVolume: { wanted: true, enabled: true }, clouds: { mesh: { visible: true } }, pollen: { mesh: { visible: true }, setShare() {} }, farRocks: { setFraction() {} }, terrain: { shared: { uRelief: { value: { x: 1 } } } }, ...scene });
  const VS60 = 1000 / 60;
  // A 60 Hz screen in Sharp: a frame is late when its GPU time is over 33.3 ms (it then takes
  // three refreshes). events(t, g, app, jump) each refresh; jump(): a bookmark jump (the app
  // calls the governor's jumped() and reports 2.5 s of IGNORE frames).
  const sharp10 = ({ seconds, cost, known = null, setup = null, seed = 7, scene = {}, events = null }) => {
    let s = seed; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * Math.SQRT2; };
    const app = makeApp10(scene), g = new Governor(app, 'sharp');
    if (known) { g.remember(known, () => {}); g.place = 'haven'; }
    g.setNative(NATIVE); setup?.(g, app);
    let now = 0, busy = 0, last = -1, jumpAt = -1e9; const frames = [];
    const jump = () => { jumpAt = now; g.jumped?.(); };
    while (now < seconds * 1000) {
      now += VS60;
      events?.(now / 1000, g, app, jump);
      if (now < busy) continue; if (!g.shouldRender(now)) continue;
      const dt = last < 0 ? 2 * VS60 : now - last; last = now;
      busy = now + cost(g.pixels / 1e6, g, now / 1000, gauss) - 0.01;
      g.update(dt, now - jumpAt < 2500 ? FRAME.IGNORE : FRAME.NORMAL, 9);
      frames.push({ t: now / 1000, dt, mp: g.pixels / 1e6, n: g.featureLevel });
    }
    return { g, frames, app };
  };
  const late10 = (fr) => fr.filter((f) => f.dt > 40).length / Math.max(1, fr.length);
  const idx = (id) => FEATURE_STEPS.findIndex((f) => f.id === id);
  // Haven's opening view as the tenth cost test measured it: 47.2 ms at 1 MP and 54.3 at native
  // (2.06 ms a megapixel); savings that bought something there, in ms (the ledge row, what
  // repeats in a second view): far-relief 3.9, far-rock-shadows 3.0, clouds 2.7, cloud-volume
  // 2.0, grass-mid 1.4; every other saving bought nothing. Frames 34 ms at 1.6 MP with
  // everything on (the phone's ledge at its floor: a quarter to a half of the frames late).
  const LEDGE = { 'far-relief': 3.9, 'far-rock-shadows': 3.0, clouds: 2.7, 'cloud-volume': 2.0, 'grass-mid': 1.4 };
  const ledgeCost = (mp, g, t, gauss) => { let c = 30.8 + 2.06 * mp + 2.0 * gauss(); for (const id in LEDGE) if (g.isOff(id)) c -= LEDGE[id]; return c; };

  // (1) governor-1 and -2: Haven remembered at 1.82 MP (the phone started there: its first
  // step, at 6.2 s, was "down to 1.60 MP"), the opening view as measured: the savings that buy
  // must be used at a sharp picture, not at the fewest pixels.
  {
    const { g, frames } = sharp10({ seconds: 90, cost: ledgeCost, known: { 'sharp:haven:2': 7 } });
    const tail = frames.filter((f) => f.t > 60), mp = tail.reduce((a, f) => a + f.mp, 0) / tail.length;
    console.log(`\nTenth results (1): Haven remembered at 1.82 MP, the opening view: last 30 s at ${mp.toFixed(2)} MP, ${(100 * late10(tail)).toFixed(1)} % late, savings on: ${g.offIds.join(', ') || 'none'}`);
    if (mp < 2.6) fail(`the picture stayed at ${mp.toFixed(2)} MP where 2.67 MP holds with the savings that buy`);
    if (late10(tail) > 0.08) fail('frames still late');
  }
  // (2) governor-1: after a dip at a heavy view (the floor, ten savings on), the view turns light
  // (22 ms at 1.6 MP with everything on, 2 ms a megapixel: native fits): the picture must be
  // over 2.6 MP within 15 s. It was not until every saving was back.
  {
    let firstRes = null, lastFeat = null, sharpAt = null;
    const { g } = sharp10({ seconds: 60, cost: (mp, g, t, gauss) => 19 + 2.0 * mp + 1.5 * gauss(),
      setup: (g) => { g.resLevel = g.maxResLevel; g._applyScale(); for (let k = 0; k < 10; k++) { const i = g._nextStep(); if (i >= 0) g._stepOff(i, false); } } });
    for (const l of g.log) { if (firstRes == null && /^resolution up/.test(l.text)) firstRes = l.t; if (/^back on/.test(l.text)) lastFeat = l.t; }
    for (const l of g.log) { const m = /resolution up to ([0-9.]+) MP/.exec(l.text); if (m && +m[1] > 2.6 && sharpAt == null) sharpAt = l.t; }
    console.log(`Tenth results (2): the way back from a dip: first resolution step up at ${firstRes ?? '-'} s, last saving back at ${lastFeat ?? '-'} s, over 2.6 MP at ${sharpAt ?? 'never'} s`);
    if (sharpAt == null || sharpAt > 15) fail(`the picture took ${sharpAt == null ? 'more than 60' : sharpAt} s to be over 2.6 MP again`);
  }
  // (3) governor-3: a trial at the opening view must not switch off savings that bought nothing
  // in any of the tenth's three cost views (the robe: page work, -1.1 / -1.0 / 1.2; the fine
  // shadow tile -0.4 / 1.3; glow 0.4 in one view; coarser cloud steps 0.7 / -5.2 / -4.0, and
  // nothing at all once the cloud volume is off) before the ones that did. On the phone the
  // robe and the fine shadow tile went off at 8.3 s, before the clouds' shadows and far relief,
  // and came and went some ten times in a minute.
  {
    const NOTHING = ['cloak', 'fine-shadows', 'bloom', 'cloud-steps'], BUY = Object.keys(LEDGE);
    const { g } = sharp10({ seconds: 60, cost: ledgeCost, known: { 'sharp:haven:2': 8 } });
    const offs = g.log.filter((l) => l.text.startsWith('off: ')).map((l) => FEATURE_STEPS.find((f) => 'off: ' + f.label === l.text)?.id);
    const firstBuy = Math.min(...BUY.map((id) => { const k = offs.indexOf(id); return k < 0 ? 1e9 : k; }));
    const early = offs.slice(0, firstBuy === 1e9 ? offs.length : firstBuy).filter((id) => NOTHING.includes(id));
    console.log(`Tenth results (3): the first savings a trial takes at the opening view: ${offs.slice(0, 8).join(', ')}`);
    if (early.length) fail(`switched off before any saving that buys: ${[...new Set(early)].join(', ')}`);
    // (and with the cloud volume off, coarser steps through it is not a step that can buy anything)
    const app = makeApp10(), gg = new Governor(app, 'sharp'); gg.setNative(NATIVE);
    gg._stepOff(idx('cloud-volume'), false);
    if (FEATURE_STEPS[gg._nextStep()]?.id === 'cloud-steps') fail('cloud-steps offered as the next saving with the cloud volume already off');
  }
  // (4) governor-1 to -4: the tenth benchmark's route replayed (the reading that reproduces the
  // phone: Haven's heavy stops limited by GPU time near the 33 ms line, the Moon's late frames
  // its own), eight runs: Haven's five stops must not sit at the floor, nor switch savings
  // forty times a run, nor be later than today (phone: 1.60-1.65 MP at every stop, 74 steps,
  // 8.4 % of frames three refreshes long).
  {
    let mp = 0, n = 0, lt = 0, sw = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const res = route(GovModule, { model: 'mixed', seed, start: 7 });
      for (const f of res.frames) if (f.key.startsWith('haven:') && f.key !== 'haven:flight') { n++; mp += f.mp; if (f.dt > 40) lt++; }
      sw += res.g.log.filter((l) => /^(off|back on):/.test(l.text) && routeWhere(l.t).world === 'haven' && routeWhere(l.t).key !== 'haven:flight').length;
    }
    console.log(`Tenth results (4): the route, 8 runs: Haven's stops at ${(mp / n).toFixed(2)} MP, ${(100 * lt / n).toFixed(1)} % late, ${(sw / 8).toFixed(1)} savings switched a run`);
    if (mp / n < 2.4) fail(`Haven at ${(mp / n).toFixed(2)} MP`);
    if (lt / n > 0.14) fail(`Haven ${(100 * lt / n).toFixed(1)} % late`);
    if (sw / 8 > 30) fail(`${(sw / 8).toFixed(0)} savings switched a run at Haven`);
  }
  // (5) governor-2: a visit in Sharp never starts below 2.67 MP (60 % of native), whatever was
  // remembered, nor does a change of mode to Sharp; a level held with savings on is not what
  // the place is remembered by; and a benchmark begins from a governor as at the page's start.
  {
    const app = makeApp10(), g = new Governor(app, 'sharp');
    g.remember({ 'sharp:haven:2': 7 }, () => {}); g.place = 'haven'; g.setNative(NATIVE);
    const atStart = g.pixels;
    g.setMode('smooth'); g.known['sharp:haven:2'] = 8; g.setMode('sharp');
    console.log(`Tenth results (5): Sharp at Haven remembered at 1.82 MP starts at ${(atStart / 1e6).toFixed(2)} MP; back to Sharp remembered at 1.60 MP, at ${(g.pixels / 1e6).toFixed(2)} MP`);
    if (atStart < 2.6e6) fail(`a visit began at ${(atStart / 1e6).toFixed(2)} MP`);
    if (g.pixels < 2.6e6) fail(`a change of mode to Sharp began at ${(g.pixels / 1e6).toFixed(2)} MP`);
  }
  {
    // (frames on time, no slack for a step up: 25 s at one level, with a saving on and without)
    const learnt = (withSaving) => {
      const known = {}, app = makeApp10(), g = new Governor(app, 'sharp');
      g.remember(known, () => {}); g.place = 'haven'; g.setNative(NATIVE);
      g.resLevel = 6; g._applyScale(); if (withSaving) g._stepOff(idx('grass-mid'), false); g.gpuMs = 40;
      for (let t = 0; t < 25; t += 1 / 30) g.update(1000 / 30, FRAME.NORMAL, 9);
      return known['sharp:haven:2'];
    };
    const a = learnt(true), b = learnt(false);
    console.log(`  remembered after 25 s at 2.07 MP: with a saving on ${a ?? 'nothing'}, with none ${b ?? 'nothing'}`);
    if (a != null) fail('a level held with a saving on was remembered as the place\'s');
    if (b !== 6) fail('a level held with every saving off was not remembered');
  }
  {
    const app = makeApp10(), g = new Governor(app, 'sharp');
    g.remember({ 'sharp:haven:2': 7 }, () => {}); g.place = 'haven'; g.setNative(NATIVE);
    // (what play before it left behind: a log and a clock of half a minute, then the floor, six
    // savings, fewer patches, late frames learned)
    for (let t = 0; t < 30; t += 1 / 30) g.update(1000 / 30, FRAME.NORMAL, 9);
    g.resLevel = g.maxResLevel; g._applyScale(); for (let k = 0; k < 6; k++) g._stepOff(g._nextStep());
    g.loadLevel = 1; g.bg = 0.07; g.lateEMA = 0.1;
    Object.assign(app, { governor: g, world: { id: 'haven' }, loadWorldData: () => Promise.resolve(), profile: { total: new Float64Array(PARTS.length) }, terrain: { rebakes: 0, built: 0, buildMs: 0 }, hiddenCount: 0, setHero() {} });
    const bench = new Benchmark(app); bench.start('haven');
    const first = g.log[bench.stepsFrom];
    console.log(`  a benchmark begins at ${(g.pixels / 1e6).toFixed(2)} MP, ${g.featureLevel} savings on, patches lever ${g.loadLevel}, late frames left alone ${(100 * g.bg).toFixed(0)} %; its first line: ${first ? `${first.t}s ${first.text}` : 'none'}`);
    if (g.featureLevel || g.loadLevel || g.bg || g.pixels < 2.6e6) fail('the benchmark began where play had left the governor');
    if (!first || first.t !== 0 || !/starting at/.test(first.text)) fail('the run\'s steps do not begin with where it began, at 0 s');
  }
  // (6) governor-4: a bookmark jump closes what was on trial at the view left behind. A step up
  // taken at a light view is not judged by the frames of the heavy view jumped to (the phone:
  // savings back at a light stop, off again at the next heavy one), and a trial begun at a
  // heavy view is not carried on at the next.
  {
    let jumpedAt = null, tookBack = false, before = null;
    const { g } = sharp10({ seconds: 30, known: { 'sharp:haven:2': 4 },
      setup: (g) => { for (let k = 0; k < 6; k++) g._stepOff(g._nextStep(), false); },
      cost: (mp, g, t) => (jumpedAt == null ? 24 : 45),
      events: (t, g, app, jump) => {
        // (the first step up at the light view: the traveller jumps to a heavy one at once)
        if (jumpedAt == null && g.sinceUp < 0.05) { jumpedAt = t; before = { holdUp: g.holdUp }; jump(); }
        if (jumpedAt != null && g.lastUpFailed) tookBack = true;
      } });
    console.log(`Tenth results (6): a step up at a light view, then a jump to a heavy one at ${jumpedAt?.toFixed(1)} s: ${tookBack ? 'taken back by the heavy view\'s frames' : 'left alone, the heavy view tried on its own'}${before ? `, holdUp ${before.holdUp} -> ${g.holdUp}` : ''}`);
    if (jumpedAt == null) fail('no step up at the light view');
    if (tookBack) fail('a step up taken at one view was taken back by the frames of the view jumped to');
  }
  {
    // (a trial at a heavy view, then a jump to another)
    const app = makeApp10(), g = new Governor(app, 'sharp'); g.setNative(NATIVE);
    for (let t = 0; t < 3; t += 1 / 30) g.update(1000 / 30 * 1.5, FRAME.NORMAL, 9);
    const open = !!g._dip;
    g.jumped?.();
    console.log(`  a trial open at a heavy view (${open}), after a jump to another: ${g._dip ? 'still open' : 'closed'}`);
    if (!open) fail('no trial at the heavy view');
    if (g._dip) fail('a trial begun at one view is carried on at the next');
    const src = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8'), at = src.indexOf('applyBookmark(name) {');
    if (at < 0 || !/governor\??\.jumped\(\)/.test(src.slice(at, src.indexOf('\n  }\n', at)))) fail('App.applyBookmark does not tell the governor of the jump');
  }
  // (7) governor-5: the benchmark counts late frames at the governor's measure (over 1.2 x the
  // interval: three refreshes or more in Sharp at 60 Hz), in the headline and at each stop,
  // with each stop's frame lengths in refreshes; and its last share of late frames is not
  // called the device's own. (The tenth printed 0.86 % late with 8.4 % of its frames three
  // refreshes long or more: at 1.5 x, a frame of exactly three refreshes is not over.)
  {
    globalThis.window ??= { innerWidth: 823, innerHeight: 384, devicePixelRatio: 3.75 };
    globalThis.navigator ??= { userAgent: 'node' };
    const app = makeApp10(), g = new Governor(app, 'sharp'); g.setNative(NATIVE);
    Object.assign(app, { governor: g, post: { width: 3088, height: 1440 }, terrain: { rebakes: 0, maxChunks: 180 }, gpuName: 'test', hiddenCount: 0, shaderErrors: [] });
    const b = new Benchmark(app), n = 1000;
    Object.assign(b, { kind: 'haven', first: 'haven', second: 'moon', duration: 180, n, stepsFrom: 0, hiddenFrom: 0, rebakesFrom: 0, hitches: [], maxCalls: 0, maxTris: 0, maxGpuBytes: 0, costLines: null,
      names: { haven: ['ledge', 'sun', 'wall', 'ship', 'dusk'], moon: ['ledge', 'sun', 'wall', 'ship', 'dusk'] }, builds: { haven: [0, 0], moon: [0, 0] },
      dt: new Float32Array(n), px: new Float32Array(n).fill(2.67e6), at: new Float32Array(n), part: new Uint8Array(n), sc: new Float32Array(n).fill(8), ph: new Uint8Array(n), up: new Uint8Array(n), pt: new Float64Array(11 * PARTS.length) });
    // (one frame in ten three refreshes long, as a phone measures them: 49.9 to 50.0 ms; the rest two)
    for (let i = 0; i < n; i++) { b.dt[i] = i % 10 === 0 ? 49.9 + 0.1 * (i % 20 === 0) : 33.3; b.at[i] = i * 0.034; }
    const text = b.report(false), head = text.split('\n').find((l) => /late frames \(/.test(l)) || '', stop = text.split('\n').find((l) => /^ {2}Haven ledge:/.test(l)) || '';
    const headPct = +(/= ([0-9.]+) %/.exec(head)?.[1] ?? NaN), stopPct = +(/^ {2}Haven ledge: [0-9.]+ · ([0-9.]+) %/.exec(stop)?.[1] ?? NaN);
    console.log(`Tenth results (7): one frame in ten three refreshes long: the headline says ${headPct} % late, the stop ${stopPct} %; the stop's line: ${stop.trim()}`);
    if (!(Math.abs(headPct - 10) < 0.5)) fail(`the headline counts ${headPct} % late where 10 % of the frames are three refreshes long`);
    if (!(Math.abs(stopPct - 10) < 0.5)) fail(`the stop counts ${stopPct} % late where 10 % of the frames are three refreshes long`);
    if (!/3: 10\.0 %/.test(stop)) fail('the stop gives no frame lengths in refreshes');
    if (/device's own/.test(text)) fail('the late frames the governor leaves alone are called the device\'s own');
  }
  // (8) shadows-4: the shadows of the farther trees bought nothing on the phone (-0.5 / -6.8 /
  // -2.6) and stood second in the ladder: a trial in a wood must not take them while a saving
  // that buys is left.
  {
    const wood = { trees: { count: 200, reach: 1, setFraction() {} }, grass: { keepClumps: 0, keepBlades: 0, mesh: { visible: false }, setMidShare() {}, setFraction() {} }, cloudVolume: { wanted: false, enabled: true }, clouds: { mesh: { visible: false } }, pollen: { mesh: { visible: false }, setShare() {} } };
    let ever = false;
    // (frames some 5 ms over the line at any size; every leaf on the nearest trees buys 11.5)
    sharp10({ seconds: 120, scene: wood, cost: (mp, g, t, gauss) => 37 + 0.3 * mp + 1.5 * gauss() - (g.isOff('tree-leaves') ? 11.5 : 0), events: (t, g) => { if (g.isOff('tree-shadows')) ever = true; } });
    console.log(`Tenth results (8): a trial in a wood where every leaf of the nearest trees cures: the farther trees' shadows ${ever ? 'switched off' : 'never switched off'}`);
    if (ever) fail("the farther trees' shadows were taken, buying nothing, with a saving that buys left");
  }
  // (9) shadows-4: walking among trees, the savings that change shadows in view are not switched
  // back and forth. A walk back and forth along 80 m of a wood for two and a half minutes,
  // where every 30 s a dense stretch makes the frames 8 ms longer (the near trees' full shapes
  // and every leaf on the nearest trees buy 6 and 9), then half a minute standing. A saving
  // that changes shadows must not come back on while the traveller walks within 150 m of where
  // it was taken (the shadows in view would change twice), and none may be left off for good:
  // standing, they come back.
  {
    const HOLD = ['trees-far', 'tree-leaves', 'tree-shadows', 'fine-shadows', 'soft-shadows'];
    const wood = { trees: { count: 200, reach: 1, setFraction() {} }, grass: { keepClumps: 0, keepBlades: 0, mesh: { visible: false }, setMidShare() {}, setFraction() {} }, cloudVolume: { wanted: false, enabled: true }, clouds: { mesh: { visible: false } }, pollen: { mesh: { visible: false }, setShare() {} }, rig: { pos: { x: 0, y: 0, z: 0 } } };
    const was = {}, takenAt = {}; let flips = 0, switches = 0, lastT = 0;
    const walking = (t) => t < 150;
    const { g } = sharp10({ seconds: 180, scene: wood, known: { 'sharp:haven:2': 4 },
      cost: (mp, g, t, gauss) => 29 + 0.3 * mp + 1.0 * gauss() + (t % 30 > 18 && t % 30 < 28 && t < 150 ? 8 : 0) - (g.isOff('trees-far') ? 6 : 0) - (g.isOff('tree-leaves') ? 9 : 0),
      events: (t, g, app) => {
        // (1.4 m/s back and forth along 80 m)
        if (walking(t)) { const s = (1.4 * t) % 160; app.rig.pos.x = s < 80 ? s : 160 - s; }
        lastT = t;
        for (const id of HOLD) {
          const off = g.isOff(id);
          if (was[id] != null && off !== was[id]) {
            switches++;
            if (off) takenAt[id] = app.rig.pos.x;
            else if (walking(t) && Math.abs(app.rig.pos.x - (takenAt[id] ?? 1e9)) < 150) flips++;
          }
          was[id] = off;
        }
      } });
    const left = HOLD.filter((id) => g.isOff(id));
    console.log(`Tenth results (9): walking in a wood with dense stretches: ${switches} switches of savings that change shadows, ${flips} of them back on near where they went off while walking; left off after standing 30 s: ${left.join(', ') || 'none'}`);
    if (flips) fail(`${flips} times the shadows in view were switched back while the traveller walked among them`);
    if (left.length) fail(`left off for good: ${left.join(', ')}`);
  }
  console.log(failed10 ? `\nTenth results: ${failed10} FAILED` : '\nTenth results: all passed');
  if (failed10) process.exitCode = 1;
}
