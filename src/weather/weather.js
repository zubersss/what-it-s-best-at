// The weather where the traveller is, for everything that must follow it: the trees, the grass
// and the sea take the wind, the ground its wetness, the lighting the cloud's shade and the
// lightning's flash, the sound the rain and the thunder, the picture the storm's dark.
//
// Two kinds of world:
//   a world whose weather is MADE BY RULE (`weather: { recipe: 'made' }`, Haven: src/weather/sky/)
//     — the field answers for every place and every moment, and this module is its reader at the
//     one place that matters: `sky.here` (what at() says at the traveller) and `sky.strikes` (the
//     strokes of the last frame). Nothing here invents weather: no gusts of its own, no showers
//     of its own, no chance. The field's wind already has its gusts and its gust fronts, its rain
//     falls only under a raining base, and its strokes are a function of the day and the place.
//   a world whose weather is ONE REAL DAY'S MAPS (`recipe: 'maps'`, Earth: where it rained and how
//     hard on 8 September 2017, how high the cloud tops stood, where cloud was, and that day's
//     storms) — the belts and the storms' winds, the showers and the strokes below. Package A
//     moves this into weather/sky/fromMaps.js, where it becomes a field like Haven's.
//
// World file: weather: { recipe: 'maps', day, rain: url, tops: url, cloud: url (small), storms: url }.
//
// THE INTERFACE sky/skySystem.js calls (docs/briefs/clouds-weather-plan.md, step 0):
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
//            breeze from the west and none of the rest.
//   takesStrikes  true when this module turns sky.strikes into its strokes, their light and their
//            thunder; false: the sky system's stand-in does (Earth, whose strokes are its own)
//   bolts    null, or up to two { pos: [x, y, z] planet axes (m), power }: the flashes that light
//            the cloud from inside (the volume's uBolt, CloudVolume.setBolts)
//   wind, windSpeed, sunShade, skyShade, wet, veil, rain, snow, temp, flash, flashes, flashLight,
//   place (the traveller, planet axes), heard(), rainNear(lat, lon), storminess, squall, topNear
import * as THREE from 'three';
import { localFrame } from '../core/ephemeris.js';
import { makeSkyAt } from './sky/format.js';
import { setStorm, stormLight, stormGrade, boltFlicker, boltReturns, FLASH_CEILING } from './storm.js';

const RAD = Math.PI / 180;
const SOUND = 343;                   // m/s
const k = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// integer hashes (a sequence of the place and the moment, never of chance)
const mix32 = (h) => { h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return (h ^ (h >>> 16)) >>> 0; };

export class Weather {
  constructor() {
    this.def = null; this.maps = {}; this.storms = []; this.epoch = 0;
    this.wind = new THREE.Vector3(1, 0, 0); this.windSpeed = 5;
    this.rain = 0; this.snow = 0; this.wet = 0; this.sunShade = 1; this.skyShade = 1; this.top = 0; this.base = 0; this.cover = 0; this.temp = 15;
    this.squall = 0; this.storminess = 0; this.veil = 0; this.gust = 1; this.topNear = 0;
    this.flash = null;                       // the brightest flash now: { dir: Vector3 (from the camera, unit), dist (m), power, age (s), ground (bool), seed (0..1) }
    this.flashes = [];                       // every flash alight now (at most FLASHES), each with pos [x, y, z] planet axes
    this.flashLight = new THREE.Vector3(); this.nextFlash = 3; this.thunder = [];         // thunder on its way: { at (s), power, dist, t (the stroke's own moment) }
    this.storm = null;                       // the nearest named storm: { name, dist (m) }
    this.time = 0;
    this._e = [0, 0, 0]; this._n = [0, 0, 0]; this._u = [0, 0, 0];
    this.place = [0, 0, 0];                  // the traveller, planet axes (m): the strokes are placed against it
    this.own = false; this.takesStrikes = false; this.bolts = null;
    this.sky = null; this.mPerDeg = 111195; this._at = makeSkyAt(); this._bolts = [];
  }

