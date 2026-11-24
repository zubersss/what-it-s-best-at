// The trees that stand nearest a place on a made world, worked out without a browser (as
// the game's workers place them), and where to put the camera to look at one from so many
// metres: for pictures of a tree close by.
//
//   node scripts/find-tree.mjs --world haven --lat 22.983 --lon 129.507 [--from 4,12] [--list 12] [--species pine]
import { loadWorld } from './lib/loadWorld.mjs';
import { setMadeCover } from './lib/madeCover.mjs';
import { treeBlock, blockDeg, blockLon, TREE_FLOATS } from '../src/life/treeBlock.js';
import { SPECIES } from '../src/life/cover.js';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const lat = +opt('lat', 22.983), lon = +opt('lon', 129.507), from = opt('from', '4,12').split(',').map(Number), want = opt('species', null), show = +opt('list', 12);
const { world, hs } = await loadWorld(opt('world', 'haven'));
setMadeCover(hs, world, lat, lon);
const R = world.radius, rad = Math.PI / 180, DEG = blockDeg(R), bi0 = Math.floor(lat / DEG), trees = [];
for (let bi = bi0 - 1; bi <= bi0 + 1; bi++) { const dLon = blockLon(bi, DEG), bj0 = Math.floor(lon / dLon); for (let bj = bj0 - 1; bj <= bj0 + 1; bj++) {
  const r = treeBlock(hs, bi, bj, world.life.trees.spacing ?? 7);
  for (let k = 0, q = 0; k < r.count; k++, q += TREE_FLOATS) {
    const x = r.origin[0] + r.trees[q], y = r.origin[1] + r.trees[q + 1], z = r.origin[2] + r.trees[q + 2], l = Math.hypot(x, y, z);
    const tl = Math.asin(z / l) / rad, to = ((Math.atan2(y, x) / rad) + 360) % 360, north = (tl - lat) * rad * R, east = (to - lon) * rad * R * Math.cos(lat * rad);
    trees.push({ lat: tl, lon: to, north, east, d: Math.hypot(north, east), tall: r.trees[q + 3], wide: r.trees[q + 4], sp: SPECIES[r.trees[q + 6]] });
  }
} }
trees.sort((a, b) => a.d - b.d);
const list = trees.filter((t) => !want || t.sp.name.includes(want));
console.log(`${trees.length} trees within three blocks of ${lat}, ${lon}`);
for (const t of list.slice(0, show)) {
  console.log(`  ${t.sp.name.padEnd(18)} ${t.tall.toFixed(1)} m tall, crown x${t.wide.toFixed(2)}, ${t.d.toFixed(1)} m away (east ${t.east.toFixed(1)}, north ${t.north.toFixed(1)}) at ${t.lat.toFixed(6)}, ${t.lon.toFixed(6)}`);
  // (stand south-west of it, look north-east at it: the heading is from north, clockwise)
  for (const m of from) { const b = 225 * rad, cl = t.lat + Math.cos(b) * m / (rad * R), co = t.lon + Math.sin(b) * m / (rad * R * Math.cos(t.lat * rad)); console.log(`      from ${m} m: lat=${cl.toFixed(6)}&lon=${co.toFixed(6)}&heading=45`); }
}
