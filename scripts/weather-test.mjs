// The weather where the traveller is (src/weather/weather.js and what reads it: rain.js,
// rainbow.js, the exposure meter's storm hold in post.js, the storm's numbers in
// weather/storm.js), without a browser, in a minute:
//   node scripts/weather-test.mjs [--break <fault>]
// Package D of the sky plan (docs/briefs/sky-D-storm.md). Fails (exit 1) on any broken promise.
//
//  1. THE WIND IS THE PLACE'S. What the engine gives the trees, the grass and the sea (uWind) is
//     the field's ground wind at the traveller: its bearing within a degree and its speed within
//     2 % of at()'s, at the opening place and 10 km east of it, so flying 10 km east turns the
//     wind only as much as the field does (it was the traveller's own east at a fixed 6 m/s,
//     which no day and no place changed).
//  2. RAIN COMES OUT OF THE CLOUD ABOVE. The rain at the eye is above zero exactly where at()
//     says rain falls at the traveller's place and height (under a raining base), over a grid of
//     places and heights round a storm and under the gaps between heaps.
//  3. THUNDER AND ITS DELAY. Every stroke's thunder is queued for the stroke's own 3-D distance
//     over 343 m/s (within 0.05 s of the stroke's own moment) and is heard then; an hour of
//     strokes is identical in two runs, on Haven (the field's) and on Earth (its maps': they
//     came from Math.random and differed run to run).
//  5. NO '111 200 M A DEGREE' is left in src/weather (a degree is 4 363 m on Haven), and Earth's
//     wind and rain are within 2 % of what they were before this package moved (the table below,
//     taken from the code as it stood).
//  6. THE METER HOLDS THE DARK. Replayed: with the cloud overhead leaving 0.15 of the light the
//     exposure is at least 1.2 stops darker than full compensation; a clear sky is within 0.05
//     stops of what the meter did before; a heap's shadow over the figure (the Sun at the
//     traveller's feet gone, the sky overhead the same) moves it by at most 0.05 stops; and a
//     stroke of lightning alight, 60 times as bright as sunlight over lit ground, moves it by at
//     most 0.05 stops.
//  7. THE GUST FRONT. At a place a raining cell is about to reach, the wind rises to 6 m/s or
//     more, blowing outward from the cell, before its rain arrives.
// (Check 4 is scripts/bolt-test.mjs: the strokes themselves.)
//
// Every check can fail: --break <fault> puts the fault it guards against into the code, and the
// check must then fail. Faults: wind-east (uWind from the traveller's own east), rain-map (the
// rain at the eye from the field's map wherever one stands), thunder-now (thunder heard the
// moment it strikes), thunder-random (strokes out of Math.random), earth-moved (Earth's wind
// changed by a twentieth), meter-full (the meter makes up all of the darkness), meter-feet (the
// darkness taken from the Sun at the traveller's feet), gust-none (no gust front).
import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Weather } from '../src/weather/weather.js';
import { makeProducer } from '../src/weather/sky/producer.js';
import { makeSkyAt } from '../src/weather/sky/format.js';
import { Steer } from '../src/weather/sky/steer.js';
import { landFromI16 } from '../src/weather/sky/stub.js';
import { thunderLoudness } from '../src/audio/audio.js';
import haven from '../src/worlds/haven.js';
import earth from '../src/worlds/earth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const BREAK = argv.includes('--break') ? argv[argv.indexOf('--break') + 1] : (argv.find((a) => a.startsWith('--break=')) || '=').split('=')[1] || null;
let failed = false;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) failed = true; };
const note = (text) => console.log(`     ${text}`);

// What this package must provide (missing, this reads as a failed check and not as a crash).
const storm = await import('../src/weather/storm.js').then((m) => m, () => null);
const post = await import('../src/post/post.js');
const meterTarget = post.meterTarget || null;

// ---- the faults --------------------------------------------------------------------------------
if (BREAK === 'rain-map' || BREAK === 'thunder-now' || BREAK === 'thunder-random' || BREAK === 'gust-none') {
  const orig = Weather.prototype.update;
  Weather.prototype.update = function (rig, dt, sunDir, day, sunE, sky) {
    orig.call(this, rig, dt, sunDir, day, sunE, sky);
    if (BREAK === 'rain-map' && sky?.here) this.rain = sky.here.field.rain;            // the map's rain, base or no base
    if (BREAK === 'thunder-now') for (const q of this.thunder) q.at = this.time;
    if (BREAK === 'thunder-random') for (const q of this.thunder) if (!q._r) { q._r = 1; q.power *= 0.5 + Math.random(); }
    if (BREAK === 'gust-none') this.windSpeed = Math.min(this.windSpeed, 4);
  };
}
if (BREAK === 'earth-moved') {
  const orig = Weather.prototype.windAt;
  Weather.prototype.windAt = function (lat, lon, out) { orig.call(this, lat, lon, out); out[0] *= 1.05; return out; };
}

