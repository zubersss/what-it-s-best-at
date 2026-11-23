// A made world's land cover, for Node scripts: what the tile worker hands the terrain
// workers in the game (hs.setCover), worked out here instead of fetched.
//
// In the game the picture ring (terrain.tiles.pictures.colour) is N x N Web Mercator tiles
// of 256 pixels round the traveller, and the tile worker fills it by rule (tiles/madeTiles.js,
// `picture`). This does the same for a place, so that the trees a worker would place there
// can be worked out and timed without a browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MadeWorld } from '../../src/terrain/tiles/madeTiles.js';
import { readPng } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pub = (u) => path.join(root, 'public', u);

// world: the world definition (its terrain.tiles.made block). Returns a MadeWorld.
export function madeWorldOf(world) {
  const t = world.terrain, c = t.tiles.made, d = t.dems[0];
  const buf = fs.readFileSync(pub(d.url));
  const dem = { ...d, data: new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2) };
  let lakes = null;
  if (c.lakes && c.levels) {
    const img = readPng(pub(c.lakes)), info = JSON.parse(fs.readFileSync(pub(c.levels), 'utf8'));
    const ids = new Uint8Array(img.w * img.h);
    for (let i = 0; i < ids.length; i++) ids[i] = img.data[i * 3];
    lakes = { ids, width: img.w, height: img.h, levels: info.lakes.map((l) => l.level) };
  }
  const rain = t.tiles.hydrology?.rain ? new Uint8Array(fs.readFileSync(pub(t.tiles.hydrology.rain))) : null;
  return new MadeWorld({ radius: world.radius, seed: c.seed, land: c.land, rain, dem, lakes });
}

// Gives `hs` the land cover of the ring that would be round a traveller at (lat, lon),
// exactly as the tile worker does: `tiles` x `tiles` tiles at the picture's finest zoom.
// Returns the ring, for anyone who wants to know what it covers.
export function setMadeCover(hs, world, lat, lon, { zoom = null, tiles = 4 } = {}) {
  const p = world.terrain.tiles.pictures.colour, z = zoom ?? (p.zooms ? p.zooms[0][0] : p.zoom);
  // (tiles count from longitude -180, as every Web Mercator layout does: madeTiles' `grid`)
  const n = 2 ** z, mx = ((((lon + 180) % 360) + 360) % 360) / 360 * n;
  const my = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  const tx = Math.round(mx - tiles / 2), ty = Math.round(my - tiles / 2);
  const mw = madeWorldOf(world), pic = mw.picture(z, tx, ty, tiles);
  const cover = { ...pic.cover, width: tiles * 256, zoom: z, tx, ty };
  hs.setCover(cover);
  return cover;
}
