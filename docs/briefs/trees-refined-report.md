# Report: the trees refined, blossom and petals

Branch `ccr-aa39490a-trees-refined`. Brief: `trees-refined.md` beside this file.
Pictures: `docs/shots/trees-refined/`. Written as the work went; the newest state is at
the top of each section.

## What a tree was made of, and what it is made of now

A phone 1 440 pixels tall through the walker's 60 degree lens shows a metre at 3 m as
416 pixels, at 10 m as 125, at 30 m as 42 (at the governor's floor, 36 % of the pixels,
six tenths of that).

**Before** (build 6ac24ff):
- *Foliage*: cards 3 to 4.5 m long, each showing one spray of 256 texels: **60 texels a
  metre**. A texel was 7 pixels wide at 3 m, 2 at 10 m, and matched the screen only from
  30 m. The sprays themselves were drawn at twig scale (a twig with forty leaves, a bough
  with its needled twigs) and then stretched over four metres: an oak's leaf was half a
  metre long, a fir's needle 20 cm long and 6 cm wide. That is the "no level of detail":
  not too little drawn, but what was drawn shown four times too large and blurred.
- *Skeleton*: a fir was a trunk and nothing else in wood (0 limbs; its boughs were only
  cards); a pine a trunk and 22 three-sided tubes; an oak a trunk and 13 tubes. No twigs
  anywhere. No flare at the root. 150 to 470 triangles a close tree.
- *Bark*: one rule, dark furrows by the angle round the tree's own axis (wrong on any limb
  that is not upright), fading out by 60 m; dark rings on pale trunks.
- *The dark inside*: three crossed cards of a rosette in every bunch.
- Distances: the close mesh to 42 m, the near mesh to 115 m, then two crossed cards.

**Now**:
- *Foliage*: the same kind of spray, drawn finer (needles and leaves two thirds the size,
  twiglets off the twigs), at 512 texels, on cards **1 to 1.9 m** long: 270 to 500
  texels a metre, a texel a pixel at 3 m. A leaf is 13 to 17 cm, a needle 5 cm by 1.5.
  New sprays: what hangs under a fir's bough, a pine's branch end with its seven tufts, a
  twig in flower, a crown in flower from above.
- *Skeleton*, close mesh: the trunk is eight-sided through seven rings with a flare at
  the root that bulges over its roots; every limb, branch and twig down to the one a
  spray sits on is a tapering tube with round normals (a fir: 80 to 100 boughs, each a
  sagging branch with fronds off both sides swept forward, an end frond and the curtain
  of twigs hanging under it; a pine: 11 branches, 22 heads, each head 5 to 9 twigs
  with a branch end's tufts on crossed cards; an oak: 4 limbs, 8 forks, 16 bunches of 8
  twigs with five sprays a twig). 1 500 to 4 100 triangles a close tree.
- *Bark*: by rule on each tube's own coordinates (round it in furrows, along it in
  metres), so it follows every limb: furrowed with the ridges broken into lengths (fir,
  spruce, oak), large plates each its own tone with dark cracks (red trunks: pine), smooth
  with bands part of the way round and black scars (pale trunks: aspen, birch). No new
  sampler.
- *The dark inside*: foliage, never a solid: crossed rosette cards in a bunch, a dark rosette of fronds under each tier of a fir,
  and the sprays nearest the middle of a bunch drawn dark.
- Distances: **close to 20 m, near to 60 m**, then the cards. The atlas is 4096 x 2048
  (2.7 MB; sprays 512, whole trees 256 x 512: they were 256 and 160 x 320), its mip maps
  made in JavaScript, tone and kind averaged over covered texels only (no grey fringe).

## What was tried and taken back

