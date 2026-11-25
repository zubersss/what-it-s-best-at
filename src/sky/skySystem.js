// The sky and the weather in the frame: one place for their order, and the fixed interfaces
// through which each package's module is called (docs/briefs/clouds-weather-plan.md, step 0,
// "FRAME ORDER"). It was app.js's (its weather block in the frame's first step and its cloud
// block before the main picture); App calls the steps below at the same places, in the same
// order, and keeps the parts it reads by their old names (app.clouds, app.cloudVolume,
// app.weather, app.rain, app.bolt, app.rainbow, app.treeShade, app.weatherScene).
//
// THE FRAME (App.frame)
//   1. weatherStep(c)    before the camera moves: the game clock -> the steering (every cloud's
//                        motion, SKY_UNIFORMS.uCloudSteer, whether or not anything is drawn);
//                        the field's snapshots and 'now' maps (between frames); the weather at
//                        the traveller (wind, shade, wet, rain's veil, lightning's light);
//                        rain, strokes, rainbow; thunder; the wind carrying a hovering figure.
//                        Returns the wind speed the sea's waves take.
//   2. beforeScene(c)    before post.beginScene, each pass into a target of its own: the field's
//                        blend (A), the shade map (C; today the trees' map), the probe (C), the
//                        volume's march (B). Returns how far the clouds reach (the far plane).
//   3. groundUniforms()  after the far scene, before the near one: what the ground reads.
//   4. afterGround(c)    after the near scene (the far low shell is drawn in it), in the picture:
//                        far cell sheets (B), shells above the camera (B), fog sheet and lenses
//                        (B), THE BOLT SLOT (D: sky.boltScene, strokes drawn before the near
//                        slices so that cloud in front covers their tops), the near slices (B),
//                        shells below the camera (B).
//   5. drawWeather(c)    the weather scene (streaks, rainbow; App adds the pollen to it), then
//                        the rain again in a slice of its own from the eye to the terrain's near
//                        plane.
//
// THE PARTS AND THEIR INTERFACES (what each package's module must answer to; the ones not built
// yet are stand-ins below, STUB_PARTS, that draw nothing)
//   field (A, sky/skyField.js)  setWorld(world, opts | null) · update(t) · on · busy · at(place, t, out) ·
//                               cells(t) · strikes(t0, t1) · textures { A, B, C }; the 'now' maps are
//                               SKY_UNIFORMS.tWxA/B/C (sky/skyGlsl.js), read through FIELD_GLSL
//   clouds (B, sky/clouds.js)   the far low shell: setWorld · update(cam, R, volume) -> reach · mesh ·
//                               shadow (the ground's uCloud) · heap · texture · uniforms · loading · shadows
//   cloudVolume (B)             setWorld · setGround · place · ready(cam, layer) · render(post, rig,
//                               time, layer, wind, weather) · lay(near, far, rig) · busy · wanted ·
//                               enabled · steps · reach
//   upper, fog, lenses (B)      update(c) · draw(c, where) · saving(id, off) · live(id) · has(id) · partOut(id, out)
//   treeShade (C: the shade map) render(renderer, rig, sunDir, wanted)
//   probe (C)                   render(c) · pending (true while a read-back that a picture waits for is out)
//   weather (D, weather.js)     setWorld · update(rig, dt, sunDir, day, sunE) · def · wind · windSpeed ·
//                               sunShade · skyShade · wet · veil · flash · flashLight · heard()
//   rain, bolt, rainbow (D)     update(...) · mesh; bolt strokes go in boltScene (the bolt slot)
//   thunder (D, audio.js)       c.audio.thunder(power, dist), queued at distance / 343 m/s
//   the governor's savings      setSaving(id, off), live(id) (SKY_SAVINGS); the benchmark's parts
//                               left out: partOut(id, out), hasPart(id) (SKY_PARTS)
//
// THE DEBUG SWITCHES (?debug=..., skyDebug)
//   sky:<preset>   the field's producer is the stub with that preset (fair, fog, storm, front)
//   storm          a mature storm cell that stands still 8 km north-east of where the view opens
//   flash          a stroke of lightning held at its brightest (on Earth from its maps, as before;
//                  on a world with a made weather, from the field's nearest cell: the stub's storm)
//   noclouds       no cloud of any kind, and nothing a cloud does: no shadow anywhere, no shade on
//                  the figure, no field (every read of it is clear sky), no strokes from it
// Step 0 draws nothing new from the field: on Haven it is made only under these switches, for
// the packages to build against.
import * as THREE from 'three';
import { G } from '../render/globals.js';
import { jdToDate, localFrame } from '../core/ephemeris.js';
import { CloudLayer } from './clouds.js';
import { CloudVolume } from './cloudVolume.js';
import { TreeShade } from '../life/treeShade.js';
import { Weather } from '../weather/weather.js';
import { Rain } from '../weather/rain.js';
import { Bolt } from '../weather/bolt.js';
import { Rainbow } from '../weather/rainbow.js';
import { Steer } from '../weather/sky/steer.js';
import { makeSkyAt } from '../weather/sky/format.js';
import { STUB_PRESETS } from '../weather/sky/stub.js';
import { SKY_UNIFORMS, steerQuat } from './skyGlsl.js';
import { SkyField } from './skyField.js';

