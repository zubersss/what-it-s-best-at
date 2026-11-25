# Brief D: rain, lightning, thunder and wind where the traveller is; storms kept dark

You build package D of the sky plan (`docs/briefs/clouds-weather-plan.md`): what the traveller
feels and hears of the weather. The ground wind that bends the trees and the grass and whips
the sea; rain and snow at the eye, only under a cloud that rains; strokes of lightning drawn as
ribbons; thunder that arrives after its delay; the exposure meter and the grade that keep a
storm dark; the rainbow. A makes the field you read (`at()` and `strikes()`; until it lands,
step 0's stub), B draws the clouds and lights a cell from inside with the flashes you hand
over, C makes the cloud shade on the figure.

Branch: `ccr-aa39490a-sky-D-storm`, begun from `origin/ccr-aa39490a-qiw63x` (a worktree
begins from `main`: check out that head first). That head holds step 0. If
`src/sky/skySystem.js` is not there, stop and tell the owning session. Report:
`docs/briefs/sky-D-report.md`, beside this file (its headings are there already).

## The owner's words

With the tenth phone results (2026-11-25): "the clouds need a lot of work still: ... they
should move with the wind at different speeds based on the wind speed on a certain day; they
should also have actual rain coming out of them when it's time to rain; the thunder clouds
should be much darker and stormy looking, with lightning and thunder." And when the made world
began (2026-11-23): "a living world with its own physics and water and rain and leaves that
change color with the season and fall down with the wind".

Your part of it: the day's wind in the trees, the grass, the sea and the leaves; rain that
starts at the edge of a shaft when you walk or fly into it; a storm that is dark to stand under;
lightning you can see on a phone and thunder you hear after it.

## Read first

1. `CLAUDE.md`, all of it. These lessons bite here: anything that moves with the wind is added
   up frame by frame or a closed form (the rain once jumped metres between frames); the rain's
   own slice from the eye to the terrain's near plane (the rain was "too thin" for two
   deliveries for want of it); rain lit by `skyLight`, above the veil's grey; two ends of one
   thing wrapped into a box each by itself come apart (one streak in twelve drawn across the
   box); a thing "switched off" by giving it no size is still drawn; small very bright things
   own a brightness-weighted meter, the meter aims at a middle grey, things that must read
   white are held at their own level; an eclipse applied to the whole frame's sunlight turned
   a sunlit world black (a heap's shadow must not dim the frame); a scripted benchmark must
   not depend on the sky; the governor's last steps leave the scene what it is (a hurricane once
   became a calm blue sky); every vector kept in planet axes is turned in `App.switchWorld`;
   nothing may hang on where the traveller stands; a test that cannot fail.
2. The plan, these sections: "SPINE AND GRAFTS", "WHAT THE OWNER WILL SEE", "THE SEVEN PARTS"
   (6 and 7), "CORRECTIONS TO THE THREE DESIGNS" (the meter; '111 200 m a degree' and
   Math.random), "STEP 0", "BEHAVIOUR CHANGES TO LIST AT THE CHECKPOINT"; "GROUND WIND" and
   "TEMPERATURE" in "The weather model"; "## Rain and storms", all of it (rain at the eye, dark
   storms, lightning, thunder, wind, rainbow, when it rains); under "Rendering and cost": "5.
   RAIN, RIBBONS, AUDIO", "GOVERNOR" (group 4, and no step for lightning or thunder),
   "LIMITS" (ribbons write alpha 0); "### D." under "Work packages" (your files, checks and
   pictures); "Risks" (exposure, Earth); the appendix "weather, wind, rain, lightning, thunder
   as they were".
3. `docs/briefs/sky-step0.md` (the names that stand, the rules for every package), then the
   tops of `src/sky/skySystem.js` (`weatherStep` and the sky's frame), `src/weather/weather.js`
   (its interface), `rain.js`, `bolt.js`, `rainbow.js`, `src/weather/sky/format.js`
   (`makeSkyAt`, the at() record, and the strike record under it) and `stub.js` (the `storm`
   and `front` presets you build against).
4. `docs/ARCHITECTURE.md`: "Weather", "Radiometry" (the meter), "The painted look".

## Step 0 as built (branch `sky0/join`, commit 102eb11): what you build on

`weather.js` keeps the interface at its top; the sky system calls it every frame:

- `update(rig, dt, sunDir, day, sunE, sky)`. `sky` is the sky's frame: `t` (the weather clock,
  s since `weather.epoch`), `tPrev`, `noiseT`, `steer`, `field`, **`here`** (`field.at()` at
  the traveller: `windE`, `windN`, `wind`, `gust`, `rain` at the traveller's height (0 above
  the base it falls from), `snow`, `temp`, `overcast`, `storm`, `fog`, `wet`, `base`, `top`,
  `cell`), `cells` (in reach, nearest first, each with `dist`), **`strikes`** (the field's
  strokes since the last frame within `STRIKE_REACH` 60 km, each with `pos` [x, y, z] planet
  axes and `dist`; none after a jump, a stop or a backward clock; none from above 18 km over
  the ground), `world`, `R`, `noClouds`, `shotMode`. A strike is `{ t, cell, ground, x, y, z,
  h0, h1, power (0.6–1.4), seed }`.
