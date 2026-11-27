# The sky's known faults (2026-11-27)

You take over the sky of Haven from four helpers who stopped on 2026-11-25. Their work is
merged and on the phone link (main at 49e4294). Read first: `CLAUDE.md` (all of it: the
lessons at the end are about exactly this kind of work), the top of `docs/PROGRESS.md`,
`docs/briefs/clouds-weather-plan.md` (the design), and the four reports
`docs/briefs/sky-A-report.md` to `sky-D-report.md` (skim: who built what, what each said was
not done). The code: `src/weather/sky/` (the day's weather by rule: `model.js`, `systems.js`,
`cells.js`, `producer.js`, `skyWorker.js`, `stub.js`), `src/sky/` (`skySystem.js`,
`skyField.js`, `cloudVolume.js`, `clouds.js`, `upperClouds.js`, `cloudShade.js`,
`fogSheet.js`, `lenticulars.js`), `src/weather/` (`storm.js`, `rain.js`, `bolt.js`).

The owner's words for all of this: "dense changing clouds that I can fly through", "a living
world with its own physics and water and rain", and above all **"perfect from a distance,
specially when I'm flying high above it."**

## What is wrong today (each seen in a picture of the merged build)

1. **The noon sky over the ranges is empty.** `docs/shots/sky/main-noon_air-de185f9.png`
   (noon, 1 km over the opening place, toward 200 degrees): a clear blue sky, where the
   day's weather has fair-weather heaps (the model says so: `scripts/sky-table`-style scans
   of `model.js`, and the stub's test pattern "fair" did draw heaps there). So the fault is
   between what the model hands over and what the clouds draw (the field's snapshot, its
   decoding, the base and top heights against the ground's height, the cover's threshold).
   This is the first thing a traveller sees at noon: fix it first.
2. **A storm 64 km off is a pale ghost.** `main-storm_afar-de185f9.png` against
   `main-storm_afar-stub-dfbf8c1.png`: a faint cream bump at the horizon where a tower with
   an anvil should stand, dark at the base, lit on the Sun's side.
3. **A pale hard-edged disc in the front's view.** `main-front_air-de185f9.png`: in the
   rain, a light blue-grey round patch with a crisp edge sits on the skyline (an anvil or
   a lens cloud seen from below through the veil; `sky-B-report.md` near line 720 speaks of
   "the disc on a stalk").
4. **The weather views look into hillsides.** Keys 6 to 9 on Haven (`src/worlds/haven.js`,
   bookmarks `mist`, `storm`, `front`, `crown`): some are aimed at the slope in front of
   the camera, not at the weather. Each must show what its name says, from a spot found
   with `scripts/find-overlook.mjs` and sketched with `scripts/peek.mjs` before any picture.
5. **From high above the clouds are flat** (the visual critic,
   `docs/briefs/haven-rich-critic-2.md`, gap 2): at 3 km "one flat beige-khaki cloud mass
   ... no sunlit top, no coloured shade side and no readable edge"; lower, cream cut-outs
   in one tone and rows of dashes at the horizon (`main-storm_afar-de185f9.png` shows both).
   Wanted: separate heaps with wide gaps, each with a bright warm top where the Sun
   strikes, a lilac or blue-grey shade side and underside, a clean outline, a soft
   blue-violet shadow on the ground; the land between paler and bluer with distance.

Take them in this order. 1 to 4 are faults; 5 is the look, and is the larger job.

## Rules that bite (all from `CLAUDE.md`; these are the ones this job will meet)

- **Look at the game as the player gets it, with no switch in the URL.** The four helpers
  pictured their work under `debug=sky:model` while the game drew a test pattern. Every
  picture you hand back is of the default game at a bookmark or a plain `lat/lon/alt/t`.
- **Two clocks**: `?t=` counts hours from the scene's moment, the weather's clock seconds
  from `weather.epoch` (521 hours apart on Haven). Ask the model about the hour the game
  shows (`new Steer(weather, R).t(date)`).
- Nothing about a cloud may hang on where the traveller stands or looks.
- Heights of things in the air are over the country, not over the sea (a base 1 400 m over
  the sea was fog on a plateau 2 100 m up).
- Nothing leaves the main picture between its clear and its last draw; the depth is never
  a texture. Phones allow 16 textures a shader: `npm run smoke` checks every program.
- Every new cost gets a governor step (`src/perf/governor.js`); the ladder is pinned in
  `scripts/sky-system-test.mjs` (add your step to its list on purpose).
- A governor step thins; it never removes what the place is about. Look at `?debug=floor`.
- One headless browser at a time. A Haven picture takes this kind of machine 3 to 20
  minutes: from the air first, from a frozen build (`--distdir`), long runs detached
  (`nohup setsid`), waiting on a log line. Reference shape: `--size 880x412 --dsf 1.25`.
- Every check must be able to fail: when you add one, break what it guards once.
- Commit messages end with your own session's attribution lines; no model names anywhere
  else. Nothing is spent, no account or key is made. Only this repository.

## How to work with the owner's session

- Your branch: `ccr-6f4f9272-sky-faults`. Begin from `origin/ccr-6f4f9272-64jkgl` (the
  working branch; it is ahead of `main` by notes only). Push only to your branch.
- **First, within the first hour: the cause of fault 1**, written in a few lines at the top
  of `docs/briefs/sky-faults-report.md`, with one before/after pair of the noon view, and
  pushed. Then go on without waiting.
- After each fault: a before/after pair in `docs/shots/sky-faults/`, the checks passing
  (`node scripts/sky-system-test.mjs`, `sky-list-test`, `sky-steer-test`,
  `sky-format-test`, `sky-cell-test`, `sky-model-test`, `weather-test`,
  `./scripts/build-check.sh`), a push, and **one line** to the owner's session
  (`send_message` to `session_01R5BrhzGbvM5Mm4BP5vZBtE`): the commit, what changed, the
  picture's name. Before each such push merge `origin/ccr-6f4f9272-64jkgl` into your
  branch, so every picture is of the combination.
- Two other helpers work beside you: living water (`ccr-6f4f9272-water`) and seasons
  (`ccr-6f4f9272-seasons`). The sky is yours; the ground's shader
  (`src/terrain/terrainMaterial.js`) and the trees are shared: say in your one line when
  you touch a shared file.
- The report (`docs/briefs/sky-faults-report.md`): for each fault the cause, the cure, the
  pictures, what it costs (a count from `node scripts/play-profile.mjs` or the cost views,
  never a headless frame rate), what is not done. At the end `SKY-FAULTS-DONE` in your
  line. If something cannot move without a decision, say so in a line and go on with the
  rest.
