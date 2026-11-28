# The heaps seen from the air (2026-11-28)

For a fresh sky session (the session that built the sky's cost table and the mist is done;
its notes are `docs/briefs/sky-faults-report.md`: read the fifth note for the sky's cost, the
eighth for what was ruled out about the grain). Branch: `ccr-6f4f9272-sky-air`, begun from
`origin/ccr-6f4f9272-64jkgl`. Report: `docs/briefs/heaps-from-air-report.md`. One line to
`session_01R5BrhzGbvM5Mm4BP5vZBtE` at each hand-back. Nothing goes to `main` from you: I
merge your branch here.

## The owner's words

"I want the game to look beautiful when you're flying high above" (2026-11-28, the fourth
time it is said of things seen from the air). The trees and the plains are in other hands
(`trees-above.md`, `plains-far.md`). This brief is the sky's share: **the low heaps one
flies beside and over, from 1 to 5 km up**.

## What is wrong today (pictures of the branch's head, `docs/shots/heaps-air/`)

- `before_air3k_noon.png` (`?world=haven&shot=air3k`: 3 km over the opening place at noon,
  heaps beside and below): cotton wool. **One tone** (a pinkish white with faint lilac
  smudges; no lit top against a shade side), **soft edges** all round (no cut outline, no
  bulges), and **a woven grain** over every heap (level rows a few pixels apart).
- `before_opening_3km.png` (`?world=haven&shot=ledge&alt=4513`: the opening hour): the heap
  at the right is **a dull grey-brown blur** with the same weave, where a low Sun should set
  it glowing against the blue.
- `before_air3k_late.png` (`shot=air3k&heading=210&pitch=-4&t=7.5`): for contrast, **the
  upper cloud and the far shell are right**: flat bold shapes, a clean edge, a light tone and
  a shade. The near volume is what falls short of them.

The look aimed at is CLAUDE.md's painted look: few colours, each a pair (the light's and the
shade's), shade that is coloured, bold shapes known by their outline. `sky/cloudLook.js`
already says what a heap's two tones are (SHADE 0.42, LIT 1.0, the lilac tint, the darker
flat underside): the numbers are there and the picture does not show them.

## Name what the picture is made of first

