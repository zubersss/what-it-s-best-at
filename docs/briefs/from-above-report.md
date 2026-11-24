# Haven from high above: report (branch `ccr-aa39490a-from-above`)

2026-11-24/25. The brief: `from-above.md`. The look before any fix, picture by picture,
ranked: `from-above-look.md`. Pictures: `docs/shots/from-above/`,
`haven_ledge_<view>_before.png` and `_after.png` (a view's name:
`<place>_<metres over the ground>_p<degrees looked down>[_phone|_floor|_clear]`), taken with
`scripts/from-above-shots.sh <frozen build> <suffix> [view ...]`.

## Second round (2026-11-24/25, brief `from-above-2.md`)

Pictures: `docs/shots/from-above/haven_ledge_<view>_r2before.png` (build 41705a3, the owning
branch when this round began) beside `_after2.png` (this branch); `_r2a1.png`: the review's
fixes alone; `earth_ledge_earth_3000_after2.png`; the flight from the air in
`docs/shots/from-above/stability2/`.

### The review's findings on the far forest (farforest-1 to 8)

- **farforest-1 (held), fixed.** A tile's trees' shadows are a draw of their own (a second
  mesh on the same buffers: the fourth quad only), writing no depth, drawn after the ground
  and before every far tree (renderOrder 3). Shadows lying over one another now multiply
  as `shadowAlpha` means them to, and no shadow cuts the lower part off a tree standing in
  it. The trees' own material never blends now.
- **farforest-2 and 3 (held), fixed.** How much of a tile's shadows is drawn, and whether
  the tile is handed them at all, go by the eye's height over **the tile's lowest tree**
  (worked out once when the tile arrives), eased over 0.8 s; no longer by the height over
  the ground underfoot. A rim is not a switch, and a valley's trees seen steeply from a
  rim have their shadows. `tileShadow()` (farForest.js) is the rule;
  `far-tree-form-test.mjs` check 7 is the rim (the old rule: 3 % on the rim, 100 % a metre
  on, and the tile not handed its shadows; now 100 % on both, handed over).
- **farforest-4: refuted** by the owning session's check, and its decision is kept: the
  canopy's one leaf (ponderosa, Earth's opening place's tree too). A version taking each
  world's leaf and map tint from its data was written and taken out again.
- **farforest-5 (held), fixed.** The height over a far tile's middle plane is
  `(R + h) ol / l - ol`. `far-tree-shade-test.mjs` has a new check, level ground on a round
  world with a Sun 6 degrees up: off by 0.10 on the 7 km tiles before, 0.001 now.
- **farforest-6 (held), fixed**, both halves: wood on a far card is cut at 0.5, or 0.75 in a
  tree that flowers (a flag carried per tree in `iC.w`, + 256), and it is coloured as the
  near cards' twigs (`mix(trunk, grey trunk, 0.75) x 0.4`, was `trunk x 0.6`).
- **farforest-7 (held), fixed.** The shadows' mesh has its own bounds: the trees' plus their
  tallest tree x max(SHADOW_LONG, TOP_MAX x 0.3).
- **farforest-8 (held), fixed.** Leaf and bark colours packed once per species; a flowering
  species' crown in 64 steps of its tree's own number, worked out again when the day (or
  the hemisphere) changes, and then only the tiles that hold flowering trees are filled
  again.

### The ground's far look (my blocks of `terrainMaterial.js` only)

- **(a) Domes, not a net.** `crowns()`: rows bent by one long wave each way (a whole number
  across the tile, stretching a dome by at most a fifth: a first try at 0.4 of a cell, two to a
  tile, turned the domes to streaks), radii 0.30 to 0.66 of a cell, one cell in ten empty.
  The 2 x 2 search stays exact (centre at most 0.33 from its cell's middle, radius at most
  0.66). Pair: `ledge_300_p20_phone`.
