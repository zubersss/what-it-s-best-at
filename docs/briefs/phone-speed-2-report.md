# Report: Haven at a steady 30 on the phone (the second speed helper)

Beside `phone-speed-2.md`. Written as the work went; the newest state of each step is under
its heading. **Nothing here is a frame rate**: the phone cannot be reached from this machine.
Every number is a count of what the page hands the GPU (true on any device) or a reading of
the owner's own benchmark files, said as such.

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
`docs/benchmarks/2026-11-27-gl-count-a5948f1.txt`) and on 49e4294.

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

**3. What differs between the two builds?** 49e4294 is being counted as this is written (one headless browser at a time; a stop takes ten minutes): its table goes here.

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

## Step 2: the phone can say more (in the branch; seen to build and to pass its checks in Node, **not yet seen in a browser**)

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

## Step 3: cuts (in the branch; the same caveat until the pictures are in)

1. **Grass: only the blocks of a field that the shader could keep anything of are handed
   over** (`src/life/grassBlocks.js`, `grass.js`). Each of the eight fields is cut into 8 x 8
   blocks of its window round the eye; a block goes to the GPU only if the vertex shader's own
   early tests (the ring's distances, the picture's edge with the field's reach, grass or a
   flower in the ground table) could pass for some foot in it, asked of a box that holds every
   place the shader could ask them of. So nothing is left out that would have been drawn: the
   picture is the same (a blade's place moves by less than a hundredth of a millimetre: the
   sum that places it is another). In the test's 105 views **19 % of the blocks are handed
   over**: of 1.74 million triangles of grass and flowers some 0.35 million, and the frame's
   3.05 million become about 1.65.
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
3. **The figure's nine part matrices are uniforms** (`heroSculpt.js`): a vertex with no loose
   cloth (body, boots, hands, head) read nine texels of a float texture and now reads none;
   a cloth vertex reads its particles as before. The same numbers: no change to the picture.

Looked at and left:
- *The figure from its lighter mesh* (24 000 triangles for 120 000; the governor's `figure`
  saving does it): drawn side by side at the size it has on the phone
  (`hero-preview --h 330 --lod 0|1`), the rope trims, the belt and the hands are visibly
  softer. Not a cut without a change; left to the governor.
- *Buffers handed over inside a pass* (above): not the known fault; left.
