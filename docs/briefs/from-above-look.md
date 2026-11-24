# Haven from above: what is not perfect (the look before any fix)

2026-11-24, build 61b7a8d (the far view as merged), headless, 660 x 309. The pictures are
in `docs/shots/from-above/`, `haven_ledge_<view>_before.png`; a view's name is
`<place>_<metres over the ground>_p<degrees looked down>` (`ledge`: the opening place,
`wood`: the north wood, `steppe`), `_phone`: at a phone's density (`fov=21.4`), `_floor`:
every saving of the governor on, `_clear`: with `debug=noclouds` (a new switch: see 12).
Taken with `scripts/from-above-shots.sh <frozen build> _before [view ...]`.

The times of day: the opening place in its first morning (the Sun low in the east, long
shadows, warm light), the north wood near midday (the Sun 59 degrees up), the steppe in
its afternoon (`t=5`).

## The list, most visible first

**Whose it is**: T the far trees' (this job), G the ground's (the owning session),
N the near trees' (the trees helper), R the far rocks'.

1. **Two forests lie over one another, in two colours** (T and G). The canopy the ground
   raises is shaded as crowns of its own, and takes 60 % of its colour from the land's
   colour map and the rest from the hour's light; the far trees standing out of it take
   their species' green and the far olive. Neither knows the other.
   - Morning, opening place (`ledge_300_p20`, `ledge_300_p60`, `ledge_1000_p60`,
     `ledge_100_p20`): the canopy is **gold scales** (mean 212, 172, 112 where lit) and the
     trees **green tufts** on it (112, 142, 113); in the mountain's shade the canopy is
     blue (79, 108, 122) and the trees paler than it.
   - Midday, north wood (`wood_300_p60`, `wood_1000_p60`): the canopy is a blue green
     (93, 142, 114) and the trees **olive-brown specks** on it.
   - At a phone's density (`ledge_300_p20_phone`) it is plainest: the hillside is orange
     domes with blue-violet gaps, a cobbled pavement, and dark green trees stand on it.
   - So a wood looked down on is a patterned ground with another pattern sprinkled over
     it, and which of the two is the warmer changes with the hour and the place.
2. **From above the trees are specks, not a wood** (T). The far forest thins by distance
   as (450 m / d)^2 and widens what it keeps by at most 1.5. That holds a wood together
   from the side, where rows stand behind rows. From above nothing stands behind
   anything: crowns cover 44 % of a closed wood's ground at 450 m, 23 % at 1 km, 6 % at
   2 km, 2 % at 4 km (`ledge_1000_p60`: 15 464 trees standing, each a dark dot;
   `ledge_3000_p60_clear`: 5 222, a dusting of single pixels; `wood_3000_p60`: none to be
   seen).
3. **Crosses** (T). A far tree's two upright pictures seen from above are two lines
   crossed, with the small rosette of the crown in the middle (`wood_300_p60`,
   `wood_1000_p60`: every paler tree is a little cross or star; `ledge_100_p60`).
4. **No tree has a shadow beside it** (T; N within 240 m). On open ground a tree seen
   from above is a green leaf lying on the land (`ledge_100_p60`, `ledge_300_p60`: the
   trees round the yellow hilltop). The far trees are beyond every shadow map.
5. **From 3 km up a wood is a smooth blot** (G). Blurred edges, no grain, one green
   (`wood_3000_p60`, `wood_3000_p20_clear`, `ledge_3000_p60_clear`, `ledge_10000_p60_clear`);
   the land-cover map's pixels show as soft steps along its edge. The trees cannot help
   there: one is under a pixel.
6. **The steppe from above is an even ochre** (G): soft blotches some hundred metres
   across and faint stripes, nothing of grass, a few rocks as dark dots (`steppe_300_p20`,
   `steppe_300_p60`, `steppe_1000_p60`, `steppe_3000_p60`). At 300 m looking down it is
   one flat yellow.
7. **The canopy's crowns are a net of scales** (G): from 300 m the domes are all of a
   size on a lattice that shows (`ledge_300_p60`, lower left; `wood_300_p60`, bottom).
8. **Far trees stand lit inside a shadow and shaded outside it** (T), near a shadow's
   edge: the land's shadow on a tile's trees is read off 20 x 20 points over the tile,
   and over a tile of 7 km that is a point every 370 m (`ledge_300_p60`: pale trees in the
   blue shade). Trees of the lowest ranks belong to the largest tiles at any distance, so
   this is seen near by as well.
