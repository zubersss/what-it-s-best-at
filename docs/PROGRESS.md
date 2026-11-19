# Progress

What exists, what was decided and why, what is wrong, and a short log. The plan of record
is `docs/ROADMAP.md`; the rules are in `CLAUDE.md`. Update this file in every commit that
changes behaviour.

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
- **The character**: a suited figure with a cloth-simulated cloak. Flight speed grows
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

"I've played it and it looks like I'm floating on top of nothing." Reproduced in the real
game (pressing Play like the owner, then walking) and measured. Causes found:

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
- **Chunk grid 40×40, normal map 120², shadow map 60², 120-chunk draw cap**: the draw-call
  budget, not the triangle budget, limits terrain detail, so chunks were made denser.
- **Mobile GPU care**: clears before full-screen passes, depth and unused colour
  invalidated, GL context loss reloads the page.

### Measurement and the governor (milestone 1)

- **The canvas is drawn pixel for pixel** (`devicePixelContentBox`), so "native" really
  is the panel's own pixels. A guard at 8.3 M pixels protects the memory budget on
  monitors above 4K only.
- **Smooth starts at about half of native's pixels, Sharp at native.** Coming down is
  quick (under a second per step) and climbing is slow on purpose, so starting high
  settles fastest, but starting Smooth at native would mean a second or two of stutter
  on a phone that cannot hold it. To be tuned from the first benchmark.
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
  rocks within 30 m (they are scattered nearest-first), so the triangle budget holds.
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
- `TARGET` snaps the view to the next body.
- **The cloak trails in vacuum too** (30 % of the atmospheric flow is kept). This is the
  one deliberate departure from physics, at the owner's request.
- World hand-over (Mars ↔ Moon) happens when the other world's surface is nearer than
  the current one's; in practice about half-way, where both are dots. Simulation time
  runs on across worlds; pressing a bookmark jumps to that world's own scene date.

## Known limits of what is built

- Air is not shadowed by terrain; haze inside the shadowed canyon is lit as if sunlit.
- No sky-visibility bake: sky light is not reduced inside the canyon.
- Shadow maps are 60² per chunk; shadows cast from far away have soft edges.
- Gullies below MOLA resolution are not aligned downslope.
- Planetshine is unshadowed and comes only from the single brightest sky body.
- The Moon's rotation uses mean elements (no libration); Earth can be a few degrees off.
- No anti-aliasing.
- Earth's disc is a procedural ocean/land/cloud pattern, not real geography.
- Only Mars and the Moon have terrain; other bodies stop you 2 % above their radius.
- The sky's in-scatter fades out above the atmosphere: no glow on the planet's edge.
- The character has rigid limbs; the cloak collides with a single capsule.

## Known problems (and where the roadmap deals with them)

| Problem | Milestone |
| --- | --- |
| Milestone 2 and 3 builds have not been measured on the phone: the per-pixel haze near a planet's edge, the albedo lookup and the dust are new costs | owner's next benchmark |
| No contact shadows under the lander and rocks when the site is in terrain shadow | 4 |
| One-pixel-high bright features alias (ridge highlights, crater rims): no anti-aliasing. The milestone 1 results showed room for it; it waits for numbers from the current build | after the next benchmark |
| Night scenes need about 570 frames for exposure to settle in screenshot mode | tooling |
| A chunk that takes over while its parent is itself still fading in starts from the parent's own maps, a small jump during fast streaming | watch |
| Chunk builds cost about 10 % more than in milestone 2 on Mars (the rays that keep shadows continuous across chunk borders); lunar chunks are a third cheaper than before | watch |
| The terminator seen from far away is as sharp as the shadow map's texels: stair-stepped on the Moon at high zoom, no long relief shadows across it | 5 |
| Looking straight down-Sun on the Moon the ground is featureless (true to life, but nothing to steer by); small craters only show across the light | 4 |
| The SLDEM patch has faint north-south stripes a few metres high (the altimeter's tracks) | watch |
| Outside the sharp patches the Moon and Mars are 7 to 15 km per pixel plus invented relief: landing anywhere else shows no real small landforms | 6 / 7 |
| Mars from orbit is soft: about 40 % of the contrast of the Viking mosaic survives the haze; Valles Marineris shows by its bright rims | 5 |
| Twilight glow has a hard upper edge at the highest exposures | 5 |
| Mars: flat grey sky away from the Sun, olive cast in the sunset views | 5 |
| Deimos burns out to a white blob at dusk exposure | 5 |
| Earth is a blown-out white disc from the Moon and has no blue | 5 |
| The character is still a simple figure: no visor detail, no backpack, clean white suit | 4 |
| Dust puffs are soft round sprites: up close the single puffs can be told apart | 4 |
| Far from every body there is only the HUD read-out to navigate by | 4 / 7 |
| Triangles sit at ~420–480k of the 500k budget | watch |

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
