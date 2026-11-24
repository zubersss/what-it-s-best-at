# Brief: Haven at 60 on the phone: the ground's shader, the governor's ladder, the character, the cloud volume

Read `CLAUDE.md` first (all of it: most of its lessons are about exactly this), then
`docs/PROGRESS.md` from the top to the end of "In hand", then
`docs/benchmarks/2026-11-24-haven-6ac24ff.txt` (the phone's own numbers, whole), then
"The governor" and "Radiometry" in `docs/ARCHITECTURE.md`.

## Where it stands

The one goal of this game is the best product a Samsung Galaxy S23 Ultra runs **without
lag**. On build 6ac24ff the phone runs Haven at **31 fps in Smooth, where 60 is the
aim**, at the lowest resolution the governor allows (1.60 MP of the screen's 4.45), with
25 to 52 % of frames late at every stop. And the owner has just asked for more of
everything (denser grass, more flowers, finer trees: three other helpers are building
those, each under orders to cost less than today). Your job is to make the room.

The phone's cost test says where a frame goes (ms until drawn, at 2.07 MP; some 20 ms
of every figure is the measuring itself; believe differences of 3 ms and more that make
sense, nothing smaller: the baseline drifted by 15 ms over a test):

- **The ground's shading: 17.4 ms at the opening view, 18.1 from the air** (the ground in
  one flat tone instead: `uPlain`), 3.7 in a wood where trees hide it. No saving of the
  governor touches it. It is the largest single cost wherever the ground shows.
- The grass 11.7 (another helper), near trees 21.2 in a wood (another helper), the far
  forest 4.6 to 10.7 (another helper), the shadow maps 3.3 to 7.3, **the cloud volume 9.4
  from the air** (its `cloud-steps` saving buys nothing there: the cost is not the steps).
- **The character: 2.2 to 3.1 ms of the page's own work at every stop on both worlds**
  (of 7 to 10 ms of page work, in a frame of 16.8). The `cloak` saving buys 0.5 to 1.5.
- The governor tried the first two to four steps of its ladder four times, saw no
  change, and put them back each time: **the first eight or so steps buy nothing on this
  phone** (each under 1 ms), and the ones that buy something (`grass-mid` 5.0, `far-trees`
  3.6, `tree-leaves` 11.5, `trees-far` 7.0, `cloud-steps` 3.4 in a wood, `tree-shadows`
  2.7, `cloud-volume` 9.4 from the air, `far-relief` 3.5, `clouds` 4.0) sit behind them,
  so no trial reaches them.

## The four jobs, in this order

### 1. The ground's fragment shader, several times cheaper, looking the same

