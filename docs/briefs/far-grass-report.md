# Report: grass with no end to it

*For the session that owns `ccr-aa39490a-qiw63x`. Branch `ccr-aa39490a-far-grass` (it has
that branch merged in, far forest and all). Brief: `docs/briefs/far-grass.md`.*

## What was built, and where

Grass is now three things, each giving way to the next over a stretch of distance
(`docs/ARCHITECTURE.md`, "Grass and flowers", has the full account):

1. **Blades** as before (`src/life/grass.js`), to 34 m; flowers on stems to 20 m.
2. **Clumps**: three new lattices of cards (two triangles each), from 13 m out to 520 m.
   A card is a cut-out of many blades from a picture made by rule at start-up
   (`makeClumpPicture`, 256 x 64, its mip maps made on the CPU; no artwork from outside,
   and not the trees' atlas: it needed its own cover, tone and flower-head channels).
   Cards face the eye with a turn of their own, lean back when looked down on, are taller
   and wider with distance, and grow from nothing where their field comes in.
3. **The ground's own grass** (`src/terrain/terrainMaterial.js`, one block at
   `uGrassTone`): full to 600 m, fading into the map's colour by 2.5 km (was 180 to
   900 m). The wind's waves run over it (the same waves the blades bow to, one uniform
   `uGrassWave`), and the flowers' drifts show as a dusting. **No sampler was added**: the
   flowers on the ground are the flower rule itself in GLSL (integer hash noise), and the
   fragment shader is still at 16 of 16.

`src/life/grassRules.js` (new) holds what the grass and the ground must agree on, written
once: grass by land cover, the floras, `flowersAt` in JavaScript and bit for bit the same
in GLSL, the grass's colour, the waves.

The tables of the ground are three now (64 x 64 at 1.25 m, 128 x 128 at 4 m, 128 x 128 at
10 m), wrapping, nearest places first, 300 places a frame (all at once in screenshot
mode, so `busy` ends: every picture of the set finished).

The plane everything stands on used to be laid afresh when the traveller had gone 250 m,
and with it every tuft changed (a pop over the whole field in flight). It now steps 40 m
at a time with its axes carried along, and every spacing divides 40 m: nothing changes at
a step. The shaders take off the world's curve (on Haven the ground is 0.7 m under the
plane at 600 m).

Small edits to shared files, each in one place: `src/app.js` (one line: screenshot mode
fills the tables at once), `src/perf/governor.js` (one step), `src/worlds/haven.js`
(`grass.mid`), `src/terrain/terrainMaterial.js` (the grass block, two includes, one
uniform), `scripts/stability.mjs` (one move).

## Numbers

| | instances | triangles each | at most |
|---|---|---|---|
| blades near (128 x 128 tufts, 8 blades) | 16 384 | as before per tuft | as before |
| blades far (144 x 144, 7 blades) | 20 736 | as before | as before |
| flowers (108 x 108) | 11 664 | as before | as before |
| clumps 0.8 m (200 x 200) | 40 000 | 2 | 80 000 |
| clumps 2 m (200 x 200) | 40 000 | 2 | 80 000 |
| clumps 5 m (220 x 220) | 48 400 | 2 | 96 800 |

The clumps add 128 400 instances, 256 800 triangles at most, in three draw calls. Those
outside the view, outside their ring or on ground without grass are thrown out in the
vertex shader (out of the picture, not given no size), so what reaches the pixels in a
level view is roughly a fifth of that. With the governor's step: half. Above 220 m over
the ground no clump is drawn, above 90 m no blade. What the phone pays is not known:
**it needs a benchmark** (the cost that worries me is not triangles but the cut-out
cards drawn over each other toward the horizon).

The near blade lattice went from 120 x 120 at 0.22 m to 128 x 128 at 0.2 m and the
flowers from 96 x 96 at 0.45 m to 108 x 108 at 0.4 m (spacings that divide 40 m):
a tenth more blades close by, the same reach.

## Governor