- **(b) Grain and a broken edge from 3 to 30 km.** Where the 8 m crowns go under a pixel a
  third level of domes comes in: clumps 43 m across (1.5 to a tile), lighter toward the Sun,
  dark in their gaps, on whatever colour the wood has there (its own, or the map's beyond
  19 km), gone where a clump is under two pixels and beyond 40 km. Where the land-cover map
  thins the canopy out, the clumps' tops stay and their gaps go first: the wood's edge is
  broken along them. Pairs: `wood_3000_p60`, `ledge_3000_p60_clear`, `ledge_10000_p60_clear`.
- **(c) The steppe from above** (`farGrassColour`): beyond the blades (from 250 to 500 m
  from the eye) the grass ground has patches of bare soil 6 to 18 m across, more of them the
  drier, dark shrubs 2 to 5 m across in clusters, and a tussock grain a metre across. Each
  is read at a fixed level of the detail tile's smaller copies and gives way to its own mean
  where it would be under two pixels (the means measured on the tile: soil 0.21, shrubs
  0.10), so the land's tone does not change with height. Scales are sixteenths of a tile
  (patches agree). Two failures on the way, seen in pictures and fixed: one read for the soil
  was a stencilled wallpaper (now two reads 85 and 205 m apart), and the shrubs alone stood
  in a grid (now clustered by a second read). Pairs: `steppe_300_p60`, `steppe_1000_p60`.

### Numbers

Draw calls and triangles (the pictures' own read-out):

| view | calls before | after | triangles before | after |
| --- | --- | --- | --- | --- |
| ledge_300_p60 | 76 | 98 | 807 444 | 816 802 |
| ledge_300_p20_phone | 66 | 84 | 940 118 | 949 600 |
| wood_300_p20 | 65 | 87 | 971 682 | 979 590 |
| wood_1000_p60 | 67 | 86 | 642 728 | 647 478 |
| wood_3000_p60 | 46 | 53 | 416 484 | 416 484 |
| ledge_3000_p60_clear | 42 | 50 | 395 195 | 395 195 |
| ledge_10000_p60_clear | 18 | 18 | 231 171 | 231 171 |
| steppe_300_p60 | 66 | 70 | 311 194 | 317 928 |
| ledge_300_p60_floor | (43, round one) | 44 | (489 599) | 489 600 |
| ledge_3000_p60_floor | | 27 | | 338 347 |

The shadows' own draw is one call per tile that shows shadows (7 to 22 from the air, none
on the ground, none at the floor: the governor's `tree-shadows` step). A few more triangles
at low heights: tiles of trees below the ground underfoot are now handed their shadows.

The ground's shading, as a count of work on software WebGL (`scripts/ground-cost-run.sh`,
1100 x 515, the shader of 41705a3 beside this one in the same session; never a frame rate;
"before" is the owning branch at 41705a3, so the owning session's later changes outside my
blocks are in the "after" too):

| view | before (ms) | after (ms) | after / before |
| --- | --- | --- | --- |
| ledge (opening view) | 1690 | 1734 | 103 % |
| steppe, 40 m up | 1618 | 1657 | 102 % |
| air300 | 1197 | 1192 | 100 % |
| air3k | 704 | 762 | 108 % |
| air30k | 485 | 558 | 115 % |

The clumps are the cost from 3 km up (a fourth `crowns()` call where the 8 m crowns are
gone: at most two `crowns()` a pixel anywhere). No texture added (16 of 16 still).

Flight 1 km over the north wood, 4 m a frame (`stability.mjs --only haven_above_flight`):
changed 15.3, 12.0, 16.0 % of pixels, flicker 1.7, 1.1, 1.6 % (round one: 3.8, 1.8, 3.9 %).
What it cannot show: settled frames only (no tile arriving in flight), and a rim crossing
(farforest-2) is not among its moves; the rim is checked in Node only.

### Behaviour changes (for the checkpoint message)

