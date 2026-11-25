# Haven's sky, step 0: what stands, for the four packages

The common part of the four briefs (`sky-A-model.md`, `sky-B-clouds.md`, `sky-C-shade.md`,
`sky-D-storm.md`). Read it with your own brief. The plan is
`docs/briefs/clouds-weather-plan.md`; step 0 is its section "STEP 0, BY THE MAIN SESSION
BEFORE ANY HELPER STARTS", built on the branch `sky0/join` and merged into the main
session's branch. **Start from the head of the main session's branch**
(`origin/ccr-aa39490a-qiw63x`), never from `main` (a worktree begins from `main`: check out
the session branch's head first), on a branch of your own (`ccr-aa39490a-sky-A-model`,
`ccr-aa39490a-sky-B-clouds`, `ccr-aa39490a-sky-C-shade`, `ccr-aa39490a-sky-D-storm`).

## Read first

1. `CLAUDE.md`, all of it (the hard-won lessons bite here: GLSL reserved words, backticks
   in GLSL comments, 16 textures a shader, nothing that hangs on where the traveller
   stands, anything moving with the wind added up or a closed form, a test that cannot
   fail, one rule in one place).
2. The plan: "SPINE AND GRAFTS", "WHAT THE OWNER WILL SEE", "THE SEVEN PARTS", "CORRECTIONS
   TO THE THREE DESIGNS", "STEP 0", your package's section, "DETERMINISM AND THE
   TRAVELLER", "FRAME ORDER", the cost sections and the two readers' maps at its end.
3. `docs/ARCHITECTURE.md`: "Frame order", "Clouds with depth", "Weather".
4. The top of `src/sky/skySystem.js`: the frame, the sky's frame and every part's interface.

## The names that stand

Where the plan and the code differ, the code's names stand:

