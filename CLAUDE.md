# Solar System Explorer — project charter and guide

Future sessions have no memory except this file and `docs/`. Read this file,
`docs/ROADMAP.md` and `docs/PROGRESS.md` before doing anything, and keep them current.
**Start with "Where things stand" at the top of `docs/PROGRESS.md`**: it says what was
last delivered, what the owner was asked for and exactly what to do next.

- `docs/ROADMAP.md` — the milestones, in order, with a status for each.
- `docs/PROGRESS.md` — what exists, decisions taken and why, known problems, session log.
- `docs/ARCHITECTURE.md` — how the engine is put together: frames, units, frame order, modules.
- `docs/ASSETS.md` — source and licence of every asset.
- `docs/shots/` — reference screenshots (every bookmark on every world, orbit, character).

## What this game is

**Since 2026-11-23 (the owner's words, with five reference pictures of a stylised
landscape game): "simply flying somewhere beautiful ... a living world with its own
physics and water and rain and leaves that change color with the season and fall down
with the wind and pile up, water that goes down stream and piles where it can't go
further like real life lakes and rivers and oceans with waves that have tide ... 5 of the
most beautiful [biomes] on earth including this one."** The owner does not care for real
sizes, real maps or the explorer's side of things, and allowed a full restart ("whatever
gets my idea across").

So the game is: you fly a robed, long-haired character (the owner's own design, and since
2026-11-27 the owner's own sculpt: `docs/PROGRESS.md`, "The owner's sculpt in the game") over **a small made-up world** (`haven`,
milestone 12 in `docs/ROADMAP.md`): small enough that the horizon bends from a few
kilometres up and mountains stand on its edge from space, its land shaped by rule to be
beautiful (peaks, stepped plateaus, canyons, valleys, a sea), its water following the
land, alive with weather and seasons, in five biomes. It was not a restart: the engine,
the flight, the character, the look, clouds, weather, trees, grass, water and the phone
tests all carried over; what is new is the world.

The game before this (and still there, on the start screen, nothing deleted): the real
solar system, fifteen real worlds to land on (Mars, the Moon, Phobos, Deimos, Mercury,
Venus, Ceres, Io, Europa, Enceladus, Titan, Triton, Pluto, Charon, and Earth in real
detail), every other planet and large moon in the sky at its true place for the date.
They are no longer where the work goes. Keep everything that works.

## Ownership

Claude is the owner and long-term maintainer of this codebase, and its design is Claude's
call. Consolidate and restructure when that makes it healthier. Two limits:

- do not change what the player sees or how flight feels as a side effect of a clean-up;
- list every behaviour change in the checkpoint message.

## The one goal (owner, 2026-11-20)

**The best possible product that a Samsung Galaxy S23 Ultra can run without lag.**

The owner set a gate (a phone benchmark after milestone 4) and, once its results were
in, lifted the charter's limits: the fixed decisions, the approvals and the rule against
expensive effects no longer bind. What is built, how it looks, with what technology and
in what order is Claude's call, judged by that goal alone. The roadmap stays the plan
unless something serves the goal better.

Three things stay, and none of them is a limit on the product:

- **Nothing is spent and no account or key is created without asking the owner.**
- **Only assets we have the right to use go in** (that is the law, not a rule of this
  charter). Sources and licences are recorded in `docs/ASSETS.md`.
- **"Without lag" is measured on the phone, never guessed.** Headless frame rates say
  nothing about it. Anything that adds cost gets a governor step, the benchmark is how
  the truth arrives, and after any change that adds real cost the owner is asked for a
  new benchmark.

Helpers (the owner, same day): **multi-agent workflows only for the most challenging
parts** (a milestone's independent review, a hard design question, a large parallel
job). Ordinary work is done directly.

## Choices in force (Claude's to change when the goal is better served)

These were the charter's fixed decisions. They are still how the game is built, because
they have served it well; they are no longer rules.

- **Look: the painted look** (owner, 2026-11-21, with reference pictures of a stylised
  landscape game: "change the direction ... idc if its a 180% change"; it replaces
  "mission-camera realism"). The principles are the landscape poster's: few colours, each
  time of day a pair of them (the light's and the shade's); shade that is coloured, never
  black; the far ground lost in the air layer by layer; trees, rocks and grass as bold
  shapes known by their outline; a big soft Sun. (On the real worlds the places stay
  real: elevation, land cover, species, weather, the true sky; on the made world the
  land is ours to shape.) **The principles are taken, never that game's artwork, palettes
  picture for picture, places or interface; the reference pictures are not in the
  repository.** The owner asks for the look "as close as possible": that is the feel
  (few colours, layered distance, bold shapes, faceted rock, cut-out trees), with our own
  places, colours and shapes, never a copy of that game.
  A world is drawn this way when its file has a `look` block (`src/render/look.js`);
  Earth is the first, the others follow one at a time and keep the physical picture
  (the Sun as the one light, HDR, auto-exposure, a filmic tone map) until then. That
  physical base stays underneath the look everywhere: the look changes the air's numbers,
  how light falls on a surface and the grade, not the engine.
- **Tech**: three.js `WebGLRenderer` on WebGL 2, GLSL, Vite, plain JavaScript, static
  build, 64-bit world positions with camera-relative rendering, no logarithmic depth
  buffer. The whole codebase is built on these; changing one is a large job, to be done
  only for a clear gain on the phone.
- **Worlds are data-driven**: one definition file per world, only generic engine
  additions.
- **Test device**: Samsung Galaxy S23 Ultra, Chrome, landscape; the picture must stay
  steady there, including after 10 minutes when it throttles from heat.
