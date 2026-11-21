# Progress

What exists, what was decided and why, what is wrong, and a short log. The plan of record
is `docs/ROADMAP.md`; the rules are in `CLAUDE.md`. Update this file in every commit that
changes behaviour.

## Where things stand (read this first)

*Handoff written at the third delivery of milestone 11 (the painted look).*

- **The goal** (owner, 2026-11-20): the best possible product a Samsung Galaxy S23 Ultra
  runs without lag (`CLAUDE.md`, "The one goal"). Helpers: workflows only for the most
  challenging parts.
- **The owner's last word** (with Smooth and Sharp benchmarks of build fa0c4c9): hyper
  focus on Earth and its physics: rivers and seas, clouds to fly through, forests of the
  real trees, wind in them and falling leaves, rain, thunder and lightning, hurricanes
  and the other weather, and beautiful.
- **Delivered**: milestone 10, five stages, merged; `checkpoint sent`. What each stage
  contains and what it does not is under "Milestone 10, stages 1 and 2", "stages 3 to
  5" and "Milestone 10 review" below. The lakes and rivers were put right at the very
  end (the review's follow-up: the real lakes were not being drawn and false ones were);
  `npm run lakes` now holds them to the real ones.
- **The owner changed the art direction** (2026-11-21, after a review of the look, with
  nine reference pictures): the painted look, Earth and its forests first. Milestone 11.
  See "Milestone 11 plan" and "first delivery" below, and `CLAUDE.md`, "Choices in force".
- **The phone's word on the second delivery** (build c51fae1: an Earth benchmark and a
  list): **56.8 fps** (from 15.2): the frame-rate cure held. The owner then asked for
  clouds that are denser, better and keep their place when one moves, better leaves on
  the trees, and the ground loaded before one gets there. All of it is under "The
  owner's sixth phone results and the third painted delivery". **Third delivery sent.**
- **Asked of the owner**: an Earth benchmark in Smooth, and whether the clouds now stay
  put and the ground is sharp on arrival. Read first: late frames while ground arrives
  and "terrain patches built" (load-ahead builds more), the cloud lines of the cost test.
- **What to do next**: with the benchmark, tune from it first. With a complaint,
  reproduce it in a picture, fix, show before and after. Then: Earth's resolution on
  the phone (1.3 MP of 4.45: the ground shader is where the time is; compile Earth's
  blocks out of other worlds' shaders, and look for what the ground can do per vertex);
  the cost test's baseline (see the sixth results); milestone 11's rest: water in the
  same hand, the character, night and orbit, and the other worlds one at a time (give
  each a `look` block and its air). Older open items: a swimming stroke, rain shafts,
  moving weather, Mars' costly pixel, lakes with islands finer than a cell, the Caspian
  28 m too high, far rivers over filled hollows. Still open: whether a 3D model file of
  the character exists.
- **How to work here** (all in CLAUDE.md): develop on the session's own branch, open a
  pull request into `main` and merge it yourself (through `gh api`); the phone link
  updates a minute later and shows the build's commit. Run `./scripts/build-check.sh`
  before every merge, one headless browser at a time, and the checks listed under "Run
  and test". Earth pictures need the map mirror's cache (`/root/mapcache/ext`, filled on
  first use) and `--timeout 600`.
- **Choosing a view without the browser**: `node scripts/peek.mjs` sketches what a
  camera sees from a place in seconds (bundled maps only).

## What exists today

- **Mars**: real NASA MOLA elevation and Viking colour over the whole planet. The main
  site is Coprates Chasma (Valles Marineris) at 2014-01-31 09:29 UTC, about 20 minutes
  before local sunset, with five views: ledge, sun, wall, ship, dusk. Two more places with
  their own sharper elevation: the summit caldera of Olympus Mons and Gale crater.
- **The Moon**: real elevation (LOLA for the globe, SLDEM2015 for the sites) and real
  brightness (Clementine). The main site is Hadley Rille and the Apollo 15 landing site on
  1971-08-01 13:00 UTC, the second day of that mission: five views (the canyon from its
  bend, sunrise over the Apennines, Mount Hadley, the lander with Hadley Delta behind,
  night under the Earth). Two more places: Tycho and the Taurus-Littrow valley (Apollo 17).
- **Dust**: the character throws up dust when it touches down, takes off or skims the
  ground; low clean arcs on the airless Moon, a lingering cloud on Mars.
- **The character**: the owner's design, a figure in a white-silver robe with long
  magenta-purple hair; the robe's skirt, the wide sleeves and the hair are simulated cloth
  that flows in the wind and in flight. Flight speed grows
  with distance from the nearest surface, so one stick covers hovering, orbit and the
  crossing between worlds; the engine hands over from one world to the other in flight.
- **Engine**: cube-sphere terrain with worker-built chunks and baked Sun shadows, a
  lookup-table atmosphere, the true sky (9 096 catalogue stars, Sun, planets and moons
  from an ephemeris checked against JPL Horizons), a lander, rocks, HDR with
  auto-exposure, AgX, bloom, dither.
- **Start screen** with Play, a 3-minute benchmark, a 10-minute soak test and the
  Smooth / Sharp switch; a results screen with a Copy button; the commit the page was
  built from on the start screen and in the HUD.
- **The governor**: renders at the canvas's native pixel size when it can, lowers
  resolution first (down to about 1 M pixels), then features in a fixed order, and paces
  frames evenly to the 60 or 30 fps target.
- **Phone link**: GitHub Pages, deployed by GitHub Actions on every push to `main`.
- **Tools**: the reference screenshot set (`npm run shots:all`), the stability test
  (`npm run stability`), a scripted Mars→Moon flight test (`npm run flight`) and a
  headless check of the start screen, modes and a full benchmark (`npm run smoke`).

## Milestone 1 plan — phone link and measurement

1. Save the charter (`CLAUDE.md`) and roadmap; remove the rules it replaces.
2. GitHub Pages through GitHub Actions, deployed from `main`; Claude merges its own pull
   requests so the link follows every push. Build stamped with the commit hash.
3. Start screen (Play, Benchmark, Soak, Smooth/Sharp) showing the commit hash; hash in
   the HUD.
4. The governor: native-resolution ceiling, about 1 M pixel floor, resolution first, then
   features in a fixed order, hysteresis; frame pacing for a steady 60 or 30.
5. Benchmark: scripted 3-minute route (Mars bookmarks → flight to the Moon → lunar
   bookmarks), 10-minute soak, results screen with Copy.
6. Reference screenshots, stability test, independent critic, docs, checkpoint.

Status: all six done; waiting for the owner's first benchmark results from the phone.

## The owner's first phone results (milestone 1 build, Galaxy S23 Ultra)

Four runs on build b236727, screen 823×384 CSS px at pixel ratio 3.75 (3088×1440),
Adreno 740.

| Run | fps | 1 % low | Resolution | Steps |
| --- | --- | --- | --- | --- |
| Benchmark, Smooth | 59.8 | 45.1 | average 4.22 MP, native after the 23 s climb from the old 2.35 MP start | 3 down, 8 up |
| Benchmark, Sharp | 30.0 | 29.2 | native 4.45 MP throughout | none |
| Soak 10 min, Smooth | 59.4 | 30.2 | average 4.35 MP; 58.7–60.0 fps every minute | 7 down, 12 up |
| Soak 10 min, Sharp | 30.0 | 28.7 | native throughout | none |

No hitch over 100 ms in any run but one (a bookmark jump); worst frame 50 ms; no sign of
heat throttling in ten minutes; 155 draw calls, 498k triangles, about 175 MB. Refresh
reads 120 Hz in Smooth and 60 Hz in Sharp (the panel follows the frame rate).
Lunar chunks took 87–117 ms each on the phone, Martian ones 29–37 ms.

What was changed because of them:

- **Both modes start at native.** The phone holds it at 60 fps; the old head start cost
  23 seconds of needless climbing.
- **Dips were terrain loading, not resolution** (they cluster in the flight and arrival
  part of each lap). Finished chunks are now uploaded about one per 60th of a second of
  frame time instead of all at once; the three frames after an upload count as "soft"
  for the governor as well; and a level that has held for 20 s is remembered, so the way
  back from a dip is one jump instead of a climb.
- The results text gains the share of late frames.
- **Headroom**: Sharp never leaves native and Smooth nearly never does, so the phone has
  room for an expensive effect behind a governor step. Anti-aliasing is the first
  candidate (thin bright features shimmer). To be confirmed on the milestone 2 build,
  which costs more per frame.

## The owner's second phone results (after milestone 4, Galaxy S23 Ultra)

One run, Smooth, build 6694574 (180 terrain patches, the robed character): **56.6 fps, 1 %
low 21.6, 5.3 % late frames**, resolution 3.61 MP on average with dips to 1.60 MP, 29
resolution steps and no feature step, 197 draw calls, 631 thousand triangles, 237 MB;
1301 Martian patches built at 45 ms and 1832 lunar at 58 ms. The milestone 1 build held
59.8 fps and a 1 % low of 45 at native.

What the log showed: at the Mars `dusk` stop the governor took eight resolution steps in
ten seconds, down to 1.60 MP, and the frames stayed late the whole stop: pixels were not
what was slow. The same on the Moon's stops with a time jump. The likely cause is the
work per frame: half again as many draw calls and patches arriving after every jump,
all shadows re-baked after a jump of the clock.

What was changed:

- **The governor tells slow work from slow pixels.** The app measures the page's own
  work per frame; when it fills more than 0.6 of the frame, late frames no longer lower
  resolution: terrain patches go instead (x0.8, x0.64, back after 15 clean seconds).
  When only frames with arriving terrain are late, terrain is let in more slowly (one
  patch a frame, then one every other frame) before anything else.
- **Smooth draws 0.8 of the patch cap** (144); Sharp, with twice the time, all 180.
- Shadow re-bakes count as arriving terrain (they were invisible to the governor).
- **The benchmark now reports** the page's own work per frame, every stop of the route
  on its own line, the shadows re-baked and the patch cap at the end: the next results
  will say where the time goes.
- Checked in the governor simulation (two new phone-like cases: ten seconds of slow work
  that fewer patches cure, and that nothing cures: resolution stays native in both).

Not known until the next benchmark: whether Smooth is steady again.

## The owner's third phone results (after milestone 5, build 27e1973)

Two runs. **Sharp** (30 fps): 29.7 fps, 1 % low 17.4, 1.9 % late, 4.32 MP on average, the
page's own work 9.8 ms of 33 ms: steady. **Smooth** (60 fps): **49.1 fps, 1 % low 12.3,
12.9 % late**, 2.39 MP on average with dips to 0.96 MP, own work 7.2 ms of 16.8 ms. The
changes made after the second results had made Smooth worse, not better.

What the numbers said (the stops are in the results, line by line):

- Stops that look at the sky (Mars `sun` and `dusk`, the Moon's `dusk`) held 60 fps.
  Stops that look at ground were late in step with how much new ground arrives there, at
  any resolution: 13 % late at 1.14 MP (Mars `ship`), 17 % at 1.50 MP (Moon `ledge`).
- At the Moon's `wall` and `ship` the picture was at full size, **49 % of the frames were
  late for 24 seconds and the governor did nothing**. That is the pace lever's signature:
  at its slowest setting one patch is uploaded every other frame, and every frame with
  an upload came late.
- So the cost was per frame with an upload, not per patch, and spreading the uploads out
  (the "fix" after the second results) multiplied the late frames. The first run after
  milestone 4, which uploaded several patches in one frame, had 5 % late.

Why a frame with an upload is late (not measurable from here; the reasoning, and what
the next benchmark will confirm or refute): three uploads a changed texture at the draw
call that first uses it, which is in the middle of the scene's render pass, and asks the
GPU to build its mip maps there. A phone's GPU draws in tiles: to run that second job it
must write the half-drawn picture out and read it back afterwards, at a cost that grows
with the picture's size. That matches every line above.

What was changed:

- **The ground is one draw call.** All chunks share four texture arrays (vertices, morph
  heights, normal maps with their mip maps, baked shadows), one layer per pool slot, and
  one instanced mesh draws every visible chunk; an instance is sixteen numbers
  (`src/terrain/chunkPool.js`, the vertex shader's notes in `terrainMaterial.js`). The
  480 meshes, materials and pairs of textures are gone. Draw calls at the Mars ledge:
  156 before, 20 after. The page's own work per frame in the headless profile
  (`scratch/prof.mjs`, software GL, so only the ratio means anything): 5.5 ms before,
  2.8 ms after; drawing the ground went from 2.67 ms to 0.10 ms.
- **New ground reaches the GPU between frames**, at the start of a frame's work and
  before any of its drawing, with plain WebGL calls into one layer of each array. The
  worker makes the normal map's mip maps (a box filter by area, as the GPU's own); the
  GPU is never asked to build any. Re-baked shadows wait for the same moment.
- **The governor**: a third of all frames late is acted on whatever their kind (the bar
  for frames with terrain arriving was 0.6, which is how half the frames stayed late
  for 24 seconds); when terrain is already let in at its slowest pace the patches go
  next, then pixels. Shadow re-bakes no longer count as arriving terrain (they made
  every frame after a clock jump "soft").
- **The benchmark reports** how many frames took in new terrain and how many of those
  were late against the rest, and how many screen refreshes the frames took.
- The picture is unchanged: `ledge` and `wall` on Mars differ from the reference by a
  mean of 0.03 and 0.00 of 255.
- Smooth still draws 0.8 of the patch cap. With one draw call a patch costs the page
  almost nothing, so this can probably go back to all 180: decide from the next results
  (one change at a time; the phone is the judge).

## Milestone 11 plan: the painted look

**The owner's word** (after a review of the look, with nine pictures of a stylised
landscape game as reference): change the direction to that style, "full permission to go
back and change everything", starting with Earth and the forests.

