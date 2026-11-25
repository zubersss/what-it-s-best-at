# Brief B: the clouds you see (kinds in the volume, storm cells near and far, rain shafts, upper shells, fog, lenses, the globe)

You build package B of the sky plan (`docs/briefs/clouds-weather-plan.md`): everything of a
cloud that is drawn. A makes the field you read (until it lands, step 0's stub stands in for
it). C makes the cloud shade map on top of your shared shader rule. D makes the rain at the
eye, the strokes and the thunder, and lights your cells from inside through the uBolt setter.

Branch: `ccr-aa39490a-sky-B-clouds`, begun from `origin/ccr-aa39490a-qiw63x` (a worktree
begins from `main`: check out that head first). That head holds step 0. If
`src/sky/skySystem.js` is not there, stop and tell the owning session. Report:
`docs/briefs/sky-B-report.md`, beside this file (its headings are there already).

## The owner's words

With the tenth phone results (2026-11-25): "the clouds need a lot of work still: I want them
to move like real clouds and be around areas where real clouds will most likely be found,
like near the mountains; they should also have multiple different kinds of clouds like in
real life, from high altitude ones to low storm-carrying dark clouds; they should move with
the wind at different speeds based on the wind speed on a certain day; they should also have
actual rain coming out of them when it's time to rain; the thunder clouds should be much
darker and stormy looking, with lightning and thunder."

Your part of it: the nine kinds as one sees them, high and low; towers that are dark and
stormy; rain you can see falling out of a cloud; clouds that move as real ones do. And the
look the owner chose (CLAUDE.md, "Look"): few colours, two tones, clean edges, shade that is
coloured and never black.

## Read first

1. `CLAUDE.md`, all of it. These lessons bite here: the clouds "moved when I moved" four
   times over (layers of distance from the eye, one rule for the whole line of sight, the same
   thing far as near); 16 textures and 15 varyings a shader on the phone (`glLimits`);
   GLSL reserved words; a backtick in a GLSL comment; nothing leaves the main picture between
   its clear and its last draw, and its depth is never a texture (the volume once ran every
   world at 15 fps); a small pass uses `gl_FragCoord` only for its own texels, and its target
   is made once at its largest size; a cover set on one level of a 3-D noise is not the
   sky's cover (judge from above and from below); a change that puts something everywhere is
   looked at where the ground is high; a look tuned in one place is wrong in another (fly it:
   900 m and 2 km, toward the Sun and away, over flat country); the governor's last steps
   leave the scene what it is (a hurricane once became a calm blue sky); the phone's picture is
   what the governor has left (`debug=floor`); a thing meant to be seen against the scene is
   lit by something the scene is not; software WebGL skips only what stands in an `if` false
   for a whole 2 × 2 block; "closer to the reference" asked three times means the technique is
   wrong.
2. The plan, these sections: "SPINE AND GRAFTS", "WHAT THE OWNER WILL SEE", "THE SEVEN PARTS",
   "CORRECTIONS TO THE THREE DESIGNS", "STEP 0", "BEHAVIOUR CHANGES TO LIST AT THE
   CHECKPOINT"; "The kinds of cloud", all nine (their **Look** and **How drawn** are yours;
   their **Height** and **Where and when** are A's rule: read them to know what the field
   says); "RAIN COMES OUT OF THE CLOUD ABOVE" part 1 (the shafts); "DARK STORMS" part 1; under
   "Rendering and cost": "FRAME ORDER", "2. THE VOLUME", "3. SHELLS", "GOVERNOR", "BENCHMARK",
   "LIMITS"; "### B." under "Work packages" (your files, checks and pictures); "Risks" (the
   far slices, the tower against the mid layer, one rule in several places, the painted look's
   clutter, texture limits, Earth, motion); the appendix "the clouds as they were".
3. `docs/briefs/sky-step0.md` (the names that stand, the rules for every package), then the
   tops of `src/sky/skySystem.js`, `src/sky/cloudVolume.js`, `src/sky/clouds.js`,
   `src/sky/skyGlsl.js`, `src/weather/sky/cellShape.js`, `steer.js` and `format.js`.
4. `docs/ARCHITECTURE.md`: "Clouds with depth", "Frame order", "The painted look", and
   "Radiometry" (all written to the HDR target is pre-multiplied by `uExposure`; clouds write
   their cover as alpha).

## Step 0 as built (branch `sky0/join`, commit 102eb11): what you build on

