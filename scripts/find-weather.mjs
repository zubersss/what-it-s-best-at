// Choosing Haven's weather: the seed, the scene days, and the numbers the model is tuned by
// (docs/briefs/sky-A-model.md, job 4). No browser: it runs the model (src/weather/sky/) in Node.
//
//   node scripts/find-weather.mjs --probe [--lat .. --lon ..] [--day 2024-09-22]
//        the chain at a place, hour by hour: the wind, how moist, how unstable, the lift, each
//        kind's cover, the base, the rain, the fog's top
//   node scripts/find-weather.mjs --bands [--days 20] [--width 256]
//        what the checks measure: cover high against low, windward against the lee, the
//        correlation with the height of the land, heaps at 15 h against 07 h, fog at 06 h
//   node scripts/find-weather.mjs --days 90 [--lat .. --lon ..]
//        day by day at a place: the wind by layer, hours of rain, cover, the storms within 40 km
//   node scripts/find-weather.mjs --seeds 1,2,3,4,5,6,7,8
//        each seed scored on the three scene days (22 September mist then heaps then a storm in
//        view of the ledge, 23 September a front, 24 September wind and lenses on the Crown),
//        best first; the winner is the seed for src/worlds/haven.js
//   node scripts/find-weather.mjs --scene [--seed 1]
//        the chosen days hour by hour, and the bookmarks' and cost views' hours to paste
//
// Everything is a function of the world file's weather block, so what this prints is what the
// game shows. Exits non-zero when a mode is asked for that cannot be answered.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldLayout } from '../src/weather/sky/format.js';
import { makeProducer, localHour, tForHour } from '../src/weather/sky/producer.js';
import { readWxLand, makeWxLand, WxLand, dirOf, angleBetween, offsetLatLon } from '../src/weather/sky/land.js';
import { Steer } from '../src/weather/sky/steer.js';
import haven from '../src/worlds/haven.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && !String(process.argv[i + 1] ?? '').startsWith('--') ? process.argv[i + 1] : (i > 0 ? true : d); };
const flag = (k) => process.argv.includes('--' + k);
const num = (k, d) => { const v = opt(k, null); return v === null || v === true ? d : +v; };

const DEM = (() => { const b = fs.readFileSync(path.join(root, 'public/data/haven_dem_4096.i16')); return { data: new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1), width: 4096, height: 2048 }; })();
const PLANES = (() => {
  const f = path.join(root, 'public/data/haven_wxland_1024.u8'), pf = path.join(root, 'public/data/haven_peaks.json');
  if (fs.existsSync(f)) return readWxLand(fs.readFileSync(f), fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')).peaks : null);
  return makeWxLand({ dem: DEM, width: 1024, radius: haven.radius });
})();
const LAND = new WxLand({ ...PLANES, radius: haven.radius });
const START = haven.scene.start, R = haven.radius;
const CROWN = haven.places.find((p) => p.id === 'crown');
const SKYMERE = haven.places.find((p) => p.id === 'skymere');

function producer(width = 256, over = {}) {
  const weather = { ...haven.weather, ...over };
  const layout = fieldLayout({ weather: { ...weather, field: { width } } });
  const opts = { weather, radius: R, dayHours: haven.dayHours || 24, origin: START, layout, wxland: PLANES, year: haven.year || null };
  return { p: makeProducer(opts), opts, steer: new Steer(weather, R) };
}
const fx = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : '-');
const ground = (lat, lon) => LAND.atLatLon('g', lat, lon);

// ---- the chain at a place, hour by hour -------------------------------------------------------

function probe() {
  const width = num('width', 256), { p, opts, steer } = producer(width);
  const lat = num('lat', START.lat), lon = num('lon', START.lon);
  const date = opt('day', '2024-09-22'), day = steer.dayOfDate(date);
  const d = steer.day(day);
  console.log(`${date} at ${fx(lat, 3)}, ${fx(lon, 3)} (the ground ${Math.round(ground(lat, lon))} m); the day's low wind ${fx(d.wind06, 1)} / ${fx(d.wind18, 1)} m/s${d.pinned ? ' (pinned)' : ''}`);
  console.log(' h   wind  hum  inst  lift | heap sheet  mid high |  base  top | rain  fog  wet  temp  cells<40km');
  for (let hour = 0; hour < 24; hour++) {
    const t = tForHour(opts, steer, day, hour, lon);
    const a = p.at({ lat, lon }, t), c = p.climate ? p.climate(lat, lon, t) : {};
    const near = p.cells(t).filter((k) => angleBetween([k.x, k.y, k.z], dirOf(lat, lon)) * R < 40000);
    console.log(`${String(hour).padStart(2)}  ${fx(a.wind, 1).padStart(5)} ${fx(c.hum).padStart(4)} ${fx(c.instab).padStart(5)} ${fx(c.lift).padStart(5)} | ${fx(a.field.heap).padStart(4)} ${fx(a.field.sheet).padStart(5)} ${fx(a.field.mid).padStart(4)} ${fx(a.field.high).padStart(4)} | ${String(Math.round(a.base)).padStart(5)} ${String(Math.round(a.top)).padStart(5)} | ${fx(a.rain, 1).padStart(4)} ${String(Math.round(a.field.fogTop)).padStart(4)} ${fx(a.wet).padStart(4)} ${fx(a.temp, 1).padStart(5)}  ${near.length ? near.map((k) => `${Math.round(angleBetween([k.x, k.y, k.z], dirOf(lat, lon)) * R / 1000)} km${k.flash > 0 ? ' (strikes)' : ''}`).join(', ') : ''}`);
  }
}

