# Seasons on Haven (2026-11-27; roadmap 12, delivery 4)

Read first: `CLAUDE.md` in full (the lessons at its end are about this kind of work), the
top of `docs/PROGRESS.md`, `docs/ROADMAP.md` section 12. The owner's words: **"a living world
... leaves that change color with the season and fall down with the wind and pile up"**;
the roadmap: "a year of its own; leaves turn, fall with the wind and gather on the ground;
snow comes and goes"; and always "perfect from a distance, specially when I'm flying high
above it."

## What exists today (checked 2026-11-27; verify before you build on it)

More than the roadmap's line suggests:
- **A season value already runs through the trees**: `uSeason = (turned, bare, time)`,
  worked out in `src/life/trees.js` (about line 510) from the Earth calendar's day of the
  year (`src/app.js`, the `day` handed to `trees.update`) and the latitude. Species
  (`src/life/cover.js`, `SPECIES`) say whether they keep their leaves, turn orange-red or
  turn gold, and when they flower (`bloomOf`). The near trees, their shadow pass, the far
  forest (`farForest.js`) and the ground (`uLitter` in `app.js`: scattered fallen leaves
  under a canopy and the colour of the canopy beyond the near trees,
  `terrainMaterial.js`) all read it.
- **Leaves and petals fall** (`src/life/leaves.js`): up to 420 leaves in a 44 m box round
  the traveller, more in autumn, in wind and when flown past fast; they "lie on the ground
  a moment before they are gone". Petals: 640 falling and 480 lying under trees in flower.
  **Nothing piles up.**
- **Haven has no year of its own**: it runs on Earth's calendar and tilt
  (`src/worlds/solarSystem.js`: "the same day, the same tilt"); its scene date is an
  equinox and the opening place (latitude -48.5) is at the last day of its winter. The
  weather's model has a season of its own making (`src/weather/sky/model.js`,
  `declinationOf`, used for temperature and snow).
- **Snow on the ground never changes**: it is painted into the land's colour when the tile
  is made (`src/terrain/tiles/madeLand.js`, `snowLine: -1.5` degrees). Snow does fall
  (`src/weather/rain.js`) when the model says it is cold enough.
- **Grass and flowers do not know the season** (`src/life/grassRules.js`: green to gold by
  dryness only).
- Said wrong or not done: "the far forest turns with the season in patches without knowing
  which trees are evergreen" (and evergreens once went gold from the air: see
  `docs/briefs/from-above-report.md` near line 312); outside the bloom days the cherries are
  "a sparse lace of twigs" close by and "a full green crown" at 240 m; a carpet of petals
  under a flowering tree "would be better drawn by the ground itself"
  (`docs/briefs/trees-refined-report.md` near line 390).

## What to build, in this order (each is a delivery by itself)