- **A dark lump of plain faces as a bunch's heart** (24 triangles, nothing cut out, drawn
  first so that the cards behind it are never shaded). Cheaper in layers and it does stop
  the eye going through a crown, but it showed as a dark hexagon hung in the tree from
  every side at every size tried (62 %, 40 % and 27 % of the bunch's radius), worst on the
  tree in flower. A crown's dark inside is now foliage: crossed rosette cut-outs and the
  bunch's inner sprays drawn dark.
- **A fir's dark inside as a cone**, then **as one rosette lying flat under each tier**:
  the cone was a black pyramid on the nearest trees; the flat rosette, seen from under
  it, was a shelf that cut the trunk off (the first game picture, `game_first_fir_4m.png`).
  Now three or four short dark fronds hanging outward by the trunk under each tier (the
  middle-distance mesh keeps a small cone inside them).
- **A fir's hanging twigs as a long curtain** under every bough: "wet hair". Cut to short
  swept twiglets; the bough is a fan of fronds, each hanging at its tip.
- **A pine's head as long plumes**: now round tufts at the twigs' ends with last year's
  smaller tufts behind them, bare twig and sky between; the middle distance shows the
  same tufts.
- Sprays of 1 m and smaller on the oak (leaves 10 cm): a lace with no mass. 1.3 to 1.6 m
  with a dark inside holds together.
- **Pale bark** (the trunk colour at 0.6): a peeled pole in the Sun. Now 0.28 of it on
  every trunk that is not pale, furrows near black, darker toward the trunk's two edges.
- **Petals at life size** (4 to 7 cm): under two pixels from twelve metres. Now 9 to 14 cm.
- The close views at 1540 x 721: on this machine the forest never settled in 25 minutes
  at that size; the pairs are at 660 x 309 through a 21.4 degree lens (the same density).

## Pictures (`docs/shots/trees-refined/`)

- `early_old_new_close.png`, `sheet2_old_new_close.png`: fir, pine, broadleaf, old left
  and new right, the close mesh from 4 m at the phone's density (tree-preview; the second
  after the owning session's first review).
- `fir_4m_before.png`, `fir_4m_after.png`: a Douglas fir's boughs and trunk in the forest
  cost place, about 4 m from its foliage (660 x 309, 21.4 degrees). `game_first_*`: the
  first two game pictures, kept for what they showed (the shelves; the pale trunk).
- `wood_before.png`, `wood_after.png`: the wood from inside (the cost view);
  `wood_deeper_after.png`: the same wood a little on (asked for as a view from 45 m up;
  `alt` is from the datum, so it came out on the ground).
- `overdraw_trees_before.png`, `_after.png`: where the near trees' layers are.
- `opening_after.png`, `opening_before.png`: the opening view (on the joined build with
  the new grass). The wooded slope left of the middle runs from some 150 m to past
  600 m: the 240 m line between the near trees and the far forest crosses it and does not show.
- `blossom_after.png`: a wild cherry 44 m from the opening place from 12 m, petals in
  the air; `blossom_5m_after.png`: from 5 m.
- `above_before.png`, `above_after.png`: the opening place from 100 m up, looking down
  60 degrees (the from-above helper's item 10).

## Numbers

(the forest cost view, 880 x 412; `node scripts/overdraw.mjs --part trees,farForest`)

| | triangles handed over | layers a pixel, whole picture | where the part is | most |
|---|---|---|---|---|
| near trees, before | 264 142 | 12.52 | 23.73 (53 % of the picture) | 87 |
| near trees, after | 163 288 | 10.49 | 19.64 (53 %) | 71 |
| far forest, before | 490 182 | 4.04 | 18.66 (22 %) | 82 |
| far forest, after | 490 182 | 4.14 | 18.85 (22 %) | 84 |

The near trees are drawn in **16 % fewer layers** and 38 % fewer triangles than before,
with the detail of the nearest ones some six times finer; the far forest is unchanged
(its 0.1 is the larger picture's finer cut-outs). These counts are without the depth
test: what is rasterised, the upper bound of what is shaded. The near trees are now also
drawn nearest first (the lists are sorted, the close meshes before the near before the
far), which the old build did not do and these numbers do not show. The grey pictures
`overdraw_trees_before.png` and `_after.png` show where the layers are (white: 16 and
more). Not measured on the phone.

## The governor's steps (the three tree steps, on the new trees)

- `tree-leaves` ("every leaf on the nearest trees"): off, no tree gets the close mesh; the
  trees within 20 m are drawn as the near mesh: the same skeleton in fewer, plainer tubes
  (no flare, no twigs), a few large sprays to a bunch, one card to a fir's bough. In the
  forest view that takes 25 or so trees from 2 000 to 4 000 triangles each to 200 to
  600. It thins; no tree goes.
- `trees-far` ("the trees' full shapes to two thirds of their distance"): off, the close
  mesh reaches 13 m and the near mesh 40 m; beyond, a tree is its picture on two crossed
  cards and a rosette. (From above the near mesh still reaches up to four times farther.)
- `tree-shadows` ("shadows of the farther trees"): off, the trees drawn as cards cast no
  shadow: now those beyond 60 m (40 m with `trees-far` off), where it was those beyond
  115 m. It takes more shadow away than it did, all of it far from the eye; a close tree
  casts as its near mesh and a near tree as its cards, as before.
- `leaves` (in the new ladder, `buys: 0.3`): the falling leaves off as before; the petals
  thinned to a third (falling and lying), never off.

What each buys on the phone is not known: the cost test of the next benchmark will say.

## Behaviour changes (for the checkpoint message)

- Trees near the eye are a different make (see above); the close mesh ends at 20 m (was
  42) and the near mesh at 60 m (was 115).
- A limb now sways with its leaves (one rule for wood and leaf by height and distance
  from the trunk; before, leaves moved two and a half times as far as the limb they sat
  on). A spray flutters at its tip and is held at its root.
- Winter on trees that drop their leaves: a spray's leaves are left out leaf by leaf and
  its twigs stay (before, the cards shrank to the trunk). The far cards keep their leaves
  as before.
- Haven has two flowering trees (species 64 wild cherry, 65 blackthorn; shape 8
  `BLOSSOM`), in its meadows, parkland, by water, and in the opening place's parkland
  (about one tree in six there). In flower from day 62 to 118 (cherry) and 55 to 105
  (thorn) of the northern year, half a year later in the south: the opening date (22
  September, 48 degrees south) is three weeks into it. Out of flower they are small
  round-leaved trees.
- Petals: the flowering trees within 90 m (up to eight) let petals go: a pool of 640
  falling (a steady light fall, a flurry in a gust, carried by the wind's velocity eased
  over three seconds) and 480 lying, shared among the trees there are. They are drawn
  larger than life (9 to 14 cm). The lying ones are put on the drawn ground, six a frame,
  lifted to the turf's top where the land's class grows grass (the grass's own `AMOUNT`),
  two in three in a ring at the crown's edge, shifted down the wind.
- A tree looked down on keeps its near mesh up to four times farther (240 m from
  straight overhead), and a full instance list hands a tree to the simpler mesh (it was
  left out altogether).
- Twigs are grey-brown and darker than their limb whatever the trunk's colour; bark is
  dark on every trunk that is not pale.
- The trees' picture is 2.7 MB (was 0.76) and 44 MB on the GPU with its mip maps (was 11).

## For the owning session

- `src/life/farForest.js`, two lines: a petal is 0.5 in the picture's blue, so wood is
  now `cut.b > 0.75`; and a tree in flower gets its leaf colour blended to its petals'
  (`inFlower`), since the far shader has no room for a petal colour of its own.
- Tree meshes: `aSway` is a vec2 (sway, flutter); wood has `aUv.x < -1.5` (bark
  coordinates); instances have `iE` (petal colour, how far in flower; -1: never flowers).
- **Not done, needs the ground** (`terrainMaterial.js` is not mine): the lying petals are
  points put on the drawn ground from the page (eight a frame, `terrain.drawnHeight`).
  A carpet of petals under a flowering tree would be better drawn by the ground itself:
  a uniform list of up to eight (foot position, crown radius, colour, amount), and a
  speckle of the colour within 1.3 radii, down the wind.

## Known problems, most visible first

1. **Nothing here is measured on a phone.** The layers are fewer than before, but the
   close trees' triangles are five to eight times what they were (2 000 to 4 000 each,
   some 25 of them in a wood), the atlas is 44 MB on the GPU, and its mip maps are made on
   the main thread when it arrives (8 million texels: a hitch of a tenth of a second or
   two, once, before the first tree is drawn). Ask for the forest view's cost table.
2. **The step from the close mesh to the near mesh at 20 m** is a change of make (sprays
   of 1.3 m to sprays of 2.5 to 4 m, twigs gone): standing still it does not show, walking
   through a wood a tree some 20 m off changes as it is passed. Not judged in motion (no
   stability run was made on these trees: two hours on this machine).
3. **Petals** are a scatter in a still; the lying ones sit on the grass's tips by the
   land class's rule, not by the blade's height at the very spot, so on thin grass some
   float a hand's width and in the tallest some are under it. The ground shader drawing a
   speckle under a flowering tree would be the better carpet (see above).
4. **From above** the near trees are better than rosettes but not yet round crowns with a
   shadow beside each: see the pair. The far forest's own trees (beyond 240 m) are the
   from-above helper's.
5. **Winter**: a line at 60 m between bare near trees and the far cards that keep their
   leaves (it was at 115 m). The opening date is spring, and Haven's woods are conifers.
6. **The far forest's blossom** is a leaf colour blended to the petals' (`inFlower`), and
   `paintLeaf` pulls it toward green: beyond 240 m a flowering tree is a pale dusty pink,
   not the white-to-pink of the near ones. Its tiles are not made again when the day changes.
7. The palm is as it was (plain faces); the tropical tree, the acacia, the bush and the
   aspen have the new make but were seen only in the preview, not in the game (none on
   Haven's opening views but juniper and aspen).
8. `tree-preview.mjs` does not show the game's blossom shading (white tips), only its cut.
