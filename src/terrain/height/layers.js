// Terrain recipe operations. A world lists layers ({ op: 'name', ...numbers }) and the
// height source runs them top to bottom on a small context `c`:
//
//   c.x, c.y, c.z     unit direction (planet-fixed)
//   c.px, c.py, c.pz  the same point on the datum sphere, metres
//   c.h               height above datum so far (m)            (read/write)
//   c.slope           large-scale slope so far, tan(angle)     (read/write)
//   c.res             metres per pixel of the raster under this point (1e12 = none)
//   c.minWL           smallest wavelength worth evaluating (2 x sample spacing)
//
// Every op must fade its own detail out below c.minWL: that keeps coarse chunks cheap
// and alias-free. Ops must not allocate per call. No world-specific logic here.
import { noise3, hash3, vnoise1, smoothstep } from './noise.js';

const LAC = 1.97;   // octave spacing (slightly off 2 so lattices never line up)

function octaves(def) {
  const out = [];
  let k = 0;
  for (let wl = def.maxWavelength; wl >= def.minWavelength; wl /= LAC, k++) {
    out.push({ wl, f: 1 / wl, a: Math.pow(wl / 1000, def.roughness ?? 0.8), ox: def.seed * 17.13 + k * 31.7, oy: def.seed * 5.71 - k * 19.3, oz: def.seed * 9.37 + k * 7.9 });
  }
  return out;
}

function lodWeight(wl, minWL) {
  if (wl >= 2 * minWL) return 1;
  return wl <= minWL ? 0 : wl / minWL - 1;
}

