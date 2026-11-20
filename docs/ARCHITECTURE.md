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
5. `nearShadow.render` → one 16-bit depth atlas, three tiles along the Sun: rocks and lander ±150 m (15 cm texels), the same ±20 m (4 cm; only the nearest rocks, governor step `fine-shadows`), the character alone ±3.5 m around it (7 mm).
6. HDR target (RGBA16F, sub-viewport = render scale):
   **far pass** (sky bodies, Sun disc, stars, additive sky in-scatter) → **clear depth** →
   **near pass** (terrain front-to-back, rocks, ship) → if the character is shown, the
   **character pass** and the **dust pass** (each its own scene). Near the ground (terrain
   near plane up to 1 m) both use the terrain's depth: character first, then dust. Higher
   up, where the terrain's near plane has moved past the figure, the dust is drawn first
   (still against the terrain's depth), then depth is cleared again and the character is
   drawn in its own slice (near 0.2 m, far 400 m). → depth invalidated. A new pass goes
   before that second depth clear if it must be hidden by terrain.
7. `post.render` → bloom downsample chain, luminance metering (async 1×1 read-back, CPU
   adaptation), bloom upsample, AgX tone map, blue-noise dither → canvas.
8. `governor.update` (may change the render scale or a feature for the next frame), HUD.

## Modules

| Path | Responsibility |
| --- | --- |
| `src/main.js` | Checks WebGL 2 + float targets, loads the world definition, starts `App`. |
| `src/app.js` | Owns renderer, scenes, frame loop, bookmarks, canvas size, start screen and benchmark flow; wires modules. |
| `src/config.js` | Engine constants: grid sizes, pool sizes, the terrain patch cap, LUT sizes. |
| `src/worlds/*.js` | World definitions (numbers + recipe names only). `solarSystem.js` is the shared body catalogue (orbits, rotation, radii, albedos, disc looks). `index.js` is the registry. |
| `src/core/ephemeris.js` | Kepler orbits, IAU rotation models, local-frame helpers. Pure JS. |
| `src/core/params.js` / `build.js` | URL parameters; the commit the page was built from (injected by Vite). |
| `src/perf/governor.js` | The governor: render resolution, feature step-down order, frame pacing, Smooth/Sharp. |
| `src/perf/benchmark.js` | The scripted 3-minute run and 10-minute soak, and the results text. |
| `src/ui/` | `screens.js` (start screen, results screen, benchmark banner, toast), `device.js` (fullscreen, landscape lock, wake lock), `targetMarker.js` (brackets, name, distance and trip time on the target; an edge arrow off screen), `targetPicker.js` (the target list). |
| `src/terrain/height/` | **HeightSource**: `noise.js`, `dem.js` (raster sampling), `layers.js` (recipe ops: dem, fbm, ridged, terrace, craters), `heightSource.js`. Pure JS: runs in workers, on the main thread and in Node. |
| `src/terrain/cubeSphere.js` | Cube-face ↔ direction mapping. |
| `src/terrain/chunkBuilder.js` | Builds one chunk: band-limited vertices, skirts, morph deltas, normal map, shadow bake. |
| `src/terrain/shadowBake.js` | Sun-shadow ray-marching (chunk maps and point queries). |
| `src/terrain/chunkWorker.js` / `workerPool.js` | Worker entry (jobs: chunk, shadow, points) and a queue-less pool. |
| `src/terrain/quadtree.js` | Node tree and distance-to-node. |
| `src/terrain/chunkPool.js` | Fixed-size pool of chunk slots: four texture arrays with one layer per slot (vertices, morph heights, normal map with mips, baked shadow), filled with plain WebGL calls between frames, and the one instanced mesh that draws every visible chunk. |
| `src/terrain/terrainMaterial.js` / `surfaceTextures.js` | Terrain GLSL; generated detail and strata textures. |
| `src/terrain/terrain.js` | Manager: selection, patch-cap feedback, dispatch, eviction, shadow re-bakes. |
| `src/atmosphere/` | Hillaire-style LUT atmosphere (`atmosphere.js`, `atmosphereGlsl.js`). |
| `src/render/` | `globals.js` (uniforms shared by reference), `lightingGlsl.js` (the one lighting chunk), `fullscreen.js`. |
| `src/sky/` | Far pass: `stars.js` (point sources), `sun.js`, `bodies.js`, `skyDome.js`. |
| `src/shadows/nearShadow.js` | The shadow atlas of the things standing on the ground (coarse, fine and character tiles) + its GLSL. On an airless world a shadow's soft edge is about a hundredth of the distance to its caster, so a figure's shadow needs millimetre texels. |
| `src/rocks/rocks.js` | Instanced rocks, scattered deterministically near the camera. |
| `src/ship/lander.js` | Procedural lander geometry, placement, material. |
| `src/hero/hero.js` / `heroModel.js` / `robe.js` | The character, a robed figure with long hair: how it moves and poses (`hero.js`), how it looks: body parts, colours, materials and shader (`heroModel.js`), and its simulated cloth (`robe.js`: the robe's skirt, the two wide sleeves and the hair, one draw call). |
| `src/fx/dust.js` | Dust thrown up by the character near the ground: a fixed pool of 1024 sprites on ballistic arcs under the world's gravity, slowed by its air, lit through the lighting chunk and tinted like the ground. The governor can halve it. |
| `src/controls/` | `input.js` (keys, mouse, virtual keys), `touch.js` (phone controls), `cameraRig.js` (walk, fly, zoom, on foot), `speedLaw.js` (flight speed against the nearest surface), `gravity.js` (pull, fly-by limit), `autopilot.js` (GO trips: aim, extra boost, arrival, trip time). |
| `src/post/post.js` | HDR target, metering, bloom, tone map, dither. |
| `src/debug/hud.js` | HUD (compact line / full read-out / off) and time-of-day slider. |
| `scripts/` | `shots.mjs` (headless screenshots of bookmarks), `shots-all.mjs` (the full reference set), `stability.mjs` (consecutive-frame flicker test), `smoke.mjs` (start screen, modes and a full benchmark run, headless), `governor-sim.mjs` (the governor against simulated GPUs), `flight-test.mjs` (scripted Mars → orbit → Moon flight, headless), `foot-test.mjs` (the character on foot in the real game, headless), `target-test.mjs` (target list, marker and a GO trip in the real game, headless), `transfer.mjs` (GO trips flown without a browser), `flyby.mjs` (a trip to another world flown by the rig, without a browser), `sky-table.mjs` (where the sky bodies are from a place over time), `profile-chunks.mjs` (chunk build times per level), `probe-terrain.mjs` (shaded relief in Node), `find-ledge.mjs`, `fetch-assets.mjs` and `fetch-maps.py` (the data in `public/data/`), `gen-bluenoise.mjs`, `build-check.sh` (a build that fails loudly), `lib/` (shared browser launcher, PNG read/write, the GL limits check, loading a world's data in Node). |

## Worlds are data

A world file exports one plain object (it is `postMessage`d to workers, so it must be
structured-cloneable): `id` (its key in the registry `src/worlds/index.js` and in
`?world=`; also shown as a label), `name`, `body` (key into the catalogue), `radius`,
`gravity`, `dayHours`, `terrain` (rasters, a list of height **layers**
`{op: 'name', ...numbers}`, altitude range, shadow range and headroom), `surface`
(palette, slope thresholds, strata, BRDF roughness, photometry, albedo map, rocks),
`atmosphere` (or `null`), `sky` (bodies, star catalogue), `scene` (`dateUTC`, `start`:
where the player begins, `ship`: the lander's offset from there in metres, `exposure`,
`bookmarks`) and `places`. The engine never branches on `world.id`.

**Places** (`places: [{ id, name, lat, lon }]`, longitude in degrees east): the real
places the player can choose as a target on this world. The target list, the marker and
GO read them (`App.targetList`, `App.resolveTarget`), and `?target=place:<id>` names one.
A world file without `places` loads with no error and simply has no places in its list,
so a new world needs them to be reachable by GO.

**Fifteen worlds, loaded when wanted.** The registry imports every world file (small:
numbers only). A world's rasters and height function are fetched by `App.loadWorldData`
when it is the start world, when the traveller comes within twenty of its radii (or the
home ground is six times farther than it), or when a GO trip is aimed at it (`App.space`).
One download however many ask; the last three worlds stay in memory; a failed download
backs off and is tried again. Its albedo and slope maps load with the terrain
(`Terrain.loadAlbedoMap`), decoded off the main thread. The start screen's "Start on"
list reloads the page on another world (`?world=`, remembered in `localStorage`).

**Height layers** (`src/terrain/height/layers.js`), beyond `dem`, `fbm`, `ridged`,
`terrace` and `craters` (now with `floor`: a flat-floored basin or caldera):

- `ellipsoid` — the figure of a body far from a sphere with no elevation map (Deimos).
- `lineaments` — families of parallel bands round the sphere (each family the circles
  of equal distance from a great circle): grooves (Phobos), ridges and double ridges
  (Europa, Triton), tiger stripes (Enceladus, with `bands` to keep four), dunes (Titan,
  `profile: 'dune'`, the family's pole at the world's pole so they run east-west).
- `cells` — Worley cells: furrows along the walls (Pluto's ice polygons), hollows with
  standing walls (Triton's cantaloupe terrain), plates lifted and dropped (Europa's
  chaos), slabs (Venus underfoot).
- `massifs` — named mountains at their mapped places and heights (Io).
- **`where`** on any layer limits it: `cover` (noise patches of a share of the ground),
  `lat` and `hemisphere`, `alt` (the height so far), `at` (named places with radii),
  `invert`. The mask is continuous (`masked()` in `heightSource.js`).

Where a world has no elevation, part of its shape still comes from data: Io's lava
floors are cut where the colour mosaic is dark (`io_dem`), Titan's sand seas lie low
where the near-infrared mosaic is dark (`titan_dem`), both made by
`scripts/fetch-worlds.py`.

**Small bodies.** On foot gravity never counts for less than `MIN_FOOT_GRAVITY`
(1 m/s²). A moon without rotation elements is locked to its planet
(`Ephemeris._lockedMatrix`: longitude 0 faces the parent, the pole is the orbit normal).
The camera's "up" is the direction from the body's centre, so on Phobos (27 x 22 x 18
km) the ground often tilts against it: the horizon slants, as on a hillside.

**Ice** (`surface.gloss: { strength, roughness }`): the Sun's sheen on the ground, one
GGX lobe added in the terrain shader, faded out with distance.

**Elevation rasters** (`terrain.dems`): a global one that wraps in longitude, then any
number of patches. Later entries win inside their bounds and blend over `feather` degrees
(a patch's feathered edge must lie inside the full-weight part of whatever is under it:
only two rasters are blended at a point). `scale` is metres per stored unit. The `dem` op
leaves the pixel size of the raster under the point in the context (`c.res`); `belowDem`
on an `fbm` or `craters` layer keeps that layer's features smaller than that many pixels,
so a real crater in a sharp patch is never doubled by a procedural one, while coarse
regions still get relief.

**Albedo map** (`surface.albedoMap`): one global image (longitude 0–360° E from the left,
north in the first row) that multiplies the palette place by place, divided by its `mean`
so the palette keeps its meaning. `encoding` (`srgb` or `linear`), `strength`, `chroma`
(how much of the colour differences is used) and `latFade` (degrees of latitude between
which the map hands back to the palette, for mosaics that are bad at the poles). The
terrain shader looks it up per pixel from the direction to the planet's centre; the
sampler's footprint is worked out from that direction, which has no seam, never from the
longitude, which jumps (taking derivatives of the longitude left a whole cube face
blurred to the map's mean colour). A 512 × 256 copy on the CPU gives the same tint at the
camera (`Terrain.tintAt` → `uGroundTint`) for the rocks and the kicked-up dust.

**Ground cover** (milestone 3): gentle ground is shared between dust, dark sand and bare
`bedrock`, in patches a few metres to tens of metres across from one pattern that gathers
sand in hollows and leaves bedrock on the rises. `surface.cover` sets the shares from the
albedo map's darkness (`sandMap`, `bedrock`, `sandMin`, `sandLow`, `hollows`, `contrast`)
and `rockHue` how much of the dust's hue rock wears (dust-mantled Tharsis, bare rock at
Gale); the cover only shares out the map's brightness, it keeps the mean. `strata.flat`
lets the bands show through the dust. `ripples.onDust` / `direction`: wind ripples, their
wave vector rounded to whole cycles per 64 m detail tile so crests continue across chunk
edges (any pattern phased by the detail UV must be). `albedoMap.range`: soft limits of the
map's brightness relative to its mean, held near the ground only (the mosaic's photographed
sunlit walls made the Olympus scarp white; from orbit they are real depth). Steep faces
take the close-up detail mapped onto the face itself (no streaks down cliffs). Rocks are
one lump cut by four to six fracture planes per instance (`aShape`), shaded by their true
faces; `rocks.dustCap` is how much dust lies on their tops.

**Slope map** (`surface.reliefMap`): the ground's slope everywhere (east and north, from
the 16 px/deg global elevation, box-averaged to 4096×2048), one greyscale JPEG twice as
tall as wide, uploaded as R8. It gives relief shading from far away, where the chunks'
normal maps are kilometres per texel and, outside the sharp patches, the heights only know
features a few tens of kilometres across. The terrain shader adds the band between the
map's resolution (or the screen's, if coarser) and the coarser of the chunk's texels and
2.5 pixels of the elevation raster in charge there (`demLog2Res` in the shader, from the
raster list as uniforms `uDemBox`/`uDemInfo`, up to 8 rasters, set by `setDemList`; it was a
texture once, and that put the ground's shader over a phone's 16 textures). So nothing is added inside the sharp
patches or near the ground, and real craters and canyon walls appear from orbit.
`strength` scales the slopes it adds (2 for both worlds: a stylisation, so landforms read
on a phone from orbit). Governor step `far-relief` (`uQuality.w`). `surface.farRoughness`
replaces the Oren–Nayar roughness for ground whose chunk texels are kilometres: the
grain-scale value kept a whole disc nearly as bright at its edge as at its centre.

From high up (above about 30 km, fully above `SPACE_BOOST_ALT`) chunks split up to
`SPLIT_SPACE_BOOST` (2.2) times sooner: only a few dozen are in view there, and a phone has
several pixels per normal texel.

**Photometry** (`surface.photometry`): `'lunar'` switches the ground and the rocks from
Oren–Nayar to the lunar-Lambert function times the Moon's measured phase curve
(`lunarDiffuse` in the lighting chunk): equal to Lambert at opposition, 0.24 of it at a
90° phase. The palette's numbers are then normal albedos. `surface.bounce` scales how
much sunlit ground lights the shadows (a back-scattering surface sends less sideways).

**Bookmarks** (`scene.bookmarks`): the first five are the scene's own place at different
moments (the benchmark flies exactly these five). After them come any further views of the
same site (Mars has a sixth, `canyon`) and then other real places with their own
`lat`/`lon` and `timeOffsetHours`. `label` is shown when the player jumps there. Keys
`1`–`9` and the VIEW button go through them in the file's order.

The Moon (`src/worlds/moon.js`) was added with data only, first as an invented cratered
world, since milestone 3 from NASA elevation and brightness maps. What it needed from the engine
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
  (× zoom for telephoto, × a feedback scale that holds the patch cap: `MAX_RENDER_CHUNKS`,
  180, times the governor's terrain steps). Children
  replace a parent only when all four are ready. Vertices morph toward the parent shape
  with distance (CDLOD-style), and the fragment shader blends normals, cavities and baked
  shadows toward the parent's maps by the same factor (the parent's layer of the same
  texture arrays). For 0.6 s after children take over from their parent the factor is forced
  from 1 down to 0, so new detail fades in. Nodes outside a widened frustum use a small
  split factor.
- Drawing: one instanced draw call for all visible chunks, nearest first. The vertices
  are not attributes: the vertex shader reads them from a texture array by vertex number
  and layer (`tVert` xyz + height, `tMorph`), and each instance carries sixteen numbers
  (centre relative to the camera, morph distance, centre in planet axes, fade, detail
  offset and extent, its layer, the parent's layer and corner, the cube face; the list is
  above the vertex shader in `terrainMaterial.js`). three never uploads these textures:
  they are `ExternalTexture`s around WebGL textures that `chunkPool.js` allocates once and
  fills one layer at a time. Uploads happen in `Terrain.update`, before any drawing of the
  frame, never inside a render pass, and no mip map is built on the GPU (the worker makes
  them): on a phone's tile-based GPU either one interrupts the picture being drawn.
- Pool: `CHUNK_POOL` slots allocated once. Eviction is least-recently-visited, never a
  node with loaded children, never anything used in the last 20 frames.
- Shadows: per chunk, split by distance so almost no ray is long — every texel walks the
  chunk's own height grid (bilinear lookups); a 17×17 grid of rays continues from the
  chunk edge to 8 chunk widths; a 5×5 grid covers the rest of `shadowRange`. Minimum
  clearance angles are combined per texel and turned into visibility with the Sun's true
  angular radius. Re-baked when the Sun has moved more than `SHADOW_REBAKE_DEG`. A ray
  stops once it is above everything it could still meet: `hs.ceilingAt(dir)`, the tallest
  raster height within `shadowRange` of where the ray starts (a 2° grid built from the
  rasters when the height source is created) plus `shadowHeadroom` for what the recipe
  can add, plus what any op reports through `fn.top(x, y, z, reach)` (`massifs`: mountains
  no map shows, far above any headroom). That makes shadows right at any place on the planet, a 21 km volcano included,
  without a per-scene number.
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
- `sky-light table` (64×1, once per world): sky-plus-bounce light on level ground against
  the Sun's height. Seen from high up, every surface takes its sky light from this table
  at its own Sun height (times the share of the sky its normal faces) instead of from the
  camera's irradiance map (`skyLight` in the lighting chunk; blended in between 3 and 30
  km of altitude). So the night side is dark wherever the camera is, and a camera over
  the night side does not leave the day side without sky light (an earlier version
  scaled the camera's map by a ratio, which is zero when the camera's own sky is dark).
