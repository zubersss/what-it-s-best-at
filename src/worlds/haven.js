// Haven — numbers and recipe names only. A made world (milestone 12; the owner's words
// are in CLAUDE.md, "What this game is"): 250 km in radius, so that the horizon bends from
// a few kilometres up and its mountains stand on its edge from space; its land shaped by
// rule to be flown over (scripts/make-world.mjs: continents, ranges, tablelands, valleys
// cut by the water that would run there, lakes where it stands), nothing of it from a
// real map. It is built as Earth is (terrain/tiles, the hydrology, the land cover, the
// trees, the clouds), with a maker in the place of the map services.
//
// Its first biome is everywhere on it for now: a mountain country of conifers, golden
// grass and warm rock (tiles/madeLand.js).

export default {
  id: 'haven',
  name: 'Haven',
  body: 'haven',
  radius: 250000,
  gravity: 9.81,
  dayHours: 24,

  terrain: {
    maxLevel: 14,               // ~24 m chunks (a cube face is 393 km across)
    minAltitude: -100,          // the sea is the floor (see the last layer)
    maxAltitude: 6000,
    shadowRange: 60000,
    shadowHeadroom: 500,
    // The whole world's elevation, made beforehand: 383 m a cell at the equator.
    dems: [
      { url: 'data/haven_dem_4096.i16', width: 4096, height: 2048, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
    ],
    // Mosaics round the traveller, made by rule in the tile worker (tiles/madeTiles.js)
    // from the map above: `made` in the place of a service's address. The elevation ones
    // are for the water alone (rivers and lakes, tiles/hydrology.js; the ground itself is
    // the map and the layers below at any fineness); the picture is the land's colour and
    // what grows on it. Pixels here: 1.5 km at zoom 2 (the whole world), 192 m at 5, 24 m at 8.
    tiles: {
      made: { seed: 7, lakes: 'data/haven_lakes_4096.png', levels: 'data/haven_lakes.json' },
      // (minFlow: what is drawn as a river from each ring, m3/s)
      elevation: { rings: [{ zoom: 2, below: 2.5e5, minFlow: 30 }, { zoom: 5, below: 4.0e4, minFlow: 3 }, { zoom: 8, below: 6.0e3, minFlow: 0.15 }] },
      hydrology: { rain: 'data/haven_rain_720.u8' },
      // (coarser and wider from higher up: 48 m a pixel over 49 km below 5 km, to the whole world above 150 km)
      pictures: { colour: { zoom: 7, below: 1.0e12, zooms: [[7, 5.0e3], [6, 1.2e4], [5, 3.0e4], [4, 6.0e4], [3, 1.5e5], [2, 1.0e12]], cover: { made: true } } },
    },
    layers: [
      { op: 'dem' },
      // What the map cannot hold: relief that grows on slopes (water-cut ground).
      { op: 'fbm', seed: 3, maxWavelength: 60000, minWavelength: 0.8, roughness: 0.82, amp: 26, belowDem: 2.2, slopeGain: [0.04, 0.4, 0.15, 1.0], hetero: 0.5 },
      // Gullies and spurs on the mountain sides and canyon walls.
      { op: 'ridged', seed: 5, maxWavelength: 1400, minWavelength: 20, roughness: 0.9, amp: 260, slopeMask: [0.12, 0.4], warp: 0.3, belowDem: 4 },
      // Layered rock: beds stand as cliffs and benches wherever the ground is steep.
      { op: 'terrace', seed: 7, thickness: 120, cliff: 0.24, rise: 0.7, strength: 0.6, slopeMask: [0.16, 0.36], jitter: 0.35, warpAmp: 25, warpWavelength: 2200 },
      { op: 'terrace', seed: 9, thickness: 20, cliff: 0.18, rise: 0.76, strength: 0.5, slopeMask: [0.2, 0.42], jitter: 0.4, warpAmp: 4, warpWavelength: 260 },
      // The sea: nothing lies below sea level (this layer stays last).
      { op: 'sea', level: 0 },
    ],
  },

  surface: {
    roughness: 0.5,
    bounce: 1.0,
    reliefMap: { url: 'data/haven_slopes_4096.jpg', strength: 2.0, latFade: [84, 89] },
    // Its colours from the air, made by the same rule as the mosaics round the traveller
    // (scripts/make-world-maps.mjs prints `mean`: the land's mean, in linear light).
    albedoMap: { url: 'data/haven_day_4096.jpg', encoding: 'srgb', mean: [0.1378, 0.1233, 0.0674], strength: 1.0, chroma: 1.0, range: [0.2, 4.5], steep: 0.35 },
    meanAlbedo: [0.14, 0.12, 0.07],
    dust: [0.20, 0.165, 0.105],        // dry soil, warm
    sand: [0.32, 0.26, 0.17],
    scree: [0.21, 0.155, 0.11],
    rock: [0.20, 0.13, 0.085],         // warm rock
    strata: { period: 260, contrast: 0.3, finePeriod: 30, fine: 0.14, flat: 0.1, colors: [[0.95, 0.72, 0.52], [0.74, 0.50, 0.38], [0.92, 0.80, 0.64], [0.62, 0.46, 0.38], [0.86, 0.58, 0.40]] },
    slopes: { dustMax: 0.36, screeMin: 0.55, screeMax: 0.8, rockMin: 1.0 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.25,
    // tide: its moon and the Sun (App.updateTide; metres an ocean over the whole world would rise, and a shore's gain)
    sea: { level: 0, color: [0.008, 0.030, 0.070], roughness: 0.10, ripples: 0.07, tide: { by: [['mira', 0.40], ['sun', 0.16]], gain: 3 } },
    rocks: { count: 300, radius: 110, size: [0.3, 3.2], albedo: [0.24, 0.17, 0.12] },
  },

  // Air like Earth's in what it does to light (the same Sun, the same blue), standing
  // lower: a deep air on a small world is a thick glowing shell from space.
  atmosphere: {
    topAltitude: 60000,
    surfaceDensity: 1.225,
    occluderAltitude: 0,
    rayleigh: { scattering: [10.3e-6, 24.0e-6, 58.9e-6], scaleHeight: 4500 },
    // haze: the low air of the painted look (see Earth's file)
    dust: { scattering: [0.45e-4, 0.78e-4, 1.28e-4], absorption: [0.1e-6, 0.1e-6, 0.1e-6], phaseG: [0.5, 0.48, 0.45], scaleHeight: 2400 },
    absorber: { absorption: [1.0e-6, 3.0e-6, 0.14e-6], centerAltitude: 15000, halfWidth: 9000 },
  },

  look: {
    paint: 1, shade: 1.35, colour: 0.7, facets: 0.6, shafts: 1, reliefLight: 1,
    grade: {
      day: { sat: 1.18, contrast: 1.06, tint: 1, shade: [0.84, 1.02, 1.04], light: [1.05, 1.0, 0.93] },
      low: { sat: 1.3, contrast: 1.08, tint: 1, shade: [0.95, 0.86, 1.02], light: [1.12, 0.98, 0.8] },
      dusk: { sat: 1.35, contrast: 1.1, tint: 1, shade: [1.02, 0.74, 0.84], light: [1.16, 0.9, 0.72] },
      night: { sat: 1.1, contrast: 1.05, tint: 1, shade: [0.72, 0.88, 1.18], light: [0.9, 1.0, 1.14] },
    },
  },

  // Trees where the land rule says forest, woodland or parkland; line: where no tree
  // grows (m: base at the equator, less perDeg for every degree of latitude; the land
  // rule's own tree line); flora: what grows, the first entry that fits (life/cover.js:
  // species by number; upTo: how far up toward the tree line).
  life: {
    trees: { radius: 240, spacing: 7, below: 1500, far: { radius: 2000, spacing: 30, below: 5000 }, line: { base: 3548, perDeg: 38.7, from: 0 } },
    grass: { below: 90 },
    flora: [
      { near: true, upTo: 0.6, mix: [[6, 2], [5, 2], [0, 1]] },                    // by water: cottonwood, aspen
      { classes: [7, 10, 16, 12], mix: [[2, 2], [1, 2], [9, 2], [0, 1]] },          // open dry country: juniper, pinyon, sage
      { classes: [8, 9], upTo: 0.55, mix: [[0, 5], [2, 1], [5, 0.5]] },             // parkland: ponderosa
      { classes: [8, 9], mix: [[61, 2], [4, 2], [27, 1], [5, 1]] },
      { upTo: 0.35, mix: [[0, 3], [3, 2], [5, 0.4]] },                              // forest, low: ponderosa, Douglas fir
      { upTo: 0.7, mix: [[3, 3], [61, 2], [4, 1], [5, 0.6]] },                      // middle: Douglas fir, lodgepole
      { mix: [[4, 3], [27, 2], [61, 1]] },                                          // high: spruce, stone pine
    ],
  },

  // A day's clouds (made: scripts/make-world-maps.mjs) as a layer overhead, a volume near
  // the traveller, fair-weather heaps where the map is clear (see Earth's file).
  clouds: { map: 'data/haven_clouds_4096.jpg', altitude: 3600, cover: 0.45, shadow: 0.85,
    volume: { base: 1200, thick: 3000, reach: 16000, above: 30000, scale: 4200, dense: 3.4, change: 0.009, fair: 0.44, clear: 120 } },

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2024-09-22T10:20:00Z',   // an equinox, an hour after sunrise at the opening place
    // A shoulder of the northern range of the east continent, 1 200 m up: water to the
    // north, the range rising behind (scripts/find-haven-site.mjs).
    start: { lat: 22.983, lon: 129.507, eye: 1.7, heading: 6, pitch: -5 },
    ship: { east: -30, north: -45, heading: 30 },
    exposure: { key: 0.18, min: 0.5, max: 2.0e5, speed: 1.6, shadowFloor: 0.2, highlight: 6 },
    bookmarks: {
      ledge: { label: 'The first morning', heading: 6, pitch: -5, fov: 60 },
      sun: { label: 'The Sun over the water', heading: 92, pitch: 12, fov: 40 },
      wall: { label: 'The range behind', heading: 190, pitch: 4, fov: 26 },
      ship: { label: 'The lander', east: -20, north: -12, heading: 230, pitch: 3, fov: 50 },
      dusk: { label: 'Evening', heading: 280, pitch: -3, fov: 60, timeOffsetHours: 10.4 },
    },
  },
  places: [
    { id: 'landing', name: 'The first morning', fact: 'Where the journey on Haven begins.', lat: 22.983, lon: 129.507 },
    { id: 'crown', name: 'The Crown', fact: 'The highest ground on Haven: 4 314 m.', lat: 15.425, lon: 68.95 },
    { id: 'longwater', name: 'Longwater', fact: 'The largest lake: two thousand square kilometres, held 420 m above the sea.', lat: -10.77, lon: 253.7 },
    { id: 'deepwell', name: 'The Deepwell', fact: 'A small lake 840 m deep, shut in by mountains.', lat: -31.07, lon: 17.45 },
    { id: 'skymere', name: 'Skymere', fact: 'The highest lake, two kilometres up.', lat: -44.25, lon: 24.83 },
  ],
};
