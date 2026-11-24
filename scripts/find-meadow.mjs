// Flower meadows near a place, without a browser: where the flower rule (life/grassRules.js)
// carpets level ground, which kind leads there, and which way to face to see most of it.
//   node scripts/find-meadow.mjs [--world haven] [--lat -54.4271 --lon 39.2697] [--flora steppe] [--within 2500] [--count 8]
// (The land's cover is not asked: give the flora of the country, and look with a picture.)
import { loadWorld } from './lib/loadWorld.mjs';
import { flowersAt, floraNamed, KINDS } from '../src/life/grassRules.js';
const args = process.argv.slice(2), opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const { hs } = await loadWorld(opt('world', 'haven'));
const lat0 = +opt('lat', -54.4271), lon0 = +opt('lon', 39.2697), flora = floraNamed(opt('flora', 'steppe')), within = +opt('within', 2500), count = +opt('count', 8);
const D = Math.PI / 180, R = hs.radius;
const place = (east, north) => {
  const lat = lat0 + north / R / D, lon = lon0 + east / (R * Math.cos(lat0 * D)) / D;
  const d = [Math.cos(lat * D) * Math.cos(lon * D), Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D)];
  const h = hs.height(d[0], d[1], d[2], 5), slope = hs.baseSlope, wet = hs.waterDepth > 0, r = R + h;
  const v = wet || slope > 0.45 ? 0 : flowersAt(d[0] * r, d[1] * r, d[2] * r, flora, slope);
  return { lat, lon, h, slope, kind: Math.floor(v), many: v - Math.floor(v) };
};
const found = [];
for (let n = -within; n <= within; n += 60) for (let e = -within; e <= within; e += 60) {
  const c = place(e, n); if (c.many < 0.45 || c.slope > 0.1) continue;
  // (how much of the 150 m ahead flowers, for eight ways to face)
  let best = 0, heading = 0;
  for (let a = 0; a < 360; a += 45) {
    let s = 0; for (let r = 15; r <= 150; r += 15) { const q = place(e + r * Math.sin(a * D), n + r * Math.cos(a * D)); s += q.slope < 0.2 ? q.many : 0; }
    if (s > best) { best = s; heading = a; }
  }
  found.push({ ...c, e, n, best: best / 10, heading });
}
found.sort((a, b) => b.best - a.best);
const kept = [];
for (const f of found) { if (kept.every((k) => Math.hypot(k.e - f.e, k.n - f.n) > 400)) kept.push(f); if (kept.length >= count) break; }
for (const f of kept) console.log(`lat=${f.lat.toFixed(5)}&lon=${f.lon.toFixed(5)}&heading=${f.heading}   ground ${f.h.toFixed(0)} m, slope ${f.slope.toFixed(2)}, ${KINDS[f.kind].name} here (${f.many.toFixed(2)}), ${(f.best).toFixed(2)} of the 150 m ahead in flower; ${Math.hypot(f.e, f.n).toFixed(0)} m from the place`);
if (!kept.length) { console.log('no meadow found'); process.exit(1); }
