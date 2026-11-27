# The ground's shading on the phone: report (brief: `ground-cost.md`)

## 1. What a pixel of the ground reads (before any cut, commit 6b91d81 merged)

Counted by the shader itself: `scripts/ground-cost-run.sh <dir> --only ledge,air300,air3k --tiers
--frames 1 --size 880x412 --dsf 2.2` builds the fragment shader again with a counter in every
texture read (by the map and by the kind of read), every noise (`flNoise`: eight integer hashes)
and every loop, and a flag at the head of each block only some pixels enter. The ground alone,
at the phone's pixel count (1936 x 906). Counts are true on any device; they do not say what a
read costs there. "Long footprint": `textureGrad` on a map with four taps along the long side
(up to four times a plain read's work on a GPU). The vertex stage's reads are not in it.



### Haven, the opening view (1936 x 906; ground on 59 % of the picture)

| ground | share of the ground's pixels | reads a pixel | detail tile, plain | detail tile, long footprint | the patch's normal and shadow | the land's colour maps | strata, far relief | light, shade, air | noises | loop turns | share of all reads |
|---|---|---|---|---|---|---|---|---|---|---|---|
| all of it | 100.0 % | 16.7 | 4.3 | 3.0 | 2.9 | 1.0 | 2.0 | 3.5 | 1.9 | 14.7 | 100 % |
| under 30 m | 48.1 % | 15.3 | 5.0 | 2.1 | 2.0 | 1.0 | 0.3 | 5.0 | 2.9 | 20.8 | 44 % |
| 100 to 300 m | 7.1 % | 19.0 | 6.5 | 4.3 | 3.4 | 1.0 | 1.8 | 2.0 | 3.2 | 6.6 | 8 % |
| 300 m to 1 km | 18.3 % | 17.6 | 4.8 | 4.2 | 4.0 | 1.0 | 1.5 | 2.0 | 1.1 | 5.6 | 19 % |
| 1 to 3 km | 9.4 % | 19.1 | 2.7 | 3.8 | 4.0 | 1.0 | 5.6 | 2.0 | 0.2 | 13.2 | 11 % |
| 3 to 10 km | 12.4 % | 17.8 | 1.8 | 3.5 | 3.6 | 1.0 | 5.6 | 2.4 | 0.1 | 11.5 | 13 % |
| 10 to 30 km | 3.9 % | 16.3 | 2.8 | 2.0 | 3.6 | 1.1 | 4.0 | 2.7 | 0.0 | 11.0 | 4 % |
| beyond 30 km | 0.8 % | 15.1 | 1.0 | 1.7 | 4.0 | 1.0 | 5.3 | 2.1 | 0.7 | 11.0 | 1 % |

By block (a pixel is in several):

| block | share of the ground's pixels | reads a pixel | detail tile, plain | detail tile, long footprint | the patch's normal and shadow | the land's colour maps | strata, far relief | light, shade, air | noises | loop turns | share of all reads |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canopy | 32.5 % | 18.3 | 5.0 | 4.0 | 3.8 | 1.0 | 2.4 | 2.1 | 1.4 | 7.9 | 36 % |
| floor | 69.4 % | 16.6 | 5.3 | 2.7 | 2.5 | 1.0 | 0.9 | 4.1 | 2.6 | 16.8 | 69 % |
| grass | 55.5 % | 16.0 | 5.4 | 2.3 | 2.2 | 1.0 | 0.5 | 4.6 | 3.2 | 19.5 | 53 % |
| flowers | 32.4 % | 16.7 | 5.6 | 2.6 | 2.4 | 1.0 | 0.8 | 4.4 | 5.1 | 19.9 | 32 % |
| patches | 23.2 % | 17.6 | 4.1 | 3.5 | 3.8 | 1.0 | 2.8 | 2.3 | 1.3 | 9.4 | 25 % |
| broad | 5.0 % | 20.5 | 7.2 | 4.5 | 3.7 | 1.0 | 2.1 | 2.1 | 5.1 | 8.9 | 6 % |
| swaths | 5.0 % | 20.5 | 7.2 | 4.5 | 3.7 | 1.0 | 2.1 | 2.1 | 5.1 | 8.9 | 6 % |
| water | 2.6 % | 19.9 | 5.1 | 2.2 | 4.0 | 1.0 | 4.0 | 3.6 | 0.0 | 11.0 | 3 % |
| strata | 44.8 % | 18.3 | 3.8 | 3.9 | 3.6 | 1.0 | 3.6 | 2.4 | 1.5 | 10.5 | 49 % |
| snow | 0.8 % | 15.7 | 1.0 | 2.4 | 3.7 | 1.0 | 5.6 | 2.0 | 2.0 | 11.0 | 1 % |
| relief | 26.4 % | 18.0 | 2.3 | 3.4 | 3.7 | 1.0 | 5.4 | 2.3 | 0.2 | 12.0 | 29 % |
| litter | 57.9 % | 16.0 | 5.2 | 2.4 | 2.3 | 1.0 | 0.5 | 4.5 | 2.9 | 18.3 | 55 % |
| planes | 22.1 % | 18.1 | 2.0 | 3.6 | 3.7 | 1.0 | 5.6 | 2.1 | 0.2 | 12.2 | 24 % |
| cloud | 21.6 % | 17.7 | 1.9 | 3.3 | 3.7 | 1.0 | 5.4 | 2.4 | 0.1 | 11.4 | 23 % |

Reads a pixel, spread: 10: 0.0 % · 11: 0.0 % · 12: 0.0 % · 13: 0.2 % · 14: 4.9 % · 15: 44.2 % · 16: 7.5 % · 17: 9.3 % · 18: 16.8 % · 19: 3.7 % · 20: 5.6 % · 21: 3.8 % · 22: 1.7 % · 23: 1.5 % · 24: 0.4 % · 25: 0.4 % · 26: 0.0 % · 27: 0.0 %


### Haven from 300 m up (1936 x 906; ground on 68 % of the picture)

| ground | share of the ground's pixels | reads a pixel | detail tile, plain | detail tile, long footprint | the patch's normal and shadow | the land's colour maps | strata, far relief | light, shade, air | noises | loop turns | share of all reads |
|---|---|---|---|---|---|---|---|---|---|---|---|
| all of it | 100.0 % | 18.6 | 4.1 | 3.9 | 3.9 | 1.0 | 3.7 | 2.1 | 1.5 | 10.6 | 100 % |
| 300 m to 1 km | 38.1 % | 18.3 | 5.7 | 4.2 | 4.0 | 1.0 | 1.4 | 2.0 | 2.8 | 7.0 | 37 % |
| 1 to 3 km | 36.6 % | 19.7 | 3.9 | 3.9 | 4.0 | 1.0 | 5.0 | 2.0 | 0.9 | 13.3 | 39 % |
| 3 to 10 km | 21.1 % | 17.9 | 1.7 | 3.5 | 3.7 | 1.0 | 5.6 | 2.3 | 0.3 | 12.1 | 20 % |
| 10 to 30 km | 3.0 % | 16.3 | 2.7 | 2.1 | 3.6 | 1.1 | 4.0 | 2.8 | 0.0 | 11.0 | 3 % |
| beyond 30 km | 1.2 % | 14.9 | 1.1 | 1.8 | 4.0 | 1.0 | 4.9 | 2.2 | 0.6 | 11.0 | 1 % |

By block (a pixel is in several):

| block | share of the ground's pixels | reads a pixel | detail tile, plain | detail tile, long footprint | the patch's normal and shadow | the land's colour maps | strata, far relief | light, shade, air | noises | loop turns | share of all reads |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canopy | 72.6 % | 19.2 | 5.1 | 3.9 | 3.9 | 1.0 | 3.0 | 2.2 | 1.9 | 10.5 | 75 % |
| floor | 46.8 % | 20.6 | 6.3 | 4.1 | 4.0 | 1.0 | 3.1 | 2.1 | 2.9 | 11.0 | 52 % |
| grass | 23.7 % | 20.4 | 7.5 | 4.1 | 4.0 | 1.0 | 1.8 | 2.0 | 5.4 | 10.9 | 26 % |
| flowers | 19.3 % | 20.3 | 7.5 | 4.1 | 4.0 | 1.0 | 1.7 | 1.9 | 6.0 | 11.1 | 21 % |
| patches | 53.3 % | 18.1 | 4.4 | 3.8 | 3.9 | 1.0 | 2.8 | 2.2 | 2.2 | 10.5 | 52 % |
| broad | 22.8 % | 20.1 | 6.5 | 4.2 | 4.0 | 1.0 | 2.4 | 2.1 | 5.1 | 11.2 | 25 % |
| swaths | 22.7 % | 20.1 | 6.6 | 4.2 | 4.0 | 1.0 | 2.4 | 2.1 | 5.1 | 11.2 | 25 % |
| water | 0.6 % | 20.7 | 5.7 | 2.5 | 4.0 | 1.0 | 3.8 | 3.8 | 0.0 | 11.5 | 1 % |
| strata | 71.7 % | 19.4 | 4.0 | 4.0 | 3.9 | 1.0 | 4.3 | 2.0 | 1.4 | 10.5 | 74 % |
| snow | 1.7 % | 16.1 | 1.2 | 2.3 | 3.9 | 1.0 | 5.7 | 2.0 | 2.0 | 11.0 | 1 % |
| relief | 56.5 % | 19.0 | 2.8 | 3.6 | 3.9 | 1.0 | 5.5 | 2.2 | 0.4 | 13.2 | 58 % |
| litter | 5.1 % | 20.0 | 6.6 | 4.4 | 4.0 | 1.0 | 2.0 | 2.0 | 2.2 | 5.7 | 5 % |
| planes | 54.0 % | 19.1 | 2.9 | 3.7 | 3.9 | 1.0 | 5.5 | 2.2 | 0.4 | 13.2 | 55 % |
| cloud | 34.7 % | 18.1 | 2.0 | 3.4 | 3.8 | 1.0 | 5.5 | 2.4 | 0.3 | 12.3 | 34 % |

Reads a pixel, spread: 8: 0.0 % · 9: 0.0 % · 10: 0.0 % · 11: 0.1 % · 12: 0.0 % · 13: 0.6 % · 14: 8.2 % · 15: 2.8 % · 16: 10.2 % · 17: 8.7 % · 18: 24.4 % · 19: 7.6 % · 20: 9.5 % · 21: 11.0 % · 22: 8.8 % · 23: 4.9 % · 24: 2.1 % · 25: 0.6 % · 26: 0.3 % · 27: 0.0 % · 28: 0.0 % · 29: 0.0 %


### Haven from 3 km up (1936 x 906; ground on 57 % of the picture)

| ground | share of the ground's pixels | reads a pixel | detail tile, plain | detail tile, long footprint | the patch's normal and shadow | the land's colour maps | strata, far relief | light, shade, air | noises | loop turns | share of all reads |
|---|---|---|---|---|---|---|---|---|---|---|---|
| all of it | 100.0 % | 18.8 | 2.3 | 2.9 | 3.6 | 1.0 | 5.0 | 4.1 | 0.4 | 11.8 | 100 % |
| 3 to 10 km | 61.2 % | 19.0 | 2.0 | 3.2 | 3.5 | 1.0 | 5.3 | 4.0 | 0.5 | 12.2 | 62 % |
| 10 to 30 km | 33.9 % | 19.0 | 2.8 | 2.4 | 3.8 | 1.1 | 4.5 | 4.4 | 0.3 | 11.2 | 34 % |
| beyond 30 km | 4.9 % | 15.8 | 1.2 | 1.9 | 3.9 | 1.0 | 4.5 | 3.3 | 0.6 | 11.0 | 4 % |

By block (a pixel is in several):

| block | share of the ground's pixels | reads a pixel | detail tile, plain | detail tile, long footprint | the patch's normal and shadow | the land's colour maps | strata, far relief | light, shade, air | noises | loop turns | share of all reads |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canopy | 35.7 % | 20.4 | 3.7 | 2.8 | 3.2 | 1.0 | 4.4 | 5.3 | 0.1 | 13.4 | 39 % |
| floor | 11.7 % | 22.5 | 5.2 | 2.7 | 3.4 | 1.1 | 4.7 | 5.3 | 0.2 | 13.6 | 14 % |
| patches | 67.4 % | 19.1 | 2.7 | 2.8 | 3.6 | 1.0 | 4.5 | 4.5 | 0.4 | 12.1 | 69 % |
| broad | 13.5 % | 18.7 | 1.8 | 3.5 | 3.7 | 1.0 | 5.2 | 3.5 | 1.2 | 11.8 | 13 % |
| water | 7.1 % | 22.3 | 5.3 | 2.5 | 3.9 | 1.1 | 4.0 | 5.5 | 0.0 | 11.1 | 8 % |
| strata | 49.2 % | 18.7 | 1.5 | 3.1 | 3.7 | 1.0 | 6.0 | 3.4 | 0.7 | 11.5 | 49 % |
| snow | 15.3 % | 17.6 | 1.1 | 2.6 | 3.9 | 1.0 | 5.7 | 3.2 | 2.1 | 11.0 | 14 % |
| relief | 99.7 % | 18.8 | 2.3 | 2.9 | 3.6 | 1.0 | 5.0 | 4.1 | 0.4 | 11.8 | 100 % |
| planes | 80.7 % | 18.9 | 2.2 | 3.0 | 3.5 | 1.0 | 5.2 | 4.1 | 0.5 | 12.0 | 81 % |
| cloud | 100.0 % | 18.8 | 2.3 | 2.9 | 3.6 | 1.0 | 5.0 | 4.1 | 0.4 | 11.8 | 100 % |

Reads a pixel, spread: 9: 0.0 % · 10: 0.0 % · 11: 0.1 % · 12: 0.1 % · 13: 0.3 % · 14: 0.5 % · 15: 6.4 % · 16: 8.3 % · 17: 15.9 % · 18: 18.4 % · 19: 15.9 % · 20: 8.5 % · 21: 11.7 % · 22: 6.1 % · 23: 4.8 % · 24: 1.6 % · 25: 0.8 % · 26: 0.2 % · 27: 0.2 % · 28: 0.1 % · 29: 0.1 % · 30: 0.1 %
ALLDONE

(The proxy's times for the same three: the shading 4 584, 3 172 and 2 090 ms; software WebGL,
a count of work.)

### Reading it


- **No tier is cheap and none stands out: 15 to 20 reads on every pixel at every distance**
  (the earlier work's "7 to 11 at 400 m, 10 to 11 at 3 km" does not hold in the game as it is
  now). The weight is where the pixels are: from the air all of it is ground beyond 300 m; at
  the opening view half the ground's pixels are within 30 m, and on the phone the grass is
  drawn over those (the benchmark: grass and flowers -8.8 ms), so there too what is paid is
  the ground from 100 m on.
- **The patch's own two maps are read twice on nearly every pixel beyond 100 m** (3.5 to 4.0
  where 2 would do): the blend toward the parent patch, meant for the stretch where a patch
  hands over, is taken almost everywhere.
