# The far rocks: an independent review of the code (2026-11-23)

A reviewer that read the code cold, with no browser (branch `ccr-aa39490a-qiw63x` at
8556597); its numbers come from short Node checks against Haven's own data. Its findings as
it gave them, most severe first; "how sure" is its own word. What was done about each is
in `far-rocks-report.md`.

## 1. The walker stands on a solid that is bigger than the rock drawn

`src/rocks/rockBlock.js:248-280` (`rockTop`, `LUMP = 0.86`), used by `src/rocks/farRocks.js:453`
(`riseAt`); the drawn block is `farRocks.js:79` (`rockGeometry(0)`).

- `rockTop` cuts a sphere of 0.86 with the fracture planes; the far rocks draw the
  20-triangle lump, whose 12 vertices sit at radii 0.54 to 0.93 and whose faces are flat
  chords (centres about 0.6 to 0.7), with the planes applied to vertices only. On the
  start's own tiles: 33 % of the places where `riseAt` lifts the walker have no rock drawn
  under them (he steps up into the air beside the block); over the drawn block his feet are
  above it by a median 0.12 of the rock's size on 3.4-8 m rocks and 0.15 on 8-20 m rocks
  (0.5 to 3 m), 90th percentile 0.27 to 0.32 of size, worst 4.4 m and 12.8 m. Sunk is rare
  and small (worst 0.19 m / 1.9 m). The comment "a sphere a little inside the lump" is true
  of the near rocks' 80-triangle lump, not of this one.
- Certain: `ROCK_SHAPE_GLSL` and `rockGeometry(0)` ported to JS, each block built as the
  vertex shader does, and the vertical's highest crossing of the 20 triangles compared with
  `rockTop` on a 13x13 grid over about 150 rocks of each solid level.
