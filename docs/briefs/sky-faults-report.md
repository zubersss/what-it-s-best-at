# The sky's known faults: report (helper on `ccr-6f4f9272-sky-faults`, from 2026-11-27)

The brief: `docs/briefs/sky-faults.md`. Pictures: `docs/shots/sky-faults/`. Every picture is of
the default game (no `debug=` switch), from a frozen build, at the reference shape.

## Fault 1: the noon sky over the ranges is empty — CAUSE FOUND AND FIXED

**The cause, in a few lines.** Not the model, not its decoding, not the heights: the model
hands over heaps at noon (`node scripts/sky-above.mjs --t 4`: cloud carved over 18 % of the
120 km round the opening place), and the shared rule draws them. The fault was in how the
field's snapshots sit on the GPU (`src/sky/skyField.js`, `_take`). Three textures hold the
snapshots round the clock; a snapshot's texture was **its position in the list, numbered
again at every arrival**. The first snapshot of a pair was uploaded to texture 0; when the
second arrived it took number 0 and was uploaded over it, and the first, renumbered 1, was
from then on read from a texture nothing had ever been written to (all zeros). So the maps
every shader read were not `mix(older, newer, f)` but **`f x newer`**, f being the clock's
place between two snapshots (they are 120 s apart):

- at the start of every two minutes of the game's clock, f = 0: no cover of any kind, bases
  at sea level: **an empty sky**. Noon in the game (`?t=4`) is such a moment exactly, and so
  is every whole hour. That is the picture in the brief;
- in between, cover and base height both scaled by f: clouds at a fraction of their amount,
  their bases at a fraction of their height (down in the hills), rising and filling over two
  minutes and then gone again at a stroke. `?t=8.25` (the storm view) is f = 0.5: half the
  cover at half the height, and half the high cloud;
- it held in play as in pictures, forwards, backwards and after jumps.

Nothing in Node could see it (Node blends the snapshots' bytes themselves and has no
textures), and the stub's test pattern went the same way (its pictures were taken at hours
where f was not 0).

**The cure.** A snapshot keeps the texture it was uploaded to for as long as it is held (a
free one is given once, at arrival). And the one let go when a fourth arrives is the one
farthest in time from the newcomer, not always the oldest (running the clock backwards, the
oldest was the one just asked for, and its neighbour in the pair was dropped in its place).

**The check** (it fails without the cure: `--break reslot` puts the old numbering back and
three of its five checks fail): `node scripts/sky-slots-test.mjs`. The field is run in Node
with a renderer that only keeps count of which snapshot each texture was last written with
and which textures each blend read: forwards through 13 pairs, backwards through 13, and
after two jumps of the clock, every blend must read the pair's own two snapshots.

**Pictures** (noon, `?t=4`, 1 km over the opening place: `shot=ledge&alt=2513&t=4`):

| | before (afb87ee) | after |
|---|---|---|
| toward 200 degrees, level (the brief's view) | `noon_air_before.png` | `noon_air_after.png` |
| toward 30 degrees, 4 degrees up (where the model has most cloud) | `noon_ne_before.png` | `noon_ne_after.png` |

**What the "after" pictures show that is not yet right** (faults 5's business, now that the
true field is on screen for the first time): the camera at 1 km over the ledge is at the
heaps' base (2 393 m over the sea there), so the view is from just under a slab; the heaps
within the volume's reach are one beige mass with no lit top and no shade side, and toward
the north-east, where the cover is 0.5 to 1, the traveller is inside a grey deck. "Separate
heaps with wide gaps" is not what the rule cuts from a cover over 0.5.

**Cost.** None: the same uploads and the same blend, into the right textures.

**Tools added** (no browser, seconds): `node scripts/sky-scan.mjs --t 4` (the field's numbers
round a place at an hour of the game: heap, sheet, base, thickness, country, mid, high), and
`node scripts/sky-above.mjs --t 4 [--stub fair]` (the low cloud from straight above as the
game cuts it: the cover on the left, the carved cloud on the right). Both take the game's
hour (`?t=`) and work the weather's clock out themselves.
