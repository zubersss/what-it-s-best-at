// Europa — numbers and recipe names only. A shell of ice over an ocean: the smoothest
// world there is (hardly a hill over a few hundred metres), criss-crossed by ridges and
// stained red-brown along its cracks. Jupiter is 12 degrees wide in its sky.
// Named chaos regions (latitude, longitude east, radius in metres).
const CHAOS = [[9.7, 87.3, 70000], [-46.7, 178.8, 45000], [-45.9, 172.1, 40000], [22.4, 276.0, 60000], [-19.0, 284.0, 50000]];     // Conamara, Thera Macula, Thrace Macula, Murias, a patch by Agenor

export default {
  id: 'europa',
  name: 'Europa',
  body: 'europa',
  radius: 1560800,
  gravity: 1.314,
  dayHours: 85.2,

  terrain: {
    maxLevel: 18,
    minAltitude: -900,
    maxAltitude: 1100,
    shadowRange: 60000,
    shadowHeadroom: 300,
    dems: [],
    layers: [
      { op: 'fbm', seed: 2, maxWavelength: 500000, minWavelength: 20000, roughness: 0.7, amp: 2.2 },
      // Chaos terrain: places where the ice broke into rafts that drifted, tilted and froze
      // in again, a few hundred metres of jumbled relief.
      { op: 'cells', seed: 31, scale: 7000, plate: 170, edge: 260, where: { cover: 0.12, seed: 5, wavelength: 500000, soft: 0.05, at: CHAOS } },
      { op: 'cells', seed: 33, scale: 1300, plate: 55, edge: 60, where: { cover: 0.12, seed: 5, wavelength: 500000, soft: 0.05, at: CHAOS } },
      // (between the rafts the frozen slush is hummocky and broken)
      { op: 'ridged', seed: 35, maxWavelength: 900, minWavelength: 20, roughness: 0.9, amp: 70, warp: 0.4, where: { cover: 0.12, seed: 5, wavelength: 500000, soft: 0.05, at: CHAOS } },
      // The ridges. Great double ridges, two crests with a trough between, run for hundreds
      // of kilometres; older and smaller ones cover everything between them.
      { op: 'lineaments', seed: 11, families: 9, spacing: 46000, width: 1300, height: 260, profile: 'double', presence: 0.55, segment: 700000, wobble: [9000, 260000], varied: 0.6 },
      { op: 'lineaments', seed: 13, families: 12, spacing: 6200, width: 420, height: 85, profile: 'double', presence: 0.6, segment: 90000, wobble: [1500, 40000], varied: 0.7 },
      { op: 'lineaments', seed: 17, families: 14, spacing: 900, width: 110, height: 22, profile: 'ridge', presence: 0.7, segment: 14000, wobble: [200, 6000], varied: 0.7 },
      { op: 'lineaments', seed: 19, families: 10, spacing: 130, width: 22, height: 4, profile: 'ridge', presence: 0.7, segment: 2000, wobble: [30, 900], varied: 0.7 },
      // Very few craters: the surface is young.
      { op: 'craters', seed: 5, radius: [1500, 13000], density: 0.05, layers: 1, depth: 0.05, rim: 0.02, floor: 0.4 },
      { op: 'craters', seed: 9, radius: [8, 400], density: 0.12, layers: 1, depth: 0.14, rim: 0.03, ageSkew: 2 },
      { op: 'fbm', seed: 23, maxWavelength: 120, minWavelength: 0.8, roughness: 0.95, amp: 1.6, hetero: 0.5 },
    ],
  },

  surface: {
    roughness: 0.35,                   // clean, hard ice
    bounce: 0.7,
    gloss: { strength: 1.0, roughness: 0.28 },      // the Sun's sheen on ice
    // Galileo and Voyager mosaic, coloured from blue-white ice to the red-brown of the
    // cracks and the chaos (scripts/fetch-worlds.py).
    albedoMap: { url: 'data/europa_color_4096.jpg', encoding: 'srgb', mean: [0.5377, 0.4295, 0.3336], strength: 0.8, chroma: 0.55, latFade: [78, 86], range: [0.3, 1.7] },
    meanAlbedo: [0.66, 0.62, 0.56],
    dust: [0.70, 0.67, 0.62],          // frost
    sand: [0.56, 0.46, 0.36],          // salt-stained ice in the low ground
    scree: [0.62, 0.58, 0.54],
    rock: [0.50, 0.52, 0.58],          // bare blue ice on steep faces
    strata: null,
    slopes: { dustMax: 0.30, screeMin: 0.45, screeMax: 0.65, rockMin: 0.85 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.45,
    rocks: { count: 220, radius: 120, size: [0.25, 2.0], albedo: [0.60, 0.62, 0.68] },
  },

  atmosphere: null,

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '1998-12-17T12:00:00Z',   // the week Galileo flew over Conamara; morning there, a nearly full Jupiter half set in the west
    // The crest of a great double ridge at the edge of Conamara Chaos, where the ice broke
    // up. A nearly full Jupiter sits on the western horizon, as it always does from here.
    start: { lat: 8.94, lon: 84.66, eye: 1.7, heading: 262, pitch: -3 },
    ship: { east: 50, north: 30, heading: 30 },
    exposure: { key: 0.13, min: 0.5, max: 6.0e5, speed: 1.6, shadowFloor: 0.5, highlight: 6, dim: { above: 60, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'A ridge by Conamara Chaos, Jupiter on the horizon', heading: 266, pitch: 0, fov: 62 },
      chaos: { label: 'Conamara Chaos', lat: 9.7, lon: 87.3, heading: 250, pitch: -3, fov: 60 },
      sun: { label: 'Jupiter from Europa', lat: 5.0, lon: 40.0, heading: 264, pitch: 46, fov: 44, timeOffsetHours: 10.26 },
      wall: { label: 'A double ridge', lat: 14.0, lon: 86.0, heading: 20, pitch: -2, fov: 40 },
      ship: { label: 'The lander', east: 30, north: 18, heading: 60, pitch: 4, fov: 50 },
      dusk: { label: 'Ridged plains at a low Sun', lat: -12.0, lon: 150.0, heading: 100, pitch: -4, fov: 60, timeOffsetHours: 12 },
      pwyll: { label: 'Pwyll crater', lat: -25.2, lon: 88.6, heading: 0, pitch: -6, fov: 60, timeOffsetHours: 4 },
    },
  },
  places: [
    { id: 'conamara', name: 'Conamara Chaos', fact: 'The ice broke into rafts here and froze again: a sign of the ocean below.', lat: 9.7, lon: 87.3 },
    { id: 'pwyll', name: 'Pwyll crater', fact: 'A young crater whose bright rays reach a thousand kilometres.', lat: -25.2, lon: 88.6 },
    { id: 'thera', name: 'Thera Macula', fact: 'A patch of collapsed ice that may lie over a pocket of water.', lat: -46.7, lon: 178.8 },
    { id: 'tyre', name: 'Tyre (ringed scar)', fact: 'Rings of cracks 140 km across left by an impact that punched through the ice.', lat: 34.0, lon: 213.5 },
    { id: 'subjupiter', name: 'The point under Jupiter', fact: 'Jupiter never rises or sets here: it hangs overhead, twelve degrees wide.', lat: 0, lon: 0 },
    { id: 'agenor', name: 'Agenor Linea', fact: 'A bright band 1 400 km long where the ice shell pulled apart.', lat: -43.6, lon: 151.6 },
  ],
};
