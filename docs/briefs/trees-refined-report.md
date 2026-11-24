# Report: the trees refined, blossom and petals

Branch `ccr-aa39490a-trees-refined`. Brief: `trees-refined.md` beside this file.
Pictures: `docs/shots/trees-refined/`. Written as the work went; the newest state is at
the top of each section.

## Second round (brief `trees-refined-2.md`): the cold review's seven, fixed in motion

The cold review (`haven-rich-review.md`, trees-1 to trees-7, wiring-1 and 2, and the owning
session's "second looks") found seven faults that pictures from a standing camera cannot
show. Every one held against the code; each now has a check in
**`node scripts/trees-near-test.mjs`** (no browser, ten seconds) that failed on b2108ee
and passes now. `--old` runs trees-1's walk with the rule as it was.

**trees-1, which make a tree gets (high).** It was chosen by the distance from where the
whole list was made, up to 25 m behind the eye, and the close radius is 20 m. Now
(`src/life/treeLod.js`): the whole list (some 4 500 trees: reach, far cards, trees in
flower) is still made every 25 m; the close and near lists (the few hundred trees within
85 m of where it was made) are chosen again by the distance from the eye every
`fineStep`: a quarter of the smallest radius in use, or of the height over the ground, and
no less than a fifth of a second's travel (5 m walking, 3.3 m with `trees-far`, 12 m at
super speed). After the second review (trees2-2) the height is the nearest tree's distance
at the last choice, not the height over the ground under the eye (beside a rim the two
differ; on Haven by three times at most). The far cards are not rewritten at that pace: the far list holds every tree
that can need its cards before the next whole list, and a card is cut in the vertex shader
where its tree stands inside the near radius of the eye at the last choice (`iF`,
`uLodCut`). The walk (trees on a 7 m grid, 4.5 m/s):

| | nearest tree not close | farthest close | nearest cards | within 15 m not close |
|---|---|---|---|---|
| before, full shapes | 0.6 m | 44.4 m | 35.4 m | 30 % |
| before, `trees-far` | 0.3 m | 37.6 m | 15.2 m | 54 % (within 10 m) |
| now, full shapes | 15.6 m | 24.6 m | 55.4 m | 0 % |
| now, `trees-far` | 10.7 m | 15.8 m | 36.9 m | 0 % (within 10 m) |
| now, super speed (60 m/s) | 10.3 m | 29.8 m | 50.1 m | 4 % |
| now, flying beside a rim at tree height | 16.1 m | 24.0 m | 55.8 m | 0 % |

Every tree inside the radius is drawn by exactly one make in every frame of every walk.

**What a making costs** (`node scripts/tree-build-cost.mjs`: the real Trees class on the
north wood's trees, in Node on this machine; a phone's JavaScript is some three times
slower): the whole list ~5 ms and 343 KB to the GPU (every 25 m, as before); the close and
near lists ~0.2 ms and 17 KB. A second of walking at 4.5 m/s: ~1.1 ms and 77 KB (was
~0.95 ms and 62 KB); low flight boosted, 21 m/s: ~5 ms and 360 KB (was ~4.4 and 290); super
speed, 60 m/s: ~14 to 23 ms and 900 KB (was 13 to 22 and 820), nearly all of it the whole
list 2.4 times a second, as before. The benchmark should see the walk's cost as nothing
new; super speed through a wood was and is the whole list's hitch, 5 ms here (some 15 on
the phone) every 0.4 s.

**trees-2, shadows from above.** The shadow pass ran the vertex shader's "cards drawn in
when looked down on" with the eye's angle: every tree in a ring under anyone looking down
cast only its rosette's disc. The shadow pass now compiles with `TREE_DEPTH`, where the
cards are whole: a shadow is the tree seen from the Sun.