**What is taken from the references, and what is not.** Taken: the principles, which are
those of the landscape poster. Few colours, each time of day a pair of them (the light's
and the shade's); shade that is coloured, never black; the far ground lost in the air
layer by layer, each ridge a flat shape a step nearer the sky; trees, rocks and grass
drawn as bold shapes known by their outline; a big soft Sun. Not taken: that game's
artwork, its palettes picture for picture, its places or its interface. The reference
pictures are not in the repository and nothing is traced from them. Our places stay the
real ones (elevation, land cover, species, weather, the sky's geometry); only how they
are drawn changes. The owner's character was always the fantastical thing in the
picture; now the picture meets it halfway.

**How, in this engine** (all generic and data-driven: a world's `look` block and its
existing numbers; a world without `look` is drawn as before, so the other worlds change
one at a time):

1. *Air*: the look's haze is real scattering, only much more of it and low: Earth's
   `atmosphere.dust` becomes a blue layer 2 km deep (it was a clear day's grey haze, a
   tenth as strong). Every table of the sky follows from it, so far ground fades to the
   colour the sky really has at the horizon, and a low Sun goes red through it.
2. *Light*: `paintLit` (two tones with a soft edge) in place of the cosine on the ground,
   rocks, trees and grass; `skyLight` stronger and more saturated under the look, so
   shade takes the sky's colour. `paintColour`: surface colours cleaner and nearer the
   middle. Less grain in the ground (`detailStrength`).
3. *Grade* (`render/look.js`, in the composite pass): saturation, contrast and two tints
   (the dark half of the picture, the light half), keyed by the Sun's height: day, low,
   dusk, night. Fades from 40 km up: a planet from orbit keeps its own face.
4. *Forest*: tree shapes rebuilt (`treeGeometry.js`): skirts of boughs, tufts, cut lumps,
   every face flat. Grass (`life/grass.js`): a lattice of tufts fixed to the ground that
   wraps round the camera, the ground under it from a small table kept on the CPU.
   Rocks lit by their faces, and larger.
5. Then: clouds and the Sun's glow, water, light shafts; the governor's steps; the other
   worlds.

**Cost**: the look is cheaper per pixel than what it replaces where it replaces it; the
grass is new work (124 000 triangles when all of it is drawn) and has a governor step.
Not measured on the phone.

## Milestone 11, first delivery: what was built

Earth in the painted look, and its forests. Seen in pictures (660 x 309, the test
machine): the South Rim at dawn, at dusk, a spruce and aspen forest on the Kaibab
Plateau, a hardwood forest in Vermont at a low Sun, the forest from the air.

- **Air, light, grade**: as planned. Tuned by looking: the sky's light on things 1.35
  times the physical and turned a little toward green-blue (at 1.7 and plain blue, trunks
  and shade were lavender); colour cleaning 0.7; `paintColour` is not applied to the
  grass (its colours are chosen already, and came out lemon).
- **Trees**: all eight shapes rebuilt from flat faces. A spruce as cones of boughs was a
  stack of paper cones from below; it is now eleven plates of boughs that hang at their
  tips. Broadleaf crowns are twelve small lumps (seven large ones were blocks overhead).
  Leaf bunches as a three-tone pattern on every crown. Pale trunks carry dark scars.
- **Grass**: `life/grass.js`. 166 000 triangles when all of it is drawn; governor step
  `grass` (half the tufts).
- **The Sun's beams**: with the bloom step. The Sun's own disc is kept out of the sum
  (it showed as dots).
- **Clouds**: two octaves, a clean edge, two tones under the look.
- **The opening place** moved 900 m west along the South Rim to level, wooded ground at
  the edge (`scripts/find-vista.mjs`, new: level ground with the land falling away
  ahead, from the streamed elevation), and to 06:18 local time: the canyon at dawn
  through the trees. The old place was a bare spur.
- **Rocks**: lit by their faces, up to 2.6 m.

**Not done, or weak**
- The other fourteen worlds are still in the physical look. Mars and the Moon next.
- The character is not restyled; it is lit by the same new light on Earth.
- Trees: every tree of a kind is the same mesh turned; the fork of a broadleaf trunk
  shows as a row of Ys from below. Bushes (juniper, pinyon) are plain lumps up close.
- Ground: still the map's colours cleaned, with no drawn paths, flowers or fallen logs.
  Steep rock is not faceted (`facets` is carried but unused).
- Water, the cloud volume, rain and the far forest are not restyled (only lit by the new
  light and graded).
- Night and the views from orbit were not looked at in the new look.
- Nothing is measured on the phone. The grass is the one new cost.

## The owner's sixth phone results (build c51fae1) and the third painted delivery

**The numbers** (Earth benchmark, Smooth): **56.8 fps** on average (it was 15.2), Earth
55.8, the flight 56.7, the Moon 57.8; 4.9 % of frames late; frames are two refreshes long
(95 %) or four (4.5 %), never three: the page is paced at 60 on the 120 Hz screen, and a
frame that misses waits a whole one. Resolution 1.98 MP on average: about 1.2 to 1.4 MP
on Earth, 2.2 to 2.9 on the Moon. The page's own work 5.8 ms (the figure 2.2 of it).
**The cure of the fifth results held**: nothing leaves the main picture, its depth is no
texture, and the frame rate is back.

**What the cost test could and could not say.** Its "everything on" ran from 36 to 61 ms
over the test at one view (the phone warming, ground arriving), so the single savings
measured first read as costing 5 to 14 ms *more* when switched on (detail, soft shadows,
contact, at all three views): that is the drift, not the savings. Believed, because they
are large and the same kind at each view: the ground and what stands on it are the bulk
of the picture (24 to 30 ms of 55), the sky 15 to 20; the Sun's beams 4.4 ms at the
opening view. Not believed: anything under 3 ms. **To do before the next reading**: time
each saving against a baseline taken immediately before it, not every third.

**What was done from it.**
- The Sun's beams are worked out on a picture a quarter of the view each way and added
  in the last pass (they were twelve looks a pixel at the screen's own 4.45 MP).
- Nothing else in the governor: it held 60 with resolution alone and one feature step
  for four seconds. Earth's low resolution (1.3 MP of 4.45) is the next thing to win
  back; the ground shader is where the time is.

**What the owner asked for** (with the results): clouds denser and better, and *"I don't
like how they move when I move, they should be doing their own thing"*; trees with
better leaves; and *"I want things to load before I get there, I don't like how things
look really blurry before I show up"*.

**Clouds that keep their place.** Four things tied the clouds to the traveller; all four
are gone.
- The base stood over the ground *under the traveller* and followed it: fly off the
  canyon's rim and the whole sky sank 1 500 m in a few seconds. It now stands over the
  country's height read from the world's coarse elevation, smoothed over a degree
  (`CloudVolume.setGround`): a thing of the place.
- The slices were of the view's depth: turn the view and a cloud passed from one slice
  to another, and was cut to a different outline. They are now of distance from the eye,
  laid as curved sheets (a 24 x 12 grid, each corner at the depth that distance has along
  its own ray).
- The clean edge was cut slice by slice: a cloud that lay across two slices thinned as
  the boundary passed through it, which is whenever the traveller moved. The cut now
  goes by all the cloud along the line of sight (the lay pass reads the six slices).
- Beyond the volume's reach the shell drew *other* clouds (its own noise at another
  height): clouds changed 16 km ahead as one flew. The shell now shows the same clouds:
  the same cover rule, the volume's noise at the height where its masses are widest.
- Besides: the fair-weather field is placed by the world's radius, not the layer's (it
  shifted when the layer's height did); the shapes turn over five times more slowly
  (`change` 0.006: at 0.03 the noise ran through the layer at 156 m/s and the clouds
  boiled); the thinning round the eye is 120 m and to a third, not 300 m and to a tenth
  (a cloud ahead melted before one reached it).
- Denser and better: `dense` 2.8, a steeper edge in the density itself, fair-weather
  cover 0.47 (at 0.62 the sky was a grey lid), the march's grain taken out in a pass of
  its own before the lay.

**Things ready before the traveller arrives.**
- `Terrain._preload`: a patch the camera does not need finer is asked whether the place
  ahead would: three seconds along the traveller's velocity, or, on a GO trip to a
  place, the point over the place where the trip ends (`terrain.dest`). If so its
  children are built and kept **without being drawn** (drawing them early would spend
  the patch budget on ground far off), after everything the camera itself needs, and
  kept up to date with the maps like drawn ground.
- The map rings look ahead: a new mosaic is centred up to half a tile along the way and
  is asked for when the place twelve seconds ahead nears the edge; a GO trip's
  destination gets its mosaics while the traveller is still on the way (when the ring is
  not in use under the traveller: too high, or outside it).
- **Not measured**: how much sooner the ground is sharp on the phone. The patches are
  built by the same three workers; ahead-of-need work competes with nothing the camera
  wants (it queues behind it) but it is more work in all: watch "terrain patches built"
  and the late frames while ground arrives in the next benchmark.

**Leaves.** Every tree shape has a third, close level (within 34 m): the near tree with
3.2 times the leaves, each a leaf's own shape (narrow at the stalk, widest two fifths
out, a point) and standing at several depths over the mass, each lighter or darker than
its neighbours. Governor step `tree-leaves` (the close level off).
A crown seen near is leaves round a smaller, darker heart (the lumps at 0.7 of their size
close, 0.86 near): with the lumps whole the leaves lay on a green ceiling and did not read.

**Tests of this delivery.** Build check; `npm run smoke` (16 checks, 22 shaders, 15 of 16
textures at most); `npm run target` (a GO trip in the real game, with the destination
being got ready on the way); `npm run foot` on Mars. **`npm run foot -- --world earth`
fails one check** ("super speed": the runner leaves its feet at 16.5 m/s on the sloping
rim of the opening place before reaching 25; the test was written for Mars and the Moon,
and nothing on foot was changed): look at it with the next on-foot work. Pictures at
660 x 309: the opening view, the meadow, among the clouds twice (the view turned 40
degrees), the hardwood and the spruce forest. **Not done**: the stability test on the
new clouds, pictures of load-ahead (it shows only in motion), Everest, night, orbit.


## The owner's fifth phone results (build 345e2b7) and the second painted delivery

*The first Earth benchmark to come back, in Smooth, with two screenshots and a list of
what the owner did not like.*

**The numbers.** 15.2 fps on average, a 1 % low of 4.2, half the frames late; Earth 14.0,
the flight 15.6, **the Moon 16.0**. The governor at its floor (0.96 MP, 22 savings) and
nothing cured. The page's own work 4.4 ms a frame: not the cause. The cost test, which
times frames until the GPU has drawn them: about 100 ms a frame with everything on at
2.07 MP, the same with every saving on, the same at 1.00 MP, and **51 to 58 ms at the
full 4.45 MP**. Build fa0c4c9 ran the Moon at 54 fps on the same phone.

**What that says.** A cost of 50 to 100 ms a frame that no resolution and no feature
changes, on every world, and that is *smaller* when the whole target is in use, is not
shading: it is whole pictures being written out of the GPU's tiles and read back. Two
things in the frame did that, both new since fa0c4c9 and both there on every world:
the main picture's depth had been made a texture (for the cloud volume to read), and the
cloud volume was marched in the middle of the main picture (leave the target, draw
elsewhere, come back). On a tile-based GPU each is a full store and load of a 4.45 MP
half-float picture and its depth. At full resolution the clear covers the whole target
and one of the loads goes away, which is the 100 against 55.

**What was done.**
- The depth is a plain buffer again; nothing leaves the main picture between its clear
  and its last draw (`post.resumeScene` is gone).
- The cloud volume no longer reads depth. It is marched **before** the main picture as
  six slices of the view's depth, side by side in one small target, and laid over the
  ground as six full-screen passes at the depths where the slices begin: the depth test
  hides cloud behind a ridge, to within a slice (`sky/cloudVolume.js`).
- The benchmark's cost test now also times the frame **with a part of the picture left
  out** (grass, trees, the figure, the ground and what stands on it, the sky, everything):
  if the fixed cost is still there, those lines say where it lives.
- The Sun's beams got a governor step (12 looks a pixel at the screen's own size).
- This is a diagnosis from numbers, not a measurement of the cure: **the next benchmark
  is the proof.** If the Moon is still slow, read "with a part of the picture left out"
  first; the next suspect is the ground shader's size (Earth's blocks compiled into
  every world's shader: make them compile-time).

**What the owner asked for, and what was built.**
- *"I don't like how it looks when I'm flying over something"* (a screenshot over the
  Bahama shallows: brown ground with teal blobs): see "Flying over" below.
- *Grass much denser, and flowers, different ones in different areas*: three lattices
  from the one ground table (`life/grass.js`): thick grass close by (0.22 m apart, a box
  of 26 m), grass farther out (0.5 m, 72 m), flowers (0.45 m, 43 m): about six times
  the blades underfoot. Seven kinds of flower (daisies, poppies, lupins, buttercups,
  fireweed and heather, orange poppies, the big pink flowers of the wet tropics); which
  grow where follows the land cover, the latitude and the height, one kind to a patch
  some 40 m across, in drifts with bare grass between. The governor's step now lowers
  the count of instances (they are drawn in a scrambled order), so the work goes down.
- *Trees with a lot more leaves, variety, moving in the wind*: every shape is built in
  three variants (proportions, lean, how the masses sit) and each tree takes one by its
  own number; single leaves stand out of every crown (`sprigs`) and flutter each in its
  own time, harder in a harder wind.
- *Leaves fall when it is extra windy or when I fly by superfast*: in a gale every tree
  sheds (green out of season); a traveller passing trees faster than 18 m/s tears
  leaves off them (`life/leaves.js`).
- *Dense, changing clouds to fly through*. What was wrong, seen in pictures: outside the
  day's weather systems the sky was **empty** (the day's cloud map has 10 km pixels and
  a clear reading below half cover), inside them it was a flat sheet, and inside a cloud
  the view was one flat colour. Now: **fair-weather cloud** (`clouds.volume.fair`): where
  the map is clear there are still fields of small heaps with clear stretches between,
  in the volume and in the far shell; the volume is 2.2 times as solid (`dense`) and its
  shapes turn over with time (`change`); the Sun lights it as a painter does (full on
  the tops and the sides turned to it, shade in the hearts and under the masses; with
  the cloud made denser the physical sum had every cloud in its own shadow, dark blue
  against the sky); from 900 m off the cloud is cut to a clean shape (the march is soft
  and grainy at a quarter of the view); close by, wisps are torn out of it and the
  cloud round the eye is thin (`clear`, 300 m), so flying through one is shapes going
  by. The volume now reaches 16 km (it was 45: five steps over the last 27 km drew
  speckle, not cloud); beyond, the shell.

- The cloud base rides `base` metres over the ground under the traveller: with cloud now
  everywhere, a base over the sea put the canyon's rim (2 100 m) inside it.
- For the phone: each of the six cloud passes covers only the part of the sky where its
  slice can hold cloud; from the ground with a level view that is under one screen of
  blending instead of four to six.
- Reference pictures of this delivery (`docs/shots/`, at 660 x 309: there was no time for
  the full set at the phone shape): `earth_ledge`, `earth_dusk`, `earth_forest_spruce`,
  `earth_forest_hardwood`, `earth_meadow_cloud`, `earth_prairie`, `earth_clouds_air`,
  `earth_florida_air`, `earth_hurricane`, `earth_tropics_rain`.
