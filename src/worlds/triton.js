// Triton — numbers and recipe names only. Neptune's captured moon, the coldest ground ever
// photographed (minus 235 C): pink nitrogen frost, dimpled "cantaloupe" terrain found
// nowhere else, and geysers that leave dark streaks down the wind.
export default {
  id: 'triton',
  name: 'Triton',
  body: 'triton',
  radius: 1353400,
  gravity: 0.779,
  dayHours: 141.0,

  terrain: {
    maxLevel: 17,               // ~16 m chunks
    minAltitude: -1300,
    maxAltitude: 1700,
    shadowRange: 80000,
    shadowHeadroom: 400,
    dems: [],
    layers: [
      { op: 'fbm', seed: 2, maxWavelength: 700000, minWavelength: 20000, roughness: 0.7, amp: 5 },
      // Cantaloupe terrain: closed dimples 30-40 km across between raised walls, packed
      // shoulder to shoulder over the western hemisphere.
      { op: 'cells', seed: 4, scale: 34000, dome: -420, trough: [-160, 3500], where: { cover: 0.42, seed: 3, wavelength: 1600000, soft: 0.06 } },
      { op: 'cells', seed: 6, scale: 6000, dome: -60, where: { cover: 0.42, seed: 3, wavelength: 1600000, soft: 0.06 } },
      // The great ridges (sulci) that cut across it: paired crests hundreds of km long.
      { op: 'lineaments', seed: 8, families: 4, spacing: 260000, width: 7000, height: 420, profile: 'double', presence: 0.7, segment: 1200000, wobble: [30000, 700000], varied: 0.4 },
      // Frozen lakes: flat-floored, terraced basins of the smooth plains.
      { op: 'craters', seed: 10, radius: [40000, 110000], density: 0.12, layers: 1, depth: 0.007, rim: 0.0015, floor: 0.82, where: { cover: 0.42, seed: 3, wavelength: 1600000, soft: 0.06, invert: true } },
      { op: 'fbm', seed: 12, maxWavelength: 16000, minWavelength: 200, roughness: 0.8, amp: 9 },
      // Very few impact craters: the surface is young.
      { op: 'craters', seed: 14, radius: [600, 9000], density: 0.07, layers: 1, depth: 0.12, rim: 0.03 },
      { op: 'craters', seed: 16, radius: [5, 300], density: 0.1, layers: 1, depth: 0.15, rim: 0.035, ageSkew: 2 },
      { op: 'fbm', seed: 18, maxWavelength: 150, minWavelength: 0.8, roughness: 0.93, amp: 1.5, hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 0.4,
    bounce: 0.8,
    gloss: { strength: 0.6, roughness: 0.32 },      // the Sun's sheen on ice
    albedoMap: { url: 'data/triton_color_4096.jpg', encoding: 'srgb', mean: [0.4009, 0.2817, 0.1754], strength: 0.9, chroma: 0.8, latFade: [80, 88], range: [0.5, 1.6] },
    meanAlbedo: [0.72, 0.64, 0.60],
    dust: [0.76, 0.68, 0.64],          // nitrogen and methane frost, faintly pink
    sand: [0.62, 0.55, 0.50],
    scree: [0.66, 0.60, 0.58],
    rock: [0.50, 0.50, 0.54],          // water ice, hard as rock here
    strata: null,
    slopes: { dustMax: 0.32, screeMin: 0.48, screeMax: 0.68, rockMin: 0.88 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.4,
    rocks: { count: 200, radius: 120, size: [0.25, 2.0], albedo: [0.58, 0.58, 0.62] },
  },

  // A wisp of nitrogen, a seventy-thousandth of our air, with a thin haze near the ground.
  atmosphere: {
    topAltitude: 120000,
    surfaceDensity: 1.2e-4,
    occluderAltitude: 0,
    rayleigh: { scattering: [2.0e-10, 4.6e-10, 1.1e-9], scaleHeight: 14000 },
    dust: { scattering: [1.5e-8, 1.7e-8, 2.0e-8], absorption: [0, 0, 0], phaseG: [0.6, 0.6, 0.6], scaleHeight: 10000 },
    absorber: null,
  },

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '1989-08-25T09:00:00Z',   // Voyager 2's fly-by
    // The edge of the cantaloupe terrain where it meets the southern frost cap. Neptune
    // stands in the sky, eight degrees wide.
    start: { lat: 12.0, lon: 10.0, eye: 1.7, heading: 200, pitch: -4 },
    ship: { east: 40, north: 25, heading: 200 },
    exposure: { key: 0.16, min: 0.5, max: 6.0e6, speed: 1.6, shadowFloor: 0.5, highlight: 6, dim: { above: 6000, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'Cantaloupe terrain', heading: 200, pitch: -4, fov: 60 },
      sun: { label: 'Neptune from Triton', lat: 5.0, lon: 20.0, heading: 270, pitch: 50, fov: 40 },
      wall: { label: 'A ridge of the sulci', heading: 120, pitch: 0, fov: 40 },
      ship: { label: 'The lander', east: 20, north: 12, heading: 60, pitch: 4, fov: 50 },
      dusk: { label: 'The southern frost cap', lat: -35.0, lon: 15.0, heading: 180, pitch: -4, fov: 60, timeOffsetHours: 20 },
      lake: { label: 'Ruach Planitia, a frozen lake', lat: 28.0, lon: 24.0, heading: 40, pitch: -5, fov: 60, timeOffsetHours: 10 },
    },
  },
  places: [
    { id: 'cantaloupe', name: 'Bubembe Regio (cantaloupe terrain)', fact: 'Dimpled ground found nowhere else, like the skin of a melon.', lat: 18.0, lon: 335.0 },
    { id: 'ruach', name: 'Ruach Planitia', fact: 'A flat plain that looks like a frozen lake of ammonia and water.', lat: 28.0, lon: 24.0 },
    { id: 'uhlanga', name: 'Uhlanga Regio (the frost cap)', fact: 'A pink cap of nitrogen frost, streaked by geysers.', lat: -37.0, lon: 0.0 },
    { id: 'mahilani', name: 'Mahilani Plume', fact: 'Voyager 2 saw a geyser here rise 8 km and drift 150 km downwind.', lat: -50.0, lon: 2.0 },
    { id: 'subneptune', name: 'The point under Neptune', fact: 'Neptune hangs overhead here, sixteen times as wide as our Moon looks.', lat: 0, lon: 0 },
  ],
};
