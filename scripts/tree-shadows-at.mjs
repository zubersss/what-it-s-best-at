// Whose shadow lies in front of a traveller? The trees round a place, worked out without
// a browser (the same trees the game plants there), and where each crown's shadow falls at
// the world's opening hour: for choosing a place to stand whose foreground is in the Sun.
//   node scripts/tree-shadows-at.mjs [--world haven] [--lat .. --lon ..] [--heading ..] [--t 0] [--ahead 50] [--search 40 [--most 0.03] [--list 12]]
// Prints the trees whose crown shades the ground in view to 50 m ahead of the eye (--ahead),
// and how much of that ground; with --search <m> the nearest places (steps of 3 m) where hardly
// any is shaded (--most 0.03), no trunk stands close in the view and the ground is as level.
// (A made world only: its land cover is worked out here; no water rings, so no trees "by water".)
import { loadWorld } from './lib/loadWorld.mjs';
import { setMadeCover } from './lib/madeCover.mjs';
import { treeBlock, blockDeg, blockLon, TREE_FLOATS } from '../src/life/treeBlock.js';
import { SOLAR_SYSTEM } from '../src/worlds/solarSystem.js';
import { Ephemeris, dateToJD, latLonToDir, elevationAzimuth } from '../src/core/ephemeris.js';

