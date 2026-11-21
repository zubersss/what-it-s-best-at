# Solar System Explorer — project charter and guide

Future sessions have no memory except this file and `docs/`. Read this file,
`docs/ROADMAP.md` and `docs/PROGRESS.md` before doing anything, and keep them current.
**Start with "Where things stand" at the top of `docs/PROGRESS.md`**: it says what was
last delivered, what the owner was asked for and exactly what to do next.

- `docs/ROADMAP.md` — the nine milestones, in order, with a status for each.
- `docs/PROGRESS.md` — what exists, decisions taken and why, known problems, session log.
- `docs/ARCHITECTURE.md` — how the engine is put together: frames, units, frame order, modules.
- `docs/ASSETS.md` — source and licence of every asset.
- `docs/shots/` — reference screenshots (every bookmark on every world, orbit, character).

## What this game is

A browser game where you fly a robed, long-haired character (the owner's own design:
`docs/PROGRESS.md`, "The owner's character") through our real solar system:
walk on worlds, lift off, reach orbit, cross to other bodies and land. Inspired by No
Man's Sky, but every place is real: fifteen worlds to land on (Mars, the Moon, Phobos,
Deimos, Mercury, Venus, Ceres, Io, Europa, Enceladus, Titan, Triton, Pluto, Charon),
every other planet and large moon in the sky at its true place for the date. Keep
everything that works.

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

- **Look: "mission-camera realism"**: the Sun as the one real light with physical bounce
  (sky light, sunlit ground, planetshine); HDR rendering, auto-exposure and a filmic tone
  map; real large landforms with clean shapes up close; the true sky (Sun, moons and
  planets at their real positions, sizes and phases); natural colour. The owner's
  character is the one deliberately fantastical thing in it, and the cloth flows in
  vacuum because the owner wants it to.
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
  steps back up when there is sustained headroom. Two modes on a button: **Smooth**
  (60 fps, the default) and **Sharp** (30 fps, favouring detail and native resolution).
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
./scripts/build-check.sh    # the same, but fails loudly (never judge a build through `| tail`)
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
node scripts/check-ephemeris.mjs   # every orbit and spin against JPL Horizons (no network; fails beyond a tolerance)
node scripts/peek.mjs --world io [--shot ledge | --lat .. --lon ..] [--pan 4]   # a CPU sketch of the view from a place, in seconds: for choosing sites and times
python3 scripts/fetch-worlds.py [job ...]   # the maps of the worlds of milestone 6 (5 GB of originals into .cache/maps), see docs/ASSETS.md
python3 scripts/fetch-earth-weather.py   # the weather of 8 September 2017 for Earth: clouds, rain, cloud tops, storms (NASA GIBS)
python3 scripts/fetch-earth-climate.py   # Earth's yearly rainfall for the rivers, from NASA GIBS (public/data/earth_rain_720.u8)
python3 scripts/fit-orbits.py      # orbits fitted to JPL Horizons (needs ssd.jpl.nasa.gov; replies cached)
npm run assets         # re-download and convert the small NASA/Yale files into public/data/
python3 scripts/fetch-maps.py   # the rest of public/data/ (needs: pip install rasterio numpy pillow), see docs/ASSETS.md
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
on the start screen last time), `shot=ledge|sun|wall|ship|dusk`, on Mars also `canyon`
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
`debug=nofar` (none of the from-space terrain changes; or one at a time: `norelief`,
`nofarrough`, `noboost`) for before/after pictures.

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
Mars; then its landmarks),
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
  every program in `npm run smoke` and in screenshot runs; the terrain shader is at 14
  (plus 2 read by its vertex shader).
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
  `input`, `output`, `common`, `active`, `partition`. A variable called `patch` broke
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
- Aerial-perspective slices must not change spacing across the horizon (neighbouring
  rays would disagree and draw a band); only the ray-march stops at the ground.
