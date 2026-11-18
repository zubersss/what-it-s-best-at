// Mars — numbers and recipe names only. No code. See docs/ARCHITECTURE.md ("Worlds are data").
export default {
  id: 'mars',
  name: 'Mars',
  body: 'mars',                 // key into solarSystem.js (orbit, rotation)
  radius: 3389500,              // m, terrain datum (areoid mean radius)
  gravity: 3.71,                // m/s^2
  dayHours: 24.66,              // length of the solar day (sets the time slider's range)

  terrain: {
    maxLevel: 17,               // finest quadtree level (~40 m chunks)
    minAltitude: -8300,         // lowest terrain on the planet (m), for culling/atmosphere
    maxAltitude: 21300,
    shadowRange: 160000,        // how far shadow rays are marched (m)
    shadowHeadroom: 600,        // the recipe below never adds more than this on top of the elevation maps (m)
    // Elevation rasters (int16 LE metres). Later entries override earlier ones inside
    // their bounds, feathered over `feather` degrees.
    dems: [
      { url: 'data/mars_mola_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      { url: 'data/mars_mola_coprates_128ppd.i16', width: 1408, height: 832, lon0: 291, lon1: 302, lat0: -9.5, lat1: -16, feather: 0.6 },
      // Landmarks (MOLA): the Olympus Mons shield at 1.9 km per pixel, its summit calderas
      // and Gale crater at 463 m per pixel.
      { url: 'data/mars_mola_olympus_32ppd.i16', width: 448, height: 416, lon0: 219, lon1: 233, lat0: 25, lat1: 12, feather: 1.0 },
      { url: 'data/mars_mola_olympus_summit_128ppd.i16', width: 384, height: 384, lon0: 224.75, lon1: 227.75, lat0: 20, lat1: 17, feather: 0.4 },
      { url: 'data/mars_mola_gale_128ppd.i16', width: 512, height: 512, lon0: 135.75, lon1: 139.75, lat0: -3.25, lat1: -7.25, feather: 0.5 },
    ],
    // Height recipe: evaluated top to bottom. See src/terrain/height/layers.js.
    layers: [
      { op: 'dem' },
      // Fill in everything the rasters cannot resolve (fractal relief below the raster pixel size).
      { op: 'fbm', seed: 11, maxWavelength: 48000, minWavelength: 0.6, roughness: 0.82, amp: 30, belowDem: 2.2,
        slopeGain: [0.05, 0.45, 0.22, 1.0], hetero: 0.5 },
      // Spur-and-gully relief on the big walls.
      { op: 'ridged', seed: 23, maxWavelength: 1500, minWavelength: 24, roughness: 0.9, amp: 400, slopeMask: [0.10, 0.36], warp: 0.3 },
      // Horizontal rock strata: resistant layers become cliffs, weak ones benches.
      { op: 'terrace', seed: 31, thickness: 290, cliff: 0.24, rise: 0.70, strength: 0.8, slopeMask: [0.10, 0.30], jitter: 0.3, warpAmp: 40, warpWavelength: 2600 },
      // (a narrow cliff fraction makes the risers steep enough to be rock, not a sandy ramp)
      { op: 'terrace', seed: 37, thickness: 38, cliff: 0.18, rise: 0.76, strength: 0.6, slopeMask: [0.10, 0.30], jitter: 0.4, warpAmp: 5, warpWavelength: 300 },
      // Walking scale: beds a few metres thick stand out as crisp ledges, so hillsides
      // read as layered rock, not dunes.
      { op: 'terrace', seed: 43, thickness: 5, cliff: 0.16, rise: 0.80, strength: 0.8, slopeMask: [0.22, 0.42], jitter: 0.5, warpAmp: 1.5, warpWavelength: 70 },
      // Craters 1-30 km across wherever the elevation map is coarser than that (belowDem):
      // the old cratered highlands seen from orbit. Martian craters are shallow (infilled,
      // wind-worn), about a twentieth as deep as they are wide; few are fresh.
      { op: 'craters', seed: 53, radius: [600, 16000], density: 0.6, layers: 2, depth: 0.10, rim: 0.022, ageSkew: 2, belowDem: 2, slopeMaskInv: [0.12, 0.3] },
      // Sparse small craters on the plateau and canyon floor only.
      { op: 'craters', seed: 41, radius: [30, 900], density: 1.0, layers: 1, depth: 0.2, rim: 0.04, slopeMaskInv: [0.05, 0.14] },
    ],
  },

  surface: {
    roughness: 0.55,                 // Oren–Nayar sigma (rad)
    farRoughness: 0.2,               // the same for ground seen from orbit: the disc darkens toward its edge as real Mars does
    meanAlbedo: [0.24, 0.135, 0.07], // regional average, for bounce light and multiple scattering
    // Viking colour mosaic of the whole planet (sRGB image; mean linear colour below). It
    // scales the palette place by place: dark basaltic plains, bright dust, polar ice. All
    // of its colour differences are used: against the bright regions its dark ones are
    // 0.4-0.45 as bright in red and 0.75 in blue (Solis Lacus / Syria, Meridiani / Arabia),
    // the spectral contrast of dark basalt against dust; at half, every dark region was
    // the same orange as the dust, only darker.
    // The ground's slope everywhere (MOLA, 16 px/deg box-averaged to 5.2 km): relief shading from far away, where
    // the terrain's own normal maps are tens of kilometres per texel. strength 1 = true relief;
    // 2 doubles the slopes of what it adds, so landforms read on a phone from orbit (a stylisation).
    reliefMap: { url: 'data/mars_slopes_4096.jpg', strength: 2.0, latFade: [80, 88] },
    albedoMap: { url: 'data/mars_color_4096.jpg', encoding: 'srgb', mean: [0.197, 0.118, 0.113], strength: 1.0, chroma: 1.0 },
    // (No ceiling (max) on its brightest parts: the mosaic's photographed sunlit walls and
    // crater rims are a real depth cue from orbit. Held at 1.7 times the mean, Mars lost it.)
    // Materials blended by slope and height. Albedos are linear reflectance.
    dust: [0.30, 0.165, 0.080],      // bright butterscotch dust on flats
    sand: [0.150, 0.085, 0.050],     // darker basaltic sand, low ground
    scree: [0.205, 0.115, 0.064],    // talus aprons
    rock: [0.170, 0.098, 0.060],     // cliff rock base colour
    // Strata tint bands multiplied onto rock (period in metres of altitude).
    strata: { seed: 7, period: 1900, contrast: 0.55, fine: 0.30, finePeriod: 140, colors: [[1.25, 1.02, 0.86], [0.72, 0.70, 0.74], [1.05, 0.90, 0.72], [0.55, 0.52, 0.55], [1.15, 0.98, 0.80]] },
    slopes: { dustMax: 0.30, screeMin: 0.42, screeMax: 0.74, rockMin: 0.80 },   // tan(slope)
    sandBelow: -3600, sandFade: 900,   // dark sand appears below this altitude (m)
    ripples: { wavelength: 0.9, strength: 0.10 },
    detailStrength: 0.38,
    rocks: { count: 480, radius: 120, size: [0.3, 2.4], albedo: [0.150, 0.090, 0.058] },
  },

  atmosphere: {
    topAltitude: 90000,            // m
    surfaceDensity: 0.020,         // kg/m^3 at datum (how hard the air pushes on cloth)
    occluderAltitude: 2500,        // m: mean local terrain used for the planet's shadow on the air
    // CO2 gas (Rayleigh). Coefficients per metre at datum.
    rayleigh: { scattering: [1.15e-7, 2.7e-7, 6.6e-7], scaleHeight: 11100 },
    // Dust: absorbs blue, forward-scatters it in a tighter lobe (blue aureole at the Sun).
    dust: {
      // A clear-season load: column optical depth about 0.23 at datum.
      scattering: [1.91e-5, 1.68e-5, 1.39e-5],
      absorption: [0.05e-5, 0.34e-5, 0.85e-5],
      phaseG: [0.70, 0.76, 0.85],
      scaleHeight: 11100,
      // Low dust layer pooled in the canyon (exponential height fog).
      fog: { density: 0.6, baseAltitude: -4800, scaleHeight: 1900 },
    },
    absorber: null,
  },

  sky: {
    bodies: ['phobos', 'deimos', 'earth', 'moon'],
    stars: { url: 'data/stars_bsc5.f32' },
  },

  scene: {
    dateUTC: '2014-01-31T09:29:00Z',   // ~20 min before local sunset at the start site
    // The lip of a bench on the north flank of Coprates' southern ridge, ~570 m above datum.
    start: { lat: -13.174286, lon: 296.567862, eye: 1.7, heading: 292, pitch: -7 },
    ship: { east: 66, north: -53, heading: 250 },     // metres from start
    // highlight: how many times over white the brightest lit surface may be pushed
    // max: how far the exposure may be pushed in the dark. It is what keeps the twilight
    // glow from burning out an hour and a half after sunset.
    // globe: how bright the sunlit part of the planet is held when it is seen as a world in
    // black space (the engine's default, 0.32, is for grey worlds). Mars at 0.18 is metered
    // like a mid-grey card, below the tone curve's shoulder, which would otherwise fade its
    // orange to cream and flatten its dark markings (it kept half of their contrast).
    exposure: { key: 0.16, min: 0.5, max: 2.3e5, speed: 1.6, shadowFloor: 0.2, highlight: 6, globe: 0.18 },
    // The first five are one place at different moments; the rest are other real places.
    // timeOffsetHours moves the clock from dateUTC to the light that suits the view.
    bookmarks: {
      // The lip of the canyon's north rim, 5.1 km up, two hours before sunset: the ground
      // falls away 10 km to the floor, the lit south wall 60 km away across the haze.
      ledge: { label: 'Coprates Chasma, the north rim', lat: -11.6859, lon: 296.7243, heading: 210, pitch: -9, fov: 48, timeOffsetHours: -2 },
      sun: { label: 'Coprates, the setting Sun', heading: 297, pitch: 3, fov: 22 },
      wall: { label: 'Coprates, the north wall', heading: 352, pitch: -2, fov: 34 },
      ship: { label: 'Coprates, the lander', east: 25, north: -20, heading: 123, pitch: 2, fov: 40 },     // from a sunlit bench, looking at the lander
      dusk: { label: 'Coprates at dusk', heading: 298, pitch: 9, fov: 60, timeOffsetHours: 1.7 },
      canyon: { label: 'Coprates, sunset along the canyon', heading: 292, pitch: -7, fov: 60 },   // from the bench on the southern ridge
      olympus: { label: 'Olympus Mons, the summit caldera', lat: 18.231, lon: 226.1658, heading: 90, pitch: -10, fov: 64, timeOffsetHours: 4.5 },   // the lip of the west wall, 20 km up, late afternoon
      gale: { label: 'Gale crater, Mount Sharp', lat: -4.5895, lon: 137.4417, heading: 150, pitch: 3, fov: 45, timeOffsetHours: 1.5 },          // where Curiosity landed, morning
    },
  },
};
