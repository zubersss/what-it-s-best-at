# Living water on Haven: the report (helper on `ccr-6f4f9272-water`)

The brief is `docs/briefs/living-water.md`. This file is kept up to date piece by piece:
what was built and how, the pictures, the cost, what is not done and why. Pictures are in
`docs/shots/water/`.

## Tools made for this work (no browser, seconds)

- `scripts/lib/havenWater.mjs`: Haven's rivers and lakes in Node by the tile worker's own
  path (`mosaicWater` in `src/terrain/tiles/hydrology.js`, which the worker now calls too:
  one path for both): the three mosaics the game keeps round a place, each joined to the
  coarser one, and a height source with them in place.
- `node scripts/haven-rivers.mjs --lat .. --lon .. [--follow 2 --every 150]`: the rivers
  of the finest mosaic round a place, largest first; points along one of them (place,
  level, flow, depth, speed, the way it runs).
- `node scripts/haven-rivers.mjs --lat .. --lon .. --map out.png [--span 4000]`: the water
  round a place from straight above as the height code answers it (relief, lakes, rivers by
  their speed, falls): what a river's line looks like, in five seconds.
- `node scripts/haven-rivers.mjs --check [--unjoined] [--gates]`: the rivers' promises at
  seven places (20 s): the water's level never rises along a stretch; the flow the height
  code answers runs down the stretch's line, within the speed's limits; every river of a
  coarser mosaic that crosses the box a finer one answers for is met there by a river of
  the finer one, on its line and at its level. Exits non-zero. Seen to fail: `--unjoined`
  (the rivers as they were before the join) fails with nearly every crossing not met.
- `node scripts/river-ribbon-test.mjs [--was]`: a river on far ground is one unbroken
  ribbon: real patches built over a river, coarser and coarser, and the river's share read
  from their normal maps all down its line. `--was` (the builder as it was) fails at every
  patch size from 3 km up.
- `node scripts/water-rules-test.mjs`: where two places must agree: the surf's GLSL against
  the JS the swimmer rides; the river in the normal map, written by the builder and read
  back by the shader's own text; the lanes repeating with the detail tile; the clocks; and
  a scan of the water's shader texts for names GLSL ES 3 reserves (a float called `half`
  left the waterfalls undrawn in the first push: the build does not compile shaders).
- `node scripts/find-fall.mjs --lat .. --lon .. [--pick 0] [--back 120] [--up 25]`: the
  largest waterfalls round a place and the picture query that looks at one.
- `scripts/ground-cost.mjs` has two views more: `river` and `fall` (the ground alone,
  six minutes a view; a full picture low over a wooded valley takes half an hour here and
  does not settle).

## 1. Rivers that run

**What was wrong.** The hydrology knew which way every cell drains and threw it away; a
river was a strip of the sea's water with the wind's ripples on it. Each map ring worked
its rivers out afresh, and where one ring handed over to the next a river stepped
sideways by up to 377 m and its level by tens of metres.

**What is built.**

- *One rule of speed* (`flowSpeed` in `hydrology.js`: Manning's rule from the water's fall
  and depth, 0.12 to 8 m/s). `packWater` gives every stretch of river its speed in mid
  stream and the way it runs at both ends (a stretch is 14 numbers now, `RIVER_STRIDE` in
  `height/dem.js`). The height code answers the flow at a place (`DemSet.rivE / rivN`,
  slower toward the banks: `flowAcross`; `hs.flowE / flowN` after `hs.height`). Everything
  else reads that: the patch builder for the picture, the app for what the water carries.
- *The flow reaches the shader with no new texture* (the ground's fragment shader stays at
  15 of 16). On running water the normal map holds twice (the surface's normal + the flow
  / 16 m/s) (`chunkBuilder.js`, `FLOW_UNIT`). Land and still water keep a normal of length
  one, so what the map has along the vertical above one is the share of a pixel that is
  river, however texels and mip levels blend, and what it has across the vertical is the
  flow (`terrainMaterial.js`, "living water, 1 of 2"). Writer and reader changed together.
