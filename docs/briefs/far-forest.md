# Brief: trees as far as the eye can tell them apart

*Written 2026-11-23 by the session that owns the branch `ccr-aa39490a-qiw63x`, for a
helper session. Read `CLAUDE.md` first (the charter, the rules, the hard-won lessons), then
`docs/ARCHITECTURE.md` ("Trees and leaves", "A made world"), then this.*

## What the owner asked

After flying the new small world (Haven): **"I need you to make it so I can see at least
a mile in the ground worth of stuff. I want the trees and the grass rendered in further
than I can see ... this is a big ask and I need it to work really well."**

Your part is the **trees**. Another helper has the grass (`docs/briefs/far-grass.md`): do
not edit `src/life/grass.js` or the grass part of the ground shader.

## What is there today, and what is wrong with it

- `src/life/trees.js`: every tree within 240 m (`life.trees.radius`), as three meshes by
  distance (close, near, and a far mesh that is two crossed pictures of the whole tree and
  a rosette). The trees come from `src/life/treeBlock.js`: blocks 111 m square, a site
  every 7 m, worked out in the terrain workers from the land-cover picture.
- `src/life/groves.js`: beyond that, to 2 km, "far trees": **one site in eighteen, on a
  lattice of their own** (30 m, blocks of 1.1 km), drawn as three quads each in one draw.
- The ground shader raises closed forest as a canopy surface with crowns drawn on it.
- Wrong: at 240 m the trees thin eighteen times over and are **other trees** than the ones
  that stood there a step ago; open parkland (a fifth of the sites wooded) is nearly bare
  beyond 240 m; nothing stands beyond 2 km; the governor halves even that.

## What to build (the design is decided; change it where the pictures say so, and say why)

**One lattice.** The far trees are the same trees as the near ones, at the same places.

1. `treeBlock.js`: give every site a **rank** (a hash of the site alone, 0..1, independent
   of the numbers that already decide density, species and shape) and a `keep` argument:
   sites whose rank is not under `keep` are skipped before any height is asked for. So the
   trees of `keep = 1/4` are a subset of those of `keep = 1`, at the very same places. The
   rank goes out with each tree.
2. **Tiles.** A worker job that works out a square of n x n base blocks in one go (say 4 x 4:
   444 m) at a given `keep`, and hands back one array. On the main thread each tile is its
   own small instanced mesh (buffers from a **fixed pool**, filled once when the tile
   arrives, never touched per frame), all sharing one material; three sorts opaque meshes
   front to back and culls them by their bounds. No per-frame work per tree on the CPU.
3. **By distance.** Full density out to about 1.2 km, then thinner and thinner out to
   about 5 km (numbers in the world file under `life.trees.far`). The thinning is **per
   tree, in the vertex shader, by its rank against a smooth function of its distance from
   the eye**: a tree grows in as the traveller comes nearer (never pops), and the thinned
   ones are drawn a little wider so a wood keeps its cover. A tile is worked out again at a
   higher `keep` as the traveller approaches (with hysteresis); since the sets are nested,
   nothing that stands moves.
4. **The join at 240 m.** The same tree is drawn by `trees.js` inside the radius and by the
   far forest outside it: a clean cut by distance from the eye in both shaders, on the same
   foot position, with the far picture the same as the near system's far mesh (same shape
   and variant, size, turn, colours, light). Look hard at this join in pictures and in the
   stability test: it must not show.
5. **Seasons and light** as the near trees have them (`uSeason`, the leaf colours, the
   painted look's `PAINT_LEAF`, `forestAir`, `aerialPerspective`).
6. The canopy surface of the ground shader stays: beyond where single trees can be told,
   and under them. Check that far trees and the canopy agree where both are (no bare ring,
   no doubled forest).
7. **The governor** (`src/perf/governor.js`): the steps `trees-far` / `far-trees` must thin
   and shorten, never remove (a wood must stay a wood at the floor: `?debug=floor`).
   `Groves.setFraction` exists; keep the name or change it everywhere.
8. Screenshot mode must be able to finish (`busy`), and `window.__stats.farTrees` must say
   how many are drawn.

## Rules that bite here (all from `CLAUDE.md`)

- The phone: Samsung Galaxy S23 Ultra, 60 fps. Nothing is measured here; build so that the
  cost is in fixed pools and steps the governor can take. Say in your report how many
  instances and triangles each view draws.
- Nothing about a tree may hang on where the traveller looks or stands, except how many
  are drawn and how large the thinned ones are, and those must change smoothly.
- A thing switched off is thrown out of the picture (`gl_Position = vec4(2.0, 2.0, 2.0, 1.0)`),
  not given no size.
- GLSL ES 3 reserved words (`patch`, `sample`, `filter`, `half`, ...) are not variable names.
- A backtick in a GLSL comment breaks the build; build with `./scripts/build-check.sh`.
- One headless browser at a time on a machine. Ground-level pictures of a wooded place
  take ten to thirty minutes each here: take views from the air first, keep ground views
  few, give them `--timeout 1800`.
- Every test must be able to fail. Add one, without a browser, that the trees of a thinned
  tile are a subset of the full ones and the same as `treeBlock`'s own blocks.

## Pictures to deliver (commit them under `docs/shots/far-forest/`)

Take each **before** (the branch as you found it) and **after**, 660x309 at `--dsf 1`
unless said otherwise, with `node scripts/shots.mjs --dist --distdir <a frozen copy of the
build> --world haven --shot ledge --query "..." --suffix _x --timeout 1800`:

- the opening view (`--shot ledge`, no query), and `--shot wall`
- from the air over the opening place: `alt=1600` (130 m up), `alt=1900`, `alt=3000`,
  each with `pitch=-6` and with `pitch=-20`
- open parkland: find a place with `node scripts/find-haven-site.mjs --open` and take it
  from the ground and from 150 m up
- the join at 240 m and the band from 1.2 to 2.6 km at a phone's pixel density: the same
  views with `fov=21.4`
- one view with `debug=floor`
- the stability test with a new move of your own that walks toward a tree line (see the
  `MOVES` in `scripts/stability.mjs`): nothing may pop

## What to hand back

- Commits on your branch (push often). Do not open a pull request and do not merge.
- `docs/briefs/far-forest-report.md`: what you built and where, the numbers (instances,
  triangles, tiles, worker time for a tile), what you tried and took back, known problems.
- A message to the owning session (`session_01XG1DZ692FjkSqnhW4EMsP8`, with
  `send_message`) when a first working version with pictures is pushed, and when you are
  done. Keep messages short: branch, commit, what to look at.
