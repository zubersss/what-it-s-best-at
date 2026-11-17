# Progress

Milestone 1: benchmark scene — Mars, Coprates Chasma (Valles Marineris), ~20 minutes
before sunset — plus the Moon as a data-only world swap. Update this file in every
commit that changes behaviour.

## Staged plan

| # | Stage | Status |
| --- | --- | --- |
| 0 | Docs, plan, assets (MOLA DEM, star catalogue) | done |
| 1 | Project skeleton, HDR post pipeline, HUD, cameras | done |
| 2 | Quadtree terrain, height source, materials | done |
| 3 | Atmosphere and fog | done |
| 4 | Sun, sky bodies, stars, exposure behaviour | done |
| 5 | Shadows (baked terrain + near shadow map) | done |
| 6 | Rocks and ship | done |
| 7 | Performance pass + phone adaptation | done in code; **not measured on the real device** |
| 8 | Moon swap (`?world=moon`, data only) | done |
| 9 | Flying character with cloak, flight between worlds (owner request) | done; **feel untested on a real device** |

Reference screenshots of all five bookmarks on both worlds, plus four of the flying
character, are in `docs/shots/` (phone-shaped, 1100×515, rendered with software WebGL
from the production build).

`node scripts/flight-test.mjs <dir>` flies Mars → orbit → Moon → lunar surface with
scripted keys; it passed with no console errors and the hand-over to the Moon world
happened in flight.

## Decisions (and why)

- **Target hardware is a Samsung Galaxy S23 Ultra** (changed by the owner mid-project,
  with "change whatever you need to make it the best on the phone"). Consequences:
  - *Pixel-count cap instead of "device pixel ratio 1".* Ratio 1 on the phone is about
    880×412. The cap is 1.5 M pixels (≈1790×836 there; still ratio 1 on a 1080p desktop).
  - *Minimal touch controls* were added although the brief lists "UI beyond the debug
    HUD" under do-not-build: without them none of the required controls work on a phone.
  - Tile-based-GPU hygiene (whole-target clears, clear before full-screen passes, depth
    and unused colour invalidated), GL context loss reloads the page, wake lock and
    landscape lock behind the `FULL` button.
- **Site**: Coprates Chasma, on the lip of a bench on the north flank of the southern
  ridge (13.174°S, 296.568°E, +570 m). The trough runs ~W17°N; on the chosen date the Sun
  sets at azimuth 297°, almost straight down the canyon. The north wall (≈10 km of
  relief, ~55 km away) is the "far wall".
- **Date**: 2014-01-31 09:29 UTC — the evening Curiosity photographed Earth and the Moon
  from Mars — so Earth really is an evening star 34° from the Sun. Phobos is in the
  eastern sky (behind the default view) and sets about 35 minutes later.
- **Height data**: real MOLA. Global 4 px/deg (2 MB) + a 128 px/deg inset (463 m/px,
  2.3 MB) around the scene, fetched with HTTP range requests. Everything below ~1 km is
  procedural (fractal fill, ridged spurs, strata terraces, craters).
- **Stars**: real Yale Bright Star Catalogue (9 096 stars).
- **Depth**: no logarithmic depth. Far pass → clear depth → near pass with a dynamic
  near plane and front-to-back chunk order. A second depth slice for distant terrain was
  considered and not needed in the screenshots.
- **Pre-exposure** everywhere, and exposure-scaled LUTs, because RGBA16F cannot span the
  solar disc and faint stars.
- **Circumsolar split**: at sunset most sunlight on Mars arrives as a forward-scattered
  aureole, not the direct beam. Treating the aureole (within ~28°) as directional light
  that terrain shadows can block keeps canyon shadows meaningful without inventing light.
- **Dusk bookmark is 1.7 h after the start**, not ~1 h: Martian twilight is long, and
  stars/Earth only clear the glow once the Sun is ~17° down.
