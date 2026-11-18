# Roadmap

The owner's roadmap, in order. Work one milestone at a time, to its checkpoint, following
"How to work on every milestone" in `CLAUDE.md`. "continue" from the owner means: start
the next milestone that is not `done`.

Status values: `not started`, `in progress`, `checkpoint sent` (built, waiting for the
owner's reply or phone results), `done`.

| # | Milestone | Status |
| --- | --- | --- |
| 0 | Foundation: Mars (Coprates Chasma), the Moon, flight between them, the character | done |
| 1 | Phone link and measurement | done (open: Pages switch, governor tuning from the owner's phone results) |
| 2 | Fix the known problems | checkpoint sent |
| 3 | Make Mars and the Moon beautiful | not started |
| 4 | Character and flight feel | not started |
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

Built. Open items that need the owner: switch GitHub Pages on (Settings → Pages →
Source: "GitHub Actions"), then run the benchmark in both modes and the soak test on the
phone and paste the results. The governor's starting level and thresholds are tuned from
those results before milestone 2 starts.

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

## 4. Character and flight feel

- Hover, cruise, fast-flight and banking poses.
- Landing and take-off transitions.
- A target selector with marker, distance and time to arrival.
- A boost for long transfers.
- A camera that keeps the character in view.

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
