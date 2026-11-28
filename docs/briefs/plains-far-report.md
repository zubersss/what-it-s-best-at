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
   green is lit by the sky alone. Toward the Sun in the morning most of the low country lies
   in them (`before_hours.jpg`, top right). The clouds' shade adds to it and is not the cause.
3. **The air lifts the far land too little and too late to make up for it**: the wood does
   get lighter and bluer with distance (61 78 55 near, 82 91 88 at 5 to 10 km, 99 110 118
   at 15 km), but it starts so dark that a plain 10 km off is still darker than the sky's
   own blue above it and far darker than the near open ground: a slate floor.

The governor's floor changes none of this (the right-hand column): the same tones, less
detail in them. The far grass ("the grass things") is the next section.
