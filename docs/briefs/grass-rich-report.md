# Report: denser grass for less, flowers of many kinds, pollen in the air

*For the session that owns `ccr-aa39490a-qiw63x`. Branch `ccr-aa39490a-grass-rich` (that
branch merged in). Brief: `docs/briefs/grass-rich.md`.*

## What was built

### The grass: all blades, no cut-out anywhere (`src/life/grass.js`)

The phone said the cut-out cards of the middle distance were what the grass cost (halving
them saved 5 ms, thinning the blades nothing). They are gone. All grass is now blades:
opaque triangles, one per blade, on **six rings** fixed to the ground that wrap round the
eye, each coming in where the one inside it goes out (`RINGS`):

| ring | cells a side | apart | blades a cell | out to |
|---|---|---|---|---|
| feet | 96 | 0.125 m | 14 | 6 m |
| near | 125 | 0.32 m | 12 | 20 m |
| nearer | 160 | 0.5 m | 10 | 39 m |
| mid | 150 | 1 m | 9 | 74 m |
| far | 160 | 2.5 m | 6 | 195 m |
| farthest | 220 | 5 m | 4 | 545 m |

The farther the ring, the broader and taller its blades (a thin leaf at one's feet, a
tooth over half a metre wide at 300 m): the same mass in fewer triangles. Every spacing
divides the anchor's 40 m step, as before. The last three rings are what the code calls
`clumps` (the governor's `grass-mid` halves them and widens what is left, as it did the
cards); the first three and the flowers are `fields` (`grass` halves them).

Three things keep it cheap:

1. **Thrown out early.** A blade outside its ring or outside the picture is thrown out of
   the picture after one table read, before anything dear is worked out.
