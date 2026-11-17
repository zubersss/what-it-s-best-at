# Progress

What exists, what was decided and why, what is wrong, and a short log. The plan of record
is `docs/ROADMAP.md`; the rules are in `CLAUDE.md`. Update this file in every commit that
changes behaviour.

## What exists today

- **Mars**: Coprates Chasma (Valles Marineris) on real NASA MOLA elevation, at
  2014-01-31 09:29 UTC, about 20 minutes before local sunset. Five bookmarks: ledge, sun,
  wall, ship, dusk.
- **The Moon**: a procedural cratered world from a data file alone, at 2026-01-15, lunar
  evening with a gibbous Earth. The same five bookmarks.
- **The character**: a suited figure with a cloth-simulated cloak. Flight speed grows
  with distance from the nearest surface, so one stick covers hovering, orbit and the
  crossing between worlds; the engine hands over from one world to the other in flight.
- **Engine**: cube-sphere terrain with worker-built chunks and baked Sun shadows, a
  lookup-table atmosphere, the true sky (9 096 catalogue stars, Sun, planets and moons
  from an ephemeris checked against JPL Horizons), a lander, rocks, HDR with
  auto-exposure, AgX, bloom, dither.
- **Tools**: reference screenshots, a stability test, a scripted Mars→Moon flight test.

## Milestone 1 plan — phone link and measurement

1. Save the charter (`CLAUDE.md`) and roadmap; remove the rules it replaces.
2. GitHub Pages through GitHub Actions, deployed from `main`; Claude merges its own pull
   requests so the link follows every push. Build stamped with the commit hash.
3. Start screen (Play, Benchmark, Soak, Smooth/Sharp) showing the commit hash; hash in
   the HUD.
4. The governor: native-resolution ceiling, about 1 M pixel floor, resolution first, then
   features in a fixed order, hysteresis; frame pacing for a steady 60 or 30.
5. Benchmark: scripted 3-minute route (Mars bookmarks → flight to the Moon → lunar
   bookmarks), 10-minute soak, results screen with Copy.
6. Reference screenshots, stability test, independent critic, docs, checkpoint.

## Decisions in force (and why)

### Rendering and physics

- **Depth**: far pass → clear depth → near pass with a near plane that grows with
  altitude and front-to-back chunk order; the character gets its own depth slice when
  the terrain's near plane has moved past it.
- **Pre-exposure** everywhere, and exposure-scaled lookup tables, because half-float
  targets cannot span the solar disc and faint stars.
- **Circumsolar split**: at sunset most sunlight on Mars arrives as a forward-scattered
  aureole, not the direct beam. Treating the aureole (within ~28°) as directional light
  that terrain shadows can block keeps canyon shadows meaningful without inventing light.
- **Highlight-priority metering**: lit surfaces write alpha 1, sky/stars/Sun write 0, and
  exposure may not push the brightest lit region more than `exposure.highlight` (6) times
  over white. Consequence, consistent with art rule 2: while the sunlit character is in
  frame in space, stars and distant planets are not visible.
- **Exposure metering floor** (`scene.exposure.shadowFloor`) is a per-world number: 0.2
  on Mars, 0.6 on the Moon, where a black sky would otherwise over-expose the ground.
- **Chunk grid 40×40, normal map 120², shadow map 60², 120-chunk draw cap**: the draw-call
  budget, not the triangle budget, limits terrain detail, so chunks were made denser.
- **Mobile GPU care**: clears before full-screen passes, depth and unused colour
  invalidated, GL context loss reloads the page.

### Worlds

- **Mars site**: the lip of a bench on the north flank of Coprates' southern ridge
  (13.174°S, 296.568°E, +570 m). The trough runs ~W17°N; on the chosen date the Sun sets
  at azimuth 297°, almost straight down the canyon. The north wall (≈10 km of relief,
  ~55 km away) is the "far wall".
- **Mars date**: 2014-01-31 — the evening Curiosity photographed Earth and the Moon from
  Mars — so Earth really is an evening star 34° from the Sun. Phobos is in the eastern
  sky and sets about 35 minutes later.
