# Solar System Explorer

A browser game: fly a suited, cloaked character through the real solar system. Today it
has Mars and the Moon, both built from NASA's public-domain maps, and the flight between
them. On Mars: Coprates Chasma in Valles Marineris, the summit of Olympus Mons, Gale
crater. On the Moon: Hadley Rille where Apollo 15 landed, Tycho, the Apollo 17 valley.
Rendered with three.js on WebGL 2.

**Play it:** https://zubersss.github.io/what-it-s-best-at/ (updates on every push to `main`).

```
npm install
npm run dev -- --host     # then open the printed Network URL on the phone (same Wi-Fi)
npm run build             # static site in dist/ (works from any sub-path, e.g. GitHub Pages)
```

The test device is a Samsung Galaxy S23 Ultra in landscape; desktop with keyboard and
mouse works too. Fullscreen, landscape lock and wake lock need HTTPS or localhost.

The start screen has **Play**, a 3-minute **Benchmark**, a 10-minute **Soak test** and the
mode switch: **Smooth** (60 fps target, default) or **Sharp** (30 fps target, favouring
full resolution). A benchmark plays by itself and ends on a results screen with a Copy
button.

| Touch | Keyboard | |
| --- | --- | --- |
| left stick / drag | `WASD` / mouse | move / look |
| `HERO` | `G` | flying character on / off (on by default) |
| `TARGET` | `T` | aim at the next body in the sky (Earth, Moon, Phobos, Deimos, Sun) |
| `HOVER` | `X` | hover on / off. Off (the default): let go of the stick and gravity pulls you toward the nearest world, or the Sun |
| `FLY` | `F` | walk ↔ free-fly debug camera |
| `ZOOM` (hold) | `Z` (hold), wheel | telephoto |
| `VIEW` | `1`–`9` | places: five views of the world's main site, then its other landmarks (the name appears as you arrive) |
| `HUD` | `H` | HUD: one line → everything plus the time-of-day slider → off |
| `MODE` | `M` | Smooth ↔ Sharp |
| `FULL` | | fullscreen, landscape lock, keep the screen awake |
| `▲` `▼` | `Space`, `Q`/`E` | jump / fly up and down |
| stick at the rim | `Shift` | run / boost |

You fly behind a suited figure with a cloak. Speed grows with distance from the nearest
surface, so the same stick hovers over a rock, climbs to orbit and crosses to another
world in well under a minute: tap `TARGET` until the full HUD shows `moon`, push forward.

Everything else — the project charter, roadmap, architecture, status, asset licences — is
in [`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs/). Reference screenshots:
[`docs/shots/`](docs/shots/).
