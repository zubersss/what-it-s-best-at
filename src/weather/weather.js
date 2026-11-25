// The weather where the traveller is. A world may list `weather`: maps of one real day
// (where it rained and how hard, how high the cloud tops stood, where cloud was) and that
// day's storms. From them, at the traveller's place and every frame:
//   wind      the planet's steady belts (trades, westerlies) and, round each storm, the
//             wind that circles it: calm in the eye, hardest at the eye wall
//   rain      as the map says, falling only under the cloud; snow where it is cold enough
//   wet       how wet the ground has become (it dries slowly)
//   shade     how much of the Sun and of the sky's light the cloud overhead lets through
//   lightning under deep, hard-raining cloud: where the next stroke falls and how bright
// Others take what they need: the sea and the trees take the wind, the ground the wetness,
// the lighting the shade and the flashes, the sound the rain and the thunder.
// World file: weather: { day, rain: url, tops: url, cloud: url (small), storms: url } (the recipe
// 'maps', the one when none is named). A world whose weather is made by rule (recipe 'made',
// Haven: src/weather/sky/) has none of this here yet: its steering winds and its field are
// sky/skySystem.js's, and package D makes this the reader of the field there.
//
// THE INTERFACE sky/skySystem.js calls (docs/briefs/clouds-weather-plan.md, step 0; package D
// keeps it when it rewrites the inside):
//   setWorld(world)
//   update(rig, dt, sunDir, day, sunE, sky)  every frame. sky: the sky system's frame (SkySystem
//            .frame): t (the weather clock, s since weather.epoch), tPrev, noiseT, steer, field,
//            here (field.at() at the traveller, or null), cells (the live cells in reach, nearest
//            first, each with dist), strikes (the field's strokes since the last frame within
//            reach, each with pos [x, y, z] planet axes and dist), world, noClouds, shotMode.
//   own      true when this module answers for the weather at the traveller on this world: the
//            sky system then takes wind and windSpeed for uWind (trees, grass, sea), sunShade and
//            skyShade for uWeather.x/y (where the shade probe has nothing), wet (uWeather.z), veil
//            (uWeather.w), the wind sound and the drift of a hovering figure. False: a steady
//            breeze from the west and none of the rest. (Step 0: the 'maps' recipe only; D sets it
//            on a made world from sky.here.)
//   takesStrikes  true when this module turns sky.strikes into its strokes, their light and their
//            thunder (D); false: the sky system's stand-in does (one stroke a frame, SkySystem._fieldStrikes)
//   bolts    null, or up to two { pos: [x, y, z] planet axes (m), power }: the flashes that light
//            the cloud from inside (the volume's uBolt, CloudVolume.setBolts). null: the sky system
//            makes one of `flash` when it is in the cloud, as before
//   wind, windSpeed, sunShade, skyShade, wet, veil, rain, snow, temp, flash, flashLight, heard()
import * as THREE from 'three';
import { localFrame } from '../core/ephemeris.js';

const RAD = Math.PI / 180;