- **`own`**: true on Earth today (its maps); false on Haven, where `uWind` is then the local
  east at the sea's 6 m/s (it turns as the traveller moves, and it is the same on every day)
  and there is no weather at all. Set it true on a made world when you read `sky.here`. Then
  the sky system takes your `wind` and `windSpeed` for `uWind` (trees, grass waves, sea and
  whitecaps, leaves, pollen), your `sunShade` and `skyShade` for `uWeather.x/y` (only while C's
  probe has no value), `wet` for `uWeather.z`, `veil` for `uWeather.w`, the wind sound, and the
  drift of a figure hovering with the stick let go (that rule is the sky system's: at half
  your wind's speed, below 12 km, never in a benchmark, a GO trip or a picture).
- **`takesStrikes`**: set it true when you turn `sky.strikes` into strokes, their light
  (`flash`, `flashLight` for `uFlash`) and thunder (`heard()`: what has arrived this frame,
  `{ power, dist }`, handed to `audio.thunder(power, dist)` below 20 km over the ground). Until
  then a stand-in in the sky system makes one flash a frame and queues its thunder.
- **`bolts`**: null, or up to two `{ pos: [x, y, z] planet axes, power }`, the flashes that
  light their cloud from inside: the sky system hands them to B's `CloudVolume.setBolts`.
  Null: it makes one of `flash` when that is in the cloud.
- **The bolt slot**: give `Bolt` an Object3D `slot` (your ribbons, built in planet axes and
  placed relative to the camera each frame). The sky system adds it to `boltScene`, drawn after
  the far sheets, the shells, the fog and the lenses, and before the near cloud slices, so that
  cloud in front covers a stroke's top. `bolt.mesh` stays in the weather scene.
- `rain.update(weather, rig, time, pixelAngle)`, `bolt.update(weather, agl, sunE)` and
  `rainbow.update(weather, rig, aspect, sunDir)` are called with your `weather`: their inputs
  are yours to change.
- In screenshot mode the sky system sets `weather.quiet` (the weather settles at once, no
  stroke by chance) and `weather.forceFlash` under `debug=flash`.
- **`debug=noclouds`**: the sky system zeroes `rain`, `snow`, `veil`, `wet`, the flash, the
  thunder and `bolts` after your update, and hides the rainbow. Keep it true of anything new.
  `debug=flash` on Haven: the field's nearest stroke held at its brightest (today the
  stand-in's, from the stub's storm). `debug=storm`: a mature cell standing 8 km north-east of
  where the view opens. `?debug=sky:storm|front`: the stub's presets.