// Above this many seconds of game time a second the clouds' noise keeps to it and is set back to
// the game clock when the clock slows again (one re-cut, as at a bookmark): at an hour a second
// every cloud would race by at kilometres a second, a flicker.
export const NOISE_RATE_MAX = 600;
// Strokes are seen and heard this far (m), and none from above this height over the ground.
const STRIKE_REACH = 60000, STRIKE_CEILING = 18000;
const SOUND = 343;      // m/s

// The governor's savings that touch the sky (its ladder is perf/governor.js; it calls setSaving).
// Today's four do what they did; the others are the plan's, waiting for their packages.
export const SKY_SAVINGS = Object.freeze({
  'cloud-steps': 'the volume marched in fewer steps (36 -> 22; B: far slices 8 -> 5)',
  clouds: "the clouds' shadows (today: off; C: the coarse shade, as cloud-shade-coarse)",
  'cloud-volume': 'the volume off near the traveller: the shell everywhere (B: the cells still marched)',
  rain: 'half the streaks',
  'cloud-upper': 'B: the mid and high shells in one octave, no relief',
  'rain-shafts': 'B: no streak read in the shafts, one look into the field',
  'cloud-shade-rate': "C: the shade map's middle window every other frame",
  'cloud-shade-coarse': 'C: the shade from the middle window only (220 m)',
});
// The parts the benchmark's cost test can leave out one at a time (perf/benchmark.js PARTS_OUT).
export const SKY_PARTS = Object.freeze(['clouds-all', 'cloud-shade', 'cloud-upper', 'cells-far', 'rain-shafts', 'fog']);

// ?debug= -> what the sky does with it
export function skyDebug(str = '') {
  const toks = String(str).split(/[^\w:]+/).filter(Boolean);
  const sky = toks.find((t) => t.startsWith('sky:'));
  const preset = sky ? sky.slice(4) : null;
  return {
    preset: preset && STUB_PRESETS.includes(preset) ? preset : null,
    badPreset: preset && !STUB_PRESETS.includes(preset) ? preset : null,
    storm: toks.includes('storm'),
    flash: String(str).includes('flash'),
    noClouds: toks.includes('noclouds'),
  };
}

// The parts B and C have not built yet: their interface, drawing nothing.
function stubPart(name) {
  return { name, stub: true, pending: false, thin: false, update() {}, draw() {}, render() {}, saving() {}, live: () => false, has: () => false, partOut() {} };
}

