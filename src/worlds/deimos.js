// Deimos — numbers and recipe names only. The small outer moon of Mars: 15 x 12 x 10 km,
// smoothed by a thick blanket of dust that has filled most of its craters.
export default {
  id: 'deimos',
  name: 'Deimos',
  body: 'deimos',
  radius: 6200,
  gravity: 0.003,
  dayHours: 30.3,

  terrain: {
    maxLevel: 10,
    minAltitude: -1900,
    maxAltitude: 1900,
    shadowRange: 12000,
    shadowHeadroom: 200,
    dems: [],
    layers: [
      // No elevation map exists: the measured ellipsoid (7.5 x 6.1 x 5.2 km), broad facets
      // and saddles like the real body's, then the few large, dust-softened craters.
      { op: 'ellipsoid', radii: [7500, 6100, 5200] },
      { op: 'fbm', seed: 3, maxWavelength: 9000, minWavelength: 700, roughness: 1.0, amp: 34 },
      { op: 'craters', seed: 6, radius: [500, 2400], density: 0.5, layers: 1, depth: 0.10, rim: 0.012, ageSkew: 2 },
      { op: 'craters', seed: 8, radius: [25, 500], density: 0.7, layers: 2, depth: 0.09, rim: 0.015, ageSkew: 3 },
      { op: 'craters', seed: 12, radius: [1.5, 25], density: 0.8, layers: 2, depth: 0.16, rim: 0.04, ageSkew: 2.5, slopeMaskInv: [0.4, 0.6] },
      { op: 'fbm', seed: 15, maxWavelength: 300, minWavelength: 0.8, roughness: 0.95, amp: 1.2, hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 1.0,
    photometry: 'lunar',
    bounce: 0.2,
    // Stooke's map of Deimos from the Viking pictures (a shaded drawing: used faintly, for
    // the bright streaks of dust that run down its slopes).
    albedoMap: { url: 'data/deimos_color_2048.jpg', encoding: 'srgb', mean: [0.3421, 0.3421, 0.3421], strength: 0.3, latFade: [60, 75], range: [0.7, 1.4] },
    meanAlbedo: [0.068, 0.062, 0.056],
    dust: [0.070, 0.064, 0.058],
    sand: [0.060, 0.055, 0.050],
    scree: [0.078, 0.072, 0.066],
    rock: [0.095, 0.089, 0.083],
    strata: null,
    slopes: { dustMax: 0.45, screeMin: 0.65, screeMax: 0.9, rockMin: 1.2 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.5,
    rocks: { count: 160, radius: 110, size: [0.2, 1.6], albedo: [0.095, 0.089, 0.083] },
  },

  atmosphere: null,

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2014-01-31T04:00:00Z',
    // Near the point that always faces Mars: the planet stands overhead, 17 degrees wide.
    start: { lat: 8.0, lon: 18.0, eye: 1.7, heading: 250, pitch: 40 },
    ship: { east: 26, north: -18, heading: 120 },
    exposure: { key: 0.06, min: 0.5, max: 6.0e5, speed: 1.6, shadowFloor: 0.6, highlight: 6, dim: { above: 60, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'Deimos, the smooth plains', heading: 300, pitch: -8, fov: 60 },
      sun: { label: 'Mars from Deimos', heading: 250, pitch: 62, fov: 50 },
      wall: { label: 'Voltaire crater', lat: 22, lon: 3.5, heading: 200, pitch: -6, fov: 40 },
      ship: { label: 'The lander', east: 10, north: -6, heading: 110, pitch: 8, fov: 50 },
      dusk: { label: 'The edge of night', lat: 0, lon: 80, heading: 270, pitch: 0, fov: 60, timeOffsetHours: 6 },
    },
  },
  places: [
    { id: 'submars', name: 'The point under Mars', fact: 'Mars hangs overhead here, seventeen degrees wide.', lat: 0, lon: 0 },
    { id: 'voltaire', name: 'Voltaire crater', fact: 'One of only two named craters on Deimos, 3 km across.', lat: 22.0, lon: 3.5 },
    { id: 'swift', name: 'Swift crater', fact: 'Jonathan Swift wrote of two moons of Mars 150 years before they were found.', lat: 12.5, lon: 1.8 },
    { id: 'southpole', name: 'The south pole', fact: 'A great hollow 10 km wide takes up the whole south of the moon.', lat: -85, lon: 0 },
    { id: 'antimars', name: 'The far side', fact: 'The far side: only stars and the Sun.', lat: 0, lon: 180 },
  ],
};
