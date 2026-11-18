// The Moon — numbers and recipe names only. No code. Same engine as Mars: no atmosphere
// (null), grey palette, cratered terrain recipe, Earth in the sky.
export default {
  id: 'moon',
  name: 'Moon',
  body: 'moon',
  radius: 1737400,
  gravity: 1.62,
  dayHours: 708.7,              // length of the solar day (sets the time slider's range)

  terrain: {
    maxLevel: 16,               // ~42 m chunks at the finest level (the Moon is half Mars' size)
    minAltitude: -9100,
    maxAltitude: 10800,
    shadowRange: 220000,
    // Elevation above the 1737.4 km sphere, int16 LE. Later entries override earlier ones
    // inside their bounds, feathered over `feather` degrees. scale = metres per unit.
    dems: [
      // LOLA, the whole Moon at 7.6 km per pixel
      { url: 'data/moon_lola_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      // SLDEM2015: the Apennines and the edge of Mare Imbrium, 474 m per pixel
      { url: 'data/moon_sldem_apennine_64ppd.i16', width: 768, height: 640, lon0: 0, lon1: 12, lat0: 31, lat1: 21, feather: 0.8, scale: 0.5 },
      // SLDEM2015: Hadley Rille and the Apollo 15 site, 59 m per pixel
      { url: 'data/moon_sldem_hadley_512ppd.i16', width: 1024, height: 1152, lon0: 2.5, lon1: 4.5, lat0: 27, lat1: 24.75, feather: 0.25, scale: 0.5 },
      // Landmarks (SLDEM2015): Tycho at 474 m per pixel, the Taurus-Littrow valley at 118 m
      { url: 'data/moon_sldem_tycho_64ppd.i16', width: 400, height: 320, lon0: 345.5, lon1: 351.75, lat0: -40.75, lat1: -45.75, feather: 0.5, scale: 0.5 },
      { url: 'data/moon_sldem_taurus_littrow_256ppd.i16', width: 384, height: 352, lon0: 30.0, lon1: 31.5, lat0: 20.875, lat1: 19.5, feather: 0.2, scale: 0.5 },
    ],
    layers: [
      { op: 'dem' },
      // Everything the rasters cannot resolve: relief, then craters, each only below the
      // pixel size of the raster under the point (so real craters are never doubled).
      { op: 'fbm', seed: 3, maxWavelength: 20000, minWavelength: 300, roughness: 0.9, amp: 5.5, belowDem: 2.2 },
      { op: 'craters', seed: 5, radius: [3500, 56000], density: 1.0, layers: 3, depth: 0.11, rim: 0.028, belowDem: 2 },
      { op: 'craters', seed: 7, radius: [50, 3500], density: 1.0, layers: 4, depth: 0.19, rim: 0.045, belowDem: 2 },
      // (down to craters a couple of metres across: the ground is saturated with them at walking distance)
      { op: 'craters', seed: 9, radius: [1.2, 50], density: 1.0, layers: 3, depth: 0.17, rim: 0.04 },
      // Regolith: gentle hummocks, rougher on crater walls.
      { op: 'fbm', seed: 13, maxWavelength: 260, minWavelength: 0.8, roughness: 0.92, amp: 2.0, slopeGain: [0.12, 0.5, 0.5, 1.7], hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 1.0,                    // very rough, back-scattering regolith (flat-looking disc)
    photometry: 'lunar',               // airless regolith: glares down-Sun, dark toward the Sun
    bounce: 0.35,                      // so sunlit ground lights the shadows less than a matte surface would
    // Clementine 750 nm brightness (values are linear, not gamma-encoded). Mean over the sphere
    // 0.32. Toward the poles the mosaic is mostly its own shadows, so it fades out there.
    albedoMap: { url: 'data/moon_albedo_2880.jpg', encoding: 'linear', mean: [0.32, 0.32, 0.32], strength: 1.0, latFade: [62, 75] },
    meanAlbedo: [0.118, 0.112, 0.105],
    dust: [0.120, 0.114, 0.107],       // mature regolith
    sand: [0.085, 0.081, 0.077],       // darker fines in low ground
    scree: [0.150, 0.143, 0.134],
    rock: [0.205, 0.197, 0.186],       // fresh rock on steep crater walls is brighter
    strata: null,
    slopes: { dustMax: 0.34, screeMin: 0.50, screeMax: 0.70, rockMin: 0.92 },
    sandBelow: -20000, sandFade: 1500,   // no darkening by altitude: the brightness map knows where the maria are
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.7,               // loose soil: every clod shows in the raking light
    rocks: { count: 420, radius: 120, size: [0.25, 2.0], albedo: [0.19, 0.182, 0.172] },
  },

  atmosphere: null,

  sky: {
    bodies: ['earth'],
    stars: { url: 'data/stars_bsc5.f32' },
  },

  scene: {
    // Hadley Rille at the foot of the Apennines, where Apollo 15 landed. The date is the
    // second day of that mission's surface work: mid-morning on this part of the Moon, the
    // Sun 29 degrees up in the east, a crescent Earth high in the southern sky.
    dateUTC: '1971-08-01T13:00:00Z',
    // The outside of the rille's sharp bend at the foot of Hadley Delta (near Apollo 15's
    // station 2), looking straight down the canyon: 1.5 km wide, 300 m deep, the far reach
    // running north-north-west for three kilometres.
    start: { lat: 26.0288, lon: 3.5892, eye: 1.7, heading: 335, pitch: -8 },
    ship: { east: 1218, north: 3135, heading: 200 },     // the Apollo 15 landing site (26.1322 N, 3.6339 E)
    // shadowFloor: texels darker than this fraction of the frame mean (black sky, hard shadow)
    // barely raise the exposure, so sunlit ground is exposed like a lunar surface photograph.
    // dim: above this exposure only part of the missing light is made up, so night is night.
    exposure: { key: 0.06, min: 0.5, max: 6.0e5, speed: 1.6, shadowFloor: 0.6, highlight: 6, dim: { above: 400, power: 0.2 } },
    // The first five are one place at different moments; the rest are other real places.
    // timeOffsetHours moves the clock from dateUTC to the light that suits the view.
    bookmarks: {
      ledge: { label: 'Hadley Rille', heading: 335, pitch: -8, fov: 60 },
      sun: { label: 'Sunrise over the Apennines', lat: 26.1250, lon: 3.5722, heading: 94.5, pitch: 7.5, fov: 22, timeOffsetHours: -46 },
      wall: { label: 'Mount Hadley', lat: 26.1250, lon: 3.5729, heading: 42, pitch: 5, fov: 30 },          // 23 km to the north-east, 4.5 km high
      ship: { label: 'Apollo 15 landing site', lat: 26.1333, lon: 3.6340, heading: 178, pitch: 3, fov: 50 },   // Hadley Delta behind the lander
      dusk: { label: 'Night at Hadley, Earth overhead', lat: 26.1250, lon: 3.5722, heading: 190, pitch: 33, fov: 78, timeOffsetHours: 345 },
      tycho: { label: 'Tycho, from the south rim', lat: -44.652, lon: 348.65, heading: 5, pitch: -4, fov: 36, timeOffsetHours: 36 },   // the central peak, 40 km away and 3.6 km below
      taurus: { label: 'Taurus-Littrow valley (Apollo 17)', lat: 20.1816, lon: 30.7914, heading: 240, pitch: 24, fov: 68, timeOffsetHours: -72 },   // 600 m from the landing place: the Earth above the South Massif
    },
  },
};
