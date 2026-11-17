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
- **Inertial frame**: J2000 equatorial (ICRF). `src/core/ephemeris.js` produces, for a
  given time, the rotation inertial→planet-fixed and the position of every body relative
  to the world centre. Validated against JPL Horizons (Sun/Earth/Moon from Mars: 0.007°).
- **Floating origin**: the render camera always sits at (0,0,0). Every frame each object
  gets `position = worldPos − cameraWorldPos` computed in doubles. Terrain chunk vertices
  are float32 offsets from their chunk centre.
- Atmosphere shaders work in **kilometres** internally (float32-safe).
- Radiometry: Sun irradiance is in units where 1.0 = solar constant at 1 AU. All shaders
  multiply by `uExposure` before writing to the HDR target (pre-exposure), because
  RGBA16F cannot hold both the solar disc (~1e4) and 6th-magnitude stars (~1e-7). For
  the same reason the sky-view, irradiance and froxel LUTs are written pre-multiplied by
  roughly the current exposure and divided back by their consumers
  (`uSkyParams.z`, `uLutScaleInv`), and the multi-scatter LUT by a fixed `MS_SCALE`.

## Frame order (`src/app.js`)

The animation-frame callback first asks the governor whether to draw at all
(`governor.shouldRender`): with a 60 fps target on a 120 Hz screen every second refresh is
skipped, so frames are evenly spaced.

0. Classify the frame that just ended (`frameCause`: jump, world switch, new terrain…);
   if a benchmark is running it records the frame and presses the virtual keys.
1. Time → `ephemeris` → Sun direction (planet-fixed), sky-body positions, star rotation.
2. Controls (keyboard/mouse, touch, or nothing while a full-screen panel is open) →
   camera world position, orientation, FOV.
3. `terrain.update` → quadtree selection, worker requests, shadow re-bakes, chunk meshes
   re-based to the camera. Then `rocks.update`, `lander.update`.
4. `atmosphere.update` → LUTs (transmittance + multi-scatter once per world; sky-view and
   irradiance when Sun/altitude change; aerial-perspective froxel atlas every frame).
   `sun`, `bodies`, `stars` update their uniforms.
5. `nearShadow.render` → 2048² depth map of ship + rocks, ±150 m around the camera.
6. HDR target (RGBA16F, sub-viewport = render scale):
   **far pass** (sky bodies, Sun disc, stars, additive sky in-scatter) → **clear depth** →
   **near pass** (terrain front-to-back, rocks, ship) → depth invalidated.
7. `post.render` → bloom downsample chain, luminance metering (async 1×1 read-back, CPU
   adaptation), bloom upsample, AgX tone map, blue-noise dither → canvas.
8. `governor.update` (may change the render scale or a feature for the next frame), HUD.

## Modules