// a unit direction dist m from p toward a bearing (radians from north), on the sphere
function offsetLatLon(p, bearing, dist) {
  const r = Math.hypot(p.x, p.y, p.z), lat = Math.asin(p.z / r), lon = Math.atan2(p.y, p.x), a = dist / r;
  const la2 = Math.asin(Math.sin(lat) * Math.cos(a) + Math.cos(lat) * Math.sin(a) * Math.cos(bearing));
  const lo2 = lon + Math.atan2(Math.sin(bearing) * Math.sin(a) * Math.cos(lat), Math.cos(a) - Math.sin(lat) * Math.sin(la2));
  return { lat: la2 * 180 / Math.PI, lon: (((lo2 * 180 / Math.PI) % 360) + 360) % 360 };
}

export class SkySystem {
  // renderer; terrain (its shared uniforms carry what the ground is shaded by); debug: the
  // ?debug= string; shotMode: a picture; parts: stand-ins by name (tests)
  constructor({ renderer = null, terrain, debug = '', shotMode = false, parts = {} } = {}) {
    this.renderer = renderer; this.terrain = terrain; this.shared = terrain.shared; this.shotMode = shotMode;
    this.debug = skyDebug(debug);
    this.noClouds = this.debug.noClouds;
    if (this.debug.badPreset) console.warn(`debug=sky:${this.debug.badPreset}: no such preset (${STUB_PRESETS.join(', ')})`);
    this.clouds = parts.clouds ?? new CloudLayer(renderer);
    this.cloudVolume = parts.cloudVolume ?? new CloudVolume(renderer);
    this.treeShade = parts.treeShade ?? new TreeShade(terrain);
    this.weather = parts.weather ?? new Weather();
    this.rain = parts.rain ?? new Rain(G);
    this.bolt = parts.bolt ?? new Bolt(G);
    this.rainbow = parts.rainbow ?? new Rainbow(G);
    this.field = parts.field ?? new SkyField(renderer);
    this.upper = parts.upper ?? stubPart('upper');
    this.fog = parts.fog ?? stubPart('fog');
    this.lenses = parts.lenses ?? stubPart('lenses');
    this.probe = parts.probe ?? stubPart('probe');
    this.shared.uCloud.value = this.clouds.shadow;
    // (in a scene of their own, drawn after the cloud volume is laid over the picture: drawn
    // before it, rain ten metres away was painted over by cloud kilometres behind it)
    this.weatherScene = new THREE.Scene();
    this.weatherScene.add(this.rain.mesh, this.bolt.mesh, this.rainbow.mesh);
    // (the bolt slot: D's strokes go here, drawn before the near cloud slices)
    this.boltScene = new THREE.Scene();
    this.saving = new Set(); this.out = new Set();
    this.world = null; this.steer = null; this.t = 0; this.noiseT = null; this.tPrev = null; this._M = new Float64Array(9);
    this.here = makeSkyAt(); this.hereAt = null;
    this.thunder = []; this.flashOwn = null;
    this.vol = false; this.cloudFar = 0;
  }

  // The home world changed (App's constructor and switchWorld). data: the world's loaded data
  // (rasters[0]: its coarse elevation, for the base the clouds stand over).
  setWorld(world, data) {
    this.world = world;
    this.clouds.setWorld(world); this.cloudVolume.setWorld(world); this.cloudVolume.setGround?.(data?.rasters?.[0]);
    this.weather.setWorld(world);
    // the steering: every world that has clouds (weather/sky/steer.js; its numbers from the world's weather block)
    this.steer = world.clouds ? new Steer(world.weather || {}, world.radius) : null;
    this.noiseT = null; this.tPrev = null; this.thunder.length = 0; this.flashOwn = null;
    if (!this.steer) SKY_UNIFORMS.uCloudSteer.value.set([0, 0, 0, 1]);
    const u = SKY_UNIFORMS.uSkyLow.value, v = world.clouds?.volume;
    u[0] = 1 / (v?.scale ?? 5200); u[1] = world.radius; u[2] = world.clouds?.shadow ?? 0.6;
    // The field: a world whose weather is made by rule, under a debug switch (step 0: nothing on
    // screen reads it yet). Made at the first frame, when the place the view opens at is known.
    const made = world.weather?.recipe === 'made', d = this.debug;
    this.fieldWanted = made && !this.noClouds && !!(d.preset || d.storm || d.flash);
    this.raster = data?.rasters?.[0] || null;
    this.field.setWorld(null, null);
  }