| What | Where | Notes |
| --- | --- | --- |
| The steering | `src/weather/sky/steer.js` | `Steer` (`t(ms)`, `motion(layer, t, M)`, `inverse`, `carry`, `wind`, `windAt`, `omega`, `speed`, `rise`, `risePhases`, `uniforms`), `STEER_GLSL` (every layer: `steerLow` .. `steerCell`, `steerLowA/B`, `steerWind*`), `RISE` (the rise's period 4 200 m and fade 8 %), `riseWeight`, `makeSteerUniforms` |
| The snapshot's format | `src/weather/sky/format.js` | `fieldLayout`, `ENC`, `enc`, `dec`, `putA/B/C`, `fieldAt`, `makeSkyAt` (the at() record), `CELL` (a cell record), `cellLife`, `LENS`, `FIELD_GLSL` (`wxRead`, `wxHeap` ..), `glslOnce` (the guard every shared GLSL text is made with), `SNAP_STEP` 120 s, `STRIPS` 16 |
| A storm cell's shape | `src/weather/sky/cellShape.js` | `cellGeometry(state, R)`, `cellDensity`, `cellChord`, `cellLight`, `cellRain`, `cellShaftChord`, `cellFootprint`, `anvilGeometry`, `CELL_GLSL`, `ANVIL_GLSL`, `packCells`, `setCellUniforms`, `CELL_MAX` 8 |
| The test pattern | `src/weather/sky/stub.js` | `createSkyStub`: `snapshot(t)`, `at(place, t, out)`, `cells(t)`, `strikes(t0, t1)`, `records`; presets `fair`, `fog`, `storm`, `front` |
| What makes the snapshots | `src/weather/sky/producer.js` | `makeProducer(opts)`: the stub today; package A puts its model here (the page and the worker keep calling `makeProducer`) |
| The worker | `src/weather/sky/skyWorker.js` | the plan's name and place; `{ kind: 'init', id, opts }`, `{ kind: 'snap', id, t }` |
| The field | `src/sky/skyField.js` | `SkyField`: `setWorld(world, opts or null)` (null ends the worker), `update(t)`, `on`, `busy`, `at`, `cells`, `strikes`, `anvils?`, `textures`; the 'now' maps are `SKY_UNIFORMS.tWxA/B/C` |
| The shared shader rule | `src/sky/skyGlsl.js` | `HEAP_GLSL` (`cloudHeap`, its `vol` a vec4 whose w is the rise), `FAIR_GLSL`, `SKY_STEER_GLSL` (`skyToLow`), `SKY_RISE_GLSL` (`skyLowNoise`, `skyRiseWeight`), `SKY_FIELD_GLSL` (`skyLow`, `skyLowDensity`, `skyShade(p, toSun)`, `skyShadeCrisp`, `skyShadeLight(s, h)`: their signatures are fixed), the guarded uniform texts (`SKY_STEER_UNIFORM_GLSL`, `SKY_NOISE_UNIFORM_GLSL`, `SKY_RISE_UNIFORM_GLSL`, `SKY_FIELD_UNIFORMS_GLSL`), the JS twins, `SKY_UNIFORMS` |
| The frame order | `src/sky/skySystem.js` | `SkySystem`: `weatherStep`, `beforeScene`, `groundUniforms`, `afterGround`, `drawWeather`; `frame`; `SKY_SAVINGS`, `SKY_PARTS`, `NOISE_RATE_MAX`, `STRIKE_REACH`, `CELL_REACH` |

## What step 0 already does

- The clouds go with the day's low wind on the game clock (`uCloudSteer`), and the masses
  rise through the layer at 0.5 m/s (`uCloudRise`, `skyLowNoise`): heaps grow and fade in
  place. The volume, the far shell, the ground, the trees' shade map and the far rocks all
  read the noise this way. Every layer's steering (`uSteerInv`, `uSteerSpin`, `uSteerRise`)
  and the nearest 8 cells in reach (`uCells`, `uCellCount`; `uAnvils` from `field.anvils`)
  are filled into `SKY_UNIFORMS` every frame, whether or not anything reads them.
- The sky's frame (`SkySystem.frame`): `t`, `tPrev`, `noiseT`, `rate`, `paused`, `steer`,
  `rise`, `field`, `here` (at() at the traveller), `cells` (in reach, nearest first, with
  `dist`), `strikes` (since the last frame within 60 km, with `pos` and `dist`), `world`,
  `R`, `noClouds`, `shotMode`. Every part gets it (`c.sky`, or the last argument).
- The field exists on Haven only under `?debug=sky:<preset>`, `storm` or `flash`; nothing on
  screen reads it yet. Once a package draws from it, the main session makes it always on.
- Every shared GLSL text is guarded: a shader may take the shared rule and the field's rule
  and the cells' and gets each name once. Declare the shared uniforms only through the
  guarded texts, never by a line of your own (`scripts/sky-system-test.mjs` checks).
- The governor's ladder has the plan's four new steps (`cloud-upper`, `rain-shafts`,
  `cloud-shade-rate`, `cloud-shade-coarse`) wired to the sky's setters; they are passed by
  while the part behind them is a stand-in (`live` and `has` are the part's). The
  benchmark measures a part (`PARTS_OUT`) or a saving only where `has` says it is built.
- The benchmark's route runs on a pinned clock (x1, running), each stop at its bookmark's
  moment; a cost view may carry an hour (`timeOffsetHours`) and the clock is held while it
  is measured.

## What step 0 has not done (and who does)

- **Nothing of it has run in a real GL yet.** This workflow had no browser. Before step 0
  goes to `main` the main session runs `npm run smoke` (with `glLimits`), the ledge pair,
  the `haven_climb` stability case and a x60 time-lapse from a frozen build. Your first
  picture is also the first proof that your shaders compile: look at the console for a
  shader error before anything else, and run `glLimits` (smoke, or any `shots.mjs` run).
- Earth's storms no longer race (55 m/s) or turn over thirteen times as fast: the storm's
  noise now moves with the steering like every cloud's. Package B's cells boil in their
  own frame (3 to 8 m/s); until they land Earth's storms are slower than before. Listed at
  the checkpoint.
- `debug=noclouds` takes every cloud and all it does, the rain included; each package
  keeps that true for its own parts.

## Rules for every package

- **Do not edit** `src/app.js`, `src/sky/skySystem.js`, `src/perf/governor.js`,
  `src/perf/benchmark.js`, `CLAUDE.md`, or another package's files. What you need there
  that is not in an interface above: write it in your report under "Asked of the main
  session", and say it in a short message. Look numbers go into your report; the main
  session moves them into `src/worlds/haven.js`.
- Code under `src/weather/sky/` imports neither three nor the DOM and uses no Math.random:
  everything is a function of (seed, date, hour, place), never of the traveller.
- Where JS and GLSL must agree, the GLSL is made from the same constants and a Node test
  compares them (`scripts/lib/glslRun.mjs` runs GLSL text in 32-bit floats; it knows the
  guards, and refuses a name defined twice as a GPU would).
- Every new script imports from the repository by relative paths, exits non-zero on any
  failure, and is seen to fail once with the fault it guards put in.
- Keep green: `./scripts/build-check.sh`, `node scripts/sky-system-test.mjs`,
  `sky-steer-test.mjs`, `sky-format-test.mjs`, `sky-cell-test.mjs`,
  `node scripts/governor-sim.mjs`. If an interface must change, the step-0 test that
  checks it changes in the same commit, in the main session.
- One headless browser at a time on a machine; long runs from a frozen build
  (`--distdir`), detached, writing a line to a log when each step is done.
- Merge the other packages' branches as soon as they build, so every later picture is of
  the combination.
- Your report (`docs/briefs/sky-<X>-report.md`, beside your brief): what was built, each
  check with its numbers and how it was seen to fail, the pictures (paths), the look
  numbers for `haven.js`, cost (headless work counts only; the phone decides), what is
  open, and what is asked of the main session.