| Path | Responsibility |
| --- | --- |
| `src/main.js` | Checks WebGL 2 + float targets, loads the world definition, starts `App`. |
| `src/app.js` | Owns renderer, scenes, frame loop, bookmarks, canvas size, start screen and benchmark flow; wires modules. |
| `src/config.js` | Engine constants: grid sizes, pool sizes, budgets, LUT sizes. |
| `src/worlds/*.js` | World definitions (numbers + recipe names only). `solarSystem.js` is the shared body catalogue (orbits, rotation, radii, albedos, disc looks). `index.js` is the registry. |
| `src/core/ephemeris.js` | Kepler orbits, IAU rotation models, local-frame helpers. Pure JS. |
| `src/core/params.js` / `build.js` | URL parameters; the commit the page was built from (injected by Vite). |
| `src/perf/governor.js` | The governor: render resolution, feature step-down order, frame pacing, Smooth/Sharp. |
| `src/perf/benchmark.js` | The scripted 3-minute run and 10-minute soak, and the results text. |
| `src/ui/` | `screens.js` (start screen, results screen, benchmark banner, toast), `device.js` (fullscreen, landscape lock, wake lock). |
| `src/terrain/height/` | **HeightSource**: `noise.js`, `dem.js` (raster sampling), `layers.js` (recipe ops: dem, fbm, ridged, terrace, craters), `heightSource.js`. Pure JS: runs in workers, on the main thread and in Node. |
| `src/terrain/cubeSphere.js` | Cube-face ↔ direction mapping. |
| `src/terrain/chunkBuilder.js` | Builds one chunk: band-limited vertices, skirts, morph deltas, normal map, shadow bake. |
| `src/terrain/shadowBake.js` | Sun-shadow ray-marching (chunk maps and point queries). |
| `src/terrain/chunkWorker.js` / `workerPool.js` | Worker entry (jobs: chunk, shadow, points) and a queue-less pool. |
| `src/terrain/quadtree.js` | Node tree and distance-to-node. |
| `src/terrain/chunkPool.js` | Fixed-size pool of geometries + textures + meshes. |
| `src/terrain/terrainMaterial.js` / `surfaceTextures.js` | Terrain GLSL; generated detail and strata textures. |
| `src/terrain/terrain.js` | Manager: selection, budget feedback, dispatch, eviction, shadow re-bakes. |
| `src/atmosphere/` | Hillaire-style LUT atmosphere (`atmosphere.js`, `atmosphereGlsl.js`). |
| `src/render/` | `globals.js` (uniforms shared by reference), `lightingGlsl.js` (the one lighting chunk), `fullscreen.js`. |
| `src/sky/` | Far pass: `stars.js` (point sources), `sun.js`, `bodies.js`, `skyDome.js`. |
| `src/shadows/nearShadow.js` | The single 2048² shadow map + its GLSL. |
| `src/rocks/rocks.js` | Instanced rocks, scattered deterministically near the camera. |
| `src/ship/lander.js` | Procedural lander geometry, placement, material. |
| `src/hero/hero.js` / `cloak.js` | The flying character (procedural suited figure, rigid posed limbs) and its cloth-simulated cloak. |
| `src/controls/` | `input.js` (keys, mouse, virtual keys), `touch.js` (phone controls), `cameraRig.js` (walk, fly, zoom). |
| `src/post/post.js` | HDR target, metering, bloom, tone map, dither. |
| `src/debug/hud.js` | HUD (compact line / full read-out / off) and time-of-day slider. |
| `scripts/` | `shots.mjs` (headless screenshots of bookmarks), `shots-all.mjs` (the full reference set), `stability.mjs` (consecutive-frame flicker test), `smoke.mjs` (start screen, modes and a full benchmark run, headless), `flight-test.mjs`, `probe-terrain.mjs` (shaded relief in Node), `find-ledge.mjs`, `fetch-assets.mjs`, `gen-bluenoise.mjs`, `lib/` (shared browser launcher, PNG read/write). |

## Worlds are data

A world file exports one plain object (it is `postMessage`d to workers, so it must be
structured-cloneable): `body` (key into the catalogue), `radius`, `gravity`, `dayHours`,
`terrain` (rasters, a list of height **layers** `{op: 'name', ...numbers}`, altitude
range, shadow range/ceiling), `surface` (palette, slope thresholds, strata, BRDF
roughness, rocks), `atmosphere` (or `null`), `sky` (bodies, star catalogue) and `scene`
(date, start position, ship offset, exposure, bookmarks). The engine never tests
`world.id`.

The Moon (`src/worlds/moon.js`) was added with data only. What it needed from the engine
were two *generic* features that Mars also uses: planetshine on surfaces (earthshine is
the only fill at lunar night) and metering that a black sky cannot fool.

Height layers are the "terrain recipe". Each op reads/updates a small context
(`h`, `slope`, raster resolution, detail limit) — see the header of `layers.js`. Rules
for ops: fade your own detail below `c.minWL`; never allocate per call; anything written
to `c.slope` must be continuous (later layers scale by it — a jump there becomes a
cliff). New looks are new ops or parameters, never `if (mars)`.

`hs.prepare(dir, radius)` / `hs.release()` is an optional region mode: ops may cache
what is constant over a small region (craters collect the few craters that can touch a
chunk), which makes dense crater fields 3–5× cheaper.

## Terrain

- Cube-sphere, 6 quadtrees. Node = (face, level, ix, iy). Chunk mesh is a fixed
  `GRID`×`GRID` (40) quad grid plus skirts; all chunks share one index buffer and one
  grid-UV attribute. Per chunk: positions (relative to chunk centre), height + morph delta.
- Heights are sampled at `NORMAL_RES` (120, 3× the mesh) with a one-sample border.
  Vertices use a small symmetric box average of those samples (the mesh cannot carry what
  only the normal map resolves; point sampling it gives faceted silhouettes). The normal
  map is world-space RGBA16F (8-bit normals band badly at a grazing Sun); alpha is a
  one-texel cavity term. The baked Sun-shadow map is R8 at `SHADOW_RES` (60).
- LOD: split when distance to the node's closest point < `splitFactor × nodeEdge`
  (× zoom for telephoto, × a feedback scale that holds the draw-call cap). Children
  replace a parent only when all four are ready. Vertices morph toward the parent shape
  with distance (CDLOD-style). Nodes outside a widened frustum use a small split factor.
- Pool: `CHUNK_POOL` slots allocated once. Eviction is least-recently-visited, never a
  node with loaded children, never anything used in the last 20 frames.
