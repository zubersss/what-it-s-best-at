# Brief B: the clouds you see (kinds in the volume, storm cells near and far, rain shafts, upper shells, fog, lenses, the globe)

Read `docs/briefs/sky-step0.md` first (what stands, the rules for every package), then
the plan (`docs/briefs/clouds-weather-plan.md`): "The kinds of cloud" (all nine),
"RAIN COMES OUT OF THE CLOUD ABOVE" (1, the shafts), "DARK STORMS" (1, in the march),
"FRAME ORDER", "2. THE VOLUME" and "3. SHELLS" under "Rendering and cost", and "### B."
under "Work packages", which is your job, its files, its checks and its pictures. Branch
`sky-B` from the head of the main session's branch. Report: `docs/briefs/sky-B-report.md`.
You own `src/sky/skyGlsl.js` from now on (keep `skyShade` and `skyShadeLight`'s signatures:
package C builds on them).

## The interfaces you build behind (src/sky/skySystem.js; do not edit it)

- **The volume** (`cloudVolume.js`): `render(post, rig, time, layer, wind, weather, sky)` —
  `sky` is the sky's frame: `t`, `noiseT`, `steer`, `field`, `here`, `cells` (in reach,
  nearest first), `strikes`. `lay(near, far, rig)` lays the near slices; **`layFar(c)`**
  is the slot for the far cell sheets (called first in the picture, before the shells
  above; `c.sky` is the frame); `setBolts(list)` is the uBolt setter (up to `BOLTS` = 2
  of `{ pos: [x, y, z] planet axes, power }`, from package D through the sky system; step
  0's march takes the first: light both). `saving(id, off)`, `live(id)`, `has(id)` for
  `rain-shafts`; `partOut(id, out)` and `has(id)` for the benchmark's `cells-far` and
  `rain-shafts`. `steps` (36 / 22 under `cloud-steps`), `enabled` (off under
  `cloud-volume`: the field's heaps go to the shell, the cells are still marched).
- **The shells** (`upper`, today a stand-in in the sky system): one module with
  `update(c)` (before the main picture), `draw(c, 'above')` and `draw(c, 'below')` (the
  sky system calls them in the plan's order, by the camera's height is yours to decide
  inside), `saving('cloud-upper', off)`, `live`, `has`, `partOut('cloud-upper', out)`.
  Hand the main session its constructor line; the sky system's `parts.upper` takes it.
- **The fog sheet** (`fog`) and **the lenses** (`lenses`): the same interface; `fog` has
  the benchmark part `fog`.
- **The far low shell** (`clouds.js`) is drawn by the sky system in `shellScene`, after the
  shells above the camera and before the fog, only while the near scene is drawn.
- What you read, filled every frame in `SKY_UNIFORMS` (`skyGlsl.js`): `uCloudSteer` (low)
  and every layer's `uSteerInv/uSteerSpin/uSteerRise` (`STEER_GLSL`: `steerMid`,
  `steerHigh`, `steerCell`, `steerWind*`); `uCloudRise` (the rise); `uCells`/`uCellCount`
  (the nearest 8 cells, `CELL_GLSL`) and `uAnvils`/`uAnvilCount` (`ANVIL_GLSL`); the field
  `tWxA/B/C` and `uSkyLow` (`SKY_FIELD_GLSL`). Bind the very objects (`uX: SKY_UNIFORMS.uX`);
  never replace them. Declare them only through the guarded texts.

## What step 0 left for you

- **The rise is in**: `skyLowNoise` (two phases, one read outside the fades) is the masses'
  noise for the volume, the shell and every shadow; the lobes and wisps go with the wind
  alone. Keep it the one rule; `scripts/sky-system-test.mjs` checks it (check 14).
- **Earth's storms**: the old drift at the storm wind's speed and the thirteen-times
  turn-over are gone (they hung on the weather at the traveller). Your cells boil in their
  own moving frame at 3 to 8 m/s: that is where a storm's life comes back, Earth's included
  (the plan's "EARTH": its cells come from its maps through package A).
- `place()` (a base that follows the traveller's country) and `setGround()` are still in
  the volume: the plan deletes them; the base comes from field A.
- The march today reads 6 to 7 textures a step; the plan's budget is 4 (`cloud-cost.mjs`).
- Nothing of step 0 has been compiled by a GPU yet: your first headless picture is that
  test. Look for a shader error in the console before judging anything, and run `glLimits`.

## Checks and pictures

The plan's six checks and its list of pictures (a before/after pair of the ledge at noon
first). Add the stability cases `haven_cross` and `haven_storm_pass` to
`scripts/stability.mjs`, and `scripts/cloud-motion.mjs`. Look numbers (heights, tints,
darkness, shaft strength) as defaults in your files and listed in the report.
