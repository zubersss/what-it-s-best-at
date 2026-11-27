// What grows where. The land-cover class of a place (MODIS, the IGBP legend: 1..17) and
// how tall its canopy is (GEDI) come from the map tiles (terrain/tiles); this file says
// what those mean for trees: how closed each class's canopy is, and which trees a class
// means in each part of the world, by the region's own dominant species. No numbers
// about a particular place live here, only what a forester would know of the region.
// (Plain data and arithmetic: it runs in the terrain workers and in Node.)

import { localDay } from './season.js';

// How closed each class's canopy is (share of tree sites taken) and how tall where no
// measurement says (m). Index: the class; 0 = unknown.
export const COVER_DENSITY = [0, 1, 1, 1, 1, 1, 0.5, 0.12, 0.55, 0.22, 0.02, 0.25, 0.01, 0.03, 0.15, 0, 0, 0];
export const COVER_HEIGHT = [0, 18, 30, 16, 20, 18, 2.5, 1.5, 9, 7, 0, 6, 0, 0, 8, 0, 0, 0];
export const CLASS = { ENF: 1, EBF: 2, DNF: 3, DBF: 4, MIXED: 5, SHRUB: 6, OPEN_SHRUB: 7, WOODY_SAVANNA: 8, SAVANNA: 9, GRASS: 10, WETLAND: 11, CROP: 12, URBAN: 13, MOSAIC: 14, ICE: 15, BARREN: 16, WATER: 17 };

// Shapes a tree can have (the meshes are in treeGeometry.js, in this order).
export const ARCH = { CONIFER: 0, PINE: 1, BROADLEAF: 2, TROPICAL: 3, UMBRELLA: 4, BUSH: 5, PALM: 6, SLENDER: 7, BLOSSOM: 8 };

