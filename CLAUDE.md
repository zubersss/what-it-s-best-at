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

A browser game where you fly a suited, cloaked character through our real solar system:
walk on worlds, lift off, reach orbit, cross to other bodies and land. Inspired by No
Man's Sky, but every place is real. The current build (Mars, the Moon, flight between
them, the character) is the foundation. Keep everything that works.

## Ownership

Claude is the owner and long-term maintainer of this codebase, and its design is Claude's
call. Consolidate and restructure when that makes it healthier. Two limits:

- do not change what the player sees or how flight feels as a side effect of a clean-up;
- list every behaviour change in the checkpoint message.

## Fixed decisions (ask the owner before changing any of these)

- **Art direction: "mission-camera realism"**, five rules:
  1. **One light.** The Sun is the only real light source. Fill comes only from physical
     bounce (sky light, sunlit ground, planetshine). No ambient fudge lights.
  2. **Exposure is the art director.** HDR rendering, auto-exposure, filmic tone map.
     Stars are invisible when sunlit ground fills the frame and appear as the scene darkens.
  3. **Real from afar, simplified up close.** Recognisable large landforms, clean
     sculptural shapes at ground level, no photo-scanned micro-detail.
  4. **The true sky.** Sun, moons and planets at correct positions, sizes and phases.
  5. **Found colour, not invented colour.** Natural, slightly muted. No sci-fi grading,
     no nebulae.
- **Tech**: three.js `WebGLRenderer` on WebGL 2, GLSL, Vite, plain JavaScript, static
  build, 64-bit world positions with camera-relative rendering, no logarithmic depth
  buffer. The game must run in a phone browser and the whole codebase is built on these.
- **Worlds are data-driven**: one definition file per world, only generic engine
  additions, public-domain or CC0 assets, sources recorded in `docs/ASSETS.md`.
- **Test device**: Samsung Galaxy S23 Ultra, Chrome, landscape. Policy: the best image
  quality that holds a steady frame rate there, including after 10 minutes when it
  throttles from heat. Frame rates from headless rendering say nothing about the phone:
  never report them as performance.
- **Resolution**: the ceiling is the canvas's native pixel size (CSS size ×
  devicePixelRatio; 3088 × 1440 on the phone at its WQHD+ setting). A governor finds the
  highest resolution that holds the frame target, anywhere from about 1 million pixels up
  to native. It lowers resolution first, then steps features down in a fixed order, and
  steps back up when there is sustained headroom, with hysteresis so it does not visibly
  hunt. Two modes on a button: **Smooth** (60 fps target, the default) and **Sharp**
  (30 fps target, favouring native resolution). Photo mode renders a single frame at full
  native resolution.
- **Budgets**: under 200 draw calls, 500,000 triangles and about 300 MB of GPU memory per
  frame, with fixed-size pools.

## Decisions Claude makes alone, and the ones that need approval

Without asking: implementation choices, tuning, refactoring, task order inside a
milestone, bug fixes, small quality-of-life features, installing packages, downloading
public-domain data, committing, pushing, opening and merging Claude's own pull requests,
and performance trade-offs inside the policy. Record notable decisions in
`docs/PROGRESS.md`. When torn, choose what best serves, in this order: the art rules,
steady frame rate on the phone, the data-driven architecture.

Ask for approval before:

- changing a fixed decision;
- removing a feature the player can see or use;
- anything that costs money or needs a new account or key;
- using an asset whose licence is not public domain or CC0;
- starting milestone 9.

**Expensive effects** (volumetric clouds, screen-space reflections, ambient occlusion,
global illumination, motion blur, temporal anti-aliasing): add one only when the phone
benchmark shows headroom and the governor can switch it off.

## Finishing work

Work through each milestone to its checkpoint. Do not end a turn by listing remaining
work or offering to continue. Errors, timeouts, failing tools and empty results are not
blockers: diagnose them and work through them. The only planned stops are the
checkpoints and the approvals above. If something truly cannot move without the owner,
say plainly what is needed and carry on with everything that does not depend on it.

## How to work on every milestone

1. Read `CLAUDE.md`, `docs/ROADMAP.md` and `docs/PROGRESS.md`, then write a short plan
   for the milestone (in `docs/PROGRESS.md`).
2. Judge visuals by looking, not by reading code. Save screenshots at every bookmark on
   every world, in orbit, and of the character (`npm run shots:all`), and compare them
   against real spacecraft and rover photography and the five art rules.
3. Helpers. A subagent costs a full extra session's worth of tokens, so use one only
   where it adds something Claude cannot: (a) once per milestone, before the checkpoint,
   an independent critic that sees only the screenshots and the art rules, never the
   code, and returns the five biggest gaps, ranked; (b) pieces of work that are
   independent and touch separate files. Tuning loops, small fixes and shared shader code
   stay with Claude. Brief each helper with the goal, the exact files or screenshots, the
   rules that apply and the output wanted.
