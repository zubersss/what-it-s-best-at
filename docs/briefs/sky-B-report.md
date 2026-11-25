# Report B: the clouds you see

The helper of `docs/briefs/sky-B-clouds.md`, on branch `ccr-aa39490a-sky-B-clouds`. Kept as the
work goes: the main session reads this file and the branch, not the transcript.

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
out, is queued to say whether the clouds are what keeps it moving.

## What was built

### The march (src/sky/cloudVolume.js)

- **The cloud comes from the field.** One read of map A at every step gives the heap cover, the
  sheet cover, the base and the sheet's thickness AT THAT PLACE. `place()`'s country-smoothing and
  `setGround()` are gone, with the lift and the frame drift: the base is a thing of the place.
- **One rule for the shapes.** `sky/skyGlsl.js` now holds the forms the cover is cut into
  (`skyHeapTop`, `skyHeapBody`, `skyHeapAt`, `skySheetAt`, `skyEdgeEat`, `skyFormQ`, and
  `skyLowAt`, which is all of them from one read). The volume marches them, the far shell reads
  them where the masses are widest, and C's shade atlas follows them toward the Sun.
- **Reads a step**: field A, the masses and the lobes (one read: the noise's two channels), and
  the look toward the Sun — 3, plus the wisps within a kilometre of the eye, and one more for
  each of the two noise reads while the rise crosses its wrap. Per ray: field B once (the Sun the
  mid and high layers leave), field C once and A and B twice more where there are rain shafts.
- **Bounds** from the field within reach (nine places, snapped to 250 m with hysteresis): they
  only shorten the march, and no value of a cloud comes from them.
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
- **Rain shafts** below the raining base: the cells' chords and the field's rain under decks,
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
  or below the camera by their height. 1 read where the sky is clear (then the pixel is thrown
  out), 2–3 where there is cloud.
- `FogSheet`: 129 x 129 points over 60 km on a lattice fixed to the world, each lifted to field
  C's fog top, depth-tested, one noise read a pixel.

## Checks (each with its numbers, and how it was seen to fail)

**4. A phone's limits (`scripts/cloud-cost.mjs`, which runs `lib/glLimits.mjs` on every program
three has linked).** Every program of the sky is inside them:

| program | textures (fragment + vertex) | varyings |
| --- | --- | --- |
| the march | 11 + 0 | 1 |
| the far low shell | 9 + 2 (field A in its vertex shader) | 1 |
| the mid and high shells | 8 + 0 | 1 |
| the fog sheet | 7 + 0 | 1 |
| the far cell sheets | 2 + 0 | 1 |
| (the ground, for scale) | 16 + 13 | 14 |

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

**2. The motion (`node scripts/cloud-motion.mjs`).** Its first run showed a fault of its own: the
view looked ALONG the day's wind, so the clouds came toward the eye and the picture moved one
pixel in twenty seconds — nothing to measure. It looks across the wind now.

**1. The reads a step (`node scripts/cloud-cost.mjs`).** The march is compiled a second time with
`CLOUD_READS`, and every read of the noise and of the field adds one to a running total that the
pixel hands back, so this is the count on real rays. First run, at an air view with no cloud in
it, it read 1 a step; the run at a storm is below. `--break read` puts one more read into the
loop, to see the check fail.

**6. The hand-over at 16 km, where the near slices give way to the two far ones** (in
`cloud-motion.mjs`): a cell is looked at from 15.0, 15.8, 16.2 and 17.0 km and the cover and the
light it shows are compared; the step across the hand-over must be no larger than the steps
either side. Its first run drew the SAME picture four times (34 007 pixels, cover 0.845, light
0.439, to four decimals) and passed: it moved rig.pos but not the camera the shaders read. It
now moves that uniform and fails if the four pictures are identical.

*(the rest as they run)*

## Pictures (paths; before and after)

All at 880 x 412, dsf 1.25, from frozen builds, in
`/tmp/claude-0/-home-user-what-it-s-best-at/fa086d69-ff44-5069-99a3-fdab3300646a/scratchpad/shots/`
(the ones worth keeping are copied into `docs/shots/sky/`).

**Before and after.** Since package A landed, "before" is the owning branch's own head
(`ccr-aa39490a-qiw63x`, built as `buildQ`) and "after" is this branch (`buildB6`, with the four
lines of "Asked of the main session" patched in). The same query goes to both, with
`debug=sky:model` so that each uses the world's own weather: the only difference is package B.
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
| `_M_front` | the opening place, a cell 25 km off raining 26 mm/h (t=33) | a rain deck and its shafts |
| `earth_ledge_B0_earth.png`, `earth_ledge_B_earth.png` | Earth's ledge, step 0's build and this one | Earth has no field yet: what changed there anyway |