// Species: [name, shape, height against the measured canopy (x), crown width (x), leaf
// colour (linear albedo), trunk colour, deciduous: 0 keeps its leaves, 1 turns and drops
// them (2: turns gold, as larch and aspen do)].
// A tree that flowers has `blossom`: { colour (its petals, linear albedo), from, to (the
// days of the year it is in flower in the northern half of a world; half a year later in
// the southern) }: see bloomOf.
const S = (name, arch, tall, wide, leaf, trunk, fall = 0, blossom = null) => ({ name, arch, tall, wide, leaf, trunk, fall, blossom });
const BARK = [0.16, 0.12, 0.09], PALE = [0.42, 0.40, 0.36], RED = [0.24, 0.13, 0.08], GREY = [0.22, 0.21, 0.19];
export const SPECIES = [
  /* 0 */ S('ponderosa pine', ARCH.PINE, 1.1, 0.9, [0.045, 0.085, 0.03], RED),
  /* 1 */ S('pinyon pine', ARCH.BUSH, 0.75, 1.0, [0.04, 0.075, 0.03], BARK),
  /* 2 */ S('Utah juniper', ARCH.BUSH, 0.6, 1.1, [0.05, 0.08, 0.045], GREY),
  /* 3 */ S('Douglas fir', ARCH.CONIFER, 1.15, 0.9, [0.03, 0.065, 0.03], BARK),
  /* 4 */ S('Engelmann spruce', ARCH.CONIFER, 1.0, 0.75, [0.03, 0.06, 0.04], BARK),
  /* 5 */ S('quaking aspen', ARCH.SLENDER, 0.9, 0.8, [0.08, 0.14, 0.035], PALE, 2),
  /* 6 */ S('Fremont cottonwood', ARCH.BROADLEAF, 1.0, 1.2, [0.07, 0.13, 0.03], GREY, 2),
  /* 7 */ S('coast redwood', ARCH.CONIFER, 1.3, 0.7, [0.03, 0.06, 0.025], RED),
  /* 8 */ S('blue oak', ARCH.BROADLEAF, 0.9, 1.3, [0.06, 0.09, 0.05], GREY, 1),
  /* 9 */ S('big sagebrush', ARCH.BUSH, 0.5, 1.2, [0.10, 0.12, 0.09], GREY),
  /* 10 */ S('sugar maple', ARCH.BROADLEAF, 1.0, 1.1, [0.05, 0.11, 0.025], BARK, 1),
  /* 11 */ S('northern red oak', ARCH.BROADLEAF, 1.05, 1.2, [0.045, 0.10, 0.025], BARK, 1),
  /* 12 */ S('American beech', ARCH.BROADLEAF, 0.95, 1.1, [0.055, 0.12, 0.03], PALE, 2),
  /* 13 */ S('black spruce', ARCH.CONIFER, 0.9, 0.55, [0.025, 0.05, 0.03], BARK),
  /* 14 */ S('balsam fir', ARCH.CONIFER, 1.0, 0.7, [0.03, 0.06, 0.035], BARK),
  /* 15 */ S('loblolly pine', ARCH.PINE, 1.1, 0.85, [0.04, 0.085, 0.03], BARK),
  /* 16 */ S('eastern white pine', ARCH.PINE, 1.2, 0.9, [0.035, 0.075, 0.035], BARK),
  /* 17 */ S('bald cypress', ARCH.CONIFER, 1.0, 0.9, [0.06, 0.11, 0.04], RED, 2),
  /* 18 */ S('kapok', ARCH.TROPICAL, 1.25, 1.3, [0.03, 0.085, 0.02], PALE),
  /* 19 */ S('Brazil nut', ARCH.TROPICAL, 1.15, 1.1, [0.03, 0.08, 0.02], BARK),
  /* 20 */ S('cerrado pequi', ARCH.UMBRELLA, 0.9, 1.1, [0.06, 0.10, 0.03], BARK),
  /* 21 */ S('moriche palm', ARCH.PALM, 1.0, 1.0, [0.05, 0.10, 0.025], GREY),
  /* 22 */ S('monkey puzzle', ARCH.UMBRELLA, 1.2, 0.8, [0.025, 0.06, 0.03], GREY),
  /* 23 */ S('southern beech', ARCH.BROADLEAF, 1.0, 1.0, [0.04, 0.09, 0.03], BARK, 1),
  /* 24 */ S('Norway spruce', ARCH.CONIFER, 1.1, 0.75, [0.025, 0.055, 0.03], BARK),
  /* 25 */ S('Scots pine', ARCH.PINE, 1.0, 0.9, [0.04, 0.08, 0.04], RED),
  /* 26 */ S('European larch', ARCH.CONIFER, 1.0, 0.8, [0.07, 0.13, 0.035], BARK, 2),
  /* 27 */ S('Swiss stone pine', ARCH.PINE, 0.85, 0.9, [0.03, 0.065, 0.035], BARK),
  /* 28 */ S('European beech', ARCH.BROADLEAF, 1.05, 1.2, [0.05, 0.115, 0.025], PALE, 1),
  /* 29 */ S('pedunculate oak', ARCH.BROADLEAF, 1.0, 1.3, [0.045, 0.10, 0.025], BARK, 1),
  /* 30 */ S('silver birch', ARCH.SLENDER, 0.95, 0.8, [0.07, 0.14, 0.03], [0.6, 0.6, 0.58], 2),
  /* 31 */ S('holm oak', ARCH.BROADLEAF, 0.8, 1.2, [0.035, 0.065, 0.03], BARK),
  /* 32 */ S('stone pine', ARCH.UMBRELLA, 1.0, 1.2, [0.035, 0.08, 0.03], RED),
  /* 33 */ S('Dahurian larch', ARCH.CONIFER, 0.95, 0.7, [0.07, 0.13, 0.035], BARK, 2),
  /* 34 */ S('Siberian spruce', ARCH.CONIFER, 1.05, 0.65, [0.025, 0.055, 0.03], BARK),
  /* 35 */ S('Siberian pine', ARCH.PINE, 1.05, 0.9, [0.03, 0.07, 0.035], BARK),
  /* 36 */ S('Mongolian oak', ARCH.BROADLEAF, 0.95, 1.2, [0.05, 0.10, 0.025], BARK, 1),
  /* 37 */ S('Japanese cedar', ARCH.CONIFER, 1.2, 0.7, [0.03, 0.065, 0.03], RED),
  /* 38 */ S('camphor laurel', ARCH.BROADLEAF, 1.0, 1.3, [0.04, 0.095, 0.025], BARK),
  /* 39 */ S('dipterocarp', ARCH.TROPICAL, 1.3, 1.1, [0.03, 0.085, 0.02], PALE),
  /* 40 */ S('teak', ARCH.BROADLEAF, 1.05, 1.1, [0.055, 0.11, 0.03], GREY, 1),
  /* 41 */ S('Himalayan blue pine', ARCH.PINE, 1.1, 0.85, [0.035, 0.075, 0.04], BARK),
  /* 42 */ S('Himalayan fir', ARCH.CONIFER, 1.1, 0.7, [0.025, 0.055, 0.03], BARK),
  /* 43 */ S('Himalayan birch', ARCH.SLENDER, 0.8, 0.9, [0.07, 0.13, 0.03], PALE, 2),
  /* 44 */ S('rhododendron', ARCH.BUSH, 0.6, 1.1, [0.03, 0.07, 0.025], BARK),
  /* 45 */ S('coconut palm', ARCH.PALM, 1.1, 1.0, [0.05, 0.10, 0.025], GREY),
  /* 46 */ S('African mahogany', ARCH.TROPICAL, 1.2, 1.2, [0.03, 0.08, 0.02], BARK),
  /* 47 */ S('umbrella thorn acacia', ARCH.UMBRELLA, 1.0, 1.4, [0.06, 0.10, 0.04], BARK),
  /* 48 */ S('miombo', ARCH.UMBRELLA, 1.0, 1.2, [0.055, 0.10, 0.03], BARK, 1),
  /* 49 */ S('camel thorn', ARCH.UMBRELLA, 1.0, 1.3, [0.06, 0.09, 0.045], BARK),
  /* 50 */ S('baobab', ARCH.BROADLEAF, 1.1, 1.0, [0.06, 0.10, 0.035], [0.3, 0.26, 0.24], 1),
  /* 51 */ S('Atlas cedar', ARCH.CONIFER, 1.1, 1.0, [0.035, 0.07, 0.045], BARK),
  /* 52 */ S('date palm', ARCH.PALM, 1.0, 1.0, [0.05, 0.09, 0.03], GREY),
  /* 53 */ S('river red gum', ARCH.TROPICAL, 1.1, 1.1, [0.07, 0.10, 0.06], [0.5, 0.47, 0.42]),
  /* 54 */ S('mulga', ARCH.BUSH, 0.8, 1.0, [0.07, 0.09, 0.06], GREY),
  /* 55 */ S('mountain ash', ARCH.TROPICAL, 1.3, 0.9, [0.06, 0.095, 0.05], PALE),
  /* 56 */ S('ohia lehua', ARCH.BROADLEAF, 0.9, 1.0, [0.035, 0.075, 0.03], GREY),
  /* 57 */ S('koa', ARCH.UMBRELLA, 1.1, 1.3, [0.045, 0.085, 0.04], GREY),
  /* 58 */ S('mesquite', ARCH.UMBRELLA, 0.8, 1.3, [0.07, 0.11, 0.04], BARK),
  /* 59 */ S('creosote bush', ARCH.BUSH, 0.5, 1.1, [0.07, 0.10, 0.04], GREY),
  /* 60 */ S('Araucaria pine', ARCH.CONIFER, 1.2, 0.8, [0.03, 0.065, 0.03], GREY),
  /* 61 */ S('lodgepole pine', ARCH.PINE, 1.0, 0.6, [0.035, 0.075, 0.03], BARK),
  /* 62 */ S('Sitka spruce', ARCH.CONIFER, 1.25, 0.8, [0.025, 0.055, 0.035], BARK),
  /* 63 */ S('olive', ARCH.BROADLEAF, 0.7, 1.2, [0.08, 0.10, 0.07], GREY),
  /* 64 */ S('wild cherry', ARCH.BLOSSOM, 0.8, 1.25, [0.07, 0.13, 0.035], [0.2, 0.13, 0.11], 1, { colour: [0.62, 0.34, 0.42], from: 62, to: 118 }),
  /* 65 */ S('blackthorn', ARCH.BLOSSOM, 0.5, 1.35, [0.06, 0.11, 0.04], [0.12, 0.1, 0.09], 1, { colour: [0.74, 0.72, 0.72], from: 55, to: 105 }),
];

