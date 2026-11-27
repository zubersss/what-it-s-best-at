# The owner's "jumpy shadows": stability walks before and after (2026-11-25)

Before: `e9d4888` (the phone link). After: `2dd1236` (shadow tiles, shadow trees with its
repair, the flecks' hash remedy, trees round three). `node scripts/stability.mjs --dist
--distdir <build> --only <move> --stations 2`: settled frames one walking step apart.
Each picture: frame 1 and the difference (white changed, red a one-frame flicker), before
above, after below.

| | changed % | flicker % |
|---|---|---|
| wood walk, station 0, before / after | 57.74 / 53.92 | 10.81 / 10.10 |
| wood walk, station 1, before / after | 57.64 / 53.99 | 11.49 / 9.92 |
| treeline, station 0, before / after | 65.22 / 64.44 | 13.18 / 12.73 |
| treeline, station 1, before / after | 44.47 / 44.14 | 10.60 / 10.42 |

The wood walk by band of the picture (changed / flicker %, before -> after):

| | wood behind (top 40 %) | ground, middle distance (40-60 %) | ground near (60-100 %) |
|---|---|---|---|
| station 0 | 38 / 4.9 -> 36 / 4.6 | 63 / 10.0 -> 55 / 9.1 | 76 / 14.8 -> 71 / 12.8 |
| station 1 | 34 / 4.3 -> 30 / 3.2 | 58 / 10.1 -> 49 / 7.9 | 72 / 15.5 -> 71 / 13.0 |

What it shows: every band calms after the fixes, most where the trees' shadows lie on the
ground in the middle distance (changed 63 -> 55 % and 58 -> 49 %, flicker down a fifth).
In the before strips the ground under the wood carries dark shadow shapes that change
between frames; after, that band is quieter. But the walk is dominated by the grass and
the crowns moving in the wind (the near ground changes 71 % of its pixels after as
before), so it cannot single out a shadow jumping as a tree passes 20 m, or flecks
re-shuffling: the numbers say "calmer", not "fixed". The treeline move looks at a wood
240 m off, beyond the near shadow map: equal within noise, it shows nothing about the
shadows either. What would show them: the same walk with the wind stilled and the
grass out (no switch for either yet).
