# Solar System Explorer — project guide

Browser space-exploration game set in the real solar system. Milestone 1 is a single
benchmark scene (Mars, Coprates Chasma in Valles Marineris, ~20 min before sunset) that
proves the art direction and the engine foundation, plus the Moon as a data-only swap.
Future sessions have no memory except this file and `docs/` — keep them current.

- `docs/ARCHITECTURE.md` — how the engine is put together, frame order, units, frames.
- `docs/PROGRESS.md` — what is done, known issues, decisions taken, what is next.
- `docs/ASSETS.md` — source and licence of every asset.
- `docs/shots/` — reference screenshots of every bookmark on Mars and the Moon.

## Run and test

```
npm install
npm run dev            # http://localhost:5173/   (add --host to open it from a phone on the same Wi-Fi)
npm run build          # static site in dist/ (relative paths, GitHub Pages ready)
npm run preview        # serve dist/
npm run shots          # headless screenshots of every bookmark -> docs/shots/
npm run assets         # re-download and convert NASA/Yale data into public/data/
npm run probe          # top-down shaded relief of the height function (no browser)
```

`npm run shots` needs Playwright (`npm i -D playwright && npx playwright install chromium`
on a normal PC; cloud sessions have it pre-installed — do not reinstall it there). It
starts a Vite dev server (or serves `dist/` with `--dist`), loads
`?shot=<name>&world=<id>` and waits for `window.__shotReady`. Options: `--world mars|moon`,
`--shot ledge,sun`, `--size 880x412`, `--dsf 1.25` (device scale factor), `--touch`,
`--out docs/shots`, `--query "t=-1&hud=1"`, `--suffix _x`, `--timeout 500`.
The reference shots use the phone shape: `--size 880x412 --dsf 1.25`.

**You cannot judge this project by reading code.** After every visual change run the
shots, open the PNGs and look at them. Headless Chromium uses software WebGL, so its
frame rate is meaningless — never report it as performance. A shot takes 1–3 minutes;
run long batches in the background and do not pipe them through `tail` (it hides all
output until the end).

URL parameters: `world=mars|moon`, `shot=ledge|sun|wall|ship|dusk` (fixed camera
bookmark, deterministic screenshot mode), `t=<hours offset>`, `hud=0|1`,
`scale=<fixed render scale>`, `dpr=<fixed pixel ratio>`, `fps=<target>`, `fly=1`,
`touch=1`, `lat= lon= alt= heading= pitch= fov=`.

Keys: `WASD` move, mouse look (click to capture), `Shift` run / fly fast, `Space` jump /
up, `Q`/`E` fly down / up, `F` walk ↔ fly, `Z` hold for telephoto, mouse wheel = zoom
amount, `H` HUD, `[` `]` time −/+, `1`–`5` bookmarks, `P` pause time.

Touch (phones): left part of the screen = move stick (push to the rim to run), drag
anywhere else = look, buttons `FLY`, `ZOOM` (hold), `VIEW` (next bookmark), `HUD`,
`FULL` (fullscreen + landscape lock + wake lock), `▲` jump / up, `▼` down. The time
slider is part of the HUD.

## Art direction: "mission-camera realism" (rules — do not break)

1. **One light.** The Sun is the only real light source. Fill comes only from physical
   bounce (sky light, sunlit ground, planetshine). No ambient fudge lights.
2. **Exposure is the art director.** HDR rendering, auto-exposure, filmic tone map. Stars
   are invisible when sunlit ground fills the frame and appear as the scene darkens.
3. **Real from afar, simplified up close.** Recognisable large landforms, clean sculptural
   shapes at ground level, no photo-scanned micro-detail.
4. **The true sky.** Sun, moons and planets at correct positions, sizes and phases.
5. **Found colour, not invented colour.** Natural, slightly muted. No sci-fi grading,
   no nebulae.

## Tech constraints (do not change without asking the owner)

- three.js current stable from npm (0.187 at time of writing — check
  `node_modules/three/package.json` and its source/docs instead of relying on memory).
  `WebGLRenderer` on WebGL 2. **No** `WebGPURenderer`, **no** TSL.
