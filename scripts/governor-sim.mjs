// Simulates the governor against pretend GPUs (frame cost = fixed + per-pixel x pixels) on
// 60 and 120 Hz screens: does it settle, come down fast, climb back, and ignore terrain
// uploads?   node scripts/governor-sim.mjs
// Each line of the trace is time:megapixels (fN = N feature steps down), every 5 s.
import { Governor, FRAME, FEATURE_STEPS } from '../src/perf/governor.js';
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
