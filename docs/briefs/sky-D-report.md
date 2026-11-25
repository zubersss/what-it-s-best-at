# Report D: rain, lightning, thunder and wind where the traveller is

*The report of `docs/briefs/sky-D-storm.md`, kept as the work went. Branch:
`ccr-aa39490a-sky-D-storm` (begun from `origin/ccr-aa39490a-qiw63x`, step 0's head `f3a1eb7`).*

## What was built

**The one idea.** On a world whose weather is made by rule, `weather.js` invents nothing any
more: it reads the sky's field at the one place that matters (`sky.here`, what `at()` says at the
traveller) and the strokes of the last frame (`sky.strikes`), and hands them on. Everything the
traveller feels — the wind in the trees, the rain at the eye, the dark of a storm, its strokes
and its thunder — is therefore a function of the day, the hour and the place, and nothing of it
can move because the traveller moved.

1. **The wind** (`own` true on a made world as soon as the field answers). `uWind` is the field's
   ground wind at the traveller, whole: its exposure on a crest, the slope and sea winds, its
   gusts and the gust front that runs out 3 to 8 km ahead of a mature cell's rain. The old
   `rig.east` at the sea's fixed 6 m/s is gone, so the trees, the grass waves, the sea and its
   whitecaps, the leaves and the pollen all follow that day's weather, and a hovering figure
   drifts with it. No smoothing is laid over it (the field's own wind is already smooth in space
   and time, and a lag would make the value depend on the path flown).
