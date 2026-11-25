# Brief D: rain, lightning, thunder and wind where the traveller is; storms kept dark

Read `docs/briefs/sky-step0.md` first (what stands, the rules for every package), then
the plan (`docs/briefs/clouds-weather-plan.md`): "GROUND WIND", "## Rain and storms" (all
of it: rain at the eye, dark storms, lightning, thunder, wind, rainbow, when it rains), "5.
RAIN, RIBBONS, AUDIO" and "### D." under "Work packages", which is your job, its files, its
checks and its pictures. Branch `sky-D` from the head of the main session's branch.
Report: `docs/briefs/sky-D-report.md`.

## The interfaces you build behind (src/sky/skySystem.js; do not edit it)

`weather.js` keeps the interface at its top; the sky system calls it every frame:

- `update(rig, dt, sunDir, day, sunE, skyFrame)`: `skyFrame` is the sky's frame: `t` (the
  weather clock), `tPrev`, `noiseT`, `steer`, `field`, **`here`** (`field.at()` at the
  traveller: ground wind east and north with gusts, rain at the traveller's height, snow,
  temperature, overcast, storm darkness, fog, wet, base, top, the cell overhead), `cells`
  (in reach, nearest first, with `dist`), **`strikes`** (the field's strokes since the last
  frame within 60 km, each with `pos` [x, y, z] planet axes and `dist`; none after a jump
  of the clock), `world`, `noClouds`, `shotMode`.
- **`own`**: set it true on a world whose weather is made by rule (Haven) when you read it
  from `skyFrame.here`. Then the sky system takes your `wind` and `windSpeed` for `uWind`
  (trees, grass waves, sea and whitecaps, leaves, pollen), `sunShade` and `skyShade` for
  `uWeather.x/y` (only while the shade probe, package C, has no value), `wet`
  (`uWeather.z`), `veil` (`uWeather.w`), the wind sound, and the drift of a figure hovering
  with the stick let go (that rule is the sky system's, as the plan has it). With `own`
  false (Haven today) it is the steady breeze from the west and no weather at all.
- **`takesStrikes`**: set it true when you turn `skyFrame.strikes` into strokes, their
  light (`flash`, `flashLight` for `uFlash`) and thunder (`heard()`: what has arrived this
  frame, `{ power, dist }`; the audio's `thunder(power, dist)` is called with it). Until
  then a stand-in in the sky system makes one flash a frame and queues its thunder.
- **`bolts`**: null, or up to two `{ pos: [x, y, z] planet axes, power }`, the flashes that
  light their cloud from inside: the sky system hands them to the volume's uBolt setter
  (`CloudVolume.setBolts`). Null: it makes one of `flash` when that is in the cloud.
- **The bolt slot**: give `Bolt` an Object3D `slot` (your ribbons, built in planet axes and
  placed relative to the camera each frame); the sky system adds it to `boltScene`, drawn
  after the far sheets and shells and before the near cloud slices. `bolt.mesh` stays in
  the weather scene (drawn after the clouds) for what belongs there.
- `rain.update(weather, rig, time, pixelAngle)` and `rainbow.update(weather, rig, aspect,
  sunDir)` are called with your `weather`: their inputs are yours to change.
- `debug=noclouds`: the sky system zeroes `rain`, `snow`, `veil`, `wet`, the flash, the
  thunder and `bolts` after your update, and hides the rainbow. `debug=flash` on Haven:
  the field's nearest stroke held at its brightest in a picture (today the stand-in's).
- `post.js` (the meter's storm hold), `look.js` (the storm grade), `skyDome.js` (grey under
  overcast) and `audio.js` are yours; `app.js` is not (the main session wires anything new
  there: ask in the report).

## Checks and pictures

The plan's seven checks in `node scripts/weather-test.mjs` and `node scripts/bolt-test.mjs`
(each fails on today's code), the headless `debug=flash` on Haven, the pictures and the
printed thunder log. No `111200` left in `src/weather`.
