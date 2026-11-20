// Mercury — numbers and recipe names only. An airless, heavily cratered world close to the
// Sun, which stands two and a half to three times as wide in its sky as in ours.
export default {
  id: 'mercury',
  name: 'Mercury',
  body: 'mercury',
  radius: 2439400,
  gravity: 3.70,
  dayHours: 4222.6,             // one solar day is 176 of ours: two of Mercury's years

  terrain: {
    maxLevel: 18,               // ~15 m chunks at the finest level
    minAltitude: -5600,
    maxAltitude: 4800,
    shadowRange: 220000,
    // MESSENGER stereo elevation (USGS, 665 m per pixel): the whole planet at 10.6 km per
    // pixel and four places at full detail.
    dems: [
      { url: 'data/mercury_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      { url: 'data/mercury_dem_carnegie.i16', width: 896, height: 768, lon0: 300, lon1: 314, lat0: 64, lat1: 52, feather: 0.6 },        // Carnegie Rupes cutting Duccio crater
      { url: 'data/mercury_dem_caloris.i16', width: 896, height: 768, lon0: 156, lon1: 170, lat0: 37, lat1: 25, feather: 0.6 },         // Pantheon Fossae, the middle of Caloris
      { url: 'data/mercury_dem_rachmaninoff.i16', width: 832, height: 704, lon0: 51, lon1: 64, lat0: 33, lat1: 22, feather: 0.6 },      // the Rachmaninoff double-ring basin
      { url: 'data/mercury_dem_kuiper.i16', width: 832, height: 640, lon0: 322, lon1: 335, lat0: -6, lat1: -16, feather: 0.6 },         // Kuiper, the bright rayed crater
    ],
    layers: [
      { op: 'dem' },
      { op: 'fbm', seed: 3, maxWavelength: 24000, minWavelength: 300, roughness: 0.9, amp: 6, belowDem: 2.2 },
      // Craters the maps cannot show. Mercury's are a little shallower than the Moon's
      // (twice the gravity), and secondaries cluster thickly round the big ones.
      { op: 'craters', seed: 5, radius: [3500, 48000], density: 1.0, layers: 3, depth: 0.10, rim: 0.026, belowDem: 2 },
      { op: 'craters', seed: 7, radius: [50, 3500], density: 1.0, layers: 4, depth: 0.17, rim: 0.042, belowDem: 2, slopeMaskInv: [0.33, 0.5] },
      { op: 'craters', seed: 9, radius: [1.2, 50], density: 1.0, layers: 3, depth: 0.28, rim: 0.065, ageSkew: 2, slopeMaskInv: [0.33, 0.5] },
      { op: 'fbm', seed: 13, maxWavelength: 260, minWavelength: 0.8, roughness: 0.92, amp: 2.0, slopeGain: [0.12, 0.5, 0.5, 1.7], hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 1.0,
    photometry: 'lunar',
    bounce: 0.35,
    reliefMap: { url: 'data/mercury_slopes_4096.jpg', strength: 2.0, latFade: [80, 88] },
    // MESSENGER colour mosaic with most of its (three far-apart filters') colour taken out:
    // bright rays and smooth plains against the dark old ground.
    albedoMap: { url: 'data/mercury_color_4096.jpg', encoding: 'srgb', mean: [0.1626, 0.1496, 0.1301], strength: 1.0, chroma: 0.7, latFade: [70, 82], range: [0.45, 2.4] },
    meanAlbedo: [0.118, 0.108, 0.095],
    dust: [0.120, 0.110, 0.096],       // a little darker and browner than the Moon
    sand: [0.090, 0.083, 0.073],
    scree: [0.150, 0.139, 0.123],
    rock: [0.200, 0.188, 0.170],
    strata: null,
    slopes: { dustMax: 0.34, screeMin: 0.50, screeMax: 0.70, rockMin: 0.92 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.7,
    rocks: { count: 420, radius: 120, size: [0.25, 2.0], albedo: [0.19, 0.178, 0.16] },
  },

  atmosphere: null,

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    // The day MESSENGER went into orbit round Mercury.
    dateUTC: '2011-03-18T01:00:00Z',
    // The crest of Carnegie Rupes, a cliff two kilometres high where the planet's crust
    // broke as it cooled and shrank; it cuts the floor of Duccio crater in two.
    start: { lat: 58.2, lon: 307.2, eye: 1.7, heading: 250, pitch: -6 },
    ship: { east: 60, north: 40, heading: 200 },
    exposure: { key: 0.06, min: 0.5, max: 6.0e5, speed: 1.6, shadowFloor: 0.6, highlight: 6, dim: { above: 60, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'Carnegie Rupes, the crest', heading: 250, pitch: -6, fov: 60 },
      sun: { label: 'The Sun from Mercury', heading: 90, pitch: 10, fov: 30 },
      wall: { label: 'Carnegie Rupes, along the cliff', heading: 200, pitch: -3, fov: 34 },
      ship: { label: 'The lander', east: 30, north: 20, heading: 60, pitch: 4, fov: 50 },
      dusk: { label: 'Carnegie Rupes at sunset', heading: 270, pitch: 4, fov: 60, timeOffsetHours: 300 },
      caloris: { label: 'Caloris, Pantheon Fossae', lat: 30.5, lon: 162.9, heading: 40, pitch: -6, fov: 55, timeOffsetHours: 1200 },
      rachmaninoff: { label: 'Rachmaninoff basin', lat: 26.0, lon: 59.5, heading: 330, pitch: -5, fov: 55, timeOffsetHours: 500 },
      kuiper: { label: 'Kuiper crater', lat: -10.6, lon: 329.4, heading: 250, pitch: -8, fov: 55, timeOffsetHours: 0 },
    },
  },
  places: [
    { id: 'carnegie', name: 'Carnegie Rupes', lat: 58.2, lon: 307.2 },
    { id: 'caloris', name: 'Caloris basin (Pantheon Fossae)', lat: 30.5, lon: 162.9 },
    { id: 'rachmaninoff', name: 'Rachmaninoff basin', lat: 27.6, lon: 57.5 },
    { id: 'kuiper', name: 'Kuiper crater', lat: -11.3, lon: 328.7 },
    { id: 'discovery', name: 'Discovery Rupes', lat: -54.0, lon: 323.0 },
    { id: 'beethoven', name: 'Beethoven basin', lat: -20.8, lon: 236.2 },
    { id: 'rembrandt', name: 'Rembrandt basin', lat: -32.9, lon: 87.9 },
    { id: 'northpole', name: 'North pole (ice in the dark craters)', lat: 88.0, lon: 0 },
  ],
};
