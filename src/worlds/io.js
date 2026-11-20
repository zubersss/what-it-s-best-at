// Io — numbers and recipe names only. The most volcanic body known: sulphur-yellow plains
// with no impact craters at all, black lava lakes, mountains up to 17 km high, and
// Jupiter 19 degrees wide in the sky of the side that faces it.
export default {
  id: 'io',
  name: 'Io',
  body: 'io',
  radius: 1821500,
  gravity: 1.796,
  dayHours: 42.46,

  terrain: {
    maxLevel: 18,
    minAltitude: -2500,
    maxAltitude: 18500,
    shadowRange: 260000,
    shadowHeadroom: 1200,
    // Made from the colour mosaic (scripts/fetch-worlds.py, io_dem): the lava floors of the
    // paterae, 1.1 km below the plains, exactly where the pictures show dark lava.
    dems: [
      { url: 'data/io_dem_8ppd.i16', width: 2880, height: 1440, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
    ],
    layers: [
      { op: 'dem' },
      // Broad swells and basins of the plains.
      { op: 'fbm', seed: 2, maxWavelength: 900000, minWavelength: 30000, roughness: 0.7, amp: 7 },
      // Io's mountains are not volcanoes: blocks of crust thrust up and tilted. The tallest,
      // by name, at their mapped places and heights (Schenk et al. 2001).
      { op: 'massifs', seed: 4, list: [
        [-9.7, 89.9, 17500, 95000],      // Boosaule Montes, the highest
        [-48.9, 21.2, 10500, 110000],    // Euboea Montes
        [8.6, 123.9, 12700, 70000],      // Ionian Mons
        [-3.6, 278.7, 11100, 80000],     // Hi'iaka Montes
        [-69.3, 313.3, 10800, 90000],    // Haemus Mons
        [-28.4, 198.7, 9400, 85000],     // Tohil Mons
        [18.6, 272.3, 11000, 60000],     // Gish Bar Mons
        [22.3, 292.8, 8600, 55000],      // Mongibello Mons
        [37.2, 283.5, 7400, 70000],      // Zal Montes
        [-41.5, 102.4, 10000, 75000],    // Egypt Mons
        [-22.7, 102.5, 5500, 90000],     // Danube Planum, a plateau
        [26.1, 261.6, 5700, 50000],      // Skythia Mons
        [11.5, 48.0, 4200, 30000],       // a ridge beside Loki
      ] },
      { op: 'ridged', seed: 6, maxWavelength: 16000, minWavelength: 40, roughness: 0.9, amp: 2600, slopeMask: [0.10, 0.24], warp: 0.3 },
      // The plains are stacked lava flows and sulphur deposits: low scarps a few hundred
      // metres high wander across them, and the patera walls step down in benches.
      { op: 'terrace', seed: 8, thickness: 260, cliff: 0.2, rise: 0.72, strength: 0.75, slopeMask: [0.04, 0.10], jitter: 0.4, warpAmp: 60, warpWavelength: 9000 },
      { op: 'fbm', seed: 10, maxWavelength: 26000, minWavelength: 200, roughness: 0.8, amp: 14, belowDem: 2.2 },
      { op: 'fbm', seed: 14, maxWavelength: 180, minWavelength: 0.8, roughness: 0.9, amp: 2.2, slopeGain: [0.1, 0.5, 0.6, 1.6], hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 0.6,
    bounce: 0.6,
    // Galileo and Voyager colour mosaic: yellow and white frosts, the red ring round Pele,
    // green-black lava. All of its colour is used.
    albedoMap: { url: 'data/io_color_4096.jpg', encoding: 'srgb', mean: [0.3594, 0.2482, 0.1143], strength: 1.0, chroma: 1.0, latFade: [72, 82], range: [0.12, 2.6] },
    meanAlbedo: [0.56, 0.44, 0.16],
    dust: [0.60, 0.47, 0.17],          // sulphur and sulphur-dioxide frost plains
    sand: [0.46, 0.34, 0.12],
    scree: [0.42, 0.31, 0.13],
    rock: [0.26, 0.20, 0.11],          // silicate rock of the mountains and patera walls
    bedrock: [0.10, 0.09, 0.07],       // cooled lava
    strata: { period: 520, contrast: 0.25, finePeriod: 60, fine: 0.12, flat: 0.1, colors: [[0.9, 0.8, 0.5], [0.6, 0.5, 0.3], [0.8, 0.6, 0.3], [0.45, 0.4, 0.3]] },
    slopes: { dustMax: 0.30, screeMin: 0.45, screeMax: 0.65, rockMin: 0.85 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.6,
    rocks: { count: 260, radius: 120, size: [0.25, 2.2], albedo: [0.22, 0.17, 0.09] },
  },

  atmosphere: null,                    // (a trace of sulphur dioxide: a billionth of our air)

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '1999-10-11T14:30:00Z',   // the day of Galileo's close pass (orbit I24); morning at Loki, Jupiter three quarters lit
    // The plains west of Loki Patera, the most powerful volcano in the solar system: its
    // black lava lake, 200 km across, lies ahead; Jupiter stands in the western sky.
    start: { lat: 12.0, lon: 46.2, eye: 1.7, heading: 80, pitch: -4 },
    ship: { east: 40, north: -30, heading: 300 },
    exposure: { key: 0.10, min: 0.5, max: 6.0e5, speed: 1.6, shadowFloor: 0.5, highlight: 6, dim: { above: 60, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'Loki Patera, the western shore', heading: 80, pitch: -4, fov: 60 },
      sun: { label: 'Jupiter from Io', heading: 270, pitch: 30, fov: 50 },
      wall: { label: 'The ridge beside Loki', heading: 30, pitch: 2, fov: 34 },
      ship: { label: 'The lander', east: 20, north: -12, heading: 300, pitch: 6, fov: 50 },
      dusk: { label: 'Jupiter over the sulphur plains', heading: 262, pitch: 22, fov: 70, timeOffsetHours: 9 },
      boosaule: { label: 'Boosaule Montes, 17 km high', lat: -7.2, lon: 88.2, heading: 150, pitch: 6, fov: 50, timeOffsetHours: 3 },
      pele: { label: 'Pele, inside the red ring', lat: -18.7, lon: 104.7, heading: 0, pitch: -6, fov: 60, timeOffsetHours: 3 },
    },
  },
  places: [
    { id: 'loki', name: 'Loki Patera', lat: 13.0, lon: 51.2 },
    { id: 'pele', name: 'Pele', lat: -18.7, lon: 104.7 },
    { id: 'boosaule', name: 'Boosaule Montes', lat: -9.7, lon: 89.9 },
    { id: 'prometheus', name: 'Prometheus', lat: -1.5, lon: 206.3 },
    { id: 'tvashtar', name: 'Tvashtar Paterae', lat: 62.8, lon: 236.5 },
    { id: 'euboea', name: 'Euboea Montes', lat: -48.9, lon: 21.2 },
    { id: 'subjupiter', name: 'The point under Jupiter', lat: 0, lon: 0 },
  ],
};