- From the air, far trees' shadows over one another darken as they should, and come and go
  smoothly by height over the trees themselves (no pop at a rim; valley trees seen from a
  rim have shadows).
- Far trunks and limbs keep their tone and thickness across the 240 m line.
- A wood seen from 300 m: domes of varied size, no lattice. From 3 to 30 km: a grain of
  clumps and a broken edge where it was a smooth blot.
- The steppe from above: soil patches, shrubs, a grain, where it was one ochre.
- One draw call more per far tile with shadows, from the air.

### Known problems, most visible first

1. From 3 km over the opening place one is in cloud (the floor pictures there are of the
   cloud); the `_clear` views are the ones to judge.
2. The clumps cost 8 to 15 % more of the ground's shading from 3 km up (software count).
3. The steppe's grain is subtle at 1 km (the far grass fades to the map's colour from 600 m
   to 2.5 km, and the soil and shrubs go with it).
4. Shadows are still under the raised canopy inside woods, and laid level on slopes.
5. Nothing measured on the phone.

## In one paragraph

Looked down on, a far tree was two cards on edge: a wood from above was specks and
crosses on the canopy the ground raises. Now, by the angle a tree is looked down at, its
rosette is the crown's top (lit as a dome, spread where the trees are thinned, in a closed
wood only), it has a shadow on the ground beside it, its upright pictures and its trunk
draw out of sight from above, and the forest's end has no edge. Nothing changes for a
traveller on the ground. **What is left is the ground's**: the canopy it raises under and
beyond the trees is another forest in another colour, and from 3 km up it is all there is.

## After the trees: the ground's far canopy (2026-11-24, later)

The owning session handed over the far look of the ground (`terrainMaterial.js`, the pieces
above `main` and the block "THE GROUND FROM AFAR, 1"). First of its four items, **one
forest in one green**, done:

- **The cause of the gold scales was not the land's colour map and not the light: it was
  the season.** The canopy turned to autumn's and winter's colours over two thirds of its
  patches whenever `uLitter` was up, whatever grows there, and the opening place in its
  first morning is at the last day of its winter (`uLitter` 1): a wood of pines and firs,
  which keep their needles, was gold and rust under green trees. One patch in six turns
  now. (The canopy does not know its trees' kinds; a share of leaf-dropping trees by land
  cover class would be the right number, for Earth's hardwood forests above all, which
  now turn in too few patches.)
- **The canopy's colour is the far trees' own**: a leaf by their rule (`paintLeaf`,
  imported from life/trees.js; `farGreen`, from life/farTreeForm.js), none of the map's
  tint. The north wood's canopy was blue green under olive trees; it is their olive.
- **Softer domes**: the crowns' tilt under half and the canopy's grain half of what they
  were; a crown's light and dark is in its colour (the same green, lighter and darker).
- Cost in the ground's shader: nothing added (no read, no noise call; a few multiplications
  in place of a mix with the map's tint).
- Pairs: `haven_ledge_<view>_canopy_before.png` / `_canopy_after.png` for
  `ledge_300_p20_phone`, `ledge_1000_p60`, `wood_1000_p60` (before: this branch with the
  owning branch merged, the trees' side already in).
- Tried and taken out again: a greener share of a low Sun's light for far foliage (I took
  the rust for olive leaves under orange light before finding the season).
- Still to do, in the owning session's order: the domes varied in size and place (not a
  net), grain and a broken edge from 3 to 30 km, the steppe from above.

## The ranked list, and what was done

Numbers refer to `from-above-look.md`.

1. **Two forests in two colours** (trees and ground). *Half done, the trees' half.* A far
   tree's top is now lit by the Sun as the ground is (below), so in the morning's light the
   trees on the gold canopy are gold-green crowns, no longer dark dots
   (`ledge_1000_p60`, `ledge_300_p60`). **The ground's half is open**: the canopy still
   takes 60 % of its colour from the land's colour map. At midday over the north wood the
   canopy is a blue green (93, 142, 114) and the crown tops a warm olive
   (`wood_1000_p60_phone_after`): the crosses are gone, round tops stand in their place,
   and they are still another colour than what they stand on. See "What the ground must do".
