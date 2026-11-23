# The far forest: an independent review of the code (2026-11-23)

A reviewer that read the code cold, with no browser (branch `ccr-aa39490a-qiw63x` at
8556597). Its findings as it gave them, most severe first; "how sure" is its own word.
What was done about each is in `far-forest-report.md`.

## 1. Far trees are missing in east-west strips: a tile's rows do not stand where the main thread thinks

`src/life/farForest.js:283-288`, `src/life/treeBlock.js:99-108` (and `blockLon`, `treeBlock.js:32`).

- `blockLon` gives every one-degree band of latitude its own block width, and `treeTile`
  takes blocks by index (`bj = tj * blocks + b`) in every row. The same index is a different
  longitude in the next band, and the difference grows with longitude. `update()` places the
  whole tile by its first row's width. Rows in another band are worked out kilometres away
  and never drawn, and the tile that really owns that ground is not asked for.
- On Haven a band is 4.4 km and a level-3 tile is 1.63 degrees tall, so every level-3 tile
  straddles. On Earth it bites only within a tile's height of a whole-degree parallel.
- Certain. A Node copy of the selection loop (`far-forest-review-bandshift.mjs`, beside
  this file: `cd docs/briefs && node far-forest-review-bandshift.mjs`) gives the share of
  ground in reach whose owning tile is not wanted:

| place | level 0 | level 1 | level 2 | level 3 | rows apart (level 3) |
| --- | --- | --- | --- | --- | --- |
| north wood (the `forest150` view) | 7.8 % | 26 % | 7.5 % | 12 % | 8.8 km |
| golden shore | 0 % | 26 % | 24 % | 0.8 % | 7.2 km |
| opening place | 0 % | 2.3 % | 3.6 % | 4.9 % | 5.7 km |
| Earth, 44.02 N | 0 % | 0 % | 0 % | 29 % | 390 km |

- The report's known problem describes only the seam at longitude 0. That one is real too:
  24.5 % at level 3 one degree east of it.
- `scripts/far-trees-test.mjs` cannot see either: it compares a tile only with its own blocks.
- Smallest fix: in `treeTile`, give each row the blocks whose west edge lies in the tile's
  longitude span as reckoned from the tile's first row. In `update()`, take `dx` from the
  wrapped `tj` (difference wrapped to ±180 degrees), and allow one block of slack in `near`.
  Add the check to the test.

## 2. Trees at the 240 m line ahead are drawn by nobody, then pop back, every 25 m walked

`src/life/trees.js:370` (with :23, :354, :88) and `farForest.js:111`.

- The near list holds trees within radius + 10 m of the anchor and is rebuilt only after
  25 m of travel. Both shaders now cut cleanly at 240 m from the eye. After 10 to 25 m of
  travel, trees up to 15 m deep across about ±69 degrees ahead are inside 240 m (the far
  forest throws them out) but beyond 250 m of the anchor (not in the near list). They return
  all at once at the next rebuild.
- The old shrink-away over the last 14 % hid this. The `haven_treeline` move never travels
  10 m from a rebuild, so it cannot show it.
- Certain, from the two cut rules and the rebuild rule; not seen in a picture.
- Smallest fix: `r2 = (radius + REBUILD_M + 5) ** 2` at :370, and ask for blocks to
  `radius + 110` at :328.

## 3. In closed forest the tile under the traveller overflows its cap and drops trees that should stand

`farForest.js:46`, `:378-399`.

- `CAP` is 6144, but a level-0 band can hold 12 288 sites. On overflow the margin falls from
  1.5 to 0.9, below 1, so trees the shader would draw are not in the buffer. With no margin
  left, every refill (each 45 m) pops a batch in fully grown.
- Certain. `_fill` copied into Node on real tiles:

| place | trees in the tile | missing of those that should stand | missing between 240 and 450 m |
| --- | --- | --- | --- |
| north wood | 10 508 | 752 of 4 740 (16 %) | 312 of 2 463 |
| golden shore | 8 491 | 679 of 4 624 (15 %) | 360 of 2 879 |
| opening place | 6 785 | 0 | 0 |

- `tile.capped` is set and read by nothing.
- Smallest fix: `CAP = 12288` (64 blocks × 256 sites × 3/4), which costs 12 MB more.
  Alternatively never let the margin go under 1.18.

## 4. Nothing is asked for ahead of the line where it is cut

`trees.js:300-301`, `:328`, `:339`; `farForest.js:263`, `:280`, `:288`, `:336` against the shader at `:109`.

- Near side: blocks are now asked for only below 240 m, and only out to where their first
  tree already touches the radius. `reach` is 240 the moment `show` is true, whether or not
  a block has arrived. On a descent through 240 m, or in low fast flight, the far forest
  removes its trees inside 240 m at once.
- The near blocks come only when the ground has nothing waiting, one ask a frame. Each job
  is also dearer now: about 9 ms against 1.5 ms, with the shadow ray per tree.
- Far side: a level's tiles are wanted and shown only inside `full / sqrt(lo)`. The shader
  starts growing a tree at `0.85 × rank`, so the lowest ranks of a band are already full
  size at that distance. They pop in when the tile arrives, at 900, 1 800 and 3 600 m.
- The missing lead is certain. That it shows is likely on the near side when the ground is
  still arriving (with idle workers it is 2 to 3 frames), and possible on the far side (a
  few dozen trees per tile edge).