const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const { world, hs } = await loadWorld(opt('world', 'haven'));
const st = world.scene.start, lat0 = +opt('lat', st.lat), lon0 = +opt('lon', st.lon), heading = +opt('heading', st.heading), RAD = Math.PI / 180;
const R = world.radius, M = R * RAD, mLon = M * Math.cos(lat0 * RAD);
setMadeCover(hs, world, lat0, lon0);
// the Sun at the place and hour
const eph = new Ephemeris(SOLAR_SYSTEM, world.body);
eph.update(dateToJD(Date.parse(world.scene.dateUTC)) + (+opt('t', 0)) / 24, []);
const sun = elevationAzimuth(latLonToDir(lat0, lon0).map((v) => v * R), eph.sunDir);
const el = sun.elevation * RAD, az = sun.azimuth * RAD;
console.log(`Sun ${sun.elevation.toFixed(1)} degrees up at azimuth ${sun.azimuth.toFixed(0)}; shadows fall toward ${((sun.azimuth + 180) % 360).toFixed(0)}, ${(1 / Math.tan(el)).toFixed(1)} times as long as what casts them is tall`);
// every tree within 160 m: east, north (m from the place), height, crown width
const DEG = blockDeg(R), trees = [];
const bi0 = Math.floor(lat0 / DEG);
for (let bi = bi0 - 2; bi <= bi0 + 2; bi++) {
  const dLon = blockLon(bi, DEG), bj0 = Math.floor(lon0 / dLon);
  for (let bj = bj0 - 2; bj <= bj0 + 2; bj++) {
    const b = treeBlock(hs, bi, bj, world.life.trees.spacing ?? 7), o = b.origin, ol = Math.hypot(...o);
    const olat = Math.asin(o[2] / ol) / RAD, olon = Math.atan2(o[1], o[0]) / RAD;
    const e = [-Math.sin(olon * RAD), Math.cos(olon * RAD), 0], n = [-Math.sin(olat * RAD) * Math.cos(olon * RAD), -Math.sin(olat * RAD) * Math.sin(olon * RAD), Math.cos(olat * RAD)];
    for (let k = 0, q = 0; k < b.count; k++, q += TREE_FLOATS) {
      const x = b.trees[q], y = b.trees[q + 1], z = b.trees[q + 2];
      const east = (olon - lon0 - 360 * Math.round((olon - lon0) / 360)) * mLon + x * e[0] + y * e[1] + z * e[2], north = (olat - lat0) * M + x * n[0] + y * n[1] + z * n[2];
      trees.push({ east, north, h: b.trees[q + 3], wide: b.trees[q + 4] });
    }
  }
}
// a crown: a ball 0.3 of the tree's height in radius (times its width), its middle 0.62 up; its
// shadow on level ground: an ellipse that far along the shadows' way
const sx = -Math.sin(az) / Math.tan(el), sy = -Math.cos(az) / Math.tan(el);
// the trees whose crown's shadow lies on the ground in view: on a fan of places 2 to `reach`
// m ahead (to 0.6 of the distance to either side); `share`: how much of that ground is shaded
const reach = +opt('ahead', 50);
const shaders = (east, north, hd) => {
  const fx = Math.sin(hd * RAD), fy = Math.cos(hd * RAD), out = [], se = Math.sin(el), sl = Math.hypot(sx, sy);
  let pts = 0, dark = 0;
  const hit = new Set();
  for (let d = 2; d <= reach; d += 2) for (let l = -0.6 * d, st = Math.max(1, 0.15 * d); l <= 0.6 * d; l += st) {
    const gx = east + fx * d + fy * l, gy = north + fy * d - fx * l;
    let shaded = false;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i], px = gx - (t.east + sx * 0.62 * t.h), py = gy - (t.north + sy * 0.62 * t.h), r = 0.3 * t.h * t.wide;
      // (the ellipse is stretched along the shadows' way by 1 / sin(elevation))
      const along = (px * sx + py * sy) / sl, across = px * px + py * py - along * along;
      if ((along * se) ** 2 + across < r * r) { shaded = true; if (!hit.has(i)) { hit.add(i); out.push({ ...t, at: d }); } }
    }
    pts++; if (shaded) dark++;
  }
  out.share = dark / pts;
  return out;
};
const here = shaders(0, 0, heading);
console.log(`${trees.length} trees within about 250 m; ${here.length} shade the ground in view to ${reach} m ahead of the eye at ${lat0}, ${lon0} facing ${heading} (${(100 * here.share).toFixed(0)} % of it):`);
for (const t of here) console.log(`  a tree ${t.h.toFixed(0)} m tall, ${Math.hypot(t.east, t.north).toFixed(0)} m off toward ${((Math.atan2(t.east, t.north) / RAD + 360) % 360).toFixed(0)}: its crown's shadow from ${t.at} m ahead`);
const dirOf = (e, n) => latLonToDir(lat0 + n / M, lon0 + e / mLon), hAt = (e, n) => { const d = dirOf(e, n); return hs.height(d[0], d[1], d[2], 8); };
{
  const fx = Math.sin(heading * RAD), fy = Math.cos(heading * RAD), h0 = hAt(0, 0);
  console.log(`the ground here: ${h0.toFixed(0)} m; ahead it falls ${[10, 20, 30, 60, 200].map((d) => `${(h0 - hAt(fx * d, fy * d)).toFixed(1)} m in ${d}`).join(', ')} m`);
}
const search = +opt('search', 0);
if (search) {
  const found = [], most = +opt('most', 0.03);
  for (let n = -search; n <= search; n += 3) for (let e = -search; e <= search; e += 3) {
    const sh = shaders(e, n, heading);
    if (sh.share > most) continue;
    // not inside a tree, no trunk close in the view (a pole cut by the picture's edge), and
    // as level underfoot as a place to stand should be
    const fx = Math.sin(heading * RAD), fy = Math.cos(heading * RAD);
    if (trees.some((t) => { const dx = t.east - e, dy = t.north - n, d = Math.hypot(dx, dy); return d < 2.5 || (d < 14 && dx * fx + dy * fy > d * 0.5); })) continue;
    const slope = Math.hypot(hAt(e + 4, n) - hAt(e - 4, n), hAt(e, n + 4) - hAt(e, n - 4)) / 8;
    if (slope > 0.3) continue;
    // (how far the ground falls 60 and 200 m ahead: a brow to look out from)
    const h0 = hAt(e, n), f60 = h0 - hAt(e + fx * 60, n + fy * 60), f200 = h0 - hAt(e + fx * 200, n + fy * 200);
    // (trees in view ahead within 80 m, for the picture: one or two, not a wall)
    const ahead = trees.filter((t) => { const dx = t.east - e, dy = t.north - n, a = dx * fx + dy * fy; return a > 12 && a < 80 && Math.abs(dx * fy - dy * fx) < a * 0.5; }).length;
    found.push({ e, n, slope, ahead, d: Math.hypot(e, n), share: sh.share, f60, f200 });
  }
  found.sort((a, b) => a.d - b.d);
  console.log(`${found.length} places within ${search} m with a sunlit foreground (at most ${(100 * most).toFixed(0)} % of it shaded); the nearest:`);
  for (const f of found.slice(0, +opt('list', 12))) console.log(`  ${f.e} m east, ${f.n} m north (lat ${(lat0 + f.n / M).toFixed(5)}, lon ${(lon0 + f.e / mLon).toFixed(5)}): shaded ${(100 * f.share).toFixed(0)} %, slope ${f.slope.toFixed(2)}, falls ${f.f60.toFixed(0)} m in 60 m and ${f.f200.toFixed(0)} m in 200 m, ${f.ahead} trees in view within 80 m`);
}
if (process.argv.includes('--near')) {
  const near = trees.map((t) => ({ ...t, d: Math.hypot(t.east, t.north), b: (Math.atan2(t.east, t.north) / RAD + 360) % 360 })).sort((a, b) => a.d - b.d).slice(0, 10);
  console.log('the nearest trees (distance m, bearing, height m, crown width x):');
  for (const t of near) console.log(`  ${t.d.toFixed(1)} m toward ${t.b.toFixed(0)}: ${t.h.toFixed(1)} m tall, width ${t.wide.toFixed(2)}; its crown's shadow centre lands ${(Math.hypot(t.east + sx * 0.62 * t.h, t.north + sy * 0.62 * t.h)).toFixed(1)} m from the eye toward ${((Math.atan2(t.east + sx * 0.62 * t.h, t.north + sy * 0.62 * t.h) / RAD + 360) % 360).toFixed(0)}`);
}
