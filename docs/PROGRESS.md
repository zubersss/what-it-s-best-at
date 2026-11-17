# Progress

Milestone 1: benchmark scene — Mars, Coprates Chasma (Valles Marineris), ~20 minutes
before sunset. Update this file in every commit that changes behaviour.

## Staged plan

| # | Stage | Status |
| --- | --- | --- |
| 0 | Docs, plan, assets (MOLA DEM, star catalogue) | done |
| 1 | Project skeleton, HDR post pipeline, HUD, cameras | done |
| 2 | Quadtree terrain, height source, materials | done |
| 3 | Atmosphere and fog | done (tuning continues) |
| 4 | Sun, sky bodies, stars, exposure behaviour | done |
| 5 | Shadows (baked terrain + near shadow map) | done |
| 6 | Rocks and ship | done |
| 7 | Performance pass | todo |
| 8 | Moon swap (`?world=moon`, data only) | todo |

## Decisions (and why)

- **Site**: Coprates Chasma, on the north flank of the southern ridge near 296.6°E,
  13.1°S. The trough runs ~W17°N; on the chosen date the Sun sets ~W25°N, i.e. almost
  straight down the canyon. The north wall (≈10 km of relief) is the "far wall".
- **Date**: 2014-01-31 (the evening Curiosity photographed Earth and the Moon from
  Mars) so Earth really is an evening star near the sunset.
- **Height data**: real MOLA. Global 4 px/deg (2 MB) + a 128 px/deg inset (463 m/px,
  2.3 MB) around the scene, fetched with HTTP range requests. Everything below ~1 km is
  procedural.
- **Stars**: real Yale Bright Star Catalogue (9 096 stars).
- **Depth**: no logarithmic depth. Far pass → clear depth → near pass with a dynamic
  near plane.
- **Pre-exposure**: shaders multiply by exposure before writing RGBA16F.

## Known issues

(none yet)

## Next

Work was paused by the owner (second pause) part-way through stages 5–6.

**Target hardware changed by the owner to a Samsung Galaxy S23 Ultra.** Nothing has been
adapted for it yet. Planned, not started:

- Touch controls (move stick, drag to look, buttons for fly / zoom / HUD / bookmarks).
  The brief lists "UI beyond the debug HUD" under do-not-build, so keep this minimal.
- "Device pixel ratio capped at 1" gives only about 880x412 on that phone. Proposed
  replacement: cap the pixel count (~1.5 M pixels) instead; needs the owner's OK.
- Tile-based GPU hygiene: full clears instead of scissored clears, clear before
  full-screen passes, invalidate depth after the scene pass.
- Reload on WebGL context loss; dynamic viewport height; optional wake lock.

State of the last commit:

- The canyon recipe in `src/worlds/mars.js` was retuned (narrower ledges, rougher
  walls, fewer craters, more rocks) but **not yet looked at in a screenshot**, and
  `scene.start` still points at the ledge found for the previous recipe, so the start
  position and ship offset must be re-picked (`node scripts/find-ledge.mjs`; the best
  new candidate was lat -13.17438, lon 296.56805, untested).
- The lander and rocks render (one screenshot seen: lander visible ~80 m away, rocks
  sparse). The near shadow map has not been verified.

To resume: re-pick the start ledge and ship offset, verify stages 5–6 in screenshots,
then stage 7 (performance + phone adaptation) and stage 8 (Moon swap), then save final
screenshots of every bookmark for Mars and the Moon in `docs/shots/` (none saved yet)
and bring `docs/ARCHITECTURE.md` up to date.

Things already noticed that still need attention:

- Chunk build time is too high: ~40 ms before the shadow bake, ~85 ms with it, and
  ~130–140 ms after the recipe retune (all measured in the headless container).
- At the 130-chunk draw budget, triangles on camera-facing walls are about 10–20 px
  wide at 540p; distant walls are soft.
- The start ledge is a wide flat bench, so the lower half of the `ledge` shot is
  empty foreground; the `wall` bookmark heading points at a nearby slope.
- Phobos has not been checked in a screenshot (it is in the eastern sky at the
  scene time, behind the default view).