export class Weather {
  constructor() {
    this.def = null; this.maps = {}; this.storms = []; this.epoch = 0;
    this.wind = new THREE.Vector3(1, 0, 0); this.windSpeed = 5;
    this.rain = 0; this.snow = 0; this.wet = 0; this.sunShade = 1; this.skyShade = 1; this.top = 0; this.cover = 0; this.temp = 15;
    this.squall = 0; this.storminess = 0; this.veil = 0;
    this.flash = null;                       // { dir: Vector3 (from the camera, unit), dist (m), power, age (s), ground (bool) }
    this.flashLight = new THREE.Vector3(); this.nextFlash = 3; this.thunder = [];         // thunder on its way: { at (s), power, dist }
    this.storm = null;                       // the nearest named storm: { name, dist (m) }
    this.time = 0;
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0];
    this.own = false; this.takesStrikes = false; this.bolts = null;
  }

  setWorld(world) {
    this.epoch++;
    this.def = world.weather && (world.weather.recipe ?? 'maps') === 'maps' ? world.weather : null;
    this.own = !!this.def;
    this.maps = {}; this.storms = []; this.radius = world.radius; this.world = world;
    this.rain = this.snow = this.wet = 0; this.squall = this.storminess = this.veil = 0; this.sunShade = this.skyShade = 1; this.flash = null; this.thunder.length = 0; this.flashLight.set(0, 0, 0);
    this.shadow = world.clouds?.shadow ?? 0.6;                 // (how dark this world's cloud shadow is: the ground's own number)
    if (!this.def || typeof document === 'undefined') return;
    const epoch = this.epoch, base = import.meta.env.BASE_URL;
    // (the maps as plain numbers: they are looked up at one place a frame, not drawn)
    const grey = (key, url) => {
      const img = new Image();
      img.onload = () => {
        if (epoch !== this.epoch) return;
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height).data, out = new Uint8Array(img.width * img.height);
        for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
        this.maps[key] = { data: out, w: img.width, h: img.height };
      };
      img.src = base + url;
    };
    if (this.def.rain) grey('rain', this.def.rain);
    if (this.def.tops) grey('tops', this.def.tops);
    if (this.def.cloud) grey('cloud', this.def.cloud);
    if (this.def.storms) fetch(base + this.def.storms).then((r) => r.json()).then((j) => { if (epoch === this.epoch) this.storms = j.storms || []; }).catch(() => {});
  }

  // A map's value at a latitude and longitude east (degrees): 0..255, smooth between its pixels.
  sample(key, lat, lon) {
    const m = this.maps[key]; if (!m) return 0;
    const x = (((lon + 180) / 360) % 1 + 1) % 1 * m.w - 0.5, y = Math.min(m.h - 1.001, Math.max(0, (90 - lat) / 180 * m.h - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, xa = (x0 + m.w) % m.w, xb = (x0 + 1) % m.w, d = m.data;
    return (d[y0 * m.w + xa] * (1 - fx) + d[y0 * m.w + xb] * fx) * (1 - fy) + (d[(y0 + 1) * m.w + xa] * (1 - fx) + d[(y0 + 1) * m.w + xb] * fx) * fy;
  }
  rainAt(lat, lon) { return Math.pow(2, this.sample('rain', lat, lon) / 60) - 1; }          // mm an hour
  topAt(lat, lon) { return this.sample('tops', lat, lon) / 16 * 1000; }                    // m

  // The wind at a place: [east, north] in m/s.
  windAt(lat, lon, out) {
    const a = Math.abs(lat), g = (c, w) => Math.exp(-((a - c) / w) * ((a - c) / w));
    let u = -7 * g(15, 10) + 10 * g(45, 12) - 4 * g(75, 10), v = -Math.sign(lat) * 2 * g(15, 10);
    for (const s of this.storms) {
      const dy = (lat - s.lat) * 111200, dx = (((lon - s.lon + 540) % 360) - 180) * 111200 * Math.cos(lat * RAD), r = Math.hypot(dx, dy);
      if (r > 700000) continue;
      const rm = s.rmw ?? 38000, vmax = s.wind ?? 20;
      // (calm in the eye, hardest at the eye wall, falling away slowly outside it)
      const sp = (r < rm ? vmax * Math.pow(r / rm, 1.6) : vmax * Math.pow(rm / r, 0.62)) * (1 - Math.min(1, Math.max(0, (r - 450000) / 250000)));
      // round the centre (against the clock north of the equator), drawn a little inward
      const turn = s.lat >= 0 ? 1 : -1, k = r > 1 ? 1 / r : 0, tx = -dy * k * turn, ty = dx * k * turn, inx = -dx * k, iny = -dy * k, mix = r < rm ? 0 : 0.34;
      u += sp * (tx * (1 - mix * 0.3) + inx * mix); v += sp * (ty * (1 - mix * 0.3) + iny * mix);
    }
    out[0] = u; out[1] = v; return out;
  }

  // Every frame. rig: the camera rig; dt (s); sunDir: toward the Sun (planet axes, unit); day: day of the year.
  // sunE: the Sun's irradiance in the game's units (a stroke is measured against it). skyFrame: the sky
  // system's frame (see the top; read by package D, not yet here).
  update(rig, dt, sunDir, day = 180, sunE = 1, skyFrame = null) {
    this.time += dt;
    if (!this.def) { this.windSpeed = 0; this.veil = 0; return; }
    const p = rig.pos, len = p.length(), lat = Math.asin(p.z / len) / RAD, lon = Math.atan2(p.y, p.x) / RAD, alt = len - this.radius;
    localFrame([p.x, p.y, p.z], this._e, this._n, this._u);
    // --- wind (with gusts of its own)
    const w = this.windAt(lat, lon, this._w || (this._w = [0, 0]));
    // (pictures are still: no gusts, no showers passing, everything at its settled value)
    const still = !!this.quiet; if (still) dt = 1e3;
    // Squalls: hard weather comes in bursts. A band of the storm passes every minute or so:
    // the rain doubles, the wind rises with it, the cloud comes down darker, and then it
    // eases. (How hard the day's map says it rains here decides how much of this there is:
    // a drizzle has none.)
    const rate0 = this.rainAt(lat, lon), hard = Math.min(1, Math.max(0, (rate0 - 1.5) / 9));
    const burst = (period, phase) => { const x = 0.5 + 0.5 * Math.sin(this.time * 6.2831853 / period + phase); return x * x * x; };
    const squall = still ? 0.35 * hard : hard * Math.min(1, 0.75 * burst(64, lon * 7) + 0.55 * burst(151, lat * 5 + 2));
    this.squall = squall;
    const gust = still ? 1 : 1 + 0.18 * Math.sin(this.time * 0.37) * Math.sin(this.time * 0.11 + 1.3) + 0.08 * Math.sin(this.time * 1.9) + 0.4 * squall;
    const sp = Math.hypot(w[0], w[1]) * gust;
    this.windSpeed += (sp - this.windSpeed) * Math.min(1, dt * 0.8);
    const il = 1 / Math.max(1e-3, Math.hypot(w[0], w[1]));
    this.wind.set(this._e[0] * w[0] * il + this._n[0] * w[1] * il, this._e[1] * w[0] * il + this._n[1] * w[1] * il, this._e[2] * w[0] * il + this._n[2] * w[1] * il);
    // --- cloud overhead, rain, cold
    const top = this.topAt(lat, lon), cover = this.sample('cloud', lat, lon) / 255, rate = this.rainAt(lat, lon);
    this.top = top; this.cover = cover;
    // (the tallest cloud within 50 km, looked for a little at a time: the cloud volume is made that deep)
    if (still) {
      let m = top; for (let k = 0; k < 24; k++) { const a = k * 2.4, r = 8000 + 42000 * ((k * 0.37) % 1); m = Math.max(m, this.topAt(lat + Math.cos(a) * r / 111200, lon + Math.sin(a) * r / (111200 * Math.max(0.2, Math.cos(lat * RAD))))); }
      this.topNear = m;
    } else { const a = this.time * 2.4, r = 8000 + 42000 * ((this.time * 0.37) % 1), t2 = this.topAt(lat + Math.cos(a) * r / 111200, lon + Math.sin(a) * r / (111200 * Math.max(0.2, Math.cos(lat * RAD))));
      this.topNear = Math.max(top, t2, (this.topNear || 0) - 150 * dt); }
    const under = alt < Math.max(top, 2500) ? 1 : 0;           // (above the cloud it does not rain)
    // (the map is the day's mean; a shower comes and goes round it, and a squall doubles it)
    const now = rate * under * (still ? 1 + 0.6 * squall : 0.6 + 0.35 * Math.sin(this.time * 0.05 + lon) * Math.sin(this.time * 0.023 + lat) + 1.5 * squall);
    // How much of a storm this is (0: none, 1: the eye wall of a hurricane): by the rain,
    // the wind and how deep the cloud stands. The clouds, the sea and the lightning take it.
    const st = Math.min(1, Math.max(rate / 14, (this.windSpeed - 13) / 30, (top - 7500) / 7000, 0)) * under;
    this.storminess = this.storminess == null || still ? st : this.storminess + (st - this.storminess) * Math.min(1, dt * 0.4);
    // (colder with height as far as the air goes on cooling, 11 km; with latitude; with the season)
    this.temp = 28 - 0.0065 * Math.min(alt, 11000) - 0.5 * Math.max(0, Math.abs(lat) - 18) - 9 * Math.cos((day - 15) / 365.25 * 2 * Math.PI + (lat < 0 ? Math.PI : 0)) * Math.min(1, Math.abs(lat) / 45);
    const cold = Math.min(1, Math.max(0, (1.5 - this.temp) / 3));
    this.rain += (now * (1 - cold) - this.rain) * Math.min(1, dt * 0.5);
    this.snow += (now * cold - this.snow) * Math.min(1, dt * 0.5);
    this.wet += ((this.rain > 0.15 ? 1 : 0) - this.wet) * Math.min(1, dt * (this.rain > 0.15 ? 0.08 + 0.05 * this.rain : 0.01));
    // (what falls hides what is far: a share of the view a metre; snow hides twice as well)
    // (moderate rain, 6 mm an hour: one sees some 6 km; a cloudburst of 50: one)
    this.veil = Math.min(0.0045, 0.00014 * Math.pow(this.rain + 2 * this.snow, 0.85));
    if (still) this.topNear = 0;                             // (looked for afresh below, the same every frame)
    // --- shade: the cloud between the traveller and the Sun, and over the sky
    let shade = 1, sky = 1;
    if (alt < Math.max(top, 4500)) {
      // (looked up a little toward the Sun: the cloud that matters is the one in its way)
      const up = this._u, mu = Math.max(0.15, sunDir.x * up[0] + sunDir.y * up[1] + sunDir.z * up[2]), reach = Math.min(40000, (Math.max(top, 3000) - alt) / mu);
      const se = sunDir.x * this._e[0] + sunDir.y * this._e[1] + sunDir.z * this._e[2], sn = sunDir.x * this._n[0] + sunDir.y * this._n[1] + sunDir.z * this._n[2];
      const c2 = this.sample('cloud', lat + sn * reach / 111200, lon + se * reach / (111200 * Math.max(0.2, Math.cos(lat * RAD)))) / 255;
      // (the same law as the ground shader's cloud shadow, terrainMaterial.js: the figure and
      // the trees must stand in the light the ground under them is in)
      const k = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      shade = 1 - this.shadow * k(c2, 0.2, 0.7);
      sky = (1 - 0.6 * k(cover, 0.35, 0.8) * Math.min(1, 0.55 + rate * 0.15)) * (1 - 0.3 * squall);       // (darker as a squall passes)
    }
    this.sunShade += (shade - this.sunShade) * Math.min(1, dt * 1.5);
    this.skyShade += (sky - this.skyShade) * Math.min(1, dt * 1.5);
    // --- storms by name
    this.storm = null;
    for (const s of this.storms) { if (!s.name) continue; const d = Math.hypot((lat - s.lat) * 111200, (((lon - s.lon + 540) % 360) - 180) * 111200 * Math.cos(lat * RAD)); if (!this.storm || d < this.storm.dist) this.storm = { name: s.name, dist: d }; }
    // --- lightning: under deep cloud where it rains hard; more often the harder
    const fl = this.flash;
    if (fl) { fl.age += dt; if (fl.age > 0.5) this.flash = null; }
    this.nextFlash -= dt;
    // (no storm is seen or heard from above the weather)
    if (alt > 18000) { this.flash = null; this.flashLight.set(0, 0, 0); return; }
    if (this.forceFlash) {
      // (a picture of a stroke: held at its brightest, three kilometres ahead to the north-east)
      const v = new THREE.Vector3(this._e[0] * 2000 + this._n[0] * 2200 + this._u[0] * 700, this._e[1] * 2000 + this._n[1] * 2200 + this._u[1] * 700, this._e[2] * 2000 + this._n[2] * 2200 + this._u[2] * 700), d3 = v.length();
      this.flash = { dir: v.divideScalar(d3), dist: d3, power: 1, age: 0.02, ground: true, east: 2000, north: 2200, seed: 0.3 };
    } else if (this.quiet) { this.flash = null; }
    else if (this.nextFlash <= 0) {
      this.nextFlash = (2 + Math.random() * 6) * (1 - 0.6 * squall);       // (more of it in a squall)
      // look round for the hardest rain within 40 km: that is where it strikes
      let best = 0, bl = 0, bo = 0;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * 2 * Math.PI, r = 1500 + Math.random() * Math.random() * 38000, la = lat + Math.cos(a) * r / 111200, lo = lon + Math.sin(a) * r / (111200 * Math.max(0.2, Math.cos(lat * RAD)));
        const v = this.rainAt(la, lo) * (this.topAt(la, lo) > 7000 ? 1 : 0.15);
        if (v > best) { best = v; bl = la; bo = lo; }
      }
      const chance = Math.min(1, Math.max(0, (best - 3.5) / 8));
      if (Math.random() < chance) {
        const dN = (bl - lat) * 111200, dE = (bo - lon) * 111200 * Math.cos(lat * RAD), dist = Math.hypot(dN, dE), ground = Math.random() < 0.4;
        const h = ground ? 900 : 2500 + Math.random() * 3000;                 // where its light comes from: low for a stroke to the ground
        const v = new THREE.Vector3(this._e[0] * dE + this._n[0] * dN + this._u[0] * (h - alt), this._e[1] * dE + this._n[1] * dN + this._u[1] * (h - alt), this._e[2] * dE + this._n[2] * dN + this._u[2] * (h - alt));
        const d3 = v.length();
        this.flash = { dir: v.divideScalar(d3), dist: d3, power: 0.6 + Math.random() * 0.8, age: 0, ground, east: dE, north: dN, seed: Math.random() };
        this.thunder.push({ at: this.time + d3 / 343, power: this.flash.power, dist: d3 });
        this.nextFlash = 0.8 + Math.random() * (9 - 7 * chance);
      }
    }
    // (its light: two or three flickers in a third of a second; it lights the whole sky near, less far)
    const f = this.flash;
    if (f) {
      const flick = Math.max(0, Math.sin(f.age * 38 + f.seed * 6) * 0.5 + 0.5) * Math.exp(-f.age * 9) * (f.age < 0.04 ? 1.6 : 1);
      // (for an instant a stroke three kilometres off lights the land about as full sunlight does)
      const e = f.power * flick * 1.3 * sunE / (1 + (f.dist / 3000) * (f.dist / 3000));
      this.flashLight.set(0.82 * e, 0.88 * e, 1.0 * e);
    } else this.flashLight.set(0, 0, 0);
  }

  // Thunder that has arrived since the last call: [{ power, dist }].
  heard() {
    const out = [];
    for (let i = this.thunder.length - 1; i >= 0; i--) if (this.thunder[i].at <= this.time) out.push(...this.thunder.splice(i, 1));
    return out;
  }
}
