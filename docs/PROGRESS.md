# Progress

What exists, what was decided and why, what is wrong, and a short log. The plan of record
is `docs/ROADMAP.md`; the rules are in `CLAUDE.md`. Update this file in every commit that
changes behaviour.

## What exists today

- **Mars**: Coprates Chasma (Valles Marineris) on real NASA MOLA elevation, at
  2014-01-31 09:29 UTC, about 20 minutes before local sunset. Five bookmarks: ledge, sun,
  wall, ship, dusk.
- **The Moon**: a procedural cratered world from a data file alone, at 2026-01-15, lunar
  evening with a gibbous Earth. The same five bookmarks.
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
  Elsewhere on the globe it is scaled by a table of sky-plus-bounce light on level ground
  against the Sun's height (built once per world on the GPU, divided by its own value at
  the camera, capped at 32). It is exactly 1 at the camera, and below 3 km of altitude
  the look-up is skipped altogether (it fades in up to 30 km), so nothing changes on the
  ground and nothing is paid for there.
- **Edge glow from space is marched per pixel**, in the sky dome (rays that cross the
  shell) and on ground seen at a grazing angle (blend from froxels below a view cosine of
  0.38, fully marched below 0.22). Screen-space froxels cannot follow the path length
  there: it changes by a factor of two between neighbouring froxels. The sky-view LUT is
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
- **Moon**: fully procedural for now, site just inside the east rim of a ~3 km crater at
  7.98°N, 54.95°W. The `ship` and `dusk` bookmarks stand 25 m east on the rim crest;
  `ship` is two days earlier so the rim's shadow does not cover the lander. Regolith
  roughness was halved: at a 7° Sun a flat crest dissolved into micro-shadow speckle.
- **The sky always contains every catalogue body**; the one underfoot is skipped.

### Character and flight

- Interactive sessions start behind the character; bookmarks in screenshot mode stay
  first person unless `?hero=1`.
- Speed is 0.85 × distance-to-nearest-surface per second (×3 boost): slow near the
  ground, far faster than light between planets, automatic slow arrival.
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
| Governor start level, step sizes and thresholds are first guesses until the owner's phone results arrive | 1 (open) |
| No contact shadows under the lander and rocks when the site is in terrain shadow | 3 |
| One-pixel-high bright features alias (ridge highlights, the lunar far rim): no anti-aliasing | 3 |
| Night scenes need about 570 frames for exposure to settle in screenshot mode | tooling |
| A chunk that takes over while its parent is itself still fading in starts from the parent's own maps, a small jump during fast streaming | watch |
| Lunar chunks still build about 1.7× slower than Martian ones (41 vs 24 ms in Node) | watch |
| From orbit Mars is one colour and soft; the Moon has no maria or rays | 3 |
| Terminators are geometrically straight; no relief shadows along them from afar | 3 |
| Twilight glow has a hard upper edge at the highest exposures | 3 |
| Lunar ground is one grey at every Sun height; craters are soft stamps | 3 |
| Baked terrain shadows have soft, wobbly edges on an airless world; no long shadows from rocks and lander at a low Sun | 3 |
| Mars: flat grey sky away from the Sun, olive cast in the sunset views, one-colour ground | 3 |
| Mars from orbit is veiled in cream haze with faint vertical streaks; the canyon does not show | 3 |
| An earthlit lunar night is exposed as bright as day | 3 |
| Deimos burns out to a white blob at dusk exposure | 5 |
| The character is still a simple figure: no visor detail, no backpack, clean white suit | 4 |
| Earth is blown out to white in the lunar dusk shot and has no blue | 5 |
| Far from every body there is only the HUD read-out to navigate by | 4 / 7 |
| Triangles sit at ~460–480k of the 500k budget | watch |

Fixed in milestone 2: detail popping as terrain refines; no glow (and an inverted band)
on the planet's edge from orbit; over-exposed globes, lit night sides and the stripe on
Mars's terminator; the halo around the airless Moon; the roll at the Mars ↔ Moon
hand-over; lunar chunk build time (72 → 41 ms); haze ignoring terrain shadow; ledges
reading as dunes; the far wall's haze (in part: 15 % less dust); rigid limbs and the
cloak passing through arms and legs; Phobos and Deimos checked.

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