`src/terrain/terrainMaterial.js` is yours alone for this delivery (the other helpers are
told not to touch it). It reads 16 textures (a phone's limit: none may be added), and
works out for every pixel things only some pixels show: close-up detail on ground a
kilometre off, flower specks by integer hashes (up to forty a pixel within 900 m), the
grass's waves, strata, the canopy's crowns, water. The aim: **the cost of a pixel falls
steeply with its distance and with what is on it, and the picture does not change**
(within a tolerance you state and show: side-by-side pictures and a difference picture
at the opening view, the steppe, a wood, a rocky slope, the shore, from 300 m, 3 km and
30 km up, and Earth's and Mars's opening views: every world goes through this shader).

How (yours to design; these are the likely wins):
- tiers by distance and by what the place is, as real branches on values that are the
  same over large parts of the screen (distance bands, slope class, under water or not),
  so that a far pixel runs a short path; mind derivatives (`fwidth`, texture footprints)
  inside branches: take them before the branch;
- noise from textures already bound (the detail texture's channels) instead of integer
  hashes worked out per pixel; `flowersAt` on the ground only where a speck is larger
  than a pixel, its mean elsewhere;
- nothing worked out that is then multiplied by zero (a term whose weight is zero at that
  pixel is skipped, not computed);
- cheaper far lighting (the full lighting chunk only where its terms differ);
- the vertex shader too, if a count shows it matters (4 texture reads a vertex).

**Measure it**, or it is guessing: the phone cannot be reached from your machine, so
build a proxy and say what it is worth: `scripts/ground-cost.mjs`, which draws the real
game's ground alone at a fixed size at the views above in the headless browser and
times frames with `uPlain` 1 and 0 (software WebGL runs every instruction of a fragment
on the CPU: its time per pixel follows the count of instructions and texture reads, not a
phone's GPU, but a shader that is three times faster there is very likely a great deal
faster on the phone), plus a static count per tier of texture reads and of noise calls
read off the shader. Report before and after per view. The phone's own verdict comes
from the owner's next benchmark: the `the ground's shading` row.

### 2. The governor's ladder by what a step buys

`src/perf/governor.js`, checked in `npm run govsim` (add cases; a case must fail on the
old ladder). The ladder is "cheapest visual loss first", and its trials end after two to
four steps that cure nothing. Make a trial reach what can help: a step knows whether it
can buy anything where the traveller is (no near trees drawn: the tree steps are not
live; no clumps: `grass-mid` is not; no cloud volume: its steps are not) and the ladder
passes over steps that are not live; the steps the phone has shown to buy 2.5 ms and
more come before the ones it has shown to buy nothing, in order of what is lost to the
eye; steps that buy nothing anywhere on this phone (see the three tables; and the
earlier benchmarks summed up in `docs/PROGRESS.md`, "The owner's ... phone results") go to
the end or out of the ladder, each with a line saying why. Keep the rule that the last
steps leave the scene what it is, and look at `debug=floor` pictures after.

### 3. The character's page work

2.2 to 3.1 ms a frame, every frame, on every world: find it (`node
scripts/play-profile.mjs` prints the page's work by part; the robe and hair are simulated
cloth: `src/character/`), and bring it under 1 ms without a change one can see at the
distance the figure is seen from: fewer points, a fixed step run only as often as the
picture needs, no garbage per frame, no work for a figure that is not drawn. Before and
after from `play-profile`, and the figure's reference poses (`heropose=...`) unchanged.

### 4. The cloud volume from the air

9.4 ms from the air, and its `cloud-steps` saving buys nothing there: find what the cost
is (the size of its target, its passes, a full-screen composite) and cut it where the
picture does not show it; `src/sky/cloudVolume.js`. Read the lessons on the cloud volume
in `CLAUDE.md` first (nothing leaves the main picture between its clear and its last
draw; nothing about a cloud may hang on where the traveller looks).

## Rules that bite

- **The look must not change** as a side effect (the charter's first limit). Where a
  cheaper form does change it, show the pair and say so; the owning session decides.
- Everything a shader writes to the HDR target is pre-multiplied by exposure; lit
  surfaces write alpha 1; GLSL ES 3 reserved words; no backtick in a GLSL comment; the
  build does not compile shaders: only a picture run shows a broken one, and an "OVER"
  line (a phone's limits) fails a picture run.
- Headless frame rates are never reported as performance: your proxy is a count of
  work, said as such.
- One headless browser at a time on your machine.
- Run before every announced push: `./scripts/build-check.sh`, `npm run govsim`,
  `npm run smoke` (Mars: start screen, a benchmark run, every shader within a phone's
  limits), and one picture each of Haven, Earth and Mars.

## What to hand back

- Early (within two hours): the proxy and its "before" numbers, and the first tier of
  the ground's shader with one before/after pair and its numbers; push and message the
  owning session ("S-EARLY pushed <commit>").
- Then each job as it is done, announced with its numbers ("S1 pushed", "S2 pushed", ...).
- A report beside this brief (`phone-speed-report.md`): for each job what was found, what
  was done, numbers before and after, what was tried and taken back, behaviour changes
  for the checkpoint message, known problems, and what to read first in the owner's next
  benchmark.
- Branch: `ccr-aa39490a-phone-speed`. Merge `origin/ccr-aa39490a-qiw63x` into it before
  every push that you announce, and build. Messages to the owning session with
  `send_message` (its id is in your first message); short, with the commit. Never put a
  model's name in a commit; end commit messages with the two attribution lines your
  session's instructions give.
