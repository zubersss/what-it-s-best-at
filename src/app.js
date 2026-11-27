// Owns the renderer and the frame loop. Order of work per frame is documented in
// docs/ARCHITECTURE.md ("Frame order").
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G } from './render/globals.js';
import { WORLDS } from './worlds/index.js';
import { SOLAR_SYSTEM, AU_M } from './worlds/solarSystem.js';
import { Ephemeris, dateToJD, jdToDate, elevationAzimuth, latLonToDir } from './core/ephemeris.js';
import { PostPipeline } from './post/post.js';
import { Profile, PARTS } from './perf/profile.js';
import { Look } from './render/look.js';
import { Grass } from './life/grass.js';
import { Pollen } from './life/pollen.js';
import { Falls } from './water/falls.js';
import { Governor, MODES, FRAME } from './perf/governor.js';
import { Benchmark } from './perf/benchmark.js';
import { waveHeightAt, waveScale, detailUvAt } from './water/waves.js';
import { surfTurn, surfHeight, surfLift } from './water/surf.js';
import { Trees } from './life/trees.js';
import { FarForest } from './life/farForest.js';
import { Leaves, Petals } from './life/leaves.js';
import { lifeDay, yearAt, seasonLabel, untilSeason, SEASON_NAMES, yearMs, dayMs } from './life/season.js';
import { overdraw } from './perf/overdraw.js';
import { SkySystem } from './sky/skySystem.js';

const SWIM_DEPTH = 1.25;        // metres of water a standing figure sinks into before it floats
import { StartScreen, ResultsScreen, BenchBanner, Toast } from './ui/screens.js';
import { immersive, keepAwake } from './ui/device.js';
import { BUILD } from './core/build.js';
import { Hud, HUD } from './debug/hud.js';
import { Input } from './controls/input.js';
import { CameraRig } from './controls/cameraRig.js';
import { flightBase } from './controls/speedLaw.js';
import { aimDirection, gapTo, standoff, transferMult, tripTime, groundDistance, OVER_PLACE } from './controls/autopilot.js';
import { TargetMarker } from './ui/targetMarker.js';
import { TargetPicker } from './ui/targetPicker.js';
import { Menu } from './ui/menu.js';
import { SystemMap } from './ui/map.js';
import { Warp } from './fx/warp.js';
import { Save } from './core/save.js';
import { Journal } from './ui/journal.js';
import { Audio } from './audio/audio.js';
import { surroundings } from './controls/gravity.js';
import { TouchControls } from './controls/touch.js';
import { Atmosphere } from './atmosphere/atmosphere.js';
import { makeSkyDome } from './sky/skyDome.js';
import { SunDisc } from './sky/sun.js';
import { makeStars } from './sky/stars.js';
import { SkyBodies } from './sky/bodies.js';
import { NearShadow } from './shadows/nearShadow.js';
import { Rocks } from './rocks/rocks.js';
import { FarRocks } from './rocks/farRocks.js';
import { Lander } from './ship/lander.js';
import { Hero } from './hero/hero.js';
import { HeroSculpt } from './hero/heroSculpt.js';
import { Dust } from './fx/dust.js';
import { createHeightSource, loadRasters } from './terrain/height/heightSource.js';
import { Terrain } from './terrain/terrain.js';

const C_LIGHT = 299792458;
// The canvas's size as a share of the screen's pixels (App.fitCanvas): the governor's
// resolution levels 0, 4, 8 and 12 (0.88 to those powers).
const CANVAS_STEPS = [1, 0.5997, 0.3596, 0.2157];
// What the camera reads while a full-screen panel is open: nothing is pressed.
const NO_INPUT = { dx: 0, dy: 0, wheel: 0, moveX: 0, moveY: 0, down: () => false, hit: () => false };

function fmtDistance(m) {
  if (!Number.isFinite(m)) return '-';
  if (m < 1e4) return m.toFixed(0) + ' m';
  if (m < 1e9) return (m / 1e3).toFixed(m < 1e6 ? 1 : 0) + ' km';
  return (m / AU_M).toFixed(3) + ' AU';
}
function fmtSpeed(v) {
  if (v < 1e3) return v.toFixed(1) + ' m/s';
  if (v < 3e6) return (v / 1e3).toFixed(1) + ' km/s';
  return (v / C_LIGHT).toFixed(2) + ' c';
}

