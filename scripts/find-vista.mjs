// Places to stand on Earth with a view: level ground under the feet, and the land falling
// away ahead. Worked out from the streamed elevation in Node (lib/earthTiles.mjs).
//   node scripts/find-vista.mjs --lat 36.06 --lon -112.11 [--within 1500] [--drop 300]
// Prints the best places with the heading to face: lat, lon (east, 0..360), heading, how
// level the ground is where you stand, and how far the land falls 150 m, 400 m and 1.5 km
// ahead. For choosing a world's start and bookmarks; look at the best in a picture.
import { mosaic, heightSource, RAD } from './lib/earthTiles.mjs';
const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? +args[args.indexOf('--' + n) + 1] : d);
const lat0 = opt('lat', 36.06), lon0 = opt('lon', -112.11), within = opt('within', 1500), need = opt('drop', 300);
const m = mosaic(12, lat0, lon0, 0.5), hs = heightSource(m), R = 6371000;
const dir = (lat, lon) => { const c = Math.cos(lat / RAD); return [c * Math.cos(lon / RAD), c * Math.sin(lon / RAD), Math.sin(lat / RAD)]; };
const H = (lat, lon) => { const d = dir(lat, lon); const h = hs.height(d[0], d[1], d[2], 8); return hs.waterDepth > 0 ? null : h; };
const mLat = 1 / 111200, mLon = 1 / (111200 * Math.cos(lat0 / RAD));
const found = [];
for (let y = -within; y <= within; y += 30) for (let x = -within; x <= within; x += 30) {
  const lat = lat0 + y * mLat, lon = lon0 + x * mLon, h = H(lat, lon); if (h == null) continue;
  // level where you stand: the ground 12 m away on four sides
  let tilt = 0; for (const [a, b] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) { const g = H(lat + b * mLat, lon + a * mLon); if (g == null) { tilt = 9; break; } tilt = Math.max(tilt, Math.abs(g - h) / 12); }
  if (tilt > 0.12) continue;
  let best = null;
  for (let hd = 0; hd < 360; hd += 30) {
    const s = Math.sin(hd / RAD), c = Math.cos(hd / RAD), at = (d) => H(lat + c * d * mLat, lon + s * d * mLon);
    const a = at(150), b = at(400), f = at(1500), back = at(-40);
    if (a == null || b == null || f == null || back == null) continue;
    // (the land ahead must fall, soon and far; behind you it is level: you are on the rim, not on a spur)
    const score = Math.min(h - a, 200) * 0.6 + Math.min(h - b, 500) * 0.5 + Math.min(h - f, 900) * 0.3 - Math.abs(back - h) * 2 - tilt * 300;
    if (h - b >= need && h - a > 10 && (!best || score > best.score)) best = { score, hd, a: h - a, b: h - b, f: h - f };
  }
  if (best) found.push({ lat, lon: (lon + 360) % 360, h, tilt, ...best });
}
found.sort((p, q) => q.score - p.score);
const out = [];
for (const f of found) { if (out.every((o) => Math.hypot((o.lat - f.lat) / mLat, (o.lon - f.lon) / mLon) > 200)) out.push(f); if (out.length >= 8) break; }
for (const f of out) console.log(`lat ${f.lat.toFixed(5)} lon ${f.lon.toFixed(5)} heading ${f.hd}  ground ${f.h.toFixed(0)} m, tilt ${f.tilt.toFixed(2)}; falls ${f.a.toFixed(0)} m in 150 m, ${f.b.toFixed(0)} in 400, ${f.f.toFixed(0)} in 1500`);
if (!out.length) { console.log('no such place here'); process.exit(1); }