**trees-3 / wiring-1, petals at every making of the lists (high).** A making cleared all
480 lying petals (back six a frame over 2.7 s) and dealt the slots out again, so falling
petals jumped to other trees. Now a slot keeps its tree while the tree is listed (found by
its foot in the world), its lying petals stay where they lie (re-expressed from the new
anchor, `this.abs`), and only a slot whose tree has gone, or that the sharing out moves
to a tree with too few, changes. After the second review (trees2-1) every listed tree keeps
at least one slot (a tree that joined with four already listed had none), and a slot that
moves fades its falling petals out and in over half a second while its lying petals stay
until they are laid again one by one under the new tree. Trees coming into flower one at a
time, 1 to 8: no step leaves a tree without a slot (before: 2,2,2,2,0 to 2,2,2,2,0,0,0) and
no lying petal vanishes in a frame (before: 582). Kept petals are set again on the ground as drawn, six a
frame, without ever being hidden, so they follow finer ground as one walks up. Checked:
a making 25 m on, 0 of 480 lying petals gone or moved, 0 of 8 slots on another tree; one
tree gone and one come, 300 of 300 petals of the trees that stayed kept; the ground 8 cm
higher, every lying petal on it in four seconds, none hidden.

**trees-4, a flowering tree out of flower.** Petal texels were thrown away out of flower
(a cherry near by a lace of twigs, at 240 m the far forest's full crown, ten months of the
year). A flower not open, or a tree out of flower, is now leaves there, in the picture and
in the shadow pass, as the far forest draws it, with no petal tint on texels part leaf part
petal (trees2-4). Wood: the first fix and the far forest's (farforest-6) crossed over, each
taking the other's old threshold. Now there is one rule, `TREE_WOOD` in `trees.js` (wood
over 0.75, as trees-4 settled), used by both near passes and imported by `farForest.js`
(that one line, its import and comment edited here, at the owning session's word); the
check fails if any of the three passes takes wood by a threshold of its own.

**trees-5 / wiring-2, petals on the parent ground.** The height was asked with the eye's
distance from the planet's centre (k = 1 always); now with the petal's distance from the
eye. The check fails if any ask is over 200 m (it was 250 002 m).

**trees-6 and trees-7, bark.** Bark is now one GLSL function, `BARK` in `trees.js`, that
the check runs as written in JavaScript. The tube's coordinate carries the number of
furrows round it (`aUv.x = -2 - (2 * furrows + share of the way round)`), and every term
(the furrows' wander, the plate's column, the bands, the scars) goes a whole number of
times round: where the coordinate starts again the tone stepped along 99 % of the tube's
length, now 0 %. Where the bark is finer than the pixels (`fwidth(vUv)`, taken before any
discard) it gives way to its own mean (0.665 furrowed, 0.81 red plates, 0.915 pale; within
0.01 of the pattern's measured mean), not to a plain trunk, and from 30 m it fades to that
mean too (it faded to 1.0, a third brighter than the bark near by). The crawl, as a pixel's
tone changes when the eye moves by less than a pixel, more than the bark under it changes:
0.37 unfiltered, now 0.05 at most (furrowed and red bark and pale bands, trees of 8 and 20 m,
5 to 60 m, facing and on the flank, full size and the governor's floor).

**Bark in motion: the stability walk** (`npm run stability -- --only haven_wood_walk`, a move
added: on foot in the north wood, the forest cost view, trunks from 2 to 40 m; three
stations, settled frames a walking step apart; b2108ee against this round's build). The
whole picture: changed 58.1 / 56.6 / 55.2 % and flicker 10.7 / 11.2 / 10.1 % before, 57.9 /
58.0 / 54.3 % and 10.7 / 11.5 / 10.7 % after: the grass and the crowns in the wind and the
sun-flecks moving over everything own these numbers, as they do any frame in a wood. On
the trunks alone (boxes at station 1): changed 71 / 60 / 72 / 76 % and flicker 16.0 / 6.0 /
7.3 / 9.8 % before (trunks at about 3, 12, 25, 35 m), 72 / 69 / 65 / 50 % and 15.3 / 8.4 /
8.3 / 7.1 % after. The flecks of light under the crowns dominate even there (the trunk 3 m
off changes 71 % of its pixels before and after alike): the walk cannot isolate the bark,
and says only that nothing new crawls. The bark's own crawl is the check's number above
(0.37 to 0.05). `wood_walk_trunks_before_after2.png`: station 1, before above, after below,
the picture and its difference (red: one-frame changes). It also shows trees-1 at work: the
young fir in the middle, some 15 m off, is the close make after and the plain near make before.

**Pictures** (`docs/shots/trees-refined/`, `_after2`):
- `above_after2.png`: the opening place from 100 m up, 60 degrees down (to set beside
  `above_after.png`; the near trees there are no longer given their near mesh farther out
  when looked down on, as the first round's last commit decided, so they are the far
  forest's tree, crowns and rosettes, under whole shadows).
- `opening_300m_after2.png`: the opening view from 300 m up, 20 degrees down: the woods
  on the slopes read as one, no line where the near trees hand over.
- `fir_4m_preview_after2.png`: a fir's close mesh from 4 m at the phone's density
  (`tree-preview --close`): furrows continuous round the trunk.
- `wood_after2.png`: the wood from inside (the cost view, the stability walk's first frame).
- `blossom_after2.png`: the wild cherry 44 m from the opening place, from 12 m down the slope, looking 25 degrees up: in flower, petals in the air round the crown.

**The forest view's two numbers** (`node scripts/overdraw.mjs --part trees --view "in the
forest"`, 880 x 412, this round's build): **170 064 triangles** handed over (first round
163 288, before it 264 142) and **11.16 layers a pixel** over the whole picture, 20.88 where
the trees are (53 %), 73 at most (first round 10.49 and 19.64, 71). The 4 % more triangles
and 6 % more layers are the trees round the eye now really getting their close make: the
first round's numbers were taken with lists made at the eye, which only a standing camera
gets; in play they were fewer close trees than intended. The far cards cut inside the near
radius cost their vertices only (a few hundred cards).

### Behaviour changes (for the checkpoint message)

- Walking through a wood, the trees round the walker are the full skeleton within about
  15 to 25 m whichever way one goes (before: anywhere from 0 to 45 m, mostly behind); the
  change of make happens a few trees at a time every 5 m instead of a band every 25 m.
- Trees' shadows seen from above are whole trees' shadows everywhere (no ring of small
  discs round the point under the eye).
- Petals under a flowering tree stay as one walks or as the lists are made again; falling
  petals stay with their tree.
- Out of flower a cherry or blackthorn near by is a full crown of leaves (it was sparse);
  its shadow too.
- Trunks from 30 to 60 m are as dark as near by (they were up to a third brighter); bark
  far off is its average tone instead of fine black lines; no seam down the trunks.
- The near trees count (HUD) does not count far cards cut inside the near radius.

### Known problems, most visible first

1. **Nothing here is measured on a phone.** What to read in the next benchmark: walking
   adds some 0.3 ms of page work a second for the close and near lists (0.2 to 0.3 ms and
   17 KB every 5 m); the whole list is as before, 3.6 to 5 ms and 343 KB every 25 m here,
   some three times that on the phone, which at super speed through a wood is 2.4 times a
   second (unchanged by this round, and the largest tree cost the page has).
2. **The change of make is still a change of make**: a tree crossing 20 m (close to near)
   or 60 m (near to cards) changes in one frame; now a few trees every 5 m, near those
   radii, where it was a band every 25 m anywhere from 0 to 45 m.
3. **The stability walk cannot isolate bark** in a wood: the light under the crowns moves
   with the wind. A walk with the wind stilled would (there is no switch for it yet).
4. **From above** (trees2-3, refuted by the check, kept as known): within the near shadow's
   150 m a far-list tree's rosette lies partly in the shadow of its own upright cards (5 to
   25 % darker), as it did on main; climbing through 115 to 150 m the woods below brighten a
   little at the shadow's edge.
5. A slot that moves to another tree shows its lying petals in the new tree's colour for
   the few frames until they are laid again (rare: only when the count of flowering trees
   near by changes).
6. Petals on grass sit by the land class's rule, not the blade at that spot (first round,
   known problem 3).

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