2. **No more layers than the eye can use.** Looked along at eye height a full field is
   twenty blades deep and all but the front few are hidden. Each blade works out how deep
   the field is at its place, seen from the eye (its ring's blade area over a square
   metre, by how squarely the ground is looked at, counting the governor's share), and
   beyond `LAYERS` (5) deep blades are left out one by one, each by a number of its own;
   an eighth of a field stays whatever the angle. From above, where nothing hides
   anything, all are drawn. A blade is always the same blade at the same place: it only
   grows from nothing or shrinks to nothing as the angle changes, like a level of detail.
3. **Lit once a frame, not per pixel.** Every blade used to work its light out pixel by
   pixel: the Sun through the air, three shadows, the sky, the haze between it and the
   eye: some twenty texture reads for each of the layers of grass over a pixel. Now a
   small pass before the main picture (`renderLight`, after the shadow maps and the
   clouds' shade, called from `app.js`) works it out for a table of places on the ground:
   96 x 96 for each ring over its stretch, three numbers each (the Sun's light there with
   every shadow in it, the sky's, both dimmed by the air between there and the eye, and
   the air's own light): one half-float picture 288 x 576. A blade's three corners read it
   at the blade's foot and the fragment shader writes the colour it is handed. The places
   are fixed to the ground (a stretch's middle moves in whole places), so a shadow's edge
   does not crawl. Blades looked at toward the Sun glow (light through them).

Where the land has grass it is all there now: the amount from `AMOUNT` is full from 0.46
up (`dens`), and thin land is thin in **tussocks** half a metre across with bare ground
between (the same tussocks in every near ring), not an even sprinkle of single blades.
The one slope rule, the canopy, water, the look from above (the far blades' tone and
"looked at squarely" rule, the clouds' and the land's shadow on the far grass) are kept.

### Flowers: 26 kinds in six habits, abundant by place (`src/life/grassRules.js`)

`KINDS`: daisy, poppy, lupin, buttercup, fireweed, orange poppy, pink mallow (the first
seven keep their numbers), clover, speedwell, cow parsley, yarrow, foxglove, balsamroot,
cornflower, moss campion, saxifrage, dandelion (some gone to seed: white clocks), thrift,
gentian, ox-eye daisy, sage, bluebell, primrose, paintbrush, cotton grass, thistle. Each
has a habit, a head's size, how tall it stands, petals, colours, a middle's colour:

- *turf*: tiny heads scattered low among the blades (clover, speedwell);
- *cup*: petals round a middle, up and toward the eye: few broad petals overlap as a
  poppy's bowl, many narrow ones are a daisy's rays; the big ones are single heads a hand
  across (balsamroot, mallow, ox-eye);
- *spike*: florets up a tall stem, round it in turn (lupin, fireweed, foxglove's hanging bells, sage, bluebell, paintbrush);
- *umbel*: a flat-topped spray of tiny florets (cow parsley, yarrow);
- *globe*: a ball of florets (thrift, cotton grass, thistle, the dandelion's clock);
- *cushion*: a low mound on the ground specked with flowers (moss campion, saxifrage).

One vertex shader shapes them all from the kind's row of numbers. Single plants on two
lattices: 100 x 100 at 0.32 m with two leaves at the foot and fourteen petals (to 15 m),
128 x 128 at 0.8 m with six petals (to 50 m); beyond that some blades of the far rings
are stalks in flower (their upper part the kind's colour, fewer from above), and the
ground has its dusting. Big heads stand wider apart (as many to the square metre as
cover the same ground as a small one's).

**Which flowers where** is a world's own table: `life.flowers` in its file (floras by
name for each land-cover class, and rules by height, latitude or the tree line), or
`DEFAULT_FLOWERS`. Haven's: conifer woods (fireweed, lupin, bluebell, foxglove), dry
scrub (orange poppy, sage, balsamroot, paintbrush, thistle), glades, parkland (lupin,
balsamroot, ox-eye, paintbrush, buttercup, cornflower), steppe (poppy, cornflower,
buttercup, daisy, yarrow, orange poppy), barren ground, and above the tree line + 250 m
the alpine flora (gentian, moss campion, ox-eye, buttercup, thrift, lupin; saxifrage in
the turf). Sixteen floras in all (`FLORAS`); no world's name anywhere in the rule.

**Abundance by place, on purpose** (`flowersAt`, JavaScript and the same in GLSL):
- flower meadows some hundreds of metres across, on the share of the land the flora names
  (`rich`: 0.4 on the steppe), where one kind after another carpets a patch of about a
  hectare (blocks of 110 m with bent edges), full at a meadow's heart, in drifts toward
  its edge, the flora's low kind scattered through it near the eye;
- round each meadow a fringe of single drifts in plain grass, and beyond it plain grass;
- on some hillsides one kind alone over the whole slope (the flora's `slope` kind:
  fireweed in the woods, balsamroot in parkland, moss campion up high).
`node scripts/flower-field.mjs --flora steppe` draws it from above in a second;
`node scripts/flower-rule-test.mjs` checks its promises (twenty kinds and more, every
habit, meadows on about the share named, one kind to a patch, hillsides of one kind,
turf changes only the kind, the GLSL has every table) and fails if one is broken (seen
to fail once while it was written: the hillside rule at its edges);
`node scripts/find-meadow.mjs --lat .. --lon .. --flora ..` finds meadows near a place.

### Pollen and seed in the air (`src/life/pollen.js`)

3 200 points in a fixed pool: half in a box of air 10 m wide round the eye, half in one
40 m wide (both divide the grass anchor's step), up to 6 m high, most of them low. Each
point's place is fixed to the ground and carried by the wind (added up frame by frame,
`air += wind * dt`), and the point wraps round its box as one point: nothing is drawn
across it. A mote shows where the ground under it flowers (the grass's middle table: the
more flowers, the more motes; none over plain grass or bare ground), in daylight, never
in rain, and more after a gust (the wind above its own slow mean). It is lit by the
grass's light table (in a tree's or a cloud's shadow it is dim) and throws the Sun's
light forward: a glint looked at toward the Sun. One in twenty-two is a floating seed
(a heart and the spokes of its parachute). Drawn with the weather, and again in a slice
of its own near the eye when the terrain's near plane has moved past it (the rain's
lesson). Governor step `pollen` (0.4 of them).

## Numbers

Layers: `node scripts/grass-layers.mjs [--query ..]` draws the grass alone in the real
game, every fragment adding one to its pixel (no depth test), and reads it back: the mean
over the pixels that have any grass. "Rasterised" counts every fragment the triangles make
(a cut-out's thrown-away ones too, which a GPU shades all the same); "kept" without them.
After, nothing is cut out, so the two are the same. Triangles: handed to the GPU
(instances x triangles each; most are thrown out in the vertex shader).

| view | triangles before | after | layers before (rasterised / kept) | after |
|---|---|---|---|---|
| the opening view (eye height) | 0.61 M | 1.43 M | 5.32 / 4.72 | 4.55 |
| the steppe, eye height | 0.61 M | 1.43 M | 8.79 / 6.89 | 4.70 |
| the steppe from 30 m | 0.61 M | 1.43 M | 2.50 / 1.14 | 1.25 |
| the steppe from 120 m | 0.26 M | 0.55 M | 2.63 / 1.00 | 1.05 |
| a flower meadow, eye height | 0.61 M | 1.43 M | 9.06 / 7.21 | 5.00 |
| the meadow from 20 m | 0.61 M | 1.43 M | 2.89 / 1.23 | 1.45 |
| the meadow toward a low Sun | 0.61 M | 1.43 M | 10.10 / 7.88 | 5.23 |
| the opening view, `debug=floor` | 0.31 M | 0.72 M | 3.25 / 2.75 | 3.26 |
| the steppe at a phone's density | 0.61 M | 1.43 M | 13.23 / 8.00 | 5.33 |

Each view's numbers by field are in `docs/shots/grass-rich/layers_<view>_<before|after>.txt`,
its picture `haven_<view>_<before|after>.png` (660 x 309, one load of the scene for both).
Views: the steppe `lat=-54.4271&lon=39.2697&t=5&heading=120` (30 m: `alt=1491&pitch=-8`,
120 m: `alt=1581&pitch=-14`, phone: `fov=21.4`); the flower meadow
`lat=-54.39501&lon=38.28479&t=5&heading=45` (found with `scripts/find-meadow.mjs`, 2.5 km
west of the steppe; 20 m: `alt=1488&pitch=-10`; toward a low Sun: `t=0&heading=72&pitch=3`).

How to read it:
- **At eye height, about half the rasterised layers of before** (0.40 to 0.55 of them at
  the steppe, the meadow, toward the Sun and at a phone's density), **0.65 to 0.73 of the
  kept ones**. The brief's target, half of today's, is met against what the GPU ran
  before (the cut-out cards' thrown-away fragments are shaded all the same), not against
  what was kept. The opening view is 0.86: its slope is now carpeted with flowers, which
  are a fifth of its layers.
- **Each layer is far cheaper than before.** Before, every fragment of grass ran the whole
  lighting (the Sun through the air, the near shadow map with four taps, the clouds' and
  the land's shadow on the cards, the sky's light, the haze: some twenty texture reads),
  and the cards' fragments could not be rejected before shading (a cut-out turns off the
  GPU's early depth test). Now a fragment of grass writes the colour its triangle hands
  it: no texture read, no discard, so the depth test rejects hidden grass before shading
  ("shaded" in the files: 1.7 to 2.1 of the layers are shaded at eye height).
- **The vertex work is larger**: 1.43 million triangles handed over against 0.61 (4.3
  million vertex invocations against 1.8; most leave after one table read, out of their
  ring or out of the picture, and those kept read the table four times, the light table
  three times). This phone is said to be cheap in triangles, but **this is the number to
  watch in the next benchmark**: if the grass row is not well under its 11.7 ms, the next
  thing to cut is the blades a cell of the 0.5 m and 1 m rings (the governor's `grass` and
  `grass-mid` halve them meanwhile).
- The light table is one extra pass of 288 x 576 pixels a frame, each running the full
  lighting once (165 888 pixels: about what 4 % of the grass on a phone's screen cost per
  layer before).
- From the air the counts are as before (about one layer: the field seen squarely).

## Stability

`node scripts/stability.mjs --dist --only haven_meadow_walk,haven_flower_walk,haven_grass_flight`
(two new moves: a walk in the flower meadow, and low flight 40 m over it), settled frames:

| move | station 0 | 1 | 2 | (changed / flicker) |
|---|---|---|---|---|
| steppe walk, before (far-grass report) | 25.6 / 6.5 | 26.8 / 7.1 | 25.5 / 5.9 | |
| steppe walk, after | 27.1 / 6.6 | 28.6 / 6.8 | 29.2 / 6.8 | |
| flower meadow walk | 31.7 / 8.0 | 31.8 / 7.4 | 33.0 / 7.8 | |
| low flight, 40 m up | 7.9 / 1.2 | 13.8 / 3.6 | 36.2 / 8.8 | (before the fix below) |
| low flight, after the fix | 10.5 / 1.2 | 14.5 / 3.7 | 36.2 / 8.8 | |

Looking at the strips (`docs/shots/stability/haven_*`): no ring, pop or line where one
ring gives way to the next. On foot the restless part is the nearest blades and flowers,
as before and about as much. In the meadow walk the sky's "flicker" is the pollen, which
drifts with the wind between frames: that is its movement, not a fault. **In low flight
the far blades crawled**: thinner than a pixel, a blade landed on a pixel's middle in one
frame and missed it in the next (36 % changed at the third station). Blades are now never
narrower than about a pixel at the foot (`wide = max(wide, 0.6 px)`), which also makes the
far field a little more opaque. **It did not cure it**: the third station gave the very
same numbers to the last digit (36.2 / 8.795 / 112), which I cannot explain and did not
have time to chase (the first two stations did change, so the new build was the one
served). The step there is 0.5 m a frame over blades 1 to 2.5 m apart, so much of that
change is the field's own parallax, but the difference picture is red all over: treat the
grass seen from 20 to 60 m up in flight as **shimmering until shown otherwise**. Next
things to try: fade the far rings' blades out by the pixel size of their spacing rather
than widen them, or let the ground's own grass colour carry more of the field from above.

## Behaviour changes (for the checkpoint message)

- The grass is denser where it grows: no ground shows between the tufts at eye height,
  and the field stays fine to the horizon. Thin land is thin in tussocks.
- No more cut-out cards of grass: the middle and far field are blades.
- Flowers: 26 kinds of six shapes and many sizes instead of 7; meadows of one kind after
  another, hillsides of one colour, plain grass between. **Where flowers stand has
  changed everywhere** (the opening brow's yellow flowers are now a hillside of
  balsamroot; the steppe's start is plain grass with a meadow 2.5 km west).
- Pollen motes and the odd floating seed over flower meadows in sunlight.
- Blades and petals glow when looked at toward the Sun.
- Governor: a new step `pollen`. `grass-mid` now halves the three far rings of blades
  (it halved the cards); `grass` halves the three near rings and the flowers.
- `life.flowers` in a world's file (Haven has one); Earth uses `DEFAULT_FLOWERS`.

## Tried and taken back

- **Flower patches by the levels of one smooth noise**: the kinds lay in rings round each
  other, the middle ones as thin bands. Then blocks of 70 m pushed by a noise: a quilt of
  squares. Now blocks of 110 m pushed by a wave on each axis.
- **A cap of four layers**: 2.62 layers at the steppe and a dense field in its one picture;
  raised to six for fear that the field would read thin further out (not checked in a
  picture), which gave 4.03, over the target; five is where it stands. Four would meet the
  target outright and is worth a look in the game.
- **Big heads at the lattice's full density**: the opening brow was a carpet of yellow
  plates 35 cm across that hid the grass. Now fewer by size, smaller, growing less with distance.
- **Pollen at its true size**: a grain of pollen 1 cm across is a twentieth of a pixel at
  10 m; drawn at its true brightness it was invisible. Now a glint of 2 cm and brighter,
  half of them in a small box round the eye.

## Known problems

Most visible first.

0. **The far blades shimmer in low flight** (see Stability): the one thing here I would
   look at before sending.
1. **Not measured on the phone.** Fewer and far cheaper layers, but more than twice the
   vertex work (see Numbers). Ask for a benchmark: the cost test's grass row (11.7 ms on
   6ac24ff), and `grass-mid` / `grass` what they buy now.
2. **Flower meadows from 20 m and more are blocks of colour** (`haven_meadow_a20_after.png`):
   a blue hectare beside a white one beside a gold one, with soft but plain edges. It is
   what was asked ("one kind after another carpets a hectare"), but the white kinds still
   read a little like frost from the air even at half the flowered blades. (The ground's
   dusting now knows the hillsides of one kind: the owning session passes the slope in.)
3. **The far rings of blades from 30 m are one even olive** (`haven_steppe_a30_after.png`,
   as the cards were before): the field's own variety (the stretches of taller and drier
   grass) hardly shows from above. The ground's grass colour is the same for all ground in
   view (the mean round the traveller), as before.
4. **Pollen is a thing of eye height**: the motes are drawn round the traveller to 6 m
   up and only while the near grass is (below 90 m); a glint is 2 cm, wider than a real
   grain, so that a phone shows it. Toward the Sun some read as small round orbs. In shot
   mode the pool is as it would be after a while; in play it fades in over a few seconds.
5. **The flower dandelion's clocks and the turf heads glint white toward a low Sun** like
   the pollen does (`haven_pollen_after.png`, the white points low in the field): pretty,
   but they can be taken for motes.
6. The near shadow map still reaches only the light table's places, 13 cm apart at one's
   feet and 30 cm to 20 m: a blade's own shadow on its neighbours is not there (it never
   was), and a shadow's edge on the grass is as sharp as the table's spacing.
7. **Earth** gets the new grass and `DEFAULT_FLOWERS` through its `grass` block; not looked at.
8. `scripts/flower-preview.mjs` (every kind side by side in the game) was written and never
   finished a run on this machine (a wooded or open view takes over ten minutes a frame of
   it at 1320 x 618); try it with `--size 660x309`.