const D2R = Math.PI / 180;
const enu = (lat, lon) => { const la = lat * D2R, lo = lon * D2R; return { e: [-Math.sin(lo), Math.cos(lo), 0], n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], u: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)] }; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const atPos = (R, lat, lon, h = 0) => { const f = enu(lat, lon).u, r = R + h; return new THREE.Vector3(f[0] * r, f[1] * r, f[2] * r); };
const bearing = (e, n) => (Math.atan2(e, n) / D2R + 360) % 360;
const turn = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const stops = (a, b) => Math.abs(Math.log2(a / b));
const latLon = (p) => { const r = p.length(); return [Math.asin(p.z / r) / D2R, Math.atan2(p.y, p.x) / D2R]; };

// A rig as the weather reads it (its place, and how far it is over the ground).
function makeRig(pos, agl = 2) {
  const ll = latLon(pos);
  return { pos, agl, mode: 'hero', onFoot: false, throttle: 0, fov: 60, camera: { fov: 60, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } }, east: enu(ll[0], ll[1]).e };
}

// ---- Haven's field (the stub producer, as the page's SkyField makes it) -------------------------
const R = haven.radius, START = haven.scene.start;
const LAND = landFromI16(readFileSync(new URL('../public/data/haven_dem_4096.i16', import.meta.url)), 4096, 2048);
const steer = new Steer(haven.weather, R);
const T_SCENE = steer.t(Date.parse(haven.scene.dateUTC));
const prod = makeProducer({ preset: 'storm', weather: haven.weather, radius: R, dayHours: haven.dayHours || 24, origin: START, layout: { width: 1024, height: 512, cWidth: 512, cHeight: 256 }, land: LAND });
const field = { on: true, busy: false, at: (p, t, out) => prod.at(p, t, out), cells: (t) => prod.cells(t), strikes: (t0, t1) => prod.strikes(t0, t1), textures: null };

// The sky system's frame, as sky/skySystem.js fills it.
function skyFrame(t, tPrev, rig, opts = {}) {
  const here = field.at([rig.pos.x, rig.pos.y, rig.pos.z], t, makeSkyAt());
  const cells = field.cells(t).map((c) => ({ ...c, dist: Math.hypot(c.x * (R + c.base) - rig.pos.x, c.y * (R + c.base) - rig.pos.y, c.z * (R + c.base) - rig.pos.z) })).sort((a, b) => a.dist - b.dist);
  const strikes = [];
  if (tPrev != null && t > tPrev && t - tPrev < 60) {
    for (const s of field.strikes(tPrev, t)) {
      const r = R + (s.ground ? s.h1 : 0.5 * (s.h0 + s.h1)), pos = [s.x * r, s.y * r, s.z * r];
      const dist = Math.hypot(pos[0] - rig.pos.x, pos[1] - rig.pos.y, pos[2] - rig.pos.z);
      if (dist <= 60000) strikes.push({ ...s, pos, dist });
    }
  }
  return { t, tPrev, noiseT: t, rate: 1, paused: false, steer, rise: [0, 0, 1], field, here, cells, strikes, world: haven, R, noClouds: false, shotMode: false, ...opts };
}
// What the sky system hands the trees, the grass and the sea (skySystem.js weatherStep): the
// weather's own wind where it answers for the world, else the traveller's east at the sea's speed.
function uWindOf(wx, rig, world) {
  const own = !!wx.own && BREAK !== 'wind-east';
  if (!own) { const ll = latLon(rig.pos); return { v: enu(ll[0], ll[1]).e, speed: world.surface.sea?.wind ?? 6 }; }
  return { v: [wx.wind.x, wx.wind.y, wx.wind.z], speed: Math.max(1.5, wx.windSpeed) };
}

const SUN = new THREE.Vector3(0.3, 0.2, 0.93).normalize();
const havenWeather = () => { const wx = new Weather(); wx.setWorld(haven); return wx; };