// ---- what the checks measure ------------------------------------------------------------------

function bands() {
  const width = num('width', 256), days = num('days', 12), { p, opts, steer } = producer(width);
  const W = width, H = width >> 1, N = W * H;
  const land = new Float32Array(N), g = new Float32Array(N), gE = new Float32Array(N), gN = new Float32Array(N);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const lat = 90 - (j + 0.5) * 180 / H, lon = (i + 0.5) * 360 / W, k = j * W + i;
    land[k] = LAND.atLatLon('land', lat, lon); g[k] = LAND.atLatLon('g', lat, lon);
    gE[k] = LAND.atLatLon('gE', lat, lon); gN[k] = LAND.atLatLon('gN', lat, lon);
  }
  const day0 = steer.dayOfDate('2024-09-22');
  const sums = { high: 0, low: 0, wind: 0, lee: 0, n: 0, h15: 0, h07: 0, f06: 0, f14: 0, cover: 0, sheet: 0, mid: 0, hi: 0 };
  for (let d = 0; d < days; d++) {
    const day = day0 + d * 4;
    for (const hour of [15, 7, 6, 14]) {
      const t = tForHour(opts, steer, day, hour), s = p.snapshot(t);
      let hi = 0, hin = 0, lo = 0, lon2 = 0, wi = 0, win = 0, le = 0, len = 0, cov = 0, sh = 0, md = 0, hgh = 0, nn = 0, fog = 0, fogn = 0;
      for (let j = 1; j < H - 1; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (land[k] < 0.7) continue;
        const lon3 = (i + 0.5) * 360 / W, lat = 90 - (j + 0.5) * 180 / H;
        const h = localHour(opts, lon3, t);
        // only the band of longitudes within an hour and a half of the hour asked about
        if (Math.abs(((h - hour + 36) % 24) - 12) > 1.5) continue;
        const heap = s.A[k * 4] / 255, sheet = s.A[k * 4 + 1] / 255;
        cov += heap; sh += sheet; md += s.B[k * 4] / 255; hgh += s.B[k * 4 + 1] / 255; nn++;
        if (g[k] > 2000) { hi += heap; hin++; } else if (g[k] < 500) { lo += heap; lon2++; }
        const v = p.climate(lat, lon3, t), lift = v.windE * gE[k] + v.windN * gN[k];
        if (lift > 0.35) { wi += heap; win++; } else if (lift < -0.35) { le += heap; len++; }
        if (i % 2 === 0 && j % 2 === 0) { fog += s.C[((j >> 1) * (W >> 1) + (i >> 1)) * 2] / 255 * 255 * 16; fogn++; }
      }
      if (hour === 15) { sums.high += hin ? hi / hin : 0; sums.low += lon2 ? lo / lon2 : 0; sums.wind += win ? wi / win : 0; sums.lee += len ? le / len : 0; sums.h15 += nn ? cov / nn : 0; sums.cover += nn ? cov / nn : 0; sums.sheet += nn ? sh / nn : 0; sums.mid += nn ? md / nn : 0; sums.hi += nn ? hgh / nn : 0; sums.n++; }
      if (hour === 7) sums.h07 += nn ? cov / nn : 0;
      if (hour === 6) sums.f06 += fogn ? fog / fogn : 0;
      if (hour === 14) sums.f14 += fogn ? fog / fogn : 0;
    }
  }
  const n = Math.max(1, sums.n);
  console.log(`over ${days} days, in the hour's own band of longitudes:`);
  console.log(`  cover at 15 h: over 2 000 m ${fx(sums.high / n, 3)}, under 500 m ${fx(sums.low / n, 3)}  (${fx(sums.high / Math.max(1e-6, sums.low))} times; 2.5 wanted)`);
  console.log(`  windward ${fx(sums.wind / n, 3)}, lee ${fx(sums.lee / n, 3)}  (${fx(sums.wind / Math.max(1e-6, sums.lee))} times; 3 wanted)`);
  console.log(`  heap cover at 15 h ${fx(sums.h15 / n, 3)}, at 07 h ${fx(sums.h07 / n, 3)}  (${fx(sums.h15 / Math.max(1e-6, sums.h07))} times; 3 wanted)`);
  console.log(`  the fog's mean top at 06 h ${fx(sums.f06 / n, 1)} m, at 14 h ${fx(sums.f14 / n, 1)} m  (${fx(sums.f06 / Math.max(1e-6, sums.f14))} times; 3 wanted)`);
  console.log(`  the mean sheet ${fx(sums.sheet / n, 3)}, mid ${fx(sums.mid / n, 3)}, high ${fx(sums.hi / n, 3)}`);
  // the correlation of a day's mean cover with the height of the land
  const m = new Float64Array(N);
  for (let k2 = 0; k2 < 12; k2++) {
    const s = p.snapshot(tForHour(opts, steer, day0 + 3, 0) + k2 * 2 * 3600);
    for (let q = 0; q < N; q++) m[q] += Math.max(s.A[q * 4], s.A[q * 4 + 1]) / 255 / 12;
  }
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, w = 0;
  for (let q = 0; q < N; q++) { if (land[q] < 0.7) continue; const x = g[q], y = m[q]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; w++; }
  const r = (w * sxy - sx * sy) / Math.sqrt(Math.max(1e-9, (w * sxx - sx * sx) * (w * syy - sy * sy)));
  console.log(`  the day's mean cover against the height of the land: ${fx(r, 3)} over ${w} land texels (0.35 wanted; the static map 0.03)`);
}

