# Report C: cloud shadows and the light under them

*Package C of `docs/briefs/clouds-weather-plan.md`, brief `docs/briefs/sky-C-shade.md`. Branch:
`ccr-aa39490a-sky-C-shade`.*

## What was built

**One cloud-shade atlas fixed to the world (`src/sky/cloudShade.js`), read by everything that is
lit.** It takes the place of the trees' shade map (`src/life/treeShade.js`, now four lines that
hand on its names), of the ground's own per-pixel cloud rule, and of the far rocks' own reads.

- **The atlas**: one RGBA8 texture 1024 x 768 (3 MB), three windows in it.
  - the **world window**, 1024 x 512 in latitude and longitude (1.53 km a texel on Haven), a
    sixteenth of its rows a frame (whole above x60 of the clock, and in a picture);
  - the **near window**, 256 x 256 at 55 m (14 km across), drawn whole every frame;
  - the **middle window**, 256 x 256 at 220 m (56 km across), drawn whole every frame.
  - Each texel is a point on the sphere R + 2 500 m. Channels: **R** the raw shade of the low
    cloud along the ray toward the Sun (the value whose crisp curve is the share of the Sun
    taken: readers apply the curve, so an edge stays sharp although the map is coarse), **G** the
    Sun through the mid and high layers, **B** the sky's light left, **A** the top of the low
    cloud along that ray (so a peak above a deck or above fog keeps its sunlight).
  - Where a world's weather is made by rule (the field) the channels are the shared rule's
    `skyShade()`, with **fog** from field C (an optical depth along the ray) and the **exact
    chord of every storm tower** the ray crosses (`cellLight`, with a cheap reject first, so a
    cell costs nothing where its shadow cannot fall). Where there is no field yet they are the
    rule the game draws with (the day's cloud map and the heaps carved from the noise), so every
    world looks as it did. One writer either way.
- **The lattice.** The two windows lie on one tangent frame, anchored at a fixed world point,
  kept until the traveller is 2 km from it, and each window's first texel snapped to that
  frame's own lattice. A fixed place therefore keeps the very same texel however the traveller
  moves, and reads the very same byte.
  - **Two departures from the plan, both measured.** (a) *One* frame serves both windows, where
    the plan had two anchors 20 km and 80 km apart: a second anchor 80 km away would stretch the
    middle window's lattice by 2.5 % at a re-anchor (the `x D / R` term a small world shows),
    where one anchor held for 2 km stretches both by about 0.03 %. (b) The anchor is held for
    2 km, not 10-20 km, and at a re-anchor **the axes and the lattice's phase are carried over**
    (the new lattice is laid through the world point the old one held under the traveller).
    Without the carry-over a re-anchor turned the whole lattice by the meridians' convergence
    (3.5 degrees over 11 km at latitude 54) and slid shadow edges by a texel and more; with it a
    re-anchor moves the grid by 0.07 texels (near) and 0.23 texels (middle), and the shade at a
    fixed place by 0.005 at the 95th of 600 places.
- **The readers.** `cloudShadeLight(rel)` gives the share of the Sun's light and of the sky's at
  a place `rel` metres from the camera; `cloudShade(rel)` the Sun's alone, the name the trees,
  the far forest and the far grass already read by (so `trees.js`, `farForest.js`, `grass.js` and
  `treeLod.js` are untouched). One texture read, two inside a window's blend band. It takes the
  Sun's ray to the reference sphere **exactly** (the sphere's own quadratic), where the ground
  slid along a level plane: 699 m out at 2 km over the sphere with the Sun 15 degrees up.
  - the near ground at its vertices (`vCloud.xy`), the far ground per pixel;
  - the far ground's `0.5 x mean-cover` path is gone, and so is the ground's heap rule;
  - the far rocks: one sampler where there were two (`SUN_VERT` is now one line);
  - **the ground's fragment shader: 15 of 16 textures** (`tClouds` and `tCloudNoise` out,
    `tCloudShade` in), its vertex shader at its count (`tCloudShade` and the field's wet map in
    their place).
- **The probe** (`ShadeProbe`): three texels (the traveller - the figure's soles on foot, the
  figure itself in flight -, the camera, and the lander when one is handed over), drawn after the
  atlas into a 3 x 1 target and read back with `readRenderTargetPixelsAsync` as the exposure
  meter's is; read synchronously in a picture, so the figure is shaded in the first frame. Its
  value eases, so the figure never jumps from light to shade. It feeds `G.uWeather.x` and `.y`,
  by which the figure, the near rocks, the lander, the leaves, the dust and the grass within
  30 m are lit: **on a world without Earth's weather maps those were always 1, so they stood in
  full Sun inside a cloud's shadow.**
- **Wet per place**: the ground's vertex shader reads the field's wet map (`cloudWet`) into
  `vCloud.z`, in the place of `uWeather.z`, which was one number for the whole world. Without a
  field it is that number, as before.
- **The savings**: `cloud-shade-coarse` (the near window not drawn; readers take the middle one
  at 220 m, so the shadows stay and the figure stays shaded) and `cloud-shade-rate` (the middle
  window every other frame). Both answer `live` and `has`; `partOut('cloud-shade')` already
  reaches the atlas through `clouds.shadow.x`, which `SkySystem.beforeScene` zeroes for the part
  and for `debug=noclouds`, so no cloud casts a shadow anywhere and nothing is shaded by one.

## Checks (each with its numbers, and how it was seen to fail)

`node scripts/cloud-shade-test.mjs` (90 s, no browser): 16 checks, exit 1 on any failure. It
replays **two** addressings side by side - the atlas's and the trees' shade map as it was - over
a made-up sky with the heaps' own scales in it, and every check is measured for both. The
checks that read "the map as it was fails this" stay in the test for good: they are how each
check was seen to fail, and they go on guarding against a return to a map that follows the
traveller. `--break nosnap | hold | noband | probe` puts one fault in to see its checks fail.

