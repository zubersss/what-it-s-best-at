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

## 4. From the air (`terrainMaterial.js`, the flowers' block; far blades in `grass.js`)

## 5. Pictures and numbers

## Pollen (`src/life/pollen.js`)

## Behaviour changes

## Known problems
