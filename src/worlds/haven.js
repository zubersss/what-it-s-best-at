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
  // Its year, for everything that lives by the season (life/season.js): 48 of its days from
  // one spring to the next, twelve to a season, short enough to live through. `at`: on that
  // date the life's calendar reads that day of 365.25 (counted as in the northern half): the
  // scene's morning reads what Earth's calendar read on its date, the first day of spring at
  // the opening place in the south. The Sun is not on this year: it stays on its orbit.
  year: { days: 48, at: ['2024-09-22T17:00:00Z', 265] },

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
      // (No layered rock: beds standing as benches, even only on the steepest ground, drew level
      // streaks over every mountain side, a wood's grain from a few kilometres. The flanks
      // the maker leaves stand at one slope for long stretches, so "only where it is steep"
      // was everywhere on them. Rock on this world is blocks and outcrops, not benches.)
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
    albedoMap: { url: 'data/haven_day_4096.jpg', encoding: 'srgb', mean: [0.1299, 0.1272, 0.0560], strength: 1.0, chroma: 1.0, range: [0.2, 4.5], steep: 0.35 },
    meanAlbedo: [0.14, 0.12, 0.07],
    dust: [0.19, 0.17, 0.115],         // dry soil, warm
    sand: [0.32, 0.27, 0.18],
    scree: [0.20, 0.165, 0.125],
    rock: [0.19, 0.15, 0.105],         // warm rock (ochre, not red)
    strata: { period: 260, contrast: 0.1, finePeriod: 30, fine: 0.03, flat: 0, colors: [[0.95, 0.80, 0.60], [0.74, 0.58, 0.44], [0.92, 0.84, 0.68], [0.62, 0.52, 0.44], [0.86, 0.68, 0.48]] },
    slopes: { dustMax: 0.36, screeMin: 0.55, screeMax: 0.8, rockMin: 1.0 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.25,
    // tide: its moon and the Sun (App.updateTide; metres an ocean over the whole world would rise, and a shore's gain)
    sea: { level: 0, color: [0.008, 0.030, 0.070], roughness: 0.10, ripples: 0.07, tide: { by: [['mira', 0.40], ['sun', 0.16]], gain: 3 } },
    // (far: boulders and outcrops as far as they can be seen, rocks/farRocks.js; the numbers'
    // meaning and the defaults: rocks/rockBlock.js)
    // (the stones underfoot stop at 1.4 m: from there up a rock is the land's own, `far`, the same
    // block at the same place from kilometres off to arm's length; with both making 2 m
    // rocks there were doubled ones, and near ones that shrank away as one walked off)
    rocks: { count: 300, radius: 110, size: [0.3, 0.7], albedo: [0.24, 0.17, 0.12], far: { albedo: [0.25, 0.2, 0.145], clear: [[-48.54992, 49.05567, 60]], check: { steep: [-48.8066, 47.22265], level: [-54.4271, 39.2697] } } },
  },

  // Air like Earth's in what it does to light (the same Sun, the same blue), standing
  // lower: a deep air on a small world is a thick glowing shell from space.
  atmosphere: {
    topAltitude: 60000,
    surfaceDensity: 1.225,
    occluderAltitude: 0,
    rayleigh: { scattering: [10.3e-6, 24.0e-6, 58.9e-6], scaleHeight: 4500 },
    // haze: the low air of the painted look (see Earth's file)
    // (as thick by the metre as Earth's, so a ridge ten kilometres off is as blue as there; standing
    // lower, so that from the air the land keeps its colours. Half again as thick, the lowland
    // from 12 km was one grey-green.)
    dust: { scattering: [0.3e-4, 0.52e-4, 0.85e-4], absorption: [0.1e-6, 0.1e-6, 0.1e-6], phaseG: [0.5, 0.48, 0.45], scaleHeight: 2000 },
    absorber: { absorption: [1.0e-6, 3.0e-6, 0.14e-6], centerAltitude: 15000, halfWidth: 9000 },
  },

  look: {
    paint: 1, shade: 1.35, colour: 0.7, facets: 0.6, shafts: 1, reliefLight: 1,
    // From up in the air: the ground below nearly clear of the haze (the land toward the
    // horizon keeps all of it), and the shade lifted to a light cool one (render/look.js)
    aloft: { clear: 0.9, sky: 2.6, lift: 0.9 },
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
    trees: { radius: 240, spacing: 7, below: 1500,
      // The far forest (life/farForest.js): the same trees as those within `radius`, at the
      // same places, out to `radius` of their own. `full`: full density out to here, then
      // thinner as (full / distance)^2, the thinned ones standing a little wider.
      far: { full: 450, radius: 5600, below: 6000 }, line: { base: 3548, perDeg: 38.7, from: 0 } },
    grass: { below: 90, mid: 220 },
    // Which flowers grow where (life/grassRules.js: the floras by name): by the land rule's
    // class, and above the tree line the alpine ones (cushions, gentians).
    flowers: { byClass: { 1: 'conifer', 7: 'dry', 8: 'glade', 9: 'parkland', 10: 'steppe', 16: 'barren' }, rules: [{ overLine: 250, flora: 'alpine' }] },
    flora: [
      { near: true, upTo: 0.6, mix: [[6, 2], [5, 2], [0, 1], [64, 1.2], [65, 0.6]] },   // by water: cottonwood, aspen, and cherry and thorn in flower
      { classes: [7, 10, 16, 12], upTo: 0.5, mix: [[2, 2], [1, 2], [9, 2], [0, 1], [64, 1.4], [65, 1.2]] },   // meadows and open dry country: juniper, pinyon, sage; the flowering trees stand here
      { classes: [7, 10, 16, 12], mix: [[2, 2], [1, 2], [9, 2], [0, 1]] },
      { classes: [8, 9], upTo: 0.55, mix: [[0, 5], [2, 1], [5, 0.5], [64, 1.3], [65, 0.5]] },   // parkland and wood edges: ponderosa, cherry
      { classes: [8, 9], mix: [[61, 2], [4, 2], [27, 1], [5, 1], [64, 0.8], [65, 0.4]] },   // high parkland (the opening place): lodgepole, spruce, stone pine, aspen, and the flowering trees among them
      { upTo: 0.35, mix: [[0, 3], [3, 2], [5, 0.4]] },                              // forest, low: ponderosa, Douglas fir
      { upTo: 0.7, mix: [[3, 3], [61, 2], [4, 1], [5, 0.6]] },                      // middle: Douglas fir, lodgepole
      { mix: [[4, 3], [27, 2], [61, 1]] },                                          // high: spruce, stone pine
    ],
  },

  // A day's clouds (made: scripts/make-world-maps.mjs) as a layer overhead, a volume near
  // the traveller, fair-weather heaps where the map is clear (see Earth's file).
  clouds: { map: 'data/haven_clouds_4096.jpg', altitude: 3600, cover: 0.45, shadow: 0.85,
    volume: { base: 1200, thick: 3000, reach: 16000, above: 30000, scale: 4200, dense: 3.4, fair: 0.44, clear: 120 } },

  // The day's weather, made by rule (src/weather/sky/; docs/briefs/clouds-weather-plan.md). So
  // far: the clouds' steering winds (steer.js: a wind by height that changes from day to day)
  // and the clock they run on. seed: which days; epoch: the weather clock's zero; dayStart: the
  // hour (UTC) at which the world's day begins: solar midnight at the opening place (the scene's
  // 17:00 UTC is 08:00 there).
  weather: { recipe: 'made', seed: 23, epoch: '2024-09-01T00:00:00Z', dayStart: 9,
    land: 'data/haven_wxland_1024.u8', peaks: 'data/haven_peaks.json',
    // the day's low wind (m/s on the steering's great circle): calm days near 2, gales near 22,
    // skewed toward the light end; easterly on 15 % of days (src/weather/sky/steer.js)
    steering: { low: { max: 20, least: 1.2, easterly: 0.15, easterlyMax: 9, shape: 1.15, change: 0.25 } },
  },

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2024-09-22T17:00:00Z',   // an equinox, two hours after sunrise at the opening place: the Sun 19 degrees up in the north-east
    // Open ground 1 400 m up in the far south of the middle continent: the land falls a
    // kilometre to a lake in the south-east, and peaks stand 1 800 m higher round it, with
    // snow on them (scripts/find-haven-site.mjs --open --lat 28,52).
    // (the very spot: level ground at the lip of a slope, a range across the view beyond the low
    // ground: scripts/find-overlook.mjs, then a sketch by scripts/peek.mjs; then moved 66 m to
    // where no tree stands between the low Sun and the view: the pine beside the first spot
    // laid its shadow across the whole foreground: scripts/tree-shadows-at.mjs --search 75)
    start: { lat: -48.54992, lon: 49.05567, eye: 1.7, heading: 222, pitch: -2 },
    ship: { east: -30, north: -45, heading: 30 },
    // (coverFrom, globe: the small globe from space is held where its colours show: see post.js)
    exposure: { key: 0.18, min: 0.5, max: 2.0e5, speed: 1.6, shadowFloor: 0.2, highlight: 6, coverFrom: 0.0006, globe: 0.3 },
    // The heaviest views, for the benchmark's cost test: among the trees, and the land from the air.
    costViews: [
      { name: 'in the forest', lat: 22.983, lon: 129.507, heading: 6, pitch: -4 },
      { name: 'from the air', lat: -48.54992, lon: 49.05567, alt: 5000, heading: 235, pitch: -14 },
    ],
    bookmarks: {
      ledge: { label: 'The first morning', heading: 222, pitch: -2, fov: 60 },
      sun: { label: 'The Sun coming up', heading: 64, pitch: 12, fov: 40 },
      wall: { label: 'The range across the valley', heading: 250, pitch: 3, fov: 26 },
      ship: { label: 'The lander', east: -20, north: -12, heading: 230, pitch: 3, fov: 50 },
      dusk: { label: 'Evening', heading: 275, pitch: 0, fov: 60, timeOffsetHours: 9.6 },
      // The day's weather (sky A's model, seed 23; the hours from find-weather --scene, the
      // places and headings asked of the model): not benchmarked (only the first five are).
      mist: { label: 'Morning mist', heading: 240, pitch: -14, fov: 55, timeOffsetHours: -0.5 },
      storm: { label: 'Afternoon storm', heading: 243, pitch: 4, fov: 45, timeOffsetHours: 8.25 },
      front: { label: 'A front coming', heading: 280, pitch: 4, fov: 55, timeOffsetHours: 33 },
      crown: { label: 'Wind on the Crown', lat: 13.362, lon: 68.95, heading: 0, pitch: 8, fov: 45, timeOffsetHours: 53 },
    },
  },
  places: [
    { id: 'landing', name: 'The first morning', fact: 'Where the journey on Haven begins.', lat: -48.54992, lon: 49.05567 },
    { id: 'eastshore', name: 'The golden shore', fact: 'Dry grassland running down to the eastern sea.', lat: 18.501, lon: 132.671 },
    { id: 'northwood', name: 'The north wood', fact: 'Tall forest on a shoulder of the northern range, over the sea.', lat: 22.983, lon: 129.507 },
    { id: 'crown', name: 'The Crown', fact: 'The highest ground on Haven: 4 314 m.', lat: 15.425, lon: 68.95 },
    { id: 'longwater', name: 'Longwater', fact: 'The largest lake: two thousand square kilometres, held 420 m above the sea.', lat: -10.77, lon: 253.7 },
    { id: 'deepwell', name: 'The Deepwell', fact: 'A small lake 840 m deep, shut in by mountains.', lat: -31.07, lon: 17.45 },
    { id: 'skymere', name: 'Skymere', fact: 'The highest lake, two kilometres up.', lat: -44.25, lon: 24.83 },
  ],
};
