// Stability test: three frames at several stations along short scripted moves, on the
// ground and in flight. Two kinds of run:
//
//   settled (the default)   Each of the three frames is one small camera step after the
//       last and is taken once the scene has SETTLED again (terrain idle, rocks placed,
//       exposure steady), so the frames are 6 or more rendered frames apart, not
//       consecutive. It shows what crawls, shimmers or sparkles in a finished picture as
//       the camera creeps (aliasing). It cannot show a chunk popping in while the terrain
//       streams, nor a fault that alternates frame by frame.
//   --streaming   Three truly consecutive rendered frames taken straight after the jump to
//       each station, without waiting for anything: chunks, rocks and fades are still
//       arriving. The page's animation frames are held back by this script and let
//       through one at a time, each with a fixed 1/60 s step. This is the run that shows
//       pops; finer detail arriving is an honest change, so look at the strips.
//
//   node scripts/stability.mjs [--streaming] [--dist] [--out docs/shots/stability] [--only walk,orbit] [--stations 3]
// With --only, the rows of the other moves in an existing report.json are kept; the rows
// of the other kind of run are always kept.
// For every move it saves a strip per station (frame 1 | frame 2 | frame 3 | amplified
// difference; streaming strips are named <move>_stream_<station>.png) and prints two numbers:
//   changed  share of pixels that change by more than 6 % of full scale between frames
//   flicker  share of pixels where the middle frame disagrees with both neighbours while
//            they agree with each other (a one-frame sparkle or pop)
// Look at the strips: the numbers only say where to look.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';
import { decodePNG, encodePNG } from './lib/png.mjs';
import { WORLDS } from '../src/worlds/index.js';

