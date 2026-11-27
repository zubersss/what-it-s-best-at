// Where to point a camera for a picture of the weather, without a browser, in seconds:
//   node scripts/storm-sites.mjs [--world haven] [--preset storm] [--storm] [--hours -2,0,2]
// For each hour it prints, from the sky's field as the game makes it (weather/sky/producer.js)
// and the world's own height function:
//   the live cells (how far off, at what bearing, how hard they rain, their base and top),
//   the nearest stroke to the ground of the next ten minutes (what ?debug=flash holds),
//   where under a cell's shaft to stand (the rain at the eye there, the ground under it),
//   where the wind is 7 m/s or more over the sea (whitecaps) and 9 m/s or more over trees,
//   and the best moment and heading for a rainbow (rainbow.js's own rule, replayed).
// Nothing here draws: it is for choosing the camera of a picture (docs/briefs/sky-D-storm.md).
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadWorld } from './lib/loadWorld.mjs';
import { Weather } from '../src/weather/weather.js';
import { makeProducer } from '../src/weather/sky/producer.js';
import { makeSkyAt } from '../src/weather/sky/format.js';
import { Steer } from '../src/weather/sky/steer.js';
import { landFromI16 } from '../src/weather/sky/stub.js';
import { fieldLayout } from '../src/weather/sky/format.js';
import { Ephemeris, dateToJD } from '../src/core/ephemeris.js';
import { SOLAR_SYSTEM } from '../src/worlds/solarSystem.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const D2R = Math.PI / 180;
const id = opt('world', 'haven');
const { world, hs } = await loadWorld(id);
const R = world.radius, START = world.scene.start;
const hours = opt('hours', '0').split(',').map(Number);

const enu = (lat, lon) => { const la = lat * D2R, lo = lon * D2R; return { e: [-Math.sin(lo), Math.cos(lo), 0], n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], u: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)] }; };
const dirOf = (lat, lon) => enu(lat, lon).u;
const posOf = (lat, lon, h) => { const u = dirOf(lat, lon); return new THREE.Vector3(u[0] * (R + h), u[1] * (R + h), u[2] * (R + h)); };
const ground = (lat, lon) => { const u = dirOf(lat, lon); return hs.height(u[0], u[1], u[2], 0); };   // (a unit direction: heightSource scales it itself)
const away = (lat, lon, bearing, dist) => {
  const la = lat * D2R, lo = lon * D2R, a = dist / R;
  const l2 = Math.asin(Math.sin(la) * Math.cos(a) + Math.cos(la) * Math.sin(a) * Math.cos(bearing * D2R));
  const o2 = lo + Math.atan2(Math.sin(bearing * D2R) * Math.sin(a) * Math.cos(la), Math.cos(a) - Math.sin(la) * Math.sin(l2));
  return [l2 / D2R, ((o2 / D2R) % 360 + 360) % 360];
};
const between = (lat0, lon0, lat1, lon1) => {
  const a = dirOf(lat0, lon0), b = dirOf(lat1, lon1), f = enu(lat0, lon0);
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e = v[0] * f.e[0] + v[1] * f.e[1] + v[2] * f.e[2], n = v[0] * f.n[0] + v[1] * f.n[1] + v[2] * f.n[2];
  const d = 2 * Math.asin(Math.min(1, 0.5 * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))) * R;
  return { dist: d, bearing: (Math.atan2(e, n) / D2R + 360) % 360 };
};

// the field, as sky/skyField.js makes it (the stub producer moved by the world's steering)
const LAND = landFromI16(readFileSync(new URL(`../public/${world.terrain.dems[0].url}`, import.meta.url)), world.terrain.dems[0].width, world.terrain.dems[0].height);
const stormAt = flag('storm') ? (() => { const [la, lo] = away(START.lat, START.lon, 45, 8000); return { lat: la, lon: lo }; })() : null;
const prod = makeProducer({
  preset: opt('preset', stormAt ? 'fair' : 'storm'), weather: world.weather, radius: R, dayHours: world.dayHours || 24,
  origin: START, layout: fieldLayout(world), land: LAND, stormAt,
});
const steer = new Steer(world.weather, R);
const T0 = steer.t(Date.parse(world.scene.dateUTC));
const at = (lat, lon, h, t) => prod.at(h == null ? { lat, lon } : { lat, lon, h }, t, makeSkyAt());

