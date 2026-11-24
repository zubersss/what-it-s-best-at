# Brief, second round: the refined trees, made right in motion

The first round (`trees-refined.md`, report `trees-refined-report.md`) built the new trees:
a skeleton with bark, finer sprays at 512 texels, blossom and petals. Its session stopped
before it was done (the model it ran on reached its weekly limit), and **you take it over**.
Its branch, `ccr-aa39490a-trees-refined`, is already merged into the owning branch: begin
from `origin/ccr-aa39490a-qiw63x`, push to `ccr-aa39490a-trees-refined`.

Read `CLAUDE.md` first (all of it), then `docs/PROGRESS.md` from the top to the end of "In
hand", then `trees-refined.md`, `trees-refined-report.md`, and in
`haven-rich-review.md` (beside this file) the sections **trees-1 to trees-7** and
**wiring-1, wiring-2** (the same two petal faults, found twice).

## What the review found

A cold review of the delivery (six readers, no browser; each finding checked by a second
reader told to refute it) found seven faults in the trees. All seven held. In short:

1. **trees-1 (high)**: close, near or far is chosen by the distance from where the list
   was made, which can be 25 m behind the eye, and the close radius is now 20 m: no tree is
   sure of its close mesh, every tree crossing a radius changes make in one frame at each
   rebuild, and with `trees-far` on a tree 15 m off can be two crossed cards. This defeats
   the round's own aim (detail for the trees one stands among).
2. **trees-2**: the shadow pass runs the trees' vertex shader with the eye's angle: from
   above, the cards that make a tree's shadow are drawn in, and every tree within some 30 m
   casts a small disc. A shadow is the tree seen from the Sun.
3. **trees-3 / wiring-1**: every rebuild of the lists hides all lying petals and moves the
   falling ones to other trees (`this.abs` and `this.put` are kept and never read).
4. **trees-4**: out of flower (ten months of the year) a flowering tree near by keeps a
   quarter of its foliage, while the far forest draws it full: it changes at 240 m. And
   near and far take wood at different thresholds (0.5 against 0.75).
5. **trees-5 / wiring-2**: lying petals are put on the parent chunk's ground (the
   distance from the planet's centre passed as the distance from the eye).
6. **trees-6**: bark furrows unfiltered, near black, 2 to 9 cm apart: they alias on trunk
   flanks from 15 m.
7. **trees-7**: the bark breaks along a vertical seam on every trunk and limb.

## The jobs, in this order

1. **Prove and fix the seven**, each against the code as it is (the review's line numbers
   are those of b92ace8). Where a number can show a fault, first a check that fails on
   today's code (Node, no browser: as `far-trees-test.mjs` does; break the thing once to
   see the check fail), then the fix. For trees-1 the check is the review's own replay: a
   walker at 1.4 m/s through trees on a grid, the nearest tree not given its close mesh
   and the nearest given cards, at full shapes and at `trees-far`'s fraction.
2. **Bark in motion**: after trees-6 and trees-7, a stability walk through the opening
   wood (`npm run stability`; add a move if no walk passes trunks within 5 to 40 m), the
   flicker report before and after.
3. **The pictures still owed from the first round**, on the fixed trees (into
   `docs/shots/trees-refined/`, `_after2`): the near trees from above (100 m up, looking
   60 degrees down, the opening place) beside the first round's `above_after`; the
   opening view at 300 m up looking across the 240 m line; then a tree from 4 m at the
   phone's density, the wood from inside (the cost view "in the forest"), the blossom tree
   with petals in the air. Wooded pictures at eye height cost some twenty minutes each on
   one of these machines: keep them few, `--timeout 1500`.
4. **The forest view's two numbers** again (triangles handed over and cut-out layers per
   pixel, `scripts/overdraw.mjs --part trees --view "in the forest"`), as in the report.

## Rules that bite

- No world-specific code: species and blossom are data.
- **Do not edit** `src/terrain/terrainMaterial.js`, `src/life/farForest.js`,
  `farTreeForm.js`, `treeLandShade.js` (the from-above helper's, on
  `ccr-aa39490a-from-above`), nor `grass.js`, `pollen.js`, `governor.js` (the owning
  session's). If a fix needs one of them, write what and why to the owning session.
- Do not remove or rename an export another file imports without grepping for it first
  (a removed export broke the joined build once).
- One headless browser at a time on your machine. Every shader within a phone's limits.
- `node scripts/far-trees-test.mjs`, `far-tree-form-test.mjs`, `node scripts/hero-cost.mjs`
  and `./scripts/build-check.sh` pass before every announced push.

## What to hand back

- Each fix as it lands, pushed and announced to the owning session in one line with the
  commit ("T2-1 pushed abc1234: close mesh by the eye's distance; check fails before").
- When all is done, "T2-DONE pushed <commit>" and a section "Second round" at the top of
  `trees-refined-report.md`: finding by finding what was found and done, the checks, the
  numbers, behaviour changes for the checkpoint message, known problems most visible first.
- Merge `origin/ccr-aa39490a-qiw63x` into your branch before every announced push, and
  build. Never put a model's name in a commit; end commit messages with the two
  attribution lines your session's instructions give.
