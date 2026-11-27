# Report: Haven at a steady 30 on the phone (the second speed helper)

Beside `phone-speed-2.md`. Written as the work went; the newest state of each step is under
its heading. **Nothing here is a frame rate**: the phone cannot be reached from this machine.
Every number is a count of what the page hands the GPU (true on any device) or a reading of
the owner's own benchmark files, said as such.

## What to ask of the owner, and what to read first in the answer

Two runs, phone on its side as in play, after the link has this branch:
`?bench=haven&scale=0.775` (everything on, the picture held at 2.25 MP: now paced as play is)
and the plain Haven benchmark from the start screen (the governor at work). A third,
`?bench=haven&scale=0.775&debug=floor`, only if the first is not steady.

1. **The stops of the first run against each other.** The counts say every stop hands the
   GPU the same frame; the run of 42da110 slid from 29 to 14 frames a second over them,
   unpaced. If the paced run's five stops are alike, the slide was heat and that question is
   closed. If they still slide, something outside the page's own work grows, and the new
   line under each stop (passes, draw calls, triangles, uploads) will show the page's side
   of it to be flat.
2. **"saved by leaving a group out"** at the three views: eight groups, each with its two
   takes in brackets. A group whose two takes agree is a number; this is the table the cuts
   and the governor's order are to be made from. The sky's group is the sky helper's.
3. **"every group out at once ... what is left then"**: what a frame costs with nothing of
   the world drawn (the page's own work, the glow's and the last passes, the measuring).
4. **The triangles in the line under each Haven stop**: about 1.9 million where the count
   of today's link has 3.0 (the grass by blocks), and what the frame rate did for it.
5. The last pass's row now reads "what it adds"; the canvas was at the screen's own size in
   every cost test before, so "everything on" should itself be lower than 59 ms.

## Step 1: the counts, and what they say

`scripts/gl-count.mjs` (see CLAUDE.md, "Run and test"): the real game from a frozen build in
the headless browser, in play mode with the character, the picture held at one size so the
governor takes no step, the benchmark's five Haven stops in its order. Every WebGL call that
matters is counted from before the page's first script: each pass (a render target bound and
then drawn into or cleared) with its draw calls, triangles and instances **by material**,
whether it begins with a whole clear, every texture and buffer upload with its bytes, what it
is and where in the frame it falls, read-backs, mip maps made on the GPU, programs linked.
At a stop: the first frames after the jump, then the scenes hidden for four minutes while what
streams in arrives (a software-drawn frame takes ten seconds, and arrival is paced by
frames), then frames at rest, frames with the four scenes hidden, the benchmark's look round
and its flight forward. Picture 1100 x 515 (the terrain's detail does not go by picture size;
the grass's far blades do a little).

Run on today's head (a5948f1, the phone link's c7195f9 plus notes: the whole print-out is
`docs/benchmarks/2026-11-27-gl-count-a5948f1.txt`) and on 49e4294 (two stops).

### Today's head, a frame at rest, stop by stop

| stop | passes | draw calls | triangles | uploads | just after the jump |
|---|---|---|---|---|---|
| ledge | 23 | 156 | 3.05 M | 32 KB | 85 calls, 2.70 M (no tree yet) |
| sun | 24 | 143 | 3.04 M | 33 KB | 147 calls, 2.77 M |
| wall | 23 | 148 | 2.99 M | 81 KB | 152 calls, 2.79 M |
| ship | 23 | 157 | 3.02 M | 32 KB | 162 calls, 2.84 M |
| dusk | 24 | 158 | 3.02 M | 33 KB | 159 calls, 3.02 M |

With the four scenes hidden (what the benchmark calls "nothing drawn at all"): still 23
passes, 55 draw calls, 110 000 triangles.

### The three questions

**1. What differs between one frame and the next?** Almost nothing, in the page's work. The
near shadow map's tiles take turns (wide tile on one frame, fine tile on the next, the
figure's every frame): 8 draw calls and 30 000 triangles apart (3.03 M against 3.06 M), one
order of passes, the same uploads. The wide tile's frame clears and fills 4.2 million
texels of depth, the other 2.1 million: that is all that alternates.
**So the phone's alternation (half the frames two refreshes long, half five or more) is not
work that alternates.** It is what a frame of some 58 ms looks like on a 60 Hz screen when
frames are not paced: 2 + 5 refreshes = 116 ms for two frames, 58 ms each, the very figure
the cost test printed for "everything on" at the ledge (59.0). The two runs of
`2026-11-27-haven-42da110-fixed-size.txt` were not paced (`?scale=` switched pacing off with
the governor: `governor.js`, `paced`): the phone drew as fast as it could.

