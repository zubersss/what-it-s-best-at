# Brief: Haven from high above: perfect from a distance

Read `CLAUDE.md` first (all of it), then `docs/PROGRESS.md` from the top to the end of
"In hand", then `docs/briefs/far-forest-report.md` and `far-forest-review.md` (how the far
forest is built and what a cold review found), and "The far forest" in
`docs/ARCHITECTURE.md`.

## What the owner said (2026-11-24, after flying build 6ac24ff)

"this was a good job it looks a lot better but I need it perfect from a distance,
specially when I'm flying high above it ..."

The owner flies: up from the meadow, along valleys at a few hundred metres, over ranges
at one to five kilometres, and out to where the world is a ball. Every height on that
way is a view the owner judges.

## The job

**First look, then fix.** Nobody has yet looked at Haven from above since the far forest,
the far grass and the far rocks went in. Take this set on the current build before
changing anything (660 x 309, `shot=ledge` on `world=haven`, the opening place; `alt` is
metres over the sea, the ground there is 1 513 m): heights of 100 m, 300 m, 1 km, 3 km,
10 km, 30 km and 100 km over the ground, each looking down at 20 degrees and at 60
degrees (`pitch=-20`, `pitch=-60`), and the same over the north wood (`lat=22.983&lon=129.507`)
and the steppe (`lat=-54.4271&lon=39.2697`) at 300 m, 1 km and 3 km; a few at the phone's
density (`fov=21.4`). Then the worst case the phone shows: the same with `debug=floor`
at 300 m and 3 km. Write down, picture by picture, **everything that is not perfect**:
lines and rings (where the near trees end at 240 m, where the far forest ends at 5.6 km,
where tiles of trees meet, where the grass's clumps end, where rocks begin), trees that
read as noise, specks or crosses, a forest that changes colour or density at a distance,
anything that would pop or crawl in motion, bare or blurred ground, shadows that end.
Rank them. Push that list with the pictures (`docs/shots/from-above/`, `_before`) and
message the owning session ("A-LOOK pushed <commit>") before fixing: it tells the owning
session what the ground must do.

**Then fix what is the trees' doing**, in `src/life/farForest.js` and beside it. What to
expect, from the design: a far tree is two crossed upright cards and a rosette; looked
down on from high above, upright cards are on edge and show nothing, so a forest thins
or turns to specks exactly when the owner climbs. A tree seen from above is its crown
from above: a round, ragged, shaded top with its shadow beside it. So the far tree needs
a form for the view from above (a level card with the crown's top view from the atlas,
or the rosette grown into one, blended in by how steeply the tree is looked down on,
lit by the same rule), sized so that a closed wood closes from above; and beyond the far
forest's 5.6 km the land must go on wooded without a ring, which is the ground's part
(the owning session's: say exactly what colour, grain and density the trees have at
5.6 km so that the ground can meet them).

## What the phone says (Galaxy S23 Ultra, benchmark of 2026-11-24)

The far forest costs 4.6 ms a frame at the opening view and 10.7 ms in a wood, of
frames that should be 16.8 ms altogether; the phone runs Haven at 31 fps where 60 is the
aim. **Whatever is added for the view from above must not add cost on the ground**: a
card for the top view is drawn only when it is seen from above (and the upright ones
dropped then), instance counts stay within the pool, and the count of triangles handed
over at the opening view and in the wood does not grow. Report triangles handed over and
draw calls at each height of the set, before and after.

## Rules that bite

- Nothing about a tree may hang on where the traveller stands or looks in a way that
  shows: a tree is the same tree from above as from the side, at the same place, the same
  size and colour; forms blend by the angle of view, never switch.
- **Do not edit `src/terrain/terrainMaterial.js`** (the owning session is rewriting it
  for cost); `src/life/treeGeometry.js`, the atlas and `trees.js` belong to another
  helper (branch `ccr-aa39490a-trees-refined`): if the atlas needs a top view of each
  shape, ask that helper through the owning session, or add it in a way that survives
  their remaking of the atlas (say how).
- `node scripts/far-trees-test.mjs` and `node scripts/far-forest-clock.mjs` must still
  pass; add a check for anything new that a number can prove.
- No world-specific code. One headless browser at a time on your machine. Fixed pools.
- Every shader within a phone's limits (an "OVER" line fails a picture run).

## What to hand back

- The list and the before set, early (see above).
- The after set, same views, as they land; a pair at each height where something changed.
- A stability move from the air if time allows (`scripts/stability.mjs`: add
  `haven_climb`, a climb from 100 m to 3 km in steps, or a level flight at 1 km), with
  what it shows and what it cannot.
- A report beside this brief (`from-above-report.md`): the ranked list with what was done
  about each, what is the ground's to do, numbers, behaviour changes for the checkpoint
  message, known problems, most visible first.
- Branch: `ccr-aa39490a-from-above`. Merge `origin/ccr-aa39490a-qiw63x` into it before
  every push that you announce, and build (`./scripts/build-check.sh`). Messages to the
  owning session with `send_message` (its id is in your first message); short, with the
  commit. Never put a model's name in a commit; end commit messages with the two
  attribution lines your session's instructions give.