- Custom shaders are GLSL ES 3.00 through `ShaderMaterial`/`RawShaderMaterial`. With
  `glslVersion: GLSL3` three does **not** declare `gl_FragColor`: declare your own
  `layout(location = 0) out vec4 fragColor;`.
- Vite, plain JavaScript ES modules, no framework. Must build to static files hostable
  on GitHub Pages (`base: './'`).
- **Target hardware: Samsung Galaxy S23 Ultra** (Chrome on Android, touch only, Adreno
  740, tile-based GPU, ~3× display). The owner changed this from the original "old PC
  with weak integrated graphics" and asked for whatever makes it best on that phone.
  Desktop with keyboard and mouse must keep working.
- **No logarithmic depth buffer.** Distant celestial bodies render in a separate far
  pass, depth is cleared, then the near scene renders.
- All world positions are 64-bit JS numbers in metres. Only camera-relative positions go
  to the GPU (floating origin).

## Architecture rules

- **Data-driven worlds.** Each world is one definition file (`src/worlds/mars.js`,
  `src/worlds/moon.js`) holding only numbers and recipe names. No world-specific code
  paths in the engine. If a new world needs engine changes to look right, the
  architecture is wrong — fix the architecture (add a *generic* feature, as was done for
  planetshine and black-sky metering).
- Small single-purpose modules: terrain (quadtree, chunk worker, height functions),
  atmosphere, sky (sun, stars, bodies), shadows, post-processing, ship, camera and
  controls, debug.
- Only public-domain or CC0 assets; record every one in `docs/ASSETS.md`.

## Performance budget

- < 200 draw calls and < 500k triangles per frame (currently ~135 and ~460k: the
  triangle budget is nearly used — do not add geometry without taking some away).
- Render size capped by pixel count, not pixel ratio: `MAX_PIXELS = 1.5e6` in
  `src/config.js` (the brief's "pixel ratio 1" would be ~880×412 on the phone).
- Dynamic resolution: render scale drops to 0.5 when over frame budget (default target
  30 fps, `?fps=60` to change), rises with headroom.
- Fixed-size pools for chunk geometry and textures; nothing grows unbounded;
  < ~300 MB GPU memory (currently ~120 MB estimated).
- Debug HUD (`H`): fps, frame ms, draw calls, triangles, chunks, render scale, memory.

## Do not build

Volumetric clouds, water, vegetation, SSR, SSAO, global illumination, motion blur, depth
of field, TAA, gameplay systems, UI beyond the debug HUD and the minimal touch controls,
other planets.

## Working conventions and hard-won lessons

- Commit after each stage; update `docs/PROGRESS.md` in the same commit.
- Shaders that light surfaces must go through the shared lighting chunk
  (`src/render/lightingGlsl.js`) so rule 1 holds everywhere.
- Everything a shader outputs to the HDR target is pre-multiplied by `uExposure`; LUTs
  are pre-scaled too (see ARCHITECTURE "Radiometry"). Half floats lose all precision
  below ~6e-5, which shows up as coloured blotches at night.
- Height code (`src/terrain/height/*`) must stay free of DOM/three imports: it runs in
  workers, on the main thread and in Node (`npm run probe`).
- Anything a terrain op writes to `c.slope` must be continuous, and slope-modulated
  layers should only contain small wavelengths; otherwise the modulation itself creates
  cliffs. The crater lattice cell size and its locality bound are tied together (see
  the comment on `craters` in `layers.js`).
- After changing a terrain recipe, the start position, ship offset and bookmarks must be
  re-picked (`scripts/find-ledge.mjs`, `scripts/probe-terrain.mjs`): the ground moves.
- A `sampler2DShadow` bound to a never-rendered depth texture makes every draw call that
  uses it fail silently; the near shadow map is therefore always initialised.
- On tile-based GPUs: clear whole targets, clear before full-screen passes, invalidate
  what you will not read back.
