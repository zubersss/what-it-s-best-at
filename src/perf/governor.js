// The governor: finds the best image quality that holds a steady frame rate.
//
// Policy (fixed by the owner, see CLAUDE.md):
//   - The resolution ceiling is the canvas's native pixel size; the floor is about one
//     million pixels. Resolution is lowered first.
//   - Only when resolution is at its floor are features stepped down, in the fixed order
//     below, cheapest visual loss first. Step-ups happen in the reverse order.
//   - Steps up need sustained headroom, and a step up that had to be taken back makes the
//     governor wait longer before trying again, so it settles instead of hunting.
//   - Two modes: Smooth (60 fps target, default) and Sharp (30 fps target).
//
// It also paces frames: with a 60 fps target on a 120 Hz screen every second refresh is
// rendered, which gives even frame times and keeps the phone cooler.
//
// EVERY NEW FEATURE THAT COSTS FRAME TIME MUST ADD A STEP TO `FEATURE_STEPS`.

export const MODES = {
  smooth: { label: 'Smooth', fps: 60 },
  sharp: { label: 'Sharp', fps: 30 },
};

// Fixed step-down order. `apply(app, off)` switches the saving on (off = true) or back.
export const FEATURE_STEPS = [
  { id: 'detail', label: 'close-up ground detail', apply: (app, off) => { app.quality.x = off ? 0 : 1; } },
  { id: 'soft-shadows', label: 'soft edges on rock and ship shadows', apply: (app, off) => { app.quality.y = off ? 0 : 1; } },
  { id: 'edge-glow', label: "glow on a planet's edge at half detail", apply: (app, off) => { app.quality.z = off ? 0 : 1; } },
  { id: 'dust', label: 'half the kicked-up dust', apply: (app, off) => { app.dust.amount = off ? 0.5 : 1; } },
  { id: 'rocks', label: 'half the rocks', apply: (app, off) => { app.rocks.setFraction(off ? 0.5 : 1); } },
  { id: 'fine-shadows', label: 'coarser shadows of nearby rocks', apply: (app, off) => { app.nearShadow.fine = !off; } },
  { id: 'terrain-1', label: 'terrain detail (fewer patches)', apply: (app, off) => { app.terrainBudget(off ? 0.8 : 1, 'terrain-1'); } },
  { id: 'bloom', label: 'glow around bright things', apply: (app, off) => { app.post.bloomEnabled = !off; } },
  { id: 'terrain-2', label: 'terrain detail (fewer patches again)', apply: (app, off) => { app.terrainBudget(off ? 0.64 : 1, 'terrain-2'); } },
  { id: 'cloak', label: 'cloak simulated at half rate', apply: (app, off) => { app.hero.cloak.halfRate = off; } },
  { id: 'air-shadow', label: 'terrain shadows in the haze', apply: (app, off) => { app.atmosphere.airEnabled = !off; } },
];

const RES_STEP = 0.88;          // each resolution step keeps 88 % of the pixels (about 6 % per side)
const MIN_PIXELS = 1.0e6;
const WINDOW = 24;              // frames looked at for "are we missing the target"
const GOOD_AFTER = 20;           // seconds without a step down that make a resolution level "known good"
const MAX_VSYNC = 1000 / 57;    // no screen we care about refreshes slower than this

const LATE = 1.2;               // a frame is late when it takes more than 1.2 x its interval

// What kind of frame the app is reporting.
export const FRAME = { NORMAL: 0, SOFT: 1, IGNORE: 2 };

