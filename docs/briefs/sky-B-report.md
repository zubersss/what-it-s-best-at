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

*(filled in as they run)*

## Pictures (paths; before and after)

## Numbers for src/worlds/haven.js

The look's numbers are `CLOUD_LOOK` in `src/sky/cloudVolume.js`, `UPPER_LOOK` in
`src/sky/upperClouds.js` and `FOG_LOOK` in `src/sky/fogSheet.js`, and the shapes' numbers are
`CLOUD_RULE` in `src/sky/skyGlsl.js`. They are defaults in those files; the main session moves
whichever the world should pin into `src/worlds/haven.js`.

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
