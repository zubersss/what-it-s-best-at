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
  the eye going through a crown, but it showed as a dark hexagon from below and from the
  side at every size tried (62 %, 40 % and 27 % of the bunch's radius), worst on the tree
  in flower. Back to crossed rosette cards (a cut edge), fewer of them. The firs' skirts
  (plain cones under each tier) stay, smaller on the close mesh.
- Sprays at 1 m and smaller on the oak (leaves 10 cm): a lace with no mass. 1.3 to
  1.6 m with a dark inside holds together.

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

## The governor's steps

- `tree-leaves` (was: every leaf on the nearest trees): off, no tree gets the close mesh;
  the nearest are drawn as the near mesh (same skeleton, a few large sprays). Thins.
- `trees-far`: off, the close mesh reaches 13 m and the near mesh 40 m (two thirds).
- `tree-shadows`: off, trees drawn as cards (now beyond 60 m, was beyond 115 m) cast no
  shadow. It takes more shadow away than it did, all of it far from the eye.
- `leaves`: the falling leaves off as before; the petals thinned to a third, never off.

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
- Petals: up to eight flowering trees within 90 m let petals go (640 falling, 320 lying
  on the drawn ground under and down the wind of each tree).
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

(filled in at the end)
