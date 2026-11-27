# The mist from close above (2026-11-28)

For the sky helper. Branch: `ccr-6f4f9272-sky-faults`, from `origin/ccr-6f4f9272-64jkgl`
merged in. Add to `docs/briefs/sky-faults-report.md` ("Seventh note").

## The owner's words, with a screenshot of build f9385d7

"The mist and the trees from above still look bad ... I want the game to look beautiful when
you're flying high above." `docs/shots/owner/2026-11-28-trees-mist-f9385d7.jpg`: hovering
some 90 m over the wood on the shore of the mist view's lake at dawn, looking down 28
degrees along the shore; 14 fps, 14 savings on. My copies of the view:
`docs/shots/owner/repro_floor.png` and `repro_full.png`. The view:
`?world=haven&lat=-58.68&lon=26.99&alt=580&heading=185&pitch=-28&t=0.75&hero=1&heropose=hover`
(add `&debug=floor` for what the phone drew). The trees in it are the speed helper's
(`docs/briefs/trees-above.md`); the mist is yours.

## What is wrong in it

1. **A plate.** From 90 m over it the mist is one flat lilac tone to the far shore: no form,
   no light on it, no thinner and thicker places. (From 1.5 km, key 6, it reads as mist; from
   a hundred metres it is a floor.)
2. **A ruler line where it meets the wood.** Every tree standing in it is cut off level at
   its top: crowns sawn through, a hard waterline round the whole shore. Mist has no edge:
   a tree goes paler up to its knees and is gone.
3. **It hides everything at once.** The lake under it, the shore, the trunks: nothing shows
   through, even looking nearly straight down through a few metres of it, where one should
   see the water darkly.

## What is wanted

- **Things in the mist go into it by their own depth under its top**, not by the sheet lying
  over them: every lit thing (ground, water, trees near and far, rocks, grass, the figure)
  takes the mist's colour by how far its point lies under the mist's top there and by how
  much of the line of sight runs through the mist, in the shared air step
  (`src/render/lightingGlsl.js`; the trees and the ground now ask the air at their vertices:
  the mist's share can ride there too). You made this for an eye INSIDE the mist (the veil);
  this is the same law for an eye above it. Then the sheet itself has nothing to hide and no
  edge to show: it is only the mist's lit top.
- **A top with form**: slow billows some tens of metres across, crests lit warm by the low
  Sun, hollows in the coloured shade, drifting with the low wind; thinner over the shore and
  in tongues up the valleys, with holes; nothing repeating in rows (two scales with no common
  period, as the heaps).
- **Looking down through it one sees down**: straight down through 10 m of mist the water
  and the shore show, dimmed; along it, nothing.
- **Cheap.** The owner's phone was at 14 fps here. One term a vertex where a thing has
  vertices to spare, no new pass, no new texture on the ground's shader (it is at 15 of 16),
  a governor step that thins (the billows flatter, never the mist gone). Count it
  (`gl-count`), and give it a "what it adds" row.

## Rules that bite

- Nothing reads the picture's depth, and nothing leaves the main picture between its clear
  and its last draw (the reason a soft edge cannot come from a depth texture).
- Nothing about the mist may hang on where the traveller stands or looks.
- The mist lies on the water's level over lakes, never the bed (your own fix), and data that
  streams in later changes where the water is.
- Look at it in motion: sinking through its top (your move), and flying level 90 m over the
  shore along it: three frames a step apart, nothing popping, no crawl on the billows.
- `./scripts/all-node-checks.sh` before each push; merge `origin/ccr-6f4f9272-64jkgl` first.

## What to hand back

The owner's view before and after (full and `debug=floor`) at `--size 880x412 --dsf 1.25`,
key 6 before and after (it must not lose what it has), the view from the shore inside it,
the counts, the two motion strips; one line to `session_01R5BrhzGbvM5Mm4BP5vZBtE` after the
first pair. The sky's cost job still waits for the phone's table: this goes first.