// ---- 1. the wind at the traveller is the field's -------------------------------------------------
{
  const east = 10000 / (R * D2R * Math.cos(START.lat * D2R));
  const places = [[START.lat, START.lon, 'the opening place'], [START.lat, START.lon + east, '10 km east']];
  const got = [];
  for (const [lat, lon, name] of places) {
    const wx = havenWeather(), rig = makeRig(atPos(R, lat, lon, 1500), 30);
    const f = skyFrame(T_SCENE, T_SCENE - 1 / 30, rig);
    wx.update(rig, 1 / 30, SUN, 266, 1, f);
    const u = uWindOf(wx, rig, haven), fr = enu(lat, lon);
    got.push({
      name, bear: bearing(dot(u.v, fr.e), dot(u.v, fr.n)), speed: u.speed, up: Math.abs(dot(u.v, fr.u)),
      fb: bearing(f.here.windE, f.here.windN), fs: Math.max(1.5, f.here.wind), own: !!wx.own,
    });
  }
  for (const g of got) note(`${g.name}: uWind ${g.speed.toFixed(2)} m/s toward ${g.bear.toFixed(1)} deg; the field ${g.fs.toFixed(2)} m/s toward ${g.fb.toFixed(1)} deg`);
  const off = Math.max(...got.map((g) => turn(g.bear, g.fb)));
  const sp = Math.max(...got.map((g) => Math.abs(g.speed - g.fs) / g.fs));
  const level = Math.max(...got.map((g) => g.up));
  const mine = turn(got[0].bear, got[1].bear), theirs = turn(got[0].fb, got[1].fb);
  check(got.every((g) => g.own) && off <= 1 && sp <= 0.02 && level < 1e-6 && Math.abs(mine - theirs) <= 0.5,
    `uWind is the field's ground wind at the traveller (within ${off.toFixed(2)} deg and ${(sp * 100).toFixed(2)} %, level to ${level.toExponential(1)}): 10 km east turns it ${mine.toFixed(2)} deg, the field ${theirs.toFixed(2)} deg`);
}

// ---- 2. rain at the eye comes from the cloud above ------------------------------------------------
{
  let bad = 0, wet = 0, dry = 0, gaps = 0, above = 0, worst = '';
  // places out from the middle of each raining cell (through the shaft's edge and beyond it) and
  // places away from every cell, each at four heights round the cloud's base
  const spots = [];
  for (let k = 0; k < 4; k++) {
    const t = T_SCENE + k * 900;
    for (const c of field.cells(t).filter((x) => x.rain > 1).slice(0, 3)) {
      for (let i = 0; i < 7; i++) for (const b of [0, 1.9]) {
        const km = i * 0.55 * c.core / 1000, br = b + 0.3 * i;
        const la = Math.asin(Math.sin(c.lat * D2R) * Math.cos(km * 1000 / R) + Math.cos(c.lat * D2R) * Math.sin(km * 1000 / R) * Math.cos(br)) / D2R;
        const lo = c.lon + Math.atan2(Math.sin(br) * Math.sin(km * 1000 / R) * Math.cos(c.lat * D2R), Math.cos(km * 1000 / R) - Math.sin(c.lat * D2R) * Math.sin(la * D2R)) / D2R;
        spots.push([t, la, lo, c.base]);
      }
    }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) spots.push([t, START.lat + (i - 3) * 0.9, START.lon + (j - 3) * 1.2, 2600]);
  }
  {
    for (const [t, lat, lon, cbase] of spots) {
      for (const h of [cbase - 900, cbase - 60, cbase + 80, cbase + 2500]) {
        const wx = havenWeather(), rig = makeRig(atPos(R, lat, lon, h), Math.max(5, h - 1400));
        const f = skyFrame(t, t - 1 / 30, rig);
        wx.quiet = true;                                   // (settled at once, as in a picture)
        wx.update(rig, 1 / 30, SUN, 266, 1, f);
        const theirs = f.here.rain + f.here.snow, mine = wx.rain + wx.snow;
        if ((theirs > 0.05) !== (mine > 0.05)) { bad++; if (!worst) worst = `${lat.toFixed(2)}, ${lon.toFixed(2)} at ${h} m: at() ${theirs.toFixed(2)} mm/h, the eye ${mine.toFixed(2)}`; }
        if (theirs > 0.05) wet++; else { dry++; if (f.here.field.heap > 0.25) gaps++; }
        if (h > f.here.base + 10 && mine > 0.05) above++;
      }
    }
  }
  note(`${wet} places and heights with rain from the cloud above, ${dry} without (${gaps} of them under a gap between heaps)`);
  check(bad === 0 && wet >= 12 && gaps >= 6 && above === 0,
    `the rain at the eye is above zero exactly where at() rains (${bad} of ${wet + dry} disagree${worst ? ': ' + worst : ''}), and never above the base`);
}

