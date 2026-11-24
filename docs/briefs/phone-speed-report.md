# Report: Haven at 60 on the phone (the speed helper)

Beside `phone-speed.md`. Written as the work went; the newest state of each job is under
its heading. Nothing here is a frame rate: the phone cannot be reached from this machine,
and every number is a count of work on software WebGL or in Node, said as such.

## What to read first in the owner's next benchmark

1. `the ground's shading` in the three "saved by leaving a part out" rows (it was 17.4 at
   the opening view, 3.7 in a wood, 18.1 from the air). This is job 1's verdict.
2. `character` in the "by stop" lines (it was 2.2 to 3.1 ms at every stop). Job 3.
3. `cloud-volume` in "saved by one saving alone", from the air (it was 9.4). Job 4: the
   volume should now cost a good deal less there, so the saving should buy less.
4. The list of quality steps: which savings were switched on, and whether a line "giving
   quality up did not cure the late frames" still follows a trial of steps that buy
   nothing. Job 2: a trial should now reach `grass-mid`, the tree steps or the cloud
   steps, and the savings that stay on should be few and be the ones that cure.
5. `detail` in "saved by one saving alone": the ground's shader now skips its close-up
   layers where they cannot show, which is what that saving used to switch off; it should
   stay near nothing.

## The proxy: `scripts/ground-cost.mjs` (and `scripts/ground-cost-run.sh`)

