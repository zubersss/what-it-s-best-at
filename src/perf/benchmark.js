// The benchmark: a scripted run that plays the game by itself and measures it.
//
// One lap is 3 minutes: every bookmark on Mars (hold, look around, fly forward), the
// flight from Mars up to orbit, across to the Moon and down, then every lunar bookmark.
// The 10-minute soak repeats laps and also reports minute by minute, to show what heat
// does. The result is plain text the owner can copy and paste back.
import { WORLDS } from '../worlds/index.js';
import { MODES } from './governor.js';
import { latLonToDir } from '../core/ephemeris.js';
import { BUILD } from '../core/build.js';

const LAP = 180, STOP = 12, FLIGHT = 60;
// The routes: the first world's five views, a flight, the second world's five views.
const ROUTES = { run: ['mars', 'moon'], soak: ['mars', 'moon'], earth: ['earth', 'moon'] };

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
    return `${this.kind === 'soak' ? 'Soak test' : this.kind === 'earth' ? 'Earth benchmark' : 'Benchmark'} ${mmss(t)} / ${mmss(this.duration)} · ${where}`;
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
    const t = (performance.now() - this.t0) / 1000;
    // --- record
    if (this.n < this.dt.length && t > 0.5) {
      this.dt[this.n] = dtMs; this.px[this.n] = app.post.viewW * app.post.viewH; this.at[this.n] = t;
      this.part[this.n] = this.phase < 0 ? 0 : this.phase < 5 ? 0 : this.phase === 5 ? 1 : 2;
      this.sc[this.n] = app.scriptMs || 0; this.ph[this.n] = Math.max(0, this.phase); this.up[this.n] = Math.min(255, app.lastUploads || 0);
      this.n++;
      if (dtMs > 100) this.hitches.push({ t: +t.toFixed(1), ms: Math.round(dtMs), cause });
      this.maxCalls = Math.max(this.maxCalls, app.stats.calls || 0); this.maxTris = Math.max(this.maxTris, app.stats.triangles || 0);
    }
    const b = this.builds[app.world.id];
    if (b) { b[0] += Math.max(0, app.terrain.built - this.lastBuilt); b[1] += Math.max(0, app.terrain.buildMs - this.lastBuildMs); }
    this.lastBuilt = app.terrain.built; this.lastBuildMs = app.terrain.buildMs;
    if (this.n % 60 === 1) this.maxGpuBytes = Math.max(this.maxGpuBytes, app.gpuBytes);
    if (t >= this.duration) { this._finish(false); return; }

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
    L.push(`SOLAR SYSTEM EXPLORER — ${this.kind === 'soak' ? '10-minute soak' : this.kind === 'earth' ? '3-minute Earth benchmark' : '3-minute benchmark'}${stopped ? ' (stopped early)' : ''}`);
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
    L.push(`terrain patches built: ${builds} · shadows re-baked: ${(app.terrain.rebakes || 0) - this.rebakesFrom} · patch cap at the end: ${app.terrain.maxChunks}`);
    L.push(`screen ${window.innerWidth}x${window.innerHeight} CSS px · pixel ratio ${(+(window.devicePixelRatio || 1).toFixed(3))} · refresh ${g.vsync ? Math.round(1000 / g.vsync) : '?'} Hz`);
    if (app.shaderErrors?.length) L.push(`SHADERS THAT FAILED ON THIS DEVICE: ${app.shaderErrors.length} — ${app.shaderErrors.join(' / ')}`);
    L.push(`GPU: ${app.gpuName}${g.gpuMs != null ? ` · GPU time ${g.gpuMs.toFixed(1)} ms` : ''}`);
    if (app.hiddenCount !== this.hiddenFrom) L.push('note: the page was in the background for part of this run, so the numbers are not reliable');
    L.push(navigator.userAgent);
    return L.join('\n');
  }
}