// ---- 5's table: Earth as it was ------------------------------------------------------------------
const EARTH_WAS = [
  { lat: 36.1, lon: -112.1, windE: 5.687517911943174, windN: -0.023308135425962717, rain: 0.20064930154205407, top: 5018.833024691354, windSpeed: 5.687565671519894, rainNow: 0.20064930154205274, veil: 3.574374392941632e-05, sunShade: 0.16021722515882475, skyShade: 0.7234903718510008, temp: 22.6844724045348 },
  { lat: 18.2, lon: -60.4, windE: -11.140768033235329, windN: -41.50980537725679, rain: 2.2744793079174617, top: 5540.833333333335, windSpeed: 42.978839617049864, rainNow: 2.31558184165706, veil: 0.0002858177201047635, sunShade: 0.15000000000000002, skyShade: 0.465411292330284, temp: 29.460454231646075 },
  { lat: -14, lon: 120.5, windE: -14.006766869054182, windN: -16.743349029767042, rain: 2.9698213209518833, top: 5457.63888888888, windSpeed: 21.829550037887493, rainNow: 3.071673810547443, veil: 0.0003634099938571966, sunShade: 0.46693014047574755, skyShade: 0.8423635393318041, temp: 25.649650591035428 },
  { lat: 51.5, lon: 0.1, windE: 7.441222356641588, windN: -3.274475614392391e-06, rain: 1.7341152813389638, top: 7684.999999999998, windSpeed: 7.441222356642317, rainNow: 1.743588215368144, veil: 0.00022457187858081887, sunShade: 0.9365249884275006, skyShade: 0.9972686550510454, temp: 16.06540881450953 },
  { lat: -45, lon: -73, windE: 9.998642492155048, windN: 0.0002468196081733591, rain: 1.1761217262962051, top: 6553.124999999996, windSpeed: 9.998642495201457, rainNow: 1.1761217262962051, veil: 0.00016069873847935912, sunShade: 0.15000000000000002, skyShade: 0.5949802931661605, temp: 8.384591185490482 },
];
// Earth's weather maps as plain numbers (the real ones are JPEGs a browser decodes): the same
// bytes every run, so the table above can be compared against.
const grey = (w, h, f) => { const d = new Uint8Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d[j * w + i] = f(i, j) & 255; return { data: d, w, h }; };
const EARTH_MAPS = {
  rain: grey(512, 256, (i, j) => Math.round(205 * (0.5 + 0.5 * Math.sin(i * 0.11) * Math.cos(j * 0.17)))),
  tops: grey(256, 128, (i, j) => Math.round(60 + 70 * (0.5 + 0.5 * Math.sin(i * 0.23 + 1) * Math.sin(j * 0.19)))),
  cloud: grey(128, 64, (i, j) => Math.round(255 * (0.5 + 0.5 * Math.cos(i * 0.31) * Math.sin(j * 0.27 + 2)))),
};
const EARTH_STORMS = [{ name: 'Test', lat: 18, lon: -60, rmw: 38000, wind: 48 }, { name: 'Two', lat: -14, lon: 120, rmw: 30000, wind: 30 }];
function earthWeather() {
  const wx = new Weather(); wx.setWorld(earth);
  wx.maps.rain = EARTH_MAPS.rain; wx.maps.tops = EARTH_MAPS.tops; wx.maps.cloud = EARTH_MAPS.cloud; wx.storms = EARTH_STORMS;
  return wx;
}

