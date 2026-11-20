// Shared catalogue of solar-system bodies: numbers only.
//
// Orbits are Keplerian elements with linear rates (per Julian century from J2000):
//   a (m), e, i (deg), L mean longitude (deg), lonPeri (deg), node (deg)
// `frame` says what the elements are referred to:
//   'ecliptic'  – J2000 ecliptic, around `parent`
//   'pole'      – a plane given by `framePole` {ra, dec} (deg, J2000 equatorial); the
//                 reference direction is that plane's ascending node on the J2000 equator
//
// Rotation is the IAU form: pole ra and dec (deg, with a rate per century) and the prime
// meridian w (deg, with a rate per DAY), counted from J2000.
//
// Sources: JPL "Approximate Positions of the Planets" (Standish, 1800–2050 fit) for Earth
// and Mars; JPL Horizons osculating elements for Phobos/Deimos (epoch in `epochJD`);
// every other orbit fitted to JPL Horizons, 1950–2100, by scripts/fit-orbits.py;
// IAU WGCCRE rotation elements; NASA planetary fact sheets for radii/albedos.
// `node scripts/check-ephemeris.mjs` compares every body with Horizons (no network).

const AU = 149597870700;
const DAYS_PER_CENTURY = 36525;

export const SOLAR_SYSTEM = {
  sun: {
    radius: 695700e3,
    gravity: 274,                            // surface gravity, m/s^2 (flight: see controls/gravity.js)
    // Solar irradiance at 1 AU is the engine's radiometric unit (1.0).
    limbDarkening: [0.397, 0.503, 0.652],   // linear limb-darkening coefficient per RGB
    color: [1.0, 0.98, 0.95],                // disc colour, relative (found colour: near white)
  },

  earth: {
    parent: 'sun',
    radius: 6371.0e3,
    gravity: 9.81,
    geometricAlbedo: 0.434,
    color: [0.72, 0.82, 1.0],
    orbit: {
      frame: 'ecliptic',
      a: [1.00000261 * AU, 0.00000562 * AU], e: [0.01671123, -0.00004392],
      i: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981],
      lonPeri: [102.93768193, 0.32327364], node: [0.0, 0.0],
    },
    rotation: { ra: [0.0, -0.641], dec: [90.0, -0.557], w: [190.147, 360.9856235] },
    // Look of the resolved disc (used when a body is big enough on screen to be a mesh).
    // Look of the resolved disc: a real globe from NASA's maps (scripts/fetch-earth.py,
    // docs/ASSETS.md). `far` copies are always loaded; `full` ones when it fills the view.
    surface: {
      recipe: 'globe',
      maps: {
        colour: { far: 'data/earth_day_512.jpg', full: 'data/earth_day_4096.jpg' },          // Blue Marble Next Generation
        clouds: { far: 'data/earth_clouds_512.jpg', full: 'data/earth_clouds_4096.jpg' },    // a real day's clouds
        lights: { far: 'data/earth_lights_512.jpg', full: 'data/earth_lights_4096.jpg' },    // city lights
        water: { far: 'data/earth_water_512.jpg', full: 'data/earth_water_2048.jpg' },       // seas and lakes
      },
      gain: 1.0,                              // the colour map as albedo
      ocean: [0.014, 0.042, 0.105],           // deep water's own colour (the map's seas are near black)
      cloud: [0.80, 0.80, 0.80],
      lights: [1.0e-3, 0.60e-3, 0.22e-3],     // radiance of a city at night (sunlit ground is about 0.05)
      glint: { roughness: 0.11, strength: 1.5 },
      // air: vertical optical depth of the clear air per colour (Rayleigh), and the scale
      // height the rim glows over (the real 8 km, with the haze above it)
      air: { tau: [0.055, 0.130, 0.310], scaleHeight: 12000 },     // (half again the clear-air values: the haze)
    },
  },

  moon: {
    parent: 'earth',
    radius: 1737.4e3,
    gravity: 1.62,
    geometricAlbedo: 0.12,
    color: [1.0, 0.97, 0.92],
    orbit: {
      frame: 'ecliptic',
      a: [384400e3, 0], e: [0.0549, 0], i: [5.145, 0],
      L: [218.316, 481267.881], lonPeri: [83.353, 4069.014], node: [125.045, -1934.136],
    },
    rotation: { ra: [269.9949, 0.0031], dec: [66.5392, 0.0130], w: [38.3213, 13.17635815] },
    surface: { recipe: 'rock', albedo: [0.13, 0.125, 0.115], lumpiness: 0.0, mottling: 0.35, mottleScale: 2.0 },
  },

  mars: {
    parent: 'sun',
    radius: 3389.5e3,
    gravity: 3.71,
    geometricAlbedo: 0.17,
    color: [1.0, 0.68, 0.42],
    orbit: {
      frame: 'ecliptic',
      a: [1.52371034 * AU, 0.00001847 * AU], e: [0.09339410, 0.00007882],
      i: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499],
      lonPeri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
    },
    rotation: { ra: [317.68143, -0.1061], dec: [52.88650, -0.0609], w: [176.630, 350.89198226] },
    surface: { recipe: 'rock', albedo: [0.30, 0.17, 0.09], lumpiness: 0.0, mottling: 0.3, mottleScale: 2.5 },
  },

  phobos: {
    parent: 'mars',
    radius: 11.1e3,
    gravity: 0.0057,
    radii: [13.0e3, 11.4e3, 9.1e3],        // ~27 x 22 x 18 km
    geometricAlbedo: 0.071,
    color: [1.0, 0.92, 0.85],
    tidallyLocked: true,
    orbit: null,                             // filled below from Horizons-derived elements
    surface: { recipe: 'rock', albedo: [0.075, 0.068, 0.062], lumpiness: 0.16, mottling: 0.2, mottleScale: 3.0, crater: [0.9, 0.25, 0.45] },
  },

  deimos: {
    parent: 'mars',
    radius: 6.2e3,
    gravity: 0.003,
    radii: [7.5e3, 6.1e3, 5.2e3],
    geometricAlbedo: 0.068,
    color: [1.0, 0.93, 0.86],
    tidallyLocked: true,
    orbit: null,
    surface: { recipe: 'rock', albedo: [0.072, 0.066, 0.060], lumpiness: 0.12, mottling: 0.1, mottleScale: 3.0 },
  },

  // ---- added with scripts/fit-orbits.py -------------------------------------------------
  // Orbits: fitted to JPL Horizons osculating elements and positions, 1950-2100, by
  // scripts/fit-orbits.py (planets: about the Sun's centre, J2000 ecliptic; moons: about the
  // planet's centre, in the plane whose pole the orbit turns about). Rotation: IAU WGCCRE
  // 2015, linear terms, each checked against Horizons by the same script (noted where fitted
  // instead). Radius: IAU / Horizons mean radius; gravity: GM / radius^2 with Horizons' GM;
  // albedo: NASA fact sheets (planets), JPL satellite tables (moons). The moons have a
  // rotation as well as `tidallyLocked`. `surface` entries are placeholders.
  // Errors per body: node scripts/check-ephemeris.mjs

  mercury: {
    parent: 'sun',
    radius: 2439.4e3,
    gravity: 3.70,
    geometricAlbedo: 0.142,
    color: [1.0, 0.93, 0.84],
    orbit: {
      frame: 'ecliptic',
      a: [0.38710412 * AU, -0.00001170 * AU], e: [0.20563900, -0.00000586],
      i: [7.004988, -0.005957], L: [252.249222, 149472.676735],
      lonPeri: [77.450210, 0.165080], node: [48.330817, -0.126015],
    },
    rotation: { ra: [281.0103, -0.0328], dec: [61.4155, -0.0049], w: [329.5988, 6.1385108] },
    surface: { recipe: 'rock', albedo: [0.14, 0.13, 0.12], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  venus: {
    parent: 'sun',
    radius: 6051.8e3,
    gravity: 8.87,
    geometricAlbedo: 0.689,                  // the cloud tops
    color: [1.0, 0.96, 0.84],
    orbit: {
      frame: 'ecliptic',
      a: [0.72332867 * AU, 0.00000624 * AU], e: [0.00676683, -0.00004188],
      i: [3.394539, -0.000879], L: [181.980344, 58517.816040],
      lonPeri: [131.578118, 0.120172], node: [76.680041, -0.278448],
    },
    rotation: { ra: [272.76, 0.0], dec: [67.16, 0.0], w: [160.20, -1.4813688] },
    surface: { recipe: 'rock', albedo: [0.78, 0.74, 0.62], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // Jupiter pulls Ceres up to 0.5 deg off any ellipse with linear rates (check-ephemeris).
  // Rotation: fitted to Horizons, which uses the Dawn mission's final model (Park et al. 2019);
  // the IAU 2015 values (W = 170.650 + 952.1532 d) drift 0.6 deg from it by 2040.
  ceres: {
    parent: 'sun',
    radius: 469.7e3,
    gravity: 0.284,
    geometricAlbedo: 0.09,
    color: [1.0, 0.97, 0.93],
    orbit: {
      frame: 'ecliptic',
      a: [2.76666968 * AU, -0.00006477 * AU], e: [0.07787735, -0.00094894],
      i: [10.592717, -0.021418], L: [160.915847, 7819.430847],
      lonPeri: [153.869804, 2.140422], node: [80.582402, -1.497163],
    },
    rotation: { ra: [291.4276, 0.0], dec: [66.7603, 0.0], w: [170.309, 952.1532635] },
    surface: { recipe: 'rock', albedo: [0.092, 0.089, 0.085], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // Inside 0.1 deg over 1990-2060; Saturn pulls it up to 0.125 deg off over 1950-2100.
  // Rotation: System III (the magnetic field, i.e. the interior).
  jupiter: {
    parent: 'sun',
    radius: 69911e3,
    gravity: 25.92,                          // GM / radius^2 (the pull at a distance); 24.79 at the equator
    geometricAlbedo: 0.538,
    color: [1.0, 0.93, 0.80],
    orbit: {
      frame: 'ecliptic',
      a: [5.20315418 * AU, 0.00039882 * AU], e: [0.04846722, -0.00046272],
      i: [1.304377, -0.002557], L: [34.374397, 3034.682432],
      lonPeri: [14.551959, 0.246339], node: [100.467945, 0.234663],
    },
    rotation: { ra: [268.056595, -0.006499], dec: [64.495303, 0.002413], w: [284.95, 870.5360000] },
    surface: { recipe: 'rock', albedo: [0.54, 0.49, 0.41], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // lonPeri turns backwards in 487 days: the eccentricity is the one Europa forces.
  io: {
    parent: 'jupiter',
    radius: 1821.5e3,
    gravity: 1.796,
    geometricAlbedo: 0.63,
    color: [1.0, 0.92, 0.55],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 268.0671, dec: 64.4924 },
      a: [421767.79e3, 0], e: [0.004138, 0], i: [0.0337, 0],
      L: [19.9396, 203.488958156 * DAYS_PER_CENTURY], lonPeri: [48.914, -0.739506191 * DAYS_PER_CENTURY],
      node: [267.173, -0.133367407 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [268.05, -0.009], dec: [64.50, 0.003], w: [200.39, 203.4889538] },
    surface: { recipe: 'rock', albedo: [0.66, 0.58, 0.30], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  europa: {
    parent: 'jupiter',
    radius: 1560.8e3,
    gravity: 1.315,
    geometricAlbedo: 0.67,
    color: [1.0, 0.96, 0.88],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 268.0236, dec: 64.5000 },
      a: [670981.48e3, 0], e: [0.009194, 0], i: [0.4652, 0],
      L: [214.5324, 101.374724730 * DAYS_PER_CENTURY], lonPeri: [229.781, -0.739504262 * DAYS_PER_CENTURY],
      node: [182.512, -0.032574354 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [268.08, -0.009], dec: [64.51, 0.003], w: [36.022, 101.3747235] },
    surface: { recipe: 'rock', albedo: [0.69, 0.65, 0.58], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  ganymede: {
    parent: 'jupiter',
    radius: 2631.2e3,
    gravity: 1.428,
    geometricAlbedo: 0.43,
    color: [1.0, 0.94, 0.85],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 268.1296, dec: 64.5568 },
      a: [1070404.45e3, 0], e: [0.001434, 0], i: [0.1888, 0],
      L: [221.7228, 50.317607048 * DAYS_PER_CENTURY], lonPeri: [260.229, 0.006861655 * DAYS_PER_CENTURY],
      node: [54.027, -0.006985843 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [268.20, -0.009], dec: [64.57, 0.003], w: [44.064, 50.3176081] },
    surface: { recipe: 'rock', albedo: [0.45, 0.42, 0.37], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  callisto: {
    parent: 'jupiter',
    radius: 2410.3e3,
    gravity: 1.236,
    geometricAlbedo: 0.17,
    color: [1.0, 0.92, 0.80],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 269.6895, dec: 64.9924 },
      a: [1882717.58e3, 0], e: [0.007339, 0], i: [0.6717, 0],
      L: [79.4918, 21.571072750 * DAYS_PER_CENTURY], lonPeri: [352.057, 0.001841616 * DAYS_PER_CENTURY],
      node: [297.156, -0.000617241 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [268.72, -0.009], dec: [64.83, 0.003], w: [259.51, 21.5710715] },
    surface: { recipe: 'rock', albedo: [0.20, 0.18, 0.15], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // Jupiter pulls Saturn up to 0.15 deg off any ellipse with linear rates (check-ephemeris).
  // Rotation: System III.
  saturn: {
    parent: 'sun',
    radius: 58232e3,
    gravity: 11.19,                          // GM / radius^2 (the pull at a distance); 10.44 at the equator
    geometricAlbedo: 0.499,
    color: [1.0, 0.90, 0.72],
    orbit: {
      frame: 'ecliptic',
      a: [9.53929448 * AU, 0.00002262 * AU], e: [0.05413336, -0.00007225],
      i: [2.486274, 0.002673], L: [50.012475, 1222.628664],
      lonPeri: [92.654951, -0.241913], node: [113.667693, -0.288697],
    },
    rotation: { ra: [40.589, -0.036], dec: [83.537, -0.004], w: [38.90, 810.7939024] },
    surface: { recipe: 'rock', albedo: [0.52, 0.46, 0.34], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // The real Mimas swings 43.4 deg either side of its mean longitude in 70.6 years (its
  // resonance with Tethys): `swing` below is that term; about 1 deg is left.
  mimas: {
    parent: 'saturn',
    radius: 198.2e3,
    gravity: 0.0637,
    geometricAlbedo: 0.962,
    color: [1.0, 1.0, 1.0],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 40.5791, dec: 83.5363 },
      a: [185536.21e3, 0], e: [0.019622, 0], i: [1.5735, 0],
      L: [160.2161, 381.994500180 * DAYS_PER_CENTURY], lonPeri: [145.656, 1.000915978 * DAYS_PER_CENTURY],
      node: [173.005, -0.999499588 * DAYS_PER_CENTURY],
      swing: [43.37, 0.7065, 140.7],          // the 70.6-year swing of its resonance with Tethys (see above)
    },
    // (no rotation elements: it keeps its face to Saturn exactly, see Ephemeris._lockedMatrix;
    // the IAU mean rotation without its periodic terms would be 44 degrees out)
    surface: { recipe: 'rock', albedo: [0.90, 0.90, 0.90], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  enceladus: {
    parent: 'saturn',
    radius: 252.1e3,
    gravity: 0.113,
    geometricAlbedo: 1.375,
    color: [1.0, 1.0, 1.0],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 40.5721, dec: 83.5372 },
      a: [238048.04e3, 0], e: [0.004616, 0], i: [0.0074, 0],
      L: [182.2839, 262.731898240 * DAYS_PER_CENTURY], lonPeri: [170.693, 0.337995068 * DAYS_PER_CENTURY],
      node: [345.786, -0.417171941 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [40.66, -0.036], dec: [83.52, -0.004], w: [6.32, 262.7318996] },
    surface: { recipe: 'rock', albedo: [0.95, 0.96, 0.97], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // e and lonPeri are NOT the real ones (the real e is 0.0001). Tethys swings 2.09 deg
  // either side of its mean longitude in 70.7 years (the resonance with Mimas) and the
  // evaluator has no periodic term, so an apse line turning almost with the moon stands in
  // for the swing: 0.09 deg in direction instead of 2.07, at the price of 1.8 % in distance.
  // The plain mean ellipse is e: [0.000138, 0], L: [188.4215, 190.697910621 * DAYS_PER_CENTURY],
  // lonPeri: [305.537, 0.197892106 * DAYS_PER_CENTURY] (2.07 deg in direction, 0.01 % in distance).
  // Rotation: IAU mean terms; the real pole circles 1.1 deg in 5 years.
  tethys: {
    parent: 'saturn',
    radius: 531.1e3,
    gravity: 0.146,
    geometricAlbedo: 1.229,
    color: [1.0, 1.0, 0.99],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 40.5652, dec: 83.5365 },
      a: [294672.83e3, 0], e: [0.018197, 0], i: [1.0914, 0],
      L: [188.4275, 190.697910248 * DAYS_PER_CENTURY], lonPeri: [227.497, 190.683989290 * DAYS_PER_CENTURY],
      node: [259.854, -0.197845246 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [40.66, -0.036], dec: [83.52, -0.004], w: [8.95, 190.6979085] },
    surface: { recipe: 'rock', albedo: [0.90, 0.90, 0.89], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  dione: {
    parent: 'saturn',
    radius: 561.4e3,
    gravity: 0.232,
    geometricAlbedo: 0.998,
    color: [1.0, 1.0, 0.99],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 40.5152, dec: 83.5374 },
      a: [377398.30e3, 0], e: [0.002153, 0], i: [0.0303, 0],
      L: [176.9896, 131.534930052 * DAYS_PER_CENTURY], lonPeri: [213.554, 0.084237600 * DAYS_PER_CENTURY],
      node: [296.350, -0.084589015 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [40.66, -0.036], dec: [83.52, -0.004], w: [357.6, 131.5349316] },
    surface: { recipe: 'rock', albedo: [0.80, 0.80, 0.79], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  rhea: {
    parent: 'saturn',
    radius: 763.8e3,
    gravity: 0.264,
    geometricAlbedo: 0.949,
    color: [1.0, 0.99, 0.97],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 40.3337, dec: 83.5461 },
      a: [527050.18e3, 0], e: [0.000957, 0], i: [0.3335, 0],
      L: [52.4253, 79.690045649 * DAYS_PER_CENTURY], lonPeri: [203.103, 0.001480480 * DAYS_PER_CENTURY],
      node: [351.602, -0.027550523 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [40.38, -0.036], dec: [83.55, -0.004], w: [235.16, 79.6900478] },
    surface: { recipe: 'rock', albedo: [0.78, 0.77, 0.75], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  titan: {
    parent: 'saturn',
    radius: 2574.7e3,
    gravity: 1.354,
    geometricAlbedo: 0.2,                    // the haze
    color: [1.0, 0.78, 0.45],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 36.2458, dec: 84.0029 },
      a: [1221856.72e3, 0], e: [0.028759, 0], i: [0.3508, 0],
      L: [11.8793, 22.576976013 * DAYS_PER_CENTURY], lonPeri: [208.450, 0.001409730 * DAYS_PER_CENTURY],
      node: [25.309, -0.001285562 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [39.4827, 0.0], dec: [83.4279, 0.0], w: [186.5855, 22.5769768] },
    surface: { recipe: 'rock', albedo: [0.25, 0.19, 0.10], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  iapetus: {
    parent: 'saturn',
    radius: 734.5e3,
    gravity: 0.223,
    geometricAlbedo: 0.3,                    // 0.05 (leading side) to 0.5 (trailing side)
    color: [1.0, 0.93, 0.82],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 299.0928, dec: 77.7274 },
      a: [3560445.22e3, 0], e: [0.028574, 0], i: [5.2029, 0],
      L: [190.0136, 4.537946216 * DAYS_PER_CENTURY], lonPeri: [341.375, 0.000259606 * DAYS_PER_CENTURY],
      node: [68.496, -0.000454919 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [318.16, -3.949], dec: [75.03, -1.143], w: [355.2, 4.5379572] },
    surface: { recipe: 'rock', albedo: [0.30, 0.27, 0.22], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  uranus: {
    parent: 'sun',
    radius: 25362e3,
    gravity: 9.01,                           // GM / radius^2; 8.87 at the equator
    geometricAlbedo: 0.488,
    color: [0.70, 0.93, 1.0],
    orbit: {
      frame: 'ecliptic',
      a: [19.18993108 * AU, -0.00550063 * AU], e: [0.04730479, 0.00019913],
      i: [0.772847, -0.002443], L: [313.237106, 428.515701],
      lonPeri: [170.880542, 0.435485], node: [74.013770, 0.008724],
    },
    rotation: { ra: [257.311, 0.0], dec: [-15.175, 0.0], w: [203.81, -501.1600928] },
    surface: { recipe: 'rock', albedo: [0.33, 0.47, 0.51], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // Rotation: straight lines through Horizons' IAU model over 2000-2040 (its pole nods 0.7 deg
  // in 688 years with Triton); good to 0.01 deg there.
  neptune: {
    parent: 'sun',
    radius: 24622e3,
    gravity: 11.27,                          // GM / radius^2; 11.15 at the equator
    geometricAlbedo: 0.442,
    color: [0.55, 0.72, 1.0],
    orbit: {
      frame: 'ecliptic',
      a: [30.07318529 * AU, -0.00867313 * AU], e: [0.00850055, 0.00012060],
      i: [1.770052, 0.000385], L: [304.867812, 218.463170],
      lonPeri: [45.082504, -2.350343], node: [131.781972, -0.002845],
    },
    rotation: { ra: [299.3346, 0.6299], dec: [42.9444, 0.0688], w: [249.9959, 541.1397639] },
    surface: { recipe: 'rock', albedo: [0.22, 0.33, 0.52], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // Retrograde: the frame's pole is the far side of the axis the orbit turns about in 684 years
  // (so the motion is prograde in the frame, tilted 23 deg). Rotation: straight lines through
  // Horizons' IAU model over 2000-2040 (the pole follows the orbit): 0.15 deg there, drifting after.
  triton: {
    parent: 'neptune',
    radius: 1352.6e3,
    gravity: 0.781,
    geometricAlbedo: 0.719,
    color: [1.0, 0.94, 0.89],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 119.4097, dec: -43.3644 },
      a: [354759.08e3, 0], e: [0.000126, 0], i: [23.0759, 0],
      L: [60.7551, 61.257260887 * DAYS_PER_CENTURY], lonPeri: [79.238, 0.001120596 * DAYS_PER_CENTURY],
      node: [182.261, -0.001439834 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [298.4744, 21.8657], dec: [20.1175, 2.2931], w: [297.0173, -61.2575885] },
    surface: { recipe: 'rock', albedo: [0.72, 0.68, 0.64], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // Pluto's own centre about the Sun (Horizons 999), not the Pluto-Charon barycentre: its
  // 2100 km circle about the barycentre every 6.39 days is 0.00002 deg from the Sun.
  pluto: {
    parent: 'sun',
    radius: 1188.3e3,
    gravity: 0.616,
    geometricAlbedo: 0.52,
    color: [1.0, 0.87, 0.74],
    orbit: {
      frame: 'ecliptic',
      a: [39.49592911 * AU, 0.00628788 * AU], e: [0.24905471, -0.00044299],
      i: [17.138879, -0.003219], L: [238.955854, 145.128153],
      lonPeri: [224.150379, -0.017912], node: [110.309251, -0.035055],
    },
    rotation: { ra: [132.993, 0.0], dec: [-6.163, 0.0], w: [302.695, 56.3625225] },
    surface: { recipe: 'rock', albedo: [0.56, 0.48, 0.39], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },

  // About Pluto's centre (not the barycentre), so the Pluto-Charon line is right as it is.
  charon: {
    parent: 'pluto',
    radius: 606.0e3,
    gravity: 0.289,
    geometricAlbedo: 0.38,
    color: [1.0, 0.97, 0.94],
    tidallyLocked: true,
    orbit: {
      frame: 'pole', framePole: { ra: 133.0368, dec: -6.4335 },
      a: [19595.76e3, 0], e: [0.000161, 0], i: [0.1906, 0],
      L: [304.1281, 56.362530326 * DAYS_PER_CENTURY], lonPeri: [155.360, 0.000005275 * DAYS_PER_CENTURY],
      node: [188.848, -0.000042009 * DAYS_PER_CENTURY],
    },
    rotation: { ra: [132.993, 0.0], dec: [-6.163, 0.0], w: [122.695, 56.3625225] },
    surface: { recipe: 'rock', albedo: [0.38, 0.37, 0.36], lumpiness: 0.0, mottling: 0.2, mottleScale: 2.5 },
  },
};

// Martian moons: mean elements referred to the Laplace plane (≈ Mars equator), with the
// mean longitude calibrated against JPL Horizons at epochJD (see docs/PROGRESS.md).
// Rates are per Julian century, like everything else.
SOLAR_SYSTEM.phobos.orbit = {
  frame: 'pole', framePole: { ra: 317.671, dec: 52.893 }, epochJD: 2456688.5,
  a: [9376.0e3, 0], e: [0.0151, 0], i: [1.062, 0],
  L: [348.444, 1128.8447569 * DAYS_PER_CENTURY], lonPeri: [102.645, 0.4352 * DAYS_PER_CENTURY],
  node: [87.482, -0.4358 * DAYS_PER_CENTURY],
};
SOLAR_SYSTEM.deimos.orbit = {
  frame: 'pole', framePole: { ra: 316.657, dec: 53.529 }, epochJD: 2456688.5,
  a: [23458.0e3, 0], e: [0.0003, 0], i: [1.800, 0],
  L: [349.851, 285.1618790 * DAYS_PER_CENTURY], lonPeri: [334.729, 0.0186 * DAYS_PER_CENTURY],
  node: [320.981, -0.0181 * DAYS_PER_CENTURY],
};


// ---------------------------------------------------------------------------------------
// How each body looks from space (the entries above carry placeholders for most).
// recipe 'globe': a colour map round the body (maps.colour: `far` a small copy, `full` the
// whole file; `linear`: one grey channel of linear values; or `bands`: made from a list of
// [latitude, r, g, b]), times `tint` and `gain` to make albedo. `airless`: dusty ground
// with no limb darkening. `relief`: a slope map bends the shading. `peak`: the brightest
// albedo on it (for the exposure of a bright disc in a dark scene). `drift`: bands that
// slide at their own speeds, [northern edge in degrees of latitude, degrees per day].
// `radii`: a flattened globe. `rings`: stops of [radius m, optical depth, r, g, b].
const map = (id, size, extra = {}) => ({ colour: { far: `data/${id}_color_512.jpg`, full: `data/${id}_color_${size}.jpg` }, ...extra });
const LOOKS = {
  moon: { surface: { recipe: 'globe', airless: true, maps: { colour: { far: 'data/moon_albedo_512.jpg', full: 'data/moon_albedo_4096.jpg', linear: true }, relief: { full: 'data/moon_slopes_4096.jpg' } }, tint: [1.0, 0.96, 0.90], gain: 0.37, peak: 0.3, relief: 1.6 } },
  mars: { surface: { recipe: 'globe', maps: { colour: { far: 'data/mars_color_512.jpg', full: 'data/mars_color_4096.jpg' }, relief: { full: 'data/mars_slopes_4096.jpg' } }, tint: [1.45, 1.35, 0.80], gain: 1.0, peak: 0.5, relief: 1.4,
    air: { tau: [0.020, 0.016, 0.012], scaleHeight: 11100 } } },                       // a thin dusty edge
  phobos: { surface: { recipe: 'globe', airless: true, maps: map('phobos', 2048, { relief: { full: 'data/phobos_slopes_1024.jpg' } }), tint: [1.0, 0.92, 0.85], gain: 0.26, peak: 0.14, relief: 1.0 } },
  deimos: { surface: { recipe: 'globe', airless: true, maps: map('deimos', 2048), tint: [1.0, 0.93, 0.86], gain: 0.20, peak: 0.12 } },
  mercury: { surface: { recipe: 'globe', airless: true, maps: map('mercury', 4096, { relief: { full: 'data/mercury_slopes_4096.jpg' } }), tint: [1.0, 1.0, 1.0], gain: 0.78, peak: 0.35, relief: 1.6 } },
  // Venus from space: nothing but cloud, pale yellow-white, faintly banded.
  venus: { surface: { recipe: 'globe', maps: { colour: { bands: [[90, 0.78, 0.74, 0.62], [55, 0.86, 0.82, 0.68], [20, 0.90, 0.86, 0.72], [0, 0.88, 0.84, 0.70], [-20, 0.90, 0.86, 0.72], [-55, 0.86, 0.82, 0.68], [-90, 0.78, 0.74, 0.62]], streaks: 0.025, mottle: 0.05 } }, peak: 0.9,
    air: { tau: [0.03, 0.05, 0.09], scaleHeight: 6000 } } },
  ceres: { surface: { recipe: 'globe', airless: true, maps: map('ceres', 4096, { relief: { full: 'data/ceres_slopes_4096.jpg' } }), tint: [1.0, 0.97, 0.92], gain: 0.47, peak: 0.25, relief: 1.2 } },
  // Jupiter: the Cassini map, each belt and zone sliding at about its real speed against
  // the planet's own turning (the equator gains 7 degrees a day).
  jupiter: { radii: [71492e3, 71492e3, 66854e3], surface: { recipe: 'globe', maps: map('jupiter', 4096), gain: 1.12, peak: 0.68,
    drift: [[90, 0], [47, -0.3], [40, 1.0], [31, 4.0], [24, -1.2], [17, 2.9], [7, 6.4], [-7, 2.1], [-17, -0.8], [-27, 1.7], [-37, 0.5], [-47, 0]] } },
  io: { surface: { recipe: 'globe', airless: true, maps: map('io', 4096), gain: 1.55, peak: 0.9 } },
  europa: { surface: { recipe: 'globe', airless: true, maps: map('europa', 4096), gain: 1.25, peak: 0.95 } },
  ganymede: { surface: { recipe: 'globe', airless: true, maps: map('ganymede', 2048), gain: 2.3, peak: 0.7 } },
  callisto: { surface: { recipe: 'globe', airless: true, maps: map('callisto', 2048), gain: 3.4, peak: 0.5 } },
  // Saturn: butterscotch bands (made here: no picture of the whole planet is free to use),
  // flattened by a tenth, and the rings: C, B, the Cassini Division, A with the Encke gap, F.
  saturn: { radii: [60268e3, 60268e3, 54364e3], surface: { recipe: 'globe', peak: 0.75, maps: { colour: { streaks: 0.03, mottle: 0.015, bands: [
      [90, 0.36, 0.40, 0.42], [78, 0.40, 0.42, 0.40], [70, 0.50, 0.46, 0.36], [60, 0.56, 0.50, 0.36], [48, 0.62, 0.55, 0.38], [40, 0.57, 0.50, 0.34], [30, 0.66, 0.58, 0.40], [20, 0.60, 0.52, 0.35],
      [10, 0.72, 0.64, 0.44], [0, 0.76, 0.68, 0.48], [-10, 0.72, 0.64, 0.44], [-20, 0.60, 0.52, 0.35], [-30, 0.66, 0.58, 0.40], [-40, 0.57, 0.50, 0.34], [-48, 0.62, 0.55, 0.38], [-60, 0.56, 0.50, 0.36], [-72, 0.48, 0.45, 0.37], [-90, 0.38, 0.40, 0.40]] } },
      drift: [[90, 0], [60, 1.0], [45, 3.0], [30, 1.5], [15, 9.0], [-15, 1.5], [-30, 3.0], [-45, 1.0], [-60, 0]] },
    rings: { ringlets: 0.3, profile: [
      [74500e3, 0.0, 0.50, 0.46, 0.40], [74700e3, 0.06, 0.50, 0.46, 0.40], [84000e3, 0.09, 0.52, 0.47, 0.41], [91900e3, 0.14, 0.55, 0.50, 0.42],        // C ring
      [92100e3, 1.0, 0.80, 0.72, 0.58], [99000e3, 1.4, 0.84, 0.76, 0.62], [104000e3, 2.6, 0.86, 0.78, 0.64], [110000e3, 3.0, 0.86, 0.78, 0.64], [117400e3, 2.2, 0.84, 0.77, 0.63],   // B ring
      [117700e3, 0.02, 0.55, 0.50, 0.43], [119500e3, 0.10, 0.56, 0.51, 0.44], [122000e3, 0.12, 0.58, 0.53, 0.45],                                         // the Cassini Division
      [122300e3, 0.85, 0.80, 0.74, 0.62], [128000e3, 0.55, 0.80, 0.74, 0.62], [133400e3, 0.50, 0.80, 0.74, 0.62], [133500e3, 0.0, 0.80, 0.74, 0.62], [133750e3, 0.0, 0.80, 0.74, 0.62], [133850e3, 0.5, 0.80, 0.74, 0.62],   // A ring, the Encke gap
      [136700e3, 0.55, 0.78, 0.72, 0.60], [136800e3, 0.0, 0.78, 0.72, 0.60], [140100e3, 0.0, 0.7, 0.68, 0.62], [140220e3, 0.12, 0.7, 0.68, 0.62], [140350e3, 0.0, 0.7, 0.68, 0.62]] } },      // ... and the F ring
  mimas: { surface: { recipe: 'globe', airless: true, maps: map('mimas', 2048), gain: 2.6, peak: 0.95 } },
  enceladus: { surface: { recipe: 'globe', airless: true, maps: map('enceladus', 4096), gain: 2.3, peak: 1.0 } },
  tethys: { surface: { recipe: 'globe', airless: true, maps: map('tethys', 2048), gain: 3.6, peak: 0.95 } },
  dione: { surface: { recipe: 'globe', airless: true, maps: map('dione', 2048), gain: 2.6, peak: 0.9 } },
  rhea: { surface: { recipe: 'globe', airless: true, maps: map('rhea', 2048), gain: 3.6, peak: 0.9 } },
  iapetus: { surface: { recipe: 'globe', airless: true, maps: map('iapetus', 2048), gain: 1.3, peak: 0.6 } },
  // Titan from space: an orange ball of smog with a darker northern cap, and a thin blue
  // layer of haze standing off its edge.
  titan: { surface: { recipe: 'globe', peak: 0.3, maps: { colour: { streaks: 0.01, mottle: 0.02, bands: [[90, 0.20, 0.11, 0.04], [50, 0.25, 0.14, 0.05], [10, 0.30, 0.18, 0.06], [-30, 0.31, 0.19, 0.065], [-90, 0.28, 0.17, 0.06]] } },
    air: { tau: [0.010, 0.018, 0.045], scaleHeight: 45000 } } },
  // Uranus and Neptune: no free picture of the whole planet exists, and there is little on
  // them to picture: made from their measured colours (Voyager 2).
  uranus: { radii: [25559e3, 25559e3, 24973e3], surface: { recipe: 'globe', peak: 0.6, maps: { colour: { streaks: 0.008, mottle: 0.008, bands: [[90, 0.50, 0.66, 0.70], [40, 0.46, 0.66, 0.72], [0, 0.44, 0.65, 0.72], [-40, 0.46, 0.66, 0.72], [-90, 0.52, 0.68, 0.72]] } } } },
  neptune: { radii: [24764e3, 24764e3, 24341e3], surface: { recipe: 'globe', peak: 0.55, maps: { colour: { streaks: 0.05, mottle: 0.03, bands: [[90, 0.13, 0.22, 0.52], [60, 0.16, 0.27, 0.60], [35, 0.14, 0.24, 0.56], [10, 0.18, 0.30, 0.64], [-15, 0.15, 0.25, 0.58], [-45, 0.19, 0.31, 0.66], [-70, 0.15, 0.25, 0.56], [-90, 0.12, 0.20, 0.48]] } },
    drift: [[90, 0], [50, -6], [20, -14], [-20, -9], [-50, 4], [-70, 0]] } },
  triton: { surface: { recipe: 'globe', airless: true, maps: map('triton', 4096), gain: 1.75, peak: 0.9 } },
  pluto: { surface: { recipe: 'globe', airless: true, maps: map('pluto', 4096, { relief: { full: 'data/pluto_slopes_4096.jpg' } }), gain: 1.6, peak: 0.9, relief: 1.2,
    air: { tau: [0.0006, 0.0012, 0.0026], scaleHeight: 50000 } } },                    // the blue haze at its edge
  charon: { surface: { recipe: 'globe', airless: true, maps: map('charon', 4096, { relief: { full: 'data/charon_slopes_4096.jpg' } }), gain: 1.45, peak: 0.55, relief: 1.2 } },
};
// (their maps start at longitude 0 on the left edge, like the terrain's; Earth's start at -180)
for (const [id, look] of Object.entries(LOOKS)) { if (look.surface.maps?.colour && !look.surface.maps.colour.bands) look.surface.lon0 = 0; Object.assign(SOLAR_SYSTEM[id], look); }

export const AU_M = AU;
