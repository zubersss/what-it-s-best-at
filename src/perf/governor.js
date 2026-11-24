// The governor: finds the best image quality that holds a steady frame rate.
//
// Policy (fixed by the owner, see CLAUDE.md):
//   - The resolution ceiling is the canvas's native pixel size; the floor is about 1.6
//     million pixels (it was one million: on the test phone the last 0.6 bought a
//     twentieth of a frame and cost the picture its sharpness). Resolution is lowered first.
//   - A step down is a trial. Late frames that fewer pixels and fewer features do not
//     cure are not theirs to cure: what was given up is put back, and that lateness moves
//     nothing for a while (see `_dip`, `immune`). A device's own steady trickle of late
//     frames (`bg`) neither brings quality down nor keeps it from coming back.
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
  // patches: the share of the terrain patch cap this mode draws. At 60 fps the test phone
  // did not hold all 180 steadily (56.6 fps, a 1 % low of 21.6: the first benchmark after
  // milestone 4); Sharp has twice the time per frame and keeps them all.
  smooth: { label: 'Smooth', fps: 60, patches: 0.8 },
  sharp: { label: 'Sharp', fps: 30, patches: 1 },
};

// Fixed step-down order. `apply(app, off)` switches the saving on (off = true) or back.
export const FEATURE_STEPS = [
  { id: 'detail', label: 'close-up ground detail', apply: (app, off) => { app.quality.x = off ? 0 : 1; } },
  { id: 'soft-shadows', label: 'soft edges on rock and ship shadows', apply: (app, off) => { app.quality.y = off ? 0 : 1; } },
  { id: 'contact', label: 'darkening at the foot of rocks and the lander', apply: (app, off) => { app.contact = !off; } },
  { id: 'edge-glow', label: "glow on a planet's edge at half detail", apply: (app, off) => { app.quality.z = off ? 0 : 1; } },
  { id: 'dust', label: 'half the kicked-up dust, simpler cloud', apply: (app, off) => { app.dust.amount = off ? 0.5 : 1; } },
  { id: 'rocks', label: 'half the rocks', apply: (app, off) => { app.rocks.setFraction(off ? 0.5 : 1); } },
  { id: 'far-rock-shadows', label: 'shadows of far rocks', apply: (app, off) => { if (app.farRocks) app.farRocks.shadows = !off; } },
  // (the rocks of the land itself, to a mile and more: the small ones are seen from two thirds as far; the large ones, which are the hillside, stay)
  { id: 'far-rocks', label: 'small rocks from less far', apply: (app, off) => { app.farRocks?.setFraction(off ? 0.62 : 1); } },
  { id: 'fine-shadows', label: 'coarser shadows of nearby rocks', apply: (app, off) => { app.nearShadow.fine = !off; } },
  { id: 'rain', label: 'thinner rain and snow', apply: (app, off) => { if (app.rain) app.rain.share = off ? 0.5 : 1; } },      // (half of 5 600 streaks; thinning 1 400 to 560 saved nothing that could be measured on the phone)
  { id: 'leaves', label: 'leaves in the wind', apply: (app, off) => { if (app.leaves) app.leaves.enabled = !off; } },
  { id: 'grass-mid', label: 'thinner grass in the middle distance', apply: (app, off) => { app.grass?.setMidShare(off ? 0.5 : 1); } },
  { id: 'grass', label: 'half the grass', apply: (app, off) => { app.grass?.setFraction(off ? 0.5 : 1); } },
  { id: 'tree-leaves', label: 'every leaf on the nearest trees', apply: (app, off) => { if (app.trees) { app.trees.closeOn = !off; app.trees.dirty = true; } } },
  { id: 'tree-shadows', label: 'shadows of the farther trees', apply: (app, off) => { if (app.trees) app.trees.shadowsFar = !off; if (app.farForest) app.farForest.shadows = !off; } },      // (and the far forest's shadows on the ground, drawn from the air: life/farForest.js)
  { id: 'trees-far', label: "the trees' full shapes to two thirds of their distance", apply: (app, off) => { app.trees?.setFraction(off ? 0.66 : 1); } },
  // (it thins the far forest and shortens its reach; a wood stays a wood: the thinned trees
  // stand wider, see life/farForest.js)
  { id: 'far-trees', label: 'the far forest thinned', apply: (app, off) => { app.farForest?.setFraction(off ? 0.45 : 1); } },
  { id: 'sun-beams', label: "the Sun's beams through trees and cloud", apply: (app, off) => { app.post.shaftsOn = !off; } },
  // (no step for the waves that lift the water: on the phone it saved nothing that could be
  // measured, at sea in a hurricane (seventh results), and a sea that lies flat is not a sea)
  { id: 'cloud-steps', label: 'coarser clouds near you', apply: (app, off) => { if (app.cloudVolume) app.cloudVolume.steps = off ? 22 : 36; } },
  { id: 'terrain-1', label: 'terrain detail (fewer patches)', apply: (app, off) => { app.terrainBudget(off ? 0.8 : 1, 'terrain-1'); } },
  { id: 'bloom', label: 'glow around bright things', apply: (app, off) => { app.post.bloomEnabled = !off; } },
  { id: 'terrain-2', label: 'terrain detail (fewer patches again)', apply: (app, off) => { app.terrainBudget(off ? 0.64 : 1, 'terrain-2'); } },
  { id: 'cloak', label: 'robe and hair simulated more loosely', apply: (app, off) => { app.hero.robe.halfRate = off; } },
  { id: 'air-shadow', label: 'terrain shadows in the haze', apply: (app, off) => { app.atmosphere.airEnabled = !off; } },
  // (the last to go: what gives the land and the sky their depth seen from the air. With these
  // off a traveller coming down from space saw a flat map under a flat picture of clouds.)
  // (the layer itself is never switched off: a hurricane with a clear sky is not one, and the
  // layer is one texture on the sky)
  { id: 'clouds', label: "the clouds' shadows on the ground", apply: (app, off) => { if (app.clouds) app.clouds.shadows = !off; } },
  { id: 'far-relief', label: 'relief shading of far ground', apply: (app, off) => { app.quality.w = off ? 0 : 1; } },
  { id: 'cloud-volume', label: 'clouds with depth (they stay as a layer)', apply: (app, off) => { if (app.cloudVolume) app.cloudVolume.enabled = !off; } },
];