- Smallest fix: collide with what is drawn: in `rockTop` shape the 12 base vertices with
  the same planes, scale and turn, and take the highest crossing of the vertical with the 20
  triangles (only for rocks already within 1.6 sizes). The check in `rock-field.mjs` ("tops
  0.1 to 1.2 of size") cannot see this; compare against the mesh there too.

## 2. The land's shadow on rocks comes from a coarse grid

`src/rocks/rockBlock.js:213-241` (`rockVis`: `VIS_EACH = 400`, `VIS_GRID = 21`).

- Any tile with more than 400 rocks (nearly every rocky tile: 2 000 to 3 000) gets the
  land's shadow from a 21x21 grid over the tile, read between points: cells of 67 m, 167 m
  and 417 m for the three main levels. With the Sun 19 degrees up (the opening view) and the
  grid's own ray asked at each rock instead, the grid is on the wrong side by more than half
  for 7.1 % (level 0), 9.2 % (level 1), 12.8 % (level 2) of the rocks of the start's tiles:
  124 to 208 rocks a tile sunlit while standing in a hill's shade, 73 to 120 dark in the
  Sun. A rock wrongly lit also lays its shadow patch on shaded ground (a dark blob where
  there is no Sun). This is the fault the trees' last commit removed for near trees.
- Certain for the numbers (same baker, same height and wavelength, only the place differs);
  likely visible, not looked at in a picture.
- Smallest fix: a ray per rock. Measured: 54 to 98 ms a tile against 11 to 30 ms for the
  grid (the tile itself takes 32 ms on average, 98 at worst). If that is too much, rays for
  the first 400 to 800 (they are the ones seen from farthest) and the grid for the rest.

## 3. Opening the page on a world without far rocks leaves Haven's rocks without shadows

`src/rocks/farRocks.js:266` (`get casters`) with `:220` (`_makePool` only once, only when the
world has far rocks) and `src/app.js:288-289` (casters registered once, at start-up).

- If the page opens on a world without `surface.rocks.far` (`?world=mars`, or the world
  stored from the start screen), `slots` is empty when `app.js` asks for the casters, so
  none is ever registered. Arriving on Haven later through `switchWorld` (the "Haven
  benchmark" button from such a page, or a flight/GO trip) makes the pool and draws the
  rocks, but they never cast into the near shadow map, and their ground patches fade out
  inside that map's reach (`farRocks.js:196`): no shadow at all from any far rock within
  about 105 m, boulders of 20 m included. The Haven benchmark then also measures a different
  picture depending on which world the page opened on. Same root: the pool takes its level
  count and caps from the first far world for good; a later world with other `levels` would
  write past the buffers.
- Certain by reading.
- Smallest fix: register the casters when the pool is made (a callback at the end of
  `_makePool`, or `app.js` adding them after `switchWorld` if not yet added); size the pool
  from `ROCKS_FAR_DEFAULTS`' largest caps, or refuse a world whose caps exceed the pool's.

## 4. The cap is hit on exactly the ground the feature is for, and cuts tile by tile

`src/rocks/rockBlock.js:190-191` (sort, then `n = min(found, cap)`); defaults `:46-51`;
`scripts/rock-field.mjs:71`.

- What the cap removes is a tile's smallest rocks, so the cut differs tile by tile along
  straight tile edges. Level 0 (1.4-3.4 m, cap 3072): 8 of the 9 tiles round the world's own
  "steep" check place are cut (3 466 to 5 039 found), with cuts at 1.05 to 1.83 m; 4 of 9
  round the start. A tile cut at 1.83 m has lost 39 % of its rocks while its neighbour cut
  at 1.05 m keeps all its open ones: a step of about 40 % in the count across a line every
  1 334 m. Level 3 (0.6-1.4 m, tiles of 445 m) the same, up to 33 % dropped. And the check at
  `rock-field.mjs:71` (count > cap) can never fail, because `rockBlock` clamps the count.
- Certain for the numbers (`rockBlock` asked with the cap lifted); the seam itself likely,
  not seen in a picture.
- Smallest fix: keep the rule under the cap everywhere so the cap never decides (sites x
  sites x density <= cap, or a larger cap), or thin by a per-site threshold that is the same
  in every tile; and make `--check` fail when any tile is cut (ask once with cap Infinity).

## 5. Every near-shadow tile is handed every instance of every far-rock tile within 240 m

`src/rocks/farRocks.js:141-153` (`depthMaterial`), `:266` and `:355` (`shadowN` used only as
on/off); `src/shadows/nearShadow.js:74` and `:183-193`.

- A phone cost nothing headless shows: from the start, 8 879 instances in 9 draw calls
  (178 000 triangles) for each shadow tile, 1 541 of them within 240 m; at the steep place
  16 766 in 11 calls (335 000 triangles), 2 918 within 240 m. The fine tile (20 m
  half-width, drawn every other frame) gets the same lot, with no `fineCount`, for 0 rocks
  within 30 m at either place. On average three quarters of that every frame: more geometry
  than the main picture's budget of 6 000 rocks, for a handful of casters.
- Counts certain (the fill and first-so-many rules replayed in Node); the cost on the phone
  is unmeasured.
- Smallest fix: one small caster mesh of its own (say 512 instances) refilled on the CPU
  when the traveller has moved 20 m: the rocks within 240 m, nearest first, so the fine tile
  can take a `fineCount`; register that one mesh instead of 58.

## 6. `rig.agl` is now the height over the rock, and `riseAt` walks every rock of every tile

`src/app.js:171` (`land()`: `riseAt` inside `heightAt`), `src/controls/cameraRig.js:537-545`
(`_snapToGround` -> `agl`) and `:215-216` (speed law), `src/app.js:1348` (near plane).

- (a) In flight the top speed (0.2 x agl near the ground) and the near plane (0.15 x agl) dip
  each time the camera passes over a block of 3.4 m and more (60 m up over an 18 m tor: a
  third off the speed, eased down at 13 a second, back at 2.6), where `CLAUDE.md` says agl
  is the height over the ground and flight feel must not change as a side effect.
- (b) `riseAt` walks every rock of every solid tile whose bound holds the place: 5 500 rocks
  a call at the start, 15 900 at the steep place; 33 and 80 microseconds a call, and the rig
  calls `heightAt` 8 times a frame on foot (2 in flight): 0.3 to 0.65 ms of page work a
  frame, with no governor step and paid 12 km up as well.
- (a) likely, by reading (not flown); (b) measured, unmeasured on the phone.
- Smallest fix: (a) a `rig.riseAt` hook like `sunkAt`, so the floor stays the rock but agl
  is taken from the land; (b) a coarse grid per solid tile built when the tile arrives (or
  keep the rocks within 40 m of the last question and look again after 20 m).

## 7. Rocks worked out where the land-cover picture does not reach are swapped when it does

`src/rocks/rockBlock.js:150-151` (no cover = open ground), `src/rocks/farRocks.js:284`; the
window: `src/terrain/tiles/tileRings.js:14-15`, `117-118`.

- The start's level-2 tile: 2 369 rocks with the cover; without it 411 of them gone (206 of
  12 m and more) and 608 new. The picture ring keeps the traveller only one Mercator tile
  from its edge: 8.1 km at the start's latitude (just clear of the 8.4 km reach), 6.1 km at
  60 degrees, 4.2 km at 70; and it is not moved at all above 1.35 km/s (ordinary flight
  speed from 3 km up). So in fast flight, and at high latitudes always, big rocks stand on
  far wooded hills and are swapped when the window arrives. Smaller: the ring changes zoom
  at about 5 km up, which changes 21 gone / 18 new / 15 seen from another distance in that
  tile.
- Numbers certain; how often it is seen: possible (not at the start standing still).
- Smallest fix: a site the cover does not reach holds no rock seen from afar (as trees do),
  so rocks can only be added at the far edge, never swapped; or do not ask a tile until the
  window holds all of it (without counting it as missing, or screenshots wait).

## 8. The count of jobs on their way goes wrong

`src/rocks/farRocks.js:404` (ask), `:249` (`setWorld`), `:420` and `:443` (`asked--`).

- (a) `setWorld` sets `asked = 0`, but the old world's replies still arrive and each takes
  one off: `asked` stays negative for the session, and "one tile at a time while the ground
  builds" becomes up to all three workers taken before the ground gets any, on every later
  arrival. (b) The limit reads `!t.idle`, and the rocks' own job makes the terrain not idle,
  so after the first burst only one tile is ever on its way: one tile a frame where frames
  are long, which is every software-rendered screenshot (some 50 tiles at a new place).
- (a) certain by reading; (b) certain by reading, its cost in screenshot time possible.
- Smallest fix: (a) do not zero `asked` in `setWorld` (the replies settle it), or count by
  generation; (b) limit on the ground's own demand, not `t.idle`.

## Found clean

Replies carry the terrain epoch and the world and are dropped after a switch; a world
without `far` returns at once and makes no pool; rings and cover mark tiles to be worked
out again; nothing depends on where the camera looks; the lattice has no neighbour search
(one rock in its own cell, jitter 0.1 to 0.9); no reserved GLSL words, no backticks,
fragment samplers no more than the near rocks' (3 more in the vertex shader); no 111 km or
other Earth size (the pool is enough everywhere but within 1.5 degrees of the poles, which
are sea on Haven); no world-specific paths; the start is clear; buffer uploads follow the
trees' pattern, two tiles a frame at most; the governor's three steps thin and leave the
large rocks.
