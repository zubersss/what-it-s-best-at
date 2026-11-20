// Enceladus — numbers and recipe names only. A moon of fresh snow 500 km across, the
// whitest thing in the solar system; at its south pole four great fractures, the "tiger
// stripes", vent water from an ocean below. Saturn is 29 degrees wide in its sky.
export default {
  id: 'enceladus',
  name: 'Enceladus',
  body: 'enceladus',
  radius: 251500,               // m: the sphere the shape model is measured from (the mean radius is 252.1 km)
  gravity: 0.113,
  dayHours: 32.9,

  terrain: {
    maxLevel: 15,               // ~12 m chunks
    minAltitude: -4300,
    maxAltitude: 5800,
    shadowRange: 60000,
    shadowHeadroom: 700,
    // The shape model (Bland et al. 2019): the whole flattened figure, 5 km high toward
    // Saturn and 4 km low at the poles, and the south-polar basin.
    dems: [
      { url: 'data/enceladus_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
    ],
    layers: [
      { op: 'dem' },
      { op: 'fbm', seed: 2, maxWavelength: 9000, minWavelength: 200, roughness: 0.85, amp: 16, belowDem: 2.2 },
      // The tiger stripes: Alexandria, Cairo, Baghdad and Damascus Sulci. Each a trough
      // 500 m deep and 2 km wide between raised flanks, 35 km apart, across the south pole.
      { op: 'lineaments', seed: 3, poles: [[0, 135]], spacing: 35000, width: 2600, height: 150, profile: 'double', bands: [-2, 1], jitter: 0.08, wobble: [2500, 60000], varied: 0.1, where: { lat: [62, 90], fade: 5, hemisphere: 'south' } },
      { op: 'lineaments', seed: 3, poles: [[0, 135]], spacing: 35000, width: 900, height: -420, bands: [-2, 1], jitter: 0.08, wobble: [2500, 60000], varied: 0.1, where: { lat: [62, 90], fade: 5, hemisphere: 'south' } },
      // Round the stripes the ice is folded into ropy ridges; farther north, belts of
      // grooves cut the old plains.
      { op: 'lineaments', seed: 7, families: 6, spacing: 1700, width: 420, height: 90, presence: 0.8, segment: 30000, wobble: [600, 12000], varied: 0.6, where: { lat: [48, 90], fade: 6, hemisphere: 'south' } },
      { op: 'lineaments', seed: 9, families: 7, spacing: 5200, width: 700, height: -130, presence: 0.5, segment: 70000, wobble: [1500, 50000], varied: 0.6, where: { cover: 0.45, seed: 4, wavelength: 300000 } },
      // The cratered north: old, softened bowls (the ice has slowly flowed).
      { op: 'craters', seed: 5, radius: [700, 14000], density: 0.9, layers: 2, depth: 0.09, rim: 0.02, ageSkew: 2, where: { lat: [-90, 40], fade: 12, hemisphere: 'north', invert: false } },
      { op: 'craters', seed: 11, radius: [6, 700], density: 0.5, layers: 2, depth: 0.15, rim: 0.035, ageSkew: 2.5, slopeMaskInv: [0.3, 0.5] },
      // Underfoot: loose fresh snow, with blocks of ice the size of houses near the stripes.
      { op: 'fbm', seed: 13, maxWavelength: 200, minWavelength: 0.8, roughness: 0.93, amp: 2.0, slopeGain: [0.1, 0.5, 0.6, 1.6], hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 0.4,
    bounce: 0.9,
    gloss: { strength: 0.7, roughness: 0.35 },      // the Sun's sheen on ice
    reliefMap: { url: 'data/enceladus_slopes_1024.jpg', strength: 1.5, latFade: [84, 89] },
    // Cassini mosaic, tinted the blue-white of its ice.
    albedoMap: { url: 'data/enceladus_color_4096.jpg', encoding: 'srgb', mean: [0.3564, 0.3934, 0.4441], strength: 0.8, chroma: 1.0, latFade: [86, 89], range: [0.6, 1.4] },
    meanAlbedo: [0.88, 0.90, 0.93],
    dust: [0.90, 0.92, 0.95],          // snow that fell back from the plumes
    sand: [0.84, 0.88, 0.93],
    scree: [0.80, 0.85, 0.92],
    rock: [0.55, 0.70, 0.86],          // clean blue ice in the fracture walls
    strata: null,
    slopes: { dustMax: 0.36, screeMin: 0.5, screeMax: 0.7, rockMin: 0.9 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.4,
    rocks: { count: 300, radius: 120, size: [0.3, 3.0], albedo: [0.70, 0.80, 0.92] },
  },

  atmosphere: null,

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2008-08-12T21:00:00Z',   // the day after Cassini's pass 50 km over the stripes: a low Sun, Saturn three quarters lit
    // The rim of Baghdad Sulcus, the most active of the tiger stripes, at the south pole.
    start: { lat: -82.0, lon: 30.0, eye: 1.7, heading: 326, pitch: 2 },
    ship: { east: 40, north: 30, heading: 40 },
    exposure: { key: 0.20, min: 0.5, max: 6.0e5, speed: 1.6, shadowFloor: 0.5, highlight: 6, dim: { above: 60, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'Baghdad Sulcus, Saturn on the horizon', heading: 326, pitch: 2, fov: 64 },
      sun: { label: 'Saturn from Enceladus', lat: -8.0, lon: 22.0, heading: 290, pitch: 56, fov: 64, timeOffsetHours: -3 },
      wall: { label: 'Along the fracture', heading: 135, pitch: -6, fov: 40 },
      ship: { label: 'The lander', east: 20, north: 14, heading: 60, pitch: 4, fov: 50 },
      dusk: { label: 'Saturn on the horizon', lat: -70.0, lon: 0.0, heading: 0, pitch: 12, fov: 60, timeOffsetHours: 8 },
      north: { label: 'The cratered north', lat: 55.0, lon: 200.0, heading: 100, pitch: -6, fov: 60, timeOffsetHours: 14 },
    },
  },
  places: [
    { id: 'baghdad', name: 'Baghdad Sulcus (tiger stripe)', fact: 'The warmest and most active of the fractures that spray the ocean into space.', lat: -82.0, lon: 30.0 },
    { id: 'damascus', name: 'Damascus Sulcus', fact: 'Jets of ice from here feed Saturn\'s E ring.', lat: -80.0, lon: 75.0 },
    { id: 'subsaturn', name: 'The point under Saturn', fact: 'Saturn hangs overhead here, sixty times as wide as our Moon looks.', lat: 0, lon: 0 },
    { id: 'labtayt', name: 'Labtayt Sulci', fact: 'A canyon a kilometre deep.', lat: -28.0, lon: 75.0 },
    { id: 'alibaba', name: 'Ali Baba crater', fact: 'A crater softened as the ice slowly flowed.', lat: 55.1, lon: 337.8 },
  ],
};
