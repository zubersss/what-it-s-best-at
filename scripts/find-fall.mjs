// A waterfall to look at, and where to look at it from (seconds, no browser).
//   node scripts/find-fall.mjs --lat -48.55 --lon 49.06 [--pick 0] [--back 120] [--up 25]
// Lists the largest falls of the finest mosaic round the place (drop x width); for the one
// picked, works the rivers out again with the camera where it would stand (the rings go
// with the traveller), finds the fall again, and prints the picture's query: the camera
// down stream of the fall, over the water, looking back up at it.
import { ringsAt, havenSource, dirOf, RAD } from './lib/havenWater.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const fallsOf = (m) => { const f = m.packed.falls, rows = []; for (let i = 0; i < f.length; i += 6) rows.push({ lat: m.g.latOf(f[i + 1] - 0.5), lon: m.g.lonOf(f[i] - 0.5), top: f[i + 2], drop: f[i + 3], half: f[i + 4], head: ((90 - f[i + 5] * RAD) % 360 + 360) % 360 }); return rows.sort((a, b) => b.drop * Math.sqrt(b.half) - a.drop * Math.sqrt(a.half)); };
const lat = +arg('lat', -48.54992), lon = +arg('lon', 49.05567), pick = +arg('pick', 0), back = +arg('back', 120), upBy = +arg('up', 25);
const first = fallsOf(ringsAt(lat, lon)[2]);
console.log(`${first.length} falls in the finest mosaic; the largest:`);
first.slice(0, 12).forEach((q, k) => console.log(`${String(k).padStart(2)}: lat ${q.lat.toFixed(5)} lon ${q.lon.toFixed(5)}, lip at ${q.top.toFixed(0)} m, drops ${q.drop.toFixed(1)} m, river ${(2 * q.half).toFixed(0)} m wide, runs toward ${q.head.toFixed(0)}`));
const f0 = first[pick]; if (!f0) process.exit(1);
// the camera: `back` metres down stream of the lip. A degree of latitude here:
const R = 250000, mLat = R / RAD, place = (q, east, north) => [q.lat + north / mLat, q.lon + east / (mLat * Math.cos(q.lat / RAD))];
let cam = place(f0, Math.sin(f0.head / RAD) * back, Math.cos(f0.head / RAD) * back), f = f0;
for (let pass = 0; pass < 2; pass++) {
  const rings = ringsAt(cam[0], cam[1]), again = fallsOf(rings[2]).map((q) => ({ q, d: Math.hypot((q.lat - f0.lat) * mLat, (q.lon - f0.lon) * mLat * Math.cos(f0.lat / RAD)) })).sort((a, b) => a.d - b.d)[0];
  if (!again || again.d > 150) { console.log('with the camera there the fall is not found again' + (again ? ` (the nearest is ${again.d.toFixed(0)} m off)` : '')); process.exit(1); }
  f = again.q; cam = place(f, Math.sin(f.head / RAD) * back, Math.cos(f.head / RAD) * back);
  if (pass === 1) {
    const hs = havenSource(rings), d = dirOf(cam[0], cam[1]), ground = hs.height(d[0], d[1], d[2], 1), alt = Math.max(ground + 6, f.top - f.drop + upBy);
    const dl = dirOf(f.lat, f.lon); hs.height(dl[0], dl[1], dl[2], 1);
    console.log(`the fall, with the camera there: lat ${f.lat.toFixed(5)} lon ${f.lon.toFixed(5)}, lip at ${f.top.toFixed(1)} m, drops ${f.drop.toFixed(1)} m, river ${(2 * f.half).toFixed(0)} m wide (water at the lip ${hs.waterDepth.toFixed(2)} m deep, running at ${Math.hypot(hs.flowE, hs.flowN).toFixed(1)} m/s)`);
    console.log(`the ground under the camera ${ground.toFixed(1)} m; camera at ${alt.toFixed(0)} m`);
    console.log(`query: lat=${cam[0].toFixed(5)}&lon=${cam[1].toFixed(5)}&alt=${alt.toFixed(0)}&heading=${((f.head + 180) % 360).toFixed(0)}&pitch=${(-Math.atan2(alt - (f.top - f.drop / 2), back) * RAD).toFixed(0)}`);
  }
}