2. **Specks, not a wood.** *Done, as far as trees can.* The rosette spreads where the
   trees are thinned: by keep^-0.42 where a wood is closed (keep^-0.25, at most 1.5, as
   from the side where it is not), at most 8 crown widths. Crowns of a closed wood cover,
   from straight above: 44 % of the ground at 450 m (as before), 36 % at 1 km (was 23 %),
   30 % at 2 km (was 6 %), 25 % at 4 km (was 2 %). Not more: at keep^-0.5 the cover would
   be kept whole, and every crown would be the same size on the screen at any distance, a
   forest with no depth. Whether a wood is closed comes with each tree: the chance its site
   had of carrying one (`treeBlock.js`, a tenth float; nine tenths of the trees of the
   opening place's woods and of the north wood have a chance over 0.7). A lone tree on
   open ground is never wider than 1.5.
3. **Crosses.** *Done.* The upright pictures draw in to nothing between 49 and 68 degrees
   of looking down. And **trunks**: on the upright pictures a trunk is drawn right through
   the crown, and a pale trunk in the Sun was a bright line across every aspen of a wood
   seen from above; a trunk looked down on is now in its crown's shade.
4. **No shadow beside a tree.** *Done for the far trees, where the ground shows.* A fourth
   quad, handed over only for a traveller in the air (from 60 m up), is the picture of the
   whole tree laid on the ground along the Sun's ray: its own outline, up to five heights
   long. It darkens what is under it (alpha blending, switched on only in the air). One
   tree's takes half the light; where several lie over one another at a wood's edge each
   is lighter, so the lot come to half. None from a tree in the land's or a cloud's shade,
   none on a slope the Sun does not reach, none beyond 4.2 km. **Where the ground raises
   its canopy the shadows are under it**, which is most of both woods: they show on open
   ground with scattered trees and at the edges of woods. On slopes they are wrong by the
   slope (laid level): a shadow on a hillside falling toward the Sun is partly in the hill.
5. **A wood from 3 km up is a smooth blot.** *The ground's.* The trees are there now as
   crown tops 6 crown widths across and a quarter of the ground (`ledge_3000_p60_clear`,
   `wood_3000_p60`), which gives the wood a grain down to about that height; a crown is
   then two or three pixels of this picture and five to eight of the phone's.
6. **The steppe from above.** *The ground's.* Untouched.
7. **The canopy's net of scales.** *The ground's.* Untouched; at a phone's density from
   300 m (`ledge_300_p20_phone`) it is the first thing one sees: orange domes with
   blue-violet gaps.
8. **Trees lit inside the land's shadow.** *Done in part, and found to be two things.*
   (a) The grid of the land's shadow over a far tile was 20 points a side whatever the
   tile's size: `scripts/far-tree-shade-test.mjs` compares it with a ray from every tree,
   at the opening place in its first morning: 13.3 % of the largest tiles' trees were on
   the wrong side of a shadow, 102 of 1 245 lit in the shade. Now 20, 28, 40, 57 points a
   side by the tile's size: 7.1 %, 24 lit in the shade (126 ms for the largest tile's grid
   in Node, 13 before; a tile is worked out again when the Sun has moved 1.5 degrees).
   (b) Most of what looks like "lit trees in the shade" is not a cast shadow: in the
   painted look a slope turned from the Sun is painted in the shade's colour, and the
   trees on it, standing up, do catch the Sun. That is the look's own question (should a
   tree take the tone of the ground it stands on?) and is left as it is: the near trees
   do the same.
9. **Where the far forest ends.** *Done on the trees' side.* Seen from above its trees
   draw in over the last two fifths of its reach (3.4 to 5.6 km; the last seventh, as
   before, seen from the side, where they stand on skylines). No ring in any picture.
   Beyond it the land must go on wooded: the ground's.
