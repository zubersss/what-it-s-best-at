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
| 5 | Shadows (baked terrain + near shadow map) | in progress — code written, baked terrain shadows checked in a screenshot, near shadow map not yet looked at |
| 6 | Rocks and ship | in progress — code written and runs without errors, not yet looked at in a screenshot |
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

Work was paused by the owner part-way through stages 5–6. To resume:

1. `npm run shots -- --shot ship --query "t=-1.0"` and look at the lander, rocks and
   their shadows (nothing in stages 5b/6 has been visually verified yet).
2. Finish stages 5–6, then 7 (performance pass) and 8 (Moon swap).
3. Save final screenshots of every bookmark for Mars and the Moon in `docs/shots/`
   (none are saved there yet) and bring `docs/ARCHITECTURE.md` up to date.

Things already noticed that still need attention:

- Chunk build time roughly doubled (~40 ms -> ~85 ms in the headless container) once
  the shadow bake was added to each chunk.
- At the 130-chunk draw budget, triangles on camera-facing walls are about 10–20 px
  wide at 540p; distant walls are soft.
- The start ledge is a wide flat bench, so the lower half of the `ledge` shot is
  empty foreground; the `wall` bookmark heading points at a nearby slope.
- Phobos has not been checked in a screenshot (it is in the eastern sky at the
  scene time, behind the default view).
