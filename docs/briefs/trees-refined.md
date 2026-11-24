# Brief: the trees one stands among, at the references' level of detail; blossom and petals

Read `CLAUDE.md` first (all of it: the rules and the lessons bite here), then
`docs/PROGRESS.md` from the top to the end of "In hand", then "The trees' fifth pass" and
"The fourth painted delivery" there (what the owner's reference pictures show of trees;
the pictures themselves are not in the repository and must not be).

## What the owner said (2026-11-24, after flying build 6ac24ff)

"... trees with flower petals that bloom and ride the wind, and the trees should really be
refined: the trunks and the leaves still don't look anything like the references when it
comes to level of detail, specially the leaves and branches. Try as hard as you can."

This is the fifth time the trees are asked for "closer to the reference". The lesson in
`CLAUDE.md` applies: when a look is asked for again and again, the technique is short of
it, not the tuning. So before changing a number, say in your report what a tree is made
of today at 3 m, 10 m and 30 m from the eye on a phone 1 440 pixels tall (how many
pixels a leaf spray's texel covers, how many limbs and twigs are real geometry, what the
bark is), and what it would have to be made of to stand beside the references: **a
skeleton that can be seen (trunk with bark and a flare at the root, limbs, branches,
twigs, each tapering), foliage in separate bunches at the twigs' ends with sky between
them, every needle spray and every leaf drawn crisply, the crown shaded as one round
mass (dark toward the trunk and the under side, light toward the Sun, glowing where the
Sun is behind it).**

## What is there today

- `src/life/treeGeometry.js`: eight shapes, three variants each, at three qualities (close
  to 42 m, near to 115 m, far: three cards). `scripts/tree-preview.mjs` draws every shape
  at every quality without a browser in seconds: **judge trees there first**, then in the
  game.
- `public/data/tree_atlas.png` (2048 x 1024, made by `scripts/make-tree-atlas.mjs`):
  twelve sprays of 256 pixels and the whole-tree pictures the far cards show. A spray
  card two metres wide seen from five metres is some 500 pixels wide on the phone: its
  256 texels are blurred or blocky there. That, and limbs that are a few tubes, is most
  of "no level of detail".
- `src/life/trees.js` (the near trees: lists, shader, shadows), `src/life/leaves.js`
  (falling leaves: points near the traveller), `src/life/farForest.js` (the same trees
  beyond 240 m as cards: not yours to redesign, but its cards show your atlas's
  whole-tree pictures, so they must be made again when a shape changes).
- The flora of Haven: `life.flora` in `src/worlds/haven.js` (conifers mostly).

## What the phone says a forest costs (Galaxy S23 Ultra, benchmark of 2026-11-24)

In the forest view, of a frame of 72 ms measured (the measuring itself about 20):
**the near trees 21.2 ms, of which their leaves 11.5** (the `tree-leaves` saving) and
bringing the full shapes nearer 7.0 (`trees-far`); the far forest 10.7; the tree shadows
2.7 to 7.3. At the screen's full size the same view costs 104 ms: **a forest is pixels**,
layers of cut-out cards drawn over each other. The phone runs Haven at 31 fps where 60
is the aim.

So the budget is hard, and it is the heart of this job: **the new trees must cost less
in the forest view than today's and look far finer near the eye.** That means detail by
distance, steeply: the full skeleton and the finest foliage for the few trees within
about 15 to 25 m (a dozen at most, a few thousand triangles each is affordable: triangles
are cheap on this phone, layers of cut-out pixels are not); a middle form; then the
cards much nearer than 115 m. Prefer geometry to cut-out layers where a thing is big on
screen (a limb, a bough's outline), keep cut-outs small and few deep, draw near trees
front to back, and count: for the forest view (`scene.costViews` in the world file,
"in the forest") report before and after **triangles handed over, and the mean number of
cut-out layers per pixel** (build a small meter: the trees alone drawn with additive
blending and no depth test, read back; make it a script others can use, e.g.
`scripts/overdraw.mjs --part trees`).

## What to build

1. **The skeleton**: trunk with a flare at the root and bark one can see (a bark texture
   or a rule in the shader: furrows, plates, the birch's bands; no new sampler beyond the
   trees' own, phones allow 16), limbs, branches and twigs as tapering tubes down to the
   twig a spray sits on, by species (firs in tiers of boughs, pines with bare bent trunks
   and round heads, broadleaves forking).
2. **The foliage**: sprays drawn at a resolution that holds at 3 m on the phone (a larger
   atlas or a second one for the close quality; mip maps made off the GPU; crisp cut-out
   edges, no grey fringe), in bunches at the twigs with sky between, shaded as one mass
   as now. Needles as needles, leaves as leaves.
3. **Blossom**: a flowering tree for Haven's meadows and wood edges (and a rule generic
   enough for other worlds: a species has `blossom: { colour, from, to }` or the like in
   the flora table), in bloom at the opening date; **petals** that come off in gusts and
   ride the wind, some lying on the ground under the tree, built on `leaves.js` (points
   near the traveller; a fixed pool; added up frame by frame with the wind, see the
   lesson on wind).
4. The whole-tree pictures in the atlas made again from the new shapes
   (`make-tree-atlas.mjs`), so that the far forest's cards are the new trees; check
   `node scripts/far-trees-test.mjs` and one picture across the 240 m line.
5. The governor: `tree-leaves`, `trees-far`, `tree-shadows` must still thin, not remove;
   say what each does to the new trees.

## Rules that bite

- No world-specific code: species and blossom are data.
- Do not edit `src/terrain/terrainMaterial.js` (the owning session is rewriting it for
  cost): if the ground needs something for your trees (petals lying on it), write down
  what, in your report, and tell the owning session.
- `src/life/farForest.js`: only what your new atlas forces; another helper is working on
  it (branch `ccr-aa39490a-from-above`).
- One headless browser at a time on your machine; a wooded ground-level picture takes
  20 minutes there: use `tree-preview.mjs` for shapes, the game for light and the wood.
- Every shader within a phone's limits (`scripts/lib/glLimits.mjs` runs in every picture
  run: an "OVER" line fails the picture).

## What to hand back

- Early (within the first two hours): a sheet from `tree-preview.mjs` of one fir, one
  pine and one broadleaf, old beside new, close quality; commit, push, and message the
  owning session ("T-EARLY pushed <commit>"). Do not wait for it to be perfect.
- Then, as they land, into `docs/shots/trees-refined/` with `_before` and `_after`: a
  tree from 4 m at the phone's density (`fov=21.4` at 660 x 309, or 1540 x 721 through a
  30 degree lens), the same from 12 m, a wood from inside (the cost view), the opening
  view, the blossom tree with petals in the air, one view across the 240 m line.
- The two numbers of the forest view, before and after.
- A report beside this brief (`trees-refined-report.md`): what a tree is made of now,
  what was tried and taken back, the numbers, behaviour changes for the checkpoint
  message, known problems, most visible first.
- Branch: `ccr-aa39490a-trees-refined`. Merge `origin/ccr-aa39490a-qiw63x` into it before
  every push that you announce, and build (`./scripts/build-check.sh`). Messages to the
  owning session with `send_message` (its id is in your first message); short, with the
  commit. Never put a model's name in a commit; end commit messages with the two
  attribution lines your session's instructions give.