What it is: the real game is opened at a view in the headless browser (software WebGL),
everything that stands on the ground is taken out of its scene, and the ground alone is
drawn into the game's own picture at a fixed size (1100 x 515), in one flat tone
(`uPlain` 1) and shaded, each timed until drawn. With `--before <an earlier
terrainMaterial.js>` the same ground at the same moment is drawn with the earlier shader
too: before and after per view, and how far the two pictures are apart in display levels
(0..255, a plain curve: the game's own grade is not in it), with a difference picture.
`--parts file.mjs` takes named parts of the shader out one at a time and prints what each
saves. Ten views: the opening view, a steppe, a wood, a rocky slope, the shore, 300 m,
3 km and 30 km up, Earth's and Mars's opening views.

What it is worth, found while building it:

- **Software WebGL does not skip code after an early `return`**: with `uPlain` 1 the
  shader still cost 1 500 ms at the opening view where a shader cut off after its first
  two reads cost 360. So "shaded minus flat" (the brief's measure) leaves a third of the
  shading out. The table below gives both the shaded time and the difference; the
  shaded time against the 360 ms floor is the truer one. A phone's GPU does return.
- It does skip a block inside an `if` that is false for the whole 2 x 2 pixels. So a
  tier by distance shows here only if it is an `if`; code hoisted out of one is paid.
- A texture read costs it far more against arithmetic than it costs a GPU (every texel is
  fetched, converted and filtered in code; four taps along the long side for the maps
  that ask for them). The proxy over-weights reads and under-weights arithmetic (the
  flowers' integer hashes hardly show in it). It is right about what is skipped.
- Each view takes two to five minutes to settle on this machine, most of it the game's
  own frames; the picture is held at a quarter of its size until the measuring.
- The dev server reloads the page when a source file changes: a run started from the
  working tree is spoilt by the next edit (one was). `ground-cost-run.sh` copies the tree
  and runs from the copy.

Where the shading went before (opening view, cut off after each part in turn, ms of
software drawing at 1100 x 515, cumulative; the whole: 4 330 to 4 460):

| up to and including | ms | this part |
|---|---|---|
| normal and baked shadow | 360 | 360 |
| close-up detail layers | 1 075 | 715 |
| slopes, map coordinates | 1 140 | 65 |
| colour maps (the world's, the ring's) | 2 030 | 890 |
| colour, cover pattern, strata | 2 215 | 185 |
| far relief | 2 430 | 205 |
| forest floor and canopy | 2 755 | 325 |
| grass, gusts, flowers | 2 990 | 235 |
| the land's painted patches | 3 375 | 385 |
| tide and beach, water | 3 515 | 140 |
| cloud shadow | 3 720 | 205 |
| near shadows, light, sky, air | 4 330 | 610 |

## Job 1: the ground's fragment shader

### What was found

- The shader worked out, at every pixel, things only some pixels show, and then weighted
  them zero; and it asked at every pixel things that are the same over a whole triangle.
  The phone's own table had said so without anyone reading it that way: `far-relief`
  bought 3.5 ms at the opening view, where far relief is added to no pixel within
  kilometres (what the saving switched off there was `demLog2Res`, a loop over the
  eight elevation rasters, run before the test that makes it unnecessary); `clouds`
  bought 4.0 ms (four texture reads, three of them of the 3-D noise, an `atan` and an
  `acos` a pixel for a shade that is smooth over tens of metres).
- A pixel of far gentle ground read 24 textures and ran the raster loop; a pixel of near
  grass 30 to 34 and up to six integer-hash noises.

### What was done (four tiers; `src/terrain/terrainMaterial.js`, and the froxel lookup in `src/render/lightingGlsl.js`)

1. **Nothing worked out that is weighted zero** (exact: the picture is the same):
   - the two close-up detail layers (9 and 83 repeats a tile, up to six `textureGrad`
     reads on a steep face) are read only where a pixel is narrow enough on the ground
     for them to show. Beyond that the sampler answers with the texture's last level, one
     number; that number is a uniform now (`uDetailMean`, worked out as the GPU makes its
     levels) and nothing is read. The cut is where a sampler with four taps along the
     long side would be a whole level past the last (`DETAIL_LAST`): on level ground
     seen from eye height that is everything beyond some 90 m for the fine layer and
     300 m for the coarse one;
   - the world's colour map is read only where the ring's finer map does not cover the
     place whole (inside the ring nothing of it was left in the colour);
   - the strata (two reads) only on rock, scree and bare bedrock, or on worlds whose
     dust shows them (Mars, Earth); read with `textureLod` at its one level;
   - `demLog2Res` and the relief's footprint only on patches coarse enough for the far
     relief to be added (`nearFade > 0`);
   - the flowers' two fine noises only where a speck is larger than a fifth of a pixel,
     the "broken patches" noise not where single specks are seen;
   - the painted patches (two `textureGrad` reads) only on gentle ground beyond 60 m,
     where they have weight;
   - Oren-Nayar only where the painted light is not all of the light;
   - the Sun's light through the air asked once (it was asked again for the glint on
     water and on wet ground).
2. **The Sun's light and the air at the vertices.** `directSun` (two reads) and the whole
   of `aerialPerspective` (six froxel reads, a `pow`, square roots, the rain's veil) hardly
   change over a triangle of the ground. The vertex shader now works them out
   (`vSun`; `vHazeT`, `vHazeL`, `vHazeG`: the air as three numbers a colour is put
   through, `hazeAffine` in `lightingGlsl.js`, built on the same froxel lookup,
   `froxelHaze`, that `hazeOverGroundFull` now also calls: one rule). From space the air
   is still worked out per pixel (the planet's edge needs the march).
3. **The cloud's shade at the vertices of the near ground.** Patches up to 12.5 detail
   tiles across (vertices at most 13 m apart; the heaps are cut from a noise with 80 m
   cells) ask `cloudOver` at their vertices and hand the three numbers on; the shade's
   clean edge is still cut per pixel. Coarser patches ask per pixel as before. One
   rule (`CLOUD_OVER_GLSL`) for both stages.
4. **The gusts over the grass at the vertices** (a noise 240 m to the cell, eight
   integer hashes a pixel within 900 m before).

The vertex stage now reads 11 textures (a phone allows 16; both stages together 27 of
32) and hands on 13 rows of varyings (of 15; the height, the morph and the canopy's share
were packed into one to make room).

### Texture reads and noise calls a pixel, read off the shader (Haven)

| pixel | reads before | reads after | noises before | noises after |
|---|---|---|---|---|
| near grass, 30 m off, in a flower drift | 30 to 34 (4 to 8 of them shadow taps) | 11 to 15 | 6 | 4 |
| near grass, 30 m off, no drift | 30 to 34 | 11 to 15 | 2 | 1 |
| gentle ground 400 m off | 26 | 7 to 11 | 2 to 4 | 1 to 3 |
| gentle ground 3 km off | 24, and the raster loop | 10 to 11 | 0 | 0 |
| a rock face near by | 28 to 38 | 11 to 19 | 0 | 0 |
| the land from 30 km (far relief added) | 28 | 15 | 0 | 0 |

(A "noise" is `flNoise`: eight integer hashes and a trilinear blend. The reads that are
left on a far pixel: the normal and the baked shadow, the detail tile, the ring's colour,
the two painted patches, the cloud's four on coarse patches, the sky's light.)

### Numbers (the proxy; software WebGL, 1100 x 515; a count of work, never a frame rate)

(the table is filled in under "S1" below once all ten views have been run)

### Tried and taken back

- `textureGrad` for the strata inside the new branch: slower than the plain read it
  replaced on worlds that show strata everywhere (Mars); the strata's picture has one
  level, so `textureLod` at level 0 is the same read with no footprint.
- The close-up layers cut at the very level where the sampler's rule says they end
  (`DETAIL_LAST` 16): kept a whole level further (64) in case a phone's GPU picks its
  level a step finer than the rule; costs some 25 m of reach.
- A wider reach for the cloud's shade at the vertices (patches of 32 tiles, vertices 51 m
  apart): not tried in a picture; the noise's cells are 80 m and neighbours of different
  detail would disagree along their shared edge by what the straight line misses.

### Recommended to the other helpers (not done: their files)

`hazeAffine` and `directSun` at the vertices would serve the grass, the clumps, the far
forest's cards and the far rocks as well: each of their fragment shaders asks for the
air (six froxel reads) and the Sun (two) at every pixel of every blade and leaf, and
those are the pixels drawn several times over. The ground's vertex shader shows how
(`#define HAZE_UV 1` before the lighting chunk; the place in the view from `gl_Position`).

## Job 2: the governor's ladder

### What was found

The ladder was "least loss first"; on the phone its first eight steps buy nothing, and a
trial is judged after two rounds of one or two steps. So every trial ended among steps
that cure nothing, was put back, and the picture stayed at the floor with a third to a
half of its frames late (four times in the ninth benchmark).

### What was done (`src/perf/governor.js`; `npm run govsim`)

- **The order**: (1) what the phone showed to buy 2.5 ms and more, least loss first:
  `cloud-steps`, `tree-shadows`, `grass-mid`, `trees-far`, `far-trees`, `tree-leaves`;
  (2) what bought a little: `cloak`, `fine-shadows`, `bloom`, `grass`, `terrain-1`,
  `terrain-2`; (3) the depth of land and sky from the air, which buy much and are the
  last things of worth to go: `clouds`, `far-relief`, `cloud-volume`; (4) what bought
  nothing measurable in any of the three views: `detail`, `soft-shadows`, `contact`,
  `edge-glow`, `dust`, `rocks`, `far-rock-shadows`, `far-rocks`, `rain`, `leaves`,
  `sun-beams`, `air-shadow`. Each step carries a line with the phone's figure and a
  `buys` number.
- **Live steps**: a step may say whether it can buy anything where the traveller is (near
  trees drawn; clumps drawn; blades drawn; the far forest shown; the cloud volume wanted;
  the cloud layer visible; a relief map; the figure visible; rain falling). A step that
  is not live is passed over.
- **Strides**: a stride down takes live steps until they are expected to buy 2.5 ms, so
  the small steps go several at a time.
- **A trial reaches what can help**: once the savings are being tried, the verdict "this
  cured nothing" waits until no live step known to buy a stride's worth is left untried.
  (A trial of fewer pixels above the floor is judged after two rounds, as before.)
- **Coming back, oldest first**: a trial takes steps until one cures the frames, and the
  ones before it bought nothing. The savings that went first now come back first, five
  at a time; if what came back makes frames late again it goes off again and to the end
  of the line, and the next few come back one at a time. What stays off in the end is
  what the frames need: in the simulation one saving (`grass-mid` at the opening view,
  `trees-far` in a wood, `cloud-volume` from the air), where the old ladder left nine
  to fifteen on or cured nothing.
- The savings that are on are a list (`governor.off`), no longer a count; `featureLevel`
  is its length; the benchmark's cost test uses `allOn()` / `restoreSavings()`.
- `debug=floor` and `toFloor()` switch all of them on, live or not: the floor's picture is
  what it was.

### Numbers (`npm run govsim`; three new cases, each fails on the ladder as it was)

| case (frames late at the fewest pixels; the phone's own figures for what a step buys) | old ladder | new |
|---|---|---|
| opening view: `grass-mid` 5.0, `far-trees` 3.6, `clouds` 4.0, `far-relief` 3.5 | 27 % late in the second minute, 9 savings on, 3 trials put back | 0.4 % late, `grass-mid` on |
| in a wood: `tree-leaves` 11.5, `trees-far` 7.0, `cloud-steps` 3.4, `tree-shadows` 2.7 | 0.2 % late, 15 savings on | 0.4 % late, `trees-far` on |
| from the air, no trees or grass drawn: only `cloud-volume` cures (9.4) | not reached | 0.6 % late, `cloud-volume` on, no tree or grass step touched |

All the earlier cases pass unchanged.

### Behaviour changes (for the checkpoint message)

- Savings are tried in another order, and a trial lasts longer (up to some ten seconds,
  through every step known to help) before quality is put back; then, as before, such
  lateness is left alone for 30 s, 60 s, up to 240 s.
- When frames are on time again the picture comes back oldest saving first, and settles
  with only the savings it needs.
- The read-out's "N feature steps down" is now a count of savings on, in no fixed order.

### Known problems

- `buys` are the ninth benchmark's figures (build 6ac24ff). The ground's shader, the
  cloud volume and the cloth have changed since: `cloud-volume`, `clouds`, `far-relief`
  and `cloak` buy less now. The next benchmark's cost table should be read back into the
  `buys` (and the order of group 1 checked against it).
- A trial that reaches group 3 takes the clouds' depth away for some seconds before it is
  judged. With immunity doubling it happens at most a few times a session.

## Job 3: the character's page work

### What was found (`node scripts/hero-cost.mjs`, no browser)

The cloth is all of it: of 0.82 ms a frame for the whole figure here, the pose and the
limbs are 0.01. (The height function is asked up to three times a frame for the ground
under the figure: 0.006 ms each on Haven, 0.010 on the Moon: nothing.) In the cloth: a
step cost 0.31 ms and ran 1.25 times a frame at 60 frames a second (2.5 times at 30,
which is where the phone was: the slower the game ran, the more the cloth cost), and the
drawn surface 0.42 ms a frame. What made them slow: five sines a point and step (2 500
a step); links kept as an array of small arrays; `Math.hypot` (ten times a square root)
in the drawn surface; a closure made per drawn point (1 951 a frame) and a Catmull-Rom
evaluated from scratch per point and axis.

### What was done (`src/hero/robe.js`)

- the links as flat tables (ends, rest length, each end's share), those between two
  pinned points left out; the bend links ask "folded?" before taking a square root;
- each point's part of the flutter's phases as tabled sines and cosines
  (`sin(a + k) = sin a cos k + cos a sin k`): seven sines a step in place of 2 500;
- the drawn surface from tabled Catmull-Rom weights (two passes of four multiplies),
  square roots in place of `hypot`, nothing made anew in a frame;
- the solver itself (75 steps a second, four passes, the same links and forces) is
  untouched: the cloth moves as it did.

### Numbers (this machine, Node; ms a frame)

| | before | after |
|---|---|---|
| cloth at 60 frames a second | 0.81 | 0.37 |
| cloth at 30 frames a second | 1.20 | 0.61 |
| a step / the drawn surface | 0.31 / 0.42 | 0.18 / 0.09 |
| the cloth's 1 951 drawn points after ten seconds of a set flight | reference | within 0.000 mm |

(Taken while this machine was drawing pictures: the ratios hold, the figures are high.)
The phone read 2.2 to 3.1 ms at 31 to 48 frames a second: by the ratios here that is 1.0
to 1.5 ms now at those frame rates and under 1 ms at 60, where one step in four fewer
runs. **Under 1 ms on the phone is likely at 60 frames a second and not proven**: the
benchmark's `character` figure says.

`scripts/lib/robe-reference.json` holds the cloth's points after the set flight;
`hero-cost.mjs` fails if a change moves them by 2 mm.

### Known problems

None seen. The poses were not re-photographed one by one: the cloth's points are where
they were to the fifth decimal of a metre, and the pose code is untouched.

## Job 4: the cloud volume from the air

### What was found

The march is not the cost (which is why `cloud-steps` bought nothing from the air): it
runs at a sixteenth of the picture's pixels. The cost is the laying: six full-screen
passes over the main picture, and in each, on every pixel with cloud, six more reads of
the small picture to work out "all the cloud along this line of sight" for the painted
look's clean edge. From inside the layer or above it most of the view has cloud in
several slices: 42 reads a pixel.

### What was done (`src/sky/cloudVolume.js`)

That sum is worked out once a frame in a third small picture, one slice's size (the
`ALL` pass, 6 reads a small pixel, a sixteenth of the view), and each laying pass reads
it: 2 reads a pixel with cloud, 12 over the six passes. The six passes, their depths and
their order are as they were.

### Numbers

- Reads by the laying passes on a pixel with cloud in every slice: 42 before, 12 after;
  on a pixel with none: 6 and 6.
- The picture (Haven from 5 000 m, the benchmark's "from the air" view, whole game, old
  build against new, ground tiers included): mean 0.03 levels apart, 0.02 % of pixels
  more than 2 levels, 6 pixels more than 8. `docs/shots/phone-speed/`.

### Tried and taken back, not done

- Laying several slices in one pass where no ground can stand between them: only safe
  for slices that end before the main picture's near plane (0.15 of the height over the
  ground), which needs 6 km of height for two slices. Not worth a rule.
- The empty passes (a slice with no cloud in it anywhere still costs one read a pixel of
  the whole view): the CPU cannot know a slice is empty from inside the layer. Left.

### Known problems

The six passes still fill the view six times. If `cloud-volume` still buys several
milliseconds from the air in the next benchmark, the next step is fewer, wider slices
far off (the last three are 2.6, 4 and 7 km deep).

## What was not done

(filled in at the end)
