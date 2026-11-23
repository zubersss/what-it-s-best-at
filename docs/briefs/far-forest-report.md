# The far forest: what was built

*2026-11-23, by the helper session on the branch `ccr-aa39490a-far-forest`, for the session
that owns `ccr-aa39490a-qiw63x`. The brief is `docs/briefs/far-forest.md`; the design is
written up in `docs/ARCHITECTURE.md`, "Trees and leaves", under "The far forest".*

## What is there now

Trees out to **5.6 km**, and they are **the same trees** as the ones a traveller walks
among: the same places, shapes, sizes, turns, species, season and colours. Nothing jumps at
240 m any more, and nothing is another tree than it was a step ago.

Where it lives:

| file | what changed |
| --- | --- |
| `src/life/treeBlock.js` | `siteRank` (a hash of a site alone, 0..1); a band `[lo, hi)` of ranks, tested before the ground is asked about a site; the rank goes out with each tree (`TREE_FLOATS` 8 → 9); `treeTile()`: a square of blocks in one job |
| `src/terrain/chunkWorker.js` | the job `treeTile` |
| `src/life/farForest.js` | **new** (replaces `src/life/groves.js`): the far forest — tiles from a fixed pool, four levels of band and tile size, thinning per tree in the vertex shader |
| `src/life/trees.js` | a clean cut at the near trees' radius in place of the old shrink-away, in both its shaders |
| `src/worlds/haven.js`, `src/worlds/earth.js` | `life.trees.far: { full: 450, radius: 5600, below: 6000 }` |
| `src/app.js` | `Groves` → `FarForest` (one line each: the import, the object, the world switch, the frame, the read-out) |
| `src/perf/governor.js`, `src/perf/benchmark.js` | the step and the part renamed; the step now thins instead of halving |
| `scripts/far-trees-test.mjs`, `scripts/lib/madeCover.mjs` | **new**: the test the brief asks for, without a browser |
| `scripts/stability.mjs` | a new move, `haven_treeline`: walking at a wood on foot |

## How it works, in short

1. **Rank.** Every site has a number of its own, independent of everything else about it. A
   band of ranks is a subset of the trees that stand there, at their own places.
2. **`keep(d) = (full / d)^2`**, capped at 1: full density out to 450 m, a quarter of them at
   900 m, a sixteenth at 1.8 km, a sixty-fourth at 3.6 km. A tree is drawn when its rank is
   under `keep` at its own distance, and grows in from nothing as that distance closes.
   Thinned trees stand up to 1.5 times wider, so a wood keeps its cover.
3. **Levels.** Level 0 asks a worker for the thickest band (ranks 0.25..1) over 8 x 8 blocks
   (889 m) and is drawn out to 900 m; each level after it takes a quarter of the band over
   twice the side and twice the distance. Four levels reach 7.1 km tiles and rank 1/64.
   Because both the band and the area scale the same way, every level holds about the same
   number of trees and needs about the same number of tiles.
4. **Tiles** are filled once from the worker's data (and again, from the same data, when the
   traveller has come close enough to want more). Nothing per tree per frame.

## The numbers

Trees on the ground at the places tested (`node scripts/far-trees-test.mjs`): **11 000 to
18 000 trees a square kilometre** in wooded country on Haven, 2 700 in open parkland; a site
every 7 m is 20 700 sites a square kilometre.

A worker job for one tile, on this machine (a cloud container, no GPU): **18 to 60 ms**,
whatever the level — a level with four times the area asks for a quarter of the sites.
Level 3's tile (64 x 64 blocks, 7.1 km) is the dearest at 35 to 50 ms, because the ranks of
a million sites are hashed even though 1/64 of them are kept.

In the picture (from `window.__stats`, 660 x 309 at `--dsf 1`; "before" is the branch as it
was found, with `groves.js`; "handed over" is the instances the tiles give the GPU, of
which the vertex shader throws out those too thin for their distance):

