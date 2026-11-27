// Haven's rivers and lakes in Node, by the tile worker's own path (tiles/madeTiles.js,
// tiles/hydrology.js: mosaicWater): the three mosaics the game keeps round a place, each
// taking its inflow from the coarser one, and a height source with them in place.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MadeWorld } from '../../src/terrain/tiles/madeTiles.js';
import { mosaicWater } from '../../src/terrain/tiles/hydrology.js';
import { createHeightSource } from '../../src/terrain/height/heightSource.js';
import haven from '../../src/worlds/haven.js';
import { readPng } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), PUB = path.join(ROOT, 'public');
export const TILE = 256, N = 4, RAD = 180 / Math.PI;

let made = null, rasters = null;
export function havenMade() {
  if (made) return made;
  const t = haven.terrain.tiles, d = haven.terrain.dems[0];
  const buf = fs.readFileSync(path.join(PUB, d.url)), data = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  rasters = [{ ...d, data }];
  const lk = readPng(path.join(PUB, t.made.lakes)), ids = new Uint8Array(lk.width * lk.height);
  for (let i = 0; i < ids.length; i++) ids[i] = lk.data[i * 3];
  const levels = JSON.parse(fs.readFileSync(path.join(PUB, t.made.levels), 'utf8')).lakes.map((l) => l.level);
  const rain = new Uint8Array(fs.readFileSync(path.join(PUB, t.hydrology.rain)));
  made = { mw: new MadeWorld({ radius: haven.radius, seed: t.made.seed ?? 0, land: t.made.land || null, rain, dem: { ...d, data }, lakes: { ids, width: lk.width, height: lk.height, levels } }), rain };
  return made;
}

// Where a mosaic of a ring lies when the traveller stands at a place (tileRings.js, without a lead).
export function ringAt(zoom, lat, lon) {
  const n = 2 ** zoom, la = Math.max(-1.48, Math.min(1.48, lat / RAD)), mercY = Math.log(Math.tan(Math.PI / 4 + la / 2));
  let l = lon > 180 ? lon - 360 : lon;
  const fx = ((l / 360 + 0.5) % 1 + 1) % 1 * n, fy = (1 - mercY / Math.PI) / 2 * n;
  return { zoom, tx: Math.round(fx - N / 2), ty: Math.max(0, Math.min(n - N, Math.round(fy - N / 2))) };
}

// One mosaic's water. at: { zoom, tx, ty }; minFlow; coarse: the `mine` of a coarser one.
export function mosaicAt(at, minFlow, coarse = null, join = true) {
  const { mw, rain } = havenMade(), { zoom, tx, ty } = at, W = N * TILE, rows = 2 ** zoom;
  const h = mw.elevation(zoom, tx, ty, N), g = mw.grid(zoom, tx, ty);
  const cell = 2 * Math.PI * haven.radius / (TILE * rows) * Math.cos(Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + N / 2) / rows))));
  const out = mosaicWater({ zoom, tx, ty, hydrology: { minFlow } }, h, W, cell, { rain, lakes: (x, y) => mw.lakeAt(g.lonOf(x), g.latOf(y)), coarse, join });
  return { ...out, h, W, cell, g, zoom, tx, ty };
}

// The game's rings round a place, coarsest first ({ packed, res, mine, h, W, cell, g, zoom, tx, ty } each).
export function ringsAt(lat, lon, { slots = null, join = true } = {}) {
  const rings = haven.terrain.tiles.elevation.rings, out = [];
  let coarse = null;
  rings.forEach((r, slot) => {
    if (slots && !slots.includes(slot)) { out.push(null); return; }
    const m = mosaicAt(ringAt(r.zoom, lat, lon), r.minFlow ?? 1, coarse, join);
    coarse = m.mine; out.push(m);
  });
  return out;
}

// A height source for Haven with those rings in place (as the game's has them).
export function havenSource(rings) {
  havenMade();
  const hs = createHeightSource(haven, rasters);
  rings.forEach((m, slot) => { if (m) hs.setRing(slot, { data: new Int16Array(m.W * m.W), width: m.W, height: m.W, zoom: m.zoom, tx: m.tx, ty: m.ty, waterOnly: true, water: m.packed }); });
  return hs;
}

// A unit direction from degrees (lon east 0..360).
export function dirOf(lat, lon) { const a = lat / RAD, b = lon / RAD; return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]; }
export { haven };