console.log(`${id}: the opening place ${START.lat.toFixed(4)}, ${START.lon.toFixed(4)}, the ground ${Math.round(ground(START.lat, START.lon))} m; preset ${prod.preset}${stormAt ? ' + a still cell 8 km north-east' : ''}`);

for (const hr of hours) {
  const t = T0 + hr * 3600;
  console.log(`\n=== ${hr >= 0 ? '+' : ''}${hr} h (weather clock ${Math.round(t)} s) ===`);
  const here = at(START.lat, START.lon, null, t);
  console.log(`  at the opening place: wind ${here.wind.toFixed(1)} m/s, rain ${here.rain.toFixed(2)} mm/h, overcast ${here.overcast.toFixed(2)}, storm ${here.storm.toFixed(2)}, base ${Math.round(here.base)} m, top ${Math.round(here.top)} m`);
  // the cells
  const cells = prod.cells(t).map((c) => ({ ...c, ...between(START.lat, START.lon, c.lat, c.lon) })).sort((a, b) => a.dist - b.dist);
  for (const c of cells.slice(0, 5)) {
    console.log(`  cell ${c.id}: ${(c.dist / 1000).toFixed(1)} km at ${c.bearing.toFixed(0)} deg, phase ${c.phase}, rain ${c.rain.toFixed(0)} mm/h, radius ${Math.round(c.radius)} m, core ${Math.round(c.core)} m, base ${Math.round(c.base)} m, top ${Math.round(c.top)} m`);
    // where to stand in its shaft, and 2 km out from it
    for (const k of [0, 2000]) {
      const [la, lo] = k ? away(c.lat, c.lon, c.bearing + 180, k) : [c.lat, c.lon];
      const g = ground(la, lo), a2 = at(la, lo, g + 60, t);
      const w = between(START.lat, START.lon, la, lo);
      console.log(`      ${k ? `${k / 1000} km back from it` : 'under its middle'}: ${la.toFixed(4)}, ${lo.toFixed(4)} (${(w.dist / 1000).toFixed(1)} km at ${w.bearing.toFixed(0)} deg), the ground ${Math.round(g)} m, rain at the eye ${a2.rain.toFixed(1)} mm/h, storm ${a2.storm.toFixed(2)}, overcast ${a2.overcast.toFixed(2)}, wind ${a2.wind.toFixed(1)} m/s`);
    }
  }
  // the nearest stroke to the ground of the next ten minutes (what ?debug=flash holds)
  let best = null;
  for (const s of prod.strikes(t, t + 600)) {
    const la = Math.asin(s.z) / D2R, lo = ((Math.atan2(s.y, s.x) / D2R) % 360 + 360) % 360;
    const w = between(START.lat, START.lon, la, lo), k = w.dist + (s.ground ? 0 : 1e6);
    if (!best || k < best.k) best = { ...s, ...w, k, lat: la, lon: lo };
  }
  if (best) console.log(`  the held stroke: ${(best.dist / 1000).toFixed(1)} km at ${best.bearing.toFixed(0)} deg, ${best.ground ? 'to the ground' : 'in cloud'}, ${Math.round(best.h0)} to ${Math.round(best.h1)} m, power ${best.power.toFixed(2)}`);
  else console.log('  no stroke in the next ten minutes');
  // wind over the sea and over the land round about
  let sea = null, land = null;
  for (let b = 0; b < 360; b += 15) for (const d of [20000, 60000, 120000, 200000]) {
    const [la, lo] = away(START.lat, START.lon, b, d), g = ground(la, lo), a2 = at(la, lo, Math.max(g, 0) + 60, t);
    const row = { la, lo, b, d, g, w: a2.wind };
    if (g <= -5) { if (!sea || row.w > sea.w) sea = row; } else if (!land || row.w > land.w) land = row;
  }
  if (sea) console.log(`  the windiest sea: ${sea.w.toFixed(1)} m/s at ${sea.la.toFixed(4)}, ${sea.lo.toFixed(4)} (${(sea.d / 1000).toFixed(0)} km at ${sea.b} deg, the bed ${Math.round(sea.g)} m)`);
  if (land) console.log(`  the windiest land: ${land.w.toFixed(1)} m/s at ${land.la.toFixed(4)}, ${land.lo.toFixed(4)} (${(land.d / 1000).toFixed(0)} km at ${land.b} deg, the ground ${Math.round(land.g)} m)`);
}

