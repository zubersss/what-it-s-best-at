# Brief, second round: Haven from high above, the ground's part and the review's findings

The first round (`from-above.md`; the look before any fix `from-above-look.md`; report
`from-above-report.md`) gave the far trees a form from above (a dome, a shadow, the
upright cards drawn out of sight) and the ground's canopy one green. Its session stopped
before it was done (the model it ran on reached its weekly limit), and **you take it over**.
Its branch, `ccr-aa39490a-from-above`, is already merged into the owning branch: begin from
`origin/ccr-aa39490a-qiw63x`, push to `ccr-aa39490a-from-above`.

Read `CLAUDE.md` first (all of it), then `docs/PROGRESS.md` from the top to the end of "In
hand", then `from-above.md`, `from-above-look.md`, `from-above-report.md` (above all "After
the trees" and "What the ground must do"), and in `haven-rich-review.md` (beside this file)
the sections **farforest-1 to farforest-8**.

The owner's words, which this whole job serves: "I need it perfect from a distance,
specially when I'm flying high above it."

## The jobs, in this order

1. **The review's findings on the far forest** (farforest-1 to 8: shadows drawn in the
   trees' own draw and writing depth; shadow strength that follows the ground under the
   traveller and pops at a rim; shadow quads handed over by a reach from `rig.agl`; the
   far canopy taking Haven's leaf colour on every world and Earth losing its map tint; the
   slope light's curve the wrong way round; the wood threshold; bounding spheres that do
   not cover the shadows; `inFlower` allocating and not refreshed when the day changes).
   Some were still being checked when this was written: the owning session will send the
   verdicts. Prove each against the code as it is before fixing it; where a number can
   show it, a check that fails first (Node, no browser: as `far-tree-form-test.mjs`).
   farforest-4 matters most: **no world's look may come from another world's flora**:
   the canopy's green must come from the world's own data, and Earth's opening view and
   Earth from 3 km must look as they did at 6ac24ff or better (a pair each).
2. **The three items left of the ground's far look**, in the order the first round set:
   (a) the canopy's domes varied in size and place, not a net (`from-above-look.md` 7: at
   the phone's density from 300 m the net of scales is the first thing one sees);
   (b) grain and a broken edge from 3 to 30 km, meeting the far trees where they end
   (the report's "Grain where the trees end": crown tops 6 to 8 crown widths across, a
   quarter of a closed wood's ground, each a dome; fading beyond);
   (c) the steppe from above (`from-above-look.md` 6).
   These are in `src/terrain/terrainMaterial.js`: **the blocks "THE GROUND FROM AFAR" 1
   to 3 and the helpers above `main` (`crowns`, `farCanopyColour`, `farCanopyGrain`,
   `farCrownShade`, `farCrownTilt`, `farGrassColour`) are yours.** The rest of that file
   is the owning session's this round (it is fixing the far flowers' thinning and the
   benchmark's `uPlain` test): keep your changes inside those blocks, and merge with care.
   The ground shader reads 16 textures, a phone's limit: none may be added. It was tiered
   for cost by the speed helper (`phone-speed-report.md`, job 1): keep the tiers, and say
   what your change costs with `scripts/ground-cost-run.sh` (before and after, the views
   from 300 m, 3 km and 30 km at least; a count of work, never a frame rate).
3. **The after set**: the first round's whole set of views again
   (`scripts/from-above-shots.sh`, `_after2`), with a pair at every view where something
   changed, the floor pictures (`debug=floor`) at 300 m and 3 km, and Earth from 3 km.
   Then a flight from the air if time allows (`scripts/stability.mjs`: a level flight at
   1 km, or a climb from 100 m to 3 km): what it shows and what it cannot.

## Rules that bite

- Nothing about a tree or the ground may hang on where the traveller stands or looks in a
  way that shows; forms blend by distance or angle, never switch.
- No world-specific code. **Do not edit** `trees.js`, `leaves.js`, `treeGeometry.js`,
  `treeAtlas*.js` (the trees helper's, on `ccr-aa39490a-trees-refined`), nor `grass.js`,
  `pollen.js`, `governor.js` (the owning session's). Grep before removing any export.
- One headless browser at a time on your machine. Every shader within a phone's limits
  (an "OVER" line fails a picture run). `node scripts/far-trees-test.mjs`,
  `far-tree-form-test.mjs`, `far-tree-shade-test.mjs`, `far-forest-clock.mjs` and
  `./scripts/build-check.sh` pass before every announced push.
- Pictures from the air first (three minutes each); a ground-level wooded picture costs
  twenty.

## What to hand back

- Each finding and each item as it lands, pushed and announced to the owning session in
  one line with the commit ("A2-4 pushed abc1234: the canopy's green from the world's own
  flora; Earth pair in docs/shots/from-above").
- When all is done, "A2-DONE pushed <commit>" and a section "Second round" at the top of
  `from-above-report.md`: what was found and done, numbers (draw calls, triangles and the
  ground's cost count at each height), behaviour changes for the checkpoint message,
  known problems most visible first.
- Merge `origin/ccr-aa39490a-qiw63x` into your branch before every announced push, and
  build. Never put a model's name in a commit; end commit messages with the two
  attribution lines your session's instructions give.
