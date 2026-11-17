// Owns the renderer and the frame loop. Order of work per frame is documented in
// docs/ARCHITECTURE.md ("Frame order").
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G } from './render/globals.js';
import { SOLAR_SYSTEM, AU_M } from './worlds/solarSystem.js';
import { Ephemeris, dateToJD, jdToDate, elevationAzimuth } from './core/ephemeris.js';
import { PostPipeline } from './post/post.js';
import { DynamicResolution } from './post/dynamicResolution.js';
import { Hud } from './debug/hud.js';
import { Input } from './controls/input.js';
import { CameraRig } from './controls/cameraRig.js';
import { makeTestFar, makeTestGround } from './debug/testScene.js';

export class App {
  constructor({ canvas, context, world, params }) {
    this.canvas = canvas; this.world = world; this.params = params;
    this.shotMode = !!params.shot;
    const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.MAX_PIXEL_RATIO));
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
  }

  async init() {
    const { world, params, renderer } = this;
    this.post = new PostPipeline(renderer, world.scene.exposure);
    this.post.instant = this.shotMode;
    this.dynRes = new DynamicResolution(renderer, this.shotMode ? (params.scale ?? 1) : params.scale, params.fps);
    this.hud = new Hud();
    this.hud.setVisible(params.hud ?? !this.shotMode);
    this.hud.onTime = (h) => { this.timeOffsetHours = h; };
    this.input = new Input(this.canvas);

    this.rig = new CameraRig(world, () => 0);
    this.farScene = new THREE.Scene();
    this.nearScene = new THREE.Scene();
    this.farScene.add(makeTestFar(this.rig.camera));
    this.testGround = makeTestGround();
    this.nearScene.add(this.testGround);

    this.applyBookmark(params.shot || 'ledge');
    if (params.timeOffsetHours != null) this.timeOffsetHours = params.timeOffsetHours;
    if (params.fly) this.rig.mode = 'fly';
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyBookmark(name) {
    const sc = this.world.scene, s = sc.start, b = sc.bookmarks[name] || {};
    const p = this.params;
    this.rig.setLatLon(p.lat ?? b.lat ?? s.lat, p.lon ?? b.lon ?? s.lon, b.eye ?? s.eye, p.heading ?? b.heading ?? s.heading, p.pitch ?? b.pitch ?? s.pitch);
    if (b.east || b.north) this.rig.offsetMetres(b.east || 0, b.north || 0, b.eye ?? s.eye);
    if (p.alt != null) { this.rig.mode = 'fly'; this.rig.pos.setLength(this.world.radius + p.alt); this.rig.agl = 0; }
    this.rig.baseFov = this.rig.fov = p.fov ?? b.fov ?? CONFIG.DEFAULT_FOV;
    this.timeOffsetHours = b.timeOffsetHours ?? 0;
    this.bookmark = name;
  }

  resize() {
    const w = Math.max(2, this.canvas.clientWidth), h = Math.max(2, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    this.post.resize(Math.round(w * pr), Math.round(h * pr));
  }

  start() {
    const loop = (now) => { this.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  handleKeys() {
    const i = this.input;
    if (i.hit('KeyH')) this.hud.toggle();
    if (i.hit('KeyF')) this.rig.toggleMode();
    if (i.hit('KeyP')) this.paused = !this.paused;
    if (i.down('BracketRight')) this.timeOffsetHours = Math.min(12, this.timeOffsetHours + 0.01);
    if (i.down('BracketLeft')) this.timeOffsetHours = Math.max(-12, this.timeOffsetHours - 0.01);
    const names = Object.keys(this.world.scene.bookmarks);
    for (let k = 0; k < names.length && k < 9; k++) if (i.hit('Digit' + (k + 1))) this.applyBookmark(names[k]);
  }

  frame(now) {
    const dtMs = this.lastNow ? now - this.lastNow : 16.7;
    this.lastNow = now;
    const dt = Math.min(dtMs, 100) / 1000;
    const { renderer, rig, world, post } = this;
    renderer.info.reset();
    this.frameCount++;

    // 1. Time and sky geometry
    this.handleKeys();
    if (!this.paused) this.timeOffsetHours += dt / 3600;
    const jd = this.baseJD + this.timeOffsetHours / 24;
    this.ephemeris.update(jd, world.sky.bodies);
    const eph = this.ephemeris;
    G.uSunDir.value.set(eph.sunDir[0], eph.sunDir[1], eph.sunDir[2]);
    const sunC = SOLAR_SYSTEM.sun.color, k = (AU_M / eph.sunDistance) ** 2;
    G.uSunIrradiance.value.set(sunC[0] * k, sunC[1] * k, sunC[2] * k);
    G.uTime.value = this.shotMode ? 0.25 : now / 1000;
    G.uPlanetRadius.value = world.radius;

    // 2. Camera
    rig.update(dt, this.input, this.input.down('KeyZ'));
    G.uCamPlanetPos.value.copy(rig.pos);

    // 6. Scene into the HDR target
    this.dynRes.beginFrame();
    post.setScale(this.dynRes.scale);
    G.uViewport.value.set(post.viewW, post.viewH);
    G.uExposure.value = post.exposure;
    const aspect = post.viewW / post.viewH;

    post.beginScene();
    rig.finalize(aspect, 0.1, 100);
    renderer.render(this.farScene, rig.camera);
    renderer.clearDepth();
    rig.finalize(aspect, Math.max(0.25, Math.min(200, rig.agl * 0.15)), 2.0e6);
    // placeholder ground: tangent disc under the camera
    const up = new THREE.Vector3(rig.localUp[0], rig.localUp[1], rig.localUp[2]);
    this.testGround.position.copy(up).multiplyScalar(-rig.agl);
    this.testGround.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    this.testGround.material.uniforms.uN.value.copy(up);
    renderer.render(this.nearScene, rig.camera);

    // 7. Post
    post.render(dt);
    this.dynRes.endFrame();
    this.dynRes.update(dtMs);

    // 8. HUD
    const info = renderer.info;
    this.stats.calls = info.render.calls; this.stats.triangles = info.render.triangles;
    this.hud.update(dtMs, () => this.collectStats(jd));
    this.input.endFrame();

    if (this.shotMode) {
      const ready = this.frameCount > 6 && post.stableReads >= 3;
      window.__shotReady = ready;
      window.__stats = { calls: this.stats.calls, triangles: this.stats.triangles, exposure: post.exposure, frame: this.frameCount };
    }
  }

  collectStats(jd) {
    const { rig, post, renderer, world } = this;
    const ll = rig.latLon;
    const site = [rig.pos.x, rig.pos.y, rig.pos.z];
    const sun = elevationAzimuth(site, this.ephemeris.sunDir);
    const d = new Date(jdToDate(jd));
    this.hud.setTime(Math.round(this.timeOffsetHours * 100) / 100, `${this.timeOffsetHours >= 0 ? '+' : ''}${this.timeOffsetHours.toFixed(2)} h   ${d.toISOString().slice(0, 19)}Z${this.paused ? '  (paused)' : ''}`);
    return {
      world: world.name, mode: rig.mode, shot: this.shotMode ? this.bookmark : '',
      calls: this.stats.calls, triangles: this.stats.triangles, maxCalls: CONFIG.MAX_DRAW_CALLS, maxTriangles: CONFIG.MAX_TRIANGLES,
      chunksDrawn: 0, chunksLoaded: 0, chunkPool: CONFIG.CHUNK_POOL, queue: 0,
      scale: post.scale, viewW: post.viewW, viewH: post.viewH, gpuMs: this.dynRes.gpuMs,
      gpuBytes: post.gpuBytes, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
      exposure: post.exposure, sunEl: sun.elevation, sunAz: sun.azimuth,
      lat: ll.lat, lon: ll.lon, alt: rig.altitude, agl: rig.agl, heading: rig.heading, pitch: rig.pitch, fov: rig.fov,
    };
  }
}
