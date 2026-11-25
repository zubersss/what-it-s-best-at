# Report: flowers of many kinds and sizes together, from the side and from the air

*For the session that owns `ccr-aa39490a-qiw63x`. Branch `ccr-aa39490a-flowers-3`. Brief:
`docs/briefs/flowers-3.md` (the critic's gap 5, and the flowers' part of gap 3).*

## 1. What a bloom was (looked at first)

- **Every part one triangle**, and a cup's head turned toward the eye (`up * 0.8 + toCam *
  0.55`): the face-on sticker the critic saw. The stem a 7 mm sliver tapering to a point,
  0.3 to 0.4 of a pixel at 8 m: the heads floated. Spikes' florets were laid out by the
  camera's side and forward (they turned as one walked round). **Globes (thrift, thistle,
  cotton grass, a dandelion's clock) were degenerate triangles and drew nothing.**
- 2 to 15 m: fourteen petals and two leaves; 12 to 50 m: six petals, heads grown by
  1 + 0.03 d (twice the size at 35 m: the far yellow plates the critic saw floating over
  the valley); beyond, far blades with their tips in flower.
- **Why specks from the air**: the ground's dusting was a 1.3 m speck noise at a threshold
  (single pixels from 100 to 300 m), weakened by 60 % when looked down on and by 75 % past
  150 m, and nothing at all past 900 m: from 1 km up no meadow showed. The far blades in
  flower, seen from above, are one-pixel tips.
- **Why one kind**: the rule gave a patch of 110 m to one kind, and the hillside rule one
  kind to a whole slope; the flowers are drawn to 50 m: any one view held one kind.

## 2. Many kinds together (`src/life/grassRules.js`)

Every flora has `with`: two to four companions. In each patch (blocks of 130 m, bent by
waves longer than a block so that they never fold) the leading kind has two of them, chosen
by the patch's own numbers, of other habits than the leader where the list has such (tall
spikes and umbels among cups, cups among spikes). They stand in clumps (noises of 6.5 and
4.7 m cells) and pool into drifts of their own (a 35 m noise: where one pools the other is
scarce): `COMPANY`. A meadow's 30 m square has about half its places the leading kind and
three kinds and more in 95 % of squares (`flower-rule-test`). The turf kind is scattered
low among them near the eye, as before. A hillside of one kind keeps its colour (two places
in three, the opening slope's yellow leads), companions sparse inside and more at its edges.
Toward a patch's edge the next patch's kind mixes in plant by plant (half and half at the
edge, `BLEND`): no colour meets the next along a line.

The same rule in GLSL (`flowerBase`, `flPick`, `flowerCompany`, `flowersAt`), step for step;
`flowerTint` is the rule as the mean colour a pixel of ground sees.

## 3. A bloom as a thing in space (`src/life/grass.js`, `FLOWER_VERT`)

- **Every part two triangles**: the stem a ribbon (never under half a pixel wide, darker than
  before), every leaf, petal, floret and middle a kite (x across -0.5..0.5 at y 0.55, y out).
  Near lattice 36 triangles a plant (was 18), the far one 16 (was 8). Most instances leave
  the vertex shader after one table read (no flower there), as before.
- **A cup faces up**, tilted its own way (0.3 to 0.95 of the way toward a direction of its
  own) and a little toward the Sun; never toward the eye. Its petals rise into a bowl (deep
  for four-petalled poppies, shallow for five, nearly flat rays for daisies); the middle is a
  small dome. Seen from the side a head is a bowl or an ellipse on its stem; from behind, its
  back, a little darker.
- **Spikes, umbels, globes, cushions** are laid out in the plant's own axes on the ground
  (turned by its own number): they no longer turn as one walks round them. Spike florets
  are fuller (a coloured spire, not a few specks), the blues of lupin, bluebell and sage
  lighter. **Globes draw** (they were degenerate triangles).
- **Light and shade**: each part is lit by how it faces the Sun (0.55 to 1.15 of the Sun's
  light on it), so a bowl or a spire has a lit side and a coloured shade side.
- Only the turf's centimetre heads stay partly turned to the eye (0.4 of the way): edge-on
  they would be nothing.
- **Sizes**: each plant 0.7 to 1.3 of its kind's head and 0.75 to 1.25 of its height; heads
  grow with distance by 1 + 0.018 d (was 0.03: far heads were twice the near ones' size).
- The kind a plant takes is asked of the table a little off its own place (by up to half a
  cell): a clump's edge is ragged, not the table's 1.25 m or 4 m square.

## 4. From the air (`terrainMaterial.js`, the flowers' block; far blades in `grass.js`)

- **The ground's tint is the rule's mean colour for the pixel** (`flowerTint` in
  `grassRules.js`): the leading kind, the next patch's toward an edge, the two companions,
  each by its share; where a pixel is wider than the companions' clumps (0.8 to 2.5 m) their
  shares go to their means, and the 9 m drifts to theirs from 3 to 8 m. No speck noise: near
  by the tint is broken only by a soft noise of 4.5 m cells. Drawn to 2 500 m (was 900 m),
  where the grass's own paint gives way to the map's colour; full when looked down on (it
  was 60 % less), less only where the ground is looked along far off (the skyline). The
  rule's two broad noises come from the vertices to 2 600 m (the owning session's change).
- **Patches**: blocks of 130 m bent by waves longer than a block (shorter waves folded them
  into a mosaic; unbent, a quilt), and the next patch's kind mixes in toward an edge, half
  and half at it: from 1 km a meadow is soft drifts of colours, not a harlequin quilt.
- **Far blades in flower** lose their colour as they are looked down on (1 - smoothstep(0.1,
  0.5, rise), blade by blade alike, so none turns at once): from above, one-pixel tips were
  the speck cloud. At eye height they are as before.
- Cost: the tint asks at most four value noises a pixel near by (drift, pool, two clumps;
  before: three), from the air one or two (pool, drift) and the patch's hashes; within the
  grass's paint only. The governor's `grass-mid` saving still takes the ground's flowers away.

## 5. Pictures and numbers

`docs/shots/flowers-3/`: `haven_ledge_<view>_before.png` (build 6fd3896) and `_after.png`
(frozen build of e345387; the pollen's near-lens fade came after it), and `pair_<view>.png`
(before over after). Views (`scripts/flowers-3-shots.sh <frozen build> <suffix> [view ...]`):
`ledge` (the opening view), `ledge_phone` (`fov=21.4`), `floor` (`debug=floor`), `meadow`
(`lat=-54.39501&lon=38.28479&t=5&heading=45`, eye height), `meadow_a20` (20 m up),
`meadow_300` and `meadow_1k` (the meadow from 300 m and 1 km, 60 degrees down),
`region_300` and `region_1k` (the opening region the same way: mostly wood, few flowers to see).

What they show:
- **ledge / ledge_phone**: the yellow discs turned to the eye, floating large over the
  valley, are heads on stems, tilted, seen side on or as bowls, smaller far off; the yellow
  still leads; a few companions (lupin, paintbrush) among them.
- **meadow_a20**: one blue block beside one white is drifts of five and more colours.
- **meadow**: one blue star to the horizon is thistle globes, cornflowers, clover and others
  at different heights.
- **meadow_300 / meadow_1k**: nothing from 1 km before; now soft drifts of the meadows'
  colours with no seam and no speck.

Counts (`scripts/grass-layers.mjs`, 660 x 309; `layers_<view>_<before|after>.txt`):

| view | flower triangles handed over | flower layers per grass pixel | all grass layers |
|---|---|---|---|
| opening view, before | 0.31 M | 0.23 | 4.69 |
| opening view, after | 0.62 M | 0.37 | 4.82 |
| meadow, before | 0.31 M | 0.41 | 5.06 |
| meadow, after | 0.62 M | 0.73 | 5.37 |

Twice the flowers' triangles (two a part); no cut-out (they are opaque, shaded only where
they pass the depth test: "shaded" over all the grass 1.79 to 1.82 at the opening view, 2.20
to 2.35 in the meadow). The extra layers are the stems now drawn and the companions'
taller heads: some 6 % more grass layers in all.

### The ground's cost (asked by the owning session after the tenth benchmark)

`scripts/ground-cost-run.sh <scratch> --only ledge,meadow,air300,meadow1k,air3k --before
<file> --size 880x412 --dsf 2.2`, where the "before" shader is today's with the old flowers'
block and the 1 100 m vertex reach put back (same browser session; a count of work on
software WebGL, never a frame rate; `docs/shots/flowers-3/ground-cost.txt`; `meadow1k` is a
view added to the script):

| view | shaded, before -> after (ms of work; vertex work in it) | the shading alone |
|---|---|---|
| opening view | 7996 -> 8116 (+1.5 %) | 99 % of before |
| meadow, eye height | 6229 -> 6350 (+1.9 %) | 100 % |
| 300 m up | 5312 -> 5367 (+1.0 %) | 100 % |
| meadow from 1 km | 2674 -> 2716 (+1.6 %) | 99 % |
| 3 km up | 3343 -> 3334 (-0.3 %) | 94 % |

The fragment side is flat; the 2.6 km vertex reach and the rest add 1 to 2 % to the whole
(under the noise this measure has elsewhere). Kept.

## Pollen (`src/life/pollen.js`)

- Thins with height: none above 3.2 m, full under 1 m (was to 6 m in an even spread: motes
  seen against the sky read as dust on the lens).
- Toward the Sun a mote blooms into a soft halo (drawn up to 2.5 times wider, as bright in
  all), the smallest still 1.5 pixels: with the motes above 3.2 m and those at the lens gone,
  fewer pixels are filled than before (the owning session asked for its cost flat or lower).
- None nearer the eye than 0.6 m, faded to 1.6 m: a mote a hand from the lens was the
  blurred disc in the sky (`ledge_phone`, both builds; fixed after the frozen build).
- Not done: plumes downwind (asked by the critic).

## Behaviour changes

- Flowers: in every meadow a leading kind with two companions of other habits in clumps and
  drifts; hillsides of one kind keep it leading with companions sparse inside. **Which
  flower stands where has changed everywhere** (patches are 130 m now, bent and
  cross-faded).
- Blooms face up and toward the Sun, not the eye; stems show; globes (thrift, thistle,
  cotton grass, dandelion clocks) are drawn for the first time; far heads smaller.
- From the air meadows show as soft drifts of colour out to 2.5 km; the far blades' flower
  colour fades from above.
- Pollen low over the flowers, halos toward the Sun.
- `life.flowers` floras carry `with` (companions); world files unchanged.

## Known problems

1. **Not measured on the phone.** Flowers' triangles doubled (0.31 to 0.62 M at the opening
   view, out of 1.74 M for all grass); the ground's tint now runs to 2.5 km from the air
   (one or two noises a grass pixel there). `grass` and `grass-mid` still thin or take them.
2. From 1 km the meadows' tint is a little milky (a mean of bright petal colours over the
   olive grass reads as pastel); it could be deeper and less pale.
3. Stems at 20 to 50 m are many fine green lines (half a pixel at least); in the meadow
   from 20 m they are visible as a green hatch.
4. Heads seen exactly edge-on are yellow dashes; the cup's middle seen from the side is a
   dark slit.
5. Pollen: near motes can still sit above the horizon at eye height; no plumes.
6. The opening region's views (region_300, region_1k) are mostly wood: they say little about
   flowers; the meadow views are the ones to judge by.
7. No stability run of the new flowers (a walk and low flight over the meadow): heads now
   tilt in fixed directions, so they should not swim, but it was not measured.

## Round 4 (docs/briefs/round4.md, "Flowers and grass"; the second critic's gap 5)

Pictures: `docs/shots/flowers-4/` (`_before`: 3b5adab, the owning head; `_after`: this
round), `pair_<view>.png`; views `steppe` (`lat=-54.4271&lon=39.2697&t=5&heading=120`),
`meadow`, `pollen` (the meadow toward a low Sun, `t=0&heading=72&pitch=3`), `meadow_a20`,
`ledge`.

- **Flowers in pools, plain grass between** (`grassRules.js`): within a meadow the drifts
  are a noise of 14 m cells (was 9) with a sharp rise (`0.04 + 1.15 smoothstep(0.42, 0.62)`,
  was `0.45 + 0.75 ...`): thick pools that colour the ground, plain grass with the odd flower
  between, where before the whole meadow was an even sprinkle to the horizon. The ground's
  tint takes the same rule (its means 0.461 and 0.211 for a pixel too wide to tell a drift).
- **Grass varied by place** (`grass.js`, the blades; vertex work only, no texture read
  more): swaths some 90 m across, fresher green and deeper or drier gold and brighter (0.4
  of the dryness either way: `swathAt`, whole waves over the 2 560 m period like `lieAt`);
  clumps a metre across of taller and shorter blades (0.6 to 1.4, counted from where the
  grass began, as the tussocks are: `grass-place-test` passes); one blade in ten in dry
  grass a seed head, half again as tall with a pale straw tip; the wind's waves as
  stronger bands of light and dark (0.86 to 1.14, was 0.94 to 1.06). Not done: hollows by
  the land's own shape (green where water gathers): the blades know only their table's
  height and slope there; the swaths stand in for it.
- **Pollen low**: heights packed toward the ground (most within a metre), gone by 1.9 m
  (was 3.2): from eye height the motes lie against the grass, none in the open sky. Halos
  toward the Sun smaller (1.8 times at most, drawn at most 12 pixels): no large discs.
  Fewer motes drawn than before: its cost is flat or lower.
