# Living water on Haven (2026-11-27; roadmap 12, delivery 3)

Read first: `CLAUDE.md` in full (the lessons at its end are about this kind of work), the
top of `docs/PROGRESS.md`, `docs/ROADMAP.md` section 12, and in `docs/PROGRESS.md` what was
written about lakes, rivers, the sea and the tide (search "hydrology", "tide", "Not done:
a swimming stroke"). The owner's words: **"a living world with its own physics and water and
rain ... water that goes down stream and piles where it can't go further like real life lakes
and rivers and oceans with waves that have tide"**, and "perfect from a distance, specially
when I'm flying high above it."

## What exists today (checked 2026-11-27; verify before you build on it)

- Water has no mesh: it is drawn in the ground's shader (`src/terrain/terrainMaterial.js`).
  The ground's normal map carries it: the fourth number is cavity shading on land and
  `1 + depth in metres` on water (written in `src/terrain/chunkBuilder.js`, read in the
  vertex and fragment shaders: writer and reader change in the same edit).
- Where water is: the sea (`layers.js`, `sea`), lakes (`haven_lakes_4096.png`,
  `haven_lakes.json`, 150 lakes), rivers worked out while the game runs by the tile worker
  (`src/terrain/tiles/hydrology.js`, `tileWorker.js`; rings at 1.5 km, 192 m and 24 m a
  pixel, `haven.js`). A river stretch is ten numbers: its two ends, the water level, half
  width and depth at each end. **The flow and the "drains to" of every cell exist inside
  `hydrology()` and are thrown away: no direction or speed of flow reaches the shader.**
- What moves: 17 waves tiled on the 64 m detail tile (`src/water/waves.js`), lifted in the
  vertex shader near by; foam at the shore and on crests; the tide (`App.updateTide`: Mira
  and the Sun lower and raise the sea near the traveller and bare the bed); the Sun's glint
  and the sky's reflection; a swimmer rides the waves. Rain only darkens wet ground.
- Said wrong or not done: "flow direction in the look of a river; waterfalls; lakes are
  untested by eye; rivers do not line up across the edge between two rings; a river's colour
  is the sea's"; "a few valleys of the made world are straight trenches (the maker's flow
  lines run in eight directions)"; "the tide's beach is a narrow band on steep shores"; from
  the air "a river narrower than the far patches' texels still thins in and out"; the visual
  critic (`docs/briefs/haven-rich-critic-2.md`, gap 4) on water from the air, partly cured
  since (`docs/briefs/air-from-above-report.md`).

## What to build, in this order (each is a delivery by itself)

1. **Rivers that run.** The direction and speed of flow reach the shader (from the
   stretches' own order and fall, or from the hydrology's cells), and the river's surface
   moves down stream: streaks and ripples carried along, faster in the middle and where the
   bed is steep, slow and glassy in pools. One rule gives the speed to the shader and to
   anything else that asks (a swimmer or a leaf is carried by the same number). A river has
   its own colour (the bed showing through shallow water, the sky on calm water), not the
   sea's. Rivers line up across the edge between two rings.
2. **Rapids and falls.** Where the bed is steep: white water, standing waves, foam carried
   down stream and thinning out below. Where the water drops (a cliff in its path): a fall,
   a sheet of white with a plunge pool and mist at its foot that the Sun lights. Seen from
   a kilometre off a fall is a white thread on the rock: it must be there from afar too.
3. **Rivers and lakes from the air.** A river is a continuous ribbon at every height (the
   far patches must know rivers narrower than their texels), lakes have smooth shores with
   a pale shallow margin, a darker middle and the sky's colour, and nothing is stair-stepped.
   Take the critic's gap 4 as the measure.
4. **The sea.** Swell that comes in to the beach, lifts, breaks into a line of surf and
   washes up the sand, with the tide moving that line up and down a beach wide enough to
   see it (the "narrow band on steep shores" above). From the air: lines of surf along the
   shore, paler water over sand.
5. **Rain on the land.** Where it rains (the sky's field says where and how hard:
   `src/weather/weather.js`, `src/sky/skySystem.js`), puddles gather in the hollows of level
   ground and mirror the sky, and dry out afterwards; streams run fuller and browner after
   rain upstream and fall back over hours.