- Shadows: per chunk, split by distance so almost no ray is long — every texel walks the
  chunk's own height grid (bilinear lookups); a 17×17 grid of rays continues from the
  chunk edge to 8 chunk widths; a 5×5 grid covers the rest of `shadowRange`. Minimum
  clearance angles are combined per texel and turned into visibility with the Sun's true
  angular radius. Re-baked when the Sun has moved more than `SHADOW_REBAKE_DEG`.
- Depth: no logarithmic depth. Dynamic near plane (0.25 m on foot), far plane from the
  farthest drawn chunk, front-to-back draw order.

## Atmosphere (Hillaire 2020)

- `transmittance` LUT (256×64), `multi-scatter` LUT (64×32, denser around the
  terminator): once per world.
- `sky-view` LUT: two layers — smooth part (Rayleigh + multiple scattering) and
  un-phased dust part. The dust phase function (per-channel Henyey–Greenstein) is applied
  analytically per pixel, because the view–Sun angle is constant along a ray; the aureole
  stays sharp at any zoom.
- `aerial-perspective` atlas: 32 depth slices of 32×32 froxels packed in one 2-D texture
  (3 attachments: smooth in-scatter, un-phased dust in-scatter, transmittance), one draw
  call per frame.
- `irradiance` LUT: octahedral map of sky + ground-bounce irradiance for surface normals,
  with the circumsolar aureole (within ~28° of the Sun) split off into a directional
  term that is shadowed like direct sunlight (extra row of the same texture).
- Media: gas (Rayleigh), dust (two exponential layers: background + low "canyon" layer),
  optional absorber layer. All numbers from the world file.