9. **Where the far forest ends** (T, then G). At 5.6 km of slant distance, so from 3 km
   up it reaches 4.7 km along the ground and from 5 km up 2.5 km, and above 6 km there is
   none. No line shows in these pictures, but only because the trees are specks out
   there (2): once they are crowns the end will be a ring unless they draw in slowly and
   the ground beyond is their colour and grain.
10. **Trees within 240 m, seen from above, are flat rosettes** (N): `ledge_100_p60`, the
    middle of the picture (274 near trees). Their shadows on the yellow ground are hard to
    find.
11. **Pale rocks on dark ground** (R): from 1 km the far rocks on the wooded slope are
    white dots (`ledge_1000_p20`, right; `ledge_1000_p60`).
12. **From 1.5 to 4.5 km over the opening place one flies in cloud** (not a fault, but it
    hides everything; `ledge_3000_p20`, `ledge_3000_p60`): the pictures from 3 km up are
    therefore taken twice, the second time with `debug=noclouds`, a switch added for this
    (clear sky, no cloud shadows).
13. From 30 and 100 km nothing is wrong that is the trees' (`ledge_30000_*`,
    `ledge_100000_*`): the forest is a dark olive plain; soft blocks of the land-cover map
    show at 30 km looking down.

## What the ground must do (for the owning session)

- **One green.** Inside the far trees' reach the canopy between them should be the
  trees' own green, darker (it is the gaps between crowns), and beyond their reach the
  trees' mean. The far trees' leaf colour, before the light: a species' leaf albedo
  (all of Haven's are near 0.045, 0.085, 0.03; the canopy's base 0.040, 0.078, 0.028 is
  already that) x 0.61, through `paintLeaf` (life/trees.js), x 0.76, then the far olive
  by distance (`farGreen`, exported from `life/farTreeForm.js` on this branch). What
  differs today is the canopy's `mix(vec3(1.0), mapTint, 0.6)` and its own light. **A
  choice for the owning session**: either the canopy drops the map's tint for the trees'
  green, or the trees must take the map's tint (the tile worker would have to read the
  colour map for every tree: not there today). The first is one line in the ground.
- **Grain beyond the trees**: after the fixes the far trees are crown tops 1 to 8 crown
  widths across, a fifth to a third of the ground under them, and draw in to nothing
  between 3.4 and 5.6 km when looked down on. Numbers at the edge are in the report
  (`from-above-report.md`) once the after pictures are in.

## Draw calls and triangles handed over (before)

| view | draw calls | triangles | far trees standing | handed to the GPU | near trees |
| --- | --- | --- | --- | --- | --- |
| ledge_100 (p20 / p60) | 141 / 143 | 1 225 580 / 1 115 002 | 27 050 | 46 220 | 274 |
| ledge_300 | 72 / 74 | 829 702 / 733 962 | 24 239 | 42 703 | 0 |
| ledge_1000 | 61 / 62 | 617 174 / 552 588 | 15 464 | 30 246 | 0 |
| ledge_3000 | 48 / 52 | 374 824 / 415 542 | 5 222 | 15 568 | 0 |
| ledge_3000 clear | 39 / 43 | 323 346 / 364 064 | 5 222 | 15 568 | 0 |
| ledge_10000 clear | 18 / 18 | 178 371 / 231 171 | 0 | 0 | 0 |
| ledge_30000 clear | 18 / 18 | 150 211 / 234 691 | 0 | 0 | 0 |
| ledge_100000 clear | 17 / 17 | 70 415 / 154 895 | 0 | 0 | 0 |
| wood_300 | 63 / 64 | 838 712 / 795 786 | 51 211 | 75 091 | 0 |
| wood_1000 | 61 / 65 | 567 016 / 565 314 | 26 354 | 42 359 | 0 |
| wood_3000 (clear / p60) | 35 / 44 | 324 134 / 386 172 | 7 919 | 15 618 | 0 |
| steppe_300 | 61 / 64 | 354 294 / 311 172 | 604 | 9 691 | 0 |
| steppe_1000 | 54 / 54 | 286 840 / 266 930 | 507 | 9 418 | 0 |
| steppe_3000 (clear / p60) | 38 / 51 | 200 102 / 262 916 | 80 | 6 124 | 0 |

(A far tree is 6 triangles: the trees handed to the GPU x 6 is the far forest's share.)
