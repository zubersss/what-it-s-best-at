# Architecture

Read `CLAUDE.md` first for the rules. This file explains how the engine is built so a
new session can change it without re-deriving everything.

## Units, frames, precision

- Metres, seconds, radians. World positions are JS doubles (`THREE.Vector3` holds
  doubles; only GPU uploads are float32).
- **Planet-fixed frame** (the frame everything is simulated in): origin at the world's
  centre, +Z = north pole, +X = lon 0° on the equator, +Y = lon 90°E. It rotates with the
  planet, so the Sun, stars and other bodies move across it over a day.
  `dir = (cos lat·cos lon, cos lat·sin lon, sin lat)`.
- **Inertial frame**: J2000 ecliptic (orbits) / J2000 equatorial (stars, poles).
  `src/core/ephemeris.js` produces, for a given time, the rotation inertial→planet-fixed
  and the position of every body relative to the world centre.
- **Floating origin**: the render camera always sits at (0,0,0). Every frame each object
  gets `position = worldPos − cameraWorldPos` computed in doubles. Terrain chunk vertices
  are float32 offsets from their chunk centre.
- Atmosphere shaders work in **kilometres** internally (float32-safe).
- Radiometry: Sun irradiance is in units where 1.0 = solar constant at 1 AU. All shaders
  multiply by `uExposure` before writing to the HDR target (pre-exposure), because
  RGBA16F cannot hold both the solar disc (~1e4) and 6th-magnitude stars (~1e-7).

## Frame order (`src/app.js`)

1. Time → `ephemeris` → Sun direction (planet-fixed), sky-body positions, star rotation.
2. Controls → camera world position (doubles), orientation, FOV.
3. `terrain.update` → quadtree selection, worker requests, chunk meshes re-based to camera.
4. `atmosphere.update` → LUTs (transmittance + multi-scatter once per world; sky-view,
   irradiance when Sun/altitude changes; aerial-perspective froxel atlas every frame).
5. `nearShadow.render` → 2048² depth map of ship + rocks, ±150 m around the camera.
6. HDR target (RGBA16F, sub-viewport = render scale):
   **far pass** (stars, Sun disc, sky bodies, additive sky in-scatter) → **clear depth** →
   **near pass** (terrain front-to-back, rocks, ship).
7. `post.render` → luminance metering (async 1×1 read-back, CPU adaptation), half-res
   bloom chain, AgX tone map, sRGB, blue-noise dither → canvas.
8. HUD + dynamic resolution controller.

## Modules

| Path | Responsibility |
| --- | --- |
| `src/main.js` | Parse URL, load the world definition and data, start `App`. |
| `src/app.js` | Owns renderer, scenes, frame loop, wires modules together. |
| `src/config.js` | Engine constants: grid size, pool sizes, budgets, LUT sizes. |
| `src/worlds/*.js` | World definitions (numbers + recipe names only). `solarSystem.js` is the shared body catalogue (orbits, radii, albedos). `index.js` is the registry. |
| `src/core/ephemeris.js` | Kepler orbits, rotation models, body positions, local sky. |
| `src/core/params.js` | URL parameters. |
| `src/terrain/height/` | **HeightSource**: `noise.js`, `dem.js` (raster sampling), `layers.js` (recipe ops: dem, fbm, ridged, terrace, craters…), `heightSource.js` (builds the layer stack from a world definition). Pure JS, no DOM/three. |
| `src/terrain/cubeSphere.js` | Cube-face ↔ direction mapping, node geometry helpers. |
| `src/terrain/chunkBuilder.js` | Builds one chunk: vertices, skirts, morph deltas, normal map, shadow bake. Runs in workers. |
| `src/terrain/shadowBake.js` | Ray-marches the height function toward the Sun (chunk shadow maps, point queries). |
| `src/terrain/chunkWorker.js` / `workerPool.js` | Worker entry and job queue (priorities, cancellation). |
| `src/terrain/quadtree.js` | Node tree, LOD selection, culling. |
| `src/terrain/chunkPool.js` | Fixed-size pool of geometries + textures. |
| `src/terrain/terrainMaterial.js` | Terrain GLSL (materials by slope/height, strata, detail). |
| `src/terrain/terrain.js` | Manager: ties quadtree, pool, workers, materials together. |
| `src/atmosphere/` | Hillaire-style LUT atmosphere (`atmosphere.js`, `atmosphereGlsl.js`). |
| `src/render/` | Shared GLSL chunks (`lightingGlsl.js`, `commonGlsl.js`), global uniforms. |
| `src/sky/` | Far pass: `stars.js`, `sun.js`, `bodies.js`, `skyDome.js`. |
| `src/shadows/nearShadow.js` | Single 2048² shadow map around the camera. |
| `src/rocks/rocks.js` | Instanced rocks, scattered deterministically near the camera. |
| `src/ship/lander.js` | Procedural lander geometry + material. |
| `src/controls/` | Input, walk mode, fly mode, zoom, bookmarks. |
| `src/post/` | HDR target, exposure, bloom, tone map, dither, dynamic resolution. |
| `src/debug/hud.js` | Debug HUD and time-of-day slider. |

