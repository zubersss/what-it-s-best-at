# Brief: boulders and outcrops as far as they can be seen

*Written 2026-11-23 by the session that owns the branch `ccr-aa39490a-qiw63x`, for a
helper session. Read `CLAUDE.md` first (the charter, the rules, the hard-won lessons), then
`docs/ARCHITECTURE.md` ("A made world", and what it says of rocks), then this.*

## What the owner asked

After flying the new small world (Haven): **"I need you to make it so I can see at least
a mile in the ground worth of stuff. I want the trees and the grass rendered in further
than I can see ... this is a big ask and I need it to work really well."** Two helpers
have the trees (`docs/briefs/far-forest.md`) and the grass (`docs/briefs/far-grass.md`).
Yours is the third kind of "stuff" in the owner's reference pictures: **big faceted rocks**.
In those pictures boulders lie over whole hillsides, a field of them in the foreground,
the same blocks smaller and smaller into the distance, outcrops standing out of slopes;
each a few flat faces, one lit warm, one in coloured shade. (The principles are taken,
never that game's artwork or places; the pictures are not in the repository.)

Stay out of `src/life/` (trees, grass) and of the grass and forest parts of the ground
shader.

## What is there today, and what is wrong with it

- `src/rocks/rocks.js`: 300 rocks within 110 m of the traveller (`surface.rocks` in the
  world file), 0.3 to 3.2 m, one instanced draw; each a lump cut by four to six fracture
  planes in the vertex shader (`rockShape`), with contact darkening at its foot and a
  place in the near shadow map. They shrink to nothing at the edge of their radius.
- Wrong: beyond 110 m there is not one stone on the whole world, and nothing is larger
  than a person. From the air a mountain side is paint.

## What to build (change the design where the pictures say so, and say why)

1. **A rule for where rock lies**, of the land itself (so the same boulders are there
   whenever anyone comes back): fields of blocks on and under steep ground (talus under
   cliffs, blocks on ridges and brows), scattered erratics on open ground, few in closed
   forest, none in water; in clusters with bare ground between, not an even sprinkle;
   sizes from a metre to the size of a house (a few of those: outcrops and tors), the
   large ones rare. Use the world's height function for slope and height (it runs in the
   terrain workers: see how `src/life/treeBlock.js` asks it, and how a worker job is added
   in `src/terrain/chunkWorker.js`) and the land-cover picture for forest and water.
2. **Drawn to a mile at least (1.6 km), more for the largest**: tiles of the land worked
   out once in a worker, each its own instanced mesh with buffers from a **fixed pool**,
   nothing per rock per frame on the CPU; smaller rocks only near, by a rank per rock
   against distance, growing in as the traveller comes nearer (never popping). The existing
   near rocks stay as they are, or become the near end of the same field if that is
   cleaner: your call, but nothing that is there today may be lost (their shadows, their
   contact darkening, the character standing among them).
3. **The look**: the same faceted block as the near rocks (`rockShape`: reuse it, do not
   write a second one), lit through the shared lighting chunk with the painted look
   (`uPaint`, `paintLit`: a lit face and a shaded face in two clean tones), the world's
   rock colour with the land's colour under it, fading into the air with distance exactly
   as the ground does (`aerialPerspective`); sunk a little into the ground so none floats
   on a slope; a soft dark foot where it meets the ground if it costs nothing.
4. **Walking and landing**: a traveller on foot should not walk through a house-sized
   rock. If the height function can be given the largest ones cheaply (so the ground the
   traveller stands on rises over them), do it; if not, say so in the report and leave it.
5. **The governor** (`src/perf/governor.js`): a step that thins the far rocks, never
   removing the large ones (`?debug=floor` must still show a rocky hillside).
6. Screenshot mode must be able to finish (`busy`), and `window.__stats` should say how
   many are drawn.

## Rules that bite here (all from `CLAUDE.md`)

- The phone: Samsung Galaxy S23 Ultra, 60 fps. Nothing is measured here; build so that the
  cost is in fixed pools and steps the governor can take. Say in your report how many
  instances and triangles each view draws.
- A thing switched off is thrown out of the picture (`gl_Position = vec4(2.0, 2.0, 2.0, 1.0)`),
  not given no size.
- What is placed on the ground is placed again when the ground under it changes (a ring's
  water arriving can change it: see `Terrain.ringSerial`).
- GLSL ES 3 reserved words (`patch`, `sample`, `filter`, `half`, ...) are not variable names.
- A backtick in a GLSL comment breaks the build; build with `./scripts/build-check.sh`.
- One headless browser at a time on a machine. Ground-level pictures take ten to thirty
  minutes each here: take views from the air first, keep ground views few, `--timeout 1800`.
- Every test must be able to fail.

## Pictures to deliver (commit them under `docs/shots/far-rocks/`)

Take each **before** (the branch as you found it) and **after**, 660x309 at `--dsf 1`,
with `node scripts/shots.mjs --dist --distdir <a frozen copy of the build> --world haven
--shot ledge --query "..." --suffix _x --timeout 1800`:

- the opening view (`--shot ledge`) and `--shot wall`
- a steep rocky place: find one with the height function (slopes over 0.6 within a few
  hundred metres, above the tree line or in dry country; `scripts/find-overlook.mjs` shows
  how to search), from the ground looking along the slope and from 100 and 400 m up
- open steppe at lat -54.4271 lon 39.2697 (`t=5`, heading 120): from the ground and 30 m up
- one telephoto (`fov=14`) of a hillside 1 to 2 km off, and one view with `debug=floor`
- the stability test with a new move of your own walking toward a boulder field (see the
  `MOVES` in `scripts/stability.mjs`): nothing may pop

## What to hand back

- Commits on your branch (push often). Do not open a pull request and do not merge.
- `docs/briefs/far-rocks-report.md`: what you built and where, the numbers, what you tried
  and took back, known problems.
- A message to the owning session (`session_01XG1DZ692FjkSqnhW4EMsP8`, with
  `send_message`) when a first working version with pictures is pushed, and when you are
  done. Keep messages short: branch, commit, what to look at.
