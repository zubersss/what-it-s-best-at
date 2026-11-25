# Report: the air and the bare land seen from above

Brief: `docs/briefs/air-from-above.md`. Branch `ccr-aa39490a-air-above` (merged with
`ccr-aa39490a-qiw63x` at 5024b61). Pictures: `docs/shots/from-above/` (suffixes below),
eye-height pairs in `docs/shots/air-above/`.

Picture suffixes: `_l0` the owning branch before this work (6fd3896); `_nohaze`, `_nofa`
(no forest air), `_nograde`: the suspects switched off one at a time; `_a1` … `_a5`/`_a6`
the rounds of this work (`_a5`/`_a6` are what ships); `_own` the owning branch's head
built alone (for the floor pair).

## 1. What made the veil and the navy (L-LOOK, 322da83)

Taken apart in one build each (`debug=nohaze` and `debug=nograde` are new switches):

- **The veil** is two hazes that lay over the ground straight below as fully as over the
  horizon, from 100 m to 3 km up:
  - the forest's own air (`forestAir`: a third of the way to grey-blue beyond some 150 m
    from the eye) — about half of the teal over a wood at 300 m (`_nofa`);
  - the look's thick low air (`uHaze` = 1 up to 2.5 km) — the rest, and nearly all of it
    at 3 km (`_nohaze`).
- **The navy** is that haze over shade that is itself almost black: the far canopy in a
  mountain's shadow measured (4, 14, 2) of 255 with the haze off. The grade is not the
  cause (`_nograde` is the same picture).

## 2. The air from above (9a93bdb and after)

One number for "up in the air", `aloft` (`render/look.js`): 0 on foot and up to 20 m over
the ground, 1 from 150 m, gone again between 20 and 40 km (where `uHaze` has the say).
Blended by height (smoothstep), so nothing steps. A world opts in with `look.aloft`
(Haven: `{ clear: 0.9, sky: 2.6, lift: 0.9 }`); Earth has none and is unchanged.

- **Haze by how steeply one looks down** (`hazeAloft`, `render/lightingGlsl.js`): the
  haze along a line of sight is thinned by how steeply it looks down at the place it
  ends: straight down 0.9 of it is spared, a grazing line keeps all of it. One rule in
  the three places the haze is worked out (`hazeOverGroundFull`, `hazeAffine` at the
  ground's vertices, `forestAir`), so trees, ground and far canopy agree. So the ground
  below is clear and the land toward the horizon still pales.
- **The shade**: from above the sky's light on things counts for more (`uPaint.y` times
  1 + 2.6 aloft) and leans violet (`skyLight`'s painted tint goes from teal to violet with
  `uAloft`); and the grade lifts the picture's darks a little toward its cool shade colour
  (`uGrade.w`, the grade's spare channel, two lines in `post/post.js`).
- Measured on `ledge_3000_p60_clear` (mean of a box, of 255): shaded wood (50, 80, 121)
  navy → (41, 67, 88) a cool blue-green at about half the lit wood's brightness; shaded
  rock (60, 87, 126) → (80, 90, 116) violet; lit rock unchanged (237 → 248 red).
- Pairs: `ledge_300_p60`, `ledge_3000_p60_clear`, `wood_1000_p60`, `ledge_1000_p60`,
  `ledge_10000_p60_clear`, `ledge_300_p20_phone`: `_l0` against `_a5`.

## 3. The bare land from above

- **The seam** (picture 15, x 493): a bug in the far canopy's "no forest on a steep face"
  test (vertex shader, `vShell`). It reads the slope from a coarse level of each patch's
  own normal map; at a patch's edge that level is the mean of the patch's own side
  only, and two neighbours disagreed by enough to cross the test (n·up 0.895 against
  0.848 at the edge of patches 5/8/214/33 and 5/8/215/33, the test's ramp 0.76–0.885), so
  the wood stopped along the patch edge. Found by turning the pixel into a place in the
  game and rebuilding both patches in Node (the baked shadows agreed with the reference;
  the slope test did not). Fix: toward an edge the slope is taken from the fine map along
  the edge's own line (five taps 60 m apart), which both neighbours read alike, blended
  in over the last eighth of the patch. Costs up to eleven texture reads at the vertices
  of the canopy's edge strips only.
- **The pepper** on bare high ground: the far rocks seen from above (`parts-out` counted
  pixel by pixel: on the plateau at 3 km every speck goes with `farRocks`). A rock's
  reach is now cut to 0.45 of itself where the line of sight to it looks steeply down
  (`aboveReach`, `rocks/farRocks.js`; a thing of where the eye is, not where it looks:
  rocks grow in and out as with distance). From the ground the lines of sight are
  grazing and nothing changes. The same answers the "flies on the lens" rocks from 1 km.
- **The river's pale beads and the lakes' dotted rims**: far off, a texel of the ground's
  maps is part water, part bank: shallow "water" whose bed was drawn in pale sand. Seen
  from the air (`uAloft`) and beyond 1.5–6 km the shallows are now a lighter, greener
  water. The river is a continuous dim water-coloured line from 10 km, no longer a road;
  where it is narrower than a texel it still thins in and out (a true ribbon needs the
  patch builder to know rivers narrower than its texels: not done).
- Ridgelines and rock faces from 1 to 10 km (the relief light): not done.

## 4. Unchanged where it must be

- At eye height `aloft` is 0: the haze, the forest's air, the sky's light and the grade
  are the same code path with the same numbers. The changes that reach eye height are
  the seam fix (the far canopy along patch edges) and the far rocks on lines of sight
  steeper than 20 degrees. Pairs (owning branch alone against this branch):
  `docs/shots/air-above/` — Haven `ledge` and `dusk`, Earth `ledge` (see the last section).
- The floor at 300 m: `ledge_300_p60_floor` `_own` against `_a6`.

## Cost and checks

- New per-pixel work: a smoothstep per haze lookup and a few operations in the grade;
  the vertex taps above. No texture added to any shader. The far rocks draw fewer.
  No governor step added (nothing to step down that would not bring back the fault).
- `./scripts/build-check.sh`, `npm run govsim`, `npm run rocks`,
  `node scripts/far-ground-test.mjs` pass; no "OVER" line in any picture run.
