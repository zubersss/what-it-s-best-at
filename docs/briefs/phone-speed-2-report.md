# Report: Haven at a steady 30 on the phone (the second speed helper)

Beside `phone-speed-2.md`. Written as the work went; the newest state of each step is under
its heading. **Nothing here is a frame rate**: the phone cannot be reached from this machine.
Every number is a count of what the page hands the GPU (true on any device) or a reading of
the owner's own benchmark files, said as such.

## What to ask of the owner, and what to read first in the answer

*(As of the evening of 2026-11-27, after the thirteenth results were read and acted on. The
first ask of this report, the paced run at a held size, is answered: the slide is closed.)*

The same two runs, phone on its side as in play, once the link has this branch and the sky's
and the ground's helpers' cuts: `?bench=haven&scale=0.775` (everything on, held, paced) and
the plain Haven benchmark (the governor at work, its new order). To read first:

1. **The forest's group** at the ledge and in the wood (15.0 and 15.2 ms on the thirteenth),
   and beside it the two rows that read "what it adds": **the far forest's** and **the near
   trees' light and air at every pixel instead of at their corners**. Those switch the old way
   back on: a positive number is what this delivery's cut saves there. Under 1 ms in the wood:
   the trees' cost is not in those looks, and the next cut is their triangles. Negative at
   every view: the vertices cost more than the pixels saved, and the switch is one line.