**2. What grows over the first minute on Haven?** Nothing in the page's work. Every stop at
rest hands over the same frame to within 2 %: 3.0 million triangles, 143 to 156 draw calls,
23 passes (24 with the Sun in the picture: its beams' pass), some 30 KB of uploads. Just
after a jump the frame is *lighter* (trees and the far forest have not arrived: 2.7 to 2.8
million triangles), and for a frame or two it carries the arrivals (below). What a stop
hands over does not depend on how long the game has been on Haven.
**So the phone's slide from stop to stop (run A: 29, 15, 17, 14, 16 fps; run B, every
saving on: 52, 43, 30, 23, 26) is not more work.** The first stop of run B ran at 52 frames
a second, unpaced: a GPU flat out for a minute. The likeliest reading is heat (the phone
slowing itself), and a run that is paced as play is will tell: see step 2.

**3. What differs between the two builds?** In what is handed to the GPU, next to nothing
(49e4294 counted at the ledge and at dusk: `docs/benchmarks/2026-11-27-gl-count-49e4294.txt`).
At the ledge the two frames are the same pass for pass and material for material: 23 passes,
154 against 156 draw calls, 3.04 against 3.05 million triangles, the same grass, far forest,
rocks and figure (the sculpt was in 49e4294 already, its 120 000 triangles and its shadow
mesh). Two things differ: the figure's palette is 24 KB a frame for 9 (the cloth turns the
sculpt now); and at dusk 49e4294 made 21 passes where today's makes 24: the sky field's three
maps were not drawn there (the fault the sky helper cured: the day's clouds absent at most
hours) and a 1024 x 32 texture of 128 KB was uploaded every frame in their place.
**So what the phone lost between its two runs is not in the counts.** It is in what the same
passes cost (the cloud march now meets the day's real cloud at every hour: more of its
pixels have cloud to march through; the sky helper's ground), and in how the two runs were
taken: 49e4294 with the governor, paced, at 2.67 MP with savings on; 42da110 at a held size
with nothing given up, unpaced. The two are not a before and an after.

### Where the frame's weight is (ledge, at rest, a frame)

Triangles by who draws them, of 3.05 million:

| what | draw calls | triangles | share |
|---|---|---|---|
| grass blades (six rings) | 6 | 1 120 000 | 37 % |
| single flowers (two fields) | 2 | 622 000 | 20 % |
| the ground | 1 | 429 000 | 14 % |
| the far forest and its shadows on the ground | 33 | 317 000 | 10 % |
| the far rocks and their shadows | 28 | 243 000 | 8 % |
| the figure (full sculpt) and its shadow mesh | 2 | 144 000 | 5 % |
| the cloud layer's mesh, the middle and high cloud | 3 | 92 000 | 3 % |
| rocks near by, in the picture and in the shadow map | 2 | 40 000 | 1 % |
| trees near by, in the picture and in the shadow map | 38 | 15 000 | 0.5 % |

- **Grass and flowers are 57 % of every triangle handed over**, and the grass's own comment
  says two blades in three are thrown out again by the vertex shader (behind the eye, off
  the side). 147 000 cells of blades and 26 000 cells of flowers are drawn as instances
  whatever the eye looks at. This is the first cut (step 3).
- The phone's cost tables have said for three benchmarks that the picture's size hardly
  matters (ledge, 42da110 run A: 49.8 ms at 1.00 MP, 59.0 at 2.07, 56.9 at 3.74): the frame's
  cost is not in its pixels. What does not go by pixels is this table, the passes below, and
  the page's own 10 ms.

Passes, in the frame's order (the sizes are this run's; on the phone the picture's are larger):

| pass | begins with | what is in it |
|---|---|---|
| the sky field's three maps (1024 x 512, 1024 x 512, 512 x 256) | a clear of a part | one full-screen triangle each, every frame |
| the air's froxels (256 x 128) | a whole clear | one |
| the shadow atlas (3072 x 2048 depth) | a clear of a part | the tiles in turn: 21 calls, 63 000 triangles (the figure's shadow mesh 24 000, rocks 20 000, far rocks 11 000, trees 7 000 in 17 calls) |
| the clouds' shade map for trees (1024 x 768) and its probe (3 x 1) | **a draw, no clear** | 3 + 1 |
| the cloud volume: march, smooth (picture's width x half its height), "all" (a quarter) | a clear of a part (two of three) | one each |
| the grass's light table (288 x 576) | a whole clear | 3 |
| **the picture** | a whole clear at full size, a clear of a part below it | 110 calls, 2.98 M triangles; of them the cloud volume's six full-screen layers and the upper cloud's 44 000 triangles are drawn even with the scenes hidden |
| glow: five passes down, the meter (1 x 1), four up, (the Sun's beams) | whole clears | one each |
| the canvas | a whole clear | one |

- **Seven passes a frame begin without a whole clear** (the sky field's three, the shade map
  for trees, two of the cloud volume's, a shadow tile; and the picture itself whenever it is
  below full size, which on the phone is always). A clear of a part does not tell a
  tile-based GPU that the target begins anew: it may read the old colour and depth back in
  before drawing (the lesson of the cloud volume's depth, in small). Cured for the picture and
  the shadow tiles by giving the target up first (step 3); **the sky's five are the sky
  helper's** and were handed over.
- Of the 23 passes, 8 are the sky's, 11 the glow's and the last pass's.

Uploads:

- **At rest: 32 KB a frame**, all small: the figure's palette (24 KB, before any pass), the
  ground's patch list (8 KB) and the dust and the sky bodies' points (inside the picture's
  pass: three hands a changed buffer over when the scene that uses it is prepared, which for
  the near scene is after the far scene has been drawn into the same target).
- **No texture is uploaded inside a pass, anywhere.** Terrain patches (130 to 400 KB a frame
  while ground arrives, 7 mip levels of the normal map each) fall before the frame's passes,
  as `chunkPool.js` means them to.
- **Buffers are**: in the frame after a jump the far forest's and the far rocks' tiles come
  in at once (5 tiles x 3 buffers and 7 tiles x 6: 5 MB in one frame, inside the picture's
  pass); while looking round, the far rocks' tiles (up to 325 KB a frame); while trees arrive,
  their casters' buffers inside the shadow atlas's pass (40 KB a frame). A buffer handed over
  inside a pass is not the known fault a texture is (no mip maps, no copy on the GPU), and
  these are frames that are excused as "jump" or "new terrain" already; noted, not cut yet.

Other calls: no `readPixels` that waits, one read into a buffer a frame (the meter, the
shade probe), no mip maps made on the GPU, programs linked only in the first frames.

### What the counts say of the sky (handed to the sky helper)

Every stop alike, also with the scenes hidden: 8 of the frame's 23 passes are the sky's. The
field's three maps (a triangle each into 1024 x 512, 1024 x 512 and 512 x 256, each begun
with a clear of a part); the shade map for trees (1024 x 768, three draws, begun with a draw:
no clear at all) and its 3 x 1 probe, with one read into a buffer, a `fenceSync` and a
`gl.flush` a frame; the cloud volume's march and its smoothing (each the picture's width by
half its height, begun with a clear of a part) and "all" (a quarter of the picture). Then
inside the picture: six full-screen layers (`cloudVolume.layMat`), the upper cloud's 43 600
triangles in two calls, the cloud layer's mesh of 48 000. On the phone at 2.25 MP that is a
march over 1.1 million pixels, a smoothing over as many, and six blended layers of 2.25
million pixels each, whatever is on screen; the phone's own tables give the volume 7 to 16 ms.
Five of those passes begin without a whole clear (see above: `gl.invalidateFramebuffer`
before the clear is what the picture and the shadow tiles now do).

## Step 2: the phone can say more

- **Counts by stop.** Every stop's line of the benchmark is followed by what was handed to
  the GPU a frame there: passes, draw calls, triangles, uploads and their bytes, and how many
  of them fell inside a pass (`src/perf/glTally.js`: the context's functions are wrapped for
  the length of a run only; play pays nothing).
- **No GPU timer on the phone.** The governor has asked for `EXT_disjoint_timer_query_webgl2`
  since milestone 1 and prints "GPU time" when it answers; no phone result has ever had that
  line. The report now says which it is ("no GPU timer in this browser" / "gave no answer").
  Time by pass is therefore not to be had there; the groups below are the way.
- **The cost test in groups** (`src/perf/costPlan.js`): the sky (clouds of every kind, their
  shadows, fog, the far pass), the forest (trees near and far), grass and flowers, the shadow
  maps, the ground's shading, rocks near and far, the figure, glow and beams. Each is left
  out whole, **twice**, with "everything on" measured just before and just after each time,
  and the two takes are printed side by side: a number that does not repeat is not one. Then
  every group out at once, and what is left. The single savings and parts are still measured
  after the groups (12 frames a measure instead of 16: the test is as long as it was).
- **The governor's savings in families** (the same way, `SAVING_GROUPS`): the grass's three,
  the trees' and leaves' six, the sky's eleven, the shadows' five, the ground's four, rocks
  and the figure, glow. A family that buys nothing need not be looked into; one that buys
  much is, by its "one saving alone" numbers. This is the table the governor's order (step 4)
  is to be made from. To keep the test as long as it was: a single saving is measured over 8
  frames, a part over 10, a group or a family over 12, and a part that is a whole group by
  itself is not measured a second time.
- **The page's own work by part**: "rocks and trees" (2.5 ms a frame at the ledge on the
  phone) is now rocks near by, far rocks, trees, far forest, leaves and grass, each by
  itself, and six parts are printed under a stop instead of four.
- **The canvas is held at the picture's size during the cost test**, as play has it. It was
  held at the screen's own size: every measure of the last three benchmarks carried a last
  pass over 3.74 MP that play at 2.25 MP does not pay. The row for the last pass now prints
  what the whole screen would add.
- **A run at a held size is paced as play is** (`governor.js`, `paced`). `?scale=` switched
  pacing off with the governor, so the two runs of 42da110 drew as fast as the phone could
  (52 frames a second at the first stop with every saving on) and slowed stop by stop.
  **Changed for the player**: with `?scale=` in the address the game no longer runs faster
  than its mode's rate. Pictures (`?shot=`) are not paced, as before.
- `node scripts/cost-plan-test.mjs` (`--break drift|pass|bytes` puts a fault in to see it
  fail): the tally against a made-up context; the plan's order; a group that costs 9 ms reads
  9 ms under a baseline that climbs 40 ms over the test.

## Step 3: cuts

**Seen in the browser** (build 09e70d4 of this branch, the opening view, software WebGL):
- The opening view draws with every shader linked and inside a phone's limits (the
  screenshot run's own check).
- *The grass by blocks against the whole field, in one browser session at the same moment*
  (`node scripts/grass-cull-pair.mjs`: the wave held still, pollen out, three pictures a few
  frames apart: blocks, whole, blocks again): **no pixel differs by more than one level of
  255** (0.24 % of them by that one level; the picture by itself changes 0.41 % of its pixels
  by one level over the same few frames: the exposure settling). Handed over: **700 572
  triangles of grass for 1 795 392; the frame 1.90 million for 2.99**.
  `docs/shots/speed-2/grass_whole_above_blocks_below_ledge.jpg`. From 50 m over the meadow
  the grass is 361 560 triangles for 1 795 392 (that view had not settled: no pixel count).
- *The merged build (dde2792: twelve blocks a side, the layers rule moved, seasons 3 to 5 and
  the sky's cuts merged in), with every saving on* (`--query debug=floor`, the same view):
  blocks against whole again no pixel more than one level apart (0.017 % of them by one);
  625 680 triangles of grass for 1 915 344, the frame 1.32 million for 2.61. The thinned
  meadow is whole and even: `docs/shots/speed-2/ledge_floor_grass_by_blocks.jpg`.
- `npm run smoke` passed on 5fece89 (the Mars benchmark with the new lines and two new
  checks for them; every shader inside a phone's limits). In its cost test, on a software
  renderer whose baseline climbed from 1 257 to 5 785 ms over the test, the ground's shading
  read 1 226 and 1 249 ms in its two takes: the groups hold under a drifting baseline, where
  the single savings of the same test all read 20 to 190 ms "saved" (the drift).
- *The flowers' lists (b4ee34b), the same check*: blocks and lists against the whole field,
  no pixel more than one level apart (0.013 % of them by one); **519 780 triangles of grass
  and flowers for 1 838 800, the frame 1.75 million for 3.07**. (The opening view is a meadow
  in full flower: its lists hold a fifth of the near cells. Flowers: 129 000 triangles for
  237 000 by blocks alone and 622 000 on today's link.)
- A first try at "before and after" with two builds' pictures of the opening view could not
  say it: the two runs were ready on different frames (181 and 184), and the grass's wave is
  added up frame by frame, so every near blade stood a pixel to one side in one of them (3 %
  of the pixels differed by more than 8 levels, all along blade edges and pollen motes).
  **Two runs of this game are not the same picture; a pair is taken in one session.**


1. **Grass: only the blocks of a field that the shader could keep anything of are handed
   over** (`src/life/grassBlocks.js`, `grass.js`). Each of the eight fields is cut into 12 x 12
   blocks of its window round the eye; a block goes to the GPU only if the vertex shader's own
   early tests (the ring's distances, the picture's edge with the field's reach, grass or a
   flower in the ground table) could pass for some foot in it, asked of a box that holds every
   place the shader could ask them of. So nothing is left out that would have been drawn: the
   picture is the same (a blade's place moves by less than a hundredth of a millimetre: the
   sum that places it is another). In the test's 105 views **15 % of the blocks are handed
   over** (12 x 12 blocks; 19 % with 8 x 8, 14 % with 16 x 16, and the choosing costs the page
   0.15, 0.21 and 0.38 ms a frame on the build machine). At the opening view, a hillside
   meadow that fills the lower picture, 8 x 8 handed over 39 % of the grass's triangles (see
   "Seen in the browser").
   **Changed for the player, with a grass saving on only**: a thinned field ("half the
   grass", "thinner grass in the middle distance") keeps cells by a rule of the cell's own
   number on the ground (`keptCell`), no longer by the order of the instances: another half,
   as even, and still the ground's own (no cell changes as the eye moves). And thinned cells
   are thrown out by the shader's first line instead of not being handed over: a saving now
   saves what the shader does for a kept blade, not the hand-over.
   Checks: `node scripts/grass-blocks-test.mjs` (the real Grass over a made-up land with
   hills, a ridge, bare stretches and flowers; 105 views from the ground to 150 m up; for
   every cell of every field the shader's tests replayed: a cell that passes them in a block
   left out fails it; `--break reach|ring|table|height` each fail it), and
   `scripts/grass-place-test.mjs` brought in step with the new lattice (every window cell
   drawn exactly once; a place keeps its number, its blades' feet and tussocks and its
   kept-or-not across every anchor step and both wraps).
2. **The picture and the shadow tiles are given up before their clears of a part**
   (`post.js` `beginScene`, `nearShadow.js`): `gl.invalidateFramebuffer` /
   `invalidateSubFramebuffer`, so a tile-based GPU need not read last frame's colour and
   depth back in. Nothing outside the cleared part is ever read. No change to the picture.
3. **The grass's layers rule is asked before a blade's look is worked out** (`BLADE_VERT`).
   Looked along at eye height a field is twenty blades deep and five are kept: three blades
   in four of those in the picture were thrown out only after their stretch's lie and swath
   (nine sines), their clump and their seed head had been worked out, at each of three
   vertices. The same sums in another order: the blades kept are drawn as they were.
4. **Single flowers: only the cells that can carry one are handed over**
   (`grassBlocks.js`, `flowerCells`; after the count of dde2792: flowers were still 237 000
   triangles there, a fifth of the frame's runs of a vertex shader, for some hundred flowers in
   the picture). A field of flowers handed every cell of its window to the shader: 36
   triangles a cell near the eye, 16 farther out, and the shader said no to ninety-nine in a
   hundred (a kind grows where the ground table says, and of the cells there the share its
   density gives, each by a number of its own). The page now works that number out as the
   shader does (its `hash2`, in 32-bit sums) and lists a cell unless it is clear of the most
   flowers the ground could carry anywhere its plant could ask, with a margin of 0.03 for a GPU
   that rounds a sum another way (a last place of the dot product moves the number by some
   0.003) and both ends of 0..1 kept (where a number that wraps is one side on one machine and
   the other on the next). **The shader still decides, by its own number**: nothing is left out
   that it would have drawn. In the test's views 0.2 to 0.4 % of the cells are on the lists.
   The lists are made again only when the window has moved by a cell, a table has changed or
   other blocks are in view (a cell's number is kept: a moved window asks about its new row).
   And a flower part's four corners are shared by its two triangles (it was six runs of the
   vertex shader for four places).
5. **The choosing costs the page little, and nothing while nothing moves.** A block is asked
   first with the whole table's lowest and highest ground (four in five go there); with the
   eye, the picture and the tables as they were a frame before, the last choosing is put on
   again (0.007 ms). While the eye moves: 0.25 ms a frame on the build machine with a browser
   drawing beside it, 0.54 ms on a frame that makes the flowers' lists again.
6. **The near trees' corners are shared between their triangles** (`treeGeometry.js`,
   `sharedCorners`; `trees.js`). A tree's mesh was handed over corner by corner, three to a
   triangle, though its cards are quads and its boughs strips: 193 602 corners over the 81
   meshes are 94 929 distinct vertices. The same triangles in the same order, every attribute
   of every corner the same to the last bit (`node scripts/tree-shared-corners-test.mjs`,
   `--break merge|order`). In the forest view of the cost test the trees and their shadow
   casters were 773 000 runs of a vertex shader a frame; about half now.
7. **The figure's nine part matrices are uniforms** (`heroSculpt.js`): a vertex with no loose
   cloth (body, boots, hands, head) read nine texels of a float texture and now reads none;
   a cloth vertex reads its particles as before. The same numbers: no change to the picture.

### The merged build counted (dde2792, the ledge at rest; `docs/benchmarks/2026-11-27-gl-count-dde2792-ledge.txt`)

| | today's link (a5948f1) | this branch (dde2792) |
|---|---|---|
| passes | 23 | 20 (the sky helper's cuts: the field's maps on some frames only) |
| draw calls | 156 | 154 |
| triangles | 3.05 M | **1.96 M** |
| grass blades | 1 120 000 | 391 000 |
| single flowers | 622 000 | 237 000 |
| the ground | 429 000 | 429 000 |
| far forest and its shadows | 317 000 | 317 000 |
| far rocks and their shadows | 243 000 | 243 000 |
| the figure, and its shadow mesh | 120 000 + 24 000 (the sculpt) | 153 000 + 24 000 (the rigged figure, new) |
| uploads at rest | 32 KB | 83 KB |

Two things in it that are others' and were handed on: the rigged figure is 153 000
triangles, 8 % of the frame; and the seasons' lying leaves hand their whole buffer
(`treeLeaves.lieGeo`, 75 KB) to the GPU every frame at rest, inside the picture's pass.

### What a frame is made of now, in runs of the vertex shader (the counter's new column)

The phone's tables have said for three benchmarks that a frame's cost hardly goes by the
picture's size; what does not go by it is mostly geometry, and a tile-based GPU runs the
vertex shader for every vertex handed over (twice: once to sort the triangles into its
tiles, once to draw). Triangles undercount a mesh whose corners are not shared: a blade of
grass is three runs for one triangle. The counter (`gl-count.mjs`) counts runs since
3dc70c9. On today's link (a5948f1), the forest view of the cost test, a frame at rest:
**8.9 million runs**, of them grass blades 3.37 M, single flowers 1.87 M, the far forest
about 0.8 M, the near trees 0.52 M and their shadow casters 0.25 M, the ground about 0.5 M,
the cloud layer's and the upper cloud's meshes 0.27 M (not indexed: said to the sky helper),
the figure 0.07 M. After this branch's cuts the grass and flowers are about a third of what
they were and the trees half; the next in line, not done:

- *The far forest and the far rocks by parts of a tile.* A tile of far trees (889 m and up)
  or far rocks is handed over whole when any of it is in the picture: at the opening view
  44 800 far trees are handed over for 27 800 standing all round, 10 800 far rocks for 1 400
  in the picture. Each tile's list cut in four by place (four draws, each culled by its own
  bounds) would hand over about half. A change to how the tiles are filled and drawn in
  `farForest.js` and `farRocks.js`: an afternoon each, with their own tests to bring in step.
- *Blades by how many a block can keep.* Looked along at eye height five layers of blades are
  kept of twenty; which blades go is by a number of each one's own, so all are handed over.
  If the number went by the blade's place in its cell, a block could hand over only as many
  blades a cell as its steepest look keeps. Changes which blades are kept (not how many, nor
  where), and saves little on a hillside that faces the eye, as the opening view's does.

Looked at and left:
- *A middle mesh for the figure*: the sculpt made again at 60 000 triangles
  (`make-hero --tris 60000`, into a scratch file) could not be told from the 120 000 one at
  the size the figure has on the phone (4.9 % of the pixels more than 8 levels apart, all of
  them single pixels along edges; the 24 000 mesh: 13.7 %, and visibly softer). Not put in:
  the sculpt's file is being replaced by a rigged one. Said to the main session for the new
  file's meshes.
- *The figure from its lighter mesh* (24 000 triangles for 120 000; the governor's `figure`
  saving does it): drawn side by side at the size it has on the phone
  (`hero-preview --h 330 --lod 0|1`), the rope trims, the belt and the hands are visibly
  softer. Not a cut without a change; left to the governor.
- *Buffers handed over inside a pass* (above): not the known fault; left.
