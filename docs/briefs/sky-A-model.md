# Brief A: the day's weather (the model, systems, cells, strikes and the field)

Read `docs/briefs/sky-step0.md` first (what stands, the rules for every package), then
the plan (`docs/briefs/clouds-weather-plan.md`): "The weather model" (all of it), "THE
FIELD" under "Rendering and cost", and "### A." under "Work packages", which is your job,
its files, its checks and its pictures. Branch `sky-A` from the head of the main session's
branch. Report: `docs/briefs/sky-A-report.md`.

## Where your code goes (step 0's places)

- The model: `src/weather/sky/model.js`, `systems.js`, `land.js`, `cells.js`, `strikes.js`,
  `fromMaps.js` (Earth), as the plan says. Pure JS (no three, no DOM, no Math.random).
- **It replaces the stub in `src/weather/sky/producer.js`**: `makeProducer(opts)` returns
  your model's `{ snapshot(t), at(place, t, out), cells(t), strikes(t0, t1), records(ta,
  tb) }` (and `anvils(t)` if you list anvils for the shaders: the sky system packs them
  into `uAnvils` when the field has it). Keep the stub reachable for the debug presets
  (`opts.preset`: `?debug=sky:<preset>` must still give the stub).
- The worker is `src/weather/sky/skyWorker.js` (the plan's `skyWorker.js`): it calls
  `makeProducer` with the options the page posts (plain data: the land's arrays are posted
  once, at `init`).
- `src/sky/skyField.js`: rewrite its inside (three snapshot slots, 32-row strip uploads
  between frames, the 'now' blend as a GPU pass scissored to a sixteenth of the rows, its
  CPU copy for `at()`) and keep its interface: `setWorld(world, opts | null)` (null: no
  field, the worker ended), `update(t)` (between frames), `on`, `busy` (a picture waits
  for it), `at`, `cells`, `strikes`, `anvils?`, `textures`; the 'now' maps are
  `SKY_UNIFORMS.tWxA/B/C`, and `SKY_UNIFORMS.uSkyLow.w` is 1 once they are there.
- The format is fixed (`format.js`: `ENC`, the channels, `CELL`, `LENS`); a change goes
  through the main session with `scripts/sky-format-test.mjs` in the same commit.
- Lows, fronts, highs and cells move with `steer.js`'s motions (`motion('mid', t)`,
  `motion('cell', t)`): positions are `M(t) M(t_birth)^-1 p_birth`, a closed form.

## What the sky system already does with your field

- `SkySystem.weatherStep` calls `field.update(t)` with the weather clock, then
  `field.at([x, y, z], t, here)` at the traveller, lists `field.cells(t)` within 200 km
  (nearest first, with `dist`) into the frame and the nearest 8 into `SKY_UNIFORMS.uCells`
  (through `cellGeometry`: your cell objects need `x, y, z` (unit), `radius`, `base`,
  `top`, `stage`, `strength`, and may carry `rain`, `core`, `age`, `seed`, `tilt`, `shaft`,
  `frame`), and lists `field.strikes(tPrev, t)` within 60 km into the frame's `strikes`.
- On Haven the field is made only under the debug switches today; when the model is
  ready, ask the main session to make it always on (and to drop the stub as default).
- Earth: its recipe is 'maps' and `weather.js` still reads its maps; `fromMaps.js` gives it
  one static snapshot, a cell list and its belts and vortices (the plan, "EARTH").

## Hand back to the main session

- Haven's `weather` block (its numbers and recipe names; the seed from
  `scripts/find-weather.mjs`), the scene days, the bookmarks with their hours ('Morning
  mist', 'Afternoon storm', 'A front coming', 'Wind on the Crown') and the cost views with
  their hours ('under the storm', 'a storm from afar', 'in the morning mist'): in your
  report, as text the main session pastes into `haven.js`.
- `scripts/make-world-maps.mjs`: new outputs only (`haven_wxland_1024.u8`,
  `haven_peaks.json`); every existing output byte for byte the same (check it).

## Checks

The plan's eleven (`node scripts/sky-model-test.mjs`, which must also fail when fed a
producer that wraps today's static cloud map: checks 3, 4 and 7), and the pictures
`scripts/sky-map.mjs` makes without a browser. Then, when a browser is free, play-profile
at x60 on a frozen build: page work at most +0.3 ms, uploads at most 260 KB a frame.
