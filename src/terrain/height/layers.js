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
import { shoreUp } from './dem.js';

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

// (the same fade for a feature `w` metres wide)
function lodW(w, minWL) { return w * 2 <= minWL ? 0 : Math.min(1, w * 2 / minWL - 1); }

export const OPS = {
  // Elevation rasters: sets the large-scale shape and slope.
  dem(def, env) {
    const dem = env.dem;
    return (c) => {
      dem.sample(c.x, c.y, c.z);
      c.h += dem.h; c.map = dem.h;            // (map: the elevation map's own height, for layers that ask what it said)
      c.dem = dem;                            // (and the map itself: the water it knows of at this place)
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
  // `amp` is the total relief in metres. `belowDem`: as for fbm, wavelengths the raster
  // under the point shows itself fade out (a map with 27 m pixels has its own gullies:
  // 100 m ones cut into it were ours, not the mountain's).
  ridged(def) {
    const oct = octaves(def);
    let norm = 0;
    for (const o of oct) norm += o.a;
    const amp = def.amp / norm, sm = def.slopeMask, warp = def.warp || 0, below = def.belowDem || 0;
    const wf = 1 / (def.maxWavelength * 2.3), wamp = warp * def.maxWavelength;
    const s = def.seed;
    return (c) => {
      const mask = sm ? smoothstep(sm[0], sm[1], c.slope) : 1;
      if (mask <= 0 || oct[0].wl <= c.minWL) return;
      const cut = below ? below * c.res : Infinity;
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
        let w = lodWeight(o.wl, c.minWL);
        if (o.wl > cut) { const q = cut / o.wl; w *= q * q; if (w < 0.004) continue; }
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
  // Craters live in 3-D lattices (no seams anywhere on the sphere), one size class per
  // octave of radius. A lattice cell holds a crater with probability `density`, and only
  // centres that fall within OMAX radii of the surface are kept, so one lattice covers
  // roughly 1.2 % of the ground per class at density 1; `layers` stacks independent
  // lattices for busier surfaces. depth / rim are fractions of the radius.
  // Locality: a crater can only affect points in the 2x2x2 cells nearest to it, because
  // cell = 2 * (influence + OMAX) * R. Do not change one without the other.
  // `belowDem`: only craters the raster under this point cannot show are added, those with
  // a radius below belowDem x its pixel size (fading out over the upper half of that
  // range). Where there is no raster every size is added.
  // `ageSkew` (default 1: freshness spread evenly): above 1 most craters are worn down and
  // only a few are fresh, deep bowls (their full depth/rim), as on a surface in equilibrium.
  craters(def) {
    const classes = [];
    const INFL = 2.2, OMAX = 0.6;
    for (let R = def.radius[1], n = 0; R >= def.radius[0] && n < 24; R /= 2, n++) {
      // memo*: the craters of the 2x2x2 lattice block looked up last (see fn below)
      for (let l = 0; l < (def.layers || 1); l++) classes.push({ R, cell: 2 * (INFL + OMAX) * R, seed: def.seed * 101 + n * 7 + l * 1013, last: true, list: null, count: 0, buf: null, memoX: NaN, memoY: NaN, memoZ: NaN, memoN: 0, memo: new Float64Array(40) });
    }
    const density = def.density, depthK = def.depth ?? 0.2, rimK = def.rim ?? 0.04;
    // `floor` (0..0.9): the share of the radius that is a flat floor (0: a bowl). With a
    // small rim that is a caldera or a lava-filled basin, not an impact bowl.
    const floorK = def.floor || 0;
    const smi = def.slopeMaskInv, radius = def.planetRadius, below = def.belowDem || 0, skew = def.ageSkew ?? 1;
    let add = 0, slope = 0;

    // Fills cr[] = centre x,y,z, radius, age for the crater of lattice cell (ix,iy,iz), if any.
    const cr = new Float64Array(5);
    const craterOf = (cls, ix, iy, iz) => {
      const h0 = hash3(ix, iy, iz, cls.seed);
      if ((h0 & 0xffff) / 65536 >= density) return false;
      const cell = cls.cell;
      const cx = (ix + 0.5) * cell, cy = (iy + 0.5) * cell, cz = (iz + 0.5) * cell;
      const tol = OMAX * cls.R;
      if (Math.abs(Math.sqrt(cx * cx + cy * cy + cz * cz) - radius) > cell * 0.87 + tol) return false;   // cell nowhere near the surface
      const h1 = hash3(ix, iy, iz, cls.seed + 1), h2 = hash3(ix, iy, iz, cls.seed + 2);
      const qx = cx + ((h1 & 0xffff) / 65536 - 0.5) * cell, qy = cy + ((h1 >>> 16) / 65536 - 0.5) * cell, qz = cz + ((h2 & 0xffff) / 65536 - 0.5) * cell;
      const qlen = Math.sqrt(qx * qx + qy * qy + qz * qz);
      if (Math.abs(qlen - radius) > tol) return false;        // centre too far above / below the ground
      const ql = radius / qlen;
      cr[0] = qx * ql; cr[1] = qy * ql; cr[2] = qz * ql;
      cr[3] = cls.R * (0.5 + 0.5 * ((h2 >>> 16) / 65536));
      const u = (h0 >>> 16) / 65536;
      cr[4] = 0.35 + 0.65 * (skew === 1 ? u : Math.pow(u, skew));   // age: older = shallower, softer
      return true;
    };
    // Adds one crater's profile at the current point.
    const apply = (c, qx, qy, qz, r, age, lod) => {
      const ex = c.px - qx, ey = c.py - qy, ez = c.pz - qz;
      const d2 = ex * ex + ey * ey + ez * ez, infl = r * INFL;
      if (d2 >= infl * infl) return;
      // slightly irregular outline: no two craters are perfect circles
      const wob = 1 + 0.09 * noise3(ex / r * 1.3 + qx * 1e-3, ey / r * 1.3 + qy * 1e-3, ez / r * 1.3 + qz * 1e-3);
      const t = Math.sqrt(d2) / r * wob;                     // 0 centre, 1 rim
      if (t >= INFL) return;
      const depth = depthK * r * age, rim = rimK * r * age;
      let v, dv;
      if (t < 1 && floorK > 0) { const w = 1 - smoothstep(floorK, 1, t); v = rim - (depth + rim) * w; dv = (depth + rim) * 2 / r * smoothstep(floorK, 1, t); }
      else if (t < 1) { const t2 = t * t; v = rim - (depth + rim) * (1 - t2) * (1 - 0.35 * t2 * (1 - age)); dv = (depth + rim) * 2 * t / r; }
      else { const fade = 1 - smoothstep(1.25, INFL, t); const t4 = t * t * t * t; v = rim * fade / (t * t * t); dv = (depth + rim) * 2 / (t4 * r); }   // dv stays continuous across the rim
      add += v * lod; if (dv * lod > slope) slope = dv * lod;
    };

    const fn = (c) => {
      const mask = smi ? 1 - smoothstep(smi[0], smi[1], c.slope) : 1;
      if (mask <= 0) return;
      add = 0; slope = 0;
      for (let ci = 0; ci < classes.length; ci++) {
        const cls = classes[ci];
        if (cls.R * 2 <= c.minWL) { if (cls.last) break; continue; }   // classes run large -> small within a layer
        let lod = Math.min(1, cls.R * 2 / c.minWL - 1);
        if (below) {
          const lim = below * c.res;                                   // the raster shows craters larger than this
          if (cls.R >= lim) continue;
          if (cls.R > lim * 0.5) lod *= 2 - 2 * cls.R / lim;
        }
        const list = cls.list;
        if (list) {                                           // craters pre-collected for this region
          for (let k = 0; k < cls.count; k++) apply(c, list[k * 5], list[k * 5 + 1], list[k * 5 + 2], list[k * 5 + 3], list[k * 5 + 4], lod);
          continue;
        }
        const inv = 1 / cls.cell;
        const bx = Math.floor(c.px * inv - 0.5), by = Math.floor(c.py * inv - 0.5), bz = Math.floor(c.pz * inv - 0.5);
        // Neighbouring samples (along a chunk row, along a shadow ray) nearly always fall
        // in the same lattice block: its craters are looked up once and remembered.
        // Hashing eight cells per class per sample was most of the cost of a lunar chunk.
        const memo = cls.memo;
        if (bx !== cls.memoX || by !== cls.memoY || bz !== cls.memoZ) {
          cls.memoX = bx; cls.memoY = by; cls.memoZ = bz;
          let m = 0;
          for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            if (craterOf(cls, bx + dx, by + dy, bz + dz)) { memo[m] = cr[0]; memo[m + 1] = cr[1]; memo[m + 2] = cr[2]; memo[m + 3] = cr[3]; memo[m + 4] = cr[4]; m += 5; }
          }
          cls.memoN = m;
        }
        for (let m = 0; m < cls.memoN; m += 5) apply(c, memo[m], memo[m + 1], memo[m + 2], memo[m + 3], memo[m + 4], lod);
      }
      c.h += add * mask;
      if (slope * mask > c.slope) c.slope = slope * mask;
    };
    // Region mode: when many points inside one small region are evaluated (a chunk), the
    // craters of every class whose lattice is coarser than the region are collected once.
    fn.prepare = (px, py, pz, rho) => {
      for (const cls of classes) {
        cls.list = null;
        if (cls.cell < rho * 0.4) continue;
        const cell = cls.cell, reach = rho + cls.R * (INFL + OMAX) + cell * 0.5;
        if (!cls.buf) cls.buf = new Float64Array(5 * 256);
        let n = 0;
        const x0 = Math.floor((px - reach) / cell), x1 = Math.floor((px + reach) / cell);
        const y0 = Math.floor((py - reach) / cell), y1 = Math.floor((py + reach) / cell);
        const z0 = Math.floor((pz - reach) / cell), z1 = Math.floor((pz + reach) / cell);
        for (let iz = z0; iz <= z1; iz++) for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
          if (n >= 256 || !craterOf(cls, ix, iy, iz)) continue;
          const dx = cr[0] - px, dy = cr[1] - py, dz = cr[2] - pz, lim = rho + cr[3] * INFL;
          if (dx * dx + dy * dy + dz * dz > lim * lim) continue;
          cls.buf.set(cr, n * 5); n++;
        }
        cls.list = cls.buf; cls.count = n;
      }
    };
    fn.release = () => { for (const cls of classes) cls.list = null; };
    return fn;
  },

  // The shape of a body that is far from a sphere and has no elevation map: the surface of
  // an ellipsoid with semi-axes `radii` [a, b, c] (along x, y, z), as a height above datum.
  ellipsoid(def) {
    const [a, b, cc] = def.radii, R = def.planetRadius;
    return (c) => {
      const r = 1 / Math.sqrt((c.x / a) * (c.x / a) + (c.y / b) * (c.y / b) + (c.z / cc) * (c.z / cc));
      c.h += r - R;
    };
  },

  // Long straight landforms in families: grooves, ridges, double ridges, dunes. A family is
  // a set of parallel bands round the sphere (circles of equal distance from the family's
  // great circle, whose pole is random or given in `poles` as [lat, lon] degrees).
  //   spacing (m) between band centres, width (m) of one, height (m; negative: a trough)
  //   profile: 'ridge' (default), 'double' (two crests with a trough between), 'dune'
  //            (a gentle windward side and a steep lee side)
  //   presence: share of the bands that exist; segment (m): each runs for about this far
  //            and fades out (0: all the way round); wobble [amplitude, wavelength] (m)
  //   varied: 0..1, how much heights differ from one band to the next
  //   bands [first, last]: only these bands of each family, counted from its great circle
  //            (0 is the first one north of it): a handful of named fractures, not a field
  lineaments(def) {
    const fams = [];
    const n = def.poles ? def.poles.length : (def.families || 1), R = def.planetRadius;
    for (let k = 0; k < n; k++) {
      let px, py, pz;
      if (def.poles) { const la = def.poles[k][0] * Math.PI / 180, lo = def.poles[k][1] * Math.PI / 180; px = Math.cos(la) * Math.cos(lo); py = Math.cos(la) * Math.sin(lo); pz = Math.sin(la); }
      else {
        const u = hash3(k, 1, 0, def.seed) / 4294967296 * 2 - 1, a = hash3(k, 2, 0, def.seed) / 4294967296 * 2 * Math.PI, q = Math.sqrt(1 - u * u);
        px = q * Math.cos(a); py = q * Math.sin(a); pz = u;
      }
      fams.push({ px, py, pz, seed: def.seed * 131 + k * 977 });
    }
    const S = def.spacing, W = def.width, H = def.height, presence = def.presence ?? 1, seg = def.segment || 0, varied = def.varied ?? 0.5;
    const wob = def.wobble || null, jitter = Math.max(0, Math.min(0.5 - W / S, def.jitter ?? 0.3));
    const kind = def.profile === 'double' ? 1 : def.profile === 'dune' ? 2 : 0;
    const only = def.bands || null;
    // (segmentLevel: -1..1, the noise level a band must exceed to exist at a place; low: few gaps)
    const segLevel = def.segmentLevel ?? 0.1;
    const shape = (t) => {                       // t = signed offset / width, |t| < 1
      const a = Math.abs(t);
      if (kind === 1) { const o = (a - 0.55) / 0.45, m = o * o < 1 ? (1 - o * o) * (1 - o * o) : 0, v = a < 0.4 ? (1 - (a / 0.4) * (a / 0.4)) : 0; return m - 0.45 * v * v; }
      if (kind === 2) { const u = (t + 1) / 2; return u < 0.72 ? smoothstep(0, 0.72, u) : 1 - smoothstep(0.72, 1, u); }
      return (1 - a * a) * (1 - a * a);
    };
    return (c) => {
      if (W * 2 <= c.minWL) return;
      const lod = Math.min(1, W * 2 / c.minWL - 1);
      let add = 0, slope = 0;
      for (let f = 0; f < fams.length; f++) {
        const F = fams[f];
        const d = c.x * F.px + c.y * F.py + c.z * F.pz;
        let sdist = Math.asin(d > 1 ? 1 : d < -1 ? -1 : d) * R;
        if (wob) sdist += wob[0] * noise3(c.px / wob[1] + F.seed * 0.37, c.py / wob[1] - F.seed * 0.11, c.pz / wob[1] + 5.3);
        const k0 = Math.floor(sdist / S);
        for (let k = k0 - 1; k <= k0 + 1; k++) {
          if (only && (k < only[0] || k > only[1])) continue;
          const h0 = hash3(k, 7, 3, F.seed);
          if ((h0 & 0xffff) / 65536 >= presence) continue;
          const centre = (k + 0.5 + jitter * (((h0 >>> 16) / 65536) * 2 - 1)) * S;
          const t = (sdist - centre) / W;
          if (t <= -1 || t >= 1) continue;
          let m = 1 - varied * (hash3(k, 9, 1, F.seed) / 4294967296);
          if (seg) m *= smoothstep(segLevel - 0.15, segLevel + 0.15, noise3(c.px / seg + k * 17.31 + F.seed, c.py / seg - k * 5.77, c.pz / seg + k * 3.19));
          if (m <= 0) continue;
          add += shape(t) * m;
          const e = m * Math.min(1, (1 - Math.abs(t)) * 4);       // (to nothing at the band's edge: c.slope must be continuous)
          if (e > slope) slope = e;
        }
      }
      c.h += add * H * lod;
      const sl = Math.abs(H) / W * 1.6 * slope * lod;
      if (sl > c.slope) c.slope = sl;
    };
  },

  // Ground broken into cells (3-D Worley cells of about `scale` metres):
  //   trough [depth, width] (m): a furrow along every cell wall (convecting ice plains)
  //   dome (m): each cell bulges by this much at its middle (negative: a hollow, with the
  //             walls left standing as ridges)
  //   plate (m): each cell is a block lifted or dropped by up to this much, `edge` metres of
  //             slope at its sides (broken, rafted crust)
  cells(def) {
    const S = def.scale, seed = def.seed, trough = def.trough || null, dome = def.dome || 0, plate = def.plate || 0, edge = def.edge || S * 0.08;
    const memo = new Float64Array(27 * 4);
    let mx = NaN, my = NaN, mz = NaN;
    return (c) => {
      if (S <= c.minWL) return;
      const lod = Math.min(1, S / c.minWL - 1);
      const gx = c.px / S, gy = c.py / S, gz = c.pz / S;
      const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
      if (ix !== mx || iy !== my || iz !== mz) {
        mx = ix; my = iy; mz = iz;
        let m = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const h1 = hash3(ix + dx, iy + dy, iz + dz, seed), h2 = hash3(ix + dx, iy + dy, iz + dz, seed + 1);
          // (each centre in the middle 0.4 of its cell: the second-nearest is then never
          // farther than 1.25 cells and none outside these 27 is nearer than 1.3; with centres
          // anywhere in their cells the answer changed across lattice planes, as a wall)
          memo[m] = ix + dx + 0.3 + 0.4 * (h1 & 0xffff) / 65536; memo[m + 1] = iy + dy + 0.3 + 0.4 * (h1 >>> 16) / 65536; memo[m + 2] = iz + dz + 0.3 + 0.4 * (h2 & 0xffff) / 65536; memo[m + 3] = (h2 >>> 16) / 65536;
          m += 4;
        }
      }
      let f1 = 1e9, f2 = 1e9, id = 0;
      for (let m = 0; m < 108; m += 4) {
        const ex = memo[m] - gx, ey = memo[m + 1] - gy, ez = memo[m + 2] - gz, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < f1) { f2 = f1; f1 = d2; id = memo[m + 3]; } else if (d2 < f2) f2 = d2;
      }
      const wall = (Math.sqrt(f2) - Math.sqrt(f1)) * 0.5 * S;        // about the distance to the cell's wall (m)
      let add = 0, sl = 0;
      if (trough) { const w = Math.min(1, lodW(trough[1], c.minWL)); if (w > 0) { add -= trough[0] * (1 - smoothstep(0, trough[1], wall)) * w; sl = Math.max(sl, Math.abs(trough[0]) / trough[1] * 1.5 * w); } }
      if (dome) add += dome * smoothstep(0, S * 0.35, wall);
      if (plate) { const w = Math.min(1, lodW(edge, c.minWL)); add += plate * (id * 2 - 1) * smoothstep(0, edge, wall) * (0.35 + 0.65 * w); sl = Math.max(sl, plate / edge * w); }
      c.h += add * lod;
      if (sl * lod > c.slope) c.slope = sl * lod;
    };
  },

  // Named mountains that no elevation map shows: `list` of [latitude, longitude east
  // (degrees), height (m), radius (m)]. Each is a tilted block with a broad top, steep on
  // one side (a crustal block thrust up), for later layers to carve.
  massifs(def) {
    const R = def.planetRadius, items = def.list.map(([la, lo, h, r], k) => {
      const a = la * Math.PI / 180, b = lo * Math.PI / 180, t = hash3(k, 3, 1, def.seed) / 4294967296 * 2 * Math.PI;
      // (the tilt's direction: a random heading in the tangent plane at the block's centre)
      const x = Math.cos(a) * Math.cos(b), y = Math.cos(a) * Math.sin(b), z = Math.sin(a);
      const ex = -Math.sin(b), ey = Math.cos(b), nx = -Math.sin(a) * Math.cos(b), ny = -Math.sin(a) * Math.sin(b), nz = Math.cos(a);
      return { x, y, z, h, r, tx: ex * Math.cos(t) + nx * Math.sin(t), ty: ey * Math.cos(t) + ny * Math.sin(t), tz: nz * Math.sin(t), seed: def.seed + k * 7.7 };
    });
    const fn = (c) => {
      for (let k = 0; k < items.length; k++) {
        const m = items[k], dot = c.x * m.x + c.y * m.y + c.z * m.z;
        if (dot < 0.5) continue;
        const d = Math.acos(dot > 1 ? 1 : dot) * R;
        if (d >= m.r * 1.25) continue;
        // an irregular outline, then the block's profile and its tilt
        const wob = 1 + 0.22 * noise3(c.px / (m.r * 0.45) + m.seed, c.py / (m.r * 0.45), c.pz / (m.r * 0.45));
        const t = d / (m.r * wob);
        if (t >= 1) continue;
        // a tilted block: it climbs from its low side to a crest near the far edge and
        // falls off steeply all round; uneven, so later layers have slopes to carve
        const side = ((c.px - m.x * R) * m.tx + (c.py - m.y * R) * m.ty + (c.pz - m.z * R) * m.tz) / m.r;
        const ramp = Math.min(1, Math.max(0, 0.5 + side * 0.8));
        const edge = 1 - smoothstep(0.6, 1, t);
        const rough = 0.8 + 0.2 * noise3(c.px / (m.r * 0.3) + 3.3, c.py / (m.r * 0.3) + m.seed, c.pz / (m.r * 0.3)) + 0.12 * noise3(c.px / (m.r * 0.11) + 1.3, c.py / (m.r * 0.11), c.pz / (m.r * 0.11) + m.seed);
        c.h += m.h * edge * ramp * rough;
        // (continuous, and nothing at the outline: later layers are masked by it)
        const sl = Math.max(0.22 * edge * ramp, m.h / (m.r * 0.4) * (0.3 + (ramp - 0.3) * smoothstep(0.6, 0.75, t)) * (1 - smoothstep(0.9, 1, t)));
        if (sl > c.slope) c.slope = sl;
      }
    };
    // The tallest block within `reach` metres of a place (for the shadow rays' ceiling).
    fn.top = (x, y, z, reach) => {
      let top = 0;
      for (let k = 0; k < items.length; k++) {
        const m = items[k], dot = x * m.x + y * m.y + z * m.z;
        if (Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot) * R < m.r * 1.25 + reach && m.h * 1.15 > top) top = m.h * 1.15;
      }
      return top;
    };
    return fn;
  },

  // A sea: no ground lies below `level` (m). Put it last, so the water stays flat.
  // With an elevation map the map decides where the shore is: what it has below the level
  // is water (as deep as it says), and what it has above is land, on which the layers
  // before this one fade out toward the water's edge (they would dig pools into a beach
  // and raise islets off it).
  sea(def) {
    const level = def.level ?? 0;
    // beach (def.beach, 0..1; 1 or absent: none): the map's ground within 12 metres above
    // and below the sea's level is flattened toward it, to this share of its height at the
    // very shore: a beach and shallows several times as wide as the map's slope gives, for
    // the tide to move over (on a steep shore the sea's rise and fall was a band a few
    // metres wide). A made world asks for it; a real one keeps its shore.
    // (the rule is shoreUp in dem.js: the mosaics a made world's rivers are worked out on use it too)
    const beach = def.beach ?? 1, shore = (up) => shoreUp(up, beach);
    return (c) => {
      let map = c.map;
      if (map != null) {
        // (the shore as it is drawn and walked on: everything below reads this for the map)
        const up0 = map - level, up = shore(up0);
        if (up !== up0) { c.h += up - up0; map = level + up; }
        // (as deep as the map says from the very edge: a floor on the depth was a step in what
        // a walker stands on; water with no bed in the map at all still gets a hand's depth)
        // (not inside a lake: a deep lake's bed can lie under the sea's level, its water does not)
        const dem = c.dem;
        if (up <= 0 && !(dem.lakeS >= 1)) { c.water = up < -0.02 ? -up : up === 0 ? 0.5 : 0.02; c.h = level; c.slope = 0; return; }
        // a lake (its bed is in the map, its level comes with the ring) and its shore, on which
        // the layers before this one fade out toward the water's edge, as at the sea's.
        // lakeS: 1 in the lake and on its shore, easing to 0 half a pixel past the last cell
        // that knows the level; water and fading both go by it, so neither ends at a pixel's edge.
        let tapL = 0, tapS = 0;
        if (dem.lakeS > 0) {
          const L = dem.lakeL, s = dem.lakeS, upL = map - L;
          const t = upL <= 0 ? 0 : upL < 6 ? upL / 6 : 1, k = t * t * (3 - 2 * t), kf = 1 - (1 - k) * s;
          let g = map + (c.h - map) * kf;
          // (never under the map below the level, nor less than a quarter of the way up above it)
          const low = upL > 0 ? L + upL * 0.25 : map; if (g < low) g += (low - g) * s;
          if (s >= 1 && L > g) { c.water = L - g; c.h = L; c.slope = 0; return; }
          c.h = g; c.slope *= kf;
          if (s < 1) { tapL = L; tapS = s; }
        }
        // a river: water between its banks, a bed rounded across it, and the land beside it
        // brought to the water's edge (down to it, or up to it where the ground is lower: a
        // bank that rises to the water, not a wall at either edge of it)
        let bank = false;
        if (dem.rivS < 1e8) {
          const a = dem.rivA, s = dem.rivS, L = dem.rivL, wide = 4 + a * 1.2;
          // (for the far ground, whose samples stand for more than the river's width (dem.cover),
          // the bed and the banks are not cut: a notch the patch's mesh cannot hold was a row of
          // teeth along every far river. The river is laid on the ground as it lies: far = 1.)
          const far = dem.cover > a ? (dem.cover >= 2 * a ? 1 : (dem.cover - a) / a) : 0;
          if (s < a) { const u = s / a; c.water = 0.02 + dem.rivD * (1 - u * u); c.h = L + (c.h - L) * far; c.slope *= far; c.flowE = dem.rivE; c.flowN = dem.rivN; return; }
          if (s < a + wide) { const u = (s - a) / wide, k0 = u * u * (3 - 2 * u), k = k0 + (1 - k0) * far; c.h = L + 0.05 + (c.h - L - 0.05) * k; c.slope *= k; bank = true; }
        }
        // (past the last cell that knows a lake's level its water thins to nothing)
        if (tapS > 0) { const depth = (tapL - c.h) * tapS; if (depth > 0) { c.water = depth; c.h += depth; c.slope = 0; return; } }
        if (bank) return;
        if (up < 6) {
          const t = up / 6, k = t * t * (3 - 2 * t), h = level + up + (c.h - map) * k;
          c.h = h > level + up * 0.25 ? h : level + up * 0.25; c.slope *= k;
        }
        return;
      }
      if (c.h >= level + 2) return;
      // (the slope fades to nothing across the shore instead of stopping at it)
      const t = Math.max(0, (c.h - level) / 2);
      c.slope *= t;
      // (how deep the water is here: its colour, its waves and what stands in it follow)
      if (c.h < level) { c.water = level - c.h; c.h = level; }
    };
  },
};