- **Not looked at after these changes**: Everest, the Pacific at dawn, the lakes and the
  Colorado (the haze and the land's colours changed there too), night, and the view from
  orbit down to 40 km. Stability (`npm run stability`) was not run on the new grass,
  flowers and clouds: the cut edge of the far clouds may crawl in motion.

### Flying over

The owner's picture (brown flats with teal pools under a yellow haze) and two of the same
kind made here (Florida from 900 m and from 2 200 m: a grey-green blur) say three things.
- **The haze was far too thick from the air**, most of all toward the Sun. Earth's haze:
  scattering halved and a little less forward, standing higher (scale height 4 km for
  2.2), so that on the canyon's rim the air is nearly what it was. Check `ledge` and
  `dusk` after.
- **The land had no clear colour.** The satellite picture's vegetation is dark and
  brownish (its mean over each land-cover class was measured: forest 30/46/13, grassland
  103/90/59 of 255). In the painted look the tile worker now draws each pixel 60 % of the
  way to a clean colour of its class (`pictures.colour.cover.paint`, `colours`): forests
  green, grassland gold-olive, crops, wetland; deserts, snow, towns and water keep the
  satellite's. Only the ring near the traveller is painted (the globe from far keeps
  the satellite's face).
- **Nothing between the 600 m map and the trees.** The ground shader lays stretches of
  lighter and darker ground some hundreds of metres across, with clean edges (two looks
  at the detail texture's slow channel, placed by direction so they have no seam), and
  out to 900 m the ground wears the colour of the grass that is drawn blade by blade
  near the traveller (`uGrassTone`), so the field does not end at the last blade.
- The pools themselves were right (low ground a metre over the sea with water in its
  hollows: tidal flats); what made them ugly was the bare brown round them.

## The owner's Earth screenshot (build 18c4a23)

One picture, no benchmark: `18 fps · 0.96 MP · Smooth`, the figure hovering over a
smooth sea to the horizon, a clear twilight sky, nothing else. So: the fewest pixels the
governor allows, every saving switched on (the cloud layer is step 15 of 22 and it was
gone), and still a third of the frame rate. Where on Earth it was taken is not known (a
calm sea at dawn: at the scene's date that is the Pacific west of California).

**What was found** (headless, `scripts/play-profile.mjs`, a new script: the real game in
play mode at a place, the page's work by part, the governor's level, patches built):

- At the governor's floor Earth's sea costs no more per frame in the software renderer
  than Mars' ledge does (1.7 s against 2.2 s a frame at the same size). The picture is
  not what is three times too slow.
- **Arriving at a place on Earth built about 600 patches for the 85 drawn.** A place's
  three elevation rings arrive one after another (and one or two again, see TileRings),
  and after each of them every loaded patch the ring touched was built again: the same
  ground up to five times, and five times as many patches as are on screen (430 are
  loaded). Each came to the GPU in a frame of its own, and on the phone a frame that
  takes in ground is the frame that comes late (third and fourth results). With ground
  arriving in every frame the governor has nothing to compare ("frames without new
  terrain") and takes it for slow pixels: resolution to the floor, then every saving,
  curing nothing. The way back was one saving every three or four seconds.
- **The view itself was true, and dull.** The same place at full quality (30 N, 140 W,
  the scene's date): dawn over the open Pacific in the calm of the horse latitudes, wind
  1 m/s, a clear sky. With that wind the wave table gave a sheet of glass to the horizon.

**What was done**

- Stale ground is built again **once**, when no elevation is on its way any more (ten
  seconds at most), and **only what is drawn**, with the parents the drawn patches lean
  on; the rest stays stale until it is drawn. It goes to the GPU **in bursts**, up to
  sixteen patches twice a second. After a jump, fine ground waits up to five seconds
  for elevation (as at the start). Here: 600 builds became about 450 with the wait not
  working (a second a frame); on the phone the 280 of the first descent should mostly
  wait too.
- The governor: the cloud layer is never switched off (step `clouds` now takes its
  shadows on the ground), rain thins to 40 % instead of stopping, savings come back
  three at a time (from the floor: all off again in 21 s in the simulation, was 75 s).
  Two new cases in `npm run govsim`.
- The open sea is never flat: `waveScale` has a floor (0.3, a low swell), since waves
  raised far away keep rolling through a calm. Lakes and rivers take an eighth of it.
- **Instruments**, because the cause above is inferred, not measured: the one-line
  read-out says how many savings are on and `maps` while ground is being built again;
  the full read-out has the page's own work by part (`perf/profile.js`); the benchmark
  prints the largest parts at every stop, and after its lap runs a **cost test**: at
  the first world's opening view and at the world's `scene.costViews` (Earth: in the
  hurricane, in the forest), with the picture held at 2.07 MP, each saving is switched
  on alone and frames are timed from their start until the GPU has drawn them (reading
  one pixel back waits for it). A frame's length on a phone is a whole number of
  refreshes; this is the first measure of the GPU's time that is not.

**If the next benchmark still shows Earth slow**: the cost test says which effect; the
parts say which work. Candidates not yet ruled out, none visible headless: the cloud
volume's switch to its own small picture and back in the middle of the frame (a tile
GPU stores and reloads the whole HDR picture and its depth for that), the scene's depth
kept as a texture, heat from the workers.

## The owner's fourth phone results (build fa0c4c9, after milestones 6 to 9)

Smooth: 54.4 fps (was 49.1), 1 % low 15.1, late frames 7.91 % (was 12.92 %). Sharp: 29.2
fps, 3.60 % late.

- **The stutter of the third results is cured**: frames that took in new ground were
  late 10.5 % of the time, the rest 7.0 %: arriving terrain no longer decides whether a
  frame is late (it was every such frame before the ground was drawn from texture
  arrays). The page's own work is 4.8 ms a frame.
- **What is left is pixels.** A frame lasts 2 screen refreshes or 4, almost never 3: the
  phone shows 60 or 30, nothing between, so a picture slightly too sharp costs half the
  frame rate. Mars holds 60 fps at 1.2 to 2.0 megapixels (the ship view least), the Moon
  at 3.3 to 4.45.
- **The governor lost 15 seconds at the Mars ledge** (48.8 % late there): 6 s before it
  acted, then terrain let in more slowly twice and fewer patches twice (the wrong levers:
  the work per frame was 5.6 ms), then eight single resolution steps. Sharp did the same
  at the Mars ship view (39.6 % late).

Changes: terrain levers only when frames without new ground are seen to be on time while
those with it are late; with most frames late the resolution comes down in strides (up
to four steps at once); each world's held resolution is remembered per mode in the
browser and a return starts from it; a world never seen starts Smooth five steps down
(53 % of the pixels) and climbs. `govsim` has the phone-on-Mars case (must settle within
4 s on resolution alone). An **Earth benchmark** button runs the same route from Earth.

Not done, and why: Mars at 60 fps is a soft picture (1.2 to 2 MP of 4.45). The cure is a
cheaper Mars pixel (its haze, its shadows), which needs each feature's cost measured on
the phone; the owner asked for Earth first.

## Milestone 10 plan: a living Earth

**The foundation changes.** Earth was five sites at 90 to 190 m on a globe at 28 km a
pixel, with one colour map at 10 km. Rivers, coasts and forests need the real planet
everywhere, and that is far too much to ship in the page. So Earth streams, from public
services that need no key and cost nothing (both answer any web page, checked):

- **Elevation**: the Terrain Tiles on AWS Open Data (`s3.amazonaws.com/elevation-tiles-prod`,
  the set the five sites were cut from; land and sea floor).
- **Colour, land cover, canopy height, water, rain, clouds, lightning**: NASA GIBS
  (`gibs.earthdata.nasa.gov`): Blue Marble Next Generation by month, MODIS land cover
  types (IGBP, 500 m), GEDI canopy height, the land-water map, IMERG rain, MODIS cloud
  top height and thickness, the LIS lightning climatology.

Design (generic: a world file lists `tiles`; nothing in the engine says "earth"):

- **Rings.** Three square mosaics of elevation tiles round the traveller, at 30 m, 300 m
  and 2.4 km a pixel (about 30, 300 and 2 400 km wide), made in a worker of their own and
  handed to the height code as ordinary rasters with feathered edges. The bundled globe
  stays underneath (and is all there is at the poles, without a connection, and in Node).
  A ring moves when the traveller nears its edge; ground built from older data is rebuilt
  in place, nearest first.
- **Colour and cover** ride the same rings as textures the ground shader reads by
  longitude and latitude.
- **Tests**: the headless browser cannot reach the services; the test server mirrors them
  from a cache on disk filled with curl (`?ext=` in the page's address).
- **Cost**: fetching and decoding happen off the main thread; the governor's patch and
  pace levers already cover arriving ground. Each new effect gets its own step.

Stages, each merged with a line to the owner:

1. **The whole Earth, and the sea**: the rings; the sea with real coasts, waves that
   follow the wind, colour by depth, foam on the shore; the traveller floats and swims
   instead of standing on water.
2. **Lakes and rivers**: water runs where the land's shape sends it (drainage worked
   out from the elevation in the tile worker, sized by the area upstream and the place's
   real rainfall), lakes where the land holds it.
3. **Forests**: where forest is and of what kind from MODIS land cover, how tall from
   GEDI; the trees of each region from a table of what grows there (ponderosa and pinyon
   on the Grand Canyon's rim, larch and stone pine under the Matterhorn, camel thorn in
   the Namib); trees near the traveller, canopy beyond; wind in them, leaves that fall
   and lie; the seasons by the date.
4. **Clouds to fly through**: a volume drawn at reduced resolution and laid over the
   picture by depth, shaped by a real day's cloud cover, top height and thickness.
5. **Weather**: that day's real rain; snow where it is cold; lightning where storms are
   deep, thunder late by the distance; wind from the pressure systems that pushes
   flight, cloth and trees; a hurricane with an eye; rainbows; fog.

Risks: the phone is already short of pixels on Mars at 60 fps and Earth adds more to
every pixel: an Earth benchmark after each stage decides what stays on in Smooth. The
services can be slow or away: everything must degrade to the bundled globe. Rivers from
drainage are the hardest part to get right at the seams between rings.

## Milestone 10, stages 1 and 2: what was built

- **Earth streams**: three elevation rings (2.4 km, 300 m, 30 m a pixel) and a colour
  ring (600 m) round the traveller, from AWS Terrain Tiles and NASA GIBS, through a tile
  worker; ground built from older data is rebuilt in place. The Grand Canyon from Mather
  Point is now the real canyon at 30 m (buttes, side canyons), and so is everywhere else
  on Earth between 85 degrees north and south. Settles in about 100 s in the test
  browser at a small picture size (the bundled-only Earth took about as long).
- **The sea**: the map decides the shore; coastal water gets a bed; depth gives the
  colour (pale shallows to blue); sixteen wind waves, the eight longest lifting the
  surface near the traveller; the Sun's glint follows the waves; foam at the waterline.
  Seen: open sea off Hawaii's Big Island with Mauna Kea on the horizon; the Kohala shore.
- **Standing in water**: the figure sinks to 1.25 m and rides the waves, wades and swims
  slowly, raises no dust; rocks do not stand in water.
- **Rivers and lakes** from the land's shape and the real rainfall (see ARCHITECTURE,
  "Water"). Checked at the Grand Canyon: the Colorado comes in from Lake Powell's side
  with 594 m3/s, runs the inner gorge at 740 m (Phantom Ranch is at 740 m) carrying
  635 m3/s, 139 m wide; a side creek runs down to it. The real river carries about 500.
- Governor: step `waves`. The terrain shader reads 15 of a phone's 16 textures.
- **Not done**: a swimming stroke (the figure treads water upright); water seen from
  below; flow direction in the look of a river; waterfalls; lakes are untested by eye;
  land below sea level (Death Valley, the Dutch polders) is flooded; rivers do not line
  up across the edge between two rings; a river's colour is the sea's.

## Milestone 10, stages 3 to 5: what was built

- **Forests** (ARCHITECTURE, "Trees and leaves"): where forest is, of what kind and how
  tall from NASA's land-cover and canopy-height tiles; the species from a table of each
  region's own trees. Seen: pinyon and juniper on the Grand Canyon's South Rim (1 500
  trees round Mather Point, with ponderosa and aspen); spruce, ponderosa and aspen on the
  Kaibab Plateau; 3 761 red oak, sugar maple and beech in a Vermont wood in October, red
  and gold, their leaves on the ground and in the air. Beyond 240 m the forest is raised
  as a whole by the ground shader; from the air it is a green canopy over the hills.
- **Clouds with depth** (ARCHITECTURE, "Clouds with depth"): a volume to 45 km, marched
  at a third of the view and laid over the picture by depth; the old shell beyond.
- **Weather** (ARCHITECTURE, "Weather"): Earth has the weather of 8 September 2017, from
  NASA's maps of that day: hurricanes Irma, Jose and Katia stand in the Atlantic (they
  are in the cloud map the globe wears from space, in the rain map and in the wind, which
  circles each of them); rain and snow fall under the cloud, the ground gets wet and
  shines, the cloud overhead dims the Sun and the sky, lightning strikes where the rain
  is hard under deep cloud and its thunder comes late by the distance. The three
  hurricanes are places in the target list and the journal.
- Governor steps added: `rain`, `leaves`, `tree-shadows`, `trees-far`, `waves`,
  `cloud-steps`, `cloud-volume` (22 in all).
- **Not done, or weak**: a tree is a few lumps on a stick up close; no undergrowth or
  grass blades; the far forest turns with the season in patches without knowing which
  trees are evergreen; clouds are grainy at the small picture size and have no memory
  between frames (no temporal smoothing); rain does not show as shafts from afar; snow
  does not lie; the weather does not move or change with the clock (one day, standing
  still); no fog, rainbow, tornado or aurora; the wind only carries a hovering figure.
  None of it has been measured on the phone.

## Milestone 10 review (before the checkpoint)

One workflow: four reviewers (tiles and water; trees and the ground shader; clouds and
weather; the app, the rig and the governor) read everything since 7933ddf; a second
reviewer tried to disprove each finding, running the code in Node where it could. 30
findings, all taken as real and fixed:

- **Tiles and water**: a lake's level was spread over ground far below its outlet (water
  standing in the air); a river crossed dry pits on a causeway of its own level (a river
  now fills the pits it runs through, and banks are never raised); lake shores had steps
  of up to 50 m (the layers now fade toward a lake's edge as toward the sea's); rivers
  moved between ring positions while the ground kept the old ones (ground with water in
  it is always built again); a tile whose body stalled held its mosaic for ever; the
  world left behind kept its mosaics in its height source; two curls wrote one file in
  the test mirror.
- **Trees and water**: leaf-dropping species with the gold flag turned inside out in
  winter; the season froze above 1 500 m and jumped on the way down; the tree lattice
  did not meet itself at longitude 0; "tall canopy is forest" was applied to different
  heights in two places (how closed a canopy is now comes with the map, once); every
  tree vanished whenever a map moved (they now stay until their block's new ones
  arrive); a swimmer on a lake rode the sea's waves (the drawn ones are an eighth as
  high); the CPU's wave sum and the shader's weighted the wind differently; the clock
  the waves share wrapped every hour.
- **Clouds and weather**: cloud noise and rain were moved by the wind's speed times all
  the time passed (they slid about with every gust); the cloud's haze was read from the
  wrong part of the screen; rain, lightning and the rainbow were painted over by the
  cloud laid after them; the thickest cloud let a hundredth of the Sun's disc through;
  strokes and thunder went on in orbit; things near the camera and the ground under them
  used two laws for the same cloud's shade; the small picture's target was made anew at
  every resolution step.
- **App**: the lander and the rocks stayed on the ground of the maps that were there when
  they were placed; the sink of the last sea stayed on the next world; the camera could go
  under the water it draws only from above; a step up of resolution still on trial was
  remembered; pictures were not still on a world with weather; the walker dropped half a
  metre at every waterline.

The second reviewer of "tiles and water" found three of those fixes had moved the fault
rather than cured it, and following them up found two larger ones. What was done after:

- **Lake shores and river banks** (the reviewer's patch, checked in Node on 11.7 million
  sample pairs): a lake's level is read from the four cells round a place and eases out
  over half a cell (`DemSet.lakeS`), a lake has one level, the layers' fade toward a
  lake is continuous in place as well as in height, and a river's bank is blended whichever
  way the ground lies. A finer mosaic worked out before the coarser one's rivers were
  known is asked for again, once (`TileRings`).
- **Lakes were being made by the flood, and the real ones were not drawn.** The test that
  kept level stretches (`lower < 0.12 * rim`) could not pass: the rim was counted among
  cells that are level by definition, so every real lake was dropped (0 < 0), and the only
  "lakes" were filled pits: a sea of 71 000 km2 over Nevada, 66 000 km2 over Utah, the
  Snake River Plain, a lake on the Little Colorado. Measured on fourteen lakes at three
  zooms: every real lake is a level stretch in this elevation set, none has a bed in it.
  The rule is now the one in ARCHITECTURE ("Rivers and lakes"): level stretches in a
  hollow that can be kept full, the large ones checked against NASA's water map; pits
  only as ponds. Checked against the real sizes (km2, found / real): Great Salt Lake
  4 674 / 2 300 to 4 400, Champlain 929 / 1 269, Tahoe 460 / 490, Pyramid 468 / 487,
  Titicaca 7 089 / 8 370, Superior 67 617 / 82 100, Michigan 50 771 / 58 000, Huron
  51 510 / 59 600, Erie 23 380 / 25 700, Ontario 15 889 / 19 000, Victoria 53 199 /
  68 800, Tanganyika 24 446 / 32 900, Turkana 5 570 / 6 400; the Tisza's plain, the Po
  plain, Tulare's dry bed, Carson Sink, Black Rock Desert and the Snake River Plain are
  land.
- **Rivers lie on their ground**: a river's level is the one nearest the ground along its
  way that never rises (it stood on the filled level as on a causeway; held to the
  lowest ground so far it ran on in a trench after every pit). Along the Colorado on the
  finest ring: within 4 m under and 1.4 m over the ground for nine tenths of its length.
- **A lake's bed can lie under sea level** (Champlain's deep is in the map, and its dug
  bed went to -32 m: both were drawn as pits of sea in the lake). Bad cells in the
  elevation are mended: a mosaic over Vermont had a cell at 7 964 m beside one at
  -2 496 m, Lake Winnipesaukee one at -1 926 m.
- **A check that can fail**: `npm run lakes` (no browser, 15 s) finds thirteen real lakes
  within a factor of their real area, seven places that must be land, no region drowned,
  no step in the drawn surface at any water's edge, rivers within 6 m of their ground on
  the finest ring. Its step test was shown to fail by breaking a fix on purpose.
- **The gully layer cut 100 m gullies into real mountainsides**: made for the coarse
  bundled map, it ran at full strength over the 27 m elevation too. It now adds only
  what the map under the place cannot show (`belowDem` on `ridged`), as the roughness
  layer already did. Mountains near the traveller are the real ones.

## Milestone 6 plan: the new worlds

The owner's word: "finish up the rest of the milestones". No stop after every two worlds;
each stage is merged and the owner gets a short message.

**Sources** (all on the USGS planetary map server, public domain, which the cloud machine
may reach; the bucket behind it lists itself, see `scripts/fetch-worlds.py`):
elevation for Phobos (HRSC), Mercury (MESSENGER, 665 m), Venus (Magellan, 4.6 km),
Enceladus (Cassini shape model), Pluto and Charon (New Horizons, 300 m, the sunlit
hemisphere), Ceres (Dawn, 60 px/deg); image mosaics for all of those and for Deimos, Io,
Europa, Ganymede, Callisto, Mimas, Tethys, Dione, Rhea, Iapetus, Titan (ISS, through the
haze), Triton; whole-disc maps of Jupiter, Saturn and Neptune. Where no elevation exists
(Deimos, Io, Europa, Titan, Triton) the shape of the ground comes from terrain recipes
written for what the place is known to look like, under the real image map.
**Orbits and spin**: fitted to JPL Horizons and checked against it by a script that
fails beyond a tolerance (`scripts/fit-orbits.py`, `scripts/check-ephemeris.mjs`); the
owner allowed the Horizons server for this.

**Engine work first** (generic, no world-specific code):
1. A world's data loads when you come near it or aim a trip at it, not at start-up, and
   only the last few worlds stay in memory.
2. Every body of the catalogue is in every sky (a point, then a disc, then a globe).
3. Sky globes from one colour map (the moons you cannot land on, the gas giants), a globe
   whose bands drift at their own speeds (Jupiter, Saturn, Neptune), rings with their
   shadow on the planet and the planet's shadow on them (Saturn).
