// HeightSource: the single interface the engine uses to ask "how high is the ground?".
//
//   const hs = createHeightSource(world, rasters);
//   hs.height(x, y, z, minWavelength)   -> metres above the datum sphere
//   hs.baseSlope                         -> large-scale slope at the last query
//   hs.ceilingAt(x, y, z)                -> no ground within shadow range is higher than this
//
// (x, y, z) is a unit direction in the planet-fixed frame. `minWavelength` (m) is the
// smallest feature the caller can represent (2 x its sample spacing); pass 0 for full
// detail. Real data plugs in as rasters; everything else is procedural layers from the
// world definition. This file and its imports run in workers, on the main thread and in
// Node — keep them free of DOM and three.js.
import { DemSet } from './dem.js';
import { OPS } from './layers.js';
import { noise3 } from './noise.js';

export function createHeightSource(world, rasters = []) {
  const radius = world.radius;
  const terrain = world.terrain;
  const env = { dem: rasters.length ? new DemSet(rasters, radius) : null };
  const fns = [];
  for (const layer of terrain.layers) {
    const make = OPS[layer.op];
    if (!make) throw new Error(`Unknown terrain op "${layer.op}"`);
    if (layer.op === 'dem' && !env.dem) continue;
    const fn = make({ ...layer, planetRadius: radius }, env);
    fns.push(layer.where ? masked(fn, layer.where, radius) : fn);
  }
  // Shadow rays stop at the tallest ground within their range: the rasters' maximum
  // nearby plus `shadowHeadroom` for what the procedural layers can add on top.
  const reach = terrain.shadowRange ?? 150000, headroom = terrain.shadowHeadroom ?? 1500;
  if (env.dem) env.dem.buildTops(reach);
  const c = { x: 0, y: 0, z: 1, px: 0, py: 0, pz: 0, h: 0, slope: 0, res: 1e12, minWL: 0 };
  const n = fns.length;
  const regional = fns.filter((f) => f.prepare);

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
    // No ground within the world's shadow range of this place is higher than this (m above datum).
    ceilingAt(x, y, z) { return env.dem ? Math.min(terrain.maxAltitude, env.dem.topAt(x, y, z) + headroom) : terrain.maxAltitude; },
    // Optional speed-up when many nearby points follow: (x,y,z) unit direction of the
    // region's centre and its radius in metres. Call release() before querying elsewhere.
    prepare(x, y, z, rho) { for (const f of regional) f.prepare(x * radius, y * radius, z * radius, rho); },
    release() { for (const f of regional) f.release(); },
  };
  return hs;
}

// `where` on a layer: the layer acts on part of the world only.
//   cover (0..1) with seed and wavelength (m): patches of about that size covering about
//         that share of the ground (soft: how wide their edges are, in the same units)
//   lat [from, to] (degrees of latitude, absolute value; fade: degrees): a belt or caps
//         (hemisphere: 'north' or 'south': that side of the equator only)
//   alt [from, to] (m; altFade: m): only where the ground so far is between these heights
//   at [[latitude, longitude east, radius m], ...]: also inside these real places (their
//         outlines made irregular), whatever `cover` says
//   invert: everywhere else instead
// The mask is continuous, so a masked layer never makes a cliff of its own.
function masked(fn, w, radius) {
  const f = 1 / (w.wavelength || 100000), sx = (w.seed || 0) * 13.7 + 3.1, soft = w.soft ?? 0.12;
  // noise3 is roughly normal with a spread of 0.28: the level a share `cover` lies above
  const cover = w.cover, q = cover == null ? 0 : Math.min(0.999, Math.max(0.001, 1 - cover));
  const level = cover == null ? -9 : 0.28 * 0.6 * Math.log(q / (1 - q));
  const lat = w.lat ? [Math.sin(w.lat[0] * Math.PI / 180), Math.sin(w.lat[1] * Math.PI / 180), Math.sin((w.fade ?? 4) * Math.PI / 180)] : null;
  const alt = w.alt || null, altFade = w.altFade ?? 200, invert = !!w.invert;
  const hemi = w.hemisphere === 'north' ? 1 : w.hemisphere === 'south' ? -1 : 0;
  const at = (w.at || []).map(([la, lo, r]) => { const a = la * Math.PI / 180, b = lo * Math.PI / 180; return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a), r / radius]; });
  const out = (c) => {
    let m = 1;
    if (cover != null) m = cover >= 1 ? 1 : (() => { const n = noise3(c.px * f + sx, c.py * f - sx * 0.7, c.pz * f + sx * 0.3); return n <= level - soft ? 0 : n >= level + soft ? 1 : (n - level + soft) / (2 * soft); })();
    else if (at.length) m = 0;
    for (let k = 0; k < at.length && m < 1; k++) {
      const p = at[k], dot = c.x * p[0] + c.y * p[1] + c.z * p[2];
      if (dot < 0.9) continue;
      const d = Math.acos(dot > 1 ? 1 : dot) / p[3] * (1 + 0.25 * noise3(c.px * 6 / (p[3] * radius) + k * 3.7, c.py * 6 / (p[3] * radius), c.pz * 6 / (p[3] * radius) - k));
      if (d < 1) m = Math.max(m, d < 0.85 ? 1 : (1 - d) / 0.15);
    }
    if (m > 0 && lat) { const a = Math.abs(c.z); m *= Math.min(1, Math.max(0, (a - lat[0]) / lat[2] + 0.5)) * Math.min(1, Math.max(0, (lat[1] - a) / lat[2] + 0.5)); }
    if (m > 0 && hemi) m *= Math.min(1, Math.max(0, c.z * hemi / 0.03 + 0.5));
    if (m > 0 && alt) m *= Math.min(1, Math.max(0, (c.h - alt[0]) / altFade + 0.5)) * Math.min(1, Math.max(0, (alt[1] - c.h) / altFade + 0.5));
    m = m * m * (3 - 2 * m);
    if (invert) m = 1 - m;
    if (m <= 0) return;
    const h0 = c.h, s0 = c.slope;
    fn(c);
    if (m < 1) { c.h = h0 + (c.h - h0) * m; c.slope = s0 + (c.slope - s0) * m; }
  };
  if (fn.prepare) { out.prepare = fn.prepare; out.release = fn.release; }
  return out;
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