`grass-mid` ("thinner grass in the middle distance"), before `grass`: half the clumps,
the ones left 1.4 times wider. Nothing removes the grass; `debug=floor` is still a meadow
(`haven_ledge_steppe_floor_after.png`).

## Behaviour changes (for the checkpoint message)

- Grass and flowers to the horizon on Haven **and on Earth** (Earth's worlds file has a
  `grass` block; it gets the clumps and the ground's grass too; not looked at there).
- `uGrassTone` means something else now (x mean dryness, y share of ground that is grass,
  z flora, w strength); only the grass and the ground read it.
- The ground's grass colour reaches 2.5 km instead of 900 m, and stays up to 1.5 km over the ground (it used to go at 90 m).
- Blades take 70 % of their green-to-gold from the mean of the grass round the traveller (they took their own place's).
- Near blades a tenth denser; flowers on stems placed by exactly the rule they had (the
  opening brow keeps its yellow flowers).
- The grass no longer changes all at once every 250 m of travel.

## Tried and taken back

- **Clumps square to the eye**: from 30 m up they were a hatching of level strokes. Each
  now has a turn of its own and leans back when seen from above.
- **Flower heads on every clump in a drift, at full colour**: a red band along the
  skyline. Now fewer clumps carry heads far off and from above, and the ground only takes
  a tint (at most half).
- **The lie of the grass as sin x sin**: a chequerboard woven over the whole field from
  100 m up. Now two bent waves crossing at a slant.
- **Flowers on the far ground as the drift's smooth mean**: paint blobs with hard rims
  from 120 m. Now specks a metre across near, broken patches some metres across farther,
  the mean only where a patch is smaller than a pixel.
- **Clumps lit as level ground** (as the blades are): on a hillside turned from a low Sun,
  bright scales on a dark slope. Clumps from 12-45 m on take the light of their slope.
- **Grass coloured by its own place's dryness alone**: tied 70 % to the mean the ground
  is painted with, so a clump wears what the ground under it wears.
- **The ground's grass colour switched off with the clumps** above 220 m: the land went
  beige at once. It now stays to 1.5 km up and fades by 3 km.
- The brief's place for the aerial views (over the opening ledge) looks at forest, as did
  "eastshore". The grass pictures are from open steppe found by a search
  (`lat=-54.4271&lon=39.2697&heading=120`, ground at 1 461 m): names `steppe_*`.

## Pictures (`docs/shots/far-grass/`, `_before` and `_after`)

All 660 x 309 at `--dsf 1`, files `haven_<bookmark>_<name>_before|after.png`. "Steppe" is
the open grassland at `lat=-54.4271&lon=39.2697&heading=120`, midday (`t=5`).

| name | view | before | after |
|---|---|---|---|
| `ledge` | the opening view | yes | yes (build of 15:52; the dark patch ahead is the near pine's shadow, there without any grass code: `haven_ledge_ledge_owner_419c0ce_no_grass.png`, and gone with the trees' shadows out: `haven_ledge_ledge_no_tree_shadows.png`) |
| `sun` | toward the low Sun, a slope in shade | yes | yes (15:52 build) |
| `dusk` | dusk | yes | yes (14:36 build) |
| `noon_level` | opening place, midday, level | yes | not taken |
| `noon_down` | opening place, midday, down the slope | yes | yes (14:23 build) |
| `a15` | 15 m over the opening place | yes | not taken (it looks into forest) |
| `a60` | 60 m over it | yes | yes (first build, before the merge) |
| `a250` | 250 m over it | yes | yes (head) |
| `steppe_level` | steppe, eye level | yes | yes (14:36 build) |
| `steppe_a30` | steppe from 30 m | yes | yes (15:52 build) |
| `steppe_a120` | steppe from 120 m | yes | yes (head) |
| `steppe_tele` | steppe at a phone's pixel density (`fov=21.4`) | not taken | yes (13:00 build) |
| `steppe_low` | steppe, low Sun, toward it | not taken | yes (13:00 build) |
| `steppe_floor` | steppe from 30 m, `debug=floor` | not taken | yes (13:00 build) |

Not taken at all: the opening place at phone density and with `debug=floor` (forest fills
those views; the steppe ones stand in), and the steppe from 300 m. The pictures marked
with an older build predate the later colour and light changes (clumps lit by their
slope, grass tied to the ground's mix, tone from above); none of those changes what an
eye-level midday view shows much, but they are not retakes.

Draw calls and triangles handed to the GPU (before the vertex shader throws out what is
not in view), from the pictures' `haven_stats_*.json`:

| view | before | after |
|---|---|---|
| opening brow (`ledge`) | 111 calls, 953 000 | 135 calls, 1 450 000 (with the far forest and far rocks of the merged branch) |
| steppe, eye level | 31 calls, 836 000 | 39 calls, 1 170 000 |
| steppe from 30 m | 29 calls, 819 000 | 37 calls, 1 152 000 |
| steppe from 120 m | 24 calls, 376 000 | 32 calls, 676 000 |
| steppe from 30 m, `debug=floor` | not taken | 26 calls, 671 000 |
| 250 m over the opening place | 49 calls, 395 000 | 46 calls, 610 000 (no clumps drawn: the far forest's) |

The grass's own share of the difference is 6 draw calls and about 330 000 triangles on
the steppe (257 000 clump triangles and the denser near lattices).

## Stability

`node scripts/stability.mjs --dist --only haven_meadow_walk` (new move: a walk on the steppe,
5.5 cm a step, three stations 8.8 m apart; build of 15:52), settled frames:

| station | changed | flicker | largest change |
|---|---|---|---|
| 0 | 25.56 % | 6.54 % | 130 / 255 |
| 1 | 26.75 % | 7.13 % | 127 / 255 |
| 2 | 25.50 % | 5.93 % | 103 / 255 |

Strips: `docs/shots/stability/haven_meadow_walk_0..2.png`. Looking at them: no ring, no pop
and no line where one field gives way to the next; the middle and far grass shimmers a
little (grey in the difference picture); nearly all of the change and the flicker is in
the nearest blades and flowers (thin blades without anti-aliasing, flowers that shift
whole pixels per step). **Whether the near field was as restless before is not known**:
the same walk on the old build was not run (it was queued and dropped for time). Not run
either: `--streaming`, and every other move.

## Known problems

Most visible first.

1. **From about 100 m up the clump field still ends in a faint arc** some 500 m out
   (`haven_ledge_steppe_a120_after.png`, middle of the picture): inside it the ground is
   finely speckled, outside smooth. Evening the clumps' tone from above made it fainter,
   not gone. Next thing to try: fade the clumps out by how steeply they are looked down on,
   not only by distance.
2. **Toward a low Sun on a slope in shade** the blades of the nearest 30 m are bright gold
   on dark ground, as they were before; the clumps beyond now take the slope's light, so
   the change from bright to dark is a soft band 12 to 45 m out
   (`haven_sun_sun_after.png`). The blades would need the slope's light too.
3. **The flowers on the far ground from the air** are dusting and broken patches, but a
   drift of orange or white some 10 m across still reads as a blotch from 100 m.
4. **Nothing is measured on the phone.** 128 400 more instances in the vertex shader and
   cut-out cards over each other toward the horizon: ask for a benchmark. `grass-mid`
   halves them; if that is not enough the 0.8 m lattice is the one to coarsen.
5. **The walk test's near-field flicker** (above) has no baseline.
6. **Earth** gets all of this through its own `grass` block and was not looked at.
7. The ground's grass colour is the mean of the grass within 250 m of the traveller
   (`uGrassTone`), one value for the whole view: green meadows and gold steppe in one
   view both wear the mean. Blades and clumps follow it for 70 %.
8. Above 220 m the tables of the ground are still filled (for that mean) at 300 places a
   frame; in fast flight they lag and the mean is of ground a little behind.
9. `scripts/_partsout.mjs` and `_partsout2.mjs` are scratch scripts (how the dark patch
   on the opening brow was traced to the trees' shadow); keep or delete.