- Haze over the ground follows the ground's own brightness: the multi-scatter LUT's
  alpha holds the share of its light that set out as sunlight reflected by the ground
  (of the world's `meanAlbedo`), the froxel A alpha that share of the smooth in-scatter,
  and the terrain's haze scales that part by its albedo over `meanAlbedo` on steep views
  (`aerialPerspective(color, rel, albedo)`). Seen from orbit a large dark region keeps its
  contrast through the dust, as in photographs; along grazing lines the air is lit by all
  the ground it passes, so the weight fades out there.
- `air-shadow map` (64×64, R16F, filled by a terrain worker): altitude below which
  terrain hides the Sun, on the tangent plane around the camera. The froxel march drops
  direct sunlight below it (`airLit`). `Atmosphere.updateAir` keeps it current.
- **From space** the sky dome marches each ray through the shell (16 samples, 8 on the
  governor's step) instead of reading the sky-view LUT, and ground seen at a grazing
  angle, or anywhere the Sun is less than about 6° up, marches its own haze (12 or 6
  samples) instead of reading the froxels; both use `scatterStep` in `ATMO_LUT_ACCESS`.
  (A froxel tile near the planet's edge can hold rays that pass through sunlit air
  beyond the edge; over dark ground that light showed as bright square blocks.)
- `atmosphere: null` is not a code path: it becomes an empty medium, the same passes run
  once, the sky stays black and the irradiance map contains only ground bounce.

## Lighting model (rule 1)

`direct = E_sun · (T_sun + circumsolar) · bakedShadow · nearShadow · BRDF` plus
`(skyLight(N) · cavity + planetShine(N)) · albedo / π`. Sky light includes sunlit-ground
bounce from the lower hemisphere. Planetshine is the sunlight reflected by the brightest
sky body, computed from its albedo, phase and distance. Emissive ship lights do not
illuminate anything. Everything goes through `src/render/lightingGlsl.js`.

**Texture budget per shader.** Phones allow 16 textures in one fragment shader (the test
browser allows 32), and a shader over that draws nothing on the phone, with no error in any
headless test. The terrain's shader is the fullest: 15 (strata, detail, colour and slope
maps; the chunk's normal and shadow maps and its parent's two; the sky-light texture, three
aerial-perspective maps, two atmosphere tables and the near shadow map). The two sky-light tables share one texture
(`tIrradiance`: octahedral map, circumsolar row, and the level-ground sky light against the
Sun's height in row IRR+1, each pass drawing only its rows). `scripts/lib/glLimits.mjs`
checks every linked program against the OpenGL ES 3.0 minimums in `npm run smoke` and in
every screenshot run; a shader that fails on the device shows a message on screen and in
the benchmark results (`renderer.debug.onShaderError`).

## Sky bodies

One code path: a body is a lit mesh when it is more than ~2.5 pixels across and a point
source with the correct integrated flux otherwise (Earth is a point from Mars and a disc
from the Moon). Stars and unresolved bodies are flux-carrying Gaussian point sprites, so
exposure alone decides whether they are visible.

- **Every body of the catalogue is in every sky** (27 of them: the planets, Pluto, Ceres,
  nineteen moons). How each looks is the `LOOKS` table at the end of `solarSystem.js`.
  A globe's maps are fetched when it first shows a disc (it stays a point until its small
  copies are in) and its full maps when it is 260 pixels across; pictures are decoded off
  the main thread and handed to the GPU as they arrive, between frames.
  The full maps are freed when the body is small again (the small copy is kept). The home
  world's own globe is fetched while it is home, so it is there at a hand-over.
- **Where a resolved body is drawn**: at a made-up distance in the far pass (its true
  direction and angular size). The slots run near to far and none can cross: each starts
  behind the whole of the one before, `D_k = D_(k-1) (1 + rho_(k-1)) / (1 - rho_k) * 1.02`
  with `rho` a body's reach (rings included) over its distance, then all are scaled to
  end by 45 (the Sun's quad is at 50, the stars at 90; far pass near plane 0.002).
- **The home air in front of them**: globe, air rim, rings and the rings' edge line all
  look up the home world's transmittance along the camera's own vertical (`uUp`, set
  every frame), and only from inside the air.
- **A globe from one map**: `maps.colour` alone is enough; clouds, lights, water and
  relief are optional (stand-in 1 x 1 textures). `linear`: a one-channel map of linear
  values (the Moon's). `tint` and `gain` turn the map into albedo; `airless`: no limb
  darkening; `relief`: the world's slope map bends the shading normal, so craters and
  canyons show at the day-night line (Mars from Phobos). `bands`: no file, the map is
  made from a list of colours by latitude (Saturn, Uranus, Neptune, the clouds of Venus,
  Titan's smog). `radii`: a flattened globe.
- **Drifting bands** (`drift: [[northern edge, degrees a day], ...]`): the colour map is
  read at a longitude shifted by the band's drift since J2000; across an edge the two
  neighbours cross-fade, so nothing shears however long the clock runs (Jupiter's belts
  at about their real speeds against System III).
- **Rings** (`rings.profile`: stops of radius, optical depth, colour; `ringlets`): one
  row of texture, a flat annulus in the equatorial plane drawn after the globes (blended,
  depth-tested). Lit from the Sun's side by reflection, from the other by the light that
  filters through; the planet's shadow falls across them (a ray against the flattened
  globe) and theirs on the planet (the sunbeam's crossing of the ring plane, in the globe
  shader). A traveller is kept out of them as out of a body (`reach`).
- **Recipes** (`surface.recipe` in `solarSystem.js`): `rock` (an albedo with mottling, on
  a lumpy mesh for the irregular moons), `oceanWorld` (a generated pattern), and `globe`:
  a real globe from maps. A `globe` names four equirectangular maps (longitude −180…180
  left to right, north at the top): `colour` (sRGB), `clouds`, `lights` and `water` (grey,
  one byte a pixel), each as a small `far` copy loaded at start and a `full` one loaded
  when the body is more than 260 pixels across (`FULL_MAPS_PX`). Its shader
  (`GLOBE_FRAG`): the colour map as albedo, a floor colour for water, the Sun's glint on
  water (one wide GGX lobe), clouds over both, a thin layer of air (single scattering in
  a flat layer with the body's `air.tau` per colour: haze toward the edge, a reddened
  day-night line), and city lights on the night side. The map lookup takes its footprint
  from the direction vector (`textureGrad`), so there is no seam. Five textures.
- **The rim of air** beyond a globe's solid edge is a second mesh, a shell eight scale
  heights up, drawn from the inside (back faces, depth-tested, added to what is there):
  each pixel finds how high over the globe its ray passes and how much air it crosses.
- **Bright bodies in a dark scene** (`uGain`): a body far brighter than the scene is
  exposed for (Earth in the lunar night) is dimmed as a whole until its sunlit face sits
  just under white, so it keeps its colours; bodies a few pixels across are left bright.
  City lights are not dimmed with it. In daylight nothing changes.
- **Seen from outside the home world's air** a body is not looked up in the home air's
  transmittance table (the table answers "the ground is in the way" for most directions
  from far outside: Earth drew black from 3 radii away).
- **Eclipses** (`SkyBodies.sunCover`): the share of the Sun's disc that sky bodies cover
  from the camera scales the sunlight (`G.uSunIrradiance`) for the frame.
- **The Sun** (`sun.js`) is drawn where it is from the camera and at the size it has from
  there, with the radiance of its surface (which does not depend on distance). Large in
  view, it shows grain and spots and is dimmed as through a filter; from a planet it is
  the blinding point it always was.
- **Light from the home world below** (`uHomeShine`, `homeShine()` in the lighting chunk):
  on the character high above the home world, its day side as a lamp (albedo × sunlight ×
  how much of the sky below it fills), faded in between 20 and 150 km up; near the ground
  the sky light already carries the ground's bounce.

## The flying character and world-to-world flight

- **Hero** (`src/hero/`): a robed figure with long hair, built from code like the lander
  (`heroModel.js`): a torso piece (robe top, crossed collar, shoulder pieces, sash with
  pearls and tassels, neck, head and the hair on it), and upper and lower pieces for each
  arm and leg, bent at elbow and knee by the pose. Nine meshes plus the cloth, no
  textures: detail is geometry coloured per vertex, and each vertex carries a material
  number the one shader branches on (silk, skin, silver embroidery, polished silver and
  pearls, hair with a highlight along the strands). What the metals mirror is the sky
  light and the sunlit ground from the lighting chunk, so art rule 1 holds. Drawn ~4 m in
  front of and a little below the camera, in its own scene. The camera is still what the controls
  move (`rig.mode === 'hero'`); the figure only poses itself from the rig's velocity:
  upright when hovering, horizontal with arms forward in flight, banking into turns.
  On foot (`rig.onFoot`) the rig integrates the soles (`rig.feet`, horizontal velocity
  `footVel`, `vUp` under the world's gravity × (R/r)²), places the camera behind the
  figure (`_placeBehind`), and hands the figure's position over as `rig.heroRel`; the
  figure blends from the hover pose to a gait (stride, lean, arm swing, jump tuck, landing
  crouch) by `hero.foot`. Hand-overs: `standUp`, `_toFoot` (landing or a real fall from
  flight), `_takeOff`. Constants in `FOOT` (cameraRig.js).
  The soles stand on the ground as it is drawn (`rig.groundAt` → `terrain.drawnHeight`:
  the deepest live chunk's triangle under the feet, morph included), blended to the exact
  height function when the two differ by 2–6 m (first drafts while loading). Ledges are
  judged drawn-against-drawn. The figure, the lander and the eight nearest rocks hide sky
  light from the ground at their foot (`uOccluders`: 16 spheres in three groups with a
  reach each, `uOccGroups`, written by `app.updateOccluders`; `contactSky` in the lighting
  chunk; governor step `contact` drops the lander's and the rocks').
  Near the ground it shares the terrain's depth buffer; once the terrain's near plane has
  moved past it (higher up) depth is cleared and it renders in its own 0.2–400 m slice.
- **Robe and hair** (`robe.js`): one mass–spring cloth simulation on the CPU (Verlet,
  75 Hz, at most four steps a frame, 4 constraint passes) in eight patches: three skirt
  panels of the outer robe (back 9×13 points, each side 6×13, slit at the front and the
  sides so each flows on its own), two wide sleeves (7×6, their middle line pinned along
  the arm by the pose every frame, the two halves sewn together underneath) and three
  locks of hair down the back (4×12 each). About 500 points in all. The skirt and the
  hair are pinned along their top row. Each patch is kept out of a capsule along the
  spine, the hair also out of the head, and the skirt and sleeves out of the limb capsules
  the pose writes every frame (eight, two per limb; collisions run on the last two
  passes). All patches are drawn as one mesh, finer than they are simulated (a smooth
  surface through the points with folds pressed in along its normal), in one draw call,
  and it casts a shadow with the rest of the figure. It is simulated in an anchor-relative
  frame so planet-scale coordinates never reach it. Forces: gravity (the world's, falling
  off with altitude), the wearer's acceleration (inertia, clamped), drag toward the passing
  air, gusts and a flutter that runs down each piece. Air density comes from
  `atmosphere.surfaceDensity` and scale height. Two deliberate, owner-requested departures
  from physics: in vacuum 30 % of the "flow" is kept, so the cloth still trails in flight,
  and a gentle breeze always blows through robe and hair, even standing still on the Moon.
  Governor step `cloak` (`robe.halfRate`) halves the solver's passes (2 instead of 4, the
  cloth hangs a little looser); the step itself stays at 75 a second and the pinned points
  are placed every frame, so the sleeves never lag the arms. The cloth has a ground plane
  (the ground under the figure) and feels at most 0.2 of air, the thin air it is tuned for.
  Its triangles are wound to match the normals `_draw` writes, and a cell's material is
  carried flat by the point both its triangles end on (`flat` varying `vMat`).
- **Speed law** (`speedLaw.js`): top speed = 0.85 × distance to the nearest surface of
  any body per second (0.2 near the ground, rising between 3 and 60 km; ×3 with boost,
  floor 7 m/s, ceiling 3 AU/s), never more than 40 %
  of the remaining gap per frame. Speeding up is eased over ~0.4 s; slowing down is five
  times quicker, so the speed follows the shrinking limit on arrival instead of carrying
  the traveller past. Leaving, cruising and arriving are the same control at every scale.
- **Aim**: heading and pitch are measured against the local horizon, which turns as the
  traveller moves. Above about a hundredth of a radius, and when looking past the world's
  edge rather than at it, the view's direction is held in space instead
  (`_holdDirection`); looking at the world keeps the horizon frame, which is what brings
  "point at the ground and push" down onto it.
- **Gravity** (`controls/gravity.js`, numbers from the body catalogue): every body pulls
  with a drift that is a fraction of the local top speed, growing slowly with its real
  gravitational acceleration at the traveller's distance (Sun's surface 0.68, Mars 0.29,
  the Moon 0.24, the Sun's pull at Mars's distance 0.07). The pull fades out as the stick
  is pushed and is off while hovering (`rig.hover`, the HOVER button). A fall is an
  ever-slowing approach because speed shrinks with distance.
- **Fly-by limit**: while approaching or passing the nearest body, the motion is slowed
  (never bent) so that the body sweeps across the view at no more than 0.45 rad/s.
- **Targets and GO** (`autopilot.js`, `App.updateTransfer`): a target is another body,
  the Sun, or one of the home world's `places` (world data: name, latitude, longitude).
  GO holds full stick and the boost (`rig.auto`) along `aimDirection`: a body straight on, climbing at 40° or more while within two radii of
  the world being left; a place by a point a little ahead on an arc that rises to a third
  of the arc still to go and comes down onto it; never a line through the world (unless
  the target has become the world underfoot). Extra boost ×2 when every body is more than
  20 radii away, and near the ground the open-space pace (0.85 of the height per second). The trip ends at 5 % of a body's
  radius above it, or 500 m above a place; gravity takes over unless HOVER is on. The
  marker's trip time flies the same path quickly as a point (`tripTime`); `scripts/
  transfer.mjs` checks both against the rig. The flight follows the path (`rig.auto.dir`)
  while the view looks toward the target, never lower than 10° above the world's edge
  (world and marker in sight);
  dragging to look around pauses that for 3 s. The stick or a movement key ends a trip.
- **Poses** (`hero.js`): hover, cruise and boost blended by the flight amount (from the
  stick) and the boost; banking from the view's turn rate and sideways flight; an upright
  flare in the last second before touching down; a three-point kneel after a hard landing
  (over 9 m/s: the skid is braked and the stick waits 0.45 s); a fist-up launch while up is
  held after a jump. In flight the figure drifts against turns (the chase camera) and
  steps out of the picture through the telephoto.
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
  atmosphere to the far plane and are marched from the entry point; the glow on the
  planet's edge is marched per pixel (see Atmosphere); the terrain's near plane grows
  with altitude.
- **Roll**: `CameraRig.roll` is zero except after a hand-over, when it holds the previous
  world's "up" until the new world is within 40 radii (then it decays at 1.2 /s).

## The sea, clouds (Earth)

- **A sea** (`surface.sea: { level, color, roughness, ripples }` and a last height layer
  `{ op: 'sea' }`): no ground lies below the level, so the mesh is flat there, and the
  terrain shader draws flat ground at that level as water: deep colour, two scrolling
  ripple normals from the detail texture, the Sun's glint (kept from orbit) and the sky
  mirrored at a grazing view. Rocks are not placed on it. The player can stand on it
  (known problem).
- **A cloud layer** (`world.clouds`, `src/sky/clouds.js`): the globe's own cloud map on a
  shell some kilometres up, one draw call in the near pass (depth-tested against the
  ground, so peaks stand through it and it lies over the terrain from orbit), carved by
  four sizes of generated puff, lit by the Sun through the air and by the sky. Its shadow
  on the ground is one extra texture read in the terrain shader (`tClouds`, `uCloud`):
  the cloud where the sunbeam to that ground crossed the layer. The near pass's far
  plane reaches the layer's horizon. Governor step `clouds`.
- The albedo map can start at longitude -180 (`albedoMap.lon0: -180`, Earth's globe
  maps) and steep rock can take less of its tint (`steep`): snow does not lie on cliffs.

## Getting around and things to do (milestones 7 and 8)

- **The clock** (`App.timeRate`, `setTimeRate`, `setDate`): world seconds per second
  from the list `RATES`; the date stays inside 1950-2100 (the span the orbits are fitted
  for). The time slider is re-centred when the clock has run past its range.
- **`src/ui/menu.js`**: one panel built from `App.menuSections()` (rebuilt a few times a
  second while open so the clock's read-out runs). **`src/ui/map.js`**: a 2-D canvas map
  from the same ephemeris the sky uses (`positionICRF`), projected on the ecliptic;
  orbits are one period sampled at the current date; hit-testing on the drawn points.
- **`src/fx/warp.js`**: 420 line segments in clip space, shown above 2 000 km/s when far
  from everything. A picture of speed, not a thing in the world.
- **`src/core/save.js`**: one JSON value in `localStorage` (`sse.save.v1`): places found
  (`<world>/<place>` -> date), the last place stood on each world, the sound switch.
  Written at most every four seconds. `App.checkPlaces` finds a place when the traveller
  is within its reach (15 km, or 1.2 % of the world's radius) and below 120 km.
- **`src/ui/journal.js`**: every world's `places` with their `fact` lines.
- **Photo mode** (`App.photoMode`, `savePhoto`): time stopped, controls hidden; the
  shutter renders the next frame at scale 1 and reads the canvas in the same task
  (`toBlob`), then shares or downloads the PNG. The governor ignores that frame.
- **`src/audio/audio.js`**: Web Audio, started by the Play tap. Looped pink noise through
  filters for wind (gain by the air's density at the traveller), flight and warp; three
  sine tones for the suit; noise bursts for steps and landings; a three-note chime.

## Post

HDR RGBA16F → bloom downsample (13-tap, clamped; the first level is capped at about
0.6 M pixels so bloom costs the same at any render size) → metering (32×18 grid,
centre-weighted log average with a floor at a fraction of the frame mean, plus exact
single-pixel samples of lit surfaces for the subject-priority limit, weighted by the
square root of their brightness so a white lander on dark ground cannot speak for the
scene; the highlight peak skips the texels around the Sun's disc, placed by
`Post.setSun`; async read-back) →
bloom upsample → composite (~4.5 % bloom mix) → AgX → blue-noise dither. The scene is rendered
into a sub-viewport of a fixed, native-size target (no reallocations when the resolution
changes) and the composite pass scales it up to the canvas.

A world may set `exposure.dim: { above, power, most }`: past that exposure the target is
divided by (target / above)^power, at most by `most`, so the picture darkens as the scene
does (the Moon uses it: an earthlit night and the ground toward a low Sun come out about
five times darker than full compensation would make them).

## The governor (`src/perf/governor.js`)

Owner policy: the best image quality that holds a steady frame rate on the phone.

- **Canvas**: its backing store is the native pixel size (`devicePixelContentBox` when
  the browser reports it, else CSS size × `devicePixelRatio`), so the final image is
  never resampled by the browser. `MAX_NATIVE_PIXELS` (8.3 M) is only a guard for
  monitors above 4K.
- **Resolution levels**: level k renders `native × 0.88^k` pixels; the lowest level is
  the one closest to 1 M pixels (or native, if the canvas is smaller than that).
- **Slow work is told from slow pixels.** The app passes the page's own time for the frame
  (`scriptMs`: from the start of `frame()` to the governor's update). When frames are late
  and that time fills more than 0.6 of the interval, resolution is left alone and the
  *load lever* is used: terrain patch factor ×0.8, then ×0.64 (`LOAD`, id `load` in
  `App.terrainBudget`), back one step after 15 clean seconds. When only frames with
  arriving terrain are late (the "soft" ones), terrain is let in more slowly first
  (`App.terrainPace`: one patch a frame, then one every other frame; full pace again after
  5 clean seconds). `MODES[mode].patches` is the share of the patch cap a mode draws
  (Smooth 0.8, Sharp 1).
- **Feature steps** (`FEATURE_STEPS` in `governor.js` is the source of truth; fixed
  order, used only once resolution is at its floor). Thirteen steps, by id:
  1. `detail`: close-up ground detail off;
  2. `soft-shadows`: soft edges on rock and ship shadows off;
  3. `contact`: darkening at the foot of rocks and the lander off;
  4. `edge-glow`: the glow on a planet's edge marched with half the samples;
  5. `dust`: half the kicked-up dust, and a simpler cloud;
  6. `rocks`: half the rocks;
  7. `fine-shadows`: the fine shadow tile of the nearest rocks off (coarser shadows);
  8. `terrain-1`: terrain patch cap ×0.8;
  9. `bloom`: bloom off;
  10. `terrain-2`: terrain patch cap ×0.64;
  11. `far-relief`: relief shading of far ground off;
  12. `cloak`: robe and hair simulated with half the solver passes (the id is from the cloak it replaced);
  13. `air-shadow`: terrain shadows in the haze off.

  Steps up run in reverse. Every new feature that costs frame time adds its step here.
- **Measuring**: the display's refresh interval is estimated continuously from the
  spacing of animation-frame callbacks (20th percentile of the last 60, never slower than
  57 Hz). The frame interval is the mode's target rounded to a whole number of refreshes.
  A frame is *late* when it takes more than 1.2 × its interval (`LATE`). Lateness is
  judged against the target interval, never against the measured refresh: when every
  frame is slow the refresh reads too long and would excuse them.
- **Deciding**: over the last 24 frames, step down when more than 20 % of the ordinary
  frames are late, or more than 60 % of all frames (two steps at once above 60 %). Frames
  in which new terrain was uploaded are "soft": lateness there is usually not the
  resolution's fault. Frames after a bookmark jump, a world switch, a resize or a return
  from the background are ignored.
- **Stepping up** needs a clean run of `holdUp` seconds (3 s to start) and, where the
  browser exposes GPU timer queries, GPU time under 72 % of the interval. If a step up
  has to be taken back within 4 s, `holdUp` doubles (up to 60 s); it halves again each
  time a step up holds. That is the hysteresis. The first eight frames after a step up
  are watched separately: if five of them are late the step is taken back at once.
- **Modes**: Smooth (60 fps) and Sharp (30 fps), `M` / the MODE button / the start
  screen, remembered in `localStorage`. Both modes start at native. Switching to Sharp
  jumps to native with every feature on and lets the governor come down; switching to
  Smooth keeps the current level and comes down from there if it has to.
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
