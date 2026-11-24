// What covers the land of a made world, by rule: from a place's height, slope, latitude,
// the year's rain and a little noise, its colour seen from the air, its land-cover class
// (the IGBP numbers the trees and the grass already read: life/cover.js) and how tall and
// how closed its canopy is. One rule for the maps made beforehand (scripts/make-world-maps.mjs:
// the globe's colours, the land's colour from far) and for the mosaics made round the
// traveller while the game runs (tileWorker.js): the forest seen from space is where the
// trees stand on the ground.
//
// The numbers are a world's own (`terrain.tiles.made.land` in its file); the defaults are
// a mountain country of conifers, golden grass and warm rock.
// (Plain arithmetic: it runs in the tile worker and in Node.)

import { noise3 } from '../height/noise.js';

const ss = (a, b, x) => { const t = (x - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };

// The two noises of a place the rule asks for (x, y, z: its direction from the world's
// centre; seed: the world's): patches some kilometres across, and some hundreds of metres.
// The maps made beforehand and the mosaics made in the game ask here, so they agree.
function fbm3(x, y, z, f, o) { let a = 1, s = 0, n = 0; x = x * f + o; y = y * f + o * 0.7; z = z * f + o * 1.3; for (let k = 0; k < 3; k++) { s += a * noise3(x, y, z); n += a; a *= 0.5; x *= 2.03; y *= 2.03; z *= 2.03; } return s / n; }
export function landNoise1(x, y, z, seed) { return fbm3(x, y, z, 60, 3.1 + seed); }
export function landNoise2(x, y, z, seed) { return fbm3(x, y, z, 420, 7.7 + seed); }

export const LAND_DEFAULTS = {
  warm: 25,            // degrees C at the sea's level on the equator
  latCool: 0.24,       // ... less this for every degree of latitude
  lapse: 6.2,          // ... and this for every kilometre up
  treeLine: 3.0,       // no trees where it is colder than this (degrees C): 3.5 km up on the equator, 2 km at 40 degrees
  snowLine: -1.5,      // snow lies where it is colder than this: from 2.7 km at 40 degrees
  rockSlope: [0.52, 0.72],   // from here the ground is too steep for soil (bare rock by the second)
  dry: 520, wet: 1500, // the year's rain (mm) between which open country closes into forest
  colours: {           // sRGB bytes, as seen from the air
    forest: [36, 64, 30], woodland: [74, 92, 46], meadow: [128, 138, 60], grass: [176, 150, 78], scrub: [156, 142, 100],
    soil: [160, 124, 84], rock: [150, 116, 84], highRock: [128, 118, 108], tundra: [134, 128, 90],
    snow: [238, 242, 248], sand: [218, 200, 152], shallow: [58, 148, 160], deep: [12, 36, 80], lake: [28, 86, 122],
  },
};

// out: { r, g, b, cls, tall (m), closed (0..1) }. h: metres over the sea (the bed under
// water: h <= 0, or `lake` true with `depth`); slope: metres per metre; lat: degrees;
// rain: mm a year; n1, n2: two noises of the place in -1..1 (patches some kilometres and
// some hundreds of metres across).
export function landAt(L, h, slope, lat, rain, n1, n2, out, lake = false, depth = 0) {
  const C = L.colours;
  if (h <= 0 || lake) {
    const d = lake ? depth : -h, k = ss(0, 260, d), a = lake ? C.lake : C.deep;
    out.r = C.shallow[0] + (a[0] - C.shallow[0]) * k; out.g = C.shallow[1] + (a[1] - C.shallow[1]) * k; out.b = C.shallow[2] + (a[2] - C.shallow[2]) * k;
    out.cls = 17; out.tall = 0; out.closed = 0; return out;
  }
  const tC = L.warm - L.latCool * Math.abs(lat) - L.lapse * h / 1000 + 1.5 * n1;
  // bare rock on steep ground: warm low down, grey high up
  const steep = ss(L.rockSlope[0], L.rockSlope[1], slope), high = ss(1500, 2600, h);
  // how wet the place is for plants: the rain, less on slopes, in patches
  const w = ss(L.dry, L.wet, rain * (1 - 0.35 * ss(0.2, 0.6, slope)) * (1 + 0.3 * n1)) ;
  // trees: closing with wetness, thinning toward the tree line and on steep ground
  const cold = ss(L.treeLine, L.treeLine + 3.5, tC);
  let f = ss(0.22, 0.62, w + 0.2 * n2) * cold * (1 - ss(L.rockSlope[0] - 0.08, L.rockSlope[1] - 0.06, slope));
  // (the valley floors and the tablelands' tops keep meadows open in the forest)
  f *= 1 - 0.55 * ss(0.3, 0.75, n2) * (1 - ss(0.04, 0.16, slope));
  let cls, closed, tall;
  if (f > 0.66) { cls = 1; closed = 1; } else if (f > 0.38) { cls = 8; closed = 0.55; } else if (f > 0.14) { cls = 9; closed = 0.22; } else { cls = w < 0.22 ? 7 : 10; closed = cls === 7 ? 0.12 : 0.02; }
  tall = cls === 7 ? 1.5 : cls === 10 ? 0 : 7 + 20 * w * (0.45 + 0.55 * cold);
  // the ground between the trees: meadow where wet, golden grass, scrub where dry; tundra over the tree line
  const kg = ss(0.25, 0.7, w), ks = 1 - ss(0.12, 0.28, w);
  let r = C.grass[0] + (C.meadow[0] - C.grass[0]) * kg, g = C.grass[1] + (C.meadow[1] - C.grass[1]) * kg, b = C.grass[2] + (C.meadow[2] - C.grass[2]) * kg;
  r += (C.scrub[0] - r) * ks; g += (C.scrub[1] - g) * ks; b += (C.scrub[2] - b) * ks;
  const alp = 1 - cold;
  r += (C.tundra[0] - r) * alp; g += (C.tundra[1] - g) * alp; b += (C.tundra[2] - b) * alp;
  // (bare soil shows through thin grass in dry country)
  const bare = (1 - ss(0.1, 0.45, w)) * 0.5;
  r += (C.soil[0] - r) * bare; g += (C.soil[1] - g) * bare; b += (C.soil[2] - b) * bare;
  // the canopy over it
  const tree = f > 0.66 ? C.forest : C.woodland, share = Math.min(1, f * 1.25);
  r += (tree[0] - r) * share; g += (tree[1] - g) * share; b += (tree[2] - b) * share;
  // rock
  const rk0 = C.rock, rk1 = C.highRock, rr = rk0[0] + (rk1[0] - rk0[0]) * high, rg = rk0[1] + (rk1[1] - rk0[1]) * high, rb = rk0[2] + (rk1[2] - rk0[2]) * high;
  r += (rr - r) * steep; g += (rg - g) * steep; b += (rb - b) * steep;
  if (steep > 0.6) { cls = 16; closed = 0; tall = 0; }
  // a strand along the sea
  const strand = (1 - ss(2, 9, h)) * (1 - ss(0.1, 0.3, slope));
  r += (C.sand[0] - r) * strand; g += (C.sand[1] - g) * strand; b += (C.sand[2] - b) * strand;
  if (strand > 0.5) { cls = 16; closed = 0; tall = 0; }
  // snow: where it is cold enough, lower in some stretches of country than in others (some
  // kilometres across), and off the steep ground, which stands out of it as ribs of rock.
  // (Its edge was a band 650 m of height wide broken by fine noise: on a mountain side that
  // is patches squeezed along the slope, level streaks like a wood's grain from a few
  // kilometres off.)
  const snow = ss(L.snowLine + 1.0, L.snowLine - 1.0, tC + 2.2 * n1 + 0.5 * n2 + 5.0 * ss(0.3, 0.85, slope));
  r += (C.snow[0] - r) * snow; g += (C.snow[1] - g) * snow; b += (C.snow[2] - b) * snow;
  if (snow > 0.5) { cls = 15; closed = 0; tall = 0; }
  // (a little of the patch noise in everything: no two hillsides one flat colour)
  const v = 1 + 0.06 * n2;
  out.r = r * v; out.g = g * v; out.b = b * v; out.cls = cls; out.tall = tall; out.closed = closed;
  return out;
}
