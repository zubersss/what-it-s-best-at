// Earth — numbers and recipe names only. Home, seen the way the other worlds are: real
// elevation, real colour, the true sky. The game opens on places that are bare in
// reality (canyon rock, high mountains, a volcano's summit, a dune sea): there are no
// trees, grass or buildings in this engine, and a forest from the ground would be a lie.
// The Colorado Plateau (latitude, longitude east, radius in metres).
const PLATEAU = [[36.6, 249.0, 330000]];

export default {
  id: 'earth',
  name: 'Earth',
  body: 'earth',
  radius: 6371000,
  gravity: 9.81,
  dayHours: 24,

  terrain: {
    maxLevel: 19,               // ~19 m chunks
    minAltitude: -100,          // the sea is the floor (see the last layer)
    maxAltitude: 9000,
    shadowRange: 200000,
    shadowHeadroom: 700,
    // The open "Terrain Tiles" elevation (SRTM and others; scripts/fetch-earth-terrain.py):
    // the globe at 28 km per pixel and five places at 90 to 190 m.
    dems: [
      { url: 'data/earth_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      { url: 'data/earth_dem_grandcanyon.i16', width: 840, height: 600, lon0: 247.55, lon1: 248.25, lat0: 36.4, lat1: 35.9, feather: 0.06 },
      { url: 'data/earth_dem_everest.i16', width: 900, height: 660, lon0: 86.55, lon1: 87.30, lat0: 28.25, lat1: 27.7, feather: 0.06 },
      { url: 'data/earth_dem_hawaii.i16', width: 900, height: 900, lon0: 203.8, lon1: 205.3, lat0: 20.35, lat1: 18.85, feather: 0.12 },
      { url: 'data/earth_dem_namib.i16', width: 960, height: 720, lon0: 15.1, lon1: 15.9, lat0: -24.45, lat1: -25.05, feather: 0.06 },
      { url: 'data/earth_dem_alps.i16', width: 720, height: 420, lon0: 7.45, lon1: 8.05, lat0: 46.15, lat1: 45.8, feather: 0.06 },
    ],
    // The whole planet, streamed as the traveller moves (terrain/tiles): mosaics of map
    // tiles from services that need no key. Elevation: the same Terrain Tiles set, on AWS
    // Open Data, at 2.4 km, 300 m and 30 m a pixel. Colour: NASA's Blue Marble at 600 m.
    // The maps above stay underneath (and are all there is without a connection).
    tiles: {
      elevation: { url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
        // (minFlow: what is drawn as a river from each ring, m3/s: the great rivers from far,
        // every brook from near)
        rings: [{ zoom: 6, below: 6.0e6, minFlow: 1500 }, { zoom: 9, below: 5.0e5, minFlow: 60 }, { zoom: 12, below: 4.0e4, minFlow: 0.5 }] },
      // Rivers and lakes: read from the elevation where it arrives (tiles/hydrology.js): the
      // rivers fed by the rain that really falls (NASA MERRA-2, scripts/fetch-earth-climate.py),
      // the lakes where the elevation lies level, the large ones checked against the water
      // seen from space (the map the globe's glint uses).
      hydrology: { rain: 'data/earth_rain_720.u8', water: 'data/earth_water_2048.jpg' },
      pictures: { colour: { url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg', zoom: 8, below: 2.0e6,
        // What grows there: the land-cover class of every 500 m (MODIS, the IGBP legend) and
        // how tall its canopy stands (GEDI's laser from the space station), both from NASA
        // GIBS as coloured tiles; the palette file says what each colour means.
        cover: { classes: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual/default/2022-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', classesZoom: 8,
          canopy: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GEDI_ISS_L3_Canopy_Height_Mean_RH100_201904-202303/default/2019-04-18/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png', canopyZoom: 7,
          palette: 'data/earth_cover_palette.json',
          // the painted look from the air: the land wears a clean version of its class's own
          // colour (the mean of the satellite picture over that class, made clearer), this
          // much of it over the satellite's; classes not listed keep the satellite's colour
          paint: 0.6, colours: { 1: [26, 50, 30], 2: [24, 62, 18], 3: [34, 56, 20], 4: [30, 60, 16], 5: [28, 55, 22], 6: [78, 78, 38], 8: [44, 66, 22], 9: [70, 80, 30],
            10: [112, 104, 50], 11: [40, 68, 34], 12: [72, 88, 34], 14: [52, 76, 26] } } } },
    },
    layers: [
      { op: 'dem' },
      // What the maps cannot resolve: relief that grows on slopes (water-cut ground).
      { op: 'fbm', seed: 3, maxWavelength: 60000, minWavelength: 0.8, roughness: 0.82, amp: 26, belowDem: 2.2, slopeGain: [0.04, 0.4, 0.15, 1.0], hetero: 0.5 },
      // Gullies and spurs on the mountain sides and canyon walls.
      // (only what the map under the place cannot show: full under the bundled map from far
      // off, a few metres over the 27 m elevation near the traveller)
      { op: 'ridged', seed: 5, maxWavelength: 1400, minWavelength: 20, roughness: 0.9, amp: 260, slopeMask: [0.12, 0.4], warp: 0.3, belowDem: 4 },
      // Layered rock: beds stand as cliffs and benches wherever the ground is steep.
      // (on the Colorado Plateau, where the beds lie flat for hundreds of kilometres; elsewhere
      // they would draw contour lines on every mountain)
      { op: 'terrace', seed: 7, thickness: 150, cliff: 0.24, rise: 0.7, strength: 0.7, slopeMask: [0.14, 0.34], jitter: 0.35, warpAmp: 25, warpWavelength: 2200, where: { at: PLATEAU } },
      { op: 'terrace', seed: 9, thickness: 22, cliff: 0.18, rise: 0.76, strength: 0.6, slopeMask: [0.18, 0.4], jitter: 0.4, warpAmp: 4, warpWavelength: 260, where: { at: PLATEAU } },
      // The sea: nothing lies below sea level (this layer stays last).
      { op: 'sea', level: 0 },
    ],
  },

  surface: {
    roughness: 0.5,
    bounce: 1.0,
    reliefMap: { url: 'data/earth_slopes_4096.jpg', strength: 2.0, latFade: [84, 89] },
    // NASA's Blue Marble (the globe's own day map; its left edge is longitude -180): the
    // colour of the land from the air. `mean` is the land's mean, so deserts come out
    // bright, forests dark green and ice white.
    albedoMap: { url: 'data/earth_day_4096.jpg', lon0: -180, encoding: 'srgb', mean: [0.2059, 0.1801, 0.1354], strength: 1.0, chroma: 1.0, range: [0.2, 4.5], steep: 0.35 },
    meanAlbedo: [0.19, 0.17, 0.13],
    dust: [0.215, 0.185, 0.14],        // dry soil
    sand: [0.30, 0.25, 0.17],
    scree: [0.20, 0.18, 0.15],
    rock: [0.17, 0.155, 0.14],         // bare rock: steep faces take only a third of the map's colour (snow does not lie on them)
    strata: { period: 310, contrast: 0.3, finePeriod: 36, fine: 0.14, flat: 0.1, colors: [[0.95, 0.78, 0.62], [0.72, 0.55, 0.45], [0.9, 0.82, 0.7], [0.6, 0.5, 0.45], [0.85, 0.6, 0.45]] },
    slopes: { dustMax: 0.36, screeMin: 0.55, screeMax: 0.8, rockMin: 1.0 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.25,
    sea: { level: 0, color: [0.008, 0.030, 0.070], roughness: 0.10, ripples: 0.07 },
    rocks: { count: 300, radius: 110, size: [0.3, 2.6], albedo: [0.22, 0.19, 0.165] },
  },

  atmosphere: {
    topAltitude: 100000,
    surfaceDensity: 1.225,
    occluderAltitude: 0,
    rayleigh: { scattering: [5.8e-6, 13.5e-6, 33.1e-6], scaleHeight: 8000 },
    // haze: the low air of the painted look, blue and thick: a ridge five kilometres off
    // is a flat shape a shade nearer the sky's colour, the next one nearer still. (It
    // scatters blue most, as clean air does, so the far ground goes blue by day and the
    // Sun low through it goes red. A clear day's real haze was a tenth of this, and grey.)
    // (thinner than at first and standing higher: seen from the air the first numbers made
    // the land a grey blur, most of all toward the Sun; on the canyon's rim, 2 100 m up,
    // the air is nearly what it was)
    dust: { scattering: [0.3e-4, 0.52e-4, 0.85e-4], absorption: [0.1e-6, 0.1e-6, 0.1e-6], phaseG: [0.5, 0.48, 0.45], scaleHeight: 4000 },
    // ozone: takes orange light out of long light paths (the blue of dusk)
    absorber: { absorption: [0.65e-6, 1.88e-6, 0.085e-6], centerAltitude: 25000, halfWidth: 15000 },
  },

  // The painted look (render/look.js): light in two tones, shade lit by the sky's colour,
  // clean colours, and a grade for each time of day.
  look: {
    paint: 1, shade: 1.35, colour: 0.7, facets: 0.6, shafts: 1,
    grade: {
      day: { sat: 1.18, contrast: 1.06, tint: 1, shade: [0.84, 1.02, 1.04], light: [1.05, 1.0, 0.93] },
      low: { sat: 1.3, contrast: 1.08, tint: 1, shade: [0.95, 0.86, 1.02], light: [1.12, 0.98, 0.8] },
      dusk: { sat: 1.35, contrast: 1.1, tint: 1, shade: [1.02, 0.74, 0.84], light: [1.16, 0.9, 0.72] },
      night: { sat: 1.1, contrast: 1.05, tint: 1, shade: [0.72, 0.88, 1.18], light: [0.9, 1.0, 1.14] },
    },
  },

  // The weather of one real day (scripts/fetch-earth-weather.py): 8 September 2017, with
  // hurricanes Irma, Jose and Katia in the Atlantic at once.
  weather: { day: '2017-09-08', rain: 'data/earth_rain_2048.jpg', tops: 'data/earth_cloudtop_1024.jpg', cloud: 'data/earth_clouds_512.jpg', storms: 'data/earth_storms.json' },

  // Trees: where the land-cover map says forest, woodland or savanna, of the species the
  // region really grows (life/cover.js), as tall as the canopy was measured.
  // Grass: tufts of blades round the traveller where the land-cover map has grass (life/grass.js).
  life: { trees: { radius: 240, spacing: 7, below: 1500 }, grass: { below: 90 } },

  // Clouds of one real day (the globe's own cloud map) as a layer overhead (see sky/clouds.js).
  // Near the traveller the layer is a volume to fly through: its base at 1 400 m, its
  // tops up to 3 200 m higher where the map is thick, out to 16 km (cloudVolume.js).
  // dense: how solid; change: how fast its shapes turn over; fair: fields of small heaps
  // where the day's map shows no cloud; clear: the cloud is thin this near the eye (m).
  clouds: { map: 'data/earth_clouds_4096.jpg', lon0: -180, altitude: 4500, cover: 0.45, shadow: 0.85,
    volume: { base: 1400, thick: 3600, reach: 16000, above: 30000, scale: 4200, dense: 3.4, change: 0.006, fair: 0.44, clear: 120 } },

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2024-06-21T14:30:00Z',   // the June solstice, an hour and a half after sunrise at the canyon
    // Mather Point on the South Rim of the Grand Canyon: a mile down to the Colorado River
    // and sixteen kilometres across to the North Rim.
    start: { lat: 36.06574, lon: 247.88258, eye: 1.7, heading: 42, pitch: -5 },          // (a level, wooded place on the South Rim: scripts/find-vista.mjs)
    ship: { east: -30, north: -45, heading: 30 },
    exposure: { key: 0.18, min: 0.5, max: 2.0e5, speed: 1.6, shadowFloor: 0.2, highlight: 6 },
    // The heaviest views, for the benchmark's cost test: the eye wall of the hurricane (deep
    // cloud, rain, a storm sea) and the forest of the North Rim.
    costViews: [
      { name: 'in the hurricane', lat: 21.7, lon: 284.7, alt: 60, heading: 90, pitch: -6 },
      { name: 'in the forest', lat: 36.2, lon: 247.94, heading: 180, pitch: -4 },
    ],
    bookmarks: {
      ledge: { label: 'The Grand Canyon from the South Rim, early', heading: 42, pitch: -5, fov: 60, timeOffsetHours: -1.2 },
      sun: { label: 'The morning Sun over the rim', heading: 78, pitch: 18, fov: 40 },
      wall: { label: 'The North Rim, sixteen kilometres away', heading: 350, pitch: -3, fov: 26 },
      ship: { label: 'The lander on the rim', east: -20, north: -12, heading: 230, pitch: 3, fov: 50 },
      dusk: { label: 'The canyon at sunset', heading: 300, pitch: -4, fov: 60, timeOffsetHours: 12.4 },
      everest: { label: 'Everest from Kala Patthar', lat: 27.9959, lon: 86.8285, heading: 80, pitch: 10, fov: 44, timeOffsetHours: -13 },
      maunakea: { label: 'The summit of Mauna Kea', lat: 19.8206, lon: 204.5319, heading: 200, pitch: -4, fov: 60, timeOffsetHours: 4 },
      namib: { label: 'The dunes of Sossusvlei', lat: -24.763, lon: 15.303, heading: 110, pitch: -4, fov: 60, timeOffsetHours: -7.627 },
      matterhorn: { label: 'The Matterhorn from the Gornergrat', lat: 45.983, lon: 7.785, heading: 255, pitch: 6, fov: 40, timeOffsetHours: -9 },
    },
  },
  places: [
    { id: 'grandcanyon', name: 'The Grand Canyon', fact: 'A mile deep: the Colorado River cut through two billion years of rock.', lat: 36.06, lon: 247.89 },
    { id: 'everest', name: 'Mount Everest', fact: 'The highest ground on Earth, 8 849 m, and still rising a few millimetres a year.', lat: 27.988, lon: 86.925 },
    { id: 'maunakea', name: 'Mauna Kea', fact: 'Measured from its foot on the sea floor it is taller than Everest.', lat: 19.82, lon: 204.53 },
    { id: 'namib', name: 'The Namib sand sea', fact: 'The oldest desert on Earth, with dunes over 300 m high.', lat: -24.76, lon: 15.30 },
    { id: 'matterhorn', name: 'The Matterhorn', fact: 'A horn of rock carved by four glaciers: its top is a piece of Africa.', lat: 45.976, lon: 7.659 },
    { id: 'sahara', name: 'The Sahara', fact: 'As large as the United States; green grassland only six thousand years ago.', lat: 23.0, lon: 12.0 },
    { id: 'antarctica', name: 'The South Pole', fact: 'Under your feet: 2 800 m of ice.', lat: -89.5, lon: 0 },
    { id: 'kilimanjaro', name: 'Kilimanjaro', fact: 'A volcano standing alone, with ice at the equator.', lat: -3.07, lon: 37.35 },
    { id: 'uluru', name: 'Uluru', fact: 'One rock, 348 m high and nine kilometres round.', lat: -25.345, lon: 131.036 },
    { id: 'irma', name: 'Hurricane Irma (8 September 2017)', reach: 60000, fact: 'One of the strongest Atlantic hurricanes on record: winds of 250 km/h round a calm eye 40 km wide.', lat: 21.7, lon: 284.7 },
    { id: 'jose', name: 'Hurricane Jose', reach: 60000, fact: 'Following Irma across the ocean two days behind it, almost as strong.', lat: 16.3, lon: 303.8 },
    { id: 'katia', name: 'Hurricane Katia', reach: 60000, fact: 'The third hurricane of the same day, about to come ashore in Mexico.', lat: 21.3, lon: 264.4 },
    { id: 'canaveral', name: 'Cape Canaveral', fact: 'Where the journeys to every other world in this game began.', lat: 28.57, lon: 279.35 },
  ],
};
