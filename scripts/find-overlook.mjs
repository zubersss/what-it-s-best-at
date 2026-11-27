// A place to stand with the view open in front: level underfoot, the ground falling away
// at once in the direction faced (so that nothing growing down the slope stands in the
// way), and low ground or water far below. Searches round a place with the world's own
// height function (no browser).
//   node scripts/find-overlook.mjs --world haven --lat -48.472 --lon 48.823 --heading 157 [--reach 3000] [--step 30] [--swing 50] [--below 1450] [--count 6]
// (--below: no higher than this, to stay under the tree line; --swing: degrees either side of the heading;
// --sky: for a view of the weather: the far skyline as low as can be, where the default wants mountains in it)
// Prints the best few; look at one with scripts/peek.mjs before taking it.
import { loadWorld } from './lib/loadWorld.mjs';
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const { world, hs } = await loadWorld(opt('world', 'haven'));
const R = world.radius, RAD = Math.PI / 180, lat0 = +opt('lat', world.scene.start.lat), lon0 = +opt('lon', world.scene.start.lon);
const reach = +opt('reach', 3000), step = +opt('step', 30), swing = +opt('swing', 50);
const H0 = +opt('heading', world.scene.start.heading), MAXH = +opt('below', 1e9);
const SKY = process.argv.includes('--sky');
const dirOf = (lat, lon) => { const cl = Math.cos(lat * RAD); return [cl * Math.cos(lon * RAD), cl * Math.sin(lon * RAD), Math.sin(lat * RAD)]; };
const mLat = R * RAD, mLon = R * RAD * Math.cos(lat0 * RAD);
const hAt = (e, n, wl = 8) => { const d = dirOf(lat0 + n / mLat, lon0 + e / mLon); const h = hs.height(d[0], d[1], d[2], wl); return hs.waterDepth > 0 ? -1e6 - 0 * h : h; };
const found = [];
for (let n = -reach; n <= reach; n += step) for (let e = -reach; e <= reach; e += step) {
  const h = hAt(e, n); if (h < -1e5 || h > MAXH) continue;
  // level underfoot
  const s = Math.hypot(hAt(e + 6, n) - hAt(e - 6, n), hAt(e, n + 6) - hAt(e, n - 6)) / 12; if (s > 0.16) continue;
  let best = null;
  for (let a = H0 - swing; a <= H0 + swing; a += 10) {
    const sa = Math.sin(a * RAD), ca = Math.cos(a * RAD);
    // the ground ahead: it must fall away at once, and nothing ahead may rise into the line of sight
    // (top: the skyline far ahead, from 3 km on: mountains beyond the low ground should stand in it)
    let ok = true, top = -9, drop60 = 0, drop300 = 0, water = false;
    for (const r of [20, 40, 60, 100, 160, 240, 300, 450, 700, 1000, 1500, 2200, 3200, 4500, 6500, 9000, 12000, 16000, 22000, 30000]) {
      const g = hAt(e + r * sa, n + r * ca, Math.max(8, r / 20)), wet = g < -1e5;
      if (wet) { water = true; continue; }
      const el = (g - (h + 1.7)) / r - r / (2 * R); if (r >= 3000 && el > top) top = el;          // (less the world's own curve)
      if (r === 60) drop60 = h - g; if (r === 300) drop300 = h - g;
      if (r <= 300 && el > -0.12) { ok = false; break; }
      if (r > 300 && r < 3000 && el > -0.02) { ok = false; break; }
    }
    if (!ok || drop60 < 10 || drop300 < 70) continue;
    // (--sky: a view of the weather, not of mountains: the lower the far skyline the better)
    const peaks = SKY ? -Math.max(top, 0) * 4000 : top < 0.005 ? -80 : Math.min(top, 0.09) * 1800;
    const score = Math.min(drop300, 220) + peaks + (water ? 90 : 0) - 0.6 * Math.abs(a - H0);
    if (!best || score > best.score) best = { score, a, drop60, drop300, top, water };
  }
  if (best) found.push({ e, n, h, s, ...best });
}
found.sort((a, b) => b.score - a.score);
const out = [];
for (const f of found) { if (out.every((o) => Math.hypot(o.e - f.e, o.n - f.n) > 250)) out.push(f); if (out.length >= +opt('count', 6)) break; }
for (const f of out) console.log(`lat ${(lat0 + f.n / mLat).toFixed(5)}  lon ${(lon0 + f.e / mLon).toFixed(5)}  ground ${f.h.toFixed(0)} m  facing ${f.a}: falls ${f.drop60.toFixed(0)} m in 60 m, ${f.drop300.toFixed(0)} m in 300 m; the far skyline ${(Math.atan(f.top) / RAD).toFixed(1)} degrees up${f.water ? '; water ahead' : ''}  (score ${f.score.toFixed(0)})`);
if (!out.length) console.log('nothing found: widen --reach or --swing');