## Worlds are data

A world file exports one plain object (it is `postMessage`d to workers, so it must be
structured-cloneable): body id, radius, gravity, `terrain` (DEM rasters + a list of
height **layers**, each `{op: 'name', ...numbers}`), `surface` (palette, material rules,
BRDF roughness), `atmosphere` (or `null`), `sky` (which bodies to draw), and `scene`
(date, start position, bookmarks, ship offset). The engine never tests `world.id`.

Height layers are the "terrain recipe". Each op reads/updates a small context
(`h`, `slope`, `detail limit`) — see `src/terrain/height/layers.js`. New looks should be
new ops or new parameters, never `if (mars)`.

## Terrain

- Cube-sphere, 6 quadtrees. Node = (face, level, ix, iy). Chunk mesh is a fixed
  `GRID`×`GRID` quad grid plus skirts; all chunks share one index buffer and one grid-UV
  attribute. Per chunk: positions (relative to chunk centre), height + morph delta.
- Each chunk has a world-space normal map at `NORMAL_RES` (4× mesh resolution, RGBA16F —
  8-bit normals band at grazing Sun) and an R8 baked Sun-shadow map.
- LOD: split when distance to the node's closest point < `splitFactor × nodeEdge`.
  Children replace a parent only when all four are ready. Vertices morph toward the
  parent shape with distance (CDLOD-style) so LOD changes do not pop geometry. Nodes
  outside the (widened) frustum use a smaller split factor.
- Octaves/craters/terraces smaller than twice the chunk's sample spacing are faded out
  in the height function, so coarse chunks are cheap and alias-free.
- Shadows: per-chunk ray-march toward the Sun (geometric step growth, LOD-limited height
  queries, coarse 17² pass first, fine pass only where the coarse cell is mixed).
  Re-baked when the Sun has moved more than ~1°.

## Atmosphere (Hillaire 2020)

- `transmittance` LUT (256×64), `multi-scatter` LUT (32×32): once per world.
- `sky-view` LUT: two layers — smooth part (Rayleigh + multiple scattering) and
  un-phased Mie part. The Mie phase function is applied analytically per pixel (the
  view–Sun angle is constant along a ray), so the aureole stays sharp at any zoom.
- `aerial-perspective` atlas: 32 depth slices of 32×32 froxels packed in one 2-D texture
  (3 colour attachments: smooth in-scatter, un-phased Mie in-scatter, transmittance),
  rendered in one draw call per frame.
- `irradiance` LUT: sky radiance convolved for surface normals, with the circumsolar
  aureole split off into a directional term that is shadowed like direct sunlight.
- Media: gas (Rayleigh), dust (per-channel Henyey–Greenstein, two exponential layers:
  background + low "canyon" layer), optional absorber layer. All numbers from the world.
- `atmosphere: null` (airless) is a first-class state: LUT textures become constants.

## Lighting model (rule 1)

`direct = E_sun · (T_sun + circumsolar) · shadow · BRDF` plus
`sky = albedo/π · E_irradiance(N)`; the lower hemisphere of the irradiance integral sees
sunlit ground (bounce). Sky bodies add planetshine from their parent. Emissive ship
lights do not illuminate anything.

## Post

HDR RGBA16F → metering (64×36 log-luminance grid, centre-weighted, async read-back) →
bloom (half-res, 5-level down/up chain, ~4 % mix) → AgX → sRGB → blue-noise dither.
Dynamic resolution renders into a sub-viewport of a fixed-size target (no reallocations).