export const OPS = {
  // Elevation rasters: sets the large-scale shape and slope.
  dem(def, env) {
    const dem = env.dem;
    return (c) => {
      dem.sample(c.x, c.y, c.z);
      c.h += dem.h;
      c.slope = Math.hypot(dem.gE, dem.gN);
      c.res = dem.res;
    };
  },

  // Fractal relief. `amp` is the amplitude (m) at a 1 km wavelength; amplitude scales as
  // wavelength^roughness. `belowDem`: only add wavelengths the raster cannot resolve
  // (shorter than belowDem x pixel size). `slopeGain` [s0, s1, g0, g1]: rougher on slopes.
  fbm(def) {
    const oct = octaves(def);
    const amp = def.amp, below = def.belowDem || 0, sg = def.slopeGain, hetero = def.hetero || 0;
    return (c) => {
      const cut = below ? below * c.res : Infinity;
      let sum = 0, prev = 0;
      for (let k = 0; k < oct.length; k++) {
        const o = oct[k];
        if (o.wl <= c.minWL) break;
        let w = lodWeight(o.wl, c.minWL);
        if (o.wl > cut) { const r = cut / o.wl; w *= r * r; if (w < 0.004) continue; }
        const n = noise3(c.px * o.f + o.ox, c.py * o.f + o.oy, c.pz * o.f + o.oz);
        if (hetero) w *= 1 - hetero * (0.5 - 0.5 * prev);
        sum += w * o.a * n;
        prev = n;
      }
      const g = sg ? sg[2] + (sg[3] - sg[2]) * smoothstep(sg[0], sg[1], c.slope) : 1;
      c.h += sum * amp * g;
    };
  },

  // Ridged multifractal (sharp crests, V gullies), masked to slopes: spur-and-gully walls.
  // `amp` is the total relief in metres.
  ridged(def) {
    const oct = octaves(def);
    let norm = 0;
    for (const o of oct) norm += o.a;
    const amp = def.amp / norm, sm = def.slopeMask, warp = def.warp || 0;
    const wf = 1 / (def.maxWavelength * 2.3), wamp = warp * def.maxWavelength;
    const s = def.seed;
    return (c) => {
      const mask = sm ? smoothstep(sm[0], sm[1], c.slope) : 1;
      if (mask <= 0 || oct[0].wl <= c.minWL) return;
      let x = c.px, y = c.py, z = c.pz;
      if (warp) {
        const wx = c.px * wf, wy = c.py * wf, wz = c.pz * wf;
        x += wamp * noise3(wx + s * 3.1, wy + 7.7, wz - 1.3);
        y += wamp * noise3(wx - 4.2, wy + s * 2.3, wz + 9.1);
        z += wamp * noise3(wx + 8.8, wy - 3.6, wz + s * 1.7);
      }
      let sum = 0, weight = 1;
      for (let k = 0; k < oct.length; k++) {
        const o = oct[k];
        if (o.wl <= c.minWL) break;
        const w = lodWeight(o.wl, c.minWL);
        let r = 1 - Math.abs(noise3(x * o.f + o.ox, y * o.f + o.oy, z * o.f + o.oz));
        r *= r;
        const v = r * weight;
        // zero-mean per octave so dropping octaves at coarse LOD does not shift the surface
        sum += w * o.a * (v - (k === 0 ? 0.60 : 0.50));
        weight = Math.min(1, r * 1.8);
      }
      c.h += sum * amp * mask;
    };
  },

  // Horizontal strata: remaps height so resistant layers stand as cliffs and weak layers
  // form benches. thickness (m) per layer; `cliff` = fraction of each layer's base-height
  // range that is cliff, `rise` = fraction of the layer's height the cliff climbs.
  terrace(def) {
    const T = def.thickness, cliff = def.cliff, rise = def.rise, strength = def.strength ?? 1;
    const sm = def.slopeMask, jitter = def.jitter || 0, seed = def.seed;
    const warpAmp = def.warpAmp || 0, wf = 1 / (def.warpWavelength || 1000);
    const bench = (1 - rise) / (1 - cliff), steep = rise / cliff;
    return (c) => {
      let m = strength * (sm ? smoothstep(sm[0], sm[1], c.slope) : 1);
      if (m <= 0) return;
      // one layer is T / slope metres wide on the ground; fade when that is under-sampled
      const width = T / Math.max(c.slope, 0.08);
      m *= Math.min(1, Math.max(0, width / (2 * c.minWL) - 0.5));
      if (m <= 0) return;
      const warp = warpAmp ? warpAmp * noise3(c.px * wf + seed, c.py * wf - seed * 2.0, c.pz * wf + 4.4) : 0;
      let y = (c.h + warp) / T;
      if (jitter) y += jitter * (vnoise1(y * 0.9, seed) - 0.5) * 2;     // uneven layer thickness
      const k = Math.floor(y), f = y - k;
      // per-layer variation of how resistant the cap rock is
      const var1 = 0.75 + 0.5 * (hash3(k, 0, 0, seed) / 4294967296);
      const cl = Math.min(0.6, cliff * var1);
      const b = (1 - rise) / (1 - cl), st = rise / cl;
      const g = f < 1 - cl ? f * b : (1 - rise) + (f - (1 - cl)) * st;
      let y2 = k + g;
      const out = y2 * T + (c.h - y * T);          // keep the warp/jitter offset
      c.h += (out - c.h) * m;
      void bench; void steep;
    };
  },

  // Impact craters, power-law sizes between radius[0] and radius[1] (m).
  // density = chance that a lattice cell of a size class holds a crater (0..1),
  // layers = independent lattices per class. depth / rim are fractions of the radius.
  craters(def) {
    const classes = [];
    const INFL = 2.2;
    for (let R = def.radius[1], n = 0; R >= def.radius[0] && n < 24; R /= 2, n++) {
      for (let l = 0; l < (def.layers || 1); l++) classes.push({ R, cell: 2 * INFL * R, seed: def.seed * 101 + n * 7 + l * 1013 });
    }
    const density = def.density, depthK = def.depth ?? 0.2, rimK = def.rim ?? 0.04;
    const smi = def.slopeMaskInv, radius = def.planetRadius;
    return (c) => {
      const mask = smi ? 1 - smoothstep(smi[0], smi[1], c.slope) : 1;
      if (mask <= 0) return;
      let add = 0, slope = 0;
      for (let ci = 0; ci < classes.length; ci++) {
        const cls = classes[ci];
        if (cls.R * 2 <= c.minWL) break;               // classes are sorted large -> small
        const lod = Math.min(1, cls.R * 2 / c.minWL - 1);
        const cell = cls.cell, inv = 1 / cell;
        const bx = Math.floor(c.px * inv - 0.5), by = Math.floor(c.py * inv - 0.5), bz = Math.floor(c.pz * inv - 0.5);
        for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const ix = bx + dx, iy = by + dy, iz = bz + dz;
          const h0 = hash3(ix, iy, iz, cls.seed);
          if ((h0 & 0xffff) / 65536 >= density) continue;
          const cx = (ix + 0.5) * cell, cy = (iy + 0.5) * cell, cz = (iz + 0.5) * cell;
          const cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
          if (Math.abs(cl - radius) > cell * 0.5) continue;      // cell not on the surface shell
          const h1 = hash3(ix, iy, iz, cls.seed + 1), h2 = hash3(ix, iy, iz, cls.seed + 2);
          let qx = cx + ((h1 & 0xffff) / 65536 - 0.5) * cell, qy = cy + ((h1 >>> 16) / 65536 - 0.5) * cell, qz = cz + ((h2 & 0xffff) / 65536 - 0.5) * cell;
          const ql = radius / Math.sqrt(qx * qx + qy * qy + qz * qz);
          qx *= ql; qy *= ql; qz *= ql;
          const r = cls.R * (0.5 + 0.5 * ((h2 >>> 16) / 65536));
          const ex = c.px - qx, ey = c.py - qy, ez = c.pz - qz;
          const d2 = ex * ex + ey * ey + ez * ez;
          const infl = r * INFL;
          if (d2 >= infl * infl) continue;
          const t = Math.sqrt(d2) / r;                 // 0 centre, 1 rim
          const age = 0.35 + 0.65 * ((h0 >>> 16) / 65536);   // older = shallower, softer
          const depth = depthK * r * age, rim = rimK * r * age;
          let v, dv;
          if (t < 1) { const t2 = t * t; v = rim - (depth + rim) * (1 - t2) * (1 - 0.35 * t2 * (1 - age)); dv = (depth + rim) * 2 * t / r; }
          else { const fade = 1 - smoothstep(1.25, INFL, t); v = rim * fade / (t * t * t); dv = rim * 3 / (t * t * t * t) / r; }
          add += v * lod; if (dv * lod > slope) slope = dv * lod;
        }
      }
      c.h += add * mask;
      if (slope * mask > c.slope) c.slope = slope * mask;
    };
  },
};
