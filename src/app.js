// Owns the renderer and the frame loop. Order of work per frame is documented in
// docs/ARCHITECTURE.md ("Frame order").
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G } from './render/globals.js';
import { WORLDS } from './worlds/index.js';
import { SOLAR_SYSTEM, AU_M } from './worlds/solarSystem.js';
import { Ephemeris, dateToJD, jdToDate, elevationAzimuth, latLonToDir } from './core/ephemeris.js';
import { PostPipeline } from './post/post.js';
import { Governor, MODES, FRAME } from './perf/governor.js';
import { Benchmark } from './perf/benchmark.js';
import { StartScreen, ResultsScreen, BenchBanner, Toast } from './ui/screens.js';
import { immersive, keepAwake } from './ui/device.js';
import { BUILD } from './core/build.js';
import { Hud, HUD } from './debug/hud.js';
import { Input } from './controls/input.js';
import { CameraRig } from './controls/cameraRig.js';
import { TouchControls } from './controls/touch.js';
import { Atmosphere } from './atmosphere/atmosphere.js';
import { makeSkyDome } from './sky/skyDome.js';
import { SunDisc } from './sky/sun.js';
import { makeStars } from './sky/stars.js';
import { SkyBodies } from './sky/bodies.js';
import { NearShadow } from './shadows/nearShadow.js';
import { Rocks } from './rocks/rocks.js';
import { Lander } from './ship/lander.js';
import { Hero } from './hero/hero.js';
import { createHeightSource, loadRasters } from './terrain/height/heightSource.js';
import { Terrain } from './terrain/terrain.js';