- **Chunk grid 40×40, normal map 120², shadow map 60², 120-chunk draw cap**: the draw-call
  budget, not the triangle budget, limits terrain detail, so chunks were made denser.
- **Moon**: fully procedural (no LOLA raster), site on the crest of a crater rim at
  7.98°N, 54.95°W on 2026-01-15 (lunar evening, gibbous Earth 36° up). Its `ship`
  bookmark is two days earlier so the rim's shadow does not cover the lander.
- **Exposure metering floor** (`scene.exposure.shadowFloor`) is a per-world number: 0.2
  on Mars, 0.6 on the Moon, where a black sky would otherwise overexpose the ground.
- **Flying character (owner request, outside the original brief).** Interactive sessions
  now start in `hero` mode behind the figure; bookmarks/screenshots stay first person
  unless `?hero=1`; `G` / `HERO` switches back to plain walking, `F` to the debug camera.
  - Speed is 0.85 × distance-to-nearest-surface per second (×3 boost): slow near the
    ground, far faster than light between planets, automatic slow arrival. Chosen over
    fixed warp gears because it needs no extra UI and cannot overshoot.
  - The camera is still the thing that moves; the figure is drawn ~4 m ahead of it.
  - `TARGET` snaps the view to the next body, because at correct exposure a sunlit
    figure and faint planets cannot both be visible (see next point).
  - **Highlight-priority metering**: lit surfaces write alpha 1, sky/stars/Sun write 0,
    and exposure may not push the brightest lit region more than `exposure.highlight`
    (6) times over white. Consequence, consistent with art rule 2: while the sunlit
    figure is in frame in space, stars and distant planets are not visible.
  - **The cloak trails in vacuum too.** Physically nothing would move it at constant
    speed in space; 30 % of the atmospheric flow is kept so it still streams in flight.
    This is the one deliberate departure from physics, at the owner's request.
  - World hand-over (Mars ↔ Moon) happens when the other world's surface is nearer than
    the current one's; in practice about half-way, where both are dots.
  - The sky now always contains every catalogue body (`world.sky.bodies` is unused).

## Simplified relative to the brief (and why)

- **Atmosphere "single scattering first, then multiple scattering"**: both were built
  together; there is no single-scattering-only mode.
- **Height fog** is a second exponential layer of the same dust medium inside the
  atmosphere integrator rather than a separate screen-space fog: one consistent medium.
- **Air is not shadowed by terrain** (no volumetric shadows): haze inside the shadowed
  canyon is lit as if the Sun reached it. Only the planet's own shadow darkens the air.
- **No sky-visibility / ambient-occlusion bake**: sky light is not reduced inside the
  canyon. Only a one-texel cavity term darkens creases.
- **Shadow maps are 60² per chunk** with mid- and far-field occluders evaluated on
  17×17 and 5×5 ray grids, so shadows cast from far away have soft, low-resolution edges.
- **Spur-and-gully relief below MOLA resolution is isotropic** ridged noise; it is not
  aligned downslope the way real gullies are.
- **Planetshine is unshadowed** and comes only from the single brightest sky body.
- **Moon rotation uses the mean IAU elements** (no libration terms); Earth's position in
  the lunar sky can be off by a few degrees. The Moon's orbit is a mean Kepler ellipse
  (0.7° error in the Earth–Moon direction at the test epoch).
- **No anti-aliasing** (TAA is excluded by the brief, MSAA was left off for cost).
- **Earth's disc from the Moon** is a procedural ocean/land/cloud pattern, not real
  geography.
- **Only Mars and the Moon have terrain.** Earth, Phobos and Deimos are spheres/lumps in
  the sky: you can fly right up to them (collision at 2 % above the radius) but not land.
- **No atmospheric limb glow from orbit**: the sky in-scatter LUT is only valid inside
  the air and fades out above it; haze over the surface is still drawn from space.
