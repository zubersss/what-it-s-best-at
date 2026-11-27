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
   Then the sky's first step, `sky.weatherStep` (`src/sky/skySystem.js`, which holds the
   sky's and the weather's whole order and the interfaces of their parts): the game clock →
   the clouds' steering and rise (`SKY_UNIFORMS`), the field's snapshots (between frames),
   the weather at the traveller (wind, shade, wet ground, rain's veil, lightning), rain,
   strokes, rainbow, thunder.
2. Controls (keyboard/mouse, touch, or nothing while a full-screen panel is open) →
   camera world position, orientation, FOV.
3. `terrain.update` → quadtree selection, worker requests, shadow re-bakes, chunk meshes
   re-based to the camera. Then `rocks.update`, `lander.update`.
4. `atmosphere.update` → LUTs (transmittance + multi-scatter once per world; sky-view and
   irradiance when Sun/altitude change; aerial-perspective froxel atlas every frame).
   `sun`, `bodies`, `stars` update their uniforms.
5. `sky.beforeScene` (each pass into a target of its own, before the main picture is begun:
   the clouds' shade map, the shade probe, the cloud volume's march), then
   `nearShadow.render` → one 16-bit depth atlas, three tiles along the Sun: rocks and lander ±150 m (15 cm texels), the same ±20 m (4 cm; only the nearest rocks, governor step `fine-shadows`), the character alone ±3.5 m around it (7 mm).
   **The tiles are drawn in turns**: the character's every frame, the fine one every
   other frame, the wide one every fourth (`nearShadow.every`; 1 in screenshot mode), and
   at once when the Sun has moved 0.03 degrees, when the tile's middle has left the camera
   by 0.3 of its half width, or when it was never drawn. A tile not drawn keeps the place
   it was drawn at (`state[k]`: the shader's `uShadowAtlas[k]` follows it, and
   `uShadowAtlas[3].zw` carry the depth the camera has moved since along the Sun's ray),
   so a shadow stays where it lies while the camera moves. A partial draw clears only its
   own square. `npm run shadowturns` checks that a held tile draws the same picture as a
   fresh one after a 4 m walk, and fails when the kept place is wrong.
6. HDR target (RGBA16F, sub-viewport = render scale):
   **far pass** (sky bodies, Sun disc, stars, additive sky in-scatter) → **clear depth** →
   **near pass** (grass and leaves first, then trees, rocks and the lander, the terrain
   last and front-to-back: `renderOrder` -30, -20, -10, 0. What stands on the ground hides
   much of it, and the ground's shader is the most expensive there is: drawn last, the
   hidden ground is never shaded; `sky.groundUniforms` just before it) → **the sky in the
   picture** (`sky.afterGround`, in the clouds plan's order: the far cell sheets, the shells
   above the camera, the far low shell of `clouds.js`, the fog sheet and the lenses, the
   strokes' slot, the cloud volume's slices laid far to near, the shells below the camera)
   → **the weather scene** (`sky.drawWeather`: streaks, rainbow, pollen; the rain again in a
   slice of its own from the eye) → if the character is shown, the
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
| `src/sky/` | Far pass: `stars.js` (point sources), `sun.js`, `bodies.js` (the home globe from space wears the sky's field), `skyDome.js` (greyed under a closed deck). The sky and its clouds (see "The sky by rule" and the sections after it): `skySystem.js` (the sky's and the weather's order in the frame, the sky's frame handed to every part, every part's interface, the debug switches, the sky's governor savings), `skyField.js` (the field: snapshots uploaded in strips and blended on the GPU; `at()`, `cells()`, `strikes()` on the CPU), `skyGlsl.js` (the one shared shader rule for cloud cover, shapes and shade, its JS twins, and `SKY_UNIFORMS`, filled once a frame), `cloudVolume.js` (the volume near the traveller and the storm cells out to 200 km), `clouds.js` (the far low shell), `upperClouds.js` (the mid and high shells), `fogSheet.js`, `lenticulars.js`, `cloudShade.js` (the clouds' shade atlas fixed to the world, and the probe that lights the figure), `cloudNoiseData.js` and `cloudNoiseWorker.js` (the 64-cube noise). |
| `src/weather/` | The weather at the traveller (`weather.js`: on a made world the field's reader, on Earth its day's maps), `storm.js` (the storm overhead for the meter, the grade and the sky dome; the strokes' flicker), rain and snow streaks (`rain.js`), the strokes as ribbons (`bolt.js`), the rainbow (`rainbow.js`). |
| `src/weather/sky/` | The weather made by rule (docs/briefs/clouds-weather-plan.md). Pure JS for the worker, the page and Node: no three, no DOM, no `Math.random`, nothing of the traveller. `model.js` (the day's weather: moisture, heat, lift, the kinds of cloud, rain, wet ground, the ground wind, `at()`), `land.js` (the land as the weather needs it, the summits, the trigger sites), `systems.js` (lows with their fronts, highs, tropical waves), `cells.js` and `strikes.js` (storm cells and their lightning, closed forms), `cellShape.js` (a cell's and an anvil's shape in JS and GLSL), `steer.js` (each cloud layer's wind as a rigid turning of the sky, a closed form of the clock, and the low pattern's rise), `format.js` (the snapshot's layout, its encodings, its JS and GLSL decoders, `glslOnce`), `fromMaps.js` (Earth's field from its day's maps), `stub.js` (a test pattern with the model's API), `producer.js` (which of these makes a world's snapshots; the local solar hour), `skyWorker.js` (makes them off the page), `listClock.js` (the cells and anvils asked every frame, blended from moments 2 s apart). |
| `src/shadows/nearShadow.js` | The shadow atlas of the things standing on the ground (coarse, fine and character tiles) + its GLSL. On an airless world a shadow's soft edge is about a hundredth of the distance to its caster, so a figure's shadow needs millimetre texels. |
| `src/rocks/rocks.js` | Instanced rocks, scattered deterministically near the camera. |
| `src/ship/lander.js` | Procedural lander geometry, placement, material. |
| `src/hero/hero.js` / `heroModel.js` / `robe.js` | The character, a robed figure with long hair: how it moves and poses (`hero.js`), how it looks: body parts, colours, materials and shader (`heroModel.js`), and its simulated cloth (`robe.js`: the robe's skirt, the two wide sleeves and the hair, one draw call). |
| `src/hero/heroSculpt.js` / `heroPalette.js` / `heroFile.js` | The owner's sculpt drawn in place of the figure built in code: `public/data/hero.bin` (made by `scripts/make-hero.mjs`) read into two meshes (`heroFile.js`), each vertex carried by up to two of `Hero`'s rigid parts beside the torso and shifted by up to four of the cloth's particles; the sums are `heroPalette.js` (shared with the Node tools) and are done in the vertex shader from one float texture written once a frame and uploaded before the picture begins (`App.updateHero`). Only the outside is drawn. The shadow map draws the lighter mesh, which is in no scene. Without the file the old figure is drawn. |
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

From high up (from `SPACE_BOOST_FROM`, 1.2 km, fully above `SPACE_BOOST_ALT`, 150 km) chunks
split up to `SPLIT_SPACE_BOOST` (2.2) times sooner, by the square of the height's logarithm
between the two: fewer are in view the higher one is, and a phone has several pixels per
normal texel. The curve keeps about as many patches in view at every height as a view from
the ground has (110 to 150 at the canyon; without it 98, 73 and 56 at 3, 12 and 40 km).
(It began at 30 km: between 2 and 30 km up the ground under the traveller was a blur of
seven and more pixels a texel on the phone. The patch cap still rules: where the governor
has lowered it, `lodScale` takes the boost back.)

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

- **What the ground's shader pays for** (`terrainMaterial.js`; since the phone's ninth
  results, where its shading was the largest cost wherever ground shows: 17 to 18 ms a
  frame). Three rules. (1) *Nothing is worked out that is then weighted zero*: the close-up
  detail layers are read only where a pixel is narrow enough on the ground for them to
  show (beyond that the sampler would answer with the texture's last level, one number,
  `uDetailMean`; `DETAIL_LAST`), the world's colour map only where the ring's map does not
  cover the place whole, the strata only on rock, scree and bare bedrock, the list of
  elevation rasters (`demLog2Res`, an eight-step loop) only on patches coarse enough for
  the far relief, the flowers' fine noises only where a speck is larger than a pixel, the
  painted patches only where they have weight, Oren-Nayar only where the painted light is
  not all of it. (2) *What hardly changes over a triangle is asked at the vertices*: the
  Sun's light through the air above the place (`vSun`), the air between the eye and it
  (`vHazeT/L/G`, from `hazeAffine` in `lightingGlsl.js`: the same froxel lookup as
  `hazeOverGroundFull`, as three numbers a colour is put through; from space the air is
  still marched per pixel), and on patches up to 12.5 detail tiles across the cloud
  between the place and the Sun (`vCloud`, `cloudOver`: one rule for the vertices and the
  far pixels; the shade's clean edge is still cut per pixel). (3) *Footprints are taken
  before a branch* (`textureGrad`, or a level given outright), never inside one. The
  shader's vertex stage now reads 11 textures (a phone allows 16, and 32 for both stages:
  27 are used) and hands on 13 rows of varyings (of 15). `scripts/ground-cost.mjs` draws
  the ground alone with this shader and an earlier one side by side: what a change costs
  and whether the picture moved.
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
headless test. The terrain's fragment shader reads 15 of 16 (strata and detail; the world's
colour and slope maps and the colour ring of streamed tiles; the chunks' normal and shadow
layers; the sky-light texture, three aerial-perspective maps, two atmosphere tables, the
near shadow map; the clouds' shade atlas, `tCloudShade`, which since the sky's package C
stands where the day's cloud map and the cloud noise stood). Its vertex shader reads more
(vertices, morph, normals, the ring; the shade atlas and the field's wet map at the near
ground's vertices), which count apart. One more map fits in the ground's fragment shader;
after that a new one must take the place of one. The two sky-light tables share one texture
(`tIrradiance`: octahedral map, circumsolar row, and the level-ground sky light against the
Sun's height in row IRR+1, each pass drawing only its rows). `scripts/lib/glLimits.mjs`
checks every linked program against the OpenGL ES 3.0 minimums in `npm run smoke` and in
every screenshot run; a shader that fails on the device shows a message on screen and in
the benchmark results (`renderer.debug.onShaderError`).

## The painted look (`src/render/look.js`, a world's `look` block)

The owner's art direction since milestone 11 (`CLAUDE.md`, "Choices in force"). It is a
layer over the physical picture, not another renderer; a world without `look` is drawn
as before.

- **Air**: the world's own atmosphere numbers. Earth's `dust` is a low blue layer ten
  times a clear day's haze; every table follows (far ground fades to the sky's own
  horizon colour, a low Sun reddens through it).
- **Light** (`lightingGlsl.js`): `uPaint` (x amount, y the sky's light on things, z how
  clean colours are, w facets). `paintLit(nl)` is sunlight in two tones with a soft edge,
  used in place of the cosine by the ground, rocks, trees and grass; `skyLight` is
  stronger, more saturated and a little toward green-blue under the look (coloured
  shade); `paintColour` makes a surface colour cleaner and nearer the middle. On the
  ground the look fades out with `farW`: the globe keeps its round shading.
- **Grade** (`post.js`, the composite pass, after the tone map): saturation, contrast,
  and two tints (the dark half of the picture, the light half), from the look's `grade`
  keyed by the Sun's height (night below -10 degrees, dusk at -2, low at 8, day from 30).
  `Look.update` blends them every frame and fades the whole look to a third between
  40 km and 400 km of altitude.
- **The Sun's beams** (`post.js`, `uShaft`): ten steps from each pixel toward the Sun's
  place on screen through the half-size picture, counting only sky light (its alpha is
  how much of a place is lit ground). Trunks and crowns in the line cut the sum: shafts.
  They go with the bloom's governor step.
- **Shapes**: trees (`treeGeometry.js`) are built of flat faces: plates of boughs,
  tufts, cut lumps; their crowns carry a pattern of leaf bunches in three tones
  (`leafCells`, in the tree's own metres). Rocks are lit by their faces. Clouds are two
  octaves of puff with a clean edge and two tones.
- **Grass and flowers** (`life/grass.js`, rules in `life/grassRules.js`, `life/pollen.js`):
  grass has no end, and all of it is blades: opaque triangles, no cut-out anywhere. (The
  middle distance was cut-out cards once; on the phone they cost five times what every
  blade did, lying twenty deep over each other toward the horizon.)
  - *Rings* (`RINGS`): six lattices fixed to the ground that wrap round the camera, each
    coming in where the one inside it goes out: 96 x 96 cells 0.125 m apart with fourteen
    blades each (to 6 m), 125 x 125 at 0.32 m with twelve (to 20 m), 160 x 160 at 0.5 m
    with ten (to 39 m), 150 x 150 at 1 m with nine (to 74 m), 160 x 160 at 2.5 m with six
    (to 195 m), 220 x 220 at 5 m with four (to 545 m). A blade is one triangle; the farther
    the ring, the broader and taller it is (a thin leaf at one's feet, a tooth over half a
    metre wide at 300 m: the same mass in fewer pixels). The first three rings and the
    flowers are `fields` (they go with `grass.below`), the last three `clumps` (`grass.mid`).
  - *Thrown out early*: a blade outside its ring or outside the picture is thrown out of
    the picture after one table read (two blades in three of a field round the eye).
  - *No more layers than the eye can use*: along a line of sight at eye height a full
    field is twenty blades deep, and all but the front few are hidden. Each blade works out
    how deep the field is at its place seen from the eye (its ring's blade area over a
    square metre, by how squarely the ground is looked at) and beyond `LAYERS` deep (5)
    blades are left out one by one, each by a number of its own; an eighth of a field stays
    whatever the angle. From above, where nothing hides anything, every blade is drawn.
    This depends on where the eye is in the way a level of detail does: a blade is always
    the same blade at the same place, it only grows from nothing or shrinks to it.
  - *How thick*: where the land has grass it is all there (`dens`, full from an `AMOUNT`
    of 0.46); thin land is thin in tussocks half a metre across with bare ground between,
    the same tussocks in every ring.
  - *Lit once, not per pixel*: `GrassLight` (in `grass.js`) works the light out for a small
    table of places on the ground before the main picture is begun (after the shadow maps
    and the clouds' shade): for each ring 96 x 96 places over its stretch, three numbers
    each: the Sun's light there (its shadows, the clouds', the land's and the slope's own
    in it), the sky's, both already dimmed by the air between there and the eye, and the
    air's own light. One half-float picture 288 x 576. A blade's three corners read it at
    the blade's foot (`lightAt`: colour x (sun + sky x share) + air) and the fragment
    shader writes the colour it is handed: no texture is read per pixel of grass. The
    places are fixed to the ground (a stretch's middle moves in whole places), so a
    shadow's edge does not crawl. Blades and petals looked at toward the Sun glow (the
    light comes through them). Each third of the table (Sun, sky, air) is drawn by its own
    small program, and only the rows something drawn reads: none from some 220 m up to
    3 km, the clumps' alone from 90 m (`lightRows`; `node scripts/grass-light-test.mjs`).
  - *A place's grass is the place's*: which cell an instance draws, and every number a
    blade takes from its cell (place in the cell, height, lean, its tussock), is counted
    from where the grass began, never from the anchor: with a grass saving on, the half of
    the field that stays is the same half after every anchor step, and nothing changes at
    the 2 560 m line where the anchor's place wraps. Lattices with an odd count of cells are
    offset by whole cells (`HALF`), so no blade's cell is read on its edge.
    `node scripts/grass-place-test.mjs` replays the shader's own lines across steps.
    A thinned field keeps cells by a rule of the cell's own number (`keptCell`).
  - *Only what could be drawn is handed over* (`life/grassBlocks.js`): a field is a window
    of cells round the eye, cut into 12 x 12 blocks; each frame, once the camera is final
    (`Grass.cull`, called from the frame just before the near scene is drawn), a block is
    handed to the GPU only if the shader's own early tests (the ring's distances, `outside`
    with the field's reach, grass or a flower in the ground table) could pass for some foot
    in it: asked of a box that holds every place the shader could ask them of, so the
    picture is the same. The blocks' numbers go to the shader as `uBlocks`, the instances
    are dealt to them in turn. Whoever draws the grass without calling `cull` draws every
    block. `node scripts/grass-blocks-test.mjs` replays the shader's tests cell by cell.
  - *Flowers* (`KINDS`, `FLORAS` in `grassRules.js`): twenty-six kinds in six habits: turf
    (tiny heads among the blades), cup (petals round a middle: daisies to poppies and the
    big single heads), spike (florets up a tall stem), umbel (a flat-topped spray), globe
    (a ball of florets; a dandelion's clock), cushion (a low mound on the ground). One
    vertex shader shapes them all from a kind's row of numbers. Two lattices of single
    plants: 100 x 100 at 0.32 m with leaves and fourteen petals (to 15 m), 128 x 128 at
    0.8 m with six (to 50 m); beyond, some blades of the far rings are stalks in flower
    (their upper part the kind's colour), and the ground has its dusting. The far blades
    come into flower over 38 to 50 m as the single flowers go out over the same stretch
    (one stretch, `HANDOVER`), each blade by a soft edge of its own: no circle, no blade
    switching whole between frames (`node scripts/grass-flowers-pixels-test.mjs`).
  - *Which flowers where*: a world's `life.flowers` (floras by name for each land-cover
    class, and rules by height, latitude or the tree line; without one, `DEFAULT_FLOWERS`)
    gives the flora of a place (`floraAt`); `flowersAt` (JavaScript, and the same in GLSL
    for the ground's dusting) gives what flowers there and how thickly: flower meadows
    some hundreds of metres across (a share of the land the flora names) where one kind
    after another leads a patch of a hectare and two companions of other habits and heights
    (the flora's `with`) stand among it in clumps some metres across, pooling into drifts of
    their own (`COMPANY`); plain grass between with a drift here and there, and on some
    hillsides one kind over the whole slope with companions toward its edges (the ground
    passes its own slope, and its two broad noises from its vertices within 1 000 m; beyond,
    a pixel asks them itself). The ground's dusting is `flowerTint`: the mean colour of what
    flowers at a place as wide as the pixel (the companions' and the fine drifts' shares by
    their means where a pixel cannot tell them), so a meadow from the air is soft drifts of
    its colours to 2.5 km, never specks; the far blades' flowers fade as they are looked
    down on. A bloom is a thing in space: every part two triangles (a stem ribbon at least
    a pixel wide, kite petals), a cup a shallow bowl facing up, tilted its own way and a
    little toward the Sun (seen from the side as a bowl), spikes, umbels and globes set in
    the ground's axes, each part lit by how it faces the Sun; only the tiny turf heads are
    turned partly to the eye.
    `node scripts/flower-field.mjs` draws the rule from above without a browser;
    `node scripts/flower-preview.mjs` takes every kind side by side in the real game.
  - *Pollen* (`life/pollen.js`): 3 200 points, half in a box of air 10 m wide round the eye and
    half in one 40 m wide, up to 6 m high, that go with the traveller, each a place of its own fixed to the ground and carried by
    the wind (added up frame by frame), wrapped as one point. A mote shows where the
    ground under it flowers (the grass's middle table), in daylight and dry air, more
    after a gust; it is lit from the grass's light table and throws the Sun's light
    forward (a glint looked at toward the Sun). One in twenty-two is a floating seed. Drawn
    with the weather, and again in a slice of its own near the eye when the terrain's
    near plane has moved past it.
  - *The ground's own grass* (`terrainMaterial.js`, the block at `uGrassTone`): gentle
    ground takes the grass's colour to 600 m and fades to the map's by 2.5 km, with the
    wind's waves running over it (`uGrassWave`, the same waves the blades bow to) and the
    flowers' drifts as a dusting (the same rule, in GLSL: no texture read).
  A blade is its lattice number and a hash, nothing is kept per blade; instances are drawn
  in a scrambled order, so a share is a count. The ground under them is three
  tables kept on the CPU that wrap (64 x 64 at 1.25 m, 128 x 128 at 4 m, 128 x 128 at
  10 m; nearest places first, 300 a frame, all at once in screenshot mode), float textures
  sent between frames: height, how much grass, how dry, and the flowers there (whole part:
  which kind; fraction: how many). Everything stands on a plane (the anchor)
  that lies on the ground's own sphere under the traveller, never at the traveller's
  height (places are worked out along lines from the world's centre and drawn at plain
  metres: with the plane 1 km over the ground the whole field slid 0.8 m aside at every
  step on Haven; `scripts/grass-anchor-replay.mjs`), and that moves in whole steps of
  40 m when the traveller is 60 m from it, its axes carried along;
  every spacing divides 40 m, so no blade, table entry or pattern changes at a step, and
  the shaders take off the world's curve (0.7 m at 600 m on Haven). `grassRules.js` holds
  what the grass and the ground must agree on, once: `AMOUNT`, `DRY`, the kinds and
  floras, `flowersAt` in JavaScript and the same in GLSL, the grass's colour, the waves.
  `uGrassTone`: x mean dryness, y the share of the ground round the traveller that is
  grass, z the flora, w strength. By height the three near rings and the flowers go between
  45 and 90 m over the ground and the three far rings between 121 and 220 m
  (`grass.below`, `grass.mid` in a world's file). Governor: `pollen` thins the motes,
  `grass-mid` halves the three far rings and widens the blades left; `grass` halves
  the three near rings and the flowers.
  On slopes grass stands by ONE rule, `GRASS_GROUND.slope` in `grassRules.js` (all of it
  to 0.45, none by 0.75): the tables' amount fades by it and the ground's shader lays the
  grass's colour by the same numbers, so that no tuft stands on unpainted ground and no
  steep meadow is bare. The far grass takes the clouds' shadow from the clouds' shade atlas
  (`sky/cloudShade.js`, see "The clouds' shade") and the land's cast shadow from a table of its own (`tLandShade`:
  36 x 36 places 40 m apart round the anchor, one worker job when the traveller has moved
  120 m, the Sun 1.5 degrees or the maps have changed), both eased in between 30 and
  120 m; near the eye the near shadow map. A far blade whose ground is looked at squarely
  (against the world's up or its own slope's normal) from beyond 40 to 90 m is not drawn:
  the ground wears the grass there.
- **The land from the air** (painted look): the tile worker draws each pixel of the colour
  ring part of the way to a clean colour of its land-cover class (`cover.paint`,
  `cover.colours` in the world file; classes not listed keep the satellite's colour).
  The ground shader adds stretches of lighter and darker ground with clean edges (two
  looks at the detail texture's fourth channel at 2.9 km and 780 m repeats, by the
  direction's longitude and latitude: whole repeats round the globe), and lays the
  grass's own colour on gentle ground (see "Grass and flowers").
- **Tree shapes** (`life/treeGeometry.js`; `scripts/tree-preview.mjs` draws them all):
  eight shapes, each built three times over with other proportions (`VARIANTS`), each at
  three distances: close (within 42 m), near (115 m), far. Trunk and limbs are tubes; the
  foliage is flat cards, each showing a spray cut out of **the trees' picture**
  (`public/data/tree_atlas.png`, drawn by rule in `life/treeAtlasGen.js`, laid out in
  `life/treeAtlasLayout.js`, written by `scripts/make-tree-atlas.mjs`: three bytes a
  pixel, cover, tone, wood). `aUv` says where in the picture (-1: a plain face); `aLeaf`:
  0 wood, 1 and 2 plain leaves (a palm's fronds), 3 a card of foliage, 4 a whole tree's
  card. A card's normals are not its own: every corner is given the direction from the
  crown's middle and from its bunch's middle, so the crown is lit as one round mass. The
  far mesh is the tree's own silhouette on two crossed cards (the picture holds every
  shape and variant seen whole, rasterised from the near mesh) and a rosette lying in the
  crown: six triangles. The fragment shader cuts a card out before anything else
  (`discard` under 0.42 cover, less far off, where averaging thins needles), takes each
  needle's and leaf's tone from the picture, and adds light through the foliage when the
  view is toward the Sun; the shadow pass cuts the same way. After changing a spray or a
  shape, run `make-tree-atlas` again (the whole trees are drawn from the meshes).
  `life/leaves.js` sheds leaves in their season, in a gale (from every tree) and when
  the traveller passes trees fast.

**Seen from above** (two things of the look that are right on the ground and wrong from
the air):
- `uHaze` (`look.js`, `look.spaceHaze`, default 0.45): how much of the haze lies over what
  is seen. 1 up to 2.5 km, down to 0.45 from 25 km: `hazeOverGround` mixes its result
  back toward the unhazed colour by it, and `forestAir` is gone by half of it. The look's
  low air is five times a clear day's; looked through whole from above it was a milky
  veil, and from orbit the home world was a pale ball.
- **The relief light** (`look.reliefLight`, `uAirRelief` in the ground shader): ground more
  than 1.5 km off (in full by 9 km) is lit, for its slopes, by a Sun no higher than 35
  degrees from the real Sun's side; level ground keeps the brightness the real Sun gives
  it. Under a high Sun the two-tone light puts every slope in the light and the land was
  as flat as a carpet from the air. Nothing changes while the Sun is under 35 degrees.

## Ground ready ahead of the traveller

- `Terrain.update` works out a place ahead: three seconds along the traveller's velocity
  (from the camera's own movement, smoothed; kept above the ground), or `terrain.dest`
  (set by the app during a GO trip to a place: the point over the place where the trip
  ends). `_preload(node)` is called for every drawn patch the camera did not split: if
  the place ahead would split it, its children are asked for (priority 500 and up: after
  all the camera needs, before ground out of view) and, once loaded, visited the same
  way. They are kept alive (`lastVisit`), kept up to date with the maps (`drawnAt`) and
  **not drawn**: the camera's own rule decides what is drawn. Running out of patch slots
  for them does not count as stalling.
- `TileRings.update(pos, altitude, vel, dest)`: a new mosaic is centred up to half a tile
  ahead along the way and asked for when the place twelve seconds ahead nears the edge;
  with `dest`, a ring not in use under the traveller (too high for it, or outside it)
  fetches the destination's mosaic and waits there.

## Map tiles round the traveller (a streamed world)

A world file may list `terrain.tiles`: services of 256-pixel Web Mercator tiles (the
layout every map service uses). `terrain/tiles/tileRings.js` keeps a few square mosaics
of them (4 x 4 tiles, a "ring" each) centred on the traveller and asks the tile worker
(`tileWorker.js`: fetch, decode, assemble, off the main thread) for a new one when the
traveller comes within a tile of a ring's edge. Too high (`below`) or too fast for a
ring: it is not asked for.

- **Elevation rings** (coarsest first) go to `DemSet.setRing` on the main thread and in
  every chunk worker: Mercator rasters over the bundled ones, finest last, each with a
  feathered edge 40 pixels wide. `topAt` counts a ring's tallest ground wherever the
  ring, widened by the shadow range, is.
- **Ground built from older data is built again** (`Terrain._refresh`): a ring's arrival
  is a region with a serial; a patch is stale if it touches the old or new box and is
  not well inside both (the same heights) or well inside a finer ring that was already
  there (and if it was built before the oldest region still remembered). Three rules
  keep this from flooding a phone: it waits until no elevation is on its way (ten
  seconds at most), so a place's three rings cost one rebuild, not three; only patches
  that are drawn, and their parents, are built again (the rest stay stale until they
  are drawn); and the new builds go to the GPU in bursts, up to sixteen twice a second
  (`_uploadRefresh`), because on a phone the cost of taking in ground is the frame's,
  not the patch's. While elevation is on its way for a place that has none (the start, a
  jump, the end of a fast trip: `TileRings.catchingUp`, five seconds at most), only
  coarse patches are built.
- **Picture rings** (the land's colour) become one texture with mip maps made in the
  worker; the ground shader reads it by longitude and `atanh(sin(latitude))` and lays it
  over the global colour map with a soft edge.
- **Coastal water**: radar elevation leaves the sea at exactly zero near land. The worker
  gives every water pixel a bed that falls away from the nearest land (a chamfer distance
  transform), so there is a depth for the sea to be drawn and swum by.
- **Tests**: the headless browser cannot reach the services. `scripts/lib/browser.mjs`
  mirrors them at `/__ext/<host>/<path>` from a cache on disk (`/root/mapcache/ext`,
  filled with curl on a miss) and tells the page through `window.__EXT`.
- Without the services (no connection, Node scripts) the bundled maps are all there is.
- **A picture's zoom follows the height** (`pictures.colour.zooms: [[zoom, up to (m)], ...]`,
  finest first): the same four tiles a side, coarser and so wider the higher the
  traveller is (Earth: 600 m a pixel over 600 km below 125 km, to 10 km a pixel over
  10 000 km below 2 000 km). The zoom in use is kept until the height is a seventh past
  its range; a trip's destination is asked for at the finest. Land cover and canopy come
  at the same zoom.

## A made world (`haven`, milestone 12)

A world whose maps are made by rule instead of measured. In the game it is built exactly
as Earth is; what differs is where the maps come from.

- **Made beforehand** (`scripts/make-world.mjs`, from a seed, a minute in Node; nothing of
  it runs in the game): the land before water from a handful of slow noise fields on the
  sphere (continents, mountain belts with ridged crests, tablelands at a few levels,
  hollows; the caps are sea, since the mosaics are Mercator), then **the solve**: the land
  is flooded from the coast inward (priority-flood) so that every cell has a way down,
  the water that drains through each cell is added up, and along every way down the land
  may stand no higher above the water below it than a river of that size keeps its bed
  (`slope = KS x hardness / drained^0.45`, never steeper than the rock stands; tablelands
  are harder: canyons with walls). Where the land is lower already it is left: valleys and
  canyons are cut, plains and hollows stay. Five rounds. The largest and deepest hollows
  left are lakes at the level of their lips (at most 254: a byte a cell says which), the
  rest are filled with land. Output: `haven_dem_4096.i16`, `haven_lakes_4096.png` and
  `.json`, `haven_rain_720.u8`. `scripts/make-world-maps.mjs` then makes the colour, slope,
  water and cloud maps (PNG to JPEG through Python's PIL).
- **The land rule** (`terrain/tiles/madeLand.js`, `landAt`): colour from the air,
  land-cover class (the IGBP numbers the trees and grass read) and canopy from height,
  slope, latitude, the year's rain and two noises. One rule for the maps made beforehand
  and the mosaics made in the game.
- **In the game** (`terrain.tiles.made` in the world file; `tiles/madeTiles.js` in the tile
  worker): the same rings as Earth's, made instead of fetched. The **ground** is the
  bundled map (cubic B-spline) plus the height layers at any fineness, so an elevation
  ring brings **water only** (`waterOnly`: `DemSet._ringWater`; ground is rebuilt only
  where a ring has water): the hydrology runs on the bundled map sampled at the ring's
  cells, with the world's own lakes given to it (`opts.lakes`: level stretches are not
  looked for, a made land has none). The **picture** ring is `landAt` at every pixel:
  colour, class, canopy.
- **What had assumed Earth's size**: tree blocks were 0.001 degrees (111 m on Earth, 4 m
  on Haven): now 111 m on a world of any radius (`blockDeg`); the tile worker's metres per
  pixel; the tree line and the choice of species by continent (`world.life.trees.line`,
  `world.life.flora`); the exposure's idea of when a globe is the subject
  (`exposure.coverFrom`: a small world is a small disc from not far off).
- **Its place in the sky**: `haven` and its moon `mira` in the catalogue, marked `made`
  (the check against JPL leaves them alone): Earth's orbit half a year on, Earth's day
  and tilt, the same Sun.

## Water

- The `sea` layer says where water is: with an elevation map, wherever the map is at or
  below the level; the layers before it fade out toward the shore. It reports the depth
  (`hs.waterDepth` after `height()`).
- The chunk builder writes `1 + depth` into the normal map's fourth number on water (on
  land that number is cavity shading, 0 to 1): the shoreline is where it crosses 1, per
  pixel.
- `water/waves.js`: one table of sines, each a whole number of cycles across the 64 m
  detail tile, running at deep-water speed, weighted by how it lines up with the wind.
  The shader adds as many as are longer than five pixels; the eight longest also lift
  the surface itself within 400 m (vertex shader; no governor step: on the phone it saved nothing measurable); the game asks
  the same sum for what floats (`waveHeightAt`).
- Colour: light goes down to the bed and back, red lost first (pale sand in the shallows,
  the water's own blue below); foam at the waterline, in bands along the bed's contours,
  and on crests in a strong wind.
- A walker sinks to the bed or to 1.25 m, whichever comes first, rides the waves where it
  floats, and is slowed (`App.heightFn`, `rig.water`).
- **Rivers and lakes** (`terrain/tiles/hydrology.js`, run in the tile worker on every
  elevation mosaic of a world that lists `tiles.hydrology`): priority-flood from the sea
  and from the stretches of the mosaic's edge where the coarser mosaic says the land
  outside is downhill (elsewhere the edge is a wall); steepest way down on the filled
  land; each cell sheds its rain less what the air takes back (`runoff`, from the bundled
  yearly rainfall map), added up downstream into a mean flow. A river that crosses into
  the mosaic (a coarse cell outside draining to one inside) puts its flow in at the lowest
  ground near the crossing. Rivers are traced as smoothed lines with a width and a depth from the flow
  (`riverWidth`, `riverDepth`) and a level that never rises on the way down and stays as
  near the ground along the way as that allows (a least-squares fit, standing above the
  ground counted six times as dear as cutting into it; a lake's surface, the sea's and
  the river it joins are met exactly). On the finest ring that is within a few metres of
  the ground; on the coarse ones a river crossing a hollow the flood filled can stand
  tens of metres off.
  **Lakes are read from the elevation, not made by the flood**: every real lake lies in
  the elevation set as a stretch of exactly level cells (checked on fourteen lakes at
  three zooms), while a pit only the flood fills is nearly always a valley whose gorge is
  narrower than a cell. A level stretch is a lake if it has enough middle (cells with all
  eight neighbours level), lies in a hollow (few of the cells three out from its rim are
  lower), does not touch the sea, and can be kept full: the flow that reaches it against
  what open water loses to the air (`evaporation`), which leaves dry lake beds dry. Large
  ones are settled by the bundled water map (`tiles.hydrology.water`, the globe's glint
  map): seen as open water is a lake whatever its rim, a plain as level as a lake is land.
  A stretch a metre or two lower that touches a higher one is the same lake (a great
  lake's surface is not one whole number all over); ground beside a lake that is lower
  than its water and cannot drain is under it; cells under sea level that the sea does
  not reach (`inland`) are a lake's bed where one lies round them, and the `sea` layer
  gives a lake's water the say over the sea's. A filled pit counts only on the finest
  ring, shallow and in wet country (a pond). Bad cells are mended first: spikes
  (`despike`: a cell more than four cell-widths off the middle of its nine) and holes (a
  few cells under sea level deep inland). `npm run lakes` runs all of this in Node on
  nine regions and compares with the real lakes.
  `packWater` turns them into arrays for the height code: stretches of river with a grid
  to find them, a raster of lake levels, lake beds cut into the mosaic.
  `DemSet._water` answers from the finest ring at a place; the `sea` layer makes the
  water (level, depth) and brings the banks down to it. Each ring draws rivers from its
  own `minFlow` up: the great rivers from far, every brook from near.
- Inland water has small waves and little foam (the shader knows it by its height above
  the sea).
- **Far off, in wind**, where no single crest is seen, the share of the sea that is white
  in that wind (Monahan's rule, at most 45 %) is laid on in streaks: a gale's sea is
  grey-white to the horizon. **The beach**: ground less than a step above the sea's level
  is pale dry sand.
- **The tide** (`sea.tide: { by: [[body, metres], ...], gain }`, `App.updateTide`): each
  body named raises the sea by `metres x (1.5 cos^2 - 0.5)` of the angle between it and the
  traveller's zenith (the equilibrium tide: two bulges a day, springs and neaps as the Moon
  and the Sun line up or cross), times `gain` (a shore's own amplification). The shore is
  mapped at high water: the level is counted downward from there (`uTide.x`, 0 to about
  -2 x the sum x gain). The vertex shader lowers the sea's surface by it near the
  traveller (out to 1 km, fading from 400 m; only vertices near the sea's level ask), and
  where the water was shallower than the drop the bed is drawn bare at its own depth; the
  fragment shader draws that bed as wet sand, and at the water's edge a wash that runs up
  and back with the swell. Lakes and rivers have none (by their height above the sea).
  The character floats and wades by the same level (`heightFn` in `app.js`). The full
  read-out shows the tide.

## Trees and leaves (`src/life/`)

- **What grows where** comes with the colour ring (terrain/tiles): the tile worker also
  fetches land-cover classes (MODIS, IGBP legend) and canopy heights (GEDI) for the same
  mosaic, turns their colours back into numbers with a palette file, and returns a class
  and a height for every pixel. The picture's fourth channel carries the canopy's height
  as a whole (height x how closed the class is, 0.2 m a step).
- **`cover.js`** (plain data): how closed each class is, and `speciesFor(class, lat, lon,
  altitude, beside water)`: the region's own trees as weighted lists (64 species, eight
  shapes). A canopy measured taller than 8 m is forest whatever the class says.
- **`treeBlock.js`** (in the terrain workers, job `trees`): the trees of a block of 0.001
  degrees: a jittered site every 7 m, taken by the class's chance, less on slopes, never
  in water or above the tree line; beside rivers and lakes the trees that follow water.
- **`trees.js`**: keeps the blocks within `radius` (240 m) of the traveller, asks for the
  nearest missing one when a worker is idle, and builds instance lists: one mesh per
  shape and make (`treeGeometry.js`: the close make, a skeleton of tapering limbs and
  twigs with sprays at their ends, to 20 m; the near make, bunches of larger sprays, to
  60 m; two crossed cards beyond), all measured from an anchor at the traveller. The whole
  list is made every 25 m of travel; the close and near lists are chosen again by each
  tree's distance from the eye every few metres (`treeLod.js`, `fineStep`: a quarter of
  the close radius, never more often than a fifth of a second of travel), and a tree's far
  card inside the near radius is cut in the vertex shader, so no tree near the eye is ever
  given a coarser make than its distance asks (`node scripts/trees-near-test.mjs`;
  `node scripts/tree-build-cost.mjs` times a making). Beyond the radius a tree is thrown
  out of the picture, the far forest's to draw. Bark is a rule on each tube's own
  coordinates, filtered to its mean where a furrow is smaller than a pixel; the shadow
  pass draws a tree's cards whole whatever the eye's angle (a shadow is the tree seen
  from the Sun). A species with `blossom` flowers by the date (`bloomOf` in `cover.js`);
  out of flower its petal texels are leaves, near and far alike. One material:
  the shared lighting, light wrapped round and through crowns, shadows asked for a
  little outside the crown; wind (lean and swing by height and distance from the trunk);
  the seasons (each tree its own: see "The year" just below). Crowns cast flecked shadows (their depth pass drops four
  pixels in ten).
- **The year** (`life/season.js`; `scripts/season-test.mjs` holds it to its promises).
  One place says what time of year it is and what a tree's leaves are doing, and nothing
  that draws works any of it out for itself.
  - *The calendar*: 365.25 life days, counted as in the northern half of a world (day 80
    the spring equinox, the south half a year on); species say when they flower and what
    colours they turn (`cover.js`). A world's file says how fast it runs: none (Earth: the
    date itself), or `year: { days, at: [date, lifeDay] }` (Haven: 48 days; its scene's
    morning is day 265, the first of spring at the opening place). `app.lifeDay` is the
    day now; the Sun is not on this year (it stays on its orbit).
  - *A tree* (`treeSeason(species, day, lat, alt, own)`): buds on day 87 + half its
    winter's hardness, pale green; turns from day 262 less the hardness, through yellow to
    its species' two colours (a tree between them by its own number), dulls and drops its
    leaves over the 16th to 48th day of that; `hardness` is 8 days a kilometre up and one a
    degree toward the pole from 45; between 25 and 38 degrees the season fades out;
    evergreens answer their own green.
  - *Handed over* by `cover.js` `treeLook` (the colour in steps of 0.75 / 255, the leaves
    gone in 31 steps, how far in flower): the near trees put it in each tree's `iC` and
    `iB.w`, the far forest packs the same into `iC.y` and beside the tree's own number in
    `iB.w`; both ask with the whole life day (`trees.seasonDay`), and tiles with such trees
    are filled again when it changes. Leaves gone: plain leaf masses draw in and vanish
    past the half, a spray loses leaves one by one, a whole tree's picture (near from 60 m,
    and the far forest) loses clumps (`TREE_THIN`, blocks of texels that double with the
    distance). `paintLeaf` and `farGreen` leave a leaf with more red than green alone.
  - *The ground's far canopy* reads `uCanopyYear` (eight entries by height from
    `cover.js` `canopyYear`: the mean colour of the leaf-dropping trees of the wood at that
    height on the day, bare ones as branches, and the noise level that makes their
    patches their share of the wood), moved by each pixel's own latitude.
  - *Going to a season*: `untilSeason` (whole days forward); the menu's Season row and
    `?season=`.
- **Beyond the trees** the ground shader raises the forest as a whole: the vertex shader
  lifts the ground by the canopy's height (uneven as crowns are; not on rock faces or
  water) from 0.8 to 1.25 of the trees' radius outward, or everywhere from above 1 500 m;
  the fragment shader shades it as leaves. Under the trees the ground is grass in the
  open, litter and leaf-filtered light under a closed canopy, fallen leaves in season.
- **`leaves.js`**: 420 points that come loose overhead, ride the wind down turning, and
  lie a moment; worked out in the vertex shader from a number of their own and the
  clock; they stay put in the world as the camera moves.
  Its `Petals`: points that come off the nearest trees in flower in gusts and ride the
  wind, and lie under them on the ground as drawn; each slot keeps its tree and each
  lying petal its place in the world when the lists are made again (only rebased to the
  new anchor), and a tree that joins the list takes its share of slots.
- **What casts a tree's shadow** is the next simpler mesh of the same tree (`set.cast`):
  the nearest trees cast as their near mesh, the others as their far mesh (two crossed
  pictures of the tree and a rosette in its crown, 6 triangles). A whole tree's card keeps
  its leaves in winter, so a bare tree's shadow is thinned in the depth pass instead.
- **A crown's dark inside.** Sprays alone are a lace one sees through. Every bunch of
  sprays has a **heart** (`Shape.heart`: three crossed cards of a rosette, `aLeaf` 3.25,
  drawn at half tone and taking no light through), and every tier of a fir a **skirt**
  under its boughs (plain faces, 1.25). The whole-tree picture is drawn from the near mesh
  and so has them. `paintLeaf` (the painted look's green) keeps a species' own side of
  green: warm for broad leaves, cold for firs and spruces. Trunks near by have furrows.
- **The air of a wood** (`forestAir` in the lighting chunk): trees, the forest's floor and
  the far canopy are mixed toward the sky's light by distance (to 38 % by some hundreds of
  metres): row behind row of trees paler, and the far forest lighter than the near.
- **The far forest** (`farForest.js`, `life.trees.far: { full, radius, below }`): beyond the
  trees one walks among, **the same trees**, at the same places, thinned with distance, out
  to `radius` (5.6 km on Haven and Earth). Each is the picture of a whole tree on two
  crossed quads with a rosette in its crown (what a far mesh is; the shape is a number of
  the instance's own and where each picture is in the atlas is read off the far meshes).
  - **Rank.** Every tree site has one (`treeBlock.js`, `siteRank`): a hash of the site
    alone, 0..1, of nothing else — not of the chance its class gives it, its species or its
    shape. A **band** of ranks can therefore be asked for on its own, and a thinner band is
    a subset of a thicker one, at the very same places.
  - **How many stand at a distance.** `keep(d) = (full / d)^2`, capped at 1: full density
    out to `full` (450 m), then thinner and thinner. A tree is drawn when its rank is under
    `keep` at its own distance from the eye, and **grows in** from nothing as that distance
    closes, so none pops. The thinned ones stand up to 1.5 times wider (`keep^-0.25`), so a
    wood keeps its cover; beyond that the canopy the ground shader raises carries it.
  - **Tiles.** `treeTile` works out a square of tree blocks in one worker job (`treeTile`
    in the terrain workers), one band of ranks of it. Level 0 asks for the thickest band
    (a quarter of the sites and up) over 8 x 8 blocks (889 m); each level after it asks for
    a quarter of that band over twice the side, and is drawn twice as far out, so every
    distance costs about the same number of tiles and of trees. Four levels: 889 m to
    7.1 km, ranks 1 down to 1/64. Each tile is one instanced mesh from a **fixed pool**
    (40 tiles, 6 144 trees each), filled when it arrives and again, from the same data,
    when the traveller has come a tenth of the way nearer to it. A fill tests **each tree
    by its own distance** and keeps half as many again as stand (by the tile's nearest
    corner instead, a tile 889 m across handed the GPU four times the trees it drew).
    Nothing is worked out per tree per frame. The mesh is put where its tile stands so that three culls it against the view
    and sorts the tiles front to back; the vertices themselves come from the tile's own
    uniform, camera-relative.
  - **The join.** Inside the near trees' radius nothing of the far forest is drawn, and
    beyond it `trees.js` draws nothing: a clean cut by distance from the eye in both
    shaders, on the same tree, with the same picture, size, turn, season and colours (the
    far forest's fragment shader is the card path of the near trees' own, and leaf and bark
    colours are packed over their real range so the two cannot differ at the line).
  - **The land's shadow.** Far trees are beyond every shadow map. The tile job asks the
    shadow baker (`baker.visibility`) on a 20 x 20 grid over the tile at crown height and
    each tree carries what it reads off between the grid's points (in `iC.w`, with its
    autumn); a tile is asked for again when the Sun has moved a degree and a half. The
    near trees get theirs from their block's job, tree by tree (`landShadow` in the worker,
    `iD.w`): a grid over a block on a rim put the cliff's shade on the trees above it.
  - **The clouds' shadow** on near and far trees is read from the clouds' shade atlas
    (`sky/cloudShade.js`, see "The clouds' shade"), once per vertex, where the Sun's ray
    through the crown meets the atlas's sphere. `life/treeShade.js` only hands on the names
    the trees read it by (`TREE_SHADE_VERT`, `TREE_SHADE_UNIFORMS`). Its own map, a level
    plane re-centred on the traveller every frame, is gone: a tree at a shadow's edge
    changed by up to 0.44 in light as one walked. One writer for the ground, the trees,
    the grass and the rocks.
  - **The far green.** From 300 m to 1.3 km a far tree's leaf colour goes over to a dark
    warm olive of the same brightness and its share of the sky's light loses most of its
    blue; the wood's own air (`forestAir`) fades out between 300 m and 1 km, where the
    air itself takes over. The rule: a far tree is never bluer or paler than the ground
    behind it. All of it is nothing at the join, where the near trees' numbers hold.
  - **Seen from above** (`life/farTreeForm.js`: the rule, in GLSL for the vertex shader and
    in JavaScript for the sketch and the test). A far tree is three quads: two crossed
    upright pictures and a rosette lying in its crown. Looked down on, the upright ones are
    on edge. So by the sine of the angle a tree is looked down at (`down`), everything
    blended and nothing switched, and nothing at all below 17 degrees (the view from the
    ground is as it was):
    - the rosette is the crown's top: lit as a dome that faces the sky (by the rule the cards
      share with the near trees, a rosette under the middle height of its crown faces the
      ground, and from above every fir was a dark disc the Sun did nothing to; the dome comes
      in over the 200 m beyond the near trees' line, where nothing may differ), and **spread**
      where the trees are thinned, by keep^-(1/4 + 0.17) against the keep^-1/4 (at most 1.5)
      of the view from the side, at most 8 crown widths, and **only in a closed wood**: each
      tree carries the chance its site had of a tree (`treeBlock.js`, the tenth float; beside
      its rank in `iC.x`), and a lone tree on open ground stays its own size;
    - **the tree's shadow** is a fourth quad, handed over only for a traveller in the air
      (from 60 m up; `setDrawRange`, two triangles a tree more there): the picture of the
      whole tree laid on the ground along the Sun's ray, the tree's own outline, up to five
      heights long, coming in from 17 to 30 degrees of looking down. It takes a share of
      what is drawn under it (the material blends by alpha: a tree writes 1, a shadow its
      share; `uShadow.x` brings it in between 60 and 160 m up, and the governor's step
      `tree-shadows` takes it away). One tree's alone takes half; where several lie over
      one another at a wood's edge each is so much lighter that the lot come to half. None
      from a tree in the land's or a cloud's shadow, none on ground the Sun does not reach
      by its slope (the tile job hands that over with the land's shadow:
      `treeLandShade.js`, `lit`), none beyond 4.2 km. Under the canopy the ground raises
      they are hidden, which is right: they are for trees on open ground. The shadows are
      a draw of their own per tile (after the ground, before the far trees; no depth
      written, so overlapping shadows darken together and never hide a tree's foot), their
      strength set by the eye's height over the tile's lowest tree and eased over 0.8 s
      (`tileShadow`; it once followed the ground under the traveller and popped at every
      rim), and a tile's bounds take in its shadows;
    - the upright pictures draw in to nothing from 49 to 68 degrees (steeper, they are
      bright slivers beside the crown's top, and from straight above a cross on it);
    - the forest's end: seen from above its trees draw in over the last two fifths of its
      reach (the last seventh from the side), so that it has no edge on the land below.
    On the ground no more triangles than before (6 a tree) and no more instances; in the
    air 8 a tree.
  - **The land's shadow, the grid**: 20 points a side over the smallest tile and finer by
    half for each size up (20, 28, 40, 57): 20 over a tile of 7 km was a point every 370 m.
    `scripts/far-tree-shade-test.mjs` compares the grid with a ray from every tree.
  - Drawn after the ground: the raised canopy hides a far tree's lower part for nothing and
    its crown stands out of it. Governor step `far-trees`: it **thins** them (the widening
    goes with it, so a wood is still a wood) and shortens their reach, never removes them.
    The cost test leaves them out as a part. `window.__stats.farTrees` says how many stand
    in the picture and how many instances the tiles hand the GPU (some are thrown out in
    the vertex shader as too thin for their distance).
- **The canopy's crowns** (`crowns()` in the ground shader): the raised forest is shaded as
  domes side by side, 8 m apart (and the stands they grow in, 21 m): each tilts the
  surface outward from its middle, is lighter on top and dark in the gaps, and has a green
  of its own; a jittered lattice with a whole number of cells across the detail tile, and
  different in every tile of a block 16 tiles a side (`DETAIL_PERIOD`: a patch's tile
  coordinates are kept modulo 16 tiles, 1 km; with the same 64 crowns in every tile the
  forest was a cloth woven in squares from the air). They
  fade out as a crown nears a pixel and a half. With the relief light this is what makes
  a forest a forest from the air, where it was one even green.
- The canopy stands on slopes up to about 28 degrees and is gone by 40 (the trees' own
  rule is 27 to 43: `treeBlock.js`), judged over some tens of metres and never over a
  whole patch at once.
- **Beyond the trees** the canopy is up to its height where the last trees stand (0.62 to
  0.98 of the radius; the trees shrink away from 0.86), and its normal leans toward the
  eye by how far from overhead one looks: the canopy shows the sides of its crowns, lit
  with the Sun behind the eye and dark against it, as the trees drawn one by one are.
- Governor steps: `leaves`, `tree-shadows` (the far meshes stop casting), `trees-far`
  (two thirds of the radius), `far-trees` (the far forest thinned).

## Rocks as far as they can be seen (`src/rocks/`)

Two kinds, drawn together:

- **The stones underfoot** (`rocks.js`, `surface.rocks`): 300 within 110 m of the
  traveller, scattered by a lattice round the camera, shrinking away at its edge. On
  Haven they stop at 0.7 m: anything larger is the land's own.
- **The land's own rocks** (`farRocks.js`, `rockBlock.js`; `surface.rocks.far` in the world
  file, defaults in `rockBlock.js`): blocks from 0.7 m to 20 m that are there whenever
  anyone comes back, drawn to `reach` (420) metres for every metre of their size: a 4 m
  block to a mile, a house-sized one to eight kilometres. The same block at the same
  place from that far to arm's length.

**Where rock lies** (`rockBlock.js`, plain arithmetic: workers and Node). A site holds a
rock with the chance `density x rockField(cluster noise, rockiness)`. Rockiness is of the
ground: its slope and how far it stands above its neighbours, both measured on ground
16 m coarse with arms of 12 m (so the foot of a cliff counts as steep: talus), the
water's edge, the tree line, less in closed forest (the land-cover picture; the largest
level least: outcrops stand out of the trees), none in water. The cluster noise (260, 85
and 27 m) keeps open ground to its highest few per cent (erratics) and rocky ground to
about two thirds, so fields have bare ground between them; on all-rock ground (a talus
slope) the fields run into each other and the noise only thins them. **How a block
stands**: its middle a fifth of its height over the ground, lying on the slope. (The
block's underside is not cut: sunk like a pebble only its top face showed, a slab level
with the hillside, and for a day steep rock ground looked bare.) **From how far it is
seen** is part of the rule (`seen`, a share of its size in a byte): under a closed
canopy 180 m, and from afar only blocks of 9 m and more. `node scripts/rock-field.mjs` draws
the result from above in seconds; `npm run rocks` fails if a promise of the rule is broken.

**Levels and tiles.** Sizes come in three levels (1.4 to 3.4 m, 3.4 to 8 m, 8 to 20 m),
and a fourth for the talus near the eye (0.7 to 2.6 m on tiles of 445 m, many, seen from
310 m at most whatever their size: `seenTo`; no shadow patches).
Each has its own tiles, **about as wide as its largest rock is seen from far** (1.3, 3.3
and 8.3 km: `tileDeg`, the trees' lattice at other sizes), with 128 x 128 sites: so every
level needs the same nine or so tiles round the traveller, and a view holds three or
four of each. A tile is one worker job (`rocks`: 30 to 80 ms with the land's shadow on
each rock) and comes back in the order of how far each rock is seen from. On the main
thread the whole tile is kept, and the GPU's buffers (a **fixed pool**: 14 tiles a
level, 16 for the talus; 52 bytes a rock) are **filled with the rocks that can be seen
from where the traveller is** and those that will be before the next filling (`_fill`:
again when the traveller has gone half the slack, two tiles a frame at most, and when
the governor's step changes). A tile is as wide as its largest rocks are seen from
far, so most of the tile one stands in is small rocks too far off to draw: handed over
whole, the vertex shader ran over five times what it drew; now 1.3 times. It is drawn
as **one instanced mesh** of one block (20 flat faces: the stones' lump at its coarsest,
cut by the same fracture planes, `ROCK_SHAPE_GLSL`), and one more for the shadows.
Nothing is done per rock per frame on the CPU (a filling is a pass over one tile, a few
times a minute on foot); per tile, a binary search says how many
of its first rocks can be seen from its nearest point (the instance count). **The draw
calls are counted in tiles**: some twenty in a view, shadows included. (The first
version had tiles of 333 m to 2.2 km and three meshes a tile, two block shapes and the
shadow: 40 to 60 draw calls, and a rock that changed shape at 80 times its size.)

**Per rock, in the vertex shader**: distance over size decides whether it is drawn
(beyond `reach` it is thrown out of the picture); it grows in over the last fifth of its
reach. Rocks of the smallest level have 0.82 of the reach, and 0.62 of that under the
governor's step `far-rocks` (the largest level keeps all).

**Light**: the shared chunk and the painted look as the stones (true faces, two tones);
the rock's colour is `far.albedo` or the world's `surface.rock`, times the bed of
coloured rock at its height (`tStrata`) and the land's colour under it (the albedo map's
tint, read once per rock when the tile arrives: `Terrain.tintAt`; as bright as the
country, half its hue: a rock of one colour everywhere was near black on golden grass);
dust on top, or snow. The land's shadow comes with the tile and is asked again a tile at
a time when the Sun has moved 1.1 degrees (`rockvis`: a ray a rock, or a 21 x 21 grid
across the tile where there are more than 400). The clouds' shadow is worked out per
rock as the ground does it. Within 150 m the near shadow map shades them and they cast
into it; **beyond it each rock lays a soft dark patch on the ground** away from the Sun
(a blended mesh drawn after the ground: the ground's colour times the sky's share of
its light, less through haze; no slope-scaled depth offset, which at a low angle is
metres and drew the patch over the rock itself). Governor step `far-rock-shadows` takes
the patches away.

**Walking**: `FarRocks.riseAt` gives how far a rock of the two larger levels stands over
the ground at a place (its fracture planes, in JavaScript: `rockTop` in `rockBlock.js`),
and the app's height function adds it (`_rise`): the traveller walks up and over a rock
of 3.4 m and more, lands on it, and the camera rises to see over it. The world file keeps
places clear (`far.clear`): where the journey begins. The rig asks how much of the last
height was rock (`rig.riseAt`, set by the app beside `sunkAt`): in flight `rig.agl` stays
the height over the LAND (the speed law must not dip over a tor) and `rig.floor` is the
height over what one would stand on (the touch-down tests; the near plane goes by the
lesser of the two). `scripts/rig-over-rock.mjs` fails if that comes back.

**Workers**: one tile is asked for before the ground takes the workers each frame
(`ask()` in `app.js`), so a traveller on the move is not left without rocks until the
ground has settled; with the ground at rest, every free worker. A tile is asked again
when the land cover changes and when a ring of water touches it (`Terrain._stale`).

## The sky by rule (`src/sky/skySystem.js`, `src/weather/sky/`)

Haven's weather is made by rule; Earth's is one real day's maps. Both reach the screen through
one sky system. The plan is `docs/briefs/clouds-weather-plan.md`, built as step 0
(`docs/briefs/sky-step0.md`) and four packages with a brief and a report each in
`docs/briefs/`: A the day's weather, B the clouds one sees, C their shade, D the weather at the
traveller. Later commits changed some of what the reports say; this section and the four after
it describe the code at 8411572.

- **The one rule**: nothing about the sky depends on where the traveller stands or looks; it is
  a function of the world's numbers, its seed, the game clock and the place. Code under
  `src/weather/sky/` imports neither three nor the DOM and never calls `Math.random`; it runs in
  the worker, on the page and in Node.
- **The sky's frame** (`SkySystem.frame`, filled in place, handed to every part each frame):
  the weather clock `t`, `tPrev`, `noiseT`, `rate`, `paused`, `steer`, `field`, `here` (the
  field's `at()` at the traveller), `cells` (live cells within 200 km, nearest first, with
  `dist`), `strikes` (the field's strokes since the last frame within 60 km, with `pos` in
  planet axes and `dist`). The header of `skySystem.js` lists every part's interface.
- **In the frame** ("Frame order", steps 1, 5 and 6): `weatherStep` before the camera moves,
  `beforeScene` (the shade atlas, its probe and the volume's march, each into a target of its
  own before `post.beginScene`), `groundUniforms`, `afterGround`, `drawWeather`. Nothing leaves
  the main picture between its clear and its last draw, and nothing reads its depth as a texture
  (the far cell sheets write depth and read none).

**The field** (`src/weather/sky/format.js`, `producer.js`, `skyWorker.js`; `sky/skyField.js`)

- **A snapshot** is the whole world's sky at one moment, made every `SNAP_STEP` (120 s) of game
  time: three maps in latitude and longitude, 1 024 x 512 by default (1.53 km a texel on Haven),
  bytes worked out and never stored as JPEG. A (RGBA8): heap cover, sheet cover, the low cloud's
  base (m above the sea) and the sheet's thickness, 25 m a step. B (RGBA8): mid cover (5 km),
  high cover (9 km, anvils in it), the field's rain (mm/h = 2^(byte / 60) - 1; a cell's own rain
  is not in it), wet ground. C (RG8, half the size): the fog's top and the country's height (the
  ground smoothed over 15 km), m above the sea, 16 m a step. With them the cell list (`CELL`,
  16 numbers a cell) and the lens list (`LENS`, 10). `format.js` makes the decoders from the
  same constants (`dec`, `fieldAt` in JS; `FIELD_GLSL` for shaders); a shader reads LINEAR, no
  mip maps, REPEAT across longitude, CLAMP across latitude, and `fieldAt` does the same on the
  bytes.
- **What makes them** (`makeProducer`): the model (`model.js`) where the world's weather is
  `made`, one static snapshot from the day's maps (`fromMaps.js`) where it is `maps`, the test
  pattern (`stub.js`) for a `sky:<preset>` switch. The worker makes the snapshots and transfers
  them (the model: about 0.5 s of a core each); without a worker they are made on the page. The
  page keeps its own producer for `at()` (under 20 µs: it fills only the texels its read takes),
  `cells()`, `strikes()`, `anvils()` and `lenses()`. The cells and anvils, asked every frame,
  come through `ListClock` (`listClock.js`): the model is asked at moments 2 s of the clock
  apart (a fresh moment costs it 1.6 ms at a storm's hour) and each cell's numbers are blended
  by id between them, within centimetres of the closed form.
- **Uploads, paced**: three slots of raw GL textures that three only binds, filled one 32-row
  strip of one map a frame with `texSubImage2D` between frames, no mip maps: at most 128 KB a
  frame on Haven. The first pair goes up whole (about 4 MB a snapshot, before the first
  picture). The 'now' maps (`SKY_UNIFORMS.tWxA/B/C`) are render targets blended from the pair
  round the clock on the GPU, a sixteenth of the rows a frame, scissored; whole above x60, for
  the first maps and while a jump fades in. `uSkyLow.w` is 1 once a whole field is shown; till
  then every reader takes a clear sky, and `field.busy` holds the screenshots.
- **Haven's land for the weather**: `public/data/haven_wxland_1024.u8` (5 MB: the ground, the
  country `hC`, the hills `hS`, the floor of each hollow, land, the distance to the coast) and
  `haven_peaks.json` (598 summits 600 m over their country), fetched by the field; without them
  `land.js` works the same planes out of the elevation map in a second. From them come 1 073
  trigger sites for storms (proud high ground, the sea-breeze line 12 km inland).
- **Where the field is on**: wherever a world's weather is `made`, unless `debug=noclouds`; on
  Earth only under `?debug=sky:model`. With no `sky:` preset in the URL the field's producer is
  the world's model (`debug=flash` alone takes the stub's storm, so a stroke is always near). Until
  the fix of 2026-11-25 it was the stub's `fair` pattern: a whole merge drew no storm of the day
  (sky-system-test check 12 now fails on that).

**The clock**

- The weather clock `t` is seconds since `weather.epoch` (`Steer.t`; Haven: 2024-09-01, its day
  starting at `dayStart`, 9 h UTC). Snapshots, steering, systems, cells and strikes are closed
  forms of `t`: nothing is added up frame by frame. Paused, the clouds stop; run fast, they
  time-lapse; run backwards, the snapshot on the other side is asked for. After a jump (a step
  larger than both 300 s and three times what the clock's rate explains) the old maps stay
  until the new pair is up, then fade into it over 2 s of real time (a constant blend factor).
  Snapshots are asked for one at a time, `max(120 s, |rate| x 0.5 s)` apart.
- The clouds' noise clock `noiseT` is `t` up to x600 (`NOISE_RATE_MAX`); faster, it runs at x600
  and is set back to `t` when the clock slows: at an hour a second every heap would flicker by.
  Strokes come only from a clock running forward by less than 60 s a frame.

**The day's weather** (`model.js`, `land.js`, `systems.js`)

- The chain at a place and a moment: moisture (the latitude's climate, the day's, how far upwind
  the sea is, the dry lee of the ranges), heat (the Sun two hours earlier, most over proud high
  ground), lift (windward slopes, fronts, lows), then the kinds. **Systems**: a low with a cold
  and a warm front on each hemisphere's track every 26 h, highs between, tropical waves; each
  born at a slot of the clock and carried rigidly by the mid layer's steering, bringing lift,
  moisture, shields of mid and high cloud, a rain deck and a gustier wind.
- **Heaps** form from mid-morning over heated high ground (over 20 afternoons at 15 h, 5.8 times
  the cover above 2 000 m as below 500 m; the windward side 8.6 times the lee), in clusters and
  streets downwind, few over the sea by day. **Caps** sit on summits in moist wind. **Sheets**:
  a marine deck over the sea, stratus in moist stable air, the fronts' rain deck, cloud banked
  on windward slopes. **Heights are over the country**: the low base is
  `max(hC + level - 650 x sheet, hS + 600, ground + 150)` m, `level` 400 + 1 600 x
  (1 - humidity) + 400 x heat over land and 300 + 900 x (1 - humidity) over the sea; a cap
  hangs 300 m under its own top. So a base never stands in the hills, and a plateau 2 km up has
  its cloud over it.
- **Fog** fills a hollow more than 60 m under its country on a calm (under 2 to 4.5 m/s), humid,
  clear night, its top `gmin + clamp(0.4 x depth, 60, 400)` m, burnt off over the 3.5 h after
  sunrise; sea fog on about 30 % of days. **Mid and high**: the fronts' shields, moist air
  aloft, streaks under a high wind over 25 m/s, the anvils. **Rain**: the fronts' deck, upslope
  rain, drizzle under a full sheet; none of it lands from a base over 2 km up (virga). **Wet
  ground**: the last six half-hours of rain (the cells' tracks too), fading over 3 h.
- **The ground wind**: the low steering wind slowed to 0.8 and turned, more on crests and less in
  valleys, up the slopes by day (2.5 m/s) and down at night (1.5), a sea breeze near the coast,
  gusts of 12 to 35 %, and round a raining cell an outflow of 6 to 15 m/s reaching 3 to 9 km
  beyond its core ahead of its rain. The air cools 6.5 degrees a km; rain turns to snow from
  1.5 degrees down. `at(place, t)` (`makeSkyAt`) gives, for a place and a height: the field
  there, that wind, rain or snow at that height (none above the base it falls from), the
  temperature, `overcast`, `storm`, `fog`, `wet`, `base`, `top`, the cell overhead.

**The steering winds** (`src/weather/sky/steer.js`)

- Each cloud layer (low 1.5 km, mid 5 km, high 9 km, the cells) moves as a rigid turning of the
  whole sky, `M_L(t) = Rz(psi) Rx(phi + lean_L) Rz(theta_L - psi)`, a closed form of the clock:
  `theta_L` the exact integral of a rate with knots at 06 h and 18 h of the world's day joined
  by smoothsteps (prefix sums kept, so any moment gives the same number in any order); the axis
  leans up to 43 degrees from the pole (knots every 3 days) and swings round it (every 5); the
  high layer leans up to `veer` (30 degrees) further, so cirrus often runs on another heading.
  A layer's wind at p is `omega x p`: level, and exactly the velocity of its pattern.
- A day's character is its low wind: westerly on about 85 % of days (Haven: 1.2 to 20 m/s,
  easterly up to 9, skewed light). Mid = 1.9 |low| + 4 m/s, high = 3.4 |low| + 8, the cells
  the mean of low and mid. A world pins a day with
  `weather.days['YYYY-MM-DD'] = { wind, veer }`; Earth's is a plain westerly
  (`low: { fixed: 8 }, tilt: 0, high: { veer: 0 }`).
- Shaders take `SKY_UNIFORMS.uCloudSteer` (a quaternion of `M_low(t)^-1`, `skyToLow`) and every
  layer's `uSteerInv`, `uSteerSpin`, `uSteerRise` (`STEER_GLSL`), filled once a frame whether or
  not anything is drawn; the noise is read where a layer's pattern stands still. The masses also
  **rise** through the layer at 0.5 m/s (`uCloudRise.x`), read in two phases half a period apart
  (`RISE`: 4 200 m), the first alone but for a fade of 8 % either side of its wrap
  (`skyLowNoise`): a heap grows and fades in place as it goes. The systems ride `M_mid`; a cell
  is at `M_cell(t) M_cell(born)^-1` times its birth point (a `STILL` cell stays put).

**Storm cells, strikes, lenses** (`cells.js`, `cellShape.js`, `strikes.js`, `model.js`)

- **A cell** is a (trigger site, half-hour slot) pair that exists when a hash falls under the
  chance the weather there gives (up to 0.22 a slot, 1.6 times that over heated or windward
  high ground; 13 to 19 h local over land, any hour along a front). It is blocked by a stronger
  candidate within 40 km whose life overlaps, and capped when eight stronger ones overlap it:
  never two side by side, never more than eight in the world, and since neither test asks when
  the question is put, nothing pops in or out. 2.5 to 5 km in radius, its top 6.5 to 11 km, it
  grows 20 min, is mature 25 to 40 min (15 to 45 mm/h in a core of 0.6 of its radius, 2 to 12
  flashes a minute) and decays 30 min (`cellLife`); its strength is 0 at birth and death.
- **Its shape** (`cellShape.js`, one rule in JS and GLSL): a column leaning with the shear under
  a dome, an overshooting top while mature, a heart whose outer band its noise eats, a rain
  shaft drifting downwind; quadric pieces, so a ray's entry and exit (`cellChord`) and its
  length toward the Sun (`cellLight`) are exact. **Anvils** are a list of their own, outliving
  their cell by 40 min: a fan at 6.7 to 9.5 km, blown 10 to 30 km downwind. The nearest 8
  cells go into `SKY_UNIFORMS.uCells` each frame, up to 12 anvils into `uAnvils`.
- **Strikes**: a mature cell has one chance in every 0.7 s slot of the clock, a hash of the cell
  and the slot. A third reach the ground inside the rain core, from the base down; the rest
  flash in the cloud; power 0.6 to 1.4. A window split in two gives the union of its parts, so a
  benchmark meets the same storm every time.
- **Lenses**: where the mid wind blows at 11 m/s or more across the ridge of a summit 600 m
  proud of its country, in air neither dry nor saturated, up to three lenses of one to three
  plates stand downwind a wave's length apart (2 pi x wind / 0.011 s^-1), 1 200 m and more over
  the summit. They stand still and grow and fade with the wind; at most 12 in the world.

## Clouds (`src/sky/`)

- **One rule for the shapes** (`skyGlsl.js`): `skyLowAt` and its forms (`skyHeapTop`,
  `skySheetAt`, `skyEdgeEat` ...) cut field A's covers into heaps and decks with the repeating
  64-cube noise (`cloudNoiseData.js`, made in a worker). The volume marches it, the far shell
  reads it where the masses are widest, the shade atlas follows it toward the Sun. Every shared
  GLSL text (this file's, `FIELD_GLSL`, `STEER_GLSL`, `CELL_GLSL`) and the uniforms they read are
  guarded (`glslOnce`): a shader may take two of them, and no reader declares a shared uniform
  by a line of its own.
- **The volume** (`cloudVolume.js`) to `reach` (16 km). Before the main picture a small picture
  (a quarter of the view each way) is marched in eight slices of distance from the eye: 0 to
  300 m, to 900 m, 2.4 km, 5 km, 9 km and the reach, then 16 to 40 and 40 to 200 km, which hold
  storm cells alone and are marched only while one stands out there. A second pass takes the
  grain out; a third (`ALL`) sums the cloud along each line of sight and cuts the clean edge by
  it, so an outline cannot change as a slice boundary passes through it. A step reads field A
  (both covers, base and thickness at that place), the noise's two channels, and the noise
  280 m toward the Sun, which splits a heap into its two tones (0.64 and 1.0); within a
  kilometre of the eye one more for the wisps. A ray reads field B once (the Sun the mid and high
  layers leave). The march's bounds come from `at()` at 25 places over the reach, snapped to
  250 m: they shorten the march and no value of a cloud comes from them.
- **Storm cells** are marched by the same function near and far, so the hand-over at 16 km
  cannot pop: 1.45 times as solid as a heap, lit by the exact chord toward the Sun through the
  tower (white within 300 m, darkest by 2 600 m, the shade slate-indigo, the base keeping 0.11
  of the lit top), their noise boiling up at 5.5 m/s in the cell's own frame, up to two flashes
  lighting them from inside (`uBolt`, `setBolts`). **Rain shafts** below a raining base, crossed
  once a ray: grey-blue, silver toward a low Sun, gone within 600 m of the eye, where the
  streaks take over.
- **Laying.** The two far slices first, each pixel at its own depth (where its ray enters the
  nearest cell), plus a depth-only pass where a core is nearly solid: a ridge in front hides a
  storm's foot, a tower hides the shells behind it. After the ground, the six near slices far to
  near, each a curved sheet (24 x 12) at the distance where its slice begins.
- **The far low shell** (`clouds.js`, one draw): each vertex stands where the field's cloud over
  its own place is widest, the same forms cut it, and it fades in where the volume fades out
  (`uNearFade`): the clouds from any height, from space and at the governor's floor. **The upper
  shells** (`upperClouds.js`): mid at 5 km (altocumulus in patches and lanes, altostratus as a
  veil), high at 9 km (cirrus drawn out along the high wind, a faint 22-degree halo, anvils read
  where the pixel's ray crosses their own height, grey beneath, torn at the edge). Cover from
  field B, pattern from the noise in each layer's own steering frame; cut where a tower stands
  (not where its anvil lies); drawn above or below the camera by height.
- **The fog sheet** (`fogSheet.js`): 129 x 129 points over 60 km on a lattice fixed to the world,
  each lifted to field C's fog top at its own place, depth-tested so a ridge cuts it. **Lenses**
  (`lenticulars.js`): at most 12 plates (768 triangles and a draw each) from the field's list,
  read every 10 s of game time, nearest first, none beyond the horizon; a pixel takes the metres
  of cloud its own ray crosses in the plate, so a plate seen edge on is drawn. **From space**
  (`bodies.js`) the home globe wears field A. Every program is inside a phone's limits
  (`glLimits`): the march 11 textures, the far shell 9, the upper shells 8, the fog 7.
- **A world with no field** (Earth, unless `sky:model`) keeps the rule as it was: the day's cloud
  map, fair-weather heaps where it has none (`volume.fair`, `FAIR_GLSL`;
  `node scripts/cloud-field.mjs` draws them from above), the base `volume.base` over the country
  smoothed round the traveller, `volume.thick` deep, denser with `weather.storminess`. This path
  goes when every world with clouds has a field.

## The clouds' shade (`src/sky/cloudShade.js`)

- **One writer**: an RGBA8 atlas of 1 024 x 768 (3 MB), drawn before the main picture and read by
  everything lit. Each texel is a point on the sphere R + 2 500 m: R the low cloud's raw shade
  along the ray toward the Sun (readers apply the crisp curve, so an edge stays sharp on a coarse
  map), G the Sun left by the mid and high layers, B the sky's light left, A the low cloud's top
  on that ray (a peak above a deck or fog keeps its Sun). With a field the channels are the
  shared rule's `skyShade()` with fog from field C and the exact chord of every tower crossed;
  without one (Earth), the old rule of the day's map and the heaps.
- **Three windows**: the world (1 024 x 512, 1.53 km a texel on Haven, a sixteenth of its rows a
  frame, whole above x60 and in pictures), near (256 x 256 at 55 m) and middle (256 x 256 at
  220 m), both whole every frame, on one tangent frame anchored at a world point until the
  traveller is 2 km from it, each window's first texel snapped to its lattice; a re-anchor
  carries the lattice over. A fixed place keeps its texel and its byte however one moves.
- **Readers**: `cloudShadeLight(rel)` and `cloudShade(rel)` (`SHADE_READ_GLSL`): one read (two in
  a window's blend band) where the Sun's ray through the place meets the sphere, exactly. The
  near ground at its vertices (`vCloud.xy`), the far ground per pixel, the trees and the far
  forest at crown height, the far grass, the far rocks; these define `OWN_CLOUD_SHADOW`, so the
  lighting chunk does not shade them again by `uWeather.x`.
- **The probe** (`ShadeProbe`): three texels (the figure's soles on foot or the figure in flight;
  the camera; the lander once App hands it over, which it does not yet) read back
  asynchronously as the meter's is (at once in a picture) and eased. It writes `G.uWeather.x`
  and `.y`, which light the figure, the near rocks, the lander, leaves, dust and the grass within
  30 m. With no value, `weather.js`'s shade from the cloud overhead stands.
- The ground's vertex shader reads field B's wet (`cloudWet`) into `vCloud.z`, per place (with
  no field, `uWeather.z`). The ground's fragment shader is at **15 of 16 textures**; its sky
  light still takes the traveller's `uWeather.y`, not the atlas's B channel place by place.
- Its strength is `clouds.shadow.x` (the world's `clouds.shadow`, 0.85), set by the far shell
  once the world's cloud map has loaded (Haven still loads `haven_clouds_4096.jpg` for this). It
  is 0 under `debug=noclouds`, with the benchmark's `cloud-shade` part out and at the governor's
  `clouds` step: then no cloud shades anything.

## Weather at the traveller (`src/weather/`)

- **On a made world `weather.js` invents nothing**: it reads `sky.here` and `sky.strikes`. `uWind`
  is the field's ground wind at the traveller (trees, grass, sea and whitecaps, leaves, pollen);
  a hovering figure with the stick let go drifts with it at half its speed (below 12 km; not in
  a benchmark, a GO trip or a picture). Rain and snow at the eye are `here.rain` and `here.snow`
  at the traveller's own place and height: a shaft starts at its edge, a gap between heaps is
  dry. The veil (`uWeather.w`, `rainVeil` in the lighting chunk, and the sky dome) is
  `min(0.0045, 0.00014 (rain + 2 snow)^0.85)` a metre: what is lit is mixed toward the sky's
  grey by `1 - exp(-distance x veil)`. Distances are metres through the world's own radius.
- **Rain** (`rain.js`): 5 600 streaks or flakes in a box round the camera, a third in a small box
  round the eye, each a strip turned to the eye never under two pixels wide, lit by `skyLight`,
  each drop's numbers from its index; drawn in the weather scene and again in a slice of its own
  from the eye to the terrain's near plane (0.15 of the height: metres, in flight).
- **Strokes** (`bolt.js`): a pool of four ribbons of 64 pieces, each a seeded walk from the base
  at the strike's own place to the ground there, branching (12 %), built **in planet axes round
  the stroke's foot** and placed relative to the camera each frame, so it stands still while the
  traveller flies. A white-violet core at 60 times the Sun's light, never under 1.25 pixels or
  3 m of half-width (`boltHalfWidth`, one rule for JS and GLSL), in a glow five times as wide at
  a quarter of the light: it reads with the bloom off. Alpha 0: it cannot own the meter. Two to
  four return strokes over 0.2 to 0.5 s (`storm.js boltFlicker`, one rule for the ribbon, its
  light on the land `uFlash`, and the cloud lit from inside). Drawn in the bolt slot, before the
  near slices, so cloud in front covers its top; none seen from above 18 km.
- **Thunder**: each stroke is queued from its own moment within the frame for distance / 343 m/s,
  and heard only below 20 km over the ground. `audio.js thunderLoudness` falls to nothing at
  50 km; a crack near by, a roll beyond, and each arrival raises a low rumble that dies over some
  15 s, so a storm within 30 km is never quiet.
- **The storm in the picture** (`storm.js STORM`, written once a frame by `weather.js`): `light`,
  the share of the day's light the cloud overhead leaves (`stormLight`: a closed deck about
  0.15, a storm at least 0.12), from `overcast` and `storm` overhead and never from the Sun at
  the traveller's feet, so a heap's shadow on the figure cannot dim the frame. **The meter**
  (`post.js meterTarget`) makes up only `light^0.45` of it (`METER_HOLD`): a storm stays 1.2 to
  1.4 stops darker than full compensation, a clear sky is unchanged, and while a stroke is alight
  the highlight limit is not applied. **The grade** (`look.js STORM_GRADE`: saturation 0.82,
  contrast 1.12, a cool shade) blends in by the storm overhead; **the sky dome** goes over to the
  deck's grey from 0.55 of overcast. **The rainbow** (`rainbow.js`, one additive pass) shows when
  the Sun is low and rain falls 2.5 to 18 km off on the side away from it.
- **Earth** keeps its own weather in `weather.js` (`recipe: 'maps'`, 8 September 2017): the belts
  and a vortex round each named storm, squalls in two slow beats, rain or snow by a rough
  temperature, lightning under deep cloud where it rains hard, now a hash of the place and the
  moment (a benchmark meets the same storm twice). Its clouds are the day's map ("A world with
  no field") on a plain westerly; since step 0 its storms no longer race at their wind's speed.
  The atlas is drawn from the old rule, so Earth's clouds shade the figure too. Under
  `?debug=sky:model` Earth gets a field from its maps (`fromMaps.js`): cover, mid and high layers
  from the cloud tops, rain, and that day's storms as still cells with towers, anvils and
  strokes; its ground wind is the same belts and vortices.

## The sky's switches, savings and tests

- **`?debug=`** (`skyDebug`): `sky:fair|fog|storm|front` (the field from the stub's test pattern:
  heaps over high ground; mist in every basin; cells born again and again west of the opening
  place; a front crossing it 6 h after the weather clock's zero); `sky:model` (the world's own
  weather; on Earth its field from its maps); `storm` (a still mature cell 8 km north-east of
  where the view opens); `flash` (in a picture, a stroke held at its brightest: on Haven the
  nearest to the ground in the next 10 min within 60 km, bringing the stub's storm when no preset
  is named; on Earth from its maps); `noclouds` (no cloud and nothing a cloud does: no field,
  shadow, shade on the figure, stroke, rain, snow, wet ground, rainbow or storm grade). Also
  `nostorm` (`look.js`: no storm grade) and `treeshade` (the far trees painted by the
  share of the Sun the land and the clouds leave them).
- **Governor steps** (`SKY_SAVINGS`, through `app.sky.setSaving`, live only where their part
  draws; `buys` in ms, guesses until a phone measures them): `cloud-upper` (the upper shells in
  one octave, no relief; 0.5), `rain-shafts` (no streak read in the shafts; 0.5),
  `cloud-shade-rate` (the atlas's middle window every other frame; 0.3), `cloud-shade-coarse`
  (no near window: the shadows kept, from the 220 m one; 0.5), `clouds` (every cloud shadow off;
  4.0 measured before the atlas, still on the ladder after `cloud-shade-coarse`, which the plan
  meant to replace it), `cloud-volume` (the field's heaps and decks go to the far shell; storm
  cells still marched at 5 steps a slice; 9.4), `cloud-steps` (36 steps a ray to 22, far slices
  8 to 5), `rain` (half the streaks). `bolt.js` answers a `bolt-glow` saving not yet on the
  ladder. At the floor a storm keeps its tower, rain, strokes and thunder. The benchmark leaves
  the sky's parts out one at a time (`SKY_PARTS`: `clouds-all`, `cloud-shade`, `cloud-upper`,
  `cells-far`, `rain-shafts`, `fog`), on a pinned clock; a cost view may carry an hour.
- **Tests** (no browser unless said; each exits 1 on a broken promise, and most take
  `--break <fault>` to put back what it guards against and see the check fail):
  - `scripts/sky-system-test.mjs`: the shared rule's GLSL against its JS twins, the clouds on
    the game clock (paused, jumped, backwards, capped at x600), the frame order, the governor's
    and the benchmark's hooks, `__shotReady`, the switches, the guards, the rise, the interfaces.
  - `sky-steer-test.mjs`: the closed form against a frame-by-frame sum, level winds, the days,
    pinned days, the GLSL against the JS, the pattern moving with the wind.
  - `sky-format-test.mjs`: the encodings and decoders, `fieldAt` against a GPU's filtered read,
    determinism, no traveller input, split windows of strikes, eight cells at most, the presets.
  - `sky-cell-test.mjs`: a cell's GLSL against its JS; chords exact against a brute-force march.
    `sky-list-test.mjs`: the cells and anvils blended from moments 2 s apart stay within 5 cm
    of the model's own, forwards and backwards, and the model is asked about once in 60 frames.
  - `sky-model-test.mjs` (3 min): package A's eleven checks, from determinism and cloud over the
    mountains to storms only in the afternoon and Earth as `weather.js` has it (`--on fake`, a
    producer of the old static map, must fail checks 3, 4 and 7).
  - `cloud-shade-test.mjs`: the shade at fixed places while walking 2 km and flying 30 km
    (0.000 against the old map's 0.345 and 0.396), a re-anchor, the reader's point on the Sun's
    ray, the probe against the ground's own texel, the GLSL against the JS.
  - `weather-test.mjs`: `uWind` is the field's, rain only where `at()` rains, thunder at
    distance / 343 m/s and the same strokes twice, Earth unmoved, the meter holding the dark,
    the gust front before the rain. `bolt-test.mjs`: at least 1.25 px at 2, 10 and 40 km at the
    phone's pixel angle, still in planet axes while the camera flies, alpha 0 with a glow.
  - `lens-list-test.mjs` (the lens list, nearest first, none over the horizon) and
    `cloud-volume-test.mjs` (the storms still marched with the volume off).
  - In a browser: `cloud-motion.mjs` (the clouds move with the steering, not with the camera;
    the hand-over at 16 km) and `cloud-cost.mjs` (reads a step on real rays, limits, work).
  - Tools: `find-weather.mjs` (the chain at a place, days, seeds, the scene's hours),
    `sky-map.mjs` (the weather from above), `storm-sites.mjs` (where to stand for a picture).

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
  The cloth is all of the figure's work on the page (the pose is a hundredth of a
  millisecond), so it is written for speed: links as flat tables, each point's share of
  the flutter's phases as tabled sines and cosines (no sine per point and step), the
  drawn surface from tabled Catmull-Rom weights, nothing made anew in a frame.
  `node scripts/hero-cost.mjs` times it without a browser and checks its drawn points
  against `scripts/lib/robe-reference.json` after ten seconds of a set flight (a change
  that is not meant to move the cloth must leave them where they were).
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
  shell some kilometres up, one draw call in a scene of its own drawn after the near pass
  (`SkySystem.afterGround`; depth-tested against the ground, so peaks stand through it and
  it lies over the terrain from orbit), lit by the Sun through the air and by the sky. The
  near pass's far plane reaches the layer's horizon. Where the world has a sky field
  (Haven) the shell draws the field's clouds instead ("Clouds"); what follows is the rule
  for a world without one (Earth). **A heap** is one rule (`HEAP_GLSL`, `cloudHeap`): the
  cover the day's map gives a place (and fair-weather fields where it gives none), carved
  by the cloud volume's noise at the height where its masses are widest. The layer draws
  it with a clean edge, a lit side and a side in its own shade (the same heap a few hundred
  metres toward the Sun, `relief`). **Its shadow** is the clouds' shade atlas ("The
  clouds' shade"), which on such a world is drawn by this same heap rule: every cloud has
  its shadow beside it on the land, and nothing is shaded where no cloud is drawn.
  **From far off** (`far`: where a pixel is 1.5 to 5 km wide across the line of sight, and
  a heap no more than a pixel or two) a field of heaps is a white veil as thick as the
  share of sky it covers; from farther still (the whole globe in view) the layer is the
  day's map itself as the globe seen from another world wears it, lit by its own relief.
  None of this depends on the cloud volume being on.
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

**The canvas follows the picture** (`App.fitCanvas`, `CANVAS_STEPS`): the canvas's own pixel
size is one of four steps (1, 0.60, 0.36, 0.22 of the native area), the smallest that still
holds the picture the governor has chosen; the browser scales it to the screen. The last
pass then writes as many pixels as the picture has, not the screen's 4.45 million whatever
the resolution (the seventh phone benchmark, build ef3201a: with nothing drawn at all a
frame still took 19 to 28 ms of the 58). A step down waits three seconds, a step up is at once; the
frame after a change is reported to the governor as `screen size changed` and not judged.
`app.canvasHold` ('fit' / 'full') pins it for the cost test.

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
  the one closest to 1.6 M pixels (or native, if the canvas is smaller than that). (It
  was 1 M: on the test phone the last 0.6 M bought a twentieth of a frame.)
- **Slow work is told from slow pixels.** The app passes the page's own time for the frame
  (`scriptMs`: from the start of `frame()` to the governor's update). When frames are late
  and that time fills more than 0.6 of the interval, resolution is left alone and the
  *load lever* is used: terrain patch factor ×0.8, then ×0.64 (`LOAD`, id `load` in
  `App.terrainBudget`), back one step after 15 clean seconds. When only frames with
  arriving terrain are late (the "soft" ones), terrain is let in more slowly first
  (`App.terrainPace`: one patch a frame, then one every other frame; full pace again after
  5 clean seconds). `MODES[mode].patches` is the share of the patch cap a mode draws
  (Smooth 0.8, Sharp 1).
- **Feature steps** (`FEATURE_STEPS` in `governor.js` is the source of truth, with a line
  on every step saying what the phone measured; used only once resolution is at its
  floor). Since the ninth phone results (build 6ac24ff) the order is **by what a step buys
  on the test phone, then by what the eye loses**; before that it was "least loss first",
  and a trial of two to four steps ended among eight that buy nothing there, with the
  steps that could have cured the frames behind them. Four groups:
  1. bought 2.5 ms and more: `grass-mid`, `trees-far`, `far-trees`, `tree-leaves`;
  2. bought a little (0.5 to 1.6 ms): `grass`, `pollen`, the sky's `cloud-upper`,
     `rain-shafts` and `cloud-shade-rate` (the plan's guesses, not yet measured),
     `terrain-1`, `terrain-2`;
  3. the depth of the land and the sky from the air: `cloud-shade-coarse`, `clouds` (their
     shadows), `far-relief`, `cloud-volume`;
  4. nothing that could be measured on the phone (the tenth results moved `cloud-steps`,
     `cloak`, `fine-shadows` and `bloom` here from the head of the ladder): `cloud-steps`,
     `cloak`, `fine-shadows`, `bloom`, `detail`, `soft-shadows`, `contact`, `edge-glow`,
     `dust`, `rocks`, `far-rock-shadows`, `far-rocks`, `rain`, `leaves`, `sun-beams`,
     `air-shadow`, `tree-shadows` (kept for other devices and for the floor).
  The sky's steps go through `app.sky.setSaving` ("The sky's switches, savings and tests").

  Each step has `buys` (ms a frame where the phone measured it) and may have `live(app)`:
  whether it can buy anything where the traveller is (no near trees drawn: the tree steps
  cannot; no clumps: `grass-mid`; no cloud volume: its two). A step that is not live is
  passed over. A **stride** down takes live steps until they are expected to buy 2.5 ms
  (`STRIDE_MS`), so a run of small steps is one stride. The savings that are on are a
  list (`governor.off`, in the order they went; `featureLevel` is its length), no longer a
  prefix of the order. **Coming back**: the ones that went first come back first, five at
  a time; when several that came back together make frames late again they go off again,
  to the front, and come back one at a time; the one that makes frames late by itself
  goes to the end of the list and is marked as needed (`_alone`): what stays off in the
  end is what the frames need (a trial takes steps until one cures the frames; the ones
  before it bought nothing). While only needed savings are on, the resolution and they
  take turns at coming back, so one saving that stays on does not hold the picture at
  its fewest pixels for good. `governor.toFloor()` switches all of them on, live or not. Every
  new feature that costs frame time adds its step here, with what it buys once a
  benchmark has said.
- **Measuring**: the display's refresh interval is estimated continuously from the
  spacing of animation-frame callbacks (20th percentile of the last 60, never slower than
  57 Hz). The frame interval is the mode's target rounded to a whole number of refreshes.
  A frame is *late* when it takes more than 1.2 × its interval (`LATE`). Lateness is
  judged against the target interval, never against the measured refresh: when every
  frame is slow the refresh reads too long and would excuse them.
- **Deciding**: over the last 24 frames, step down when more than 20 % (+ `bg`) of the
  ordinary frames are late, or more than 30 % (+ `bg`) of all frames (in strides when
  most are). Frames
  in which new terrain was uploaded are "soft": lateness there is usually not the
  resolution's fault. Frames after a bookmark jump, a world switch, a resize or a return
  from the background are ignored.
- **Late frames of the device's own** (`bg`). A phone has late frames that nothing drawn
  causes (one in fifteen at every stop of the eighth benchmark, at one million pixels as
  at two). `lateEMA` is the share of ordinary frames late over the last three seconds or
  so; `bg` is the part of it the device has whatever is drawn. `bg` is learned only from
  evidence: at the resolution's floor (nothing lower to try), or from a trial that cured
  nothing; it follows `lateEMA` down at once. Up to `bg` + 3 % a late frame does not reset
  the clean run; the window's threshold for stepping down is 20 % + `bg`.
- **A step down is a trial** (`_dip`). When some frames are late (under 60 %), two steps
  have been taken and about as many are late as before (over 0.7 of the first share),
  fewer pixels are not the cure (once the savings are being tried, the verdict waits
  until no live step known to buy a stride's worth by itself is left untried, `_bigLeft`:
  a trial that ends before the steps that could cure the frames has proved nothing): `_putBack` restores the resolution and the savings the
  trial began with, and such lateness moves nothing for 30 s (then 60, up to 240;
  `immune`). When everything has been given up and the frames are as long as they were
  (the window's mean over 0.85 of the first), the same. When only the savings did nothing
  (frames as long with all of them on as when the first went), the savings come back and
  the resolution stays (`featImmune`). A few late frames over `bg` + 4 % for six seconds
  start a trial of their own (one step, two seconds to see what it did); a step up
  followed by one within twelve seconds is taken back instead. Arriving at another place
  ends all of it. The benchmark prints `bg` and how often quality was put back.
- **Pixels or savings.** A trial begins with fewer pixels. When that cures nothing (two
  rounds with as many frames late; or, with most frames late, one stride of fewer pixels
  and frames as long as before), the pixels come back and the next trial is of the savings
  **at the resolution that stands** (`_featFirst`), while a live step known to buy
  something is untried; then pixels again. Before, savings were only ever tried at the
  fewest pixels: a view whose frames do not wait for pixels (the phone's opening view
  costs the same at 2 MP as at 4.45) sat late at full size in Sharp, or was taken to the
  fewest pixels first for nothing.
- **Stepping up** needs a clean run of `holdUp` seconds (3 s to start) and, where the
  browser exposes GPU timer queries, GPU time under 72 % of the interval. If a step up
  has to be taken back within 4 s, `holdUp` doubles (up to 60 s); it halves again each
  time a step up holds. That is the hysteresis. The first eight frames after a step up
  are watched separately: if five of them are late the step is taken back at once.
- **Modes**: Sharp (30 fps; the default since 2026-11-24, the owner's word) and Smooth
  (60 fps), `M` / the MODE button / the start screen, remembered in `localStorage`
  (`sse.mode2`: a mode kept under the old key was the old default and is not read). Both modes start at native. Switching to Sharp
  jumps to native with every feature on and lets the governor come down; switching to
  Smooth keeps the current level and comes down from there if it has to.
- `?scale=` and screenshot mode fix the scale and switch all of this off. `?debug=floor`
  (with a picture) switches every saving on and takes Smooth's share of the patches: what
  a device that has given everything up draws.
- A place's remembered level is kept under `<mode>:<place>:2`; levels remembered before
  the eighth results (the floor, everywhere) are not read.

## Benchmark (`src/perf/benchmark.js`)

A lap is 180 s: five Mars bookmarks (12 s each: hold, pan, fly forward), a 60 s flight
(climb to orbit, aim at the Moon and cruise with boost, follow the Moon's curve down
toward the landing site; safety nets teleport if a slow device falls behind), five lunar
bookmarks. The soak is 600 s of laps. It drives the game through virtual keys, so it
exercises the same code as a player. Every rendered frame is recorded (frame time, render
pixels, part of the lap). Frames over 100 ms are listed with their cause from
`App.frameCause`. The results are plain text (`window.__benchResult`), shown on the
results screen with a Copy button. `?bench=run|soak|earth` starts one without a tap.

Two things in the results say *what* is slow, not only that something is:

- **The page's own work by part** (`src/perf/profile.js`): `App.frame` is cut by marks
  into twelve named parts (sky and weather, steering, terrain, rocks and trees,
  character, air, shadow map, far view, ground, clouds, rain and figure, finishing); the
  benchmark prints the largest at every stop, the full read-out shows them live.
- **The cost test** (`CostTest`, after the lap; not in the soak): at the first world's
  opening view and at each of its `scene.costViews`, the governor is held still at
  2.07 MP with everything on, then each saving of `FEATURE_STEPS` is switched on alone
  (not the two that draw fewer patches; "everything on" is measured again after every
  three, and each saving is set against the measures on either side of it), then all of
  them, then everything on at 1 MP and at native. Then **whole parts are left out one at a
  time** (`PARTS_OUT`: grass, trees, the figure, the shadow maps, the ground's shading
  (`uPlain`: the ground drawn in one flat tone), the ground and all on it, the sky, the
  last pass at the picture's size instead of the screen's, everything), each set against a
  fresh "everything on": what a part costs, and what a frame costs with nothing in it. Each frame is timed from its start until one pixel read back from the
  canvas returns, which is when the GPU has drawn it: a time that is not rounded to
  screen refreshes. Frames that took in ground and the first five after a change are
  left out. Three lines a view: the four totals, and what each saving saves alone.

`scripts/play-profile.mjs` does the first of these headless, in the real game at a place
(`--at "lat,lon,alt"`, `--floor` for every saving on), with the patches built so far.

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
