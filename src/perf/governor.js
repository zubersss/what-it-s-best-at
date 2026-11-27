// The governor: finds the best image quality that holds a steady frame rate.
//
// Policy (fixed by the owner, see CLAUDE.md):
//   - The resolution ceiling is the canvas's native pixel size; the floor is about 1.6
//     million pixels (it was one million: on the test phone the last 0.6 bought a
//     twentieth of a frame and cost the picture its sharpness). Resolution is lowered first;
//     in Sharp only down to KEEP (60 % of native) while a saving known to buy something is
//     left, and below KEEP it comes back before the savings (the tenth phone results: pixels
//     went first all the way down, came back only after every saving, and Haven sat at the
//     floor at every stop while savings that each bought more than its last megapixel
//     were left on and off). Below KEEP they take turns: a step of the resolution up that is
//     taken back hands the turn to the savings, so that where the picture cannot hold more
//     pixels, savings that bought nothing do not stay on for good.
//   - A step down is a trial. Late frames that fewer pixels and fewer features do not
//     cure are not theirs to cure: what was given up is put back, and that lateness moves
//     nothing for a while (see `_dip`, `immune`). A device's own steady trickle of late
//     frames (`bg`) neither brings quality down nor keeps it from coming back.
//   - Only when resolution is at its floor are features stepped down, in the order below:
//     by what a step has been shown to buy on the test phone, then by what the eye loses;
//     steps that can buy nothing where the traveller is are passed over (and come back with
//     the next step up, whatever it is). A trial goes on until the steps known to buy
//     something, and then the resolution, have been tried. What went first comes back
//     first, and what makes frames late again when it comes back goes off again and to
//     the end of the line: in the end only what the frames need stays off.
//   - Steps up need sustained headroom, and a step up that had to be taken back makes the
//     governor wait longer before trying again, so it settles instead of hunting.
//   - A saving that changes shadows in view (`hold`) comes back only when the traveller (on
//     foot the figure, not the camera that circles it) is still or has gone HOLD_M from
//     where it was taken, and by itself. The governor's
//     hunting switched every shadow near the traveller between sharp and blurred three
//     times in 11 s of the tenth benchmark.
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

