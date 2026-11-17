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
    shadowCeiling: 6000,
    shadowRange: 220000,
    dems: [],                   // fully procedural for this milestone; a LOLA raster can be listed here later
    layers: [
      // Broad highland / basin relief.
      { op: 'fbm', seed: 3, maxWavelength: 1200000, minWavelength: 300, roughness: 0.9, amp: 5.5 },
      // Impact craters at every scale, densest at the small end (saturated surface).
      { op: 'craters', seed: 5, radius: [3500, 56000], density: 1.0, layers: 3, depth: 0.11, rim: 0.028 },
      { op: 'craters', seed: 7, radius: [50, 3500], density: 1.0, layers: 4, depth: 0.19, rim: 0.045 },
      { op: 'craters', seed: 9, radius: [3, 50], density: 1.0, layers: 3, depth: 0.17, rim: 0.04 },
      // Regolith: gentle hummocks, rougher on crater walls.
      { op: 'fbm', seed: 13, maxWavelength: 260, minWavelength: 0.8, roughness: 0.92, amp: 2.0, slopeGain: [0.12, 0.5, 0.5, 1.7], hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 1.0,                    // very rough, back-scattering regolith (flat-looking disc)
    meanAlbedo: [0.118, 0.112, 0.105],
    dust: [0.120, 0.114, 0.107],       // mature regolith
    sand: [0.085, 0.081, 0.077],       // darker fines in low ground
    scree: [0.150, 0.143, 0.134],
    rock: [0.205, 0.197, 0.186],       // fresh rock on steep crater walls is brighter
    strata: null,
    slopes: { dustMax: 0.34, screeMin: 0.50, screeMax: 0.70, rockMin: 0.92 },
    sandBelow: -2600, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.32,
    rocks: { count: 420, radius: 120, size: [0.25, 2.0], albedo: [0.19, 0.182, 0.172] },
  },

  atmosphere: null,

  sky: {
    bodies: ['earth'],
    stars: { url: 'data/stars_bsc5.f32' },
  },

  scene: {
    dateUTC: '2026-01-15T01:00:00Z',   // lunar evening at the site: Sun 7 deg up in the west, gibbous Earth 36 deg up in the east
    // Just inside the east rim of a ~3 km crater, on the slope that faces the low Sun,
    // looking west across the crater. The rim crest is 25 m behind (east of) the camera.
    start: { lat: 7.978229, lon: -54.94822, eye: 1.7, heading: 270, pitch: -6 },
    ship: { east: 95, north: 10, heading: 200 },
    // shadowFloor: texels darker than this fraction of the frame mean (black sky, hard shadow)
    // barely raise the exposure, so sunlit ground is exposed like a lunar surface photograph.
    exposure: { key: 0.06, min: 0.5, max: 6.0e5, speed: 1.6, shadowFloor: 0.6, highlight: 6 },
    bookmarks: {
      ledge: { heading: 270, pitch: -6, fov: 60 },
      sun: { heading: 269, pitch: 4, fov: 22 },
      wall: { heading: 322, pitch: -9, fov: 42 },
      // two days earlier: the Sun is ~30 deg up, so the rim's shadow no longer covers the lander
      ship: { east: 25, heading: 82, pitch: 10, fov: 62, timeOffsetHours: -48 },    // from the crest
      dusk: { east: 25, heading: 86, pitch: 13, fov: 60, timeOffsetHours: 20 },
    },
  },
};