- **The governor** (main session's file): `rain` halves the streaks. There is no step for the
  field, the probe, lightning or thunder.

## The jobs, in this order

1. **The tests that fail first.** `scripts/weather-test.mjs` (checks 1, 2, 3, 5, 6, 7) and
   `scripts/bolt-test.mjs` (check 4), each exiting 1 on any failure, run on today's code: the
   wind turns with the traveller and is the same every day; rain at the eye comes from a map
   value, so it can rain under a gap; strokes come from Math.random (an hour of them differs run
   to run); ribbons are lines one pixel wide; `111200` stands on seven lines of `weather.js` and one of
   `rainbow.js`; the meter makes up all of the darkness. Push and announce "D-1 pushed <commit>:
   weather-test and bolt-test fail on today's code (1, 2, 3, 4, 5, 6, 7)", with the lines they
   printed.
2. **The wind.** `own` true on Haven; `wind` and `windSpeed` from `here` (the ground wind with
   its gusts and gust fronts: 6–15 m/s outward 3–8 km ahead of a mature cell's rain);
   `rig.east × 6 m/s` gone. Whitecaps at 7–14 m/s; leaves torn off above 9 m/s (`leaves.js`,
   `pollen.js`: thresholds only, if needed). Earth: through `fromMaps.js` when A lands (A moves
   the belts and storm vortices there out of `weather.js`: agree the day with A through the
   owning session); until then Earth keeps today's path. Checks 1 and 7.
3. **Rain and snow at the eye.** The rate is `here.rain` at the traveller's place and height
   (the field and the cells through `cellShape.js`): above zero only under a raining base, so
   walking or flying into a shaft starts the rain at its edge. The streaks as today (at most
   5 600 in a 26 m box, at least 2 px wide, lit by `skyLight`, their own slice from the eye to
   the terrain's near plane, none above 3 000 m over the ground); the veil, the rain sound, the
   sky dome's grey and the push by the ground wind all follow the same number. Snow below
   1.5 °C, from the world file's temperature model. Math.random out of `rain.js` (a seeded
   hash). Check 2.
4. **Strokes.** `takesStrikes` true. `bolt.js` rewritten as ribbons: a pool of 4 strokes,
   30–64 pieces each, a seeded walk with 12 % branches; quads turned to the eye, at least
   2.5 px and 6 m wide, a white-violet core (1.0, 0.95, 1.2) at about 60 × the Sun's light; a
   glow ribbon 5 times wider at alpha 0.25, so a stroke reads with bloom off (the governor turns
   bloom off early); a halo when bloom is on; built in planet axes, placed relative to the
   camera each frame; 2–4 return strokes over 0.2–0.5 s; from the cell's base at its place to
   the ground; alpha 0, so a stroke cannot own the meter; in `bolt.slot`. In-cloud flashes into
   `bolts`. `uFlash` as today: power × 1.3 × sunE / (1 + (d / 3 km)²). `debug=flash` on Haven
   makes a stroke (today none of its own). Check 4.
5. **Thunder** (`src/audio/audio.js`, synthesised: nothing new for `docs/ASSETS.md`): each
   strike queued for t + 3-D distance / 343 s; a crack under about 3 km, rolls beyond, nothing
   past 50 km; loudness by distance as today; a low continuous rumble while a mature cell is
   within 30 km; a stroke behind a mountain is still heard; only below 20 km over the ground.
   Rain hiss and wind sound from the traveller's numbers (the wind is no longer 0 on Haven).
   Check 3, and the printed thunder log.
6. **The meter** (`src/post/post.js`, the storm hold in `_meter` only): it makes up only D^0.55
   of the darkness D, where D comes from `here.overcast` and `here.storm` at the traveller,
   never from the Sun at the traveller's feet. Check 6. Then look at `ship`, `dusk` and the
   storm views: the hold must work with the highlight, `coverFrom` and globe rules.
7. **The storm grade** in `src/render/look.js` (saturation 0.82, contrast 1.12, cool shade),
   blended in by the storminess at the traveller; **the sky dome** greyed under overcast
   (`src/sky/skyDome.js`).
8. **The rainbow** from the cells and the field 2–20 km away on the side away from a low Sun,
   in metres from `world.radius`.
9. **The pictures** (below).

## The checks

`node scripts/weather-test.mjs` and `node scripts/bolt-test.mjs`, exit non-zero on any failure,
each failing on today's code:

1. Flying 10 km east turns `uWind` no more than the field does.
2. Rain at the eye is above zero only where at() rains and the traveller is under the base
   there.
3. Each thunder arrives at distance / 343 s ± 0.05 s; an hour of strikes is identical across
   two runs.
4. A ribbon's half-width is at least 1.25 px at 2, 10 and 40 km at the phone's pixel angle
   (880x412 at dsf 3.5); a stroke's vertices stay fixed in planet axes while the camera moves
   at 50 m/s for 0.5 s.
5. No `111200` is left in `src/weather`. Earth's wind and rain are within 2 % of today's at
   five places (keep today's numbers in the test, taken before anything moves).
6. Meter replay: at darkness 0.15 the exposure is at least 1.2 stops darker than full
   compensation; clear days stay within ±0.05 stops of today; a heap's shadow passing over the
   figure moves the exposure by at most 0.05 stops.
7. The wind at the traveller reaches 6 m/s or more, outward, before a raining cell arrives.

In the game, headless: `debug=flash` on Haven makes a stroke.

## The pictures

From a frozen build, `node scripts/shots.mjs --dist --distdir <build> --world haven --shot
ledge --size 880x412 --dsf 1.25 --out docs/shots/sky --query "..." --suffix _D-<view>
--timeout 1500`. Against the stub's `storm` first, then A's model when it lands. A pair (before
and after) wherever something changed. **From the air first** (three minutes each; one at the
eye in a wood costs twenty):

- `debug=flash` with the stroke 3 km and 20 km off, seen from 1.5 km up, with bloom on and at
  `?debug=floor`;
- streaks under a cell from 60 m over the ground;
- the windy day: whitecaps from 60 m over the sea, and leaves torn off.

Then at the eye: streaks under a cell from the ground; the storm grade from under the anvil; a
rainbow after an evening storm. And the printed thunder log: times, distances, loudness.

## Files

Yours: `src/weather/weather.js` (the reader of at() and strikes(); Earth through `fromMaps`
when A lands), `rain.js`, `bolt.js` (ribbons), `rainbow.js`, `src/audio/audio.js`,
`src/post/post.js` (the storm hold in `_meter` only), `src/render/look.js` (the storm grade
only), `src/sky/skyDome.js` (grey under overcast), `src/life/leaves.js` and `pollen.js`
(thresholds only, if needed); new `scripts/weather-test.mjs` and `scripts/bolt-test.mjs`.

Not yours: `src/app.js` (anything new to wire there: ask), `src/sky/skySystem.js` (it calls
your modules through the interface above: uWind, uWeather.w, the strikes, the bolt slot, the
hover drift), `src/perf/governor.js`, `src/perf/benchmark.js`, `CLAUDE.md`; step 0's
`format.js`, `steer.js`, `cellShape.js`, `stub.js` (changes through the owning session); A's
model and `skyField.js` (you read `at()` and `strikes()`, nothing more); B's `cloudVolume.js`
(your flashes reach it through `bolts` only); C's files; `src/worlds/haven.js` (the grade's,
the meter's and the rain's numbers go in your report; the owning session moves them).

## Rules that bite

- Everything comes from the place and the time: nothing from `rig.east`, no Math.random, no
  '111 200 m a degree' (metres from `world.radius`; on Haven a degree is 4 363 m).
- No world's name in the engine. Every governor step thins, none removes: at the floor a storm
  keeps its rain, strokes and thunder.
- Every new script imports by relative paths, exits non-zero on any failure, and is seen to
  fail once with its fault put in.
- Keep green before every announced push: `./scripts/build-check.sh`,
  `node scripts/sky-system-test.mjs` (79 ok at step 0; its checks of the noclouds rain and the
  interfaces are about your modules), `sky-steer-test.mjs` (34), `sky-format-test.mjs` (47),
  `sky-cell-test.mjs` (31), `node scripts/governor-sim.mjs`, `npm run smoke`, and yours.
- One headless browser at a time on your machine. Long runs detached (`nohup setsid`), from a
  frozen build, writing a line to a log when each step is done.

## Cost

The phone's tenth results are `docs/benchmarks/2026-11-25-haven-e9d4888.txt`: Sharp, 28.5 fps,
0.86 % of frames late; the page's own work 7.6 ms a frame on average; the ledge at 25.9 fps,
3.0 % late, at 1.65 MP (the bottom of the resolution range: no room). In its cost test the
`rain` saving read −3.1 ms at the ledge: noise (believe only differences of 3 ms or more that
repeat); the streaks cost about nothing on the phone. The plan: ribbons at most 4 × 64 quads
and no texture; `at()` and the probe under 0.05 ms of page work a frame; audio off the GPU.
Every new cost (the glow ribbon, the grade, anything else) gets a governor step that thins,
never removes: build its setter and send the owning session its id, label and what it buys, to
wire. Counts headless only, never a frame rate; the phone decides.

## Merging

- Merge `origin/ccr-aa39490a-qiw63x` into your branch before every announced push, build, and
  run the checks.
- The other sky helpers' branches: `ccr-aa39490a-sky-A-model` (the field: merge it as soon as
  it builds), `ccr-aa39490a-sky-B-clouds` (the uBolt that lights both flashes), and
  `ccr-aa39490a-sky-C-shade` (the probe): merge them when they build. Push early so they can
  merge you.

## What to hand back

- Each job as it lands, pushed and announced to the owning session in one line with the
  commit and the pair ("D-4 pushed abc1234: strokes as ribbons, 2.5 px at 40 km; flash pair in
  docs/shots/sky/"). Messages with `send_message` (its id is in your first message), short.
- Anything needed in `skySystem.js` or `app.js`, under "Asked of the main session" in your
  report and in a message.
- Your report (`docs/briefs/sky-D-report.md`), kept as the work goes: what was built; each
  check with its numbers and how it was seen to fail; the pictures (paths); the thunder log;
  numbers for `haven.js`; cost; behaviour changes for the checkpoint message; what is open.
- When all is done: "D-DONE pushed <commit>".
- Never put a model's name in a commit; end commit messages with the two attribution lines
  your session's instructions give.