  _makeField(rig) {
    const d = this.debug, w = this.world, r = this.raster;
    // (the elevation as the stub reads it: rows from latitude 90, columns from longitude 0)
    const land = r && r.wrap && (r.lon0 ?? 0) === 0 && (r.lat0 ?? 90) === 90 && (r.lat1 ?? -90) === -90 ? { data: r.data, width: r.width, height: r.height, scale: r.scale ?? 1 } : null;
    const stormAt = d.storm ? offsetLatLon(rig.pos, Math.PI / 4, 8000) : null;
    // (debug=flash alone: the stub's storm, which has a mature cell within 40 km of the opening place at every moment)
    this.field.setWorld(w, { preset: d.preset || (d.flash && !d.storm ? 'storm' : 'fair'), stormAt, land });
    this.fieldWanted = false;
  }

  // ---- 1. before the camera moves -----------------------------------------------------------
  // c: { now (ms, the page's clock), dt (s), jd (the game clock), timeRate, paused, rig, day (of
  // the year), sunE, viewW, viewH, bench, transfer, audio }
  weatherStep(c) {
    const { rig, dt } = c, wx = this.weather, sh = this.shared, e = rig.east;
    this.clockStep(c.jd, dt, c.timeRate, c.paused);
    if (this.fieldWanted) this._makeField(rig);
    if (this.field.on) {
      this.field.update(this.t);
      this.hereAt = [rig.pos.x, rig.pos.y, rig.pos.z];
      this.field.at(this.hereAt, this.t, this.here);
    }
    // (pictures: the weather settles at once and no lightning strikes by chance; debug=flash strikes on purpose)
    wx.quiet = this.shotMode; wx.forceFlash = this.shotMode && this.debug.flash;
    wx.update(rig, dt, G.uSunDir.value, c.day, c.sunE);
    this._fieldStrikes(c);
    // (no clouds: no strokes out of them either, nor their light)
    if (this.noClouds) { wx.flash = null; wx.flashLight.set(0, 0, 0); wx.thunder.length = 0; }
    const speed = wx.def ? Math.max(1.5, wx.windSpeed) : (this.world.surface.sea?.wind ?? 6);
    if (wx.def) sh.uWind.value.set(wx.wind.x, wx.wind.y, wx.wind.z, speed); else sh.uWind.value.set(e[0], e[1], e[2], speed);
    // (no clouds: none of their shade on the figure either)
    const shade = wx.def && !this.noClouds;
    G.uWeather.value.set(shade ? wx.sunShade : 1, shade ? wx.skyShade : 1, wx.def ? wx.wet : 0, wx.def && this.rain.enabled ? wx.veil : 0);
    G.uFlash.value.copy(wx.flashLight);
    this.rain.update(wx, rig, (c.now / 1000) % 14400, 2 * Math.tan(rig.camera.fov * Math.PI / 360) / Math.max(2, c.viewH));
    this.bolt.update(wx, rig.agl, c.sunE);
    this.rainbow.update(wx, rig, c.viewW / c.viewH, G.uSunDir.value);
    for (const th of wx.heard()) if (rig.agl < 20000) c.audio?.thunder(th.power, th.dist);          // (thunder needs air to arrive in)
    for (let i = this.thunder.length - 1; i >= 0; i--) if (this.thunder[i].at <= c.now / 1000) { const th = this.thunder.splice(i, 1)[0]; if (rig.agl < 20000) c.audio?.thunder(th.power, th.dist); }
    // (the wind carries what hangs in the air: only while the stick is let go, so that
    // flight that is aimed still goes where it is aimed)
    if (wx.def && !this.shotMode && !c.bench && rig.mode === 'hero' && !rig.onFoot && !c.transfer && rig.agl < 12000 && (rig.throttle || 0) < 0.05 && dt > 0) rig.pos.addScaledVector(wx.wind, wx.windSpeed * 0.5 * Math.min(dt, 0.1));
    return speed;
  }