// step = what the camera does between two frames; stride = how far it travels between
// stations, in steps. Steps are kept to about a pixel of image motion: slow motion is
// what shows crawling and shimmer, and a pop shows at any speed, while a fast move only
// fills the difference picture with honest motion.
const MOVES = [
  { id: 'mars_walk', world: 'mars', shot: 'ledge', query: '', step: { fwd: 0.055 }, stride: 160 },
  { id: 'mars_turn', world: 'mars', shot: 'ledge', query: '', step: { yaw: 0.06 }, stride: 300 },
  { id: 'mars_wall_tele', world: 'mars', shot: 'wall', query: '', step: { yaw: 0.05 }, stride: 60 },
  { id: 'mars_low_flight', world: 'mars', shot: 'ledge', query: 'hero=1&alt=900', step: { fwd: 1 }, stride: 300 },
  { id: 'mars_high_flight', world: 'mars', shot: 'canyon', query: 'alt=60000&pitch=-30', step: { fwd: 150 }, stride: 150 },
  { id: 'mars_orbit', world: 'mars', shot: 'canyon', query: 'alt=400000&pitch=-25', step: { fwd: 800 }, stride: 150 },
  { id: 'moon_walk', world: 'moon', shot: 'ship', query: '', step: { fwd: 0.055 }, stride: 160 },
  { id: 'moon_turn', world: 'moon', shot: 'ledge', query: '', step: { yaw: 0.06 }, stride: 300 },
  { id: 'moon_low_flight', world: 'moon', shot: 'ledge', query: 'hero=1&alt=600', step: { fwd: 1 }, stride: 300 },
  { id: 'moon_orbit', world: 'moon', shot: 'ledge', query: 'alt=120000&pitch=-25', step: { fwd: 250 }, stride: 150 },
  // (Earth: slow here, ten minutes a station and more; run them by name. The forest from
  // 370 m: the canopy's crowns, the far trees and the clouds' shadows as the camera creeps.)
  // (Haven from the air: its made land, the lake, clouds and their shadows as the camera creeps)
  { id: 'haven_flight', world: 'haven', shot: 'ledge', query: 'alt=9000&pitch=-16&t=2', step: { fwd: 6 }, stride: 300, slow: true },
  // (Haven on foot through the opening meadow: the blades, the clumps beyond them and the
  // ground's own grass, where each field gives way to the next, as the traveller walks)
  { id: 'haven_meadow_walk', world: 'haven', shot: 'ledge', query: 'lat=-54.4271&lon=39.2697&heading=120&t=5&pitch=-3', step: { fwd: 0.055 }, stride: 160, slow: true },
  // (Haven on foot, walking at a wood: the far forest's trees grow in as they are come at,
  // and the line where the trees one walks among take over from them must not show)
  // (0.4 m a frame: a tree or two crosses the 240 m line at every step, and the wood's
  // image hardly moves; the grass at one's feet does, so judge the strips' upper half)
  { id: 'haven_treeline', world: 'haven', shot: 'ledge', query: 'lat=-27.114&lon=51.987&heading=0&pitch=-3', step: { fwd: 0.4 }, stride: 100, slow: true },
  { id: 'earth_forest_flight', world: 'earth', shot: 'ledge', query: 'lat=36.3&lon=247.9&alt=3000&heading=0&pitch=-25&t=5', step: { fwd: 1.5 }, stride: 300, slow: true },
];
// The list above is tuned by hand for the worlds it names. A world in the registry that
// it does not mention still gets tested: a walk, a turn, a low flight and an orbit from
// its first bookmark, sized from its radius. And a move that names a world or bookmark
// that no longer exists stops the run instead of quietly testing nothing.
for (const [id, w] of Object.entries(WORLDS)) {
  if (MOVES.some((m) => m.world === id)) continue;
  const shot = Object.keys(w.scene.bookmarks)[0], alt = Math.round(0.1 * w.radius);
  console.log(`no hand-tuned moves for "${id}": using a default walk, turn, low flight and orbit from its "${shot}" bookmark`);
  MOVES.push(
    { id: `${id}_walk`, world: id, shot, query: '', step: { fwd: 0.055 }, stride: 160 },
    { id: `${id}_turn`, world: id, shot, query: '', step: { yaw: 0.06 }, stride: 300 },
    { id: `${id}_low_flight`, world: id, shot, query: 'hero=1&alt=700', step: { fwd: 1 }, stride: 300 },
    { id: `${id}_orbit`, world: id, shot, query: `alt=${alt}&pitch=-25`, step: { fwd: Math.round(alt / 500) }, stride: 150 },
  );
}
for (const m of MOVES) {
  if (!WORLDS[m.world]?.scene.bookmarks[m.shot]) { console.log(`move ${m.id}: there is no bookmark "${m.shot}" on world "${m.world}" (see src/worlds/)`); process.exit(1); }
}
const STATIONS = Number(opt('stations', '3'));
const out = path.resolve(root, opt('out', 'docs/shots/stability')), only = opt('only', '');
await mkdir(out, { recursive: true });
const STREAMING = flag('streaming'), PASS = STREAMING ? 'streaming' : 'settled';
const { base, page, problems, snap, goto, close } = await open({ dist: flag('dist') });
if (STREAMING) {
  // Holds the page's animation frames back so that this script can let exactly one through
  // at a time. While window.__frameGoal is null everything runs as usual; once it is a
  // number, callbacks wait until the game's frame counter is below it, and get a clock
  // that advances 1/60 s per frame let through (so the game's time step is fixed).
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    let clock = 0, lastT = -1;
    window.__frameGoal = null;
    const gated = (cb) => raf((t) => {
      if (window.__frameGoal === null || !window.__app) { clock = t; return cb(t); }
      if (window.__app.frameCount >= window.__frameGoal) return gated(cb);        // held: ask again at the next refresh
      if (t !== lastT) { lastT = t; clock += 1000 / 60; }
      cb(clock);
    });
    window.requestAnimationFrame = gated;
  });
}
// (streaming) stop the frames / let exactly one more be drawn and wait until it has been
const holdFrames = () => page.evaluate(() => { window.__frameGoal = window.__app.frameCount; });
const oneFrame = async () => {
  const goal = await page.evaluate(() => ++window.__frameGoal);
  await page.waitForFunction((g) => window.__app.frameCount >= g, goal, { timeout: 240000, polling: 100 });
  const now = await page.evaluate(() => window.__app.frameCount);
  if (now !== goal) throw new Error(`asked for frame ${goal}, the game is at ${now}: the frames are not being held`);
};

const ready = (minFrame) => page.waitForFunction((n) => (window.__shotReady === true && window.__app.frameCount >= n) || window.__shotError, minFrame, { timeout: 900000, polling: 250 })
  .catch(async () => { console.log(`  not ready in time (waiting for: ${await page.evaluate(() => window.__stats?.wait || '?')}), using what is on screen`); });
const move = (step, times) => page.evaluate(({ step, times }) => {
  const a = window.__app, r = a.rig;
  if (step.fwd) {
    // along the view direction in flight, along the ground when walking
    if (r.mode === 'walk') { const h = r.heading * Math.PI / 180; r.offsetMetres(Math.sin(h) * step.fwd * times, Math.cos(h) * step.fwd * times, 1.7); }
    else { r.pos.addScaledVector(r.forward, step.fwd * times); r.agl = 0; }
  }
  if (step.yaw) r.heading = (r.heading + step.yaw * times + 360) % 360;
  return a.frameCount;
}, { step, times });
// Screenshot mode sets exposure instantly from each frame's metering, which would turn a
// 2 % metering difference into a frame-wide brightness step that play never shows
// (there exposure glides). So exposure is held for the three frames of a station.
const holdExposure = (on) => page.evaluate((on) => {
  const p = window.__app.post, s = p.settings;
  if (on && !p._held) { p._held = [s.min, s.max]; s.min = s.max = p.exposure; }
  if (!on && p._held) { [s.min, s.max] = p._held; p._held = null; }
}, on);

