// Ceres — numbers and recipe names only. The largest body of the asteroid belt, a dark
// world of clay and ice 940 km across, with one lone ice volcano and the white salt
// deposits of Occator crater, which shine like lamps.
export default {
  id: 'ceres',
  name: 'Ceres',
  body: 'ceres',
  radius: 470000,               // m: the sphere Dawn's elevations are measured from (the body is flattened: +12 km at the equator, -21 km at the poles)
  gravity: 0.28,
  dayHours: 9.07,

  terrain: {
    maxLevel: 16,               // ~11 m chunks
    minAltitude: -28500,
    maxAltitude: 17500,
    shadowRange: 200000,
    shadowHeadroom: 500,
    // Dawn framing-camera stereo elevation (DLR): the globe, Occator and Ahuna Mons at
    // 137 m per pixel.
    dems: [
      { url: 'data/ceres_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      { url: 'data/ceres_dem_occator.i16', width: 780, height: 720, lon0: 233, lon1: 246, lat0: 26, lat1: 14, feather: 0.6 },
      { url: 'data/ceres_dem_ahuna.i16', width: 720, height: 660, lon0: 310, lon1: 322, lat0: -5, lat1: -16, feather: 0.6 },
    ],
    layers: [
      { op: 'dem' },
      { op: 'fbm', seed: 3, maxWavelength: 8000, minWavelength: 200, roughness: 0.88, amp: 8, belowDem: 2.2 },
      { op: 'craters', seed: 5, radius: [1500, 30000], density: 1.0, layers: 3, depth: 0.10, rim: 0.025, belowDem: 2 },
      { op: 'craters', seed: 7, radius: [40, 1500], density: 1.0, layers: 3, depth: 0.16, rim: 0.04, belowDem: 2, slopeMaskInv: [0.33, 0.5] },
      { op: 'craters', seed: 9, radius: [1.2, 40], density: 0.9, layers: 3, depth: 0.25, rim: 0.06, ageSkew: 2, slopeMaskInv: [0.33, 0.5] },
      { op: 'fbm', seed: 13, maxWavelength: 240, minWavelength: 0.8, roughness: 0.92, amp: 1.8, slopeGain: [0.12, 0.5, 0.5, 1.7], hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 1.0,
    photometry: 'lunar',
    bounce: 0.3,
    reliefMap: { url: 'data/ceres_slopes_4096.jpg', strength: 1.6, latFade: [84, 89] },
    // Dawn mosaic. Its range is left wide open at the top: the salt of Occator is five
    // times as bright as the ground round it, and that is the point of the place.
    albedoMap: { url: 'data/ceres_color_4096.jpg', encoding: 'srgb', mean: [0.2029, 0.1899, 0.1694], strength: 1.0, chroma: 1.0, latFade: [82, 88], range: [0.5, 9.0] },
    meanAlbedo: [0.090, 0.086, 0.080],
    dust: [0.092, 0.088, 0.082],       // dark clays and carbonates
    sand: [0.072, 0.069, 0.064],
    scree: [0.110, 0.105, 0.098],
    rock: [0.150, 0.145, 0.136],
    strata: null,
    slopes: { dustMax: 0.34, screeMin: 0.50, screeMax: 0.70, rockMin: 0.92 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.7,
    rocks: { count: 360, radius: 120, size: [0.25, 2.0], albedo: [0.14, 0.135, 0.127] },
  },

  atmosphere: null,

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2016-02-01T10:00:00Z',   // Dawn in its lowest orbit
    // Inside Occator crater, at the edge of Cerealia Facula: a dome of bright salt left by
    // brine that welled up from below, on a crater floor 4 km under the rim.
    start: { lat: 20.02, lon: 240.20, eye: 1.7, heading: 262, pitch: -1 },
    ship: { east: 40, north: 30, heading: 40 },
    exposure: { key: 0.07, min: 0.5, max: 6.0e5, speed: 1.6, shadowFloor: 0.6, highlight: 6, dim: { above: 60, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'Occator, the bright salt of Cerealia Facula', heading: 262, pitch: -1, fov: 60 },
      sun: { label: 'The Sun from Ceres', heading: 260, pitch: 28, fov: 30 },
      wall: { label: 'Occator, the crater wall', heading: 30, pitch: 4, fov: 34 },
      ship: { label: 'The lander', east: 20, north: 14, heading: 60, pitch: 4, fov: 50 },
      dusk: { label: 'Occator at a low Sun', heading: 200, pitch: 0, fov: 60, timeOffsetHours: 0.7613 },
      ahuna: { label: 'Ahuna Mons, the ice volcano', lat: -9.6, lon: 316.6, heading: 120, pitch: 6, fov: 50, timeOffsetHours: -1.638 },
    },
  },
  places: [
    { id: 'occator', name: 'Occator crater (the bright spots)', fact: 'The bright spots are salt left by brine from below: among the youngest ground on Ceres.', lat: 19.8, lon: 239.3 },
    { id: 'ahuna', name: 'Ahuna Mons', fact: 'A lone mountain 4 km high, built by salty mud that welled up: an ice volcano.', lat: -10.5, lon: 316.2 },
    { id: 'kerwan', name: 'Kerwan basin', fact: 'The largest crater on Ceres, 280 km wide and softened by time.', lat: -10.8, lon: 124.0 },
    { id: 'haulani', name: 'Haulani crater', fact: 'A young crater with bluish rays.', lat: 5.8, lon: 10.8 },
    { id: 'ernutet', name: 'Ernutet crater', fact: 'Organic material was found around this crater.', lat: 52.9, lon: 45.5 },
    { id: 'northpole', name: 'North pole', fact: 'Craters here stay dark all year and hold ice.', lat: 88.0, lon: 0 },
  ],
};
