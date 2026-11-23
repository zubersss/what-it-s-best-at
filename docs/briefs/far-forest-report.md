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

In the picture (from `window.__stats.farTrees`, 660 x 309):

| view | trees standing | instances handed to the GPU | triangles in the frame | draw calls |
| --- | --- | --- | --- | --- |
| *filled in from the delivered pictures below* | | | | |

Memory: the pool is 40 tiles x 6 144 instances x 48 bytes = **11 MB** of instance buffers,
fixed, plus the worker's own arrays for the tiles held (9 floats a tree).

## What was tried and taken back

- **A tile filled by its nearest corner.** The first version asked each tile for the trees a
  traveller at the tile's *nearest corner* would see. A tile 889 m across spans a twentyfold
  range of `keep`, so it handed the GPU four times the trees it drew: **81 556 instances for
  18 879 standing**. Now every tree is tested at fill time by its own distance, and a tile
  holds half as many again as stand (which covers the traveller coming a tenth nearer before
  it is filled again).
- **The air of a wood at its full strength all the way out.** `forestAir` mixes a tree
  toward a desaturated sky light, saturating by some 300 m; carried to five kilometres it
  made every far tree a **blue-grey speck on warm ground**. It now fades out between 700 m
  and 2.2 km, where the air itself (`aerialPerspective`) does that work.
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
- Nothing is drawn beyond 5.6 km. Trees are still a few pixels at that distance on the
  phone; from there out the canopy the ground shader raises carries the forest.

## Tests

- `node scripts/far-trees-test.mjs` (3 s, no browser): a tile holds exactly the trees of its
  blocks, each at the same place (to 5 cm: a tile's positions are its blocks' shifted into
  single precision); the bands share no tree and together are every tree; a thinner band is
  a subset at the same places; rank is a hash of the site alone (half the trees under a half,
  no bias by height). **Seen to fail**: with rank taken partly from the site's column it
  reports the bias and the share; with a band quietly dropping one site in eight it reports
  that the bands are no longer every tree.
- `npm run stability -- --only haven_treeline` and `--streaming`: *(filled in below)*