Before tuning anything, find out and write down in the report (with `sky-probe`'s switches
and pictures of the march's own small picture if need be):

1. **Why one tone?** Where does the lit/shade split of `cloudVolume.js` (the look toward the
   Sun, `SUN_LOOK` 280 m) go when a heap is seen from its own height or from above at noon:
   is the split there and averaged away along the line of sight (a march adds up many steps
   of both tones), washed out by the air between, pulled to grey by the exposure (half the
   picture is cloud), or smoothed away by the pass that takes the grain out?
2. **Why soft and grainy?** The march is drawn small (a quarter of the view each way, slices
   by distance) from jittered starts and then smoothed: blur and a weave are what that makes.
   The eighth note rules out the starts' pattern, the slices' spread, the shadows, the edge's
   cut, the other layers; only fewer steps moved it.

## The design to try first (mine to propose, yours to disprove with a picture)

A heap seen from outside is **a surface**, and a march is the wrong tool for a surface: it is
right only inside a cloud and within a few hundred metres of one. So, beyond that:

- **Find the hull, do not add up the haze.** Along the line of sight find where the cloud is
  ENTERED (coarse steps, then a few halvings between the last clear step and the first in
  cloud: `cloudVolume.js` already does this for the anvil). That point is the heap's surface.
- **Shade it as a surface, in two tones with a clean line**: its normal from the density's
  slope there (two or three more readings), the tone by the normal against the Sun and by the
  look toward the Sun through the cloud (hollows and the side turned away take the shade's
  colour; the flat underside the darker one; the sky's light on top of both), the turn
  between the tones short, as on the far shell. No grain can come of it: there are no
  jittered starts to smooth.
- **A cut edge with bulges**: opaque where the line of sight goes a set depth into the cloud,
  thinning only over the last tens of metres at the rim (a line that grazes a heap is a
  wisp); the bulges are the noise's own, read once at the hull.
- **Near and inside, the march stays** (flying into a heap must still be flying into cloud),
  blended in by the DISTANCE FROM THE EYE TO THE HULL, never by where one looks; the far
  shell beyond the volume's reach stays, and the hand-over to it shows no step.
- It should cost LESS than today (a dozen coarse steps and five halvings a pixel where today
  a full march runs). Say what it does by count.

If a picture shows this is wrong, say so with the pair and propose the next thing. What is
not wanted: a fourth round of tuning the march's numbers.

## Rules that bite here (each learnt the hard way; CLAUDE.md has the stories)

- **Nothing about a cloud may hang on where the traveller stands or looks**: one rule for
  the whole line of sight, layers by distance from the eye, the same thing far as near. The
  clouds "moved when I moved" four times.
- **A shader is known only by a picture run**: the build and every Node test passed three
  times on a shader that did not compile or drew nothing. `npm run smoke -- --no-bench` and a
  picture after every shader change. Phones: 16 textures a shader; shaders made while loading
  (`App.precompile`; `scripts/shader-first-use.mjs`).
- **The sky is the dearest thing on the phone** (thirteenth results: 24 ms of a 33 ms frame
  with everything on, at one picture size). Nothing here may add to it. No new pass, no new
  target; the governor's cloud steps (`cloud-steps`, `cloud-far` and the rest: `perf/governor.js`,
  pinned in `scripts/sky-system-test.mjs`) must still thin and never remove; a `debug=` switch
  that puts the old march back and a "what it adds" row for it in the cost test
  (`perf/benchmark.js`), so the phone says what the change bought.
- Nothing leaves the main picture between its clear and its last draw; its depth is never a
  texture; a target that keeps nothing is invalidated when bound.
- The clouds' shadows on the ground (the shade atlas) and the rain must not change.
- A round hour in `?t=` is a special moment (f = 0 between two snapshots): take one picture
  at an odd minute as well. Look at the game with no `sky:` switch in the URL.
- One headless browser at a time; views from the air take 4 to 7 minutes each at
  `--size 880x412 --dsf 1.25`; long runs detached, from a frozen build (`--distdir`).
  `node scripts/sky-probe.mjs` loads a view once and pictures it again with a switch tried
  each time (seconds a switch). **Read your queue between pictures.**
- `./scripts/all-node-checks.sh` before each push; merge `origin/ccr-6f4f9272-64jkgl` before
  each.

## Views (each tried on the branch's head before it was written here)

- `shot=air3k` (noon, among the heaps), `shot=ledge&alt=4513` (the opening hour, a heap at
  the right), `shot=air1k` (1 km over the opening place, a deck's edge overhead and heaps
  ahead): the three to make right.
- Must keep their look: `shot=ledge` (the opening view from the ground: the sky of small
  flat clouds), `shot=storm` (the tower and its anvil), `shot=mist`, `shot=front`.
- Also show: flying INTO a heap (a move in `scripts/stability.mjs` from 600 m outside a heap
  to inside it, three frames a step apart at three stations: nothing pops where the surface
  gives way to the march), and level flight beside one (no crawl on its face).
- With every saving on (`&debug=floor`): each of the three.

## What to hand back

1. **Within the hour**: the answer to "why one tone, why soft and grainy" in five lines, and
   a first before/after pair of `shot=air3k` (`docs/shots/heaps-air/`), pushed.
2. Then the three views before and after, full and floor; the four that must keep their
   look; the two motion strips; the counts (what a pixel of cloud costs before and after:
   steps and texture reads, by `scripts/sky-work.mjs` and the shader's own count if you make
   one); smoke; `HEAPS-AIR-DONE`.
3. After that, with the phone's big benchmark in hand (I send you its sky rows when the owner
   pastes them): the sky's cost, from the fifth note of `sky-faults-report.md` on.

I send your pairs on to the owner, so make them at `--size 880x412 --dsf 1.25`.
