# Solar System Explorer — milestone 1

A browser benchmark scene for a space-exploration game set in the real solar system:
Mars, inside Valles Marineris (Coprates Chasma), about 20 minutes before sunset, rendered
with three.js (WebGL 2) on real NASA MOLA elevation data. `?world=moon` loads the Moon
from a data file alone.

```
npm install
npm run dev -- --host     # then open the printed Network URL on the phone (same Wi-Fi)
npm run build             # static site in dist/ (works from any sub-path, e.g. GitHub Pages)
```

The target device is a Samsung Galaxy S23 Ultra; desktop with keyboard and mouse works too.
Fullscreen, landscape lock and wake lock need HTTPS (GitHub Pages) or localhost.

| Touch | Keyboard | |
| --- | --- | --- |
| left stick / drag | `WASD` / mouse | move / look |
| `HERO` | `G` | flying character on / off (on by default) |
| `TARGET` | `T` | aim at the next body in the sky (Earth, Moon, Phobos, Deimos, Sun) |
| `FLY` | `F` | walk ↔ free-fly debug camera |
| `ZOOM` (hold) | `Z` (hold), wheel | telephoto |
| `VIEW` | `1`–`5` | camera bookmarks: ledge, sun, wall, ship, dusk |
| `HUD` | `H` | debug HUD and time-of-day slider |
| `▲` `▼` | `Space`, `Q`/`E` | jump / fly up and down |
| stick at the rim | `Shift` | run / boost |

You fly behind a suited figure with a cloak. Speed grows with distance from the nearest
surface, so the same stick hovers over a rock, climbs to orbit and crosses to another
world in well under a minute: tap `TARGET` until the HUD shows `moon`, push forward.

Everything else — rules, architecture, status, asset licences — is in
[`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs/). Reference screenshots: [`docs/shots/`](docs/shots/).