4. Thick air: Venus and Titan (the Sun is not a disc from the ground; the light is the
   sky's). Thin air: Triton, Pluto.
5. Small bodies: Phobos and Deimos are tens of kilometres across with almost no gravity;
   walking, jumping and the speed law have to stay sane there.
6. Terrain recipes for what elevation data cannot give: grooves (Phobos), lava plains and
   calderas (Io), ridged ice (Europa), tiger stripes (Enceladus), dune seas (Titan),
   cantaloupe ground (Triton), nitrogen ice plains with polygons (Pluto).

**Order**: engine items 1 and 2 with Phobos and Deimos (they are already in the sky);
Mercury; Jupiter with Io and Europa; Saturn, rings, Enceladus and Titan; Venus; Neptune
and Triton; Pluto and Charon; Ceres. Each world: data file, start site at a real place
and a real date, five views, two or three landmarks, a place list for the target picker,
screenshots judged against spacecraft pictures.

## Milestone 6: what was built

Twelve new worlds to land on, as data files: **Phobos, Deimos, Mercury, Venus, Io,
Europa, Enceladus, Titan, Triton, Pluto, Charon, Ceres**. With Mars and the Moon that is
fourteen (Earth's surface is milestone 9). Every other planet and large moon is in the
sky at its true place: Jupiter (the Cassini map, its belts drifting), Saturn with rings,
Uranus, Neptune, Ganymede, Callisto, Mimas, Tethys, Dione, Rhea, Iapetus.

- **Where the shape of the ground comes from.** Real elevation: Phobos (HRSC), Mercury
  (MESSENGER), Venus (Magellan), Enceladus (the Cassini shape model), Pluto and Charon
  (New Horizons, the hemisphere it saw), Ceres (Dawn). From the picture itself: Io's lava
  floors are cut where the colour mosaic shows dark lava, and its named mountains stand
  at their mapped places and heights; Titan's sand seas lie low where the near-infrared
  mosaic is dark (a stand-in: no elevation of Titan is on the map server). From recipes
  for what the place is known to look like: Deimos (its measured ellipsoid), Europa
  (double ridges, chaos at the named chaos regions), Triton (cantaloupe terrain, sulci).
- **Every world wears its real image map** as the colour of its ground and as its globe
  seen from afar. Brightness-only mosaics were coloured by brightness (Europa, Pluto,
  Titan, Callisto, Ceres, Enceladus); ground no spacecraft saw (Pluto's and Charon's
  south, Triton's north) is filled with the mean of what was seen, with no feature
  invented. A 180-degree mix-up in half the sources (the projection's centre longitude)
  was caught by checking landmarks: Ceres' bright spot, Rachmaninoff's floor, Sputnik
  Planitia, the leading and trailing sides of the icy moons.
- **Orbits and spin** of 21 bodies fitted to JPL Horizons and checked against it
  (`scripts/check-ephemeris.mjs`): planets within 0.02 to 0.15 degrees over 1950-2100,
  moons within 0.2 (Mimas 1.1 with its resonance swing). The Moon (3.5 degrees at worst)
  and Phobos after 2030 are the weak ones: mean ellipses cannot follow them (known
  problem below).
- **Thick air worked with the existing model**: Titan's orange smog and Venus' yellow
  overcast are the same atmosphere code with their own numbers; the Sun is lost in both.
- **Ice has a sheen** (`surface.gloss`); **rings** with shadows both ways; a **start
  screen list** to open on any world; the target list sorted nearest first.
- Tools made on the way: `scripts/peek.mjs` (a CPU sketch of the view from a place in
  seconds, for choosing sites and times of day without a five-minute headless picture),
  `scripts/worlds-test.mjs` (`npm run worlds`).

Decisions:

- No stop after every two worlds (the owner asked for the rest of the milestones in one
  go).
- Saturn, Uranus and Neptune are drawn from colour lists, not pictures: the whole-planet
  pictures on the map server are not free to pass on (docs/ASSETS.md, "Not used").
- On foot gravity never counts for less than 1 m/s2: at Phobos' real gravity a jump
  lasts twenty minutes.
- The camera's "up" stays the direction from the body's centre, so on Phobos and Deimos
  the horizon slants like a hillside. Making "up" follow the local ground was left out:
  it touches the whole flight model.

## Milestones 7 and 8: what was built

**Getting around (7).** The clock can run faster, slower and backwards (thirteen speeds
from ten days a second backwards to ten days a second forwards; `.` `,` `/`), stop, jump
to today or to any date from 1950 to 2099 (the years the orbits are fitted for). A map of
the solar system as it is at the game's date (`src/ui/map.js`, a 2-D canvas): orbits,
every body, the traveller; drag, pinch, tap a body, then Set target or GO; "Look closer"
shows a planet's moons. GO trips reach anywhere in under half a minute (Pluto from Mars:
27 s); at those speeds streaks of light rush past (`src/fx/warp.js`). A menu (MENU, Tab)
holds everything that is not flown with the stick.

**Things to do (8).** A journal of 88 real places on the fourteen worlds: a place is
found by going there (a chime, its name and one line about it), and the journal counts
them. The browser remembers the places found, where the traveller last stood on each
world (Play returns there) and the sound switch (`src/core/save.js`, localStorage only).
Photo mode: everything but the picture is put away, time stands still, wider / closer /
earlier / later, and the shutter draws one frame at the screen's full resolution and
saves it (a phone's share sheet, or a download). Sound, all made in code
(`src/audio/audio.js`): the suit's hum, wind where there is air (by the air's density:
loud on Titan and Venus, a whisper on Mars, none on the Moon), the rush of flight,
footsteps and landings, a shimmer at warp speed, the chime.

Behaviour changes the player will notice: the row of touch buttons is HERO, TARGET,
HOVER, ZOOM, MAP, MENU; CAM, VIEW, HUD, MODE and FULL moved into MENU. Play returns to
where the traveller last stood on that world ("To the start" in the menu goes back to
the opening place).

## Milestone 9 plan: Earth's surface

The riskiest part, because everyone knows what Earth looks like: bare ground where a
forest or a city should be is wrong in a way bare ground on Mars is not. The plan avoids
that instead of pretending to solve it.

1. **Open on places that are bare in reality**, where real elevation and real colour
   are the whole truth: the Grand Canyon's rim, Everest and the Khumbu, the summit of
   Mauna Kea, the dunes of the Namib, the Matterhorn above the tree line. Elevation for
   these at 90 to 190 m per pixel and for the globe is already made
   (`scripts/fetch-earth-terrain.py`, from the open Terrain Tiles set: SRTM and others).
2. **Colour from Blue Marble** (the same map the globe uses): deserts, ice, the green of
   forests seen from the air. Snow by height and latitude on top.
3. **The sea**: the ground below sea level is drawn as water: flat, dark, with the
   Sun's glint and the sky's colour at a grazing view, a little paler in the shallows.
   A generic `sea` feature (Titan's methane seas can use it).
4. **Air**: Earth's own numbers in the existing atmosphere model (blue sky, red
   sunsets, the ozone's blue hour).
5. **Clouds**: the real day's cloud map as a layer 4 km up, seen from below and from
   above, with its shadow on the ground; broken up with finer procedural detail because
   the map's cells are 10 km wide. One governor step.
6. **From orbit down**: the hand-over from the globe to the terrain must not show (the
   same colour map on both).
7. What is not attempted: trees, grass, buildings, rivers, waves, weather that moves.
   Flying low over a forest shows green ground. This is said plainly in the checkpoint.

## Milestone 9: what was built

Earth is a world to land on, built on the plan above.

- Elevation from the open Terrain Tiles set (SRTM and others): the globe, and the Grand
  Canyon, Everest, Hawaii's Big Island, the Namib sand sea and the Matterhorn at 90 to
  190 m per pixel. Checked against known heights: Mather Point 2 051 m (real 2 170),
  Kala Patthar 5 595 m (real 5 644), Everest 8 737 m in the data (real 8 849).
- Colour from Blue Marble (the globe's own day map) relative to the land's mean; steep
  rock takes a third of it, so cliffs under snow are rock.
- The sea (flat, dark, the Sun's glint, the sky mirrored), Earth's air (Rayleigh, a
  light haze, ozone), a cloud layer from the real day's cloud map with its shadow on the
  ground, a governor step for the clouds.
- It opens at Mather Point on the Grand Canyon's South Rim on the June solstice, an hour
  and a half after sunrise; other views: Everest from Kala Patthar, the summit of Mauna
  Kea above the clouds, the dunes of Sossusvlei, the Matterhorn from the Gornergrat.
- Not attempted, as planned: trees, grass, buildings, rivers, lakes above sea level,
  waves, weather that moves. Low ground that lies below sea level (Death Valley, the
  Dead Sea) is drawn as sea. The player can stand on the water.

## Milestones 6 to 9 review (before the checkpoint)

One workflow: four reviewers (sky, terrain drawing, height code, the app and its new
screens) read everything changed since build 27e1973; a second reviewer tried to
disprove each finding, by running the code where it could. 25 findings, all upheld, all
fixed:

- **Sky**: the world just left collapsed to a point of light at a hand-over (its globe's
  maps were never fetched while it was home: now the small copies always, the full ones
  once the traveller climbs); the home air dimmed and reddened the Moon and planets by
  their declination instead of their height in the sky (`uUp` was never set); a moon
  crossing in front of its planet was drawn behind it (far-pass slots `20 + 3k`: now
  each body's slot lies behind the whole of the one before it, rings included, and all
  are scaled to end by 45; the far pass's near plane is 0.002); rings and their edge-on
  line ignored the home air and (the line) the planet's shadow; ring textures had no mip
  maps; full maps were never let go (now freed when a body is small again, the small
  copy kept); Saturn pulled 5.8 times too hard (its ring radius stood in for its own).
- **Height code**: every value written to `c.slope` by `massifs`, `lineaments` and the
  craters' flat floors is continuous now; `cells` keeps each centre in the middle 0.4 of
  its cell, so the 27 cells searched always hold the two nearest (walls up to 149 m ran
  along lattice planes on Triton and Europa); a `where.at` place wider than 26 degrees
  ended in a wall; a `lat` limit of 0 or 90 is open and fades are in degrees (the tiger
  stripes were at two thirds strength at the start site, the dunes at half on the
  equator); Enceladus' large craters were on the equator, not in the north; Io's shadow
  rays stopped at 1 200 m under 17 km mountains (the mountain blocks now report their
  height to `ceilingAt`). `scratch` check: no jump above the local slope along lines
  through each of the reported places.
- **Terrain drawing**: rocks stood on the sea on a page that started on Earth.
- **App**: the benchmark's flight handed over to Phobos on the way to the Moon (it now
  hands over to its destination only, and fetches it at the start); most places on
  Phobos and Deimos were "found" from the start site (reach now at most a fifth of the
  radius); sound kept running on a hidden page or switched off (the audio engine is now
  suspended); photo mode: a hidden stick took touches and the target marker came back;
  one failed download counted as hundreds; the menu was rebuilt 5 times a second and
  lost clicks (only its clock line is updated now); the mouse stayed captured under the
  menu, map and journal; a date typed on a keyboard was cut off after its first part.

Behaviour changes for the player: the ground changed a little on Io's mountains,
Europa's chaos, Triton's cantaloupe ground, Pluto's ice plain, Venus' tessera, Titan's
dune belt and round Enceladus' south pole (stronger stripes); Saturn's pull is weaker;
places on the two small moons must be gone to.

## Milestone 5 plan: Earth and the Sun from space

1. **Earth as a real globe** (not landable; you stop 2 % of its radius up). NASA maps
   through the GIBS service: Blue Marble Next Generation for the day side, Black Marble
   2016 for city lights, a VIIRS true-colour mosaic of one real day (2016-09-22) for the
   clouds, the MODIS water mask for the oceans' glint. A small copy is always loaded (the
   Earth of the Moon's sky); the full maps load when Earth grows large in view.
   A generic body recipe (`globe`), numbers in `solarSystem.js`.
2. **Its air**: blue haze over the day side that thickens toward the edge, a red
   day-night line, and a thin bright blue line beyond the solid edge (a shell).
3. **Sun-glint** on the oceans, clouds over everything, **city lights** on the night side
   when the exposure allows.
4. **Bright bodies in a dark scene keep their colour** (Earth was a white blob from the
   lunar night, Deimos burnt out at dusk).
5. **Eclipses**: a body in front of the Sun dims the sunlight by the share of the disc
   it covers.
6. **Light from the world below** on things in orbit (the figure was near black over
   sunlit Mars).
7. **The Sun up close**: a surface with grain and darker edge, a faint outer glow.
8. Earth among the targets; GO to Earth; reference pictures; tests; the milestone's
   independent review (the one workflow); checkpoint with a request for a benchmark.

Status: all eight built; checkpoint sent ("Milestone 5: what was built" below).

## Milestone 5: what was built, tested and found

**Built.** Earth is a real globe (`surface.recipe: 'globe'` in `solarSystem.js`, shader in
`sky/bodies.js`): NASA's Blue Marble for the day side, the clouds of 22 September 2016
(shaded on their far side, with a shadow on the sea beside each), the Sun's glint on the
water, air that hazes the edge and reddens the day-night line, a thin bright rim of air
beyond the solid edge, city lights on the night side. Small copies of the four maps
(about 100 kB together) are always loaded; the full ones (2.9 MB) load when Earth is more
than 260 pixels across. From the Moon it is a small blue-and-white Earth with its real
phase; up close it fills the sky. It cannot be landed on (you stop 2 % of its radius up
and stay beside it). The Sun is drawn where it is from the camera and grows as it is
approached; large in view it is seen as through a dark filter, with a darker, warmer
edge and a few spots. A body that hides part of the Sun dims the sunlight on the ground
round the camera. The figure in orbit is lit from below by the world's day side. A body
far brighter than the scene is exposed for keeps its colours (Earth in the lunar night),
and a globe that fills the view is held just under white whatever the exposure meter
does.

**Tests** (final build): `smoke` (23 shaders, the terrain still the fullest at 15 of 16
textures; the globe uses 5), `foot`, `target`, `flight` pass; the governor simulation
passes with four new cases, two of which fail the run if they regress.

**Independent critic** (pictures only). Its five gaps and what was done:
1. *Earth dull and grey up close* (the exposure meter aims at a middle grey): a globe
   large in view is now brought up to just under white; richer sea colour, more haze.
2. *The Sun a plaster ball*: redone as an even glowing disc with a strong warm edge, a
   grain too fine to see until very near, small dark spots in two belts.
3. *Clouds a flat sticker*: shading on each cloud's far side and its shadow on the sea,
   a softer ramp from thin to thick. Still soft low down (the map is 10 km a pixel).
4. *City lights*: they blazed on the dark edge of an Earth exposed for its day side:
   now dimmed with the day side, so only the night side seen on its own shows them;
   finer map (4096), warmer, a wide range from sprawl to cores.
5. *Glint and day-night line*: a tighter, brighter glint, only on water and under cloud
   shadows; clouds turn warm toward the line.
Not done: Phobos a pale featureless lump and Deimos a speck (they become worlds in
milestone 6), a hard sunlit rim on the figure in orbit, faint banding in the dusk sky.

**Code review** (three lines of review, each finding checked by a second reviewer): 27
findings, 26 upheld. Fixed: the new governor logic could stop lowering resolution for
good when the page's own work passed 0.6 of the frame while the GPU was what was late
(now judged on the late frames, at 0.9 of the interval, and it falls through to
resolution); the patch lever hunted every 15 s (it backs off now) and did nothing in
Smooth (the mode's share now multiplies); Sharp did not get its patches back; an eclipse
seen from the camera darkened the whole world (hovering behind Phobos turned Mars
black: now only near the ground); the Sun's disc vanished when it filled the view from
the side; the exposure meter masked the Sun where it is from the home world; NaN risks
in the glint and in the light from below; a seam in the cloud map at the date line; a
map that fails to load stalled every screenshot; stars vanished over a third of the sky
far from home; the mode button before the world had loaded. Recorded, not fixed: the
full maps are decoded on the main thread when they arrive (a hitch of a frame or
two, once, hidden from the governor); close to the Sun the exposure has nothing to meter
and runs to its limit (the filter hides it).

## The owner's flight notes (after milestone 2)

"Fix the flying when you're going super fast and miss a planet; add gravity that pulls you
in if you're not actively flying away or choosing to hover; the Sun should have a much
stronger gravity."

Reproduced without a browser (`node scripts/flyby.mjs`): leave a Mars-sized world, aim
once at a Moon-sized world 2000 of its radii away, hold forward and boost, never touch
the view.

| | Before | After |
| --- | --- | --- |
| Aimed at the centre | never arrives: the aim slides off (up to 180°), closest pass 1283 radii, still wandering after 60 s | lands in about 13 s; the aim stays within 0.1° |
| Aimed 12 radii beside it | misses | lands (close misses are drawn in once the world is underfoot) |
| Aimed 60 radii beside it, stick held | passes in a blink | passes at 13 radii with the world sweeping at no more than about 45°/s |
| The same, stick released after the pass | stays where it stopped, 1980 radii out | gravity brings it down to the ground in about 45 s |

Causes found and fixed: the view's direction was tied to a horizon that turns as you move
away; pitch stopped one degree short of vertical; speed eased down more slowly than the
distance shrank on arrival, so the traveller shot past. Added: gravity when the stick is
released (HOVER switches it off), a limit on how fast the nearest body may sweep past, a
3 AU/s ceiling, and a stop just above the Sun's surface. A first version of gravity that
also acted while flying bent every aimed trip off its target and was dropped: gravity
acts when the pilot lets go.

## The owner's scale note (during milestone 3)

"It doesn't feel like I'm standing on a planet: make the planet feel giant, the mountains
and the canyons, give it depth, deep depths." Three causes found, three changes:

| Cause | Change |
| --- | --- |
| Flight speed was 0.85 × height above the ground per second at every height, so the ground streamed past alike at 10 m and at 10 km: the eye could not tell a 7 km cliff from a 7 m rock | Near the ground the speed is now 0.2 × height per second, rising smoothly to 0.85 between 3 and 60 km. Falling (stick released) keeps its old pace. Aimed trips still arrive (`flyby`: 13 → 19 s, the last kilometres gentler) |
| A 60° vertical field of view: about 100° across on a phone held sideways, which shrinks everything far away | 48° (about 85° across). Mountains and canyon walls fill more of the screen |
| The opening view looked along the canyon from a bench among low hills: neither wall nor the depth was in view | The opening view is now the lip of the north rim at 5 km, two hours before sunset, looking down across the 10 km deep canyon to the south wall 60 km away. The sunset view along the canyon stays as an extra place (`canyon`) |

## Mars ground at walking distance (helper, milestone 3)

The critic's "Mars is one colour everywhere", "tiger stripes", "Olympus wall like snow" and
"identical gem rocks". Causes: every material had the same red-to-green ratio, sand came
only by altitude; ripples covered all dust and broke along chunk edges (their phase was not
a whole number of cycles per detail tile); the Viking mosaic's sunlit caldera wall is three
times its mean and bluish white; every rock was the same 80-facet icosahedron. Changes:
ground cover of dust, dark grey-brown sand and bedrock driven by the map's darkness, darker
grey-brown rock and boulders (darker than the dust, as at Gale), ripples on sand only and
continuous across chunks, the map's range held near the ground, detail mapped onto steep
faces, rocks cut into blocks. Kept open: the Olympus wall is still pale (the exposure keys
on the ground there), the 5 m ledges have box-like edges, Mount Sharp's layers are faint.

## The owner's on-foot request (during milestone 3)

"I want to be able to walk on the ground, and super speed on the ground as well, with
gravity different by the size of the planet, so on the Moon I can jump much higher."
Built: the character stands, walks, runs at super speed (60 m/s), jumps and lands, with
walking, running, sprinting-lean, jumping and landing-crouch poses; gravity is each
world's real surface gravity (already in the world files), so the same jump goes 2.3
times higher and lasts 2.3 times longer on the Moon than on Mars. See "Character and
flight" for the rules. Rocks are not obstacles yet; any slope can be walked up.

## The owner's floating note (during milestone 3)

"I've played it and it looks like I'm floating on top of nothing", then a phone screenshot:
"there is no ground to stand on". The phone drew no ground at all: rocks and the character
over a brown void. **The cause**: the ground's shader read 17 textures and phones allow 16
(the test browser allows 32, so every headless picture had ground). It went over when the
slope map and its "data sharpness" map were added for the owner's space note. Fixed: the
sharpness map is now a list of numbers (exact instead of blurred), and the two sky-light
tables share one texture, so the shader reads 15. To stop it happening again: every
screenshot run and the smoke test check each shader against a phone's limits, and a shader
that fails on the device shows a message on screen and in the benchmark results.

Before the screenshot I looked for other reasons it could look like floating, and fixed
these as well:

| Cause | Change |
| --- | --- |
| The character cast no shadow at all, nor did the lander: when the rocks' shadows learned to draw only the nearest rocks into the fine shadow tile, every caster without instances (the character, the lander) was given an instance count of "none" and skipped | Only instanced casters have their count changed |
| The feet stood on the exact surface while the drawn ground under them is a coarser mesh: measured up to 6.5 m below the feet in the first seconds and still 0.5–2 m on slopes once detailed | The feet stand on the drawn triangles (morph included) wherever those are within 2 m of the true surface, and blend to the true surface between 2 and 6 m (so nobody walks on a first draft hundreds of metres off) |
| Ledge detection compared the ground under the feet with the ground a step ahead, and two different levels of detail could differ by metres: the character dropped into a fall on flat ground | It compares like with like (both drawn) |
| Play could be pressed while the ground under the start was still a first draft | Play (and the benchmarks) wait until the ground under the start is the detailed one, 20 s at most |
| Sky light reached the ground under the character as if nothing stood there | The figure's torso, legs and feet darken the sky light they hide from the ground (four spheres, within 6 m only) |

## The owner's space note (during milestone 3)

"Fix the textures up when I'm in outer space, things have no depth, the planet just looks
like a circle; fix it or find a way around it." Reproduced from 150 km to 12,000 km on both
worlds. Causes found, by measurement:

| Cause | Change |
| --- | --- |
| On the phone a pixel is 4–5 times smaller than in the test pictures, and the terrain's detail does not depend on screen size: from orbit every normal texel covered 5–15 pixels | From high up, patches split 2.2 times sooner (there is plenty of room under the 120-patch cap there) |
| Outside the six sharp patches the heights come from 15 km (Mars) and 7.6 km (Moon) per pixel data: every crater and canyon wall smaller than a few tens of kilometres was smooth | A slope map of each whole world from the 16 px/deg NASA elevation (5.2 km per texel on Mars, 2.7 km on the Moon) adds the real relief in that band, from far away only |
| Mars had no invented relief between 1 and 30 km: bumps of tens of metres where the real highlands are covered in craters | Craters 1–30 km across on Mars wherever the elevation map is coarser than that |
| Real slopes at those sizes are gentle (a few degrees) and barely shade at a mid-day Sun | The slope map's relief is drawn at twice its true strength from far away (a stylisation for a small screen, on the owner's "find a way around it") |
| Mars's surface model is tuned for grains underfoot: across a whole disc it kept the edge almost as bright as the centre | Far ground uses a smoother model, so the disc darkens toward its edge as real Mars does |
| Colour maps 2880 wide: blurrier than the phone's pixels from mid-orbit | 4096 wide (Mars 5.2 km, the Moon 2.7 km) |

Tried and rejected: holding the Viking mosaic's brightest parts at 1.7 times its mean (a
helper's suggestion to remove "white lines" along the canyon): those are the mosaic's
photographed sunlit walls, the best depth cue Mars has from orbit, and Mars looked flatter
without them. Lossy WebP for the slope maps: blocky canyon walls; colour JPEG: noisier than
two greyscale halves at the same size. Not changed, because it is true: a world with the Sun
behind the viewer looks flat (the full Moon); relief shows wherever the light comes from the side.

## Milestone 4 plan — character and flight feel

The owner accepted milestone 3 ("it's all good, continue"). Plan, in this order:

1. **Flight poses** from what the pilot asks for, not from raw speed (speeds run from 7 m/s
   to astronomical): hover (upright), cruise (stick pushed: one arm ahead, body tipped),
   fast flight (boost: streamlined, both arms ahead, legs together), banking (roll into the
   turn), climbing straight up (arm raised) and a feet-first slow descent near the ground.
2. **Take-off and landing**: a crouch that builds while up is held, then a spring with a
   ring of dust; the figure turns upright before touching down; a crouch scaled by the
   landing speed, a three-point landing for hard ones, dust on every landing.
3. **Target selector**: a marker on the chosen target (another body, the Sun, or one of
   this world's landmarks) with its name, distance and time to arrival from the real
   speed rule; an arrow at the screen's edge when it is behind. `TARGET` cycles.
4. **A boost for long transfers**: with a target chosen, `GO` flies there hands-off,
   faster than the manual boost in open space, slowing to arrive above the target; any
   stick input takes back control. Checked without a browser like `flyby`.
5. **Camera**: the figure leads turns and drifts back to the centre, the camera keeps it
   in sight over ridges on foot and low down, pulls back a little at super speed, and the
   telephoto does not fill the screen with the figure.
6. **Known problems marked 4**: the suit (visor, backpack, gloves, worn dust), darkening
   under the lander and rocks where the site is in shade, irregular dust puffs.
7. Reference set, independent critic, stability test, governor steps, checkpoint.

## Milestone 3 plan — make Mars and the Moon beautiful

Started straight after the owner's phone results and flight notes (above). Order: the
real maps first, because everything else is judged on top of them.

1. The Moon from real data: LOLA elevation for the whole globe, a sharper patch for one
   real site, Clementine brightness for maria and rays, procedural craters only below
   the pixel size of the map under the point. Move the lunar scene from the invented
   crater to a real place.
2. Mars in colour from the Viking mosaic, laid over the existing palette.
3. How regolith reflects: bright down-Sun, dark toward the Sun, for ground and rocks.
4. Both worlds from orbit: day side, terminator, night side. Fix what the maps expose.
5. More real places as bookmarks, each with its own patch of real elevation: Olympus
   Mons and Gale on Mars, Tycho and the Apollo 17 valley on the Moon.
6. Dust thrown up by the character at touch-down, take-off and when skimming.
7. Ground at walking distance; night exposure.
8. Reference set, stability test, flight and smoke tests, critic, governor step for the
   dust, docs, checkpoint.

## Milestone 2 plan — fix the known problems

The owner said "continue" at the milestone 1 checkpoint before any phone results; the
governor is tuned when they arrive. Order: small and safe first, recipe tuning last
(it moves the ground and needs the most screenshots).

1. Phobos and Deimos: an `aim=` screenshot parameter, telephoto shots, check position,
   size and phase.
2. Lunar chunk builds: profile the height recipe in Node, remove the hot spots.
3. Hand-over roll: carry the camera's roll across the switch and let it go as the new
   world gets close.
4. From space: exposure that does not blow out a sunlit globe, sky light that follows
   the local Sun (dark night side, no stripe), glow on the planet's edge.
5. Terrain popping: new chunks fade in from their parent's shape, normals and shadows.
6. Haze in terrain shadow: air below the shadow line gets no direct sunlight.
7. Far wall: dust numbers re-tuned once the shadowed haze is right.
8. Ledges: sharper benches at walking scale; re-pick bookmarks if the ground moves.
9. Character: bending limbs, cloak kept off the arms.
10. Reference set, stability test, critic, governor steps for anything new, checkpoint.

## Decisions in force (and why)

### Rendering and physics

- **Depth**: far pass → clear depth → near pass with a near plane that grows with
  altitude and front-to-back chunk order; the character gets its own depth slice when
  the terrain's near plane has moved past it.
- **Pre-exposure** everywhere, and exposure-scaled lookup tables, because half-float
  targets cannot span the solar disc and faint stars.
- **Circumsolar split**: at sunset most sunlight on Mars arrives as a forward-scattered
  aureole, not the direct beam. Treating the aureole (within ~28°) as directional light
  that terrain shadows can block keeps canyon shadows meaningful without inventing light.
- **Highlight-priority metering**: lit surfaces write alpha 1, sky/stars/Sun write 0, and
  exposure may not push the brightest lit region more than `exposure.highlight` (6) times
  over white. Consequence, consistent with art rule 2: while the sunlit character is in
  frame in space, stars and distant planets are not visible.
- **Exposure metering floor** (`scene.exposure.shadowFloor`) is a per-world number: 0.2
  on Mars, 0.6 on the Moon, where a black sky would otherwise over-expose the ground.
- **Chunk grid 40×40, normal map 120², shadow map 60², at most 180 patches drawn** (120
  until the owner dropped the fixed budgets on 2026-11-20; the governor's terrain steps
  lower it to 144 and 115). Whether the phone holds 180 is not measured yet.
- **No fixed budgets** (owner, 2026-11-20: "if they are limits set by me get rid of them,
  you are making the best game possible"). The 200 draw calls / 500,000 triangles / 300 MB
  limits are gone from the charter, the config and the HUD. What limits the picture now is
  the steady frame rate on the phone, which the governor keeps; pools stay fixed-size.
- **Mobile GPU care**: clears before full-screen passes, depth and unused colour
  invalidated, GL context loss reloads the page.

### Measurement and the governor (milestone 1)

- **The canvas is drawn pixel for pixel** (`devicePixelContentBox`), so "native" really
  is the panel's own pixels. A guard at 8.3 M pixels protects the memory budget on
  monitors above 4K only.
- **Both modes start at native resolution** (since the owner's first phone results; the
  first design started Smooth at half). Coming down is quick (under a second per step) and
  climbing is slow on purpose.
- **Lateness is judged against the target interval (×1.2), not against the measured
  refresh rate.** When every frame is slow the refresh rate cannot be measured (all
  callbacks are late), and a tolerance based on it excused 40 fps as "on time" in
  simulation. The refresh rate is measured at page load, before anything heavy runs.
- **Frames with terrain uploads count less.** A late frame that uploaded terrain is
  usually late because of the upload, which a lower resolution cannot fix. Such frames
  only trigger a step down when more than 60 % of all frames are late.
- **Hysteresis**: a step up that is taken back within 4 s doubles the wait before the
  next try (3 s → 60 s); each step up that holds halves it. In simulation a steady
  scene settles on one level and tries the next one about once a minute.
- **The benchmark drives the game through virtual keys** rather than a replayed camera
  path, so it measures the code a player runs (controls, hand-over between worlds,
  terrain streaming). Runs are therefore close to, but not exactly, repeatable.
- **HUD has three states** (one line / everything / off) and starts on the one line, so
  the picture is not covered by debug text on the phone. `?hud=1` still gives the full
  read-out.
- **`npm run stability` reports, it does not pass or fail.** Consecutive frames legally
  differ where the camera moved; the script marks one-frame outliers in red and a person
  (or Claude) looks at the strips.
- **The near shadow map's texel grid is anchored to the ground near the camera** and
  re-anchored only when the camera is more than two map radii away.

### From space, exposure and haze (milestone 2)

- **Subject-priority exposure** (`exposure.surface`, default 0.6): single pixels of the
  HDR scene are sampled on a 32×18 grid; where alpha says "lit surface" they give the
  share of the frame that is surface and the brightness of its bright parts (mean weighted
  by brightness, so a half-lit globe counts as its day side). Once surfaces cover more
  than 1–6 % of the frame, exposure may not push that brightness above `surface`. A small
  figure against the stars keeps the old, looser limit (`highlight`). Ground-level
  bookmarks sit at 0.17–0.24, far below the limit, and are unchanged.
- **Sky light follows the local Sun.** The irradiance map belongs to the camera's place.
  From high up every surface instead takes the sky-plus-bounce light of level ground at
  its own Sun height, from a table built once per world (milestone 3; in milestone 2 the
  camera's map was scaled by the ratio of that table to its value at the camera, which
  left the day side without any sky light whenever the camera hung over the night side).
  Below 3 km of altitude the table is not used at all (it fades in up to 30 km), so
  nothing changes on the ground and nothing is paid for there.
- **Edge glow from space is marched per pixel**, in the sky dome (rays that cross the
  shell) and on ground seen at a grazing angle (blend from froxels below a view cosine of
  0.38, fully marched below 0.22), and since milestone 3 everywhere the Sun is less than
  about 6° up: a froxel tile near the edge can hold rays that pass through sunlit air
  beyond it, and over the night side that light showed as bright square blocks. Screen-
  space froxels cannot follow the path length near the edge: it changes by a factor of
  two between neighbouring froxels. The sky-view LUT is
  used only while the camera is in the air and is cross-faded over the top tenth of the
  atmosphere.
- **Terrain shadow in the air** is a 64×64 map on the tangent plane around the camera
  (half-width 0.6 × the world's shadow range, growing with altitude) holding the altitude
  below which the Sun is hidden. One coarse height sample per step toward the Sun; about
  50–100 ms in a worker, redone when the camera has moved a sixth of the half-width or the
  Sun 0.4°. At the Mars bookmarks it changes little, and that is correct: the Sun shines
  along the canyon and its air really is sunlit (`?debug=airall` shows what fully shadowed
  air would look like; `?debug=noair` switches the map off).
- **Mars dust re-tuned for the far wall**: 15 % less dust (column optical depth about
  0.23, a clear season). Direct sunlight at the scene's 4° Sun rises by about half, so
  benches catch light and cast shadows, and the far wall keeps a third of its light
  instead of a quarter. Tried and rejected: a tighter forward lobe for red and green. It
  is closer to measured Martian dust 60° from the Sun (a single Henyey–Greenstein lobe
  that matches the aureole is about twice too bright there), but it made the aureole a
  third brighter and whiter and darkened the whole sunset view. A two-lobe phase function
  is the proper fix and belongs to milestone 3.
- **Ledges**: a terrace riser reads as rock only when it is steeper than the surface's
  rock slope, so the 38 m beds went from a 30 % to an 18 % cliff fraction, and a 5 m bed
  layer adds ledges at walking scale. The masks use the large-scale slope (0.54 at the
  site, a canyon flank), so the benches themselves carry small steps too.
- **The lander bookmark moved** 25 m east and 20 m south onto a sunlit bench (the old spot
  ended up behind a riser). The start position and the lander's place are unchanged.
- **Character**: each limb is an upper and a lower piece, both children of the body (so
  each can be drawn into the shadow map on its own); the lower one is placed at the joint
  every frame. Eight limb capsules are handed to the cloak solver.
- **New chunks fade in from their parent** (shape, normals, cavities, baked shadows) over
  0.6 s, and shading morphs with distance exactly like the vertices. A parent's maps are
  always loaded while its children are drawn (the pool never evicts a node with loaded
  children).
- **The hand-over between worlds keeps the camera's roll.** `CameraRig.roll` holds the
  previous world's "up" and is released (1.2 /s) only inside 40 radii of the new world, so
  the re-levelling happens while the world grows in view. Look input is rotated by the
  roll so "right" stays right on screen.
- **Lunar chunk builds**: the crater op remembers the last 2×2×2 lattice block per class.
  Heights are bit-identical; the profile went from 72 to 41 ms per chunk in Node (Mars:
  24 ms). The rest of the gap is the fractal layers and the shadow rays, which simply
  cost more per sample on a cratered world.

- **Baked sunlight is decided per texel, not per chunk** (milestone 3). The walk across a
  chunk's own height grid used the Sun's height at the chunk's centre; on a chunk the
  size of a cube face that put a sixth of Mars in shadow whenever its centre (the south
  pole, in northern summer) was in night. Each texel now uses its own Sun height, walks no
  further than the shadow range, and is dark when the Sun is below its own horizon.
- **A world in black space is exposed lower than a view full of ground** (`globe` 0.32
  against `surface` 0.6, blended by how much of the frame the lit surface covers): at
  0.6 the tone curve flattened Mars's markings into cream.
- **Hard lunar shadows** (a helper measured why the Moon's light looked soft). No small
  crater was steep enough to shade itself at a 29° Sun (inner walls 23°): fresh ones are
  now bowls a fifth as deep as wide (`ageSkew` keeps most worn), and craters fade out on
  slopes above about 20° (soil creep), which also removed the camouflage blotches on the
  rille's far wall. The finest lunar chunks went from 42 m to 10 m (`maxLevel` 18). The
  rock, lander and figure shadows went from one 15 cm-texel map to an atlas with a 4 cm
  tile near the camera and a 7 mm tile that follows the figure: its shadow is a crisp
  silhouette instead of a smudge, and it now shades itself. The fine tile draws only the
  rocks within 30 m (they are scattered nearest-first), so its cost stays small.
  Baked terrain shadows can store the clearance angle instead of visibility for sharper
  edges (`CONFIG.SHADOW_ANGLE`); not switched on yet, it needs a decode in the terrain shader.
- **Mars from orbit keeps its albedo features** (a helper measured where the Viking
  mosaic's contrast went: the picture kept half of it). Three causes, three fixes: the
  globe was exposed into the tone curve's shoulder (Mars now sets `exposure.globe` 0.18,
  the default 0.32 suits grey worlds); only half of the mosaic's colour differences were
  used (now all: dark basalt is 0.4 as bright as dust in red, 0.75 in blue); and the haze
  added the same ground-bounced light over dark and bright ground (now it follows the
  ground's albedo on steep views). Contrast kept in the displayed day globe: 0.51 → 0.72.
  Still below Hubble's processed pictures, which stretch it; going further would invent
  contrast. Ruled out: the low dust layer, the froxels, the sky light.
- **The bright-part meter is weighted by the square root of brightness** (was: by
  brightness). A crescent still counts as its day side, but a white lander and sunlit
  rocks on dark lunar soil no longer drag the exposure down until the ground is black.
- **The highlight meter leaves out the screen around the Sun's disc.** It reads a blurred
  copy of the frame, and where the Sun sits on a ridge (the lunar sunrise view) the disc's
  light shared texels with lit ground and counted as ground many times over white: the
  exposure never settled. A first fix capped that reading at 8 times the mean of the lit
  samples, which over-exposed a thin crescent (the night side counts as lit surface and
  pulls the mean down); it was replaced by skipping the texels within the Sun's radius
  plus 1.6 texels.
- **Dim scenes stay dim on the Moon** (`exposure.dim`): above an exposure of 60 only part
  of the missing light is made up (the square root of it), and never less than a fifth.
  An earthlit night comes out about five times darker than full compensation would make
  it (it used to look like day), and a view into a low Sun keeps its ground dark: Apollo
  crews opened up only about two stops for into-Sun pictures, the meter had opened five.
  A plain power law could not do both (the two scenes need the same factor at very
  different brightness), and the glow drawn around a bright Earth feeds back into the
  meter, so the numbers were set by looking: ground-level day views (11–66) are unchanged.

### Worlds

- **Mars site**: the lip of a bench on the north flank of Coprates' southern ridge
  (13.174°S, 296.568°E, +570 m). The trough runs ~W17°N; on the chosen date the Sun sets
  at azimuth 297°, almost straight down the canyon. The north wall (≈10 km of relief,
  ~55 km away) is the "far wall".
- **Mars date**: 2014-01-31 — the evening Curiosity photographed Earth and the Moon from
  Mars — so Earth really is an evening star 34° from the Sun. Phobos is in the eastern
  sky and sets about 35 minutes later.
- **Mars height data**: MOLA global 4 px/deg (2 MB) plus a 128 px/deg inset (463 m/px,
  2.3 MB) around the scene. Everything below ~1 km is procedural.
- **Dusk bookmark is 1.7 h after the start**: Martian twilight is long, and stars/Earth
  only clear the glow once the Sun is ~17° down.
- **Moon site (milestone 3)**: Hadley Rille and the Apollo 15 landing site, replacing the
  invented crater. Chosen because one small area holds a 300 m deep canyon, a 4.5 km
  mountain front and a real landing site, and because Apollo 15's photographs are the
  reference to compare against. The scene date is the mission's second day (Sun 29° up in
  the east, 106° azimuth): at 19° (the first day) the canyon's east wall was a black hole.
  The start is the outside of the rille's bend at the foot of Hadley Delta, looking down
  the 3 km reach that runs north-north-west, the lit west wall on the left, the shadowed
  east wall on the right. A view from the rim half-way along (the first attempt) showed
  only one wall and read as a hillside.
- **Moon height data**: LOLA 4 px/deg for the globe; SLDEM2015 (LOLA + Kaguya stereo) for
  the sites, because the LOLA-only 118 m mosaic has kilometre-wide gaps between tracks at
  this latitude and the rille came out as blocks. Patches: the Apennines at 474 m, Hadley
  at 59 m (the whole rille), Tycho at 474 m, Taurus-Littrow at 118 m.
- **Procedural detail only below the map's pixel size** (`belowDem`): crater and relief
  layers switch themselves off for features the raster under the point can resolve, so
  the sharp patches show only real craters above ~120 m and the coarse globe still gets
  its share of invented ones. The old Moon's "dark fines in low ground" (darkening by
  altitude) is off: the brightness map knows where the maria are.
- **Brightness and colour maps multiply the palette** (divided by the map's mean), they do
  not replace it: slope materials, strata and close-up detail keep working, and the
  palette numbers stay normal albedos. Mars uses half of the Viking mosaic's colour
  differences: its dark regions lean bluer than the ground looks from the surface. The
  lunar map fades out between 62° and 75° latitude, where the mosaic is mostly shadows.
- **Regolith reflects like the Moon** (`photometry: 'lunar'`): lunar-Lambert times the
  phase curve fitted to the Moon's brightness through the month (0.57 at 30°, 0.37 at
  60°, 0.24 at 90°, 0.15 at 120°). A first curve (a plain exponential) was 2.7 times too
  dark at 100°: looking across the sunlight the ground went black beside the lander.
  Rocks use the same function and the local tint; the lander and the character stay
  matte, so white paint is far brighter than the soil, as in the Apollo pictures.
- **Landmarks are bookmarks 6 and up** with their own elevation patch and their own
  light (`timeOffsetHours`); the first five stay the scene the benchmark flies. Olympus
  Mons: west rim of the summit caldera, late afternoon. Gale: Curiosity's landing place
  looking at Mount Sharp, morning. Tycho: south rim, the Earth above the north wall.
  Taurus-Littrow: the Apollo 17 site, the Earth above the South Massif as in that
  mission's pictures.
- **Shadow rays stop at the tallest ground near them**, found from the rasters, instead
  of at one number per world: a view from a 21 km volcano needs a different ceiling from a
  canyon, and a wrong one silently removes shadows.
- **The sky always contains every catalogue body**; the one underfoot is skipped.

### Character and flight

- Interactive sessions start behind the character, on its feet; bookmarks in screenshot
  mode stay first person unless `?hero=1`.
- **On foot** (owner's request during milestone 3): walk at up to 4.5 m/s, super speed up
  to 60 m/s with the stick at its rim, jump at 5 m/s under the world's real gravity
  (3.4 m and 2.7 s in the air on Mars, 7.7 m and 6.2 s on the Moon; a future Earth 1.3 m).
  A tap of up jumps; holding it 0.35 s, or a second tap in the air, takes off. With HOVER
  off, touching the ground while not climbing lands on the feet, and letting go of the
  stick within 30 m of the ground is a real fall (the flight's own pull is a gentle,
  scaled one, which made the last metres float). Running off a cliff and falling more
  than 40 m hands over to flight. The camera follows from where it sits in flight, so
  landing and taking off do not move it; it never goes below the ground and follows its
  rises smoothly. The first-person walk (HERO off) jumps at the same speed.
- Speed in flight is 0.85 × distance-to-nearest-surface per second (×3 boost), 0.2 × near
  the ground (see the owner's scale note): far faster than light between planets,
  automatic slow arrival.
- The camera is the thing that moves; the figure is drawn ~4 m ahead of it.
- **Targets** (milestone 4): each world lists real places in its data file (`places`);
  `TARGET` opens a list of them, the bodies in the sky and the Sun, with distances; `T`
  cycles. The marker (thin brackets, name, distance, how long a GO trip takes) is plain
  DOM over the canvas: no draw calls. Turning to a body looks straight at it; turning to a
  place looks along the way a trip would set off (over the horizon).
- **GO** (milestone 4) is the boost for long transfers: hands-off, full stick with the
  boost, and twice that again when every body is more than 20 radii away; near the ground
  it keeps the open-space pace (0.85 of the height per second, not hand flight's fifth).
  From the ground to another world takes about 15 s. It climbs away first (speed grows with
  height, so skimming the ground toward a body on the horizon crawled at 21 m/s), never
  aims through the world, and ends 5 % of a radius above a body or 500 m above a place,
  where gravity takes over unless HOVER is on. The view looks toward the target, kept
  10° above the world's edge (along the path, or a third of the way toward the target, it
  showed black space for most of a trip); looking around
  is free; the stick or a movement key takes control back.
- **Poses from the pilot's intent, not raw speed** (speeds span 7 m/s to astronomical):
  stick pushed = cruise (one arm ahead), boost = streamlined, nearly straight down = feet
  first. Landing: an upright flare in the last second when diving at the ground; landing
  faster than 9 m/s (a fall of about 20 m on Mars) is a three-point landing that brakes
  the skid and holds 0.45 s. Up held after a jump: a fist-up launch, and a ring of dust.
- **Chase camera**: the figure drifts up to 0.7 m against a turn and settles back; on
  foot the camera rises to keep the figure's chest in sight over ridges and drops back
  2.5 m at super speed; through the telephoto the figure steps out of the picture.
- **The robe and hair flow in vacuum too**: 30 % of the atmospheric flow is kept in
  flight, and a breeze always blows through the cloth, even standing still on the Moon
  (its push is about a third of the cloth's weight on that world, so it leans and ripples).
  These are the two deliberate departures from physics, both at the owner's request
  ("the robe should be flowing in the wind or flight").
- World hand-over (Mars ↔ Moon) happens when the other world's surface is nearer than
  the current one's; in practice about half-way, where both are dots. Simulation time
  runs on across worlds; pressing a bookmark jumps to that world's own scene date.

## Known limits of what is built

Every limit in the code today that holds back the picture or its detail, checked against
the code on 2026-11-20. Faults that will be fixed are in the table below; these are the
ceilings the engine was built with. Since the owner dropped the fixed budgets (CLAUDE.md,
"No fixed budgets"), none of the numbers here is a rule any more: each one can be raised
when the phone's benchmark shows it holds a steady frame rate.

The picture

- No anti-aliasing of any kind: thin bright edges (ridge lines, crater rims) shimmer.
- Render resolution is whatever holds the frame rate: from native down to about 1 million
  pixels, then features switch off in the governor's order. Above 8.3 million pixels (a
  monitor larger than 4K) the canvas is capped.
- Smooth mode asks for 60 frames a second, so each frame has half the time Sharp gives it.
- None of the expensive effects in CLAUDE.md is built: volumetric clouds, screen-space
  reflections, ambient occlusion, global illumination, motion blur, temporal
  anti-aliasing. Each waits for phone results that show headroom.
- Bloom is one cheap pass (5 levels, about 4.5 % of the light).
- Photo mode (one frame at full native resolution) is not built yet (milestone 8).
- A phone allows 16 textures in one shader and the ground's shader uses 15: one more map
  on the ground means merging or dropping another.

The ground

- At most 180 terrain patches are drawn at once (120 until 2026-11-20), from a pool of
  480; the governor can lower that to 144 and 115. Detail in the distance is what this cap
  leaves after the patches near the camera.
- Every patch is a 40 × 40 grid of quads with a 120 × 120 normal map, whatever its size.
  The finest patches are about 40 m across on Mars (1 m quads, 34 cm normal texels) and
  10 m on the Moon (26 cm quads, 9 cm texels). Nothing smaller has real shape.
- Below that, grain comes from one generated 256-pixel pattern repeated at three sizes
  (64 m, 7 m and 0.8 m tiles): no photographed or scanned surfaces (art rule 3).
- Real elevation is coarse outside a few sites. Mars: 15 km per pixel everywhere, 463 m at
  Coprates, the Olympus summit and Gale, 1.9 km over the Olympus shield. The Moon: 7.6 km
  per pixel everywhere, 59 m at Hadley, 118 m at Taurus-Littrow, 474 m over the Apennines
  and Tycho. Everything finer is invented relief from the recipe.
- Real colour is one 4096 × 2048 map per world: 5.2 km per pixel on Mars, 2.7 km on the
  Moon. Finer colour is the palette and the generated ground cover.
- Relief shading from far away comes from one slope map per world, 4096 pixels round
  the globe (5.2 km per pixel on Mars, 2.7 km on the Moon), with its slopes doubled so
  landforms read on a phone.
- Gullies below the elevation maps' resolution are noise, not aligned downslope.
- Rocks: one lump shape cut by fracture planes, at most 512 (480 on Mars, 420 on the
  Moon), only within 120 m of the camera. No pebbles, boulder fields or footprints.
- Three workers build terrain: ground that comes into view fast is drawn coarse until
  they catch up.

Shadows and light

- Terrain shadows are baked per patch at 60 × 60 (half the normal map), re-baked when the
  Sun has moved 1°. Shadows cast from far away have soft edges, and the day-night line
  seen from far away is as sharp as those texels (stair-stepped on the Moon at high zoom).
- Shadows of rocks, the lander and the character are drawn within 150 m of the camera
  (15 cm texels; 4 cm within 20 m; 7 mm round the character). Farther away the lander
  casts none. Kicked-up dust casts none.
- No sky-visibility bake: sky light is not reduced inside a canyon or a crater, only in
  one-texel hollows (the normal map's cavity term) and at the foot of the character, the
  lander and the eight nearest rocks.
- Planetshine is unshadowed and comes only from the single brightest sky body.
- The lander's lamps light nothing. Nothing in orbit is lit by the planet below it.

The air

- The air is a set of small tables: sky 160 × 100, 32 × 32 × 32 cells of haze in front of
  the camera, a 64 × 64 map of where terrain shadows the air. So shadows in the haze are
  soft.
- From space the glow on a planet's edge is marched per pixel with 16 samples (12 over
  ground), halved by the governor.
- No clouds, no dust storms, no weather: a world's air changes with height only, it is
  the same over every place.

The sky

- Only Mars and the Moon have terrain; any other body stops you just above its drawn
  surface (2 % of its size).
- The catalogue holds the Sun, Earth, the Moon, Mars, Phobos and Deimos. No other planets
  yet (milestone 6).
- A body seen in the sky is a ball with a generated pattern, not its real map: Mars and
  the Moon too, seen from the other world. Earth's is a procedural ocean/land/cloud
  pattern, not real geography (milestone 5).
- Stars are the 9,096 of the Yale Bright Star Catalogue as points; no Milky Way.
- The Moon's rotation uses mean elements (no libration); Earth can be a few degrees off.

The character

- No textures: detail is geometry coloured per vertex; face and hands are simple shapes
  and do not move (no fingers, no expression).
- The robe, sleeves and hair are about 500 simulated points at 75 steps a second (half
  that on the governor's last-but-one step), drawn finer than they are simulated. The
  cloth is kept off the body, head and limbs, not off the ground, rocks or lander, and the
  hair is not kept off the arms.
- Kicked-up dust is a pool of 1,024 sprites, each at most 256 pixels across.

## Known problems (and where the roadmap deals with them)

| Problem | Milestone |
| --- | --- |
| Nothing since build 27e1973 has run on the phone: the one-draw-call ground, twelve new worlds, thick air (Titan, Venus), the cloud layer, the sea, rings, the menu, map, sound | owner's next benchmark and first look |
| The new worlds were given one pass each: views chosen with the CPU sketch and one or two headless pictures, no reference set, no stability run, no critic. Weakest: Europa (reads as a brown dune, not ice), Triton (flat), Io (bland plains), Titan's dunes (hard to see in the flat light), Phobos and Deimos (the horizon slants: "up" is from the body's centre) | after the owner's first look |
| Where a world has no elevation data the small-scale ground is invented (recipes), and so is everything below the data's pixel size everywhere | by design; say so |
| Pluto's and Charon's far hemispheres have no elevation and a filled-in colour: featureless there | data does not exist |
| Earth: no trees, grass, buildings, rivers or lakes; ground below sea level is sea; the player can stand on water; clouds are a single thin layer of 10 km cells with generated detail | by design for now |
| The Moon's orbit is a mean ellipse: up to 3.5 degrees from its true place; Phobos runs ahead after 2030 (12 degrees by 2100): each needs a periodic or squared term in `orbitPosition` (the numbers are in `scripts/fit-orbits.py --refit-existing`) | open |
| Sound, photo sharing and the date picker could only be tested as far as a headless browser goes (no speaker, no share sheet) | owner's first look |
| The journal has no hints or map pins; a place is found only by going near it | open |
| Milestone 2 and 3 builds have not been measured on the phone: the per-pixel haze near a planet's edge, the albedo lookup and the dust are new costs | owner's next benchmark |
| One-pixel-high bright features alias (ridge highlights, crater rims): no anti-aliasing. The milestone 1 results showed room for it; it waits for numbers from the current build | after the next benchmark |
| Night scenes need about 570 frames for exposure to settle in screenshot mode | tooling |
| A chunk that takes over while its parent is itself still fading in starts from the parent's own maps, a small jump during fast streaming | watch |
| Chunk builds cost about 10 % more than in milestone 2 on Mars (the rays that keep shadows continuous across chunk borders); lunar chunks are a third cheaper than before | watch |
| The terminator seen from far away is as sharp as the shadow map's texels: stair-stepped on the Moon at high zoom, no long relief shadows across it | 5 |
| Looking straight down-Sun on the Moon the ground is featureless (true to life; the target marker now gives something to steer by); small craters only show across the light | watch |
| The SLDEM patch has faint north-south stripes a few metres high (the altimeter's tracks) | watch |
| Outside the sharp patches the Moon and Mars are 7 to 15 km per pixel plus invented relief: landing anywhere else shows no real small landforms | 6 / 7 |
| Mars from orbit is soft: about 40 % of the contrast of the Viking mosaic survives the haze; Valles Marineris shows by its bright rims | 5 |
| Twilight glow has a hard upper edge at the highest exposures | 5 |
| Mars: flat grey sky away from the Sun, olive cast in the sunset views | 5 |
| The cost of the Mars dust cloud's noise on the phone's fill rate is not measured (the governor's dust step drops most of it) | owner's next benchmark |
| Through a very long lens (under 10°) looking down-Sun at a grazing angle, the sand ripples stretch into vertical stripes (seen at the lander bench near sunset; not at normal lenses) | watch |
| Rocks look pale, bluish grey against the Martian ground (real ones are dark and dust-coated) | 6 |
| Landforms soft from close up: Mount Sharp, the Coprates wall, the Olympus caldera wall, Hadley Rille, Tycho's peak read as rounded heaps (milestone 4 critic) | 6 / 7 |
| Mars daylight haze too thick: far walls dissolve, flat khaki sky (milestone 4 critic) | 5 |
| Chalk-white outlines on canyon walls and crater rims in Mars from orbit; a bluish Mars crescent | 5 |
| In orbit the cloth floats loosely with almost no weight to hang by | next character pass |
| Black shadow slivers with no visible relief in the low lunar orbit view | 5 |
| Far from every body only the target marker shows the way; there is no map yet | 7 |
| Places on other worlds cannot be chosen until that world is home (no map yet) | 7 |
| The terrain patch cap went from 120 to 180 when the owner dropped the fixed budgets (2026-11-20), so more triangles and draw calls are drawn than in any build the phone has measured (the reference views sat at 480–495 thousand triangles before) | owner's next benchmark |
| No footprints (footfalls throw dust) | 8 |
| The character is built from code: clean shapes and per-vertex colour, no sculpted face, no painted embroidery, none of the fine ornament of the owner's reference pictures. A real model file from the owner would replace it | owner (asked) |
| In fast flight the robe's skirt streams back as a smooth tube; little billow. The face is a few simple shapes | next character pass |
| The robe and hair simulation (about 500 points, 75 steps a second) and the 180 patches are not measured on the phone | owner's next benchmark |
| The reference pictures of the worlds without the character (bookmarks, orbit views) were rendered with 120 patches; with 180 the ground is finer than they show. Re-render with `npm run shots:all` (3–4 hours) | tooling |
| Earth's maps are 10 km a pixel (clouds, colour) and 20 km (lights, water): low over it the clouds are soft; it cannot be landed on (milestone 9). The other bodies seen from afar are still generated patterns on a 3,380-triangle sphere | 6 (each new world brings its maps) / 9 |
| An eclipse dims the sunlight by the share of the Sun's disc covered, at the camera, for the whole frame: no shadow edge moving over the ground, no red ring of air round an eclipsing Earth | 7 |
| Milestone 5's costs are not measured on the phone: the globe's shader and the rim of air (only where Earth is on screen), four maps of about 80 MB when Earth is near | owner's next benchmark |
| Low over Earth the clouds are soft and have no fine structure; city lights are 10 km a pixel; no cloud shadows on land at the day-night line (milestone 5 critic) | 9 |
| Phobos is a pale featureless lump and Deimos a speck through a long lens (milestone 5 critic) | 6 |
| Earth's full maps are decoded on the main thread when they arrive: a hitch of a frame or two, once | watch |
| The Sun's disc is placed from the camera, but the sunlight on everything (direction and strength) is still that at the home world: flying far from home toward the Sun, things are lit as if at home | 7 |
| Far from every body the traveller still rides the home world's spinning axes, so a time change swings distant bodies round it (near a body it is now carried along with that body) (foundation review) | 7 |
| Every world's elevation data is downloaded at start-up and kept: fine for two worlds, not for ten (foundation review) | 6 |
| `scripts/transfer.mjs` flies a hand copy of the trip code in `App`; a change to one can miss the other. The trip's steering belongs in `autopilot.js`, used by both. `transfer` and `flyby` print their numbers but never fail: they need pass marks (foundation and final reviews) | 5 (before touching trips again) |
| Stars load from the starting world's data file only; the `sky.bodies` field of the world files is unused (foundation review) | 6 |

Fixed in the milestone 4 review: GO arriving at tens of thousands of km/s (the figure hit
the ground a fraction of a second after "Arrived", even with HOVER on); the trip's heading
and the cloak left in the old axes at the world hand-over; a trip that kept running after
HERO, FLY, a bookmark or standing up; a three-point landing that read as a stumble, and its
kneel carried into a jump or take-off; the figure jumping up to 0.7 m on landing while the
view turned; the take-off dust missing for a held take-off and the landing dust a quarter
of a second early; dust shown through rocks from higher up, and its noise breaking up far
from where the pool was anchored; the feet's contact spheres read from the wrong slots
(one was NaN); lander and rock darkening switching on in one frame; HOVER doing nothing in
a fall on foot; GO reshuffling the touch buttons; the marker gone with the HUD off, its
label cut at the screen's edge, and a place beyond the horizon marked on the ground in
front; the boots of the hovering figure cut by the frame.

Fixed in milestone 4: no darkening under the lander and rocks in shade (sky occlusion at
their foot); the simple white figure (visor, lamps, pack, joints, gloves, boots, dust);
round dust puffs (a lumpy cloud on Mars, a fine spray on the Moon); nothing but the HUD to
navigate by (target marker, list and GO); the figure banked away from turns.

Fixed in milestone 3: the Moon had no maria or rays and Mars was one colour from orbit;
a sixth of Mars drawn washed-out from far away; lunar ground one grey at every Sun
height; an earthlit lunar night exposed as bright as day; whole benches wrongly in shadow
at a low Sun, with straight edges where chunks meet.

Fixed in milestone 2: detail popping as terrain refines; no glow (and an inverted band)
on the planet's edge from orbit; over-exposed globes, lit night sides and the stripe on
Mars's terminator; the halo around the airless Moon; the roll at the Mars ↔ Moon
hand-over; lunar chunk build time (72 → 41 ms); haze ignoring terrain shadow; ledges
reading as dunes; the far wall's haze (in part: 15 % less dust); rigid limbs and the
cloak passing through arms and legs; Phobos and Deimos checked.

## Tests and measurements, milestone 4

- **GO trips without a browser** (`npm run transfer`, a Mars-sized world): to a Moon-sized
  world 2000 of its radii away, made home halfway as in the game, 15.5 s (the marker
  predicted 14.7 s); to a place 71° away from ground 5 km up, 18.6 s (17.5 s); 169° away,
  23.1 s (19.9 s); a 3° hop, 11.2 s (11.9 s). (Corrected in the milestone 4 review: a place trip stops
  about 245 m short of the point 500 m over the place, at about 1.2 km/s, and its speed is
  then cut to what the stick would give there; with HOVER on it stays about 480 m up, with
  it off it comes down about 540 m from that point.) Before trips kept the open-space pace near the ground they took 28–45 s,
  most of it drifting up the first kilometres. No trip touches the ground; the
  straight-line distance grows by at most 4 % on the way except to the far side (31 %, it
  goes up and over), which is why a place's distance is shown along the ground. Found on
  the way: after the target body became home, the "never through the world" rule kept the
  aim on its edge, so a trip to another world would never have landed.
- **Target list and GO in the game** (`npm run target`, final build): the list holds 16
  entries on Mars; picking one closes it; the marker reads "Olympus Mons · 4487 km · GO
  17 s"; GO climbs to 200 km and closes from 4487 to 422 km along the ground; the marker
  counts down; `T` picks the next target and ends the trip.
- **Smoke** (final build): start screen, modes, HUD and a full benchmark pass; most at once
  90 draw calls, 237k triangles, about 183 MB; 21 shaders, the fullest (terrain) reads 15
  of a phone's 16 textures; none fails to compile.
- **On foot** (`npm run foot`, final build): both worlds pass; jumps peak at 3.37 m (Mars)
  and 7.64 m (Moon); a hard landing's kneel does not stop the test's walk afterwards.
- **Fly-bys** (`scripts/flyby.mjs`): aimed trips still land; a 60-radii miss passes at 1.3
  radii and lands once released, the sweep held to 44°/s.
- **Governor simulation**: unchanged behaviour with the new `contact` step.
- **Poses** checked by eye from the side and behind over Gale (cruise, boost, turning,
  climbing, hover, three-point landing, launch). Found and fixed on the way: the figure
  banked away from turns (sign error since milestone 2), faced the camera when climbing
  straight up, and dove feet first when boosting downward; the trailing legs were cut off
  by the frame's bottom edge (the figure now sits 0.9 m below the view's axis, was 1.2).
- **Suit** (helper): 3,568 → 5,242 triangles without the cloak, no new meshes or
  textures; exposure unchanged by the visor's glints (Mars 223.9 → 224.3).
- **Dust** (helper): one draw call, 1024 particles, no textures; the governor's dust
  step now also drops the cloud's small lumps and its self-shadowing.

## Tests and measurements, milestone 3

- **Flight**: `flyby` as after the flight fix (an aimed trip lands in 13 s within 0.1°; a
  60-radius miss passes at 16 radii with the target sweeping at most 46°/s; a released
  stick ends on the ground). The scripted Mars → orbit → Moon flight passes and now
  arrives over Hadley.
- **Smoke test** with a full benchmark: passes; the new dust step was exercised with the
  others. Most at once in that run: 124 draw calls, 337k triangles, about 142 MB of GPU
  memory (the brightness or colour map of the current world adds 22 MB).
- **Chunk builds in Node** (`profile-chunks`, means over the levels down to the start
  site): the Moon 51 → 36 ms (real maps: far fewer invented craters to stamp), Mars
  29 → 32 ms (the rays that keep shadows continuous across chunk borders). In the
  browser run of the benchmark: Mars 50 ms, Moon 56 ms per patch on the test machine.
- **Shadow continuity across chunk borders** (`bakecmp` in the session's scratch files:
  mean difference, out of 255, between the two chunks' values along a shared edge, at the
  Mars start with the Sun 4° up): level 17: 245 → 0; 16: 78 → 0; 14: 155 → 11; 12: 62 → 9.
  The cause was not the border itself: rays that start under a ledge smaller than the
  detail their first samples can see came out dark, in whole benches.
- **Download**: Mars 4.4 → 13.7 MB of map data, the Moon 0 → 13.6 MB (fetched when the
  Moon is first visited); the page script is 782 kB (224 kB compressed). The slope maps are
  most of the growth (4.6 and 6.4 MB).
- **Final benchmark run in the test browser** (after all of milestone 3 and the owner's
  notes): most at once 97 draw calls, 281k triangles, about 183 MB of GPU memory (the
  slope and colour maps add about 40 MB); chunks Mars 41 ms, Moon 43 ms each.
- **On foot** (`npm run foot`, both worlds): starts on its feet, walks at 4.5 m/s, a jump
  peaks at 3.37 m on Mars and 7.70 m on the Moon, super speed passes 25 m/s within the
  test's wait, holding up takes off, letting go lands on the feet; no page errors.

## Tests and measurements, milestone 2

- **Stability** (ten moves, two stations each, `docs/shots/stability/report.json`): no
  pops, no sparkles. Mars from orbit went from 0.07 % of pixels changing to 0 (the edge of
  the planet is now smooth). The Moon is as before: differences only where a rock a metre
  from the camera really moves.
- **Flight test**: Mars → orbit → Moon, hand-over with the roll carried over, no errors.
- **Smoke test** with a full benchmark: passes; all nine governor steps were exercised.
- **Final build against the reference set**: `mars_ledge` and both Mars orbit views are
  identical to within 1/255 after the last two changes (sky-light look-up skipped near the
  ground; the from-space haze march compiled only into the terrain shader).
- **Relative cost in the test browser** (software rendering, start view, all features on;
  only the ratios mean anything, and they are not phone performance): milestone 1 = 584
  ms per frame; milestone 2 = 784 ms. Known shares: the from-space haze branch in the
  terrain shader, never taken on the ground, costs about 15 % there (a software renderer
  pays for masked branches; a phone GPU should not), and the sky-light look-up cost 10 %
  before it was skipped near the ground. **Open risk**: if the owner's benchmark shows the
  ground views slower than with the milestone 1 build, compile the from-space haze as a
  second terrain program and switch to it above the atmosphere.
- **Lunar chunk builds in the browser**: 59 ms each in the benchmark run (90 before);
  Martian ones 43 ms (35 before: the extra ledge layer and the busier machine).

## Stability test, milestone 4

Two stations on each of the ten moves, final builds. Pixels that flicker (change one way
then back across three frames): Mars walking 0.05 % and 0.006 %, turning 0.006 % and
0.002 %, telephoto on the wall 0, high flight 0, orbit 0; Moon walking 0.015 %, turning
0.005 %, low flight 0.001 %, orbit 0.001 %. The largest, Mars low flight at 0.4 %, is the
character itself between frames (the cloak's new flutter and the hover sway) and the
edges of terrain moving past: nothing static pops, crawls or sparkles. The dust was not
part of the moves (the helper flagged the Mars cloud's small lumps and the lunar streak
heads as things to watch while the camera turns).

## Stability test, milestone 1

Three consecutive frames at two stations along ten scripted moves (walking, turning,
telephoto, low flight, high flight and orbit on Mars; walking, turning, low flight and
orbit on the Moon), about one pixel of image motion per frame, exposure held.
Numbers are in `docs/shots/stability/report.json`; the strips are not kept in the
repository (re-create them with `npm run stability`).

- **No pops and no sparkles** in any of the moves; differences between frames follow
  the edges of things that moved.
- **Residual shimmer: one-pixel-high bright features alias**, because there is no
  anti-aliasing: sunlit ridge highlights on the near Martian ground while turning, and
  the sunlit far rim of the lunar crater (a broken line on the horizon). At the phone's
  resolution these are finer than in the test; to be judged there. → 2
- **Fixed: the near shadow map's texel grid was tied to the planet's centre.** One of
  its two coordinates was identically zero (never snapped) and, measured from the
  centre, the grid swept across the ground as the Sun turned, so shadow edges of rocks,
  the lander and the character could crawl. It is now tied to a point on the ground near
  the camera. Found by reading the code while chasing a test result; the test itself
  cannot show it (time is paused in screenshots), so the visible effect is unconfirmed.
- **Fixed: screenshot mode never became ready a few hundred metres above the ground**
  (the rocks waited for a shadow answer that was never asked for).
- The first version of the test moved too fast (several pixels per frame) and let
  exposure re-meter between frames; both produced large, honest differences that hid
  what the test is for. Steps are now about a pixel and exposure is held per station.

## Milestone 4 review (after the checkpoint, at the owner's request)

The owner asked for milestone 4 to be reviewed, judged and its errors redone before it is
called done. Done as two rounds of independent reviewers (code read along five lines:
character and poses, targets and GO, camera and flight, rendering cost, phone screen and
documentation), each finding checked by a second reviewer told to disprove it, plus a
critic that saw only the pictures and the art rules. 25 findings held (about 19 once the
duplicates were merged); the fixes themselves were then reviewed the same way and 7 more
problems were found in them and fixed. What changed, for the player:

- **GO** now stops above the target and stays there with HOVER on (before, its speed on
  arrival was about 70,000 km/s near the Moon and the figure hit the ground at once). A
  trip ends when the character is put away, the free camera is taken, a bookmark is chosen
  or it stands up. Across the world hand-over the trip keeps its heading (it veered by
  about 110° and arrived 4 s late) and the cloak no longer whips round.
- **Three-point landing**: a real kneel (left foot planted, right knee and fist on the
  ground, head low), for every landing over about 10 m/s; a jump or take-off straight out
  of it lets go of it.
- **Chase camera**: while the figure hovers upright it is drawn 5.5 m ahead instead of
  4.1 m, so its boots are in the picture (cruising with the stick pushed is unchanged). No
  jump of the figure on landing or after the next take-off while the view turns. The
  figure's trailing offset is the same at 30, 60 and 120 fps (it was four times larger at
  120 Hz than at 30). Turning straight round on foot turns the figure at once (it ran
  backwards for over a second). On a steep slope just past a crest the camera rises enough
  to keep the figure in sight.
- **Dust**: a ring at take-off when up is held (the usual phone take-off threw none); the
  landing ring at the moment the feet touch; from higher up a lingering cloud is hidden by
  rocks and ground in front of it; a long run or a bookmark jump no longer breaks it up.
- **Darkening under things**: the feet's spheres were read from the wrong slots (one of
  them NaN); the lander's and the rocks' spheres now fade in and out.
- **HOVER** pressed during a fall on foot stops the fall, as its message says.
- **Screen**: `GO` sits above `▲` (showing it pushed every button after it one place
  along); the target marker stays when the HUD is off, keeps its label inside the screen,
  and a place beyond the horizon is marked where the way to it crosses the horizon, with
  "over the horizon"; the full read-out starts below the buttons; the HUD no longer shows
  through the start and results screens.
- **Tests**: `npm run transfer` turns the frame at the hand-over as the game does and flies
  every trip with HOVER off and on; the headless tests no longer count the software
  driver's "GPU stall" notes as page faults (target and foot had been failing on them).

Checks on the final build: `target`, `foot`, `smoke` (21 shaders, the terrain at 15 of a
phone's 16 textures, none failing) and `flight` pass; `transfer`: the trip to another world
arrives in 15.5 s (marker 14.7 s) through a frame turned 112° at the hand-over and with
HOVER on holds 71 km over it (before: on the ground in a fraction of a second); a place
trip holds 480 m up with HOVER on; `flyby` unchanged (an aimed trip lands, a 60-radii miss
released lands); the governor simulation unchanged; triangle and draw counts of the
re-rendered reference views identical to before. Re-rendered references: the three-point
landing, both hovers, both touch-down dusts, the Mars flight, the target marker, the UI.

The critic's remaining gaps are about the character's look (a sheet-like cloak, a slim
suit, no footstep dust): in the known-problems table for a later character pass.

## Foundation review and the owner's character (after milestone 4)

The owner sent three reference pictures of the character (a cultivator in a white-silver
robe, long magenta-purple hair, wide sleeves, a silver sash with pearls and tassels) and
asked for the robe to flow in the wind and in flight, for everything built so far to be
reviewed, judged and fixed, and for milestone 4 to be a good foundation. In the same
session the owner dropped the fixed budgets.

**The character** (`src/hero/heroModel.js`, `src/hero/robe.js`; `cloak.js` is gone).
The suit, helmet and cloak are replaced. The body: a slim torso in a crossed-collar robe,
silver shoulder pieces with a fringe of drops, a wide silver sash with a polished clasp,
strings of pearls with lavender tassels on the hips and down the back, silver bracers,
bare hands, loose trousers gathered into silver-topped boots, a head with a simple face
and two locks of hair framing it. The cloth, one draw call and about 500 simulated points:
three panels of the long skirt with slits at the front and sides, two wide sleeves (a
sheet laid over each arm, fixed along it and sewn underneath, hanging deep at the wrist),
three long locks of hair down the back. It is drawn finer than it is simulated, with
folds. Five materials in one shader: silk (a satin sheen), skin, silver embroidery,
polished silver and pearls, hair (highlights along the strands). No textures. About
9,400 triangles (the suit had 6,300). A breeze always blows through the cloth. Limits,
honestly: a code-built figure cannot match the paintings' face, ornament or painted
detail; the owner was asked whether the 3D model named on the reference sheet exists.

Reference pictures (`docs/shots/*_hero_*`, final build): hover on both worlds (the back
view of the owner's second reference), walking toward the camera (`mars_gale_hero_front`,
new), run, super speed, fast flight, bank, coming in to land, jump, three-point landing,
orbit, touch-down and footfall dust.

**The foundation review**: six lines of review over all work since milestone 3 (flight,
character logic, rendering, phone screen and tests, foundation for milestones 5–8,
documentation truth), every finding checked by a second reviewer told to disprove it:
51 findings, 48 upheld. Fixed in this round:

- *Flight*. Held against a body without terrain (Earth, the Sun, Phobos, Deimos) flight
  crawled at walking pace (a placeholder height of zero): now its true height. Beside such
  a body the traveller is carried along with it (before, Phobos drifted off at 1.5 km/s
  and the Sun at 15,000 km/s, because everything is kept in the home world's spinning
  axes). The camera could fly inside Phobos and Deimos (they are drawn up to 25 % bigger
  than the sphere that stopped it): now the shape as drawn. A stick pushed part of the way
  no longer bends the flight toward the ground (at half stick, aimed level, it sank at
  31°). The last stretch of a GO trip no longer depends on the frame rate (trips to a body
  take about 1.2 s longer, 16.7 s; the marker's estimate was re-tuned: 16.6 s). Trips to
  places below the datum (all the Moon's places, Gale) can no longer aim through the
  world. A hand-over keeps the moment and centres the time slider (the clock jumped by up
  to weeks at the next touch of a time key); the time keys run per second, not per frame.
  A world whose data fails to load is retried after a pause, with a message.
- *Character*. After a hard landing the kneel lets go when the stick unlocks (it slid a
  metre on one knee). No forward tilt after a flared landing (22° before). Leaving the
  ground on a steep slope is the same at 30 and 60 fps. Standing, the figure keeps facing
  where it faced: turn the view round it to see its face. Off a sheer wall it no longer
  hangs in mid-air. The terrain's shadow on the figure fades in and out and keeps updating
  while terrain loads (it froze, then snapped).
- *Rendering*. Rocks keep their own sunlight when the scatter moves (they flickered lit and
  dark near shadow edges). Dust takes free packets first (at super speed on the Moon,
  packets vanished in mid-air) and its lumps no longer jump every 1000 s.
- *Screen*. `F` / the button now labelled `CAM` is the free camera where you are (from
  flight it dropped the player to the ground in first person).
- *Tests* (helper). `npm run flight` can now fail (it could not); screenshots fail on page
  errors and shader failures; the shader-limit check counts varyings properly; the
  stability test says what it cannot show and gains `--streaming`; the target test works
  the touch stick and look for real; `--distdir` no longer silently serves live source.
- *Documentation* (helper): ARCHITECTURE's frame order, governor and world schema, the
  known limits, the keys and parameters, brought back to what the code does.

Left for later, each in the known-problems table: Earth and other bodies drawn as
generated patterns, eclipses, the frame far from every body, loading all worlds' data at
start-up, the trip test's hand copy.

**Final review** of this round's own changes (four lines of review, each finding checked
by a second reviewer): 23 findings, 22 upheld, all fixed before the merge. The ones that
showed: the robe, sleeves and hair were lit inside-out (their normals pointed against the
way their triangles were wound, so the sunlit side was the dark one); the silver trims
were shaded as skin or as nothing (a material number blended between neighbouring
points); with the governor's cloth step on, the sleeves came off the arms on three frames
in eight (it now halves the solver's passes instead of the step); sleeves whipped for
three frames after a bookmark; the skirt went under the ground when kneeling (the cloth
now has a ground); a light push of the stick aimed upward flew backward (the first fix
for the bending pull overshot); off a sheer wall the figure bounced between falling and
flight (the first fix did not hold: it now falls on foot until the camera is past the
edge too); a bookmark pressed while being carried with a moon landed far from the place;
the figure stayed sunlit on the night side of an airless world above 20 km; the collar
stood 4–8 cm off the neck and the brows off the head. Recorded, not fixed: `transfer`
and `flyby` print their numbers but still cannot fail.

## Look pass after the milestone 4 review (owner: "keep refining the looks")

Aimed at the critic's character gaps, the things on screen all the time:

- **Cloak**: drawn as a smooth surface through the simulated points (25 x 27 drawn points
  over the 9 x 14 simulated ones, Catmull-Rom across and down) with about four and a half
  folds fanning from the shoulders, 6 mm deep at the top and 34 mm at the hem, pressed in
  along the cloth's own normal; the inside of a fold is a touch darker. The simulation
  and its cost are unchanged; about 1,000 more triangles. Up close it now reads as cloth
  with pleats; seen exactly side-on in a run it is still a thin line (a flat cloth seen
  edge-on).
- **Suit**: arms drawn 28 % and legs 22 % wider (their length and joints unchanged), the
  soft torso 10–12 % wider, the backpack 9 cm deep instead of 5, the gold visor larger;
  the cloak hangs 4 cm farther out to clear the pack, and its collision with the limbs is
  widened to match.
- **Dust at every footfall**: each step on the ground kicks a small puff from the foot that
  lands, bigger the faster the run (the steady trail on foot is a quarter of what it was,
  the footfalls carry the rest). Shot parameter `dust=run` freezes the last few.
  Lunar grains in vacuum take less of the sunlight (0.35 → 0.2): the puffs were brighter
  than the regolith they came from.
- **Mars air**: the dust pooled low in Coprates halved (density 0.6 → 0.3). The pictures
  barely changed: the haze over the far wall is mostly the general dust at the canyon's
  depth, seen with the Sun low just before sunset. Making Mars's air clearer means
  lowering the main dust load, which changes the sky and the sunset too: milestone 5.

## Independent critic, milestone 4 (screenshots and art rules only)

The five biggest gaps, as ranked (all about the worlds, none about this milestone's
character and flight work; each is in the known-problems table with its milestone):
1. Landforms read as soft sand and clay, not as the real places: Mount Sharp a rounded
   heap of even corrugations, the Coprates wall a flat band, the Olympus caldera wall one
   smooth slab, Hadley Rille a shallow trough, Tycho's peak a mound.
2. Mars daylight haze at dust-storm level: the 60 km wall nearly dissolved, a flat khaki
   sky (clear-day rover views see rims 30–40 km away crisply).
3. Earth and Deimos colourless blown-out blobs; few stars in the earthlit lunar night.
4. The lunar surface lacks Apollo's hard high-key light (dim, soft, plaster-like craters).
5. Invented colour: an olive cast in the Mars sunset sky, a hard-edged cream twilight
   ellipse, chalk-white outlines on canyon walls from orbit, a bluish Mars crescent; the
   figure's legs near black in orbit over sunlit Mars (no light from the planet below).

Kept: the Mars canyon sunset (blue aureole, ridges into warm haze), the whole-Moon and
day-side Mars globes, the black lunar sky with hard shadows and the lander in the same light.

"Visibly broken", and what was done:
- The figure's shadow a stick figure without a cloak (mars_ship_hero_dust), a black
  parallelogram (moon_ship_hero_jump): checked, both are the figure's own long low-Sun
  shadow (the first cut by the frame's top edge, the second the cloak streaming flat).
- The cloak a stiff stick or plank seen from the side (run, super speed): it streamed into
  a flat sheet; it now flutters like a flag along its own normal.
- Lunar dust like comic speed lines or sparks, brighter than the regolith: shorter,
  fainter, scattering less. Re-checked in the re-rendered picture.
- No three-point landing visible (moon_ship_hero_land): the pose was there but seen from
  behind under the cloak; the picture is now side-on.
- Pale bluish rocks on Mars, smeared ripple texture at the lander bench, the striped
  foreground slab in mars_wall, black shadow slivers in moon_ledge_orbit_low: existing
  terrain and rock work, listed as known problems.

## Independent critic, milestone 3 (screenshots and art rules only)

Thirty reference pictures, compared with Viking, Pathfinder, the rovers, Hubble and the
Apollo surface photographs. The five gaps, worst first, and what was done:

1. **Mars is one colour everywhere**: ground, cliffs, rocks and the globe the same tan;
   from orbit no Solis Lacus, no dark regions; craters and the canyon as white embossed
   lines. → a helper traced where the colour map's contrast is lost from orbit; another
   reworked the ground palette (see below).
2. **Landforms read as sand or dough**: Mount Sharp a rippled heap, canyon slopes like
   wax, blurry dark "tiger stripes" on the ground, the Olympus caldera wall near-white
   like snow, identical faceted rocks. → ground palette and texture helper; the large
   landform shapes are recorded under known problems.
3. **The Moon's light is soft**: few, small, soft shadows at mid-morning; the figure's
   shadow blurred; the sunrise view's foreground the whitest thing in the frame;
   blotches on the rille's far wall. → a helper on crisp shadows; the exposure of
   into-Sun views and of the night now follows how Apollo crews exposed.
4. **Bright sky bodies**: Earth a white oval in a glow, Deimos burnt out, Phobos cream
   and brighter than the sky. → Earth and Deimos belong to milestone 5. Phobos is lit
   by full sunlight and seen through the whole dusty sky, which adds to it, so it is
   brighter than the sky behind it; kept.
5. **The Mars sky**: the twilight a cream lens with a sharp lower edge; the daytime sky
   away from the Sun flat grey-brown. → milestone 5 (already in the known problems).

Kept, as the critic advised: the Martian sunset (`ledge`, `sun`), the Moon from space with
its seas and Tycho's rays, the crescent Mars with its bluish rim, the black airless sky,
Mount Hadley.

Reported as broken: a straight line across the ground at the Mars lander (the lip of a
small rock bench; in milestone 2 it was the edge of a wrong shadow, now fixed); a curved
material edge and a stair-stepped far ridge at Olympus; a box-like ledge with stretched
texture in `mars_wall`; stair-steps on the lunar sunrise ridge (no anti-aliasing yet);
soft puffs of lunar dust (now a spray of fine grains on clean arcs).

## Independent critic, milestone 2 (screenshots and art rules only)

Told that real surface maps from orbit and the simple character are scheduled. Ranked:

1. **A low Sun that casts no long shadows.** Rocks, lander and craters sit on evenly lit
   ground with a small smudge at most; from 120 km lunar craters are pale dimples. Real
   low-Sun frames are ruled by shadows many times longer than the objects. → 3
2. **The Moon is soft where it must be razor-sharp.** Blurred, wobbly edge on the big
   crater shadow, craters shading like blisters, the broken white line on the horizon, a
   glowing fringe on the globe, a ruler-straight terminator, ground like plaster. → 3
3. **Mars's colour and sky disagree from shot to shot.** A flat grey sky with no
   brightening toward the horizon over saturated orange clay in `mars_ship`; an olive
   drift in `mars_sun` and `mars_dusk`; chocolate ground in `mars_ledge`; the dusk glow
   is a cream lens with a visible upper edge. → 3
4. **Mars from orbit looks cloud-covered** even allowing for the missing map: a cream
   veil, faint vertical streaks in the low-orbit view, a fat fuzzy rim, no relief
   although the largest canyon lies below in raking light. → 3
5. **Sky bodies fall apart under a long lens.** Phobos's shadow edge was a staircase of
   facets (fixed straight away: the moons' meshes had one normal per face); Deimos burns
   out at dusk; Earth is a grey-white speck with no blue; `moon_dusk` is exposed as
   bright as day. → Earth 5; night exposure 3.

Strongest image: `mars_ledge` ("at a glance it passes for a rover sunset frame").
Weakest: `mars_ship` ("grey slab sky, monochrome orange clay, box rocks and a lander with
no shadow").

Compared with the first review, the gaps about the view from space (blown-out globes,
lit night sides, the stripe on the terminator, no edge glow) are gone from the list;
what replaced them is mostly the lunar surface and Martian colour, which milestone 3 is
for.

## Independent critic, milestone 1 (screenshots and art rules only)

Ranked, most damaging first. None of these were in milestone 1's scope; each is filed
under the milestone that owns it.

1. **Both worlds are blank from orbit.** Mars's day side is a blown-out cream ball with
   no canyon, volcanoes or dark markings; the Moon is one pale grey with a few dozen
   soft pits, no maria, highlands or rays. → 3 (real maps, both worlds from orbit); the
   over-exposed day side is an exposure fault to fix first → 2.
2. **The day–night boundary is wrong.** Night sides are visibly lit (Mars rust-red and
   more detailed than its day side), terminators are ruler-straight, Mars has a grey
   stripe darker than the night beyond it, the airless Moon has a soft glow around its
   lit edge, Mars's halo is thick and fuzzy, and the twilight in `mars_dusk` is a
   hard-edged lens. → 2 (edge glow, stripe, Moon halo), 3 (terminator, night side,
   twilight edge).
3. **A low Sun does not look low on the ground.** `mars_ship` reads as overcast noon
   with no contact shadows under the lander and rocks; at 7° the lunar ground is evenly
   grey and craters read as pale blisters, not shadow-filled bowls. → 2 (shadowed-canyon
   haze and sky light, contact shadows), 3 (ground materials).
4. **Lunar ground is uniform plaster.** Same grey in every direction and at every Sun
   height, `moon_dusk` looks like daytime with stars, craters are identical stamps, a
   broken white line runs along the horizon, Earth is a white speck with no blue.
   → 3 (lunar maps and materials), 2 (the white line), 5 (Earth).
5. **The character is a mannequin.** Ball head with no visor, pipe limbs, no backpack,
   a stiff rectangular cloak in saturated red, a suit that stays clean white in
   butterscotch light. → 2 (limbs, cloak), 4 (the rest).

Strongest image: `mars_sun` ("could pass for a Spirit/Curiosity sunset frame").
Weakest: `mars_ledge_orbit_globe`.

## Log

- **Foundation (before the charter)**: stages 0–9 of the original brief — skeleton and
  HDR pipeline, terrain, atmosphere, sky, shadows, rocks and lander, phone adaptation,
  the Moon swap, the flying character and flight between worlds.
- **Charter adopted**: `CLAUDE.md` rewritten from the owner's charter, `docs/ROADMAP.md`
  added, the replaced rules deleted (old hardware target, pixel caps, "no UI", Mars-only
  scope, the do-not-build list).
- **Milestone 1 built**: Pages workflow, build stamp, start screen, governor with Smooth
  and Sharp, benchmark and soak with a results screen, exact-pixel canvas, three-state
  HUD, `shots:all`, `stability` and `smoke` scripts. Removed `dynamicResolution.js`,
  `MAX_PIXELS`, `TARGET_FPS`, `MIN_SCALE` and the `?fps=` parameter.
- **Milestone 2 built**: exposure, sky light and edge glow from space; fade-in of new
  terrain; roll carried across the hand-over; faster lunar chunks; terrain shadow in the
  haze; clearer Martian air; rock ledges and a new lander view; bending limbs and a cloak
  that stays off them; Phobos and Deimos checked (and their faceted shading fixed);
  tools `sky-table`, `profile-chunks`, `build-check`; shot parameters `aim`, `east`,
  `north`, `debug`.
- **The owner's phone results and flight notes** (between milestones 2 and 3): both
  modes start at native resolution, chunk uploads are spread over frames, flight goes
  where it is aimed, gravity pulls when the stick is released, `HOVER` button.
- **Milestone 3 built**: the real Moon (LOLA, SLDEM2015, Clementine) with its scene at
  Hadley Rille; Mars in Viking colour; lunar photometry; landmark bookmarks with their
  own elevation patches (Olympus Mons, Gale, Tycho, Taurus-Littrow) and labels; dust;
  automatic shadow ceiling, per-texel baked sunlight, shadow rays that start from the
  ground as they see it; exposure rules for globes, small bright objects, dim scenes and
  the Sun on a ridge; `scripts/fetch-maps.py`; shot parameter `dust`.
- **During milestone 3, from the owner's notes**: Mars opens on the canyon's north rim;
  slower flight near the ground; a narrower lens; slope maps of both worlds for depth from
  space, Mars craters 1–30 km, finer detail from orbit, 4096-wide colour maps; Mars ground
  cover (dust, dark sand, bedrock), block rocks (helper); hard lunar shadows (helper);
  Mars's colours from orbit (helper); walking, super speed and real-gravity jumps on foot.
  Tools `foot-test`, `vista`/`cliff` searches (session scratch only), shot parameters
  `heropose=stand|walk|run|super|jump`, `posedir`, `debug=nofar|norelief|nofarrough|noboost`.
- **Milestone 4 (character and flight feel)**: cruise, boost, banking, climbing and
  feet-first poses; landing flare, three-point landing, launch pose, take-off dust; target
  list (this world's real places, the bodies in the sky, the Sun) with a marker, distance
  and trip time; GO hands-off trips with a transfer boost; chase-camera drift, sight over
  ridges, super-speed pull-back, figure hidden through the telephoto; darkening at the
  foot of the figure, the lander and rocks; the suit's detail (helper); dust clouds and
  sprays (helper). Tools `transfer`, `target`, `scripts/lib/glLimits.mjs` (phone shader
  limits in smoke and every screenshot run), `--distdir`; shot parameters
  `heropose=fast|bank|climb|land|launch`, `target=`, `debug=contactx4`.
- **Milestone 4 review** (owner's request after the checkpoint): 32 problems found by
  independent reviewers and fixed (GO arrival speed and hand-over heading, a real
  three-point landing, hover framing, dust timing and depth, contact spheres, HOVER in a
  fall, the GO button's place, the marker beyond the horizon and without the HUD, frame-
  rate independence); `transfer` flies with HOVER on and off through a turning frame; the
  headless tests ignore the software driver's performance notes. Milestone 4 `done`.
- **Foundation review and the owner's character** (after milestone 4): the robed,
  long-haired figure from the owner's references (`heroModel.js`, `robe.js`); 48 upheld
  findings of a 57-reviewer foundation review, fixed or recorded for their milestone;
  fixed budgets dropped by the owner, 180 terrain patches; `App.carryWith` / `turnAxes`;
  tests that can fail; shot parameter `posedir=front`. Tools: `stability --streaming`.
- **The gate and milestone 5**: the owner's second phone results; the charter rewritten
  round one goal; governor levers for slow work; Earth as a globe from NASA's GIBS maps
  (`scripts/fetch-earth.py`), its air, glint, clouds and lights; the Sun up close;
  eclipses; light from the world below; `at=` for pictures beside a body; a cloud
  environment `what-it-s-best-at` that allows the NASA and USGS map hosts.
- **Milestones 6 to 9** (the owner: "finish up the rest of the milestones", with the
  third benchmark): the ground drawn by one instanced mesh from texture arrays, uploads
  between frames; twelve new worlds as data (Phobos, Deimos, Mercury, Venus, Ceres, Io,
  Europa, Enceladus, Titan, Triton, Pluto, Charon) and Earth's surface with a sea and
  clouds; orbits fitted to JPL Horizons, Jupiter's drifting bands, Saturn's rings; the
  menu, the solar system map, the clock and dates, the warp effect; the journal, photo
  mode, saves, sound. Reviewed by one workflow (25 findings, all fixed: "Milestones 6 to
  9 review"). Tools: `worlds`, `ui`, `peek.mjs`, `check-ephemeris.mjs`, `fit-orbits.py`,
  `fetch-worlds.py`, `fetch-earth-terrain.py`.
- **Milestone 10, a living Earth** (the owner, with the fourth phone results): governor
  tuned (resolution first, strides, each world's level remembered) and an Earth
  benchmark; Earth streamed from AWS Terrain Tiles and NASA GIBS (rings, a tile worker,
  rebuild in place, a test mirror); the sea, lakes and rivers from the land's shape and
  real rainfall; forests of each region's trees, wind, seasons, leaves; a cloud volume;
  the weather of 8 September 2017 (three hurricanes), rain, snow, lightning, thunder, a
  rainbow. Reviewed by one workflow (30 findings fixed). Tools: `fetch-earth-climate.py`,
  `fetch-earth-weather.py`; `debug=flash`.
