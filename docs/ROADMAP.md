# Roadmap

The owner's roadmap, in order. Work one milestone at a time, to its checkpoint, following
"How to work on every milestone" in `CLAUDE.md`. "continue" from the owner means: a
milestone at `checkpoint sent` is accepted (mark it `done`), then start the next milestone
that is not `done`.

Status values: `not started`, `in progress`, `checkpoint sent` (built, waiting for the
owner's reply or phone results), `done`.

| # | Milestone | Status |
| --- | --- | --- |
| 0 | Foundation: Mars (Coprates Chasma), the Moon, flight between them, the character | done |
| 1 | Phone link and measurement | done |
| 2 | Fix the known problems | done |
| 3 | Make Mars and the Moon beautiful | done |
| 4 | Character and flight feel | done |
| — | **Benchmark on the phone** (the owner runs it and pastes the results): the gate before anything new is built. After it the charter's limits are lifted (`CLAUDE.md`, "The benchmark gate") | waiting for the owner |
| 5 | Earth and the Sun from space | not started |
| 6 | New landable worlds (checkpoint after every two) | not started |
| 7 | Getting around | not started |
| 8 | Things to do | not started |
| 9 | Earth's surface — **write a plan and ask the owner before starting** | not started |

## 1. Phone link and measurement

- Publish the static build to a public link that updates on every push (GitHub Pages
  through GitHub Actions). Tell the owner exactly what to tap if anything is needed.
- Show the commit hash on the start screen and the HUD.
- Benchmark button: a scripted 3-minute run through every bookmark on Mars, the flight
  from Mars to orbit to the Moon and down, then every lunar bookmark; plus a 10-minute
  soak option.
- Results screen with a Copy results button: average fps, 1 percent low, worst frame ms,
  average and minimum render resolution, governor steps, hitches over 100 ms and their
  cause, GPU string, screen size and pixel ratio, mode, commit hash.
- The governor, and the Smooth and Sharp modes.

Built. Pages is on; the owner ran the benchmark and the soak test in both modes on the
phone, and the governor was tuned from those results (`docs/PROGRESS.md`, "The owner's
first phone results").

## 2. Fix the known problems

- Detail popping as terrain refines.
- No atmospheric glow on the planet's edge from orbit.
- The horizon roll at the Mars to Moon hand-over.
- Slow lunar chunk builds.
- Haze in the shadowed canyon looking sunlit.
- Ledges reading as smooth dunes up close.
- The over-hazed far wall.
- Rigid character limbs and the cloak clipping the arms.
- Phobos and Deimos never checked.

Built (see `docs/PROGRESS.md` for what each fix is and what is left of each problem).
Moved on to milestone 3, because they need its real maps or materials: the far wall's
remaining softness, contact shadows in terrain shade, the two-lobe dust phase function.

## 3. Make Mars and the Moon beautiful

- Real lunar elevation and colour from NASA's public-domain maps, with procedural detail
  below their resolution.
- Both worlds from orbit, with terminator and night side.
- More real landmark bookmarks, as data.
- Ground materials that hold up at walking distance.
- Dust kicked up on landing.

Built (see `docs/PROGRESS.md`). The Moon is now the real one, with its main site at Hadley
Rille and the Apollo 15 landing place; Mars has its real colours; each world has two more
real places with their own elevation (Olympus Mons and Gale; Tycho and the Apollo 17
valley). Left for later milestones, with the reason, in the known-problems table:
anti-aliasing (waits for phone numbers from this build), contact shadows in shade, the
twilight edge and sky colour on Mars, relief shadows along the terminator from far away.

## 4. Character and flight feel

- Hover, cruise, fast-flight and banking poses.
- Landing and take-off transitions.
- A target selector with marker, distance and time to arrival.
- A boost for long transfers.
- A camera that keeps the character in view.

Built (see `docs/PROGRESS.md`). Poses for cruising, boosting, turning, climbing and
coming down; a launch, a landing flare and a three-point landing; a target list of each
world's real places and everything in the sky, with a marker, distance and trip time; GO,
a hands-off trip with its own boost (the ground to another world in about 15 s); a chase
camera; and, from the known problems, a suit with detail, darkening at the foot of the
lander and rocks, and dust that reads as dust. The critic's main gaps were about the
worlds (soft landforms, thick Martian haze, white Earth, flat lunar light): they are in
the known-problems table under milestones 5 to 7.

Reviewed after the checkpoint at the owner's request (two rounds of independent code
reviewers and a picture critic) and its errors fixed: GO now stops and holds above the
target, a real three-point landing, the boots in frame while hovering, dust on every
take-off and landing, a GO button that no longer reshuffles the row, a marker that points
over the horizon (`docs/PROGRESS.md`, "Milestone 4 review"). Done.

## 5. Earth and the Sun from space

Earth as a full globe with public-domain NASA colour, a cloud layer, night-side city
lights, sun-glint on oceans and a thin blue edge. Not landable yet.

## 6. New landable worlds

One at a time, each as a data file with real maps where they exist. Checkpoint after
every two worlds.

- Phobos and Deimos
- Mercury
- Io and Europa, with Jupiter and its moving bands filling the sky
- Saturn with rings, plus Enceladus and Titan
- Venus
- Triton, with Neptune
- Pluto and Charon
- Ceres

## 7. Getting around

Bodies at their real positions for a chosen date, a solar system map, fast travel
between planets with a clear visual effect, time controls.

## 8. Things to do

Photo mode (a single frame at full native resolution), real landmarks to discover with a
journal, progress saved in the browser, procedural audio for suit, wind and ambience.

## 9. Earth's surface

The riskiest part. Write a plan and ask the owner before starting.