**The stub's own pictures** (before the model landed) are kept for the record:
`haven_ledge_storm12.png` (the first storm picture, which showed the three faults of 9478d38),
`haven_ledge_tower8.png` (a cell 8 km off), `haven_ledge_B0_noon*.png` (B0's pair),
`haven_ledge_fair_air.png`.

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
| SCUD | 400 m | how far under a raining base ragged scud hangs |
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

**`FOG_LOOK` (src/sky/fogSheet.js)**: SPAN 60 km, N 129, EDGE 40 m, LUMP 900 m, LIFT 18 m,
ALPHA 0.97, BRIGHT 1.06.

**`LENS_LOOK` (src/sky/lenticulars.js)**: MAX 12 plates, FLAT 0.11, GAP 1.35, SHADE 0.66,
RIM 0.35, EDGE 0.22.

## Cost (headless work counts; the phone decides)

What is paid for a fair day, and what a storm adds, counted on software WebGL by
`scripts/cloud-cost.mjs` (a count of work, never a frame rate; the same view on step 0's build
and on this one, at the phone's pixel count):

*(the numbers land as the runs finish)*

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


## Asked of the main session

1. **`src/sky/skySystem.js`**, the three stand-ins:
   ```js
   import { UpperClouds } from './upperClouds.js';
   import { FogSheet } from './fogSheet.js';
   import { Lenticulars } from './lenticulars.js';
   // in the constructor:
   this.upper = parts.upper ?? new UpperClouds(renderer);
   this.fog = parts.fog ?? new FogSheet(renderer);
   this.lenses = parts.lenses ?? new Lenticulars(renderer);
   ```
2. **The field always on** for a world whose weather is made by rule, now that the volume, the
   shell, the shells above and the fog all draw from it:
   ```js
   this.fieldWanted = made && !this.noClouds;      // (was: && (d.preset || d.storm || d.flash))
   ```
   Without it Haven draws no volume cloud at all except under `?debug=sky:...`.
3. **`beforeScene`**: the volume's bounds come from the field, so `place()` needs the frame:
   ```js
   this.cloudVolume.place(rig.pos, this.frame);    // (was: place(rig.pos))
   ```
   (It keeps the last frame's own otherwise, so nothing breaks before the change.)

## Views on Haven with weather in them (the stub's presets; Node, seconds)

`node /tmp/.../scan2.mjs` over a 120 km box round the opening place (the stub is a test pattern,
so its weather is not the model's; these are the hours where there is something to look at):

| preset | hour (t=) | what |
| --- | --- | --- |
| `sky:fair` | 13–14 | heaps over the high ground, cover to 0.93, bases 2.9–3.0 km |
| `sky:fair` | 0–2 | a few heaps, cover to 0.6 over low ground (bases 0.9 km) |
| `sky:front` | 13–14 | a whole rain deck: mean cover 0.53, 6 mm/h, base 0.6–1.7 km, top 5–7 km |
| `sky:storm` | any | 5–6 cells within 60 km, cover to 0.98 |
| `debug=storm` | any | one mature cell 8 km north-east of where the view opens |

At the scene's own hour (t=0) the stub's fair preset has almost no cloud at the opening place
(cover 0.02–0.13), so a picture taken there shows an empty sky: that is the test pattern, not the
renderer. A's model paints the real cover.

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
5. **The cell's own outline** (`cellShape.js`, step 0's, not mine) draws a narrow chimney with a
   rounded cap: at 20 km the hull is 25 degrees wide and what is drawn is about 10. A
   cumulonimbus is about as wide as it is tall. Worth a look by whoever owns that file.

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
- **The far shell's vertices** now each read the field (an icosphere of detail 48: about 144 000
  vertex reads a frame). It is one draw call, but it is the first thing to measure on the phone.
- **The far shell on a big world.** Its vertices are displaced to the field's own base, and an
  icosphere of detail 48 has facets about 2 degrees across: 85 m on Haven, but 220 km on Earth,
  where the base varies over 15 km. On Haven it is right; when Earth gets a field, its shell will
  want either more vertices or a base that does not vary (one for the whole view).
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
- **The rise's fades** cost one more read of the masses and one of the look toward the Sun (16 %
  of the game clock). The alternative — reading the look toward the Sun at one phase — makes the
  two tones speckle while the phases blend, so it was not taken.
