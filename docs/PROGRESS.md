# Progress

Milestone 1: benchmark scene — Mars, Coprates Chasma (Valles Marineris), ~20 minutes
before sunset. Update this file in every commit that changes behaviour.

## Staged plan

| # | Stage | Status |
| --- | --- | --- |
| 0 | Docs, plan, assets (MOLA DEM, star catalogue) | in progress |
| 1 | Project skeleton, HDR post pipeline, HUD, cameras | todo |
| 2 | Quadtree terrain, height source, materials | todo |
| 3 | Atmosphere and fog | todo |
| 4 | Sun, sky bodies, stars, exposure behaviour | todo |
| 5 | Shadows (baked terrain + near shadow map) | todo |
| 6 | Rocks and ship | todo |
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

Stage 1.
