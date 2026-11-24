# Brief: the air and the bare land seen from above

Read `CLAUDE.md` first (all of it: the lessons on the look from above, on the air and on
patterns tied to the detail texture's tile bite here), then `docs/PROGRESS.md` from the top
to the end of "In hand", then `docs/briefs/haven-rich-critic.md` (an independent critic's
five biggest gaps, from pictures alone; yours are **gap 2** and the land's part of
**gap 3**), and "Radiometry" and "The painted look" in `docs/ARCHITECTURE.md`.

The owner's first demand for this delivery: **"I need it perfect from a distance,
specially when I'm flying high above it."** Two other helpers work on the trees from above
(the near trees: `ccr-aa39490a-trees-refined`; the far forest and the ground's far canopy
and steppe: `ccr-aa39490a-from-above`). Yours is everything else the flier sees: the air
and the bare land.

## What the critic saw (pictures in `docs/shots/from-above/` and the critic's list)

- **Gap 2, the air from above.** From 90 m to 3 km up "an even blue-teal veil lies over
  everything, the ground straight below as much as the horizon, so the land looks as if it
  is under murky water. The shade is a heavy navy, close to blue-black, and covers a third
  to half of each frame." The look asks for shade that is coloured and never black, and for
  the far ground lost in the air layer by layer. 10 km up it is already right (the ground
  below clear, the land paling toward the top). Today `uHaze` (`src/render/look.js`) keeps
  all of the look's thick low air up to 2.5 km and thins it only above.
- **Gap 3, the bare land from above** (yours; the steppe's grass and the forest's edge are
  the from-above helper's, the flowers' drifts the flowers helper's): bare high ground from
  1 to 10 km "smooth pink-cream with salmon blotches, no crisp ridgelines, rock faces,
  gullies or cliff bands, evenly peppered with single dark and pale pixels"; "a straight
  vertical cut through the forest tongue under the plateau" (picture 15, about x 493,
  y 115-170: a seam, find it); "the river between the two lakes is a dashed line of pale
  beads, like a road, and the lake shores have a pale dotted rim"; rocks from 1 km "tiny
  dark-blue triangles that look like flies on the lens".

## The jobs, in this order

1. **Look first.** Take the critic's air pictures again on the current head
   (`scripts/from-above-shots.sh`; the views `ledge_300_p20_phone`, `ledge_300_p60`,
   `ledge_1000_p60`, `ledge_3000_p60_clear`, `wood_1000_p60`, the opening view at 90 m:
   `shot=ledge&alt=1600&pitch=-20`) and say what makes the veil and the navy: the look's
   air numbers, the forest's own air, the shade's colour, the exposure from above. Switch
   the suspect off in one build and look, before changing anything (the lesson on
   guessing causes).
2. **The air from above**: the ground below nearly clear from 100 m to 3 km, the land
   paling only toward the horizon in two or three steps, the shade a light cool violet-blue
   at about two thirds of the light's brightness, never navy. Nothing may change at eye
   height: the opening view, `sun`, `dusk` and the wood at eye height must look as they do
   (pairs; the lesson: a change to a world's air shows most where you are not looking).
   Nothing may hang on the height in a way that shows: blend by height, no step.
3. **The bare land from above**: the seam (a bug: find and fix), the river and lake rims,
   the single-pixel pepper on bare ground (what draws it: `scripts/parts-out.mjs` takes one
   part out at a time), the far rocks seen from above (in clusters with a shadow, or not
   drawn where they can only be a speck: `src/rocks/farRocks.js`), and if time allows
   ridgelines and rock faces from 1 to 10 km (the relief light: "THE GROUND FROM AFAR, 3").
4. The after set: the same views, a pair each; the floor (`debug=floor`) at 300 m; the
   opening view and `dusk` at eye height unchanged; Earth's opening view unchanged.

## Rules that bite

- Files: `src/render/look.js`, `src/render/lightingGlsl.js` (the haze by height only),
  `src/rocks/farRocks.js`, the world's `look` numbers in `src/worlds/haven.js`, and in
  `src/terrain/terrainMaterial.js` **only** the block "THE GROUND FROM AFAR, 3" and the
  water. The blocks "THE GROUND FROM AFAR, 1 and 2" and the helpers above `main` are the
  from-above helper's; the flowers' block the flowers helper's: do not touch them.
- The ground shader reads 16 textures, a phone's limit: none may be added. Every shader
  within a phone's limits (an "OVER" line fails a picture run).
- No world-specific code. One headless browser at a time on your machine. Pictures from the
  air first (a few minutes each); one at eye height costs twenty.
- `./scripts/build-check.sh`, `npm run govsim` and the checks you touch pass before every
  announced push. Anything that adds cost gets a governor step.

## What to hand back

- "L-LOOK pushed <commit>" after job 1, with the cause in two lines.
- Each job as it lands, announced in one line with the commit and the pair.
- A report beside this brief (`air-from-above-report.md`), then "L-DONE pushed <commit>".
- Branch: `ccr-aa39490a-air-above`, begun from `origin/ccr-aa39490a-qiw63x`. Merge it into
  your branch before every announced push, and build. Messages to the owning session with
  `send_message` (its id is in your first message); short, with the commit. Never put a
  model's name in a commit; end commit messages with the two attribution lines your
  session's instructions give.