- **The character has rigid limbs** (two poses blended, no skeleton, no walk cycle) and
  the cloak collides with a single capsule, so it can clip the arms.

## Known issues

- **Nothing has been measured on the S23 Ultra.** Frame rate, render scale, thermal
  behaviour, touch feel and chunk-build speed on the phone are unknown.
- Triangles are at ~460–480k of the 500k budget and draw calls at ~135 of 200.
- Chunk build time in the headless container: Mars ~35–40 ms average, Moon ~90–120 ms
  (dense crater lattices, mostly in the shadow rays). First full load of a view needs
  ~340 chunks.
- LOD: detail pops in when chunks refine (normal maps change resolution; geometry
  morphs). Telephoto zoom reloads many distant chunks each time it is engaged.
- At ground level the strata benches read as smooth dunes up close; near-field rock
  character relies on the instanced rocks.
- Twilight glow has a fairly hard upper edge at the highest exposures (a real effect of
  a constant dust scale height with a hard top, exaggerated by the exposure clamp).
- Earth is blown out to white in the lunar `dusk` shot (it is ~14 stops brighter than
  the earthlit ground).
- Flight: the view's "up" is the direction away from the current world, so at the
  hand-over between worlds the horizon/roll jumps once. Simulation time keeps running
  across worlds, but pressing a bookmark jumps to that world's own scene date.
- From orbit Mars is the 4 px/deg MOLA map outside the Coprates inset: soft, and its
  colour is one dust tone plus darker low ground (no albedo map).
- Flying far from every body leaves you in black space with only the HUD's
  `nearest` / `target` read-out to navigate by; use `TARGET`.
- Not visually verified: Phobos and Deimos as lit meshes (code path is the same one
  that draws Earth from the Moon, which was verified), behaviour above ~10 km altitude,
  walking across cube-face edges, the touch controls on a real phone.
- `scripts/find-ledge.mjs` thresholds were tuned for Mars cliffs; the lunar rim was found
  with an ad-hoc script.

## What to check on the phone

Open the built site, tap `FULL`, then for each bookmark (`VIEW` button) on Mars and with
`?world=moon`, note from the HUD: **fps**, **frame ms (worst)**, **scale**, **draw
calls**, **triangles**, **chunks drawn / loaded**, **gpu mem**. Then:

0. Flight feel: is the stick-to-speed law controllable on the phone (leaving the ground,
   reaching orbit, `TARGET` → Moon, arriving)? Does the cloak look alive or jittery at
   the phone's frame rate? Any hitch at the Mars ↔ Moon hand-over?
1. Stand still for 20 s: does the render scale settle or hunt up and down?
2. Walk forward and turn quickly: look for terrain popping, shimmer on distant ridges,
   holes or dark seams between chunks, and how long detail takes to arrive.
3. Near the lander: do rock and lander shadows crawl or swim as you walk?
4. Hold `ZOOM` on the Sun and on the far wall: chunk reload time, banding around the Sun.
5. Drag the time slider through sunset: do terrain shadows update within a second or
   two, do stars and Earth appear only as it darkens, any coloured blotches at night?
6. Leave the tab for a minute and come back (context loss should reload cleanly).
7. Try `?fps=60` and `?dpr=3` to see what the GPU can really hold.

## Next

1. Measure on the S23 Ultra and tune `MAX_PIXELS`, `TARGET_FPS`, `MAX_RENDER_CHUNKS`,
   `SPLIT_FACTOR` and the flight constants in `cameraRig.js` from real use.
1b. Character: skeleton and walk cycle, arm collision for the cloak, a ground mode where
   the figure stands on the terrain; limb glow of the atmosphere from orbit.
2. Cheaper lunar chunk builds (shadow rays through crater lattices).
3. Sky-visibility bake and terrain-shadowed haze for the canyon.
4. Downslope-aligned gullies; rockier near field.
5. A real LOLA raster for the Moon.