- Radii: `rBottom` (lowest terrain; LUT domain and where view rays stop), `rOcc`
  (mean local terrain; casts the planet's shadow on the air), `rTop`.
- `atmosphere: null` is not a code path: it becomes an empty medium, the same passes run
  once, the sky stays black and the irradiance map contains only ground bounce.

## Lighting model (rule 1)

`direct = E_sun · (T_sun + circumsolar) · bakedShadow · nearShadow · BRDF` plus
`(skyLight(N) · cavity + planetShine(N)) · albedo / π`. Sky light includes sunlit-ground
bounce from the lower hemisphere. Planetshine is the sunlight reflected by the brightest
sky body, computed from its albedo, phase and distance. Emissive ship lights do not
illuminate anything. Everything goes through `src/render/lightingGlsl.js`.

## Sky bodies

One code path: a body is a lit mesh when it is more than ~2.5 pixels across and a point
source with the correct integrated flux otherwise (Earth is a point from Mars and a disc
from the Moon). Stars and unresolved bodies are flux-carrying Gaussian point sprites, so
exposure alone decides whether they are visible (rule 2).

## The flying character and world-to-world flight

- **Hero** (`src/hero/`): a suited figure built from primitives, drawn ~4 m in front of
  and a little below the camera, in its own scene. The camera is still what the controls
  move (`rig.mode === 'hero'`); the figure only poses itself from the rig's velocity:
  upright when hovering, horizontal with arms forward in flight, banking into turns.
  Near the ground it shares the terrain's depth buffer; once the terrain's near plane has
  moved past it (higher up) depth is cleared and it renders in its own 0.2–400 m slice.
- **Cloak**: a 9×14 mass–spring cloth (Verlet, 90 Hz, 4 constraint passes, capsule
  collision with the body), simulated in an anchor-relative frame so planet-scale
  coordinates never reach it. Forces: gravity (the world's, falling off with altitude),
  the wearer's acceleration (inertia, clamped), drag toward the passing air, and
  travelling ripples. Air density comes from `atmosphere.surfaceDensity` and scale
  height. In vacuum a reduced "flow" (30 %) is kept on purpose so the cloak still trails
  in flight — a deliberate, owner-requested departure from physics.
- **Speed law** (`cameraRig.js`): top speed = 0.85 × distance to the nearest surface of
  any body per second (×3 with boost, floor 7 m/s), velocity smoothed over ~0.4 s, never
  more than 40 % of the remaining gap per frame. Leaving, cruising and arriving are the
  same control at every scale.
- **The sky is the whole catalogue**: `SkyBodies` always holds every body in
  `solarSystem.js` and skips the one you are on. `App.space()` measures clearances each
  frame (speed limit, collision with bodies that have no terrain) and calls
  `switchWorld` when another world with a definition file is nearer than the current one.
- **`switchWorld`** converts camera position, heading and velocity old-fixed → inertial →
  new-fixed, then calls `setWorld` on the rig, atmosphere (same LUT targets, new medium),
  terrain (same GPU pool, slots released, workers re-initialised, `epoch` bumped), rocks,
  sky bodies, exposure settings and the time slider, and rebuilds the lander. Simulation
  time is continuous across the switch; applying a bookmark sets that world's scene date.
- **From space**: aerial-perspective slices span from where the view first meets the
  atmosphere to the far plane and are marched from the entry point; the sky-view LUT
  (built for a camera inside the air) fades out over two atmosphere thicknesses, so
  there is no limb glow from high orbit; the terrain's near plane grows with altitude.

## Post

HDR RGBA16F → bloom downsample (13-tap, clamped; the first level is capped at about
0.6 M pixels so bloom costs the same at any render size) → metering (32×18 grid,
centre-weighted log average with a floor at 0.6× the frame mean, async read-back) → bloom
upsample → composite (~4.5 % bloom mix) → AgX → blue-noise dither. The scene is rendered
into a sub-viewport of a fixed, native-size target (no reallocations when the resolution
changes) and the composite pass scales it up to the canvas.

## The governor (`src/perf/governor.js`)

Owner policy: the best image quality that holds a steady frame rate on the phone.

- **Canvas**: its backing store is the native pixel size (`devicePixelContentBox` when
  the browser reports it, else CSS size × `devicePixelRatio`), so the final image is
  never resampled by the browser. `MAX_NATIVE_PIXELS` (8.3 M) is only a guard for
  monitors above 4K.
- **Resolution levels**: level k renders `native × 0.88^k` pixels; the lowest level is
  the one closest to 1 M pixels (or native, if the canvas is smaller than that).
- **Feature steps** (`FEATURE_STEPS`, fixed order, used only once resolution is at its
  floor): close-up ground detail → soft edges of near shadows → half the rocks → terrain
  budget ×0.8 → bloom → terrain budget ×0.64 → cloak at half rate. Steps up run in
  reverse. Every new feature that costs frame time adds its step here.
- **Measuring**: the display's refresh interval is estimated continuously from the
  spacing of animation-frame callbacks (20th percentile of the last 60, never slower than
  57 Hz). The frame interval is the mode's target rounded to a whole number of refreshes.
  A frame is *late* when it arrives more than half a refresh after its interval.
- **Deciding**: over the last 24 frames, step down when more than 20 % of the ordinary
  frames are late, or more than 60 % of all frames (two steps at once above 60 %). Frames
  in which new terrain was uploaded are "soft": lateness there is usually not the
  resolution's fault. Frames after a bookmark jump, a world switch, a resize or a return
  from the background are ignored.
- **Stepping up** needs a clean run of `holdUp` seconds (3 s to start) and, where the
  browser exposes GPU timer queries, GPU time under 72 % of the interval. If a step up
  has to be taken back within 4 s, `holdUp` doubles (up to 60 s); it halves again each
  time a step up holds. That is the hysteresis.
- **Modes**: Smooth (60 fps) and Sharp (30 fps), `M` / the MODE button / the start
  screen, remembered in `localStorage`. Switching to Sharp jumps to native with every
  feature on and lets the governor come down; switching to Smooth starts five levels
  (about half the pixels) lower.
- `?scale=` and screenshot mode fix the scale and switch all of this off.

## Benchmark (`src/perf/benchmark.js`)

A lap is 180 s: five Mars bookmarks (12 s each: hold, pan, fly forward), a 60 s flight
(climb to orbit, aim at the Moon and cruise with boost, follow the Moon's curve down
toward the landing site; safety nets teleport if a slow device falls behind), five lunar
bookmarks. The soak is 600 s of laps. It drives the game through virtual keys, so it
exercises the same code as a player. Every rendered frame is recorded (frame time, render
pixels, part of the lap). Frames over 100 ms are listed with their cause from
`App.frameCause`. The results are plain text (`window.__benchResult`), shown on the
results screen with a Copy button. `?bench=run|soak` starts one without a tap.

## Phone target (Samsung Galaxy S23 Ultra)

- Tile-based GPU hygiene: whole-target clears, a clear before every full-screen pass,
  depth invalidated after the scene, shadow-map colour attachment invalidated, no colour
  writes in the shadow pass.
- Touch: `src/controls/touch.js` (floating move stick on the left, drag-to-look, a row of
  buttons mapped to the keyboard actions). Shown on coarse-pointer devices or `?touch=1`,
  hidden while a benchmark plays or a panel is open.
- Play and the benchmark buttons enter fullscreen, lock landscape and take a wake lock
  (re-taken when the page returns from the background).
- GL context loss reloads the page. The shadow depth texture is initialised even when
  shadows are off (an unallocated shadow sampler fails every lit draw call).
