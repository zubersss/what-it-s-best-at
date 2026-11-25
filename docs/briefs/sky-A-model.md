# Brief A: the day's weather (the model, its cells and strokes, and the field)

You build package A of the sky plan (`docs/briefs/clouds-weather-plan.md`): the model that
decides each day's weather on Haven, the worker that makes its snapshots, and the field that
hands them to the GPU and the CPU. Three other helpers draw from what you make: B the clouds
you see, C the cloud shade map, D rain, lightning, thunder and wind. Until your model lands
they build against step 0's test pattern (the stub).

Branch: `ccr-aa39490a-sky-A-model`, begun from `origin/ccr-aa39490a-qiw63x` (a worktree
begins from `main`: check out that head first). That head holds step 0. If
`src/sky/skySystem.js` or `src/weather/sky/producer.js` is not there, stop and tell the
owning session. Report: `docs/briefs/sky-A-report.md`, beside this file (its headings are
there already).

## The owner's words

With the tenth phone results (2026-11-25): "the clouds need a lot of work still: I want them
to move like real clouds and be around areas where real clouds will most likely be found,
like near the mountains; ... they should move with the wind at different speeds based on the
wind speed on a certain day; they should also have actual rain coming out of them when it's
time to rain; the thunder clouds should be much darker and stormy looking, with lightning and
thunder." And when the made world began (2026-11-23): "a living world with its own physics and
water and rain".

Your part of it: where the cloud is (near the mountains), which day is calm and which a gale,
when and where it rains, and where and when the storms stand.

## Read first

1. `CLAUDE.md`, all of it. These lessons bite here: a degree on a small world (on Haven it is
   4 363 m: never count in degrees); "fog on a plateau" (heights in the air are over the
   country, never over the sea); nothing may hang on where the traveller stands; anything that
   moves with the wind is a closed form or added up; uploads between frames, no mipmaps built
   on the GPU; a worker job asked every frame keeps a picture waiting for ever; count the work
   a change of data sets off; something marked "build again" is marked done when asked for; a
   test that cannot fail; break a new check once to see it fail; a script nobody runs.
2. The plan, these sections: "SPINE AND GRAFTS", "WHAT THE OWNER WILL SEE", "THE SEVEN PARTS",
   "CORRECTIONS TO THE THREE DESIGNS", "STEP 0", "BEHAVIOUR CHANGES TO LIST AT THE
   CHECKPOINT"; in "The kinds of cloud", the **Height** and **Where and when** of all nine
   kinds (that is your model's rule; their **Look** and **How drawn** are B's); "The weather
   model", all of it; "WHEN IT RAINS"; under "Rendering and cost", the first paragraph of
   "FRAME ORDER" and "1. THE FIELD"; "### A." under "Work packages" (your files, checks and
   pictures); "Risks" (the worker after a jump of the clock, the opening view, Earth); and the
   two readers' maps at the end (the clouds and the weather as they were).
3. `docs/briefs/sky-step0.md` (the names that stand, the rules for every package), then the
   tops of `src/sky/skySystem.js`, `src/sky/skyField.js`, and `src/weather/sky/format.js`,
   `steer.js`, `cellShape.js`, `stub.js`, `producer.js`.
4. `docs/ARCHITECTURE.md`: "Weather" and "Frame order".

## Step 0 as built (branch `sky0/join`, commit 102eb11): what you build on

- `src/weather/sky/producer.js`: `makeProducer(opts)` returns `{ snapshot(t), at(place, t,
  out), cells(t), strikes(t0, t1), records(ta, tb) }`, t in seconds since `weather.epoch`.
  Today it returns the stub (`stub.js`, presets `fair`, `fog`, `storm`, `front`). **Your model
  takes its place.** Keep the stub for `opts.preset`: `?debug=sky:<preset>` must still give
  it. Also there: `hourAtEpoch(weather)` (the local solar hour at the opening place at t = 0)
  and `steerMotion(steer)`. The options are plain data: `preset`, `weather` (the world's
  block), `radius`, `dayHours`, `origin`, `layout`, `stormAt`, and `land { data: Int16Array,
  width, height, scale }` (posted once, at `init`).
- `src/weather/sky/skyWorker.js`: `{ kind: 'init', id, opts }`; `{ kind: 'snap', id, t }`
  answered by `{ kind: 'snap', id, t, s }`, its buffers transferred (`snapshotTransfer`). Only
  `self.onmessage` and `self.postMessage` touch the worker's globals (`sky-steer-test.mjs`
  checks it).
