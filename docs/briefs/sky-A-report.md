# Report A: the day's weather

What package A of `docs/briefs/clouds-weather-plan.md` built (brief: `docs/briefs/sky-A-model.md`),
on branch `ccr-aa39490a-sky-A-model`. The main session reads this file and the branch.

## What was built

**The model** (`src/weather/sky/`, pure JS: no three, no DOM, no `Math.random`, nothing of the
traveller). Haven's weather is now a function of (seed, date, hour, place):

- `land.js` — the land as the weather needs it: the country `hC` (the ground smoothed over 15 km,
  which the cloud bases stand over), the hills `hS` (4.5 km) and their gradient, the floor of each
  hollow `gmin` (8 km), the land mask and the distance to the sea; the summits (598 of them over
  600 m of prominence, with the bearing of their ridge); and the 1 073 trigger sites where storms
  are born (proud high ground 5 km apart, and the sea-breeze line 12 km inland). One rule, two ways
  in: `makeWxLand()` works the planes out from the elevation map (a second), `readWxLand()` reads
  them back from `public/data/haven_wxland_1024.u8`. A `Spacer` keeps sites and summits apart
  through a lattice of buckets, not by measuring every pair (that cost 1.6 s at start-up).
- `systems.js` — lows with their fronts, highs between them and tropical waves, each born at a slot
  of the clock and carried **rigidly by M_mid** (steer.js), centre and front points alike. What they
  do at a place: lift, a rain deck, the shields of mid and high cloud ahead of a warm front, moist
  air in the warm sector, dry unstable air behind a cold front, a gustier wind.
- `model.js` — the chain: moisture (the latitude's climate × the day's × how far the sea is upwind ×
  the dry lee of the ranges, with a soft ceiling), heat and lift, then the kinds — heaps with caps,
  cloud streets and a dry lee; sheets (marine decks, the fronts' rain decks, cloud banked on
  windward slopes) with their thickness; the base; the fog's top; the mid and high layers with the
  live cells' anvils painted in through `cellShape.js`; the field's rain; the wet ground; the ground
  wind with its slope wind, sea breeze, gust fronts and gusts; the temperature and snow; and the
  lenticulars' list.
- `cells.js` — a storm cell is a (trigger site, half-hour slot) pair that exists when a hash falls
  under the chance the weather there gives. It is *blocked* by a stronger candidate within 40 km
  whose life overlaps, and *capped* when eight stronger ones overlap it anywhere. Neither test asks
  the time the question is put at, so a cell's existence is fixed the moment its slot is reached:
  nothing pops in or out as the clock runs, and a window split in two gives the same cells.
- `strikes.js` — every flash is a hash of its cell and a 0.7 s slot; a third reach the ground inside
  the rain core. A split window is the union of its parts.
- `fromMaps.js` — Earth: one static snapshot at 2 048 × 1 024 from its 8 September 2017 maps (cover,
  the mid layer from tops of 4–7 km, the high from over 7 km, rain), its storms as still cells with
  towers, rain, anvils and deterministic lightning, and the belts and storm vortices as the ground
  wind, moved out of `weather.js`.
- `producer.js` — `makeProducer` now gives the model for a world whose weather is `made`,
  `fromMaps` for one that is `maps`, and step 0's test pattern for `?debug=sky:<preset>`. It also
  holds the one rule for the local solar hour (`localHour`, `tForHour`), which the model, the
  scripts and the tests all use.
- `skyWorker.js` — unchanged in shape; it now makes the model's snapshots.

**The field** (`src/sky/skyField.js`, the inside rewritten, the interface as step 0 fixed it):
three snapshot slots as raw GL textures that three only binds, filled a 32-row strip of one map at
a time between frames (at most 128 KB a frame on Haven, against the 260 KB budget) with
`texSubImage2D` and no mip maps; the 'now' maps are render targets blended from the pair on the
GPU, a sixteenth of the rows a frame, scissored — whole while the clock runs over ×60 and for the
first maps a picture waits for. After a jump the old maps keep showing and the new ones are faded
in over two seconds with a constant blend factor (no second target, no read-back). In Node the same
blend runs on the bytes, so the tests can read what the GPU would be reading.

**The tools** (no browser in any of them):

- `scripts/sky-model-test.mjs` — the plan's eleven checks (below).
- `scripts/find-weather.mjs` — `--probe` (the chain at a place hour by hour), `--bands` (what the
  checks measure), `--days N` (day by day at a place), `--seeds a,b,c` (each seed scored on the
  three scene days), `--scene` (the chosen days, and the bookmarks' hours to paste).
- `scripts/sky-map.mjs` — the weather from above over the land's shaded relief: each kind, the
  rain, the cells and their strikes, the wind by layer, a time-lapse, a meteogram, and the land the
  weather is worked out over.
- `scripts/lib/earthMaps.mjs` — Earth's maps as plain numbers for Node (through Python's PIL), and
  the comparison with `weather.js`.
