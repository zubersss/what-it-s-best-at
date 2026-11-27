# The ground's shading on the phone (2026-11-27)

For the helper that built the seasons (you know the ground's shader, `scripts/ground-cost-run.sh`
and the rules of this repository). Branch: go on on `ccr-6f4f9272-seasons`, from
`origin/ccr-6f4f9272-64jkgl` merged in. Report: `docs/briefs/ground-cost-report.md`.

## Why

The owner's thirteenth results (`docs/benchmarks/2026-11-27-haven-daa009f-fixed-size-paced.txt`;
read in `docs/PROGRESS.md`, "The thirteenth results"): Haven with everything on is at the edge
of 30 frames a second (26.4; at four stops 3 to 31 % of frames take three refreshes). Three
things cost: the sky (the sky helper has it), the forest (the speed helper has it), and
**the ground's shading: 14.4 ms of a measured 73 at the opening view (15.2 · 13.6), 17.0 of 67
from the air (12.8 · 21.1), 2.1 in the forest where trees hide it.** Its four savings
(`detail`, `far-relief`, `water`, `snow-edge`) buy 0.0 at the opening view and 7.2 from the
air. (Those milliseconds are "from the frame's start until drawn" with a read-back: about
twice a real frame's. Take them as shares.) Nobody is on it. It is yours.

## What has been done before (do not redo)

`docs/briefs/phone-speed-report.md`, "S-EARLY" and "S1a": the shader in tiers (a far gentle
pixel read 24 textures and ran an eight-raster loop, now 10 to 11 and no loop; near grass 30
to 34, now 11 to 15), gusts and near cloud shade at the vertices. `src/terrain/terrainMaterial.js`
is at 15 of a phone's 16 textures.

## The goal

**A third or more off the ground's shading at the opening view and from the air, everything
on, with pictures that cannot be told from today's at the phone's size.** Then: savings that
buy most of the rest for a phone that still needs them (each a governor step that thins and
never removes; `src/perf/governor.js`, the ladder pinned in `scripts/sky-system-test.mjs`).

## Where to look (my guesses; count before believing any)

1. **What a pixel reads, by tier and by how much of the screen each tier is** at the opening
   view, from 300 m, from 3 km (`ground-cost-run.sh` has ten views; add what is missing).
   A table: tier, share of the ground's pixels, texture reads, loops. The cut is where
   share times reads is largest, not where the shader is longest.
2. **The air on the ground**: three froxel maps and three tables of the sky are six of the
   fifteen textures. On far ground the air changes slowly: at the vertices (the patches have
   429 000 triangles at the opening view), or once for a pixel from one combined look-up.
3. **Far ground baked**: a patch far off is built once and shaded every frame from the same
   maps. What does not change with the eye or the hour (colour from the land's map, the
   detail pattern's far mean, rock or grass, the season's tint, snow) could be written into
   the patch's own texture when it is built or when the day changes, leaving light, shade
   and air for the pixel. Mind the lesson on uploads (between frames, never inside a pass).
4. **Precision and branches**: what runs at `highp` that could be `mediump`; what is worked
   out and then weighted zero (the cost table once showed such a thing as the cost of the
   saving that happened to switch it off: `far-relief`).
5. **Hidden ground**: the ground is the largest thing on screen and much of it is under
   grass and trees. Is it drawn before or after them, and how much of it is shaded and then
   covered? (`node scripts/overdraw.mjs`; the forest view's 2.1 ms says trees hide it well,
   the opening view's grass reads -8.8: leaving the grass out cost more.)

## Rules that bite

- **Software WebGL is not a phone** (CLAUDE.md, the lessons on `uPlain`, on texture reads and
  on vertices): it does not skip what follows an early `return`, a texture read costs it far
  more against arithmetic than a GPU, and its vertices cost as much as its pixels. Your
  measure is a count (reads, loops, pixels by tier) and `ground-cost-run.sh --dsf 2.2`;
  nothing headless is a frame rate. The phone's next benchmark is the judge.
- Nothing may hang on where the traveller stands (a tier's edge must not show: blend).
- Any pattern phased by the detail texture has a whole number of cycles a 64 m tile.
- Every lit surface goes through `src/render/lightingGlsl.js`.
- The look does not change: for each cut a before/after pair with the difference x4 at
  `--size 880x412 --dsf 2.2` of the opening view, from 300 m, from 3 km, noon and the
  opening morning; under 1 % of pixels over 2 levels, or say what moved and why it is right.
- `terrainMaterial.js` is shared: the sky helper may change how the clouds' shade is read
  (`tCloudShade`); say in your line when you touch that part. Merge
  `origin/ccr-6f4f9272-64jkgl` before each push; `./scripts/all-node-checks.sh` before each.
- One headless browser at a time; long runs detached, from a frozen build.

## What to hand back

First, within the hour: the table of point 1, pushed, and one line to
`session_01R5BrhzGbvM5Mm4BP5vZBtE` saying where the weight is and what you will cut first.
Then after each cut: the commit, the count before and after, the picture pair's name, one
line. At the end `GROUND-COST-DONE`, with what a phone that turns the ground's savings on gets.