// ---- 3. thunder, and the same strokes every run ---------------------------------------------------
{
  const DT = 1 / 15;
  // Haven: the field's strokes over an hour of game time
  const run = () => {
    const wx = havenWeather(), out = { queued: [], heard: [], err: [], late: [] };
    const rig = makeRig(atPos(R, START.lat, START.lon, 1500), 30);
    let t = T_SCENE;
    for (let i = 0; i < Math.round(3600 / DT); i++) {
      const prev = t; t += DT;
      const f = skyFrame(t, prev, rig);
      wx.update(rig, DT, SUN, 266, 1, f);
      for (const q of wx.thunder) {
        if (q._seen) continue;
        q._seen = true;
        out.queued.push({ at: q.at, dist: q.dist, power: q.power, t: q.t });
        // the stroke's own moment on the page's clock, plus its distance over the speed of sound
        const want = wx.time - (f.t - (q.t ?? f.t)) + q.dist / 343;
        out.err.push(q.at - want);
      }
      for (const h of wx.heard()) { out.heard.push({ power: h.power, dist: h.dist }); out.late.push(wx.time - h.at); }
      out.end = wx.time;
    }
    return out;
  };
  const a = run(), b = run();
  const worst = a.err.length ? Math.max(...a.err.map(Math.abs)) : Infinity;
  const late = a.late.length ? Math.max(...a.late) : Infinity;
  const key = (o) => JSON.stringify(o.queued.map((q) => [q.dist.toFixed(1), q.power.toFixed(3), q.at.toFixed(3)]));
  // (the last strokes' thunder is still on its way when the hour ends: up to three minutes for 60 km)
  const due = a.queued.filter((q) => q.at <= a.end).length;
  note(`Haven: ${a.queued.length} strokes in the hour, ${a.heard.length} heard; the delay is the distance over 343 m/s within ${worst === Infinity ? '-' : worst.toFixed(4)} s, heard at most ${late === Infinity ? '-' : late.toFixed(3)} s after its time`);
  if (a.queued.length) {
    note('  the log (the stroke\'s moment, how far off, when its thunder arrives, how loud):');
    for (const q of a.queued.slice(0, 8)) note(`    ${q.t.toFixed(1)} s  ${(q.dist / 1000).toFixed(1)} km  +${(q.dist / 343).toFixed(1)} s  loudness ${thunderLoudness(q.power, q.dist).toFixed(3)}`);
    const near = a.queued.filter((q) => q.dist < 30000), loud = near.map((q) => thunderLoudness(q.power, q.dist));
    note(`    ${near.length} of them within 30 km (loudness ${loud.length ? Math.min(...loud).toFixed(2) : '-'} to ${loud.length ? Math.max(...loud).toFixed(2) : '-'}), ${a.queued.filter((q) => q.dist > 50000).length} past 50 km (heard as nothing)`);
  }
  check(a.queued.length >= 20 && worst <= 0.05 && late <= DT + 1e-6 && a.heard.length >= due - 1 && key(a) === key(b),
    `every stroke's thunder is queued for its own distance over 343 m/s and heard then (${a.queued.length} strokes, ${a.heard.length} of the ${due} due heard, within ${worst === Infinity ? '-' : worst.toFixed(4)} s), the same in two runs`);

  // Earth: its own strokes (from its maps), over an hour
  const earthRun = () => {
    const wx = earthWeather(), out = [];
    const rig = makeRig(atPos(earth.radius, 12, 152, 300), 300);
    for (let i = 0; i < Math.round(3600 / DT); i++) {
      wx.update(rig, DT, new THREE.Vector3(0, 0, 1), 251, 1, null);
      for (const q of wx.thunder) if (!q._seen) { q._seen = true; out.push([q.dist.toFixed(1), q.power.toFixed(3)]); }
      wx.heard();
    }
    return out;
  };
  const e1 = earthRun(), e2 = earthRun();
  note(`Earth: ${e1.length} strokes in the hour, ${e2.length} in a second run`);
  check(e1.length >= 10 && JSON.stringify(e1) === JSON.stringify(e2), `Earth's own strokes are a function of the time and the place: ${e1.length} in the hour, the same in two runs`);
}

