# Report: boulders and outcrops as far as they can be seen

*Helper session, branch `ccr-aa39490a-far-rocks`, 2026-11-23. The brief: `docs/briefs/far-rocks.md`.
How it works is in `docs/ARCHITECTURE.md`, "Rocks as far as they can be seen".*

## What was built, and where

| file | what |
| --- | --- |
| `src/rocks/rockBlock.js` (new) | The rule: where rock lies, how large, how turned, from how far each is seen; the land's shadow on a tile's rocks; a rock's top for a walker. Plain arithmetic: workers and Node. |
| `src/rocks/farRocks.js` (new) | The tiles, the fixed pool, the two meshes a tile (one 20-triangle block, one shadow patch), the shaders, `riseAt`, `tally` (the exact count of a view). |
| `src/rocks/rocks.js` | Two exports only (`ROCK_SHAPE_GLSL`, `rockGeometry(detail)`): the far rocks use the near rocks' own shape. |
| `src/terrain/chunkWorker.js` | Two jobs, in one place: `rocks`, `rockvis`. |
| `src/app.js` | One import; made after the near rocks (four lines); `setWorld`; `ask()` before and `update()` after the ground's update; `busy` in the screenshot test and `farRocks` in `window.__stats`; `heightFn` and `groundAt` add the rock underfoot (`_rise`). |
| `src/perf/governor.js` | Two steps after `rocks`: `far-rock-shadows`, `far-rocks`. |
| `src/worlds/haven.js` | `surface.rocks.far` (colour, the clear ground at the start, two places for the check), and the near stones' largest size 1.4 m (see "Changes a player sees"). |
| `scripts/stability.mjs` | Two moves (marked slow): `haven_rocks_walk`, `haven_rocks_flight`. |
| `scripts/rock-field.mjs` (new) | The rule from straight above without a browser; `--check` (`npm run rocks`); `--count` (the rocks a place draws, against the budget). |
| `scripts/far-rocks-probe.mjs`, `scripts/far-rocks-shots.sh` (new) | The real game's read-out while tiles arrive; the set of views. |

## The design, against the brief

1. **A rule of the land** (`rockiness`, `rockField`). Fields on and under steep ground
   (slope measured over 24 m), blocks on brows, groups of boulders on ordinary hillsides,
   erratics on open ground (the cluster noise's highest few per cent), few in forest, none
   in water, more above the tree line; clusters with bare ground between. Sizes 1.4 m to
   20 m in three levels, most at the small end of each, larger where the ground is
   rockiest; the largest stand taller than they are wide.
2. **Drawn to a mile and more.** A rock is seen from 420 m for every metre of its size
   (about two pixels tall on the phone there; the smallest level from 0.82 of that):
   1.4 m to 480 m, 4 m to 1.5 km, 8 m to 3.4 km, 20 m to 8.4 km. It grows in over the last
   fifth of that distance. **Under a closed canopy a rock is seen from 180 m only**, and
   from afar only those of 9 m and more that stand over the trees (the owning session's
   budget: a rock in a wood cannot be seen from outside it).
   Tiles as wide as their level's reach (1.3, 3.3 and 8.3 km on Haven), worked out once in
   a worker, 14 a level in a fixed pool; **one mesh a tile** (and one of shadow patches),
   its rocks in the order of how far each is seen from, so the tile hands the GPU only
   the first so-many; the vertex shader decides each rock by its own distance. Nothing per
   rock per frame on the CPU.
   The near rocks (`rocks.js`) stay as they are for stones under 1.4 m.
3. **The look.** `rockShape` reused (exported, not copied); the shared lighting chunk,
   `uPaint`/`paintLit`/`paintColour`, `aerialPerspective`; the land's own tint under each
   rock; sunk 0.12 of its size and up to 0.3 more on a slope, leaning half with the slope;
   a dark foot. Beyond the brief: **a shadow on the ground for every far rock** past the
   near shadow map (a soft patch away from the Sun), without which a block on a far
   hillside was a speck pasted on; and the land's own shadow on each rock (a ray a rock in
   the worker, asked again as the Sun moves).
4. **Walking and landing.** On the main thread, not in the height function (that would
   put lumps into the ground mesh and its shadows): the ground a traveller stands on
   rises over rocks of 3.4 m and more, by the block's own fracture planes. Smaller ones
   are walked through, as the near rocks always were.
5. **The governor.** `far-rock-shadows` (the patches go), then `far-rocks` (rocks under
   3.4 m from 0.62 of their distance; rocks of 8 m and more untouched).
6. **Screenshots** wait for `farRocks.busy`; `window.__stats.farRocks` counts the view
   rock by rock (`tally`: asked for by screenshots and scripts only).

## Numbers

NUMBERS

## Changes a player sees (other than the far rocks themselves)

- **Haven's near stones stop at 1.4 m** (they went to 3 m): from there up a rock is one of
  the far rocks, which stay where they are when one walks. A near stone and a far block
  of the same size side by side were two shapes of one thing.
- **One walks onto rocks of 3.4 m and more** (and lands on them); the camera lifts over one.
- No rock within 60 m of where the journey begins.
- `?debug=farrocksoff` draws none of them (for before/after pictures).

## Tried and taken back

- **Small tiles (333 m) with two meshes each** (an 80-triangle block near, 20 far): 40 to
  60 draw calls more in a view. Now one 20-triangle mesh a tile on tiles as wide as the
  reach.
- **Sizes 1 m to 15 m, many small**: at 1 km they were specks. Now fewer and larger.
- **A slope-scaled depth offset on the shadow patches**: at a low angle that is metres,
  and the patch was drawn over the rock itself.
- **One rock colour everywhere**: near black on golden grass, where the ground is three
  times the world's mean. Each rock takes half the tint of the land under it.
- **Talus under benches**: the bench layer left Haven with the merge; the rule now asks
  the slope alone.
- **More rocks among trees** (15:02): 18 000 instances on the wooded opening hillside and
  none to be made out. Taken back with the canopy rule above.
- **A count of the view by tiles** (`in view` in the first read-out): it counted every
  instance handed over, three to ten times what is drawn. `tally` counts rocks.

## Known problems

KNOWN
