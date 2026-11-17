// Stability test: three consecutive frames at several stations along short scripted
// moves, on the ground and in flight. Consecutive frames should differ only by the
// camera's own small motion; anything that pops, crawls, shimmers or sparkles shows up
// as a difference that is large, or that appears in the middle frame only.
//   node scripts/stability.mjs [--dist] [--out docs/shots/stability] [--only walk,orbit] [--stations 3]
// With --only, the rows of the other moves in an existing report.json are kept.
// For every move it saves a strip per station (frame 1 | frame 2 | frame 3 | amplified
// difference) and prints two numbers:
//   changed  share of pixels that change by more than 6 % of full scale between frames
//   flicker  share of pixels where the middle frame disagrees with both neighbours while
//            they agree with each other (a one-frame sparkle or pop)
// Look at the strips: the numbers only say where to look.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';
import { decodePNG, encodePNG } from './lib/png.mjs';

// step = what the camera does between two consecutive frames (one 60th of a second of
// that motion); stride = how far it travels between stations, in the same units.
const MOVES = [
  { id: 'mars_walk', world: 'mars', shot: 'ledge', query: '', step: { fwd: 0.055 }, stride: 160 },
  { id: 'mars_turn', world: 'mars', shot: 'ledge', query: '', step: { yaw: 0.25 }, stride: 90 },
  { id: 'mars_wall_tele', world: 'mars', shot: 'wall', query: '', step: { yaw: 0.05 }, stride: 60 },
  { id: 'mars_low_flight', world: 'mars', shot: 'ledge', query: 'hero=1&alt=900', step: { fwd: 3 }, stride: 120 },
  { id: 'mars_high_flight', world: 'mars', shot: 'ledge', query: 'alt=60000&pitch=-30', step: { fwd: 700 }, stride: 40 },
  { id: 'mars_orbit', world: 'mars', shot: 'ledge', query: 'alt=400000&pitch=-25', step: { fwd: 5000 }, stride: 30 },
  { id: 'moon_walk', world: 'moon', shot: 'ship', query: '', step: { fwd: 0.055 }, stride: 160 },
  { id: 'moon_low_flight', world: 'moon', shot: 'ledge', query: 'hero=1&alt=600', step: { fwd: 3 }, stride: 120 },
  { id: 'moon_orbit', world: 'moon', shot: 'ledge', query: 'alt=120000&pitch=-25', step: { fwd: 2000 }, stride: 30 },
];
const STATIONS = Number(opt('stations', '3'));
const out = path.resolve(root, opt('out', 'docs/shots/stability')), only = opt('only', '');
await mkdir(out, { recursive: true });
const { base, page, problems, snap, goto, close } = await open({ dist: flag('dist') });

const ready = (minFrame) => page.waitForFunction((n) => (window.__shotReady === true && window.__app.frameCount >= n) || window.__shotError, minFrame, { timeout: 240000, polling: 250 })
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

const lum = (img, i) => 0.2126 * img.rgb[i * 3] + 0.7152 * img.rgb[i * 3 + 1] + 0.0722 * img.rgb[i * 3 + 2];
const wanted = (m) => !only || only.split(',').some((k) => m.id.includes(k));
let report = [];
try { if (only) report = JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8')).filter((r) => !wanted({ id: r.move })); } catch { /* no earlier report */ }
for (const m of MOVES) {
  if (!wanted(m)) continue;
  await goto(`${base}?world=${m.world}&shot=${m.shot}${m.query ? '&' + m.query : ''}`);
  await ready(8);
  for (let s = 0; s < STATIONS; s++) {
    const frames = [];
    for (let f = 0; f < 3; f++) {
      const n = await move(m.step, f === 0 ? (s === 0 ? 0 : m.stride) : 1);
      await ready(n + 6);
      const file = path.join(out, `_${m.id}_${s}_${f}.png`);
      await snap(file);
      frames.push(decodePNG(await readFile(file)));
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
    await writeFile(path.join(out, `${m.id}_${s}.png`), encodePNG(W * 4, H, strip));
    const row = { move: m.id, station: s, changed: +(100 * changed / N).toFixed(2), flicker: +(100 * flicker / N).toFixed(3), worst: Math.round(worst) };
    report.push(row);
    console.log(`${m.id} station ${s}: changed ${row.changed} %  flicker ${row.flicker} %  largest change ${row.worst}/255`);
  }
}
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
await close();
// the single frames were only needed to build the strips
const { readdir, unlink } = await import('node:fs/promises');
for (const f of await readdir(out)) if (f.startsWith('_')) await unlink(path.join(out, f));
console.log(problems.length ? `browser problems:\n  ${problems.join('\n  ')}` : 'done — look at the strips in ' + out);