const RES_STEP = 0.88;          // each resolution step keeps 88 % of the pixels (about 6 % per side)
// (Eighth phone results, build f300e6f: a frame at 1.00 MP took 40.5 ms in the cost test, at
// 2.07 MP 44.3, at native 57.5: under two megapixels the picture's size is hardly what a
// frame costs, and one million pixels on a 4.45 million pixel screen is a blur.)
const MIN_PIXELS = 1.6e6;
const START_SMOOTH = 5;         // Smooth at a place never seen starts this many steps down (53 % of the pixels)
const WINDOW = 24;              // frames looked at for "are we missing the target"
const GOOD_AFTER = 20;           // seconds without a step down that make a resolution level "known good"
const MAX_VSYNC = 1000 / 57;    // no screen we care about refreshes slower than this

const LATE = 1.2;               // a frame is late when it takes more than 1.2 x its interval
const LOAD = [1, 0.8, 0.64];    // terrain patch factors of the load lever (see _down)

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
    this._script = new Float32Array(WINDOW); this.scriptMs = 0;     // the page's own work per frame (ms), over the window
    this.streamLevel = 0;         // 0: terrain arrives at full pace; 1, 2: more slowly (see update)
    this.loadLevel = 0;           // index into LOAD: the terrain patch factor taken when pixels are not what is slow
    this.loadHold = 15; this.sinceLoadUp = 1e9; this.loadUpFailed = false; this.leverClean = 0; this._hold = false;
    this.lateEMA = 0; this.lateFast = 0;       // the share of frames late over the last three seconds or so, and over the last one (frames that took in no terrain)
    this.bg = 0;                  // the late frames this device has whatever is drawn (learned at the floor, or from a trial that cured nothing)
    this.overTime = 0;            // seconds with more late frames than that, above the floor
    this._dip = null;             // steps down on trial: { res, feat, m0, dt0, n, dtF, probe } (where it began, how late it was, steps since)
    this.immune = 0; this.immuneFor = 30;      // until `immune` (s) lateness that giving quality up did not cure moves nothing
    this.featImmune = 0; this._immuneAll = false;      // (the same for the savings alone; _immuneAll: even when most frames are late)
    this._dts = new Float32Array(WINDOW);      // the window's frame lengths (ms)
    this._setInterval();
  }

  // The name a place's remembered level is kept under. (":2": the levels remembered before
  // the eighth phone results were the floor everywhere, learned by a governor that could
  // not climb; they are left behind.)
  _key(place, mode = this.mode) { return `${mode}:${place}:2`; }

  setNative(pixels) {
    this.nativePixels = pixels;
    const floor = Math.min(pixels, MIN_PIXELS);
    this.maxResLevel = Math.max(0, Math.round(Math.log(floor / pixels) / Math.log(RES_STEP)));
    // The first size: the place's remembered level if there is one (see arrive).
    if (!this._started) { this._started = true; this.resLevel = 0; if (this.place) { this.maxResLevel = Math.max(0, Math.round(Math.log(floor / pixels) / Math.log(RES_STEP))); this.arrive(this.place); } }
    this.resLevel = Math.min(this.resLevel, this.maxResLevel);
    this._applyScale();
  }

  // The governor remembers the resolution each place held (a world, in each mode), so a
  // return there starts from it instead of finding it again through seconds of stutter.
  // known: { 'smooth:mars': level, ... } (the app saves it); place: a name.
  remember(known, onLearn) { this.known = known || {}; this.onLearn = onLearn; }
  arrive(place) {
    this.place = place;
    if (this.fixed != null || !this._started) return;
    const k = this.known?.[this._key(place)];
    // (a place never seen: Smooth starts at about half the pixels and climbs, which costs
    // a few seconds of a softer picture; starting high costs seconds of half-rate frames)
    const level = Number.isFinite(k) ? k : this.mode === 'smooth' ? START_SMOOTH : 0;
    this.resLevel = Math.max(0, Math.min(this.maxResLevel, Math.round(level)));
    this._applyScale();
    this.holdUp = 3; this.cooldown = 1.0; this.cleanTime = 0; this._filled = 0; this.lastUpFailed = false; this._probeFrames = -1;
    this.goodLevel = null; this.sinceDown = 0; this._learned = null;
    this._dip = null; this.immune = this.featImmune = 0; this.immuneFor = 30;
    this._note(`${place}: starting at ${(this.pixels / 1e6).toFixed(2)} MP`);
  }

  setMode(mode) {
    if (!MODES[mode] || mode === this.mode) return;
    this.mode = mode;
    this._setInterval();
    if (this.fixed == null) {
      // Sharp has twice the time per frame: go straight to native with everything on and
      // come down only if needed (coming down is quick, climbing is slow on purpose).
      // Smooth keeps the level it is at and comes down from there if it has to.
      if (mode === 'sharp') {
        while (this.featureLevel > 0) FEATURE_STEPS[--this.featureLevel].apply(this.app, false);
        this.resLevel = 0;
        if (this.loadLevel) { this.loadLevel = 0; this.app.terrainBudget?.(1, 'load'); }      // "everything on" includes the patches
      }
      if (this.streamLevel) { this.streamLevel = 0; this.app.terrainPace?.(0); }
      this._applyScale();
    }
    // A new target: forget what was learned and look again from where we are.
    this.holdUp = 3; this.cooldown = 1.0; this.cleanTime = 0; this._filled = 0; this.lastUpFailed = false; this._probeFrames = -1;
    this.goodLevel = null; this.sinceDown = 0; this.loadHold = 15; this.loadUpFailed = false; this.leverClean = 0;
    this._dip = null; this.immune = this.featImmune = 0; this.immuneFor = 30; this.lateEMA = 0;
    {
      // (the new mode's own memory of this place, if it has one)
      const k = this.fixed == null && this.place ? this.known?.[this._key(this.place, mode)] : null;
      if (Number.isFinite(k)) { this.resLevel = Math.max(0, Math.min(this.maxResLevel, Math.round(k))); this._applyScale(); }
      this._learned = null;
    }
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
  //                 probably not why: terrain is let in more slowly first, then fewer
  //                 patches are drawn, and only then does the picture give way;
  //   FRAME.IGNORE  slow for a reason resolution cannot fix (a jump, a world switch).
  // scriptMs (optional): how long the page's own work for the frame took (everything but
  // the GPU drawing it): tells slow pixels from slow work.
  update(dtMs, kind = FRAME.NORMAL, scriptMs = 0) {
    if (this.fixed != null) return;
    const dt = Math.min(dtMs, 250) / 1000;
    this.time += dt; this.sinceStep += dt; this.sinceUp += dt; this.sinceDown += dt; this.cooldown -= dt; this.sinceLoadUp += dt;
    if (kind === FRAME.IGNORE) return;
    this._script[this._ri] = scriptMs;
    // A level that has run this long without a step down is one the device can hold: after
    // a passing dip (a burst of terrain loading) the way back is one jump, not a climb.
    if (this.featureLevel === 0 && this.sinceDown > GOOD_AFTER && (this.goodLevel == null || this.resLevel < this.goodLevel)) this.goodLevel = this.resLevel;
    // ... and it is what this place is remembered by.
    // (not while a step up is still on trial: one that is taken back must not be remembered)
    if (this.place && this.known && this.sinceDown > GOOD_AFTER && this.sinceUp > 8 && this._probeFrames < 0 && this._learned !== this.resLevel) {
      this._learned = this.resLevel; this.known[this._key(this.place)] = this.resLevel; this.onLearn?.();
    }
    // Late is judged against the interval itself, not the measured refresh: if every
    // frame is slow the refresh estimate is too long, and must not excuse them.
    const late = dtMs > this.interval * LATE, soft = kind === FRAME.SOFT;
    this._dts[this._ri] = Math.min(dtMs, 250);
    this._ring[this._ri] = (late ? 1 : 0) | (soft ? 2 : 0); this._ri = (this._ri + 1) % WINDOW; this._filled = Math.min(WINDOW, this._filled + 1);
    // The share of frames late lately, frame by frame (over some three seconds, and over one),
    // and `bg`: the share this device has whatever is drawn. A phone has late frames of its
    // own that nothing here causes (the eighth results: one in fifteen at every stop, at
    // any size of picture). `bg` is only ever learned from evidence: at the resolution's
    // floor, where nothing lower is left to try, or from a trial of steps down that cured
    // nothing (_putBack); and it follows the share down at once. Up to it, plus a little, a
    // late frame is weather: it does not stop quality from coming back.
    if (!soft) { const l = late ? 1 : 0; this.lateEMA += (l - this.lateEMA) / 200; this.lateFast += (l - this.lateFast) / 60; }
    if (this.resLevel >= this.maxResLevel) this.bg = Math.min(0.12, this.bg + dt * 0.02);
    this.bg = Math.min(this.bg, this.lateEMA);
    const tol = this.bg + 0.03;
    // (more late frames than that, for six seconds, above the floor: a trial is due, see below)
    if (this.lateEMA > tol + 0.01 && this.resLevel < this.maxResLevel && this._filled >= WINDOW) this.overTime += dt; else this.overTime = 0;
    // (leverClean: the same clock for the two terrain levers, which a resolution step up does not reset)
    if (late && !soft) { if (this.lateEMA > tol) this.cleanTime = this.leverClean = 0; } else if (!late) { this.cleanTime += dt; this.leverClean += dt; }
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
    // Frames that took in terrain and frames that did not, each judged on its own (when
    // there are enough of both to tell).
    const softN = WINDOW - hard, softLate = softN >= 5 ? (allLate - hardLate) / softN : 0, plainLate = hard >= 5 ? hardLate / hard : -1;

    // (A third of all frames late is too many whatever their kind. The bar for frames with
    // terrain arriving used to be 0.6: on the test phone half the frames at two stops then
    // came late for 24 seconds, every one of them "soft", and nothing was done.)
    const trigger = hardFraction > 0.2 + this.bg || allFraction > 0.3 + this.bg;
    // A trial is also due when late frames have stayed over what this device has of its own
    // for six seconds (too few at a time to trip the window): one step, two seconds to see
    // what it did, and so on (see `futile`).
    const probe = !trigger && this.time >= this.immune && (this.overTime > 6 || (this._dip && this._dip.probe));
    if (trigger || probe) {
      // Missing the target. If we only just stepped up, that step was a mistake: take it
      // back and wait longer before trying again.
      const tookBack = this.sinceUp < (trigger ? 4 : 12) && !this._dip;
      // Late only while terrain is arriving (the late frames are the "soft" ones): the
      // picture is not what is slow. Terrain is let in more slowly instead (it sharpens a
      // little later); only if that is already at its slowest does quality give way.
      // (Only when the frames without new terrain are seen to be on time. With ground
      // arriving in most frames there is nothing to compare, and then pixels are the
      // likelier cause and the cheaper mistake: on the test phone nine seconds of half-rate
      // frames at a new place went on terrain levers that cured nothing.)
      const streaming = trigger && this.app.terrainPace && plainLate >= 0 && plainLate <= 0.1 && softLate > 0.3;
      // The page's own work over the window: more than 0.6 of the interval is slow work.
      // (judged on the late frames themselves, and only when it can make a frame late by
      // itself: 0.9 of the interval. Above the whole interval pixels cannot cure anything.)
      let sm = 0, sl = 0, nl = 0;
      for (let i = 0; i < WINDOW; i++) { sm += this._script[i]; if (this._ring[i] & 1) { sl += this._script[i]; nl++; } }
      this.scriptMs = sm / WINDOW;
      const lateScript = nl ? sl / nl : 0, work = lateScript > this.interval * 0.9;
      this._hold = lateScript > this.interval;
      let cool = 0.7;
      if (tookBack) { this.holdUp = Math.min(60, this.holdUp * 2); this.lastUpFailed = true; this._takeBack(); this.overTime = 0; }
      else if (streaming && this.streamLevel < 2) { this.streamLevel++; this.app.terrainPace(this.streamLevel); this._note(`terrain let in more slowly (${this.streamLevel})`); this.sinceStep = 0; }
      // (still late with terrain at its slowest pace: the arriving ground is the work that
      // is slow, so patches go before pixels)
      else {
        // (a screen shows a frame in whole refreshes: one that misses is twice as long
        // however little it missed by, so the share of late frames says how far over the
        // frame is only roughly. Most of them late: come down in strides.)
        const f = Math.max(hardFraction, allFraction), d = this._dip;
        // (how late: the window's share when it tripped, else the share over the last second)
        const m = trigger ? f : this.lateFast;
        let mean = 0; for (let i = 0; i < WINDOW; i++) mean += this._dts[i]; mean /= WINDOW;
        const atFloor = this.resLevel >= this.maxResLevel && this.featureLevel >= FEATURE_STEPS.length;
        // Giving quality up is a trial. Some frames late (not most), two steps taken, and
        // about as many late as before: pixels are not why. Or everything given up and the
        // frames as long as they were. Then what was given up comes back, and for a while
        // (longer each time it happens at a place) such lateness is left alone: a blurred
        // picture with the same late frames is the worse of the two.
        // (On the test phone every stop had its late frames at one million pixels with
        // every saving on, and it sat there for whole benchmarks.)
        const futile = d && ((d.m0 < 0.6 && d.n >= 2 && m > 0.7 * d.m0) || (atFloor && d.n >= 2 && mean > 0.85 * d.dt0));
        // (and the savings alone, when the resolution's steps did help: with every one of
        // them on and the frames as long as when the first was switched on, they come back
        // and the resolution stays where it holds)
        const featFutile = d && !futile && atFloor && d.dtF != null && mean > 0.85 * d.dtF;
        if (futile) { this._putBack(d, true); if (d.m0 < 0.6) this.bg = Math.max(this.bg, Math.min(0.12, 0.9 * Math.min(m, this.lateEMA))); }
        else if (featFutile) this._putBack(d, false);
        // (a trial that began for a few late frames, and a step that cut them: it is over)
        else if (d && d.probe && m <= 0.7 * d.m0) { this._dip = null; this.overTime = 0; }
        else if (this.time < this.immune && (f < 0.6 || this._immuneAll)) { /* tried here a moment ago, and it cured nothing */ }
        else if (atFloor) { /* nothing left to give up */ }
        else if (this.time < this.featImmune && this.resLevel >= this.maxResLevel) { /* the savings were tried a moment ago, for nothing */ }
        else {
          if (!d) this._dip = { res: this.resLevel, feat: this.featureLevel, m0: m, dt0: mean, n: 0, dtF: null, probe: !trigger };
          // (how long the frames are when the first saving is about to go)
          if (this._dip.dtF == null && this.resLevel >= this.maxResLevel) this._dip.dtF = mean;
          this._dip.n++;
          this._down(f > 0.8 ? 4 : f > 0.6 ? 3 : f > 0.4 ? 2 : 1, work || streaming);
          if (!trigger) cool = 2.0;        // (two seconds to see what the step did to a few late frames)
        }
      }
      this.cooldown = cool; this._filled = 0; this.cleanTime = this.leverClean = 0;
      return;
    }
    // (a trial of steps down that has had three quiet seconds is over: it cured what it was for)
    if (this._dip && this.sinceDown > 3) this._dip = null;
    // The patches given up for the work per frame come back after fifteen clean seconds.
    if (this.loadLevel > 0 && this.leverClean > this.loadHold) {
      if (!this.loadUpFailed) this.loadHold = Math.max(15, this.loadHold * 0.5);
      this.loadUpFailed = false; this.sinceLoadUp = 0;
      this.loadLevel--; this.app.terrainBudget?.(LOAD[this.loadLevel], 'load'); this._note(`terrain patches back (x${LOAD[this.loadLevel]})`);
      // (lateness right after this is the patches', not the last resolution step's)
      this.cleanTime = this.leverClean = 0; this.sinceStep = 0; this.sinceUp = 1e9; this._probeFrames = -1;
    }
    // Terrain comes in at full pace again after five clean seconds.
    if (this.streamLevel > 0 && this.leverClean > 5) { this.streamLevel = 0; this.app.terrainPace?.(0); }
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

  // Every saving switched on: where a device that cannot keep up ends. (For pictures and
  // tests of what is left then; the governor steps back up from it as usual.)
  toFloor() { while (this.featureLevel < FEATURE_STEPS.length) FEATURE_STEPS[this.featureLevel++].apply(this.app, true); }

  // Lower resolution first, then features. But resolution only cures frames that are slow
  // because of pixels. When the page's own work fills most of the frame (draw calls, terrain
  // arriving, the simulation), fewer pixels change nothing: on the test phone a 10 s stretch
  // of such frames once took the picture from 4.45 to 1.60 megapixels, eight steps, without
  // curing one. Then terrain patches go instead (fewer draw calls, less arriving), twice at
  // most; the other features cost pixels and would not help either.
  _down(steps, work = false) {
    if (work) {
      if (this.loadLevel < LOAD.length - 1) {
        // (patches that came back and at once had to go again: wait longer before the next try)
        if (this.sinceLoadUp < 10) { this.loadHold = Math.min(120, this.loadHold * 2); this.loadUpFailed = true; }
        this.loadLevel++; this.app.terrainBudget?.(LOAD[this.loadLevel], 'load'); this._note(`fewer terrain patches (x${LOAD[this.loadLevel]}): the work per frame is what is slow`); this.sinceStep = 0; this.sinceDown = 0;
        return;
      }
      if (this._hold) return;               // the work alone fills the frame: nothing here cures it
    }
    for (let s = 0; s < steps; s++) {
      if (this.resLevel < this.maxResLevel) { this.resLevel++; this._applyScale(); this._note(`resolution down to ${(this.pixels / 1e6).toFixed(2)} MP`); }
      else if (this.featureLevel < FEATURE_STEPS.length) {
        const f = FEATURE_STEPS[this.featureLevel++];
        f.apply(this.app, true); this._note(`off: ${f.label}`);
      } else return;                      // nothing left to give up
      this.sinceStep = 0; this.sinceDown = 0;
    }
  }

  // A trial of steps down that cured nothing: the features and the resolution it began
  // with come back, and lateness of that kind is left alone for a while.
  // all: the resolution too (nothing helped); else only the savings (the resolution's steps did).
  _putBack(d, all) {
    while (this.featureLevel > d.feat) FEATURE_STEPS[--this.featureLevel].apply(this.app, false);
    if (all && this.resLevel > d.res) { this.resLevel = d.res; this._applyScale(); }
    this._note(all ? `back to ${(this.pixels / 1e6).toFixed(2)} MP${d.feat === 0 ? ', everything on' : ''}: giving quality up did not cure the late frames` : 'every saving off again: they did not cure the late frames');
    if (all) { this.immune = this.time + this.immuneFor; this._immuneAll = this.resLevel < this.maxResLevel && d.m0 >= 0.6; } else this.featImmune = this.time + this.immuneFor;
    this.immuneFor = Math.min(240, this.immuneFor * 2);
    this._dip = null; this.sinceStep = 0; this.sinceUp = 1e9; this._probeFrames = -1; this.goodLevel = null; this._upFrom = null; this._upFeat = 0;
  }

  // Undoes the last step up (which may have been a jump of several levels back to a
  // level that used to hold): it does not hold any more.
  _takeBack() {
    if (this._upFrom != null && this._upFrom > this.resLevel) {
      this.resLevel = Math.min(this.maxResLevel, this._upFrom); this._applyScale();
      this._note(`resolution down to ${(this.pixels / 1e6).toFixed(2)} MP`);
      this.sinceStep = 0; this.sinceDown = 0;
    } else if (this._upFeat) {
      for (let k = 0; k < this._upFeat && this.featureLevel < FEATURE_STEPS.length; k++) { const f = FEATURE_STEPS[this.featureLevel++]; f.apply(this.app, true); this._note(`off: ${f.label}`); }
      this.sinceStep = 0; this.sinceDown = 0;
    } else this._down(1);
    this.goodLevel = null; this._upFrom = null; this._upFeat = 0;
  }

  _up() {
    if (this.featureLevel > 0) {
      // (five at a time: after a passing dip, a burst of ground arriving, the way back up
      // through twenty savings one by one took two minutes of a picture with nothing in it)
      let n = 0;
      for (; n < 5 && this.featureLevel > 0; n++) { const f = FEATURE_STEPS[--this.featureLevel]; f.apply(this.app, false); this._note(`back on: ${f.label}`); }
      this._upFeat = n; this._upFrom = null;
    } else if (this.resLevel > 0) {
      this._upFeat = 0;
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
