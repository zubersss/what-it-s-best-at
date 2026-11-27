# Haven at a steady 30 on the phone (2026-11-27)

The one goal of this project: "the best possible product that a Samsung Galaxy S23 Ultra
can run without lag", and without lag means a steady 30 frames a second in the mode
called Sharp, measured on the phone, never guessed. **It does not hold on Haven today.**
Read first: `CLAUDE.md` in full (most of its lessons are about exactly this: costs paid
every frame whatever is drawn, uploads in the middle of a pass, what a headless browser can
and cannot say, cost tables whose baseline drifts), the top of `docs/PROGRESS.md` (the
eleventh results as read by the last reader), `docs/briefs/phone-speed-report.md` and
`docs/briefs/shadows-governor-10.md` (what was done after earlier results).

## What the phone says

`docs/benchmarks/2026-11-27-haven-42da110-fixed-size.txt`: two runs of the Haven benchmark
on build 42da110 with the picture held at 2.25 MP (so the governor takes no step), phone
upright. `docs/benchmarks/2026-11-27-haven-49e4294.txt`: the run before (governor on,
phone on its side), for comparison.

- **Everything on (run A): Haven 18.1 fps.** The first stop runs at 29; the four after it at
  14 to 17, with nearly half their frames lasting five screen refreshes or more (over
  83 ms) and the other half two: frames alternate between on time and very late. 227 frames
  over 100 ms (93 with no cause named, 77 taking in new terrain).
- **Every saving on (run B, `debug=floor`): Haven 34.8 fps**, the first stop clean, and the
  share of late frames growing stop by stop: 2, 10, 33, 44, 41 %. Even at the floor three
  stops of five are not steady.
- All five stops are views from the same place (bookmarks `ledge`, `sun`, `wall`, `ship`,
  `dusk` of `src/worlds/haven.js`; `sun` and `dusk` are other hours). In both runs the first
  is the best and the later ones worse: the cost grows with the time spent on Haven (what
  streams in after arriving: trees, the far forest, grass, rocks, their shadows; or
  something that piles up), or goes with the hour.
- The page's own work is 7 to 11 ms a frame at those stops: the time is the GPU's, or GL
  calls that make it wait.
- The run before (49e4294, governor on) held `wall` and `dusk` steady at 2.67 MP with
  savings on. Since then: the sky field's fix (the day's true clouds are drawn all the
  time; before, they were absent or thin most of the time: `docs/briefs/sky-faults-report.md`),
  the sculpted character's new vertex shader (`src/hero/heroSculpt.js`: 60 000 vertices,
  up to 21 reads of a float texture each, and a 12 000-vertex copy into the shadow map),
  seasons' first piece (the calendar; `src/life/season.js`).
- What the cost tables say that is large and repeats (nothing else in them can be
  believed; the baseline moves by 30 ms within a table): the cloud volume 7 to 16 ms in
  run B's three views and 8 at the ledge in run A; the ground's shading 17 to 23 ms from
  the air; trees 15 and the shadow maps 8.5 in the forest (run B); a frame with nothing
  drawn at all 31 to 56 ms (that figure includes the measuring).

## The job

1. **Count before you cut.** Nothing headless is a frame rate, but counts are true: write
   `scripts/gl-count.mjs` (the real game from a frozen build, the benchmark's Haven stops
   in order, in play mode): for every frame the draw calls and triangles by pass, the
   passes themselves (each bind of a render target), every texture and buffer upload with
   its bytes and where in the frame it happens (between frames or inside a pass), and the
   instances handed over. Run it on 49e4294 and on today's head. Three questions: what
   differs between the two builds; **what differs between one frame and the next** (the
   alternation: the near shadow map's tiles are drawn in turns, `nearShadow.every`; the
   clouds' shade has a rate; find everything that is done every other frame and how much
   it is); what grows over the first minute on Haven.
2. **Give the phone a way to say more.** The benchmark's per-stop lines
   (`src/perf/benchmark.js`) get the counts that cost nothing to keep (draw calls,
   triangles, uploads and their bytes, passes, by stop), and, if the phone's browser offers
   it (`EXT_disjoint_timer_query_webgl2`; it may not), the GPU's own time by pass. The
   cost test measures savings and parts **in groups** as well as one by one (the sky's,
   the forest's, the shadows', the ground's), each group against a baseline taken just
   before and just after it, so a drifting baseline cannot hide a group.
3. **Cut, biggest first, without changing the picture** (a before/after pair that shows no
   difference, or says what differs and why it is worth it). Yours: the shadow maps (what
   is drawn into which tile how often; the trees' and the character's casters), trees and
   the far forest, grass, the ground's shading (`scripts/ground-cost-run.sh`), the last
   passes, uploads, the character's shader (the nine parts' matrices could be uniforms: no
   texture read for a vertex with no cloth), terrain arriving. **The sky's own passes belong
   to the sky helper** (`ccr-6f4f9272-sky-faults`, who has been asked for the same of the
   clouds): hand it what your counts say about the sky in a line, do not edit `src/sky/`.
4. **Then the governor** (`src/perf/governor.js`, `npm run govsim` before the phone sees
   it): the last reader's notes are in `docs/PROGRESS.md` (a hole the simulation's cases
   miss; nine kinds of change tried). With real costs known, make the savings that buy
   something come first and the ones that buy nothing go.

Targets, in order: run B clean at every stop (under 5 % late); run A's stops at 28 fps or
better at 2.25 MP; then the governor holding 30 at the size it starts a Sharp visit with.
The owner runs the benchmark when asked: ask through the owner's session, once per real
change, saying which link to open (`?bench=haven&scale=0.775`, the same with
`&debug=floor`, or the plain benchmark).

## Rules that bite

- One headless browser at a time; a Haven frame takes this kind of machine seconds: runs
  from a frozen build (`--distdir`), detached, waiting on a log line.
- Find out whether a cost is per item or per frame before spreading it out (uploads paced
  one every other frame once made every other frame late).
- A governor step thins; it never removes what a place is about. Look at `?debug=floor`.
- Phones allow 16 textures a shader; `npm run smoke` checks every program. Nothing leaves
  the main picture between its clear and its last draw.
- Every check must be able to fail. Commit messages end with your own session's
  attribution lines; no model names anywhere else. Nothing is spent. Only this repository.

## How to work with the owner's session

- Your branch: `ccr-6f4f9272-speed`, begun from `origin/ccr-6f4f9272-64jkgl`; push only
  there; merge that branch into yours before every push you announce.
- **First, within two hours: the counts (step 1) and what they say**, at the top of
  `docs/briefs/phone-speed-2-report.md`, pushed, with one line to the owner's session
  (`send_message` to `session_01R5BrhzGbvM5Mm4BP5vZBtE`). Then go on without waiting.
- After each cut: the count before and after, the pictures, the checks passing
  (`./scripts/build-check.sh`, `npm run govsim`, the tests of whatever you touched,
  `npm run smoke` before anything is called done), a push, one line. At the end
  `SPEED-DONE`.
