// Loads a world definition and its rasters from disk for Node scripts.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWorld } from '../../src/worlds/index.js';
import { createHeightSource } from '../../src/terrain/height/heightSource.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function loadWorld(id) {
  const world = getWorld(id);
  const rasters = [];
  for (const d of world.terrain.dems || []) {
    const buf = await readFile(path.join(root, 'public', d.url));
    rasters.push({ ...d, data: new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2) });
  }
  return { world, rasters, hs: createHeightSource(world, rasters) };
}