- **The far relief: 4 reads and the eight-raster loop on 26 % of the opening view's ground,
  57 % from 300 m, all of it from 3 km** (two reads each of the slope map's east and north
  halves, at two levels).
- **The strata: 2 reads on 45 to 72 % of the ground**, though rock and scree are a small part
  of these views.
- **The detail tile with a long footprint: 3 to 4 beyond 300 m**: the land's painted patches
  (2, on 23 to 67 %) and the tail of the two close-up layers, read out to where the sampler
  is at its last level but one.
- The cloud's shade per pixel on coarse patches: 2 more reads on a third of the ground from
  300 m and on all of it from 3 km.
- Near by (under 30 m, the opening view): 21 loop turns a pixel (the eight leaf-trees' loop
  on 58 % of the ground at the opening place, which is a meadow; the flowers' kinds; the
  shadow's taps) and 3 noises.

**Where the cuts go, in this order**: (1) the parent's maps only where a patch hands over:
up to 2 of 19 reads on most pixels; (2) the far relief from one read a level (east and
north in one texel) and its raster loop off the pixel: 2 reads and the loop; (3) the strata
only where rock shows; (4) the close-up layers' tail given up where what is read is the
mean to within a level; (5) the leaf-trees' loop only in a wood. Then the baked far ground
(the brief's point 3) if the phone still asks.

## 2. The first cuts (reads that had no weight)

All in `src/terrain/terrainMaterial.js` (blocks marked `[ground cost]`), and the relief
map's loading in `src/terrain/terrain.js`. The cloud's shade (`tCloudShade`) is not touched.

1. **The patch's maps or its parent's, not both.** A patch is drawn out to twice the distance
   at which its blend toward the parent is complete, so on 74 to 82 % of the ground beyond
   300 m (counted: `--tiers`, the "why" lines) the parent's normal and shadow were the whole
   answer and the patch's own two were read and weighted nought. Each is read now only where
   it has weight (under 0.4 % of the other left out at either end).
2. **The far relief from two reads, not four.** The slope map's file keeps its east and north
   halves (one grey JPEG); on the GPU they are one texel, east in red and north in green
   (`Terrain.loadReliefMap` packs them when the world loads, half at a time; the same memory).
3. **The close-up layers' tail.** The two close-up detail layers were read out to where a
   sampler answers with the texture's last level (a pixel eight repeats long). From where a
   pixel is one repeat long what it answers is the 4 x 4 and 2 x 2 levels, hundredths about
   the mean: it fades to the mean by two repeats and nothing is read beyond.
4. **The strata only where they can be seen.** Scree takes a third of the bands and nearly
   all gentle ground is a few hundredths scree: both reads only where the bands change the
   colour by more than 0.4 %, the fine bands (a thirtieth of the colour on Haven) by the same
   test on their own; a world without strata reads nothing.
5. The far canopy's broad blob and the glade's tone were second reads of the detail tile at
   the place its first read has already (`d0`): one read less on every pixel of far wood.

**The count** (reads a pixel, the ground alone at 1936 x 906; before -> after):

| view | reads a pixel | the patch's maps | strata and far relief | detail tile, long footprint | detail tile, plain |
|---|---|---|---|---|---|
| the opening view | 16.7 -> 14.7 | 2.9 -> 2.3 | 2.0 -> 1.3 | 3.0 -> 2.6 | 4.3 -> 4.0 |
| from 300 m | 18.6 -> 14.3 | 3.9 -> 2.4 | 3.7 -> 2.4 | 3.9 -> 3.0 | 4.1 -> 3.3 |
| from 3 km | 18.8 -> 14.6 | 3.6 -> 2.6 | 5.0 -> 2.9 | 2.9 -> 2.0 | 2.3 -> 1.9 |

At the opening view the ground beyond 300 m (what the grass does not hide) went from 17.6
to 19.1 reads a pixel to 15 or under.

**The pictures** (the ground alone at 1936 x 906, before above, after in the middle, the
difference times eight below): `docs/shots/ground-cost/cut1_<ledge|air300|air3k>_<morning|noon>.jpg`.
Against the pictures of the shader before, taken in a run of their own: **0.00 % of the
pixels over 2 levels in all six**; largest difference 2 to 3 levels in the morning, 3 to 6 at
noon; mean 0.01 to 0.28.

**The proxy** (software WebGL; a count of work, never a frame rate; before -> after, ms):
morning 4 584 -> 3 899, 3 172 -> 2 680, 2 090 -> 1 770 (85, 84, 85 %); noon 4 484 -> 4 089,
3 322 -> 3 101, 1 854 -> 1 865 (91, 93, 101 %). It moves less than the count and at noon
from 3 km not at all: it runs both sides of a branch wherever a 2 x 2 block of pixels is
divided, and weighs a long-footprint read far above the others. The count is the measure;
the phone's next benchmark the judge.

Not done yet toward "a third": the sky's light as far as it does not hang on the surface's
normal goes to the vertices next (one read on every pixel from 3 km up, one to two on every
pixel of wood). What is then left from the air, a pixel: the patch's maps 2.5, the land's
colour 1, the detail tile 4 to 6 (its first read, the canopy's, the floor's two, the painted
patches' two with a long footprint), relief and strata 2.5 to 3, the sky's light 1, **and the
cloud's shade: 2 on every pixel of a patch wider than 800 m, which from 3 km is all of
them** (the sky helper's part).