- **The volume's interface** (`cloudVolume.js`, called by the sky system):
  `render(post, rig, time, layer, wind, weather, sky)`, where `sky` is the sky's frame (`t`,
  `noiseT`, `steer`, `rise`, `field`, `here`, `cells` in reach nearest first with `dist`,
  `strikes`); `lay(near, far, rig)` lays the near slices; **`layFar?(c)`** is the slot for the
  far cell sheets (called first in the picture; `c.sky` is the frame); `setBolts(list)`
  keeps up to `BOLTS` = 2 flashes `{ pos: [x, y, z] planet axes, power }` with power over 0
  (today `render` lights only the first: light both); `saving?(id, off)`, `live?(id)`,
  `has?(id)` for `rain-shafts`; `partOut?(id, out)` and `has?(id)` for the benchmark's
  `cells-far` and `rain-shafts`; `steps` (36, or 22 under `cloud-steps`); `enabled` (off
  under `cloud-volume`).
- **The shells** (`upper`), **the fog sheet** (`fog`) and **the lenses** (`lenses`) are
  stand-ins in the sky system that draw nothing. Each answers `update(c)` (before the main
  picture), `draw(c, where)` (`'above'` or `'below'` for the shells), `saving(id, off)`,
  `live(id)`, `has(id)`, `partOut(id, out)`. Build them; hand the owning session each
  constructor line (the sky system's `parts.upper`, `parts.fog`, `parts.lenses`).
- **The order in the picture** (`SkySystem.afterGround`): `cloudVolume.layFar?(c)` →
  `upper.draw(c, 'above')` → `shellScene` (the far low shell, `clouds.mesh`; drawn only while
  the near scene is) → `fog.draw(c)` → `lenses.draw(c)` → `boltScene` (D's strokes) →
  `cloudVolume.lay(near, far, rig)` → `upper.draw(c, 'below')`.
- **`src/sky/skyGlsl.js` is yours from now on** (the plan gives it to you). It holds
  `SKY_UNIFORMS` (`uCloudSteer`, `uCloudRise`, `uSkyLow`, `tWxA/B/C`, `uSteerInv`,
  `uSteerSpin`, `uSteerRise`, `uCells`, `uCellCount`, `uAnvils`, `uAnvilCount`); the guarded
  texts (`SKY_STEER_UNIFORM_GLSL`, `SKY_NOISE_UNIFORM_GLSL`, `SKY_RISE_UNIFORM_GLSL`,
  `SKY_FIELD_UNIFORMS_GLSL`); `SKY_STEER_GLSL` (`skyToLow`); `SKY_RISE_GLSL` (`skyRiseWeight`,
  `skyLowNoise(noise, q, r, a)`); `FAIR_GLSL`; `HEAP_GLSL` (`cloudHeap(noise, up, m, lo, fair,
  vol, steer, fine)` → (heap, cover), `vol.w` the rise); `SKY_FIELD_GLSL` (`skyLow(dir)`,
  `skyLowDensity(p)`, `skyShade(p, toSun)`, `skyShadeCrisp(x)`, `skyShadeLight(s, h)`); the JS
  twins (`skyRiseOf`, `skyLowNoiseJS`, `fairCoverJS`, `cloudHeapJS`, `skyLowJS`,
  `skyLowDensityJS`, `skyShadeJS`, `skyShadeCrispJS`, `skyShadeLightJS`, `steerQuat`,
  `skyToLowJS`); `RISE_RULE` (period 4 200 m, fade 0.08, noise mean 0.339). Three limits:
  `skyShade`, `skyShadeCrisp` and `skyShadeLight` keep their signatures (C builds on them);
  every shared text stays guarded and the shared uniforms are declared only through them; a JS
  twin changes in the same commit as its GLSL. Bind the very uniform objects (`uX:
  SKY_UNIFORMS.uX`); never replace one.
- The rule's other texts: `STEER_GLSL` (every layer: `steerLow` .. `steerCell`, `steerWind*`;
  guarded `SKY_STEERING`), `CELL_GLSL` and `ANVIL_GLSL` (guarded `SKY_CELLS`, `SKY_ANVILS`),
  `FIELD_GLSL` (guarded `SKY_FIELD_DECODERS`). Those files (`steer.js`, `cellShape.js`,
  `format.js`) are step 0's: changes go through the owning session, with their tests.
- **The rise is in.** `skyLowNoise` reads the masses in two phases (one read outside the
  fades): heaps grow and fade in place at 0.5 m/s. The volume, the far shell, the ground, the
  trees' shade map and the far rocks all read it. The ground, `treeShade` and `farRocks` take
  `uCloudVol` as a vec4 (w the rise's phase); the shell `uVol.w`; the march declares
  `uCloudRise`; `density(q, r, c, y, fine)`. The fine lobes and wisps are read unrisen, so a
  heap's edge can change by up to 0.29 of density in 30 s: judge it on screen, and say in the
  report whether you rise them too.
- **What step 0 left for you.** `place()` and `setGround()` are still in the volume: the base
  follows the traveller's country (25–51 m per 100 m flown); the plan deletes them, and the
  base comes from field A. The march reads 6 to 7 textures a step (the map, two fair-weather
  reads, the main noise, the fine noise, the look toward the Sun); the plan allows 4. Earth's
  storms no longer race (55 m/s scud) nor turn over thirteen times as fast: your cells, boiling
  at 3 to 8 m/s in their own moving frame, bring a storm's life back, Earth's included. The far
  low shell works out its pixel before it discards a near one.
- **The governor** (main session's file) has your steps: `cloud-steps` (near 36 → 22, far
  slices 8 → 5), `cloud-upper` (one octave, no relief look), `rain-shafts` (no streak read, one
  look into the field), `cloud-volume` (last: the field's heaps near the traveller go to the
  shell; cells still marched at 5 steps). The new ones are passed by while `has` and `live` say
  no. **The benchmark's parts**: `clouds-all`, `cloud-upper`, `cells-far`, `rain-shafts`, `fog`.
- **The debug switches**: `?debug=sky:fair|fog|storm|front` (the stub's presets, laid round
  the opening place), `storm` (a mature cell standing 8 km north-east of where the view opens),
  `flash`, `noclouds` (no cloud of any kind and nothing a cloud does).
- **Nothing of step 0 has been compiled by a GPU.** Your first headless picture is that test.
  The new GLSL to watch: `skyLowNoise` and the guards in the march and the shell.

## The jobs, in this order

1. **Look first.** A frozen build of your branch's head (`./scripts/build-check.sh`, then copy
   `dist/`). `npm run smoke` (it runs `glLimits` on every program); read the console for a
   shader error before anything else, and tell the owning session at once if step 0's GLSL
   fails to compile. Then the first pair's "before": the ledge at noon (`--query "t=4"`: the
   bookmark is about 08 h local), at the eye (twenty minutes: start it detached and work
   meanwhile) and from 1 km above it, pitch −20 (three minutes).
