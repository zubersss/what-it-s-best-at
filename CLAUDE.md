# Solar System Explorer — project guide

Browser space-exploration game set in the real solar system. Milestone 1 is a single
benchmark scene (Mars, Coprates Chasma in Valles Marineris, ~20 min before sunset) that
proves the art direction and the engine foundation. Future sessions have no memory except
this file and `docs/` — keep them current.

- `docs/ARCHITECTURE.md` — how the engine is put together, frame order, units, frames.
- `docs/PROGRESS.md` — what is done, known issues, decisions taken, what is next.
- `docs/ASSETS.md` — source and licence of every asset.

## Run and test

```
npm install
npm run dev            # http://localhost:5173/
npm run build          # static site in dist/ (relative paths, GitHub Pages ready)
npm run preview        # serve dist/
npm run shots          # headless screenshots of every bookmark -> docs/shots/
npm run assets         # re-download and convert NASA/Yale data into public/data/
npm run probe          # top-down shaded relief of the height function (no browser)
```

`npm run shots` needs Playwright (`npm i -D playwright && npx playwright install chromium`
on a normal PC; cloud sessions have it pre-installed — do not reinstall it there). It
builds nothing itself: it starts a Vite dev server, loads `?shot=<name>&world=<id>` and
waits for `window.__shotReady`. Options: `--world mars|moon`, `--shot ledge,sun`,
`--size 1280x720`, `--out docs/shots`.

**You cannot judge this project by reading code.** After every visual change run the
shots, open the PNGs and look at them. Headless Chromium uses software WebGL, so its
frame rate is meaningless — never report it as performance.

URL parameters: `world=mars|moon`, `shot=ledge|sun|wall|ship|dusk` (fixed camera
bookmark), `t=<hours offset>`, `hud=0|1`, `scale=<fixed render scale>`, `fly=1`.

Keys: `WASD` move, mouse look (click to capture), `Shift` run / fly fast, `Space` jump /
up, `Q`/`E` fly down / up, `F` walk ↔ fly, `Z` hold for telephoto, mouse wheel = zoom
amount, `H` HUD, `[` `]` time −/+, `1`–`5` bookmarks, `P` pause time.

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
- Custom shaders are GLSL ES 3.00 through `ShaderMaterial`/`RawShaderMaterial`.
- Vite, plain JavaScript ES modules, no framework. Must build to static files hostable
  on GitHub Pages (`base: './'`).
- Target: a Samsung Galaxy S23 Ultra (Chrome on Android, touch only, Adreno 740). The
  owner changed this from the original "old PC with weak integrated graphics"; the
  engine has not been adapted to it yet — see `docs/PROGRESS.md`.
- **No logarithmic depth buffer.** Distant celestial bodies render in a separate far
  pass, depth is cleared, then the near scene renders.
- All world positions are 64-bit JS numbers in metres. Only camera-relative positions go
  to the GPU (floating origin).

## Architecture rules

- **Data-driven worlds.** Each world is one definition file (`src/worlds/mars.js`,
  `src/worlds/moon.js`) holding only numbers and recipe names. No world-specific code
  paths in the engine. If a new world needs engine changes to look right, the
  architecture is wrong — fix the architecture.
- Small single-purpose modules: terrain (quadtree, chunk worker, height functions),
  atmosphere, sky (sun, stars, bodies), shadows, post-processing, ship, camera and
  controls, debug.
- Only public-domain or CC0 assets; record every one in `docs/ASSETS.md`.

## Performance budget

- < 200 draw calls and < 500k triangles per frame. Device pixel ratio capped at 1.
- Dynamic resolution: render scale drops to 0.5 when over frame budget, rises with
  headroom.
- Fixed-size pools for chunk geometry and textures; nothing grows unbounded;
  < ~300 MB GPU memory.
- Debug HUD (`H`): fps, frame ms, draw calls, triangles, chunks, render scale, memory.

## Do not build

Volumetric clouds, water, vegetation, SSR, SSAO, global illumination, motion blur, depth
of field, TAA, gameplay systems, UI beyond the debug HUD, other planets.

## Working conventions

- Commit after each stage; update `docs/PROGRESS.md` in the same commit.
- Shaders that light surfaces must go through the shared lighting chunk
  (`src/render/lightingGlsl.js`) so rule 1 holds everywhere.
- Everything a shader outputs to the HDR target is pre-multiplied by the current
  exposure (`uExposure`) so half-float never under/overflows.
- Height code (`src/terrain/height/*`) must stay free of DOM/three imports: it runs in
  workers, on the main thread and in Node (`npm run probe`).