function fmtTime(s) {
  if (!Number.isFinite(s)) return '';
  if (s < 90) return `${Math.max(1, Math.round(s))} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}
const titleCase = (id) => id.charAt(0).toUpperCase() + id.slice(1);

// Character poses on foot for screenshots: speed in m/s, and whether it is in the air.
// land: 0.35 s into a hard landing (the three-point kneel); launch: up held in a jump.
const FOOT_POSES = { stand: { speed: 0 }, walk: { speed: 1.6 }, run: { speed: 5.5 }, super: { speed: 45 }, jump: { speed: 4, jump: true },
  land: { speed: 0.6, landSpeed: 14 }, launch: { speed: 0, jump: true, upHeld: 0.3 } };     // (land creeps sideways so the figure turns side-on)

// How fast the clock may run (seconds of the world's time per second), and what to call it.
const RATES = [-864000, -86400, -21600, -3600, -600, -60, 1, 60, 600, 3600, 21600, 86400, 864000];
function rateLabel(r) {
  const a = Math.abs(r), t = a >= 86400 ? `${a / 86400} day${a > 86400 ? 's' : ''}` : a >= 3600 ? `${a / 3600} hour${a > 3600 ? 's' : ''}` : `${a / 60} minute${a > 60 ? 's' : ''}`;
  return `${t} a second${r < 0 ? ', backwards' : ''}`;
}
// The clock stays inside the years the orbits were fitted for (1950 to 2100).
const JD_MIN = 2433282.5, JD_MAX = 2488069.5;

export class App {
  constructor({ canvas, context, world, params }) {
    this.canvas = canvas; this.world = world; this.params = params;
    this.shotMode = !!params.shot;
    const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // we do our own tone map + encoding
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.sortObjects = true;
    this.renderer = renderer;
    // A shader that fails to compile or link on this device draws nothing, silently (on
    // phones the ground vanished when its shader read one texture more than they allow).
    // Say so on screen and in the benchmark results.
    this.shaderErrors = [];
    renderer.debug.onShaderError = (gl, program, vs, fs) => {
      const log = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].filter(Boolean).join(' | ').trim();
      const first = (log.split('\n').find((l) => l.trim()) || 'no log').slice(0, 200);
      this.shaderErrors.push(first);
      console.error('A shader failed on this device:', log);
      this.toast?.show(`Something failed to draw on this device. Please send a screenshot: ${first}`, 20000);
    };

    this.ephemeris = new Ephemeris(SOLAR_SYSTEM, world.body);
    this.baseJD = dateToJD(Date.parse(world.scene.dateUTC));
    this.timeOffsetHours = 0;
    this.paused = this.shotMode;
    this.timeRate = 1;                 // seconds of the world's clock per second (see setTimeRate)
    this.save = new Save();            // places found, the last place on each world, the sound switch
    this.audio = new Audio(); this.audio.on = this.save.data.sound !== false;
    this.frameCount = 0;
    this.lastNow = 0;
    this.stats = {};
    this.worldData = new Map();        // world id -> { world, rasters, hs }
    this.targetId = null; this.transfer = false; this.targetEta = Infinity;
    this.nearestName = ''; this.nearestClear = Infinity;
    const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || 'unknown');
    // Moments after which a slow frame has a known cause (see frameCause).
    this.jumpedAt = this.switchedAt = this.resumedAt = this.resizedAt = -1e9;
    this.lastUploads = 0; this.hiddenCount = 0; this.loadedAt = Infinity;
    this.quality = G.uQuality.value;   // governor switches: x close-up ground detail, y soft shadow edges
    this.terrainFactors = {};
    this.menuOpen = false;
  }

  // Rasters + main-thread height source of a world (cached; the other worlds are fetched
  // in the background so flying to them does not have to wait for a download).
  // A world's elevation data and height function. Loaded when first wanted (the start
  // world; another world once the traveller comes near it or aims a trip at it: see
  // space()), one download however many ask at once. Only the last three worlds are kept:
  // a world's rasters are megabytes, and there are many worlds.
  loadWorldData(world) {
    let p = this.worldData.get(world.id);
    if (!p) {
      p = loadRasters(world, import.meta.env.BASE_URL).then((rasters) => ({ world, rasters, hs: createHeightSource(world, rasters) }));
      this.worldData.set(world.id, p);
      p.catch(() => { if (this.worldData.get(world.id) === p) this.worldData.delete(world.id); });      // a failed download is tried again when next wanted
    }
    // (most recently wanted last; the home world is never dropped)
    this.worldData.delete(world.id); this.worldData.set(world.id, p);
    for (const id of this.worldData.keys()) { if (this.worldData.size <= 3) break; if (id !== this.world?.id) this.worldData.delete(id); }
    return p;
  }

  heightFn(world, hs) {
    const walkWL = 2 * (Math.PI / 2) * world.radius / (1 << world.terrain.maxLevel) / CONFIG.NORMAL_RES;
    this._sink = 0; this._under = 0; // (a world without water: nothing sinks; the last world's values must not stay)
    // (a traveller does not walk through a rock the size of a house: the ground rises over
    // the large far rocks; `_rise` is kept for the drawn ground asked for right after)
    this._rise = 0;
    const land = (d, h) => { const r = this.farRocks ? this.farRocks.riseAt(d, world.radius + h) : 0; this._rise = r; return h + r; };
    if (!world.surface.sea) return (d) => land(d, hs.height(d[0], d[1], d[2], walkWL));
    // Water does not carry a walker: what stands in it sinks to the bed or to SWIM_DEPTH,
    // whichever comes first, and rides the waves where it floats. (`_sink` is kept for the
    // drawn ground asked for the same place right after: see rig.groundAt in init.)
    const pos = new THREE.Vector3();
    return (d) => {
      const h = hs.height(d[0], d[1], d[2], walkWL), mapped = hs.waterDepth;
      if (mapped <= 0) { this.depthAsked = 0; this._sink = 0; this._under = 0; return land(d, h); }
      this._rise = 0;
      // (the tide: the sea stands under the level its shore is mapped at, and where it was
      // shallower than that the bed is bare; lakes and rivers have none. As the ground
      // shader has it.)
      const up = h - (world.surface.sea.level ?? 0);
      const inland = up <= 2 ? 0 : up >= 6 ? 1 : ((up - 2) / 4) * ((up - 2) / 4) * (3 - 2 * (up - 2) / 4);
      const drop = Math.min(mapped, -(this.tide || 0) * (1 - inland)), depth = mapped - drop;
      this.depthAsked = depth;
      let sink = Math.min(depth, SWIM_DEPTH);
      this._under = sink;              // (how far under the still water's surface the walker's ground is: the camera's floor is the surface with its waves, which is that ground plus this)
      if (depth > 0.15) {
        // (the same share of the waves as the vertex shader lifts the water by: none at the
        // shore, a little on lakes and rivers)
        const u = this.terrain.shared.uWind.value, w = this.terrain.shared.uWave.value;
        pos.set(d[0], d[1], d[2]).multiplyScalar(world.radius + h);
        sink -= waveHeightAt(pos, world.radius, w.z, u, u.w) * Math.min(1, (depth - 0.15) / 1.5) * (1 - 0.8 * inland) * w.y;
        // (and the surf's lift toward the sea's shore: the rule the ground's shader lifts the water by)
        if (inland < 1 && depth < 14) { const q = detailUvAt(pos, world.radius, this._duv || (this._duv = [0, 0])); sink -= surfLift(surfTurn(q[0], q[1], depth, w.z), depth, surfHeight(w.x)) * (1 - inland) * w.y; }
      }
      this._sink = sink + drop;
      return h - sink - drop;
    };
  }

  async init() {
    const { world, params, renderer } = this;
    this.post = new PostPipeline(renderer, world.scene.exposure);
    this.post.instant = this.shotMode;
    let savedMode = null;
    // (the key is new with Sharp as the default, 2026-11-24: a mode kept under the old key was
    // Smooth for everyone, the default then, and cannot be told from the owner's own tap; it is
    // forgotten once. A tap on the mode button from now on is kept.)
    try { savedMode = localStorage.getItem('sse.mode2'); } catch { /* storage blocked: use the default */ }
    this.profile = new Profile();          // where each frame's own work goes (perf/profile.js)
    this.profileParts = PARTS;
    this.governor = new Governor(this, params.mode || savedMode || 'sharp', this.shotMode ? (params.scale ?? 1) : params.scale);
    // (what each world held last time, per mode: a return starts from it)
    if (typeof this.save.data.gov !== 'object' || !this.save.data.gov) this.save.data.gov = {};
    this.governor.remember(this.save.data.gov, () => this.save.touch());
    this.governor.place = world.id;
    this.hud = new Hud();
    this.hud.setLevel(params.hud != null ? (params.hud ? HUD.FULL : HUD.OFF) : this.shotMode ? HUD.OFF : HUD.COMPACT);
    this.hud.onTime = (h) => { this.timeOffsetHours = h; };
    if (!this.shotMode) {
      // The start screen goes up at once; its buttons unlock when the first terrain is drawn.
      this.startScreen = new StartScreen(BUILD, this.governor.mode, { play: () => this.play(), benchmark: (kind) => this.startBenchmark(kind), mode: () => this.toggleMode() },
        Object.values(WORLDS).map((w) => ({ id: w.id, name: w.name })), world.id);
      this.results = new ResultsScreen(() => { this.startScreen.show(); });
      this.banner = new BenchBanner(() => this.benchmark.stop());
      this.toast = new Toast();
      this.benchmark = new Benchmark(this);
      this.menuOpen = true;
    }
    this.timeRange = (world.dayHours || 24) / 2;
    this.hud.setTimeRange(this.timeRange);
    this.input = new Input(this.canvas);
    this.touch = new TouchControls(this.canvas, this.input, { view: () => this.cycleBookmark(), target: () => this.openPicker(), go: () => this.toggleTransfer(), map: () => this.openMap(), menu: () => this.openMenu() });
    if (params.touch) this.touch.enable();
    this.touch.setVisible(!this.menuOpen);
    this.targetMarker = new TargetMarker();
    document.addEventListener('visibilitychange', () => {
      // Coming back from the background: the long gap is not a slow frame.
      if (document.visibilityState === 'visible') { this.lastNow = 0; this.resumedAt = performance.now(); } else this.hiddenCount++;
      this.audio?.setAwake(document.visibilityState === 'visible');        // no sound from a page nobody is looking at
    });
    // Mobile browsers drop the GL context when the tab is backgrounded for long: start over.
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => location.reload());

    // Height source on the main thread (camera collision, placement) and in the workers.
    const data = await this.loadWorldData(world);
    this.hs = data.hs;
    this.rig = new CameraRig(world, this.heightFn(world, data.hs));
    this.farScene = new THREE.Scene();
    this.nearScene = new THREE.Scene();
    this.heroScene = new THREE.Scene();
    // The atmosphere publishes its LUTs into the shared uniforms; build it before any lit material.
    this.atmosphere = new Atmosphere(renderer, world);
    this.sun = new SunDisc(SOLAR_SYSTEM.sun);
    this.skyDome = makeSkyDome();
    this.farScene.add(this.sun.mesh, this.skyDome);
    this.bodies = new SkyBodies(world, SOLAR_SYSTEM, renderer);
    this.farScene.add(this.bodies.group);
    this.warp = new Warp();
    this.farScene.add(this.warp.lines);
    if (world.sky.stars) {
      const res = await fetch(import.meta.env.BASE_URL + world.sky.stars.url);
      if (!res.ok) throw new Error('Failed to load star catalogue');
      this.stars = makeStars(new Float32Array(await res.arrayBuffer()));
      this.farScene.add(this.stars.points);
    }
    this.atmosphere.airDebugAll = params.debug.includes('airall');                 // ?debug=airall: every bit of air counts as shadowed
    if (params.debug.includes('noair')) this.atmosphere.airEnabled = false;      // ?debug=noair: no terrain shadows in the haze
    if (params.debug.includes('norelief') || params.debug.includes('nofar')) G.uQuality.value.w = 0;   // ?debug=norelief: no relief shading of far ground from the slope map
    this.nearShadow = new NearShadow(renderer);
    this.terrain = new Terrain(world, data.rasters, data.hs, renderer);
    // the character stands on the ground as drawn (and in water as deep as heightFn just said)
    this.rig.groundAt = (d, dist) => { const g = this.terrain.drawnHeight(d, dist); return g == null ? null : g - (this._sink || 0) + (this._rise || 0); };
    this.rig.sunkAt = () => this._under || 0;          // (the camera stays above the water its figure stands in)
    this.rig.riseAt = () => this._rise || 0;           // (a boulder under the place: the floor, but not the land that flight's speed goes by)
    // The sky and the weather (sky/skySystem.js: their order in the frame, and every part of
    // them): the home world's clouds (a world without clouds: nothing is drawn) and their
    // shadows, the weather where the traveller is, rain, lightning and thunder. Its parts keep
    // their old names here.
    this.sky = new SkySystem({ renderer, terrain: this.terrain, debug: params.debug, shotMode: this.shotMode });
    this.sky.setWorld(world, data);
    this.clouds = this.sky.clouds; this.cloudVolume = this.sky.cloudVolume; this.treeShade = this.sky.treeShade;
    this.weather = this.sky.weather; this.rain = this.sky.rain; this.bolt = this.sky.bolt; this.rainbow = this.sky.rainbow;
    if (!this.shotMode) this.terrainBudget(MODES[this.governor.mode].patches ?? 1, 'mode');     // (reference pictures show them all)
    // ?debug=nofar: none of the far-ground changes (relief, far roughness, finer patches from orbit), for before/after pictures
    // (or one at a time: nofarrough, noboost)
    if (params.debug.includes('nofar') || params.debug.includes('nofarrough')) this.terrain.shared.uFarRoughness.value = this.terrain.shared.uRoughness.value;
    if (params.debug.includes('nofar') || params.debug.includes('noboost')) CONFIG.SPLIT_SPACE_BOOST = 1;
    this.rocks = new Rocks(world, data.hs);
    // (the far low shell of clouds is not in it: the sky draws it after the shells above the camera, sky/skySystem.js)
    this.nearScene.add(this.terrain.group, this.rocks.mesh);
    this.nearShadow.addCaster(this.rocks.mesh, this.rocks.depthMaterial, null, () => this.rocks.nearCount);
    // (boulders and outcrops as far as they can be seen: the land's own, in tiles)
    this.farRocks = new FarRocks(world, this.terrain); this.nearScene.add(this.farRocks.group);
    // (waterfalls from afar and their mist: living water)
    this.falls = new Falls(this.terrain.shared); this.nearScene.add(this.falls.mesh);
    this.addRockCasters();
    this.farRocks.off = params.debug.includes('farrocksoff');      // ?debug=farrocksoff: none of them, for before/after pictures
    // Trees (worlds that have them): drawn with the ground, and they cast shadows
    this.trees = new Trees(world, this.terrain); this.trees.renderer = renderer;
    for (const set of this.trees.sets.flat(2)) this.nearScene.add(set.mesh);
    // (what casts their shadows, and when: life/trees.js, casters)
    for (const c of this.trees.casters) this.nearShadow.addCaster(c.mesh, this.trees.depthMaterial, c.on, c.fineCount);
    // (the far forest: the same trees as those near by, thinned with distance, out to some
    // kilometres; they rise out of the forest the ground shader raises as a whole)
    this.farForest = new FarForest(this.trees, this.terrain); this.nearScene.add(this.farForest.mesh);
    if (params.debug.includes('treeshade')) this.farForest.shared.uShadow.value.y = 1;      // ?debug=treeshade: the far trees painted by how much of the Sun the land and the clouds leave them
    this.grass = new Grass(this.terrain, this.terrain.shared.uWind); this.grass.setWorld(world); this.grass.eager = this.shotMode; this.grass.debugKinds = params.debug.includes('flowers');
    this.nearScene.add(this.grass.mesh);
    this.leaves = new Leaves(this.trees);
    this.nearScene.add(this.leaves.mesh);
    this.petals = new Petals(this.trees); this.nearScene.add(this.petals.mesh);          // (what the trees in flower let go)
    // The order solid things are drawn in: what stands in front first, the ground last.
    // The ground's pixels are by far the dearest in the picture, and drawn first (as it
    // was, being the oldest object) all of it was shaded and then covered: under a meadow's
    // grass and a forest's crowns that was most of the screen, paid for twice. Drawn last,
    // only the ground that shows is shaded (the depth test throws the rest out unshaded).
    {
      const order = (o, n) => o.traverse((m) => { m.renderOrder = n; });
      order(this.grass.mesh, -30); order(this.leaves.mesh, -30); order(this.petals.mesh, -30);
      for (const set of this.trees.sets.flat(2)) order(set.mesh, -20.3 + 0.1 * set.lod);          // (the nearest trees' meshes first: what they hide is not shaded)
      order(this.rocks.mesh, -10);
    }
    // (a picture must not depend on which frame it is; and at Sharp's 30 frames a second
    // every tile is drawn every frame: a turn of four frames there would be 7 shadow
    // pictures a second under trees that sway)
    this.nearShadow.every = this.shotMode ? 1 : 2; this.nearShadow.alternate = MODES[this.governor.mode].fps < 45;
    this.look = new Look(); this.look.debug = params.debug; this.look.setWorld(world);          // the world's look, if it has one of its own (render/look.js)
    // (the rain, the strokes and the rainbow: drawn after the cloud volume is laid, sky/skySystem.js)
    this.weatherScene = this.sky.weatherScene;
    // (pollen and seed over the flowers: drawn with the weather, after the ground and the clouds)
    this.pollen = new Pollen(this.grass, this.terrain.shared); this.weatherScene.add(this.pollen.mesh);
    this.placeLander(world, data.hs);
    this.hero = new Hero();
    this.heroScene.add(this.hero.group);
    this.dust = new Dust(world);
    // (a scene of its own: high up it is drawn before the hero's depth slice, so the ground,
    // rocks and lander in front of a lingering cloud still hide it)
    this.dustScene = new THREE.Scene();
    this.dustScene.add(this.dust.points);
    for (const m of this.hero.casters) this.nearShadow.addCaster(m, this.hero.depthMaterial, () => this.hero.group.visible && !this.hero.sculpt);
    // The owner's sculpt for the figure (hero/heroSculpt.js). Without the file, or on a
    // device that cannot make its shaders (asked in updateHero once they have been used),
    // the figure built in code is drawn (roughly: its joints are the sculpt's now).
    try {
      const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 30000);     // (a start that waits for ever on a bad line is worse than the old figure)
      const res = await fetch('data/hero.bin', { signal: stop.signal });
      if (!res.ok) throw new Error(`data/hero.bin: ${res.status}`);
      const sculpt = new HeroSculpt(this.hero, await res.arrayBuffer()); clearTimeout(timer);
      this.hero.useSculpt(sculpt);
      this.nearShadow.addCaster(sculpt.shadowMesh, sculpt.depthMaterial, () => this.hero.group.visible);
    } catch (e) { console.warn('the sculpted character is not used:', e.message); }
    await this.terrain.workers.ready;

    // ?debug=floor: every saving the governor has, and Smooth's share of the patches: what a
    // phone that has given everything up draws (for pictures of exactly that).
    if (params.debug.includes('floor')) { this.governor.toFloor(); this.terrainBudget(MODES.smooth.patches ?? 1, 'mode'); }
    this.applyBookmark(params.shot || 'ledge');
    this.pendingAim = params.aim || null;
    if (params.timeOffsetHours != null) this.timeOffsetHours = params.timeOffsetHours;
    if (params.season) this.goSeason(params.season, true);        // (?season=autumn: the same hour, that season at this place)
    if (params.fly) this.rig.setMode('fly');
    // Interactive sessions start behind the flying character; screenshots stay first person
    // unless asked (?hero=1).
    if (params.hero ?? (!this.shotMode && !params.fly)) this.setHero(true);
    this.rig.hover = this.shotMode;       // screenshots must hold still; in play gravity is on until HOVER is tapped
    // Screenshots of the character on foot (?heropose=stand|walk|run|super|jump) stand it on
    // the ground; the other character shots keep it in the air.
    if (this.shotMode && this.rig.mode === 'hero') { if (FOOT_POSES[params.heropose] && params.alt == null) this.rig.standUp(); else this.rig.onFoot = false; }
    window.addEventListener('resize', () => this.resize());
    // The exact size of the canvas in device pixels, where the browser can tell us: with
    // it the image is drawn pixel for pixel, with no resampling by the browser.
    try {
      new ResizeObserver((entries) => {
        const box = entries[0].devicePixelContentBoxSize?.[0];
        if (box) { this.devicePixels = [box.inlineSize, box.blockSize]; this.resize(); }
      }).observe(this.canvas, { box: 'device-pixel-content-box' });
    } catch { /* not supported: CSS size x devicePixelRatio is used */ }
    this.resize();
  }

  placeLander(world, hs) {
    if (this.lander) { this.nearScene.remove(this.lander.mesh); this.nearShadow.removeCaster(this.lander.mesh); this.lander.mesh.geometry.dispose(); }
    this.lander = new Lander(world, hs, latLonToDir(world.scene.start.lat, world.scene.start.lon));
    this.nearScene.add(this.lander.mesh); this.lander.mesh.renderOrder = -10;
    this.nearShadow.addCaster(this.lander.mesh, this.lander.depthMaterial);
  }

  setHero(on) {
    this.rig.setMode(on ? 'hero' : 'walk');
    this.hero.setVisible(on);
    if (on && !this.rig.hover && this.rig.clearance() < 4) this.rig.standUp();     // on the ground: on its feet
  }

  // Hover: gravity off, the figure stays where it is. Off: it falls toward whatever pulls.
  setHover(on) {
    this.rig.hover = on;
    // in the middle of a fall on foot: gravity off means it stops falling and flies
    if (on && this.rig.mode === 'hero' && this.rig.onFoot && this.rig.airborne) this.rig._takeOff(Math.max(0, this.rig.vUp));
    this.touch.setLit('KeyX', on);
    this.toast?.show(on ? 'Hover on — gravity off' : 'Hover off — gravity pulls');
  }

  applyBookmark(name) {
    this.stopTransfer();                  // a bookmark is a jump somewhere else: the trip is over
    if (this.carry) this.carry.w = 0;     // (and so is being carried along with another body)
    this.dust?.clear();
    const sc = this.world.scene, s = sc.start, b = sc.bookmarks[name] || {};
    const p = this.params;
    this.rig.setLatLon(p.lat ?? b.lat ?? s.lat, p.lon ?? b.lon ?? s.lon, b.eye ?? s.eye, p.heading ?? b.heading ?? s.heading, p.pitch ?? b.pitch ?? s.pitch);
    const east = p.east ?? b.east ?? 0, north = p.north ?? b.north ?? 0;
    if (east || north) this.rig.offsetMetres(east, north, b.eye ?? s.eye);
    if (p.alt != null) { if (this.rig.mode === 'walk') this.rig.setMode('fly'); this.rig.pos.setLength(this.world.radius + p.alt); this.rig.agl = 0; }
    this.rig.baseFov = this.rig.fov = p.fov ?? b.fov ?? CONFIG.DEFAULT_FOV;
    // A bookmark is a place and a moment: it restores its world's scene time.
    this.baseJD = dateToJD(Date.parse(sc.dateUTC));
    this.timeOffsetHours = b.timeOffsetHours ?? 0;
    this.bookmark = name;
    if (b.label && !this.shotMode && !this.benchmark?.active) this.toast?.show(b.label, 2600);
    // With the character: a place on the ground is stood on (unless hovering); a view from
    // up high is flown.
    if (this.rig.mode === 'hero') { if (p.alt == null && !this.rig.hover) this.rig.standUp(); else this.rig.onFoot = false; }
    if (this.hero) this.hero.started = false;
    this.heroVisKnown = false;            // (its terrain shadow is asked again for the new place)
    this.jumpedAt = performance.now();
    this.governor?.jumped();              // (a trial or a step up begun at the view left behind is not this view's to judge)
  }

  // --- the clock ----------------------------------------------------------------------
  // How fast the world's clock runs: 1 = as fast as a real one. `.` and `,` step through
  // RATES (backwards too); `/` is real time again.
  setTimeRate(rate) {
    this.timeRate = rate; this.paused = false;
    this.toast?.show(rate === 1 ? 'Time: as it passes' : `Time: ${rateLabel(rate)}`);
  }
  stepTimeRate(dir) {
    const k = RATES.indexOf(this.timeRate), n = Math.min(RATES.length - 1, Math.max(0, (k < 0 ? RATES.indexOf(1) : k) + dir));
    this.setTimeRate(RATES[n]);
  }
  // The clock set to a moment (milliseconds since 1970 UTC), kept inside the years the
  // orbits were fitted for.
  // How many layers of a part are drawn over each pixel (perf/overdraw.js; scripts/overdraw.mjs).
  overdraw(part) { return overdraw(this, part); }

  setDate(ms) {
    this.baseJD = Math.min(JD_MAX, Math.max(JD_MIN, dateToJD(ms))); this.timeOffsetHours = 0;
    this.toast?.show(new Date(jdToDate(this.baseJD)).toISOString().slice(0, 10));
  }
  get clock() { return new Date(jdToDate(this.baseJD + this.timeOffsetHours / 24)); }
  // The day of the life's year on this world now (0..365.25; life/season.js), and where the
  // traveller's latitude is in its own year (0: its spring equinox).
  get lifeDay() { return lifeDay(this.world, jdToDate(this.baseJD + this.timeOffsetHours / 24)); }
  get yearHere() { const p = this.rig.pos; return yearAt(this.lifeDay, Math.asin(p.z / (p.length() || 1)) * 180 / Math.PI); }
  // The clock moved on to a season where the traveller is (a name of life/season.js, or a
  // point of the year 0..1): whole days, so the hour stays.
  goSeason(target, quiet) {
    const p = this.rig.pos, lat = Math.asin(p.z / (p.length() || 1)) * 180 / Math.PI;
    const num = Number(target), ms = untilSeason(this.world, this.clock.getTime(), lat, Number.isFinite(num) && target !== '' ? num : String(target));
    this.baseJD = Math.min(JD_MAX, Math.max(JD_MIN, this.baseJD + ms / 86400000));
    if (!quiet) this.toast?.show(`${seasonLabel(this.yearHere)}  ·  ${this.clock.toISOString().slice(0, 10)}`);
  }

  // --- the menu, the map ----------------------------------------------------------------
  get overlayOpen() { return !!(this.picker?.visible || this.menu?.visible || this.map?.visible || this.journal?.visible); }

  // --- things to do: the journal, sound, photographs --------------------------------------
  openJournal() {
    if (!this.journal) {
      this.journal = new Journal(Object.values(WORLDS).map((w) => ({ id: w.id, name: w.name, places: w.places || [] })), this.save,
        (worldId, placeId) => { if (worldId === this.world.id) this.pickTarget('place:' + placeId); });
    }
    this.picker?.hide(); this.menu?.hide(); this.map?.hide();
    if (this.journal.visible) this.journal.hide(); else this.journal.show(this.world.id);
  }
  toggleSound() {
    const on = !this.audio.on;
    this.audio.start(); this.audio.setOn(on);
    this.save.data.sound = on; this.save.touch(true);
    this.toast?.show(on ? 'Sound on' : 'Sound off');
  }
  // A place is found by going there: within its reach along the ground and not from orbit.
  // (checked a few times a second, for the home world's places)
  checkPlaces() {
    const w = this.world, p = this.rig.pos, r = p.length();
    // (both limits shrink with the world: 15 km is more than the whole of Deimos)
    if (this.rig.agl > Math.min(120e3, 2 * w.radius) || !w.places) return;
    const reach = Math.min(Math.max(15e3, 0.012 * w.radius), 0.2 * w.radius);
    for (const q of w.places) {
      const key = `${w.id}/${q.id}`;
      if (this.save.has(key)) continue;
      const d = latLonToDir(q.lat, q.lon), cos = (p.x * d[0] + p.y * d[1] + p.z * d[2]) / r;
      if (Math.acos(Math.min(1, cos)) * w.radius > (q.reach ?? reach)) continue;
      this.save.find(key, new Date().toISOString());
      this.audio.chime();
      this.toast?.show(`Found: ${q.name}${q.fact ? ' — ' + q.fact : ''}`, 6500);
    }
  }
  // Photo mode: everything but the picture is put away and time stands still; the shutter
  // draws one frame at the screen's full resolution with every feature on and saves it.
  photoMode(on) {
    if (on === !!this.photo || this.menuOpen || this.benchmark?.active) return;
    if (on) {
      this.photo = { paused: this.paused, hud: this.hud.level, fov: this.rig.baseFov };
      this.paused = true; this.hud.setLevel(HUD.OFF); this.touch.setVisible(false); this.targetMarker?.hide();
      if (!this.photoBar) {
        const bar = this.photoBar = document.createElement('div'); bar.id = 'photobar';
        bar.innerHTML = '<button data-a="wide">Wider</button><button data-a="tele">Closer</button><button data-a="earlier">Earlier</button><button data-a="later">Later</button><button data-a="shoot" class="primary">Take the picture</button><button data-a="back">Back</button>';
        document.body.appendChild(bar);
        bar.addEventListener('click', (e) => {
          const a = e.target?.dataset?.a; if (!a) return;
          if (a === 'back') this.photoMode(false);
          else if (a === 'shoot') this.photoWanted = true;
          else if (a === 'wide') this.rig.baseFov = this.rig.fov = Math.min(100, this.rig.fov * 1.15);
          else if (a === 'tele') this.rig.baseFov = this.rig.fov = Math.max(6, this.rig.fov / 1.15);
          else this.timeOffsetHours += (a === 'later' ? 1 : -1) * this.timeRange / 40;
        });
      }
      this.photoBar.classList.remove('hidden');
      this.toast?.show('Photo mode: drag to look, then take the picture', 3000);
    } else {
      this.paused = this.photo.paused; this.hud.setLevel(this.photo.hud); this.rig.baseFov = this.rig.fov = this.photo.fov;
      this.touch.setVisible(true); this.photoBar?.classList.add('hidden');
      this.photo = null;
    }
  }
  // (called at the end of the frame that was drawn for the photograph: the canvas still holds it)
  savePhoto() {
    const name = `solar-system-${this.world.id}-${this.clock.toISOString().slice(0, 10)}.png`;
    this.canvas.toBlob((blob) => {
      if (!blob) { this.toast?.show('The picture could not be saved'); return; }
      const file = typeof File !== 'undefined' ? new File([blob], name, { type: 'image/png' }) : null;
      // a phone's share sheet where there is one (save to photos, send), a download otherwise
      if (file && navigator.canShare?.({ files: [file] }) && this.touch.enabled) { navigator.share({ files: [file], title: 'Solar System Explorer' }).catch(() => {}); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.toast?.show(`Saved ${this.canvas.width} x ${this.canvas.height}`, 2600);
    }, 'image/png');
  }

  openMenu() {
    if (!this.menu) this.menu = new Menu(() => this.menuSections());
    this.picker?.hide(); this.map?.hide();
    this.menu.toggle();
  }
  // "early spring · day 1 of a year of 48": the season where the traveller is
  seasonNote() {
    const y = this.yearHere, w = this.world, days = Math.round(yearMs(w) / dayMs(w));
    return `${seasonLabel(y)} here · day ${Math.min(days, Math.floor(y * days) + 1)} of a year of ${days}`;
  }
  menuSections() {
    const iso = this.clock.toISOString(), day = iso.slice(0, 10);
    return [
      { title: 'Where to', items: [
        { label: 'Map', sub: 'the solar system now', act: () => this.openMap() },
        { label: 'Targets', sub: 'places and worlds', act: () => this.openPicker() },
        { label: 'Next view', sub: 'of this world', act: () => this.cycleBookmark() },
      ] },
      { title: 'Time', note: `${day}  ${iso.slice(11, 16)} UTC · ${this.paused ? 'stopped' : this.timeRate === 1 ? 'as it passes' : rateLabel(this.timeRate)}`,
        items: [
          { label: '◀◀', sub: 'slower / back', stay: true, act: () => this.stepTimeRate(-1) },
          { label: this.paused ? '▶' : '❚❚', sub: this.paused ? 'run' : 'stop', stay: true, act: () => { this.paused = !this.paused; } },
          { label: '▶▶', sub: 'faster', stay: true, act: () => this.stepTimeRate(1) },
          { label: 'Real time', sub: 'one second a second', stay: true, on: this.timeRate === 1 && !this.paused, act: () => this.setTimeRate(1) },
          { label: 'Today', sub: 'the real date', stay: true, act: () => this.setDate(Date.now()) },
          { label: 'This place\'s day', sub: this.world.scene.dateUTC.slice(0, 10), stay: true, act: () => this.setDate(Date.parse(this.world.scene.dateUTC)) },
        ],
        date: { value: day, min: '1950-01-01', max: '2099-12-31', set: (ms) => this.setDate(ms) } },
      // (the season where the traveller is; the buttons move the date on to it)
      ...(this.world.life ? [{ title: 'Season', note: this.seasonNote(),
        items: SEASON_NAMES.map((n) => ({ label: n[0].toUpperCase() + n.slice(1), sub: 'go to', stay: true, act: () => this.goSeason(n) })) }] : []),
      { title: 'Things to do', items: [
        { label: 'Journal', sub: `${this.save.count} places found`, act: () => this.openJournal() },
        { label: 'Photograph', sub: 'full resolution', act: () => this.photoMode(true) },
        { label: this.audio.on ? 'Sound: on' : 'Sound: off', sub: 'tap to change', stay: true, on: this.audio.on, act: () => this.toggleSound() },
        { label: 'To the start', sub: `of ${this.world.name}`, act: () => this.applyBookmark(Object.keys(this.world.scene.bookmarks)[0]) },
      ] },
      // (every view of this world's file, by its label: the keys 1 to 9 on a keyboard)
      { title: 'Views', items: Object.entries(this.world.scene.bookmarks).filter(([, b]) => b.label).map(([name, b], k) => (
        { label: b.label, sub: k < 9 ? `key ${k + 1}` : '', on: this.bookmark === name, act: () => this.applyBookmark(name) })) },
      { title: 'Camera and picture', items: [
        { label: 'Free camera', sub: 'leave the character', act: () => this.input.virtualTap('KeyF') },
        { label: 'Read-out', sub: 'one line / all / off', act: () => this.hud.toggle() },
        { label: `Mode: ${MODES[this.governor.mode].label}`, sub: `${MODES[this.governor.mode].fps} fps`, stay: true, act: () => this.toggleMode() },
        { label: 'Full screen', sub: 'and keep the screen on', act: () => this.touch.fullscreen() },
      ] },
      // (what the maps are and whose: the streamed ones ask to be named where they are used)
      { title: 'Maps', note: 'Elevation of Earth: Terrain Tiles on AWS Open Data (SRTM, GMTED2010 and 3DEP courtesy of the U.S. Geological Survey; ETOPO1, NOAA; EU-DEM, Copernicus; and others). Pictures of Earth: NASA Global Imagery Browse Services (GIBS), Blue Marble. The other worlds: NASA, JPL and USGS missions.', items: [] },
    ];
  }

  openMap() {
    if (!this.map) {
      const landable = new Set(Object.values(WORLDS).map((w) => w.body));
      this.map = new SystemMap({
        state: () => {
          const e = this.ephemeris, M = e.icrfToFixed, p = this.rig.pos, h = e.positionICRF(this.world.body, e.jd, [0, 0, 0]);
          // the traveller from the Sun: the home world's place plus the camera's, turned out of the home axes
          const you = [h[0] + M[0] * p.x + M[3] * p.y + M[6] * p.z, h[1] + M[1] * p.x + M[4] * p.y + M[7] * p.z, h[2] + M[2] * p.x + M[5] * p.y + M[8] * p.z];
          return { jd: e.jd, cat: SOLAR_SYSTEM, eph: e, home: this.world.body, you, target: this.targetId && !this.targetId.startsWith('place:') ? this.targetId : null, landable, date: this.clock.toISOString().slice(0, 10) };
        },
        pick: (id) => this.pickTarget(id), go: () => { if (!this.transfer) this.toggleTransfer(); }, names: (id) => titleCase(id),
      });
    }
    this.picker?.hide(); this.menu?.hide();
    this.map.toggle();
  }

  cycleBookmark() {
    const names = Object.keys(this.world.scene.bookmarks);
    this.applyBookmark(names[(names.indexOf(this.bookmark) + 1) % names.length]);
  }

  // The render ceiling is the canvas's native pixel size; the governor works below it.
  resize() {
    const cw = Math.max(2, this.canvas.clientWidth), ch = Math.max(2, this.canvas.clientHeight);
    const dpr = this.params.dpr ?? (window.devicePixelRatio || 1);
    let w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    // Trust the browser's exact device-pixel size when it agrees with CSS size x ratio to
    // within rounding (under device emulation it can report CSS pixels instead).
    const exact = this.devicePixels;
    if (exact && this.params.dpr == null && Math.abs(exact[0] - w) <= 2 && Math.abs(exact[1] - h) <= 2) [w, h] = exact;
    const guard = Math.min(1, Math.sqrt(CONFIG.MAX_NATIVE_PIXELS / (w * h)));
    w = Math.max(2, Math.round(w * guard)); h = Math.max(2, Math.round(h * guard));
    if (w === this.post.width && h === this.post.height) return;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.post.resize(w, h);
    this.governor.setNative(w * h);
    this.resizedAt = performance.now();
    this.canvasArea = 1; this._canvasOkAt = this.resizedAt;
  }

  // The canvas's own size in pixels follows the picture's, in four steps (the governor's
  // resolution levels 0, 4, 8 and 12). The last pass (tone map, grade, glow) fills the
  // canvas whatever size the picture under it was drawn at: on the phone that was 4.45
  // million pixels of it every frame while the picture itself was down to 1 million, a cost
  // no saving and no resolution step touched. The browser stretches a smaller canvas over
  // the screen for nothing, and the picture is no softer for it (it was stretched in that
  // last pass before). A step down waits three seconds, since a new size is a new buffer
  // and not something to do back and forth; a step up is taken at once.
  fitCanvas(now) {
    const post = this.post, area = post.scale * post.scale, hold = this.canvasHold;
    if (this.canvasArea == null) { this.canvasArea = 1; this._canvasOkAt = now; }
    let want = 1;
    for (const a of CANVAS_STEPS) if (a >= area * 0.98) want = a;       // the smallest that still holds the picture
    // (the benchmark's cost test holds it: 'fit' = the step for the picture, at once; 'full' = the screen's own size)
    if (hold === 'full') want = 1;
    if (want === this.canvasArea) { this._canvasOkAt = now; return; }
    if (want < this.canvasArea && !hold && now - this._canvasOkAt < 3000) return;
    this.canvasArea = want; this._canvasOkAt = now;
    const k = Math.sqrt(want);
    this.renderer.setSize(Math.max(2, Math.round(post.width * k)), Math.max(2, Math.round(post.height * k)), false);
    this.canvasSteps = (this.canvasSteps || 0) + 1;
    this.canvasAt = now;
  }

  start() {
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (this.contextLost || !this.governor.shouldRender(now)) return;
      this.frame(now);
    };
    requestAnimationFrame(loop);
  }

  // --- start screen, modes, benchmark -------------------------------------------------

  // True when the drawn ground under the character (or the camera) is the detailed one.
  // The far rocks near the eye cast into the near shadow map: one small mesh of their own,
  // there from the start whatever world the page opened on.
  addRockCasters() { if (!this._rockCasters) { this._rockCasters = true; for (const c of this.farRocks.casters) this.nearShadow.addCaster(c.mesh, this.farRocks.depthMaterial, c.on, c.fine); } }

  groundSettled() {
    if (this.terrain.idle) return true;
    const r = this.rig, p = r.onFoot ? r.feet : r.pos, l = p.length(), d = [p.x / l, p.y / l, p.z / l];
    const g = this.terrain.drawnHeight(d, r.pos.distanceTo(p));
    const e = r.heightAt(d) - (this._rise || 0);             // (the ground itself: not the rock stood on)
    return g != null && Math.abs(g - e) < 1;
  }

  play() {
    this.startScreen.hide();
    this.menuOpen = false;
    this.audio.start();
    // Back where the traveller last stood on this world (unless the address names a place).
    const last = this.save.data.last[this.world.id], p = this.params;
    if (last && !this._resumed && p.lat == null && p.shot == null && Number.isFinite(last.lat) && Number.isFinite(last.lon)) {
      this.rig.setLatLon(last.lat, last.lon, this.world.scene.start.eye, last.heading ?? 0, 0);
      if (this.rig.mode === 'hero') this.rig.standUp();
      this.jumpedAt = performance.now();
      this.toast?.show('Back where you left off', 2400);
    }
    this._resumed = true;
    this.touch.setVisible(true);
    if (this.touch.enabled) immersive();
    keepAwake();
  }

  toggleMode() {
    const next = this.governor.mode === 'smooth' ? 'sharp' : 'smooth';
    this.governor.setMode(next);
    this.terrainBudget(MODES[next].patches ?? 1, 'mode');
    this.nearShadow.every = this.shotMode ? 1 : 2; this.nearShadow.alternate = MODES[next].fps < 45;
    try { localStorage.setItem('sse.mode2', next); } catch { /* storage blocked: the choice lasts for this visit */ }
    this.startScreen?.setMode(next);
    this.toast?.show(`${MODES[next].label} — ${MODES[next].fps} fps`);
  }

  startBenchmark(kind) {
    if (!this.loaded || this.benchmark.active) return;
    this.startScreen.hide(); this.results.hide();
    this.menuOpen = false;
    this.touch.setVisible(false);
    if (this.touch.enabled) immersive();
    keepAwake();
    this.banner.show(true);
    this.hoverBefore = this.rig.hover; this.rig.hover = true;      // the scripted run flies itself: no gravity, as in every earlier run
    this.benchmark.start(kind);
  }

  onBenchmarkDone(text) {
    this.banner.show(false);
    this.rig.hover = this.hoverBefore ?? false;
    this.menuOpen = true;
    this.results.show(text);
    window.__benchResult = text;
  }

  // The governor: how fast finished terrain is let in (0 full pace, 1, 2 slower).
  terrainPace(level) { this.terrain.pace = level; }

  // The governor's terrain steps: the smallest factor asked for wins.
  terrainBudget(factor, id) {
    this.terrainFactors[id] = factor;
    if (!this.terrain) return;               // (the mode button works before the world has loaded)
    // the mode's share multiplies; among the governor's own levers the smallest wins
    let m = 1;
    for (const k in this.terrainFactors) if (k !== 'mode') m = Math.min(m, this.terrainFactors[k]);
    this.terrain.maxChunks = Math.round(CONFIG.MAX_RENDER_CHUNKS * (this.terrainFactors.mode ?? 1) * m);
  }

  // Why the frame that just ended may have been slow (for the benchmark's hitch list).
  frameCause(now, uploads) {
    if (this.switching || now < this.switchedAt + 2500) return 'arriving at another world';
    if (now < this.jumpedAt + 2500) return 'jump to a bookmark';
    if (now < (this.bodies?.mapsAt ?? -1e9) + 1500) return 'sky maps arriving';
    if (now < this.resumedAt + 1500) return 'page came back from the background';
    if (now < this.resizedAt + 1500) return 'screen size changed';
    if (now < (this.canvasAt ?? -1e9) + 200) return 'screen size changed';       // (the canvas took a new size: fitCanvas)
    if (this.governor.sinceStep < 0.4) return 'quality step';
    if (uploads) return `new terrain (${uploads} patch${uploads > 1 ? 'es' : ''})`;
    if (now < this.loadedAt + 4000) return 'start-up';
    return 'unknown';
  }

  handleKeys(dt = 1 / 60) {
    const i = this.input;
    if (i.hit('KeyH')) this.hud.toggle();
    if (i.hit('KeyM')) this.toggleMode();
    // F: the free camera where you are (from the character or from the walk); from the free
    // camera, down to the first-person walk
    if (i.hit('KeyF')) { this.stopTransfer(); this.hero.setVisible(false); this.rig.setMode(this.rig.mode === 'fly' ? 'walk' : 'fly'); }
    if (i.hit('KeyG')) this.setHero(this.rig.mode !== 'hero');
    if (i.hit('KeyT')) this.nextTarget();
    if (i.hit('Enter') || i.hit('NumpadEnter')) this.toggleTransfer();
    if (i.hit('KeyX')) this.setHover(!this.rig.hover);
    if (i.hit('KeyP')) this.paused = !this.paused;
    if (i.hit('Period')) this.stepTimeRate(1);
    if (i.hit('Comma')) this.stepTimeRate(-1);
    if (i.hit('Slash')) this.setTimeRate(1);
    if (i.hit('KeyN')) this.openMap();
    if (i.hit('KeyJ')) this.openJournal();
    if (i.hit('KeyK')) this.toggleSound();
    if (i.hit('KeyO')) this.photoMode(!this.photo);
    if (i.hit('Tab')) this.openMenu();
    const tr = this.timeRange;
    // (per second, not per frame: the same pace in Smooth and Sharp)
    if (i.down('BracketRight')) this.timeOffsetHours = Math.min(tr, this.timeOffsetHours + tr / 20 * dt);
    if (i.down('BracketLeft')) this.timeOffsetHours = Math.max(-tr, this.timeOffsetHours - tr / 20 * dt);
    const names = Object.keys(this.world.scene.bookmarks);
    if (!this.overlayOpen) for (let k = 0; k < names.length && k < 9; k++) if (i.hit('Digit' + (k + 1))) this.applyBookmark(names[k]);      // (not while a date is being typed)
  }

  // --- targets: this world's real places, the other bodies, the Sun --------------------

  // Every target there is now, in the list's order.
  targetList() {
    const places = (this.world.places || []).map((p) => ({ id: 'place:' + p.id, name: p.name }));
    const sky = this.bodies.bodies.filter((b) => b.id !== this.world.body).map((b) => ({ id: b.id, name: titleCase(b.id) }));
    sky.push({ id: 'sun', name: 'Sun' });
    return { places, sky };
  }

  // Where a target is now (planet-fixed), in the shape autopilot.js uses, or null if it
  // is not there any more (a place on a world that is no longer the home world).
  resolveTarget(id, out) {
    if (!id) return null;
    out.pos = out.pos || [0, 0, 0];
    if (id.startsWith('place:')) {
      const p = (this.world.places || []).find((q) => 'place:' + q.id === id);
      if (!p) return null;
      const d = latLonToDir(p.lat, p.lon), r = this.world.radius + this.hs.height(d[0], d[1], d[2], 50);
      out.kind = 'place'; out.radius = 0; out.name = p.name;
      out.pos[0] = d[0] * r; out.pos[1] = d[1] * r; out.pos[2] = d[2] * r;
      return out;
    }
    out.kind = 'body';
    if (id === 'sun') {
      const e = this.ephemeris;
      out.radius = SOLAR_SYSTEM.sun.radius; out.name = 'Sun';
      out.pos[0] = e.sunDir[0] * e.sunDistance; out.pos[1] = e.sunDir[1] * e.sunDistance; out.pos[2] = e.sunDir[2] * e.sunDistance;
      return out;
    }
    out.name = titleCase(id);
    if (id === this.world.body) { out.radius = this.world.radius; out.pos[0] = out.pos[1] = out.pos[2] = 0; return out; }
    const b = this.bodies.byId.get(id);
    if (!b) return null;
    // (from the ephemeris, which is current for this frame and this home world; its size as drawn)
    const e = this.ephemeris.bodies.get(id);
    if (!e) return null;
    out.radius = b.reach; out.pos[0] = e.pos[0]; out.pos[1] = e.pos[1]; out.pos[2] = e.pos[2];
    return out;
  }

  // T: the next target in the list (and after the last, none).
  nextTarget() {
    const { places, sky } = this.targetList();
    const ids = [...places, ...sky].map((t) => t.id);
    ids.push(null);
    this.pickTarget(ids[(ids.indexOf(this.targetId ?? null) + 1) % ids.length]);
  }

  // Chooses a target (null: none) and turns the view to it.
  pickTarget(id) {
    this.stopTransfer();
    if (!id) { this.targetId = null; this.targetMarker?.hide(); this.toast?.show('No target'); return; }
    this.aimAt(id);
    if (this.targetId === id && !this.shotMode) this.toast?.show(`Target: ${this.resolveTarget(id, this._tgtT || (this._tgtT = {}))?.name ?? id}`);
  }

  // The TARGET button on a phone: the list of targets, each with how far it is.
  openPicker() {
    if (!this.picker) this.picker = new TargetPicker((id) => this.pickTarget(id));
    const { places, sky } = this.targetList(), t = this._tgtP || (this._tgtP = {}), p = this.rig.pos, cam = [p.x, p.y, p.z];
    const info = (id) => { const r = this.resolveTarget(id, t); return r ? fmtDistance(Math.max(0, r.kind === 'place' ? groundDistance(cam, r, this.world.radius) : gapTo(cam, r))) : ''; };
    // (the sky nearest first; worlds you can land on are marked)
    const gap = (id) => { const r = this.resolveTarget(id, t); return r ? gapTo(cam, r) : Infinity; };
    const landable = new Set(Object.values(WORLDS).map((w) => w.body));
    const near = sky.map((x) => ({ ...x, d: gap(x.id) })).sort((a, b) => a.d - b.d);
    this.picker.show([
      { title: `On ${this.world.name}`, items: places.map((x) => ({ ...x, info: info(x.id) })) },
      { title: 'In the sky (nearest first; ● = you can land there)', items: near.map((x) => ({ id: x.id, name: (landable.has(x.id) ? '● ' : '') + x.name, info: info(x.id) })) },
    ], this.targetId);
  }

  // Turns the view to a target: straight at a body in the sky; toward a place the way a GO
  // trip would set off (over the horizon, autopilot.js).
  aimAt(id) {
    const t = this.resolveTarget(id, this._tgtA || (this._tgtA = {}));
    if (!t) return;
    this.targetId = id;
    const p = this.rig.pos;
    if (t.kind === 'body') { this.rig.lookAlong(new THREE.Vector3(t.pos[0] - p.x, t.pos[1] - p.y, t.pos[2] - p.z)); return; }
    const a = aimDirection([p.x, p.y, p.z], t, this.world.radius, this._aimA || (this._aimA = [0, 0, 0]));
    this.rig.lookAlong(new THREE.Vector3(a[0], a[1], a[2]));
  }

  // GO: a hands-off trip to the target (autopilot.js). Any stick, key or look input hands
  // control back; it ends above the target.
  toggleTransfer() { if (this.transfer) this.stopTransfer('You have control'); else this.startTransfer(); }
  startTransfer() {
    if (!this.targetId) { this.toast?.show('Choose a target first (TARGET)'); return; }
    if (this.rig.mode !== 'hero') this.setHero(true);
    if (this.rig.onFoot) this.rig._takeOff(8);
    this.transfer = true; this.rig.auto = { mult: 1, dir: this.rig.forward.clone() };
    this.toast?.show(`Flying to ${this.resolveTarget(this.targetId, this._tgtT || (this._tgtT = {}))?.name ?? this.targetId}`);
  }
  stopTransfer(msg) {
    if (!this.transfer) return;
    this.transfer = false; this.rig.auto = null;
    // The trip's speed is far above what hand flight allows this close to a surface (its
    // easing lags the shrinking distance): hand back the speed the stick would give here,
    // or the figure plunged from 60 km to the ground in a few frames after arriving.
    const c = Math.max(1.5, Math.min(this.rig.agl, this.rig.spaceDistance ?? Infinity));
    this.rig.velocity.clampLength(0, flightBase(c));
    if (msg) this.toast?.show(msg);
  }

  // Each frame of a trip, before the rig moves: steer the flight along the planned path
  // (turning onto it smoothly at first), set the transfer's boost, and stop on arrival.
  // The view looks toward the target (kept above the world's edge), so the world and the
  // marker stay in sight; dragging to look around is allowed and pauses that for 3 s.
  updateTransfer(dt, input) {
    if (!this.transfer) return;
    const rig = this.rig;
    // the figure was put away (HERO), first person (F) or stood on its feet: no trip
    if (rig.mode !== 'hero' || rig.onFoot) { this.stopTransfer(); return; }
    const touched = input.moveX || input.moveY || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'Space'].some((k) => input.down(k));
    if (touched) { this.stopTransfer('You have control'); return; }
    const t = this.resolveTarget(this.targetId, this._tgtU || (this._tgtU = {}));
    if (!t) { this.stopTransfer(); return; }
    const p = rig.pos, cam = [p.x, p.y, p.z];
    if (gapTo(cam, t) < standoff(t)) { this.stopTransfer(`Arrived: ${t.name}`); return; }
    const a = aimDirection(cam, t, this.world.radius, this._aimU || (this._aimU = [0, 0, 0]));
    const want = (this._wantU || (this._wantU = new THREE.Vector3())).set(a[0], a[1], a[2]);
    const dir = rig.auto.dir || (rig.auto.dir = rig.forward.clone());
    const q = (this._qU || (this._qU = new THREE.Quaternion())).setFromUnitVectors(dir, want);
    dir.applyQuaternion((this._qI || (this._qI = new THREE.Quaternion())).identity().slerp(q, 1 - Math.exp(-dt * 2.5))).normalize();
    const clear = Math.max(1, Math.min(rig.agl, rig.spaceDistance));
    rig.auto.mult = transferMult(clear, rig.nearR - clear);         // nearR: to the nearest body's centre
    // the view
    const now = performance.now() / 1000;
    if (input.dx || input.dy) this._lookedAt = now;
    if (now - (this._lookedAt ?? -99) > 3) {
      // toward the target, but not lower than 10 degrees above the world's edge: on the way
      // up the curved horizon sits in the lower half with the target's direction in the
      // middle; coming down (and for a body in the sky) the view is on the target itself
      const view = (this._viewU || (this._viewU = new THREE.Vector3())).set(t.pos[0] - p.x, t.pos[1] - p.y, t.pos[2] - p.z).normalize();
      const r = p.length(), up = (this._upU || (this._upU = new THREE.Vector3())).copy(p).divideScalar(r);
      const dip = Math.acos(Math.min(1, this.world.radius / r)), eMin = -dip + 10 * Math.PI / 180;
      const e = Math.asin(Math.max(-1, Math.min(1, view.dot(up))));
      if (e < eMin) {
        const h = view.addScaledVector(up, -view.dot(up));
        if (h.lengthSq() < 1e-9) h.copy(dir).addScaledVector(up, -dir.dot(up));
        h.normalize().multiplyScalar(Math.cos(eMin)).addScaledVector(up, Math.sin(eMin));
      }
      view.normalize();
      const qv = this._qV || (this._qV = new THREE.Quaternion());
      qv.setFromUnitVectors(rig.forward, view);
      rig.lookAlong(rig.forward.clone().applyQuaternion(this._qI.identity().slerp(qv, 1 - Math.exp(-dt * 2))));
    }
  }

  // The marker on the target: where it is on screen, how far, how long the trip takes.
  updateTargetMarker() {
    const m = this.targetMarker;
    if (!m) return;
    this.touch?.setGo(!!this.targetId, this.transfer);
    const t = this.targetId && !this.menuOpen && !this.photo && !this.benchmark?.active ? this.resolveTarget(this.targetId, this._tgtM || (this._tgtM = {})) : null;
    if (!t) { if (m.visible) m.hide(); if (this.targetId && !this.resolveTarget(this.targetId, this._tgtM || (this._tgtM = {}))) this.targetId = null; return; }
    const rig = this.rig, p = rig.pos, cam = [p.x, p.y, p.z];
    const v = (this._vM || (this._vM = new THREE.Vector3())).set(t.pos[0] - p.x, t.pos[1] - p.y, t.pos[2] - p.z);
    const dist = v.length(), gap = Math.max(0, gapTo(cam, t)), stop = standoff(t);
    // How long a GO trip from here takes (flown quickly in autopilot.js), twice a second.
    if (this.frameCount % 30 === 0 || this._etaFor !== this.targetId) {
      this._etaFor = this.targetId;
      this.targetEta = gap > stop ? tripTime(cam, t, this.world.radius, p.length() - this.world.radius - rig.agl) : 0;
    }
    const here = gap <= stop * 1.05 || (t.kind === 'place' && gap < OVER_PLACE * 1.3);
    const when = here ? 'here' : this.transfer ? `arriving in ${fmtTime(this.targetEta)}` : `GO ${fmtTime(this.targetEta)}`;
    const shown = t.kind === 'place' ? groundDistance(cam, t, this.world.radius) : gap;     // a place: along the ground; a body: to its surface
    v.divideScalar(dist || 1);
    // A place hidden behind the world's curve is marked where the way to it crosses the
    // horizon, not through the ground (it seemed to label whatever lay in front of it).
    let beyond = false;
    if (t.kind === 'place') {
      // (against a sphere through whichever is lower, the eye or the place, 50 m down: the
      // ground there can lie kilometres below the datum, on the Moon and at Gale)
      const r = p.length(), tc = -(p.x * v.x + p.y * v.y + p.z * v.z);   // closest approach to the centre
      const R = Math.min(r, Math.hypot(t.pos[0], t.pos[1], t.pos[2])) - 50;
      if (tc > 0 && tc < dist && r * r - tc * tc < R * R) {
        beyond = true;
        const up = (this._upM || (this._upM = new THREE.Vector3())).copy(p).divideScalar(r);
        const dip = Math.acos(Math.min(1, R / r));
        v.addScaledVector(up, -v.dot(up));
        if (v.lengthSq() < 1e-12) v.copy(rig.forward).addScaledVector(up, -rig.forward.dot(up));
        v.normalize().multiplyScalar(Math.cos(dip)).addScaledVector(up, -Math.sin(dip));
      }
    }
    m.update(rig.camera, v, t.radius ? Math.asin(Math.min(1, t.radius / dist)) : 0, t.name, `${fmtDistance(shown)}${beyond ? ' over the horizon' : ''} · ${when}`);
  }

  // Where a body (or 'sun') is now, in the home world's axes; null for the home world itself.
  bodyPosition(id, out) {
    const eph = this.ephemeris;
    if (id === 'sun') return out.set(eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]).multiplyScalar(eph.sunDistance);
    const b = id !== this.world.body && eph.bodies.get(id);
    return b ? out.set(b.pos[0], b.pos[1], b.pos[2]) : null;
  }

  // The tide where the traveller is: the sea's level against the highest tide (metres, 0 or
  // below; the mapped shore is the highest tide's). The world file names the bodies that
  // pull and how high each would raise an ocean that covered the whole world (sea.tide.by:
  // [id, metres]: on Earth the Moon 0.36, the Sun 0.16). High water under such a body and
  // on the far side of the world from it, low water where it stands on the horizon: so
  // twice a day, an hour later each day as the Moon goes round; spring tides when the
  // Moon and the Sun pull along one line, neaps when they pull across each other. A real
  // shore makes more of it than an open ocean would (sea.tide.gain).
  updateTide(dt) {
    const t = this.world.surface.sea?.tide, u = this.terrain.shared.uTide.value;
    if (!t) { u.x = 0; this.tide = 0; this.tideText = ''; return; }
    const p = this.rig.pos, pl = p.length(), b = this._tideB || (this._tideB = new THREE.Vector3());
    let h = 0, top = 0;
    for (const [id, m] of t.by) {
      top += m;
      if (!this.bodyPosition(id, b)) continue;
      const c = (b.x * p.x + b.y * p.y + b.z * p.z) / (b.length() * pl);
      h += m * (1.5 * c * c - 0.5);
    }
    const level = (h - top) * (t.gain ?? 1), was = this.tide;
    // (rising or falling: by the clock's own pace, which may run fast or backwards)
    if (was != null && dt > 0 && level !== was) this.tideTrend = (this.tideTrend || 0) * 0.9 + 0.1 * Math.sign(level - was);
    this.tide = level; u.x = level;
    this.tideText = `${(-level).toFixed(1)} m under high water, ${Math.abs(this.tideTrend || 0) < 0.05 ? 'slack' : this.tideTrend > 0 ? 'rising' : 'falling'}`;
  }

  // Keeps the traveller where it was relative to body `carry.id` over the step the
  // ephemeris just made: M0 the home axes before it, b0 the body's place before it. The
  // home axes turned by R = M1 * M0^T meanwhile; position and every vector kept in those
  // axes turn with them (by the share carry.w: 1 near the body, fading out far from it).
  carryWith(M0, b0, carry) {
    const b1 = this.bodyPosition(carry.id, this._carryB1 || (this._carryB1 = new THREE.Vector3()));
    if (!b1) return;
    const M1 = this.ephemeris.icrfToFixed, m = this._carryM || (this._carryM = new THREE.Matrix4()), q = this._carryQ || (this._carryQ = new THREE.Quaternion());
    const R = (i, j) => M1[i * 3] * M0[j * 3] + M1[i * 3 + 1] * M0[j * 3 + 1] + M1[i * 3 + 2] * M0[j * 3 + 2];
    m.set(R(0, 0), R(0, 1), R(0, 2), 0, R(1, 0), R(1, 1), R(1, 2), 0, R(2, 0), R(2, 1), R(2, 2), 0, 0, 0, 0, 1);
    q.setFromRotationMatrix(m);
    const rig = this.rig, t = this._carryT || (this._carryT = new THREE.Vector3());
    // one large step of the clock (the time slider): go with the body or stay, never part
    // of the way (the straight line between could run through the home world)
    let w = carry.w;
    if (b1.distanceTo(b0) > rig.pos.distanceTo(b0)) { if (w < 0.5) return; w = 1; }
    if (w < 1) q.slerp(this._carryI || (this._carryI = new THREE.Quaternion()), 1 - w);
    t.copy(rig.pos).sub(b0).applyQuaternion(q).add(b0).addScaledVector(b1.sub(b0), w);
    rig.pos.copy(t);
    this.turnAxes((v) => v.applyQuaternion(q));
  }

  // Turns every vector that is kept in the home world's axes (the view, the velocity, a
  // trip's heading, the character's cloth and what it remembers of its motion). `turn`
  // changes a Vector3 in place. Used when the axes themselves change: at a world
  // hand-over and when the traveller is carried along with another body.
  turnAxes(turn) {
    const rig = this.rig, hero = this.hero, tmp = this._taV || (this._taV = new THREE.Vector3());
    const f = (this._taF || (this._taF = new THREE.Vector3())).copy(rig.forward), u = (this._taU || (this._taU = new THREE.Vector3())).copy(rig.up);
    turn(rig.velocity);
    rig.lookAlong(turn(f)); rig.keepUp(turn(u));          // no jump of the horizon: see CameraRig.roll
    if (rig.auto?.dir) turn(rig.auto.dir).normalize();
    for (const v of [hero.prevVel, hero.lag, hero.facing]) turn(v);
    for (const a of [hero.robe.pos, hero.robe.prev]) {
      for (let i = 0; i < a.length; i += 3) { turn(tmp.set(a[i], a[i + 1], a[i + 2])); a[i] = tmp.x; a[i + 1] = tmp.y; a[i + 2] = tmp.z; }
    }
  }

  // Distances to everything else in the sky: speed limit for hero flight, collision with
  // bodies that have no terrain, and the hand-over to another world when it becomes nearer.
  space(eph) {
    const rig = this.rig;
    let nearest = Infinity, name = '', nearReach = 1;
    const sunAt = this.bodyPosition('sun', this._sunAt || (this._sunAt = new THREE.Vector3()));
    const sunClear = rig.pos.distanceTo(sunAt) - SOLAR_SYSTEM.sun.radius;
    for (const b of this.bodies.bodies) {
      if (b.id === this.world.body) continue;
      const R = b.reach, d = rig.pos.distanceTo(new THREE.Vector3(...eph.bodies.get(b.id).pos));
      let clear = d - R;
      if (clear < R * 0.02) {                                       // do not fly into a body without terrain
        const pos = new THREE.Vector3(...eph.bodies.get(b.id).pos);
        rig.pos.sub(pos).setLength(R * 1.02).add(pos); rig.agl = rig.clearance();     // (its true height over the home world: 0 here made flight crawl at walking pace)
        clear = R * 0.02;
      }
      if (clear < nearest) { nearest = clear; name = b.id; nearReach = R; }
    }
    // The Sun has no terrain either: stop just above it.
    if (sunClear < SOLAR_SYSTEM.sun.radius * 0.02) {
      rig.pos.sub(sunAt).setLength(SOLAR_SYSTEM.sun.radius * 1.02).add(sunAt); rig.agl = rig.clearance();
    }
    rig.spaceDistance = Math.max(0, Math.min(nearest, sunClear));
    // Which body the traveller is carried along with next frame (carryWith): the nearest
    // one that is not home, fully within 10 of its radii, not at all beyond 50, and only
    // when it is nearer than the home world's ground.
    {
      const sunNear = sunClear < nearest, clear = sunNear ? sunClear : nearest, Rb = sunNear ? SOLAR_SYSTEM.sun.radius : nearReach;
      const x = Math.min(1, Math.max(0, (clear / Rb - 10) / 40));
      const c = this.carry || (this.carry = { id: '', w: 0 });
      c.id = sunNear ? 'sun' : name; c.w = clear < rig.agl ? 1 - x * x * (3 - 2 * x) : 0;
    }
    // Gravity and the fly-by limit (controls/gravity.js): every body, the Sun and the
    // world underfoot, in planet-fixed metres.
    const list = this._wells || (this._wells = []);
    list.length = 0;
    list.push({ x: 0, y: 0, z: 0, radius: this.world.radius, gravity: this.world.gravity });
    for (const b of this.bodies.bodies) {
      if (b.id === this.world.body) continue;
      const q = eph.bodies.get(b.id).pos;
      list.push({ x: q[0], y: q[1], z: q[2], radius: b.reach, gr: b.def.radius, gravity: b.def.gravity || 0 });
    }
    list.push({ x: eph.sunDir[0] * eph.sunDistance, y: eph.sunDir[1] * eph.sunDistance, z: eph.sunDir[2] * eph.sunDistance, radius: SOLAR_SYSTEM.sun.radius, gravity: SOLAR_SYSTEM.sun.gravity });
    const s = surroundings(rig.pos, list, this._around || (this._around = {}));
    rig.pull.set(s.gx, s.gy, s.gz); rig.nearDir.set(s.nx, s.ny, s.nz); rig.nearR = s.nr;
    this.nearestName = rig.agl <= nearest ? this.world.id : name;
    this.nearestClear = Math.min(rig.agl, nearest);
    if (this.shotMode || this.switching || rig.mode === 'walk') return;
    const fail = this._loadFail || (this._loadFail = new Map());
    for (const w of Object.values(WORLDS)) {
      if (w.body === this.world.body) continue;
      if (this.benchmark?.active && w.id !== this.benchmark.destination) continue;      // (the benchmark's route is the same every run: no detour by a moon in the way)
      const d = rig.pos.distanceTo(new THREE.Vector3(...eph.bodies.get(w.body).pos)) - w.radius;
      const f = fail.get(w.id);
      if (f && performance.now() < f.until) continue;          // its data would not load: wait before trying again
      // Its data is fetched ahead: once it is nearer than twenty of its radii or the home
      // world's ground is no nearer than six times as far, or a trip is aimed at it.
      const failed = (e) => {
        const n = (fail.get(w.id)?.n || 0) + 1;
        fail.set(w.id, { n, until: performance.now() + Math.min(60000, 5000 * 2 ** (n - 1)) });
        console.warn('world load failed', w.id, e);
      };
      if (d < Math.max(20 * w.radius, rig.agl / 6) || this.targetId === w.body) {
        // (one failure per download, however many frames asked for it)
        const p = this.loadWorldData(w), seen = this._loadSeen || (this._loadSeen = new WeakSet());
        if (!seen.has(p)) { seen.add(p); p.catch(failed); }
      }
      if (d < rig.agl * 0.8) {
        this.switchWorld(w).then(() => fail.delete(w.id), (e) => { if (!fail.has(w.id)) failed(e); this.toast?.show(`Could not load ${titleCase(w.id)} — trying again`); });
        break;
      }
    }
  }

  // Makes another world the home world, keeping the camera where it is in space.
  async switchWorld(w) {
    if (this.switching) return;
    this.switching = true;
    try {
      const data = await this.loadWorldData(w);
      const { rig, ephemeris: eph } = this, jd = eph.jd;
      // camera state: old planet-fixed frame -> inertial
      const M0 = Array.from(eph.icrfToFixed), h0 = eph.positionICRF(this.world.body, jd, [0, 0, 0]);
      const toI = (v) => [M0[0] * v.x + M0[3] * v.y + M0[6] * v.z, M0[1] * v.x + M0[4] * v.y + M0[7] * v.z, M0[2] * v.x + M0[5] * v.y + M0[8] * v.z];
      const p = toI(rig.pos);
      this.world = w; this.hs = data.hs;
      eph.homeId = w.body;
      eph.update(jd, this.bodies.ids);
      const M1 = eph.icrfToFixed, h1 = eph.positionICRF(w.body, jd, [0, 0, 0]);
      const toF = (a) => new THREE.Vector3(M1[0] * a[0] + M1[1] * a[1] + M1[2] * a[2], M1[3] * a[0] + M1[4] * a[1] + M1[5] * a[2], M1[6] * a[0] + M1[7] * a[1] + M1[8] * a[2]);
      rig.setWorld(w, this.heightFn(w, data.hs));
      rig.onFoot = false;                           // a hand-over only ever happens in flight
      rig.pos.copy(toF([p[0] + h0[0] - h1[0], p[1] + h0[1] - h1[1], p[2] + h0[2] - h1[2]]));
      // every vector kept in the home axes turns with them (the view with no jump of the
      // horizon, the velocity, a trip's heading, the character's cloth and motion: left in
      // the old axes the trip veered off and the cloth whipped round)
      this.turnAxes((v) => v.copy(toF(toI(v))));
      // everything that depends on the world
      G.uPlanetRadius.value = w.radius;
      this.atmosphere.setWorld(w);
      this.terrain.setWorld(w, data.rasters, data.hs);
      this.sky.setWorld(w, data);
      this.rocks.setWorld(w, data.hs);
      this.farRocks.setWorld(w); this.addRockCasters();
      this.trees.setWorld(w); this.farForest.setWorld(w); this.look.setWorld(w); this.grass.setWorld(w);
      this.dust.setWorld(w);
      this.placeLander(w, data.hs);
      this.bodies.setWorld(w);
      this.post.setExposureSettings(w.scene.exposure);
      // the moment stays, the time slider is centred on it (the offset carried over into a
      // shorter range made the clock jump by days at the first touch of a time key)
      this.baseJD += this.timeOffsetHours / 24; this.timeOffsetHours = 0;
      this.timeRange = (w.dayHours || 24) / 2;
      this.hud.setTimeRange(this.timeRange);
      this.bookmark = '';
      this.governor.arrive(w.id);
    } finally { this.switching = false; this.switchedAt = performance.now(); }
  }

  frame(now) {
    const frameStart = performance.now(), prof = this.profile;
    prof.begin();
    const dtMs = this.lastNow ? now - this.lastNow : 16.7;
    this.lastNow = now;
    const dt = Math.min(dtMs, 100) / 1000;
    const { renderer, rig, post, governor } = this;
    renderer.info.reset();
    this.frameCount++;

    // 0. What kind of frame was the last one, and who is steering
    const uploads = this.lastUploads;
    const cause = this.frameCause(now, uploads);
    const bench = this.benchmark?.active;
    if (bench) {
      // The benchmark plays by itself: the player's stick and look input are ignored.
      const i = this.input; i.dx = i.dy = i.wheel = 0; i.moveX = i.moveY = 0;
      this.benchmark.update(dtMs, cause);
      if (this.frameCount % 15 === 0) this.banner.set(this.benchmark.status);
    }
    const input = this.menuOpen || this.overlayOpen ? NO_INPUT : this.input;

    // 1. Time and sky geometry
    if (!this.menuOpen && !bench) this.handleKeys(dt);
    if (!this.paused) this.timeOffsetHours += dt * this.timeRate / 3600;
    // (run far from the scene's date: the slider is centred again on where the clock is)
    if (Math.abs(this.timeOffsetHours) > this.timeRange * 1.001 && this.timeRate !== 1) { this.baseJD += this.timeOffsetHours / 24; this.timeOffsetHours = 0; }
    this.baseJD = Math.min(JD_MAX, Math.max(JD_MIN, this.baseJD));
    const jd = this.baseJD + this.timeOffsetHours / 24;
    const eph = this.ephemeris;
    // Beside a body that is not the home world (hovering at Phobos, over the Sun), the
    // traveller stays put relative to that body: everything is kept in the home world's
    // spinning axes, in which such a body races by at kilometres per second.
    const carry = this.carry, M0 = carry && carry.w > 0 && !this.switching && this.rig.mode !== 'walk' && !this.rig.onFoot ? Array.from(eph.icrfToFixed) : null;
    const b0 = M0 ? this.bodyPosition(carry.id, this._carryB0 || (this._carryB0 = new THREE.Vector3())) : null;
    eph.update(jd, this.bodies.ids);
    if (b0) this.carryWith(M0, b0, carry);
    G.uTime.value = this.shotMode ? 0.25 : now / 1000;
    {
      // Weather where the traveller is, and what follows from it: the clouds' motion on the
      // game clock, wind and waves, shade, wet ground, rain, lightning and its light, thunder
      // (sky/skySystem.js; a world without weather: a steady breeze from the west).
      const sh = this.terrain.shared;
      const day = this.lifeDay;                    // (the day of the life's year: life/season.js)
      const sunE = Math.max(G.uSunIrradiance.value.x, G.uSunIrradiance.value.y, G.uSunIrradiance.value.z, 1e-6) / Math.max(1e-3, 1 - (this.sunCover || 0));
      const speed = this.sky.weatherStep({ now, dt, jd, timeRate: this.timeRate, paused: this.paused, rig, day, sunE, viewW: this.post.viewW, viewH: this.post.viewH, bench, transfer: this.transfer, audio: this.audio });
      // (streamed elevation has arrived or moved: what was stood on the old ground is stood again)
      if (this._ringsSeen !== this.terrain.ringSerial && !this.terrain.tiles.busy) {
        this._ringsSeen = this.terrain.ringSerial;
        this.falls.rebuild(this.terrain.ringFalls || [], this.world.radius, rig.travellerAt);
        if (this.lander) this.placeLander(this.world, this.terrain.hs);
        this.rocks.cellKey = '';
      }
      sh.uWave.value.set(waveScale(speed), this.wavesLift === false ? 0 : 1, this.shotMode ? 3.0 : (now / 1000) % 14400);
      // how deep the water is where the figure stands (0 on land): the rig slows in it
      // (under the flying figure too: no dust is raised from water)
      this.updateTide(dt);
      if (this.world.surface.sea) {
        const f = rig.travellerAt, l = f.length(), h = this.terrain.hs.height(f.x / l, f.y / l, f.z / l, 1), up = h - (this.world.surface.sea.level ?? 0);
        // (what the tide has left of it; lakes and rivers keep theirs)
        rig.water = Math.max(0, this.terrain.hs.waterDepth + (up < 4 ? this.tide || 0 : 0));
        // (and how it runs there: a river carries what swims in it. East and north at the place.)
        const hs = this.terrain.hs, fe = hs.flowE, fn = hs.flowN, dx = f.x / l, dy = f.y / l, dz = f.z / l, el = 1 / (Math.hypot(dx, dy) || 1), ex = -dy * el, ey = dx * el;
        rig.current.set(ex * fe - dz * ey * fn, ey * fe + dz * ex * fn, (dx * ey - dy * ex) * fn);
      } else { rig.water = 0; rig.current.set(0, 0, 0); }
    }

    prof.mark(0);
    // 2. Camera (a hands-off trip steers it first)
    this.updateTransfer(dt, input);
    rig.update(dt, input, input.down('KeyZ'));
    this.space(eph);
    const world = this.world;                       // may have just changed
    G.uSunDir.value.set(eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]);
    const sunC = SOLAR_SYSTEM.sun.color, k = (AU_M / eph.sunDistance) ** 2;
    G.uSunIrradiance.value.set(sunC[0] * k, sunC[1] * k, sunC[2] * k);
    // An eclipse: a body in front of the Sun takes the share of sunlight it covers.
    // (seen from the camera, so it holds for the ground round it: a body's shadow is a small
    // patch of the world. High above the ground it is the camera alone that is in the shadow,
    // not the world below: there the sunlight is left as it is.)
    {
      const x = Math.min(1, Math.max(0, (rig.agl - 20e3) / 80e3));
      this.sunCover = this.bodies.sunCover(eph, rig.pos) * (1 - x * x * (3 - 2 * x));
      if (this.sunCover > 0) G.uSunIrradiance.value.multiplyScalar(1 - this.sunCover);
    }
    // Light from the home world below on things high above it (the figure in orbit was
    // near black on its shaded side over a sunlit planet): its day side as a lamp, by how
    // much of the sky below it fills and how much of that is in daylight.
    {
      const r = rig.pos.length(), R = world.radius, alt = r - R, x = Math.min(1, Math.max(0, (alt - 20e3) / 130e3));
      const mu0 = (rig.pos.x * eph.sunDir[0] + rig.pos.y * eph.sunDir[1] + rig.pos.z * eph.sunDir[2]) / r;
      const hd = SOLAR_SYSTEM[world.body] || {}, c = hd.color || [1, 1, 1];
      const e = x * x * (3 - 2 * x) * (hd.geometricAlbedo ?? 0.2) * 1.2 * Math.min(1, Math.max(0, (mu0 + 0.15) / 1.15)) * (R / r) ** 2;
      G.uHomeShine.value.copy(G.uSunIrradiance.value).multiplyScalar(e); G.uHomeShine.value.x *= c[0]; G.uHomeShine.value.y *= c[1]; G.uHomeShine.value.z *= c[2];
    }
    G.uPlanetRadius.value = world.radius;
    G.uCamPlanetPos.value.copy(rig.pos);
    { const r = rig.pos.length(); this.look.update(Math.asin(Math.max(-1, Math.min(1, (rig.pos.x * eph.sunDir[0] + rig.pos.y * eph.sunDir[1] + rig.pos.z * eph.sunDir[2]) / r))) * 57.29578, r - world.radius, post.compositeMat.uniforms, post, rig.agl); }
    this.terrain.tintAt(rig.pos, G.uGroundTint.value);

    prof.mark(1);
    // 3. Terrain LOD, rocks, lander, hero
    const aspect0 = post.width / post.height;
    const sunHalf = Math.asin(SOLAR_SYSTEM.sun.radius / eph.sunDistance);
    this.atmosphere.updateAir(rig.pos, G.uSunDir.value, this.terrain);     // before the terrain takes the workers
    this.requestHeroVis(dt, sunHalf);
    // (a GO trip to a place: the ground and the maps there are got ready while on the way,
    // for a traveller arriving a few hundred metres over it)
    const tg = this.transfer && this._tgtU && this._tgtU.kind === 'place' ? this._tgtU.pos : null;
    if (tg) { const l = Math.hypot(tg[0], tg[1], tg[2]); this.terrain.dest = (this._destV || (this._destV = new THREE.Vector3())).set(tg[0], tg[1], tg[2]).multiplyScalar((l + OVER_PLACE * 0.5) / l); } else this.terrain.dest = null;
    this.farRocks.ask();                               // (one tile of far rocks before the ground takes the workers)
    this.terrain.update(rig, aspect0, G.uSunDir.value, sunHalf);
    prof.mark(2);
    this.rocks.update(rig, eph.sunDir, sunHalf, this.terrain.workers);
    this.farRocks.update(rig, eph.sunDir, sunHalf);
    {
      const day = this.lifeDay;                    // (the day of the life's year: life/season.js)
      this.trees.update(rig, day, this.terrain.shared.uWave.value.z);
      this.farForest.update(rig);
      // (beyond the trees the forest is raised as a whole; from high up, all of it)
      const tr = this.trees, drawn = tr.reach > 0, r = tr.reach;
      // (it is up to its height where the last trees stand: from above, the ground showed
      // brown in a ring between the trees and the canopy)
      this.terrain.shared.uShell.value.set(drawn ? r * 0.62 : 0, drawn ? r * 0.98 : 1, tr.def ? 1 : 0);
      this.leaves.update(rig, this.post.viewH);
      this.petals.update(rig, this.post.viewH, dt);
      this.grass.update(rig, dt, renderer);
      { const up = rig.localUp, sd = G.uSunDir.value; this.pollen.update(dt, sd.x * up[0] + sd.y * up[1] + sd.z * up[2]); }
      // (fallen leaves on the ground under the trees, in their season)
      const se = tr.shared.uSeason.value; this.terrain.shared.uLitter.value = tr.def ? Math.min(1, se.x * 0.8 + se.y) : 0;
    }
    this.lander.update(rig, eph.sunDir, sunHalf, this.terrain.workers);
    prof.mark(3);
    this.updateHero(dt, sunHalf);
    this.updateOccluders();                         // (also with the character hidden: the lander and rocks)
    prof.mark(4);

    // 4. Atmosphere LUTs
    governor.beginFrame();
    // (a photograph is one frame at full size; the governor does not count it)
    if (this.photoWanted) this.resizedAt = now;
    post.setScale(this.photoWanted ? 1 : governor.scale);
    this.fitCanvas(now);
    G.uViewport.value.set(post.viewW, post.viewH);
    // (the far waterfalls: listed again when the traveller has gone far from where they were listed)
    if (this.falls.count && this.falls.anchor.distanceToSquared(rig.travellerAt) > 2.5e7) this.falls.rebuild(this.terrain.ringFalls || [], this.world.radius, rig.travellerAt);
    this.falls.update(rig.pos, post.viewH);
    this.grass.setView(post.viewH);                 // (blades and pollen measure a pixel of this picture, not of the canvas)
    G.uExposure.value = post.exposure;
    const aspect = post.viewW / post.viewH;
    const th = Math.tan(rig.fov * Math.PI / 360);
    G.uCamRight.value.copy(rig.right); G.uCamUp.value.copy(rig.up); G.uCamFwd.value.copy(rig.forward);
    G.uTanHalfFov.value.set(th * aspect, th);
    this.atmosphere.update(rig.pos, G.uSunDir.value, this.terrain.farDistance, post.exposure);
    this.skyDome.visible = !this.atmosphere.empty;
    // (the disc's own brightness is that of the unhidden Sun: an eclipse hides it, it does not dim it)
    this.sun.update(G.uSunDir.value, eph.sunDistance, rig, post.viewH, (this._sunE || (this._sunE = new THREE.Vector3())).set(sunC[0] * k, sunC[1] * k, sunC[2] * k));
    this.bodies.update(eph, rig, post.viewH);
    this.warp.update(rig.velocity.length(), Math.min(rig.agl, rig.spaceDistance ?? Infinity), dt, aspect, th);
    if (this.frameCount % 12 === 0) { if (this.menu?.visible) this.menu.tick(); if (this.map?.visible) this.map.draw(); }
    // (an overlay is clicked with the mouse: let go of it)
    if (this.overlayOpen && document.pointerLockElement) document.exitPointerLock?.();
    if (!this.shotMode && !this.menuOpen && !bench) {
      if (this.frameCount % 20 === 0) this.checkPlaces();
      // where the traveller is, for next time (on or near the ground only)
      if (this.frameCount % 300 === 0 && rig.agl < 5000) {
        const r = rig.pos.length();
        this.save.data.last[world.id] = { lat: +(Math.asin(rig.pos.z / r) * 180 / Math.PI).toFixed(5), lon: +(((Math.atan2(rig.pos.y, rig.pos.x) * 180 / Math.PI) + 360) % 360).toFixed(5), heading: Math.round(rig.heading) };
        this.save.touch();
      }
      this.save.tick(dt);
      // sound: the air's density where the traveller is, how it moves, what just happened
      const a = world.atmosphere, alt = rig.pos.length() - world.radius;
      const dens = a ? (a.surfaceDensity ?? 0) * Math.exp(-Math.max(0, alt) / (a.rayleigh?.scaleHeight ?? 10000)) : 0;
      const foot = rig.mode === 'hero' && rig.onFoot, landed = this._wasAir && foot && !rig.airborne ? Math.max(1, rig.landSpeed) : 0;
      this._wasAir = !foot || rig.airborne;
      this.audio.update(dt, { wind: this.weather.own ? this.weather.windSpeed : 0, rain: this.weather.rain + 0.5 * this.weather.snow, airDensity: dens, speed: rig.velocity.length(), onFoot: foot || rig.mode === 'walk', airborne: rig.airborne, throttle: rig.throttle || 0, boost: rig.boost, flying: rig.mode === 'hero' && !rig.onFoot, warp: this.warp.amount, landed });
    }
    this.stars?.setFrame(eph.icrfToFixed, rig, post.viewH);
    // ?aim=<body>: possible only now, once the bodies have a position for this moment.
    if (this.pendingAim && this.frameCount >= 2) { this.aimAt(this.pendingAim); this.pendingAim = null; }
    // ?at=<body>:<radii>[:<round>[:<up>]]: the camera beside that body, looking at it (pictures
    // of a body that is not the home world); `round` turns away from the Sun's side.
    if (this.params.at && this.frameCount === 2) {
      const [id, radii = '4', round = '0', upDeg = '0'] = this.params.at.split(':');
      const c = this.bodyPosition(id, new THREE.Vector3()), R = id === 'sun' ? SOLAR_SYSTEM.sun.radius : this.bodies.byId.get(id)?.def.radius;
      if (c && R) {
        const sunAt = this.bodyPosition('sun', new THREE.Vector3());
        const toSun = id === 'sun' ? c.clone().negate().normalize() : sunAt.sub(c).normalize();     // (for the Sun itself: its side facing home)
        const pole = new THREE.Vector3(0, 0, 1), side = new THREE.Vector3().crossVectors(pole, toSun).normalize(), upv = new THREE.Vector3().crossVectors(toSun, side);
        const a = +round * Math.PI / 180, e = +upDeg * Math.PI / 180;
        const d = toSun.clone().multiplyScalar(Math.cos(a) * Math.cos(e)).addScaledVector(side, Math.sin(a) * Math.cos(e)).addScaledVector(upv, Math.sin(e));
        if (rig.mode === 'walk') rig.setMode('fly');
        rig.pos.copy(c).addScaledVector(d, +radii * R);
        rig.lookAlong(d.negate());
        if (this.carry) this.carry.w = 0;
      }
    }
    // ?target=<id>: the marker on that target (place:<id> for a place), the view left alone.
    if (this.params.target && this.frameCount === 2) this.targetId = this.params.target;

    // The Sun's place on screen, so the exposure meter can leave its glare out.
    {
      // (where the disc is drawn: from the camera, not from the home world's centre)
      const d = this.sun.uniforms.uDiscDir.value, half = this.sun.uniforms.uAngRadius.value, f = d.dot(rig.forward);
      if (f > 0.05) post.setSun(0.5 + 0.5 * d.dot(rig.right) / (f * th * aspect), 0.5 + 0.5 * d.dot(rig.up) / (f * th), Math.tan(Math.min(half, 1.4)) / (2 * th), true);
      else post.setSun(0, 0, 0, false);
    }

    prof.mark(5);
    // 5. Near shadow map (ship, rocks, hero)
    this.nearShadow.render(rig.pos, G.uSunDir.value, rig.localUp);
    prof.mark(6);

    // (the sky's passes before the main picture is begun, each into a target of its own: the
    // clouds' shadow map for trees and the grass's far clumps, the cloud volume's small picture,
    // laid over the ground further down: nothing interrupts the main picture, sky/skySystem.js)
    const cloudFar = this.sky.beforeScene({ renderer, post, rig, worldRadius: world.radius, time: this.terrain.shared.uWave.value.z, treesWanted: this.farForest.shown || this.trees.reach > 0 || this.grass.keepClumps > 0 });
    // (the light on the grass: a small table of it, worked out once here instead of in every pixel of every blade)
    this.grass.renderLight(renderer, rig.camera);
    prof.mark(9);
    // 6. Scene into the HDR target: far pass, clear depth, near pass, then the hero.
    post.beginScene();
    rig.finalize(aspect, 0.002, 100);         // (the sky bodies' slots can come close when one of them fills the view: SkyBodies.update)
    renderer.render(this.farScene, rig.camera);
    renderer.clearDepth();
    prof.mark(7);
    const near = Math.max(0.25, Math.min(2e6, Math.min(rig.agl, rig.floor || rig.agl) * 0.15));      // (by the floor: a tor right under the camera must not be cut away)
    // (clouds: the ground's shadow reads what the layer shows; the view must reach the layer's horizon)
    this.sky.groundUniforms();
    const far = Math.max(this.terrain.farDistance, cloudFar) * 1.05;
    rig.finalize(aspect, near, far);
    renderer.render(this.nearScene, rig.camera);
    prof.mark(8);
    // (the sky in the picture, in the plan's order: far cell sheets, shells above, the far low shell,
    // fog and lenses, the strokes' slot, the near cloud slices laid over the ground, shells below)
    this.sky.afterGround({ renderer, rig, near, far, nearVisible: this.nearScene.visible });
    prof.mark(9);
    // (the weather scene: rain, strokes, rainbow, pollen; and the rain again in a slice of its
    // own from the eye to the terrain's near plane)
    this.sky.drawWeather({ renderer, rig, aspect, near, far });
    // (the same for the pollen: the motes nearest the eye are the ones seen one by one)
    if (this.pollen.mesh.visible && near > 1.0) {
      rig.finalize(aspect, 0.2, near * 1.02);
      this.pollen.material.depthTest = false; renderer.render(this.pollen.mesh, rig.camera); this.pollen.material.depthTest = true;
      rig.finalize(aspect, near, far);
    }
    if (this.hero.group.visible) {
      // Near the ground the hero shares the terrain's depth buffer (rocks can hide it);
      // higher up the terrain's near plane has moved past it, so it gets its own slice.
      if (near > 1.0) {
        renderer.render(this.dustScene, rig.camera);        // still the terrain's depth
        renderer.clearDepth(); rig.finalize(aspect, 0.2, 400);
        renderer.render(this.heroScene, rig.camera);
      } else {
        renderer.render(this.heroScene, rig.camera);
        renderer.render(this.dustScene, rig.camera);
      }
    }
    post.endScene();
    prof.mark(10);

    // 7. Post
    post.render(dt);
    if (this.photoWanted) { this.photoWanted = false; this.savePhoto(); }
    governor.endFrame();
    if (bench && this.benchmark.cost) this.benchmark.cost.frameDone(frameStart);
    const settling = cause !== 'unknown' && cause !== 'quality step' && !cause.startsWith('new terrain');
    // An upload's cost can land a frame or two later (the driver finishes textures and
    // mip maps on its own time), so the three frames after one count as soft too.
    this.softFrames = uploads ? 3 : Math.max(0, (this.softFrames || 0) - 1);
    // (the page's own work for this frame: everything from the start of frame() to here)
    // (dtMs is the previous frame's time: it goes with that frame's work)
    const prevScript = this.scriptMs || 0;
    prof.mark(11); prof.end();
    this.scriptMs = performance.now() - frameStart;
    governor.update(dtMs, settling ? FRAME.IGNORE : this.softFrames > 0 ? FRAME.SOFT : FRAME.NORMAL, prevScript);
    this.lastUploads = this.terrain.uploads; this.terrain.uploads = 0;

    // 8. HUD
    const info = renderer.info;
    this.stats.calls = info.render.calls; this.stats.triangles = info.render.triangles;
    this.hud.update(dtMs, () => this.collectStats(jd));
    this.updateTargetMarker();
    this.input.endFrame();
    if (!this.loaded && this.frameCount > 3 && this.terrain.drawList.length > 0) {
      this.loaded = true; this.loadedAt = now;
      if (this.params.bench && this.benchmark) this.startBenchmark(this.params.bench);
    }
    // Play waits until the ground under the start is drawn at full detail (first drafts
    // of the terrain can sit metres below the real surface), or 20 s at most.
    if (this.loaded && !this.groundReady && (this.groundSettled() || now > this.loadedAt + 20000)) {
      this.groundReady = true;
      this.startScreen?.setReady(true);
    }

    if (this.shotMode) {
      const ready = this.frameCount > 6 && post.stableReads >= 3 && this.terrain.idle && !this.trees.busy && !this.farForest.busy && !this.farRocks.busy && !this.grass.busy && !this.sky.busy && !this.rocks.needVis && !this.rocks.pendingVis && !this.lander.pending && !this.atmosphere.airBusy && !this.bodies.pending && (!this.hero.group.visible || rig.agl >= 20000 || this.heroVisKnown === true);
      window.__shotReady = ready;
      window.__stats = { weather: this.weather.own ? `wind ${this.weather.windSpeed.toFixed(0)} m/s, rain ${this.weather.rain.toFixed(1)} mm/h, snow ${this.weather.snow.toFixed(1)}, ${this.weather.temp.toFixed(0)} C, sun ${this.weather.sunShade.toFixed(2)}, sky ${this.weather.skyShade.toFixed(2)}, top ${Math.round(this.weather.top)} m` : '', trees: `${this.trees.count} (${Math.round(this.trees.triangles / 1000)}k triangles)${this.trees.names ? ': ' + this.trees.names : ''}`, farTrees: `${this.farForest.count} standing (${this.farForest.held} handed to the GPU)`, farRocks: (() => { const f = this.farRocks, c = (ready || this.frameCount % 30 === 0) ? (f.lastTally = f.tally(rig.camera)) : (f.lastTally || f.tally(rig.camera)); return `${c.rocks} in view of ${c.all} all round, in ${c.tiles} tiles (${c.calls} draw calls, ${Math.round(c.triangles / 1000)}k triangles; ${c.handed} handed to the GPU${f.dropped ? ', ' + f.dropped + ' tiles dropped' : ''})`; })(), water: this.terrain.tiles.rings.map((r) => r.info ? `z${r.zoom}: ${r.info.rivers} rivers, ${Math.round(r.info.flow)} m3/s${r.info.inflow ? '' : ' (no inflow)'}` : null).filter(Boolean).join('; '), stale: this.terrain.staleData, tilesBusy: this.terrain.tiles.busy, refreshQ: this.terrain.readyRefresh.length, rings: this.terrain.ringSerial, tileFails: this.terrain.tiles.failures, busyW: this.terrain.workers.busy, calls: this.stats.calls, triangles: this.stats.triangles, chunks: this.terrain.drawList.length, loaded: this.terrain.loadedCount, visited: this.terrain.visited, wanted: this.terrain.wanted.length, lodScale: +this.terrain.lodScale.toFixed(3), avgBuildMs: +(this.terrain.buildMs / Math.max(1, this.terrain.built)).toFixed(1), exposure: +post.exposure.toPrecision(4), surface: [+(post.surfaceCover ?? 0).toFixed(3), +(post.surfaceBright ?? 0).toPrecision(3)], frame: this.frameCount, wait: `${post.stableReads >= 3 ? '' : 'exposure '}${this.terrain.idle ? '' : 'terrain '}${this.rocks.needVis || this.rocks.pendingVis ? 'rocks ' : ''}${this.lander.pending ? 'lander ' : ''}${this.atmosphere.airBusy ? 'air-shadow ' : ''}${this.sky.waiting}`, sky: this.sky.stats(rig) };
    }
  }

  updateHero(dt, sunHalf) {
    const { hero, rig, world } = this;
    if (!hero.group.visible) return;
    const R = world.radius, r = rig.pos.length(), alt = r - R;
    const a = world.atmosphere;
    const density = a ? (a.surfaceDensity ?? 0) * Math.exp(-Math.max(alt, -20000) / (a.rayleigh?.scaleHeight ?? 8000)) : 0;
    const env = {
      gravity: world.gravity * (R / r) * (R / r),
      air: Math.min(1, Math.sqrt(density / 1.2)),
      groundClearance: rig.agl < 400 ? (rel) => {
        const x = rig.pos.x + rel.x, y = rig.pos.y + rel.y, z = rig.pos.z + rel.z, l = Math.hypot(x, y, z);
        return l - (R + this.hs.height(x / l, y / l, z / l, 1.0));
      } : null,
    };
    if (this.shotMode) {
      // Deterministic pose for screenshots: flying forward (?heropose=fly|fast|bank|climb, or
      // hovering with ?heropose=hover), or on foot (?heropose=stand|walk|run|super|jump; &posedir=side: moving to the right).
      const fp = FOOT_POSES[this.params.heropose];
      let pose;
      if (fp) {
        const U = new THREE.Vector3(...rig.localUp), d = (this.params.posedir === 'side' ? rig.right : rig.forward).clone();
        if (this.params.posedir === 'front') d.negate();          // toward the camera (to see the face)
        const face = d.clone();
        d.addScaledVector(U, -d.dot(U)).normalize();
        pose = { onFoot: true, velocity: d.multiplyScalar(fp.speed), throttle: fp.speed > 0 ? 1 : 0, yawRate: 0, airborne: fp.jump, vUp: fp.jump ? 2.5 : 0, heroRel: rig.heroRel,
          clock: 0, landedAt: fp.landSpeed ? -0.35 : -99, landSpeed: fp.landSpeed || 0, upHeld: fp.upHeld || 0,
          facing: fp.speed === 0 ? face : null };      // (a standing pose has no motion to turn it)
        if (fp.jump) pose.heroRel = rig.heroRel.clone().addScaledVector(U, 1.6);
      } else {
        // fly: cruising; fast: boosting; bank: cruising in a right turn; climb: straight up
        const hp = this.params.heropose, flying = hp !== 'hover';
        const along = this.params.posedir === 'side' ? rig.right : rig.forward;     // side: flying across the view, to the right
        const v = hp === 'climb' ? new THREE.Vector3(...rig.localUp).multiplyScalar(30) : along.clone().multiplyScalar(flying ? 30 : 0);
        pose = { velocity: v, throttle: flying ? 1 : 0, yawRate: hp === 'bank' ? 45 : 0, boost: hp === 'fast' };
      }
      if (!this.heroSettled) { hero.settle(5, rig, env, pose); this.heroSettled = true; } else hero.update(0, rig, env, pose);
    } else hero.update(dt, rig, env);
    rig.chaseBack = hero.chaseBack;                 // (the rig lands the feet where the figure is drawn)
    // Through the telephoto the figure a few metres ahead would fill the screen: it steps
    // out of the picture while the lens is long (its shadow stays).
    const zoomed = rig.fov < rig.baseFov * 0.55;
    hero.show(!zoomed);
    hero.group.updateMatrixWorld(true);
    // (the sculpt's movers, handed to the GPU now: a texture first used in the middle of the
    // picture is uploaded there)
    if (hero.sculpt) {
      this.renderer.initTexture(hero.sculpt.update());
      if (this.sculptChecked !== true && (this.sculptFrames = (this.sculptFrames || 0) + 1) > 20) {
        const ok = hero.sculpt.drawable(this.renderer);
        if (ok === false) { const sc = hero.dropSculpt(); this.nearShadow.removeCaster(sc.shadowMesh); console.warn('the sculpted character cannot be drawn on this device: the built figure is used'); }
        if (ok !== null) this.sculptChecked = true;
      }
    }
    this.updateDust(dt, env);
    // Terrain shadow on the character: eased toward the workers' last answer (requestHeroVis),
    // so stepping into a canyon's shadow dims it over a moment instead of in one frame.
    // (high up no worker is asked: the Sun's disc against the world's own round shadow,
    // or the figure stayed sunlit on the night side of an airless world)
    if (rig.agl >= 20000) {
      const r = rig.pos.length(), sd = G.uSunDir.value, mu = (rig.pos.x * sd.x + rig.pos.y * sd.y + rig.pos.z * sd.z) / r;
      const q = this.world.radius / r, hor = -Math.sqrt(Math.max(0, 1 - q * q));
      const t = Math.min(1, Math.max(0, (mu - (hor - sunHalf)) / (2 * sunHalf)));
      this.heroVisTarget = t * t * (3 - 2 * t);
    }
    const u = hero.uniforms.uSunVis, tgt = this.heroVisTarget ?? 1;
    u.value += (tgt - u.value) * (dt > 0 ? 1 - Math.exp(-dt / 0.08) : 1);
  }

  // Is the character in a terrain shadow? Asks a worker every 0.12 s (a cheap single ray),
  // before the terrain takes the workers for the frame: asked after it, the question went
  // unanswered for as long as terrain was loading, and the light then snapped.
  requestHeroVis(dt, sunHalf) {
    const { hero, rig } = this;
    this.heroVisClock = (this.heroVisClock ?? 1) + (dt > 0 ? dt : 0.02);
    if (!hero.group.visible || !hero.started || rig.agl >= 20000 || this.heroVisPending || this.heroVisClock < 0.12) return;     // (started: the figure has been placed)
    // (a screenshot holds still: one answer is enough, and a worker kept busy every other
    // frame would never let the terrain count as settled)
    if (this.shotMode && this.heroVisKnown) return;
    const p = hero.group.position, pts = new Float64Array([rig.pos.x + p.x, rig.pos.y + p.y, rig.pos.z + p.z]);
    const eph = this.ephemeris, epoch = this.terrain.epoch;
    const job = this.terrain.workers.run({ type: 'points', points: pts, sun: [eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]], sunHalf, minWL: 2 });
    if (!job) return;                                  // no worker free: ask again next frame
    this.heroVisClock = 0; this.heroVisPending = true;
    job.then((res) => { this.heroVisPending = false; if (epoch === this.terrain.epoch) { this.heroVisTarget = res.vis[0]; this.heroVisKnown = true; } }).catch(() => { this.heroVisPending = false; });
  }

  // What hides the sky from the ground beside it (contactSky in the lighting chunk), as
  // camera-relative spheres in three groups: the character's body (torso, legs, two feet),
  // the lander (cabin and descent stage), and the nearest rocks. Governor step "contact"
  // turns the lander's and the rocks' off.
  updateOccluders() {
    const occ = G.uOccluders.value, grp = G.uOccGroups.value, hero = this.hero, rig = this.rig;
    const v = this._occV || (this._occV = new THREE.Vector3()), up = this._occU || (this._occU = new THREE.Vector3());
    // the character
    if (hero.group.visible) {
      const b = hero.body, p = hero.group.position, c = hero.colliders;
      const at = (o, x, y, z, r) => { v.set(x, y, z).applyMatrix4(b.matrix).add(p); if (Number.isFinite(v.x + v.y + v.z)) o.set(v.x, v.y, v.z, r); else o.w = 0; };
      at(occ[0], 0, 0.30, 0, 0.27);
      at(occ[1], 0, -0.42, 0, 0.17);
      // the feet: 0.045 below the far ends of the shins (which end at the sculpt's ankles, that much higher than the built figure's did)
      // the feet: the far ends of the shins (the legs' capsules are limbs 4 and 6, two per limb)
      at(occ[2], c[4 * 7 + 10], c[4 * 7 + 11] - 0.045, c[4 * 7 + 12] + 0.04, 0.09);     // left foot
      at(occ[3], c[6 * 7 + 10], c[6 * 7 + 11] - 0.045, c[6 * 7 + 12] + 0.04, 0.09);     // right foot
      grp[0].set(occ[0].x, occ[0].y, occ[0].z, 6);
    } else { grp[0].w = 0; for (let i = 0; i < 4; i++) occ[i].w = 0; }
    const contact = this.contact !== false;
    this._occX ??= this.params.debug.includes('contactx4') ? 4 : 1;      // ?debug=contactx4: rock spheres 4x (to see it work)
    // the lander (its position is the ground under its centre)
    const lm = this.lander.mesh;
    // (faded in and out between 60 and 80 m, so it never switches on in one frame)
    const fl = 1 - THREE.MathUtils.smoothstep(lm.position.length(), 60, 80);
    if (contact && lm.visible && fl > 0) {
      up.copy(this.lander.position).normalize();
      v.copy(lm.position).addScaledVector(up, 2.6); occ[4].set(v.x, v.y, v.z, 2.0 * fl);
      v.copy(lm.position).addScaledVector(up, 1.1); occ[5].set(v.x, v.y, v.z, 1.6 * fl);
      occ[6].w = occ[7].w = 0;
      v.copy(lm.position).addScaledVector(up, 1.5); grp[1].set(v.x, v.y, v.z, 10 * fl);
    } else { grp[1].w = 0; occ[4].w = occ[5].w = 0; }
    // the eight nearest rocks in front of the camera within 25 m, from the first 96 of the
    // scatter (it comes nearest cells first)
    const rk = this.rocks, n = contact ? Math.min(rk.count ?? 0, rk.geometry.instanceCount, 96) : 0, f = rig.forward;
    const best = this._occBest || (this._occBest = []);
    best.length = 0;
    for (let i = 0; i < n; i++) {
      const x = rk.points[i * 3] - rig.pos.x, y = rk.points[i * 3 + 1] - rig.pos.y, z = rk.points[i * 3 + 2] - rig.pos.z;
      const d2 = x * x + y * y + z * z;
      if (d2 > 25 * 25 || x * f.x + y * f.y + z * f.z < -2) continue;
      best.push(Math.floor(d2 * 10) * 1000 + i);       // sorts by distance (0.1 m^2 steps), carries the index (< 1000)
    }
    best.sort((a, b) => a - b);
    // Each sphere fades out before it can drop from the list: toward the ninth-nearest rock's
    // distance (the next to come in), toward 25 m, and as it passes behind the camera. When
    // the eighth and ninth swap places, the one that leaves has already faded away.
    const dCut = Math.min(25, best.length > 8 ? Math.sqrt(Math.floor(best[8] / 1000) / 10) : 25);
    let k = 0, cx = 0, cy = 0, cz = 0, reach = 0;
    for (; k < Math.min(8, best.length); k++) {
      const i = best[k] % 1000;
      // a sphere as wide as the rock's half-width, centred at its middle (the scatter's point
      // is higher, near its top: there the sphere hid too little of the sky at its foot)
      const r = 0.5 * (rk.aScale.getX(i) + rk.aScale.getY(i)) * 0.5, l = Math.hypot(rk.points[i * 3], rk.points[i * 3 + 1], rk.points[i * 3 + 2]);
      const drop = 0.45 * r / l;
      const x = rk.points[i * 3] * (1 - drop) - rig.pos.x, y = rk.points[i * 3 + 1] * (1 - drop) - rig.pos.y, z = rk.points[i * 3 + 2] * (1 - drop) - rig.pos.z;
      const px = rk.points[i * 3] - rig.pos.x, py = rk.points[i * 3 + 1] - rig.pos.y, pz = rk.points[i * 3 + 2] - rig.pos.z;
      const fade = (1 - THREE.MathUtils.smoothstep(Math.hypot(px, py, pz), 0.75 * dCut, dCut)) * THREE.MathUtils.smoothstep(px * f.x + py * f.y + pz * f.z, -2, 0);
      occ[8 + k].set(x, y, z, this._occX * r * fade); cx += x; cy += y; cz += z;
    }
    for (let i = 8 + k; i < 16; i++) occ[i].w = 0;
    if (k) {
      cx /= k; cy /= k; cz /= k;
      for (let i = 0; i < k; i++) { const o = occ[8 + i]; reach = Math.max(reach, Math.hypot(o.x - cx, o.y - cy, o.z - cz) + 6 * o.w); }
      grp[2].set(cx, cy, cz, reach);
    } else grp[2].w = 0;
  }

  // Dust: thrown up where the character touches down, pushes off or skims the ground.
  updateDust(dt, env) {
    const { hero, rig, dust } = this;
    const up = dust._up.set(rig.localUp[0], rig.localUp[1], rig.localUp[2]);
    const at = this._dustAt || (this._dustAt = new THREE.Vector3()), carry = this._dustCarry || (this._dustCarry = new THREE.Vector3());
    const sunVis = hero.uniforms.uSunVis.value, viewH = this.post.viewH, th = Math.tan(rig.fov * Math.PI / 360);
    if (this.shotMode) {
      // ?dust=1: a touch-down frozen 0.7 s after contact, for reference pictures.
      // ?dust=run (with an on-foot pose): the puffs of the last footfalls, left behind the runner.
      if (this.params.dust === 'run' && rig.onFoot && !this._dustShot) {
        this._dustShot = true;
        const fp = FOOT_POSES[this.params.heropose] || FOOT_POSES.run, speed = Math.max(1.5, fp.speed);
        const dir = (this.params.posedir === 'side' ? rig.right : rig.forward).clone().projectOnPlane(up).normalize();
        const side = new THREE.Vector3().crossVectors(dir, up).normalize(), stride = Math.min(2.8, 0.9 + 0.32 * speed), step = stride / 2, dts = step / speed;
        dust.update(0, rig.pos, up, env.gravity, env.air, viewH, th, sunVis);
        const n = Math.min(10, Math.ceil(2.5 / dts));
        for (let i = n; i >= 1; i--) {
          at.copy(rig.feet).addScaledVector(up, 0.05).addScaledVector(dir, -i * step).addScaledVector(side, i % 2 ? 0.11 : -0.11);
          dust.emit(at, up, Math.round(Math.min(26, 3 + 0.9 * speed) * (1 + 2 * dust.vac)), 0.25 + 0.035 * speed, 0.35 + 0.02 * speed, carry.copy(dir).multiplyScalar(0.35 * speed));
          for (let t = 0; t < dts - 1e-6; t += 0.05) dust.update(Math.min(0.05, dts - t), rig.pos, up, env.gravity, env.air, viewH, th, sunVis);
        }
      } else if (this.params.dust && env.groundClearance && !this._dustShot) {
        this._dustShot = true;
        const p = hero.group.position, c = env.groundClearance(p);
        at.copy(rig.pos).add(p).addScaledVector(up, -(c - 0.15));
        dust.update(0, rig.pos, up, env.gravity, env.air, viewH, th, sunVis);        // (sets how the air holds dust)
        dust.emit(at, up, Math.round(110 * (1 + 2 * dust.vac)), 3.2, 1.1, carry.copy(up).multiplyScalar(0.4));
        for (let i = 0; i < 14; i++) dust.update(0.05, rig.pos, up, env.gravity, env.air, viewH, th, sunVis);
      }
      dust.update(0, rig.pos, up, env.gravity, env.air, viewH, th, sunVis);
      return;
    }
    if (dt > 0 && env.groundClearance) {
      const p = hero.group.position, c = env.groundClearance(p);            // metres of air under the figure
      const v = rig.velocity, vUp = v.dot(up), speed = v.length(), along = Math.sqrt(Math.max(0, speed * speed - vUp * vUp));
      const k = rig.water > 0.1 ? 0 : dust.amount * dust.dustiness;        // (water raises no dust)
      if (c < 3.5) at.copy(rig.pos).add(p).addScaledVector(up, -(c - 0.15));   // the ground under the figure
      // touching down on the feet: a ring thrown outward from them at the moment they touch,
      // bigger the harder the landing
      if ((rig.landings || 0) !== (this._landingsSeen || 0) && rig.landSpeed > 0.8) {
        const s = rig.landSpeed, foot = this._dustFoot || (this._dustFoot = new THREE.Vector3());
        foot.copy(rig.feet).addScaledVector(up, 0.15);
        dust.emit(foot, up, Math.round(Math.min(110, 30 + 14 * s) * k * (1 + 2 * dust.vac)), 1.2 + 0.5 * s, 1.1, carry.copy(rig.footVel).multiplyScalar(0.15).addScaledVector(up, 0.15 * s));
      }
      // taking off: a ring, as from a push off the ground (holding up takes off from the top
      // of a jump, the hips some 2.5 m up)
      if ((rig.takeoffs || 0) !== (this._takeoffsSeen || 0) && c < 3.5) dust.emit(at, up, Math.round(70 * k * (1 + 2 * dust.vac)), 2.6, 1.0, carry.copy(up).multiplyScalar(0.6));
      // footfalls: a small kick of dust from the foot that lands, bigger the faster the run
      if ((hero.steps || 0) !== (this._stepsSeen || 0) && rig.onFoot && !rig.airborne) {
        const foot = this._dustFoot || (this._dustFoot = new THREE.Vector3()), s = hero.stepSpeed || 0;
        const side = this._dustSide || (this._dustSide = new THREE.Vector3());
        side.crossVectors(hero.facing, up).normalize().multiplyScalar(hero.stepSide ? 0.11 : -0.11);
        foot.copy(rig.feet).addScaledVector(up, 0.05).add(side);
        dust.emit(foot, up, Math.round(Math.min(26, 3 + 0.9 * s) * k * (1 + 2 * dust.vac)), 0.25 + 0.035 * s, 0.35 + 0.02 * s, carry.copy(rig.footVel).multiplyScalar(0.35));
      }
      if (c < 2.2) {
        // hovering down to the ground (with HOVER on it never stands): a ring as it arrives
        if (rig.hover && !rig.onFoot && this._dustClear > 2.2 && vUp < -0.8) dust.emit(at, up, Math.round(Math.min(110, 30 + 14 * -vUp) * k * (1 + 2 * dust.vac)), 1.2 + 0.5 * -vUp, 1.1, carry.copy(v).multiplyScalar(0.15).addScaledVector(up, -0.15 * vUp));
        // pushing off, or skimming along: a steady trail
        const stir = ((vUp > 0.8 && rig.throttle > 0.3 ? 30 : 0) + Math.min(40, along * 2.2) * (c < 1.3 ? 1 : 0.3) * (rig.onFoot ? 0.25 : 1)) * (1 + 2 * dust.vac);     // (on foot the footfalls carry most of it)
        this._dustDebt = (this._dustDebt || 0) + stir * k * dt;
        if (this._dustDebt >= 1) { const n = Math.floor(this._dustDebt); this._dustDebt -= n; dust.emit(at, up, n, 0.6 + 0.08 * along, 0.5 + 0.05 * along, carry.copy(v).multiplyScalar(0.25)); }
      }
      this._dustClear = c;
    } else this._dustClear = 99;
    this._takeoffsSeen = rig.takeoffs || 0; this._landingsSeen = rig.landings || 0; this._stepsSeen = hero.steps || 0;
    dust.update(dt, rig.pos, up, env.gravity, env.air, viewH, th, sunVis);
  }

  // Estimated GPU memory in use (render targets, terrain pool, lookup tables, shadow map).
  get gpuBytes() { return this.post.gpuBytes + this.terrain.gpuBytes + this.atmosphere.gpuBytes + this.nearShadow.gpuBytes; }

  collectStats(jd) {
    const { rig, post, renderer, world } = this;
    const ll = rig.latLon;
    const site = [rig.pos.x, rig.pos.y, rig.pos.z];
    const sun = elevationAzimuth(site, this.ephemeris.sunDir);
    const d = new Date(jdToDate(jd));
    this.hud.setTime(Math.round(this.timeOffsetHours * 100) / 100, `${this.timeOffsetHours >= 0 ? '+' : ''}${this.timeOffsetHours.toFixed(2)} h   ${d.toISOString().slice(0, 19)}Z${this.paused ? '  (paused)' : ''}`);
    let target = '';
    const tg = this.resolveTarget(this.targetId, this._tgtH || (this._tgtH = {}));
    if (tg) target = `${tg.name} ${fmtDistance(Math.max(0, tg.kind === 'place' ? groundDistance(site, tg, world.radius) : gapTo(site, tg)))}${this.transfer ? ' (GO)' : ''}`;
    return {
      world: world.name, mode: rig.mode, shot: this.shotMode ? this.bookmark : '',
      build: BUILD.commit, governor: this.governor.summary, modeLabel: MODES[this.governor.mode].label,
      nativeW: post.width, nativeH: post.height, refresh: this.governor.vsyncMeasured ? Math.round(1000 / this.governor.vsync) : '?',
      calls: this.stats.calls, triangles: this.stats.triangles,
      chunksDrawn: this.terrain.drawList.length, chunksLoaded: this.terrain.loadedCount, chunkPool: CONFIG.CHUNK_POOL, queue: this.terrain.queueLength,
      scale: post.scale, viewW: post.viewW, viewH: post.viewH, gpuMs: this.governor.gpuMs,
      gpuBytes: this.gpuBytes, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
      exposure: post.exposure, sunEl: sun.elevation, sunAz: sun.azimuth,
      lat: ll.lat, lon: ll.lon, alt: rig.altitude, agl: rig.agl, heading: rig.heading, pitch: rig.pitch, fov: rig.fov,
      speed: fmtSpeed(rig.velocity.length()), nearest: `${this.nearestName} ${fmtDistance(this.nearestClear)}`, target, tide: this.tideText || '',
      hover: rig.hover, pull: rig.pull.length(), onFoot: rig.mode === 'hero' && rig.onFoot, airborne: rig.airborne,
      savings: this.governor.featureLevel, building: this.terrain.staleData + this.terrain.readyRefresh.length, built: this.terrain.built,
      work: this.scriptMs || 0, parts: Profile.text(this.profile.avg, 0.3),
    };
  }
}