10. **Near trees from above are flat rosettes** (`ledge_100_p60`). *The trees helper's.*
    Told here: seen from above a near tree's far mesh has the same faults the far forest
    had (a fir's rosette lies under the middle height of its crown and faces the ground by
    the cards' shared rule, so it takes no sunlight; the trunk shows through the crown).
    The far forest's dome and trunk shade come in over the 200 m beyond the near trees'
    line so that nothing differs at the line.
11. **Pale rocks on dark ground.** *The rocks'.* Untouched.
12. **Cloud.** `debug=noclouds` (clear sky: the layer, the volume and their shadows).

## What the ground must do (for the owning session)

- **One green.** A far tree's leaf colour before the light: the species' leaf albedo
  (Haven's are all near 0.045, 0.085, 0.03) x 0.61, through `paintLeaf` (life/trees.js),
  x 1.12 where it faces the sky, x 0.76 for the cut-out's tone, then `farGreen(leaf,
  dist)` (exported from `life/farTreeForm.js`: over to a dark warm olive between 300 m and
  1.3 km), then `paintColour`. The canopy's base (0.040, 0.078, 0.028) is already a leaf;
  what makes it another forest is `mix(vec3(1.0), mapTint, 0.6)`, the domes' own light
  and dark (`crowns()`), and that it never goes through `paintLeaf` and `farGreen`.
  Suggested: under the far trees' reach the canopy is that green at about 0.55 of a crown
  top's brightness (it is the gaps between crowns, and the trees then read as crowns on
  it), with little or none of the map's tint; beyond the reach, the green itself.
- **Grain where the trees end.** From above, between 3.4 and 5.6 km the trees are crown
  tops about 6 to 8 crown widths across (40 to 55 m for an 18 m fir), covering a quarter
  of a closed wood's ground and less toward the end, each shaded as one dome (lighter
  toward the Sun, darker away), never bluer than the far olive. A canopy grain of that
  size and contrast at that distance, fading with distance beyond, meets them.
- **The steppe and the scales**: 6 and 7 above.
- **Shadows on the raised canopy**: the trees' shadows lie on the ground and are hidden
  wherever the canopy is raised. If the canopy were not raised inside the trees' reach
  when looked down on (the trees now cover a quarter to a half of it themselves), the
  shadows would show between the crowns, as the dark gaps a wood has from above. A
  suggestion only: it changes the view from the side.

## Numbers

Draw calls and triangles handed over, before and after (the same views; from 10 km up there is
no far forest and nothing changed; `_floor`: every saving on):

| view | draw calls before | after | triangles before | after | far trees standing | handed to the GPU |
| --- | --- | --- | --- | --- | --- | --- |
| ledge_1000_p20 | 61 | 61 | 617 174 | 676 046 | 15464 | 30246 |
| ledge_1000_p20_phone | 52 | 52 | 654 802 | 711 570 | 15464 | 30246 |
| ledge_1000_p60 | 62 | 62 | 552 588 | 611 498 | 15464 | 30246 |
| ledge_100_p20 | 141 | 141 | 1 225 580 | 1 313 356 | 27050 | 46220 |
| ledge_100_p60 | 143 | 143 | 1 115 002 | 1 204 664 | 27050 | 46220 |
| ledge_3000_p20_clear | 38 | 38 | 323 345 | 342 423 | 5222 | 15568 |
| ledge_3000_p60_clear-floor | 26 | 26 | 290 327 | 290 327 | 1229 | 7100 |
| ledge_3000_p60_clear-phone | 40 | 40 | 264 787 | 294 899 | 5222 | 15568 |
| ledge_3000_p60_clear | 42 | 42 | 364 063 | 395 195 | 5222 | 15568 |
| ledge_300_p20 | 72 | 72 | 829 702 | 911 574 | 24239 | 42703 |
| ledge_300_p20_phone | 64 | 64 | 874 330 | 949 474 | 24239 | 42703 |
| ledge_300_p60 | 74 | 74 | 733 962 | 816 818 | 24239 | 42703 |
| ledge_300_p60_floor | 43 | 43 | 489 599 | 489 599 | 9520 | 19388 |
| steppe_1000_p60 | 54 | 54 | 266 930 | 273 594 | 507 | 9418 |
| steppe_300_p60 | 64 | 64 | 311 172 | 317 978 | 604 | 9691 |
| wood_1000_p20 | 61 | 61 | 567 016 | 643 822 | 26354 | 42359 |
| wood_1000_p60 | 65 | 65 | 565 314 | 642 726 | 26354 | 42359 |
| wood_1000_p60_phone | 53 | 53 | 405 454 | 471 482 | 26354 | 42359 |
| wood_3000_p20_clear | 34 | 34 | 324 133 | 354 443 | 7919 | 15618 |
| wood_3000_p60 | 44 | 44 | 386 172 | 416 482 | 7919 | 15618 |
| wood_300_p20 | 63 | 63 | 838 712 | 974 182 | 51211 | 75091 |
| wood_300_p60 | 64 | 64 | 795 786 | 932 674 | 51211 | 75091 |

(These are of the build the pictures were taken from. A later change hands the shadows' quad
over only for tiles that can show a shadow: see below.)

- **On the ground nothing is added**: the shadow's quad is not handed over under 60 m,
  the blending is off, and the forms begin at 17 degrees of looking down (the first test
  of `far-tree-form-test.mjs`: every part is exactly as wide as before up to that angle).
- **Looked at from the side from the air nothing changes either**: the views at 20
  degrees down differ from their befores in 0.0 % (`wood_300_p20`) to 1.6 %
  (`ledge_100_p20`) of their pixels (by more than 6 % of full scale); the views at 60
  degrees in 3.3 to 4.5 %.
- **In the air** the far forest hands over 8 triangles a tree where it handed 6, the
  same trees in the same tiles (no more instances, **no more draw calls** at any view),
  and its fragments are blended (the shadows). In the pictures' build that is 82 000
  triangles more from 300 m over the opening place (830 to 912 thousand) and 136 000
  over the north wood (839 to 974 thousand), 59 000 from 1 km, 31 000 from 3 km. The
  governor's step `tree-shadows` takes the shadows, their quad and the blending away
  (the `_floor` rows: not a triangle more).
- **After the pictures**: the shadows' quad is handed over only by tiles that can show a
  shadow (nearer than 4.2 km, and near enough under the traveller to be looked down on at
  17 degrees, with room for falling ground): the picture is the same and the count lower
  at low heights. Checked: `wood_300_p60` and `ledge_300_p20` taken again from that
  build are the same pictures to the pixel, with 930 172 and 902 198 triangles (932 674
  and 911 574 in the table).
- **Fill**: from above, crown tops cover up to a third more of a wood's ground than the
  far trees did, and the upright pictures, which were most of a far tree's pixels from
  the side, are gone above 68 degrees. Not measured on the phone: the next Haven
  benchmark's "far forest" row from the air is the judge.

## Checks

- `node scripts/far-tree-form-test.mjs`: the forms' rule (nothing changes from the
  ground; nothing switches; both upright pictures and the shadow at 45 degrees, none at
  80; a closed wood's cover from above out to 4 km; a lone tree's width; shadows over one
  another come to half).
- `node scripts/far-tree-shade-test.mjs` (`--was`: with the old grid): the land's shadow
  on a far tile's trees against a ray from every tree; fails over one tree in twelve.
- `node scripts/far-trees-test.mjs`, `node scripts/far-forest-clock.mjs`: pass.
- `node scripts/far-tree-above.mjs [--old]`: a sketch of a patch of wood and of lone trees
  at three distances and four angles, in seconds (the rule is read from
  `farTreeForm.js`; light and colour are the sketch's own).
- `node scripts/far-forest-probe.mjs --distdir <build> --query ".."`: the far forest in
  the real game at a place: tiles, the land's shadow by tile, the clouds' shadow map the
  trees read (`--map file.png`), draw calls and triangles, a picture.
- `debug=treeshade`: every far tree painted by the sunlight left to it (red all, blue none).
- Stability moves from the air (`scripts/stability.mjs`, two new moves, and two new
  steps for moves: `level`, flight level along the heading whatever the pitch, and `up`):
  - `haven_above_flight`: level flight 1 km over the north wood looking down at 45
    degrees, 4 m a frame (240 m/s). Three settled frames at three stations: changed 21,
    15, 29 % of pixels, flicker 3.8, 1.8, 3.9 % (the meadow walk on the ground: 6 to 7 %).
    The strips are in `docs/shots/from-above/stability_haven_above_flight_<station>.png`:
    the same crown tops in the same pattern in every frame, moved by the flight; nothing
    comes or goes that can be found in them.
  - `haven_climb`: straight up over the opening place looking down at 60 degrees, 2 m a
    frame (120 m/s), stations 150, 500 and 850 m up (a first run with a station at
    1 550 m was inside the cloud): changed 25, 33, 19 %, flicker 2.7, 4.0, 1.6 %. Strips:
    `stability_haven_climb_<station>.png`. The picture's grain moves with the climb; the
    shade's edge, the crown tops and the canopy keep their places from frame to frame.
  - What these cannot show: frames are taken settled, so a tile of trees arriving or
    being filled again in flight is not in them (`--streaming` shows that; not run); and
    three frames 4 m apart say nothing of a crown top shrinking over a kilometre of
    descent.

## Behaviour changes (for the checkpoint message)

- A wood looked down on from the air is round crown tops with shadows where the ground
  shows, not specks and crosses; trees seen from above take the sunlight.
- Far trees have shadows on open ground when one flies (from 60 m up), gone with the
  saving "shadows of the farther trees".
- A tree record is ten floats (was nine): the chance its site had of a tree.
- The land's shadow on far trees is finer on the larger tiles.
- `debug=noclouds`, `debug=treeshade`.
- Nothing on the ground.

## Known problems, most visible first

1. The crown tops and the canopy the ground raises are two colours (olive on blue green
   at midday in the north wood, green-gold on gold in the morning at the opening place):
   the ground's half of the first item.
2. The trees' shadows are hidden under the raised canopy, which is nearly everywhere a
   wood is; they show only on open ground and at edges.
3. A spread crown top is one rosette's picture enlarged: at 1 km (2.2 crown widths) it
   reads as a large crown, at 3 km (6 widths) it is a few pixels; flying down on a wood
   the tops shrink as the trees between them grow in. Not seen in motion on this machine
   beyond the stability moves below.
4. Shadows are laid level: on a steep slope part of a shadow is in the hill or over it.
5. Seen from above within 240 m the near trees are as before (flat rosettes that take no
   sunlight, trunks through crowns): the trees helper's; at the 240 m line, looked down
   on, a far tree has a shadow card and the near tree its shadow-map shadow.
6. Nothing of this is measured on the phone.
7. Earth has the same far forest: only Haven was looked at.

## What went wrong on the way (for the notes)

- `debug=noclouds` first hid the cloud layer and left its shadow switched on, with a
  white map for a cloud: every "clear" picture was taken under an even overcast, and a
  probe of the trees' shade read "all in shade". The clear befores were taken again.
- Reading a one-byte render target back into a four-byte buffer filled a quarter of it:
  "75 % of the map in shade" was three quarters of the buffer never written.
- The shadow was first made of the second upright picture (no more triangles at all): a
  tree looked down on at 30 to 50 degrees was then one picture, a line from two sides.
- A brief's view inside a cloud, again: 3 km over the opening place is in the layer.