const lum = (img, i) => 0.2126 * img.rgb[i * 3] + 0.7152 * img.rgb[i * 3 + 1] + 0.0722 * img.rgb[i * 3 + 2];
// (a move marked slow runs only when it is named)
const wanted = (m) => (only ? only.split(',').some((k) => m.id.includes(k)) : !m.slow);
// Rows kept from an earlier report: the other kind of run, and with --only this kind's
// other moves. (Rows written before the two kinds existed are settled ones.)
let report = [];
try { report = JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8')).filter((r) => (r.pass || 'settled') !== PASS || (only && !wanted({ id: r.move }))); } catch { /* no earlier report */ }
let failed = false;
for (const m of MOVES) {
  if (!wanted(m)) continue;
  await goto(`${base}?world=${m.world}&shot=${m.shot}${m.query ? '&' + m.query : ''}`);
  await ready(8);
  if (STREAMING) await holdFrames();
  for (let s = 0; s < STATIONS; s++) {
    const frames = [], busy = [];
    await holdExposure(false);
    try {
      for (let f = 0; f < 3; f++) {
        if (STREAMING) {
          // the jump to the station (also for the first one: something must be arriving),
          // then one camera step per rendered frame, waiting for nothing
          await move(m.step, f === 0 ? m.stride : 1);
          await oneFrame();
          busy.push(await page.evaluate(() => (window.__stats?.wait || '').trim() || 'settled'));
        } else {
          const n = await move(m.step, f === 0 ? (s === 0 ? 0 : m.stride) : 1);
          await ready(n + 6);
        }
        if (f === 0) await holdExposure(true);
        const file = path.join(out, `_${m.id}_${s}_${f}.png`);
        await snap(file);
        frames.push(decodePNG(await readFile(file)));
      }
    } catch (e) {
      console.log(`${m.id} station ${s}: FAILED — ${String(e).split('\n')[0]}`);
      failed = true;
      break;
    }
    const { width: W, height: H } = frames[0], N = W * H;
    let changed = 0, flicker = 0, worst = 0;
    const strip = new Uint8Array(W * 4 * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, a = lum(frames[0], i), b = lum(frames[1], i), c = lum(frames[2], i);
      const d = Math.max(Math.abs(b - a), Math.abs(c - b)), mid = Math.min(Math.abs(b - a), Math.abs(b - c)), ends = Math.abs(a - c);
      if (d > 15) changed++;
      const fl = mid > 12 && ends < mid * 0.5;
      if (fl) flicker++;
      worst = Math.max(worst, d);
      for (let k = 0; k < 3; k++) {
        const o = (y * W * 4 + x) * 3;
        for (let c2 = 0; c2 < 3; c2++) strip[o + k * W * 3 + c2] = frames[k].rgb[i * 3 + c2];
      }
      const o = (y * W * 4 + x + 3 * W) * 3, v = Math.min(255, d * 6);
      strip[o] = fl ? 255 : v; strip[o + 1] = fl ? 40 : v; strip[o + 2] = fl ? 40 : v;       // flicker in red
    }
    await writeFile(path.join(out, `${m.id}${STREAMING ? '_stream' : ''}_${s}.png`), encodePNG(W * 4, H, strip));
    const row = { move: m.id, pass: PASS, station: s, changed: +(100 * changed / N).toFixed(2), flicker: +(100 * flicker / N).toFixed(3), worst: Math.round(worst) };
    if (STREAMING) row.arriving = busy;         // what was still on its way at each frame
    report.push(row);
    console.log(`${m.id} station ${s} (${PASS}): changed ${row.changed} %  flicker ${row.flicker} %  largest change ${row.worst}/255${STREAMING ? '  still arriving: ' + busy.join(' | ') : ''}`);
  }
}
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
await close();
// the single frames were only needed to build the strips
const { readdir, unlink } = await import('node:fs/promises');
for (const f of await readdir(out)) if (f.startsWith('_')) await unlink(path.join(out, f));
console.log(STREAMING
  ? 'These were consecutive frames while the scene streamed in.'
  : 'These were settled frames one camera step apart: pops while the terrain streams and frame-by-frame alternation are NOT covered (run with --streaming).');
console.log(problems.length ? `browser problems:\n  ${problems.join('\n  ')}` : 'done — look at the strips in ' + out);
if (failed) { console.log('some stations could not be taken — see FAILED above'); process.exit(1); }