2. **The group "the ground not drawn at all ... with leaves, petals, pollen, falls and the
   lander"** less the group "the ground's shading": what the ground's triangles and the small
   things cost, if anything (the 20 and 27 ms that seemed to stand unasked-for at the ledge and
   from the air were mostly the test's own drift: two plain numbers from different moments).
   And "what is left then" with every group out against "nothing drawn at all".
3. **The hitch list**: no "unknown" ten seconds in (the shaders are made while loading now);
   any that is left says in brackets what the page did in that frame, and what it uploaded.
4. **The plain run's steps**: the governor should take the cloud march's coarser steps first,
   then the trees', then the Sun's beams, and hold a sharper picture than 1.88 MP at the
   stops it can; "savings switched" in the tens, not the seventies.
5. **The families** again, as on the thirteenth: the order is set from them.

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
- *The newest build* (c657162 and the switch after it: flowers' lists, trees' shared corners,
  the cost test's families): `npm run smoke` passed, 18 checks, every shader linked and inside
  a phone's limits; the forest view of the cost test draws whole with the trees from shared
  corners (`docs/shots/speed-2/forest_trees_shared_corners.jpg`: 1.81 million triangles in the
  frame, 3.17 on today's link with the figure in it). In that smoke run's cost test a family
  that buys something repeats (the ground's savings: 468.8 and 455.6 ms on the software
  renderer) and one that does not, does not (the sky's on Mars: -82.4 and 235.9).
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

- *(Since: for the far forest this is mostly had another way. Its vertex shader now throws a
  tree outside the picture out at its first lines, see "The trees' layers" below: the trees of
  a tile that stand beside the picture are still handed over, and cost a matrix and a
  comparison each. Cutting the tiles in parts would save that remainder; left until the
  phone's forest group says it is worth an afternoon. The far rocks are 11 000 triangles.)*
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

### The trees' layers: light and air from the corners, far trees outside the picture skipped

Counted with `scripts/overdraw.mjs` on the newest build (layers of a part drawn over each
pixel with no depth test: what its pixels would cost if nothing hid them; the depth test
saves some of it, how much is the device's to say):

| view | part | triangles | layers over the whole picture | where it is | at most |
|---|---|---|---|---|---|
| ledge (looking out, heading 222) | grass | | 1.73 | | |
| | far forest | 332 700 | 2.52 | 8.42 (30 % of the picture) | |
| | near trees | | 0.45 | | |
| in the forest | grass | 427 300 | 1.61 | 3.29 (49 %) | 23 |
| | far forest | 509 300 | 4.18 | 19.05 (22 %) | 86 |
| | near trees | 173 300 | **11.08** | 20.74 (53 %) | 73 |

A wood is paid for in layers of cut-out pixels: trees behind trees, each a card that is mostly
nothing. Every such pixel that was not cut away then asked for the Sun's light where it is
(two looks into the tables; the near trees asked three times over, for the light, the glow
and the bounce), for the air of the wood (one) and for the air to the eye (six looks into the
froxels): nine to thirteen looks a pixel, a layer, for things that change by next to nothing
over a tree's face.

**The cut** (`src/life/farForest.js`, `src/life/trees.js`, and `forestAir` in
`src/render/lightingGlsl.js` split in two without changing its answer): the Sun's unshadowed
light and the air (the wood's own and the froxels', as `hazeAffine` gives them, the rule the
ground's vertices already use) are worked out at the vertices and handed down; a pixel keeps
its cut-out, its own shadow (near trees), the sky's light by its normal and the colour work.
What a pixel looks up went from 11 to 2 (far forest) and from about 13 plus the shadow's taps
to 2 plus the taps (near trees). The vertices pay nine looks each for it: 0.26 M runs of the
near trees and the far forest's corners, against 2.5 to 15 whole pictures of pixels.

Because that puts work on the far forest's vertices, **a far tree no part of which can be in
the picture is now thrown out before any of the vertex shader's heavy work** (the clouds'
shade, the shared tone's sixteen hashes, the snow, and now the light and the air): a tile is
handed over whole when any of it is in view (44 800 trees handed over at the opening view for
27 800 standing all round), and those beside the picture or behind the eye now cost a matrix
and a comparison each. A ball round the tree that holds its widest forms and its longest
shadow, against the picture's sides; `node scripts/far-forest-cull-test.mjs` replays the
shader's test on 60 000 made-up trees, eyes and lenses (the nearest corner of anything thrown
out lies 5 m outside; `--break ball|plane` each fail). The counter cannot count this (it
counts what is handed over, and the same is handed over); the phone's row will.

**The picture**: one session, the picture held still, old way and new by a switch
(`scripts/grass-cull-pair.mjs --set`, the switches are `?debug=farairpixel`, `farwhole`,
`treeairpixel`):

- ledge: 0.122 % of the pixels differ at all, **none by more than one level** of 255 (new
  against new a few frames on: 0.001 %). `docs/shots/speed-2/ledge_far_trees_light_at_corners.jpg`
  and `..._at_pixels.jpg`.
- in the forest: 17.3 % of the pixels differ, **none by more than two levels** of 255 (new
  against new a few frames on: 0.2 %, by one level): the air and the Sun's colour rounded another
  way over the trees' faces, nothing an eye can find. `docs/shots/speed-2/forest_trees_light_at_corners.jpg`
  and `..._at_pixels.jpg`.

**How the phone will say whether it was a gain**: the cost test has two new rows printed as
"what it adds" (`far-air-pixel`, `tree-air-pixel`): the old way switched back on, against
"everything on". If a row reads under 1 ms at the forest view, the trees' cost on the phone
is not in these looks and the next cut is their triangles (below); if it reads negative at
every view, the vertices cost more than the pixels saved and the switch is one line to turn.

## The thirteenth results read (build daa009f, held at 1.88 MP, paced), and what was done on them

`docs/benchmarks/2026-11-27-haven-daa009f-fixed-size-paced.txt`; the main session's reading is
in `docs/PROGRESS.md`. What it asked of this helper, in its order.

### What is left with every group out (34.7, 30.7 and 38.6 ms at the three views)

Two things, and one of them is not the GPU's:

- **The page's own work is in every number of the cost test** (a frame is timed from its start
  until it is drawn): 10 to 13 ms a frame on Haven. Of the frame "with nothing drawn at all"
  (14.9, 23.9, 11.4) most is that, the read-back that does the measuring, and the passes that
  run whatever is hidden (the shadow maps' own, the glow's chain for the exposure meter, the
  last pass over the picture).
- **Between "every group out" and "nothing drawn" stand 20, 7 and 27 ms, and they are not
  to be believed as they stand.** What differs between the two: with every group out the
  ground is still drawn, in one flat tone (the group is its *shading*), with the leaves,
  petals, pollen, waterfalls and the lander, while the shadow maps and the glow are off; with
  nothing drawn it is the other way round. But the two numbers are plain milliseconds taken
  at different moments of a test whose "everything on" went from 54 to 125 ms at the ledge
  and from 54 to 96 from the air, and only from 67 to 77 in the wood: the gap is largest where
  the drift was (20 and 27) and small where it was not (7). And nothing drawn there can cost
  it: the flat tone returns at the first line of both shaders, and the ground is some 225 000
  vertices in one draw (429 000 triangles, 122 patches). Most of the gap is the drift.

So the cost test now asks properly, against baselines before and after like every group: two
rows (`ground-mesh`: the ground not drawn at all; `small-things`) and a group of the two ("the
ground not drawn at all ... with leaves, petals, pollen, falls and the lander"). That group
less the group "the ground's shading" is what the ground's triangles and the small things
cost, if anything; and with it "what is left then" is a frame with only the passes that run
whatever is hidden. (The sum "the groups one by one add up to" counts the ground's shading
twice since.) And the line for "nothing drawn at all" now also says how much less that is
than everything on just before it: the number to set beside "every group out at once: saved".

### The uploads inside a pass, named (6 to 8 a frame on Haven, 40 to 57 KB)

They are all vertex buffers, none a texture (the count names each: `scripts/gl-count.mjs`,
`docs/benchmarks/2026-11-27-gl-count-dde2792-ledge.txt`, "uploads"):

| every frame | bytes | where | whose |
|---|---|---|---|
| the lying leaves' list (`treeLeaves.lieGeo.aLie`) | 75 KB | the picture's pass | the seasons helper's: **cured** since (only the stretch laid that frame, nothing at rest: `leaf-rest-test`) |
| the ground's patch list (`terrain.pool.instanceBuffer`) | 8 KB | the picture's pass | 122 patches' places, written every frame at the ground's draw |
| the sky bodies' points (`bodies.points` place and brightness) | under 1 KB | the picture's pass | two small buffers |
| **now and then** | | | |
| the trees' shadow casters (`trees.casters[].set.iA..iF`) | 8 KB each | the shadow map's pass | when a shadow tile's list is made again (a walk, the Sun) |
| far forest and far rock tiles (`farForest.pool[].iA..iC`, `farRocks.slots[]`) | 14 to 26 KB each | the picture's pass | when a tile is filled (two a frame at most) |
| dust in flight (`dust.aMotion, aState, aPos`) | 5 to 7 KB | the picture's pass | |

A buffer written in the middle of a pass is not the fault a texture is: the picture is not
written out and read back for it (that is the lesson of the third benchmark, and it was
textures); the driver takes a copy of a buffer still in use. They are named, and left: the one
of any size is cured, and moving three's own buffer writes out of its draw would mean owning
those buffers (as `chunkPool.js` owns its textures) for no cost anyone has measured.

### The "unknown" hitches (233, 167 and 200 ms ten seconds in; 133 ms at 92 s)

**Found: shaders made in the middle of play.** three makes a program at the first draw that
uses it. `node scripts/shader-first-use.mjs --distdir <build>` lists them frame by frame in
the real game, in play from the start screen (on this machine; frame numbers are true
anywhere):

```
  frame    0: (made before play: 39)
  frame    2: 1 made, 40 by then · nearScene
  frame    3: 2 made, 42 by then · nearScene nearScene
  frame    6: 2 made, 44 by then · sky.cloudVolume._sky.field._mat nearShadow.casters[].mesh
  frame   15: 3 made, 47 by then · nearScene nearScene nearScene
  frame   70: 1 made, 48 by then · nearScene
shaders made after the third frame of play: 6 in 3 frames
```

Six programs of things in the near scene (the trees' meshes, the far forest, the leaves: made
when their first meshes arrive, seconds after play begins) and the shadow casters' depth
program. On a phone each is a compile and a link of a large shader in the middle of a frame.

**Cure** (`App.precompile`, `NearShadow.precompile`): every shader of every scene, visible yet
or not, and every caster's depth shader, is asked for on the third frame of loading, with the
target it will draw into bound (a program belongs to its target), and again on arriving at
another world. Where the browser compiles in the background nothing waits for it. After:

```
  frame    0: (made before play: 68)
  frame    6: 1 made, 69 by then · sky.cloudVolume._sky.field._mat
shaders made after the third frame of play: 1 in 1 frames
```

The one left is the weather field's own pass (`src/sky/skyField.js`, `_mat`: made when the
first snapshot arrives; the sky helper's file, said to it). The price: 68 programs are asked
for while loading where 48 were ever used in nine minutes at the opening place (rain, the
lander, things of other places): a longer load on a browser that cannot compile in the
background, no frame of play.

**And the benchmark says what it cannot place**: a hitch with no known cause is still
"unknown" to the governor (nothing new is excused), but its line now names what the page did
in that frame: "2 shaders made: Trees FarForest", "trees filled", "far trees filled", "far
rocks filled", and what it sent to the GPU ("uploads 412 KB in 14, 3 of them inside a pass").

## Step 4: the governor, from the families

The order of savings and what each is taken to buy were the tenth results' single numbers.
The thirteenth measured the savings in families (each switched on whole, twice, between two
measures of everything on): a family's two takes agree where a single saving's number is the
baseline's drift (54 to 125 ms over one view's test).

| family | ledge | wood | air | read |
|---|---|---|---|---|
| the sky's | 5.0 (4.5 · 5.5) | 6.7 (6.2 · 7.2) | 13.6 (13.6 · 13.7) | buys everywhere; alone, only the cloud volume (7.0, 10.1) and its coarser steps (2.9, 2.1) show |
| the trees' and leaves' | 2.3 | 7.6 (7.3 · 7.9) | 2.3 | buys in a wood |
| glow | 4.2 (3.0 · 5.4) | 0.7 | -2.1 | buys where the Sun is in the picture: its beams |
| the ground's | 0.0 | 0.6 | 7.2 (4.1 · 10.3) | from the air: far relief (4.9), close-up detail (1.5) |
| the shadows' | 1.9 (0.5 · 3.4) | 0.8 | -2.8 | nothing |
| the grass's | 1.3 | -1.8 | 0.5 | nothing (it bought 5.0 before the grass went by blocks) |
| rocks and the figure | 0.9 | 0.7 | 0.0 | nothing |

**The order now** (`src/perf/governor.js`, families in the main session's order, least loss
first within one; a step that can buy nothing where the traveller is, is passed over):

1. what buys: the cloud volume's coarser steps (2.5) · the trees' full shapes less far (2.0),
   the far forest thinned (1.0), every leaf on the nearest trees (1.5), the leaf carpets (0.5)
   · the Sun's beams (3.5; **live only while they are drawn**: it stood in the tail with no
   such test and would have been taken for nothing wherever the Sun is out of the picture)
   · close-up ground detail (1.0) · the patches (two steps, as before);
2. the depth of sky and land, last things of worth: coarser cloud shadows, the clouds'
   shadows (1.0, was 4.0), the cloud volume (8.5), far relief (4.5);
3. what bought nothing: the sky's six small steps (none showed anything alone; the sky helper
   is cutting the sky's cost and their numbers are its to set after), rain, leaves, glow's
   other two, water, the snow line's edge, the five shadow steps, **the grass's three** (the
   whole grass left out *cost* 8.8 ms at the opening view: it hides ground that is dearer),
   the robe, the figure, dust, rocks, far rocks; and last, as before, the farther trees'
   shadows (3.9 and 5.3 this time, nothing on the tenth, 2.7 on the ninth: a number that
   comes and goes, and with it on shadows pop at 60 m as one walks; it moves up if the next
   results show it twice).

**Behaviour changes**: on a phone that is late the governor first coarsens the cloud march,
then thins trees, then drops the Sun's beams; it no longer begins with the grass. Nothing
else of the governor (its trials, its strides, what it excuses) is touched.

**The simulation** (`npm run govsim`, passes): its cases that replayed what each saving bought
on the tenth results could only fail (they have the grass and the clouds' shadows as the
cures). They are asked of a model of the thirteenth now (`scripts/lib/governor-route.mjs`,
`MODELS.thirteenth`: each stop's cost fitted to the share of late frames it had at 1.88 MP,
the families' numbers shared out as above); the tenth's models stay in the file as their
readers wrote them, and the ninth's cases pass unchanged. With the new order on that model:
the opening view holds 2.67 MP with 2.7 % of frames late on two savings (the cloud march's
steps and the Sun's beams); the route's Haven stops 2.57 MP, 12.1 % late, 27 savings switched
a run; the flight 2.67 MP with 3.1 savings on. One allowance was widened and said so in the
case: a trial that takes eight savings gives the last back after 40 s, not 30.
`scripts/sky-system-test.mjs` spelt the old order out: it holds the new one, and two rules of
it (coarser cloud shadows before none; coarser cloud steps before no volume).

**What the order cannot do**: on the thirteenth's numbers every saving together bought 6 to
18 ms of frames of 67 to 73 (measured unpaced and hot); the three costs (the sky 24, the
forest 15, the ground's shading 14 to 17) are cut at their source by the three helpers, and
the governor's order is set again from the families of the run after those cuts.

## Lessons (for CLAUDE.md, the main session's to take or leave)

- **A run at a held size was not a run of the game**: `?scale=` switched the frame pacing off
  with the governor, the phone drew flat out and slowed stop by stop. A benchmark that is to
  say what play is like must be paced as play is; and when stops that hand the GPU the same
  frame run at 29 and at 14 frames a second, it is the device, not the page.
- **Count what is handed over before reading a cost table.** A count is true on any device
  and takes ten minutes a view (`scripts/gl-count.mjs`); it said in one run that 57 % of the
  triangles were grass of which two thirds were thrown out again, that nothing alternates
  and nothing piles up, and that two builds a day apart hand over the same frame. Triangles
  undercount what is not indexed: count runs of the vertex shader.
- **A change to the game can break a check that stands in for the game** (a stub of the
  renderer without a call the game now makes; a Benchmark made without a renderer): two of
  mine went out that way, the game itself whole. `./scripts/all-node-checks.sh` before a push.
- **Conflict marks inside a shader's text build.** A merge left `<<<<<<<` in `grass.js`
  inside a template string: the build passed, every Node check that does not compile the
  shader would have, and the grass would have been gone on the phone. After a merge, look for
  the marks in `src/` whatever the build says (`grep -rn '<<<<<<<' src scripts`).
- **Two runs of the game are not the same picture.** The grass's wave is added up frame by
  frame and two runs are never ready on the same frame: a before and an after from two
  builds differ along every near blade. A pair is taken in one session, the picture held
  still (`scripts/grass-cull-pair.mjs` shows how).
- **The shader's own tests can be asked on the page, of a box**: what the vertex shader
  throws out by a rule of place (a ring, the picture's edge, a table that says "nothing
  here") need not be handed over, and if the page's test is the shader's own asked of a box
  that holds every place the shader could ask it of, the picture is the same and a replay in
  Node can prove it cell by cell. Where the rule is a number of the thing's own (a hash),
  work the number out as the shader does, in 32-bit sums, and leave a margin for a GPU that
  rounds another way; the shader still decides.
