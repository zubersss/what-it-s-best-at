// Searches the height function for a flat ledge with an open view (used once to pick the
// start position; kept so it can be re-run when the recipe changes).
//   node scripts/find-ledge.mjs [--world mars] [--lat ..] [--lon ..] [--span 14000] [--az 300]
import { loadWorld } from './lib/loadWorld.mjs';
import { latLonToDir, localFrame, dirToLatLon } from '../src/core/ephemeris.js';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const { world, hs } = await loadWorld(opt('world', 'mars'));
const lat = Number(opt('lat', world.scene.start.lat)), lon = Number(opt('lon', world.scene.start.lon));
const span = Number(opt('span', 14000)), az = Number(opt('az', 300)) * Math.PI / 180;
const altMin = Number(opt('altMin', -3200)), altMax = Number(opt('altMax', 500));
const R = world.radius, c = latLonToDir(lat, lon), { east, north } = localFrame(c);
const H = (e, n, wl = 1) => {
  const x = c[0] * R + east[0] * e + north[0] * n, y = c[1] * R + east[1] * e + north[1] * n, z = c[2] * R + east[2] * e + north[2] * n;
  const l = Math.hypot(x, y, z); return hs.height(x / l, y / l, z / l, wl);
};
const toLL = (e, n) => dirToLatLon([c[0] * R + east[0] * e + north[0] * n, c[1] * R + east[1] * e + north[1] * n, c[2] * R + east[2] * e + north[2] * n]);
const step = 20, out = [];
for (let n = -span / 2; n <= span / 2; n += step) for (let e = -span / 2; e <= span / 2; e += step) {
  const h = H(e, n, 8);
  if (h < altMin || h > altMax) continue;
  // small flat platform right at a lip: flat within 12 m, falling away a few tens of metres ahead
  let spread = 0;
  for (const [de, dn] of [[12, 0], [-12, 0], [0, 12], [0, -12], [8, 8], [-8, 8], [8, -8], [-8, -8]]) spread = Math.max(spread, Math.abs(H(e + de, n + dn, 2) - h));
  if (spread > 3.5) continue;
  let open = 0, blocked = false;
  for (const da of [-1.0, -0.6, -0.3, 0, 0.3, 0.6, 1.0]) {
    const sx = Math.sin(az + da), cx = Math.cos(az + da);
    for (const [d, need] of [[45, 0.25], [120, 0.35], [400, 0.3], [1200, 0.25], [3000, 0.2]]) {
      const dh = H(e + sx * d, n + cx * d, 8) - h;
      if (dh > -need * d * (Math.abs(da) > 0.7 ? 0.3 : 1)) blocked = true;
      open += Math.min(1.5, -dh / d);
    }
  }
  if (blocked) continue;
  // a wall behind (so it reads as a ledge on a canyon wall)
  const back = H(e - Math.sin(az) * 300, n - Math.cos(az) * 300, 16) - h;
  out.push({ e, n, h, spread, open, back, score: open + Math.min(1, Math.max(0, back / 300)) * 6 - spread * 0.4 });
}
out.sort((a, b) => b.score - a.score);
const seen = [];
for (const o of out) {
  if (seen.some((s) => Math.hypot(s.e - o.e, s.n - o.n) < 600)) continue;
  seen.push(o);
  const ll = toLL(o.e, o.n);
  console.log(`lat ${ll.lat.toFixed(5)} lon ${ll.lon.toFixed(5)}  alt ${o.h.toFixed(0)}  spread ${o.spread.toFixed(1)}  open ${o.open.toFixed(1)}  back +${o.back.toFixed(0)}m  score ${o.score.toFixed(1)}`);
  if (seen.length >= 12) break;
}
console.log(`${out.length} candidate cells`);
