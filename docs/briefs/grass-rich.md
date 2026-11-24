# Brief: denser grass for less, flowers of many kinds and sizes, pollen in the air

Read `CLAUDE.md` first (all of it), then `docs/PROGRESS.md` from the top to the end of
"In hand", then `docs/briefs/far-grass-report.md` and `far-grass-review.md` (how the grass
is built today and what a cold review found in it), and "Grass and flowers" in
`docs/ARCHITECTURE.md`.

## What the owner said (2026-11-24, after flying build 6ac24ff)

"... the grass should be a lot denser in the areas that have it, and the flowers should be
more diverse and abundant in certain areas and biomes, different flowers of different
sizes that release pollen into the air that makes it beautiful ..."

## What is there today

- `src/life/grass.js`, `grassRules.js`: blades on three lattices near the eye (to 12 m,
  to 34 m, flowers to 20 m), clump cards on three coarser lattices to 545 m, and the
  ground's own grass colour beyond and under them (in the ground's shader). Seven kinds
  of flower, one size each, in drifts some metres across; `FLORA` by land-cover class.
- At eye height the nearest ground still shows between the tufts, and from 30 m on the
  field is cards.

## What the phone says the grass costs (Galaxy S23 Ultra, benchmark of 2026-11-24)

At the opening view, of a frame of 64 ms measured (the measuring itself about 20):
**the grass 11.7 ms. Halving the clumps (`grass-mid`) saves 5.0; thinning the blades
(`grass`) saves nothing.** So the blades are cheap and the cut-out cards are dear: layers
of cut-out pixels over each other toward the horizon. The phone runs Haven at 31 fps
where 60 is the aim.

So: **a lot denser, and cheaper than today.** Triangles are cheap on this phone; layers
of cut-out pixels are not. Spend on blades (real, opaque, thin triangles: many more of
them, nearer together, farther out), and make the middle field out of far fewer layers:
smaller cut-out area per card, cards only where the ground is seen at a grazing angle
(they are already dropped when looked at squarely), drawn front to back, or opaque
geometry instead of cut-outs. Count it: for the opening view and the steppe at eye height
(`lat=-54.4271&lon=39.2697&t=5&heading=120`) report before and after **triangles handed
over and the mean number of cut-out layers per pixel of grass** (the trees' helper is
building `scripts/overdraw.mjs`; if it is not there when you need it, draw the grass
alone with additive blending and no depth test and read the picture back). The target:
no more layers than half of today's, with a field that reads as a lot denser from the eye
to the horizon.

## What to build

1. **Density**: where grass grows, no ground between the tufts from eye height out to
   where the eye can tell (some 40 to 60 m), and a field that stays full to the horizon.
   The amount still follows the land (`AMOUNT`, the one slope rule `GRASS_GROUND.slope`,
   canopy), and thin places stay thin: "denser in the areas that have it".
2. **Flowers**: many more kinds (aim for twenty or more), of **different sizes and
   habits**: tiny ones in the turf, daisies and buttercups, tall spikes (lupin, foxglove,
   fireweed), umbels (cow parsley), big single heads (poppies, sunflower-like), low
   cushions on high ground. Each land (and later each biome: the rule must take a
   world's own table, `life.flora` or the like, never a world's name) has its own mix,
   and **abundance varies by place on purpose**: flower meadows where one kind after
   another carpets a hectare, slopes of a single colour, hollows with tall spikes, plain
   grass between. The far ground's dusting and the clumps' heads must say the same as
   the blades (one rule, `grassRules.js`, JavaScript and GLSL bit for bit as now).
3. **Pollen and seed in the air**: over flower-rich ground, in sunlight, a drift of fine
   motes: golden pollen catching the light (brightest looking toward the Sun), the odd
   floating seed (dandelion clocks), denser over the richest meadows and after gusts,
   none in rain, none over bare ground. Points in a fixed pool round the traveller,
   wrapped by one end only (see the lesson on the rain's streaks), moved by the wind
   added up frame by frame, with a slice of their own near the eye (the lesson on the
   near plane), lit by the Sun and sky so that they show against the scene. A new small
   module (`src/life/pollen.js`); a governor step that thins it.
4. Everything by height as now: none of this is drawn from far above.

## Rules that bite

- **Do not edit `src/terrain/terrainMaterial.js`** (the owning session is rewriting the
  ground's shader for cost: it is the phone's largest cost). If the ground must wear
  something new (more kinds in the far dusting, another colour), put the rule in
  `grassRules.js` where the ground already reads it, or write down exactly what you need
  and tell the owning session.
- Nothing about the grass may hang on where the traveller stands or looks (anchor steps,
  the tone, the flora): read the review's findings 1, 2, 4.
- A blade or card switched off is thrown out of the picture (`gl_Position = vec4(2.0,
  2.0, 2.0, 1.0)`), never drawn with no size.
- Phones allow 16 textures a shader; tables go to the GPU between frames; fixed pools.
- No world-specific code. One headless browser at a time on your machine.
- A change to where or how thick the near blades stand is looked at in the eye-height
  opening view (`shot=ledge`, no query) before it is called done.

## What to hand back

- Early (within the first two hours): the opening view and the steppe at eye height,
  before and after, with the density alone; commit, push, message the owning session
  ("G-EARLY pushed <commit>").
- Then into `docs/shots/grass-rich/`, `_before` and `_after`: those two views; the steppe
  from 30 m and 120 m; a flower meadow from eye height and from 20 m (find or make one:
  say where); a view toward a low Sun with pollen in the air; the opening view with
  `debug=floor`; one view at the phone's density (`fov=21.4` at 660 x 309).
- The two numbers per view, before and after.
- A report beside this brief (`grass-rich-report.md`): what was built, what was tried and
  taken back, numbers, behaviour changes for the checkpoint message, known problems, most
  visible first.
- Branch: `ccr-aa39490a-grass-rich`. Merge `origin/ccr-aa39490a-qiw63x` into it before
  every push that you announce, and build (`./scripts/build-check.sh`). Messages to the
  owning session with `send_message` (its id is in your first message); short, with the
  commit. Never put a model's name in a commit; end commit messages with the two
  attribution lines your session's instructions give.
