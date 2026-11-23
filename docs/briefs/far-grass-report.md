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
- The ground's grass colour reaches 2.5 km instead of 900 m.
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
  bright scales on a dark slope. Far clumps now take the light of their slope.
- The brief's place for the aerial views (over the opening ledge) looks at forest, as did
  "eastshore". The grass pictures are from open steppe found by a search
  (`lat=-54.4271&lon=39.2697&heading=120`, ground at 1 461 m): names `steppe_*`.

## Pictures (`docs/shots/far-grass/`, `_before` and `_after`)

PICTURES

## Stability

STABILITY

## Known problems

PROBLEMS
