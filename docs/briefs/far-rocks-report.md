# Report: boulders and outcrops as far as they can be seen

*Helper session, branch `ccr-aa39490a-far-rocks`, 2026-11-23. The brief: `docs/briefs/far-rocks.md`.
How it works is in `docs/ARCHITECTURE.md`, "Rocks as far as they can be seen".*

## What was built, and where

| file | what |
| --- | --- |
| `src/rocks/rockBlock.js` (new) | The rule: where rock lies, how large, how turned; the land's shadow on a tile's rocks; a rock's top for a walker. Plain arithmetic: workers and Node. |
| `src/rocks/farRocks.js` (new) | The tiles, the fixed pool, the three meshes a tile (80-triangle block, 20-triangle block, shadow patch), the shaders, `riseAt`. |
| `src/rocks/rocks.js` | Two exports only (`ROCK_SHAPE_GLSL`, `rockGeometry(detail)`): the far rocks use the near rocks' own shape. The near rocks are untouched. |
| `src/terrain/chunkWorker.js` | Two jobs, in one place: `rocks`, `rockvis`. |
| `src/app.js` | One import; made after the near rocks (three lines); `setWorld`; `ask()` before and `update()` after the ground's update; `busy` in the screenshot test and `farRocks` in `window.__stats`; `heightFn` and `groundAt` add the rock underfoot (`_rise`). |
| `src/perf/governor.js` | Two steps after `rocks`: `far-rock-shadows`, `far-rocks`. |
| `src/worlds/haven.js` | `surface.rocks.far: { clear: [[the start, 60 m]] }`: everything else is the default. |
| `scripts/stability.mjs` | Two moves (marked slow): `haven_rocks_walk`, `haven_rocks_flight`. |
| `scripts/rock-field.mjs` (new) | The rule from straight above without a browser, and `--check`. |
| `scripts/far-rocks-probe.mjs`, `scripts/far-rocks-shots.sh` (new) | The real game's read-out while tiles arrive, with the rocks counted one by one; the set of views. |

## The design, against the brief

1. **A rule of the land.** Fields on and under steep ground (slope measured over tens of
   metres, so a bench under a cliff is talus), blocks on brows, erratics on open ground
   (the cluster noise's highest few per cent), few in closed forest, none in water, more
   above the tree line; clusters with bare ground between; 1 m to 15 m, the large rare
   (three levels, each most often at its small end, larger where the ground is rockiest).
   The largest stand taller than they are wide (tors).
2. **Drawn to a mile and more.** `reach` 420 m per metre of size: 1 m to 340 m (small
   rocks have 0.82 of the reach), 4 m to 1.6 km, 15 m to 6.3 km. Tiles from a fixed pool
   of 168, worked out once in a worker, nothing per rock per frame on the CPU; rocks grow
   in over the last fifth of their reach. **The near rocks stay as they are** (their
   scatter, shadows, contact darkening): the far rocks are added to them, not put in
   their place. I did not make them one field: the near ones go down to 30 cm on a 7 m
   lattice round the camera, which is another thing than a persistent field.
3. **The look.** `rockShape` reused (exported, not copied); the shared lighting chunk,
   `uPaint`/`paintLit`/`paintColour`, `aerialPerspective`; sunk 0.12 of its size and up
   to 0.3 more on a slope, leaning half with the slope; a dark foot (as the near rocks).
   Added beyond the brief: **a shadow on the ground for every far rock** beyond the near
   shadow map (a soft patch away from the Sun), because without it a block on a far
   hillside was a speck pasted on.
4. **Walking and landing.** Done on the main thread, not in the height function (that
   would have put lumps into the ground mesh and its shadows at every level of detail):
   the ground a traveller stands on rises over rocks of 2.6 m and more, by the block's
   own fracture planes. One walks up and over them, lands on them, and the camera lifts
   to see over one. Rocks under 2.6 m are walked through, as the near rocks always were.
5. **The governor.** `far-rock-shadows` (the patches go), then `far-rocks` (rocks under
   2.6 m from 0.62 of their distance, the 80-triangle block from 0.6 of its; rocks of
   6.5 m and more untouched).
6. **Screenshots** wait for `farRocks.busy`; `window.__stats.farRocks` says how many are
   in the view, of how many all round, in how many tiles.

## Numbers

FILL
