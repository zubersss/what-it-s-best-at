# Report B: the clouds you see

The helper of `docs/briefs/sky-B-clouds.md`, on branch `ccr-aa39490a-sky-B-clouds`. Kept as the
work goes: the main session reads this file and the branch, not the transcript.

## B0 (the job before the package): step 0's GLSL on a GPU

*(filled in below as each run lands)*

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

**1. The reads a step (`node scripts/cloud-cost.mjs`).** The march is compiled a second time with
`CLOUD_READS`, and every read of the noise and of the field adds one to a running total that the
pixel hands back, so this is the count on real rays. First run, at an air view with no cloud in
it, it read 1 a step; the run at a storm is below. `--break read` puts one more read into the
loop, to see the check fail.

*(the rest as they run)*

## Pictures (paths; before and after)

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
| CELL_LIT / CELL_DEEP | 300 / 2600 m | the chord toward the Sun over which a tower goes from white to dark |
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

## Open

## Asked of the main session

1. **`src/sky/skySystem.js`**, the two stand-ins:
   ```js
   import { UpperClouds } from './upperClouds.js';
   import { FogSheet } from './fogSheet.js';
   // in the constructor:
   this.upper = parts.upper ?? new UpperClouds(renderer);
   this.fog = parts.fog ?? new FogSheet(renderer);
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
