# Trees from above (2026-11-28): the owner's first priority

For the speed helper (you know `trees.js`, `farForest.js`, the overdraw count and the shared
corners). Branch: go on on `ccr-6f4f9272-speed`, from `origin/ccr-6f4f9272-64jkgl` merged in.
Report: `docs/briefs/trees-above-report.md`.

## The owner's words, with a screenshot of build f9385d7

"The mist and the trees from above still look bad ... **really refine the trees though before
working on other things** ... I want the game to look beautiful when you're flying high
above." The screenshot (`docs/shots/owner/2026-11-28-trees-mist-f9385d7.jpg`; the sheet named below is saved as `docs/shots/owner/trees_three_makes_from_above.png`; my copy of the
view: `docs/shots/owner/repro_floor.png`, `repro_full.png`): hovering some 90 m over a wood on
the shore of the mist view's lake at dawn, looking down 28 degrees, **14 fps at 1.60 MP with
14 savings on**. This is the fourth time the owner says it of things seen from the air
("i dont like how it looks when im flying over something", "perfect from a distance,
specially when I'm flying high above it"). By CLAUDE.md's own lesson, asked that often it
is the technique that is wrong, not the tuning.

The view, for every picture you hand back (add `&debug=floor` for what the phone drew):
`?world=haven&lat=-58.68&lon=26.99&alt=580&heading=185&pitch=-28&t=0.75&hero=1&heropose=hover`

## What the picture is made of (seen in a sheet in two seconds)

`node scripts/tree-preview.mjs --above --only 0,1,2,7 --out <dir>`: every tree at its three
makes, looked down on from 60 degrees. Close (3 104 triangles) and near (466) are trees.
**Far (6 triangles) is two crossed upright pictures and a flat rosette: from above a flat
green plate with a ruler line across it where the pictures stand on edge.** And every tree
more than 60 m from the eye is drawn so (`life/treeLod.js`: CLOSE_M 20, NEAR_M 60; the
governor's `trees-far` step shortens both): an eye 90 m over a wood sees nothing but plates,
out to 240 m, where the far forest takes over with the same three quads (blended by the
angle one looks down at, `life/farTreeForm.js`: better, and small on the screen by then).
"A card on edge is nothing" (CLAUDE.md) was learnt for the far forest and never applied to
the ring from 60 to 240 m, where a tree is 100 to 400 pixels tall on the phone.

And it is paid for dearly: three cut-out layers a tree in that ring, the far forest's 8 where
it stands, the mist's sheet over it: 14 fps with everything given up.

## The change: a tree looked down on is a solid thing

The look asked for is "trees ... as bold shapes known by their outline", "faceted", "cut-out"
from the side. From above the same look is **solid crowns in a few facets**: a fir a stack of
tiers, each a low cone with a jagged skirt; a pine fewer, flatter tiers on a bare stem; a
broadleaf or a blossom tree a cluster of three to five lumps; an aspen two or three small
lumps up a pale stem. Opaque (no cut-out test, one layer), lit as one mass by the crown's own
rule (the normal from the crown's middle, as the cards are lit: `treeGeometry.js`, `aCrown`),
top faces in the Sun's colour and the under-skirts in the coloured shade, the species' leaf
colour, the season's (bare trees: stem and boughs only; in flower: the lumps in the petal's
colour), the wind's sway as a whole.

1. **A fourth make, `solid`, per shape and variant** in `life/treeGeometry.js`: 40 to 90
   triangles, corners shared. Judge it alone first, in the sheet (`tree-preview --above`,
   and from the side: it must be the same tree as its picture, the same height, width and
   lean, or a tree will change shape as the eye rises). Look at all nine shapes.
2. **Where it is drawn**: for every tree of the far list (beyond the near radius, out to the
   240 m where the far forest begins), **by the angle the tree is looked down at**: from the
   side the crossed pictures as today; from above the solid; between (say 20 to 40 degrees)
   both, the pictures drawing in to nothing as `farTreeForm.js` has them do, the solid
   growing out of the crown's middle: blended, nothing switched, and nothing hanging on where
   the traveller looks (the angle is from the eye's PLACE to the tree, not the view's).
   The rosette goes where the solid is. When no tree in reach is looked down on (an eye on
   the ground on level land), the solid list is not drawn at all.
3. **The far forest from above** (240 m to 5.6 km): look at it from the same view and from
   300 m and 1 km up, with `debug=floor` too. Where the governor thins it, the wood must stay
   closed (the rosettes spread: `farTreeForm.js` promises it; the screenshot shows orange
   ground between the trees of a closed wood). If a solid of 8 to 12 triangles (a tier or a
   lump, no skirt) reads better than the rosette out to a kilometre, say so with a pair and
   make it; beyond that the rosette is under a few pixels.
4. **The governor**: `trees-far` must not turn a wood seen from above into plates. With the
   solid being cheaper than the pictures it replaces, the step may have nothing left to give
   from above: then say so and leave it for the view from the ground.
5. **Cost, by count** (`node scripts/overdraw.mjs --part trees,farForest --query ...` at the
   view above, before and after; triangles and vertex-shader runs by `gl-count`): the layers
   of cut-out pixels over the wood must fall, not rise. A "what it adds" row in the cost test
   (the old far make from above) so the phone says what it bought.

## Rules that bite

- Look at the thing alone before the scene (the sheet), then the scene from the owner's view,
  then in motion: a move in `scripts/stability.mjs` sinking from 200 m to the treetops over
  that wood and one flying level 90 m over it (three frames a step apart): nothing may pop
  where pictures give way to solids or where the near mesh takes over at 60 m.
- The same thing drawn three ways takes its season from one answer (`life/season.js`).
- The trees' shadows (near shadow tiles, `npm run treeshadows`): a solid casts as its
  pictures did, or better; say which.
- Phones: 16 textures a shader, shaders made while loading (`App.precompile`: the new
  material must be in it; `scripts/shader-first-use.mjs` lists nothing after the third frame).
- One headless browser at a time; a ground-level wood picture is 20 minutes: use the sheet
  and the air views first. `./scripts/all-node-checks.sh` before each push; merge
  `origin/ccr-6f4f9272-64jkgl` before each.
- The mist in that screenshot is the sky helper's (`docs/briefs/mist-close.md`), the dark
  far plains the ground helper's (`docs/briefs/plains-far.md`): not yours.

## What to hand back

Within the hour: the sheet of the nine solids from above and from the side beside their
pictures (`docs/shots/trees-above/solids_sheet.png`), pushed, one line to
`session_01R5BrhzGbvM5Mm4BP5vZBtE`. Then the owner's view before and after, full and floor;
the counts; the motion strips; `TREES-ABOVE-DONE`. I send each picture on to the owner, so
make them at `--size 880x412 --dsf 1.25`.