  // The game clock -> the steering. t: the weather clock (s since weather.epoch); the noise's own
  // clock keeps to it while the clock runs at NOISE_RATE_MAX or less.
  clockStep(jd, dt, rate = 1, paused = false) {
    if (!this.steer) return;
    const t = this.steer.t(jdToDate(jd));
    this.tPrev = this.t; this.t = t;
    if (paused || Math.abs(rate) <= NOISE_RATE_MAX || this.noiseT == null) this.noiseT = t;
    else this.noiseT += Math.sign(rate) * NOISE_RATE_MAX * Math.min(dt, 0.1);
    this.steer.motion('low', this.noiseT, this._M);
    steerQuat(this._M, SKY_UNIFORMS.uCloudSteer.value);
  }

  // Lightning from the field (a world whose weather is made by rule; Earth's comes from its maps
  // in weather.js): the strokes of the last frame's game time within reach become the flash that
  // the stroke, the clouds' light and the thunder take. A picture with debug=flash holds the
  // nearest of the next ten minutes at its brightest. (D replaces this with its ribbons.)
  _fieldStrikes(c) {
    const wx = this.weather, rig = c.rig;
    if (wx.def || !this.field.on || this.noClouds) return;
    const R = this.world.radius, alt = rig.pos.length() - R;
    let f = this.flashOwn;
    if (f && !f.held) { f.age += c.dt; if (f.age > 0.5) f = null; }
    if (alt > STRIKE_CEILING) f = null;
    else if (this.shotMode) {
      if (this.debug.flash && !f) {
        // (the nearest stroke to the ground within reach; an in-cloud flash only if there is none)
        let best = null, bk = Infinity;
        for (const s of this.field.strikes(this.t, this.t + 600)) {
          const d = this._strikeDist(s, rig), k = d + (s.ground ? 0 : 1e6);
          if (d <= STRIKE_REACH && k < bk) { bk = k; best = s; }
        }
        // (held at the top of its first flicker, as weather.js's picture of a stroke is)
        if (best) { const sd = (best.seed >>> 0) / 4294967296, a = ((Math.PI / 2 - 6 * sd) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) / 38; f = this._flashOf(best, rig, a); f.held = true; }
      }
    } else if (this.tPrev != null && this.t > this.tPrev && this.t - this.tPrev < 60) {
      for (const s of this.field.strikes(this.tPrev, this.t)) {
        const d = this._strikeDist(s, rig);
        if (d > STRIKE_REACH) continue;
        f = this._flashOf(s, rig, 0);
        this.thunder.push({ at: c.now / 1000 + f.dist / SOUND, power: f.power, dist: f.dist });
      }
    }
    this.flashOwn = f;
    wx.flash = f;
    if (f) {
      localFrame([rig.pos.x, rig.pos.y, rig.pos.z], wx._e, wx._n, wx._u);
      // (its light, as weather.js has it: two or three flickers in a third of a second)
      const flick = Math.max(0, Math.sin(f.age * 38 + f.seed * 6) * 0.5 + 0.5) * Math.exp(-f.age * 9) * (f.age < 0.04 ? 1.6 : 1);
      const e = f.power * flick * 1.3 * c.sunE / (1 + (f.dist / 3000) * (f.dist / 3000));
      wx.flashLight.set(0.82 * e, 0.88 * e, 1.0 * e);
    } else wx.flashLight.set(0, 0, 0);
  }
  _strikeAt(s) { const r = this.world.radius + (s.ground ? s.h1 : 0.5 * (s.h0 + s.h1)); return [s.x * r, s.y * r, s.z * r]; }
  _strikeDist(s, rig) { const p = this._strikeAt(s); return Math.hypot(p[0] - rig.pos.x, p[1] - rig.pos.y, p[2] - rig.pos.z); }
  _flashOf(s, rig, age) {
    const p = this._strikeAt(s), v = new THREE.Vector3(p[0] - rig.pos.x, p[1] - rig.pos.y, p[2] - rig.pos.z), d = v.length();
    return { dir: v.divideScalar(d), dist: d, power: s.power, age, ground: s.ground, seed: (s.seed >>> 0) / 4294967296, strike: s };
  }

