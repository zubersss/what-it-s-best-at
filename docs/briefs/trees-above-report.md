# Report: trees from above (the speed helper, 2026-11-28)

Beside `trees-above.md`. Written as the work went; the state of each part is under its heading.
Pictures in `docs/shots/trees-above/`. Nothing here is a frame rate.

## What was wrong (the brief's sheet, and the game's own rules)

A tree more than 60 m from the eye is two crossed upright pictures and a flat rosette lying in
its crown. Looked down on, the pictures are on edge and the rosette is a plate: the sheet shows
it at 60 degrees, and in the game the rosette is already there from 17 degrees (growing from
55 % of its size to all of it by 46), with the upright pictures across it until they draw in
between 49 and 68. An eye 90 m over a wood sees nothing else out to 240 m, and beyond that the
far forest has the same three quads.

## What a tree is now, looked down on

**A fourth make of every tree shape, made from the tree's own middle-distance mesh** so that it
is the same tree (`life/treeGeometry.js`, `solidOf`; the sheet: `solids_sheet.png`,
`node scripts/tree-preview.mjs --solid`; `scripts/tree-solid-test.mjs` holds each to its tree:
top within 7 % of the tree's height, reach 0.55 to 1.2 of its foliage's, the lean within 8 %):

- **a fir, a spruce**: its tiers gathered into six, each a low cone with a ten-pointed jagged
  skirt, opaque, painted dark at the trunk and light at the tips whatever the Sun does
  (looked straight down on in flat light it is still tier over tier); 75 triangles;
- **a palm**: one star of nine drooping fronds; 30;
- **every broad crown, a pine, a bush, an aspen**: its bunches of foliage gathered into three
  or four **shallow domes at the bunches' own heights, each carrying the crown-top picture**
  (the trees' own picture of a rounded leafy mass with a lobed edge, cut out), one over
  another: a crown with depth, overlap and a leafy outline; 44 to 84 triangles. Being the
  picture, the domes turn colour, thin and flower with the tree as its other cards do;
- a three-sided stem along the tree's own trunk line.

**Two tries that were wrong, and what the pictures said** (kept here so they are not tried
again): (1) the crowns as bare faceted lumps, opaque, in the leaf's colour: from above they were
folded paper, poorer than the leafy rosettes they replaced (the brief's "a few facets" is right
for a fir, whose tiers are facets; a broad crown is a mass of leaves with a lobed edge);
(2) solids from 20 degrees: looked at from 30 degrees up a tree's pictures still show its
finely cut side, and solids beside them were the poorer picture.

**Where it is drawn** (`life/trees.js`, `life/farTreeForm.js`): every tree of the far list
(60 to 240 m) has its solid in a list that shares the far list's instances (no new buffers);
the solid grows out of each mass's own middle by **the sine of the angle from the eye's place
to the tree** (never the view's), and the upright pictures and the rosette draw in as it grows:
a broad crown between 25 and 40 degrees, a fir or a palm between 38 and 59 (their pictures show
a spire finely cut until one is nearly over them). Nothing is switched. A bare tree stays its
pictures (they are its boughs). The solids are handed over only while some tree in reach is
looked down on (an eye on level ground hands none over).

**The far forest too** (`life/farForest.js`, 240 m to 1.5 km: all one sees from 300 m up and
more): one crown a tree, 18 triangles, shaped in the vertex shader from the tree's own measures
(a fir a cone with a jagged skirt, a broad crown a cap over two rings), spread exactly as the
rosette is where the wood is thinned (so a thinned wood stays closed), by the same angles.
**Opaque**: the crown-top picture gives its foliage's tones and nothing is cut out of it, one
layer where the pictures were eight; whichever of pictures or solid a tree does not show is
thrown out at the vertex shader's first lines, and a tile wholly of solids hands no pictures
over. Its shadows on the ground stay.

**Shadows**: a solid casts none; the far list's pictures cast as before (a shadow is the tree
seen from the Sun, not from the eye). `npm run treeshadows` and `tree-shadow-test` pass
unchanged: the shadow pass's vertex code is as it was.

**The governor**: `trees-far` shortens the distance to which trees are their full meshes; the
trees it hands to the far list are solids from above like the rest. It makes no plates now and
is left as it is, a saving for the view from the ground.

**Switches**: `debug=treesolidoff` (pictures and plates as before); the cost test's row "trees
looked down on as cut-out pictures instead of solid crowns (what it adds)".