// ---- day by day at a place -------------------------------------------------------------------

function daysAt() {
  const width = num('width', 256), days = num('days', 90), { p, opts, steer } = producer(width);
  const lat = num('lat', START.lat), lon = num('lon', START.lon);
  const day0 = steer.dayOfDate('2024-09-22');
  console.log(`day by day at ${fx(lat, 3)}, ${fx(lon, 3)}:`);
  console.log('date        low  mid high | wind  gust | rain h  mm | cover | fog m | storms<40km');
  let calm = 0, windy = 0, wetDays = 0, stormDays = 0;
  for (let d = 0; d < days; d++) {
    const day = day0 + d;
    let wind = 0, gust = 0, rainH = 0, rainMm = 0, cover = 0, fog = 0, storms = 0;
    for (let hour = 0; hour < 24; hour++) {
      const t = tForHour(opts, steer, day, hour, lon), a = p.at({ lat, lon }, t);
      wind += a.wind / 24; gust = Math.max(gust, a.wind * a.gust); rainMm += a.rain;
      if (a.rain > 0.1) rainH++;
      cover += Math.max(a.field.heap, a.field.sheet) / 24; fog = Math.max(fog, a.field.fogTop);
      if (hour >= 12 && hour <= 20) storms = Math.max(storms, p.cells(t).filter((k) => angleBetween([k.x, k.y, k.z], dirOf(lat, lon)) * R < 40000).length);
    }
    const lowS = Math.abs(steer.speed('low', tForHour(opts, steer, day, 12)));
    if (wind < 3) calm++;
    if (wind > 10) windy++;
    if (rainH >= 1) wetDays++;
    if (storms > 0) stormDays++;
    if (days <= 120) console.log(`${steer.dateOfDay(day)}  ${fx(lowS, 1).padStart(4)} ${fx(Math.abs(steer.speed('mid', tForHour(opts, steer, day, 12))), 1).padStart(4)} ${fx(Math.abs(steer.speed('high', tForHour(opts, steer, day, 12))), 1).padStart(4)} | ${fx(wind, 1).padStart(4)} ${fx(gust, 1).padStart(5)} | ${String(rainH).padStart(6)} ${fx(rainMm, 1).padStart(5)} | ${fx(cover).padStart(5)} | ${String(Math.round(fog)).padStart(5)} | ${storms}`);
  }
  console.log(`over ${days} days: calm (under 3 m/s) ${calm} (${Math.round(100 * calm / days)} %; 15 wanted), gales (over 10) ${windy} (${Math.round(100 * windy / days)} %; 10 wanted), an hour or more of rain ${wetDays} (${Math.round(100 * wetDays / days)} %; 25 to 55 wanted), a storm within 40 km ${stormDays} (${Math.round(100 * stormDays / days)} %)`);
}