// a rainbow: rainbow.js's own rule replayed over the day at the opening place and a few places round it
{
  const wx = new Weather(); wx.setWorld(world);
  const EPH = new Ephemeris(SOLAR_SYSTEM, world.body), JD0 = dateToJD(Date.parse(world.scene.dateUTC));
  const field = { on: true, at: (p, t2, out) => prod.at(p, t2, out), cells: (t2) => prod.cells(t2), strikes: () => [] };
  let best = null;
  const sunDir = new THREE.Vector3();
  for (let hr = -8; hr <= 8; hr += 0.25) {
    const t = T0 + hr * 3600;
    // the Sun as the game has it at that hour (the world's own ephemeris)
    EPH.update(JD0 + hr / 24, []);
    const eph = EPH.sunDir;
    for (let b = 0; b < 360; b += 30) for (const d of [0, 15000, 40000]) {
      const [la, lo] = d ? away(START.lat, START.lon, b, d) : [START.lat, START.lon];
      const g = ground(la, lo);
      if (g < 0) continue;
      const rig = { pos: posOf(la, lo, g + 2), agl: 2, mode: 'hero', onFoot: false, throttle: 0 };
      sunDir.set(eph[0], eph[1], eph[2]);
      wx.update(rig, 1 / 30, sunDir, 266, 1, { t, tPrev: t - 1 / 30, noiseT: t, rate: 1, paused: false, steer, rise: [0, 0, 1], field, here: field.at([rig.pos.x, rig.pos.y, rig.pos.z], t, makeSkyAt()), cells: [], strikes: [], world, R, noClouds: false, shotMode: true });
      wx.quiet = true;
      const f = enu(la, lo), su = sunDir.x * f.u[0] + sunDir.y * f.u[1] + sunDir.z * f.u[2];
      const se = sunDir.x * f.e[0] + sunDir.y * f.e[1] + sunDir.z * f.e[2], sn = sunDir.x * f.n[0] + sunDir.y * f.n[1] + sunDir.z * f.n[2];
      const low = su > 0.02 && su < 0.66 ? Math.min(1, (0.66 - su) / 0.15) * Math.min(1, (su - 0.02) / 0.05) : 0;
      if (low <= 0) continue;
      const h = Math.hypot(se, sn) || 1, cl = Math.max(0.2, Math.cos(la * D2R)), m = wx.mPerDeg;
      let rain = 0;
      for (const dd of [2500, 6000, 11000, 18000]) rain = Math.max(rain, wx.rainNear(la - sn / h * dd / m, lo - se / h * dd / (m * cl)));
      const want = Math.min(1, rain / 1.5) * low * Math.max(0, (wx.sunShade - 0.35) / 0.65);
      if (want > 0 && (!best || want > best.want)) best = { want, hr, la, lo, b, d, rain, sun: Math.asin(su) / D2R, heading: (Math.atan2(-se, -sn) / D2R + 360) % 360 };
    }
  }
  console.log('');
  if (best) console.log(`  a rainbow: ${best.want.toFixed(2)} at ${best.hr >= 0 ? '+' : ''}${best.hr} h, ${best.la.toFixed(4)}, ${best.lo.toFixed(4)} (${(best.d / 1000).toFixed(0)} km at ${best.b} deg), rain ${best.rain.toFixed(1)} mm/h away from the Sun (${best.sun.toFixed(0)} deg up), looking at ${best.heading.toFixed(0)} deg`);
  else console.log('  no rainbow in the day at these places');
}
