// Mars — numbers and recipe names only. No code. See docs/ARCHITECTURE.md ("Worlds are data").
export default {
  id: 'mars',
  name: 'Mars',
  body: 'mars',                 // key into solarSystem.js (orbit, rotation)
  radius: 3389500,              // m, terrain datum (areoid mean radius)
  gravity: 3.71,                // m/s^2

  terrain: {
    maxLevel: 17,               // finest quadtree level (~40 m chunks)
    minAltitude: -8300,         // lowest terrain on the planet (m), for culling/atmosphere
    maxAltitude: 21300,
    // Elevation rasters (int16 LE metres). Later entries override earlier ones inside
    // their bounds, feathered over `feather` degrees.
    dems: [
      { url: 'data/mars_mola_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      { url: 'data/mars_mola_coprates_128ppd.i16', width: 1408, height: 832, lon0: 291, lon1: 302, lat0: -9.5, lat1: -16, feather: 0.6 },
    ],
    // Height recipe: evaluated top to bottom. See src/terrain/height/layers.js.
    layers: [
      { op: 'dem' },
      // Fill in everything the rasters cannot resolve (fractal relief below the raster pixel size).
      { op: 'fbm', seed: 11, maxWavelength: 48000, minWavelength: 0.6, roughness: 0.82, amp: 26, belowDem: 2.2,
        slopeGain: [0.05, 0.45, 0.22, 1.0], hetero: 0.5 },
      // Spur-and-gully relief on the big walls.
      { op: 'ridged', seed: 23, maxWavelength: 1500, minWavelength: 24, roughness: 0.9, amp: 330, slopeMask: [0.10, 0.36], warp: 0.3 },
      // Horizontal rock strata: resistant layers become cliffs, weak ones benches.
      { op: 'terrace', seed: 31, thickness: 420, cliff: 0.22, rise: 0.74, strength: 0.9, slopeMask: [0.10, 0.30], jitter: 0.3, warpAmp: 50, warpWavelength: 2600 },
      { op: 'terrace', seed: 37, thickness: 46, cliff: 0.30, rise: 0.72, strength: 0.6, slopeMask: [0.16, 0.42], jitter: 0.4, warpAmp: 5, warpWavelength: 300 },
      // Sparse small craters on the plateau and floor.
      { op: 'craters', seed: 41, radius: [30, 1900], density: 0.22, depth: 0.2, rim: 0.04, slopeMaskInv: [0.12, 0.3] },
    ],
  },

  surface: {
    roughness: 0.55,                 // Oren–Nayar sigma (rad)
    meanAlbedo: [0.24, 0.135, 0.07], // regional average, for bounce light and multiple scattering
    // Materials blended by slope and height. Albedos are linear reflectance.
    dust: [0.30, 0.165, 0.080],      // bright butterscotch dust on flats
    sand: [0.150, 0.085, 0.050],     // darker basaltic sand, low ground
    scree: [0.205, 0.115, 0.064],    // talus aprons
    rock: [0.170, 0.098, 0.060],     // cliff rock base colour
    // Strata tint bands multiplied onto rock (period in metres of altitude).
    strata: { seed: 7, period: 1900, contrast: 0.55, fine: 0.30, finePeriod: 140, colors: [[1.25, 1.02, 0.86], [0.72, 0.70, 0.74], [1.05, 0.90, 0.72], [0.55, 0.52, 0.55], [1.15, 0.98, 0.80]] },
    slopes: { dustMax: 0.30, screeMin: 0.42, screeMax: 0.74, rockMin: 0.80 },   // tan(slope)
    sandBelow: -3600, sandFade: 900,   // dark sand appears below this altitude (m)
    ripples: { wavelength: 0.9, strength: 0.16 },
    detailStrength: 0.5,
    rocks: { count: 320, radius: 110, size: [0.25, 1.6], albedo: [0.150, 0.090, 0.058] },
  },

  atmosphere: {
    topAltitude: 90000,            // m
    occluderAltitude: 2500,        // m: mean local terrain used for the planet's shadow on the air
    // CO2 gas (Rayleigh). Coefficients per metre at datum.
    rayleigh: { scattering: [1.15e-7, 2.7e-7, 6.6e-7], scaleHeight: 11100 },
    // Dust: absorbs blue, forward-scatters it in a tighter lobe (blue aureole at the Sun).
    dust: {
      scattering: [2.25e-5, 1.98e-5, 1.64e-5],
      absorption: [0.06e-5, 0.40e-5, 1.00e-5],
      phaseG: [0.70, 0.76, 0.85],
      scaleHeight: 11100,
      // Low dust layer pooled in the canyon (exponential height fog).
      fog: { density: 0.9, baseAltitude: -4800, scaleHeight: 1900 },
    },
    absorber: null,
  },

  sky: {
    bodies: ['phobos', 'deimos', 'earth', 'moon'],
    stars: { url: 'data/stars_bsc5.f32' },
  },

  scene: {
    dateUTC: '2014-01-31T09:29:00Z',   // ~20 min before local sunset at the start site
    start: { lat: -13.19128, lon: 296.57326, eye: 1.7, heading: 295, pitch: -4 },
    ship: { east: 30, north: 74, heading: 200 },      // metres from start
    exposure: { key: 0.16, min: 0.5, max: 6.0e5, speed: 1.6 },
    bookmarks: {
      ledge: { heading: 295, pitch: -4, fov: 60 },
      sun: { heading: 297, pitch: 3, fov: 22 },
      wall: { heading: 10, pitch: 3, fov: 50 },
      ship: { heading: 22, pitch: 1, fov: 38 },
      dusk: { heading: 298, pitch: 9, fov: 60, timeOffsetHours: 1.7 },
    },
  },
};
