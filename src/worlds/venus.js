// Venus — numbers and recipe names only. Under clouds that never part: an oven of
// basalt plains and volcanoes at 460 degrees C, the air ninety times as heavy as ours,
// lit dull orange because only red light reaches the ground.
export default {
  id: 'venus',
  name: 'Venus',
  body: 'venus',
  radius: 6051000,              // m: the sphere Magellan's elevations are measured from
  gravity: 8.87,
  dayHours: 2802,               // a solar day is 117 of ours (the planet turns backwards)

  terrain: {
    maxLevel: 19,               // ~18 m chunks
    minAltitude: -3100,
    maxAltitude: 12100,
    shadowRange: 200000,
    shadowHeadroom: 600,
    // Magellan radar altimetry (4.6 km per pixel): the globe, and the two great mountains.
    dems: [
      { url: 'data/venus_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      { url: 'data/venus_dem_maxwell.i16', width: 273, height: 228, lon0: 0, lon1: 11.997, lat0: 70, lat1: 59.98, feather: 0.8 },     // Maxwell Montes, 11 km high
      { url: 'data/venus_dem_maat.i16', width: 273, height: 182, lon0: 190, lon1: 201.997, lat0: 5, lat1: -2.998, feather: 0.8 },      // Maat Mons, the tallest volcano
    ],
    layers: [
      { op: 'dem' },
      { op: 'fbm', seed: 3, maxWavelength: 30000, minWavelength: 0.8, roughness: 0.8, amp: 14, belowDem: 2.2, slopeGain: [0.04, 0.3, 0.3, 1.0], hetero: 0.5 },
      // Wrinkle ridges cross the lava plains in parallel sets, a kilometre wide and a few
      // tens of metres high; the highlands ("tesserae") are folded and faulted both ways.
      { op: 'lineaments', seed: 5, families: 3, spacing: 14000, width: 800, height: 55, presence: 0.7, segment: 90000, wobble: [2500, 50000], varied: 0.6 },
      { op: 'lineaments', seed: 7, families: 5, spacing: 5200, width: 900, height: 320, presence: 0.8, segment: 60000, wobble: [1200, 30000], varied: 0.6, where: { alt: [2400, 20000], altFade: 600 } },
      { op: 'ridged', seed: 9, maxWavelength: 4000, minWavelength: 30, roughness: 0.9, amp: 500, slopeMask: [0.08, 0.3], warp: 0.3 },
      // The few craters there are (the thick air stops everything small).
      { op: 'craters', seed: 11, radius: [4000, 40000], density: 0.06, layers: 1, depth: 0.05, rim: 0.02, floor: 0.6, belowDem: 2 },
      // Underfoot, as the Venera landers saw it: flat slabs of basalt with soil between.
      { op: 'cells', seed: 13, scale: 2.6, plate: 0.10, edge: 0.14 },
      { op: 'cells', seed: 15, scale: 14, trough: [0.25, 0.9] },
    ],
  },

  surface: {
    roughness: 0.5,
    bounce: 1.0,
    reliefMap: { url: 'data/venus_slopes_4096.jpg', strength: 2.5, latFade: [82, 88] },
    // The ground as Magellan's radar saw it (rough ground bright, smooth lava dark), in
    // the orange of the Venera pictures.
    albedoMap: { url: 'data/venus_color_4096.jpg', encoding: 'srgb', mean: [0.5325, 0.1392, 0.0258], strength: 0.55, chroma: 0.0, latFade: [84, 89], range: [0.5, 1.8] },
    meanAlbedo: [0.11, 0.10, 0.09],
    dust: [0.105, 0.098, 0.090],       // dark basalt soil (grey: the orange is the light)
    sand: [0.085, 0.080, 0.074],
    scree: [0.12, 0.112, 0.103],
    rock: [0.14, 0.132, 0.122],
    bedrock: [0.13, 0.122, 0.113],
    cover: { bedrock: [0.55, 0.55, 0.7], contrast: 0.9 },
    strata: null,
    slopes: { dustMax: 0.25, screeMin: 0.40, screeMax: 0.60, rockMin: 0.80 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.6,
    rocks: { count: 300, radius: 90, size: [0.15, 1.2], albedo: [0.13, 0.122, 0.113] },
  },

  // Carbon dioxide at 92 bar under 20 km of sulphuric-acid cloud. Only a few percent of
  // the sunlight reaches the ground, all of it scattered, the blue long gone.
  atmosphere: {
    topAltitude: 100000,
    surfaceDensity: 65,
    occluderAltitude: 0,
    rayleigh: { scattering: [1.1e-5, 2.6e-5, 6.3e-5], scaleHeight: 15900 },
    dust: {
      // the cloud deck and haze as one layer: very thick, nearly white, taking the blue
      scattering: [2.2e-4, 2.2e-4, 2.2e-4],
      absorption: [0.02e-5, 0.9e-5, 4.5e-5],
      phaseG: [0.7, 0.7, 0.7],
      scaleHeight: 30000,
    },
    absorber: null,
  },

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '1982-03-01T06:00:00Z',   // Venera 13 on the ground
    // Where Venera 13 landed and took the first colour pictures of the surface: the plains
    // east of Phoebe Regio (7.5 S, 303 E).
    start: { lat: -7.5, lon: 303.0, eye: 1.7, heading: 60, pitch: -6 },
    ship: { east: 22, north: 16, heading: 250 },
    exposure: { key: 0.16, min: 0.5, max: 6.0e6, speed: 1.6, shadowFloor: 0.2, highlight: 6 },
    bookmarks: {
      ledge: { label: 'The Venera 13 landing place', heading: 60, pitch: -6, fov: 60 },
      sun: { label: 'The sky of Venus', heading: 100, pitch: 30, fov: 70 },
      wall: { label: 'The plains', heading: 200, pitch: -2, fov: 40 },
      ship: { label: 'The lander', east: 10, north: 8, heading: 60, pitch: 2, fov: 50 },
      dusk: { label: 'Evening on Venus', heading: 270, pitch: 6, fov: 60, timeOffsetHours: 500 },
      maxwell: { label: 'Maxwell Montes', lat: 63.5, lon: 2.0, heading: 70, pitch: 4, fov: 50 },
      maat: { label: 'Maat Mons', lat: -0.5, lon: 193.0, heading: 60, pitch: 6, fov: 50 },
    },
  },
  places: [
    { id: 'venera13', name: 'Venera 13 landing place', fact: 'Venera 13 took the first colour pictures of the surface here in 1982 and lasted 127 minutes.', lat: -7.5, lon: 303.0 },
    { id: 'maxwell', name: 'Maxwell Montes', fact: 'The highest mountains on Venus, 11 km up, where the rock is coated with metal frost.', lat: 65.2, lon: 3.3 },
    { id: 'maat', name: 'Maat Mons', fact: 'A volcano 8 km high that may still be active.', lat: 0.5, lon: 194.6 },
    { id: 'aphrodite', name: 'Aphrodite Terra (Ovda Regio)', fact: 'A highland the size of Africa lying along the equator.', lat: -2.8, lon: 85.6 },
    { id: 'alpha', name: 'Alpha Regio', fact: 'The first feature ever seen on Venus, by radar from Earth in 1963.', lat: -25.5, lon: 1.3 },
    { id: 'artemis', name: 'Artemis Corona', fact: 'A circular trench 2 600 km across, the largest such ring on any world.', lat: -35.0, lon: 135.0 },
  ],
};