// Measures the screen's refresh interval from the first animation frames of the page,
// before anything heavy is drawn. Call once, early; the governor picks the result up.
let probe = null;
export function probeRefresh() {
  if (probe || typeof requestAnimationFrame === 'undefined') return;
  probe = { samples: [], last: 0 };
  const tick = (now) => {
    if (probe.last) { const d = now - probe.last; if (d > 2 && d < 70) probe.samples.push(d); }
    probe.last = now;
    if (probe.samples.length < 90 && !probe.stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function percentile(list, f) { const s = list.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; }

export class Governor {
  // app: provides the feature hooks above. fixedScale: a number disables all adaptation.
  constructor(app, mode = 'smooth', fixedScale = null) {
    this.app = app;
    this.fixed = fixedScale;
    this.mode = MODES[mode] ? mode : 'smooth';
    this.nativePixels = 1e6;
    this.resLevel = 0;            // 0 = native, k = native * RES_STEP^k
    this.maxResLevel = 0;
    this.featureLevel = 0;        // how many FEATURE_STEPS are switched off
    this.scale = fixedScale ?? 1;
    // Display refresh interval in ms: from the start-up probe if it ran, else assumed
    // 60 Hz; refined all the time from the animation-frame callbacks (see shouldRender).
    this.vsync = 1000 / 60; this.vsyncMeasured = false;
    this._vs = []; this._vfree = []; this._vc = 0; this._skipped = false;
    this.interval = 1000 / MODES[this.mode].fps;
    this.paced = fixedScale == null;
    this._lastRaf = 0; this._lastRender = 0;
    this._ring = new Uint8Array(WINDOW); this._ri = 0; this._filled = 0;   // bit 0 = late, bit 1 = soft
    this.cooldown = 1.5;          // seconds before the next decision
    this.holdUp = 3;              // seconds of clean running needed before a step up
    this.sinceStep = 1e9; this.sinceUp = 1e9; this.cleanTime = 0; this.lastUpFailed = false;
    this.time = 0;
    this.log = [];                // { t (s), text }
    this.onStep = null;           // (text) => void
    this.gpuMs = null;
    const gl = app.renderer.getContext();
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.query = null; this.pending = [];
    this._started = false;
    this._probeFrames = -1; this._probeLate = 0;      // frames watched since the last step up
    this.goodLevel = null;        // highest resolution level known to hold (see update)
    this.sinceDown = 0; this._upFrom = null;
    this._setInterval();
  }

  setNative(pixels) {
    this.nativePixels = pixels;
    const floor = Math.min(pixels, MIN_PIXELS);
    this.maxResLevel = Math.max(0, Math.round(Math.log(floor / pixels) / Math.log(RES_STEP)));
    // Both modes start at native: the test phone holds it at 60 fps, and coming down
    // takes well under a second per two steps if a device cannot.
    if (!this._started) { this._started = true; this.resLevel = 0; }
    this.resLevel = Math.min(this.resLevel, this.maxResLevel);
    this._applyScale();
  }

  setMode(mode) {
    if (!MODES[mode] || mode === this.mode) return;
    this.mode = mode;
    this._setInterval();
    if (this.fixed == null) {
      // Sharp has twice the time per frame: go straight to native with everything on and
      // come down only if needed (coming down is quick, climbing is slow on purpose).
      // Smooth keeps the level it is at and comes down from there if it has to.
      if (mode === 'sharp') { while (this.featureLevel > 0) FEATURE_STEPS[--this.featureLevel].apply(this.app, false); this.resLevel = 0; }
      this._applyScale();
    }
    // A new target: forget what was learned and look again from where we are.
    this.holdUp = 3; this.cooldown = 1.0; this.cleanTime = 0; this._filled = 0; this.lastUpFailed = false; this._probeFrames = -1;
    this.goodLevel = null; this.sinceDown = 0;
    this._note(`mode ${MODES[mode].label}, starting at ${(this.pixels / 1e6).toFixed(2)} MP`);
  }

  get targetFps() { return 1000 / this.interval; }
  get pixels() { return Math.round(this.nativePixels * this.scale * this.scale); }
  get summary() {
    const off = this.featureLevel ? `, ${this.featureLevel} feature step${this.featureLevel > 1 ? 's' : ''} down` : '';
    return `${MODES[this.mode].label} ${Math.round(this.targetFps)} fps · ${(this.pixels / 1e6).toFixed(2)} MP (${Math.round(this.scale * this.scale * 100)} % of native)${off}`;
  }

  _setInterval() {
    const target = 1000 / MODES[this.mode].fps;
    this.interval = Math.max(1, Math.round(target / this.vsync)) * this.vsync;
  }

  _applyScale() {
    if (this.fixed != null) { this.scale = this.fixed; return; }
    this.scale = Math.sqrt(Math.pow(RES_STEP, this.resLevel));
  }

  // Called on every animation-frame callback. Returns false when this refresh should be
  // skipped to keep an even frame interval.
  shouldRender(now) {
    const d = now - this._lastRaf; this._lastRaf = now;
    if (probe && !probe.stop) {
      // First frame of the game: take what the start-up probe measured while it loaded.
      probe.stop = true;
      if (probe.samples.length >= 12) { this.vsync = Math.min(percentile(probe.samples, 0.2), MAX_VSYNC); this.vsyncMeasured = true; this._setInterval(); }
    }
    if (d > 2 && d < 70) {
      // Callbacks arrive a whole number of refreshes apart. One that follows a skipped
      // callback is exactly one refresh later; one that follows a drawn frame can be
      // several. So short gaps can only lower the estimate, and only gaps after a skip
      // can raise it (the screen itself slowed down).
      this._vs.push(d); if (this._vs.length > 60) this._vs.shift();
      if (this._skipped) { this._vfree.push(d); if (this._vfree.length > 30) this._vfree.shift(); }
      if (++this._vc >= 30) {
        this._vc = 0;
        this.vsyncMeasured = true;
        const low = Math.min(percentile(this._vs, 0.2), MAX_VSYNC);
        const free = this._vfree.length >= 8 ? Math.min(percentile(this._vfree, 0.2), MAX_VSYNC) : 0;
        if (low < this.vsync * 0.94) { this.vsync = low; this._setInterval(); }
        else if (free > this.vsync * 1.06) { this.vsync = free; this._setInterval(); }
        this._vfree.length = 0;
      }
    }
    this._skipped = false;
    if (!this.paced) { this._lastRender = now; return true; }
    if (now - this._lastRender < this.interval - this.vsync * 0.5) { this._skipped = true; return false; }
    this._lastRender = now;
    return true;
  }

  beginFrame() {
    if (!this.ext || this.query) return;
    this.query = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
  }

  endFrame() {
    if (!this.ext || !this.query) return;
    const gl = this.gl;
    gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.query); this.query = null;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.gpuMs = this.gpuMs === null ? ms : this.gpuMs * 0.9 + ms * 0.1;
      }
      gl.deleteQuery(q); this.pending.shift();
    }
    if (this.pending.length > 8) { for (const q of this.pending) gl.deleteQuery(q); this.pending.length = 0; }
  }

  // dtMs: time since the previous rendered frame. kind:
  //   FRAME.NORMAL  an ordinary frame;
  //   FRAME.SOFT    new terrain was uploaded during it: if it is late, resolution is
  //                 probably not why, so it only counts when most frames are late;
  //   FRAME.IGNORE  slow for a reason resolution cannot fix (a jump, a world switch).
  update(dtMs, kind = FRAME.NORMAL) {
    if (this.fixed != null) return;
    const dt = Math.min(dtMs, 250) / 1000;
    this.time += dt; this.sinceStep += dt; this.sinceUp += dt; this.sinceDown += dt; this.cooldown -= dt;
    if (kind === FRAME.IGNORE) return;
    // A level that has run this long without a step down is one the device can hold: after
    // a passing dip (a burst of terrain loading) the way back is one jump, not a climb.
    if (this.featureLevel === 0 && this.sinceDown > GOOD_AFTER && (this.goodLevel == null || this.resLevel < this.goodLevel)) this.goodLevel = this.resLevel;
    // Late is judged against the interval itself, not the measured refresh: if every
    // frame is slow the refresh estimate is too long, and must not excuse them.
    const late = dtMs > this.interval * LATE, soft = kind === FRAME.SOFT;
    this._ring[this._ri] = (late ? 1 : 0) | (soft ? 2 : 0); this._ri = (this._ri + 1) % WINDOW; this._filled = Math.min(WINDOW, this._filled + 1);
    if (late && !soft) this.cleanTime = 0; else if (!late) this.cleanTime += dt;
    // Just stepped up? Watch the next frames closely: if most of the first eight are late
    // the step does not hold, and it is taken back at once (a fifth of a second of
    // stutter instead of a full second).
    if (this._probeFrames >= 0) {
      this._probeFrames++; if (late && !soft) this._probeLate++;
      if (this._probeFrames >= 8 && this._probeLate >= 5) {
        this.holdUp = Math.min(60, this.holdUp * 2); this.lastUpFailed = true;
        this._takeBack();
        this.sinceUp = 1e9; this.cooldown = 0.7; this._filled = 0; this.cleanTime = 0; this._probeFrames = -1;
        return;
      }
      if (this._probeFrames >= WINDOW) this._probeFrames = -1;
    }
    if (this.cooldown > 0 || this._filled < WINDOW) return;
    let hard = 0, hardLate = 0, allLate = 0;
    for (let i = 0; i < WINDOW; i++) { const v = this._ring[i]; if (v & 1) allLate++; if (!(v & 2)) { hard++; if (v & 1) hardLate++; } }
    const hardFraction = hard >= WINDOW / 2 ? hardLate / hard : 0, allFraction = allLate / WINDOW;

    if (hardFraction > 0.2 || allFraction > 0.6) {
      // Missing the target. If we only just stepped up, that step was a mistake: take it
      // back and wait longer before trying again.
      const tookBack = this.sinceUp < 4;
      if (tookBack) { this.holdUp = Math.min(60, this.holdUp * 2); this.lastUpFailed = true; this._takeBack(); }
      else this._down(Math.max(hardFraction, allFraction) > 0.6 ? 2 : 1);
      this.cooldown = 0.7; this._filled = 0; this.cleanTime = 0;
      return;
    }
    // Sustained headroom: a clean run, and (when the GPU reports its time) real slack.
    const slack = this.gpuMs == null || this.gpuMs < this.interval * 0.72;
    if (this.cleanTime > this.holdUp && slack && (this.resLevel > 0 || this.featureLevel > 0)) {
      // The previous step up held: be a little quicker to try the next one.
      if (!this.lastUpFailed) this.holdUp = Math.max(3, this.holdUp * 0.5);
      this.lastUpFailed = false;
      this._up();
      this.sinceUp = 0; this.cooldown = 1.2; this.cleanTime = 0; this._probeFrames = 0; this._probeLate = 0;
    }
  }

  _down(steps) {
    for (let s = 0; s < steps; s++) {
      if (this.resLevel < this.maxResLevel) { this.resLevel++; this._applyScale(); this._note(`resolution down to ${(this.pixels / 1e6).toFixed(2)} MP`); }
      else if (this.featureLevel < FEATURE_STEPS.length) {
        const f = FEATURE_STEPS[this.featureLevel++];
        f.apply(this.app, true); this._note(`off: ${f.label}`);
      } else return;                      // nothing left to give up
      this.sinceStep = 0; this.sinceDown = 0;
    }
  }

  // Undoes the last step up (which may have been a jump of several levels back to a
  // level that used to hold): it does not hold any more.
  _takeBack() {
    if (this._upFrom != null && this._upFrom > this.resLevel) {
      this.resLevel = Math.min(this.maxResLevel, this._upFrom); this._applyScale();
      this._note(`resolution down to ${(this.pixels / 1e6).toFixed(2)} MP`);
      this.sinceStep = 0; this.sinceDown = 0;
    } else this._down(1);
    this.goodLevel = null; this._upFrom = null;
  }

  _up() {
    if (this.featureLevel > 0) {
      const f = FEATURE_STEPS[--this.featureLevel];
      f.apply(this.app, false); this._note(`back on: ${f.label}`);
    } else if (this.resLevel > 0) {
      this._upFrom = this.resLevel;
      this.resLevel = this.goodLevel != null && this.goodLevel < this.resLevel ? this.goodLevel : this.resLevel - 1;
      this._applyScale(); this._note(`resolution up to ${(this.pixels / 1e6).toFixed(2)} MP`);
    } else return;
    this.sinceStep = 0;
  }

  _note(text) {
    this.log.push({ t: +this.time.toFixed(1), text });
    if (this.log.length > 400) this.log.shift();
    this.onStep?.(text);
  }
}
