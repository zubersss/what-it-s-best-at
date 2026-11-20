// Phobos — numbers and recipe names only. The larger moon of Mars: 27 x 22 x 18 km of
// dark, grooved rock 6 000 km above the planet, which hangs in its sky 42 degrees wide and
// never moves (Phobos keeps one face to Mars).
export default {
  id: 'phobos',
  name: 'Phobos',
  body: 'phobos',
  radius: 11100,                // m: the sphere the elevation is measured from
  gravity: 0.0057,              // m/s^2 (on foot the engine never counts less than MIN_FOOT_GRAVITY)
  dayHours: 7.65,               // one turn = one orbit of Mars

  terrain: {
    maxLevel: 11,               // ~8 m chunks at the finest level
    minAltitude: -3300,         // Stickney's floor
    maxAltitude: 3300,
    shadowRange: 20000,
    shadowHeadroom: 200,
    // The shape: Mars Express HRSC elevation above the 11.1 km sphere (Willner et al.),
    // 100 m per pixel. It is the whole body: its long axis, Stickney, the big craters.
    dems: [
      { url: 'data/phobos_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
    ],
    layers: [
      { op: 'dem' },
      { op: 'fbm', seed: 4, maxWavelength: 600, minWavelength: 0.8, roughness: 0.9, amp: 5, belowDem: 2.2, slopeGain: [0.15, 0.6, 0.6, 1.5] },
      // The grooves: families of parallel furrows 100-200 m wide and 10-30 m deep that run
      // for kilometres across the whole moon (pitted chains in close-up pictures).
      { op: 'lineaments', seed: 21, families: 5, spacing: 620, width: 85, height: -22, presence: 0.6, segment: 5000, wobble: [60, 1800], varied: 0.6, jitter: 0.25 },
      { op: 'lineaments', seed: 27, families: 3, spacing: 1500, width: 150, height: -34, presence: 0.5, segment: 9000, wobble: [120, 3000], varied: 0.5 },
      // Craters below what the elevation map shows, down to a couple of metres: the surface
      // is saturated with them and buried in metres of fine regolith, so most are soft.
      { op: 'craters', seed: 5, radius: [60, 900], density: 1.0, layers: 3, depth: 0.16, rim: 0.035, ageSkew: 1.6, belowDem: 2 },
      { op: 'craters', seed: 9, radius: [1.5, 60], density: 1.0, layers: 3, depth: 0.22, rim: 0.05, ageSkew: 2, slopeMaskInv: [0.45, 0.7] },
      { op: 'fbm', seed: 13, maxWavelength: 140, minWavelength: 0.8, roughness: 0.92, amp: 1.4, slopeGain: [0.12, 0.5, 0.5, 1.6], hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 1.0,
    photometry: 'lunar',
    bounce: 0.2,
    // Viking Orbiter mosaic (brightness only; it carries the shading of the pictures it was
    // made from, so it is used at half strength and fades out toward the poles).
    albedoMap: { url: 'data/phobos_color_2048.jpg', encoding: 'srgb', mean: [0.2776, 0.2776, 0.2776], strength: 0.5, latFade: [60, 75], range: [0.6, 1.5] },
    reliefMap: { url: 'data/phobos_slopes_1024.jpg', strength: 1.0, latFade: [80, 88] },
    meanAlbedo: [0.071, 0.064, 0.058],
    dust: [0.072, 0.065, 0.059],       // one of the darkest surfaces in the solar system, faintly red
    sand: [0.058, 0.053, 0.049],
    scree: [0.084, 0.077, 0.070],
    rock: [0.105, 0.098, 0.092],       // the bluer, fresher material on Stickney's rim
    strata: null,
    slopes: { dustMax: 0.42, screeMin: 0.60, screeMax: 0.85, rockMin: 1.1 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.7,
    rocks: { count: 320, radius: 110, size: [0.25, 2.2], albedo: [0.10, 0.094, 0.088] },
  },

  atmosphere: null,

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    // (an hour when the Sun stands low in the west, raking the grooves, and Mars is a little
    // over half lit)
    dateUTC: '2014-01-31T05:00:00Z',
    // The eastern rim of Stickney, the 9 km crater that nearly broke the moon. Mars stands
    // high in the east, filling a quarter of the sky.
    start: { lat: 2.0, lon: 326.0, eye: 1.7, heading: 93, pitch: 30 },
    ship: { east: 30, north: 22, heading: 200 },
    exposure: { key: 0.06, min: 0.5, max: 6.0e5, speed: 1.6, shadowFloor: 0.6, highlight: 6, dim: { above: 60, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'Stickney, the eastern rim', heading: 235, pitch: -12, fov: 60 },
      sun: { label: 'Mars from Phobos', heading: 93, pitch: 44, fov: 72 },
      wall: { label: 'Stickney, the far wall', heading: 262, pitch: -4, fov: 28 },
      ship: { label: 'The lander under Mars', east: 6, north: 24, heading: 96, pitch: 22, fov: 62 },
      dusk: { label: 'The grooves at a low Sun', lat: 20, lon: 20, heading: 200, pitch: -8, fov: 55, timeOffsetHours: 1.6 },
      kepler: { label: 'Kepler Dorsum', lat: -45, lon: 6, heading: 30, pitch: 4, fov: 50, timeOffsetHours: 2.5 },
    },
  },
  places: [
    { id: 'stickney', name: 'Stickney crater', fact: 'A crater 9 km wide on a moon 27 km long: the blow nearly broke Phobos apart.', lat: 1.0, lon: 311.0 },
    { id: 'limtoc', name: 'Limtoc (inside Stickney)', fact: 'A crater inside a crater, on Stickney\'s floor.', lat: -11.0, lon: 306.0 },
    { id: 'submars', name: 'The point under Mars', fact: 'From here Mars fills a quarter of the sky and never moves.', lat: 0, lon: 0 },
    { id: 'hall', name: 'Hall crater', fact: 'Named for Asaph Hall, who found both moons in 1877.', lat: -80.0, lon: 150.0 },
    { id: 'kepler', name: 'Kepler Dorsum', fact: 'A ridge near the south pole, named for the man who guessed Mars had two moons.', lat: -45.0, lon: 6.0 },
    { id: 'antimars', name: 'The far side', fact: 'The side of Phobos that never sees Mars.', lat: 0, lon: 180 },
  ],
};