- `scripts/make-world-maps.mjs` — two new outputs; every existing output byte for byte the same.

## Checks

`node scripts/sky-model-test.mjs` — all 34 pass (about three minutes). Numbers from the last run:

| # | What | Measured |
| --- | --- | --- |
| 1 | determinism | the same bytes twice in one process and in another; at() the maps' own bytes at 60 places (0.000 of a byte); nothing under `src/weather/sky` uses three, the DOM or `Math.random` |
| 2 | no traveller input | a place has the same weather after at() at 200 others, and the same cells and strikes |
| 3 | mountains | cover over land above 2 000 m is **5.8×** that below 500 m at 15 h; windward **8.6×** the lee; the day's mean cover against the height of the land **r = 0.45** (the static map 0.03) |
| 4 | the day's cycle | heaps at 15 h **16×** those at 07 h; fog at 06 h against none at 14 h; the opening place stands **1 451 m** over every fog top within 2 km (300 wanted) |
| 5 | motion | the systems carried by M_mid to **0.00°** and 0.0 %; on a calm day no texel's cover changes by more than **0.11** between snapshots, on a gale the 99.9th is **0.20**; no cell moves faster than its steering |
| 6 | days differ | over 90 days **17** calm (under 3 m/s) and **9** gales (over 10); the high layer **3.8×** the low on the windiest |
| 7 | rain | an hour or more on **42 %** of days at the opening place; **0** of 1 416 raining texels rain over 0.5 mm/h under a thin cover or under the ground |
| 8 | storms | a cell that can strike within 40 km of the Crown on **35 %** of afternoons; none over land 03–09 h local but on a front; at most **7** alive at once; a split window's strikes are the union of its parts |
| 9 | cost | a snapshot of 1 024 × 512 in **562 ms** (the best of four 498; 600 allowed), in a process of its own as the worker is |
| 10 | Earth | its rain and ground wind at five places (Irma among them) **within 0.00 %** of `weather.js`'s |
| 11 | the scene days | mist 218 m deep round the ledge at 07–09 h, heaps 0.52 over the ranges at noon, a storm that can strike 64 km off at 16.3 h, a front over the ledge by day on 23 September (high cloud at 8 h, the mid veil at 7.5 h, the deck 0.89 at 14 h, 1.4 mm of rain), a cap of 0.80 on the Crown on 24 September; neither the ledge nor Skymere opens in cloud |