  // ---- 2. before the main picture -------------------------------------------------------------
  // c: { renderer, post, rig, worldRadius, time (the page's clock, s), treesWanted }
  beforeScene(c) {
    const { rig } = c, none = this.noClouds || this.out.has('clouds-all');
    // (clouds: near the traveller the layer is a volume. Its small picture is marched now,
    // before the main picture is begun, and laid over the ground further down: nothing
    // interrupts the main picture, see sky/cloudVolume.js)
    this.cloudVolume.place(rig.pos);
    this.clouds.shadows = !(this.saving.has('clouds') || this.saving.has('cloud-shade-coarse') || this.out.has('cloud-shade'));
    const cloudFar = this.clouds.update(rig.pos, c.worldRadius, this.cloudVolume);
    // (?debug=noclouds: a clear sky, for pictures of the land from high above; their shadows go with them)
    if (none) { this.clouds.mesh.visible = false; this.clouds.shadow.x = 0; this.clouds.heap.w = 0; }
    const vol = !none && this.cloudVolume.ready(rig.pos, this.clouds);
    this.clouds.uniforms.uNearFade.value = vol ? this.cloudVolume.reach : 0;
    // the passes, each into its own target: the field's blend (A: none yet on the GPU), the shade
    // map (C; the clouds' shadow on trees and on the grass's far clumps), the probe (C), the march (B)
    this.treeShade.render(c.renderer, rig, G.uSunDir.value, c.treesWanted);
    this.probe.render(c);
    if (vol) this.cloudVolume.render(c.post, rig, c.time, this.clouds, this.shared.uWind, this.weather);
    this.upper.update(c); this.fog.update(c); this.lenses.update(c);
    this.vol = vol; this.cloudFar = cloudFar;
    return cloudFar;
  }

  // ---- 3. after the far scene, before the near one -----------------------------------------------
  // (the ground is shaded by the very heaps the layer shows: its numbers, handed over)
  groundUniforms() {
    const sh = this.shared, cu = this.clouds.uniforms;
    sh.tClouds.value = this.clouds.mesh.visible ? this.clouds.texture : this.terrain.textures.white;
    const on = this.clouds.mesh.visible && this.clouds.heap.w > 0.5 && !!cu.tCloudNoise.value;
    sh.uCloudHeap.value.copy(this.clouds.heap); if (!on) sh.uCloudHeap.value.w = 0;
    if (on) { sh.tCloudNoise.value = cu.tCloudNoise.value; sh.uCloudVol.value.set(cu.uVol.value.x, cu.uVol.value.y, cu.uVol.value.z); }
  }

  // ---- 4. after the near scene, in the picture ----------------------------------------------------
  // c: { renderer, rig, near, far }
  afterGround(c) {
    const r = c.renderer;
    this.upper.draw(c, 'above'); this.fog.draw(c); this.lenses.draw(c);
    if (this.boltScene.children.some((o) => o.visible)) r.render(this.boltScene, c.rig.camera);
    if (this.vol) this.cloudVolume.lay(c.near, c.far, c.rig);
    this.upper.draw(c, 'below');
  }

  // ---- 5. the weather scene, and the rain in its own slice ----------------------------------------
  // c: { renderer, rig, aspect, near, far }
  drawWeather(c) {
    const { renderer, rig } = c;
    if (this.weatherScene.children.some((o) => o.visible)) renderer.render(this.weatherScene, rig.camera);
    // The rain nearer than the terrain's near plane (a few metres up that plane is past the
    // eye's own rain, and from 60 m in a hurricane not a streak was seen): drawn again in
    // a slice of its own, from the eye to that plane. Nothing else stands in that slice but
    // the character (and the pollen, App), drawn after it.
    if (this.rain.mesh.visible && c.near > 1.0) {
      rig.finalize(c.aspect, 0.2, c.near * 1.02);
      this.rain.material.depthTest = false; renderer.render(this.rain.mesh, rig.camera); this.rain.material.depthTest = true;
      rig.finalize(c.aspect, c.near, c.far);
    }
  }