| view (`docs/shots/far-forest/haven_ledge_<name>_before/_after.png`) | far trees before | standing after | handed over | triangles before → after | draw calls before → after |
| --- | --- | --- | --- | --- | --- |
| the opening view, on the ground (no name) | 6 278 | 28 060 | 46 465 | 953 000 → 1 160 000 | 111 → 132 |
| `air1600_p6`, `air1600_p20` (130 m up) | 2 472 | 27 316 | 45 152 | 429 000 → 654 000 | 61 → 82 |
| `air1900_p6`, `air1900_p20` (430 m up) | 2 472 | 22 649 | 39 489 | 363 000 → 586 000 | 26 → 47 |
| `air1900_tele14` (the same, fov 21.4, pitched onto the wooded slope) | 5 477 | 22 649 | 39 489 | 488 000 → 668 000 | 23 → 41 |
| `air2500_p6`, `air2500_p20` (1 030 m up) | 2 254 | 15 186 | 28 702 | 306 000 → 456 000 | 27 → 40 |
| `forest150` (closed forest, the north wood, 150 m up) | 11 804 | 43 384 | 63 151 | 467 000 → 718 000 | 52 → 70 |
| `park150` (open parkland, 150 m up, before dawn) | 5 673 | 16 134 | 26 862 | 363 000 → 478 000 | 32 → 49 |
| `airfloor` (430 m up with every saving on) | | 8 983 | 18 013 | 450 000 | 29 |

So: **15 000 to 43 000 far trees standing, 90 000 to 260 000 triangles of them, in 14 to 21
draw calls** more than before, at these places. Closed forest is the dearest view.

The brief's `alt=3000` views are inside a cloud here (the base stands at about 2 670 m over
this country): `alt=2500` stands in for them. Its telephoto view from the air looked at the
bare mountain: `air1900_tele14` is the same lens pitched down onto the wood. The parkland
place is 248 degrees of longitude from the opening place and so in another time of day:
`t=-5` puts it just before dawn, which shows the shadow fix below better than noon would.