| | check | the atlas | as it was |
| --- | --- | --- | --- |
| 1a | walking 2 km in 1 m steps, the shade at 24 fixed ground points | **0.0000** (<= 1/255), and the lattice under them does not move at all (0 texels) | **0.345** |
| 1b | flying 30 km in 100 m steps, the shade at 40 fixed places, a step at a time | **0.0000** while one window holds it; **0.014** inside a blend band (<= 0.03) | **0.396** a step |
| 2 | a re-anchor (after 3 km of flight) | the grid moves **0.07** texels (near), **0.23** (middle) (<= 0.25); the shade at fixed places **0.005** at the 95th of 600, mean 0.002, worst 0.018 (<= 0.02) | - |
| 2 | a fixed place left behind by the near window, the traveller walking 10 km away 20 m a step | **0.0000** a step (<= 0.03); 0.222 read near, 0.221 from the middle window | - |
| 3 | the texel the reader asks for, 2 km over the sphere with the Sun 15 degrees up | **0.00 m** from the Sun's ray through the place (<= 5 m) | the flat slide: **699 m** |
| 3 | a reader above the low cloud's top | takes only the Sun through the mid and high layers (40/40) | no such channel |
| 4 | the figure's probe against the ground's own texel | **0.0000** at 120 places | the figure was at 1.0 |
| 4 | the ground, a crown 30 m up and a far rock where the sky over them is the same | **0.007** at the 95th of 166, worst 0.012 (<= 0.03); the atlas is within 0.012 of the shade worked out at the place itself | - |
| 4 | the figure inside a cloud's shadow | **0.56 darker** than full Sun on the mean of 120 places | 1.0 everywhere |
| 5 | the reader's GLSL against its JS twin, 200 places out to 120 km | **5.7e-5** | - |
| 6 | the ground, the trees' shade and the far rocks | read the one atlas; none works the cloud rule out again | each worked it out itself |

A crown 30 m up is lit through another part of the cloud (64 m along the Sun's ray at 25
degrees), so check 4 asks what the brief means rather than what it says: where the true shade at
two of the four places is the same, no reader may add a disagreement of its own.

**Also green**: `./scripts/build-check.sh`, `node scripts/sky-system-test.mjs` (79 ok),
`sky-steer-test` (34), `sky-format-test` (47), `sky-cell-test` (31), `governor-sim`,
`far-ground-test`, `shadow-fine-rocks-test`, `far-tree-shade-test`.

## Pictures (paths; before and after)

*(to follow)*

## Numbers for src/worlds/haven.js

Nothing has to change in `haven.js`. The numbers the atlas works by are in `SHADE`
(`src/sky/cloudShade.js`) and in `SKY_V0` (`src/sky/skyGlsl.js`, B's), not in the world file.
The world's own `clouds.shadow` (0.85) is still how dark a full shadow is, and is still the one
flag that says a cloud casts a shadow at all.

## Cost (headless work counts; the phone decides)

*(to follow)*

## Open

- **The atlas's live flag is the cloud map's.** It draws while `clouds.shadow.x > 0`, which the
  shell sets only once a world's cloud map has loaded. When Haven drops
  `haven_clouds_4096.jpg` (package A), that flag must come from the field instead, or Haven
  loses every cloud shadow. One line in `skySystem.js` or a setter here; see below.
- The ground's **sky light** still takes the traveller's own `uWeather.y` (the probe's), not the
  atlas's B channel per place: the shared lighting chunk applies `uWeather.y` to every surface,
  and a second factor would count it twice. The channel is read (it is what the probe hands to
  `uWeather.y`), but the land far off under a storm is dimmed by the Sun's share alone until
  someone takes the sky's share through the lighting chunk.
- Fog's top is folded into channel A together with the low cloud's top (`max`): where fog and a
  low deck stand over the same place, a thing above the fog but under the deck gets the fog's
  share of shade as well. Fog is rare under a deck; it is an approximation, written down.

## Asked of the main session

1. **The probe in the frame order.** It is built inside the shade map
   (`cloudShade.probe`) and writes `G.uWeather.x/.y` itself once it has a value, so it works
   today without any change. To put it where the plan has it, in `SkySystem`'s constructor:
   ```js
   this.probe = parts.probe ?? this.treeShade.probe ?? stubPart('probe');
   ```
   Both paths then write the same value (the probe is one object). With it, `SkySystem.busy`
   waits for the probe as step 0 intended, and `partOut('cloud-shade')` reaches it.
2. **The lander's texel.** The probe's third place is the lander where `beforeScene`'s `c` carries
   one: add `lander: <the lander's planet-fixed position or null>` to that context and it is read.
3. **The constructor lines** (no change needed now; for when the names are tidied):
   ```js
   import { CloudShade, ShadeProbe } from './cloudShade.js';
   this.treeShade = parts.treeShade ?? new CloudShade(terrain);   // today: new TreeShade(terrain), the same class
   ```
4. **`scripts/sky-system-test.mjs`, its check 2** was changed here, in the same commit as the
   thing it checks (step 0's rule): its `readers` are now the atlas, the shell and the volume
   (the three that read the cloud rule), and the ground, the trees' shade and the far rocks are
   checked the other way about - that they read `tCloudShade` and work no heap out themselves.
   79 ok as before. Please keep that shape if you re-touch the file.
5. **The `shadeedge` bookmark** for `src/worlds/haven.js`: *(to follow with the pictures)*.
6. The governor's two steps need no wiring: they already go through `treeShade.saving/live/has`.