- **Mars height data**: MOLA global 4 px/deg (2 MB) plus a 128 px/deg inset (463 m/px,
  2.3 MB) around the scene. Everything below ~1 km is procedural.
- **Dusk bookmark is 1.7 h after the start**: Martian twilight is long, and stars/Earth
  only clear the glow once the Sun is ~17° down.
- **Moon**: fully procedural for now, site just inside the east rim of a ~3 km crater at
  7.98°N, 54.95°W. The `ship` and `dusk` bookmarks stand 25 m east on the rim crest;
  `ship` is two days earlier so the rim's shadow does not cover the lander. Regolith
  roughness was halved: at a 7° Sun a flat crest dissolved into micro-shadow speckle.
- **The sky always contains every catalogue body**; the one underfoot is skipped.

### Character and flight

- Interactive sessions start behind the character; bookmarks in screenshot mode stay
  first person unless `?hero=1`.
- Speed is 0.85 × distance-to-nearest-surface per second (×3 boost): slow near the
  ground, far faster than light between planets, automatic slow arrival.
- The camera is the thing that moves; the figure is drawn ~4 m ahead of it.
- `TARGET` snaps the view to the next body.
- **The cloak trails in vacuum too** (30 % of the atmospheric flow is kept). This is the
  one deliberate departure from physics, at the owner's request.
- World hand-over (Mars ↔ Moon) happens when the other world's surface is nearer than
  the current one's; in practice about half-way, where both are dots. Simulation time
  runs on across worlds; pressing a bookmark jumps to that world's own scene date.

## Known limits of what is built

- Air is not shadowed by terrain; haze inside the shadowed canyon is lit as if sunlit.
- No sky-visibility bake: sky light is not reduced inside the canyon.
- Shadow maps are 60² per chunk; shadows cast from far away have soft edges.
- Gullies below MOLA resolution are not aligned downslope.
- Planetshine is unshadowed and comes only from the single brightest sky body.
- The Moon's rotation uses mean elements (no libration); Earth can be a few degrees off.
- No anti-aliasing.
- Earth's disc is a procedural ocean/land/cloud pattern, not real geography.
- Only Mars and the Moon have terrain; other bodies stop you 2 % above their radius.
- The sky's in-scatter fades out above the atmosphere: no glow on the planet's edge.
- The character has rigid limbs; the cloak collides with a single capsule.

## Known problems (and where the roadmap deals with them)

| Problem | Milestone |
| --- | --- |
| Nothing measured on the phone yet | 1 (benchmark) |
| Detail pops as terrain refines; telephoto reloads distant chunks | 2 |
| No atmospheric glow on the planet's edge from orbit | 2 |
| Horizon rolls once at the Mars ↔ Moon hand-over | 2 |
| Lunar chunks build ~3× slower than Mars (~90–120 ms vs ~35–40 ms, headless) | 2 |
| Haze in the shadowed canyon looks sunlit | 2 |
| Ledges read as smooth dunes up close | 2 |
| Far wall is over-hazed and soft | 2 |
| Rigid limbs; cloak clips the arms | 2 |
| Phobos and Deimos never checked in a screenshot | 2 |
| From orbit Mars is soft and one colour outside the Coprates inset | 3 |
| Twilight glow has a hard upper edge at the highest exposures | 3 |
| Earth is blown out to white in the lunar dusk shot | 5 |
| Far from every body there is only the HUD read-out to navigate by | 4 / 7 |
| Triangles sit at ~460–480k of the 500k budget | watch |

## Log

- **Foundation (before the charter)**: stages 0–9 of the original brief — skeleton and
  HDR pipeline, terrain, atmosphere, sky, shadows, rocks and lander, phone adaptation,
  the Moon swap, the flying character and flight between worlds.
- **Charter adopted**: `CLAUDE.md` rewritten from the owner's charter, `docs/ROADMAP.md`
  added, the replaced rules deleted (old hardware target, pixel caps, "no UI", Mars-only
  scope, the do-not-build list).
