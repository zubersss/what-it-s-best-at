// The benchmark: a scripted run that plays the game by itself and measures it.
//
// One lap is 3 minutes: every bookmark on Mars (hold, look around, fly forward), the
// flight from Mars up to orbit, across to the Moon and down, then every lunar bookmark.
// The 10-minute soak repeats laps and also reports minute by minute, to show what heat
// does. The result is plain text the owner can copy and paste back.
import { WORLDS } from '../worlds/index.js';
import { Profile, PARTS } from './profile.js';
import { MODES, FEATURE_STEPS } from './governor.js';
import { latLonToDir } from '../core/ephemeris.js';
import { BUILD } from '../core/build.js';

const LAP = 180, STOP = 12, FLIGHT = 60;
// The routes: the first world's five views, a flight, the second world's five views.
// (haven: the made world of milestone 12, where the game now opens)
const ROUTES = { run: ['mars', 'moon'], soak: ['mars', 'moon'], earth: ['earth', 'moon'], haven: ['haven', 'moon'] };
const KIND_NAMES = { earth: 'Earth benchmark', haven: 'Haven benchmark' };

export class Benchmark {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.keys = new Set();
  }

  start(kind) {
    const app = this.app;
    this.kind = ROUTES[kind] ? kind : 'run';
    [this.first, this.second] = ROUTES[this.kind];
    this.duration = this.kind === 'soak' ? 600 : LAP;
    this.active = true;
    this.destination = this.second;                 // (the flight hands over to this world only: App.space)
    app.loadWorldData(WORLDS[this.second]).catch(() => {});      // its download is not part of the flight
    this.t0 = performance.now();
    this.phase = -1; this.lap = -1; this.busy = false; this.flight = 'climb';
    const cap = Math.ceil(this.duration * 125);
    this.dt = new Float32Array(cap); this.px = new Float32Array(cap); this.at = new Float32Array(cap); this.part = new Uint8Array(cap);
    this.sc = new Float32Array(cap); this.ph = new Uint8Array(cap); this.up = new Uint8Array(cap);        // the page's own work per frame (ms); which stop of the route (0-4, 5 = flight, 6-10)
    // where the page's own work goes, per stop (perf/profile.js: the parts of a frame)
    this.pt = new Float64Array(11 * PARTS.length); this.ptLast = Float64Array.from(app.profile.total);
    this.cost = null; this.costLines = null;
    this.rebakesFrom = app.terrain.rebakes || 0;
    this.n = 0;
    this.hitches = [];
    this.maxCalls = 0; this.maxTris = 0;
    this.stepsFrom = app.governor.log.length; this.hiddenFrom = app.hiddenCount;
    // terrain patches built and the time they took, per world (the counters only grow)
    this.lastBuilt = app.terrain.built; this.lastBuildMs = app.terrain.buildMs;
    this.builds = { [this.first]: [0, 0], [this.second]: [0, 0] };
    this.maxGpuBytes = 0;
    // the first five bookmarks of each world: its main scene (the rest are landmarks, not benchmarked)
    this.names = { [this.first]: Object.keys(WORLDS[this.first].scene.bookmarks).slice(0, 5), [this.second]: Object.keys(WORLDS[this.second].scene.bookmarks).slice(0, 5) };
    app.setHero(true);
  }

  stop() { if (this.active) this._finish(true); }

  // One line for the banner.
  get status() {
    const t = Math.min(this.duration, (performance.now() - this.t0) / 1000), mmss = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
    const p = this.phase;
    const where = p < 0 ? '' : p < 5 ? `${WORLDS[this.first].name} · ${this.names[this.first][p]}` : p === 5 ? `flight to ${WORLDS[this.second].name}` : `${WORLDS[this.second].name} · ${this.names[this.second][p - 6]}`;
    if (this.cost) return `Benchmark · measuring what each thing costs · ${this.cost.status}`;
    return `${this.kind === 'soak' ? 'Soak test' : KIND_NAMES[this.kind] || 'Benchmark'} ${mmss(t)} / ${mmss(this.duration)} · ${where}`;
  }

  key(code, down) {
    if (down === this.keys.has(code)) return;
    if (down) { this.keys.add(code); this.app.input.virtualDown(code); } else { this.keys.delete(code); this.app.input.virtualUp(code); }
  }
  releaseAll() { for (const k of [...this.keys]) this.key(k, false); }

  // Makes `id` the current world (if it is not), then jumps to one of its bookmarks.
  async goto(id, bookmark) {
    const app = this.app;
    this.busy = true;
    try {
      while (app.switching) await new Promise((r) => setTimeout(r, 30));
      if (app.world.id !== id) await app.switchWorld(WORLDS[id]);
      if (this.active) app.applyBookmark(bookmark);
    } finally { this.busy = false; }
  }

  // Called once per rendered frame, before the camera moves. dtMs = last frame's time.
  update(dtMs, cause) {
    if (!this.active) return;
    const app = this.app, rig = app.rig;
    // (after the lap: what each thing costs to draw, see CostTest)
    if (this.cost) { if (!this.cost.update()) { this.costLines = this.cost.lines; this.cost = null; this._finish(false); } return; }
    const t = (performance.now() - this.t0) / 1000;
    // --- record
    if (this.n < this.dt.length && t > 0.5) {
      this.dt[this.n] = dtMs; this.px[this.n] = app.post.viewW * app.post.viewH; this.at[this.n] = t;
      this.part[this.n] = this.phase < 0 ? 0 : this.phase < 5 ? 0 : this.phase === 5 ? 1 : 2;
      this.sc[this.n] = app.scriptMs || 0; this.ph[this.n] = Math.max(0, this.phase); this.up[this.n] = Math.min(255, app.lastUploads || 0);
      { const tot = app.profile.total, o = Math.max(0, this.phase) * PARTS.length; for (let i = 0; i < PARTS.length; i++) { this.pt[o + i] += tot[i] - this.ptLast[i]; this.ptLast[i] = tot[i]; } }
      this.n++;
      if (dtMs > 100) this.hitches.push({ t: +t.toFixed(1), ms: Math.round(dtMs), cause });
      this.maxCalls = Math.max(this.maxCalls, app.stats.calls || 0); this.maxTris = Math.max(this.maxTris, app.stats.triangles || 0);
    }
    const b = this.builds[app.world.id];
    if (b) { b[0] += Math.max(0, app.terrain.built - this.lastBuilt); b[1] += Math.max(0, app.terrain.buildMs - this.lastBuildMs); }
    this.lastBuilt = app.terrain.built; this.lastBuildMs = app.terrain.buildMs;
    if (this.n % 60 === 1) this.maxGpuBytes = Math.max(this.maxGpuBytes, app.gpuBytes);
    if (t >= this.duration) {
      if (this.kind === 'soak') { this._finish(false); return; }
      this.releaseAll(); this.cost = new CostTest(this); return;
    }

    // --- script
    const lap = Math.floor(t / LAP), lt = t - lap * LAP;
    const phase = lt < 5 * STOP ? Math.floor(lt / STOP) : lt < 5 * STOP + FLIGHT ? 5 : Math.min(10, 6 + Math.floor((lt - 5 * STOP - FLIGHT) / STOP));
    const u = phase < 5 ? lt - phase * STOP : phase === 5 ? lt - 5 * STOP : lt - 5 * STOP - FLIGHT - (phase - 6) * STOP;
    if (phase !== this.phase || lap !== this.lap) {
      this.phase = phase; this.lap = lap;
      this.releaseAll();
      if (phase < 5) this.goto(this.first, this.names[this.first][phase]);
      else if (phase === 5) { this.flight = 'climb'; this.goto(this.first, this.names[this.first][0]); }
      else this.goto(this.second, this.names[this.second][phase - 6]);
      return;
    }
    if (this.busy) return;
    const dt = Math.min(dtMs, 100) / 1000;
    if (phase !== 5) {
      // hold 4 s, look around 4 s, fly forward 4 s
      if (u >= 4 && u < 8) rig.heading = (rig.heading + 15 * dt + 360) % 360;
      this.key('KeyW', u >= 8);
      return;
    }
    // --- the flight: climb to orbit, cross to the other world, come down toward its start site
    const other = WORLDS[this.second];
    this.key('KeyW', true);
    if (this.flight === 'climb') {
      rig.pitch += (72 - rig.pitch) * Math.min(1, dt * 2);
      if (rig.agl > 1.2e6 || u > 17) this.flight = 'cruise';
    } else if (this.flight === 'cruise') {
      if (app.world.id === this.second) { this.flight = 'descend'; return; }
      app.aimAt(other.body);
      this.key('ShiftLeft', true);
      if (u > 38 && !app.switching) {                      // safety net: never get lost in space
        this.busy = true;
        app.switchWorld(other).then(() => {
          const d = latLonToDir(other.scene.start.lat, other.scene.start.lon), r = other.radius * 1.6;
          rig.pos.set(d[0] * r, d[1] * r, d[2] * r); rig.agl = 0; rig.velocity.set(0, 0, 0);
        }).finally(() => { this.busy = false; });
      }
    } else {
      // Follow the curve of the ground toward the site, lower as it gets nearer.
      const st = other.scene.start, d = latLonToDir(st.lat, st.lon), p = rig.pos, pl = p.length();
      const theta = Math.acos(Math.max(-1, Math.min(1, (p.x * d[0] + p.y * d[1] + p.z * d[2]) / pl)));
      const ahead = Math.min(theta, 0.3), sinT = Math.max(1e-6, Math.sin(theta));
      const a = Math.sin(theta - ahead) / sinT, b = Math.sin(ahead) / sinT;
      let wx = a * p.x / pl + b * d[0], wy = a * p.y / pl + b * d[1], wz = a * p.z / pl + b * d[2];
      const wl = Math.hypot(wx, wy, wz) || 1; wx /= wl; wy /= wl; wz /= wl;
      const r = other.radius + app.hs.height(wx, wy, wz, 200) + Math.max(30, (theta - ahead) * other.radius * 0.3);
      rig.lookAlong(p.clone().multiplyScalar(-1).add({ x: wx * r, y: wy * r, z: wz * r }));
      this.key('ShiftLeft', rig.agl > 3e5 || theta * other.radius > 3e5);
      this.key('KeyW', theta * other.radius > 30 || rig.agl > 60);
    }
  }

  _finish(stopped) {
    this.active = false;
    if (this.cost) { this.cost.restore(); this.costLines = this.cost.lines; this.cost = null; }
    this.releaseAll();
    this.app.onBenchmarkDone(this.report(stopped));
  }

  report(stopped) {
    const app = this.app, g = app.governor, n = this.n;
    const dts = Array.from(this.dt.subarray(0, n)), total = dts.reduce((a, b) => a + b, 0) / 1000;
    const fps = (arr) => (arr.length ? 1000 * arr.length / arr.reduce((a, b) => a + b, 0) : 0);
    const sorted = dts.slice().sort((a, b) => b - a);
    const worst1 = sorted.slice(0, Math.max(1, Math.ceil(n / 100)));
    const px = Array.from(this.px.subarray(0, n));
    const avgPx = px.reduce((a, b) => a + b, 0) / Math.max(1, n), minPx = px.reduce((a, b) => Math.min(a, b), Infinity);
    const post = app.post, aspect = post.width / post.height;
    const dims = (p) => `${Math.round(Math.sqrt(p * aspect))}x${Math.round(Math.sqrt(p / aspect))}`;
    const mp = (p) => (p / 1e6).toFixed(2) + ' MP';
    const part = (k) => fps(dts.filter((_, i) => this.part[i] === k));
    const steps = g.log.slice(this.stepsFrom);
    const down = steps.filter((s) => s.text.startsWith('resolution down')).length, up = steps.filter((s) => s.text.startsWith('resolution up')).length;
    const off = steps.filter((s) => s.text.startsWith('off:')).length, on = steps.filter((s) => s.text.startsWith('back on:')).length;
    const builds = [this.first, this.second].map((id) => { const [k, ms] = this.builds[id]; return `${WORLDS[id].name} ${k}${k ? ` (${(ms / k).toFixed(0)} ms each)` : ''}`; }).join(', ');
    const L = [];
    L.push(`SOLAR SYSTEM EXPLORER — ${this.kind === 'soak' ? '10-minute soak' : KIND_NAMES[this.kind] ? '3-minute ' + KIND_NAMES[this.kind] : '3-minute benchmark'}${stopped ? ' (stopped early)' : ''}`);
    L.push(`build ${BUILD.commit} · mode ${MODES[g.mode].label} (target ${Math.round(g.targetFps)} fps) · ran ${total.toFixed(0)} s, ${n} frames`);
    const target = 1000 / g.targetFps, late = dts.filter((d) => d > target * 1.5).length;
    L.push(`average fps ${fps(dts).toFixed(1)} · 1% low ${fps(worst1).toFixed(1)} · worst frame ${Math.round(sorted[0] || 0)} ms · late frames (over 1.5x the target) ${late} = ${(100 * late / Math.max(1, n)).toFixed(2)} %`);
    L.push(`render resolution: average ${mp(avgPx)} (${dims(avgPx)}) · minimum ${mp(minPx)} (${dims(minPx)}) · native ${mp(g.nativePixels)} (${post.width}x${post.height})`);
    L.push(`by part: ${WORLDS[this.first].name} ${part(0).toFixed(1)} fps · flight ${part(1).toFixed(1)} · ${WORLDS[this.second].name} ${part(2).toFixed(1)}`);
    // The page's own work per frame (everything but the GPU drawing it): tells slow pixels
    // from slow work. And each stop of the route on its own.
    const sc = Array.from(this.sc.subarray(0, n)), scSorted = sc.slice().sort((a, b) => b - a);
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    L.push(`the page's own work per frame: average ${avg(sc).toFixed(1)} ms · worst 1 % ${avg(scSorted.slice(0, Math.max(1, Math.ceil(n / 100)))).toFixed(1)} ms (a frame has ${target.toFixed(1)} ms)`);
    L.push('by stop (fps · late frames · own work · resolution):');
    for (let k = 0; k <= 10; k++) {
      const idx = []; for (let i = 0; i < n; i++) if (this.ph[i] === k) idx.push(i);
      if (!idx.length) continue;
      const name = k < 5 ? `${WORLDS[this.first].name} ${this.names[this.first][k]}` : k === 5 ? 'flight' : `${WORLDS[this.second].name} ${this.names[this.second][k - 6]}`;
      const d = idx.map((i) => dts[i]);
      L.push(`  ${name}: ${fps(d).toFixed(1)} · ${(100 * d.filter((x) => x > target * 1.5).length / d.length).toFixed(1)} % · ${avg(idx.map((i) => sc[i])).toFixed(1)} ms · ${mp(avg(idx.map((i) => px[i])))}`);
      // (the three largest parts of that work, ms a frame)
      L.push(`      ${Profile.text(Array.from(this.pt.subarray(k * PARTS.length, (k + 1) * PARTS.length), (v) => v / idx.length), 0.2).split(' · ').slice(0, 4).join(' · ')}`);
    }
    // Frames that took in new terrain against the rest (is it the arriving ground that is
    // late?), and how many screen refreshes the frames took.
    {
      let nu = 0, lu = 0, lo = 0;
      for (let i = 0; i < n; i++) { const l = dts[i] > target * 1.5; if (this.up[i]) { nu++; if (l) lu++; } else if (l) lo++; }
      L.push(`frames that took in new terrain: ${(100 * nu / Math.max(1, n)).toFixed(0)} % of all · late among them ${(100 * lu / Math.max(1, nu)).toFixed(1)} % · late among the rest ${(100 * lo / Math.max(1, n - nu)).toFixed(1)} %`);
      const v = g.vsync || 16.7, want = Math.max(1, Math.round(target / v)), bins = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) bins[Math.min(3, Math.max(0, Math.round(dts[i] / v) - want))]++;
      L.push(`frame lengths in screen refreshes (${v.toFixed(1)} ms each): ${bins.map((c, k) => `${want + k}${k === 3 ? '+' : ''}: ${(100 * c / Math.max(1, n)).toFixed(1)} %`).join(' · ')}`);
    }
    if (this.kind === 'soak') {
      L.push('minute by minute (fps, resolution):');
      const minutes = Math.ceil(this.duration / 60);
      for (let m = 0; m < minutes; m++) {
        // (the frame that crosses the finish line belongs to the last minute)
        const idx = []; for (let i = 0; i < n; i++) if (Math.min(minutes - 1, Math.floor(this.at[i] / 60)) === m) idx.push(i);
        if (!idx.length) continue;
        const f = fps(idx.map((i) => dts[i])), p = idx.reduce((a, i) => a + px[i], 0) / idx.length;
        L.push(`  ${String(m + 1).padStart(2)}: ${f.toFixed(1)} fps, ${mp(p)}`);
      }
    }
    L.push(`quality steps: ${steps.length} (resolution down ${down}, up ${up}; features off ${off}, back on ${on}) · ended at ${g.summary}`);
    // (what the governor has taken for the device's own share of late frames, and how often
    // it put quality back after steps down that cured nothing)
    L.push(`late frames taken as the device's own: ${(100 * (g.bg || 0)).toFixed(1)} % · quality put back after steps that cured nothing: ${steps.filter((x) => /did not cure/.test(x.text)).length} times`);
    for (const s of steps.slice(0, 30)) L.push(`  ${s.t}s ${s.text}`);
    if (steps.length > 30) L.push(`  … ${steps.length - 30} more`);
    // Hitches: how many per cause, then the worst ones in the order they happened.
    const byCause = new Map();
    for (const h of this.hitches) { const k = h.cause.replace(/ \(.*\)$/, ''); byCause.set(k, (byCause.get(k) || 0) + 1); }
    const causes = [...byCause].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${c}`).join(', ');
    L.push(`hitches over 100 ms: ${this.hitches.length}${causes ? ` — ${causes}` : ''}`);
    const worst = this.hitches.slice().sort((a, b) => b.ms - a.ms).slice(0, 15).sort((a, b) => a.t - b.t);
    for (const h of worst) L.push(`  ${h.t}s ${h.ms} ms — ${h.cause}`);
    if (this.hitches.length > worst.length) L.push(`  (the ${worst.length} longest are listed)`);
    L.push(`most at once: ${this.maxCalls} draw calls, ${Math.round(this.maxTris / 1000)}k triangles, about ${Math.round(this.maxGpuBytes / 1048576)} MB of GPU memory`);
    // What each thing costs to draw, measured after the lap (CostTest).
    if (this.costLines?.length) { L.push(''); for (const l of this.costLines) L.push(l); L.push(''); }
    L.push(`terrain patches built: ${builds} · shadows re-baked: ${(app.terrain.rebakes || 0) - this.rebakesFrom} · patch cap at the end: ${app.terrain.maxChunks}`);
    L.push(`screen ${window.innerWidth}x${window.innerHeight} CSS px · pixel ratio ${(+(window.devicePixelRatio || 1).toFixed(3))} · refresh ${g.vsync ? Math.round(1000 / g.vsync) : '?'} Hz`);
    if (app.shaderErrors?.length) L.push(`SHADERS THAT FAILED ON THIS DEVICE: ${app.shaderErrors.length} — ${app.shaderErrors.join(' / ')}`);
    L.push(`GPU: ${app.gpuName}${g.gpuMs != null ? ` · GPU time ${g.gpuMs.toFixed(1)} ms` : ''}`);
    if (app.hiddenCount !== this.hiddenFrom) L.push('note: the page was in the background for part of this run, so the numbers are not reliable');
    L.push(navigator.userAgent);
    return L.join('\n');
  }
}

// What each thing costs to draw, measured on the device itself, after the lap. A frame's
// length on a phone is a whole number of screen refreshes: it says that the frame was too
// long, not by how much or because of what. Here the picture is held at one size, every
// saving the governor has is switched on alone in turn, and each frame is timed from its
// start until the GPU has finished drawing it (reading one pixel back waits for that).
// At the first world's opening view and at the views its world file lists (scene.costViews:
// { name, lat, lon, alt, heading, pitch }, the heaviest places it has).
const WARM = 5, TAKE = 16, HELD = 2.07e6;
// Whole parts of the picture left out, one at a time (configs -10 and below): what the
// savings cannot say. The fourth benchmark with a cost test showed a frame that took as
// long with every saving on and at any size: the cost was in none of the things a saving
// switches. "Nothing drawn" is what the measuring itself costs (the post chain and the
// pixel read back), to be taken off the rest.
const PARTS_OUT = [
  ['grass', (app, out) => app.grass?.setFraction(out ? 0 : 1)],
  ['trees', (app, out) => app.trees?.setFraction(out ? 0.02 : 1)],
  ['the far forest', (app, out) => app.farForest?.setFraction(out ? 0 : 1)],
  ['the figure', (app, out) => { app.heroScene.visible = !out; app.dustScene.visible = !out; }],
  // (the shadows of trees, rocks and the figure: drawn into their own maps before the picture)
  ['the shadow maps', (app, out) => { app.nearShadow.off = out; }],
  // (the ground in one flat tone: its triangles are still drawn, its shading is not)
  ["the ground's shading", (app, out) => { app.terrain.shared.uPlain.value = out ? 1 : 0; }],
  ['the ground and all on it', (app, out) => { app.nearScene.visible = !out; }],
  ['the sky', (app, out) => { app.farScene.visible = !out; }],
  // (the last pass over the canvas at the picture's size, as it now is, instead of the screen's: App.fitCanvas)
  ["the last pass at the picture's size, not the screen's", (app, out) => { app.canvasHold = out ? 'fit' : 'full'; }],
  ['everything', (app, out) => { app.nearScene.visible = app.farScene.visible = app.heroScene.visible = app.dustScene.visible = !out; }],
];
class CostTest {
  constructor(bench) {
    const app = bench.app, g = app.governor, w = WORLDS[bench.first];
    this.bench = bench; this.app = app; this.g = g;
    const b0 = bench.names[bench.first][0];
    this.views = [{ world: bench.first, name: `${w.name}, ${b0}`, bookmark: b0 }, ...(w.scene.costViews || []).map((v) => ({ world: bench.first, bookmark: b0, ...v, name: `${w.name}, ${v.name}` }))];
    // everything on, the governor still
    this.level = g.featureLevel; this.resLevel = g.resLevel; this.fixedBefore = g.fixed;
    for (let i = this.level - 1; i >= 0; i--) FEATURE_STEPS[i].apply(app, false);
    g.featureLevel = 0;
    const held = Math.min(1, Math.sqrt(HELD / g.nativePixels)), small = Math.min(1, Math.sqrt(1.0e6 / g.nativePixels));
    // [what is switched off (-1 nothing, -2 everything, else that step), the picture's scale]
    // (not the steps that draw fewer patches: the ground would have to settle again each time)
    // (everything on is measured again after every three savings: a frame grows slower over a
    // minute of this, from heat and from ground still arriving, and each saving is set against
    // the measures of "everything on" on either side of it, not against the first)
    const steps = FEATURE_STEPS.map((f, i) => i).filter((i) => !FEATURE_STEPS[i].id.startsWith('terrain-'));
    this.configs = [[-1, held]];
    steps.forEach((i, k) => { this.configs.push([i, held]); if (k % 3 === 2 || k === steps.length - 1) this.configs.push([-1, held]); });
    // (a part left out is set against "everything on" measured just before it)
    PARTS_OUT.forEach((p, k) => this.configs.push([-1, held], [-10 - k, held]));
    this.configs.push([-2, held], [-1, held], [-1, small], [-1, 1]);
    // (the canvas at the screen's own size while the parts are measured, so that the one
    // part that changes it is seen against the rest: App.fitCanvas)
    app.canvasHold = 'full';
    this.off = []; this.lines = []; this.px = new Uint8Array(4); this.vi = -1; this.state = 'settle';
    this._next();
  }

  get status() { const v = this.views[this.vi]; return `${v ? v.name : ''} ${this.state === 'settle' ? '(waiting for the ground)' : `${this.ci + 1}/${this.configs.length}`}`; }

  _next() {
    if (++this.vi >= this.views.length) return false;
    const v = this.views[this.vi];
    this._set(-1, this.configs[0][1]);
    this.state = 'settle'; this.placed = v.lat == null; this.t0 = performance.now(); this.ms = new Float32Array(this.configs.length);
    this.bench.goto(v.world, v.bookmark);
    return true;
  }

  // Switches on the one saving (or all, or none) and holds the picture at `scale`.
  _set(which, scale) {
    const app = this.app, g = this.g;
    for (const i of this.off) FEATURE_STEPS[i].apply(app, false);
    if (this.partOut != null) { PARTS_OUT[this.partOut][1](app, false); this.partOut = null; }
    if (which <= -10) { this.partOut = -10 - which; PARTS_OUT[this.partOut][1](app, true); }
    this.off = which === -2 ? FEATURE_STEPS.map((f, i) => i).filter((i) => !FEATURE_STEPS[i].id.startsWith('terrain-')) : which >= 0 ? [which] : [];
    for (const i of this.off) FEATURE_STEPS[i].apply(app, true);
    g.fixed = scale; g._applyScale();
  }

  _config(ci) { this.ci = ci; this._set(this.configs[ci][0], this.configs[ci][1]); this.state = 'measure'; this.k = 0; this.n = 0; this.sum = 0; }

  // Every frame, at its start. False when the test is over.
  update() {
    const app = this.app, now = performance.now(), v = this.views[this.vi];
    if (this.state === 'settle') {
      if (this.bench.busy || app.switching || app.world.id !== v.world) { this.t0 = now; return true; }
      if (!this.placed) {
        const rig = app.rig;
        rig.setLatLon(v.lat, v.lon, 1.7, v.heading ?? 0, v.pitch ?? 0);
        if (v.alt != null) { rig.pos.setLength(app.world.radius + v.alt); rig.onFoot = false; rig.hover = true; } else if (rig.mode === 'hero') rig.standUp();
        rig.velocity.set(0, 0, 0); app.jumpedAt = now; this.placed = true; this.t0 = now;
        return true;
      }
      const s = (now - this.t0) / 1000;
      if (s > 2.5 && (app.terrain.idle || s > 14)) this._config(0);
      return true;
    }
    // (a software renderer, a second a frame: two frames each tell as much)
    // (and it cannot wait for frames without new ground there: sixty frames at most here, six there)
    if (this.n >= (this.slow ? 2 : TAKE) || this.k >= (this.slow ? 6 : 60)) {
      this.ms[this.ci] = this.n ? this.sum / this.n : NaN;
      if (this.ci + 1 < this.configs.length) this._config(this.ci + 1);
      else { this._report(); if (!this._next()) { this.restore(); return false; } }
    }
    return true;
  }

  // Every frame, when all of it has been sent to be drawn. t0: when the frame's work began.
  frameDone(t0) {
    if (this.state !== 'measure') return;
    const gl = this.app.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px);          // (returns when the frame is drawn)
    const ms = performance.now() - t0;
    // (not the first frames after a change, nor a frame that took in new ground)
    this.slow = ms > 250;
    if (++this.k > (this.slow ? 1 : WARM) && (this.slow || !this.app.terrain.uploads)) { this.sum += ms; this.n++; }
  }

  _report() {
    const v = this.views[this.vi], g = this.g, c = this.configs, ms = this.ms, f = (x) => (isNaN(x) ? '?' : x.toFixed(1));
    const mp = (scale) => (g.nativePixels * scale * scale / 1e6).toFixed(2);
    const n = c.length, held = c[0][1], isOn = (k) => c[k][0] === -1 && c[k][1] === held;
    // "everything on" at config k: between the measures of it on either side
    const onAt = (k) => {
      let a = k, b = k; while (a > 0 && !isOn(a)) a--; while (b < n - 1 && !isOn(b)) b++;
      if (!isOn(b)) b = a;
      return a === b ? ms[a] : ms[a] + (ms[b] - ms[a]) * (k - a) / (b - a);
    };
    const ons = []; for (let k = 0; k < n; k++) if (isOn(k) && !isNaN(ms[k])) ons.push(ms[k]);
    const on = ons.length ? ons.reduce((x, y) => x + y, 0) / ons.length : NaN;
    this.lines.push(`what each thing costs to draw · ${v.name} (ms a frame, from the frame's start until it is drawn; picture held at ${mp(held)} MP):`);
    this.lines.push(`  everything on ${f(on)} (from ${f(Math.min(...ons))} to ${f(Math.max(...ons))} over the test) · every saving on ${f(ms[n - 4])} · everything on at ${mp(c[n - 2][1])} MP ${f(ms[n - 2])} · at native (${mp(1)} MP) ${f(ms[n - 1])}`);
    const saved = [];
    for (let k = 1; k < n - 4; k++) { if (c[k][0] < 0) continue; const d = onAt(k) - ms[k]; if (!isNaN(d)) saved.push([FEATURE_STEPS[c[k][0]].id, d]); }
    // (what leaving each part out saves, against "everything on" just before it; the last is
    // what is left with nothing drawn at all: the measuring itself and the page's own work)
    const parts = []; let none = NaN;
    for (let k = 1; k < n - 4; k++) if (c[k][0] <= -10) { const i = -10 - c[k][0]; if (i === PARTS_OUT.length - 1) none = ms[k]; else parts.push(`${PARTS_OUT[i][0]} ${f(ms[k - 1] - ms[k])}`); }
    this.lines.push(`  saved by leaving a part out: ${parts.join(' · ')} · (with nothing drawn at all a frame still takes ${f(none)})`);
    saved.sort((a, b) => b[1] - a[1]);
    this.lines.push(`  saved by one saving alone: ${saved.filter((x) => Math.abs(x[1]) >= 0.3).map((x) => `${x[0]} ${x[1].toFixed(1)}`).join(' · ') || 'nothing over 0.3'}`);
  }

  // The governor as it was.
  restore() {
    const app = this.app, g = this.g;
    for (const i of this.off) FEATURE_STEPS[i].apply(app, false);
    this.off = [];
    if (this.partOut != null) { PARTS_OUT[this.partOut][1](app, false); this.partOut = null; }
    g.fixed = this.fixedBefore ?? null; g.resLevel = this.resLevel; g._applyScale();
    app.canvasHold = null;
    for (let i = 0; i < this.level; i++) FEATURE_STEPS[i].apply(app, true);
    g.featureLevel = this.level;
    this.state = 'done';
  }
}
