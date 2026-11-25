# Why the shadows jump and why the governor hunts (the tenth phone results, 2026-11-25)

Two readers of the workflow `clouds-shadows-understand-design` (no browser; replays of the code's own arithmetic in Node, scripts in the session scratchpad `cloudwf/`), on the head 0b5a68c. The owner: the shadows "get jumpy when I'm moving around near them". The benchmark: `docs/benchmarks/2026-11-25-haven-e9d4888.txt`.

## The shadows

Seven causes, all found by replaying the code's own arithmetic in Node (scripts in /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/). The first two explain "jumpy when I'm moving" on their own, and each costs nothing to fix.

How the shadows work now: one atlas holds three tiles, all aimed along the Sun. The wide tile covers 150 m at 14.6 cm a texel; the fine tile covers 20 m at 3.9 cm; the character's own tile covers 3.5 m at 7 mm. A tile's centre snaps to whole texels on a grid tied to an anchor point, which moves only after 300 m of travel. In Sharp the wide and fine tiles are drawn on alternate frames, so each is redrawn 15 times a second; a tile not drawn this frame is held in place on the ground. The character's tile is drawn every frame. For static casters this is exact: a held tile matches a fresh one. What moves the shadows is what the casters themselves do whenever a tile is redrawn or a list is rebuilt.

1. The trees' shadow pass thins leaves with a hash of the shadow map's pixel position (`gl_FragCoord`). Each time a tile re-centres, the same patch of ground gets a different hash, so the dappled pattern is re-rolled. Walking at 4.5 m/s, every redraw re-centres both tiles, and the Sun reaching a fixed spot under a tree changes by 0.2 on average, 15 times a second; half the spots change by more than 0.2. Standing still, nothing changes. Ground, grass, crowns and the character all read this shadow.

2. Each tree's gust phase is measured from the tree list's anchor, which jumps to the eye every 25 m and whenever a new block of trees arrives. At each jump every tree leans to a new position at once, and its shadow moves with it: 13 cm on average (up to 27) in a 6 m/s wind, 22 cm (up to 44) at 10 m/s. That is 6 to 11 frames of normal sway in one frame.

3. A tree's shadow is cast by its near mesh while it is closer than 20 m and by two crossed cards beyond. Crossing 20 m changes 25 to 70 % of that tree's shadow in one frame. Walking in the north wood this happens to 7 trees a second, up to 11 at once.

4. When the governor turns on its "shadows of the farther trees" saving, which it does early in a wood, every tree past 60 m loses its shadow. Walking, 20 tree shadows a second appear or vanish at that line in the north wood. The phone's newest cost table says this saving buys nothing (-0.5, -6.8, -2.6 ms), yet it sits in the first group the governor gives up. The "coarser shadows of nearby rocks" saving switched every shadow within about 17 m between sharp and blurred three times in 11 seconds of the benchmark.

5. With a low Sun, rocks are left out of the fine tile. Which rocks it draws is decided by straight distance (30 m for small stones, 45 m for far rocks), but at the opening view's 19.5 degree Sun the fine tile reaches 51 m along the Sun's direction. 13 of the 31 stones it covers cast no shadow there, and about 2 a second fade out and pop back while walking.

Smaller causes:
- Every ~7 s (the Sun moving 0.03 degrees) all shadows shift by up to one wide texel and, as the pass stands, re-roll even while standing still.
- Swaying boughs' shadows update 15 times a second while the trees move 30 times.
- The land's own baked shadow has seams where new patches are baked for a Sun up to 1 degree newer than their neighbours.

Fixes 1, 2, 4 and 5 cost nothing measurable on the phone. Fix 3 adds about 90k triangles per tile draw in the north wood (6k at the opening). The way to pay for it is to give the fine tile only the trees that can reach it; today it draws every tree out to 240 m to fill a 40 m square.

### shadows-1 (high). The trees' shadow pass thins leaves with a hash of the shadow map's pixel position.

The trees' shadow pass thins leaves with a hash of the shadow map's pixel position. Shadow tiles re-centre by whole texels as the traveller moves, so the same patch of ground lands on a different pixel and the dappled pattern is re-rolled at every redraw. In Sharp that is 15 times a second while moving, and never while standing.

**Where.** src/life/trees.js:354 (`uvec2 q = uvec2(gl_FragCoord.xy)` in the depth fragment shader, applied to every leaf part, the far cards included); src/shadows/nearShadow.js:159 (tile centre snapped to the lattice) and :154 (the turns)

**Evidence.** Replay in dither.mjs: the shader's exact hash, hardware PCF and the 4-tap filter of nearShadowTile, fixed ground spots 1 cm apart, the camera walking across the Sun.
- Standing: no spot changes.
- Walking 1 m/s: the fine tile re-centres at every redraw. Sun share at a spot changes by 0.20 on average; 69 % of spots change by more than 0.1 and 43 % by more than 0.2 (full leaf cover). With 60 % cover: 0.14 on average, 51 % and 29 %.
- Walking 4.5 m/s (full stick, 30 cm per redraw): fine tile 0.23 (72 % over 0.1); wide tile 0.24 (75 % over 0.1).
- Hashing the world texel instead gives 0.000 in every case.
The Node test at the scratchpad path, run on the real nearShadow.js with a stub renderer: one fixed spot is hashed as 21 different texels in the wide tile and 20 in the fine tile over a 6 m walk. It exits 1 today.

**Fix.** Hash the world texel, not the screen pixel. When a tile is drawn, hand the trees' depth shader one uniform: ivec2 uShadowHashShift = (round(st.ax/texel) - n/2 - t.x, round(st.ay/texel) - n/2 - t.y), set per tile in nearShadow's draw loop before that tile's casters. Then hash q = uvec2(ivec2(gl_FragCoord.xy) + uShadowHashShift). A spot keeps its hash for as long as the anchor and light axes are kept.
Better still, attach the thinning to the leaf (a hash of coarse cells of vUv and the tree's own number, or a higher cut threshold on the atlas's own coverage). Then neither re-centring, the anchor, the light axes nor sway re-rolls it.
The look while standing is unchanged.

**Cost.** Nothing measurable: one ivec2 uniform per tile draw and an integer add per shadow fragment. 'The shadow maps' row (1.5 ms opening, 8.2 forest) is unchanged.

### shadows-2 (high). The gust that leans each tree is phased by the tree's foot measured from the tree list's anchor.

The gust that leans each tree is phased by the tree's foot measured from the tree list's anchor. Every full rebuild (each 25 m, and whenever a block arrives or the list is marked dirty) moves the anchor to the eye, so every tree's phase jumps and every tree lurches at once. The shadow pass runs the same vertex code, so every shadow lurches with it.

**Where.** src/life/trees.js:112 (`dot(iA.xyz, uTreeWind.xyz) * 0.05`, with iA anchor-relative) and :511 (`_build`: `this.anchor.copy(p)`); REBUILD_M = 25 in src/life/treeLod.js

**Evidence.** Replay in gustjump.mjs: the shader's bend formula before and after a 25 m anchor move.
- 3 m/s wind: crown tops jump 6.5 cm on average (up to 13).
- 6 m/s: 12.8 cm (up to 27); 66 % of trees move over 10 cm.
- 10 m/s: 21.7 cm (up to 44).
- 15 m/s: 32 cm (up to 67).
An ordinary frame moves them 0.6 to 3 cm, so a rebuild is 11 frames of motion at once walking with the wind, 6 at 60 degrees to it. At full walk this is every 5.6 s or sooner (each arriving block also rebuilds); at super speed (60 m/s) several times a second. It moves the trees in the picture too, not only their shadows.

**Fix.** Make the phase independent of the anchor. Keep a reference point O near the traveller, re-chosen only every few km (as nearShadow re-chooses its anchor). Hand the shader uGustPhase = mod(dot(anchor - O, wind) * 0.05, 2π), worked out on the CPU in double precision, and use `dot(iA.xyz, uTreeWind.xyz) * 0.05 + uGustPhase`. A tree's phase is then its world position's, through every rebuild; the gusts still travel across the wood as now.

**Cost.** Nothing measurable: one float uniform.

### shadows-3 (medium). Which mesh casts a tree's shadow depends on the tree's distance from the eye.

Which mesh casts a tree's shadow depends on the tree's distance from the eye. Under CLOSE_M = 20 m it casts its near mesh (skeleton and sprays); beyond, its far mesh (two crossed cards and a rosette). The near-to-far list is chosen again every fineStep (about 5 m), so each tree crossing 20 m swaps its shadow shape in one frame, under the walker's nose, in the 3.9 cm fine tile.

**Where.** src/life/trees.js:379 (`const src = trio[Math.min(2, lod + 1)]`: close trees cast the near mesh, near trees the far mesh); src/life/treeLod.js:19 (CLOSE_M = 20, NEAR_M = 60)

**Evidence.** Shadow outlines on level ground (castswap.mjs, the game's own meshes and atlas, the depth pass's cut at coverage 0.3, 3.9 cm cells). Share of the two shadows' combined area that changes when a tree crosses 20 m:
- conifer: 25 to 31 %
- pine: 30 to 43 %
- broadleaf: 36 % at a 25 degree Sun, 47 to 49 % at 45 degrees (its shadow shrinks from 256 to 162 m2)
- umbrella: 59 to 70 %
- blossom: 27 to 41 %
How often, walking at 4.5 m/s through the trees the game plants (treewalk.mjs, treeLod's own rules): at the opening 0.9 trees a second, up to 4 at once; in the north wood 7 a second, up to 11 at once.

**Fix.** Tie the shadow's change to the picture's own change at 60 m: near-list trees (20 to 60 m) cast their own near mesh (s.cast = s.mesh with the depth material) instead of the far mesh. A tree's shadow then changes once, at 60 m, where it falls in the 14.6 cm wide tile and the picture changes there anyway.
Pay for it by giving the trees a light-space fine count like the rocks (the near lists are already nearest-first), so the fine tile stops drawing every tree out to 240 m to fill its 40 m square.
Cheaper alternative with no swap at all: every tree casts its far mesh. This saves about 11k triangles in the wood, but the nearest trees' shadows become card outlines.

**Cost.** The north wood has 203 trees between 20 and 60 m (14 at the opening): about +90k triangles per tile draw there (+6k at the opening), roughly +90k a frame in Sharp since each scene tile is drawn every other frame. The phone's busiest frame had 2 124k. My guess is under 1 ms on the forest's 8.2 ms 'shadow maps' row, and less with the fine-tile count; it needs a benchmark. Opening view: about 0. The far-mesh alternative is slightly cheaper than today.

### shadows-4 (medium). The governor's shadow savings change many shadows at once, and it switches them back and forth.
- 'tree-shadows' ('shadows of the farther trees') stops every far-list tree past the near radius (60 m) from casting.

The governor's shadow savings change many shadows at once, and it switches them back and forth.
- 'tree-shadows' ('shadows of the farther trees') stops every far-list tree past the near radius (60 m) from casting. While it is on, every tree crossing 60 m pops its shadow on or off as the lists are re-chosen; switching it moves all tree shadows from 60 to 150 m at once.
- 'fine-shadows' (labelled 'coarser shadows of nearby rocks', but it drops the fine tile for trees and everything else) switches every shadow within about 17 m between 3.9 and 14.6 cm texels.
- 'soft-shadows' switches between 4 filter taps and 1.

**Where.** src/app.js:303 (caster predicate `set.lod <= 1 || this.trees.shadowsFar`); src/perf/governor.js:67 ('tree-shadows' in group 1 with buys 2.7), :80 ('fine-shadows'), :106 ('soft-shadows')

**Evidence.** Benchmark docs/benchmarks/2026-11-25-haven-e9d4888.txt:
- 'coarser shadows of nearby rocks' off at 8.3 s, on at 18.3 s, off at 18.9 s; 'shadows of the farther trees' off at 20.6 s; 74 quality steps in 180 s.
- The phone's cost table for 'tree-shadows': -0.5 (ledge), -6.8 (forest), -2.6 (air), i.e. nothing. For 'soft-shadows': 0.6, -9.6, -5.4. For 'fine-shadows': -0.4 and 1.3.
Walk replay (treewalk.mjs) with 'tree-shadows' on: 20 tree shadows a second come or go at the 60 m line in the north wood (up to 541 over 120 m), 1.9 a second at the opening. If 'trees-far' is also on, the line moves to 40 m: 14 a second.

**Fix.** Move 'tree-shadows' out of group 1: by the phone's table it buys nothing, and in a wood it is one of the first savings taken. Put it last, or drop it.
If a cut beyond the near radius stays, fade it over a band with the world-anchored hash, not a switch.
Give the shadow savings (fine-shadows, soft-shadows, tree-shadows, trees-far, tree-leaves) hysteresis: once taken, keep them until the traveller is still or has gone some distance, so the governor's hunting (task 34) never flips them back and forth in view.

**Cost.** By the phone's own table, nothing measurable for 'tree-shadows' and 'soft-shadows'; 'fine-shadows' about 1 ms in the forest view only.

### shadows-5 (medium). Rocks are left out of the fine tile.

Rocks are left out of the fine tile. Each rock source picks the instances the fine tile draws by straight distance from the eye (near stones within 30 m at their last 7 m re-scatter; far rocks within 45 m at the last 20 m re-choice). But the fine tile is 20 m half-width measured across the Sun's rays, which on level ground stretches to 17.2/sin(elevation) m along the Sun's direction. A rock it covers but was not given casts no shadow there (inside 0.86 of the tile the wide tile, which has it, is not read). The shadow fades as the tile's edge passes and pops back at the next re-choice.

**Where.** src/rocks/rocks.js:79 (nearRadius = 30) and :243 (nearN); src/rocks/farRocks.js:36 (FINE_REACH = 45) and :321; read in src/shadows/nearShadow.js nearShadow() (`if (mi < 0.86) s = nearShadowTile(1, ...)`)

**Evidence.** The opening's Sun is 19.5 degrees up (tree-shadows-at.mjs), so the fine tile reaches 51 m along the Sun's direction. Walk replay (rockfine.mjs, Haven's numbers: 300 stones within 110 m on 7 m cells; far rocks one per 15 m):
- Sun 20 degrees: 13.2 of the 31.5 stones the fine tile covers have no shadow; walking toward the Sun 2.2 stone shadows a second pop in one frame, and more fade as the edge passes. Far rocks: 3.1 of 20 missing, 1.1 pops a second.
- Sun 35 degrees: 2.1 stones missing, 1.9 pops a second.
- Sun 55 degrees: none missing.

**Fix.** Choose by light-space reach, not straight distance.
- Far rocks: in _fillCaster, order the casters by their light-space distance from the eye (the near shadow's light axes are known) and set casterFine to those within 0.98 x 20 m plus CASTER_STEP.
- Near stones (at most 300 small instances): drop fineCount and draw them all into the fine tile, or widen nearRadius to (20 + 10)/sin(elevation), capped at 110 m.

**Cost.** At a low Sun, some tens of extra small rocks in the fine tile's draw: under 0.1 ms. At a high Sun, nothing.

### shadows-6 (low). The light axes are renewed whenever the Sun has moved 0.03 degrees, and all three tiles are then redrawn on a grid turned about the anchor, which can be up to 300 m from the eye.

The light axes are renewed whenever the Sun has moved 0.03 degrees, and all three tiles are then redrawn on a grid turned about the anchor, which can be up to 300 m from the eye. Every shadow edge then shifts by up to one wide texel at once and, as the dither stands, re-rolls even while standing still. The anchor's own reset every 300 m does the same.

**Where.** src/shadows/nearShadow.js:125 (`nz.dot(this._lz) < 0.99999986`) and :119 (anchor reset at 2 x radius)

**Evidence.** acos(0.99999986) = 5.3e-4 rad. Haven's 24 h day at the real-time clock moves the Sun that far every ~7.3 s; faster when the clock is sped up. The grid's shift at the eye is |eye - anchor| x 5.3e-4: up to 0.16 m, one wide texel (14.6 cm) or four fine ones (3.9 cm).

**Fix.** Re-anchor at the eye whenever the axes are renewed (A.copy(camPos) when the Sun's test fires). The shift is then at most 20 m x 5.3e-4 = 1 cm inside the fine tile. Attaching the dither to the leaf (fix 1's better form) removes the re-roll entirely.

**Cost.** Nothing measurable.

### shadows-7 (low). In Sharp each scene tile is drawn only every other frame and held in between.

In Sharp each scene tile is drawn only every other frame and held in between. That is exact for still things, but swaying boughs and fluttering leaf cards cast shadows that step 15 times a second, up to two frames behind the trees they belong to, which move 30 times a second.

**Where.** src/shadows/nearShadow.js:154 (alternate turns) with src/life/trees.js:112-127 (bend and flutter, also in the shadow pass)

**Evidence.** From the shader's bend: an ordinary 33 ms frame moves a crown top 1.2 cm on average at 6 m/s wind and 2 cm at 10 m/s, so the held-tile steps are 2.4 to 4 cm, under one fine texel (3.9 cm), on average. At peak, a crown top at 8 m/s wind moves 1.3 m/s (8.6 cm per 66 ms), and flutter adds up to about 9 cm. It happens standing still too, so it is not specific to moving.

**Fix.** Leave it until fixes 1 to 5 are in and a picture in motion says it still shows. If it does, draw the fine tile every frame (the wide one every other), paid for by the light-space fine count of fix 3.

**Cost.** Drawing the fine tile every frame adds its share of the 8.2 ms forest row; my estimate is 1.5 to 3 ms in a wood until the fine count is in, about nothing at the opening view.

### shadows-8 (low). The land's own shadow, baked per terrain patch.

The land's own shadow, baked per terrain patch. A patch built while walking is baked for the current Sun, while its neighbours and its parent keep a Sun up to 1 degree older (re-bakes wait for 1 degree). Seams appear between patches, and a cross-fade runs between two different shadow edges while a new patch blends in from its parent.

**Where.** src/terrain/terrain.js:394-396 (new patches baked with `this._sun`) and _rebakeShadows (only once SHADOW_REBAKE_DEG = 1 is exceeded)

**Evidence.** A cliff's shadow edge moves h/sin²(elevation) x 0.01745 per degree of Sun. At the opening's 19.5 degrees that is 7.9 m for a 50 m rise and 15.7 m for 100 m. At the real-time clock the Sun takes about 4 minutes per degree, so a patch made in between can disagree with its neighbour by up to that much. The parent-to-child blend is smooth, so this shows as a slide and a seam rather than a jump.

**Fix.** Keep one baking Sun for all patches. It advances only when a re-bake sweep starts, and new patches are baked for it, not for the Sun of the moment; neighbours then always agree except while a sweep is going round, nearest first.

**Cost.** Nothing measurable.

### The test

Main check, ready to run (Node, no browser): /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/shadow-hash-steady-test.mjs

What it does: it builds the real NearShadow from src/shadows/nearShadow.js with a stub renderer that records each tile draw (atlas viewport and orthographic camera). It uses the game's Sharp settings (every = 2, alternate = true), an instanced caster, Haven's radius and the opening's 19.5 degree Sun. It walks the eye 0.15 m a frame for 40 frames. For one fixed spot on the ground 6 m ahead it projects into each wide and fine tile draw and takes the pixel the trees' depth shader would hash, plus G.uShadowHashShift if the fix adds that uniform. It fails if the spot gets more than one hash input in either tile.

Today: wide tile 21 different texels, fine tile 20, over a 6 m walk; exit 1. After fix 1 (the shift uniform set per tile in nearShadow's draw loop and added in trees.js's hash): one texel each; exit 0. As a repo script it would sit beside scripts/far-trees-test.mjs and be added to check-scripts (it imports three from node_modules).

Companion check for cause 2, the same kind: export the gust phase rule from life/trees.js as a JS mirror (as treeLod.js does for the lists). Assert that a fixed world tree's phase, `dot(foot - anchor, wind) * 0.05 + uGustPhase`, is unchanged (mod 2π) across a _build that moves the anchor 25 m along the wind. Today the phase jumps by 1.25 rad: the 13 to 22 cm lurch of gustjump.mjs at 6 to 10 m/s.

Stability move that would show it in pictures: run scripts/shadow-turns-test.mjs (`npm run shadowturns`) at Haven's north wood (`world=haven&lat=22.983&lon=129.507&heading=6`) instead of at the Moon's lander, with weather quiet. The Moon has no trees, so today's run cannot see the re-roll. In the wood, the held tile's picture against a fresh redraw 4 m away differs under every crown today and should be about 0 % after fix 1. `npm run stability -- --streaming` on a walk through the north wood would show the same boiling under trees in its flicker report.

## The governor

I replayed the tenth benchmark in Node against the real src/perf/governor.js. The route matches the phone's: five Haven stops of 12 s each, with a 2.5 s IGNORE after each jump; a flight that stays on Haven until the hand-over at 99.5 s; then the Moon's five stops. The screen is 60 Hz and the mode Sharp, so a frame over 33.3 ms takes three refreshes. Each stop's GPU time is A + S x MP minus what the savings that are on buy, plus noise, plus with chance q a frame late whatever is drawn. S comes from the tenth cost test's "everything on at 1 MP / at native": 2.06 ms/MP at the ledge, 1.45 in the forest, 0.75 from the air. What the savings buy comes from the ledge row, keeping only readings that repeat in a second view. A and q are fitted so the replay gives the phone's fps at each stop. About 35 % of frames take in ground and are SOFT.

Frame lengths in whole refreshes cannot tell late frames of the view's own apart from GPU time sitting near the 33 ms line, so I fitted three readings: "own", "pixels" and "mixed". The mixed reading reproduces the phone:
- today's governor gives 28.5 fps;
- Haven sits at 1.60 to 1.65 MP at every stop;
- the resolution climbs only in the flight;
- 62 to 111 steps (phone 74);
- "5 back on, 5 off" a second later;
- bg 4 to 8 % (phone 7.0);
- 0 to 2 put-backs (phone 2).

**Why it stays at the floor.** The ladder is lopsided: pixels go first all the way down, and come back only after every saving is back. At Haven's heavy stops savings never all come back, so the picture never climbs there. Starting today's governor at 2.67 MP still ends at the floor (1.64 MP, 96 % of the stop time). The start makes it certain. Sharp at a place never seen starts at native, but the phone began at 1.82 MP (its first logged step was "down to 1.60" at 6.2 s). That came from the level remembered from earlier play, or from state the benchmark inherits: it never resets the governor. Same phone and route, today's governor: Haven 3.47 MP from native, 1.61 MP from 1.82.

**Why it hunts.** The ladder's first steps buy nothing on this phone any more: the cloud steps (nothing at all once the volume is off), the robe (page work), the near-rock shadow tile and the glow. So a trial at the ledge or the ship switches off 7.6 savings, and 52 % of them buy nothing at that stop. They come back at the light stops (sun, wall, dusk) and go off again at the next heavy one. Trials and returns are also judged across bookmark jumps.

**Fixes.** All four new cases fail on today's governor (7 checks) and pass with fixes A2+B. The project's own governor-sim.mjs still passes with them.

| Haven's five stops (mixed reading, 8 runs) | Today | A2+B | A2+B+D |
|---|---|---|---|
| Picture | 1.61 MP | 2.54 MP | 2.52 MP |
| Frames late (over 1.2 x 33 ms) | 14.7 % | 12.3 % | 10.5 % |
| Time at the floor | 95 % | 1 % | 0 % |
| Savings switched a run | 44.5 | 25.9 | 23.5 |

The near-rock shadow sharpness was switched 25 times and the robe 32 times in 6 replays of Haven's minute; with the fixes, neither is switched. Both matter for the owner's eye, and the first may feed his "shadows get jumpy".

**Not causes, and caveats.**
- The step-up probe (5 late of 24) is what took the phone's five savings back at 18.9 s, 0.6 s after they returned (inside the window's 1.2 s cooldown). But making it relative to the late share before changed nothing in any reading, so I do not rank it.
- Learning bg only at the true floor made the "own" reading worse. Still, the read-out "late frames taken as the device's own: 7.0 %" is wrong: Haven wall, Haven dusk and Moon dusk ran at 30.0 fps. bg is the heavy views' late share, learned while the resolution sits at its floor.
- The cost table's "everything on" drifted from 43 to 69 ms within one view, so readings under about 4 ms are noise. That is why I did not reorder the whole ladder by the tenth's numbers (fix A). A also breaks an existing case: far-rock-shadows and clouds stay off 34 to 40 s, against a limit of 30.
- From a start at native, A2+B keeps more pixels in the mixed reading (Haven 3.74 MP, 18.8 % late, against 3.47 MP and 14.9 % today). That is a sharpness-for-steadiness trade to decide on the phone.
- Also measurement: in Sharp at 60 Hz the benchmark's "late (over 1.5x)" is exactly three refreshes, so it hides most 50 ms frames. It printed 0.86 % where 8.4 % of frames took three refreshes or more.

Scratch files, all under /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/:
- route.mjs: the replay;
- compare.mjs, trials.mjs, attrib.mjs: the comparisons and attributions;
- gov-fix.js: the governor with each fix behind a flag, identical to today with no flags;
- cases10.mjs: the new cases;
- govsim-fix.mjs: the project's suite run against gov-fix.js.

### governor-1 (high). The ladder is lopsided.

The ladder is lopsided. Going down, pixels go first all the way to the floor: each step is counted as a whole 2.5 ms stride, yet on this phone at Haven the last step (1.82 to 1.60 MP) buys about 0.45 ms. Coming back, every saving must be back before the first pixel returns. At Haven's heavy stops the savings never all come back, so the picture never leaves the floor.

**Where.** src/perf/governor.js:599-600 (_down: resolution first unless _featFirst; bought += STRIDE_MS); src/perf/governor.js:651-667 (_up: savings first, resolution only when none are on or all are _alone with _resTurn)

**Evidence.** Phone: Haven 1.60-1.65 MP at every stop; all 9 resolution steps up came in the flight and on the Moon; savings off 30, back on 24. Tenth cost test: pixels cost 2.06 ms/MP at the ledge (47.2 ms at 1 MP, 54.3 at native), 1.45 in the forest and 0.75 from the air, while far-relief (3.9), far-rock-shadows (3.0) and clouds' shadows (2.7) each buy more than the whole range from 1.60 to 2.67 MP (about 2.2 ms). Replay of today's governor, mixed reading: Haven at the floor 95 % of its stop time; 50 returns of savings against 3 resolution steps up at Haven's stops in 6 runs. Started at 2.67 MP it still ends at 1.64 MP (96 % at the floor). With fix B: 2.62 MP with fewer late frames (12.4 % against 14.7 %). The 'own' reading gives 2.93 against 2.23 MP.

**Fix.** (B) In Sharp, pixels go first only down to KEEP = level 4 (2.67 MP, 60 % of native) while a live saving known to buy a stride is left: in _down, featNow = (this._featFirst || (this.mode === 'sharp' && this.resLevel >= KEEP)) && this._bigLeft(). The way back mirrors it: below 2.67 MP the resolution comes back before the savings (in _up, res = (needed && this._resTurn) || (this.mode === 'sharp' && this.resLevel > KEEP)). Under 2.67 MP, pixels and savings then trade in turn as today.

**Cost.** No added frame cost: it changes what is given up, not what is drawn. At a heavy view it keeps 1.07 MP more (about 2.2 ms at 2.06 ms/MP) and gives up the savings that buy 3 to 4 ms each instead. Replay: Haven's late frames 14.7 to 12.4 %.

### governor-2 (high). The start is at the floor.

The start is at the floor. The level remembered for Haven in Sharp (learned after 20 s with no step down, even while savings hold it there) is where every visit starts. The benchmark never resets the governor, so it inherits what play behind the start screen left.

**Where.** src/perf/governor.js:246 (arrive takes known['sharp:haven:2']); src/perf/governor.js:282 (setMode reads it too); src/perf/governor.js:415-416 (learned with savings on); src/app.js:682-691 (startBenchmark does not reset the governor)

**Evidence.** Sharp at a place never seen starts at native (governor.js:246), yet the first logged step was 'resolution down to 1.60 MP' at 6.2 s, with nothing before it since the benchmark began. So the run started at 1.82 MP (level 7). Replay of today's governor, same phone and route: Haven 3.47 MP when started at native, 1.61 MP when started at 1.82. In the 'own' reading, capping the start at 2.67 MP alone gives 2.64 MP against 2.23 MP.

**Fix.** In Sharp never start below KEEP: level = Math.min(level, KEEP), in arrive and in setMode's own memory. Learn a place's level only with every saving off (featureLevel === 0, as goodLevel at line 412). Benchmark.start calls app.governor.arrive(app.world.id) and allOn(), so the run measures the governor and not what play left behind.

**Cost.** None per frame. At worst a second of late frames on arrival at a place that truly needs fewer pixels; a step down takes strides.

### governor-3 (high). The ladder's first steps buy nothing on this phone now, so trials overshoot and churn.

The ladder's first steps buy nothing on this phone now, so trials overshoot and churn. Four savings head the ladder: the cloud steps (judged live while the cloud volume is already off), the robe (page work, which cannot shorten a frame the GPU is late on), the near-rock shadow tile and the glow. A trial at a heavy stop takes them before the ones that buy, and every one taken later comes back and goes again.

**Where.** src/perf/governor.js:64 (cloud-steps live: cloudVolume reads wanted, which stays true after cloud-volume is off, src/sky/cloudVolume.js:335); src/perf/governor.js:79-81 (cloak, fine-shadows, bloom in group 2 with buys from the ninth results)

**Evidence.** Tenth cost table, three views: cloud-steps 0.7 / -5.2 / -4.0; cloak -1.1 / -1.0 / 1.2; fine-shadows -0.4 / 1.3; bloom 0.4 in one view only. On the phone, cloak, fine-shadows and bloom went off at 8.3 s, before the clouds' shadows (9.9 s) and far relief (10.8 s), and were switched again at 18.3/18.9 s; the robe again at 38.5/41.9 s and the cloud steps at 26.8/42.9 s. Replay: 7.6 savings a trial at Haven, 52 % buying nothing at that stop; the near-rock shadow tile (4 cm against 15 cm texels) switched 25 times and the robe 32 times in 6 runs of Haven's minute. With A2: 33.6 savings switched a Haven run, against 44.5. With A2+B: 25.9, and the robe and the near-rock shadow tile are never switched.

**Fix.** (A2) Keep the order; move cloud-steps, cloak, fine-shadows and bloom to group 4 (buys 0.3); make cloud-steps live only while the volume is drawn: live: (app) => cloudVolume(app) && app.cloudVolume.enabled !== false. Do not reorder the whole ladder by the tenth table (fix A): its 'everything on' drifted from 43 to 69 ms within one view, and A breaks the existing 'Sharp, the opening view' case (far-rock-shadows and clouds off 34 to 40 s, limit 30), because savings come back first-gone first-back and A puts the cure first in line. To trust smaller numbers, run the cost test twice, alternating saving and baseline.

**Cost.** None: order only.

### governor-4 (medium). Trials and step-up watches carry on across a change of view.

Trials and step-up watches carry on across a change of view. A trial started at the heavy ledge is closed at the light sun stop by 'three quiet seconds' and its savings kept as a cure. Savings returned at a light stop are then judged at the next heavy one.

**Where.** src/perf/governor.js:550 (_dip ends only after 3 quiet seconds); src/perf/governor.js:408 (IGNORE frames after a jump simply return: the trial and the probe continue at the new view); src/perf/governor.js:443-452 (step-up probe)

**Evidence.** Phone: the ledge trial (12 savings, 7.4 to 12.3 s) had no 'did not cure' verdict. It ended at the sun stop; its savings came back 18.3 s, went off 18.9 s, and a new trial started at the ship (41.9 and 42.9 s). Replay: ending a trial at a jump (fix D) on top of A2+B lowers Haven's late frames from 12.3 to 10.5 % and switches from 25.9 to 23.5 a run. Alone it does nothing useful (switches rise from 44.5 to 54.8), so it ranks after A2 and B.

**Fix.** (D) A governor.jumped() method, called from App.applyBookmark (a world switch already resets through arrive): this._dip = null; this._probeFrames = -1; this.overTime = 0; this._filled = 0. In play the same confusion comes from moving between heavy and light views, which this does not cure.

**Cost.** None.

### governor-5 (medium). The benchmark's own read-out hides most late frames and mislabels the rest.

The benchmark's own read-out hides most late frames and mislabels the rest. In Sharp at 60 Hz, 'late (over 1.5x)' is exactly three refreshes (50 ms), so most 50 ms frames are not counted, yet the governor counts them and the eye sees them as stutter. 'Late frames taken as the device's own' is really the heavy views' late share, learned at the resolution's floor.

**Where.** src/perf/benchmark.js:188, :203, :211 (target * 1.5); src/perf/governor.js:431 (bg grows at the resolution's floor up to the view's late share, at most 12 %)

**Evidence.** Phone: headline 0.86 % late and the ledge '3.0 %', while the histogram has 7.6 % of all frames at three refreshes and the ledge's 25.9 fps means some 20 % of its frames were. bg = 7.0 % while Haven wall, Haven dusk and Moon dusk ran at 30.0 fps. Replay: changing bg (learning it only at the true floor) made the 'own' reading worse (Haven 1.86 against 2.23 MP), so no change to bg is proposed.

**Fix.** Count late frames at the governor's measure (over 1.2 x the interval, i.e. three refreshes or more) in the headline and at each stop, with each stop's own refresh histogram. Rename the bg line 'late frames left alone as nothing here cures them', or print bg at each stop.

**Cost.** None (read-out only).

### The test

Run these from /tmp/claude-0/-home-user-what-it-s-best-at/7f5a2798-c792-5715-aa56-df0c988ece7a/scratchpad/cloudwf/. All are Node, no browser, a few seconds each.

1. `node cases10.mjs` runs four cases written in scripts/governor-sim.mjs's style, ready to move there. They import the repository's governor plus the route replay in route.mjs. On today's governor they fail 7 checks (exit 1):
   - (1) Haven remembered at 1.82 MP, the opening view as the tenth cost test measured it (34 ms at 1.6 MP with everything on, 2.06 ms/MP; far-relief 3.9, far-rock-shadows 3.0, clouds 2.7, cloud-volume 2.0, grass-mid 1.4): after 60 s the picture must be at least 2.6 MP with under 8 % of frames late. Today: 1.75 MP, 7.2 % late.
   - (2) From the floor with ten savings on, the view turns light: the picture must be over 2.6 MP within 15 s. Today: 18.1 s, every saving back before the first pixel.
   - (3) A trial at the opening view must not switch off savings that bought nothing in the tenth table (cloak, fine-shadows, bloom, cloud-steps) before one that bought something; and with the cloud volume off, `_nextStep()` must not offer cloud-steps. Today: cloud-steps both times.
   - (4) The tenth's route, 8 runs: Haven's stops average at least 2.4 MP, under 14 % late, at most 30 savings switched a run. Today: 1.61 MP, 14.7 %, 45.

2. `FIX=A2,B node cases10.mjs ./gov-fix.js` passes all four (exit 0): 2.67 MP with 0.9 % late; over 2.6 MP at 12.1 s; the savings that buy go first; route 2.54 MP, 12.3 %, 25.9. With A2,B,D: 2.52 MP, 10.5 %, 23.5.

3. `FIX=A2,B node govsim-fix.mjs` is the project's scripts/governor-sim.mjs run against the patched copy, unchanged otherwise. It exits 0 with A2, B, A2+B and A2+B+D. Full reorder A (or A+B) fails one existing case.

4. `node compare.mjs --start 7` prints every fix set across the three readings.

On the phone, the fix should show in the next Haven benchmark in Sharp: Haven's stops near 2.5 MP or more instead of 1.60, about half as many quality steps, and late frames (counted at 1.2x) no higher than the 8.4 % of today.