2. **Rain and snow at the eye.** The rate is `here.rain` / `here.snow` at the traveller's own
   place and height. `at()` gives none above the base the rain falls from, so flying or walking
   into a shaft starts the rain at its edge and standing under a gap between heaps is dry. The
   veil (`uWeather.w`), the rain's sound, the sky dome's grey and the push of the streaks by the
   ground wind all follow the one number. The streaks keep their box, their width of at least two
   pixels, their light from `skyLight` and their own slice from the eye to the terrain's near
   plane; `Math.random` is out of `rain.js` (a drop's four numbers come from its index), and in a
   picture the streaks and the bow settle at once instead of over a hundred frames.
3. **Strokes** (`takesStrikes` true). `bolt.js` rewritten as ribbons: a pool of four strokes, 64
   pieces each, a seeded walk from the cloud's base at the strike's own place down to the ground
   there, with 12 % branches that stop in the air and take no piece the channel needs. Quads
   turned to the eye: a white-violet core (1.0, 0.95, 1.2) at 60 times the Sun's light, never
   under 1.25 pixels of half-width or 3 m, with a glow ribbon five times as wide at a quarter of
   the light, so a stroke reads with the bloom off. Alpha 0, so it cannot own the meter. Built in
   planet axes round its own foot and placed relative to the camera each frame. 2 to 4 return
   strokes over 0.2 to 0.5 s. Drawn in the bolt slot (`bolt.slot` and `bolt.mesh` are the same
   object, so the strokes are drawn where step 0 put the slot and cloud in front covers their
   tops). Up to two flashes at a time are handed to B's `CloudVolume.setBolts` to light their own
   cloud from inside, at full strength whatever the distance (a tower 80 km off flickers at
   night). `?debug=flash` on Haven holds the nearest stroke to the ground of the next ten minutes
   at the top of its first flicker.
4. **Thunder.** Each stroke is queued from its own moment (its lag inside the frame taken out)
   for distance / 343 m/s. `audio.js` keeps its crack under about 3 km, its roll beyond, nothing
   past 50 km, and its loudness by distance (now the pure `thunderLoudness`); new is a low rumble
   between the claps — each arrival raises a bed that dies away over some fifteen seconds, so
   while a cell is within 30 km (2 to 12 strokes a minute) the air never goes quiet. A stroke
   behind a mountain is still heard, and nothing is heard above 20 km over the ground. Earth's
   own strokes are now a hash of the place and the moment instead of `Math.random`, so a
   benchmark meets the same storm twice.
5. **The storm in the picture** (new `src/weather/storm.js`: the one place the picture reads what
   the cloud overhead is doing, written once a frame by `weather.js`).
   - *The meter* (`post.js`): its target is now the pure `meterTarget()`, and it makes up only
     part of what the cloud takes — `light^0.45`, where `light` is the share of the day's light
     the cloud overhead leaves (a closed deck about 0.15, a storm's base 0.06). The darkness
     never comes from the Sun at the traveller's feet, so a heap's shadow over the figure cannot
     dim the frame. A stroke writes alpha 0 and cannot own it either.
   - *The grade* (`render/look.js`): a storm grade blended in by the storminess at the traveller
     (saturation 0.82, contrast 1.12, a cool shade, a flat light; `?debug=nostorm` takes it off).
   - *The sky* (`sky/skyDome.js`): greyed under a closed deck only (nothing under 0.55 of
     overcast, so a heap passing overhead leaves the sky its colour).
6. **The rainbow.** It asks the field (or Earth's maps) for rain 2.5 to 18 km off on the side away
   from a low Sun, in metres through the world's own radius, and only when the Sun is low enough
   for a bow to stand at all (four looks, none with the Sun high).
7. **No '111 200 m a degree'** anywhere in `src/weather`: every distance is metres through
   `world.radius` (4 363 m a degree on Haven, 111 195 on Earth).

New scripts: `scripts/weather-test.mjs`, `scripts/bolt-test.mjs` (the checks), and
`scripts/storm-sites.mjs` (where to point a camera for a picture of the weather: the cells, the
held stroke, where to stand in a shaft, the windiest sea and land, and the best moment and
heading for a rainbow — all without a browser, in seconds).

## Checks (each with its numbers, and how it was seen to fail)

`node scripts/weather-test.mjs` (checks 1, 2, 3, 5, 6, 7) and `node scripts/bolt-test.mjs`
(check 4). Both exit non-zero on any failure, and both were seen to fail on the code as it stood
(commit 474955d's message has what they printed then). Every check also has a fault that can be
put in with `--break <fault>`, and was seen to fail with it.

| # | What it asks | Now | Seen to fail |
| --- | --- | --- | --- |
| 1 | `uWind` is the field's ground wind at the traveller | 8.69 m/s toward 77 deg at the opening place against the field's 8.69 toward 77; 6.79 toward 76.4 ten km east: 0.00 deg and 0.00 % apart, level to 4e-17. 10 km east turns it 0.42 deg, exactly the field's turn | on the old code: 13.57 deg and 31 % off, turning 0.00 deg; `--break wind-east` |
| 2 | rain at the eye only where at() rains, under the base | 1 248 places and heights round three raining cells and over the country: 138 rain, 1 110 do not (91 of them under a gap between heaps), 0 disagree, none above the base | old code: no rain at all; `--break rain-map` (82 disagree) |
| 3 | thunder at distance / 343 s, the same strokes twice | Haven: 932 strokes in an hour, every one queued to within 0.0000 s of its own moment plus distance / 343, each heard within one frame of its time, the same list in two runs. Earth: 936 in an hour, the same twice | old code: no stroke from the field at all; Earth 928 then 941 (Math.random); `--break thunder-now`, `--break thunder-random` |
| 4 | a stroke is seen on a phone and stands still | half-width 2.43 px at 2 km (6.0 m wide), 1.25 px at 10 and 40 km (15.4 and 61.8 m wide), by the rule the shader itself is made from; 0.000 m of movement in planet axes over 248 vertices while the camera flies 50 m/s for half a second; 64 pieces, 4 at once, from the base at 2 708 m to the ground at 1 470 m, wandering 11 % of its drop; alpha 0 and a glow ribbon 5 times the core | old code: no width rule (1-px lines), 23.3 m of movement, the stroke cut off 300 m above the ground, no alpha 0, no glow; `--break thin / camera / alpha / noglow` |
| 5 | no '111 200', Earth unmoved | none left in `src/weather`; Earth's wind, rain, cloud top, shade, veil and warmth within 0.00 % of the table taken before anything moved, at five places | old code: `weather.js` and `rainbow.js`; `--break earth-moved` (5 %) |
| 6 | the meter holds the dark | 1.23 stops darker than full compensation with 0.15 of the light left; a clear sky within 0.000 stops of the old meter; a heap's shadow over the figure 0.000 stops | old code: no `meterTarget` and no `storm.js` at all; `--break meter-full` (0.00 stops), `--break meter-feet` (0.98 stops) |
| 7 | a gust front before the rain | 17.3 and 19.7 m/s, 93 % outward, before each cell's rain arrived (5.0 and 5.2 minutes ahead of it) | old code: 0.0 m/s; `--break gust-none` |

In the game, headless: `?debug=flash` on Haven draws a stroke to the ground 22.3 km off, held at
its brightest, with its light on the sky (uFlash 0.03) — `scripts/sky-system-test.mjs`, which
passes whole (79 checks) with the main session's one-line amendment of its line 752.

Also green: `./scripts/build-check.sh`, `sky-steer-test`, `sky-format-test`, `sky-cell-test`,
`governor-sim`.

## The thunder log (an hour at the opening place, the stub's storm)

    the stroke's moment   how far off   its thunder arrives   loudness
    1875606.9 s            35.9 km       +104.7 s              0.029
    1875609.4 s            34.4 km       +100.4 s              0.031
    1875611.3 s            37.4 km       +109.1 s              0.035
    1875613.4 s            22.3 km        +65.0 s              0.136
    1875614.5 s            24.7 km        +72.0 s              0.092
    1875615.2 s            23.6 km        +68.8 s              0.097
    1875616.2 s            23.1 km        +67.5 s              0.114
    1875616.3 s            35.6 km       +103.7 s              0.034
    932 strokes in the hour; 635 of them within 30 km (loudness 0.05 to 0.51), 7 past 50 km
    (heard as nothing). Every arrival at its own distance over 343 m/s to within 0.0000 s.

## Pictures (paths; before and after)

All in `docs/shots/sky/`, named `haven_ledge_D-<view>-<after|before>.png`, taken from frozen
builds of this branch and of step 0's head (`f3a1eb7`), at the reference shape (880 x 412 at
dsf 1.25). The camera of each was chosen with `scripts/storm-sites.mjs`, which says where the
cells are, which stroke `?debug=flash` will hold, and where to stand in a shaft.

| view | what it is | where |
| --- | --- | --- |
| `flash20` | a stroke 22 km off, from 900 m over the opening place | the ledge, `debug=flash&alt=2400&heading=28&pitch=4` |
| `flash3` | a stroke 4.5 km off, from 500 m up outside the storm | `lat=-44.8299&lon=51.5153&alt=2000&heading=39&pitch=8` |
| `anvil` | under a mature cell (storm 1.00, overcast 1.00, no rain): the dark, the grade, the grey sky | `lat=-55.5390&lon=54.1375&alt=1511&heading=145&pitch=8` |
| `windy` | the opening view 11 h on: a mature cell 6 km off and its gust front at 22 m/s | the ledge, `t=11` |
| `shaft` | the streaks under a cell's core, 60 m over the ground (16 mm/h) | `lat=-43.5971&lon=52.3652&alt=1523&heading=206&pitch=-4` |
| `caps` | whitecaps: 14 m/s over the sea, the coast 7 km west | `t=8&lat=-41.0421&lon=65.3642&alt=60&heading=270&pitch=-6` |
| `bow` | a rainbow after an evening storm | `t=-0.25&lat=-47.7279&lon=62.7564&alt=253&heading=235&pitch=8` |
| `flash20floor`, `flash3floor` | the same two strokes at `?debug=floor` (every saving on) | as above |

What they showed, and what it changed (each of these is in the branch):

- **flash20**: the stroke 22 km off is a clear white channel; before, a one-pixel speck. But the
  first take came out 1.9 stops darker than the before picture (exposure 1.10 against 4.13): the
  stroke was owning the meter's highlight through the lit ground behind it. Fixed (commit
  d9c0c35), and the re-take meters exactly as the before picture does.
- **flash3**: the first camera (inside the shaft at 2 300 m) showed no stroke at all — the
  nearest was 1 km away at a bearing 73 degrees off the view — and what fell there was snow, not
  rain: on Haven the air is at 1.5 degrees by about 2 km up, so rain at the eye above that is
  snow. The camera moved to 500 m over the ground outside the cell, where the nearest stroke is
  4.5 km off at 9 degrees of elevation.
- **windy**: the opening view 11 h on, with a mature cell 6 km off and the field's wind at
  22.4 m/s (storm 0.60, overcast 0.78 at the traveller): leaves are torn off and stream through
  the air across the whole view, where before nothing moved. It is the windiest moment of the
  two days round the scene, found with `storm-sites.mjs`; at that hour it is also evening, so
  the picture is a dusk one.
  The pair is the plainest of all: before, a calm bright meadow at dusk with every blade
  upright; after, the same place a stop darker and bluer, the grass laid over and leaves
  streaming through the air.
- **anvil**: a clear pair. Before, a warm golden hillside under a bright blue sky (exposure
  5.07); after, the same ground cool and dark under a near-black sky (exposure 3.37), because
  everything lit through the shared chunk now stands in 0.04 of the Sun and 0.27 of the sky,
  the meter gives back only part of it, and the grade has taken the warmth out. The sky's grey
  does reach the dome (a probe of the running page reads `uStorm = [0.12, 1, 1, 1]`), but at a
  mix of 0.72 a tenth of the clear sky still shows through, so it reads as a dark navy rather
  than as a lid; the deck's light is desaturated now, and the mix is a number for the world file.
  What this view cannot show is the cloud itself: package B draws the cells, and until it does
  there is nothing overhead to be dark, so a storm's ground is lit by a clear sky.

## Numbers for src/worlds/haven.js

Nothing has to move for the package to work; these are the numbers the main session may want in
the world file, with the engine's defaults as they stand:

- `look.storm` (the storm grade, `render/look.js` `STORM_GRADE`):
  `{ sat: 0.82, contrast: 1.12, shade: [0.86, 0.93, 1.12], light: [0.93, 0.96, 1.04] }`.
- The shade under cloud where C's probe has nothing (`weather.js`): the Sun's share
  `max(0.04, (1 - 0.93 * storm) * (1 - cloudShadow * smoothstep(0.2, 0.75, overcast)))`, the
  sky's `max(0.12, (1 - 0.55 * smoothstep(0.3, 0.9, overcast)) * (1 - 0.4 * storm))`. Under a
  mature cell that is 0.04 of the Sun and 0.29 of the sky, which is the plan's 0.05 and 0.3.
- The meter's hold: `METER_HOLD = 0.45` (`post.js`); the light the cloud leaves,
  `stormLight()` in `storm.js`: `max(0.06, (1 - 0.85 * deck) * (1 - 0.88 * storm))` with
  `deck = smoothstep(0.35, 0.95, overcast)`.
- The sky dome's grey under a deck: from 0.55 of overcast, up to 0.72 of the zenith's own grey.
- The strokes (`bolt.js` `BOLT`): 4 at once, 64 pieces, 12 % branches, 1.25 px and 3 m of
  half-width at least, the glow 5 cores wide at 0.25, the core 60 Suns.

## Cost (headless work counts; the phone decides)

- The strokes: at most 4 x 64 quads (1 024 vertices, 512 triangles), no texture, one draw call,
  and nothing at all when no stroke is alight (the pieces of an unused slot are thrown out of
  the picture, not drawn with no size). The walk is built once per stroke, some 60 random numbers.
- `at()` at the traveller is one read of the field's bytes plus the cells in reach: the stub's
  own measure is under 0.05 ms a frame, and nothing else of this package reads the field per
  frame except the rainbow's four looks, which are taken only while the Sun is low enough for a
  bow.
- The meter's hold, the grade and the sky's grey are arithmetic on numbers already read.
- Governor: `bolt.js` has a `bolt-glow` step (the glow 2.5 cores wide at 0.3 and half the pool);
  it thins and never removes — at the floor a storm keeps its rain, its strokes and its thunder.
  Its wiring in `perf/governor.js` and `SKY_SAVINGS` is asked of the main session.

## Behaviour changes for the checkpoint message

- Haven's wind is the day's and the place's: calm days lie flat, gales whitecap the water and
  tear leaves off the trees, a gust front thrashes the trees before a storm's rain arrives, and a
  hovering figure drifts with the wind when the stick is let go.
- Rain and snow fall on Haven where and when the weather says: walking or flying into a shaft
  starts the rain at its edge, and a gap between heaps is dry.
- A storm is dark to stand under: the picture is held about a stop and a quarter darker than it
  was, with fewer colours, more contrast, a cool shade and a grey sky under the deck.
- Lightning is drawn as ribbons that read on a phone (they were one-pixel lines), stands still in
  the world while the traveller flies, and reaches the ground at the strike's own place.
- Thunder arrives after its delay as before, and a storm within 30 km now leaves a low rumble
  between the claps.
- Earth's lightning is the same in two runs of the same minute at the same place (it was chance).
- The exposure meter no longer makes up all of the darkness under cloud; clear weather is
  unchanged to within 0.000 stops.

## Open

- The pictures of the ground-level views (streaks under a cell at the eye) are the slowest on this
  machine and are the last to land.
- `weather.squall` is 0 on a made world (the cloud volume read it for its storm patches): the
  plan gives that to the cells' own stage, which is package B's. B's cells should not need it.
- Earth keeps its own belts, storms, showers and strokes in `weather.js` until package A's
  `fromMaps.js` lands; the only change there is that its strokes are deterministic.

## Asked of the main session

1. **Done** — `scripts/sky-system-test.mjs` line 752: it asserted the stand-in's behaviour through
   `weather.flash`, which the weather now owns; `sky.flashOwn` is the stand-in's own record
   (amended in c39418a).
2. **The governor step for the strokes' glow.** `bolt.js` answers `saving('bolt-glow', off)`,
   `live('bolt-glow')` and `has('bolt-glow')`. Label: *"the strokes' glow narrower (2.5 cores at
   0.3) and half the pool"*. What it buys: almost nothing measurable (512 triangles, no texture) —
   it is there because every new cost gets a step, and it is the last step that should ever be
   pulled. It needs a line in `SKY_SAVINGS` and a setter in `skySystem.js` that forwards to
   `this.bolt.saving(...)`.
3. **Nothing else.** `app.js` needs no change: the weather, the rain, the strokes, the rainbow and
   the thunder all reach the frame through the interfaces step 0 laid down.