1. **A year of its own, and one rule for the season.** One function says what time of year
   it is at a place on a date (and so what every living thing and the snow do), and
   everything asks it: the trees near and far, the ground, the grass and flowers, the
   leaves in the air, the weather's model. Haven's year is short enough to live through (a
   few dozen of its days, your choice, written in the world's file), and the owner can go
   to a season from the menu's clock (four buttons, the date moves) and by `?season=` in the
   URL for pictures. **The opening morning must look as it does today** (choose the year's
   start so): that is what the owner has approved. The Sun stays on its orbit; say in the
   report where the life's year and the Sun's disagree.
2. **Leaves that turn and fall, seen from every distance.** Each broadleaf tree turns on
   its own days (earlier high up and toward the pole, each tree a little off its
   neighbours), through its species' colours, thins as its leaves fall, stands bare, buds
   pale green and flowers in spring. The same tree is the same colour and as full at 5 m,
   at 240 m and from 3 km (one rule, handed over: the near trees, the far trees, the canopy's
   colour in the ground). Evergreens stay green. From the air an autumn wood is a patchwork
   of green firs, gold and red crowns, not a tint.
3. **Leaves that pile up.** Through the autumn the ground under and down the wind from
   broadleaf trees gathers leaves, in the species' colours: thin at first, then a carpet,
   deeper in hollows, against rocks and trunks and along the wood's edge, thinning through
   winter. Close by they are leaves one can see lying (as the lying petals are), and a
   traveller running or flying low through them kicks them up. The falling leaves in the
   air come from the trees that are shedding and in their colours. The petals' carpet in
   spring is the same machinery.
4. **Snow that comes and goes.** The snow line comes down the mountains in winter and
   climbs in spring; where the model lets snow fall it lies (ground, rocks, the tops of
   crowns near and far) and melts in days of thaw, first on slopes turned to the Sun. Near
   and far must agree; from space the white caps grow and shrink.
5. **Grass and flowers by the season.** Fresh green in spring, flowers by kind in their
   weeks (a meadow's colour changes through the year), gold in late summer, brown and
   beaten down in autumn, under the snow in winter; pollen in the weeks of bloom.

## Rules that bite

- When two places must agree on a rule, one works it out and hands it to the other.
  Written twice, each was different within a day (the canopy's colour was).
- The ground's fragment shader reads **15 of a phone's 16 textures** (one map is free) and
  is **the largest cost on the phone**: measure before and after with
  `scripts/ground-cost-run.sh` (a count of work, never a frame rate). Trees are paid for in
  layers of cut-out pixels (`node scripts/overdraw.mjs`). Anything that adds cost gets a
  governor step (`src/perf/governor.js`; the ladder is pinned in
  `scripts/sky-system-test.mjs`), and a step thins, it never removes what the place is
  about.
- Anything in degrees or "share of the frame" is a guess about the world's size: Haven is
  250 km in radius. Heights of things are over the country, not over the sea.
- A thing switched off is thrown out of the picture (`gl_Position = vec4(2.0, 2.0, 2.0,
  1.0)`), never given no size. Anything that moves with the wind is added up frame by
  frame. Nothing about a thing in the world may hang on where the traveller stands.
- Look at a thing alone before looking at it in the scene: `node scripts/tree-preview.mjs`
  (every shape at every distance in seconds), `scripts/far-tree-above.mjs`,
  `scripts/find-tree.mjs`. Keep the trees' own tests passing (`npm run treeshadows`,
  `node scripts/trees-near-test.mjs`, `far-trees-test`, `far-tree-form-test`,
  `tree-shadow-test`, `far-forest-clock`), and add one for the season's rule that fails
  when broken (the same answer near, far and in the ground for the same tree and day;
  evergreens never turn; the opening morning unchanged). Break it once to see it fail.
- Do not make the world again (`haven_dem_4096.i16` and its maps stay).
- Look at the game as the player gets it, with no switch in the URL beyond the place, the
  hour and the season. One headless browser at a time; a Haven picture in a wood takes up
  to 20 minutes here: from the air first, from a frozen build (`--distdir`), long runs
  detached, waiting on a log line. Reference shape `--size 880x412 --dsf 1.25`.
- Find every view before you picture it (a stand of aspen or cottonwood, a cherry grove, a
  slope that crosses the snow line: `haven.js` has the tree mix; `scripts/find-tree.mjs`,
  `scripts/find-overlook.mjs`, `scripts/peek.mjs`).
- Commit messages end with your own session's attribution lines; no model names anywhere
  else. Nothing is spent, no account or key is made. Only this repository.

## How to work with the owner's session

- Your branch: `ccr-6f4f9272-seasons`, begun from `origin/ccr-6f4f9272-64jkgl`. Push only
  there. Two helpers work beside you: the sky's faults (`ccr-6f4f9272-sky-faults`; the
  weather's model is theirs: hand them the season's function, do not rewrite the model) and
  living water (`ccr-6f4f9272-water`). **The water helper also edits the ground's shader**
  (`terrainMaterial.js`): keep your edits there in blocks of their own with a comment that
  names you, and merge `origin/ccr-6f4f9272-64jkgl` into your branch before every push you
  announce.
- **First, within the first two hours: the year and the one rule (piece 1)** with the
  opening view in its four seasons from 300 m up (four pictures side by side, as far as
  the existing colours go), pushed and announced. Then go on without waiting.
- After each piece: before/after or four-season pictures in `docs/shots/seasons/`, the
  checks passing (`./scripts/build-check.sh` and the tests above), a push, and **one line**
  to the owner's session (`send_message` to `session_01R5BrhzGbvM5Mm4BP5vZBtE`): the commit,
  what changed, the picture's name, and any shared file you touched.
- The report, `docs/briefs/seasons-report.md`: for each piece what was built and how, the
  pictures, the cost, what is not done and why. At the end `SEASONS-DONE` in your line. If
  something cannot move without a decision, say so in a line and go on with the rest.
