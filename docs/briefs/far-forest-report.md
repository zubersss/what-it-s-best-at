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

- *(filled in as the pictures are judged)*

## Known problems

- *(filled in as the pictures are judged)*

## Tests

- `node scripts/far-trees-test.mjs` (3 s, no browser): a tile holds exactly the trees of its
  blocks, each at the same place (to 5 cm: a tile's positions are its blocks' shifted into
  single precision); the bands share no tree and together are every tree; a thinner band is
  a subset at the same places; rank is a hash of the site alone (half the trees under a half,
  no bias by height). **Seen to fail**: with rank taken partly from the site's column it
  reports the bias and the share; with a band quietly dropping one site in eight it reports
  that the bands are no longer every tree.
- `npm run stability -- --only haven_treeline` and `--streaming`: *(filled in below)*