// The step-down order. `apply(app, off)` switches the saving on (off = true) or back.
//
// By what a step buys, then by what the eye loses (the phone's ninth results, build
// 6ac24ff, docs/benchmarks/2026-11-24-haven-6ac24ff.txt, and its tenth, build e9d4888,
// docs/benchmarks/2026-11-25-haven-e9d4888.txt; before that the order was "least loss
// first" alone, and a trial of two to four steps ended among steps that buy nothing on the
// phone, four times in one benchmark, with the steps that could have cured the late frames
// behind them):
//   1. what the phone has shown to buy 2.5 ms and more, least loss to the eye first;
//   2. what buys a little (0.5 to 1.6 ms) for little loss;
//   3. what gives the land and the sky their depth from the air (they buy much, 4.0, 3.5
//      and 9.4 ms, and are the last things of worth to go);
//   4. what bought nothing that could be measured on the phone in any of its three cost
//      views (under 1 ms, most of them inside the noise): kept for devices unlike it and
//      for the floor, where they can no longer end a trial early.
// `buys`: milliseconds a frame where the phone measured it (the largest of the three
// views; 0.3 where nothing could be measured; a guess where the cost test cannot ask, said
// so). A stride of the governor takes steps until they are expected to buy STRIDE_MS.
// `live(app)`: whether the step can buy anything where the traveller is (no near trees
// drawn: the tree steps cannot; no clumps: `grass-mid` cannot). A step that is not live
// is passed over: switching it on would lose nothing and buy nothing, and count as a step
// of the trial. Without `live` a step is always live.
// `hold`: the step changes shadows in view (which trees cast one, with what mesh, how sharp
// the shadows near the traveller are): once taken it comes back only as `_released` says.
// The last steps leave the scene what it is: a step thins, it does not remove what a place
// is about (the cloud layer and the rain stay whatever is switched off).
// The sky's steps go through the sky's own setters (sky/skySystem.js SKY_SAVINGS: app.sky.setSaving),
// so that each package's module takes its saving its own way. Four of them are the clouds
// plan's (docs/briefs/clouds-weather-plan.md, GOVERNOR), on the ladder from step 0 with the
// setters of parts not built yet: cloud-upper, rain-shafts, cloud-shade-rate, cloud-shade-coarse.
// Their `live` is the sky's (false until their packages land: passed by) and `has` says whether
// the part is built at all (the benchmark's cost test measures only those). Their `buys` are the
// plan's estimates until the phone has measured them. 'clouds' (every cloud shadow off) goes when
// package C lands: 'cloud-shade-coarse' takes its place, the shadows kept, coarser.
// (reach: 0 whenever none are drawn, in the air above the trees' height for one: the count is
// the last list's, kept after a take-off)
const nearTrees = (app) => (app.trees?.count ?? 0) > 0 && (app.trees.reach ?? 1) > 0 && !app.trees.hidden;
const cloudVolume = (app) => !!app.cloudVolume?.wanted;
const skyStep = (id, buys, label) => ({ id, buys, label, live: (app) => !!app.sky?.live(id), has: (app) => !!app.sky?.hasSaving(id), apply: (app, off) => { app.sky?.setSaving(id, off); } });
export const FEATURE_STEPS = [
  // --- 1. bought 2.5 ms and more on the phone
  // (5.0 ms at the opening view; the clumps left are wider: the ground stays covered)
  { id: 'grass-mid', buys: 5.0, label: 'thinner grass in the middle distance', live: (app) => (app.grass?.keepClumps ?? 0) > 0 && !!app.grass.mesh?.visible, apply: (app, off) => { app.grass?.setMidShare(off ? 0.5 : 1); } },
  // (7.0 ms in a wood)
  { id: 'trees-far', buys: 7.0, hold: true, label: "the trees' full shapes to two thirds of their distance", live: nearTrees, apply: (app, off) => { app.trees?.setFraction(off ? 0.66 : 1); } },
  // (3.6 ms at the opening view. It thins the far forest and shortens its reach; a wood
  // stays a wood: the thinned trees stand wider, see life/farForest.js)
  { id: 'far-trees', buys: 3.6, label: 'the far forest thinned', live: (app) => !!app.farForest?.shown && app.farForest.count > 0, apply: (app, off) => { app.farForest?.setFraction(off ? 0.45 : 1); } },
  // (11.5 ms in a wood: the most of any step; after the others here because it is seen from nearest)
  { id: 'tree-leaves', buys: 11.5, hold: true, label: 'every leaf on the nearest trees', live: nearTrees, apply: (app, off) => { if (app.trees) { app.trees.closeOn = !off; app.trees.dirty = true; } } },
  // --- 2. bought a little
  // (1.6 ms in a wood)
  { id: 'grass', buys: 1.6, label: 'half the grass', live: (app) => (app.grass?.keepBlades ?? 0) > 0 && !!app.grass.mesh?.visible, apply: (app, off) => { app.grass?.setFraction(off ? 0.5 : 1); } },
  // (pollen in the air over flowers: 3 200 points at most, a point each; not yet measured on the phone, a guess)
  { id: 'pollen', buys: 0.3, label: 'less pollen in the air', live: (app) => !!app.pollen?.mesh?.visible, apply: (app, off) => { app.pollen?.setShare(off ? 0.4 : 1); } },
  // (the clouds plan's, not yet built nor measured: the plan's estimates)
  // (sky-faults: the far heaps read at three heights along each line of sight, so that a heap far
  // off has a top, a side and an underside; with the step on they are read once, flat, in the
  // same places. A guess until the phone's cost table says: up to six more looks into the noise
  // on each pixel of far cloud, none on clear sky.)
  skyStep('cloud-far', 1.0, 'far clouds flatter'),
  skyStep('cloud-upper', 0.5, 'middle and high cloud plainer'),
  skyStep('rain-shafts', 0.5, 'plainer rain shafts under the clouds'),
  skyStep('cloud-shade-rate', 0.3, "the clouds' shadows a little behind (every other frame)"),
  // (sky B: the lenses before the fog: a lens is a small thing high up, the fog what a valley at
  // first light is about; each thins and leaves the thing itself. Guesses until the phone says)
  skyStep('lenses', 0.2, 'fewer, plainer lens clouds over the peaks'),
  skyStep('fog-sheet', 0.3, 'valley fog drawn coarser'),
  // (the patches: the cost test cannot ask about them, the ground would have to settle
  // again each time; a guess. They are also what the governor gives up when the page's own
  // work is what is slow: see _down.)
  { id: 'terrain-1', buys: 1.5, label: 'terrain detail (fewer patches)', apply: (app, off) => { app.terrainBudget(off ? 0.8 : 1, 'terrain-1'); } },
  { id: 'terrain-2', buys: 1.5, label: 'terrain detail (fewer patches again)', apply: (app, off) => { app.terrainBudget(off ? 0.64 : 1, 'terrain-2'); } },
  // --- 3. the depth of the land and the sky seen from the air. With these off a traveller
  // coming down from space saw a flat map under a flat picture of clouds.
  // (the layer itself is never switched off: a hurricane with a clear sky is not one, and the
  // layer is one texture on the sky)
  // (the clouds plan's: the shadows kept, coarser; it takes the place of 'clouds' when its package lands)
  skyStep('cloud-shade-coarse', 0.5, 'coarser cloud shadows'),
  // (4.0 ms at the opening view)
  { id: 'clouds', buys: 4.0, label: "the clouds' shadows on the ground", live: (app) => !!app.clouds?.mesh?.visible, apply: (app, off) => { app.sky?.setSaving('clouds', off); } },
  // (3.5 ms at the opening view, 2.1 from the air)
  { id: 'far-relief', buys: 3.5, label: 'relief shading of far ground', live: (app) => (app.terrain?.shared?.uRelief?.value.x ?? 1) > 0, apply: (app, off) => { app.quality.w = off ? 0 : 1; } },
  // (9.4 ms from the air on build 6ac24ff)
  { id: 'cloud-volume', buys: 9.4, label: 'clouds with depth (they stay as a layer)', live: cloudVolume, apply: (app, off) => { app.sky?.setSaving('cloud-volume', off); } },
  // --- 4. nothing that could be measured on the phone (each line: its largest reading in the three views)
  // (The first four headed the ladder from the ninth results and bought nothing on the tenth:
  // a trial at the opening view took them before the savings that cure, and they came and
  // went some ten times a minute. Coarser cloud steps 0.7 / -5.2 / -4.0, and nothing at all
  // once the cloud volume is off: live only while the volume is drawn. The robe -1.1 / -1.0 /
  // 1.2: the page's own work, which cannot shorten a frame the GPU is late on. The fine
  // shadow tile -0.4 / 1.3. The glow 0.4 in one view.)
  { id: 'cloud-steps', buys: 0.3, label: 'coarser clouds near you', live: (app) => cloudVolume(app) && app.cloudVolume.enabled !== false, apply: (app, off) => { app.sky?.setSaving('cloud-steps', off); } },
  { id: 'cloak', buys: 0.3, label: 'robe and hair simulated more loosely', live: (app) => !!app.hero?.group?.visible && !app.hero.rigMesh, apply: (app, off) => { app.hero.robe.halfRate = off; } },
  // (the sculpted character, hero/heroSculpt.js: 120 000 triangles in the picture, or the 24 000 its shadow is drawn from.
  //  Not measured on the phone yet: a guess until a benchmark's cost table has it)
  { id: 'figure', buys: 0.3, label: 'the character drawn from fewer triangles', live: (app) => !!(app.hero?.rigMesh || app.hero?.sculpt) && !!app.hero.group?.visible, apply: (app, off) => { if (app.hero?.sculpt) app.hero.sculpt.light = off; if (app.hero?.rigMesh) app.hero.rigMesh.light = off; } },
  // (the shadow map's fine tile, some 20 m round the traveller at 3.9 cm a texel: without it
  // every shadow there, trees' and rocks' alike, is drawn from the 14.6 cm tile)
  { id: 'fine-shadows', buys: 0.3, hold: true, label: 'coarser shadows near you', apply: (app, off) => { app.nearShadow.fine = !off; } },
  { id: 'bloom', buys: 0.3, label: 'glow around bright things', apply: (app, off) => { app.post.bloomEnabled = !off; } },
  // (0.4 ms from the air, -2.3 and -7.9 elsewhere: noise. The ground's shader now reads
  // its close-up layers only where they can show, which is what this step used to save.)
  { id: 'detail', buys: 0.3, label: 'close-up ground detail', apply: (app, off) => { app.quality.x = off ? 0 : 1; } },
  // (living water: a river's lanes are worked out once instead of four times blended. The water
  // still runs; where the flow turns its lanes change at a line. And the waterfalls' mist goes; their
  // white sheets stay. Not measured on the phone yet: a guess.)
  { id: 'water', buys: 0.3, label: "running water's lanes drawn more simply", live: (app) => !!app.world?.surface?.sea, apply: (app, off) => { const u = app.terrain?.shared?.uWaterQ; if (u) u.value = off ? 0 : 1; app.falls?.setMist(!off); } },
  // (0.4 ms)
  { id: 'soft-shadows', buys: 0.3, hold: true, label: 'soft edges on rock and ship shadows', apply: (app, off) => { app.quality.y = off ? 0 : 1; } },
  // (nothing: -3.6 from the air)
  { id: 'contact', buys: 0.3, label: 'darkening at the foot of rocks and the lander', apply: (app, off) => { app.contact = !off; } },
  // (nothing in any view from the ground or 5 km up: it is a thing of the view from space)
  { id: 'edge-glow', buys: 0.3, label: "glow on a planet's edge at half detail", apply: (app, off) => { app.quality.z = off ? 0 : 1; } },
  // (0.4 ms)
  { id: 'dust', buys: 0.3, label: 'half the kicked-up dust, simpler cloud', apply: (app, off) => { app.dust.amount = off ? 0.5 : 1; } },
  // (nothing: -1.5)
  { id: 'rocks', buys: 0.3, label: 'half the rocks', apply: (app, off) => { app.rocks.setFraction(off ? 0.5 : 1); } },
  // (nothing: -1.1)
  { id: 'far-rock-shadows', buys: 0.3, label: 'shadows of far rocks', apply: (app, off) => { if (app.farRocks) app.farRocks.shadows = !off; } },
  // (nothing: -1.1. The rocks of the land itself, to a mile and more: the small ones are
  // seen from two thirds as far; the large ones, which are the hillside, stay)
  { id: 'far-rocks', buys: 0.3, label: 'small rocks from less far', apply: (app, off) => { app.farRocks?.setFraction(off ? 0.62 : 1); } },
  // (0.5 ms in dry weather, where there is none to thin; half of 5 600 streaks; thinning
  // 1 400 to 560 saved nothing that could be measured on the phone in a storm either)
  { id: 'rain', buys: 0.3, label: 'thinner rain and snow', live: (app) => !!app.rain?.mesh?.visible, apply: (app, off) => { app.sky?.setSaving('rain', off); } },
  // (nothing: -0.4)
  { id: 'leaves', buys: 0.3, label: 'leaves in the wind', apply: (app, off) => { if (app.leaves) app.leaves.enabled = !off; if (app.petals) app.petals.enabled = !off; if (app.treeLeaves) app.treeLeaves.enabled = !off; if (app.kicked) app.kicked.enabled = !off; } },          // (petals: thinned to a third, not taken away)
  // (the seasons' two: each tree's own carpet of fallen leaves in the ground's shading, a loop over
  // the eight nearest such trees for the ground within 90 m (the wood's own scatter and the
  // lying leaves stay); and the noise that breaks the snow line's edge (the line stays, plain).
  // Not yet measured on the phone.)
  { id: 'leaf-carpet', buys: 0.2, label: "each tree's carpet of leaves", apply: (app, off) => { app.leafCarpetOff = off; } },
  { id: 'snow-edge', buys: 0.2, label: "the snow line's broken edge", apply: (app, off) => { app.snowEdgeOff = off; } },          // (App.updateSnow hands it to the shaders)
  // (nothing: -0.7)
  { id: 'sun-beams', buys: 0.3, label: "the Sun's beams through trees and cloud", apply: (app, off) => { app.post.shaftsOn = !off; } },
  // (no step for the waves that lift the water: on the phone it saved nothing that could be
  // measured, at sea in a hurricane (seventh results), and a sea that lies flat is not a sea)
  // (nothing: -0.5 and -2.8)
  { id: 'air-shadow', buys: 0.3, label: 'terrain shadows in the haze', apply: (app, off) => { app.atmosphere.airEnabled = !off; } },
  // (nothing: -0.5 / -6.8 / -2.6 on the tenth results, where it stood second in the ladder at
  // the ninth's 2.7 and was among the first savings taken in a wood. With it on, every tree
  // past the near trees' radius (60 m) casts no shadow, and walking in a wood some 20 a second
  // pop on or off at that line. Last.)
  // (and the far forest's shadows on the ground, drawn for a traveller in the air: life/farForest.js)
  { id: 'tree-shadows', buys: 0.3, hold: true, label: 'shadows of the farther trees', live: (app) => nearTrees(app) || !!app.farForest?.shadowsShown, apply: (app, off) => { if (app.trees) app.trees.shadowsFar = !off; if (app.farForest) app.farForest.shadows = !off; } },
];
const STRIDE_MS = 2.5;          // a stride down takes steps until they are expected to buy this much

