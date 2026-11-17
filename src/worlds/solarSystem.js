// Shared catalogue of solar-system bodies: numbers only.
//
// Orbits are Keplerian elements with linear rates (per Julian century from J2000):
//   a (m), e, i (deg), L mean longitude (deg), lonPeri (deg), node (deg)
// `frame` says what the elements are referred to:
//   'ecliptic'  – J2000 ecliptic, around `parent`
//   'pole'      – a plane given by `framePole` {ra, dec} (deg, J2000 equatorial); the
//                 reference direction is that plane's ascending node on the J2000 equator
//
// Sources: JPL "Approximate Positions of the Planets" (Standish, 1800–2050 fit);
// JPL Horizons osculating elements for Phobos/Deimos (epoch in `epochJD`);
// IAU WGCCRE rotation elements; NASA planetary fact sheets for radii/albedos.

const AU = 149597870700;

export const SOLAR_SYSTEM = {
  sun: {
    radius: 695700e3,
    // Solar irradiance at 1 AU is the engine's radiometric unit (1.0).
    limbDarkening: [0.397, 0.503, 0.652],   // linear limb-darkening coefficient per RGB
    color: [1.0, 0.98, 0.95],                // disc colour, relative (found colour: near white)
  },

  earth: {
    parent: 'sun',
    radius: 6371.0e3,
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
    surface: {
      recipe: 'oceanWorld',
      ocean: [0.03, 0.07, 0.16], land: [0.20, 0.17, 0.11], cloud: [0.78, 0.80, 0.82],
      ice: [0.75, 0.78, 0.80], landScale: 2.2, landBias: -0.08, cloudScale: 3.5, cloudCover: 0.48,
      haze: [0.25, 0.42, 0.75], hazeStrength: 0.35,
    },
  },

  moon: {
    parent: 'earth',
    radius: 1737.4e3,
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
    radii: [7.5e3, 6.1e3, 5.2e3],
    geometricAlbedo: 0.068,
    color: [1.0, 0.93, 0.86],
    tidallyLocked: true,
    orbit: null,
    surface: { recipe: 'rock', albedo: [0.072, 0.066, 0.060], lumpiness: 0.12, mottling: 0.1, mottleScale: 3.0 },
  },
};

// Martian moons: mean elements referred to the Laplace plane (≈ Mars equator), with the
// mean longitude calibrated against JPL Horizons at epochJD (see docs/PROGRESS.md).
// Rates are per Julian century, like everything else.
const DAYS_PER_CENTURY = 36525;
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

export const AU_M = AU;
