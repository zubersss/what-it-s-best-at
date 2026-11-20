// Pluto — numbers and recipe names only. A plain of nitrogen ice a thousand kilometres
// wide, slowly churning in polygons; mountains of water ice hard as rock along its shore;
// a dark red land beside it; a thin blue haze. Charon hangs in one place in the sky.
// (New Horizons saw one hemisphere; elevation exists for that side only.)
export default {
  id: 'pluto',
  name: 'Pluto',
  body: 'pluto',
  radius: 1188300,
  gravity: 0.62,
  dayHours: 153.3,

  terrain: {
    maxLevel: 17,               // ~14 m chunks
    minAltitude: -4300,
    maxAltitude: 6600,
    shadowRange: 160000,
    shadowHeadroom: 500,
    // New Horizons stereo elevation (300 m per pixel where the fly-by saw it).
    dems: [
      { url: 'data/pluto_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      { url: 'data/pluto_dem_sputnik.i16', width: 553, height: 830, lon0: 168, lon1: 183.998, lat0: 32, lat1: 7.988, feather: 0.6 },     // the west shore of Sputnik Planitia: al-Idrisi, Hillary and Tenzing Montes
      { url: 'data/pluto_dem_wright.i16', width: 553, height: 830, lon0: 170, lon1: 177.999, lat0: -8, lat1: -20.006, feather: 0.5 },      // Wright Mons, an ice volcano
    ],
    layers: [
      { op: 'dem' },
      { op: 'fbm', seed: 3, maxWavelength: 9000, minWavelength: 200, roughness: 0.85, amp: 12, belowDem: 2.2, slopeGain: [0.05, 0.4, 0.2, 1.4] },
      // Sputnik Planitia: the nitrogen ice turns over in cells 20-40 km across, their edges
      // marked by troughs a few kilometres wide and tens of metres deep.
      { op: 'cells', seed: 5, scale: 30000, trough: [70, 2600], dome: 45, where: { at: [[24, 178, 520000], [3, 180, 380000]], alt: [-9000, -1300], altFade: 250 } },
      // ... and its surface is pitted where the ice sublimes: fields of pits a few hundred
      // metres across.
      { op: 'craters', seed: 7, radius: [90, 420], density: 1.0, layers: 2, depth: 0.22, rim: 0.0, floor: 0.2, ageSkew: 1.5, where: { at: [[24, 178, 520000], [3, 180, 380000]], alt: [-9000, -1300], altFade: 250, cover: 0.4, seed: 9, wavelength: 60000 } },
      // The mountain blocks: spur-and-gully faces on the water-ice massifs.
      { op: 'ridged', seed: 11, maxWavelength: 5000, minWavelength: 40, roughness: 0.9, amp: 900, slopeMask: [0.12, 0.34], warp: 0.3 },
      // The bladed terrain of Tartarus Dorsa: knife ridges of methane ice 300 m high.
      { op: 'lineaments', seed: 13, families: 2, spacing: 6000, width: 2400, height: 320, presence: 0.9, segment: 90000, segmentLevel: -0.3, wobble: [1500, 30000], varied: 0.4, where: { at: [[16, 228, 300000]] } },
      // Craters of the old dark lands, where the ice plain is not.
      { op: 'craters', seed: 15, radius: [600, 9000], density: 0.7, layers: 2, depth: 0.12, rim: 0.03, belowDem: 2, where: { alt: [-1200, 9000], altFade: 300 } },
      { op: 'craters', seed: 17, radius: [8, 600], density: 0.5, layers: 2, depth: 0.16, rim: 0.04, ageSkew: 2, slopeMaskInv: [0.3, 0.5], where: { alt: [-1200, 9000], altFade: 300 } },
      { op: 'fbm', seed: 19, maxWavelength: 160, minWavelength: 0.8, roughness: 0.93, amp: 1.4, hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 0.45,
    bounce: 0.8,
    reliefMap: { url: 'data/pluto_slopes_4096.jpg', strength: 2.0, latFade: [84, 89] },
    // New Horizons mosaic, coloured from Cthulhu's dark red-brown to the cream of the ice
    // plain (scripts/fetch-worlds.py).
    albedoMap: { url: 'data/pluto_color_4096.jpg', encoding: 'srgb', mean: [0.3474, 0.1994, 0.123], strength: 1.0, chroma: 1.0, latFade: [86, 89], range: [0.1, 2.4] },
    meanAlbedo: [0.56, 0.46, 0.38],
    dust: [0.62, 0.50, 0.41],          // frosts of nitrogen and methane with a little red tholin
    sand: [0.50, 0.38, 0.30],
    scree: [0.52, 0.45, 0.40],
    rock: [0.42, 0.41, 0.42],          // water-ice bedrock
    strata: null,
    slopes: { dustMax: 0.32, screeMin: 0.48, screeMax: 0.68, rockMin: 0.88 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.4,
    rocks: { count: 220, radius: 120, size: [0.25, 2.0], albedo: [0.46, 0.45, 0.46] },
  },

  // Nitrogen at a hundred-thousandth of our air's pressure, with layers of blue haze.
  atmosphere: {
    topAltitude: 250000,
    surfaceDensity: 1.0e-4,
    occluderAltitude: 0,
    rayleigh: { scattering: [1.6e-10, 3.8e-10, 9.2e-10], scaleHeight: 50000 },
    dust: { scattering: [0.8e-8, 1.5e-8, 3.2e-8], absorption: [0, 0, 0], phaseG: [0.72, 0.72, 0.72], scaleHeight: 45000 },
    absorber: null,
  },

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2015-07-14T11:50:00Z',   // New Horizons' closest approach
    // The shore of Sputnik Planitia under the Hillary Montes: the ice plain runs to the
    // horizon on one side, mountains of water ice three kilometres high stand on the other.
    start: { lat: 18.4, lon: 175.0, eye: 1.7, heading: 250, pitch: 0 },
    ship: { east: 40, north: 30, heading: 40 },
    exposure: { key: 0.16, min: 0.5, max: 6.0e6, speed: 1.6, shadowFloor: 0.5, highlight: 6, dim: { above: 9000, power: 0.5, most: 5 } },
    bookmarks: {
      ledge: { label: 'Sputnik Planitia, the western shore', heading: 250, pitch: 0, fov: 60 },
      sun: { label: 'The Sun from Pluto', heading: 90, pitch: 20, fov: 30 },
      wall: { label: 'Hillary Montes', heading: 280, pitch: 3, fov: 34 },
      ship: { label: 'The lander', east: 20, north: 14, heading: 60, pitch: 4, fov: 50 },
      dusk: { label: 'The ice plain at a low Sun', heading: 80, pitch: -3, fov: 60, timeOffsetHours: 30 },
      charon: { label: 'Charon from Pluto', lat: 5.0, lon: 10.0, heading: 0, pitch: 80, fov: 30 },
      wright: { label: 'Wright Mons', lat: -19.5, lon: 172.0, heading: 30, pitch: 3, fov: 50, timeOffsetHours: 10 },
    },
  },
  places: [
    { id: 'sputnik', name: 'Sputnik Planitia', lat: 20.0, lon: 180.0 },
    { id: 'hillary', name: 'Hillary Montes', lat: 17.0, lon: 172.5 },
    { id: 'tenzing', name: 'Tenzing Montes', lat: -15.0, lon: 176.0 },
    { id: 'wright', name: 'Wright Mons', lat: -21.4, lon: 173.2 },
    { id: 'tartarus', name: 'Tartarus Dorsa (bladed terrain)', lat: 16.0, lon: 228.0 },
    { id: 'cthulhu', name: 'Cthulhu Macula', lat: -5.0, lon: 110.0 },
    { id: 'subcharon', name: 'The point under Charon', lat: 0, lon: 0 },
  ],
};