- `src/sky/skyField.js`, version 0: the stub's snapshots from the worker, the 'now' bytes
  blended on the CPU a sixteenth of the rows a frame, uploaded whole when all are done. **You
  rewrite its inside; its interface stays**: `setWorld(world, opts | null)` (null or a new
  world ends the old worker first), `update(t)` (between frames), `on`, `busy` (a picture
  waits for it), `at(place, t, out)` (place `{ lat, lon, h? }` or `[x, y, z]`), `cells(t)`,
  `strikes(t0, t1)` (in time order), `anvils?(t)`, `textures { A, B, C }`. The 'now' maps are
  `SKY_UNIFORMS.tWxA/B/C`; `SKY_UNIFORMS.uSkyLow.w` is 1 once they are there.
- `format.js` is fixed: `fieldLayout`, `ENC`, `enc`/`dec`, `putA/B/C`, `fieldAt`,
  `makeSnapshot`, `checkSnapshot`, `blendByte`, `makeSkyAt` (the at() record), `CELL` (a cell
  record), `CELL_KIND`, `cellLife`, `LENS`, `FIELD_GLSL`, `SNAP_STEP` 120 s, `STRIPS` 16. A
  change goes through the owning session, with `scripts/sky-format-test.mjs` in the same commit.
- `steer.js`: `Steer` with `t(ms)`, `motion(layer, t, M)`, `inverse`, `carry`, `wind`,
  `windAt`, `omega`, `speed`, `rise`, `risePhases`, `uniforms`. Lows, fronts and highs move
  with `motion('mid', t)`, cells with `motion('cell', t)`: a position at t is
  `M(t) M(t_birth)^-1 p_birth`, a closed form.
- `cellShape.js`: `cellGeometry(state, R)`, `cellRain`, `cellFootprint`, `anvilGeometry`,
  `CELL_MAX` 8. Your cells need `x, y, z` (unit), `radius`, `base`, `top`, `stage`,
  `strength`; they may carry `rain`, `core`, `age`, `seed`, `tilt`, `shaft`, `frame`. Paint
  the anvils into field B.G with `anvilGeometry`, and the cells' rain with `cellRain`: one
  rule, never a copy.