// ---- scoring the seeds ------------------------------------------------------------------------

// What the three scene days must hold (docs/briefs/sky-A-model.md, job 4).
function scoreSeed(seed, width = 256) {
  const { p, opts, steer } = producer(width, { seed });
  const d22 = steer.dayOfDate('2024-09-22'), d23 = steer.dayOfDate('2024-09-23'), d24 = steer.dayOfDate('2024-09-24');
  const ledgeG = ground(START.lat, START.lon);
  const out = { seed, score: 0, parts: {} };
  // 22 September, 07-09 h: mist in the low ground round the ledge, and none on it
  let mist = 0, mistBad = 0;
  for (const hour of [7, 8, 9]) {
    const t = tForHour(opts, steer, d22, hour);
    for (let b = 0; b < 12; b++) for (const dist of [3000, 6000, 10000]) {
      const q = offsetLatLon(START.lat, START.lon, b * Math.PI / 6, dist, R);
      const top = p.at({ lat: q.lat, lon: q.lon }, t).field.fogTop;
      if (top > 0) mist = Math.max(mist, top - LAND.atLatLon('gmin', q.lat, q.lon));
    }
    for (let b = 0; b < 16; b++) for (const dist of [400, 1200, 2000]) {
      const q = offsetLatLon(START.lat, START.lon, b * Math.PI / 8, dist, R);
      if (p.at({ lat: q.lat, lon: q.lon }, t).field.fogTop > ledgeG - 300) mistBad++;
    }
  }
  out.parts.mist = mist; out.parts.mistBad = mistBad;
  // 22 September, noon: heaps over the high ground in view
  let heaps = 0, hn = 0;
  {
    const t = tForHour(opts, steer, d22, 12);
    for (let b = 0; b < 24; b++) {
      const q = offsetLatLon(START.lat, START.lon, b * Math.PI / 12, 30000, R);
      if (LAND.atLatLon('g', q.lat, q.lon) < 1800) continue;
      heaps += p.at({ lat: q.lat, lon: q.lon }, t).field.heap; hn++;
    }
  }
  out.parts.heaps = hn ? heaps / hn : 0;
  // 22 September, 14-18 h: a storm that can strike, in view of the ledge and to the west
  let best = null;
  for (let hour = 14; hour <= 18; hour += 0.25) {
    const t = tForHour(opts, steer, d22, hour);
    for (const k of p.cells(t)) {
      const dist = angleBetween([k.x, k.y, k.z], dirOf(START.lat, START.lon)) * R;
      if (dist > 80000 || k.flash <= 0) continue;
      if (!best || dist < best.dist) best = { dist, hour, lat: k.lat, lon: k.lon, top: k.top };
    }
  }
  out.parts.storm = best;
  // 23 September: a front over the opening place
  // (the front is wanted where the owner can see it: between dawn and dusk)
  let front = 0, frontHour = 0;
  for (let hour = 6; hour <= 20; hour += 0.5) {
    const t = tForHour(opts, steer, d23, hour), a = p.at(START, t);
    const v = Math.min(a.field.sheet, a.field.mid + a.field.high) * (a.rain > 0.2 ? 1 : 0.6);
    if (v > front) { front = v; frontHour = hour; }
  }
  out.parts.front = front; out.parts.frontHour = frontHour;
  // 24 September: wind, and lenses or a cap on the Crown
  const windD = [0, 6, 12, 18].map((h) => Math.abs(steer.speed('mid', tForHour(opts, steer, d24, h))));
  const tC = tForHour(opts, steer, d24, 13);
  const lenses = (p.lenses ? p.lenses(tC) : []).filter((l) => angleBetween([l.x, l.y, l.z], dirOf(CROWN.lat, CROWN.lon)) * R < 60000);
  out.parts.midWind = windD.reduce((a, b) => a + b, 0) / windD.length;
  out.parts.lenses = lenses.length;
  out.parts.cap = p.at({ lat: CROWN.lat, lon: CROWN.lon, h: 4314 }, tC).field.heap;
  // neither the ledge nor Skymere in cloud at the bookmarks' hours
  let inCloud = 0;
  for (const [place, h] of [[START, ledgeG], [SKYMERE, ground(SKYMERE.lat, SKYMERE.lon)]]) {
    for (const [day, hour] of [[d22, 8], [d22, 12], [d22, 16], [d22, 17.6], [d23, 8], [d24, 13]]) {
      const a = p.at({ lat: place.lat, lon: place.lon, h: h + 2 }, tForHour(opts, steer, day, hour));
      if (a.fog > 0.002 || (h > a.base && h < a.top)) inCloud++;
    }
  }
  out.parts.inCloud = inCloud;
  out.score = (mist > 40 ? 2 : 0) + (mistBad === 0 ? 2 : 0) + Math.min(2, out.parts.heaps * 4)
    + (best ? 3 - Math.min(2, best.dist / 40000) : 0) + Math.min(2, front * 8)
    + (out.parts.midWind > 11 ? 1 : 0) + (out.parts.lenses > 0 ? 1 : 0) + (out.parts.cap > 0.3 ? 0.5 : 0)
    - 2 * inCloud;
  return out;
}