  // ---- what screenshots wait for ---------------------------------------------------------------
  get busy() { return !!(this.cloudVolume.busy || this.clouds.loading || this.field.busy || this.probe.pending); }
  get waiting() { return [this.clouds.loading && 'clouds', this.cloudVolume.busy && 'cloud-noise', this.field.busy && 'sky-field', this.probe.pending && 'shade-probe'].filter(Boolean).join(' '); }

  // ---- the governor's savings -------------------------------------------------------------------
  setSaving(id, off) {
    if (!(id in SKY_SAVINGS)) throw new Error(`sky: no saving ${id}`);
    if (off) this.saving.add(id); else this.saving.delete(id);
    switch (id) {
      case 'cloud-steps': this.cloudVolume.steps = off ? 22 : 36; break;
      case 'cloud-volume': this.cloudVolume.enabled = !off; break;
      case 'rain': this.rain.share = off ? 0.5 : 1; break;
      case 'clouds': case 'cloud-shade-coarse': this.clouds.shadows = !(this.saving.has('clouds') || this.saving.has('cloud-shade-coarse') || this.out.has('cloud-shade')); this.probe.saving(id, off); break;
      case 'cloud-upper': this.upper.saving(id, off); break;
      case 'rain-shafts': this.cloudVolume.saving?.(id, off); break;
      case 'cloud-shade-rate': this.probe.saving(id, off); break;
    }
  }
  live(id) {
    switch (id) {
      case 'cloud-steps': case 'cloud-volume': return !!this.cloudVolume.wanted;
      case 'clouds': case 'cloud-shade-coarse': return !!this.clouds.mesh.visible;
      case 'rain': return !!this.rain.mesh.visible;
      case 'cloud-upper': return this.upper.live(id);
      case 'rain-shafts': return !!this.cloudVolume.live?.(id);
      case 'cloud-shade-rate': return this.probe.live(id);
    }
    return false;
  }

  // ---- the benchmark's parts left out ---------------------------------------------------------
  hasPart(id) {
    switch (id) {
      case 'clouds-all': case 'cloud-shade': return !!this.world?.clouds;
      case 'cloud-upper': return this.upper.has(id);
      case 'cells-far': case 'rain-shafts': return !!this.cloudVolume.has?.(id);
      case 'fog': return this.fog.has(id);
    }
    return false;
  }
  partOut(id, out) {
    if (!SKY_PARTS.includes(id)) throw new Error(`sky: no part ${id}`);
    if (out) this.out.add(id); else this.out.delete(id);
    if (id === 'cloud-upper') this.upper.partOut(id, out);
    else if (id === 'fog') this.fog.partOut(id, out);
    else if (id === 'cells-far' || id === 'rain-shafts') this.cloudVolume.partOut?.(id, out);
  }

  // For window.__stats in pictures: the steering at the traveller, and the field's weather there.
  stats(rig) {
    if (!this.steer) return '';
    const r = rig.pos.length(), lat = Math.asin(rig.pos.z / r) * 180 / Math.PI, lon = Math.atan2(rig.pos.y, rig.pos.x) * 180 / Math.PI;
    const w = this.steer.windAt('low', this.noiseT ?? this.t, lat, lon);
    let s = `low wind ${w.speed.toFixed(1)} m/s toward ${w.toward.toFixed(0)} deg`;
    if (this.field.on) { const h = this.here; s += `; field (${this.field.opts?.preset}${this.field.opts?.stormAt ? ' + storm' : ''}${this.field.busy ? ', waiting' : ''}): base ${Math.round(h.base)} m, top ${Math.round(h.top)} m, rain ${h.rain.toFixed(1)} mm/h, storm ${h.storm.toFixed(2)}, overcast ${h.overcast.toFixed(2)}, wind ${h.wind.toFixed(1)} m/s, cell ${h.cell}`; }
    return s;
  }
}