- `src/sky/skyGlsl.js` (B's file from now on): `fairCoverJS(noise, up, k, fair, m)` is the
  fair-weather field's JS twin. Import it; do not copy it. It is pure (no three, no DOM).
- What the sky system does with your field each frame (`SkySystem.weatherStep`):
  `field.update(t)` on the weather clock; `field.at([x, y, z], t, here)` at the traveller;
  `field.cells(t)` within `CELL_REACH` (200 km), nearest first, each with `dist`, the nearest 8
  packed into `uCells`; `field.strikes(tPrev, t)` within `STRIKE_REACH` (60 km), none after a
  jump, a stop or a backward clock; `field.anvils(t)`, when there, into `uAnvils`.
- **On Haven the field is made only under `?debug=sky:<preset>`, `storm` or `flash`.** When
  your model is ready the owning session makes it always on and drops the stub as the
  default. To see your model in the game before that, ask for `?debug=sky:model` (a line in
  `skySystem.js` and `stub.js`, both theirs).
- Haven's world file today: `weather: { recipe: 'made', seed: 1, epoch:
  '2024-09-01T00:00:00Z', dayStart: 9 }`. The rise's period is fixed (`RISE.PERIOD` 4 200 m),
  no longer a world number.
- The benchmark's route runs on a pinned clock (x1, running); a cost view may carry an hour
  (`timeOffsetHours`).

## The jobs, in this order

1. **The test that fails first.** `scripts/sky-model-test.mjs`: the plan's eleven checks,
   exit 1 on any failure. Run it on the stub, and on a fake producer that wraps today's
   static cloud map (`haven_clouds_4096.jpg`, or the rule `make-world-maps.mjs` made it by).
   Checks 3, 4 and 7 must FAIL on the fake (the plan's reader measured a correlation of cover
   with height of 0.03). Push and announce "A-1 pushed <commit>: sky-model-test fails on the
   static map (3, 4, 7)", with the lines it printed.
2. **The land.** `land.js`, and two new outputs of `scripts/make-world-maps.mjs`:
   `public/data/haven_wxland_1024.u8` (lossless planes of 1024 × 512: hC, hS with its
   gradient, prominence, valley depth, the land mask, the distance to the coast) and
   `public/data/haven_peaks.json` (summits with 600 m or more of prominence: place, height,
   ridge direction). Every existing output stays byte for byte the same: list the sha256 of
   each before and after in the report. Trigger sites are made at load. First pictures from
   `scripts/sky-map.mjs` (no browser): hC, prominence, valley depth, peaks and sites over the
   shaded relief.
3. **The model.** Lows, fronts, highs and tropical waves, carried by M_mid; the day's
   character (windiness, humidity), with days the world file can pin; moisture with fetch and
   rain shadow; temperature and snow; lift and instability; the kinds per field cell (heaps
   with caps, streets, the lee and the fair clusters; sheets with their thickness; the base;
   the fog top; mid; high with anvils; the field's rain; wet from 30-minute slots); the ground
   wind; cells (sites, births under the cap, life, M_cell); strikes; the lens list. Checks 1
   to 9 pass. A 1024 × 512 snapshot takes at most 600 ms in Node on your machine (check 9; the
   stub takes 0.2 to 0.35 s).
4. **The scene days.** `scripts/find-weather.mjs` chooses the seed. 22 September: mist below
   the ledge at 07–09 h, heaps on the ranges by noon, a storm on the western ranges in view of
   the ledge at 14–18 h. 23 September: a front. 24 September: windy, caps and lenses on the
   Crown (check 11). The opening place stands 300 m or more above every fog top within 2 km,
   at every hour (check 4). Look at Skymere (2 km up) at every bookmark hour too: neither may
   open in cloud.
5. **The worker and the field.** The worker makes `snapshot(t)` ahead of the clock, spaced
   max(120 s, |rate| × 0.5 s), only the newest time needed. Inside `skyField.js`: three
   snapshot slots and a 'now' copy (A and B 1024 × 512 RGBA8, C 512 × 256 RG8: about 17 MB);
   strips of 32 rows uploaded with `texSubImage2D` between frames, at most 260 KB a frame; the
   'now' blend as a GPU pass scissored to a sixteenth of the rows; its CPU copy for at(); no
   mipmaps built on the GPU. After a jump of the clock the old field shows and crossfades over
   2 s; above x60 the blend is drawn whole; running backwards and bookmark jumps simply work.
   A Node check counts the bytes each `update` uploads and compares at() with the bytes
   (check 1: within 1/255).
6. **Earth.** `fromMaps.js`: one static snapshot at 2048 × 1024 from its 8 September 2017
   maps (cover; mid from tops of 4–7 km; high from tops over 7 km; rain; cells where rain
   exceeds 3.5 mm/h and tops 7 km), and its belts and storm vortices as the ground wind, moved
   out of `weather.js` (D's file: agree the day with D through the owning session). `earth.js`
   gains `weather: { recipe: 'maps' }` and nothing else. Check 10: Earth's rain and ground wind
   within 2 % of today's at five places, Irma among them.
7. **The pictures**, all without a browser, from `sky-map.mjs` over the shaded relief: each
   kind's cover, the rain, the cells and their strikes, with low and high wind arrows, at 06,
   09, 12, 15 and 18 h on the three scene days (15 pictures); a 48-frame time-lapse, one frame
   every 30 min, of the 300 km round the opening place; a 7-day meteogram at the opening place
   (wind by layer, rain, cover by kind, cells within 40 km); find-weather's chosen times and
   places. Into `docs/shots/sky/`, names beginning `A-`. Then, when a browser is free:
   `node scripts/play-profile.mjs --world haven` at x60 on a frozen build with the field on
   (add a `--rate` flag if it has none): page work at most +0.3 ms, uploads at most 260 KB a
   frame. If `?debug=sky:model` is in by then: the ledge at 08, 12 and 16 h from the air first
   (1 km and 3 km over the ground, pitch −20), 880x412 at dsf 1.25.

## The checks (the plan's eleven, in `scripts/sky-model-test.mjs`)

Determinism (two calls, two processes, byte for byte; at() against the bytes within 1/255; no
three, DOM or Math.random under `src/weather`); no traveller input (one place unchanged after
at() at 200 others); mountains (cover above 2 000 m at least 2.5 × below 500 m at 15 h;
windward at least 3 × the lee; correlation with height at least 0.35); the day's cycle (heaps
at 15 h at least 3 × 07 h; fog at 06 h at least 3 × 14 h; the ledge 300 m over every fog top
within 2 km); motion (lows and fronts with M_mid within 3° and 5 %; no cell of the field
changes by more than 0.25 between snapshots; a cell moves at most its steering speed × dt +
1 m a frame); days differ (over 90 days: at least 15 % with a mean ground wind under 3 m/s, 10 %
over 10 m/s; on windy days the high layer at least 2.5 × the low); rain (an hour or more on
25–55 % of days at the opening place; over 0.5 mm/h only under low cover of 0.5 or more or in
a cell's core, and only where the base is above the ground); storms (a lightning cell within
40 km of the Crown on at least 20 % of afternoons; none over land 03–09 h except on fronts;
never more than 8 within 200 km; strikes of a split window the union of its parts); cost (600
ms); Earth (2 %); the scene days.

Two of them wait on others. "No Math.random in `src/weather`" fails until D lands
(`weather.js` and `rain.js` still use it): have the check name the files, and list it in your
report as expected. Earth's 2 % compares with today's `weather.js`: keep a copy of today's
numbers at five places in the test, taken before anything moves.

## Files

Yours: new `src/weather/sky/model.js`, `systems.js`, `land.js`, `cells.js`, `strikes.js`,
`fromMaps.js`, `scripts/sky-model-test.mjs`, `scripts/sky-map.mjs`,
`scripts/find-weather.mjs`; `src/weather/sky/producer.js` and `skyWorker.js`; the inside of
`src/sky/skyField.js` (its interface stays); `scripts/make-world-maps.mjs` (new outputs only);
`scripts/play-profile.mjs` (a `--rate` flag only); in `src/worlds/haven.js` the `weather` block
only; in `src/worlds/earth.js` the recipe line only.

Not yours: `src/app.js`, `src/sky/skySystem.js`, `src/perf/governor.js`,
`src/perf/benchmark.js`, `CLAUDE.md` and the docs other than your report; step 0's
`format.js`, `steer.js`, `cellShape.js`, `stub.js` (changes go through the owning session,
with their tests); the rest of `haven.js` (the bookmarks with their hours and the cost views go
into your report as text the owning session pastes: they change the benchmark's route); every
renderer file (B's `cloudVolume.js`, `clouds.js`, `skyGlsl.js`, C's `cloudShade.js`, D's
`weather.js` and the rest). Leave the renderer alone.

## Rules that bite

- Code under `src/weather/sky/` imports neither three nor the DOM and uses no Math.random.
  Everything is a function of (seed, date, hour, place), never of the traveller.
- No world's name in the engine: numbers and recipe names in the world file, distances in
  metres from `world.radius`.
- `snapshot(t)` carries nothing from one call to the next, except wet's 30-minute slots,
  cached and made again whole only after a jump.
- Every new script imports from the repository by relative paths, exits non-zero on any
  failure, and is seen to fail once with the fault it guards put in.
  `scripts/check-scripts.mjs` (in the build check) reads every import.
- Keep green before every announced push: `./scripts/build-check.sh`,
  `node scripts/sky-system-test.mjs` (79 ok at step 0), `sky-steer-test.mjs` (34),
  `sky-format-test.mjs` (47), `sky-cell-test.mjs` (31), `node scripts/governor-sim.mjs`, and
  yours.
- One headless browser at a time on your machine. Long runs detached (`nohup setsid`), from a
  frozen build (`--distdir`), writing a line to a log when each step is done.

## Cost

The phone's tenth results are `docs/benchmarks/2026-11-25-haven-e9d4888.txt`: Sharp, 28.5 fps,
0.86 % of frames late; the page's own work 7.6 ms a frame on average and 26.0 ms at the worst
1 %; the ledge at 25.9 fps, 3.0 % late, at 1.65 MP (the bottom of the resolution range: there
is no room). One hitch of 133 ms was "sky maps arriving" (at 90.6 s): a map uploaded whole in a
frame, what your strips replace. Your budget: page work at most +0.3 ms, and only during strip
uploads; at most 260 KB uploaded in a frame; the worker under 1.5 % of a phone core (0.4–0.8 s
a snapshot in Node, every 120 s). The plan gives the field no governor step. Any new cost gets
one that thins, never removes: you build its setter, and the owning session wires it into
`governor.js` from the id, label and what it buys that you send. Counts headless only, never a
frame rate; the phone decides.

## Merging

- Merge `origin/ccr-aa39490a-qiw63x` into your branch before every announced push, build, and
  run the checks.
- The other sky helpers' branches are `ccr-aa39490a-sky-B-clouds`, `ccr-aa39490a-sky-C-shade`
  and `ccr-aa39490a-sky-D-storm`. They merge yours as soon as it builds: push early and often.
  You rarely need theirs; the owning session's branch brings them.

## What to hand back

- Each job as it lands, pushed and announced to the owning session in one line with the
  commit ("A-3 pushed abc1234: the model, checks 1-9 pass, a snapshot 410 ms; pictures in
  docs/shots/sky/"). Messages with `send_message` (its id is in your first message), short.
- Your report (`docs/briefs/sky-A-report.md`), kept as the work goes: what was built; each
  check with its numbers and how it was seen to fail; the pictures (paths); the `weather`
  block's numbers, and the bookmarks ('Morning mist', 'Afternoon storm', 'A front coming',
  'Wind on the Crown') and cost views ('under the storm', 'a storm from afar', 'in the morning
  mist') with their hours, as text to paste into `haven.js`; cost; what is open; what is asked
  of the owning session.
- When all is done: "A-DONE pushed <commit>".
- Never put a model's name in a commit; end commit messages with the two attribution lines
  your session's instructions give.