4. Stability test (`npm run stability`): 3 consecutive frames along short scripted moves
   on the ground and in flight; fix anything that pops, crawls, shimmers or sparkles.
5. Add every new feature to the governor's step-down order (`src/perf/governor.js`).
6. Commit, push and merge so the phone link updates, update the docs and mark the
   milestone in `docs/ROADMAP.md`.
7. Checkpoint: stop and send the owner the checkpoint message.

## What the owner's replies mean

- "continue": a milestone at `checkpoint sent` is accepted (mark it `done` in
  `docs/ROADMAP.md`); start the next unfinished milestone and work through it to its
  checkpoint.
- Pasted benchmark results: tune the governor and resolution range from them first, then
  continue as above.
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

## Run and test

```
npm install
npm run dev            # http://localhost:5173/   (add -- --host to open it from a phone on the same Wi-Fi)
npm run build          # static site in dist/ (relative paths)
./scripts/build-check.sh    # the same, but fails loudly (never judge a build through `| tail`)
npm run preview        # serve dist/
npm run shots          # headless screenshots of every bookmark of one world -> docs/shots/
npm run shots:all      # the full reference set: both worlds, orbit, character
npm run stability      # 3 consecutive frames along scripted moves, with a flicker report
npm run flight         # scripted Mars -> orbit -> Moon flight (headless)
npm run foot           # the character on foot in the real game: walk, jump, super speed, take off, land (headless)
npm run smoke          # headless check of the start screen, modes, HUD and a full benchmark run
npm run govsim         # the governor against simulated GPUs (no browser)
npm run transfer       # GO trips flown without a browser: arrival, time against the marker's estimate
npm run target         # the target list, marker and a GO trip in the real game (headless)
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

URL parameters: `world=mars|moon`, `shot=ledge|sun|wall|ship|dusk` and the world's
landmarks (`olympus`, `gale` on Mars; `tycho`, `taurus` on the Moon) (fixed camera
bookmark, deterministic screenshot mode, skips the start screen), `t=<hours offset>`,
`hud=0|1`, `scale=<fixed render scale>`, `mode=smooth|sharp`, `bench=run|soak` (start a
benchmark straight away), `fly=1`, `touch=1`, `hero=0|1`, `heropose=fly|fast|bank|climb|hover`
(cruising, boosting, turning, straight up, hovering), `heropose=stand|walk|run|super|jump|land|launch`
(with `hero=1`: on foot; `land` is the three-point kneel after a hard landing, `launch` the
fist-up take-off), `posedir=side` (seen from the side), `target=<body>|sun|place:<id>`
(the target marker, view unchanged), `lat= lon= alt= heading= pitch= fov=`, `east= north=` (metres from the bookmark's place),
`aim=<sky body>` (turn the view to it), `dust=1` (with `hero=1`: a touch-down dust burst
frozen in mid-flight), `debug=noair|airall` (haze shadows off / everywhere),
`debug=nofar` (none of the from-space terrain changes; or one at a time: `norelief`,
`nofarrough`, `noboost`) for before/after pictures.

Keys: `WASD` move, mouse look (click to capture), `Shift` super speed on foot / boost in
flight, `Space` (or `E`) jump on foot (tap), take off (hold, or tap again in the air), up in
flight, `Q` down, `G` character on/off, `T` next target (this world's places, the bodies in the
sky, the Sun, none) and turn to it, `Enter` GO: fly to the target hands-off (the stick
or a movement key takes control back; looking around does not),
`X` hover on/off (off: gravity pulls when the stick is released, and touching the
ground stands the character on its feet),
`F` walk ↔ free-fly debug camera, `Z` hold for telephoto, mouse wheel = zoom amount,
`H` HUD (one line → full read-out with the time slider → off), `M` Smooth ↔ Sharp,
`[` `]` time −/+, `1`–`9` bookmarks (the first five are the scene, the rest landmarks),
`P` pause time.

Touch: left part of the screen = move stick (push to the rim for super speed on foot /
boost in flight), `▲` jump (tap) / take off (hold, or tap again in the air) / up, drag
anywhere else = look, buttons `HERO`, `TARGET` (the list of targets with distances), `GO`
(shown with a target: the hands-off trip), `HOVER`, `FLY`, `ZOOM` (hold), `VIEW` (next
bookmark), `HUD`, `MODE` (Smooth ↔ Sharp), `FULL` (fullscreen + landscape lock + wake
lock), `▲` up, `▼` down. The time slider is part of the full HUD.

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
  so art rule 1 holds everywhere.
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
  every program in `npm run smoke` and in screenshot runs; the terrain shader is at 15.
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
- Aerial-perspective slices must not change spacing across the horizon (neighbouring
  rays would disagree and draw a band); only the ray-march stops at the ground.
