# The plains and the far grass from the air (2026-11-28)

For the ground helper (the seasons session). Branch: `ccr-6f4f9272-seasons`, from
`origin/ccr-6f4f9272-64jkgl` merged in. Report: `docs/briefs/plains-far-report.md`.

## The owner's words (build f9385d7, with a screenshot from 90 m over a wood at dawn)

"The mist and the trees from above still look bad and **the plains and the grass things are
dark far away** ... the sky feeling aspect of the game: **I want the game to look beautiful
when you're flying high above**." (`docs/shots/owner/2026-11-28-trees-mist-f9385d7.jpg`; the
trees are the speed helper's job, `docs/briefs/trees-above.md`; the mist the sky helper's,
`docs/briefs/mist-close.md`.) The owner plays in Sharp and the phone had 14 savings on: what
the owner sees is close to `debug=floor`.

## First find it (I have not: this is the job's first hour)

"The plains ... dark far away" and "the grass things ... dark far away" are two things, and
I can name neither with certainty from one screenshot:
- *the plains*: from a few hundred metres to a few kilometres up the low country reads as a
  dark olive floor (my picture from 6 km over the opening place toward 235 degrees:
  `docs/shots/joined/from_6km_treeline.png`): the woods' tint (the land rule's forest colour
  is 36, 64, 30), the canopy the ground raises under far trees, the far ground's own tones,
  the air not yet lifting them;
- *the grass things*: the far grass (the clump cards on the coarser lattices out to 545 m,
  `life/grass.js`, and the meadow's tone beyond them) seen from the air: darker than the
  ground they stand on? in shade tone? thinned by `grass-mid` to dark dots on a pale ground?

So: pictures first, from the air over open country and over the plain, at dawn (t=0.75),
mid-morning (the opening hour) and noon (t=4), each as the game is and with `debug=floor`:
from 90 m, 300 m, 1 km, 3 km and 6 km, looking 15 and 35 degrees down, toward the Sun and
away from it. Then `node scripts/parts-out.mjs` (or the grass and far-ground switches) to
say WHICH part draws each dark thing. Push the sheet (`docs/shots/plains-far/before_*.jpg`)
with one line naming the three darkest things by part, before changing anything.

## What is wanted

The look's own words: few colours, each time of day a pair (the light's and the shade's);
shade that is coloured, never black; **the far ground lost in the air layer by layer**;
bold shapes. From the air that means:
- the land gets LIGHTER and bluer with distance, never darker; a plain three kilometres off
  is paler than the meadow under the traveller;
- a wood from above is a rich mid green with its own light and shade (crowns in the Sun,
  coloured shade between), not a black-green floor; a meadow is gold and green, bright;
- the far grass never reads darker than its ground: where blades are too small to be blades
  they are the ground's own tone and light (and their shade a tint of it);
- the same from the governor's floor: a saving thins, it does not darken.
`src/worlds/haven.js` has the look's numbers for the air (`look.aloft`: clear, sky, lift) and
the land rule's colours (`terrain.tiles.made.land.colours` over `LAND_DEFAULTS` in
`tiles/madeLand.js`); the ground's far tones are in `terrainMaterial.js` (your blocks), the
far grass's in `life/grass.js` and `grassRules.js`, the far forest's green in
`farTreeForm.js` (`farGreen`).

## Rules that bite

- The opening view from the ground must not get worse (pair it, before and after, full and
  floor); every look change is looked at from 900 m and 2 km, toward the Sun and away, over
  flat country (CLAUDE.md).
- If the land rule's colours change, `node scripts/make-world-maps.mjs` makes the colour map
  again and prints the mean for the world file (the land itself must come out the same:
  `git status` shows only `haven_day_*.jpg`).
- A change of tone must not undo your own cost cuts (count the reads again at the three views).
- Seasons: the far woods' season you made rides on the same tint; check autumn from 3 km.
- `./scripts/all-node-checks.sh` before each push; merge `origin/ccr-6f4f9272-64jkgl` first.
  The speed helper is in `trees.js`/`farForest.js`/`treeGeometry.js` now, the sky helper in
  `lightingGlsl.js` (the mist's share of the air): say in your line which shared file you touch.

## What to hand back

The before sheet and its three named parts within the hour; then pairs (before, after) of
the five heights at the opening hour and at dawn, full and floor, at `--size 880x412 --dsf
1.25`; `PLAINS-FAR-DONE`. I send the pairs on to the owner.