const C_LIGHT = 299792458;
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

    this.ephemeris = new Ephemeris(SOLAR_SYSTEM, world.body);
    this.baseJD = dateToJD(Date.parse(world.scene.dateUTC));
    this.timeOffsetHours = 0;
    this.paused = this.shotMode;
    this.frameCount = 0;
    this.lastNow = 0;
    this.stats = {};
    this.worldData = new Map();        // world id -> { world, rasters, hs }
    this.targetIndex = -1;
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
  async loadWorldData(world) {
    let d = this.worldData.get(world.id);
    if (!d) {
      const rasters = await loadRasters(world, import.meta.env.BASE_URL);
      d = { world, rasters, hs: createHeightSource(world, rasters) };
      this.worldData.set(world.id, d);
    }
    return d;
  }

  heightFn(world, hs) {
    const walkWL = 2 * (Math.PI / 2) * world.radius / (1 << world.terrain.maxLevel) / CONFIG.NORMAL_RES;
    return (d) => hs.height(d[0], d[1], d[2], walkWL);
  }

  async init() {
    const { world, params, renderer } = this;
    this.post = new PostPipeline(renderer, world.scene.exposure);
    this.post.instant = this.shotMode;
    let savedMode = null;
    try { savedMode = localStorage.getItem('sse.mode'); } catch { /* storage blocked: use the default */ }
    this.governor = new Governor(this, params.mode || savedMode || 'smooth', this.shotMode ? (params.scale ?? 1) : params.scale);
    this.hud = new Hud();
    this.hud.setLevel(params.hud != null ? (params.hud ? HUD.FULL : HUD.OFF) : this.shotMode ? HUD.OFF : HUD.COMPACT);
    this.hud.onTime = (h) => { this.timeOffsetHours = h; };
    if (!this.shotMode) {
      // The start screen goes up at once; its buttons unlock when the first terrain is drawn.
      this.startScreen = new StartScreen(BUILD, this.governor.mode, { play: () => this.play(), benchmark: (kind) => this.startBenchmark(kind), mode: () => this.toggleMode() });
      this.results = new ResultsScreen(() => { this.startScreen.show(); });
      this.banner = new BenchBanner(() => this.benchmark.stop());
      this.toast = new Toast();
      this.benchmark = new Benchmark(this);
      this.menuOpen = true;
    }
    this.timeRange = (world.dayHours || 24) / 2;
    this.hud.setTimeRange(this.timeRange);
    this.input = new Input(this.canvas);
    this.touch = new TouchControls(this.canvas, this.input, { view: () => this.cycleBookmark() });
    if (params.touch) this.touch.enable();
    this.touch.setVisible(!this.menuOpen);
    document.addEventListener('visibilitychange', () => {
      // Coming back from the background: the long gap is not a slow frame.
      if (document.visibilityState === 'visible') { this.lastNow = 0; this.resumedAt = performance.now(); } else this.hiddenCount++;
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
    this.bodies = new SkyBodies(world, SOLAR_SYSTEM);
    this.farScene.add(this.bodies.group);
    if (world.sky.stars) {
      const res = await fetch(import.meta.env.BASE_URL + world.sky.stars.url);
      if (!res.ok) throw new Error('Failed to load star catalogue');
      this.stars = makeStars(new Float32Array(await res.arrayBuffer()));
      this.farScene.add(this.stars.points);
    }
    this.nearShadow = new NearShadow(renderer);
    this.terrain = new Terrain(world, data.rasters, data.hs, renderer);
    this.rocks = new Rocks(world, data.hs);
    this.nearScene.add(this.terrain.group, this.rocks.mesh);
    this.nearShadow.addCaster(this.rocks.mesh, this.rocks.depthMaterial);
    this.placeLander(world, data.hs);
    this.hero = new Hero();
    this.heroScene.add(this.hero.group);
    for (const m of this.hero.casters) this.nearShadow.addCaster(m, this.hero.depthMaterial, () => this.hero.group.visible);
    await this.terrain.workers.ready;

    this.applyBookmark(params.shot || 'ledge');
    if (params.timeOffsetHours != null) this.timeOffsetHours = params.timeOffsetHours;
    if (params.fly) this.rig.setMode('fly');
    // Interactive sessions start behind the flying character; screenshots stay first person
    // unless asked (?hero=1).
    if (params.hero ?? (!this.shotMode && !params.fly)) this.setHero(true);
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
    for (const w of Object.values(WORLDS)) if (w.id !== world.id) this.loadWorldData(w).catch(() => {});
  }

  placeLander(world, hs) {
    if (this.lander) { this.nearScene.remove(this.lander.mesh); this.nearShadow.removeCaster(this.lander.mesh); this.lander.mesh.geometry.dispose(); }
    this.lander = new Lander(world, hs, latLonToDir(world.scene.start.lat, world.scene.start.lon));
    this.nearScene.add(this.lander.mesh);
    this.nearShadow.addCaster(this.lander.mesh, this.lander.depthMaterial);
  }

  setHero(on) {
    this.rig.setMode(on ? 'hero' : 'walk');
    this.hero.setVisible(on);
  }

  applyBookmark(name) {
    const sc = this.world.scene, s = sc.start, b = sc.bookmarks[name] || {};
    const p = this.params;
    this.rig.setLatLon(p.lat ?? b.lat ?? s.lat, p.lon ?? b.lon ?? s.lon, b.eye ?? s.eye, p.heading ?? b.heading ?? s.heading, p.pitch ?? b.pitch ?? s.pitch);
    if (b.east || b.north) this.rig.offsetMetres(b.east || 0, b.north || 0, b.eye ?? s.eye);
    if (p.alt != null) { if (this.rig.mode === 'walk') this.rig.setMode('fly'); this.rig.pos.setLength(this.world.radius + p.alt); this.rig.agl = 0; }
    this.rig.baseFov = this.rig.fov = p.fov ?? b.fov ?? CONFIG.DEFAULT_FOV;
    // A bookmark is a place and a moment: it restores its world's scene time.
    this.baseJD = dateToJD(Date.parse(sc.dateUTC));
    this.timeOffsetHours = b.timeOffsetHours ?? 0;
    this.bookmark = name;
    if (this.hero) this.hero.started = false;
    this.jumpedAt = performance.now();
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

  play() {
    this.startScreen.hide();
    this.menuOpen = false;
    this.touch.setVisible(true);
    if (this.touch.enabled) immersive();
    keepAwake();
  }

  toggleMode() {
    const next = this.governor.mode === 'smooth' ? 'sharp' : 'smooth';
    this.governor.setMode(next);
    try { localStorage.setItem('sse.mode', next); } catch { /* storage blocked: the choice lasts for this visit */ }
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
    this.benchmark.start(kind);
  }

  onBenchmarkDone(text) {
    this.banner.show(false);
    this.menuOpen = true;
    this.results.show(text);
    window.__benchResult = text;
  }

  // The governor's terrain steps: the smallest factor asked for wins.
  terrainBudget(factor, id) {
    this.terrainFactors[id] = factor;
    let m = 1;
    for (const k in this.terrainFactors) m = Math.min(m, this.terrainFactors[k]);
    this.terrain.maxChunks = Math.round(CONFIG.MAX_RENDER_CHUNKS * m);
  }

  // Why the frame that just ended may have been slow (for the benchmark's hitch list).
  frameCause(now, uploads) {
    if (this.switching || now < this.switchedAt + 2500) return 'arriving at another world';
    if (now < this.jumpedAt + 2500) return 'jump to a bookmark';
    if (now < this.resumedAt + 1500) return 'page came back from the background';
    if (now < this.resizedAt + 1500) return 'screen size changed';
    if (this.governor.sinceStep < 0.4) return 'quality step';
    if (uploads) return `new terrain (${uploads} patch${uploads > 1 ? 'es' : ''})`;
    if (now < this.loadedAt + 4000) return 'start-up';
    return 'unknown';
  }

  handleKeys() {
    const i = this.input;
    if (i.hit('KeyH')) this.hud.toggle();
    if (i.hit('KeyM')) this.toggleMode();
    if (i.hit('KeyF')) { this.hero.setVisible(false); this.rig.toggleMode(); }
    if (i.hit('KeyG')) this.setHero(this.rig.mode !== 'hero');
    if (i.hit('KeyT')) this.nextTarget();
    if (i.hit('KeyP')) this.paused = !this.paused;
    const tr = this.timeRange;
    if (i.down('BracketRight')) this.timeOffsetHours = Math.min(tr, this.timeOffsetHours + tr / 1200);
    if (i.down('BracketLeft')) this.timeOffsetHours = Math.max(-tr, this.timeOffsetHours - tr / 1200);
    const names = Object.keys(this.world.scene.bookmarks);
    for (let k = 0; k < names.length && k < 9; k++) if (i.hit('Digit' + (k + 1))) this.applyBookmark(names[k]);
  }

  // Turns the view toward the next body in the sky (Sun included) — the way to aim a trip.
  nextTarget() {
    const list = [...this.bodies.bodies.filter((b) => b.id !== this.world.body).map((b) => b.id), 'sun'];
    this.targetIndex = (this.targetIndex + 1) % list.length;
    this.aimAt(list[this.targetIndex]);
  }

  aimAt(id) {
    if (id !== 'sun' && (!this.bodies.byId.has(id) || id === this.world.body)) return;
    this.targetId = id;
    const dir = id === 'sun' ? G.uSunDir.value.clone() : this.bodies.byId.get(id).pos.clone().sub(this.rig.pos);
    this.rig.lookAlong(dir);
  }

  // Distances to everything else in the sky: speed limit for hero flight, collision with
  // bodies that have no terrain, and the hand-over to another world when it becomes nearer.
  space(eph) {
    const rig = this.rig;
    let nearest = Infinity, name = '';
    const sunClear = eph.sunDistance - SOLAR_SYSTEM.sun.radius;      // close enough from anywhere near a planet
    for (const b of this.bodies.bodies) {
      if (b.id === this.world.body) continue;
      const R = b.def.radius, d = rig.pos.distanceTo(new THREE.Vector3(...eph.bodies.get(b.id).pos));
      let clear = d - R;
      if (clear < R * 0.02) {                                       // do not fly into a body without terrain
        const pos = new THREE.Vector3(...eph.bodies.get(b.id).pos);
        rig.pos.sub(pos).setLength(R * 1.02).add(pos); rig.agl = 0;
        clear = R * 0.02;
      }
      if (clear < nearest) { nearest = clear; name = b.id; }
    }
    rig.spaceDistance = Math.min(nearest, sunClear);
    this.nearestName = rig.agl <= nearest ? this.world.id : name;
    this.nearestClear = Math.min(rig.agl, nearest);
    if (this.shotMode || this.switching || rig.mode === 'walk') return;
    for (const w of Object.values(WORLDS)) {
      if (w.body === this.world.body) continue;
      const d = rig.pos.distanceTo(new THREE.Vector3(...eph.bodies.get(w.body).pos)) - w.radius;
      if (d < rig.agl * 0.8) { this.switchWorld(w); break; }
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
      const p = toI(rig.pos), f = toI(rig.forward), vel = toI(rig.velocity);
      this.world = w; this.hs = data.hs;
      eph.homeId = w.body;
      eph.update(jd, this.bodies.ids);
      const M1 = eph.icrfToFixed, h1 = eph.positionICRF(w.body, jd, [0, 0, 0]);
      const toF = (a) => new THREE.Vector3(M1[0] * a[0] + M1[1] * a[1] + M1[2] * a[2], M1[3] * a[0] + M1[4] * a[1] + M1[5] * a[2], M1[6] * a[0] + M1[7] * a[1] + M1[8] * a[2]);
      rig.setWorld(w, this.heightFn(w, data.hs));
      rig.pos.copy(toF([p[0] + h0[0] - h1[0], p[1] + h0[1] - h1[1], p[2] + h0[2] - h1[2]]));
      rig.velocity.copy(toF(vel));
      rig.lookAlong(toF(f));
      // everything that depends on the world
      G.uPlanetRadius.value = w.radius;
      this.atmosphere.setWorld(w);
      this.terrain.setWorld(w, data.rasters, data.hs);
      this.rocks.setWorld(w, data.hs);
      this.placeLander(w, data.hs);
      this.bodies.setWorld(w);
      this.post.setExposureSettings(w.scene.exposure);
      this.timeRange = (w.dayHours || 24) / 2;
      this.hud.setTimeRange(this.timeRange);
      this.bookmark = '';
    } finally { this.switching = false; this.switchedAt = performance.now(); }
  }

  frame(now) {
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
    const input = this.menuOpen ? NO_INPUT : this.input;

    // 1. Time and sky geometry
    if (!this.menuOpen && !bench) this.handleKeys();
    if (!this.paused) this.timeOffsetHours += dt / 3600;
    const jd = this.baseJD + this.timeOffsetHours / 24;
    const eph = this.ephemeris;
    eph.update(jd, this.bodies.ids);
    G.uTime.value = this.shotMode ? 0.25 : now / 1000;

    // 2. Camera
    rig.update(dt, input, input.down('KeyZ'));
    this.space(eph);
    const world = this.world;                       // may have just changed
    G.uSunDir.value.set(eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]);
    const sunC = SOLAR_SYSTEM.sun.color, k = (AU_M / eph.sunDistance) ** 2;
    G.uSunIrradiance.value.set(sunC[0] * k, sunC[1] * k, sunC[2] * k);
    G.uPlanetRadius.value = world.radius;
    G.uCamPlanetPos.value.copy(rig.pos);

    // 3. Terrain LOD, rocks, lander, hero
    const aspect0 = post.width / post.height;
    const sunHalf = Math.asin(SOLAR_SYSTEM.sun.radius / eph.sunDistance);
    this.terrain.update(rig, aspect0, G.uSunDir.value, sunHalf);
    this.rocks.update(rig, eph.sunDir, sunHalf, this.terrain.workers);
    this.lander.update(rig, eph.sunDir, sunHalf, this.terrain.workers);
    this.updateHero(dt, sunHalf);

    // 4. Atmosphere LUTs
    governor.beginFrame();
    post.setScale(governor.scale);
    G.uViewport.value.set(post.viewW, post.viewH);
    G.uExposure.value = post.exposure;
    const aspect = post.viewW / post.viewH;
    const th = Math.tan(rig.fov * Math.PI / 360);
    G.uCamRight.value.copy(rig.right); G.uCamUp.value.copy(rig.up); G.uCamFwd.value.copy(rig.forward);
    G.uTanHalfFov.value.set(th * aspect, th);
    this.atmosphere.update(rig.pos, G.uSunDir.value, this.terrain.farDistance, post.exposure);
    this.skyDome.visible = G.uSkyFade.value > 0;
    this.sun.update(G.uSunDir.value, eph.sunDistance, rig, post.viewH);
    this.bodies.update(eph, rig, post.viewH);
    this.stars?.setFrame(eph.icrfToFixed, rig, post.viewH);

    // 5. Near shadow map (ship, rocks, hero)
    this.nearShadow.render(rig.pos, G.uSunDir.value, rig.localUp);

    // 6. Scene into the HDR target: far pass, clear depth, near pass, then the hero.
    post.beginScene();
    rig.finalize(aspect, 0.1, 100);
    renderer.render(this.farScene, rig.camera);
    renderer.clearDepth();
    const near = Math.max(0.25, Math.min(2e6, rig.agl * 0.15));
    rig.finalize(aspect, near, this.terrain.farDistance * 1.05);
    renderer.render(this.nearScene, rig.camera);
    if (this.hero.group.visible) {
      // Near the ground the hero shares the terrain's depth buffer (rocks can hide it);
      // higher up the terrain's near plane has moved past it, so it gets its own slice.
      if (near > 1.0) { renderer.clearDepth(); rig.finalize(aspect, 0.2, 400); }
      renderer.render(this.heroScene, rig.camera);
    }
    post.endScene();

    // 7. Post
    post.render(dt);
    governor.endFrame();
    const settling = cause !== 'unknown' && cause !== 'quality step' && !cause.startsWith('new terrain');
    governor.update(dtMs, settling ? FRAME.IGNORE : uploads ? FRAME.SOFT : FRAME.NORMAL);
    this.lastUploads = this.terrain.uploads; this.terrain.uploads = 0;

    // 8. HUD
    const info = renderer.info;
    this.stats.calls = info.render.calls; this.stats.triangles = info.render.triangles;
    this.hud.update(dtMs, () => this.collectStats(jd));
    this.input.endFrame();
    if (!this.loaded && this.frameCount > 3 && this.terrain.drawList.length > 0) {
      this.loaded = true; this.loadedAt = now;
      this.startScreen?.setReady(true);
      if (this.params.bench && this.benchmark) this.startBenchmark(this.params.bench);
    }

    if (this.shotMode) {
      const ready = this.frameCount > 6 && post.stableReads >= 3 && this.terrain.idle && !this.rocks.needVis && !this.rocks.pendingVis && !this.lander.pending;
      window.__shotReady = ready;
      window.__stats = { calls: this.stats.calls, triangles: this.stats.triangles, chunks: this.terrain.drawList.length, loaded: this.terrain.loadedCount, visited: this.terrain.visited, wanted: this.terrain.wanted.length, lodScale: +this.terrain.lodScale.toFixed(3), avgBuildMs: +(this.terrain.buildMs / Math.max(1, this.terrain.built)).toFixed(1), exposure: +post.exposure.toPrecision(4), frame: this.frameCount, wait: `${post.stableReads >= 3 ? '' : 'exposure '}${this.terrain.idle ? '' : 'terrain '}${this.rocks.needVis || this.rocks.pendingVis ? 'rocks ' : ''}${this.lander.pending ? 'lander' : ''}` };
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
      // Deterministic pose for screenshots: flying forward (or hovering with ?heropose=hover).
      const flying = this.params.heropose !== 'hover';
      const pose = { velocity: rig.forward.clone().multiplyScalar(flying ? 30 : 0), throttle: flying ? 1 : 0, yawRate: 0 };
      if (!this.heroSettled) { hero.settle(5, rig, env, pose); this.heroSettled = true; } else hero.update(0, rig, env, pose);
    } else hero.update(dt, rig, env);
    hero.group.updateMatrixWorld(true);
    // Is the hero in a terrain shadow? Ask a worker now and then (cheap single ray).
    if (rig.agl < 20000 && !this.heroVisPending && this.frameCount % 20 === 0) {
      const p = hero.group.position, pts = new Float64Array([rig.pos.x + p.x, rig.pos.y + p.y, rig.pos.z + p.z]);
      const eph = this.ephemeris;
      const job = this.terrain.workers.run({ type: 'points', points: pts, sun: [eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]], sunHalf, minWL: 2 });
      if (job) { this.heroVisPending = true; job.then((res) => { this.heroVisPending = false; hero.uniforms.uSunVis.value = res.vis[0]; }).catch(() => { this.heroVisPending = false; }); }
    } else if (rig.agl >= 20000) hero.uniforms.uSunVis.value = 1;
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
    if (this.targetId) {
      const dist = this.targetId === 'sun' ? this.ephemeris.sunDistance : this.bodies.byId.get(this.targetId).dist;
      target = `${this.targetId} ${fmtDistance(dist)}`;
    }
    return {
      world: world.name, mode: rig.mode, shot: this.shotMode ? this.bookmark : '',
      build: BUILD.commit, governor: this.governor.summary, modeLabel: MODES[this.governor.mode].label,
      nativeW: post.width, nativeH: post.height, refresh: this.governor.vsyncMeasured ? Math.round(1000 / this.governor.vsync) : '?',
      calls: this.stats.calls, triangles: this.stats.triangles, maxCalls: CONFIG.MAX_DRAW_CALLS, maxTriangles: CONFIG.MAX_TRIANGLES,
      chunksDrawn: this.terrain.drawList.length, chunksLoaded: this.terrain.loadedCount, chunkPool: CONFIG.CHUNK_POOL, queue: this.terrain.queueLength,
      scale: post.scale, viewW: post.viewW, viewH: post.viewH, gpuMs: this.governor.gpuMs,
      gpuBytes: this.gpuBytes, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
      exposure: post.exposure, sunEl: sun.elevation, sunAz: sun.azimuth,
      lat: ll.lat, lon: ll.lon, alt: rig.altitude, agl: rig.agl, heading: rig.heading, pitch: rig.pitch, fov: rig.fov,
      speed: fmtSpeed(rig.velocity.length()), nearest: `${this.nearestName} ${fmtDistance(this.nearestClear)}`, target,
    };
  }
}