2. **The checks that fail first**, pushed and announced before the fix ("B-2 pushed <commit>:
   cloud-cost 7 reads a step FAIL, anchoring FAIL, cloud-motion high layer FAIL"):
   `scripts/cloud-cost.mjs` taught to count the march's texture reads a step (6–7 today:
   fails); the anchoring check (the base moves with the traveller today: fails);
   `scripts/cloud-motion.mjs` (the high layer: none today, fails; the low layer moves with
   M_low since step 0: see its half fail once on `origin/main`, from before step 0, where it
   ran the wrong way at 4–6 times the speed); the stability case `haven_cross` (fails today:
   the base moves); the far-slice depth check (no far slices today: fails).
3. **The march.** Field A read at every step, at most 4 reads a step (+1 within 1 km); the base
   per place; `place()`, `setGround()`, the lift and the frame drift deleted (the noise comes
   from M_low and the rise); bounds from the field within reach, snapped to 250 m with
   hysteresis (they only shorten the march); heap and sheet profiles; scud from the wisp and
   fine noises at no extra read; darkness by τ (decks to 0.35 by their thickness); the mid and
   high transmittance read once per ray from field B (exp(−1.2·mid − 0.35·high)); `uStorm`
   and `uBolt` per cell, never from the weather at the traveller. The first pair's "after".
4. **Cells.** `CELL_GLSL` from `cellShape.js`. Each ray's stretch is the union of the layer's
   interval and up to 2 cells' intervals, each marched with its own steps and composited in
   order. Boiling at 3–8 m/s in the cell's own moving frame (no shear at its edge). An exact
   chord toward the Sun (lit under 300 m of chord, down to 0.08–0.15 at the base); the slate
   tint toward [0.62, 0.66, 1.0]; density 1.45 × a heap's; light from the ground halved; up to
   2 flashes through uBolt. Two far slices (16–40 km and 40–200 km), marched and laid only while
   a cell lies beyond 16 km, through `layFar`: their alpha-weighted mean distance written
   beside the colour and laid as `gl_FragDepth`, with a depth-only pass for cores of alpha 0.6
   or more. Then `haven_storm_pass` (a cell crossing 16 km in 5 frames: no step at the
   hand-over; look at 12, 14 and 16 km).