const RES_STEP = 0.88;          // each resolution step keeps 88 % of the pixels (about 6 % per side)
// (Eighth phone results, build f300e6f: a frame at 1.00 MP took 40.5 ms in the cost test, at
// 2.07 MP 44.3, at native 57.5: under two megapixels the picture's size is hardly what a
// frame costs, and one million pixels on a 4.45 million pixel screen is a blur.)
const MIN_PIXELS = 1.6e6;
const START_SMOOTH = 5;         // Smooth at a place never seen starts this many steps down (53 % of the pixels)
// Sharp: pixels go first only down to this level (60 % of native: 2.67 MP on the test
// phone) while a saving known to buy a stride is left, and below it they come back before
// the savings; a visit never starts below it. (The tenth phone results: under it, a step
// bought about 0.45 ms on Haven, while far relief, the far rocks' shadows and the clouds'
// shadows each bought more than the whole way from 2.67 MP down to 1.60.)
export const KEEP = 4;
const WINDOW = 24;              // frames looked at for "are we missing the target"
const GOOD_AFTER = 20;           // seconds without a step down that make a resolution level "known good"
const MAX_VSYNC = 1000 / 57;    // no screen we care about refreshes slower than this
// A saving that changes shadows in view (`hold`) comes back only while the traveller is
// still (under STILL m/s, over about a second) or HOLD_M from where it was taken (the wide
// shadow tile's width: none of the shadows it changed is near any more).
const HOLD_M = 150, STILL = 0.5;