// ---- 5. no degrees of Earth's own, and Earth unmoved -----------------------------------------------
{
  const files = fs.readdirSync(path.join(root, 'src/weather')).filter((f) => f.endsWith('.js')).map((f) => `src/weather/${f}`)
    .concat(fs.readdirSync(path.join(root, 'src/weather/sky')).filter((f) => f.endsWith('.js')).map((f) => `src/weather/sky/${f}`));
  const deg = files.filter((f) => /111\s*200/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  check(deg.length === 0, `no '111 200 m a degree' is left in src/weather (a degree is ${(R * D2R).toFixed(0)} m on Haven)${deg.length ? ': ' + deg.join(', ') : ''}`);
  let worst = 0, which = '';
  for (const was of EARTH_WAS) {
    const wx = earthWeather(), w = wx.windAt(was.lat, was.lon, [0, 0]);
    const rig = makeRig(atPos(earth.radius, was.lat, was.lon, 100), 100);
    const wx2 = earthWeather(); wx2.quiet = true;
    wx2.update(rig, 1 / 30, new THREE.Vector3(0, 0, 1), 251, 1, null);
    const now = { windE: w[0], windN: w[1], rain: wx.rainAt(was.lat, was.lon), top: wx.topAt(was.lat, was.lon), windSpeed: wx2.windSpeed, rainNow: wx2.rain, veil: wx2.veil, sunShade: wx2.sunShade, skyShade: wx2.skyShade, temp: wx2.temp };
    for (const k of Object.keys(now)) {
      const d = Math.abs(was[k] - now[k]) / Math.max(1e-6, Math.abs(was[k]));
      if (d > worst) { worst = d; which = `${k} at ${was.lat}, ${was.lon}: was ${was[k]}, now ${now[k]}`; }
    }
  }
  check(worst <= 0.02, `Earth's wind, rain, shade and warmth are within 2 % of what they were at five places (worst ${(worst * 100).toFixed(2)} %${worst > 0.02 ? ': ' + which : ''})`);
}

// ---- 6. the meter holds the dark ---------------------------------------------------------------------
{
  // The meter as it was before this package (post.js's _meter, the same arithmetic): what it aims
  // at from one read-back, with no weather in it at all.
  const was = (s, measuredLog2, peak, bright, cover) => {
    let target = s.key / Math.pow(2, measuredLog2);
    if (peak > 0) target = Math.min(target, s.highlight / peak);
    if (bright > 0) {
      const from = s.coverFrom ?? 0.01, x = Math.min(1, Math.max(0, (cover - from) / (5 * from))), k = x * x * (3 - 2 * x);
      const y = Math.min(1, Math.max(0, (cover - 0.35) / 0.3)), cap = s.globe + (s.surface - s.globe) * y * y * (3 - 2 * y);
      target = Math.min(target, s.highlight * Math.pow(cap / s.highlight, k) / bright);
    }
    if (s.dim && target > s.dim.above) target /= Math.min(s.dim.most ?? Infinity, Math.pow(target / s.dim.above, s.dim.power));
    return Math.min(s.max, Math.max(s.min, target));
  };
  const s = { key: 0.16, min: 0.5, max: 6e5, speed: 1.6, shadowFloor: 0.2, highlight: 6, surface: 0.6, globe: 0.32, ...haven.scene.exposure };
  if (!meterTarget || !storm?.stormLight) {
    check(false, `post.js exports meterTarget(settings, measuredLog2, peak, bright, cover, light) and src/weather/storm.js stormLight(here) (meterTarget ${!!meterTarget}, stormLight ${!!storm?.stormLight})`);
  } else {
    const target = BREAK === 'meter-full' ? (...a) => was(...a.slice(0, 5)) : meterTarget;
    const light = BREAK === 'meter-feet' ? (h) => Math.max(0.06, h.sunShade ?? 1) : storm.stormLight;
    const CASES = [[-2.3, 0, 0, 0], [-1, 0.4, 0.25, 0.6], [1.5, 0.02, 0.01, 0.004], [-5, 0.8, 0.5, 0.9]];
    let clear = 0, dark = Infinity;
    for (const [m, peak, bright, cover] of CASES) {
      const full = was(s, m, peak, bright, cover);
      clear = Math.max(clear, stops(target(s, m, peak, bright, cover, 1), full));
      const held = target(s, m, peak, bright, cover, 0.15);     // the cloud overhead leaving 0.15 of the light
      if (held > s.min * 1.001 && full > s.min * 1.001) dark = Math.min(dark, Math.log2(full / held));
    }
    note(`${post.METER_HOLD ?? '?'} of the stops of darkness are kept; at 0.15 of the light the picture is ${dark === Infinity ? '-' : dark.toFixed(2)} stops darker than full compensation`);
    // a heap's shadow over the figure: the sky overhead the same, only the Sun at the feet gone
    const sunny = { ...makeSkyAt(), overcast: 0.1, storm: 0, sunShade: 1 };
    const shaded = { ...makeSkyAt(), overcast: 0.1, storm: 0, sunShade: 0.22 };
    // (a case the exposure's floor does not swallow: a dim scene, where a hold of a stop shows)
    const heap = stops(target(s, -4, 0.05, 0.03, 0.6, light(sunny)), target(s, -4, 0.05, 0.03, 0.6, light(shaded)));
    // a stroke alight: 60 times sunlight over lit ground, so the frame's brightest part is the
    // stroke. It must not take the exposure with it (it took two stops off a sunlit landscape
    // with a storm on the horizon).
    const quiet = target(s, -2.3, 0.3, 0.1, 0.45, 1, 0), struck = target(s, -2.3, 24, 0.1, 0.45, 1, BREAK === 'meter-stroke' ? 0 : 3.2);
    const bolt = stops(quiet, struck);
    note(`a clear sky is within ${clear.toFixed(3)} stops of the old meter; a heap's shadow over the figure moves it ${heap.toFixed(3)} stops; a stroke alight moves it ${bolt.toFixed(3)} stops`);
    check(dark >= 1.2 && clear <= 0.05 && heap <= 0.05 && bolt <= 0.05,
      `the meter makes up only part of the darkness: ${dark === Infinity ? '-' : dark.toFixed(2)} stops held at 0.15 of the light, clear days unmoved (${clear.toFixed(3)} stops), a heap's shadow over the figure ${heap.toFixed(3)} stops, a stroke alight ${bolt.toFixed(3)} stops`);
  }
}

// ---- 7. the gust front comes before the rain ----------------------------------------------------------
{
  const t0 = T_SCENE + 1200, DT = 10;
  const cells = field.cells(t0).filter((c) => c.phase === 1 && c.rain > 3).slice(0, 4);
  const tried = [];
  for (const c of cells) {
    const now = [c.x, c.y, c.z], l = field.cells(t0 + 1200).find((x) => x.id === c.id);
    if (!l) continue;
    const u = [l.x - now[0], l.y - now[1], l.z - now[2]], ul = Math.hypot(...u) || 1;
    const ahead = [now[0] + u[0] / ul * 7000 / R, now[1] + u[1] / ul * 7000 / R, now[2] + u[2] / ul * 7000 / R];
    const al = Math.hypot(...ahead), dir = [ahead[0] / al, ahead[1] / al, ahead[2] / al];
    const lat = Math.asin(dir[2]) / D2R, lon = Math.atan2(dir[1], dir[0]) / D2R;
    const ground = Math.max(0, field.at({ lat, lon }, t0, makeSkyAt()).field.country);
    const wx = havenWeather(), rig = makeRig(atPos(R, lat, lon, ground + 2), 2);
    let best = 0, outward = 0, rainAt = null;
    for (let k = 0; k < 150; k++) {
      const t = t0 + k * DT, f = skyFrame(t, t - DT, rig);
      wx.quiet = true; wx.update(rig, DT, SUN, 266, 1, f);
      const live = f.cells.find((x) => x.id === c.id);
      if (!live) break;
      if (f.here.rain > 0.2) { rainAt = t; break; }
      if (wx.windSpeed > best) {
        best = wx.windSpeed;
        // is it blowing away from the cell? (the gust front runs out ahead of the rain)
        const fr = enu(lat, lon), away = [dir[0] - live.x, dir[1] - live.y, dir[2] - live.z];
        const ae = dot(away, fr.e), an = dot(away, fr.n), al2 = Math.hypot(ae, an) || 1;
        outward = (f.here.windE * ae + f.here.windN * an) / (al2 * Math.max(0.01, f.here.wind));
      }
    }
    if (rainAt) tried.push({ id: c.id, best, outward, lead: (rainAt - t0) / 60 });
  }
  for (const x of tried) note(`cell ${x.id}: its rain arrived after ${x.lead.toFixed(1)} min; the wind reached ${x.best.toFixed(1)} m/s before it, ${(x.outward * 100).toFixed(0)} % outward`);
  check(tried.length >= 1 && tried.every((x) => x.best >= 6 && x.outward >= 0.3),
    `a gust front runs ahead of a cell's rain: ${tried.length ? `${Math.min(...tried.map((x) => x.best)).toFixed(1)} m/s or more at each of the ${tried.length} places its rain reached` : 'no cell reached the place ahead of it'}`);
}

console.log(failed ? '\nFAILED' : '\nall ok');
process.exit(failed ? 1 : 0);
