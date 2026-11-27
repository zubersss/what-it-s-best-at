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
- `node scripts/haven-rivers.mjs --check [--unjoined] [--gates]`: the promises, at seven
  places (15 s): the water's level never rises along a stretch; the flow the height code
  answers runs down the stretch's line, within the speed's limits; every river of a
  coarser mosaic that crosses the box a finer one answers for is met there by a river of
  the finer one, on its line and at its level. Exits non-zero. Seen to fail: `--unjoined`
  (the rivers as they were before the join) fails with 25 of 27 crossings not met.
- `node scripts/find-fall.mjs --lat .. --lon .. [--pick 0] [--back 120] [--up 25]`: the
  largest waterfalls round a place and the picture query that looks at one.
- `scripts/ground-cost.mjs` has two views more: `river` and `fall` (the ground alone,
  six minutes a view; a full picture of a wooded valley takes half an hour here and
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