Where "as close as possible" stops (told to the owner already): water follows the land and
moves convincingly; it is not a simulation of every drop.

## Rules that bite

- **Do not make the world again.** `public/data/haven_dem_4096.i16` and its maps stay as
  they are: a new land moves every place, bookmark and benchmark. If the straight trenches
  cannot be cured in the tile worker (bends put into the stretches there), say so in a line
  and leave them.
- The ground's fragment shader reads **15 of a phone's 16 textures**: one map is free, and
  after it a new map must take the place of one. It is also **the largest cost on the
  phone** wherever ground shows: measure before and after with `scripts/ground-cost-run.sh`
  (a count of work, never a frame rate) at views with and without water; work for water
  goes inside what is skipped where there is none. Anything that adds cost gets a governor
  step (`src/perf/governor.js`; the ladder is pinned in `scripts/sky-system-test.mjs`), and
  a step thins, it never removes what the place is about ("a sea that lies flat is not a
  sea").
- Any pattern phased by the detail texture's coordinates has a whole number of cycles per
  64 m tile (`scripts/far-ground-test.mjs`). Anything that moves with a flow or the wind is
  added up frame by frame or is a closed form of the clock that cannot jump.
- Nothing about the water may hang on where the traveller stands or looks. When two places
  must agree on a rule (the shader and the swimmer; near and far), one works it out and
  hands it to the other.
- Height code (`src/terrain/height/*`) stays free of DOM and three imports. Worker replies
  carry the terrain's epoch. Something marked "build again" is marked done when the build
  is asked for.
- After changing the lake or river rules run `npm run lakes` (Earth must not change for the
  worse), and add a check for Haven's rivers that fails when broken (flow runs downhill
  along every stretch; stretches meet across ring edges). Break it once to see it fail.
- Look at the game as the player gets it, with no switch in the URL. One headless browser
  at a time; a Haven picture takes 3 to 20 minutes here: from the air first, from a frozen
  build (`--distdir`), long runs detached, waiting on a log line. Reference shape
  `--size 880x412 --dsf 1.25`; judge sharpness at `--dsf 3.5`.
- Find every view before you picture it: the river, rapid, fall, beach and lake you show
  are found with the height function and the hydrology in Node, and sketched
  (`scripts/peek.mjs`, `scripts/find-overlook.mjs`), not guessed. Places with water today:
  the opening place looks down on a lake (bookmarks `ledge`, `wall`); Longwater -10.77,
  253.7; the Deepwell -31.07, 17.45; Skymere -44.25, 24.83; the golden shore 18.501,
  132.671 (`haven.js`, `places`; `haven_lakes.json` has all 150 lakes).
- Commit messages end with your own session's attribution lines; no model names anywhere
  else. Nothing is spent, no account or key is made. Only this repository.

## How to work with the owner's session

- Your branch: `ccr-6f4f9272-water`, begun from `origin/ccr-6f4f9272-64jkgl`. Push only
  there. Two helpers work beside you: the sky's faults (`ccr-6f4f9272-sky-faults`) and
  seasons (`ccr-6f4f9272-seasons`). **The seasons helper also edits the ground's shader**
  (`terrainMaterial.js`: leaves lying on the ground, snow): keep your edits there in
  blocks of their own with a comment that names you, and merge
  `origin/ccr-6f4f9272-64jkgl` into your branch before every push you announce.
- **First, within the first two hours: a river that visibly runs**, at one view, with a
  before/after pair and the ground's cost before and after, pushed and announced. Then go
  on without waiting.
- After each piece: a before/after pair in `docs/shots/water/`, the checks passing
  (`./scripts/build-check.sh`, `npm run lakes`, `node scripts/far-ground-test.mjs`, your
  own), a push, and **one line** to the owner's session (`send_message` to
  `session_01R5BrhzGbvM5Mm4BP5vZBtE`): the commit, what changed, the picture's name, and
  any shared file you touched.
- The report, `docs/briefs/living-water-report.md`: for each piece what was built and how,
  the pictures, the cost, what is not done and why. At the end `WATER-DONE` in your line.
  If something cannot move without a decision, say so in a line and go on with the rest.