Every check was seen to fail. `--break <fault>` puts one in on purpose: `cap` (the cap on live
cells lifted → check 8), `night` (cells at any hour → 8), `still` (the systems left where they were
born → 5), `jump` (a cover that flips between snapshots → 5), `dryrain` (rain under a clear sky →
7), `flat` (the land taken out → 3), `noday` (no day's cycle → 4), `nofog` (no fog → 4), `seed`
(every day the same wind → 6). Beyond those, four real faults were caught by the checks while the
model was being built, and each is now guarded:

- the walk upwind wrote over the place being worked out (shared scratch) → blocks of cloud over the
  sea, and an answer that depended on the order of the questions (check 2 and the pictures);
- a front's side taken from its nearest segment flipped seventy kilometres away when the nearest
  segment changed → a countryside drying and wetting between two snapshots (check 5);
- a fast `smoothstep` that did not take a descending range turned off the dry lee altogether
  (check 3; it is why the lee looked as cloudy as the windward side for a day's work);
- `Buffer.slice` gives a view, not a copy: the land file read back the wrong plane, so the ground
  was 2 851 m where it is 1 493 (now a copy, and `makeWxLand` and `readWxLand` are compared).

Other tests kept green: `./scripts/build-check.sh`, `sky-system-test` (82 ok), `sky-steer-test`
(34), `sky-format-test` (47), `sky-cell-test` (31), `governor-sim`.

## Pictures

In `docs/shots/sky/` (all drawn without a browser, from the model's own snapshots):

- `A-land-country.png`, `A-land-prominence.png`, `A-land-hollows.png`, `A-land-coast.png`,
  `A-land-sites.png` — the land the weather is worked out over, and where storms are born.
- `A-2024-09-22-06h.png` … `-18h`, and the same for 23 and 24 September — each kind's cover, the
  rain, the cells and their strikes, with the low and high wind arrows.
- `A-lapse-00.png` … `-47` — 24 hours of 22 September every half hour, 300 km round the opening place.
- `A-meteogram.png` — a week at the opening place: wind by layer, rain, cover by kind, cells within 40 km.

## Numbers for src/worlds/haven.js

The `weather` block is already in the branch (seed 23, chosen by `find-weather --seeds` out of 40:
mist in the basin on the opening morning, heaps over the ranges by noon, a storm in view of the
ledge in the afternoon, a front the next day, wind and a cap on the Crown the day after).

The bookmarks and cost views are the main session's to paste (they change the benchmark's route).
`timeOffsetHours` is from the scene's own moment (2024-09-22T17:00Z = 08:00 at the opening place):

```js
    bookmarks: {
      // ... the five that are there now ...
      mist:  { label: 'Morning mist',      heading: 150, pitch: -12, fov: 55, timeOffsetHours: -0.5 },
      storm: { label: 'Afternoon storm',   heading: 300, pitch: 4,   fov: 50, timeOffsetHours: 8.25 },
      front: { label: 'A front coming',    heading: 250, pitch: 2,   fov: 55, timeOffsetHours: 33 },
      crown: { label: 'Wind on the Crown', lat: 15.425, lon: 68.95, alt: 5200, heading: 200, pitch: -6, fov: 45, timeOffsetHours: 53 },
    },
    costViews: [
      // ... the two that are there now ...
      { name: 'under the storm',     lat: -48.08, lon: 48.30, alt: 1800, heading: 300, pitch: 6,  timeOffsetHours: 8.25 },
      { name: 'a storm from afar',   lat: -48.54992, lon: 49.05567, alt: 2500, heading: 300, pitch: 2, timeOffsetHours: 8.25 },
      { name: 'in the morning mist', lat: -48.54992, lon: 49.05567, alt: 1600, heading: 150, pitch: -10, timeOffsetHours: -0.5 },
    ],
```

(The headings and heights are my reading of the maps; the main session should look at them in the
game before pinning them. The hours are from `find-weather --scene`, and are what the checks test.)

## Cost

- A snapshot of 1 024 × 512 (half a million texels, every kind, the cells, the anvils, the lenses,
  the wet ground): **498–562 ms** in Node here, so 0.4–0.8 s on a phone core every 120 s of game
  time — about 0.5 % of one core. The work is split: the slow weather (the walks upwind, the
  systems' arcs) on a coarse grid a quarter of the field's width (and the walks half as fine
  again), everything else at every texel, the wet ground on a 64 × 32 grid of its own, all filled a
  cell at a time so that `at()` fills only the four texels it reads.
- `at()` at the traveller: **under 20 µs** after the first call of a snapshot's context (100 calls
  in 2 ms).
- The field's uploads: **128 KB** in a frame at most (one map's 32-row strip), 48 frames to take a
  whole snapshot in; the 'now' blend is a sixteenth of each map's rows a frame on the GPU.
- The land's planes: 5.0 MB (`haven_wxland_1024.u8`), fetched once; without the file the model
  works the same planes out from the elevation map in about a second of worker time.

## Open

- **Nothing of this has run in a real GL yet** (no browser was free on this machine). The field's
  strip uploads and its blend pass are the only new GL in package A; they follow the chunk pool's
  pattern (raw textures three only binds) and `makePassMaterial`. The first picture is also the
  first proof that the blend shader compiles.
- The lenticulars' list is built and posted, but on the scene day the Crown's air is too unstable
  for lenses and it wears a cap instead; `find-weather --seeds` shows days with 1–4 lenses on other
  seeds. B may want a day with lenses for its own pictures: 24 September on seed 13 has three and on seed 21 four.
- Check 6 sits at its threshold (9 gales of 90 days, 9 wanted). If the main session changes the
  ground wind's numbers, run `find-weather --days 90` again.
- `src/weather/weather.js`, `rain.js`, `bolt.js` and `rainbow.js` still import three and roll their
  own dice; check 1 names them as waiting for package D and does not fail on them.

## Asked of the main session

1. **`?debug=sky:model`**: `skyDebug` only allows the stub's four presets, and `_makeField` always
   passes one. To see the model in the game before the field is always on, let `sky:model` through
   (`preset: 'model'`, which `makeProducer` already understands) — or simply pass no preset.
2. **The field's options**: `skySystem._makeField` passes `{ preset, stormAt, land }`. The model
   also takes `wxland` (the land's planes) — `skyField` fetches them itself from the world file's
   `weather.land` and `weather.peaks`, so nothing is needed there, but the field is `busy` until
   they arrive (a picture waits for them, as it does for the first maps).
3. **The bookmarks and cost views** above (they change the benchmark's route).
4. **Earth's field** is not wired: `fromMaps` needs its three maps as bytes
   (`{ data, w, h }` each) and `data/earth_storms.json`, which the page must decode as
   `weather.js` does. Say the word and I will write that loader into `skyField`.