- *The picture of running water* (`src/water/river.js`): lanes that run with the current
  round every bend (stripes that repeat with the 64 m detail tile whatever their
  direction: the four whole-number wave vectors round the exact one, blended; no texture
  read), broken into dashes that travel down stream at the flow's own speed (the detail
  texture carried by the flow as two pictures half a turn apart, a closed form of the
  waves' clock: nothing jumps), standing waves across the flow where it is fast, a river's
  own colour (wet stones through shallow water, green depth; not the sea's sand and blue),
  hardly a ripple in a pool. A river is water from bank to bank (a brook a hand deep was
  half ground colour).
- *What the water carries*: the walker in water is carried by the same number
  (`rig.current`, set by the app from `hs.flowE / flowN`; all of it when swimming, part
  when wading; added to the place, never to the walker's own velocity).
- *Rivers meet across the edge between two rings* (`hydrology.js`, "joined to the coarser
  mosaic"): the coarser mosaic's rivers are cut into the ground the finer one routes its
  water on (not into the real ground), as a trench with a funnel round it, through the
  margin outside the box the finer ring answers for and tapering out 16 pixels inside it;
  beside each crossing the box's edge is shut. A river traced through the trench lies on
  the coarser river's own points and, where that river lies on this mosaic's ground
  (within 8 m), at its level. Measured at seven places: 26 of 27 crossings met (within the
  river's own half width; most within 2 m and 0.1 m of level), where 25 of 27 were not.
- *The governor*: one step, `water`, after `detail` (the ladder's pin in
  `scripts/sky-system-test.mjs` has it): the lanes from the nearest wave vector alone
  instead of four blended (and, since piece 2, no mist at the falls).

**Pictures** (the ground alone, 35 m over a river of 71 m3/s that runs at 3.3 m/s; rings
as the game has them there): `river_ground_before.png`, `river_ground_after.png`.

**Cost** (`scripts/ground-cost.mjs`, software WebGL, a count of work, never a frame rate;
the `river` view, where water is a fifth of the picture): the ground's shading 1 609 ms
before, 1 750 ms after (+9 %), nearly all of it the sines of the lanes and the standing
waves, which software WebGL counts dear and a GPU does not; texture reads on a river
pixel went from 4 to 4. Where there is no river nothing is read or worked out (the block
is inside `if (river > 0.0)`).

**Not done / known.**
- Where a coarse mosaic's river hangs tens of metres over a hollow or lies inside a
  hillside (its cells are 1.5 km or 126 m wide), the finer mosaic's river meets its line
  but not its level: a step in the water at the ring's edge, 4 km and more from the
  traveller. Round Longwater four coarse rivers cross hollows 70 m under their level.
- A river's size still depends a little on which mosaic it is in (the inflow a mosaic is
  given comes from the coarser one's flow).
- The straight valleys: see piece 3.

*Added after the first push to piece 1:*

- *Windings* (`hydrology.js`, `windings`; Haven asks for 28 m in `haven.js`,
  `tiles.hydrology.wind`). Water is routed from cell to cell in eight directions, and the
  made world's valleys were cut the same way: a river ran down a valley as by a ruler (the
  "straight trenches" of the notes). Every point of every river's line is now moved by a
  field of the place (two sizes of smooth noise of where the point is in the world, not of
  the river nor of the mosaic), so a coarser and a finer mosaic bend the same place the same
  way and a river that comes in is moved as the one it joins. The valleys themselves are
  still straight (they are the map: not made again); the water in them is not.
- *The ring's box* is 24 pixels inside its mosaic now (`RING_INSET`, was 20: a whole
  number of the coarser ring's pixels, so a coarser river that runs along a row of its map
  no longer runs along the box's edge, crossing it eight times).
- *Speeds* are a boulder bed's (a brook on a slope of one in six: 3 m/s, not 5), at most
  5 m/s down a bed; 5.5 at a fall's foot; 8 is a fall.
- *The last hairlines*: the lanes read how far the detail tile's coordinates go in a pixel
  from the place itself (the coordinates jump by whole tiles from patch to patch, and a
  bright hairline lay across the river at every patch edge).

## 2. Rapids and falls

**What is built.**

- *Rapids* come with the speed: where the water is fast its lanes whiten, standing waves
  heap up across the flow (the lanes' stripes turned a quarter, staying where they are
  while the dashes run through them) and their crests are white. Below fast water the
  speed, and so the white, eases off over the cells it was worked out from.
- *Falls* (`hydrology.js`, `falls`). A river's level as traced follows the map's ground,
  which is smooth: a steep reach was one long chute. Now, where a river's level comes down
  through a ledge's height (every 60 m above the sea: by height, so a coarser and a finer
  mosaic put a fall at the same place) on a reach steep enough (14 in 100 over 50 m), the
  level drops there all at once by what the reach would have fallen in the next 50 m (6 to
  34 m), and lies level from the foot to where the old level comes down to it: fall, plunge
  pool, and the ground beside them cut down to the water as everywhere along a river (a
  gorge below the fall, a ledge above it). None just above a confluence, none in a ring's
  margin. Round the opening place the finest mosaic has some 70 of them, 6 to 18 m high;
  in gentle country none.
- *Their picture near by* is the ground's own: the drop is a stretch of river 1.5 m long
  whose speed is the most a speed can say (8 m/s): one white sheet; the pool at its foot
  is churned white and eases to lanes over 50 m (the speed there starts at 5.5 m/s).
- *Their picture from afar* (`src/water/falls.js`, one draw call, a pool of 384): a drop
  is a metre or two of ground from above, far less than a texel of the far ground's maps,
  so every fall the rings know of (they come with the rings' water: `packWater`, six
  numbers a fall; `Terrain.ringFalls`) also gets a leaning white sheet from lip to foot,
  streaked down its length with the streaks running down, never under a pixel and a half
  wide (thinner in strength instead), fading out within 220 m where the ground's own
  picture takes over; and mist at its foot, a soft cloud the Sun lights, brightest looked
  at toward the Sun. Lit by the shared lighting, in the air's haze like everything else.
- *Trees stand back from a river's edge* by about a crown's reach (`life/treeBlock.js`,
  from `hs.nearRiver`): standing at the very edge their crowns closed over every brook,
  and from the air a wooded valley had no river in it and no waterfall (the first far
  picture of a fall was of a wood). **A behaviour change on every world with rivers:** a
  strip 4 to 8 m wide along each bank has no trees (near and far trees alike: the far
  trees are the near ones).

## 3. Rivers and lakes from the air

**What is built.**

- *A river is an unbroken ribbon on ground of any coarseness.* A far patch's texels are
  wider than a river; asked sample by sample the river was there at one and not at the
  next (beads). Each sample now takes the share of its own ground that the nearest river
  covers, in its water or beside it (`DemSet` `cover` / `covS..`, `hs.setRiverCover`,
  `hs.riverNear`; a second, wider grid of stretches in each ring's water, `wideStart`,
  so nothing else's answers change), and the normal map holds that share linearly (the
  normal x (1 + share) + the flow x 2 x share; the fourth number 1 + depth x share), so
  texels and mip levels blend it as an area. The shader draws that share of the pixel as
  river. `scripts/river-ribbon-test.mjs`: no gap at any patch size from 0.8 to 49 km.
- *No teeth along far rivers.* For ground that coarse the bed and banks are not cut (a
  notch the patch's mesh cannot hold was a row of teeth along every far river): the river
  is laid on the ground as it lies (`layers.js`, sea, `far`). The walker's ground and
  everything placed on it are as before (only the patch builder sets the cover).
- *Inland water from the air*: an eighth of the sea's roughness in its glint, as it has an
  eighth of its waves (a river looked at toward the Sun was one pale band from bank to
  bank); more of the sky's own colour and less of its own blue (a lake from 3 km was a
  fill of royal blue); a river's own colour from the air is teal over a pale shallow hem.

## 4. The sea

**What is built.**

- *A beach wide enough for the tide* (`layers.js`, sea, `beach`; the rule is `shoreUp` in
  `height/dem.js`; Haven asks for 0.3): the map's ground within 12 m above and below the
  sea's level is flattened toward it, to 0.3 of its height for the first 4 m, easing back
  to the map's by 12 (a rise behind the beach, a drop-off beyond the shallows): the ground
  the tide moves over is some three times as wide as the map's slope gives (on the golden
  shore: 28 m as the map has it, 86 m now). The mosaics the rivers are
  worked out on have the same beach (`MadeWorld`, `sea`), so a river comes down to the
  shore the walker stands on. **A behaviour change:** Haven's ground within 12 m of the
  sea's level is lower (above it) or higher (the bed); Earth is unchanged (no `beach`).
- *Surf* (`src/water/surf.js`: one rule for the vertex shader's lift, the fragment
  shader's foam and the swimmer). A swell slows as the water shoals, so its crests turn to
  lie along the shore and crowd toward it: where in its turn the swell is at a place comes
  from the clock (8 s from crest to crest) and the root of the depth there, a little out
  of step along the shore. The surface lifts toward the shore, tallest where the water is
  as deep as the breaker is tall; there it breaks: a white front as each crest passes and
  the foam it leaves, thinning until the next; then it washes up the sand (the wash on the
  beach runs up fast and drains back slowly, in the swell's time) and the tide moves the
  whole of it up and down the beach. Before it breaks the swell's back shows paler.
- *From the air*: where a line of surf is under a pixel, the white of the whole breaking
  zone (a white line along every shore of the sea); the sea's shallows over sand paler
  (a turquoise hem).

## 5. Rain on the land

**What is built.**

- *Puddles* (`terrainMaterial.js`, "living water: puddles"): where the ground is wet with
  rain (the weather field's own wetness at the place, which the model lets dry over
  hours), water stands in the hollows of level ground (the detail's own height at two
  sizes and the creases of the ground's map): more of them the wetter it is, shrinking
  back into the deepest as it dries. A puddle is dark, level and mirrors the sky. One
  texture read, only where the ground is wet, level and within 320 m.
- *Rivers in spate*: by the wetness at the place a river is rougher, whiter and brown with
  what it carries, and falls back as the ground dries.

**Not done.** A river is not wider or deeper after rain (its water's edge is the ground's
shape); the wetness is the place's own, not what fell upstream.

## Parked on 2026-11-27 (the phone's speed comes first): how to take the water up again

**The state of the branch.** Everything is on `ccr-6f4f9272-water`. The head builds and passes
`./scripts/build-check.sh`, `node scripts/haven-rivers.mjs --check`, `node
scripts/river-ribbon-test.mjs`, `node scripts/water-rules-test.mjs`, `npm run lakes`, `node
scripts/far-ground-test.mjs`, `node scripts/sky-system-test.mjs`. **Not run on it:** `npm run
smoke`, the stability test, a phone benchmark, and an idle-machine cost run after piece 1.
The last build whose shaders were seen to compile and draw in the headless browser is the
commit "a river's mirror in its own green-blue" (the picture `haven_ledge_fall_160m_a13.png`
is from it); the head adds to it only the patch builder's change and a clamp of the flow in
the ground's shader (two lines of plain arithmetic), not yet seen in a browser.

**Done and proven (by a check or a picture).**
- Piece 1, all of it: one rule of speed; the flow in the normal map and read back exactly
  (`water-rules-test` 2 and 5); the lanes repeat with the tile (3); rivers joined across
  ring edges (`haven-rivers --check`: 21 of 23 crossings on sound ground, nearly none
  before); the walker carried (code only: not tried in `npm run foot`); the governor's step.
  Pictures: `river_ground_before.png` / `river_ground_after.png`.
- Piece 2: falls in the rivers' profiles and drawn (near: the ground's own white sheet,
  pool and gorge; far: the sheet and mist of `water/falls.js`). Pictures:
  `haven_ledge_fall_160m.png` (enlarge its middle: sheet, blue pool, gorge),
  `haven_ledge_fall_700m.png`, both from the build before the windings; `..._a13.png` after.
  `haven_ledge_fall_far.png` is the first try, a wooded valley from above with no water to
  be seen: the reason trees now stand back from river edges.
- Piece 3: the unbroken ribbon on far ground (`river-ribbon-test`, fails with `--was`).

**Half done: built, compiles, never looked at.**
- *Steep brooks were white from end to end* in every picture so far (a river's own slope
  read back as 2.5 m/s more flow on a slope of one in six). Fixed in the head
  (`chunkBuilder.js` writes the vertical in the water; `water-rules-test` 5), **no picture
  yet**: the fall views must be taken again, and the brook should now be green-blue with
  white lanes and a white fall, not a pale road.
- *Windings* (28 m): seen only in the Node sketch (`haven-rivers --map`) and in
  `haven_ledge_fall_160m_a13.png`.
- *Inland water from the air* (tighter glint, more sky, teal river, greyer lake blue): no
  picture. The `_a7` and `_before` pictures of `river_300/1k/3k` and `lake_1k/3k` are
  nearly the same as each other: they show what was inherited (a pale river toward the
  Sun, a royal-blue lake at 3 km, a lilac band with mint and yellow fringes at the opening
  place from 1 km: the critic's gap 4 is still open in them).
- *The sea* (beach profile, surf lift, foam line, wash, turquoise hem) and *rain*
  (puddles, spate): **no picture at all**; the shaders compile. The beach is measured in
  Node (golden shore: 28 m -> 86 m of ground between low water and 1 m over high water).
- Tree setback from rivers: seen working in the fall pictures.

**The main session's two remarks on `river_ground_after.png`.**
1. *Two thin pale straight lines across the river*: patch edges. The detail tile's
   coordinates jump by whole tiles from patch to patch, and two things read their change a
   pixel: the lanes (fixed: from the place itself, `dux` / `duy` in the ground's shader)
   and the nearness the dashes fade by (fixed: `nearR`). Both fixes are in the head; **not
   yet confirmed in a picture** (the last ground-alone river picture, taken between the two
   fixes, still had the lines).
2. *Dashes like road markings*: since then the lanes are 4.6 m apart with finer ones
   between, blended from four wave vectors so they part and join through bends, broken into
   dashes by a carried texture at a 21 m repeat, with standing waves across them in fast
   water, and the speed (so the white) falls to 0.3 of mid stream at the banks. Still to
   do: vary the lanes' width and strength along the stream (a slow second stripe set along
   the flow multiplying the first), and fewer lanes near the banks (multiply `crest` by the
   speed's share of mid stream). The pictures asked for (reference shape, everything
   drawn, from the bank at eye height and from 300 m) were **not taken**.

**Views and their commands** (one browser at a time; from a frozen build):
- the ground alone, six minutes a view, also the cost: `node scripts/ground-cost.mjs --only
  river,fall --dist --distdir <build> --save <dir> --frames 3` (cost before/after: the
  same on a build of `a31dcc6`, with nothing else running: a busy machine added 40 %);
- full pictures: `node scripts/shots.mjs --dist --distdir <build> --world haven --shot ledge
  --size 660x309 --dsf 1 --out docs/shots/water --timeout 1500 --suffix <name> --query "..."`:
  - the river (71 m3/s) from 300 m, 1 km, 3 km: `lat=-51.95908&lon=48.94203&heading=38`
    with `&alt=750&pitch=-35`, `&alt=1450&pitch=-50`, `&alt=3450&pitch=-60`; low over it
    (half an hour, never settles: wooded): `&alt=484&pitch=-22`;
  - the opening place's lake from 1 km and 3 km: `alt=2513&pitch=-60`,
    `alt=4513&pitch=-20&debug=noclouds`;
  - a fall in open country: `lat=15.84355&lon=131.71670&alt=137&heading=315&pitch=-8`
    (160 m), `lat=15.75603&lon=131.80769&alt=230&heading=315&pitch=-7&fov=30` (700 m);
    find others with `scripts/find-fall.mjs`;
  - the sea's shore: `lat=18.501&lon=133.348&alt=41&heading=90&pitch=-8` (25 m up),
    `lat=18.501&lon=133.30&alt=420&heading=90&pitch=-32` (from the air);
  - wet ground: the cornflower meadow at the hour the model has it wet (0.37):
    `lat=-54.39501&lon=38.28479&t=24&heading=45&pitch=-18`; the river view is wet at
    `t=34`, the opening place at `t=41` (night).

**What I would do next.**
- Piece 1: the pictures the main session asked for; `npm run foot` in a river.
- Piece 2: the fall views again on the head; then judge the count of falls (60 m ledges
  give some 70 round the opening place) and whether the far sheet should begin nearer
  than 70 m.
- Piece 3: the air set on the head, old beside new; then the lake's rim (a bright
  green-yellow hem one or two pixels wide) and the opening place's lake from 1 km.
- Piece 4: the two shore views, old beside new, at a low and a high tide (`t=`); check the
  swimmer in the surf; the surf's foam far off is the breaking zone's white, untried.
- Piece 5: the wet meadow; puddles may need their threshold tuned by eye.
- For the phone: the ground's cost after piece 1 was +9 % at a view a fifth of which is
  river (software count), before the lanes became sines (then +1 % with lanes only, +9 %
  with standing waves); puddles add one texture read on wet level ground only; the surf
  none. No new texture anywhere: the ground's fragment shader reads what it read.

**Behaviour changes to list when this goes out** (beyond the water's own look): trees
stand 4 to 8 m back from river edges (every world with rivers); Haven's ground within
12 m of the sea's level is flattened into a beach; Haven's rivers wind up to 28 m off
their old lines and have falls; the ring's box is 24 pixels in, not 20; lakes and rivers
have a tighter glint and take more of the sky from the air; the walker is carried by a
river.

**Shared files touched:** `src/terrain/terrainMaterial.js` (blocks marked "living
water"), `src/terrain/chunkBuilder.js`, `src/terrain/terrain.js`, `src/terrain/height/*`,
`src/terrain/tiles/*`, `src/perf/governor.js` (step `water`), `scripts/sky-system-test.mjs`
(the ladder's pin), `src/app.js`, `src/controls/cameraRig.js`, `src/life/treeBlock.js`,
`src/worlds/haven.js` (`beach`, `wind`), `scripts/ground-cost.mjs`. New scripts are not in
`CLAUDE.md`'s list yet (`haven-rivers`, `river-ribbon-test`, `water-rules-test`,
`find-fall`): their usage is at the top of this file.
