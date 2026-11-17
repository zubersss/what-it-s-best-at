# Solar System Explorer — project charter and guide

Future sessions have no memory except this file and `docs/`. Read this file,
`docs/ROADMAP.md` and `docs/PROGRESS.md` before doing anything, and keep them current.

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

- "continue": start the next unfinished milestone in `docs/ROADMAP.md` and work through
  it to its checkpoint.
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
npm run preview        # serve dist/
npm run shots          # headless screenshots of every bookmark of one world -> docs/shots/
npm run shots:all      # the full reference set: both worlds, orbit, character
npm run stability      # 3 consecutive frames along scripted moves, with a flicker report
npm run flight         # scripted Mars -> orbit -> Moon flight (headless)
npm run assets         # re-download and convert NASA/Yale data into public/data/
npm run probe          # top-down shaded relief of the height function (no browser)
```

The screenshot scripts need Playwright (`npm i -D playwright && npx playwright install
chromium` on a normal PC; cloud sessions have it pre-installed — do not reinstall it
there). `scripts/shots.mjs` starts a Vite dev server (or serves `dist/` with `--dist`),
loads `?shot=<name>&world=<id>` and waits for `window.__shotReady`. Options:
`--world mars|moon`, `--shot ledge,sun`, `--size 880x412`, `--dsf 1.25`, `--touch`,
`--out docs/shots`, `--query "t=-1&hud=1"`, `--suffix _x`, `--timeout 500`, `--dist`.
Reference shots use the phone shape: `--size 880x412 --dsf 1.25`.

Headless Chromium renders with software WebGL: a shot takes 1–3 minutes. Run long
batches in the background, never pipe them through `tail` (it hides all output until the
end), and take final sets from `dist/` so source edits cannot disturb them.

URL parameters: `world=mars|moon`, `shot=ledge|sun|wall|ship|dusk` (fixed camera
bookmark, deterministic screenshot mode, skips the start screen), `t=<hours offset>`,
`hud=0|1`, `scale=<fixed render scale>`, `mode=smooth|sharp`, `bench=run|soak` (start a
benchmark straight away), `fly=1`, `touch=1`, `hero=0|1`, `heropose=fly|hover`,
`lat= lon= alt= heading= pitch= fov=`.

Keys: `WASD` move, mouse look (click to capture), `Shift` run / boost, `Space` jump /
up, `Q`/`E` down / up, `G` flying character on/off, `T` aim at the next body in the sky,
`F` walk ↔ free-fly debug camera, `Z` hold for telephoto, mouse wheel = zoom amount,
`H` HUD, `M` Smooth ↔ Sharp, `[` `]` time −/+, `1`–`5` bookmarks, `P` pause time.

Touch: left part of the screen = move stick (push to the rim to run / boost), drag
anywhere else = look, buttons `HERO`, `TARGET`, `FLY`, `ZOOM` (hold), `VIEW` (next
bookmark), `HUD`, `MODE` (Smooth ↔ Sharp), `FULL` (fullscreen + landscape lock + wake
lock), `▲` up, `▼` down. The time slider is part of the HUD.

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
- The character is drawn at a fixed offset in front of the camera; the camera is still
  the thing that moves. Never write a pose velocity into `rig.velocity` — in hero mode
  the rig integrates it (use the `motion` argument of `Hero.update`).
- A `sampler2DShadow` bound to a never-rendered depth texture makes every draw call that
  uses it fail silently; the near shadow map is therefore always initialised.
- On tile-based mobile GPUs: clear before full-screen passes, scissor the scene clear to
  the part of the target that is used, invalidate what will not be read back.
- Aerial-perspective slices must not change spacing across the horizon (neighbouring
  rays would disagree and draw a band); only the ray-march stops at the ground.
