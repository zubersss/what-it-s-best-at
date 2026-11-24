# Brief: grass with no end to it

*Written 2026-11-23 by the session that owns the branch `ccr-aa39490a-qiw63x`, for a
helper session. Read `CLAUDE.md` first (the charter, the rules, the hard-won lessons), then
`docs/ARCHITECTURE.md` ("Trees and leaves", "A made world"), then this.*

## What the owner asked

After flying the new small world (Haven): **"I need you to make it so I can see at least
a mile in the ground worth of stuff. I want the trees and the grass rendered in further
than I can see ... this is a big ask and I need it to work really well."**

Your part is the **grass and the flowers**. Another helper has the trees
(`docs/briefs/far-forest.md`): do not edit `src/life/trees.js`, `groves.js` or
`treeBlock.js`.

## What is there today, and what is wrong with it

- `src/life/grass.js`: blades in tufts on lattices that are fixed to the ground and wrap
  round the camera: thick grass in a box of 26 m, thinner in a box of 72 m (so **blades end
  36 m from the traveller**), flowers in a box of 43 m; all read one small table of the
  ground (64 x 64 places 1.25 m apart: 80 m).
- Beyond the blades the ground shader (`src/terrain/terrainMaterial.js`, search for
  `uGrassTone`) lays the grass's colour on the ground and fades it back into the map's own
  colour between 180 and 900 m.
- Wrong: standing in a meadow one sees where the grass stops, a stone's throw away; beyond
  is flat paint. Flowers stop at 21 m.

## What to build (change the design where the pictures say so, and say why)

A person cannot tell a blade from its neighbour beyond some tens of metres, nor a tuft
from the next beyond a few hundred; past that grass is a colour and a soft skyline. So:

1. **A middle field of grass clumps**, out to at least 300 m (more if it costs little):
   cards on a lattice of their own, fixed to the ground and wrapping round the camera like
   the lattices that are there, reading a second, coarser table of the ground (heights,
   how much grass, how dry, flowers). A clump is the shape of many blades, cut out (made by
   rule: no outside artwork; `src/life/treeAtlasGen.js` already draws a `tuft`, and the
   trees' atlas is a texture you may read in the grass's own material). Taller and wider
   with distance so the ground stays covered while their number falls.
2. **No line anywhere.** The blades thin out as the clumps come in; the clumps thin out as
   the ground's own grass colour takes over; at every join the mean colour and brightness
   must match at noon, with a low Sun, toward the Sun and away from it, and at dusk. Look
   for a ring round the traveller in every picture; there must be none.
3. **Flowers as far as their colour can be seen**: drifts of colour on the clumps and on
   the far ground (the drifts stay where they are: they are placed by the world's own
   coordinates already).
4. **The far ground**: where the land-cover picture says grass, the ground keeps a grass
   surface as far as it is drawn (colour that moves a little with the wind and the light,
   a soft edge against the sky where a meadow's brow is the skyline), not flat paint.
   **The ground's fragment shader is full: 16 of a phone's 16 textures. Do not add a
   sampler to it.**
5. **The governor** (`src/perf/governor.js`): a step that thins the middle field (a share of
   its instances), never removing the grass (`?debug=floor` must still be a meadow).
6. Screenshot mode must be able to finish (`busy`).

## Rules that bite here (all from `CLAUDE.md`)

- The phone: Samsung Galaxy S23 Ultra, 60 fps. Nothing is measured here; build so that the
  cost is in fixed pools and steps the governor can take. Say in your report how many
  instances and triangles each view draws.
- Nothing is kept or worked out per tuft on the CPU; tables wrap; only the rows that come
  in ahead are worked out, a few a frame.
- A thing switched off is thrown out of the picture (`gl_Position = vec4(2.0, 2.0, 2.0, 1.0)`),
  not given no size (blades of no height were specks on every water).
- Anything that moves with the wind is added up frame by frame, never speed times the clock.
- Every lit surface goes through the shared lighting chunk; the look is the painted look
  (`uPaint`, `paintLit`): few colours, shade that is coloured.
- The terrain's near plane is 0.15 of the height over the ground: what is drawn close to
  the eye in flight needs its own slice (see how the rain does it in `src/app.js`).
- GLSL ES 3 reserved words (`patch`, `sample`, `filter`, `half`, ...) are not variable names.
- A backtick in a GLSL comment breaks the build; build with `./scripts/build-check.sh`.
- One headless browser at a time on a machine. Ground-level pictures take ten to thirty
  minutes each here: keep them few, give them `--timeout 1800`.

## Pictures to deliver (commit them under `docs/shots/far-grass/`)

Take each **before** (the branch as you found it) and **after**, 660x309 at `--dsf 1`
unless said otherwise, with `node scripts/shots.mjs --dist --distdir <a frozen copy of the
build> --world haven --shot ledge --query "..." --suffix _x --timeout 1800`:

- the opening view (`--shot ledge`), `--shot sun` (toward a low Sun) and `--shot dusk`
- the same place at midday (`t=5`), looking along the ground (`pitch=0`) and down a slope
- from 15 m, 60 m and 250 m above the opening meadow (`alt=1490`, `1535`, `1725`), with
  `pitch=-12`: the rings, if there are any, show from here
- a phone's pixel density at the joins: the same ground views with `fov=21.4`
- one view with `debug=floor`
- the stability test with a new move of your own that walks forward through the meadow
  (see the `MOVES` in `scripts/stability.mjs`): nothing may pop or crawl

## What to hand back

- Commits on your branch (push often). Do not open a pull request and do not merge.
- `docs/briefs/far-grass-report.md`: what you built and where, the numbers (instances,
  triangles), what you tried and took back, known problems.
- A message to the owning session (`session_01XG1DZ692FjkSqnhW4EMsP8`, with
  `send_message`) when a first working version with pictures is pushed, and when you are
  done. Keep messages short: branch, commit, what to look at.