// How far in flower a tree is on a day of the year (0..365.25) at a latitude: open (0..1:
// how many of its flowers are out; they open over the first ten days and are gone over
// the last twelve) and fall (0..1: how fast its petals come off: a few all the time it
// is in flower, most toward the end).
export function bloomOf(sp, day, lat) {
  const b = sp.blossom; if (!b) return { open: 0, fall: 0 };
  const d = localDay(day, lat), sm = (a, c, x) => { const k = Math.min(1, Math.max(0, (x - a) / (c - a))); return k * k * (3 - 2 * k); };
  const open = sm(b.from, b.from + 10, d) * (1 - sm(b.to - 12, b.to, d));
  return { open, fall: open > 0 ? Math.max(0.5 * open, sm(b.from + 12, b.to - 10, d) * open) : 0 };
}

// Which species a class means at a place: [species, weight] lists. lat, lon (east,
// -180..180), alt (m), near (true beside a river or lake: the trees that follow water).
const mix = (...p) => p;
export function speciesFor(cls, lat, lon, alt, near) {
  const C = CLASS, a = Math.abs(lat);
  const forest = cls >= 1 && cls <= 5, needle = cls === C.ENF || cls === C.DNF, open = cls === C.OPEN_SHRUB || cls === C.SHRUB;
  const savanna = cls === C.SAVANNA || cls === C.WOODY_SAVANNA || cls === C.MOSAIC || cls === C.CROP || cls === C.GRASS;
  // --- Hawaii and the Pacific islands
  if (lon < -140 && lat > -30 && lat < 30) return alt < 60 ? mix([45, 3], [56, 1]) : alt > 1200 ? mix([56, 2], [57, 1]) : mix([56, 3], [57, 2]);
  // --- North America
  if (lon >= -170 && lon < -52 && lat > 14) {
    const west = lon < -100;
    if (lat < 30 && !west) return forest ? mix([15, 2], [11, 1]) : mix([58, 1], [15, 1]);
    if (west) {
      if (near && lat < 42 && alt < 2000) return mix([6, 1]);
      // (open classes high up are parkland of the mountain forests, not desert scrub)
      if ((open || savanna) && alt > 2500) return mix([4, 2], [5, 2], [0, 1]);
      if ((open || savanna) && alt > 2150 && lat < 42) return mix([0, 4], [5, 1], [1, 1]);
      if (open || savanna) return lat < 42 ? (alt > 1500 ? mix([1, 3], [2, 3], [9, 1]) : lon < -118 ? mix([8, 2], [9, 1]) : mix([59, 2], [58, 1], [2, 1])) : mix([9, 2], [61, 1]);
      if (lon < -121 && lat > 37 && alt < 900) return lat > 43 ? mix([62, 2], [3, 2]) : mix([7, 2], [3, 1]);
      if (cls === C.DBF) return mix([5, 1]);
      const line = 4100 - 85 * Math.max(0, a - 25);
      if (alt > line - 700) return mix([4, 3], [5, 1]);
      if (alt > line - 1500) return lat < 42 ? mix([0, 3], [3, 1], [5, 0.5]) : mix([3, 2], [61, 2], [4, 1]);
      return lat < 42 ? mix([0, 2], [1, 1], [2, 1]) : mix([3, 2], [0, 1]);
    }
    if (lat > 47 || cls === C.ENF && lat > 43) return needle || lat > 52 ? mix([13, 3], [14, 2], [5, 1]) : mix([14, 1], [10, 1], [5, 1], [16, 1]);
    if (cls === C.WETLAND && lat < 37) return mix([17, 1]);
    if (needle) return lat < 37 ? mix([15, 1]) : mix([16, 2], [14, 1]);
    return mix([10, 2], [11, 2], [12, 1], lat < 37 ? [15, 1] : [16, 0.5]);
  }
  // --- Central and South America
  if (lon >= -120 && lon < -30 && lat <= 14) {
    if (lat < -36) return needle ? mix([22, 1], [60, 1]) : mix([23, 2], [22, 0.5]);
    if (cls === C.WETLAND || near && alt < 300) return mix([21, 2], [18, 1]);
    if (cls === C.EBF) return alt > 2000 ? mix([23, 1], [19, 1]) : mix([18, 1], [19, 2]);
    if (lat < -20 && needle) return mix([60, 1]);
    return forest ? mix([19, 1], [20, 1]) : mix([20, 3], [58, 1]);
  }
  // --- Europe and the Mediterranean
  if (lon >= -12 && lon < 45 && lat >= 34) {
    if (lat < 44 && alt < 900) return needle ? mix([32, 2], [31, 1]) : forest ? mix([31, 2], [29, 1], [32, 1]) : mix([63, 2], [31, 1], [32, 1]);
    if (alt > 1500) return mix([26, 3], [27, 2], [24, 1]);
    if (lat > 58) return mix([25, 2], [24, 2], [30, 1]);
    if (needle) return mix([24, 3], [25, 1]);
    return mix([28, 3], [29, 2], [30, 0.5], cls === C.MIXED ? [24, 2] : [24, 0.3]);
  }
  // --- northern Asia
  if (lon >= 45 && lat >= 44 || lon < -170 && lat > 50) {
    if (cls === C.DNF || lon > 105 && lat > 55) return mix([33, 4], [30, 1]);
    if (needle) return mix([34, 2], [35, 2], [33, 1]);
    return mix([30, 3], [36, 1], [34, 1]);
  }
  // --- east Asia
  if (lon >= 95 && lon < 150 && lat >= 22 && lat < 44) {
    if (alt > 2600) return mix([42, 2], [43, 1], [44, 1]);
    if (lat < 30 && !needle) return mix([38, 2], [37, 1]);
    return needle ? mix([37, 2], [35, 1]) : mix([36, 2], [38, 1], [37, 1]);
  }
  // --- south and south-east Asia
  if (lon >= 60 && lon < 155 && lat >= -11 && lat < 36) {
    if (alt > 3300) return mix([43, 1], [44, 2]);
    if (alt > 1800) return mix([41, 2], [42, 2], [44, 0.5]);
    if (alt < 40 && (near || cls === C.WETLAND)) return mix([45, 2], [39, 1]);
    if (cls === C.EBF) return mix([39, 1]);
    return forest ? mix([40, 2], [39, 1]) : mix([40, 1], [47, 1]);
  }
  // --- Africa and Arabia
  if (lon >= -20 && lon < 60 && lat < 34) {
    if (lat > 28) return alt > 1200 ? mix([51, 2], [31, 1]) : cls === C.WETLAND || near ? mix([52, 1]) : mix([31, 1], [63, 1], [52, 0.5]);
    if (cls === C.EBF) return mix([46, 1]);
    if (cls === C.WETLAND || near && a < 20 && alt < 400) return mix([52, 1], [47, 1]);
    if (lat < -17 && lon < 22) return mix([49, 3], [47, 1]);                 // the Namib and the Kalahari
    if (lat < -5 && (cls === C.WOODY_SAVANNA || forest)) return mix([48, 3], [50, 0.3]);
    return mix([47, 3], [50, 0.25], [48, 1]);
  }
  // --- Australia and New Zealand
  if (lon >= 110 && lat < -9) {
    if (lon > 165) return mix([23, 1]);
    if (open) return mix([54, 2], [53, 0.5]);
    return cls === C.EBF || forest ? mix([55, 1], [53, 1]) : mix([53, 2], [54, 1]);
  }
  // --- anywhere else: by the class alone
  if (needle) return mix([24, 1]);
  if (cls === C.EBF) return mix([39, 1]);
  if (open) return mix([9, 1]);
  return savanna ? mix([47, 1]) : mix([29, 1], [30, 1]);
}

// A made world's own trees (world.life.flora): a list of
//   { classes: [..] (left out: any class), near: true (only beside a river or a lake),
//     upTo: how far up toward the tree line, 0..1 (left out: all the way),
//     mix: [[species, weight], ...] }
// and the first entry that fits a place says what grows there. up: the place's height as
// a share of the tree line's.
export function floraFor(flora, cls, up, near) {
  for (const f of flora) {
    if (f.near && !near) continue;
    if (f.classes && !f.classes.includes(cls)) continue;
    if (f.upTo != null && up > f.upTo) continue;
    return f.mix;
  }
  return flora[flora.length - 1].mix;
}

// One of a weighted list, by a number in 0..1.
export function pick(list, u) {
  let total = 0; for (const e of list) total += e[1];
  let t = u * total;
  for (const e of list) { t -= e[1]; if (t <= 0) return e[0]; }
  return list[list.length - 1][0];
}

// The altitude above which no tree grows at a latitude (m), roughly.
export function treeLine(lat) { return 4100 - 85 * Math.max(0, Math.abs(lat) - 25); }