// A frame is late when it takes more than LATE x its interval (in Sharp at 60 Hz: three
// refreshes or more). The benchmark counts late frames by the same measure.
export const LATE = 1.2;
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
    this.off = [];                // the FEATURE_STEPS switched off (their numbers, in the order they went)
    this._single = 0;             // how many of the next returns bring one step back, not five (see _up)
    this._alone = new Set();      // savings that made frames late again when they came back by themselves: what the frames need
    // Whose turn it is to come back where the resolution comes back first (with only such
    // savings on; in Sharp under KEEP): the resolution's, until a step of it up is taken back;
    // then the savings', until one that came back by itself is taken back (see _up).
    this._featTurn = false;
    // Fewer pixels were tried here and cured nothing: the next trial is of the savings, at the
    // resolution that stands (before, they were only ever tried at the fewest pixels, and a
    // view whose frames wait for something other than pixels stayed late at full size for good:
    // on the test phone the opening view costs the same at 2 MP as at 4.45).
    this._featFirst = false;
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
    // The savings that change shadows in view, while on: where each was taken ([x, y, z], or
    // null where the app does not say; see _released); where the traveller was at the last
    // frame (_atOk: whether it is known), and how fast it has been going (m/s, over about a
    // second).
    this._held = new Map(); this._at = [0, 0, 0]; this._atOk = false; this.speed = 0;
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
  // The level a visit starts at, from the level remembered for the place in this mode (k, or
  // nothing). (A place never seen: Smooth starts at about half the pixels and climbs, which
  // costs a few seconds of a softer picture; starting high costs seconds of half-rate frames.)
  // In Sharp never below KEEP: on the tenth phone results Haven was remembered at 1.82 MP,
  // every visit began there, and from there the governor never left the floor; started at
  // native, the same phone held 3.47 MP.
  _startLevel(k) {
    let level = Number.isFinite(k) ? k : this.mode === 'smooth' ? START_SMOOTH : 0;
    if (this.mode === 'sharp') level = Math.min(level, KEEP);
    return Math.max(0, Math.min(this.maxResLevel, Math.round(level)));
  }
  arrive(place) {
    this.place = place;
    if (this.fixed != null || !this._started) return;
    this.resLevel = this._startLevel(this.known?.[this._key(place)]);
    this._applyScale();
    this.jumped();                             // (a new world is a new view: what jumped() leaves behind, and more)
    this.holdUp = 3; this.cooldown = 1.0; this.cleanTime = 0; this._filled = 0; this.lastUpFailed = false; this._probeFrames = -1;
    // (a step up taken before this is not this place's or this mode's to take back)
    this._upList = null; this._upFeat = 0; this._upFrom = null; this.sinceUp = 1e9; this._single = 0; this._alone.clear(); this._featTurn = false; this._featFirst = false;
    this.goodLevel = null; this.sinceDown = 0; this._learned = null;
    this._dip = null; this.immune = this.featImmune = 0; this.immuneFor = 30;
    this._note(`${place}: starting at ${(this.pixels / 1e6).toFixed(2)} MP`);
  }

  // The traveller jumped to a bookmark (App.applyBookmark; a world switch goes through
  // arrive): what is on trial was judged by frames of the view left behind. A trial started
  // at a heavy view was closed at a light one as a cure, and savings that came back at a
  // light view were taken back by the late frames of the next heavy one (the tenth phone
  // results, the ledge's trial: closed at the next stop, its savings back and off again).
  // The trial, the watch on the last step up, whose turn it is to come back and the late
  // frames counted are left behind; what was given up stays given up, and the new view's own
  // frames decide from here. (The shadows in view are all new: none waits for the traveller
  // to move on.)
  // (The late share is let down to what is left alone as nothing here cures it, bg, which
  // stays learned. It fades only over frames that take in no ground, and most frames at a
  // new view do: the heavy ship stop's share started a trial at the light dusk stop after
  // it, with no late frame of its own, and took the picture to the floor for the flight.)
  // (What failures taught, the wait before a step up and the savings the frames need, is
  // kept: left behind as well, Haven's heavy stops found them again each time, a third more
  // savings switched and late frames from 12 to 13-16 % in the route's replay.)
  jumped() {
    if (this.fixed != null) return;
    this._dip = null; this._probeFrames = -1; this.overTime = 0; this._filled = 0; this.cleanTime = 0;
    this.sinceUp = 1e9; this._upList = null; this._upFeat = 0; this._upFrom = null; this._featTurn = false;
    this.lateEMA = this.bg; this.lateFast = Math.min(this.lateFast, this.bg);
    this._held.clear(); this._atOk = false;
  }

  // A fresh start at a place, as at the page's own start: every saving off, the terrain
  // levers let go, nothing learned about late frames, the clock at zero and the log empty
  // (its times are then the run's, and none of its lines is lost to the 400 it keeps). The
  // benchmark starts with it, so that a run measures the governor and not what play before
  // it left behind (the tenth results began at 1.82 MP, remembered from earlier play, and
  // printed a share of "the device's own" late frames it had not learned in the run).
  fresh(place) {
    this.log.length = 0;
    if (this.fixed != null) return;
    this.allOn();
    if (this.loadLevel) { this.loadLevel = 0; this.app.terrainBudget?.(1, 'load'); }
    if (this.streamLevel) { this.streamLevel = 0; this.app.terrainPace?.(0); }
    this.loadHold = 15; this.loadUpFailed = false; this.leverClean = 0; this.sinceLoadUp = 1e9;
    this.bg = 0; this.lateEMA = 0; this.lateFast = 0; this.overTime = 0;
    this.time = 0; this.sinceStep = 1e9;
    this.arrive(place);
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
        this.allOn();
        this.resLevel = 0;
        if (this.loadLevel) { this.loadLevel = 0; this.app.terrainBudget?.(1, 'load'); }      // "everything on" includes the patches
      }
      if (this.streamLevel) { this.streamLevel = 0; this.app.terrainPace?.(0); }
      this._applyScale();
    }
    // A new target: forget what was learned and look again from where we are.
    this.holdUp = 3; this.cooldown = 1.0; this.cleanTime = 0; this._filled = 0; this.lastUpFailed = false; this._probeFrames = -1;
    // (a step up taken before this is not this place's or this mode's to take back)
    this._upList = null; this._upFeat = 0; this._upFrom = null; this.sinceUp = 1e9; this._single = 0; this._alone.clear(); this._featTurn = false; this._featFirst = false;
    this.goodLevel = null; this.sinceDown = 0; this.loadHold = 15; this.loadUpFailed = false; this.leverClean = 0;
    this._dip = null; this.immune = this.featImmune = 0; this.immuneFor = 30; this.lateEMA = 0;
    {
      // (the new mode's own memory of this place, if it has one)
      const k = this.fixed == null && this.place ? this.known?.[this._key(this.place, mode)] : null;
      if (Number.isFinite(k)) { this.resLevel = this._startLevel(k); this._applyScale(); }
      this._learned = null;
    }
    this._note(`mode ${MODES[mode].label}, starting at ${(this.pixels / 1e6).toFixed(2)} MP`);
  }

  // How many savings are on.
  get featureLevel() { return this.off.length; }
  // The names of the savings that are on.
  get offIds() { return this.off.map((i) => FEATURE_STEPS[i].id); }
  isOff(id) { return this.off.some((i) => FEATURE_STEPS[i].id === id); }
  // The next step to take: the first in the order that is not off and can buy something
  // where the traveller is (-1: none).
  _nextStep() {
    for (let i = 0; i < FEATURE_STEPS.length; i++) if (!this.off.includes(i) && this._live(i)) return i;
    return -1;
  }
  // True while a step known to buy a stride's worth by itself is live and not yet taken.
  _bigLeft() {
    for (let i = 0; i < FEATURE_STEPS.length; i++) if ((FEATURE_STEPS[i].buys ?? 1) >= STRIDE_MS && !this.off.includes(i) && this._live(i)) return true;
    return false;
  }
  // Whether step i can buy anything where the traveller is (its `live`; without one, always).
  _live(i) {
    const f = FEATURE_STEPS[i];
    if (!f.live) return true;
    try { return !!f.live(this.app); } catch { return true; }
  }
  _stepOff(i, note = true) {
    const f = FEATURE_STEPS[i]; f.apply(this.app, true); this.off.push(i);
    if (f.hold) { const p = this._pos(); this._held.set(i, p ? [p.x, p.y, p.z] : null); }
    if (note) this._note(`off: ${f.label}`);
    return f;
  }
  _stepOn(note = true) { const i = this.off.pop(), f = FEATURE_STEPS[i]; f.apply(this.app, false); this._held.delete(i); if (note) this._note(`back on: ${f.label}`); return i; }
  // Where the traveller is (metres, planet-fixed: the rig's own vector, read at once and never
  // kept), or null where the app does not say. The rig says (`travellerAt`): on foot the
  // figure's soles, not the camera, which circles the figure 6 m behind it as the view turns
  // (turning in place faster than 5 degrees a second moved it faster than STILL); in flight
  // the camera, which the figure is drawn just ahead of.
  _pos() { const p = this.app.rig?.travellerAt; return p && Number.isFinite(p.x) ? p : null; }
  // Whether saving i may come back now. One that changes shadows in view waits for the
  // traveller to stand still or to be HOLD_M from where it was taken: coming back while one
  // walks among the shadows it changed, it changes them a second time in view, and a third
  // when the frames cannot bear it (the governor's hunting switched every shadow near the
  // traveller between sharp and blurred three times in 11 s of the tenth benchmark). The
  // rest may come back at any time. (Where the app says nothing of where the traveller is,
  // nothing is waited for.)
  _released(i) {
    const at = this._held.get(i), p = at && this._pos();
    if (!p) return true;
    return this.speed < STILL || Math.hypot(p.x - at[0], p.y - at[1], p.z - at[2]) > HOLD_M;
  }
  // Every saving off again, at once (the benchmark's cost test, a change of mode); returns
  // what was on, for `restoreSavings`.
  allOn() { const was = this.off.slice(); while (this.off.length) this._stepOn(false); this._alone.clear(); this._upList = null; this._upFeat = 0; return was; }
  restoreSavings(list) { this.allOn(); for (const i of list) this._stepOff(i, false); }

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
    // (how fast the traveller goes, for the savings that wait for it to stand still: _released)
    {
      const p = this._pos(), a = this._at;
      if (p && this._atOk && dt > 0) { const v = Math.hypot(p.x - a[0], p.y - a[1], p.z - a[2]) / dt; this.speed += (v - this.speed) * Math.min(1, dt); }
      if (p) { a[0] = p.x; a[1] = p.y; a[2] = p.z; }
      this._atOk = !!p;
    }
    if (kind === FRAME.IGNORE) return;
    this._script[this._ri] = scriptMs;
    // A level that has run this long without a step down is one the device can hold: after
    // a passing dip (a burst of terrain loading) the way back is one jump, not a climb.
    if (this.featureLevel === 0 && this.sinceDown > GOOD_AFTER && (this.goodLevel == null || this.resLevel < this.goodLevel)) this.goodLevel = this.resLevel;
    // ... and it is what this place is remembered by.
    // (not while a step up is still on trial: one that is taken back must not be remembered)
    // (with savings on as well: a place that needs them needs at least this few pixels, and a
    // visit that starts there is spared a dive. Haven was remembered at the floor in Sharp, and
    // every later visit began there, on the tenth phone results; what keeps a visit in Sharp
    // off the floor is the one rule of where it starts, _startLevel. Learning only with every
    // saving off left a heavy place in Smooth unremembered, and every visit began at 2.35 MP
    // and dived to the floor again.)
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
    // (only while the late frames are recent: the long average remembers a trial's first late
    // frames for some 15 s at 30 a second, and would take back a saving that came back clean)
    if (this.lateEMA > tol + 0.01 && this.lateFast > tol && this.resLevel < this.maxResLevel && this._filled >= WINDOW) this.overTime += dt; else this.overTime = 0;
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
      // (A step of the resolution up to KEEP or under it, in Sharp, is suspected for as long
      // as a slow drift is, whatever noticed the late frames: a trial there takes savings
      // first, not the pixels that came back. A step that made one frame in seven late tripped
      // the window 4.2 s after it, and the trial gave up ten savings that bought nothing.)
      const resUp = this._upFrom != null && this.mode === 'sharp' && this.resLevel >= KEEP;
      const tookBack = this.sinceUp < (trigger && !resUp ? 4 : 12) && !this._dip;
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
      // (once: the same step up is not taken back again by the next late window)
      if (tookBack) { this.holdUp = Math.min(60, this.holdUp * 2); this.lastUpFailed = true; this._takeBack(); this.overTime = 0; this.sinceUp = 1e9; }
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
        // (the floor: the fewest pixels, and no step left that could buy anything here)
        const atFloor = this.resLevel >= this.maxResLevel && this._nextStep() < 0;
        // Giving quality up is a trial. Some frames late (not most), two steps taken, and
        // about as many late as before: pixels are not why. Or everything given up and the
        // frames as long as they were. Then what was given up comes back, and for a while
        // (longer each time it happens at a place) such lateness is left alone: a blurred
        // picture with the same late frames is the worse of the two.
        // (On the test phone every stop had its late frames at one million pixels with
        // every saving on, and it sat there for whole benchmarks.)
        // (once the savings are being tried, the trial is not judged while a step that has
        // been shown to buy a stride's worth by itself is still untried and live here: a
        // trial that ends before the steps that could cure the frames has proved nothing.
        // The small steps after them never hold a verdict up.)
        // (a trial of fewer pixels, not yet of savings: what its strides took, as _down chose them.
        // In Sharp at KEEP the savings go before the pixels; such a trial judged as one of pixels
        // was put back after two strides with a saving that buys a stride still untried.)
        const resTrial = d && !d.feat1 && !d.feats && this.resLevel < this.maxResLevel;
        // (a trial of savings has spent its levers when none that buys a stride is left and,
        // unless fewer pixels were shown to cure nothing (feat1), a step of the resolution has
        // been tried after them: in Sharp at KEEP and under it the savings go first, and such a
        // trial judged when they ran out put everything back without the one step that cured)
        const spent = d && !this._bigLeft() && (d.feat1 || this.resLevel > d.res || this.resLevel >= this.maxResLevel);
        const futile = d && ((d.m0 < 0.6 && d.n >= 2 && (resTrial || spent) && m > 0.7 * d.m0) || (atFloor && d.n >= 2 && mean > 0.85 * d.dt0));
        // (and the savings alone, when the resolution's steps did help: with every one of
        // them on and the frames as long as when the first was switched on, they come back
        // and the resolution stays where it holds)
        const featFutile = d && !futile && atFloor && d.dtF != null && mean > 0.85 * d.dtF;
        // (fewer pixels cured nothing and the savings are untried: they are next, at once)
        // (most frames late, a stride of fewer pixels taken, and the frames as long as they
        // were: pixels are not what they wait for. The same verdict, without the dive to the
        // fewest pixels that used to come first.)
        const notPixels = resTrial && d.m0 >= 0.6 && d.n >= 1 && this.resLevel > d.res && mean > 0.92 * d.dt0;
        // (only a trial started by a burst of late frames: one started by the slow drift of
        // the late share is the device's own, and learns that, as before)
        if ((futile || notPixels) && resTrial && !d.probe && !this._featFirst && this._bigLeft()) { this._putBack(d, true); this.immune = 0; this._featFirst = true; }
        else if (futile) { this._putBack(d, true); this._featFirst = false; if (d.m0 < 0.6) this.bg = Math.max(this.bg, Math.min(0.12, 0.9 * Math.min(m, this.lateEMA))); }
        else if (featFutile) this._putBack(d, false);
        // (a trial that began for a few late frames, and a step that cut them: it is over)
        else if (d && d.probe && m <= 0.7 * d.m0) { this._dip = null; this.overTime = 0; }
        else if (this.time < this.immune && (f < 0.6 || this._immuneAll)) { /* tried here a moment ago, and it cured nothing */ }
        else if (atFloor) { /* nothing left to give up */ }
        else if (this.time < this.featImmune && this.resLevel >= this.maxResLevel) { /* the savings were tried a moment ago, for nothing */ }
        else {
          if (!d) this._dip = { res: this.resLevel, feat: this.featureLevel, m0: m, dt0: mean, n: 0, dtF: null, probe: !trigger, bought: 0, feat1: this._featFirst, feats: false };
          // (how long the frames are when the first saving is about to go)
          if (this._dip.dtF == null && this.resLevel >= this.maxResLevel) this._dip.dtF = mean;
          this._dip.n++;
          this._dip.bought += this._down(f > 0.8 ? 4 : f > 0.6 ? 3 : f > 0.4 ? 2 : 1, work || streaming);
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
    // (a step up that may not be taken now, every saving on waiting at full resolution, is no
    // step: nothing to watch, nothing to take back)
    if (this.cleanTime > this.holdUp && slack && (this.resLevel > 0 || this.featureLevel > 0) && this._up()) {
      // The previous step up held: be a little quicker to try the next one.
      if (!this.lastUpFailed) this.holdUp = Math.max(3, this.holdUp * 0.5);
      this.lastUpFailed = false;
      this.sinceUp = 0; this.cooldown = 1.2; this.cleanTime = 0; this._probeFrames = 0; this._probeLate = 0;
    }
  }

  // Every saving switched on: where a device that cannot keep up ends. (For pictures and
  // tests of what is left then; the governor steps back up from it as usual.)
  // (all of them, live or not: the floor is the same picture wherever it is asked for)
  toFloor() { for (let i = 0; i < FEATURE_STEPS.length; i++) if (!this.off.includes(i)) this._stepOff(i, false); }

  // Lower resolution first, then features. But resolution only cures frames that are slow
  // because of pixels. When the page's own work fills most of the frame (draw calls, terrain
  // arriving, the simulation), fewer pixels change nothing: on the test phone a 10 s stretch
  // of such frames once took the picture from 4.45 to 1.60 megapixels, eight steps, without
  // curing one. Then terrain patches go instead (fewer draw calls, less arriving), twice at
  // most; the other features cost pixels and would not help either.
  // Returns what the steps taken are expected to buy (ms a frame; a resolution step counts
  // as one stride's worth).
  _down(steps, work = false) {
    if (work) {
      if (this.loadLevel < LOAD.length - 1) {
        // (patches that came back and at once had to go again: wait longer before the next try)
        if (this.sinceLoadUp < 10) { this.loadHold = Math.min(120, this.loadHold * 2); this.loadUpFailed = true; }
        this.loadLevel++; this.app.terrainBudget?.(LOAD[this.loadLevel], 'load'); this._note(`fewer terrain patches (x${LOAD[this.loadLevel]}): the work per frame is what is slow`); this.sinceStep = 0; this.sinceDown = 0;
        return STRIDE_MS;
      }
      if (this._hold) return 0;             // the work alone fills the frame: nothing here cures it
    }
    let bought = 0;
    for (let s = 0; s < steps; s++) {
      // (the savings first where fewer pixels have just been shown to cure nothing, while one
      // known to buy something is untried; then the pixels again: every lever falls through)
      // (in Sharp, pixels only down to KEEP while such a saving is left: under it a step of
      // resolution buys less than any of them, and costs the picture its sharpness)
      const featNow = (this._featFirst || (this.mode === 'sharp' && this.resLevel >= KEEP)) && this._bigLeft();
      if (this.resLevel < this.maxResLevel && !featNow) { this.resLevel++; this._applyScale(); this._note(`resolution down to ${(this.pixels / 1e6).toFixed(2)} MP`); bought += STRIDE_MS; }
      else {
        // a stride: steps that can buy something here, until they should have bought STRIDE_MS
        let got = 0;
        while (got < STRIDE_MS) { const i = this._nextStep(); if (i < 0) break; got += this._stepOff(i).buys ?? 1; }
        if (got === 0) return bought;       // nothing left to give up
        bought += got;
        if (this._dip) this._dip.feats = true;        // (the trial is one of savings now: its verdict, see update)
      }
      this.sinceStep = 0; this.sinceDown = 0;
    }
    return bought;
  }

  // A trial of steps down that cured nothing: the features and the resolution it began
  // with come back, and lateness of that kind is left alone for a while.
  // all: the resolution too (nothing helped); else only the savings (the resolution's steps did).
  _putBack(d, all) {
    while (this.featureLevel > d.feat) this._stepOn(false);
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
      this.sinceStep = 0; this.sinceDown = 0; this._featTurn = true;
    } else if (this._upFeat) {
      // (the very steps that had come back, in the order they had gone)
      // (several came back together: they go to the front again and come back one at a
      // time, to find which of them it was. One came back alone: it is what the frames
      // need; to the end of the line, and the resolution may be tried while it stays off.)
      const list = (this._upList || []).filter((i) => !this.off.includes(i));
      for (const i of list) this._stepOff(i);
      if (list.length > 1) { this.off = list.concat(this.off.filter((i) => !list.includes(i))); this._single = list.length; }
      else if (list.length === 1) { this._alone.add(list[0]); this._featTurn = false; }
      this._upList = null;
      this.sinceStep = 0; this.sinceDown = 0;
    } else this._down(1);
    this.goodLevel = null; this._upFrom = null; this._upFeat = 0;
  }

  // A step up: savings back, or resolution. Returns whether it took a step, to be watched
  // (false: there was nothing it may do now, or only savings that change nothing here came back).
  _up() {
    // (how many savings may come back now: one that changes shadows in view waits, _released;
    // and how many can buy nothing where the traveller is)
    let nFree = 0, nIdle = 0;
    for (let k = 0; k < this.off.length; k++) { const i = this.off[k]; if (!this._live(i)) nIdle++; else if (this._released(i)) nFree++; }
    // (nothing may come back and the picture is whole: no step. This is asked every frame
    // while it lasts, so it is answered before anything is made)
    if (!nFree && !nIdle && this.resLevel === 0) return false;
    // (the savings that can buy nothing here come back with this step, whatever it is, and are
    // not among what it may take back: they change nothing here, as they were passed over on
    // the way down. Coming back first gone, first back, one step each, from the air the
    // ground's savings went before the clouds with depth and far relief, which were off for
    // half the flight from Haven)
    if (nIdle) {
      const idle = this.off.filter((i) => !this._live(i));
      this.off = this.off.filter((i) => this._live(i));
      for (const i of idle) { const f = FEATURE_STEPS[i]; f.apply(this.app, false); this._held.delete(i); this._note(`back on: ${f.label}`); }
      if (!nFree && this.resLevel === 0) return false;        // (no step to watch: nothing here has changed)
    }
    // (when every saving still on is one the frames need, the resolution is not held down
    // by them for good: it and they take turns at coming back. A sharp picture with thinner
    // grass in the middle distance is better than a soft one with the same.)
    const needed = this.featureLevel > 0 && this.resLevel > 0 && this.off.every((i) => this._alone.has(i));
    // (in Sharp under KEEP the resolution comes back first, as it went last (_down), by the
    // same turns: where it cannot hold more pixels, the savings come back while it waits.
    // Without the turns, in a view whose frames are pixels alone, every saving taken on the
    // way down stayed on for good, buying nothing, while each step of the resolution up was
    // taken back)
    const under = this.mode === 'sharp' && this.resLevel > KEEP;
    // (the resolution keeps the turn while its steps hold; a step of it that fails hands the
    // turn to the savings, and one of them that came back by itself and fails hands it back:
    // _takeBack. And while every saving on waits, the resolution does not wait with them.)
    const res = ((needed || under) && !this._featTurn) || (this.resLevel > 0 && !nFree);
    if (nFree && !res) {
      const free = this.off.filter((i) => this._released(i));
      // (five at a time: after a passing dip, a burst of ground arriving, the way back up
      // through twenty savings one by one took two minutes of a picture with nothing in it)
      // (the ones that went first come back first: a trial takes steps until one cures the
      // frames, and the ones before it bought nothing. When what has come back makes frames
      // late again it goes off again, to the end of the line (_takeBack), and the next to
      // come back are others: what stays off in the end is what the frames need. After a
      // return that failed, the next few come back one at a time, to find which it was.)
      // (one that changes shadows in view comes back by itself: if the frames cannot bear it,
      // only its shadows change twice, and it is known at once to be the one. Wherever the
      // traveller is, said or not: the app always says, and the simulations are its pace.
      // It costs steps on the way back from the floor (every saving off again after 36 s
      // against 18), and saves them where a hold saving follows one the frames need: on the
      // opening view the thinner grass then came back alone and was known at once; in groups
      // of five the trees' savings stayed off 34 and 40 s, buying nothing)
      const back = [], many = this._single > 0 ? 1 : 5;
      if (this._single > 0) this._single--;
      for (const i of free) {
        if (FEATURE_STEPS[i].hold && back.length) break;
        back.push(i);
        if (FEATURE_STEPS[i].hold || back.length >= many) break;
      }
      this.off = this.off.filter((i) => !back.includes(i));
      for (const i of back) { const f = FEATURE_STEPS[i]; f.apply(this.app, false); this._held.delete(i); this._note(`back on: ${f.label}`); }
      this._upFeat = back.length; this._upList = back; this._upFrom = null;
    } else if (this.resLevel > 0) {
      this._upFeat = 0; this._upList = null;
      this._upFrom = this.resLevel;
      this.resLevel = this.goodLevel != null && this.goodLevel < this.resLevel ? this.goodLevel : this.resLevel - 1;
      this._applyScale(); this._note(`resolution up to ${(this.pixels / 1e6).toFixed(2)} MP`);
    } else return false;
    this.sinceStep = 0;
    return true;
  }

  _note(text) {
    this.log.push({ t: +this.time.toFixed(1), text });
    if (this.log.length > 400) this.log.shift();
    this.onStep?.(text);
  }
}
