// Whose shadow lies in front of a traveller? The trees round a place, worked out without
// a browser (the same trees the game plants there), and where each crown's shadow falls at
// the world's opening hour: for choosing a place to stand whose foreground is in the Sun.
//   node scripts/tree-shadows-at.mjs [--world haven] [--lat .. --lon ..] [--heading ..] [--t 0] [--search 40]
// Prints the trees whose crown shades the ground 1 to 12 m ahead of the eye, and with
// --search <m> the nearest places (steps of 3 m) where none does and the ground is as level.
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
const shaders = (east, north, hd) => {
  const fx = Math.sin(hd * RAD), fy = Math.cos(hd * RAD), out = [];
  for (const t of trees) {
    const cx = t.east + sx * 0.62 * t.h, cy = t.north + sy * 0.62 * t.h, r = 0.3 * t.h * t.wide;
    for (const d of [1, 3, 5, 8, 12]) {
      const px = east + fx * d - cx, py = north + fy * d - cy;
      // (the ellipse is stretched along the shadows' way by 1 / sin(elevation))
      const along = (px * sx + py * sy) / Math.hypot(sx, sy), across = Math.hypot(px, py) ** 2 - along * along;
      if ((along * Math.sin(el)) ** 2 + across < r * r) { out.push({ ...t, at: d }); break; }
    }
  }
  return out;
};
const here = shaders(0, 0, heading);
console.log(`${trees.length} trees within about 250 m; ${here.length} shade the ground 1 to 12 m ahead of the eye at ${lat0}, ${lon0} facing ${heading}:`);
for (const t of here) console.log(`  a tree ${t.h.toFixed(0)} m tall, ${Math.hypot(t.east, t.north).toFixed(0)} m off toward ${((Math.atan2(t.east, t.north) / RAD + 360) % 360).toFixed(0)}: its crown's shadow lies ${t.at} m ahead`);
const search = +opt('search', 0);
if (search) {
  const dirOf = (e, n) => latLonToDir(lat0 + n / M, lon0 + e / mLon), hAt = (e, n) => { const d = dirOf(e, n); return hs.height(d[0], d[1], d[2], 8); };
  const found = [];
  for (let n = -search; n <= search; n += 3) for (let e = -search; e <= search; e += 3) {
    if (shaders(e, n, heading).length) continue;
    // not inside a tree, and as level underfoot as a place to stand should be
    if (trees.some((t) => Math.hypot(t.east - e, t.north - n) < 2.5)) continue;
    const slope = Math.hypot(hAt(e + 4, n) - hAt(e - 4, n), hAt(e, n + 4) - hAt(e, n - 4)) / 8;
    if (slope > 0.3) continue;
    // (trees in view ahead within 80 m, for the picture: one or two, not a wall)
    const fx = Math.sin(heading * RAD), fy = Math.cos(heading * RAD);
    const ahead = trees.filter((t) => { const dx = t.east - e, dy = t.north - n, a = dx * fx + dy * fy; return a > 12 && a < 80 && Math.abs(dx * fy - dy * fx) < a * 0.5; }).length;
    found.push({ e, n, slope, ahead, d: Math.hypot(e, n) });
  }
  found.sort((a, b) => a.d - b.d);
  console.log(`${found.length} places within ${search} m with a sunlit foreground; the nearest:`);
  for (const f of found.slice(0, 8)) console.log(`  ${f.e} m east, ${f.n} m north (lat ${(lat0 + f.n / M).toFixed(5)}, lon ${(lon0 + f.e / mLon).toFixed(5)}): slope ${f.slope.toFixed(2)}, ${f.ahead} trees in view within 80 m`);
}
if (process.argv.includes('--near')) {
  const near = trees.map((t) => ({ ...t, d: Math.hypot(t.east, t.north), b: (Math.atan2(t.east, t.north) / RAD + 360) % 360 })).sort((a, b) => a.d - b.d).slice(0, 10);
  console.log('the nearest trees (distance m, bearing, height m, crown width x):');
  for (const t of near) console.log(`  ${t.d.toFixed(1)} m toward ${t.b.toFixed(0)}: ${t.h.toFixed(1)} m tall, width ${t.wide.toFixed(2)}; its crown's shadow centre lands ${(Math.hypot(t.east + sx * 0.62 * t.h, t.north + sy * 0.62 * t.h)).toFixed(1)} m from the eye toward ${((Math.atan2(t.east + sx * 0.62 * t.h, t.north + sy * 0.62 * t.h) / RAD + 360) % 360).toFixed(0)}`);
}