- Smallest fix: ask for blocks while `agl < radius × 1.6` and out to `radius + 110`. Set
  `reach` and `uTreeRadius` to `min(radius, distance to the nearest block without trees − 80)`.
  Use `full / sqrt(0.85 × lo) × 1.1` for wanting and showing tiles.

## 5. With the clock at an hour a second or faster, the far forest is never asked for again

`trees.js:332-335`, `:349`; `farForest.js:294`, `:305`.

- Near blocks go stale every 1.5 degrees of Sun and count as `missing`. They are re-asked
  one a frame, and there are about 26 of them. At 3600× the Sun moves 1.5 degrees in 6
  frames, so `tr.missing > 0` in every frame and `farForest.js:305` never asks.
- What the player sees: land newly reached gets no far trees. Tiles made at night (the
  shadow value is 0 when the Sun is down) stay without sunlight after sunrise until the
  clock is slowed. At 600× it is blocked about 25 frames in 36.
- Every block reply also sets `dirty`, so `_build` runs about 26 times per Sun step. At 1×
  that is a burst every 6 minutes.
- Certain from the code's arithmetic; not run. `RATES` in `app.js` offers 3600 and up.
- Smallest fix: count only blocks with no trees yet in the number the far forest holds back
  on. Ask for Sun-stale ones last and not more than one sweep a second. Rebuild once when
  the sweep is in.

## 6. The same tree is lit differently on the two sides of the join

`farForest.js:126` and `:179`, against `src/life/treeGeometry.js:139` and `trees.js:218`.

- Normals: the far card uses its own rule (mid height fixed at 0.6, taken after the
  crown-width scale). The near far-mesh uses the shape's own `mid` (0.42 to 0.85) and a
  different blend. Computed from the real meshes, the corner normals differ by up to 20 to
  26 degrees on shapes 2, 3, 4 and 6, and 5 to 16 on the others. The N·up leaf tone differs
  by up to 15 %.
- Moonlight: the far shader has no `planetShine(N)`. Under Mira, near trees are moonlit and
  the same trees past 240 m are not.
- The mismatch is certain (computed; card positions and picture orientation do match). That
  it shows at the line is likely, most with the painted look's two-tone light and on
  moonlit nights.
- Smallest fix: use the near rule with a per-cell `mid` (one more uniform array, read in
  the constructor as the rectangles are), and add `+ planetShine(N)` at :179.

## 7. Refills come in bursts, and are measured along the ground

`farForest.js:332`, `:287-288`, `:318`, `:208-218`.

- Bursts: tiles filled while the traveller stands share one `fillEye`, as do all tiles
  after any `setFraction`. Every tile with `near < 450` then refills in the same frame each
  45 m, about 15 to 20 tiles. A level-0 fill in closed forest measured 0.9 ms (0.34 ms
  level 1, 0.2 ms level 2), so 7 to 8 ms of page work plus some 3 MB of buffer uploads in
  one frame.
- Height: `near` and the 45 m rule ignore altitude. At 2 km up, level-0 and level-1 tiles
  cannot draw a tree, yet they are still worked out by workers, hold pool slots ahead of
  level-2 and level-3 tiles that do draw, and are refilled every 45 m of flight (every frame
  or two at 0.4 to 1.2 km/s).
- Draw order: each slot has its own material, and three sorts opaque objects by material id
  before depth. The tiles are drawn in pool order, not front to back as the comment at :214
  says.
- The mechanics are certain. The cost on the phone is likely, not measured.
- Smallest fix: at most two fills a frame, nearest first (the 1.5 margin covers the wait).
  Use `Math.hypot(near, 0.7 * rig.agl)` in the reach test and the refill rule. Leave empty
  tiles out of `take`. Set `mesh.renderOrder = 5 + i / 64` by place in `take`.

## 8. The governor's `trees-far` step now buys almost nothing, and the cost test misreads trees

`src/perf/governor.js:48`, `src/perf/benchmark.js:270`, `trees.js:133`.

- `trees-far`: it shortens the near radius to 158 m. The trees between 158 and 240 m are
  far-mesh cards, and the far forest now draws the same three quads in their place. It saves
  little and moves the join nearer.
- Cost test: the `trees` row (`setFraction(0.02)`) makes the far forest draw every tree
  from 5 m as a card. The table will show meshes against cards, not the cost of trees.
- New cost without a step: the clouds' shadow is worked out per vertex, not per tree. That
  is one map read and three 3-D noise reads on every vertex of every near tree, estimated
  at one to two million vertices in a dense wood on the ground. It goes only when the
  ground's cloud shadow goes.
- The first two are certain from the code. The vertex cost is possible; it is unmeasured.
- Smallest fix: drop `trees-far`, or have it also hold the far forest's inner radius at
  240 m. Give the cost test a switch that hides the near meshes without changing `reach`.
  Ask for a Haven benchmark before trusting the cloud shadow on trees.

## Found clean

Worker replies carry the epoch and are dropped after a switch; `setWorld` mutates the
shared uniforms and frees the pool; trees are re-placed on new cover or elevation; rank is
independent of density and species and the bands nest; `busy` can finish in screenshot
mode; throw-outs use `gl_Position = vec4(2.0, …)`; no reserved GLSL names or backticks; no
world-specific branches; the cover map reaches well past 5.6 km on both worlds. Small
leftover: `asked` goes negative after a world switch with jobs in flight, in both
`trees.js` and `farForest.js`.
