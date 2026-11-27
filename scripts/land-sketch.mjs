// A made world's land from straight above, as its land rule paints it (tiles/madeLand.js through
// tiles/madeTiles.js: the colour the ground takes from the air, the woods, the tree line), without
// a browser in seconds: for judging a wood's edge, a tree line, a meadow's place before any picture.
//   node scripts/land-sketch.mjs --lat -48.55 --lon 49.06 [--world haven] [--zoom 8] [--tiles 3] [--set treeRag=0] [--out file.png]
// zoom: the Web Mercator level (8: a pixel 16 m east-west at Haven's opening place; 9: 8 m);
// --set name=number: one number of the land rule changed for this sketch (before against after).
// The place is marked with a red cross.
import fs from 'node:fs';
import path from 'node:path';
import { getWorld } from '../src/worlds/index.js';
import { madeWorldOf } from './lib/madeCover.mjs';
import { png } from './lib/png.mjs';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const world = getWorld(opt('world', 'haven')), lat = +opt('lat', world.start?.lat ?? 0), lon = +opt('lon', world.start?.lon ?? 0);
const z = +opt('zoom', 8), tiles = +opt('tiles', 3), out = path.resolve(opt('out', 'land-sketch.png'));
if (!world.terrain?.tiles?.made) { console.error(`${world.id} has no land rule (terrain.tiles.made)`); process.exit(1); }
const mw = madeWorldOf(world);
for (let i = 0; i < args.length; i++) if (args[i] === '--set') { const [k, v] = args[i + 1].split('='); if (!(k in mw.land) || !Number.isFinite(+v)) { console.error(`--set ${args[i + 1]}: no such number in the land rule`); process.exit(1); } mw.land[k] = +v; }
const n = 2 ** z, mx = ((((lon + 180) % 360) + 360) % 360) / 360 * n;
const my = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
const tx = Math.round(mx - tiles / 2), ty = Math.round(my - tiles / 2);
const pic = mw.picture(z, tx, ty, tiles), W = tiles * 256, rgb = new Uint8Array(W * W * 3);
for (let i = 0; i < W * W; i++) { rgb[i * 3] = pic.rgba[i * 4]; rgb[i * 3 + 1] = pic.rgba[i * 4 + 1]; rgb[i * 3 + 2] = pic.rgba[i * 4 + 2]; }
const px = Math.round((mx - tx) * 256), py = Math.round((my - ty) * 256);
for (let d = -8; d <= 8; d++) for (const [x, y] of [[px + d, py], [px, py + d]]) if (x >= 0 && y >= 0 && x < W && y < W) { rgb[(y * W + x) * 3] = 255; rgb[(y * W + x) * 3 + 1] = 0; rgb[(y * W + x) * 3 + 2] = 0; }
fs.writeFileSync(out, png(W, W, rgb, 3));
// what stands there, by class
const count = {}; for (const c of pic.cover.cls) count[c] = (count[c] || 0) + 1;
const NAMES = { 1: 'forest', 8: 'woodland', 9: 'parkland', 10: 'open', 7: 'scrub', 16: 'rock or sand', 17: 'water' };
console.log(`${out}: ${W} x ${W}, a pixel ${(2 * Math.PI * world.radius / n / 256 * Math.cos(lat * Math.PI / 180)).toFixed(0)} m east-west; the place at ${px}, ${py}`);
console.log(Object.entries(count).sort((a, b) => b[1] - a[1]).map(([c, k]) => `${NAMES[c] || 'class ' + c} ${(100 * k / (W * W)).toFixed(0)} %`).join(' · '));
