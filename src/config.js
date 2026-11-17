// Engine constants. World-specific numbers never go here — they live in src/worlds/.
export const CONFIG = {
  // Terrain
  GRID: 40,                 // quads per chunk edge (fixed, shared index buffer; must be even)
  NORMAL_RES: 120,          // normal-map cells per chunk edge (multiple of GRID; texture is NORMAL_RES+1 square)
  SHADOW_RES: 60,           // baked sun-shadow cells per chunk edge (must divide NORMAL_RES)
  CHUNK_POOL: 480,          // fixed number of chunk slots (geometry + textures)
  MAX_RENDER_CHUNKS: 120,   // hard cap of terrain draw calls
  SPLIT_FACTOR: 0.95,       // split when distance < factor * node edge
  SPLIT_FACTOR_OFFSCREEN: 0.3,
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

  // Near shadow map
  NEAR_SHADOW_SIZE: 2048,
  NEAR_SHADOW_RADIUS: 150,  // metres around the camera

  // Post / performance
  // Render-size cap. The brief's "device pixel ratio 1" assumed a desktop monitor; the target
  // is now a phone with a ~3x display, where ratio 1 is only ~880x412. We cap the pixel
  // count instead: ratio = min(devicePixelRatio, max(1, sqrt(MAX_PIXELS / cssPixels))).
  MAX_PIXELS: 1.5e6,
  BLOOM_LEVELS: 5,
  BLOOM_STRENGTH: 0.045,
  TARGET_FPS: 30,
  MIN_SCALE: 0.5,
  MAX_DRAW_CALLS: 200,
  MAX_TRIANGLES: 500000,

  // Camera
  DEFAULT_FOV: 60,          // vertical, degrees
  TELE_FOV: 7.5,
  EYE_HEIGHT: 1.7,
};