5. **Rain shafts** below the base: the cells' chords (no texture read; the foot offset
   downwind by the fall at 9 m/s), 2 looks into the field's rain, one streak read scrolling
   down, optical depth 0.00014·rate^0.85 a metre, virga, a misty foot over the last 300 m
   above field C's country height, grey-blue sky light plus a silver glow with a low Sun behind,
   faded out nearer than 600 m (D's streaks take over there), and the same chords far.
6. **Shells.** The far low shell from the field, its vertices pushed to the base, near pixels
   discarded first. `src/sky/upperClouds.js`: the mid shell (R + 5 000 m, cloudlets through
   M_mid, a veil; at most 0.35 cover except ahead of fronts) and the high shell (R + 9 000 m,
   streaks stretched along M_high, a faint 22° halo, anvils dark beneath); each cut where a
   tower passes through, ordered by the camera's height; 3 reads on a covered pixel, 1 and a
   discard where clear.
7. **The fog sheet** (`src/sky/fogSheet.js`: 129 × 129 over 60 km on a lattice fixed to the
   world, lifted to field C's top, one noise read, depth-tested). Then **the lenticulars**
   (`src/sky/lenticulars.js`), last: they may be cut if time runs short.
8. **Haven's globe** from the field's combined cover (`src/sky/bodies.js`).
9. **The switches and savings**: `noclouds` takes every kind, cell, shaft, fog sheet, lens and
   anvil; the `sky:` presets work; the setters for `cloud-steps`, `cloud-upper`, `rain-shafts`
   and `cloud-volume`, each one that thins; `partOut` for your five parts.
10. **The after set** (below), every storm view again at `?debug=floor`.

## The checks (the plan's six, before any picture)

1. `node scripts/cloud-cost.mjs`: at most 4 texture reads a step, +1 within 1 km; the headless
   work count of march plus lay at `--dsf 2.2` on a fair day no higher than today's.
2. `node scripts/cloud-motion.mjs`, one headless run: two marches 20 s of game time apart,
   the camera fixed, looking up and toward the horizon, their alpha cross-correlated; the
   shift is the low steering's within 10° and 20 %; a high-layer patch moves with M_high.
3. Anchoring: the small target drawn with the camera moved 100 m and 10 km, aimed at one world
   point, shows the same cloud there; a Node audit finds no uniform but the camera-relative
   ones that changes with `rig.pos`.
4. `glLimits` in `npm run smoke`: the march, the shells, the fog sheet, the lenses and the far
   lay at 16 textures or fewer and 15 varyings or fewer (the march may reach 13).
5. Stability (`npm run stability`, your cases added to `scripts/stability.mjs`):
   `haven_climb`; `haven_cross` (300 m of flight under heaps at 1.5 km, the clock held: no
   cloud moves between frames); `haven_storm_pass`.
6. A ridge at 20 km hides the foot of a cell at 35 km; a cell at 18 km is drawn over a ridge at
   30 km.

And the parity of every JS twin with its GLSL: one run of `scripts/lib/glslRun.mjs` at 64 × 64
points, within 1/255.

## The pictures

From a frozen build, `node scripts/shots.mjs --dist --distdir <build> --world haven --shot
ledge --size 880x412 --dsf 1.25 --out docs/shots/sky --query "..." --suffix _B-<view>
--timeout 1500` (dsf 2.2 for the storm). First from the stub's presets, then from A's model
when it lands. A pair (before and after) wherever something changed. **From the air first**
(three minutes each; one at the eye in a wood costs twenty):

- 900 m and 2 km over flat country at noon, toward the Sun and away (the steppe of
  `scripts/from-above-shots.sh`: lat −54.4271, lon 39.2697, ground 1 461 m);
- a mature cell from 40 km at 1.5 km up, and from 8 km (`debug=storm` or `sky:storm`; the
  cell's place is in `__app.sky.frame.cells`);
- a deck from above with peaks through it; 30 km up; Haven from the Moon;
- every storm view again at `?debug=floor`; `?debug=noclouds`.

Then at the eye: the ledge at 08 h (mist, first heaps), 12 h and 16 h (the storm on the western
ranges), toward the Sun and away; under the anvil; the same cell at night with `debug=flash`;
the deck from below; a rain-deck day with shafts; altocumulus and cirrus at dusk; the Crown on
the windy day; a strip of 8 frames 10 s apart at x60 from the ledge. Earth: the hurricane, the
ledge and from space, before and after, and `npm run worlds -- --only earth`.

## Files

Yours: `src/sky/cloudVolume.js`, `src/sky/clouds.js`, `src/sky/skyGlsl.js` (within the three
limits above), `src/sky/bodies.js` (Haven's globe), `src/sky/cloudNoiseData.js` and
`cloudNoiseWorker.js` (only if a channel is needed), `scripts/cloud-cost.mjs`,
`scripts/stability.mjs` (new cases only); new `src/sky/upperClouds.js`, `src/sky/fogSheet.js`,
`src/sky/lenticulars.js`, `scripts/cloud-motion.mjs`. You retire `scripts/cloud-field.mjs`
once A's `sky-map.mjs` is in (its rule moves into A's model): the charter's line for it is the
owning session's to remove, so ask.

Not yours: `src/app.js`, `src/sky/skySystem.js`, `src/perf/governor.js`,
`src/perf/benchmark.js`, `CLAUDE.md`; step 0's `format.js`, `steer.js`, `cellShape.js`,
`stub.js` (changes go through the owning session); `src/worlds/haven.js` (your look numbers,
heights, tints, darkness, shaft strength, are defaults in your files and listed in your report;
the owning session moves them); A's model and `skyField.js`; C's `cloudShade.js`,
`treeShade.js`, `terrainMaterial.js`, `farRocks.js`; D's `weather.js`, `rain.js`, `bolt.js`,
`post.js`, `look.js`, `skyDome.js`, `audio.js`; `lightingGlsl.js` (ask first).

## Rules that bite

- Nothing in the sky moves because the traveller moved. The traveller decides only what is
  drawn and how far the march goes, never a value.
- No world's name in the engine. Every governor step thins, none removes: at the floor a storm
  keeps its tower, darkness, shaft, shadows, rain, strokes and thunder.
- Every new script imports by relative paths, exits non-zero on any failure, and is seen to
  fail once with its fault put in.
- Keep green before every announced push: `./scripts/build-check.sh`,
  `node scripts/sky-system-test.mjs` (79 ok at step 0; checks 13, the guards, and 14, the rise,
  are about your file), `sky-steer-test.mjs` (34), `sky-format-test.mjs` (47),
  `sky-cell-test.mjs` (31), `node scripts/governor-sim.mjs`, `npm run smoke`, and yours.
- One headless browser at a time on your machine. Long runs detached (`nohup setsid`), from a
  frozen build, writing a line to a log when each step is done.

## Cost

The phone's tenth results are `docs/benchmarks/2026-11-25-haven-e9d4888.txt`: Sharp, 28.5 fps,
0.86 % of frames late; the ledge at 25.9 fps, 3.0 % late, at 1.65 MP (the bottom of the
resolution range: no room). In its cost test the `cloud-volume` saving bought 2.0 ms at the
ledge and 3.7 ms from the air; `cloud-steps` 0.7 ms (the other readings are noise: believe
only differences of 3 ms or more that repeat). On the route the governor turned "clouds with
depth" off at 12.3 s and "coarser clouds near you" on and off again and again. The plan's
estimates: the march 1.5–3 ms on a fair day (today 2.0–3.7), 2.5–4.5 ms with storms in view;
the shells 0.3–0.8 ms with high cloud overhead, 0.1 ms with none; the fog sheet 0.1–0.3 ms;
lenses at most 12 × 800 triangles. C's shade map pays for your storms (2–4 ms saved). Not yet
measured: the rise's fades (22 minutes in every 2.3 hours of game time) add one 3-D read a
step; count the march in a fade and out of one. Every new cost gets a governor step that
thins, never removes: build its setter and send the owning session its id, label and what it
buys, to wire. Counts headless only (`cloud-cost.mjs`, `ground-cost-run.sh`), never a frame
rate; the phone decides.

## Merging

- Merge `origin/ccr-aa39490a-qiw63x` into your branch before every announced push, build, and
  run the checks.
- The other sky helpers' branches: `ccr-aa39490a-sky-A-model` (merge it as soon as it builds:
  your pictures then come from the model), `ccr-aa39490a-sky-C-shade` (it builds on your rule:
  merge it when it builds, and push yours early so it can merge you),
  `ccr-aa39490a-sky-D-storm`.

## What to hand back

- Each job as it lands, pushed and announced to the owning session in one line with the
  commit and the pair ("B-3 pushed abc1234: the march reads 4 a step; ledge pair in
  docs/shots/sky/"). Messages with `send_message` (its id is in your first message), short.
- The constructor lines for `upper`, `fog` and `lenses`, and anything else needed in
  `skySystem.js` or `app.js`, under "Asked of the main session" in your report and in a message.
- Your report (`docs/briefs/sky-B-report.md`), kept as the work goes: what was built; each
  check with its numbers and how it was seen to fail; the pictures (paths); the look numbers
  for `haven.js`; cost counts; behaviour changes for the checkpoint message; what is open.
- When all is done: "B-DONE pushed <commit>".
- Never put a model's name in a commit; end commit messages with the two attribution lines
  your session's instructions give.
