// HeightSource: the single interface the engine uses to ask "how high is the ground?".
//
//   const hs = createHeightSource(world, rasters);
//   hs.height(x, y, z, minWavelength)   -> metres above the datum sphere
//   hs.baseSlope                         -> large-scale slope at the last query
//
// (x, y, z) is a unit direction in the planet-fixed frame. `minWavelength` (m) is the
// smallest feature the caller can represent (2 x its sample spacing); pass 0 for full
// detail. Real data plugs in as rasters; everything else is procedural layers from the
// world definition. This file and its imports run in workers, on the main thread and in
// Node — keep them free of DOM and three.js.
import { DemSet } from './dem.js';
import { OPS } from './layers.js';

export function createHeightSource(world, rasters = []) {
  const radius = world.radius;
  const terrain = world.terrain;
  const env = { dem: rasters.length ? new DemSet(rasters, radius) : null };
  const fns = [];
  for (const layer of terrain.layers) {
    const make = OPS[layer.op];
    if (!make) throw new Error(`Unknown terrain op "${layer.op}"`);
    if (layer.op === 'dem' && !env.dem) continue;
    fns.push(make({ ...layer, planetRadius: radius }, env));
  }
  const c = { x: 0, y: 0, z: 1, px: 0, py: 0, pz: 0, h: 0, slope: 0, res: 1e12, minWL: 0 };
  const n = fns.length;

  const hs = {
    radius,
    baseSlope: 0,
    height(x, y, z, minWL) {
      c.x = x; c.y = y; c.z = z;
      c.px = x * radius; c.py = y * radius; c.pz = z * radius;
      c.h = 0; c.slope = 0; c.res = 1e12; c.minWL = minWL > 0.02 ? minWL : 0.02;
      for (let i = 0; i < n; i++) fns[i](c);
      hs.baseSlope = c.slope;
      return c.h;
    },
  };
  return hs;
}

// Loads the rasters listed in a world definition (browser or worker).
export async function loadRasters(world, baseUrl = '') {
  const defs = world.terrain.dems || [];
  return Promise.all(defs.map(async (d) => {
    const res = await fetch(baseUrl + d.url);
    if (!res.ok) throw new Error(`Failed to load ${d.url}: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== d.width * d.height * 2) throw new Error(`${d.url}: unexpected size`);
    return { ...d, data: new Int16Array(buf) };
  }));
}