  setWorld(world) {
    this.epoch++;
    this.def = world.weather && (world.weather.recipe ?? 'maps') === 'maps' ? world.weather : null;
    this.own = !!this.def; this.takesStrikes = false; this.bolts = null; this.sky = null;
    this.maps = {}; this.storms = []; this.radius = world.radius; this.world = world;
    // (every distance of this module is metres through the world's own radius: a degree is
    // 111 195 m on Earth and 4 363 m on Haven)
    this.mPerDeg = Math.PI * world.radius / 180;
    this.rain = this.snow = this.wet = 0; this.squall = this.storminess = this.veil = 0; this.sunShade = this.skyShade = 1;
    this.flash = null; this.flashes.length = 0; this.thunder.length = 0; this.flashLight.set(0, 0, 0); this.topNear = 0; this.gust = 1;
    setStorm();
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

  // The rain at a place (mm/h), wherever this world's weather comes from: what the rainbow asks
  // of the air a few kilometres off.
  rainNear(lat, lon) {
    if (this.def) return this.rainAt(lat, lon);
    const f = this.sky?.field;
    if (!f?.on || this.sky.noClouds) return 0;
    return f.at({ lat, lon }, this.sky.t, this._at).rain;
  }

  // The wind at a place: [east, north] in m/s (the maps' worlds: the belts and the storms).
  windAt(lat, lon, out) {
    const a = Math.abs(lat), g = (c, w) => Math.exp(-((a - c) / w) * ((a - c) / w)), m = this.mPerDeg;
    let u = -7 * g(15, 10) + 10 * g(45, 12) - 4 * g(75, 10), v = -Math.sign(lat) * 2 * g(15, 10);
    for (const s of this.storms) {
      const dy = (lat - s.lat) * m, dx = (((lon - s.lon + 540) % 360) - 180) * m * Math.cos(lat * RAD), r = Math.hypot(dx, dy);
      if (r > 700000) continue;
      const rm = s.rmw ?? 38000, vmax = s.wind ?? 20;
      // (calm in the eye, hardest at the eye wall, falling away slowly outside it)
      const sp = (r < rm ? vmax * Math.pow(r / rm, 1.6) : vmax * Math.pow(rm / r, 0.62)) * (1 - Math.min(1, Math.max(0, (r - 450000) / 250000)));
      // round the centre (against the clock north of the equator), drawn a little inward
      const turn = s.lat >= 0 ? 1 : -1, kk = r > 1 ? 1 / r : 0, tx = -dy * kk * turn, ty = dx * kk * turn, inx = -dx * kk, iny = -dy * kk, mix = r < rm ? 0 : 0.34;
      u += sp * (tx * (1 - mix * 0.3) + inx * mix); v += sp * (ty * (1 - mix * 0.3) + iny * mix);
    }
    out[0] = u; out[1] = v; return out;
  }

  // Every frame. rig: the camera rig; dt (s); sunDir: toward the Sun (planet axes, unit); day: day
  // of the year. sunE: the Sun's irradiance in the game's units (a stroke is measured against it).
  // sky: the sky system's frame (see the top).
  update(rig, dt, sunDir, day = 180, sunE = 1, sky = null) {
    this.time += dt;
    this.sky = sky;
    const p = rig.pos, len = p.length(), alt = len - this.radius;
    this.place[0] = p.x; this.place[1] = p.y; this.place[2] = p.z;
    localFrame([p.x, p.y, p.z], this._e, this._n, this._u);
    if (this.def) {
      this._fromMaps(rig, dt, sunDir, day, sunE, alt, len);
      // (?debug=noclouds: no cloud means nothing the cloud does, the storm's dark grade and the
      // grey sky among it. The sky system takes the rain, the veil and the flash away itself.)
      if (sky && sky.noClouds) setStorm();
      return;
    }
    if (sky && sky.here && !sky.noClouds) { this._fromField(rig, dt, sunE, alt, sky); return; }
    // a world without weather (and a made world before its field answers): a still, dry sky
    this.own = false; this.takesStrikes = !!(sky && sky.here); this.bolts = null;
    this.windSpeed = 0; this.veil = 0; this.rain = this.snow = this.wet = 0;
    this.storminess = this.squall = 0; this.topNear = 0; this.sunShade = this.skyShade = 1;
    this.flash = null; this.flashes.length = 0; this.thunder.length = 0; this.flashLight.set(0, 0, 0);
    setStorm();
  }

  // ---- a world whose weather is made by rule: the field's reader -------------------------------
  _fromField(rig, dt, sunE, alt, sky) {
    const h = sky.here, e = this._e, n = this._n;
    this.own = true; this.takesStrikes = true;
    // THE WIND is the field's ground wind at this place and moment, whole: its exposure on a
    // crest, the slope and sea winds, its gusts and the gust front that runs out ahead of a
    // cell's rain are all the field's (weather/sky/, at()). Nothing of it is the traveller's.
    const we = h.windE, wn = h.windN, sp = Math.hypot(we, wn), il = 1 / Math.max(1e-3, sp);
    this.windSpeed = sp; this.gust = h.gust;
    this.wind.set(e[0] * we * il + n[0] * wn * il, e[1] * we * il + n[1] * wn * il, e[2] * we * il + n[2] * wn * il);
    // RAIN AND SNOW AT THE EYE: the rate at the traveller's own place and height. at() gives
    // none above the base it falls from, so flying or walking into a shaft starts the rain at
    // its edge, and standing under a gap between heaps is dry. Snow is its share by the world's
    // own temperature model (at() splits them below 1.5 degrees).
    this.rain = h.rain; this.snow = h.snow; this.temp = h.temp; this.wet = h.wet;
    // (what falls hides what is far: a share of the view a metre; snow hides twice as well)
    this.veil = Math.min(0.0045, 0.00014 * Math.pow(this.rain + 2 * this.snow, 0.85));
    this.cover = h.overcast; this.base = h.base; this.top = h.top;
    this.storminess = h.storm; this.squall = 0;          // (a cell's own stage carries its squalls now: B's cells)
    // the deepest cloud near by (the volume is made that deep): the cells' towers in reach
    let near = h.top;
    for (const c of sky.cells) { if (c.dist > 50000) break; if (c.top > near) near = c.top; }
    this.topNear = near;
    // THE SHADE the figure and the things near it stand in, where the shade probe has nothing:
    // the same law as the ground's (terrainMaterial.js), from the cloud overhead.
    const op = h.overcast, st = h.storm;
    this.sunShade = Math.max(0.04, (1 - 0.93 * st) * (1 - this.shadow * k(op, 0.2, 0.75)));
    this.skyShade = Math.max(0.12, (1 - 0.55 * k(op, 0.3, 0.9)) * (1 - 0.4 * st));
    // THE STORM for the picture (the meter's hold, the grade, the sky's grey): from the cloud
    // overhead, never from the Sun at the traveller's feet.
    setStorm(stormLight(h), st, op, stormGrade(h));
    this._strokes(sky, dt, sunE, alt);
  }

  // The field's strokes become the flashes alight: their light on the land (uFlash), the cloud
  // lit from inside (`bolts`), the ribbons (bolt.js) and the thunder on its way.
  _strokes(sky, dt, sunE, alt) {
    const fs = this.flashes;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i];
      if (!f.held) f.age += dt;
      if (f.age > f.life) fs.splice(i, 1);
    }
    if (alt > FLASH_CEILING) { fs.length = 0; this.thunder.length = 0; }
    else if (this.forceFlash) {
      // a picture of a stroke (?debug=flash): the nearest stroke to the ground of the next ten
      // minutes, held at the top of its first flicker
      if (!fs.length && sky.field?.on) {
        let best = null, bk = Infinity;
        for (const s of sky.field.strikes(sky.t, sky.t + 600)) {
          const d = this._distOf(s), kk = d + (s.ground ? 0 : 1e6);
          if (d <= 60000 && kk < bk) { bk = kk; best = s; }
        }
        if (best) { const f = this._flashOf(best); f.held = true; f.age = this._peakAge(f.seed); fs.push(f); }
      }
    } else if (this.quiet) { fs.length = 0; this.thunder.length = 0; }
    else {
      for (const s of sky.strikes) {
        if (fs.length >= FLASHES) break;
        const f = this._flashOf(s);
        fs.push(f);
        // the thunder is on its way from the stroke's own moment, not from the frame's
        const span = sky.tPrev != null && sky.t > sky.tPrev ? sky.t - sky.tPrev : 0;
        const lag = span > 0 ? (sky.t - s.t) * dt / span : 0;
        this.thunder.push({ at: this.time - lag + f.dist / SOUND, power: f.power, dist: f.dist, t: s.t });
      }
    }
    this._flashLight(sunE);
  }
  // a strike's place in planet axes: the foot of a stroke to the ground, else the flash itself
  _posOf(s) { const r = this.radius + (s.ground ? s.h1 : 0.5 * (s.h0 + s.h1)); return [s.x * r, s.y * r, s.z * r]; }
  _distOf(s) { const q = this._posOf(s), c = this.place; return Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]); }
  _flashOf(s) {
    const pos = this._posOf(s), seed = (s.seed >>> 0) / 4294967296, life = boltReturns(seed).life;
    const c = this.place, dist = Math.hypot(pos[0] - c[0], pos[1] - c[1], pos[2] - c[2]);
    // the light comes from where the channel is: a stroke to the ground lights it from low down
    return {
      strike: s, pos, dir: new THREE.Vector3(), dist, power: s.power, age: 0, life, ground: !!s.ground, seed, held: false,
      h0: s.h0, h1: s.h1, x: s.x, y: s.y, z: s.z,
    };
  }
  // the age at which a flash is at its brightest (a held picture of one)
  _peakAge(seed) { let best = 0, bv = -1; for (let i = 0; i <= 60; i++) { const a = i * 0.002, v = boltFlicker(a, seed); if (v > bv) { bv = v; best = a; } } return best; }

  // The light every flash alight throws on the land and the sky, and the flashes that light their
  // own cloud from inside (up to two, the brightest).
  _flashLight(sunE) {
    const fs = this.flashes, c = this.place;
    let sum = 0, best = null, bv = -1;
    this._bolts.length = 0;
    for (const f of fs) {
      f.dir.set(f.pos[0] - c[0], f.pos[1] - c[1], f.pos[2] - c[2]);
      f.dist = f.dir.length() || 1; f.dir.divideScalar(f.dist);
      const flick = boltFlicker(f.age, f.seed);
      // (for an instant a stroke three kilometres off lights the land about as full sunlight does)
      const e = f.power * flick * 1.3 * sunE / (1 + (f.dist / 3000) * (f.dist / 3000));
      sum += e;
      if (e > bv) { bv = e; best = f; }
      // the cloud lit from inside, at the flash's own place: no falling away with distance (a
      // tower 80 km off flickers at night)
      if (this._bolts.length < 2 && flick > 0.02) this._bolts.push({ pos: f.pos, power: f.power * flick * 7.8 * sunE });
    }
    this.flash = best;
    this.flashLight.set(0.82 * sum, 0.88 * sum, 1.0 * sum);
    this.bolts = this._bolts.length ? this._bolts : null;
  }

  // ---- a world whose weather is one real day's maps (Earth) -------------------------------------
  _fromMaps(rig, dt, sunDir, day, sunE, alt, len) {
    const p = rig.pos, lat = Math.asin(p.z / len) / RAD, lon = Math.atan2(p.y, p.x) / RAD, m = this.mPerDeg;
    const cl = Math.max(0.2, Math.cos(lat * RAD));
    this.own = true; this.takesStrikes = false;
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
    this.gust = gust;
    const sp = Math.hypot(w[0], w[1]) * gust;
    this.windSpeed += (sp - this.windSpeed) * Math.min(1, dt * 0.8);
    const il = 1 / Math.max(1e-3, Math.hypot(w[0], w[1]));
    this.wind.set(this._e[0] * w[0] * il + this._n[0] * w[1] * il, this._e[1] * w[0] * il + this._n[1] * w[1] * il, this._e[2] * w[0] * il + this._n[2] * w[1] * il);
    // --- cloud overhead, rain, cold
    const top = this.topAt(lat, lon), cover = this.sample('cloud', lat, lon) / 255, rate = this.rainAt(lat, lon);
    this.top = top; this.cover = cover;
    // (the tallest cloud within 50 km, looked for a little at a time: the cloud volume is made that deep)
    if (still) {
      let mx = top; for (let i = 0; i < 24; i++) { const a = i * 2.4, r = 8000 + 42000 * ((i * 0.37) % 1); mx = Math.max(mx, this.topAt(lat + Math.cos(a) * r / m, lon + Math.sin(a) * r / (m * cl))); }
      this.topNear = mx;
    } else { const a = this.time * 2.4, r = 8000 + 42000 * ((this.time * 0.37) % 1), t2 = this.topAt(lat + Math.cos(a) * r / m, lon + Math.sin(a) * r / (m * cl));
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
    // (moderate rain, 6 mm an hour: one sees some 6 km; a cloudburst of 50: one)
    this.veil = Math.min(0.0045, 0.00014 * Math.pow(this.rain + 2 * this.snow, 0.85));
    if (still) this.topNear = 0;                             // (looked for afresh below, the same every frame)
    // --- shade: the cloud between the traveller and the Sun, and over the sky
    let shade = 1, sky2 = 1;
    if (alt < Math.max(top, 4500)) {
      // (looked up a little toward the Sun: the cloud that matters is the one in its way)
      const up = this._u, mu = Math.max(0.15, sunDir.x * up[0] + sunDir.y * up[1] + sunDir.z * up[2]), reach = Math.min(40000, (Math.max(top, 3000) - alt) / mu);
      const se = sunDir.x * this._e[0] + sunDir.y * this._e[1] + sunDir.z * this._e[2], sn = sunDir.x * this._n[0] + sunDir.y * this._n[1] + sunDir.z * this._n[2];
      const c2 = this.sample('cloud', lat + sn * reach / m, lon + se * reach / (m * cl)) / 255;
      // (the same law as the ground shader's cloud shadow, terrainMaterial.js: the figure and
      // the trees must stand in the light the ground under them is in)
      shade = 1 - this.shadow * k(c2, 0.2, 0.7);
      sky2 = (1 - 0.6 * k(cover, 0.35, 0.8) * Math.min(1, 0.55 + rate * 0.15)) * (1 - 0.3 * squall);       // (darker as a squall passes)
    }
    this.sunShade += (shade - this.sunShade) * Math.min(1, dt * 1.5);
    this.skyShade += (sky2 - this.skyShade) * Math.min(1, dt * 1.5);
    // the storm for the picture: the cloud overhead, as the made worlds' field gives it
    setStorm(stormLight(this._asAt(cover, rate, st)), st, Math.min(1, cover * Math.min(1, 0.55 + rate * 0.15) + 0.4 * st), stormGrade(this._asAt(cover, rate, st)));
    // --- storms by name
    this.storm = null;
    for (const s of this.storms) { if (!s.name) continue; const d = Math.hypot((lat - s.lat) * m, (((lon - s.lon + 540) % 360) - 180) * m * Math.cos(lat * RAD)); if (!this.storm || d < this.storm.dist) this.storm = { name: s.name, dist: d }; }
    this._mapStrokes(dt, sunE, alt, lat, lon, m, cl, squall);
  }
  // the maps' cloud overhead as the field's at() would put it (for the storm's own numbers)
  _asAt(cover, rate, storm) {
    const o = this._at;
    o.overcast = Math.min(1, cover * Math.min(1, 0.55 + rate * 0.15) + 0.4 * storm); o.storm = storm;
    return o;
  }

  // Earth's own lightning: under deep cloud where it rains hard, more often the harder. Every
  // number of it is the place's and the moment's (a hash, never Math.random: two runs of the
  // same minute at the same place strike alike, and a benchmark meets the same storm).
  _mapStrokes(dt, sunE, alt, lat, lon, m, cl, squall) {
    const fl = this.flash;
    if (fl) { fl.age += dt; if (fl.age > 0.5) { this.flash = null; this.flashes.length = 0; } }
    this.nextFlash -= dt;
    // (no storm is seen or heard from above the weather)
    if (alt > FLASH_CEILING) { this.flash = null; this.flashes.length = 0; this.flashLight.set(0, 0, 0); this.bolts = null; return; }
    if (this.forceFlash) {
      // (a picture of a stroke: held at its brightest, three kilometres ahead to the north-east)
      const e = this._e, n = this._n, u = this._u, c = this.place;
      const pos = [c[0] + e[0] * 2000 + n[0] * 2200 + u[0] * 700, c[1] + e[1] * 2000 + n[1] * 2200 + u[1] * 700, c[2] + e[2] * 2000 + n[2] * 2200 + u[2] * 700];
      this.flash = { pos, dir: new THREE.Vector3(), dist: 0, power: 1, age: 0.02, life: 0.6, ground: true, seed: 0.3, held: true, h0: alt - 700, h1: alt + 700, x: 0, y: 0, z: 0 };
      this.flashes.length = 0; this.flashes.push(this.flash);
    } else if (this.quiet) { this.flash = null; this.flashes.length = 0; }
    else if (this.nextFlash <= 0) {
      const rnd = this._hashRnd(lat, lon);
      this.nextFlash = (2 + rnd() * 6) * (1 - 0.6 * squall);       // (more of it in a squall)
      // look round for the hardest rain within 40 km: that is where it strikes
      let best = 0, bl = 0, bo = 0;
      for (let i = 0; i < 10; i++) {
        const a = rnd() * 2 * Math.PI, r = 1500 + rnd() * rnd() * 38000, la = lat + Math.cos(a) * r / m, lo = lon + Math.sin(a) * r / (m * cl);
        const v = this.rainAt(la, lo) * (this.topAt(la, lo) > 7000 ? 1 : 0.15);
        if (v > best) { best = v; bl = la; bo = lo; }
      }
      const chance = Math.min(1, Math.max(0, (best - 3.5) / 8));
      if (rnd() < chance) {
        const dN = (bl - lat) * m, dE = (bo - lon) * m * Math.cos(lat * RAD), ground = rnd() < 0.4;
        const h = ground ? 900 : 2500 + rnd() * 3000;                 // where its light comes from: low for a stroke to the ground
        const e = this._e, n = this._n, u = this._u, c = this.place;
        const pos = [c[0] + e[0] * dE + n[0] * dN + u[0] * (h - alt), c[1] + e[1] * dE + n[1] * dN + u[1] * (h - alt), c[2] + e[2] * dE + n[2] * dN + u[2] * (h - alt)];
        const dist = Math.hypot(pos[0] - c[0], pos[1] - c[1], pos[2] - c[2]);
        const seed = rnd();
        this.flash = { pos, dir: new THREE.Vector3(), dist, power: 0.6 + rnd() * 0.8, age: 0, life: 0.6, ground, seed, held: false, h0: 0, h1: h, x: 0, y: 0, z: 0 };
        this.flashes.length = 0; this.flashes.push(this.flash);
        this.thunder.push({ at: this.time + dist / SOUND, power: this.flash.power, dist, t: this.time });
        this.nextFlash = 0.8 + rnd() * (9 - 7 * chance);
      }
    }
    // (its light: two or three flickers in a third of a second; it lights the whole sky near, less far)
    const f = this.flash;
    if (f) {
      const c = this.place;
      f.dir.set(f.pos[0] - c[0], f.pos[1] - c[1], f.pos[2] - c[2]);
      f.dist = f.dir.length() || 1; f.dir.divideScalar(f.dist);
      const flick = Math.max(0, Math.sin(f.age * 38 + f.seed * 6) * 0.5 + 0.5) * Math.exp(-f.age * 9) * (f.age < 0.04 ? 1.6 : 1);
      const e = f.power * flick * 1.3 * sunE / (1 + (f.dist / 3000) * (f.dist / 3000));
      this.flashLight.set(0.82 * e, 0.88 * e, 1.0 * e);
    } else this.flashLight.set(0, 0, 0);
    this.bolts = null;
  }
  // A sequence of numbers of the place and the moment (0.7 s slots), not of chance.
  _hashRnd(lat, lon) {
    let s = mix32((Math.round(this.time / 0.7) ^ Math.imul(Math.round(lat * 64), 0x9e3779b1) ^ Math.imul(Math.round(lon * 64), 0x85ebca6b)) | 0);
    return () => { s = mix32((s + 0x6d2b79f5) | 0); return s / 4294967296; };
  }

  // Thunder that has arrived since the last call: [{ power, dist }].
  heard() {
    const out = [];
    for (let i = this.thunder.length - 1; i >= 0; i--) if (this.thunder[i].at <= this.time) out.push(...this.thunder.splice(i, 1));
    return out;
  }
}

// flashes alight at once (the pool of strokes in bolt.js is the same size)
export const FLASHES = 4;
