# Report B: the clouds you see

The helper of `docs/briefs/sky-B-clouds.md`, on branch `ccr-aa39490a-sky-B-clouds`. Kept as the
work goes: the main session reads this file and the branch, not the transcript.

**In short.** Everything of a cloud that is drawn now comes from the field: the base and the top
at each place (so the sky no longer follows the traveller), heaps and decks cut by one shared
rule that the volume, the far shell and C's shade atlas all read, storm cells with their own
shape, their two tones, their slate depth, their anvils and their rain shafts, out to 200 km;
altocumulus and cirrus on shells above, mist lying in the basins, lenticular plates standing
over the ranges, and Haven's globe wearing the weather of the hour. The four lines
`src/sky/skySystem.js` needed are in the owning branch now, and this branch has merged it back,
so what is left here is what the model's own pictures found — the lenses (never drawn at all,
twice over), the anvils (a hole over every tower, and all of them at the shell's height instead
of their own), the storms at the governor's floor (a ring of clear sky where a tower should be),
and the three cadences that keep the page's work down — and then **seven more faults that a cold
read of the code found while those pictures were being taken** (checks 8 to 11 below):

1. the rain shafts were drawn nowhere but under a cell one was looking into — of the nine per
   cent of a storm view that stands in rain, eight and a half were missing or cut off in mid-air
   (three places had the same fault: the march's cell search, the slices, and the far sheets);
2. the fog sheet's 60 km lattice swung about its anchor as the traveller flew, because its axes
   were taken at the traveller and not at the anchor;
3. the lenticular plates were drawn nearest first, so a lens 25 km off was laid over one 5 km
   off and a lens's own plates were stacked bottom over top;
4. the cirrus's bright rim and its 22-degree halo were put opposite the Sun (a sign);
5. the fog sheet and the lenses had no step in the governor's ladder and no part the benchmark
   could leave out — the fog's `saving()` was empty and the lenses answered to nothing.

That is what the brief's "have work that others built reviewed this way before it ships" is for:
every one of them was found by reading, in files that had already passed a day of pictures.

**Where to look in this file.** B0 (the job before the package) · What was built · Checks 1 to
11 (each with its numbers and how it was seen to fail; 8 to 11 are the faults a cold read found
on the last day) · Pictures · New scripts · The look numbers for `haven.js` · Cost · The
checkpoint lines · What was asked of the main session (all done) · Views on Haven · What the
pictures showed · A lesson for `CLAUDE.md` · Open · What is still running.

## B0 (the job before the package): step 0's GLSL on a GPU

All of this is `f3a1eb7` (step 0's head), built once and served frozen from
`scratchpad/build0`, so nothing here is about my branch.

**Shaders.** Every program the sky draws with compiles and is inside a phone's limits.
The table, read off the live page (`scripts/cloud-cost.mjs`, which asks the browser for
each program's texture units and varyings):

| program | textures (fragment + vertex) | varyings |
| --- | --- | --- |
| the sky | 9 + 2 | 1 |
| the air's march | 11 + 0 | 1 |
| the ground | 16 + 13 | 14 |
| the cloud volume | 8 + 0 | 1 |
| the cloud layer | 2 + 0 | 1 |
| the globe from space | 7 + 0 | 1 |

A phone allows 16 in the fragment shader and 15 varyings. The ground sits at 16 of 16, as
`CLAUDE.md` says it does; nothing of the sky adds to it. No shader error in any run.

**The opening view** (`shot=ledge&world=haven&t=4`): drawn, clouds and all —
`scratchpad/shots/haven_ledge_B0_noon.png`. See "the one thing to fix" below: the picture
is right, but the run never counts as settled.

**The drift, 60 s of game time apart** (the same view at `t=4` and `t=4.0166667`; the game
clock is paused in screenshot mode, so the only difference is the hour asked for).
Measured by matching the two pictures (a high-pass filter, then the best shift):

- the heaps near the top of the view moved **28 px across the picture to the left and 21 px
  up** — at 8.58 px per degree (60° over 515 px) that is 3.3° and 2.5°;
- the day's wind there is **12.1 m/s toward 83°**, so 726 m in that minute. The view looks
  toward 222°, so the wind crosses it from right to left and carries the heaps behind the
  camera: leftward and rising in the picture is exactly the direction it demands, and 3.3°
  of it puts those heaps a few kilometres off, which is where heaps that high in the
  frame stand. **The heaps move downwind at the day's speed.**
- the land is the same land: below the horizon the two pictures differ by 3–4 of 255 on
  average, which is the grass moving in the wind and the clouds' shadows going with the
  clouds.
- **one thing does not move**: the big mass at the top right, which is the far cloud shell
  (`src/sky/clouds.js`), matches itself best at a shift of exactly zero (a sharp peak:
  0.41 at no shift, 0.13 at the heaps' shift). That is right for what it draws there: with
  no `?debug=sky:` preset the field is off at the opening view, so the shell falls back to
  the day's cloud *map* and a detail noise, neither of which the wind touches. It is the
  reason for change 2 below ("the field always on"): on this branch, with the field on, the
  shell's heaps are the same heaps the volume marches and they take the same steering.

**Earth** (`world=earth`, the same frozen build): drawn, settled in 1 174 s, no error, no
program over a phone's limits — `scratchpad/shots/earth_ledge_B0_earth.png`.

**`npm run stability --only haven_climb`** on step 0's build was dropped: by the time the
browser reached it, step 0 was two merges behind (package A had landed), and an hour of this
machine's one browser spent on a build nobody will run again buys nothing. The climb is run on
the owning branch's head instead, with the crossing under heaps and a storm pass beside it.

**The one thing to fix (step 0's, not mine).** At the opening view the run never counts as
settled: `window.__shotReady` waits for `post.stableReads >= 3` (the exposure meter's
target within 2 % of what the frame used, three frames running) and after 137 frames and
900 s it was still waiting on the exposure. Both pictures of the pair had to be saved
"not ready", and every ground-level Haven picture on this machine therefore costs the full
time limit — 17 minutes each instead of 7. The air views settle normally. A probe that
prints the exposure frame by frame, with the clouds in the picture and with them taken
out, is written (`scratchpad/exposure-probe.mjs`) but was not run: the browser's hours went to
the package's own pictures instead.

## What was built

### The march (src/sky/cloudVolume.js)

- **The cloud comes from the field.** One read of map A at every step gives the heap cover, the
  sheet cover, the base and the sheet's thickness AT THAT PLACE: the base is a thing of the
  place, not of where the traveller stands. (`place()`'s country-smoothing, `setGround()` and the
  frame drift are still there, but only on the path for a world that has no field — Earth, until
  A's `fromMaps` is wired. On a world with a field none of them is read.)
- **One rule for the shapes.** `sky/skyGlsl.js` now holds the forms the cover is cut into
  (`skyHeapTop`, `skyHeapBody`, `skyHeapAt`, `skySheetAt`, `skyEdgeEat`, `skyFormQ`, and
  `skyLowAt`, which is all of them from one read). The volume marches them, the far shell reads
  them where the masses are widest, and C's shade atlas follows them toward the Sun.
- **Reads a step**: field A, the masses and the lobes (one read: the noise's two channels), and
  the look toward the Sun — 3, plus the wisps within a kilometre of the eye, and one more for
  each of the two noise reads while the rise crosses its wrap. Per ray: field B once (the Sun the
  mid and high layers leave), field C once and A and B twice more where there are rain shafts.
- **Bounds** from the field within reach (a square of 25 places, snapped to 250 m with
  hysteresis): they only shorten the march, and no value of a cloud comes from them. (A ring of
  eight at the reach looked past everything between them.)
- **Storm cells** (`weather/sky/cellShape.js`) are marched by the same function in the near slices
  and in the two far ones: the exact chord toward the Sun through the tower for its light, a slate
  tint that deepens with that chord, density 1.45 times a heap's, the ground's light halved, the
  cell's own noise boiling upward in its own moving frame, and up to two flashes through `uBolt`.
- **The far slices** (16–40 km, 40–200 km) are marched and laid only while a cell stands beyond
  the reach. They are laid over the whole view with each pixel's own depth: the distance at which
  its ray enters the nearest cell (the same rule, `cellChord`), with a depth-only pass where the
  core is nearly solid. So a ridge in front hides a storm behind it and the shells behind a tower
  are hidden by it. (The plan's alpha-weighted mean distance would have needed a second target or
  a channel of the ALL pass; the entry of the chord is the same rule and cheaper.)
- **Rain shafts** below the raining base: every live cell's shaft chord, of which the two the ray
  is really in are kept for the stepping (NOT the two the body's chords found: a ray aimed at the
  rain goes under the cloud and meets no body — check 8) and the field's rain under decks,
  2 looks into the field and one into the noise for the falling streaks, virga where the base
  stands high over the land, a misty foot over field C's country height, grey-blue sky light with
  a silver glow toward a low Sun, and nothing within 600 m of the eye (D's streaks take over).
- **The slices' layout** in the small picture now goes down a column first, so the six near slices
  fill the first three columns and the two far ones the fourth: with no storm beyond the reach the
  fourth column is neither marched nor read, and the target is used in part exactly as before.

### The far low shell (src/sky/clouds.js)

Its vertices stand on the field's own base (one read a vertex), it cuts the same heaps and decks
by the shared forms, and it throws near pixels out FIRST. With no field it is the map, as before.

### New (src/sky/upperClouds.js, src/sky/fogSheet.js)

- `UpperClouds`: the mid shell at 5 km (altocumulus cloudlets in two tones, altostratus as a veil)
  and the high shell at 9 km (cirrus brushed along the high wind, a faint 22-degree halo, anvils
  solid and dark beneath). Each is cut where a tower passes through it, and they are drawn above
  or below the camera by their height. One read of the field where the sky is clear, and then the
  pixel is thrown out; on a covered pixel three more for the mid shell (its cloudlets, the coarse
  look that puts them in patches, and the look toward the Sun that gives them two tones) and one
  or two for the high shell (its strokes, and a finer octave while the governor leaves it on).
  An anvil costs no read at all: it is the cells' own shape.
- `FogSheet`: 129 x 129 points over 60 km on a lattice fixed to the world (snapped in whole
  steps, so its points stay on the same places as one flies), each lifted to field C's fog top,
  depth-tested, one noise read a pixel. Whether there is any fog within reach is asked of the
  field over a square of 25 places, every 3 km of travel or 60 s of the clock.
- `Lenticulars` (src/sky/lenticulars.js): up to 12 plates, each a stretched ball — 7 to 11 km
  along the ridge, a tenth as deep — standing still over its own summit. Every pixel takes the
  metres of cloud its own ray crosses, so a lens is a lens from any side and fades out at its
  own edge; two tones with a clean line and a pearly rim where it is seen edge on; no texture
  read at all. The list comes from the model (`field.lenses(t)`, or a snapshot's LENS records),
  nearest first, nothing from beyond the horizon, read every ten seconds of the clock.

## Checks (each with its numbers, and how it was seen to fail)

**1. The reads a step — PASSED (`node scripts/cloud-cost.mjs`, the merged build).** The march is
compiled a second time with `CLOUD_READS`, and every read of the noise and of the field adds one
to a running total that the pixel hands back, so this is the count on real rays, counted over
the stepping alone (the per-ray reads are reported apart).

At the storm 20 km off (`t=8.25`, the far slices on):

> the march's reads a step, out of the rise's fade — slice 6: **1 a step over 8 steps, 0 a ray**
> ok   at most 4 reads a step out of the rise's fade (1.00 beyond the first kilometre, 0.00 within it)
> ok   at most 6 in the fade, when the masses and the look toward the Sun are each read twice (1.00 / 0.00)

One read a step is the cell's own boiling noise: in the far slices the layer is not marched at
all, so nothing else is read there.

**The check now proves its own numbers** (`89fb6a5`). It counts the marches it sets off and asks
whether what came back is counts at all — a step count is a whole number, a cloud's green is not:

> ok   the counting shader itself ran, twice, and handed back counts and not a picture (2 marches, 3174 of 3174 pixels a whole number of steps)

Without that, the check could not tell the counting picture from the last frame's ordinary one,
whose red over green is about 1 — the very number it is looking for. It also catches the other
way of passing on nothing: at the fair view over the opening place, where the volume draws no
cloud at all, the old check printed "0.00 reads a step" and passed; it now fails there, saying
0 of 0 pixels were counted, because a view with no cloud measures nothing.

And the break taught its own lesson too. `--break read` first put its extra read inside the
LAYER's path — which this view never takes, since its cloud is all storm cells — so the check
passed on a build broken on purpose. The break now adds four reads at the top of `cloudStep`,
whichever path the step takes (817c129).

**2. The motion (`node scripts/cloud-motion.mjs`).** Three runs of this check found three faults
of the check, not of the clouds, and each is worth knowing:

1. its first view looked ALONG the day's wind, so the clouds came toward the eye and the picture
   moved one pixel in twenty seconds — nothing to measure;
2. the second stood 3 km up at ten degrees above the horizon, over a layer whose top was
   2 575 m: the slice it correlated was empty sky;
3. the third was chosen from a Node scan that read the stub's `t` as hours since the weather's
   epoch, while the game counts `?t=` from the scene's own moment, 521 hours later — so the hour
   that had cloud in Node had none in the game. Both runs failed with "cover 0.000": **a
   correlation of nothing moves nothing**, which is what a check that cannot fail looks like
   from the other side.

It now stands under the model's own broken heaps (t=32: 0.55 cover, no deck, their bases 2 101 m
over ground at 1 444, the day's low wind 11.8 m/s toward 86 degrees), 300 m under them, looking
across that wind. Its numbers are below as the run lands.

**3. Anchoring (`node scripts/cloud-motion.mjs`).** The march is drawn from the camera's place,
from 100 m away and from 10 km away, each aimed at the same point of the world, and every uniform
it reads is compared between them. **Of everything the march reads, only `uCamPlanetPos` changed
when the traveller moved** — not the base, not the bounds, nothing of the cloud. In the picture,
from 100 m away the same cloud stands over the same place to a correlation of 0.87 (the rays
through a volume are not the same rays, so it is not 1). The check first asked for that from
10 km away too, where a volume seen from 10 km to the side is a different path through it
altogether and a perfectly anchored march scores 0: that half of it now asks only that the sky
be the same sky. The camera the shaders read is the app's own uniform, so the check moves that
one and says how far it moved (100 and 10 000 m): a test that moves the camera must check that
the camera moved.

**4. A phone's limits — PASSED (`scripts/cloud-cost.mjs`, which runs `lib/glLimits.mjs` on every
program three has linked; run again on the merged build: "ok every program of the sky is inside
a phone's limits (6 of them)").** They are:

| program | textures (fragment + vertex) | varyings |
| --- | --- | --- |
| the march | 11 + 0 | 1 |
| the far low shell | 9 + 2 (field A in its vertex shader) | 1 |
| the mid and high shells | 8 + 0 | 1 |
| the fog sheet | 7 + 0 | 1 |
| the far cell sheets | 2 + 0 | 1 |
| (the ground, for scale) | 16 + 13 | 14 |

**5. Stability** (`npm run stability --only haven_climb,haven_cross,haven_storm_pass`): running.

**6. A ridge hides the foot of a cell beyond it** (the brief's sixth). The far cell sheets lay
each pixel at the distance its own ray enters the nearest cell, so the depth they write is the
cell's, not the slice's: a ridge in front of a storm hides its foot and its shaft, and a cell
nearer than a ridge beyond it is drawn over that ridge. The view for it was found with the
model's own cells and the world's height function
(`scratchpad/cell-behind-ridge.mjs`, `scratchpad/ridge2.mjs`): from
lat -57.7172, lon 38.6692 at 2 200 m, looking 299 degrees, a ridge stands 17.6 km off at 1.13
degrees up and a cell 35.4 km off has its foot at -2.10 and its top at +8.99. The picture is
`haven_ledge_M_ridge.png` (and `_Q_ridge` for the pair). The other way round could not be found
on Haven at any hour of the three scene days — the model's cells stand over low ground, and no
ridge beyond one of them is higher in the view than its own foot — so it is held by the rule
instead: the depth written is the ray's entry into the cell (10 to 20 km), and any ground beyond
that is farther.

**7. The hand-over at 16 km, where the near slices give way to the two far ones** (in
`cloud-motion.mjs`): a cell is looked at from 15.0, 15.8, 16.2 and 17.0 km and the cover and the
light it shows are compared; the step across the hand-over must be no larger than the steps
either side. Its first run drew the SAME picture four times (34 007 pixels, cover 0.845, light
0.439, to four decimals) and passed: it moved rig.pos but not the camera the shaders read. It
now moves that uniform and fails if the four pictures are identical.

**8. The rain shafts, seen from the side — a fault found and fixed late (89fb6a5,
`node scripts/cloud-volume-test.mjs`).** A ray aimed at a storm's rain passes UNDER the cloud: it
does not meet the cell's own body. The march finds the two cells its stepping needs by the body's
chord, and the shaft's stretch was built from those two — so the rain was drawn nowhere but under
a cell one was looking into, which is the one place from which a shaft cannot be seen. In the new
check, of 241 rays fanned across a storm 20 km off from 2 km up, **61 crossed the rain without
crossing the cloud** (a quarter of the fan, from 1.7 degrees below the horizontal to 3.3 above)
and one crossed both. The shafts are now looked for over every live cell, and the two the ray's
rain is actually in are kept (`gShaftK`) exactly as the body's two are, so the stepping under the
rain still pays for two cells however many storms stand in the line of sight. Both halves were
seen to fail with the old loops put back ("FAIL the march looks for the shafts over every live
cell", "FAIL and the rain under it is the shafts' own cells, at most two").

How much this was worth is measurable without a browser, on the very views the cell pictures are
taken at (`node scripts/rain-pixels.mjs`, seconds: the world's own model for the cells, the same
chords the shaders use):

| the view | cloud | rain | rain on a ray that crosses no cloud | rain in a slice with no cloud of its own |
| --- | --- | --- | --- | --- |
| the cell from 9 km (`_M_cell9`) | 21.3 % | 9.0 % | 7.3 % | 8.6 % |
| the cell's portrait (`_M_cellsun`) | 15.3 % | 8.1 % | 7.4 % | 7.8 % |
| the storm 20 km off (`_M_storm20`) | 5.7 % | 3.0 % | 2.8 % | 2.8 % |

The map of that view says the same in a picture of its own (`node scripts/sky-map.mjs --t 8.25
--view "-52.2848,29.7865,4500,243,3,70"`): the tower stands in the middle, its anvil spreads over
the top, and the rain (`r`) fills the bottom third of the view, where nothing was drawn.

```
|......................TTTTTTTTTTTTTTTTTTTTTAaa....................|
|.....................TTTTTTTTTTTTTTTTTTTTTTT......................|
|hhhhhhhhhhhhhhh......TTTTTTTTTTTTTTTTTTTTTTTTc   .......c.........|
|hhhhhhhhhhhhh............TTTTTTTTTTTTTTr..                     ...|
|hhhhhhhhhhhh  ...........rrrrrrrrrrrrrrrr    ....                 |
|hhhhhhh...vv.............rrrrrrrrrrrrrrrr      .....              |
|vvvvvv. .................rrrrrrrrrrrrrrrr                         |
```

The last column of the table is the share of the picture whose rain was drawn wrongly or not at
all before today: **of the nine per cent of that view which stands in rain, eight and a half were missing or
cut off in mid-air**. `haven_ledge_Q_cell9.png` (the owning head) is the "before" and
`haven_ledge_M_cell9.png` the "after".

Asking for the shafts before a slice can be given up would have made the whole sky over the
cloud pay for every cell's shaft chord in every slice, so the slice is first tested against the
highest base anything rains from (a new `uShaftTop`, the deck's base and the cells' own): a
stretch of the ray that stays above it holds no rain and is given up as before, which is most of
the picture.

One thing to watch in those pictures: the rain's own numbers (`SHAFT_K` 0.00014 a metre at
rate^0.85) were tuned while most of a shaft was being thrown away. With the whole of it drawn, a
39 mm/h core two kilometres deep comes to an optical depth of 6.3 — opaque, which is what a heavy
shaft at nine kilometres really looks like (one cannot see a kilometre into 39 mm/h of rain), and
a 5 mm/h veil a kilometre deep is still only 0.14. So the numbers are left as they are; if the
pictures read as a grey wall rather than a curtain, `SHAFT_K` is the number to lower.

It stood a second time one level up, in the march itself: a slice of the distance from the eye
was given up (`fragColor = 0; return`) when no cloud of its own crossed it, and the rain was
worked out after that test. So the rain showed only in the slices where the ray ALSO crossed the
cloud's body, and a shaft ended at a slice's boundary in mid-air. The rain's stretch is now
worked out first, and a slice that holds the rain but no cloud is the rain's.

The same fault stood in the sheets that lay the two FAR slices (the storms beyond 16 km): each
pixel is laid at the depth where its ray enters the nearest cell, by the body's chord, and every
pixel that held a far storm's rain was therefore marched and then thrown away for want of a
depth. Those sheets now take the nearer of the body's and the shaft's entry.

The pictures of a cell and its shaft (`_M_cell9`, `_M_cellsun`) are therefore taken from a build
made after the fix, not from the merged build the rest of them come from.

**9. The fog sheet's lattice swings with the traveller — found by reading, fixed
(`node scripts/fog-sheet-test.mjs`).** The sheet is a lattice of 129 x 129 points over 60 km,
anchored to the world and re-anchored only when the traveller has gone a whole step (469 m), so
that the fog stays on its own places. But its AXES were taken at the traveller, and on a world
250 km in radius they turn with every metre flown: the whole lattice swung about its anchor, by
**7.1 m at its far corner for every 60 m flown** (32 m between two travellers standing in the
same cell), to and fro as each cell was crossed — the fog's edge crawling against the ridges all
the way. The axes are now the anchor's own, so what the shader is given depends on the anchor
alone: between two anchors nothing of the sheet moves at all (0.0 m), and at an anchor it moves by
one step (472 m at the corner) and no more. The new check was seen to fail three ways with the
traveller's axes put back.

This is the lesson about the grass's anchor met again, in a new place: on Haven every term in
x times D over R shows, and a frame taken at the traveller is one of them.

**10. The lenses were drawn in the wrong order — found by reading, fixed
(`node scripts/lens-list-test.mjs`).** The nearest lenses are TAKEN first, which is what the cap
of twelve plates is for; they were then drawn in that same order, and a see-through plate drawn
later is laid over the one before it. So a lens 25 km off was blended over one 5 km off, and the
two or three plates of a single lens — which do overlap, seen from the side, which is how one
stands under a range and looks at them — were laid bottom over top. They are now handed over
farthest first. Seen to fail with the sort taken out ("1 km, 1 km, 0 km, 5 km, 25 km" instead of
"25 km, 5 km, 1 km, 1 km, 0 km").

**11. The cirrus's ice effects were put opposite the Sun — found by reading, fixed.** The upper
shells worked out the cosine between the line of sight and the Sun from the vector pointing
TOWARD the eye, where the march (`cloudVolume.js`, `gCs = dot(dir, uSunDir)`) and the far low
shell (`clouds.js`, `cs = dot(-V, uSunDir)` with `V` toward the eye) both take it from the way one
is looking. Its sign was therefore flipped: the bright rim ice shows toward the Sun and the
22-degree halo of a cirrostratus veil were both drawn round the ANTISOLAR point, where a real sky
has neither, and nothing at all appeared within 30 degrees of the Sun. It is now
`dot(normalize(vRel), uSunDir)`, as its two siblings have it. The pictures do not settle this one
(a halo at 0.062 and a rim of cos^8 are faint against a cirrus sheet, and no picture of the set
looks within 22 degrees of the Sun with high cloud in it); the physics and the two files beside
it do, and the numbers `HALO` and the rim's strength were tuned with the fault in, so they may
want another look once a picture faces the Sun.

**The parity of every JS twin with its GLSL** (`scripts/sky-system-test.mjs`, which runs the
shared texts through `scripts/lib/glslRun.mjs` at a grid of points): passes on the merged build,
as do `sky-steer-test`, `sky-format-test`, `sky-cell-test`, `sky-model-test`, `governor-sim`,
`cloud-volume-test`, `fog-sheet-test` and `lens-list-test`.

## Pictures (paths; before and after)

All at 880 x 412, dsf 1.25, from frozen builds, in
`/tmp/claude-0/-home-user-what-it-s-best-at/fa086d69-ff44-5069-99a3-fdab3300646a/scratchpad/shots/`
(the ones worth keeping are copied into `docs/shots/sky/`).

**Which build each picture came from.** The frozen builds step with the fixes below:
`buildB6` was the first from A's model, `buildB8` adds the anvil's torn edge and the patchy
mackerel sky, `buildB10` the lenses that are drawn at all, `buildB12` the storms at the
governor's floor, `buildB14` the anvils at their own height and whole over their towers. From
then on the owning branch had merged all four sky packages and B's four lines, so the last
pictures are `buildC1` — that merge with this branch's eleven newer commits on top — against
`buildQ2`, the owning head alone. Each picture's build is named beside it when it matters.

**Before and after.** "Before" is the owning branch's own head (`ccr-aa39490a-qiw63x`, built as
`buildQ`) and "after" is this branch, with the four lines of "Asked of the main session" patched
into the frozen copy. The same query goes to both, with `debug=sky:model` so that each uses the
world's own weather.

Note what that pair is and is not: the owning head **already carries most of package B's code**
(the main session has been merging this branch as it goes), but **not the four lines that switch
it on**. So "before" is this work with the field unplugged — the volume falls back to the base
the world file gives plus the ground under the traveller, and nothing of `upperClouds.js`,
`fogSheet.js` or `lenticulars.js` is ever built. That is exactly the state the owner would see
today, which is what makes the pair worth looking at; it is not package B against nothing.
(That was `buildQ`, the owning head before it took the four lines. The later pairs are against
`buildQ2`, the owning head WITH them: there the difference is only this branch's eleven newest
commits — the lenses, the anvils, the governor's floor.)
The hours are the ones `scripts/find-weather.mjs --scene` names, as a `t=` offset from the
scene's own moment.

| picture (`haven_ledge_*`) | the view | what it is for |
| --- | --- | --- |
| `_M_storm20`, `_Q_storm20` | a tower 20 km off, its top 20 degrees up, raining 39 mm/h (t=8.25) | the cells, their two tones, their rain shafts |
| `_M_storm35` | the same cell from 35 km | the hand-over at 16 km, the far slices |
| `_M_ridge`, `_Q_ridge` | a ridge 17.6 km off (1.1 deg up) in front of a cell 35.4 km off (foot -2.1, top +9.0 deg) | check 6: the ridge must hide the foot |
| `_M_lens`, `_Q_lens` | a lenticular 9 km off, 11 km long, three plates (t=53) | the lenses |
| `_M_floor` | the storm with every saving the governor has | a step thins, it does not remove |
| `_M_noclouds` | the storm view with `debug=noclouds` | the switch takes every kind |
| `_M_up30`, `_M_globe` | from 30 km up; the globe from three radii off | the shells and the globe from far |
| `_M_mist` | the opening place at first light, looking into the low ground (t=-0.5) | the fog sheet |
| `_M_storm`, `_Q_storm` | the opening place, the storm 64 km off (t=8.25) | the far cell sheets from the ground |
| `_M_cirrus_sun`, `_M_cirrus_away` | the steppe at dusk, the Sun 2.5 deg up at azimuth 277, high cloud 0.80 (t=34.5) | the cirrus, the 22-deg halo and the Sun-side rim — the view check 11's sign fix shows in |
| `_M_deck_below` | under a deck: sheet 0.89 over the opening place, its base 2 043 m, the camera at 1 800 (t=30) | a deck's grey underside |
| `_M_flash` | a storm 12 km west at night, the Sun 14 deg down, a stroke held at its brightest (t=13.4) | the flash inside the cloud (`uBolt`) |
| `_M_front` | the opening place, a cell 25 km off raining 26 mm/h (t=33) | a rain deck and its shafts |
| `earth_ledge_B0_earth.png`, `earth_ledge_B_earth.png` | Earth's ledge, step 0's build and this one | Earth has no field yet: what changed there anyway |

**Kept in the repository.** The ones worth keeping are copied into `docs/shots/sky/` as
`B-*.png` (package A's are `A-*`): `B-storm-20km-before/after/first`, `B-storm-35km`,
`B-cell-sunlit` and `-before`, `B-cell-9km`, `B-ridge-hides-cell` and `-before`, `B-lens`,
`B-lens-from-the-side`, `B-lens-none-drawn` (the fault), `B-floor` and `B-floor-hole` (the
fault), `B-noclouds`, `B-from-30km`, `B-globe`, `B-ledge-afternoon`, `B-mist`, `B-front`,
`B-ledge-storm`, `B-earth-before/after`, `B-B0-drift-0s/60s`.

**The stub's own pictures** (before the model landed) are kept for the record:
`haven_ledge_storm12.png` (the first storm picture, which showed the three faults of 9478d38),
`haven_ledge_tower8.png` (a cell 8 km off), `haven_ledge_B0_noon*.png` (B0's pair),
`haven_ledge_fair_air.png`.

## New scripts (all without a browser, seconds each)

| script | what it holds to |
| --- | --- |
| `scripts/lens-list-test.mjs` | the lenses' list: either shape the field hands over (the model's objects, a snapshot's LENS records), the plates each lens becomes and where they stand, the nearest taken and the ones over the horizon dropped, `noclouds` and a faded lens drawing nothing |
| `scripts/cloud-volume-test.mjs` | the volume's decisions: drawn or not, and the storms still marched when the governor has switched the volume off — on the very first frame; and the rain shafts, which a ray crosses without crossing the cloud (check 8) |
| `scripts/sky-map.mjs` | what stands where in a view, as a map of letters in one second: the anvils, the volume's own low cloud against the far shell's, the mid veil, the high cloud (`scripts/lib/skyModel.mjs` loads the model for both of these) |
| `scripts/rain-pixels.mjs` | how much of a view the rain stands in, and how much of it a shader that finds the storms by their body alone must throw away (the model's own cells; a tool, not a test — it fails only if the hour has no raining cell) |
| `scripts/fog-sheet-test.mjs` | the fog's lattice is the world's: nothing of it moves between two anchors, two travellers in one cell are given the same sheet, and it is drawn only where there is fog (check 9) |
| `scripts/cloud-motion.mjs` (new, the brief's) | the motion, the anchoring, the uniform audit and the hand-over at 16 km, in one browser run |

Every one of these was seen to fail with the fault it guards put back (the read-count check in
`cloud-cost.mjs` as well, which took three tries: see check 1).

## Numbers for src/worlds/haven.js

They are defaults in the files below, each a frozen block at the top of its file, and each is
what the pictures were tuned with. The main session moves whichever the world should pin into
`src/worlds/haven.js`.

**`CLOUD_LOOK` (src/sky/cloudVolume.js)** — the march's look
| name | value | what |
| --- | --- | --- |
| SUN_LOOK | 280 m | the look toward the Sun that splits a heap into its two tones |
| SHADE / LIT | 0.64 / 1.0 | the two tones |
| ROUND / ROUND_K | 0.18 / 0.22 | the light that comes round into a cloud from its own sides |
| FLOOR_DECK | 0.3 | the least light a deck's base keeps |
| CELL_DENSE | 1.45 | a storm cell is this much more solid than a heap |
| CELL_FACE0 / CELL_FACE1 | 250 / 700 m | the chord over which a tower's own face turns from the Sun's tone to its shade |
| CELL_LIT / CELL_DEEP | 300 / 2600 m | the chord toward the Sun over which a tower goes from white to dark |
| CELL_SKY | 0.2 | the share of the sky's light that reaches the heart of a tower |
| CELL_FLOOR | 0.11 | the light its base keeps (the plan's 0.08–0.15) |
| CELL_TINT | 0.62, 0.66, 1.0 | the slate-indigo its shade is pulled toward |
| CELL_BOIL | 5.5 m/s | how fast its noise boils up through it (the plan's 3–8) |
| CELL_NOISE | 0.55 | how much of its own noise eats at its hull |
| GROUND_HALF | 0.5 | the light from the ground below, halved under a storm |
| MID_K / HIGH_K | 1.2 / 0.35 | the Sun the mid and high layers leave: exp(-K cover) |
| SHAFT_K / SHAFT_P | 0.00014 / 0.85 | the rain's optical depth a metre: K rate^P |
| SHAFT_FALL | 9 m/s | a drop's fall (the streaks' scroll, the foot's offset downwind) |
| SHAFT_NEAR | 600 m | nearer than this the shafts fade out (D's streaks take over) |
| SHAFT_MIST | 300 m | the misty foot over the country |
| SHAFT_GREY / SHAFT_GLOW | 0.7 / 1.1 | the sky's light a shaft shows, and the silver glow toward a low Sun |
| VIRGA | 2000 m | light rain under a base this far over the land dries up before it lands |

**`CLOUD_RULE` (src/sky/skyGlsl.js)** — the shapes the cover is cut into (one rule for the
volume, the far shell and the shade atlas). The heap's numbers are the game's own, unchanged;
the sheet's are new: SHEET_TOP 0.82, SHEET_LUMP 0.3, SHEET_BASE 0.04, SHEET_CROWN 0.12,
SHEET_SQUASH 0.667 (the pattern squashed upright, so a deck's lumps lie flat), SHEET_BODY0/1
0.02/0.3 (where a cover becomes a solid deck).

**`UPPER_LOOK` (src/sky/upperClouds.js)**: MID_H 5000 m, HIGH_H 9000 m; MID_K 2.2 and HIGH_K 0.8
(how fine each layer's pattern is); MID_CELL 520 m (a cloudlet of the mackerel sky); MID_ALPHA
0.92, MID_SHADE 0.72; HIGH_STRETCH 7 (how far cirrus is drawn out along its own wind),
HIGH_ALPHA 0.5, HIGH_ANVIL 0.97, HIGH_UNDER 0.45; HALO 0.062 (the 22-degree halo).

**`FOG_LOOK` (src/sky/fogSheet.js)**: SPAN 60 km, N 129, EDGE 40 m, LUMP 900 m, ALPHA 0.97,
BRIGHT 1.06. (Its top is level, as a lake of mist is; the lumps are in what it takes of the
light behind it, not in its height.)

**`LENS_LOOK` (src/sky/lenticulars.js)**: MAX 12 plates, THIN_MAX 3 (the governor's step),
FLAT 0.11, GAP 1.35, SHADE 0.66, RIM 0.35, EDGE 0.22, THICK 140 m.

## Cost (headless work counts; the phone decides)

What is paid for a fair day, and what a storm adds, counted on software WebGL by
`scripts/cloud-cost.mjs` (a count of work, never a frame rate; the same view on the owning head
and on this branch, at the phone's pixel count — `--size 880x412 --dsf 2.2`). Each run measures
itself: the march and the lay are the difference from a frame with the clouds left out, taken in
the same browser session, so the two runs can be set side by side:

At the storm 20 km off, 3 km up (two cells in reach, the far slices on, cloud on 5 % of the
picture — read with the half floats decoded; before that it said 34 %, which was whatever the
driver had left in the buffer):

| | the owning head | this branch |
| --- | --- | --- |
| at 1 100 x 515 — laying the slices over an empty picture | | 58–60 ms |
| at 1 100 x 515 — the march into its small picture | | 790–791 ms |
| at the phone's pixel count (1 936 x 906) — laying | 203 ms | 209 ms |
| at the phone's pixel count — the march | 1 971 ms | 2 006 ms |
| the fair day at the phone's pixel count — laying | 177 ms | 175 ms |
| the fair day at the phone's pixel count — the march | 1 743 ms | 1 762 ms |

So at the phone's pixel count this branch's clouds cost **within two per cent** of the owning
head's at both views (the brief's "no higher than today's on a fair day": 1 937 ms of march plus
lay against 1 920, which is 0.9 % on a machine whose own runs of the same view differ by that
much), and that head already carries most of package B (the four lines and the
field). What the pair says is that the lenses, the anvils' torn edge, the mackerel sky's patches
and the governor's floor are not where the cost is: the march is, and it is the same march.
(Software WebGL counts work, never frames; the phone's own cost table decides. These numbers are
from `buildC1`; what the rain's six fixes add is measured again in chain M9.)

The six programs of the sky and what each asks of a phone (16 fragment textures, 15 varyings):
the march 11 + 0 and 1 varying; the far low shell 9 + 2; the mid and high shells 8 + 0; the
ground's two shade programs 5 + 0; Haven's globe 7 + 0.

(The same view on an earlier build with one cell in reach and no far slices marched 203 ms at
1 100 x 515: what the far slices and the model's five cells add is most of the 790.)

**And a view the volume draws nothing in costs nearly as much as a storm.** On the fair day over
the opening place (`alt=2600&pitch=-4&t=4`) the march came to **1 743 ms on the owning head and
1 762 on this branch** (laying 177 and 175) — 88 % of the storm's, for a picture with no cloud of
the volume's in it at all (cloud on 0 % of what it lays).

A map of that view made in Node in a second (`node scripts/sky-map.mjs --t 4 --view
"-48.54992,49.05567,2600,222,-4,50"`: the model's own field cast along the view's rays) says why there is nothing: of the cloud in that view, **all but one corner
stands beyond the volume's 16 km reach** and is drawn by the far shell. The march still pays for
it, because the layer is a slab between two spheres, every ray that crosses the slab is marched
through it whatever the cover is there, and the cover is read a step at a time.

That is not a thing to cure by guessing. A slice whose cover is nil could be skipped, but the
cover would have to be read for the whole slice at once, and cutting a slice by a test of its
own is the fault the lessons warn of ("an edge cut slice by slice"). What it does say is where
the phone's cost table should be read first, and that the governor's last cloud step (the volume
off, the shell everywhere) is the lever that matters most on a dear frame.

What the march reads, which is what the phone will feel:

| when | reads a step |
| --- | --- |
| clear sky or a fair day | the field's A, the masses and the lobes (one read of the noise's two channels), the look toward the Sun: **3** |
| within a kilometre of the eye | and the wisps: **4** |
| while the rise crosses its wrap (16 % of the clock) | the masses and the look toward the Sun are each read twice: **5** |
| inside a storm cell | the field's A, the cell's own boiling noise, the masses: **3** (its light is an exact chord, no read) |

Per ray, not per step: field B once (the Sun the mid and high layers leave), and where rain is
falling within reach, field C once and A and B twice more. On a fair day with no rain the shafts
are not crossed at all.


## For the checkpoint message (what the player will see that is different)

- **The clouds stand where the weather says they stand, not over the traveller.** The base and
  the top come from the field at each place, so the sky no longer sinks or rises as one flies,
  and a deck lies in the valleys while the heaps stand over the high ground. (The picture pair
  `haven_ledge_M_storm20.png` and `haven_ledge_Q_storm20.png` is this change alone: at 3 km over
  the country west of the opening place, the owning branch draws a grey wall — the camera inside
  a cloud whose base followed it — and this branch draws the storm, the mackerel sky and the
  mountains. Since the main session has taken those lines, that is the owner's "before" too: it
  is what the phone drew until today.)
- **Storms are things in the world**: a tower with its own shape, lit on the side the Sun is on,
  slate where it is deep, with an anvil at the top and rain falling out of its base in shafts
  that you can see slanting downwind. They are drawn out to 200 km, so a storm stands on the
  far skyline.
- **And the rain is there to be seen.** Until this morning a shaft was drawn only under a storm
  one was looking INTO — which is the one place from which rain cannot be seen — so from the side,
  which is how a storm is usually watched, the rain was missing: at the cell seen from 9 km it
  stands on 9 % of the picture, and 8.5 of those were blank or cut off in mid-air. The pair is
  `haven_ledge_Q_cell9.png` (before) and `haven_ledge_M_cell9.png` (after).
- **New in the sky**: altocumulus and cirrus overhead (with the 22-degree halo round the Sun),
  mist lying in the basins at first light, and lenticular plates standing over the ranges on a
  windy day.
- **Haven from space wears the weather of the hour** instead of a painted-on cloud map.
- On the real worlds nothing changes but Earth's own clouds, which are drawn with the new shapes
  (softer, more cut-out; the pair is `earth_ledge_B0_earth.png` / `earth_ledge_B_earth.png`).

## Asked of the main session — **done** (merged into `ccr-aa39490a-qiw63x`, 25 November)

All four lines are in the owning branch now, and this branch has merged it back:

```js
this.upper = parts.upper ?? new UpperClouds(renderer);      // skySystem.js
this.fog = parts.fog ?? new FogSheet(renderer);
this.lenses = parts.lenses ?? new Lenticulars(renderer);
this.fieldWanted = !this.noClouds && (made || (maps && d.preset === 'model'));
this.cloudVolume.place(rig.pos, this.frame);                // beforeScene
```

Nothing of B's own files was changed upstream, so the merge was clean and the frozen builds no
longer need a patch of their own.

## Asked of the main session — **done** (the owning head `e63d72e`, merged back here)

The fog sheet and the lenses were the only drawn things of the sky with no step in the governor's
ladder and no part the benchmark's cost test could leave out. Their module side was built and
tested here (`scripts/fog-sheet-test.mjs`, `scripts/lens-list-test.mjs`) and the main session put
the wiring in within the hour: `skyStep('lenses', 0.2, ...)` and `skyStep('fog-sheet', 0.3, ...)`
in the ladder, both savings in `SKY_SAVINGS`, `'lenses'` in `SKY_PARTS`, and the four `case` lines.
What was asked for was this:

```js
// SKY_SAVINGS (sky/skySystem.js)
'fog-sheet': 'B: the fog on a lattice of half as many points a side (a quarter of the triangles)',
lenses: 'B: the nearest three lenses, one plate each',
// SKY_PARTS
'lenses',
// setSaving's switch
case 'fog-sheet': this.fog.saving(id, off); break;
case 'lenses': this.lenses.saving(id, off); break;
// live's switch
case 'fog-sheet': return !!this.fog.live(id);
case 'lenses': return !!this.lenses.live(id);
// partOut
else if (id === 'lenses') this.lenses.partOut(id, out);
```

and a step for each in `src/perf/governor.js`, cheapest visual loss first: the lenses before the
fog (a lens is a small thing high up; the fog is what a valley at first light is about), which is
the order it went in at. Each thins and leaves the thing itself: with both steps on there is still
a lens over every near summit and fog in every basin (the two tests hold them to that). The
`?debug=floor` pictures taken before `e63d72e` do not have them on; `_M2_floor`, from `buildD2`,
does.

## Views on Haven with weather in them (the model, found in Node in seconds)

`scripts/find-weather.mjs --scene` names the hours; the rest was found with the model's own
`cells(t)`, `lenses(t)` and the world's height function (`scratchpad/wx.mjs`,
`cell-behind-ridge.mjs`, `ridge2.mjs`). `t=` is hours from the scene's own moment
(2024-09-22 17:00 UTC, which is 08 h local at the opening place).

| t= | what the model has | where to stand |
| --- | --- | --- |
| −0.5 | mist 267 m deep in the low ground, none within 2 km of the ledge | the ledge, heading 150, pitch −12 |
| 8.25 | five cells; the nearest 64 km off at bearing 243, its top 10.3 km, raining 39 mm/h | the ledge for the far skyline; lat −52.0691, lon 23.3976 at 4.2 km for its portrait with the Sun behind (at that place and hour the Sun stands 26 degrees up at azimuth 308, so looking 120 has it over the shoulder) |
| 33 | a front: four cells, the nearest 25 km off at 274, raining 26 mm/h | the ledge, heading 274 |
| 53 | twelve lenticulars over the high summits; the Crown's own are 229 km off, so the nearest in daylight is at −28.30, 16.09 | lat −30.3666, lon 16.0940 at 3.6 km, heading 0 |

The stub's presets (`?debug=sky:fair` and the rest) are still what the motion and anchoring
checks use: a known, fixed pattern that does not move when A tunes the model. Its fair day peaks
at 0.30 cover over the low country west of the opening place (lat −51.3, lon 46.978) between
t=3 and t=9, with the heaps' bases at 1 250 m and their tops at 2 575.

## What the pictures showed, and what each one changed

1. **The first storm picture** (`haven_ledge_storm12.png`, a cell 12.6 km off whose top stands at
   9.2 km) showed three faults at once, all now fixed (commit 9478d38):
   - the march's stretch was `min(t0, cellEntry)` with `t0 = 1.0` standing for "the ray misses
     the layer", so where it did the march began a metre from the eye;
   - the steps were shared out over the hull of layer and cell alike, so a tower five kilometres
     deep was crossed in two: the ray is now marched in up to three stretches, the cell's with
     its own 6 to 14 steps;
   - the tower was white all over: its cauliflower now takes the two tones from the chord toward
     the Sun at its own surface, and the slate of the whole tower's depth under them.
2. **The same view again** showed the near cloud as a white wall — which is what the stub's storm
   preset is at 3.2 km over that place (0.82 cover, base 2.66 km: the camera was inside the
   layer). The storm portraits are taken from above the heaps instead.
3. **Inside a storm the sky's own light was never dimmed** (commit 5b90f1f): a base with almost
   no Sun on it was still a bright grey. The share of the sky a sample gets is now part of the
   march's one light rule.
4. **The first picture from A's model** (`haven_ledge_M_storm20.png`, a tower 20 km off from
   3 km up) showed two things the stub never could, both fixed in 84398a8:
   - the cell's anvil ended in a **straight line across the sky** — a lid, not a cloud. Its edge
     is now moved by the cirrus strokes themselves (`ANVIL_TORN`), so it frays downwind;
   - the mackerel sky was **an even screen of dots** from horizon to horizon. The cloudlets are
     now thickened and thinned by a coarse look at their own noise (`MID_PATCH`), which comes in
     the place of the finer octave: the same number of reads, patches and lanes instead of a
     screen.
   What the picture got right: the field's own weather fills the sky (the stub never did), the
   tower stands at its true size and distance with the anvil at its top, and the shells sit
   below and above the camera in the right order.
6. **Not one lenticular was drawn** (`haven_ledge_M_lens.png`: a lens 11 km long and 9 km off,
   two degrees above the camera, and an empty sky). Its alpha faded by how far the surface point
   stood from the plate's middle — and seen edge on, which is how one stands under a range and
   looks at them, EVERY pixel is that rim. Each pixel now takes the metres of cloud its own ray
   crosses (the plate is a stretched ball: a quadratic), and the back faces are drawn so that a
   ray always has one, from outside the plate or within it. Checked by hand: from below the ray
   crosses its 286 m of depth, along its length 7 000 m, across the wind 2 600 m (520d0e2).
7. **And the twelve that were in the list were the wrong twelve.** A page probe at that same
   view (`scratchpad/lens-probe.mjs`) found the field handing over twelve lenses and the module
   making twelve plates of them — the nearest of which stood **433 km away**. The model lays its
   dozen over the whole world, by its high summits, and they were taken in the order it gives;
   on a world 250 km in radius the horizon from 3.6 km up is 42 km, so nearly all of them were
   under it, and the one nine kilometres ahead never got a plate. They are sorted by distance
   now, and anything beyond the horizon for its own height is dropped (the check is in
   `scripts/lens-list-test.mjs`).
8. **At the governor's floor the sky had a hole in it** (`haven_ledge_M_floor.png`): a dark ring
   of clear sky in the mackerel field where the tower should have stood. The shells cut
   themselves where a tower passes through — and the tower was never marched. "The volume off
   near the traveller, the cells still marched" asked the LAST frame's cell list, which only
   `render()` sets, and `render()` does not run while the volume is off: it could never start.
   It now asks the cells the sky system has already packed for the shaders this frame, which is
   what the march reads anyway (bd3e9e6). The floor is the picture that found it, which is the
   lesson about looking at `?debug=floor` after adding steps.
9. **Every anvil had a hole in it where its own tower passed through.** The shells are cut where
   a tower stands (the march draws the tower itself, with its own depth), and the high shell is
   where the anvils are drawn — so the cut took the anvil out exactly over the tower that made
   it, and the sheet floated round the stalk. The anvil's cover is worked out before the cut now,
   and where one lies the cut is not made (04c418a).
10. **And every anvil was drawn at the shell's height, not its own.** `cellShape.anvilLevel`
    puts an anvil between 6 700 and 9 500 m by the height of the tower that made it; the high
    shell stands at a flat 9 000. So a small storm's anvil floated two kilometres over its own
    tower — the disc on a stalk. Each anvil's cover is now read where the pixel's own ray
    crosses the sphere IT lies on, so it is drawn where it stands (efad75d). The shell is only
    the surface that carries it.
11. **The anvil from 35 km** (`haven_ledge_M_storm35.png`) was the brightest thing in the frame —
   a smooth cream disc on a stalk, at 209/180/152 against a sky at 71/94/131. Seen from below an
   anvil is grey: 0.45 of its sunlit top became 0.32, and the cirrus strokes now thin and thicken
   the sheet itself, so it is drawn-out ice rather than a plate (225dcd2). What stays, and is not
   mine to fix: it is drawn on the high shell at 9 km, a sheet with no thickness, while the tower
   whose top is at 10.3 km stands below it — so it reads as a disc floating over a stalk. For an
   anvil that grows out of its tower, the flare belongs in the cell's own shape
   (`weather/sky/cellShape.js`) and must be marched with it.
12. **The cell's own outline** (`cellShape.js`, step 0's, not mine) draws a narrow chimney with a
   rounded cap: at 20 km the hull is 25 degrees wide and what is drawn is about 10. A
   cumulonimbus is about as wide as it is tall. Worth a look by whoever owns that file.

## A lesson worth lifting into CLAUDE.md

**`t=` in the game is hours from the SCENE's own moment; the weather's clock counts seconds from
its epoch.** On Haven those differ by 521 hours. A Node scan that asks the producer for `t = H *
3600` is asking about the first day after the epoch, not about the hour the game will show at
`?t=H` — so a view chosen that way can have cloud in Node and none in the game. It cost two
runs of the motion check, both of which then "passed" nothing and failed on a correlation of
zero. The right conversion is
`t_weather = (Date.parse(world.scene.dateUTC) - Date.parse(world.weather.epoch)) / 1000 + H * 3600`
(`scratchpad/wx.mjs` does it), and the same trap is waiting for anyone who writes a stability
case or a benchmark view from a Node scan.

## Open

- **A's model** landed while this was being built, and the owning branch was merged in: the
  pictures now come from the model, at the hours `scripts/find-weather.mjs --scene` names. The
  look's numbers were tuned against the stub's thin test pattern and will want another pass
  against the model's real cover.
- **Anvils**: `field.anvils(t)` came with package A, and the sky system packs them into
  `uAnvils`, so the high shell now draws them — solid where one lies, dark underneath, cirrus
  streaks elsewhere. (The model also paints them into field B's high cover, so the two agree.)
- **The lenses** are drawn now: every snapshot already holds its LENS records, and they stand
  still over the land, so `lenticulars.js` reads them out of the snapshot the field is blending
  when the field has no `lenses(t)` call of its own. **For A**: a `lenses(t)` on the field (as
  `cells(t)`) takes the place of that reading, and the stub's two lenses stand over ground 29 m
  above the sea — the model should put them in the lee of high ground, which is what a standing
  wave needs.
- **Earth** has no field yet (its recipe is `maps`), so there the volume still reads the day's
  cloud map and stands its base over the country smoothed round the traveller, as before. That
  path, and `setGround`, go when A's `fromMaps` lands.
- **The far shell's vertices** now each read the field: an icosphere of detail 48 is 46 080
  triangles, 138 240 vertices not indexed, so 138 240 vertex texture reads a frame. It is still
  one draw call, but it is the first thing to measure on the phone — and the shell could be
  coarser (detail 32 is 61 440 vertices) without the base losing anything it can carry.
- **The far shell on a big world.** Its vertices are displaced to the field's own base, and each
  facet is 0.95 degrees across: **4.2 km on Haven**, which the base varies over gently, but
  **105 km on Earth**, where it does not. On Haven it is right; when Earth gets a field, its
  shell will want either more vertices or a base that does not vary (one for the whole view).
- **The near slices are laid at the distance each begins at** (step 0's scheme, kept): a sheet
  over the whole view at that depth, so ground NEARER than the slice's start hides its cloud and
  ground inside the slice does not. The error is bounded by the slice's width, and only shows
  where cloud stands behind ground at a like distance — on Haven the far near slice runs from
  9 km to the reach at 16 km, and a ridge 14 km off will not hide a heap 15 km beyond it. The far
  cell slices do not have it: they lay each pixel at the distance its ray enters the cell
  (`LAY_FAR`), which is what the brief's sixth check asks for. To put it right for the near
  slices as well, the lay would want the same per-pixel depth, from the distance at which the ray
  enters the layer — but `gl_FragDepth` in that pass costs every pixel of six full-view sheets
  its early depth test, and laying is already 62 ms of the headless work count here. It wants a
  phone's cost table before it is done, not a guess.
- **The field's lists cost a millisecond a frame, and they are not mine.** The model keeps a
  weather moment per exact `t`, and the game's `t` moves on every frame, so every call works a
  whole moment out: measured in Node, `cells(t)` 1.15 ms, `lenses(t)` 3.14 ms, and 0.014 ms for
  a `t` already seen. `skySystem.js` asks `cells(this.t)` and `anvils(this.t)` once a frame.
  Quantising the `t` those lists are asked for (a moment every second or two of game time) would
  give it all back. B's own lens list is already read on a cadence of ten seconds.
- **Haven's clouds from 30 km** (`haven_ledge_M_up30.png`) read as white flecks scattered over the
  land: at that height a pixel is 760 m across and a heap is one to three pixels, while the
  layer's veil — the mean cover that takes over when the heaps are smaller than a pixel — only
  begins at 1 500 m a pixel. It is not wrong (a cumulus field from an aeroplane looks like that),
  but if it reads as confetti on the phone, the veil should begin at about a third of the
  volume's own scale instead.
- **The fog sheet's lattice ends at 30 km** from the traveller, and the question "is there fog
  within reach" is asked over a square 27 km wide: fog that begins between those two is drawn
  only as one comes nearer. At that distance it is behind most of the air's haze, so it has not
  been a problem in any picture; a wider sheet is a straight trade of triangles for reach.
- **`?debug=noclouds` leaves the globe's own cloud map on** (sky/bodies.js: the field's map is
  put aside and the body's own comes back), so a picture of Haven from space with the switch on
  still has painted clouds on it. Nothing in the brief asks for that view, and the switch is for
  pictures of the land from above, so it was left as it is.
- **The painted cut now falls on the rain as well.** The clean edge is cut by all the cloud along
  the line of sight (`ALL` -> `LAY`): a pixel whose total comes to less than 0.18 is erased, which
  is the look's own rule for faint wisps. Until this morning the rain was drawn almost only where
  cloud stood on the same ray, so it rode in on the cloud's total; now that a shaft is drawn
  whole, a LIGHT veil of rain alone (alpha under about 0.2 — virga, the far edge of a shower) is
  cut away by that rule, while a heavy core (alpha near 1) is untouched. To spare it, the march
  would have to hand the rain's share back apart from the cloud's, and its four channels are
  full. Worth a look in `haven_ledge_M_cell9.png` at the shaft's outer edge.
- **A tower still reads as a smooth pill, and its anvil as a plate.** Looking at
  `haven_ledge_M_storm20.png` (20 km) and `haven_ledge_M_storm35.png` (35 km) as pictures rather
  than as checks: the storm is a grey cylinder with a flat cap under a crisp cream disc. The
  cover is right — a map of the view in Node says the lid really is four anvils of 10 km radius
  merged, which is what four storms do — but three things read wrong. The tower's inside is one
  flat tone, because a chord five kilometres deep goes straight to the slate floor
  (`CELL_FLOOR`), so the lit side it should have toward the Sun is lost. Its surface has no
  cauliflower: the erosion noise repeats every 1 900 m, which is two or three lumps across a
  4.5 km tower — too coarse for billows, too fine for an outline. And the anvil's edge is a line
  where it should be fibres. The anvil's underside and grain and the width of its torn edge are
  mine and are now 0.20, 0.30 and 0.42 (`0ae1a83`, the pair is `_M_storm20` against `_M2_storm20`);
  the tower's own shape and its two tones want the next round, and the numbers to try first are
  `CELL_FACE0/1` and `CELL_NOISE` with a finer frequency for the erosion.
- **Scud was not built.** The brief asks for ragged fragments hanging under a raining base; what
  is there is the wisps — the great soft patches torn out of a cloud within a kilometre of the
  eye, which cost no read of their own. A raining base keeps its clean line. Its constant was
  taken out rather than left dead.
- **`?at=haven:3` does not move the camera** for the world one is standing on: it drew the
  opening view at the eye (and, being a ground view with trees, took the full twenty minutes
  doing it). Haven from space is taken with `alt=500000&pitch=-55` instead. Worth a line in
  `CLAUDE.md`, or a guard that says so, for whoever owns `at=`.
- **A stray `peek.png`** (12 KB) sits at the top of the repository: it came in with package C
  and is now in the owning branch. Not mine to delete, but worth sweeping up.
- **The rise's fades** cost one more read of the masses and one of the look toward the Sun (16 %
  of the game clock). The alternative — reading the look toward the Sun at one phase — makes the
  two tones speckle while the phases blend, so it was not taken.

## What is still running (25 November, 09:05)

One browser at a time on this machine, as detached chains in
`/tmp/claude-0/-home-user-what-it-s-best-at/fa086d69-ff44-5069-99a3-fdab3300646a/scratchpad`
(`chainM*.sh`, logs in `logs/`, pictures in `shots/`, frozen builds `buildC1` = this branch as it
was this morning, `buildD2` = this branch merged with the owning head at `e63d72e`, which is where
every picture from the storm cells onward is taken, `buildQ2` = the owning head of this morning,
which is the "before" of the pairs):

| chain | what |
| --- | --- |
| M2 | the reads a step at a storm, and what the clouds cost at the phone's pixel count — the owning head against this branch, at a storm and on a fair day |
| M7 | the motion, the anchoring and the hand-over, under the model's own heaps |
| M5 | the lenses twice, the storm from 20 km again, the cell from 9 km (and the owning head's) |
| M6 | the cell's portrait with the Sun behind it (and the owning head's), the governor's floor again, Haven from 500 km, from 30 km |
| M3 | check 6's ridge pair, and the owner's three weather views at the eye (mist, storm, front) |
| M4 | stability: the climb on the owning head (B0), then the climb, the crossing under heaps and a storm pass on this branch; then `npm run smoke` on a tree |
| M8 | the reads check again, now that it proves its own numbers, and the same with four reads a step put in on purpose (it must fail) |
| M9 | what the rain's fixes cost at the phone's pixel count, against `buildC1`'s 209 / 2 006 ms |
| M10 | four of the brief's pictures that were still missing: the cirrus and the mackerel sky at dusk with the Sun two degrees up (toward it and away — the view that shows check 11's fix), a deck from below, and a storm at night with a stroke held at its brightest |

The pictures of the cells, their rain and the lenses (M5, M6) are taken from `buildD1`: the six
faults of checks 8 to 11 were found while the chains ran, and a picture from `buildC1` would show
a storm with a quarter of its rain missing.

If this machine restarts, the chains die but the builds, the logs and the pictures do not: each
chain is a few lines and starts with `nohup setsid`.