function seeds() {
  const list = String(opt('seeds', '1,2,3,4,5,6,7,8')).split(',').map(Number);
  const width = num('width', 256), out = [];
  for (const seed of list) {
    const r = scoreSeed(seed, width);
    out.push(r);
    const s = r.parts.storm;
    console.log(`seed ${String(seed).padStart(3)}  score ${fx(r.score)}  mist ${Math.round(r.parts.mist)} m (bad ${r.parts.mistBad})  heaps ${fx(r.parts.heaps)}  storm ${s ? `${Math.round(s.dist / 1000)} km at ${s.hour} h` : 'none'}  front ${fx(r.parts.front)} at ${r.parts.frontHour} h  mid wind ${fx(r.parts.midWind, 1)}  lenses ${r.parts.lenses}  cap ${fx(r.parts.cap)}  in cloud ${r.parts.inCloud}`);
  }
  out.sort((a, b) => b.score - a.score);
  console.log(`\nbest: seed ${out[0].seed} (score ${fx(out[0].score)})`);
}

// ---- the chosen scene ------------------------------------------------------------------------

function scene() {
  const seed = num('seed', haven.weather.seed), width = num('width', 512);
  const r = scoreSeed(seed, width);
  const s = r.parts.storm;
  console.log(`seed ${seed}: score ${fx(r.score)}`);
  console.log(`  22 September: mist ${Math.round(r.parts.mist)} m deep in the low ground (none within 2 km of the ledge: ${r.parts.mistBad === 0 ? 'yes' : 'NO'}), heaps ${fx(r.parts.heaps)} over the ranges at noon`);
  console.log(`  22 September afternoon: ${s ? `a storm ${Math.round(s.dist / 1000)} km off at ${s.hour} h local, its top ${Math.round(s.top)} m, at ${fx(s.lat, 3)}, ${fx(s.lon, 3)}` : 'NO storm in view'}`);
  console.log(`  23 September: the front strongest at ${r.parts.frontHour} h (${fx(r.parts.front)})`);
  console.log(`  24 September: the mid wind ${fx(r.parts.midWind, 1)} m/s, ${r.parts.lenses} lenses by the Crown, a cap of ${fx(r.parts.cap)} on it`);
  console.log(`  the ledge and Skymere in cloud at ${r.parts.inCloud} of 12 bookmark hours`);
  if (!s) process.exitCode = 1;
  // the bookmarks' hours, as text for the world file
  const { opts, steer } = producer(64, { seed });
  const d22 = steer.dayOfDate('2024-09-22');
  const sceneT = Date.parse(haven.scene.dateUTC) / 1000 - steer.epochSec;      // the clock the scene opens at
  const hoursFrom = (day, hour) => (tForHour(opts, steer, day, hour) - sceneT) / 3600;
  const lines = [
    ['Morning mist', 8, d22], ['Afternoon storm', s ? s.hour : 16, d22],
    ['A front coming', r.parts.frontHour, steer.dayOfDate('2024-09-23')],
    ['Wind on the Crown', 13, steer.dayOfDate('2024-09-24')],
  ];
  console.log('\nfor src/worlds/haven.js (timeOffsetHours from the scene\'s own moment):');
  for (const [label, hour, day] of lines) console.log(`  ${label}: timeOffsetHours: ${fx(hoursFrom(day, hour), 2)}   (${steer.dateOfDay(day)} ${fx(hour, 1)} h local)`);
  for (const [label, hour, day] of [['under the storm', s ? s.hour : 16, d22], ['a storm from afar', s ? s.hour : 16, d22], ['in the morning mist', 7.5, d22]]) {
    console.log(`  cost view "${label}": timeOffsetHours: ${fx(hoursFrom(day, hour), 2)}`);
  }
}

if (flag('probe')) probe();
else if (flag('bands')) bands();
else if (flag('seeds')) seeds();
else if (flag('scene')) scene();
else if (opt('days', null) !== null) daysAt();
else { console.error('find-weather: say what to do (--probe, --bands, --days N, --seeds a,b,c, --scene)'); process.exit(1); }
