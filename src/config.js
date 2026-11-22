// Engine constants. World-specific numbers never go here — they live in src/worlds/.
export const CONFIG = {
  // Terrain
  GRID: 40,                 // quads per chunk edge (fixed, shared index buffer; must be even)
  NORMAL_RES: 120,          // normal-map cells per chunk edge (multiple of GRID; texture is NORMAL_RES+1 square)
  SHADOW_RES: 60,           // baked sun-shadow cells per chunk edge (must divide NORMAL_RES)
  SHADOW_ANGLE: 0,          // 0: baked shadows store visibility; K > 0: the clearance angle in Sun radii (+-K), see shadowBake.js
  CHUNK_POOL: 480,          // fixed number of chunk slots (geometry + textures)
  MAX_RENDER_CHUNKS: 180,   // most terrain patches drawn at once (the governor's terrain steps lower it: x0.8, x0.64)
  SPLIT_FACTOR: 0.95,       // split when distance < factor * node edge
  SPLIT_FACTOR_OFFSCREEN: 0.3,
  // From high up only a few dozen patches are in view, far below the patch cap, and a
  // phone's screen has several pixels per patch texel: patches split this many times sooner
  // above SPACE_BOOST_ALT (blended in from SPACE_BOOST_FROM).
  // (From 1.2 km up, growing with the square of the height's logarithm to the full boost at
  // 150 km: it once began at 30 km, and from a few kilometres up the ground looked "not
  // loaded": seven screen pixels to a texel of the ground's own maps on the phone, with
  // half the patch pool unused. The curve keeps about as many patches in view at every
  // height as a view from the ground has (measured at the canyon: 98, 73, 56 and 94
  // patches at 3, 12, 40 and 150 km before; about 110 to 150 with it): nothing more is
  // drawn from the air than from the ground, and no more is built than the pool holds.)
  SPLIT_SPACE_BOOST: 2.2,
  SPACE_BOOST_FROM: 1200,
  SPACE_BOOST_ALT: 150000,
  MIN_FOOT_GRAVITY: 1.0,    // m/s^2: on foot, gravity never counts for less (tiny moons; see cameraRig.js)
  MORPH_START: 0.72,        // fraction of the merge distance where geomorphing starts
  WORKERS: 3,
  SHADOW_REBAKE_DEG: 1.0,

  // Atmosphere LUT sizes
  TRANSMITTANCE: [256, 64],
  MULTISCATTER: [64, 32],
  SKYVIEW: [160, 100],
  FROXEL: [32, 32, 32],     // w, h, slices (atlas is 8 x 4 tiles)
  FROXEL_ATLAS: [8, 4],
  IRRADIANCE: 16,            // octahedral irradiance map size (plus one row for the circumsolar term)

  // Near shadow map (rocks, lander, character): one atlas of three tiles
  NEAR_SHADOW_SIZE: 2048,   // texels across the coarse tile
  NEAR_SHADOW_RADIUS: 150,  // metres around the camera it covers
  NEAR_SHADOW_TILE: 1024,   // texels across each of the two fine tiles
  NEAR_SHADOW_INNER: 20,    // metres around the camera covered by the fine tile (4 cm texels)
  NEAR_SHADOW_FOCUS: 3.5,   // metres around the character covered by its own tile (7 mm texels)

  // Post / performance
  // The render ceiling is the canvas's native pixel size. This is only a guard for very
  // large desktop monitors (above 4K), where full-size HDR targets would break the
  // GPU-memory budget; no phone reaches it.
  MAX_NATIVE_PIXELS: 8.3e6,
  BLOOM_LEVELS: 5,
  BLOOM_STRENGTH: 0.045,

  // Camera
  DEFAULT_FOV: 48,          // vertical, degrees (about 85 across on a phone held sideways: wider makes mountains small)
  TELE_FOV: 7.5,
  EYE_HEIGHT: 1.7,
};
