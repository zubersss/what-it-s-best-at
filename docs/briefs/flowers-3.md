# Brief: flowers of many kinds and sizes together, seen from the side and from the air

Read `CLAUDE.md` first (all of it), then `docs/PROGRESS.md` from the top to the end of "In
hand", then `grass-rich.md` and `grass-rich-report.md` (how the grass and the 26 flowers
were built this delivery; its helper stopped at its model's limit and you take the flowers
over), the grass sections of `haven-rich-review.md` (fixed since), and
`docs/briefs/haven-rich-critic.md`: an independent critic's five biggest gaps, from
pictures alone. Yours is **gap 5**, and the flowers' part of **gap 3**. Then "Grass and
flowers" in `docs/ARCHITECTURE.md`.

The owner, for this delivery: "the flowers should be more diverse and abundant in certain
areas and biomes, different flowers of different sizes that release pollen into the air
that makes it beautiful."

## What the critic saw

- **Gap 5**: "Each place has one kind of flower at one size, spread evenly like confetti,
  and every bloom is a flat sticker turned to face the camera. The opening slope has only a
  yellow, dandelion-like disc with no stem, cup or side view, all at the same even spacing.
  The meadow has only one blue cornflower star ..." (the rest in the critic's file).
- **Gap 3, the flowers' part**: "The flower meadows leave no trace from above except a cloud
  of single-pixel orange and dark specks"; from 1 km a meadow should show "as soft drifts
  of tinted colour (blue, white, yellow), with no single-pixel dots".

The rule today (`grassRules.js`, `flowersAt`) carpets a patch of a hectare with one kind
after another, and some slopes with one kind alone: in any one view that is one kind. It
was meant as "abundant in certain areas"; it reads as monotony.

## The jobs, in this order

1. **Look first**: the opening view (`shot=ledge`), the meadow
   (`lat=-54.39501&lon=38.28479&t=5&heading=45`) at eye height and from 20 m
   (`alt=1488&pitch=-10`), the opening region from 300 m and 1 km looking 60 degrees down
   (`alt=1813&pitch=-60`, `alt=2513&pitch=-60`). Say what a bloom is made of at 2, 8 and
   30 m (is a head a card turned to the eye? how tall is a stem?), and why the air view
   shows specks.
2. **Many kinds together, of different heights**: where the land is a meadow, a dominant
   kind with two or three companions of other habits and sizes (tall spikes and umbels
   standing above cups, turf flowers low between), in clumps and drifts, never even
   confetti; a slope of one colour may stay, but with companions at its edges. Data, by a
   world's own `life.flowers` table, never a world's name. The opening slope's yellow stays
   its leading colour: it is the owner's opening view.
3. **A bloom is a thing in space**: cups as shallow bowls facing up and toward the Sun
   with a stem, seen from the side as a side view, not a disc turned to the eye; spikes
   and umbels on stems that hold up. Detail by distance, steeply; layers of cut-out pixels
   are what this phone pays for, triangles are cheap (the grass's own report has the
   numbers).
4. **From the air**: the ground's dusting (the flowers' block of the ground shader) shows a
   meadow as soft drifts of its colours from 300 m to 2 km, no single-pixel specks; the
   far blades in flower (`grass.js`) the same.
5. The pairs (`docs/shots/flowers-3/`, `_before` and `_after`): those views, the opening view
   at the phone's density (`fov=21.4`), and `debug=floor`; and the counts per view the grass
   report gives (triangles handed over, cut-out layers per pixel: `scripts/overdraw.mjs`,
   `scripts/grass-layers.mjs`).

## Rules that bite

- Files: `src/life/grass.js`, `grassRules.js`, `pollen.js`, the world files' `life.flowers`,
  and in `src/terrain/terrainMaterial.js` **only** the flowers' block (from `vec2 fw =
  ... flowersAt(` to the `gc = mix(gc, petalColour(` line after it). The blocks "THE GROUND
  FROM AFAR" are other helpers'.
- One rule in one place: `grassRules.js` stays the source of the flowers' rule, JavaScript
  and GLSL bit for bit (`node scripts/flower-rule-test.mjs`); the ground, the blades and the
  clumps say the same. Nothing about a flower may hang on where the traveller stands or
  looks: `node scripts/grass-place-test.mjs`, `grass-flowers-pixels-test.mjs`,
  `grass-light-test.mjs`, `grass-anchor-replay.mjs` must pass.
- A change to where or how thick the near blades stand is looked at in the eye-height
  opening view before it is called done. No world-specific code. One headless browser at a
  time on your machine. Every shader within a phone's limits.

## What to hand back

- "F-LOOK pushed <commit>" after job 1 (what a bloom is made of, in a few lines).
- Each job as it lands, announced in one line with the commit and the pair.
- A report beside this brief (`flowers-3-report.md`), then "F-DONE pushed <commit>".
- Branch: `ccr-aa39490a-flowers-3`, begun from `origin/ccr-aa39490a-qiw63x`. Merge it into
  your branch before every announced push, and build. Messages to the owning session with
  `send_message` (its id is in your first message); short, with the commit. Never put a
  model's name in a commit; end commit messages with the two attribution lines your
  session's instructions give.
