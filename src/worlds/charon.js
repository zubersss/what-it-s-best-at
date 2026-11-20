// Charon — numbers and recipe names only. Pluto's moon, half its size: grey water ice,
// a canyon system that splits the hemisphere New Horizons saw, a dark red north pole.
// Pluto hangs in one place in its sky, four degrees wide.
export default {
  id: 'charon',
  name: 'Charon',
  body: 'charon',
  radius: 606000,
  gravity: 0.288,
  dayHours: 153.3,

  terrain: {
    maxLevel: 16,               // ~15 m chunks
    minAltitude: -14500,
    maxAltitude: 7200,
    shadowRange: 160000,
    shadowHeadroom: 500,
    dems: [
      { url: 'data/charon_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      { url: 'data/charon_dem_serenity.i16', width: 1058, height: 1058, lon0: 0, lon1: 30.007, lat0: 30, lat1: -0.007, feather: 0.8 },     // Serenity Chasma and Kubrick Mons
    ],
    layers: [
      { op: 'dem' },
      { op: 'fbm', seed: 3, maxWavelength: 9000, minWavelength: 200, roughness: 0.88, amp: 9, belowDem: 2.2 },
      { op: 'ridged', seed: 5, maxWavelength: 4000, minWavelength: 40, roughness: 0.9, amp: 600, slopeMask: [0.14, 0.36], warp: 0.3 },
      { op: 'craters', seed: 7, radius: [600, 12000], density: 0.9, layers: 2, depth: 0.12, rim: 0.03, belowDem: 2 },
      { op: 'craters', seed: 9, radius: [8, 600], density: 0.8, layers: 3, depth: 0.18, rim: 0.045, ageSkew: 2, slopeMaskInv: [0.33, 0.5] },
      { op: 'fbm', seed: 11, maxWavelength: 200, minWavelength: 0.8, roughness: 0.92, amp: 1.6, slopeGain: [0.12, 0.5, 0.5, 1.6], hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 0.8,
    photometry: 'lunar',
    bounce: 0.5,
    reliefMap: { url: 'data/charon_slopes_4096.jpg', strength: 2.0, latFade: [84, 89] },
    albedoMap: { url: 'data/charon_color_4096.jpg', encoding: 'srgb', mean: [0.2671, 0.2447, 0.2213], strength: 1.0, chroma: 1.0, latFade: [86, 89], range: [0.3, 1.8] },
    meanAlbedo: [0.37, 0.36, 0.35],
    dust: [0.38, 0.37, 0.36],
    sand: [0.30, 0.29, 0.28],
    scree: [0.42, 0.41, 0.40],
    rock: [0.50, 0.50, 0.51],
    strata: null,
    slopes: { dustMax: 0.34, screeMin: 0.50, screeMax: 0.70, rockMin: 0.92 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.6,
    rocks: { count: 320, radius: 120, size: [0.25, 2.0], albedo: [0.48, 0.48, 0.49] },
  },

  atmosphere: null,

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2015-07-14T11:50:00Z',
    // The rim of Serenity Chasma, a canyon deeper than the Grand Canyon is and as long as
    // the United States is wide. Pluto stands over it.
    start: { lat: 20.0, lon: 10.0, eye: 1.7, heading: 180, pitch: -8 },
    ship: { east: 40, north: 30, heading: 40 },
    exposure: { key: 0.10, min: 0.5, max: 6.0e6, speed: 1.6, shadowFloor: 0.6, highlight: 6, dim: { above: 9000, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'Serenity Chasma, the rim', heading: 180, pitch: -8, fov: 60 },
      sun: { label: 'Pluto from Charon', heading: 180, pitch: 60, fov: 30 },
      wall: { label: 'Across the canyon', heading: 200, pitch: -3, fov: 34 },
      ship: { label: 'The lander', east: 20, north: 14, heading: 60, pitch: 4, fov: 50 },
      dusk: { label: 'The canyon at a low Sun', heading: 140, pitch: -6, fov: 60, timeOffsetHours: 30 },
      kubrick: { label: 'Kubrick Mons, the mountain in a moat', lat: 16.5, lon: 28.5, heading: 100, pitch: 0, fov: 50, timeOffsetHours: 8 },
    },
  },
  places: [
    { id: 'serenity', name: 'Serenity Chasma', fact: 'Part of a belt of canyons that runs 1 600 km across the moon.', lat: 19.0, lon: 10.0 },
    { id: 'kubrick', name: 'Kubrick Mons', fact: 'A mountain standing in its own moat, which nobody has explained.', lat: 17.0, lon: 30.0 },
    { id: 'mordor', name: 'Mordor Macula (the red pole)', fact: 'A dark red polar cap made of gas that escaped from Pluto and froze here.', lat: 80.0, lon: 0.0 },
    { id: 'vulcan', name: 'Vulcan Planitia', fact: 'Smooth plains where icy lava once flooded the south.', lat: -10.0, lon: 355.0 },
    { id: 'subpluto', name: 'The point under Pluto', fact: 'Pluto never moves from this spot in the sky.', lat: 0, lon: 0 },
  ],
};
