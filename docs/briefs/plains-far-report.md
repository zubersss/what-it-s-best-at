# The plains and the far grass from the air: report (brief: `plains-far.md`)

## 1. Finding it (before any change; build of a1af530 with the seasons branch, frozen)

Pictures, the opening place looking 235 degrees (away from the morning Sun) and 15 degrees
down unless said: `docs/shots/plains-far/before_heights.jpg` (6 km, 3 km and 1 km up, as the
game is on the left and at the governor's floor on the right), `before_hours.jpg` (3 km at
noon, toward the Sun, 35 degrees down, before sunrise), `before_1km_probe.png` (1 km, the
view the parts were taken out of). 90 m and 300 m: section 2, still rendering.

Colours read off the pictures (display levels of 255, means of a box):

| what, from 1 km | r g b |
|---|---|
| the sunlit mountain side (open ground) | 201 145 120 |
| the wood in the Sun, 1 to 2 km off | 61 78 55 |
| the wood in the mountain's shadow | 39 63 70 |
| the wooded plain 5 to 10 km off, from 3 km | 82 91 88 |
| the far shore, 15 km | 99 110 118 |

**Parts taken out, one view loaded once** (`scripts/sky-probe.mjs`, 1 km): with the far
forest's trees out of the scene the wood's box does not move (61 78 55 -> 62 78 56); with
the clouds' shade off, and with all the clouds out, the dark stretch of wood does not move
either (39 63 70 -> 39 60 66): it is not a cloud's shadow. So:

1. **The wood from above is the ground's own raised canopy, and its green is a third as
   bright as open ground beside it.** `farCanopyColour` in the ground's shader: one leaf
   green (0.045, 0.085, 0.03 x 0.61 x 0.85, the trees' leaf by their rule), a reflectance of
   some 4 %, where the meadow and the rock are 25 to 40 %. The plain is wood nearly from
   edge to edge, so the plain is that green. The tree cards on it change nothing in tone.
2. **The land's own shadow on a wood is navy, near black**: the big dark stretches are the
   mountains' shadows at a low Sun (the baked shadow of each patch), where that same dark
   green is lit by the sky alone. The clouds' shade adds to it and is not the cause.
   (Corrected: I first read the navy expanse in `before_hours.jpg`, top right, toward the
   Sun, as low country in shadow. It is water: its tone does not move when the sky's light
   on the ground is nearly doubled, it has a sand shore and islands. The height function
   says 1 433 to 1 454 m for 12 km that way.)
3. **The air lifts the far land too little and too late to make up for it**: the wood does
   get lighter and bluer with distance (61 78 55 near, 82 91 88 at 5 to 10 km, 99 110 118
   at 15 km), but it starts so dark that a plain 10 km off is still darker than the sky's
   own blue above it and far darker than the near open ground: a slate floor.

The governor's floor changes none of this (the right-hand column): the same tones, less
detail in them. The far grass ("the grass things") is the next section.

## 2. The grass things, from 90 m

`scripts/parts-out.mjs` from 90 m over the opening place, 15 degrees down: every ring of the
grass's blades and clumps taken out in turn changes **0.0 % of the picture** (they are not
in that view at all: the ground there falls away into a wood). The far forest's trees taken
out change 23 % of it and leave it lighter (by 2.4 levels in the mean): **the dark things on
the open ground from the air are the far trees and shrubs standing on it, darker than what
they stand on, not the grass.** I have not yet found a view where the grass itself draws
dark from the air; the 90 m and 300 m pictures over the meadow (rendering) are the next look.

## 3. The first change: a wood is lighter with distance

`life/farTreeForm.js`, `farGreen` (the one rule the raised canopy and the far forest's trees
both take their green from): beyond 300 m a green leaf's colour is lifted, up to three times
(`FAR_LIFT`) at 2.6 km and beyond. Near by, among the trees, a leaf is as dark as it was;
leaves turned gold or red are not lifted (they were bright already). Arithmetic only: the
ground reads no more than before.

Tuned in one loaded view from 1 km with the number changed live (1, 2.2, 3, 4): at 3 the
wood is a mid green beside the mountain's pink and the plain pales into the air behind it;
at 4 the wood begins to glow against the rock.

Pairs so far (before above, after below): `pair_1km_opening.jpg`, `pair_3km_opening.jpg`,
`pair_6km_opening.jpg`, `pair_3km_noon.jpg`; autumn from 3 km after the change:
`after_3km_autumn.png` (the far woods' season rides on it as before).

Tried and left alone: more of the sky's light on the ground from the air (`look.aloft.sky`
2.6 to 4.0 and 5.5) and more lift in the grade: the land's shadows on the wood turn a
little from navy toward teal and nothing else moves; not worth flattening the mountains'
shade for. The land's colour map (the wood beyond 19 km, a khaki olive from 20 km) is not
changed yet: from 20 km there is no band where the canopy's own colour hands over to it,
but it is duller than the lifted wood near by; a greener forest colour in the land rule
would need the map made again.

## 4. The land's colour map made again, and the opening view from the ground

The land rule's wood colours lifted (`tiles/madeLand.js`: forest 36 64 30 -> 43 78 35,
woodland 74 92 46 -> 79 102 48), `make-world.mjs` and `make-world-maps.mjs` run again: the
land came out the same (only `haven_day_4096.jpg` and `haven_day_512.jpg` changed). From
20 km the wood is a mid green where it was khaki (`pair_20km_map.jpg`); a first try at
54 98 42 was a kelly-green felt from there and was dropped. The map's mean in `haven.js` is
kept as it was, on purpose (a note there): it is what the map is divided by, and the new
mean (0.1346, 0.1439, 0.0585) would have darkened every meadow and mountain to pay for the
woods.

**The opening view from the ground** (`pair_ground_opening.jpg`; display levels, box means):

| what | before | after |
|---|---|---|
| the big fir | 82 97 81 | 82 96 80 |
| the near wood below | 38 62 65 | 38 62 64 |
| the mountain | 195 145 123 | 194 144 122 |
| the grass | 123 99 40 | 122 98 39 |
| the wood on the middle slope, about 1 km off | 57 82 79 | 64 89 77 |
| the far wooded slope, 2 to 3 km off | 100 115 120 | 111 125 117 |

The firs, the wood below, the mountain and the meadow are the same to a level; the far
slopes' woods are 7 to 10 levels lighter and greener, which is the change itself. 5.7 % of
the picture's pixels are over 2 levels.