- **Resolution and the governor**: the ceiling is the canvas's native pixel size
  (3088 × 1440 on the phone). The governor keeps the frame rate: it lowers resolution
  when pixels are what is slow, lets terrain in more slowly or draws fewer patches when
  the page's own work is what is slow, then steps features down in a fixed order, and
  steps back up when there is sustained headroom. Two modes on a button: **Sharp**
  (30 fps, favouring detail and native resolution; **the default since 2026-11-24**, the
  owner's word after the ninth benchmark: "We can do 30 fps if the game looks much more
  beautiful as well which I would like more") and **Smooth** (60 fps). "Without lag" is
  then a steady 30: no frame late against 33 ms, and beauty before frame rate.
- **No fixed budgets**: pools stay fixed-size so memory cannot creep; the phone's
  benchmark is the judge.
- **Expensive effects** (anti-aliasing, soft shading in creases, clouds, reflections and
  the rest) are welcome when the phone has room for them. Each gets a governor step and
  is checked by a benchmark.

## What needs the owner

Only the first two of the three things above (money or accounts; a question of rights),
and removing something the player already uses and likes. Everything else is decided
and done: record notable decisions in `docs/PROGRESS.md`. Milestone 9 (Earth's surface)
is the riskiest part: write its plan in `docs/PROGRESS.md` before starting it.

## Finishing work

Work through each milestone to its checkpoint. Do not end a turn by listing remaining
work or offering to continue. Errors, timeouts, failing tools and empty results are not
blockers: diagnose them and work through them. The only planned stops are the
checkpoints and the few things that need the owner. If something truly cannot move without the owner,
say plainly what is needed and carry on with everything that does not depend on it.

## How to work on every milestone

1. Read `CLAUDE.md`, `docs/ROADMAP.md` and `docs/PROGRESS.md`, then write a short plan
   for the milestone (in `docs/PROGRESS.md`).
2. Judge visuals by looking, not by reading code. Save screenshots at every bookmark on
   every world, in orbit, and of the character (`npm run shots:all`), and compare them
   against real spacecraft and rover photography and the look described above.
3. Helpers, only for the most challenging parts (the owner's word): (a) once per
   milestone, before the checkpoint, an independent review: a critic that sees only the
   screenshots and what the game is aiming at, never the code, and returns the five
   biggest gaps, ranked, and reviewers of the milestone's code whose findings a second
   reviewer tries to disprove; (b) large pieces of work that are independent and touch
   separate files. Tuning loops, small fixes and shared shader code
   stay with Claude. Brief each helper with the goal, the exact files or screenshots, the
   rules that apply and the output wanted.
4. Stability test (`npm run stability`, and `-- --streaming` for pops while terrain is
   still arriving): 3 frames one camera step apart along short scripted moves
   on the ground and in flight; fix anything that pops, crawls, shimmers or sparkles.
5. Add every new feature to the governor's step-down order (`src/perf/governor.js`).
6. Commit, push and merge so the phone link updates, update the docs and mark the
   milestone in `docs/ROADMAP.md`.
7. Checkpoint: stop and send the owner the checkpoint message.

## What the owner's replies mean

- "continue": a milestone at `checkpoint sent` is accepted (mark it `done` in
  `docs/ROADMAP.md`); start the next unfinished milestone and work through it to its
  checkpoint.
- Pasted benchmark results: tune the governor and resolution range from them first (the
  results name each stop of the route and the page's own work per frame: slow work is
  not cured by fewer pixels), then continue as above.
- A complaint about how something looks or feels: reproduce it in a screenshot, fix it,
  show before and after, then return to the roadmap.

## How to write to the owner

The owner is not a programmer and reads on a phone. Before a long stretch of work, say
in a line what is about to happen, and give a one-line update every so often.
Checkpoint messages are short and in plain words, with no terms invented during the
work: the link, what is new, three things to try on the phone, what to paste back, and
known problems.

## The phone link

`https://zubersss.github.io/what-it-s-best-at/` — GitHub Pages, deployed by
`.github/workflows/pages.yml` on every push to `main`. Claude develops on its session
branch, opens a pull request into `main` and merges it; the link updates a minute or two
later. The start screen and the HUD show the commit the page was built from.
Pull requests go through `gh api` (the GitHub MCP tools are retired, and `gh pr` does not
work here): `gh api -X POST repos/zubersss/what-it-s-best-at/pulls -f title=... -f head=<branch>
-f base=main -F body=@<file>`, then `gh api -X PUT repos/zubersss/what-it-s-best-at/pulls/<n>/merge
-f merge_method=merge`.

## Run and test

```
npm install
npm run dev            # http://localhost:5173/   (add -- --host to open it from a phone on the same Wi-Fi)
npm run build          # static site in dist/ (relative paths)
./scripts/build-check.sh    # the same, but fails loudly (never judge a build through `| tail`); first checks that the scripts' imports exist
npm run preview        # serve dist/
npm run shots          # headless screenshots of every bookmark of one world -> docs/shots/
npm run shots:all      # the full reference set: both worlds, orbit, character
npm run stability      # 3 settled frames one camera step apart along scripted moves, with a flicker report (-- --streaming: 3 truly consecutive frames right after a jump)
npm run flight         # scripted Mars -> orbit -> Moon flight (headless)
npm run foot           # the character on foot in the real game: walk, jump, super speed, take off, land (headless)
npm run smoke          # headless check of the start screen, modes, HUD and a full benchmark run
npm run govsim         # the governor against simulated GPUs (no browser)
npm run transfer       # GO trips flown without a browser: arrival, time against the marker's estimate
npm run target         # the target list, marker and a GO trip in the real game (headless)
npm run worlds         # every world opens at its start with ground drawn and no errors (headless, about an hour; -- --only io,titan)
npm run lakes          # Earth's lakes and rivers against the real ones, without a browser (15 s; -- --list, -- utah vermont)
npm run rocks          # the far rocks' rule against its promises, without a browser (5 s): the same twice, none in water, on the ground, steep against level ground, a walker's footing
npm run shadowturns    # the shadow tiles drawn in turns: a held tile must draw the same picture as a fresh one after a walk (headless, Moon)
node scripts/play-profile.mjs [--world earth] [--at "21.7,284.7,40"] [--floor] [--seconds 120] [--shot out.png]   # the real game in play mode at a place: the page's work by part, the governor's level, patches built (--floor: every saving on)
node scripts/tree-preview.mjs [--out dir] [--variant 1] [--only 0,2] [--below] [--close [--from 4]] [--against <other checkout>]   # every tree shape at its three distances, drawn without a browser in seconds (PNG sheets); --close: the close mesh from 4 m at the phone's density (what a leaf looks like to a walker); --against: old beside new
node scripts/find-tree.mjs --world haven --lat .. --lon .. [--from 4,12] [--species cherry]   # the trees standing nearest a place (as the game's workers place them), and where to put the camera to look at one from so many metres
node scripts/overdraw.mjs [--part trees,farForest,grass,leaves] [--view "in the forest" | --query ..] [--distdir build] [--out dir]   # layers of a part drawn over each pixel and triangles handed over, in the real game (a forest is paid for in layers of cut-out pixels); also __app.overdraw('trees') at the console
node scripts/make-world.mjs [--width 4096] [--seed 7] [--preview dir] [--only-preview]   # makes the small world's land (Haven): elevation with drainage, lakes, rain (a minute; --width 2048 --only-preview: nine seconds, with pictures to judge it by)
node scripts/make-world-maps.mjs   # ... and from that its colour, slope, water and cloud maps (needs Python's PIL for the JPEGs); prints the albedo map's mean for the world file
node scripts/find-haven-site.mjs [--open] [--lat 28,52]   # places on Haven to begin at: level ground over low ground and water, high ground near by
node scripts/find-overlook.mjs --world haven --lat .. --lon .. --heading .. [--below 1500]   # the very spot: level underfoot, the ground falling away in front, mountains on the far skyline (then look with peek.mjs)
node scripts/far-trees-test.mjs     # the far forest's trees are the near trees: a thinned tile is a subset of the full one, at the same places (no browser)
node scripts/far-tree-above.mjs [--old] [--out file.png] [--dist 450,1200,3000] [--down 15,35,60,90] [--sun 25]   # the far trees seen from above, sketched without a browser in seconds: a closed wood and lone trees at three distances and four angles (the rule is life/farTreeForm.js)
node scripts/far-tree-form-test.mjs  # that rule's promises (nothing changes from the ground, nothing switches, a wood's cover from above, a lone tree's size, shadows); node scripts/far-tree-shade-test.mjs [--was]   # the land's shadow on a far tile's trees against a ray from every tree (15 s)
node scripts/far-forest-probe.mjs --distdir <build> --query "lat=..&lon=..&alt=..&pitch=.." [--out file.png] [--map file.png] [--eval ".."] [--print ".."]   # the far forest in the real game at a place: tiles, the land's shadow by tile, the clouds' shadow map the trees read, draw calls and triangles
scripts/from-above-shots.sh <frozen build> <suffix> [view ...]   # Haven from above, the set of views (docs/shots/from-above; a view: <ledge|wood|steppe>_<metres over the ground>_p<degrees down>[_phone|_floor|_clear])
npm run rocks                      # the rule that places boulders: steep against level, clusters, sizes, a walker's footing (no browser); node scripts/rig-over-rock.mjs   # flight over a boulder, without a browser in a second: the height over the ground stays the land's, the floor is the rock's
node scripts/rock-field.mjs draws the field from above
node scripts/cloud-field.mjs [--span 150] [--lat .. --lon ..] [--out file.png]   # the fair-weather cloud field from straight above, without a browser in seconds: rows, clusters, how much of the sky
node scripts/rock-field.mjs [--lat .. --lon ..] [--span 3000] [--out file.png] [--check]   # where the far rocks lie, from straight above, without a browser in seconds; --check: the rule's promises (fails if one is broken)
node scripts/far-rocks-probe.mjs --distdir <build> --query "lat=..&lon=..&alt=.." [--seconds 300] [--out file.png] [--eval "..."]   # the far rocks in the real game: tiles arriving, what is drawn counted rock by rock, shader limits
scripts/far-rocks-shots.sh <frozen build> <suffix> [view ...]   # the far rocks' set of views (docs/shots/far-rocks)
node scripts/make-tree-atlas.mjs [--look file.png]   # the trees' picture (public/data/tree_atlas.png): run again after changing a spray or a tree shape
node scripts/check-ephemeris.mjs   # every orbit and spin against JPL Horizons (no network; fails beyond a tolerance)
node scripts/peek.mjs --world io [--shot ledge | --lat .. --lon ..] [--pan 4]   # a CPU sketch of the view from a place, in seconds: for choosing sites and times
python3 scripts/fetch-worlds.py [job ...]   # the maps of the worlds of milestone 6 (5 GB of originals into .cache/maps), see docs/ASSETS.md
python3 scripts/fetch-earth-weather.py   # the weather of 8 September 2017 for Earth: clouds, rain, cloud tops, storms (NASA GIBS)
python3 scripts/fetch-earth-climate.py   # Earth's yearly rainfall for the rivers, from NASA GIBS (public/data/earth_rain_720.u8)
python3 scripts/fit-orbits.py      # orbits fitted to JPL Horizons (needs ssd.jpl.nasa.gov; replies cached)
npm run assets         # re-download and convert the small NASA/Yale files into public/data/
python3 scripts/fetch-maps.py   # the rest of public/data/ (needs: pip install rasterio numpy pillow), see docs/ASSETS.md
node scripts/parts-out.mjs --world haven --shot ledge [--query ..] [--box 0.2,0.6,0.8,1] [--distdir build]   # who draws that? one view taken with one part out at a time (grass, clumps, trees, far forest, rocks, shadow casters), and how much of the picture each changes
scripts/ground-cost-run.sh <scratch dir> [--only ledge,air3k] [--before old-terrainMaterial.js] [--save dir] [--parts file.mjs] [--size 880x412 --dsf 2.2]   # what the ground's shading costs, as a count of work on software WebGL (never a frame rate): the game's ground alone at ten views, the shader of an earlier commit beside the new one in the same browser session, and how far their pictures are apart (git show <commit>:src/terrain/terrainMaterial.js > old-terrainMaterial.js). Runs scripts/ground-cost.mjs from a copy of the tree: the dev server reloads the page at any source edit
node scripts/make-hero.mjs [--tris 120000] [--low 24000] [--stage look]   # the owner's sculpt (assets-src/hero/) into the game's character file (public/data/hero.bin), 25 s: materials and garments by the seeds in scripts/hero/seeds.mjs, colours, two reduced meshes, the binding to the figure's parts and cloth (scripts/hero/heroBind.mjs). Run again after changing a seed, a joint or a cloth sheet
node scripts/hero-preview.mjs --out f.png [--pose stand|hover|fly|fast|walk|run] [--yaws 0,90,180] [--labels|--garments|--parts|--cloth] [--lod 1] [--twosided]   # that file drawn without a browser in a second, posed by the game's own code
node scripts/hero-bind-test.mjs [--list]   # the character's binding: standing it gives the sculpt back, in the game's poses the surface is not torn (no browser, 10 s; --list: the worst edges by cause)
node scripts/hero-cost.mjs   # what the character costs the page each frame, without a browser (seconds): the cloth at 60 and 30 frames a second, the whole figure; fails if the cloth's points have moved from scripts/lib/robe-reference.json
node scripts/grass-place-test.mjs   # a place's blades and tussocks are the place's, never the anchor's: anchor steps, the 2 560 m wrap, a grass saving on (no browser, seconds)
node scripts/grass-flowers-pixels-test.mjs   # the far blades' flowers fade in where the single flowers fade out (no circle), pixel sizes by the drawn picture, pollen's clock (no browser)
node scripts/grass-light-test.mjs   # the grass's light table: each pixel works out only the number it keeps, and only the rows something drawn reads (no browser)
node scripts/far-ground-test.mjs   # the ground from afar: patterns a whole number of cycles over the detail tile, the means the shader uses, no repeat of the steppe's shrubs (no browser)
node scripts/shadow-fine-rocks-test.mjs   # every rock whose shadow lies in the fine shadow tile is drawn into it, at a low Sun and a high one (no browser)
node scripts/shadow-axes-test.mjs   # a still spot's shadow hardly moves when the light axes are renewed or the anchor resets (no browser)
node scripts/terrain-bake-sun-test.mjs   # a patch built mid-walk is baked for the same Sun as its neighbours (no browser)
npm run treeshadows   # the trees' shadows in motion, without a browser (about 40 s): flecks fixed to the ground through tile re-centres and axes renewals, no lurch at a rebuild, the shadow's mesh changing only where the picture does, the fine tile's count
node scripts/sky-system-test.mjs [--break <fault>]   # the sky's step 0 (docs/briefs/sky-step0.md): the shared cloud rule's GLSL against its JS, the clouds going with the day's low wind and rising on the game clock, the guards that let a shader take two shared texts, the frame order and the interfaces the sky packages build on, the governor's and the benchmark's hooks, the debug switches (no browser, 10 s; --break puts one fault in to see its check fail)
node scripts/sky-list-test.mjs [--break hold|nofast]   # the storm cells and anvils asked every frame from moments 2 s apart and blended: within a few cm of the model's own answer, forwards and backwards, and the model asked about once in 60 frames (no browser, 3 s)
node scripts/sky-steer-test.mjs · node scripts/sky-format-test.mjs · node scripts/sky-cell-test.mjs   # each cloud layer's wind (closed form against a frame-by-frame sum), the weather field's snapshot format (JS and GLSL decoders), a storm cell's shape (JS against its GLSL) (no browser)
npm run probe          # top-down shaded relief of the height function (no browser)
node scripts/sky-table.mjs [--lat .. --lon ..]   # where the sky bodies are from a place over time (no browser)
node scripts/profile-chunks.mjs --world moon   # chunk build times per level (no browser)
node scripts/flyby.mjs [--miss 60] [--release 1]   # a trip to another world, flown without a browser
```

The screenshot scripts need Playwright (`npm i -D playwright && npx playwright install
chromium` on a normal PC; cloud sessions have it pre-installed — do not reinstall it
there). `scripts/shots.mjs` starts a Vite dev server (or serves `dist/` with `--dist`),
loads `?shot=<name>&world=<id>` and waits for `window.__shotReady`. Options:
`--world mars|moon`, `--shot ledge,sun`, `--size 880x412`, `--dsf 1.25`, `--touch`,
`--out docs/shots`, `--query "t=-1&hud=1"`, `--suffix _x`, `--timeout 500`, `--dist`,
`--distdir <copy of a build>` (serve a frozen copy, so rebuilding during a batch cannot
change it).
Reference shots use the phone shape: `--size 880x412 --dsf 1.25`.

Headless Chromium renders with software WebGL: a shot takes 1–3 minutes. Run long
batches in the background, never pipe them through `tail` (it hides all output until the
end), and take final sets from `dist/` so source edits cannot disturb them.

URL parameters: `world=<id>` (any world of `src/worlds/index.js`; without it, the one chosen
on the start screen last time, or `haven`; in screenshot mode `mars`), `shot=ledge|sun|wall|ship|dusk`, on Mars also `canyon`
(a sixth view of the opening site, used for the from-orbit and character reference
pictures), and the world's landmarks (`olympus`, `gale` on Mars; `tycho`, `taurus` on the
Moon) (fixed camera bookmark, deterministic screenshot mode, skips the start screen),
`t=<hours offset>`, `hud=0|1`, `scale=<fixed render scale>`, `dpr=<ratio>` (pretend the
screen has this device pixel ratio: sets the canvas's pixel size), `mode=smooth|sharp`,
`bench=run|soak|earth` (start a benchmark straight away), `fly=1`, `touch=1`, `hero=0|1`, `heropose=fly|fast|bank|climb|hover`
(cruising, boosting, turning, straight up, hovering), `heropose=stand|walk|run|super|jump|land|launch`
(with `hero=1`: on foot; `land` is the three-point kneel after a hard landing, `launch` the
fist-up take-off), `posedir=side` (seen from the side; `front`: a moving on-foot pose coming toward the
camera, to see the face; a standing one is turned to face it), `target=<body>|sun|place:<id>`
(the target marker, view unchanged), `lat= lon= alt= heading= pitch= fov=`, `east= north=` (metres from the bookmark's place),
`aim=<sky body>` (turn the view to it), `at=<body>:<radii>[:<round>[:<up>]]` (put the camera beside a sky
body or `sun`, that many of its radii from its centre, looking at it; `round` degrees away from the Sun's side, `up` degrees above), `dust=1` (with `hero=1`: a touch-down dust burst
frozen in mid-flight; `dust=run` with an on-foot pose: the puffs of the last footfalls), `debug=noair|airall` (haze shadows off / everywhere),
`debug=contactx4` (the rocks' contact-darkening spheres four times larger, to see the effect),
`debug=flash` (a stroke of lightning held at its brightest, on worlds with weather),
`debug=noclouds` (a clear sky: no cloud layer, no cloud volume and none of their shadows; from 1.2 km over Haven's opening place one is in cloud),
`debug=treeshade` (the far trees painted by how much of the Sun the land and the clouds leave them: red all, blue none),
`debug=nofar` (none of the from-space terrain changes; or one at a time: `norelief`,
`nofarrough`, `noboost`) for before/after pictures, `debug=farrocksoff` (none of the far rocks, for before/after pictures), `debug=floor` (every saving of the
governor on and Smooth's share of the patches: what a phone that has given everything up
draws).

Keys: `WASD` move, mouse look (click to capture), `Shift` super speed on foot / boost in
flight, left `Ctrl` (hold) slow, for precise moves (flight ×0.12, on foot ×0.3, free-fly
camera ×0.15), `Space` (or `E`) jump on foot (tap), take off (hold, or tap again in the air), up in
flight, `Q` down, `G` character on/off, `Tab` the menu, `N` the map, `J` the journal,
`O` photo mode, `K` sound on/off, `.` `,` the clock faster / slower (and backwards), `/`
real time, `T` next target (this world's places, the bodies in the
sky, the Sun, none) and turn to it, `Enter` GO: fly to the target hands-off (the stick
or a movement key takes control back; looking around does not),
`X` hover on/off (off: gravity pulls when the stick is released, and touching the
ground stands the character on its feet),
`F` free-fly debug camera (keeps your place: from the character or the first-person walk
the view stays where it is, the character is put away and a GO trip ends; `F` again puts
you down in the first-person walk; `G` brings the character back), `Z` hold for telephoto, mouse wheel = zoom amount,
`H` HUD (one line → full read-out with the time slider → off), `M` Smooth ↔ Sharp,
`[` `]` time −/+, `1`–`9` bookmarks (the views of the world's main site first: five on the Moon, six on
Mars; then its landmarks; on Haven the day's weather: mist, storm, front, wind on the Crown;
the menu's "Views" lists them all),
`P` pause time.

Touch: left part of the screen = move stick (push to the rim for super speed on foot /
boost in flight), `▲` jump (tap) / take off (hold, or tap again in the air) / up, drag
anywhere else = look, buttons `HERO`, `TARGET` (the list of targets with distances), `GO`
(above `▲`, shown with a target: the hands-off trip), `HOVER`, `ZOOM` (hold), `MAP` (the
solar system now: tap a body, then Set target or GO), `MENU` (the map and targets; the
clock: faster, slower, stop, today, a date; the journal, photo mode, sound; free camera,
read-out, Smooth ↔ Sharp, full screen), `▲` up, `▼` down. The time slider is part of the
full read-out.

Interactive sessions open on the start screen (Play, Benchmark, Soak test, mode). A
finished benchmark leaves its text in `window.__benchResult`.

## Architecture rules

- **Data-driven worlds.** Each world is one definition file (`src/worlds/*.js`) holding
  only numbers and recipe names. No world-specific code paths in the engine. If a new
  world needs engine changes to look right, add a *generic* feature (as was done for
  planetshine and black-sky metering), never `if (mars)`.
- Small single-purpose modules (see `docs/ARCHITECTURE.md`).
- Modules that depend on the world expose `setWorld(...)` and mutate their existing
  uniform objects; never replace an object in `G` after start-up (materials hold the old
  reference). Worker replies carry the terrain `epoch` and are dropped after a switch.
- Every lit surface goes through the shared lighting chunk (`src/render/lightingGlsl.js`)
  so the one-light look holds everywhere.
- Every feature that costs frame time registers a step in the governor
  (`src/perf/governor.js`), cheapest visual loss first.

## Hard-won lessons

- With `glslVersion: GLSL3` three does **not** declare `gl_FragColor`: declare your own
  `layout(location = 0) out vec4 fragColor;`.
- Everything a shader writes to the HDR target is pre-multiplied by `uExposure`; LUTs are
  pre-scaled too (ARCHITECTURE "Radiometry"). Half floats lose all precision below
  ~6e-5, which shows up as coloured blotches at night.
- Lit surfaces write alpha 1 into the HDR target, sky/stars/Sun write 0: the metering
  uses it to protect sunlit surfaces from over-exposure.
- Height code (`src/terrain/height/*`) must stay free of DOM/three imports: it runs in
  workers, on the main thread and in Node.
- Anything a terrain op writes to `c.slope` must be continuous, and slope-modulated
  layers should only contain small wavelengths; otherwise the modulation itself creates
  cliffs. The crater lattice cell size and its locality bound are tied together (see the
  comment on `craters` in `layers.js`).
- After changing a terrain recipe, re-pick the start position, ship offset and bookmarks
  (`scripts/find-ledge.mjs`, `scripts/probe-terrain.mjs`): the ground moves.
- The character is drawn relative to the camera (`rig.heroRel`); the camera is still the
  thing that moves. In flight the figure sits at a fixed offset ahead; on foot the rig
  moves the soles (`rig.feet`) and places the camera behind them. Never write a pose velocity into `rig.velocity` — in hero mode
  the rig integrates it (use the `motion` argument of `Hero.update`).
- A `sampler2DShadow` bound to a never-rendered depth texture makes every draw call that
  uses it fail silently; the near shadow map is therefore always initialised.
- On tile-based mobile GPUs: clear before full-screen passes, scissor the scene clear to
  the part of the target that is used, invalidate what will not be read back.
- Flight must go where it is aimed. Three things once made every aimed trip miss and all
  three looked harmless: heading and pitch measured against a horizon that turns as you
  move (now the direction is held in space away from the ground), a pitch limit one
  degree short of vertical, and a speed that eased down more slowly than the distance
  shrank. Anything added to flight (gravity, limits) may slow the motion but must not
  bend it while the stick is pushed. Check with `node scripts/flyby.mjs`.
- The governor judges a late frame against its target interval, never against the
  measured refresh rate: when every frame is slow the refresh rate reads too low and
  would excuse them. Check governor changes in a simulation before the phone sees them.
- Anything that screenshot mode waits for (`__shotReady`) must be able to finish in
  every camera position, or the headless scripts stall there (the rocks' shadow check a
  few hundred metres up was such a case).
- A backtick inside a GLSL comment ends the JavaScript template string around it and
  breaks the build; and a build piped through `tail` reports success anyway. Build with
  `./scripts/build-check.sh`.
- Screen-space froxels cannot carry the haze near a planet's edge seen from space (the
  path length jumps between neighbouring froxels): sky and grazing ground are marched
  per pixel there.
- three's polyhedron geometries are triangle soup: `computeVertexNormals` gives one
  normal per face unless the vertices are merged first (the moons' terminators were
  staircases).
- A change to a world's air shows most where you are not looking for it: a tighter dust
  lobe meant for the far wall brightened the sunset aureole by a third. Check `ledge`,
  `sun` and `dusk` after any atmosphere number changes.
- A terrain op that looks crisp from afar can read as a dune up close: a terrace riser is
  rock only if its cliff fraction makes it steeper than the surface's `rockMin` slope.
- A map wrapped round a globe has a seam in longitude: give the sampler its footprint
  from the direction vector (`textureGrad`), never from derivatives of the longitude,
  and remember three flips an image's rows on upload unless `flipY` is off.
- LOLA-only lunar elevation has kilometre-wide gaps between tracks at low latitudes
  (blocky canyons); SLDEM2015 fills them. Look at a top-down probe before trusting a map.
- The terrain's level of detail does not depend on screen size: a picture 309 px tall says
  little about a 1440 px phone (4–5x more pixels per texel). Judge sharpness at the phone's
  density (`--size 880x412 --dsf 3.5`), not with a narrower lens, which also raises detail.
- Any pattern phased by the detail texture's coordinates must have a whole number of
  cycles per 64 m tile: each chunk knows its tile offset only modulo one tile, and a
  fractional count breaks the pattern along chunk edges (the ripples did).
- A photographic colour map carries its own shading (Viking's sunlit walls and shadows);
  from orbit that is real depth, so do not flatten it to remove "lines".
- Small very bright things (a lander, sunlit rocks on dark regolith) can own a
  brightness-weighted meter and turn the ground black: check `ship` after any change to
  how surfaces reflect or to the metering.
- Phones allow 16 textures per shader; the test browser allows 32 and 4096 uniform
  vectors. A shader over a phone's limit draws nothing there and works in every headless
  test (the whole ground vanished on the phone at 17). `scripts/lib/glLimits.mjs` checks
  every program in `npm run smoke` and in screenshot runs. The terrain's fragment
  shader is at 15 of 16 since the clouds' shade atlas took the place of the cloud map and its
  noise (its vertex shader reads more, which a phone counts apart): one map is free, and after
  it a new map must take the place of one.
- three uploads a changed texture at the draw call that first uses it, in the middle of
  the render pass, and with `generateMipmaps` has the GPU build the mips there. A phone's
  tile-based GPU must write the half-drawn picture out and read it back for that: every
  frame that took in a terrain patch came late (third phone benchmark). Upload between
  frames (`renderer.initTexture`, or WebGL calls as in `chunkPool.js`) and make mip maps
  off the GPU. Nothing headless shows this.
- Find out whether a cost is per item or per frame before spreading it out: uploads paced
  to one every other frame made every other frame late (49 % at two stops), where several
  in one frame had cost one late frame.
- An excuse for a late frame ("terrain was arriving") must run out: with ground arriving
  all the time every frame was excused and the governor watched half of them come late.
- The cloud machine has 4 cores and software WebGL: run **one headless browser at a
  time**. Parallel renders gave no extra throughput and made screenshots time out
  (180 s) and terrain detail drop. The full reference set takes 3–4 hours alone; the
  stability test about 2. Background commands are cut off after 2 hours, so chain long
  work in pieces, and wait on a log line (`until grep -q ...`), never on `pgrep -f` with
  a pattern that also appears in the waiting command (it finds itself and waits forever).
- Helpers started with an isolated worktree begin from `main`, not from the session
  branch: tell them to check out the session branch's head first, and keep their
  worktrees out of commits (`.claude/worktrees/` is ignored).
- A GO trip to another body crosses the world hand-over halfway: the target becomes the
  world underfoot. Anything in `autopilot.js` must handle a target at the origin
  (`npm run transfer` simulates the hand-over).
- Every vector kept in planet-fixed axes must be turned in `App.switchWorld`: the axes turn
  by about 112° between Mars and the Moon. The trip's heading and the cloak's cloth were
  missed once (the trip veered off and arrived 4 s late; the cloak whipped round).
- A GO trip's speed when it arrives is far above what hand flight allows there (it plunged
  from 60 km to the ground in a few frames): `stopTransfer` hands back the stick's speed.
  `npm run transfer` flies every trip with HOVER on and off and prints the height after.
- Everything is kept in the home world's spinning axes, in which any other body races by
  (Phobos at 1.5 km/s, the Sun at 15,000 km/s seen from Mars). Near such a body the
  traveller is carried along with it (`App.carryWith`); anything new that must stay
  beside a body that is not home needs the same.
- `rig.agl` is the height over the home world's ground and feeds the speed law, the near
  plane and the hand-over test: never write a placeholder into it (a zero made flight
  crawl at 7 m/s beside every moon).
- A worker job sent every frame keeps the terrain from ever counting as settled, and every
  screenshot then waits out its time limit: ask once per screenshot (`requestHeroVis`).
- A test that cannot fail is worse than none (`npm run flight` printed "errors: none" for
  two milestones whatever happened). Every script must exit non-zero on a failed check.
- Lowering resolution cures only slow pixels. On the phone a ten-second stretch of slow
  work per frame once took the picture from 4.45 to 1.60 megapixels without curing a
  frame. The governor now reads the page's own time per frame; the benchmark prints it,
  and each stop of the route on its own line. Read those before deciding what is slow.
- The home world's transmittance table answers only from inside its air. From far outside
  it says "the ground is in the way" for most directions: anything in the sky looked up
  through it from there draws black (Earth did). Guard with `uCamRkm < uRTop`.
- Several maps packed into the colours of one JPEG leak into each other (the clouds'
  detail became a blocky glow in the city lights at a long exposure). One grey picture
  per map, uploaded as one byte a pixel.
- A normal used for lighting must be in the scene's axes: a globe's own direction
  (`normalize(vObj)`, right for its map) lit the night side when used as the normal.
- The exposure meter aims at a middle grey over the whole picture: a bright globe that
  fills the view comes out dull, its clouds grey. Things that must read as white (a
  cloud-covered planet, the Sun through its filter) are held at their own level (`uGain`).
- A rule that says "this is not the cause, do nothing" needs a way out: the governor's
  slow-work test once blocked every resolution step for good. Every lever falls through
  to the next when it is used up, and the simulation has a case that fails if it does not.
- An eclipse is a small shadow on a world, seen from one place: applied to the whole
  frame's sunlight from the camera, hovering behind Phobos turned sunlit Mars black.
- The cloud machine reaches only the hosts its environment allows (`what-it-s-best-at`:
  NASA GIBS, USGS planetary maps, the PDS geosciences node). NASA's older image server
  (eoimages) drops the connection from here even when allowed: use GIBS.
- A noise lattice searched over a fixed block of cells (Worley cells, crater lattices) is
  right only if nothing outside the block can be nearer than what is inside: with a
  centre anywhere in its cell the answer changed across lattice planes, as walls 100 m
  high. Bound the jitter so the block is provably enough.
- A mask's fade centred on its limit is at half strength at the limit: a latitude limit
  of 0 or 90 degrees left the layer half there at the very place it was made for. And an
  early-out by distance in a mask must be wider than the mask (a place 34 degrees wide
  was cut at 26, as a wall).
- The shadow rays' ceiling is the elevation map's top plus `shadowHeadroom`: an op that
  adds mountains far above that must report them (`fn.top`, as `massifs` does), or the
  rays stop under the peaks and nothing casts a shadow.
- Sky bodies drawn at made-up distances in the far pass need slots that cannot cross:
  a big planet's near side reaches far in front of its centre (a moon in transit was
  drawn behind its planet). Each slot starts behind the whole of the one before.
- A body's "radius" has several meanings (the globe, the keep-out round its rings, what
  its surface gravity belongs to): passing the widest to gravity made Saturn pull 5.8
  times too hard.
- DOM built again on a timer loses clicks (a button replaced between press and release
  gets none): update text in place. And release the pointer lock when an overlay opens.
- A scripted benchmark must not depend on the sky: a moon in the way became a world to
  hand over to and changed the route. During a benchmark only its destination counts.
- Earth streams its maps while the game runs (terrain/tiles). The test browser cannot
  reach the services: `scripts/lib/browser.mjs` mirrors them from `/root/mapcache/ext`
  (curl on a miss). A first picture at a new place fetches some 60 tiles and is slow;
  Earth pictures need `--timeout 600` at the phone shape. Node scripts (`peek`, the
  flight simulations) see only the bundled maps.
- Something marked "build again" must be marked done when the new build is asked for,
  not when it lands: between the two it was asked for again every frame (932 builds
  queued for 400 patches, and a scene that never settled).
- When one number carries two meanings (the normal map's fourth: cavity shading on land,
  1 + depth on water), the writer and the reader change in the same edit: a builder
  still writing the old form drew the sea as land and a black band at the horizon.
- Radar elevation (SRTM) has the sea at exactly zero near land: no bed, no depth, nothing
  to tell sea from a beach. The tile worker gives coastal water a bed by its distance
  from land.
- A window cut from the land is not a drainage basin: flooding inward from every edge
  cell sent Lake Powell out backwards over the edge it enters by, and the Colorado
  reached the Grand Canyon with a twentieth of its water. Only the stretches of edge
  where the coarser map says the land outside is downhill let water out; a river that
  comes in is put in where the coarser map says it crosses.
- GLSL ES 3 reserves words that look like ordinary names: `patch`, `sample`, `filter`,
  `input`, `output`, `common`, `active`, `partition`, `half`. A variable called `patch` broke
  the ground shader on the test browser (and would on the phone); the build does not
  compile shaders, so only a picture run shows it.
- A map with 600 m pixels knows nothing of a cliff inside one: the far forest covered
  the Grand Canyon's rock walls in green until the shader asked the ground's own slope.
- Elevation in whole metres makes exactly level stretches of any gentle slope: "level
  cells are water" drew a lake over a Vermont hillside. Water lies in a hollow: hardly
  any ground round a real lake is lower than it.
- Under trees the only light on the ground was the blue of the sky (the Sun is in the
  crowns' shadow): a forest floor like water. Light under a canopy has come through
  leaves; and crowns let flecks of Sun through.
- Anything that moves with the wind is added up frame by frame (`+= speed * dt`). Speed
  times the clock moves the whole field by every gust's share of all the time passed:
  the clouds slid back and forth and the rain jumped metres between frames.
- A pass that draws into a small picture of its own must not use `gl_FragCoord` for
  anything laid out in the main view (the haze's froxels): it says where its pixel is
  (`HAZE_UV`). And its target is made once at the largest size and used in part, like
  the main picture: made anew at each resolution step, it is an allocation in the
  middle of the frames that were late already.
- What is placed on the ground (lander, rocks, trees) is placed again when streamed
  elevation arrives: it was placed on the ground of the maps that were there at the time.
- When two places must agree on a rule (how closed a canopy is, the waves a swimmer rides,
  the shade of a cloud), one of them works it out and hands it to the other. Written
  twice, each was different within a day.
- Waiting on `ps | grep shots.mjs` inside a command that goes on to run `shots.mjs` waits
  for ever: the pattern is in the waiting command's own line. (The lesson about `pgrep -f`
  above, met again.)
- A lake is in the elevation as a stretch of exactly level cells; a pit that only the
  flood fills is a valley whose gorge is narrower than a cell (filled, Nevada was a sea).
  And a test must be seen to pass on the real thing: the one that kept level stretches
  could not (its rim was counted among cells level by definition), so no real lake was
  drawn for a whole stage. After changing the lake or river rules run `npm run lakes`
  before any picture; and when a check is new, break the thing it guards once to see it fail
  (its first form looked only at lake edges and passed over a 27 m wall inside a lake).
- Streamed elevation has bad cells (a spike of 7 964 m in Vermont, holes far under the
  sea inside lakes) and real lake beds under sea level (Champlain). Nothing downstream
  may take "at or under zero" to mean the sea without asking whether the sea reaches it.
- A layer made to add relief to a coarse map must stop where the map is fine (`belowDem`):
  the gully layer cut 100 m gullies into mountains that 27 m elevation already showed.
- Count the work a change of data sets off before it reaches a phone: three map rings
  arriving one after another had the same ground built up to five times, and all that was
  loaded with it (600 builds for 85 patches on screen). Build again once, when what is on
  its way has arrived, and only what is drawn. `node scripts/play-profile.mjs --at ...`
  prints patches built and the page's work by part in the real game.
- When every frame is of one kind (ground arriving in each), the governor has nothing to
  compare and takes it for slow pixels: it went to the fewest pixels and every saving and
  cured nothing. Work that comes in bursts leaves frames to compare.
- The governor's last steps must leave the scene what it is: with the cloud layer and the
  rain switched off, a hurricane was a calm blue sky. A step thins; it does not remove
  what the place is about. Look at `--floor` pictures after adding steps.
- A frame's length on a phone is a whole number of refreshes: it cannot say what a thing
  costs. The benchmark's cost test times frames until the GPU has drawn them (one pixel
  read back) with each saving on alone. Ask for a benchmark, read that table, then cut.
- Nothing leaves the main picture between its clear and its last draw, and its depth is
  never a texture. The cloud volume once read the depth as a texture and was marched in
  the middle of the frame: every world ran at 15 fps on the phone at any resolution (a
  tile-based GPU writes the whole half-float picture and its depth out and reads them
  back, 50 ms and more). The sign of it in a benchmark: a cost no resolution and no
  saving changes, smaller at full resolution. What needs depth is drawn as passes at set
  depths inside the picture, or before it.
- A change that puts something everywhere (fair-weather cloud where the map had none) must
  be looked at where the ground is high: a cloud base 1 400 m over the sea was fog on a
  plateau 2 100 m up, and the opening view was a blank orange wall. Heights of things in
  the air are over the country, not over the sea.
- A look tuned in one kind of place is wrong in another: the painted haze was set in a
  forest and on a canyon rim 2 km up, and from the air over low country the land was a
  grey blur. Before sending a look, fly it: pictures from 900 m and 2 km, toward the Sun
  and away, over flat country.
- Nothing about a thing in the world may hang on where the traveller stands or looks, or
  the owner sees it "move when I move". The clouds did four times over: a base that
  followed the ground under the traveller (the sky sank when one flew off a rim), slices
  of the view's depth (a turn of the head recut every cloud), an edge cut slice by slice
  (a cloud thinned as a boundary passed through it), and other clouds far off than near.
  Anything drawn in layers of distance: layers of distance from the eye, one rule for
  the whole line of sight, and the same thing far as near.
- A benchmark's cost table is only as good as its baseline: with "everything on" drifting
  from 36 to 61 ms over the test, the savings measured first read as costing 14 ms.
  Believe differences that are large and repeat at every view; nothing under 3 ms.
- Look at a thing alone before looking at it in the scene. The trees were judged for three
  deliveries in forest pictures that take ten minutes each; nobody had seen that the far
  mesh, which is most of the trees in any view, was three plates on a stick. A sheet of
  every shape at every distance (`scripts/tree-preview.mjs`) showed it in two seconds.
- A cover set on one level of a 3-D noise is not the cover of the sky: a layer as deep as
  the noise's period shows the union of all its levels from below. "60 %" was a grey lid.
  Judge the amount of cloud from above and from below, not from the number.
- "Closer to the reference" asked three times running means the technique is wrong, not
  the tuning. The owner's trees are finely cut foliage on a skeleton, shaded as one mass;
  three deliveries polished low-polygon lumps before the trees were rebuilt as cut-out
  cards. When a look is asked for by pictures, name what the pictures are made of first.
- What is paid every frame whatever is on screen shows in no saving of the cost test:
  with every saving on, a phone frame still took 49 of 58 ms, and with nothing drawn 28.
  The last pass wrote the screen's 4.45 million pixels whatever the picture's size, the
  shadow maps were drawn whole every frame, and the ground was shaded under everything
  that hides it. To find such a cost, leave whole parts out (`PARTS_OUT` in the
  benchmark), down to a frame with nothing in it.
- A test that moves the camera must check that the camera moved: on foot the rig puts it
  back behind the character, and the shadow-turns test passed with no pixel different.
- Foliage made of cards alone is a lace one sees straight through, and a forest of it a
  green noise. A crown needs a dark inside (a heart of crossed cards in every bunch, a
  skirt under every tier of a fir): then it is a mass with a cut edge.
- Two ends of one thing wrapped into a box each by itself come apart at the box's edge:
  one rain streak in twelve was a line drawn right across the box (the scratches that
  were taken for the rain). Wrap one end, and work the other out from it.
- The terrain's near plane is 0.15 of the height over the ground: anything drawn with that
  camera close to the eye (rain, spray, sparks) is there on foot and cut away in flight.
  The rain was "too thin" for two deliveries for this alone. It gets a slice of its own
  from the eye to that plane, as the character has.
- Something meant to be seen against the scene must be lit by something the scene is not:
  rain lit by a set share of the Sun's light came out exactly as bright as the overcast
  behind it. A drop shows the sky: it is lit by `skyLight`, above the veil's grey.
- A thing "switched off" by giving it no size is still drawn: a grass blade of no height
  is a sliver on the ground that lands on a pixel now and then, and 160 000 of them were a
  sprinkle of dark specks on every water and sand. Throw the vertex out of the picture
  (`gl_Position = vec4(2.0, 2.0, 2.0, 1.0)`). To find what draws a thing nobody can
  name, take the parts out of their scenes one at a time and count
  (the scratch script of 2026-11-22 did it in one browser session; guessing took three pictures).
- A governor that needs a run without one late frame to step up never steps up on a
  device with late frames of its own: the phone had one in fifteen at every stop, at one
  million pixels as at two, and sat at the floor with every saving on for whole
  benchmarks ("unrendered", the owner said). A lever is pulled as a trial: if the late
  frames stay, it is put back. And the cost test said beforehand that the levers bought a
  tenth of a frame between them: read what a lever buys before trusting it with the picture.
- The phone's picture is whatever the governor has left of it. Before judging or tuning a
  look, take the pictures a traveller on the phone would see: `?debug=floor` for the
  worst case, and the whole way in (from 20 000 km down to landing), not only the
  bookmarks on the ground. The home world from space was a pale ball with no clouds beside
  the Earth one sees from Mars, and nobody had looked.
- A look made for the ground (thick low air, light in two tones) is wrong from above: the
  haze is looked through whole, and at midday the two tones put every slope in the light.
  Anything of a look that depends on how far off or how high one is needs its own numbers
  there (`uHaze`, the relief light).
- A made world showed what had quietly assumed Earth's size: tree blocks measured in
  degrees (0.001 degrees is 111 m on Earth and 4 m on a world 250 km in radius), a tile
  worker's metres per pixel, a tree line and species by Earth's continents, an exposure
  rule for "a planet seen whole" that a small globe never met (it burned out white).
  Anything in degrees or in "share of the frame" is a guess about the world's size.
- A place chosen from a coarse map by a score is judged again from the ground: "falls
  1 100 m toward the east" was the sea's bed (a flat coastal plain), and an "open" cell
  of the 383 m map was a wood. Score the land, not the bed; then find the very spot with
  the height function (`find-overlook.mjs`) and sketch it (`peek.mjs`) before any picture.
- Ground-level pictures of a wooded place take this machine seven seconds a frame (some
  twenty minutes a picture, and the capture itself may time out once and succeed on the
  second try): keep them few, take the views from the air first (three minutes each),
  and give them `--timeout 1500`. A part hidden by `visible = false` from a test script
  is shown again by the app on the next frame: take it out of its scene instead.
- Helpers on machines of their own (other sessions of this account, started with
  `create_session` on a branch of their own, a brief in `docs/briefs/`): three of them
  built the far forest, the far grass and the far rocks in an afternoon, where pictures
  at one browser a machine would have taken days here. What made it work: the brief in
  the repository, not in a message (what is wrong today with numbers, the design, the
  rules that bite, the pictures to hand back, a report beside the brief); a first
  working version with one before/after pair asked for early; corrections sent as short
  notes about a named picture; their branches merged here as soon as they build, and the
  others asked to merge this branch into theirs, so every later picture is of the
  combination. What went wrong: a brief's view inside a cloud and views of a meadow that
  was a wood (try the views before writing them into a brief); and reading a helper's
  transcript with `list_events` floods this session's context even at a small limit:
  ask the helper, or read its branch.
- A layer "only where it is steep" is everywhere on land whose slopes are all alike: the
  maker leaves mountain flanks at one slope (its cap) for long stretches, and benches of
  rock meant for cliffs drew level streaks over every mountain side. Three causes were
  guessed, "fixed" and pushed before a picture said which (the snow's edge, a ground
  pattern sized for Earth, the benches). Switch the suspect off in one build and look,
  before changing anything for good.
- A script nobody runs breaks without a sound: a helper file rewritten under new names
  left the flicker check, the sketch and the relief probe unable to start for three
  deliveries (and the notes said the flicker check had been run). `scripts/check-scripts.mjs`
  (in the build check) reads every import of every script; after changing a file under
  `scripts/lib/`, start each script that uses it once.
- Pictures from a standing camera cannot show what goes wrong in motion, and a helper's
  pictures are all of that kind. Three reviewers reading the far-view code cold (one part
  each, no browser, findings backed by small replays in Node) found in twenty minutes what
  a day of pictures had not: the whole grass field sliding 0.8 m sideways every 200 m of
  flight, far trees missing in strips, trees at a hand-over line drawn by nobody for 15 m
  of travel, a walker standing in the air beside rocks. Have work that others built
  reviewed this way before it ships, hand each builder its list, and ask for a test that
  fails before the fix.
- A small world also shows every term in x times D over R that Earth hides: a plane 1 km
  over the ground was 0.03 m of error on Earth and 0.8 m on Haven (the grass's anchor);
  and a lattice whose cell width changes by latitude band (`blockLon`) cannot be indexed
  by column across two bands (on Haven a band is 4 km: every large tile straddled one).
- A sketch tool's answer is only as wide as its question: "no tree shades the ground 1 to
  12 m ahead" was true, and the pine's shadow lay 15 to 50 m ahead, across the whole
  opening view. When a tool and a picture disagree, find what the tool did not ask.
- A long run started as a background command dies at the two-hour limit, and the machine
  itself can restart in the middle of one (it did, during a delivery's final tests): the
  scratchpad, the frozen build and the pictures survived, the processes did not. Start
  long runs detached (`nohup setsid script &`), as steps that each write a line to a log
  when done, and wait on the log: then a run is picked up from its last line.
- A debug switch that hides a thing must take away what the thing does to everything else:
  `debug=noclouds` first hid the cloud layer and left its shadow on, with a white map for a
  cloud, and every "clear" picture was taken under an even overcast. And a render target
  of one byte a pixel read back into a buffer of four fills a quarter of it: "three
  quarters in shade" was the part never written.
- A card on edge is nothing: the far trees (upright cards) were specks and crosses from
  above, a fir's rosette lay under the middle of its crown and was lit as its underside,
  and a trunk drawn on an upright card shows through the crown. What is seen from above
  needs a form, a light and a rule of its own, blended in by the angle it is looked down at
  (`life/farTreeForm.js`), and a sketch of it alone from several angles before any picture.
- Software WebGL (the headless browser) does not skip what follows an early `return` in
  a shader, only what stands inside an `if` that is false for the whole 2 x 2 pixels: the
  ground "in one flat tone" (`uPlain`) still cost a third of its shading there, and a
  measure of "shaded minus flat" left that third out. A texture read costs it far more
  against arithmetic than it costs a GPU, and its vertices cost as much as its pixels at
  the reference pictures' size: work moved from pixels to vertices shows no gain there.
  Believe it about what is skipped; measure at the phone's pixel count (`--dsf 2.2`).
- The dev server reloads the page when a source file changes: a long headless run from
  the working tree is spoilt by the next edit (a cost profile was, mid-way, without a
  word). Long runs go from a frozen build (`--distdir`) or from a copy of the tree.
- The phone's cost table shows work done at every pixel and then weighted zero as the
  cost of the saving that happens to switch it off: `far-relief` bought 3.5 ms at the
  opening view, where the relief is added to no pixel near by; what it bought was a loop
  over the elevation rasters run before the test that makes it unnecessary.
- A helper session whose turns keep ending in an error may have reached its model's usage
  limit, not met a fault: `get_session` says so in `status_detail` ("You've hit your ...
  limit"). Resending its job does nothing; a new session on a model with room takes over
  from the brief and the report in the repository (that is what they are for), with a
  second brief that says what is left.
- A check of a finding reads the code as it is when the check runs: fixes landed while the
  checks were running came back "refuted" (already fixed). Tell checkers the commit the
  finding is about, and land fixes after the checks, or say in the brief which are fixed.
- Aerial-perspective slices must not change spacing across the horizon (neighbouring
  rays would disagree and draw a band); only the ray-march stops at the ground.
- A sculpt is a statue: one fused skin, sleeve joined to skirt where they touch, nothing
  behind what touches. Bound to moving cloth sheet by sheet it tore into shards; cut at the
  joins it had ragged holes; drawn two-sided its inner face showed through as dark rags.
  What works: carry by the body's parts, add the cloth's shift, blend garments across their
  joins, draw the outside only. And measure a tear before guessing at it: a count of edges
  drawn out in a pose, by cause (`node scripts/hero-bind-test.mjs --list`), named the fused
  joins in one run after three guesses had not.
- Look at the game as the player gets it, with no switch in the URL. The sky's field fell back
  to a stub's test pattern ("fair") whenever no `sky:` switch was given: four helpers pictured
  their work under `debug=sky:model`, every check asked only "is the field on", and the merged
  build drew no storm of the day. A test of a default asks what the default is.
- Two clocks: `?t=` (and a bookmark's `timeOffsetHours`) counts hours from the scene's own
  moment; the weather's clock counts seconds from `weather.epoch` (521 hours apart on Haven).
  A Node scan of the model at `t = H * 3600` asks about another day than the game shows at
  `?t=H`: `t_weather = (Date.parse(scene.dateUTC) - Date.parse(weather.epoch)) / 1000 + H * 3600`
  (or `new Steer(weather, R).t(date)`). Views, stability cases and benchmark hours picked from
  the model go through it.