Memory: the pool is 40 tiles x 12 288 instances x 48 bytes = **23.6 MB** of instance buffers (11.8 before the review's second finding),
fixed, plus the worker's own arrays for the tiles held (9 floats a tree).

## What was tried and taken back

- **Far trees with no shadow of the land on them.** They are beyond every shadow map, and
  (as the old far trees did) stood sunlit on hillsides in shade and glowed orange on dark
  ground before dawn (`park150_before`). The tile job now asks the shadow baker on a
  20 x 20 grid over the tile, at crown height, and each tree carries how much of the Sun the
  land leaves it; a tile is worked out again when the Sun has moved a degree and a half.
- **The far green.** First the species' own green all the way out: teal specks on warm
  ground (the cold blue-green a fir has near by, lit by the sky's blue). Now from 300 m to
  1.3 km a far tree's green goes over to a dark warm olive and its share of the sky's light
  loses most of its blue: a dark shape on the ground behind it, never bluer than that ground.
  Nothing changes at the line where the near trees end.
- **A tile filled by its nearest corner.** The first version asked each tile for the trees a
  traveller at the tile's *nearest corner* would see. A tile 889 m across spans a twentyfold
  range of `keep`, so it handed the GPU four times the trees it drew: **81 556 instances for
  18 879 standing**. Now every tree is tested at fill time by its own distance, and a tile
  holds half as many again as stand (which covers the traveller coming a tenth nearer before
  it is filled again).
- **The air of a wood at its full strength all the way out.** `forestAir` mixes a tree
  toward a desaturated sky light, saturating by some 300 m; carried to five kilometres it
  made every far tree a **blue-grey speck on warm ground**. It now fades out between 300 m
  and 1 km, where the air itself (`aerialPerspective`) does that work.
- **A cut-out threshold of its own.** The far forest discarded a card's pixel below 0.3 of
  cover while `trees.js` lowers its threshold with the mip level (0.42 near, 0.16 far):
  the same tree was thinner just outside the near radius than just inside it. It now uses
  the near trees' own rule.
- **Colours packed over 0 to 1.** Leaves and bark are dark (0.03 to 0.14): a byte over 0..1
  moved a far tree's green by up to 6 % from the near tree's. Packed over 0..0.75 instead.
- **The near trees asking for blocks they cannot draw.** Above 240 m over the ground no tree
  can be within 240 m of the eye, yet `trees.js` went on asking the workers for the blocks
  under the traveller (and so held the far forest's own jobs back, since the ground and the
  near trees come first). It now stops at its own radius.

## Known problems

- **Not measured on a phone.** The whole of this is reasoned and judged in pictures taken
  with software WebGL. What a tree card costs there says nothing. Ask for a Haven benchmark.
- The far forest draws **up to 32 instanced meshes** (9 + 9 + 9 + 5 by level at worst, a
  fixed pool of 40). They share one program and one material's worth of uniforms except for
  where each tile stands, so the per-draw cost is four vec3 uniforms; still, 32 draws is 32
  draws, and the cost test will say.
- The tiles hand the GPU about **1.5 times** the trees that stand (the margin that keeps a
  tile from being filled again at every step). The vertex shader throws the rest out at its
  first four instructions.
- A tile's place in its row is worked out from the **first row's** longitude count. Rows in
  different one-degree bands of latitude hold different numbers of blocks, so within a few
  kilometres of longitude 0 **at a band boundary** a tile may be reckoned one place out. No
  tree is drawn twice or lost (a block belongs to exactly one tile by its own index); the
  selection is what can be out, and only there.
- A tile costs a worker 18 to 60 ms, and a new place wants some 32 of them: about a second
  of worker time, taken only when the ground and the near trees have nothing waiting, three
  jobs at a time.
- Far trees do not sway in the wind (the near ones do). At 240 m a 20 m tree leans less than
  half a degree in a gale, so nothing shows at the line; it is still a difference.
- The land's shadow on far trees is read off a grid 45 m apart on the nearest tiles and
  370 m apart on the farthest: the edge of a mountain's shadow on a far wood is soft.
- At a mile the trees are thinned to a tenth; over closed forest they stand on the canopy
  the ground shader raises, which still has its own colour (bluer and darker than the
  trees in sunlight). `forest150_after` shows the two together; they agree better than
  they did, not perfectly. Making the canopy's green and the far trees' green one rule is
  work in the ground shader, which the grass helper is in.
- With the clock run fast the Sun moves a degree and a half every few seconds and every tile
  is asked for again each time (one worker job each, nearest first); the trees that stand
  stay until their new ones come.
- Nothing is drawn beyond 5.6 km. Trees are still a few pixels at that distance on the
  phone; from there out the canopy the ground shader raises carries the forest.

## Added after the first delivery: shadow on trees (the owning session's ask)

Asked for: far trees no longer sunlit inside a cloud's shadow. Found on the way: the bright
trees on dark ground in the view that was named (`alt=1535&pitch=-12`) were not under a
cloud at all. They were the **trees one walks among, inside the mountain's shadow**: beyond
the shadow maps those trees had no shadow of the land on them, ever. Both are done.

- **The clouds' shadow** (first as one piece of vertex shader, `CLOUD_SHADE_VERT`; since
  the review's eighth finding a small map, `src/life/treeShade.js`) is read by the near
  trees and by the far forest: the ground's own rule
  (`cloudHeap` from `HEAP_GLSL`, the day's map, `uCloud.x` times the shade), once per tree
  at two thirds of its height. Its uniforms are the ground's own objects
  (`cloudShadeUniforms(terrain)`), so nothing was added to `src/app.js`, and a saving that
  takes the shadow off the ground takes it off the trees in the same frame. It does not use
  the ground's far-off mean (`0.5 * cc`): within 5.6 km the ground is still shaded heap by
  heap. Cost: two or three texture reads per vertex of a tree (the day's map, and the
  cloud noise once or twice), nothing per pixel. **Not measured on a phone.**
- **The land's shadow on the near trees.** The worker's job for a block of near trees now
  does what the far forest's tile job does (one function, `landShadow` in
  `src/terrain/chunkWorker.js`): one shadow ray per tree, from two thirds of its height,
  carried in the fourth number of `iD`. A block is asked for again when the Sun
  has moved a degree and a half, as the far tiles are. Under the shadow maps a near tree is
  now shaded twice by the same hill, which changes nothing dark to dark; at the soft edge
  of a mountain's shadow near trees are a little darker than before.
  **Tried and taken back:** a 4 x 4 grid over the block, as the far tiles have. On the
  opening ledge it read the shade under the cliff into the trees standing on the rim in
  the Sun (their crowns a fifth darker in the opening view); tree by tree they are as
  bright as they were. The far tiles keep their grid (20 x 20 over 889 m and up): the same
  bleed is there on far rims, softer and far off. A block's job now casts one ray per
  tree, some 200 in a wooded block; its time was not measured here.
- Pictures: `haven_ledge_cloud1535_before/_after.png` (the near trees at the bottom, lit in
  the shadow before, dark with their ground after), `cloud1535_floor_after` (every saving
  on), `cloud1900_before/_after` (far trees in the shadow on the right). The before
  pictures are of the build before the owning branch was merged in: the ground's autumn
  colours differ a little between the pairs for that reason, not for this one.
- Still so: the trees' shadow of a cloud is per tree and the ground's per pixel, so under a
  cloud's edge a tree is all in or all out; and the clouds in these views cast little on
  the wooded slopes, so the clouds' part is right by construction (one rule, the ground's
  numbers) more than it is shown.

## After the independent review (`far-forest-review.md`), finding by finding

1. **Strips with no far trees (serious): true, fixed.** The reviewer was right. With the
   tiles' blocks taken by index, the new check in `scripts/far-trees-test.mjs` (the game's
   own selection, now in `src/life/farTiles.js`, against every block of trees within each
   level's reach) fails: at the north wood 15 of 168 blocks at level 0 and **231 of 755 at
   level 1** are in no wanted tile; at the opening place 95 of 3 150 at level 2 and 307 of
   7 736 at level 3. A tile is now its rows of blocks and a span of longitude (that of its
   first row's blocks), and each row gives it the blocks whose west edge lies in the span
   (`tileSpan`, `tileRow`, `tileOf` in `treeBlock.js`); where a tile stands is worked out
   from that span, wrapped at longitude 0, with a block of slack. The check passes at seven
   places, among them both sides of the seam at longitude 0 and a band boundary, and a
   level-1 tile lying over two bands holds its blocks' trees where they stand.
2. **The cap of 6 144: true, fixed.** A new check (the tile under a traveller in the thick
   of a wood must fit its buffer with its margin) failed: the north wood wants 9 464 trees
   at level 0 and **11 425 at level 1**, the golden shore 7 709, 6 455 and 7 209 (level 3).
   `CAP` is now 12 288 (the most sites a band of levels 0 to 2 can have), and on overflow
   the margin goes to 1.2 and then 1.0, never under the trees that stand. The pool is now
   40 x 12 288 x 48 bytes = **23.6 MB** of instance buffers (it was 11.8).
3. **Trees at the 240 m line drawn by nobody: true by the code, fixed; not seen in a
   picture.** The near list held trees to 10 m past the radius and was made again every
   25 m, while both shaders cut at 240 m from the eye. The list now reaches the radius plus
   the 25 m and 5 more, and blocks are asked for that much farther out. The stability move
   never walks 10 m from a rebuild, so it could not have shown it and does not prove the fix.
4. **The clock run fast: true by the code, fixed; not run in a browser.** Blocks of near
   trees whose shadow was worked out for an older Sun counted as missing, and the far
   forest asks for nothing while near trees are missing. They are now a count of their own:
   asked for after everything that has no trees yet, one sweep a second at most, and the
   lists are made again once when a sweep is in, not at every reply. A far tile is asked
   for again for the Sun at most every two seconds. (And the count of jobs out no longer
   goes negative after a change of world: the review's small leftover.)
5. **Nothing asked for ahead of the line: true by the code, fixed; not seen in a picture.**
   Near side: blocks are asked for from 1.6 times the radius above the ground (384 m), and
   the near trees' reach (which is also where the far forest and the canopy begin) goes no
   farther than the blocks that are in, so a block that has not come leaves its trees to
   the far forest instead of to nobody. Far side: a level is drawn out to where its lowest
   rank begins to grow (`full / sqrt(0.85 lo)`, a twelfth farther than before) and its
   tiles are asked for a tenth before that. 36 to 39 tiles are wanted at the places tested
   (54 beside the seam at longitude 0, where tiles are short); the pool of 40 takes the
   nearest, and those left out are the ones that cannot show a tree yet.
6. **Refills in bursts, height, draw order: true by the code, fixed.** At most two tiles are
   filled in a frame, nearest first (screenshot mode waits for a tile's first fill); the
   distance a tile is wanted, shown and refilled by counts 0.7 of the height over the
   ground, so from 2 km up the thick bands' tiles are neither worked out nor held; a tile
   with no tree in it takes no place in the pool; and the tiles are drawn nearest first by
   an order set each frame (each has a material of its own, which three sorts by first).
7. **The same tree lit differently across the join: true, fixed.** The far cards now take
   their normals by the near cards' own rule with each shape's own middle height (a copy of
   the rule checked against the near meshes' normals in Node: 0.016 degrees apart at worst,
   over all 18 corners of every shape and variant; the far forest's own rule had been up to
   26 degrees off), and far trees have the moon's light (`planetShine`) as near ones do.
8. **The governor's step, the cost test, the cloud shade per vertex: true, changed.**
   `trees-far` no longer shortens the near trees' radius (that handed the same cards to
   the far forest and moved the join nearer): it now brings the full shapes in to two
   thirds of their distance (76 m and 28 m), beyond which a tree is its three cards. The
   cost test's `trees` row hides the near meshes and leaves the line where it is. The
   clouds' shadow is no longer worked out on every vertex of every tree: a map of it
   (`src/life/treeShade.js`, 256 x 256 over 14 km, one small pass before the main picture,
   the ground's rule and numbers) is read once per vertex by near and far trees, one
   texture read where there were up to four. A tree off the map's plane looks it up where
   the Sun's ray through its crown meets the plane. **Behaviour changes for the checkpoint:**
   the `trees-far` step now does something else; `src/app.js` has three lines for the map.
   None of this is measured on a phone.

## Tests

- `node scripts/far-trees-test.mjs` (3 s, no browser): a tile holds exactly the trees of its
  blocks, each at the same place (to 5 cm: a tile's positions are its blocks' shifted into
  single precision); the bands share no tree and together are every tree; a thinner band is
  a subset at the same places; rank is a hash of the site alone (half the trees under a half,
  no bias by height). **Seen to fail**: with rank taken partly from the site's column it
  reports the bias and the share; with a band quietly dropping one site in eight it reports
  that the bands are no longer every tree.
- `npm run stability -- --only haven_treeline` and `--streaming` (strips in
  `docs/shots/far-forest/stability/`): walking at a wood, 0.4 m a frame, three stations
  40 m apart. Whole picture, settled: **59 %, 36 %, 39 % of pixels changed, 11.9 %, 8.2 %,
  9.0 % flicker**; streaming: 75 %, 72 %, 76 % changed, 3.6 %, 6.6 %, 1.2 % flicker. Those
  numbers are the grass and the trees near by in the wind (the clock runs between settled
  frames), not the far forest: **the same walk on the branch as it was found gives 59 %,
  36 %, 39 % and 11.9 %, 8.1 %, 8.9 %**, and band by band down the picture the two builds
  agree to half a point (the top eighth at the second station: 0.2 % changed in both). In
  the strips the far wood on the skyline changes only along its outlines, and nothing
  appears or goes at the line where the near trees take over. What this test cannot do is
  tell a small pop in the near wood from the wind there: it would need the clock stopped.
  (The move was first written at 1.2 m a frame with the figure in view: the grass at one's
  feet filled the picture with honest motion, 67 to 83 %, and it said nothing.)
- The join at a phone's pixel density: `haven_ledge_join_phone_after.png` (a quarter of
  the phone's frame through a lens half as wide, 1540 x 721, which is the phone's pixels
  per degree; the whole 3080 x 1442 frame did not finish in 70 minutes on this machine).
  The wood runs from 100 m to a kilometre and no line shows at 240 m.
